#!/usr/bin/env python3
"""Extract the complete pinned Valkyrie comparison signature, read only."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent
COMMIT = "54fdef52c5086393b085f57faeeab8ef86b28160"
COMMIT_DATE_UTC = "2023-02-18T11:25:16Z"
BASE = f"https://raw.githubusercontent.com/RoyaleAPI/cr-api-data/{COMMIT}/docs/json"
CARD_ID = 26000011
CARD_KEY = "valkyrie"

SOURCES = {
    "cards.json": {
        "blob_sha": "9a26927d54fbf358138e10d2f5bb5519e6f8602e",
        "expected_sha256": "312574f75ada2ff5ad605e1eb122c3b620d1163c5a675d67cd9e64122b3d6946",
    },
    "cards_stats_troop.json": {
        "blob_sha": "2fc9257051c37521f0ca2ad4a1931686ef94842b",
        "expected_sha256": "a6e044cb510ec280dacfd54e546558276e5f40d50fbd16f47f3ff16126add33a",
    },
    "cards_stats_characters.json": {
        "blob_sha": "a86a93da5b27a27ae891cfa3c67b13b7f3b2080e",
        "expected_sha256": "37734d1508584e43851395c01b2d10046667eb6dc27daef37e5df56e74f933ac",
    },
    "cards_stats_projectile.json": {
        "blob_sha": "091987427e84379a4c1d0ebacc1ce1fecd2d0364",
        "expected_sha256": "c883516f54f6c17ee77c15cf484b01da9ded22602214c3b0d42b1ab823bd3197",
    },
    "cards_stats_character_buff.json": {
        "blob_sha": "68ce48cb8a2087f48f2d24d4a8a36cc210fd2e62",
        "expected_sha256": "20da44c09a3e51c06b97291530f6b8fee909c57d2b5c7a7c64adf1721e0999f0",
    },
    "cards_stats.json": {
        "blob_sha": "0098d94065703fdb81a7ee98255ce5652c358b5e",
        "expected_sha256": None,
    },
}

LINK_TERMS = (
    "ability",
    "buff",
    "character",
    "charge",
    "dash",
    "death",
    "jump",
    "morph",
    "passive",
    "projectile",
    "spawn",
)


def fetch(name: str) -> tuple[bytes, object]:
    with urlopen(f"{BASE}/{name}", timeout=30) as response:
        body = response.read()
    return body, json.loads(body)


def matches(rows: list[dict], predicate) -> list[dict]:
    return [row for row in rows if predicate(row)]


def linkish_fields(row: dict) -> dict:
    return {
        key: value
        for key, value in row.items()
        if any(term in key.lower() for term in LINK_TERMS)
    }


def nondefault(value: object) -> bool:
    return value is not None and value is not False and value != 0 and value != "" and value != [] and value != {}


def main() -> None:
    bodies: dict[str, bytes] = {}
    parsed: dict[str, object] = {}
    source_receipts = {}
    for name, metadata in SOURCES.items():
        body, value = fetch(name)
        digest = hashlib.sha256(body).hexdigest()
        expected = metadata["expected_sha256"]
        if expected and digest != expected:
            raise SystemExit(f"Pinned SHA-256 mismatch for {name}: {digest}")
        bodies[name] = body
        parsed[name] = value
        source_receipts[name] = {
            "url": f"{BASE}/{name}",
            "blob_sha": metadata["blob_sha"],
            "raw_bytes": len(body),
            "raw_sha256": digest,
            "row_count": sum(len(value) for value in value.values()) if isinstance(value, dict) else len(value),
        }

    cards = parsed["cards.json"]
    troops = parsed["cards_stats_troop.json"]
    characters = parsed["cards_stats_characters.json"]
    projectiles = parsed["cards_stats_projectile.json"]
    buffs = parsed["cards_stats_character_buff.json"]
    combined = parsed["cards_stats.json"]

    card_matches = matches(cards, lambda row: row.get("id") == CARD_ID)
    if len(card_matches) != 1:
        raise SystemExit(f"Expected one card id match, got {len(card_matches)}")
    card = card_matches[0]

    troop_key_matches = matches(troops, lambda row: row.get("key") == card.get("key"))
    troop_name_matches = matches(troops, lambda row: row.get("name") == card.get("name"))
    if len(troop_key_matches) != 1 or troop_key_matches != troop_name_matches:
        raise SystemExit("Troop join by key and name is not unique and concordant")
    troop = troop_key_matches[0]

    summon_name = troop.get("summon_character")
    character_matches = matches(
        characters,
        lambda row: row.get("name") == summon_name
        and row.get("key") == card.get("key")
        and row.get("id") == CARD_ID,
    )
    if len(character_matches) != 1:
        raise SystemExit(f"Expected one summoned character join, got {len(character_matches)}")
    character = character_matches[0]
    character_self_matches = matches(
        characters,
        lambda row: row.get("name") == character.get("summon_character")
        and row.get("key") == card.get("key")
        and row.get("id") == CARD_ID,
    )
    if len(character_self_matches) != 1:
        raise SystemExit("Character row summon_character does not resolve uniquely to this row")

    combined_troops = combined.get("troop", [])
    combined_characters = combined.get("characters", [])
    troop_aggregate = matches(combined_troops, lambda row: row.get("key") == card.get("key"))
    character_aggregate = matches(combined_characters, lambda row: row.get("id") == CARD_ID)
    if troop_aggregate != [troop] or character_aggregate != [character]:
        raise SystemExit("Standalone and combined cards_stats rows do not match")

    reference_rows = {
        "cards": card,
        "troop": troop,
        "character": character,
    }
    linked_rows = {
        "card_to_troop": {
            "method": "troop.key == card.key; independently checked troop.name == card.name",
            "match_count": len(troop_key_matches),
            "target": "troop",
        },
        "troop_to_character": {
            "method": "character.name == troop.summon_character, character.key == card.key, character.id == card.id",
            "raw_value": summon_name,
            "match_count": len(character_matches),
            "target": "character",
        },
        "character_row_summon_character": {
            "method": "character.name == character.summon_character, character.key == card.key, character.id == card.id",
            "raw_value": character.get("summon_character"),
            "match_count": len(character_self_matches),
            "target": "same character row",
        },
        "other_mechanical_links": [],
    }

    # The row values are the first link graph. Keep every relationship-like field,
    # including zero/false values, so no null/zero is silently promoted to absence.
    link_fields = {name: linkish_fields(row) for name, row in reference_rows.items()}
    pointer_candidates = []
    for row_name, fields in link_fields.items():
        for field, value in fields.items():
            if isinstance(value, str) and value and field not in (
                "key", "name", "name_en", "sc_key", "summon_character"
            ):
                pointer_candidates.append({"row": row_name, "field": field, "value": value})

    # Check all non-null/non-zero explicit links against the pinned projectile and
    # buff tables. In this signature none are present; preserve this as a query result.
    projectiles_by_name = {row.get("name"): row for row in projectiles}
    buffs_by_name = {row.get("name"): row for row in buffs}
    resolved_secondary = []
    unresolved_secondary = []
    for item in pointer_candidates:
        target = item["value"]
        if "character" in item["field"].lower():
            target_matches = matches(
                characters,
                lambda row: row.get("name") == target or row.get("key") == target,
            )
            if target_matches:
                resolved_secondary.append(
                    {
                        **item,
                        "dataset": "cards_stats_characters.json",
                        "match_count": len(target_matches),
                        "matched_ids": [row.get("id") for row in target_matches],
                    }
                )
            else:
                unresolved_secondary.append(item)
        elif isinstance(target, str) and target in projectiles_by_name:
            resolved_secondary.append({**item, "dataset": "cards_stats_projectile.json"})
        elif isinstance(target, str) and target in buffs_by_name:
            resolved_secondary.append({**item, "dataset": "cards_stats_character_buff.json"})
        else:
            unresolved_secondary.append(item)
    linked_rows["other_mechanical_links"] = resolved_secondary + unresolved_secondary

    stats_groups = {key: len(value) for key, value in combined.items()}
    extraction = {
        "scope": {
            "comparison_only": True,
            "card_id": CARD_ID,
            "card_key": CARD_KEY,
            "source_repository": "https://github.com/RoyaleAPI/cr-api-data",
            "commit": COMMIT,
            "commit_date_utc": COMMIT_DATE_UTC,
        },
        "sources": source_receipts,
        "source_table_counts": stats_groups,
        "row_field_counts": {name: len(row) for name, row in reference_rows.items()},
        "link_resolution": linked_rows,
        "relationship_like_fields": link_fields,
        "nondefault_raw_fields": {
            name: {key: value for key, value in row.items() if nondefault(value)}
            for name, row in reference_rows.items()
        },
        "rows": reference_rows,
    }
    output = ROOT / "pinned-linked-rows.json"
    output.write_text(json.dumps(extraction, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {output}")
    print(f"source commit={COMMIT} date={COMMIT_DATE_UTC}")
    print(f"rows card/troop/character={len(card)}/{len(troop)}/{len(character)} fields")
    print(f"links card/troop/character=1/1/1; extra rows={len(linked_rows['other_mechanical_links'])}")
    for name, receipt in source_receipts.items():
        print(f"{name}: rows={receipt['row_count']} bytes={receipt['raw_bytes']} sha256={receipt['raw_sha256']}")


if __name__ == "__main__":
    main()
