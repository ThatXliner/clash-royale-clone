import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEATH_CONVERSION_IDENTITY,
  DeathConversionEncounter,
  createDeathConversionFixture,
  createDeathConversionQuestionRecords,
} from "../src/content/cards/death-conversion.js";
import {
  DeathSpawnEncounter,
  createDeathSpawnFixture,
} from "../src/content/cards/death-spawns.js";
import { SpawnBatchMaterializer } from
  "../src/content/cards/spawn-placement.js";
import { protectedIdentityHits } from "./helpers/protected-identity-scan.js";

function child(archetypeId, overrides = {}) {
  return {
    archetypeId,
    eligible: true,
    health: 20,
    ordinaryChildren: [],
    periodic: null,
    radius: 50,
    replacementChildren: [],
    role: "primary",
    ...overrides,
  };
}

function entity(id, overrides = {}) {
  return {
    anchor: { x: id * 10, y: -id * 5 },
    archetypeId: `unit-${id}`,
    eligible: true,
    health: 100,
    id,
    ordinaryChildren: [],
    ownerId: 8,
    periodic: null,
    replacementChildren: [],
    ...overrides,
  };
}

function curse(sourceId, targetId, tick = 0, durationTicks = 3) {
  return {
    amount: 0,
    cause: null,
    durationTicks,
    kind: "curse",
    sourceId,
    targetId,
    tick,
  };
}

function damage(targetId, amount = 100, tick = 0, overrides = {}) {
  return {
    amount,
    cause: "combat-damage",
    durationTicks: 0,
    kind: "damage",
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
    for (const childValue of Object.values(value)) frozen(childValue);
  }
}

function run(entities, commands, ticks = 12) {
  const encounter = new DeathConversionEncounter(
    createDeathConversionFixture(entities, commands),
  );
  encounter.stepMany(ticks);
  return encounter;
}

function byType(encounter, type) {
  return encounter.replay.filter((event) => event.type === type);
}

function sharedChild(spec) {
  return {
    archetypeId: spec.archetypeId,
    children: spec.ordinaryChildren.map(sharedChild),
    health: spec.health,
    periodic: spec.periodic === null ? null : {
      ...structuredClone(spec.periodic),
      children: spec.periodic.children.map(sharedChild),
    },
    radius: spec.radius,
    role: spec.role,
  };
}

function directSharedFixture(entities, commands) {
  return createDeathSpawnFixture(entities.map((spec) => ({
    anchor: structuredClone(spec.anchor),
    archetypeId: spec.archetypeId,
    children: spec.ordinaryChildren.map(sharedChild),
    health: spec.health,
    id: spec.id,
    ownerId: spec.ownerId,
    periodic: spec.periodic === null ? null : {
      ...structuredClone(spec.periodic),
      children: spec.periodic.children.map(sharedChild),
    },
    sourceId: spec.id,
  })), commands.filter(({ kind }) => kind === "damage").map((command) => ({
    amount: command.amount,
    cause: command.cause,
    sourceId: command.sourceId,
    targetId: command.targetId,
    tick: command.tick,
  })));
}

function assertSharedParity(entities, commands, ticks) {
  const conversion = new DeathConversionEncounter(
    createDeathConversionFixture(entities, commands),
  );
  const direct = new DeathSpawnEncounter(
    directSharedFixture(entities, commands),
  );
  conversion.stepMany(ticks);
  direct.stepMany(ticks);
  assert.equal(conversion.deathSpawnSnapshotBytes, direct.serialize());
  assert.deepEqual(conversion.sharedReplay, direct.replay);
  assert.deepEqual(conversion.sharedState, direct.state);
  assert.deepEqual(conversion.sharedChildren, direct.children);
  return { conversion, direct };
}

