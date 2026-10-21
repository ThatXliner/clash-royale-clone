"""Verify or rerender the accepted saved R4 model using only this local bundle."""
import argparse
import json
import os
from pathlib import Path
import sys
import traceback

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bundle_io


def image_comparison(expected, actual, png):
    before = png.read_rgba(expected)
    after = png.read_rgba(actual)
    same_size = before[:2] == after[:2]
    differences = (sum(a != b for a, b in zip(before[2], after[2]))
                   if same_size and len(before[2]) == len(after[2]) else None)
    return {'expected': str(expected), 'actual': str(actual),
            'expected_png_sha256': bundle_io.digest(expected.read_bytes()),
            'actual_png_sha256': bundle_io.digest(actual.read_bytes()),
            'expected_rgba_sha256': bundle_io.digest(bytes(before[2])),
            'actual_rgba_sha256': bundle_io.digest(bytes(after[2])),
            'dimensions': list(after[:2]), 'dimensions_exact': same_size,
            'changed_rgba_bytes': differences, 'decoded_rgba_exact': before == after,
            'png_bytes_exact': expected.read_bytes() == actual.read_bytes()}


def projection_and_rest(scene, char, canonical, output, helper):
    crops = helper.evidence.every_frame_projection(scene, char)
    helper.write(output / 'every-frame-crop.json', crops)
    if len(crops['records']) != 848 or crops['failures']:
        raise RuntimeError('Original native crop/camera/ring contract failed')
    restored = helper.snapshot(scene, char)
    rest = helper.r3.rest_contract(restored)
    helper.write(output / 'animation-contract-audit.json', rest)
    if not rest['all_checks_pass']:
        raise RuntimeError('Original 106-frame rest/clip/hammer contract failed')
    proof = helper.exact_proof(canonical, restored, output / 'preservation', 'after-read-only-audits')
    return crops, rest, proof


