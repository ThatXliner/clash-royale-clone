import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ThreeWaveTravelingSpellEncounter,
  createThreeWaveTravelingSpellCatalog,
  createThreeWaveTravelingSpellFixture,
  createThreeWaveTravelingSpellQuestionRecords,
} from "../src/content/cards/spells-three-wave.js";

function source(id = 1, ownerId = 1, position = { x: 1000, y: 1000 }) {
  return { id, ownerId, position };
}

function victim(id, overrides = {}) {
  return {
    combatTargetId: null,
    combatTargetMode: null,
    health: 1000,
    id,
    kind: "troop",
    layer: "ground",
    ownerId: 2,
    position: { x: 6000, y: 1000 },
    radius: 100,
    targetable: true,
    ...overrides,
  };
}

function cast(id, tick = 0, overrides = {}) {
  return {
    center: { x: 6000, y: 1000 },
    effectId: null,
    id,
    sourceId: 1,
    targetId: null,
    tick,
    type: "cast",
    ...overrides,
  };
}

function command(type, id, tick, overrides = {}) {
  return {
    center: null,
    effectId: null,
    id,
    sourceId: null,
    targetId: null,
    tick,
    type,
    ...overrides,
  };
}

function encounter(commands, victims = [], sources = [source()]) {
  return new ThreeWaveTravelingSpellEncounter(
    createThreeWaveTravelingSpellFixture({ commands, sources, victims }),
  );
}

function frozen(value) {
  if (value !== null && typeof value === "object") {
    assert.equal(Object.isFrozen(value), true);
    Object.values(value).forEach(frozen);
  }
}

test("three-wave spell: original identity maps exact caveated corpus fields in test only", () => {
  const corpus = JSON.parse(readFileSync(
    new URL("../reference/stats/cards.json", import.meta.url),
    "utf8",
  )).cards.find(({ id }) => id === 28000001);
  const original = createThreeWaveTravelingSpellCatalog()[0];
  assert.deepEqual({
    areaDamageRadiusMillitiles: original.areaDamageRadiusMillitiles,
    cost: original.cost,
    damage: original.damage,
    targetMode: original.targetMode,
  }, {
    areaDamageRadiusMillitiles: corpus.area_damage_radius_tiles * 1000,
    cost: corpus.elixir_cost,
    damage: corpus.damage,
    targetMode: corpus.targets === "air_and_ground"
      ? "ground-and-air"
      : corpus.targets.replaceAll("_", "-"),
  });
  assert.deepEqual(corpus.unverified_fields, [
    "damage",
    "targets",
    "area_damage_radius_tiles",
  ]);
  assert.match(corpus.notes[0], /per wave.*three waves/u);
  assert.notEqual(original.displayName, corpus.name);
  frozen(createThreeWaveTravelingSpellCatalog());
});

test("three-wave spell: corpus-absent policies are isolated frozen QUESTION records", () => {
  const questions = createThreeWaveTravelingSpellQuestionRecords();
  assert.deepEqual(Object.keys(questions), [
    "cancellationBoundary",
    "crownTowerDamage",
    "movingTargetPolicy",
    "overlapOrder",
    "repeatHitPolicy",
    "sourceDeathBoundary",
    "targetDeathBoundary",
    "waveDamageComposition",
    "waveGeometryComposition",
    "waveLaunchOffsetsTicks",
    "waveRadiusBoundary",
  ]);
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
  frozen(questions);
});

test("three-wave spell: exactly three launch and impact boundaries travel one tick apart", () => {
  const spell = encounter([cast(1)], [victim(8)]);
  spell.stepMany(8);
  assert.deepEqual(
    spell.replay.filter(({ type }) => type === "three-wave-launch")
      .map(({ impactTick, tick, waveIndex }) => ({ impactTick, tick, waveIndex })),
    [
      { impactTick: 5, tick: 0, waveIndex: 0 },
      { impactTick: 6, tick: 1, waveIndex: 1 },
      { impactTick: 7, tick: 2, waveIndex: 2 },
    ],
  );
  assert.deepEqual(
    spell.replay.filter(({ type }) => type === "three-wave-impact")
      .map(({ tick, waveIndex }) => ({ tick, waveIndex })),
    [
      { tick: 5, waveIndex: 0 },
      { tick: 6, waveIndex: 1 },
      { tick: 7, waveIndex: 2 },
    ],
  );
  assert.equal(spell.state.victims[0].health, 634);
});

