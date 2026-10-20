#!/usr/bin/env python3
import json
import os
import pathlib
import subprocess
import sys
import time
from datetime import datetime, timezone

if len(sys.argv) < 4:
    raise SystemExit("usage: capture-command.py OUTDIR CWD COMMAND [ARG ...]")

output_dir = pathlib.Path(sys.argv[1]).resolve()
working_dir = pathlib.Path(sys.argv[2]).resolve()
argv = sys.argv[3:]
output_dir.mkdir(parents=True, exist_ok=False)

allowed_keys = ("PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "CI")
env = {key: os.environ[key] for key in allowed_keys if key in os.environ}
env["PATH"] = "/Users/me/.hermes/node/bin:/usr/bin:/bin:/usr/sbin:/sbin"

started = datetime.now(timezone.utc).isoformat()
start_monotonic = time.monotonic()
process = subprocess.Popen(
    argv,
    cwd=working_dir,
    env=env,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    start_new_session=True,
)

observed = {}
def capture_process_tree():
    result = subprocess.run(
        ["/bin/ps", "-axo", "pid=,ppid=,command="],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    rows = []
    for line in result.stdout.splitlines():
        parts = line.strip().split(None, 2)
        if len(parts) != 3:
            continue
        try:
            pid, ppid = int(parts[0]), int(parts[1])
        except ValueError:
            continue
        rows.append((pid, ppid, parts[2]))
    descendants = {process.pid}
    changed = True
    while changed:
        changed = False
        for pid, ppid, _ in rows:
            if ppid in descendants and pid not in descendants:
                descendants.add(pid)
                changed = True
    for pid, ppid, command in rows:
        if pid in descendants:
            observed[str(pid)] = {"command": command, "ppid": ppid, "pid": pid}

while process.poll() is None:
    capture_process_tree()
    time.sleep(0.025)
stdout, stderr = process.communicate()
capture_process_tree()
ended = datetime.now(timezone.utc).isoformat()

(output_dir / "stdout.log").write_bytes(stdout)
(output_dir / "stderr.log").write_bytes(stderr)
metadata = {
    "argv": argv,
    "cwd": str(working_dir),
    "directExitStatus": process.returncode,
    "endedAtUtc": ended,
    "environmentAllowlist": env,
    "observedProcessTree": sorted(observed.values(), key=lambda item: item["pid"]),
    "pid": process.pid,
    "rootPid": process.pid,
    "startedAtUtc": started,
    "wallSeconds": round(time.monotonic() - start_monotonic, 6),
}
(output_dir / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"argv": argv, "directExitStatus": process.returncode, "metadata": str(output_dir / "metadata.json"), "pid": process.pid, "stderr": str(output_dir / "stderr.log"), "stdout": str(output_dir / "stdout.log")}, separators=(",", ":")))
raise SystemExit(process.returncode)
