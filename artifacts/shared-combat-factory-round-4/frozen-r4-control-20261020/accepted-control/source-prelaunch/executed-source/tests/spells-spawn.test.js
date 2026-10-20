import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  SPAWN_SPELL_COUNTS,
  SPAWN_SPELL_IDENTITIES,
  SpawnSpellEncounter,
  createSpawnSpellFixture,
  createSpawnSpellQuestionRecords,
} from "../src/content/cards/spells-spawn.js";
import { SpawnBatchMaterializer } from
  "../src/content/cards/spawn-placement.js";

function cast(id, tick, sourceId, variant, center = { x: 9000, y: 16000 }) {
  return { center, id, sourceId, tick, type: "cast", variant };
}

function cancel(id, tick, sourceId) {
  return {
    center: null,
    id,
    sourceId,
    tick,
    type: "cancel-source",
    variant: null,
  };
}

function fixture(commands, seed = "spawn-spell-seed") {
  return createSpawnSpellFixture({
    commands,
    seed,
    sources: [
      { id: 41, ownerId: 7 },
      { id: 42, ownerId: 8 },
    ],
  });
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

function childTrace(encounter) {
  return encounter.children.map(({ data, id }) => [
    id,
    data.archetypeId,
    data.position.x,
    data.position.y,
    data.ownerId,
    data.sourceId,
  ]);
}

function eventsOf(encounter, type) {
  return encounter.replay.filter((event) => event.type === type);
}

function placementTrace(encounter) {
  const snapshot = JSON.parse(encounter.placementSnapshotBytes);
  return {
    batches: snapshot.batches.map(({ anchor, children, ownerId, sourceId }) => [
      anchor.x,
      anchor.y,
      children.length,
      ownerId,
      sourceId,
    ]),
    children: snapshot.store.entities.map(({ data, id }) => [
      id,
      data.position.x,
      data.position.y,
      data.ownerId,
      data.sourceId,
    ]),
  };
}

function assertDeepFrozen(value) {
  if (value !== null && typeof value === "object") {
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) assertDeepFrozen(child);
  }
}

test("spawn spells: shipped identities are original and source is isolated", () => {
  assert.deepEqual(SPAWN_SPELL_IDENTITIES, [
    {
      displayName: "Cloudseed Flask",
      id: "cloudseed-flask",
      variant: "burst",
    },
    {
      displayName: "Hollowgarden",
      id: "hollowgarden",
      variant: "periodic",
    },
  ]);
  assertDeepFrozen(SPAWN_SPELL_IDENTITIES);
  const source = readFileSync(
    new URL("../src/content/cards/spells-spawn.js", import.meta.url),
    "utf8",
  );
  for (const protectedIdentity of ["Goblin Barrel", "Graveyard"]) {
    assert.equal(source.toLowerCase().includes(
      protectedIdentity.toLowerCase(),
    ), false);
  }
  assert.doesNotMatch(source, /readFile|cards\.json|reference\//u);
});

test("spawn spells: corpus-backed counts are explicit medium-confidence values", () => {
  assert.deepEqual(SPAWN_SPELL_COUNTS, {
    burst: {
      confidence: "medium",
      count: 3,
      disposition: "comparison-value",
    },
    periodic: {
      confidence: "medium",
      count: 15,
      disposition: "comparison-value",
    },
  });
  assertDeepFrozen(SPAWN_SPELL_COUNTS);
});

test("spawn spells: offline comparison confirms burst 3 and periodic 15", () => {
  const reference = JSON.parse(readFileSync(
    new URL("../reference/stats/cards.json", import.meta.url),
    "utf8",
  ));
  const burst = reference.cards.find(({ key }) => key === "goblin-barrel");
  const periodic = reference.cards.find(({ key }) => key === "graveyard");
  assert.deepEqual({
    runtime: SPAWN_SPELL_COUNTS.burst.count,
    reference: burst.components[0].count,
  }, { runtime: 3, reference: 3 });
  assert.deepEqual({
    runtime: SPAWN_SPELL_COUNTS.periodic.count,
    reference: periodic.components[0].count,
  }, { runtime: 15, reference: 15 });
});

test("spawn spells: every absent policy is a separate frozen QUESTION", () => {
  const first = createSpawnSpellQuestionRecords();
  const second = createSpawnSpellQuestionRecords();
  assert.deepEqual(Object.keys(first), [
    "areaRadiusMillitiles",
    "boundaryOrdering",
    "burstPlacement",
    "cancellation",
    "childArchetype",
    "childRadiusMillitiles",
    "impactDelayTicks",
    "ownership",
    "periodicBatching",
    "periodicCadence",
    "placementBounds",
    "randomAlgorithm",
    "randomExhaustion",
    "restorePolicy",
  ]);
  assertDeepFrozen(first);
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
      source: "spawn-spell-comparison-question-fixture",
    });
    assert.notEqual(record, second[key]);
  }
  assert.throws(() => createSpawnSpellQuestionRecords({}), /overrides/u);
});

