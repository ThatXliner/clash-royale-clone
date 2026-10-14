#!/usr/bin/env python3
"""Read-only inventory for remaining-goal scope at the accepted source commit."""
from __future__ import annotations
import hashlib, json, re, subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent

def sha(path: str) -> str:
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()

def json_file(path: str):
    return json.loads((ROOT / path).read_text())

def plan_rows():
    rows = []
    for line_no, line in enumerate((ROOT / 'PLAN.md').read_text().splitlines(), 1):
        if not line.startswith('|') or line.startswith('| ---'):
            continue
        cells = [item.strip() for item in line[1:-1].split('|')]
        if len(cells) != 8 or cells[0] == 'ID':
            continue
        rows.append({
            'line': line_no, 'id': cells[0], 'piece': cells[1], 'acceptance': cells[2],
            'dependsOnRaw': cells[3], 'state': cells[4], 'passRate': cells[5],
            'rounds': cells[6], 'gap': cells[7],
        })
    return rows

ID_RE = re.compile(r'^([A-Z]+(?:-[A-Z]+)*-)(\d{3,4})([A-Z0-9]*)$')
def dependency_names(raw: str, id_set: set[str]):
    parts = [part.strip() for part in raw.split(',')]
    names, unresolved = [], []
    for part in parts:
        if not part or part in {'—', '-', 'none', 'None'}:
            continue
        range_match = re.fullmatch(r'(.+?)\s+through\s+(.+)', part)
        if range_match:
            left, right = range_match.groups()
            lm, rm = ID_RE.fullmatch(left.strip()), ID_RE.fullmatch(right.strip())
            if lm and rm and lm.group(1) == rm.group(1) and lm.group(3) == rm.group(3) == '':
                start, end = int(lm.group(2)), int(rm.group(2))
                width = len(lm.group(2))
                expanded = [f'{lm.group(1)}{number:0{width}d}' for number in range(start, end + 1)]
                names.extend(name for name in expanded if name in id_set)
                unresolved.extend(name for name in expanded if name not in id_set)
                continue
            unresolved.append(part)
            continue
        if '/' in part:
            pieces = [piece.strip() for piece in part.split('/')]
            first = ID_RE.fullmatch(pieces[0])
            if first and all(re.fullmatch(r'[A-Z0-9]+', piece) for piece in pieces[1:]):
                base = first.group(1) + first.group(2)
                full = [base + first.group(3), *[base + piece for piece in pieces[1:]]]
                names.extend(name for name in full if name in id_set)
                unresolved.extend(name for name in full if name not in id_set)
                continue
        m = ID_RE.fullmatch(part)
        if m:
            name = m.group(1) + m.group(2) + m.group(3)
            if name in id_set:
                names.append(name)
            else:
                unresolved.append(part)
            continue
        unresolved.append(part)
    return list(dict.fromkeys(names)), unresolved

rows = plan_rows()
ids = {row['id'] for row in rows}
by_id = {row['id']: row for row in rows}
for row in rows:
    deps, unresolved = dependency_names(row['dependsOnRaw'], ids)
    row['dependsOn'] = deps
    row['unresolvedDependencyText'] = unresolved
    row['dependencyStates'] = [{'id': dep, 'state': by_id[dep]['state']} for dep in deps]
    row['allListedDependenciesPass'] = (not unresolved and all(by_id[dep]['state'] == 'PASS' for dep in deps))

state_counts = Counter(row['state'] for row in rows)
incomplete = [row for row in rows if row['state'] != 'PASS']
frontier = [row for row in incomplete if row['allListedDependenciesPass']]

cards_doc = json_file('reference/stats/cards.json')
cards = cards_doc['cards']
by_key = {card['key']: card for card in cards}
unverified_counts = Counter(field for card in cards for field in card.get('unverified_fields', []))
selected_keys = ['valkyrie', 'elite-barbarians', 'goblin-cage', 'furnace', 'goblin-hut']
selected = {key: by_key[key] for key in selected_keys}
valkyrie_extract = json_file('artifacts/melee-splash-source-research/pinned-valkyrie-extract.json')
old_map = json_file('artifacts/completion-inventory/reference/card-coverage-109.json')
old16 = json_file('artifacts/completion-inventory-current-16/card-coverage-109-current-16.json')
old18 = json_file('artifacts/completion-inventory-current-18/card-coverage-109-current-18.json')

focus_ids = [
    'CARDS-019I', 'GAME-001GPR7', 'GAME-001HB', 'GAME-001H', 'GAME-001HSQ',
    'GAME-001HTEC', 'GAME-001HTAC', 'GAME-001CHS', 'GAME-001CHR', 'CARDS-020K',
    'VIS-001', 'VIS-002', 'GAME-001HUIB',
]
focus = []
for name in focus_ids:
    row = by_id.get(name)
    if row:
        focus.append({k: row[k] for k in ['line', 'id', 'state', 'dependsOnRaw', 'dependsOn',
                                           'dependencyStates', 'unresolvedDependencyText', 'allListedDependenciesPass', 'gap']})

