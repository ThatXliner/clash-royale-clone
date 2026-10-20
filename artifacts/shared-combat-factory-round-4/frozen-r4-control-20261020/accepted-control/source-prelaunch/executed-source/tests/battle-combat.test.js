import test from "node:test";
import assert from "node:assert/strict";

import {
  BattleCombat,
  MAX_BATTLE_COMBAT_STEP_TICKS,
} from "../src/sim/battle-combat.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function unit(id, side, overrides = {}) {
  return {
    cadenceTicks: 60,
    damage: 10,
    delivery: "melee",
    deployTicks: 0,
    firstHitTicks: 0,
    id,
    layer: "ground",
    maxHealth: 100,
    position: { x: side === "north" ? 0 : 1_000, y: 0 },
    projectileSpeed: null,
    radius: 100,
    reach: 800,
    side,
    sightRange: 5_000,
    targetMode: "ground",
    ...overrides,
  };
}

function spawn(combat, spec, tick = combat.state.tick) {
  return combat.spawn({ ...spec, tick });
}

test("battle combat: dynamic units acquire by distance/ID, retain targets, and obey explicit positions", () => {
  const combat = new BattleCombat();
  spawn(combat, unit(10, "north", { damage: 0, position: { x: 0, y: 0 }, reach: 0 }));
  spawn(combat, unit(3, "south", { damage: 0, position: { x: 1_000, y: 0 } }));
  spawn(combat, unit(2, "south", { damage: 0, position: { x: -1_000, y: 0 } }));

  const first = combat.step(0);
  assert.deepEqual(
    first.filter(({ type }) => type === "target").map(({ id, targetId }) => [id, targetId]),
    [[2, 10], [3, 10], [10, 2]],
  );
  assert.equal(combat.state.units.find(({ id }) => id === 10).targetId, 2);

  combat.updatePosition({ id: 3, position: { x: 200, y: 0 }, tick: 1 });
  combat.step(1);
  assert.equal(combat.state.units.find(({ id }) => id === 10).targetId, 2,
    "a sight-valid retained target wins over a newly closer target");

  combat.updatePosition({ id: 2, position: { x: -6_000, y: 0 }, tick: 2 });
  const reacquired = combat.step(2);
  assert.ok(reacquired.some((event) => event.type === "target" &&
    event.id === 10 && event.fromTargetId === 2 && event.targetId === 3));
  assert.equal(combat.state.units.find(({ id }) => id === 10).targetId, 3);
  assert.ok(Object.isFrozen(combat.state));
  assert.ok(Object.isFrozen(combat.state.units));
  assert.ok(Object.isFrozen(combat.replay));
});

test("battle combat: deployment, first-hit, cadence, and mutual lethal damage share exact windows", () => {
  const delayed = new BattleCombat();
  spawn(delayed, unit(1, "north", {
    cadenceTicks: 3, damage: 7, deployTicks: 2, firstHitTicks: 1,
  }));
  spawn(delayed, unit(2, "south", {
    cadenceTicks: 3, damage: 0, firstHitTicks: 99,
  }));
  assert.equal(delayed.step(0).some(({ type }) => type === "damage"), false);
  assert.equal(delayed.step(1).some(({ type }) => type === "damage"), false);
  assert.equal(delayed.step(2).some(({ type }) => type === "damage"), false);
  assert.equal(delayed.step(3).filter(({ type }) => type === "damage").length, 1);
  assert.equal(delayed.stepMany(2).some(({ type }) => type === "damage"), false);
  assert.equal(delayed.step(6).filter(({ type }) => type === "damage").length, 1);

  const trade = new BattleCombat({ units: [
    unit(8, "north", { damage: 100, maxHealth: 100 }),
    unit(4, "south", { damage: 100, maxHealth: 100 }),
  ] });
  const events = trade.step(0);
  assert.deepEqual(events.filter(({ type }) => type === "damage")
    .map(({ attackerId, targetId }) => [attackerId, targetId]), [[4, 8], [8, 4]]);
  assert.deepEqual(events.filter(({ type }) => type === "death")
    .map(({ targetId }) => targetId), [4, 8]);
  assert.deepEqual(trade.state.units.map(({ id, alive, hitpoints }) =>
    [id, alive, hitpoints]), [[4, false, 0], [8, false, 0]]);
});

