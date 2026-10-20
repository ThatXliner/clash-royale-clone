"""Render-only continuation from frozen models and 24 verified completed cells."""

import argparse
from array import array
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE))
import build_models as pipeline
import character_models as models
import native_preview as png

SETTINGS = pipeline.SETTINGS
DIRECTIONS = [name for name, _ in SETTINGS["camera"]["directions"]]
INPUTS = json.loads((HERE / "expected-inputs.json").read_text())
CONTROL_CONTEXT = json.loads((HERE / "canonical-control.json").read_text())
CONTROL_MANIFEST = json.loads((HERE / "canonical-original/manifest.json").read_text())


def find_character(identifier, require_contract):
    scenes = [scene for scene in bpy.data.scenes if scene.get("card_id") == identifier
              and scene.get("sprite_camera_contract")]
    if require_contract and len(scenes) != 1:
        raise RuntimeError(f"Expected one saved scene contract, found {len(scenes)}")
    scene = scenes[0] if scenes else bpy.context.scene
    bpy.context.window.scene = scene
    roots = [obj for obj in scene.objects if obj.get("card_id") == identifier
             and obj.get("forward_axis") == "-Y"]
    if len(roots) != 1:
        raise RuntimeError(f"Expected one placement root for {identifier}, found {len(roots)}")
    root = roots[0]
    objects = pipeline.descendants(root)
    collections = [collection for collection in root.users_collection
                   if objects.issubset(set(collection.all_objects))]
    if len(collections) != 1:
        raise RuntimeError(f"Cannot identify the single character collection for {identifier}")
    char = {"id": identifier, "placement": root, "collection": collections[0]}
    if require_contract:
        contract = json.loads(scene["sprite_camera_contract"])
        cameras = {}
        for direction, name in contract["camera_names"].items():
            camera = scene.objects.get(name)
            if camera is None or camera.type != "CAMERA" or camera.get("actor_facing") != direction:
                raise RuntimeError(f"Saved camera contract cannot resolve {direction}: {name}")
            cameras[direction] = camera
        char["sprite_cameras"] = cameras
        char["sprite_camera_spec"] = contract
    else:
        pipeline.saved_cameras(scene, char)
    return scene, char


def team_materials(char):
    return {material for obj in pipeline.descendants(char["placement"]) if obj.type == "MESH"
            for material in obj.data.materials
            if material and (material.get("team_zone") or material.name.split(".")[0] == "TEAM")}


def set_team(char, team):
    materials = team_materials(char)
    if len(materials) != 1:
        raise RuntimeError(f"Expected one TEAM material, found {len(materials)}")
    material = next(iter(materials))
    shader = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    pipeline.source.input_socket(shader, "Base Color").default_value = pipeline.source.linear_color(
        json.loads((HERE / "palette.json").read_text())["team_variants"][team])
    for obj in pipeline.descendants(char["placement"]):
        if obj.type == "MESH" and obj.get("team_variant"):
            obj.hide_render = obj["team_variant"] != team
            obj.hide_viewport = obj["team_variant"] != team
    char["placement"]["team_variant"] = team


def verify_saved(scene, char, blend):
    contract = char["sprite_camera_spec"]
    geometry = pipeline.source.mesh_receipt(char)
    if geometry["evaluated_triangles"] > SETTINGS["evaluated_triangle_maximum"]:
        raise RuntimeError("Saved model triangle budget failed")
    camera_records = []
    for direction, camera in char["sprite_cameras"].items():
        vector = camera.matrix_world.to_quaternion() @ Vector((0, 0, -1))
        elevation = math.degrees(math.atan2(-vector.z, math.hypot(vector.x, vector.y)))
        if abs(elevation - 50) > .001 or abs(camera.data.ortho_scale - 8.025) > .00001:
            raise RuntimeError("Saved fixed camera changed")
        camera_records.append({"direction": direction, "object_name": camera.name,
                               "elevation_degrees": elevation,
                               "orthographic_scale": camera.data.ortho_scale})
    if scene.camera.name != contract["camera_names"]["south"]:
        raise RuntimeError("Saved default camera is not south")
    projections = pipeline.projection_receipt(scene, char)
    mesh_names = sorted(obj.name for obj in pipeline.descendants(char["placement"]) if obj.type == "MESH")
    foreign = [obj.name for obj in scene.objects if obj.type == "MESH" and obj.name not in mesh_names]
    if foreign:
        raise RuntimeError(f"Saved scene includes foreign meshes: {foreign}")
    return {"card_id": char["id"], "blend": pipeline.file_record(blend), "scene": scene.name,
            "placement_object": char["placement"].name, "camera_records": camera_records,
            "geometry": geometry, "mesh_names": mesh_names, "foreign_meshes": foreign,
            "projections": projections}


