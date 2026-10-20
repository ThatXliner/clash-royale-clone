#!/usr/bin/python3
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import sys

base = pathlib.Path('/Users/me/.codex/clash-qualification/20261020-factory')
attempt = base / 'attempt-20261020T134946Z'
candidate = base / 'candidate-ffdaab6299f34308776cd2568f1d9f34903ecf14'
baseline = base / 'baseline-7f41167c2429eec637dbb7c5f838fa3b404ab4d2'
recorder = attempt / 'recorder' / 'run-builder-qualification-r4.sh'
runner_record = attempt / 'qualification-r4'
outer_record = attempt / 'outer-recorder-r4'
source = attempt / 'source-prelaunch'

def run(argv, cwd=None):
    return subprocess.run(argv, cwd=cwd, text=True, capture_output=True)

def insist(ok, message):
    if not ok:
        raise RuntimeError(message)

candidate_head = run(['/usr/bin/git', '-C', str(candidate), 'rev-parse', 'HEAD'])
candidate_parent = run(['/usr/bin/git', '-C', str(candidate), 'rev-parse', 'HEAD^'])
baseline_head = run(['/usr/bin/git', '-C', str(baseline), 'rev-parse', 'HEAD'])
candidate_status = run(['/usr/bin/git', '-C', str(candidate), 'status', '--porcelain', '--untracked-files=all'])
baseline_status = run(['/usr/bin/git', '-C', str(baseline), 'status', '--porcelain', '--untracked-files=all'])
changed = run(['/usr/bin/git', '-C', str(candidate), 'diff', '--name-only', '4a6e9f6171ae1042a03f7c8268863df9a97920e7', 'ffdaab6299f34308776cd2568f1d9f34903ecf14', '--'])
node = run(['/Users/me/.hermes/node/bin/node', '--version'])
npm = run(['/Users/me/.hermes/node/bin/npm', '--version'])
chrome = run(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '--version'])
playwright = run(['/usr/bin/awk', '-F', '"', '$2 == "version" { print $4; exit }', str(candidate / 'node_modules/playwright/package.json')])
syntax = run(['/bin/sh', '-n', str(recorder)])
blender = run(['/bin/ps', '-p', '6024', '-o', 'pid=,ppid=,%cpu=,%mem=,etime=,command='])

manifest = attempt / 'recorder' / 'source-fences-a71.tsv'
expected_paths = [line.split('\t')[0] for line in manifest.read_text().splitlines() if line.strip()]
fence_file = source / 'factory-source-fences.tsv'
fences = fence_file.read_text().splitlines()
source_git_fence = (source / 'git-fence-result.tsv').read_text().strip()
lock_before = (attempt / 'npm-ci-preflight' / 'package-lock-before.sha256').read_text().split()[0]
lock_after = (attempt / 'npm-ci-postflight' / 'package-lock-after.sha256').read_text().split()[0]
lock_now = hashlib.sha256((candidate / 'package-lock.json').read_bytes()).hexdigest()
identity_sha = hashlib.sha256((attempt / 'recorder' / 'source-identity-receipt.json').read_bytes()).hexdigest()
manifest_sha = hashlib.sha256(manifest.read_bytes()).hexdigest()
runner_sha = hashlib.sha256(recorder.read_bytes()).hexdigest()

