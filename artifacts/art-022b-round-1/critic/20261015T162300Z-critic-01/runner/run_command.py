#!/usr/bin/env python3
import json
import os
import resource
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[5]
EVIDENCE = Path(__file__).resolve().parents[1]
RECEIPTS = EVIDENCE / "receipts"
NODE_DIR = Path("/Users/me/.hermes/node/bin")
NPM_DIR = Path("/Users/me/.local/bin")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

def utc():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def main():
    if "--" not in sys.argv:
        raise SystemExit("usage: run_command.py NAME -- command args...")
    split = sys.argv.index("--")
    if split != 2 or len(sys.argv) <= split + 1:
        raise SystemExit("usage: run_command.py NAME -- command args...")
    name = sys.argv[1]
    argv = sys.argv[split + 1:]
    RECEIPTS.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["PATH"] = os.pathsep.join([str(NODE_DIR), str(NPM_DIR), env.get("PATH", "")])
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    started = utc()
    start = time.monotonic()
    proc = subprocess.Popen(argv, cwd=REPO, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out, err = proc.communicate()
    elapsed = time.monotonic() - start
    after = resource.getrusage(resource.RUSAGE_CHILDREN)
    (RECEIPTS / f"{name}.stdout.raw").write_bytes(out)
    (RECEIPTS / f"{name}.stderr.raw").write_bytes(err)
    receipt = {
        "name": name,
        "cwd": str(REPO),
        "command": argv,
        "path_prefix": [str(NODE_DIR), str(NPM_DIR)],
        "node_executable": str(NODE_DIR / "node"),
        "npm_executable": str(NPM_DIR / "npm"),
        "started_utc": started,
        "ended_utc": utc(),
        "elapsed_seconds": round(elapsed, 3),
        "pid": proc.pid,
        "direct_exit_code": proc.returncode,
        "direct_process_closed": proc.poll() is not None,
        "stdout_bytes": len(out),
        "stderr_bytes": len(err),
        "child_resource_delta": {
            "user_seconds": round(after.ru_utime - before.ru_utime, 6),
            "system_seconds": round(after.ru_stime - before.ru_stime, 6),
            "max_rss_platform_units_after": after.ru_maxrss,
        },
    }
    (RECEIPTS / f"{name}.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))
    return proc.returncode

if __name__ == "__main__":
    raise SystemExit(main())
