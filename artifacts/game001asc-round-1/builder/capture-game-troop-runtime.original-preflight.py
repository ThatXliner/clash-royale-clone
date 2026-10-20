#!/usr/bin/env python3
"""Capture the bounded GAME-001ASC gate; requires an explicit runtime grant."""

from __future__ import annotations

import argparse
from collections.abc import Callable
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import uuid


HERE = Path(__file__).resolve().parent
SOURCE_ROOT = HERE / "runtime-source"
GIT_BLOB_MANIFEST = HERE / "gate-capture" / "source-git-blobs.json"
CAPTURE_ROOT = HERE / "gate-capture" / "runs"
EXPECTED_CANDIDATE = "734dd8e3c5c8f21703b8fd39727e69f51eb93ab3"
EXPECTED_MANIFEST_SHA256 = "1aeac6e07d41505ad726f45d44d572eeae90e6d9df82ed41d573ba1bb06d1de4"
SYSTEM_PATH = "/usr/bin:/bin:/usr/sbin:/sbin"
GATE_ARGV = ("run", "test:game-troop-runtime")


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def persist_json(path: Path, value: dict[str, object]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)


def git_blob_oid(data: bytes) -> str:
    header = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


def inventory(root: Path) -> dict[str, dict[str, object]]:
    result: dict[str, dict[str, object]] = {}
    for path in sorted(root.rglob("*")):
        if path.is_dir():
            continue
        if path.is_symlink():
            raise RuntimeError(f"symlink is outside the bounded source contract: {path}")
        if not path.is_file():
            raise RuntimeError(f"unsupported filesystem entry: {path}")
        data = path.read_bytes()
        result[path.relative_to(root).as_posix()] = {
            "bytes": len(data),
            "git_blob": git_blob_oid(data),
            "sha256": sha256(data),
        }
    return result


def load_expected_manifest() -> tuple[dict[str, object], dict[str, dict[str, object]]]:
    raw = GIT_BLOB_MANIFEST.read_bytes()
    if sha256(raw) != EXPECTED_MANIFEST_SHA256:
        raise RuntimeError("pinned Git blob manifest hash changed")
    document = json.loads(raw)
    if document.get("candidate") != EXPECTED_CANDIDATE:
        raise RuntimeError("Git blob manifest candidate changed")
    files = document.get("files")
    if not isinstance(files, list):
        raise RuntimeError("Git blob manifest has no file list")
    expected: dict[str, dict[str, object]] = {}
    for entry in files:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
            raise RuntimeError("malformed Git blob manifest entry")
        expected[entry["path"]] = {
            "bytes": entry["bytes"],
            "git_blob": entry["git_blob"],
            "sha256": entry["sha256"],
        }
    return document, expected


def differences(
    before: dict[str, dict[str, object]], after: dict[str, dict[str, object]],
) -> dict[str, list[str]]:
    before_keys = set(before)
    after_keys = set(after)
    return {
        "added": sorted(after_keys - before_keys),
        "deleted": sorted(before_keys - after_keys),
        "modified": sorted(
            path for path in before_keys & after_keys if before[path] != after[path]
        ),
    }


def process_record(
    label: str,
    argv: list[str],
    cwd: Path,
    env: dict[str, str],
    run_dir: Path,
    on_spawn: Callable[[dict[str, object]], None] | None = None,
) -> dict[str, object]:
    stdout_path = run_dir / f"{label}.stdout.raw"
    stderr_path = run_dir / f"{label}.stderr.raw"
    started = utc_now()
    with stdout_path.open("wb") as stdout, stderr_path.open("wb") as stderr:
        process = subprocess.Popen(
            argv,
            cwd=cwd,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=stdout,
            stderr=stderr,
            close_fds=True,
        )
        pid = process.pid
        if on_spawn is not None:
            on_spawn({
                "argv": argv,
                "cwd": str(cwd),
                "startedUtc": started,
                "directChildPid": pid,
                "status": "running",
                "stdoutPath": stdout_path.relative_to(run_dir.parent).as_posix(),
                "stderrPath": stderr_path.relative_to(run_dir.parent).as_posix(),
            })
        return_code = process.wait()
    return {
        "argv": argv,
        "cwd": str(cwd),
        "startedUtc": started,
        "finishedUtc": utc_now(),
        "directChildPid": pid,
        "exitCode": return_code,
        "stdout": {
            "path": stdout_path.relative_to(run_dir.parent).as_posix(),
            "bytes": stdout_path.stat().st_size,
            "sha256": sha256(stdout_path.read_bytes()),
        },
        "stderr": {
            "path": stderr_path.relative_to(run_dir.parent).as_posix(),
            "bytes": stderr_path.stat().st_size,
            "sha256": sha256(stderr_path.read_bytes()),
        },
    }


