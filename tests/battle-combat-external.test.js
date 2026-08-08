import test from "node:test";
import assert from "node:assert/strict";

import { BattleCombat } from "../src/sim/battle-combat.js";

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

function structure(id = 900, overrides = {}) {
  return {
    alive: true,
    id,
    kind: "structure",
    layer: "ground",
    position: { x: 500, y: 0 },
    radius: 100,
    side: "south",
    structureId: "south:lane:west",
    targetable: true,
    ...overrides,
  };
}

function boundary(tick, overrides = {}) {
  return { externalHits: [], externalProjectiles: [], structures: [], tick, ...overrides };
}

function canonical(value) {
  return Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value !== null && typeof value === "object"
      ? `{${Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
      : JSON.stringify(value);
}

test("battle combat external: building-only units attack external structures with canonical contacts", () => {
  const combat = new BattleCombat({ units: [unit(1, "north", {
    damage: 37, reach: 500, targetMode: "buildings",
  })] });
  const events = combat.stepBoundary(boundary(0, { structures: [structure()] }));
  assert.deepEqual(events.filter(({ type }) => type.startsWith("external-structure")), [
    {
      attackSequence: 1, contactTick: 0, damage: 37, delivery: "melee", sourceUnitId: 1,
      structureId: "south:lane:west", tick: 0, type: "external-structure-attack",
    },
    {
      attackSequence: 1, contactTick: 0, damage: 37, delivery: "melee", sourceUnitId: 1,
      structureId: "south:lane:west", tick: 0, type: "external-structure-contact",
    },
  ]);
  assert.equal(combat.state.units[0].targetId, 900);
});

test("battle combat external: projectile contacts use launch geometry and current boundary liveness", () => {
  const combat = new BattleCombat({ units: [unit(1, "north", {
    damage: 29, delivery: "projectile", position: { x: 0, y: 0 },
    projectileSpeed: 200, reach: 1_000, targetMode: "buildings",
  })] });
  const target = structure(900, { position: { x: 1_000, y: 0 } });
  const launch = combat.stepBoundary(boundary(0, { structures: [target] }));
  assert.equal(launch.find(({ type }) => type === "external-structure-attack").contactTick, 5);
  assert.equal(launch.find(({ type }) => type === "projectile-launch")
    .projectile.attackSequence, 1);
  const restored = BattleCombat.restore(combat.serialize());
  for (let tick = 1; tick < 5; tick += 1) {
    combat.stepBoundary(boundary(tick, { structures: [target] }));
    restored.stepBoundary(boundary(tick, { structures: [target] }));
  }
  const contact = combat.stepBoundary(boundary(5, { structures: [target] }))
    .find(({ type }) => type === "external-structure-contact");
  const restoredContact = restored.stepBoundary(boundary(5, { structures: [target] }))
    .find(({ type }) => type === "external-structure-contact");
  assert.deepEqual(contact, {
    attackSequence: 1, contactTick: 5, damage: 29, delivery: "projectile", projectileId: 1,
    sourceUnitId: 1, structureId: "south:lane:west", tick: 5,
    type: "external-structure-contact",
  });
  assert.deepEqual(restoredContact, contact);
  assert.equal(restored.serialize(), combat.serialize());
});

test("battle combat external: ingress shares the internal simultaneous damage/death window", () => {
  const combat = new BattleCombat({ units: [
    unit(1, "north", { damage: 100 }),
    unit(2, "south", { damage: 0, firstHitTicks: 99 }),
  ] });
  const events = combat.stepBoundary(boundary(0, {
    externalHits: [{ damage: 100, delivery: "melee", sourceId: "south:central", targetUnitId: 1 }],
    externalProjectiles: [{ damage: 1, projectileId: 77, sourceId: "south:lane:west", targetUnitId: 2 }],
  }));
  assert.deepEqual(events.filter(({ type }) => type === "death").map(({ targetId }) => targetId), [1, 2]);
  assert.deepEqual(combat.state.units.map(({ id, hitpoints }) => [id, hitpoints]), [[1, 0], [2, 0]]);
  assert.ok(events.some(({ type, externalSourceId, targetId }) =>
    type === "damage" && externalSourceId === "south:central" && targetId === 1));
  assert.ok(events.some(({ type, externalProjectileId, targetId }) =>
    type === "damage" && externalProjectileId === 77 && targetId === 2));
});

test("battle combat external: duplicate ingress provenance rejects but distinct sources trade", () => {
  const duplicate = new BattleCombat({ units: [
    unit(1, "north", { damage: 0, maxHealth: 100, targetMode: "none" }),
  ] });
  const before = duplicate.serialize();
  assert.throws(() => duplicate.stepBoundary(boundary(0, { externalHits: [
    { damage: 20, delivery: "melee", sourceId: "south:central", targetUnitId: 1 },
    { damage: 30, delivery: "melee", sourceId: "south:central", targetUnitId: 1 },
  ] })), /identities must be unique/u);
  assert.equal(duplicate.serialize(), before);
  assert.equal(duplicate.state.units[0].hitpoints, 100);

  const distinct = new BattleCombat({ units: [
    unit(1, "north", { damage: 0, maxHealth: 100, targetMode: "none" }),
  ] });
  distinct.stepBoundary(boundary(0, { externalHits: [
    { damage: 20, delivery: "melee", sourceId: "south:central", targetUnitId: 1 },
    { damage: 30, delivery: "melee", sourceId: "south:lane:west", targetUnitId: 1 },
  ] }));
  assert.equal(distinct.state.units[0].hitpoints, 50);
  assert.deepEqual(distinct.replay.filter(({ type }) => type === "external-unit-contact")
    .map(({ sourceId }) => sourceId), ["south:central", "south:lane:west"]);

  const raw = JSON.parse(before);
  raw.history.push({
    command: boundary(0, { externalHits: [
      { damage: 20, delivery: "melee", sourceId: "south:central", targetUnitId: 1 },
      { damage: 30, delivery: "melee", sourceId: "south:central", targetUnitId: 1 },
    ] }),
    type: "boundary",
  });
  assert.throws(() => BattleCombat.restore(canonical(raw)), /identities must be unique/u);
});

test("battle combat external: structure side identity is immutable through projectile flight and restore", () => {
  const combat = new BattleCombat({ units: [unit(1, "north", {
    damage: 9, delivery: "projectile", projectileSpeed: 200, reach: 1_000,
    targetMode: "buildings",
  })] });
  const south = structure(900, { position: { x: 1_000, y: 0 } });
  combat.stepBoundary(boundary(0, { structures: [south] }));
  const bytes = combat.serialize();
  assert.throws(() => combat.stepBoundary(boundary(1, { structures: [
    { ...south, side: "north" },
  ] })), /identity mapping/u);
  assert.equal(combat.serialize(), bytes);

  const restored = BattleCombat.restore(bytes);
  assert.throws(() => restored.stepBoundary(boundary(1, { structures: [
    { ...south, side: "north" },
  ] })), /identity mapping/u);
  assert.equal(restored.serialize(), bytes);

  const raw = JSON.parse(bytes);
  raw.history.push({
    command: boundary(1, { structures: [{ ...south, side: "north" }] }),
    type: "boundary",
  });
  assert.throws(() => BattleCombat.restore(canonical(raw)), /identity mapping/u);
});

test("battle combat external: observed structure IDs remain reserved after omission and restore", () => {
  const combat = new BattleCombat();
  combat.stepBoundary(boundary(0, { structures: [structure(900)] }));
  combat.stepBoundary(boundary(1));
  const bytes = combat.serialize();
  const replay = combat.replay;
  assert.throws(() => combat.spawn({ ...unit(900, "north"), tick: 2 }), /externally reserved/u);
  assert.throws(() => combat.scheduleSpawn({ ...unit(900, "north"), tick: 3 }),
    /externally reserved/u);
  assert.equal(combat.serialize(), bytes);
  assert.deepEqual(combat.replay, replay);

  const restored = BattleCombat.restore(bytes);
  assert.throws(() => restored.spawn({ ...unit(900, "north"), tick: 2 }),
    /externally reserved/u);
  assert.throws(() => restored.scheduleSpawn({ ...unit(900, "north"), tick: 3 }),
    /externally reserved/u);
  assert.equal(restored.serialize(), bytes);

  const spawnForgery = JSON.parse(bytes);
  spawnForgery.history.push({ command: { ...unit(900, "north"), tick: 2 }, type: "spawn" });
  assert.throws(() => BattleCombat.restore(canonical(spawnForgery)), /externally reserved/u);
  const scheduleForgery = JSON.parse(bytes);
  scheduleForgery.history.push({
    command: { ...unit(900, "north"), tick: 3 }, type: "schedule-spawn",
  });
  assert.throws(() => BattleCombat.restore(canonical(scheduleForgery)), /externally reserved/u);
});

test("battle combat external: live and scheduled unit IDs permanently exclude structures", () => {
  const live = new BattleCombat({ units: [unit(900, "north", { targetMode: "none" })] });
  const liveBytes = live.serialize();
  assert.throws(() => live.stepBoundary(boundary(0, { structures: [structure(900)] })),
    /collides with a unit ID/u);
  assert.equal(live.serialize(), liveBytes);

  const scheduled = new BattleCombat();
  scheduled.scheduleSpawn({ ...unit(900, "north", { targetMode: "none" }), tick: 2 });
  const scheduledBytes = scheduled.serialize();
  assert.throws(() => scheduled.stepBoundary(boundary(0, { structures: [structure(900)] })),
    /collides with a unit ID/u);
  assert.equal(scheduled.serialize(), scheduledBytes);

  const reverseForgery = JSON.parse(liveBytes);
  reverseForgery.history.push({
    command: boundary(0, { structures: [structure(900)] }), type: "boundary",
  });
  assert.throws(() => BattleCombat.restore(canonical(reverseForgery)),
    /collides with a unit ID/u);
});

test("battle combat external: canonical sorting, replay, and restore continuation are identical", () => {
  const configure = (reversed) => {
    const combat = new BattleCombat({ units: [
      unit(1, "north", { damage: 0, targetMode: "none" }),
      unit(2, "south", { damage: 0, targetMode: "none" }),
    ] });
    const hits = [
      { damage: 3, delivery: "melee", sourceId: "z", targetUnitId: 1 },
      { damage: 4, delivery: "melee", sourceId: "a", targetUnitId: 2 },
    ];
    combat.stepBoundary(boundary(0, { externalHits: reversed ? hits.reverse() : hits }));
    return combat;
  };
  const left = configure(false);
  const right = configure(true);
  assert.equal(left.serialize(), right.serialize());
  assert.deepEqual(left.replay, right.replay);
  const restored = BattleCombat.restore(left.serialize());
  left.stepBoundary(boundary(1, {
    externalProjectiles: [{ damage: 5, projectileId: 8, sourceId: "tower", targetUnitId: 1 }],
  }));
  restored.stepBoundary(boundary(1, {
    externalProjectiles: [{ damage: 5, projectileId: 8, sourceId: "tower", targetUnitId: 1 }],
  }));
  assert.equal(restored.serialize(), left.serialize());
  assert.deepEqual(restored.state, left.state);
  assert.deepEqual(restored.replay, left.replay);
});

test("battle combat external: hostile boundaries and duplicate projectile ingress reject atomically", () => {
  const combat = new BattleCombat({ units: [unit(1, "north", { damage: 0 })] });
  const assertAtomic = (command, pattern) => {
    const bytes = combat.serialize();
    const replay = combat.replay;
    assert.throws(() => combat.stepBoundary(command), pattern);
    assert.equal(combat.serialize(), bytes);
    assert.deepEqual(combat.replay, replay);
  };
  assertAtomic(boundary(1), /current tick/u);
  assertAtomic(boundary(0, { structures: [structure(1)] }), /collides/u);
  assertAtomic(boundary(0, { structures: [structure(900, { kind: "troop" })] }), /kind/u);
  assertAtomic(boundary(0, { externalProjectiles: [
    { damage: 1, projectileId: 4, sourceId: "tower", targetUnitId: 1 },
    { damage: 1, projectileId: 4, sourceId: "tower", targetUnitId: 1 },
  ] }), /unique/u);
  combat.stepBoundary(boundary(0, { externalProjectiles: [
    { damage: 1, projectileId: 4, sourceId: "tower", targetUnitId: 1 },
  ] }));
  combat.stepBoundary(boundary(1, { structures: [structure(900)] }));
  assertAtomic(boundary(2, { structures: [structure(900, {
    structureId: "south:lane:east",
  })] }), /identity mapping/u);
  assertAtomic(boundary(1, { externalProjectiles: [
    { damage: 1, projectileId: 4, sourceId: "tower", targetUnitId: 1 },
  ] }), /current tick/u);
  assertAtomic(boundary(2, { externalProjectiles: [
    { damage: 1, projectileId: 4, sourceId: "tower", targetUnitId: 1 },
  ] }), /already contacted/u);
  const accessor = boundary(2);
  Object.defineProperty(accessor, "structures", { enumerable: true, get() { throw new Error("no"); } });
  assertAtomic(accessor, /data property/u);
});
