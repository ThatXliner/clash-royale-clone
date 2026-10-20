from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT = Path("/Users/me/.codex/worktrees/9456/clash-royale-clone")
ATTEMPT = ROOT / "design/20261020-redesign/astra/generated/attempt-20261020T144102Z-22183"
MODEL_DIR = ATTEMPT / "models"
OUT = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
PREFIX = "ME_20261020_"
ELEVATION = 50.0
PROJECTION_SCALE = 2.59
PROJECTION_TARGET_HEIGHT = 0.6211162480011352
EXPECTED_PIVOT = [0.5, 216 / 256]
DIRS = [("north", 180), ("east", 270), ("south", 0), ("west", 90)]
POSES = [("idle", 1), ("walk", 51), ("attack-contact", 100)]
CARDS = ["coilblade", "mossguard", "copperskiff"]


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def srgb_channel(value):
    x = int(value, 16) / 255
    return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4


def hex_rgba(value):
    value = value.lstrip("#")
    return tuple(srgb_channel(value[i:i + 2]) for i in (0, 2, 4)) + (1.0,)


def camera_pitch(camera):
    bpy.context.view_layer.update()
    forward = camera.matrix_world.to_quaternion() @ Vector((0, 0, -1))
    return math.degrees(math.asin(max(-1.0, min(1.0, -forward.z))))


def camera_state(scene):
    camera = scene.camera
    if camera is None:
        return None
    return {
        "name": camera.name,
        "type": camera.data.type,
        "ortho_scale": camera.data.ortho_scale if camera.data.type == "ORTHO" else None,
        "pitch_down_degrees": camera_pitch(camera),
        "location": [round(v, 8) for v in camera.location],
        "rotation_euler_degrees": [round(math.degrees(v), 6) for v in camera.rotation_euler],
        "resolution": [scene.render.resolution_x, scene.render.resolution_y],
        "fps": scene.render.fps,
    }


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def place_camera(scene, camera, placement, yaw_degrees, scale, target_height):
    target = placement.location + Vector((0, 0, target_height))
    angle = math.radians(yaw_degrees)
    rise = math.radians(ELEVATION)
    camera.location = target + Vector((
        8 * math.sin(angle) * math.cos(rise),
        -8 * math.cos(angle) * math.cos(rise),
        8 * math.sin(rise),
    ))
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = scale
    point_at(camera, target)
    scene.camera = camera
    bpy.context.view_layer.update()


def projected_bounds(scene, camera, collection):
    bpy.context.view_layer.update()
    inverse = camera.matrix_world.normalized().inverted()
    frame = camera.data.view_frame(scene=scene)
    left = min(p.x for p in frame)
    right = max(p.x for p in frame)
    bottom = min(p.y for p in frame)
    top = max(p.y for p in frame)
    xs, ys = [], []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in collection.all_objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        to_camera = inverse @ evaluated.matrix_world
        for vertex in mesh.vertices:
            point = to_camera @ vertex.co
            xs.append((point.x - left) / (right - left))
            ys.append((point.y - bottom) / (top - bottom))
        evaluated.to_mesh_clear()
    return {
        "left": min(xs), "right": max(xs),
        "top": 1 - max(ys), "bottom": 1 - min(ys),
    }


def world_bounds(collection):
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    base_triangles = 0
    evaluated_triangles = 0
    mats = set()
    for obj in collection.all_objects:
        if obj.type != "MESH":
            continue
        obj.data.calc_loop_triangles()
        base_triangles += len(obj.data.loop_triangles)
        mats.update(m.name for m in obj.data.materials if m)
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        evaluated_triangles += len(mesh.loop_triangles)
        for vertex in mesh.vertices:
            points.append(evaluated.matrix_world @ vertex.co)
        evaluated.to_mesh_clear()
    bounds = [[min(p[a] for p in points), max(p[a] for p in points)] for a in range(3)]
    return {
        "mesh_objects": sum(o.type == "MESH" for o in collection.all_objects),
        "base_triangles": base_triangles,
        "evaluated_triangles": evaluated_triangles,
        "materials": sorted(mats),
        "world_bounds_xyz": [[round(v, 6) for v in pair] for pair in bounds],
    }


