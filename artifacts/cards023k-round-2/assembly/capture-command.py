#!/usr/bin/env python3
"""Run one argv vector and retain its exact command, raw streams, and exit code."""

import json
import os
from pathlib import Path
import subprocess
import sys

ARTIFACTS = Path(__file__).resolve().parent
ROOT = ARTIFACTS.parents[2]


def main():
    if len(sys.argv) < 3:
        raise SystemExit("usage: capture-command.py NAME PROGRAM [ARG ...]")
    name, *argv = sys.argv[1:]
    environment = os.environ.copy()
    environment["PATH"] = "/Users/me/.hermes/node/bin:/Users/me/.local/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    result = subprocess.run(argv, cwd=ROOT, env=environment,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            check=False)
    (ARTIFACTS / f"{name}.command.json").write_text(json.dumps({
        "argv": argv,
        "cwd": str(ROOT),
    }, indent=2) + "\n")
    (ARTIFACTS / f"{name}.stdout.raw").write_bytes(result.stdout)
    (ARTIFACTS / f"{name}.stderr.raw").write_bytes(result.stderr)
    (ARTIFACTS / f"{name}.exit").write_text(f"{result.returncode}\n")
    sys.stdout.write(f"{name}: exit {result.returncode}; "
                     f"stdout {len(result.stdout)} bytes; "
                     f"stderr {len(result.stderr)} bytes\n")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
