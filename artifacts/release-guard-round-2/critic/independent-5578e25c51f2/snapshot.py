#!/usr/bin/env python3
import datetime as dt
import hashlib
import json
from pathlib import Path
import subprocess
import sys

root = Path('/private/tmp/release-guard-round2-critic-5578e25c51f2')
evidence = Path('/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/release-guard-round-2/critic/independent-5578e25c51f2')
label = sys.argv[1]
head = subprocess.run(['git','rev-parse','HEAD'],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True,text=True).stdout.strip()
status = subprocess.run(['git','status','--porcelain=v2','--untracked-files=all'],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True).stdout
(evidence / f'status-{label}.raw').write_bytes(status)
tracked = subprocess.run(['git','ls-files','-z'],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True).stdout.split(b'\0')
files = {}
missing = []
total = 0
for raw in filter(None,tracked):
    rel = raw.decode('utf-8','surrogateescape')
    path = root / rel
    try:
        st = path.lstat()
    except FileNotFoundError:
        missing.append(rel)
        continue
    if path.is_symlink():
        data = path.readlink().as_posix().encode()
        kind = 'symlink'
    else:
        data = path.read_bytes()
        kind = 'file'
    digest = hashlib.sha256(data).hexdigest()
    files[rel] = {'kind':kind,'bytes':len(data),'sha256':digest}
    total += len(data)
record = {
  'label':label,
  'captured_utc':dt.datetime.now(dt.timezone.utc).isoformat(),
  'head':head,
  'tracked_count':len(files),
  'tracked_bytes':total,
  'missing_tracked':missing,
  'files':files,
  'kernel':files.get('src/sim/battle-continuation-kernel.js'),
  'package_lock':files.get('package-lock.json'),
}
(evidence / f'tracked-{label}.json').write_text(json.dumps(record,indent=2,sort_keys=True)+'\n')
print(json.dumps({k:record[k] for k in ['label','head','tracked_count','tracked_bytes','missing_tracked','kernel','package_lock']},indent=2))
