#!/usr/bin/env python3
"""Serial two-gate focused baseline recorder; do not run without root release."""
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
NODE_BIN = Path("/Users/me/.hermes/node/bin").resolve()
ENV_ALLOWLIST = (
    "PATH", "CI", "NODE_ENV", "TZ", "NODE_OPTIONS", "FORCE_COLOR",
    "NO_COLOR", "TERM",
)
GATES = (
    {
        "name": "game-troop-runtime",
        "script_name": "test:game-troop-runtime",
        "script_value": "node tests/game-troop-runtime-runner.js game-troop-runtime",
        "runner": "tests/game-troop-runtime-runner.js",
        "test": "tests/game-troop-runtime.test.js",
        "static_risk": "empty LiveBattle v2 snapshot length/hash pin; setup uses current createPlayableRoster/questions",
    },
    {
        "name": "game-roster-troops-status",
        "script_name": "test:game-roster-troops-status",
        "script_value": "node tests/game-roster-troops-status-runner.js game-roster-troops-status",
        "runner": "tests/game-roster-troops-status-runner.js",
        "test": "tests/game-roster-troops-status.test.js",
        "static_risk": "six GameSession replay/snapshot hash pairs; current witness roster includes Briar; pins date to Aug 21",
    },
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


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


def fence(label: str, gate_dir: Path) -> dict[str, object]:
    # Preserve all Git-reported path names; no source/artifact-name filtering.
    status = git([
        "status", "--porcelain=v1", "--untracked-files=all",
        "--ignored=matching", "-z",
    ])
    status_path = gate_dir / f"source-status-{label}.porcelain0"
    status_path.write_bytes(status)
    unstaged = git(["diff", "--binary", "--no-ext-diff"])
    staged = git(["diff", "--cached", "--binary", "--no-ext-diff"])
    return {
        "head": git(["rev-parse", "HEAD"]).decode().strip(),
        "tree": git(["rev-parse", "HEAD^{tree}"]).decode().strip(),
        "status_file": str(status_path),
        "status_bytes": len(status),
        "status_sha256": sha256(status),
        "unstaged_diff_sha256": sha256(unstaged),
        "unstaged_diff_bytes": len(unstaged),
        "staged_diff_sha256": sha256(staged),
        "staged_diff_bytes": len(staged),
    }


def require_clean_accepted(fence_record: dict[str, object], label: str) -> None:
    if fence_record["head"] != EXPECTED_HEAD:
        raise SystemExit(f"{label}: expected {EXPECTED_HEAD}, got {fence_record['head']}")
    status = git([
        "status", "--porcelain=v1", "--untracked-files=all",
        "--ignored=matching", "-z",
    ])
    if status:
        raise SystemExit(f"{label}: source checkout not clean; see {fence_record['status_file']}")


def run_gate(index: int, gate: dict[str, str], stamp: str, npm_path: str,
             env: dict[str, str], versions: dict[str, str]) -> dict[str, object]:
    gate_dir = EVIDENCE / f"{index:02d}-{gate['name']}-{stamp}"
    gate_dir.mkdir(parents=True, exist_ok=False)
    metadata_path = gate_dir / "metadata.json"
    before = fence("before", gate_dir)
    require_clean_accepted(before, f"{gate['name']} preflight")

    package_bytes = (SOURCE / "package.json").read_bytes()
    package = json.loads(package_bytes)
    script_value = package.get("scripts", {}).get(gate["script_name"])
    if script_value != gate["script_value"]:
        raise SystemExit(
            f"unexpected {gate['script_name']} package script: {script_value!r}"
        )

    source_copies = []
    for relative in ("package.json", gate["runner"], gate["test"]):
        source_path = SOURCE / relative
        payload = source_path.read_bytes()
        copy_path = gate_dir / "executed-source" / relative
        copy_path.parent.mkdir(parents=True, exist_ok=True)
        copy_path.write_bytes(payload)
        source_copies.append({
            "source_path": str(source_path),
            "evidence_copy": str(copy_path),
            "bytes": len(payload),
            "sha256": sha256(payload),
            "copy_sha256": sha256(copy_path.read_bytes()),
        })

    argv = [npm_path, "run", gate["script_name"]]
    stdout_path = gate_dir / "stdout.log"
    stderr_path = gate_dir / "stderr.log"
    metadata: dict[str, object] = {
        "gate": gate["name"],
        "static_risk_only_not_a_failure_claim": gate["static_risk"],
        "source_checkout": str(SOURCE),
        "expected_commit": EXPECTED_HEAD,
        "source_fence_before": before,
        "npm_command_display": f"npm run {gate['script_name']}",
        "package_script_name": gate["script_name"],
        "package_script_value": script_value,
        "package_json_sha256": sha256(package_bytes),
        "executed_source_copies": source_copies,
        "argv": argv,
        "cwd": str(SOURCE),
        "environment_allowlist": {key: env.get(key) for key in ENV_ALLOWLIST},
        "node_bin_prefix": str(NODE_BIN),
        "runtime_versions": versions,
        "stdout_file": str(stdout_path),
        "stderr_file": str(stderr_path),
        "metadata_file": str(metadata_path),
        "execution_started_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    # Persist source copies, command, and environment before starting npm.
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    with stdout_path.open("wb") as stdout_file, stderr_path.open("wb") as stderr_file:
        process = subprocess.Popen(
            argv, cwd=SOURCE, env=env, stdout=stdout_file, stderr=stderr_file,
        )
        # Persist the direct npm child PID immediately after Popen returns.
        metadata["direct_npm_pid"] = process.pid
        metadata["popen_returned_at_utc"] = datetime.now(timezone.utc).isoformat()
        metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        returncode = process.wait()

    metadata["direct_npm_exit_code"] = returncode
    metadata["execution_finished_at_utc"] = datetime.now(timezone.utc).isoformat()
    after = fence("after", gate_dir)
    metadata["source_fence_after"] = after
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return {
        "gate": gate["name"],
        "direct_npm_pid": metadata["direct_npm_pid"],
        "direct_npm_exit_code": returncode,
        "evidence_directory": str(gate_dir),
        "source_clean_after": after["head"] == EXPECTED_HEAD and after["status_bytes"] == 0,
    }


def main() -> int:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    env = os.environ.copy()
    env["PATH"] = str(NODE_BIN) + os.pathsep + env.get("PATH", "")
    npm_path = shutil.which("npm", path=env["PATH"])
    node_path = shutil.which("node", path=env["PATH"])
    if not npm_path or not node_path:
        raise SystemExit(f"npm/node must resolve from explicit Node bin {NODE_BIN}")
    if Path(npm_path).parent.resolve() != NODE_BIN or Path(node_path).parent.resolve() != NODE_BIN:
        raise SystemExit(f"npm/node did not resolve from explicit Node bin {NODE_BIN}")

    versions: dict[str, str] = {}
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

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    results = []
    for index, gate in enumerate(GATES, start=1):
        result = run_gate(index, gate, stamp, npm_path, env, versions)
        results.append(result)
        if not result["source_clean_after"]:
            break
    summary = {
        "recorded_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_checkout": str(SOURCE),
        "expected_commit": EXPECTED_HEAD,
        "node_bin_prefix": str(NODE_BIN),
        "runtime_versions": versions,
        "execution_order": [gate["script_name"] for gate in GATES],
        "results": results,
        "all_gates_executed": len(results) == len(GATES),
    }
    summary_path = EVIDENCE / f"summary-{stamp}.json"
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"summary: {summary_path}")
    for result in results:
        print(f"{result['gate']}: npm PID {result['direct_npm_pid']}, exit {result['direct_npm_exit_code']}")
    return 1 if len(results) != len(GATES) or any(result["direct_npm_exit_code"] for result in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
