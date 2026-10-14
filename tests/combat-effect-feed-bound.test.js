import assert from "node:assert/strict";
import test from "node:test";

import {
  COMBAT_EFFECT_FEED_VERSION,
  COMBAT_EFFECT_FEED_MAX_BYTES,
  COMBAT_EFFECT_FEED_MAX_RECORDS,
  appendCombatEffectEvent,
  appendCombatEffectRoot,
  combatEffectFeedSnapshot,
  createCombatEffectFeed,
  restoreCombatEffectFeed,
  serializeCombatEffectFeed,
  validateCombatEffectFeed,
} from "../src/sim/combat-effect-feed.js";

const utf8Bytes = (value) => new TextEncoder().encode(value).byteLength;

test("compact wire keeps the existing public feed version and hard bounds", () => {
  assert.equal(COMBAT_EFFECT_FEED_VERSION, 1);
  assert.equal(COMBAT_EFFECT_FEED_MAX_BYTES, 1_048_576);
  assert.equal(COMBAT_EFFECT_FEED_MAX_RECORDS, 16_384);
});

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function appendCancelledProjectile(feed, identity) {
  const root = appendCombatEffectRoot(feed, {
    direction: "projectile",
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
    type: "projectile",
  });
  appendCombatEffectEvent(feed, {
    parentId: root.eventId,
    payload: { reason: "launch-cancelled" },
    phase: "close",
    rootId: root.rootId,
    tick: identity,
    type: "projectile",
  });
}

function buildCompactFeed() {
  const feed = createCombatEffectFeed();
  let identity = 1;
  while (identity <= COMBAT_EFFECT_FEED_MAX_RECORDS / 2) {
    appendCancelledProjectile(feed, identity);
    identity += 1;
    if (identity % 100 === 0 && JSON.parse(feed.serialize()).version === 2) break;
  }
  assert.equal(JSON.parse(feed.serialize()).version, 2,
    "a complete feed switches to compact wire form when expanded v1 bytes reach the bound");
  return { feed, nextIdentity: identity };
}

test("compact wire preserves the full v1 logical graph across restore and branches", () => {
  const legacy = createCombatEffectFeed();
  appendCancelledProjectile(legacy, 1);
  const legacyBytes = legacy.serialize();
  assert.equal(JSON.parse(legacyBytes).version, 1);
  assert.equal(serializeCombatEffectFeed(restoreCombatEffectFeed(legacyBytes)), legacyBytes);

  const { feed } = buildCompactFeed();
  const bytes = feed.serialize();
  const wire = JSON.parse(bytes);
  const expanded = combatEffectFeedSnapshot(feed);
  assert.equal(wire.version, 2);
  assert.ok(utf8Bytes(canonical(expanded)) > COMBAT_EFFECT_FEED_MAX_BYTES,
    "the complete logical graph is larger than the old wire allowance");
  assert.ok(utf8Bytes(bytes) <= COMBAT_EFFECT_FEED_MAX_BYTES);
  assert.equal(expanded.version, 1, "public snapshot API retains its logical v1 shape");
  assert.equal(expanded.records.length, wire.records.length);
  assert.equal(expanded.records.length <= COMBAT_EFFECT_FEED_MAX_RECORDS, true);
  assert.equal(expanded.records.every((record, index) =>
    record.eventId === index + 1 && record.rootId.length > 0 &&
    record.type === "projectile" && record.payload !== undefined), true);

  const restored = restoreCombatEffectFeed(bytes);
  assert.deepEqual(restored, expanded);
  assert.equal(serializeCombatEffectFeed(restored), bytes);
  assert.equal(serializeCombatEffectFeed(validateCombatEffectFeed(restored)), bytes);
  assert.equal(serializeCombatEffectFeed(JSON.parse(JSON.stringify(expanded))), bytes,
    "expanded snapshots that exceed v1 wire size select the same bounded v2 encoding");
  assert.equal(JSON.parse(serializeCombatEffectFeed(feed.fork())).version, 2);
  assert.equal(serializeCombatEffectFeed(feed.snapshot()), bytes);

  const branch = feed.fork();
  appendCancelledProjectile(branch, expanded.records.length / 2 + 1);
  assert.notEqual(branch.serialize(), bytes);
  assert.equal(feed.serialize(), bytes, "appending to a v2 fork does not mutate its parent");
  assert.equal(serializeCombatEffectFeed(restoreCombatEffectFeed(branch.serialize())),
    branch.serialize());
});

