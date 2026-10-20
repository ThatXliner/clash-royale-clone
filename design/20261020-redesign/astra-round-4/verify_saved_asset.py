"""Read back the saved editable skiff in a second new background process."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


def main():
    if not bpy.app.background:
        raise RuntimeError("Only run in a new background Blender process.")
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    before = hashlib.sha256(args.blend.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(args.blend))
    scene = bpy.context.scene
    contract = json.loads(scene["sprite_camera_contract"])
    placement = next(obj for obj in scene.objects if obj.get("card_id") == "copperskiff")
    foreign_meshes = [obj.name for obj in scene.objects
                      if obj.type == "MESH" and not obj.name.startswith("ME_20261020_copperskiff_")]
    if foreign_meshes:
        raise RuntimeError(f"Unexpected meshes in isolated editable file: {foreign_meshes}")
    cameras = []
    for direction, name in contract["camera_names"].items():
        camera = scene.objects.get(name)
        if camera is None or camera.data.type != "ORTHO":
            raise RuntimeError(f"Missing orthographic camera: {name}")
        forward = camera.matrix_world.to_quaternion() @ Vector((0, 0, -1))
        elevation = math.degrees(math.atan2(-forward.z, math.hypot(forward.x, forward.y)))
        anchor = world_to_camera_view(scene, camera, placement.matrix_world.translation)
        measured = [float(anchor.x), float(1 - anchor.y)]
        expected = contract["ground_anchor_normalized"]
        if abs(elevation - contract["elevation_degrees"]) > .001:
            raise RuntimeError(f"Saved camera pitch mismatch: {elevation}")
        if abs(camera.data.ortho_scale - contract["orthographic_scale"]) > .00001:
            raise RuntimeError(f"Saved orthographic scale mismatch: {camera.data.ortho_scale}")
        if max(abs(measured[i] - expected[i]) for i in (0, 1)) > .00001:
            raise RuntimeError(f"Saved camera anchor mismatch: {measured}")
        cameras.append({
            "direction": direction, "name": name,
            "elevation_degrees": elevation,
            "orthographic_scale": float(camera.data.ortho_scale),
            "ground_anchor_uv": measured,
            "ground_anchor_native_pixels": [value * contract["native_cell"] for value in measured],
        })
    if scene.camera.name != contract["camera_names"]["south"]:
        raise RuntimeError("The saved default camera is not the south sprite camera.")
    after = hashlib.sha256(args.blend.read_bytes()).hexdigest()
    if before != after:
        raise RuntimeError("The read-only inspection changed the saved file.")
    receipt = {
        "status": "saved file reopened and measured; no visual verdict",
        "blend": str(args.blend), "sha256_before": before, "sha256_after": after,
        "blender_version": bpy.app.version_string,
        "scene": scene.name, "default_camera": scene.camera.name,
        "placement": [float(value) for value in placement.location],
        "render_resolution": [scene.render.resolution_x, scene.render.resolution_y],
        "camera_records": cameras, "foreign_meshes": foreign_meshes,
        "mesh_objects": sum(obj.type == "MESH" for obj in scene.objects),
    }
    args.output.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
