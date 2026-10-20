import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TravelingLineSpellEncounter,
  createTravelingLineSpellCatalog,
  createTravelingLineSpellFixture,
  createTravelingLineSpellQuestionRecords,
} from "../src/content/cards/spells-travel-line.js";

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
    position: { x: 5000, y: 1000 },
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

function fixture(commands, victims = [], sources = [source()]) {
  return createTravelingLineSpellFixture({ commands, sources, victims });
}

function encounter(commands, victims = [], sources = [source()]) {
  return new TravelingLineSpellEncounter(fixture(commands, victims, sources));
}

function frozen(value) {
  if (value !== null && typeof value === "object") {
    assert.equal(Object.isFrozen(value), true);
    Object.values(value).forEach(frozen);
  }
}

test("travel line spell: catalog uses only the original shipped identity", () => {
  assert.deepEqual(createTravelingLineSpellCatalog(), [{
    areaDamageRadiusMillitiles: 2500,
    components: [],
    cost: 4,
    count: 1,
    damage: 689,
    deployTimeTicks: null,
    displayName: "Squall Orb",
    firstHitTicks: null,
    hitSpeedTicks: null,
    hitpoints: null,
    id: "squall-orb",
    kind: "effect",
    movementMillitilesPerSecond: null,
    rangeMillitiles: null,
    rarity: "uncommon",
    sightRangeMillitiles: null,
    targetMode: "ground-and-air",
  }]);
});

test("travel line spell: every absent travel and collision policy is frozen QUESTION data", () => {
  const questions = createTravelingLineSpellQuestionRecords();
  assert.deepEqual(Object.keys(questions), [
    "cancellationBoundary",
    "collisionDamage",
    "collisionGeometry",
    "collisionOrder",
    "impactComposition",
    "movingTargetPolicy",
    "projectileRadiusMillitiles",
    "sameBoundaryOrder",
    "sourceDeathAfterImpact",
    "speedMillitilesPerTick",
    "targetFilter",
    "targetDeathAtImpact",
    "travelComposition",
    "travelContactTiming",
  ]);
  for (const [key, record] of Object.entries(questions)) {
    assert.deepEqual(
      {
        authoritative: record.authoritative,
        confidence: record.confidence,
        disposition: record.disposition,
        key: record.key,
      },
      {
        authoritative: false,
        confidence: "unverified",
        disposition: "question",
        key,
      },
    );
  }
  frozen(questions);
});

test("travel line spell: exact launch travel and terminal impact boundaries compose projectile timing", () => {
  const spell = encounter(
    [cast(1)],
    [victim(8, { position: { x: 6000, y: 1000 }, radius: 0 })],
  );
  const launch = spell.step();
  assert.deepEqual(launch, [{
    center: { x: 6000, y: 1000 },
    duration: 5,
    effectId: 1,
    impactTick: 5,
    origin: { x: 1000, y: 1000 },
    primitiveProjectileId: 1,
    sourceId: 1,
    tick: 0,
    type: "travel-launch",
  }]);
  assert.deepEqual(spell.stepMany(4), []);
  const impact = spell.step();
  assert.equal(impact[0].type, "travel-impact");
  assert.equal(impact[0].tick, 5);
  assert.equal(impact[0].duration, 5);
  assert.equal(
    spell.state.victims.find(({ id }) => id === 8).health,
    311,
  );
});