test("battle combat: projectile launch geometry is integer and dead targets fizzle in flight", () => {
  const combat = new BattleCombat();
  spawn(combat, unit(1, "north", {
    cadenceTicks: 100, damage: 40, delivery: "projectile",
    position: { x: 0, y: 0 }, projectileSpeed: 300,
  }));
  spawn(combat, unit(2, "south", {
    damage: 0, firstHitTicks: 100, position: { x: 1_000, y: 0 },
  }));
  const launched = combat.step(0).find(({ type }) => type === "projectile-launch");
  assert.equal(launched.projectile.impactTick, 3);
  assert.deepEqual(launched.projectile.targetPosition, { x: 1_000, y: 0 });

  combat.scheduleSpawn({
    ...unit(3, "north", {
      damage: 100, position: { x: 1_000, y: 0 }, reach: 0,
    }),
    tick: 1,
  });
  const lethal = combat.step(1);
  assert.ok(lethal.some(({ type, targetId }) => type === "death" && targetId === 2));
  combat.step(2);
  const impact = combat.step(3).find(({ type }) => type === "projectile-impact");
  assert.deepEqual(
    { projectileId: impact.projectileId, status: impact.status, targetId: impact.targetId },
    { projectileId: 1, status: "target_dead", targetId: 2 },
  );
  assert.equal(combat.replay.filter(({ type, targetId }) =>
    type === "death" && targetId === 2).length, 1,
  "the in-flight projectile must not emit a second death");
});

test("battle combat: same-tick projectile contacts and melee attacks resolve simultaneously", () => {
  const combat = new BattleCombat({ units: [
    unit(1, "north", {
      damage: 100, delivery: "projectile", position: { x: 0, y: 0 },
      projectileSpeed: 1_000,
    }),
    unit(2, "south", { damage: 100, position: { x: 900, y: 0 } }),
  ] });
  const tick0 = combat.step(0);
  assert.equal(tick0.find(({ type }) => type === "projectile-launch").projectile.impactTick, 1);
  assert.ok(tick0.some(({ type, targetId }) => type === "death" && targetId === 1));
  const tick1 = combat.step(1);
  assert.equal(tick1.find(({ type }) => type === "projectile-impact").status, "contact");
  assert.ok(tick1.some(({ type, targetId }) => type === "death" && targetId === 2));
});

test("battle combat: scheduled post-zero spawns, chunking, replay, and every restore cut are identical", () => {
  const configure = () => {
    const combat = new BattleCombat();
    combat.scheduleSpawn({ ...unit(11, "north", { damage: 13 }), tick: 2 });
    combat.scheduleSpawn({ ...unit(7, "south", { damage: 11 }), tick: 2 });
    combat.scheduleSpawn({ ...unit(15, "south", {
      damage: 5, delivery: "projectile", projectileSpeed: 250,
      position: { x: 2_000, y: 0 },
    }), tick: 5 });
    return combat;
  };
  const oneByOne = configure();
  const snapshots = [oneByOne.serialize()];
  const totalTicks = 240;
  for (let tick = 0; tick < totalTicks; tick += 1) {
    oneByOne.step(tick);
    snapshots.push(oneByOne.serialize());
  }
  const chunked = configure();
  chunked.stepMany(totalTicks);
  assert.equal(chunked.serialize(), oneByOne.serialize());
  assert.deepEqual(chunked.state, oneByOne.state);
  assert.deepEqual(chunked.replay, oneByOne.replay);

  for (let cut = 0; cut < snapshots.length; cut += 1) {
    const restored = BattleCombat.restore(snapshots[cut]);
    restored.stepMany(totalTicks - cut);
    assert.equal(restored.serialize(), oneByOne.serialize(), `serialized cut ${cut}`);
    assert.deepEqual(restored.state, oneByOne.state, `state cut ${cut}`);
    assert.deepEqual(restored.replay, oneByOne.replay, `replay cut ${cut}`);
  }
});

