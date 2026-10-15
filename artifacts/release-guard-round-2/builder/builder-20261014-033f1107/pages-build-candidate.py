from datetime import datetime, timezone
from pathlib import Path
import json, os, subprocess, sys, time
repo = Path('/private/tmp/release-guard-round2-builder-033f1107')
ev = Path('/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/release-guard-round-2/builder/builder-20261014-033f1107')
out = Path('/private/tmp/release-guard-round2-pages-46c542a')
argv = ['node', 'scripts/build-pages.js', '--out', str(out), '--repository', 'ThatXliner/clash-royale-clone', '--ref', '46c542a10df358902fa1147e6d2b7ad04ea80d57']
env = os.environ.copy()
env['GAME_BROWSER_CHROME'] = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
log = ev / 'pages-build-candidate.log'
started = datetime.now(timezone.utc).isoformat()
with log.open('w') as stream:
    proc = subprocess.Popen(argv, cwd=repo, env=env, stdout=stream, stderr=subprocess.STDOUT, text=True)
    (ev / 'pages-build-candidate.pid').write_text(f'{proc.pid}\n')
    (ev / 'pages-build-candidate.command.json').write_text(json.dumps({
        'argv': argv, 'cwd': str(repo), 'output': str(out), 'browser': env['GAME_BROWSER_CHROME'],
        'pid': proc.pid, 'startedAtUtc': started
    }, indent=2) + '\n')
    print(f'PAGES_BUILD_PID={proc.pid}', flush=True)
    code = proc.wait()
finished = datetime.now(timezone.utc).isoformat()
(ev / 'pages-build-candidate.exit').write_text(f'{code}\n')
(ev / 'pages-build-candidate.finished.json').write_text(json.dumps({
    'pid': proc.pid, 'actualExitCode': code, 'startedAtUtc': started, 'finishedAtUtc': finished,
    'stdout': str(log), 'output': str(out)
}, indent=2) + '\n')
print(f'PAGES_BUILD_ACTUAL_EXIT={code}', flush=True)
print(log.read_text(errors='replace'), end='', flush=True)
sys.exit(code)
