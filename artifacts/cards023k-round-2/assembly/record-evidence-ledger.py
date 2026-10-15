#!/usr/bin/env python3
"""Hash and size the retained CARDS023K builder and assembly evidence."""

import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[3]
assembly_dir = Path(__file__).resolve().parent
ledger_path = assembly_dir / "assembly-evidence-ledger.json"
scopes = [
    "artifacts/cards023k-round-1/builder",
    "artifacts/cards023k-round-2/assembly",
]
rows = []
for scope in scopes:
    for path in sorted((root / scope).rglob("*")):
        if not path.is_file() or path == ledger_path:
            continue
        data = path.read_bytes()
        rows.append({
            "path": path.relative_to(root).as_posix(),
            "sizeBytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
        })

payload = {
    "algorithm": "SHA-256",
    "ledgerSelfExcluded": True,
    "scopes": scopes,
    "fileCount": len(rows),
    "totalSizeBytes": sum(row["sizeBytes"] for row in rows),
    "files": rows,
}
ledger_path.write_text(json.dumps(payload, indent=2) + "\n")
print(json.dumps({"fileCount": len(rows), "totalSizeBytes": payload["totalSizeBytes"], "ledger": ledger_path.name}))
