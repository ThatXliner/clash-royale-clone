import assert from "node:assert/strict";
import test from "node:test";

import { AreaDamageSystem } from "../src/sim/area-damage.js";
import { position, radius } from "../src/sim/spatial.js";
import { targetCandidate } from "../src/sim/targeting.js";

function candidate(
  id,
  {
    alive = true,
    kind = "troop",
    layer = "ground",
    radiusTiles = 0.5,
    targetable = true,
    x = 0,
    y = 0,
  } = {},
) {
  return targetCandidate({
    alive,
    id,
    kind,
    layer,
    position: position(x, y),
    radius: radius(radiusTiles),
    targetable,
  });
}

function effect(overrides = {}) {
  return {
    center: position(0, 0),
    damage: 4,
    mode: "air_and_ground",
    radius: radius(1),
    tick: 20,
    ...overrides,
  };
}

test("area-damage: circle boundary is inclusive and one millitile out misses", () => {
  const area = new AreaDamageSystem();
  area.add(1, 10);
  area.add(2, 10);
  const result = area.resolve(effect(), [
    candidate(2, { x: 1.501 }),
    candidate(1, { x: 1.5 }),
  ]);
  assert.deepEqual(result.hitTargetIds, [1]);
  assert.equal(area.get(1).currentHealth, 6);
  assert.equal(area.get(2).currentHealth, 10);
});

test("area-damage: target modes use layer and structure semantics", () => {
  const make = () => {
    const area = new AreaDamageSystem();
    for (let id = 1; id <= 3; id += 1) area.add(id, 20);
    return area;
  };
  const candidates = [
    candidate(1, { layer: "air" }),
    candidate(2),
    candidate(3, { kind: "structure" }),
  ];
  const expected = {
    air: [1],
    air_and_ground: [1, 2, 3],
    buildings: [3],
    ground: [2, 3],
    none: [],
  };
  for (const [mode, ids] of Object.entries(expected)) {
    assert.deepEqual(
      make().resolve(effect({ mode }), candidates).hitTargetIds,
      ids,
    );
  }
});

test("area-damage: dead, untargetable, candidate-dead, and missing IDs miss", () => {
  const area = new AreaDamageSystem();
  for (let id = 1; id <= 3; id += 1) area.add(id, 5);
  area.resolve(effect({ damage: 5 }), [candidate(1)]);
  const result = area.resolve(effect(), [
    candidate(1),
    candidate(2, { targetable: false }),
    candidate(3, { alive: false }),
    candidate(4),
  ]);
  assert.deepEqual(result.hitTargetIds, []);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].type, "effect");
});

test("area-damage: duplicate IDs reject atomically before any damage", () => {
  const area = new AreaDamageSystem();
  area.add(1, 10);
  const before = area.serialize();
  assert.throws(
    () => area.resolve(effect(), [candidate(1), candidate(1)]),
    /unique entity IDs/,
  );
  assert.equal(area.serialize(), before);
});

test("area-damage: victims are one simultaneous stable replay batch", () => {
  const orders = [
    [candidate(9), candidate(2), candidate(5)],
    [candidate(5), candidate(9), candidate(2)],
  ];
  const outputs = orders.map((candidates) => {
    const area = new AreaDamageSystem();
    area.add(9, 4);
    area.add(2, 4);
    area.add(5, 20);
    return {
      result: area.resolve(effect(), candidates),
      state: area.serialize(),
    };
  });
  assert.deepEqual(outputs[0], outputs[1]);
  const { events } = outputs[0].result;
  assert.deepEqual(events.map((event) => event.type), [
    "effect",
    "hit", "hit", "hit",
    "damage", "damage", "damage",
    "death", "death",
  ]);
  assert.deepEqual(
    events.filter((event) => event.targetId !== undefined)
      .map((event) => event.targetId),
    [2, 5, 9, 2, 5, 9, 2, 9],
  );
});

test("area-damage: effect IDs are monotonic including explicit no-target effects", () => {
  const area = new AreaDamageSystem();
  area.add(1, 10);
  const first = area.resolve(effect({ mode: "none", tick: 0 }), [candidate(1)]);
  const second = area.resolve(effect({ tick: 0 }), []);
  const third = area.resolve(effect({ tick: 1 }), [candidate(1)]);
  assert.deepEqual(
    [first.effectId, second.effectId, third.effectId, area.nextEffectId],
    [1, 2, 3, 4],
  );
});

test("area-damage: malformed effects and candidates are atomic", () => {
  const area = new AreaDamageSystem();
  area.add(1, 10);
  const before = area.serialize();
  const invalid = [
    { ...effect(), damage: -1 },
    { ...effect(), tick: -1 },
    { ...effect(), mode: "water" },
    { ...effect(), radius: -1 },
    { ...effect(), extra: true },
  ];
  for (const value of invalid) {
    assert.throws(() => area.resolve(value, [candidate(1)]));
    assert.equal(area.serialize(), before);
  }
  assert.throws(() => area.resolve(effect(), [{ ...candidate(1), alive: 1 }]));
  assert.equal(area.serialize(), before);
});

test("area-damage: returned replay is isolated JSON", () => {
  const area = new AreaDamageSystem();
  area.add(1, 10);
  const result = area.resolve(effect(), [candidate(1)]);
  result.events[0].center.x = 9999;
  result.hitTargetIds.length = 0;
  assert.equal(area.get(1).currentHealth, 6);
  assert.equal(area.nextEffectId, 2);
});

test("area-damage: restore continues byte-identically", () => {
  const uninterrupted = new AreaDamageSystem();
  uninterrupted.add(7, 12);
  uninterrupted.add(2, 9);
  uninterrupted.resolve(effect({ damage: 2 }), [candidate(7)]);

  const restored = AreaDamageSystem.restore(uninterrupted.serialize());
  const candidates = [candidate(7), candidate(2)];
  assert.deepEqual(
    restored.resolve(effect({ damage: 9, tick: 21 }), candidates),
    uninterrupted.resolve(effect({ damage: 9, tick: 21 }), candidates),
  );
  assert.equal(restored.serialize(), uninterrupted.serialize());
});

test("area-damage: unreachable effect-ID jumps reject instead of forging exhaustion", () => {
  const initial = new AreaDamageSystem();
  initial.add(1, 10);
  const nearExhaustion = JSON.parse(initial.serialize());
  nearExhaustion.nextEffectId = Number.MAX_SAFE_INTEGER - 1;
  assert.throws(
    () => AreaDamageSystem.restore(JSON.stringify(nearExhaustion)),
    /lineage|contiguous/u,
  );
  assert.equal(initial.nextEffectId, 1);
});

test("area-damage: malformed snapshots are rejected", () => {
  const area = new AreaDamageSystem();
  const valid = JSON.parse(area.serialize());
  const invalid = [
    "no",
    "null",
    "{}",
    JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({ ...valid, nextEffectId: 0 }),
    JSON.stringify({
      ...valid,
      nextEffectId: Number.MAX_SAFE_INTEGER + 1,
    }),
    JSON.stringify({ ...valid, surprise: true }),
    JSON.stringify({ ...valid, damage: {} }),
  ];
  for (const snapshot of invalid) {
    assert.throws(() => AreaDamageSystem.restore(snapshot));
  }
  assert.throws(() => AreaDamageSystem.restore({}), /must be a string/);
});
