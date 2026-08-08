import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PeriodicAreaSpellEncounter,
  createPeriodicSpellCatalog,
  createPeriodicSpellFixture,
  createPeriodicSpellQuestionRecords,
} from "../src/content/cards/spells-periodic.js";
import { protectedIdentityHits } from "./helpers/protected-identity-scan.js";
import { createReferenceParityEvaluator } from "./helpers/reference-parity.js";

const benchmark = JSON.parse(readFileSync(
  new URL("../reference/stats/cards.json", import.meta.url),
  "utf8",
));
const CENTER = Object.freeze({ x: 9000, y: 16000 });

function source(id = 1, ownerId = 1) {
  return { id, ownerId };
}

function target(id, overrides = {}) {
  return {
    health: 1000,
    id,
    kind: "troop",
    layer: "ground",
    ownerId: 2,
    position: { ...CENTER },
    radius: 0,
    targetable: true,
    ...overrides,
  };
}

function cast(id, tick = 0, variant = "blight-ring", overrides = {}) {
  return {
    center: { ...CENTER },
    id,
    sourceId: 1,
    targetId: null,
    tick,
    type: "cast",
    variant,
    ...overrides,
  };
}

function sourceDied(id, tick, sourceId = 1) {
  return {
    center: null,
    id,
    sourceId,
    targetId: null,
    tick,
    type: "source-died",
    variant: null,
  };
}

function targetDied(id, tick, targetId) {
  return {
    center: null,
    id,
    sourceId: null,
    targetId,
    tick,
    type: "target-died",
    variant: null,
  };
}

function fixture(commands, targets = [], sources = [source()]) {
  return createPeriodicSpellFixture({ commands, sources, targets });
}

function encounter(commands, targets = [], sources = [source()]) {
  return new PeriodicAreaSpellEncounter(fixture(commands, targets, sources));
}

function eventsOf(value, type) {
  return value.replay.filter((event) => event.type === type);
}

function primitiveDamageEvents(value) {
  return eventsOf(value, "periodic-damage-primitive")
    .filter(({ primitiveEvent }) => primitiveEvent.type === "damage");
}

function recursivelyFrozen(value) {
  if (value !== null && typeof value === "object") {
    assert.equal(Object.isFrozen(value), true);
    Object.values(value).forEach(recursivelyFrozen);
  }
}

test("periodic spells: original catalog maps corpus values and confidence", () => {
  const catalog = createPeriodicSpellCatalog();
  assert.deepEqual(catalog.map((card) => ({
    cost: card.cost,
    damage: card.damage,
    id: card.id,
    radius: card.areaDamageRadiusMillitiles,
    targetMode: card.targetMode,
  })), [
    {
      cost: 4,
      damage: 91,
      id: "blight-ring",
      radius: 3500,
      targetMode: "ground-and-air",
    },
    {
      cost: 3,
      damage: 81,
      id: "fault-pulse",
      radius: 3500,
      targetMode: "ground",
    },
    {
      cost: 3,
      damage: 84,
      id: "gravity-well",
      radius: 5500,
      targetMode: "ground-and-air",
    },
  ]);
  const evaluator = createReferenceParityEvaluator(
    benchmark.cards,
    [
      ["cost", "elixir_cost", (value) => value],
      ["damage", "damage", (value) => value],
      ["areaDamageRadiusMillitiles", "area_damage_radius_tiles", (value) =>
        value * 1000],
      ["targetMode", "targets", (value) =>
        value === "air_and_ground" ? "ground-and-air" : value],
    ],
    ["poison", "earthquake", "tornado"],
  );
  for (const [index, key] of ["poison", "earthquake", "tornado"].entries()) {
    const parity = evaluator(catalog[index], key);
    assert.deepEqual(parity.authoritativeFailures, []);
    assert.equal(parity.fields[0].disposition, "match");
    assert.deepEqual(
      parity.fields.slice(1).map(({ disposition }) => disposition),
      [
        "question-backed-match",
        "question-backed-match",
        "question-backed-match",
      ],
    );
  }
  catalog[0].damage = 1;
  assert.equal(createPeriodicSpellCatalog()[0].damage, 91);
});

