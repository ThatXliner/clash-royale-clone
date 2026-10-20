import assert from "node:assert/strict";
import test from "node:test";

import {
  SPAWN_ARCHETYPE_ID_MAX_CODE_POINTS,
  SPAWN_SNAPSHOT_MAX_BYTES,
  SpawnBatchMaterializer,
  createSpawnPlacementQuestionRecords,
} from "../src/content/cards/spawn-placement.js";
import { MAX_SPATIAL_MILLITILES } from "../src/sim/spatial.js";

function batch(overrides = {}) {
  return {
    anchor: { x: 1000, y: 2000 },
    children: [
      { archetypeId: "ember-a", radius: 250, role: "primary" },
      { archetypeId: "ember-b", radius: 250, role: "secondary" },
      { archetypeId: "ember-c", radius: 250, role: "primary" },
    ],
    ownerId: 7,
    sourceId: 91,
    ...overrides,
  };
}

function storedData(archetypeId = "a", overrides = {}) {
  return {
    archetypeId,
    offset: { x: 0, y: 0 },
    ownerId: 1,
    position: { x: 0, y: 0 },
    radius: 0,
    role: "primary",
    sourceId: 1,
    ...overrides,
  };
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

function entityStoreSnapshot(archetypeIds, dataOverride = undefined) {
  return {
    entities: archetypeIds.map((archetypeId, index) => ({
      data: dataOverride === undefined
        ? storedData(archetypeId)
        : dataOverride,
      id: index + 1,
    })),
    nextId: archetypeIds.length + 1,
    version: 1,
  };
}

function wrapperSnapshot({
  batches = [],
  store = entityStoreSnapshot([]),
  version = 2,
} = {}) {
  return canonicalJson({ batches, store, version });
}

function oneChildBatch(archetypeId = "a", overrides = {}) {
  return batch({
    anchor: { x: 0, y: 0 },
    children: [{ archetypeId, radius: 0, role: "primary" }],
    ownerId: 1,
    sourceId: 1,
    ...overrides,
  });
}

function snapshotForBatches(batches) {
  const materializer = new SpawnBatchMaterializer();
  for (const entry of batches) materializer.materialize(entry);
  return materializer.serialize();
}

function largestReachableSnapshot() {
  const materializer = new SpawnBatchMaterializer();
  let previous = materializer.serialize();
  const largeId = "\u0000".repeat(SPAWN_ARCHETYPE_ID_MAX_CODE_POINTS);
  const largeBatch = batch({
    children: Array.from({ length: 15 }, (_, index) => ({
      archetypeId: `${largeId.slice(0, -1)}${index % 10}`,
      radius: 0,
      role: "primary",
    })),
  });
  for (let index = 0; index < 100; index += 1) {
    try {
      materializer.materialize(largeBatch);
      previous = materializer.serialize();
    } catch (error) {
      assert.match(error.message, /snapshot bound/);
      return previous;
    }
  }
  assert.fail("snapshot bound was not reached");
}

test("spawn placement: ordered children use literal formation coordinates and lifecycle IDs", () => {
  const materializer = new SpawnBatchMaterializer();
  assert.deepEqual(materializer.materialize(batch()), [
    {
      data: {
        archetypeId: "ember-a",
        offset: { x: 0, y: -502 },
        ownerId: 7,
        position: { x: 1000, y: 1498 },
        radius: 250,
        role: "primary",
        sourceId: 91,
      },
      id: 1,
    },
    {
      data: {
        archetypeId: "ember-b",
        offset: { x: -251, y: 251 },
        ownerId: 7,
        position: { x: 749, y: 2251 },
        radius: 250,
        role: "secondary",
        sourceId: 91,
      },
      id: 2,
    },
    {
      data: {
        archetypeId: "ember-c",
        offset: { x: 251, y: 251 },
        ownerId: 7,
        position: { x: 1251, y: 2251 },
        radius: 250,
        role: "primary",
        sourceId: 91,
      },
      id: 3,
    },
  ]);
  assert.equal(materializer.nextId, 4);
});

test("spawn placement: later batches preserve monotonic IDs and stable batch order", () => {
  const materializer = new SpawnBatchMaterializer();
  materializer.materialize(batch());
  const second = materializer.materialize(batch({
    anchor: { x: -500, y: 300 },
    children: [
      { archetypeId: "later-left", radius: 10, role: "secondary" },
      { archetypeId: "later-right", radius: 10, role: "primary" },
    ],
    ownerId: 8,
    sourceId: 92,
  }));
  assert.deepEqual(
    second.map(({ data, id }) => ({
      archetypeId: data.archetypeId,
      id,
      ownerId: data.ownerId,
      sourceId: data.sourceId,
    })),
    [
      { archetypeId: "later-left", id: 4, ownerId: 8, sourceId: 92 },
      { archetypeId: "later-right", id: 5, ownerId: 8, sourceId: 92 },
    ],
  );
  assert.deepEqual(materializer.list().map(({ id }) => id), [1, 2, 3, 4, 5]);
});

test("spawn placement: bounds failure is atomic", () => {
  const materializer = new SpawnBatchMaterializer();
  materializer.materialize(batch({
    children: [{ archetypeId: "existing", radius: 0, role: "primary" }],
  }));
  const before = materializer.serialize();
  assert.throws(
    () => materializer.materialize(batch({
      anchor: { x: MAX_SPATIAL_MILLITILES, y: 0 },
      children: [
        { archetypeId: "would-fit", radius: 1, role: "primary" },
        { archetypeId: "out-of-bounds", radius: 1, role: "secondary" },
      ],
    })),
    /outside the supported spatial bounds/,
  );
  assert.equal(materializer.serialize(), before);
  assert.equal(materializer.nextId, 2);
});

test("spawn placement: hostile structures reject without getters or partial mutation", () => {
  const materializer = new SpawnBatchMaterializer();
  materializer.materialize(batch({
    children: [{ archetypeId: "existing", radius: 0, role: "primary" }],
  }));
  const before = materializer.serialize();
  let getterCalls = 0;

  const accessorChild = { archetypeId: "hostile", role: "primary" };
  Object.defineProperty(accessorChild, "radius", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 1;
    },
  });
  const accessorAnchor = { y: 0 };
  Object.defineProperty(accessorAnchor, "x", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 0;
    },
  });
  const sparse = [];
  sparse.length = 1;

  for (const hostile of [
    batch({ children: [accessorChild] }),
    batch({ anchor: accessorAnchor }),
    batch({ children: sparse }),
    batch({ children: [] }),
    batch({ children: Array(16).fill(
      { archetypeId: "too-many", radius: 0, role: "primary" },
    ) }),
    { ...batch(), extra: true },
    batch({ ownerId: { valueOf: () => 7 } }),
    batch({ sourceId: 0 }),
  ]) {
    assert.throws(() => materializer.materialize(hostile));
    assert.equal(materializer.serialize(), before);
  }
  assert.equal(getterCalls, 0);
});

