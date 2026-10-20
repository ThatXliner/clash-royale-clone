#!/usr/bin/env python3
"""Validate the three fixed-frame atlases against accepted native64 PNGs."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CARDS = ("skymaul", "brassbolt", "reedsting")
BUILDER_PATH = ROOT / "scripts" / "build-next-three-atlases.py"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_builder():
    spec = importlib.util.spec_from_file_location("next_three_atlas_builder", BUILDER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load atlas builder: {BUILDER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def verify_upstream(source_map: dict) -> dict:
    report_path = ROOT / "evidence" / "upstream" / "accepted-critic-report.md"
    index_path = ROOT / "evidence" / "upstream" / "model-artifact-index.json"
    report_bytes = report_path.read_bytes()
    index_bytes = index_path.read_bytes()
    report_hash = sha256(report_bytes)
    index_hash = sha256(index_bytes)
    require(report_hash == source_map["critic_report"]["sha256"], "accepted critic report SHA-256 changed")
    require(index_hash == source_map["model_artifact_index"]["sha256"], "model artifact index SHA-256 changed")
    report_text = report_bytes.decode("utf-8")
    index = read_json(index_path)
    indexed = {item["path"]: item for model in index["models"] for item in model["files"]}
    require(index["canonical_model_root"] == source_map["model_artifact_index"]["canonical_model_root"],
            "canonical model root changed")

    for card in CARDS:
        asset = source_map["assets"][card]
        require(f"**{card.title()} — PASS.**" in report_text, f"{card}: accepted critic verdict missing")
        receipt_record = asset["render_receipt"]
        receipt_path = ROOT / receipt_record["path"]
        receipt_bytes = receipt_path.read_bytes()
        require(len(receipt_bytes) == receipt_record["bytes"], f"{card}: copied render receipt size changed")
        require(sha256(receipt_bytes) == receipt_record["sha256"], f"{card}: copied render receipt SHA-256 changed")
        receipt = json.loads(receipt_bytes)
        require(receipt["card_id"] == card and receipt["runtime_integration"] is False,
                f"{card}: render receipt scope changed")
        receipt_images = [image for image in receipt["images"] if image["kind"] == "color"]
        receipt_cells = {(image["team"], image["direction"], image["pose"]): image for image in receipt_images}
        source_cells = {(cell["team"], cell["direction"], cell["pose"]): cell for cell in asset["cells"]}
        expected_cells = {
            (team, direction, pose)
            for team in ("river", "ember")
            for direction in ("east", "north", "south", "west")
            for pose in ("idle", "walk", "contact")
        }
        require(len(receipt_images) == 24 and len(receipt_cells) == 24 and set(receipt_cells) == expected_cells,
                f"{card}: render receipt does not contain exactly the 24 approved color cells")
        require(set(source_cells) == expected_cells, f"{card}: source map cell coverage changed")
        for key, cell in source_cells.items():
            image = receipt_cells[key]
            for source_key, expected_record in (("source_render", image["raw"]), ("approved_native64", image["native"])):
                actual_record = cell[source_key]
                require(actual_record["path"] == expected_record["path"]
                        and actual_record["bytes"] == expected_record["bytes"]
                        and actual_record["sha256"] == expected_record["sha256"]
                        and actual_record["width"] == expected_record["width"]
                        and actual_record["height"] == expected_record["height"],
                        f"{card} {key}: source-map {source_key} differs from render receipt")
            require(cell["renderer"] == {
                "engine": image["engine"],
                "view_transform": image["view_transform"],
                "frame": image["frame"],
                "evidence_origin": image["evidence_origin"],
            }, f"{card} {key}: renderer metadata differs from render receipt")
        canonical_receipt = asset["review_manifest"]["canonical_receipt_path"]
        receipt_index = indexed[canonical_receipt]
        require(receipt_index["bytes"] == len(receipt_bytes)
                and receipt_index["sha256"] == sha256(receipt_bytes),
                f"{card}: critic model artifact index disagrees with render receipt")
        source_model = asset["source_model"]
        model_index = indexed[source_model["canonical_path"]]
        require(model_index["bytes"] == source_model["bytes"]
                and model_index["sha256"] == source_model["sha256"],
                f"{card}: critic model artifact index disagrees with source model hash")
        require(receipt["blend"]["bytes"] == source_model["bytes"]
                and receipt["blend"]["sha256"] == source_model["sha256"],
                f"{card}: render receipt disagrees with source model hash")

    source_provenance_record = source_map["source_package_provenance"]
    provenance_path = ROOT / source_provenance_record["path"]
    provenance_bytes = provenance_path.read_bytes()
    require(sha256(provenance_bytes) == source_provenance_record["sha256"],
            "source package provenance SHA-256 changed")
    provenance = json.loads(provenance_bytes)
    require(provenance["license"] == "AGPL-3.0-only", "source package license provenance changed")
    return {
        "accepted_critic_report_sha256": report_hash,
        "model_artifact_index_sha256": index_hash,
        "source_package_provenance_sha256": sha256(provenance_path.read_bytes()),
        "render_receipts_verified": len(CARDS),
        "source_model_hashes_verified": len(CARDS),
    }


def verify_sources(source_map: dict, builder) -> int:
    expected = {
        (team, direction, pose)
        for team, pose in builder.ROWS
        for direction in builder.COLUMNS
    }
    manifest = read_json(ROOT / "evidence" / "source-copy-manifest.json")
    require(len(manifest["files"]) == 144, "source copy manifest must contain 72 raw and 72 native64 inputs")
    manifest_hashes = {entry["copy_path"]: entry for entry in manifest["files"]}
    cells_checked = 0
    for card in CARDS:
        asset = source_map["assets"][card]
        cell_lookup = {(cell["team"], cell["direction"], cell["pose"]): cell for cell in asset["cells"]}
        require(len(cell_lookup) == 24 and set(cell_lookup) == expected,
                f"{card}: source map must contain exactly the 24 layout cells")
        for cell in cell_lookup.values():
            for role, relative, record, dimensions in (
                ("raw_source", cell["source_copy"], cell["source_render"], builder.SOURCE_SIZE),
                ("approved_native64_reference", cell["native_reference_copy"], cell["approved_native64"], builder.CELL_SIZE),
            ):
                path = builder.payload_path(relative)
                data = path.read_bytes()
                require(len(data) == record["bytes"], f"{path}: copied byte length changed")
                require(sha256(data) == record["sha256"], f"{path}: copied source SHA-256 changed")
                manifest_record = manifest_hashes.get(relative)
                require(manifest_record is not None and manifest_record["role"] == role,
                        f"{path}: source copy manifest role mismatch")
                require(manifest_record["sha256"] == record["sha256"]
                        and manifest_record["bytes"] == record["bytes"],
                        f"{path}: source copy manifest hash mismatch")
                width, height, _ = builder.read_rgba_png(path, dimensions, require_profile=(role == "raw_source"))
                require((width, height) == (dimensions, dimensions), f"{path}: source PNG dimensions changed")
            cells_checked += 1
    return cells_checked


def mutate_and_check_rejection(source_map: dict) -> dict:
    cell = next(
        item for item in source_map["assets"]["skymaul"]["cells"]
        if (item["team"], item["pose"], item["direction"]) == ("river", "idle", "east")
    )
    with tempfile.TemporaryDirectory(prefix="next-three-atlas-sha-test-") as temporary:
        sandbox = Path(temporary) / "payload"
        (sandbox / "scripts").mkdir(parents=True)
        shutil.copy2(ROOT / "source-map.json", sandbox / "source-map.json")
        shutil.copy2(BUILDER_PATH, sandbox / "scripts" / BUILDER_PATH.name)
        shutil.copytree(ROOT / "inputs" / "raw-256", sandbox / "inputs" / "raw-256")
        mutated_path = sandbox / cell["source_copy"]
        original = mutated_path.read_bytes()
        changed = bytearray(original)
        changed[-1] ^= 1
        mutated_path.write_bytes(changed)
        output_dir = sandbox / "mutation-output"
        process = subprocess.run(
            [sys.executable, str(sandbox / "scripts" / BUILDER_PATH.name),
             "--output-dir", str(output_dir)],
            capture_output=True,
            text=True,
            check=False,
        )
        combined = process.stdout + process.stderr
        require(process.returncode != 0, "builder accepted a copied raw source with a changed SHA-256")
        require("source sha256 changed" in combined, "builder failed without the expected source SHA-256 rejection")
        require(not list(output_dir.glob("*.png")), "builder wrote atlas PNGs before rejecting the changed source")
        return {
            "passed": True,
            "mutated_copy": cell["source_copy"],
            "original_sha256": sha256(original),
            "mutated_sha256": sha256(bytes(changed)),
            "rejected_with": "source sha256 changed",
            "exit_code": process.returncode,
            "atlas_pngs_written": 0,
        }


def validate(args) -> dict:
    builder = load_builder()
    source_map_bytes = (ROOT / "source-map.json").read_bytes()
    source_map_hash = sha256(source_map_bytes)
    source_map = json.loads(source_map_bytes)
    source_layout = source_map["layout"]
    require(source_layout["source_px"] == [builder.SOURCE_SIZE, builder.SOURCE_SIZE],
            "source-map source dimensions differ from the builder contract")
    require(source_layout["cell_px"] == [builder.CELL_SIZE, builder.CELL_SIZE],
            "source-map cell dimensions differ from the builder contract")
    require(source_layout["atlas_px"] == [builder.ATLAS_WIDTH, builder.ATLAS_HEIGHT],
            "source-map atlas dimensions differ from the builder contract")
    require(source_layout["columns"] == list(builder.COLUMNS),
            "source-map columns differ from the builder contract")
    require(source_layout["rows"] == [{"team": team, "pose": pose} for team, pose in builder.ROWS],
            "source-map rows differ from the builder contract")
    require(source_layout["ground_pivot_px_per_cell"] == [32, 54],
            "source-map ground pivot differs from the approved native contract")
    upstream = verify_upstream(source_map)
    source_cells = verify_sources(source_map, builder)
    require(source_cells == 72, f"expected 72 cells, got {source_cells}")

    build_paths = {"clean-a": args.build_a.resolve(), "clean-b": args.build_b.resolve()}
    build_details = {}
    output_bytes = {}
    output_provenance = {}
    for build_name, build_path in build_paths.items():
        provenance_path = build_path / "provenance.json"
        provenance_bytes = provenance_path.read_bytes()
        provenance = json.loads(provenance_bytes)
        require(provenance["generator"]["source_map_sha256"] == source_map_hash,
                f"{build_name}: provenance references a different source map")
        require(provenance["generator"]["sha256"] == sha256(BUILDER_PATH.read_bytes()),
                f"{build_name}: provenance references a different generator")
        require(provenance["license"]["license_copy_sha256"] == sha256((ROOT / "evidence/project-LICENSE").read_bytes()),
                f"{build_name}: project license copy changed")
        output_provenance[build_name] = provenance_bytes
        build_details[build_name] = {}
        for card in CARDS:
            path = build_path / builder.ASSET_FILENAMES[card]
            data = path.read_bytes()
            require(len(data) <= builder.MAX_OUTPUT_BYTES, f"{build_name}/{card}: output exceeds 1 MiB")
            width, height, _ = builder.read_rgba_png(path, (builder.ATLAS_WIDTH, builder.ATLAS_HEIGHT))
            require((width, height) == (256, 384), f"{build_name}/{card}: atlas dimensions changed")
            output_bytes[(build_name, card)] = data
            build_details[build_name][card] = {
                "path": str(path.relative_to(ROOT)),
                "bytes": len(data),
                "sha256": sha256(data),
                "dimensions_px": [width, height],
                "max_bytes": builder.MAX_OUTPUT_BYTES,
            }

    require(output_provenance["clean-a"] == output_provenance["clean-b"],
            "clean builds produced different provenance JSON bytes")
    for card in CARDS:
        require(output_bytes[("clean-a", card)] == output_bytes[("clean-b", card)],
                f"{card}: clean builds produced different atlas PNG bytes")

    cell_results = []
    comparison_details = []
    output_root = ROOT / "evidence" / "comparison-sheets"
    output_root.mkdir(parents=True, exist_ok=True)
    expected = {
        (team, direction, pose)
        for team, pose in builder.ROWS
        for direction in builder.COLUMNS
    }
    for card in CARDS:
        asset = source_map["assets"][card]
        cell_lookup = {(cell["team"], cell["direction"], cell["pose"]): cell for cell in asset["cells"]}
        output_path = build_paths["clean-a"] / builder.ASSET_FILENAMES[card]
        _, _, atlas_rows = builder.read_rgba_png(output_path, (builder.ATLAS_WIDTH, builder.ATLAS_HEIGHT))
        ref_rows = [bytearray(builder.ATLAS_WIDTH * 4) for _ in range(builder.ATLAS_HEIGHT)]
        for team, pose in builder.ROWS:
            for column_index, direction in enumerate(builder.COLUMNS):
                key = (team, direction, pose)
                cell = cell_lookup[key]
                row_index = builder.ROWS.index((team, pose))
                x_offset = column_index * builder.CELL_SIZE * 4
                y_offset = row_index * builder.CELL_SIZE
                reference = builder.payload_path(cell["native_reference_copy"])
                _, _, native_rows = builder.read_rgba_png(reference, builder.CELL_SIZE, require_profile=False)
                output_cell = [row[x_offset:x_offset + builder.CELL_SIZE * 4]
                               for row in atlas_rows[y_offset:y_offset + builder.CELL_SIZE]]
                require(output_cell == native_rows,
                        f"{card} {team}/{direction}/{pose}: decoded atlas RGBA differs from approved native64")
                for local_y, native_row in enumerate(native_rows):
                    ref_rows[y_offset + local_y][x_offset:x_offset + builder.CELL_SIZE * 4] = native_row
                cell_results.append({
                    "card": card,
                    "team": team,
                    "direction": direction,
                    "pose": pose,
                    "atlas_cell": {"column": column_index, "row": row_index},
                    "atlas_rgba_sha256": sha256(b"".join(output_cell)),
                    "native64_rgba_sha256": sha256(b"".join(native_rows)),
                    "pixel_equal": True,
                })
        ref_bytes_rows = [bytes(row) for row in ref_rows]
        comparison_rows = [atlas_rows[index] + ref_bytes_rows[index]
                           for index in range(builder.ATLAS_HEIGHT)]
        comparison_bytes = builder.encode_rgba_png(
            builder.ATLAS_WIDTH * 2, builder.ATLAS_HEIGHT, comparison_rows
        )
        comparison_path = output_root / f"{card}-atlas-vs-native64.png"
        comparison_path.write_bytes(comparison_bytes)
        _, _, comparison_decoded = builder.read_rgba_png(
            comparison_path, (builder.ATLAS_WIDTH * 2, builder.ATLAS_HEIGHT)
        )
        require(comparison_decoded == comparison_rows, f"{card}: comparison sheet PNG is not lossless")
        require(all(row[:builder.ATLAS_WIDTH * 4] == row[builder.ATLAS_WIDTH * 4:]
                    for row in comparison_decoded),
                f"{card}: comparison sheet halves differ")
        comparison_details.append({
            "path": str(comparison_path.relative_to(ROOT)),
            "bytes": len(comparison_bytes),
            "sha256": sha256(comparison_bytes),
            "dimensions_px": [builder.ATLAS_WIDTH * 2, builder.ATLAS_HEIGHT],
            "left": "clean-a atlas, native 64px pixels at 1:1",
            "right": "direct approved native64 cells, native 64px pixels at 1:1",
        })

    require(len(cell_results) == 72, f"expected 72 pixel comparisons, got {len(cell_results)}")
    mutation = mutate_and_check_rejection(source_map)
    return {
        "schema_version": 1,
        "status": "PASS",
        "scope": "Standalone fixed-frame atlas packing only.",
        "layout": {
            "atlas_px": [builder.ATLAS_WIDTH, builder.ATLAS_HEIGHT],
            "cell_px": [builder.CELL_SIZE, builder.CELL_SIZE],
            "columns": list(builder.COLUMNS),
            "rows": [{"team": team, "pose": pose} for team, pose in builder.ROWS],
            "ground_pivot_px_per_cell": [32, 54],
        },
        "source_cells_checked": source_cells,
        "decoded_native64_cell_comparisons": len(cell_results),
        "all_decoded_rgba_cells_match": True,
        "clean_builds": {
            "byte_identical_pngs": True,
            "byte_identical_provenance": True,
            "builds": build_details,
        },
        "source_sha_mutation_rejection": mutation,
        "upstream_provenance": upstream,
        "comparison_sheets": comparison_details,
        "cell_evidence": cell_results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build-a", type=Path, default=ROOT / "builds" / "clean-a")
    parser.add_argument("--build-b", type=Path, default=ROOT / "builds" / "clean-b")
    parser.add_argument("--output", type=Path, default=ROOT / "evidence" / "validation.json")
    args = parser.parse_args()
    result = validate(args)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    payload = (json.dumps(result, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode()
    args.output.write_bytes(payload)
    print(f"PASS: {result['decoded_native64_cell_comparisons']} atlas cells exactly match approved native64 RGBA")
    print("PASS: two clean builds have byte-identical PNGs and provenance")
    print("PASS: copied-source SHA mutation rejected before atlas output")
    print(f"validation: {args.output} {len(payload)} bytes sha256={sha256(payload)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, json.JSONDecodeError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
