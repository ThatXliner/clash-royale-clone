#!/usr/bin/env python3
"""Deferred serial GTC historical/current diagnostic; requires explicit root runtime grant."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
from datetime import datetime, timezone

REPO = Path("/Users/me/.codex/worktrees/9456/clash-royale-clone")
EVIDENCE = Path(__file__).resolve().parent
NODE_BIN = Path("/Users/me/.hermes/node/bin")
CURRENT = "5cc4d3e424661cf638c5dbea288836ef4419fcf0"
COORDINATION_HEAD = "090d685a4fa07aa07c17618b1e18d00ecb63ff51"
COMMITS = {
    "gtc-vintage-c9": "c9c818f7ac281b0e71890a2be17ce757f688b4c5",
    "gtc-pin-a8": "a8f432985a758144af6c29ff7e29174b05f8e6ee",
    "status-pin-2a": "2a5bd7a44ad3773de59e8e6dd8baaebf0ec09764",
    "current-5cc": CURRENT,
}
ENV_KEYS = ("PATH", "CI", "NODE_ENV", "TZ", "NODE_OPTIONS", "FORCE_COLOR", "NO_COLOR", "TERM")

GATES = (
    {"name": "gtc-pin-test-a8", "worktree": "gtc-pin-a8", "kind": "npm",
     "script": "test:game-troop-runtime", "runner": "tests/game-troop-runtime-runner.js",
     "test": "tests/game-troop-runtime.test.js",
     "extra": ["src/content/playable-roster.js", "src/sim/live-battle.js",
               "src/shared/session-troop-source-confidence-authority.js"]},
    {"name": "gtc-empty-probe-c9", "worktree": "gtc-vintage-c9", "kind": "probe",
     "test": "tests/game-troop-runtime.test.js",
     "extra": ["src/content/playable-roster.js", "src/sim/live-battle.js",
               "src/shared/session-troop-source-confidence-authority.js"]},
    {"name": "gtc-current-test-5cc", "worktree": "current-5cc", "kind": "npm",
     "script": "test:game-troop-runtime", "runner": "tests/game-troop-runtime-runner.js",
     "test": "tests/game-troop-runtime.test.js",
     "extra": ["src/content/playable-roster.js", "src/sim/live-battle.js",
               "src/shared/session-troop-source-confidence-authority.js"]},
    {"name": "gtc-empty-probe-current-5cc", "worktree": "current-5cc", "kind": "probe",
     "test": "tests/game-troop-runtime.test.js",
     "extra": ["src/content/playable-roster.js", "src/sim/live-battle.js",
               "src/shared/session-troop-source-confidence-authority.js"]},
    {"name": "status-pin-test-2a", "worktree": "status-pin-2a", "kind": "npm",
     "script": "test:game-roster-troops-status",
     "runner": "tests/game-roster-troops-status-runner.js",
     "test": "tests/game-roster-troops-status.test.js",
     "extra": ["src/content/session-troop-roster.js", "src/content/playable-roster.js",
               "src/shared/session-troop-source-confidence-authority.js",
               "src/sim/game-session.js", "src/sim/session-troop-status-runtime.js"]},
    {"name": "status-current-test-5cc", "worktree": "current-5cc", "kind": "npm",
     "script": "test:game-roster-troops-status",
     "runner": "tests/game-roster-troops-status-runner.js",
     "test": "tests/game-roster-troops-status.test.js",
     "extra": ["src/content/session-troop-roster.js", "src/content/playable-roster.js",
               "src/shared/session-troop-source-confidence-authority.js",
               "src/sim/game-session.js", "src/sim/session-troop-status-runtime.js"]},
)


def run_capture(argv: list[str], cwd: Path, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(argv, cwd=cwd, env=env, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, check=False)


def git(cwd: Path, args: list[str]) -> bytes:
    result = run_capture(["git", "-C", str(cwd), *args], cwd=REPO)
    if result.returncode:
        raise RuntimeError(f"git -C {cwd} {' '.join(args)} failed: " +
                           result.stderr.decode("utf-8", "replace"))
    return result.stdout


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def source_fence(worktree: Path, gate_dir: Path, label: str) -> dict[str, object]:
    status = git(worktree, ["status", "--porcelain=v1", "--untracked-files=all",
                            "--ignored=matching", "-z"])
    status_path = gate_dir / f"source-status-{label}.porcelain0"
    status_path.write_bytes(status)
    unstaged = git(worktree, ["diff", "--binary", "--no-ext-diff"])
    staged = git(worktree, ["diff", "--cached", "--binary", "--no-ext-diff"])
    return {
        "head": git(worktree, ["rev-parse", "HEAD"]).decode().strip(),
        "tree": git(worktree, ["rev-parse", "HEAD^{tree}"]).decode().strip(),
        "status_file": str(status_path),
        "status_bytes": len(status),
        "status_sha256": sha256(status),
        "unstaged_diff_bytes": len(unstaged),
        "unstaged_diff_sha256": sha256(unstaged),
        "staged_diff_bytes": len(staged),
        "staged_diff_sha256": sha256(staged),
    }


def verify_pinned_source_identity() -> dict[str, object]:
    scope_paths = ("src", "scripts", "package.json", "package-lock.json",
                   "demo/assets", "public/assets", "reference")
    targeted_files = (
        "tests/game-troop-runtime.test.js",
        "tests/game-troop-runtime-runner.js",
        "tests/game-roster-troops-status.test.js",
        "tests/game-roster-troops-status-runner.js",
    )
    shared_scopes = {}
    for path in scope_paths:
        pin_tree = git(REPO, ["rev-parse", f"{CURRENT}:{path}"]).decode().strip()
        current_tree = git(REPO, ["rev-parse", f"{COORDINATION_HEAD}:{path}"]).decode().strip()
        shared_scopes[path] = {"execution_pin": pin_tree,
                               "coordination_head": current_tree,
                               "equal": pin_tree == current_tree}
        if pin_tree != current_tree:
            raise SystemExit(f"source pin {path} differs from current coordination head")
    targeted_objects = {}
    for path in targeted_files:
        pin_blob = git(REPO, ["rev-parse", f"{CURRENT}:{path}"]).decode().strip()
        current_blob = git(REPO, ["rev-parse", f"{COORDINATION_HEAD}:{path}"]).decode().strip()
        targeted_objects[path] = {"execution_pin": pin_blob,
                                  "coordination_head": current_blob,
                                  "equal": pin_blob == current_blob}
        if pin_blob != current_blob:
            raise SystemExit(f"targeted test/runner {path} differs from coordination head")
    test_differences = git(REPO, ["diff", "--name-only", CURRENT, COORDINATION_HEAD,
                                  "--", "tests"]).decode().splitlines()
    expected_test_differences = ["tests/game-roster-troops-movement.test.js"]
    if test_differences != expected_test_differences:
        raise SystemExit(f"unexpected accepted coordination changes under tests/: {test_differences}")
    return {"execution_source_pin": CURRENT,
            "coordination_head": COORDINATION_HEAD,
            "shared_source_scope_objects": shared_scopes,
            "targeted_test_runner_blobs": targeted_objects,
            "tests_tree_diff_paths_execution_pin_to_coordination_head": test_differences}


def prepare_worktree(name: str, commit: str, parent: Path, setup_log) -> Path:
    target = parent / name
    if target.exists():
        raise SystemExit(f"refusing to reuse existing path: {target}")
    object_id = git(REPO, ["rev-parse", commit]).decode().strip()
    if object_id != commit:
        raise SystemExit(f"unexpected commit resolution for {commit}: {object_id}")
    commands = [
        ["git", "-C", str(REPO), "worktree", "add", "--detach", "--no-checkout",
         str(target), commit],
        ["git", "-C", str(target), "sparse-checkout", "init", "--cone"],
        ["git", "-C", str(target), "sparse-checkout", "set", "src", "tests"],
    ]
    for argv in commands:
        result = subprocess.run(argv, cwd=REPO, stdout=setup_log, stderr=subprocess.STDOUT,
                                check=False)
        if result.returncode:
            raise SystemExit(f"source preparation command exited {result.returncode}: {argv}")
    head = git(target, ["rev-parse", "HEAD"]).decode().strip()
    if head != commit:
        raise SystemExit(f"worktree {name} HEAD mismatch: {head}")
    status = git(target, ["status", "--porcelain=v1", "--untracked-files=all",
                          "--ignored=matching", "-z"])
    if status:
        raise SystemExit(f"new sparse source worktree is not clean: {target}")
    return target


def copy_sources(worktree: Path, gate_dir: Path, gate: dict[str, object]) -> list[dict[str, object]]:
    if gate["kind"] == "npm":
        relatives = ["package.json", str(gate["runner"]), str(gate["test"]), *gate["extra"]]
    elif gate["kind"] == "probe":
        relatives = ["package.json", str(gate["test"]), *gate["extra"]]
    else:
        relatives = ["package.json", *gate["extra"]]
    records = []
    for relative in dict.fromkeys(relatives):
        source = worktree / relative
        record: dict[str, object] = {"source_path": str(source), "relative_path": relative}
        if not source.is_file():
            record["present"] = False
            records.append(record)
            continue
        payload = source.read_bytes()
        target = gate_dir / "executed-source" / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
        record.update({"present": True, "copy": str(target), "bytes": len(payload),
                       "sha256": sha256(payload), "copy_sha256": sha256(target.read_bytes())})
        records.append(record)
    if gate["kind"] == "probe":
        relative = "probe-empty-live-battle.mjs"
        source = EVIDENCE / relative
        payload = source.read_bytes()
        target = gate_dir / "executed-source" / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
        records.append({"source_path": str(source), "relative_path": relative,
                        "present": True, "copy": str(target), "bytes": len(payload),
                        "sha256": sha256(payload), "copy_sha256": sha256(target.read_bytes())})
    return records


def run_gate(index: int, gate: dict[str, object], stamp: str, worktrees: dict[str, Path],
             npm_path: str, node_path: str, env: dict[str, str], versions: dict[str, str]) -> dict[str, object]:
    worktree = worktrees[str(gate["worktree"])]
    expected = COMMITS[str(gate["worktree"])]
    gate_dir = EVIDENCE / "runs" / stamp / f"{index:02d}-{gate['name']}"
    gate_dir.mkdir(parents=True, exist_ok=False)
    before = source_fence(worktree, gate_dir, "before")
    if before["head"] != expected or before["status_bytes"] != 0:
        raise SystemExit(f"{gate['name']} preflight failed; see {before['status_file']}")
    copies = copy_sources(worktree, gate_dir, gate)
    package_bytes = (worktree / "package.json").read_bytes()
    package = json.loads(package_bytes)
    script_value = package.get("scripts", {}).get(gate.get("script")) if gate["kind"] == "npm" else None
    expected_scripts = {
        "test:game-troop-runtime": "node tests/game-troop-runtime-runner.js game-troop-runtime",
        "test:game-roster-troops-status": "node tests/game-roster-troops-status-runner.js game-roster-troops-status",
    }
    if gate["kind"] == "npm":
        expected_value = expected_scripts[str(gate["script"])]
        if script_value != expected_value:
            raise SystemExit(f"unexpected package script at {expected}: {gate['script']}={script_value!r}")
        argv = [npm_path, "run", str(gate["script"])]
        command_display = f"npm run {gate['script']}"
    else:
        output_dir = gate_dir / "fixture-view"
        argv = [node_path, str(gate_dir / "executed-source/probe-empty-live-battle.mjs"),
                str(worktree), str(output_dir)]
        command_display = "node probe-empty-live-battle.mjs <source-root> <fixture-output-dir>"
    stdout_path = gate_dir / "stdout.log"
    stderr_path = gate_dir / "stderr.log"
    metadata_path = gate_dir / "metadata.json"
    metadata: dict[str, object] = {
        "gate": gate["name"], "kind": gate["kind"], "source_worktree": str(worktree),
        "expected_commit": expected, "source_fence_before": before,
        "command_display": command_display, "argv": argv, "cwd": str(worktree),
        "package_script_name": gate.get("script"), "package_script_value": script_value,
        "package_json_sha256": sha256(package_bytes),
        "environment_allowlist": {key: env.get(key) for key in ENV_KEYS},
        "node_bin": str(NODE_BIN), "runtime_versions": versions,
        "executed_source_copies": copies, "stdout_file": str(stdout_path),
        "stderr_file": str(stderr_path), "metadata_file": str(metadata_path),
        "started_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    if gate["kind"] == "probe":
        metadata["fixture_output_directory"] = str(output_dir)
        metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    with stdout_path.open("wb") as out, stderr_path.open("wb") as err:
        process = subprocess.Popen(argv, cwd=worktree, env=env, stdout=out, stderr=err)
        metadata["direct_pid"] = process.pid
        metadata["popen_returned_at_utc"] = datetime.now(timezone.utc).isoformat()
        metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        print(f"START {gate['name']} PID {process.pid}: {command_display}", flush=True)
        exit_code = process.wait()
    after = source_fence(worktree, gate_dir, "after")
    metadata.update({"direct_exit_code": exit_code,
                     "finished_at_utc": datetime.now(timezone.utc).isoformat(),
                     "source_fence_after": after})
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"END {gate['name']} PID {metadata['direct_pid']} exit {exit_code}", flush=True)
    return {"gate": gate["name"], "pid": metadata["direct_pid"], "exit": exit_code,
            "source_clean_after": after["head"] == expected and after["status_bytes"] == 0,
            "evidence_directory": str(gate_dir)}


def main() -> int:
    head = git(REPO, ["rev-parse", "HEAD"]).decode().strip()
    if head != COORDINATION_HEAD:
        raise SystemExit(f"coordination checkout must have HEAD {COORDINATION_HEAD}, got {head}")
    identity_evidence = verify_pinned_source_identity()
    for commit in COMMITS.values():
        resolved = git(REPO, ["rev-parse", commit]).decode().strip()
        if resolved != commit:
            raise SystemExit(f"historical commit unavailable: {commit}")
    env = os.environ.copy()
    env["PATH"] = str(NODE_BIN) + os.pathsep + env.get("PATH", "")
    npm_path = shutil.which("npm", path=env["PATH"])
    node_path = shutil.which("node", path=env["PATH"])
    if not npm_path or not node_path or Path(npm_path).parent.resolve() != NODE_BIN.resolve() or \
            Path(node_path).parent.resolve() != NODE_BIN.resolve():
        raise SystemExit(f"npm and Node must resolve from {NODE_BIN}")
    versions = {}
    for name, executable in (("node", node_path), ("npm", npm_path)):
        result = run_capture([executable, "--version"], REPO, env)
        versions[name] = result.stdout.decode("utf-8", "replace").strip()
        if result.returncode:
            raise SystemExit(f"{name} --version failed: {result.stderr.decode('utf-8', 'replace')}")
    if not versions["node"].startswith("v22."):
        raise SystemExit(f"expected Node 22, got {versions['node']}")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    run_root = EVIDENCE / "runs" / stamp
    run_root.mkdir(parents=True, exist_ok=False)
    identity_path = run_root / "source-identity-preflight.json"
    identity_path.write_text(json.dumps({"captured_at_utc": datetime.now(timezone.utc).isoformat(),
                                         "evidence": identity_evidence}, indent=2) + "\n",
                             encoding="utf-8")
    worktree_root = run_root / "worktrees"
    worktree_root.mkdir()
    (run_root / "git-worktree-setup.log").touch()
    worktrees = {}
    results = []
    try:
        with (run_root / "git-worktree-setup.log").open("ab") as setup_log:
            for name, commit in COMMITS.items():
                worktrees[name] = prepare_worktree(name, commit, worktree_root, setup_log)
        for index, gate in enumerate(GATES, start=1):
            results.append(run_gate(index, gate, stamp, worktrees, npm_path, node_path, env, versions))
        summary = {"source_repo": str(REPO), "coordination_head_at_launch": head,
                   "pinned_source_identity_evidence": identity_evidence,
                   "source_identity_preflight_file": str(identity_path),
                   "commits": COMMITS, "node_bin": str(NODE_BIN), "versions": versions,
                   "serial_order": [gate["name"] for gate in GATES], "results": results,
                   "all_gates_executed": len(results) == len(GATES)}
        summary_path = run_root / "summary.json"
        summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
        print(f"run directory: {run_root}")
        print(f"summary: {summary_path}")
        for result in results:
            print(f"{result['gate']}: PID {result['pid']}, exit {result['exit']}")
    finally:
        cleanup = []
        for path in worktrees.values():
            try:
                status = git(path, ["status", "--porcelain=v1", "--untracked-files=all",
                                    "--ignored=matching", "-z"])
                if status:
                    cleanup.append({"path": str(path), "removed": False,
                                    "reason": "source worktree not clean; preserved for inspection"})
                    continue
                result = subprocess.run(["git", "-C", str(REPO), "worktree", "remove", str(path)],
                                        cwd=REPO, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                        check=False)
                cleanup.append({"path": str(path), "removed": result.returncode == 0,
                                "error": result.stderr.decode("utf-8", "replace")})
            except Exception as error:
                cleanup.append({"path": str(path), "removed": False, "error": repr(error)})
        (run_root / "worktree-cleanup.json").write_text(json.dumps(cleanup, indent=2) + "\n",
                                                        encoding="utf-8")
    return 1 if len(results) != len(GATES) or any(result["exit"] for result in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