test("periodic spells: every absent or low-confidence rule is frozen QUESTION", () => {
  const questions = createPeriodicSpellQuestionRecords();
  recursivelyFrozen(questions);
  assert.equal(Object.keys(questions).length, 28);
  assert.equal(
    questions.pullComponentRounding.value,
    "largest-magnitude-integer-satisfying-q-squared-times-length-squared-not-greater-than-scaled-component-squared-then-restore-sign",
  );
  for (const [key, record] of Object.entries(questions)) {
    assert.deepEqual({
      authoritative: record.authoritative,
      confidence: record.confidence,
      disposition: record.disposition,
      key: record.key,
    }, {
      authoritative: false,
      confidence: "unverified",
      disposition: "question",
      key,
    });
  }
  assert.throws(() => createPeriodicSpellQuestionRecords(1), TypeError);
});

test("periodic spells: exact tick counts and boundaries are literal", () => {
  const cases = [
    ["blight-ring", [2, 62, 122, 182, 242, 302, 362, 422]],
    ["gravity-well", [2, 32]],
    ["fault-pulse", [2, 62, 122]],
  ];
  for (const [variant, expected] of cases) {
    const value = encounter([cast(1, 0, variant)], [target(10)]);
    value.run();
    assert.deepEqual(
      eventsOf(value, "periodic-tick").map(({ tick }) => tick),
      expected,
    );
    assert.deepEqual(
      eventsOf(value, "periodic-tick").map(({ ordinal }) => ordinal),
      expected.map((_, index) => index),
    );
  }
});

test("periodic spells: exact per-tick damage and crown modifier compose shared damage", () => {
  const value = encounter([cast(1)], [
    target(10, { health: 1000 }),
    target(11, { health: 1000, kind: "structure" }),
    target(12, { health: 1000, kind: "crown" }),
  ]);
  value.stepMany(3);
  assert.deepEqual(
    primitiveDamageEvents(value).map(({ primitiveEvent }) => ({
      amount: primitiveEvent.amount,
      after: primitiveEvent.currentHealthAfter,
      id: primitiveEvent.targetId,
    })),
    [
      { amount: 91, after: 909, id: 10 },
      { amount: 91, after: 909, id: 11 },
      { amount: 27, after: 973, id: 12 },
    ],
  );
  assert.deepEqual(
    [...new Set(eventsOf(value, "periodic-damage-primitive")
      .map(({ primitiveEffectId }) => primitiveEffectId))],
    [1, 2, 3],
  );
});

test("periodic spells: ground pulse applies its isolated structure multiplier", () => {
  const value = encounter([cast(1, 0, "fault-pulse")], [
    target(10),
    target(11, { kind: "structure" }),
    target(12, { kind: "crown" }),
  ]);
  value.stepMany(3);
  assert.deepEqual(
    primitiveDamageEvents(value).map(({ primitiveEvent }) => [
      primitiveEvent.targetId,
      primitiveEvent.amount,
    ]),
    [[10, 81], [11, 243], [12, 24]],
  );
});

test("periodic spells: inclusive radius, layers, ownership, targetability and liveness", () => {
  const value = encounter([cast(1, 0, "fault-pulse")], [
    target(10, { position: { x: 12500, y: 16000 } }),
    target(11, { position: { x: 12501, y: 16000 } }),
    target(12, { layer: "air" }),
    target(13, { ownerId: 1 }),
    target(14, { targetable: false }),
    target(15, { radius: 100, position: { x: 12600, y: 16000 } }),
  ]);
  value.stepMany(3);
  assert.deepEqual(
    primitiveDamageEvents(value).map(({ primitiveEvent }) =>
      primitiveEvent.targetId),
    [10, 15],
  );
});

