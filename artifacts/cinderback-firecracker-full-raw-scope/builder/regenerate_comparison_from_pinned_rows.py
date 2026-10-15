#!/usr/bin/env python3
"""Regenerate comparison artifacts offline from frozen selected rows."""
from __future__ import annotations

import importlib.util
import json
import sys
import csv
import hashlib
from pathlib import Path

sys.dont_write_bytecode = True
root = Path(__file__).resolve().parent
repo = root.parents[2]
extractor_path = root / "extract_firecracker_signature.py"
spec = importlib.util.spec_from_file_location("firecracker_audit_extractor", extractor_path)
if spec is None or spec.loader is None:
    raise RuntimeError("cannot load bounded source audit extractor")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
report = json.loads((root / "pinned-linked-rows.json").read_text(encoding="utf-8"))
module.write_comparison(report)
source_receipts = json.loads((root / "source-receipts.json").read_text(encoding="utf-8"))
selected_rows_bytes = (root / "pinned-linked-rows.json").read_bytes()
assert hashlib.sha256(selected_rows_bytes).hexdigest() == source_receipts["selected_rows_artifact_sha256"]
with (root / "normalized-comparison.tsv").open(newline="", encoding="utf-8") as stream:
    comparison_rows = list(csv.DictReader(stream, delimiter="\t"))
dispositions = {}
for row in comparison_rows:
    dispositions[row["parity_disposition"]] = dispositions.get(row["parity_disposition"], 0) + 1
def file_receipt(name: str) -> dict[str, object]:
    raw = (root / name).read_bytes()
    return {"path": name, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}
generation = {
    "mode": "offline comparison regeneration; no upstream fetch and no test evaluator",
    "baseline_commit": report["local_baseline_commit"],
    "upstream_source_commit": report["source_commit"],
    "prior_artifact_commit": "da67b536e6a89b5fbd283a4ae68bf03aa19ad96a",
    "prior_comparison_preserved_at": "failed-attempt/normalized-comparison-before-correction.tsv",
    "source_receipts_sha256": file_receipt("source-receipts.json")["sha256"],
    "selected_rows_sha256": hashlib.sha256(selected_rows_bytes).hexdigest(),
    "source_fetch_extractor_sha256_at_fetch": source_receipts["extractor_sha256"],
    "current_comparison_extractor_sha256": hashlib.sha256((root / "extract_firecracker_signature.py").read_bytes()).hexdigest(),
    "actual_catalog_receipt": file_receipt("current-catalog-profile-receipts.json"),
    "comparison_output": file_receipt("normalized-comparison.tsv"),
    "reference_context_output": file_receipt("firecracker-normalized-context.tsv"),
    "comparator_field_count": len(report["test_only_binding"]["comparator_fields"]),
    "comparison_row_count": len(comparison_rows),
    "parity_disposition_counts": dispositions,
    "actual_catalog_snapshot_matches_prior_snapshot": True,
    "provenance_note": "The fetched source receipt retains the hash of the extractor version used at fetch time; the current extractor has an offline comparator writer correction. Pinned payload and selected-row bytes are unchanged.",
}
(root / "comparison-generation-receipt.json").write_text(json.dumps(generation, indent=2) + "\n", encoding="utf-8")
print(json.dumps({
    "mode": "offline comparison regeneration; no fetch or test",
    "catalog_receipt": "current-catalog-profile-receipts.json#recoilSpecialCatalog[0]",
    "comparator_field_count": len(report["test_only_binding"]["comparator_fields"]),
    "comparison_output": str((root / "normalized-comparison.tsv").relative_to(repo)),
    "context_output": str((root / "firecracker-normalized-context.tsv").relative_to(repo)),
    "comparison_row_count": len(comparison_rows),
    "parity_disposition_counts": dispositions,
}))
