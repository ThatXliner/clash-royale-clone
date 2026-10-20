import assert from "node:assert/strict";
import test from "node:test";

import {
  BattleTowerCombat,
  MAX_BATTLE_TOWER_STEP_TICKS,
} from "../src/sim/battle-towers.js";

function unit(id, side, overrides = {}) {
  return {
    cadenceTicks: 60,
    damage: 10,
    delivery: "melee",
    deployTicks: 0,
    firstHitTicks: 0,
    id,
    layer: "ground",
    maxHealth: 1_000,
    position: side === "north" ? { x: 3_500, y: 7_500 } : { x: 3_500, y: 24_500 },
    projectileSpeed: null,
    radius: 0,
    reach: 0,
    side,
    sightRange: 10_000,
    targetMode: "buildings",
    ...overrides,
  };
}

function battle(units = [], initialWindupTicks = { central: 0, lane: 0 }) {
  return new BattleTowerCombat({ initialWindupTicks, units });
}

function tower(state, id) {
  return state.towers.find((entry) => entry.id === id);
}

function liveUnit(state, id) {
  return state.units.find((entry) => entry.id === id);
}

test("battle tower kernel: one state owns exact bidirectional HP and preview work never leaks", () => {
  const kernel = battle([
    unit(1, "north"),
    unit(2, "south", {
      damage: 0,
      firstHitTicks: 999,
      position: { x: 3_500, y: 7_500 },
      targetMode: "none",
    }),
  ]);
  const events = kernel.step(0);
  assert.equal(kernel.state.tick, 1);
  assert.equal(kernel.state.units.length, 2);
  assert.equal(kernel.state.towers.length, 6);
  assert.equal(tower(kernel.state, "south:lane:west").hitpoints, 3_042);
  assert.equal(liveUnit(kernel.state, 1).hitpoints, 891);
  assert.equal(liveUnit(kernel.state, 2).hitpoints, 1_000,
    "the south tower must ignore its closer friendly unit");
  assert.equal(events.filter(({ type, sourceUnitId }) =>
    type === "external-structure-contact" && sourceUnitId === 1).length, 1);
  assert.equal(events.filter(({ type, targetUnitId }) =>
    type === "external-unit-contact" && targetUnitId === 1).length, 1);
  assert.equal(kernel.replay.filter(({ type, sourceUnitId }) =>
    type === "external-structure-contact" && sourceUnitId === 1).length, 1,
  "the discarded preview must not duplicate its contact in replay");
  assert.deepEqual(kernel.replay.filter(({ type }) => type === "spawn")
    .map(({ id }) => id), [1, 2]);
  assert.ok(Object.isFrozen(kernel.state.units));
  assert.ok(Object.isFrozen(kernel.state.towers));
});

test("battle tower kernel: hostile layer targeting and friendly filtering are side-correct", () => {
  const kernel = battle([
    unit(10, "north", {
      damage: 0,
      firstHitTicks: 999,
      layer: "air",
      position: { x: 3_500, y: 8_000 },
      targetMode: "none",
    }),
    unit(11, "south", {
      damage: 0,
      firstHitTicks: 999,
      position: { x: 3_500, y: 7_500 },
      targetMode: "none",
    }),
    unit(12, "north", {
      damage: 7,
      position: { x: 14_500, y: 7_500 },
      targetMode: "buildings",
    }),
  ]);
  const events = kernel.step(0);
  assert.ok(events.some(({ sourceId, targetUnitId, type }) =>
    type === "tower-projectile-launch" && sourceId === "south:lane:west" &&
    targetUnitId === 10));
  assert.equal(events.some(({ targetUnitId, type }) =>
    type === "tower-projectile-launch" && targetUnitId === 11), false);
  assert.equal(liveUnit(kernel.state, 10).hitpoints, 891);
  assert.equal(liveUnit(kernel.state, 11).hitpoints, 1_000);
  assert.equal(tower(kernel.state, "south:lane:east").hitpoints, 3_045);
  assert.equal(tower(kernel.state, "north:lane:east").hitpoints, 3_052,
    "a unit must never attack its friendly tower structure");
});

test("battle tower kernel: lane death activates central, suppresses the dead lane, and shoots legally", () => {
  const kernel = battle([
    unit(20, "north", { damage: 3_052 }),
    unit(21, "north", {
      damage: 0,
      firstHitTicks: 999,
      position: { x: 9_000, y: 3_000 },
      targetMode: "none",
    }),
  ]);
  const events = kernel.step(0);
  assert.equal(tower(kernel.state, "south:lane:west").hitpoints, 0);
  assert.deepEqual(kernel.state.activationHistory.south, {
    cause: "friendly-lane-destroyed",
    tick: 0,
  });
  assert.ok(events.some(({ towerId, type }) =>
    type === "tower-activated" && towerId === "south:central"));
  assert.equal(events.some(({ sourceId, type }) =>
    type === "tower-projectile-launch" && sourceId === "south:lane:west"), false);
  assert.ok(events.some(({ sourceId, targetUnitId, type }) =>
    type === "tower-projectile-launch" && sourceId === "south:central" &&
    targetUnitId === 21));
  assert.equal(liveUnit(kernel.state, 20).hitpoints, 1_000);
  assert.equal(liveUnit(kernel.state, 21).hitpoints, 782,
    "the newly active central and surviving east lane both have legal range");
});