test("periodic spells: slow delegates the passed primitive and refreshes survivors", () => {
  const value = encounter([cast(1, 0, "fault-pulse")], [target(10)]);
  value.stepMany(63);
  const slows = eventsOf(value, "periodic-slow");
  assert.deepEqual(slows.map(({ tick, untilTick }) => [tick, untilTick]), [
    [2, 62],
    [62, 122],
  ]);
  for (const event of slows) {
    assert.deepEqual(event.primitiveEvent, {
      sourceId: 1,
      tick: 0,
      type: "slow-applied",
      untilTick: 60,
    });
  }
  assert.equal(value.state.targets[0].slowUntilTick, 122);
});

test("periodic spells: lethal damage suppresses slow and pull status", () => {
  for (const variant of ["fault-pulse", "gravity-well"]) {
    const value = encounter([cast(1, 0, variant)], [target(10, { health: 1 })]);
    value.stepMany(3);
    assert.equal(value.state.targets[0].alive, false);
    assert.equal(eventsOf(value, "periodic-slow").length, 0);
    assert.equal(eventsOf(value, "periodic-pull").length, 0);
  }
});

test("periodic spells: pull exactly normalizes every signed axis and diagonal", () => {
  const cases = [
    [10, 1, 0, 1000, 0],
    [20, -1, 0, -1000, 0],
    [30, 0, 1, 0, 1000],
    [40, 0, -1, 0, -1000],
    [50, 1, 1, 707, 707],
    [60, 1, -1, 707, -707],
    [70, -1, 1, -707, 707],
    [80, -1, -1, -707, -707],
    [90, 2, 3, 554, 832],
    [100, 2, -3, 554, -832],
    [110, -2, 3, -554, 832],
    [120, -2, -3, -554, -832],
  ];
  const value = encounter(
    [cast(1, 0, "gravity-well")],
    cases.slice().reverse().map(([id, dx, dy]) => target(id, {
      position: { x: CENTER.x - dx, y: CENTER.y - dy },
    })),
  );
  value.stepMany(3);
  assert.deepEqual(
    eventsOf(value, "periodic-pull").map(({ requested, targetId }) => [
      targetId,
      requested.x,
      requested.y,
    ]),
    cases.map(([id, , , expectedX, expectedY]) =>
      [id, expectedX, expectedY]),
  );
});

test("periodic spells: pull preserves tangent, zero and arena overflow bounds", () => {
  const tangentAndZero = encounter([cast(1, 0, "gravity-well")], [
    target(20),
    target(10, { position: { x: CENTER.x - 5500, y: CENTER.y } }),
  ]);
  tangentAndZero.stepMany(3);
  assert.deepEqual(
    eventsOf(tangentAndZero, "periodic-pull").map((event) => ({
      applied: event.applied,
      id: event.targetId,
      requested: event.requested,
    })),
    [
      {
        applied: { x: 1000, y: 0 },
        id: 10,
        requested: { x: 1000, y: 0 },
      },
      {
        applied: { x: 0, y: 0 },
        id: 20,
        requested: { x: 0, y: 0 },
      },
    ],
  );

  const bounds = [
    [{ x: 0, y: 16000 }, { x: 1, y: 16000 }, { x: -1, y: 0 }],
    [{ x: 18000, y: 16000 }, { x: 17999, y: 16000 }, { x: 1, y: 0 }],
    [{ x: 9000, y: 0 }, { x: 9000, y: 1 }, { x: 0, y: -1 }],
    [{ x: 9000, y: 32000 }, { x: 9000, y: 31999 }, { x: 0, y: 1 }],
  ];
  for (const [center, position, applied] of bounds) {
    const value = encounter(
      [cast(1, 0, "gravity-well", { center })],
      [target(10, { position })],
    );
    value.stepMany(3);
    const [event] = eventsOf(value, "periodic-pull");
    assert.deepEqual(event.requested, {
      x: Math.sign(applied.x) * 1000,
      y: Math.sign(applied.y) * 1000,
    });
    assert.deepEqual(event.applied, applied);
    assert.deepEqual(event.position, center);
  }
});

