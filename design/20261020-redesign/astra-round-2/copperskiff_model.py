"""Original broad-form revision. All coordinates are authored here; no assets."""

import math


def build(model, scene, settings):
    char = model.character(scene, "copperskiff", 1.8, (1, 1, 1),
                           hover=settings["hover_base"])
    c, body, rig = char["collection"], char["body"], char["rig"]
    char["settings"] = settings
    hull = model.empty(c, "copperskiff_kettle_hull",
                       (0, 0, settings["hull_center_z"]), body)
    rig["hull"] = hull
    hull.scale = (settings["hull_beam_scale"], settings["hull_length_scale"],
                  settings["hull_depth_scale"])
    sections = (
        (-.46, .045, .04, .095), (-.35, .26, .115, .025),
        (-.16, .38, .17, 0), (.18, .37, .165, 0),
        (.37, .27, .12, .025), (.43, .16, .065, .065),
    )
    vertices, faces, sides = [], [], 12
    for y, beam, depth, rise in sections:
        for side in range(sides):
            angle = math.tau * side / sides
            vertices.append((beam * math.cos(angle), y, rise + depth * math.sin(angle)))
    faces.append(tuple(reversed(range(sides))))
    for row in range(len(sections) - 1):
        for side in range(sides):
            after = (side + 1) % sides
            faces.append((row * sides + side, row * sides + after,
                          (row + 1) * sides + after, (row + 1) * sides + side))
    faces.append(tuple((len(sections) - 1) * sides + side for side in range(sides)))
    shell = model.mesh(c, "copperskiff_copper_kettle_shell", vertices, faces,
                       "copper", hull, smooth=True)
    shell.data.materials.append(model.MATERIALS["copper_dark"])
    for polygon in shell.data.polygons:
        z = sum(shell.data.vertices[i].co.z for i in polygon.vertices) / len(polygon.vertices)
        polygon.material_index = 1 if z < -.07 else 0

    # The broad painted belt is exposed at bow and stern as well as broadside.
    band_vertices = []
    band_height = settings["team_band_height"]
    for z in (-band_height / 2 - .025, band_height / 2 - .025):
        for side in range(12):
            angle = math.tau * side / 12
            band_vertices.append((.384 * math.cos(angle), .405 * math.sin(angle), z))
    band_faces = [(i, (i + 1) % 12, (i + 1) % 12 + 12, i + 12) for i in range(12)]
    model.mesh(c, "copperskiff_team_hull_belt", band_vertices, band_faces, "team", hull)
    ring(model, c, "copperskiff_copper_gunwale", (0, 0, .135),
         (.35, .39), .027, "copper", hull)
    model.ellipsoid(c, "copperskiff_dark_open_deck", (0, 0, .14),
                    (.33, .365, .035), "wood_dark", hull, segments=12, rings=4)

    for side, x in (("port", -.365), ("starboard", .365)):
        port = model.empty(c, "copperskiff_" + side + "_porthole", (x, -.07, .075), hull)
        port.rotation_euler[2] = (-90 if x < 0 else 90) * model.DEG
        ring(model, c, "copperskiff_" + side + "_porthole_rim",
             (0, 0, 0), (.075, .075), .018, "copper", port, axis="Y")
        model.ellipsoid(c, "copperskiff_" + side + "_porthole_glass",
                        (0, -.008, 0), (.058, .014, .058),
                        "iron", port, segments=8, rings=4)

    nozzle = model.empty(c, "copperskiff_bow_kettle_spout", (0, -.40, .015), hull)
    rig["nozzle"] = nozzle
    model.tube(c, "copperskiff_curved_kettle_spout",
               ((0, 0, 0), (0, -.09, .025), (0, -.17, .08), (0, -.20, .16)),
               (.09, .085, .072, .065), "copper", nozzle, sides=6)
    mouth = model.ellipsoid(c, "copperskiff_spout_opening", (0, -.202, .16),
                            (.05, .022, .048), "iron", nozzle, segments=8, rings=4)
    mouth.rotation_euler[0] = -35 * model.DEG

    lid = model.empty(c, "copperskiff_hinged_kettle_lid", (0, .135, .175), hull)
    rig["lid"] = lid
    model.lathe(c, "copperskiff_kettle_lid",
                ((0, .12), (.025, .145), (.055, .09)), "copper", lid,
                center=(0, -.115, 0), segments=12)
    model.ellipsoid(c, "copperskiff_lid_knob", (0, -.115, .08),
                    (.035, .035, .035), "wood_dark", lid, segments=8, rings=4)
    model.tube(c, "copperskiff_kettle_handle",
               ((-.13, .30, .12), (-.15, .39, .25), (.15, .39, .25), (.13, .30, .12)),
               .03, "copper_dark", hull, sides=4)

    balloon = model.empty(c, "copperskiff_canvas_lens",
                          (0, 0, settings["envelope_center_z"]), body)
    rig["balloon"] = balloon
    rx, ry, rz = settings["envelope_radii"]
    envelope = model.ellipsoid(
        c, "copperskiff_sewn_canvas_envelope", (0, 0, 0), (rx, ry, rz),
        "canvas", balloon, segments=settings["envelope_segments"],
        rings=settings["envelope_rings"],
    )
    envelope.data.materials.append(model.MATERIALS["canvas_shade"])
    for polygon in envelope.data.polygons:
        x = sum(envelope.data.vertices[i].co.x for i in polygon.vertices) / len(polygon.vertices)
        y = sum(envelope.data.vertices[i].co.y for i in polygon.vertices) / len(polygon.vertices)
        polygon.material_index = 1 if x < -.12 and y > .15 else 0
    for index, y in enumerate((-.22, .22)):
        r = math.sqrt(1 - (y / ry) ** 2)
        ring(model, c, "copperskiff_copper_sail_strap_" + str(index),
             (0, y, 0), (rx * r + .006, rz * r + .006),
             .013, "copper_dark", balloon, axis="Y")
    for index, x in enumerate((-.22, .22)):
        r = math.sqrt(1 - (x / rx) ** 2)
        points = [(x, -ry * r * math.cos(math.pi * i / 8),
                   (rz * r + .008) * math.sin(math.pi * i / 8)) for i in range(9)]
        model.tube(c, "copperskiff_copper_longitudinal_strap_" + str(index),
                   points, .012, "copper_dark", balloon, sides=4)

    # Four outer supports leave a real empty volume between the two major masses.
    # None is a camera-facing card; all cardinal views use the same geometry.
    for side, x in (("port", -.26), ("starboard", .26)):
        for index, y in enumerate((-.23, .23)):
            model.tube(c, "copperskiff_" + side + "_suspension_" + str(index),
                       ((x, y, settings["hull_center_z"] + .145),
                        (x * 1.12, y * 1.12, settings["envelope_center_z"] - .055)),
                       settings["rigging_radius"], "wood_dark", body, sides=4)

    flag = model.empty(c, "copperskiff_leaf_flag",
                       (0, .10, settings["envelope_center_z"] + rz), body)
    rig["flag"] = flag
    model.tube(c, "copperskiff_flag_mast", ((0, 0, 0), (0, 0, .18)),
               .018, "copper_dark", flag, sides=4)
    pennant = model.leaf(c, "copperskiff_team_leaf_pennant", (.08, 0, .135),
                         .135, .22, "team", flag, roll=-65)
    pennant.rotation_euler[2] = 25 * model.DEG

    rudder = model.empty(c, "copperskiff_stern_canvas_rudder",
                         (0, .36, settings["envelope_center_z"]), body)
    rig["rudder"] = rudder
    for side in (-1, 1):
        fin = model.leaf(c, "copperskiff_tail_fin_" + str(side),
                         (side * .15, .045, 0), .15, .27, "canvas_shade", rudder, roll=side * 65)
        fin.rotation_euler[0] = 70 * model.DEG

    model.tube(c, "copperskiff_pusher_propeller_shaft",
               ((0, .37, .20), (0, .55, .20)), .027, "copper_dark", hull, sides=6)
    prop = model.empty(c, "copperskiff_pusher_propeller", (0, .56, .20), hull)
    rig["propeller"] = prop
    model.ellipsoid(c, "copperskiff_pusher_disc", (0, 0, 0),
                    (.105, .025, .105), "copper_dark", prop, segments=12, rings=6)
    model.ellipsoid(c, "copperskiff_pusher_hub", (0, -.018, 0),
                    (.04, .026, .04), "copper", prop, segments=8, rings=4)

    puff = model.empty(c, "copperskiff_contact_ember_puff", (0, -.22, .18), nozzle)
    rig["puff"] = puff
    for index, (center, radii) in enumerate((
        ((0, -.075, .055), (.095, .13, .09)),
        ((-.08, -.10, .10), (.07, .085, .07)),
        ((.075, -.16, .02), (.065, .085, .065)),
    )):
        model.ellipsoid(c, "copperskiff_contact_puff_lobe_" + str(index),
                        center, radii, "ember", puff, segments=8, rings=4)
    puff.scale = (.001, .001, .001)

    char["height"] = settings["hover_base"] + settings["envelope_center_z"] + rz + .18
    char["role"] = "Existing flying ranged unit targeting ground and air"
    char["rest_transforms"] = {
        name: (tuple(obj.location), tuple(obj.scale)) for name, obj in rig.items()
    }
    char["placement"]["design_revision"] = "ART-3D-001 round two: exposed boat and suspension"
    return char