insist(candidate_head.returncode == 0 and candidate_head.stdout.strip() == 'ffdaab6299f34308776cd2568f1d9f34903ecf14', 'candidate HEAD pin mismatch')
insist(candidate_parent.returncode == 0 and candidate_parent.stdout.strip() == '4a6e9f6171ae1042a03f7c8268863df9a97920e7', 'candidate parent pin mismatch')
insist(baseline_head.returncode == 0 and baseline_head.stdout.strip() == '7f41167c2429eec637dbb7c5f838fa3b404ab4d2', 'baseline HEAD pin mismatch')
insist(candidate_status.returncode == 0 and candidate_status.stdout == '', 'candidate checkout is not clean')
insist(baseline_status.returncode == 0 and baseline_status.stdout == '', 'baseline checkout is not clean')
insist(changed.returncode == 0 and changed.stdout.splitlines() == sorted(expected_paths), 'candidate changed-path inventory mismatch')
insist(node.returncode == 0 and node.stdout.strip() == 'v22.22.3', 'Node version mismatch')
insist(npm.returncode == 0 and npm.stdout.strip() == '10.9.8', 'npm version mismatch')
insist(chrome.returncode == 0 and chrome.stdout.strip() == 'Google Chrome 155.0.8059.85', 'Chrome version mismatch')
insist(playwright.returncode == 0 and playwright.stdout.strip() == '1.58.2', 'Playwright version mismatch')
insist(syntax.returncode == 0, 'R4 recorder shell syntax failure')
insist((attempt / 'npm-ci' / 'exit.txt').read_text().strip() == '0', 'npm ci did not exit zero')
insist(lock_before == lock_after == lock_now == 'd707c780097d5e60bd33d03a60a35087c04c789f2f44717bb6812913bf933bf4', 'package-lock changed')
insist(source_git_fence == 'candidate_parent_path_set\tPASS', 'source git path fence did not pass')
insist(len(fences) == 6 and all(line.endswith('\tPASS') for line in fences[1:]), 'one or more factory source fences failed')
insist(identity_sha == '93be40f6654f27095a9097370244762a134144b4ed20278b7c5a398130225173', 'identity receipt digest mismatch')
insist(manifest_sha == 'c8031bd32d54a3045397b9e8b31c42311b0754142c325d4c471ae18276f25875', 'source manifest digest mismatch')
insist((attempt / 'npm-ci-postflight' / 'candidate-status-porcelain-after.txt').read_text() == '', 'candidate became dirty after npm ci')
insist(not runner_record.exists() and not outer_record.exists(), 'qualification output directory already exists')
insist(not blender.stdout.strip() and blender.returncode != 0, 'Blender PID 6024 is still live')
for path in [candidate / 'node_modules/playwright/index.mjs', candidate / 'node_modules/playwright/package.json', pathlib.Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')]:
    insist(path.is_file() and os.access(str(path), os.X_OK if path.name == 'Google Chrome' else os.R_OK), 'toolchain file unavailable: ' + str(path))

runtime_env = {
    'PATH': '/bin:/usr/bin:/usr/sbin:/sbin:/Users/me/.hermes/node/bin',
    'HOME': str(attempt / 'outer-home'),
    'TMPDIR': str(attempt / 'outer-tmp'),
    'FACTORY_CANDIDATE_ROOT': str(candidate),
    'FACTORY_CANDIDATE_COMMIT': 'ffdaab6299f34308776cd2568f1d9f34903ecf14',
    'FACTORY_ACCEPTED_PARENT': '4a6e9f6171ae1042a03f7c8268863df9a97920e7',
    'FACTORY_RECORD_ROOT': str(runner_record),
    'GAME001HTJX_RUNTIME_RELEASE': '1',
    'SHARED_COMBAT_BASELINE_ROOT': str(baseline),
    'GAME_BROWSER_CHROME': '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'GAME_BROWSER_PLAYWRIGHT': str(candidate / 'node_modules/playwright/index.mjs'),
}
for path in [attempt / 'outer-home', attempt / 'outer-tmp']:
    path.mkdir(exist_ok=False)
env_path = attempt / 'qualification-env.json'
insist(not env_path.exists(), 'qualification environment already exists')
env_path.write_text(json.dumps(runtime_env, indent=2, sort_keys=True) + '\n')

blender_observation = {
    'source': 'root-reported observation; original raw process sample was not saved',
    'observed_at_local': '2026-10-20 06:57 America/Los_Angeles',
    'pid': 6024,
    'start_time_local': '2026-10-20 06:54:17 America/Los_Angeles',
    'elapsed_at_observation': '03:14',
    'cpu_percent': 870.9,
    'load_average': [14.83, 10.57, 6.65],
    'logical_cpu_count': 10,
    'command': '/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python output/gear-modeling/build-c200-round-rims.py',
    'current_liveness_checked_at_local': datetime.datetime.now().astimezone().isoformat(),
    'current_ps_exit': blender.returncode,
    'current_ps_stdout': blender.stdout,
    'current_ps_stderr': blender.stderr,
}
observation_path = attempt / 'root-reported-blender-observation.json'
insist(not observation_path.exists(), 'Blender observation file already exists')
observation_path.write_text(json.dumps(blender_observation, indent=2) + '\n')

uptime = run(['/usr/bin/uptime'])
preflight = {
    'recorded_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'candidate_root': str(candidate),
    'baseline_root': str(baseline),
    'recorder': str(recorder),
    'recorder_sha256': runner_sha,
    'candidate_record_root': str(runner_record),
    'outer_capture_root': str(outer_record),
    'outer_capture_script': str(attempt / 'capture-subprocess.py'),
    'launch_argv': ['/usr/bin/python3', str(attempt / 'capture-subprocess.py'), '--output-dir', str(outer_record), '--cwd', str(candidate), '--env-json', str(env_path), '--', '/bin/sh', str(recorder)],
    'candidate_head': candidate_head.stdout.strip(),
    'candidate_parent': candidate_parent.stdout.strip(),
    'baseline_head': baseline_head.stdout.strip(),
    'candidate_changed_paths': changed.stdout.splitlines(),
    'candidate_status': candidate_status.stdout,
    'baseline_status': baseline_status.stdout,
    'node_version': node.stdout.strip(),
    'npm_version': npm.stdout.strip(),
    'playwright_version': playwright.stdout.strip(),
    'chrome_version': chrome.stdout.strip(),
    'npm_ci_exit': (attempt / 'npm-ci' / 'exit.txt').read_text().strip(),
    'package_lock_sha256_before_ci': lock_before,
    'package_lock_sha256_after_ci': lock_after,
    'package_lock_sha256_current': lock_now,
    'source_git_fence': source_git_fence,
    'factory_source_fences': fences,
    'source_identity_receipt_sha256': identity_sha,
    'source_fence_manifest_sha256': manifest_sha,
    'blender_liveness': {'exit_code': blender.returncode, 'stdout': blender.stdout, 'stderr': blender.stderr},
    'current_uptime': uptime.stdout.strip(),
    'current_top_receipt': str(attempt / 'current-load-check.top.txt'),
    'current_top_sha256': hashlib.sha256((attempt / 'current-load-check.top.txt').read_bytes()).hexdigest(),
}
preflight_path = attempt / 'launch-preflight.json'
insist(not preflight_path.exists(), 'launch preflight already exists')
preflight_path.write_text(json.dumps(preflight, indent=2) + '\n')
print(json.dumps({'preflight': str(preflight_path), 'candidate': candidate_head.stdout.strip(), 'parent': candidate_parent.stdout.strip(), 'baseline': baseline_head.stdout.strip(), 'node': node.stdout.strip(), 'npm': npm.stdout.strip(), 'playwright': playwright.stdout.strip(), 'chrome': chrome.stdout.strip(), 'npm_ci_exit': (attempt / 'npm-ci' / 'exit.txt').read_text().strip(), 'lock_unchanged': lock_before == lock_after == lock_now, 'blender_ps_exit': blender.returncode}, indent=2))