test("spawn placement: archetype IDs use an exact well-formed Unicode code-point bound", () => {
  assert.equal(SPAWN_ARCHETYPE_ID_MAX_CODE_POINTS, 128);
  const materializer = new SpawnBatchMaterializer();
  for (const archetypeId of [
    "a".repeat(127),
    "a".repeat(128),
    "😀".repeat(128),
  ]) {
    materializer.materialize(batch({
      children: [{ archetypeId, radius: 0, role: "primary" }],
    }));
  }
  const before = materializer.serialize();
  for (const archetypeId of [
    "",
    "a".repeat(129),
    "😀".repeat(129),
    "\ud800",
    "\udc00",
  ]) {
    assert.throws(
      () => materializer.materialize(batch({
        children: [{ archetypeId, radius: 0, role: "primary" }],
      })),
      /well-formed Unicode code points/,
    );
    assert.equal(materializer.serialize(), before);
  }

  const millionCharacterCriticProbe = "x".repeat(1_000_000);
  assert.throws(
    () => materializer.materialize(batch({
      children: [{
        archetypeId: millionCharacterCriticProbe,
        radius: 0,
        role: "primary",
      }],
    })),
    /well-formed Unicode code points/,
  );
  assert.equal(materializer.serialize(), before);
});

test("spawn placement: outputs and inputs are isolated", () => {
  const materializer = new SpawnBatchMaterializer();
  const input = batch();
  const result = materializer.materialize(input);
  input.children[0].archetypeId = "mutated-input";
  input.anchor.x = 0;
  result[0].data.position.x = 0;
  assert.equal(materializer.list()[0].data.archetypeId, "ember-a");
  assert.deepEqual(materializer.list()[0].data.position, { x: 1000, y: 1498 });
});

