import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ChampionAbilityController,
  ChargeSpecialEncounter,
  DashEncounter,
  InvisibilityRevealEncounter,
  InstantaneousCombatResetEncounter,
  LeapKnockbackRetargetEncounter,
  RecoilEncounter,
  ReflectionEncounter,
  ShieldFormEncounter,
  createChampionAbilityCatalog,
  createChampionAbilityFixture,
  createChampionAbilityQuestionRecords,
  createChampionMappedFieldQuestionRecords,
  createChargeSpecialFixture,
  createDashSpecialFixture,
  createInvisibilityFixture,
  createLeapKnockbackFixture,
  createRecoilSpecialFixture,
  createReflectionSpecialFixture,
  createResetFixture,
  probeChampionAbilityAdapters,
} from "../src/content/index.js";

// Comparison identities are intentionally test-only and never shipped.
const BENCHMARK_MAPPING = Object.freeze({
  "aegis-sage": "Monk",
  "bone-regent": "Skeleton King",
  "dusk-ranger": "Archer Queen",
  "gilded-lancer": "Golden Knight",
  "iron-borer": "Mighty Miner",
});

const ARCHETYPES = Object.freeze([
  "aegis-sage",
  "bone-regent",
  "dusk-ranger",
  "gilded-lancer",
  "iron-borer",
]);

function setup({
  champions = [{ archetypeId: "dusk-ranger", entityId: 101, ownerId: 1 }],
  commands = [
    { entityId: 101, tick: 0, type: "deploy" },
    { entityId: 101, tick: 1, type: "activate" },
  ],
  owners = [{ elixir: 10, id: 1 }],
} = {}) {
  return createChampionAbilityFixture(owners, champions, commands);
}

