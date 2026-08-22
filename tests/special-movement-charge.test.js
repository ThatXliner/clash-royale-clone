import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ChargeSpecialEncounter,
  createChargeQuestionFixture,
  createChargeSpecialCatalog,
  createChargeSpecialFixture,
  evaluateChargeQuestionBoundary,
} from "../src/content/index.js";
import { protectedIdentityHits } from "./helpers/protected-identity-scan.js";
import { createReferenceParityEvaluator } from "./helpers/reference-parity.js";

const benchmark = JSON.parse(readFileSync(
  new URL("../reference/stats/cards.json", import.meta.url),
  "utf8",
));

const FIELDS = [
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
  ["movementMillitilesPerSecond", "movement_speed_tiles_per_second",
    (value) => value * 1000],
  ["targetMode", "targets", (value) => value],
  ["count", "count", (value) => value],
  ["areaDamageRadiusMillitiles", "area_damage_radius_tiles",
    (value) => value === null ? null : value * 1000],
];

const parity = createReferenceParityEvaluator(
  benchmark.cards,
  FIELDS,
  ["prince"],
);

function events(encounter, type) {
  return encounter.replay.filter((event) => event.type === type);
}

test("charge special: question fixture is explicit and isolated", () => {
  const fixture = createChargeQuestionFixture();
  assert.deepEqual(fixture, {
    armDistanceMillitiles: 3500,
    authoritative: false,
    bonusDamage: 392,
    chargedMovementMillitilesPerSecond: 2000,
    confidence: "unverified",
    disposition: "question",
    provenance: {
      armDistanceMillitiles: {
        confidence: "unverified",
        disposition: "question",
        source: "unsourced-special-mechanic-fixture",
      },
      bonusDamage: {
        confidence: "unverified",
        disposition: "question",
        source: "unsourced-special-mechanic-fixture",
      },
      chargedMovementMillitilesPerSecond: {
        confidence: "unverified",
        disposition: "question",
        source: "unsourced-special-mechanic-fixture",
      },
    },
    source: "unsourced-special-mechanic-fixture",
  });

  assert.equal(Object.isFrozen(fixture), true);
  assert.equal(Object.isFrozen(fixture.provenance), true);
  assert.equal(Object.isFrozen(fixture.provenance.bonusDamage), true);
  assert.deepEqual(createChargeQuestionFixture(), {
    armDistanceMillitiles: 3500,
    authoritative: false,
    bonusDamage: 392,
    chargedMovementMillitilesPerSecond: 2000,
    confidence: "unverified",
    disposition: "question",
    provenance: {
      armDistanceMillitiles: {
        confidence: "unverified",
        disposition: "question",
        source: "unsourced-special-mechanic-fixture",
      },
      bonusDamage: {
        confidence: "unverified",
        disposition: "question",
        source: "unsourced-special-mechanic-fixture",
      },
      chargedMovementMillitilesPerSecond: {
        confidence: "unverified",
        disposition: "question",
        source: "unsourced-special-mechanic-fixture",
      },
    },
    source: "unsourced-special-mechanic-fixture",
  });
  assert.deepEqual(evaluateChargeQuestionBoundary(3500), {
    armed: true,
    movementMillitilesPerSecond: 2000,
    strike: { amount: 784, baseAmount: 392, bonusAmount: 392 },
  });
  const encounter = new ChargeSpecialEncounter();
  encounter.stepMany(270);
  assert.equal(encounter.state.movement.speed, 2000);
  assert.throws(
    () => createChargeQuestionFixture({ armDistanceMillitiles: 0 }),
    /does not accept overrides/u,
  );
});

test("charge special: question boundary is executable and canonical", () => {
  assert.deepEqual(evaluateChargeQuestionBoundary(3499), {
    armed: false,
    movementMillitilesPerSecond: 1000,
    strike: { amount: 392, baseAmount: 392, bonusAmount: 0 },
  });
  for (const distance of [3500, 3501]) {
    assert.deepEqual(evaluateChargeQuestionBoundary(distance), {
      armed: true,
      movementMillitilesPerSecond: 2000,
      strike: { amount: 784, baseAmount: 392, bonusAmount: 392 },
    });
  }
  for (const hostile of [-1, 1.5, NaN, Infinity, "3500", 3500n, null]) {
    assert.throws(() => evaluateChargeQuestionBoundary(hostile));
  }
  assert.throws(
    () => evaluateChargeQuestionBoundary(3500, {
      chargedMovementMillitilesPerSecond: 1,
    }),
    /one non-negative safe integer/u,
  );
  let getterCalls = 0;
  const getter = {};
  Object.defineProperty(getter, "valueOf", {
    get() {
      getterCalls += 1;
      throw new Error("must not execute");
    },
  });
  assert.throws(() => evaluateChargeQuestionBoundary(getter));
  assert.equal(getterCalls, 0);

  const returned = evaluateChargeQuestionBoundary(3500);
  returned.strike.bonusAmount = 0;
  returned.movementMillitilesPerSecond = 0;
  assert.deepEqual(evaluateChargeQuestionBoundary(3500), {
    armed: true,
    movementMillitilesPerSecond: 2000,
    strike: { amount: 784, baseAmount: 392, bonusAmount: 392 },
  });
});

