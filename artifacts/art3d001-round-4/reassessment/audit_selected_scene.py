"""Independent fresh native-size audit of one frozen Copperskiff R4 blend.

Appends the saved scene carrying sprite_camera_contract from the blend library,
then renders its four contract cameras, two teams and two poses. It also measures
actual evaluated bow/stern mesh centroids through each saved camera. It never
saves or modifies the blend.
"""
import argparse
import hashlib
import json
import math
import os
import sys
import time
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

DIRECTIONS = ("north", "east", "south", "west")
TEAMS = {"river": "#2E7F86", "ember": "#C6452E"}
POSES = (("idle", 1), ("contact", 100))
SUFFIXES = {
    "hull": "copperskiff_kettle_hull",
    "bow_mouth": "copperskiff_spout_mouth",
    "stern_disc": "copperskiff_pusher_disc",
}
ENV_ALLOWLIST = ("PATH", "LANG", "LC_ALL", "TZ", "HOME", "TMPDIR")
NATIVE_SIZE = 64
SUPERSAMPLE = 4


def parse_args():
    tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    return parser.parse_args(tail)


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def srgb_channel_to_linear(channel):
    channel /= 255.0
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def linear_rgba(hex_value):
    value = hex_value.lstrip("#")
    return tuple(srgb_channel_to_linear(int(value[i:i + 2], 16))
                 for i in (0, 2, 4)) + (1.0,)


def set_team_color(materials, hex_value):
    rgba = linear_rgba(hex_value)
    for material in materials:
        material.diffuse_color = rgba
        if material.use_nodes and material.node_tree:
            for node in material.node_tree.nodes:
                if node.type == "BSDF_PRINCIPLED":
                    socket = node.inputs.get("Base Color")
                    if socket is not None:
                        socket.default_value = rgba


def base_name(name):
    stem, separator, tail = name.rpartition(".")
    return stem if separator and tail.isdigit() else name


def find_suffix(scene, suffix):
    matches = [obj for obj in scene.objects if base_name(obj.name).endswith(suffix)]
    if len(matches) != 1:
        raise RuntimeError(f"Expected one saved object ending {suffix!r}; got {[o.name for o in matches]}")
    return matches[0]


