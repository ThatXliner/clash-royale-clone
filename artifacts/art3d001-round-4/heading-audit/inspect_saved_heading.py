"""Read-only saved-asset audit of the Copperskiff sprite-facing labels.

This probe opens the frozen blend in background mode, evaluates frame 1,
projects actual evaluated bow/stern mesh centroids through each saved camera,
and records top-origin pixel coordinates. It never renders or saves a blend.
"""
import argparse
import hashlib
import json
import os
import struct
import sys
import time
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

DIRECTIONS = ("east", "west", "north", "south")
ENV_ALLOWLIST = ("PATH", "LANG", "LC_ALL", "TZ", "HOME", "TMPDIR")
SUFFIXES = {
    "body": "copperskiff_body",
    "hull": "copperskiff_kettle_hull",
    "bow_nozzle": "copperskiff_bow_kettle_spout",
    "bow_mouth": "copperskiff_spout_mouth",
    "stern_propeller": "copperskiff_pusher_propeller",
    "stern_disc": "copperskiff_pusher_disc",
}


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def input_paths(args):
    sources = [args.source_dir / name for name in (
        "round2_pipeline.py", "alternatives.json", "copperskiff_model.py",
        "round1_models.py", "verify_saved_asset.py", "build_comparison.py",
    )]
    references = [args.comparison_dir / "sprite-projection.json",
                  args.comparison_dir / "saved-asset-inspection.json"]
    native = [args.comparison_dir / "native-64" / f"tapered_canopy-river-{d}-idle.png"
              for d in DIRECTIONS]
    independent = [args.fresh_dir / "native-64" / "tapered_canopy" /
                   f"tapered_canopy-river-{d}-idle-64.png" for d in DIRECTIONS]
    return [Path(__file__).resolve(), args.blend, *sources, *references,
            *native, *independent]


def find_suffix(scene, suffix):
    def without_blender_collision_suffix(name):
        base, separator, tail = name.rpartition(".")
        return base if separator and tail.isdigit() else name

    matches = [obj for obj in scene.objects
               if without_blender_collision_suffix(obj.name).endswith(suffix)]
    if len(matches) != 1:
        raise RuntimeError(f"Expected one object ending {suffix!r}; got {[o.name for o in matches]}")
    return matches[0]


def vector_record(vector):
    return [float(component) for component in vector]


def matrix_record(matrix):
    return [[float(matrix[row][column]) for column in range(4)] for row in range(4)]


def object_transform(obj):
    chain = []
    current = obj
    while current is not None:
        chain.append({
            "name": current.name,
            "parent": current.parent.name if current.parent else None,
            "location_local": vector_record(current.location),
            "rotation_euler_local_radians": vector_record(current.rotation_euler),
            "scale_local": vector_record(current.scale),
            "matrix_world": matrix_record(current.matrix_world),
        })
        current = current.parent
    return chain


def evaluated_mesh_centroid(obj, depsgraph):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        if not mesh.vertices:
            raise RuntimeError(f"Semantic point object has no vertices: {obj.name}")
        points = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
        center = sum(points, Vector((0.0, 0.0, 0.0))) / len(points)
        return center, len(points)
    finally:
        evaluated.to_mesh_clear()


def point_projection(scene, camera, point, width, height, native_size):
    ndc = world_to_camera_view(scene, camera, point)
    return {
        "ndc_lower_left_origin": [float(ndc.x), float(ndc.y), float(ndc.z)],
        "pixel_raw_top_origin": [float(ndc.x * width), float((1.0 - ndc.y) * height)],
        "pixel_native64_top_origin": [float(ndc.x * native_size),
                                       float((1.0 - ndc.y) * native_size)],
    }


def png_record(path):
    header = Path(path).read_bytes()[:24]
    if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError(f"Not a PNG with a complete IHDR: {path}")
    return {
        "path": str(Path(path).resolve()),
        "sha256": sha256(path),
        "width": struct.unpack(">I", header[16:20])[0],
        "height": struct.unpack(">I", header[20:24])[0],
        "bytes": Path(path).stat().st_size,
    }


