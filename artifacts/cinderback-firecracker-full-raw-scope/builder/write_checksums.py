#!/usr/bin/env python3
"""Write the bounded artifact checksum ledger; excludes only itself."""
from __future__ import annotations

import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "SHA256SUMS.txt"


def main() -> None:
    rows = []
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file() or path == OUTPUT:
            continue
        raw = path.read_bytes()
        rows.append(f"{hashlib.sha256(raw).hexdigest()}  {path.relative_to(ROOT).as_posix()}  {len(raw)} bytes\n")
    OUTPUT.write_text("".join(rows), encoding="utf-8")
    print(f"wrote {len(rows)} checksums")


if __name__ == "__main__":
    main()
