from pathlib import Path
import os
import shlex
import shutil
import subprocess
import sys
import time

builder_dir = Path(__file__).resolve().parent
repo = builder_dir.parents[2]
run_id = "native-capture-05"
command = [shutil.which("node") or "node", str(builder_dir / "capture-aether-well-native-chrome.mjs")]
command_path = builder_dir / f"{run_id}.command.txt"
stdout_path = builder_dir / f"{run_id}.stdout.raw"
stderr_path = builder_dir / f"{run_id}.stderr.raw"
exit_path = builder_dir / f"{run_id}.exit.txt"
for path in (command_path, stdout_path, stderr_path, exit_path):
    if path.exists():
        raise SystemExit(f"Refusing to overwrite capture evidence: {path}")
command_path.write_text(shlex.join(command) + "\n", encoding="utf-8")
with stdout_path.open("wb") as stdout_file, stderr_path.open("wb") as stderr_file:
    child = subprocess.Popen(command, cwd=repo, stdout=stdout_file, stderr=stderr_file, env=os.environ.copy())
    print(f"CAPTURE_RUN_ID={run_id}", flush=True)
    print(f"CAPTURE_NODE_PID={child.pid}", flush=True)
    print(f"CAPTURE_NODE_COMMAND={shlex.join(command)}", flush=True)
    while child.poll() is None:
        time.sleep(0.25)
    actual_exit = child.returncode
exit_path.write_text(f"{actual_exit}\n", encoding="utf-8")
print(f"CAPTURE_ACTUAL_EXIT={actual_exit}", flush=True)
print(f"CAPTURE_RAW_PREFIX={builder_dir.relative_to(repo) / run_id}", flush=True)
for line in stdout_path.read_text(encoding="utf-8", errors="replace").splitlines():
    if line.startswith(("CAPTURE_NODE_PID=", "CAPTURE_HTTP_PORT=", "CAPTURE_CHROME=", "CAPTURE_CHROME_VERSION=", "CAPTURE_CHROME_PID=", "CAPTURED=", "CAPTURE_MATRIX_PASS=", "CAPTURE_BROWSER_AND_SERVER_CLOSED=")):
        print(line)
sys.exit(actual_exit)