test("spawn placement: restore continuation is byte-identical", () => {
  const first = batch();
  const continuation = batch({
    anchor: { x: -2000, y: -3000 },
    children: [
      { archetypeId: "next-a", radius: 125, role: "primary" },
      { archetypeId: "next-b", radius: 200, role: "secondary" },
    ],
    ownerId: 12,
    sourceId: 44,
  });

  const uninterrupted = new SpawnBatchMaterializer();
  uninterrupted.materialize(first);
  uninterrupted.materialize(continuation);

  const interrupted = new SpawnBatchMaterializer();
  interrupted.materialize(first);
  const bytes = interrupted.serialize();
  const restored = SpawnBatchMaterializer.restore(bytes);
  assert.equal(restored.serialize(), bytes);
  restored.materialize(continuation);

  assert.equal(restored.serialize(), uninterrupted.serialize());
  assert.deepEqual(restored.list(), uninterrupted.list());
});

test("spawn placement: snapshot format is a canonical versioned batch ledger plus entity store", () => {
  const emptyBytes = new SpawnBatchMaterializer().serialize();
  assert.equal(
    SpawnBatchMaterializer.restore(emptyBytes).serialize(),
    emptyBytes,
  );

  const materializer = new SpawnBatchMaterializer();
  materializer.materialize(batch());
  const parsed = JSON.parse(materializer.serialize());
  assert.deepEqual(Object.keys(parsed), ["batches", "store", "version"]);
  assert.equal(parsed.version, 2);
  assert.deepEqual(parsed.batches, [batch()]);
  assert.deepEqual(parsed.store.entities, materializer.list());
  assert.equal(parsed.store.nextId, 4);
  assert.equal(parsed.store.version, 1);

  for (const hostile of [
    null,
    {},
    { ...parsed, version: 1 },
    { ...parsed, extra: true },
    {
      ...parsed,
      store: {
        ...parsed.store,
        entities: [...parsed.store.entities].reverse(),
      },
    },
  ]) {
    assert.throws(() =>
      SpawnBatchMaterializer.restore(canonicalJson(hostile))
    );
  }
  assert.throws(() => SpawnBatchMaterializer.restore({}));
  assert.throws(() => SpawnBatchMaterializer.restore("{"));
});

test("spawn placement: restore requires exact canonical materializer-owned bytes", () => {
  const canonical = snapshotForBatches([oneChildBatch("valid")]);
  assert.equal(SpawnBatchMaterializer.restore(canonical).serialize(), canonical);

  const empty = new SpawnBatchMaterializer().serialize();
  const noncanonicalCriticProbe = `${empty}       `;
  const legacy45ByteCriticProbe =
    '{"entities":[],"nextId":1,"version":1}       ';
  assert.equal(Buffer.byteLength(legacy45ByteCriticProbe, "utf8"), 45);
  for (const noncanonical of [
    noncanonicalCriticProbe,
    legacy45ByteCriticProbe,
    ` ${canonical}`,
    `${canonical}\n`,
    canonical.replace('"valid"', '"\\u0076alid"'),
    canonical.replace('"ownerId":1', '"ownerId":1,"ownerId":1'),
  ]) {
    assert.throws(
      () => SpawnBatchMaterializer.restore(noncanonical),
      /canonical bytes/,
    );
  }
});

test("spawn placement: restore rejects unreachable lifecycle and geometry states", () => {
  const reachableData = storedData("a");
  const criticProbes = [
    wrapperSnapshot({
      store: { entities: [], nextId: 2, version: 1 },
    }),
    wrapperSnapshot({
      store: {
        entities: [{ data: reachableData, id: 2 }],
        nextId: 3,
        version: 1,
      },
    }),
    wrapperSnapshot({
      batches: [oneChildBatch("a")],
      store: entityStoreSnapshot(["a"], storedData("a", {
        offset: { x: 1, y: 0 },
        position: { x: 1, y: 0 },
      })),
    }),
  ];
  for (const criticProbe of criticProbes) {
    assert.throws(
      () => SpawnBatchMaterializer.restore(criticProbe),
      /not reproducible/,
    );
  }
});