// Independent literal oracle: it intentionally knows only the fixture literals
// below. It does not import a reducer, question record, or runtime helper.
function literalLedger(entities, commands, endTick) {
  const rows = structuredClone(entities).map((row) => ({
    ...row,
    alive: true,
  })).sort((a, b) => a.id - b.id);
  const ordered = commands.map((command, sequence) => ({ ...command, sequence }))
    .sort((a, b) => a.tick - b.tick || a.sequence - b.sequence);
  const marks = new Map();
  const latches = [];
  const batches = [];
  let nextId = 1;
  for (let tick = 0; tick < endTick; tick += 1) {
    const lethal = new Map();
    const health = new Map(rows.map((row) => [row.id, row.alive ? row.health : 0]));
    for (const command of ordered.filter((entry) => entry.tick === tick)) {
      const source = rows.find(({ id }) => id === command.sourceId);
      const target = rows.find(({ id }) => id === command.targetId);
      if (command.kind === "curse") {
        if (!source?.alive || !target?.alive || !target.eligible) continue;
        const proposed = {
          appliedTick: tick,
          expiryTick: tick + command.durationTicks,
          ownerId: source.ownerId,
          sourceId: source.id,
          targetId: target.id,
        };
        const current = marks.get(target.id);
        if (
          current === undefined ||
          proposed.appliedTick > current.appliedTick ||
          (
            proposed.appliedTick === current.appliedTick &&
            proposed.sourceId > current.sourceId
          )
        ) marks.set(target.id, proposed);
        continue;
      }
      const before = health.get(command.targetId) ?? 0;
      const after = before - Math.min(before, command.amount);
      health.set(command.targetId, after);
      if (target?.alive) target.health = after;
      if (target?.alive && before > 0 && after === 0 &&
          !lethal.has(target.id)) {
        lethal.set(target.id, {
          cause: command.cause,
          sourceId: command.sourceId,
          target,
        });
      }
    }
    for (const death of [...lethal.values()].sort(
      (a, b) => a.target.id - b.target.id,
    )) {
      const { cause, target } = death;
      target.alive = false;
      if (cause === "combat-damage" && target.ordinaryChildren.length > 0) {
        const ids = target.ordinaryChildren.map(() => nextId++);
        batches.push([tick, "ordinary-death", target.id, target.ownerId, ids]);
      }
      const mark = marks.get(target.id);
      const converter = mark === undefined
        ? undefined
        : rows.find(({ id }) => id === mark.sourceId);
      if (
        cause === "combat-damage" &&
        target.eligible &&
        mark !== undefined &&
        converter?.replacementChildren.length > 0 &&
        !latches.includes(target.id)
      ) {
        latches.push(target.id);
        const ids = converter.replacementChildren.map(() => nextId++);
        batches.push([tick, "conversion", target.id, mark.ownerId, ids]);
        converter.replacementChildren.forEach((spec, index) => rows.push({
          alive: true,
          anchor: target.anchor,
          archetypeId: spec.archetypeId,
          eligible: spec.eligible,
          health: spec.health,
          id: ids[index],
          ordinaryChildren: structuredClone(spec.ordinaryChildren),
          ownerId: mark.ownerId,
          replacementChildren: structuredClone(spec.replacementChildren),
        }));
      }
      marks.delete(target.id);
    }
    for (const [targetId, mark] of [...marks]) {
      if (mark.expiryTick === tick) marks.delete(targetId);
    }
  }
  return { batches, latches };
}

test("death conversion: original identity ships while protected mapping stays test-only", () => {
  assert.deepEqual(DEATH_CONVERSION_IDENTITY, {
    displayName: "Gloam Shepherd",
    id: "gloam-shepherd",
    replacementDisplayName: "Umber Whelp",
    replacementId: "umber-whelp",
  });
  frozen(DEATH_CONVERSION_IDENTITY);
  const benchmark = JSON.parse(readFileSync(
    new URL("../reference/stats/cards.json", import.meta.url),
    "utf8",
  ));
  const mapped = benchmark.cards.find(({ key }) => key === "mother-witch");
  assert.equal(mapped.name, "Mother Witch");
  assert.equal(mapped.notes.length, 0, "conversion mechanic is absent from corpus");
  const runtime = readFileSync(
    new URL("../src/content/cards/death-conversion.js", import.meta.url),
    "utf8",
  );
  const delegated = readFileSync(
    new URL("../src/content/cards/death-conversion-delegated.js", import.meta.url),
    "utf8",
  );
  const tokens = new Set(benchmark.cards.flatMap(({ key, name }) =>
    [key.toLowerCase(), name.toLowerCase()]));
  assert.deepEqual(protectedIdentityHits(runtime, tokens), []);
  assert.doesNotMatch(runtime, /cards\.json|readFile|reference\//u);
  assert.doesNotMatch(
    delegated,
    /SpawnBatchMaterializer/u,
    "the façade must not own a shadow placement materializer",
  );
});

test("death conversion: each absent value and policy is a fresh frozen QUESTION", () => {
  const expected = [
    "shippedIdentity", "benchmarkMapping", "durationTicks", "application",
    "refresh", "eligibility", "lethalCause", "expiry", "competingSource",
    "sourceCasterDeath", "targetDeath", "ownership", "attribution",
    "childIdentity", "childCount", "childHealth", "childRadius", "childRole",
    "sameBoundaryOrdering", "simultaneousDeaths",
    "ordinaryDeathSpawnInteraction", "exactlyOnceLatch", "recursion",
    "recursionCap", "entityCap", "eventCap", "graphCap", "commandCap",
    "tickCap", "snapshotByteCap", "zeroDamage", "overkill", "alreadyDead",
    "idPolicy", "anchorPolicy", "placementPolicy", "commandBoundary",
    "snapshotPolicy",
  ];
  const first = createDeathConversionQuestionRecords();
  const second = createDeathConversionQuestionRecords();
  assert.deepEqual(Object.keys(first), expected);
  assert.equal(Object.keys(first).length, 38);
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
      source: "unsourced-death-conversion-policy-fixture",
    });
  }
  assert.throws(() => createDeathConversionQuestionRecords(1), /do not accept/u);
});

