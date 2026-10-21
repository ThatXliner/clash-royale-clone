#!/usr/bin/env python3
"""Create an exact R3 source freeze from canonical main and the isolated candidate."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CANONICAL_MAIN = "16b8ad1664117dcb928ce3bcf3e2fdac45ab23a9"
ROOT_RUNTIME_EQUIVALENT_HEAD = "81d181e2e28fed4ad8216cf8b826e6c39c4b68d5"
FREEZE = ROOT / "docs/art/copperskiff-source-freeze.json"
SPRITE_PROVENANCE = ROOT / "docs/art/copperskiff-battle-sprite-provenance.json"
GATE_TEST = "tests/copperskiff-live-sprite-game-browser.test.js"
GATE_TEST_SHA256 = "df5c179fb8641ff7c6150414ae3c4add0b0ea330d24d0d4b75193120ec758a2b"
SOURCE_FRAMES_ROOT = ROOT / "design/20261020-redesign/astra-round-4/generated/attempt-20261020T172856Z-81044/comparison/tapered_canopy/raw-256"
SOURCE_FREEZE_HISTORY = Path(
    "/Users/me/.codex/clash-qualification/20261020-copperskiff-readability-r3/history/copperskiff-source-freeze-r1.json"
)
R2_ROOT = Path("/Users/me/.codex/clash-qualification/20261020-copperskiff-desktop-restore-paint-r2")
RUNTIME_OWNED = {
    "public/ui-arena-shell.html": "R2 HUD pseudo-element paint stabilization",
    "public/assets/copperskiff-battle-sprite.png": "R2 atlas; R3 may replace only with a reviewed postprocessed atlas",
    "src/content/visual-asset-manifest.js": "R2 visual asset registration; R3 may update only the selected atlas identity",
    "src/ui/combat-art.js": "R2 sprite mapping and tower-health paint stabilization",
    "src/ui/combat-motion.js": "R2 deterministic sprite pose projection",
    "src/ui/combat-state.js": "R2 canonical facing and pose projection",
}
ALLOWED_FINAL_RUNTIME_CHANGES = {
    "public/assets/copperskiff-battle-sprite.png": "selected R3 sprite atlas; full frame windows, pivots, and source colors remain pinned",
    "src/content/visual-asset-manifest.js": "matching R3 atlas SHA-256 and byte length only",
}
ALLOWED_FINAL_PROVENANCE_CHANGES = {
    "docs/art/copperskiff-battle-sprite-provenance.json": "record exact input, intentional postprocess, and shipped output hashes",
}
CONFIG_NAME = re.compile(
    r"(?:^|[.-])(config|rc)(?:[.-]|$)|"
    r"^(?:vite|vitest|playwright|eslint|babel|jest|postcss|tailwind|webpack|rollup)\.",
    re.IGNORECASE,
)
EXPLICIT_CONFIG_NAMES = {
    ".gitignore", ".gitattributes", ".nvmrc", ".npmrc", ".node-version",
    "package.json", "package-lock.json",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def current_scope() -> dict[str, str]:
    paths: dict[str, str] = {}
    for directory in ("src", "public"):
        for path in sorted((ROOT / directory).rglob("*")):
            if path.is_file():
                paths[path.relative_to(ROOT).as_posix()] = sha256_file(path)
    for path in sorted(ROOT.iterdir()):
        if path.is_file() and (
            path.name in EXPLICIT_CONFIG_NAMES or CONFIG_NAME.search(path.name)
        ):
            paths[path.name] = sha256_file(path)
    return paths


def git_bytes(git_root: Path, revision: str, path: str) -> bytes:
    return subprocess.run(
        ["git", "-C", str(git_root), "show", f"{revision}:{path}"],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    ).stdout


def canonical_scope(git_root: Path) -> dict[str, str]:
    result = subprocess.run(
        ["git", "-C", str(git_root), "ls-tree", "-r", "--name-only", CANONICAL_MAIN],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    paths = result.stdout.splitlines()
    scoped = [
        path for path in paths
        if path.startswith(("src/", "public/"))
        or ("/" not in path and (
            path in EXPLICIT_CONFIG_NAMES or CONFIG_NAME.search(path)
        ))
    ]
    return {path: sha256_bytes(git_bytes(git_root, CANONICAL_MAIN, path)) for path in sorted(scoped)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--git-root",
        type=Path,
        default=Path("/Users/me/.codex/worktrees/9456/clash-royale-clone"),
        help="read-only Git checkout containing canonical main history",
    )
    parser.add_argument(
        "--runtime-equivalent-head",
        default=ROOT_RUNTIME_EQUIVALENT_HEAD,
        help="root-confirmed HEAD whose product source matches the canonical main freeze",
    )
    args = parser.parse_args()
    git_root = args.git_root.resolve()
    actual = current_scope()
    baseline = canonical_scope(git_root)
    added = sorted(set(actual) - set(baseline))
    expected_added = ["public/assets/copperskiff-battle-sprite.png"]
    if added != expected_added:
        raise ValueError(f"unexpected added src/public/config paths: {added}")
    missing = sorted(set(baseline) - set(actual))
    if missing:
        raise ValueError(f"candidate is missing canonical paths: {missing}")
    for path in sorted(set(actual) & set(baseline)):
        if path not in RUNTIME_OWNED and actual[path] != baseline[path]:
            raise ValueError(f"unowned candidate path differs from canonical main: {path}")
    missing_owned = sorted(set(RUNTIME_OWNED) - set(actual))
    if missing_owned:
        raise ValueError(f"owned runtime paths missing from candidate: {missing_owned}")
    if sha256_file(ROOT / GATE_TEST) != GATE_TEST_SHA256:
        raise ValueError(f"immutable browser gate bytes changed: {GATE_TEST}")

    historical_freeze_hash = sha256_file(SOURCE_FREEZE_HISTORY)
    source_provenance = json.loads(SPRITE_PROVENANCE.read_text(encoding="utf-8"))
    source_frames: list[dict[str, str]] = []
    for name, expected_hash in sorted(source_provenance["source_frames"]["sha256"].items()):
        frame = SOURCE_FRAMES_ROOT / name
        actual_hash = sha256_file(frame)
        if actual_hash != expected_hash:
            raise ValueError(f"pinned R4 frame changed: {name} ({actual_hash})")
        source_frames.append({"path": frame.relative_to(ROOT).as_posix(), "sha256": actual_hash})

    initial_runtime = {}
    for path in RUNTIME_OWNED:
        source_path = R2_ROOT / path
        if not source_path.is_file():
            raise ValueError(f"missing immutable R2 runtime baseline: {source_path}")
        r2_hash = sha256_file(source_path)
        if path not in ALLOWED_FINAL_RUNTIME_CHANGES and actual[path] != r2_hash:
            raise ValueError(f"candidate changed a non-allowed R2 runtime path: {path}")
        initial_runtime[path] = r2_hash

    initial_provenance = {}
    for path in ALLOWED_FINAL_PROVENANCE_CHANGES:
        source_path = R2_ROOT / path
        if not source_path.is_file():
            raise ValueError(f"missing immutable R2 provenance baseline: {source_path}")
        initial_provenance[path] = sha256_file(source_path)

    freeze: dict[str, Any] = {
        "schemaVersion": 2,
        "purpose": "R3 exact source preflight. Generated from canonical 16b8ad1 and the isolated R2 candidate; refresh candidateFiles only after the selected R3 asset and its provenance are final.",
        "mainCommit": CANONICAL_MAIN,
        "rootRuntimeEquivalentHead": args.runtime_equivalent_head,
        "baselineFiles": baseline,
        "candidateFiles": actual,
        "ownedPaths": RUNTIME_OWNED,
        "ownedRuntimeR2Baseline": initial_runtime,
        "allowedFinalRuntimeChanges": ALLOWED_FINAL_RUNTIME_CHANGES,
        "allowedFinalProvenanceChanges": {
            path: {
                "reason": ALLOWED_FINAL_PROVENANCE_CHANGES[path],
                "r2Sha256": initial_provenance[path],
            }
            for path in ALLOWED_FINAL_PROVENANCE_CHANGES
        },
        "expectedAddedPaths": expected_added,
        "immutableFiles": {
            GATE_TEST: GATE_TEST_SHA256,
        },
        "pinnedR4SourceFrames": source_frames,
        "historicalR1Freeze": {
            "externalPath": str(SOURCE_FREEZE_HISTORY),
            "sha256": historical_freeze_hash,
        },
        "initialCandidate": {
            "r2CandidatePath": str(R2_ROOT),
            "currentCandidateSha256": actual,
            "browserGateSha256": GATE_TEST_SHA256,
        },
    }
    FREEZE.write_text(json.dumps(freeze, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "freezePath": str(FREEZE),
        "mainCommit": CANONICAL_MAIN,
        "runtimeEquivalentHead": args.runtime_equivalent_head,
        "baselineFileCount": len(baseline),
        "candidateFileCount": len(actual),
        "ownedRuntimePaths": sorted(RUNTIME_OWNED),
        "expectedAddedPaths": expected_added,
        "immutableGateTestSha256": GATE_TEST_SHA256,
        "historicalR1FreezeSha256": historical_freeze_hash,
        "receiptSha256": sha256_file(FREEZE),
        "status": "written; checker/test not executed",
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"prepare-copperskiff-readability-r3-source-freeze: {error}", file=sys.stderr)
        raise SystemExit(1)
