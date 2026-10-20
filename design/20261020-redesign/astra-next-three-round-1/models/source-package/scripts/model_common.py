"""Editable, pivot-local original geometry; imports only verified primitive helpers."""
from pathlib import Path
import importlib.util
import json
import math
import sys

import bpy

ROOT = Path(__file__).resolve().parents[1]
PRIMITIVES = ROOT / 'inputs/observed-native-renderer/controls/round1_models.py'
spec = importlib.util.spec_from_file_location('frozen_astra_primitives', PRIMITIVES)
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
p.PREFIX = 'ME_SBR_R1_'
p.SOURCE_COMMIT = '90efeb43555d35569a9bb66fab7ea8de83aa5045'
PREFIX = p.PREFIX
FRAMES = {'idle': (1, 11, 21, 31), 'walk': (41, 51, 61, 71), 'attack': (90, 96, 100, 106)}
RENDER_POSES = {'idle': 1, 'walk': 51, 'contact': 100}


def materials(identifier):
    palette = json.loads((ROOT / 'palette.json').read_text())
    p.MATERIALS.clear()
    for key in palette['character_slots'][identifier]:
        settings = palette['materials'][key]
        mat = bpy.data.materials.new('TEAM' if key == 'TEAM' else PREFIX + identifier + '_' + key)
        mat.use_nodes = True
        shader = next(node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
        rgba = p.linear_color(settings['hex'])
        p.input_socket(shader, 'Base Color').default_value = rgba
        p.input_socket(shader, 'Roughness').default_value = settings['roughness']
        p.input_socket(shader, 'Metallic').default_value = settings['metallic']
        if settings.get('emission'):
            p.input_socket(shader, 'Emission Color', 'Emission').default_value = rgba
            p.input_socket(shader, 'Emission Strength').default_value = settings['emission']
        mat.diffuse_color = rgba
        mat['palette_srgb'] = settings['hex']
        mat['authorship'] = 'Original procedural flat material; see DESIGN.md'
        if key == 'TEAM':
            mat['team_zone'] = True
        p.MATERIALS[key] = mat
    return p.MATERIALS


def character(scene, identifier):
    char = p.character(scene, identifier, 0, (1, 1, 1))
    char['materials'] = materials(identifier)
    char['rest'] = {}
    char['placement']['model_revision'] = 'Astra original three-character source preparation R1'
    char['placement']['team_variant'] = 'river'
    return char


def pivot(char, name, location, parent=None):
    obj = p.empty(char['collection'], char['id'] + '_' + name, location, parent or char['body'])
    obj.rotation_mode = 'XYZ'
    char['rig'][name] = obj
    return obj


def ball(char, name, center, radii, material, parent, segments=8, rings=4):
    obj = p.ellipsoid(char['collection'], char['id'] + '_' + name, center, radii, material,
                      parent, segments=segments, rings=rings)
    for face in obj.data.polygons:
        face.use_smooth = False
    return obj


def plate(char, name, outline, thickness, material, parent, center=(0, 0, 0)):
    return p.prism(char['collection'], char['id'] + '_' + name, outline, thickness,
                   material, parent, center=center, bevel=0)


def tube(char, name, points, radius, material, parent, sides=6):
    obj = p.tube(char['collection'], char['id'] + '_' + name, points, radius, material, parent, sides=sides)
    for face in obj.data.polygons:
        face.use_smooth = False
    return obj


def rod(char, name, start, end, radius, material, parent, end_radius=None):
    return p.spindle(char['collection'], char['id'] + '_' + name, start, end, radius,
                     material, parent, end_radius=end_radius, sides=6)


def leaf(char, name, center, width, length, material, parent, roll=0):
    return p.leaf(char['collection'], char['id'] + '_' + name, center, width, length,
                  material, parent, roll=roll)


def band(char, name, center, radii, width, material, parent, axis='Z', segments=12):
    points = []
    for i in range(segments + 1):
        angle = math.tau * i / segments
        a, b = radii[0] * math.cos(angle), radii[1] * math.sin(angle)
        points.append((a, b, 0) if axis == 'Z' else ((a, 0, b) if axis == 'Y' else (0, a, b)))
    obj = tube(char, name, points, width, material, parent, sides=4)
    obj.location = center
    return obj


def humanoid_legs(char, material='wood', radius=.095):
    for side, x in (('left', -.18), ('right', .18)):
        leg = pivot(char, side + '_leg', (x, .02, .68))
        rod(char, side + '_leg_upper', (0, 0, 0), (0, -.015, -.28), radius, material, leg)
        rod(char, side + '_leg_lower', (0, -.015, -.28), (0, -.015, -.53), radius * .84, material, leg)
        ball(char, side + '_boot', (0, -.09, -.60), (.12, .19, .08), material, leg, rings=3)


def remember_rest(char):
    for obj in (char['body'], *char['rig'].values()):
        char['rest'][obj.name] = {'location': tuple(obj.location),
                                 'rotation_euler': tuple(obj.rotation_euler), 'scale': tuple(obj.scale)}


def reset_pose(char):
    for obj in (char['body'], *char['rig'].values()):
        for channel, value in char['rest'][obj.name].items():
            setattr(obj, channel, value)


def angles(obj, x=0, y=0, z=0):
    obj.rotation_euler = tuple(math.radians(value) for value in (x, y, z))


def animate(scene, char, pose):
    """Three named NLA tracks, with original framework key ranges and contact=100."""
    remember_rest(char)
    objects = (char['body'], *char['rig'].values())
    for motion, frames in FRAMES.items():
        for obj in objects:
            data = obj.animation_data_create()
            data.action = bpy.data.actions.new(f'{char["id"]}_{obj.name}_{motion}')
        for phase, frame in enumerate(frames):
            pose(char, motion, phase)
            for obj in objects:
                for channel in ('location', 'rotation_euler', 'scale'):
                    obj.keyframe_insert(data_path=channel, frame=frame, group=motion)
        for obj in objects:
            data = obj.animation_data
            action = data.action
            track = data.nla_tracks.new()
            track.name = motion
            strip = track.strips.new(motion, frames[0], action)
            strip.name = motion
            strip.extrapolation = 'NOTHING'
            strip.blend_type = 'REPLACE'
            data.action = None
    char['placement']['animation_contract'] = json.dumps({
        'kind': 'authored visual samples; no gameplay timing authority',
        'frames': FRAMES, 'named_clips': list(FRAMES), 'attack_contact_frame': 100,
        'reduced_motion': 'idle frame 1', 'sample_from': 'simulation tick and accepted pose phase',
        'runtime_12_column_atlas_implemented': False,
    }, sort_keys=True)
    scene.frame_set(1)
    bpy.context.view_layer.update()
