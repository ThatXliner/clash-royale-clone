from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
source = ROOT / "public/assets/kilnkeeper-battle-sprite.webp"
out = Path(__file__).resolve().parent
image = Image.open(source).convert("RGBA")
if image.size != (512, 512):
    raise ValueError(f"expected 512x512 input, got {image.size}")
if image.getchannel("A").getextrema()[0] != 0:
    raise ValueError("cutout must retain fully transparent pixels")

sizes = (13, 26)
for size in sizes:
    native = image.resize((size, size), Image.Resampling.LANCZOS)
    native.save(out / f"kilnkeeper-battle-{size}px.png", optimize=True)

cell = 16
board = Image.new("RGBA", (560, 300), (238, 235, 223, 255))
draw = ImageDraw.Draw(board)
font = ImageFont.load_default()
draw.text((28, 14), "Kilnkeeper combat cutout — native 13 px and 26 px", fill=(24, 34, 38), font=font)
for panel_x, size, scale in ((28, 13, 12), (260, 26, 6)):
    top = 60
    actual_w = size * scale
    actual_h = size * scale
    checker = Image.new("RGBA", (actual_w, actual_h), (244, 239, 224, 255))
    checkdraw = ImageDraw.Draw(checker)
    tile = 12
    for y in range(0, actual_h, tile):
        for x in range(0, actual_w, tile):
            if (x // tile + y // tile) % 2:
                checkdraw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=(209, 215, 205, 255))
    crop = Image.open(out / f"kilnkeeper-battle-{size}px.png").convert("RGBA")
    crop = crop.resize((actual_w, actual_h), Image.Resampling.NEAREST)
    checker.alpha_composite(crop)
    board.alpha_composite(checker, (panel_x, top))
    draw.text((panel_x, 38), f"{size} × {size} actual pixels", fill=(24, 34, 38), font=font)
board.convert("RGB").save(out / "kilnkeeper-battle-native-scale-fixture.png", optimize=True)
