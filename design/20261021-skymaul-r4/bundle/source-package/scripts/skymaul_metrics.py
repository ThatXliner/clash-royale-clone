"""Measure the pinned native pixel gates; report failures without a visual verdict."""
import argparse
from collections import Counter, deque
import hashlib
import json
from pathlib import Path
import statistics

from PIL import Image, ImageDraw, ImageFont

DIRECTIONS = ('north', 'east', 'south', 'west')
POSES = ('idle', 'walk', 'contact')
TEAMS = ('river', 'ember')


def write(path, data):
    path.write_text(json.dumps(data, sort_keys=True, indent=2, allow_nan=False) + '\n')


def load(path):
    image = Image.open(path).convert('RGBA')
    assert image.size == (64, 64), path
    return list(image.getdata())


def points(values, threshold=128):
    return {(i % 64, i // 64) for i, value in enumerate(values) if value >= threshold}


def support(coords):
    if not coords:
        return {'count': 0, 'bounds': None, 'centroid': None, 'largest_component': 0}
    xs, ys = zip(*coords)
    todo, sizes = set(coords), []
    while todo:
        first = todo.pop()
        work, size = [first], 1
        while work:
            x, y = work.pop()
            for next_xy in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
                if next_xy in todo:
                    todo.remove(next_xy)
                    work.append(next_xy)
                    size += 1
        sizes.append(size)
    return {'count': len(coords), 'bounds': {'left': min(xs), 'top': min(ys), 'width': max(xs)-min(xs)+1,
            'height': max(ys)-min(ys)+1}, 'centroid': [sum(xs)/len(xs), sum(ys)/len(ys)],
            'largest_component': max(sizes), 'components': sorted(sizes, reverse=True)}


def percentiles(values):
    if not values:
        return {'count': 0, 'p10': None, 'median': None, 'p90': None}
    ordered = sorted(values)
    def q(fraction):
        loc = (len(ordered)-1) * fraction
        low = int(loc)
        return ordered[low] + (ordered[min(low+1, len(ordered)-1)] - ordered[low]) * (loc-low)
    return {'count': len(values), 'p10': q(.1), 'median': statistics.median(values), 'p90': q(.9)}


def cheb(a, b):
    return max(abs(a[0]-b[0]), abs(a[1]-b[1]))


def gap(a, b, alpha):
    if not a or not b:
        return {'separation_chebyshev': None, 'background_witness': None, 'support_missing': True, 'met': False}
    distance = min(cheb(p, q) for p in a for q in b)
    nearest = [(p, q) for p in sorted(a) for q in sorted(b) if cheb(p, q) == distance]
    witness = None
    if distance >= 2:
        for p, q in nearest:
            for y in range(max(0, min(p[1], q[1])-distance), min(64, max(p[1], q[1])+distance+1)):
                for x in range(max(0, min(p[0], q[0])-distance), min(64, max(p[0], q[0])+distance+1)):
                    pixel = (x, y)
                    if cheb(p, pixel) > 0 and cheb(pixel, q) > 0 and cheb(p, pixel)+cheb(pixel, q) == distance and alpha[y*64+x] < 16:
                        witness = {'group_a': p, 'empty': pixel, 'group_b': q, 'actual_alpha': alpha[y*64+x]}
                        break
                if witness:
                    break
            if witness:
                break
    return {'separation_chebyshev': distance, 'nearest_boundary_pairs': nearest,
            'background_witness': witness, 'visible_overlap_pixels': len(a & b),
            'support_missing': False, 'met': distance >= 2 and witness is not None}


def rgba_mask(coords, color):
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    for xy in coords:
        im.putpixel(xy, (*color, 255))
    return im


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--attempt', required=True, type=Path)
    args = parser.parse_args()
    attempt = args.attempt.resolve()
    output = attempt / 'measurements'
    output.mkdir(exist_ok=False)
    renders = attempt / 'renders'
    receipt = json.loads((renders / 'render-receipt.json').read_text())
    records = {(r['team'], r['direction'], r['pose'], r['kind']): r for r in receipt['images']}
    semantic = {(r['team'], r['direction'], r['pose'], r['group']): r for r in receipt['semantic_masks']}
    for record in receipt['images']:
        for kind in ('raw', 'native'):
            expected = record[kind]
            actual = Path(expected['path'])
            assert hashlib.sha256(actual.read_bytes()).hexdigest() == expected['sha256'], actual
    for expected in receipt['semantic_masks']:
        assert hashlib.sha256(Path(expected['path']).read_bytes()).hexdigest() == expected['sha256'], expected['path']
    cells, gates, gaps = {}, [], []
    def gate(label, key, actual, met, threshold, diagnostic=False):
        gates.append({'gate': label, 'team': key[0], 'direction': key[1], 'pose': key[2],
                      'actual': actual, 'threshold': threshold, 'met': bool(met), 'diagnostic_only': diagnostic})
    for team in receipt['teams']:
        for direction in DIRECTIONS:
            for pose in POSES:
                key = (team, direction, pose)
                def pixels(kind):
                    return load(records[(*key, kind)]['native']['path'])
                def alpha(kind):
                    return [p[3] for p in pixels(kind)]
                color = pixels('color')
                body_alpha = alpha('body-only')
                all_alpha = alpha('color')
                body = support(points(body_alpha, 16))
                masks = {group: [p[3] for p in load(semantic[(*key, group)]['path'])] for group in receipt['semantic_groups']}
                supported = {group: points(mask) for group, mask in masks.items()}
                group_stats = {group: support(coords) for group, coords in supported.items()}
                for group in ('head', 'chest', 'left_fist', 'right_fist', 'lower', 'core', 'hammer_head', 'ring'):
                    kind = 'isolated-' + group.replace('_', '-')
                    isolated = points(alpha(kind))
                    group_stats[group]['isolated_supported_count'] = len(isolated)
                    group_stats[group]['isolated_support'] = support(isolated)
                    group_stats[group]['occluded_at_128_count'] = len(isolated - supported[group])
                    group_stats[group]['visible_only_at_128_count'] = len(supported[group] - isolated)
                luminance = [(.2126*r + .7152*g + .0722*b)/255 for r, g, b, a in color]
                values = {}
                for group in ('stone', 'copper', 'core', 'top_facets'):
                    sampled = [luminance[i] for i, coverage in enumerate(masks[group]) if coverage >= 128 and color[i][3] >= 128]
                    values[group] = percentiles(sampled)
                gate('stone-value', key, values['stone'], values['stone']['count'] and .25 <= values['stone']['median'] <= .40, 'median .25–.40')
                gate('copper-value', key, values['copper'], values['copper']['count'] and .55 <= values['copper']['median'] <= .65, 'median .55–.65')
                if direction != 'north':
                    bright = {(i % 64, i // 64) for i, coverage in enumerate(masks['core']) if coverage >= 128 and color[i][3] >= 128 and luminance[i] >= .85}
                    patches = [(x,y) for x,y in sorted(bright) if {(x,y),(x+1,y),(x,y+1),(x+1,y+1)} <= bright]
                    others = [values[group]['median'] for group in ('stone','copper','top_facets') if values[group]['count']]
                    gate('core-value', key, values['core'], values['core']['count'] and values['core']['median'] >= .85, 'median >= .85')
                    gate('core-brightest-region', key, {'core': values['core']['median'], 'other_region_medians': others},
                         values['core']['count'] and all(values['core']['median'] > value for value in others), 'core median above base stone, copper, top facets')
                    gate('core-bright-2x2', key, {'patch_origins': patches, 'bright_pixel_count': len(bright)}, bool(patches), 'adjacent 2×2 core coverage >=128 and Y >= .85')
                if pose in ('idle', 'walk'):
                    h, b = alpha('isolated-hammer-head'), alpha('other-actor')
                    isolated_head = {(i % 64, i // 64) for i in range(4096) if h[i] >= 128 and b[i] < 16}
                    hs = support(isolated_head)
                    box = hs['bounds']
                    gate('hammer-isolated-block', key, hs, hs['count'] >= 6 and hs['largest_component'] >= 4 and box and box['width'] >= 2 and box['height'] >= 2,
                         '>=6 outside pixels; largest 4-connected component >=4; box >=2×2')
                if direction in ('north', 'south'):
                    for group in ('left_fist', 'right_fist'):
                        stat = group_stats[group]
                        box = stat['bounds']
                        gate(group + '-support', key, stat, box and box['width'] >= 3 and box['height'] >= 3 and stat['largest_component'] >= 6,
                             'visible box >=3×3; largest 4-connected component >=6')
                    gate('front-back-width', key, body['bounds']['width'], body['bounds']['width'] <= 16, '<=16px')
                if pose != 'contact':
                    limit = 14 if pose == 'idle' else 15
                    gate('actor-height', key, body['bounds']['height'], body['bounds']['height'] <= limit, '<=' + str(limit) + 'px')
                    pairs = [('head', 'chest')]
                    fists = ('left_fist','right_fist') if direction in ('north','south') else (('left_fist',) if direction == 'east' else ('right_fist',))
                    pairs.extend((fist, 'chest') for fist in fists)
                    for a,b in pairs:
                        result = gap(supported[a], supported[b], body_alpha)
                        iso_a = points(alpha('isolated-' + a.replace('_','-')))
                        iso_b = points(alpha('isolated-' + b.replace('_','-')))
                        result['isolated_projection_overlap_at_128'] = len(iso_a & iso_b)
                        witness_im = rgba_mask(points(body_alpha,16), (180,180,180))
                        witness_im.alpha_composite(rgba_mask(supported[a], (255,70,40)))
                        witness_im.alpha_composite(rgba_mask(supported[b], (35,150,255)))
                        if result['background_witness']:
                            witness_im.putpixel(tuple(result['background_witness']['empty']), (0,255,0,255))
                        path = output / f'{team}-{direction}-{pose}-gap-{a}-{b}-1x.png'
                        witness_im.save(path)
                        result['native_labeled_mask'] = str(path)
                        result['mask_legend'] = {'a': 'red', 'b':'blue', 'witness':'green overlay on empty pixel', 'other_actor':'gray'}
                        gate('gap-' + a + '-' + b, key, result, result['met'], 'Chebyshev separation >=2 with actual alpha<16 on a shortest path', direction == 'north')
                ring_gap = gap(supported['lower'], supported['ring'], all_alpha)
                ring_gap['isolated_projection_overlap_at_128'] = len(points(alpha('isolated-lower')) & points(alpha('isolated-ring')))
                gate('lower-ring-gap', key, ring_gap, ring_gap['met'], '>=1 actually empty pixel on a shortest path')
                margin = records[(*key, 'color')]['native']['alpha_clear_margins_px']
                gate('native-crop', key, margin, min(margin) >= 4, 'minimum4px')
                cells[key] = {'body': body, 'groups': group_stats, 'values': values, 'body_support': points(body_alpha,16)}
    for team in receipt['teams']:
        for direction in DIRECTIONS:
            idle = cells[(team,direction,'idle')]
            contact = cells[(team,direction,'contact')]
            h = contact['groups']['hammer_head']
            head = contact['groups']['head_stone']
            key = (team,direction,'contact')
            height = contact['body']['bounds']['height']
            gate('contact-height', key, {'contact': height, 'idle': idle['body']['bounds']['height']}, height <= 16 and height <= idle['body']['bounds']['height']+2,
                 '<=16px and <=same-heading idle+2px')
            above = head['bounds']['top']-h['bounds']['top'] if h['bounds'] and head['bounds'] else None
            if direction in ('north','south'):
                center = abs(h['centroid'][0]-head['centroid'][0]) if h['centroid'] and head['centroid'] else None
                gate('contact-centered-overhead', key, {'horizontal_centroid_distance': center, 'head_top_clearance': above}, center is not None and center <= 1 and above >= 1,
                     'centroid within1px horizontally; hammer top >=1px above head stone')
            else:
                carry = idle['groups']['hammer_head']
                forward = (h['centroid'][0]-carry['centroid'][0]) * (1 if direction == 'east' else -1) if h['centroid'] and carry['centroid'] else None
                gate('contact-forward-overhead', key, {'forward_centroid_move_px': forward, 'head_top_clearance': above}, forward is not None and forward >= 1 and above >= 1,
                     '>=1px forward of idle carry and hammer top >=1px above head stone')
            for pose in ('walk','contact'):
                other = cells[(team,direction,pose)]['body_support']
                original = idle['body_support']
                gate('pose-alpha-XOR', (team,direction,pose), len(original ^ other)/len(original | other), True, 'diagnostic only; visible recognition reserved for critic', True)
        for pose in POSES:
            ns = [cells[(team,d,pose)]['body']['bounds']['width'] for d in ('north','south')]
            for d in ('east','west'):
                width = cells[(team,d,pose)]['body']['bounds']['width']
                gate('lateral-width', (team,d,pose), {'lateral': width, 'north_south': ns}, width < min(ns), 'less than both N/S widths')
    if set(receipt['teams']) == set(TEAMS):
        for direction in DIRECTIONS:
            for pose in POSES:
                river = load(records[('river',direction,pose,'color')]['native']['path'])
                ember = load(records[('ember',direction,pose,'color')]['native']['path'])
                gray = lambda p: round(.2126*p[0]+.7152*p[1]+.0722*p[2])
                different = sum((gray(a),a[3]) != (gray(b),b[3]) for a,b in zip(river,ember))
                gate('team-grayscale-difference', ('both',direction,pose), different, different > 0, 'nonidentical; actual identification reserved for critic')
    for mode in ('color', 'grayscale', 'body-only', 'team-mask'):
        sheet = Image.new('RGBA', (256, 64*3*len(receipt['teams'])), (232,226,212,255))
        for row,(team,pose) in enumerate((team,pose) for team in receipt['teams'] for pose in POSES):
            for col,d in enumerate(DIRECTIONS):
                path = semantic[(team,d,pose,'team')]['path'] if mode == 'team-mask' else records[(team,d,pose,'body-only' if mode == 'body-only' else 'color')]['native']['path']
                image = Image.open(path).convert('RGBA')
                if mode == 'grayscale':
                    image = Image.merge('RGBA', (*([image.convert('L')]*3), image.getchannel('A')))
                sheet.alpha_composite(image,(64*col,64*row))
        sheet.save(output / ('native-' + mode + '.png'))
        sheet.resize((sheet.width*4,sheet.height*4),Image.Resampling.NEAREST).save(output / ('native-' + mode + '-4x.png'))
    clean_cells = [{'team': key[0], 'direction': key[1], 'pose': key[2], **{k:v for k,v in value.items() if k != 'body_support'}} for key,value in cells.items()]
    failures = [gate for gate in gates if not gate['met'] and not gate['diagnostic_only']]
    crop = json.loads((attempt / 'model/every-frame-crop.json').read_text())
    preservation = []
    for path in sorted(attempt.glob('*/preservation/*-proof.json')):
        proof = json.loads(path.read_text())
        preservation.append({'path':str(path), 'label': proof['label'], 'numeric_exact_equal': proof['numeric_exact_equal'],
             'byte_identical':proof['byte_identical'], 'numeric_difference_count':proof['numeric_difference_count'],
             'equal_numeric_token_difference_count':proof['equal_numeric_token_difference_count']})
    report = {'status':'measured evidence only; independent critic required', 'native_cell':64,
        'thresholds_from':'pinned BAR.md and RECONCILED-PROPOSAL.md; no threshold edits',
        'group_support_threshold':128, 'actor_envelope_alpha_threshold':16,
        'gap_actual_background_alpha_threshold':16, 'heading_order':DIRECTIONS,
        'sheet_rows':[f'{team} {pose}' for team in receipt['teams'] for pose in POSES],
        'gates':gates,'failures':failures,'failure_count':len(failures),
        'failure_counts_by_gate':dict(Counter(gate['gate'] for gate in failures)),
        'cells':clean_cells,'preservation':preservation,
        'every_frame_crop':{'rows':len(crop['records']),'failures':len(crop['failures']),'minimum_px':crop['min_margin_px']},
        'render_hashes_verified':True, 'render_count':len(receipt['images']), 'semantic_mask_count':len(receipt['semantic_masks']),
        'visual_identity_and_pose_team_verdict':'not issued; independent critic only', 'runtime_acceptance':False}
    write(output/'metrics.json',report)
    print(json.dumps({'failure_count':len(failures),'failure_counts_by_gate':report['failure_counts_by_gate'],
          'preservation':preservation, 'every_frame_crop':report['every_frame_crop']},indent=2))


if __name__ == '__main__':
    main()
