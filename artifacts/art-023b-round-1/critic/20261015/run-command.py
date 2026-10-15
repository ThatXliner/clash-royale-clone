#!/usr/bin/env python3
"""Run one review command with immutable stdout/stderr and direct exit receipt."""

import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


try:
    separator = sys.argv.index("--")
except ValueError:
    raise SystemExit("usage: run-command.py --dir RUN_DIR --cwd CWD -- ARGV...")

options = sys.argv[1:separator]
command = sys.argv[separator + 1:]
if not command:
    raise SystemExit("missing command after --")

run_dir = None
cwd = None
index = 0
while index < len(options):
    option = options[index]
    if option == "--dir" and index + 1 < len(options):
        run_dir = Path(options[index + 1])
        index += 2
    elif option == "--cwd" and index + 1 < len(options):
        cwd = Path(options[index + 1])
        index += 2
    else:
        raise SystemExit(f"unknown or incomplete option: {option}")

if run_dir is None or cwd is None:
    raise SystemExit("both --dir and --cwd are required")
if run_dir.exists():
    raise SystemExit(f"refusing to overwrite existing attempt: {run_dir}")
run_dir.mkdir(parents=True)

env = os.environ.copy()
receipt = {
    "argv": command,
    "cwd": str(cwd.resolve()),
    "startedAt": utc_now(),
    "environment": {
        name: env.get(name)
        for name in (
            "GAME_BROWSER_PLAYWRIGHT",
            "GAME_BROWSER_CHROME",
            "SHIPPING_ISOLATION_RELEASE_EVIDENCE",
            "CANDIDATE_ROOT",
            "REVIEW_CAPTURE_DIR",
        )
        if env.get(name) is not None
    },
}
(run_dir / "command.json").write_text(
    json.dumps(receipt, indent=2) + "\n", encoding="utf-8"
)

with (run_dir / "stdout.raw").open("wb") as stdout_file, (
    run_dir / "stderr.raw"
).open("wb") as stderr_file:
    process = subprocess.Popen(
        command,
        cwd=cwd,
        env=env,
        stdout=stdout_file,
        stderr=stderr_file,
    )
    (run_dir / "pid.txt").write_text(f"{process.pid}\n", encoding="ascii")
    exit_code = process.wait()

(run_dir / "exit.txt").write_text(f"{exit_code}\n", encoding="ascii")
receipt["finishedAt"] = utc_now()
receipt["exitCode"] = exit_code
(run_dir / "command.json").write_text(
    json.dumps(receipt, indent=2) + "\n", encoding="utf-8"
)
raise SystemExit(exit_code)