test("battle combat: hostile commands and snapshots reject atomically without invoking accessors", () => {
  const combat = new BattleCombat();
  spawn(combat, unit(1, "north"));
  const before = combat.serialize();
  const getter = {};
  Object.defineProperty(getter, "tick", {
    enumerable: true,
    get() { throw new Error("must not run"); },
  });
  assert.throws(() => combat.spawn(getter), /data property|invalid shape/u);
  assert.equal(combat.serialize(), before);
  assert.throws(() => combat.updatePosition({
    id: 1, position: { x: 0.5, y: 0 }, tick: 0,
  }));
  assert.equal(combat.serialize(), before);
  assert.throws(() => combat.scheduleSpawn({ ...unit(1, "south"), tick: 1 }),
    /already exists/u);
  assert.equal(combat.serialize(), before);
  assert.throws(() => combat.stepMany(MAX_BATTLE_COMBAT_STEP_TICKS + 1));
  assert.equal(combat.serialize(), before);

  const valid = combat.serialize();
  const raw = JSON.parse(valid);
  assert.equal(raw.version, 2);
  assert.deepEqual(Object.keys(raw).sort(),
    ["history", "setup", "structureSets", "transcript", "version"]);
  const legacy = canonical({ history: raw.history, setup: raw.setup, version: 1 });
  const legacyRestored = BattleCombat.restore(legacy);
  assert.deepEqual(legacyRestored.state, combat.state);
  assert.deepEqual(legacyRestored.replay, combat.replay);
  assert.equal(BattleCombat.continuationEquivalent(legacyRestored, combat), true);
  assert.equal(BattleCombat.continuationEquivalent(combat.fork(), combat), true);
  assert.equal(JSON.parse(legacyRestored.serialize()).version, 2);
  const downgraded = structuredClone(raw);
  downgraded.version = 1;
  assert.throws(() => BattleCombat.restore(canonical(downgraded)), /invalid shape/u);
  const upgraded = JSON.parse(legacy);
  upgraded.version = 2;
  assert.throws(() => BattleCombat.restore(canonical(upgraded)), /invalid shape/u);
  const mixed = JSON.parse(legacy);
  mixed.transcript = [];
  assert.throws(() => BattleCombat.restore(canonical(mixed)), /invalid shape/u);
  raw.history.push({ tick: 999, type: "step" });
  assert.throws(() => BattleCombat.restore(JSON.stringify(raw)));
  assert.throws(() => BattleCombat.restore(` ${valid}`), /canonical/u);
  assert.throws(() => BattleCombat.restore(valid.replace('"version":2', '"version":99')));
  assert.throws(() => BattleCombat.restore("x".repeat(1_048_577)), /byte bound/u);
  const currentRestored = BattleCombat.restore(valid);
  assert.equal(currentRestored.serialize(), valid);
  assert.equal(BattleCombat.continuationEquivalent(currentRestored, combat), true);
});

test("battle combat: parsed snapshots are iteratively bounded before canonicalization", () => {
  const controlled = (serialized, pattern) => {
    let error;
    try { BattleCombat.restore(serialized); } catch (caught) { error = caught; }
    assert.ok(error instanceof TypeError || error instanceof RangeError);
    assert.match(error.message, pattern);
    assert.doesNotMatch(error.message, /call stack|recursion/iu);
  };
  const deep = `${'{"x":'.repeat(20_000)}null${"}".repeat(20_000)}`;
  controlled(deep, /depth bound/u);
  const atNodeLimit = `[${Array.from({ length: 199_999 }, () => "null").join(",")}]`;
  controlled(atNodeLimit, /plain|string-keyed|invalid shape/u);
  const aboveNodeLimit = `[${Array.from({ length: 200_000 }, () => "null").join(",")}]`;
  controlled(aboveNodeLimit, /node bound/u);
  const aboveArrayLimit = `[${Array.from({ length: 200_001 }, () => "null").join(",")}]`;
  controlled(aboveArrayLimit, /array length bound/u);
  const tooManyContainers = `[${Array.from({ length: 100_001 }, () => "[]").join(",")}]`;
  controlled(tooManyContainers, /container bound/u);
  const tooManyKeys = Object.fromEntries(Array.from({ length: 1_025 }, (_, index) => [`k${index}`, null]));
  controlled(canonical(tooManyKeys), /object key bound/u);
  controlled(JSON.stringify("x".repeat(524_289)), /string length bound/u);
  controlled("9007199254740992", /safe integers/u);
  controlled(JSON.stringify("\uD800"), /Unicode scalar/u);
});

