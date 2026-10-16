import subprocess
from pathlib import Path

repo = '/Users/me/.codex/worktrees/9456/clash-royale-clone'
base = Path('/private/tmp/game001mtc-critic-sources.0m4ONi')
revisions = {
    'historical': '6a2f26dc89f1fab9978d1a6e00cfb7c2f19016a2',
    'parent': '69daeff24563aff5df5379f36ef9c27f5582307c',
    'candidate': '75acd1ee37d1cf52124d346bfd9eed2ac79ac2e0',
}
failed = False
for label, revision in revisions.items():
    tracked = subprocess.check_output(
        ['git', '-C', repo, 'ls-tree', '-r', '--name-only', revision], text=True,
    ).splitlines()
    expected = {path for path in tracked if not path.startswith('artifacts/')}
    root = base / label
    actual = {
        path.relative_to(root).as_posix()
        for path in root.rglob('*')
        if path.is_file() or path.is_symlink()
    }
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    tree = subprocess.check_output(
        ['git', '-C', repo, 'rev-parse', f'{revision}^{{tree}}'], text=True,
    ).strip()
    print(f'{label} commit={revision} tree={tree} git_paths={len(tracked)} expected_after_only_artifacts_exclusion={len(expected)} extracted={len(actual)} missing={len(missing)} extra={len(extra)}')
    if missing:
        failed = True
        print('missing:', missing)
    if extra:
        failed = True
        print('extra:', extra)
if failed:
    raise SystemExit(1)
print('PASS: every tracked non-artifact path is present; no other path was filtered.')