test("spawn placement: restore rejects foreign and malformed entity data schemas", () => {
  const foreignCriticProbe = wrapperSnapshot({
    store: {
      entities: [{ data: { alien: true }, id: 1 }],
      nextId: 2,
      version: 1,
    },
  });
  assert.throws(
    () => SpawnBatchMaterializer.restore(foreignCriticProbe),
    /invalid shape/,
  );

  const valid = storedData();
  const { role: _missing, ...missing } = valid;
  const malformed = [
    { ...valid, extra: true },
    missing,
    { ...valid, archetypeId: "x".repeat(129) },
    { ...valid, archetypeId: "\ud800" },
    { ...valid, offset: { x: 0 } },
    { ...valid, offset: { x: 0, y: 0, z: 0 } },
    { ...valid, offset: { x: MAX_SPATIAL_MILLITILES * 2 + 1, y: 0 } },
    { ...valid, ownerId: 0 },
    { ...valid, position: { x: MAX_SPATIAL_MILLITILES + 1, y: 0 } },
    { ...valid, radius: MAX_SPATIAL_MILLITILES + 1 },
    { ...valid, role: "alien" },
    { ...valid, sourceId: 0 },
    {
      ...valid,
      offset: { x: MAX_SPATIAL_MILLITILES * 2, y: 0 },
      position: { x: -MAX_SPATIAL_MILLITILES, y: 0 },
    },
  ];
  for (const data of malformed) {
    assert.throws(() =>
      SpawnBatchMaterializer.restore(wrapperSnapshot({
        store: entityStoreSnapshot(["a"], data),
      }))
    );
  }
});

test("spawn placement: every single-batch size 1 through 15 replays exactly", () => {
  for (let count = 1; count <= 15; count += 1) {
    const entry = batch({
      anchor: { x: count * 10, y: -count * 20 },
      children: Array.from({ length: count }, (_, index) => ({
        archetypeId: `size-${count}-child-${index}`,
        radius: index % 3,
        role: index % 2 === 0 ? "primary" : "secondary",
      })),
      ownerId: count,
      sourceId: 100 + count,
    });
    const bytes = snapshotForBatches([entry]);
    const restored = SpawnBatchMaterializer.restore(bytes);
    assert.equal(restored.serialize(), bytes, `count ${count}`);
    assert.deepEqual(
      restored.list().map(({ id }) => id),
      Array.from({ length: count }, (_, index) => index + 1),
      `count ${count}`,
    );
  }
});

test("spawn placement: multi-batch grouping is causal and independently replayed", () => {
  const batches = [
    oneChildBatch("solo"),
    batch({
      anchor: { x: -500, y: 700 },
      children: [
        { archetypeId: "group-a", radius: 10, role: "primary" },
        { archetypeId: "group-b", radius: 20, role: "secondary" },
        { archetypeId: "group-c", radius: 30, role: "primary" },
      ],
      ownerId: 3,
      sourceId: 4,
    }),
    oneChildBatch("tail", { anchor: { x: 90, y: -40 } }),
  ];
  const bytes = snapshotForBatches(batches);
  const restored = SpawnBatchMaterializer.restore(bytes);
  assert.equal(restored.serialize(), bytes);
  assert.deepEqual(restored.list().map(({ id }) => id), [1, 2, 3, 4, 5]);

  const regrouped = JSON.parse(bytes);
  regrouped.batches = [
    ...regrouped.batches.slice(0, 1),
    ...regrouped.batches[1].children.map((child) => ({
      ...regrouped.batches[1],
      children: [child],
    })),
    ...regrouped.batches.slice(2),
  ];
  assert.throws(
    () => SpawnBatchMaterializer.restore(canonicalJson(regrouped)),
    /not reproducible/,
  );
});

test("spawn placement: every ledger field and entity agreement forgery rejects", () => {
  const bytes = snapshotForBatches([batch()]);
  const original = JSON.parse(bytes);
  const mutations = [
    (value) => { value.batches[0].anchor.x += 1; },
    (value) => { value.batches[0].children[0].archetypeId = "forged"; },
    (value) => { value.batches[0].children[0].radius += 1; },
    (value) => { value.batches[0].children[0].role = "secondary"; },
    (value) => { value.batches[0].ownerId += 1; },
    (value) => { value.batches[0].sourceId += 1; },
    (value) => { value.batches[0].children.reverse(); },
    (value) => { value.batches[0].children.pop(); },
    (value) => { value.batches.push(structuredClone(value.batches[0])); },
    (value) => { value.store.entities.reverse(); },
    (value) => { value.store.entities.pop(); },
    (value) => { value.store.entities.push(structuredClone(value.store.entities[0])); },
    (value) => { value.store.nextId += 1; },
    (value) => { value.store.entities[0].data.offset.x += 1; },
    (value) => { value.store.entities[0].data.position.x += 1; },
  ];
  for (const mutate of mutations) {
    const forged = structuredClone(original);
    mutate(forged);
    assert.throws(() =>
      SpawnBatchMaterializer.restore(canonicalJson(forged))
    );
  }

  for (const malformedLedger of [
    { ...batch(), extra: true },
    Object.fromEntries(
      Object.entries(batch()).filter(([key]) => key !== "ownerId"),
    ),
    { ...batch(), children: [] },
    { ...batch(), children: Array(16).fill(batch().children[0]) },
    { ...batch(), anchor: { x: 0 } },
    { ...batch(), anchor: { x: 0, y: 0, extra: true } },
    { ...batch(), ownerId: 0 },
    {
      ...batch(),
      children: [
        { ...batch().children[0], extra: true },
        ...batch().children.slice(1),
      ],
    },
    {
      ...batch(),
      children: [
        { radius: 250, role: "primary" },
        ...batch().children.slice(1),
      ],
    },
    {
      ...batch(),
      children: [
        { ...batch().children[0], radius: -1 },
        ...batch().children.slice(1),
      ],
    },
    {
      ...batch(),
      children: [
        { ...batch().children[0], role: "alien" },
        ...batch().children.slice(1),
      ],
    },
  ]) {
    const forged = structuredClone(original);
    forged.batches[0] = malformedLedger;
    assert.throws(() =>
      SpawnBatchMaterializer.restore(canonicalJson(forged))
    );
  }
});

