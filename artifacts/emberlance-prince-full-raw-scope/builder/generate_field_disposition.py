#!/usr/bin/env python3
"""Generate an ordered raw-field inventory and static comparator ledger."""
from __future__ import annotations

import csv
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
PACKET = json.loads((ROOT / "pinned-linked-rows.json").read_text(encoding="utf-8"))
CORPUS = json.loads((REPO / "reference/stats/cards.json").read_text(encoding="utf-8"))
PRINCE = next(card for card in CORPUS["cards"] if card["key"] == "prince")
ROWS = PACKET["rows"]
RUNTIME = {
    "cost": 5,
    "kind": "unit",
    "rarity": "special",
    "hitpoints": 1920,
    "damage": 392,
    "hitSpeedTicks": 84,
    "firstHitTicks": 54,
    "deployTimeTicks": 60,
    "rangeMillitiles": 1600,
    "sightRangeMillitiles": 5500,
    "movementMillitilesPerSecond": 1000,
    "targetMode": "ground",
    "count": 1,
    "areaDamageRadiusMillitiles": None,
}
FIELD_MAP = [
    ("cost", "elixir_cost", "value exact", "card.elixir", "identity/cost high"),
    ("kind", "type", "troop→unit", "card.type", "identity/type high"),
    ("rarity", "rarity", "epic→special local alias", "card.rarity", "identity/rarity high"),
    ("hitpoints", "hitpoints", "×1", "character.hitpoints_per_level[5]", "per-card field is unverified"),
    ("damage", "damage", "×1", "character.damage_per_level[5]", "per-card field is unverified"),
    ("hitSpeedTicks", "hit_speed_seconds", "seconds×60", "character.hit_speed", "per-card field is unverified"),
    ("firstHitTicks", "first_hit_seconds", "seconds×60", "character.load_time", "per-card field is unverified"),
    ("deployTimeTicks", "deploy_time_seconds", "seconds×60", "character.deploy_time", "per-card field is unverified"),
    ("rangeMillitiles", "range_tiles", "tiles×1000", "character.range", "per-card field is unverified"),
    ("sightRangeMillitiles", "sight_range_tiles", "tiles×1000", "character.sight_range", "per-card field is unverified"),
    ("movementMillitilesPerSecond", "movement_speed_tiles_per_second", "tiles/s×1000 per SOURCES.md", "character.speed", "per-card field is unverified"),
    ("targetMode", "targets", "attacks_ground=true + attacks_air=false→ground", "character.attacks_ground + character.attacks_air", "per-card field is unverified"),
    ("count", "count", "integer exact", "troop.summon_number=0 (no direct count transform)", "per-card field is unverified; zero is retained literally"),
    ("areaDamageRadiusMillitiles", "area_damage_radius_tiles", "null→null; otherwise tiles×1000", "character.area_damage_radius", "normalized null match; raw zero semantics unresolved"),
]
QUESTION_FIELDS = {
    "hitpoints", "damage", "hitSpeedTicks", "firstHitTicks", "deployTimeTicks",
    "rangeMillitiles", "sightRangeMillitiles", "movementMillitilesPerSecond",
    "targetMode", "count",
}


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


def transformed(field, value):
    if field == "kind":
        return "unit" if value == "troop" else value
    if field == "rarity":
        return "special" if value == "epic" else value
    if field in {"hitSpeedTicks", "firstHitTicks", "deployTimeTicks"}:
        return int(value * 60)
    if field in {"rangeMillitiles", "sightRangeMillitiles"}:
        return int(value * 1000)
    if field == "movementMillitilesPerSecond":
        return int(value * 1000)
    if field == "areaDamageRadiusMillitiles":
        return None if value is None else int(value * 1000)
    return value


def raw_path_value(path: str):
    base, index = path.split("[", 1) if "[" in path else (path, None)
    row_name, field = base.split(".", 1)
    value = ROWS[row_name][field]
    if index is not None:
        return value[int(index[:-1])]
    return value


