import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PierceEncounter,
  createPierceQuestionFixture,
  createPierceSpecialCatalog,
  createPierceSpecialFixture,
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
  ["rarity", "rarity", (value) => value === "legendary" ? "mythic" : value],
  ["hitpoints", "hitpoints", (value) => value],
  ["damage", "damage", (value) => value],
  ["hitSpeedTicks", "hit_speed_seconds", (value) => value * 60],
  ["firstHitTicks", "first_hit_seconds", (value) => value * 60],
  ["deployTimeTicks", "deploy_time_seconds", (value) => value * 60],
  ["rangeMillitiles", "range_tiles", (value) => value * 1000],
  ["sightRangeMillitiles", "sight_range_tiles", (value) => value * 1000],
  ["movementMillitilesPerSecond", "movement_speed_tiles_per_second",
    (value) => value * 1000],
  ["targetMode", "targets",
    (value) => value === "air_and_ground" ? "ground-and-air" : value],
  ["count", "count", (value) => value],
  ["areaDamageRadiusMillitiles", "area_damage_radius_tiles",
    (value) => value === null ? null : value * 1000],
];
const parity = createReferenceParityEvaluator(
  benchmark.cards,
  FIELDS,
  ["magic-archer"],
);

function candidate(
  id,
  x,
  {
    alive = true,
    kind = "troop",
    layer = "ground",
    maxHealth = 500,
    radius = 0,
    targetable = true,
    y = 4000,
  } = {},
) {
  return {
    alive,
    id,
    kind,
    layer,
    maxHealth,
    position: { x, y },
    radius,
    targetable,
  };
}

function run(candidates, aim = { x: 1, y: 0 }, commands = []) {
  const encounter = new PierceEncounter(
    createPierceSpecialFixture(candidates, aim, commands),
  );
  encounter.run();
  return encounter;
}

function hitIds(encounter) {
  return encounter.replay
    .filter(({ type }) => type === "pierce-hit")
    .map(({ targetId }) => targetId);
}

function resultOf(setup) {
  const encounter = new PierceEncounter(setup);
  encounter.run();
  return {
    replay: encounter.replay,
    snapshot: encounter.serialize(),
    state: encounter.state,
  };
}

test("pierce special: original definition maps only in tests to base fields", () => {
  const catalog = createPierceSpecialCatalog();
  assert.deepEqual(catalog, [{
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 4,
    count: 1,
    damage: 134,
    deployTimeTicks: 60,
    displayName: "Prism Warden",
    firstHitTicks: 36,
    hitSpeedTicks: 66,
    hitpoints: 532,
    id: "prism-warden",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 7000,
    rarity: "mythic",
    sightRangeMillitiles: 7500,
    targetMode: "ground-and-air",
  }]);
  catalog[0].damage = 1;
  assert.equal(createPierceSpecialCatalog()[0].damage, 134);

  const report = parity(createPierceSpecialCatalog()[0], "magic-archer");
  assert.deepEqual(report.authoritativeFailures, []);
  assert.ok(report.fields.every(({ disposition }) =>
    disposition === "match" || disposition === "question-backed-match"
  ));
  assert.deepEqual(
    report.fields.filter(({ disposition }) =>
      disposition === "question-backed-match"
    ).map(({ benchmarkField }) => benchmarkField).sort(),
    [
      "count",
      "damage",
      "deploy_time_seconds",
      "first_hit_seconds",
      "hit_speed_seconds",
      "hitpoints",
      "movement_speed_tiles_per_second",
      "range_tiles",
      "sight_range_tiles",
      "targets",
    ],
  );
});

