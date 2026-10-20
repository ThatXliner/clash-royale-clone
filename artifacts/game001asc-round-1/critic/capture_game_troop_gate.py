#!/usr/bin/env python3
"""Capture the authorized focused GAME-001ASC runtime gate and file fences."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from datetime import datetime, timezone

OWN = Path("/Users/me/.codex/clash-qualification/20261020-asc-critic")
SOURCE = Path("/Users/me/.codex/clash-qualification/20261020-asc-builder/runtime-source")
SOURCE_BLOBS = Path("/Users/me/.codex/clash-qualification/20261020-asc-builder/gate-capture/source-git-blobs.json")
NODE = Path("/Users/me/.hermes/node/bin/node")
NPM = Path("/Users/me/.hermes/node/bin/npm")
RUNNER = SOURCE / "tests/game-troop-runtime-runner.js"
FIXTURE_DIR = SOURCE / "tests/fixtures/source-vintage-checkpoints"
FIXTURE_NAMES = (
    "c9-empty-live-battle-v2.snapshot",
    "2a-game-session-bloom-wisp-v2.snapshot",
    "2a-game-session-dawnmender-v2.snapshot",
    "2a-game-session-pulse-sentry-v2.snapshot",
    "2a-game-session-rime-adept-v2.snapshot",
    "2a-game-session-tether-rider-v2.snapshot",
    "2a-game-session-veil-prowler-v2.snapshot",
)
CANDIDATE = "734dd8e3c5c8f21703b8fd39727e69f51eb93ab3"
PARENT = "e35dda4c0225b88ddac91a56f15e81fee32c3c68"
EXPECTED_SOURCE_TREE = "4307185647d50d399035043669ae806787ac216e"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def file_record(path: Path, relative_to: Path | None = None) -> dict[str, object]:
    result: dict[str, object] = {
        "path": str(path.relative_to(relative_to)) if relative_to else str(path),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }
    return result


def tree_fence() -> dict[str, object]:
    records: list[dict[str, object]] = []
    for path in sorted(SOURCE.rglob("*")):
        if path.is_symlink():
            records.append({
                "path": str(path.relative_to(SOURCE)),
                "type": "symlink",
                "target": os.readlink(path),
            })
        elif path.is_file():
            records.append(file_record(path, SOURCE))
    return {"capturedAtUtc": utc_now(), "root": str(SOURCE), "files": records}


def fixture_fence() -> dict[str, object]:
    return {
        "capturedAtUtc": utc_now(),
        "fixtures": [file_record(FIXTURE_DIR / name, SOURCE) for name in FIXTURE_NAMES],
    }


def process_tree(root_pid: int) -> list[dict[str, object]]:
    snapshot = subprocess.run(
        ["/bin/ps", "-axo", "pid=,ppid=,command="],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env={"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"},
    ).stdout
    rows: dict[int, tuple[int, str]] = {}
    for line in snapshot.splitlines():
        parts = line.strip().split(None, 2)
        if len(parts) != 3:
            continue
        try:
            pid, ppid = int(parts[0]), int(parts[1])
        except ValueError:
            continue
        rows[pid] = (ppid, parts[2])

    included = {root_pid}
    changed = True
    while changed:
        changed = False
        for pid, (ppid, _) in rows.items():
            if ppid in included and pid not in included:
                included.add(pid)
                changed = True
    return [
        {"pid": pid, "ppid": rows.get(pid, (None, ""))[0], "command": rows.get(pid, (None, "exited"))[1]}
        for pid in sorted(included)
    ]


def require_inputs() -> None:
    required = [SOURCE, SOURCE_BLOBS, NODE, NPM, RUNNER, FIXTURE_DIR]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise SystemExit("missing gate input(s): " + ", ".join(missing))
    missing_fixtures = [name for name in FIXTURE_NAMES if not (FIXTURE_DIR / name).is_file()]
    if missing_fixtures:
        raise SystemExit("missing fixture(s): " + ", ".join(missing_fixtures))


def validate_source_manifest() -> dict[str, object]:
    manifest = json.loads(SOURCE_BLOBS.read_text(encoding="utf-8"))
    expected_identity = {
        "candidate": CANDIDATE,
        "parent": PARENT,
        "srcTree": EXPECTED_SOURCE_TREE,
    }
    for key, expected in expected_identity.items():
        if manifest.get(key) != expected:
            raise SystemExit(f"source manifest {key} does not match the assigned candidate")

    expected_files = {record["path"]: record for record in manifest.get("files", [])}
    actual_files = {
        str(path.relative_to(SOURCE)): path
        for path in SOURCE.rglob("*")
        if path.is_file() and not path.is_symlink()
    }
    if set(actual_files) != set(expected_files):
        missing = sorted(set(expected_files) - set(actual_files))
        extra = sorted(set(actual_files) - set(expected_files))
        raise SystemExit(f"source snapshot file set differs from manifest; missing={missing}, extra={extra}")

    mismatches = []
    for relative, record in expected_files.items():
        path = actual_files[relative]
        if path.stat().st_size != record["bytes"] or sha256(path) != record["sha256"]:
            mismatches.append(relative)
    if mismatches:
        raise SystemExit("source snapshot differs from candidate manifest: " + ", ".join(sorted(mismatches)))
    return {
        "candidate": manifest["candidate"],
        "parent": manifest["parent"],
        "srcTree": manifest["srcTree"],
        "status": manifest.get("status"),
        "fileCount": len(expected_files),
        "manifest": file_record(SOURCE_BLOBS),
        "validation": "all listed paths, byte lengths, and SHA-256 values match",
    }


def main() -> int:
    if sys.argv[1:] != ["--execute"]:
        raise SystemExit("Preparation only. After release, run this script with --execute.")
    require_inputs()
    source_identity = validate_source_manifest()

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + f"-{os.getpid()}"
    run_dir = OWN / "runs" / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    (run_dir / "home").mkdir()
    (run_dir / "tmp").mkdir()
    (run_dir / "npm-cache").mkdir()

    argv = [str(NPM), "run", "test:game-troop-runtime"]
    child_env = {
        "PATH": "/Users/me/.hermes/node/bin:/usr/bin:/bin:/usr/sbin:/sbin",
        "HOME": str(run_dir / "home"),
        "TMPDIR": str(run_dir / "tmp"),
        "LANG": "C",
        "LC_ALL": "C",
        "TZ": "UTC",
        "npm_config_cache": str(run_dir / "npm-cache"),
    }
    write_json(run_dir / "candidate-refs.json", {
        "candidate": CANDIDATE,
        "parent": PARENT,
        "expectedSourceTree": EXPECTED_SOURCE_TREE,
        "sourceSnapshot": str(SOURCE),
        "sourceBlobManifest": str(SOURCE_BLOBS),
        "sourceIdentity": source_identity,
    })
    write_json(run_dir / "argv.json", {
        "cwd": str(SOURCE),
        "argv": argv,
        "packageScript": "node tests/game-troop-runtime-runner.js game-troop-runtime",
        "runnerChild": [str(NODE), "--test", str(SOURCE / "tests/game-troop-runtime.test.js")],
        "testFile": str(SOURCE / "tests/game-troop-runtime.test.js"),
        "runner": file_record(RUNNER, SOURCE),
    })
    write_json(run_dir / "env-allowlist.json", {
        "capturedAtUtc": utc_now(),
        "policy": "Only these explicitly supplied values are passed to npm; no full environment dump is taken.",
        "values": child_env,
    })
    write_json(run_dir / "node-version.json", {
        "node": subprocess.run([str(NODE), "--version"], check=True, capture_output=True,
                               text=True, env=child_env).stdout.strip(),
        "npm": subprocess.run([str(NPM), "--version"], check=True, capture_output=True,
                              text=True, env=child_env).stdout.strip(),
    })
    write_json(run_dir / "source-pre.json", tree_fence())
    write_json(run_dir / "runner-pre.json", file_record(RUNNER, SOURCE))
    write_json(run_dir / "fixtures-pre.json", fixture_fence())

    with (run_dir / "stdout.raw").open("wb") as stdout, (run_dir / "stderr.raw").open("wb") as stderr:
        started = time.monotonic()
        child = subprocess.Popen(
            argv,
            cwd=SOURCE,
            env=child_env,
            stdin=subprocess.DEVNULL,
            stdout=stdout,
            stderr=stderr,
            start_new_session=True,
        )
        (run_dir / "direct-pids.jsonl").write_text(
            json.dumps({"capturedAtUtc": utc_now(), "rootPid": child.pid,
                        "processes": process_tree(child.pid)}, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        with (run_dir / "direct-pids.jsonl").open("a", encoding="utf-8") as pids:
            while child.poll() is None:
                time.sleep(0.1)
                pids.write(json.dumps({"capturedAtUtc": utc_now(), "rootPid": child.pid,
                                       "processes": process_tree(child.pid)}, sort_keys=True) + "\n")
        exit_code = child.returncode
        elapsed = time.monotonic() - started

    write_json(run_dir / "exit-status.json", {
        "npmExitCode": exit_code,
        "elapsedSeconds": round(elapsed, 3),
        "finishedAtUtc": utc_now(),
    })
    write_json(run_dir / "source-post.json", tree_fence())
    write_json(run_dir / "runner-post.json", file_record(RUNNER, SOURCE))
    write_json(run_dir / "fixtures-post.json", fixture_fence())
    print(run_dir)
    return 0 if exit_code == 0 else exit_code or 1


if __name__ == "__main__":
    raise SystemExit(main())