FIELD_NOTES = {
    "key": ("identity/join", "Exact local source selector; this test-only binding does not create a shipped benchmark identity."),
    "name": ("identity/join", "Raw identity text retained in research evidence; not used as shipped card text."),
    "name_en": ("identity/join", "Exact English-name join field; no numeric-ID-only binding."),
    "id": ("identity cross-check", "Retained as a corroborating source key, not the sole join basis."),
    "rarity": ("identity/level join", "Epic joins the single rarity row; tournament array index is 5."),
    "elixir": ("cost comparator", "Maps to local cost 5; source ledger rates card identity/cost high."),
    "type": ("kind comparator", "Raw Troop normalizes to local unit; source ledger rates roster type high."),
    "hitpoints_per_level": ("base-combat stat candidate", "Tournament index 5 yields 1920; normalized HP remains in the per-card unverified_fields list."),
    "damage_per_level": ("base-combat stat candidate", "Tournament index 5 yields 392; normalized damage remains in the per-card unverified_fields list."),
    "hit_speed": ("base-combat timing candidate", "1400 ms maps to 84 ticks in the existing comparator; this card flags hit_speed_seconds unverified."),
    "load_time": ("base-combat first-hit candidate", "900 ms maps to 54 ticks; this card flags first_hit_seconds unverified."),
    "deploy_time": ("base-combat deploy candidate", "1000 ms maps to 60 ticks; this card flags deploy_time_seconds unverified."),
    "range": ("base-combat range candidate", "1600 raw distance corresponds to normalized 1.6 tiles in the corpus; this card flags range_tiles unverified."),
    "sight_range": ("base-combat sight candidate", "5500 corresponds to normalized 5.5 tiles; this card flags sight_range_tiles unverified."),
    "speed": ("base-combat movement candidate", "60 maps to 1 tile/s under SOURCES.md; this card flags movement speed unverified."),
    "attacks_ground": ("base-combat targeting candidate", "Retained with attacks_air; the normalized ground enum is question-backed."),
    "attacks_air": ("base-combat targeting candidate", "Retained with attacks_ground; the normalized ground enum is question-backed."),
    "area_damage_radius": ("base-combat radius discrepancy", "Raw zero is preserved; normalized null comparator match does not define zero-to-null semantics."),
    "charge_range": ("charge arming candidate", "Raw 300 is preserved. Existing PLAN.md describes the cutoff as 3.0 tiles; this extraction does not infer raw units, edge inclusion, activation, cancellation, or reset behavior."),
    "charge_speed_multiplier": ("charged-movement candidate", "Raw 200 is preserved. Existing PLAN.md describes 2× speed; this field alone does not define phase duration, interruption, or transition timing."),
    "damage_special": ("charge-damage candidate", "Raw 490 is preserved alongside base damage and level arrays; the local +392 bonus fixture remains QUESTION and no scaling/application rule is inferred here."),
    "damage_effect_special": ("effect-name metadata", "Raw string retained; no effect asset or external row is fetched or imported."),
    "retarget_each_tick": ("retarget/load QUESTION", "Raw false is retained; field-name semantics and transition timing remain unresolved."),
    "retarget_after_attack": ("retarget/load QUESTION", "Raw false is retained; field-name semantics and target-change policy remain unresolved."),
    "load_after_retarget": ("retarget/load QUESTION", "Raw false is retained; no windup reset rule follows from this value alone."),
    "load_first_hit": ("retarget/load candidate", "Raw value is retained; no first-hit/reset behavior is inferred beyond the existing QUESTION test contract."),
    "override_attack_finish_time": ("attack-finish QUESTION", "Raw false is retained; no consumer mapping or attack-finish meaning is established."),
    "attack_finish_time": ("attack-finish QUESTION", "Raw zero is retained; no zero-to-infinite or zero-to-default rule is inferred."),
    "collision_radius": ("collision/mass QUESTION", "Raw radius is retained; current isolated fixture geometry uses literal zero radii and no raw-to-runtime mapping is established."),
    "mass": ("collision/mass QUESTION", "Raw mass is retained; no current charge composition consumer maps it to displacement."),
    "walking_speed_tweak_percentage": ("walking-speed QUESTION", "Raw value is retained; zero is not decoded as a percent default or absence."),
    "projectile": ("delivery link screen", "Raw link candidate is retained; selected field is null and no projectile row resolves."),
    "custom_first_projectile": ("delivery link screen", "Raw link candidate is retained; selected field is null and no projectile row resolves."),
    "projectile_special": ("delivery link screen", "Raw link candidate is retained; selected field is null and no projectile row resolves."),
    "projectile_effect_special": ("delivery link screen", "Raw link candidate is retained; selected field is null; no projectile/effect asset is fetched."),
    "spawn_projectile": ("spawn/delivery link screen", "Raw link candidate is retained; selected field is null and no projectile row resolves."),
    "death_spawn_projectile": ("spawn/delivery link screen", "Raw link candidate is retained; selected field is null and no projectile row resolves."),
    "summon_character": ("name relation only", "The non-null Prince self-name resolves to the selected character row; zero summon counts remain literal and do not establish spawn behavior."),
    "summon_number": ("spawn/count QUESTION", "Raw zero retained; it is not interpreted as infinite, absent, or normalized count 1."),
    "ability": ("ability link screen", "Raw null retained; no ability row selected and no separate ability table fetched."),
    "hero_ability": ("ability link screen", "Raw null retained; no ability row selected and no separate ability table fetched."),
    "passive_ability": ("ability link screen", "Raw null retained; no ability row selected and no separate ability table fetched."),
    "pushback": ("knockback composition QUESTION", "Raw zero retained; source does not define collision/displacement composition."),
    "attack_push_back": ("knockback composition QUESTION", "Raw zero retained; no mapping to the current fixture's forced-displacement policy."),
    "death_push_back": ("knockback composition QUESTION", "Raw zero retained; no death-displacement consumer is established."),
    "melee_pushback": ("knockback composition QUESTION", "Raw zero retained; not evidence that target displacement is absent."),
    "ignore_pushback": ("knockback composition QUESTION", "Raw true retained; no rule is inferred for which displacement source it gates."),
}


