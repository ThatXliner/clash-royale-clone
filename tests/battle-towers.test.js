import assert from "node:assert/strict";
import test from "node:test";

import { BattleCombat } from "../src/sim/battle-combat.js";
import {
  BattleTowerCombat,
  MAX_BATTLE_TOWER_STEP_TICKS,
} from "../src/sim/battle-towers.js";

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
    maxHealth: 300,
    position: side === "north" ? { x: 3_500, y: 24_500 } : { x: 3_500, y: 7_500 },
    projectileSpeed: null,
    radius: 0,
    reach: 0,
    side,
    sightRange: 10_000,
    targetMode: "buildings",
    ...overrides,
  };
}

const setup = (units = [], windups = { central: 0, lane: 0 }) => ({
  initialWindupTicks: windups,
  units,
});

function legacyCombatSnapshot(serialized) {
  const current = JSON.parse(serialized);
  assert.equal(current.version, 2);
  assert.deepEqual(current.transcript, []);
  return JSON.stringify({ history: current.history, setup: current.setup, version: 1 });
}

function legacyTowerSnapshot(serialized) {
  const current = JSON.parse(serialized);
  assert.equal(current.version, 2);
  current.combat = legacyCombatSnapshot(current.combat);
  current.version = 1;
  return JSON.stringify(current);
}

function tower(state, id) {
  return state.towers.find((entry) => entry.id === id);
}

test("battle towers: one boundary joins structure contact, tower shot, and authoritative unit damage", () => {
  const battle = new BattleTowerCombat(setup([
    unit(1, "north", { position: { x: 3_500, y: 7_500 } }),
    unit(2, "south", {
      damage: 0,
      firstHitTicks: 999,
      position: { x: 3_500, y: 8_000 },
      targetMode: "none",
    }),
  ]));
  const events = battle.step(0);

  assert.equal(tower(battle.state, "south:lane:west").hitpoints, 3_042);
  assert.equal(battle.state.units.find(({ id }) => id === 1).hitpoints, 191);
  assert.equal(battle.state.units.find(({ id }) => id === 2).hitpoints, 300,
    "a tower must not target its friendly candidate");
  const contact = events.find(({ type }) => type === "external-structure-contact");
  assert.deepEqual({
    attackSequence: contact.attackSequence,
    damage: contact.damage,
    sourceUnitId: contact.sourceUnitId,
    structureId: contact.structureId,
  }, {
    attackSequence: 1,
    damage: 10,
    sourceUnitId: 1,
    structureId: "south:lane:west",
  });
  const launch = events.find(({ type }) => type === "tower-projectile-launch");
  assert.deepEqual({
    attackSequence: launch.attackSequence,
    projectileId: launch.projectileId,
    sourceId: launch.sourceId,
    targetUnitId: launch.targetUnitId,
  }, {
    attackSequence: 1,
    projectileId: 1,
    sourceId: "south:lane:west",
    targetUnitId: 1,
  });
  const damage = events.find(({ type, targetId }) => type === "damage" && targetId === 1);
  assert.deepEqual({
    attackSequence: damage.attackSequence,
    projectileId: damage.projectileId,
    sourceId: damage.sourceId,
  }, {
    attackSequence: 1,
    projectileId: 1,
    sourceId: "south:lane:west",
  });
  assert.ok(Object.isFrozen(battle.state));
  assert.ok(Object.isFrozen(battle.replay));
});

test("battle towers: a same-boundary lethal structure hit suppresses that tower's shot", () => {
  const battle = new BattleTowerCombat(setup([
    unit(10, "north", {
      damage: 3_052,
      maxHealth: 109,
      position: { x: 3_500, y: 7_500 },
    }),
  ]));
  const events = battle.step(0);
  assert.equal(tower(battle.state, "south:lane:west").hitpoints, 0);
  assert.equal(battle.state.units[0].hitpoints, 109);
  assert.ok(events.some(({ type, towerId }) =>
    type === "tower-destroyed" && towerId === "south:lane:west"));
  assert.equal(events.some(({ type, towerId }) =>
    type === "tower-projectile-launch" && towerId === "south:lane:west"), false);
});

