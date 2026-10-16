#!/usr/bin/env python3
"""One-case public-API control: current GameSession with exact historical setup."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
from datetime import datetime, timezone

ATTEMPT = Path(__file__).resolve().parent
REPO = Path('/Users/me/.codex/worktrees/9456/clash-royale-clone')
NODE_BIN = Path('/Users/me/.hermes/node/bin')
CURRENT = '5cc4d3e424661cf638c5dbea288836ef4419fcf0'
COORDINATION = '090d685a4fa07aa07c17618b1e18d00ecb63ff51'
HISTORICAL = '2a5bd7a44ad3773de59e8e6dd8baaebf0ec09764'
PRIOR_CAPTURE = Path('/Users/me/.codex/worktrees/gtc-golden-pin-diagnostic-5cc4d3/attempts/attempt2-shared-clone-20261016/scripts/status-view-runs-shared-clones/20261016T013739.298063Z/01-status-pin-2a/views/bloom-wisp.json')
PRIOR_TEST = Path('/Users/me/.codex/worktrees/gtc-golden-pin-diagnostic-5cc4d3/attempts/attempt2-shared-clone-20261016/scripts/status-view-runs-shared-clones/20261016T013739.298063Z/01-status-pin-2a/executed-source/tests/game-roster-troops-status.test.js')
RUN = ATTEMPT / 'run'
CLONE = RUN / 'private-clone-current-5cc'
ENV_KEYS = ('PATH','CI','NODE_ENV','TZ','NODE_OPTIONS','FORCE_COLOR','NO_COLOR','TERM')

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def git(cwd: Path, *args: str) -> bytes:
    r = subprocess.run(['git','-C',str(cwd),*args],cwd=REPO,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
    if r.returncode:
        raise RuntimeError(f'git -C {cwd} {args!r} exit {r.returncode}: {r.stderr.decode("utf-8","replace")}')
    return r.stdout

def fence(label: str) -> dict[str, object]:
    status=git(CLONE,'status','--porcelain=v1','--untracked-files=all','--ignored=matching','-z')
    out=RUN/f'source-status-{label}.porcelain0'; out.write_bytes(status)
    unstaged=git(CLONE,'diff','--binary','--no-ext-diff')
    staged=git(CLONE,'diff','--cached','--binary','--no-ext-diff')
    return {'head':git(CLONE,'rev-parse','HEAD').decode().strip(),
            'tree':git(CLONE,'rev-parse','HEAD^{tree}').decode().strip(),
            'status_file':str(out),'status_bytes':len(status),'status_sha256':sha(status),
            'unstaged_diff_bytes':len(unstaged),'unstaged_diff_sha256':sha(unstaged),
            'staged_diff_bytes':len(staged),'staged_diff_sha256':sha(staged)}

def main() -> int:
    if RUN.exists(): raise SystemExit(f'refusing existing run: {RUN}')
    if git(REPO,'rev-parse','HEAD').decode().strip()!=COORDINATION:
        raise SystemExit('coordination checkout HEAD changed')
    for commit in (CURRENT,HISTORICAL):
        if git(REPO,'rev-parse',commit).decode().strip()!=commit:
            raise SystemExit(f'missing expected commit {commit}')
    if not PRIOR_CAPTURE.is_file() or not PRIOR_TEST.is_file():
        raise SystemExit('historical capture/test source missing')
    RUN.mkdir(parents=True)
    input_dir=RUN/'exact-inputs'; input_dir.mkdir()
    hist_payload=PRIOR_CAPTURE.read_bytes(); test_payload=PRIOR_TEST.read_bytes()
    hist_copy=input_dir/'historical-bloom-wisp-view.json'; hist_copy.write_bytes(hist_payload)
    test_copy=input_dir/'historical-status-test.js'; test_copy.write_bytes(test_payload)
    historical=json.loads(hist_payload)
    required=('setup','state','replayBytes','snapshotBytes')
    if any(k not in historical for k in required): raise SystemExit('historical view lacks required fields')
    (RUN/'private-clone-setup.log').touch()
    CLONE.parent.mkdir(parents=True,exist_ok=True)
    setup_commands=[['git','clone','--shared','--no-checkout',str(REPO),str(CLONE)],
                    ['git','-C',str(CLONE),'checkout','--detach',CURRENT]]
    with (RUN/'private-clone-setup.log').open('ab') as log:
        for argv in setup_commands:
            r=subprocess.run(argv,cwd=REPO,stdout=log,stderr=subprocess.STDOUT,check=False)
            if r.returncode: raise SystemExit(f'clone setup returned {r.returncode}: {argv}')
    if git(CLONE,'rev-parse','HEAD').decode().strip()!=CURRENT: raise SystemExit('clone HEAD mismatch')
    before=fence('before')
    if before['status_bytes']!=0: raise SystemExit(f'clone not clean before probe: {before}')
    package_payload=(CLONE/'package.json').read_bytes()
    api_payload=(CLONE/'src/sim/game-session.js').read_bytes()
    current_test_payload=(CLONE/'tests/game-roster-troops-status.test.js').read_bytes()
    package_copy=input_dir/'current-package.json'; package_copy.write_bytes(package_payload)
    api_copy=input_dir/'current-game-session.js'; api_copy.write_bytes(api_payload)
    current_test_copy=input_dir/'current-status-test.js'; current_test_copy.write_bytes(current_test_payload)
    source_id={p:git(CLONE,'rev-parse',f'{CURRENT}:{p}').decode().strip() for p in ('src','package.json','tests/game-roster-troops-status.test.js','tests/game-roster-troops-status-runner.js')}
    node_source=RUN/'public-api-same-input-control.mjs'
    node_source.write_text(r'''import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [sourceRoot, historicalPath, outputPath] = process.argv.slice(2);
const old = JSON.parse(readFileSync(historicalPath, 'utf8'));
const sha = (s) => createHash('sha256').update(s).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
const result = {
  label: 'current public API, exact captured historical 2a setup and bloom-wisp scenario',
  sourceRoot,
  historicalInput: historicalPath,
  historicalInputSha256: sha(readFileSync(historicalPath)),
  historicalTestSourceSha256: sha(readFileSync(resolve(dirname(historicalPath), 'historical-status-test.js'))),
  historicalStateTick: old.state.tick,
  historicalUnitCount: old.state.battle.units.length,
  historicalReplaySha256: sha(old.replayBytes),
  historicalSnapshotSha256: sha(old.snapshotBytes),
  apiAcceptedHistoricalSetup: false,
};
try {
  const { GameSession } = await import(pathToFileURL(resolve(sourceRoot, 'src/sim/game-session.js')).href);
  const session = new GameSession(canonical(old.setup));
  result.apiAcceptedHistoricalSetup = true;
  result.executionStage = 'historical command replay';
  const id = 'bloom-wisp';
  const southPoint = Object.freeze({ x: 3500, y: 14500 });
  const slot = session.state.decks.south.hand.indexOf(id);
  result.southHandSlot = slot;
  session.submitPlayerCommand(canonical({ cardId:id,commandId:0,point:southPoint,slot,tick:session.state.tick,type:'deploy' }));
  session.step();
  const source = session.state.battle.units.find((unit) => unit.side==='south' && unit.cardId===id);
  const target = session.state.battle.units.find((unit) => unit.side==='north' && unit.alive);
  if (!source || !target) throw new Error('historical deploy witness did not materialize its source/target');
  session.submitPlayerCommand(canonical({ actionId:'heal',commandId:1,point:null,side:'south',sourceId:source.id,targetId:source.id,tick:session.state.tick,type:'status' }));
  session.stepMany(10);
  const replayBytes = session.replayBytes();
  const snapshotBytes = session.serialize();
  const currentState = session.state;
  result.executionStage = 'comparison';
  result.currentTick = currentState.tick;
  result.currentUnitCount = currentState.battle.units.length;
  result.currentUnits = currentState.battle.units.map(({id,side,cardId,archetypeId,spawnedAt,memberIndex}) => ({id,side,cardId,archetypeId,spawnedAt,memberIndex}));
  result.currentReplaySha256 = sha(replayBytes);
  result.currentSnapshotSha256 = sha(snapshotBytes);
  result.replayBytesEqual = replayBytes === old.replayBytes;
  result.stateEqual = canonical(currentState) === canonical(old.state);
  result.snapshotBytesEqual = snapshotBytes === old.snapshotBytes;
  result.replayObjectEqual = canonical(JSON.parse(replayBytes)) === canonical(old.replayObject);
  result.snapshotObjectEqual = canonical(JSON.parse(snapshotBytes)) === canonical(old.snapshot);
} catch (error) {
  result.rejectionOrProbeError = {stage:result.executionStage ?? 'GameSession constructor',name:error?.name ?? null,message:error?.message ?? String(error),stack:error?.stack ?? null};
}
writeFileSync(outputPath, `${JSON.stringify(result,null,2)}\n`);
console.log(JSON.stringify(result,null,2));
''',encoding='utf-8')
    node_payload=node_source.read_bytes()
    env=os.environ.copy(); env['PATH']=str(NODE_BIN)+os.pathsep+env.get('PATH',''); env['NO_COLOR']='1'; env['TERM']='dumb'
    node=shutil.which('node',path=env['PATH'])
    if not node or Path(node).parent.resolve()!=NODE_BIN.resolve(): raise SystemExit(f'Node resolution is not pinned: {node}')
    version=subprocess.run([node,'--version'],cwd=CLONE,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
    npm=shutil.which('npm',path=env['PATH'])
    npm_version=subprocess.run([npm,'--version'],cwd=CLONE,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False) if npm else None
    if version.returncode or not version.stdout.decode().strip().startswith('v22.'):
        raise SystemExit(f'expected Node 22, got {version.stdout!r} / {version.stderr!r}')
    stdout=RUN/'stdout.log'; stderr=RUN/'stderr.log'; output=RUN/'control-result.json'; metadata_path=RUN/'metadata.json'
    argv=[node,str(node_source),str(CLONE),str(hist_copy),str(output)]
    metadata={
      'purpose':'one bounded public API control using exact captured historical GameSession setup/witness and command sequence',
      'source_pin':CURRENT,'historical_fixture_commit':HISTORICAL,'coordination_head':COORDINATION,
      'clone_strategy':'full private git clone --shared --no-checkout, detached checkout; clean source fences',
      'clone':str(CLONE),'clone_HEAD':git(CLONE,'rev-parse','HEAD').decode().strip(),
      'source_tree_objects':source_id,'source_fence_before':before,
      'historical_capture_source':str(PRIOR_CAPTURE),'historical_capture_copy':str(hist_copy),'historical_capture_bytes':len(hist_payload),'historical_capture_sha256':sha(hist_payload),
      'historical_test_source':str(PRIOR_TEST),'historical_test_copy':str(test_copy),'historical_test_sha256':sha(test_payload),
      'current_test_copy':str(current_test_copy),'current_test_sha256':sha(current_test_payload),
      'current_package_copy':str(package_copy),'current_package_sha256':sha(package_payload),
      'current_GameSession_source_copy':str(api_copy),'current_GameSession_source_sha256':sha(api_payload),
      'executed_probe_source':str(node_source),'executed_probe_sha256':sha(node_payload),
      'probe_argv':argv,'cwd':str(CLONE),'node_executable':node,'node_version':version.stdout.decode().strip(),
      'npm_executable':npm,'npm_version':npm_version.stdout.decode().strip() if npm_version else None,
      'environment_allowlist':{k:env.get(k) for k in ENV_KEYS},'stdout_file':str(stdout),'stderr_file':str(stderr),'result_file':str(output),
      'created_at_utc':datetime.now(timezone.utc).isoformat()}
    metadata_path.write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf-8')
    with stdout.open('wb') as out, stderr.open('wb') as err:
        proc=subprocess.Popen(argv,cwd=CLONE,env=env,stdout=out,stderr=err)
        metadata['direct_pid']=proc.pid; metadata['popen_returned_at_utc']=datetime.now(timezone.utc).isoformat()
        metadata_path.write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf-8')
        print(f'START public-api same-input control PID {proc.pid}',flush=True)
        code=proc.wait()
    after=fence('after')
    metadata.update({'direct_exit_code':code,'source_fence_after':after,'finished_at_utc':datetime.now(timezone.utc).isoformat()})
    metadata_path.write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf-8')
    print(f'END public-api same-input control PID {metadata["direct_pid"]} exit {code}',flush=True)
    cleanup=[]
    if after['status_bytes']==0:
        shutil.rmtree(CLONE); cleanup.append({'path':str(CLONE),'removed':True,'reason':'clean source clone after control'})
    else:
        cleanup.append({'path':str(CLONE),'removed':False,'reason':'dirty source fence; preserved'})
    (RUN/'clone-cleanup.json').write_text(json.dumps(cleanup,indent=2)+'\n',encoding='utf-8')
    return code

if __name__=='__main__':
    raise SystemExit(main())
