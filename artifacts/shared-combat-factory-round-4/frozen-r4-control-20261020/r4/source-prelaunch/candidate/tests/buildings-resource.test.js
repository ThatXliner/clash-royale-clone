import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ResourceBuildingEncounter,
  createResourceBuildingCatalog,
  createResourceBuildingCorpusRecords,
  createResourceBuildingFixture,
  createResourceBuildingQuestionRecords,
} from "../src/content/cards/buildings-resource.js";
import { ElixirMatch } from "../src/sim/elixir.js";

const POSITION = Object.freeze({ x: 9_000, y: 12_000 });

function building(id = 1, side = "south", overrides = {}) {
  return {
    destroyedOpposingLaneTowers: [],
    id,
    position: {
      ...POSITION,
      x: POSITION.x + id,
      y: side === "north" ? 20_000 : POSITION.y,
    },
    side,
    ...overrides,
  };
}

function command(tick, type, overrides = {}) {
  return {
    amount: 1,
    buildingId: null,
    side: null,
    tick,
    type,
    ...overrides,
  };
}

function encounter(
  buildings = [building()],
  commands = [],
  startingResource = { north: 0, south: 0 },
) {
  return new ResourceBuildingEncounter(
    createResourceBuildingFixture(buildings, commands, startingResource),
  );
}

function generated(value) {
  return value.replay.filter(({ type }) => type === "resource-generated");
}

test("buildings resource: original catalog and confidence stay isolated", () => {
  const card = createResourceBuildingCatalog()[0];
  assert.deepEqual({
    cost: card.cost,
    deploy: card.deployTimeTicks,
    hp: card.hitpoints,
    id: card.id,
    kind: card.kind,
    movement: card.movementMillitilesPerSecond,
    target: card.targetMode,
  }, {
    cost: 6,
    deploy: 60,
    hp: 1_070,
    id: "aether-well",
    kind: "structure",
    movement: 0,
    target: "none",
  });
  const records = createResourceBuildingCorpusRecords();
  assert.equal(records["aether-well"].cost.authoritative, true);
  assert.equal(records["aether-well"].hitpoints.confidence, "unverified");
  assert.ok(Object.isFrozen(records["aether-well"]));
  assert.notEqual(records, createResourceBuildingCorpusRecords());
});

test("buildings resource: every absent policy is an isolated frozen QUESTION", () => {
  const first = createResourceBuildingQuestionRecords();
  assert.deepEqual(Object.keys(first).sort(), [
    "commandOrderingPolicy", "deploymentBoundary", "generationAmount",
    "generationCadenceTicks", "generationFirstBoundary",
    "generationWhileCapped", "lifetimeDestructionBoundary", "lifetimeTicks",
    "ownershipPolicy", "placementPolicy", "resourceCapacity",
    "simultaneousGenerationOrder",
  ].sort());
  assert.ok(Object.isFrozen(first));
  for (const [key, record] of Object.entries(first)) {
    assert.deepEqual(
      [record.authoritative, record.confidence, record.disposition, record.key],
      [false, "absent", "question", key],
    );
    assert.ok(Object.isFrozen(record));
  }
  assert.notEqual(first, createResourceBuildingQuestionRecords());
  assert.throws(() => createResourceBuildingQuestionRecords({}), /do not accept/);
});

test("buildings resource: deployment is copied, legal, stationary, and exact", () => {
  const input = building();
  const value = encounter([input]);
  input.position.x = 1;
  value.stepMany(60);
  assert.equal(value.state.buildings[0].deployed, false);
  assert.deepEqual(value.state.buildings[0].position, { x: 9_001, y: 12_000 });
  assert.deepEqual(value.step(), [{
    buildingId: 1,
    side: "south",
    tick: 60,
    type: "building-deployed",
  }]);
  assert.throws(() => encounter([
    building(1, "south", { position: { x: 9_000, y: 16_000 } }),
  ]), /placement is illegal: river_excluded/);
});

