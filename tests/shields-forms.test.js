import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ShieldFormEncounter,
  createShieldFormCatalog,
} from "../src/content/index.js";
import { protectedIdentityHits } from "./helpers/protected-identity-scan.js";
import { createReferenceParityEvaluator } from "./helpers/reference-parity.js";

const benchmark = JSON.parse(readFileSync(
  new URL("../reference/stats/cards.json", import.meta.url),
  "utf8",
));
const sources = readFileSync(
  new URL("../reference/stats/SOURCES.md", import.meta.url),
  "utf8",
);
const comparisonRow = benchmark.cards.find(
  ({ key }) => key === "cannon-cart",
);

const COMMON_FIELDS = [
  ["cost", "elixir_cost", (value) => value],
  ["kind", "type", (value) => value === "troop" ? "unit" : value],
  ["rarity", "rarity", (value) => value === "epic" ? "special" : value],
  ["hitpoints", "hitpoints", (value) => value],
  ["damage", "damage", (value) => value],
  ["hitSpeedTicks", "hit_speed_seconds", (value) => value * 60],
  ["firstHitTicks", "first_hit_seconds", (value) => value * 60],
  ["deployTimeTicks", "deploy_time_seconds", (value) => value * 60],
  ["rangeMillitiles", "range_tiles", (value) => value * 1000],
  ["sightRangeMillitiles", "sight_range_tiles", (value) => value * 1000],
  [
    "movementMillitilesPerSecond",
    "movement_speed_tiles_per_second",
    (value) => value * 1000,
  ],
  ["targetMode", "targets", (value) => value],
  ["count", "count", (value) => value],
  [
    "areaDamageRadiusMillitiles",
    "area_damage_radius_tiles",
    (value) => value === null ? null : value * 1000,
  ],
];

const evaluateParity = createReferenceParityEvaluator(
  benchmark.cards,
  COMMON_FIELDS,
  ["cannon-cart"],
);

function propertyNamesRecursively(value, names = []) {
  if (value === null || typeof value !== "object") return names;
  for (const key of Object.keys(value)) {
    names.push(key);
    propertyNamesRecursively(value[key], names);
  }
  return names;
}

test("shield form content: common definition is exact, original, and isolated", () => {
  const first = createShieldFormCatalog();
  assert.deepEqual(first, [
    {
      areaDamageRadiusMillitiles: null,
      components: [],
      cost: 5,
      count: 1,
      damage: 212,
      deployTimeTicks: 60,
      displayName: "Railward",
      firstHitTicks: 24,
      hitSpeedTicks: 60,
      hitpoints: 892,
      id: "railward",
      kind: "unit",
      movementMillitilesPerSecond: 1000,
      rangeMillitiles: 5500,
      rarity: "special",
      sightRangeMillitiles: 6000,
      targetMode: "ground",
    },
  ]);
  first[0].damage = 1;
  first[0].components.push({});
  assert.equal(createShieldFormCatalog()[0].damage, 212);
  assert.deepEqual(createShieldFormCatalog()[0].components, []);
});

test("shield form content: top-level parity preserves confidence", (context) => {
  const report = evaluateParity(createShieldFormCatalog()[0], "cannon-cart");
  assert.deepEqual(report.authoritativeFailures, []);
  assert.deepEqual(
    report.fields.filter(({ disposition }) => disposition === "match")
      .map(({ runtimeField }) => runtimeField),
    ["cost", "kind", "rarity", "areaDamageRadiusMillitiles"],
  );
  assert.equal(report.questions.length, 10);
  assert.ok(report.questions.every(
    ({ disposition }) => disposition === "question-backed-match",
  ));
  context.diagnostic(`parity report ${JSON.stringify(report)}`);
});

test("shield form content: authority fails while mechanic differences ask", () => {
  const authorityMutation = createShieldFormCatalog()[0];
  authorityMutation.cost = 6;
  assert.deepEqual(
    evaluateParity(authorityMutation, "cannon-cart").authoritativeFailures
      .map(({ runtimeField }) => runtimeField),
    ["cost"],
  );

  const questionMutation = createShieldFormCatalog()[0];
  questionMutation.damage += 1;
  const report = evaluateParity(questionMutation, "cannon-cart");
  assert.deepEqual(report.authoritativeFailures, []);
  assert.deepEqual(
    report.questions.filter(({ disposition }) => disposition === "question")
      .map(({ runtimeField }) => runtimeField),
    ["damage"],
  );
});

test("shield form content: recursive audit proves ability substats are absent", () => {
  assert.ok(comparisonRow);
  const names = propertyNamesRecursively(comparisonRow).map((key) =>
    key.toLowerCase()
  );
  assert.deepEqual(
    names.filter((key) =>
      /shield|form|transform|stationary.*health|reviv|overflow/u.test(key)
    ),
    [],
  );
  assert.match(
    sources,
    /Card abilities .*shields.*outside the requested common schema\./u,
  );
  assert.ok(comparisonRow.unverified_fields.includes("hitpoints"));
  assert.ok(comparisonRow.unverified_fields.includes("damage"));
});

