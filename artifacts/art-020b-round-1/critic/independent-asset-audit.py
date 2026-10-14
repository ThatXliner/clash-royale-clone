import hashlib, json
from pathlib import Path
from PIL import Image

root = Path('/tmp/art-020b-rivet-runners.HZPTr8/checkout-final')
provenance_path = root / 'docs/art/rivet-runners-battle-sprite-provenance.json'
provenance = json.loads(provenance_path.read_text())

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def image_stats(relative):
    path = root / relative
    with Image.open(path) as im:
        info = {'path': relative, 'bytes': path.stat().st_size, 'sha256': sha(path), 'format': im.format, 'dimensions': list(im.size), 'mode': im.mode}
        if 'A' in im.getbands():
            alpha = im.getchannel('A')
            info.update({
                'alphaMin8Bit': alpha.getextrema()[0],
                'alphaMax8Bit': alpha.getextrema()[1],
                'transparentPixelCount': sum(v == 0 for v in alpha.getdata()),
                'translucentPixelCount': sum(0 < v < 255 for v in alpha.getdata()),
                'opaquePixelCount': sum(v == 255 for v in alpha.getdata()),
                'cornerAlpha': [alpha.getpixel((x, y)) for x, y in [(0,0),(im.width-1,0),(0,im.height-1),(im.width-1,im.height-1)]],
            })
        return info

files = {
    'portrait': image_stats('demo/assets/rivet-runners-portrait.png'),
    'v1': image_stats('demo/assets/rivet-runners-battle-sprite-v1.png'),
    'finalSource': image_stats('demo/assets/rivet-runners-battle-sprite.png'),
    'shippedWebp': image_stats('public/assets/rivet-runners-battle-sprite.webp'),
}
checks = []
def check(label, expected, actual):
    checks.append({'label': label, 'expected': expected, 'actual': actual, 'pass': expected == actual})

check('portrait input source hash', provenance['generations'][0]['input_images'][0]['sha256'], files['portrait']['sha256'])
check('preserved v1 hash', provenance['generations'][0]['generated_source']['sha256'], files['v1']['sha256'])
check('final generated source hash', provenance['generations'][1]['generated_source']['sha256'], files['finalSource']['sha256'])
check('shipped WebP hash', provenance['shipped_output']['sha256'], files['shippedWebp']['sha256'])
check('reencoded WebP exact hash', files['shippedWebp']['sha256'], sha(Path('artifacts/art-020b-round-1/critic/reencoded-from-candidate.webp')))
check('license', 'AGPL-3.0-only', provenance['license'])
check('authorship', 'in-repo-authored', provenance['authorship'])
check('tool source', 'OpenAI built-in imagegen image-edit tool', provenance['tool_source'])
check('generator prompt count', 2, len(provenance['generations']))
check('all generation prompts present', True, all(isinstance(item.get('prompt'), str) and len(item['prompt']) > 100 for item in provenance['generations']))
check('WebP byte limit', True, files['shippedWebp']['bytes'] <= 1048576)
check('all four final WebP corners transparent', [0,0,0,0], files['shippedWebp']['cornerAlpha'])
check('actual generated files are RGBA with genuine transparency', True, all(files[key]['mode'] == 'RGBA' and files[key]['alphaMin8Bit'] == 0 and files[key]['transparentPixelCount'] > 0 for key in ['v1','finalSource','shippedWebp']))

report = {
    'candidate': str(root),
    'provenancePath': str(provenance_path),
    'tool': provenance['tool_source'],
    'license': provenance['license'],
    'encoding': provenance['shipped_output']['encoding'],
    'images': files,
    'checks': checks,
    'result': 'pass' if all(item['pass'] for item in checks) else 'fail',
}
out = Path('artifacts/art-020b-round-1/critic/independent-asset-audit.json')
out.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
if report['result'] != 'pass': raise SystemExit(1)
