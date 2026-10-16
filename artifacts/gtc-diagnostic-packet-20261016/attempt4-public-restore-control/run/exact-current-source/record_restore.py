#!/usr/bin/env python3
"""Serial public restore API checks using exact captured historical snapshot bytes."""
from __future__ import annotations
import hashlib, json, os, shutil, subprocess
from datetime import datetime, timezone
from pathlib import Path

ATTEMPT=Path(__file__).resolve().parent
REPO=Path('/Users/me/.codex/worktrees/9456/clash-royale-clone')
NODE_BIN=Path('/Users/me/.hermes/node/bin')
CURRENT='5cc4d3e424661cf638c5dbea288836ef4419fcf0'
COORDINATION='090d685a4fa07aa07c17618b1e18d00ecb63ff51'
OLD_EMPTY=Path('/Users/me/.codex/worktrees/gtc-golden-pin-diagnostic-5cc4d3/attempts/attempt2-shared-clone-20261016/scripts/runs/20261016T013607.615059Z/02-gtc-empty-probe-c9/fixture-view')
OLD_STATUS=Path('/Users/me/.codex/worktrees/gtc-golden-pin-diagnostic-5cc4d3/attempts/attempt2-shared-clone-20261016/scripts/status-view-runs-shared-clones/20261016T013739.298063Z/01-status-pin-2a/views')
CARDS=('bloom-wisp','dawnmender','pulse-sentry','rime-adept','tether-rider','veil-prowler')
ENV_KEYS=('PATH','CI','NODE_ENV','TZ','NODE_OPTIONS','FORCE_COLOR','NO_COLOR','TERM')
RUN=ATTEMPT/'run'
CLONE=RUN/'private-clone-current-5cc'

