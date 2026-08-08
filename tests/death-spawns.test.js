import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEATH_SPAWN_IDENTITY,
  DeathSpawnEncounter,
  createDeathSpawnFixture,
  createDeathSpawnQuestionRecords,
} from "../src/content/cards/death-spawns.js";
import { SpawnBatchMaterializer } from
  "../src/content/cards/spawn-placement.js";

function child(archetypeId, overrides = {}) {
  return {
    archetypeId,
    children: [],
    health: 20,
    periodic: null,
    radius: 50,
    role: "primary",
    ...overrides,
  };
}

function parent(id, overrides = {}) {
  return {
    anchor: { x: id * 10, y: -id * 10 },
    archetypeId: `source-${id}`,
    children: [child(`child-${id}`)],
    health: 100,
    id,
    ownerId: 7,
    periodic: null,
    sourceId: id,
    ...overrides,
  };
}

function command(targetId, amount, tick = 0, overrides = {}) {
  return {
    amount,
    cause: "combat-damage",
    sourceId: 900,
    targetId,
    tick,
    ...overrides,
  };
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

function frozen(value) {
  if (value !== null && typeof value === "object") {
    assert.equal(Object.isFrozen(value), true);
    for (const nested of Object.values(value)) frozen(nested);
  }
}

function run(entities, commands, ticks = 20) {
  const encounter = new DeathSpawnEncounter(
    createDeathSpawnFixture(entities, commands),
  );
  encounter.stepMany(ticks);
  return encounter;
}

function byType(encounter, type) {
  return encounter.replay.filter((event) => event.type === type);
}

// Independent literal oracle. It contains no production imports or shared
// reducers: command damage is input-order, lethal parents are drained by ID,
// and each graph node is appended to a plain FIFO exactly once.
function literalOracle(entities, commands, endTick) {
  const rows = structuredClone(entities).map((entry) => ({
    ...entry,
    alive: true,
    bornTick: 0,
    periodicBatchCount: 0,
  })).sort((a, b) => a.id - b.id);
  const ordered = commands.map((entry, sequence) => ({ ...entry, sequence }))
    .sort((a, b) => a.tick - b.tick || a.sequence - b.sequence);
  const latch = [];
  const batches = [];
  let nextId = 1;
  for (let tick = 0; tick < endTick; tick += 1) {
    const deaths = [];
    const health = new Map(rows.map((row) => [row.id, row.alive ? row.health : 0]));
    for (const request of ordered.filter((entry) => entry.tick === tick)) {
      const before = health.get(request.targetId) ?? 0;
      const after = before - Math.min(before, request.amount);
      health.set(request.targetId, after);
      const target = rows.find(({ id }) => id === request.targetId);
      if (target?.alive) target.health = after;
      if (before > 0 && after === 0 && target?.alive &&
          !deaths.some(({ target: seen }) => seen.id === target.id)) {
        deaths.push({ cause: request.cause, target });
      }
    }
    const queue = deaths.sort((a, b) => a.target.id - b.target.id)
      .map(({ cause, target }) => {
        target.alive = false;
        return cause === "combat-damage" ? target.id : null;
      }).filter((id) => id !== null);
    while (queue.length > 0) {
      const sourceId = queue.shift();
      if (latch.includes(sourceId)) continue;
      latch.push(sourceId);
      const source = rows.find(({ id }) => id === sourceId);
      if (source.children.length > 0) {
        const ids = source.children.map(() => nextId++);
        batches.push([tick, "death", sourceId, ids]);
        source.children.forEach((spec, index) => rows.push({
          alive: true,
          anchor: source.anchor,
          archetypeId: spec.archetypeId,
          bornTick: tick,
          children: structuredClone(spec.children),
          health: spec.health,
          id: ids[index],
          ownerId: source.ownerId,
          periodic: structuredClone(spec.periodic),
          periodicBatchCount: 0,
          sourceId,
        }));
      }
    }
    for (const source of [...rows].sort((a, b) => a.id - b.id)) {
      if (!source.alive || source.periodic === null) continue;
      const due = source.bornTick + source.periodic.initialDelayTicks +
        source.periodicBatchCount * source.periodic.cadenceTicks;
      if (tick === due) {
        const ids = source.periodic.children.map(() => nextId++);
        batches.push([tick, "periodic", source.id, ids]);
        source.periodicBatchCount += 1;
      }
    }
  }
  return { batches, latch };
}

test("death spawns: original shipped identity and test-only benchmark mappings", () => {
  assert.deepEqual(DEATH_SPAWN_IDENTITY, {
    displayName: "Ashen Nest",
    id: "ashen-nest",
  });
  frozen(DEATH_SPAWN_IDENTITY);
  const runtime = readFileSync(
    new URL("../src/content/cards/death-spawns.js", import.meta.url),
    "utf8",
  );
  // Historical benchmark identities are comparison labels only.
  const benchmarkMappings = new Map([
    ["Golem", "source-with-ordered-death-children"],
    ["Tombstone", "periodic-source-with-death-children"],
    ["Lava Hound", "recursive-source-child-graph"],
  ]);
  for (const protectedName of benchmarkMappings.keys()) {
    assert.equal(runtime.toLowerCase().includes(protectedName.toLowerCase()), false);
  }
  assert.doesNotMatch(runtime, /reference\/|cards\.json|readFile/u);
});

test("death spawns: every omitted value and policy is its own fresh frozen QUESTION", () => {
  const first = createDeathSpawnQuestionRecords();
  const second = createDeathSpawnQuestionRecords();
  assert.deepEqual(Object.keys(first), [
    "shippedIdentity",
    "benchmarkMapping",
    "parentHealth",
    "parentAnchor",
    "deathSpawnGraph",
    "deathChildCount",
    "deathChildSpecifications",
    "eligibleLethalCauses",
    "exactlyOnceLatch",
    "sourceRemovalOrder",
    "simultaneousParentOrder",
    "periodicBoundaryOrder",
    "periodicInitialDelayTicks",
    "periodicCadenceTicks",
    "periodicLifetimeTicks",
    "priorPeriodicChildSurvival",
    "futurePeriodicCancellation",
    "recursionPolicy",
    "recursionBound",
    "eventBound",
    "entityBound",
    "graphBound",
    "initialIdNamespace",
    "ownerAttribution",
    "sourceAttribution",
    "childOrder",
    "idPolicy",
    "anchorPolicy",
    "commandOrder",
    "zeroDamagePolicy",
    "overkillPolicy",
    "alreadyDeadPolicy",
    "snapshotPolicy",
  ]);
  assert.equal(Object.keys(first).length, 33);
  frozen(first);
  frozen(second);
  assert.notEqual(first, second);
  for (const [key, record] of Object.entries(first)) {
    assert.notEqual(record, second[key]);
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
      source: "unsourced-death-spawn-graph-policy-fixture",
    });
  }
  assert.throws(() => createDeathSpawnQuestionRecords(1), /do not accept/u);
});