test("death conversion: default exact timeline delegates replacement ownership and attribution", () => {
  const encounter = new DeathConversionEncounter();
  encounter.stepMany(5);
  assert.deepEqual(encounter.replay.map(({ tick, type }) => [tick, type]), [
    [1, "curse-applied"],
    [3, "damage"],
    [3, "death"],
    [3, "source-despawn"],
    [3, "conversion-triggered"],
    [3, "spawn-batch"],
  ]);
  assert.deepEqual(byType(encounter, "spawn-batch"), [{
    anchor: { x: 600, y: 1200 },
    batchIndex: 0,
    childIds: [1],
    kind: "death",
    ownerId: 8,
    ownershipOverlays: [{
      childId: 1,
      converterId: 101,
      fromOwnerId: 8,
      sourceId: 102,
      toOwnerId: 7,
    }],
    sourceId: 102,
    tick: 3,
    type: "spawn-batch",
  }]);
  assert.deepEqual(encounter.children, [{
    data: {
      archetypeId: "umber-whelp",
      offset: { x: 0, y: 0 },
      ownerId: 7,
      position: { x: 600, y: 1200 },
      radius: 70,
      role: "primary",
      sourceId: 102,
    },
    id: 1,
  }]);
  const nested = SpawnBatchMaterializer.restore(
    JSON.parse(encounter.serialize()).placementSnapshotBytes,
  );
  assert.equal(nested.list()[0].data.ownerId, 8);
  assert.deepEqual(
    nested.list().map(({ data, id }) => [
      id, data.position, data.archetypeId, data.radius, data.role,
    ]),
    encounter.children.map(({ data, id }) => [
      id, data.position, data.archetypeId, data.radius, data.role,
    ]),
  );
});

test("death conversion: command-first apply refresh and expiry use exact boundaries", () => {
  const caster = entity(101, {
    ownerId: 7,
    replacementChildren: [child("marked-child")],
  });
  const target = entity(102);
  const commands = [
    curse(101, 102, 0, 2),
    curse(101, 102, 1, 3),
    damage(102, 0, 2),
    damage(102, 100, 4),
  ];
  const encounter = run([caster, target], commands, 5);
  assert.deepEqual(byType(encounter, "curse-applied").map(
    ({ accepted, expiryTick, tick }) => [tick, accepted, expiryTick],
  ), [[0, true, 2], [1, true, 4]]);
  assert.equal(byType(encounter, "curse-expired").length, 0);
  assert.equal(byType(encounter, "conversion-triggered").length, 1);

  const expired = run([caster, target], [
    curse(101, 102, 0, 2),
    damage(102, 0, 2),
    damage(102, 100, 3),
  ], 4);
  assert.deepEqual(byType(expired, "curse-expired"), [{
    sourceId: 101,
    targetId: 102,
    tick: 2,
    type: "curse-expired",
  }]);
  assert.equal(byType(expired, "conversion-triggered").length, 0);
});

test("death conversion: eligibility lethal cause zero overkill and already-dead are explicit", () => {
  const caster = entity(101, {
    replacementChildren: [child("converted")],
  });
  const cases = [
    [entity(102, { eligible: false }), damage(102), 0],
    [entity(102), damage(102, 100, 0, { cause: "despawn" }), 0],
    [entity(102), damage(102, 100, 0, { cause: "expiry" }), 0],
    [entity(102), damage(102, 0), 0],
    [entity(102), damage(102), 1],
  ];
  for (const [target, lethal, expected] of cases) {
    const encounter = run([caster, target], [
      curse(101, 102),
      lethal,
    ], 2);
    assert.equal(byType(encounter, "conversion-triggered").length, expected);
    assert.ok(byType(encounter, "death").length <= 1);
  }
  const overkill = run([caster, entity(102)], [
    curse(101, 102),
    damage(102, 150),
    damage(102, 1),
    damage(102, 1, 1),
    curse(101, 102, 2),
  ], 4);
  assert.deepEqual(byType(overkill, "damage").map(
    ({ applied, healthBefore }) => [healthBefore, applied],
  ), [[100, 100], [0, 0], [0, 0]]);
  assert.equal(byType(overkill, "conversion-triggered").length, 1);
  assert.equal(byType(overkill, "curse-applied").at(-1).accepted, false);
});

