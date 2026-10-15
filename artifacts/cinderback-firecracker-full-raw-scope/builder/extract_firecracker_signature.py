#!/usr/bin/env python3
"""Bounded raw-source extraction for the existing Cinderback/Firecracker test join.

Only full selected rows are written. Pinned upstream tables stay in memory;
their exact URL, HTTP status, byte count, hashes, and row counts are receipted.
"""
from __future__ import annotations

import hashlib
import json
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
BASELINE_COMMIT = "226c55248d5c3a6f77e87ef40bb9eb0f32cd5ebf"
COMMIT = "54fdef52c5086393b085f57faeeab8ef86b28160"
COMMIT_DATE_UTC = "2023-02-18T11:25:16Z"
BASE = f"https://raw.githubusercontent.com/RoyaleAPI/cr-api-data/{COMMIT}/docs/json"
CORE_FILES = (
    "cards.json",
    "rarities.json",
    "cards_stats_troop.json",
    "cards_stats_characters.json",
    "cards_stats_projectile.json",
    "cards_stats.json",
)
BUFF_FILE = "cards_stats_character_buff.json"
LINK_TOKENS = ("projectile", "spawn", "summon", "death_spawn", "buff")
IDENTITY_KEYS = ("key", "name", "name_en", "id")
UNVERIFIED = {
    "hitpoints", "damage", "hit_speed_seconds", "first_hit_seconds",
    "deploy_time_seconds", "range_tiles", "sight_range_tiles",
    "movement_speed_tiles_per_second", "movement_speed", "targets", "count",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_blob_sha1(data: bytes) -> str:
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def canonical_bytes(value: object) -> bytes:
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode()


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


def unique(rows: list[dict], predicate, label: str) -> dict:
    found = [row for row in rows if predicate(row)]
    if len(found) != 1:
        raise ValueError(f"expected one {label}; found {len(found)}")
    return found[0]


def row_key(row: dict) -> str:
    for field in ("key", "name", "name_en", "id"):
        if row.get(field) is not None:
            return f"{field}={row[field]}"
    return "<no-identity-field>"


def same_identity(candidate: dict, row: dict) -> bool:
    fields = [key for key in IDENTITY_KEYS if candidate.get(key) is not None]
    return bool(fields) and all(row.get(key) == candidate.get(key) for key in fields)


def value_counts(row: dict) -> dict:
    values = list(row.values())
    return {
        "field_count": len(row),
        "null_count": sum(value is None for value in values),
        "false_count": sum(value is False for value in values),
        "true_count": sum(value is True for value in values),
        "numeric_zero_count_excluding_booleans": sum(
            isinstance(value, (int, float)) and not isinstance(value, bool) and value == 0
            for value in values
        ),
        "numeric_nonzero_count_excluding_booleans": sum(
            isinstance(value, (int, float)) and not isinstance(value, bool) and value != 0
            for value in values
        ),
        "array_count": sum(isinstance(value, list) for value in values),
        "object_count": sum(isinstance(value, dict) for value in values),
    }


def row_index(row: dict) -> dict:
    return {str(index): key for index, key in enumerate(row)}


def fetch(filename: str, number: int, receipts: list[dict]) -> object:
    url = f"{BASE}/{filename}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Cinderback-Firecracker-pinned-source-audit/1.0"},
    )
    receipt = {
        "canonical_url": f"https://github.com/RoyaleAPI/cr-api-data/blob/{COMMIT}/docs/json/{filename}",
        "filename": filename,
        "url_used": url,
        "attempt_ordinal": number,
        "requested_utc": utc_now(),
    }
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read()
            receipt.update({
                "direct_exit_code": 0,
                "final_raw_url": response.geturl(),
                "http_status": response.getcode(),
                "response_content_type": response.headers.get("Content-Type"),
                "raw_bytes": len(raw),
                "raw_sha256": sha256(raw),
                "git_blob_sha1": git_blob_sha1(raw),
            })
    except urllib.error.HTTPError as error:
        body = error.read()
        receipt.update({
            "direct_exit_code": error.code,
            "final_raw_url": error.geturl(),
            "http_status": error.code,
            "error_type": type(error).__name__,
            "error_text": str(error),
            "error_body_bytes": len(body),
            "error_body_sha256": sha256(body),
        })
        receipts.append(receipt)
        attempt_dir = ROOT / "fetch-attempts"
        attempt_dir.mkdir(exist_ok=True)
        stem = f"{number:02d}-{filename}"
        (attempt_dir / f"{stem}.stderr.raw").write_bytes(str(error).encode())
        (attempt_dir / f"{stem}.body.raw").write_bytes(body)
        (attempt_dir / f"{stem}.json").write_bytes(canonical_bytes(receipt))
        raise
    except Exception as error:
        receipt.update({
            "direct_exit_code": 1,
            "final_raw_url": None,
            "http_status": None,
            "error_type": type(error).__name__,
            "error_text": str(error),
        })
        receipts.append(receipt)
        attempt_dir = ROOT / "fetch-attempts"
        attempt_dir.mkdir(exist_ok=True)
        stem = f"{number:02d}-{filename}"
        (attempt_dir / f"{stem}.stderr.raw").write_bytes(str(error).encode())
        (attempt_dir / f"{stem}.json").write_bytes(canonical_bytes(receipt))
        raise

    data = json.loads(raw)
    if filename == "cards_stats.json":
        if not isinstance(data, dict):
            raise TypeError("cards_stats.json must decode as an object of groups")
        receipt["rows_or_groups_in_source_file"] = {
            key: len(value) if isinstance(value, list) else None
            for key, value in data.items()
        }
    else:
        if not isinstance(data, list):
            raise TypeError(f"{filename} must decode as a row list")
        receipt["rows_or_groups_in_source_file"] = len(data)
    receipts.append(receipt)
    return data