test("death spawns: default command-first boundary cancels periodic and materializes death batch", () => {
  const encounter = new DeathSpawnEncounter();
  encounter.stepMany(5);
  assert.deepEqual(encounter.replay.map(({ tick, type }) => [tick, type]), [
    [3, "damage"],
    [3, "death"],
    [3, "source-despawn"],
    [3, "death-triggered"],
    [3, "spawn-batch"],
  ]);
  const batch = byType(encounter, "spawn-batch")[0];
  assert.deepEqual(batch, {
    anchor: { x: -600, y: 1400 },
    batchIndex: 0,
    childIds: [1, 2],
    kind: "death",
    ownerId: 7,
    sourceId: 101,
    tick: 3,
    type: "spawn-batch",
  });
  assert.deepEqual(encounter.children.map(({ data, id }) => [
    id, data.archetypeId, data.ownerId, data.sourceId,
  ]), [
    [1, "coal-mite", 7, 101],
    [2, "coal-mite", 7, 101],
  ]);
});

test("death spawns: explicit eligible cause and zero overkill already-dead policies", () => {
  const cases = [
    [command(101, 100, 0, { cause: "expiry" }), 0],
    [command(101, 100, 0, { cause: "despawn" }), 0],
    [command(101, 0), 0],
  ];
  for (const [request, expected] of cases) {
    assert.equal(byType(run([parent(101)], [request]), "death-triggered").length,
      expected);
  }
  const encounter = run([parent(101)], [
    command(101, 100),
    command(101, 999),
    command(101, 1, 1),
  ]);
  assert.deepEqual(byType(encounter, "damage").map(
    ({ applied, healthBefore }) => [healthBefore, applied],
  ), [[100, 100], [0, 0], [0, 0]]);
  assert.equal(byType(encounter, "death").length, 1);
  assert.equal(byType(encounter, "death-triggered").length, 1);
});

