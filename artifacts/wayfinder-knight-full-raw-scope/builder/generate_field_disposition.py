#!/usr/bin/env python3
"""Generate the exhaustive field and comparator inventory from the pinned extraction."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PACKET = json.loads(ROOT.joinpath("pinned-linked-rows.json").read_text(encoding="utf-8"))
CORPUS = json.loads(Path("reference/stats/cards.json").read_text(encoding="utf-8"))
KNIGHT = next(card for card in CORPUS["cards"] if card["key"] == "knight")
WAYFINDER = {
    "areaDamageRadiusMillitiles": None,
    "cost": 3,
    "count": 1,
    "damage": 202,
    "deployTimeTicks": 60,
    "firstHitTicks": 42,
    "hitSpeedTicks": 72,
    "hitpoints": 1766,
    "kind": "unit",
    "movementMillitilesPerSecond": 1000,
    "rangeMillitiles": 1200,
    "rarity": "standard",
    "sightRangeMillitiles": 5500,
    "targetMode": "ground",
}
FIELD_MAP = [
    ("cost", "elixir_cost", "identity value; ×1", "raw cards.elixir=3; source identity/cost high"),
    ("kind", "type", "troop→unit", "raw cards.type=Troop; normalized comparator expects troop"),
    ("rarity", "rarity", "common→standard", "raw Common rarity joins rarity row; project alias"),
    ("hitpoints", "hitpoints", "×1", "question-backed; source corpus unverified_fields"),
    ("damage", "damage", "×1", "question-backed; source corpus unverified_fields"),
    ("hitSpeedTicks", "hit_speed_seconds", "seconds×60", "normalized field not in unverified_fields"),
    ("firstHitTicks", "first_hit_seconds", "seconds×60", "question-backed; source corpus unverified_fields"),
    ("deployTimeTicks", "deploy_time_seconds", "seconds×60", "question-backed; source corpus unverified_fields"),
    ("rangeMillitiles", "range_tiles", "tiles×1000", "question-backed; source corpus unverified_fields"),
    ("sightRangeMillitiles", "sight_range_tiles", "tiles×1000", "question-backed; source corpus unverified_fields"),
    ("movementMillitilesPerSecond", "movement_speed_tiles_per_second", "tiles/s×1000", "question-backed; source corpus unverified_fields"),
    ("targetMode", "targets", "enum exact", "question-backed; source corpus unverified_fields"),
    ("count", "count", "integer exact", "question-backed; raw troop summon_number=0 is not interpreted as count"),
    ("areaDamageRadiusMillitiles", "area_damage_radius_tiles", "null→null; else tiles×1000", "normalized null comparator match; raw character area_damage_radius=0 is preserved and not explained"),
]


def value_class(value):
    if value is None:
        return "null"
    if value is False:
        return "false"
    if value is True:
        return "true"
    if isinstance(value, (int, float)):
        return "numeric-zero" if value == 0 else "numeric-nonzero"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return "string"


def disposition(row_name, field, value):
    if row_name == "card":
        if field == "key":
            return ("positive test selector", "test-only identity join; not an engine field")
        if field in {"name", "id", "rarity"}:
            return ("roster join / identity", "test-only source join; numeric ID is corroborative, not binding basis")
        if field in {"elixir", "type"}:
            return ("normalized comparator input", "cost/kind parity only; not retarget encounter mechanics")
        return ("raw roster metadata", "preserved; no Wayfinder retarget consumer")
    if row_name == "rarity":
        if field == "name":
            return ("rarity join", "Common row selected from roster rarity")
        if field == "tournament_level_index":
            return ("level-array interpretation", "Common tournament level 11 index=10 per SOURCES.md")
        return ("raw rarity metadata", "preserved; no Wayfinder retarget consumer")
    if row_name == "troop":
        if field in {"key", "name", "name_en", "rarity", "not_visible"}:
            return ("troop join", "selected visible troop row by key/name/rarity")
        if field == "mana_cost":
            return ("cost cross-check", "raw troop cost; does not drive retarget encounter")
        if field == "summon_character":
            return ("resolved character relation", "unique name join to the selected Knight character row; no count/spawn semantics inferred")
        if field in {"projectile", "custom_first_projectile"}:
            return ("projectile link candidate", "null; no projectile row selected")
        if any(token in field.lower() for token in ("summon", "projectile", "spawn", "character", "ability", "buff", "damage", "deploy")):
            return ("raw deploy/effect metadata", "preserved; zero/false/null semantics unresolved and not consumed by this retarget fixture")
        return ("raw troop metadata", "preserved; no Wayfinder retarget consumer")
    if row_name == "character":
        if field in {"key", "name", "name_en", "id", "rarity"}:
            return ("character join", "exact card/troop/name/key/rarity join; ID is a cross-check, not sole basis")
        special = {
            "hitpoints_per_level": ("normalized HP source candidate", "index 10 gives 1766; local hitpoints is question-backed and catalog-only in this encounter"),
            "damage_per_level": ("normalized damage source candidate", "index 10 gives 202; local damage is question-backed and applied on attack-ready"),
            "hit_speed": ("normalized attack-cycle input", "1200 ms→1.2 s→72 ticks; local field is not flagged unverified; AttackCycle consumes normalized hitSpeedTicks"),
            "load_time": ("normalized first-hit candidate", "700 ms→0.7 s→42 ticks; question-backed; AttackCycle consumes normalized firstHitTicks"),
            "deploy_time": ("normalized deploy candidate", "1000 ms→1.0 s→60 ticks; question-backed; AttackCycle consumes normalized deployTimeTicks"),
            "range": ("normalized attack-range candidate", "1200 raw millitiles; question-backed; inAttackReach uses normalized range plus fixed/input radii"),
            "sight_range": ("normalized sight candidate", "5500 raw millitiles; question-backed; targeting receives normalized sightRangeMillitiles"),
            "speed": ("normalized movement-rate candidate", "60→1 tile/s→1000 millitiles/s per SOURCES.md; question-backed and movement is outside this encounter"),
            "attacks_ground": ("normalized target-mode candidate", "true combines with attacks_air=false in local normalized ground enum; question-backed; targeting uses normalized targetMode"),
            "attacks_air": ("normalized target-mode candidate", "false combines with attacks_ground=true in local normalized ground enum; question-backed; targeting uses normalized targetMode"),
            "area_damage_radius": ("raw-versus-normalized null gap", "raw zero; normalized corpus and Wayfinder catalog are null and test comparator reports a match; no raw zero→null semantics inferred"),
            "hitpoints": ("base character constant", "raw base value 690 differs from tournament-level normalized 1766; not used as attacker HP by this encounter"),
            "damage": ("base character constant", "raw base value 79 differs from tournament-level normalized 202; normalized level value comes from the level array"),
            "collision_radius": ("collision/body question", "raw 500; no Wayfinder definition mapping; encounter attacker radius is fixed 300 and candidate radii are supplied by fixture"),
            "mass": ("mass/knockback question", "raw 6; no mass field or consumer in this retarget encounter") ,
            "override_attack_finish_time": ("attack-finish question", "raw false; no mapping to attack-cycle policy established"),
            "attack_finish_time": ("attack-finish question", "raw zero; no mapping to attack-cycle policy established"),
            "retarget_each_tick": ("retarget-policy question", "raw false; semantics do not follow from the field name; local retarget choices remain QUESTION"),
            "retarget_after_attack": ("retarget-policy question", "raw false; semantics do not follow from the field name; local retarget choices remain QUESTION"),
            "load_after_retarget": ("retarget-policy question", "raw false; semantics do not follow from the field name; local retarget choices remain QUESTION"),
            "projectile": ("projectile link candidate", "null; no projectile row selected"),
        }
        if field in special:
            return special[field]
        if any(token in field.lower() for token in ("projectile", "spawn", "summon", "death", "ability", "buff", "retarget", "attack", "target", "collision", "mass", "deploy", "charge", "dash", "jump", "radius")):
            return ("raw mechanic-shaped field", "preserved; no Wayfinder consumer mapping or historical semantics inferred")
        return ("raw character field", "preserved; no Wayfinder retarget consumer identified")
    raise ValueError(row_name)


with ROOT.joinpath("field-consumer-disposition.tsv").open("w", encoding="utf-8", newline="") as out:
    writer = csv.writer(out, delimiter="\t", lineterminator="\n")
    writer.writerow(["source_row", "index", "raw_field", "value_class", "raw_value_json", "disposition", "consumer_or_limit"])
    for row_name in ("card", "rarity", "troop", "character"):
        row = PACKET["rows"][row_name]
        for index, (field, value) in enumerate(row.items()):
            category, note = disposition(row_name, field, value)
            writer.writerow([row_name, index, field, value_class(value), json.dumps(value, ensure_ascii=False, separators=(",", ":")), category, note])

with ROOT.joinpath("comparator-field-map.tsv").open("w", encoding="utf-8", newline="") as out:
    writer = csv.writer(out, delimiter="\t", lineterminator="\n")
    writer.writerow(["runtime_field", "normalized_corpus_field", "transform_in_existing_test", "runtime_value", "corpus_value", "disposition", "raw_source_note"])
    for runtime_field, corpus_field, transform, note in FIELD_MAP:
        corpus_value = KNIGHT[corpus_field]
        runtime_value = WAYFINDER[runtime_field]
        if runtime_field in {"hitpoints", "damage", "firstHitTicks", "deployTimeTicks", "rangeMillitiles", "sightRangeMillitiles", "movementMillitilesPerSecond", "targetMode", "count"}:
            result = "question-backed match"
        elif runtime_field == "areaDamageRadiusMillitiles":
            result = "normalized null match; raw zero semantics unresolved"
        else:
            result = "match"
        writer.writerow([runtime_field, corpus_field, transform, json.dumps(runtime_value, ensure_ascii=False), json.dumps(corpus_value, ensure_ascii=False), result, note])

print(f"wrote {sum(len(PACKET['rows'][name]) for name in ('card','rarity','troop','character'))} raw field rows and {len(FIELD_MAP)} comparator rows")
