"""Original editable Moss & Ember character models, built in isolated Blender.

Run in a NEW background Blender process; this script refuses an interactive
session. It does not reset a scene, delete pre-existing data, or read reference/.
Every object is authored from the explicit coordinates below.
"""

from __future__ import annotations

import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
import bmesh
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


HERE = Path(__file__).resolve().parent
PREFIX = "ME_20261020_"
SOURCE_COMMIT = "c693d0cc0b36a3f1f179bbb93cb23998b68012b8"
TAU = math.tau
DEG = math.pi / 180
FRAMES = {
    "idle": (1, 11, 21, 31),
    "walk": (41, 51, 61, 71),
    "attack": (90, 96, 100, 106),
}
DIRECTIONS = (
    ("south", 0),
    ("south_west", 45),
    ("west", 90),
    ("north_west", 135),
    ("north", 180),
    ("north_east", 225),
    ("east", 270),
    ("south_east", 315),
)
MATERIALS = {}
PALETTE = {}
SPRITE_SCALE = 2.0
SPRITE_TARGET_HEIGHT = 1.04
SPRITE_ELEVATION = 50


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=HERE / "generated")
    parser.add_argument("--team", choices=("river", "ember"), default="river")
    parser.add_argument("--previews", action="store_true")
    parser.add_argument("--preview-size", type=int, default=256)
    parser.add_argument("--preview-set", choices=("quick", "full"), default="quick")
    parser.add_argument("--sprites", action="store_true")
    parser.add_argument("--samples", type=int, default=32)
    parser.add_argument("--engine", choices=("cycles", "eevee"), default="cycles")
    parser.add_argument("--sprite-size", type=int, default=128)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def enum(owner, property_name, preferences):
    current = getattr(owner, property_name)
    if current in preferences:
        return current
    available = {
        item.identifier
        for item in owner.bl_rna.properties[property_name].enum_items
    }
    for choice in preferences:
        if choice in available:
            setattr(owner, property_name, choice)
            return choice
    raise RuntimeError(f"No supported {property_name}: {sorted(available)}")


