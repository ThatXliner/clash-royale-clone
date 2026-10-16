#!/usr/bin/env python3
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

label, cwd_text, evidence_text = sys.argv[1:]
cwd = Path(cwd_text).resolve()
evidence = Path(evidence_text).resolve()
evidence.mkdir(parents=True, exist_ok=True)

argv = ["/Users/me/.hermes/node/bin/npm", "run", "test:game-opponent"]
tmpdir = evidence / "tmp"
cache = evidence / "npm-cache"
tmpdir.mkdir(exist_ok=True)
cache.mkdir(exist_ok=True)
env = {
    "PATH": "/Users/me/.hermes/node/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    "HOME": os.environ["HOME"],
    "TMPDIR": str(tmpdir),
    "LANG": "C.UTF-8",
    "NO_COLOR": "1",
    "npm_config_cache": str(cache),
    "npm_config_userconfig": "/dev/null",
    "npm_config_update_notifier": "false",
}

script_path = Path(__file__).resolve()
script_hash = hashlib.sha256(script_path.read_bytes()).hexdigest()
(evidence / "argv.json").write_text(json.dumps(argv, indent=2) + "\n")
(evidence / "cwd.txt").write_text(str(cwd) + "\n")
(evidence / "env.json").write_text(json.dumps(env, indent=2, sort_keys=True) + "\n")
(evidence / "runner-script.sha256").write_text(f"{script_hash}  {script_path.name}\n")
(evidence / "runner-script.path").write_text(str(script_path) + "\n")


def fence(path):
    rows = []
    for base, dirs, files in os.walk(path, followlinks=False):
        dirs.sort()
        files.sort()
        for name in files:
            item = Path(base) / name
            rel = item.relative_to(path).as_posix()
            if item.is_symlink():
                payload = os.readlink(item).encode("utf-8", "surrogateescape")
                kind = "symlink"
            else:
                payload = item.read_bytes()
                kind = "file"
            digest = hashlib.sha256(payload).hexdigest()
            rows.append(f"{digest}  {kind}  {rel}")
    return "\n".join(rows) + "\n"


def process_snapshot(pid):
    result = subprocess.run(["/bin/ps", "-axo", "pid=,ppid=,stat=,command="],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    lines = result.stdout.decode("utf-8", "replace").splitlines()
    wanted = []
    for line in lines:
        if str(pid) in line or "game-opponent-runner.js" in line or "npm run test:game-opponent" in line:
            wanted.append(line)
    return "\n".join(wanted) + ("\n" if wanted else "")


(evidence / "source-fence-before.sha256").write_text(fence(cwd))
start = time.time_ns()
try:
    with (evidence / "stdout.txt").open("wb") as stdout, (evidence / "stderr.txt").open("wb") as stderr:
        process = subprocess.Popen(argv, cwd=cwd, env=env, stdout=stdout, stderr=stderr)
        pid = process.pid
        (evidence / "direct-pid.txt").write_text(f"{pid}\n")
        (evidence / "process-before.txt").write_text(process_snapshot(pid))
        print(f"DIRECT_PID={pid} LABEL={label} CWD={cwd}", flush=True)
        code = process.wait()
        (evidence / "exit.txt").write_text(f"{code}\n")
except Exception as exc:
    (evidence / "launch-error.txt").write_text(f"{type(exc).__name__}: {exc}\n")
    code = 127
    (evidence / "exit.txt").write_text(f"{code}\n")
(evidence / "elapsed-ns.txt").write_text(f"{time.time_ns() - start}\n")
(evidence / "process-after.txt").write_text(process_snapshot(locals().get("pid", -1)))
try:
    os.kill(locals().get("pid", -1), 0)
except (ProcessLookupError, ValueError):
    alive = False
except PermissionError:
    alive = True
else:
    alive = True
(evidence / "direct-pid-alive-after.txt").write_text(f"{str(alive).lower()}\n")
(evidence / "source-fence-after.sha256").write_text(fence(cwd))
before = (evidence / "source-fence-before.sha256").read_bytes()
after = (evidence / "source-fence-after.sha256").read_bytes()
(evidence / "source-fence-verdict.txt").write_text(
    "identical\n" if before == after else "DIFFERENT\n")
sys.exit(code)
