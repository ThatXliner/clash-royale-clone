#!/usr/bin/env python3
import hashlib
import json
import re
import subprocess
from pathlib import Path
from PIL import Image

REPO = Path(__file__).resolve().parents[5]
EVIDENCE = Path(__file__).resolve().parents[1]

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()

def alpha_info(path):
    with Image.open(path) as im:
        im.load()
        mode = im.mode
        size = list(im.size)
        alpha = im.getchannel('A') if 'A' in im.getbands() else None
        if alpha is None:
            extrema = None
            bounds = None
            body = None
        else:
            extrema = list(alpha.getextrema())
            bounds = list(alpha.getbbox()) if alpha.getbbox() else None
            body = list(alpha.point(lambda value: 255 if value >= 128 else 0).getbbox())
        return {'format': im.format, 'mode': mode, 'dimensions': size, 'alpha_extrema': extrema,
                'alpha_bounds_nonzero_xyxy_exclusive': bounds, 'alpha_bounds_ge128_xyxy_exclusive': body}

source = REPO / 'demo/assets/brackenwheel-battle-sprite.png'
output = REPO / 'public/assets/brackenwheel-battle-sprite.webp'
portrait = REPO / 'demo/assets/brackenwheel-portrait.png'
prov_path = REPO / 'docs/art/brackenwheel-battle-sprite-provenance.json'
prov = json.loads(prov_path.read_text())
source_info = alpha_info(source)
output_info = alpha_info(output)
portrait_info = alpha_info(portrait)
source_hash = digest(source)
output_hash = digest(output)
portrait_hash = digest(portrait)

expected_manifest_lines = [
    '    authorship: "in-repo-authored",',
    '    byteLength: 47854,',
    '    dimensions: { height: 512, width: 512 },',
    '    format: "webp",',
    '    id: "brackenwheel-battle-sprite",',
    '    kind: "image",',
    '    license: "AGPL-3.0-only",',
    '    path: "assets/brackenwheel-battle-sprite.webp",',
    '    sha256: "1ade074a405cb3a00bb6bd06de52b0e335469e1a3369cf714da224634c343b53",',
]
manifest = (REPO / 'src/content/visual-asset-manifest.js').read_text()
manifest_has_entry = all(line in manifest for line in expected_manifest_lines)
parent = '89f2f5c98696c08b4f495ec2ce089811e56946cd'
parent_manifest = subprocess.check_output(['git', 'show', f'{parent}:src/content/visual-asset-manifest.js'], cwd=REPO, text=True)
entry_pattern = re.compile(
    r'  \{\n'
    r'    authorship: "in-repo-authored",\n'
    r'    byteLength: 47854,\n'
    r'    dimensions: \{ height: 512, width: 512 \},\n'
    r'    format: "webp",\n'
    r'    id: "brackenwheel-battle-sprite",\n'
    r'    kind: "image",\n'
    r'    license: "AGPL-3.0-only",\n'
    r'    path: "assets/brackenwheel-battle-sprite.webp",\n'
    r'    sha256: "1ade074a405cb3a00bb6bd06de52b0e335469e1a3369cf714da224634c343b53",\n'
    r'  \},\n(?=\];)'
)
manifest_without_new_entry, replacements = entry_pattern.subn('', manifest)
previous_entries_unchanged = replacements == 1 and manifest_without_new_entry == parent_manifest
changed = subprocess.check_output(['git', 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'], cwd=REPO, text=True).splitlines()
source_changes = [p for p in changed if p.startswith('src/')]
reference_changes = [p for p in changed if p.startswith('reference/')]

result = {
    'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=REPO, text=True).strip(),
    'source': {'path': 'demo/assets/brackenwheel-battle-sprite.png', 'bytes': source.stat().st_size, 'sha256': source_hash, **source_info},
    'shipped_output': {'path': 'public/assets/brackenwheel-battle-sprite.webp', 'bytes': output.stat().st_size, 'sha256': output_hash, **output_info},
    'accepted_portrait_input': {'path': 'demo/assets/brackenwheel-portrait.png', 'bytes': portrait.stat().st_size, 'sha256': portrait_hash, **portrait_info},
    'provenance': {
        'tool': prov.get('generation_tool'), 'license': prov.get('license'), 'authorship': prov.get('authorship'),
        'prompt_present': bool(prov.get('generated_source', {}).get('prompt')),
        'input_hash_matches': portrait_hash == prov['input_images'][0]['sha256'],
        'source_hash_matches': source_hash == prov['generated_source']['sha256'],
        'output_hash_matches': output_hash == prov['shipped_output']['sha256'],
        'source_bytes_dimensions_match': source.stat().st_size == prov['generated_source']['bytes'] and source_info['dimensions'] == [prov['generated_source']['dimensions']['width'], prov['generated_source']['dimensions']['height']],
        'output_bytes_dimensions_match': output.stat().st_size == prov['shipped_output']['bytes'] and output_info['dimensions'] == [prov['shipped_output']['dimensions']['width'], prov['shipped_output']['dimensions']['height']],
        'encoding': prov['shipped_output']['encoding'],
    },
    'manifest': {'entry_present': manifest_has_entry, 'all_preexisting_entries_unchanged': previous_entries_unchanged},
    'scope': {'changed_source_paths': source_changes, 'reference_paths_changed': reference_changes, 'isolated_asset_only_source_scope': source_changes == ['src/content/visual-asset-manifest.js'] and not reference_changes},
}
out = EVIDENCE / 'receipts/asset-audit.json'
out.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