test("battle towers: central direct damage activates once before legal shooting", () => {
  const battle = new BattleTowerCombat(setup([
    unit(20, "north", {
      damage: 1,
      position: { x: 9_000, y: 3_000 },
    }),
  ]));
  const first = battle.step(0);
  assert.deepEqual(battle.state.activationHistory.south, { cause: "damaged", tick: 0 });
  assert.ok(first.some(({ type, towerId }) =>
    type === "tower-activated" && towerId === "south:central"));
  assert.ok(first.some(({ type, sourceId }) =>
    type === "tower-projectile-launch" && sourceId === "south:central"));
  battle.stepMany(60);
  assert.equal(battle.replay.filter(({ type, towerId }) =>
    type === "tower-activated" && towerId === "south:central").length, 1);
});

test("battle towers: unit projectiles use the arena tower footprint for contact travel", () => {
  const battle = new BattleTowerCombat(setup([
    unit(30, "north", {
      cadenceTicks: 100,
      damage: 50,
      delivery: "projectile",
      maxHealth: 1_000,
      position: { x: 3_500, y: 6_500 },
      projectileSpeed: 1_000,
      reach: 1_000,
    }),
  ], { central: 999, lane: 999 }));
  const launch = battle.step(0);
  assert.ok(launch.some(({ type }) => type === "external-structure-attack"));
  assert.ok(launch.some(({ type, projectileId, structureId }) =>
    type === "external-structure-contact" && projectileId === 1 &&
    structureId === "south:lane:west"));
  assert.equal(tower(battle.state, "south:lane:west").hitpoints, 3_002);
  const next = battle.step(1);
  assert.equal(next.some(({ type }) => type === "external-structure-contact"), false);
});

test("battle towers: scheduled boundary units participate and chunking/restore cuts are byte-identical", () => {
  const configure = () => {
    const battle = new BattleTowerCombat(setup([], { central: 5, lane: 2 }));
    battle.scheduleSpawn({ ...unit(41, "north", {
      damage: 7,
      maxHealth: 2_000,
      position: { x: 3_500, y: 7_500 },
    }), tick: 2 });
    battle.scheduleSpawn({ ...unit(42, "south", {
      damage: 5,
      maxHealth: 2_000,
      position: { x: 14_500, y: 24_500 },
    }), tick: 3 });
    return battle;
  };
  const direct = configure();
  const snapshots = [direct.serialize()];
  const ticks = 24;
  for (let tick = 0; tick < ticks; tick += 1) {
    direct.step(tick);
    snapshots.push(direct.serialize());
  }
  const chunked = configure();
  chunked.stepMany(ticks);
  assert.equal(chunked.serialize(), direct.serialize());
  assert.deepEqual(chunked.state, direct.state);
  assert.deepEqual(chunked.replay, direct.replay);

  for (let cut = 0; cut < snapshots.length; cut += 1) {
    const restored = BattleTowerCombat.restore(snapshots[cut]);
    restored.stepMany(ticks - cut);
    assert.equal(restored.serialize(), direct.serialize(), `bytes at cut ${cut}`);
    assert.deepEqual(restored.state, direct.state, `state at cut ${cut}`);
    assert.deepEqual(restored.replay, direct.replay, `replay at cut ${cut}`);
  }
});

