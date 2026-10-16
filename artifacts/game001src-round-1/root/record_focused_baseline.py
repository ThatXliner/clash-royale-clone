#!/usr/bin/env python3
"""Persist one source-fenced focused test run outside its source checkout."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
from datetime import datetime, timezone

SOURCE = Path("/Users/me/.codex/worktrees/remaining-stagger-accepted54cc").resolve()
EVIDENCE = Path(__file__).resolve().parent
EXPECTED_HEAD = "54cc2a017a939ce40b40c1d25544839983fadf8c"
NPM_SCRIPT = "test:game-shared-runtime-integration"
EXPECTED_SCRIPT = "node tests/game-shared-runtime-integration-runner.js game-shared-runtime-integration"
NODE_BIN = Path("/Users/me/.hermes/node/bin").resolve()
ENV_ALLOWLIST = (
    "PATH", "CI", "NODE_ENV", "TZ", "NODE_OPTIONS", "FORCE_COLOR",
    "NO_COLOR", "TERM",
)
SOURCE_FILES = (
    "package.json",
    "tests/game-shared-runtime-integration-runner.js",
    "tests/game-shared-runtime-integration.test.js",
)


def run_git(args: list[str]) -> bytes:
    result = subprocess.run(
        ["git", *args], cwd=SOURCE, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"git {' '.join(args)} exited {result.returncode}: "
            f"{result.stderr.decode('utf-8', 'replace')}"
        )
    return result.stdout


def sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def source_fence(label: str, run_dir: Path) -> dict[str, object]:
    # Preserve every path reported by Git, including ignored paths. No source
    # or artifact path names are filtered from the fence.
    status = run_git([
        "status", "--porcelain=v1", "--untracked-files=all",
        "--ignored=matching", "-z",
    ])
    status_file = run_dir / f"source-status-{label}.porcelain0"
    status_file.write_bytes(status)
    unstaged = run_git(["diff", "--binary", "--no-ext-diff"])
    staged = run_git(["diff", "--cached", "--binary", "--no-ext-diff"])
    return {
        "head": run_git(["rev-parse", "HEAD"]).decode().strip(),
        "tree": run_git(["rev-parse", "HEAD^{tree}"]).decode().strip(),
        "status_file": str(status_file),
        "status_bytes": len(status),
        "status_sha256": sha256(status),
        "unstaged_diff_sha256": sha256(unstaged),
        "unstaged_diff_bytes": len(unstaged),
        "staged_diff_sha256": sha256(staged),
        "staged_diff_bytes": len(staged),
    }


def main() -> int:
    if not SOURCE.is_dir():
        raise SystemExit(f"source checkout is missing: {SOURCE}")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    run_dir = EVIDENCE / f"baseline-{stamp}"
    run_dir.mkdir(parents=True, exist_ok=False)
    metadata_path = run_dir / "metadata.json"
    metadata: dict[str, object] = {
        "recorded_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_checkout": str(SOURCE),
        "evidence_directory": str(run_dir),
        "expected_commit": EXPECTED_HEAD,
        "npm_script_name": NPM_SCRIPT,
        "npm_command_display": f"npm run {NPM_SCRIPT}",
        "cwd": str(SOURCE),
        "recorder_file": str(Path(__file__).resolve()),
        "recorder_sha256": sha256(Path(__file__).read_bytes()),
    }

    before = source_fence("before", run_dir)
    metadata["source_fence_before"] = before
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    if before["head"] != EXPECTED_HEAD:
        raise SystemExit(f"wrong source HEAD: {before['head']} (expected {EXPECTED_HEAD})")
    all_status = run_git([
        "status", "--porcelain=v1", "--untracked-files=all",
        "--ignored=matching", "-z",
    ])
    if all_status:
        raise SystemExit(
            f"source checkout is not clean; inspect {before['status_file']}"
        )

    package = json.loads((SOURCE / "package.json").read_text(encoding="utf-8"))
    script = package.get("scripts", {}).get(NPM_SCRIPT)
    if script != EXPECTED_SCRIPT:
        raise SystemExit(f"unexpected package script {NPM_SCRIPT!r}: {script!r}")

    env = os.environ.copy()
    env["PATH"] = str(NODE_BIN) + os.pathsep + env.get("PATH", "")
    npm_path = shutil.which("npm", path=env["PATH"])
    node_path = shutil.which("node", path=env["PATH"])
    if not npm_path or not node_path:
        raise SystemExit(f"npm and node must resolve from explicit Node bin {NODE_BIN}")
    if Path(npm_path).parent.resolve() != NODE_BIN or Path(node_path).parent.resolve() != NODE_BIN:
        raise SystemExit(f"npm/node did not resolve from explicit Node bin {NODE_BIN}")

    versions: dict[str, str] = {}
    for executable, path in (("node", node_path), ("npm", npm_path)):
        probe = subprocess.run(
            [path, "--version"], cwd=SOURCE, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False,
        )
        version = probe.stdout.decode("utf-8", "replace").strip()
        versions[executable] = version
        if probe.returncode != 0:
            raise SystemExit(f"{executable} --version exited {probe.returncode}: {version}")
    if not versions["node"].startswith("v22."):
        raise SystemExit(f"explicit Node path is not Node 22: {versions['node']}")

    source_copy_root = run_dir / "executed-source"
    source_copy_records = []
    for relative in SOURCE_FILES:
        source_path = SOURCE / relative
        payload = source_path.read_bytes()
        copy_path = source_copy_root / relative
        copy_path.parent.mkdir(parents=True, exist_ok=True)
        copy_path.write_bytes(payload)
        source_copy_records.append({
            "source_path": str(source_path),
            "evidence_copy": str(copy_path),
            "bytes": len(payload),
            "sha256": sha256(payload),
            "copy_sha256": sha256(copy_path.read_bytes()),
        })

    argv = [npm_path, "run", NPM_SCRIPT]
    stdout_path = run_dir / "stdout.log"
    stderr_path = run_dir / "stderr.log"
    metadata.update({
        "package_script_value": script,
        "argv": argv,
        "cwd": str(SOURCE),
        "environment_allowlist": {key: env.get(key) for key in ENV_ALLOWLIST},
        "node_bin_prefix": str(NODE_BIN),
        "node_executable": node_path,
        "npm_executable": npm_path,
        "runtime_versions": versions,
        "executed_source_copies": source_copy_records,
        "stdout_file": str(stdout_path),
        "stderr_file": str(stderr_path),
        "execution_started_at_utc": datetime.now(timezone.utc).isoformat(),
    })
    # Source copies and all invocation details are durable before launching npm.
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    with stdout_path.open("wb") as stdout_file, stderr_path.open("wb") as stderr_file:
        process = subprocess.Popen(
            argv, cwd=SOURCE, env=env, stdout=stdout_file, stderr=stderr_file,
        )
        # Persist the direct npm child PID before waiting or reading any output.
        metadata["direct_npm_pid"] = process.pid
        metadata["popen_returned_at_utc"] = datetime.now(timezone.utc).isoformat()
        metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        returncode = process.wait()

    metadata["direct_npm_exit_code"] = returncode
    metadata["execution_finished_at_utc"] = datetime.now(timezone.utc).isoformat()
    metadata["source_fence_after"] = source_fence("after", run_dir)
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"evidence: {run_dir}")
    print(f"direct npm PID: {metadata['direct_npm_pid']}")
    print(f"direct npm exit code: {returncode}")
    print(f"stdout: {stdout_path}")
    print(f"stderr: {stderr_path}")
    return returncode


if __name__ == "__main__":
    raise SystemExit(main())