test("charge special: original definition is isolated and question-backed", () => {
  const first = createChargeSpecialCatalog();
  assert.deepEqual(first, [{
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 5,
    count: 1,
    damage: 392,
    deployTimeTicks: 60,
    displayName: "Emberlance",
    firstHitTicks: 54,
    hitSpeedTicks: 84,
    hitpoints: 1920,
    id: "emberlance",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 1600,
    rarity: "special",
    sightRangeMillitiles: 5500,
    targetMode: "ground",
  }]);
  first[0].damage = 1;
  assert.equal(createChargeSpecialCatalog()[0].damage, 392);

  const report = parity(createChargeSpecialCatalog()[0], "prince");
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
});

test("charge special: shipped source keeps original identity and explicit scope", () => {
  const source = readFileSync(
    new URL("../src/content/cards/special-movement-charge.js", import.meta.url),
    "utf8",
  );
  const protectedTokens = new Set(
    benchmark.cards.flatMap(({ key, name }) => [
      key.toLowerCase(),
      name.toLowerCase(),
    ]),
  );
  assert.deepEqual(protectedIdentityHits(source, protectedTokens), []);
  assert.doesNotMatch(source, /readFile|cards\.json/u);
  for (const nonClaim of [
    "QUESTION_FIXTURE",
    "collision",
    "crowd",
    "knockback",
    "animation",
    "other units",
    "dashes",
    "jumps",
    "recoil",
    "footage",
    "untargetability",
  ]) {
    assert.match(source, new RegExp(nonClaim, "u"));
  }
});

test("charge special: fixed route and deploy boundaries are exact", () => {
  const encounter = new ChargeSpecialEncounter();
  assert.deepEqual(encounter.route.map(({ y }) => y), [
    11500, 12500, 13500, 14500, 15500, 16500, 17500, 18500,
  ]);
  encounter.stepMany(60);
  assert.deepEqual(events(encounter, "move"), []);
  assert.deepEqual(encounter.state.position, { x: 3500, y: 11500 });
  assert.deepEqual(encounter.step(), [
    { position: { x: 3500, y: 11516 }, tick: 60, type: "move" },
  ]);
});

test("charge special: charge arm, speed, reach, and strike trace is exact", () => {
  const encounter = new ChargeSpecialEncounter();
  encounter.stepMany(269);
  assert.deepEqual(encounter.state.position, { x: 3500, y: 14983 });
  assert.equal(encounter.state.chargeProgressMillitiles, 3483);
  assert.equal(encounter.state.charged, false);

  assert.deepEqual(encounter.step(), [
    { position: { x: 3500, y: 15000 }, tick: 269, type: "move" },
    {
      distanceMillitiles: 3500,
      tick: 269,
      type: "charge-armed",
    },
  ]);
  assert.equal(encounter.state.movement.speed, 2000);
  assert.deepEqual(encounter.step(), [
    { position: { x: 3500, y: 15033 }, tick: 270, type: "move" },
  ]);

  encounter.stepMany(55);
  assert.deepEqual(encounter.step(), [
    { position: { x: 3500, y: 16900 }, tick: 326, type: "move" },
    {
      position: { x: 3500, y: 16900 },
      targetId: 202,
      tick: 326,
      type: "reached",
    },
  ]);
  assert.equal(encounter.state.attack.nextAttackTick, 380);
  encounter.stepMany(53);
  assert.deepEqual(events(encounter, "attack"), []);
  assert.deepEqual(encounter.step(), [
    {
      amount: 784,
      baseAmount: 392,
      bonusAmount: 392,
      charged: true,
      currentHealth: 4216,
      sequence: 1,
      targetId: 202,
      tick: 380,
      type: "attack",
    },
    { tick: 380, type: "charge-consumed" },
    { tick: 380, type: "encounter-complete" },
  ]);
  assert.equal(encounter.state.charged, false);
  assert.equal(encounter.state.chargeProgressMillitiles, 0);
  assert.equal(encounter.state.movement.speed, 1000);
  assert.equal(encounter.state.terminal, true);
});

test("charge special: target loss is processed before movement and resets", () => {
  const encounter = new ChargeSpecialEncounter(createChargeSpecialFixture([
    { tick: 100, type: "target-lost" },
    { tick: 103, type: "target-acquired" },
  ]));
  encounter.stepMany(100);
  const prior = encounter.state.position;
  assert.deepEqual(encounter.step(), [
    { targetId: null, tick: 100, type: "target-lost" },
    { tick: 100, type: "charge-reset" },
  ]);
  assert.deepEqual(encounter.state.position, prior);
  assert.equal(encounter.state.chargeProgressMillitiles, 0);
  assert.equal(encounter.state.charged, false);
  assert.deepEqual(encounter.step(), []);
  assert.deepEqual(encounter.step(), []);
  assert.deepEqual(encounter.step(), [
    { targetId: 202, tick: 103, type: "target-acquired" },
    { position: { x: 3500, y: prior.y + 16 }, tick: 103, type: "move" },
  ]);
  assert.equal(encounter.state.chargeProgressMillitiles, 16);
});

