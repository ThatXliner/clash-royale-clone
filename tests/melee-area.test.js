import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { BattleCombat } from "../src/sim/battle-combat.js";
import { BattleTowerCombat } from "../src/sim/battle-towers.js";

const POLICY = Object.freeze({
  authoritative: false,
  center: "attacker",
  confidence: "question",
  geometry: "circle-overlap-inclusive",
  radiusMillitiles: 2_000,
  secondaryDamage: "base-attack",
  structureTargets: "exclude",
  targetLayers: Object.freeze(["ground"]),
  version: "melee-area-question-v1",
});

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
    position: { x: side === "north" ? 100_000 : 100_500, y: 0 },
    projectileSpeed: null,
    radius: 100,
    reach: 800,
    side,
    sightRange: 5_000,
    targetMode: "ground",
    ...overrides,
  };
}

function boundary(tick, overrides = {}) {
  return {
    externalHits: [],
    externalProjectiles: [],
    structures: [],
    tick,
    ...overrides,
  };
}

function canonical(value) {
  return Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value !== null && typeof value === "object"
      ? `{${Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}`
      : JSON.stringify(value);
}

function areaUnits() {
  const north = unit(1, "north", {
    damage: 11,
    firstHitTicks: 2,
    position: { x: 100_000, y: 0 },
  });
  return [
    unit(10, "south", { maxHealth: 1_000, position: { x: 102_200, y: 0 }, targetMode: "none" }),
    unit(7, "south", { maxHealth: 10, position: { x: 101_500, y: 0 }, targetMode: "none" }),
    unit(6, "south", { position: { x: 100_700, y: 0 }, targetMode: "none" }),
    unit(5, "south", { position: { x: 102_100, y: 0 }, targetMode: "none" }),
    unit(4, "south", { position: { x: 101_300, y: 0 }, targetMode: "none" }),
    unit(3, "south", { position: { x: 101_100, y: 0 }, targetMode: "none" }),
    unit(2, "south", { damage: 0, position: { x: 100_500, y: 0 }, targetMode: "none" }),
    unit(11, "south", { position: { x: 102_550, y: 0 }, targetMode: "none" }),
    unit(9, "south", { layer: "air", position: { x: 100_400, y: 0 }, targetMode: "none" }),
    unit(8, "north", { position: { x: 100_300, y: 0 }, targetMode: "none" }),
    north,
  ];
}

function areaSetup(units = areaUnits()) {
  return {
    meleeAreaPolicies: [{ attackerId: 1, policy: POLICY }],
    units,
  };
}

function areaBoundary(tick) {
  return boundary(tick, {
    externalHits: tick === 0 ? [{
      damage: 10,
      delivery: "melee",
      sourceId: "south:precontact",
      targetUnitId: 7,
    }] : [],
    structures: [{
      alive: true,
      id: 900,
      kind: "structure",
      layer: "ground",
      position: { x: 100_800, y: 0 },
      radius: 500,
      side: "south",
      structureId: "south:lane:west",
      targetable: true,
    }],
    unitControls: [{
      attackBlocked: false,
      attackStep: "normal",
      id: 6,
      targetable: tick !== 2,
    }],
    unitHeals: [],
  });
}