test("pierce special: every absent number and policy is independently frozen", () => {
  const fixture = createPierceQuestionFixture();
  assert.deepEqual(
    Object.fromEntries(Object.entries(fixture).map(([key, record]) => [
      key,
      record.value,
    ])),
    {
      attackerDeathAfterLaunchRule: "launched-shot-continues",
      attackerDeathThroughLaunchRule: "cancels-launch",
      collisionGeometryRule:
        "static-directed-finite-segment-with-inclusive-start-cap-corridor-and-end-cap",
      corridorHalfWidthMillitiles: 250,
      damageApplicationRule:
        "one-full-base-damage-hit-per-eligible-intersection",
      eventOrderRule:
        "commands-then-launch-or-cancel;impact-hit-order-then-damage-order-then-id-sorted-deaths-then-complete",
      hitOrderRule: "forward-segment-parameter-then-stable-id",
      interruptionAfterLaunchRule: "launched-shot-continues",
      interruptionThroughLaunchRule: "cancels-launch",
      movingCollisionRule: "launch-time-position-snapshot",
      oneHitRule: "at-most-once-per-target",
      pierceLengthMillitiles: 11_000,
      projectionRule:
        "integer-endpoint-from-exact-integer-direction-magnitude",
      projectileSpeedMillitilesPerTick: 1000,
      sameBoundaryRule: "commands-resolve-before-launch-and-impact",
      targetDeathRule: "dead-before-impact-is-ineligible",
      targetEligibilityRule:
        "alive-targetable-ground-or-air-troops-and-structures",
    },
  );
  assert.ok(Object.isFrozen(fixture));
  for (const record of Object.values(fixture)) {
    assert.ok(Object.isFrozen(record));
    assert.deepEqual({
      authoritative: record.authoritative,
      confidence: record.confidence,
      disposition: record.disposition,
      source: record.source,
    }, {
      authoritative: false,
      confidence: "unverified",
      disposition: "question",
      source: "unsourced-linear-through-shot-fixture",
    });
  }
  const second = createPierceQuestionFixture();
  assert.notEqual(second, fixture);
  for (const key of Object.keys(fixture)) {
    assert.notEqual(second[key], fixture[key]);
  }
  assert.throws(() => {
    fixture.pierceLengthMillitiles.value = 1;
  }, TypeError);
  assert.throws(
    () => createPierceQuestionFixture({ pierceLengthMillitiles: 1 }),
    /does not accept overrides/u,
  );
});

test("pierce special: intersections resolve by forward parameter then ID", () => {
  const encounter = run([
    candidate(900, 10_000),
    candidate(300, 3000),
    candidate(400, 7000, { y: 4200 }),
    candidate(200, 7000, { y: 3800 }),
  ]);
  assert.deepEqual(hitIds(encounter), [300, 200, 400, 900]);
  assert.equal(new Set(hitIds(encounter)).size, 4);
  assert.deepEqual(
    encounter.replay.filter(({ type }) => type === "pierce-hit")
      .map(({ parameterNumerator }) => parameterNumerator),
    [
      "22000000",
      "66000000",
      "66000000",
      "99000000",
    ],
  );
});

test("pierce special: corridor edge is inclusive and one millitile misses", () => {
  const encounter = run([
    candidate(201, 6000, { y: 4250 }),
    candidate(202, 7000, { y: 4251 }),
    candidate(203, 8000, { radius: 100, y: 4350 }),
    candidate(204, 9000, { radius: 100, y: 4351 }),
  ]);
  assert.deepEqual(hitIds(encounter), [201, 203]);
});

test("pierce special: terminal cap edge is inclusive and one millitile misses", () => {
  const encounter = run([
    candidate(201, 12_250),
    candidate(202, 12_251),
    candidate(203, 12_350, { radius: 100 }),
    candidate(204, 12_351, { radius: 100 }),
  ]);
  assert.deepEqual(hitIds(encounter), [201, 203]);
});

test("pierce special: horizontal and vertical start caps are exact", () => {
  const horizontal = run([
    candidate(201, 750),
    candidate(202, 749),
    candidate(203, 650, { radius: 100 }),
    candidate(204, 649, { radius: 100 }),
  ]);
  assert.deepEqual(hitIds(horizontal), [203, 201]);
  assert.deepEqual(
    horizontal.replay.filter(({ type }) => type === "pierce-hit")
      .map(({ parameterNumerator }) => parameterNumerator),
    ["-3850000", "-2750000"],
  );

  const vertical = run([
    candidate(201, 1000, { y: 3750 }),
    candidate(202, 1000, { y: 3749 }),
    candidate(203, 1000, { radius: 100, y: 3650 }),
    candidate(204, 1000, { radius: 100, y: 3649 }),
  ], { x: 0, y: 1 });
  assert.deepEqual(hitIds(vertical), [203, 201]);
});

