"""Bounded fixed-camera Copperskiff massing comparison. Run only after grant."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import round2_pipeline as pipeline
import copperskiff_model
import native_preview

model = pipeline.model
CONTROL = HERE.parent / "astra-round-2/generated/attempt-20261020T151650Z-28770/models/previews/native-64"
SOURCES = (
    "build_comparison.py", "copperskiff_model.py", "alternatives.json",
    "round1_models.py", "round2_pipeline.py", "native_preview.py",
    "verify_saved_asset.py", "palette.json", "run-comparison.sh", "design-notes.md",
)


def cameras(scene, char, spec):
    collection = bpy.data.collections.new(model.PREFIX + "copperskiff_" + char["variant"] + "_cameras")
    scene.collection.children.link(collection)
    anchor = spec["ground_anchor_normalized"]
    target_height = (anchor[1] - .5) * spec["orthographic_scale"] / math.cos(spec["elevation_degrees"] * model.DEG)
    char["sprite_cameras"] = {}
    for direction, yaw in spec["directions"]:
        data = bpy.data.cameras.new(model.PREFIX + "copperskiff_" + char["variant"] + "_" + direction)
        model.enum(data, "type", ("ORTHO",))
        camera = bpy.data.objects.new(data.name, data)
        collection.objects.link(camera)
        pipeline.camera_at(camera, char["placement"].location, yaw, spec["elevation_degrees"],
                           spec["orthographic_scale"], target_height)
        camera["direction"] = direction
        camera["purpose"] = "Fixed round-two scale and anchor; no fit or crop"
        char["sprite_cameras"][direction] = camera
    char["sprite_camera_collection"] = collection
    char["sprite_camera_spec"] = {
        **spec, "camera_target_height": target_height,
        "camera_names": {direction: camera.name for direction, camera in char["sprite_cameras"].items()},
        "calibration": "Fixed R2 orthographic scale. No shape-dependent recalibration.",
        "idle_body_height_px_target": 13,
    }
    scene.render.resolution_x = scene.render.resolution_y = spec["native_cell"] * spec["supersample"]
    scene.camera = char["sprite_cameras"]["south"]


def save_blend(scene, char, studio, path):
    isolated = scene.copy()
    isolated.name = model.PREFIX + "copperskiff_round_3_" + char["variant"]
    for collection in list(isolated.collection.children):
        if collection not in (studio, char["collection"], char["sprite_camera_collection"]):
            isolated.collection.children.unlink(collection)
    isolated.camera = char["sprite_cameras"]["south"]
    isolated.render.film_transparent = True
    isolated["sprite_camera_contract"] = json.dumps(char["sprite_camera_spec"], sort_keys=True)
    bpy.data.libraries.write(str(path), {isolated}, fake_user=True)
    bpy.data.scenes.remove(isolated)


def png_receipt(path, width, height, pixels):
    return {
        "path": str(path), "width": width, "height": height,
        "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "alpha_bounds_threshold_16": native_preview.bounds(width, height, pixels, 16),
        "alpha_bounds_threshold_128": native_preview.bounds(width, height, pixels, 128),
    }


def render_views(scene, char, output, selected):
    raw_dir, native_dir = output / "raw-256", output / "native-64"
    raw_dir.mkdir(parents=True)
    native_dir.mkdir()
    shader = next(node for node in model.MATERIALS["team"].node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    groups = [("river", 1, "idle"), ("ember", 1, "idle")]
    if selected:
        groups += [("river", 100, "contact"), ("ember", 100, "contact")]
    records = []
    for team, frame, pose in groups:
        color = model.linear_color(model.PALETTE["team_variants"][team])
        model.input_socket(shader, "Base Color").default_value = color
        for direction, camera in char["sprite_cameras"].items():
            scene.camera = camera
            scene.frame_set(frame)
            raw = raw_dir / f"{char['variant']}-{team}-{direction}-{pose}.png"
            scene.render.filepath = str(raw)
            bpy.ops.render.render(write_still=True, scene=scene.name)
            width, height, source = native_preview.read_rgba(raw)
            width, height, pixels = native_preview.box(width, height, source, 4)
            native = native_dir / raw.name
            native_preview.png(native, width, height, pixels)
            records.append({"variant": char["variant"], "team": team, "direction": direction,
                            "pose": pose, "frame": frame, "raw": model.file_receipt(raw),
                            **png_receipt(native, width, height, pixels)})
    model.input_socket(shader, "Base Color").default_value = model.linear_color(model.PALETTE["team_variants"]["river"])
    scene.frame_set(1)
    if selected:
        data = bpy.data.cameras.new(model.PREFIX + "copperskiff_round_3_portrait")
        model.enum(data, "type", ("ORTHO",))
        portrait = bpy.data.objects.new(data.name, data)
        char["sprite_camera_collection"].objects.link(portrait)
        pipeline.camera_at(portrait, char["placement"].location, 38, 18, 3.2, .9)
        scene.camera = portrait
        scene.render.filepath = str(output / "three-quarter.png")
        bpy.ops.render.render(write_still=True, scene=scene.name)
    scene.camera = char["sprite_cameras"]["south"]
    return records


def enlarge(path, width, height, pixels, factor=4):
    output = bytearray(width * height * factor * factor * 4)
    for y in range(height * factor):
        for x in range(width * factor):
            src = ((y // factor) * width + x // factor) * 4
            dst = (y * width * factor + x) * 4
            output[dst:dst + 4] = pixels[src:src + 4]
    native_preview.png(path, width * factor, height * factor, output)


def sheets(output, alternatives, selected, records):
    order = ["r2_control"] + [item["id"] for item in alternatives]
    directions = ("north", "east", "south", "west")
    height = len(order) * 128
    comparison = bytearray([45, 48, 53, 255] * (256 * height))
    controls = []
    for row, variant in enumerate(order):
        for column, direction in enumerate(directions):
            if variant == "r2_control":
                path = CONTROL / f"copperskiff-river-{direction}-idle.png"
            else:
                path = Path(next(record["path"] for record in records if
                                 record["variant"] == variant and record["direction"] == direction
                                 and record["team"] == "river" and record["pose"] == "idle"))
            width, cell_height, pixels = native_preview.read_rgba(path)
            if variant == "r2_control":
                controls.append(png_receipt(path, width, cell_height, pixels))
            native_preview.stamp(comparison, 256, column * 64, row * 64, width, cell_height, pixels)
            silhouette_y = (row + len(order)) * 64
            for y in range(silhouette_y, silhouette_y + 64):
                for x in range(column * 64, column * 64 + 64):
                    dst = (y * 256 + x) * 4
                    comparison[dst:dst + 4] = bytes((232, 226, 212, 255))
            native_preview.stamp(comparison, 256, column * 64, silhouette_y, width, cell_height, pixels, silhouette=True)
    native_preview.png(output / "massing-comparison-native.png", 256, height, comparison)
    enlarge(output / "massing-comparison-4x.png", 256, height, comparison)

    team_comparison = bytearray([45, 48, 53, 255] * (256 * height))
    team_rows = []
    for variant_index, variant in enumerate(order):
        for team_index, team in enumerate(("river", "ember")):
            row = variant_index * 2 + team_index
            team_rows.append(variant + " " + team)
            for column, direction in enumerate(directions):
                if variant == "r2_control":
                    path = CONTROL / f"copperskiff-{team}-{direction}-idle.png"
                else:
                    path = Path(next(record["path"] for record in records if
                                     record["variant"] == variant and record["direction"] == direction
                                     and record["team"] == team and record["pose"] == "idle"))
                width, cell_height, pixels = native_preview.read_rgba(path)
                if variant == "r2_control" and team == "ember":
                    controls.append(png_receipt(path, width, cell_height, pixels))
                native_preview.stamp(team_comparison, 256, column * 64, row * 64, width, cell_height, pixels)
    native_preview.png(output / "team-comparison-native.png", 256, height, team_comparison)
    enlarge(output / "team-comparison-4x.png", 256, height, team_comparison)

    selected_pixels = bytearray([45, 48, 53, 255] * (256 * 256))
    groups = (("river", "idle"), ("ember", "idle"), ("river", "contact"), ("ember", "contact"))
    for row, (team, pose) in enumerate(groups):
        for column, direction in enumerate(directions):
            path = Path(next(record["path"] for record in records if
                             record["variant"] == selected and record["team"] == team
                             and record["pose"] == pose and record["direction"] == direction))
            width, cell_height, pixels = native_preview.read_rgba(path)
            native_preview.stamp(selected_pixels, 256, column * 64, row * 64, width, cell_height, pixels)
    native_preview.png(output / "selected-team-contact-native.png", 256, 256, selected_pixels)
    enlarge(output / "selected-team-contact-4x.png", 256, 256, selected_pixels)
    return {
        "columns": list(directions), "massing_rows": order + [item + " silhouette" for item in order],
        "team_comparison_rows": team_rows,
        "team_contact_rows": [f"{team} {pose}" for team, pose in groups],
        "control": "Existing immutable R2 native PNGs, byte-read only; not newly rendered",
        "control_files": controls,
    }


def main():
    if not bpy.app.background:
        raise RuntimeError("Use a new isolated background Blender process.")
    if any(scene.name.startswith(model.PREFIX) for scene in bpy.data.scenes):
        raise RuntimeError("A generated scene is already loaded. Start a fresh process.")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--selected", default="exposed_deck",
                        choices=("umbrella_barge", "exposed_deck", "split_canvas"))
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    output = args.output.resolve()
    if HERE not in output.parents or output.exists():
        raise RuntimeError("Use a new output directory inside astra-round-3.")
    output.mkdir(parents=True)
    specifications = json.loads((HERE / "alternatives.json").read_text())
    model.build_materials("river")
    variants, records = [], []
    for alternative in specifications["alternatives"]:
        settings = {**specifications["common"], **alternative}
        scene = bpy.data.scenes.new(model.PREFIX + "round_3_" + alternative["id"])
        bpy.context.window.scene = scene
        char = copperskiff_model.build(model, scene, settings)
        studio, stage, unused_camera = model.build_studio(scene, "eevee", 8)
        stage.hide_render = True
        scene.render.film_transparent = True
        pipeline.animate_skiff(scene, char)
        cameras(scene, char, specifications["camera"])
        projection = pipeline.projection_receipt(scene, char)
        variant_dir = output / alternative["id"]
        variant_dir.mkdir()
        (variant_dir / "sprite-projection.json").write_text(json.dumps(projection, indent=2) + "\n")
        variant_records = render_views(scene, char, variant_dir, alternative["id"] == args.selected)
        records.extend(variant_records)
        scene.frame_set(1)
        geometry = model.mesh_receipt(char)
        model.glb_export(scene, char, variant_dir / "copperskiff.glb")
        scene.frame_set(1)
        save_blend(scene, char, studio, variant_dir / "copperskiff.blend")
        variants.append({
            "id": alternative["id"], "settings": settings, **geometry,
            "glb_validation": char["glb_validation"],
            "glb": model.file_receipt(variant_dir / "copperskiff.glb"),
            "blend": model.file_receipt(variant_dir / "copperskiff.blend"),
            "native_render_count": len(variant_records),
        })
    layout = sheets(output, specifications["alternatives"], args.selected, records)
    manifest = {
        "status": "Rendered comparison; independent decision pending",
        "authorship": "Original procedural geometry by GPT-6 Astra; Riverworks Diorama direction by Claude",
        "license": "AGPL-3.0-only",
        "identity_source_commit": model.SOURCE_COMMIT,
        "source_files": [model.file_receipt(HERE / name) for name in SOURCES],
        "provisional_selection": args.selected,
        "selection_is_visual_pass": False,
        "fixed_camera": specifications["camera"],
        "no_per_view_or_variant_refit": True,
        "other_characters_modified": False,
        "external_geometry_or_textures": [],
        "reference_assets_imported": False,
        "blender_version": bpy.app.version_string,
        "render_engine": bpy.context.scene.render.engine,
        "view_transform": bpy.context.scene.view_settings.view_transform,
        "native_render_count": len(records),
        "portrait_render_count": 1,
        "variants": variants,
        "native_image_receipts": records,
        "sheets": layout,
        "remaining": ["Independent native-size class/team/facing/contact judgment",
                      "Real arena context", "Coilblade and Mossguard qualification",
                      "Complete motion and runtime integration"],
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"status": "generated comparison", "output": str(output),
                      "native_renders": len(records), "quality_verdict": "pending"}, indent=2))


if __name__ == "__main__":
    main()
