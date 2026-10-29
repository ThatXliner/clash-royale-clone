"""Pack Stormkite once with the existing pinned integer area reduction helpers."""

import hashlib
import json
from pathlib import Path
import struct
import subprocess


ROOT = Path(__file__).resolve().parent
REPO = Path('/Users/me/.codex/worktrees/9456/clash-royale-clone')
COMMIT = '3df9a311'
HELPER_PATH = 'scripts/build-copperskiff-atlas.py'
DIRECTIONS = ('east', 'north', 'south', 'west')
ROWS = (('ember', 'idle'), ('ember', 'contact'), ('river', 'idle'), ('river', 'contact'))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def profiles(path):
    data = path.read_bytes()
    cursor, result = 8, {}
    while cursor < len(data):
        length = struct.unpack_from('>I', data, cursor)[0]
        kind = data[cursor + 4:cursor + 8]
        if kind in (b'sRGB', b'gAMA', b'cHRM'):
            result[kind] = data[cursor + 8:cursor + 8 + length]
        cursor += length + 12
    if set(result) != {b'sRGB', b'gAMA', b'cHRM'}:
        raise ValueError('The raw image is missing an explicit sRGB/gamma/chromaticity profile')
    return result


def bounds(rows, threshold):
    coordinates = [(x, y) for y, row in enumerate(rows) for x in range(len(row) // 4) if row[x * 4 + 3] >= threshold]
    if not coordinates:
        raise ValueError('The sprite contains no visible pixels')
    xs, ys = zip(*coordinates)
    return {'x': min(xs), 'y': min(ys), 'width': max(xs) - min(xs) + 1, 'height': max(ys) - min(ys) + 1}


def main():
    atlas_path = ROOT / 'stormkite-battle-sprite.png'
    native = ROOT / 'native-64'
    if atlas_path.exists() or native.exists():
        raise RuntimeError('Refusing to overwrite an existing packing attempt')
    source = subprocess.check_output(['git', 'show', COMMIT + ':' + HELPER_PATH], cwd=REPO, text=True)
    helpers = {'__name__': 'stormkite_pinned_atlas_helpers', '__file__': str(REPO / HELPER_PATH)}
    exec(compile(source, str(REPO / HELPER_PATH), 'exec'), helpers)
    first = ROOT / 'raw-256/stormkite-ember-east-idle.png'
    # Preserve this renderer's actual profile, rather than importing the older
    # character's byte fingerprint. Every source must carry the same profile.
    profile = profiles(first)
    helpers['COLOR_PROFILE'] = profile
    raw_files = sorted((ROOT / 'raw-256').glob('*.png'))
    expected = sorted(f'stormkite-{team}-{direction}-{action}.png' for team, action in ROWS for direction in DIRECTIONS)
    if [path.name for path in raw_files] != expected:
        raise ValueError('The raw output is not the exact sixteen-frame contract')
    decoded = {}
    for path in raw_files:
        width, height, pixels = helpers['read_rgba_png'](path)
        decoded[path.name] = helpers['downsample_area4'](pixels)
    native.mkdir()
    atlas = [bytearray(256 * 4) for _ in range(256)]
    records = []
    for row_index, (team, action) in enumerate(ROWS):
        for column, direction in enumerate(DIRECTIONS):
            filename = f'stormkite-{team}-{direction}-{action}.png'
            rows = decoded[filename]
            path = native / filename
            path.write_bytes(helpers['encode_rgba_png'](64, 64, rows))
            for y, row in enumerate(rows):
                atlas[row_index * 64 + y][column * 256:(column + 1) * 256] = row
            alpha = bounds(rows, 1)
            margins = [alpha['x'], alpha['y'], 64 - alpha['x'] - alpha['width'], 64 - alpha['y'] - alpha['height']]
            if min(margins) < 4:
                raise ValueError('Sprite clips the fixed cell: ' + filename)
            records.append({'team': team, 'action': action, 'direction': direction, 'row': row_index, 'column': column,
                            'raw_path': 'raw-256/' + filename, 'raw_sha256': digest(ROOT / 'raw-256' / filename),
                            'native_path': 'native-64/' + filename, 'native_sha256': digest(path),
                            'alpha_bounds_1': alpha, 'alpha_bounds_128': bounds(rows, 128), 'clear_margins_px': margins})
    atlas_path.write_bytes(helpers['encode_rgba_png'](256, 256, [bytes(row) for row in atlas]))
    # Nearest-neighbor enlargement is a labeled review aid, never a shipping asset.
    enlarged = []
    for row in atlas:
        line = b''.join(bytes(row[x:x + 4]) * 4 for x in range(0, len(row), 4))
        enlarged.extend([line] * 4)
    (ROOT / 'review-atlas-nearest-4x.png').write_bytes(helpers['encode_rgba_png'](1024, 1024, enlarged))
    differences = []
    for team, _ in ROWS[::2]:
        for direction in DIRECTIONS:
            a = decoded[f'stormkite-{team}-{direction}-idle.png']
            b = decoded[f'stormkite-{team}-{direction}-contact.png']
            changed = sum(a[y][x:x + 4] != b[y][x:x + 4] for y in range(64) for x in range(0, 256, 4))
            differences.append({'team': team, 'direction': direction, 'idle_contact_changed_pixels': changed})
    receipt = {
        'card_id': 'stormkite', 'status': 'Rendered and packed; independent visual critique pending',
        'authorship': 'Original procedural model; no external or reference assets imported', 'license': 'AGPL-3.0-only',
        'source_commit': COMMIT, 'model_source': '../stormkite_model.py', 'model_source_sha256': digest(ROOT.parent / 'stormkite_model.py'),
        'model_path': 'stormkite.blend', 'model_sha256': digest(ROOT / 'stormkite.blend'),
        'packer_source': 'pack_atlas.py', 'packer_sha256': digest(Path(__file__)),
        'reduction_helper_source': HELPER_PATH, 'reduction_helper_sha256': hashlib.sha256(source.encode()).hexdigest(),
        'reduction': 'One 4x4 premultiplied-alpha integer area average; fixed crop and pivot',
        'color_profile_hex': {key.decode(): value.hex() for key, value in profile.items()},
        'atlas_path': atlas_path.name, 'atlas_sha256': digest(atlas_path), 'atlas_byte_length': atlas_path.stat().st_size,
        'atlas_width': 256, 'atlas_height': 256, 'cell_size': 64, 'pivot': [32, 54],
        'columns': list(DIRECTIONS), 'rows': [{'team': team, 'action': action} for team, action in ROWS],
        'frames': records, 'pose_differences': differences, 'runtime_integration': False,
        'simulation_changes': False, 'live_blender_control_used': False,
    }
    (ROOT / 'stormkite-battle-sprite-provenance.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'atlas': str(atlas_path), 'sha256': receipt['atlas_sha256'], 'bytes': receipt['atlas_byte_length'],
                      'frame_count': len(records), 'native_bounds': [{'team': r['team'], 'direction': r['direction'], 'action': r['action'], 'bounds': r['alpha_bounds_1']} for r in records],
                      'pose_differences': differences}, indent=2))


if __name__ == '__main__':
    main()
