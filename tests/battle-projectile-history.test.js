import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { BattleCombat } from "../src/sim/battle-combat.js";
import { BattleTowerCombat } from "../src/sim/battle-towers.js";
import { CrownTowerBattle } from "../src/sim/towers.js";

const IDENTITY_KEYS = ["attackSequence", "direction", "projectileId", "sourceId"];

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
    position: side === "north" ? { x: 0, y: 0 } : { x: 1_000, y: 0 },
    projectileSpeed: null,
    radius: 100,
    reach: 800,
    side,
    sightRange: 5_000,
    targetMode: "ground",
    ...overrides,
  };
}

function structure(overrides = {}) {
  return {
    alive: true,
    id: 900,
    kind: "structure",
    layer: "ground",
    position: { x: 1_000, y: 0 },
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

function setup(units = [], initialWindupTicks = { central: 999, lane: 0 }) {
  return { initialWindupTicks, units };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function projectileBearing(event) {
  return event.type === "shot-ready" ||
    event.type === "tower-projectile-launch" ||
    event.type === "projectile-launch" ||
    event.type === "projectile-impact" ||
    event.projectileId !== undefined ||
    event.externalProjectileId !== undefined ||
    event.projectile !== undefined ||
    (event.delivery === "projectile" && [
      "attack", "damage", "external-structure-attack", "external-structure-contact",
      "external-unit-contact",
    ].includes(event.type));
}

function assertIdentity(event) {
  assert.equal(projectileBearing(event), true, `unexpected non-projectile event ${event.type}`);
  assert.deepEqual(Object.keys(event.projectileIdentity).sort(), IDENTITY_KEYS);
  const identity = event.projectileIdentity;
  for (const key of IDENTITY_KEYS) {
    if (key === "direction") continue;
    if (Object.hasOwn(event, key)) assert.equal(event[key], identity[key], `${event.type}.${key}`);
  }
  if (Object.hasOwn(event, "projectileScope")) {
    assert.equal(event.projectileScope, identity.direction);
  }
  if (Object.hasOwn(event, "sequence")) assert.equal(event.sequence, identity.attackSequence);
  if (Object.hasOwn(event, "attackerId")) assert.equal(event.attackerId, identity.sourceId);
  if (Object.hasOwn(event, "sourceUnitId")) {
    assert.equal(event.sourceUnitId, identity.sourceId);
  }
  if (Object.hasOwn(event, "projectile")) {
    assert.deepEqual(event.projectile.projectileIdentity, identity);
    assert.equal(event.projectile.id, identity.projectileId);
    assert.equal(event.projectile.attackerId, identity.sourceId);
    assert.equal(event.projectile.attackSequence, identity.attackSequence);
    assert.equal(event.projectile.direction, identity.direction);
    assert.equal(event.projectile.projectileId, identity.projectileId);
    assert.equal(event.projectile.projectileScope, identity.direction);
    assert.equal(event.projectile.sourceId, identity.sourceId);
  }
}

function everyBearingEvent(events) {
  const bearing = events.filter(projectileBearing);
  assert.ok(bearing.length > 0, "expected projectile-bearing events");
  for (const event of bearing) assertIdentity(event);
  return bearing;
}

function candidate(id, side = "north") {
  return {
    alive: true,
    id,
    kind: "troop",
    layer: "ground",
    position: { x: 3_500, y: 7_500 },
    radius: 0,
    side,
    targetable: true,
  };
}

function identityFrom(events, type, direction) {
  return events.find((event) => event.type === type &&
    event.projectileIdentity?.direction === direction)?.projectileIdentity;
}

function legacyTowerSnapshot(serialized) {
  const current = JSON.parse(serialized);
  const combat = JSON.parse(current.combat);
  assert.equal(current.version, 2);
  assert.equal(combat.version, 2);
  assert.deepEqual(combat.transcript, []);
  current.combat = canonical({
    history: combat.history,
    setup: combat.setup,
    version: 1,
  });
  current.version = 1;
  return canonical(current);
}

test("projectile history: raw unit-to-unit ranged attack carries one identity from attack through damage", () => {
  const combat = new BattleCombat({ units: [
    unit(1, "north", {
      damage: 40,
      delivery: "projectile",
      position: { x: 0, y: 0 },
      projectileSpeed: 1_000,
    }),
    unit(2, "south", { damage: 0, firstHitTicks: 999 }),
  ] });
  const launchBoundary = combat.step(0);
  const impactBoundary = combat.step(1);
  const events = [...launchBoundary, ...impactBoundary];
  everyBearingEvent(events);
  const identity = identityFrom(events, "projectile-launch", "unit-to-unit");
  assert.deepEqual(identity, {
    attackSequence: 1,
    direction: "unit-to-unit",
    projectileId: 1,
    sourceId: 1,
  });
  for (const event of events.filter((entry) =>
    entry.projectileIdentity?.direction === "unit-to-unit")) {
    assert.deepEqual(event.projectileIdentity, identity);
  }
  assert.equal(events.some(({ type, projectileIdentity }) =>
    type === "damage" && projectileIdentity?.direction === "unit-to-unit"), true);
});

test("projectile history: unit-to-tower launch, contact, and structure ingress retain identity", () => {
  const combat = new BattleCombat({ units: [unit(3, "north", {
    cadenceTicks: 100,
    damage: 29,
    delivery: "projectile",
    position: { x: 0, y: 0 },
    projectileSpeed: 200,
    reach: 1_000,
    targetMode: "buildings",
  })] });
  const events = [];
  const launchBoundary = combat.stepBoundary(boundary(0, {
    structures: [structure({ position: { x: 1_000, y: 0 } })],
  }));
  events.push(...launchBoundary);
  const contactTick = launchBoundary.find(({ type }) => type === "external-structure-attack")
    .contactTick;
  for (let tick = 1; tick <= contactTick; tick += 1) {
    events.push(...combat.stepBoundary(boundary(tick, {
      structures: [structure({ position: { x: 1_000, y: 0 } })],
    })));
  }
  everyBearingEvent(events);
  const identities = events.filter(({ projectileIdentity }) => projectileIdentity)
    .map(({ projectileIdentity }) => projectileIdentity);
  assert.ok(identities.some(({ direction }) => direction === "unit-to-tower"));
  assert.equal(new Set(identities.map(canonical)).size, 1);
  assert.equal(identities[0].sourceId, 3);
});

test("projectile history: tower shot authority and projected tower damage share the allocated identity", () => {
  const crown = new CrownTowerBattle({ initialWindupTicks: { central: 999, lane: 0 } });
  const ready = crown.stepLive({ candidates: [candidate(8)], damage: [] })
    .find(({ type, towerId }) => type === "shot-ready" && towerId === "south:lane:west");
  const battle = new BattleTowerCombat(setup([unit(8, "north", {
    damage: 0,
    firstHitTicks: 999,
    position: { x: 3_500, y: 7_500 },
    targetMode: "none",
  })]));
  const events = battle.step(0);
  const bearing = everyBearingEvent([ready, ...events]);
  const identity = ready.projectileIdentity;
  for (const event of bearing.filter(({ projectileIdentity }) =>
    projectileIdentity?.direction === "tower-to-unit")) {
    assert.deepEqual(event.projectileIdentity, identity);
  }
  assert.equal(events.some(({ type, projectileIdentity }) =>
    type === "damage" && projectileIdentity?.direction === "tower-to-unit"), true);
});

test("projectile history: simultaneous unit and tower namespaces may both allocate projectile ID one", () => {
  const battle = new BattleTowerCombat(setup([unit(9, "north", {
    damage: 25,
    delivery: "projectile",
    maxHealth: 500,
    position: { x: 3_500, y: 7_500 },
    projectileSpeed: 1_000,
  })]));
  const events = battle.step(0);
  everyBearingEvent(events);
  const identities = events.filter(({ projectileIdentity }) => projectileIdentity)
    .map(({ projectileIdentity }) => projectileIdentity);
  assert.ok(identities.some(({ direction, projectileId }) =>
    direction === "unit-to-tower" && projectileId === 1));
  assert.ok(identities.some(({ direction, projectileId }) =>
    direction === "tower-to-unit" && projectileId === 1));
  assert.notDeepEqual(
    identities.find(({ direction }) => direction === "unit-to-tower"),
    identities.find(({ direction }) => direction === "tower-to-unit"),
  );
});

test("projectile history: a dead in-flight target keeps terminal identity without false damage", () => {
  const combat = new BattleCombat({ units: [
    unit(10, "north", {
      damage: 40,
      delivery: "projectile",
      position: { x: 0, y: 0 },
      projectileSpeed: 300,
    }),
    unit(11, "south", {
      damage: 100,
      maxHealth: 40,
      position: { x: 1_000, y: 0 },
      targetMode: "none",
    }),
    unit(12, "north", {
      damage: 40,
      maxHealth: 1_000,
      position: { x: 1_000, y: 0 },
      targetMode: "ground",
    }),
  ] });
  const launch = combat.step(0);
  assert.equal(launch.some(({ type, targetId }) => type === "death" && targetId === 11), true);
  combat.step(1);
  combat.step(2);
  const terminal = combat.step(3).find(({ type }) => type === "projectile-impact");
  assert.equal(terminal.status, "target_dead");
  assertIdentity(terminal);
  assert.equal(combat.replay.some(({ type, projectileId, targetId }) =>
    type === "damage" && projectileId === terminal.projectileId && targetId === 11), false);
});

test("projectile history: fresh, chunks, and every restore cut preserve identity events and bytes", () => {
  const configure = () => new BattleTowerCombat(setup([
    unit(20, "north", {
      cadenceTicks: 4,
      damage: 17,
      delivery: "projectile",
      maxHealth: 5_000,
      position: { x: 9_000, y: 16_000 },
      projectileSpeed: 500,
      reach: 2_000,
      targetMode: "ground",
    }),
    unit(21, "south", {
      cadenceTicks: 5,
      damage: 0,
      firstHitTicks: 999,
      maxHealth: 5_000,
      position: { x: 9_000, y: 16_500 },
      targetMode: "none",
    }),
  ]));
  const direct = configure();
  const snapshots = [direct.serialize()];
  const perTick = [];
  for (let tick = 0; tick < 12; tick += 1) {
    perTick.push(direct.step(tick));
    snapshots.push(direct.serialize());
  }
  const chunked = configure();
  assert.deepEqual(chunked.stepMany(12), perTick.flat());
  assert.equal(chunked.serialize(), direct.serialize());
  everyBearingEvent(perTick.flat());
  for (let cut = 0; cut < snapshots.length; cut += 1) {
    const restored = BattleTowerCombat.restore(snapshots[cut]);
    const continuation = restored.stepMany(12 - cut);
    assert.deepEqual(continuation, perTick.slice(cut).flat(), `events at cut ${cut}`);
    assert.equal(restored.serialize(), direct.serialize(), `bytes at cut ${cut}`);
  }
});

test("projectile history: delayed impact and damage use their own current identity", () => {
  const battle = new BattleTowerCombat(setup([
    unit(22, "north", {
      damage: 17,
      delivery: "projectile",
      position: { x: 0, y: 0 },
      projectileSpeed: 1_000,
      targetMode: "ground",
    }),
    unit(23, "south", {
      damage: 0,
      firstHitTicks: 999,
      position: { x: 1_000, y: 0 },
      targetMode: "none",
    }),
  ], { central: 999, lane: 999 }));
  const launch = battle.step(0).find(({ type }) => type === "projectile-launch");
  const identity = launch.projectileIdentity;
  const inFlightBytes = battle.serialize();
  const fork = battle.fork();
  const restored = BattleTowerCombat.restore(inFlightBytes);

  const continuations = [battle, fork, restored].map((candidate) => candidate.step(1));
  for (const events of continuations) {
    assert.equal(events.some(({ type }) => type === "projectile-launch"), false);
    const impact = events.find(({ type }) => type === "projectile-impact");
    const damage = events.find(({ type, targetId }) => type === "damage" && targetId === 23);
    assert.ok(impact);
    assert.ok(damage);
    assertIdentity(impact);
    assertIdentity(damage);
    assert.deepEqual(impact.projectileIdentity, identity);
    assert.deepEqual(damage.projectileIdentity, identity);
  }
  assert.equal(fork.serialize(), battle.serialize());
  assert.equal(restored.serialize(), battle.serialize());
});

test("projectile history: unit-to-tower contact forwards its current identity into tower damage", () => {
  const battle = new BattleTowerCombat(setup([unit(24, "north", {
    cadenceTicks: 100,
    damage: 29,
    delivery: "projectile",
    position: { x: 3_500, y: 6_500 },
    projectileSpeed: 1_000,
    reach: 1_000,
    targetMode: "buildings",
  })], { central: 999, lane: 999 }));
  const first = battle.step(0);
  const attack = first.find(({ type }) => type === "external-structure-attack");
  assert.ok(attack);
  assertIdentity(attack);
  const identity = attack.projectileIdentity;
  let contact = first.find(({ type }) => type === "external-structure-contact") ?? null;
  for (let tick = 1; contact === null && tick <= attack.contactTick; tick += 1) {
    const events = battle.step(tick);
    contact = events.find(({ type }) => type === "external-structure-contact") ?? null;
  }
  assert.ok(contact);
  assertIdentity(contact);
  assert.deepEqual(contact.projectileIdentity, identity);
  assert.equal(
    battle.state.towers.find(({ id }) => id === "south:lane:west").hitpoints,
    3_052 - attack.damage,
  );
});

test("projectile history: current adapter bytes omit origin state and legacy upgrade never trusts forged origins", () => {
  const battle = new BattleTowerCombat(setup([unit(25, "north", {
    damage: 25,
    delivery: "projectile",
    position: { x: 3_500, y: 7_500 },
    projectileSpeed: 1_000,
    targetMode: "buildings",
  })], { central: 999, lane: 999 }));
  battle.step(0);
  const current = battle.serialize();
  assert.doesNotMatch(current,
    /unitProjectileOrigins|pendingUnitOrigins|unitOriginFor|unitStructureOriginFor/u);
  const legacy = legacyTowerSnapshot(current);
  const upgraded = BattleTowerCombat.restore(legacy);
  assert.equal(upgraded.serialize(), current);

  const forged = JSON.parse(legacy);
  forged.unitProjectileOrigins = [{ projectileId: 1, sourceId: 25 }];
  assert.throws(() => BattleTowerCombat.restore(canonical(forged)));
});

test("projectile history: current raw identity and mirrors reject atomically without prior-launch repair", () => {
  const combat = new BattleCombat({ units: [
    unit(26, "north", {
      damage: 19,
      delivery: "projectile",
      position: { x: 0, y: 0 },
      projectileSpeed: 1_000,
    }),
    unit(27, "south", {
      damage: 0,
      firstHitTicks: 999,
      position: { x: 1_000, y: 0 },
      targetMode: "none",
    }),
  ] });
  combat.step(0);
  const before = combat.serialize();
  const preview = combat.previewBoundary(boundary(1));
  assert.equal(preview.some(({ type }) => type === "projectile-launch"), false);
  assert.ok(preview.some(({ type }) => type === "projectile-impact"));
  for (const mutate of [
    (events) => { delete events.find(({ type }) => type === "projectile-impact").projectileIdentity; },
    (events) => {
      events.find(({ type }) => type === "projectile-impact").projectileIdentity.sourceId = 999;
    },
    (events) => {
      events.find(({ type }) => type === "projectile-impact").projectileScope = "tower-to-unit";
    },
  ]) {
    const forged = structuredClone(preview);
    mutate(forged);
    assert.throws(() => combat.stepBoundaryAfterPreview(boundary(1), forged));
    assert.equal(combat.serialize(), before);
  }
});

test("projectile history: legacy ingress normalizes once to current nested identity", () => {
  const combat = new BattleCombat({ units: [unit(30, "north", {
    damage: 0,
    targetMode: "none",
  })] });
  combat.stepBoundary(boundary(0, {
    externalProjectiles: [{
      damage: 7,
      projectileId: 44,
      sourceId: "south:lane:west",
      targetUnitId: 30,
    }],
  }));
  const current = JSON.parse(combat.serialize());
  const ingress = current.history.at(-1).command.externalProjectiles[0];
  assert.deepEqual(ingress.projectileIdentity, {
    attackSequence: 44,
    direction: "tower-to-unit",
    projectileId: 44,
    sourceId: "south:lane:west",
  });
  const legacyCurrent = structuredClone(current);
  delete legacyCurrent.history.at(-1).command.externalProjectiles[0].projectileIdentity;
  const legacy = canonical({
    history: legacyCurrent.history,
    setup: legacyCurrent.setup,
    version: 1,
  });
  const restored = BattleCombat.restore(legacy);
  assert.equal(restored.serialize(), combat.serialize());
});

test("projectile history: every nested identity and scalar mirror rejects atomically", () => {
  const combat = new BattleCombat({ units: [
    unit(40, "north", {
      delivery: "projectile",
      position: { x: 0, y: 0 },
      projectileSpeed: 1_000,
    }),
    unit(41, "south", { damage: 0, firstHitTicks: 999 }),
  ] });
  const command = boundary(0);
  const preview = combat.previewBoundary(command);
  const before = combat.serialize();
  for (const mutate of [
    (events) => { delete events.find(({ type }) => type === "projectile-launch").projectileIdentity; },
    (events) => { events.find(({ type }) => type === "projectile-launch").projectileIdentity.direction = "tower-to-unit"; },
    (events) => { events.find(({ type }) => type === "projectile-launch").projectileId += 1; },
    (events) => { events.find(({ type }) => type === "projectile-launch").sourceId = 99; },
    (events) => { events.find(({ type }) => type === "projectile-launch").attackSequence += 1; },
    (events) => { events.find(({ type }) => type === "projectile-launch").direction = "tower-to-unit"; },
    (events) => { events.find(({ type }) => type === "projectile-launch").projectileScope = "tower-to-unit"; },
    (events) => {
      const launch = events.find(({ type }) => type === "projectile-launch");
      launch.projectile.projectileIdentity.attackSequence += 1;
    },
    (events) => {
      const launch = events.find(({ type }) => type === "projectile-launch");
      launch.projectile.projectileId += 1;
    },
    (events) => {
      const launch = events.find(({ type }) => type === "projectile-launch");
      launch.projectile.sourceId = 99;
    },
    (events) => {
      const launch = events.find(({ type }) => type === "projectile-launch");
      launch.projectile.direction = "tower-to-unit";
    },
    (events) => {
      const launch = events.find(({ type }) => type === "projectile-launch");
      launch.projectile.projectileScope = "tower-to-unit";
    },
  ]) {
    const forged = structuredClone(preview);
    mutate(forged);
    assert.throws(() => combat.stepBoundaryAfterPreview(command, forged));
    assert.equal(combat.serialize(), before);
  }
});

test("projectile history: structure projectile source and scope mirrors reject atomically", () => {
  const combat = new BattleCombat({ units: [unit(45, "north", {
    cadenceTicks: 100,
    delivery: "projectile",
    position: { x: 0, y: 0 },
    projectileSpeed: 200,
    reach: 1_000,
    targetMode: "buildings",
  })] });
  const command = boundary(0, { structures: [structure()] });
  const preview = combat.previewBoundary(command);
  const before = combat.serialize();
  for (const mutate of [
    (events) => {
      events.find(({ type }) => type === "external-structure-attack").sourceUnitId = 99;
    },
    (events) => {
      events.find(({ type }) => type === "external-structure-attack").projectileScope = "tower-to-unit";
    },
  ]) {
    const forged = structuredClone(preview);
    mutate(forged);
    assert.throws(() => combat.stepBoundaryAfterPreview(command, forged));
    assert.equal(combat.serialize(), before);
  }
});

test("projectile history: missing, swapped, duplicate, and wrong ingress identities reject byte-atomically", () => {
  const battle = new BattleTowerCombat(setup([
    unit(50, "north", { position: { x: 3_500, y: 7_500 }, targetMode: "none" }),
    unit(51, "north", { position: { x: 14_500, y: 7_500 }, targetMode: "none" }),
  ]));
  battle.step(0);
  const original = JSON.parse(battle.serialize());
  const combat = JSON.parse(original.combat);
  const boundaryRecord = combat.history.find(({ type }) => type === "boundary");
  assert.ok(boundaryRecord.command.externalProjectiles.length >= 2);
  const before = battle.serialize();
  for (const mutate of [
    (ingress) => { delete ingress[0].projectileIdentity; },
    (ingress) => { ingress[0].projectileIdentity = structuredClone(ingress[1].projectileIdentity); },
    (ingress) => { ingress[1].projectileId = ingress[0].projectileId; },
    (ingress) => { ingress[0].direction = "unit-to-unit"; },
    (ingress) => { ingress[0].projectileIdentity.sourceId = "north:lane:east"; },
    (ingress) => { ingress[0].projectileIdentity.attackSequence += 1; },
  ]) {
    const forged = structuredClone(original);
    const forgedCombat = JSON.parse(forged.combat);
    mutate(forgedCombat.history.find(({ type }) => type === "boundary")
      .command.externalProjectiles);
    forged.combat = canonical(forgedCombat);
    assert.throws(() => BattleTowerCombat.restore(canonical(forged)));
    assert.equal(battle.serialize(), before);
  }
});

test("projectile history: no adjacent-event lookup remains in the provenance authority", () => {
  const source = readFileSync(new URL("../src/sim/battle-continuation-kernel.js", import.meta.url), "utf8");
  for (const forbidden of [
    "currentUnitOrigins",
    "pendingUnitOrigins",
    "unitOriginFor",
    "unitStructureOriginFor",
    "#unitProjectileOrigins",
  ]) {
    assert.equal(source.includes(forbidden), false, `forbidden provenance symbol: ${forbidden}`);
  }
  const provenanceAdapter = source.slice(
    source.indexOf("function strictProjectileEvent"),
    source.indexOf("function unifiedEvents"),
  );
  assert.doesNotMatch(provenanceAdapter, /\b(?:Map|WeakMap)\b|\.find\(|\.some\(|\.filter\(/u);
});
