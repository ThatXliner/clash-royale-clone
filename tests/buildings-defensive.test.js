import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { AreaDamageSystem } from "../src/sim/area-damage.js";
import { ProjectileCombat } from "../src/sim/projectile.js";
import {
  ConsecutiveTargetRampEncounter,
} from "../src/content/cards/special-combat-ramp.js";
import {
  InvisibilityRevealEncounter,
} from "../src/content/cards/combat-status-invisibility.js";
import {
  DefensiveBuildingEncounter,
  createDefensiveBuildingCatalog,
  createDefensiveBuildingCorpusRecords,
  createDefensiveBuildingFixture,
  createDefensiveBuildingQuestionRecords,
} from "../src/content/cards/buildings-defensive.js";

const ORIGIN = Object.freeze({ x: 9000, y: 12000 });

function building(archetypeId, id = 1, overrides = {}) {
  return {
    archetypeId,
    destroyedOpposingLaneTowers: [],
    id,
    position: { ...ORIGIN },
    side: "south",
    ...overrides,
  };
}

function target(id, distance, overrides = {}) {
  return {
    health: 5000,
    id,
    kind: "troop",
    layer: "ground",
    position: { x: ORIGIN.x + distance, y: ORIGIN.y },
    radius: 0,
    targetable: true,
    ...overrides,
  };
}

function command(tick, type, overrides = {}) {
  return {
    amount: null,
    buildingId: null,
    position: null,
    targetId: null,
    tick,
    type,
    ...overrides,
  };
}

function encounter(archetypeId, targets, commands = [], id = 1) {
  return new DefensiveBuildingEncounter(
    createDefensiveBuildingFixture([building(archetypeId, id)], targets, commands),
  );
}

function attacks(value) {
  return value.replay.filter(({ type }) => type === "attack");
}

function damages(value) {
  return value.replay.filter(({ type }) => type === "damage");
}

function pinnedHash(relativePath, expected) {
  const source = readFileSync(new URL(relativePath, import.meta.url));
  assert.equal(createHash("sha256").update(source).digest("hex"), expected);
}

test("buildings defensive: original catalog preserves the five corpus stat shapes", () => {
  const actual = createDefensiveBuildingCatalog().map((card) => ({
    damage: card.damage,
    deploy: card.deployTimeTicks,
    first: card.firstHitTicks,
    hp: card.hitpoints,
    id: card.id,
    range: card.rangeMillitiles,
    speed: card.hitSpeedTicks,
    target: card.targetMode,
  }));
  // Independent literal oracle from the protected benchmark rows. No runtime
  // constants, reference imports, or arithmetic participate in this expected value.
  assert.deepEqual(actual, [
    { damage: 212, deploy: 60, first: null, hp: 824, id: "bulwark-needle",
      range: 5500, speed: 54, target: "ground" },
    { damage: 230, deploy: 60, first: 42, hp: 1152, id: "buried-coil",
      range: 5500, speed: 72, target: "ground-and-air" },
    { damage: 222, deploy: 60, first: 66, hp: 1356, id: "ember-basin",
      range: 6000, speed: 96, target: "ground" },
    { damage: 266, deploy: 210, first: 240, hp: 1369, id: "horizon-caster",
      range: 11500, speed: 300, target: "ground" },
    { damage: 42, deploy: 60, first: 72, hp: 1749, id: "prism-furnace",
      range: 6000, speed: 24, target: "ground-and-air" },
  ]);
  const again = createDefensiveBuildingCatalog();
  actual[0].damage = 1;
  assert.equal(again[0].damage, 212);
});

test("buildings defensive: corpus confidence is conservative and isolated", () => {
  const records = createDefensiveBuildingCorpusRecords();
  assert.equal(records["bulwark-needle"].hitSpeedTicks.authoritative, true);
  assert.equal(records["bulwark-needle"].hitSpeedTicks.confidence, "high");
  assert.equal(records["ember-basin"].damage.authoritative, false);
  assert.equal(records["ember-basin"].damage.confidence, "unverified");
  assert.ok(Object.isFrozen(records["prism-furnace"]));
  const second = createDefensiveBuildingCorpusRecords();
  assert.notEqual(records, second);
  assert.notEqual(records["bulwark-needle"], second["bulwark-needle"]);
});

