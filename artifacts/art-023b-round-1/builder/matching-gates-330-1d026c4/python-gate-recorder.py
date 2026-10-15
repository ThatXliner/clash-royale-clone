#!/usr/bin/env python3
import json
import os
import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path

name, command_json, env_json = sys.argv[1:4]
root = Path('/private/tmp/art023b-match-records-1d026c4')
record_dir = root / name
record_dir.mkdir(parents=True, exist_ok=False)
command = json.loads(command_json)
overrides = json.loads(env_json)
env = os.environ.copy()
env.update(overrides)
node = shutil.which('node', path=env.get('PATH'))
npm = shutil.which('npm', path=env.get('PATH'))
record_dir.joinpath('command.txt').write_text(shlex.join(command) + '\n', encoding='utf-8')
record_dir.joinpath('environment-overrides.json').write_text(json.dumps(overrides, indent=2, sort_keys=True) + '\n', encoding='utf-8')
start = time.time()
proc = subprocess.Popen(command, cwd='/private/tmp/art023b-aether-well-assembly-330', env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
print(f'RECORDER_PID={os.getpid()}', flush=True)
print(f'GATE_PID={proc.pid}', flush=True)
processes = {}

def sample_tree(parent_pid):
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
    seen = set()
    while todo:
        current = todo.pop()
        for row in by_parent.get(current, []):
            if row[0] in seen:
                continue
            seen.add(row[0])
            processes[str(row[0])] = {'pid': row[0], 'ppid': row[1], 'command': row[2]}
            todo.append(row[0])

while proc.poll() is None:
    sample_tree(proc.pid)
    time.sleep(0.15)
stdout, stderr = proc.communicate()
end = time.time()
record_dir.joinpath('stdout.raw').write_bytes(stdout)
record_dir.joinpath('stderr.raw').write_bytes(stderr)
record_dir.joinpath('exit.txt').write_text(f'{proc.returncode}\n', encoding='ascii')
metadata = {
    'name': name,
    'cwd': '/private/tmp/art023b-aether-well-assembly-330',
    'argv': command,
    'shell': False,
    'recorderPid': os.getpid(),
    'directChildPid': proc.pid,
    'directExitCode': proc.returncode,
    'elapsedSeconds': round(end - start, 3),
    'nodeExecutable': node,
    'npmExecutable': npm,
    'processesObserved': sorted(processes.values(), key=lambda item: item['pid']),
    'createdUnixTime': start,
}
record_dir.joinpath('metadata.json').write_text(json.dumps(metadata, indent=2, sort_keys=True) + '\n', encoding='utf-8')
print(f'DIRECT_EXIT_CODE={proc.returncode}', flush=True)
print(f'RECORD_DIR={record_dir}', flush=True)
sys.exit(proc.returncode)
