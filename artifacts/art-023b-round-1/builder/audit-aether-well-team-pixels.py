from pathlib import Path
import json
import math
from PIL import Image

builder_dir = Path(__file__).resolve().parent
repo = builder_dir.parents[2]
capture_dir = builder_dir / "native-capture-05" / "captures"
manifest = json.loads((capture_dir / "capture-manifest.json").read_text(encoding="utf-8"))
palette = {"north": (198, 69, 46), "south": (46, 127, 134)}
results = []
for case in manifest["cases"]:
    image_path = repo / case["filename"]
    image = Image.open(image_path).convert("RGB")
    case_units = []
    for unit in case["measurement"]["units"]:
        rect = unit["svgCssRect"]
        scale_x = rect["width"] / 32
        scale_y = rect["height"] / 32
        # The badge is drawn over the stone body, with team color at both ends
        # and a small emberseed inset in its center.
        x0 = rect["x"] + 10 * scale_x
        x1 = rect["x"] + 22 * scale_x
        y0 = rect["y"] + 20.5 * scale_y
        y1 = rect["y"] + 26.5 * scale_y
        expected = palette[unit["team"]]
        opposing = palette["south" if unit["team"] == "north" else "north"]
        distances = []
        opposing_distances = []
        matching = 0
        for y in range(max(0, math.floor(y0)), min(image.height, math.ceil(y1))):
            for x in range(max(0, math.floor(x0)), min(image.width, math.ceil(x1))):
                pixel = image.getpixel((x, y))
                distance = math.sqrt(sum((actual - target) ** 2 for actual, target in zip(pixel, expected)))
                distances.append(distance)
                opposing_distances.append(math.sqrt(sum((actual - target) ** 2 for actual, target in zip(pixel, opposing))))
                if distance <= 100:
                    matching += 1
        result = {
            "team": unit["team"],
            "expectedRgb": list(expected),
            "badgePatchCssRect": [round(x0, 4), round(y0, 4), round(x1 - x0, 4), round(y1 - y0, 4)],
            "pixelsInPatch": len(distances),
            "pixelsWithinExpectedRgbDistance100": matching,
            "closestExpectedRgbDistance": round(min(distances), 3),
            "closestOpposingRgbDistance": round(min(opposing_distances), 3),
        }
        if not distances or matching == 0 or min(distances) >= min(opposing_distances):
            raise SystemExit(f"{case['filename']} {unit['team']} badge color not visible in native capture: {result}")
        case_units.append(result)
    results.append({"capture": case["filename"], "bodyCssPixels": case["bodyCssPixels"], "teams": case_units})

print(json.dumps({"cases": len(results), "teamPixelVisibilityPass": True, "results": results}, indent=2))
