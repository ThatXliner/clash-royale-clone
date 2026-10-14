import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import {
  appendCombatEffectEvent,
  appendCombatEffectRoot,
  createCombatEffectFeed,
  restoreCombatEffectFeed,
  validateCombatEffectFeed,
  serializeCombatEffectFeed,
  COMBAT_EFFECT_FEED_MAX_BYTES,
  COMBAT_EFFECT_FEED_MAX_RECORDS,
} from '../../../src/sim/combat-effect-feed.js';
const dir = new URL('./', import.meta.url);
const finalWire = fs.readFileSync(new URL('./recorded-default-final-v2-wire.json', import.meta.url), 'utf8');
const expanded = JSON.parse(fs.readFileSync(new URL('./recorded-default-final-expanded-v1.json', import.meta.url), 'utf8'));
const expected = restoreCombatEffectFeed(finalWire);
const feed = createCombatEffectFeed();
for (const record of expanded.records) {
  if (record.parentId === null) {
    const root = appendCombatEffectRoot(feed, {
      direction: record.payload.direction,
      effectId: record.payload.effectId,
      from: record.payload.from,
      impactTick: record.payload.impactTick,
      projectileId: record.payload.projectileId,
      radius: record.payload.radius,
      segments: record.payload.segments,
      sequence: record.payload.sequence,
      sourceId: record.payload.sourceId,
      tick: record.tick,
      to: record.payload.to,
      type: record.type,
    });
    assert.equal(root.eventId, record.eventId);
    assert.equal(root.rootId, record.rootId);
  } else {
    const appended = appendCombatEffectEvent(feed, {
      parentId: record.parentId,
      payload: record.payload,
      phase: record.phase,
      rootId: record.rootId,
      tick: record.tick,
      type: record.type,
    });
    assert.equal(appended.eventId, record.eventId);
  }
}
const before = feed.serialize();
assert.equal(before, finalWire, 'replayed actual graph append sequence must recreate the exact actual v2 wire');
assert.deepEqual(validateCombatEffectFeed(feed.snapshot()), expanded);
const fork = feed.fork();
assert.equal(fork.serialize(), finalWire, 'fork of actual compact graph starts byte-identical');
const branchRoot = appendCombatEffectRoot(fork, {
  direction: 'unit-to-unit',
  effectId: null,
  from: { x: 0, y: 0 },
  impactTick: 18_001,
  projectileId: 999_999,
  radius: 0,
  segments: [],
  sequence: 1,
  sourceId: 999_999,
  tick: 18_000,
  to: { x: 1_000, y: 0 },
  type: 'projectile',
});
appendCombatEffectEvent(fork, {
  parentId: branchRoot.eventId,
  payload: { reason: 'launch-cancelled' },
  phase: 'close',
  rootId: branchRoot.rootId,
  tick: 18_000,
  type: 'projectile',
});
assert.notEqual(fork.serialize(), before);
assert.equal(feed.serialize(), before, 'mutating a fork cannot change actual parent graph');
const forkRestored = restoreCombatEffectFeed(fork.serialize());
assert.deepEqual(forkRestored, fork.snapshot());
assert.equal(serializeCombatEffectFeed(forkRestored), fork.serialize());
assert.equal(serializeCombatEffectFeed(validateCombatEffectFeed(forkRestored)), fork.serialize());
assert.equal(JSON.parse(fork.serialize()).version, 2);
assert.ok(new TextEncoder().encode(fork.serialize()).byteLength <= COMBAT_EFFECT_FEED_MAX_BYTES);
assert.ok(fork.snapshot().records.length <= COMBAT_EFFECT_FEED_MAX_RECORDS);
const evidence = {
  actualReplayGraph: {
    records: expanded.records.length,
    rootCount: expanded.records.filter(({ parentId }) => parentId === null).length,
    exactRecreatedWire: true,
    wireVersion: JSON.parse(before).version,
    wireBytes: new TextEncoder().encode(before).byteLength,
    wireSha256: createHash('sha256').update(before).digest('hex'),
  },
  actualV2Fork: {
    startsByteIdentically: true,
    appendedEventIds: fork.snapshot().records.slice(-2).map(({ eventId }) => eventId),
    remainsCompactV2: JSON.parse(fork.serialize()).version === 2,
    wireBytes: new TextEncoder().encode(fork.serialize()).byteLength,
    parentRemainsExactlyUnchanged: feed.serialize() === before,
    restoreValidateReserializeExact: true,
  },
};
fs.writeFileSync(new URL('./recorded-default-actual-fork-evidence.json', dir), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
