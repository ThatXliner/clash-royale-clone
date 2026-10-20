from pathlib import Path
from PIL import Image, ImageDraw
import json

root = Path('/Users/me/.codex/clash-qualification/20261020-model-r2-critic/run-20261020T155005Z')
raw_dir = root / 'raw-256'
native_dir = root / 'native-64'
tile_dir = root / 'tile-context'
native_dir.mkdir(parents=True, exist_ok=True)
tile_dir.mkdir(parents=True, exist_ok=True)


def alpha_box_4x(src):
    src = src.convert('RGBA')
    inp = src.load()
    out = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    dst = out.load()
    for y in range(64):
        for x in range(64):
            sum_alpha = 0
            sum_r = sum_g = sum_b = 0
            for dy in range(4):
                for dx in range(4):
                    r, g, b, a = inp[x * 4 + dx, y * 4 + dy]
                    sum_alpha += a
                    sum_r += r * a
                    sum_g += g * a
                    sum_b += b * a
            alpha = round(sum_alpha / 16)
            if sum_alpha:
                dst[x, y] = (round(sum_r / sum_alpha), round(sum_g / sum_alpha), round(sum_b / sum_alpha), alpha)
            else:
                dst[x, y] = (0, 0, 0, 0)
    return out


def alpha_bounds(img, threshold):
    a = img.getchannel('A')
    mask = a.point(lambda value: 255 if value >= threshold else 0)
    return mask.getbbox()


def bounds_json(box):
    if box is None:
        return None
    left, top, right, bottom = box
    return {'left': left, 'top': top, 'width': right - left, 'height': bottom - top}

arena = Image.open('/Users/me/.codex/worktrees/9456/clash-royale-clone/public/assets/moss-ember-arena-painted.webp').convert('RGBA')
# A 145 px patch downscaled to the 64 px native cell at the arena's 414 px display width.
context = arena.crop((396, 900, 541, 1045)).resize((64, 64), Image.Resampling.LANCZOS)
context.save(tile_dir / 'arena-ground-tile-64.png')

directions = ('north', 'east', 'south', 'west')
teams = ('river', 'ember')
poses = ('idle', 'contact')
records = []
images = {}
for team in teams:
    for pose in poses:
        for direction in directions:
            stem = f'copperskiff-{team}-{direction}-{pose}'
            raw = Image.open(raw_dir / f'{stem}-256.png')
            native = alpha_box_4x(raw)
            path = native_dir / f'{stem}-64.png'
            native.save(path)
            images[(team, direction, pose)] = native
            contexted = Image.alpha_composite(context, native)
            contexted.save(tile_dir / f'{stem}-on-arena-tile-64.png')
            records.append({
                'team': team,
                'direction': direction,
                'pose': pose,
                'native_path': str(path),
                'tile_context_path': str(tile_dir / f'{stem}-on-arena-tile-64.png'),
                'alpha_bounds_threshold_16': bounds_json(alpha_bounds(native, 16)),
                'alpha_bounds_threshold_128': bounds_json(alpha_bounds(native, 128)),
                'visible_pixels': sum(1 for px in native.getchannel('A').getdata() if px >= 16),
            })

neutral = Image.new('RGBA', (64, 64), (207, 204, 194, 255))
# Native alpha view and actual arena-tile composition use the same N/E/S/W columns.
alpha_sheet = Image.new('RGBA', (4 * 64, 4 * 64), (92, 95, 98, 255))
tile_sheet = Image.new('RGBA', (4 * 64, 4 * 64), (0, 0, 0, 255))
for row, (team, pose) in enumerate((('river', 'idle'), ('ember', 'idle'), ('river', 'contact'), ('ember', 'contact'))):
    for col, direction in enumerate(directions):
        native = images[(team, direction, pose)]
        alpha_sheet.alpha_composite(native, (col * 64, row * 64))
        tile = Image.alpha_composite(context, native)
        tile_sheet.alpha_composite(tile, (col * 64, row * 64))
alpha_sheet.save(root / 'native-64-sheet.png')
tile_sheet.save(root / 'tile-context-sheet.png')
tile_sheet.resize((1024, 1024), Image.Resampling.NEAREST).save(root / 'tile-context-sheet-4x.png')
alpha_sheet.resize((1024, 1024), Image.Resampling.NEAREST).save(root / 'native-64-sheet-4x.png')

silhouette_sheet = Image.new('RGBA', (4 * 64, 64), (207, 204, 194, 255))
for col, direction in enumerate(directions):
    native = images[('river', direction, 'idle')]
    sil = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    sil.putalpha(native.getchannel('A'))
    silhouette_sheet.alpha_composite(Image.alpha_composite(context, sil), (col * 64, 0))
silhouette_sheet.resize((1024, 256), Image.Resampling.NEAREST).save(root / 'silhouette-on-arena-4x.png')

comparisons = []
for direction in directions:
    for team in teams:
        idle = images[(team, direction, 'idle')]
        contact = images[(team, direction, 'contact')]
        idp = list(idle.getdata())
        ctp = list(contact.getdata())
        visible_changed = sum(1 for a, b in zip(idp, ctp) if a != b and max(a[3], b[3]) >= 16)
        comparisons.append({'team': team, 'direction': direction, 'changed_visible_pixels_contact_vs_idle': visible_changed})

report = {
    'context_source': '/Users/me/.codex/worktrees/9456/clash-royale-clone/public/assets/moss-ember-arena-painted.webp',
    'context_crop_source_pixels': [396, 900, 541, 1045],
    'context_downscale': '145x145 source crop to 64x64 using Lanczos',
    'native_reduction': 'alpha-weighted 4x4 box from 256 to 64, no crop or per-view rescale',
    'row_order': ['river idle', 'ember idle', 'river contact', 'ember contact'],
    'column_order': list(directions),
    'render_bounds': records,
    'contact_pixel_differences': comparisons,
}
(root / 'native-bounds-and-context.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'native_views': len(records), 'tile': [64, 64], 'bounds': records, 'contact_pixel_differences': comparisons}, indent=2))
