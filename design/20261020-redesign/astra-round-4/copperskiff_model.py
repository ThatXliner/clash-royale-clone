"""Round-four macro heading variants of the original exposed-deck Copperskiff."""

import math


def band(model, collection, name, outline, lower, upper, material, parent):
    vertices = [(x, y, z) for z in (lower, upper) for x, y in outline]
    count = len(outline)
    faces = [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    return model.mesh(collection, name, vertices, faces, material, parent)


def directional_canvas(model, collection, name, canopy, parent):
    vertices, faces, sides = [], [], 16
    for y, width, height in canopy["sections"]:
        for side in range(sides):
            angle = math.tau * side / sides
            vertices.append((width * math.cos(angle), y, height * math.sin(angle)))
    faces.append(tuple(range(sides)))
    for row in range(len(canopy["sections"]) - 1):
        for side in range(sides):
            after = (side + 1) % sides
            faces.append((row * sides + side, (row + 1) * sides + side,
                          (row + 1) * sides + after, row * sides + after))
    faces.append(tuple((len(canopy["sections"]) - 1) * sides + side for side in reversed(range(sides))))
    return model.mesh(collection, name, vertices, faces, "canvas", parent, smooth=True)


def canvas_section(canopy, y):
    if canopy["mode"] != "directional":
        rx, ry, rz = canopy["radii"]
        factor = math.sqrt(1 - (y / ry) ** 2)
        return rx * factor, rz * factor
    sections = canopy["sections"]
    for left, right in zip(sections, sections[1:]):
        if left[0] <= y <= right[0]:
            t = (y - left[0]) / (right[0] - left[0])
            return tuple(left[index] * (1 - t) + right[index] * t for index in (1, 2))
    raise ValueError(f"Canvas binding is outside the authored cross sections: {y}")


def build(model, scene, settings):
    char = model.character(scene, "copperskiff", 0, (1, 1, 1), hover=settings["hover_base"])
    char["variant"] = settings["id"]
    char["settings"] = settings
    collection, body, rig = char["collection"], char["body"], char["rig"]
    beam, length, depth = settings["hull_beam"], settings["hull_length"], settings["hull_depth"]
    hull = model.empty(collection, "copperskiff_kettle_hull", (0, 0, settings["hull_center_z"]), body)
    rig["hull"] = hull
    outline = [(beam * x, length * y) for x, y in settings["hull_outline"]]
    vertices = []
    for scale, z in ((.48, -depth * .5), (.91, -depth * .23), (1, depth * .48)):
        vertices.extend((x * scale, y * scale, z) for x, y in outline)
    count = len(outline)
    faces = [tuple(reversed(range(count)))]
    for row in range(2):
        for i in range(count):
            after = (i + 1) % count
            faces.append((row * count + i, row * count + after, (row + 1) * count + after, (row + 1) * count + i))
    faces.append(tuple(2 * count + i for i in range(count)))
    shell = model.mesh(collection, "copperskiff_copper_boat_belly", vertices, faces, "copper", hull)
    shell.data.materials.append(model.MATERIALS["copper_dark"])
    for polygon in shell.data.polygons:
        if polygon.center.z < -.05:
            polygon.material_index = 1

    band(model, collection, "copperskiff_team_coaming_wall", outline,
         -.025, depth * .48 + .035, "team", hull)
    inner_scale = 1 - settings["team_coaming_width"] / (beam / 2)
    outer = [(x * 1.005, y * 1.005, depth * .48 + .04) for x, y in outline]
    inner = [(x * inner_scale, y * inner_scale, depth * .48 + .04) for x, y in outline]
    coaming_faces = [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
    model.mesh(collection, "copperskiff_team_top_coaming", outer + inner, coaming_faces, "team", hull)
    deck_vertices = [(x * .96, y * .96, depth * .48 - .015) for x, y in outline]
    model.mesh(collection, "copperskiff_dark_open_deck", deck_vertices,
               [tuple(range(count))], "wood_dark", hull)

    # The foredeck stays TEAM even where the canopy hides the side walls.
    foredeck = [(beam * x, length * y, depth * .48 + .045)
                for x, y in settings["foredeck_outline"]]
    model.mesh(collection, "copperskiff_team_foredeck", foredeck, [tuple(range(5))], "team", hull)

    nozzle = model.empty(collection, "copperskiff_bow_kettle_spout", (0, -length * .56, .10), hull)
    rig["nozzle"] = nozzle
    model.tube(collection, "copperskiff_curved_bow_spout",
               ((0, 0, 0), (0, -.13, .06), (0, -.24, .22)),
               (.14, .13, .105), "copper", nozzle, sides=8)
    model.ellipsoid(collection, "copperskiff_spout_mouth", (0, -.245, .22),
                    (.082, .035, .075), "iron", nozzle, segments=8, rings=4)
    lid = model.empty(collection, "copperskiff_kettle_lid_hinge", (0, .11, depth * .48 + .03), hull)
    rig["lid"] = lid
    model.lathe(collection, "copperskiff_kettle_lid",
                ((0, .16), (.025, .19), (.07, .12)), "copper", lid,
                center=(0, -.14, 0), segments=16)
    model.ellipsoid(collection, "copperskiff_lid_knob", (0, -.14, .105),
                    (.055, .055, .045), "copper_dark", lid, segments=8, rings=4)

    # A wide, split stern contrasts with the single pointed prow at native size.
    stern = model.empty(collection, "copperskiff_stern_fork", (0, length * .43, .12), hull)
    rig["stern"] = stern
    for side in (-1, 1):
        stern_face = model.prism(
            collection, "copperskiff_stern_board_" + str(side),
            ((-.12, -.10), (.12, -.10), (.15, .20), (-.15, .20)), .10,
            "team", stern, center=(side * beam * .28, 0, .06), bevel=0,
        )
        stern_face.rotation_euler[0] = -12 * model.DEG
    prop = model.empty(collection, "copperskiff_pusher_propeller", (0, length * .59, .15), hull)
    rig["propeller"] = prop
    model.tube(collection, "copperskiff_propeller_axle",
               ((0, length * .43, .15), (0, length * .59, .15)), .04, "copper_dark", hull, sides=6)
    model.ellipsoid(collection, "copperskiff_pusher_disc", (0, 0, 0),
                    (.16, .035, .16), "copper_dark", prop, segments=12, rings=6)

    canopy = settings["canopy"]
    balloon = model.empty(collection, "copperskiff_canvas_awning",
                          (0, canopy["offset_y"], canopy["center_z"]), body)
    rig["balloon"] = balloon
    centers = (0,)
    rx, ry, rz = canopy["radii"]
    for index, x in enumerate(centers):
        if canopy["mode"] == "directional":
            lens = directional_canvas(model, collection, "copperskiff_canvas_lens_" + str(index),
                                      canopy, balloon)
        else:
            lens = model.ellipsoid(collection, "copperskiff_canvas_lens_" + str(index),
                                   (x, 0, 0), (rx, ry, rz), "canvas", balloon, segments=20, rings=10)
        lens.data.materials.append(model.MATERIALS["canvas_shade"])
        for polygon in lens.data.polygons:
            if polygon.center.x < -.15 and polygon.center.y > .1:
                polygon.material_index = 1
        for binding_index, seam_y in enumerate((-ry * .45, ry * .45)):
            section_width, section_height = canvas_section(canopy, seam_y)
            points = [(x + section_width * math.cos(math.pi * step / 10),
                       seam_y, section_height * math.sin(math.pi * step / 10) + .01)
                      for step in range(11)]
            model.tube(collection, "copperskiff_copper_canvas_binding_" + str(index) + "_" + str(binding_index),
                       points, .016, "copper_dark", balloon, sides=4)
    support_x = min(settings["hull_beam"] * .35, rx * .80 + (abs(centers[0]) if len(centers) > 1 else 0))
    for side in (-1, 1):
        for support_index, y in enumerate((-.19, .25)):
            top_x, top_z = support_x, canopy["center_z"] - rz * .4
            if canopy["mode"] == "directional":
                section_width, section_height = canvas_section(canopy, y - canopy["offset_y"])
                top_x = section_width * .80
                top_z = canopy["center_z"] - section_height * .4
            model.tube(collection, "copperskiff_canvas_support_" + str(side) + "_" + str(support_index),
                       ((side * support_x, y, settings["hull_center_z"] + depth * .48),
                        (side * top_x, y, top_z)),
                       .025, "wood_dark", body, sides=4)
    flag = model.empty(collection, "copperskiff_leaf_flag", (0, .18, canopy["center_z"] + rz), body)
    rig["flag"] = flag
    model.tube(collection, "copperskiff_flag_mast", ((0, 0, 0), (0, 0, .13)),
               .022, "copper_dark", flag, sides=4)
    model.leaf(collection, "copperskiff_team_leaf_pennant", (.08, 0, .115),
               .16, .24, "team", flag, roll=-65)

    puff = model.empty(collection, "copperskiff_contact_puff", (0, -.37, .30), nozzle)
    rig["puff"] = puff
    radius = settings["contact_puff_radius"]
    for index, (x, y, z, scale) in enumerate(((0, 0, 0, 1), (-.13, -.06, .07, .65), (.13, -.09, -.04, .65))):
        model.ellipsoid(collection, "copperskiff_ember_puff_" + str(index), (x, y, z),
                        (radius * scale, radius * scale, radius * scale),
                        "ember", puff, segments=8, rings=4)
    puff.scale = (.001,) * 3
    char["rest_transforms"] = {name: (tuple(obj.location), tuple(obj.scale)) for name, obj in rig.items()}
    char["role"] = "Existing flying ranged unit targeting ground and air"
    char["height"] = settings["hover_base"] + canopy["center_z"] + rz + .18
    char["placement"]["design_revision"] = "ART-3D-001 round four: " + settings["id"]
    return char


def pose(model, char, motion, phase):
    body, rig, settings = char["body"], char["rig"], char["settings"]
    body.location = (0, 0, char["hover"])
    model.angles(body)
    for name, obj in rig.items():
        location, scale = char["rest_transforms"][name]
        obj.location, obj.scale = location, scale
        model.angles(obj)
    swing = (0, 1, 0, -1)[phase]
    body.location.z += (0, .025, 0, -.018)[phase]
    model.angles(rig["propeller"], y=phase * 60)
    model.angles(rig["flag"], z=-swing * 4)
    if motion == "walk":
        model.angles(body, x=-2 + swing)
    elif motion == "attack":
        body.location.y = (0, -.01, settings["contact_recoil"], .01)[phase]
        model.angles(body, x=(0, -3, settings["contact_pitch_degrees"], 2)[phase])
        model.angles(rig["lid"], x=(0, -12, -65, -8)[phase])
        rig["puff"].scale = ((.001, .001, 1, .001)[phase],) * 3