test("spawn spells: burst travels exactly two ticks and spawns three in seeded order", () => {
  const encounter = new SpawnSpellEncounter(fixture([
    cast(1, 0, 41, "burst"),
  ]));
  encounter.stepMany(3);
  assert.deepEqual(encounter.replay.map(({ tick, type }) => [tick, type]), [
    [0, "spawn-spell-cast"],
    [2, "spawn-spell-impact"],
    [2, "spawn-spell-child"],
    [2, "spawn-spell-child"],
    [2, "spawn-spell-child"],
    [2, "spawn-spell-batch"],
  ]);
  assert.deepEqual(childTrace(encounter), [
    [1, "spriglet", 7560, 14707, 7, 41],
    [2, "spriglet", 7459, 15010, 7, 41],
    [3, "spriglet", 7661, 15010, 7, 41],
  ]);
  assert.deepEqual(eventsOf(encounter, "spawn-spell-batch")[0].childIds,
    [1, 2, 3]);
});

test("spawn spells: same seed reproduces and named effect streams isolate later casts", () => {
  const commands = [
    cast(1, 0, 41, "burst"),
    cast(2, 0, 42, "burst"),
  ];
  const left = new SpawnSpellEncounter(fixture(commands, "same"));
  const right = new SpawnSpellEncounter(fixture(commands, "same"));
  left.stepMany(3);
  right.stepMany(3);
  assert.equal(left.serialize(), right.serialize());
  assert.deepEqual(childTrace(left), childTrace(right));

  const different = new SpawnSpellEncounter(fixture(commands, "different"));
  different.stepMany(3);
  assert.notDeepEqual(childTrace(different), childTrace(left));
  assert.deepEqual(eventsOf(left, "spawn-spell-impact").map(
    ({ effectId, sourceId }) => [effectId, sourceId]), [[1, 41], [2, 42]]);
  assert.deepEqual(left.children.map(({ id }) => id), [1, 2, 3, 4, 5, 6]);
});

test("spawn spells: periodic variant delegates three cadence boundaries for 15 children", () => {
  const encounter = new SpawnSpellEncounter(fixture([
    cast(1, 0, 41, "periodic"),
  ], "periodic"));
  encounter.stepMany(15);
  assert.deepEqual(eventsOf(encounter, "spawn-spell-batch").map(
    ({ childIds, kind, tick }) => [tick, kind, childIds]), [
    [5, "periodic-0", [1, 2, 3, 4, 5]],
    [9, "periodic-1", [6, 7, 8, 9, 10]],
    [13, "periodic-2", [11, 12, 13, 14, 15]],
  ]);
  assert.equal(encounter.children.length, 15);
  assert.ok(encounter.children.every(({ data }) =>
    data.ownerId === 7 &&
    data.sourceId === 41 &&
    data.archetypeId === "wispbone"));
});

test("spawn spells: cancellation before impact and on periodic due is command-first", () => {
  const beforeImpact = new SpawnSpellEncounter(fixture([
    cast(1, 0, 41, "burst"),
    cancel(2, 1, 41),
  ]));
  beforeImpact.stepMany(8);
  assert.deepEqual(beforeImpact.replay.map(({ tick, type }) => [tick, type]), [
    [0, "spawn-spell-cast"],
    [1, "spawn-spell-source-cancelled"],
  ]);
  assert.equal(beforeImpact.children.length, 0);

  const due = new SpawnSpellEncounter(fixture([
    cast(1, 0, 41, "periodic"),
    cancel(2, 9, 41),
  ]));
  due.stepMany(16);
  assert.deepEqual(eventsOf(due, "spawn-spell-batch").map(
    ({ tick }) => tick), [5]);
  assert.deepEqual(eventsOf(due, "spawn-spell-periodic-cancelled").map(
    ({ tick }) => tick), [9]);
  assert.equal(due.children.length, 5);
});

