#!/usr/bin/env python3
"""Verify candidate source bytes against the pinned main-source freeze."""

import hashlib
import json
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
FREEZE = ROOT / "docs/art/copperskiff-source-freeze.json"
CONFIG_NAME = re.compile(
    r"(?:^|[.-])(config|rc)(?:[.-]|$)|"
    r"^(?:vite|vitest|playwright|eslint|babel|jest|postcss|tailwind|webpack|rollup)\.",
    re.IGNORECASE,
)
EXPLICIT_CONFIG_NAMES = {
    ".gitignore", ".gitattributes", ".nvmrc", ".npmrc", ".node-version",
    "package.json", "package-lock.json",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def current_scope() -> dict[str, str]:
    paths: dict[str, str] = {}
    for directory in ("src", "public"):
        for path in sorted((ROOT / directory).rglob("*")):
            if path.is_file():
                paths[path.relative_to(ROOT).as_posix()] = sha256(path)
    for path in sorted(ROOT.iterdir()):
        if path.is_file() and (
            path.name in EXPLICIT_CONFIG_NAMES or CONFIG_NAME.search(path.name)
        ):
            paths[path.name] = sha256(path)
    return paths


def main() -> int:
    freeze = json.loads(FREEZE.read_text(encoding="utf-8"))
    baseline: dict[str, str] = freeze["baselineFiles"]
    expected: dict[str, str] = freeze["candidateFiles"]
    owned: dict[str, str] = freeze["ownedPaths"]
    actual = current_scope()
    failures: list[dict[str, str]] = []

    for path in sorted(set(expected) - set(actual)):
        failures.append({"path": path, "reason": "candidate source/config file is missing"})
    for path in sorted(set(actual) - set(expected)):
        failures.append({"path": path, "reason": "source/config file is outside the frozen inventory"})

    for path in sorted(set(actual) & set(expected)):
        if actual[path] != expected[path]:
            failures.append({"path": path, "reason": "candidate differs from its frozen SHA-256"})
            continue
        if path not in owned:
            if path not in baseline:
                failures.append({"path": path, "reason": "unowned source/config file is absent from pinned main"})
            elif actual[path] != baseline[path]:
                failures.append({"path": path, "reason": "unowned file differs from pinned main"})

    for path in sorted(path for path in baseline if path.startswith(("src/", "public/"))):
        if path not in actual:
            failures.append({"path": path, "reason": "pinned main src/public file is missing"})

    immutable_files = freeze.get("immutableFiles", {})
    immutable_results: dict[str, str] = {}
    for path, expected_sha256 in sorted(immutable_files.items()):
        immutable_path = ROOT / path
        if not immutable_path.is_file():
            failures.append({"path": path, "reason": "immutable file is missing"})
            continue
        actual_sha256 = sha256(immutable_path)
        immutable_results[path] = actual_sha256
        if actual_sha256 != expected_sha256:
            failures.append({"path": path, "reason": "immutable file differs from its pinned SHA-256"})

    expected_added = sorted(freeze["expectedAddedPaths"])
    actual_added = sorted(path for path in actual if path not in baseline)
    if actual_added != expected_added:
        failures.append({
            "path": "src/public",
            "reason": "added source/public paths differ from the owned allowlist",
        })
    for path in sorted(set(owned) - set(expected)):
        failures.append({"path": path, "reason": "owned path is missing from the frozen candidate"})

    result = {
        "ok": not failures,
        "mainCommit": freeze["mainCommit"],
        "checkedFiles": len(actual),
        "ownedPaths": sorted(owned),
        "pinnedUnownedFiles": sum(1 for path in actual if path not in owned),
        "expectedAddedPaths": expected_added,
        "immutableFiles": immutable_results,
        "failures": failures,
    }
    print(json.dumps(result, sort_keys=True))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
