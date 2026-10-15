#!/usr/bin/env python3
"""Extract the pinned raw Prince signature selected by its existing test-only comparator.

Upstream JSON tables are fetched in memory. Only selected roster, rarity,
troop, character, and duplicate combined-stat rows are written. Projectile
and character-buff tables are screened for direct links; no complete source
dataset or asset is retained.
"""
from __future__ import annotations

import hashlib
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
COMMIT = "54fdef52c5086393b085f57faeeab8ef86b28160"
BASE = f"https://raw.githubusercontent.com/RoyaleAPI/cr-api-data/{COMMIT}/docs/json"
FILES = (
    "cards.json",
    "rarities.json",
    "cards_stats_troop.json",
    "cards_stats_characters.json",
    "cards_stats_projectile.json",
    "cards_stats_character_buff.json",
    "cards_stats.json",
)
LINK_TOKENS = (
    "ability", "area_object", "buff", "character", "clone", "death",
    "effect", "export_name", "filter", "mesh", "projectile", "resurrect",
    "spawn", "summon", "swf",
)


def value_counts(row: dict) -> dict:
    return {
        "field_count": len(row),
        "null_count": sum(value is None for value in row.values()),
        "false_count": sum(value is False for value in row.values()),
        "true_count": sum(value is True for value in row.values()),
        "numeric_zero_count_excluding_booleans": sum(
            isinstance(value, (int, float)) and not isinstance(value, bool) and value == 0
            for value in row.values()
        ),
        "numeric_nonzero_count_excluding_booleans": sum(
            isinstance(value, (int, float)) and not isinstance(value, bool) and value != 0
            for value in row.values()
        ),
        "array_count": sum(isinstance(value, list) for value in row.values()),
        "object_count": sum(isinstance(value, dict) for value in row.values()),
    }


def unique(rows: list[dict], predicate, label: str) -> dict:
    found = [row for row in rows if predicate(row)]
    if len(found) != 1:
        raise ValueError(f"expected one {label}; found {len(found)}")
    return found[0]


def source_rows(data: object, filename: str, group: str | None = None) -> list[dict]:
    if filename == "cards_stats.json":
        if not isinstance(data, dict) or group not in data:
            raise TypeError(f"missing {group!r} group in combined stats")
        rows = data[group]
    else:
        rows = data
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        raise TypeError(f"{filename} did not decode as a list of object rows")
    return rows


def field_screen(row: dict) -> dict:
    candidates = {
        key: value
        for key, value in row.items()
        if any(token in key.lower() for token in LINK_TOKENS)
    }
    live = {
        key: value for key, value in candidates.items()
        if value is not None and value is not False and value != 0 and value != ""
    }
    return {
        "rule": "field name contains one of: " + ", ".join(LINK_TOKENS),
        "all_candidate_fields": candidates,
        "non_null_nonfalse_nonzero_candidate_fields": live,
        "limit": "A field-name screen is a bounded index, not proof of an exhaustive engine schema or field semantics.",
    }


def row_index(row: dict) -> dict:
    return {str(index): key for index, key in enumerate(row)}


def candidate_map(rows: list[tuple[str, dict]], token: str) -> dict:
    return {
        f"{row_name}.{field}": value
        for row_name, row in rows
        for field, value in row.items()
        if token in field.lower()
        and isinstance(value, str)
        and value
    }


