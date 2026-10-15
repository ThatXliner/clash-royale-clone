#!/usr/bin/env python3
import json
import os
import shlex
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path('/private/tmp/art023b-aether-well-assembly-330')
OUT = Path('/private/tmp/art023b-match-records-1d026c4')
NPM = '/Users/me/.local/bin/npm'
PLAYWRIGHT = str(ROOT / 'node_modules/playwright/index.mjs')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
commands = [
  ('shipping-guard-13', [NPM, 'run', 'test:shipping-isolation-guard'], {}),
  ('release-22', [NPM, 'run', 'test:release-build'], {}),
  ('shipping-release-4', [NPM, 'run', 'test:shipping-isolation-release'], {
    'GAME_BROWSER_PLAYWRIGHT': PLAYWRIGHT,
    'GAME_BROWSER_CHROME': CHROME,
    'SHIPPING_ISOLATION_RELEASE_EVIDENCE': str(OUT / 'shipping-isolation-release-evidence.json'),
  }),
]

def sample_descendants(parent_pid, seen_processes):
  try:
    raw = subprocess.check_output(['ps', '-axo', 'pid=,ppid=,command='], text=True, stderr=subprocess.DEVNULL)
  except Exception:
    return
  rows = []
  for line in raw.splitlines():
    parts = line.strip().split(None, 2)
    if len(parts) != 3:
      continue
    try:
      pid, ppid = int(parts[0]), int(parts[1])
    except ValueError:
      continue
    rows.append((pid, ppid, parts[2]))
  by_parent = {}
  for row in rows:
    by_parent.setdefault(row[1], []).append(row)
  todo = [parent_pid]
  visited = set()
  while todo:
    current = todo.pop()
    for row in by_parent.get(current, []):
      if row[0] in visited:
        continue
      visited.add(row[0])
      seen_processes[str(row[0])] = {'pid': row[0], 'ppid': row[1], 'command': row[2]}
      todo.append(row[0])

for name, argv, overrides in commands:
  directory = OUT / name
  directory.mkdir(parents=True, exist_ok=False)
  command_text = shlex.join(argv) + '\n'
  (directory / 'command.txt').write_text(command_text, encoding='utf-8')
  (directory / 'environment-overrides.json').write_text(json.dumps(overrides, indent=2, sort_keys=True) + '\n', encoding='utf-8')
  env = os.environ.copy()
  env.update(overrides)
  started = time.time()
  process = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
  print(f'GATE_START={name} RECORDER_PID={os.getpid()} GATE_PID={process.pid}', flush=True)
  process_tree = {}
  while process.poll() is None:
    sample_descendants(process.pid, process_tree)
    time.sleep(0.12)
  stdout, stderr = process.communicate()
  finished = time.time()
  (directory / 'stdout.raw').write_bytes(stdout)
  (directory / 'stderr.raw').write_bytes(stderr)
  (directory / 'exit.txt').write_text(f'{process.returncode}\n', encoding='ascii')
  metadata = {
    'name': name,
    'cwd': str(ROOT),
    'argv': argv,
    'shell': False,
    'recorderPid': os.getpid(),
    'directChildPid': process.pid,
    'directExitCode': process.returncode,
    'elapsedSeconds': round(finished - started, 3),
    'processesObserved': sorted(process_tree.values(), key=lambda item: item['pid']),
    'node': '/Users/me/.local/bin/node v22.22.3',
    'privatePlaywright': PLAYWRIGHT if overrides.get('GAME_BROWSER_PLAYWRIGHT') else None,
    'chrome': CHROME if overrides.get('GAME_BROWSER_CHROME') else None,
    'environmentOverrides': overrides,
  }
  (directory / 'metadata.json').write_text(json.dumps(metadata, indent=2, sort_keys=True) + '\n', encoding='utf-8')
  print(f'GATE_EXIT={name} DIRECT_EXIT_CODE={process.returncode} RECORD_DIR={directory}', flush=True)
  if process.returncode != 0:
    print(f'STOP_ON_FAILURE={name}', flush=True)
    sys.exit(process.returncode)
print('BATCH_RESULT=PASS; gates=3; direct exits=0,0,0', flush=True)