test("battle towers: strict legacy combat and tower witnesses restore, continue, and upgrade", () => {
  const configure = () => new BattleTowerCombat(setup([
    unit(43, "north", { position: { x: 3_500, y: 7_500 } }),
    unit(44, "south", { position: { x: 14_500, y: 24_500 } }),
  ]));
  const expected = configure();
  const snapshots = [expected.serialize()];
  for (let tick = 0; tick < 8; tick += 1) {
    expected.step(tick);
    snapshots.push(expected.serialize());
  }

  for (let cut = 0; cut < snapshots.length; cut += 1) {
    const legacy = legacyTowerSnapshot(snapshots[cut]);
    const legacyRaw = JSON.parse(legacy);
    assert.equal(BattleCombat.restore(legacyRaw.combat).state.tick, cut);
    const restored = BattleTowerCombat.restore(legacy);
    assert.deepEqual(restored.state,
      BattleTowerCombat.restore(snapshots[cut]).state, `legacy state at cut ${cut}`);
    assert.deepEqual(restored.replay,
      BattleTowerCombat.restore(snapshots[cut]).replay, `legacy replay at cut ${cut}`);
    const upgraded = JSON.parse(restored.serialize());
    assert.equal(upgraded.version, 2);
    assert.equal(JSON.parse(upgraded.combat).version, 2);
    restored.stepMany(8 - cut);
    assert.equal(restored.serialize(), expected.serialize(), `continued bytes at cut ${cut}`);
  }

  const current = JSON.parse(snapshots.at(-1));
  const mixedLegacy = structuredClone(current);
  mixedLegacy.version = 1;
  assert.throws(() => BattleTowerCombat.restore(JSON.stringify(mixedLegacy)), /versions are mixed/u);

  const legacy = JSON.parse(legacyTowerSnapshot(snapshots.at(-1)));
  const mixedCurrent = structuredClone(legacy);
  mixedCurrent.version = 2;
  assert.throws(() => BattleTowerCombat.restore(JSON.stringify(mixedCurrent)), /versions are mixed/u);

  const divergentCombat = structuredClone(legacy);
  const combat = JSON.parse(divergentCombat.combat);
  combat.history.pop();
  divergentCombat.combat = JSON.stringify(combat);
  assert.throws(() => BattleTowerCombat.restore(JSON.stringify(divergentCombat)), /witnesses/u);

  const noncausalCombat = structuredClone(legacy);
  const noncausal = JSON.parse(noncausalCombat.combat);
  noncausal.history.at(-1).command.tick += 1;
  noncausalCombat.combat = canonical(noncausal);
  assert.throws(() => BattleTowerCombat.restore(JSON.stringify(noncausalCombat)),
    /current tick|noncausal/u);

  const alteredTowers = structuredClone(legacy);
  const towerWitness = JSON.parse(alteredTowers.towers);
  towerWitness.initialWindupTicks.lane += 1;
  alteredTowers.towers = canonical(towerWitness);
  assert.throws(() => BattleTowerCombat.restore(JSON.stringify(alteredTowers)), /witnesses/u);
});

test("battle towers: legacy admission preserves hidden structure and projectile identity reservations", () => {
  const empty = new BattleTowerCombat(setup([]));
  empty.step(0);
  const legacy = JSON.parse(legacyTowerSnapshot(empty.serialize()));
  const genuineCombat = JSON.parse(legacy.combat);
  const genuine = BattleCombat.restore(legacy.combat);

  for (const mutate of [
    (combat) => { combat.history[0] = { tick: 0, type: "step" }; },
    (combat) => { combat.history[0].command.structures = []; },
    (combat) => { combat.history[0].command.structures.pop(); },
  ]) {
    const forgedTower = structuredClone(legacy);
    const forgedCombat = structuredClone(genuineCombat);
    mutate(forgedCombat);
    forgedTower.combat = canonical(forgedCombat);
    const standalone = BattleCombat.restore(forgedTower.combat);
    assert.deepEqual(standalone.state, genuine.state,
      "forgery deliberately preserves the old public-state comparison");
    assert.deepEqual(standalone.replay, genuine.replay,
      "forgery deliberately preserves the old public-replay comparison");
    assert.equal(BattleCombat.continuationEquivalent(standalone, genuine), false);
    assert.throws(() => BattleTowerCombat.restore(canonical(forgedTower)), /witnesses/u);
  }

  const active = new BattleTowerCombat(setup([
    unit(45, "north", { position: { x: 3_500, y: 7_500 } }),
  ]));
  active.step(0);
  const currentTower = JSON.parse(active.serialize());
  const currentCombat = BattleCombat.restore(currentTower.combat);
  const legacyActive = JSON.parse(legacyTowerSnapshot(active.serialize()));
  const legacyCombat = BattleCombat.restore(legacyActive.combat);
  assert.equal(BattleCombat.continuationEquivalent(legacyCombat, currentCombat), true);

  const priorBoundary = JSON.parse(legacyActive.combat).history.at(-1).command;
  const remapped = structuredClone(priorBoundary);
  remapped.tick = 1;
  remapped.externalHits = [];
  remapped.externalProjectiles = [];
  remapped.structures[0].structureId = `${remapped.structures[0].structureId}:forged`;
  assert.throws(() => legacyCombat.stepBoundary(remapped), /mapping must remain stable/u);
  assert.throws(() => currentCombat.stepBoundary(remapped), /mapping must remain stable/u);

  assert.ok(priorBoundary.externalProjectiles.length > 0);
  const reusedProjectile = structuredClone(priorBoundary);
  reusedProjectile.tick = 1;
  reusedProjectile.externalHits = [];
  assert.throws(() => legacyCombat.stepBoundary(reusedProjectile), /already contacted/u);
  assert.throws(() => currentCombat.stepBoundary(reusedProjectile), /already contacted/u);

  const legacyContinuation = BattleTowerCombat.restore(canonical(legacyActive));
  const currentContinuation = BattleTowerCombat.restore(active.serialize());
  legacyContinuation.step(1);
  currentContinuation.step(1);
  assert.equal(legacyContinuation.serialize(), currentContinuation.serialize());
  assert.deepEqual(legacyContinuation.replay, currentContinuation.replay);
});

