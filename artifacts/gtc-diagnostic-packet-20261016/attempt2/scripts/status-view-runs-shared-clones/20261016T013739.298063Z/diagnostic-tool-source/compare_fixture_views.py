#!/usr/bin/env python3
"""Compare captured GTC setup/snapshots with only the known Briar additions stripped."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import sys


BRIAR_ARCHETYPES = {"briar-runner", "briar-darter"}


def canonical_bytes(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False).encode("utf-8")


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def identity_key(old_values: list[object], new_values: list[object]) -> str | None:
    values = old_values + new_values
    if not all(isinstance(value, dict) for value in values):
        return None
    for field in ("id", "key", "archetypeId"):
        old_keys = [value.get(field) for value in old_values]
        new_keys = [value.get(field) for value in new_values]
        keys = old_keys + new_keys
        if (all(isinstance(key, (str, int)) for key in keys) and
                len(set(old_keys)) == len(old_keys) and len(set(new_keys)) == len(new_keys)):
            return field
    return None


def differences(old: object, new: object, path: str = "$") -> list[dict[str, object]]:
    if isinstance(old, dict) and isinstance(new, dict):
        result = []
        for key in sorted(set(old) | set(new)):
            child = f"{path}.{key}"
            if key not in old:
                result.append({"path": child, "kind": "added", "new": new[key]})
            elif key not in new:
                result.append({"path": child, "kind": "removed", "old": old[key]})
            else:
                result.extend(differences(old[key], new[key], child))
        return result
    if isinstance(old, list) and isinstance(new, list):
        discriminator = identity_key(old, new)
        if discriminator is not None:
            before = {item[discriminator]: item for item in old}
            after = {item[discriminator]: item for item in new}
            result = []
            for key in sorted(set(before) | set(after), key=str):
                child = f"{path}[{discriminator}={key!r}]"
                if key not in before:
                    result.append({"path": child, "kind": "added", "new": after[key]})
                elif key not in after:
                    result.append({"path": child, "kind": "removed", "old": before[key]})
                else:
                    result.extend(differences(before[key], after[key], child))
            return result
        result = []
        for index in range(max(len(old), len(new))):
            child = f"{path}[{index}]"
            if index >= len(old):
                result.append({"path": child, "kind": "added", "new": new[index]})
            elif index >= len(new):
                result.append({"path": child, "kind": "removed", "old": old[index]})
            else:
                result.extend(differences(old[index], new[index], child))
        return result
    if isinstance(old, str) and isinstance(new, str) and old != new:
        if path.endswith(".battleSetup") or path.endswith(".rosterWitness"):
            try:
                left = json.loads(old)
                right = json.loads(new)
            except json.JSONDecodeError:
                pass
            else:
                nested = differences(left, right, f"{path} [parsed]")
                if nested:
                    return nested
        return [{"path": path, "kind": "changed-string",
                 "old_bytes": len(old.encode("utf-8")),
                 "new_bytes": len(new.encode("utf-8")),
                 "old_sha256": sha(old.encode("utf-8")),
                 "new_sha256": sha(new.encode("utf-8"))}]
    if old != new:
        return [{"path": path, "kind": "changed", "old": old, "new": new}]
    return []


def decode_json_string(value: object, path: str) -> object:
    if not isinstance(value, str):
        raise ValueError(f"{path} is not a JSON string")
    return json.loads(value)


def briar_added_records(old_setup: dict[str, object], new_setup: dict[str, object],
                        label: str) -> tuple[dict[str, object], dict[str, object]]:
    """Return precise added Briar policies/questions; do not mutate either input."""
    old_roster = old_setup.get("roster")
    new_roster = new_setup.get("roster")
    old_questions = old_setup.get("questions")
    new_questions = new_setup.get("questions")
    if not isinstance(old_roster, list) or not isinstance(new_roster, list) or \
            not isinstance(old_questions, list) or not isinstance(new_questions, list):
        raise ValueError(f"{label} must expose roster and question arrays")

    def policy_map(roster: list[object]) -> dict[str, object]:
        cards = [card for card in roster if isinstance(card, dict) and card.get("id") == "briar-band"]
        if len(cards) != 1:
            raise ValueError(f"{label}: expected exactly one briar-band roster card")
        entities = cards[0].get("entities")
        if not isinstance(entities, list):
            raise ValueError(f"{label}: briar-band entities are missing")
        result = {}
        for entity in entities:
            if isinstance(entity, dict) and entity.get("archetypeId") in BRIAR_ARCHETYPES:
                if "sourceConfidencePolicy" in entity:
                    result[entity["archetypeId"]] = entity["sourceConfidencePolicy"]
        return result

    old_policies = policy_map(old_roster)
    new_policies = policy_map(new_roster)
    added_policies = {key: value for key, value in new_policies.items() if key not in old_policies}
    if old_policies or set(added_policies) != BRIAR_ARCHETYPES:
        raise ValueError(f"{label}: observed Briar policies differ from expected historical/current boundary: "
                         f"old={sorted(old_policies)}, current-added={sorted(added_policies)}")
    question_key_set = set()
    for policy in added_policies.values():
        if not isinstance(policy, dict) or not isinstance(policy.get("fields"), list):
            raise ValueError(f"{label}: new Briar policy shape is unexpected")
        for field in policy["fields"]:
            if not isinstance(field, dict) or not isinstance(field.get("questionKey"), str):
                raise ValueError(f"{label}: Briar policy field has no questionKey")
            question_key_set.add(field["questionKey"])
    current_questions = [question for question in new_questions
                         if isinstance(question, dict) and question.get("key") in question_key_set]
    old_questions_with_keys = [question for question in old_questions
                               if isinstance(question, dict) and question.get("key") in question_key_set]
    if len(question_key_set) != 20 or len(current_questions) != 20 or old_questions_with_keys:
        raise ValueError(f"{label}: expected exactly 20 newly-added Briar QUESTION records; "
                         f"policyKeys={len(question_key_set)}, currentRecords={len(current_questions)}, "
                         f"historicalMatches={len(old_questions_with_keys)}")
    if {question["key"] for question in current_questions} != question_key_set:
        raise ValueError(f"{label}: current Briar QUESTION keys do not exactly match policy keys")
    return ({"policies": added_policies, "question_keys": sorted(question_key_set),
             "question_records": current_questions},
            {"policy_json_bytes": sum(len(canonical_bytes(policy)) for policy in added_policies.values()),
             "question_record_json_bytes": sum(len(canonical_bytes(record)) for record in current_questions),
             "policy_field_count": sum(len(policy["fields"]) for policy in added_policies.values())})


def strip_only_briar_additions(value: object, label: str) -> tuple[object, dict[str, object]]:
    result = copy.deepcopy(value)
    if not isinstance(result, dict):
        raise ValueError(f"{label} is not an object")
    roster = result.get("roster")
    questions = result.get("questions")
    if not isinstance(roster, list) or not isinstance(questions, list):
        raise ValueError(f"{label} has no roster/questions fields")
    removed_policies = []
    for card_index, card in enumerate(roster):
        if not isinstance(card, dict) or card.get("id") != "briar-band":
            continue
        for entity_index, entity in enumerate(card.get("entities", [])):
            if not isinstance(entity, dict) or entity.get("archetypeId") not in BRIAR_ARCHETYPES:
                continue
            if "sourceConfidencePolicy" in entity:
                removed_policies.append({"path": f"{label}.roster[{card_index}].entities[{entity_index}].sourceConfidencePolicy",
                                         "archetype_id": entity.get("archetypeId"),
                                         "value": entity.pop("sourceConfidencePolicy")})
    policy_keys = {field["questionKey"]
                   for item in removed_policies
                   for field in item["value"].get("fields", [])}
    removed_questions = []
    kept_questions = []
    for index, question in enumerate(questions):
        if isinstance(question, dict) and question.get("key") in policy_keys:
            removed_questions.append({"path": f"{label}.questions[{index}]", "value": question})
        else:
            kept_questions.append(question)
    result["questions"] = kept_questions
    report = {"removed_policy_paths": removed_policies,
              "removed_question_records": removed_questions,
              "removed_policy_question_keys": sorted(policy_keys)}
    return result, report


def normalise_empty(value: object, label: str) -> tuple[object, dict[str, object]]:
    result = copy.deepcopy(value)
    if not isinstance(result, dict):
        raise ValueError(f"{label} is not an object")
    if "setup" in result and isinstance(result["setup"], dict):
        result["setup"], setup_report = strip_only_briar_additions(result["setup"], f"{label}.setup")
        return result, setup_report
    return strip_only_briar_additions(result, label)


def exact_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def compare_empty(old_dir: Path, current_dir: Path, output_path: Path) -> dict[str, object]:
    old_setup = exact_json(old_dir / "setup.json")
    current_setup = exact_json(current_dir / "setup.json")
    old_snapshot = exact_json(old_dir / "snapshot.json")
    current_snapshot = exact_json(current_dir / "snapshot.json")
    known_additions, byte_estimate = briar_added_records(old_setup, current_setup, "empty LiveBattle")
    norm_old_setup = old_setup
    norm_current_setup, setup_removed = strip_only_briar_additions(current_setup, "current.setup")
    norm_old_snapshot = old_snapshot
    norm_current_snapshot, snapshot_removed = normalise_empty(current_snapshot, "current.snapshot")
    old_raw = (old_dir / "snapshot.raw").read_bytes()
    current_raw = (current_dir / "snapshot.raw").read_bytes()
    normalized_bytes = canonical_bytes(norm_current_snapshot)
    result = {
        "kind": "empty-live-battle-v2",
        "historical_probe": str(old_dir), "current_probe": str(current_dir),
        "unfiltered_setup_differences": differences(norm_old_setup, current_setup),
        "unfiltered_snapshot_differences": differences(old_snapshot, current_snapshot),
        "known_added_briar_records": known_additions,
        "measured_addition_sizes": byte_estimate,
        "unfiltered_snapshot_bytes": {"historical": len(old_raw), "current": len(current_raw),
                                       "delta_current_minus_historical": len(current_raw) - len(old_raw),
                                       "historical_sha256": sha(old_raw), "current_sha256": sha(current_raw)},
        "exact_removal_manifest": {"setup": setup_removed, "snapshot": snapshot_removed},
        "setup_equal_after_exact_removal": norm_old_setup == norm_current_setup,
        "snapshot_equal_after_exact_removal": norm_old_snapshot == norm_current_snapshot,
        "snapshot_normalized_canonical_bytes": {"bytes": len(normalized_bytes), "sha256": sha(normalized_bytes)},
        "snapshot_normalized_equals_historical_raw": normalized_bytes == old_raw,
        "residual_snapshot_differences": differences(norm_old_snapshot, norm_current_snapshot),
    }
    output_path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return result


def normalize_status_setup(setup: dict[str, object], label: str) -> tuple[dict[str, object], dict[str, object]]:
    result = copy.deepcopy(setup)
    details = {}
    for field in ("battleSetup", "rosterWitness"):
        parsed = decode_json_string(result.get(field), f"{label}.{field}")
        stripped, report = strip_only_briar_additions(parsed, f"{label}.{field}")
        result[field] = canonical_bytes(stripped).decode("utf-8")
        details[field] = report
    return result, details


def status_capture(path: Path) -> dict[str, object]:
    return exact_json(path)


def compare_status(old_dir: Path, current_dir: Path, output_dir: Path) -> dict[str, object]:
    per_id = {}
    ids = ["bloom-wisp", "dawnmender", "pulse-sentry", "rime-adept", "tether-rider", "veil-prowler"]
    all_removals = {}
    for card_id in ids:
        old = status_capture(old_dir / f"{card_id}.json")
        current = status_capture(current_dir / f"{card_id}.json")
        old_setup = old["setup"]
        current_setup = current["setup"]
        old_battle = decode_json_string(old_setup["battleSetup"], f"old[{card_id}].battleSetup")
        current_battle = decode_json_string(current_setup["battleSetup"], f"current[{card_id}].battleSetup")
        briar, byte_estimate = briar_added_records(old_battle, current_battle, f"status[{card_id}]")
        normalized_old_setup, _ = normalize_status_setup(old_setup, f"old[{card_id}].setup")
        normalized_current_setup, removals = normalize_status_setup(current_setup,
                                                                     f"current[{card_id}].setup")
        old_snapshot = old["snapshot"]
        current_snapshot = current["snapshot"]
        old_snapshot_nonsetup = {key: value for key, value in old_snapshot.items() if key != "setup"}
        current_snapshot_nonsetup = {key: value for key, value in current_snapshot.items() if key != "setup"}
        normalized_old_snapshot = copy.deepcopy(old_snapshot)
        normalized_current_snapshot = copy.deepcopy(current_snapshot)
        normalized_old_snapshot["setup"] = normalized_old_setup
        normalized_current_snapshot["setup"] = normalized_current_setup
        old_replay_bytes = old["replayBytes"].encode("utf-8")
        current_replay_bytes = current["replayBytes"].encode("utf-8")
        old_snapshot_bytes = old["snapshotBytes"].encode("utf-8")
        current_snapshot_bytes = current["snapshotBytes"].encode("utf-8")
        per_id[card_id] = {
            "replay_bytes_equal": old["replayBytes"] == current["replayBytes"],
            "replay_hashes": {"historical": sha(old_replay_bytes), "current": sha(current_replay_bytes)},
            "replay_event_object_equal": old["replayObject"] == current["replayObject"],
            "replay_property_equal": old["replayEvents"] == current["replayEvents"],
            "state_equal": old["state"] == current["state"],
            "unfiltered_state_differences": differences(old["state"], current["state"]),
            "unfiltered_event_differences": differences(old["replayObject"], current["replayObject"]),
            "unfiltered_snapshot_differences": differences(old_snapshot, current_snapshot),
            "unfiltered_snapshot_bytes": {"historical": len(old_snapshot_bytes),
                                           "current": len(current_snapshot_bytes),
                                           "delta_current_minus_historical": len(current_snapshot_bytes) - len(old_snapshot_bytes),
                                           "historical_sha256": sha(old_snapshot_bytes),
                                           "current_sha256": sha(current_snapshot_bytes)},
            "snapshot_non_setup_equal": old_snapshot_nonsetup == current_snapshot_nonsetup,
            "setup_equal_after_exact_removal": normalized_old_setup == normalized_current_setup,
            "snapshot_equal_after_exact_removal": normalized_old_snapshot == normalized_current_snapshot,
            "setup_field_byte_deltas": {
                field: len(current_setup[field].encode("utf-8")) - len(old_setup[field].encode("utf-8"))
                for field in ("battleSetup", "rosterWitness")},
            "setup_source_additions": briar,
            "measured_addition_sizes": byte_estimate,
            "exact_removal_manifest": removals,
            "residual_snapshot_differences_after_exact_removal": differences(normalized_old_snapshot,
                                                                              normalized_current_snapshot),
        }
        all_removals[card_id] = removals
    result = {"kind": "six-status-session-scenarios",
              "historical_capture_directory": str(old_dir),
              "current_capture_directory": str(current_dir),
              "same_known_setup_delta_for_all_six": len({
                  tuple(sorted(item["setup_field_byte_deltas"].items())) for item in per_id.values()
              }) == 1,
              "cases": per_id}
    output_path = output_dir / "status-fixture-comparison.json"
    output_path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return result


def main() -> int:
    if len(sys.argv) not in (4, 6):
        raise SystemExit("usage: compare_fixture_views.py EMPTY_OLD EMPTY_CURRENT OUTPUT_DIR "
                         "[STATUS_OLD STATUS_CURRENT]")
    empty_old, empty_current, output_dir = map(Path, sys.argv[1:4])
    output_dir.mkdir(parents=True, exist_ok=True)
    result = {"empty_live_battle": compare_empty(empty_old, empty_current,
                                                  output_dir / "empty-fixture-comparison.json")}
    if len(sys.argv) == 6:
        result["status_scenarios"] = compare_status(Path(sys.argv[4]), Path(sys.argv[5]), output_dir)
    combined = output_dir / "fixture-comparison-summary.json"
    combined.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(combined)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
