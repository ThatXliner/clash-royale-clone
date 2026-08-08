import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PERIODIC_SPAWN_IDENTITY,
  PERIODIC_SPAWN_TIMELINE,
  PeriodicSpawnEncounter,
  createPeriodicSpawnFixture,
  createPeriodicSpawnQuestionRecords,
} from "../src/content/cards/periodic-spawns.js";
import { SpawnBatchMaterializer } from
  "../src/content/cards/spawn-placement.js";

function lethal(tick) {
  return { tick, type: "lethal" };
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function spawnEvents(encounter) {
  return encounter.replay.filter(({ type }) => type === "spawn-batch");
}

function assertDeepFrozen(value) {
  if (value !== null && typeof value === "object") {
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) assertDeepFrozen(child);
  }
}

test("periodic spawns: shipped identity is original and benchmark identities remain test-only", () => {
  assert.deepEqual(PERIODIC_SPAWN_IDENTITY, {
    displayName: "Emberwell",
    id: "emberwell",
  });
  assertDeepFrozen(PERIODIC_SPAWN_IDENTITY);
  const source = readFileSync(
    new URL("../src/content/cards/periodic-spawns.js", import.meta.url),
    "utf8",
  );
  // Historical benchmark examples are deliberately named only in this test.
  for (const benchmarkIdentity of ["Witch", "Tombstone", "Furnace"]) {
    assert.equal(
      source.toLocaleLowerCase().includes(
        benchmarkIdentity.toLocaleLowerCase(),
      ),
      false,
      benchmarkIdentity,
    );
  }
  assert.doesNotMatch(source, /readFile|cards\.json|reference\//u);
});

test("periodic spawns: all absent policies are separate fresh recursively frozen questions", () => {
  const first = createPeriodicSpawnQuestionRecords();
  const second = createPeriodicSpawnQuestionRecords();
  assert.deepEqual(Object.keys(first), [
    "absoluteSchedule",
    "childCountPerBatch",
    "childOrder",
    "deathTriggeredSpawns",
    "expiryBoundary",
    "initialDelayTicks",
    "lethalCancellation",
    "ownership",
    "placement",
    "repeatedCadenceTicks",
    "sameTickOrder",
    "sourceLifetimeTicks",
    "summonRelationship",
  ]);
  assertDeepFrozen(first);
  assertDeepFrozen(second);
  assert.notEqual(first, second);
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
      source: "unsourced-periodic-spawn-cadence-lifetime-fixture",
    });
    assert.notEqual(record, second[key]);
  }
  assert.throws(() => createPeriodicSpawnQuestionRecords({ cadence: 1 }),
    /do not accept overrides/u);
});

test("periodic spawns: literal initial delay absolute cadence and expiry boundary", () => {
  assert.deepEqual(PERIODIC_SPAWN_TIMELINE, {
    cadenceTicks: 4,
    initialDelayTicks: 3,
    lifetimeTicks: 15,
  });
  const encounter = new PeriodicSpawnEncounter();
  encounter.stepMany(16);
  assert.deepEqual(spawnEvents(encounter).map(
    ({ batchIndex, childIds, tick }) => [tick, batchIndex, childIds],
  ), [
    [3, 0, [1, 2]],
    [7, 1, [3, 4]],
    [11, 2, [5, 6]],
  ]);
  assert.deepEqual(encounter.replay.at(-1), {
    sourceId: 73,
    tick: 15,
    type: "source-expired",
  });
  assert.deepEqual(encounter.state, {
    alive: false,
    batchCount: 3,
    commandIndex: 0,
    endReason: "expired",
    history: encounter.replay,
    nextDueTick: null,
    tick: 16,
  });
});