test("travel line spell: launch midpoint terminal and signed travel use exact boundaries", () => {
  const diagonal = encounter(
    [cast(1, 0, { center: { x: 4000, y: 5000 } })],
    [],
  );
  assert.equal(diagonal.step()[0].duration, 5);
  diagonal.stepMany(4);
  assert.equal(diagonal.step()[0].tick, 5);

  const contact = encounter(
    [cast(1, 0, { center: { x: 1000, y: 1000 } })],
    [victim(8, { position: { x: 1000, y: 1000 } })],
  );
  const events = contact.step();
  assert.deepEqual(
    events.filter(({ type }) => (
      type === "travel-launch" || type === "travel-impact"
    )).map(({ tick, type }) => ({ tick, type })),
    [
      { tick: 0, type: "travel-launch" },
      { tick: 0, type: "travel-impact" },
    ],
  );

  const chronology = encounter([cast(1)], [
    victim(30, { position: { x: 1000, y: 1000 }, radius: 0 }),
    victim(40, { position: { x: 3500, y: 1000 }, radius: 0 }),
    victim(20, { position: { x: 4000, y: 1000 }, radius: 0 }),
    victim(10, { position: { x: 4000, y: 1000 }, radius: 0 }),
    victim(50, { position: { x: 6000, y: 1000 }, radius: 0 }),
  ]);
  chronology.stepMany(6);
  assert.deepEqual(
    chronology.replay.filter(({ type }) => type === "travel-contact")
      .map(({ targetId, tick }) => ({ targetId, tick })),
    [
      { targetId: 30, tick: 0 },
      { targetId: 40, tick: 3 },
      { targetId: 10, tick: 3 },
      { targetId: 20, tick: 3 },
      { targetId: 50, tick: 5 },
    ],
  );

  const origin = { x: 9000, y: 16000 };
  const vectors = [
    { dx: 5000, dy: 0 },
    { dx: -5000, dy: 0 },
    { dx: 0, dy: 5000 },
    { dx: 0, dy: -5000 },
    { dx: 3000, dy: 4000 },
    { dx: 3000, dy: -4000 },
    { dx: -3000, dy: 4000 },
    { dx: -3000, dy: -4000 },
  ];
  for (const { dx, dy } of vectors) {
    const signed = encounter(
      [cast(1, 0, {
        center: { x: origin.x + dx, y: origin.y + dy },
      })],
      [
        victim(10, {
          position: {
            x: origin.x + dx / 4,
            y: origin.y + dy / 4,
          },
          radius: 0,
        }),
        victim(20, {
          position: {
            x: origin.x + (dx * 3) / 4,
            y: origin.y + (dy * 3) / 4,
          },
          radius: 0,
        }),
      ],
      [source(1, 1, origin)],
    );
    signed.stepMany(6);
    assert.deepEqual(
      signed.replay.filter(({ type }) => type === "travel-contact")
        .map(({ targetId, tick }) => ({ targetId, tick })),
      [
        { targetId: 10, tick: 2 },
        { targetId: 20, tick: 4 },
      ],
      `${dx},${dy}`,
    );
  }
});

test("travel line spell: integer capsule is inclusive and orders forward then stable ID", () => {
  const spell = encounter([cast(1)], [
    victim(40, { position: { x: 3000, y: 1100 }, radius: 100 }),
    victim(12, { position: { x: 3000, y: 900 }, radius: 100 }),
    victim(30, { position: { x: 6000, y: 1100 }, radius: 100 }),
    victim(20, { position: { x: 3000, y: 1101 }, radius: 100 }),
    victim(10, { position: { x: 900, y: 1000 }, radius: 100 }),
    victim(50, { position: { x: 6100, y: 1000 }, radius: 100 }),
  ]);
  spell.stepMany(6);
  const contacts = spell.replay.filter(({ type }) => type === "travel-contact");
  assert.deepEqual(contacts.map(({ targetId }) => targetId), [10, 12, 40, 30, 50]);
  assert.deepEqual(
    contacts.map(({ orderNumerator }) => orderNumerator),
    ["0", "10000000", "10000000", "25000000", "25000000"],
  );
  assert.deepEqual(contacts.map(({ tick }) => tick), [0, 2, 2, 5, 5]);
});

test("travel line spell: target filters affect both contacts and delegated impact", () => {
  const spell = encounter([cast(1)], [
    victim(10, { ownerId: 1 }),
    victim(11, { targetable: false }),
    victim(12, { layer: "air" }),
    victim(13, { kind: "structure" }),
    victim(14, { kind: "crown" }),
  ]);
  spell.stepMany(6);
  assert.deepEqual(
    spell.replay.filter(({ type }) => type === "travel-contact")
      .map(({ targetId }) => targetId),
    [12, 13, 14],
  );
  const state = spell.state.victims;
  assert.equal(state.find(({ id }) => id === 10).health, 1000);
  assert.equal(state.find(({ id }) => id === 11).health, 1000);
  assert.equal(state.find(({ id }) => id === 12).health, 311);
  assert.equal(state.find(({ id }) => id === 13).health, 311);
  assert.equal(state.find(({ id }) => id === 14).health, 793);
});

test("travel line spell: terminal impact delegates exact instant-spell event behavior", () => {
  const spell = encounter([cast(1)], [victim(8)]);
  spell.stepMany(6);
  assert.deepEqual(
    spell.replay.filter(({ type }) => type.startsWith("travel-spell-")),
    [
      {
        center: { x: 6000, y: 1000 },
        crownDamage: 207,
        damage: 689,
        effectId: 1,
        primitiveEffectId: 1,
        radius: 2500,
        sourceId: 1,
        tick: 5,
        type: "travel-spell-impact",
        variant: "plain",
      },
      {
        amount: 689,
        effectId: 1,
        primitiveEffectId: 1,
        targetId: 8,
        tick: 5,
        type: "travel-spell-hit",
      },
      {
        amount: 689,
        effectId: 1,
        healthAfter: 311,
        healthBefore: 1000,
        primitiveEffectId: 1,
        targetId: 8,
        tick: 5,
        type: "travel-spell-damage",
      },
    ],
  );
});