test("death conversion: competing sources have stable winner and survive caster death", () => {
  const lower = entity(101, {
    ownerId: 7,
    replacementChildren: [child("lower-child")],
  });
  const higher = entity(103, {
    ownerId: 9,
    replacementChildren: [child("higher-child")],
  });
  const target = entity(120);
  const encounter = run([lower, higher, target], [
    curse(103, 120),
    curse(101, 120),
    damage(103, 100, 1),
    damage(120, 100, 1),
  ], 3);
  assert.deepEqual(byType(encounter, "death").map(({ targetId }) => targetId),
    [103, 120]);
  assert.deepEqual(byType(encounter, "conversion-triggered"), [{
    converterId: 103,
    ownerId: 9,
    sourceId: 120,
    tick: 1,
    type: "conversion-triggered",
  }]);
  assert.equal(encounter.children[0].data.archetypeId, "higher-child");
  assert.equal(encounter.children[0].data.ownerId, 9);
  assert.equal(encounter.children[0].data.sourceId, 120);
});

test("death conversion: simultaneous target deaths are stable by target ID", () => {
  const caster = entity(101, {
    ownerId: 7,
    replacementChildren: [child("converted")],
  });
  const encounter = run([caster, entity(120), entity(110)], [
    curse(101, 120),
    curse(101, 110),
    damage(120),
    damage(110),
  ], 2);
  assert.deepEqual(byType(encounter, "death").map(({ targetId }) => targetId),
    [110, 120]);
  assert.deepEqual(byType(encounter, "spawn-batch").map(
    ({ childIds, sourceId }) => [sourceId, childIds],
  ), [[110, [1]], [120, [2]]]);
});

test("death conversion: ordinary death spawn precedes conversion through one materializer", () => {
  const caster = entity(101, {
    ownerId: 7,
    replacementChildren: [child("replacement", {
      radius: 100,
      role: "secondary",
    })],
  });
  const target = entity(102, {
    anchor: { x: 1000, y: 2000 },
    ordinaryChildren: [child("ordinary", { radius: 100 })],
  });
  const encounter = run([caster, target], [
    curse(101, 102),
    damage(102),
  ], 1);
  assert.deepEqual(byType(encounter, "spawn-batch").map(
    ({ childIds, kind, ownerId, ownershipOverlays, sourceId }) =>
      [kind, sourceId, ownerId, childIds, ownershipOverlays],
  ), [
    ["death", 102, 8, [1, 2], [{
      childId: 2,
      converterId: 101,
      fromOwnerId: 8,
      sourceId: 102,
      toOwnerId: 7,
    }]],
  ]);
  assert.deepEqual(encounter.children.map(({ data, id }) => [
    id,
    data.archetypeId,
    data.position,
    data.ownerId,
    data.sourceId,
  ]), [
    [1, "ordinary", { x: 899, y: 2000 }, 8, 102],
    [2, "replacement", { x: 1101, y: 2000 }, 7, 102],
  ]);
  assert.deepEqual(
    encounter.children.map(({ data, id }) => [
      id, data.position, data.archetypeId, data.radius, data.role,
    ]),
    encounter.sharedChildren.map(({ data, id }) => [
      id, data.position, data.archetypeId, data.radius, data.role,
    ]),
  );
  assert.equal(
    JSON.parse(encounter.serialize()).placementSnapshotBytes,
    JSON.parse(encounter.deathSpawnSnapshotBytes).placementSnapshotBytes,
  );
  assert.equal(encounter.state.batchCount, encounter.sharedState.batchCount);
});

test("death conversion: converted replacement death can convert once without duplicates", () => {
  const firstCaster = entity(101, {
    ownerId: 7,
    replacementChildren: [child("first-replacement")],
  });
  const secondCaster = entity(130, {
    ownerId: 9,
    replacementChildren: [child("second-replacement")],
  });
  const encounter = run(
    [firstCaster, entity(110), entity(120), secondCaster],
    [
      curse(101, 110, 0),
      damage(110, 100, 0),
      curse(130, 1, 2),
      damage(1, 20, 2),
      damage(1, 999, 3),
    ],
    5,
  );
  assert.deepEqual(byType(encounter, "conversion-triggered").map(
    ({ converterId, sourceId }) => [sourceId, converterId],
  ), [[110, 101], [1, 130]]);
  assert.deepEqual(byType(encounter, "spawn-batch").map(
    ({ childIds, sourceId }) => [sourceId, childIds],
  ), [[110, [1]], [1, [2]]]);
  assert.deepEqual(encounter.state.latches, [110, 1]);
});

