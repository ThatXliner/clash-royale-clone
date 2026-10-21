"""Bounded ART-3D-SKY-002 build, full preservation, and native semantic evidence."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline as pipe
import skymaul
from model_common import animate, ROOT, RENDER_POSES
from render_saved import png, image_record

DIRECTIONS = ('north', 'east', 'south', 'west')
TEAMS = ('river', 'ember')
HEAD = {'angular_head', 'face_plane', 'head_copper_binding'}
CHEST = {'chest_stone', 'warm_core', 'chest_core_rim', 'team_chest_inset'}
HAMMER = {'smith_hammer_head', 'hammer_copper_collar'}
LOWER = {'floating_waist', 'floating_lower_left', 'floating_lower_right'}
GROUPS = ('head', 'chest', 'left_fist', 'right_fist', 'lower', 'core',
          'stone', 'copper', 'hammer_head', 'weapon', 'team', 'ring', 'top_facets', 'head_stone')


def obj_key(obj):
    return obj.name.removeprefix(pipe.PREFIX + 'skymaul_')


def material_key(mat):
    return mat.name.removeprefix(pipe.PREFIX + 'skymaul_')


def memberships(obj, material):
    key, token = obj_key(obj), material_key(material)
    ring = bool(obj.get('presentation_ground_marker'))
    groups = set()
    if ring:
        groups.add('ring')
    else:
        if key in HEAD:
            groups.add('head')
        if key == 'angular_head':
            groups.add('head_stone')
        if key in CHEST:
            groups.add('chest')
        if key in HAMMER:
            groups.add('hammer_head')
        if key in HAMMER or key == 'smith_hammer_handle':
            groups.add('weapon')
        if key in LOWER:
            groups.add('lower')
        if key == 'warm_core':
            groups.add('core')
        for side in ('left', 'right'):
            if key in {side + '_fist', side + '_wrist_band', side + '_knuckle_0', side + '_knuckle_1'}:
                groups.add(side + '_fist')
        if token in ('stone', 'copper'):
            groups.add(token)
        if token == 'stone_light':
            groups.add('top_facets')
    if token == 'TEAM':
        groups.add('team')
    return groups


def full_state(scene, char):
    state = pipe.exact_state(scene, char)
    state['all_material_names'] = sorted({mat.name for obj in pipe.scene_meshes(scene)
                                          for mat in obj.data.materials if mat})
    state['lights'] = {obj.name: {'type': obj.data.type, 'energy': obj.data.energy,
        'color': list(obj.data.color), 'shape': obj.data.shape, 'size': obj.data.size}
        for obj in scene.objects if obj.type == 'LIGHT'}
    state['world'] = {'name': scene.world.name, 'use_nodes': scene.world.use_nodes,
        'nodes': [{'name': node.name, 'type': node.bl_idname,
                   'inputs': {socket.identifier: pipe.serial(socket.default_value) for socket in node.inputs
                              if hasattr(socket, 'default_value')}} for node in scene.world.node_tree.nodes],
        'links': sorted([link.from_node.name, link.from_socket.identifier, link.to_node.name, link.to_socket.identifier]
                        for link in scene.world.node_tree.links)}
    state['sprite_camera_contract'] = scene['sprite_camera_contract']
    state['placement_properties'] = {key: pipe.serial(value) for key, value in char['placement'].items()}
    state['scene_frame'] = {'frame': scene.frame_current, 'subframe': scene.frame_subframe}
    return state


def compare_states(before, after, output, label):
    output.mkdir(parents=True, exist_ok=True)
    before_path, after_path = output / (label + '-before.json'), output / (label + '-after.json')
    pipe.write_json(before_path, before)
    pipe.write_json(after_path, after)
    numeric, token = [], []
    def walk(a, b, path):
        if type(a) is dict and type(b) is dict:
            if a.keys() != b.keys():
                numeric.append({'path': path, 'before_keys': list(a), 'after_keys': list(b)})
            for key in sorted(a.keys() & b.keys()):
                walk(a[key], b[key], path + '/' + key)
        elif isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
            if len(a) != len(b):
                numeric.append({'path': path, 'before_length': len(a), 'after_length': len(b)})
            for i, (aa, bb) in enumerate(zip(a, b)):
                walk(aa, bb, path + '/' + str(i))
        elif a != b:
            numeric.append({'path': path, 'before': a, 'after': b})
        elif json.dumps(a, allow_nan=False) != json.dumps(b, allow_nan=False):
            token.append({'path': path, 'before': a, 'after': b,
                          'before_token': json.dumps(a), 'after_token': json.dumps(b)})
    walk(before, after, '')
    result = {'label': label, 'numeric_exact_equal': not numeric, 'byte_identical': before_path.read_bytes() == after_path.read_bytes(),
              'numeric_difference_count': len(numeric), 'equal_numeric_token_difference_count': len(token),
              'numeric_differences': numeric, 'equal_numeric_token_differences': token,
              'before': pipe.file_record(before_path), 'after': pipe.file_record(after_path),
              'rounding': False, 'epsilon': False, 'signed_zero_normalization': False}
    pipe.write_json(output / (label + '-proof.json'), result)
    return result


def every_frame_projection(scene, char):
    rows, failures = [], []
    for team in TEAMS:
        pipe.set_team(char, team)
        for direction in DIRECTIONS:
            scene.camera = char['cameras'][direction]
            camera = scene.camera
            vector = camera.matrix_world.to_quaternion() @ Vector((0, 0, -1))
            elevation = math.degrees(math.atan2(-vector.z, math.hypot(vector.x, vector.y)))
            for frame in range(1, 107):
                scene.frame_set(frame, subframe=0)
                bpy.context.view_layer.update()
                origin = world_to_camera_view(scene, camera, char['placement'].matrix_world.translation)
                forward = world_to_camera_view(scene, camera, char['placement'].matrix_world @ Vector((0, -1, 0)))
                delta = [float(forward.x - origin.x), float(origin.y - forward.y)]
                anchor = [float(origin.x) * 64, float(1 - origin.y) * 64]
                axis, sign = {'north': (1, -1), 'east': (0, 1), 'south': (1, 1), 'west': (0, -1)}[direction]
                body = pipe.projected_bounds(scene, char['collection'].all_objects)
                all_bounds = pipe.projected_bounds(scene, pipe.scene_meshes(scene))
                margins = [all_bounds['left'] * 64, all_bounds['top'] * 64,
                           (1 - all_bounds['right']) * 64, (1 - all_bounds['bottom']) * 64]
                checks = {'crop_at_least_4': min(margins) >= 4,
                    'camera_elevation': abs(elevation - 50) <= .001,
                    'ortho_scale': abs(camera.data.ortho_scale - 8.025) <= 1e-5,
                    'anchor': max(abs(anchor[i] - (32, 54)[i]) for i in (0, 1)) <= 64e-5,
                    'actor_heading': delta[axis] * sign > .01 and abs(delta[1-axis]) <= 1e-5}
                record = {'team': team, 'direction': direction, 'frame': frame, 'body_bounds': body,
                    'body_height_px': (body['bottom'] - body['top']) * 64,
                    'body_width_px': (body['right'] - body['left']) * 64,
                    'all_bounds': all_bounds, 'crop_margins_px': margins, 'ground_anchor_px': anchor,
                    'actor_forward_screen_delta': delta, 'camera_elevation_degrees': elevation,
                    'ortho_scale': camera.data.ortho_scale, 'checks': checks}
                rows.append(record)
                if not all(checks.values()):
                    failures.append(record)
    pipe.set_team(char, 'river')
    scene.frame_set(1, subframe=0)
    scene.camera = char['cameras']['south']
    return {'integer_frames': [1, 106], 'records': rows, 'failures': failures,
            'min_margin_px': min(min(row['crop_margins_px']) for row in rows),
            'no_per_view_fit_crop_scale_or_mirror': True}


def export_actor(scene, char, path):
    for obj in scene.objects:
        obj.select_set(False)
    selected = list(char['collection'].all_objects)
    for obj in selected:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = char['placement']
    args = {'filepath': str(path), 'use_selection': True, 'use_active_scene': True,
            'export_format': 'GLB', 'export_animations': True, 'export_frame_range': True,
            'export_force_sampling': True, 'export_apply': False, 'export_cameras': False,
            'export_lights': False, 'export_animation_mode': 'NLA_TRACKS',
            'export_anim_slide_to_zero': True, 'export_optimize_animation_keep_anim_object': True}
    if 'FINISHED' not in bpy.ops.export_scene.gltf(**args):
        raise RuntimeError('GLB actor export did not finish')
    return {**pipe.inspect_glb(path, [obj.name for obj in selected]), 'export_settings': args}


def build(output):
    output.mkdir(parents=True, exist_ok=False)
    scene = bpy.data.scenes.new(pipe.PREFIX + 'skymaul_editable')
    pipe.activate(scene)
    char = skymaul.build(scene)
    pipe.studio(scene, char)
    pipe.ground_rings(scene, char)
    animate(scene, char, skymaul.pose)
    geometry = pipe.geometry_receipt(scene, char)
    projection = every_frame_projection(scene, char)
    pipe.write_json(output / 'every-frame-crop.json', projection)
    before = full_state(scene, char)
    pipe.write_json(output / 'canonical-state.json', before)
    glb = output / 'skymaul.glb'
    glb_inspection = export_actor(scene, char, glb)
    proofs = [compare_states(before, full_state(scene, char), output / 'preservation', 'post-export')]
    scene.frame_set(1, subframe=0)
    scene.camera = char['cameras']['south']
    blend = output / 'skymaul.blend'
    bpy.data.libraries.write(str(blend), {scene}, fake_user=True)
    proofs.append(compare_states(before, full_state(scene, char), output / 'preservation', 'post-save'))
    pipe.write_json(output / 'build-receipt.json', {'status': 'candidate generated; independent review pending',
        'base': '16b8ad1664117dcb928ce3bcf3e2fdac45ab23a9', 'blender_version': bpy.app.version_string,
        'authorship': 'Original procedural Skymaul revision; Claude design direction and Astra authoring',
        'license': 'AGPL-3.0-only', 'reference_imported': False, 'runtime_integration': False,
        'geometry': geometry, 'glb_inspection': glb_inspection,
        'blend': pipe.file_record(blend), 'glb': pipe.file_record(glb),
        'crop_failures': len(projection['failures']), 'min_crop_margin_px': projection['min_margin_px'],
        'preservation': [{'label': p['label'], 'numeric_exact_equal': p['numeric_exact_equal'],
            'byte_identical': p['byte_identical']} for p in proofs]})
    print(json.dumps({'stage': 'build', 'output': str(output), 'geometry': geometry['all_authored_evaluated_triangles'],
                      'crop_failures': len(projection['failures'])}), flush=True)


def emission_material(rgb, name):
    mat = bpy.data.materials.new('SKY002_DIAGNOSTIC_' + name)
    mat.use_nodes = True
    mat.node_tree.nodes.clear()
    output = mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
    shader = mat.node_tree.nodes.new('ShaderNodeEmission')
    shader.inputs['Color'].default_value = (*rgb, 1)
    shader.inputs['Strength'].default_value = 1
    mat.node_tree.links.new(shader.outputs[0], output.inputs['Surface'])
    return mat


def capture(scene, output, team, direction, pose, kind, semantic=False):
    name = f'skymaul-{team}-{direction}-{pose}-{kind}.png'
    raw, native = output / 'raw-256' / name, output / 'native-64' / name
    scene.render.filepath = str(raw)
    bpy.context.view_layer.update()
    bpy.ops.render.render(write_still=True, scene=scene.name)
    w, h, pixels = png.read_rgba(raw)
    assert (w, h) == (256, 256)
    w, h, reduced = png.box(w, h, pixels, 4)
    png.png(native, w, h, reduced)
    record = {'team': team, 'direction': direction, 'pose': pose, 'frame': RENDER_POSES[pose], 'kind': kind,
        'raw': image_record(raw), 'native': image_record(native), 'semantic': semantic,
        'origin': 'fresh saved-Blend render, no geometry or camera adjustment',
        'view_transform': scene.view_settings.view_transform,
        'visible_meshes': sorted(obj.name for obj in pipe.scene_meshes(scene) if not obj.hide_render)}
    return record, reduced


def render(output, model_dir, team_limit=None):
    (output / 'raw-256').mkdir(parents=True, exist_ok=False)
    (output / 'native-64').mkdir()
    (output / 'semantic-64').mkdir()
    scene, char = pipe.find_saved('skymaul')
    canonical = json.loads((model_dir / 'canonical-state.json').read_text())
    blend = pipe.file_record(model_dir / 'skymaul.blend')
    proofs = [compare_states(canonical, full_state(scene, char), output / 'preservation', 'fresh-load')]
    records, semantic_records = [], []
    baseline_materials = {obj: list(obj.data.materials) for obj in pipe.scene_meshes(scene)}
    baseline_visibility = {obj: (obj.hide_render, obj.hide_viewport) for obj in pipe.scene_meshes(scene)}
    view = (scene.view_settings.view_transform, scene.view_settings.look,
            scene.view_settings.exposure, scene.view_settings.gamma)
    materials = {}
    try:
        for rgb in ((r, g, b) for r in (0, 1) for g in (0, 1) for b in (0, 1)):
            materials[rgb] = emission_material(rgb, ''.join(str(x) for x in rgb))
        for team in (team_limit,) if team_limit else TEAMS:
            for direction in DIRECTIONS:
                for pose, frame in RENDER_POSES.items():
                    pipe.set_team(char, team)
                    for obj, originals in baseline_materials.items():
                        for i, mat in enumerate(originals):
                            obj.data.materials[i] = mat
                        if not obj.get('presentation_ground_marker'):
                            obj.hide_render, obj.hide_viewport = baseline_visibility[obj]
                    pipe.enum_readback(scene.view_settings, 'view_transform', (view[0],))
                    pipe.enum_readback(scene.view_settings, 'look', (view[1],))
                    scene.view_settings.exposure, scene.view_settings.gamma = view[2:]
                    scene.frame_set(frame, subframe=0)
                    scene.camera = char['cameras'][direction]
                    scene.render.resolution_x = scene.render.resolution_y = 256
                    bpy.context.view_layer.update()
                    records.append(capture(scene, output, team, direction, pose, 'color')[0])
                    for obj in char['presentation'].objects:
                        obj.hide_render = obj.hide_viewport = True
                    records.append(capture(scene, output, team, direction, pose, 'body-only')[0])
                    pipe.enum_readback(scene.view_settings, 'view_transform', ('Raw',))
                    pipe.enum_readback(scene.view_settings, 'look', ('None',))
                    scene.view_settings.exposure, scene.view_settings.gamma = 0, 1
                    for obj in list(char['collection'].all_objects):
                        if obj.type == 'MESH':
                            for i in range(len(obj.data.materials)):
                                obj.data.materials[i] = materials[(1, 1, 1)]
                    for kind, include in (
                        ('isolated-hammer-head', lambda obj: obj_key(obj) in HAMMER),
                        ('other-actor', lambda obj: obj_key(obj) not in HAMMER),
                        ('isolated-head', lambda obj: obj_key(obj) in HEAD),
                        ('isolated-chest', lambda obj: obj_key(obj) in CHEST),
                        ('isolated-left-fist', lambda obj: obj_key(obj) in {'left_fist', 'left_wrist_band', 'left_knuckle_0', 'left_knuckle_1'}),
                        ('isolated-right-fist', lambda obj: obj_key(obj) in {'right_fist', 'right_wrist_band', 'right_knuckle_0', 'right_knuckle_1'}),
                        ('isolated-lower', lambda obj: obj_key(obj) in LOWER),
                        ('isolated-core', lambda obj: obj_key(obj) == 'warm_core'),
                    ):
                        for obj in list(char['collection'].all_objects):
                            if obj.type == 'MESH':
                                obj.hide_render = obj.hide_viewport = not include(obj)
                        records.append(capture(scene, output, team, direction, pose, kind, True)[0])
                    for obj in list(char['collection'].all_objects):
                        if obj.type == 'MESH':
                            obj.hide_render, obj.hide_viewport = baseline_visibility[obj]
                    pipe.set_team(char, team)
                    for obj in list(char['collection'].all_objects):
                        if obj.type == 'MESH':
                            obj.hide_render = obj.hide_viewport = True
                    for obj in char['presentation'].objects:
                        for i in range(len(obj.data.materials)):
                            obj.data.materials[i] = materials[(1, 1, 1)]
                    records.append(capture(scene, output, team, direction, pose, 'isolated-ring', True)[0])
                    for obj in list(char['collection'].all_objects):
                        if obj.type == 'MESH':
                            obj.hide_render, obj.hide_viewport = baseline_visibility[obj]
                    for start in range(0, len(GROUPS), 3):
                        batch = GROUPS[start:start+3]
                        for obj, originals in baseline_materials.items():
                            for i, original in enumerate(originals):
                                groups = memberships(obj, original)
                                rgb = tuple(int(channel < len(batch) and batch[channel] in groups) for channel in range(3))
                                obj.data.materials[i] = materials[rgb]
                        packed, pixels = capture(scene, output, team, direction, pose, 'semantic-' + str(start // 3), True)
                        records.append(packed)
                        for channel, group in enumerate(batch):
                            mask = bytearray(len(pixels))
                            for j in range(0, len(pixels), 4):
                                coverage = round(pixels[j + channel] * pixels[j+3] / 255)
                                mask[j:j+4] = bytes((255, 255, 255, coverage))
                            path = output / 'semantic-64' / f'skymaul-{team}-{direction}-{pose}-{group}.png'
                            png.png(path, 64, 64, mask)
                            semantic_records.append({'team': team, 'direction': direction, 'pose': pose, 'group': group,
                                'channel': channel, 'packed_render': packed['native']['path'],
                                'coverage_definition': 'Raw linear pure-emission channel multiplied by full alpha; 4:1 premultiplied box filter',
                                **pipe.file_record(path)})
                    print(json.dumps({'stage': 'render', 'team': team, 'direction': direction, 'pose': pose}), flush=True)
    finally:
        for obj, originals in baseline_materials.items():
            for i, mat in enumerate(originals):
                obj.data.materials[i] = mat
            obj.hide_render, obj.hide_viewport = baseline_visibility[obj]
        pipe.enum_readback(scene.view_settings, 'view_transform', (view[0],))
        pipe.enum_readback(scene.view_settings, 'look', (view[1],))
        scene.view_settings.exposure, scene.view_settings.gamma = view[2:]
        pipe.set_team(char, 'river')
        scene.camera = char['cameras']['south']
        scene.frame_set(1, subframe=0)
        for mat in materials.values():
            if mat.users:
                raise RuntimeError('Temporary semantic material still in use')
            bpy.data.materials.remove(mat)
        proofs.append(compare_states(canonical, full_state(scene, char), output / 'preservation', 'mask-restoration'))
        pipe.write_json(output / 'partial-render-receipt.json', {'images': records, 'semantic_masks': semantic_records})
    visibility = {obj: (obj.hide_render, obj.hide_viewport) for obj in char['presentation'].objects}
    try:
        for obj in visibility:
            obj.hide_render = obj.hide_viewport = True
        scene.camera = char['portrait_camera']
        scene.render.resolution_x = scene.render.resolution_y = 512
        portrait = output / 'skymaul-portrait.png'
        scene.render.filepath = str(portrait)
        bpy.ops.render.render(write_still=True, scene=scene.name)
    finally:
        for obj, states in visibility.items():
            obj.hide_render, obj.hide_viewport = states
        scene.render.resolution_x = scene.render.resolution_y = 256
        scene.camera = char['cameras']['south']
        scene.frame_set(1, subframe=0)
    proofs.append(compare_states(canonical, full_state(scene, char), output / 'preservation', 'final-render'))
    after_blend = pipe.file_record(model_dir / 'skymaul.blend')
    pipe.write_json(output / 'render-receipt.json', {'status': 'rendered candidate evidence; independent review pending',
        'images': records, 'semantic_masks': semantic_records, 'portrait': image_record(portrait),
        'blend_before': blend, 'blend_after': after_blend, 'saved_blend_bytes_unchanged': blend == after_blend,
        'teams': [team_limit] if team_limit else list(TEAMS), 'directions': list(DIRECTIONS), 'poses': RENDER_POSES,
        'semantic_groups': GROUPS, 'body_includes_weapon': True, 'native_cell_px': 64,
        'preservation': [{'label': p['label'], 'numeric_exact_equal': p['numeric_exact_equal'],
            'byte_identical': p['byte_identical']} for p in proofs],
        'runtime_integration': False, 'independent_quality_verdict': 'pending'})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage', choices=('build', 'render'))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--model-dir', type=Path)
    parser.add_argument('--team', choices=TEAMS)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if not bpy.app.background:
        raise RuntimeError('Fresh background Blender required')
    if args.stage == 'build':
        build(args.output.resolve())
    else:
        render(args.output.resolve(), args.model_dir.resolve(), args.team)


if __name__ == '__main__':
    main()
