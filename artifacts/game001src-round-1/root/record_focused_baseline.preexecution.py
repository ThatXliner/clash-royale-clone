#!/usr/bin/env python3
"""Persist a bounded, source-fenced baseline run for one accepted test target.

Preparation-only artifact: do not execute until the coordinating agent grants
runtime permission. All outputs are written beside this script, outside the
source checkout.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone

SOURCE = Path("/Users/me/.codex/worktrees/remaining-stagger-accepted54cc").resolve()
EVIDENCE = Path(__file__).resolve().parent
EXPECTED_HEAD = "54cc2a017a939ce40b40c1d25544839983fadf8c"
NPM_SCRIPT = "test:game-shared-runtime-integration"
EXPECTED_SCRIPT = "node tests/game-shared-runtime-integration-runner.js game-shared-runtime-integration"
ARGV = ["npm", "run", NPM_SCRIPT]
# Record only execution-relevant, non-secret environment values; never dump the
# complete inherited environment, which can contain credentials.
ENV_ALLOWLIST = (
    "PATH", "CI", "NODE_ENV", "TZ", "NODE_OPTIONS", "FORCE_COLOR",
    "NO_COLOR", "TERM",
)
HEAD_BYTES = 128 * 1024
TAIL_BYTES = 1024 * 1024
CHUNK_BYTES = 64 * 1024


def run_git(args: list[str], *, binary: bool = False) -> bytes:
    result = subprocess.run(
        ["git", *args], cwd=SOURCE, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"git {' '.join(args)} exited {result.returncode}: "
            f"{result.stderr.decode('utf-8', 'replace')}"
        )
    return result.stdout if binary else result.stdout


def fence() -> dict[str, object]:
    # No path names are excluded. The full status payload includes tracked,
    # untracked, and ignored entries; diffs are hashed byte-for-byte.
    status = run_git([
        "status", "--porcelain=v1", "--untracked-files=all",
        "--ignored=matching", "-z",
    ], binary=True)
    unstaged = run_git(["diff", "--binary", "--no-ext-diff"], binary=True)
    staged = run_git(["diff", "--cached", "--binary", "--no-ext-diff"], binary=True)
    head = run_git(["rev-parse", "HEAD"]).decode().strip()
    tree = run_git(["rev-parse", "HEAD^{tree}"]).decode().strip()
    return {
        "head": head,
        "tree": tree,
        "status_porcelain_z_base64": base64.b64encode(status).decode("ascii"),
        "status_bytes": len(status),
        "unstaged_diff_sha256": hashlib.sha256(unstaged).hexdigest(),
        "unstaged_diff_bytes": len(unstaged),
        "staged_diff_sha256": hashlib.sha256(staged).hexdigest(),
        "staged_diff_bytes": len(staged),
    }


def bounded_output(command: list[str], env: dict[str, str]) -> tuple[int, dict[str, object]]:
    digest = hashlib.sha256()
    head = bytearray()
    tail = bytearray()
    total = 0
    process = subprocess.Popen(
        command, cwd=SOURCE, env=env, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    assert process.stdout is not None
    with process.stdout:
        while True:
            chunk = process.stdout.read(CHUNK_BYTES)
            if not chunk:
                break
            digest.update(chunk)
            total += len(chunk)
            if len(head) < HEAD_BYTES:
                head.extend(chunk[:HEAD_BYTES - len(head)])
            tail.extend(chunk)
            if len(tail) > TAIL_BYTES:
                del tail[:len(tail) - TAIL_BYTES]
    returncode = process.wait()
    truncated = total > HEAD_BYTES + TAIL_BYTES
    if truncated:
        rendered = bytes(head) + (
            f"\n\n[output truncated; {total} bytes total; "
            f"sha256={digest.hexdigest()}]\n\n"
        ).encode() + bytes(tail)
    else:
        rendered = bytes(head) if total <= HEAD_BYTES else bytes(head) + bytes(tail[HEAD_BYTES:])
    output_name = "console.log"
    (EVIDENCE / output_name).write_bytes(rendered)
    return returncode, {
        "output_file": output_name,
        "output_bytes_total": total,
        "output_sha256": digest.hexdigest(),
        "output_bytes_retained": len(rendered),
        "output_truncated": truncated,
        "head_limit_bytes": HEAD_BYTES,
        "tail_limit_bytes": TAIL_BYTES,
    }


def main() -> int:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    if not SOURCE.is_dir():
        raise SystemExit(f"source checkout is missing: {SOURCE}")
    before = fence()
    if before["head"] != EXPECTED_HEAD:
        raise SystemExit(f"wrong source HEAD: {before['head']} (expected {EXPECTED_HEAD})")
    # Status is recorded in full (including ignored entries), but only normal
    # tracked/untracked changes make this checkout unsuitable as a baseline.
    ordinary_status = run_git([
        "status", "--porcelain=v1", "--untracked-files=all", "-z",
    ], binary=True)
    if ordinary_status:
        raise SystemExit(
            "source checkout is not clean; inspect the recorded source fence "
            "before running the baseline"
        )
    package = json.loads((SOURCE / "package.json").read_text(encoding="utf-8"))
    script = package.get("scripts", {}).get(NPM_SCRIPT)
    if script != EXPECTED_SCRIPT:
        raise SystemExit(f"unexpected package script {NPM_SCRIPT!r}: {script!r}")

    env = os.environ.copy()
    now = datetime.now(timezone.utc)
    stamp = now.strftime("%Y%m%dT%H%M%SZ")
    metadata_path = EVIDENCE / f"baseline-{stamp}.json"
    metadata: dict[str, object] = {
        "recorded_at_utc": now.isoformat(),
        "source_checkout": str(SOURCE),
        "evidence_directory": str(EVIDENCE),
        "expected_commit": EXPECTED_HEAD,
        "source_fence_before": before,
        "package_script_name": NPM_SCRIPT,
        "package_script_value": script,
        "argv": ARGV,
        "cwd": str(SOURCE),
        "environment_allowlist": {key: env.get(key) for key in ENV_ALLOWLIST},
        "runtime_versions": {},
        "runner_file": str(Path(__file__).resolve()),
        "runner_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    }
    # Persist invocation identity before launching the test, so interrupted
    # runs still have a record of what was requested.
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    versions: dict[str, str] = {}
    for executable in ("node", "npm"):
        probe = subprocess.run(
            [executable, "--version"], cwd=SOURCE, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False,
        )
        versions[executable] = probe.stdout.decode("utf-8", "replace").strip()
        if probe.returncode != 0:
            metadata["runtime_versions"] = versions
            metadata["version_probe_failure"] = {"executable": executable, "returncode": probe.returncode}
            metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
            return probe.returncode or 1
    metadata["runtime_versions"] = versions
    started = datetime.now(timezone.utc)
    metadata["execution_started_at_utc"] = started.isoformat()
    returncode, capture = bounded_output(ARGV, env)
    metadata["execution_finished_at_utc"] = datetime.now(timezone.utc).isoformat()
    metadata["returncode"] = returncode
    metadata["output_capture"] = capture
    metadata["source_fence_after"] = fence()
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"evidence: {metadata_path}")
    print(f"console: {EVIDENCE / capture['output_file']}")
    print(f"test return code: {returncode}")
    return returncode


if __name__ == "__main__":
    raise SystemExit(main())
