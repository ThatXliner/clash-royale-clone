"""Portable package integrity and fresh-output boundaries; no model authoring."""
import hashlib
import json
import os
from pathlib import Path

BAR_SHA256 = '2ac5d770e8b2aa3142ba9e4bb8c956af6ae8595bf4e92166ef6a87c3e44a4efe'
BUNDLE_LIMIT = 6 * 1024 * 1024


def bundle_root():
    return Path(__file__).resolve().parents[2]


def require_grant():
    if os.environ.get('SKYMAUL_R4_PACKAGE_RUNTIME_GRANT') != '1':
        raise RuntimeError('Separate root package runtime grant required')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + '\n')


def verify_bundle(root):
    manifest_path = root / 'bundle-manifest.json'
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    if manifest['schema'] != 'skymaul-r4-portable-package-v1':
        raise RuntimeError('Unexpected portable package schema')
    if manifest['pinned_package_bar_sha256'] != BAR_SHA256:
        raise RuntimeError('Package BAR differs from the source pin')
    names, records = set(), []
    for entry in manifest['files']:
        relative = Path(entry['path'])
        if relative.is_absolute() or '..' in relative.parts or relative.as_posix() in names:
            raise RuntimeError('Invalid or duplicate manifest path')
        names.add(relative.as_posix())
        path = root / relative
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise RuntimeError('Package dependency leaves bundle: ' + str(relative))
        data = path.read_bytes()
        record = {'path': relative.as_posix(), 'bytes': len(data), 'sha256': digest(data)}
        if record != {key: entry[key] for key in record}:
            raise RuntimeError('Package input changed: ' + str(relative))
        records.append(record)
    actual = {path.relative_to(root).as_posix() for path in root.rglob('*') if path.is_file()}
    if actual != names | {'bundle-manifest.json'}:
        raise RuntimeError('Package has missing or unlisted files')
    total = sum(record['bytes'] for record in records) + len(manifest_bytes)
    if total > BUNDLE_LIMIT:
        raise RuntimeError('Portable package exceeds pinned 6 MiB limit')
    if digest((root / 'evidence/package-BAR.md').read_bytes()) != BAR_SHA256:
        raise RuntimeError('Bundled BAR changed')
    return {'manifest_sha256': digest(manifest_bytes), 'total_bytes': total,
            'file_count': len(records) + 1, 'files': records}


def fresh_output(value, root):
    output = Path(value).expanduser().resolve()
    if output == root or output.is_relative_to(root) or root.is_relative_to(output):
        raise RuntimeError('Outputs must be outside, and cannot contain, the input bundle')
    output.mkdir(parents=True, exist_ok=False)
    return output
