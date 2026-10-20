import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SPAWNER_BUILDING_IDENTITIES,
  SpawnerBuildingEncounter,
  createSpawnerBuildingCorpusRecords,
  createSpawnerBuildingFixture,
  createSpawnerBuildingQuestionRecords,
} from "../src/content/cards/buildings-spawner.js";
import { DeathSpawnEncounter } from "../src/content/cards/death-spawns.js";

function building(
  archetypeId = "ember-roost",
  id = 101,
  ownerId = 7,
  position = { x: 9000, y: 12000 },
) {
  return {
    archetypeId,
    destroyedOpposingLaneTowers: [],
    id,
    ownerId,
    position,
    side: "south",
  };
}

function damage(tick, amount = 120, sourceId = 900, buildingId = 101) {
  return { amount, buildingId, sourceId, tick, type: "damage-building" };
}

function fixture(buildings = [building()], commands = []) {
  return createSpawnerBuildingFixture(buildings, commands);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertDeepFrozen(value) {
  if (value !== null && typeof value === "object") {
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) assertDeepFrozen(child);
  }
}

test("spawner buildings: shipped identities are original and source imports no reference data", () => {
  assert.deepEqual(SPAWNER_BUILDING_IDENTITIES, {
    "bramble-cage": { displayName: "Bramble Cage", id: "bramble-cage" },
    "ember-roost": { displayName: "Ember Roost", id: "ember-roost" },
  });
  assertDeepFrozen(SPAWNER_BUILDING_IDENTITIES);
  const source = readFileSync(
    new URL("../src/content/cards/buildings-spawner.js", import.meta.url),
    "utf8",
  );
  for (const benchmark of [
    "Goblin Hut", "Barbarian Hut", "Tombstone", "Furnace", "Goblin Cage",
  ]) assert.equal(source.toLowerCase().includes(benchmark.toLowerCase()), false);
  assert.doesNotMatch(source, /readFile|cards\.json|reference\//u);
});

test("spawner buildings: corpus confidence and every absent policy stay isolated", () => {
  const corpus = createSpawnerBuildingCorpusRecords();
  assert.deepEqual(corpus["ember-roost"].hitpoints, {
    authoritative: false,
    confidence: "medium-high-datamine-unverified-value",
    source: "pinned-pre-march-2023-building-constants",
    value: 848,
  });
  assertDeepFrozen(corpus);
  const first = createSpawnerBuildingQuestionRecords();
  const second = createSpawnerBuildingQuestionRecords();
  assert.deepEqual(Object.keys(first), [
    "buildingHealthFixture", "buildingLifetimeTicks", "commandBoundaryOrder",
    "deathBatchCounts", "deathBatchOrder", "deathOnLifetime",
    "destructionAttribution", "lifetimePeriodicBoundary",
    "periodicBatchCounts", "periodicCadenceTicks",
    "periodicFirstDelayTicks", "periodicPlacement", "stationaryPolicy",
  ]);
  for (const [key, record] of Object.entries(first)) {
    assert.deepEqual({
      authoritative: record.authoritative,
      confidence: record.confidence,
      disposition: record.disposition,
      key: record.key,
      source: record.source,
    }, {
      authoritative: false,
      confidence: "unverified",
      disposition: "question",
      key,
      source: "spawner-building-corpus-and-unsourced-policy-fixture",
    });
    assert.notEqual(record, second[key]);
  }
  assertDeepFrozen(first);
  assert.throws(() => createSpawnerBuildingQuestionRecords({ cadence: 1 }),
    /do not accept overrides/u);
});

test("spawner buildings: deployment uses the legal stationary ground mask", () => {
  assert.doesNotThrow(() => fixture());
  assert.throws(
    () => fixture([building("ember-roost", 101, 7, { x: 9000, y: 20000 })]),
    /placement is illegal/u,
  );
  assert.doesNotThrow(
    () => fixture([{
      ...building(), destroyedOpposingLaneTowers: ["west"],
      position: { x: 6000, y: 20000 },
    }]),
  );
  const setup = fixture();
  setup.buildings[0].position.x = 100;
  assert.equal(new SpawnerBuildingEncounter(fixture()).state.buildings[0].anchor.x, 9000);
});

test("spawner buildings: periodic cadence count ownership attribution and placement are exact", () => {
  const encounter = new SpawnerBuildingEncounter(fixture());
  encounter.stepMany(15);
  const batches = encounter.replay.filter(({ type }) => type === "spawn-batch");
  assert.deepEqual(batches.map((event) => [
    event.tick, event.kind, event.childIds, event.ownerId, event.sourceId,
  ]), [
    [3, "periodic", [1, 2], 7, 101],
    [7, "periodic", [3, 4], 7, 101],
    [11, "periodic", [5, 6], 7, 101],
  ]);
  assert.deepEqual(encounter.children.map(({ data, id }) => [
    data.archetypeId, id, data.position.x, data.position.y, data.ownerId,
    data.sourceId, data.offset.x,
  ]), [
    ["cinderling", 1, 8939, 12000, 7, 101, -61],
    ["cinderling", 2, 9061, 12000, 7, 101, 61],
    ["cinderling", 3, 8939, 12000, 7, 101, -61],
    ["cinderling", 4, 9061, 12000, 7, 101, 61],
    ["cinderling", 5, 8939, 12000, 7, 101, -61],
    ["cinderling", 6, 9061, 12000, 7, 101, 61],
  ]);
});

test("spawner buildings: lethal damage destroys then triggers one ordered death batch", () => {
  const encounter = new SpawnerBuildingEncounter(fixture(
    [building()], [damage(7)],
  ));
  encounter.stepMany(12);
  assert.deepEqual(encounter.replay.filter(({ tick }) => tick === 7).map(
    ({ sourceId, targetId, type, kind, childIds }) =>
      [type, sourceId ?? null, targetId ?? null, kind ?? null, childIds ?? null],
  ), [
    ["damage", 900, 101, null, null],
    ["death", 900, 101, null, null],
    ["source-despawn", 101, null, null, null],
    ["death-triggered", 101, null, null, null],
    ["spawn-batch", 101, null, "death", [3, 4, 5]],
  ]);
  assert.deepEqual(encounter.children.slice(-3).map(({ data, id }) =>
    [data.archetypeId, id, data.ownerId, data.sourceId]), [
    ["ember-scout", 3, 7, 101],
    ["ember-scout", 4, 7, 101],
    ["ember-scout", 5, 7, 101],
  ]);
});

test("spawner buildings: same-boundary lethal command cancels periodic due batch", () => {
  const encounter = new SpawnerBuildingEncounter(fixture(
    [building()], [damage(7)],
  ));
  encounter.stepMany(12);
  assert.deepEqual(encounter.replay.filter(({ type }) =>
    type === "spawn-batch").map(({ childIds, kind, tick }) =>
    [tick, kind, childIds]), [
    [3, "periodic", [1, 2]],
    [7, "death", [3, 4, 5]],
  ]);
});

test("spawner buildings: exact lifetime triggers death batch and cancels future periodic work", () => {
  const encounter = new SpawnerBuildingEncounter(fixture());
  encounter.stepMany(24);
  assert.deepEqual(encounter.replay.filter(({ tick }) => tick === 15).map(
    ({ sourceId, targetId, type, kind }) =>
      [type, sourceId ?? null, targetId ?? null, kind ?? null],
  ), [
    ["damage", null, 101, null],
    ["death", null, 101, null],
    ["source-despawn", 101, null, null],
    ["death-triggered", 101, null, null],
    ["spawn-batch", 101, null, "death"],
  ]);
  assert.deepEqual(encounter.replay.filter(({ type }) =>
    type === "spawn-batch").map(({ kind, tick }) => [tick, kind]), [
    [3, "periodic"], [7, "periodic"], [11, "periodic"], [15, "death"],
  ]);
  assert.equal(encounter.state.buildings[0].alive, false);
});

test("spawner buildings: distinct archetype lifetime and death count remain exact", () => {
  const encounter = new SpawnerBuildingEncounter(fixture([
    building("ember-roost", 101, 7),
    building("bramble-cage", 102, 8, { x: 12000, y: 12000 }),
  ]));
  encounter.stepMany(20);
  assert.deepEqual(encounter.replay.filter(({ kind, type }) =>
    type === "spawn-batch" && kind === "death").map(
    ({ childIds, ownerId, sourceId, tick }) =>
      [tick, sourceId, ownerId, childIds.length],
  ), [
    [15, 101, 7, 3],
    [18, 102, 8, 1],
  ]);
});

test("spawner buildings: nonlethal then lifetime ordering attributes destruction to lifetime", () => {
  const encounter = new SpawnerBuildingEncounter(fixture(
    [building()], [damage(15, 20)],
  ));
  encounter.stepMany(16);
  assert.deepEqual(encounter.replay.filter(({ tick, type }) =>
    tick === 15 && (type === "damage" || type === "death")).map(
    ({ applied, healthAfter, sourceId, type }) =>
      [type, sourceId, applied ?? null, healthAfter ?? null],
  ), [
    ["damage", 900, 20, 100],
    ["damage", null, 100, 0],
    ["death", null, null, null],
  ]);
});

test("spawner buildings: a user lethal on the lifetime boundary wins attribution exactly once", () => {
  const encounter = new SpawnerBuildingEncounter(fixture(
    [building()], [damage(15)],
  ));
  encounter.stepMany(16);
  assert.deepEqual(encounter.replay.filter(({ tick, type }) =>
    tick === 15 && (type === "damage" || type === "death" ||
      type === "death-triggered")).map(({ sourceId, type }) =>
    [type, sourceId]), [
    ["damage", 900],
    ["damage", null],
    ["death", 900],
    ["death-triggered", 101],
  ]);
  assert.equal(encounter.replay.filter(({ kind }) => kind === "death").length, 1);
});

test("spawner buildings: facade state and events are literal shared primitive output", () => {
  const setup = fixture([building()], [damage(7)]);
  const facade = new SpawnerBuildingEncounter(setup);
  const primitiveSetup = JSON.parse(facade.serialize()).primitiveSnapshotBytes;
  const primitive = DeathSpawnEncounter.restore(primitiveSetup);
  facade.stepMany(12);
  primitive.stepMany(12);
  assert.deepEqual(facade.replay, primitive.replay);
  assert.deepEqual(facade.children, primitive.children);
});

test("spawner buildings: arbitrary chunks and all restore cuts are byte-identical", () => {
  const setup = fixture([
    building("ember-roost", 101, 7),
    building("bramble-cage", 102, 8, { x: 12000, y: 12000 }),
  ], [damage(9, 20), damage(12, 150, 901, 102)]);
  const straight = new SpawnerBuildingEncounter(setup);
  straight.stepMany(30);
  const expected = straight.serialize();
  const chunked = new SpawnerBuildingEncounter(setup);
  for (const count of [1, 2, 4, 3, 9, 11]) chunked.stepMany(count);
  assert.equal(chunked.serialize(), expected);
  for (let cut = 0; cut <= 30; cut += 1) {
    const partial = new SpawnerBuildingEncounter(setup);
    partial.stepMany(cut);
    const restored = SpawnerBuildingEncounter.restore(partial.serialize());
    restored.stepMany(30 - cut);
    assert.equal(restored.serialize(), expected, `restore cut ${cut}`);
  }
});

test("spawner buildings: canonical snapshot nests the shared causal primitive bytes", () => {
  const encounter = new SpawnerBuildingEncounter(fixture());
  encounter.stepMany(12);
  const bytes = encounter.serialize();
  const parsed = JSON.parse(bytes);
  assert.deepEqual(Object.keys(parsed), [
    "identity", "primitiveSnapshotBytes", "version",
  ]);
  assert.equal(parsed.identity.fixture, "spawner-building-encounter-v1");
  const nested = DeathSpawnEncounter.restore(parsed.primitiveSnapshotBytes);
  assert.deepEqual(nested.children, encounter.children);
  assert.equal(SpawnerBuildingEncounter.restore(bytes).serialize(), bytes);
});

test("spawner buildings: forged outer or nested causal state rejects atomically", () => {
  const encounter = new SpawnerBuildingEncounter(fixture());
  encounter.stepMany(12);
  const originalBytes = encounter.serialize();
  const original = JSON.parse(originalBytes);
  const mutations = [
    (value) => { value.version += 1; },
    (value) => { value.identity.fixture += "-forged"; },
    (value) => { value.identity.setup.buildings[0].ownerId += 1; },
    (value) => {
      const nested = JSON.parse(value.primitiveSnapshotBytes);
      nested.state.history[0].tick += 1;
      value.primitiveSnapshotBytes = canonicalJson(nested);
    },
  ];
  for (const mutate of mutations) {
    const forged = structuredClone(original);
    mutate(forged);
    assert.throws(() =>
      SpawnerBuildingEncounter.restore(canonicalJson(forged)));
    assert.equal(encounter.serialize(), originalBytes);
  }
});

test("spawner buildings: canonical duplicate-free UTF-8 bounded snapshots reject", () => {
  const bytes = new SpawnerBuildingEncounter(fixture()).serialize();
  for (const hostile of [
    ` ${bytes}`,
    `${bytes}\n`,
    bytes.replace('"version":1', '"version":1,"version":1'),
    bytes.replace('"fixture":"spawner', '"fixture":"\\u0073pawner'),
  ]) assert.throws(() => SpawnerBuildingEncounter.restore(hostile), /canonical/u);
  assert.throws(() => SpawnerBuildingEncounter.restore("{"), /valid JSON/u);
  assert.throws(() => SpawnerBuildingEncounter.restore({}), /must be a string/u);
  assert.throws(
    () => SpawnerBuildingEncounter.restore("😀".repeat(300_000)),
    /byte bound/u,
  );
});

test("spawner buildings: hostile getters prototypes symbols sparse aliases and extras reject unobserved", () => {
  let getterCalls = 0;
  const accessor = building();
  Object.defineProperty(accessor, "id", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 101;
    },
  });
  const sparse = [];
  sparse.length = 1;
  for (const buildings of [
    [accessor],
    [Object.assign(Object.create({}), building())],
    [Object.assign(building(), { extra: true })],
    sparse,
  ]) assert.throws(() => fixture(buildings));
  assert.equal(getterCalls, 0);
  const symbol = building();
  symbol[Symbol("hostile")] = true;
  assert.throws(() => fixture([symbol]));
  const nullPrototype = Object.assign(Object.create(null), building());
  assert.doesNotThrow(() => fixture([nullPrototype]));
});