test("buildings defensive: every absent policy is a separate fresh frozen QUESTION", () => {
  const first = createDefensiveBuildingQuestionRecords();
  assert.deepEqual(Object.keys(first).sort(), [
    "attackContactPolicy", "attackTimingPolicy", "commandOrderingPolicy",
    "hiddenInitialPolicy", "hiddenReconcealPolicy", "hiddenRevealAttackBoundary",
    "lifetimeDestructionBoundary", "lifetimeTicks", "placementPolicy",
    "plainFirstHitTicks",
    "rampDamageProgression", "rampResetPolicy", "rampSplashCoupling",
    "rampStageThresholds", "siegeMaximumBoundary", "siegeMinimumBoundary",
    "siegeMinimumRangeMillitiles", "splashDamagePolicy", "splashRadiusBoundary",
    "splashRadiusMillitiles", "stableDeathOrdering", "targetModePolicy",
    "targetRetentionPolicy",
  ].sort());
  assert.ok(Object.isFrozen(first));
  for (const [key, record] of Object.entries(first)) {
    assert.deepEqual(
      [record.authoritative, record.confidence, record.disposition, record.key],
      [false, "unverified", "question", key],
    );
    assert.ok(Object.isFrozen(record));
    if (record.value && typeof record.value === "object") {
      assert.ok(Object.isFrozen(record.value));
    }
  }
  const second = createDefensiveBuildingQuestionRecords();
  assert.notEqual(first, second);
  assert.notEqual(first.rampDamageProgression, second.rampDamageProgression);
  assert.notEqual(first.rampDamageProgression.value, second.rampDamageProgression.value);
  assert.throws(() => { first.rampDamageProgression.value[0] = 0; }, TypeError);
  assert.throws(() => createDefensiveBuildingQuestionRecords({}), /do not accept/);
});

test("buildings defensive: placement is legal, copied, stationary, and illegal masks reject", () => {
  const setupBuilding = building("bulwark-needle");
  const value = new DefensiveBuildingEncounter(
    createDefensiveBuildingFixture([setupBuilding], [], []),
  );
  setupBuilding.position.x = 1;
  value.stepMany(100);
  assert.deepEqual(value.state.buildings[0].position, ORIGIN);
  assert.deepEqual(value.state.buildings[0].placement, {
    confidence: "estimate", legal: true, reason: "own_side_ground",
  });
  assert.throws(
    () => new DefensiveBuildingEncounter(createDefensiveBuildingFixture([
      building("bulwark-needle", 1, { position: { x: 9000, y: 16000 } }),
    ])),
    /placement is illegal: river_excluded/,
  );
});

test("buildings defensive: lifetime boundary and command-first damage death are exact", () => {
  const lifetime = encounter("bulwark-needle", []);
  lifetime.stepMany(1800);
  assert.equal(lifetime.state.buildings[0].alive, true);
  lifetime.step();
  assert.deepEqual(lifetime.replay.at(-1), {
    buildingId: 1, reason: "lifetime", tick: 1800, type: "building-destroyed",
  });

  const lethal = encounter("bulwark-needle", [], [
    command(1800, "damage-building", { amount: 824, buildingId: 1 }),
  ]);
  lethal.stepMany(1801);
  assert.deepEqual(
    lethal.replay.filter(({ type }) => type === "building-destroyed"),
    [{ buildingId: 1, reason: "damage", tick: 1800, type: "building-destroyed" }],
  );
});

