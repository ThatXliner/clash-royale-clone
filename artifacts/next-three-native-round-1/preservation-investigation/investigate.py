"""Reconstruct recorded state-hash changes from immutable Blend bytes; no bpy."""
from pathlib import Path
import copy
import hashlib
import json
import math
import struct
import sys

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from read_blend_fields import BlendFields

SOURCE = Path('/Users/me/.codex/clash-qualification/20261020-astra-sky-brass-reed-models')
ATTEMPT = SOURCE / 'attempts/native-r1'
CARDS = ('skymaul', 'brassbolt', 'reedsting')
MAP = {'location': 'loc[3]', 'rotation_euler': 'rot[3]', 'rotation_quaternion': 'quat[4]',
       'scale': 'size[3]', 'delta_location': 'dloc[3]', 'delta_rotation_euler': 'drot[3]',
       'delta_scale': 'dscale[3]'}


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


def receipt(path):
    return {'path': str(path), 'bytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + '\n')


def walk(value, path=()):
    if isinstance(value, dict):
        for key, item in value.items():
            yield from walk(item, path + (key,))
    elif isinstance(value, list):
        for key, item in enumerate(value):
            yield from walk(item, path + (key,))
    else:
        yield path, value


def main():
    inputs = [SOURCE / 'scripts/pipeline.py', SOURCE / 'scripts/build_models.py',
              SOURCE / 'scripts/render_saved.py', SOURCE / 'prepared-source-hashes.json',
              ATTEMPT / 'source-before.json', ATTEMPT / 'source-after.json', ATTEMPT / 'run-receipt.json',
              Path('/Applications/Blender.app/Contents/Resources/5.1/scripts/modules/_blendfile_header.py'),
              Path('/Applications/Blender.app/Contents/Resources/5.1/scripts/addons_core/io_scene_gltf2/blender/exp/animation/tracks.py')]
    for card in CARDS:
        model = ATTEMPT / 'models' / card
        render = ATTEMPT / 'renders' / card
        inputs.extend([model / 'canonical-state.json', model / (card + '.blend'), model / (card + '.glb'),
                       model / 'build-receipt.json', model / 'after-export-proof.json', model / 'after-save-proof.json',
                       render / 'saved-load-proof.json', render / 'mask-restoration-proof.json',
                       render / 'render-restoration-proof.json', render / 'render-receipt.json'])
    before = [receipt(path) for path in inputs]
    proof_summary = []
    detailed_paths = []
    for card in CARDS:
        model = ATTEMPT / 'models' / card
        canonical = read(model / 'canonical-state.json')
        export = read(model / 'after-export-proof.json')
        build = read(model / 'build-receipt.json')
        if digest(canonical) != export['before_sha256']:
            raise RuntimeError('Canonical state does not bind to before digest')
        if receipt(model / (card + '.blend')) != build['blend']:
            raise RuntimeError('Saved Blend does not bind to original build receipt')
        if receipt(model / (card + '.glb')) != build['glb']:
            raise RuntimeError('GLB does not bind to original build receipt')
        blend = BlendFields(model / (card + '.blend'))
        saved_objects = blend.objects()
        candidate = copy.deepcopy(canonical)
        changes = []
        for name, source_obj in canonical['objects'].items():
            if name not in saved_objects:
                raise RuntimeError('Saved Object missing')
            for channel, dna_name in MAP.items():
                original = source_obj['transform'][channel]
                field = saved_objects[name]['fields'][dna_name]
                for index, (old, new) in enumerate(zip(original, field['values'])):
                    if encoded(old) == encoded(new):
                        continue
                    if not (isinstance(old, float) and isinstance(new, float) and old == new == 0
                            and math.copysign(1, old) != math.copysign(1, new)):
                        raise RuntimeError(f'Meaningful or unexplained saved Object difference: {name} {channel} {index}: {old} -> {new}')
                    object_path = ['objects', name, 'transform', channel, index]
                    candidate['objects'][name]['transform'][channel][index] = new
                    offsets = field['file_offset'] + index * 4
                    binary = blend.data[offsets:offsets+4]
                    if binary != struct.pack('<f', new):
                        raise RuntimeError('Raw float read-back mismatch')
                    affected_frames = []
                    paths = [object_path]
                    for frame, poses in candidate['integer_frame_local_poses'].items():
                        if name not in poses:
                            continue
                        if encoded(poses[name][channel][index]) != encoded(old):
                            raise RuntimeError('A nonconstant sample would require fresh evidence; no generalized replacement allowed')
                        poses[name][channel][index] = new
                        affected_frames.append(int(frame))
                        paths.append(['integer_frame_local_poses', frame, name, channel, index])
                    for path in paths:
                        detailed_paths.append({'card_id': card, 'json_pointer': '/' + '/'.join(map(str, path)),
                                               'before_json_token': encoded(old).decode(), 'after_json_token': encoded(new).decode()})
                    changes.append({'object': name, 'channel': channel, 'component': index,
                                    'before_json_token': encoded(old).decode(), 'after_json_token': encoded(new).decode(),
                                    'saved_object_file_offset': offsets, 'saved_float32_le_hex': binary.hex(),
                                    'before_float32_le_hex': struct.pack('<f', old).hex(),
                                    'object_json_path': object_path, 'integer_frame_pose_samples': sorted(affected_frames),
                                    'changed_scalar_count': len(paths)})
        if candidate != canonical:
            raise RuntimeError('This reconstruction must isolate Python-equal representation differences')
        before_tokens = dict(walk(canonical))
        after_tokens = dict(walk(candidate))
        if before_tokens.keys() != after_tokens.keys():
            raise RuntimeError('Unexpected structural difference')
        different = [path for path, value in before_tokens.items() if encoded(value) != encoded(after_tokens[path])]
        if len(different) != sum(change['changed_scalar_count'] for change in changes):
            raise RuntimeError('Field diff count mismatch')
        reconstructed_digest = digest(candidate)
        if reconstructed_digest != export['after_sha256']:
            raise RuntimeError('Signed-zero candidate does not reproduce recorded full after-state digest')
        phases = []
        for proof_path in (model / 'after-export-proof.json', model / 'after-save-proof.json',
                           ATTEMPT / 'renders' / card / 'saved-load-proof.json',
                           ATTEMPT / 'renders' / card / 'render-restoration-proof.json'):
            phase = read(proof_path)
            if phase['before_sha256'] != digest(canonical) or phase['after_sha256'] != reconstructed_digest:
                raise RuntimeError('Phase digests disagree with reconstruction')
            phases.append({'file': str(proof_path), 'label': phase['label'], 'recorded_exact_equal': phase['exact_equal'],
                           'after_digest_reproduced': True})
        mask = read(ATTEMPT / 'renders' / card / 'mask-restoration-proof.json')
        if mask['before_sha256'] != reconstructed_digest or mask['after_sha256'] != reconstructed_digest:
            raise RuntimeError('Mask pass did not preserve the exact exported representation')
        sections = {name: {'before_sha256': digest(canonical[name]), 'reconstructed_after_sha256': digest(candidate[name]),
                           'serialized_bytes_equal': encoded(canonical[name]) == encoded(candidate[name])}
                    for name in canonical}
        # Do not write a normalized state or replace any canonical evidence.
        proof_summary.append({'card_id': card, 'before_sha256': digest(canonical),
                              'reconstructed_after_sha256': reconstructed_digest,
                              'recorded_after_sha256': export['after_sha256'], 'full_after_digest_reproduced': True,
                              'python_recursive_equality': candidate == canonical,
                              'serialized_state_bytes_equal': encoded(candidate) == encoded(canonical),
                              'changed_scalar_count': len(different), 'changed_objects': changes,
                              'section_hashes': sections, 'phase_receipts': phases,
                              'mask_restoration_hashes_equal': True,
                              'full_original_after_state_json_retained': False,
                              'reconstruction_basis': 'Saved Object float bits plus constant canonical pose fields; full resulting JSON hash matches every original after-state digest'})
    after = [receipt(path) for path in inputs]
    if before != after:
        raise RuntimeError('An immutable input changed during investigation')
    write(HERE / 'input-hashes.json', {'files': before, 'unchanged_after_investigation': True})
    write(HERE / 'field-diff.json', {'scope': 'Explicit paths in the recorded state only', 'changes': detailed_paths})
    write(HERE / 'findings.json', {'status': 'Exact hash disagreement explained by signed-zero transform fields',
          'no_bpy_or_blender': True, 'source_or_model_edits': False, 'canonical_evidence_replaced': False,
          'normalization_applied_to_evidence': False, 'characters': proof_summary})
    print(json.dumps({'status': 'reproduced all after-state digests',
          'characters': [{'card_id': row['card_id'], 'objects': len(row['changed_objects']),
                          'changed_scalars': row['changed_scalar_count'], 'after_sha256': row['reconstructed_after_sha256']}
                         for row in proof_summary], 'inputs_unchanged': before == after}, indent=2))


if __name__ == '__main__':
    main()
