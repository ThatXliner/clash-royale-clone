"""Reduce one fresh 4x render set to native 64px sprites and fixed-tile context."""
from pathlib import Path
import hashlib
import json
from PIL import Image

RUN = Path(__file__).resolve().parent / "active-run.txt"
RUN = Path(RUN.read_text(encoding="utf-8").strip()).resolve()
CONTEXT = Path("/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/art3d001-round-2/critic/tile-context/arena-ground-tile-64.png")
TEAMS = ("river", "ember")
DIRECTIONS = ("north", "east", "south", "west")
POSES = ("idle", "contact")
GROUPS = (("river", "idle"), ("ember", "idle"),
          ("river", "contact"), ("ember", "contact"))


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def reduce_alpha_weighted(source, factor=4):
    source = source.convert("RGBA")
    width, height = source.size
    if width != height or width % factor:
        raise ValueError(f"Unexpected supersampled image size: {source.size}")
    source_pixels = source.load()
    output = Image.new("RGBA", (width // factor, height // factor), (0, 0, 0, 0))
    output_pixels = output.load()
    for y in range(height // factor):
        for x in range(width // factor):
            sum_alpha = sum_r = sum_g = sum_b = 0
            for dy in range(factor):
                for dx in range(factor):
                    red, green, blue, alpha = source_pixels[x * factor + dx, y * factor + dy]
                    sum_alpha += alpha
                    sum_r += red * alpha
                    sum_g += green * alpha
                    sum_b += blue * alpha
            alpha = round(sum_alpha / (factor * factor))
            if sum_alpha:
                output_pixels[x, y] = (round(sum_r / sum_alpha), round(sum_g / sum_alpha),
                                       round(sum_b / sum_alpha), alpha)
    return output


def alpha_bounds(image, threshold):
    mask = image.getchannel("A").point(lambda value: 255 if value >= threshold else 0)
    box = mask.getbbox()
    if box is None:
        return None
    left, top, right, bottom = box
    return {"left": left, "top": top, "width": right - left, "height": bottom - top}


def main():
    context = Image.open(CONTEXT).convert("RGBA")
    if context.size != (64, 64):
        raise ValueError(f"Expected the fixed 64x64 arena tile; got {context.size}")
    native_dir = RUN / "native-64"
    context_dir = RUN / "arena-context-64"
    native_dir.mkdir(parents=True, exist_ok=True)
    context_dir.mkdir(parents=True, exist_ok=True)
    images = {}
    records = []
    for team in TEAMS:
        for direction in DIRECTIONS:
            for pose in POSES:
                stem = f"{team}-{direction}-{pose}"
                raw = RUN / "raw-256" / f"{stem}-256.png"
                image = reduce_alpha_weighted(Image.open(raw), 4)
                if image.size != (64, 64):
                    raise ValueError(f"Unexpected native cell size at {raw}: {image.size}")
                native_path = native_dir / f"{stem}-64.png"
                image.save(native_path)
                contexted = Image.alpha_composite(context, image)
                context_path = context_dir / f"{stem}-on-arena-64.png"
                contexted.save(context_path)
                images[(team, direction, pose)] = image
                records.append({
                    "team": team,
                    "direction": direction,
                    "pose": pose,
                    "raw_256": {"path": str(raw), "sha256": sha256(raw),
                                "dimensions": list(Image.open(raw).size)},
                    "native_64": {"path": str(native_path), "sha256": sha256(native_path),
                                  "dimensions": list(image.size),
                                  "alpha_bounds_threshold_16": alpha_bounds(image, 16),
                                  "alpha_bounds_threshold_128": alpha_bounds(image, 128)},
                    "arena_context_64": {"path": str(context_path), "sha256": sha256(context_path),
                                         "dimensions": list(contexted.size)},
                })

    selected_native = Image.new("RGBA", (4 * 64, 4 * 64), (48, 50, 54, 255))
    selected_context = Image.new("RGBA", (4 * 64, 4 * 64), (0, 0, 0, 255))
    for row, (team, pose) in enumerate(GROUPS):
        for column, direction in enumerate(DIRECTIONS):
            selected_native.alpha_composite(images[(team, direction, pose)], (column * 64, row * 64))
            context_image = Image.open(context_dir / f"{team}-{direction}-{pose}-on-arena-64.png").convert("RGBA")
            selected_context.alpha_composite(context_image, (column * 64, row * 64))
    native_sheet = RUN / "selected-team-contact-native.png"
    context_sheet = RUN / "selected-team-contact-arena-context-native.png"
    selected_native.save(native_sheet)
    selected_context.save(context_sheet)

    contact_differences = []
    for team in TEAMS:
        for direction in DIRECTIONS:
            idle = images[(team, direction, "idle")]
            contact = images[(team, direction, "contact")]
            changed_visible = sum(
                1 for before, after in zip(idle.getdata(), contact.getdata())
                if before != after and max(before[3], after[3]) >= 16
            )
            contact_differences.append({
                "team": team,
                "direction": direction,
                "changed_visible_pixels_contact_vs_idle": changed_visible,
                "idle_alpha_bounds_threshold_16": alpha_bounds(idle, 16),
                "contact_alpha_bounds_threshold_16": alpha_bounds(contact, 16),
            })

    report = {
        "status": "fresh independent renders reduced to native 64x64 cells; visual judgment separate",
        "reduction": "alpha-weighted 4x4 box, 256x256 to 64x64; no crop or per-view resize",
        "context_source": str(CONTEXT),
        "context_sha256": sha256(CONTEXT),
        "row_order": [f"{team} {pose}" for team, pose in GROUPS],
        "column_order": list(DIRECTIONS),
        "native_sprite_count": len(records),
        "native_sheet": {"path": str(native_sheet), "sha256": sha256(native_sheet),
                         "dimensions": list(selected_native.size)},
        "arena_context_sheet": {"path": str(context_sheet), "sha256": sha256(context_sheet),
                                 "dimensions": list(selected_context.size)},
        "renders": records,
        "contact_pixel_differences": contact_differences,
    }
    report_path = RUN / "native-evidence-receipt.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "native_sprite_count": len(records),
        "native_sheet": str(native_sheet),
        "arena_context_sheet": str(context_sheet),
        "contact_pixel_differences": contact_differences,
        "receipt": str(report_path),
    }, indent=2))


if __name__ == "__main__":
    main()
