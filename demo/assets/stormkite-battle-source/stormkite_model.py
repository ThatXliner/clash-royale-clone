"""Original Stormkite: grounded otter lockkeeper with a tethered reed kite.

Source preparation only. This module has not been executed or visually reviewed.
Run only in an explicitly authorized fresh background Blender process.
All coordinates are artist units, never simulation distances or timing values.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


PREFIX = "STORMKITE_R1_"
DIRECTIONS = (("east", 270), ("north", 180), ("south", 0), ("west", 90))
ROWS = (("ember", "idle"), ("ember", "contact"), ("river", "idle"), ("river", "contact"))
PALETTE = {
    "fur": "#67503C", "cream": "#D9C6A2", "ink": "#211D1A",
    "wood": "#49392C", "copper": "#D4A04D", "reed": "#E8D9B4",
    "mint": "#9CB89A", "team": "#2E7F86",
}
TEAM_COLORS = {"ember": "#C6452E", "river": "#2E7F86"}
CAMERA = {
    "elevation_degrees": 50, "orthographic_scale": 8.025,
    "cell_size": 64, "raw_size": 256, "pivot": [32, 54],
}


def rgba(hex_color):
    values = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values) + (1,)


def material(name, color):
    mat = bpy.data.materials.new(PREFIX + name)
    mat.use_nodes = True
    shader = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = rgba(color)
    shader.inputs["Roughness"].default_value = .64 if name == "copper" else .88
    shader.inputs["Metallic"].default_value = .3 if name == "copper" else 0
    mat.diffuse_color = rgba(color)
    mat["palette_srgb"] = color
    return mat


def empty(collection, name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(PREFIX + name, None)
    collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    return obj


def mesh(collection, materials, name, vertices, faces, slot, parent):
    data = bpy.data.meshes.new(PREFIX + name)
    data.from_pydata(vertices, [], faces)
    data.materials.append(materials[slot])
    data.update()
    obj = bpy.data.objects.new(PREFIX + name, data)
    collection.objects.link(obj)
    obj.parent = parent
    return obj


def ball(c, name, center, radii, slot, parent=None, segments=10, rings=5):
    vertices = [(0, 0, -1)]
    for j in range(1, rings):
        latitude = -math.pi / 2 + math.pi * j / rings
        for i in range(segments):
            angle = math.tau * i / segments
            vertices.append((math.cos(latitude) * math.cos(angle), math.cos(latitude) * math.sin(angle), math.sin(latitude)))
    top = len(vertices)
    vertices.append((0, 0, 1))
    faces = [(0, 1 + (i + 1) % segments, 1 + i) for i in range(segments)]
    for j in range(rings - 2):
        a, b = 1 + j * segments, 1 + (j + 1) * segments
        faces.extend((a + i, a + (i + 1) % segments, b + (i + 1) % segments, b + i) for i in range(segments))
    last = 1 + (rings - 2) * segments
    faces.extend((last + i, last + (i + 1) % segments, top) for i in range(segments))
    vertices = [tuple(center[k] + radii[k] * v[k] for k in range(3)) for v in vertices]
    return mesh(c["collection"], c["materials"], name, vertices, faces, slot, parent or c["root"])


def rod(c, name, start, end, radius, slot, parent=None, end_radius=None, sides=6):
    start, end = Vector(start), Vector(end)
    axis = (end - start).normalized()
    cross = Vector((0, 0, 1)) if abs(axis.z) < .9 else Vector((0, 1, 0))
    u, v = axis.cross(cross).normalized(), None
    v = axis.cross(u).normalized()
    vertices = []
    for point, r in ((start, radius), (end, radius if end_radius is None else end_radius)):
        for i in range(sides):
            angle = math.tau * i / sides
            vertices.append(tuple(point + r * (u * math.cos(angle) + v * math.sin(angle))))
    faces = [tuple(reversed(range(sides))), tuple(range(sides, sides * 2))]
    faces.extend((i, (i + 1) % sides, (i + 1) % sides + sides, i + sides) for i in range(sides))
    return mesh(c["collection"], c["materials"], name, vertices, faces, slot, parent or c["root"])


def panel(c, name, points, slot, parent):
    return mesh(c["collection"], c["materials"], name, points, [tuple(range(len(points)))], slot, parent)


def make_keeper(c):
    root = c["root"]
    for side, x in (("left", -.16), ("right", .16)):
        ball(c, side + "_foot", (x, -.055, .075), (.13, .20, .075), "fur", rings=4)
    ball(c, "otter_tail_root", (0, .23, .16), (.17, .23, .12), "fur", rings=4)
    rod(c, "tapered_otter_tail", (0, .30, .16), (.16, .67, .08), .13, "fur", end_radius=.025, sides=8)
    ball(c, "coat_skirt", (0, .015, .43), (.34, .24, .33), "team")
    ball(c, "coat_shoulders", (0, -.005, .76), (.31, .22, .22), "team")
    ball(c, "cream_throat", (0, -.18, .87), (.16, .09, .19), "cream", rings=4)
    for side, x in (("left", -.24), ("right", .24)):
        rod(c, side + "_collar_trim", (x, -.17, .73), (x * .55, -.22, .94), .023, "copper")
    for index, z in enumerate((.44, .58, .72)):
        rod(c, "coat_toggle_" + str(index), (-.10, -.232, z), (.10, -.232, z), .026, "copper")
    head = empty(c["collection"], "head", (0, -.04, 1.10), root)
    c["rig"]["head"] = head
    ball(c, "otter_head", (0, 0, 0), (.29, .24, .24), "fur", head)
    for side, x in (("left", -.23), ("right", .23)):
        ball(c, side + "_round_ear", (x, .005, .16), (.095, .085, .10), "fur", head, rings=4)
        ball(c, side + "_ear_inset", (x, -.062, .165), (.05, .025, .055), "cream", head, rings=4)
    ball(c, "cream_cheeks", (0, -.165, -.055), (.235, .13, .14), "cream", head)
    for side, x in (("left", -.075), ("right", .075)):
        ball(c, side + "_muzzle_pad", (x, -.255, -.025), (.115, .08, .075), "cream", head, rings=4)
    ball(c, "otter_nose", (0, -.315, .018), (.065, .045, .05), "ink", head, segments=8, rings=4)
    for side, x in (("left", -.155), ("right", .155)):
        ball(c, side + "_eye", (x, -.202, .09), (.038, .027, .043), "ink", head, segments=8, rings=4)
    for side, x in (("left", -.34), ("right", .34)):
        arm = empty(c["collection"], side + "_arm", (x, -.02, .75), root)
        c["rig"][side + "_arm"] = arm
        rod(c, side + "_sleeve", (0, 0, 0), (x * .10, -.18, -.23), .11, "team", arm, end_radius=.09, sides=8)
        ball(c, side + "_paw", (x * .10, -.20, -.24), (.11, .10, .10), "fur", arm, rings=4)
    reel = empty(c["collection"], "reel", (-.28, -.29, .50), root)
    c["rig"]["reel"] = reel
    rod(c, "wood_reel_handle", (-.13, 0, 0), (.13, 0, 0), .065, "wood", reel, sides=8)
    for i, x in enumerate((-.10, .10)):
        rod(c, "copper_reel_flange_" + str(i), (x - .025, 0, 0), (x + .025, 0, 0), .14, "copper", reel, sides=12)
    rod(c, "braided_reel_winding", (-.07, 0, 0), (.07, 0, 0), .105, "copper", reel, sides=12)


def make_kite(c):
    kite = empty(c["collection"], "kite", (0, .12, 1.58), c["root"])
    c["rig"]["kite"] = kite
    corners = ((0, -.65, .16), (.84, 0, 0), (0, .62, -.14), (-.84, 0, 0))
    ridge = (0, 0, .15)
    for i, slot in enumerate(("reed", "team", "mint", "reed")):
        panel(c, "waxed_reed_facet_" + str(i), (ridge, corners[i], corners[(i + 1) % 4]), slot, kite)
    for i in range(4):
        rod(c, "copper_perimeter_" + str(i), corners[i], corners[(i + 1) % 4], .022, "copper", kite)
        rod(c, "copper_radial_rib_" + str(i), ridge, corners[i], .022, "copper", kite)
    for i in range(12):
        a, b = math.tau * i / 12, math.tau * (i + 1) / 12
        rod(c, "collector_ring_" + str(i), (.23 * math.cos(a), .23 * math.sin(a), .17),
            (.23 * math.cos(b), .23 * math.sin(b), .17), .018, "copper", kite, sides=5)
    for side in (-1, 1):
        panel(c, "reed_tail_" + str(side), ((side * .07, .50, -.12), (side * .15, .56, -.13),
              (side * .25, .94, -.40), (side * .12, .86, -.37)), "team" if side == 1 else "reed", kite)
    rod(c, "visible_braided_conductor_upper", (0, -.53, 1.74), (.13, -.33, 1.14), .018, "copper")
    rod(c, "visible_braided_conductor_lower", (.13, -.33, 1.14), (-.28, -.29, .50), .018, "copper")
    bead = ball(c, "contact_collector_bead", (0, -.53, 1.74), (.065, .065, .065), "cream", rings=4)
    c["rig"]["contact_bead"] = bead


def studio(scene, c):
    engines = scene.render.bl_rna.properties["engine"].enum_items.keys()
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    scene.render.resolution_x = scene.render.resolution_y = CAMERA["raw_size"]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure, scene.view_settings.gamma = 0, 1
    world = bpy.data.worlds.new(PREFIX + "world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (.23, .25, .29, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = .65
    scene.world = world
    for name, location, energy, size in (("key", (-3, -4, 7), 650, 5), ("fill", (4, 1, 5), 350, 4)):
        data = bpy.data.lights.new(PREFIX + name, "AREA")
        data.energy, data.shape, data.size = energy, "DISK", size
        obj = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector((0, 0, 1)) - obj.location).to_track_quat("-Z", "Y").to_euler()
    pitch = math.radians(CAMERA["elevation_degrees"])
    target_height = ((54 / 64 - .5) * CAMERA["orthographic_scale"] / math.cos(pitch))
    target = Vector((0, 0, target_height))
    for direction, degrees in DIRECTIONS:
        data = bpy.data.cameras.new(PREFIX + direction)
        data.type, data.ortho_scale = "ORTHO", CAMERA["orthographic_scale"]
        obj = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(obj)
        angle = math.radians(degrees)
        obj.location = target + Vector((8 * math.sin(angle) * math.cos(pitch), -8 * math.cos(angle) * math.cos(pitch), 8 * math.sin(pitch)))
        obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()
        obj["actor_facing"] = direction
        c["cameras"][direction] = obj
    scene.camera = c["cameras"]["south"]


def pose(c, action):
    if action not in ("idle", "contact"):
        raise ValueError("Only authored idle and contact poses exist")
    for obj in c["rig"].values():
        obj.rotation_euler = (0, 0, 0)
    # Static pose sample, with no authored duration or damage/contact authority.
    c["rig"]["right_arm"].rotation_euler.x = math.radians(-16 if action == "contact" else 0)
    c["rig"]["reel"].rotation_euler.x = math.radians(10 if action == "contact" else 0)
    c["rig"]["contact_bead"].hide_render = action != "contact"


def team(c, name):
    color = rgba(TEAM_COLORS[name])
    mat = c["materials"]["team"]
    shader = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = color
    mat.diffuse_color = color
    mat["palette_srgb"] = TEAM_COLORS[name]


def build():
    scene = bpy.data.scenes.new(PREFIX + "scene")
    bpy.context.window.scene = scene
    collection = bpy.data.collections.new(PREFIX + "model")
    scene.collection.children.link(collection)
    c = {"collection": collection, "materials": {key: material(key, value) for key, value in PALETTE.items()},
         "root": empty(collection, "canonical_ground_pivot"), "rig": {}, "cameras": {}}
    c["root"]["card_id"] = "stormkite"
    c["root"]["authorship"] = "Original procedural otter keeper and copper/reed kite; no reference assets"
    c["root"]["simulation_changes"] = "none; preserve existing QUESTION ground layer and chain policy"
    make_keeper(c)
    make_kite(c)
    pose(c, "idle")
    studio(scene, c)
    return scene, c


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--render", action="store_true", help="Render sixteen raw 256px frames after saving the model")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    if not bpy.app.background:
        raise RuntimeError("Use a fresh background Blender process")
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    scene, c = build()
    scene["sprite_contract"] = json.dumps({**CAMERA, "columns": [d for d, _ in DIRECTIONS], "rows": ROWS})
    model_path = output / "stormkite.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(model_path))
    files = []
    if args.render:
        raw = output / "raw-256"
        raw.mkdir()
        for team_name, action in ROWS:
            team(c, team_name)
            pose(c, action)
            for direction, _ in DIRECTIONS:
                scene.camera = c["cameras"][direction]
                bpy.context.view_layer.update()
                path = raw / f"stormkite-{team_name}-{direction}-{action}.png"
                scene.render.filepath = str(path)
                bpy.ops.render.render(write_still=True, scene=scene.name)
                files.append(path.name)
        team(c, "river")
        pose(c, "idle")
        scene.camera = c["cameras"]["south"]
    (output / "build-receipt.json").write_text(json.dumps({
        "card_id": "stormkite", "model": model_path.name, "rendered_frames": files,
        "source_commit": "3df9a311", "runtime_integration": False,
        "visual_verdict": "Independent rendered critique pending",
        "simulation_changes": False, "blender_version": bpy.app.version_string,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