def link_candidates(row: dict) -> list[dict]:
    result = []

    def walk(value: object, path: str, field_name: str) -> None:
        lowered = field_name.lower()
        if isinstance(value, dict):
            for child_key, child_value in value.items():
                walk(child_value, f"{path}.{child_key}", child_key)
        elif isinstance(value, list):
            for index, child_value in enumerate(value):
                walk(child_value, f"{path}[{index}]", field_name)
        elif any(token in lowered for token in LINK_TOKENS) and value is not None:
            result.append({"field_path": path, "field_name": field_name, "value": value})

    for field, value in row.items():
        walk(value, field, field)
    return result


def exact_matches(rows: list[dict], value: object, field_name: str) -> list[dict]:
    if isinstance(value, bool):
        return []
    id_only = field_name.lower().endswith("_id")
    matches = []
    for row in rows:
        if id_only:
            if row.get("id") == value:
                matches.append(row)
        elif isinstance(value, str) and any(row.get(key) == value for key in IDENTITY_KEYS):
            matches.append(row)
        elif not isinstance(value, (str, int, float)):
            continue
    return matches


def candidate_map(rows: list[tuple[str, dict]]) -> dict:
    result = []
    for row_name, row in rows:
        for candidate in link_candidates(row):
            result.append({"row": row_name, **candidate})
    return result


