import hashlib
import json
import os
import pathlib
import stat
import subprocess
import sys

REPO = pathlib.Path('/Users/me/.codex/worktrees/9456/clash-royale-clone')
COMMIT = '5ba4002e9f71830da447be1e985505c608d9c06f'
ARCHIVE = pathlib.Path(sys.argv[1])
OUT = REPO / 'artifacts/game001gpr5-round-3/critic'

listing = subprocess.check_output(
    ['git', 'ls-tree', '-r', '--full-tree', '--format=%(objectname) %(objectmode) %(path)', COMMIT],
    cwd=REPO, text=True,
)
source_paths = {
    'tests/helpers/endurance-workload.js',
    'tests/endurance-workload.test.js',
    'tests/game-browser-endurance.test.js',
    'artifacts/game001gpr5-round-3/builder/offline-preflight.mjs',
}
records = []
mismatches = []
for line in listing.splitlines():
    blob, mode, path = line.split(' ', 2)
    if mode == '160000':
        mismatches.append({'path': path, 'reason': 'gitlink excluded from archive'})
        continue
    full_path = ARCHIVE / path
    try:
        data = os.readlink(full_path).encode() if stat.S_ISLNK(full_path.lstat().st_mode) else full_path.read_bytes()
    except Exception as exc:
        mismatches.append({'path': path, 'reason': f'missing/read error: {exc}'})
        continue
    actual = hashlib.sha1(b'blob ' + str(len(data)).encode() + bytes([0]) + data).hexdigest()
    if actual != blob:
        mismatches.append({'path': path, 'expected': blob, 'actual': actual})
    if path.startswith('src/') or path in source_paths:
        records.append({
            'gitBlob': blob,
            'sha256': hashlib.sha256(data).hexdigest(),
            'path': path,
        })

changed = subprocess.check_output(
    ['git', 'diff-tree', '--no-commit-id', '--name-status', '-r', COMMIT],
    cwd=REPO, text=True,
).splitlines()
receipt = ARCHIVE / 'artifacts/game001gpr5-aggregate-defense/aggregate-defense-result.json'
summary = {
    'archive': str(ARCHIVE),
    'commit': COMMIT,
    'tree': subprocess.check_output(['git', 'rev-parse', f'{COMMIT}^{{tree}}'], cwd=REPO, text=True).strip(),
    'trackedFileCount': len(listing.splitlines()),
    'verifiedBlobCount': len(listing.splitlines()) - len(mismatches),
    'mismatchCount': len(mismatches),
    'mismatches': mismatches,
    'srcAndCandidatePathCount': len(records),
    'candidateCommitScope': changed,
    'aggregateReceiptSha256': hashlib.sha256(receipt.read_bytes()).hexdigest(),
}
(OUT / 'exact-candidate-blob-verification.json').write_text(json.dumps(summary, indent=2) + '\n')
(OUT / 'exact-candidate-source-runtime-blobs.tsv').write_text(
    ''.join(f"{row['gitBlob']}\t{row['sha256']}\t{row['path']}\n" for row in records)
)
print(json.dumps(summary, indent=2))