test("buildings resource: cadence, amount, lifetime count, and trace are exact", () => {
  const value = encounter();
  value.stepMany(4_200);
  assert.deepEqual(generated(value).map((event) => [
    event.tick,
    event.amountGranted,
    event.amountAfter,
  ]), [
    [510, 1, 4],
    [1_020, 1, 8],
    [1_530, 0, 10],
    [2_040, 0, 10],
    [2_550, 0, 10],
    [3_060, 0, 10],
    [3_570, 0, 10],
    [4_080, 0, 10],
  ]);
  assert.deepEqual(value.state.elixir.sides, {
    north: { accumulator: 0, amount: 10 },
    south: { accumulator: 0, amount: 10 },
  });
  assert.equal(value.state.buildings[0].alive, true);
  assert.deepEqual(value.step(), [{
    buildingId: 1,
    reason: "lifetime",
    tick: 4_200,
    type: "building-destroyed",
  }]);
});

test("buildings resource: generation obeys ownership, cap, and stable id order", () => {
  const value = encounter(
    [building(9, "north"), building(2, "south"), building(5, "south")],
    [],
    { north: 9, south: 9 },
  );
  value.stepMany(511);
  assert.deepEqual(value.state.elixir.sides, {
    north: { accumulator: 0, amount: 10 },
    south: { accumulator: 0, amount: 10 },
  });
  assert.deepEqual(generated(value).map((event) => [
    event.buildingId,
    event.side,
    event.amountGranted,
    event.amountAfter,
  ]), [
    [2, "south", 0, 10],
    [5, "south", 0, 10],
    [9, "north", 0, 10],
  ]);
});

test("buildings resource: same-boundary commands precede destruction and pulses", () => {
  const lethal = encounter([building()], [
    command(510, "damage-building", {
      amount: 1_070,
      buildingId: 1,
    }),
  ]);
  lethal.stepMany(511);
  assert.deepEqual(lethal.replay.slice(-2), [
    {
      amountApplied: 1_070,
      amountRequested: 1_070,
      buildingId: 1,
      sequence: 0,
      tick: 510,
      type: "building-damaged",
    },
    {
      buildingId: 1,
      reason: "damage",
      tick: 510,
      type: "building-destroyed",
    },
  ]);
  assert.equal(generated(lethal).length, 0);

  const opened = encounter([building()], [
    command(510, "spend-resource", { amount: 1, side: "south" }),
  ], { north: 10, south: 10 });
  opened.stepMany(511);
  assert.deepEqual(opened.replay.slice(-2).map(({ type, amountAfter }) => [
    type,
    amountAfter,
  ]), [
    ["resource-spent", 9],
    ["resource-generated", 10],
  ]);

  const fixture = createResourceBuildingFixture(
    [building(4, "south"), building(1, "south"), building(2, "north")],
    [
      command(167, "spend-resource", { amount: 1, side: "south" }),
      command(510, "spend-resource", { amount: 2, side: "south" }),
      command(510, "damage-building", {
        amount: 1_070, buildingId: 4,
      }),
      command(4_200, "damage-building", {
        amount: 1_070, buildingId: 2,
      }),
    ],
    { north: 1, south: 2 },
  );
  const composed = new ResourceBuildingEncounter(fixture);
  const direct = new ElixirMatch({
    startingElixir: { north: 1, south: 2 },
  });
  direct.scheduleSpend(167, "south", 1);
  direct.scheduleSpend(510, "south", 2);
  const alive = new Set([1, 2, 4]);
  for (let tick = 0; tick <= 4_200; tick += 1) {
    if (tick === 510) alive.delete(4);
    if (tick === 4_200) alive.delete(2);
    const grants = tick > 0 && tick % 510 === 0
      ? [...alive]
        .filter((id) => tick < 4_200)
        .sort((left, right) => left - right)
        .map((sourceId) => ({
          amount: 1,
          side: sourceId === 2 ? "north" : "south",
          sourceId,
        }))
      : [];
    direct.step({ grants });
    composed.step();
    assert.deepEqual(composed.state.elixir, direct.state, `state tick ${tick}`);
    assert.equal(
      JSON.parse(composed.serialize()).elixirSnapshotBytes,
      direct.serialize(),
      `canonical bytes tick ${tick}`,
    );
  }
  assert.equal(
    composed.replay.find((event) =>
      event.tick === 4_200 && event.type === "building-destroyed"
    ).reason,
    "damage",
  );
});

