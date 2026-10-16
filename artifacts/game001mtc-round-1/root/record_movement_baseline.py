#!/usr/bin/env python3
"""Run one focused accepted-parent baseline with external evidence capture."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
from datetime import datetime, timezone

SOURCE = Path("/Users/me/.codex/worktrees/stagger-movement-accepted-aea303").resolve()
EVIDENCE = Path(__file__).resolve().parent
EXPECTED_HEAD = "aea303091a18baeacd1b7805c415732d7a1c1417"
NPM_SCRIPT = "test:game-roster-troops-movement"
EXPECTED_SCRIPT = "node tests/game-roster-troops-movement-runner.js game-roster-troops-movement"
NODE_BIN = Path("/Users/me/.hermes/node/bin").resolve()
SOURCE_FILES = (
    "package.json",
    "tests/game-roster-troops-movement-runner.js",
    "tests/game-roster-troops-movement.test.js",
)
ENV_ALLOWLIST = (
    "PATH", "CI", "NODE_ENV", "TZ", "NODE_OPTIONS", "FORCE_COLOR",
    "NO_COLOR", "TERM",
)


def git(args: list[str]) -> bytes:
    result = subprocess.run(
        ["git", *args], cwd=SOURCE, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, check=False,
    )
    if result.returncode:
        raise RuntimeError(
            f"git {' '.join(args)} exited {result.returncode}: "
            f"{result.stderr.decode('utf-8', 'replace')}"
        )
    return result.stdout


def digest(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def source_fence(label: str, run_dir: Path) -> dict[str, object]:
    status = git([
        "status", "--porcelain=v1", "--untracked-files=all",
        "--ignored=matching", "-z",
    ])
    status_path = run_dir / f"source-status-{label}.porcelain0"
    status_path.write_bytes(status)
    unstaged = git(["diff", "--binary", "--no-ext-diff"])
    staged = git(["diff", "--cached", "--binary", "--no-ext-diff"])
    return {
        "head": git(["rev-parse", "HEAD"]).decode().strip(),
        "tree": git(["rev-parse", "HEAD^{tree}"]).decode().strip(),
        "status_file": str(status_path),
        "status_bytes": len(status),
        "status_sha256": digest(status),
        "unstaged_diff_sha256": digest(unstaged),
        "unstaged_diff_bytes": len(unstaged),
        "staged_diff_sha256": digest(staged),
        "staged_diff_bytes": len(staged),
    }


def main() -> int:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    run_dir = EVIDENCE / f"baseline-{stamp}"
    run_dir.mkdir(parents=True, exist_ok=False)
    metadata_path = run_dir / "metadata.json"
    metadata: dict[str, object] = {
        "recorded_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_checkout": str(SOURCE),
        "evidence_directory": str(run_dir),
        "expected_commit": EXPECTED_HEAD,
        "npm_command_display": f"npm run {NPM_SCRIPT}",
        "npm_script_name": NPM_SCRIPT,
        "cwd": str(SOURCE),
        "recorder_path": str(Path(__file__).resolve()),
        "recorder_sha256": digest(Path(__file__).read_bytes()),
    }
    before = source_fence("before", run_dir)
    metadata["source_fence_before"] = before
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    if before["head"] != EXPECTED_HEAD:
        raise SystemExit(f"wrong accepted source HEAD: {before['head']}")
    status = git([
        "status", "--porcelain=v1", "--untracked-files=all",
        "--ignored=matching", "-z",
    ])
    if status:
        raise SystemExit(f"checkout is not clean; see {before['status_file']}")

    package_bytes = (SOURCE / "package.json").read_bytes()
    package = json.loads(package_bytes)
    script = package.get("scripts", {}).get(NPM_SCRIPT)
    if script != EXPECTED_SCRIPT:
        raise SystemExit(f"unexpected {NPM_SCRIPT!r} package script: {script!r}")

    env = os.environ.copy()
    env["PATH"] = str(NODE_BIN) + os.pathsep + env.get("PATH", "")
    npm_path = shutil.which("npm", path=env["PATH"])
    node_path = shutil.which("node", path=env["PATH"])
    if not npm_path or not node_path:
        raise SystemExit(f"npm/node must resolve from {NODE_BIN}")
    if Path(npm_path).parent.resolve() != NODE_BIN or Path(node_path).parent.resolve() != NODE_BIN:
        raise SystemExit(f"npm/node did not resolve from explicit Node bin {NODE_BIN}")
    versions = {}
    for name, executable in (("node", node_path), ("npm", npm_path)):
        probe = subprocess.run(
            [executable, "--version"], cwd=SOURCE, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False,
        )
        versions[name] = probe.stdout.decode("utf-8", "replace").strip()
        if probe.returncode:
            raise SystemExit(f"{name} --version exited {probe.returncode}")
    if not versions["node"].startswith("v22."):
        raise SystemExit(f"expected Node 22 from {NODE_BIN}, got {versions['node']}")

    copied_sources = []
    for relative in SOURCE_FILES:
        source_path = SOURCE / relative
        payload = source_path.read_bytes()
        evidence_path = run_dir / "executed-source" / relative
        evidence_path.parent.mkdir(parents=True, exist_ok=True)
        evidence_path.write_bytes(payload)
        copied_sources.append({
            "source_path": str(source_path),
            "evidence_copy": str(evidence_path),
            "bytes": len(payload),
            "sha256": digest(payload),
            "copy_sha256": digest(evidence_path.read_bytes()),
        })

    argv = [npm_path, "run", NPM_SCRIPT]
    stdout_path = run_dir / "stdout.log"
    stderr_path = run_dir / "stderr.log"
    metadata.update({
        "package_script_value": script,
        "package_json_sha256": digest(package_bytes),
        "argv": argv,
        "cwd": str(SOURCE),
        "environment_allowlist": {key: env.get(key) for key in ENV_ALLOWLIST},
        "node_bin_prefix": str(NODE_BIN),
        "node_executable": node_path,
        "npm_executable": npm_path,
        "runtime_versions": versions,
        "executed_source_copies": copied_sources,
        "stdout_file": str(stdout_path),
        "stderr_file": str(stderr_path),
        "execution_started_at_utc": datetime.now(timezone.utc).isoformat(),
    })
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    with stdout_path.open("wb") as stdout_file, stderr_path.open("wb") as stderr_file:
        process = subprocess.Popen(
            argv, cwd=SOURCE, env=env, stdout=stdout_file, stderr=stderr_file,
        )
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