test("buildings defensive: nearest target and stable ID retention are order independent", () => {
  const orders = [
    [target(9, 4000), target(2, 4000), target(5, 3000)],
    [target(2, 4000), target(5, 3000), target(9, 4000)],
  ];
  const results = orders.map((targets) => {
    const value = encounter("bulwark-needle", targets);
    value.stepMany(61);
    return { attack: attacks(value), state: value.state };
  });
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].state.buildings[0].targetId, 5);
  assert.equal(results[0].attack[0].targetId, 5);
});

test("buildings defensive: layer, mode, targetability, max range, and plus/minus one", () => {
  const probes = [
    { expected: null, value: target(1, 5501) },
    { expected: 1, value: target(1, 5500) },
    { expected: null, value: target(1, 5499, { layer: "air" }) },
    { expected: null, value: target(1, 5499, { targetable: false }) },
    { expected: 1, value: target(1, 5499, { kind: "structure" }) },
  ];
  for (const probe of probes) {
    const value = encounter("bulwark-needle", [probe.value]);
    value.stepMany(61);
    assert.equal(value.state.buildings[0].targetId, probe.expected);
  }
  const both = encounter("buried-coil", [target(3, 5500, { layer: "air" })]);
  both.stepMany(61);
  assert.equal(both.state.buildings[0].targetId, 3);
});

test("buildings defensive: plain attack timeline uses deploy, windup, cadence and damage", () => {
  const value = encounter("bulwark-needle", [target(7, 5000)]);
  value.stepMany(171);
  assert.deepEqual(attacks(value).map(({ amount, sequence, targetId, tick }) => ({
    amount, sequence, targetId, tick,
  })), [
    { amount: 212, sequence: 1, targetId: 7, tick: 60 },
    { amount: 212, sequence: 2, targetId: 7, tick: 114 },
    { amount: 212, sequence: 3, targetId: 7, tick: 168 },
  ]);
  assert.deepEqual(damages(value).map(({ healthAfter }) => healthAfter), [
    4788, 4576, 4364,
  ]);
});

test("buildings defensive: loss at deadline cancels and reacquisition restarts windup", () => {
  const value = encounter("ember-basin", [target(4, 4000)], [
    command(126, "move-target", {
      position: { x: ORIGIN.x + 7000, y: ORIGIN.y }, targetId: 4,
    }),
    command(127, "move-target", {
      position: { x: ORIGIN.x + 4000, y: ORIGIN.y }, targetId: 4,
    }),
  ]);
  value.stepMany(194);
  assert.deepEqual(attacks(value).map(({ tick }) => tick), [193]);
});

test("buildings defensive: splash uses inclusive literal geometry and stable simultaneous deaths", () => {
  const value = encounter("ember-basin", [
    target(7, 4000, { health: 222 }),
    target(2, 5000, { health: 222 }),
    target(9, 5001, { health: 222 }),
  ]);
  value.stepMany(129);
  assert.deepEqual(damages(value).map(({ targetId }) => targetId), [2, 7]);
  assert.deepEqual(
    value.replay.filter(({ type }) => type === "target-destroyed")
      .map(({ targetId }) => targetId),
    [2, 7],
  );
  assert.equal(value.state.targets.find(({ id }) => id === 9).health, 222);
});

test("buildings defensive: ramp stages advance on contact and reset on loss/change", () => {
  const retained = encounter("prism-furnace", [target(8, 4000)]);
  retained.stepMany(229);
  assert.deepEqual(attacks(retained).map(({ amount, stageIndex, tick }) => ({
    amount, stageIndex, tick,
  })), [
    { amount: 42, stageIndex: 0, tick: 132 },
    { amount: 42, stageIndex: 0, tick: 156 },
    { amount: 84, stageIndex: 1, tick: 180 },
    { amount: 84, stageIndex: 1, tick: 204 },
    { amount: 168, stageIndex: 2, tick: 228 },
  ]);

  const reset = encounter("prism-furnace", [target(8, 4000), target(9, 5000)], [
    command(181, "move-target", {
      position: { x: ORIGIN.x + 7000, y: ORIGIN.y }, targetId: 8,
    }),
  ]);
  reset.stepMany(254);
  assert.deepEqual(
    reset.replay.filter(({ type }) => type === "ramp-reset")
      .map(({ tick }) => tick),
    [181],
  );
  assert.deepEqual(attacks(reset).at(-1), {
    amount: 42, buildingId: 1, sequence: 4, stageIndex: 0,
    targetId: 9, tick: 253, type: "attack",
  });
});