def evaluated_vertices(obj, depsgraph):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        return [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    finally:
        evaluated.to_mesh_clear()


def centroid(obj, depsgraph):
    points = evaluated_vertices(obj, depsgraph)
    if not points:
        raise RuntimeError(f"Semantic point mesh is empty: {obj.name}")
    return sum(points, Vector((0.0, 0.0, 0.0))) / len(points), len(points)


def project_point(scene, camera, point, size):
    ndc = world_to_camera_view(scene, camera, point)
    return {
        "ndc_lower_left_origin": [float(ndc.x), float(ndc.y), float(ndc.z)],
        "pixel_native64_top_origin": [float(ndc.x * size), float((1.0 - ndc.y) * size)],
    }


def classify_facing(dx, dy_top):
    if abs(dx) >= abs(dy_top):
        return "east" if dx > 0 else "west" if dx < 0 else "ambiguous"
    return "north" if dy_top < 0 else "south" if dy_top > 0 else "ambiguous"


def bounds_for_objects(scene, camera, objects, depsgraph, width, height):
    points = []
    for obj in objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        for world in evaluated_vertices(obj, depsgraph):
            ndc = world_to_camera_view(scene, camera, world)
            if ndc.z >= 0:
                points.append((float(ndc.x), float(ndc.y)))
    if not points:
        raise RuntimeError(f"No visible evaluated mesh points for camera {camera.name}")
    left = min(point[0] for point in points)
    right = max(point[0] for point in points)
    bottom = min(point[1] for point in points)
    top = max(point[1] for point in points)
    return {
        "left": left,
        "right": right,
        "bottom": bottom,
        "top": top,
        "native_pixel_bounds_left_top_right_bottom": [
            left * NATIVE_SIZE, (1.0 - top) * NATIVE_SIZE,
            right * NATIVE_SIZE, (1.0 - bottom) * NATIVE_SIZE,
        ],
        "crop_safe": left >= 0.0 and right <= 1.0 and bottom >= 0.0 and top <= 1.0,
        "evaluated_projected_vertex_count": len(points),
        "render_resolution": [width, height],
    }


def load_stored_scene(blend_path):
    with bpy.data.libraries.load(str(blend_path), link=False) as (data_from, data_to):
        names = list(data_from.scenes)
        if not names:
            raise RuntimeError("Frozen blend has no saved scene datablocks")
        data_to.scenes = names
    candidates = [scene for scene in data_to.scenes
                  if scene is not None and scene.get("sprite_camera_contract")]
    if len(candidates) != 1:
        raise RuntimeError("Expected one stored scene carrying sprite_camera_contract; found "
                           + repr([scene.name for scene in data_to.scenes if scene is not None]))
    scene = candidates[0]
    if bpy.context.window is not None:
        bpy.context.window.scene = scene
    return scene, names


def main():
    if not bpy.app.background:
        raise RuntimeError("Expected background Blender process")
    args = parse_args()
    blend = args.blend.resolve()
    output = args.out.resolve()
    raw_dir = output / "raw-256"
    raw_dir.mkdir(parents=True, exist_ok=True)
    started = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    before = sha256(blend)
    scene, stored_scene_names = load_stored_scene(blend)
    if bpy.context.window is not None:
        bpy.context.window.scene = scene

    contract_value = scene.get("sprite_camera_contract")
    contract = json.loads(contract_value) if isinstance(contract_value, str) else dict(contract_value)
    camera_names = contract.get("camera_names", {})
    cameras = {}
    for direction in DIRECTIONS:
        name = camera_names.get(direction)
        camera = scene.objects.get(name) if name else None
        if camera is None or camera.type != "CAMERA":
            raise RuntimeError(f"Saved contract has no stored {direction} camera {name!r}")
        cameras[direction] = camera

    placements = [obj for obj in scene.objects if obj.get("card_id") == "copperskiff"]
    if len(placements) != 1:
        raise RuntimeError(f"Expected one Copperskiff root by card_id; got {[o.name for o in placements]}")
    objects = {key: find_suffix(scene, suffix) for key, suffix in SUFFIXES.items()}
    width = NATIVE_SIZE * SUPERSAMPLE
    height = width
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = True
    scene.render.use_file_extension = True

    materials = [material for material in bpy.data.materials
                 if material.name == "TEAM" or material.name.endswith("_TEAM")]
    if not materials:
        raise RuntimeError("Saved model has no TEAM material")
    mesh_objects = [obj for obj in scene.objects if obj.type == "MESH"]
    projections = []
    camera_records = []
    all_bounds = []
    for direction in DIRECTIONS:
        camera = cameras[direction]
        with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
            for pose, frame in POSES:
                scene.frame_set(frame)
                scene.view_layers[0].update()
                depsgraph = bpy.context.evaluated_depsgraph_get()
                bow, bow_count = centroid(objects["bow_mouth"], depsgraph)
                stern, stern_count = centroid(objects["stern_disc"], depsgraph)
                bow_p = project_point(scene, camera, bow, NATIVE_SIZE)["pixel_native64_top_origin"]
                stern_p = project_point(scene, camera, stern, NATIVE_SIZE)["pixel_native64_top_origin"]
                dx, dy = bow_p[0] - stern_p[0], bow_p[1] - stern_p[1]
                projections.append({
                    "saved_camera_label": direction,
                    "camera_name": camera.name,
                    "pose": pose,
                    "frame": frame,
                    "bow_object": objects["bow_mouth"].name,
                    "bow_mesh_vertex_count": bow_count,
                    "bow_native64_top_origin_px": bow_p,
                    "stern_object": objects["stern_disc"].name,
                    "stern_mesh_vertex_count": stern_count,
                    "stern_native64_top_origin_px": stern_p,
                    "bow_minus_stern_native64_top_origin_px": [dx, dy],
                    "facing_from_projected_bow_stern": classify_facing(dx, dy),
                    "contract_matches_projected_facing": classify_facing(dx, dy) == direction,
                })
                all_bounds.append({"direction": direction, "pose": pose,
                                   "frame": frame,
                                   **bounds_for_objects(scene, camera, mesh_objects,
                                                        depsgraph, width, height)})

    renders = []
    for team, color in TEAMS.items():
        set_team_color(materials, color)
        for pose, frame in POSES:
            with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
                scene.frame_set(frame)
                scene.view_layers[0].update()
                for direction in DIRECTIONS:
                    camera = cameras[direction]
                    scene.camera = camera
                    stem = f"{team}-{direction}-{pose}"
                    filepath = raw_dir / f"{stem}-256.png"
                    scene.render.filepath = str(filepath)
                    bpy.ops.render.render(write_still=True)
                    renders.append({
                        "team": team,
                        "team_srgb_hex": color,
                        "direction": direction,
                        "pose": pose,
                        "frame": frame,
                        "path": str(filepath),
                        "bytes": filepath.stat().st_size,
                        "sha256": sha256(filepath),
                    })
                    print(f"rendered {stem}", flush=True)

    after = sha256(blend)
    camera_spec = contract.get("camera", contract)
    receipt = {
        "status": "fresh independent saved-scene audit; no visual verdict; no blend save",
        "started_utc": started,
        "finished_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "blender_version": bpy.app.version_string,
        "blender_pid": os.getpid(),
        "argv": list(sys.argv),
        "environment_allowlist": {key: os.environ.get(key) for key in ENV_ALLOWLIST
                                   if key in os.environ},
        "blend": str(blend),
        "blend_sha256_before": before,
        "blend_sha256_after": after,
        "scene": scene.name,
        "stored_scene_names": stored_scene_names,
        "placement_object": placements[0].name,
        "placement_forward_axis": placements[0].get("forward_axis"),
        "sprite_camera_contract": contract,
        "render_engine_saved": scene.render.engine,
        "view_transform_saved": scene.view_settings.view_transform,
        "saved_render_resolution": [scene.render.resolution_x, scene.render.resolution_y],
        "rendered_resolution": [width, height],
        "native_size": NATIVE_SIZE,
        "supersample": SUPERSAMPLE,
        "mesh_object_count": len(mesh_objects),
        "team_materials": [material.name for material in materials],
        "team_colors_used": TEAMS,
        "sprite_projected_bounds_native_px": all_bounds,
        "crop_checks_idle_contact": all_bounds,
        "actor_facing_projection_checks": projections,
        "render_count": len(renders),
        "renders": renders,
    }
    receipt_path = output / "fresh-render-receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": receipt["status"],
        "blend_sha256_before": before,
        "blend_sha256_after": after,
        "scene": scene.name,
        "render_count": len(renders),
        "heading_signs": [{"label": item["saved_camera_label"],
                            "bow_minus_stern_px": item["bow_minus_stern_native64_top_origin_px"],
                            "projected_facing": item["facing_from_projected_bow_stern"],
                            "matches": item["contract_matches_projected_facing"]}
                           for item in projections if item["pose"] == "idle"],
        "receipt": str(receipt_path),
    }, indent=2), flush=True)


if __name__ == "__main__":
    main()