test("death conversion: literal ledger matches competition order IDs ownership and latches", () => {
  const entities = [
    entity(101, {
      ownerId: 7,
      replacementChildren: [child("replacement")],
    }),
    entity(103, {
      ownerId: 9,
      replacementChildren: [child("winner-a"), child("winner-b")],
    }),
    entity(110, { ordinaryChildren: [child("ordinary")] }),
    entity(120),
  ];
  const commands = [
    curse(103, 120, 1),
    curse(101, 120, 1),
    curse(101, 110, 1),
    damage(120, 100, 2),
    damage(110, 100, 2),
  ];
  const expected = literalLedger(entities, commands, 5);
  const encounter = run(entities, commands, 5);
  assert.deepEqual(byType(encounter, "spawn-batch").map(
    ({ childIds, kind, ownerId, sourceId, tick }) =>
      [tick, kind, sourceId, ownerId, childIds],
  ), [
    [2, "death", 110, 8, [1, 2]],
    [2, "death", 120, 8, [3, 4]],
  ]);
  assert.deepEqual(byType(encounter, "spawn-batch").flatMap(
    ({ ownershipOverlays }) => ownershipOverlays.map(
      ({ childId, converterId, fromOwnerId, sourceId, toOwnerId }) =>
        [childId, converterId, fromOwnerId, sourceId, toOwnerId],
    ),
  ), [
    [2, 101, 8, 110, 7],
    [3, 103, 8, 120, 9],
    [4, 103, 8, 120, 9],
  ]);
  assert.deepEqual(
    encounter.children.map(({ data }) => data.ownerId),
    [8, 7, 9, 9],
  );
  assert.deepEqual(encounter.state.latches, expected.latches);
});

test("death conversion: arbitrary chunks and every causal restore cut are byte-identical", () => {
  const fixture = createDeathConversionFixture(
    [
      entity(101, {
        ownerId: 7,
        replacementChildren: [child("replacement")],
      }),
      entity(110),
      entity(120),
    ],
    [
      curse(101, 110, 2, 8),
      damage(110, 100, 5),
      curse(101, 120, 7, 8),
      damage(120, 100, 10),
    ],
  );
  const straight = new DeathConversionEncounter(fixture);
  straight.run();
  const chunked = new DeathConversionEncounter(fixture);
  for (const count of [1, 2, 5, 3, 8, 11, 226]) chunked.stepMany(count);
  assert.equal(chunked.serialize(), straight.serialize());
  for (let cut = 0; cut <= 256; cut += 1) {
    const partial = new DeathConversionEncounter(fixture);
    partial.stepMany(cut);
    const restored = DeathConversionEncounter.restore(partial.serialize());
    restored.stepMany(256 - cut);
    assert.equal(restored.serialize(), straight.serialize(), `cut ${cut}`);
  }
});

test("death conversion: canonical restore rejects causal status and placement forgeries", () => {
  const encounter = new DeathConversionEncounter();
  encounter.stepMany(4);
  const bytes = encounter.serialize();
  const original = JSON.parse(bytes);
  assert.equal(DeathConversionEncounter.restore(bytes).serialize(), bytes);
  const mutations = [
    (value) => { value.state.latches = []; },
    (value) => { value.state.latches.push(999); },
    (value) => { value.state.curses.push({
      appliedTick: 0, expiryTick: 3, ownerId: 9, sourceId: 101, targetId: 101,
    }); },
    (value) => { value.state.history[0].accepted = false; },
    (value) => { value.state.history.pop(); },
    (value) => { value.state.entities[0].ownerId += 1; },
    (value) => { value.identity.setup.entities[0].replacementChildren[0].health += 1; },
    (value) => {
      const nested = JSON.parse(value.placementSnapshotBytes);
      nested.batches[0].ownerId += 1;
      value.placementSnapshotBytes = canonicalJson(nested);
    },
  ];
  for (const mutate of mutations) {
    const forged = structuredClone(original);
    mutate(forged);
    assert.throws(() =>
      DeathConversionEncounter.restore(canonicalJson(forged))
    );
  }
  for (const malformed of [
    `${bytes} `,
    ` ${bytes}`,
    bytes.replace('"version":1', '"version":1,"version":1'),
    "{",
  ]) {
    assert.throws(() => DeathConversionEncounter.restore(malformed));
  }
  assert.throws(() => DeathConversionEncounter.restore({}));
});

