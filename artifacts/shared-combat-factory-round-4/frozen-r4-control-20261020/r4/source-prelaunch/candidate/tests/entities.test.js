import assert from "node:assert/strict";
import test from "node:test";

import { EntityStore } from "../src/sim/entities.js";

function createStore() {
  const store = new EntityStore();
  store.spawn({ kind: "first", nested: { value: 1 } });
  store.spawn({ kind: "second" });
  store.spawn({ kind: "third" });
  return store;
}

test("entities: IDs are explicit, monotonic, and never reused", () => {
  const store = createStore();

  assert.deepEqual(
    store.list().map(({ id }) => id),
    [1, 2, 3],
  );
  assert.equal(store.despawn(2), true);
  assert.equal(store.despawn(2), false);
  assert.equal(store.despawn(99), false);
  assert.equal(store.spawn({ kind: "fourth" }).id, 4);
  assert.deepEqual(
    store.list().map(({ id }) => id),
    [1, 3, 4],
  );
  assert.equal(store.nextId, 5);
});

test("entities: same-tick batches resolve strictly in array order", () => {
  const store = new EntityStore();
  const results = store.apply([
    { data: { name: "one" }, type: "spawn" },
    { data: { name: "two" }, type: "spawn" },
    { id: 1, type: "despawn" },
    { data: { name: "three" }, type: "spawn" },
    { id: 1, type: "despawn" },
  ]);

  assert.deepEqual(results, [
    { data: { name: "one" }, id: 1 },
    { data: { name: "two" }, id: 2 },
    true,
    { data: { name: "three" }, id: 3 },
    false,
  ]);
  assert.deepEqual(store.list(), [
    { data: { name: "two" }, id: 2 },
    { data: { name: "three" }, id: 3 },
  ]);
});

test("entities: inputs and every returned state are isolated JSON values", () => {
  const store = new EntityStore();
  const input = { nested: { value: 1 } };
  const spawned = store.spawn(input);
  input.nested.value = 20;
  spawned.data.nested.value = 30;

  const read = store.get(1);
  const listed = store.list();
  read.data.nested.value = 40;
  listed[0].data.nested.value = 50;

  assert.deepEqual(store.get(1), {
    data: { nested: { value: 1 } },
    id: 1,
  });
  assert.throws(() => store.spawn({ bad: Number.NaN }), /finite numbers/);
  assert.throws(() => store.spawn({ bad: undefined }), /plain JSON data/);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => store.spawn(cyclic), /cycles/);
});

test("entities: restore preserves order and byte-identical continuation", () => {
  const uninterrupted = createStore();
  uninterrupted.despawn(2);
  uninterrupted.spawn({ kind: "fourth" });

  const interrupted = createStore();
  interrupted.despawn(2);
  const restored = EntityStore.restore(interrupted.serialize());
  restored.spawn({ kind: "fourth" });

  assert.equal(restored.serialize(), uninterrupted.serialize());
  assert.deepEqual(restored.list(), uninterrupted.list());
  assert.equal(restored.nextId, 5);

  const observed = restored.list();
  observed[0].data.kind = "mutated";
  assert.equal(restored.get(1).data.kind, "first");
});

test("entities: malformed snapshots are rejected", () => {
  const invalidSnapshots = [
    "not json",
    "null",
    "{}",
    JSON.stringify({ entities: [], nextId: 1, version: 2 }),
    JSON.stringify({ entities: {}, nextId: 1, version: 1 }),
    JSON.stringify({
      entities: [{ data: {}, id: 1 }, { data: {}, id: 1 }],
      nextId: 2,
      version: 1,
    }),
    JSON.stringify({
      entities: [{ data: {}, id: 2 }, { data: {}, id: 1 }],
      nextId: 3,
      version: 1,
    }),
    JSON.stringify({
      entities: [{ data: {}, id: 2 }],
      nextId: 2,
      version: 1,
    }),
    JSON.stringify({
      entities: [{ data: {}, id: 1, surprise: true }],
      nextId: 2,
      version: 1,
    }),
    JSON.stringify({
      entities: [],
      nextId: 1,
      surprise: true,
      version: 1,
    }),
  ];

  for (const snapshot of invalidSnapshots) {
    assert.throws(
      () => EntityStore.restore(snapshot),
      undefined,
      `accepted malformed snapshot: ${snapshot}`,
    );
  }
  assert.throws(() => EntityStore.restore({}), /must be a string/);
});

test("entities: invalid IDs and operations have explicit errors", () => {
  const store = new EntityStore();
  assert.throws(() => store.get(0), /positive safe integer/);
  assert.throws(() => store.has(1.5), /positive safe integer/);
  assert.throws(() => store.despawn("1"), /positive safe integer/);
  assert.throws(() => store.apply({}), /must be an array/);
  assert.throws(
    () => store.apply([{ data: {}, type: "unknown" }]),
    /unknown type/,
  );
  assert.throws(
    () => store.apply([{ data: {}, extra: true, type: "spawn" }]),
    /invalid shape/,
  );
});