test("travel line spell: explicit and source-death cancellation are command-first including impact", () => {
  for (const cancellation of [
    command("cancel-effect", 2, 5, { effectId: 1 }),
    command("source-died", 2, 5, { sourceId: 1 }),
  ]) {
    const spell = encounter([cast(1), cancellation], [victim(8)]);
    spell.stepMany(6);
    assert.equal(spell.state.victims[0].health, 1000);
    assert.equal(
      spell.replay.filter(({ type }) => type === "travel-impact").length,
      0,
    );
    assert.equal(
      spell.replay.filter(({ type }) => type === "travel-cancelled").length,
      1,
    );
    assert.deepEqual(
      spell.replay.filter(({ type }) => type === "travel-contact")
        .map(({ targetId, tick }) => ({ targetId, tick })),
      [{ targetId: 8, tick: 4 }],
    );
  }
});

test("travel line spell: death is command-first while prior contact remains latched", () => {
  const deadSource = encounter([
    command("source-died", 1, 0, { sourceId: 1 }),
    cast(2),
  ]);
  assert.deepEqual(
    deadSource.step().map(({ type }) => type),
    ["travel-source-died", "travel-launch-cancelled"],
  );
  assert.deepEqual(deadSource.state.pending, []);

  const deadTarget = encounter([
    cast(1),
    command("target-died", 2, 4, { targetId: 8 }),
    command("target-died", 3, 5, { targetId: 9 }),
  ], [
    victim(8, { position: { x: 3500, y: 1000 }, radius: 0 }),
    victim(9, { position: { x: 6000, y: 1000 }, radius: 0 }),
  ]);
  deadTarget.stepMany(6);
  assert.deepEqual(
    deadTarget.replay.filter(({ type }) => type === "travel-contact")
      .map(({ targetId, tick }) => ({ targetId, tick })),
    [{ targetId: 8, tick: 3 }],
  );
  assert.equal(
    deadTarget.replay.some(({ type, targetId }) => (
      type === "travel-spell-hit" && targetId === 8
    )),
    false,
  );
  assert.equal(
    deadTarget.replay.some(({ type, targetId }) => (
      type === "travel-contact" && targetId === 9
    )),
    false,
  );
});

test("travel line spell: simultaneous casts use command effect order and one causal damage sequence", () => {
  const spell = encounter([
    cast(10),
    cast(20),
  ], [victim(8, { health: 1000 })]);
  spell.stepMany(6);
  assert.deepEqual(
    spell.replay.filter(({ type }) => type === "travel-contact")
      .map(({ effectId, targetId, tick }) => ({ effectId, targetId, tick })),
    [
      { effectId: 1, targetId: 8, tick: 4 },
      { effectId: 2, targetId: 8, tick: 4 },
    ],
  );
  assert.deepEqual(
    spell.replay.filter(({ type }) => type === "travel-impact")
      .map(({ effectId }) => effectId),
    [1, 2],
  );
  assert.deepEqual(
    spell.replay.filter(({ type }) => type === "travel-spell-damage")
      .map(({ effectId, healthAfter, healthBefore }) => ({
        effectId,
        healthAfter,
        healthBefore,
      })),
    [
      { effectId: 1, healthAfter: 311, healthBefore: 1000 },
      { effectId: 2, healthAfter: 0, healthBefore: 311 },
    ],
  );
  assert.equal(
    spell.replay.filter(({ type }) => type === "travel-spell-death").length,
    1,
  );
});

test("travel line spell: chunking and every bounded restore cut are byte-identical", () => {
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
  const bounded = encounter(commands, victims);
  bounded.run();

  const chunked = encounter(commands, victims);
  for (const count of [1, 0, 2, 3, 1, 5]) chunked.stepMany(count);
  assert.equal(chunked.serialize(), expected.serialize());
  assert.deepEqual(chunked.state, expected.state);

  for (let cut = 0; cut <= 128; cut += 1) {
    const causal = encounter(commands, victims);
    causal.stepMany(cut);
    const restored = TravelingLineSpellEncounter.restore(causal.serialize());
    assert.deepEqual(restored.state.pending, causal.state.pending, `latches ${cut}`);
    restored.stepMany(128 - cut);
    assert.equal(restored.serialize(), bounded.serialize(), `cut ${cut}`);
    assert.deepEqual(restored.state, bounded.state, `state cut ${cut}`);
  }
});

