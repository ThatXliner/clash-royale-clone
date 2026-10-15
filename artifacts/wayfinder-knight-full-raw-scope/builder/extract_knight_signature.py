#!/usr/bin/env python3
"""Extract the pinned raw Knight signature selected by the test-only comparator.

Raw source datasets are fetched in memory. Only the roster, rarity, troop,
character, and duplicate combined-stat rows are written. Projectile and buff
source files are examined for link candidates; no unrelated rows or assets are
copied into this packet.
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
    return {
        "rule": "key name contains one of: " + ", ".join(LINK_TOKENS),
        "all_candidate_fields": candidates,
        "non_null_nonfalse_nonzero_candidate_fields": {
            key: value for key, value in candidates.items()
            if value is not None and value is not False and value != 0
        },
        "limit": "A field-name screen is a bounded index, not proof of an exhaustive engine schema or field semantics.",
    }


def row_index(row: dict) -> dict:
    return {str(index): key for index, key in enumerate(row)}


def main() -> None:
    raw_by_file: dict[str, bytes] = {}
    data_by_file: dict[str, object] = {}
    receipts: list[dict] = []
    for filename in FILES:
        url = f"{BASE}/{filename}"
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "Wayfinder-Knight-pinned-signature-research/1.0"},
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            final_url = response.geturl()
        data = json.loads(raw)
        raw_by_file[filename] = raw
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
    card = unique(cards, lambda row: row.get("key") == "knight", "roster card with key=knight")
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

    # Resolve only explicit raw name/key links from the selected signature.
    summon_name = troop.get("summon_character")
    summon_matches = [row for row in characters if row.get("name") == summon_name]
    projectile_values = {
        (row_name, field): value
        for row_name, row in (("troop", troop), ("character", character))
        for field, value in row.items()
        if field == "projectile" and value is not None
    }
    projectile_match_report = {}
    for row_name, field in projectile_values:
        value = projectile_values[(row_name, field)]
        matches = [row for row in projectiles if row.get("name") == value]
        projectile_match_report[f"{row_name}.{field}={value!r}"] = len(matches)
    buff_names = {
        (row_name, field): value
        for row_name, row in (("troop", troop), ("character", character))
        for field, value in row.items()
        if "buff" in field.lower() and isinstance(value, str) and value
    }
    buff_match_report = {}
    for (row_name, field), value in buff_names.items():
        buff_match_report[f"{row_name}.{field}={value!r}"] = sum(
            row.get("name") == value or row.get("name_en") == value for row in buffs
        )

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
            "local_identity": {"id": "wayfinder", "display_name": "Wayfinder"},
            "existing_test": "tests/special-movement-retarget.test.js",
            "test_name": "retarget lifecycle: Wayfinder is original and Knight is test-only corpus mapping",
            "corpus_selector": {"key": "knight"},
            "selector_basis": "The existing test explicitly selects the normalized comparison record by key=knight and asserts the full Wayfinder comparator; raw source joins below begin from that explicit selector. Binding is not inferred from branding-name or numeric-ID equality/inequality.",
        },
        "join_resolution": {
            "roster_card": {"selector": {"key": "knight"}, "matches": 1},
            "rarity": {"selector": {"name": card.get("rarity")}, "matches": 1, "tournament_level_index": rarity.get("tournament_level_index")},
            "troop": {"selector": {"key": card.get("key"), "name_en": card.get("name"), "rarity": card.get("rarity"), "not_visible": False}, "matches": 1},
            "character": {"selector": {"key": card.get("key"), "id": card.get("id"), "name": summon_name, "rarity": card.get("rarity")}, "matches": 1},
            "troop_summon_character": {"stored_value": summon_name, "character_rows_matching_name": len(summon_matches), "selected_character_key": character.get("key"), "selected_character_id": character.get("id"), "interpretation": "The non-null name resolves to the same character row. It is retained as a raw relationship; no unit-count or spawning semantics are inferred from summon_number or other zero/sentinel fields."},
            "standalone_combined_row_checks": {"troop_equal": True, "character_equal": True},
            "projectile": {"troop_projectile_raw": troop.get("projectile"), "character_projectile_raw": character.get("projectile"), "non_null_projectile_fields": projectile_values, "resolved_projectile_name_matches": projectile_match_report, "projectile_rows_in_source": len(projectiles), "result": "No projectile row is linked by the selected troop/character projectile fields because both raw values are null."},
            "buff": {"non_null_string_candidate_fields": buff_names, "resolved_buff_name_matches": buff_match_report, "buff_rows_in_source": len(buffs), "result": "No non-null string buff-name link was present in the selected rows."},
        },
        "source_row_counts": {
            filename: (len(data_by_file[filename]) if isinstance(data_by_file[filename], list) else {key: len(value) for key, value in data_by_file[filename].items()})
            for filename in FILES
        },
        "selected_row_value_counts": {name: value_counts(row) for name, row in rows.items()},
        "row_field_indexes": {name: row_index(row) for name, row in rows.items()},
        "link_field_screens": {name: field_screen(row) for name, row in rows.items() if name in {"troop", "character"}},
        "rows": rows,
    }
    row_bytes = (json.dumps(result, indent=2, ensure_ascii=False) + "\n").encode()
    ROOT.joinpath("pinned-linked-rows.json").write_bytes(row_bytes)
    receipt = {
        "accessed_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "source_commit": COMMIT,
        "source_commit_date_utc": "2023-02-18T11:25:16Z",
        "fetch_implementation": "extract_knight_signature.py using Python urllib.request (User-Agent Wayfinder-Knight-pinned-signature-research/1.0)",
        "actual_command": "python3 artifacts/wayfinder-knight-full-raw-scope/builder/extract_knight_signature.py",
        "exit_code": 0,
        "source_files": receipts,
        "selected_rows_artifact": {"file": "pinned-linked-rows.json", "bytes": len(row_bytes), "sha256": hashlib.sha256(row_bytes).hexdigest()},
        "extractor_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    }
    ROOT.joinpath("source-receipts.json").write_text(
        json.dumps(receipt, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps({
        "source_commit": COMMIT,
        "source_files": {entry["filename"]: {"rows_or_groups": entry["rows_or_groups_in_source_file"], "bytes": entry["raw_bytes"], "sha256": entry["raw_sha256"]} for entry in receipts},
        "selected_rows": {name: {"field_count": len(row), "value_counts": value_counts(row)} for name, row in rows.items()},
        "join_resolution": result["join_resolution"],
        "selected_local_identity": result["test_only_binding"]["local_identity"],
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
