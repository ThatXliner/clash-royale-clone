import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CrownTowerBattle,
  TOWER_COMBAT_CONFIG,
  TOWER_TICKS_PER_SECOND,
  TOWER_WINDUP_ESTIMATE,
  towerSecondsToTicks,
} from "../src/sim/towers.js";

const reference = JSON.parse(readFileSync(
  new URL("../reference/stats/towers.json", import.meta.url),
  "utf8",
));

const windups = () => ({
  central: TOWER_WINDUP_ESTIMATE.central.ticks,
  lane: TOWER_WINDUP_ESTIMATE.lane.ticks,
});

const noInput = () => ({ candidates: [], damage: [] });
const candidate = ({
  alive = true,
  id,
  layer = "ground",
  position,
  radius = 0,
  targetable = true,
}) => ({
  alive,
  id,
  kind: "troop",
  layer,
  position,
  radius,
  targetable,
});

function tower(state, id) {
  return state.towers.find((entry) => entry.id === id);
}

function snapshot(battle) {
  return JSON.parse(battle.serialize());
}

test("towers: runtime level-11 combat values match test-only reference", () => {
  const centralReference = reference.towers.find(
    (entry) => entry.key === "king_tower",
  );
  const laneReference = reference.towers.find(
    (entry) => entry.key === "princess_tower",
  );
  const rows = [
    ["central.count", TOWER_COMBAT_CONFIG.central.countPerSide, centralReference.count_per_side],
    ["central.hp", TOWER_COMBAT_CONFIG.central.hitpoints, centralReference.hitpoints],
    ["central.damage", TOWER_COMBAT_CONFIG.central.damage, centralReference.damage],
    ["central.cadence", TOWER_COMBAT_CONFIG.central.hitSpeedTicks, towerSecondsToTicks(String(centralReference.hit_speed_seconds))],
    ["central.range", TOWER_COMBAT_CONFIG.central.rangeMillitiles, centralReference.range_tiles * 1000],
    ["lane.count", TOWER_COMBAT_CONFIG.lane.countPerSide, laneReference.count_per_side],
    ["lane.hp", TOWER_COMBAT_CONFIG.lane.hitpoints, laneReference.hitpoints],
    ["lane.damage", TOWER_COMBAT_CONFIG.lane.damage, laneReference.damage],
    ["lane.cadence", TOWER_COMBAT_CONFIG.lane.hitSpeedTicks, towerSecondsToTicks(String(laneReference.hit_speed_seconds))],
    ["lane.range", TOWER_COMBAT_CONFIG.lane.rangeMillitiles, laneReference.range_tiles * 1000],
  ];
  for (const [field, ours, comparison] of rows) {
    console.log(`${field}: ours=${ours} reference=${comparison}`);
    assert.equal(ours, comparison);
  }
  assert.equal(TOWER_TICKS_PER_SECOND, 60);
  assert.equal(TOWER_COMBAT_CONFIG.central.targets, centralReference.targets);
  assert.equal(TOWER_COMBAT_CONFIG.lane.targets, laneReference.targets);
  assert.equal(centralReference.unverified_fields.includes("first_hit_seconds"), true);
  assert.equal(laneReference.first_hit_seconds, null);
  assert.equal(TOWER_WINDUP_ESTIMATE.central.confidence, "unverified_estimate");
  assert.equal(TOWER_WINDUP_ESTIMATE.lane.confidence, "unspecified_estimate");
});

test("towers: six neutral towers initialize at centralized arena positions", () => {
  const battle = new CrownTowerBattle({ initialWindupTicks: windups() });
  assert.deepEqual(
    battle.state.towers.map(({ active, hitpoints, id, lane, position, role, side }) => ({
      active, hitpoints, id, lane, position, role, side,
    })),
    [
      {
        active: false,
        hitpoints: 4824,
        id: "south:central",
        lane: null,
        position: { x: 9000, y: 3000 },
        role: "central",
        side: "south",
      },
      {
        active: true,
        hitpoints: 3052,
        id: "south:lane:west",
        lane: "west",
        position: { x: 3500, y: 7500 },
        role: "lane",
        side: "south",
      },
      {
        active: true,
        hitpoints: 3052,
        id: "south:lane:east",
        lane: "east",
        position: { x: 14500, y: 7500 },
        role: "lane",
        side: "south",
      },
      {
        active: false,
        hitpoints: 4824,
        id: "north:central",
        lane: null,
        position: { x: 9000, y: 29000 },
        role: "central",
        side: "north",
      },
      {
        active: true,
        hitpoints: 3052,
        id: "north:lane:west",
        lane: "west",
        position: { x: 3500, y: 24500 },
        role: "lane",
        side: "north",
      },
      {
        active: true,
        hitpoints: 3052,
        id: "north:lane:east",
        lane: "east",
        position: { x: 14500, y: 24500 },
        role: "lane",
        side: "north",
      },
    ],
  );
});