test("three-wave spell: each wave delegates signed line contacts and stable target order", () => {
  const origin = { x: 9000, y: 16000 };
  const vectors = [
    { dx: 5000, dy: 0 },
    { dx: -5000, dy: 0 },
    { dx: 0, dy: 5000 },
    { dx: 0, dy: -5000 },
    { dx: 3000, dy: 4000 },
    { dx: -3000, dy: -4000 },
  ];
  for (const { dx, dy } of vectors) {
    const spell = encounter(
      [cast(1, 0, { center: { x: origin.x + dx, y: origin.y + dy } })],
      [
        victim(20, {
          position: { x: origin.x + dx / 2, y: origin.y + dy / 2 },
          radius: 0,
        }),
        victim(10, {
          position: { x: origin.x + dx / 2, y: origin.y + dy / 2 },
          radius: 0,
        }),
      ],
      [source(1, 1, origin)],
    );
    spell.stepMany(8);
    assert.deepEqual(
      spell.replay.filter(({ type }) => type === "three-wave-contact")
        .map(({ targetId, tick, waveIndex }) => ({ targetId, tick, waveIndex })),
      [
        { targetId: 10, tick: 3, waveIndex: 0 },
        { targetId: 20, tick: 3, waveIndex: 0 },
        { targetId: 10, tick: 4, waveIndex: 1 },
        { targetId: 20, tick: 4, waveIndex: 1 },
        { targetId: 10, tick: 5, waveIndex: 2 },
        { targetId: 20, tick: 5, waveIndex: 2 },
      ],
      `${dx},${dy}`,
    );
  }
});

test("three-wave spell: inclusive impact radius and per-wave damage are exact", () => {
  const spell = encounter([cast(1)], [
    victim(10, { position: { x: 7500, y: 1000 }, radius: 100 }),
    victim(20, { position: { x: 7501, y: 1000 }, radius: 100 }),
    victim(30, { kind: "crown", health: 1000 }),
    victim(40, { ownerId: 1 }),
    victim(50, { layer: "air" }),
    victim(60, { kind: "structure" }),
    victim(70, { targetable: false }),
  ]);
  spell.stepMany(8);
  const state = spell.state.victims;
  assert.equal(state.find(({ id }) => id === 10).health, 634);
  assert.equal(state.find(({ id }) => id === 20).health, 1000);
  assert.equal(state.find(({ id }) => id === 30).health, 889);
  assert.equal(state.find(({ id }) => id === 40).health, 1000);
  assert.equal(state.find(({ id }) => id === 50).health, 634);
  assert.equal(state.find(({ id }) => id === 60).health, 634);
  assert.equal(state.find(({ id }) => id === 70).health, 1000);
});

test("three-wave spell: damage adapter preserves survival and exact death boundaries", () => {
  const spell = encounter([cast(1)], [
    victim(10, { health: 367 }),
    victim(20, { health: 366 }),
    victim(30, { health: 1_000_000 }),
  ]);
  spell.stepMany(8);
  const state = spell.state.victims;
  assert.equal(state.find(({ id }) => id === 10).health, 1);
  assert.equal(state.find(({ id }) => id === 10).alive, true);
  assert.equal(state.find(({ id }) => id === 20).health, 0);
  assert.equal(state.find(({ id }) => id === 20).alive, false);
  assert.equal(state.find(({ id }) => id === 30).health, 999634);
  assert.deepEqual(
    spell.replay.filter(({ type }) => type === "three-wave-death")
      .map(({ targetId, tick, waveIndex }) => ({ targetId, tick, waveIndex })),
    [{ targetId: 20, tick: 7, waveIndex: 2 }],
  );
});

test("three-wave spell: overlapping effects order by effect then wave then target", () => {
  const spell = encounter([cast(1), cast(2, 1)], [
    victim(20, { health: 1000 }),
    victim(10, { health: 1000 }),
  ]);
  spell.stepMany(9);
  assert.deepEqual(
    spell.replay.filter(({ type, tick }) => (
      type === "three-wave-damage" && tick === 6
    )).map(({ effectId, targetId, waveIndex }) => ({
      effectId,
      targetId,
      waveIndex,
    })),
    [
      { effectId: 1, targetId: 10, waveIndex: 1 },
      { effectId: 1, targetId: 20, waveIndex: 1 },
      { effectId: 2, targetId: 10, waveIndex: 0 },
      { effectId: 2, targetId: 20, waveIndex: 0 },
    ],
  );
});

test("three-wave spell: explicit cancellation and source death are command-first", () => {
  for (const cancellation of [
    command("cancel-effect", 2, 6, { effectId: 1 }),
    command("source-died", 2, 6, { sourceId: 1 }),
  ]) {
    const spell = encounter([cast(1), cancellation], [victim(8)]);
    spell.stepMany(8);
    assert.equal(spell.state.victims[0].health, 878);
    assert.deepEqual(
      spell.replay.filter(({ type }) => type === "three-wave-impact")
        .map(({ tick, waveIndex }) => ({ tick, waveIndex })),
      [{ tick: 5, waveIndex: 0 }],
    );
    assert.equal(
      spell.replay.filter(({ type }) => type === "three-wave-cancelled").length,
      1,
    );
  }
  const deadBeforeCast = encounter([
    command("source-died", 1, 0, { sourceId: 1 }),
    cast(2),
  ]);
  assert.deepEqual(deadBeforeCast.step().map(({ type }) => type), [
    "three-wave-source-died",
    "three-wave-cast-cancelled",
  ]);
});