def classify(row_name: str, field: str, value):
    if field in FIELD_NOTES:
        return FIELD_NOTES[field]
    low = field.lower()
    if row_name == "card":
        if field in {"arena", "sc_key", "description"}:
            return ("raw roster metadata", "Preserved in the selected research row; no runtime mechanics consumer." )
        return ("raw roster metadata", "Preserved exactly; not consumed by this isolated comparator." )
    if row_name == "rarity":
        if field in {"tournament_level_index", "relative_level", "level_count"}:
            return ("level-array selector/context", "Raw rarity values retained; the explicit tournament-level selector is index 5." )
        return ("raw rarity metadata", "Preserved exactly; no battle/runtime consumer identified." )
    if row_name == "troop":
        if field in {"not_visible", "mana_cost"}:
            return ("troop selector/cost cross-check", "Selected visible troop row; mana_cost agrees with roster cost but does not drive this comparator." )
        if any(token in low for token in ("projectile", "buff", "ability", "summon", "spawn", "character")):
            return ("link/deploy metadata screen", "Raw value retained; null/false/zero values are not expanded into mechanics." )
        if any(token in low for token in ("deploy", "damage", "hitpoint", "count", "cost")):
            return ("troop stat candidate", "Raw troop value retained; no direct movement/composition consumer is established." )
        return ("raw troop metadata", "Preserved exactly; no local charge-composition consumer identified." )
    if row_name == "character":
        if field in {"name_en", "sc_key", "elixir", "type", "arena", "description", "id"}:
            return ("duplicated roster metadata", "Character row repeats roster metadata; standalone/combined row equality is checked in the extractor." )
        if any(token in low for token in ("projectile", "buff", "ability", "spawn", "summon", "character")):
            return ("linked-row screen", "Raw value retained. Explicit non-null names are checked only against the bounded linked tables; no missing semantics are inferred." )
        if any(token in low for token in ("pushback", "knockback", "mass", "collision")):
            return ("collision/knockback QUESTION", "Raw value retained; no source-backed shared-session composition is established." )
        if any(token in low for token in ("charge", "dash", "jump", "speed", "pathfind", "move")):
            return ("movement/charge candidate", "Raw value retained; phase state, units, cancellation, ordering, and consumer mapping remain limited by the source packet." )
        if any(token in low for token in ("attack", "damage", "load", "hit", "range", "target", "deploy", "life", "radius")):
            return ("base/special combat candidate", "Raw value retained; only the comparator fields are mapped, and all flagged per-card values remain QUESTION." )
        return ("raw character metadata", "Preserved exactly; no local runtime consumer identified." )
    raise ValueError(row_name)


