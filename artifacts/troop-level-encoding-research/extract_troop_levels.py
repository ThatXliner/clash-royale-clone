"""Extract pinned rarity-level arrays and representative troop rows.

This writes comparison-only evidence. It does not update reference tables or
runtime data.
"""

import hashlib
import json
from pathlib import Path
from urllib.request import urlopen


COMMIT = "54fdef52c5086393b085f57faeeab8ef86b28160"
BASE_URL = f"https://raw.githubusercontent.com/RoyaleAPI/cr-api-data/{COMMIT}/docs/json/"
FILES = (
    "rarities.json",
    "cards.json",
    "cards_stats_troop.json",
    "cards_stats_characters.json",
    "cards_stats_building.json",
    "cards_stats_spell.json",
    "cards_stats_projectile.json",
)
SAMPLES = ("Knight", "Dart Goblin", "Skeleton Army", "Princess", "Archer Queen")
ARRAY_FIELDS = ("hitpoints_per_level", "damage_per_level")
OFFSET_CHECKS = (
    ("cards_stats_characters.json", "Witch", "spawn_character", "spawn_character_level_index"),
    ("cards_stats_building.json", "Tombstone", "spawn_character", "spawn_character_level_index"),
    ("cards_stats_spell.json", "SkeletonKingGraveyard", "spawn_character", "spawn_character_level_index"),
)


def fetch(filename):
    url = BASE_URL + filename
    with urlopen(url, timeout=30) as response:
        raw = response.read()
    return raw, json.loads(raw)


def unique(rows, predicate, label):
    matches = [row for row in rows if predicate(row)]
    if len(matches) != 1:
        raise ValueError(f"expected one {label}, found {len(matches)}")
    return matches[0]


def at(array, index):
    if array is None or index < 0 or index >= len(array):
        return None
    return array[index]


def arrays(row):
    return {field: row.get(field) for field in ARRAY_FIELDS}


def extract_offset_checks(source, rarity_rows):
    results = []
    for filename, row_name, child_field, offset_field in OFFSET_CHECKS:
        parent = unique(
            source[filename], lambda row, row_name=row_name: row.get("name") == row_name,
            f"offset-check parent {row_name}",
        )
        child_name = parent[child_field]
        child = unique(
            source["cards_stats_characters.json"],
            lambda row, child_name=child_name: row["name"] == child_name,
            f"offset-check character {child_name}",
        )
        parent_index = rarity_rows[parent["rarity"]]["tournament_level_index"]
        offset = parent.get(offset_field, 0)
        candidate_index = parent_index + offset
        child_index = rarity_rows[child["rarity"]]["tournament_level_index"]
        results.append({
            "source_file": filename,
            "parent": parent["name"],
            "parent_rarity": parent["rarity"],
            "parent_tournament_level_index": parent_index,
            "child_field": child_field,
            "child": child["name"],
            "child_rarity": child["rarity"],
            "explicit_level_offset_field": offset_field,
            "explicit_level_offset": offset,
            "parent_index_plus_offset_candidate": candidate_index,
            "child_rarity_tournament_level_index": child_index,
            "candidate_matches_child_rarity_index": candidate_index == child_index,
            "child_hitpoints_at_candidate": at(child.get("hitpoints_per_level"), candidate_index),
            "child_damage_at_candidate": at(child.get("damage_per_level"), candidate_index),
        })
    return results