def image_record(path):
    width, height, pixels = png.read_rgba(path)
    return {**pipeline.file_record(path), "width": width, "height": height,
            "alpha_bounds_16": png.bounds(width, height, pixels, 16),
            "alpha_bounds_128": png.bounds(width, height, pixels, 128)}


def render_cell(scene, char, raw_path, native_path, team, direction, frame, pose, kind):
    scene.camera = char["sprite_cameras"][direction]
    scene.frame_set(frame)
    scene.render.filepath = str(raw_path)
    bpy.context.view_layer.update()
    receipt = {
        "card_id": char["id"], "team": team, "direction": direction, "pose": pose,
        "frame": frame, "kind": kind, "scene": scene.name, "camera": scene.camera.name,
        "render_engine": scene.render.engine, "view_transform": scene.view_settings.view_transform,
        "evidence_origin": "fresh_render_in_repair",
        "render_pid": os.getpid(),
        "renderer_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "mesh_names": sorted(obj.name for obj in pipeline.descendants(char["placement"])
                             if obj.type == "MESH" and not obj.hide_render),
    }
    models.write_json(raw_path.with_suffix(".preflight.json"), receipt)
    bpy.ops.render.render(write_still=True, scene=scene.name)
    width, height, source = png.read_rgba(raw_path)
    if (width, height) != (256, 256):
        raise RuntimeError(f"Unexpected raw cell size: {width}x{height}")
    width, height, reduced = png.box(width, height, source, 4)
    png.png(native_path, width, height, reduced)
    if native_path.stat().st_size > SETTINGS["native_raster_maximum_bytes"]:
        raise RuntimeError("Native raster exceeds 1 MiB")
    return {**receipt, "raw": image_record(raw_path), "native": image_record(native_path)}


def mask_material(name, white):
    material = bpy.data.materials.new(models.PREFIX + name)
    material.use_nodes = True
    shader = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    color = (1, 1, 1, 1) if white else (0, 0, 0, 1)
    pipeline.source.input_socket(shader, "Base Color").default_value = (0, 0, 0, 1)
    pipeline.source.input_socket(shader, "Emission Color", "Emission").default_value = color
    pipeline.source.input_socket(shader, "Emission Strength").default_value = 1
    pipeline.source.input_socket(shader, "Roughness").default_value = 1
    return material


def activate_scene(scene):
    if bpy.context.window is None:
        raise RuntimeError("No Blender window context is available for color management")
    bpy.context.window.scene = scene
    if bpy.context.scene != scene:
        raise RuntimeError("Requested saved scene is not the active Blender scene")


def assign_view_transform(scene, expected):
    """Dynamic OCIO enums are validated by assignment in the saved scene context."""
    activate_scene(scene)
    try:
        scene.view_settings.view_transform = expected
    except (TypeError, ValueError) as error:
        raise RuntimeError(f"Cannot assign required view transform {expected!r} in {scene.name}: {error}") from error
    actual = scene.view_settings.view_transform
    if actual != expected:
        raise RuntimeError(f"View transform read-back mismatch: wanted {expected!r}, got {actual!r}")
    return actual


def mask_state(scene, char):
    return {
        "scene": scene.name,
        "view_transform": scene.view_settings.view_transform,
        "exposure": float(scene.view_settings.exposure),
        "look": scene.view_settings.look,
        "gamma": float(scene.view_settings.gamma),
        "mesh_materials": {
            obj.data.name: [mat.name if mat else None for mat in obj.data.materials]
            for obj in pipeline.descendants(char["placement"]) if obj.type == "MESH"
        },
        "visibility": {
            obj.name: [bool(obj.hide_render), bool(obj.hide_viewport)]
            for obj in pipeline.descendants(char["placement"]) if obj.type == "MESH"
        },
    }