test("death conversion: hostile setup commands graphs events and snapshots reject without getters", () => {
  let getterCalls = 0;
  const accessor = entity(101);
  Object.defineProperty(accessor, "health", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 100;
    },
  });
  const sparse = [];
  sparse.length = 1;
  const alias = child("alias");
  const symbolEntity = entity(101);
  symbolEntity[Symbol("hostile")] = true;
  const malformedEntities = [
    [accessor],
    sparse,
    [{ ...entity(101), extra: true }],
    [Object.assign(Object.create({}), entity(101))],
    [symbolEntity],
    [entity(101, { ordinaryChildren: sparse })],
    [entity(101, { replacementChildren: [alias, alias] })],
    [entity(101, { replacementChildren: Array(16).fill(child("wide")) })],
    [entity(101, { archetypeId: "x".repeat(129) })],
    [entity(101, { health: Number.MAX_SAFE_INTEGER + 1 })],
    [entity(101), entity(101)],
    [entity(1)],
  ];
  for (const entities of malformedEntities) {
    assert.throws(() => createDeathConversionFixture(entities, []));
  }
  const symbolCommand = curse(101, 102);
  symbolCommand[Symbol("hostile")] = true;
  const malformedCommands = [
    sparse,
    [{ ...curse(101, 102), extra: true }],
    [Object.assign(Object.create({}), curse(101, 102))],
    [symbolCommand],
    [curse(101, 102, 255, 2)],
    [curse(101, 102, 0, 0)],
    [damage(102, -1)],
    [damage(102, 1, 256)],
    [damage(102, 1, 0, { cause: "alien" })],
    [curse(101, 102), curse(101, 102)],
    Array.from({ length: 129 }, (_, index) =>
      curse(101, 102 + index, index % 128)),
  ];
  for (const commands of malformedCommands) {
    assert.throws(() =>
      createDeathConversionFixture([entity(101), entity(102)], commands)
    );
  }
  assert.equal(getterCalls, 0);

  const encounter = new DeathConversionEncounter();
  encounter.stepMany(4);
  const raw = JSON.parse(encounter.serialize());
  for (const hostile of [
    { ...raw, extra: true },
    { ...raw, version: 2 },
    { ...raw, identity: { ...raw.identity, fixture: "foreign" } },
    { ...raw, state: { ...raw.state, extra: true } },
    { ...raw, state: { ...raw.state, history: Array(4097).fill({}) } },
    { ...raw, state: { ...raw.state, entities: Array(65).fill(raw.state.entities[0]) } },
    { ...raw, state: { ...raw.state, curses: Array(65).fill({}) } },
    { ...raw, state: { ...raw.state, latches: Array(17).fill(1) } },
  ]) {
    assert.throws(() =>
      DeathConversionEncounter.restore(canonicalJson(hostile))
    );
  }
  assert.throws(
    () => DeathConversionEncounter.restore(
      encounter.serialize().padEnd(524_289, " "),
    ),
    /byte bound/u,
  );
});

test("death conversion: graph entity command recursion and step bounds are explicit and atomic", () => {
  function chain(depth) {
    let result = child(`node-${depth}`);
    for (let index = depth - 1; index >= 0; index -= 1) {
      result = child(`node-${index}`, { replacementChildren: [result] });
    }
    return result;
  }
  assert.throws(
    () => createDeathConversionFixture([
      entity(101, { replacementChildren: [chain(64)] }),
    ], []),
    /graph exceeds 64/u,
  );
  assert.throws(
    () => createDeathConversionFixture(
      Array.from({ length: 65 }, (_, index) => entity(100 + index)),
      [],
    ),
    /bounded plain array/u,
  );

  const converter = entity(101, {
    replacementChildren: [child("replacement")],
  });
  const targets = Array.from({ length: 17 }, (_, index) => entity(200 + index));
  const commands = targets.flatMap((target, index) => [
    curse(101, target.id, index, 1),
    damage(target.id, 100, index),
  ]);
  const bounded = new DeathConversionEncounter(
    createDeathConversionFixture([converter, ...targets], commands),
  );
  bounded.stepMany(16);
  const beforeCap = bounded.serialize();
  assert.throws(() => bounded.step(), /recursion bound 16/u);
  assert.equal(bounded.serialize(), beforeCap);

  const encounter = new DeathConversionEncounter();
  const before = encounter.serialize();
  for (const invalid of [-1, 1.5, 257, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => encounter.stepMany(invalid));
    assert.equal(encounter.serialize(), before);
  }
  encounter.stepMany(255);
  const near = encounter.serialize();
  assert.throws(() => encounter.stepMany(2), /encounter bound/u);
  assert.equal(encounter.serialize(), near);
  const left = new DeathConversionEncounter();
  const right = new DeathConversionEncounter();
  left.run();
  right.stepMany(128);
  right.stepMany(128);
  assert.equal(left.serialize(), right.serialize());
});