test("battle towers: amplified valid legacy continuation compares without a proof-string cap", () => {
  const units = Array.from({ length: 256 }, (_, index) => unit(index + 1,
    index % 2 === 1 ? "north" : "south", {
      cadenceTicks: 1,
      damage: 0,
      maxHealth: 1_000_000,
      position: { x: 9_000, y: 16_000 },
      reach: 10_000,
      targetMode: "ground",
    }));
  const current = new BattleTowerCombat(setup(units, { central: 999, lane: 999 }));
  current.stepMany(70);
  const currentBytes = current.serialize();
  const legacyBytes = legacyTowerSnapshot(currentBytes);
  const legacyCombat = JSON.parse(legacyBytes).combat;
  assert.equal(current.replay.length, 36_352);
  assert.equal(Buffer.byteLength(legacyCombat), 151_697);
  assert.equal(Buffer.byteLength(currentBytes), 3_074_446);
  assert.equal(Buffer.byteLength(legacyBytes), 3_074_407);

  const restored = BattleTowerCombat.restore(legacyBytes);
  assert.equal(restored.serialize(), currentBytes);
  assert.deepEqual(restored.state, current.state);
  assert.deepEqual(restored.replay, current.replay);
  restored.step(70);
  current.step(70);
  assert.equal(restored.serialize(), current.serialize());
  assert.deepEqual(restored.replay, current.replay);

  const oneEventDivergence = JSON.parse(legacyBytes);
  const combat = JSON.parse(oneEventDivergence.combat);
  combat.history.at(-1).command.externalHits.push({
    damage: 0,
    delivery: "melee",
    sourceId: "forged:source",
    targetUnitId: 1,
  });
  oneEventDivergence.combat = canonical(combat);
  assert.throws(() => BattleTowerCombat.restore(canonical(oneEventDivergence)), /witnesses/u);
});

test("battle towers: hostile commands, upstream witnesses, histories, and bounds reject atomically", () => {
  const battle = new BattleTowerCombat(setup([unit(51, "north")]));
  const before = battle.serialize();
  assert.throws(() => battle.spawn({ ...unit(Number.MAX_SAFE_INTEGER, "south"), tick: 0 }),
    /reserved/u);
  assert.equal(battle.serialize(), before);
  assert.throws(() => battle.stepMany(MAX_BATTLE_TOWER_STEP_TICKS + 1));
  assert.equal(battle.serialize(), before);

  const raw = JSON.parse(before);
  for (const mutate of [
    (snapshot) => { snapshot.combat = snapshot.combat.replace('"version":2', '"version":1'); },
    (snapshot) => { snapshot.towers = snapshot.towers.replace('"version":3', '"version":2'); },
    (snapshot) => { snapshot.history.push({ tick: 4, type: "step" }); },
    (snapshot) => { snapshot.version = 1; },
  ]) {
    const forged = structuredClone(raw);
    mutate(forged);
    assert.throws(() => BattleTowerCombat.restore(JSON.stringify(forged)));
  }
  assert.throws(() => BattleTowerCombat.restore(` ${before}`), /canonical/u);
  assert.throws(() => BattleTowerCombat.restore("x".repeat(4_194_305)), /byte bound/u);
  assert.equal(BattleTowerCombat.restore(before).serialize(), before);
});