test("towers: central activation is permanent and emitted exactly once", () => {
  const battle = new CrownTowerBattle({ initialWindupTicks: windups() });
  assert.deepEqual(battle.step({
    candidates: [],
    damage: [{ amount: 1, towerId: "south:central" }],
  }), [{
    cause: "damaged",
    tick: 0,
    towerId: "south:central",
    type: "tower-activated",
  }]);
  assert.equal(tower(battle.state, "south:central").active, true);
  assert.deepEqual(battle.state.activationHistory.south, {
    cause: "damaged",
    tick: 0,
  });
  assert.deepEqual(battle.step({
    candidates: [],
    damage: [{ amount: 1, towerId: "south:central" }],
  }), []);
  assert.equal(tower(battle.state, "south:central").active, true);
  assert.deepEqual(battle.state.activationHistory.south, {
    cause: "damaged",
    tick: 0,
  });

  const laneDeath = new CrownTowerBattle({ initialWindupTicks: windups() });
  const events = laneDeath.step({
    candidates: [],
    damage: [
      { amount: 3052, towerId: "north:lane:west" },
      { amount: 3052, towerId: "north:lane:east" },
    ],
  });
  assert.deepEqual(events, [
    {
      cause: "friendly-lane-destroyed",
      tick: 0,
      towerId: "north:central",
      type: "tower-activated",
    },
    {
      tick: 0,
      towerId: "north:lane:east",
      type: "tower-destroyed",
    },
    {
      tick: 0,
      towerId: "north:lane:west",
      type: "tower-destroyed",
    },
  ]);
  assert.equal(tower(laneDeath.state, "north:central").active, true);
  assert.deepEqual(laneDeath.state.activationHistory.north, {
    cause: "friendly-lane-destroyed",
    tick: 0,
  });
  assert.deepEqual(laneDeath.step({
    candidates: [],
    damage: [{ amount: 10, towerId: "north:lane:west" }],
  }), []);
});

test("towers: simultaneous damage ordering is stable and dead towers never fire", () => {
  const battle = new CrownTowerBattle({
    initialWindupTicks: { central: 0, lane: 0 },
  });
  const nearby = candidate({
    id: 8,
    layer: "air",
    position: { x: 9000, y: 1000 },
  });
  const events = battle.step({
    candidates: [nearby],
    damage: [
      { amount: 4000, towerId: "south:central" },
      { amount: 824, towerId: "south:central" },
      { amount: 3052, towerId: "south:lane:east" },
    ],
  });
  assert.deepEqual(events, [
    {
      cause: "damaged",
      tick: 0,
      towerId: "south:central",
      type: "tower-activated",
    },
    {
      tick: 0,
      towerId: "south:central",
      type: "tower-destroyed",
    },
    {
      tick: 0,
      towerId: "south:lane:east",
      type: "tower-destroyed",
    },
  ]);
  assert.equal(tower(battle.state, "south:central").hitpoints, 0);
  assert.deepEqual(battle.state.activationHistory.south, {
    cause: "damaged",
    tick: 0,
  });
  assert.equal(tower(battle.state, "south:central").attack.attackSequence, 0);
});

test("towers: activation provenance covers both sides and simultaneous lane deaths", () => {
  const battle = new CrownTowerBattle({
    initialWindupTicks: { central: 0, lane: 0 },
  });
  assert.deepEqual(battle.state.activationHistory, {
    north: null,
    south: null,
  });

  const events = battle.step({
    candidates: [],
    damage: [
      { amount: 4824, towerId: "north:central" },
      { amount: 3052, towerId: "south:lane:west" },
      { amount: 3052, towerId: "south:lane:east" },
    ],
  });
  assert.deepEqual(
    events.filter((event) => event.type === "tower-activated"),
    [
      {
        cause: "damaged",
        tick: 0,
        towerId: "north:central",
        type: "tower-activated",
      },
      {
        cause: "friendly-lane-destroyed",
        tick: 0,
        towerId: "south:central",
        type: "tower-activated",
      },
    ],
  );
  assert.deepEqual(battle.state.activationHistory, {
    north: { cause: "damaged", tick: 0 },
    south: { cause: "friendly-lane-destroyed", tick: 0 },
  });

  assert.deepEqual(battle.step({
    candidates: [],
    damage: [
      { amount: 1, towerId: "north:central" },
      { amount: 1, towerId: "south:central" },
    ],
  }).filter((event) => event.type === "tower-activated"), []);
  assert.deepEqual(battle.state.activationHistory, {
    north: { cause: "damaged", tick: 0 },
    south: { cause: "friendly-lane-destroyed", tick: 0 },
  });
});

