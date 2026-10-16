import { createHash } from 'node:crypto';
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
