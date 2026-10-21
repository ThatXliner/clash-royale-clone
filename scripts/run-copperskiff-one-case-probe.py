#!/usr/bin/env python3
"""Run a bounded actual-game Copperskiff browser diagnostic with durable receipts."""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid
from shutil import which


ROOT = Path(__file__).resolve().parents[1]
NODE = os.environ.get("GAME_BROWSER_NODE") or which("node") or "node"
PLAYWRIGHT = os.environ.get("GAME_BROWSER_PLAYWRIGHT", "playwright")
CHROME = os.environ.get("GAME_BROWSER_CHROME")
CAPTURE_ROOT = Path(tempfile.gettempdir())
ARTIFACTS_BASE = ROOT / "artifacts/app-redesign-copper-001-builder/browser/actual-game"
ALLOWLIST = (
    "PATH",
    "GAME_BROWSER_NODE",
    "GAME_BROWSER_PLAYWRIGHT",
    "GAME_BROWSER_CHROME",
    "GAME_BROWSER_ONE_CASE_PROBE",
    "GAME_BROWSER_SINGLE_CASE_FULL_ASSERTIONS",
    "GAME_BROWSER_ARTIFACT_ATTEMPT_ID",
    "GAME_BROWSER_ARTIFACTS_PREALLOCATED",
    "GAME_BROWSER_TEST_PID_FILE",
)


def write_new(path: Path, content: bytes) -> None:
    with path.open("xb") as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())


def main() -> int:
    if sys.argv[1:] not in ([], ["--first-case-full"], ["--full-matrix"]):
        print("usage: run-copperskiff-one-case-probe.py [--first-case-full|--full-matrix]",
              file=sys.stderr)
        return 2
    full_matrix = sys.argv[1:] == ["--full-matrix"]
    first_case_full = sys.argv[1:] == ["--first-case-full"]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    attempt_id = f"{stamp}-{uuid.uuid4().hex[:12]}"
    capture_dir = Path(tempfile.mkdtemp(prefix=f"copperskiff-{attempt_id}-capture-", dir=CAPTURE_ROOT))
    ARTIFACTS_BASE.mkdir(parents=True, exist_ok=True)
    artifact_dir = ARTIFACTS_BASE / f"attempt-{attempt_id}"
    artifact_dir.mkdir()

    test_pid_path = capture_dir / "test-child-pid.txt"
    argv = [NODE, "--test", "tests/copperskiff-live-sprite-game-browser.test.js"]
    environment = {key: os.environ[key] for key in ALLOWLIST if key in os.environ}
    environment.update({
        "PATH": os.environ.get("PATH", os.defpath),
        "GAME_BROWSER_NODE": NODE,
        "GAME_BROWSER_PLAYWRIGHT": PLAYWRIGHT,
        "GAME_BROWSER_ONE_CASE_PROBE": "1" if not first_case_full and not full_matrix else "0",
        "GAME_BROWSER_SINGLE_CASE_FULL_ASSERTIONS": "1" if first_case_full else "0",
        "GAME_BROWSER_ARTIFACT_ATTEMPT_ID": attempt_id,
        "GAME_BROWSER_ARTIFACTS_PREALLOCATED": "1",
        "GAME_BROWSER_TEST_PID_FILE": str(test_pid_path),
    })
    if CHROME:
        environment["GAME_BROWSER_CHROME"] = CHROME
    allowlisted_environment = {key: environment[key] for key in ALLOWLIST if key in environment}
    write_new(capture_dir / "argv.json", (json.dumps(argv, indent=2) + "\n").encode())
    write_new(capture_dir / "launcher-argv.json",
              (json.dumps(["python3", Path(__file__).name, *sys.argv[1:]], indent=2) + "\n").encode())
    mode = "full-matrix" if full_matrix else "first-case-full" if first_case_full else "one-case"
    write_new(capture_dir / "mode.txt", (mode + "\n").encode())
    write_new(capture_dir / "working-directory.txt", (str(ROOT) + "\n").encode())
    write_new(capture_dir / "artifact-directory.txt", (str(artifact_dir) + "\n").encode())
    write_new(capture_dir / "environment-allowlist.json",
              (json.dumps(allowlisted_environment, indent=2, sort_keys=True) + "\n").encode())

    stdout_path = capture_dir / "stdout.txt"
    stderr_path = capture_dir / "stderr.txt"
    returncode = 130
    manager_pid = None
    preflight = subprocess.run(
        [sys.executable, "scripts/check-copperskiff-source-freeze.py"],
        cwd=ROOT,
        env={"PATH": os.environ.get("PATH", os.defpath)},
        shell=False,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    write_new(capture_dir / "preflight-argv.json", (json.dumps(
        [sys.executable, "scripts/check-copperskiff-source-freeze.py"], indent=2
    ) + "\n").encode())
    write_new(capture_dir / "preflight-stdout.txt", preflight.stdout.encode())
    write_new(capture_dir / "preflight-stderr.txt", preflight.stderr.encode())
    write_new(capture_dir / "preflight-exit-code.txt", (f"{preflight.returncode}\n").encode())
    with stdout_path.open("xb") as stdout_stream, stderr_path.open("xb") as stderr_stream:
        if preflight.returncode != 0:
            write_new(capture_dir / "launch-skipped.txt",
                      b"Source-freeze preflight failed; browser process was not launched.\n")
            returncode = 3
        else:
            try:
                manager = subprocess.Popen(
                    argv,
                    cwd=ROOT,
                    env=environment,
                    shell=False,
                    stdout=stdout_stream,
                    stderr=stderr_stream,
                )
            except OSError as error:
                write_new(capture_dir / "launch-error.txt",
                          (f"{type(error).__name__}: {error}\n").encode())
                returncode = 127
            else:
                manager_pid = manager.pid
                write_new(capture_dir / "manager-pid.txt", (f"{manager.pid}\n").encode())
                try:
                    returncode = manager.wait()
                except KeyboardInterrupt:
                    manager.terminate()
                    returncode = manager.wait()
                finally:
                    stdout_stream.flush()
                    stderr_stream.flush()
                    os.fsync(stdout_stream.fileno())
                    os.fsync(stderr_stream.fileno())
    write_new(capture_dir / "exit-code.txt", (f"{returncode}\n").encode())

    test_child_pid = int(test_pid_path.read_text(encoding="utf-8").strip()) \
        if test_pid_path.is_file() else None
    result = {
        "attemptId": attempt_id,
        "artifactDirectory": str(artifact_dir),
        "captureDirectory": str(capture_dir),
        "managerPid": manager_pid,
        "mode": mode,
        "testChildPid": test_child_pid,
        "testChildPidPath": str(test_pid_path),
        "testChildPidRecorded": test_pid_path.is_file(),
        "preflightPassed": preflight.returncode == 0,
        "exitCode": returncode,
    }
    print(json.dumps(result, sort_keys=True))
    return returncode


if __name__ == "__main__":
    sys.exit(main())