test("buildings defensive differential: Prism stages and reset are canonical ramp state", () => {
  pinnedHash(
    "../src/content/cards/special-combat-ramp.js",
    "c643f8063f31394b95d605a817b86f377a411cb087a3e53adc2647edeab25c67",
  );
  pinnedHash(
    "../src/sim/attack-cycle.js",
    "983c30f8a27c144bf01917eaebe058adf4af4e210f00ad0d138a5731950ab6b8",
  );
  const value = encounter("prism-furnace", [target(8, 4000)]);
  value.stepMany(231);
  const primitive = ConsecutiveTargetRampEncounter.restore(
    value.state.buildings[0].rampPrimitive,
  );
  assert.deepEqual(
    {
      consecutiveContacts: value.state.buildings[0].consecutiveHits,
      stageIndex: value.state.buildings[0].stageIndex,
    },
    {
      consecutiveContacts: primitive.state.consecutiveContacts,
      stageIndex: primitive.state.stageIndex,
    },
  );
  assert.deepEqual(
    value.replay.filter(({ type }) => type === "ramp-contact")
      .map(({ consecutiveContacts, stageIndex }) => ({
        consecutiveContacts, stageIndex,
      })),
    [
      { consecutiveContacts: 1, stageIndex: 0 },
      { consecutiveContacts: 2, stageIndex: 1 },
      { consecutiveContacts: 3, stageIndex: 1 },
      { consecutiveContacts: 4, stageIndex: 2 },
      { consecutiveContacts: 5, stageIndex: 2 },
    ],
  );

  const reset = encounter("prism-furnace", [target(8, 4000), target(9, 5000)], [
    command(181, "move-target", {
      position: { x: ORIGIN.x + 7000, y: ORIGIN.y }, targetId: 8,
    }),
  ]);
  reset.stepMany(256);
  const resetPrimitive = ConsecutiveTargetRampEncounter.restore(
    reset.state.buildings[0].rampPrimitive,
  );
  assert.equal(resetPrimitive.state.consecutiveContacts, 1);
  assert.equal(reset.state.buildings[0].stageIndex, 0);
  assert.equal(resetPrimitive.state.tick, reset.state.tick);
  assert.deepEqual(reset.state.buildings[0].rampEvents, resetPrimitive.replay);
  assert.deepEqual(
    resetPrimitive.replay.filter(({ type }) => type === "ramp-reset"),
    [{ reason: "target-loss", targetId: 8, tick: 181, type: "ramp-reset" }],
  );
});

test("buildings defensive differential: Ember impact delegates inclusive stable area damage", () => {
  pinnedHash(
    "../src/sim/area-damage.js",
    "7836fb4e98109d63488ae6b7b3bc32247c8724c40c2f2d242704deb6c521af32",
  );
  const targets = [
    target(7, 4000, { health: 222 }),
    target(2, 5000, { health: 222 }),
    target(9, 5001, { health: 222 }),
  ];
  const value = encounter("ember-basin", targets);
  value.stepMany(129);

  const area = new AreaDamageSystem();
  for (const item of targets) area.add(item.id, item.health);
  const differential = area.resolve({
    center: target(7, 4000).position,
    damage: 222,
    mode: "ground",
    radius: 1000,
    tick: 128,
  }, targets.map((item) => ({
    alive: true, id: item.id, kind: item.kind, layer: item.layer,
    position: item.position, radius: item.radius, targetable: item.targetable,
  })));
  assert.deepEqual(damages(value).map(({ targetId }) => targetId), differential.hitTargetIds);
  assert.deepEqual(
    value.replay.filter(({ type }) => type === "target-destroyed")
      .map(({ targetId }) => targetId),
    differential.events.filter(({ type }) => type === "death")
      .map(({ targetId }) => targetId),
  );
  const persisted = AreaDamageSystem.restore(value.state.areaDamagePrimitive);
  assert.equal(persisted.nextEffectId, 2);
  assert.deepEqual(
    persisted.list().map(({ currentHealth, id }) => ({ currentHealth, id })),
    [
      { currentHealth: 0, id: 2 },
      { currentHealth: 0, id: 7 },
      { currentHealth: 222, id: 9 },
    ],
  );
  assert.deepEqual(value.state.areaDamageEvents, differential.events);
});

