#!/usr/bin/env python3
"""Pack the approved Copperskiff R4 frames into its fixed 4x4 live atlas.

Uses only Python's standard library. The source RGBA frames and output cells
have fixed dimensions; each source is reduced by a single 4x area average.
"""

from __future__ import annotations

import argparse
import binascii
import hashlib
import struct
import sys
import zlib
from pathlib import Path
from typing import NoReturn


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "design/20261020-redesign/astra-round-4/generated/attempt-20261020T172856Z-81044/comparison/tapered_canopy/raw-256"
OUTPUT = ROOT / "public/assets/copperskiff-battle-sprite.png"
SOURCE_SIZE = 256
CELL_SIZE = 64
ATLAS_SIZE = CELL_SIZE * 4
DIRECTIONS = ("east", "north", "south", "west")
TEAMS_AND_ACTIONS = (
    ("ember", "idle"),
    ("ember", "contact"),
    ("river", "idle"),
    ("river", "contact"),
)
MAX_OUTPUT_BYTES = 1_048_576
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
COLOR_PROFILE = {
    b"sRGB": b"\x03",
    b"gAMA": bytes.fromhex("0000b18f"),
    b"cHRM": bytes.fromhex("00007a26000080840000fa00000080e8000075300000ea6000003a9800001770"),
}
EXPECTED_SOURCE_SHA256 = {
    ("ember", "east", "contact"): "6d8fea7381bc660f64da7c04f376811b389ea4a2e4567987817a06c7eb3b9079",
    ("ember", "east", "idle"): "beb44ca1bc5d22d4faf9da819a1b7c967613f152467df23e03c51ed5f1a74458",
    ("ember", "north", "contact"): "bf703b2ef3b408a28709fffb7fdc3f6275163bd7c08a5be306344fb27090bd78",
    ("ember", "north", "idle"): "bfb46eacfc73d889a0ab2b839dca30ef8c9cdd8e343bc969cd8087609f02c945",
    ("ember", "south", "contact"): "741bbb53ca0b7c57e0a098062a70a75530f35eac3b8269c0ff49fcfb8031d623",
    ("ember", "south", "idle"): "3e46117f6201219af3b02cfc0265edfe6af757005abfe45dc09cc4eea1748a9a",
    ("ember", "west", "contact"): "4d6ac5997bff2f631964e20c136998fda885a66d56ee62b623ae0b9de02518b2",
    ("ember", "west", "idle"): "ad4418dca9330ba21a7f451e1be24b62b32880dd72f946f93b1f947d55b14e09",
    ("river", "east", "contact"): "bf5cb4020fe9c798b23e0d2dfd56ed39f10e1f7f011816045ba7a3c2c3607f22",
    ("river", "east", "idle"): "1cf09795fb3731b4efa1332d233c2f43ebf1f0ae99f7ab478622ca646dd035ed",
    ("river", "north", "contact"): "103a840a25c587b4eef31c2b96b6e3c010c4a33795c6ed0483419fbb9610d0b1",
    ("river", "north", "idle"): "5619e62b2ddb50ea5c0d5de37d05f7231864026eb6045c4e76beecef1e44e9a2",
    ("river", "south", "contact"): "f20ef79c350e216e59338b459b6e8c592f07137c853f2c5b547ae4971d844a47",
    ("river", "south", "idle"): "c95340de9dfd3deaba6cff30d6ef01907841c189170b2b9a5dbdcfd5dca9f562",
    ("river", "west", "contact"): "639ba38cff6fc06944c27db7daa029da78fabccc96a1ecebcf39aae498430118",
    ("river", "west", "idle"): "40e289bc0eac869beb7a4558730a5a3256c51b09f7ddd6e4ab84f03771912460",
}


def fail(message: str) -> NoReturn:
    raise ValueError(message)