test("periodic spells: commands precede effects and same-boundary IDs are stable", () => {
  const value = encounter([
    cast(20, 0, "gravity-well"),
    cast(10, 0, "fault-pulse"),
    targetDied(30, 2, 10),
  ], [target(10)]);
  value.stepMany(3);
  assert.deepEqual(value.replay.map(({ effectId, tick, type }) => ({
    effectId: effectId ?? null,
    tick,
    type,
  })).slice(0, 5), [
    { effectId: 1, tick: 0, type: "periodic-cast" },
    { effectId: 2, tick: 0, type: "periodic-cast" },
    { effectId: null, tick: 2, type: "periodic-target-died" },
    { effectId: 1, tick: 2, type: "periodic-tick" },
    { effectId: 2, tick: 2, type: "periodic-tick" },
  ]);
  assert.equal(primitiveDamageEvents(value).length, 0);
});

test("periodic spells: source death cancels future and same-boundary ticks", () => {
  const value = encounter([
    cast(1, 0, "blight-ring"),
    sourceDied(2, 62),
  ], [target(10)]);
  value.run();
  assert.deepEqual(
    eventsOf(value, "periodic-tick").map(({ tick }) => tick),
    [2],
  );
  assert.deepEqual(eventsOf(value, "periodic-source-died")[0], {
    cancelledEffectIds: [1],
    sourceId: 1,
    tick: 62,
    type: "periodic-source-died",
  });
});

test("periodic spells: target death excludes exactly that target", () => {
  const value = encounter([
    cast(1, 0, "fault-pulse"),
    targetDied(2, 62, 10),
  ], [target(10), target(11)]);
  value.stepMany(63);
  assert.deepEqual(
    primitiveDamageEvents(value).map(({ primitiveEvent }) => [
      primitiveEvent.targetId,
      primitiveEvent.currentHealthAfter,
    ]),
    [[10, 919], [11, 919], [11, 838]],
  );
});

test("periodic spells: overlapping effects batch in effect then target order", () => {
  const value = encounter([
    cast(2, 0, "fault-pulse"),
    cast(1, 0, "fault-pulse"),
  ], [target(20), target(10)]);
  value.stepMany(3);
  assert.deepEqual(
    primitiveDamageEvents(value).map(({ effectId, primitiveEvent }) =>
      [effectId, primitiveEvent.targetId, primitiveEvent.currentHealthAfter]),
    [
      [1, 10, 919],
      [1, 20, 919],
      [2, 10, 838],
      [2, 20, 838],
    ],
  );
});

test("periodic spells: chunking is byte-identical", () => {
  const setup = fixture([
    cast(1, 0, "fault-pulse"),
    cast(2, 5, "gravity-well"),
  ], [target(10), target(11, { kind: "crown" })]);
  const whole = new PeriodicAreaSpellEncounter(setup);
  whole.stepMany(130);
  for (const chunks of [[1, 129], [2, 60, 68], [65, 65], [130]]) {
    const split = new PeriodicAreaSpellEncounter(setup);
    for (const count of chunks) split.stepMany(count);
    assert.equal(split.serialize(), whole.serialize());
    assert.deepEqual(split.state, whole.state);
    assert.deepEqual(split.replay, whole.replay);
  }
});

test("periodic spells: restore at every causal boundary is byte-identical", () => {
  const setup = fixture([
    cast(1, 0, "fault-pulse"),
    cast(2, 4, "gravity-well"),
    targetDied(3, 70, 11),
  ], [target(10), target(11)]);
  const expected = new PeriodicAreaSpellEncounter(setup);
  expected.stepMany(130);
  for (let cut = 0; cut <= 130; cut += 1) {
    const prefix = new PeriodicAreaSpellEncounter(setup);
    prefix.stepMany(cut);
    const restored = PeriodicAreaSpellEncounter.restore(prefix.serialize());
    restored.stepMany(130 - cut);
    assert.equal(restored.serialize(), expected.serialize(), `cut ${cut}`);
    assert.deepEqual(restored.replay, expected.replay, `cut ${cut}`);
  }
});

