import json
import sys
from pathlib import Path
from PIL import Image

candidate = Path(sys.argv[1])
report_path = Path(sys.argv[2])

def inspect(relative_path):
    path = candidate / relative_path
    image = Image.open(path).convert("RGBA")
    alpha = image.getchannel("A")
    histogram = alpha.histogram()
    bbox = alpha.getbbox()
    return {
        "path": relative_path,
        "bytes": path.stat().st_size,
        "dimensions": {"width": image.width, "height": image.height},
        "alpha_extrema": list(alpha.getextrema()),
        "visible_bbox_xyxy_exclusive": list(bbox) if bbox else None,
        "transparent_pixels": histogram[0],
        "partial_alpha_pixels": sum(histogram[1:255]),
        "opaque_pixels": histogram[255],
        "corner_alpha": [alpha.getpixel(point) for point in [(0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1)]],
    }

result = {
    "webp": inspect("public/assets/kilnkeeper-battle-sprite.webp"),
    "generated_source_png": inspect("demo/assets/kilnkeeper-battle-sprite-v2.png"),
}
assert result["webp"]["dimensions"] == {"width": 512, "height": 512}
assert result["webp"]["alpha_extrema"][0] == 0
assert result["webp"]["transparent_pixels"] > 0
assert result["webp"]["partial_alpha_pixels"] > 0
assert result["webp"]["corner_alpha"] == [0, 0, 0, 0]
assert result["generated_source_png"]["dimensions"] == {"width": 1254, "height": 1254}
assert result["generated_source_png"]["alpha_extrema"] == [0, 255]
assert result["generated_source_png"]["transparent_pixels"] > 0
assert result["generated_source_png"]["partial_alpha_pixels"] > 0
report_path.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
