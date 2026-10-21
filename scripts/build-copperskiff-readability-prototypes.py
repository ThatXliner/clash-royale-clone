#!/usr/bin/env python3
"""Build external A/B/C Copperskiff readability prototypes from pinned R4 frames.

The script never changes a product asset. A is the exact R2 atlas, B samples
the center of each 4x supersample block, and C adds a one-pixel ink contour to
transparent pixels around B. All outputs retain the full 256x256 atlas and
64x64 cell windows.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
ATLAS_BUILDER_PATH = ROOT / "scripts/build-copperskiff-atlas.py"
SHIPPED_ATLAS = ROOT / "public/assets/copperskiff-battle-sprite.png"
R2_ATLAS = ROOT / "artifacts/app-redesign-copper-round-2/unadopted-candidate/public/assets/copperskiff-battle-sprite.png"
SPRITE_PROVENANCE = ROOT / "docs/art/copperskiff-battle-sprite-provenance.json"
INK = (25, 29, 34)
INK_HEX = "#191D22"
MAX_BYTES = 1_048_576


def fail(message: str) -> None:
    raise ValueError(message)


def load_atlas_builder() -> Any:
    spec = importlib.util.spec_from_file_location("copperskiff_atlas_builder", ATLAS_BUILDER_PATH)
    if spec is None or spec.loader is None:
        fail(f"could not load pinned atlas builder: {ATLAS_BUILDER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def center_sample(rows: list[bytes], builder: Any) -> list[bytes]:
    """Take one supersample-center RGBA value for every 4x4 source block."""
    sampled: list[bytes] = []
    for out_y in range(builder.CELL_SIZE):
        source_y = out_y * 4 + 2
        source_row = rows[source_y]
        target = bytearray(builder.CELL_SIZE * 4)
        for out_x in range(builder.CELL_SIZE):
            source_x = out_x * 4 + 2
            source_start = source_x * 4
            target_start = out_x * 4
            target[target_start:target_start + 4] = source_row[source_start:source_start + 4]
        sampled.append(bytes(target))
    return sampled


def add_ink_contour(rows: list[bytes], builder: Any) -> tuple[list[bytes], int]:
    """Add opaque ink only to transparent 8-neighbors of existing coverage."""
    output = [bytearray(row) for row in rows]
    added = 0
    size = builder.CELL_SIZE
    for y in range(size):
        for x in range(size):
            pixel = x * 4
            if rows[y][pixel + 3] != 0:
                continue
            touches_sprite = False
            for neighbor_y in range(max(0, y - 1), min(size, y + 2)):
                for neighbor_x in range(max(0, x - 1), min(size, x + 2)):
                    neighbor = neighbor_x * 4
                    if rows[neighbor_y][neighbor + 3] > 0:
                        touches_sprite = True
                        break
                if touches_sprite:
                    break
            if touches_sprite:
                output[y][pixel:pixel + 4] = bytes((*INK, 255))
                added += 1
    return [bytes(row) for row in output], added


def alpha_bounds(rows: list[bytes], cell_x: int, cell_y: int, builder: Any) -> dict[str, int] | None:
    left = builder.CELL_SIZE
    top = builder.CELL_SIZE
    right = bottom = -1
    x_offset = cell_x * builder.CELL_SIZE
    y_offset = cell_y * builder.CELL_SIZE
    for local_y in range(builder.CELL_SIZE):
        atlas_y = y_offset + local_y
        row = rows[atlas_y]
        for local_x in range(builder.CELL_SIZE):
            atlas_x = x_offset + local_x
            if row[atlas_x * 4 + 3] == 0:
                continue
            left = min(left, local_x)
            top = min(top, local_y)
            right = max(right, local_x)
            bottom = max(bottom, local_y)
    if right < 0:
        return None
    return {"left": left, "top": top, "right": right, "bottom": bottom}


def assert_clear_cell_margins(bounds: dict[str, int] | None, builder: Any, label: str) -> None:
    if bounds is None:
        fail(f"{label}: empty alpha cell")
    margins = (
        bounds["left"],
        bounds["top"],
        builder.CELL_SIZE - 1 - bounds["right"],
        builder.CELL_SIZE - 1 - bounds["bottom"],
    )
    if min(margins) < 2:
        fail(f"{label}: alpha margin {margins} is below two pixels")


def atlas_rows_from_cells(cells: list[list[bytes]], builder: Any) -> list[bytes]:
    size = builder.ATLAS_SIZE
    cell = builder.CELL_SIZE
    atlas = [bytearray(size * 4) for _ in range(size)]
    for row_index in range(len(builder.TEAMS_AND_ACTIONS)):
        for column_index in range(len(builder.DIRECTIONS)):
            cell_rows = cells[row_index * len(builder.DIRECTIONS) + column_index]
            for local_y, row in enumerate(cell_rows):
                y = row_index * cell + local_y
                x = column_index * cell * 4
                atlas[y][x:x + cell * 4] = row
    return [bytes(row) for row in atlas]


def flatten_atlas_cells(builder: Any) -> tuple[list[list[bytes]], list[dict[str, str]]]:
    source_cells: list[list[bytes]] = []
    source_receipts: list[dict[str, str]] = []
    source_root = ROOT / builder.SOURCE_ROOT.relative_to(builder.ROOT)
    for team, action in builder.TEAMS_AND_ACTIONS:
        for direction in builder.DIRECTIONS:
            name = f"tapered_canopy-{team}-{direction}-{action}.png"
            path = source_root / name
            source_bytes = path.read_bytes()
            source_hash = hashlib.sha256(source_bytes).hexdigest()
            expected = builder.EXPECTED_SOURCE_SHA256[(team, direction, action)]
            if source_hash != expected:
                fail(f"pinned source hash mismatch for {path}: {source_hash}")
            width, height, rows = builder.read_rgba_png(path)
            if (width, height) != (builder.SOURCE_SIZE, builder.SOURCE_SIZE):
                fail(f"{path}: expected full {builder.SOURCE_SIZE}x{builder.SOURCE_SIZE} frame")
            source_cells.append(center_sample(rows, builder))
            source_receipts.append({
                "action": action,
                "direction": direction,
                "path": path.relative_to(ROOT).as_posix(),
                "sha256": source_hash,
                "team": team,
            })
    return source_cells, source_receipts


def interior_equal(base_rows: list[bytes], outlined_rows: list[bytes], builder: Any) -> int:
    checked = 0
    for y in range(builder.ATLAS_SIZE):
        for x in range(builder.ATLAS_SIZE):
            offset = x * 4
            if base_rows[y][offset + 3] == 0:
                continue
            if base_rows[y][offset:offset + 4] != outlined_rows[y][offset:offset + 4]:
                fail(f"C changed a B color/interior pixel at atlas ({x},{y})")
            checked += 1
    return checked


def assert_contour_only(base_rows: list[bytes], outlined_rows: list[bytes], builder: Any) -> int:
    size = builder.ATLAS_SIZE
    added = 0
    for y in range(size):
        for x in range(size):
            offset = x * 4
            if base_rows[y][offset + 3] > 0:
                continue
            if outlined_rows[y][offset + 3] == 0:
                continue
            cell_x, cell_y = x // builder.CELL_SIZE, y // builder.CELL_SIZE
            cell_left, cell_top = cell_x * builder.CELL_SIZE, cell_y * builder.CELL_SIZE
            has_base_neighbor = False
            for ny in range(max(cell_top, y - 1), min(cell_top + builder.CELL_SIZE, y + 2)):
                for nx in range(max(cell_left, x - 1), min(cell_left + builder.CELL_SIZE, x + 2)):
                    if base_rows[ny][nx * 4 + 3] > 0:
                        has_base_neighbor = True
                        break
                if has_base_neighbor:
                    break
            if not has_base_neighbor:
                fail(f"C alpha extends beyond one pixel at atlas ({x},{y})")
            if tuple(outlined_rows[y][offset:offset + 3]) != INK or outlined_rows[y][offset + 3] != 255:
                fail(f"C contour color is not opaque {INK_HEX} at atlas ({x},{y})")
            added += 1
    return added


def variant_metadata(image_path: Path, builder: Any) -> tuple[dict[str, Any], list[bytes]]:
    data = image_path.read_bytes()
    if len(data) > MAX_BYTES:
        fail(f"{image_path}: {len(data)} bytes exceeds {MAX_BYTES}")
    width, height, rows = builder.read_rgba_png(image_path)
    if (width, height) != (builder.ATLAS_SIZE, builder.ATLAS_SIZE):
        fail(f"{image_path}: output is not the fixed {builder.ATLAS_SIZE}x{builder.ATLAS_SIZE} atlas")
    cells = []
    for row_index, (team, action) in enumerate(builder.TEAMS_AND_ACTIONS):
        for column_index, direction in enumerate(builder.DIRECTIONS):
            bounds = alpha_bounds(rows, column_index, row_index, builder)
            label = f"{team}/{direction}/{action}"
            assert_clear_cell_margins(bounds, builder, f"{image_path.name} {label}")
            cells.append({
                "action": action,
                "alphaBounds": bounds,
                "direction": direction,
                "team": team,
            })
    return ({
        "byteLength": len(data),
        "cells": cells,
        "dimensions": [builder.ATLAS_SIZE, builder.ATLAS_SIZE],
        "format": "RGBA8 PNG",
        "path": image_path.name,
        "sha256": hashlib.sha256(data).hexdigest(),
    }, rows)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path, help="external R3 prototype directory")
    args = parser.parse_args()
    output_dir = args.output_dir.resolve()
    if output_dir == ROOT or ROOT in output_dir.parents:
        fail("prototype outputs must stay outside the candidate source tree")
    for protected in (SHIPPED_ATLAS.resolve(), *(p.resolve() for p in (ROOT / "design").rglob("*.png"))):
        if protected == output_dir or protected in output_dir.parents:
            fail(f"prototype output directory would overwrite a protected source: {protected}")

    builder = load_atlas_builder()
    source_cells, source_receipts = flatten_atlas_cells(builder)
    crisp_rows = atlas_rows_from_cells(source_cells, builder)
    outlined_cells: list[list[bytes]] = []
    contour_pixels_per_cell: list[dict[str, Any]] = []
    for index, cell_rows in enumerate(source_cells):
        outlined, added = add_ink_contour(cell_rows, builder)
        outlined_cells.append(outlined)
        row_index, column_index = divmod(index, len(builder.DIRECTIONS))
        team, action = builder.TEAMS_AND_ACTIONS[row_index]
        contour_pixels_per_cell.append({
            "action": action,
            "addedOpaqueInkPixels": added,
            "direction": builder.DIRECTIONS[column_index],
            "team": team,
        })
    outlined_rows = atlas_rows_from_cells(outlined_cells, builder)
    interior_pixels_preserved = interior_equal(crisp_rows, outlined_rows, builder)
    contour_pixels = assert_contour_only(crisp_rows, outlined_rows, builder)

    output_dir.mkdir(parents=True, exist_ok=True)
    baseline_out = output_dir / "A-current-r2.png"
    crisp_out = output_dir / "B-crisp-center-sample.png"
    outline_out = output_dir / "C-crisp-center-plus-1px-ink-outline.png"
    baseline_out.write_bytes(R2_ATLAS.read_bytes())
    crisp_out.write_bytes(builder.encode_rgba_png(builder.ATLAS_SIZE, builder.ATLAS_SIZE, crisp_rows))
    outline_out.write_bytes(builder.encode_rgba_png(builder.ATLAS_SIZE, builder.ATLAS_SIZE, outlined_rows))
    variants = []
    decoded_rows = {}
    for label, path, method in (
        ("A", baseline_out, "byte-identical current R2 atlas; 4x4 alpha-premultiplied integer area average"),
        ("B", crisp_out, "center sample of each 4x4 block from the pinned R4 256x256 source frame"),
        ("C", outline_out, "same center sample as B plus one opaque 8-connected #191D22 contour pixel in transparent pixels"),
    ):
        metadata, rows = variant_metadata(path, builder)
        metadata["label"] = label
        metadata["postprocess"] = method
        variants.append(metadata)
        decoded_rows[label] = rows

    interior_count_check = interior_equal(decoded_rows["B"], decoded_rows["C"], builder)
    if interior_count_check != interior_pixels_preserved:
        fail("B/C interior pixel accounting changed during PNG encode/decode")
    contour_count_check = assert_contour_only(decoded_rows["B"], decoded_rows["C"], builder)
    if contour_count_check != contour_pixels:
        fail("B/C contour pixel accounting changed during PNG encode/decode")

    source_provenance = json.loads(SPRITE_PROVENANCE.read_text(encoding="utf-8"))
    manifest = {
        "schemaVersion": 1,
        "purpose": "R3 native-context readability prototype; no product asset adopted",
        "identity": {
            "sourceModel": source_provenance["identity_source"]["model"],
            "sourceModelSha256": source_provenance["identity_source"]["model_sha256"],
            "sourceFrames": source_receipts,
            "sourceFramesAreUnmodified": True,
            "sourceProvenanceSha256": hashlib.sha256(SPRITE_PROVENANCE.read_bytes()).hexdigest(),
            "sourceBuilderSha256": hashlib.sha256(ATLAS_BUILDER_PATH.read_bytes()).hexdigest(),
            "prototypeBuilderSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        },
        "fixedPresentation": {
            "atlas": [builder.ATLAS_SIZE, builder.ATLAS_SIZE],
            "cell": [builder.CELL_SIZE, builder.CELL_SIZE],
            "columnsActorFacing": list(builder.DIRECTIONS),
            "rows": [f"{team}-{action}" for team, action in builder.TEAMS_AND_ACTIONS],
            "pivot": [32, 54],
            "bodyCssPixels": [13, 26],
            "cellWindowsPreserved": True,
            "perCellMinimumAlphaMargin": 2,
        },
        "postprocessChecks": {
            "outlineColor": INK_HEX,
            "outlineConnectedness": 8,
            "outlinePixelsByCell": contour_pixels_per_cell,
            "cInteriorColorAndAlphaPixelsPreservedAgainstB": interior_pixels_preserved,
            "cAddedPixelsAreOnlyOnePixelContour": contour_pixels,
            "interiorPixelsChanged": 0,
            "simulationOrInputChanged": False,
        },
        "variants": variants,
        "maxVariantBytes": MAX_BYTES,
    }
    manifest_path = output_dir / "provenance.json"
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8")
    manifest_path.write_bytes(manifest_bytes)
    provenance_hash = hashlib.sha256(manifest_bytes).hexdigest()
    (output_dir / "provenance.sha256").write_text(f"{provenance_hash}  provenance.json\n", encoding="utf-8")
    print(f"wrote A/B/C prototypes to {output_dir}")
    print(f"provenance sha256={provenance_hash}")
    for variant in variants:
        print(f"{variant['label']} {variant['path']} bytes={variant['byteLength']} sha256={variant['sha256']}")
    print(f"C preserves {interior_pixels_preserved} B interior pixels and adds {contour_pixels} ink contour pixels")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"build-copperskiff-readability-prototypes: {error}", file=sys.stderr)
        raise SystemExit(1)
