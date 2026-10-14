import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { GameSession } from '../../../src/sim/game-session.js';
import { exactEnduranceSetupBytes } from '../../../tests/helpers/endurance-workload.js';
import {
  COMBAT_EFFECT_FEED_MAX_BYTES,
  COMBAT_EFFECT_FEED_MAX_RECORDS,
  serializeCombatEffectFeed,
  restoreCombatEffectFeed,
  validateCombatEffectFeed,
} from '../../../src/sim/combat-effect-feed.js';

const evidenceDir = new URL('./', import.meta.url);
const raw = JSON.parse(fs.readFileSync(new URL('./raw-original-fail.json', import.meta.url), 'utf8'));
const baseline = await import(pathToFileURL(new URL('./baseline-7550-combat-effect-feed.js', import.meta.url).pathname).href);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
const utf8Bytes = (value) => new TextEncoder().encode(value).byteLength;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const byCommandId = new Map();
for (const row of raw.transportIdNormalization) {
  if (row.acceptedBrowserCommandId === null || row.normalized === null) continue;
  const prior = byCommandId.get(row.acceptedBrowserCommandId);
  if (prior !== undefined) {
    assert.equal(canonical(prior.normalized), canonical(row.normalized),
      `duplicate accepted browser command ${row.acceptedBrowserCommandId} must have identical normalized input`);
    continue;
  }
  byCommandId.set(row.acceptedBrowserCommandId, row);
}
const commands = [...byCommandId.values()].sort((left, right) =>
  left.normalized.tick - right.normalized.tick);
assert.equal(commands.length, 40, 'the raw failed browser run must contain 40 accepted decisions');
assert.deepEqual(commands.map(({ acceptedBrowserCommandId }) => acceptedBrowserCommandId),
  Array.from({ length: 40 }, (_, index) => index + 1));
assert.equal(commands[0].normalized.tick, 300);
assert.equal(commands.at(-1).normalized.tick, 17_115);

function stepTo(session, tick) {
  while (session.state.tick < tick) {
    session.stepMany(Math.min(100, tick - session.state.tick));
  }
  assert.equal(session.state.tick, tick, `session must reach requested tick ${tick}`);
}
function submit(session, row) {
  const { acceptedBrowserCommandId: commandId, normalized } = row;
  const command = {
    cardId: normalized.cardId,
    commandId,
    point: normalized.point,
    slot: normalized.slot,
    tick: normalized.tick,
    type: 'deploy',
  };
  const result = session.submitPlayerCommand(canonical(command));
  assert.equal(result.accepted, true, `recorded command at ${normalized.tick} must be accepted`);
}
function captureFeed(session) {
  const snapshot = session.projectionSnapshot().combatEffectFeed;
  const wire = serializeCombatEffectFeed(snapshot);
  const expanded = canonical(snapshot);
  return {
    snapshot,
    wire,
    wireBytes: utf8Bytes(wire),
    expandedBytes: utf8Bytes(expanded),
    expandedSha256: sha256(expanded),
  };
}
function summarize(feed) {
  const roots = feed.snapshot.records.filter(({ parentId }) => parentId === null);
  const rootDirections = {};
  const rootTypes = {};
  const phases = {};
  for (const record of feed.snapshot.records) {
    phases[record.phase] = (phases[record.phase] ?? 0) + 1;
  }
  for (const root of roots) {
    const direction = root.payload.direction;
    rootDirections[direction] = (rootDirections[direction] ?? 0) + 1;
    rootTypes[root.type] = (rootTypes[root.type] ?? 0) + 1;
  }
  return {
    wireVersion: JSON.parse(feed.wire).version,
    recordCount: feed.snapshot.records.length,
    rootCount: roots.length,
    rootTypes,
    rootDirections,
    phases,
    firstEvent: feed.snapshot.records[0] ?? null,
    lastEvent: feed.snapshot.records.at(-1) ?? null,
    expandedBytes: feed.expandedBytes,
    expandedSha256: feed.expandedSha256,
    wireBytes: feed.wireBytes,
    wireSha256: sha256(feed.wire),
  };
}

let session = new GameSession(exactEnduranceSetupBytes());
stepTo(session, 300);
session.pause();
session.resume();
const earlyCut = session.serialize();
const earlyRestore = GameSession.restore(earlyCut);
submit(session, commands[0]);
submit(earlyRestore, commands[0]);
stepTo(session, 600);
stepTo(earlyRestore, 600);
assert.equal(earlyRestore.serialize(), session.serialize(),
  'tick-300 pause/resume restore and first accepted command must replay byte-identically to tick 600');
const earlyRestoreEvidence = {
  cutTick: 300,
  cutBytes: utf8Bytes(earlyCut),
  cutSha256: sha256(earlyCut),
  replayThroughTick: 600,
  replayMatches: true,
  replayBytes: utf8Bytes(session.serialize()),
  replaySha256: sha256(session.serialize()),
};

