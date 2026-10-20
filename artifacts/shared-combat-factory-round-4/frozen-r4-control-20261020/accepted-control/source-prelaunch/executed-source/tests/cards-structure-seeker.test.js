import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  StructureSeekerEncounter,
  createStructureSeekerCatalog,
  createStructureSeekerFixture,
} from "../src/content/index.js";
import { protectedIdentityHits } from "./helpers/protected-identity-scan.js";
import { createReferenceParityEvaluator } from "./helpers/reference-parity.js";

const benchmark = JSON.parse(readFileSync(
  new URL("../reference/stats/cards.json", import.meta.url),
  "utf8",
));

const MECHANIC_FIELDS = [
  ["cost", "elixir_cost", (value) => value],
  ["kind", "type", (value) => value === "troop" ? "unit" : value],
  ["rarity", "rarity", (value) => value === "rare" ? "uncommon" : value],
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
  [
    "targetMode",
    "targets",
    (value) => value === "buildings" ? "structures" : value,
  ],
  ["count", "count", (value) => value],
  [
    "areaDamageRadiusMillitiles",
    "area_damage_radius_tiles",
    (value) => value === null ? null : value * 1000,
  ],
];

const evaluateReferenceParity = createReferenceParityEvaluator(
  benchmark.cards,
  MECHANIC_FIELDS,
  ["giant"],
);

function attacks(encounter) {
  return encounter.replay.filter(({ type }) => type === "attack");
}

test("structure seeker content: exact original definition is isolated", () => {
  const first = createStructureSeekerCatalog();
  assert.deepEqual(first, [
    {
      areaDamageRadiusMillitiles: null,
      components: [],
      cost: 5,
      count: 1,
      damage: 254,
      deployTimeTicks: 60,
      displayName: "Stonehauler",
      firstHitTicks: 60,
      hitSpeedTicks: 90,
      hitpoints: 4091,
      id: "stonehauler",
      kind: "unit",
      movementMillitilesPerSecond: 750,
      rangeMillitiles: 1200,
      rarity: "uncommon",
      sightRangeMillitiles: 7500,
      targetMode: "structures",
    },
  ]);
  first[0].damage = 1;
  const second = createStructureSeekerCatalog();
  assert.equal(second[0].damage, 254);
  assert.notStrictEqual(first[0], second[0]);
});