test("buildings resource: insufficient spending is byte-atomic for balances", () => {
  const value = encounter([], [
    command(0, "spend-resource", { amount: 2, side: "south" }),
  ], { north: 0, south: 1 });
  value.step();
  assert.deepEqual(value.state.elixir.sides.south, {
    accumulator: 1,
    amount: 1,
  });
  assert.deepEqual(value.replay, [{
    accepted: false,
    amountAfter: 1,
    amountRequested: 2,
    reason: "insufficient_resource",
    sequence: 0,
    side: "south",
    tick: 0,
    type: "resource-spent",
  }]);
});

test("buildings resource: chunks and every boundary restore are identical", () => {
  const fixture = createResourceBuildingFixture(
    [building(3, "north"), building(1, "south")],
    [
      command(510, "spend-resource", { amount: 2, side: "south" }),
      command(1_020, "damage-building", {
        amount: 400,
        buildingId: 3,
      }),
      command(1_530, "damage-building", {
        amount: 670,
        buildingId: 3,
      }),
    ],
    { north: 8, south: 2 },
  );
  const whole = new ResourceBuildingEncounter(fixture);
  whole.stepMany(1_700);
  const chunks = new ResourceBuildingEncounter(fixture);
  for (const count of [1, 59, 450, 510, 680]) chunks.stepMany(count);
  assert.equal(chunks.serialize(), whole.serialize());
  assert.equal(chunks.replayBytes(), whole.replayBytes());
  assert.deepEqual(chunks.state, whole.state);

  for (let cut = 0; cut <= 1_700; cut += 1) {
    const split = new ResourceBuildingEncounter(fixture);
    split.stepMany(cut);
    const restored = ResourceBuildingEncounter.restore(split.serialize());
    restored.stepMany(1_700 - cut);
    assert.equal(restored.serialize(), whole.serialize(), `snapshot at ${cut}`);
    assert.equal(restored.replayBytes(), whole.replayBytes(), `replay at ${cut}`);
    assert.deepEqual(restored.state, whole.state, `state at ${cut}`);
  }
});

test("buildings resource: post-grant spends retain canonical elixir sequence", () => {
  const starting = new ElixirMatch({
    startingElixir: { north: 3, south: 3 },
  });
  starting.step({
    grants: [{ amount: 1, side: "north", sourceId: 99 }],
  });
  const fixture = createResourceBuildingFixture(
    [building(1, "south")],
    [command(510, "spend-resource", { amount: 2, side: "north" })],
    starting,
  );
  const whole = new ResourceBuildingEncounter(fixture);
  whole.stepMany(510);
  const split = new ResourceBuildingEncounter(fixture);
  split.stepMany(509);
  const restored = ResourceBuildingEncounter.restore(split.serialize());
  restored.step();

  assert.equal(restored.serialize(), whole.serialize());
  assert.equal(restored.replayBytes(), whole.replayBytes());
  assert.deepEqual(restored.state, whole.state);
  const elixirSnapshot = JSON.parse(
    JSON.parse(whole.serialize()).elixirSnapshotBytes,
  );
  assert.deepEqual(
    [
      ...elixirSnapshot.commands.map(({ sequence }) => sequence),
      ...elixirSnapshot.grants.map(({ sequence }) => sequence),
    ].sort((left, right) => left - right),
    [0, 1, 2],
  );
});

