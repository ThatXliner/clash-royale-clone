#!/usr/bin/env python3
"""Build deterministic 4-column by 6-row original Moss & Ember sprite atlases.

Input frames are the approved 256x256 RGBA renders copied into inputs/raw-256.
Each 256px source is reduced to one fixed 64px cell with a 4x4 alpha-premultiplied
area average. Only the Python standard library is used.
"""

from __future__ import annotations

import argparse
import binascii
import hashlib
import json
import platform
import struct
import sys
import zlib
from pathlib import Path
from typing import NoReturn

PAYLOAD_ROOT = Path(__file__).resolve().parents[1]
SOURCE_MAP_PATH = PAYLOAD_ROOT / "source-map.json"
DEFAULT_OUTPUT_DIR = PAYLOAD_ROOT / "atlases"
SOURCE_SIZE = 256
CELL_SIZE = 64
COLUMNS = ("east", "north", "south", "west")
ROWS = (
    ("river", "idle"),
    ("river", "walk"),
    ("river", "contact"),
    ("ember", "idle"),
    ("ember", "walk"),
    ("ember", "contact"),
)
ATLAS_WIDTH = CELL_SIZE * len(COLUMNS)
ATLAS_HEIGHT = CELL_SIZE * len(ROWS)
MAX_OUTPUT_BYTES = 1_048_576
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
COLOR_PROFILE = {
    b"sRGB": b"\x03",
    b"gAMA": bytes.fromhex("0000b18f"),
    b"cHRM": bytes.fromhex("00007a26000080840000fa00000080e8000075300000ea6000003a9800001770"),
}
ASSET_FILENAMES = {
    "mossguard": "mossguard-battle-sprite.png",
    "coilblade": "coilblade-battle-sprite.png",
}


def fail(message: str) -> NoReturn:
    raise ValueError(message)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha256(path: Path) -> str:
    return sha256(path.read_bytes())


def payload_path(relative: str) -> Path:
    path = (PAYLOAD_ROOT / relative).resolve()
    if PAYLOAD_ROOT not in path.parents:
        fail(f"path escapes payload: {relative}")
    return path


def paeth(left: int, above: int, upper_left: int) -> int:
    estimate = left + above - upper_left
    left_distance = abs(estimate - left)
    above_distance = abs(estimate - above)
    upper_left_distance = abs(estimate - upper_left)
    if left_distance <= above_distance and left_distance <= upper_left_distance:
        return left
    if above_distance <= upper_left_distance:
        return above
    return upper_left


def round_ratio_ties_to_even(numerator: int, denominator: int) -> int:
    """Match the source renderer's Python round() on these small exact ratios."""
    quotient, remainder = divmod(numerator, denominator)
    doubled_remainder = remainder * 2
    if doubled_remainder < denominator:
        return quotient
    if doubled_remainder > denominator:
        return quotient + 1
    return quotient + (quotient & 1)