test("battle tower kernel: direct central activation and simultaneous lethal windows are exact", () => {
  const direct = battle([
    unit(30, "north", {
      damage: 1,
      maxHealth: 109,
      position: { x: 9_000, y: 3_000 },
    }),
  ]);
  const directEvents = direct.step(0);
  assert.deepEqual(direct.state.activationHistory.south, { cause: "damaged", tick: 0 });
  assert.equal(tower(direct.state, "south:central").hitpoints, 4_823);
  assert.equal(liveUnit(direct.state, 30).hitpoints, 0);
  assert.ok(directEvents.some(({ targetId, type }) => type === "death" && targetId === 30));

  const suppressed = battle([
    unit(31, "north", { damage: 3_052, maxHealth: 109 }),
  ]);
  const suppressedEvents = suppressed.step(0);
  assert.equal(tower(suppressed.state, "south:lane:west").hitpoints, 0);
  assert.equal(liveUnit(suppressed.state, 31).hitpoints, 109);
  assert.equal(suppressedEvents.some(({ sourceId, type }) =>
    type === "tower-projectile-launch" && sourceId === "south:lane:west"), false);

  const trade = battle([
    unit(32, "north", { damage: 10, maxHealth: 109 }),
  ]);
  trade.step(0);
  assert.equal(tower(trade.state, "south:lane:west").hitpoints, 3_042);
  assert.equal(liveUnit(trade.state, 32).hitpoints, 0,
    "a live-at-start unit attack and the tower response share the boundary");
});

test("battle tower kernel: a due scheduled unit attacks and is targetable on its first boundary", () => {
  const kernel = battle([], { central: 999, lane: 0 });
  kernel.scheduleSpawn({ ...unit(40, "north", { damage: 13 }), tick: 2 });
  kernel.stepMany(2);
  assert.equal(kernel.state.units.length, 0);
  assert.equal(kernel.state.pendingSpawns.length, 1);
  const events = kernel.step(2);
  assert.equal(kernel.state.pendingSpawns.length, 0);
  assert.equal(liveUnit(kernel.state, 40).hitpoints, 891);
  assert.equal(tower(kernel.state, "south:lane:west").hitpoints, 3_039);
  assert.equal(events.filter(({ id, type }) => type === "spawn" && id === 40).length, 1);
  assert.equal(events.filter(({ sourceUnitId, type }) =>
    type === "external-structure-contact" && sourceUnitId === 40).length, 1);
  assert.equal(events.filter(({ targetUnitId, type }) =>
    type === "external-unit-contact" && targetUnitId === 40).length, 1);
});

test("battle tower kernel: sequential, chunked, and every live restore cut match events/state/bytes", () => {
  const configure = () => {
    const kernel = battle([
      unit(50, "north", { cadenceTicks: 4, damage: 17, maxHealth: 5_000 }),
      unit(51, "south", {
        cadenceTicks: 5,
        damage: 19,
        maxHealth: 5_000,
        position: { x: 14_500, y: 24_500 },
      }),
    ], { central: 3, lane: 1 });
    kernel.scheduleSpawn({ ...unit(52, "north", {
      cadenceTicks: 6,
      damage: 11,
      maxHealth: 3_000,
      position: { x: 14_500, y: 7_500 },
    }), tick: 3 });
    return kernel;
  };
  const ticks = 18;
  const sequential = configure();
  const snapshots = [sequential.serialize()];
  const perTick = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    perTick.push(sequential.step(tick));
    snapshots.push(sequential.serialize());
  }
  const chunked = configure();
  assert.deepEqual(chunked.stepMany(ticks), perTick.flat());
  assert.equal(chunked.serialize(), sequential.serialize());
  assert.deepEqual(chunked.state, sequential.state);
  assert.deepEqual(chunked.replay, sequential.replay);

  for (let cut = 0; cut <= ticks; cut += 1) {
    const restored = BattleTowerCombat.restore(snapshots[cut]);
    const continuation = restored.stepMany(ticks - cut);
    assert.deepEqual(continuation, perTick.slice(cut).flat(), `events at cut ${cut}`);
    assert.equal(restored.serialize(), sequential.serialize(), `bytes at cut ${cut}`);
    assert.deepEqual(restored.state, sequential.state, `state at cut ${cut}`);
    assert.deepEqual(restored.replay, sequential.replay, `replay at cut ${cut}`);
  }
});

test("battle tower kernel: structurally valid bounds and invalid commands reject atomically", () => {
  const kernel = battle([unit(60, "north")]);
  const bytes = kernel.serialize();
  const state = kernel.state;
  const replay = kernel.replay;
  for (const operation of [
    () => kernel.step(1),
    () => kernel.stepMany(MAX_BATTLE_TOWER_STEP_TICKS + 1),
    () => kernel.scheduleSpawn({ ...unit(61, "south"), tick: -1 }),
    () => kernel.spawn({ ...unit(Number.MAX_SAFE_INTEGER, "south"), tick: 0 }),
    () => kernel.updatePosition({ id: 60, position: { x: 1.5, y: 0 }, tick: 0 }),
  ]) {
    assert.throws(operation);
    assert.equal(kernel.serialize(), bytes);
    assert.deepEqual(kernel.state, state);
    assert.deepEqual(kernel.replay, replay);
  }
});
