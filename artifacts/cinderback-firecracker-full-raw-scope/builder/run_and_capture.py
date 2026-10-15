#!/usr/bin/env python3
"""Run one bounded audit command and immutably capture exact process streams."""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
CAPTURES = ROOT / "command-runs"


def main() -> int:
    if len(sys.argv) > 1:
        argv = sys.argv[1:]
    else:
        argv = [sys.executable,
                "artifacts/cinderback-firecracker-full-raw-scope/builder/extract_firecracker_signature.py"]
    CAPTURES.mkdir(exist_ok=True)
    existing = [int(path.name[:4]) for path in CAPTURES.glob("[0-9][0-9][0-9][0-9].json")]
    run_id = max(existing, default=0) + 1
    stem = f"{run_id:04d}"
    started = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    result = subprocess.run(argv, cwd=REPO, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    finished = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    (CAPTURES / f"{stem}.stdout.raw").write_bytes(result.stdout)
    (CAPTURES / f"{stem}.stderr.raw").write_bytes(result.stderr)
    record = {
        "run_id": stem,
        "started_utc": started,
        "finished_utc": finished,
        "cwd": str(REPO),
        "argv": argv,
        "actual_exit_code": result.returncode,
        "stdout_file": f"command-runs/{stem}.stdout.raw",
        "stderr_file": f"command-runs/{stem}.stderr.raw",
        "streams_are_exact_subprocess_bytes": True,
    }
    (CAPTURES / f"{stem}.json").write_text(json.dumps(record, indent=2) + "\n")
    command_line = " ".join(argv)
    commands = ROOT / "COMMANDS.txt"
    with commands.open("a", encoding="utf-8") as stream:
        stream.write(f"run {stem}\t{command_line}\texit={result.returncode}\tstdout={stem}.stdout.raw\tstderr={stem}.stderr.raw\n")
    if len(sys.argv) > 1 and any("extract_current_receipts.mjs" in arg for arg in argv):
        if result.returncode == 0:
            (ROOT / "current-catalog-profile-receipts.json").write_bytes(result.stdout)
    print(json.dumps({"run_id": stem, "actual_exit_code": result.returncode,
                      "stdout_bytes": len(result.stdout), "stderr_bytes": len(result.stderr)}))
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
