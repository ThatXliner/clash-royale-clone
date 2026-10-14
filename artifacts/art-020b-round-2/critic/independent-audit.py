#!/usr/bin/env python3
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from PIL import Image

ROOT = Path.cwd().resolve()
OUT = Path(__file__).resolve().parent
CANDIDATE = '473e853cfb6fc6a35476a82fb096cbef08e21835'
PARENT = 'dbd7afe4a8901b5b61c83ebc92137a5bd26e5451'
EXPECTED = {
    'portrait': ('demo/assets/rivet-runners-portrait.png', 'b84c733e475b50d746d955ec805d0c5da1e998ca4e2fc9f76305f661ce942de0', 2819557, (1254, 1254)),
    'v1': ('demo/assets/rivet-runners-battle-sprite-v1.png', '39b814504a9efe7f65b044ad0706589d3419d04ad3be0e53f55cdda5846edac3', 2210210, (1254, 1254)),
    'v2': ('demo/assets/rivet-runners-battle-sprite-v2.png', '8fe8439376ab117cb88dac92c5eb9a32a9ee564c3f72a3ab3dccfe9aa22f8b65', 2220668, (1254, 1254)),
    'v3': ('demo/assets/rivet-runners-battle-sprite.png', '1eb0f74862d3ec768e1fcfac727d20be8d7fd0fa2c5b88e93207ae296349663e', 1890785, (1254, 1254)),
    'webp': ('public/assets/rivet-runners-battle-sprite.webp', '0a9d033f894bd19178871a2927117cf66bb7f42c0b65dc224e11cecca0b4ce53', 78170, (512, 512)),
}

def run_git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout

def digest(data):
    return hashlib.sha256(data).hexdigest()

def git_paths(rev, prefix):
    raw = run_git('ls-tree', '-r', '--name-only', rev, '--', prefix).decode().splitlines()
    return set(raw)

def git_blob(rev, path):
    return run_git('show', f'{rev}:{path}')

def image_report(path):
    with Image.open(path) as image:
        mode = image.mode
        rgba = image.convert('RGBA')
        alpha = rgba.getchannel('A')
        hist = alpha.histogram()
        return {
            'path': str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path),
            'format': image.format,
            'mode': mode,
            'dimensions': list(image.size),
            'alpha_channel': 'A' in mode or 'transparency' in image.info,
            'alpha_min': alpha.getextrema()[0],
            'alpha_max': alpha.getextrema()[1],
            'transparent_pixels': hist[0],
            'translucent_pixels': sum(hist[1:255]),
            'opaque_pixels': hist[255],
            'bytes': path.stat().st_size,
            'sha256': digest(path.read_bytes()),
        }

assert run_git('rev-parse', 'HEAD').decode().strip() == CANDIDATE
assert run_git('rev-parse', f'{CANDIDATE}^').decode().strip() == PARENT
status = run_git('status', '--porcelain=v1', '--untracked-files=no').decode().strip()
assert status == '', f'clean archive has tracked changes: {status}'

# Verify every pre-existing art provenance record and source asset by committed bytes.
prior_art = sorted(git_paths(PARENT, 'docs/art'))
candidate_art = git_paths(CANDIDATE, 'docs/art')
new_art = sorted(candidate_art - set(prior_art))
assert new_art == ['docs/art/rivet-runners-battle-sprite-provenance.json'], new_art
prior_art_hashes = {}
for path in prior_art:
    before = git_blob(PARENT, path)
    after = git_blob(CANDIDATE, path)
    assert before == after, f'prior provenance changed: {path}'
    prior_art_hashes[path] = digest(before)

prior_asset_hashes = {}
asset_additions = {}
for prefix, allowed_additions in {
    'public/assets': {'public/assets/rivet-runners-battle-sprite.webp'},
    'demo/assets': {
        'demo/assets/rivet-runners-battle-sprite-v1.png',
        'demo/assets/rivet-runners-battle-sprite-v2.png',
        'demo/assets/rivet-runners-battle-sprite.png',
    },
}.items():
    before_paths = git_paths(PARENT, prefix)
    after_paths = git_paths(CANDIDATE, prefix)
    additions = sorted(after_paths - before_paths)
    assert set(additions) == allowed_additions, f'unexpected {prefix} changes: {additions}'
    asset_additions[prefix] = additions
    for path in sorted(before_paths):
        before = git_blob(PARENT, path)
        after = git_blob(CANDIDATE, path)
        assert before == after, f'prior asset changed: {path}'
        prior_asset_hashes[path] = digest(before)

