from pathlib import Path
import json
from PIL import Image

root = Path(__file__).parent
files = {
    "round1": root / "round1-phone-sprite-css13px-dpr1.png",
    "round2": root / "phone-sprite-css13px-dpr1.png",
}
result = {}
for name, path in files.items():
    image = Image.open(path).convert("RGBA")
    if image.size != (13, 13):
        raise SystemExit(f"{path.name}: unexpected dimensions {image.size}")
    px = image.load()
    mask = [[px[x, y][3] > 32 for x in range(13)] for y in range(13)]
    result[name] = {
        "file": path.name,
        "size": list(image.size),
        "alphaThreshold": 32,
        "visiblePixelCount": sum(sum(row) for row in mask),
        "alphaMaskRows": ["".join("#" if value else "." for value in row) for row in mask],
        "distinctVisibleRGBAColors": len({px[x, y] for y in range(13) for x in range(13) if px[x, y][3] > 32}),
    }
    image.resize((260, 260), Image.Resampling.NEAREST).save(root / f"{name}-zoom-nearest.png")
out = root / "native-pixel-analysis.json"
out.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))