test("spawn spells: impact order precedes periodic batches on a shared boundary", () => {
  const encounter = new SpawnSpellEncounter(fixture([
    cast(1, 0, 41, "periodic"),
    cast(2, 3, 42, "burst"),
  ], "boundary"));
  encounter.stepMany(6);
  const atFive = encounter.replay.filter(({ tick }) => tick === 5);
  assert.deepEqual(atFive.map(({ type, variant }) => [type, variant]), [
    ["spawn-spell-impact", "burst"],
    ["spawn-spell-child", "burst"],
    ["spawn-spell-child", "burst"],
    ["spawn-spell-child", "burst"],
    ["spawn-spell-batch", "burst"],
    ["spawn-spell-child", "periodic"],
    ["spawn-spell-child", "periodic"],
    ["spawn-spell-child", "periodic"],
    ["spawn-spell-child", "periodic"],
    ["spawn-spell-child", "periodic"],
    ["spawn-spell-batch", "periodic"],
  ]);
  assert.deepEqual(encounter.children.map(({ id, data }) =>
    [id, data.ownerId]), [
    [1, 8], [2, 8], [3, 8],
    [4, 7], [5, 7], [6, 7], [7, 7], [8, 7],
  ]);
});

test("spawn spells: arbitrary chunking and every causal restore cut are byte-identical", () => {
  const setup = fixture([
    cast(1, 0, 41, "periodic"),
    cast(2, 4, 42, "burst"),
  ], 90210);
  const straight = new SpawnSpellEncounter(setup);
  straight.run();
  const chunked = new SpawnSpellEncounter(setup);
  for (const count of [1, 0, 2, 4, 3, 118]) chunked.stepMany(count);
  assert.equal(chunked.serialize(), straight.serialize());
  assert.equal(
    chunked.placementSnapshotBytes,
    straight.placementSnapshotBytes,
  );
  assert.deepEqual(chunked.replay, straight.replay);
  assert.deepEqual(chunked.children, straight.children);

  for (let cut = 0; cut <= 128; cut += 1) {
    const partial = new SpawnSpellEncounter(setup);
    partial.stepMany(cut);
    const restored = SpawnSpellEncounter.restore(partial.serialize());
    restored.stepMany(128 - cut);
    assert.equal(restored.serialize(), straight.serialize(), `cut ${cut}`);
    assert.equal(
      restored.placementSnapshotBytes,
      straight.placementSnapshotBytes,
      `placement cut ${cut}`,
    );
    assert.deepEqual(restored.replay, straight.replay, `replay cut ${cut}`);
    assert.deepEqual(restored.children, straight.children, `children cut ${cut}`);
  }
});

test("spawn spells: snapshot is canonical causal and rejects forgeries", () => {
  const encounter = new SpawnSpellEncounter(fixture([
    cast(1, 0, 41, "periodic"),
  ]));
  encounter.stepMany(10);
  const bytes = encounter.serialize();
  assert.equal(SpawnSpellEncounter.restore(bytes).serialize(), bytes);
  const parsed = JSON.parse(bytes);
  assert.deepEqual(Object.keys(parsed), [
    "identity",
    "placementSnapshotBytes",
    "tick",
    "version",
  ]);
  assert.equal(parsed.identity.fixture, "original-spawn-spell-encounter-v1");
  assert.equal(
    SpawnBatchMaterializer.restore(parsed.placementSnapshotBytes).serialize(),
    encounter.placementSnapshotBytes,
  );

  for (const hostile of [
    ` ${bytes}`,
    `${bytes}\n`,
    bytes.replace('"version":1', '"version":1,"version":1'),
    bytes.replace('"tick":10', '"tick":129'),
    bytes.replace(
      '"fixture":"original',
      '"fixture":"\\u006friginal',
    ),
  ]) {
    assert.throws(() => SpawnSpellEncounter.restore(hostile));
  }
  const forged = clone(parsed);
  forged.identity.setup.commands[0].variant = "unknown";
  assert.throws(() => SpawnSpellEncounter.restore(canonicalJson(forged)));
  const forgedPlacement = clone(parsed);
  const nested = JSON.parse(forgedPlacement.placementSnapshotBytes);
  nested.batches[0].anchor.x += 1;
  forgedPlacement.placementSnapshotBytes = canonicalJson(nested);
  assert.throws(
    () => SpawnSpellEncounter.restore(canonicalJson(forgedPlacement)),
    /batch ledger|placement snapshot/u,
  );
  assert.throws(() => SpawnSpellEncounter.restore("{"), /valid JSON/u);
  assert.throws(() => SpawnSpellEncounter.restore({}), /string/u);
  assert.throws(() => SpawnSpellEncounter.restore("x".repeat(262_145)),
    /byte bound/u);
});