def compare_local_rows(data_by_file: dict[str, object], link_screen: dict) -> tuple[dict, list[dict]]:
    cards = source_rows(data_by_file["cards.json"], "cards.json")
    rarities = source_rows(data_by_file["rarities.json"], "rarities.json")
    troops = source_rows(data_by_file["cards_stats_troop.json"], "cards_stats_troop.json")
    characters = source_rows(data_by_file["cards_stats_characters.json"], "cards_stats_characters.json")
    projectiles = source_rows(data_by_file["cards_stats_projectile.json"], "cards_stats_projectile.json")

    # The existing parity test is the positive binding. It selects the normalized
    # record by key and compares it to the original Cinderback catalog row.
    card = unique(cards, lambda row: row.get("key") == "firecracker", "roster key=firecracker")
    rarity = unique(rarities, lambda row: row.get("name") == card.get("rarity"), "matching rarity")
    troop = unique(
        troops,
        lambda row: row.get("key") == card.get("key")
        and row.get("name_en") == card.get("name")
        and row.get("rarity") == card.get("rarity")
        and row.get("not_visible") is False,
        "visible troop matching roster key/name/rarity",
    )
    character = unique(
        characters,
        lambda row: row.get("key") == card.get("key")
        and row.get("id") == card.get("id")
        and row.get("name") == troop.get("summon_character")
        and row.get("rarity") == card.get("rarity"),
        "character matching roster key/id, troop summon_character, and rarity",
    )
    combined = data_by_file["cards_stats.json"]
    combined_troops = source_rows(combined, "cards_stats.json", "troop")
    combined_characters = source_rows(combined, "cards_stats.json", "characters")
    combined_projectiles = source_rows(combined, "cards_stats.json", "projectile")
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
    if (combined_troop != troop or combined_character != character
            or list(combined_troop.items()) != list(troop.items())
            or list(combined_character.items()) != list(character.items())):
        raise ValueError("standalone and combined troop/character ordered rows differ")

    primary = [("troop", troop), ("character", character)]
    projectile_candidates = [
        item for item in candidate_map(primary)
        if "projectile" in item["field_name"].lower()
    ]
    projectile_joins = []
    selected_projectiles = []
    for candidate in projectile_candidates:
        value = candidate["value"]
        selector_value = (
            isinstance(value, str) and value != ""
        ) or (
            candidate["field_name"].lower().endswith("_id")
            and isinstance(value, (int, float)) and not isinstance(value, bool)
        )
        matches = exact_matches(projectiles, value, candidate["field_name"]) if selector_value else []
        distinct = {id(row): row for row in matches}
        projectile_joins.append({
            **candidate,
            "selector_fields": list(IDENTITY_KEYS) if isinstance(candidate["value"], str)
            else ["id"] if candidate["field_name"].lower().endswith("_id") else [],
            "matches": len(distinct),
            "matched_row_identities": [row_key(row) for row in distinct.values()],
            "disposition": (
                "raw parameter/flag/count candidate, not a row selector; literal retained without semantic inference"
                if not selector_value else
                "unique exact linked-row join"
                if len(distinct) == 1 else
                "QUESTION: explicit link candidate did not resolve uniquely; no absence or mechanics inferred"
            ),
        })
        if len(distinct) == 1:
            selected_projectiles.extend(distinct.values())
    unique_projectiles = {id(row): row for row in selected_projectiles}
    selected_projectiles_by_id = dict(unique_projectiles)

    # Recursive dependency closure over explicitly named projectile/spawn/buff fields.
    selected_chars = {id(character): character}
    selected_buffs: list[dict] = []
    dependency_edges: list[dict] = []
    char_queue = [character]
    projectile_queue = list(unique_projectiles.values())
    buff_data = None
    next_fetch_ordinal = len(link_screen["fetches"]) + 1
    processed: set[tuple[str, str]] = set()

    def process_dependencies(source_type: str, source_row: dict) -> None:
        nonlocal buff_data, next_fetch_ordinal
        marker = (source_type, json.dumps(source_row, sort_keys=True, ensure_ascii=False))
        if marker in processed:
            return
        processed.add(marker)
        candidates = link_candidates(source_row)
        for candidate in candidates:
            field = candidate["field_name"].lower()
            value = candidate["value"]
            selector_value = (
                isinstance(value, str) and value != ""
            ) or (
                field.endswith("_id") and isinstance(value, (int, float))
                and not isinstance(value, bool)
            )
            if not selector_value:
                dependency_edges.append({
                    "from_table": source_type,
                    "from_row": row_key(source_row),
                    "field_path": candidate["field_path"],
                    "raw_value": value,
                    "to_table": None,
                    "matches": 0,
                    "matched_row_identities": [],
                    "disposition": "raw parameter/flag/count candidate, not a row selector; literal retained without semantic inference",
                })
                continue
            if "projectile" in field:
                target_table = "projectile"
                rows = projectiles
            elif "buff" in field:
                target_table = "character_buff"
                rows = []
                if buff_data is None:
                    buff_data = fetch(BUFF_FILE, next_fetch_ordinal, link_screen["fetches"])
                    next_fetch_ordinal += 1
                rows = source_rows(buff_data, BUFF_FILE)
            elif any(token in field for token in ("spawn", "summon")):
                target_table = "characters"
                rows = characters
            else:
                continue
            matches = exact_matches(rows, value, candidate["field_name"])
            unique_rows = {id(row): row for row in matches}
            edge = {
                "from_table": source_type,
                "from_row": row_key(source_row),
                "field_path": candidate["field_path"],
                "raw_value": value,
                "to_table": target_table,
                "matches": len(unique_rows),
                "matched_row_identities": [row_key(row) for row in unique_rows.values()],
                "disposition": (
                    "unique exact linked-row join; raw value retained without assigning mechanic semantics"
                    if len(unique_rows) == 1
                    else "QUESTION: explicit link candidate unresolved/ambiguous; no absence or mechanics inferred"
                ),
            }
            dependency_edges.append(edge)
            if len(unique_rows) != 1:
                continue
            target_row = next(iter(unique_rows.values()))
            if target_table == "projectile":
                selected_projectiles_by_id[id(target_row)] = target_row
                if all(row != target_row for row in projectile_queue):
                    projectile_queue.append(target_row)
            elif target_table == "characters":
                if id(target_row) not in selected_chars:
                    selected_chars[id(target_row)] = target_row
                    char_queue.append(target_row)
            else:
                if all(row != target_row for row in selected_buffs):
                    selected_buffs.append(target_row)
                    process_dependencies("character_buff", target_row)

    while char_queue or projectile_queue:
        while char_queue:
            process_dependencies("character", char_queue.pop(0))
        while projectile_queue:
            process_dependencies("projectile", projectile_queue.pop(0))
    unique_projectiles = selected_projectiles_by_id
    if buff_data is not None:
        data_by_file[BUFF_FILE] = buff_data
    if buff_data is not None:
        combined_buffs = source_rows(combined, "cards_stats.json", "character_buff")
        for buff in selected_buffs:
            duplicate = unique(
                combined_buffs,
                lambda row: any(row.get(key) is not None and row.get(key) == buff.get(key)
                                for key in IDENTITY_KEYS),
                f"combined character_buff duplicate for {row_key(buff)}",
            )
            if duplicate != buff:
                raise ValueError("standalone and combined buff rows differ")

    combined_projectile_rows = []
    for projectile in unique_projectiles.values():
        matches = [row for row in combined_projectiles if same_identity(projectile, row)]
        if len(matches) != 1:
            raise ValueError(f"expected one combined projectile duplicate for {row_key(projectile)}; found {len(matches)}")
        if matches[0] != projectile or list(matches[0].items()) != list(projectile.items()):
            raise ValueError(f"standalone and combined ordered projectile rows differ for {row_key(projectile)}")
        combined_projectile_rows.append(matches[0])

    rows = {
        "card": card,
        "rarity": rarity,
        "troop": troop,
        "character": character,
        "combined_troop_duplicate": combined_troop,
        "combined_character_duplicate": combined_character,
    }
    for index, row in enumerate(unique_projectiles.values(), start=1):
        rows[f"projectile_{index}"] = row
        rows[f"combined_projectile_{index}_duplicate"] = combined_projectile_rows[index - 1]
    for index, char_row in enumerate(selected_chars.values(), start=1):
        if char_row is character:
            continue
        rows[f"spawn_character_{index}"] = char_row
        duplicate = unique(
            combined_characters,
            lambda row: same_identity(char_row, row),
            f"combined character duplicate for {row_key(char_row)}",
        )
        if duplicate != char_row or list(duplicate.items()) != list(char_row.items()):
            raise ValueError(f"standalone and combined ordered character rows differ for {row_key(char_row)}")
        rows[f"combined_spawn_character_{index}_duplicate"] = duplicate
    for index, buff in enumerate(selected_buffs, start=1):
        rows[f"character_buff_{index}"] = buff
        duplicate = unique(
            source_rows(combined, "cards_stats.json", "character_buff"),
            lambda row: same_identity(buff, row),
            f"combined character_buff duplicate for {row_key(buff)}",
        )
        if list(duplicate.items()) != list(buff.items()):
            raise ValueError(f"standalone and combined ordered buff rows differ for {row_key(buff)}")
        rows[f"combined_character_buff_{index}_duplicate"] = duplicate

    firecracker = unique(
        json.loads((REPO / "reference/stats/cards.json").read_text())["cards"],
        lambda row: row.get("key") == "firecracker",
        "local normalized firecracker row",
    )
    cinderback_fixture = {
        "areaDamageRadiusMillitiles": None,
        "components": [],
        "cost": 3,
        "count": 1,
        "damage": None,
        "deployTimeTicks": 60,
        "displayName": "Cinderback",
        "firstHitTicks": 144,
        "hitSpeedTicks": 180,
        "hitpoints": 304,
        "id": "cinderback",
        "kind": "unit",
        "movementMillitilesPerSecond": 1500,
        "rangeMillitiles": 6000,
        "rarity": "standard",
        "sightRangeMillitiles": 8500,
        "targetMode": "ground-and-air",
    }
    recoil_question = {
        "authoritative": False,
        "boundsRule": "clamp-center-to-radius-inset-closed-arena",
        "commandsResolveBeforeLaunch": True,
        "confidence": "unverified",
        "directionRule": "opposite-snapshotted-target-vector",
        "displacementProjectionRule": "euclidean-components-divide-by-exact-integer-vector-length",
        "disposition": "question",
        "interruptionRule": "interrupt-at-or-before-launch-boundary-suppresses-projectile-and-recoil",
        "launchBoundaryTick": 144,
        "projectileDamage": 1,
        "projectileRadiusMillitiles": 0,
        "projectileSpeedMillitilesPerTick": 100,
        "recoilDistanceMillitiles": 2000,
        "source": "unsourced-attack-recoil-fixture",
        "targetDeathRule": "death-after-launch-does-not-undo-recoil-or-remove-in-flight-projectile",
        "timingRule": "same-boundary-immediately-after-projectile-launch",
        "zeroVectorRule": "reject-undefined-direction",
    }
    recoil_question["provenance"] = {
        key: {"confidence": "unverified", "disposition": "question",
             "source": "unsourced-attack-recoil-fixture"}
        for key in recoil_question
        if key not in {"authoritative", "confidence", "disposition", "provenance", "source"}
    }
    source_report = {
        "test_only_binding": {
            "local_identity": {"id": "cinderback", "display_name": "Cinderback"},
            "existing_test": "tests/special-movement-recoil.test.js",
            "test_name": "recoil special: original definition maps to the test-only benchmark",
            "corpus_selector": {"key": "firecracker"},
            "positive_binding_evidence": "The existing test calls parity(createRecoilSpecialCatalog()[0], \"firecracker\") and requires no authoritative failures; every comparator field must be match or question-backed-match. This explicit test comparator selects rows for this audit. It is not an admission or historical-mechanics claim.",
            "mapping_basis": "Existing comparator call only; no brand-name equality/inequality or numeric-ID-only inference.",
            "comparator_fields": [
                ["cost", "elixir_cost", "identity"], ["kind", "type", "troop→unit"],
                ["rarity", "rarity", "common→standard"], ["hitpoints", "hitpoints", "identity"],
                ["damage", "damage", "identity/null"], ["hitSpeedTicks", "hit_speed_seconds", "seconds×60"],
                ["firstHitTicks", "first_hit_seconds", "seconds×60"], ["deployTimeTicks", "deploy_time_seconds", "seconds×60"],
                ["rangeMillitiles", "range_tiles", "tiles×1000"], ["sightRangeMillitiles", "sight_range_tiles", "tiles×1000"],
                ["movementMillitilesPerSecond", "movement_speed_tiles_per_second", "tiles/second×1000"],
                ["targetMode", "targets", "air_and_ground→ground-and-air"], ["count", "count", "identity"],
                ["areaDamageRadiusMillitiles", "area_damage_radius_tiles", "tiles×1000/null"],
            ],
        },
        "existing_cinderback_catalog_definition": cinderback_fixture,
        "existing_recoil_question_fixture": recoil_question,
        "official_source_notes_from_root": [
            {
                "url": "https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-february-2023-2/",
                "claim_as_reported_by_root": "The February 2023 official balance notes say Firecracker first hit was reduced by 0.4 seconds (40% faster); the targeting discussion names multiple variables.",
                "relationship_to_raw_rows": "Does not define which raw field or consumer phase corresponds to the note. Pinned load_time and hit_speed values are retained separately; no mapping or first-hit promotion is made.",
                "conditional_arithmetic_inference": "If 40% faster means a delay is reduced to 60% of its old value and the absolute reduction is 0.4 seconds, the implied pair is approximately 1.0 seconds to 0.6 seconds. This is arithmetic only, not a sourced mapping to load_time or hit_speed.",
                "confidence": "qualitative/relative primary-source corroboration as reported by root; direct old/new numeric source and raw consumer mapping remain unresolved",
            },
            {
                "url": "https://supercell.com/en/games/clashroyale/blog/release-notes/season-7/",
                "claim_as_reported_by_root": "The January 2020 official notes qualitatively describe an impact firework with sparks behind the target.",
                "relationship_to_raw_rows": "Qualitative effect context only; does not corroborate projectile row count, exact hit distribution, raw spawn_count semantics, or recoil units.",
                "confidence": "qualitative primary-source corroboration as reported by root",
            },
        ],
        "join_resolution": {
            "roster_card": {"selector": {"key": "firecracker"}, "matches": 1},
            "rarity": {"selector": {"name": card.get("rarity")}, "matches": 1,
                         "tournament_level_index": rarity.get("tournament_level_index"),
                         "displayed_tournament_level": 11},
            "troop": {"selector": {"key": card.get("key"), "name_en": card.get("name"),
                                    "rarity": card.get("rarity"), "not_visible": False}, "matches": 1},
            "character": {"selector": {"key": card.get("key"), "id": card.get("id"),
                                        "name": troop.get("summon_character"),
                                        "rarity": card.get("rarity")}, "matches": 1},
            "troop_summon_character": {
                "stored_value": troop.get("summon_character"),
                "matching_character_rows": sum(row.get("name") == troop.get("summon_character") for row in characters),
                "interpretation": "Exact row relation preserved. A self-name or zero summon count does not prove spawn mechanics.",
            },
            "projectile_link_candidates": projectile_joins,
            "recursive_explicit_dependencies": dependency_edges,
            "standalone_combined_checks": {
                "troop_equal": combined_troop == troop,
                "troop_ordered_items_equal": list(combined_troop.items()) == list(troop.items()),
                "character_equal": combined_character == character,
                "character_ordered_items_equal": list(combined_character.items()) == list(character.items()),
                "projectile_rows_equal": all(
                    left == right for left, right in zip(unique_projectiles.values(), combined_projectile_rows)
                ),
                "projectile_ordered_items_equal": all(
                    list(left.items()) == list(right.items())
                    for left, right in zip(unique_projectiles.values(), combined_projectile_rows)
                ),
                "buff_rows_equal": bool(selected_buffs) and buff_data is not None,
            },
        },
        "source_row_counts": {
            filename: (len(data_by_file[filename]) if isinstance(data_by_file[filename], list)
                       else {key: len(value) for key, value in data_by_file[filename].items()})
            for filename in data_by_file
        },
        "primary_ordered_field_total": sum(len(rows[name]) for name in
                                            ("card", "rarity", "troop", "character")),
        "selected_row_value_counts": {name: value_counts(row) for name, row in rows.items()},
        "row_field_indexes": {name: row_index(row) for name, row in rows.items()},
        "full_rows": rows,
        "local_normalized_firecracker": firecracker,
        "raw_link_field_screens": {
            name: link_candidates(row) for name, row in rows.items()
            if name in {"troop", "character"} or name.startswith("projectile_")
        },
    }
    local_paths = (
        "AGENTS.md", "reference/stats/SOURCES.md", "reference/stats/cards.json",
        "tests/special-movement-recoil.test.js", "src/content/cards/special-movement-recoil.js",
        "src/content/index.js",
        "src/content/session-card-catalog.js", "src/content/session-troop-movement-question-authority.js",
        "src/content/session-troop-movement-profiles.js", "src/content/session-troop-movement-runtime-profiles.js",
        "src/content/session-troop-projectile-profiles.js", "tests/game-roster-troop-profiles.test.js",
        "tests/game-roster-troops-movement-profiles.test.js", "src/content/editable-deck.js",
        "tests/editable-deck.test.js",
    )
    local_ledger = ["baseline_commit\tpath\tgit_blob_sha1\tsha256\tbytes\n"]
    for relative in local_paths:
        raw = (REPO / relative).read_bytes()
        local_ledger.append(f"{BASELINE_COMMIT}\t{relative}\t{git_blob_sha1(raw)}\t{sha256(raw)}\t{len(raw)}\n")
    (ROOT / "local-input-hashes.tsv").write_text("".join(local_ledger))
    source_report["local_input_hash_ledger"] = "local-input-hashes.tsv"
    return source_report, list(rows.items())