test("compact v2 rejects noncanonical, malformed, and causally forged rows", () => {
  const { feed } = buildCompactFeed();
  const valid = feed.serialize();
  const parsed = JSON.parse(valid);
  const expanded = combatEffectFeedSnapshot(feed);
  const attempt = (mutate, pattern) => {
    const value = structuredClone(parsed);
    mutate(value);
    assert.throws(() => restoreCombatEffectFeed(canonical(value)), pattern);
  };

  attempt((value) => { value.records[0][1] = "1"; }, /type code/u);
  attempt((value) => { value.records[1][2] = 99; }, /phase code/u);
  attempt((value) => { value.records[1][0] = 2; }, /parent ID|parent|root|lineage/u);
  attempt((value) => { value.records[1].push("extra"); }, /bounded plain array|row shape/u);
  attempt((value) => { value.records[0][2].sourceId = null; }, /sourceId|canonical/u);
  assert.throws(() => restoreCombatEffectFeed(` ${valid}`), /canonical/u);
  assert.throws(() => restoreCombatEffectFeed(canonical({
    records: parsed.records,
    extra: true,
    version: 2,
  })), /shape/u);
  const forgedExpanded = structuredClone(expanded);
  forgedExpanded.records[0].payload.sourceId = null;
  const forgedBefore = JSON.stringify(forgedExpanded);
  assert.throws(() => validateCombatEffectFeed(forgedExpanded), /sourceId|canonical/u);
  assert.equal(JSON.stringify(forgedExpanded), forgedBefore,
    "validating a forged expanded snapshot cannot mutate caller-owned input");
  assert.throws(() => validateCombatEffectFeed({
    records: new Array(COMBAT_EFFECT_FEED_MAX_RECORDS + 1), version: 1,
  }), /bounded plain array/u);
  assert.equal(feed.serialize(), valid, "rejecting untrusted v2 bytes cannot alter a live feed");
});

test("compact append byte-bound failure is atomic and keeps the same limits", () => {
  const { feed, nextIdentity } = buildCompactFeed();
  const branch = feed.fork();
  let identity = nextIdentity;
  let reachedByteBound = false;
  for (; identity <= COMBAT_EFFECT_FEED_MAX_RECORDS / 2; identity += 1) {
    let root;
    try {
      root = appendCombatEffectRoot(branch, {
        direction: "projectile",
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
        type: "projectile",
      });
    } catch (error) {
      assert.match(error.message, /byte bound/u);
      reachedByteBound = true;
      break;
    }
    const beforeClose = branch.serialize();
    try {
      appendCombatEffectEvent(branch, {
        parentId: root.eventId,
        payload: { reason: "launch-cancelled" },
        phase: "close",
        rootId: root.rootId,
        tick: identity,
        type: "projectile",
      });
    } catch (error) {
      assert.match(error.message, /byte bound/u);
      assert.equal(branch.serialize(), beforeClose,
        "a rejected close leaves the authenticated open-root state unchanged");
      reachedByteBound = true;
      break;
    }
  }
  assert.equal(reachedByteBound, true, "v2 still observes the unchanged serialized-byte bound");
  assert.equal(JSON.parse(branch.serialize()).version, 2);
  assert.ok(utf8Bytes(branch.serialize()) <= COMBAT_EFFECT_FEED_MAX_BYTES);
  assert.ok(utf8Bytes(feed.serialize()) <= COMBAT_EFFECT_FEED_MAX_BYTES);
});