def set_team_material(material, hex_color):
    rgba = hex_rgba(hex_color)
    material.diffuse_color = rgba
    shader = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    socket = next(s for s in shader.inputs if s.identifier == "Base Color")
    socket.default_value = rgba


def load_saved_scene_summary(path):
    summary = {"file": path.name, "scenes": []}
    try:
        with bpy.data.libraries.load(str(path), link=False) as (source, target):
            target.scenes = list(source.scenes)
        for scene in target.scenes:
            if scene is None:
                continue
            placements = [o for o in scene.objects if o.get("card_id")]
            cameras = []
            for camera in [o for o in scene.objects if o.type == "CAMERA"]:
                cameras.append({
                    "name": camera.name,
                    "type": camera.data.type,
                    "ortho_scale": camera.data.ortho_scale if camera.data.type == "ORTHO" else None,
                    "pitch_down_degrees": camera_pitch(camera),
                })
            summary["scenes"].append({
                "name": scene.name,
                "active_camera": scene.camera.name if scene.camera else None,
                "cameras": cameras,
                "fps": scene.render.fps,
                "resolution": [scene.render.resolution_x, scene.render.resolution_y],
                "placements": [o.name for o in placements],
                "mesh_objects": sum(o.type == "MESH" for o in scene.objects),
                "team_material_present": any(m.name == "TEAM" for m in bpy.data.materials),
            })
    except Exception as exc:
        summary["load_error"] = f"{type(exc).__name__}: {exc}"
    return summary


OUT.mkdir(parents=True, exist_ok=True)
raw_dir = OUT / "raw-256"
raw_dir.mkdir(exist_ok=True)

scene = bpy.context.scene
camera = scene.camera
if camera is None:
    raise RuntimeError("The saved combined .blend has no active camera.")
original_camera = camera_state(scene)
scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in {
    e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items
} else scene.render.engine
scene.render.resolution_percentage = 100
scene.render.resolution_x = 256
scene.render.resolution_y = 256
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"
scene.render.film_transparent = True
scene.render.use_file_extension = True

stage = bpy.data.collections.get(PREFIX + "stage")
if stage is not None:
    stage.hide_render = True

palette = json.loads((ROOT / "design/20261020-redesign/astra/palette.json").read_text())
team_colors = palette["team_variants"]
team_material = bpy.data.materials.get("TEAM")
if team_material is None:
    raise RuntimeError("No material named TEAM exists in the saved .blend.")

card_records = {}
for card in CARDS:
    collection = bpy.data.collections.get(PREFIX + card)
    if collection is None:
        raise RuntimeError(f"Missing saved model collection for {card}.")
    placements = [o for o in collection.all_objects if o.get("card_id") == card]
    if len(placements) != 1:
        raise RuntimeError(f"Expected one authored placement pivot for {card}, found {len(placements)}.")
    placement = placements[0]
    original_location = list(placement.location)
    placement.location = (0, 0, 0)
    scene.frame_set(1)
    bpy.context.view_layer.update()
    bounds = world_bounds(collection)
    card_records[card] = {
        "placement": placement,
        "collection": collection,
        "original_gallery_location": original_location,
        "bounds": bounds,
    }

projection_camera = {}
for card, data in card_records.items():
    placement, collection = data["placement"], data["collection"]
    scene.frame_set(1)
    place_camera(scene, camera, placement, 0, PROJECTION_SCALE, PROJECTION_TARGET_HEIGHT)
    anchor = world_to_camera_view(scene, camera, placement.location)
    bounds = projected_bounds(scene, camera, collection)
    projection_camera[card] = {
        "camera": camera_state(scene),
        "anchor": [round(anchor.x, 8), round(1 - anchor.y, 8)],
        "bounds_fraction": {k: round(v, 8) for k, v in bounds.items()},
    }