test("death spawns: simultaneous parents resolve death and batches by stable source ID", () => {
  const encounter = run(
    [parent(120), parent(110)],
    [command(120, 100), command(110, 100)],
  );
  assert.deepEqual(byType(encounter, "death").map(({ targetId }) => targetId),
    [110, 120]);
  assert.deepEqual(byType(encounter, "spawn-batch").map(
    ({ childIds, sourceId }) => [sourceId, childIds],
  ), [[110, [1]], [120, [2]]]);
});

test("death spawns: prior periodic batch survives and same-boundary/future batches cancel", () => {
  const source = parent(101, {
    periodic: {
      cadenceTicks: 2,
      children: [child("periodic")],
      initialDelayTicks: 1,
      lifetimeTicks: 9,
    },
  });
  const encounter = run([source], [command(101, 100, 3)], 9);
  assert.deepEqual(byType(encounter, "spawn-batch").map(
    ({ childIds, kind, tick }) => [tick, kind, childIds],
  ), [
    [1, "periodic", [1]],
    [3, "death", [2]],
  ]);
  assert.deepEqual(encounter.children.map(({ data }) => data.archetypeId),
    ["periodic", "child-101"]);
});

test("death spawns: initial periodic source batches ignore unrelated setup entities and order", () => {
  const unrelated = parent(101);
  const periodic = parent(110, {
    children: [],
    periodic: {
      cadenceTicks: 1,
      children: [child("periodic")],
      initialDelayTicks: 1,
      lifetimeTicks: 6,
    },
  });
  const setups = [
    [unrelated, periodic],
    [periodic, unrelated],
    [periodic],
  ];
  for (const entities of setups) {
    const encounter = run(entities, [], 3);
    assert.deepEqual(
      encounter.state.entities.filter(({ id }) => id > 64)
        .map(({ bornTick, id }) => [id, bornTick]),
      entities.length === 1 ? [[110, 0]] : [[101, 0], [110, 0]],
    );
    assert.deepEqual(byType(encounter, "spawn-batch").map(
      ({ childIds, kind, sourceId, tick }) =>
        [tick, kind, sourceId, childIds],
    ), [
      [1, "periodic", 110, [1]],
      [2, "periodic", 110, [2]],
    ]);
  }
});