test("shield form encounter: initial mobile shield and body are pinned", () => {
  const encounter = new ShieldFormEncounter();
  assert.deepEqual(encounter.state, {
    body: { currentHealth: 892, maxHealth: 892 },
    combat: {
      areaDamageRadiusMillitiles: null,
      count: 1,
      damage: 212,
      deployTimeTicks: 60,
      firstHitTicks: 24,
      hitSpeedTicks: 60,
      rangeMillitiles: 5500,
      sightRangeMillitiles: 6000,
      targetMode: "ground",
    },
    dead: false,
    entityId: 1,
    form: "mobile",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    shield: { currentHealth: 892, maxHealth: 892 },
    tick: 0,
  });
  assert.deepEqual(encounter.replay, []);
});

test("shield form encounter: 891 damage stays mobile with one shield", () => {
  const encounter = new ShieldFormEncounter();
  assert.deepEqual(encounter.damage(891), [{
    applied: 891,
    currentHealth: 1,
    discardedOverflow: 0,
    incoming: 891,
    sequence: 1,
    tick: 0,
    type: "shield-damage",
  }]);
  assert.equal(encounter.state.form, "mobile");
  assert.equal(encounter.state.kind, "unit");
  assert.equal(encounter.state.movementMillitilesPerSecond, 1000);
  assert.deepEqual(encounter.state.body, {
    currentHealth: 892,
    maxHealth: 892,
  });
});

test("shield form encounter: equal shield damage transitions at one tick", () => {
  const encounter = new ShieldFormEncounter();
  assert.deepEqual(encounter.damage(892), [
    {
      applied: 892,
      currentHealth: 0,
      discardedOverflow: 0,
      incoming: 892,
      sequence: 1,
      tick: 0,
      type: "shield-damage",
    },
    { sequence: 2, tick: 0, type: "shield-break" },
    {
      from: "mobile",
      sequence: 3,
      tick: 0,
      to: "stationary",
      type: "form-transition",
    },
  ]);
  assert.equal(encounter.state.form, "stationary");
  assert.equal(encounter.state.kind, "structure");
  assert.equal(encounter.state.movementMillitilesPerSecond, 0);
  assert.equal(encounter.state.body.currentHealth, 892);
});

test("shield form encounter: overflow is discarded before same-tick body hits", () => {
  const encounter = new ShieldFormEncounter();
  assert.deepEqual(encounter.damage(1000)[0], {
    applied: 892,
    currentHealth: 0,
    discardedOverflow: 108,
    incoming: 1000,
    sequence: 1,
    tick: 0,
    type: "shield-damage",
  });
  assert.equal(encounter.state.body.currentHealth, 892);

  assert.deepEqual(encounter.damage(212), [{
    amount: 212,
    currentHealth: 680,
    previousHealth: 892,
    sequence: 4,
    tick: 0,
    type: "body-damage",
  }]);
  assert.deepEqual(encounter.damage(680), [
    {
      amount: 680,
      currentHealth: 0,
      previousHealth: 680,
      sequence: 5,
      tick: 0,
      type: "body-damage",
    },
    { entityId: 1, sequence: 6, tick: 0, type: "death" },
  ]);
  assert.equal(encounter.state.dead, true);
  assert.deepEqual(encounter.damage(212), [{
    amount: 212,
    reason: "dead",
    sequence: 7,
    tick: 0,
    type: "damage-no-op",
  }]);
  assert.equal(
    encounter.replay.filter(({ type }) => type === "death").length,
    1,
  );
});

test("shield form encounter: transition preserves combat fields", () => {
  const encounter = new ShieldFormEncounter();
  const before = encounter.state.combat;
  encounter.damage(892);
  assert.deepEqual(encounter.state.combat, before);
  assert.equal(Object.hasOwn(encounter.state, "attackCycle"), false);
  assert.equal(Object.hasOwn(encounter.state, "nextAttackTick"), false);
});