test("buildings defensive: concealed building is untargetable until same-boundary reveal", () => {
  const value = encounter("buried-coil", [target(3, 4000)], [
    command(0, "hide-target", { targetId: 3 }),
    command(10, "reveal-target", { targetId: 3 }),
    command(103, "hide-target", { targetId: 3 }),
  ]);
  assert.equal(value.state.buildings[0].hidden, true);
  assert.equal(value.state.buildings[0].targetable, false);
  value.stepMany(10);
  assert.equal(value.state.buildings[0].hidden, true);
  value.step();
  assert.deepEqual(
    value.replay.filter(({ type }) => type === "building-revealed"),
    [{ buildingId: 1, tick: 10, type: "building-revealed" }],
  );
  assert.equal(value.state.buildings[0].targetable, true);
  value.stepMany(92);
  assert.equal(attacks(value)[0].tick, 102);
  value.step();
  assert.equal(value.state.buildings[0].hidden, true);
  assert.equal(value.state.buildings[0].targetable, false);
  assert.equal(
    value.replay.filter(({ type }) => type === "building-hidden").at(-1).tick,
    103,
  );
});

test("buildings defensive differential: Buried concealment snapshots canonical visibility", () => {
  pinnedHash(
    "../src/content/cards/combat-status-invisibility.js",
    "306d99f8e818ab93a597e53b3dd7f0b19fc53c4f7f463a997ecee1528f2c809b",
  );
  pinnedHash(
    "../src/sim/targeting.js",
    "18bbad382730fe976e13934c98f50a7c999363429abeb7aa7501b78929f56470",
  );
  pinnedHash(
    "../src/sim/deployment.js",
    "f22067c2bfbd1ccdad6f913a50efa19899c7ee4254ffac35b473e3fb8978b563",
  );
  const value = encounter("buried-coil", [target(3, 4000)], [
    command(0, "hide-target", { targetId: 3 }),
    command(10, "reveal-target", { targetId: 3 }),
    command(20, "hide-target", { targetId: 3 }),
  ]);
  value.stepMany(10);
  let primitive = InvisibilityRevealEncounter.restore(
    value.state.buildings[0].visibilityPrimitive,
  );
  assert.equal(primitive.state.targets[0].visible, false);
  assert.equal(value.state.buildings[0].targetable, false);
  value.step();
  primitive = InvisibilityRevealEncounter.restore(
    value.state.buildings[0].visibilityPrimitive,
  );
  assert.equal(primitive.state.targets[0].visible, true);
  assert.equal(value.state.buildings[0].targetId, 3);
  value.stepMany(10);
  primitive = InvisibilityRevealEncounter.restore(
    value.state.buildings[0].visibilityPrimitive,
  );
  assert.equal(primitive.state.targets[0].visible, false);
  assert.equal(value.state.buildings[0].targetId, null);
  assert.equal(primitive.state.tick, value.state.tick);
  assert.deepEqual(value.state.buildings[0].visibilityEvents, primitive.replay);
  assert.deepEqual(
    primitive.replay.map(({ tick }) => tick),
    [...primitive.replay.map(({ tick }) => tick)].sort((a, b) => a - b),
  );
  assert.deepEqual(
    primitive.replay.filter(({ type }) =>
      ["hide-applied", "reveal-applied"].includes(type))
      .map(({ tick, type }) => ({ tick, type })),
    [
      { tick: 0, type: "hide-applied" },
      { tick: 10, type: "reveal-applied" },
      { tick: 20, type: "hide-applied" },
    ],
  );
});