def main():
    source = {}
    hashes = {}
    for filename in FILES:
        raw, rows = fetch(filename)
        source[filename] = rows
        hashes[filename] = {
            "url": BASE_URL + filename,
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
        }

    rarity_rows = {row["name"]: row for row in source["rarities.json"]}
    rarity_evidence = {
        rarity: {
            key: rarity_rows[rarity][key]
            for key in ("level_count", "relative_level", "tournament_level_index")
        }
        for rarity in ("Common", "Rare", "Epic", "Legendary", "Champion")
    }

    local_cards_path = Path(__file__).parents[2] / "reference/stats/cards.json"
    local_cards_raw = local_cards_path.read_bytes()
    local_cards = json.loads(local_cards_raw)
    local_by_name = {card["name"]: card for card in local_cards["cards"]}

    records = []
    for sample in SAMPLES:
        card = unique(source["cards.json"], lambda row: row["name"] == sample, f"card {sample}")
        troop = unique(
            source["cards_stats_troop.json"],
            lambda row: row.get("key") == card["key"],
            f"troop card {sample}",
        )
        character_name = troop.get("summon_character") or card["sc_key"]
        character = unique(
            source["cards_stats_characters.json"],
            lambda row: row["name"] == character_name,
            f"character {character_name} for {sample}",
        )
        card_rarity = card["rarity"]
        character_rarity = character["rarity"]
        card_index = rarity_rows[card_rarity]["tournament_level_index"]
        character_index = rarity_rows[character_rarity]["tournament_level_index"]
        summon_offset = troop.get("summon_character_level_index", 0)
        summon_index_candidate = card_index + summon_offset

        projectile_names = []
        for field in ("projectile", "projectile_special", "custom_first_projectile"):
            value = character.get(field)
            if value and value not in projectile_names:
                projectile_names.append(value)
        projectiles = []
        for name in projectile_names:
            projectile = unique(
                source["cards_stats_projectile.json"],
                lambda row, name=name: row["name"] == name,
                f"projectile {name} for {sample}",
            )
            projectiles.append({
                "name": projectile["name"],
                "rarity": projectile.get("rarity"),
                "damage": projectile.get("damage"),
                **arrays(projectile),
                "damage_at_card_rarity_tournament_index": at(
                    projectile.get("damage_per_level"), card_index
                ),
                "damage_at_projectile_rarity_tournament_index": at(
                    projectile.get("damage_per_level"),
                    rarity_rows[projectile.get("rarity", "")].get("tournament_level_index", -1),
                ) if projectile.get("rarity") in rarity_rows else None,
            })

        local = local_by_name[sample]
        records.append({
            "name": sample,
            "card": {
                "key": card["key"],
                "sc_key": card["sc_key"],
                "rarity": card_rarity,
                "id": card["id"],
            },
            "card_troop_row": {
                "rarity": troop.get("rarity"),
                "summon_character": troop.get("summon_character"),
                "summon_number": troop.get("summon_number"),
                "summon_character_level_index": summon_offset,
            },
            "character": {
                "name": character["name"],
                "rarity": character_rarity,
                "hitpoints": character.get("hitpoints"),
                "damage": character.get("damage"),
                **arrays(character),
                "hitpoints_at_card_rarity_tournament_index": at(
                    character.get("hitpoints_per_level"), card_index
                ),
                "damage_at_card_rarity_tournament_index": at(
                    character.get("damage_per_level"), card_index
                ),
                "hitpoints_at_character_rarity_tournament_index": at(
                    character.get("hitpoints_per_level"), character_index
                ),
                "damage_at_character_rarity_tournament_index": at(
                    character.get("damage_per_level"), character_index
                ),
                "summon_index_candidate_card_index_plus_explicit_field": summon_index_candidate,
                "hitpoints_at_summon_index_candidate": at(
                    character.get("hitpoints_per_level"), summon_index_candidate
                ),
                "damage_at_summon_index_candidate": at(
                    character.get("damage_per_level"), summon_index_candidate
                ),
                "projectile_names": projectile_names,
            },
            "projectiles": projectiles,
            "existing_normalized_row": {
                "rarity": local["rarity"],
                "tournament_level": local["tournament_level"],
                "hitpoints": local["hitpoints"],
                "damage": local["damage"],
                "count": local["count"],
                "unverified_fields": local["unverified_fields"],
            },
        })

    result = {
        "version": 1,
        "source_repository": "RoyaleAPI/cr-api-data",
        "source_commit": COMMIT,
        "source_snapshot_date": "2023-02-18",
        "accessed": "2026-10-13",
        "interpretation": "Pinned raw evidence and candidate index lookups only; this receipt does not certify per-card gameplay stats.",
        "source_files": hashes,
        "rarity_index_fields": rarity_evidence,
        "offset_cross_checks": extract_offset_checks(source, rarity_rows),
        "offset_cross_check_limit": "Index arithmetic is an internal consistency check, not independent confirmation of game-engine field semantics.",
        "normalized_table": {
            "path": "reference/stats/cards.json",
            "sha256": hashlib.sha256(local_cards_raw).hexdigest(),
        },
        "records": records,
    }
    output = Path(__file__).with_name("troop-level-extract.json")
    output.write_text(json.dumps(result, indent=2) + "\n")
    print(f"wrote {len(records)} records; " + ", ".join(
        f"{name}={entry['sha256']}" for name, entry in hashes.items()
    ))


if __name__ == "__main__":
    main()
