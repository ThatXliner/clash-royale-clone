"""Serial native model build/render runner. A fresh heavy-runtime grant is mandatory."""
import argparse
import ast
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
CARDS = ('skymaul', 'brassbolt', 'reedsting')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_inputs():
    records = []
    for manifest_name in ('input-manifest.json', 'observed-renderer-input-manifest.json'):
        manifest = json.loads((ROOT / manifest_name).read_text())
        for item in manifest['files']:
            path = ROOT / item['payload_path']
            if path.stat().st_size != item['bytes'] or sha(path) != item['sha256']:
                raise RuntimeError(f'Immutable input changed: {path}')
            records.append({'path': item['payload_path'], 'sha256': item['sha256'], 'bytes': item['bytes']})
    original = ROOT / 'inputs/observed-native-renderer/prepared-source-hashes.json'
    expected = json.loads((ROOT / 'observed-renderer-input-manifest.json').read_text())['source_manifest_sha256']
    if sha(original) != expected:
        raise RuntimeError('Observed renderer manifest changed')
    return records


def source_hashes():
    return [{'path': str(path.relative_to(ROOT)), 'bytes': path.stat().st_size, 'sha256': sha(path)}
            for path in sorted(ROOT.rglob('*')) if path.is_file()
            and path.parts[len(ROOT.parts)] not in ('attempts', 'checks', '__pycache__')
            and '__pycache__' not in path.parts
            and path.name != 'prepared-source-hashes.json']


def check():
    for path in sorted((ROOT / 'scripts').glob('*.py')):
        ast.parse(path.read_text(), filename=str(path))
    ast.parse((ROOT / 'run.py').read_text(), filename='run.py')
    inputs = verify_inputs()
    prepared = ROOT / 'prepared-source-hashes.json'
    if prepared.exists():
        expected = json.loads(prepared.read_text())['files']
        actual = source_hashes()
        if expected != actual:
            raise RuntimeError('Prepared payload source changed; freeze a new source package before execution')
    return {'status': 'source checks only', 'python_ast_parse': True, 'immutable_input_count': len(inputs),
            'bpy_imported': False, 'blender_executed': False, 'renders_created': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--blender', type=Path)
    parser.add_argument('--runtime-grant')
    parser.add_argument('--attempt', required=False)
    args = parser.parse_args()
    source_check = check()
    if args.check:
        print(json.dumps(source_check, indent=2))
        return
    if not args.runtime_grant or args.runtime_grant == 'REPLACE_WITH_FRESH_PARENT_GRANT' or not args.blender or not args.attempt:
        parser.error('Execution needs --blender, --runtime-grant, and a new --attempt; source preparation is not a grant')
    if Path(args.attempt).name != args.attempt or args.attempt in ('.', '..'):
        parser.error('--attempt must be one new directory name')
    blender = args.blender.resolve()
    if not blender.is_file():
        parser.error('Blender executable not found')
    runtime_notes = json.loads((ROOT / 'installed-exporter-source-notes.json').read_text())
    if str(blender) != runtime_notes['executable']:
        parser.error('This prepared runner is pinned to the inspected Blender executable path')
    for item in runtime_notes['files']:
        path = Path(item['path'])
        if path.stat().st_size != item['bytes'] or sha(path) != item['sha256']:
            raise RuntimeError('Installed exporter source changed; recheck compatibility before execution')
    attempt = ROOT / 'attempts' / args.attempt
    attempt.mkdir(parents=True, exist_ok=False)
    source_before = source_hashes()
    (attempt / 'source-before.json').write_text(json.dumps(source_before, indent=2) + '\n')
    (attempt / 'invocation.json').write_text(json.dumps({'argv': sys.argv, 'pid': os.getpid(),
        'runtime_grant': args.runtime_grant, 'source_check': source_check,
        'started_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'render_order': list(CARDS), 'parallel_heavy_processes': False}, indent=2) + '\n')
    results = []
    try:
        for card in CARDS:
            model_dir = attempt / 'models' / card
            commands = [
                ('build-' + card, [str(blender), '--background', '--factory-startup', '--threads', '2',
                 '--python-exit-code', '1', '--python', str(ROOT / 'scripts/build_models.py'), '--', '--character', card, '--output', str(model_dir)]),
                ('render-' + card, [str(blender), '--background', str(model_dir / (card + '.blend')), '--threads', '2',
                 '--python-exit-code', '1', '--python', str(ROOT / 'scripts/render_saved.py'), '--', '--character', card,
                 '--model-dir', str(model_dir), '--output', str(attempt / 'renders' / card)]),
            ]
            for name, command in commands:
                results.append(execute(attempt, name, command))
                verify_inputs()
                if source_hashes() != source_before:
                    raise RuntimeError('Payload source changed during heavy execution')
        results.append(execute(attempt, 'measure', [sys.executable, str(ROOT / 'scripts/measure.py'), '--attempt', str(attempt)]))
    finally:
        source_after = source_hashes()
        (attempt / 'source-after.json').write_text(json.dumps(source_after, indent=2) + '\n')
        (attempt / 'run-receipt.json').write_text(json.dumps({'commands': results,
            'source_unchanged': source_before == source_after, 'execution_complete': len(results) == 7,
            'finished_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'quality_verdict': 'independent critic required', 'runtime_integration': False}, indent=2) + '\n')
    if source_hashes() != source_before:
        raise RuntimeError('Final source integrity failed')
    print(json.dumps({'status': 'generated evidence', 'attempt': str(attempt),
                      'quality_verdict': 'independent critic required'}, indent=2))


def execute(attempt, name, command):
    started = time.monotonic()
    record = {'name': name, 'argv': command}
    (attempt / (name + '-command.json')).write_text(json.dumps(record, indent=2) + '\n')
    env = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}
    with (attempt / (name + '-stdout.log')).open('wb') as stdout, (attempt / (name + '-stderr.log')).open('wb') as stderr:
        process = subprocess.Popen(command, cwd=ROOT, env=env, stdout=stdout, stderr=stderr)
        (attempt / (name + '-pid.txt')).write_text(str(process.pid) + '\n')
        code = process.wait()
    record.update({'exit_code': code, 'elapsed_seconds': time.monotonic() - started})
    (attempt / (name + '-result.json')).write_text(json.dumps(record, indent=2) + '\n')
    if code:
        raise RuntimeError(f'{name} failed with exit {code}; inspect preserved logs, do not continue to render')
    return record


if __name__ == '__main__':
    main()
