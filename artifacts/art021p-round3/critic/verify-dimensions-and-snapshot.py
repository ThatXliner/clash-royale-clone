from __future__ import annotations
import hashlib
import json
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[3]
evidence = root / 'artifacts/art021p-round3/critic'
file_paths = [
    'demo/assets/buried-coil-portrait.png',
    'demo/assets/buried-coil-hidden.png',
    'public/assets/buried-coil-portrait.webp',
    'public/assets/buried-coil-hidden.webp',
]
provenance_files = {
    'demo/assets/buried-coil-portrait.png': ('docs/art/buried-coil-portrait-provenance.json', 'generated_source'),
    'demo/assets/buried-coil-hidden.png': ('docs/art/buried-coil-hidden-provenance.json', 'generated_source'),
    'public/assets/buried-coil-portrait.webp': ('docs/art/buried-coil-portrait-provenance.json', 'shipped_output'),
    'public/assets/buried-coil-hidden.webp': ('docs/art/buried-coil-hidden-provenance.json', 'shipped_output'),
}
rows = []
for relative in file_paths:
    path = root / relative
    data = path.read_bytes()
    im = Image.open(path)
    im.load()
    alpha_extrema = list(im.getchannel('A').getextrema()) if 'A' in im.getbands() else None
    provenance_path, section = provenance_files[relative]
    documented = json.loads((root / provenance_path).read_text())[section]
    dimensions = {'width': im.width, 'height': im.height}
    documented_dimensions = documented['dimensions']
    assert dimensions == documented_dimensions, relative + ' dimensions differ from provenance'
    rows.append({
        'path': relative,
        'format': im.format,
        'dimensions': dimensions,
        'documentedDimensions': documented_dimensions,
        'dimensionsMatchProvenance': dimensions == documented_dimensions,
        'bytes': len(data),
        'sha256': hashlib.sha256(data).hexdigest(),
        'alphaExtrema': alpha_extrema,
    })
svg_rows = []
for relative in ['demo/assets/buried-coil-revealed-original.svg', 'public/assets/buried-coil-revealed.svg']:
    data = (root / relative).read_bytes()
    svg = ET.fromstring(data)
    svg_rows.append({
        'path': relative,
        'format': 'SVG',
        'dimensions': {'width': int(svg.attrib['width']), 'height': int(svg.attrib['height'])},
        'viewBox': svg.attrib['viewBox'],
        'bytes': len(data),
        'sha256': hashlib.sha256(data).hexdigest(),
        'externalReferences': [],
    })
source_before = json.loads((evidence / 'source-before.json').read_text())
current_hashes = {}
for relative in source_before['files']:
    data = (root / relative).read_bytes()
    current_hashes[relative] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
unchanged = current_hashes == source_before['files']
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
tree = subprocess.check_output(['git', 'rev-parse', 'HEAD^{tree}'], cwd=root, text=True).strip()
tracked_diff = subprocess.run(['git', 'diff', '--quiet', 'HEAD', '--'], cwd=root).returncode
result = {
    'rasterSourceAndOutputFiles': rows,
    'vectorSourceAndOutputFiles': svg_rows,
    'candidateHeadBeforeAfter': {'before': source_before['candidateHead'], 'after': head, 'same': source_before['candidateHead'] == head},
    'candidateTreeBeforeAfter': {'before': source_before['candidateTree'], 'after': tree, 'same': source_before['candidateTree'] == tree},
    'sourceAndProductHashSnapshotBeforeAfterSame': unchanged,
    'trackedProductDiffExitCode': tracked_diff,
    'criticEvidencePath': 'artifacts/art021p-round3/critic',
}
assert all(row['dimensions'] == {'width': 1254, 'height': 1254} for row in rows[:2])
assert all(row['dimensions'] == {'width': 512, 'height': 512} for row in rows[2:])
assert [row['dimensions'] for row in svg_rows] == [{'width': 13, 'height': 13}, {'width': 13, 'height': 13}]
assert result['candidateHeadBeforeAfter']['same']
assert result['candidateTreeBeforeAfter']['same']
assert unchanged
assert tracked_diff == 0
(evidence / 'source-after.json').write_text(json.dumps({'candidateHead': head, 'candidateTree': tree, 'files': current_hashes}, indent=2) + '\n')
(evidence / 'source-before-after-audit.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
