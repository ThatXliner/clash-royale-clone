#!/usr/bin/env python3
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone

source = Path(sys.argv[1]).resolve()
run_dir = Path(sys.argv[2]).resolve()
label = sys.argv[3]
run_dir.mkdir(parents=True, exist_ok=False)

executed = [
    Path("package.json"),
    Path("tests/game-shared-runtime-integration-runner.js"),
    Path("tests/game-shared-runtime-integration.test.js"),
]
executed_dir = run_dir / "executed-source"
for rel in executed:
    target = executed_dir / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source / rel, target)

pkg = json.loads((source / "package.json").read_text())
script = pkg["scripts"]["test:game-shared-runtime-integration"]
argv = ["/Users/me/.hermes/node/bin/npm", "run", "test:game-shared-runtime-integration"]
env = {
    "PATH": "/Users/me/.hermes/node/bin:/usr/bin:/bin",
    "HOME": os.environ.get("HOME", "/tmp"),
    "CI": "true",
    "NODE_DISABLE_COMPILE_CACHE": "1",
    "npm_config_cache": "/private/tmp/clash-royale-game001src-critic-work-20261015/npm-cache",
    "npm_config_userconfig": "/dev/null",
    "npm_config_globalconfig": "/dev/null",
    "npm_config_update_notifier": "false",
    "npm_config_audit": "false",
    "npm_config_fund": "false",
}

def fence(root):
    rows = []
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            data = os.readlink(path).encode()
            kind = "symlink"
        elif path.is_file():
            data = path.read_bytes()
            kind = "file"
        else:
            continue
        rows.append({
            "path": path.relative_to(root).as_posix(),
            "kind": kind,
            "mode": oct(path.lstat().st_mode & 0o777),
            "sha256": hashlib.sha256(data).hexdigest(),
        })
    return rows

def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")

before = fence(source)
write_json(run_dir / "source-fence-before.json", before)
source_hashes = {}
for rel in executed:
    source_hashes[rel.as_posix()] = hashlib.sha256((source / rel).read_bytes()).hexdigest()
write_json(run_dir / "executed-source-sha256.json", source_hashes)
(run_dir / "command.txt").write_text("npm run test:game-shared-runtime-integration\n")
launch = {
    "label": label,
    "source_commit": "aa8cca6bfe2d2594064651d8a2bcda5243787a82" if label == "candidate" else "f0742221f2f20733be27529fcd2423e0ee55d7ee",
    "cwd": str(source),
    "argv": argv,
    "package_script": script,
    "environment": env,
    "executed_files": [p.as_posix() for p in executed],
    "node_version_expected": "v22.22.3",
}
write_json(run_dir / "launch.json", launch)
(run_dir / "stdout.raw").touch()
(run_dir / "stderr.raw").touch()
start = datetime.now(timezone.utc).isoformat()
started = time.monotonic()
with (run_dir / "stdout.raw").open("wb") as stdout, (run_dir / "stderr.raw").open("wb") as stderr:
    process = subprocess.Popen(argv, cwd=source, env=env, stdout=stdout, stderr=stderr)
    (run_dir / "pid.txt").write_text(f"{process.pid}\n")
    exit_code = process.wait()
    stdout.flush()
    os.fsync(stdout.fileno())
    stderr.flush()
    os.fsync(stderr.fileno())
after = fence(source)
write_json(run_dir / "source-fence-after.json", after)
(run_dir / "exit.txt").write_text(f"{exit_code}\n")
write_json(run_dir / "result.json", {
    "label": label,
    "direct_pid": process.pid,
    "direct_exit": exit_code,
    "start_utc": start,
    "duration_seconds": round(time.monotonic() - started, 3),
    "source_fence_unchanged": before == after,
    "source_file_count_before": len(before),
    "source_file_count_after": len(after),
})
print(json.dumps({"label": label, "direct_pid": process.pid, "direct_exit": exit_code,
                  "source_fence_unchanged": before == after}, sort_keys=True))