test("death conversion: caller inputs and returned state events and children are isolated", () => {
  const entities = [
    entity(101, { replacementChildren: [child("replacement")] }),
    entity(102),
  ];
  const commands = [curse(101, 102), damage(102)];
  const fixture = createDeathConversionFixture(entities, commands);
  const encounter = new DeathConversionEncounter(fixture);
  entities[0].replacementChildren[0].archetypeId = "mutated";
  commands[1].amount = 0;
  fixture.entities[1].health = 1;
  const events = encounter.step();
  const state = encounter.state;
  events[0].accepted = false;
  state.curses.length = 0;
  const children = encounter.children;
  children[0].data.archetypeId = "mutated";
  assert.equal(byType(encounter, "conversion-triggered").length, 1);
  assert.equal(encounter.children[0].data.archetypeId, "replacement");
});

test("death conversion delegation: shared executor owns lethal zero overkill and already-dead lifecycle", () => {
  const entities = [entity(101), entity(102)];
  const commands = [
    damage(102, 0, 0),
    damage(102, 150, 1),
    damage(102, 1, 1),
    damage(102, 1, 2),
  ];
  const { conversion } = assertSharedParity(entities, commands, 4);
  assert.deepEqual(conversion.sharedReplay.map(({ type }) => type), [
    "damage",
    "damage",
    "damage",
    "death",
    "source-despawn",
    "death-triggered",
    "damage",
  ]);
  assert.deepEqual(byType(conversion, "damage").map(
    ({ applied, healthBefore }) => [healthBefore, applied],
  ), [[100, 0], [100, 100], [0, 0], [0, 0]]);
  assert.equal(byType(conversion, "death").length, 1);
  assert.equal(byType(conversion, "source-despawn").length, 1);
});

test("death conversion delegation: simultaneous deaths and ordinary recursion preserve exact shared subsequence", () => {
  const nested = child("nested", {
    ordinaryChildren: [child("grandchild", { radius: 75 })],
    radius: 80,
  });
  const entities = [
    entity(101, { ordinaryChildren: [nested] }),
    entity(110),
  ];
  const commands = [
    damage(110, 100, 0),
    damage(101, 100, 0),
    damage(1, 20, 2),
  ];
  const { conversion } = assertSharedParity(entities, commands, 4);
  const lifecycle = new Set(["damage", "death", "source-despawn"]);
  assert.deepEqual(
    conversion.replay.filter(({ type }) => lifecycle.has(type)),
    conversion.sharedReplay.filter(({ type }) => lifecycle.has(type)),
  );
  assert.deepEqual(byType(conversion, "death").map(({ targetId }) => targetId),
    [101, 110, 1]);
  assert.deepEqual(byType(conversion, "spawn-batch").map(
    ({ childIds, sourceId }) => [sourceId, childIds],
  ), [[101, [1]], [1, [2]]]);
  assert.equal(conversion.replay.filter(
    ({ type }) => type === "death-triggered",
  ).length, 0, "the facade must not duplicate the shared lifecycle event");
});

test("death conversion delegation: ordinary nested placement bytes are shared-byte identical", () => {
  const target = entity(101, {
    anchor: { x: 1000, y: 2000 },
    ordinaryChildren: [
      child("left", { radius: 100 }),
      child("right", { radius: 100, role: "secondary" }),
    ],
  });
  const { conversion, direct } = assertSharedParity(
    [target],
    [damage(101)],
    2,
  );
  const outer = JSON.parse(conversion.serialize()).placementSnapshotBytes;
  const shared = JSON.parse(direct.serialize()).placementSnapshotBytes;
  assert.equal(outer, shared);
  assert.deepEqual(conversion.children, direct.children);
});