test("charge special: armed interruption resets speed and uninterrupted distance", () => {
  const encounter = new ChargeSpecialEncounter(createChargeSpecialFixture([
    { tick: 300, type: "target-lost" },
    { tick: 301, type: "target-acquired" },
  ]));
  encounter.stepMany(300);
  assert.equal(encounter.state.charged, true);
  const prior = encounter.state.position;
  assert.deepEqual(encounter.step(), [
    { targetId: null, tick: 300, type: "target-lost" },
    { tick: 300, type: "charge-reset" },
  ]);
  assert.deepEqual(encounter.state.position, prior);
  assert.equal(encounter.state.movement.speed, 0);
  encounter.step();
  assert.equal(encounter.state.movement.speed, 1000);
  assert.equal(encounter.state.chargeProgressMillitiles, 16);
  assert.equal(encounter.state.charged, false);
});

test("charge special: chunk, fresh execution, and causal restore are byte exact", () => {
  const commands = [
    { tick: 100, type: "target-lost" },
    { tick: 103, type: "target-acquired" },
  ];
  const one = new ChargeSpecialEncounter(createChargeSpecialFixture(commands));
  for (let tick = 0; tick < 250; tick += 1) one.step();
  const chunk = new ChargeSpecialEncounter(createChargeSpecialFixture(commands));
  chunk.stepMany(250);
  assert.equal(chunk.serialize(), one.serialize());
  assert.deepEqual(chunk.state, one.state);
  assert.deepEqual(chunk.replay, one.replay);

  const restored = ChargeSpecialEncounter.restore(chunk.serialize());
  assert.equal(restored.serialize(), chunk.serialize());
  assert.deepEqual(restored.state, chunk.state);
  assert.deepEqual(restored.replay, chunk.replay);
  one.run();
  restored.run();
  assert.equal(restored.serialize(), one.serialize());
  assert.deepEqual(restored.state, one.state);
  assert.deepEqual(restored.replay, one.replay);
});

test("charge special: fixture rejects hostile shapes and impossible commands", () => {
  for (const commands of [
    [{ tick: -1, type: "target-lost" }],
    [{ tick: 1000, type: "target-lost" }],
    [{ tick: 2, type: "target-acquired" }],
    [
      { tick: 2, type: "target-lost" },
      { tick: 2, type: "target-acquired" },
    ],
    [
      { tick: 3, type: "target-lost" },
      { tick: 2, type: "target-acquired" },
    ],
    [{ tick: 2, type: "jump" }],
    Array.from({ length: 33 }, (_, tick) => ({
      tick,
      type: tick % 2 === 0 ? "target-lost" : "target-acquired",
    })),
  ]) {
    assert.throws(() => createChargeSpecialFixture(commands));
  }
  const sparse = [{ tick: 2, type: "target-lost" }];
  delete sparse[0];
  assert.throws(() => createChargeSpecialFixture(sparse), /dense/u);
  const getter = [{ tick: 2, type: "target-lost" }];
  Object.defineProperty(getter[0], "tick", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  assert.throws(
    () => createChargeSpecialFixture(getter),
    /invalid shape|data/u,
  );
});

test("charge special: snapshots reject hostile shape, size, and noncausal time", () => {
  const encounter = new ChargeSpecialEncounter();
  encounter.stepMany(250);
  const snapshot = JSON.parse(encounter.serialize());
  for (const mutate of [
    (value) => { value.tick = -1; },
    (value) => { value.tick = 1001; },
    (value) => { value.version = 2; },
    (value) => { value.extra = true; },
    (value) => { value.identity.encounter = "forged"; },
    (value) => {
      value.identity.commands = [{ tick: 1, type: "target-acquired" }];
    },
  ]) {
    const hostile = structuredClone(snapshot);
    mutate(hostile);
    assert.throws(
      () => ChargeSpecialEncounter.restore(JSON.stringify(hostile)),
    );
  }
  assert.throws(
    () => ChargeSpecialEncounter.restore(" ".repeat(8193)),
    /size bound/u,
  );
  assert.throws(() => ChargeSpecialEncounter.restore(null));
  assert.throws(() => ChargeSpecialEncounter.restore("{"));

  const terminal = new ChargeSpecialEncounter();
  terminal.run();
  const postTerminal = JSON.parse(terminal.serialize());
  postTerminal.tick += 1;
  assert.throws(
    () => ChargeSpecialEncounter.restore(JSON.stringify(postTerminal)),
    /post-terminal/u,
  );
});

test("charge special: terminal state is stable and bounded", () => {
  const encounter = new ChargeSpecialEncounter();
  const result = encounter.run();
  assert.equal(result.tick, 381);
  assert.equal(result.terminal, true);
  const serialized = encounter.serialize();
  assert.deepEqual(encounter.step(), []);
  assert.deepEqual(encounter.stepMany(100), []);
  assert.equal(encounter.serialize(), serialized);
  assert.throws(() => encounter.run(1001), /tick limit/u);
});
