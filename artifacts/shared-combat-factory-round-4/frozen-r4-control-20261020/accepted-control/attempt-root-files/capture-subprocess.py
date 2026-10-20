#!/usr/bin/python3
import argparse
import datetime
import json
import os
import selectors
import subprocess
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--output-dir", required=True)
parser.add_argument("--cwd", required=True)
parser.add_argument("--env-json", required=True)
parser.add_argument("command", nargs=argparse.REMAINDER)
args = parser.parse_args()
command = args.command[1:] if args.command[:1] == ["--"] else args.command
if not command:
    parser.error("a command after -- is required")

out = Path(args.output_dir)
out.mkdir(parents=True, exist_ok=False)
cwd = str(Path(args.cwd).resolve(strict=True))
env = json.loads(Path(args.env_json).read_text())
if not isinstance(env, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in env.items()):
    raise SystemExit("env-json must be an object of string keys and values")

def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

(out / "argv.json").write_text(json.dumps(command, indent=2) + "\n")
(out / "cwd.txt").write_text(cwd + "\n")
(out / "env.json").write_text(json.dumps(env, indent=2, sort_keys=True) + "\n")
(out / "started-at-utc.txt").write_text(stamp() + "\n")

with (out / "stdout.raw").open("wb", buffering=0) as stdout_file, (out / "stderr.raw").open("wb", buffering=0) as stderr_file:
    try:
        process = subprocess.Popen(
            command,
            cwd=cwd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
        )
    except OSError as error:
        (out / "spawn-error.txt").write_text(repr(error) + "\n")
        (out / "exit.txt").write_text("127\n")
        raise SystemExit(127)

    (out / "direct-pid.txt").write_text(str(process.pid) + "\n")
    print(f"START direct_pid={process.pid} cwd={cwd} argv={json.dumps(command)}", flush=True)

    selector = selectors.DefaultSelector()
    selector.register(process.stdout, selectors.EVENT_READ, (stdout_file, sys.stdout.buffer))
    selector.register(process.stderr, selectors.EVENT_READ, (stderr_file, sys.stderr.buffer))
    while selector.get_map():
        for key, _ in selector.select(timeout=0.5):
            data = os.read(key.fileobj.fileno(), 65536)
            if data:
                file_out, terminal_out = key.data
                file_out.write(data)
                terminal_out.write(data)
                terminal_out.flush()
            else:
                selector.unregister(key.fileobj)
                key.fileobj.close()
    exit_code = process.wait()
    (out / "exit.txt").write_text(str(exit_code) + "\n")
    (out / "finished-at-utc.txt").write_text(stamp() + "\n")
    print(f"EXIT direct_pid={process.pid} direct_exit={exit_code}", flush=True)
    raise SystemExit(exit_code)