test("periodic spawns: every batch delegates deterministic child order IDs anchors ownership and placement", () => {
  const encounter = new PeriodicSpawnEncounter();
  encounter.stepMany(12);
  assert.deepEqual(encounter.children, [
    ["cinderling", 1, 1099, -800, 17, 73, -101],
    ["cinderling", 2, 1301, -800, 17, 73, 101],
    ["cinderling", 3, 1099, -800, 17, 73, -101],
    ["cinderling", 4, 1301, -800, 17, 73, 101],
    ["cinderling", 5, 1099, -800, 17, 73, -101],
    ["cinderling", 6, 1301, -800, 17, 73, 101],
  ].map(([archetypeId, id, x, y, ownerId, sourceId, offsetX],
    index) => ({
    data: {
      archetypeId,
      offset: { x: offsetX, y: 0 },
      ownerId,
      position: { x, y },
      radius: 100,
      role: index % 2 === 0 ? "primary" : "secondary",
      sourceId,
    },
    id,
  })));
  assert.deepEqual(spawnEvents(encounter).map(({ anchor, ownerId, sourceId }) =>
    [anchor, ownerId, sourceId]), [
    [{ x: 1200, y: -800 }, 17, 73],
    [{ x: 1200, y: -800 }, 17, 73],
    [{ x: 1200, y: -800 }, 17, 73],
  ]);
});

test("periodic spawns: lethal before due cancels all batches", () => {
  const encounter = new PeriodicSpawnEncounter(
    createPeriodicSpawnFixture([lethal(2)]),
  );
  encounter.stepMany(20);
  assert.deepEqual(encounter.replay, [{
    sourceId: 73,
    tick: 2,
    type: "source-killed",
  }]);
  assert.deepEqual(encounter.children, []);
});

test("periodic spawns: lethal on due is command-first and cancels that due batch", () => {
  const encounter = new PeriodicSpawnEncounter(
    createPeriodicSpawnFixture([lethal(7)]),
  );
  encounter.stepMany(20);
  assert.deepEqual(spawnEvents(encounter).map(({ tick }) => tick), [3]);
  assert.deepEqual(encounter.replay.map(({ tick, type }) => [tick, type]), [
    [3, "spawn-batch"],
    [7, "source-killed"],
  ]);
});

test("periodic spawns: a due batch before lethal survives and all later due batches cancel", () => {
  const encounter = new PeriodicSpawnEncounter(
    createPeriodicSpawnFixture([lethal(4)]),
  );
  encounter.stepMany(20);
  assert.deepEqual(spawnEvents(encounter).map(({ childIds, tick }) =>
    [tick, childIds]), [[3, [1, 2]]]);
  assert.equal(encounter.state.endReason, "lethal");
  assert.equal(encounter.state.nextDueTick, null);
});

test("periodic spawns: expiry wins over a lethal command and the same-tick due boundary", () => {
  const encounter = new PeriodicSpawnEncounter(
    createPeriodicSpawnFixture([lethal(15)]),
  );
  encounter.stepMany(16);
  assert.deepEqual(spawnEvents(encounter).map(({ tick }) => tick), [3, 7, 11]);
  assert.deepEqual(encounter.replay.at(-1), {
    sourceId: 73,
    tick: 15,
    type: "source-expired",
  });
  assert.equal(encounter.state.commandIndex, 1);
  assert.equal(encounter.state.endReason, "expired");
});

test("periodic spawns: no source end path creates death-triggered children", () => {
  const expired = new PeriodicSpawnEncounter();
  expired.stepMany(30);
  const killed = new PeriodicSpawnEncounter(
    createPeriodicSpawnFixture([lethal(12)]),
  );
  killed.stepMany(30);
  assert.equal(expired.children.length, 6);
  assert.equal(killed.children.length, 6);
  assert.equal(expired.replay.filter(({ type }) =>
    type === "spawn-batch").length, 3);
  assert.equal(killed.replay.filter(({ type }) =>
    type === "spawn-batch").length, 3);
});

test("periodic spawns: arbitrary chunking is byte-identical and absolute cadence never drifts", () => {
  const straight = new PeriodicSpawnEncounter();
  straight.stepMany(64);
  const chunked = new PeriodicSpawnEncounter();
  for (const count of [1, 2, 4, 3, 9, 7, 11, 27]) {
    chunked.stepMany(count);
  }
  assert.equal(chunked.serialize(), straight.serialize());
  assert.deepEqual(spawnEvents(chunked).map(({ tick }) => tick), [3, 7, 11]);
});

