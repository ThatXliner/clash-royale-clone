from pathlib import Path
import hashlib, json, sys

candidate = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
asset_rel = Path('game/public/assets/kilnkeeper-battle-sprite.webp')
asset = output / asset_rel
if not asset.is_file():
    raise SystemExit(f'missing shipped asset from Pages output: {asset_rel}')
files = sorted(p.relative_to(output).as_posix() for p in output.rglob('*') if p.is_file())
prohibited_names = [
    'kilnkeeper-battle-sprite-v2.png',
    'kilnkeeper-battle-sprite.png',
    'kilnkeeper-portrait.png',
    'kilnkeeper-battle-sprite-provenance.json',
]
for token in prohibited_names:
    if any(token in p for p in files):
        raise SystemExit(f'unexpected source/provenance file shipped: {token}')
prohibited_dirs = {'reference', 'artifacts', 'demo', 'docs'}
leaked = [p for p in files if prohibited_dirs.intersection(Path(p).parts)]
if leaked:
    raise SystemExit('unexpected non-shipping source paths: ' + ', '.join(leaked))
expected = (candidate / 'public/assets/kilnkeeper-battle-sprite.webp').read_bytes()
actual = asset.read_bytes()
if actual != expected:
    raise SystemExit('Pages output WebP differs from the candidate asset bytes')
result = {
    'candidate_root': str(candidate),
    'pages_output': str(output),
    'file_count': len(files),
    'release_bytes': sum((output / p).stat().st_size for p in files),
    'shipped_asset_path': asset_rel.as_posix(),
    'shipped_asset_sha256': hashlib.sha256(actual).hexdigest(),
    'shipped_asset_bytes': len(actual),
    'candidate_output_byte_identical': True,
    'source_pngs_and_provenance_omitted': True,
    'reference_demo_artifacts_docs_omitted': True,
}
Path(__file__).with_name('pages-output-audit.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
