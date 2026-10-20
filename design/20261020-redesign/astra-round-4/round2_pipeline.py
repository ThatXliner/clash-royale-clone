"""Round-two Copperskiff revision, isolated from the immutable first candidate."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import round1_models as model
import copperskiff_model
import native_preview

FROZEN = HERE.parent / "astra/generated/attempt-20261020T144102Z-22183/models"
UNCHANGED_GEOMETRY = {
    "coilblade": "1a0b753a302effb27733f0325064bd369858e4a2e1c8fbcff93fda7cc3c09b4d",
    "mossguard": "af5eb4494ae9aae818f99668ddcb97c2e02633c843ca9aab59634da7172b5f54",
}
SOURCE_FILES = (
    "build_models.py", "copperskiff_model.py", "copperskiff-parameters.json",
    "native_preview.py", "verify_saved_asset.py", "round1_models.py", "palette.json",
)


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--parameters", type=Path, default=HERE / "copperskiff-parameters.json")
    parser.add_argument("--native-previews", action="store_true")
    parser.add_argument("--engine", choices=("eevee", "cycles"), default="eevee")
    parser.add_argument("--samples", type=int, default=8)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def animate_skiff(scene, char):
    objects = (char["body"], *char["rig"].values())
    for motion, frames in model.FRAMES.items():
        for phase, frame in enumerate(frames):
            copperskiff_model.pose(model, char, motion, phase)
            for obj in objects:
                for channel in ("rotation_euler", "location", "scale"):
                    obj.keyframe_insert(data_path=channel, frame=frame, group=motion)
    char["placement"]["animation_contract"] = json.dumps({
        "kind": "authored presentation poses; unchanged gameplay timing",
        "frames": model.FRAMES,
        "attack_contact_frame": 100,
        "contact_cues": ["kettle lid opens", "ember puff at existing spout", "recoil"],
        "sample_from": "simulation tick and accepted attack phase",
        "reduced_motion": "idle frame 1",
    })
    scene.frame_set(1)


def camera_at(camera, location, yaw, elevation, scale, target_height):
    target = Vector(location) + Vector((0, 0, target_height))
    azimuth, pitch = yaw * model.DEG, elevation * model.DEG
    camera.location = target + Vector((
        8 * math.sin(azimuth) * math.cos(pitch),
        -8 * math.cos(azimuth) * math.cos(pitch),
        8 * math.sin(pitch),
    ))
    camera.data.ortho_scale = scale
    model.point_at(camera, target)


def saved_sprite_cameras(scene, char, settings):
    spec = settings["sprite_camera"]
    collection = bpy.data.collections.new(model.PREFIX + "copperskiff_sprite_cameras")
    scene.collection.children.link(collection)
    scene.render.resolution_x = scene.render.resolution_y = spec["native_cell"] * spec["supersample"]
    scene.frame_set(1)
    projected_idle = []
    for direction, yaw in spec["directions"]:
        camera_at(scene.camera, char["placement"].location, yaw,
                  spec["elevation_degrees"], 1, 0)
        bpy.context.view_layer.update()
        bounds = model.projected_bounds(scene, char)
        projected_idle.append({"direction": direction, "bounds_at_scale_one": bounds,
                               "height": bounds["bottom"] - bounds["top"]})
    scale = math.ceil(max(item["height"] for item in projected_idle) *
                      spec["native_cell"] / spec["idle_body_height_px"] * 1000) / 1000
    anchor = spec["ground_anchor_normalized"]
    target_height = (anchor[1] - .5) * scale / math.cos(spec["elevation_degrees"] * model.DEG)
    cameras = {}
    for direction, yaw in spec["directions"]:
        data = bpy.data.cameras.new(model.PREFIX + "copperskiff_sprite_" + direction)
        model.enum(data, "type", ("ORTHO",))
        camera = bpy.data.objects.new(data.name, data)
        collection.objects.link(camera)
        camera_at(camera, char["placement"].location, yaw, spec["elevation_degrees"],
                  scale, target_height)
        camera["purpose"] = "Reusable native 13px body camera; fixed scale and ground anchor"
        camera["direction"] = direction
        camera["elevation_degrees"] = spec["elevation_degrees"]
        camera["ground_anchor_uv"] = list(anchor)
        camera["native_cell_size"] = spec["native_cell"]
        camera["supersample"] = spec["supersample"]
        cameras[direction] = camera
    char["sprite_camera_collection"] = collection
    char["sprite_cameras"] = cameras
    char["sprite_camera_spec"] = {
        **spec, "orthographic_scale": scale, "camera_target_height": target_height,
        "calibration": "Largest projected idle silhouette across four directions; one scale for every pose",
        "calibration_measurements": projected_idle,
        "camera_names": {direction: camera.name for direction, camera in cameras.items()},
    }
    return char["sprite_camera_spec"]


def projection_receipt(scene, char):
    records, anchors = [], []
    for direction, camera in char["sprite_cameras"].items():
        scene.camera = camera
        for motion, frames in model.FRAMES.items():
            for frame in frames:
                scene.frame_set(frame)
                bpy.context.view_layer.update()
                origin = world_to_camera_view(scene, camera, char["placement"].location)
                anchor = [float(origin.x), float(1 - origin.y)]
                bounds = model.projected_bounds(scene, char)
                if min(bounds["left"], bounds["top"]) < .015 or max(bounds["right"], bounds["bottom"]) > .985:
                    raise RuntimeError(f"Cropping: {direction} frame {frame}: {bounds}")
                anchors.append(anchor)
                records.append({"direction": direction, "motion": motion, "frame": frame,
                                "ground_anchor_uv": anchor, "bounds": bounds})
    wanted = char["sprite_camera_spec"]["ground_anchor_normalized"]
    worst_error = max(abs(actual[axis] - wanted[axis]) for actual in anchors for axis in (0, 1))
    if worst_error > .00001:
        raise RuntimeError(f"Saved sprite-camera anchor is inconsistent: error={worst_error}")
    scene.frame_set(1)
    return {
        "measurement": "Actual evaluated vertices and world_to_camera_view for the four saved camera objects",
        "camera": char["sprite_camera_spec"],
        "maximum_anchor_error_uv": worst_error,
        "crop_guard": .015,
        "pose_direction_count": len(records),
        "frames": records,
    }


def native_renders(scene, characters, char, stage, output):
    directory = output / "previews"
    raw = directory / "raw-256"
    raw.mkdir(parents=True)
    stage.hide_render = True
    scene.render.film_transparent = True
    for other in characters:
        other["collection"].hide_render = other is not char
    spec = char["sprite_camera_spec"]
    size = spec["native_cell"] * spec["supersample"]
    scene.render.resolution_x = scene.render.resolution_y = size
    records = []
    shader = next(node for node in model.MATERIALS["team"].node_tree.nodes
                  if node.type == "BSDF_PRINCIPLED")
    for team, frame, pose_name in (("river", 1, "idle"), ("ember", 1, "idle"),
                                   ("river", 100, "contact")):
        color = model.linear_color(model.PALETTE["team_variants"][team])
        model.input_socket(shader, "Base Color").default_value = color
        for direction, camera in char["sprite_cameras"].items():
            scene.camera = camera
            scene.frame_set(frame)
            path = raw / f"copperskiff-{team}-{direction}-{pose_name}.png"
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True, scene=scene.name)
            records.append({"team": team, "direction": direction, "frame": frame,
                            "pose": pose_name, "raw_path": str(path.relative_to(directory))})
    model.input_socket(shader, "Base Color").default_value = model.linear_color(model.PALETTE["team_variants"]["river"])
    scene.frame_set(1)
    portrait_data = bpy.data.cameras.new(model.PREFIX + "copperskiff_three_quarter_data")
    model.enum(portrait_data, "type", ("ORTHO",))
    portrait = bpy.data.objects.new(model.PREFIX + "copperskiff_three_quarter", portrait_data)
    char["sprite_camera_collection"].objects.link(portrait)
    camera_at(portrait, char["placement"].location, 38, 18, 2.7, 1.25)
    scene.camera = portrait
    scene.render.filepath = str(directory / "copperskiff-three-quarter.png")
    bpy.ops.render.render(write_still=True, scene=scene.name)
    native_preview.write(directory, records, spec["supersample"])
    return records


def write_skiff_blend(scene, char, studio, output):
    isolated = scene.copy()
    isolated.name = model.PREFIX + "copperskiff_editable_round_2"
    keep = (char["collection"], studio, char["sprite_camera_collection"])
    for collection in list(isolated.collection.children):
        if collection not in keep:
            isolated.collection.children.unlink(collection)
    old_position = char["placement"].location.copy()
    cameras = [obj for obj in char["sprite_camera_collection"].objects if obj.type == "CAMERA"]
    char["placement"].location = (0, 0, 0)
    for camera in cameras:
        camera.location -= old_position
    isolated.camera = char["sprite_cameras"]["south"]
    isolated.render.resolution_x = isolated.render.resolution_y = 256
    isolated.render.film_transparent = True
    isolated["sprite_camera_contract"] = json.dumps(char["sprite_camera_spec"], sort_keys=True)
    bpy.context.view_layer.update()
    try:
        bpy.data.libraries.write(str(output), {isolated}, fake_user=True)
    finally:
        char["placement"].location = old_position
        for camera in cameras:
            camera.location += old_position
        bpy.data.scenes.remove(isolated)
        bpy.context.view_layer.update()


def main():
    if not bpy.app.background:
        raise RuntimeError("Use a NEW background process, never an interactive Blender session.")
    if any(scene.name.startswith(model.PREFIX) for scene in bpy.data.scenes):
        raise RuntimeError("Start from a new background process, not a previously generated scene.")
    args = arguments()
    output = args.output.resolve()
    if HERE not in output.parents:
        raise RuntimeError("Output must be inside astra-round-2.")
    if output.exists() and any(output.iterdir()):
        raise RuntimeError("Output must be a new empty attempt directory.")
    settings = json.loads(args.parameters.read_text())
    parent_hash = hashlib.sha256((HERE / "round1_models.py").read_bytes()).hexdigest()
    if parent_hash != settings["frozen_parent_generator_sha256"]:
        raise RuntimeError("The copied baseline generator changed.")
    output.mkdir(parents=True, exist_ok=True)
    scene = bpy.data.scenes.new(model.PREFIX + "round_2_character_gallery")
    bpy.context.window.scene = scene
    model.build_materials("river")
    characters = (
        model.make_coilblade(scene), model.make_mossguard(scene),
        copperskiff_model.build(model, scene, settings),
    )
    char = characters[-1]
    studio, stage, gallery_camera = model.build_studio(scene, args.engine, args.samples)
    for current in characters:
        if current is char:
            animate_skiff(scene, current)
        else:
            model.animate(scene, current)
    scene.frame_set(1)
    preserved = {}
    for current in characters[:-1]:
        receipt = model.mesh_receipt(current)
        expected = UNCHANGED_GEOMETRY[current["id"]]
        if receipt["explicit_geometry_sha256"] != expected:
            raise RuntimeError(f"Unrelated character geometry changed: {current['id']}: {receipt}")
        preserved[current["id"]] = receipt
    saved_sprite_cameras(scene, char, settings)
    projection = projection_receipt(scene, char)
    (output / "sprite-projection.json").write_text(json.dumps(projection, indent=2) + "\n")

    previews = native_renders(scene, characters, char, stage, output) if args.native_previews else []
    scene.frame_set(1)
    for current in characters:
        current["collection"].hide_render = False
    scene.camera = char["sprite_cameras"]["south"]
    skiff_receipt = model.mesh_receipt(char)
    model.glb_export(scene, char, output / "copperskiff.glb")
    scene.frame_set(1)
    write_skiff_blend(scene, char, studio, output / "copperskiff.blend")
    frozen_manifest = json.loads((FROZEN / "manifest.json").read_text())
    for current in characters[:-1]:
        prior = next(item for item in frozen_manifest["characters"] if item["card_id"] == current["id"])
        preserved[current["id"]]["copied_unchanged_files"] = []
        for kind in ("blend", "glb"):
            path = FROZEN / prior[kind]["path"]
            if model.file_receipt(path)["sha256"] != prior[kind]["sha256"]:
                raise RuntimeError(f"Frozen input hash changed: {path}")
            destination = output / path.name
            shutil.copyfile(path, destination)
            preserved[current["id"]]["copied_unchanged_files"].append(model.file_receipt(destination))
    scene.camera = gallery_camera
    model.restore_gallery(scene, characters, stage)
    scene["sprite_camera_contract"] = json.dumps(char["sprite_camera_spec"], sort_keys=True)
    bpy.data.libraries.write(str(output / "moss-and-ember-characters.blend"), {scene}, fake_user=True)
    manifest = {
        "schema": 2,
        "status": "generated revision; independent visual critique pending",
        "revision_scope": "Copperskiff silhouette, contact cue, and saved sprite cameras",
        "identity_source_commit": model.SOURCE_COMMIT,
        "authorship": "Original procedural meshes by GPT-6 Astra; Claude Riverworks Diorama direction",
        "license": "AGPL-3.0-only",
        "source_files": [model.file_receipt(HERE / path) for path in SOURCE_FILES],
        "parameters": settings,
        "blender_version": bpy.app.version_string,
        "render_engine": scene.render.engine,
        "view_transform": scene.view_settings.view_transform,
        "reference_assets_imported": False,
        "external_geometry_or_textures": [],
        "unchanged_characters": preserved,
        "copperskiff": {
            **skiff_receipt, "glb_validation": char["glb_validation"],
            "blend": model.file_receipt(output / "copperskiff.blend"),
            "glb": model.file_receipt(output / "copperskiff.glb"),
            "triangle_target": [1500, 3000],
            "triangle_target_met": 1500 <= skiff_receipt["evaluated_triangles"] <= 3000,
        },
        "combined_blend": model.file_receipt(output / "moss-and-ember-characters.blend"),
        "sprite_camera": char["sprite_camera_spec"],
        "native_preview_render_count": len(previews),
        "portrait_preview_render_count": 1 if previews else 0,
        "full_atlas_rendered": False,
        "live_runtime_integration": False,
        "known_open_items": [
            "Fresh independent critique",
            "Actual arena and grayscale team qualification",
            "Coilblade and Mossguard round-one visual failures remain outside this revision",
            "No merged named game clips or complete motion suite",
            "No final outline or team ring integration",
        ],
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"status": "generated", "output": str(output),
                      "triangles": skiff_receipt["evaluated_triangles"],
                      "visual_verdict": "pending independent critic"}, indent=2))


if __name__ == "__main__":
    main()