base_manifest = git_blob(PARENT, 'src/content/visual-asset-manifest.js').decode()
candidate_manifest = git_blob(CANDIDATE, 'src/content/visual-asset-manifest.js').decode()
needle = 'id: "rivet-runners-battle-sprite",'
assert candidate_manifest.count(needle) == 1
assert needle not in base_manifest
record_index = candidate_manifest.index(needle)
record_start = candidate_manifest.rfind('  {\n', 0, record_index)
record_end = candidate_manifest.index('  },\n', record_index) + len('  },\n')
new_record = candidate_manifest[record_start:record_end]
assert candidate_manifest[:record_start] + candidate_manifest[record_end:] == base_manifest
for expected_field in [
    'authorship: "in-repo-authored"',
    'byteLength: 78170',
    'dimensions: { height: 512, width: 512 }',
    'format: "webp"',
    'id: "rivet-runners-battle-sprite"',
    'kind: "image"',
    'license: "AGPL-3.0-only"',
    'path: "assets/rivet-runners-battle-sprite.webp"',
    'sha256: "0a9d033f894bd19178871a2927117cf66bb7f42c0b65dc224e11cecca0b4ce53"',
]:
    assert expected_field in new_record, expected_field

provenance_path = ROOT / 'docs/art/rivet-runners-battle-sprite-provenance.json'
provenance = json.loads(provenance_path.read_text())
assert provenance['asset_id'] == 'rivet-runners-battle-sprite'
assert provenance['license'] == 'AGPL-3.0-only'
assert provenance['authorship'] == 'in-repo-authored'
assert provenance['tool_source'] == 'OpenAI built-in imagegen image-edit tool'
assert len(provenance['generations']) == 5
assert provenance['generations'][0]['generated_source']['path'] == EXPECTED['v1'][0]
assert provenance['generations'][1]['generated_source']['path'] == EXPECTED['v2'][0]
assert provenance['generations'][-1]['generated_source']['path'] == EXPECTED['v3'][0]
assert provenance['generations'][-1]['status'].startswith('adopted')
for index in [0, 1, 4]:
    generation = provenance['generations'][index]
    generated = generation['generated_source']
    assert generated.get('tool_output_path', '').startswith('/Users/me/.codex/generated_images/')
    assert len(generation.get('prompt', '')) > 100
    assert generation.get('input_images')
    for source in [generated, *generation['input_images']]:
        path = source.get('path')
        if not path:
            continue
        source_path = ROOT / path
        assert source_path.is_file(), f'missing preserved source: {path}'
        payload = source_path.read_bytes()
        actual_image = image_report(source_path)
        assert digest(payload) == source['sha256'], f'hash mismatch: {path}'
        assert len(payload) == source['bytes'], f'byte length mismatch: {path}'
        assert actual_image['dimensions'] == [source['dimensions']['width'], source['dimensions']['height']], f'dimension mismatch: {path}'
        if source.get('alpha_channel'):
            assert actual_image['alpha_channel']

images = {}
for key, (path, expected_hash, expected_bytes, expected_dimensions) in EXPECTED.items():
    image_path = ROOT / path
    report = image_report(image_path)
    assert report['sha256'] == expected_hash, f'hash mismatch: {path}'
    assert report['bytes'] == expected_bytes, f'byte length mismatch: {path}'
    assert tuple(report['dimensions']) == expected_dimensions, f'dimension mismatch: {path}'
    if key in {'v1', 'v2', 'v3'}:
        assert report['alpha_channel'] and report['alpha_min'] == 0 and report['alpha_max'] == 255
    if key == 'webp':
        assert report['alpha_channel'] and report['alpha_min'] == 0 and report['alpha_max'] == 254
        assert report['bytes'] <= 1024 * 1024
    images[key] = report

