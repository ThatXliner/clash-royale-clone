#!/usr/bin/env python3
"""Run one public yt-dlp section request with strict size and time limits."""

import glob
import hashlib
import json
import os
import resource
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path


MAX_BYTES = 20 * 1024 * 1024
DEADLINE_SECONDS = 90
OUTPUT_PREFIX = "artifacts/official-footage-frame-probe-20261015/crl-xQBo-Oag2z4-2434-2437"
VIDEO_URL = "https://www.youtube.com/watch?v=xQBo-Oag2z4"
COMMAND = [
    "yt-dlp",
    "--no-warnings",
    "--no-playlist",
    "--no-part",
    "--limit-rate",
    "180K",
    "--socket-timeout",
    "10",
    "--download-sections",
    "*2434-2437",
    "--force-keyframes-at-cuts",
    "-f",
    "298",
    "-o",
    OUTPUT_PREFIX + ".%(ext)s",
    VIDEO_URL,
]


def set_file_limit():
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_BYTES, MAX_BYTES))


def matching_outputs():
    return [Path(item) for item in glob.glob(OUTPUT_PREFIX + "*") if Path(item).is_file()]


def output_bytes(paths):
    return sum(path.stat().st_size for path in paths)


def stop_process_group(process):
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()


started = time.monotonic()
timed_out = False
size_limited = False
with tempfile.TemporaryFile(mode="w+t", encoding="utf-8") as log_file:
    process = subprocess.Popen(
        COMMAND,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        start_new_session=True,
        preexec_fn=set_file_limit,
    )
    deadline = started + DEADLINE_SECONDS
    while process.poll() is None:
        paths = matching_outputs()
        if output_bytes(paths) > MAX_BYTES:
            size_limited = True
            stop_process_group(process)
            break
        if time.monotonic() >= deadline:
            timed_out = True
            stop_process_group(process)
            break
        time.sleep(0.2)
    exit_code = process.returncode
    elapsed = round(time.monotonic() - started, 3)
    log_file.seek(0)
    captured_log = log_file.read()

paths = matching_outputs()
output_records = []
for path in paths:
    data_hash = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            data_hash.update(chunk)
    output_records.append({
        "path": str(path),
        "bytes": path.stat().st_size,
        "sha256": data_hash.hexdigest(),
    })

record = {
    "command": COMMAND,
    "url": VIDEO_URL,
    "requested_range_seconds": [2434, 2437],
    "format_id": "298",
    "format": "1280x720, 60fps, MP4, video-only",
    "max_output_bytes": MAX_BYTES,
    "deadline_seconds": DEADLINE_SECONDS,
    "elapsed_seconds": elapsed,
    "exit_code": exit_code,
    "timed_out": timed_out,
    "size_limited": size_limited,
    "outputs": output_records,
    "yt_dlp_output": captured_log,
}
print(json.dumps(record, ensure_ascii=False, indent=2))
if timed_out:
    sys.exit(124)
if size_limited:
    sys.exit(125)
sys.exit(exit_code if exit_code is not None else 1)