test("three-wave spell: target death is command-first while earlier wave remains causal", () => {
  const spell = encounter([
    cast(1),
    command("target-died", 2, 6, { targetId: 8 }),
  ], [victim(8)]);
  spell.stepMany(8);
  assert.deepEqual(
    spell.replay.filter(({ type }) => type === "three-wave-damage")
      .map(({ tick, waveIndex }) => ({ tick, waveIndex })),
    [{ tick: 5, waveIndex: 0 }],
  );
  assert.equal(spell.state.victims[0].health, 0);
});

test("three-wave spell: chunking and every restore cut are byte-identical", () => {
  const commands = [
    cast(1),
    cast(2, 3, { center: { x: 4000, y: 5000 } }),
  ];
  const victims = [
    victim(8, { position: { x: 3500, y: 1000 }, radius: 0 }),
    victim(9, { position: { x: 4000, y: 5000 } }),
  ];
  const expected = encounter(commands, victims);
  expected.stepMany(12);
  const chunked = encounter(commands, victims);
  for (const count of [1, 0, 2, 3, 1, 5]) chunked.stepMany(count);
  assert.equal(chunked.serialize(), expected.serialize());
  assert.deepEqual(chunked.state, expected.state);

  const bounded = encounter(commands, victims);
  bounded.run();
  for (let cut = 0; cut <= 128; cut += 1) {
    const causal = encounter(commands, victims);
    causal.stepMany(cut);
    const restored = ThreeWaveTravelingSpellEncounter.restore(
      causal.serialize(),
    );
    assert.deepEqual(restored.state.pending, causal.state.pending, `latches ${cut}`);
    restored.stepMany(128 - cut);
    assert.equal(restored.serialize(), bounded.serialize(), `cut ${cut}`);
    assert.deepEqual(restored.state, bounded.state, `state ${cut}`);
  }
});

test("three-wave spell: canonical restore rejects forged and oversized snapshots", () => {
  const spell = encounter([cast(1)], [victim(8)]);
  spell.stepMany(4);
  const serialized = spell.serialize();
  assert.equal(
    ThreeWaveTravelingSpellEncounter.restore(serialized).serialize(),
    serialized,
  );
  assert.throws(
    () => ThreeWaveTravelingSpellEncounter.restore(` ${serialized}`),
    /canonical/u,
  );
  assert.throws(
    () => ThreeWaveTravelingSpellEncounter.restore(
      serialized.replace('"version":1', '"version":2'),
    ),
    /version/u,
  );
  assert.throws(
    () => ThreeWaveTravelingSpellEncounter.restore("x".repeat(262145)),
    /byte bound/u,
  );
});

test("three-wave spell: hostile input and execution bounds reject atomically", () => {
  const valid = { commands: [cast(1)], sources: [source()], victims: [victim(8)] };
  let reads = 0;
  const hostile = cast(1);
  Object.defineProperty(hostile, "tick", {
    enumerable: true,
    get() {
      reads += 1;
      return 0;
    },
  });
  assert.throws(() => createThreeWaveTravelingSpellFixture({
    ...valid,
    commands: [hostile],
  }));
  assert.equal(reads, 0);
  assert.throws(() => createThreeWaveTravelingSpellFixture({
    ...valid,
    commands: [Object.create(cast(1))],
  }), /plain object/u);
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => createThreeWaveTravelingSpellFixture({
    ...valid,
    victims: sparse,
  }), /dense/u);
  assert.throws(() => createThreeWaveTravelingSpellFixture({ ...valid, extra: 1 }));

  const spell = encounter([cast(1)], [victim(8)]);
  const before = spell.serialize();
  for (const count of [-1, 129, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => spell.stepMany(count));
    assert.equal(spell.serialize(), before);
  }
  spell.stepMany(127);
  const nearEnd = spell.serialize();
  assert.throws(() => spell.stepMany(2), /encounter bound/u);
  assert.equal(spell.serialize(), nearEnd);

  const tooLate = encounter([cast(1, 121)], [], [
    source(1, 1, { x: 0, y: 0 }),
  ]);
  tooLate.stepMany(121);
  const beforeFailure = tooLate.serialize();
  assert.throws(() => tooLate.step(), /tick bound/u);
  assert.equal(tooLate.serialize(), beforeFailure);
});

test("three-wave spell: passed primitives are pinned and scope excludes return and roll", () => {
  const hashes = {
    "../src/content/cards/spells-instant.js":
      "ca6018cbbcea0013560655e9c2739c294af4d4f1f06658096e0452a8cb9bc035",
    "../src/content/cards/spells-travel-line.js":
      "e50fee7697c067e44a35a3ebcb0507ba98834f3308be96f28f6c5cd723c04597",
  };
  for (const [path, expected] of Object.entries(hashes)) {
    const contents = readFileSync(new URL(path, import.meta.url));
    assert.equal(createHash("sha256").update(contents).digest("hex"), expected);
  }
  const sourceText = readFileSync(
    new URL("../src/content/cards/spells-three-wave.js", import.meta.url),
    "utf8",
  );
  assert.match(sourceText, /new TravelingLineSpellEncounter/u);
  assert.match(sourceText, /new InstantRadiusSpellEncounter/u);
  assert.doesNotMatch(sourceText, /returnLeg|rollingState/u);
  assert.doesNotMatch(sourceText, /reference\//u);
});