def raw_type(value: object) -> str:
    if value is None: return "null"
    if isinstance(value, bool): return "boolean"
    if isinstance(value, int): return "integer"
    if isinstance(value, float): return "number"
    if isinstance(value, str): return "string"
    if isinstance(value, list): return "array"
    return "object"


def write_field_dispositions(rows: list[tuple[str, dict]]) -> None:
    header = "selected_row\tordinal_0_based\tfield_name\traw_type\traw_value_json\tsource_confidence_or_Q\tdisposition\n"
    lines = [header]
    identity = {"card": {"key", "name", "id", "elixir", "rarity", "type"},
                "rarity": {"name", "tournament_level_index"},
                "troop": {"key", "name_en", "rarity", "summon_character"},
                "character": {"key", "name", "name_en", "id", "rarity", "summon_character"}}
    for row_name, row in rows:
        for ordinal, (field, value) in enumerate(row.items()):
            lower = field.lower()
            if any(token in lower for token in LINK_TOKENS):
                disposition = "link/mechanic candidate; literal preserved; exact joins are listed in pinned-linked-rows.json"
                confidence = "QUESTION: explicit link candidate; meaning/consumer behavior remains unresolved"
            elif row_name == "character" and field == "load_time":
                disposition = "raw milliseconds retained exactly; local normalization calls this first_hit_seconds, but its consumer phase is unresolved"
                confidence = "QUESTION-backed; root supplied official 0.4s/40% relative change note, which does not map this raw field"
            elif row_name == "character" and field == "hit_speed":
                disposition = "raw milliseconds retained exactly; do not substitute hit_speed-load_time or infer a first-hit consumer rule"
                confidence = "QUESTION-backed per local normalized card; no broad timing promotion"
            elif row_name == "rarity" and field == "tournament_level_index":
                disposition = "high-confidence level-11 array selector per local source ledger; retain actual index"
                confidence = "high"
            elif field in identity.get(row_name, set()):
                disposition = "identity/join field; source ledger rates roster identity fields high; retained verbatim"
                confidence = "high for roster identity/join; numeric ID only a cross-check where noted"
            elif value is None or value is False or value == 0:
                disposition = "literal null/false/zero retained; not interpreted as mechanic absence"
                confidence = "QUESTION / not applicable as appropriate; sentinel does not prove mechanic absence"
            elif field in {"hitpoints_per_level", "damage_per_level", "hit_speed", "load_time",
                           "deploy_time", "range", "sight_range", "speed", "attacks_ground", "attacks_air",
                           "summon_number", "summon_number_second", "radius", "projectile_speed"}:
                disposition = "raw mechanic candidate; compare with normalized record and keep raw units/flags/order"
                confidence = "QUESTION-backed where normalized Firecracker unverified_fields applies; datamine alone is not second-source corroboration"
            else:
                disposition = "complete raw field retained; no local consumer or mechanic semantics assigned"
                confidence = "not assigned; source field preserved without a mechanic claim"
            encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
            lines.append("\t".join((row_name, str(ordinal), field, raw_type(value), encoded, confidence, disposition)) + "\n")
    (ROOT / "field-consumer-disposition.tsv").write_text("".join(lines))