test("pierce special: signed-axis start caps are exact", () => {
  const negativeHorizontal = run([
    candidate(201, 1250),
    candidate(202, 1251),
    candidate(203, 1350, { radius: 100 }),
    candidate(204, 1351, { radius: 100 }),
  ], { x: -1, y: 0 });
  assert.deepEqual(hitIds(negativeHorizontal), [203, 201]);

  const negativeVertical = run([
    candidate(201, 1000, { y: 4250 }),
    candidate(202, 1000, { y: 4251 }),
    candidate(203, 1000, { radius: 100, y: 4350 }),
    candidate(204, 1000, { radius: 100, y: 4351 }),
  ], { x: 0, y: -1 });
  assert.deepEqual(hitIds(negativeVertical), [203, 201]);
});

test("pierce special: 3-4-5 signed diagonal start caps are exact", () => {
  for (const aim of [
    { x: 3, y: 4 },
    { x: 3, y: -4 },
    { x: -3, y: 4 },
    { x: -3, y: -4 },
  ]) {
    const tangentX = 1000 - aim.x * 50;
    const tangentY = 4000 - aim.y * 50;
    const wideTangentX = 1000 - aim.x * 70;
    const wideTangentY = 4000 - aim.y * 70;
    const oneMillitilePast = -Math.sign(aim.y);
    const encounter = run([
      candidate(201, tangentX, { y: tangentY }),
      candidate(202, tangentX, {
        y: tangentY + oneMillitilePast,
      }),
      candidate(203, wideTangentX, {
        radius: 100,
        y: wideTangentY,
      }),
      candidate(204, wideTangentX, {
        radius: 100,
        y: wideTangentY + oneMillitilePast,
      }),
    ], aim);
    assert.deepEqual(hitIds(encounter), [203, 201]);
  }
});

test("pierce special: parameter-zero transition uses the start cap", () => {
  const encounter = run([
    candidate(201, 1001, { y: 4250 }),
    candidate(202, 1000, { y: 4250 }),
    candidate(203, 999, { y: 4250 }),
    candidate(204, 750),
    candidate(205, 749),
    candidate(206, -251, { radius: 1000 }),
  ]);
  assert.deepEqual(hitIds(encounter), [204, 202, 201]);
});

test("pierce special: far behind and beyond-terminal candidates miss", () => {
  const encounter = run([
    candidate(201, 749),
    candidate(202, -251, { radius: 1000 }),
    candidate(203, 12_251),
    candidate(204, 20_000, { radius: 1000 }),
    candidate(205, 1000),
    candidate(206, 12_000),
  ]);
  assert.deepEqual(hitIds(encounter), [205, 206]);
});

test("pierce special: exact integer diagonal geometry is deterministic", () => {
  const encounter = run([
    candidate(201, 7600, { y: 12_800 }),
    candidate(202, 7600, { y: 13_050 }),
    candidate(203, 7600, { y: 13_051 }),
  ], { x: 3, y: 4 });
  assert.deepEqual(hitIds(encounter), [201, 202]);
  assert.deepEqual(
    encounter.replay.find(({ type }) => type === "pierce-launch").endpoint,
    { x: 7600, y: 12_800 },
  );
});

test("pierce special: ground, air, troop, and structure targets are eligible", () => {
  const encounter = run([
    candidate(201, 3000, { layer: "ground" }),
    candidate(202, 5000, { layer: "air" }),
    candidate(203, 7000, { kind: "structure", layer: "ground" }),
  ]);
  assert.deepEqual(hitIds(encounter), [201, 202, 203]);
});

test("pierce special: dead and untargetable candidates are filtered", () => {
  const encounter = run([
    candidate(201, 3000, { alive: false }),
    candidate(202, 5000, { targetable: false }),
    candidate(203, 7000),
  ]);
  assert.deepEqual(hitIds(encounter), [203]);
  assert.equal(
    encounter.state.candidates.find(({ id }) => id === 201).alive,
    false,
  );
  assert.equal(
    encounter.state.candidates.find(({ id }) => id === 202).hitpoints,
    500,
  );
});

