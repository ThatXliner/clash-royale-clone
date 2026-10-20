"""Build one original editable character; run only under an explicit runtime grant."""
import argparse
import importlib
import json
from pathlib import Path
import sys

import bpy

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from model_common import FRAMES, animate
import pipeline as pipe


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--character', choices=('skymaul', 'brassbolt', 'reedsting'), required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if not bpy.app.background:
        raise RuntimeError('Use a fresh background Blender process')
    output = args.output.resolve()
    if output.exists():
        raise RuntimeError('Refusing to replace an earlier attempt')
    output.mkdir(parents=True)
    module = importlib.import_module(args.character)
    scene = bpy.data.scenes.new(pipe.PREFIX + args.character + '_editable')
    pipe.activate(scene)
    char = module.build(scene)
    pipe.studio(scene, char)
    pipe.ground_rings(scene, char)
    animate(scene, char, module.pose)
    geometry = pipe.geometry_receipt(scene, char)
    projections = pipe.projection_receipt(scene, char)
    before = pipe.exact_state(scene, char)
    pipe.write_json(output / 'canonical-state.json', before)
    glb = output / (args.character + '.glb')
    glb_report = pipe.export_glb(scene, char, glb)
    pipe.assert_exact(before, pipe.exact_state(scene, char), output / 'after-export-proof.json', 'actor export')
    scene.frame_set(1, subframe=0)
    scene.camera = char['cameras']['south']
    blend = output / (args.character + '.blend')
    bpy.data.libraries.write(str(blend), {scene}, fake_user=True)
    pipe.assert_exact(before, pipe.exact_state(scene, char), output / 'after-save-proof.json', 'saved scene write')
    report = {'status': 'Generated; saved-scene rendering and independent art review still required',
              'identity_commit': '90efeb43555d35569a9bb66fab7ea8de83aa5045',
              'license': 'AGPL-3.0-only', 'authorship': 'Original procedural geometry by GPT-6 Astra',
              'reference_imported': False, 'external_images_in_models': [],
              'runtime_integration': False, 'card_id': args.character,
              'blender_version': bpy.app.version_string, 'render_engine': scene.render.engine,
              'geometry': geometry, 'projections': projections, 'animation_source_frames': FRAMES,
              'blend': pipe.file_record(blend), 'glb': pipe.file_record(glb), 'glb_inspection': glb_report,
              'canonical_state_sha256': pipe.digest(before), 'quality_verdict': 'not reviewed'}
    pipe.write_json(output / 'build-receipt.json', report)
    print(json.dumps({'status': 'generated', 'character': args.character, 'output': str(output)}))


if __name__ == '__main__':
    main()
