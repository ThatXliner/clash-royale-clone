"""Render the exported, freshly reopened scene; state mutation is a hard failure."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys

import bpy

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_common import ROOT, RENDER_POSES, p
import pipeline as pipe

spec = importlib.util.spec_from_file_location('verified_native_png', ROOT / 'inputs/observed-native-renderer/native_preview.py')
png = importlib.util.module_from_spec(spec)
spec.loader.exec_module(png)


def image_record(path):
    width, height, pixels = png.read_rgba(path)
    bounds = png.bounds(width, height, pixels, 1)
    if bounds is None:
        raise RuntimeError(f'Empty raster: {path}')
    margins = [bounds['left'], bounds['top'], width - bounds['left'] - bounds['width'],
               height - bounds['top'] - bounds['height']]
    return {**pipe.file_record(path), 'width': width, 'height': height,
            'alpha_bounds_1': bounds, 'alpha_bounds_16': png.bounds(width, height, pixels, 16),
            'alpha_bounds_128': png.bounds(width, height, pixels, 128), 'alpha_clear_margins_px': margins}


def capture(scene, char, output, team, direction, pose, kind):
    frame = RENDER_POSES[pose]
    scene.frame_set(frame, subframe=0)
    scene.camera = char['cameras'][direction]
    scene.render.resolution_x = scene.render.resolution_y = 256
    bpy.context.view_layer.update()
    name = f'{char["id"]}-{team}-{direction}-{pose}-{kind}.png'
    raw = output / 'raw-256' / name
    native = output / 'native-64' / name
    scene.render.filepath = str(raw)
    bpy.ops.render.render(write_still=True, scene=scene.name)
    width, height, pixels = png.read_rgba(raw)
    if (width, height) != (256, 256):
        raise RuntimeError('Raw native render must be exactly 256×256')
    width, height, pixels = png.box(width, height, pixels, 4)
    png.png(native, width, height, pixels)
    receipt = image_record(native)
    if min(receipt['alpha_clear_margins_px']) < 2:
        raise RuntimeError(f'Native alpha crop margin failed: {name}: {receipt["alpha_clear_margins_px"]}')
    if native.stat().st_size > 1048576:
        raise RuntimeError('Native image exceeds 1 MiB')
    return {'card_id': char['id'], 'team': team, 'direction': direction, 'pose': pose,
            'frame': frame, 'kind': kind, 'raw': image_record(raw), 'native': receipt,
            'evidence_origin': 'fresh render from reopened saved .blend',
            'engine': scene.render.engine, 'view_transform': scene.view_settings.view_transform}


def mask_material(name, white):
    mat = bpy.data.materials.new(pipe.PREFIX + name)
    mat.use_nodes = True
    shader = next(node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    p.input_socket(shader, 'Base Color').default_value = (0, 0, 0, 1)
    p.input_socket(shader, 'Emission Color', 'Emission').default_value = (1, 1, 1, 1) if white else (0, 0, 0, 1)
    p.input_socket(shader, 'Emission Strength').default_value = 1
    p.input_socket(shader, 'Roughness').default_value = 1
    return mat


def masks(scene, char, output):
    scene.camera = char['cameras']['south']
    scene.frame_set(1, subframe=0)
    before = pipe.exact_state(scene, char)
    white, black = mask_material('MASK_WHITE', True), mask_material('MASK_BLACK', False)
    stored = [(obj.data, list(obj.data.materials)) for obj in pipe.scene_meshes(scene)]
    view = (scene.view_settings.view_transform, scene.view_settings.look,
            scene.view_settings.exposure, scene.view_settings.gamma)
    records = []
    try:
        pipe.activate(scene)
        pipe.enum_readback(scene.view_settings, 'view_transform', ('Standard',))
        scene.view_settings.exposure, scene.view_settings.gamma = 0, 1
        for mesh, originals in stored:
            for i, original in enumerate(originals):
                mesh.materials[i] = white if original == char['materials']['TEAM'] else black
        for team in ('river', 'ember'):
            pipe.set_team(char, team)
            for direction in char['cameras']:
                records.append(capture(scene, char, output, team, direction, 'idle', 'team-mask'))
    finally:
        for mesh, originals in stored:
            for i, original in enumerate(originals):
                mesh.materials[i] = original
        pipe.enum_readback(scene.view_settings, 'view_transform', (view[0],))
        pipe.enum_readback(scene.view_settings, 'look', (view[1],))
        scene.view_settings.exposure, scene.view_settings.gamma = view[2:]
        pipe.set_team(char, 'river')
        scene.camera = char['cameras']['south']
        scene.frame_set(1, subframe=0)
        for mat in (white, black):
            if mat.users:
                raise RuntimeError('Temporary mask material remains in use')
            bpy.data.materials.remove(mat)
        pipe.assert_exact(before, pipe.exact_state(scene, char), output / 'mask-restoration-proof.json', 'team mask restoration')
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--character', choices=('skymaul', 'brassbolt', 'reedsting'), required=True)
    parser.add_argument('--model-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if not bpy.app.background:
        raise RuntimeError('Use a fresh background Blender process')
    output = args.output.resolve()
    if output.exists():
        raise RuntimeError('Refusing to overwrite earlier renders')
    (output / 'raw-256').mkdir(parents=True)
    (output / 'native-64').mkdir()
    canonical = json.loads((args.model_dir / 'canonical-state.json').read_text())
    blend_path = args.model_dir / (args.character + '.blend')
    initial_blend = pipe.file_record(blend_path)
    scene, char = pipe.find_saved(args.character)
    pipe.assert_exact(canonical, pipe.exact_state(scene, char), output / 'saved-load-proof.json', 'fresh saved scene load')
    geometry = pipe.geometry_receipt(scene, char)
    projections = pipe.projection_receipt(scene, char)
    records = []
    for team in ('river', 'ember'):
        pipe.set_team(char, team)
        for direction in char['cameras']:
            for pose in RENDER_POSES:
                records.append(capture(scene, char, output, team, direction, pose, 'color'))
    pipe.set_team(char, 'river')
    records.extend(masks(scene, char, output))
    visibility = [(obj, obj.hide_render, obj.hide_viewport) for obj in char['presentation'].objects]
    try:
        for obj, _, _ in visibility:
            obj.hide_render = obj.hide_viewport = True
        for direction in char['cameras']:
            records.append(capture(scene, char, output, 'river', direction, 'idle', 'body-only'))
        scene.camera = char['portrait_camera']
        scene.frame_set(1, subframe=0)
        scene.render.resolution_x = scene.render.resolution_y = 512
        portrait = output / (args.character + '-portrait.png')
        scene.render.filepath = str(portrait)
        bpy.ops.render.render(write_still=True, scene=scene.name)
        portrait_record = image_record(portrait)
    finally:
        for obj, hide_render, hide_viewport in visibility:
            obj.hide_render, obj.hide_viewport = hide_render, hide_viewport
        scene.render.resolution_x = scene.render.resolution_y = 256
        scene.camera = char['cameras']['south']
        scene.frame_set(1, subframe=0)
        pipe.set_team(char, 'river')
    after = pipe.exact_state(scene, char)
    pipe.assert_exact(canonical, after, output / 'render-restoration-proof.json', 'all saved-scene rendering')
    if pipe.file_record(blend_path) != initial_blend:
        raise RuntimeError('Read-only render changed saved .blend bytes')
    receipt = {'status': 'Rendered evidence; independent visual verdict pending', 'card_id': args.character,
               'blend': initial_blend, 'geometry': geometry, 'projection': projections,
               'images': records, 'portrait': portrait_record,
               'fresh_native_count': len(records), 'fresh_portrait_count': 1,
               'state_before_sha256': pipe.digest(canonical), 'state_after_sha256': pipe.digest(after),
               'exact_state_restored': True, 'source_only_preparation': False,
               'runtime_integration': False, 'quality_verdict': 'not reviewed'}
    pipe.write_json(output / 'render-receipt.json', receipt)
    print(json.dumps({'status': 'rendered', 'card_id': args.character, 'native_count': len(records)}))


if __name__ == '__main__':
    main()