test("buildings defensive: siege dead-zone and maximum boundaries are exact", () => {
  for (const [distance, expected] of [
    [2999, null], [3000, 1], [11500, 1], [11501, null],
  ]) {
    const value = encounter("horizon-caster", [target(1, distance)]);
    value.stepMany(211);
    assert.equal(value.state.buildings[0].targetId, expected, `distance ${distance}`);
  }
  const value = encounter("horizon-caster", [target(1, 3000)]);
  value.stepMany(451);
  assert.equal(attacks(value)[0].tick, 450);
});

test("buildings defensive: simultaneous buildings have stable IDs and ordered replay", () => {
  const value = new DefensiveBuildingEncounter(createDefensiveBuildingFixture([
    building("bulwark-needle", 9),
    building("bulwark-needle", 2),
  ], [target(50, 4000)]));
  value.stepMany(61);
  assert.deepEqual(value.state.buildings.map(({ id }) => id), [2, 9]);
  assert.deepEqual(attacks(value).map(({ buildingId }) => buildingId), [2, 9]);
});

test("buildings defensive differential: Bulwark and Horizon projectile lifecycle is canonical", () => {
  pinnedHash(
    "../src/sim/projectile.js",
    "7065af4288d2cb6617cecd5b18e37f75194ccb4e69013ea425ebb1749d1147aa",
  );
  const bulwark = encounter("bulwark-needle", [target(7, 5000)]);
  bulwark.stepMany(61);
  const bulwarkFlight = bulwark.state.projectiles[0];
  const canonical = ProjectileCombat.restore(bulwarkFlight.combat);
  const canonicalLaunch = canonical.replay.find(({ type }) => type === "launch");
  assert.equal(canonicalLaunch.projectile.impactTick, 2);
  bulwark.stepMany(2);
  const launch = bulwark.replay.find(({ type }) => type === "projectile-launched");
  const impact = bulwark.replay.find(({ type }) => type === "projectile-impact");
  let canonicalEvents = [];
  while (canonical.state.tick <= canonicalLaunch.projectile.impactTick) {
    canonicalEvents = canonical.step(canonical.state.tick);
  }
  const canonicalImpact = canonicalEvents.find(
    ({ projectileId, type }) => projectileId === 1 && type === "impact",
  );
  assert.deepEqual(
    { status: impact.status, tick: impact.tick - launch.tick },
    {
      status: canonicalImpact.status,
      tick: canonicalLaunch.projectile.impactTick,
    },
  );

  const horizon = encounter("horizon-caster", [target(8, 3000)], [
    command(451, "damage-target", { amount: 5000, targetId: 8 }),
  ]);
  horizon.stepMany(451);
  const horizonFlight = horizon.state.projectiles[0];
  assert.equal(ProjectileCombat.restore(horizonFlight.combat).state.tick, 1);
  assert.equal(horizonFlight.cancellationInjected, true);
  horizon.step();
  const resolvedHorizonFlight = horizon.state.projectiles[0];
  const canonicalFizzle = ProjectileCombat.restore(resolvedHorizonFlight.combat);
  const canonicalFizzleImpact = canonicalFizzle.replay.find(
    ({ projectileId, type }) => projectileId === 1 && type === "impact",
  );
  const horizonFizzle =
    horizon.replay.filter(({ type }) => type === "projectile-impact").at(-1);
  assert.deepEqual(
    horizonFizzle,
    {
      projectileId: 1, status: "target_dead", targetId: 8,
      tick: 451, type: "projectile-impact",
    },
  );
  assert.equal(horizonFizzle.status, canonicalFizzleImpact.status);
  assert.equal(canonicalFizzle.state.tick, 2);
  assert.equal(resolvedHorizonFlight.resolvedTick, 451);
  assert.equal(resolvedHorizonFlight.status, "target_dead");
  assert.deepEqual(resolvedHorizonFlight.canonicalEvents, canonicalFizzle.replay);
  assert.equal(
    canonicalFizzle.replay.filter(({ type }) => type === "launch").length,
    2,
  );

  const ordered = new DefensiveBuildingEncounter(createDefensiveBuildingFixture([
    building("bulwark-needle", 9),
    building("bulwark-needle", 2),
  ], [target(50, 4000)]));
  ordered.stepMany(61);
  const orderedPrimitiveStatuses = ordered.state.projectiles.map((flight) => {
    const primitive = ProjectileCombat.restore(flight.combat);
    let events = [];
    while (primitive.state.tick <= 2) events = primitive.step(primitive.state.tick);
    return events.find(
      ({ projectileId, type }) => projectileId === 1 && type === "impact",
    ).status;
  });
  ordered.stepMany(2);
  assert.deepEqual(
    ordered.replay.filter(({ type }) => type === "projectile-impact")
      .map(({ projectileId, status }) => ({ projectileId, status })),
    orderedPrimitiveStatuses.map((status, index) => ({
      projectileId: index + 1, status,
    })),
  );
});