function controller(options) {
  return new ChampionAbilityController(setup(options));
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const PRIMITIVE_NAMES = Object.freeze({
  "aegis-sage": ["reflection"],
  "bone-regent": ["shield-form", "reset"],
  "dusk-ranger": ["invisibility"],
  "gilded-lancer": ["charge", "dash", "leap"],
  "iron-borer": ["recoil", "reset"],
});

function directPrimitive(name) {
  if (name === "reflection") {
    return new ReflectionEncounter(createReflectionSpecialFixture());
  }
  if (name === "shield-form") return new ShieldFormEncounter();
  if (name === "reset") {
    return new InstantaneousCombatResetEncounter(createResetFixture());
  }
  if (name === "invisibility") {
    return new InvisibilityRevealEncounter(createInvisibilityFixture());
  }
  if (name === "charge") {
    return new ChargeSpecialEncounter(createChargeSpecialFixture());
  }
  if (name === "dash") return new DashEncounter(createDashSpecialFixture());
  if (name === "leap") {
    return new LeapKnockbackRetargetEncounter(createLeapKnockbackFixture());
  }
  if (name === "recoil") {
    return new RecoilEncounter(createRecoilSpecialFixture());
  }
  throw new Error(`unsupported direct primitive ${name}`);
}

function runDirectPrimitive(name, count) {
  const encounter = directPrimitive(name);
  const events = name === "shield-form"
    ? [
      ...encounter.damage(892),
      ...Array.from({ length: count - 1 }, () => encounter.advanceTicks(1))
        .flat(),
    ]
    : encounter.stepMany(count);
  return {
    events,
    name,
    serialized: encounter.serialize(),
    state: encounter.state,
  };
}

function primitiveProjection(primitive) {
  return Object.fromEntries(["events", "name", "serialized", "state"]
    .map((key) => [key, primitive[key]]));
}

function lifecycleReplay(encounter) {
  return encounter.replay.filter(({ type }) => type !== "primitive-event");
}

test("champions: five original identities map only in the test harness", () => {
  const catalog = createChampionAbilityCatalog();
  assert.deepEqual(catalog.map(({ id }) => id), ARCHETYPES);
  assert.deepEqual(Object.keys(BENCHMARK_MAPPING).sort(), ARCHETYPES);
  assert.equal(JSON.stringify(catalog).includes("Archer Queen"), false);
  assert.deepEqual(catalog.map(({ cost }) => cost), [5, 4, 5, 4, 4]);
});

test("champions: every missing ability fact is an isolated frozen QUESTION", () => {
  const questions = createChampionAbilityQuestionRecords();
  assert.equal(questions.length, 65);
  assert.equal(new Set(questions.map((entry) =>
    `${entry.archetypeId}:${entry.field}`)).size, 65);
  assert.ok(questions.every((entry) =>
    entry.authoritative === false && entry.disposition === "question" &&
    Object.isFrozen(entry)));
  assert.ok(Object.isFrozen(questions));
  assert.throws(() => createChampionAbilityQuestionRecords(1), /overrides/);
});

test("champions: ordinary mapped fields retain corpus confidence separately", () => {
  const mapped = createChampionMappedFieldQuestionRecords();
  assert.equal(mapped.length, 51);
  assert.equal(new Set(mapped.map((entry) =>
    `${entry.archetypeId}:${entry.field}`)).size, 51);
  assert.ok(mapped.every((entry) =>
    entry.confidence === "unverified" &&
    entry.disposition === "question-backed-match" &&
    Object.isFrozen(entry)));
  assert.ok(Object.isFrozen(mapped));
  assert.throws(() => createChampionMappedFieldQuestionRecords(null),
    /overrides/);
});

test("champions: every archetype has an exact activation timeline", () => {
  const expected = {
    "aegis-sage": [1, 5, 11, "reflection"],
    "bone-regent": [2, 4, 11, "shield-form-reset"],
    "dusk-ranger": [1, 6, 14, "invisibility"],
    "gilded-lancer": [1, 3, 8, "charge-dash-leap"],
    "iron-borer": [1, 4, 10, "recoil-reset"],
  };
  for (const [archetypeId, values] of Object.entries(expected)) {
    const encounter = controller({
      champions: [{ archetypeId, entityId: 101, ownerId: 1 }],
    });
    encounter.stepMany(2);
    const activation = encounter.replay.find(({ type }) => type === "activated");
    assert.deepEqual([
      activation.cost,
      activation.activeUntilTick,
      activation.cooldownUntilTick,
      activation.adapter,
    ], values, archetypeId);
  }
});

test("champions: exact activation cost and insufficient-elixir rejection", () => {
  const encounter = controller({
    commands: [
      { entityId: 101, tick: 0, type: "deploy" },
      { entityId: 101, tick: 1, type: "activate" },
      { entityId: 101, tick: 2, type: "activate" },
    ],
    owners: [{ elixir: 1, id: 1 }],
  });
  encounter.stepMany(3);
  assert.deepEqual(encounter.replay.map((entry) =>
    [entry.tick, entry.type, entry.cost ?? entry.reason, entry.elixirAfter]), [
    [0, "deployed", undefined, undefined],
    [1, "activated", 1, 0],
    [2, "activation-rejected", "active", undefined],
  ]);

  const poor = controller({ owners: [{ elixir: 0, id: 1 }] });
  poor.stepMany(2);
  assert.deepEqual(poor.replay.at(-1), {
    entityId: 101,
    reason: "insufficient-elixir",
    sequence: 2,
    tick: 1,
    type: "activation-rejected",
  });
  assert.equal(poor.state.owners[0].elixir, 0);
});

test("champions: owner may have only one living deployed champion", () => {
  const encounter = controller({
    champions: [
      { archetypeId: "dusk-ranger", entityId: 101, ownerId: 1 },
      { archetypeId: "aegis-sage", entityId: 102, ownerId: 1 },
    ],
    commands: [
      { entityId: 101, tick: 0, type: "deploy" },
      { entityId: 102, tick: 0, type: "deploy" },
      { entityId: 101, tick: 1, type: "die" },
      { entityId: 102, tick: 2, type: "deploy" },
    ],
  });
  encounter.stepMany(3);
  assert.deepEqual(encounter.replay.map(({ entityId, reason, tick, type }) =>
    [tick, entityId, type, reason]), [
    [0, 101, "deployed", undefined],
    [0, 102, "deploy-rejected", "owner-has-champion"],
    [1, 101, "died", undefined],
    [2, 102, "deployed", undefined],
  ]);
});

test("champions: activation, cooldown, death, deploy, and redeploy trace", () => {
  const encounter = controller({
    commands: [
      { entityId: 101, tick: 0, type: "deploy" },
      { entityId: 101, tick: 1, type: "activate" },
      { entityId: 101, tick: 6, type: "activate" },
      { entityId: 101, tick: 8, type: "die" },
      { entityId: 101, tick: 9, type: "deploy" },
      { entityId: 101, tick: 10, type: "activate" },
    ],
  });
  encounter.stepMany(12);
  assert.deepEqual(encounter.replay.map(({ tick, type, reason }) =>
    [tick, type, reason]), [
    [0, "deployed", undefined],
    [1, "activated", undefined],
    [6, "activation-rejected", "active"],
    [6, "active-ended", undefined],
    [8, "died", undefined],
    [9, "deployed", undefined],
    [10, "activated", undefined],
  ]);
});

test("champions: command-first active and cooldown boundaries are exact", () => {
  const encounter = controller({
    commands: [
      { entityId: 101, tick: 0, type: "deploy" },
      { entityId: 101, tick: 1, type: "activate" },
      { entityId: 101, tick: 6, type: "activate" },
      { entityId: 101, tick: 14, type: "activate" },
    ],
  });
  encounter.stepMany(15);
  assert.deepEqual(encounter.replay.filter(({ tick }) =>
    tick === 6 || tick === 14).map(({ tick, type, reason }) =>
    [tick, type, reason]), [
    [6, "activation-rejected", "active"],
    [6, "active-ended", undefined],
    [14, "activation-rejected", "cooldown"],
    [14, "cooldown-ended", undefined],
  ]);
});

test("champions: real activation embeds all nine shared primitive contracts", () => {
  const compatibility = probeChampionAbilityAdapters();
  assert.deepEqual(Object.keys(compatibility).sort(), ARCHETYPES);
  for (const archetypeId of ARCHETYPES) {
    const encounter = controller({
      champions: [{ archetypeId, entityId: 101, ownerId: 1 }],
    });
    encounter.stepMany(3);
    const champion = encounter.state.champions[0];
    assert.deepEqual(champion.primitives.map(({ name }) => name),
      PRIMITIVE_NAMES[archetypeId], archetypeId);
    assert.deepEqual(champion.primitives.map(primitiveProjection),
      PRIMITIVE_NAMES[archetypeId].map((name) => runDirectPrimitive(name, 2)),
      archetypeId);
    assert.ok(champion.primitives.every((primitive) =>
      primitive.source.activationTick === 1 &&
      primitive.source.archetypeId === archetypeId &&
      primitive.source.entityId === 101 &&
      primitive.source.ownerId === 1 &&
      typeof primitive.serialized === "string"), archetypeId);

    const wrappers = encounter.replay.filter(({ type }) =>
      type === "primitive-event");
    assert.deepEqual(wrappers.map(({ primitiveEvent }) => primitiveEvent),
      champion.primitives.flatMap(({ events }) => events), archetypeId);
    assert.ok(wrappers.every((entry) =>
      entry.archetypeId === archetypeId && entry.entityId === 101 &&
      entry.ownerId === 1 && entry.sourceActivationTick === 1), archetypeId);

    const partial = controller({
      champions: [{ archetypeId, entityId: 101, ownerId: 1 }],
    });
    partial.stepMany(2);
    const restored = ChampionAbilityController.restore(partial.serialize());
    restored.step();
    assert.deepEqual(restored.state, encounter.state,
      `${archetypeId} primitive restore continuation`);
    assert.equal(restored.serialize(), encounter.serialize(), archetypeId);
  }
});

test("champions: activation source calls every imported primitive constructor", () => {
  const source = readFileSync(
    new URL("../src/content/cards/champion-abilities.js", import.meta.url),
    "utf8",
  );
  for (const constructor of [
    "ShieldFormEncounter",
    "RecoilEncounter",
    "ChargeSpecialEncounter",
    "DashEncounter",
    "LeapKnockbackRetargetEncounter",
    "InstantaneousCombatResetEncounter",
    "InvisibilityRevealEncounter",
    "ReflectionEncounter",
  ]) {
    assert.match(source, new RegExp(`return new ${constructor}\\(`),
      constructor);
  }
  assert.match(source,
    /processCommand[\s\S]*activatePrimitives\(state, champion\)/);
  assert.doesNotMatch(source,
    /function probeChampionAbilityAdapters\(\)[\s\S]*new (?:Shield|Recoil|Charge|Dash|Leap|Instantaneous|Invisibility|Reflection)/);
});

test("champions: primitive cancellation, cooldown, and redeploy are causal", () => {
  const timing = {
    "aegis-sage": { activeUntil: 5, cooldownUntil: 11 },
    "bone-regent": { activeUntil: 4, cooldownUntil: 11 },
    "dusk-ranger": { activeUntil: 6, cooldownUntil: 14 },
    "gilded-lancer": { activeUntil: 3, cooldownUntil: 8 },
    "iron-borer": { activeUntil: 4, cooldownUntil: 10 },
  };
  for (const archetypeId of ARCHETYPES) {
    const cancelled = controller({
      champions: [{ archetypeId, entityId: 101, ownerId: 1 }],
      commands: [
        { entityId: 101, tick: 0, type: "deploy" },
        { entityId: 101, tick: 1, type: "activate" },
        { entityId: 101, tick: 2, type: "die" },
      ],
    });
    cancelled.stepMany(3);
    assert.ok(cancelled.state.champions[0].primitives.every(({ status }) =>
      status === "cancelled"), archetypeId);
    assert.deepEqual(
      cancelled.state.champions[0].primitives.map(primitiveProjection),
      PRIMITIVE_NAMES[archetypeId].map((name) => runDirectPrimitive(name, 1)),
      `${archetypeId} death stops primitive before next boundary`,
    );
    assert.deepEqual(
      ChampionAbilityController.restore(cancelled.serialize()).state,
      cancelled.state,
      `${archetypeId} cancelled restore`,
    );

    const redeployed = controller({
      champions: [{ archetypeId, entityId: 101, ownerId: 1 }],
      commands: [
        { entityId: 101, tick: 0, type: "deploy" },
        { entityId: 101, tick: 1, type: "activate" },
        { entityId: 101, tick: 2, type: "die" },
        { entityId: 101, tick: 3, type: "deploy" },
        { entityId: 101, tick: 4, type: "activate" },
      ],
    });
    redeployed.stepMany(5);
    const fresh = redeployed.state.champions[0].primitives;
    assert.ok(fresh.every((primitive) =>
      primitive.status === "active" &&
      primitive.source.activationTick === 4), archetypeId);
    assert.deepEqual(fresh.map(primitiveProjection),
      PRIMITIVE_NAMES[archetypeId].map((name) => runDirectPrimitive(name, 1)),
      `${archetypeId} redeploy starts fresh primitives`);

    const completed = controller({
      champions: [{ archetypeId, entityId: 101, ownerId: 1 }],
    });
    completed.stepMany(timing[archetypeId].activeUntil + 1);
    const stopped = completed.state.champions[0].primitives;
    assert.ok(stopped.every(({ status }) => status === "completed"),
      archetypeId);
    assert.deepEqual(stopped.map(primitiveProjection),
      PRIMITIVE_NAMES[archetypeId].map((name) =>
        runDirectPrimitive(name, timing[archetypeId].activeUntil)),
      `${archetypeId} active boundary differential`);
    const stoppedSnapshots = stopped.map(({ serialized }) => serialized);
    completed.stepMany(
      timing[archetypeId].cooldownUntil + 1 - completed.state.tick,
    );
    assert.deepEqual(completed.state.champions[0].primitives
      .map(({ serialized }) => serialized), stoppedSnapshots,
    `${archetypeId} cooldown does not advance primitive`);
  }
});

test("champions: simultaneous activations use stable entity IDs", () => {
  const encounter = controller({
    champions: [
      { archetypeId: "aegis-sage", entityId: 202, ownerId: 2 },
      { archetypeId: "dusk-ranger", entityId: 101, ownerId: 1 },
    ],
    commands: [
      { entityId: 202, tick: 0, type: "deploy" },
      { entityId: 101, tick: 0, type: "deploy" },
      { entityId: 202, tick: 1, type: "activate" },
      { entityId: 101, tick: 1, type: "activate" },
    ],
    owners: [{ elixir: 2, id: 2 }, { elixir: 2, id: 1 }],
  });
  encounter.stepMany(2);
  assert.deepEqual(encounter.replay.map(({ entityId }) => entityId),
    [101, 202, 101, 202]);
  assert.deepEqual(encounter.state.champions.map((champion) => [
    champion.entityId,
    champion.primitives[0].source.entityId,
    champion.primitives[0].source.ownerId,
  ]), [
    [101, 101, 1],
    [202, 202, 2],
  ]);
});

test("champions: replay serialization is canonical and restores causally", () => {
  const encounter = controller();
  encounter.stepMany(9);
  const serialized = encounter.serialize();
  assert.equal(serialized, canonical(JSON.parse(serialized)));
  const restored = ChampionAbilityController.restore(serialized);
  assert.deepEqual(restored.state, encounter.state);
  assert.deepEqual(restored.replay, encounter.replay);
  assert.equal(restored.serialize(), serialized);
});

test("champions: arbitrary chunks and every causal restore cut agree", () => {
  const commands = [
    { entityId: 101, tick: 0, type: "deploy" },
    { entityId: 101, tick: 1, type: "activate" },
    { entityId: 101, tick: 7, type: "die" },
    { entityId: 101, tick: 8, type: "deploy" },
    { entityId: 101, tick: 9, type: "activate" },
  ];
  for (const archetypeId of ARCHETYPES) {
    const options = {
      champions: [{ archetypeId, entityId: 101, ownerId: 1 }],
      commands,
    };
    const one = controller(options);
    one.stepMany(20);
    const chunked = controller(options);
    for (const count of [0, 3, 1, 7, 2, 7]) chunked.stepMany(count);
    assert.deepEqual(chunked.state, one.state, `${archetypeId} chunking`);
    for (let cut = 0; cut <= 20; cut += 1) {
      const partial = controller(options);
      partial.stepMany(cut);
      const restored = ChampionAbilityController.restore(partial.serialize());
      restored.stepMany(20 - cut);
      assert.deepEqual(
        restored.state,
        one.state,
        `${archetypeId} restore cut ${cut}`,
      );
    }
  }
});

test("champions: independent literal timeline oracle matches exact trace", () => {
  const expected = [
    [0, "deployed", null, 10],
    [1, "activated", 6, 9],
    [6, "active-ended", null, 9],
    [14, "cooldown-ended", null, 9],
  ];
  const encounter = controller();
  encounter.stepMany(15);
  assert.deepEqual(encounter.replay.map((entry) => [
    entry.tick,
    entry.type,
    entry.activeUntilTick ?? null,
    entry.type === "deployed" ? 10 : entry.elixirAfter ?? 9,
  ]), expected);
});

test("champions: hostile setup shapes, getters, prototypes, symbols and holes reject", () => {
  const valid = setup();
  const getter = { champions: valid.champions, commands: valid.commands };
  Object.defineProperty(getter, "owners", {
    enumerable: true,
    get() { throw new Error("getter executed"); },
  });
  assert.throws(() => new ChampionAbilityController(getter), /invalid shape/);
  assert.throws(() => new ChampionAbilityController(
    Object.assign(Object.create({}), valid)), /plain object/);
  const symbol = { ...valid, [Symbol("x")]: true };
  assert.throws(() => new ChampionAbilityController(symbol), /invalid shape/);
  const sparse = Array(2);
  sparse[1] = valid.commands[0];
  assert.throws(() => new ChampionAbilityController({
    ...valid, commands: sparse,
  }), /dense/);
  assert.throws(() => new ChampionAbilityController({
    ...valid, extra: true,
  }), /invalid shape/);
});

test("champions: duplicates, unsafe integers, overflow, and oversized setup reject", () => {
  const valid = setup();
  assert.throws(() => new ChampionAbilityController({
    ...valid, commands: [valid.commands[0], valid.commands[0]],
  }), /unique/);
  assert.throws(() => new ChampionAbilityController({
    ...valid,
    champions: [{
      archetypeId: "dusk-ranger",
      entityId: Number.MAX_SAFE_INTEGER + 1,
      ownerId: 1,
    }],
  }), /safe integer/);
  assert.throws(() => new ChampionAbilityController({
    ...valid,
    commands: [{ entityId: 101, tick: 4096, type: "deploy" }],
  }), /safe integer/);
  assert.throws(() => new ChampionAbilityController({
    champions: Array.from({ length: 17 }, (_, index) => ({
      archetypeId: "dusk-ranger", entityId: index + 1, ownerId: 1,
    })),
    commands: [],
    owners: [{ elixir: 10, id: 1 }],
  }), /bounded/);
});

test("champions: hostile, extra, duplicate and noncausal snapshots reject", () => {
  const encounter = controller();
  encounter.stepMany(3);
  const parsed = JSON.parse(encounter.serialize());
  assert.throws(() => ChampionAbilityController.restore(
    encounter.serialize().replace('"version":1', '"version":1,\"version\":1'),
  ), /canonical/);
  assert.throws(() => ChampionAbilityController.restore(
    JSON.stringify({ ...parsed, extra: true })),
  );
  parsed.state.owners[0].elixir = 8;
  assert.throws(() => ChampionAbilityController.restore(canonical(parsed)),
    /causal/);
  const forgedPrimitive = JSON.parse(encounter.serialize());
  forgedPrimitive.state.champions[0].primitives[0].serialized += " ";
  assert.throws(
    () => ChampionAbilityController.restore(canonical(forgedPrimitive)),
    /causal/,
  );
  const forgedPrimitiveState = JSON.parse(encounter.serialize());
  forgedPrimitiveState.state.champions[0].primitives[0].state.tick += 1;
  assert.throws(
    () => ChampionAbilityController.restore(canonical(forgedPrimitiveState)),
    /causal/,
  );
  assert.throws(() => ChampionAbilityController.restore("x".repeat(524289)),
    /byte bound/);
  assert.throws(() => ChampionAbilityController.restore("{"), /valid JSON/);
});

test("champions: stepMany bounds are byte-atomic", () => {
  const encounter = controller();
  encounter.stepMany(2);
  const before = encounter.serialize();
  assert.throws(() => encounter.stepMany(513), /bounded safe integer/);
  assert.equal(encounter.serialize(), before);
  const near = controller();
  for (let remaining = 4096; remaining > 0;) {
    const count = Math.min(remaining, 512);
    near.stepMany(count);
    remaining -= count;
  }
  const terminal = near.serialize();
  assert.throws(() => near.stepMany(1), /encounter bound/);
  assert.equal(near.serialize(), terminal);
});