test("periodic spawns: every-tick restore matches the uninterrupted literal timeline", () => {
  const fixture = createPeriodicSpawnFixture([lethal(12)]);
  const fresh = new PeriodicSpawnEncounter(fixture);
  fresh.stepMany(30);
  const expected = fresh.serialize();
  for (let cut = 0; cut <= 30; cut += 1) {
    const partial = new PeriodicSpawnEncounter(fixture);
    partial.stepMany(cut);
    const restored = PeriodicSpawnEncounter.restore(partial.serialize());
    restored.stepMany(30 - cut);
    assert.equal(restored.serialize(), expected, `restore cut ${cut}`);
  }
});

test("periodic spawns: canonical snapshot contains causal nested placement bytes", () => {
  const encounter = new PeriodicSpawnEncounter();
  encounter.stepMany(12);
  const bytes = encounter.serialize();
  const parsed = JSON.parse(bytes);
  assert.deepEqual(Object.keys(parsed), [
    "identity",
    "placementSnapshotBytes",
    "state",
    "version",
  ]);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.identity.fixture, "emberwell-periodic-spawn-question-v1");
  assert.deepEqual(parsed.identity.schedule, PERIODIC_SPAWN_TIMELINE);
  const nested = SpawnBatchMaterializer.restore(
    parsed.placementSnapshotBytes,
  );
  assert.deepEqual(nested.list(), encounter.children);
  assert.equal(PeriodicSpawnEncounter.restore(bytes).serialize(), bytes);
});

test("periodic spawns: forged schedule source state and placement disagreements reject", () => {
  const encounter = new PeriodicSpawnEncounter();
  encounter.stepMany(12);
  const original = JSON.parse(encounter.serialize());
  const mutations = [
    (value) => { value.identity.schedule.initialDelayTicks += 1; },
    (value) => { value.identity.schedule.cadenceTicks += 1; },
    (value) => { value.identity.schedule.lifetimeTicks += 1; },
    (value) => { value.identity.source.anchor.x += 1; },
    (value) => { value.identity.source.ownerId += 1; },
    (value) => { value.identity.source.sourceId += 1; },
    (value) => {
      value.identity.source.children[0].archetypeId = "forged";
    },
    (value) => { value.state.nextDueTick += 1; },
    (value) => { value.state.batchCount -= 1; },
    (value) => { value.state.history[0].childIds[0] += 1; },
    (value) => {
      const nested = JSON.parse(value.placementSnapshotBytes);
      nested.batches[0].anchor.x += 1;
      value.placementSnapshotBytes = canonicalJson(nested);
    },
    (value) => {
      const nested = JSON.parse(value.placementSnapshotBytes);
      nested.store.entities[0].data.position.x += 1;
      value.placementSnapshotBytes = canonicalJson(nested);
    },
  ];
  for (const mutate of mutations) {
    const forged = structuredClone(original);
    mutate(forged);
    assert.throws(() =>
      PeriodicSpawnEncounter.restore(canonicalJson(forged))
    );
  }
});

test("periodic spawns: snapshot bytes must be canonical duplicate-free JSON", () => {
  const bytes = new PeriodicSpawnEncounter().serialize();
  for (const hostile of [
    ` ${bytes}`,
    `${bytes}\n`,
    bytes.replace('"version":1', '"version":1,"version":1'),
    bytes.replace(
      '"fixture":"emberwell',
      '"fixture":"\\u0065mberwell',
    ),
  ]) {
    assert.throws(() => PeriodicSpawnEncounter.restore(hostile), /canonical/u);
  }
  assert.throws(() => PeriodicSpawnEncounter.restore("{"), /valid JSON/u);
  assert.throws(() => PeriodicSpawnEncounter.restore({}), /must be a string/u);
});

test("periodic spawns: hostile getters prototypes symbols sparse and extra inputs reject without observation", () => {
  let getterCalls = 0;
  const accessor = { type: "lethal" };
  Object.defineProperty(accessor, "tick", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 1;
    },
  });
  const sparse = [];
  sparse.length = 1;
  const extraArray = [lethal(1)];
  extraArray.extra = true;
  for (const commands of [
    [accessor],
    [Object.assign(Object.create({ hostile: true }), lethal(1))],
    [{ ...lethal(1), [Symbol("extra")]: true }],
    sparse,
    extraArray,
  ]) {
    assert.throws(() => createPeriodicSpawnFixture(commands));
  }
  assert.equal(getterCalls, 0);
  const nullPrototype = Object.assign(Object.create(null), lethal(1));
  assert.doesNotThrow(() => createPeriodicSpawnFixture([nullPrototype]));
});

