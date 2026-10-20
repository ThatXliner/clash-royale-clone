#!/usr/bin/env python3
"""Copy only pinned GAME-001ASC inputs from df86 into the critic-owned area."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
from datetime import datetime, timezone

REPO = Path("/Users/me/.codex/worktrees/9456/clash-royale-clone")
OWN = Path("/Users/me/.codex/clash-qualification/20261020-asc-critic")
CANDIDATE = "df86f516ec717a252c1c244bb0f1c1cdc477ee7e"
BASE_734 = "734dd8e3c5c8f21703b8fd39727e69f51eb93ab3"
EXPECTED_SRC_TREE = "01d869b32c563dac270acd4fddc7fa4d0ec207de"
OUTPUT = OWN / "df86-input"
MANIFEST = OWN / "df86-input-manifest.json"
PATHS = (
    ".nvmrc",
    "package.json",
    "package-lock.json",
    "src",
    "docs/rl-api.md",
    "docs/verification.md",
    "tests/game-troop-runtime-runner.js",
    "tests/game-troop-runtime.test.js",
    "tests/fixtures/source-vintage-checkpoints",
)
OWNED_CHANGED_PATHS = (
    "docs/rl-api.md",
    "docs/verification.md",
    "tests/fixtures/source-vintage-checkpoints/2a-game-session-bloom-wisp-v2.snapshot",
    "tests/fixtures/source-vintage-checkpoints/2a-game-session-dawnmender-v2.snapshot",
    "tests/fixtures/source-vintage-checkpoints/2a-game-session-pulse-sentry-v2.snapshot",
    "tests/fixtures/source-vintage-checkpoints/2a-game-session-rime-adept-v2.snapshot",
    "tests/fixtures/source-vintage-checkpoints/2a-game-session-tether-rider-v2.snapshot",
    "tests/fixtures/source-vintage-checkpoints/2a-game-session-veil-prowler-v2.snapshot",
    "tests/fixtures/source-vintage-checkpoints/README.md",
    "tests/fixtures/source-vintage-checkpoints/c9-empty-live-battle-v2.snapshot",
    "tests/game-troop-runtime.test.js",
)


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess[bytes]:
    result = subprocess.run(["git", *args], cwd=REPO, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and result.returncode != 0:
        raise SystemExit(result.stderr.decode("utf-8", errors="replace"))
    return result


def output(*args: str) -> str:
    return git(*args).stdout.decode("ascii").strip()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    if OUTPUT.exists() or MANIFEST.exists():
        raise SystemExit(f"refusing to overwrite existing input materialization: {OUTPUT} or {MANIFEST}")

    parent = output("rev-parse", f"{CANDIDATE}^")
    commit_tree = output("rev-parse", f"{CANDIDATE}^{{tree}}")
    source_tree = output("rev-parse", f"{CANDIDATE}^{{tree}}:src")
    if source_tree != EXPECTED_SRC_TREE:
        raise SystemExit(f"df86 src tree mismatch: expected {EXPECTED_SRC_TREE}, got {source_tree}")
    if git("diff", "--quiet", parent, CANDIDATE, "--", "src", check=False).returncode != 0:
        raise SystemExit("df86 changes src/; refusing this source pin")

    same_blobs = {}
    for path in OWNED_CHANGED_PATHS:
        candidate_blob = output("rev-parse", f"{CANDIDATE}:{path}")
        blob_734 = output("rev-parse", f"{BASE_734}:{path}")
        if candidate_blob != blob_734:
            raise SystemExit(f"owned candidate blob differs between df86 and 734: {path}")
        same_blobs[path] = candidate_blob

    raw_listing = git("ls-tree", "-r", "-z", "--full-tree", CANDIDATE, "--", *PATHS).stdout
    records = []
    OUTPUT.mkdir(parents=True, exist_ok=False)
    for item in raw_listing.split(b"\0"):
        if not item:
            continue
        metadata, raw_path = item.split(b"\t", 1)
        mode, kind, oid = metadata.decode("ascii").split(" ")
        path = raw_path.decode("utf-8")
        if kind != "blob" or mode not in ("100644", "100755"):
            raise SystemExit(f"unsupported Git input entry: {mode} {kind} {path}")
        data = git("cat-file", "blob", oid).stdout
        destination = OUTPUT / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        destination.chmod(0o755 if mode == "100755" else 0o644)
        records.append({
            "path": path,
            "mode": mode,
            "gitBlob": oid,
            "bytes": len(data),
            "sha256": sha256(data),
        })

    required = {".nvmrc", "package.json", "package-lock.json", "tests/game-troop-runtime-runner.js",
                "tests/game-troop-runtime.test.js"}
    present = {record["path"] for record in records}
    if not required <= present:
        raise SystemExit("materialization missing required path(s): " + ", ".join(sorted(required - present)))
    if not any(path.startswith("src/") for path in present):
        raise SystemExit("materialization contains no src/ files")
    if not any(path.startswith("tests/fixtures/source-vintage-checkpoints/") for path in present):
        raise SystemExit("materialization contains no source-vintage fixtures")

    manifest = {
        "capturedAtUtc": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
        "candidate": CANDIDATE,
        "parent": parent,
        "commitTree": commit_tree,
        "srcTree": source_tree,
        "candidate734OwnedBlobIdentity": same_blobs,
        "materializationRoot": str(OUTPUT),
        "pathspecs": list(PATHS),
        "fileCount": len(records),
        "files": sorted(records, key=lambda record: record["path"]),
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"materialized {len(records)} files at {OUTPUT}")
    print(f"manifest: {MANIFEST}")


if __name__ == "__main__":
    main()