def linear_color(hex_color):
    rgb = [int(hex_color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
    return tuple(value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4
                 for value in rgb) + (1,)


def input_socket(node, *identifiers):
    return next((socket for socket in node.inputs if socket.identifier in identifiers), None)


def build_materials(team):
    global PALETTE
    PALETTE = json.loads((HERE / "palette.json").read_text())
    specifications = PALETTE["materials"]
    for key, specification in specifications.items():
        color = PALETTE["team_variants"][team] if key == "team" else specification["hex"]
        if specification.get("alias"):
            MATERIALS[key] = MATERIALS[specification["alias"]]
            continue
        mat = bpy.data.materials.new("TEAM" if key == "team" else PREFIX + key)
        mat.use_nodes = True
        shader = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
        rgba = linear_color(color)
        input_socket(shader, "Base Color").default_value = rgba
        input_socket(shader, "Roughness").default_value = specification["roughness"]
        input_socket(shader, "Metallic").default_value = specification["metallic"]
        if specification.get("emission", 0):
            color_socket = input_socket(shader, "Emission Color", "Emission")
            strength_socket = input_socket(shader, "Emission Strength")
            if color_socket is not None:
                color_socket.default_value = rgba
            if strength_socket is not None:
                strength_socket.default_value = specification["emission"]
        mat.diffuse_color = rgba
        mat["palette_srgb"] = color
        mat["authorship"] = "Original procedural material, Moss & Ember redesign"
        MATERIALS[key] = mat


def mesh(collection, name, vertices, faces, material, parent=None, smooth=False, bevel=0):
    data = bpy.data.meshes.new(PREFIX + name + "_mesh")
    data.from_pydata(vertices, [], faces)
    editable = bmesh.new()
    editable.from_mesh(data)
    bmesh.ops.recalc_face_normals(editable, faces=list(editable.faces))
    editable.to_mesh(data)
    editable.free()
    data.update()
    obj = bpy.data.objects.new(PREFIX + name, data)
    collection.objects.link(obj)
    obj.parent = parent
    data.materials.append(MATERIALS[material])
    for face in data.polygons:
        face.use_smooth = smooth
    if bevel:
        modifier = obj.modifiers.new("Rounded crafted edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        enum(modifier, "limit_method", ("ANGLE",))
    obj["authorship"] = "Original explicit-coordinate procedural mesh"
    return obj


def empty(collection, name, location=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(PREFIX + name, None)
    collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    obj.empty_display_size = .10
    enum(obj, "empty_display_type", ("PLAIN_AXES",))
    return obj


def ellipsoid(collection, name, center, radii, material, parent=None, segments=12, rings=8):
    vertices = [(0, 0, radii[2])]
    for ring in range(1, rings):
        latitude = math.pi * ring / rings
        for segment in range(segments):
            longitude = TAU * segment / segments
            vertices.append((
                radii[0] * math.sin(latitude) * math.cos(longitude),
                radii[1] * math.sin(latitude) * math.sin(longitude),
                radii[2] * math.cos(latitude),
            ))
    bottom = len(vertices)
    vertices.append((0, 0, -radii[2]))
    faces = []
    for segment in range(segments):
        following = (segment + 1) % segments
        faces.append((0, 1 + segment, 1 + following))
    for ring in range(rings - 2):
        first = 1 + ring * segments
        after = first + segments
        for segment in range(segments):
            following = (segment + 1) % segments
            faces.append((first + segment, after + segment, after + following, first + following))
    first = 1 + (rings - 2) * segments
    for segment in range(segments):
        faces.append((first + segment, bottom, first + (segment + 1) % segments))
    obj = mesh(collection, name, vertices, faces, material, parent, smooth=True)
    obj.location = center
    return obj


def lathe(collection, name, profile, material, parent=None, center=(0, 0, 0),
          depth=1, segments=20, smooth=True):
    vertices = []
    for z, radius in profile:
        for segment in range(segments):
            angle = TAU * segment / segments
            vertices.append((radius * math.cos(angle), radius * depth * math.sin(angle), z))
    faces = [tuple(reversed(range(segments)))]
    for ring in range(len(profile) - 1):
        for segment in range(segments):
            following = (segment + 1) % segments
            faces.append((
                ring * segments + segment,
                ring * segments + following,
                (ring + 1) * segments + following,
                (ring + 1) * segments + segment,
            ))
    faces.append(tuple((len(profile) - 1) * segments + segment for segment in range(segments)))
    obj = mesh(collection, name, vertices, faces, material, parent, smooth=smooth)
    obj.location = center
    return obj


def tube(collection, name, points, radius, material, parent=None, sides=8):
    points = [Vector(point) for point in points]
    vertices = []
    for index, point in enumerate(points):
        tangent = points[min(index + 1, len(points) - 1)] - points[max(index - 1, 0)]
        tangent.normalize()
        reference = Vector((0, 0, 1)) if abs(tangent.z) < .9 else Vector((0, 1, 0))
        normal = tangent.cross(reference).normalized()
        bitangent = tangent.cross(normal).normalized()
        for side in range(sides):
            angle = TAU * side / sides
            local_radius = radius[index] if isinstance(radius, (tuple, list)) else radius
            vertices.append(tuple(point + local_radius * (math.cos(angle) * normal + math.sin(angle) * bitangent)))
    faces = [tuple(reversed(range(sides)))]
    for index in range(len(points) - 1):
        for side in range(sides):
            following = (side + 1) % sides
            faces.append((index * sides + side, index * sides + following,
                          (index + 1) * sides + following, (index + 1) * sides + side))
    faces.append(tuple((len(points) - 1) * sides + side for side in range(sides)))
    return mesh(collection, name, vertices, faces, material, parent, smooth=True)


def spindle(collection, name, start, end, radius, material, parent=None, end_radius=None, sides=12):
    start = Vector(start)
    end = Vector(end)
    length = (end - start).length
    last = radius if end_radius is None else end_radius
    obj = lathe(collection, name, (
        (0, radius * .72), (length * .10, radius),
        (length * .85, last), (length, last * .72),
    ), material, parent, segments=sides)
    obj.location = start
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = (end - start).to_track_quat("Z", "Y")
    return obj


def prism(collection, name, outline, thickness, material, parent=None, center=(0, 0, 0), bevel=.015):
    """Outline lives in X/Z; the visible front surface faces negative Y."""
    vertices = [(x, -thickness / 2, z) for x, z in outline]
    vertices += [(x, thickness / 2, z) for x, z in outline]
    count = len(outline)
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, following + count, index + count))
    obj = mesh(collection, name, vertices, faces, material, parent, bevel=bevel)
    obj.location = center
    return obj


def leaf(collection, name, center, width, length, material, parent=None, roll=0):
    vertices = [
        (0, 0, length * .5), (-width * .36, -.025, length * .27),
        (-width * .5, -.02, -length * .02), (-width * .29, 0, -length * .25),
        (0, .025, -length * .5), (width * .30, 0, -length * .25),
        (width * .5, -.02, -length * .02), (width * .36, -.025, length * .27),
        (0, -.075, 0), (0, .035, 0),
    ]
    faces = [(index, (index + 1) % 8, 8) for index in range(8)]
    faces += [((index + 1) % 8, index, 9) for index in range(8)]
    obj = mesh(collection, name, vertices, faces, material, parent, smooth=False)
    obj.location = center
    obj.rotation_euler[1] = roll * DEG
    return obj


def ring(collection, name, center, radii, material, parent=None, radius=.025, axis="Z"):
    points = []
    for index in range(25):
        angle = TAU * index / 24
        a, b = radii[0] * math.cos(angle), radii[1] * math.sin(angle)
        points.append((a, b, 0) if axis == "Z" else ((a, 0, b) if axis == "Y" else (0, a, b)))
    obj = tube(collection, name, points, radius, material, parent, sides=6)
    obj.location = center
    return obj


def ellipse_band(collection, name, center, radii, height, material, parent=None):
    vertices = []
    for z in (-height / 2, height / 2):
        for index in range(32):
            angle = TAU * index / 32
            vertices.append((radii[0] * math.cos(angle), radii[1] * math.sin(angle), z))
    faces = [(index, (index + 1) % 32, (index + 1) % 32 + 32, index + 32) for index in range(32)]
    obj = mesh(collection, name, vertices, faces, material, parent, smooth=True)
    obj.location = center
    return obj


def rivet(collection, name, center, parent, radius=.028):
    return ellipsoid(collection, name, center, (radius, radius * .58, radius), "copper_light", parent,
                     segments=10, rings=6)


def character(scene, identifier, offset, scale, hover=0):
    collection = bpy.data.collections.new(PREFIX + identifier)
    scene.collection.children.link(collection)
    placement = empty(collection, identifier + "_placement", (offset, 0, 0))
    placement.scale = scale
    body = empty(collection, identifier + "_body", parent=placement)
    placement["card_id"] = identifier
    placement["forward_axis"] = "-Y"
    placement["ground_anchor"] = [0.0, 0.0, 0.0]
    placement["source_commit"] = SOURCE_COMMIT
    return {"id": identifier, "collection": collection, "placement": placement, "body": body,
            "rig": {}, "hover": hover}


def make_coilblade(scene):
    char = character(scene, "coilblade", -1.8, (.55, .55, .55))
    c, body, rig = char["collection"], char["body"], char["rig"]
    lathe(c, "coilblade_waist_core", ((.85, .18), (1.06, .18)), "verdigris", body, depth=.72)
    coil_points = [(math.cos(index * TAU / 16) * .21,
                    math.sin(index * TAU / 16) * .15, .85 + index * .0045) for index in range(49)]
    tube(c, "coilblade_three_turn_waist_coil", coil_points, .036, "copper_dark", body, sides=6)
    lathe(c, "coilblade_kiln_chest", (
        (1.00, .23), (1.12, .29), (1.35, .35), (1.49, .30), (1.53, .22),
    ), "copper", body, depth=.72)
    prism(c, "coilblade_chest_glint", ((-.15, -.18), (.16, -.07), (.21, .17), (-.13, .25)),
          .035, "copper_light", body, center=(0, -.238, 1.26), bevel=.025)
    ring(c, "coilblade_waist_rim", (0, 0, 1.04), (.27, .19), "copper_dark", body, radius=.042)
    ellipsoid(c, "coilblade_emberseed_socket", (0, -.274, 1.33), (.09, .04, .09), "iron", body)
    ellipsoid(c, "coilblade_emberseed", (0, -.306, 1.33), (.052, .025, .052), "ember", body)

    for side, x in (("left", -.19), ("right", .19)):
        hip = empty(c, "coilblade_" + side + "_hip", (x, .015, .99), body)
        hip.scale = (1, 1, 1.18)
        knee = empty(c, "coilblade_" + side + "_knee", (0, 0, -.28), hip)
        rig[side + "_hip"], rig[side + "_knee"] = hip, knee
        ellipsoid(c, "coilblade_" + side + "_hip_joint", (0, 0, 0), (.105, .10, .10), "iron", hip)
        spindle(c, "coilblade_" + side + "_thigh", (0, 0, -.03), (0, 0, -.26),
                .10, "copper", hip, end_radius=.075)
        ellipsoid(c, "coilblade_" + side + "_knee_joint", (0, -.008, 0), (.105, .105, .095), "copper_dark", knee)
        spindle(c, "coilblade_" + side + "_shin", (0, 0, -.03), (0, -.015, -.32),
                .078, "copper", knee, end_radius=.065)
        prism(c, "coilblade_" + side + "_shin_enamel",
              ((-.055, .02), (.055, .02), (.045, -.20), (-.035, -.23)),
              .018, "forest", knee, center=(0, -.083, -.06), bevel=.008)
        shoe = ellipsoid(c, "coilblade_" + side + "_boot", (0, -.10, -.42),
                         (.13, .245, .135), "copper_dark", knee)
        shoe.rotation_euler[2] = (-8 if side == "left" else 8) * DEG
        ellipsoid(c, "coilblade_" + side + "_toe_cap", (0, -.24, -.39),
                  (.12, .14, .09), "copper_light", knee)

    for side, x in (("left", -.37), ("right", .37)):
        shoulder = empty(c, "coilblade_" + side + "_shoulder", (x, 0, 1.43), body)
        elbow = empty(c, "coilblade_" + side + "_elbow", (0, 0, -.29), shoulder)
        wrist = empty(c, "coilblade_" + side + "_wrist", (0, 0, -.27), elbow)
        rig[side + "_shoulder"], rig[side + "_elbow"] = shoulder, elbow
        rig[side + "_wrist"] = wrist
        ellipsoid(c, "coilblade_" + side + "_shoulder_joint", (0, 0, 0),
                  (.14, .135, .135), "copper_dark", shoulder)
        ellipsoid(c, "coilblade_" + side + "_shoulder_cap", (0, -.055, .035),
                  (.165, .14, .12), "copper", shoulder)
        spindle(c, "coilblade_" + side + "_upper_arm", (0, 0, -.07), (0, 0, -.27),
                .075, "iron", shoulder)
        ellipsoid(c, "coilblade_" + side + "_elbow_joint", (0, 0, 0),
                  (.085, .09, .085), "copper_light", elbow)
        spindle(c, "coilblade_" + side + "_forearm", (0, 0, -.035), (0, 0, -.24),
                .105, "copper", elbow, end_radius=.075)
        ellipsoid(c, "coilblade_" + side + "_hand", (0, -.015, 0),
                  (.10, .09, .12), "copper_dark", wrist)
        for finger in range(3):
            spindle(c, "coilblade_" + side + f"_finger_{finger}",
                    ((finger - 1) * .047, -.075, .035),
                    ((finger - 1) * .047, -.08, -.075), .026, "copper_light", wrist, sides=8)

    head = empty(c, "coilblade_head", (0, -.012, 1.77), body)
    head.scale = (.84, .84, .84)
    rig["head"] = head
    lathe(c, "coilblade_cracked_bell_head", (
        (-.23, .27), (-.16, .31), (.05, .285), (.23, .205), (.29, .10), (.30, .045),
    ), "copper", head, depth=.78, segments=24)
    ring(c, "coilblade_bell_lip", (0, 0, -.195), (.295, .228), "copper_dark", head, radius=.034)
    ellipsoid(c, "coilblade_single_eye_socket", (.07, -.224, -.015),
              (.145, .055, .145), "iron", head)
    ring(c, "coilblade_single_eye_rim", (.07, -.266, -.015), (.124, .124),
         "copper_light", head, radius=.027, axis="Y")
    ellipsoid(c, "coilblade_single_eye_lens", (.07, -.283, -.015),
              (.094, .035, .094), "ember", head)
    ring(c, "coilblade_cast_hanging_loop", (0, .015, .34), (.073, .078),
         "copper_dark", head, radius=.026, axis="Y")
    tube(c, "coilblade_kiln_crack",
         ((-.10, -.09, .282), (-.15, -.15, .20), (-.12, -.20, .13),
          (-.18, -.23, .08), (-.16, -.236, -.08), (-.21, -.219, -.19)),
         .016, "ember", head, sides=6)
    ring(c, "coilblade_left_winding_disc", (-.29, .025, 0), (.13, .13),
         "copper_dark", head, radius=.045, axis="X")
    ellipsoid(c, "coilblade_winding_pin", (-.32, .025, 0), (.035, .045, .045), "copper_light", head)

    lathe(c, "coilblade_scarf_collar", ((1.48, .23), (1.55, .31), (1.62, .24)),
          "forest", body, depth=.83)
    prism(c, "coilblade_scarf_front",
          ((-.25, .08), (.25, .04), (.17, -.11), (0, -.20), (-.20, -.07)),
          .045, "forest", body, center=(0, -.25, 1.51), bevel=.025)
    for name, y in (("front", -.23), ("back", .23)):
        prism(c, "coilblade_team_tabard_" + name,
              ((-.16, .19), (.16, .19), (.17, -.15), (0, -.25), (-.17, -.15)),
              .035, "team", body, center=(0, y, .90), bevel=.015)
    tail = empty(c, "coilblade_scarf_tail", (-.18, .16, 1.56), body)
    rig["scarf"] = tail
    prism(c, "coilblade_scarf_tail_upper",
          ((0, .05), (-.18, .11), (-.58, .04), (-.78, -.13), (-.45, -.10), (-.14, -.05)),
          .055, "forest", tail, bevel=.025)
    prism(c, "coilblade_scarf_tail_secondary",
          ((-.10, -.03), (-.32, -.03), (-.62, -.27), (-.34, -.22)),
          .045, "forest", tail, center=(0, .08, 0), bevel=.02)
    wind_key = empty(c, "coilblade_wind_key", (0, .28, 1.36), body)
    rig["wind_key"] = wind_key
    for side, x in (("left", -.08), ("right", .08)):
        ring(c, "coilblade_wind_key_" + side, (x, .025, 0), (.075, .05),
             "copper_dark", wind_key, radius=.02, axis="Y")

    sword = empty(c, "coilblade_sword", (0, -.10, 0), rig["right_wrist"])
    rig["weapon"] = sword
    spindle(c, "coilblade_sword_grip", (0, 0, -.12), (0, 0, .09), .05, "forest", sword)
    ellipsoid(c, "coilblade_sword_pommel", (0, 0, -.15), (.075, .065, .06), "copper_light", sword)
    lathe(c, "coilblade_sword_disc_guard", ((.08, .13), (.13, .14), (.17, .10)),
          "copper", sword, depth=.8, segments=16)
    blade_outline = ((-.07, 0), (.075, 0), (.12, .55), (.22, .86), (.37, 1.11),
                     (.16, 1.00), (.02, .76), (-.06, .47))
    prism(c, "coilblade_sunrise_blade", blade_outline, .055, "blade_edge", sword,
          center=(0, 0, .19), bevel=.008)
    prism(c, "coilblade_blade_spine",
          ((-.052, .04), (-.012, .04), (.045, .55), (.13, .81), (.28, 1.015),
           (.15, .93), (.035, .73), (-.038, .45)),
          .061, "copper", sword, center=(0, 0, .19), bevel=.006)
    for index, z in enumerate((.40, .66, .88)):
        tube(c, f"coilblade_blade_join_{index}",
             ((.012 + .04 * index, -.034, z), (.085 + .06 * index, -.034, z + .012)),
             .009, "copper_dark", sword, sides=6)
    char["height"] = 1.15
    char["role"] = "Existing single-target ground melee duelist"
    return char


def make_mossguard(scene):
    char = character(scene, "mossguard", 0, (.60, .54, .46))
    c, body, rig = char["collection"], char["body"], char["rig"]
    lathe(c, "mossguard_bough_torso", (
        (.49, .32), (.66, .43), (.91, .48), (1.18, .49), (1.37, .36),
    ), "wood", body, depth=.69, segments=12, smooth=False)
    prism(c, "mossguard_chest_heartwood",
          ((-.18, -.28), (.13, -.26), (.25, .10), (.11, .33), (-.18, .24), (-.27, -.05)),
          .08, "wood_light", body, center=(0, -.286, .98), bevel=.035)
    tube(c, "mossguard_chest_grain",
         ((.03, -.34, .72), (-.03, -.35, .91), (.04, -.35, 1.08), (.015, -.34, 1.23)),
         .016, "wood_dark", body, sides=6)
    ring(c, "mossguard_root_belt", (0, 0, .69), (.43, .30), "wood_dark", body, radius=.055)
    rivet(c, "mossguard_belt_fastener", (.13, -.31, .70), body, radius=.055)
    for side, x in (("left", -.25), ("right", .25)):
        hip = empty(c, "mossguard_" + side + "_hip", (x, .01, .60), body)
        knee = empty(c, "mossguard_" + side + "_knee", (0, 0, -.18), hip)
        rig[side + "_hip"], rig[side + "_knee"] = hip, knee
        spindle(c, "mossguard_" + side + "_thigh", (0, 0, .035), (0, 0, -.17),
                .19, "wood", hip, end_radius=.16, sides=9)
        spindle(c, "mossguard_" + side + "_root_shin", (0, 0, .03), (0, -.03, -.27),
                .165, "wood", knee, end_radius=.18, sides=9)
        ellipsoid(c, "mossguard_" + side + "_root_foot", (0, -.12, -.285),
                  (.22, .29, .14), "wood_dark", knee, segments=12, rings=8)
        for toe in range(3):
            ellipsoid(c, "mossguard_" + side + f"_toe_{toe}",
                      ((toe - 1) * .115, -.29, -.275),
                      (.065, .14, .10), "wood_light", knee, segments=10, rings=6)
        leaf(c, "mossguard_" + side + "_ankle_leaf", (.09 if side == "left" else -.09, -.15, -.12),
             .20, .31, "moss", knee, roll=18 if side == "left" else -18)

    for side, x in (("left", -.48), ("right", .48)):
        shoulder = empty(c, "mossguard_" + side + "_shoulder", (x, 0, 1.22), body)
        elbow = empty(c, "mossguard_" + side + "_elbow", (0, 0, -.27), shoulder)
        hand = empty(c, "mossguard_" + side + "_hand", (0, 0, -.24), elbow)
        rig[side + "_shoulder"], rig[side + "_elbow"], rig[side + "_hand"] = shoulder, elbow, hand
        ellipsoid(c, "mossguard_" + side + "_shoulder_knot", (0, 0, 0),
                  (.20, .20, .18), "wood", shoulder, segments=12, rings=8)
        spindle(c, "mossguard_" + side + "_upper_branch", (0, 0, -.025), (0, 0, -.26),
                .17, "wood", shoulder, end_radius=.14, sides=9)
        spindle(c, "mossguard_" + side + "_forearm", (0, 0, .035), (0, 0, -.22),
                .15, "wood", elbow, end_radius=.18, sides=9)
        ellipsoid(c, "mossguard_" + side + "_root_fist", (0, -.02, 0),
                  (.19, .17, .18), "wood", hand, segments=12, rings=8)
        for finger in range(3):
            ellipsoid(c, "mossguard_" + side + f"_knuckle_{finger}",
                      ((finger - 1) * .09, -.13, .03),
                      (.055, .065, .09), "wood_light", hand, segments=10, rings=6)

    head = empty(c, "mossguard_head", (0, -.025, 1.59), body)
    rig["head"] = head
    ellipsoid(c, "mossguard_head_bough", (0, 0, 0), (.28, .235, .33),
              "wood", head, segments=16, rings=10)
    prism(c, "mossguard_pale_heartwood_face",
          ((-.15, .25), (.10, .28), (.23, .12), (.21, -.20),
           (.06, -.29), (-.14, -.23), (-.22, -.02), (-.20, .15)),
          .08, "wood_light", head, center=(0, -.202, 0), bevel=.04)
    for side, x in (("left", -.102), ("right", .103)):
        eye = ellipsoid(c, "mossguard_" + side + "_eye_socket", (x, -.254, .015),
                        (.061, .026, .078), "socket", head)
        eye.rotation_euler[1] = (8 if side == "left" else -8) * DEG
        ellipsoid(c, "mossguard_" + side + "_eye_catchlight", (x - .013, -.276, .035),
                  (.017, .012, .021), "wood_light", head, segments=10, rings=6)
    tube(c, "mossguard_face_grain",
         ((.018, -.251, -.22), (-.012, -.257, -.10), (.015, -.257, .07), (.008, -.248, .23)),
         .012, "wood", head, sides=6)
    tube(c, "mossguard_gentle_mouth",
         ((-.075, -.252, -.143), (0, -.267, -.16), (.075, -.252, -.143)),
         .012, "wood_dark", head, sides=6)
    tube(c, "mossguard_crown_twig", ((.04, 0, .25), (.09, .025, .43), (.04, .03, .54)),
         .027, "wood_dark", head)
    leaf(c, "mossguard_crown_leaf_left", (-.055, .025, .40), .20, .35, "leaf_light", head, roll=-48)
    leaf(c, "mossguard_crown_leaf_right", (.17, .04, .48), .18, .33, "moss", head, roll=40)

    mantle = empty(c, "mossguard_mantle", (0, 0, 1.33), body)
    rig["mantle"] = mantle
    for index, (x, y, z, width, length, roll, material) in enumerate((
        (-.46, -.12, -.01, .37, .55, -46, "forest"),
        (-.29, -.25, -.06, .36, .55, -23, "moss"),
        (-.08, -.32, -.11, .34, .57, -8, "forest"),
        (.15, -.31, -.08, .36, .56, 14, "moss"),
        (.39, -.18, -.01, .37, .53, 38, "forest"),
        (-.42, .20, -.04, .37, .59, -35, "moss"),
        (-.15, .31, -.09, .39, .66, -10, "forest"),
        (.16, .31, -.09, .40, .63, 13, "moss"),
        (.42, .16, -.04, .37, .57, 37, "forest"),
    )):
        leaf(c, f"mossguard_mantle_leaf_{index}", (x, y, z), width, length,
             "moss" if material == "forest" else material, mantle, roll)
    for index, (x, roll) in enumerate(((-.31, -25), (0, 5), (.30, 28))):
        leaf(c, f"mossguard_leaf_collar_{index}", (x, -.27, .09), .27, .37, "leaf_light", mantle, roll)
    leaf(c, "mossguard_back_leaf", (0, .355, -.09), .37, .64, "moss", mantle)
    leaf(c, "mossguard_chest_leaf", (.14, -.365, -.10), .30, .47, "leaf_light", mantle, 14)

    shield = empty(c, "mossguard_bough_shield", (-.13, -.22, .18), rig["left_hand"])
    rig["shield"] = shield
    outline = ((-.37, .31), (-.24, .52), (.02, .64), (.28, .44), (.36, .13),
               (.25, -.28), (0, -.65), (-.28, -.31), (-.39, .02))
    prism(c, "mossguard_shield_team_rim", outline, .15, "team", shield, bevel=.035)
    inset = tuple((x * .76, z * .84) for x, z in outline)
    prism(c, "mossguard_shield_heartwood", inset, .045, "wood_light", shield,
          center=(0, -.093, .01), bevel=.025)
    panel = tuple((x * .60, z * .69) for x, z in outline)
    prism(c, "mossguard_shield_pressed_leaf", panel, .045, "leaf_light", shield,
          center=(0, -.124, .018), bevel=.02)
    tube(c, "mossguard_shield_leaf_spine",
         ((0, -.184, -.48), (.015, -.184, -.18), (-.01, -.184, .16), (.025, -.184, .49)),
         .025, "moss", shield)
    for index, (x, z) in enumerate(((-.22, .22), (.22, .29), (-.18, -.11), (.18, -.06))):
        tube(c, f"mossguard_shield_leaf_vein_{index}",
             ((0, -.182, z - .10), (x * .60, -.182, z), (x, -.17, z + .07)),
             .018, "moss", shield, sides=6)
    for index, (x, z) in enumerate(((-.26, .32), (.22, .38), (-.21, -.23), (.19, -.20))):
        ellipsoid(c, f"mossguard_shield_wood_pin_{index}", (x, -.15, z),
                  (.029, .02, .029), "wood_light", shield, segments=8, rings=6)
    char["height"] = 1.03
    char["role"] = "Existing single-target ground melee grove keeper"
    return char


def make_copperskiff(scene):
    char = character(scene, "copperskiff", 1.8, (.50, .59, .45), hover=.80)
    c, body, rig = char["collection"], char["body"], char["rig"]
    hull = empty(c, "copperskiff_kettle_hull", (0, 0, .64), body)
    rig["hull"] = hull
    vertices = []
    sections = (
        (-.85, .045, .055, .08), (-.69, .29, .19, .02), (-.36, .43, .25, 0),
        (.24, .40, .24, 0), (.64, .27, .18, .05), (.78, .065, .055, .11),
    )
    sides = 16
    for y, width, height, z in sections:
        for side in range(sides):
            angle = TAU * side / sides
            vertices.append((width * math.cos(angle), y, z + height * math.sin(angle)))
    faces = [tuple(reversed(range(sides)))]
    for index in range(len(sections) - 1):
        for side in range(sides):
            following = (side + 1) % sides
            faces.append((index * sides + side, index * sides + following,
                          (index + 1) * sides + following, (index + 1) * sides + side))
    faces.append(tuple((len(sections) - 1) * sides + side for side in range(sides)))
    mesh(c, "copperskiff_copper_kettle_shell", vertices, faces, "copper", hull, smooth=True)
    ring(c, "copperskiff_copper_gunwale", (0, -.015, .16), (.39, .75),
         "copper_light", hull, radius=.042)
    ellipsoid(c, "copperskiff_wood_deck", (0, -.015, .18), (.365, .70, .055), "wood_dark", hull)
    ellipse_band(c, "copperskiff_team_hull_band", (0, -.03, -.08), (.405, .65),
                 .13, "team", hull)

    for side, x in (("left", -.414), ("right", .414)):
        port = empty(c, "copperskiff_" + side + "_port", (x, -.18, .01), hull)
        port.rotation_euler[2] = (-90 if side == "left" else 90) * DEG
        ring(c, "copperskiff_" + side + "_window_rim", (0, 0, 0), (.13, .13),
             "copper_light", port, radius=.034, axis="Y")
        ellipsoid(c, "copperskiff_" + side + "_window", (0, .008, 0), (.105, .022, .105), "iron", port)
        ellipsoid(c, "copperskiff_" + side + "_window_light", (-.025, -.014, .025),
                  (.058, .015, .061), "ember", port)
        for index, y in enumerate((-.47, .15, .46)):
            ellipsoid(c, "copperskiff_" + side + f"_shell_rivet_{index}", (x * .91, y, .10),
                      (.025, .025, .025), "copper_light", hull, segments=8, rings=6)

    nozzle = empty(c, "copperskiff_bow_nozzle", (0, -.70, -.025), hull)
    rig["nozzle"] = nozzle
    tube(c, "copperskiff_curved_kettle_spout",
         ((0, .015, 0), (0, -.08, .025), (0, -.16, .09), (0, -.21, .18)),
         (.10, .09, .072, .064), "copper", nozzle, sides=12)
    mouth = ellipsoid(c, "copperskiff_spout_opening", (0, -.214, .185),
                      (.047, .022, .044), "socket", nozzle)
    mouth.rotation_euler[0] = -45 * DEG
    tube(c, "copperskiff_kettle_handle",
         ((-.19, .56, .12), (-.23, .65, .30), (0, .70, .39), (.23, .65, .30), (.19, .56, .12)),
         .04, "copper_dark", hull)
    lathe(c, "copperskiff_kettle_lid", ((0, .14), (.04, .17), (.09, .10)),
          "copper_light", hull, center=(0, .20, .18), depth=1, segments=16)
    ellipsoid(c, "copperskiff_lid_knob", (0, .20, .30), (.055, .055, .055), "wood_dark", hull)

    balloon = empty(c, "copperskiff_canvas_balloon", (0, .025, 1.73), body)
    rig["balloon"] = balloon
    segments, rings = 24, 18
    vertices = [(0, -1.02, 0)]
    for row in range(1, rings):
        along = math.pi * row / rings
        y = -1.02 * math.cos(along)
        for segment in range(segments):
            angle = TAU * segment / segments
            radius = math.sin(along)
            vertices.append((.64 * radius * math.cos(angle), y, .57 * radius * math.sin(angle)))
    end = len(vertices)
    vertices.append((0, 1.02, 0))
    faces = [(0, 1 + (segment + 1) % segments, 1 + segment) for segment in range(segments)]
    for row in range(rings - 2):
        first, after = 1 + row * segments, 1 + (row + 1) * segments
        for segment in range(segments):
            following = (segment + 1) % segments
            faces.append((first + segment, first + following, after + following, after + segment))
    first = 1 + (rings - 2) * segments
    faces.extend((first + segment, first + (segment + 1) % segments, end) for segment in range(segments))
    envelope = mesh(c, "copperskiff_sewn_canvas_envelope", vertices, faces, "canvas", balloon, smooth=True)
    envelope.data.materials.append(MATERIALS["canvas_shade"])
    envelope.data.materials.append(MATERIALS["team"])
    for polygon in envelope.data.polygons:
        center_y = sum(envelope.data.vertices[index].co.y for index in polygon.vertices) / len(polygon.vertices)
        center_x = sum(envelope.data.vertices[index].co.x for index in polygon.vertices) / len(polygon.vertices)
        polygon.material_index = 1 if center_y > .45 and center_x < -.10 else 0
    for index, angle in enumerate((20, 70, 120, 170, 220, 270, 320)):
        angle *= DEG
        points = []
        for step in range(25):
            along = math.pi * step / 24
            points.append((.647 * math.sin(along) * math.cos(angle),
                           -1.024 * math.cos(along), .577 * math.sin(along) * math.sin(angle)))
        tube(c, f"copperskiff_canvas_seam_{index}", points, .016, "canvas_shade", balloon, sides=6)
    for index, y in enumerate((-.72, -.28, .28, .72)):
        radius = math.sqrt(1 - (y / 1.02) ** 2)
        ring(c, f"copperskiff_copper_balloon_hoop_{index}", (0, y, 0),
             (.65 * radius, .58 * radius), "copper_dark", balloon, radius=.024, axis="Y")
    for side, x in (("left", -.32), ("right", .32)):
        for index, y in enumerate((-.46, .45)):
            tube(c, "copperskiff_" + side + f"_rigging_{index}",
                 ((x, y, .83), (x * 1.48, y * 1.18, 1.35)),
                 .021, "wood_dark", body, sides=6)
            rivet(c, "copperskiff_" + side + f"_rigging_fastener_{index}", (x, y, .84), body)
    for index, y in enumerate((-1.025, 1.025)):
        ellipsoid(c, f"copperskiff_balloon_endcap_{index}", (0, y, 0), (.09, .045, .09), "copper", balloon)

    flag = empty(c, "copperskiff_flag", (0, .12, 2.29), body)
    rig["flag"] = flag
    tube(c, "copperskiff_flag_mast", ((0, 0, -.10), (0, 0, .26)), .025, "copper_dark", flag)
    pennant = leaf(c, "copperskiff_leaf_pennant", (0, .17, .17), .18, .37, "team", flag, roll=-70)
    pennant.rotation_euler[2] = math.pi / 2
    rudder = empty(c, "copperskiff_leaf_rudder", (0, .88, 1.63), body)
    rig["rudder"] = rudder
    fin = leaf(c, "copperskiff_rudder_canvas", (0, .15, .06), .50, .58, "canvas", rudder, roll=-18)
    fin.rotation_euler[2] = 90 * DEG
    tube(c, "copperskiff_rudder_spar", ((0, -.04, -.23), (0, .19, .07), (0, .28, .37)),
         .027, "wood_dark", rudder)
    spindle(c, "copperskiff_pusher_propeller_shaft", (0, .66, .70), (0, .93, .70),
            .045, "copper_dark", body)
    prop = empty(c, "copperskiff_pusher_propeller", (0, .95, .70), body)
    rig["propeller"] = prop
    ellipsoid(c, "copperskiff_pusher_propeller_hub", (0, 0, 0),
              (.07, .05, .07), "copper_light", prop)
    for blade_index in range(3):
        pivot = empty(c, f"copperskiff_propeller_blade_pivot_{blade_index}", parent=prop)
        pivot.rotation_euler[1] = blade_index * TAU / 3
        leaf(c, f"copperskiff_propeller_blade_{blade_index}",
             (0, 0, .16), .14, .31, "copper", pivot, roll=15)
    char["height"] = 1.50
    char["role"] = "Existing flying ranged unit targeting ground and air"
    return char


def angles(obj, x=0, y=0, z=0):
    obj.rotation_euler = (x * DEG, y * DEG, z * DEG)


def pose(char, motion, phase):
    rig, body = char["rig"], char["body"]
    for obj in (body, *rig.values()):
        obj.rotation_mode = "XYZ"
        obj.rotation_euler = (0, 0, 0)
    body.location = (0, 0, char["hover"])
    swing = (0, 1, 0, -1)[phase]
    if char["id"] == "coilblade":
        angles(rig["left_shoulder"], x=22, y=-16, z=-8)
        angles(rig["left_elbow"], x=-15)
        angles(rig["right_shoulder"], x=-22, y=17, z=7)
        angles(rig["right_elbow"], x=-20)
        angles(rig["left_hip"], x=-15)
        angles(rig["left_knee"], x=20)
        angles(rig["right_hip"], x=13)
        angles(rig["weapon"], x=115, y=9, z=-6)
        angles(rig["head"], y=-5, z=-5)
        angles(rig["scarf"], x=8 + swing * 3, z=-80)
        if motion == "idle":
            body.location.z = (0, .013, 0, -.008)[phase]
            angles(rig["head"], x=(0, -2, 0, 1)[phase], y=-5, z=-5)
        elif motion == "walk":
            body.location.z = (0, .045, 0, .045)[phase]
            angles(body, x=5, z=swing * 2)
            angles(rig["left_hip"], x=swing * 27)
            angles(rig["right_hip"], x=-swing * 27)
            angles(rig["left_knee"], x=max(0, -swing) * 24)
            angles(rig["right_knee"], x=max(0, swing) * 24)
            angles(rig["left_shoulder"], x=22 - swing * 17, y=-16, z=-8)
            angles(rig["right_shoulder"], x=-22 + swing * 12, y=17, z=7)
            angles(rig["scarf"], x=18, z=-80 + swing * 5)
            angles(rig["wind_key"], y=phase * 22.5)
        else:
            body.location.y = (0, .08, -.20, -.04)[phase]
            angles(body, x=(0, -8, 14, 3)[phase], z=(0, -18, 22, 5)[phase])
            angles(rig["right_shoulder"], x=(-22, 25, -75, -35)[phase],
                   y=(17, 35, -18, 12)[phase], z=(7, 10, -12, 3)[phase])
            angles(rig["right_elbow"], x=(-20, -65, -10, -25)[phase])
            angles(rig["weapon"], x=(115, -20, 175, 145)[phase], y=9)
            angles(rig["left_shoulder"], x=(22, -40, 25, 10)[phase], y=-16, z=-8)
            angles(rig["left_hip"], x=(0, 10, -18, -5)[phase])
            angles(rig["right_hip"], x=(0, -10, 15, 4)[phase])
            angles(rig["scarf"], x=(8, 0, 32, 16)[phase], z=(-80, -90, -62, -75)[phase])
    elif char["id"] == "mossguard":
        angles(rig["left_shoulder"], x=-20, y=-8, z=-8)
        angles(rig["left_elbow"], x=-25)
        angles(rig["right_shoulder"], x=-8, y=12, z=8)
        angles(rig["right_elbow"], x=-32)
        angles(rig["shield"], x=15, y=-9)
        angles(rig["head"], x=-3, y=4)
        if motion == "idle":
            body.location.z = (0, .009, 0, -.006)[phase]
            angles(rig["mantle"], x=swing * 1.5)
        elif motion == "walk":
            body.location.z = (0, .024, 0, .024)[phase]
            angles(body, x=3, z=swing * 3)
            angles(rig["left_hip"], x=swing * 20)
            angles(rig["right_hip"], x=-swing * 20)
            angles(rig["left_knee"], x=max(0, -swing) * 16)
            angles(rig["right_knee"], x=max(0, swing) * 16)
            angles(rig["right_shoulder"], x=-8 - swing * 12, y=12, z=8)
            angles(rig["mantle"], x=3, z=-swing * 2)
        else:
            body.location.y = (0, .055, -.13, -.02)[phase]
            angles(body, x=(0, -5, 9, 2)[phase], z=(0, 8, -12, -3)[phase])
            angles(rig["left_shoulder"], x=(-20, -8, -53, -29)[phase], y=-8, z=-8)
            angles(rig["left_elbow"], x=(-25, -45, -12, -28)[phase])
            angles(rig["right_shoulder"], x=(-8, 25, -63, -20)[phase], y=12, z=8)
            angles(rig["right_elbow"], x=(-32, -62, -8, -28)[phase])
            angles(rig["shield"], x=(15, 7, 30, 18)[phase], y=-9)
            angles(rig["mantle"], x=(0, -3, 8, 3)[phase])
    else:
        body.location.z = char["hover"] + (0, .035, 0, -.025)[phase]
        angles(body, x=(0, 1.4, 0, -1.2)[phase], y=swing * 1.5)
        angles(rig["rudder"], z=swing * 4)
        angles(rig["propeller"], y=phase * (60 if motion == "idle" else 120))
        angles(rig["flag"], z=-swing * 5)
        if motion == "walk":
            angles(body, x=-5 + swing, y=swing * 3)
            angles(rig["rudder"], z=-swing * 7)
        elif motion == "attack":
            body.location.y = (0, .015, .08, .02)[phase]
            angles(body, x=(0, -3, 5, 1)[phase], y=0)
            angles(rig["nozzle"], x=(0, -6, 6, 0)[phase])
            angles(rig["balloon"], x=(0, 1, -2, 0)[phase])


def animate(scene, char):
    objects = (char["body"], *char["rig"].values())
    for motion, frames in FRAMES.items():
        for phase, frame in enumerate(frames):
            pose(char, motion, phase)
            for obj in objects:
                obj.keyframe_insert(data_path="rotation_euler", frame=frame, group=motion)
                obj.keyframe_insert(data_path="location", frame=frame, group=motion)
    char["placement"]["animation_contract"] = json.dumps({
        "kind": "authored presentation key poses; no gameplay timing authority",
        "frames": FRAMES,
        "attack_contact_frame": 100,
        "sample_from": "simulation tick and accepted attack phase",
        "reduced_motion": "idle frame 1",
    })
    scene.frame_set(1)


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def build_studio(scene, engine, samples):
    studio = bpy.data.collections.new(PREFIX + "studio")
    scene.collection.children.link(studio)
    camera_data = bpy.data.cameras.new(PREFIX + "orthographic_camera")
    enum(camera_data, "type", ("ORTHO",))
    camera = bpy.data.objects.new(PREFIX + "orthographic_camera", camera_data)
    studio.objects.link(camera)
    scene.camera = camera
    world = bpy.data.worlds.new(PREFIX + "studio_world")
    world.use_nodes = True
    background = next(node for node in world.node_tree.nodes if node.type == "BACKGROUND")
    background.inputs[0].default_value = linear_color("#BCD4CB")
    background.inputs[1].default_value = .28
    scene.world = world
    for name, location, energy, size, color in (
        ("warm_key", (-3.5, -4.5, 7), 650, 4.5, "#FFE2B8"),
        ("cool_fill", (4, -1, 4), 250, 4, "#9FB7B5"),
        ("copper_rim", (1, 4, 5), 650, 3, "#E9A83A"),
    ):
        data = bpy.data.lights.new(PREFIX + name, "AREA")
        data.energy = energy
        enum(data, "shape", ("DISK",))
        data.size = size
        data.color = linear_color(color)[:3]
        obj = bpy.data.objects.new(PREFIX + name, data)
        studio.objects.link(obj)
        obj.location = location
        point_at(obj, (0, 0, 1))
    stage = bpy.data.collections.new(PREFIX + "stage")
    scene.collection.children.link(stage)
    mesh(stage, "studio_floor", ((-200, -200, -.04), (200, -200, -.04),
                               (200, 200, -.04), (-200, 200, -.04)),
         ((0, 1, 2, 3),), "stage")
    for name, x in (("coilblade", -1.8), ("mossguard", 0), ("copperskiff", 1.8)):
        lathe(stage, name + "_display_plinth",
              ((-.04, .70), (.005, .73), (.065, .73), (.085, .70)),
              "plinth", center=(x, 0, -.065), segments=64)
        ring(stage, name + "_plinth_copper_edge", (x, 0, -.017), (.72, .72),
             "copper_dark", radius=.014)
    candidates = ("CYCLES",) if engine == "cycles" else ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE")
    selected = None
    for candidate in candidates:
        try:
            scene.render.engine = candidate
            selected = candidate
            break
        except TypeError:
            continue
    if selected is None:
        raise RuntimeError(f"Requested renderer is unavailable; current engine: {scene.render.engine}")
    if selected == "CYCLES":
        scene.cycles.samples = samples
        scene.cycles.use_denoising = True
        scene.cycles.seed = 0
        scene.cycles.use_animated_seed = False
        enum(scene.cycles, "device", ("CPU",))
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.fps = 60
    enum(scene.render.image_settings, "file_format", ("PNG",))
    enum(scene.render.image_settings, "color_mode", ("RGBA",))
    enum(scene.render.image_settings, "color_depth", ("8",))
    scene["default_view_transform"] = scene.view_settings.view_transform
    scene.view_settings.exposure = .35
    scene.view_settings.gamma = 1
    scene.frame_start, scene.frame_end = 1, 106
    for name, frames in FRAMES.items():
        for index, frame in enumerate(frames):
            marker = scene.timeline_markers.new(f"{name}_{('rest', 'anticipation', 'contact', 'recover')[index] if name == 'attack' else index + 1}")
            marker.frame = frame
    return studio, stage, camera


def gallery_camera(scene):
    camera = scene.camera
    camera.location = (3.0, -10, 5.1)
    camera.data.ortho_scale = 6.4
    point_at(camera, (0, 0, .65))
    scene.render.resolution_x, scene.render.resolution_y = 1500, 900


def character_camera(scene, char, yaw=0, elevation=12, scale=1.8, target_height=.69):
    target = char["placement"].location + Vector((0, 0, target_height))
    angle, rise = yaw * DEG, elevation * DEG
    scene.camera.location = target + Vector((
        8 * math.sin(angle) * math.cos(rise),
        -8 * math.cos(angle) * math.cos(rise),
        8 * math.sin(rise),
    ))
    scene.camera.data.ortho_scale = scale
    point_at(scene.camera, target)


def projected_bounds(scene, char):
    dependency_graph = bpy.context.evaluated_depsgraph_get()
    camera = scene.camera
    if camera.data.type != "ORTHO":
        raise RuntimeError("The source sprite projection requires an orthographic camera.")
    camera_inverse = camera.matrix_world.normalized().inverted()
    camera_frame = camera.data.view_frame(scene=scene)
    left = min(point.x for point in camera_frame)
    right = max(point.x for point in camera_frame)
    bottom = min(point.y for point in camera_frame)
    top = max(point.y for point in camera_frame)
    x_values, y_values = [], []
    for obj in char["collection"].all_objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        evaluated = obj.evaluated_get(dependency_graph)
        evaluated_mesh = evaluated.to_mesh()
        to_camera = camera_inverse @ evaluated.matrix_world
        for vertex in evaluated_mesh.vertices:
            point = to_camera @ vertex.co
            x_values.append((point.x - left) / (right - left))
            y_values.append((point.y - bottom) / (top - bottom))
        evaluated.to_mesh_clear()
    return {
        "left": min(x_values),
        "right": max(x_values),
        "top": 1 - max(y_values),
        "bottom": 1 - min(y_values),
    }


def sprite_camera(scene, char, yaw):
    character_camera(scene, char, yaw, SPRITE_ELEVATION, SPRITE_SCALE, SPRITE_TARGET_HEIGHT)
    bpy.context.view_layer.update()
    anchor = world_to_camera_view(scene, scene.camera, char["placement"].location)
    return [round(anchor.x, 8), round(1 - anchor.y, 8)]


def fit_sprite_camera(scene, characters):
    global SPRITE_SCALE, SPRITE_TARGET_HEIGHT
    scene.render.resolution_x = scene.render.resolution_y = 256
    frames = [frame for values in FRAMES.values() for frame in values]
    horizontal_extent, low, high = 0, math.inf, -math.inf
    for char in characters:
        for _, yaw in DIRECTIONS:
            character_camera(scene, char, yaw, SPRITE_ELEVATION, 1, 0)
            for frame in frames:
                scene.frame_set(frame)
                bpy.context.view_layer.update()
                bounds = projected_bounds(scene, char)
                horizontal_extent = max(horizontal_extent, abs(bounds["left"] - .5), abs(bounds["right"] - .5))
                low = min(low, .5 - bounds["bottom"])
                high = max(high, .5 - bounds["top"])
    SPRITE_SCALE = math.ceil(max(horizontal_extent * 2, high - low) / .94 * 100) / 100
    SPRITE_TARGET_HEIGHT = (low + high) / (2 * math.cos(SPRITE_ELEVATION * DEG))


def sprite_projection_receipt(scene, characters):
    scene.render.resolution_x = scene.render.resolution_y = 256
    records = []
    source_frames = [frame for frames in FRAMES.values() for frame in frames]
    for char in characters:
        for direction, yaw in DIRECTIONS:
            anchor = sprite_camera(scene, char, yaw)
            for frame in source_frames:
                scene.frame_set(frame)
                bounds = projected_bounds(scene, char)
                if min(bounds["left"], bounds["top"]) < .015 or max(bounds["right"], bounds["bottom"]) > .985:
                    raise RuntimeError(f"Sprite clipping risk: {char['id']} {direction} frame {frame}: {bounds}")
                records.append({"card_id": char["id"], "direction": direction, "source_frame": frame,
                                "ground_anchor_in_tile": anchor, "bounds": bounds})
    scene.frame_set(1)
    anchors = {tuple(record["ground_anchor_in_tile"]) for record in records}
    if len(anchors) != 1:
        raise RuntimeError(f"Sprite anchors drift across characters or directions: {sorted(anchors)}")
    return {
        "measurement": "Evaluated mesh vertices projected through the actual orthographic camera frame; ground anchor via world_to_camera_view",
        "orthographic_scale": SPRITE_SCALE,
        "camera_target_height": SPRITE_TARGET_HEIGHT,
        "camera_elevation_degrees": SPRITE_ELEVATION,
        "ground_anchor_in_tile": list(anchors.pop()),
        "guard": "Every rendered key pose has at least a 1.5% transparent border.",
        "frames": records,
    }


def glb_export(scene, char, path):
    for obj in scene.objects:
        obj.select_set(False)
    for obj in char["collection"].all_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = char["placement"]
    old_position = char["placement"].location.copy()
    char["placement"].location = (0, 0, 0)
    bpy.context.view_layer.update()
    try:
        exporter = bpy.ops.export_scene.gltf
        properties = exporter.get_rna_type().properties
        options = {"filepath": str(path), "use_selection": True}
        if "export_format" in properties:
            choices = {item.identifier for item in properties["export_format"].enum_items}
            if "GLB" not in choices:
                raise RuntimeError("This Blender glTF exporter does not support GLB")
            options["export_format"] = "GLB"
        for key, value in (
            ("export_animations", True), ("export_frame_range", True),
            ("export_force_sampling", True), ("export_apply", True),
            ("export_cameras", False), ("export_lights", False),
        ):
            if key in properties:
                options[key] = value
        if "export_animation_mode" in properties:
            choices = {item.identifier for item in properties["export_animation_mode"].enum_items}
            if "SCENE" in choices:
                options["export_animation_mode"] = "SCENE"
        result = exporter(**options)
        if "FINISHED" not in result:
            raise RuntimeError(f"GLB export did not finish for {char['id']}: {result}")
    finally:
        char["placement"].location = old_position
        bpy.context.view_layer.update()


def character_blend(scene, char, studio, path):
    isolated = scene.copy()
    isolated.name = PREFIX + char["id"] + "_portrait"
    for collection in list(isolated.collection.children):
        if collection not in (char["collection"], studio):
            isolated.collection.children.unlink(collection)
    camera = scene.camera.copy()
    camera.data = scene.camera.data.copy()
    camera.name = PREFIX + char["id"] + "_portrait_camera"
    isolated.collection.objects.link(camera)
    isolated.camera = camera
    isolated.render.resolution_x = isolated.render.resolution_y = 512
    isolated.render.film_transparent = True
    center = 1.0 if char["id"] == "copperskiff" else .61
    camera.location = (2.2, -4, center + 1.5)
    camera.data.ortho_scale = 1.8
    point_at(camera, (0, 0, center))
    old_position = char["placement"].location.copy()
    char["placement"].location = (0, 0, 0)
    bpy.context.view_layer.update()
    try:
        bpy.data.libraries.write(str(path), {isolated}, fake_user=True)
    finally:
        char["placement"].location = old_position
        camera_data = camera.data
        bpy.data.objects.remove(camera, do_unlink=True)
        bpy.data.cameras.remove(camera_data)
        bpy.data.scenes.remove(isolated)
        bpy.context.view_layer.update()


def mesh_receipt(char):
    geometry = []
    triangle_count = 0
    evaluated_triangles = 0
    material_names = set()
    dependency_graph = bpy.context.evaluated_depsgraph_get()
    for obj in sorted(char["collection"].all_objects, key=lambda item: item.name):
        if obj.type != "MESH":
            continue
        obj.data.calc_loop_triangles()
        triangle_count += len(obj.data.loop_triangles)
        evaluated = obj.evaluated_get(dependency_graph)
        evaluated_mesh = evaluated.to_mesh()
        evaluated_mesh.calc_loop_triangles()
        evaluated_triangles += len(evaluated_mesh.loop_triangles)
        evaluated.to_mesh_clear()
        material_names.update(material.name for material in obj.data.materials)
        geometry.append({
            "name": obj.name,
            "parent": obj.parent.name if obj.parent else None,
            "local_transform": [[round(value, 6) for value in row] for row in obj.matrix_local],
            "vertices": [[round(value, 6) for value in vertex.co] for vertex in obj.data.vertices],
            "faces": [list(face.vertices) for face in obj.data.polygons],
            "materials": [material.name for material in obj.data.materials],
        })
    digest = hashlib.sha256(json.dumps(geometry, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {"editable_mesh_objects": len(geometry), "base_mesh_triangles": triangle_count,
            "evaluated_triangles": evaluated_triangles, "material_slots_used": sorted(material_names),
            "explicit_geometry_sha256": digest}


def file_receipt(path):
    return {"path": path.name, "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def render_previews(scene, characters, stage, output, size, preview_set):
    preview = output / "previews"
    preview.mkdir(exist_ok=True)
    scene.frame_set(1)
    stage.hide_render = False
    gallery_camera(scene)
    if preview_set == "quick":
        scene.render.resolution_x, scene.render.resolution_y = 960, 576
    scene.render.filepath = str(preview / "lineup.png")
    bpy.ops.render.render(write_still=True, scene=scene.name)
    stage.hide_render = True
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = size
    views = (("three-quarter", 38, 18),) if preview_set == "quick" else (
        ("front", 0, 5), ("side", 90, 5), ("three-quarter", 38, 18),
    )
    for char in characters:
        for other in characters:
            other["collection"].hide_render = other is not char
        for view, yaw, elevation in views:
            character_camera(scene, char, yaw, elevation, 1.8,
                             1.0 if char["id"] == "copperskiff" else .61)
            scene.render.filepath = str(preview / f"{char['id']}-{view}.png")
            bpy.ops.render.render(write_still=True, scene=scene.name)
        if preview_set == "full":
            sprite_camera(scene, char, 0)
            for motion, frame in (("idle", 1), ("walk", 51), ("attack-contact", 100)):
                scene.frame_set(frame)
                scene.render.filepath = str(preview / f"{char['id']}-{motion}-arena.png")
                bpy.ops.render.render(write_still=True, scene=scene.name)
        scene.frame_set(1)
    return preview


def render_sprites(scene, characters, stage, output, size, projection):
    sprite_dir = output / "sprites"
    sprite_dir.mkdir(exist_ok=True)
    stage.hide_render = True
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = size
    layout = {
        "status": "source atlas; shipping integration and live 13px review pending",
        "tile_size": size, "columns": 8, "rows": 12,
        "direction_columns": [name for name, _ in DIRECTIONS],
        "row_order": [{"motion": motion, "source_frame": frame} for motion, frames in FRAMES.items() for frame in frames],
        "camera_elevation_degrees": SPRITE_ELEVATION, "orthographic_scale": SPRITE_SCALE,
        "alpha": "straight", "ground_anchor_in_tile": projection["ground_anchor_in_tile"],
        "timing": "Map accepted simulation attack phase to pose; these source frames do not set attack cadence.",
    }
    for char in characters:
        for other in characters:
            other["collection"].hide_render = other is not char
        atlas_width, atlas_height = size * 8, size * 12
        pixels = array("f", [0.0]) * (atlas_width * atlas_height * 4)
        row = 0
        for motion, frames in FRAMES.items():
            for frame in frames:
                scene.frame_set(frame)
                for column, (_, yaw) in enumerate(DIRECTIONS):
                    sprite_camera(scene, char, yaw)
                    scene.render.filepath = str(sprite_dir / "_frame.png")
                    bpy.ops.render.render(write_still=True, scene=scene.name)
                    rendered = bpy.data.images.load(str(sprite_dir / "_frame.png"), check_existing=False)
                    source = array("f", [0.0]) * (size * size * 4)
                    rendered.pixels.foreach_get(source)
                    for y in range(size):
                        target_start = (((11 - row) * size + y) * atlas_width + column * size) * 4
                        source_start = y * size * 4
                        pixels[target_start:target_start + size * 4] = source[source_start:source_start + size * 4]
                    bpy.data.images.remove(rendered)
                row += 1
        atlas = bpy.data.images.new(PREFIX + char["id"] + "_source_atlas", atlas_width, atlas_height, alpha=True)
        atlas.pixels.foreach_set(pixels)
        atlas.filepath_raw = str(sprite_dir / f"{char['id']}-8dir-source.png")
        enum(atlas, "file_format", ("PNG",))
        atlas.save()
        bpy.data.images.remove(atlas)
    (sprite_dir / "_frame.png").unlink(missing_ok=True)
    (sprite_dir / "layout.json").write_text(json.dumps(layout, indent=2) + "\n")


def restore_gallery(scene, characters, stage):
    for char in characters:
        char["collection"].hide_render = False
    stage.hide_render = False
    scene.render.film_transparent = False
    scene.frame_set(1)
    gallery_camera(scene)
    for obj in scene.objects:
        obj.select_set(False)
    bpy.context.view_layer.objects.active = None


def main():
    if not bpy.app.background:
        raise RuntimeError("Run this generator in a NEW headless Blender process; a live Blender session is not supported.")
    if any(scene.name.startswith(PREFIX) for scene in bpy.data.scenes):
        raise RuntimeError("An existing generated scene is open. Start a new headless Blender process.")
    args = arguments()
    output = args.output.resolve()
    if output != HERE and HERE not in output.parents:
        raise RuntimeError("Output must stay inside design/20261020-redesign/astra/.")
    if args.samples < 1 or args.sprite_size not in (64, 128, 256) or args.preview_size not in (128, 256, 512, 1024):
        raise RuntimeError("Use positive samples, a 64/128/256 sprite tile, and a 128/256/512/1024 preview.")
    output.mkdir(parents=True, exist_ok=True)
    scene = bpy.data.scenes.new(PREFIX + "character_gallery")
    bpy.context.window.scene = scene
    build_materials(args.team)
    characters = (make_coilblade(scene), make_mossguard(scene), make_copperskiff(scene))
    studio, stage, camera = build_studio(scene, args.engine, args.samples)
    for char in characters:
        animate(scene, char)
    scene.frame_set(1)
    fit_sprite_camera(scene, characters)
    projection = sprite_projection_receipt(scene, characters)
    (output / "sprite-projection.json").write_text(json.dumps(projection, indent=2) + "\n")
    manifest = {
        "schema": 1,
        "status": "generated; independent visual critique and live integration pending",
        "authorship": "Original procedural geometry and materials by GPT-6 Astra for Moss & Ember",
        "license": "AGPL-3.0-only",
        "identity_source_commit": SOURCE_COMMIT,
        "generator_source": file_receipt(HERE / "build_models.py"),
        "palette_source": file_receipt(HERE / "palette.json"),
        "identity_sources": ["src/ui/card-lore.js", "src/ui/card-portrait-art.js",
                             "public/assets/card-portraits-painted.webp",
                             "src/content/cards/basic-melee.js", "src/content/cards/basic-flying.js"],
        "external_geometry_or_textures": [],
        "reference_assets_imported": False,
        "randomness": "None; explicit coordinates. Cycles render seed is fixed to zero.",
        "blender_version": bpy.app.version_string,
        "render_engine": scene.render.engine,
        "view_transform": scene.view_settings.view_transform,
        "view_look": scene.view_settings.look,
        "exposure": scene.view_settings.exposure,
        "team_variant": args.team,
        "coordinates": {"up": "+Z", "forward": "-Y", "ground_anchor": [0, 0, 0]},
        "animation_frames": FRAMES,
        "attack_contact_frame": 100,
        "rendered_previews": args.previews,
        "preview_set": args.preview_set if args.previews else None,
        "preview_size": args.preview_size if args.previews else None,
        "rendered_sprite_sources": args.sprites,
        "characters": [],
    }
    for char in characters:
        path = output / f"{char['id']}.glb"
        glb_export(scene, char, path)
        blend_path = output / f"{char['id']}.blend"
        character_blend(scene, char, studio, blend_path)
        manifest["characters"].append({
            "card_id": char["id"], "role": char["role"], "glb": file_receipt(path),
            "blend": file_receipt(blend_path),
            **mesh_receipt(char),
        })
    if args.previews:
        render_previews(scene, characters, stage, output, args.preview_size, args.preview_set)
    if args.sprites:
        render_sprites(scene, characters, stage, output, args.sprite_size, projection)
    restore_gallery(scene, characters, stage)
    scene["provenance"] = json.dumps({key: value for key, value in manifest.items() if key != "characters"})
    blend_path = output / "moss-and-ember-characters.blend"
    bpy.data.libraries.write(str(blend_path), {scene}, fake_user=True)
    manifest["blend"] = file_receipt(blend_path)
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"status": "generated", "output": str(output),
                      "characters": [char["id"] for char in characters],
                      "visual_verification": "pending independent rendered critique"}, indent=2))


if __name__ == "__main__":
    main()