test("spawn spells: each outer boundary is one canonical primitive batch", () => {
  const setup = fixture([
    cast(1, 0, 41, "burst"),
    cast(2, 0, 42, "periodic"),
    cancel(3, 10, 42),
  ], "causal-ledger");
  const encounter = new SpawnSpellEncounter(setup);
  encounter.stepMany(16);

  const outer = eventsOf(encounter, "spawn-spell-batch");
  const trace = placementTrace(encounter);
  assert.deepEqual(outer.map(({ childIds, kind, tick }) => [
    tick,
    kind,
    childIds,
  ]), [
    [2, "burst", [1, 2, 3]],
    [5, "periodic-0", [4, 5, 6, 7, 8]],
    [9, "periodic-1", [9, 10, 11, 12, 13]],
  ]);
  assert.deepEqual(trace.batches.map((entry) => entry.slice(2)), [
    [3, 7, 41],
    [5, 8, 42],
    [5, 8, 42],
  ]);
  const publicChildren = encounter.children.map(({ data, id }) => [
    id,
    data.position.x,
    data.position.y,
    data.ownerId,
    data.sourceId,
  ]);
  assert.equal(canonicalJson(trace.children), canonicalJson(publicChildren));
  assert.deepEqual(
    outer.map(({ childIds }) => childIds),
    JSON.parse(encounter.placementSnapshotBytes).batches.map(
      (_batch, index, batches) => {
        const first = batches
          .slice(0, index)
          .reduce((count, batch) => count + batch.children.length, 0) + 1;
        return Array.from(
          { length: batches[index].children.length },
          (_, childIndex) => first + childIndex,
        );
      },
    ),
  );
  assert.deepEqual(eventsOf(
    encounter,
    "spawn-spell-periodic-cancelled",
  ).map(({ tick }) => tick), [10]);
});

function clone(value) {
  return structuredClone(value);
}

test("spawn spells: hostile input, duplicates, ordering, seed, and arena bounds reject", () => {
  let getterCalls = 0;
  const accessor = cast(1, 0, 41, "burst");
  Object.defineProperty(accessor, "tick", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 0;
    },
  });
  const sparse = [];
  sparse.length = 1;
  const extra = [cast(1, 0, 41, "burst")];
  extra.extra = true;
  const invalidCommands = [
    [accessor],
    [Object.assign(Object.create({ hostile: true }),
      cast(1, 0, 41, "burst"))],
    [{ ...cast(1, 0, 41, "burst"), [Symbol("x")]: true }],
    sparse,
    extra,
    [cast(1, 0, 41, "burst"), cast(1, 1, 41, "burst")],
    [cast(2, 1, 41, "burst"), cast(1, 0, 41, "burst")],
    [cast(1, 0, 99, "burst")],
    [cast(1, 0, 41, "unknown")],
    [cast(1, 0, 41, "burst", { x: 4099, y: 16000 })],
    [cast(1, 254, 41, "burst")],
  ];
  for (const commands of invalidCommands) {
    assert.throws(() => fixture(commands));
  }
  assert.equal(getterCalls, 0);
  for (const seed of [null, 1.5, {}, Number.NaN]) {
    assert.throws(() => fixture([], seed), /seed/u);
  }
  assert.throws(() => createSpawnSpellFixture({
    commands: [],
    seed: undefined,
    sources: [{ id: 41, ownerId: 7 }],
  }), /seed/u);
  assert.throws(() => createSpawnSpellFixture({
    commands: [],
    seed: 1,
    sources: [],
  }), /must not be empty/u);
});

test("spawn spells: failed bounds and returned values are atomic and isolated", () => {
  const encounter = new SpawnSpellEncounter(fixture([
    cast(1, 0, 41, "periodic"),
  ]));
  encounter.stepMany(6);
  const before = encounter.serialize();
  for (const count of [-1, 1.5, 129, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => encounter.stepMany(count));
    assert.equal(encounter.serialize(), before);
  }
  const replay = encounter.replay;
  const state = encounter.state;
  const children = encounter.children;
  replay[0].tick = 99;
  state.replay[0].tick = 99;
  children[0].data.position.x = 0;
  assert.equal(encounter.replay[0].tick, 0);
  assert.notEqual(encounter.children[0].data.position.x, 0);

  encounter.stepMany(122);
  const terminal = encounter.serialize();
  assert.throws(() => encounter.step(), /encounter bound/u);
  assert.equal(encounter.serialize(), terminal);
});