def write_comparison(report: dict) -> None:
    """Join every actual catalog field through the test's 14-field mapping."""
    local = report["local_normalized_firecracker"]
    rows = report["full_rows"]
    rarity = rows["rarity"]
    character = rows["character"]
    troop = rows["troop"]
    level = rarity.get("tournament_level_index")

    def level_value(row: dict, field: str) -> object:
        values = row.get(field)
        if isinstance(values, list) and isinstance(level, int) and 0 <= level < len(values):
            return values[level]
        return values

    source_paths = {
        "elixir_cost": [("card.elixir", rows["card"].get("elixir"))],
        "rarity": [("card.rarity", rows["card"].get("rarity"))],
        "type": [("card.type", rows["card"].get("type"))],
        "hitpoints": [(f"character.hitpoints_per_level[{level}]", level_value(character, "hitpoints_per_level"))],
        "damage": [(f"character.damage_per_level[{level}]", level_value(character, "damage_per_level"))]
                  + [(f"{key}.damage", row.get("damage")) for key, row in rows.items()
                     if key.startswith("projectile_") and not key.startswith("combined_")]
                  + [(f"{key}.damage_per_level[{level}]", level_value(row, "damage_per_level"))
                     for key, row in rows.items() if key.startswith("projectile_") and not key.startswith("combined_")],
        "hit_speed_seconds": [("character.hit_speed (raw milliseconds)", character.get("hit_speed"))],
        "first_hit_seconds": [("character.load_time (raw milliseconds)", character.get("load_time"))],
        "deploy_time_seconds": [("troop.deploy_time (raw milliseconds)", troop.get("deploy_time")), ("character.deploy_time (raw milliseconds)", character.get("deploy_time"))],
        "range_tiles": [("character.range (raw millitiles)", character.get("range"))],
        "sight_range_tiles": [("character.sight_range (raw millitiles)", character.get("sight_range"))],
        "movement_speed_tiles_per_second": [("character.speed (raw enum 45/60/90/120)", character.get("speed"))],
        "targets": [("character.attacks_ground", character.get("attacks_ground")), ("character.attacks_air", character.get("attacks_air"))],
        "count": [("troop.summon_number", troop.get("summon_number")), ("character.summon_number", character.get("summon_number"))],
        "area_damage_radius_tiles": [
            (f"{key}.{field} (raw projectile row; semantics unresolved)", value)
            for key, row in rows.items() if key.startswith("projectile_") and not key.startswith("combined_")
            for field, value in row.items() if "radius" in field.lower() or "area" in field.lower()
        ],
    }

    # This receipt comes from calling the real createRecoilSpecialCatalog()
    # export. It preserves the original array/object receipt shape and values.
    receipt_path = ROOT / "current-catalog-profile-receipts.json"
    current_receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    actual_catalog = current_receipt.get("recoilSpecialCatalog")
    if not isinstance(actual_catalog, list) or len(actual_catalog) != 1 or not isinstance(actual_catalog[0], dict):
        raise ValueError("current catalog receipt must hold the one-row recoilSpecialCatalog array")
    fixture = actual_catalog[0]
    if fixture != report["existing_cinderback_catalog_definition"]:
        raise ValueError("actual recoil catalog receipt differs from the prior catalog snapshot")

    def convert_reference(value: object, transform: str) -> object:
        if transform in {"identity", "identity/null"}:
            return value
        if transform == "troop→unit":
            return "unit" if value == "troop" else value
        if transform == "common→standard":
            return "standard" if value == "common" else value
        if transform == "seconds×60":
            return None if value is None else value * 60
        if transform in {"tiles×1000", "tiles/second×1000"}:
            return None if value is None else value * 1000
        if transform == "air_and_ground→ground-and-air":
            return "ground-and-air" if value == "air_and_ground" else value
        if transform == "tiles×1000/null":
            return None if value is None else value * 1000
        raise ValueError(f"unknown comparator transform: {transform}")

    comparator_fields = report["test_only_binding"]["comparator_fields"]
    if len(comparator_fields) != 14:
        raise ValueError(f"expected 14 test comparator mappings, got {len(comparator_fields)}")
    unverified = set(local["unverified_fields"])
    lines = ["comparator_ordinal\tfixture_field\tfixture_value_json\treference_field\tnormalized_reference_value_json\texpected_fixture_value_json\ttest_comparator_transform\texact_value_match\treference_is_unverified\tparity_disposition\tactual_fixture_receipt\traw_source_path_and_value_json\tsource_confidence_or_Q\tmechanic_scope_note\n"]
    seen_fixture_fields: set[str] = set()
    seen_reference_fields: set[str] = set()
    for ordinal, mapping in enumerate(comparator_fields):
        if len(mapping) != 3:
            raise ValueError(f"test comparator mapping {ordinal} is not a three-item mapping")
        fixture_field, reference_field, transform = mapping
        if fixture_field in seen_fixture_fields or reference_field in seen_reference_fields:
            raise ValueError(f"duplicate test comparator field at ordinal {ordinal}")
        seen_fixture_fields.add(fixture_field)
        seen_reference_fields.add(reference_field)
        if fixture_field not in fixture or reference_field not in local:
            raise ValueError(f"test comparator field {fixture_field}/{reference_field} is missing from its receipt")
        fixture_value = fixture[fixture_field]
        reference_value = local[reference_field]
        expected_fixture_value = convert_reference(reference_value, transform)
        if isinstance(expected_fixture_value, float) and expected_fixture_value.is_integer():
            expected_fixture_value = int(expected_fixture_value)
        matches = fixture_value == expected_fixture_value
        question = reference_field in unverified
        disposition = (
            "question-backed-match" if question and matches else
            "question" if question else
            "match" if matches else
            "authoritative-failure"
        )
        if question:
            confidence = "QUESTION: normalized reference field is listed in unverified_fields; equality remains question-backed despite the datamine value"
        else:
            confidence = "not listed in normalized reference unverified_fields; apply the exact test comparator disposition without an added mechanics claim"
        if reference_field == "first_hit_seconds":
            confidence += "; official −0.4s/40% note does not map load_time to consumer phase; keep load_time and hit_speed separate"
        if reference_field in {"damage", "area_damage_radius_tiles"} and reference_value is None:
            confidence += "; normalized null does not establish absence of linked projectile/effect mechanics"
        note = "comparison is only the existing test's field mapping; raw linked rows do not define consumer timing, damage composition, or contact behavior"
        raw_refs = source_paths.get(reference_field, [])
        lines.append("\t".join((
            str(ordinal), fixture_field,
            json.dumps(fixture_value, ensure_ascii=False, separators=(",", ":")),
            reference_field,
            json.dumps(reference_value, ensure_ascii=False, separators=(",", ":")),
            json.dumps(expected_fixture_value, ensure_ascii=False, separators=(",", ":")),
            transform,
            str(matches).lower(),
            str(question).lower(),
            disposition,
            "current-catalog-profile-receipts.json#recoilSpecialCatalog[0]",
            json.dumps(raw_refs, ensure_ascii=False, separators=(",", ":")),
            confidence,
            note,
        )) + "\n")
    (ROOT / "normalized-comparison.tsv").write_text("".join(lines), encoding="utf-8")

    # Keep the complete normalized Firecracker projection visible in a separate
    # context table. These rows are not Cinderback comparator rows.
    context = ["reference_field\tnormalized_value_json\traw_source_path_and_value_json\tsource_confidence_or_Q\tdisposition\n"]
    for reference_field, value in local.items():
        raw_refs = source_paths.get(reference_field, [])
        if reference_field in unverified:
            confidence = "QUESTION: normalized card unverified_fields applies; raw datamine value alone does not promote confidence"
        elif reference_field == "area_damage_radius_tiles" and value is None:
            confidence = "normalized null; not evidence of no projectile or area effect"
        else:
            confidence = "normalized reference context; not a Cinderback comparator row"
        if reference_field == "first_hit_seconds":
            confidence += "; root supplied relative official note does not identify this raw field's consumer phase"
        context.append("\t".join((
            reference_field,
            json.dumps(value, ensure_ascii=False, separators=(",", ":")),
            json.dumps(raw_refs, ensure_ascii=False, separators=(",", ":")),
            confidence,
            "reference context only; comparator rows are in normalized-comparison.tsv",
        )) + "\n")
    for index, component in enumerate(local.get("components", [])):
        for field, value in component.items():
            context.append("\t".join((
                f"components[{index}].{field}",
                json.dumps(value, ensure_ascii=False, separators=(",", ":")),
                json.dumps([(f"character/component source row; complete raw row in pinned-linked-rows.json", value)], ensure_ascii=False),
                "QUESTION-backed where parent reference field is unverified; component projection is not an additional source",
                "reference context only; comparator rows are in normalized-comparison.tsv",
            )) + "\n")
    (ROOT / "firecracker-normalized-context.tsv").write_text("".join(context), encoding="utf-8")


