"""Measure actual PNG outputs and assemble native-size comparison evidence."""
import argparse
import hashlib
import html
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('verified_native_png', ROOT / 'inputs/observed-native-renderer/native_preview.py')
png = importlib.util.module_from_spec(spec)
spec.loader.exec_module(png)
CARDS = ('skymaul', 'brassbolt', 'reedsting')
DIRECTIONS = ('north', 'east', 'south', 'west')
POSES = ('idle', 'walk', 'contact')


def write(path, data):
    path.write_text(json.dumps(data, indent=2, sort_keys=True, allow_nan=False) + '\n')


def pixels_for(record):
    path = Path(record['native']['path'])
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != record['native']['sha256']:
        raise RuntimeError(f'Render receipt hash mismatch: {path}')
    width, height, pixels = png.read_rgba(path)
    if (width, height) != (64, 64):
        raise RuntimeError(f'Unexpected native cell size: {path}')
    return pixels


def grayscale(pixels):
    result = bytearray(pixels)
    for i in range(0, len(result), 4):
        value = round(.2126 * result[i] + .7152 * result[i+1] + .0722 * result[i+2])
        result[i:i+3] = bytes((value, value, value))
    return result


def sheet(path, rows, mode='color'):
    width, height = 256, len(rows) * 64
    output = bytearray([232, 226, 212, 255] * width * height)
    for row, records in enumerate(rows):
        for col, record in enumerate(records):
            pixels = pixels_for(record)
            if mode == 'grayscale':
                pixels = grayscale(pixels)
            png.stamp(output, width, col * 64, row * 64, 64, 64, pixels, silhouette=mode == 'silhouette')
    png.png(path, width, height, output)
    large = bytearray(width * height * 16 * 4)
    for y in range(height * 4):
        for x in range(width * 4):
            source = ((y // 4) * width + x // 4) * 4
            target = (y * width * 4 + x) * 4
            large[target:target+4] = output[source:source+4]
    png.png(path.with_name(path.stem + '-4x.png'), width * 4, height * 4, large)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--attempt', type=Path, required=True)
    args = parser.parse_args()
    attempt = args.attempt.resolve()
    out = attempt / 'comparisons'
    out.mkdir()
    rows_for_cast, reports = [], []
    for card in CARDS:
        receipt = json.loads((attempt / 'renders' / card / 'render-receipt.json').read_text())
        by_key = {(r['team'], r['direction'], r['pose'], r['kind']): r for r in receipt['images']}
        if len(by_key) != 36:
            raise RuntimeError(f'{card} must contain 24 color, 8 mask, and 4 body-only native renders')
        color_rows = [[by_key[(team, d, pose, 'color')] for d in DIRECTIONS]
                      for team in ('river', 'ember') for pose in POSES]
        mask_rows = [[by_key[(team, d, 'idle', 'team-mask')] for d in DIRECTIONS]
                     for team in ('river', 'ember')]
        body_row = [by_key[('river', d, 'idle', 'body-only')] for d in DIRECTIONS]
        rows_for_cast.append(body_row)
        for mode in ('color', 'grayscale', 'silhouette'):
            sheet(out / f'{card}-native-{mode}.png', color_rows, mode)
        sheet(out / f'{card}-native-team-masks.png', mask_rows)
        sheet(out / f'{card}-body-only-silhouette.png', [body_row], 'silhouette')
        pose_checks, team_checks, body_heights = [], [], []
        for direction in DIRECTIONS:
            for team in ('river', 'ember'):
                pixel_hashes = {pose: hashlib.sha256(pixels_for(by_key[(team, direction, pose, 'color')])).hexdigest()
                                for pose in POSES}
                if len(set(pixel_hashes.values())) != 3:
                    raise RuntimeError(f'Native poses are identical: {card} {team} {direction}')
                pose_checks.append({'direction': direction, 'team': team, 'pixel_sha256': pixel_hashes,
                                    'byte_distinct': True, 'visible_motion_verdict': 'requires independent critic'})
            river = grayscale(pixels_for(by_key[('river', direction, 'idle', 'color')]))
            ember = grayscale(pixels_for(by_key[('ember', direction, 'idle', 'color')]))
            differing = sum(river[i:i+4] != ember[i:i+4] for i in range(0, len(river), 4))
            mask_coverage = {}
            for team in ('river', 'ember'):
                pixels = pixels_for(by_key[(team, direction, 'idle', 'team-mask')])
                mask_coverage[team] = sum(pixels[i] >= 128 and pixels[i+3] >= 128 for i in range(0, len(pixels), 4))
                if mask_coverage[team] == 0:
                    raise RuntimeError('TEAM mask has no visible native pixels')
            if differing == 0:
                raise RuntimeError('Teams are identical in grayscale')
            team_checks.append({'direction': direction, 'grayscale_differing_pixels': differing,
                                'team_mask_coverage_at_128': mask_coverage,
                                'native_team_identification_verdict': 'requires independent critic'})
            bounds = png.bounds(64, 64, pixels_for(by_key[('river', direction, 'idle', 'body-only')]), 16)
            body_heights.append({'direction': direction, 'alpha_bounds_16': bounds})
        if not 10 <= max(row['alpha_bounds_16']['height'] for row in body_heights) <= 16:
            raise RuntimeError(f'Actual native body height outside study tolerance: {card}: {body_heights}')
        reports.append({'card_id': card, 'poses': pose_checks, 'teams': team_checks, 'body_heights': body_heights,
                        'native_cell_px': 64, 'body_target_px': 13, 'no_rescaling_or_cropping': True})
    sheet(out / 'cast-native-body-silhouettes.png', rows_for_cast, 'silhouette')
    write(out / 'measurement-receipt.json', {'status': 'Measured actual pixels; no independent quality verdict',
          'characters': reports, 'reference_imported': False, 'runtime_integration': False,
          'color_sheet_rows': [f'{team} {pose}' for team in ('river', 'ember') for pose in POSES],
          'columns': DIRECTIONS})
    atlas = ROOT / 'inputs/public/assets/card-portraits-painted.webp'
    import os
    atlas_rel = os.path.relpath(atlas, out)
    sections = []
    for card, cell in zip(CARDS, (3, 4, 5)):
        x, y = cell % 4, cell // 4
        sections.append(f'''<section><h2>{html.escape(card.title())}</h2>
<p>Canonical painted cell {cell}; original atlas unchanged. Candidate portrait and native study are generated evidence pending independent critique.</p>
<div class="portraits"><div><h3>Canonical</h3><div class="canon" style="background-image:url('{html.escape(atlas_rel)}');background-position:{x * 100 / 3}% {y * 100}%"></div></div><div><h3>Candidate</h3><img class="portrait" src="../renders/{card}/{card}-portrait.png" alt="Saved-scene candidate portrait"></div></div>
<p>Columns: north, east, south, west. Rows: River idle/walk/contact, then Ember idle/walk/contact. Native body target ≈13 px inside each 64 px cell.</p>
<div class="studies"><figure><figcaption>Color · actual native pixels</figcaption><img src="{card}-native-color.png"></figure><figure><figcaption>Grayscale · actual native pixels</figcaption><img src="{card}-native-grayscale.png"></figure><figure><figcaption>Silhouette · actual native pixels</figcaption><img src="{card}-native-silhouette.png"></figure></div>
<p><a href="{card}-native-color-4x.png">4× pixel inspection</a> · <a href="{card}-native-team-masks.png">Team masks</a> · <a href="{card}-body-only-silhouette.png">Body-only silhouettes</a></p></section>''')
    doc = '''<!doctype html><html lang="en"><meta charset="utf-8"><title>Saved model identity and native evidence</title><style>
body{background:#e9e2cd;color:#101a22;font:16px system-ui;margin:32px;max-width:1300px}h1,h2,h3{font-family:Georgia,serif}section{border-top:1px solid #7a5236;padding:24px 0}.portraits,.studies{display:flex;gap:24px;flex-wrap:wrap}.canon,.portrait{width:320px;height:320px}.canon{background-size:400% 200%}.portrait{object-fit:contain;background:#d7d0bb}.studies img{max-width:none;image-rendering:pixelated}figure{margin:0}figcaption{margin:12px 0}.status{font-weight:700}a{color:#245a63}
</style><h1>Skymaul, Brassbolt, Reedsting</h1><p class="status">Rendered measurements. Independent quality verdict pending.</p><p>These are standalone authoring studies. There is no live-game integration or 12-column runtime motion claim.</p>'''
    (out / 'study.html').write_text(doc + ''.join(sections) + '</html>\n')
    print(json.dumps({'status': 'measured', 'output': str(out), 'visual_verdict': 'not reviewed'}))


if __name__ == '__main__':
    main()