test("periodic spawns: duplicate unsafe overflow oversized commands and setup shapes reject", () => {
  for (const commands of [
    [lethal(1), lethal(1)],
    [lethal(2), lethal(1)],
    [{ tick: Number.MAX_SAFE_INTEGER + 1, type: "lethal" }],
    [{ tick: -1, type: "lethal" }],
    [{ tick: 4096, type: "lethal" }],
    [{ tick: 1, type: "unknown" }],
    [{ ...lethal(1), extra: true }],
    Array.from({ length: 65 }, (_, tick) => lethal(tick)),
  ]) {
    assert.throws(() => createPeriodicSpawnFixture(commands));
  }
  assert.throws(() => new PeriodicSpawnEncounter({ commands: [], extra: true }));
});

test("periodic spawns: command event snapshot and nested ledger bounds reject", () => {
  const bytes = new PeriodicSpawnEncounter().serialize();
  assert.throws(
    () => PeriodicSpawnEncounter.restore("x".repeat(262_145)),
    /byte bound/u,
  );
  const tooManyEvents = JSON.parse(bytes);
  tooManyEvents.state.history = Array.from(
    { length: 1025 },
    (_, tick) => ({ sourceId: 73, tick: tick % 4096, type: "source-killed" }),
  );
  assert.throws(
    () => PeriodicSpawnEncounter.restore(canonicalJson(tooManyEvents)),
    /bounded plain array/u,
  );

  const forgedLedger = JSON.parse(bytes);
  const nested = JSON.parse(forgedLedger.placementSnapshotBytes);
  nested.batches = Array.from({ length: 1025 }, () => ({
    anchor: { x: 0, y: 0 },
    children: [{
      archetypeId: "x",
      radius: 0,
      role: "primary",
    }],
    ownerId: 1,
    sourceId: 1,
  }));
  forgedLedger.placementSnapshotBytes = canonicalJson(nested);
  assert.throws(
    () => PeriodicSpawnEncounter.restore(canonicalJson(forgedLedger)),
    /at most 1024 entries/u,
  );
});

test("periodic spawns: caller inputs and returned state events children are isolated", () => {
  const commands = [lethal(12)];
  const fixture = createPeriodicSpawnFixture(commands);
  commands[0].tick = 0;
  const encounter = new PeriodicSpawnEncounter(fixture);
  const events = encounter.stepMany(8);
  const state = encounter.state;
  const replay = encounter.replay;
  const children = encounter.children;
  events[0].childIds[0] = 999;
  state.history[0].tick = 999;
  replay[0].anchor.x = 999;
  children[0].data.position.x = 999;
  fixture.commands[0].tick = 0;
  assert.deepEqual(spawnEvents(encounter)[0].childIds, [1, 2]);
  assert.equal(encounter.replay[0].tick, 3);
  assert.equal(encounter.children[0].data.position.x, 1099);
  assert.equal(encounter.state.commandIndex, 0);
});

test("periodic spawns: stepMany validates atomically before all mutation", () => {
  const encounter = new PeriodicSpawnEncounter();
  const before = encounter.serialize();
  for (const invalid of [
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    4097,
  ]) {
    assert.throws(() => encounter.stepMany(invalid));
    assert.equal(encounter.serialize(), before);
  }
  encounter.stepMany(4090);
  const nearEnd = encounter.serialize();
  assert.throws(() => encounter.stepMany(7), /encounter bound/u);
  assert.equal(encounter.serialize(), nearEnd);
});

test("periodic spawns: full bounded run is deterministic under maximum chunking", () => {
  const left = new PeriodicSpawnEncounter();
  const right = new PeriodicSpawnEncounter();
  left.run();
  for (let index = 0; index < 4; index += 1) right.stepMany(1024);
  assert.equal(left.state.tick, 4096);
  assert.equal(left.serialize(), right.serialize());
  assert.deepEqual(spawnEvents(left).map(({ tick }) => tick), [3, 7, 11]);
  assert.equal(left.children.length, 6);
});