test("towers: target layers, eligibility, range boundary, and ties reuse targeting semantics", () => {
  const create = () => new CrownTowerBattle({
    initialWindupTicks: { central: 0, lane: 0 },
  });
  const westPosition = { x: 3500, y: 7500 };
  for (const layer of ["ground", "air"]) {
    const battle = create();
    const events = battle.step({
      candidates: [candidate({ id: 20, layer, position: westPosition })],
      damage: [],
    });
    assert.equal(events.some(
      (event) =>
        event.towerId === "south:lane:west" &&
        event.targetId === 20 &&
        event.type === "shot-ready",
    ), true);
  }

  const exactBoundary = create();
  const boundaryEvents = exactBoundary.step({
    candidates: [
      candidate({ id: 7, position: { x: 11000, y: 7500 } }),
      candidate({ id: 3, position: { x: 3500, y: 0 } }),
    ],
    damage: [],
  });
  assert.equal(
    boundaryEvents.find(
      (event) => event.towerId === "south:lane:west",
    ).targetId,
    3,
  );

  const invalid = create();
  assert.equal(invalid.step({
    candidates: [
      candidate({ alive: false, id: 1, position: westPosition }),
      candidate({ id: 2, position: westPosition, targetable: false }),
      candidate({ id: 3, position: { x: 11001, y: 7500 } }),
    ],
    damage: [],
  }).some((event) => event.towerId === "south:lane:west"), false);
});

test("towers: shot-ready cadence contains no invented projectile timing", () => {
  const battle = new CrownTowerBattle({
    initialWindupTicks: { central: 0, lane: 2 },
  });
  const observation = {
    candidates: [candidate({
      id: 4,
      position: { x: 3500, y: 7500 },
    })],
    damage: [],
  };
  assert.deepEqual(battle.step(observation), []);
  assert.deepEqual(battle.step(observation), []);
  const first = battle.step(observation).find(
    (event) => event.towerId === "south:lane:west",
  );
  assert.deepEqual(first, {
    damage: 109,
    sequence: 1,
    targetId: 4,
    tick: 2,
    towerId: "south:lane:west",
    type: "shot-ready",
  });
  assert.equal(Object.hasOwn(first, "projectileSpeed"), false);
  assert.equal(Object.hasOwn(first, "contactTick"), false);

  const middle = Array.from({ length: 47 }, () => observation);
  assert.equal(battle.stepMany(middle).some(
    (event) => event.towerId === "south:lane:west",
  ), false);
  assert.deepEqual(
    battle.step(observation).filter(
      (event) => event.towerId === "south:lane:west",
    ),
    [{
      damage: 109,
      sequence: 2,
      targetId: 4,
      tick: 50,
      towerId: "south:lane:west",
      type: "shot-ready",
    }],
  );
});

test("towers: chunking and serialize/restore are byte-identical", () => {
  const inputs = Array.from({ length: 80 }, (_, tick) => ({
    candidates: [candidate({
      id: tick < 30 ? 11 : 12,
      layer: tick % 2 === 0 ? "air" : "ground",
      position: { x: 3500, y: 7500 },
    })],
    damage: tick === 5
      ? [{ amount: 1, towerId: "south:central" }]
      : [],
  }));
  const chunked = new CrownTowerBattle({
    initialWindupTicks: { central: 3, lane: 2 },
  });
  const singles = new CrownTowerBattle({
    initialWindupTicks: { central: 3, lane: 2 },
  });
  assert.deepEqual(
    chunked.stepMany(inputs),
    inputs.flatMap((input) => singles.step(input)),
  );
  assert.equal(chunked.serialize(), singles.serialize());

  const restored = CrownTowerBattle.restore(chunked.serialize());
  assert.equal(restored.serialize(), chunked.serialize());
  const tail = Array.from({ length: 60 }, () => noInput());
  assert.deepEqual(restored.stepMany(tail), chunked.stepMany(tail));
  assert.equal(restored.serialize(), chunked.serialize());
});

test("towers: invalid batches and snapshots reject atomically", () => {
  const battle = new CrownTowerBattle({ initialWindupTicks: windups() });
  const before = battle.serialize();
  assert.throws(() => battle.stepMany([
    noInput(),
    { candidates: [], damage: [{ amount: -1, towerId: "south:central" }] },
  ]), /non-negative/);
  assert.equal(battle.serialize(), before);
  assert.throws(() => battle.step({
    candidates: [],
    damage: [{ amount: 1, towerId: "unknown" }],
  }), /unknown/);
  assert.equal(battle.serialize(), before);
  assert.throws(
    () => new CrownTowerBattle({ initialWindupTicks: { central: 0 } }),
    /invalid shape/,
  );
  assert.throws(() => CrownTowerBattle.restore("{}"));
  assert.throws(() => CrownTowerBattle.restore("not-json"));
});

