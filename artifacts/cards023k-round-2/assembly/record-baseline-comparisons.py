#!/usr/bin/env python3
"""Record product and non-product path deltas from the frozen old base."""

import collections
import hashlib
import json
import subprocess
from pathlib import Path

OLD = "ff562bd3027f40509f0e5e7e6f9848d98faf6346"
BASELINE = "950c2b8780521234aa6ab08af677f4892794eebb"
HBR_LAYER = "22fc972fcba5357957ffacfe43c59662f95344b2"
OUT = Path(__file__).resolve().parent


def run(*args):
    return subprocess.check_output(args)


def blob_record(rev, path):
    resolved = subprocess.run(
        ["git", "rev-parse", "--verify", f"{rev}:{path}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if resolved.returncode != 0:
        return {"gitBlob": None, "sizeBytes": None, "sha256": None}
    oid = resolved.stdout.decode().strip()
    data = run("git", "cat-file", "blob", oid)
    return {
        "gitBlob": oid,
        "sizeBytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def is_product(path):
    return (
        path.startswith(("src/", "tests/", "scripts/", "dist/"))
        or path in ("package.json", "package-lock.json")
    )


def compare(right, label):
    fields = run("git", "diff", "--name-status", "-z", OLD, right).decode().split("\0")
    entries = []
    counts = collections.Counter()
    i = 0
    while i < len(fields) - 1:
        status = fields[i]
        i += 1
        if status.startswith(("R", "C")):
            old_path, path = fields[i], fields[i + 1]
            i += 2
        else:
            old_path = path = fields[i]
            i += 1
        product = is_product(path)
        row = {"status": status, "path": path, "scope": "product" if product else "nonProduct"}
        if product:
            row["old"] = blob_record(OLD, old_path)
            row["new"] = blob_record(right, path)
        if old_path != path:
            row["oldPath"] = old_path
        entries.append(row)
        counts[(row["scope"], status)] += 1

    product_entries = [e for e in entries if e["scope"] == "product"]
    non_product_entries = [e for e in entries if e["scope"] == "nonProduct"]
    top_level = collections.Counter(e["path"].split("/", 1)[0] for e in non_product_entries)
    report = {
        "comparison": label,
        "oldCommit": OLD,
        "newCommit": right,
        "totalChangedPathCount": len(entries),
        "statusCounts": dict(sorted(collections.Counter(e["status"] for e in entries).items())),
        "productPathCount": len(product_entries),
        "productStatusCounts": dict(sorted(collections.Counter(e["status"] for e in product_entries).items())),
        "productPaths": product_entries,
        "nonProductPathCount": len(non_product_entries),
        "nonProductStatusCounts": dict(sorted(collections.Counter(e["status"] for e in non_product_entries).items())),
        "nonProductTopLevelPathCounts": dict(sorted(top_level.items())),
        "nonProductPaths": non_product_entries,
    }
    return report


comparisons = [
    compare(BASELINE, "old-ff562-to-current-main-950"),
    compare(HBR_LAYER, "old-ff562-to-layered-baseline-22fc"),
]
for report in comparisons:
    out_name = report["comparison"] + ".json"
    (OUT / out_name).write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps([
    {
        "comparison": r["comparison"],
        "totalChangedPathCount": r["totalChangedPathCount"],
        "statusCounts": r["statusCounts"],
        "productPathCount": r["productPathCount"],
        "productStatusCounts": r["productStatusCounts"],
        "nonProductPathCount": r["nonProductPathCount"],
        "nonProductStatusCounts": r["nonProductStatusCounts"],
        "nonProductTopLevelPathCounts": r["nonProductTopLevelPathCounts"],
    }
    for r in comparisons
], indent=2))