test("pierce special: each target takes one full hit in one timing window", () => {
  const encounter = run([
    candidate(201, 3000, { maxHealth: 100 }),
    candidate(202, 5000, { maxHealth: 500 }),
    candidate(203, 7000, { maxHealth: 134 }),
  ]);
  assert.deepEqual(hitIds(encounter), [201, 202, 203]);
  assert.deepEqual(
    encounter.replay.filter(({ type }) => type === "pierce-damage")
      .map(({ amount, currentHealthAfter, targetId }) => ({
        amount,
        currentHealthAfter,
        targetId,
      })),
    [
      { amount: 134, currentHealthAfter: 0, targetId: 201 },
      { amount: 134, currentHealthAfter: 366, targetId: 202 },
      { amount: 134, currentHealthAfter: 0, targetId: 203 },
    ],
  );
  assert.deepEqual(
    encounter.replay.filter(({ type }) => type === "pierce-death")
      .map(({ targetId }) => targetId),
    [201, 203],
  );
});

test("pierce special: launch and impact timing use the speed question", () => {
  const encounter = run([candidate(201, 3000)]);
  const launch = encounter.replay.find(({ type }) => type === "pierce-launch");
  const hit = encounter.replay.find(({ type }) => type === "pierce-hit");
  assert.equal(launch.tick, 36);
  assert.equal(launch.impactTick, 47);
  assert.equal(hit.tick, 47);
});

test("pierce special: target death on the impact boundary resolves first", () => {
  const encounter = run(
    [candidate(201, 3000), candidate(202, 5000)],
    { x: 1, y: 0 },
    [{ targetId: 201, tick: 47, type: "kill-target" }],
  );
  assert.deepEqual(hitIds(encounter), [202]);
  assert.deepEqual(
    encounter.replay.filter(({ tick }) => tick === 47)
      .map(({ type }) => type),
    [
      "pierce-command",
      "external-damage",
      "external-death",
      "pierce-hit",
      "pierce-damage",
      "pierce-complete",
    ],
  );
});

test("pierce special: death through launch cancels, later death does not", () => {
  for (const tick of [0, 36]) {
    const encounter = run(
      [candidate(201, 3000)],
      { x: 1, y: 0 },
      [{ targetId: null, tick, type: "kill-attacker" }],
    );
    assert.deepEqual(hitIds(encounter), []);
    assert.equal(
      encounter.replay.find(({ type }) => type === "pierce-complete").reason,
      "launch-cancelled",
    );
  }
  const later = run(
    [candidate(201, 3000)],
    { x: 1, y: 0 },
    [{ targetId: null, tick: 37, type: "kill-attacker" }],
  );
  assert.deepEqual(hitIds(later), [201]);
  assert.equal(later.state.attackerAlive, false);
});

test("pierce special: interruption through launch cancels, later does not", () => {
  for (const tick of [0, 36]) {
    const encounter = run(
      [candidate(201, 3000)],
      { x: 1, y: 0 },
      [{ targetId: null, tick, type: "interrupt-attacker" }],
    );
    assert.deepEqual(hitIds(encounter), []);
    assert.equal(encounter.state.interrupted, true);
  }
  const later = run(
    [candidate(201, 3000)],
    { x: 1, y: 0 },
    [{ targetId: null, tick: 37, type: "interrupt-attacker" }],
  );
  assert.deepEqual(hitIds(later), [201]);
});

test("pierce special: same-boundary hit, damage, death order is explicit", () => {
  const encounter = run([
    candidate(900, 3000, { maxHealth: 1 }),
    candidate(200, 5000, { maxHealth: 1 }),
  ]);
  assert.deepEqual(
    encounter.replay.filter(({ tick }) => tick === 47)
      .map(({ type, targetId }) => ({ type, targetId: targetId ?? null })),
    [
      { targetId: 900, type: "pierce-hit" },
      { targetId: 200, type: "pierce-hit" },
      { targetId: 900, type: "pierce-damage" },
      { targetId: 200, type: "pierce-damage" },
      { targetId: 200, type: "pierce-death" },
      { targetId: 900, type: "pierce-death" },
      { targetId: null, type: "pierce-complete" },
    ],
  );
});

test("pierce special: launch-time geometry is isolated from later mutation", () => {
  const setup = createPierceSpecialFixture([candidate(201, 3000)]);
  const encounter = new PierceEncounter(setup);
  encounter.stepMany(37);
  setup.candidates[0].position.x = 20_000;
  setup.aim.x = -1;
  encounter.run();
  assert.deepEqual(hitIds(encounter), [201]);
});

