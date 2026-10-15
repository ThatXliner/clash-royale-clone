#!/usr/bin/env python3
import hashlib
import json
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[5]
EVIDENCE = Path(__file__).resolve().parents[1]
TARGET = REPO / 'dist/release-artifacts'
BACKUP = Path('/private/tmp/art-022b-critic-20261015-release-artifacts-baseline')
RECEIPTS = EVIDENCE / 'receipts'

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()

def tree_state(path):
    if not path.exists():
        return {'exists': False, 'files': []}
    if path.is_symlink():
        return {'exists': True, 'symlink': str(path.readlink()), 'files': []}
    files = []
    for item in sorted(path.rglob('*')):
        if item.is_symlink():
            files.append({'path': item.relative_to(path).as_posix(), 'symlink': str(item.readlink())})
        elif item.is_file():
            files.append({'path': item.relative_to(path).as_posix(), 'bytes': item.stat().st_size, 'sha256': digest(item), 'mode': item.stat().st_mode & 0o777})
    return {'exists': True, 'files': files}

def save(name, value):
    (RECEIPTS / f'release-artifacts-{name}.json').write_text(json.dumps(value, indent=2) + '\n')

def remove_target():
    if TARGET.is_symlink() or (TARGET.exists() and not TARGET.is_dir()):
        TARGET.unlink()
    elif TARGET.exists():
        shutil.rmtree(TARGET)

def main():
    action = sys.argv[1]
    RECEIPTS.mkdir(parents=True, exist_ok=True)
    if action == 'before':
        if BACKUP.exists():
            raise SystemExit(f'backup already exists: {BACKUP}')
        state = tree_state(TARGET)
        if state['exists'] and not state.get('symlink'):
            shutil.copytree(TARGET, BACKUP, symlinks=True)
        save('before', {'path': str(TARGET), **state, 'backup_path': str(BACKUP) if state['exists'] else None})
        print(json.dumps({'action': action, 'state': state, 'backup_path': str(BACKUP) if state['exists'] else None}, indent=2))
    elif action in ('after-release-build', 'after-isolation-release'):
        state = tree_state(TARGET)
        save(action, {'path': str(TARGET), **state})
        print(json.dumps({'action': action, 'state': state}, indent=2))
    elif action == 'restore':
        before = json.loads((RECEIPTS / 'release-artifacts-before.json').read_text())
        remove_target()
        if before['exists'] and 'symlink' not in before:
            shutil.copytree(BACKUP, TARGET, symlinks=True)
        elif before['exists'] and 'symlink' in before:
            TARGET.symlink_to(before['symlink'])
        restored = tree_state(TARGET)
        baseline = {'exists': before['exists'], 'files': before.get('files', [])}
        exact = restored == baseline
        save('restored', {'path': str(TARGET), **restored, 'matches_before_byte_for_byte': exact})
        if BACKUP.exists():
            shutil.rmtree(BACKUP)
        print(json.dumps({'action': action, 'restored': restored, 'matches_before_byte_for_byte': exact}, indent=2))
        return 0 if exact else 1
    else:
        raise SystemExit(f'unknown action: {action}')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
