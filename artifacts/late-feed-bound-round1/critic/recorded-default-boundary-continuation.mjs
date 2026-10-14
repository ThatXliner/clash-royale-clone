import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { GameSession } from '../../../src/sim/game-session.js';
import {
  COMBAT_EFFECT_FEED_MAX_BYTES,
  COMBAT_EFFECT_FEED_MAX_RECORDS,
  serializeCombatEffectFeed,
  restoreCombatEffectFeed,
  validateCombatEffectFeed,
} from '../../../src/sim/combat-effect-feed.js';

const dir = new URL('./', import.meta.url);
const checkpoint = fs.readFileSync(new URL('./recorded-default-session-at-17715.json', import.meta.url), 'utf8');
const baseline = await import(pathToFileURL(new URL('./baseline-7550-combat-effect-feed.js', import.meta.url).pathname).href);
const session = GameSession.restore(checkpoint);
assert.equal(session.state.tick, 17_715);
assert.equal(session.serialize(), checkpoint, 'checkpoint restore must preserve exact session bytes');

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const utf8Bytes = (value) => new TextEncoder().encode(value).byteLength;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
function capture() {
  const snapshot = session.projectionSnapshot().combatEffectFeed;
  const wire = serializeCombatEffectFeed(snapshot);
  const expanded = canonical(snapshot);
  return { snapshot, wire, wireBytes: utf8Bytes(wire), expandedBytes: utf8Bytes(expanded), expandedSha256: sha256(expanded) };
}
function stats(feed) {
  const roots = feed.snapshot.records.filter(({ parentId }) => parentId === null);
  const phases = {};
  const rootTypes = {};
  const rootDirections = {};
  for (const r of feed.snapshot.records) phases[r.phase] = (phases[r.phase] ?? 0) + 1;
  for (const r of roots) {
    rootTypes[r.type] = (rootTypes[r.type] ?? 0) + 1;
    const direction = r.payload.direction;
    rootDirections[direction] = (rootDirections[direction] ?? 0) + 1;
  }
  return {
    wireVersion: JSON.parse(feed.wire).version,
    recordCount: feed.snapshot.records.length,
    rootCount: roots.length,
    phases,
    rootTypes,
    rootDirections,
    wireBytes: feed.wireBytes,
    wireSha256: sha256(feed.wire),
    expandedBytes: feed.expandedBytes,
    expandedSha256: feed.expandedSha256,
    firstEvent: feed.snapshot.records[0] ?? null,
    lastEvent: feed.snapshot.records.at(-1) ?? null,
  };
}
function stepTo(target) {
  while (session.state.tick < target) session.stepMany(1);
  assert.equal(session.state.tick, target, `replay must reach cursor ${target}`);
}

const prior = capture();
assert.equal(prior.wire, fs.readFileSync(new URL('./recorded-default-prior-v1-wire.json', import.meta.url), 'utf8'));
assert.equal(baseline.serializeCombatEffectFeed(JSON.parse(JSON.stringify(prior.snapshot))), prior.wire,
  'pre-overflow v1 bytes at live cursor 17,715 must match accepted 7550');
const boundaries = [];
let transitionCaptured = false;
for (const cursor of [17_789, 17_790, 17_791, 17_792]) {
  stepTo(cursor);
  const feed = capture();
  const summary = {
    cursor,
    stateTick: session.state.tick,
    ...stats(feed),
    recentEvents: feed.snapshot.records.slice(-6),
  };
  boundaries.push(summary);
  fs.writeFileSync(new URL('./recorded-default-boundary-cursors.json', dir), `${JSON.stringify(boundaries, null, 2)}\n`);
  if (!transitionCaptured && summary.wireVersion === 2) {
    assert.ok(feed.wireBytes <= COMBAT_EFFECT_FEED_MAX_BYTES);
    assert.ok(feed.snapshot.records.length <= COMBAT_EFFECT_FEED_MAX_RECORDS);
    const restored = restoreCombatEffectFeed(feed.wire);
    assert.deepEqual(restored, feed.snapshot);
    assert.equal(serializeCombatEffectFeed(restored), feed.wire);
    assert.equal(serializeCombatEffectFeed(validateCombatEffectFeed(restored)), feed.wire);
    const plain = JSON.parse(JSON.stringify(feed.snapshot));
    assert.equal(serializeCombatEffectFeed(validateCombatEffectFeed(plain)), feed.wire);
    assert.equal(serializeCombatEffectFeed(plain), feed.wire);
    fs.writeFileSync(new URL('./recorded-default-transition-v2-wire.json', dir), feed.wire);
    transitionCaptured = true;
  }
}
stepTo(18_000);
assert.equal(session.state.tick, 18_000);
const finalFeed = capture();
const final = stats(finalFeed);
assert.equal(final.wireVersion, 2);
assert.ok(final.wireBytes <= COMBAT_EFFECT_FEED_MAX_BYTES);
assert.ok(final.recordCount <= COMBAT_EFFECT_FEED_MAX_RECORDS);
assert.equal(finalFeed.snapshot.records[0].eventId, 1);
for (let i = 0; i < finalFeed.snapshot.records.length; i++) {
  assert.equal(finalFeed.snapshot.records[i].eventId, i + 1, `record ${i + 1} must remain in the full causal graph`);
}
const restoredFinal = restoreCombatEffectFeed(finalFeed.wire);
assert.deepEqual(restoredFinal, finalFeed.snapshot);
assert.equal(serializeCombatEffectFeed(restoredFinal), finalFeed.wire);
assert.equal(serializeCombatEffectFeed(validateCombatEffectFeed(restoredFinal)), finalFeed.wire);
const plainFinal = JSON.parse(JSON.stringify(finalFeed.snapshot));
assert.equal(serializeCombatEffectFeed(validateCombatEffectFeed(plainFinal)), finalFeed.wire);
assert.equal(serializeCombatEffectFeed(plainFinal), finalFeed.wire);
fs.writeFileSync(new URL('./recorded-default-final-v2-wire.json', dir), finalFeed.wire);
fs.writeFileSync(new URL('./recorded-default-final-expanded-v1.json', dir), JSON.stringify(finalFeed.snapshot));
const evidence = {
  restoredCheckpoint: { tick: 17_715, bytes: utf8Bytes(checkpoint), sha256: sha256(checkpoint), exactRoundTrip: true },
  priorAt17715: stats(prior),
  baseline7550PriorWireExact: true,
  boundaryCursors: boundaries,
  finalAt18000: { tick: session.state.tick, terminal: session.state.terminal, sessionBytes: utf8Bytes(session.serialize()), sessionSha256: sha256(session.serialize()), feed: final },
  contiguousEventIdsFrom1NoEviction: true,
  actualFinalGraphRestoreValidateAndPlainExpandedReserializationExact: true,
  unchangedLimits: { maxWireBytes: COMBAT_EFFECT_FEED_MAX_BYTES, maxRecords: COMBAT_EFFECT_FEED_MAX_RECORDS },
};
fs.writeFileSync(new URL('./recorded-default-boundary-continuation-evidence.json', dir), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