test("death spawns: setup permutations preserve boundary cancellation IDs chunks and restore", () => {
  const unrelated = parent(101);
  const later = parent(120);
  const periodic = parent(110, {
    periodic: {
      cadenceTicks: 1,
      children: [child("periodic")],
      initialDelayTicks: 1,
      lifetimeTicks: 8,
    },
  });
  const permutations = [
    [unrelated, periodic, later],
    [unrelated, later, periodic],
    [periodic, unrelated, later],
    [periodic, later, unrelated],
    [later, unrelated, periodic],
    [later, periodic, unrelated],
  ];
  let canonical = null;
  for (const entities of permutations) {
    const fixture = createDeathSpawnFixture(
      entities,
      [command(110, 100, 2)],
    );
    const straight = new DeathSpawnEncounter(fixture);
    straight.stepMany(6);
    assert.deepEqual(byType(straight, "spawn-batch").map(
      ({ childIds, kind, sourceId, tick }) =>
        [tick, kind, sourceId, childIds],
    ), [
      [1, "periodic", 110, [1]],
      [2, "death", 110, [2]],
    ]);
    assert.deepEqual(straight.children.map(({ data, id }) => [
      id, data.archetypeId, data.sourceId,
    ]), [
      [1, "periodic", 110],
      [2, "child-110", 110],
    ]);
    assert.equal(byType(straight, "spawn-batch").some(
      ({ kind, tick }) => kind === "periodic" && tick >= 2,
    ), false);

    const chunked = new DeathSpawnEncounter(fixture);
    for (const count of [1, 1, 2, 2]) chunked.stepMany(count);
    assert.equal(chunked.serialize(), straight.serialize());
    for (let cut = 0; cut <= 6; cut += 1) {
      const partial = new DeathSpawnEncounter(fixture);
      partial.stepMany(cut);
      const restored = DeathSpawnEncounter.restore(partial.serialize());
      restored.stepMany(6 - cut);
      assert.equal(restored.serialize(), straight.serialize(), `cut ${cut}`);
    }
    canonical ??= straight.serialize();
    assert.equal(straight.serialize(), canonical);
  }

  const forged = JSON.parse(canonical);
  forged.state.entities.find(({ id }) => id === 110).bornTick = 1;
  assert.throws(
    () => DeathSpawnEncounter.restore(canonicalJson(forged)),
    /forged/u,
  );
  assert.equal(
    DeathSpawnEncounter.restore(canonical).serialize(),
    canonical,
  );
});

test("death spawns: later recursive child deaths use immediate attribution without duplicates", () => {
  const grandchild = child("grandchild");
  const recursive = parent(101, {
    children: [child("recursive-child", { children: [grandchild] })],
  });
  const encounter = run([recursive], [
    command(101, 100, 0),
    command(1, 20, 2),
    command(1, 999, 3),
  ], 6);
  assert.deepEqual(byType(encounter, "death-triggered").map(({ sourceId }) =>
    sourceId), [101, 1]);
  assert.deepEqual(byType(encounter, "spawn-batch").map(
    ({ childIds, ownerId, sourceId }) => [sourceId, ownerId, childIds],
  ), [[101, 7, [1]], [1, 7, [2]]]);
  assert.equal(encounter.children[1].data.sourceId, 1);
  assert.deepEqual(encounter.state.latches, [101, 1]);
});

test("death spawns: literal FIFO graph oracle matches IDs kinds and latches", () => {
  const entities = [
    parent(120, { children: [child("twenty-a"), child("twenty-b")] }),
    parent(110, {
      children: [child("ten", { children: [child("ten-grandchild")] })],
      periodic: {
        cadenceTicks: 5,
        children: [child("early")],
        initialDelayTicks: 1,
        lifetimeTicks: 20,
      },
    }),
  ];
  const commands = [
    command(120, 100, 2),
    command(110, 100, 2),
    command(2, 20, 4),
  ];
  const expected = literalOracle(entities, commands, 8);
  const encounter = run(entities, commands, 8);
  assert.deepEqual(byType(encounter, "spawn-batch").map(
    ({ childIds, kind, sourceId, tick }) => [tick, kind, sourceId, childIds],
  ), expected.batches);
  assert.deepEqual(encounter.state.latches, expected.latch);
});

test("death spawns: arbitrary chunking and every causal restore cut are byte-identical", () => {
  const fixture = createDeathSpawnFixture(
    [parent(101, {
      children: [child("recursive", { children: [child("tail")] })],
    })],
    [command(101, 100, 2), command(1, 20, 7)],
  );
  const straight = new DeathSpawnEncounter(fixture);
  straight.stepMany(30);
  const chunked = new DeathSpawnEncounter(fixture);
  for (const count of [1, 2, 5, 3, 8, 11]) chunked.stepMany(count);
  assert.equal(chunked.serialize(), straight.serialize());
  for (let cut = 0; cut <= 30; cut += 1) {
    const partial = new DeathSpawnEncounter(fixture);
    partial.stepMany(cut);
    const restored = DeathSpawnEncounter.restore(partial.serialize());
    restored.stepMany(30 - cut);
    assert.equal(restored.serialize(), straight.serialize(), `cut ${cut}`);
  }
});

