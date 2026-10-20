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


def parse_args():
    tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--idle-frame", type=int, default=1)
    parser.add_argument("--contact-frame", type=int, default=100)
    parser.add_argument("--resolution", type=int, default=256)
    return parser.parse_args(tail)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def srgb_channel_to_linear(channel):
    channel = channel / 255.0
    if channel <= 0.04045:
        return channel / 12.92
    return ((channel + 0.055) / 1.055) ** 2.4


def hex_rgba_linear(code):
    value = code.lstrip("#")
    rgb = [int(value[i:i + 2], 16) for i in (0, 2, 4)]
    return [srgb_channel_to_linear(c) for c in rgb] + [1.0]


def material_color(mat):
    if not mat.use_nodes or not mat.node_tree:
        return
    node = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if node and node.inputs.get("Base Color"):
        return node.inputs["Base Color"]


def project_point(scene, camera, point, width, height):
    ndc = world_to_camera_view(scene, camera, point)
    return {
        "x": float(ndc.x),
        "y": float(ndc.y),
        "z": float(ndc.z),
        "pixel_x": float(ndc.x * width),
        "pixel_y_top": float((1.0 - ndc.y) * height),
    }


def camera_record(scene, camera, direction, mesh_objects, depsgraph, width, height):
    rot = camera.matrix_world.to_quaternion()
    forward = rot @ Vector((0.0, 0.0, -1.0))
    elevation = math.degrees(math.asin(max(-1.0, min(1.0, -forward.z))))
    origin_projection = project_point(scene, camera, Vector((0.0, 0.0, 0.0)), width, height)
    projected = []
    for obj in mesh_objects:
        if obj.hide_render:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            for vertex in mesh.vertices:
                world = evaluated.matrix_world @ vertex.co
                ndc = world_to_camera_view(scene, camera, world)
                if ndc.z >= 0:
                    projected.append((float(ndc.x), float(ndc.y)))
        finally:
            evaluated.to_mesh_clear()
    if projected:
        bounds = {
            "left": min(p[0] for p in projected),
            "right": max(p[0] for p in projected),
            "bottom": min(p[1] for p in projected),
            "top": max(p[1] for p in projected),
        }
    else:
        bounds = None
    return {
        "direction": direction,
        "name": camera.name,
        "type": camera.data.type,
        "elevation_degrees_from_horizontal": elevation,
        "orthographic_scale": float(camera.data.ortho_scale) if camera.data.type == "ORTHO" else None,
        "origin_ground_anchor": origin_projection,
        "projected_mesh_bounds_ndc": bounds,
        "crop_safe": bool(bounds and bounds["left"] >= 0 and bounds["right"] <= 1 and bounds["bottom"] >= 0 and bounds["top"] <= 1),
    }


def main():
    args = parse_args()
    blend_path = Path(args.blend).resolve()
    out_dir = Path(args.out).resolve()
    raw_dir = out_dir / "raw-256"
    raw_dir.mkdir(parents=True, exist_ok=True)
    start_utc = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    pre_hash = sha256(blend_path)
    bpy.ops.wm.open_mainfile(filepath=str(blend_path))
    scene = bpy.context.scene
    width = args.resolution
    height = args.resolution
    scene.render.engine = scene.render.engine
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = True
    scene.render.use_file_extension = True

    directions = ("north", "east", "south", "west")
    cameras = {}
    for direction in directions:
        camera = bpy.data.objects.get(f"ME_20261020_copperskiff_sprite_{direction}")
        if camera is None or camera.type != "CAMERA":
            raise RuntimeError(f"Saved sprite camera missing: {direction}")
        cameras[direction] = camera

    team_materials = [m for m in bpy.data.materials if m.name == "TEAM" or m.name.endswith("_TEAM")]
    if not team_materials:
        raise RuntimeError("No TEAM material found in saved Copperskiff scene")
    team_colors = {"river": "#2E7F86", "ember": "#C6452E"}
    mesh_objects = [o for o in scene.objects if o.type == "MESH"]
    depsgraph = bpy.context.evaluated_depsgraph_get()
    camera_records = [camera_record(scene, cameras[d], d, mesh_objects, depsgraph, width, height) for d in directions]

    team_usage = []
    for obj in mesh_objects:
        for index, mat in enumerate(obj.data.materials):
            if mat and mat in team_materials:
                team_usage.append({"object": obj.name, "slot": index, "material": mat.name})

    actions = []
    for action in bpy.data.actions:
        frame_range = list(action.frame_range)
        actions.append({"name": action.name, "frame_range": [float(frame_range[0]), float(frame_range[1])]})

    render_records = []
    for team, color in team_colors.items():
        rgba = hex_rgba_linear(color)
        for mat in team_materials:
            mat.diffuse_color = rgba
            base_color = material_color(mat)
            if base_color is not None:
                base_color.default_value = rgba
        for pose, frame in (("idle", args.idle_frame), ("contact", args.contact_frame)):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            for direction in directions:
                scene.camera = cameras[direction]
                stem = f"copperskiff-{team}-{direction}-{pose}"
                filepath = raw_dir / f"{stem}-256.png"
                scene.render.filepath = str(filepath)
                bpy.ops.render.render(write_still=True)
                render_records.append({"team": team, "team_srgb_hex": color, "direction": direction, "pose": pose, "frame": frame, "path": str(filepath), "sha256": sha256(filepath)})
                print(f"rendered {stem}", flush=True)

    post_hash = sha256(blend_path)
    report = {
        "status": "independent native render and saved-camera audit",
        "started_utc": start_utc,
        "finished_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "blender_version": bpy.app.version_string,
        "blender_pid": os.getpid(),
        "argv": list(sys.argv),
        "environment_allowlist": {k: os.environ.get(k) for k in ("PATH", "LANG", "LC_ALL", "TZ", "HOME", "TMPDIR") if k in os.environ},
        "blend": str(blend_path),
        "blend_sha256_before": pre_hash,
        "blend_sha256_after": post_hash,
        "scene": scene.name,
        "render_engine": scene.render.engine,
        "view_transform": scene.view_settings.view_transform,
        "render_resolution": [width, height],
        "camera_records": camera_records,
        "mesh_object_count": len(mesh_objects),
        "mesh_objects": [o.name for o in mesh_objects],
        "team_materials": [{"name": m.name, "diffuse_color_linear": list(m.diffuse_color)} for m in team_materials],
        "team_material_usage": team_usage,
        "team_colors_used": team_colors,
        "actions": actions,
        "frame_start_end_current": [scene.frame_start, scene.frame_end, scene.frame_current],
        "renders": render_records,
    }
    report_path = out_dir / "blender-audit.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"audit written {report_path}", flush=True)


try:
    main()
except Exception:
    traceback.print_exc()
    raise
