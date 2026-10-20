import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  InstantaneousCombatResetEncounter,
  InstantRadiusSpellEncounter,
  createInstantSpellCatalog,
  createInstantSpellFixture,
  createInstantSpellQuestionRecords,
  createResetFixture,
} from "../src/content/index.js";
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

function victim(id, overrides = {}) {
  return {
    combatTargetMode: null,
    combatTargetId: null,
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

function combatant(id, targetId, overrides = {}) {
  return victim(id, {
    combatTargetId: targetId,
    combatTargetMode: "air_and_ground",
    ...overrides,
  });
}

function cast(id, tick = 0, overrides = {}) {
  return {
    center: { ...CENTER },
    id,
    sourceId: 1,
    targetId: null,
    tick,
    type: "cast",
    variant: "plain",
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

function fixture(commands, victims = [], sources = [source()]) {
  return createInstantSpellFixture({ commands, sources, victims });
}

function encounter(commands, victims = [], sources = [source()]) {
  return new InstantRadiusSpellEncounter(
    fixture(commands, victims, sources),
  );
}

function recursivelyFrozen(value) {
  if (value !== null && typeof value === "object") {
    assert.equal(Object.isFrozen(value), true);
    Object.values(value).forEach(recursivelyFrozen);
  }
}

test("instant spells: original family maps exact corpus fields with preserved confidence", () => {
  const catalog = createInstantSpellCatalog();
  assert.deepEqual(catalog, [{
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
  catalog[0].damage = 1;
  assert.equal(createInstantSpellCatalog()[0].damage, 689);

  const evaluate = createReferenceParityEvaluator(
    benchmark.cards,
    [
      ["cost", "elixir_cost", (value) => value],
      ["damage", "damage", (value) => value],
      ["count", "count", (value) => value],
      [
        "areaDamageRadiusMillitiles",
        "area_damage_radius_tiles",
        (value) => value * 1000,
      ],
      [
        "targetMode",
        "targets",
        (value) => value === "air_and_ground" ? "ground-and-air" : value,
      ],
      ["kind", "type", (value) => value === "spell" ? "effect" : value],
    ],
    ["fireball"],
  );
  const parity = evaluate(createInstantSpellCatalog()[0], "fireball");
  const comparison = benchmark.cards.find(({ key }) => key === "fireball");
  assert.equal(comparison.tournament_level, 11);
  assert.equal(comparison.damage, 689);
  assert.equal(comparison.unverified_fields.includes("damage"), false);
  assert.deepEqual(parity.authoritativeFailures, []);
  assert.deepEqual(
    parity.fields.map(({ benchmarkField, disposition, provenance }) => ({
      benchmarkField,
      confidence: provenance.confidence,
      disposition,
    })),
    [
      {
        benchmarkField: "elixir_cost",
        confidence: "authoritative",
        disposition: "match",
      },
      {
        benchmarkField: "damage",
        confidence: "authoritative",
        disposition: "match",
      },
      {
        benchmarkField: "count",
        confidence: "authoritative",
        disposition: "match",
      },
      {
        benchmarkField: "area_damage_radius_tiles",
        confidence: "unverified",
        disposition: "question-backed-match",
      },
      {
        benchmarkField: "targets",
        confidence: "unverified",
        disposition: "question-backed-match",
      },
      {
        benchmarkField: "type",
        confidence: "authoritative",
        disposition: "match",
      },
    ],
  );
  assert.deepEqual(
    parity.questions.map(({ benchmarkField }) => benchmarkField),
    ["area_damage_radius_tiles", "targets"],
  );
});

test("instant spells: each absent field and policy is a fresh recursive QUESTION", () => {
  const first = createInstantSpellQuestionRecords();
  const second = createInstantSpellQuestionRecords();
  const expected = [
    "crownTowerDamageRatio",
    "crownTowerDamageRounding",
    "effectIdPolicy",
    "impactCancellationOnSourceDeath",
    "impactDelayTicks",
    "knockbackAdapterTiming",
    "knockbackCoupling",
    "mappedAreaDamageRadiusMillitiles",
    "mappedTargetMode",
    "multiSpellSameTickOrder",
    "ownershipFilter",
    "placementPolicy",
    "radiusBoundary",
    "resetAdapterTiming",
    "resetCoupling",
    "sameBoundaryOrdering",
    "statusDeathEligibility",
    "statusKindFilter",
    "stunAdapterTiming",
    "stunCoupling",
    "targetDeathAtImpact",
    "targetKindFilter",
    "targetLayerFilter",
    "targetLivenessFilter",
    "targetTargetableFilter",
  ];
  assert.deepEqual(Object.keys(first).sort(), expected.sort());
  assert.notEqual(first, second);
  recursivelyFrozen(first);
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
      source: "unsourced-instant-radius-spell-composition",
    });
    assert.notEqual(record, second[key]);
  }
  assert.deepEqual(first.crownTowerDamageRatio.value, {
    denominator: 10,
    numerator: 3,
  });
  assert.equal(first.crownTowerDamageRatio.confidence, "unverified");
  assert.equal(first.crownTowerDamageRounding.value,
    "nearest-integer-half-up");
  assert.throws(() => createInstantSpellQuestionRecords({}), /overrides/u);
});

test("instant spells: impact occurs on the exact integer boundary", () => {
  const spell = encounter([cast(1)], [victim(10)]);
  assert.deepEqual(spell.step(), [{
    effectId: 1,
    impactTick: 2,
    sourceId: 1,
    tick: 0,
    type: "spell-cast",
    variant: "plain",
  }]);
  assert.deepEqual(spell.step(), []);
  const boundary = spell.step();
  assert.deepEqual(boundary.map(({ type }) => type), [
    "spell-impact",
    "spell-hit",
    "spell-damage",
  ]);
  assert.equal(boundary[0].tick, 2);
  assert.equal(spell.state.victims[0].health, 311);
});

test("instant spells: inclusive radius and signed exact diagonals match a BigInt oracle", () => {
  const vectors = [
    [2500, 0],
    [-2500, 0],
    [0, 2500],
    [0, -2500],
    [1500, 2000],
    [1500, -2000],
    [-1500, 2000],
    [-1500, -2000],
    [2000, 1500],
    [2000, -1500],
    [-2000, 1500],
    [-2000, -1500],
  ];
  const victims = [];
  const expected = [];
  const categories = [];
  let id = 100;
  for (const [dx, dy] of vectors) {
    for (const delta of [-1, 0, 1]) {
      const adjustedX = dx === 0 ? dx : dx + Math.sign(dx) * delta;
      const adjustedY = dx === 0
        ? dy + Math.sign(dy) * delta
        : dy;
      const squared =
        BigInt(adjustedX) * BigInt(adjustedX) +
        BigInt(adjustedY) * BigInt(adjustedY);
      const hit = squared <= 2500n * 2500n;
      victims.push(victim(id, {
        position: {
          x: CENTER.x + adjustedX,
          y: CENTER.y + adjustedY,
        },
      }));
      categories.push({ delta, hit, id });
      if (hit) expected.push(id);
      id += 1;
    }
  }
  const spell = encounter([cast(1)], victims);
  const events = spell.stepMany(3);
  const actual = events
    .filter(({ type }) => type === "spell-hit")
    .map(({ targetId }) => targetId);
  assert.deepEqual(actual, expected);
  assert.ok(categories.filter(({ delta }) => delta === 0)
    .every(({ hit, id }) => hit && actual.includes(id)));
  assert.ok(categories.filter(({ delta }) => delta === -1)
    .every(({ hit, id }) => hit && actual.includes(id)));
  assert.ok(categories.filter(({ delta }) => delta === 1)
    .every(({ hit, id }) => !hit && !actual.includes(id)));
});

test("instant spells: ground air structure crown ownership and targetability filter exactly", () => {
  const victims = [
    victim(8, { layer: "ground" }),
    victim(2, { layer: "air" }),
    victim(6, { kind: "structure" }),
    victim(4, { kind: "crown" }),
    victim(10, { ownerId: 1 }),
    victim(12, { targetable: false }),
  ];
  const spell = encounter([cast(1)], victims);
  const events = spell.stepMany(3);
  assert.deepEqual(
    events.filter(({ type }) => type === "spell-hit")
      .map(({ amount, targetId }) => ({ amount, targetId })),
    [
      { amount: 689, targetId: 2 },
      { amount: 207, targetId: 4 },
      { amount: 689, targetId: 6 },
      { amount: 689, targetId: 8 },
    ],
  );
  assert.equal(events.find(({ type }) => type === "spell-impact").crownDamage,
    207);
  assert.equal(spell.state.victims.find(({ id }) => id === 4).health, 793);
  assert.equal(spell.state.victims.find(({ id }) => id === 10).health, 1000);
  assert.equal(spell.state.victims.find(({ id }) => id === 12).health, 1000);
});

test("instant spells: victims form one stable simultaneous damage and death batch", () => {
  const spell = encounter([cast(1)], [
    victim(9, { health: 689 }),
    victim(2, { health: 689 }),
    victim(5),
  ]);
  const boundary = spell.stepMany(3).filter(({ tick }) => tick === 2);
  assert.deepEqual(boundary.map(({ type }) => type), [
    "spell-impact",
    "spell-hit",
    "spell-hit",
    "spell-hit",
    "spell-damage",
    "spell-damage",
    "spell-damage",
    "spell-death",
    "spell-death",
  ]);
  assert.deepEqual(
    boundary.filter(({ targetId }) => targetId !== undefined)
      .map(({ targetId }) => targetId),
    [2, 5, 9, 2, 5, 9, 2, 9],
  );
  assert.deepEqual(
    spell.state.victims.filter(({ alive }) => !alive)
      .map(({ id }) => id).sort((left, right) => left - right),
    [2, 9],
  );
});

test("instant spells: a valid no-target effect still consumes and records its ID", () => {
  const spell = encounter([cast(1)], [
    victim(2, { ownerId: 1 }),
    victim(3, { position: { x: 12000, y: 16000 } }),
  ]);
  const events = spell.stepMany(3);
  assert.deepEqual(events.map(({ type }) => type), [
    "spell-cast",
    "spell-impact",
  ]);
  assert.deepEqual(events.map(({ effectId }) => effectId), [1, 1]);
  assert.equal(spell.state.nextEffectId, 2);
});

test("instant spells: knockback variant composes the passed exact primitive", () => {
  const spell = encounter([
    cast(1, 0, { variant: "knockback" }),
  ], [victim(11, {
    position: { x: 10500, y: 18000 },
  })]);
  const events = spell.stepMany(3);
  assert.deepEqual(
    events.filter(({ type }) => type === "spell-knockback"),
    [{
      applied: { x: 1200, y: 1600 },
      blocked: { x: 0, y: 0 },
      clamped: false,
      effectId: 1,
      origin: { x: 10500, y: 18000 },
      position: { x: 11700, y: 19600 },
      requested: { x: 1200, y: 1600 },
      targetId: 11,
      tick: 2,
      type: "spell-knockback",
    }],
  );
  assert.deepEqual(spell.state.victims[0].position, {
    x: 11700,
    y: 19600,
  });
  assert.equal(spell.state.victims[0].health, 311);
});

test("instant spells: stun-reset variant composes both passed status primitives", () => {
  const spell = encounter([
    cast(1, 0, { variant: "stun-reset" }),
  ], [
    victim(11, {
      combatTargetMode: "air_and_ground",
      combatTargetId: 77,
      position: { x: 10000, y: 16000 },
    }),
    victim(12, {
      kind: "structure",
      position: { x: 8000, y: 16000 },
    }),
    victim(77, {
      position: { x: 12000, y: 16000 },
    }),
  ]);
  const events = spell.stepMany(3);
  assert.deepEqual(
    events.filter(({ type }) =>
      type === "spell-stun" || type === "spell-combat-reset"),
    [
      {
        disabledThroughTick: 31,
        effectId: 1,
        sourceId: 1,
        targetId: 11,
        tick: 2,
        type: "spell-stun",
      },
      {
        applied: true,
        effectId: 1,
        primitiveEvent: {
          applied: true,
          reason: "applied",
          sourceId: 1,
          targetId: 77,
          tick: 1,
          type: "combat-reset",
        },
        reason: "applied",
        retainedTargetId: 77,
        sourceId: 1,
        targetId: 11,
        tick: 2,
        type: "spell-combat-reset",
      },
    ],
  );
  const troop = spell.state.victims.find(({ id }) => id === 11);
  const structure = spell.state.victims.find(({ id }) => id === 12);
  assert.deepEqual(
    [troop.disabledThroughTick, troop.resetCount],
    [31, 1],
  );
  assert.deepEqual(
    [structure.disabledThroughTick, structure.resetCount],
    [null, 0],
  );
});

test("instant spells: reset adapter preserves exact retained-target primitive outcomes", () => {
  const distant = { position: { x: 12000, y: 16000 } };
  const scenarios = [
    {
      label: "alive eligible",
      primitiveType: "reset",
      victims: [
        combatant(10, 32),
        victim(32, distant),
      ],
    },
    {
      commands: [targetDied(2, 1, 32)],
      label: "dead before impact",
      primitiveTargetDied: true,
      primitiveType: "reset",
      victims: [
        combatant(10, 32),
        victim(32, distant),
      ],
    },
    {
      label: "killed by same impact",
      primitiveTargetDied: true,
      primitiveType: "reset",
      victims: [
        combatant(10, 32),
        victim(32, { health: 689 }),
      ],
    },
    {
      label: "untargetable",
      primitiveType: "reset-ineligible-target",
      victims: [
        combatant(10, 32),
        victim(32, { ...distant, targetable: false }),
      ],
    },
    {
      label: "wrong layer",
      primitiveType: "reset-ineligible-target",
      victims: [
        combatant(10, 32, { combatTargetMode: "ground" }),
        victim(32, { ...distant, layer: "air" }),
      ],
    },
    {
      label: "wrong kind",
      primitiveType: "reset-ineligible-target",
      victims: [
        combatant(10, 32, { combatTargetMode: "buildings" }),
        victim(32, distant),
      ],
    },
    {
      label: "ineligible mode",
      primitiveType: "reset-ineligible-target",
      victims: [
        combatant(10, 32, { combatTargetMode: "none" }),
        victim(32, {
          ...distant,
          kind: "structure",
        }),
      ],
    },
    {
      label: "missing retained target",
      primitiveTargetDied: true,
      primitiveType: "reset",
      victims: [combatant(10, 32)],
    },
    {
      commands: [targetDied(2, 2, 32)],
      label: "same-boundary target death",
      primitiveTargetDied: true,
      primitiveType: "reset",
      victims: [
        combatant(10, 32),
        victim(32, distant),
      ],
    },
  ];

  for (const scenario of scenarios) {
    const commands = [cast(1, 0, { variant: "stun-reset" })]
      .concat(scenario.commands ?? []);
    const spell = encounter(commands, scenario.victims);
    spell.stepMany(3);
    const adapterEvent = spell.replay.find(
      ({ targetId, type }) =>
        type === "spell-combat-reset" && targetId === 10,
    );
    assert.ok(adapterEvent, scenario.label);

    const primitiveCommands = [{
      sourceId: null,
      targetId: 32,
      tick: 0,
      type: "acquire-target",
    }];
    if (scenario.primitiveTargetDied) {
      primitiveCommands.push({
        sourceId: null,
        targetId: 32,
        tick: 1,
        type: "target-died",
      });
    }
    primitiveCommands.push({
      sourceId: 1,
      targetId: 32,
      tick: scenario.primitiveTargetDied ? 2 : 1,
      type: scenario.primitiveType,
    });
    const primitive = new InstantaneousCombatResetEncounter(
      createResetFixture(primitiveCommands),
    );
    primitive.stepMany(primitiveCommands.length);
    const primitiveEvent = primitive.replay.find(
      ({ type }) => type === "combat-reset",
    );
    assert.deepEqual(
      adapterEvent.primitiveEvent,
      primitiveEvent,
      scenario.label,
    );
    assert.deepEqual({
      applied: adapterEvent.applied,
      reason: adapterEvent.reason,
      retainedTargetId: adapterEvent.retainedTargetId,
    }, {
      applied: primitiveEvent.applied,
      reason: primitiveEvent.reason,
      retainedTargetId: primitiveEvent.targetId,
    }, scenario.label);
    assert.equal(
      spell.state.victims.find(({ id }) => id === 10).resetCount,
      primitiveEvent.applied ? 1 : 0,
      scenario.label,
    );
  }

  const cancelled = encounter([
    cast(1, 0, { variant: "stun-reset" }),
    sourceDied(2, 2),
  ], [
    combatant(10, 32),
    victim(32, distant),
  ]);
  const cancellationBoundary = cancelled.stepMany(3)
    .filter(({ tick }) => tick === 2);
  assert.deepEqual(cancellationBoundary, [
    { sourceId: 1, tick: 2, type: "spell-source-died" },
    {
      effectId: 1,
      reason: "source-dead",
      sourceId: 1,
      tick: 2,
      type: "spell-cancelled",
    },
  ]);
  assert.deepEqual(
    cancelled.replay.filter(({ type }) => type === "spell-combat-reset"),
    [],
  );
});

test("instant spells: passed reset stun and knockback primitive hashes are pinned", () => {
  const pins = {
    "../src/content/cards/combat-status-stun.js":
      "7c81178932fe7139f7abc068de8f4bc5da8657605941f1c9a3c4206bcd9be58d",
    "../src/content/cards/special-combat-reset.js":
      "a7f44f7f97f78a5b713e1090e56e5fb9060322317895c9f39ec4ff652fb163c5",
    "../src/content/cards/special-movement-knockback.js":
      "d587f7bcc29628a597b17cb7b1787b442cf29f797b0b7b45e4d9884dc6c38d8f",
  };
  for (const [relativePath, expected] of Object.entries(pins)) {
    const contents = readFileSync(new URL(relativePath, import.meta.url));
    assert.equal(
      createHash("sha256").update(contents).digest("hex"),
      expected,
      relativePath,
    );
  }
});

test("instant spells: command-first source and target deaths cancel causally", () => {
  const sourceDeath = encounter([
    cast(1),
    sourceDied(2, 2),
  ], [victim(8)]);
  const sourceBoundary = sourceDeath.stepMany(3)
    .filter(({ tick }) => tick === 2);
  assert.deepEqual(sourceBoundary, [
    { sourceId: 1, tick: 2, type: "spell-source-died" },
    {
      effectId: 1,
      reason: "source-dead",
      sourceId: 1,
      tick: 2,
      type: "spell-cancelled",
    },
  ]);
  assert.equal(sourceDeath.state.victims[0].health, 1000);

  const targetDeath = encounter([
    cast(1),
    targetDied(2, 2, 8),
  ], [victim(8)]);
  const targetBoundary = targetDeath.stepMany(3)
    .filter(({ tick }) => tick === 2);
  assert.deepEqual(targetBoundary.map(({ type }) => type), [
    "spell-target-died",
    "spell-impact",
  ]);
  assert.equal(targetBoundary.some(({ type }) => type === "spell-hit"), false);
  assert.equal(targetDeath.state.victims[0].alive, false);
});

test("instant spells: same-tick spells keep command order and stable effect IDs", () => {
  const spell = encounter([
    cast(10),
    cast(20),
  ], [victim(9, { health: 2000 })]);
  const events = spell.stepMany(3);
  assert.deepEqual(
    events.filter(({ type }) => type === "spell-cast")
      .map(({ effectId }) => effectId),
    [1, 2],
  );
  assert.deepEqual(
    events.filter(({ type }) => type === "spell-impact")
      .map(({ effectId }) => effectId),
    [1, 2],
  );
  assert.deepEqual(
    events.filter(({ type }) => type === "spell-damage")
      .map(({ effectId, healthAfter, healthBefore }) => ({
        effectId,
        healthAfter,
        healthBefore,
      })),
    [
      { effectId: 1, healthAfter: 1311, healthBefore: 2000 },
      { effectId: 2, healthAfter: 622, healthBefore: 1311 },
    ],
  );
  assert.equal(spell.state.nextEffectId, 3);
});

test("instant spells: caller setup state replay and outputs are isolated", () => {
  const commands = [cast(1)];
  const victims = [victim(8)];
  const sources = [source()];
  const setup = fixture(commands, victims, sources);
  const spell = new InstantRadiusSpellEncounter(setup);
  commands[0].tick = 50;
  victims[0].health = 1;
  sources[0].ownerId = 2;
  setup.commands[0].tick = 60;
  setup.victims[0].health = 2;
  const events = spell.stepMany(3);
  events[0].effectId = 99;
  const state = spell.state;
  state.victims[0].health = 999;
  const replay = spell.replay;
  replay.length = 0;
  assert.equal(spell.state.victims[0].health, 311);
  assert.equal(spell.replay[0].effectId, 1);
  assert.equal(spell.replay.length, 4);
});

test("instant spells: arbitrary chunks and every causal restore cut are identical", () => {
  const commands = [
    cast(1),
    cast(2, 1, { variant: "stun-reset" }),
    targetDied(3, 5, 12),
  ];
  const victims = [
    combatant(11, 77, { health: 2500 }),
    victim(12, { health: 2500 }),
  ];
  const expected = encounter(commands, victims);
  expected.stepMany(8);

  const chunked = encounter(commands, victims);
  for (const count of [1, 0, 2, 1, 4]) chunked.stepMany(count);
  assert.equal(chunked.serialize(), expected.serialize());
  assert.deepEqual(chunked.state, expected.state);

  for (let cut = 0; cut <= 8; cut += 1) {
    const causal = encounter(commands, victims);
    causal.stepMany(cut);
    const restored = InstantRadiusSpellEncounter.restore(causal.serialize());
    restored.stepMany(8 - cut);
    assert.equal(restored.serialize(), expected.serialize(), `cut ${cut}`);
    assert.deepEqual(restored.state, expected.state, `state cut ${cut}`);
  }

  const terminal = encounter(commands, victims);
  terminal.stepMany(128);
  for (let cut = 0; cut <= 128; cut += 1) {
    const causal = encounter(commands, victims);
    causal.stepMany(cut);
    const restored = InstantRadiusSpellEncounter.restore(causal.serialize());
    restored.stepMany(128 - cut);
    assert.equal(
      restored.serialize(),
      terminal.serialize(),
      `bounded cut ${cut}`,
    );
    assert.deepEqual(
      restored.state,
      terminal.state,
      `bounded state cut ${cut}`,
    );
  }
});

test("instant spells: hostile getters prototypes symbols sparse extras duplicates and bounds reject", () => {
  const valid = {
    commands: [cast(1)],
    sources: [source()],
    victims: [victim(8)],
  };
  let reads = 0;
  const hostile = cast(1);
  Object.defineProperty(hostile, "tick", {
    enumerable: true,
    get() {
      reads += 1;
      return 0;
    },
  });
  assert.throws(() => createInstantSpellFixture({
    ...valid,
    commands: [hostile],
  }));
  assert.equal(reads, 0);

  const inherited = Object.create(cast(1));
  assert.throws(() => createInstantSpellFixture({
    ...valid,
    commands: [inherited],
  }), /plain object/u);

  const symbol = cast(1);
  symbol[Symbol("hidden")] = true;
  assert.throws(() => createInstantSpellFixture({
    ...valid,
    commands: [symbol],
  }), /invalid shape/u);

  const sparse = [];
  sparse.length = 1;
  assert.throws(() => createInstantSpellFixture({
    ...valid,
    victims: sparse,
  }), /dense/u);
  assert.throws(() => createInstantSpellFixture({
    ...valid,
    extra: true,
  }), /invalid shape/u);
  assert.throws(() => createInstantSpellFixture({
    ...valid,
    sources: [source(), source()],
  }), /unique/u);
  assert.throws(() => createInstantSpellFixture({
    ...valid,
    victims: [victim(8), victim(8)],
  }), /unique/u);
  assert.throws(() => createInstantSpellFixture({
    ...valid,
    commands: [cast(1), cast(1)],
  }), /unique/u);
  assert.throws(() => createInstantSpellFixture({
    ...valid,
    commands: [cast(Number.MAX_SAFE_INTEGER + 1)],
  }), /safe integer/u);
  assert.throws(() => createInstantSpellFixture({
    ...valid,
    victims: [victim(8, { health: Number.MAX_SAFE_INTEGER })],
  }), /safe integer/u);
  assert.throws(() => createInstantSpellFixture({
    ...valid,
    commands: [cast(1, 0, { center: { x: -1, y: 0 } })],
  }), /safe integer/u);
  assert.throws(() => createInstantSpellFixture({
    ...valid,
    sources: Array.from({ length: 17 }, (_, index) =>
      source(index + 1, index + 1)),
  }), /bounded plain array/u);
  assert.throws(() => createInstantSpellFixture({
    ...valid,
    victims: Array.from({ length: 65 }, (_, index) =>
      victim(index + 100)),
  }), /bounded plain array/u);
  assert.throws(() => createInstantSpellFixture({
    ...valid,
    commands: Array.from({ length: 97 }, (_, index) =>
      cast(index + 1)),
  }), /bounded plain array/u);
});

test("instant spells: failing composition and stepMany bounds are atomic", () => {
  const invalidVector = encounter([
    cast(1, 0, { variant: "knockback" }),
  ], [victim(8)]);
  invalidVector.stepMany(2);
  const beforeImpact = invalidVector.serialize();
  assert.throws(() => invalidVector.step(), /zero vector/u);
  assert.equal(invalidVector.serialize(), beforeImpact);

  const bounded = encounter([cast(1)], [victim(8)]);
  const before = bounded.serialize();
  for (const count of [-1, 129, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => bounded.stepMany(count));
    assert.equal(bounded.serialize(), before);
  }
  bounded.stepMany(127);
  const nearTerminal = bounded.serialize();
  assert.throws(() => bounded.stepMany(2), /encounter bound/u);
  assert.equal(bounded.serialize(), nearTerminal);
});

test("instant spells: snapshots are canonical causal setup plus tick only", () => {
  const spell = encounter([cast(1)], [victim(8)]);
  spell.stepMany(3);
  const serialized = spell.serialize();
  const parsed = JSON.parse(serialized);
  assert.deepEqual(Object.keys(parsed), ["identity", "tick", "version"]);
  assert.equal(Object.hasOwn(parsed, "state"), false);
  assert.equal(
    InstantRadiusSpellEncounter.restore(serialized).serialize(),
    serialized,
  );

  const mutations = [
    (value) => { value.version = 2; },
    (value) => { value.tick = 129; },
    (value) => { value.identity.fixture = "foreign"; },
    (value) => { value.identity.extra = true; },
    (value) => { value.extra = true; },
    (value) => { value.identity.setup.commands[0].sourceId = 999; },
  ];
  for (const mutate of mutations) {
    const value = structuredClone(parsed);
    mutate(value);
    assert.throws(() =>
      InstantRadiusSpellEncounter.restore(JSON.stringify(value)));
  }
  assert.throws(() => InstantRadiusSpellEncounter.restore(
    serialized.replace('"version":1', '"version":1,"version":1'),
  ), /canonical duplicate-free/u);
  assert.throws(() => InstantRadiusSpellEncounter.restore(
    JSON.stringify(parsed, null, 2),
  ), /canonical duplicate-free/u);
  assert.throws(() => InstantRadiusSpellEncounter.restore(
    "x".repeat(262145),
  ), /byte bound/u);
  assert.throws(() => InstantRadiusSpellEncounter.restore(null), /string/u);
});

test("instant spells: runtime has no corpus import protected identity clock RNG or float timing", () => {
  const sourceText = readFileSync(
    new URL("../src/content/cards/spells-instant.js", import.meta.url),
    "utf8",
  );
  const protectedTokens = new Set(benchmark.cards.flatMap(({ key, name }) => [
    key.toLowerCase(),
    name.toLowerCase(),
  ]));
  assert.deepEqual(protectedIdentityHits(sourceText, protectedTokens), []);
  assert.doesNotMatch(sourceText, /readFile|cards\.json|reference\//u);
  assert.doesNotMatch(
    sourceText,
    /Date|performance|setTimeout|setInterval|Math\.random/u,
  );
  assert.doesNotMatch(sourceText, /\d+\.\d+/u);

  const spell = encounter([
    cast(1, 0, { variant: "stun-reset" }),
  ], [combatant(8, 44)]);
  spell.stepMany(8);
  const inspect = (value) => {
    if (Array.isArray(value)) return value.forEach(inspect);
    if (value !== null && typeof value === "object") {
      return Object.values(value).forEach(inspect);
    }
    if (typeof value === "number") assert.ok(Number.isSafeInteger(value));
  };
  inspect(spell.state);
});