def write_source_ledger(fetches: list[dict]) -> None:
    lines = ["source_commit\tfilename\tcanonical_url\turl_used\tfinal_raw_url\thttp_status\tdirect_exit_code\traw_bytes\traw_sha256\tgit_blob_sha1\trows_or_groups\n"]
    for receipt in fetches:
        lines.append("\t".join((
            COMMIT,
            receipt["filename"],
            receipt["canonical_url"],
            receipt["url_used"],
            str(receipt.get("final_raw_url")),
            str(receipt.get("http_status")),
            str(receipt.get("direct_exit_code")),
            str(receipt.get("raw_bytes", "")),
            str(receipt.get("raw_sha256", "")),
            str(receipt.get("git_blob_sha1", "")),
            json.dumps(receipt.get("rows_or_groups_in_source_file"), separators=(",", ":")),
        )) + "\n")
    (ROOT / "SOURCE-LEDGER.tsv").write_text("".join(lines))


def main() -> None:
    fetches: list[dict] = []
    data_by_file: dict[str, object] = {}
    for index, filename in enumerate(CORE_FILES, start=1):
        data_by_file[filename] = fetch(filename, index, fetches)
    link_screen = {"fetches": fetches}
    report, rows = compare_local_rows(data_by_file, link_screen)
    # A buff table is fetched only if an explicit non-null buff link was encountered.
    # compare_local_rows adds a fetch receipt there; the parsed table is retained only in-memory.
    source_receipts = {
        "accessed_utc": utc_now(),
        "source_commit": COMMIT,
        "source_commit_date_utc": COMMIT_DATE_UTC,
        "fetch_implementation": "extract_firecracker_signature.py with Python urllib.request; User-Agent Cinderback-Firecracker-pinned-source-audit/1.0",
        "source_files": fetches,
        "upstream_payload_policy": "Successful upstream payload bytes were hashed in memory and not saved. Only selected complete ordered rows and exact linked duplicates are written.",
        "selected_rows_artifact": "pinned-linked-rows.json",
        "extractor_sha256": sha256(Path(__file__).read_bytes()),
    }
    report["source_commit"] = COMMIT
    report["source_commit_url"] = f"https://github.com/RoyaleAPI/cr-api-data/commit/{COMMIT}"
    report["source_commit_date_utc"] = COMMIT_DATE_UTC
    report["local_baseline_commit"] = BASELINE_COMMIT
    report["source_file_receipts"] = fetches
    payload = canonical_bytes(report)
    source_receipts["selected_rows_artifact_sha256"] = sha256(payload)
    source_receipts["selected_rows_artifact_bytes"] = len(payload)
    (ROOT / "pinned-linked-rows.json").write_bytes(payload)
    (ROOT / "source-receipts.json").write_bytes(canonical_bytes(source_receipts))
    write_field_dispositions(rows)
    write_comparison(report)
    write_source_ledger(fetches)
    print(json.dumps({
        "source_files": [item["filename"] for item in fetches],
        "selected_rows": list(report["full_rows"]),
        "primary_ordered_field_total": report["primary_ordered_field_total"],
        "projectile_link_candidates": report["join_resolution"]["projectile_link_candidates"],
        "recursive_dependency_count": len(report["join_resolution"]["recursive_explicit_dependencies"]),
        "selected_rows_sha256": source_receipts["selected_rows_artifact_sha256"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