test("battle combat: invalid target modes and delivery combinations fail closed", () => {
  assert.throws(() => new BattleCombat({ units: [unit(1, "north", {
    targetMode: "water",
  })] }));
  assert.throws(() => new BattleCombat({ units: [unit(1, "north", {
    projectileSpeed: 3,
  })] }));
  assert.throws(() => new BattleCombat({ units: [unit(1, "north", {
    delivery: "projectile", projectileSpeed: null,
  })] }));
  assert.throws(() => new BattleCombat({ units: [unit(1, "north"), unit(1, "south")] }),
    /unique/u);

  const passive = new BattleCombat({ units: [
    unit(1, "north", { targetMode: "buildings" }),
    unit(2, "south", { targetMode: "none" }),
  ] });
  assert.equal(passive.step(0).some(({ type }) => type === "attack"), false);
});

test("battle combat: an over-capacity deferred spawn boundary rejects without partial activation", () => {
  const combat = new BattleCombat();
  for (let id = 1; id <= 1_024; id += 1) {
    combat.scheduleSpawn({
      ...unit(id, id % 2 === 0 ? "north" : "south", {
        damage: 0, position: { x: id, y: 0 }, targetMode: "none",
      }),
      tick: 1,
    });
  }
  spawn(combat, unit(2_000, "north", { damage: 0, targetMode: "none" }));
  combat.step(0);
  const bytes = combat.serialize();
  const state = combat.state;
  const replay = combat.replay;
  assert.equal(state.units.length, 1);
  assert.equal(state.pendingSpawns.length, 1_024);

  assert.throws(() => combat.step(1), /due.*bound/u);
  assert.equal(combat.serialize(), bytes);
  assert.deepEqual(combat.state, state);
  assert.deepEqual(combat.replay, replay);
  assert.equal(combat.state.tick, 1);
  assert.equal(combat.state.pendingSpawns.length, 1_024);
});

test("battle combat: mixed invalid schedules and adjacent deferred capacity failures are atomic", () => {
  const combat = new BattleCombat();
  for (let id = 1; id <= 1_023; id += 1) {
    combat.scheduleSpawn({
      ...unit(id, "north", {
        damage: 0, position: { x: id, y: 0 }, targetMode: "none",
      }),
      tick: 1,
    });
  }
  combat.scheduleSpawn({
    ...unit(Number.MAX_SAFE_INTEGER, "south", {
      damage: 0, position: { x: 2_000, y: 0 }, targetMode: "none",
    }),
    tick: 2,
  });
  const beforeInvalid = combat.serialize();
  assert.throws(() => combat.scheduleSpawn({
    ...unit(4_000, "south", {
      delivery: "projectile", projectileSpeed: 0,
    }),
    tick: 1,
  }));
  assert.equal(combat.serialize(), beforeInvalid);
  assert.throws(() => combat.scheduleSpawn({
    ...unit(Number.MAX_SAFE_INTEGER + 1, "south"), tick: 1,
  }));
  assert.equal(combat.serialize(), beforeInvalid);

  spawn(combat, unit(2_000, "south", { damage: 0, targetMode: "none" }));
  combat.step(0);
  combat.step(1);
  assert.equal(combat.state.units.length, 1_024);
  assert.equal(combat.state.pendingSpawns.length, 1);
  const adjacentBytes = combat.serialize();
  const adjacentState = combat.state;
  const adjacentReplay = combat.replay;
  assert.throws(() => combat.step(2), /due.*bound/u);
  assert.equal(combat.serialize(), adjacentBytes);
  assert.deepEqual(combat.state, adjacentState);
  assert.deepEqual(combat.replay, adjacentReplay);
});