def sha(b:bytes)->str:return hashlib.sha256(b).hexdigest()
def git(cwd:Path,*args:str)->bytes:
 r=subprocess.run(['git','-C',str(cwd),*args],cwd=REPO,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
 if r.returncode:raise RuntimeError(f'git -C {cwd} {args!r} exit {r.returncode}: {r.stderr.decode("utf-8","replace")}')
 return r.stdout
def fence(label:str)->dict[str,object]:
 st=git(CLONE,'status','--porcelain=v1','--untracked-files=all','--ignored=matching','-z')
 f=RUN/f'source-status-{label}.porcelain0';f.write_bytes(st)
 unstaged=git(CLONE,'diff','--binary','--no-ext-diff');staged=git(CLONE,'diff','--cached','--binary','--no-ext-diff')
 return {'head':git(CLONE,'rev-parse','HEAD').decode().strip(),'tree':git(CLONE,'rev-parse','HEAD^{tree}').decode().strip(),'status_file':str(f),'status_bytes':len(st),'status_sha256':sha(st),'unstaged_diff_bytes':len(unstaged),'unstaged_diff_sha256':sha(unstaged),'staged_diff_bytes':len(staged),'staged_diff_sha256':sha(staged)}

def main()->int:
 if RUN.exists():raise SystemExit(f'refusing existing run {RUN}')
 if git(REPO,'rev-parse','HEAD').decode().strip()!=COORDINATION:raise SystemExit('coordination checkout HEAD changed')
 if git(REPO,'rev-parse',CURRENT).decode().strip()!=CURRENT:raise SystemExit(f'missing pin {CURRENT}')
 if not (OLD_EMPTY/'snapshot.raw').is_file():raise SystemExit('captured c9 raw LiveBattle snapshot missing')
 for card in CARDS:
  if not (OLD_STATUS/f'{card}.json').is_file():raise SystemExit(f'captured 2a GameSession view missing: {card}')
 RUN.mkdir(parents=True)
 inputs=RUN/'exact-captured-snapshots';inputs.mkdir()
 live_raw=(OLD_EMPTY/'snapshot.raw').read_bytes()
 live_input=inputs/'c9-empty-live-battle-v2.snapshot';live_input.write_bytes(live_raw)
 live_view_raw=(OLD_EMPTY/'snapshot.json').read_bytes();live_view_copy=inputs/'c9-empty-live-battle-snapshot-view.json';live_view_copy.write_bytes(live_view_raw)
 items=[]
 for card in CARDS:
  view_path=OLD_STATUS/f'{card}.json';view_raw=view_path.read_bytes();view=json.loads(view_raw)
  snapshot_text=view['snapshotBytes'];snapshot_bytes=snapshot_text.encode('utf-8')
  if snapshot_bytes!=view['snapshotBytes'].encode('utf-8'):raise SystemExit(f'UTF-8 snapshot changed for {card}')
  dest=inputs/f'2a-game-session-{card}-v2.snapshot';dest.write_bytes(snapshot_bytes)
  item={'cardId':card,'capturedViewSource':str(view_path),'capturedViewBytes':len(view_raw),'capturedViewSha256':sha(view_raw),'snapshotInput':str(dest),'snapshotInputBytes':len(snapshot_bytes),'snapshotInputSha256':sha(snapshot_bytes),'snapshotVersion':view['snapshot'].get('version'),'historicalStateTick':view['state'].get('tick'),'historicalStateUnitCount':len(view['state']['battle']['units']),'historicalState':view['state'],'historicalSnapshotObject':view['snapshot']}
  items.append(item)
 manifest={'kind':'original historical snapshot bytes copied verbatim; not rebuilt or normalized','liveBattle':{'historicalSourceCommit':'c9c818f7ac281b0e71890a2be17ce757f688b4c5','sourceRawFile':str(OLD_EMPTY/'snapshot.raw'),'copiedRawFile':str(live_input),'rawBytes':len(live_raw),'rawSha256':sha(live_raw),'parsedViewSource':str(OLD_EMPTY/'snapshot.json'),'copiedParsedView':str(live_view_copy),'viewSha256':sha(live_view_raw)},'gameSessions':items}
 manifest_path=RUN/'captured-snapshot-input-manifest.json';manifest_path.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
 setup_log=RUN/'private-clone-setup.log';setup_log.touch()
 clone_cmds=[['git','clone','--shared','--no-checkout',str(REPO),str(CLONE)],['git','-C',str(CLONE),'checkout','--detach',CURRENT]]
 with setup_log.open('ab') as log:
  for argv in clone_cmds:
   r=subprocess.run(argv,cwd=REPO,stdout=log,stderr=subprocess.STDOUT,check=False)
   if r.returncode:raise SystemExit(f'private clone setup exit {r.returncode}: {argv}')
 if git(CLONE,'rev-parse','HEAD').decode().strip()!=CURRENT:raise SystemExit('private clone HEAD mismatch')
 before=fence('before')
 if before['status_bytes']!=0:raise SystemExit(f'private clone is not clean before restore: {before}')
 source_dir=RUN/'exact-current-source';source_dir.mkdir()
 source_rel=('package.json','src/sim/game-session.js','src/sim/live-battle.js','src/sim/battle-continuation-kernel.js','src/sim/session-troop-projectile-runtime.js','src/shared/session-troop-source-confidence-authority.js')
 source_copies=[]
 for rel in source_rel:
  payload=(CLONE/rel).read_bytes();dest=source_dir/rel;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(payload)
  source_copies.append({'relativePath':rel,'sourcePath':str(CLONE/rel),'copyPath':str(dest),'bytes':len(payload),'sha256':sha(payload),'gitBlob':git(CLONE,'rev-parse',f'{CURRENT}:{rel}').decode().strip(),'copySha256':sha(dest.read_bytes())})
 recorder_copy=source_dir/'record_restore.py';rec_payload=Path(__file__).read_bytes();recorder_copy.write_bytes(rec_payload)
 probe=RUN/'public-restore-control.mjs'
 probe.write_text(r'''import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [sourceRoot, manifestPath, resultPath] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function diffPaths(a,b,path='$',out=[]) {
  if (out.length >= 200) return out;
  if (a === b) return out;
  if (Array.isArray(a) && Array.isArray(b)) {
    const keyed = path.endsWith('.battle.units') && [...a,...b].every((v)=>v && typeof v==='object' && Number.isInteger(v.id));
    if (keyed) {
      const am=new Map(a.map((v)=>[v.id,v])), bm=new Map(b.map((v)=>[v.id,v]));
      for (const id of [...new Set([...am.keys(),...bm.keys()])].sort((x,y)=>x-y)) {
        if (!am.has(id)) out.push(`${path}[id=${id}] (added)`);
        else if (!bm.has(id)) out.push(`${path}[id=${id}] (removed)`);
        else diffPaths(am.get(id),bm.get(id),`${path}[id=${id}]`,out);
        if(out.length>=200)break;
      }
      return out;
    }
    const n=Math.max(a.length,b.length);
    for(let i=0;i<n && out.length<200;i++) {
      if(i>=a.length)out.push(`${path}[${i}] (added)`);
      else if(i>=b.length)out.push(`${path}[${i}] (removed)`);
      else diffPaths(a[i],b[i],`${path}[${i}]`,out);
    }
    return out;
  }
  if(a && b && typeof a==='object' && typeof b==='object') {
    for(const k of [...new Set([...Object.keys(a),...Object.keys(b)])].sort()) {
      if(!(k in a))out.push(`${path}.${k} (added)`);
      else if(!(k in b))out.push(`${path}.${k} (removed)`);
      else diffPaths(a[k],b[k],`${path}.${k}`,out);
      if(out.length>=200)break;
    }
    return out;
  }
  out.push(path); return out;
}
const result={label:'current public restore APIs on exact captured historical bytes',sourceRoot,sourceCommit:'5cc4d3e424661cf638c5dbea288836ef4419fcf0',liveBattle:null,gameSessions:[]};
const liveBytes=readFileSync(manifest.liveBattle.copiedRawFile);
const liveText=liveBytes.toString('utf8');
const liveShape=JSON.parse(liveText);
result.liveBattle={historicalSourceCommit:manifest.liveBattle.historicalSourceCommit,inputBytes:liveBytes.length,inputSha256:sha(liveBytes),snapshotVersion:liveShape.version,setupKeys:Object.keys(liveShape.setup??{}),questionCount:Array.isArray(liveShape.setup?.questions)?liveShape.setup.questions.length:null,rosterCount:Array.isArray(liveShape.setup?.roster)?liveShape.setup.roster.length:null};
try {
  const {LiveBattle}=await import(pathToFileURL(resolve(sourceRoot,'src/sim/live-battle.js')).href);
  const battle=LiveBattle.restore(liveText);
  const output=battle.serialize();
  result.liveBattle.accepted=true;
  result.liveBattle.reserializationExact=output===liveText;
  result.liveBattle.reserializedBytes=Buffer.byteLength(output);
  result.liveBattle.reserializedSha256=sha(output);
  result.liveBattle.stateTick=battle.state.tick;
  result.liveBattle.stateUnitCount=battle.state.units.length;
  result.liveBattle.publicStateCapturedHistorically=false;
  result.liveBattle.note='Captured c9 artifact contains serialized v2 snapshot but no separate public LiveBattle.state capture.';
} catch(error) {
  result.liveBattle.accepted=false;
  result.liveBattle.error={name:error?.name??null,message:error?.message??String(error),stack:error?.stack??null};
}
for(const item of manifest.gameSessions) {
  const entry={cardId:item.cardId,historicalSourceCommit:'2a5bd7a44ad3773de59e8e6dd8baaebf0ec09764',inputBytes:item.snapshotInputBytes,inputSha256:item.snapshotInputSha256,snapshotVersion:item.snapshotVersion,historicalStateTick:item.historicalStateTick,historicalStateUnitCount:item.historicalStateUnitCount};
  const bytes=readFileSync(item.snapshotInput);const text=bytes.toString('utf8');
  try {
    const {GameSession}=await import(pathToFileURL(resolve(sourceRoot,'src/sim/game-session.js')).href);
    const session=GameSession.restore(text);
    const serialized=session.serialize();const state=session.state;
    entry.accepted=true;entry.reserializationExact=serialized===text;entry.reserializedBytes=Buffer.byteLength(serialized);entry.reserializedSha256=sha(serialized);entry.stateTick=state.tick;entry.stateUnitCount=state.battle.units.length;entry.stateEqualToCapturedHistoricalState=canonical(state)===canonical(item.historicalState);entry.stateDiffPaths=diffPaths(item.historicalState,state);entry.historicalUnits=item.historicalState.battle.units.map(({id,side,cardId,archetypeId,spawnedAt,memberIndex})=>({id,side,cardId,archetypeId,spawnedAt,memberIndex}));entry.restoredUnits=state.battle.units.map(({id,side,cardId,archetypeId,spawnedAt,memberIndex})=>({id,side,cardId,archetypeId,spawnedAt,memberIndex}));entry.snapshotObjectEqualToCaptured=canonical(JSON.parse(serialized))===canonical(item.historicalSnapshotObject);
  } catch(error) {entry.accepted=false;entry.error={name:error?.name??null,message:error?.message??String(error),stack:error?.stack??null};}
  result.gameSessions.push(entry);
}
writeFileSync(resultPath,`${JSON.stringify(result,null,2)}\n`);
console.log(JSON.stringify(result,null,2));
''',encoding='utf-8')
 probe_payload=probe.read_bytes()
 (RUN/'exact-current-source'/'public-restore-control.mjs').write_bytes(probe_payload)
 env=os.environ.copy();env['PATH']=str(NODE_BIN)+os.pathsep+env.get('PATH','');env['NO_COLOR']='1';env['TERM']='dumb'
 node=shutil.which('node',path=env['PATH'])
 if not node or Path(node).parent.resolve()!=NODE_BIN.resolve():raise SystemExit(f'Node resolution not pinned: {node}')
 version=subprocess.run([node,'--version'],cwd=CLONE,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
 if version.returncode or not version.stdout.decode().strip().startswith('v22.'):raise SystemExit(f'expected Node 22: {version.stdout!r} {version.stderr!r}')
 argv=[node,str(probe),str(CLONE),str(manifest_path),str(RUN/'restore-results.json')]
 metadata={'purpose':'current LiveBattle.restore on exact c9 v2 bytes, then current GameSession.restore on six exact captured 2a v2 snapshots','sourcePin':CURRENT,'coordinationHead':COORDINATION,'cloneStrategy':'private full shared clone; detached pin; no sparse checkout','clone':str(CLONE),'cloneHead':git(CLONE,'rev-parse','HEAD').decode().strip(),'sourceFenceBefore':before,'sourceTree':git(CLONE,'rev-parse',f'{CURRENT}:src').decode().strip(),'sourceCopies':source_copies,'recorderCopy':str(recorder_copy),'recorderSha256':sha(rec_payload),'probeSource':str(probe),'probeSourceSha256':sha(probe_payload),'inputManifest':str(manifest_path),'inputManifestSha256':sha(manifest_path.read_bytes()),'inputs':{'liveBattle':manifest['liveBattle'],'gameSessions':[{'cardId':i['cardId'],'snapshotPath':i['snapshotInput'],'bytes':i['snapshotInputBytes'],'sha256':i['snapshotInputSha256'],'capturedViewSource':i['capturedViewSource'],'capturedViewSha256':i['capturedViewSha256'],'snapshotVersion':i['snapshotVersion']} for i in items]},'argv':argv,'cwd':str(CLONE),'nodeExecutable':node,'nodeVersion':version.stdout.decode().strip(),'environmentAllowlist':{k:env.get(k) for k in ENV_KEYS},'stdoutFile':str(RUN/'stdout.log'),'stderrFile':str(RUN/'stderr.log'),'resultFile':str(RUN/'restore-results.json'),'createdAtUtc':datetime.now(timezone.utc).isoformat()}
 meta_path=RUN/'metadata.json';meta_path.write_text(json.dumps(metadata,indent=2,ensure_ascii=False)+'\n')
 with (RUN/'stdout.log').open('wb') as out,(RUN/'stderr.log').open('wb') as err:
  proc=subprocess.Popen(argv,cwd=CLONE,env=env,stdout=out,stderr=err)
  metadata['directPid']=proc.pid;metadata['popenReturnedAtUtc']=datetime.now(timezone.utc).isoformat();meta_path.write_text(json.dumps(metadata,indent=2,ensure_ascii=False)+'\n')
  print(f'START public restore control PID {proc.pid}',flush=True)
  exit_code=proc.wait()
 after=fence('after');metadata.update({'directExitCode':exit_code,'sourceFenceAfter':after,'finishedAtUtc':datetime.now(timezone.utc).isoformat()});meta_path.write_text(json.dumps(metadata,indent=2,ensure_ascii=False)+'\n')
 print(f'END public restore control PID {metadata["directPid"]} exit {exit_code}',flush=True)
 cleanup=[]
 if after['status_bytes']==0:shutil.rmtree(CLONE);cleanup.append({'path':str(CLONE),'removed':True,'reason':'clean source clone after restore-only control'})
 else:cleanup.append({'path':str(CLONE),'removed':False,'reason':'dirty source fence; clone preserved'})
 (RUN/'clone-cleanup.json').write_text(json.dumps(cleanup,indent=2)+'\n')
 return exit_code

if __name__=='__main__':raise SystemExit(main())
