#!/usr/bin/env python3
from hashlib import sha256
import os
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve()
for directory, names, files in os.walk(root, followlinks=False):
    current = Path(directory)
    if current == root:
        names[:] = [name for name in names if name not in {"artifacts", "node_modules"}]
    for name in files:
        path = current / name
        relative = path.relative_to(root).as_posix()
        if path.is_symlink():
            data = os.readlink(path).encode("utf-8")
            kind = "symlink"
        else:
            data = path.read_bytes()
            kind = "file"
        print(f"{sha256(data).hexdigest()}\t{len(data)}\t{kind}\t{relative}")