test("towers: restore derives activation provenance only from causal steps", () => {
  const pristine = new CrownTowerBattle({ initialWindupTicks: windups() });
  const valid = snapshot(pristine);
  assert.deepEqual(valid, {
    initialWindupTicks: windups(),
    steps: [],
    version: 3,
  });

  // The former v2 metadata-only forgery has no accepted representation. Adding
  // asserted HP/active/history fields changes the exact snapshot shape.
  const metadataForgery = {
    initialWindupTicks: windups(),
    state: {
      activationHistory: {
        north: null,
        south: { cause: "damaged", tick: 0 },
      },
      nextTick: 1,
      towers: [{ active: true, hitpoints: 4823, id: "south:central" }],
    },
    steps: [],
    version: 3,
  };
  assert.throws(
    () => CrownTowerBattle.restore(JSON.stringify(metadataForgery)),
    /invalid shape/,
  );

  const directlyActivated = new CrownTowerBattle({
    initialWindupTicks: { central: 0, lane: 0 },
  });
  directlyActivated.step({
    candidates: [],
    damage: [{ amount: 1, towerId: "south:central" }],
  });
  const directSerialized = directlyActivated.serialize();
  const directRestored = CrownTowerBattle.restore(directSerialized);
  assert.equal(directRestored.serialize(), directSerialized);
  assert.equal(tower(directRestored.state, "south:central").hitpoints, 4823);
  assert.deepEqual(directRestored.state.activationHistory.south, {
    cause: "damaged",
    tick: 0,
  });

  const laneActivated = new CrownTowerBattle({
    initialWindupTicks: { central: 0, lane: 0 },
  });
  laneActivated.step({
    candidates: [],
    damage: [{ amount: 3052, towerId: "north:lane:east" }],
  });
  const laneRestored = CrownTowerBattle.restore(laneActivated.serialize());
  assert.deepEqual(laneRestored.state.activationHistory.north, {
    cause: "friendly-lane-destroyed",
    tick: 0,
  });

  const pristineBytes = pristine.serialize();
  assert.notEqual(directSerialized, pristineBytes);
  assert.notDeepEqual(snapshot(directlyActivated).steps, snapshot(pristine).steps);

  // A changed causal command is a different replay, never the same alleged
  // state with self-asserted metadata. Restore derives the corresponding state.
  const changedAmount = snapshot(directlyActivated);
  changedAmount.steps[0].damage[0].amount = 2;
  const changedAmountRestored = CrownTowerBattle.restore(
    JSON.stringify(changedAmount),
  );
  assert.equal(
    tower(changedAmountRestored.state, "south:central").hitpoints,
    4822,
  );
  assert.notEqual(changedAmountRestored.serialize(), directSerialized);

  const changedTarget = snapshot(directlyActivated);
  changedTarget.steps[0].damage[0].towerId = "south:lane:west";
  const changedTargetRestored = CrownTowerBattle.restore(
    JSON.stringify(changedTarget),
  );
  assert.equal(
    tower(changedTargetRestored.state, "south:lane:west").hitpoints,
    3051,
  );
  assert.equal(changedTargetRestored.state.activationHistory.south, null);
  assert.notEqual(changedTargetRestored.serialize(), directSerialized);

  const ordered = new CrownTowerBattle({
    initialWindupTicks: { central: 0, lane: 0 },
  });
  ordered.step(noInput());
  ordered.step({
    candidates: [],
    damage: [{ amount: 1, towerId: "south:central" }],
  });
  const reordered = snapshot(ordered);
  reordered.steps.reverse();
  const reorderedRestored = CrownTowerBattle.restore(JSON.stringify(reordered));
  assert.equal(reorderedRestored.state.activationHistory.south.tick, 0);
  assert.notEqual(reorderedRestored.serialize(), ordered.serialize());
});

test("towers: replay history is strictly shaped and bounded", () => {
  const base = snapshot(
    new CrownTowerBattle({ initialWindupTicks: windups() }),
  );
  for (const steps of [
    [{ candidates: [], damage: [], extra: true }],
    [{ candidates: [], damage: [{ amount: 1, towerId: "unknown" }] }],
    [{ candidates: [candidate({
      id: 1,
      position: { x: 0, y: 0 },
    }), candidate({
      id: 1,
      position: { x: 1, y: 0 },
    })], damage: [] }],
  ]) {
    const malformed = structuredClone(base);
    malformed.steps = steps;
    assert.throws(() => CrownTowerBattle.restore(JSON.stringify(malformed)));
  }

  const excessive = structuredClone(base);
  excessive.steps = Array.from({ length: 100_001 }, noInput);
  assert.throws(
    () => CrownTowerBattle.restore(JSON.stringify(excessive)),
    /exceeds 100000 ticks/,
  );
});
