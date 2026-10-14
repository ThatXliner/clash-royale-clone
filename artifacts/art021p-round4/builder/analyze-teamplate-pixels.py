from __future__ import annotations

import hashlib
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent
colors = {"north": (198, 69, 46, 255), "south": (46, 127, 134, 255)}
rows = []
for viewport in ("phone", "desktop"):
    for theme in ("light", "dark"):
        for size in (13, 26):
            for side, expected in colors.items():
                name = f"{viewport}-{theme}-teamplate-{side}-{size}.png"
                path = root / name
                raw = path.read_bytes()
                image = Image.open(path).convert("RGBA")
                required = 8 if size == 13 else 24
                positions = [
                    [x, y]
                    for y in range(image.height)
                    for x in range(image.width)
                    if image.getpixel((x, y)) == expected
                ]
                rows.append({
                    "file": name,
                    "sha256": hashlib.sha256(raw).hexdigest(),
                    "dimensions": [image.width, image.height],
                    "viewport": viewport,
                    "theme": theme,
                    "side": side,
                    "size": size,
                    "exactTeamColorRGBA": list(expected),
                    "exactTeamColorPixelCount": len(positions),
                    "requiredMinimum": required,
                    "meetsBar": len(positions) >= required,
                    "positions": positions,
                })

result = {
    "sourceFixture": "fresh-render.cjs (copied byte-exact from the R3 independent critic)",
    "criteria": {"13 CSS px": "at least 8 exact team-color pixels", "26 CSS px": "at least 24 exact team-color pixels"},
    "captures": rows,
    "allCapturesMeetBar": all(row["meetsBar"] for row in rows),
}
(root / "teamplate-pixel-analysis.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({
    "captureCount": len(rows),
    "counts": [{key: row[key] for key in ("viewport", "theme", "side", "size", "exactTeamColorPixelCount", "requiredMinimum", "meetsBar")} for row in rows],
    "allCapturesMeetBar": result["allCapturesMeetBar"],
}, indent=2))
if not result["allCapturesMeetBar"]:
    raise SystemExit(1)
