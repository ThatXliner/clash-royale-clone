#!/usr/bin/env python3
"""Fetch and extract only the pinned Valkyrie comparison row for this audit."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from urllib.request import urlopen


COMMIT = "54fdef52c5086393b085f57faeeab8ef86b28160"
BASE = f"https://raw.githubusercontent.com/RoyaleAPI/cr-api-data/{COMMIT}/docs/json"
EXPECTED_CHARACTERS_SHA256 = (
    "37734d1508584e43851395c01b2d10046667eb6dc27daef37e5df56e74f933ac"
)
FIELDS = (
    "id",
    "key",
    "name",
    "type",
    "elixir",
    "rarity",
    "description",
    "hitpoints",
    "hitpoints_per_level",
    "damage",
    "damage_per_level",
    "hit_speed",
    "load_time",
    "deploy_time",
    "range",
    "sight_range",
    "speed",
    "attacks_ground",
    "attacks_air",
    "area_damage_radius",
    "collision_radius",
    "minimum_range",
    "self_as_aoe_center",
    "projectile",
    "multiple_targets",
    "all_targets_hit",
    "target_only_buildings",
    "target_only_towers",
    "target_only_troops",
    "building_target",
)


def fetch(path: str) -> tuple[bytes, str]:
    with urlopen(f"{BASE}/{path}", timeout=30) as response:
        raw = response.read()
    return raw, hashlib.sha256(raw).hexdigest()


def main() -> None:
    characters, characters_sha256 = fetch("cards_stats_characters.json")
    if characters_sha256 != EXPECTED_CHARACTERS_SHA256:
        raise SystemExit(f"Pinned character-source SHA-256 mismatch: {characters_sha256}")
    roster, roster_sha256 = fetch("cards.json")
    character_rows = json.loads(characters)
    roster_rows = json.loads(roster)
    character = next(row for row in character_rows if row.get("id") == 26000011)
    card = next(row for row in roster_rows if row.get("key") == "valkyrie")

    extract = {
        "source": {
            "publisher": "RoyaleAPI",
            "repository": "https://github.com/RoyaleAPI/cr-api-data",
            "commit": COMMIT,
            "commit_date_utc": "2023-02-18T11:25:16Z",
            "characters_path": "docs/json/cards_stats_characters.json",
            "characters_blob_sha": "a86a93da5b27a27ae891cfa3c67b13b7f3b2080e",
            "characters_raw_sha256": characters_sha256,
            "cards_path": "docs/json/cards.json",
            "cards_blob_sha": "9a26927d54fbf358138e10d2f5bb5519e6f8602e",
            "cards_raw_sha256": roster_sha256,
        },
        "card_description_row": {
            key: card[key]
            for key in ("key", "name", "elixir", "rarity", "type", "description")
        },
        "character_row": {key: character[key] for key in FIELDS if key in character},
    }
    destination = Path(__file__).with_name("pinned-valkyrie-extract.json")
    destination.write_text(json.dumps(extract, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {destination}")
    print(f"characters SHA-256: {characters_sha256}")
    print(f"cards SHA-256: {roster_sha256}")


if __name__ == "__main__":
    main()