test("structure seeker content: field parity distinguishes questions", (context) => {
  const card = createStructureSeekerCatalog()[0];
  const report = evaluateReferenceParity(card, "giant");
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

test("structure seeker content: authoritative mismatches fail and mechanics ask", () => {
  const identityMutation = createStructureSeekerCatalog()[0];
  identityMutation.cost = 6;
  assert.deepEqual(
    evaluateReferenceParity(identityMutation, "giant").authoritativeFailures
      .map(({ runtimeField }) => runtimeField),
    ["cost"],
  );

  const mechanicMutation = createStructureSeekerCatalog()[0];
  mechanicMutation.damage += 1;
  const report = evaluateReferenceParity(mechanicMutation, "giant");
  assert.deepEqual(report.authoritativeFailures, []);
  assert.deepEqual(
    report.questions.filter(({ disposition }) => disposition === "question")
      .map(({ runtimeField }) => runtimeField),
    ["damage"],
  );
});

test("structure seeker content: shipped source has only original identity", () => {
  const source = readFileSync(
    new URL("../src/content/cards/structure-seeker.js", import.meta.url),
    "utf8",
  );
  const protectedTokens = new Set(
    benchmark.cards.flatMap(({ key, name }) => [
      key.toLowerCase(),
      name.toLowerCase(),
    ]),
  );
  assert.deepEqual(protectedIdentityHits(source, protectedTokens), []);
  assert.doesNotMatch(source, /\breference\b/u);
  assert.doesNotMatch(source, /readFile|cards\.json/u);
});

test("structure seeker encounter: path is exact and troop decoy is ignored", () => {
  const encounter = new StructureSeekerEncounter();
  assert.deepEqual(
    encounter.route.map(({ y }) => y),
    [11500, 12500, 13500, 14500, 15500, 16500, 17500, 18500],
  );
  const first = encounter.step();
  assert.deepEqual(first, [
    { targetId: 301, tick: 0, type: "target-acquired" },
  ]);
  assert.equal(encounter.state.targetId, 301);
  assert.equal(encounter.state.phase, "deploying");
});

test("structure seeker encounter: movement, reach, and first hit boundaries are exact", () => {
  const encounter = new StructureSeekerEncounter();
  encounter.stepMany(523);
  assert.deepEqual(encounter.state.position, { x: 3500, y: 17287 });
  assert.equal(encounter.state.phase, "moving");

  const reachEvents = encounter.step();
  assert.deepEqual(reachEvents, [
    { position: { x: 3500, y: 17300 }, tick: 523, type: "move" },
    {
      position: { x: 3500, y: 17300 },
      targetId: 301,
      tick: 523,
      type: "reached",
    },
  ]);
  assert.equal(encounter.state.phase, "winding");
  assert.equal(encounter.state.attack.nextAttackTick, 583);

  encounter.stepMany(59);
  assert.deepEqual(attacks(encounter), []);
  const hit = encounter.step();
  assert.deepEqual(hit, [
    {
      amount: 254,
      currentHealth: 746,
      sequence: 1,
      targetId: 301,
      tick: 583,
      type: "attack",
    },
  ]);
  assert.equal(encounter.state.targetHealth.currentHealth, 746);
  assert.equal(encounter.state.attack.nextAttackTick, 673);
});

test("structure seeker encounter: reversed candidates are byte deterministic", () => {
  const fresh = new StructureSeekerEncounter();
  const reversed = new StructureSeekerEncounter(
    createStructureSeekerFixture(true),
  );
  fresh.stepMany(700);
  reversed.stepMany(700);
  assert.deepEqual(reversed.state, fresh.state);
  assert.deepEqual(reversed.replay, fresh.replay);
  assert.equal(reversed.serialize(), fresh.serialize());
  assert.equal(reversed.state.targetId, 301);
});

test("structure seeker encounter: chunking and causal restore are byte exact", () => {
  const oneByOne = new StructureSeekerEncounter();
  for (let tick = 0; tick < 700; tick += 1) oneByOne.step();

  const chunked = new StructureSeekerEncounter();
  chunked.stepMany(700);
  assert.equal(chunked.serialize(), oneByOne.serialize());
  assert.deepEqual(chunked.state, oneByOne.state);
  assert.deepEqual(chunked.replay, oneByOne.replay);

  const restored = StructureSeekerEncounter.restore(chunked.serialize());
  assert.equal(restored.serialize(), chunked.serialize());
  assert.deepEqual(restored.state, chunked.state);
  assert.deepEqual(restored.replay, chunked.replay);

  oneByOne.run();
  restored.run();
  assert.equal(restored.serialize(), oneByOne.serialize());
  assert.deepEqual(restored.state, oneByOne.state);
  assert.deepEqual(restored.replay, oneByOne.replay);
});

test("structure seeker encounter: lethal cadence and terminal behavior are defined", () => {
  const encounter = new StructureSeekerEncounter();
  const result = encounter.run();
  assert.deepEqual(
    attacks(encounter).map(({ currentHealth, tick }) => ({
      currentHealth,
      tick,
    })),
    [
      { currentHealth: 746, tick: 583 },
      { currentHealth: 492, tick: 673 },
      { currentHealth: 238, tick: 763 },
      { currentHealth: 0, tick: 853 },
    ],
  );
  assert.equal(result.tick, 854);
  assert.equal(result.phase, "terminal");
  assert.equal(result.terminal, true);
  assert.equal(result.attack.nextAttackTick, 943);
  const terminalSnapshot = encounter.serialize();
  assert.deepEqual(encounter.step(), []);
  assert.deepEqual(encounter.stepMany(100), []);
  assert.equal(encounter.serialize(), terminalSnapshot);
});

test("structure seeker encounter: bounded fixtures select nearest with stable IDs", () => {
  const fixture = createStructureSeekerFixture();
  fixture.seeker.id = 777;
  fixture.seeker.position = { x: 4500, y: 11500 };
  fixture.candidates = [
    {
      alive: true,
      hitpoints: 700,
      id: 44,
      kind: "structure",
      layer: "ground",
      position: { x: 3500, y: 17500 },
      radius: 0,
      targetable: true,
    },
    {
      alive: true,
      hitpoints: 700,
      id: 22,
      kind: "structure",
      layer: "ground",
      position: { x: 5500, y: 17500 },
      radius: 0,
      targetable: true,
    },
  ];

  const forward = new StructureSeekerEncounter(fixture);
  const reversedFixture = structuredClone(fixture);
  reversedFixture.candidates.reverse();
  const reversed = new StructureSeekerEncounter(reversedFixture);
  assert.deepEqual(forward.step(), [
    { targetId: 22, tick: 0, type: "target-acquired" },
  ]);
  reversed.step();
  assert.equal(reversed.serialize(), forward.serialize());
  assert.deepEqual(reversed.route, forward.route);
  assert.deepEqual(reversed.replay, forward.replay);
  assert.deepEqual(forward.route.at(0), { x: 4500, y: 11500 });
  assert.deepEqual(forward.route.at(-1), { x: 5500, y: 17500 });
  forward.run();
  reversed.run();
  assert.deepEqual(
    attacks(forward).map(({ targetId, tick }) => ({ targetId, tick })),
    [
      { targetId: 22, tick: 743 },
      { targetId: 22, tick: 833 },
    ],
  );
  assert.deepEqual(forward.state.position, { x: 4300, y: 17500 });
  assert.equal(reversed.serialize(), forward.serialize());
  assert.deepEqual(reversed.replay, forward.replay);
});

test("structure seeker encounter: ineligible candidates filter and no target is inert", () => {
  const fixture = createStructureSeekerFixture();
  fixture.candidates = [
    {
      alive: false,
      hitpoints: 100,
      id: 10,
      kind: "structure",
      layer: "ground",
      position: { x: 3500, y: 12500 },
      radius: 0,
      targetable: true,
    },
    {
      alive: true,
      hitpoints: 100,
      id: 11,
      kind: "structure",
      layer: "ground",
      position: { x: 3500, y: 13500 },
      radius: 0,
      targetable: false,
    },
    {
      alive: true,
      hitpoints: 100,
      id: 12,
      kind: "structure",
      layer: "air",
      position: { x: 3500, y: 14500 },
      radius: 0,
      targetable: true,
    },
    {
      alive: true,
      hitpoints: null,
      id: 13,
      kind: "troop",
      layer: "ground",
      position: { x: 3500, y: 15500 },
      radius: 0,
      targetable: true,
    },
    {
      alive: true,
      hitpoints: 100,
      id: 14,
      kind: "structure",
      layer: "ground",
      position: { x: 3500, y: 19500 },
      radius: 0,
      targetable: true,
    },
  ];
  const encounter = new StructureSeekerEncounter(fixture);
  assert.equal(encounter.route, null);
  assert.deepEqual(encounter.stepMany(61), []);
  assert.equal(encounter.state.targetId, null);
  assert.equal(encounter.state.phase, "inert");
  encounter.run();
  assert.equal(encounter.state.tick, 854);
  assert.deepEqual(encounter.step(), []);
  assert.throws(() => encounter.run(855), /tick limit/u);
});

test("structure seeker encounter: sight and reach include their exact boundaries", () => {
  const sightFixture = createStructureSeekerFixture();
  sightFixture.candidates = [{
    alive: true,
    hitpoints: 1000,
    id: 501,
    kind: "structure",
    layer: "ground",
    position: { x: 3500, y: 19500 },
    radius: 500,
    targetable: true,
  }];
  const sight = new StructureSeekerEncounter(sightFixture);
  assert.deepEqual(sight.step(), [
    { targetId: 501, tick: 0, type: "target-acquired" },
  ]);

  const outsideFixture = structuredClone(sightFixture);
  outsideFixture.candidates[0].radius = 499;
  const outside = new StructureSeekerEncounter(outsideFixture);
  outside.stepMany(61);
  assert.equal(outside.state.targetId, null);
  assert.equal(outside.state.phase, "inert");

  const reachFixture = createStructureSeekerFixture();
  reachFixture.candidates = [{
    alive: true,
    hitpoints: 1000,
    id: 502,
    kind: "structure",
    layer: "ground",
    position: { x: 3500, y: 13500 },
    radius: 800,
    targetable: true,
  }];
  const reach = new StructureSeekerEncounter(reachFixture);
  reach.stepMany(121);
  assert.deepEqual(attacks(reach), [{
    amount: 254,
    currentHealth: 746,
    sequence: 1,
    targetId: 502,
    tick: 120,
    type: "attack",
  }]);
  assert.deepEqual(reach.state.position, reachFixture.seeker.position);
});

test("structure seeker encounter: setup rejects hostile shapes and overflow", () => {
  const mutations = [
    (fixture) => { fixture.seeker.damage = 1; },
    (fixture) => { fixture.seeker.id = Number.MAX_SAFE_INTEGER + 1; },
    (fixture) => { fixture.seeker.position.x = 18500; },
    (fixture) => { fixture.seeker.position.y = 11501; },
    (fixture) => { fixture.candidates[0].hitpoints = 1; },
    (fixture) => { fixture.candidates[1].hitpoints = 1_000_001; },
    (fixture) => { fixture.candidates[1].radius = 5001; },
    (fixture) => { fixture.candidates[1].id = fixture.seeker.id; },
    (fixture) => {
      fixture.candidates = Array.from(
        { length: 9 },
        () => structuredClone(fixture.candidates[1]),
      );
    },
    (fixture) => { fixture.extra = true; },
  ];
  for (const mutate of mutations) {
    const fixture = createStructureSeekerFixture();
    mutate(fixture);
    assert.throws(() => new StructureSeekerEncounter(fixture));
  }

  const sparse = createStructureSeekerFixture();
  delete sparse.candidates[1];
  assert.throws(() => new StructureSeekerEncounter(sparse), /dense/u);

  const getter = createStructureSeekerFixture();
  Object.defineProperty(getter.seeker.position, "y", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  assert.throws(
    () => new StructureSeekerEncounter(getter),
    /invalid shape|data/u,
  );
});

test("structure seeker encounter: snapshots causally restore configurable fixtures", () => {
  const fixture = createStructureSeekerFixture();
  fixture.seeker.id = 999;
  fixture.candidates[1].id = 401;
  fixture.candidates[2].id = 402;
  const encounter = new StructureSeekerEncounter(fixture);
  encounter.stepMany(600);
  const restored = StructureSeekerEncounter.restore(encounter.serialize());
  assert.equal(restored.serialize(), encounter.serialize());
  assert.deepEqual(restored.state, encounter.state);
  assert.deepEqual(restored.replay, encounter.replay);

  const snapshot = JSON.parse(encounter.serialize());
  for (const mutate of [
    (value) => { value.tick = 855; },
    (value) => { value.tick = -1; },
    (value) => { value.version = 2; },
    (value) => { value.extra = true; },
    (value) => { value.identity.seeker.damage = 1; },
    (value) => { value.identity.candidates.length = 9; },
  ]) {
    const hostile = structuredClone(snapshot);
    mutate(hostile);
    assert.throws(
      () => StructureSeekerEncounter.restore(JSON.stringify(hostile)),
    );
  }
  assert.throws(
    () => StructureSeekerEncounter.restore(" ".repeat(8193)),
    /size bound/u,
  );
  assert.throws(() => StructureSeekerEncounter.restore(null));
  assert.throws(() => StructureSeekerEncounter.restore("{"));
});
