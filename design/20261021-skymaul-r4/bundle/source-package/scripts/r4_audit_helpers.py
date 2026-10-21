"""Exact R4 full-state checks; all dependencies are in this package."""
import hashlib
import json
import bpy
import pipeline as pipe
import skymaul_evidence as evidence
import r3_readonly as r3


RIM = 'ME_SBR_R1_skymaul_chest_core_rim'


NEW_Y = -0.07999999821186066


def record(path):
    return {'path': str(path), 'bytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + '\n')


def snapshot(scene, char):
    state = r3.snapshot(scene, char)
    bpy.context.view_layer.update()
    state['complete_object_matrices'] = {
        obj.name: {field: [list(row) for row in getattr(obj, field)]
                   for field in ('matrix_basis', 'matrix_local', 'matrix_world')}
        for obj in sorted(scene.objects, key=lambda value: value.name)}
    return state


def exact_proof(before, after, output, label):
    proof = evidence.compare_states(before, after, output, label)
    proof['signed_zero_tokens_normalized'] = False
    proof['require_canonical_json_byte_identity'] = True
    write(output / (label + '-proof.json'), proof)
    if not proof['numeric_exact_equal'] or not proof['byte_identical']:
        raise RuntimeError('Exact state preservation failed: ' + label)
    return proof


def require_rim(scene):
    if scene.objects[RIM].location.y != NEW_Y:
        raise RuntimeError('Rim depth readback differs from exact pinned float32')


def require_camera(scene, char):
    r3.require_camera(scene, char)


def camera_data(camera):
    return r3.camera_data(camera)


def portrait_projection(scene, char):
    return r3.portrait_projection(scene, char)


def whole_core_equality(output, helper, png):
    width, height, visible = png.read_rgba(output / 'portrait-core-visible.png')
    iw, ih, isolated = png.read_rgba(output / 'portrait-core-isolated.png')
    if (width, height) != (512, 512) or (iw, ih) != (512, 512):
        raise RuntimeError('Whole-core mask dimensions differ from the pinned portrait')
    visible_support = {i for i in range(width * height)
                       if round(visible[i * 4] * visible[i * 4 + 3] / 255) >= 128}
    isolated_support = {i for i in range(width * height) if isolated[i * 4 + 3] >= 128}
    lost, extra = sorted(isolated_support - visible_support), sorted(visible_support - isolated_support)
    xy = lambda indices: [[i % width, i // width] for i in indices]
    diagnostic = json.loads((output / 'portrait-core-diagnostics.json').read_text())
    result = {'status': 'Pinned whole-object opaque support equality, no tolerance or face-subset replacement',
              'core_object': 'ME_SBR_R1_skymaul_warm_core', 'threshold': 128,
              'visible_support_definition': 'round(R * A / 255) >= 128 from full-actor Raw pure-emission core mask',
              'isolated_support_definition': 'A >= 128 from isolated entire warm_core object',
              'visible_pixels': len(visible_support), 'isolated_pixels': len(isolated_support),
              'lost_pixels': len(lost), 'extra_pixels': len(extra),
              'lost_coordinates': xy(lost), 'extra_coordinates': xy(extra),
              'exact_support_equal': visible_support == isolated_support,
              'entire_core_inside': diagnostic['isolated_core_entirely_inside'],
              'core_display_luminance': diagnostic['core_display_luminance'],
              'other_actor_display_luminance': diagnostic['other_actor_display_luminance'],
              'lightest_region_and_identity_visual_verdict': 'Independent critic required',
              'visible_mask': helper.record(output / 'portrait-core-visible.png'),
              'isolated_mask': helper.record(output / 'portrait-core-isolated.png')}
    helper.write(output / 'whole-core-support-equality.json', result)
    return result