for (const row of commands.slice(1)) {
  stepTo(session, row.normalized.tick);
  submit(session, row);
}
stepTo(session, 17_715);
const priorFeed = captureFeed(session);
const priorSummary = summarize(priorFeed);
assert.equal(priorSummary.wireVersion, 1, 'recorded pre-overflow prefix must preserve v1 wire');
fs.writeFileSync(new URL('./recorded-default-session-at-17715.json', evidenceDir), session.serialize());
const baselinePriorWire = baseline.serializeCombatEffectFeed(JSON.parse(JSON.stringify(priorFeed.snapshot)));
assert.equal(baselinePriorWire, priorFeed.wire,
  'v1 bytes through tick 17,715 must match the accepted 7550 source exactly');
fs.writeFileSync(new URL('./recorded-default-prior-v1-wire.json', evidenceDir), priorFeed.wire);

stepTo(session, 17_789);
const transitionFeed = captureFeed(session);
const transitionSummary = summarize(transitionFeed);
assert.equal(transitionSummary.wireVersion, 2, 'the actual overflow event must switch to v2');
assert.equal(transitionSummary.recordCount, 3_899);
assert.ok(transitionSummary.wireBytes <= COMBAT_EFFECT_FEED_MAX_BYTES);
assert.ok(transitionSummary.recordCount <= COMBAT_EFFECT_FEED_MAX_RECORDS);
const overflowEvent = transitionFeed.snapshot.records.at(-1);
assert.equal(overflowEvent.eventId, 3_899);
assert.equal(overflowEvent.phase, 'close');
assert.equal(overflowEvent.tick, 17_789);
const restoredTransition = restoreCombatEffectFeed(transitionFeed.wire);
assert.deepEqual(restoredTransition, transitionFeed.snapshot);
assert.equal(serializeCombatEffectFeed(restoredTransition), transitionFeed.wire);
assert.equal(serializeCombatEffectFeed(validateCombatEffectFeed(restoredTransition)), transitionFeed.wire);
const plainTransition = JSON.parse(JSON.stringify(transitionFeed.snapshot));
assert.equal(serializeCombatEffectFeed(validateCombatEffectFeed(plainTransition)), transitionFeed.wire);
assert.equal(serializeCombatEffectFeed(plainTransition), transitionFeed.wire);
fs.writeFileSync(new URL('./recorded-default-transition-v2-wire.json', evidenceDir), transitionFeed.wire);

stepTo(session, 18_000);
assert.equal(session.state.tick, 18_000);
const finalFeed = captureFeed(session);
const finalSummary = summarize(finalFeed);
assert.equal(finalSummary.wireVersion, 2);
assert.ok(finalSummary.wireBytes <= COMBAT_EFFECT_FEED_MAX_BYTES);
assert.ok(finalSummary.recordCount <= COMBAT_EFFECT_FEED_MAX_RECORDS);
assert.equal(finalSummary.recordCount, 3_931);
assert.equal(finalSummary.rootCount, 843);
const restoredFinal = restoreCombatEffectFeed(finalFeed.wire);
assert.deepEqual(restoredFinal, finalFeed.snapshot);
assert.equal(serializeCombatEffectFeed(restoredFinal), finalFeed.wire);
assert.equal(serializeCombatEffectFeed(validateCombatEffectFeed(restoredFinal)), finalFeed.wire);
const plainFinal = JSON.parse(JSON.stringify(finalFeed.snapshot));
assert.equal(serializeCombatEffectFeed(validateCombatEffectFeed(plainFinal)), finalFeed.wire);
assert.equal(serializeCombatEffectFeed(plainFinal), finalFeed.wire);
fs.writeFileSync(new URL('./recorded-default-final-v2-wire.json', evidenceDir), finalFeed.wire);
fs.writeFileSync(new URL('./recorded-default-final-expanded-v1.json', evidenceDir), JSON.stringify(finalFeed.snapshot));

const summary = {
  candidate: 'd0c09502d65406d5f9c4c7c827e1053179d2504a',
  rawScenario: raw.scenario,
  rawQualificationMode: raw.qualificationMode,
  rawBrowserCompletedSegmentTick: raw.segments.at(-1)?.toTick ?? raw.segments.at(-1)?.tick ?? null,
  acceptedCommandCount: commands.length,
  acceptedCommandIds: commands.map(({ acceptedBrowserCommandId }) => acceptedBrowserCommandId),
  acceptedCommandTicks: commands.map(({ normalized }) => normalized.tick),
  pauseResumeEarlyRestore: earlyRestoreEvidence,
  priorAt17715: priorSummary,
  baseline7550PriorWireExact: true,
  transitionAt17789: transitionSummary,
  finalAt18000: {
    tick: session.state.tick,
    terminal: session.state.terminal,
    feed: finalSummary,
    sessionBytes: utf8Bytes(session.serialize()),
    sessionSha256: sha256(session.serialize()),
  },
  fullFinalGraphRestoreValidateAndPlainExpandedReserializationExact: true,
};
fs.writeFileSync(new URL('./recorded-default-replay-evidence.json', evidenceDir),
  `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
