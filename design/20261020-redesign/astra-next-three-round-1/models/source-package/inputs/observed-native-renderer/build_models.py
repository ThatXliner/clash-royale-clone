"""Build two standalone editable originals, validate, and export without rendering."""

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import character_models as models

source = models.source
SETTINGS = json.loads((HERE / "parameters.json").read_text())


def file_record(path):
    return {"path": str(path), "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def studio(scene):
    collection = bpy.data.collections.new(models.PREFIX + "studio")
    scene.collection.children.link(collection)
    world = bpy.data.worlds.new(models.PREFIX + "warm_sky")
    world.use_nodes = True
    shader = next(node for node in world.node_tree.nodes if node.type == "BACKGROUND")
    shader.inputs[0].default_value = source.linear_color("#9FB7B5")
    shader.inputs[1].default_value = .35
    scene.world = world
    light_types = {item.identifier for item in bpy.types.Light.bl_rna.properties["type"].enum_items}
    if "AREA" not in light_types:
        raise RuntimeError(f"Area lights unavailable: {sorted(light_types)}")
    for name, location, energy, color, size in (
        ("warm_key", (-3, -4, 6), 850, "#FFE2B8", 5),
        ("copper_rim", (3, 3, 5), 650, "#E9A83A", 4),
        ("soft_sky", (-2, 2, 3), 300, "#9FB7B5", 4),
    ):
        data = bpy.data.lights.new(models.PREFIX + name, type="AREA")
        data.energy = energy
        data.color = source.linear_color(color)[:3]
        source.enum(data, "shape", ("DISK",))
        data.size = size
        obj = bpy.data.objects.new(data.name, data)
        collection.objects.link(obj)
        obj.location = location
        source.point_at(obj, (0, 0, 1))
    try:
        scene.render.engine = SETTINGS["render_engine"]
    except TypeError as error:
        raise RuntimeError(f"Requested engine unavailable: {error}") from error
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = SETTINGS["render_samples"]
    scene.render.fps = 60
    scene.frame_start = 1
    scene.frame_end = 106
    scene.render.resolution_x = scene.render.resolution_y = 256
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    source.enum(scene.render.image_settings, "file_format", ("PNG",))
    source.enum(scene.render.image_settings, "color_mode", ("RGBA",))
    source.enum(scene.render.image_settings, "color_depth", ("8",))
    source.enum(scene.view_settings, "view_transform", ("AgX", "Standard"))
    scene.view_settings.exposure = .25
    scene.view_settings.gamma = 1
    return collection


def camera_at(camera, location, yaw, elevation, scale, target_height):
    target = Vector(location) + Vector((0, 0, target_height))
    azimuth, pitch = math.radians(yaw), math.radians(elevation)
    camera.location = target + Vector((8 * math.sin(azimuth) * math.cos(pitch),
                                      -8 * math.cos(azimuth) * math.cos(pitch),
                                      8 * math.sin(pitch)))
    camera.data.ortho_scale = scale
    source.point_at(camera, target)


def saved_cameras(scene, char):
    spec = SETTINGS["camera"]
    collection = bpy.data.collections.new(models.PREFIX + char["id"] + "_cameras")
    scene.collection.children.link(collection)
    target_height = ((spec["ground_anchor_normalized"][1] - .5) * spec["orthographic_scale"]
                     / math.cos(math.radians(spec["elevation_degrees"])))
    char["sprite_cameras"] = {}
    for direction, yaw in spec["directions"]:
        data = bpy.data.cameras.new(models.PREFIX + char["id"] + "_sprite_" + direction)
        source.enum(data, "type", ("ORTHO",))
        camera = bpy.data.objects.new(data.name, data)
        collection.objects.link(camera)
        camera_at(camera, char["placement"].matrix_world.translation, yaw, spec["elevation_degrees"],
                  spec["orthographic_scale"], target_height)
        camera["actor_facing"] = direction
        camera["card_id"] = char["id"]
        char["sprite_cameras"][direction] = camera
    contract = {**spec, "target_height": target_height,
                "camera_names": {key: value.name for key, value in char["sprite_cameras"].items()},
                "calibration": "Common fixed camera. No shape-dependent fit, crop, translation, or scale."}
    char["sprite_camera_spec"] = contract
    scene["card_id"] = char["id"]
    scene["sprite_camera_contract"] = json.dumps(models.primitive(contract), sort_keys=True)
    scene.camera = char["sprite_cameras"]["south"]
    return contract


def descendants(root):
    return {root, *root.children_recursive}


def evaluated_bounds(scene, root, include_marker=False):
    dg = bpy.context.evaluated_depsgraph_get()
    points, names, triangles = [], [], 0
    for obj in descendants(root):
        if obj.type != "MESH" or obj.hide_render:
            continue
        if not include_marker and obj.get("presentation_ground_marker"):
            continue
        evaluated = obj.evaluated_get(dg)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        names.append(obj.name)
        for vertex in mesh.vertices:
            co = world_to_camera_view(scene, scene.camera, evaluated.matrix_world @ vertex.co)
            points.append((float(co.x), float(1 - co.y)))
        evaluated.to_mesh_clear()
    if not points:
        raise RuntimeError("No evaluated mesh vertices in the selected character hierarchy")
    values = {"left": min(p[0] for p in points), "right": max(p[0] for p in points),
              "top": min(p[1] for p in points), "bottom": max(p[1] for p in points)}
    values["width_px"] = (values["right"] - values["left"]) * 64
    values["height_px"] = (values["bottom"] - values["top"]) * 64
    return {"bounds": values, "mesh_names": sorted(names), "triangles": triangles}


def projection_receipt(scene, char):
    records = []
    expected = SETTINGS["camera"]["ground_anchor_normalized"]
    for direction, camera in char["sprite_cameras"].items():
        scene.camera = camera
        for motion, frames in SETTINGS["source_frames"].items():
            for frame in frames:
                scene.frame_set(frame)
                bpy.context.view_layer.update()
                root = char["placement"]
                origin = world_to_camera_view(scene, camera, root.matrix_world.translation)
                facing = world_to_camera_view(scene, camera, root.matrix_world @ Vector((0, -1, 0)))
                delta = [float(facing.x - origin.x), float(origin.y - facing.y)]
                signs = {"north": (1, -1), "south": (1, 1), "east": (0, 1), "west": (0, -1)}
                axis, sign = signs[direction]
                if delta[axis] * sign <= .01:
                    raise RuntimeError(f"Actor heading is inverted: {direction}: {delta}")
                anchor = [float(origin.x), float(1 - origin.y)]
                if max(abs(anchor[i] - expected[i]) for i in (0, 1)) > 1e-5:
                    raise RuntimeError(f"Ground anchor drift: {anchor}")
                body = evaluated_bounds(scene, root)
                all_geometry = evaluated_bounds(scene, root, include_marker=True)
                bounds = all_geometry["bounds"]
                border = SETTINGS["camera"]["crop_border_pixels"] / 64
                if min(bounds["left"], bounds["top"], 1 - bounds["right"], 1 - bounds["bottom"]) < border:
                    raise RuntimeError(f"Crop guard failed: {direction} {frame}: {bounds}")
                records.append({"direction": direction, "camera": camera.name, "motion": motion,
                                "frame": frame, "ground_anchor_uv": anchor, "actor_forward_screen_delta": delta,
                                "body": body, "with_ground_marker": all_geometry})
    scene.frame_set(1)
    scene.camera = char["sprite_cameras"]["south"]
    return records


def inspect_glb(path, allowed_names, maximum):
    data = path.read_bytes()
    magic, version, size = struct.unpack_from("<4sII", data)
    json_size, kind = struct.unpack_from("<II", data, 12)
    if (magic, version, size, kind) != (b"glTF", 2, len(data), 0x4E4F534A):
        raise RuntimeError("Invalid GLB container")
    doc = json.loads(data[20:20 + json_size])
    nodes = [item.get("name") for item in doc.get("nodes", [])]
    unexpected = set(nodes) - set(allowed_names)
    if unexpected or len(doc.get("scenes", [])) != 1 or doc.get("images") or doc.get("textures"):
        raise RuntimeError(f"GLB isolation failed: unexpected={unexpected}, images={doc.get('images')}")
    triangles = 0
    for mesh in doc.get("meshes", []):
        for part in mesh["primitives"]:
            if part.get("mode", 4) != 4:
                raise RuntimeError("Non-triangle GLB primitive")
            accessor = doc["accessors"][part["indices"]] if "indices" in part else doc["accessors"][part["attributes"]["POSITION"]]
            if accessor["count"] % 3:
                raise RuntimeError("GLB triangle index count is not divisible by three")
            triangles += accessor["count"] // 3
    if triangles > maximum:
        raise RuntimeError(f"GLB triangle budget exceeded: {triangles} > {maximum}")
    external = [item.get("uri") for item in doc.get("buffers", []) if item.get("uri")]
    if external:
        raise RuntimeError(f"External GLB buffers: {external}")
    return {"scene_count": 1, "nodes": nodes, "mesh_names": [m.get("name") for m in doc.get("meshes", [])],
            "triangles": triangles, "material_names": [m.get("name") for m in doc.get("materials", [])],
            "animation_count": len(doc.get("animations", [])),
            "animation_channels": sum(len(a.get("channels", [])) for a in doc.get("animations", [])),
            "external_images": [], "external_buffers": [], "unexpected_nodes": []}


def export_glb(scene, char, path):
    for obj in scene.objects:
        obj.select_set(False)
    selected = [obj for obj in char["collection"].all_objects if not obj.hide_render and not obj.hide_viewport]
    for obj in selected:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = char["placement"]
    operator = bpy.ops.export_scene.gltf
    props = operator.get_rna_type().properties
    args = {"filepath": str(path), "use_selection": True, "use_active_scene": True}
    formats = {item.identifier for item in props["export_format"].enum_items}
    if not formats:
        import io_scene_gltf2
        formats = {item[0] for item in io_scene_gltf2.get_format_items(scene, bpy.context)}
    if "GLB" not in formats:
        raise RuntimeError(f"GLB format not available: {formats}")
    args["export_format"] = "GLB"
    for key, value in (("export_animations", True), ("export_frame_range", True),
                       ("export_force_sampling", True), ("export_apply", True),
                       ("export_cameras", False), ("export_lights", False)):
        if key in props:
            args[key] = value
    if "export_animation_mode" in props:
        choices = {item.identifier for item in props["export_animation_mode"].enum_items}
        if "SCENE" in choices:
            args["export_animation_mode"] = "SCENE"
    result = operator(**args)
    if "FINISHED" not in result:
        raise RuntimeError(f"GLB export failed: {result}")
    return inspect_glb(path, [obj.name for obj in selected], SETTINGS["evaluated_triangle_maximum"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    if not bpy.app.background:
        raise RuntimeError("A fresh background process is required")
    output = args.output.resolve()
    if HERE.parent not in output.parents or output.exists():
        raise RuntimeError("Output must be a new directory inside the isolated attempt")
    output.mkdir(parents=True)
    for name, control in SETTINGS["controls"].items():
        for kind in ("blend", "glb"):
            actual = file_record(HERE / "controls" / f"{name}.{kind}")
            if actual["sha256"] != control[kind + "_sha256"]:
                raise RuntimeError(f"Control changed: {name}.{kind}")
    source.build_materials("river")
    source.MATERIALS["team"]["team_zone"] = True
    manifest = {
        "status": "Generated standalone artifacts; fresh independent visual verdict pending",
        "authorship": "Original procedural geometry by GPT-6 Astra, Claude Riverworks Diorama direction",
        "license": "AGPL-3.0-only", "reference_imported": False, "external_images_in_models": [],
        "identity_commit": SETTINGS["identity_commit"], "identity_changes": [],
        "mechanics_changes": [], "runtime_integration": False, "settings": SETTINGS,
        "blender_version": bpy.app.version_string, "pid": os.getpid(), "argv": sys.argv,
        "sources": [file_record(path) for path in sorted(HERE.iterdir())
                    if path.is_file() and path.suffix in (".py", ".json", ".md")],
        "original_control_receipts": json.loads((HERE / "controls/receipt.json").read_text()),
        "characters": [],
    }
    for identifier, builder in (("coilblade", models.make_coilblade), ("mossguard", models.make_mossguard)):
        scene = bpy.data.scenes.new(models.PREFIX + identifier + "_editable")
        bpy.context.window.scene = scene
        char = builder(scene)
        studio(scene)
        models.animate(scene, char, SETTINGS["source_frames"])
        models.set_team(char, "river")
        saved_cameras(scene, char)
        geometry = source.mesh_receipt(char)
        if geometry["evaluated_triangles"] > SETTINGS["evaluated_triangle_maximum"]:
            raise RuntimeError(f"{identifier} exceeds evaluated triangle budget: {geometry}")
        if len(geometry["material_slots_used"]) > SETTINGS["material_maximum"]:
            raise RuntimeError(f"{identifier} exceeds material budget")
        projections = projection_receipt(scene, char)
        record = {"card_id": identifier, "scene": scene.name, "root_object": char["placement"].name,
                  "default_camera": scene.camera.name, "node_names": sorted(obj.name for obj in char["collection"].all_objects),
                  "geometry": geometry, "sprite_camera_contract": char["sprite_camera_spec"], "projections": projections}
        # Fail serialization before exports, saves, or a later rendering process.
        json.dumps(models.primitive(record), allow_nan=False)
        models.write_json(output / f"{identifier}-preflight.json", record)
        glb = output / f"{identifier}.glb"
        record["glb_inspection"] = export_glb(scene, char, glb)
        record["glb"] = file_record(glb)
        scene.frame_set(1)
        scene.camera = char["sprite_cameras"]["south"]
        scene["provenance"] = json.dumps(models.primitive({"identity_commit": SETTINGS["identity_commit"],
                                                         "original_geometry": True, "source_dir": str(HERE)}))
        blend = output / f"{identifier}.blend"
        bpy.data.libraries.write(str(blend), {scene}, fake_user=True)
        record["blend"] = file_record(blend)
        manifest["characters"].append(record)
    models.write_json(output / "manifest.json", manifest)
    print(json.dumps({"status": "generated", "output": str(output),
                      "characters": [{"card_id": r["card_id"], "triangles": r["geometry"]["evaluated_triangles"]}
                                     for r in manifest["characters"]]}))


if __name__ == "__main__":
    main()