def read_rgba_png(path: Path) -> tuple[int, int, list[bytes]]:
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        fail(f"{path}: source is not a PNG")

    offset = len(PNG_SIGNATURE)
    width = height = bit_depth = color_type = interlace = None
    image_data = bytearray()
    color_profile = {}
    saw_header = saw_end = False
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
            if not saw_header or saw_end:
                fail(f"{path}: PNG image data is out of order")
            image_data.extend(payload)
        elif chunk_type in COLOR_PROFILE:
            color_profile[chunk_type] = payload
        elif chunk_type == b"IEND":
            if length != 0:
                fail(f"{path}: invalid PNG end chunk")
            saw_end = True
            offset = crc_end
            break
        offset = crc_end
    if not saw_header or not saw_end or offset != len(data):
        fail(f"{path}: incomplete PNG chunk stream")
    if color_profile != COLOR_PROFILE:
        fail(f"{path}: approved sRGB/gAMA/cHRM profile changed")
    if (width, height, bit_depth, color_type, interlace) != (SOURCE_SIZE, SOURCE_SIZE, 8, 6, 0):
        fail(f"{path}: expected non-interlaced 256x256 8-bit RGBA, got {width}x{height}/{bit_depth}/{color_type}/{interlace}")

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
                estimate = left + above - upper_left
                left_distance = abs(estimate - left)
                above_distance = abs(estimate - above)
                upper_left_distance = abs(estimate - upper_left)
                if left_distance <= above_distance and left_distance <= upper_left_distance:
                    predictor = left
                elif above_distance <= upper_left_distance:
                    predictor = above
                else:
                    predictor = upper_left
            else:
                fail(f"{path}: unsupported PNG row filter {filter_type}")
            row[index] = (value + predictor) & 0xFF
        rows.append(bytes(row))
        previous = row
    return width, height, rows


def downsample_area4(rows: list[bytes]) -> list[bytes]:
    """Reduce each 4x4 block with alpha-premultiplied integer averaging."""
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
                output[target] = (red_alpha_sum + alpha_sum // 2) // alpha_sum
                output[target + 1] = (green_alpha_sum + alpha_sum // 2) // alpha_sum
                output[target + 2] = (blue_alpha_sum + alpha_sum // 2) // alpha_sum
                output[target + 3] = (alpha_sum + 8) // 16
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


def packed_atlas() -> tuple[bytes, list[dict[str, str]]]:
    atlas_rows = [bytearray(ATLAS_SIZE * 4) for _ in range(ATLAS_SIZE)]
    sources: list[dict[str, str]] = []
    for row_index, (team, action) in enumerate(TEAMS_AND_ACTIONS):
        for column_index, direction in enumerate(DIRECTIONS):
            source = SOURCE_ROOT / f"tapered_canopy-{team}-{direction}-{action}.png"
            source_sha256 = hashlib.sha256(source.read_bytes()).hexdigest()
            expected_sha256 = EXPECTED_SOURCE_SHA256[(team, direction, action)]
            if source_sha256 != expected_sha256:
                fail(f"{source}: source sha256 changed ({source_sha256})")
            width, height, source_rows = read_rgba_png(source)
            if (width, height) != (SOURCE_SIZE, SOURCE_SIZE):
                fail(f"{source}: frame dimensions changed")
            cell_rows = downsample_area4(source_rows)
            x_offset = column_index * CELL_SIZE * 4
            y_offset = row_index * CELL_SIZE
            for local_y, cell_row in enumerate(cell_rows):
                atlas_rows[y_offset + local_y][x_offset:x_offset + CELL_SIZE * 4] = cell_row
            sources.append({
                "path": source.relative_to(ROOT).as_posix(),
                "sha256": source_sha256,
                "team": team,
                "direction": direction,
                "action": action,
            })
    return encode_rgba_png(ATLAS_SIZE, ATLAS_SIZE, [bytes(row) for row in atlas_rows]), sources


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT, help="atlas output path")
    parser.add_argument("--check", action="store_true", help="verify existing output against a fresh deterministic pack")
    args = parser.parse_args()
    output_path = args.output.resolve()
    if output_path in {path.resolve() for path in SOURCE_ROOT.glob("*.png")}:
        fail("refusing to replace an immutable approved source frame")

    packed, sources = packed_atlas()
    if len(packed) > MAX_OUTPUT_BYTES:
        fail(f"packed atlas is {len(packed)} bytes; cap is {MAX_OUTPUT_BYTES}")
    packed_sha256 = hashlib.sha256(packed).hexdigest()
    if args.check:
        existing = output_path.read_bytes()
        if existing != packed:
            fail(f"{output_path} differs from the deterministic atlas")
        print(f"verified {output_path}: 256x256 RGBA, {len(packed)} bytes, sha256={packed_sha256}")
    else:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(packed)
        print(f"wrote {output_path}: 256x256 RGBA, {len(packed)} bytes, sha256={packed_sha256}")
    print(f"zlib={zlib.ZLIB_VERSION}; inputs={len(sources)}; reduction=4x4 premultiplied-alpha integer area average")
    for source in sources:
        print(f"{source['team']}/{source['direction']}/{source['action']} {source['sha256']} {source['path']}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError) as error:
        print(f"build-copperskiff-atlas: {error}", file=sys.stderr)
        raise SystemExit(1)