files = [
    'PLAN.md', 'reference/stats/SOURCES.md', 'reference/stats/cards.json',
    'reference/research/melee-splash-source-audit.md', 'reference/research/spawner-composition-source-audit.md',
    'reference/footage/NEEDED.md', 'artifacts/next-roster-batch-scope/builder/scope.md',
    'artifacts/cards020k-signature-scope/builder/scope.md',
    'artifacts/cards020k-stat-semantics-scope/builder/scope.md',
    'artifacts/melee-splash-source-research/pinned-valkyrie-extract.json',
    'artifacts/completion-inventory/reference/card-coverage-109.json',
    'artifacts/completion-inventory-current-16/card-coverage-109-current-16.json',
    'artifacts/completion-inventory-current-18/card-coverage-109-current-18.json',
    'src/sim/battle-continuation-kernel.js', 'src/sim/ordinary-projectile-splash.js',
    'src/content/session-card-catalog.js', 'src/content/session-troop-profile-catalog.js',
    'src/content/session-troop-roster.js', 'src/content/editable-deck.js', 'src/rl/environment.js',
]
source_hashes = {path: sha(path) for path in files}

summary = {
    'anchor': {
        'acceptedHead': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'workingTreeAtInventoryStart': 'clean detached checkout',
        'planSha256': sha('PLAN.md'),
        'statsCardsSha256': sha('reference/stats/cards.json'),
        'sourceLedgerSha256': sha('reference/stats/SOURCES.md'),
    },
    'plan': {
        'rowCount': len(rows), 'stateCounts': dict(sorted(state_counts.items())),
        'incompleteCount': len(incomplete), 'incompleteRows': incomplete,
        'incompleteWithAllListedDepsPassCount': len(frontier),
        'incompleteWithAllListedDepsPassIds': [row['id'] for row in frontier],
        'focusDependencyFrontier': focus,
    },
    'historicalTarget': {
        'identityCount': len(cards),
        'countByType': dict(sorted(Counter(card['type'] for card in cards).items())),
        'unverifiedFieldOccurrences': dict(sorted(unverified_counts.items())),
        'candidateNormalizedRows': selected,
        'valkyriePinnedSelectedRawExtract': valkyrie_extract,
        'valkyrieSelectedRawFieldCount': len(valkyrie_extract['character_row']),
        'valkyrieExtractGeneratorFieldListIsSelective': True,
    },
    'currentAndStaleInventories': {
        'checkedOutRuntimeCountsMustBeCapturedSeparately': True,
        'olderGeneratedInventory': {
            'path': 'artifacts/completion-inventory/reference/card-coverage-109.json',
            'sha256': sha('artifacts/completion-inventory/reference/card-coverage-109.json'),
            'admittedIds': old_map['admittedCatalog']['counts']['admittedIds'],
            'admittedOccurrences': old_map['admittedCatalog']['counts']['admittedOccurrences'],
            'editableCount': old_map['editablePool']['count'],
        },
        'snapshot16': {
            'path': 'artifacts/completion-inventory-current-16/card-coverage-109-current-16.json',
            'sha256': sha('artifacts/completion-inventory-current-16/card-coverage-109-current-16.json'),
            'sourceCommit': old16['pinnedInputs']['sourceCommit'],
            'counts': old16['counts'],
        },
        'snapshot18': {
            'path': 'artifacts/completion-inventory-current-18/card-coverage-109-current-18.json',
            'sha256': sha('artifacts/completion-inventory-current-18/card-coverage-109-current-18.json'),
            'sourceCommit': old18['pinnedInputs']['sourceCommit'],
            'counts': old18['counts'],
        },
    },
    'sourceHashes': source_hashes,
}
(OUT / 'plan-dependency-enumeration.json').write_text(json.dumps(summary, indent=2, sort_keys=True) + '\n')

run_lines = [
    f"head={summary['anchor']['acceptedHead']}",
    f"plan_sha256={summary['anchor']['planSha256']}",
    f"cards_json_sha256={summary['anchor']['statsCardsSha256']}",
    f"sources_md_sha256={summary['anchor']['sourceLedgerSha256']}",
    f"plan_rows={len(rows)} state_counts={dict(sorted(state_counts.items()))}",
    f"incomplete_count={len(incomplete)} incomplete_ids={','.join(row['id'] for row in incomplete)}",
    f"incomplete_with_all_listed_deps_pass={len(frontier)} ids={','.join(row['id'] for row in frontier)}",
    f"target_cards={len(cards)} types={dict(sorted(Counter(card['type'] for card in cards).items()))}",
    f"older_map_count={old_map['editablePool']['count']} editable/{old_map['admittedCatalog']['counts']['admittedIds']} admitted; historical only",
    f"valkyrie_selected_raw_fields={len(valkyrie_extract['character_row'])}; generator is selective",
]
(OUT / 'enumeration-run.txt').write_text('\n'.join(run_lines) + '\n')
