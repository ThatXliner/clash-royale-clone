import { createHash } from 'node:crypto';
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
