#!/usr/bin/env python3
"""Run the remaining source-matched checks serially, stopping on failure."""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys


if len(sys.argv) != 3:
    raise SystemExit("usage: remaining-gates-sequence.py OUTPUT_DIR WORKTREE")

output = Path(sys.argv[1])
cwd = Path(sys.argv[2]).resolve()
output.mkdir(parents=True, exist_ok=False)
node = "/Users/me/.local/bin/node"
gates = [
    ("ui-combat-state", [node, "tests/ui-combat-state-runner.js", "ui-combat-state"]),
    ("nondeterminism-guard", [node, "tests/nondeterminism-guard-runner.js", "nondeterminism-guard"]),
    ("shipping-isolation-guard", [node, "tests/shipping-isolation-guard-runner.js", "shipping-isolation-guard"]),
    ("release-build", [node, "tests/release-build-runner.js", "release-build"]),
    ("shipping-isolation-release", [node, "tests/shipping-isolation-release-runner.js", "shipping-isolation-release"]),
    ("shipping-isolation-host", [node, "tests/shipping-isolation-host-runner.js", "shipping-isolation-host"]),
    ("visual-asset-manifest", [node, "tests/visual-asset-manifest-runner.js", "visual-asset-manifest"]),
]
environment = os.environ.copy()
records = []

for name, command in gates:
    run_dir = output / name
    run_dir.mkdir(exist_ok=False)
    recorded_environment = {
        key: environment[key]
        for key in (
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
        print(f"START {name} pid={process.pid}", flush=True)
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
    records.append({"name": name, "pid": process.pid, "returnCode": return_code})
    print(f"END {name} pid={process.pid} exit={return_code}", flush=True)
    if return_code != 0:
        break

summary = {
    "worktree": str(cwd),
    "sourceHead": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=cwd, text=True).strip(),
    "gates": records,
    "allComplete": len(records) == len(gates) and all(item["returnCode"] == 0 for item in records),
}
(output / "sequence.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
raise SystemExit(0 if summary["allComplete"] else records[-1]["returnCode"])
