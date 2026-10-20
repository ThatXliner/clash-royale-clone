import argparse
import hashlib
import json
import math
import os
import sys
import time
import traceback
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

DIRECTIONS = ("north", "east", "south", "west")
TEAMS = {
    "river": "#2E7F86",
    "ember": "#C6452E",
}
POSES = (("idle", 1), ("contact", 100))


def args_from_blender():
    tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", required=True)
    parser.add_argument("--variant", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--native-size", type=int, default=64)
    parser.add_argument("--supersample", type=int, default=4)
    return parser.parse_args(tail)


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def linear_channel(value):
    value /= 255.0
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def linear_rgba(hex_value):
    value = hex_value.lstrip("#")
    return tuple(linear_channel(int(value[index:index + 2], 16)) for index in (0, 2, 4)) + (1.0,)


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


def project(scene, camera, point, width, height):
    ndc = world_to_camera_view(scene, camera, point)
    return {
        "x": float(ndc.x),
        "y": float(ndc.y),
        "z": float(ndc.z),
        "pixel_x": float(ndc.x * width),
        "pixel_y_top": float((1.0 - ndc.y) * height),
    }


def find_cameras(scene):
    result = {}
    for direction in DIRECTIONS:
        matches = [obj for obj in scene.objects
                   if obj.type == "CAMERA" and obj.get("direction") == direction]
        if not matches:
            matches = [obj for obj in scene.objects if obj.type == "CAMERA"
                       and obj.name.lower().endswith("_" + direction)]
        if len(matches) != 1:
            raise RuntimeError(f"Expected one saved camera for {direction}; got {[o.name for o in matches]}")
        result[direction] = matches[0]
    return result


def camera_record(scene, camera, direction, meshes, depsgraph, width, height):
    rotation = camera.matrix_world.to_quaternion()
    forward = rotation @ Vector((0.0, 0.0, -1.0))
    elevation = math.degrees(math.asin(max(-1.0, min(1.0, -forward.z))))
    origin = project(scene, camera, Vector((0.0, 0.0, 0.0)), width, height)
    points = []
    for obj in meshes:
        if obj.hide_render:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            for vertex in mesh.vertices:
                world = evaluated.matrix_world @ vertex.co
                ndc = world_to_camera_view(scene, camera, world)
                if ndc.z >= 0:
                    points.append((float(ndc.x), float(ndc.y)))
        finally:
            evaluated.to_mesh_clear()
    bounds = None
    if points:
        bounds = {
            "left": min(point[0] for point in points),
            "right": max(point[0] for point in points),
            "bottom": min(point[1] for point in points),
            "top": max(point[1] for point in points),
        }
    return {
        "direction": direction,
        "name": camera.name,
        "type": camera.data.type,
        "elevation_degrees_from_horizontal": elevation,
        "orthographic_scale": float(camera.data.ortho_scale) if camera.data.type == "ORTHO" else None,
        "origin_ground_anchor": origin,
        "projected_mesh_bounds_ndc": bounds,
        "crop_safe": bool(bounds and bounds["left"] >= 0 and bounds["right"] <= 1
                           and bounds["bottom"] >= 0 and bounds["top"] <= 1),
    }


def main():
    if not bpy.app.background:
        raise RuntimeError("Expected a fresh background Blender process")
    args = args_from_blender()
    blend_path = Path(args.blend).resolve()
    output = Path(args.out).resolve()
    raw = output / "raw-256" / args.variant
    raw.mkdir(parents=True, exist_ok=True)
    start_utc = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    before_hash = sha256(blend_path)
    bpy.ops.wm.open_mainfile(filepath=str(blend_path))

    scene = bpy.context.scene
    width = args.native_size * args.supersample
    height = width
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = True
    scene.render.use_file_extension = True

    cameras = find_cameras(scene)
    team_materials = [material for material in bpy.data.materials
                      if material.name == "TEAM" or material.name.endswith("_TEAM")]
    if not team_materials:
        raise RuntimeError("Saved model has no TEAM material")
    meshes = [obj for obj in scene.objects if obj.type == "MESH"]
    depsgraph = bpy.context.evaluated_depsgraph_get()
    camera_records = [camera_record(scene, cameras[direction], direction, meshes,
                                    depsgraph, width, height)
                      for direction in DIRECTIONS]
    records = []
    for team, hex_value in TEAMS.items():
        set_team_color(team_materials, hex_value)
        for pose, frame in POSES:
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            for direction in DIRECTIONS:
                camera = cameras[direction]
                scene.camera = camera
                stem = f"{args.variant}-{team}-{direction}-{pose}"
                filepath = raw / f"{stem}-256.png"
                scene.render.filepath = str(filepath)
                bpy.ops.render.render(write_still=True)
                records.append({
                    "variant": args.variant,
                    "team": team,
                    "team_srgb_hex": hex_value,
                    "direction": direction,
                    "pose": pose,
                    "frame": frame,
                    "path": str(filepath),
                    "bytes": filepath.stat().st_size,
                    "sha256": sha256(filepath),
                })
                print(f"rendered {stem}", flush=True)

    after_hash = sha256(blend_path)
    report = {
        "status": "independent saved-blend reopen/render audit; no visual verdict",
        "started_utc": start_utc,
        "finished_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "blender_version": bpy.app.version_string,
        "blender_pid": os.getpid(),
        "argv": list(sys.argv),
        "environment_allowlist": {key: os.environ.get(key) for key in
                                   ("PATH", "LANG", "LC_ALL", "TZ", "HOME", "TMPDIR")
                                   if key in os.environ},
        "blend": str(blend_path),
        "blend_sha256_before": before_hash,
        "blend_sha256_after": after_hash,
        "scene": scene.name,
        "render_engine_saved": scene.render.engine,
        "view_transform_saved": scene.view_settings.view_transform,
        "render_resolution": [width, height],
        "supersample": args.supersample,
        "native_size": args.native_size,
        "camera_records": camera_records,
        "mesh_object_count": len(meshes),
        "team_materials": [material.name for material in team_materials],
        "team_colors_used": TEAMS,
        "renders": records,
    }
    report_path = output / f"{args.variant}-blender-audit.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"audit written {report_path}", flush=True)


try:
    main()
except Exception:
    traceback.print_exc()
    raise
