from datetime import datetime, timezone
from pathlib import Path
import json, os, subprocess, sys
repo = Path('/private/tmp/release-guard-round2-builder-033f1107')
ev = Path('/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/release-guard-round-2/builder/builder-20261014-033f1107')
script = ev / 'pages-native-audit-v3.mjs'
env = os.environ.copy()
env['RELEASE_ARCHIVE_ROOT'] = str(repo)
env['PAGES_ARTIFACT_ROOT'] = '/private/tmp/release-guard-round2-pages-46c542a'
env['BUILDER_EVIDENCE_ROOT'] = str(ev)
env['GAME_BROWSER_CHROME'] = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
argv = ['node', str(script)]
log = ev / 'pages-native-audit-v3.log'
started = datetime.now(timezone.utc).isoformat()
with log.open('w') as stream:
    proc = subprocess.Popen(argv, cwd=repo, env=env, stdout=stream, stderr=subprocess.STDOUT, text=True)
    (ev / 'pages-native-audit-v3.pid').write_text(f'{proc.pid}\n')
    (ev / 'pages-native-audit-v3.command.json').write_text(json.dumps({
        'argv': argv, 'cwd': str(repo), 'pid': proc.pid,
        'sourceHead': '46c542a10df358902fa1147e6d2b7ad04ea80d57',
        'artifact': env['PAGES_ARTIFACT_ROOT'], 'browser': env['GAME_BROWSER_CHROME'],
        'startedAtUtc': started,
    }, indent=2) + '\n')
    print(f'PAGES_NATIVE_AUDIT_V3_PID={proc.pid}', flush=True)
    task_exit_code = proc.wait()
finished = datetime.now(timezone.utc).isoformat()
(ev / 'pages-native-audit-v3.exit').write_text(f'{task_exit_code}\n')
(ev / 'pages-native-audit-v3.finished.json').write_text(json.dumps({
    'pid': proc.pid, 'actualExitCode': task_exit_code, 'startedAtUtc': started,
    'finishedAtUtc': finished, 'stdout': str(log),
    'receipt': str(ev / 'pages-native-audit-v3.receipt.json'),
}, indent=2) + '\n')
print(f'PAGES_NATIVE_AUDIT_V3_ACTUAL_EXIT={task_exit_code}', flush=True)
print(log.read_text(errors='replace'), end='', flush=True)
sys.exit(task_exit_code)