test("buildings resource: snapshots contain canonical causal inputs only", () => {
  const value = encounter([building()], [
    command(510, "spend-resource", { amount: 1, side: "south" }),
  ], { north: 3, south: 4 });
  value.stepMany(700);
  const bytes = value.serialize();
  const snapshot = JSON.parse(bytes);
  assert.deepEqual(Object.keys(snapshot).sort(), [
    "elixirSnapshotBytes", "identity", "version",
  ]);
  assert.equal("state" in snapshot, false);
  assert.equal("history" in snapshot, false);
  assert.deepEqual(
    ElixirMatch.restore(snapshot.elixirSnapshotBytes).state,
    value.state.elixir,
  );
  assert.equal(ResourceBuildingEncounter.restore(bytes).serialize(), bytes);
  assert.throws(
    () => ResourceBuildingEncounter.restore(JSON.stringify(snapshot, null, 2)),
    /canonical/,
  );

  const canonical = new ElixirMatch({ startingElixir: 0 });
  canonical.advanceTicks(511);
  assert.deepEqual(canonical.state.sides.south, {
    accumulator: 7,
    amount: 3,
  });
  const accepted = new ResourceBuildingEncounter(
    createResourceBuildingFixture([], [], canonical),
  );
  assert.deepEqual(accepted.state.elixir, canonical.state);
  accepted.step();
  canonical.step();
  assert.deepEqual(accepted.state.elixir, canonical.state);
  assert.equal(
    JSON.parse(accepted.serialize()).elixirSnapshotBytes,
    canonical.serialize(),
  );
  assert.equal(
    ResourceBuildingEncounter.restore(accepted.serialize()).serialize(),
    accepted.serialize(),
  );
});

test("buildings resource: hostile shapes and bounds reject atomically", () => {
  const malformedBuilding = building();
  Object.defineProperty(malformedBuilding, "id", { enumerable: true, get() {
    throw new Error("getter executed");
  } });
  assert.throws(() => new ResourceBuildingEncounter({
    buildings: [malformedBuilding],
    commands: [],
    startingResource: { north: 0, south: 0 },
  }), /invalid shape/);

  const sparse = [];
  sparse.length = 1;
  assert.throws(
    () => new ResourceBuildingEncounter({
      buildings: sparse,
      commands: [],
      startingResource: { north: 0, south: 0 },
    }),
    /invalid length or shape/,
  );
  assert.throws(() => encounter([building(), building()]), /unique ids/);
  assert.throws(() => encounter([], [], { north: 11, south: 0 }), /bounded/);
  assert.throws(() => encounter([], [
    command(0, "spend-resource", { amount: 11, side: "south" }),
  ]), /invalid spend fields/);

  const value = encounter();
  const before = value.serialize();
  assert.throws(() => value.stepMany(18_001), /bounded safe integer/);
  assert.equal(value.serialize(), before);
  assert.throws(() => ResourceBuildingEncounter.restore("{}"), TypeError);
  assert.throws(() => ResourceBuildingEncounter.restore("{"), TypeError);
  assert.throws(
    () => ResourceBuildingEncounter.restore(`{"${"é".repeat(600_000)}":0}`),
    /byte bound/,
  );
});

test("buildings resource: the full encounter remains bounded and deterministic", () => {
  const first = encounter(
    [building(2, "north"), building(1, "south")],
    [],
    { north: 0, south: 0 },
  );
  const second = encounter(
    [building(1, "south"), building(2, "north")],
    [],
    { north: 0, south: 0 },
  );
  first.run();
  second.run();
  assert.deepEqual(first.state, second.state);
  assert.equal(first.replayBytes(), second.replayBytes());
  assert.equal(generated(first).length, 16);
  assert.deepEqual(first.state.elixir.sides, {
    north: { accumulator: 0, amount: 10 },
    south: { accumulator: 0, amount: 10 },
  });
  assert.equal(
    createHash("sha256").update(first.replayBytes()).digest("hex"),
    "f893cf55647390534e6aa7cf8fd3bed51c5b518791eec4af1ffecac093d1dd5c",
  );
});

test("buildings resource: runtime has no corpus path, travel, RNG, clock, or float", () => {
  const source = readFileSync(
    new URL("../src/content/cards/buildings-resource.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /(?:^|[/"'])reference(?:[/"']|$)/imu);
  assert.doesNotMatch(source, /buildings-travel|underground/iu);
  assert.doesNotMatch(source, /Math\.random|Date\.|performance\.|setTimeout|setInterval/u);
  assert.doesNotMatch(source, /\b\d+\.\d+\b/u);
});
