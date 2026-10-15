#!/usr/bin/env python3
"""Run one test command and preserve its exact child streams and exit code."""

import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone


if len(sys.argv) < 5:
    raise SystemExit("usage: gate-recorder.py RUN_NAME RUN_DIR CWD COMMAND [ARGS...]")

name, run_dir_arg, cwd_arg, *command = sys.argv[1:]
run_dir = Path(run_dir_arg)
cwd = Path(cwd_arg).resolve()
run_dir.mkdir(parents=True, exist_ok=False)
environment = os.environ.copy()
recorded_environment = {
    key: environment[key]
    for key in (
        "APP_SHELL_ARTIFACTS",
        "CARDS022I_ARTIFACTS",
        "GAME_BROWSER_CHROME",
        "GAME_BROWSER_PLAYWRIGHT",
        "PATH",
    )
    if key in environment
}

(run_dir / "command.json").write_text(
    json.dumps(
        {
            "name": name,
            "cwd": str(cwd),
            "command": command,
            "environment": recorded_environment,
            "startedAt": datetime.now(timezone.utc).isoformat(),
        },
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)

with (run_dir / "stdout.raw").open("xb") as stdout, (run_dir / "stderr.raw").open("xb") as stderr:
    process = subprocess.Popen(command, cwd=cwd, env=environment, stdout=stdout, stderr=stderr)
    (run_dir / "pid.txt").write_text(f"{process.pid}\n", encoding="utf-8")
    (run_dir / "run-start.json").write_text(
        json.dumps(
            {
                "pid": process.pid,
                "parentPid": os.getpid(),
                "startedAt": datetime.now(timezone.utc).isoformat(),
                "command": command,
                "cwd": str(cwd),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"started {name} child_pid={process.pid}", flush=True)
    return_code = process.wait()

(run_dir / "exitcode.txt").write_text(f"{return_code}\n", encoding="utf-8")
(run_dir / "run-final.json").write_text(
    json.dumps(
        {
            "pid": process.pid,
            "returnCode": return_code,
            "finishedAt": datetime.now(timezone.utc).isoformat(),
        },
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)
print(f"finished {name} child_pid={process.pid} exit={return_code}", flush=True)
raise SystemExit(return_code)