test("battle towers: simultaneous opposing units and towers retain stable event/projectile identities", () => {
  const battle = new BattleTowerCombat(setup([
    unit(61, "north", { position: { x: 3_500, y: 7_500 } }),
    unit(62, "south", { position: { x: 14_500, y: 24_500 } }),
  ]));
  const events = battle.step(0);
  assert.deepEqual(events.filter(({ type }) => type === "tower-projectile-launch")
    .map(({ projectileId, sourceId, targetUnitId }) =>
      [projectileId, sourceId, targetUnitId]), [
    [1, "south:lane:west", 61],
    [2, "north:lane:east", 62],
  ]);
  assert.deepEqual(battle.state.units.map(({ hitpoints, id }) => [id, hitpoints]), [
    [61, 191],
    [62, 191],
  ]);
  assert.equal(battle.state.tick, 1);
  assert.equal(battle.state.tick, battle.state.towers[0].attack.nextTick);
});

test("battle towers: simultaneous unit-origin and tower-origin projectile ID 1 remain exactly namespaced", () => {
  const battle = new BattleTowerCombat(setup([
    unit(70, "north", {
      damage: 25,
      delivery: "projectile",
      maxHealth: 500,
      position: { x: 3_500, y: 7_500 },
      projectileSpeed: 1_000,
    }),
  ]));
  const events = battle.step(0);
  const unitLaunch = events.find(({ type }) => type === "projectile-launch");
  const towerLaunch = events.find(({ type }) => type === "tower-projectile-launch");
  assert.equal(unitLaunch.projectile.id, 1);
  assert.equal(towerLaunch.projectileId, 1);
  assert.deepEqual(unitLaunch.projectileIdentity, {
    attackSequence: 1,
    direction: "unit-to-tower",
    projectileId: 1,
    sourceId: 70,
  });
  assert.deepEqual(towerLaunch.projectileIdentity, {
    attackSequence: 1,
    direction: "tower-to-unit",
    projectileId: 1,
    sourceId: "south:lane:west",
  });
  const unitContact = events.find(({ type, projectileScope }) =>
    type === "external-structure-contact" && projectileScope === "unit-to-tower");
  const towerContact = events.find(({ type, projectileScope }) =>
    type === "external-unit-contact" && projectileScope === "tower-to-unit");
  assert.deepEqual(unitContact.projectileIdentity, unitLaunch.projectileIdentity);
  assert.deepEqual(towerContact.projectileIdentity, towerLaunch.projectileIdentity);
  assert.notDeepEqual(unitLaunch.projectileIdentity, towerLaunch.projectileIdentity);

  const bytes = battle.serialize();
  const restored = BattleTowerCombat.restore(bytes);
  assert.equal(restored.serialize(), bytes);
  assert.deepEqual(restored.replay, battle.replay);

  const forged = JSON.parse(bytes);
  const combat = JSON.parse(forged.combat);
  const boundary = combat.history.find(({ type }) => type === "boundary");
  boundary.command.externalProjectiles[0].sourceId = "north:lane:east";
  forged.combat = JSON.stringify(combat);
  assert.throws(() => BattleTowerCombat.restore(JSON.stringify(forged)), /witnesses/u);
});

test("battle towers: every tower candidate ID is rejected for initial, spawned, and scheduled units", () => {
  const reserved = Array.from({ length: 6 }, (_, index) =>
    Number.MAX_SAFE_INTEGER - index);
  for (const id of reserved) {
    assert.throws(() => new BattleTowerCombat(setup([unit(id, "north")])), /reserved/u);
  }

  const battle = new BattleTowerCombat(setup([]));
  const bytes = battle.serialize();
  for (const id of reserved) {
    assert.throws(() => battle.spawn({ ...unit(id, "north"), tick: 0 }), /reserved/u);
    assert.equal(battle.serialize(), bytes);
    assert.throws(() => battle.scheduleSpawn({ ...unit(id, "south"), tick: 1 }), /reserved/u);
    assert.equal(battle.serialize(), bytes);
  }

  const forged = JSON.parse(bytes);
  forged.setup.units = [unit(Number.MAX_SAFE_INTEGER, "north")];
  assert.throws(() => BattleTowerCombat.restore(JSON.stringify(forged)), /reserved/u);
});