test("spawner buildings: duplicate IDs commands unsafe values and bounds reject", () => {
  assert.throws(() => fixture([building(), building()]), /unique IDs/u);
  assert.throws(() => fixture([building("ember-roost", 64)]), /bounded/u);
  assert.throws(() => fixture([building()], [damage(0), damage(0)]),
    /duplicates/u);
  assert.throws(() => fixture([building()], [damage(512)]), /bounded/u);
  assert.throws(() => fixture([building()], [{
    ...damage(1), type: "heal-building",
  }]), /type is invalid/u);
  assert.throws(() => fixture([building()], [damage(
    1, Number.MAX_SAFE_INTEGER + 1,
  )]), /bounded/u);
  assert.throws(() => fixture([building()], [damage(1, 1, null)]), /bounded/u);
  assert.throws(() => new SpawnerBuildingEncounter({
    buildings: [building()], commands: [], extra: true,
  }), /invalid shape/u);
  assert.throws(() => new SpawnerBuildingEncounter(fixture([])), /at least one/u);
  assert.throws(() =>
    new SpawnerBuildingEncounter(fixture()).stepMany(513), /bounded/u);
});

test("spawner buildings: inputs outputs and failed steps are isolated and atomic", () => {
  const input = fixture([building()], [damage(7)]);
  const encounter = new SpawnerBuildingEncounter(input);
  input.buildings[0].position.x = 12000;
  input.commands[0].amount = 1;
  encounter.stepMany(4);
  const before = encounter.serialize();
  const state = encounter.state;
  const replay = encounter.replay;
  const children = encounter.children;
  state.buildings[0].health = 1;
  replay[0].tick = 99;
  children[0].data.ownerId = 99;
  assert.equal(encounter.serialize(), before);
  assert.throws(() => encounter.stepMany(513), /bounded/u);
  assert.equal(encounter.serialize(), before);
  const fresh = new SpawnerBuildingEncounter(fixture());
  const duplicate = new SpawnerBuildingEncounter(fixture());
  fresh.run();
  for (const count of [128, 128, 128, 128]) duplicate.stepMany(count);
  assert.equal(duplicate.serialize(), fresh.serialize());
});
