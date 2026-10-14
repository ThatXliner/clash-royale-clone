import assert from 'node:assert/strict';
import {
  COMBAT_EFFECT_FEED_MAX_BYTES,
  appendCombatEffectEvent,
  appendCombatEffectRoot,
  combatEffectFeedSnapshot,
  combatEffectRootId,
  createCombatEffectFeed,
  restoreCombatEffectFeed,
} from '../../../src/sim/combat-effect-feed.js';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function rootInput(identity) {
  return {
    direction: 'projectile',
    effectId: null,
    from: { x: 1000, y: 1000 },
    impactTick: identity + 1,
    projectileId: identity,
    radius: 0,
    segments: [],
    sequence: identity,
    sourceId: 1,
    tick: identity,
    to: { x: 3000, y: 1000 },
    type: 'projectile',
  };
}
function close(feed, root) {
  return appendCombatEffectEvent(feed, {
    parentId: root.eventId,
    payload: { reason: 'launch-cancelled' },
    phase: 'close',
    rootId: root.rootId,
    tick: root.tick,
    type: 'projectile',
  });
}
function rejected(label, input, pattern) {
  assert.throws(() => restoreCombatEffectFeed(input), pattern, label);
  return label;
}

const builder = createCombatEffectFeed();
let crossingIdentity = 1;
let beforeTransition;
let crossingFeed;
for (; crossingIdentity <= 8192; crossingIdentity += 1) {
  const previous = builder.fork();
  const root = appendCombatEffectRoot(builder, rootInput(crossingIdentity));
  if (JSON.parse(builder.serialize()).version === 2) {
    beforeTransition = previous;
    crossingFeed = builder;
    break;
  }
  close(builder, root);
}
assert.ok(beforeTransition, 'fixture must reach the v1-to-v2 transition');
const beforeBytes = beforeTransition.serialize();
const beforeCount = combatEffectFeedSnapshot(beforeTransition).records.length;
assert.equal(JSON.parse(beforeBytes).version, 1);
const crossing = rootInput(crossingIdentity);
const correctRootId = combatEffectRootId({
  direction: crossing.direction,
  effectId: crossing.effectId,
  projectileId: crossing.projectileId,
  sequence: crossing.sequence,
  sourceId: crossing.sourceId,
  type: crossing.type,
});
const last = correctRootId.at(-1);
const incorrectRootId = `${correctRootId.slice(0, -1)}${last === 'x' ? 'y' : 'x'}`;
assert.throws(() => appendCombatEffectEvent(beforeTransition, {
  parentId: null,
  payload: {
    direction: crossing.direction,
    effectId: crossing.effectId,
    from: crossing.from,
    impactTick: crossing.impactTick,
    projectileId: crossing.projectileId,
    radius: crossing.radius,
    segments: crossing.segments,
    sequence: crossing.sequence,
    sourceId: crossing.sourceId,
    to: crossing.to,
  },
  phase: 'open',
  rootId: incorrectRootId,
  tick: crossing.tick,
  type: crossing.type,
}), /root identity/u);
assert.equal(beforeTransition.serialize(), beforeBytes,
  'failed append at the v1-to-v2 threshold must leave bytes/version unchanged');
assert.equal(combatEffectFeedSnapshot(beforeTransition).records.length, beforeCount,
  'failed threshold append must leave record cursor unchanged');
assert.equal(JSON.parse(beforeTransition.serialize()).version, 1);
const validAfterRejection = appendCombatEffectRoot(beforeTransition, crossing);
assert.equal(validAfterRejection.eventId, beforeCount + 1,
  'valid retry must receive the unchanged next event ID');
assert.equal(JSON.parse(beforeTransition.serialize()).version, 2,
  'valid retry must perform the same v1-to-v2 transition');
close(beforeTransition, validAfterRejection);
const afterTransitionBytes = beforeTransition.serialize();
const afterTransitionCount = combatEffectFeedSnapshot(beforeTransition).records.length;
assert.ok(new TextEncoder().encode(afterTransitionBytes).byteLength <= COMBAT_EFFECT_FEED_MAX_BYTES);
assert.throws(() => appendCombatEffectEvent(beforeTransition, {
  parentId: validAfterRejection.eventId + 1,
  payload: { reason: 'complete' },
  phase: 'close',
  rootId: validAfterRejection.rootId,
  tick: validAfterRejection.tick,
  type: 'projectile',
}), /after close|closed|lineage|phase/u);
assert.equal(beforeTransition.serialize(), afterTransitionBytes,
  'failed compact-mode append must preserve wire bytes and version');
assert.equal(combatEffectFeedSnapshot(beforeTransition).records.length, afterTransitionCount,
  'failed compact-mode append must preserve record cursor');
const afterRejectedCompactAppend = appendCombatEffectRoot(beforeTransition, rootInput(crossingIdentity + 1));
assert.equal(afterRejectedCompactAppend.eventId, afterTransitionCount + 1,
  'valid compact-mode append after rejection must continue the exact cursor');
assert.equal(JSON.parse(beforeTransition.serialize()).version, 2);

const validV2 = afterTransitionBytes;
const parsed = JSON.parse(validV2);
const cases = [];
function attempt(label, mutate, pattern) {
  const value = structuredClone(parsed);
  mutate(value);
  cases.push(rejected(label, canonical(value), pattern));
}
attempt('unknown wire version', (value) => { value.version = 3; }, /version/u);
attempt('extra top-level key', (value) => { value.extra = true; }, /shape/u);
attempt('root tuple too short', (value) => { value.records[0].pop(); }, /row shape/u);
attempt('root tuple too long', (value) => { value.records[0].push(0, 0); }, /bounded plain array/u);
attempt('unknown root type code', (value) => { value.records[0][1] = 2; }, /type code/u);
attempt('child tuple too short', (value) => { value.records[1].pop(); }, /unsupported|plain data object|shape|payload/u);
attempt('unknown child phase code', (value) => { value.records[1][2] = 99; }, /phase code/u);
attempt('parent ID coercion', (value) => { value.records[1][0] = '1'; }, /parent ID/u);
attempt('parent ID forward reference', (value) => { value.records[1][0] = 2; }, /parent ID/u);
attempt('root tick coercion', (value) => { value.records[0][0] = '1'; }, /safe integer/u);
attempt('fractional child tick', (value) => { value.records[1][1] = 1.5; }, /safe integer/u);
attempt('child tick before root', (value) => { value.records[1][1] = 0; }, /tick/u);
attempt('forged root identity', (value) => { value.records[0][2].sourceId = null; }, /sourceId|canonical/u);
attempt('unsupported close reason', (value) => { value.records[1][3].reason = 'surprise'; }, /reason/u);
rejected('noncanonical leading whitespace', ` ${validV2}`, /canonical/u);
rejected('noncanonical property order', JSON.stringify({ version: 2, records: parsed.records }), /canonical/u);
rejected('unknown public version string', canonical({ records: [], version: '2' }), /version/u);

const evidence = {
  transitionIdentity: crossingIdentity,
  preTransition: { recordCount: beforeCount, wireVersion: 1, wireBytes: new TextEncoder().encode(beforeBytes).byteLength },
  transitionRetryAfterRejectedAppend: { eventId: validAfterRejection.eventId, wireVersion: 2, recordCount: afterTransitionCount },
  compactRejectedAppend: { wireVersionRemained: 2, bytesUnchanged: true, recordCursorUnchanged: true,
    nextValidEventId: afterRejectedCompactAppend.eventId },
  adversarialWireRejections: cases,
  rejectionCount: cases.length + 2,
  allChecksPassed: true,
};
console.log(JSON.stringify(evidence, null, 2));