test("spawn placement: snapshot UTF-8 byte bound remains exact", () => {
  assert.equal(SPAWN_SNAPSHOT_MAX_BYTES, 131_072);
  const reachable = largestReachableSnapshot();
  assert.ok(Buffer.byteLength(reachable, "utf8") <= SPAWN_SNAPSHOT_MAX_BYTES);
  assert.equal(SpawnBatchMaterializer.restore(reachable).serialize(), reachable);
  const exactLimit = reachable.padEnd(
    SPAWN_SNAPSHOT_MAX_BYTES,
    " ",
  );
  assert.equal(Buffer.byteLength(exactLimit, "utf8"), SPAWN_SNAPSHOT_MAX_BYTES);
  assert.throws(
    () => SpawnBatchMaterializer.restore(exactLimit),
    /canonical bytes/,
  );
  assert.throws(
    () => SpawnBatchMaterializer.restore(`${exactLimit} `),
    /exceeds 131072 UTF-8 bytes/,
  );
  const oversizedCriticProbe = snapshotForBatches([oneChildBatch("valid")])
    .padEnd(1_000_065, " ");
  assert.equal(Buffer.byteLength(oversizedCriticProbe, "utf8"), 1_000_065);
  assert.throws(
    () => SpawnBatchMaterializer.restore(oversizedCriticProbe),
    /exceeds 131072 UTF-8 bytes/,
  );
});

test("spawn placement: resulting snapshot bound rejects atomically", () => {
  const materializer = new SpawnBatchMaterializer();
  const largeId = "\u0000".repeat(SPAWN_ARCHETYPE_ID_MAX_CODE_POINTS);
  let accepted = 0;
  while (accepted < 100) {
    const before = materializer.serialize();
    try {
      materializer.materialize(batch({
        children: Array.from({ length: 15 }, (_, index) => ({
          archetypeId: `${largeId.slice(0, -1)}${index % 10}`,
          radius: 0,
          role: "primary",
        })),
      }));
      accepted += 1;
    } catch (error) {
      assert.match(error.message, /snapshot bound/);
      assert.equal(materializer.serialize(), before);
      assert.ok(Buffer.byteLength(before, "utf8") <= SPAWN_SNAPSHOT_MAX_BYTES);
      return;
    }
  }
  assert.fail("snapshot bound was not reached");
});

test("spawn placement: absent placement ownership and order policies are immutable QUESTION records", () => {
  const records = createSpawnPlacementQuestionRecords();
  assert.deepEqual(Object.keys(records), ["order", "ownership", "placement"]);
  for (const [name, record] of Object.entries(records)) {
    assert.equal(record.authoritative, false, name);
    assert.equal(record.confidence, "unverified", name);
    assert.equal(record.disposition, "question", name);
    assert.equal(record.source, "unsourced-spawn-placement-policy-fixture", name);
    assert.equal(Object.isFrozen(record), true, name);
  }
  assert.equal(Object.isFrozen(records), true);
  assert.throws(() => {
    records.order.value = "mutated";
  }, TypeError);
  assert.throws(() => createSpawnPlacementQuestionRecords("argument"));
});

test("spawn placement: materializer exposes only placement lifecycle operations", () => {
  const ownMethods = Object.getOwnPropertyNames(
    SpawnBatchMaterializer.prototype,
  ).sort();
  assert.deepEqual(ownMethods, [
    "constructor",
    "list",
    "materialize",
    "nextId",
    "serialize",
  ]);
});