test("buildings defensive: caller input, state, replay and step output are isolated", () => {
  const setup = createDefensiveBuildingFixture(
    [building("bulwark-needle")], [target(1, 4000)],
  );
  const value = new DefensiveBuildingEncounter(setup);
  setup.targets[0].position.x = 999999;
  const output = value.stepMany(63);
  output.at(-1).amount = 1;
  const state = value.state;
  state.targets[0].health = 1;
  const replay = value.replay;
  replay.length = 0;
  assert.equal(attacks(value)[0].amount, 212);
  assert.equal(value.state.targets[0].health, 4788);
});

test("buildings defensive: arbitrary chunks and every causal restore cut are identical", () => {
  const setup = createDefensiveBuildingFixture([
    building("bulwark-needle", 2),
    building("prism-furnace", 9),
  ], [target(4, 4000)], [
    command(181, "hide-target", { targetId: 4 }),
    command(181, "damage-target", { amount: 5000, targetId: 4 }),
    command(190, "reveal-target", { targetId: 4 }),
  ]);
  const whole = new DefensiveBuildingEncounter(setup);
  whole.stepMany(260);
  const expected = whole.serialize();
  assert.ok(whole.state.projectiles.some(({ status }) => status === "contact"));
  assert.ok(whole.state.projectiles.some(({ status }) => status === "target_dead"));
  assert.ok(whole.state.projectiles.some(({ cancellationInjected }) =>
    cancellationInjected));
  for (const flight of whole.state.projectiles) {
    const primitive = ProjectileCombat.restore(flight.combat);
    assert.deepEqual(flight.canonicalEvents, primitive.replay);
  }

  for (const chunks of [[260], [1, 59, 1, 120, 79], [17, 31, 53, 71, 88]]) {
    const value = new DefensiveBuildingEncounter(setup);
    for (const count of chunks) value.stepMany(count);
    assert.equal(value.serialize(), expected);
  }
  for (let cut = 0; cut <= 260; cut += 1) {
    const value = new DefensiveBuildingEncounter(setup);
    value.stepMany(cut);
    const restored = DefensiveBuildingEncounter.restore(value.serialize());
    restored.stepMany(260 - cut);
    assert.equal(restored.serialize(), expected, `cut ${cut}`);
  }
});