test("death spawns: canonical snapshot rejects latches graphs histories and nested placement forgeries", () => {
  const encounter = new DeathSpawnEncounter();
  encounter.stepMany(5);
  const bytes = encounter.serialize();
  const original = JSON.parse(bytes);
  assert.equal(DeathSpawnEncounter.restore(bytes).serialize(), bytes);
  const mutations = [
    (value) => { value.state.latches = []; },
    (value) => { value.state.latches.push(999); },
    (value) => { value.identity.setup.entities[0].children[0].health += 1; },
    (value) => {
      value.state.entities.find(({ id }) => id === 101).children = [];
    },
    (value) => { value.state.history[0].applied -= 1; },
    (value) => { value.state.history.pop(); },
    (value) => { value.state.batchCount += 1; },
    (value) => {
      const nested = JSON.parse(value.placementSnapshotBytes);
      nested.batches[0].anchor.x += 1;
      value.placementSnapshotBytes = canonicalJson(nested);
    },
  ];
  for (const mutate of mutations) {
    const forged = structuredClone(original);
    mutate(forged);
    assert.throws(() => DeathSpawnEncounter.restore(canonicalJson(forged)));
  }
  for (const noncanonical of [
    `${bytes} `,
    ` ${bytes}`,
    bytes.replace('"version":1', '"version":1,"version":1'),
  ]) {
    assert.throws(() => DeathSpawnEncounter.restore(noncanonical), /canonical/u);
  }
  assert.throws(() => DeathSpawnEncounter.restore("{"));
  assert.throws(() => DeathSpawnEncounter.restore({}));
});

test("death spawns: hostile setup graph and command data reject without getters", () => {
  let calls = 0;
  const accessor = parent(101);
  Object.defineProperty(accessor, "health", {
    enumerable: true,
    get() {
      calls += 1;
      return 100;
    },
  });
  const sparse = [];
  sparse.length = 1;
  const aliased = child("alias");
  const malformedEntities = [
    [accessor],
    sparse,
    [{ ...parent(101), extra: true }],
    [{ ...parent(101), children: sparse }],
    [{ ...parent(101), children: Array(16).fill(child("wide")) }],
    [{ ...parent(101), children: [aliased, aliased] }],
    [{ ...parent(101), archetypeId: "x".repeat(129) }],
    [{ ...parent(101), health: Number.MAX_SAFE_INTEGER + 1 }],
    [parent(101), parent(101)],
    [parent(1)],
    [Object.assign(Object.create({}), parent(101))],
  ];
  const symbolEntity = parent(101);
  symbolEntity[Symbol("hostile")] = true;
  malformedEntities.push([symbolEntity]);
  const symbolChild = child("symbol");
  symbolChild[Symbol("hostile")] = true;
  malformedEntities.push([parent(101, { children: [symbolChild] })]);
  malformedEntities.push([
    parent(101, {
      periodic: {
        cadenceTicks: 1,
        children: [],
        initialDelayTicks: 1,
        lifetimeTicks: 2,
      },
    }),
  ]);
  for (const entities of malformedEntities) {
    assert.throws(() => createDeathSpawnFixture(entities, []));
  }
  const malformedCommands = [
    sparse,
    [{ ...command(101, 1), extra: true }],
    [command(101, -1)],
    [command(101, 1, 512)],
    [command(101, 1, 0, { cause: "alien" })],
    [command(101, 1), command(101, 1)],
    [Object.assign(Object.create({}), command(101, 1))],
    Array(129).fill(command(101, 1)).map((value, index) => ({
      ...value,
      tick: index % 512,
      targetId: 1000 + index,
    })),
  ];
  const symbolCommand = command(101, 1);
  symbolCommand[Symbol("hostile")] = true;
  malformedCommands.push([symbolCommand]);
  for (const commands of malformedCommands) {
    assert.throws(() => createDeathSpawnFixture([parent(101)], commands));
  }
  assert.equal(calls, 0);
});