test("shield form encounter: command replay is byte exact across chunks", () => {
  const uninterrupted = new ShieldFormEncounter();
  uninterrupted.advanceTicks(24);
  uninterrupted.damage(1000);
  uninterrupted.damage(212);
  uninterrupted.advanceTicks(60);
  uninterrupted.damage(680);
  uninterrupted.damage(1);

  const chunked = new ShieldFormEncounter();
  chunked.advanceTicks(24);
  chunked.damage(1000);
  const restored = ShieldFormEncounter.restore(chunked.serialize());
  restored.damage(212);
  restored.advanceTicks(60);
  restored.damage(680);
  restored.damage(1);

  assert.equal(restored.serialize(), uninterrupted.serialize());
  assert.deepEqual(restored.state, uninterrupted.state);
  assert.deepEqual(restored.replay, uninterrupted.replay);
  assert.deepEqual(
    JSON.parse(restored.serialize()),
    {
      commands: [
        { ticks: 24, type: "advance" },
        { amount: 1000, type: "damage" },
        { amount: 212, type: "damage" },
        { ticks: 60, type: "advance" },
        { amount: 680, type: "damage" },
        { amount: 1, type: "damage" },
      ],
      fixture: "railward-shield-form-v1",
      version: 1,
    },
  );
  const parsed = JSON.parse(restored.serialize());
  assert.deepEqual(Object.keys(parsed).sort(), [
    "commands",
    "fixture",
    "version",
  ]);
  assert.ok(parsed.commands.every((command) =>
    Object.keys(command).every((key) =>
      ["amount", "ticks", "type"].includes(key)
    )
  ));
  assert.deepEqual(
    restored.replay.map(({ sequence }) => sequence),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
});

test("shield form encounter: restore is fresh and outputs are isolated", () => {
  const original = new ShieldFormEncounter();
  original.damage(1000);
  const restored = ShieldFormEncounter.restore(original.serialize());

  const state = restored.state;
  state.body.currentHealth = 1;
  state.combat.damage = 1;
  const replay = restored.replay;
  replay[0].applied = 1;
  assert.equal(restored.state.body.currentHealth, 892);
  assert.equal(restored.state.combat.damage, 212);
  assert.equal(restored.replay[0].applied, 892);

  restored.damage(212);
  assert.equal(original.state.body.currentHealth, 892);
  assert.equal(restored.state.body.currentHealth, 680);
  assert.notStrictEqual(restored.state, original.state);
});

test("shield form encounter: command boundary rejects hostile shapes safely", () => {
  assert.throws(() => new ShieldFormEncounter({ body: 1 }));
  const encounter = new ShieldFormEncounter();
  const getter = Object.defineProperty({ amount: 1 }, "type", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  const amountGetter = Object.defineProperty(
    { type: "damage" },
    "amount",
    {
      enumerable: true,
      get() {
        throw new Error("must not execute");
      },
    },
  );
  for (const command of [
    null,
    [],
    { amount: 1 },
    { amount: 1, extra: true, type: "damage" },
    { amount: 0, type: "damage" },
    { amount: 1.5, type: "damage" },
    { amount: { valueOf: () => 1 }, type: "damage" },
    { ticks: 0, type: "advance" },
    { ticks: 1, type: "unknown" },
    getter,
    amountGetter,
  ]) {
    assert.throws(() => encounter.command(command));
  }
  assert.equal(encounter.serialize(), new ShieldFormEncounter().serialize());
});

test("shield form encounter: restore enforces exact causal snapshot shapes", () => {
  const valid = JSON.parse(new ShieldFormEncounter().serialize());
  for (const snapshot of [
    null,
    [],
    {},
    { ...valid, extra: true },
    { ...valid, fixture: "other" },
    { ...valid, version: 2 },
    { ...valid, commands: {} },
    { ...valid, commands: [{ amount: 1, extra: true, type: "damage" }] },
    { ...valid, commands: [{ amount: 0, type: "damage" }] },
    { ...valid, commands: [{ ticks: 1_000_001, type: "advance" }] },
    {
      ...valid,
      commands: [
        { ticks: 1_000_000, type: "advance" },
        { ticks: 1, type: "advance" },
      ],
    },
  ]) {
    assert.throws(() => ShieldFormEncounter.restore(JSON.stringify(snapshot)));
  }
  assert.throws(() => ShieldFormEncounter.restore(null));
  assert.throws(() => ShieldFormEncounter.restore("{"));
  assert.throws(() => ShieldFormEncounter.restore(" ".repeat(8_193)));
});

test("shield form encounter: command and tick limits reject atomically", () => {
  const tickBound = new ShieldFormEncounter();
  tickBound.advanceTicks(1_000_000);
  const beforeTickFailure = tickBound.serialize();
  assert.throws(() => tickBound.advanceTicks(1));
  assert.equal(tickBound.serialize(), beforeTickFailure);

  const commandBound = new ShieldFormEncounter();
  for (let index = 0; index < 64; index += 1) commandBound.damage(1);
  const beforeCommandFailure = commandBound.serialize();
  assert.throws(() => commandBound.damage(1));
  assert.equal(commandBound.serialize(), beforeCommandFailure);
});

test("shield form content: shipped module keeps identity and scope clean", () => {
  const source = readFileSync(
    new URL("../src/content/cards/shields-forms.js", import.meta.url),
    "utf8",
  );
  const protectedTokens = new Set(
    benchmark.cards.flatMap(({ key, name }) => [
      key.toLowerCase(),
      name.toLowerCase(),
    ]),
  );
  assert.deepEqual(protectedIdentityHits(source, protectedTokens), []);
  assert.doesNotMatch(source, /\breference\b|readFile|cards\.json/u);
  for (const caveat of [
    "generic shield",
    "simultaneous damage",
    "revival",
    "placement",
    "retargeting",
    "visuals",
    "attack-cycle continuity",
  ]) {
    assert.match(source, new RegExp(caveat, "u"));
  }
});