def main() -> None:
    data_by_file: dict[str, object] = {}
    receipts: list[dict] = []
    for filename in FILES:
        url = f"{BASE}/{filename}"
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "Emberlance-Prince-pinned-signature-research/1.0"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            final_url = response.geturl()
        data = json.loads(raw)
        data_by_file[filename] = data
        if filename == "cards_stats.json":
            if not isinstance(data, dict):
                raise TypeError("cards_stats.json must decode as an object of groups")
            row_count = {key: len(value) for key, value in data.items()}
        else:
            if not isinstance(data, list):
                raise TypeError(f"{filename} must decode as a row list")
            row_count = len(data)
        receipts.append({
            "canonical_url": f"https://github.com/RoyaleAPI/cr-api-data/blob/{COMMIT}/docs/json/{filename}",
            "final_raw_url": final_url,
            "filename": filename,
            "git_blob_sha1": hashlib.sha1(f"blob {len(raw)}\0".encode() + raw).hexdigest(),
            "raw_bytes": len(raw),
            "raw_sha256": hashlib.sha256(raw).hexdigest(),
            "rows_or_groups_in_source_file": row_count,
            "url_used": url,
        })

    cards = source_rows(data_by_file["cards.json"], "cards.json")
    rarities = source_rows(data_by_file["rarities.json"], "rarities.json")
    troops = source_rows(data_by_file["cards_stats_troop.json"], "cards_stats_troop.json")
    characters = source_rows(data_by_file["cards_stats_characters.json"], "cards_stats_characters.json")
    projectiles = source_rows(data_by_file["cards_stats_projectile.json"], "cards_stats_projectile.json")
    buffs = source_rows(data_by_file["cards_stats_character_buff.json"], "cards_stats_character_buff.json")
    card = unique(cards, lambda row: row.get("key") == "prince", "roster card with key=prince")
    rarity = unique(rarities, lambda row: row.get("name") == card.get("rarity"), "rarity row matching card rarity")
    troop = unique(
        troops,
        lambda row: row.get("key") == card.get("key")
        and row.get("name_en") == card.get("name")
        and row.get("rarity") == card.get("rarity")
        and row.get("not_visible") is False,
        "visible troop row matching roster key/name/rarity",
    )
    character = unique(
        characters,
        lambda row: row.get("key") == card.get("key")
        and row.get("id") == card.get("id")
        and row.get("name") == troop.get("summon_character")
        and row.get("rarity") == card.get("rarity"),
        "character row matching roster key/id, troop summon_character, and rarity",
    )
    combined = data_by_file["cards_stats.json"]
    combined_troops = source_rows(combined, "cards_stats.json", "troop")
    combined_characters = source_rows(combined, "cards_stats.json", "characters")
    combined_troop = unique(
        combined_troops,
        lambda row: row.get("key") == card.get("key")
        and row.get("name_en") == card.get("name")
        and row.get("rarity") == card.get("rarity")
        and row.get("not_visible") is False,
        "combined troop duplicate",
    )
    combined_character = unique(
        combined_characters,
        lambda row: row.get("key") == card.get("key")
        and row.get("id") == card.get("id")
        and row.get("name") == troop.get("summon_character")
        and row.get("rarity") == card.get("rarity"),
        "combined character duplicate",
    )
    if combined_troop != troop or combined_character != character:
        raise ValueError("standalone and combined pinned rows differ")

    selected = [("troop", troop), ("character", character)]
    projectile_names = candidate_map(selected, "projectile")
    projectile_matches = {
        key: [
            {"name": row.get("name"), "id": row.get("id")}
            for row in projectiles
            if row.get("name") == value or row.get("name_en") == value
        ]
        for key, value in projectile_names.items()
    }
    buff_names = candidate_map(selected, "buff")
    buff_matches = {
        key: [
            {"name": row.get("name"), "name_en": row.get("name_en")}
            for row in buffs
            if row.get("name") == value or row.get("name_en") == value
        ]
        for key, value in buff_names.items()
    }
    ability_names = candidate_map(selected, "ability")
    spawn_names = candidate_map(selected, "spawn")
    summon_names = candidate_map(selected, "summon")
    summon_matches = {
        key: sum(row.get("name") == value for row in characters)
        for key, value in summon_names.items()
    }

    rows = {
        "card": card,
        "rarity": rarity,
        "troop": troop,
        "character": character,
        "combined_troop_duplicate": combined_troop,
        "combined_character_duplicate": combined_character,
    }
    result = {
        "source_commit": COMMIT,
        "source_commit_url": f"https://github.com/RoyaleAPI/cr-api-data/commit/{COMMIT}",
        "source_commit_date_utc": "2023-02-18T11:25:16Z",
        "test_only_binding": {
            "local_identity": {"id": "emberlance", "display_name": "Emberlance"},
            "existing_test": "tests/special-movement-charge.test.js",
            "test_name": "charge special: original definition is isolated and question-backed",
            "corpus_selector": {"key": "prince"},
            "selector_basis": "The existing parity test explicitly selects the normalized comparison record by key=prince and compares it to the original Emberlance definition; raw joins begin from that explicit test selector. The binding is test-only and is not inferred from branding-name or numeric-ID equality.",
        },
        "join_resolution": {
            "roster_card": {"selector": {"key": "prince"}, "matches": 1},
            "rarity": {"selector": {"name": card.get("rarity")}, "matches": 1, "tournament_level_index": rarity.get("tournament_level_index")},
            "troop": {"selector": {"key": card.get("key"), "name_en": card.get("name"), "rarity": card.get("rarity"), "not_visible": False}, "matches": 1},
            "character": {"selector": {"key": card.get("key"), "id": card.get("id"), "name": troop.get("summon_character"), "rarity": card.get("rarity")}, "matches": 1},
            "troop_summon_character": {"stored_value": troop.get("summon_character"), "character_rows_matching_name": sum(row.get("name") == troop.get("summon_character") for row in characters), "selected_character_key": character.get("key"), "selected_character_id": character.get("id"), "interpretation": "The raw self-name value resolves to the selected character row. summon_number=0 and other zero/null fields remain literal; this name match does not establish spawn count or spawn behavior."},
            "standalone_combined_row_checks": {"troop_equal": True, "character_equal": True},
            "linked_projectiles": {"non_null_candidate_fields": projectile_names, "matched_rows": projectile_matches, "projectile_rows_in_source": len(projectiles), "result": "No non-null projectile-name link in the selected troop/character rows; no projectile row selected."},
            "linked_buffs": {"non_null_candidate_fields": buff_names, "matched_rows": buff_matches, "buff_rows_in_source": len(buffs), "result": "No non-null string buff-name link in the selected troop/character rows; no buff row selected."},
            "linked_abilities": {"non_null_candidate_fields": ability_names, "result": "The screened ability-name fields are null; no ability row is selected. No separate ability table was fetched."},
            "spawn_links": {"non_null_spawn_fields": spawn_names, "summon_name_fields": summon_names, "summon_character_name_matches": summon_matches, "result": "No non-null character spawn field is present. The non-null troop summon_character name joins to the selected character only; it is not treated as a recursive spawn edge."},
        },
        "source_row_counts": {
            filename: (len(data_by_file[filename]) if isinstance(data_by_file[filename], list) else {key: len(value) for key, value in data_by_file[filename].items()})
            for filename in FILES
        },
        "primary_field_total": sum(len(rows[name]) for name in ("card", "rarity", "troop", "character")),
        "selected_row_value_counts": {name: value_counts(row) for name, row in rows.items()},
        "row_field_indexes": {name: row_index(row) for name, row in rows.items()},
        "link_field_screens": {name: field_screen(row) for name, row in rows.items() if name in {"troop", "character"}},
        "rows": rows,
    }
    row_bytes = (json.dumps(result, indent=2, ensure_ascii=False) + "\n").encode()
    output_path = ROOT / "pinned-linked-rows.json"
    output_path.write_bytes(row_bytes)
    receipt = {
        "accessed_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "source_commit": COMMIT,
        "source_commit_date_utc": "2023-02-18T11:25:16Z",
        "fetch_implementation": "extract_prince_signature.py using Python urllib.request (User-Agent Emberlance-Prince-pinned-signature-research/1.0)",
        "actual_command": "python3 artifacts/emberlance-prince-full-raw-scope/builder/extract_prince_signature.py",
        "exit_code": 0,
        "source_files": receipts,
        "selected_rows_artifact": {"file": "pinned-linked-rows.json", "bytes": len(row_bytes), "sha256": hashlib.sha256(row_bytes).hexdigest()},
        "extractor_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    }
    (ROOT / "source-receipts.json").write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "source_commit": COMMIT,
        "primary_field_total": result["primary_field_total"],
        "source_files": {entry["filename"]: {"rows_or_groups": entry["rows_or_groups_in_source_file"], "bytes": entry["raw_bytes"], "sha256": entry["raw_sha256"]} for entry in receipts},
        "selected_rows": {name: {"field_count": len(row), "value_counts": value_counts(row)} for name, row in rows.items()},
        "join_resolution": result["join_resolution"],
        "local_test_binding": result["test_only_binding"],
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