test("death conversion delegation: periodic/death boundary remains governed by shared primitive", () => {
  const caster = entity(101, {
    ownerId: 7,
    replacementChildren: [child("converted-child")],
  });
  const target = entity(100, {
    anchor: { x: 400, y: 800 },
    ordinaryChildren: [child("death-child")],
    periodic: {
      cadenceTicks: 1,
      children: [child("periodic-child", { health: 10, radius: 40 })],
      initialDelayTicks: 1,
      lifetimeTicks: 8,
    },
  });
  const fixture = createDeathConversionFixture([caster, target], [
    curse(101, 100, 0, 4),
    damage(100, 100, 2),
  ]);
  const encounter = new DeathConversionEncounter(fixture);
  encounter.stepMany(5);
  assert.deepEqual(encounter.replay.filter(({ tick }) => tick === 2)
    .map(({ type }) => type), [
    "damage",
    "death",
    "source-despawn",
    "conversion-triggered",
    "spawn-batch",
  ]);
  assert.deepEqual(byType(encounter, "spawn-batch").map(
    ({ childIds, kind, ownershipOverlays, tick }) =>
      [tick, kind, childIds, ownershipOverlays.map(({ childId }) => childId)],
  ), [
    [1, "periodic", [1], []],
    [2, "death", [2, 3], [3]],
  ]);
  assert.equal(encounter.replay.some(
    ({ kind, tick, type }) =>
      tick === 2 && type === "spawn-batch" && kind === "periodic",
  ), false);
  assert.deepEqual(encounter.children.map(({ data, id }) => [
    id, data.archetypeId, data.ownerId, data.position,
  ]), [
    [1, "periodic-child", 8, { x: 400, y: 800 }],
    [2, "death-child", 8, { x: 349, y: 800 }],
    [3, "converted-child", 7, { x: 451, y: 800 }],
  ]);
  assert.deepEqual(encounter.state.entities.find(({ id }) => id === 100)
    .periodic, target.periodic);
  const publicBytes = encounter.serialize();
  const sharedBytes = encounter.deathSpawnSnapshotBytes;
  assert.equal(
    JSON.parse(publicBytes).placementSnapshotBytes,
    JSON.parse(sharedBytes).placementSnapshotBytes,
  );
  assert.equal(
    DeathConversionEncounter.restore(publicBytes).serialize(),
    publicBytes,
  );
  assert.equal(
    DeathSpawnEncounter.restore(sharedBytes).serialize(),
    sharedBytes,
  );
});

test("death conversion delegation: mixed periodic conversion is setup-order invariant", () => {
  const caster = entity(101, {
    ownerId: 7,
    replacementChildren: [child("converted-child")],
  });
  const unrelated = entity(105);
  const target = entity(110, {
    ordinaryChildren: [child("death-child")],
    periodic: {
      cadenceTicks: 1,
      children: [child("periodic-child")],
      initialDelayTicks: 1,
      lifetimeTicks: 8,
    },
  });
  const commands = [
    curse(101, 110, 0, 4),
    damage(110, 100, 2),
  ];
  const permutations = [
    [caster, unrelated, target],
    [caster, target, unrelated],
    [unrelated, caster, target],
    [unrelated, target, caster],
    [target, caster, unrelated],
    [target, unrelated, caster],
  ];
  let canonical = null;
  for (const entities of permutations) {
    const fixture = createDeathConversionFixture(entities, commands);
    const encounter = new DeathConversionEncounter(fixture);
    encounter.stepMany(5);
    assert.deepEqual(encounter.sharedState.entities
      .filter(({ id }) => id > 64)
      .map(({ bornTick, id }) => [id, bornTick]), [
      [101, 0],
      [105, 0],
      [110, 0],
    ]);
    assert.deepEqual(byType(encounter, "spawn-batch").map(
      ({ childIds, kind, ownershipOverlays, sourceId, tick }) => [
        tick,
        kind,
        sourceId,
        childIds,
        ownershipOverlays.map(({ childId, toOwnerId }) =>
          [childId, toOwnerId]),
      ],
    ), [
      [1, "periodic", 110, [1], []],
      [2, "death", 110, [2, 3], [[3, 7]]],
    ]);
    assert.deepEqual(encounter.children.map(({ data, id }) => [
      id, data.archetypeId, data.ownerId, data.sourceId,
    ]), [
      [1, "periodic-child", 8, 110],
      [2, "death-child", 8, 110],
      [3, "converted-child", 7, 110],
    ]);
    assert.equal(byType(encounter, "spawn-batch").some(
      ({ kind, tick }) => kind === "periodic" && tick >= 2,
    ), false);
    const delegated = DeathSpawnEncounter.restore(
      encounter.deathSpawnSnapshotBytes,
    );
    assert.deepEqual(delegated.replay, encounter.sharedReplay);
    assert.deepEqual(delegated.state, encounter.sharedState);
    assert.deepEqual(delegated.children, encounter.sharedChildren);

    const chunked = new DeathConversionEncounter(fixture);
    for (const count of [1, 2, 2]) chunked.stepMany(count);
    assert.equal(chunked.serialize(), encounter.serialize());
    for (let cut = 0; cut <= 5; cut += 1) {
      const partial = new DeathConversionEncounter(fixture);
      partial.stepMany(cut);
      const restored = DeathConversionEncounter.restore(partial.serialize());
      restored.stepMany(5 - cut);
      assert.equal(restored.serialize(), encounter.serialize(), `cut ${cut}`);
    }
    canonical ??= encounter.serialize();
    assert.equal(encounter.serialize(), canonical);
  }

  const forged = JSON.parse(canonical);
  forged.state.entities.find(({ id }) => id === 110).bornTick = 1;
  assert.throws(
    () => DeathConversionEncounter.restore(canonicalJson(forged)),
    /forged/u,
  );
  assert.equal(
    DeathConversionEncounter.restore(canonical).serialize(),
    canonical,
  );
});