test("melee area: one primary plus eligible ground secondaries in stable ID order", () => {
  const combat = new BattleCombat(areaSetup());
  combat.stepBoundary(areaBoundary(0));
  combat.stepBoundary(areaBoundary(1));
  const events = combat.stepBoundary(areaBoundary(2));
  const damage = events.filter(({ type, attackerId }) =>
    type === "damage" && attackerId === 1);
  assert.deepEqual(damage.map(({ targetId }) => targetId), [2, 3, 4, 5]);
  assert.equal(damage.filter(({ targetId }) => targetId === 2).length, 1,
    "the primary is hit once and is excluded from its own secondary scan");
  assert.deepEqual(damage.slice(1).map(({ meleeAreaPolicyVersion }) =>
    meleeAreaPolicyVersion), Array(3).fill(POLICY.version));
  assert.equal(damage.some(({ targetId }) => targetId === 6), false,
    "a unit made untargetable at contact is not a secondary target");
  assert.equal(damage.some(({ targetId }) => targetId === 7), false,
    "a unit killed on the earlier boundary is not a secondary target");
  assert.equal(damage.some(({ targetId }) => targetId === 8), false,
    "friendly units are not secondary targets");
  assert.equal(damage.some(({ targetId }) => targetId === 9), false,
    "the closed ground-only question policy excludes air units");
  assert.equal(damage.some(({ targetId }) => targetId === 10), false,
    "units outside the closed circle-overlap geometry are excluded");
  assert.equal(damage.some(({ targetId }) => targetId === 11), false,
    "the center is the attacker, not the primary target");
  assert.equal(events.some(({ type, sourceUnitId }) =>
    type === "external-structure-contact" && sourceUnitId === 1), false,
  "the area policy excludes structures");
  assert.equal(combat.state.units.find(({ id }) => id === 2).hitpoints, 89);
});

test("melee area: authenticated pre-contact restore and fork preserve exact continuation", () => {
  const combat = new BattleCombat(areaSetup());
  const eventCuts = [];
  eventCuts.push(combat.stepBoundary(areaBoundary(0)));
  eventCuts.push(combat.stepBoundary(areaBoundary(1)));
  const preContact = combat.serialize();
  const restored = BattleCombat.restore(preContact);
  const forked = combat.fork();
  assert.equal(restored.serialize(), preContact);
  assert.equal(forked.serialize(), preContact);

  const expected = combat.stepBoundary(areaBoundary(2));
  assert.deepEqual(restored.stepBoundary(areaBoundary(2)), expected);
  assert.deepEqual(forked.stepBoundary(areaBoundary(2)), expected);
  for (const continuation of [restored, forked]) {
    assert.equal(continuation.serialize(), combat.serialize());
    assert.deepEqual(continuation.state, combat.state);
    assert.deepEqual(continuation.replay, combat.replay);
    assert.equal(BattleCombat.continuationEquivalent(continuation, combat), true);
  }
});

test("melee area: runtime policy is closed and snapshot mutations cannot forge it", () => {
  const valid = areaSetup();
  const badPolicies = [
    { ...POLICY, authoritative: true },
    { ...POLICY, confidence: "verified" },
    { ...POLICY, geometry: "center-distance" },
    { ...POLICY, radiusMillitiles: 2_001 },
    { ...POLICY, targetLayers: ["air"] },
    { ...POLICY, version: "unknown-v2" },
    { ...POLICY, unrecognized: true },
  ];
  for (const policy of badPolicies) {
    assert.throws(() => new BattleCombat({
      ...valid,
      meleeAreaPolicies: [{ attackerId: 1, policy }],
    }));
  }
  assert.throws(() => new BattleCombat({
    ...valid,
    meleeAreaPolicies: [],
  }), /omitted/u);
  assert.throws(() => new BattleCombat({
    ...valid,
    meleeAreaPolicies: [
      { attackerId: 1, policy: POLICY },
      { attackerId: 1, policy: POLICY },
    ],
  }), /unique/u);
  assert.throws(() => new BattleCombat({
    meleeAreaPolicies: [{ attackerId: 1, policy: POLICY }],
    units: [unit(1, "north", { delivery: "projectile", projectileSpeed: 500 })],
  }), /initial melee unit/u);

  const combat = new BattleCombat(valid);
  combat.stepBoundary(areaBoundary(0));
  combat.stepBoundary(areaBoundary(1));
  combat.stepBoundary(areaBoundary(2));
  const serialized = combat.serialize();
  for (const mutate of [
    (snapshot) => { snapshot.setup.meleeAreaPolicies[0].policy.radiusMillitiles += 1; },
    (snapshot) => { snapshot.setup.meleeAreaPolicies[0].policy.targetLayers = ["air"]; },
    (snapshot) => { snapshot.setup.meleeAreaPolicies[0].policy.authoritative = true; },
    (snapshot) => { delete snapshot.setup.meleeAreaPolicies; },
  ]) {
    const snapshot = JSON.parse(serialized);
    mutate(snapshot);
    assert.throws(() => BattleCombat.restore(canonical(snapshot)));
  }
});

