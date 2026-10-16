#!/usr/bin/env python3
"""Record one focused GAME-001SRC npm test run with separate raw streams."""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys


repo = Path(sys.argv[1]).resolve()
capture = Path(sys.argv[2]).resolve()
node_bin = Path("/Users/me/.hermes/node/bin")
env = {
    "HOME": os.environ.get("HOME", "/Users/me"),
    "NO_COLOR": "1",
    "PATH": f"{node_bin}:/usr/bin:/bin",
    "TERM": "dumb",
}
command = [str(node_bin / "npm"), "run", "test:game-shared-runtime-integration"]

def utc_now():
    return datetime.now(timezone.utc).isoformat()


version = subprocess.run(
    [str(node_bin / "node"), "--version"],
    cwd=repo,
    env=env,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    check=False,
    text=True,
)
metadata = {
    "argv": command,
    "cwd": str(repo),
    "env_allowlist": env,
    "unset_environment_keys": ["CI", "FORCE_COLOR", "NODE_ENV", "NODE_OPTIONS", "TZ"],
    "node_version_argv": [str(node_bin / "node"), "--version"],
    "node_version_stdout": version.stdout,
    "node_version_stderr": version.stderr,
    "node_version_exit": version.returncode,
    "started_at_utc": utc_now(),
    "wrapper_pid": os.getpid(),
}
(capture / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")

with (capture / "stdout.raw").open("wb") as stdout, (capture / "stderr.raw").open("wb") as stderr:
    process = subprocess.Popen(command, cwd=repo, env=env, stdout=stdout, stderr=stderr)
    metadata["direct_npm_pid"] = process.pid
    metadata["spawned_at_utc"] = utc_now()
    (capture / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(f"direct npm PID: {process.pid}", flush=True)
    snapshot = subprocess.run(
        ["/bin/ps", "-o", "pid=,ppid=,command=", "-p", str(process.pid)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        text=True,
    )
    (capture / "process-after-spawn.txt").write_text(snapshot.stdout)
    (capture / "process-after-spawn.stderr.raw").write_text(snapshot.stderr)
    exit_code = process.wait()

metadata["finished_at_utc"] = utc_now()
metadata["exit_code"] = exit_code
closed = subprocess.run(
    ["/bin/ps", "-o", "pid=,ppid=,command=", "-p", str(process.pid)],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    check=False,
    text=True,
)
metadata["process_after_exit"] = closed.stdout
metadata["process_after_exit_stderr"] = closed.stderr
(capture / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
(capture / "exit.txt").write_text(f"{exit_code}\n")
raise SystemExit(exit_code)