render_records = []
for card, data in card_records.items():
    placement, collection = data["placement"], data["collection"]
    for other in CARDS:
        other_collection = card_records[other]["collection"]
        other_collection.hide_render = other != card
    scene.frame_set(1)
    bpy.context.view_layer.update()
    place_camera(scene, camera, placement, 0, 1.0, 0.0)
    base_bounds = projected_bounds(scene, camera, collection)
    projected_height_at_scale1 = base_bounds["bottom"] - base_bounds["top"]
    ortho_scale = projected_height_at_scale1 * 256 / 52
    target_height = (EXPECTED_PIVOT[1] - 0.5) * ortho_scale / math.cos(math.radians(ELEVATION))
    for team in ("river", "ember"):
        set_team_material(team_material, team_colors[team])
        for direction, yaw in DIRS:
            scene.frame_set(1)
            place_camera(scene, camera, placement, yaw, ortho_scale, target_height)
            anchor = world_to_camera_view(scene, camera, placement.location)
            bounds = projected_bounds(scene, camera, collection)
            name = f"{card}-{team}-{direction}-idle-f001.png"
            scene.render.filepath = str(raw_dir / name)
            bpy.ops.render.render(write_still=True)
            render_records.append({
                "path": f"raw-256/{name}", "card_id": card, "team": team,
                "direction": direction, "frame": 1, "pose": "idle",
                "ortho_scale": round(ortho_scale, 8),
                "target_height": round(target_height, 8),
                "camera_pitch_degrees": round(camera_pitch(camera), 6),
                "anchor": [round(anchor.x, 8), round(1 - anchor.y, 8)],
                "bounds_fraction": {k: round(v, 8) for k, v in bounds.items()},
            })
    set_team_material(team_material, team_colors["river"])
    for pose_name, frame in POSES[1:]:
        scene.frame_set(frame)
        place_camera(scene, camera, placement, 0, ortho_scale, target_height)
        anchor = world_to_camera_view(scene, camera, placement.location)
        bounds = projected_bounds(scene, camera, collection)
        name = f"{card}-river-south-{pose_name}-f{frame:03d}.png"
        scene.render.filepath = str(raw_dir / name)
        bpy.ops.render.render(write_still=True)
        render_records.append({
            "path": f"raw-256/{name}", "card_id": card, "team": "river",
            "direction": "south", "frame": frame, "pose": pose_name,
            "ortho_scale": round(ortho_scale, 8),
            "target_height": round(target_height, 8),
            "camera_pitch_degrees": round(camera_pitch(camera), 6),
            "anchor": [round(anchor.x, 8), round(1 - anchor.y, 8)],
            "bounds_fraction": {k: round(v, 8) for k, v in bounds.items()},
        })

individual_blends = {
    card: load_saved_scene_summary(MODEL_DIR / f"{card}.blend") for card in CARDS
}
# Restore only in-memory state before exit; no input blend is saved.
for card in CARDS:
    card_records[card]["collection"].hide_render = False

audit = {
    "status": "independent Blender inspection and render complete",
    "blender_version": bpy.app.version_string,
    "input_blend": str(MODEL_DIR / "moss-and-ember-characters.blend"),
    "combined_scene": scene.name,
    "saved_camera_before_render": original_camera,
    "projection_camera_check": {
        "camera_elevation_degrees": ELEVATION,
        "ortho_scale": PROJECTION_SCALE,
        "target_height": PROJECTION_TARGET_HEIGHT,
        "expected_pivot_256": EXPECTED_PIVOT,
        "per_character": projection_camera,
    },
    "individual_blends": individual_blends,
    "characters": {
        card: {
            "placement_name": data["placement"].name,
            "placement_custom_properties": {
                key: data["placement"].get(key)
                for key in ("card_id", "forward_axis", "ground_anchor", "source_commit", "animation_contract")
                if data["placement"].get(key) is not None
            },
            **data["bounds"],
        }
        for card, data in card_records.items()
    },
    "render_dimensions": [256, 256],
    "downsample_factor_for_13px_body": 4,
    "render_count": len(render_records),
    "renders": render_records,
    "input_source_sha256": {
        str(path.relative_to(ROOT)): digest(path)
        for path in [
            ROOT / "design/20261020-redesign/astra/build_models.py",
            ROOT / "design/20261020-redesign/astra/palette.json",
            ROOT / "design/20261020-redesign/astra/generated/attempt-20261020T144102Z-22183/models/manifest.json",
        ]
    },
}
(OUT / "blender-audit.json").write_text(json.dumps(audit, indent=2) + "\n")
print(json.dumps({
    "status": audit["status"],
    "blender_version": audit["blender_version"],
    "saved_camera": original_camera,
    "renders": len(render_records),
    "audit": str(OUT / "blender-audit.json"),
}, indent=2))