shipped = provenance['shipped_output']
assert shipped['sha256'] == EXPECTED['webp'][1]
assert shipped['bytes'] == EXPECTED['webp'][2]
assert shipped['dimensions'] == {'width': 512, 'height': 512}
assert shipped['encoding']['tool'] == 'cwebp'
assert shipped['encoding']['version'] == '1.6.0'
assert shipped['encoding']['arguments'] == ['-quiet', '-q', '88', '-m', '6', '-metadata', 'none', '-resize', '512', '512']
reencoded = OUT / 'reencoded-rivet-runners-battle.webp'
reencoded_report = image_report(reencoded)
assert reencoded_report['sha256'] == EXPECTED['webp'][1]

# Frozen Pages output audit: every release file matches its own manifest; protected sources stay out.
pages_root = Path('/private/tmp/art020b-round2-critic-pages')
release_manifest = json.loads((pages_root / 'game/release-manifest.json').read_text())
manifest_entries = release_manifest['files']
verified_files = []
for entry in manifest_entries:
    file_path = pages_root / 'game' / entry['path']
    payload = file_path.read_bytes()
    actual_hash = digest(payload)
    assert actual_hash == entry['sha256'], f"release hash mismatch: {entry['path']}"
    assert len(payload) == entry['size'], f"release size mismatch: {entry['path']}"
    verified_files.append({'path': entry['path'], 'sha256': actual_hash, 'bytes': len(payload)})
webp_entries = [entry for entry in manifest_entries if entry['path'] == 'public/assets/rivet-runners-battle-sprite.webp']
assert len(webp_entries) == 1 and webp_entries[0]['sha256'] == EXPECTED['webp'][1]
output_files = sorted(path for path in pages_root.rglob('*') if path.is_file())
protected_segments = ['/reference/', 'docs/art/', 'provenance', '/tests/', '/artifacts/', '/demo/', '/node_modules/']
protected_paths = [str(path.relative_to(pages_root)) for path in output_files if any(segment in f'/{str(path.relative_to(pages_root))}' for segment in protected_segments)]
assert not protected_paths, protected_paths
protected_source_hashes = {entry[1] for key, entry in EXPECTED.items() if key in {'portrait', 'v1', 'v2', 'v3'}}
output_hashes = {digest(path.read_bytes()) for path in output_files}
leaked_source_hashes = sorted(protected_source_hashes & output_hashes)
assert not leaked_source_hashes, leaked_source_hashes
assert release_manifest['fileCount'] == len(manifest_entries)
assert release_manifest['totalBytes'] == sum(entry['size'] for entry in manifest_entries)

source_hash_manifest = {
    'candidate_commit': CANDIDATE,
    'candidate_parent': PARENT,
    'candidate_tree': run_git('rev-parse', f'{CANDIDATE}^{{tree}}').decode().strip(),
    'clean_archive_tracked_status': status,
    'new_provenance_record': new_art[0],
    'prior_provenance_count_byte_identical': len(prior_art_hashes),
    'prior_provenance_sha256': prior_art_hashes,
    'prior_asset_files_byte_identical': len(prior_asset_hashes),
    'prior_asset_sha256': prior_asset_hashes,
    'new_asset_paths': asset_additions,
    'new_manifest_record_sha256': digest(new_record.encode()),
    'new_manifest_record_count': 1,
    'images': images,
    'independent_reencode': reencoded_report,
    'pages': {
        'output_root': str(pages_root),
        'release_file_count': release_manifest['fileCount'],
        'release_total_bytes': release_manifest['totalBytes'],
        'release_hashes_verified': len(verified_files),
        'new_battle_webp_occurrences': len(webp_entries),
        'protected_output_paths': protected_paths,
        'protected_fullsource_hashes_found': leaked_source_hashes,
        'output_file_count': len(output_files),
        'release_files': verified_files,
    },
}
(OUT / 'independent-audit.json').write_text(json.dumps(source_hash_manifest, indent=2) + '\n')
print(json.dumps({
    'candidate': CANDIDATE,
    'parent': PARENT,
    'prior_provenance_records_byte_identical': len(prior_art_hashes),
    'prior_assets_byte_identical': len(prior_asset_hashes),
    'new_manifest_records': 1,
    'images_checked': {key: {k: images[key][k] for k in ['dimensions', 'bytes', 'sha256', 'alpha_min', 'alpha_max']} for key in images},
    'independent_reencode_sha256_matches': reencoded_report['sha256'] == EXPECTED['webp'][1],
    'pages': source_hash_manifest['pages'] | {'release_files': f'{len(verified_files)} hashes checked'},
}, indent=2))