test("pierce special: fresh and reordered inputs are byte-identical", () => {
  const candidates = [
    candidate(900, 9000),
    candidate(201, 3000),
    candidate(500, 6000),
  ];
  const first = resultOf(createPierceSpecialFixture(candidates));
  const second = resultOf(createPierceSpecialFixture(candidates));
  const reordered = resultOf(createPierceSpecialFixture(
    [...candidates].reverse(),
  ));
  assert.deepEqual(second, first);
  assert.deepEqual(reordered, first);
  assert.equal(JSON.stringify(second), JSON.stringify(first));
  assert.equal(JSON.stringify(reordered), JSON.stringify(first));
});

test("pierce special: arbitrary chunks preserve all observable bytes", () => {
  const setup = createPierceSpecialFixture(
    [candidate(201, 3000), candidate(202, 6000)],
    { x: 1, y: 0 },
    [{ targetId: null, tick: 37, type: "interrupt-attacker" }],
  );
  const expected = resultOf(setup);
  const chunked = new PierceEncounter(setup);
  for (const chunk of [1, 7, 13, 16, 3, 8, 99]) {
    chunked.stepMany(chunk);
  }
  chunked.run();
  assert.deepEqual({
    replay: chunked.replay,
    snapshot: chunked.serialize(),
    state: chunked.state,
  }, expected);
});

test("pierce special: every-tick causal restore is byte-identical", () => {
  const setup = createPierceSpecialFixture(
    [
      candidate(900, 3000, { maxHealth: 1 }),
      candidate(200, 5000, { maxHealth: 1 }),
      candidate(300, 7000),
    ],
    { x: 1, y: 0 },
    [{ targetId: null, tick: 37, type: "kill-attacker" }],
  );
  const expected = resultOf(setup);
  for (let split = 0; split <= expected.state.tick; split += 1) {
    const partial = new PierceEncounter(setup);
    partial.stepMany(split);
    const restored = PierceEncounter.restore(partial.serialize());
    partial.run();
    restored.run();
    const actual = {
      replay: restored.replay,
      snapshot: restored.serialize(),
      state: restored.state,
    };
    assert.deepEqual(actual, expected, `restore split ${split}`);
    assert.deepEqual(actual, {
      replay: partial.replay,
      snapshot: partial.serialize(),
      state: partial.state,
    }, `partial split ${split}`);
    assert.equal(JSON.stringify(actual), JSON.stringify(expected));
  }
});

test("pierce special: invalid vectors and unsafe arithmetic fail closed", () => {
  const valid = [candidate(201, 3000)];
  for (const aim of [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 5, y: 12 },
    { x: Number.MAX_SAFE_INTEGER, y: 0 },
    { x: 1.5, y: 0 },
  ]) {
    assert.throws(() => createPierceSpecialFixture(valid, aim));
  }
  for (const candidates of [
    [candidate(201, Number.MAX_SAFE_INTEGER)],
    [candidate(201, 3000, { radius: Number.MAX_SAFE_INTEGER })],
    [candidate(201, 3000, { maxHealth: Number.MAX_SAFE_INTEGER + 1 })],
  ]) {
    assert.throws(() => createPierceSpecialFixture(candidates));
  }
});

test("pierce special: hostile data is rejected without invoking getters", () => {
  let getterCalls = 0;
  const accessor = candidate(201, 3000);
  Object.defineProperty(accessor.position, "x", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 3000;
    },
  });
  assert.throws(
    () => createPierceSpecialFixture([accessor]),
    /data property|invalid shape/u,
  );
  assert.equal(getterCalls, 0);

  const aimAccessor = { x: 1, y: 0 };
  Object.defineProperty(aimAccessor, "x", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 1;
    },
  });
  assert.throws(
    () => createPierceSpecialFixture([candidate(201, 3000)], aimAccessor),
    /invalid shape/u,
  );
  assert.equal(getterCalls, 0);

  const foreign = Object.create({ inherited: true });
  Object.assign(foreign, candidate(201, 3000));
  assert.throws(
    () => createPierceSpecialFixture([foreign]),
    /plain object/u,
  );
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => createPierceSpecialFixture(sparse), /dense/u);
  const extraArray = [candidate(201, 3000)];
  extraArray.extra = true;
  assert.throws(() => createPierceSpecialFixture(extraArray), /dense/u);

  for (const candidates of [
    new Array(33).fill(null).map((_, index) =>
      candidate(200 + index, 3000 + index)
    ),
    [candidate(101, 3000)],
    [candidate(201, 3000), candidate(201, 5000)],
    [{ ...candidate(201, 3000), extra: true }],
  ]) {
    assert.throws(() => createPierceSpecialFixture(candidates));
  }
});

