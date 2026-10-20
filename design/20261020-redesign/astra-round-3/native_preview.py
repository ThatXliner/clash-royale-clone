"""Lossless PNG receipts and fixed 4x box reduction; no third-party dependency."""

import hashlib
import json
from pathlib import Path
import struct
import zlib


def read_rgba(path):
    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"Not PNG: {path}")
    offset, compressed = 8, bytearray()
    width = height = None
    while offset < len(raw):
        size = struct.unpack_from(">I", raw, offset)[0]
        kind, data = raw[offset + 4:offset + 8], raw[offset + 8:offset + 8 + size]
        if kind == b"IHDR":
            width, height, depth, color, compression, filtering, interlace = struct.unpack(">IIBBBBB", data)
            if (depth, color, compression, filtering, interlace) != (8, 6, 0, 0, 0):
                raise ValueError(f"Expected non-interlaced 8-bit RGBA: {path}")
        elif kind == b"IDAT":
            compressed.extend(data)
        offset += 12 + size
    decoded = zlib.decompress(compressed)
    stride = width * 4
    pixels, previous = bytearray(), bytearray(stride)
    cursor = 0
    for _ in range(height):
        filter_type = decoded[cursor]
        row = bytearray(decoded[cursor + 1:cursor + stride + 1])
        cursor += stride + 1
        for i in range(stride):
            left = row[i - 4] if i >= 4 else 0
            up = previous[i]
            upper_left = previous[i - 4] if i >= 4 else 0
            if filter_type == 1:
                prediction = left
            elif filter_type == 2:
                prediction = up
            elif filter_type == 3:
                prediction = (left + up) // 2
            elif filter_type == 4:
                p = left + up - upper_left
                a, b, c = abs(p - left), abs(p - up), abs(p - upper_left)
                prediction = left if a <= b and a <= c else (up if b <= c else upper_left)
            elif filter_type == 0:
                prediction = 0
            else:
                raise ValueError(f"Unsupported PNG filter {filter_type}")
            row[i] = (row[i] + prediction) & 255
        pixels.extend(row)
        previous = row
    return width, height, pixels


def png(path, width, height, pixels):
    def chunk(kind, payload):
        return (struct.pack(">I", len(payload)) + kind + payload +
                struct.pack(">I", zlib.crc32(kind + payload) & 0xffffffff))
    rows = b"".join(b"\0" + bytes(pixels[y * width * 4:(y + 1) * width * 4]) for y in range(height))
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n" +
        chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) +
        chunk(b"sRGB", b"\0") + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")
    )


def box(width, height, pixels, factor):
    if width % factor or height % factor:
        raise ValueError("Image is not divisible by the supersample factor.")
    out_width, out_height = width // factor, height // factor
    reduced = bytearray(out_width * out_height * 4)
    for y in range(out_height):
        for x in range(out_width):
            indices = [((y * factor + dy) * width + x * factor + dx) * 4
                       for dy in range(factor) for dx in range(factor)]
            alpha = sum(pixels[i + 3] for i in indices)
            target = (y * out_width + x) * 4
            for channel in range(3):
                reduced[target + channel] = round(sum(pixels[i + channel] * pixels[i + 3] for i in indices) / alpha) if alpha else 0
            reduced[target + 3] = round(alpha / (factor * factor))
    return out_width, out_height, reduced


def bounds(width, height, pixels, threshold):
    coords = [(i % width, i // width) for i in range(width * height) if pixels[i * 4 + 3] >= threshold]
    if not coords:
        return None
    x0, x1 = min(x for x, _ in coords), max(x for x, _ in coords)
    y0, y1 = min(y for _, y in coords), max(y for _, y in coords)
    return {"left": x0, "top": y0, "width": x1 - x0 + 1, "height": y1 - y0 + 1}


def stamp(sheet, sheet_width, x, y, width, height, pixels, silhouette=False):
    for row in range(height):
        for col in range(width):
            src, dst = (row * width + col) * 4, ((y + row) * sheet_width + x + col) * 4
            alpha = pixels[src + 3] / 255
            for channel in range(3):
                value = 0 if silhouette else pixels[src + channel]
                sheet[dst + channel] = round(value * alpha + sheet[dst + channel] * (1 - alpha))


def write(directory, records, factor):
    native = directory / "native-64"
    native.mkdir()
    directions = ("north", "east", "south", "west")
    sheet = bytearray([45, 48, 53, 255] * (256 * 256))
    receipts = []
    for record in records:
        raw = directory / record["raw_path"]
        width, height, source = read_rgba(raw)
        width, height, pixels = box(width, height, source, factor)
        output = native / raw.name
        png(output, width, height, pixels)
        row = 2 if record["pose"] == "contact" else (0 if record["team"] == "river" else 1)
        col = directions.index(record["direction"])
        stamp(sheet, 256, col * 64, row * 64, width, height, pixels)
        if row == 0:
            for yy in range(192, 256):
                for xx in range(col * 64, col * 64 + 64):
                    offset = (yy * 256 + xx) * 4
                    sheet[offset:offset + 4] = bytes((232, 226, 212, 255))
            stamp(sheet, 256, col * 64, 192, width, height, pixels, silhouette=True)
        receipts.append({
            **record, "native_path": str(output.relative_to(directory)),
            "width": width, "height": height,
            "alpha_bounds_threshold_16": bounds(width, height, pixels, 16),
            "alpha_bounds_threshold_128": bounds(width, height, pixels, 128),
            "bytes": output.stat().st_size,
            "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        })
    png(directory / "native-13px-cardinal-sheet.png", 256, 256, sheet)
    enlarged = bytearray(1024 * 1024 * 4)
    for y in range(1024):
        for x in range(1024):
            src, dst = ((y // 4) * 256 + x // 4) * 4, (y * 1024 + x) * 4
            enlarged[dst:dst + 4] = sheet[src:src + 4]
    png(directory / "native-13px-cardinal-sheet-4x.png", 1024, 1024, enlarged)
    (directory / "native-preview-receipt.json").write_text(json.dumps({
        "status": "Rendered artifact measurements; no independent visual verdict",
        "reduction": f"{factor}:1 alpha-weighted box, no crop or per-view resizing",
        "sheet_columns": list(directions),
        "sheet_rows": ["river idle", "ember idle", "river contact frame 100", "river idle black silhouette"],
        "images": receipts,
    }, indent=2) + "\n")