test("travel line spell: canonical replay restore rejects forged snapshots", () => {
  const spell = encounter([cast(1)], [victim(8)]);
  spell.stepMany(3);
  const serialized = spell.serialize();
  assert.equal(
    TravelingLineSpellEncounter.restore(serialized).serialize(),
    serialized,
  );
  assert.deepEqual(Object.keys(JSON.parse(serialized)), [
    "identity",
    "tick",
    "version",
  ]);
  assert.throws(
    () => TravelingLineSpellEncounter.restore(` ${serialized}`),
    /canonical/u,
  );
  assert.throws(
    () => TravelingLineSpellEncounter.restore(
      serialized.replace('"version":1', '"version":2'),
    ),
    /version/u,
  );
  assert.throws(
    () => TravelingLineSpellEncounter.restore("x".repeat(262145)),
    /byte bound/u,
  );
});

test("travel line spell: hostile descriptors prototypes sparse arrays and bounds reject", () => {
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
  assert.throws(() => createTravelingLineSpellFixture({
    ...valid,
    commands: [hostile],
  }));
  assert.equal(reads, 0);

  assert.throws(() => createTravelingLineSpellFixture({
    ...valid,
    commands: [Object.create(cast(1))],
  }), /plain object/u);
  const symbol = cast(1);
  symbol[Symbol("x")] = true;
  assert.throws(() => createTravelingLineSpellFixture({
    ...valid,
    commands: [symbol],
  }), /invalid shape/u);
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => createTravelingLineSpellFixture({
    ...valid,
    victims: sparse,
  }), /dense/u);
  assert.throws(() => createTravelingLineSpellFixture({ ...valid, extra: 1 }));
  assert.throws(() => createTravelingLineSpellFixture({
    ...valid,
    commands: [cast(1), cast(1)],
  }), /unique/u);
  assert.throws(() => createTravelingLineSpellFixture({
    ...valid,
    sources: [source(), source()],
  }), /unique/u);
  assert.throws(() => createTravelingLineSpellFixture({
    ...valid,
    victims: [victim(8), victim(8)],
  }), /unique/u);
  assert.throws(() => createTravelingLineSpellFixture({
    ...valid,
    commands: Array.from({ length: 97 }, (_, index) => cast(index + 1)),
  }), /bounded plain array/u);
  assert.throws(() => createTravelingLineSpellFixture({
    ...valid,
    victims: [victim(8, { health: 1_000_001 })],
  }), /bounded safe integer/u);
  assert.throws(() => createTravelingLineSpellFixture({
    ...valid,
    sources: [source(1, 1, { x: 18001, y: 0 })],
  }), /bounded safe integer/u);
});

test("travel line spell: failing bounds and composed launch are atomic", () => {
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

  const tooLate = encounter([cast(1, 127)], [], [
    source(1, 1, { x: 0, y: 0 }),
  ]);
  tooLate.stepMany(127);
  const beforeFailure = tooLate.serialize();
  assert.throws(() => tooLate.step(), /tick bound/u);
  assert.equal(tooLate.serialize(), beforeFailure);
});

test("travel line spell: passed projectile and instant-spell primitives are pinned and imported", () => {
  const hashes = {
    "../src/content/cards/spells-instant.js":
      "d62c418b375be6ed28c7f79a115fa3e9c2e425db210018a0d9919bdb7993325a",
    "../src/sim/projectile.js":
      "e911a45efb7167a9138f85254d76f1e0c7b4b1c76019c56ec5fbd1903ad1b765",
  };
  for (const [path, expected] of Object.entries(hashes)) {
    const contents = readFileSync(new URL(path, import.meta.url));
    assert.equal(
      createHash("sha256").update(contents).digest("hex"),
      expected,
      path,
    );
  }
  const sourceText = readFileSync(
    new URL("../src/content/cards/spells-travel-line.js", import.meta.url),
    "utf8",
  );
  assert.match(sourceText, /new ProjectileCombat/u);
  assert.match(sourceText, /new InstantRadiusSpellEncounter/u);
  assert.doesNotMatch(sourceText, /waveIndex|returnLeg|rollingState/u);
  assert.doesNotMatch(sourceText, /reference\//u);
});
