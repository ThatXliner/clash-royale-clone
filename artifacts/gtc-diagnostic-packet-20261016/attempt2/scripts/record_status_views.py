#!/usr/bin/env python3
"""Deferred serial capture of the exact six historical/current status scenarios."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from datetime import datetime, timezone


REPO = Path("/Users/me/.codex/worktrees/9456/clash-royale-clone")
EVIDENCE = Path(__file__).resolve().parent
NODE_BIN = Path("/Users/me/.hermes/node/bin")
CURRENT = "5cc4d3e424661cf638c5dbea288836ef4419fcf0"
COORDINATION_HEAD = "090d685a4fa07aa07c17618b1e18d00ecb63ff51"
HISTORICAL = "2a5bd7a44ad3773de59e8e6dd8baaebf0ec09764"
COMMITS = {"status-pin-2a": HISTORICAL, "current-5cc": CURRENT}
SELECTOR = "game roster troop status: deterministic session continuation hashes stay stable"
ENV_KEYS = ("PATH", "CI", "NODE_ENV", "TZ", "NODE_OPTIONS", "FORCE_COLOR", "NO_COLOR", "TERM")


def sha(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def git(cwd: Path, args: list[str]) -> bytes:
    result = subprocess.run(["git", "-C", str(cwd), *args], cwd=REPO,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode:
        raise RuntimeError(f"git -C {cwd} {' '.join(args)} failed: " +
                           result.stderr.decode("utf-8", "replace"))
    return result.stdout


def fence(worktree: Path, out: Path, label: str) -> dict[str, object]:
    status = git(worktree, ["status", "--porcelain=v1", "--untracked-files=all",
                            "--ignored=matching", "-z"])
    status_path = out / f"source-status-{label}.porcelain0"
    status_path.write_bytes(status)
    unstaged = git(worktree, ["diff", "--binary", "--no-ext-diff"])
    staged = git(worktree, ["diff", "--cached", "--binary", "--no-ext-diff"])
    return {"head": git(worktree, ["rev-parse", "HEAD"]).decode().strip(),
            "tree": git(worktree, ["rev-parse", "HEAD^{tree}"]).decode().strip(),
            "status_file": str(status_path), "status_bytes": len(status),
            "status_sha256": sha(status), "unstaged_diff_bytes": len(unstaged),
            "unstaged_diff_sha256": sha(unstaged), "staged_diff_bytes": len(staged),
            "staged_diff_sha256": sha(staged)}


def prepare_worktree(name: str, commit: str, parent: Path, setup_log) -> Path:
    target = parent / name
    if target.exists():
        raise SystemExit(f"refusing to reuse worktree path {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    commands = [
        ["git", "clone", "--shared", "--no-checkout", str(REPO), str(target)],
        ["git", "-C", str(target), "checkout", "--detach", commit],
    ]
    for argv in commands:
        result = subprocess.run(argv, cwd=REPO, stdout=setup_log,
                                stderr=subprocess.STDOUT, check=False)
        if result.returncode:
            raise SystemExit(f"worktree setup command failed ({result.returncode}): {argv}")
    if git(target, ["rev-parse", "HEAD"]).decode().strip() != commit:
        raise SystemExit(f"worktree {name} did not resolve to requested source")
    if git(target, ["status", "--porcelain=v1", "--untracked-files=all", "--ignored=matching", "-z"]):
        raise SystemExit(f"full shared clone {name} is not clean after checkout")
    return target


def copy_pipeline_sources(run_root: Path) -> list[dict[str, object]]:
    target_root = run_root / "diagnostic-tool-source"
    records = []
    for name in ("instrument_status_test.py", "record_status_views.py", "compare_fixture_views.py"):
        source = EVIDENCE / name
        payload = source.read_bytes()
        target = target_root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
        records.append({"source_path": str(source), "copy_path": str(target),
                        "bytes": len(payload), "sha256": sha(payload),
                        "copy_sha256": sha(target.read_bytes())})
    return records


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
    return {"execution_source_pin": CURRENT, "coordination_head": COORDINATION_HEAD,
            "shared_source_scope_objects": shared_scopes,
            "targeted_test_runner_blobs": targeted_objects,
            "tests_tree_diff_paths_execution_pin_to_coordination_head": test_differences}


def run_one(index: int, name: str, worktree: Path, expected: str, run_root: Path,
            env: dict[str, str], node_path: str, versions: dict[str, str]) -> dict[str, object]:
    gate_dir = run_root / f"{index:02d}-{name}"
    gate_dir.mkdir(parents=True, exist_ok=False)
    views_dir = gate_dir / "views"
    views_dir.mkdir()
    before = fence(worktree, gate_dir, "before")
    if before["head"] != expected or before["status_bytes"] != 0:
        raise SystemExit(f"{name} preflight failed; see {before['status_file']}")

    package_path = worktree / "package.json"
    runner_path = worktree / "tests/game-roster-troops-status-runner.js"
    test_path = worktree / "tests/game-roster-troops-status.test.js"
    package_bytes = package_path.read_bytes()
    package = json.loads(package_bytes)
    script_value = package.get("scripts", {}).get("test:game-roster-troops-status")
    expected_script = "node tests/game-roster-troops-status-runner.js game-roster-troops-status"
    if script_value != expected_script:
        raise SystemExit(f"unexpected status script at {expected}: {script_value!r}")

    tool_root = run_root / "diagnostic-tool-source"
    helper_argv = [sys.executable, str(tool_root / "instrument_status_test.py"),
                   str(worktree), str(gate_dir)]
    helper_out = subprocess.run(helper_argv, cwd=worktree, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, check=False)
    (gate_dir / "instrumenter.stdout.log").write_bytes(helper_out.stdout)
    (gate_dir / "instrumenter.stderr.log").write_bytes(helper_out.stderr)
    if helper_out.returncode:
        raise SystemExit(f"instrumenter returned {helper_out.returncode} at {name}")

    source_copy_root = gate_dir / "executed-source"
    for relative, payload in ((Path("package.json"), package_bytes),
                              (Path("tests/game-roster-troops-status-runner.js"), runner_path.read_bytes()),
                              (Path("tests/game-roster-troops-status.test.js"), test_path.read_bytes())):
        target = source_copy_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
    diagnostic_test = gate_dir / "diagnostic-copy/tests/game-roster-troops-status.test.js"
    argv = [node_path, "--test", f"--test-name-pattern={SELECTOR}", str(diagnostic_test)]
    stdout_path = gate_dir / "stdout.log"
    stderr_path = gate_dir / "stderr.log"
    metadata_path = gate_dir / "metadata.json"
    metadata: dict[str, object] = {
        "gate": name, "kind": "external capture-only copy of the exact pinned test",
        "source_worktree": str(worktree), "expected_commit": expected,
        "source_fence_before": before, "test_selector": SELECTOR,
        "original_npm_script_name": "test:game-roster-troops-status",
        "original_npm_script_value": script_value,
        "diagnostic_command_display": "Node --test with one exact test-name pattern",
        "argv": argv, "cwd": str(worktree),
        "environment_allowlist": {key: env.get(key) for key in ENV_KEYS},
        "diagnostic_environment_override": {"GTC_STATUS_VIEW_DIR": str(views_dir)},
        "node_bin": str(NODE_BIN), "runtime_versions": versions,
        "package_json_sha256": sha(package_bytes),
        "runner_sha256": sha(runner_path.read_bytes()),
        "original_test_sha256": sha(test_path.read_bytes()),
        "instrumentation_metadata": str(gate_dir / "instrumentation.json"),
        "output_view_directory": str(views_dir),
        "stdout_file": str(stdout_path), "stderr_file": str(stderr_path),
        "metadata_file": str(metadata_path), "instrumenter_argv": helper_argv,
        "instrumenter_exit_code": helper_out.returncode,
        "started_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    run_env = env.copy()
    run_env["GTC_STATUS_VIEW_DIR"] = str(views_dir)
    with stdout_path.open("wb") as out, stderr_path.open("wb") as err:
        process = subprocess.Popen(argv, cwd=worktree, env=run_env, stdout=out, stderr=err)
        metadata["direct_pid"] = process.pid
        metadata["popen_returned_at_utc"] = datetime.now(timezone.utc).isoformat()
        metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        print(f"START {name} PID {process.pid}: {argv}", flush=True)
        exit_code = process.wait()
    after = fence(worktree, gate_dir, "after")
    metadata.update({"direct_exit_code": exit_code,
                     "finished_at_utc": datetime.now(timezone.utc).isoformat(),
                     "source_fence_after": after,
                     "captured_view_files": sorted(path.name for path in views_dir.glob("*.json"))})
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"END {name} PID {metadata['direct_pid']} exit {exit_code}, "
          f"captured {len(metadata['captured_view_files'])} scenarios", flush=True)
    return {"gate": name, "pid": metadata["direct_pid"], "exit": exit_code,
            "captured_scenarios": len(metadata["captured_view_files"]),
            "source_clean_after": after["head"] == expected and after["status_bytes"] == 0,
            "evidence_directory": str(gate_dir)}


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: record_status_views.py BASE_RECORD_PINS_RUN_DIRECTORY")
    base_run = Path(sys.argv[1]).resolve()
    for name in ("02-gtc-empty-probe-c9/fixture-view", "04-gtc-empty-probe-current-5cc/fixture-view"):
        if not (base_run / name / "snapshot.raw").is_file():
            raise SystemExit(f"required completed empty setup probe not found: {base_run / name}")
    head = git(REPO, ["rev-parse", "HEAD"]).decode().strip()
    if head != COORDINATION_HEAD:
        raise SystemExit(f"coordination checkout HEAD must be {COORDINATION_HEAD}, got {head}")
    identity_evidence = verify_pinned_source_identity()
    for commit in COMMITS.values():
        if git(REPO, ["rev-parse", commit]).decode().strip() != commit:
            raise SystemExit(f"required source object unavailable: {commit}")
    env = os.environ.copy()
    env["PATH"] = str(NODE_BIN) + os.pathsep + env.get("PATH", "")
    node_path = shutil.which("node", path=env["PATH"])
    npm_path = shutil.which("npm", path=env["PATH"])
    if not node_path or Path(node_path).parent.resolve() != NODE_BIN.resolve():
        raise SystemExit(f"Node must resolve from {NODE_BIN}")
    if not npm_path or Path(npm_path).parent.resolve() != NODE_BIN.resolve():
        raise SystemExit(f"npm must resolve from {NODE_BIN}")
    versions = {}
    for name, executable in (("node", node_path), ("npm", npm_path)):
        result = subprocess.run([executable, "--version"], cwd=REPO, env=env,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        versions[name] = result.stdout.decode("utf-8", "replace").strip()
        if result.returncode:
            raise SystemExit(f"{name} --version failed: {result.stderr.decode('utf-8', 'replace')}")
    if not versions["node"].startswith("v22."):
        raise SystemExit(f"expected Node 22, got {versions['node']}")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    run_root = EVIDENCE / "status-view-runs-shared-clones" / stamp
    run_root.mkdir(parents=True, exist_ok=False)
    identity_path = run_root / "source-identity-preflight.json"
    identity_path.write_text(json.dumps({"captured_at_utc": datetime.now(timezone.utc).isoformat(),
                                         "evidence": identity_evidence}, indent=2) + "\n",
                             encoding="utf-8")
    (run_root / "git-shared-clone-setup.log").touch()
    (run_root / "private-clones").mkdir()
    pipeline_sources = copy_pipeline_sources(run_root)
    worktrees = {}
    results = []
    try:
        with (run_root / "git-shared-clone-setup.log").open("ab") as setup_log:
            for name, commit in COMMITS.items():
                worktrees[name] = prepare_worktree(name, commit, run_root / "private-clones", setup_log)
        for index, (name, commit) in enumerate(COMMITS.items(), start=1):
            results.append(run_one(index, name, worktrees[name], commit, run_root,
                                   env, node_path, versions))
        old_dir = run_root / "01-status-pin-2a/views"
        current_dir = run_root / "02-current-5cc/views"
        output_dir = run_root / "comparison"
        output_dir.mkdir()
        comparator_argv = [sys.executable, str(run_root / "diagnostic-tool-source" /
                                              "compare_fixture_views.py"),
                           str(base_run / "02-gtc-empty-probe-c9/fixture-view"),
                           str(base_run / "04-gtc-empty-probe-current-5cc/fixture-view"),
                           str(output_dir), str(old_dir), str(current_dir)]
        comparison = subprocess.run(comparator_argv, cwd=REPO, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, check=False)
        (run_root / "comparison.stdout.log").write_bytes(comparison.stdout)
        (run_root / "comparison.stderr.log").write_bytes(comparison.stderr)
        result = {"source_repo": str(REPO), "coordination_head": head,
                  "pinned_source_identity_evidence": identity_evidence,
                  "source_identity_preflight_file": str(identity_path),
                  "base_golden_run": str(base_run), "commits": COMMITS,
                  "node_bin": str(NODE_BIN), "runtime_versions": versions,
                  "test_selector": SELECTOR, "serial_order": list(COMMITS),
                  "diagnostic_tool_sources": pipeline_sources, "results": results,
                  "comparator_argv": comparator_argv,
                  "comparator_exit_code": comparison.returncode,
                  "comparator_summary": str(output_dir / "fixture-comparison-summary.json")}
        summary_path = run_root / "summary.json"
        summary_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print(f"run directory: {run_root}")
        print(f"summary: {summary_path}")
        for item in results:
            print(f"{item['gate']}: PID {item['pid']}, exit {item['exit']}, "
                  f"captured scenarios {item['captured_scenarios']}")
        print(f"comparator exit: {comparison.returncode}")
    finally:
        cleanup = []
        for path in worktrees.values():
            try:
                status = git(path, ["status", "--porcelain=v1", "--untracked-files=all",
                                    "--ignored=matching", "-z"])
                if status:
                    cleanup.append({"path": str(path), "removed": False,
                                    "reason": "source worktree not clean; preserved"})
                    continue
                shutil.rmtree(path)
                cleanup.append({"path": str(path), "removed": True,
                                "strategy": "clean full private shared clone removed after diagnostics"})
            except Exception as error:
                cleanup.append({"path": str(path), "removed": False, "error": repr(error)})
        (run_root / "clone-cleanup.json").write_text(json.dumps(cleanup, indent=2) + "\n",
                                                        encoding="utf-8")
    return 1 if any(item["exit"] for item in results) or comparison.returncode else 0


if __name__ == "__main__":
    raise SystemExit(main())
