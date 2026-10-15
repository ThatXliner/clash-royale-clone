#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path

if len(sys.argv) < 4 or sys.argv[2] != "--":
    raise SystemExit("usage: record.py ATTEMPT -- COMMAND [ARG ...]")
root = Path(__file__).resolve().parent
attempt = sys.argv[1]
command = sys.argv[3:]
out = root / attempt
out.mkdir(parents=False, exist_ok=False)
env = os.environ.copy()
tracked_env = {key: env.get(key) for key in (
    "GAME_BROWSER_CHROME", "GAME_BROWSER_PLAYWRIGHT", "APP_SHELL_ARTIFACTS",
    "CARDS022I_ARTIFACTS", "PATH")}
started = datetime.now(timezone.utc).isoformat()
with (out / "stdout.raw").open("wb") as stdout_file, (out / "stderr.raw").open("wb") as stderr_file:
    process = subprocess.Popen(command, cwd=os.getcwd(), env=env,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    pid = process.pid
    (out / "start.json").write_text(json.dumps({
        "argv": command, "cwd": os.getcwd(), "env": tracked_env,
        "pid": pid, "startedUtc": started,
    }, indent=2) + "\n")
    def copy_stream(source, destination):
        while True:
            chunk = source.read(65536)
            if not chunk:
                return
            destination.write(chunk)
            destination.flush()
    stdout_thread = threading.Thread(target=copy_stream, args=(process.stdout, stdout_file))
    stderr_thread = threading.Thread(target=copy_stream, args=(process.stderr, stderr_file))
    stdout_thread.start()
    stderr_thread.start()
    exit_code = process.wait()
    stdout_thread.join()
    stderr_thread.join()
finished = datetime.now(timezone.utc).isoformat()
receipt = {"argv": command, "cwd": os.getcwd(), "env": tracked_env,
           "exitCode": exit_code, "finishedUtc": finished, "pid": pid,
           "startedUtc": started}
(out / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, sort_keys=True))
raise SystemExit(exit_code)