def classify(dx, dy_top):
    if abs(dx) >= abs(dy_top):
        return "east" if dx > 0 else "west" if dx < 0 else "ambiguous"
    return "north" if dy_top < 0 else "south" if dy_top > 0 else "ambiguous"


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", type=Path, required=True)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--comparison-dir", type=Path, required=True)
    parser.add_argument("--fresh-dir", type=Path, required=True)
    parser.add_argument("--audit-dir", type=Path, required=True)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def main():
    if not bpy.app.background:
        raise RuntimeError("This read-only audit requires a background Blender process.")
    args = arguments()
    args.blend = args.blend.resolve()
    args.source_dir = args.source_dir.resolve()
    args.comparison_dir = args.comparison_dir.resolve()
    args.fresh_dir = args.fresh_dir.resolve()
    args.audit_dir = args.audit_dir.resolve()
    paths = input_paths(args)
    missing = [str(path) for path in paths if not path.is_file()]
    if missing:
        raise RuntimeError("Required evidence files are missing: " + ", ".join(missing))
    before = {str(path.resolve()): sha256(path) for path in paths}
    started_utc = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print(json.dumps({
        "event": "audit-start",
        "started_utc": started_utc,
        "blender_version": bpy.app.version_string,
        "blender_pid": os.getpid(),
        "environment_allowlist": {key: os.environ.get(key) for key in ENV_ALLOWLIST
                                   if key in os.environ},
        "probe_sha256": before[str(Path(__file__).resolve())],
        "blend_sha256_before": before[str(args.blend)],
    }, sort_keys=True), flush=True)
    # This saved asset is a Blender library file, so opening it as a main file
    # presents an empty startup scene. Append its saved scene datablock instead.
    with bpy.data.libraries.load(str(args.blend), link=False) as (data_from, data_to):
        if not data_from.scenes:
            raise RuntimeError("The frozen library contains no saved scene datablock")
        stored_scene_names = list(data_from.scenes)
        data_to.scenes = list(data_from.scenes)
    scenes_with_contract = [candidate for candidate in data_to.scenes
                            if candidate is not None and candidate.get("sprite_camera_contract")]
    if len(scenes_with_contract) != 1:
        raise RuntimeError("Expected one stored scene carrying sprite_camera_contract; found "
                           + repr([candidate.name for candidate in data_to.scenes
                                   if candidate is not None]))
    scene = scenes_with_contract[0]
    if bpy.context.window is not None:
        bpy.context.window.scene = scene
    view_layer = scene.view_layers[0]
    with bpy.context.temp_override(scene=scene, view_layer=view_layer):
        scene.frame_set(1)
        view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()

    placements = [obj for obj in scene.objects if obj.get("card_id") == "copperskiff"]
    if len(placements) != 1:
        raise RuntimeError(f"Expected one stored Copperskiff root by card_id; got {[o.name for o in placements]}")
    objects = {"placement": placements[0]}
    objects.update({key: find_suffix(scene, suffix) for key, suffix in SUFFIXES.items()})
    bow, bow_vertices = evaluated_mesh_centroid(objects["bow_mouth"], depsgraph)
    stern, stern_vertices = evaluated_mesh_centroid(objects["stern_disc"], depsgraph)
    forward = objects["hull"].matrix_world.to_3x3() @ Vector((0.0, -1.0, 0.0))
    forward.normalize()
    width = scene.render.resolution_x
    height = scene.render.resolution_y
    native_size = 64

    camera_contract = json.loads(scene["sprite_camera_contract"])
    saved_camera_names = camera_contract.get("camera_names", {})
    cameras = {}
    for direction in DIRECTIONS:
        name = saved_camera_names.get(direction)
        camera = scene.objects.get(name) if name else None
        if camera is None or camera.type != "CAMERA":
            raise RuntimeError(f"Saved sprite-camera contract has no stored {direction} camera {name!r}")
        cameras[direction] = camera

    projections = []
    for direction in DIRECTIONS:
        camera = cameras[direction]
        bow_projection = point_projection(scene, camera, bow, width, height, native_size)
        stern_projection = point_projection(scene, camera, stern, width, height, native_size)
        bow_native = bow_projection["pixel_native64_top_origin"]
        stern_native = stern_projection["pixel_native64_top_origin"]
        dx = bow_native[0] - stern_native[0]
        dy_top = bow_native[1] - stern_native[1]
        camera_forward = camera.matrix_world.to_quaternion() @ Vector((0.0, 0.0, -1.0))
        projections.append({
            "saved_camera_label": direction,
            "camera_name": camera.name,
            "camera_world_location": vector_record(camera.matrix_world.translation),
            "camera_forward_world": vector_record(camera_forward),
            "bow_point": {"object": objects["bow_mouth"].name,
                          "mesh_datablock": objects["bow_mouth"].data.name,
                          "evaluated_mesh_vertex_count": bow_vertices,
                          "world_centroid": vector_record(bow),
                          "projection": bow_projection},
            "stern_point": {"object": objects["stern_disc"].name,
                            "mesh_datablock": objects["stern_disc"].data.name,
                            "evaluated_mesh_vertex_count": stern_vertices,
                            "world_centroid": vector_record(stern),
                            "projection": stern_projection},
            "bow_minus_stern_native64_top_origin_pixels": [float(dx), float(dy_top)],
            "facing_from_dominant_projected_axis": classify(dx, dy_top),
            "contract_matches_camera_label": classify(dx, dy_top) == direction,
        })

    image_paths = [path for path in paths if path.suffix.lower() == ".png"]
    after = {str(path.resolve()): sha256(path) for path in paths}
    args.audit_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "status": "read-only saved-asset projection audit; no render or save",
        "started_utc": started_utc,
        "finished_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "blender_version": bpy.app.version_string,
        "blender_pid": os.getpid(),
        "argv": list(sys.argv),
        "environment_allowlist": {key: os.environ.get(key) for key in ENV_ALLOWLIST
                                   if key in os.environ},
        "blend": str(args.blend),
        "blend_sha256_before": before[str(args.blend)],
        "blend_sha256_after": after[str(args.blend)],
        "input_sha256_before": before,
        "input_sha256_after": after,
        "inputs_unchanged": before == after,
        "scene": scene.name,
        "stored_scene_names": stored_scene_names,
        "scene_object_count": len(scene.objects),
        "scene_sprite_camera_contract": camera_contract,
        "render_resolution_saved": [width, height],
        "placement_forward_axis_property": objects["placement"].get("forward_axis"),
        "hierarchy_transforms": {key: object_transform(obj) for key, obj in objects.items()},
        "hull_forward_world": vector_record(forward),
        "bow_stern_projections": projections,
        "native_pngs": [png_record(path) for path in image_paths],
        "native_png_provenance": {
            "builder": str(args.comparison_dir / "native-64"),
            "fresh_independent": str(args.fresh_dir / "native-64" / "tapered_canopy"),
        },
    }
    output = args.audit_dir / "projection-receipt.json"
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "blender_pid": report["blender_pid"],
        "blend_sha256_before": report["blend_sha256_before"],
        "blend_sha256_after": report["blend_sha256_after"],
        "inputs_unchanged": report["inputs_unchanged"],
        "projections": [{
            "camera": item["saved_camera_label"],
            "bow_native64_px": item["bow_point"]["projection"]["pixel_native64_top_origin"],
            "stern_native64_px": item["stern_point"]["projection"]["pixel_native64_top_origin"],
            "bow_minus_stern_px": item["bow_minus_stern_native64_top_origin_pixels"],
            "facing": item["facing_from_dominant_projected_axis"],
            "matches": item["contract_matches_camera_label"],
        } for item in projections],
        "receipt": str(output),
    }, indent=2))


try:
    main()
except Exception:
    import traceback
    traceback.print_exc()
    raise