test("periodic spells: fresh runs produce canonical replay and snapshots", () => {
  const setup = fixture([cast(1, 0, "gravity-well")], [target(10)]);
  const left = new PeriodicAreaSpellEncounter(setup);
  const right = new PeriodicAreaSpellEncounter(setup);
  left.run();
  right.run();
  assert.deepEqual(left.replay, right.replay);
  assert.equal(left.serialize(), right.serialize());
  assert.equal(
    createHash("sha256").update(JSON.stringify(left.replay)).digest("hex"),
    createHash("sha256").update(JSON.stringify(right.replay)).digest("hex"),
  );
  assert.equal(
    PeriodicAreaSpellEncounter.restore(left.serialize()).serialize(),
    left.serialize(),
  );
});

test("periodic spells: caller values and returned values are isolated", () => {
  const setup = {
    commands: [cast(1, 0, "fault-pulse")],
    sources: [source()],
    targets: [target(10)],
  };
  const value = new PeriodicAreaSpellEncounter(setup);
  setup.commands[0].center.x = 1;
  setup.targets[0].health = 1;
  const state = value.state;
  state.targets[0].health = 2;
  const events = value.stepMany(3);
  events[0].type = "mutated";
  assert.equal(value.state.targets[0].health, 919);
  assert.equal(value.replay[0].type, "periodic-cast");
});

test("periodic spells: hostile setup and snapshot input is rejected", () => {
  const valid = {
    commands: [cast(1)],
    sources: [source()],
    targets: [target(10)],
  };
  for (const mutate of [
    (value) => { value.commands[0].tick = -1; },
    (value) => { value.commands[0].extra = true; },
    (value) => { value.commands[0].sourceId = 99; },
    (value) => { value.commands[0].variant = "unknown"; },
    (value) => { value.targets[0].health = Number.MAX_SAFE_INTEGER; },
    (value) => { value.targets[0].position.x = 18001; },
    (value) => { value.targets[0].radius = 9001; },
    (value) => { value.sources.push(source()); },
  ]) {
    const candidate = structuredClone(valid);
    mutate(candidate);
    assert.throws(() => new PeriodicAreaSpellEncounter(candidate));
  }
  const value = new PeriodicAreaSpellEncounter(valid);
  const snapshot = value.serialize();
  assert.throws(() => PeriodicAreaSpellEncounter.restore("{}"), TypeError);
  assert.throws(() => PeriodicAreaSpellEncounter.restore(
    snapshot.replace('"version":1', '"version":2'),
  ), TypeError);
  assert.throws(() => PeriodicAreaSpellEncounter.restore(
    snapshot.replace('{"identity"', '{ "identity"'),
  ), TypeError);
  assert.throws(() => PeriodicAreaSpellEncounter.restore(
    `${snapshot.slice(0, -1)},"version":1}`,
  ), TypeError);
});

test("periodic spells: failing execution is atomic and public bounds hold", () => {
  const commands = Array.from({ length: 33 }, (_, index) =>
    cast(index + 1, 0, "fault-pulse"));
  const value = encounter(commands, [target(10)]);
  const before = value.serialize();
  assert.throws(() => value.step(), RangeError);
  assert.equal(value.serialize(), before);
  assert.deepEqual(value.replay, []);
  assert.throws(() => value.stepMany(-1), TypeError);
  assert.throws(() => value.stepMany(513), TypeError);
  const bounded = encounter([], []);
  bounded.stepMany(512);
  assert.throws(() => bounded.step(), RangeError);
});

test("periodic spells: shipped module has no protected identity or corpus import", () => {
  const sourceText = readFileSync(
    new URL("../src/content/cards/spells-periodic.js", import.meta.url),
    "utf8",
  );
  const protectedTokens = new Set(["poison", "tornado", "earthquake"]);
  assert.deepEqual(protectedIdentityHits(sourceText, protectedTokens), []);
  assert.equal(sourceText.includes("../reference"), false);
  assert.equal(sourceText.includes("/reference/"), false);
});
