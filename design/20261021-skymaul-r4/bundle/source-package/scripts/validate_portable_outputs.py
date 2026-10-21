"""Require completed portable-stage evidence and the unchanged native metric gates."""
import argparse
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bundle_io


def main():
    bundle_io.require_grant()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', required=True, type=Path)
    parser.add_argument('--portrait', required=True, type=Path)
    parser.add_argument('--native', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    root = bundle_io.bundle_root()
    bundle = bundle_io.verify_bundle(root)
    if args.output.exists() or args.output.resolve().is_relative_to(root):
        raise RuntimeError('Completion receipt needs a fresh external file')
    failures, stages, proofs = [], {}, []
    for stage, directory in (('verify', args.verify), ('portrait', args.portrait), ('native', args.native)):
        directory = directory.resolve()
        receipt = json.loads((directory / 'portable-receipt.json').read_text())
        stages[stage] = receipt
        if receipt['stage'] != stage or receipt['bundle_manifest_sha256'] != bundle['manifest_sha256']:
            failures.append(stage + ': wrong stage or bundle')
        for key in ('package_input_bytes_unchanged', 'fresh_load_numeric_exact', 'fresh_load_byte_identical',
                    'final_fullstate_numeric_exact', 'final_fullstate_byte_identical', 'required_measured_checks_met'):
            if receipt[key] is not True:
                failures.append(stage + ': ' + key)
        if any(receipt[key] for key in ('saved', 'exported', 'procedural_rebuild', 'runtime_integration')):
            failures.append(stage + ': unexpected mutation or scope claim')
        if (directory / 'portable-failure.json').exists():
            failures.append(stage + ': retained failed invocation')
        for path in sorted(directory.rglob('*-proof.json')):
            proof = json.loads(path.read_text())
            proofs.append({'stage': stage, 'path': str(path), 'label': proof['label'],
                           'numeric_exact_equal': proof['numeric_exact_equal'], 'byte_identical': proof['byte_identical']})
            if not proof['numeric_exact_equal'] or not proof['byte_identical']:
                failures.append(stage + ': non-exact proof ' + proof['label'])
    core = stages['portrait']['result']['whole_core']
    if not core['exact_support_equal'] or not core['entire_core_inside'] or core['lost_pixels'] or core['extra_pixels']:
        failures.append('Whole-core support equality')
    metrics = json.loads((args.native / 'measurements/metrics.json').read_text())
    required = [gate for gate in metrics['gates'] if not gate['diagnostic_only']]
    diagnostics = [gate for gate in metrics['gates'] if gate['diagnostic_only']]
    if len(required) != 286 or metrics['failure_count'] != 0 or any(not gate['met'] for gate in required):
        failures.append('Original 286 native gates')
    if len(diagnostics) != 28 or not metrics['render_hashes_verified']:
        failures.append('Original native diagnostics or render hashes')
    crop = metrics['every_frame_crop']
    if crop['rows'] != 848 or crop['failures']:
        failures.append('Original 848 crop rows')
    for stage in ('verify', 'native'):
        result = stages[stage]['result']
        if (result['native_crop_rows'] != 848 or result['native_crop_failures'] or
                result['fixed_rest_frame_count'] != 106 or not result['fixed_rest_contract_pass']):
            failures.append(stage + ': original crop/rest contracts')
    result = {'status': 'complete builder evidence; independent critic still required',
              'bundle_manifest_sha256': bundle['manifest_sha256'],
              'required_native_gates': len(required), 'native_failures': metrics['failure_count'],
              'diagnostic_gates': len(diagnostics), 'crop': crop,
              'whole_core_visible': core['visible_pixels'], 'whole_core_isolated': core['isolated_pixels'],
              'whole_core_lost': core['lost_pixels'], 'whole_core_extra': core['extra_pixels'],
              'proofs': proofs, 'failures': failures, 'all_checks_pass': not failures,
              'runtime_acceptance': False, 'independent_quality_verdict': None}
    bundle_io.write(args.output, result)
    print(json.dumps({key: result[key] for key in ('required_native_gates', 'native_failures', 'failures', 'all_checks_pass')}))
    if failures:
        raise RuntimeError('Portable completion checks failed; retain all raw evidence')


if __name__ == '__main__':
    main()