test("buildings defensive: canonical snapshots reject noncausal and malformed data", () => {
  const value = encounter("bulwark-needle", [target(1, 4000)]);
  value.stepMany(61);
  const serialized = value.serialize();
  assert.equal(DefensiveBuildingEncounter.restore(serialized).serialize(), serialized);
  const parsed = JSON.parse(serialized);
  const invalid = [
    "not json",
    JSON.stringify(parsed, null, 2),
    JSON.stringify({ ...parsed, version: 2 }),
    JSON.stringify({ ...parsed, extra: true }),
    JSON.stringify({ ...parsed, state: { ...parsed.state, tick: 60 } }),
    JSON.stringify({ ...parsed, state: { ...parsed.state, history: [] } }),
  ];
  for (const item of invalid) assert.throws(() => DefensiveBuildingEncounter.restore(item));
  assert.throws(() => DefensiveBuildingEncounter.restore({}), /must be a string/);
  assert.throws(
    () => DefensiveBuildingEncounter.restore(" ".repeat(1_048_577)),
    /byte bound/,
  );
});

test("buildings defensive: hostile objects, arrays, IDs and numeric bounds reject atomically", () => {
  const valid = createDefensiveBuildingFixture(
    [building("bulwark-needle")], [target(2, 4000)],
  );
  const hostileSetups = [
    { ...valid, extra: true },
    Object.assign(Object.create({ inherited: true }), valid),
    { ...valid, buildings: [, building("bulwark-needle")] },
    { ...valid, buildings: Object.assign([building("bulwark-needle")], { extra: true }) },
    { ...valid, buildings: [building("bulwark-needle"), building("ember-basin")] },
    { ...valid, targets: [target(2, 4000), target(2, 5000)] },
    { ...valid, targets: [target(Number.MAX_SAFE_INTEGER + 1, 4000)] },
    { ...valid, targets: [target(2, 4000, { health: 1_000_001 })] },
    { ...valid, targets: [target(2, 4000, { radius: 100_001 })] },
    { ...valid, commands: [command(4096, "hide-target", { targetId: 2 })] },
    {
      ...valid,
      buildings: Array.from(
        { length: 17 },
        (_, index) => building("bulwark-needle", index + 1),
      ),
    },
    {
      ...valid,
      targets: Array.from(
        { length: 65 },
        (_, index) => target(index + 2, 4000),
      ),
    },
    {
      ...valid,
      commands: Array.from(
        { length: 257 },
        () => command(0, "hide-target", { targetId: 2 }),
      ),
    },
  ];
  const getter = { ...valid };
  Object.defineProperty(getter, "targets", {
    enumerable: true, get() { throw new Error("getter executed"); },
  });
  hostileSetups.push(getter);
  const symbols = createDefensiveBuildingFixture([building("bulwark-needle")], []);
  symbols[Symbol("bad")] = true;
  hostileSetups.push(symbols);
  for (const setup of hostileSetups) {
    assert.throws(() => new DefensiveBuildingEncounter(setup));
  }

  const value = new DefensiveBuildingEncounter(valid);
  value.stepMany(10);
  const before = value.serialize();
  for (const count of [-1, 0.5, Number.MAX_SAFE_INTEGER, "1", null]) {
    assert.throws(() => value.stepMany(count));
    assert.equal(value.serialize(), before);
  }
  assert.throws(() => value.stepMany(4096), /encounter bound/);
  assert.equal(value.serialize(), before);
});

test("buildings defensive: runtime has no reference path, RNG, clock, float, or protected identity", () => {
  const source = readFileSync(
    new URL("../src/content/cards/buildings-defensive.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /(?:^|[/"'])reference(?:[/"']|$)/imu);
  assert.doesNotMatch(source, /Math\.random|Date\.|performance\.|setTimeout|setInterval/u);
  assert.doesNotMatch(source, /\b\d+\.\d+\b/u);
  const protectedTokens = [
    "Cannon", "Bomb Tower", "Inferno Tower", "Tesla", "Mortar", "X-Bow",
  ];
  for (const token of protectedTokens) {
    assert.equal(source.toLowerCase().includes(`"${token.toLowerCase()}"`), false);
  }
});