def render_team_masks(scene, char, raw_dir=None, native_dir=None, probe_only=False):
    activate_scene(scene)
    before = mask_state(scene, char)
    white, black = mask_material("team_mask_white", True), mask_material("team_mask_black", False)
    team = team_materials(char)
    stored = [(obj.data, list(obj.data.materials)) for obj in pipeline.descendants(char["placement"])
              if obj.type == "MESH"]
    visibility = [(obj, bool(obj.hide_render), bool(obj.hide_viewport))
                  for obj in pipeline.descendants(char["placement"]) if obj.type == "MESH"]
    view_transform, exposure = scene.view_settings.view_transform, scene.view_settings.exposure
    look, gamma = scene.view_settings.look, scene.view_settings.gamma
    records = []
    compatibility = {"before": before, "probe_only": probe_only}
    try:
        compatibility["assigned_transform"] = assign_view_transform(scene, "Standard")
        scene.view_settings.exposure = 0
        if scene.view_settings.exposure != 0:
            raise RuntimeError("Mask exposure did not read back as zero")
        compatibility["assigned_exposure"] = float(scene.view_settings.exposure)
        for mesh, originals in stored:
            for index, original in enumerate(originals):
                mesh.materials[index] = white if original in team else black
        compatibility["assigned_materials"] = mask_state(scene, char)["mesh_materials"]
        json.dumps(models.primitive(compatibility), allow_nan=False)
        if not probe_only:
            models.write_json(raw_dir.parent / f"{char['id']}-mask-pass-preflight.json", compatibility)
            # Geometry variants differ, so both team mask rows are actual renders.
            for team_name in SETTINGS["teams"]:
                for obj in pipeline.descendants(char["placement"]):
                    if obj.type == "MESH" and obj.get("team_variant"):
                        obj.hide_render = obj["team_variant"] != team_name
                        obj.hide_viewport = obj["team_variant"] != team_name
                for direction in DIRECTIONS:
                    filename = f"{char['id']}-{team_name}-{direction}-team-mask.png"
                    records.append(render_cell(scene, char, raw_dir / filename, native_dir / filename,
                                               team_name, direction, 1, "idle", "team-mask"))
    finally:
        for mesh, originals in stored:
            for index, original in enumerate(originals):
                mesh.materials[index] = original
        for obj, hide_render, hide_viewport in visibility:
            obj.hide_render, obj.hide_viewport = hide_render, hide_viewport
        assign_view_transform(scene, view_transform)
        scene.view_settings.exposure = exposure
        scene.view_settings.look = look
        scene.view_settings.gamma = gamma
        after = mask_state(scene, char)
        if after != before:
            raise RuntimeError(f"Mask pass failed to restore saved scene state: {before} -> {after}")
        compatibility["after"] = after
        compatibility["restoration_exact"] = True
        compatibility["rendered_mask_count"] = len(records)
        if not probe_only:
            models.write_json(raw_dir.parent / f"{char['id']}-mask-pass-restoration.json", compatibility)
        for material in (white, black):
            if material.users != 0:
                raise RuntimeError(f"Mask-only material remains in use: {material.name}")
            bpy.data.materials.remove(material)
    return compatibility if probe_only else (records, compatibility)


def portrait(scene, char, output):
    data = bpy.data.cameras.new(models.PREFIX + char["id"] + "_portrait")
    pipeline.source.enum(data, "type", ("ORTHO",))
    camera = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(camera)
    pipeline.camera_at(camera, char["placement"].matrix_world.translation, 38, 18, 2.8, .95)
    scene.camera = camera
    scene.frame_set(1)
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.filepath = str(output)
    models.write_json(output.with_suffix(".preflight.json"),
                      {"scene": scene.name, "camera": camera.name, "frame": 1, "resolution": [512, 512]})
    bpy.ops.render.render(write_still=True, scene=scene.name)
    return image_record(output)


