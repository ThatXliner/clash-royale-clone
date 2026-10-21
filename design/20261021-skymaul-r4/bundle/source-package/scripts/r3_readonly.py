"""Exact R3 read-only checks extracted for portable R4 verification."""
import json
import bpy
from bpy_extras.object_utils import world_to_camera_view
import pipeline as pipe
import skymaul_evidence as evidence


READBACK = {'ortho_scale': 2.6500000953674316,
            'shift_x': 0.12999999523162842, 'shift_y': 0.20800000429153442}


def camera_data(camera):
    fields = ('type', 'ortho_scale', 'lens', 'sensor_width', 'sensor_height',
              'sensor_fit', 'clip_start', 'clip_end', 'shift_x', 'shift_y')
    return {'transform': pipe.transforms(camera),
            'matrix_world': [list(row) for row in camera.matrix_world],
            'intrinsics': {key: getattr(camera.data, key) for key in fields}}


def snapshot(scene, char):
    full = evidence.full_state(scene, char)
    full['complete_camera_data'] = {key: camera_data(camera) for key, camera in sorted(
        {**char['cameras'], 'portrait': char['portrait_camera']}.items())}
    return full


def require_camera(scene, char):
    if scene.frame_current != 1 or scene.frame_subframe != 0:
        raise RuntimeError('Portrait subject must be saved idle frame 1')
    camera = char['portrait_camera']
    actual = {key: getattr(camera.data, key) for key in READBACK}
    if actual != READBACK:
        raise RuntimeError('Actual portrait intrinsic readback differs from pinned float32 values')
    if camera.data.type != 'ORTHO' or scene.render.resolution_x != scene.render.resolution_y:
        raise RuntimeError('Expected unchanged square orthographic saved scene')


def portrait_projection(scene, char):
    require_camera(scene, char)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in sorted(char['collection'].all_objects, key=lambda obj: obj.name):
        if obj.type != 'MESH':
            continue
        if obj.hide_render:
            raise RuntimeError('Portrait actor unexpectedly has a hidden part: ' + obj.name)
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            for vertex in mesh.vertices:
                world = evaluated.matrix_world @ vertex.co
                projected = world_to_camera_view(scene, char['portrait_camera'], world)
                points.append({'object': obj.name, 'vertex_index': vertex.index,
                               'world': list(world), 'normalized_top_down': [float(projected.x), float(1 - projected.y)],
                               'depth': float(projected.z)})
        finally:
            evaluated.to_mesh_clear()
    bounds = {'left': min(row['normalized_top_down'][0] for row in points),
              'right': max(row['normalized_top_down'][0] for row in points),
              'top': min(row['normalized_top_down'][1] for row in points),
              'bottom': max(row['normalized_top_down'][1] for row in points)}
    margins = {'left': bounds['left'], 'right': 1 - bounds['right'],
               'top': bounds['top'], 'bottom': 1 - bounds['bottom']}
    checks = {'top_min_0_095': margins['top'] >= .095,
              'bottom_min_0_095': margins['bottom'] >= .095,
              'left_min_0_06': margins['left'] >= .06,
              'right_min_0_06': margins['right'] >= .06,
              'all_vertices_in_front': min(row['depth'] for row in points) > 0}
    return {'frame': 1, 'ring_included': False, 'camera': camera_data(char['portrait_camera']),
            'image_size_for_reporting': [512, 512], 'actor_vertices': len(points),
            'bounds': bounds, 'margins': margins,
            'height_fill': bounds['bottom'] - bounds['top'],
            'checks': checks, 'all_checks_pass': all(checks.values()), 'points': points}


def rest_contract(state):
    poses = state['integer_frame_local_poses']
    frames_exact = set(poses) == {str(frame) for frame in range(1, 107)}
    rows = []
    for name, initial in poses['1'].items():
        rows.append({'object': name,
                     'location_numeric_exact': all(pose[name]['location'] == initial['location'] for pose in poses.values()),
                     'scale_numeric_exact': all(pose[name]['scale'] == initial['scale'] for pose in poses.values()),
                     'location_tokens_exact': all(json.dumps(pose[name]['location']) == json.dumps(initial['location']) for pose in poses.values()),
                     'scale_tokens_exact': all(json.dumps(pose[name]['scale']) == json.dumps(initial['scale']) for pose in poses.values())})
    expected = {'idle': [1.0, 31.0], 'walk': [41.0, 71.0], 'attack': [90.0, 106.0]}
    clips = []
    for name, tracks in state['animation_tracks'].items():
        names_exact = {track['name'] for track in tracks} == set(expected) and len(tracks) == 3
        for track in tracks:
            strips = track['strips']
            valid = len(strips) == 1 and track['name'] in expected
            if valid:
                strip = strips[0]
                valid = ([strip['frame_start'], strip['frame_end']] == expected[track['name']]
                         and [strip['action_frame_start'], strip['action_frame_end']] == expected[track['name']]
                         and strip['scale'] == 1.0 and strip['repeat'] == 1.0)
            clips.append({'object': name, 'track': track['name'], 'track_names_exact': names_exact,
                          'original_range_exact': valid, 'strips': strips})
    parent = state['objects']['ME_SBR_R1_skymaul_hammer']['transform']['parent']
    right_arm = parent == 'ME_SBR_R1_skymaul_right_arm'
    fixed = all(all(row[key] for key in row if key != 'object') for row in rows)
    ranges = all(row['track_names_exact'] and row['original_range_exact'] for row in clips)
    return {'frame_count': len(poses), 'exact_frames_1_to_106': frames_exact,
            'fixed_location_scale_all_frames': fixed, 'original_clips_exact': ranges,
            'right_arm_owns_hammer': right_arm, 'hammer_parent': parent,
            'body_rest_location': poses['1']['ME_SBR_R1_skymaul_body']['location'],
            'local_transform_records': rows, 'clip_records': clips,
            'all_checks_pass': frames_exact and fixed and ranges and right_arm}
