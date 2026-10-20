"""Original, editable low-triangle Coilblade and Mossguard model sources."""

import json
import math
from pathlib import Path
import sys

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "controls"))
import round1_models as source

source.PREFIX = "ME_CM_R1_"
PREFIX = source.PREFIX


def primitive(value):
    """Convert Blender values before writing any manifest or starting a render."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, bpy.types.ID):
        return {"blender_id_type": value.bl_rna.identifier, "name": value.name}
    if hasattr(value, "items"):
        return {str(key): primitive(item) for key, item in value.items()}
    try:
        return [primitive(item) for item in value]
    except TypeError as error:
        raise TypeError(f"Unsupported receipt value: {type(value).__name__}") from error


def write_json(path, value):
    path.write_text(json.dumps(primitive(value), sort_keys=True, indent=2, allow_nan=False) + "\n")


def plate(c, name, outline, thickness, material, parent, center=(0, 0, 0)):
    return source.prism(c, name, outline, thickness, material, parent, center, bevel=0)


def ball(c, name, center, radii, material, parent, segments=8, rings=4):
    return source.ellipsoid(c, name, center, radii, material, parent, segments, rings)


def branch(c, name, start, end, radius, material, parent, end_radius=None):
    return source.spindle(c, name, start, end, radius, material, parent, end_radius, sides=6)


def pivot(char, name, location, parent=None):
    obj = source.empty(char["collection"], char["id"] + "_" + name, location, parent or char["body"])
    char["rig"][name] = obj
    return obj


def ground_marker(char, team):
    c, root = char["collection"], char["placement"]
    # The marker is an editable presentation component. It is not a hitbox.
    count = 24
    outer = []
    for index in range(count):
        angle = index * math.tau / count
        radius = .61
        if team == "ember":
            radius = .47 if index % 6 in (0, 1) else .64
        outer.append((math.cos(angle) * radius, math.sin(angle) * radius))
    vertices = [(x, y, .025) for x, y in outer]
    vertices += [(math.cos(index * math.tau / count) * .31,
                  math.sin(index * math.tau / count) * .31, .025) for index in range(count)]
    faces = [(index, (index + 1) % count, (index + 1) % count + count, index + count)
             for index in range(count)]
    obj = source.mesh(c, char["id"] + "_" + team + "_ground_mark", vertices, faces, "team", root)
    obj["team_variant"] = team
    obj["presentation_ground_marker"] = True
    obj["shape"] = "solid circular band" if team == "river" else "four paired deep trail notches"
    return obj


def character(scene, identifier):
    char = source.character(scene, identifier, 0, (1, 1, 1))
    char["placement"]["source_commit"] = json.loads((HERE / "parameters.json").read_text())["identity_commit"]
    char["placement"]["model_revision"] = "Coilblade/Mossguard native round 1"
    char["placement"]["team_variant"] = "river"
    char["team_shapes"] = {team: ground_marker(char, team) for team in ("river", "ember")}
    return char


def make_coilblade(scene):
    char = character(scene, "coilblade")
    c, body = char["collection"], char["body"]
    char["role"] = "Existing single-target ground melee duelist"
    source.lathe(c, "coilblade_copper_chest", ((.91, .18), (1.06, .25), (1.32, .28), (1.40, .19)),
                 "copper", body, depth=.68, segments=8, smooth=False)
    source.lathe(c, "coilblade_dark_waist_core", ((.80, .15), (.98, .15)),
                 "iron", body, depth=.72, segments=8, smooth=False)
    coil = [(math.cos(i * math.tau / 10) * .175, math.sin(i * math.tau / 10) * .14,
             .81 + i * .005) for i in range(31)]
    source.tube(c, "coilblade_three_turn_spring", coil, .031, "copper_dark", body, sides=4)
    for side, x, y in (("left", -.17, -.14), ("right", .17, .10)):
        leg = pivot(char, side + "_leg", (x, y, .80))
        branch(c, "coilblade_" + side + "_thigh", (0, 0, 0), (0, -.015, -.33), .075, "copper", leg)
        ball(c, "coilblade_" + side + "_knee", (0, -.015, -.33), (.08, .08, .08), "iron", leg)
        branch(c, "coilblade_" + side + "_shin", (0, -.015, -.35), (0, -.02, -.67), .065,
               "copper", leg, end_radius=.08)
        plate(c, "coilblade_" + side + "_splayed_sabaton",
              ((-.10, -.73), (.10, -.73), (.11, -.65), (.06, -.59), (-.07, -.60)), .31,
              "copper_dark", leg, (0, -.095, 0))
    for side, x in (("left", -.31), ("right", .31)):
        arm = pivot(char, side + "_arm", (x, -.015, 1.29))
        ball(c, "coilblade_" + side + "_shoulder", (0, 0, 0), (.12, .12, .10), "copper", arm)
        branch(c, "coilblade_" + side + "_upper_arm", (0, 0, -.06), (0, -.05, -.24), .06, "iron", arm)
        ball(c, "coilblade_" + side + "_elbow", (0, -.05, -.24), (.075, .075, .075), "copper_dark", arm)
        branch(c, "coilblade_" + side + "_forearm", (0, -.05, -.24), (0, -.20, -.38), .08,
               "copper", arm, end_radius=.06)
        ball(c, "coilblade_" + side + "_hand", (0, -.20, -.38), (.075, .075, .09), "copper_dark", arm)
    head = pivot(char, "head", (0, -.025, 1.60))
    source.lathe(c, "coilblade_flared_kiln_bell", ((-.18, .25), (-.13, .29), (.05, .25),
                 (.22, .15), (.26, .065)), "copper", head, depth=.78, segments=10, smooth=False)
    source.lathe(c, "coilblade_dark_bell_lip", ((-.19, .255), (-.14, .285)),
                 "copper_dark", head, depth=.78, segments=10, smooth=False)
    ball(c, "coilblade_single_dark_socket", (.05, -.207, .015), (.135, .055, .135), "iron", head)
    ball(c, "coilblade_single_round_ember_lens", (.05, -.253, .015), (.094, .025, .094), "ember", head)
    source.tube(c, "coilblade_cast_crown_loop", ((-.06, 0, .25), (-.06, 0, .34),
                 (.06, 0, .34), (.06, 0, .25)), .025, "copper_dark", head, sides=4)
    source.lathe(c, "coilblade_moss_scarf_collar", ((1.36, .20), (1.43, .30), (1.48, .23)),
                 "forest", body, depth=.80, segments=8, smooth=False)
    scarf = pivot(char, "scarf", (0, .12, 1.40))
    vertices = [(-.17, 0, .02), (.17, 0, .02), (.23, .42, -.05), (.10, .72, -.19),
                (-.04, .54, -.15), (-.24, .65, -.12), (-.20, .31, 0)]
    scarf_obj = source.mesh(c, "coilblade_broad_trailing_scarf", vertices +
                            [(x, y, z - .045) for x, y, z in vertices],
                            [tuple(range(7)), tuple(reversed(range(7, 14)))] +
                            [(i, (i + 1) % 7, (i + 1) % 7 + 7, i + 7) for i in range(7)],
                            "forest", scarf)
    scarf_obj["dominant_silhouette_cue"] = "One broad moss scarf trails along local +Y"
    for face, y in (("front", -.205), ("back", .205)):
        plate(c, "coilblade_broad_team_tabard_" + face,
              ((-.20, .28), (.20, .28), (.22, -.20), (0, -.34), (-.22, -.20)), .055,
              "team", body, (0, y, .97))
    blade = pivot(char, "saber", (.36, -.22, .93))
    branch(c, "coilblade_wrapped_saber_grip", (0, .12, 0), (0, -.06, 0), .055, "forest", blade)
    ball(c, "coilblade_disc_guard", (0, -.06, 0), (.14, .05, .14), "copper_dark", blade)
    blade_obj = plate(c, "coilblade_sunrise_crescent",
                      ((-.04, .05), (-.25, .01), (-.55, -.03), (-.75, .01), (-.89, .16),
                       (-.66, .10), (-.38, .14), (-.06, .17)), .14, "blade_edge", blade)
    blade_obj.rotation_euler.z = math.pi / 2
    blade_obj["dominant_silhouette_cue"] = "Thick bright single-edged saber points local -Y"
    char["lead_local"] = [.36, -1.11, 1.09]
    return char


def make_mossguard(scene):
    char = character(scene, "mossguard")
    c, body = char["collection"], char["body"]
    char["role"] = "Existing single-target ground melee grove keeper"
    source.lathe(c, "mossguard_bough_trunk", ((.32, .29), (.55, .43), (.96, .47),
                 (1.29, .35)), "wood", body, depth=.78, segments=8, smooth=False)
    for side, x in (("left", -.27), ("right", .27)):
        leg = pivot(char, side + "_leg", (x, 0, .43))
        branch(c, "mossguard_" + side + "_stump", (0, 0, 0), (0, -.01, -.31), .17, "wood", leg,
               end_radius=.20)
        ball(c, "mossguard_" + side + "_root_foot", (0, -.10, -.34), (.23, .30, .10),
             "wood_dark", leg, segments=8, rings=3)
        for index, dx in enumerate((-.11, .11)):
            branch(c, "mossguard_" + side + f"_root_toe_{index}",
                   (dx * .60, -.17, -.31), (dx, -.33, -.35), .07, "wood_light", leg)
    for side, x in (("left", -.49), ("right", .49)):
        arm = pivot(char, side + "_arm", (x, 0, 1.05))
        branch(c, "mossguard_" + side + "_upper_bough", (0, 0, 0), (0, -.04, -.25), .15, "wood", arm)
        branch(c, "mossguard_" + side + "_fore_bough", (0, -.04, -.25), (0, -.19, -.39), .15, "wood", arm)
        ball(c, "mossguard_" + side + "_root_fist", (0, -.19, -.39), (.19, .17, .18),
             "wood_light", arm)
    head = pivot(char, "head", (0, -.07, 1.40))
    ball(c, "mossguard_carved_bough_head", (0, 0, 0), (.25, .23, .31), "wood", head)
    plate(c, "mossguard_heartwood_mask",
          ((-.16, .24), (.12, .26), (.22, .08), (.16, -.22), (-.12, -.25), (-.22, -.04)),
          .065, "wood_light", head, (0, -.205, 0))
    for side, x in (("left", -.095), ("right", .095)):
        ball(c, "mossguard_" + side + "_eye_hole", (x, -.253, .015), (.052, .023, .066),
             "wood_dark", head, segments=6, rings=3)
    crown = source.leaf(c, "mossguard_crown_sprout", (.035, .015, .36), .24, .34,
                       "leaf_light", head, roll=-30)
    crown["large_leaf_only"] = True
    mantle = pivot(char, "mantle", (0, .01, 1.17))
    # Twelve faceted leaves form one broad shoulder mass. No invisible vein tubes.
    for index in range(8):
        angle = index * math.tau / 8
        x, y = math.sin(angle) * .43, math.cos(angle) * .31
        obj = source.leaf(c, f"mossguard_mantle_leaf_{index}", (x, y, .01), .50, .73,
                          "moss", mantle, roll=-math.sin(angle) * 36)
        obj.rotation_euler.z = -angle
    for index, (x, y, roll) in enumerate(((-.39, -.18, -30), (.39, -.18, 30),
                                        (-.25, .30, -18), (.25, .30, 18))):
        source.leaf(c, f"mossguard_large_collar_leaf_{index}", (x, y, .20), .43, .48,
                    "leaf_light", mantle, roll=roll)
    # A broad top/back sash preserves a team-colored surface in north views.
    sash_vertices = [(-.49, .23, 1.27), (.49, .23, 1.27), (.42, .43, 1.11),
                     (-.42, .43, 1.11), (-.49, .22, 1.22), (.49, .22, 1.22),
                     (.42, .42, 1.06), (-.42, .42, 1.06)]
    source.mesh(c, "mossguard_team_trail_sash", sash_vertices,
                [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2),
                 (2, 6, 7, 3), (3, 7, 4, 0)], "team", body)
    shield = pivot(char, "shield", (-.42, -.46, .76))
    outer = ((-.34, .40), (-.23, .61), (.04, .67), (.31, .43), (.35, .03),
             (.22, -.36), (0, -.66), (-.25, -.36), (-.36, -.02))
    plate(c, "mossguard_tall_team_bough_rim", outer, .22, "team", shield)
    inset = tuple((x * .61, z * .73) for x, z in outer)
    for face, y in (("front", -.131), ("back", .131)):
        plate(c, "mossguard_heartwood_shield_" + face, inset, .04, "wood_light", shield, (0, y, .01))
    relief = source.leaf(c, "mossguard_one_pressed_leaf", (0, -.166, .02), .32, .75,
                         "leaf_light", shield, roll=-6)
    relief["lore"] = "One large pressed leaf in the bough shield"
    source.tube(c, "mossguard_pressed_leaf_midrib",
                ((0, -.245, -.28), (.025, -.245, .04), (0, -.245, .32)),
                .025, "moss", shield, sides=4)
    char["lead_local"] = [-.42, -.65, .76]
    return char


def set_team(char, team):
    source.input_socket(next(node for node in source.MATERIALS["team"].node_tree.nodes
                             if node.type == "BSDF_PRINCIPLED"), "Base Color").default_value = (
        source.linear_color(source.PALETTE["team_variants"][team]))
    char["placement"]["team_variant"] = team
    for obj in char["collection"].all_objects:
        variant = obj.get("team_variant")
        if obj.type == "MESH" and variant:
            obj.hide_render = variant != team
            obj.hide_viewport = variant != team


def animate(scene, char, frames):
    animated = [char["body"], *char["rig"].values()]
    rest = {obj.name: (obj.location.copy(), obj.rotation_euler.copy()) for obj in animated}
    for motion, values in frames.items():
        for phase, frame in enumerate(values):
            for obj in animated:
                obj.location, obj.rotation_euler = rest[obj.name]
            swing = (0, 1, 0, -1)[phase]
            body, rig = char["body"], char["rig"]
            if motion == "walk":
                rig["left_leg"].rotation_euler.x = swing * math.radians(19 if char["id"] == "coilblade" else 13)
                rig["right_leg"].rotation_euler.x = -rig["left_leg"].rotation_euler.x
                rig["left_arm"].rotation_euler.x = -swing * math.radians(12)
                rig["right_arm"].rotation_euler.x = swing * math.radians(12)
                body.location.z = (0, .025, 0, .025)[phase]
            elif motion == "idle":
                rig["head"].rotation_euler.x = math.radians((0, -2, 0, 1)[phase])
            else:
                body.location.y = (0, .06, -.16, -.03)[phase]
                body.rotation_euler.x = math.radians((0, -5, 9, 2)[phase])
                if char["id"] == "coilblade":
                    rig["saber"].location.y += (0, .27, -.32, -.08)[phase]
                    rig["saber"].rotation_euler.x = math.radians((0, -25, 18, 5)[phase])
                    rig["left_arm"].rotation_euler.x = math.radians((0, -25, 18, 5)[phase])
                else:
                    rig["shield"].location.y += (0, .13, -.28, -.06)[phase]
                    rig["shield"].rotation_euler.x = math.radians((0, -8, 15, 4)[phase])
                    rig["right_arm"].rotation_euler.x = math.radians((0, 22, -48, -12)[phase])
            secondary = rig.get("scarf") or rig.get("mantle")
            secondary.rotation_euler.x = math.radians(swing * 5 if motion == "walk" else
                                                      ((0, -3, 12, 4)[phase] if motion == "attack" else 0))
            for obj in animated:
                for channel in ("location", "rotation_euler"):
                    obj.keyframe_insert(data_path=channel, frame=frame, group=motion)
    char["placement"]["animation_contract"] = json.dumps({
        "source_frames": frames, "contact_frame": 100, "reduced_motion_frame": 1,
        "authority": "Authored pose samples only. Runtime simulation timing is unchanged."
    })
    scene.frame_set(1)
