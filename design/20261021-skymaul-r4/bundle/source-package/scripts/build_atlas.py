#!/usr/bin/env python3
"""Proposed lossless Skymaul R4 cell packer; not executed or qualified."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import struct
import zlib

SIGNATURE = b"\x89PNG\r\n\x1a\n"
COLUMNS = ("east", "north", "south", "west")
ROWS = tuple((team, pose) for team in ("river", "ember")
             for pose in ("idle", "walk", "contact"))
FRAMES = {"idle": 1, "walk": 51, "contact": 100}


def digest(value):
    return hashlib.sha256(value).hexdigest()


def decode_png(raw, dimensions):
    if raw[:8] != SIGNATURE:
        raise ValueError("Expected PNG signature")
    offset, chunks, compressed = 8, [], bytearray()
    while offset < len(raw):
        if offset + 12 > len(raw):
            raise ValueError("Truncated PNG chunk")
        size = struct.unpack_from(">I", raw, offset)[0]
        end = offset + size + 12
        if end > len(raw):
            raise ValueError("PNG chunk exceeds file")
        kind = raw[offset + 4:offset + 8]
        data = raw[offset + 8:offset + 8 + size]
        crc = struct.unpack_from(">I", raw, offset + 8 + size)[0]
        if crc != zlib.crc32(kind + data) & 0xffffffff:
            raise ValueError("PNG CRC mismatch")
        chunks.append(kind)
        if kind == b"IHDR":
            if data != struct.pack(">IIBBBBB", *dimensions, 8, 6, 0, 0, 0):
                raise ValueError("Expected exact dimensions and noninterlaced RGBA8")
        elif kind == b"sRGB":
            if data != b"\x00":
                raise ValueError("Expected source sRGB rendering intent 0")
        elif kind == b"IDAT":
            compressed.extend(data)
        elif kind != b"IEND" or data:
            raise ValueError("Unexpected PNG chunk")
        offset = end
    if chunks != [b"IHDR", b"sRGB", b"IDAT", b"IEND"]:
        raise ValueError("Expected the pinned native PNG chunk sequence")
    width, height = dimensions
    decoded = zlib.decompress(bytes(compressed))
    stride = width * 4
    if len(decoded) != (stride + 1) * height:
        raise ValueError("Wrong decompressed length")
    pixels, previous = bytearray(), bytearray(stride)
    for y in range(height):
        start = y * (stride + 1)
        filtering = decoded[start]
        row = bytearray(decoded[start + 1:start + 1 + stride])
        for x in range(stride):
            left, up = row[x - 4] if x >= 4 else 0, previous[x]
            corner = previous[x - 4] if x >= 4 else 0
            if filtering == 0:
                prediction = 0
            elif filtering == 1:
                prediction = left
            elif filtering == 2:
                prediction = up
            elif filtering == 3:
                prediction = (left + up) // 2
            elif filtering == 4:
                p = left + up - corner
                distances = (abs(p - left), abs(p - up), abs(p - corner))
                prediction = (left, up, corner)[distances.index(min(distances))]
            else:
                raise ValueError("Unknown PNG row filter")
            row[x] = (row[x] + prediction) & 255
        pixels.extend(row)
        previous = row
    return bytes(pixels)


def encode_png(width, height, pixels):
    if len(pixels) != width * height * 4:
        raise ValueError("RGBA buffer length mismatch")

    def chunk(kind, data):
        return (struct.pack(">I", len(data)) + kind + data +
                struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff))

    scanlines = b"".join(b"\x00" + pixels[y * width * 4:(y + 1) * width * 4]
                         for y in range(height))
    return (SIGNATURE + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) +
            chunk(b"sRGB", b"\x00") + chunk(b"IDAT", zlib.compress(scanlines, 9)) +
            chunk(b"IEND", b""))


def source_cells(source_dir, manifest):
    if manifest["schema"] != "skymaul-r4-lossless-atlas-map-v1":
        raise ValueError("Unexpected map schema")
    expected = {"width": 256, "height": 384, "cell_size": 64,
                "pivot": [32, 54], "columns": list(COLUMNS),
                "rows": [list(row) for row in ROWS]}
    for key, value in expected.items():
        if manifest[key] != value:
            raise ValueError("Changed atlas contract: " + key)
    records = manifest["cells"]
    if len(records) != 24:
        raise ValueError("Exactly 24 cells required")
    decoded = []
    for index, record in enumerate(records):
        row, column = divmod(index, 4)
        team, pose = ROWS[row]
        direction = COLUMNS[column]
        name = f"skymaul-{team}-{direction}-{pose}-color.png"
        checks = {"row": row, "column": column, "team": team, "pose": pose,
                  "direction": direction, "clip_frame": FRAMES[pose], "source_name": name,
                  "source_rect": [0, 0, 64, 64],
                  "destination_rect": [column * 64, row * 64, 64, 64]}
        if any(record[key] != value for key, value in checks.items()):
            raise ValueError("Changed cell assignment: " + name)
        path = source_dir / name
        if path.is_symlink():
            raise ValueError("Source cells must be regular local files")
        raw = path.read_bytes()
        if len(raw) != record["bytes"] or digest(raw) != record["sha256"]:
            raise ValueError("Pinned source bytes changed: " + name)
        pixels = decode_png(raw, (64, 64))
        if digest(pixels) != record["rgba_sha256"]:
            raise ValueError("Decoded source mismatch: " + name)
        decoded.append((record, pixels))
    return decoded


def pack(cells):
    atlas = bytearray(256 * 384 * 4)
    for record, pixels in cells:
        x, y = record["column"] * 64, record["row"] * 64
        for line in range(64):
            destination = ((y + line) * 256 + x) * 4
            atlas[destination:destination + 256] = pixels[line * 256:(line + 1) * 256]
    return bytes(atlas)


def main():
    if os.environ.get("SKYMAUL_R4_ATLAS_RUNTIME_GRANT") != "1":
        raise RuntimeError("Separate root pin and atlas runtime grant required")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--map", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    if args.output.resolve() == args.receipt.resolve():
        raise ValueError("Output and receipt must differ")
    if args.output.exists() or args.receipt.exists():
        raise FileExistsError("Use fresh outputs; no overwriting accepted files")
    if not args.output.parent.is_dir() or not args.receipt.parent.is_dir():
        raise FileNotFoundError("Create explicit fresh output parents first")
    map_bytes = args.map.read_bytes()
    manifest = json.loads(map_bytes)
    cells = source_cells(args.source_dir, manifest)
    pixels = pack(cells)
    encoded = encode_png(256, 384, pixels)
    if decode_png(encoded, (256, 384)) != pixels:
        raise RuntimeError("Encoded atlas did not preserve RGBA")
    with args.output.open("xb") as stream:
        stream.write(encoded)
    reread = args.output.read_bytes()
    unpacked = decode_png(reread, (256, 384))
    checks = []
    for record, original in cells:
        x, y = record["column"] * 64, record["row"] * 64
        recovered = b"".join(unpacked[((y + line) * 256 + x) * 4:
                                      ((y + line) * 256 + x + 64) * 4] for line in range(64))
        if recovered != original:
            raise RuntimeError("Whole-cell bytes differ: " + record["source_name"])
        checks.append({"source_name": record["source_name"], "row": record["row"],
                       "column": record["column"], "rgba_sha256": digest(recovered),
                       "changed_rgba_bytes": 0})
    if source_cells(args.source_dir, manifest) != cells or args.map.read_bytes() != map_bytes:
        raise RuntimeError("Pinned input changed while assembling")
    receipt = {"status": "builder evidence; independent atlas review required",
               "atlas_version": manifest["atlas_version"], "width": 256, "height": 384,
               "cell_size": 64, "pivot": [32, 54], "bytes": len(reread),
               "png_sha256": digest(reread), "rgba_sha256": digest(unpacked),
               "map_sha256": digest(map_bytes), "source_sha256": digest(Path(__file__).read_bytes()),
               "source_inputs_unchanged": True, "whole_cell_checks": checks,
               "resampling": False, "cropping": False, "recoloring": False,
               "mirroring": False, "premultiplication": False,
               "python": platform.python_version(), "zlib": zlib.ZLIB_RUNTIME_VERSION,
               "runtime_or_motion_acceptance": False}
    with args.receipt.open("x") as stream:
        stream.write(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"output": str(args.output), "sha256": receipt["png_sha256"],
                      "cells": len(checks), "changed_rgba_bytes": 0}))


if __name__ == "__main__":
    main()