test("pierce special: command, execution, output, and replay bounds hold", () => {
  const valid = [candidate(201, 3000)];
  for (const commands of [
    new Array(17).fill(null).map((_, tick) => ({
      targetId: null,
      tick,
      type: "interrupt-attacker",
    })),
    [{ targetId: null, tick: -1, type: "kill-attacker" }],
    [{ targetId: null, tick: 48, type: "kill-attacker" }],
    [{ targetId: 999, tick: 1, type: "kill-target" }],
    [{ targetId: 201, tick: 1, type: "kill-attacker" }],
    [{ targetId: null, tick: 1, type: "kill-target" }],
    [{ targetId: null, tick: 1, type: "unknown" }],
    [{ extra: true, targetId: null, tick: 1, type: "kill-attacker" }],
  ]) {
    assert.throws(() =>
      createPierceSpecialFixture(valid, { x: 1, y: 0 }, commands)
    );
  }
  assert.throws(
    () => createPierceSpecialFixture(valid, { x: 1, y: 0 }, [], "extra"),
    /extra arguments/u,
  );

  const encounter = new PierceEncounter();
  encounter.run();
  const replay = encounter.replay;
  const state = encounter.state;
  replay.length = 0;
  state.candidates[0].hitpoints = 999;
  assert.ok(encounter.replay.length > 0);
  assert.equal(encounter.state.candidates[0].hitpoints, 366);
  assert.ok(encounter.replay.length <= 128);
  assert.throws(() => encounter.stepMany(-1));
  assert.throws(() => encounter.run(49), /exceeds its bound/u);
});

test("pierce special: snapshots reject oversized, extra, and non-causal data", () => {
  const encounter = new PierceEncounter();
  encounter.stepMany(37);
  const canonical = encounter.serialize();
  assert.equal(PierceEncounter.restore(canonical).serialize(), canonical);
  const raw = JSON.parse(canonical);
  for (const serialized of [
    "no",
    "{}",
    JSON.stringify({ ...raw, version: 2 }),
    JSON.stringify({ ...raw, tick: -1 }),
    JSON.stringify({ ...raw, tick: 49 }),
    JSON.stringify({ ...raw, extra: true }),
    JSON.stringify({ ...raw, identity: { ...raw.identity, extra: true } }),
    JSON.stringify({
      ...raw,
      identity: { ...raw.identity, aim: { x: 1, y: 1 } },
    }),
    JSON.stringify({
      ...raw,
      identity: {
        ...raw.identity,
        commands: [{
          extra: true,
          targetId: null,
          tick: 1,
          type: "kill-attacker",
        }],
      },
    }),
    " ".repeat(65_537),
  ]) {
    assert.throws(() => PierceEncounter.restore(serialized));
  }
  assert.throws(() => PierceEncounter.restore({}), /must be a string/u);

  const cancelled = new PierceEncounter(createPierceSpecialFixture(
    [candidate(201, 3000)],
    { x: 1, y: 0 },
    [{ targetId: null, tick: 0, type: "kill-attacker" }],
  ));
  cancelled.run();
  const postTerminal = JSON.parse(cancelled.serialize());
  postTerminal.tick += 1;
  assert.throws(
    () => PierceEncounter.restore(JSON.stringify(postTerminal)),
    /post-terminal time/u,
  );
});

test("pierce special: shipped source has original identity and non-claims", () => {
  const source = readFileSync(
    new URL(
      "../src/content/cards/special-projectiles-pierce.js",
      import.meta.url,
    ),
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
    "not an authoritative",
    "collision-geometry",
    "length",
    "width",
    "speed",
    "moving-collision",
    "simultaneous-event",
    "interruption",
    "death",
    "obstacle",
    "projectile-height",
    "animation",
    "visual",
    "audio",
    "full-match",
  ]) {
    assert.match(source, new RegExp(nonClaim, "u"));
  }
});
