from pathlib import Path
import hashlib
import json
import sys
from PIL import Image

RUN = Path(sys.argv[1]).resolve()
CONTEXT = Path(sys.argv[2]).resolve()
VARIANTS = ("r2_control", "umbrella_barge", "exposed_deck", "split_canvas")
DIRECTIONS = ("north", "east", "south", "west")
GROUPS = (("river", "idle"), ("ember", "idle"),
          ("river", "contact"), ("ember", "contact"))


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


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
    alpha = image.getchannel("A")
    mask = alpha.point(lambda value: 255 if value >= threshold else 0)
    box = mask.getbbox()
    if box is None:
        return None
    left, top, right, bottom = box
    return {"left": left, "top": top, "width": right - left, "height": bottom - top}


def native_path(variant, team, direction, pose):
    return RUN / "native-64" / variant / f"{variant}-{team}-{direction}-{pose}-64.png"


def composite_path(variant, team, direction, pose):
    return RUN / "tile-context" / variant / f"{variant}-{team}-{direction}-{pose}-on-arena-64.png"


def main():
    context = Image.open(CONTEXT).convert("RGBA")
    if context.size != (64, 64):
        raise ValueError(f"Expected fixed 64x64 arena tile; got {context.size}")
    bounds = []
    images = {}
    for variant in VARIANTS:
        native_dir = RUN / "native-64" / variant
        tile_dir = RUN / "tile-context" / variant
        native_dir.mkdir(parents=True, exist_ok=True)
        tile_dir.mkdir(parents=True, exist_ok=True)
        for team, pose in GROUPS:
            for direction in DIRECTIONS:
                stem = f"{variant}-{team}-{direction}-{pose}"
                raw = RUN / variant / "raw-256" / variant / f"{stem}-256.png"
                image = reduce_alpha_weighted(Image.open(raw), 4)
                native = native_dir / f"{stem}-64.png"
                image.save(native)
                contexted = Image.alpha_composite(context, image)
                tile = composite_path(variant, team, direction, pose)
                contexted.save(tile)
                images[(variant, team, direction, pose)] = image
                bounds.append({
                    "variant": variant,
                    "team": team,
                    "direction": direction,
                    "pose": pose,
                    "raw_path": str(raw),
                    "raw_sha256": sha256(raw),
                    "native_path": str(native),
                    "native_sha256": sha256(native),
                    "tile_context_path": str(tile),
                    "tile_context_sha256": sha256(tile),
                    "width": image.width,
                    "height": image.height,
                    "alpha_bounds_threshold_16": alpha_bounds(image, 16),
                    "alpha_bounds_threshold_128": alpha_bounds(image, 128),
                    "visible_pixels_threshold_16": sum(value >= 16 for value in image.getchannel("A").getdata()),
                })
        for directory, get_image, suffix in (
            (native_dir, lambda team, direction, pose: images[(variant, team, direction, pose)], "native"),
            (tile_dir, lambda team, direction, pose: Image.open(composite_path(variant, team, direction, pose)).convert("RGBA"), "arena"),
        ):
            sheet = Image.new("RGBA", (4 * 64, 4 * 64), (48, 50, 54, 255))
            for row, (team, pose) in enumerate(GROUPS):
                for column, direction in enumerate(DIRECTIONS):
                    sheet.alpha_composite(get_image(team, direction, pose), (column * 64, row * 64))
            sheet.save(directory / f"{variant}-{suffix}-sheet.png")
            sheet.resize((sheet.width * 4, sheet.height * 4), Image.Resampling.NEAREST).save(
                directory / f"{variant}-{suffix}-sheet-4x.png")

    # Four alternatives in anonymous row order preserve the candidate-choice blind.
    choice_index = {}
    for team in ("river", "ember"):
        for pose in ("idle",):
            for kind in ("native", "arena"):
                sheet = Image.new("RGBA", (4 * 64, 4 * 64), (48, 50, 54, 255))
                for row, variant in enumerate(VARIANTS):
                    for column, direction in enumerate(DIRECTIONS):
                        image = (images[(variant, team, direction, pose)] if kind == "native"
                                 else Image.open(composite_path(variant, team, direction, pose)).convert("RGBA"))
                        sheet.alpha_composite(image, (column * 64, row * 64))
                path = RUN / f"candidate-choice-{team}-{kind}.png"
                sheet.save(path)
                sheet.resize((sheet.width * 4, sheet.height * 4), Image.Resampling.NEAREST).save(
                    RUN / f"candidate-choice-{team}-{kind}-4x.png")
                choice_index[path.name] = {
                    "row_order": ["r2_control", "umbrella_barge", "exposed_deck", "split_canvas"],
                    "columns": list(DIRECTIONS),
                    "team": team,
                    "pose": pose,
                    "presentation": kind,
                    "native_cell_px": 64,
                    "inspection_enlargement": "4x nearest-neighbor; native sheet remains evidence",
                }

    selected = "exposed_deck"
    delta_records = []
    for team in ("river", "ember"):
        for direction in DIRECTIONS:
            idle = images[(selected, team, direction, "idle")]
            contact = images[(selected, team, direction, "contact")]
            idle_pixels = list(idle.getdata())
            contact_pixels = list(contact.getdata())
            changed_visible = sum(
                1 for before, after in zip(idle_pixels, contact_pixels)
                if before != after and max(before[3], after[3]) >= 16
            )
            delta_records.append({
                "team": team,
                "direction": direction,
                "changed_visible_pixels_contact_vs_idle": changed_visible,
                "idle_alpha_bounds_16": alpha_bounds(idle, 16),
                "contact_alpha_bounds_16": alpha_bounds(contact, 16),
            })

    selected_native = Image.new("RGBA", (4 * 64, 4 * 64), (48, 50, 54, 255))
    selected_arena = Image.new("RGBA", (4 * 64, 4 * 64), (0, 0, 0, 255))
    for row, (team, pose) in enumerate(GROUPS):
        for column, direction in enumerate(DIRECTIONS):
            selected_native.alpha_composite(images[(selected, team, direction, pose)], (column * 64, row * 64))
            selected_arena.alpha_composite(
                Image.open(composite_path(selected, team, direction, pose)).convert("RGBA"),
                (column * 64, row * 64))
    selected_native.save(RUN / "selected-team-contact-native.png")
    selected_native.resize((1024, 1024), Image.Resampling.NEAREST).save(RUN / "selected-team-contact-native-4x.png")
    selected_arena.save(RUN / "selected-team-contact-arena.png")
    selected_arena.resize((1024, 1024), Image.Resampling.NEAREST).save(RUN / "selected-team-contact-arena-4x.png")

    report = {
        "status": "independent saved-model renders reduced to native 64x64 cells; visual judgment recorded separately",
        "reduction": "alpha-weighted 4x4 box, 256x256 to 64x64; no crop or per-view resizing",
        "context_source": str(CONTEXT),
        "context_sha256": sha256(CONTEXT),
        "row_order": [f"{team} {pose}" for team, pose in GROUPS],
        "columns": list(DIRECTIONS),
        "candidate_choice_sheet_rows": ["r2_control", "umbrella_barge", "exposed_deck", "split_canvas"],
        "candidate_choice_sheets": choice_index,
        "selected_candidate": selected,
        "renders": bounds,
        "selected_contact_pixel_differences": delta_records,
    }
    (RUN / "native-bounds-and-context.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"independent_native_views": len(bounds),
                      "selected_contact_pixel_differences": delta_records,
                      "candidate_choice_sheets": choice_index}, indent=2))


if __name__ == "__main__":
    main()