def safe_bin(argument: str, label: str) -> Path:
    path = Path(argument).expanduser()
    if not path.is_absolute():
        raise RuntimeError(f"{label} path must be absolute: {argument}")
    path = path.resolve(strict=True)
    if not path.is_file() or not os.access(path, os.X_OK):
        raise RuntimeError(f"{label} must name an executable file: {path}")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true",
                        help="required to launch the gate after runtime authorization")
    parser.add_argument("--node-bin", help="absolute Node.js 22 executable path")
    parser.add_argument("--npm-bin", help="absolute npm 10.9.8 executable path")
    args = parser.parse_args()
    if not args.execute:
        print("Prepared only. Pass --execute after the factory grants the runtime gate.")
        return 2
    if not args.node_bin or not args.npm_bin:
        parser.error("--node-bin and --npm-bin are required with --execute")

    run_id = f"{dt.datetime.now(dt.timezone.utc):%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex[:8]}"
    run_dir = CAPTURE_ROOT / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    (run_dir / "raw").mkdir()
    result: dict[str, object] = {
        "candidate": EXPECTED_CANDIDATE,
        "runId": run_id,
        "status": "preparing",
        "gate": "npm run test:game-troop-runtime",
        "intendedCommand": {"argvTail": list(GATE_ARGV), "unfiltered": True},
        "startedUtc": utc_now(),
        "executionAuthorizedByCaller": True,
        "runtimeSource": str(SOURCE_ROOT),
    }
    pre_inventory: dict[str, dict[str, object]] = {}
    post_inventory: dict[str, dict[str, object]] = {}
    expected: dict[str, dict[str, object]] = {}
    try:
        manifest_doc, expected = load_expected_manifest()
        result["gitBlobManifest"] = {
            "candidate": manifest_doc["candidate"],
            "path": str(GIT_BLOB_MANIFEST),
            "sha256": EXPECTED_MANIFEST_SHA256,
            "fileCount": len(expected),
        }
        pre_inventory = inventory(SOURCE_ROOT)
        result["prelaunchSource"] = {
            "fileCount": len(pre_inventory),
            "totalBytes": sum(int(item["bytes"]) for item in pre_inventory.values()),
            "matchesGitManifest": pre_inventory == expected,
            "files": pre_inventory,
        }
        prelaunch_copy = run_dir / "prelaunch-source"
        shutil.copytree(SOURCE_ROOT, prelaunch_copy, copy_function=shutil.copy2)
        copied_inventory = inventory(prelaunch_copy)
        result["prelaunchCopy"] = {
            "path": str(prelaunch_copy),
            "fileCount": len(copied_inventory),
            "matchesSource": copied_inventory == pre_inventory,
        }
        shutil.copy2(GIT_BLOB_MANIFEST, run_dir / "source-git-blobs.json")
        if pre_inventory != expected or copied_inventory != pre_inventory:
            raise RuntimeError("prelaunch source or copy does not match the pinned Git blob manifest")

        node_bin = safe_bin(args.node_bin, "Node.js")
        npm_bin = safe_bin(args.npm_bin, "npm")
        local = run_dir / "environment"
        home = local / "home"
        tmp = local / "tmp"
        cache = local / "npm-cache"
        home.mkdir(parents=True)
        tmp.mkdir()
        cache.mkdir()
        empty_config = local / "empty-npmrc"
        empty_config.write_bytes(b"")
        path_parts = [str(node_bin.parent), str(npm_bin.parent), *SYSTEM_PATH.split(":")]
        explicit_path = ":".join(dict.fromkeys(path_parts))
        env = {
            "HOME": str(home),
            "PATH": explicit_path,
            "TMPDIR": str(tmp),
            "TMP": str(tmp),
            "TEMP": str(tmp),
            "CI": "1",
            "LANG": "C.UTF-8",
            "LC_ALL": "C.UTF-8",
            "TZ": "UTC",
            "NO_COLOR": "1",
            "npm_config_cache": str(cache),
            "npm_config_userconfig": str(empty_config),
            "npm_config_globalconfig": str(empty_config),
            "npm_config_audit": "false",
            "npm_config_fund": "false",
            "npm_config_update_notifier": "false",
        }
        (run_dir / "environment-allowlist.json").write_text(
            json.dumps(env, indent=2) + "\n", encoding="utf-8")
        result["environment"] = {
            "allowlistPath": "environment-allowlist.json",
            "keys": sorted(env),
            "nodeBin": str(node_bin),
            "npmBin": str(npm_bin),
            "path": explicit_path,
        }
        node_version = process_record("node-version", [str(node_bin), "--version"],
                                      SOURCE_ROOT, env, run_dir / "raw")
        npm_version = process_record("npm-version", [str(npm_bin), "--version"],
                                     SOURCE_ROOT, env, run_dir / "raw")
        node_stdout = (run_dir / "raw" / "node-version.stdout.raw").read_text(encoding="utf-8").strip()
        npm_stdout = (run_dir / "raw" / "npm-version.stdout.raw").read_text(encoding="utf-8").strip()
        result["versionChecks"] = {"node": node_version, "npm": npm_version}
        if node_version["exitCode"] != 0 or not node_stdout.startswith("v22."):
            raise RuntimeError(f"required Node.js major version is 22; observed {node_stdout!r}")
        if npm_version["exitCode"] != 0 or npm_stdout != "10.9.8":
            raise RuntimeError(f"required npm version is 10.9.8; observed {npm_stdout!r}")

        gate_argv = [str(npm_bin), *GATE_ARGV]
        result["command"] = {
            "display": "npm run test:game-troop-runtime",
            "argv": gate_argv,
            "cwd": str(SOURCE_ROOT),
            "unfiltered": True,
        }
        result["status"] = "running"
        def record_gate_start(process_info: dict[str, object]) -> None:
            result["gateProcess"] = process_info
            result["status"] = "running"
            persist_json(run_dir / "result.json", result)

        result["gateProcess"] = process_record("gate", gate_argv, SOURCE_ROOT, env,
                                               run_dir / "raw", record_gate_start)
        result["status"] = "passed" if result["gateProcess"]["exitCode"] == 0 else "failed"
    except Exception as error:  # Preserve partial evidence and always fence the source tree.
        result["status"] = "preflight-failed" if "gateProcess" not in result else "failed"
        result["error"] = f"{type(error).__name__}: {error}"
    finally:
        try:
            post_inventory = inventory(SOURCE_ROOT)
            post_diff = differences(pre_inventory, post_inventory)
            result["postFence"] = {
                "runtimeSourceUnchanged": not any(post_diff.values()),
                "matchesGitManifest": post_inventory == expected,
                "fileCount": len(post_inventory),
                "changes": post_diff,
                "files": post_inventory,
            }
        except Exception as error:
            result["postFence"] = {"error": f"{type(error).__name__}: {error}"}
            result["status"] = "fence-failed"
        result["finishedUtc"] = utc_now()
        persist_json(run_dir / "result.json", result)
    print(f"{result['status']}: {run_dir}")
    return 0 if result.get("status") == "passed" and result.get("postFence", {}).get("runtimeSourceUnchanged") else 1


if __name__ == "__main__":
    sys.exit(main())