def ring(model, collection, name, center, radii, thickness, material, parent, axis="Z"):
    points = []
    for i in range(13):
        angle = math.tau * i / 12
        a, b = radii[0] * math.cos(angle), radii[1] * math.sin(angle)
        points.append((a, b, 0) if axis == "Z" else (a, 0, b))
    obj = model.tube(collection, name, points, thickness, material, parent, sides=4)
    obj.location = center
    return obj


def pose(model, char, motion, phase):
    rig, body, settings = char["rig"], char["body"], char["settings"]
    body.location = (0, 0, char["hover"])
    model.angles(body)
    for name, obj in rig.items():
        model.angles(obj)
        location, scale = char["rest_transforms"][name]
        obj.location = location
        obj.scale = scale
    swing = (0, 1, 0, -1)[phase]
    body.location.z += (0, .035, 0, -.025)[phase]
    model.angles(body, x=(0, 1.4, 0, -1.2)[phase], y=swing * 1.5)
    model.angles(rig["rudder"], z=swing * 4)
    model.angles(rig["propeller"], y=phase * (60 if motion == "idle" else 120))
    model.angles(rig["flag"], z=-swing * 5)
    if motion == "walk":
        model.angles(body, x=-3 + swing, y=swing * 2)
    elif motion == "attack":
        body.location.y = (0, -.01, settings["contact_recoil"], .01)[phase]
        model.angles(body, x=(0, -3, settings["contact_pitch_degrees"], 2)[phase])
        model.angles(rig["nozzle"], x=(0, -4, 6, 0)[phase])
        model.angles(rig["lid"], x=(0, -12, -settings["contact_lid_open_degrees"], -8)[phase])
        model.angles(rig["balloon"], x=(0, 1, -2, 0)[phase])
        puff_scale = (0.001, 0.001, settings["contact_puff_scale"], 0.001)[phase]
        rig["puff"].scale = (puff_scale,) * 3
