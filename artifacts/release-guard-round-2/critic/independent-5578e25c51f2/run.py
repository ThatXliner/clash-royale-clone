#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys
import time

p = argparse.ArgumentParser()
p.add_argument('--name', required=True)
p.add_argument('--cwd', required=True)
p.add_argument('--env', action='append', default=[])
p.add_argument('command', nargs=argparse.REMAINDER)
a = p.parse_args()
cmd = list(a.command)
if cmd and cmd[0] == '--':
    cmd = cmd[1:]
if not cmd:
    raise SystemExit('missing command')
root = Path('/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/release-guard-round-2/critic/independent-5578e25c51f2')
run_dir = root / 'runs' / a.name
run_dir.mkdir(parents=True, exist_ok=False)
env = os.environ.copy()
for entry in a.env:
    key, sep, value = entry.partition('=')
    if not sep:
        raise SystemExit(f'invalid --env {entry!r}')
    env[key] = value
start = dt.datetime.now(dt.timezone.utc).isoformat()
meta = {
    'name': a.name,
    'argv': cmd,
    'cwd': str(Path(a.cwd).resolve()),
    'started_utc': start,
    'pid': None,
    'returncode': None,
    'elapsed_seconds': None,
    'environment': {k: env.get(k) for k in ['GAME_BROWSER_PLAYWRIGHT', 'GAME_BROWSER_CHROME', 'SHIPPING_ISOLATION_RELEASE_EVIDENCE', 'GITHUB_REPOSITORY', 'GITHUB_REF_NAME', 'NODE_OPTIONS', 'CI'] if k in env},
}
(run_dir / 'command.json').write_text(json.dumps(meta, indent=2) + '\n')
started = time.monotonic()
with (run_dir / 'stdout.raw').open('wb') as out, (run_dir / 'stderr.raw').open('wb') as err:
    proc = subprocess.Popen(cmd, cwd=a.cwd, env=env, stdin=subprocess.DEVNULL, stdout=out, stderr=err, start_new_session=True)
    meta['pid'] = proc.pid
    (run_dir / 'live.json').write_text(json.dumps(meta, indent=2) + '\n')
    print(f"launched name={a.name} pid={proc.pid} cwd={meta['cwd']}", flush=True)
    returncode = proc.wait()
meta['returncode'] = returncode
meta['elapsed_seconds'] = round(time.monotonic() - started, 3)
meta['finished_utc'] = dt.datetime.now(dt.timezone.utc).isoformat()
(run_dir / 'exit.json').write_text(json.dumps(meta, indent=2) + '\n')
(run_dir / 'task_exit_code').write_text(f'{returncode}\n')
print(f"finished name={a.name} pid={proc.pid} returncode={returncode} elapsed={meta['elapsed_seconds']}", flush=True)
raise SystemExit(returncode)