def read_rgba_png(
    path: Path,
    expected_size: int | tuple[int, int],
    *,
    require_profile: bool = True,
) -> tuple[int, int, list[bytes]]:
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        fail(f"{path}: source is not a PNG")

    offset = len(PNG_SIGNATURE)
    width = height = bit_depth = color_type = interlace = None
    image_data = bytearray()
    profile: dict[bytes, bytes] = {}
    saw_header = saw_end = False
    saw_idat = False
    ended_idat = False
    while offset < len(data):
        if offset + 12 > len(data):
            fail(f"{path}: truncated PNG chunk header")
        length = struct.unpack_from(">I", data, offset)[0]
        chunk_type = data[offset + 4:offset + 8]
        start = offset + 8
        end = start + length
        crc_end = end + 4
        if crc_end > len(data):
            fail(f"{path}: truncated PNG chunk {chunk_type!r}")
        payload = data[start:end]
        recorded_crc = struct.unpack_from(">I", data, end)[0]
        if (binascii.crc32(chunk_type + payload) & 0xFFFFFFFF) != recorded_crc:
            fail(f"{path}: corrupt PNG chunk {chunk_type!r}")

        if chunk_type == b"IHDR":
            if saw_header or length != 13:
                fail(f"{path}: invalid PNG header")
            width, height, bit_depth, color_type, compression, filter_method, interlace = struct.unpack(
                ">IIBBBBB", payload
            )
            if compression != 0 or filter_method != 0:
                fail(f"{path}: unsupported PNG compression or filter method")
            saw_header = True
        elif chunk_type == b"IDAT":
            if not saw_header or saw_end or ended_idat:
                fail(f"{path}: PNG image data is out of order")
            saw_idat = True
            image_data.extend(payload)
        elif chunk_type in COLOR_PROFILE:
            if chunk_type in profile:
                fail(f"{path}: duplicate color profile chunk {chunk_type!r}")
            profile[chunk_type] = payload
        elif chunk_type == b"IEND":
            if length != 0 or not saw_idat:
                fail(f"{path}: invalid PNG end chunk")
            saw_end = True
            offset = crc_end
            break
        else:
            if saw_idat and chunk_type != b"IDAT":
                ended_idat = True
            # The accepted render PNGs may include benign EXIF, offset, physical
            # pixel-density, and text metadata. These chunks are validated by CRC
            # and deliberately excluded from the packed atlas.
            if chunk_type[0] & 0x20 == 0 and chunk_type not in {b"IHDR", b"IDAT", b"IEND"}:
                fail(f"{path}: unsupported critical PNG chunk {chunk_type!r}")
        offset = crc_end

    if not saw_header or not saw_end or offset != len(data):
        fail(f"{path}: incomplete PNG chunk stream")
    if require_profile and profile != COLOR_PROFILE:
        fail(f"{path}: approved sRGB/gAMA/cHRM profile changed")
    expected_dimensions = (expected_size, expected_size) if isinstance(expected_size, int) else expected_size
    if (width, height, bit_depth, color_type, interlace) != (*expected_dimensions, 8, 6, 0):
        fail(
            f"{path}: expected non-interlaced {expected_dimensions[0]}x{expected_dimensions[1]} 8-bit RGBA, "
            f"got {width}x{height}/{bit_depth}/{color_type}/{interlace}"
        )

    try:
        decoded = zlib.decompress(image_data)
    except zlib.error as error:
        fail(f"{path}: corrupt PNG image stream ({error})")
    stride = width * 4
    expected = (stride + 1) * height
    if len(decoded) != expected:
        fail(f"{path}: decoded byte length {len(decoded)} does not equal {expected}")

    rows: list[bytes] = []
    previous = bytearray(stride)
    cursor = 0
    for _ in range(height):
        filter_type = decoded[cursor]
        cursor += 1
        filtered = decoded[cursor:cursor + stride]
        cursor += stride
        row = bytearray(stride)
        for index, value in enumerate(filtered):
            left = row[index - 4] if index >= 4 else 0
            above = previous[index]
            upper_left = previous[index - 4] if index >= 4 else 0
            if filter_type == 0:
                predictor = 0
            elif filter_type == 1:
                predictor = left
            elif filter_type == 2:
                predictor = above
            elif filter_type == 3:
                predictor = (left + above) // 2
            elif filter_type == 4:
                predictor = paeth(left, above, upper_left)
            else:
                fail(f"{path}: unsupported PNG row filter {filter_type}")
            row[index] = (value + predictor) & 0xFF
        rows.append(bytes(row))
        previous = row
    return width, height, rows


def downsample_area4(rows: list[bytes]) -> list[bytes]:
    """Reduce every 4x4 block using alpha-premultiplied integer averaging."""
    reduced: list[bytes] = []
    for output_y in range(CELL_SIZE):
        output = bytearray(CELL_SIZE * 4)
        source_y = output_y * 4
        for output_x in range(CELL_SIZE):
            source_x = output_x * 4
            alpha_sum = red_alpha_sum = green_alpha_sum = blue_alpha_sum = 0
            for dy in range(4):
                row = rows[source_y + dy]
                for dx in range(4):
                    index = (source_x + dx) * 4
                    red, green, blue, alpha = row[index:index + 4]
                    alpha_sum += alpha
                    red_alpha_sum += red * alpha
                    green_alpha_sum += green * alpha
                    blue_alpha_sum += blue * alpha
            target = output_x * 4
            if alpha_sum:
                output[target] = round_ratio_ties_to_even(red_alpha_sum, alpha_sum)
                output[target + 1] = round_ratio_ties_to_even(green_alpha_sum, alpha_sum)
                output[target + 2] = round_ratio_ties_to_even(blue_alpha_sum, alpha_sum)
                output[target + 3] = round_ratio_ties_to_even(alpha_sum, 16)
        reduced.append(bytes(output))
    return reduced