test("death spawns: hostile event ledger and snapshot bounds reject", () => {
  const encounter = new DeathSpawnEncounter();
  encounter.stepMany(5);
  const raw = JSON.parse(encounter.serialize());
  const hostile = [
    { ...raw, extra: true },
    { ...raw, version: 2 },
    { ...raw, identity: { ...raw.identity, fixture: "foreign" } },
    { ...raw, state: { ...raw.state, extra: true } },
    { ...raw, state: { ...raw.state, history: Array(4097).fill({}) } },
    { ...raw, state: { ...raw.state, latches: Array(65).fill(1) } },
    { ...raw, state: { ...raw.state, entities: Array(65).fill(raw.state.entities[0]) } },
  ];
  for (const value of hostile) {
    assert.throws(() => DeathSpawnEncounter.restore(canonicalJson(value)));
  }
  assert.throws(
    () => DeathSpawnEncounter.restore(encounter.serialize().padEnd(524_289, " ")),
    /byte bound/u,
  );
});

test("death spawns: setup graph and event/recursion/entity bounds are explicit", () => {
  function chain(depth) {
    let result = child(`node-${depth}`);
    for (let index = depth - 1; index >= 0; index -= 1) {
      result = child(`node-${index}`, { children: [result] });
    }
    return result;
  }
  assert.throws(
    () => createDeathSpawnFixture(
      [parent(101, { children: [chain(64)] })],
      [],
    ),
    /graph exceeds 64/u,
  );
  const tooMany = Array.from({ length: 65 }, (_, index) =>
    parent(100 + index));
  assert.throws(
    () => createDeathSpawnFixture(tooMany, []),
    /bounded plain array/u,
  );
});

test("death spawns: stepMany validates atomically and bounded run is deterministic", () => {
  const encounter = new DeathSpawnEncounter();
  const before = encounter.serialize();
  for (const invalid of [-1, 1.5, 513, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => encounter.stepMany(invalid));
    assert.equal(encounter.serialize(), before);
  }
  encounter.stepMany(510);
  const near = encounter.serialize();
  assert.throws(() => encounter.stepMany(3), /encounter bound/u);
  assert.equal(encounter.serialize(), near);
  const left = new DeathSpawnEncounter();
  const right = new DeathSpawnEncounter();
  left.run();
  for (let index = 0; index < 4; index += 1) right.stepMany(128);
  assert.equal(left.serialize(), right.serialize());
  assert.equal(left.state.tick, 512);
});

test("death spawns: nested placement is materializer-owned with exact anchors IDs and geometry", () => {
  const encounter = run(
    [parent(101, {
      anchor: { x: 1000, y: 2000 },
      children: [
        child("left", { radius: 100 }),
        child("right", { radius: 100, role: "secondary" }),
      ],
      ownerId: 8,
    })],
    [command(101, 100)],
    1,
  );
  const raw = JSON.parse(encounter.serialize());
  const nested = SpawnBatchMaterializer.restore(raw.placementSnapshotBytes);
  assert.deepEqual(nested.list(), encounter.children);
  assert.deepEqual(encounter.children.map(({ data, id }) => [
    id,
    data.archetypeId,
    data.position,
    data.offset,
    data.ownerId,
    data.sourceId,
  ]), [
    [1, "left", { x: 899, y: 2000 }, { x: -101, y: 0 }, 8, 101],
    [2, "right", { x: 1101, y: 2000 }, { x: 101, y: 0 }, 8, 101],
  ]);
});

test("death spawns: caller setup and returned events state children are isolated", () => {
  const entities = [parent(101)];
  const commands = [command(101, 100)];
  const fixture = createDeathSpawnFixture(entities, commands);
  const encounter = new DeathSpawnEncounter(fixture);
  entities[0].health = 1;
  commands[0].amount = 0;
  fixture.entities[0].children[0].archetypeId = "mutated";
  const events = encounter.step();
  const state = encounter.state;
  events[0].applied = 0;
  state.history[0].applied = 0;
  const children = encounter.children;
  children[0].data.archetypeId = "mutated";
  assert.equal(byType(encounter, "damage")[0].applied, 100);
  assert.equal(encounter.children[0].data.archetypeId, "child-101");
});