test("battle towers: every projectile-bearing causal event has one complete scoped identity", () => {
  const towerExchange = new BattleTowerCombat(setup([
    unit(80, "north", {
      damage: 20,
      delivery: "projectile",
      maxHealth: 500,
      position: { x: 3_500, y: 7_500 },
      projectileSpeed: 1_000,
    }),
  ]));
  const structureEvents = towerExchange.step(0);

  const unitExchange = new BattleTowerCombat(setup([
    unit(81, "north", {
      damage: 20,
      delivery: "projectile",
      position: { x: 9_000, y: 16_000 },
      projectileSpeed: 1_000,
      reach: 1_000,
      targetMode: "ground",
    }),
    unit(82, "south", {
      damage: 0,
      firstHitTicks: 999,
      position: { x: 9_000, y: 16_500 },
      targetMode: "none",
    }),
  ], { central: 999, lane: 999 }));
  const unitEvents = [...unitExchange.step(0), ...unitExchange.step(1)];
  const bearing = [...structureEvents, ...unitEvents].filter((event) =>
    event.type === "projectile-launch" || event.type === "projectile-impact" ||
    event.type === "tower-projectile-launch" ||
    (event.delivery === "projectile" && [
      "damage", "external-structure-attack", "external-structure-contact",
      "external-unit-contact",
    ].includes(event.type)));
  assert.ok(bearing.length >= 10, "the enumeration must cover launches, impacts, contacts, and damage");
  assert.deepEqual(new Set(bearing.map(({ projectileScope }) => projectileScope)), new Set([
    "tower-to-unit", "unit-to-tower", "unit-to-unit",
  ]));
  for (const event of bearing) {
    assert.deepEqual(Object.keys(event.projectileIdentity).sort(), [
      "attackSequence", "direction", "projectileId", "sourceId",
    ]);
    assert.equal(event.projectileIdentity.direction, event.projectileScope);
    assert.equal(event.projectileIdentity.attackSequence, event.attackSequence);
    assert.equal(event.projectileIdentity.projectileId, event.projectileId);
    assert.equal(event.projectileIdentity.sourceId, event.sourceId);
    assert.ok(event.attackSequence >= 1);
    assert.ok(event.projectileId >= 1);
    assert.notEqual(event.sourceId, null);
  }

  const outer = JSON.parse(towerExchange.serialize());
  const combat = JSON.parse(outer.combat);
  const ingress = combat.history.find(({ type }) => type === "boundary")
    .command.externalProjectiles[0];
  assert.deepEqual(ingress, {
    attackSequence: 1,
    damage: 109,
    direction: "tower-to-unit",
    projectileId: 1,
    sourceId: "south:lane:west",
    targetUnitId: 80,
  });
});

test("battle towers: missing, divergent, and reordered serialized identity links reject", () => {
  const battle = new BattleTowerCombat(setup([
    unit(91, "north", { position: { x: 3_500, y: 7_500 } }),
    unit(92, "south", { position: { x: 14_500, y: 24_500 } }),
  ]));
  battle.step(0);
  const original = JSON.parse(battle.serialize());
  const forge = (mutate) => {
    const outer = structuredClone(original);
    const combat = JSON.parse(outer.combat);
    const ingress = combat.history.find(({ type }) => type === "boundary")
      .command.externalProjectiles;
    mutate(ingress);
    outer.combat = JSON.stringify(combat);
    return JSON.stringify(outer);
  };
  assert.throws(() => BattleTowerCombat.restore(forge((ingress) => {
    delete ingress[0].direction;
  })));
  assert.throws(() => BattleTowerCombat.restore(forge((ingress) => {
    ingress[0].attackSequence += 1;
  })));
  assert.throws(() => BattleTowerCombat.restore(forge((ingress) => {
    ingress.reverse();
  })));
  assert.equal(BattleTowerCombat.restore(JSON.stringify(original)).serialize(),
    JSON.stringify(original));
});
