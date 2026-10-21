"""Fixed native camera, exact local-state receipts, isolated export, shared render setup."""
import hashlib
import json
import math
from pathlib import Path
import struct

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

from model_common import ROOT, PREFIX, FRAMES, p

CAMERA = {'elevation_degrees': 50, 'orthographic_scale': 8.025, 'native_cell': 64,
          'supersample': 4, 'ground_anchor_normalized': [0.5, 0.84375],
          'directions': [('north', 180), ('east', 270), ('south', 0), ('west', 90)],
          'crop_border_pixels': 4, 'idle_body_height_pixels_target': 13}


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + '\n')


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def file_record(path):
    return {'path': str(path), 'bytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def enum_readback(owner, name, choices):
    """Dynamic enums: assignment then exact readback, as in verified renderer."""
    attempts = []
    for choice in choices:
        try:
            setattr(owner, name, choice)
        except (TypeError, ValueError) as error:
            attempts.append(str(error))
            continue
        actual = getattr(owner, name)
        if actual == choice:
            return actual
        attempts.append(f'{choice!r} read back as {actual!r}')
    raise RuntimeError(f'No supported {name} from {choices}: {attempts}')


def activate(scene):
    if bpy.context.window is None:
        raise RuntimeError('Saved-scene color management requires window context')
    bpy.context.window.scene = scene
    if bpy.context.scene != scene:
        raise RuntimeError('Active scene did not read back correctly')


def point_camera(camera, yaw, elevation, scale, target_height):
    target = Vector((0, 0, target_height))
    azimuth, pitch = math.radians(yaw), math.radians(elevation)
    camera.location = target + Vector((8 * math.sin(azimuth) * math.cos(pitch),
                                       -8 * math.cos(azimuth) * math.cos(pitch),
                                       8 * math.sin(pitch)))
    camera.data.ortho_scale = scale
    p.point_at(camera, target)


def studio(scene, char):
    activate(scene)
    collection = bpy.data.collections.new(PREFIX + char['id'] + '_studio')
    scene.collection.children.link(collection)
    world = bpy.data.worlds.new(PREFIX + char['id'] + '_warm_sky')
    world.use_nodes = True
    shader = next(node for node in world.node_tree.nodes if node.type == 'BACKGROUND')
    shader.inputs[0].default_value = p.linear_color('#9FB7B5')
    shader.inputs[1].default_value = .35
    scene.world = world
    for name, location, energy, color, size in (
        ('warm_key', (-3, -4, 6), 850, '#FFE2B8', 5),
        ('copper_rim', (3, 3, 5), 650, '#E9A83A', 4),
        ('soft_sky', (-2, 2, 3), 300, '#9FB7B5', 4),
    ):
        data = bpy.data.lights.new(PREFIX + char['id'] + '_' + name, type='AREA')
        data.energy, data.color, data.size = energy, p.linear_color(color)[:3], size
        enum_readback(data, 'shape', ('DISK',))
        obj = bpy.data.objects.new(data.name, data)
        collection.objects.link(obj)
        obj.location = location
        p.point_at(obj, (0, 0, 1))
    enum_readback(scene.render, 'engine', ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'))
    if hasattr(scene, 'eevee') and hasattr(scene.eevee, 'taa_render_samples'):
        scene.eevee.taa_render_samples = 16
    scene.render.fps, scene.render.fps_base = 60, 1
    scene.frame_start, scene.frame_end = 1, 106
    scene.render.resolution_x = scene.render.resolution_y = 256
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    enum_readback(scene.render.image_settings, 'file_format', ('PNG',))
    enum_readback(scene.render.image_settings, 'color_mode', ('RGBA',))
    enum_readback(scene.render.image_settings, 'color_depth', ('8',))
    enum_readback(scene.view_settings, 'view_transform', ('AgX', 'Standard'))
    scene.view_settings.exposure, scene.view_settings.gamma = .25, 1
    # No compositor enum is assigned. In particular, no guessed 'NONE' value.
    cameras = bpy.data.collections.new(PREFIX + char['id'] + '_cameras')
    scene.collection.children.link(cameras)
    char['cameras'] = {}
    target_height = ((CAMERA['ground_anchor_normalized'][1] - .5) * CAMERA['orthographic_scale']
                     / math.cos(math.radians(CAMERA['elevation_degrees'])))
    for direction, yaw in CAMERA['directions']:
        data = bpy.data.cameras.new(PREFIX + char['id'] + '_' + direction)
        enum_readback(data, 'type', ('ORTHO',))
        camera = bpy.data.objects.new(data.name, data)
        cameras.objects.link(camera)
        point_camera(camera, yaw, 50, 8.025, target_height)
        camera['actor_facing'] = direction
        char['cameras'][direction] = camera
    portrait_data = bpy.data.cameras.new(PREFIX + char['id'] + '_portrait')
    enum_readback(portrait_data, 'type', ('ORTHO',))
    portrait = bpy.data.objects.new(portrait_data.name, portrait_data)
    cameras.objects.link(portrait)
    point_camera(portrait, 32, 18, 2.65, 1.0)
    portrait_translation = None
    if char['id'] == 'skymaul' and 'actor_rest_lift' in char['placement']:
        lift = char['placement']['actor_rest_lift']
        intrinsic_names = ('type', 'ortho_scale', 'lens', 'sensor_width', 'sensor_height',
                           'sensor_fit', 'clip_start', 'clip_end', 'shift_x', 'shift_y')
        before = {'transform': transforms(portrait),
                  'intrinsics': {key: getattr(portrait.data, key) for key in intrinsic_names},
                  'target': [0, 0, 1.0]}
        portrait.location.z += lift
        after = {'transform': transforms(portrait),
                 'intrinsics': {key: getattr(portrait.data, key) for key in intrinsic_names},
                 'target': [0, 0, 1.0 + lift]}
        for key in before['transform']:
            if key != 'location' and before['transform'][key] != after['transform'][key]:
                raise RuntimeError(f'Portrait translation changed {key}')
        if before['intrinsics'] != after['intrinsics']:
            raise RuntimeError('Portrait translation changed camera intrinsics')
        portrait_translation = {
            'scope': 'Nonshipping standalone diagnostic portrait only',
            'reason': 'Fixed camera and target translation preserves the original actor-relative preview after intentional constant rest lift',
            'authorization': 'PORTRAIT-CAMERA-ADDENDUM.md',
            'authorization_sha256': 'b200f87c509233be3c2cf367af991ff48a9128c827dbf1db5333d517be2a9f3b',
            'authored_translation': [0, 0, lift],
            'readback_camera_location_delta': [a-b for a, b in zip(after['transform']['location'], before['transform']['location'])],
            'before': before, 'after': after,
        }
        char['placement']['diagnostic_portrait_translation'] = json.dumps(portrait_translation, sort_keys=True, allow_nan=False)
    char['portrait_camera'] = portrait
    contract = {**CAMERA, 'target_height': target_height,
                'camera_names': {key: camera.name for key, camera in char['cameras'].items()},
                'portrait_camera': portrait.name,
                'direction_semantics': 'Actual projected actor-local forward -Y; no mirroring',
                'calibration': 'Common fixed native camera; no per-view fit or crop'}
    if portrait_translation is not None:
        contract['diagnostic_portrait_translation'] = portrait_translation
    scene['sprite_camera_contract'] = json.dumps(contract, sort_keys=True)
    scene['card_id'] = char['id']
    scene.camera = char['cameras']['south']
    return contract


def ground_rings(scene, char):
    collection = bpy.data.collections.new(PREFIX + char['id'] + '_presentation')
    scene.collection.children.link(collection)
    char['presentation'] = collection
    for team in ('river', 'ember'):
        for part, outer_radius, inner_radius, z, material in (
            ('outline', .97, .40, .018, 'bone' if team == 'river' else 'ink'),
            ('team', .87, .49, .024, 'TEAM'),
        ):
            count = 36
            vertices = []
            for i in range(count):
                angle = math.tau * i / count
                outer = outer_radius
                if team == 'ember' and i % 6 in (0, 1):
                    outer -= .27
                vertices.append((outer * math.cos(angle), outer * math.sin(angle), z))
            vertices.extend((inner_radius * math.cos(math.tau * i / count),
                             inner_radius * math.sin(math.tau * i / count), z) for i in range(count))
            faces = [(i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count)]
            obj = p.mesh(collection, char['id'] + '_' + team + '_ring_' + part,
                         vertices, faces, material)
            obj['team_variant'] = team
            obj['presentation_ground_marker'] = True
            obj['shape'] = 'solid circle' if team == 'river' else 'six deep paired notches'
    set_team(char, 'river')


def scene_meshes(scene):
    return [obj for obj in scene.objects if obj.type == 'MESH']


def set_team(char, team):
    mat = char['materials']['TEAM']
    shader = next(node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    color = p.linear_color(json.loads((ROOT / 'palette.json').read_text())['teams'][team])
    p.input_socket(shader, 'Base Color').default_value = color
    mat.diffuse_color = color
    for obj in char['presentation'].objects:
        obj.hide_render = obj['team_variant'] != team
        obj.hide_viewport = obj['team_variant'] != team
    char['placement']['team_variant'] = team


def serial(value):
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    return [serial(item) for item in value]


def transforms(obj):
    return {'parent': obj.parent.name if obj.parent else None, 'rotation_mode': obj.rotation_mode,
            'location': list(obj.location), 'rotation_euler': list(obj.rotation_euler),
            'rotation_quaternion': list(obj.rotation_quaternion), 'scale': list(obj.scale),
            'delta_location': list(obj.delta_location), 'delta_rotation_euler': list(obj.delta_rotation_euler),
            'delta_scale': list(obj.delta_scale),
            'matrix_parent_inverse': [list(row) for row in obj.matrix_parent_inverse]}


def material_state(mat):
    nodes = []
    for node in mat.node_tree.nodes:
        sockets = {socket.identifier: serial(socket.default_value) for socket in node.inputs
                   if hasattr(socket, 'default_value') and not isinstance(socket.default_value, bpy.types.ID)}
        nodes.append({'name': node.name, 'type': node.bl_idname, 'inputs': sockets})
    links = sorted([link.from_node.name, link.from_socket.identifier, link.to_node.name, link.to_socket.identifier]
                   for link in mat.node_tree.links)
    return {'name': mat.name, 'diffuse_color': list(mat.diffuse_color), 'use_nodes': mat.use_nodes,
            'nodes': sorted(nodes, key=lambda item: item['name']), 'links': links}


def exact_state(scene, char):
    """Unrounded source geometry and every integer-frame local transform, never normalized."""
    activate(scene)
    initial_frame, initial_subframe = scene.frame_current, scene.frame_subframe
    scene.frame_set(1, subframe=0)
    bpy.context.view_layer.update()
    objects = sorted(scene.objects, key=lambda obj: obj.name)
    meshes, materials = {}, set()
    for obj in objects:
        if obj.type != 'MESH':
            continue
        materials.update(mat for mat in obj.data.materials if mat)
        meshes[obj.name] = {
            'data_name': obj.data.name, 'vertices': [list(vertex.co) for vertex in obj.data.vertices],
            'edges': [list(edge.vertices) for edge in obj.data.edges],
            'polygons': [{'vertices': list(face.vertices), 'material_index': face.material_index,
                          'use_smooth': face.use_smooth} for face in obj.data.polygons],
            'material_slots': [mat.name if mat else None for mat in obj.data.materials],
            'modifiers': [(mod.name, mod.type) for mod in obj.modifiers],
        }
        if obj.modifiers:
            raise RuntimeError('New source models must use evaluated explicit meshes, not hidden modifier state')
    poses = {}
    animated = [obj for obj in objects if obj.animation_data]
    tracks = {}
    for obj in animated:
        tracks[obj.name] = [
            {'name': track.name, 'mute': track.mute, 'solo': track.is_solo,
             'strips': [{'name': strip.name, 'action': strip.action.name,
                         'frame_start': strip.frame_start, 'frame_end': strip.frame_end,
                         'action_frame_start': strip.action_frame_start, 'action_frame_end': strip.action_frame_end,
                         'scale': strip.scale, 'repeat': strip.repeat, 'influence': strip.influence,
                         'blend_type': strip.blend_type, 'extrapolation': strip.extrapolation}
                        for strip in track.strips]}
            for track in obj.animation_data.nla_tracks]
    for frame in range(1, 107):
        scene.frame_set(frame, subframe=0)
        bpy.context.view_layer.update()
        poses[str(frame)] = {obj.name: transforms(obj) for obj in animated}
    scene.frame_set(1, subframe=0)
    bpy.context.view_layer.update()
    state = {'schema': 1, 'normalization_used': False, 'float_rounding_used': False,
             'objects': {obj.name: {'type': obj.type, 'transform': transforms(obj),
                                  'hide_render': obj.hide_render, 'hide_viewport': obj.hide_viewport}
                         for obj in objects},
             'meshes': meshes, 'materials': {mat.name: material_state(mat) for mat in sorted(materials, key=lambda item: item.name)},
             'animation_tracks': tracks, 'integer_frame_local_poses': poses,
             'cameras': {obj.name: {'type': obj.data.type, 'ortho_scale': obj.data.ortho_scale,
                                  'clip_start': obj.data.clip_start, 'clip_end': obj.data.clip_end}
                         for obj in objects if obj.type == 'CAMERA'},
             'view': {'transform': scene.view_settings.view_transform, 'look': scene.view_settings.look,
                      'exposure': scene.view_settings.exposure, 'gamma': scene.view_settings.gamma},
             'team_variant': char['placement']['team_variant'],
             'active_camera': scene.camera.name,
             'render': {'engine': scene.render.engine, 'resolution_x': scene.render.resolution_x,
                        'resolution_y': scene.render.resolution_y, 'resolution_percentage': scene.render.resolution_percentage,
                        'fps': scene.render.fps, 'fps_base': scene.render.fps_base,
                        'film_transparent': scene.render.film_transparent,
                        'file_format': scene.render.image_settings.file_format,
                        'color_mode': scene.render.image_settings.color_mode,
                        'color_depth': scene.render.image_settings.color_depth}}
    scene.frame_set(initial_frame, subframe=initial_subframe)
    bpy.context.view_layer.update()
    return state


def assert_exact(before, after, path, label):
    write_json(path, {'label': label, 'before_sha256': digest(before), 'after_sha256': digest(after),
                      'exact_equal': before == after, 'float_rounding_used': False, 'normalization_used': False})
    if before != after:
        write_json(path.with_name(path.stem + '-before.json'), before)
        write_json(path.with_name(path.stem + '-after.json'), after)
        raise RuntimeError(f'Exact preservation failed for {label}; see {path}')


def geometry_receipt(scene, char):
    dg = bpy.context.evaluated_depsgraph_get()
    records, total, mats = [], 0, set()
    for obj in sorted(char['collection'].all_objects, key=lambda obj: obj.name):
        if obj.type != 'MESH':
            continue
        evaluated = obj.evaluated_get(dg)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        count = len(mesh.loop_triangles)
        total += count
        evaluated.to_mesh_clear()
        mats.update(mat.name for mat in obj.data.materials if mat)
        records.append({'name': obj.name, 'triangles': count})
    presentation_triangles = 0
    for obj in char['presentation'].objects:
        evaluated = obj.evaluated_get(dg)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        presentation_triangles += len(mesh.loop_triangles)
        evaluated.to_mesh_clear()
        mats.update(mat.name for mat in obj.data.materials if mat)
    if total + presentation_triangles > 3000 or len(mats) > 8:
        raise RuntimeError(f'Character budget exceeded: {total + presentation_triangles} triangles, {len(mats)} materials')
    return {'evaluated_triangles': total, 'material_count': len(mats), 'material_names': sorted(mats),
            'editable_mesh_count': len(records), 'meshes': records,
            'presentation_ring_meshes': len(char['presentation'].objects),
            'presentation_evaluated_triangles': presentation_triangles,
            'all_authored_evaluated_triangles': total + presentation_triangles}


def projected_bounds(scene, objects):
    dg = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in objects:
        if obj.type != 'MESH' or obj.hide_render:
            continue
        evaluated = obj.evaluated_get(dg)
        mesh = evaluated.to_mesh()
        for vertex in mesh.vertices:
            co = world_to_camera_view(scene, scene.camera, evaluated.matrix_world @ vertex.co)
            points.append((float(co.x), float(1 - co.y)))
        evaluated.to_mesh_clear()
    if not points:
        raise RuntimeError('Empty projected geometry')
    return {'left': min(point[0] for point in points), 'right': max(point[0] for point in points),
            'top': min(point[1] for point in points), 'bottom': max(point[1] for point in points)}


def projection_receipt(scene, char):
    records = []
    root = char['placement']
    for direction, camera in char['cameras'].items():
        scene.camera = camera
        vector = camera.matrix_world.to_quaternion() @ Vector((0, 0, -1))
        elevation = math.degrees(math.atan2(-vector.z, math.hypot(vector.x, vector.y)))
        if abs(elevation - 50) > .001 or abs(camera.data.ortho_scale - 8.025) > 1e-5:
            raise RuntimeError('Native camera contract changed')
        for motion, frames in FRAMES.items():
            for frame in frames:
                scene.frame_set(frame, subframe=0)
                bpy.context.view_layer.update()
                origin = world_to_camera_view(scene, camera, root.matrix_world.translation)
                forward = world_to_camera_view(scene, camera, root.matrix_world @ Vector((0, -1, 0)))
                delta = [float(forward.x - origin.x), float(origin.y - forward.y)]
                axis, sign = {'north': (1, -1), 'east': (0, 1), 'south': (1, 1), 'west': (0, -1)}[direction]
                if delta[axis] * sign <= .01 or abs(delta[1-axis]) > 1e-5:
                    raise RuntimeError(f'Actual actor-forward projection is wrong: {direction}: {delta}')
                anchor = [float(origin.x), float(1 - origin.y)]
                if max(abs(anchor[i] - CAMERA['ground_anchor_normalized'][i]) for i in (0, 1)) > 1e-5:
                    raise RuntimeError(f'Ground anchor drift: {anchor}')
                body = projected_bounds(scene, char['collection'].all_objects)
                all_bounds = projected_bounds(scene, scene_meshes(scene))
                margins = [all_bounds['left'] * 64, all_bounds['top'] * 64,
                           (1 - all_bounds['right']) * 64, (1 - all_bounds['bottom']) * 64]
                if min(margins) < 4:
                    raise RuntimeError(f'Projected crop margin under 4 px: {direction} {frame}: {margins}')
                records.append({'direction': direction, 'motion': motion, 'frame': frame,
                                'actor_forward_screen_delta': delta, 'ground_anchor_uv': anchor,
                                'camera_elevation_degrees': elevation, 'ortho_scale': camera.data.ortho_scale,
                                'body_bounds': body, 'body_height_px': (body['bottom'] - body['top']) * 64,
                                'all_bounds': all_bounds, 'crop_margins_px': margins})
    idle = [record['body_height_px'] for record in records if record['motion'] == 'idle' and record['frame'] == 1]
    if not 10 <= max(idle) <= 16:
        raise RuntimeError(f'Native idle body height outside 10–16 px study tolerance: {idle}')
    scene.frame_set(1, subframe=0)
    scene.camera = char['cameras']['south']
    return {'records': records, 'idle_body_heights_px': idle, 'target_px': 13,
            'study_tolerance_px': [10, 16], 'native_visual_verdict': 'independent critic required'}


def inspect_glb(path, names):
    data = path.read_bytes()
    magic, version, size = struct.unpack_from('<4sII', data)
    json_size, kind = struct.unpack_from('<II', data, 12)
    if (magic, version, size, kind) != (b'glTF', 2, len(data), 0x4E4F534A):
        raise RuntimeError('Invalid GLB container')
    doc = json.loads(data[20:20+json_size])
    unexpected = {node.get('name') for node in doc.get('nodes', [])} - set(names)
    if unexpected or len(doc.get('scenes', [])) != 1 or doc.get('images') or doc.get('textures'):
        raise RuntimeError(f'GLB isolation failed: {unexpected}')
    if any(buffer.get('uri') for buffer in doc.get('buffers', [])):
        raise RuntimeError('External GLB buffers are forbidden')
    triangles = 0
    for mesh in doc.get('meshes', []):
        for part in mesh['primitives']:
            if part.get('mode', 4) != 4:
                raise RuntimeError('Non-triangle GLB primitive')
            accessor = doc['accessors'][part['indices']] if 'indices' in part else doc['accessors'][part['attributes']['POSITION']]
            if accessor['count'] % 3:
                raise RuntimeError('Non-integral GLB triangles')
            triangles += accessor['count'] // 3
    clips = {clip.get('name') for clip in doc.get('animations', [])}
    if not set(FRAMES).issubset(clips):
        raise RuntimeError(f'Expected separate idle/walk/attack GLB clips, got {clips}')
    if triangles > 3000 or len(doc.get('materials', [])) > 8:
        raise RuntimeError('GLB actor budget exceeded')
    return {'triangles': triangles, 'materials': [mat.get('name') for mat in doc.get('materials', [])],
            'clips': sorted(clips), 'animation_channels': sum(len(clip.get('channels', [])) for clip in doc.get('animations', [])),
            'unexpected_nodes': [], 'external_images': [], 'external_buffers': []}


def export_glb(scene, char, path):
    for obj in scene.objects:
        obj.select_set(False)
    selected = list(char['collection'].all_objects)
    for obj in selected:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = char['placement']
    operator = bpy.ops.export_scene.gltf
    props = operator.get_rna_type().properties
    args = {'filepath': str(path), 'use_selection': True, 'use_active_scene': True, 'export_format': 'GLB'}
    for key, value in (('export_animations', True), ('export_frame_range', True), ('export_force_sampling', True),
                       ('export_apply', False), ('export_cameras', False), ('export_lights', False)):
        if key in props:
            args[key] = value
    if 'export_animation_mode' not in props:
        raise RuntimeError('Exporter cannot declare NLA clip mode; no silent single-clip fallback')
    modes = {item.identifier for item in props['export_animation_mode'].enum_items}
    if 'NLA_TRACKS' not in modes:
        raise RuntimeError(f'Exporter lacks NLA_TRACKS: {sorted(modes)}')
    args['export_animation_mode'] = 'NLA_TRACKS'
    if 'export_anim_slide_to_zero' in props:
        args['export_anim_slide_to_zero'] = True
    if 'FINISHED' not in operator(**args):
        raise RuntimeError('GLB exporter did not finish')
    return inspect_glb(path, [obj.name for obj in selected])


def find_saved(identifier):
    scenes = [scene for scene in bpy.data.scenes if scene.get('card_id') == identifier]
    if len(scenes) != 1:
        raise RuntimeError('Saved file must have exactly one character scene')
    scene = scenes[0]
    activate(scene)
    roots = [obj for obj in scene.objects if obj.get('card_id') == identifier and obj.get('forward_axis') == '-Y']
    if len(roots) != 1:
        raise RuntimeError('Saved character root is ambiguous')
    root = roots[0]
    collection = next(collection for collection in root.users_collection if root.name in collection.objects)
    presentation = scene.collection.children.get(PREFIX + identifier + '_presentation')
    if presentation is None:
        raise RuntimeError('Presentation ring collection missing')
    contract = json.loads(scene['sprite_camera_contract'])
    used = {mat for obj in collection.all_objects if obj.type == 'MESH' for mat in obj.data.materials if mat}
    team = [mat for mat in used if mat.name == 'TEAM' and mat.get('team_zone')]
    if len(team) != 1:
        raise RuntimeError('Saved actor must have one material named TEAM')
    char = {'id': identifier, 'placement': root, 'collection': collection, 'presentation': presentation,
            'materials': {'TEAM': team[0]},
            'cameras': {key: scene.objects[name] for key, name in contract['camera_names'].items()},
            'portrait_camera': scene.objects[contract['portrait_camera']]}
    allowed = {obj.name for obj in collection.all_objects} | {obj.name for obj in presentation.objects}
    foreign = [obj.name for obj in scene_meshes(scene) if obj.name not in allowed]
    if foreign:
        raise RuntimeError(f'Foreign model geometry: {foreign}')
    return scene, char
