import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { GameSession } from '../../../src/sim/game-session.js';
import { exactEnduranceSetupBytes } from '../../../tests/helpers/endurance-workload.js';
const dir = new URL('./', import.meta.url);
const raw = JSON.parse(fs.readFileSync(new URL('./raw-original-fail.json', import.meta.url), 'utf8'));
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const hash = (value) => createHash('sha256').update(value).digest('hex');
const bytes = (value) => new TextEncoder().encode(value).byteLength;
const row = raw.transportIdNormalization.find((entry) => entry.acceptedBrowserCommandId === 1);
assert.ok(row?.normalized);
const command = {
  cardId: row.normalized.cardId,
  commandId: row.acceptedBrowserCommandId,
  point: row.normalized.point,
  slot: row.normalized.slot,
  tick: row.normalized.tick,
  type: 'deploy',
};
assert.equal(command.tick, 300);
function toTick(session, tick) {
  while (session.state.tick < tick) session.stepMany(Math.min(100, tick - session.state.tick));
  assert.equal(session.state.tick, tick);
}
const live = new GameSession(exactEnduranceSetupBytes());
toTick(live, 300);
live.pause();
live.resume();
const pausedResumeCut = live.serialize();
const restored = GameSession.restore(pausedResumeCut);
assert.equal(restored.serialize(), pausedResumeCut);
assert.equal(live.submitPlayerCommand(canonical(command)).accepted, true);
assert.equal(restored.submitPlayerCommand(canonical(command)).accepted, true);
toTick(live, 600);
toTick(restored, 600);
assert.equal(restored.serialize(), live.serialize());
const evidence = {
  scenario: raw.scenario,
  acceptedCommandId: command.commandId,
  commandTick: command.tick,
  pausedResumedAtTick: 300,
  checkpointBytes: bytes(pausedResumeCut),
  checkpointSha256: hash(pausedResumeCut),
  resumedRestorationExact: true,
  replayedThroughTick: 600,
  finalSessionBytes: bytes(live.serialize()),
  finalSessionSha256: hash(live.serialize()),
  restoredReplayMatchesLiveByteExactly: true,
};
fs.writeFileSync(new URL('./recorded-default-early-restore-evidence.json', dir), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