def main():
    bundle_io.require_grant()
    import bpy
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage', choices=('verify', 'portrait', 'native'))
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    root = bundle_io.bundle_root()
    output = bundle_io.fresh_output(args.output, root)
    before_inputs = None
    try:
        before_inputs = bundle_io.verify_bundle(root)
        if bpy.app.version_string != '5.1.2':
            raise RuntimeError('Use the accepted Blender 5.1.2 runtime')
        if Path(bpy.data.filepath).resolve() != root / 'model/skymaul.blend':
            raise RuntimeError('Freshly load this bundle’s accepted saved Blend')
        linked = [library.filepath for library in bpy.data.libraries]
        external_images = [image.filepath for image in bpy.data.images
                           if image.source == 'FILE' and image.filepath and not image.packed_file]
        if linked or external_images:
            raise RuntimeError('Saved model has an external library or image dependency')
        import r4_audit_helpers as helper
        import r4_portrait as portrait
        from render_saved import png
        scene, char = helper.pipe.find_saved('skymaul')
        canonical = json.loads((root / 'evidence/canonical-fullstate.json').read_text())
        loaded = helper.snapshot(scene, char)
        load_proof = helper.exact_proof(canonical, loaded, output / 'preservation', 'portable-fresh-load')
        helper.require_rim(scene)
        helper.require_camera(scene, char)
        projection = helper.portrait_projection(scene, char)
        helper.write(output / 'portrait-preprojection.json', projection)
        if not projection['all_checks_pass']:
            raise RuntimeError('Original portrait preprojection gates failed')
        names = [obj.name for obj in char['collection'].all_objects]
        glb = helper.pipe.inspect_glb(root / 'model/skymaul.glb', names)
        helper.write(output / 'glb-inspection.json', glb)
        result = {'portrait_preprojection_pass': True, 'glb_inspection': glb,
                  'external_library_dependencies': linked, 'external_image_dependencies': external_images}
        required = True
        if args.stage in ('verify', 'native'):
            audits = output / 'audits'
            audits.mkdir()
            crops, rest, audit_proof = projection_and_rest(scene, char, canonical, audits, helper)
            result.update({'native_crop_rows': len(crops['records']),
                           'native_crop_failures': len(crops['failures']),
                           'min_native_crop_margin_px': crops['min_margin_px'],
                           'fixed_rest_frame_count': rest['frame_count'],
                           'fixed_rest_contract_pass': rest['all_checks_pass'],
                           'audit_fullstate_numeric_exact': audit_proof['numeric_exact_equal'],
                           'audit_fullstate_byte_identical': audit_proof['byte_identical']})
        if args.stage == 'portrait':
            result['portrait'] = portrait.portrait(scene, char, output, helper, helper.pipe, helper.evidence)
            core = helper.whole_core_equality(output, helper, png)
            result['whole_core'] = core
            comparisons = [image_comparison(root / 'evidence' / name, output / name, png)
                           for name in ('skymaul-portrait.png', 'portrait-core-visible.png', 'portrait-core-isolated.png')]
            helper.write(output / 'accepted-r4-image-comparisons.json', comparisons)
            result['accepted_r4_images'] = comparisons
            required = (core['exact_support_equal'] and core['entire_core_inside']
                        and result['portrait']['alpha']['all_checks_pass']
                        and all(item['decoded_rgba_exact'] for item in comparisons))
        elif args.stage == 'native':
            render_output = output / 'renders'
            render_output.mkdir()
            helper.evidence.render(render_output, root / 'model')
            model_evidence = output / 'model'
            model_evidence.mkdir()
            (model_evidence / 'every-frame-crop.json').write_bytes((output / 'audits/every-frame-crop.json').read_bytes())
            mapping = json.loads((root / 'cell-map.json').read_text())
            comparisons = [image_comparison(root / 'native-64' / cell['source_name'],
                                           render_output / 'native-64' / cell['source_name'], png)
                           for cell in mapping['cells']]
            helper.write(output / 'accepted-native-cell-comparisons.json', comparisons)
            repeated = image_comparison(root / 'evidence/skymaul-portrait.png',
                                        render_output / 'skymaul-portrait.png', png)
            alpha = portrait.alpha_metrics(render_output / 'skymaul-portrait.png', png)
            helper.write(output / 'accepted-portrait-comparison.json', repeated)
            result.update({'native_cells': comparisons, 'repeated_portrait': repeated, 'portrait_alpha': alpha})
            required = (len(comparisons) == 24 and all(item['decoded_rgba_exact'] for item in comparisons)
                        and repeated['decoded_rgba_exact'] and alpha['all_checks_pass'])
        final = helper.exact_proof(canonical, helper.snapshot(scene, char), output / 'preservation',
                                   'portable-complete-final-restoration')
        after_inputs = bundle_io.verify_bundle(root)
        if before_inputs != after_inputs:
            raise RuntimeError('Portable operation changed a package input')
        receipt = {'status': 'actual builder evidence; fresh independent critic required',
                   'stage': args.stage, 'pid': os.getpid(), 'blender_version': bpy.app.version_string,
                   'bundle_manifest_sha256': before_inputs['manifest_sha256'],
                   'package_input_bytes_unchanged': True,
                   'fresh_load_numeric_exact': load_proof['numeric_exact_equal'],
                   'fresh_load_byte_identical': load_proof['byte_identical'],
                   'final_fullstate_numeric_exact': final['numeric_exact_equal'],
                   'final_fullstate_byte_identical': final['byte_identical'],
                   'required_measured_checks_met': required, 'result': result,
                   'inputs_before': before_inputs, 'inputs_after': after_inputs,
                   'saved': False, 'exported': False, 'procedural_rebuild': False,
                   'runtime_integration': False, 'independent_quality_verdict': None,
                   'png_comparison_note': 'Decoded dimensions and every RGBA byte are required; PNG Date/RenderTime text is diagnostic.'}
        helper.write(output / 'portable-receipt.json', receipt)
        if not required:
            raise RuntimeError('Portable reproduction gate failed; retain evidence and do not tune')
        print(json.dumps({'stage': args.stage, 'output': str(output), 'required_measured_checks_met': required,
                          'fullstate_numeric_and_byte_exact': True, 'saved': False, 'exported': False}), flush=True)
    except BaseException as error:
        bundle_io.write(output / 'portable-failure.json', {'stage': args.stage,
            'error_type': type(error).__name__, 'error': str(error), 'traceback': traceback.format_exc(),
            'bundle_before': before_inputs, 'saved': False, 'exported': False,
            'independent_quality_verdict': None})
        raise


if __name__ == '__main__':
    main()
