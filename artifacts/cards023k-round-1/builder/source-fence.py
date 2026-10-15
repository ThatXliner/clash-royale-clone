#!/usr/bin/env python3
"""Hash the source, tests, release scripts, and generated release tree."""

import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile

ARTIFACTS = Path(__file__).resolve().parent
ROOT = ARTIFACTS.parents[2]
PATHS = ["src", "tests", "scripts", "dist", "package.json", "package-lock.json"]


def command(*argv):
    return subprocess.run(argv, cwd=ROOT, check=True, stdout=subprocess.PIPE).stdout


def from_archive(revision):
    data = command("git", "archive", "--format=tar", revision, *PATHS)
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as archive:
        return {
            member.name: hashlib.sha256(archive.extractfile(member).read()).hexdigest()
            for member in archive.getmembers()
            if member.isfile()
        }


def from_worktree():
    output = command("git", "ls-files", "-z", "--", *PATHS)
    names = {name.decode() for name in output.split(b"\0") if name}
    extra = command("git", "ls-files", "--others", "--exclude-standard", "-z",
                    "--", *PATHS)
    names.update(name.decode() for name in extra.split(b"\0") if name)
    return {
        name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
        for name in sorted(names)
        if (ROOT / name).is_file()
    }


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: source-fence.py BASE_REVISION")
    before = from_archive(sys.argv[1])
    after = from_worktree()
    changed = [
        {"path": path, "before": before.get(path), "after": after.get(path)}
        for path in sorted(before.keys() | after.keys())
        if before.get(path) != after.get(path)
    ]
    write_json(ARTIFACTS / "source-fence-before.json", before)
    write_json(ARTIFACTS / "source-fence-after.json", after)
    write_json(ARTIFACTS / "source-fence-delta.json", changed)
    print(json.dumps({
        "baseRevision": sys.argv[1],
        "beforeFileCount": len(before),
        "afterFileCount": len(after),
        "changedPaths": [entry["path"] for entry in changed],
    }, sort_keys=True))


if __name__ == "__main__":
    main()