def png_chunk(chunk_type: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + chunk_type
        + payload
        + struct.pack(">I", binascii.crc32(chunk_type + payload) & 0xFFFFFFFF)
    )


def encode_rgba_png(width: int, height: int, rows: list[bytes]) -> bytes:
    if len(rows) != height or any(len(row) != width * 4 for row in rows):
        fail("encoder received inconsistent RGBA rows")
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    scanlines = b"".join(b"\0" + row for row in rows)
    compressed = zlib.compress(scanlines, level=9)
    return (
        PNG_SIGNATURE
        + png_chunk(b"IHDR", header)
        + png_chunk(b"sRGB", COLOR_PROFILE[b"sRGB"])
        + png_chunk(b"gAMA", COLOR_PROFILE[b"gAMA"])
        + png_chunk(b"cHRM", COLOR_PROFILE[b"cHRM"])
        + png_chunk(b"IDAT", compressed)
        + png_chunk(b"IEND", b"")
    )


def read_source_map() -> tuple[dict, str]:
    data = SOURCE_MAP_PATH.read_bytes()
    return json.loads(data), sha256(data)


def build_asset(asset_id: str, asset_info: dict) -> tuple[bytes, list[dict]]:
    atlas_rows = [bytearray(ATLAS_WIDTH * 4) for _ in range(ATLAS_HEIGHT)]
    cell_lookup = {
        (cell["team"], cell["direction"], cell["pose"]): cell
        for cell in asset_info["cells"]
    }
    expected_keys = {
        (team, direction, pose)
        for team, pose in ROWS
        for direction in COLUMNS
    }
    if set(cell_lookup) != expected_keys or len(asset_info["cells"]) != len(expected_keys):
        fail(f"{asset_id}: source-map must provide exactly all 24 team/pose/direction cells")

    mapped_frames: list[dict] = []
    for row_index, (team, pose) in enumerate(ROWS):
        for column_index, direction in enumerate(COLUMNS):
            source_record = cell_lookup[(team, direction, pose)]
            source = payload_path(source_record["source_copy"])
            source_bytes = source.read_bytes()
            source_digest = sha256(source_bytes)
            expected_digest = source_record["source_render"]["sha256"]
            if source_digest != expected_digest:
                fail(f"{source}: source sha256 changed ({source_digest})")
            if len(source_bytes) != source_record["source_render"]["bytes"]:
                fail(f"{source}: source byte length changed")
            width, height, source_rows = read_rgba_png(source, SOURCE_SIZE)
            if (width, height) != (SOURCE_SIZE, SOURCE_SIZE):
                fail(f"{source}: source dimensions changed")
            cell_rows = downsample_area4(source_rows)
            x_offset = column_index * CELL_SIZE * 4
            y_offset = row_index * CELL_SIZE
            for local_y, cell_row in enumerate(cell_rows):
                atlas_rows[y_offset + local_y][x_offset:x_offset + CELL_SIZE * 4] = cell_row
            mapped_frames.append({
                "team": team,
                "pose": pose,
                "direction": direction,
                "atlas_cell": {"column": column_index, "row": row_index},
                "atlas_pixel_bounds": {
                    "x": column_index * CELL_SIZE,
                    "y": row_index * CELL_SIZE,
                    "width": CELL_SIZE,
                    "height": CELL_SIZE,
                },
                "source_copy": source_record["source_copy"],
                "source_render": source_record["source_render"],
                "approved_native64": source_record["approved_native64"],
            })

    return encode_rgba_png(ATLAS_WIDTH, ATLAS_HEIGHT, [bytes(row) for row in atlas_rows]), mapped_frames


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR,
                        help="directory for the two atlas PNGs and provenance.json")
    args = parser.parse_args()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    source_map, source_map_sha = read_source_map()
    generator_path = Path(__file__).resolve()
    generator_sha = file_sha256(generator_path)

    output_assets: dict[str, dict] = {}
    for asset_id in ("mossguard", "coilblade"):
        atlas_bytes, frames = build_asset(asset_id, source_map["assets"][asset_id])
        if len(atlas_bytes) > MAX_OUTPUT_BYTES:
            fail(f"{asset_id}: packed atlas is {len(atlas_bytes)} bytes; cap is {MAX_OUTPUT_BYTES}")
        filename = ASSET_FILENAMES[asset_id]
        output_path = output_dir / filename
        output_path.write_bytes(atlas_bytes)
        output_assets[asset_id] = {
            "output": {
                "path": filename,
                "sha256": sha256(atlas_bytes),
                "bytes": len(atlas_bytes),
                "dimensions_px": [ATLAS_WIDTH, ATLAS_HEIGHT],
                "format": "PNG RGBA8, non-interlaced",
                "max_bytes": MAX_OUTPUT_BYTES,
            },
            "source_variant": source_map["assets"][asset_id]["variant"],
            "approval": source_map["assets"][asset_id]["approval"],
            "review_manifest": source_map["assets"][asset_id]["review_manifest"],
            "render_receipt": source_map["assets"][asset_id]["render_receipt"],
            "triangle_count": source_map["assets"][asset_id]["triangle_count"],
            "frames": frames,
        }
        if asset_id == "coilblade":
            output_assets[asset_id]["selection_report"] = source_map["assets"][asset_id]["selection_report"]

    provenance = {
        "schema_version": 1,
        "title": "Mossguard R1 and Coilblade R3-B fixed-frame original sprite atlas provenance",
        "authorship": {
            "art": "Moss & Ember project original art, rendered from project-authored editable models.",
            "individual_credit": "The cited review receipts do not identify an individual artist; no individual attribution is inferred.",
            "atlas_packing": "Codex builder contribution for this payload.",
        },
        "license": {
            "name": "GNU Affero General Public License v3.0 only",
            "spdx": "AGPL-3.0-only",
            "basis": "Project LICENSE; these are original project character assets.",
            "included_license_copy": "evidence/project-LICENSE",
            "license_copy_sha256": file_sha256(PAYLOAD_ROOT / "evidence/project-LICENSE"),
        },
        "third_party_art": "None. No comparison-game art, names, text, or audio are included.",
        "scope": "Portable art atlas build only. No live renderer integration, runtime animation, or motion acceptance is claimed.",
        "generator": {
            "path": "scripts/build-moss-coil-atlases.py",
            "sha256": generator_sha,
            "runtime": f"Python {platform.python_version()} standard library only",
            "source_map": "source-map.json",
            "source_map_sha256": source_map_sha,
        },
        "encoding": {
            "source": "24 approved 256x256 RGBA8 sRGB renders per character; source image crop and transparent canvas are preserved.",
            "reduction": "One 4x4 alpha-premultiplied area average per destination pixel; RGB and alpha use round-to-nearest, ties-to-even to match the source renderer's fixed 4:1 alpha-weighted box.",
            "atlas_layout": {
                "dimensions_px": [ATLAS_WIDTH, ATLAS_HEIGHT],
                "cell_px": [CELL_SIZE, CELL_SIZE],
                "columns": list(COLUMNS),
                "rows": [{"team": team, "pose": pose} for team, pose in ROWS],
                "ground_pivot_px_per_cell": [32, 54],
                "camera_elevation_deg": 50,
                "orthographic_scale": 8.025,
                "colors": "Original River and Ember team colors remain baked in from their separately approved source renders.",
            },
            "png": {
                "sample_format": "8-bit RGBA",
                "interlaced": False,
                "filter": "None for every encoded output scanline",
                "compression": "zlib level 9",
                "profile_chunks": {
                    "sRGB": "rendering intent 3",
                    "gAMA": "0x0000b18f",
                    "cHRM": "0x00007a26000080840000fa00000080e8000075300000ea6000003a9800001770",
                },
                "ancillary_metadata": "Not copied to atlas PNGs.",
            },
        },
        "assets": output_assets,
    }
    provenance_bytes = (json.dumps(provenance, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode()
    (output_dir / "provenance.json").write_bytes(provenance_bytes)

    for asset_id in ("mossguard", "coilblade"):
        record = output_assets[asset_id]["output"]
        print(f"{asset_id}: {record['path']} {record['dimensions_px'][0]}x{record['dimensions_px'][1]} "
              f"{record['bytes']} bytes sha256={record['sha256']}")
    print(f"provenance.json: {len(provenance_bytes)} bytes sha256={sha256(provenance_bytes)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
