#!/usr/bin/env python3
"""Fetch and extract the pinned Aether Well comparison signature.

Only the selected card/building rows and any linked rows are written. Raw
upstream datasets are held in memory and are not copied into the repository.
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
SOURCES = {
    "cards.json": f"{BASE}/cards.json",
    "cards_stats_building.json": f"{BASE}/cards_stats_building.json",
}
CARD_KEY = "elixir-collector"
LINK_NAME_TOKENS = (
    "ability", "area_object", "buff", "character", "clone", "effect",
    "export_name", "filter", "mesh", "projectile", "resurrect", "swf",
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
    }


def link_candidates(row: dict) -> dict:
    candidates = {
        key: value
        for key, value in row.items()
        if any(token in key.lower() for token in LINK_NAME_TOKENS)
    }
    unresolved_or_nonrow = {
        key: value for key, value in candidates.items()
        if value is not None and value is not False and value != 0
    }
    return {
        "screening_rule": "field name contains one of: " + ", ".join(LINK_NAME_TOKENS),
        "all_candidate_fields": candidates,
        "non_null_nonfalse_nonzero_candidate_values": unresolved_or_nonrow,
        "resolution": (
            "No non-null candidate resolves to another selected JSON stats row. "
            "The three non-null prestige_* values are asset path/export-name references; "
            "they are recorded but no assets or asset datasets were fetched."
        ),
    }


def fetch_json(filename: str, url: str) -> tuple[list[dict], dict]:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "AetherWell-pinned-signature-research/1.0"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read()
        final_url = response.geturl()
    dataset = json.loads(raw)
    if not isinstance(dataset, list) or not all(isinstance(row, dict) for row in dataset):
        raise TypeError(f"{filename} did not decode as a list of object rows")
    receipt = {
        "canonical_url": (
            f"https://github.com/RoyaleAPI/cr-api-data/blob/{COMMIT}/docs/json/{filename}"
        ),
        "final_raw_url": final_url,
        "filename": filename,
        "git_blob_sha1": hashlib.sha1(
            f"blob {len(raw)}\0".encode() + raw
        ).hexdigest(),
        "raw_bytes": len(raw),
        "raw_sha256": hashlib.sha256(raw).hexdigest(),
        "rows_in_source_file": len(dataset),
        "url_used": url,
    }
    return dataset, receipt


def unique(rows: list[dict], predicate, label: str) -> dict:
    matches = [row for row in rows if predicate(row)]
    if len(matches) != 1:
        raise ValueError(f"expected one {label}; found {len(matches)}")
    return matches[0]


def main() -> None:
    downloaded: dict[str, list[dict]] = {}
    receipts: list[dict] = []
    for filename, url in SOURCES.items():
        rows, receipt = fetch_json(filename, url)
        downloaded[filename] = rows
        receipts.append(receipt)

    card = unique(downloaded["cards.json"], lambda row: row.get("key") == CARD_KEY,
                  f"card row for key={CARD_KEY!r}")
    same_name_rows = [
        row for row in downloaded["cards_stats_building.json"]
        if row.get("name_en") == card.get("name")
    ]
    same_name_and_rarity_rows = [
        row for row in same_name_rows
        if isinstance(row.get("rarity"), str)
        and isinstance(card.get("rarity"), str)
        and row["rarity"].casefold() == card["rarity"].casefold()
    ]
    building = unique(
        same_name_and_rarity_rows,
        lambda row: row.get("name_en") == card.get("name"),
        f"building row for card name/rarity={card.get('name')!r}/{card.get('rarity')!r}",
    )
    rows_out = {
        "source_commit": COMMIT,
        "identity_mapping": {
            "local_id": "aether-well",
            "local_display_name": "Aether Well",
            "pinned_card_key": CARD_KEY,
            "pinned_card_name": card.get("name"),
            "pinned_card_id": card.get("id"),
            "join": (
                "unique cards.json row by key, then unique building row by matching "
                "name_en to card.name and case-insensitive rarity; building key is null"
            ),
            "card_building_name_fields": {
                "card_name": card.get("name"),
                "building_name": building.get("name"),
                "building_name_en": building.get("name_en"),
                "card_rarity": card.get("rarity"),
                "building_rarity": building.get("rarity"),
                "building_key": building.get("key"),
            },
        },
        "link_resolution": {
            "card_key_matches": 1,
            "building_same_english_name_candidates": len(same_name_rows),
            "building_name_and_rarity_candidates": len(same_name_and_rarity_rows),
            "selected_building_key_is_null": building.get("key") is None,
        },
        "source_row_counts": {
            "cards.json": len(downloaded["cards.json"]),
            "cards_stats_building.json": len(downloaded["cards_stats_building.json"]),
        },
        "selected_row_value_counts": {
            "card": value_counts(card),
            "building": value_counts(building),
        },
        "row_field_indexes": {
            "card": {str(index): key for index, key in enumerate(card)},
            "building": {str(index): key for index, key in enumerate(building)},
        },
        "building_link_field_audit": link_candidates(building),
        "rows": {"card": card, "building": building},
    }
    row_bytes = (json.dumps(rows_out, indent=2, ensure_ascii=False) + "\n").encode()
    ROOT.joinpath("pinned-linked-rows.json").write_bytes(row_bytes)

    accessed = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    receipts_out = {
        "accessed_utc": accessed,
        "source_commit": COMMIT,
        "source_commit_url": f"https://github.com/RoyaleAPI/cr-api-data/commit/{COMMIT}",
        "source_commit_date_utc": "2023-02-18T11:25:16Z",
        "fetch_implementation": "extractor.py using Python urllib.request (User-Agent AetherWell-pinned-signature-research/1.0)",
        "actual_command": "python3 artifacts/aether-well-full-signature-scope/builder/extractor.py",
        "exit_code": 0,
        "prior_query_attempt": {
            "command": "python3 artifacts/aether-well-full-signature-scope/builder/extractor.py",
            "exit_code": 1,
            "result": "initial building-row key selector found 0; raw building key is null; selector corrected to unique card display-name plus rarity",
        },
        "source_files": receipts,
        "query": {
            "card_row_selector": {"key": CARD_KEY},
            "building_row_selector": {
                "name_en_equals_card_name": card.get("name"),
                "rarity_casefold_equals_card_rarity": card.get("rarity"),
            },
            "card_building_join_check": "unique name_en + rarity match; stats row key is null",
            "building_same_name_candidate_count": len(same_name_rows),
            "building_name_and_rarity_match_count": len(same_name_and_rarity_rows),
            "link_field_screen": link_candidates(building),
        },
        "extracted_rows_artifact": {
            "file": "pinned-linked-rows.json",
            "bytes": len(row_bytes),
            "sha256": hashlib.sha256(row_bytes).hexdigest(),
        },
        "extractor_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    }
    ROOT.joinpath("source-receipts.json").write_text(
        json.dumps(receipts_out, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "source_commit": COMMIT,
        "card_rows": len(downloaded["cards.json"]),
        "building_rows": len(downloaded["cards_stats_building.json"]),
        "card_fields": len(card),
        "building_fields": len(building),
        "card_name": card.get("name"),
        "card_id": card.get("id"),
        "card_key": card.get("key"),
        "card_rarity": card.get("rarity"),
        "building_internal_name": building.get("name"),
        "building_name_en": building.get("name_en"),
        "building_rarity": building.get("rarity"),
        "same_name_candidates": len(same_name_rows),
        "same_name_rarity_candidates": len(same_name_and_rarity_rows),
        "resource_fields": {
            key: building[key] for key in (
                "life_time", "deploy_time", "mana_collect_amount",
                "mana_generate_time_ms", "mana_generate_limit", "mana_on_death",
                "mana_on_death_for_opponent", "hitpoints", "hitpoints_per_level",
            )
        },
        "value_counts": {"card": value_counts(card), "building": value_counts(building)},
        "link_resolution": rows_out["building_link_field_audit"],
    }, indent=2))


if __name__ == "__main__":
    main()
