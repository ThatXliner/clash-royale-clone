from datetime import datetime, timezone
from pathlib import Path
import json, os, subprocess, sys, time
repo=Path('/private/tmp/release-guard-round2-builder-033f1107')
ev=Path('/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/release-guard-round-2/builder/builder-20261014-033f1107')
commands=[
 ('nondeterminism-guard',['npm','run','test:nondeterminism-guard']),
 ('shipping-isolation-guard',['npm','run','test:shipping-isolation-guard']),
 ('shipping-isolation-release',['npm','run','test:shipping-isolation-release']),
 ('shipping-isolation-host',['npm','run','test:shipping-isolation-host']),
 ('game-spell-runtime',['npm','run','test:game-spell-runtime']),
 ('compact-capability-hostile',['node','--test','tests/compact-capability-hostile.test.js']),
 ('combat-effect-feed-bound',['node','--test','tests/combat-effect-feed-bound.test.js']),
 ('sprite-unit',['node','--test','tests/combat-sprite-prototype.test.js']),
 ('visual-asset-manifest',['npm','run','test:visual-asset-manifest']),
 ('visual-arena-art',['npm','run','test:visual-arena-art']),
 ('release-build',['npm','run','test:release-build']),
 ('publication-pages',['npm','run','test:publication-pages']),
]
env=os.environ.copy()
env['GAME_BROWSER_CHROME']='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
records=[]
for name,argv in commands:
    started=datetime.now(timezone.utc).isoformat()
    logfile=ev/f'{name}.tap'
    meta={'name':name,'argv':argv,'startedAtUtc':started,'pid':None,'actualExitCode':None,'durationSeconds':None,'log':str(logfile)}
    print(f'RUN_START {name} PID_PENDING',flush=True)
    before=time.monotonic()
    with logfile.open('w') as out:
        process=subprocess.Popen(argv,cwd=repo,env=env,stdout=out,stderr=subprocess.STDOUT,text=True)
        meta['pid']=process.pid
        pidfile=ev/f'{name}.pid'
        pidfile.write_text(f'{process.pid}\n')
        print(f'RUN_PID {name} {process.pid}',flush=True)
        code=process.wait()
    meta['actualExitCode']=code
    meta['durationSeconds']=round(time.monotonic()-before,3)
    meta['finishedAtUtc']=datetime.now(timezone.utc).isoformat()
    (ev/f'{name}.exit').write_text(f'{code}\n')
    records.append(meta)
    tail=logfile.read_text(errors='replace').splitlines()[-16:]
    print(f'RUN_END {name} ACTUAL_EXIT={code} DURATION={meta["durationSeconds"]}s',flush=True)
    for line in tail: print(line,flush=True)
    (ev/'suite-run-receipts.json').write_text(json.dumps(records,indent=2)+'\n')
print('SUITE_SUMMARY '+json.dumps([{'name':x['name'],'pid':x['pid'],'exit':x['actualExitCode'],'seconds':x['durationSeconds']} for x in records]),flush=True)