test("melee area: tower host forwards policy through restore and fork", () => {
  const units = [
    unit(1, "north", { damage: 17, position: { x: 100_000, y: 100_000 } }),
    unit(2, "south", { damage: 0, position: { x: 100_500, y: 100_000 }, targetMode: "none" }),
    unit(3, "south", { damage: 0, position: { x: 101_000, y: 100_000 }, targetMode: "none" }),
  ];
  const setup = {
    initialWindupTicks: { central: 0, lane: 0 },
    meleeAreaPolicies: [{ attackerId: 1, policy: POLICY }],
    units,
  };
  const tower = new BattleTowerCombat(setup);
  const first = tower.step(0);
  assert.deepEqual(first.filter(({ type, attackerId }) =>
    type === "damage" && attackerId === 1).map(({ targetId }) => targetId), [2, 3]);
  const bytes = tower.serialize();
  assert.deepEqual(JSON.parse(bytes).setup.meleeAreaPolicies, setup.meleeAreaPolicies);
  const restored = BattleTowerCombat.restore(bytes);
  const forked = tower.fork();
  const next = tower.step(1);
  assert.deepEqual(restored.step(1), next);
  assert.deepEqual(forked.step(1), next);
  assert.equal(restored.serialize(), tower.serialize());
  assert.equal(forked.serialize(), tower.serialize());

  const forged = JSON.parse(bytes);
  forged.setup.meleeAreaPolicies[0].policy.secondaryDamage = "zero";
  assert.throws(() => BattleTowerCombat.restore(canonical(forged)));
});

test("melee area: ordinary direct and projectile snapshot bytes remain unchanged", () => {
  const snapshots = [
    {
      hash: "be7f2c2ff6317ce3c26355b0c674cccd2fc0be5192536ddf0e36780587f1d952",
      setup: { units: [unit(1, "north", { position: { x: 0, y: 0 } }),
        unit(2, "south", { damage: 0, position: { x: 500, y: 0 } })] },
    },
    {
      hash: "4b6358927f4f8a69f72389e7676a74da78fdde485d67f5f441d3e23bf808598e",
      setup: { units: [unit(1, "north", {
        delivery: "projectile", position: { x: 0, y: 0 }, projectileSpeed: 400,
      }), unit(2, "south", { damage: 0, position: { x: 500, y: 0 } })] },
    },
  ];
  for (const { hash, setup } of snapshots) {
    const combat = new BattleCombat(setup);
    combat.step(0);
    const serialized = combat.serialize();
    assert.deepEqual(Object.keys(JSON.parse(serialized).setup), ["units"]);
    assert.equal(createHash("sha256").update(serialized).digest("hex"), hash);
  }

  const tower = new BattleTowerCombat({
    initialWindupTicks: { central: 0, lane: 0 },
    units: [
      unit(1, "north", { position: { x: 100_000, y: 100_000 } }),
      unit(2, "south", { damage: 0, position: { x: 100_500, y: 100_000 } }),
    ],
  });
  tower.step(0);
  const towerBytes = tower.serialize();
  assert.deepEqual(Object.keys(JSON.parse(towerBytes).setup).sort(),
    ["initialWindupTicks", "units"]);
  assert.equal(createHash("sha256").update(towerBytes).digest("hex"),
    "f4239db6452bf5e2c7b0b44f5dcf9cab915aebab6aafe206aa4fe5a6cdb12a1b");
});
