#!/usr/bin/env python3
"""Extract a small, hash-pinned Squall/Fireball evidence subset.

This writes only the test/provenance artifact beside this script. It does not
modify shipped game data or source files.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen


COMMIT = "54fdef52c5086393b085f57faeeab8ef86b28160"
ROOT_URL = f"https://raw.githubusercontent.com/RoyaleAPI/cr-api-data/{COMMIT}/docs/json/"
EXPECTED_SHA256 = {
    "cards_stats_projectile.json": "c883516f54f6c17ee77c15cf484b01da9ded22602214c3b0d42b1ab823bd3197",
    "cards_stats_spell.json": "2bc968eeb9e36e9ddb281bf291f7265d0e7bfefa99bc0589eeba5195c229a690",
    "cards_stats_characters.json": "37734d1508584e43851395c01b2d10046667eb6dc27daef37e5df56e74f933ac",
    "cards_stats_troop.json": "a6e044cb510ec280dacfd54e546558276e5f40d50fbd16f47f3ff16126add33a",
    "cards_stats.json": "5a75c35e37b895a2c64223d4050f08008d8722531af248ac9fd251e9390f5e95",
    "cards.json": "312574f75ada2ff5ad605e1eb122c3b620d1163c5a675d67cd9e64122b3d6946",
}
CARD_KEYS = ("knight", "giant", "pekka", "musketeer")
CHARACTER_SELECTORS = {"knight": 0, "giant": 3, "pekka": 4, "musketeer": 14}
CARD_SELECTORS = {"knight": 0, "giant": 3, "pekka": 4, "musketeer": 14}
CHARACTER_FIELDS = (
    "name", "name_en", "key", "sc_key", "id", "speed", "deploy_time",
    "collision_radius", "mass", "pushback", "ignore_pushback", "load_time",
    "activation_time", "projectile_start_radius", "projectile_start_z", "range",
)
TROOP_FIELDS = (
    "name", "name_en", "key", "summon_character", "summon_number",
    "custom_deploy_time", "deploy_time", "pushback", "ignore_pushback",
)
CARD_FIELDS = ("name", "key", "sc_key", "id", "type", "rarity")
PROJECTILE_FIELDS = (
    "name", "rarity", "speed", "homing", "hit_effect_at_projectile", "damage",
    "crown_tower_damage_percent", "pushback", "pushback_all", "radius",
    "aoe_to_air", "aoe_to_ground", "only_enemies", "only_own_troops", "gravity",
    "spawn_const_priority", "apply_buff_before_damage", "use360_frames",
    "spawn_axis_x", "spawn_axis_y", "height_from_target_radius", "target_to_edge",
    "shakes_targets", "drag_back_as_attractor", "check_collisions",
    "hide_when_delayed", "deflect_behaviour", "deflect_radius", "damage_per_level",
)


def fetch_json(filename: str) -> tuple[bytes, object]:
    request = Request(ROOT_URL + filename, headers={"User-Agent": "squall-source-audit/1"})
    with urlopen(request, timeout=30) as response:
        raw = response.read()
    actual = hashlib.sha256(raw).hexdigest()
    expected = EXPECTED_SHA256[filename]
    if actual != expected:
        raise SystemExit(f"{filename}: SHA-256 {actual} != pinned {expected}")
    return raw, json.loads(raw)


def named_index(rows: list[dict], field: str, value: str) -> int:
    matches = [index for index, row in enumerate(rows) if row.get(field) == value]
    if len(matches) != 1:
        raise SystemExit(f"expected one {field}={value!r}, found selectors {matches}")
    return matches[0]


def subset(row: dict, fields: tuple[str, ...]) -> dict:
    return {field: row.get(field) for field in fields}


files: dict[str, object] = {}
source_manifest: dict[str, dict[str, object]] = {}
for filename, expected_sha in EXPECTED_SHA256.items():
    raw, parsed = fetch_json(filename)
    files[filename] = parsed
    source_manifest[filename] = {
        "url": ROOT_URL + filename,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "bytes": len(raw),
        "expected_sha256": expected_sha,
    }

projectiles = files["cards_stats_projectile.json"]
projectile_index = named_index(projectiles, "name", "FireballSpell")
if projectile_index != 0:
    raise SystemExit(f"FireballSpell moved from expected selector 0 to {projectile_index}")
projectile = projectiles[projectile_index]
if projectile.get("damage_per_level", [None] * 9)[8] != 689:
    raise SystemExit("Fireball damage_per_level[8] no longer equals 689")

spells = files["cards_stats_spell.json"]
spell_matches = [
    {"selector": index, "name": row.get("name"), "key": row.get("key")}
    for index, row in enumerate(spells)
    if any("fireball" in str(row.get(field, "")).lower() for field in ("name", "key"))
]

aggregate = files["cards_stats.json"]
if not isinstance(aggregate, dict):
    raise SystemExit("cards_stats.json root is not an object")
aggregate_projectile_index = named_index(aggregate["projectile"], "name", "FireballSpell")
aggregate_buff_index = named_index(aggregate["character_buff"], "name", "FireballProjectile")
buff = aggregate["character_buff"][aggregate_buff_index]
if buff.get("override_projectile") != "FireballSpell":
    raise SystemExit("FireballProjectile no longer overrides FireballSpell")
aggregate_spell_matches = [
    {"group": "spell", "selector": index, "name": row.get("name"), "key": row.get("key")}
    for index, row in enumerate(aggregate["spell"])
    if any("fireball" in str(row.get(field, "")).lower() for field in ("name", "key"))
]

characters = files["cards_stats_characters.json"]
troops = files["cards_stats_troop.json"]
cards = files["cards.json"]
unit_rows = []
for key in CARD_KEYS:
    card_index = named_index(cards, "key", key)
    troop_index = named_index(troops, "key", key)
    character_index = named_index(characters, "name", {"pekka": "Pekka"}.get(key, key.title()))
    if card_index != CARD_SELECTORS[key] or character_index != CHARACTER_SELECTORS[key]:
        raise SystemExit(f"unexpected card/character selector for {key}")
    card_row = cards[card_index]
    troop_row = troops[troop_index]
    character_row = characters[character_index]
    expected_link = card_row.get("sc_key")
    if key == "pekka":
        valid_link = expected_link == character_row.get("name") == "Pekka"
    else:
        valid_link = expected_link == character_row.get("sc_key")
    if not valid_link:
        raise SystemExit(f"card-to-character link check failed for {key}")
    unit_rows.append({
        "normalized_card": {"selector": card_index, **subset(card_row, CARD_FIELDS)},
        "troop_deployment_row": {"selector": troop_index, **subset(troop_row, TROOP_FIELDS)},
        "character_constants_row": {
            "selector": character_index,
            **subset(character_row, CHARACTER_FIELDS),
        },
        "link_rule": (
            "cards.json.sc_key=character row name=Pekka; character row has no key/sc_key/id"
            if key == "pekka"
            else "cards.json.sc_key=character row sc_key"
        ),
    })

document = {
    "title": "Squall Orb / Fireball pinned primary-row extract",
    "purpose": "Test and provenance evidence only; never imported by shipped game modules.",
    "upstream": {
        "repository": "RoyaleAPI/cr-api-data",
        "commit": COMMIT,
        "snapshot_date": "2023-02-18",
        "zero_based_array_selectors": True,
        "files": source_manifest,
    },
    "fireball_projectile": {
        "source_file": "cards_stats_projectile.json",
        "selector": projectile_index,
        "fields": subset(projectile, PROJECTILE_FIELDS),
        "derived_check": {"damage_per_level_index_8": projectile["damage_per_level"][8]},
    },
    "aggregate_cross_reference": {
        "source_file": "cards_stats.json",
        "projectile_selector": aggregate_projectile_index,
        "fireball_projectile_buff_selector": aggregate_buff_index,
        "fireball_projectile_buff_fields": subset(
            buff, ("name", "override_projectile", "source", "type")
        ),
        "aggregate_spell_group_fireball_name_or_key_matches": aggregate_spell_matches,
    },
    "cards_stats_spell_fireball_name_or_key_matches": spell_matches,
    "linked_troops": unit_rows,
    "scope_limits": [
        "The spell constants file has no Fireball-named or Fireball-keyed row; the projectile row is not a cast/activation record.",
        "The Fireball projectile row has no launch-origin, activation-delay, travel-formula, knockback-eligibility, or interruption-order field.",
        "The local card roster's unverified_fields remain independent confidence flags; this extract does not change them.",
    ],
}

output = Path(__file__).with_name("squall-primary-rows.json")
output.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(f"wrote {output}")
print(f"verified {len(source_manifest)} pinned SHA-256 hashes; selectors: projectile[{projectile_index}], aggregate.character_buff[{aggregate_buff_index}]")
print("linked character selectors:", ", ".join(
    f'{row["normalized_card"]["key"]}={row["character_constants_row"]["selector"]}'
    for row in unit_rows
))