def source_value(path: str):
    if path == "character.attacks_ground + character.attacks_air":
        return f"attacks_ground={ROWS['character']['attacks_ground']!r}; attacks_air={ROWS['character']['attacks_air']!r}"
    if path.startswith("troop.summon_number"):
        return f"summon_number={ROWS['troop']['summon_number']!r}; summon_character={ROWS['troop']['summon_character']!r}"
    return raw_path_value(path)


def canonical_js_string_record(name: str):
    source = (REPO / "src/content/session-troop-movement-profiles.js").read_text(encoding="utf-8")
    match = re.search(rf'^  {re.escape(name)}: ("(?:[^"\\]|\\.)*"),$', source, re.MULTILINE)
    if not match:
        raise ValueError(f"cannot find {name} canonical QUESTION snapshot")
    encoded = json.loads(match.group(1))
    return json.loads(encoded)


with (ROOT / "field-consumer-disposition.tsv").open("w", encoding="utf-8", newline="") as out:
    writer = csv.writer(out, delimiter="\t", lineterminator="\n")
    writer.writerow(["source_row", "index", "raw_field", "value_class", "raw_value_json", "disposition_area", "consumer_or_limit"])
    for row_name in ("card", "rarity", "troop", "character"):
        for index, (field, value) in enumerate(ROWS[row_name].items()):
            area, note = classify(row_name, field, value)
            writer.writerow([row_name, index, field, value_class(value), json.dumps(value, ensure_ascii=False, separators=(",", ":")), area, note])

with (ROOT / "comparator-field-map.tsv").open("w", encoding="utf-8", newline="") as out:
    writer = csv.writer(out, delimiter="\t", lineterminator="\n")
    writer.writerow(["runtime_field", "normalized_corpus_field", "test_transform", "runtime_value", "corpus_value", "test_disposition", "raw_source_field_or_value", "source_confidence_note"])
    for runtime_field, corpus_field, transform, raw_path, confidence_note in FIELD_MAP:
        corpus_value = PRINCE[corpus_field]
        runtime_value = RUNTIME[runtime_field]
        if transformed(runtime_field, corpus_value) != runtime_value:
            raise ValueError(f"test mapping mismatch for {runtime_field}")
        test_disposition = "question-backed match" if runtime_field in QUESTION_FIELDS else "match"
        if runtime_field == "areaDamageRadiusMillitiles":
            test_disposition = "normalized null match; raw zero semantics unresolved"
        writer.writerow([
            runtime_field,
            corpus_field,
            transform,
            json.dumps(runtime_value, ensure_ascii=False, separators=(",", ":")),
            json.dumps(corpus_value, ensure_ascii=False, separators=(",", ":")),
            test_disposition,
            json.dumps(source_value(raw_path), ensure_ascii=False, separators=(",", ":")),
            confidence_note,
        ])

question_fixture = canonical_js_string_record("createChargeQuestionFixture")
composition_records = canonical_js_string_record("createChargeKnockbackQuestionRecords")
with (ROOT / "question-dispositions.tsv").open("w", encoding="utf-8", newline="") as out:
    writer = csv.writer(out, delimiter="\t", lineterminator="\n")
    writer.writerow(["record_family", "question_field", "current_value_json", "authoritative", "confidence", "disposition", "source", "closure_limit"])
    for field in ("armDistanceMillitiles", "bonusDamage", "chargedMovementMillitilesPerSecond"):
        writer.writerow([
            "charge-question-fixture", field,
            json.dumps(question_fixture[field], ensure_ascii=False, separators=(",", ":")),
            question_fixture["authoritative"], question_fixture["confidence"], question_fixture["disposition"],
            question_fixture["provenance"][field]["source"],
            "Existing isolated fixture only; does not define shared-session trigger, boundary, cancellation, or event order.",
        ])
    for field, record in composition_records.items():
        writer.writerow([
            "charge-knockback-retarget-composition", field,
            json.dumps(record["value"], ensure_ascii=False, separators=(",", ":")),
            record["authoritative"], record["confidence"], record["disposition"], record["source"],
            "Existing QUESTION composition record; no source-backed shared-session receipt closes this field.",
        ])

print(json.dumps({
    "primary_raw_field_rows": sum(len(ROWS[name]) for name in ("card", "rarity", "troop", "character")),
    "comparator_field_rows": len(FIELD_MAP),
    "charge_question_rows": 3,
    "charge_knockback_composition_question_rows": len(composition_records),
    "mapped_question_matches": len(QUESTION_FIELDS),
}, indent=2))
