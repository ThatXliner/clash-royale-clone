import json
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parent
results = []
for path in sorted(root.glob("*-css-*.png")):
    image = Image.open(path).convert("RGB")
    background = image.getpixel((0, 0))
    points = [
        (x, y)
        for y in range(image.height)
        for x in range(image.width)
        if max(abs(channel - base) for channel, base in zip(image.getpixel((x, y)), background)) > 8
    ]
    if not points:
        raise SystemExit(f"no visible figure pixels in {path.name}")
    left = min(x for x, _ in points)
    top = min(y for _, y in points)
    right = max(x for x, _ in points) + 1
    bottom = max(y for _, y in points) + 1
    crop = image.crop((max(0, left - 4), max(0, top - 4), min(image.width, right + 4), min(image.height, bottom + 4)))
    crop.resize((crop.width * 12, crop.height * 12), Image.Resampling.NEAREST).save(
        root / f"{path.stem}-12x-diagnostic.png"
    )
    results.append({
        "file": path.name,
        "backgroundRgb": list(background),
        "threshold": "max per-channel RGB difference > 8 from the flat arena background",
        "foregroundPixelCount": len(points),
        "visibleBoundsXYXYExclusive": [left, top, right, bottom],
        "visibleWidthPixels": right - left,
        "visibleHeightPixels": bottom - top,
    })

evidence = {
    "method": "Pixel bounds of the rendered figure in a flat, opaque arena capture; these are composited-color bounds, not source alpha bounds.",
    "captures": results,
}
(root / "pixel-bounds.json").write_text(json.dumps(evidence, indent=2) + "\n")
print(json.dumps(evidence, indent=2))
