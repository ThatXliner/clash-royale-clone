#!/usr/bin/env python3
"""Validate the historical reference corpus and its independent spot checks."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SCHEMA_VERSION = "1.0.0"

CARD_ROOT_KEYS = {"schema_version", "snapshot", "cards"}
CARD_KEYS = {
    "id",
    "key",
    "name",
    "elixir_cost",
    "rarity",
    "type",
    "tournament_level",
    "hitpoints",
    "damage",
    "hit_speed_seconds",
    "first_hit_seconds",
    "deploy_time_seconds",
    "range_tiles",
    "sight_range_tiles",
    "movement_speed_tiles_per_second",
    "movement_speed",
    "targets",
    "count",
    "area_damage_radius_tiles",
    "components",
    "unverified_fields",
    "notes",
}
COMPONENT_KEYS = {
    "name",
    "role",
    "count",
    "hitpoints",
    "damage",
    "hit_speed_seconds",
    "first_hit_seconds",
    "deploy_time_seconds",
    "range_tiles",
    "sight_range_tiles",
    "movement_speed_tiles_per_second",
    "movement_speed",
    "targets",
    "area_damage_radius_tiles",
}
TOWER_ROOT_KEYS = {"schema_version", "snapshot", "towers"}
TOWER_KEYS = {
    "key",
    "name",
    "count_per_side",
    "hitpoints",
    "damage",
    "hit_speed_seconds",
    "first_hit_seconds",
    "range_tiles",
    "targets",
    "area_damage_radius_tiles",
    "activation_rule",
    "unverified_fields",
}
ARENA_ROOT_KEYS = {
    "schema_version",
    "snapshot",
    "playfield",
    "deployment",
    "elixir",
    "timing",
    "unverified_fields",
}
RARITIES = {"common", "rare", "epic", "legendary", "champion"}
CARD_TYPES = {"troop", "building", "spell"}
TARGETS = {"none", "ground", "air", "air_and_ground", "buildings"}
MOVEMENT = {None, "stationary", "slow", "medium", "fast", "very_fast", "custom"}


class ValidationError(RuntimeError):
    pass


def load_json(name: str):
    path = ROOT / name
    try:
        return json.loads(path.read_text())
    except FileNotFoundError as exc:
        raise ValidationError(f"missing required file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValidationError(f"invalid JSON in {path}: {exc}") from exc


def exact_keys(value: dict, expected: set[str], where: str):
    actual = set(value)
    missing = expected - actual
    extra = actual - expected
    if missing or extra:
        raise ValidationError(
            f"{where}: schema drift; missing={sorted(missing)}, extra={sorted(extra)}"
        )


def positive_or_null(value, where: str):
    if value is not None and (not isinstance(value, (int, float)) or value <= 0):
        raise ValidationError(f"{where}: expected null or a positive number, got {value!r}")


def nonnegative_or_null(value, where: str):
    if value is not None and (not isinstance(value, (int, float)) or value < 0):
        raise ValidationError(
            f"{where}: expected null or a non-negative number, got {value!r}"
        )


def validate_component(item: dict, where: str):
    exact_keys(item, COMPONENT_KEYS, where)
    if not item["name"] or not isinstance(item["name"], str):
        raise ValidationError(f"{where}.name: expected non-empty string")
    if not isinstance(item["count"], int) or item["count"] <= 0:
        raise ValidationError(f"{where}.count: expected positive integer")
    for field in ("hitpoints", "damage"):
        positive_or_null(item[field], f"{where}.{field}")
    for field in (
        "hit_speed_seconds",
        "first_hit_seconds",
        "deploy_time_seconds",
        "range_tiles",
        "sight_range_tiles",
        "movement_speed_tiles_per_second",
        "area_damage_radius_tiles",
    ):
        positive_or_null(item[field], f"{where}.{field}")
    if item["movement_speed"] not in MOVEMENT:
        raise ValidationError(f"{where}.movement_speed: invalid enum")
    if item["targets"] not in TARGETS:
        raise ValidationError(f"{where}.targets: invalid enum")


def validate_cards(payload: dict):
    exact_keys(payload, CARD_ROOT_KEYS, "cards.json root")
    if payload["schema_version"] != SCHEMA_VERSION:
        raise ValidationError("cards.json: unsupported schema_version")
    if not isinstance(payload["cards"], list) or not payload["cards"]:
        raise ValidationError("cards.json.cards: expected non-empty array")
    if len(payload["cards"]) != 109:
        raise ValidationError("cards.json.cards: expected 109 collectible cards")

    keys = set()
    ids = set()
    for index, card in enumerate(payload["cards"]):
        where = f"cards[{index}]"
        exact_keys(card, CARD_KEYS, where)
        if card["key"] in keys:
            raise ValidationError(f"{where}.key: duplicate {card['key']!r}")
        if card["id"] in ids:
            raise ValidationError(f"{where}.id: duplicate {card['id']!r}")
        keys.add(card["key"])
        ids.add(card["id"])

        if not isinstance(card["elixir_cost"], int) or not 1 <= card["elixir_cost"] <= 10:
            raise ValidationError(f"{where}.elixir_cost: expected integer from 1 to 10")
        if card["rarity"] not in RARITIES:
            raise ValidationError(f"{where}.rarity: invalid enum")
        if card["type"] not in CARD_TYPES:
            raise ValidationError(f"{where}.type: invalid enum")
        if card["tournament_level"] != 11:
            raise ValidationError(f"{where}.tournament_level: expected 11")
        if card["targets"] not in TARGETS:
            raise ValidationError(f"{where}.targets: invalid enum")
        if card["movement_speed"] not in MOVEMENT:
            raise ValidationError(f"{where}.movement_speed: invalid enum")
        if not isinstance(card["count"], int) or card["count"] <= 0:
            raise ValidationError(f"{where}.count: expected positive integer")
        if not isinstance(card["unverified_fields"], list):
            raise ValidationError(f"{where}.unverified_fields: expected array")
        if not set(card["unverified_fields"]) <= CARD_KEYS:
            raise ValidationError(f"{where}.unverified_fields: unknown field name")
        if not isinstance(card["notes"], list):
            raise ValidationError(f"{where}.notes: expected array")

        for field in ("hitpoints", "damage"):
            positive_or_null(card[field], f"{where}.{field}")
        for field in (
            "hit_speed_seconds",
            "first_hit_seconds",
            "deploy_time_seconds",
            "range_tiles",
            "sight_range_tiles",
            "movement_speed_tiles_per_second",
            "area_damage_radius_tiles",
        ):
            positive_or_null(card[field], f"{where}.{field}")

        if card["type"] in {"troop", "building"} and card["hitpoints"] is None:
            raise ValidationError(f"{where}.hitpoints: required for troops/buildings")
        if not isinstance(card["components"], list):
            raise ValidationError(f"{where}.components: expected array")
        for component_index, item in enumerate(card["components"]):
            validate_component(item, f"{where}.components[{component_index}]")


def validate_towers(payload: dict):
    exact_keys(payload, TOWER_ROOT_KEYS, "towers.json root")
    if payload["schema_version"] != SCHEMA_VERSION:
        raise ValidationError("towers.json: unsupported schema_version")
    if len(payload["towers"]) != 2:
        raise ValidationError("towers.json.towers: expected King and Princess records")
    for index, tower in enumerate(payload["towers"]):
        where = f"towers[{index}]"
        exact_keys(tower, TOWER_KEYS, where)
        for field in ("hitpoints", "damage", "hit_speed_seconds", "range_tiles"):
            positive_or_null(tower[field], f"{where}.{field}")
        positive_or_null(tower["first_hit_seconds"], f"{where}.first_hit_seconds")
        nonnegative_or_null(
            tower["area_damage_radius_tiles"], f"{where}.area_damage_radius_tiles"
        )
        if tower["targets"] not in TARGETS:
            raise ValidationError(f"{where}.targets: invalid enum")


def validate_arena(payload: dict):
    exact_keys(payload, ARENA_ROOT_KEYS, "arena.json root")
    if payload["schema_version"] != SCHEMA_VERSION:
        raise ValidationError("arena.json: unsupported schema_version")
    playfield = payload["playfield"]
    if playfield["width_tiles"] != 18 or playfield["length_tiles"] != 32:
        raise ValidationError("arena playfield must be exactly 18x32 tiles")
    ticks = payload["elixir"]["tick_seconds"]
    for name in ("single", "double", "triple"):
        positive_or_null(ticks.get(name), f"arena.elixir.tick_seconds.{name}")
    timing = payload["timing"]
    if timing["regulation_seconds"] != 180 or timing["overtime_seconds"] != 120:
        raise ValidationError("arena timing drifted from 180s + 120s")
    if timing["maximum_match_seconds"] != 300:
        raise ValidationError("arena maximum_match_seconds must be 300")


def expect(actual, expected, label: str):
    if isinstance(expected, float):
        matches = isinstance(actual, (int, float)) and math.isclose(
            actual, expected, rel_tol=0, abs_tol=1e-9
        )
    else:
        matches = actual == expected
    if not matches:
        raise ValidationError(f"spot check failed: {label}: {actual!r} != {expected!r}")


def spot_checks(cards_payload: dict, towers_payload: dict):
    cards = {card["key"]: card for card in cards_payload["cards"]}
    towers = {tower["key"]: tower for tower in towers_payload["towers"]}

    expect(cards["hog-rider"]["elixir_cost"], 4, "Hog Rider elixir")
    expect(cards["fireball"]["elixir_cost"], 4, "Fireball elixir")
    expect(cards["knight"]["hit_speed_seconds"], 1.2, "Knight hit speed")
    expect(cards["skeletons"]["elixir_cost"], 1, "Skeletons elixir")
    expect(cards["pekka"]["elixir_cost"], 7, "P.E.K.K.A elixir")
    expect(cards["princess"]["range_tiles"], 9.0, "Princess range")
    expect(cards["cannon"]["hit_speed_seconds"], 0.9, "Cannon hit speed")
    expect(towers["princess_tower"]["range_tiles"], 7.5, "Princess Tower range")
    expect(towers["princess_tower"]["hitpoints"], 3052, "Princess Tower HP")
    expect(towers["king_tower"]["hitpoints"], 4824, "King Tower HP")


def main():
    cards = load_json("cards.json")
    towers = load_json("towers.json")
    arena = load_json("arena.json")
    validate_cards(cards)
    validate_towers(towers)
    validate_arena(arena)
    spot_checks(cards, towers)
    print(
        f"OK: {len(cards['cards'])} cards, {len(towers['towers'])} tower types, "
        "arena constants, schema, and 10 spot checks"
    )


if __name__ == "__main__":
    try:
        main()
    except ValidationError as exc:
        print(f"VALIDATION FAILED: {exc}", file=sys.stderr)
        raise SystemExit(1)