def enlarge(path, width, height, pixels):
    result = bytearray(width * height * 16 * 4)
    for y in range(height * 4):
        for x in range(width * 4):
            src, dst = ((y // 4) * width + x // 4) * 4, (y * width * 4 + x) * 4
            result[dst:dst + 4] = pixels[src:src + 4]
    png.png(path, width * 4, height * 4, result)


def sheet(output, name, rows, records, mode="color"):
    width, height = 256, len(rows) * 64
    pixels = bytearray([232, 226, 212, 255] * (width * height))
    for row, query in enumerate(rows):
        for column, direction in enumerate(DIRECTIONS):
            record = next(item for item in records if item["direction"] == direction
                          and all(item[key] == value for key, value in query.items()))
            w, h, cell = png.read_rgba(Path(record["native"]["path"]))
            if mode == "grayscale":
                for i in range(0, len(cell), 4):
                    value = round(.2126 * cell[i] + .7152 * cell[i + 1] + .0722 * cell[i + 2])
                    cell[i:i + 3] = bytes((value, value, value))
            png.stamp(pixels, width, column * 64, row * 64, w, h, cell, silhouette=mode == "silhouette")
    target = output / f"{name}.png"
    png.png(target, width, height, pixels)
    if target.stat().st_size > SETTINGS["native_raster_maximum_bytes"]:
        raise RuntimeError("Native sheet exceeds 1 MiB")
    enlarge(output / f"{name}-4x.png", width, height, pixels)
    return {"path": str(target), "columns": DIRECTIONS, "rows": rows, "mode": mode}


def arena_image(output, records):
    source = bpy.data.images.load(str(HERE / SETTINGS["arena_context"]["source"]), check_existing=False)
    width, height = SETTINGS["arena_context"]["width"], SETTINGS["arena_context"]["height"]
    source.scale(width, height)
    values = array("f", [0]) * (width * height * 4)
    source.pixels.foreach_get(values)
    pixels = bytearray(width * height * 4)
    for y in range(height):
        for x in range(width):
            src, dst = ((height - 1 - y) * width + x) * 4, (y * width + x) * 4
            for channel in range(3):
                pixels[dst + channel] = round(max(0, min(1, values[src + channel])) * 255)
            pixels[dst + 3] = 255
    bpy.data.images.remove(source)
    background = bytes(pixels)
    placements, row = [], 0
    for card in ("coilblade", "mossguard"):
        for team in SETTINGS["teams"]:
            for pose in SETTINGS["render_poses"]:
                for column, direction in enumerate(DIRECTIONS):
                    record = next(item for item in records if item["card_id"] == card and item["team"] == team
                                  and item["pose"] == pose and item["direction"] == direction
                                  and item["kind"] == "candidate")
                    anchor = [90 + column * 120, 115 + row * 60]
                    w, h, cell = png.read_rgba(Path(record["native"]["path"]))
                    png.stamp(pixels, width, anchor[0] - 32, anchor[1] - 54, w, h, cell)
                    placements.append({"card_id": card, "team": team, "pose": pose,
                                       "direction": direction, "ground_anchor": anchor})
                row += 1
    for card, team, x in (("coilblade", "river", 255), ("mossguard", "ember", 285)):
        record = next(item for item in records if item["card_id"] == card and item["team"] == team
                      and item["pose"] == "idle" and item["direction"] == "east"
                      and item["kind"] == "candidate")
        w, h, cell = png.read_rgba(Path(record["native"]["path"]))
        png.stamp(pixels, width, x - 32, 875 - 54, w, h, cell)
        placements.append({"card_id": card, "team": team, "pose": "idle", "direction": "east",
                           "ground_anchor": [x, 875], "adjacency_fixture": True})
    png.png(output / "arena-context-native-540x960.png", width, height, pixels)
    gray = bytearray(pixels)
    for i in range(0, len(gray), 4):
        value = round(.2126 * gray[i] + .7152 * gray[i + 1] + .0722 * gray[i + 2])
        gray[i:i + 3] = bytes((value, value, value))
    png.png(output / "arena-context-grayscale-540x960.png", width, height, gray)
    return {"source": pipeline.file_record(HERE / SETTINGS["arena_context"]["source"]),
            "background_resize": [width, height], "sprite_resize": None, "body_cell": [64, 64],
            "cell_ground_anchor": [32, 54], "placements": placements,
            "background_decoded_sha256": hashlib.sha256(background).hexdigest(),
            "kind": "Standalone 1:1 sprite composite on the accepted original painted arena; not a live-app capture"}


def verify_frozen_inputs():
    frozen = Path(INPUTS["frozen_attempt"])
    receipts = []
    for expected in INPUTS["inputs"]:
        path = frozen / expected["path"]
        actual = pipeline.file_record(path)
        if actual["sha256"] != expected["sha256"] or actual["bytes"] != expected["bytes"]:
            raise RuntimeError(f"Frozen input mismatch: {path}")
        receipts.append({"path": expected["path"], "sha256": actual["sha256"], "bytes": actual["bytes"]})
    frozen_receipt = INPUTS["original_frozen_receipt"]
    if pipeline.file_record(Path(frozen_receipt["path"]))["sha256"] != frozen_receipt["sha256"]:
        raise RuntimeError("Original frozen attempt receipt changed")
    for name in ("build_models.py", "character_models.py", "parameters.json", "palette.json", "native_preview.py"):
        if (HERE / name).read_bytes() != (frozen / "source" / name).read_bytes():
            raise RuntimeError(f"The repair changed a frozen helper or parameter input: {name}")
    for path in (HERE / "controls").iterdir():
        if not path.is_file():
            continue
        if path.read_bytes() != (frozen / "source/controls" / path.name).read_bytes():
            raise RuntimeError(f"The repair changed a frozen original control: {path.name}")
    return {"frozen_attempt": str(frozen), "input_count": len(receipts), "verified": receipts,
            "original_render_pid": INPUTS["original_render_pid"],
            "helper_geometry_palette_camera_controls_byte_identical": True}


def verify_canonical_control_inputs():
    receipts = []
    for expected in CONTROL_CONTEXT["canonical_control_files"] + CONTROL_CONTEXT["diagnostic_evidence"]:
        path = HERE / expected["path"]
        actual = pipeline.file_record(path)
        if (actual["bytes"], actual["sha256"]) != (expected["bytes"], expected["sha256"]):
            raise RuntimeError(f"Canonical control or diagnostic evidence changed: {path}")
        receipts.append(actual)
    combined = HERE / "canonical-original" / CONTROL_MANIFEST["blend"]["path"]
    if pipeline.file_record(combined)["sha256"] != CONTROL_MANIFEST["blend"]["sha256"]:
        raise RuntimeError("Combined control differs from its original manifest")
    for card, expected_hash in CONTROL_CONTEXT["expected_signatures_unchanged"].items():
        original = next(item for item in CONTROL_MANIFEST["characters"] if item["card_id"] == card)
        if original["explicit_geometry_sha256"] != expected_hash or (
                SETTINGS["controls"][card]["explicit_geometry_sha256"] != expected_hash):
            raise RuntimeError(f"The original expected control signature changed: {card}")
    return {"verified": receipts, "canonical_control_config": pipeline.file_record(HERE / "canonical-control.json"),
            "expected_signatures_unchanged": CONTROL_CONTEXT["expected_signatures_unchanged"],
            "acceptance_uses_zero_normalization": False}


def open_canonical_control(card, receipt_path):
    blend = HERE / "canonical-original" / CONTROL_MANIFEST["blend"]["path"]
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    roots = [obj for obj in bpy.data.objects if obj.get("card_id") == card and obj.get("forward_axis") == "-Y"]
    if len(roots) != 1:
        raise RuntimeError(f"Expected one original placement root for {card}: {[obj.name for obj in roots]}")
    root = roots[0]
    scenes = [scene for scene in bpy.data.scenes if root.name in scene.objects]
    objects = pipeline.descendants(root)
    collections = [collection for collection in root.users_collection
                   if objects.issubset(set(collection.all_objects))]
    if len(scenes) != 1 or len(collections) != 1:
        raise RuntimeError(f"Ambiguous original control context for {card}")
    scene, collection = scenes[0], collections[0]
    if scene.name != CONTROL_CONTEXT["canonical_control_scene"]:
        raise RuntimeError(f"Unexpected original scene: {scene.name}")
    activate_scene(scene)
    scene.frame_set(1, subframe=0)
    bpy.context.view_layer.update()
    bpy.context.evaluated_depsgraph_get().update()
    char = {"id": card, "placement": root, "collection": collection}
    original = next(item for item in CONTROL_MANIFEST["characters"] if item["card_id"] == card)
    fields = ("editable_mesh_objects", "base_mesh_triangles", "evaluated_triangles",
              "material_slots_used", "explicit_geometry_sha256")
    expected = {field: original[field] for field in fields}
    placement = models.primitive({"location": root.location, "scale": root.scale,
                                  "matrix_basis": root.matrix_basis, "matrix_world": root.matrix_world})
    actual = pipeline.source.mesh_receipt(char)
    receipt = {"card_id": card, "blend": pipeline.file_record(blend), "scene": scene.name,
               "context_scene": bpy.context.scene.name, "view_layer": bpy.context.view_layer.name,
               "frame": int(scene.frame_current), "subframe": float(scene.frame_subframe),
               "root": root.name, "collection": collection.name, "placement_before": placement,
               "expected": expected, "actual_before_staging": actual,
               "original_expected_signature_retained": True, "zero_normalization_used": False}
    models.write_json(receipt_path, receipt)
    if actual != expected:
        raise RuntimeError(f"Canonical original geometry changed before staging: {card}; see {receipt_path}")
    mesh_objects = {obj for obj in objects if obj.type == "MESH"}
    collection_meshes = {obj for obj in collection.all_objects if obj.type == "MESH"}
    if mesh_objects != collection_meshes:
        raise RuntimeError(f"Original collection contains meshes outside the selected hierarchy: {card}")
    if any(obj.hide_render for obj in mesh_objects):
        raise RuntimeError(f"Original selected control has hidden render geometry: {card}")
    # Preserve the original placement and local matrices. Only isolate the render visibility.
    hidden = []
    for obj in scene.objects:
        if obj.type == "MESH" and obj not in mesh_objects:
            obj.hide_render = True
            hidden.append(obj.name)
    pipeline.saved_cameras(scene, char)
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = 256
    scene.render.resolution_percentage = 100
    pipeline.source.enum(scene.render.image_settings, "file_format", ("PNG",))
    pipeline.source.enum(scene.render.image_settings, "color_mode", ("RGBA",))
    pipeline.source.enum(scene.render.image_settings, "color_depth", ("8",))
    bpy.context.view_layer.update()
    bpy.context.evaluated_depsgraph_get().update()
    projections = []
    for direction, camera in char["sprite_cameras"].items():
        scene.camera = camera
        origin = world_to_camera_view(scene, camera, root.matrix_world.translation)
        facing = world_to_camera_view(scene, camera, root.matrix_world @ Vector((0, -1, 0)))
        anchor = [float(origin.x), float(1 - origin.y)]
        delta = [float(facing.x - origin.x), float(origin.y - facing.y)]
        axis, sign = {"north": (1, -1), "south": (1, 1), "east": (0, 1), "west": (0, -1)}[direction]
        vector = camera.matrix_world.to_quaternion() @ Vector((0, 0, -1))
        elevation = math.degrees(math.atan2(-vector.z, math.hypot(vector.x, vector.y)))
        body = pipeline.evaluated_bounds(scene, root)
        bounds = body["bounds"]
        border = SETTINGS["camera"]["crop_border_pixels"] / 64
        record = {"direction": direction, "camera": camera.name, "ground_anchor_uv": anchor,
                  "actor_forward_screen_delta": delta, "elevation_degrees": elevation,
                  "orthographic_scale": camera.data.ortho_scale, "body": body}
        projections.append(record)
        receipt["projections"] = projections
        models.write_json(receipt_path, receipt)
        if max(abs(anchor[i] - SETTINGS["camera"]["ground_anchor_normalized"][i]) for i in (0, 1)) > 1e-5:
            raise RuntimeError(f"Original control ground anchor drift: {card} {direction}")
        if delta[axis] * sign <= .01 or abs(elevation - 50) > .001 or abs(camera.data.ortho_scale - 8.025) > .00001:
            raise RuntimeError(f"Original control heading or fixed camera changed: {card} {direction}")
        if min(bounds["left"], bounds["top"], 1 - bounds["right"], 1 - bounds["bottom"]) < border:
            raise RuntimeError(f"Original control crop guard failed: {card} {direction}")
    scene.camera = char["sprite_cameras"]["south"]
    receipt["hidden_foreign_meshes"] = sorted(hidden)
    receipt["sprite_camera_contract"] = char["sprite_camera_spec"]
    receipt["actual_after_staging"] = pipeline.source.mesh_receipt(char)
    receipt["placement_after"] = models.primitive({"location": root.location, "scale": root.scale,
                                                   "matrix_basis": root.matrix_basis, "matrix_world": root.matrix_world})
    models.write_json(receipt_path, receipt)
    if receipt["actual_after_staging"] != expected or json.dumps(receipt["placement_after"]) != json.dumps(placement):
        raise RuntimeError(f"Canonical original changed during render staging: {card}; see {receipt_path}")
    return scene, char, receipt


def carried_frames(raw_dir, native_dir):
    frozen = Path(INPUTS["frozen_attempt"])
    records = []
    for item in INPUTS["carried_frames"]:
        original_raw, original_native = frozen / item["raw"], frozen / item["native"]
        original_preflight = frozen / item["preflight"]
        raw, native = raw_dir / original_raw.name, native_dir / original_native.name
        shutil.copyfile(original_raw, raw)
        shutil.copyfile(original_native, native)
        shutil.copyfile(original_preflight, raw.with_suffix(".preflight.json"))
        metadata = json.loads(original_preflight.read_text())
        width, height, pixels = png.read_rgba(raw)
        w, h, reduced = png.box(width, height, pixels, 4)
        nw, nh, native_pixels = png.read_rgba(native)
        if (width, height, w, h, nw, nh) != (256, 256, 64, 64, 64, 64) or reduced != native_pixels:
            raise RuntimeError(f"Carried cell is not the exact fixed 4:1 reduction: {raw.name}")
        records.append({
            **metadata, "raw": image_record(raw), "native": image_record(native),
            "evidence_origin": "carried_forward_from_frozen_failed_attempt",
            "render_pid": INPUTS["original_render_pid"],
            "renderer_sha256": pipeline.file_record(frozen / "source/render_saved_assets.py")["sha256"],
            "original_raw": pipeline.file_record(original_raw),
            "original_native": pipeline.file_record(original_native),
            "original_preflight": pipeline.file_record(original_preflight),
            "source_proof": {
                "frozen_attempt": str(frozen),
                "source_unchanged_before_mask_failure": INPUTS["source_unchanged_before_mask_failure"],
                "actual_saved_log": str(frozen / "saved-inspection-and-render-stdout.txt"),
            },
        })
    if len(records) != 24:
        raise RuntimeError("Expected exactly 24 carried color views")
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--models", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    if not bpy.app.background or args.output.exists():
        raise RuntimeError("Use a fresh background process and new output directory")
    frozen = Path(INPUTS["frozen_attempt"])
    if args.models.resolve() != (frozen / "models").resolve():
        raise RuntimeError("This repair accepts only the exact frozen exported models")
    input_proof = verify_frozen_inputs()
    canonical_proof = verify_canonical_control_inputs()
    args.output.mkdir(parents=True)
    raw_dir, native_dir = args.output / "raw-256", args.output / "native-64"
    raw_dir.mkdir()
    native_dir.mkdir()
    report = {"status": "Executed render continuation; no independent visual verdict",
              "pid": os.getpid(), "argv": sys.argv, "blender_version": bpy.app.version_string,
              "reduction": "Fixed 4:1 alpha-weighted box, 256 to 64. No per-view crop or rescale.",
              "input_proof": input_proof, "canonical_control_proof": canonical_proof,
              "saved_assets": [], "compatibility_probes": [],
              "mask_pass_restorations": [], "renders": [], "portraits": [], "sheets": []}
    # Probe both exact saved scenes, all common poses, and mask round trips before any render.
    for card in ("coilblade", "mossguard"):
        blend = args.models / f"{card}.blend"
        bpy.ops.wm.open_mainfile(filepath=str(blend))
        scene, char = find_character(card, require_contract=True)
        validated = verify_saved(scene, char, blend)
        validated["team_pose_projections"] = {}
        for team in SETTINGS["teams"]:
            set_team(char, team)
            validated["team_pose_projections"][team] = pipeline.projection_receipt(scene, char)
        set_team(char, "river")
        compatibility = render_team_masks(scene, char, probe_only=True)
        models.write_json(args.output / f"{card}-saved-preflight.json", validated)
        models.write_json(args.output / f"{card}-mask-compatibility-probe.json", compatibility)
        report["saved_assets"].append(validated)
        report["compatibility_probes"].append(compatibility)
    report["control_preflight"] = []
    for card in ("coilblade", "mossguard"):
        scene, char, control = open_canonical_control(card, args.output / f"{card}-control-preflight.json")
        report["control_preflight"].append(control)
    models.write_json(args.output / "all-inputs-and-compatibility-preflight.json", report)
    report["renders"].extend(carried_frames(raw_dir, native_dir))
    models.write_json(args.output / "carried-frame-receipt.json", report["renders"])
    for card in ("coilblade", "mossguard"):
        blend = args.models / f"{card}.blend"
        before = pipeline.file_record(blend)
        bpy.ops.wm.open_mainfile(filepath=str(blend))
        scene, char = find_character(card, require_contract=True)
        scene.render.resolution_x = scene.render.resolution_y = 256
        if card == "mossguard":
            for team in SETTINGS["teams"]:
                set_team(char, team)
                for pose, frame in SETTINGS["render_poses"].items():
                    for direction in DIRECTIONS:
                        filename = f"{card}-{team}-{direction}-{pose}.png"
                        report["renders"].append(render_cell(scene, char, raw_dir / filename,
                                                             native_dir / filename, team, direction, frame, pose, "candidate"))
        masks, restoration = render_team_masks(scene, char, raw_dir, native_dir)
        report["renders"].extend(masks)
        report["mask_pass_restorations"].append(restoration)
        set_team(char, "river")
        report["portraits"].append(portrait(scene, char, args.output / f"{card}-three-quarter.png"))
        if pipeline.file_record(blend)["sha256"] != before["sha256"]:
            raise RuntimeError("Saved candidate changed during read-only rendering")
        models.write_json(args.output / "render-continuation-checkpoint.json", report)
    for card in ("coilblade", "mossguard"):
        blend = HERE / "canonical-original" / CONTROL_MANIFEST["blend"]["path"]
        before = pipeline.file_record(blend)
        scene, char, control = open_canonical_control(card, args.output / f"{card}-control-render-preflight.json")
        for team in SETTINGS["teams"]:
            set_team(char, team)
            for direction in DIRECTIONS:
                filename = f"control-{card}-{team}-{direction}-idle.png"
                report["renders"].append(render_cell(scene, char, raw_dir / filename, native_dir / filename,
                                                     team, direction, 1, "idle", "control"))
        if pipeline.file_record(blend)["sha256"] != before["sha256"]:
            raise RuntimeError("Frozen control file changed")
    for card in ("coilblade", "mossguard"):
        rows = [{"card_id": card, "team": team, "pose": pose, "kind": "candidate"}
                for team in SETTINGS["teams"] for pose in SETTINGS["render_poses"]]
        for mode in ("color", "grayscale", "silhouette"):
            report["sheets"].append(sheet(args.output, f"{card}-native-{mode}", rows, report["renders"], mode))
        rows = [{"card_id": card, "team": team, "pose": "idle", "kind": kind}
                for team in SETTINGS["teams"] for kind in ("control", "candidate")]
        report["sheets"].append(sheet(args.output, f"{card}-control-comparison", rows, report["renders"]))
        rows = [{"card_id": card, "team": team, "pose": "idle", "kind": "team-mask"}
                for team in SETTINGS["teams"]]
        report["sheets"].append(sheet(args.output, f"{card}-team-masks", rows, report["renders"]))
    report["arena_context"] = arena_image(args.output, report["renders"])
    report["native_render_count"] = len(report["renders"])
    report["carried_native_render_count"] = sum(item["evidence_origin"] == "carried_forward_from_frozen_failed_attempt"
                                               for item in report["renders"])
    report["fresh_native_render_count"] = sum(item["evidence_origin"] == "fresh_render_in_repair"
                                             for item in report["renders"])
    report["portrait_render_count"] = len(report["portraits"])
    if (report["native_render_count"], report["carried_native_render_count"],
            report["fresh_native_render_count"], report["portrait_render_count"]) != (80, 24, 56, 2):
        raise RuntimeError("Bounded continuation rendered an unexpected view count")
    report["inputs_unchanged_after_rendering"] = verify_frozen_inputs() == input_proof
    if not report["inputs_unchanged_after_rendering"]:
        raise RuntimeError("Frozen input proof changed during rendering")
    report["canonical_controls_and_diagnostics_unchanged"] = verify_canonical_control_inputs() == canonical_proof
    if not report["canonical_controls_and_diagnostics_unchanged"]:
        raise RuntimeError("Canonical control or diagnostic proof changed during rendering")
    models.write_json(args.output / "render-receipt.json", report)
    print(json.dumps({"status": "rendered", "native_views": len(report["renders"]),
                      "carried_native_views": 24, "fresh_native_views": 56,
                      "portraits": len(report["portraits"]), "visual_verdict": "pending independent critic"}))


if __name__ == "__main__":
    main()
