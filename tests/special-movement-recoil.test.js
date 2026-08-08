import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  RecoilEncounter,
  createRecoilQuestionFixture,
  createRecoilSpecialCatalog,
  createRecoilSpecialFixture,
  evaluateRecoilQuestionBoundary,
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
  ["rarity", "rarity", (value) => value === "common" ? "standard" : value],
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
  ["firecracker"],
);

function eventsOf(encounter, type) {
  return encounter.replay.filter((event) => event.type === type);
}

function runFresh(commands = [], scenario = "open") {
  const encounter = new RecoilEncounter(
    createRecoilSpecialFixture(commands, scenario),
  );
  encounter.run();
  return {
    replay: encounter.replay,
    snapshot: encounter.serialize(),
    state: encounter.state,
  };
}

test("recoil special: original definition maps to the test-only benchmark", () => {
  const first = createRecoilSpecialCatalog();
  assert.deepEqual(first, [{
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 3,
    count: 1,
    damage: null,
    deployTimeTicks: 60,
    displayName: "Cinderback",
    firstHitTicks: 144,
    hitSpeedTicks: 180,
    hitpoints: 304,
    id: "cinderback",
    kind: "unit",
    movementMillitilesPerSecond: 1500,
    rangeMillitiles: 6000,
    rarity: "standard",
    sightRangeMillitiles: 8500,
    targetMode: "ground-and-air",
  }]);
  first[0].hitpoints = 1;
  assert.equal(createRecoilSpecialCatalog()[0].hitpoints, 304);

  const report = parity(createRecoilSpecialCatalog()[0], "firecracker");
  assert.deepEqual(report.authoritativeFailures, []);
  assert.ok(report.fields.every(({ disposition }) =>
    disposition === "match" || disposition === "question-backed-match"
  ));
});

test("recoil special: every unsourced mechanic value is an isolated question", () => {
  const fixture = createRecoilQuestionFixture();
  assert.deepEqual({
    authoritative: fixture.authoritative,
    boundsRule: fixture.boundsRule,
    commandsResolveBeforeLaunch: fixture.commandsResolveBeforeLaunch,
    confidence: fixture.confidence,
    directionRule: fixture.directionRule,
    displacementProjectionRule: fixture.displacementProjectionRule,
    disposition: fixture.disposition,
    interruptionRule: fixture.interruptionRule,
    launchBoundaryTick: fixture.launchBoundaryTick,
    projectileDamage: fixture.projectileDamage,
    projectileRadiusMillitiles: fixture.projectileRadiusMillitiles,
    projectileSpeedMillitilesPerTick: fixture.projectileSpeedMillitilesPerTick,
    recoilDistanceMillitiles: fixture.recoilDistanceMillitiles,
    source: fixture.source,
    targetDeathRule: fixture.targetDeathRule,
    timingRule: fixture.timingRule,
    zeroVectorRule: fixture.zeroVectorRule,
  }, {
    authoritative: false,
    boundsRule: "clamp-center-to-radius-inset-closed-arena",
    commandsResolveBeforeLaunch: true,
    confidence: "unverified",
    directionRule: "opposite-snapshotted-target-vector",
    displacementProjectionRule:
      "euclidean-components-divide-by-exact-integer-vector-length",
    disposition: "question",
    interruptionRule:
      "interrupt-at-or-before-launch-boundary-suppresses-projectile-and-recoil",
    launchBoundaryTick: 144,
    projectileDamage: 1,
    projectileRadiusMillitiles: 0,
    projectileSpeedMillitilesPerTick: 100,
    recoilDistanceMillitiles: 2000,
    source: "unsourced-attack-recoil-fixture",
    targetDeathRule:
      "death-after-launch-does-not-undo-recoil-or-remove-in-flight-projectile",
    timingRule: "same-boundary-immediately-after-projectile-launch",
    zeroVectorRule: "reject-undefined-direction",
  });
  const values = Object.keys(fixture).filter((key) => ![
    "authoritative",
    "confidence",
    "disposition",
    "provenance",
    "source",
  ].includes(key));
  assert.deepEqual(Object.keys(fixture.provenance).sort(), values.sort());
  for (const provenance of Object.values(fixture.provenance)) {
    assert.deepEqual(provenance, {
      confidence: "unverified",
      disposition: "question",
      source: "unsourced-attack-recoil-fixture",
    });
  }
  fixture.recoilDistanceMillitiles = 1;
  fixture.provenance.boundsRule.disposition = "match";
  assert.equal(createRecoilQuestionFixture().recoilDistanceMillitiles, 2000);
  assert.equal(
    createRecoilQuestionFixture().provenance.boundsRule.disposition,
    "question",
  );
  assert.throws(
    () => createRecoilQuestionFixture({ recoilDistanceMillitiles: 1 }),
    /does not accept overrides/u,
  );
});

test("recoil special: pure projection is exact and opposite the snapshot", () => {
  const result = evaluateRecoilQuestionBoundary(
    { x: 5000, y: 6000 },
    { x: 8000, y: 10000 },
    400,
  );
  assert.deepEqual(result, {
    clamped: false,
    displacement: { x: -1200, y: -1600 },
    origin: { x: 5000, y: 6000 },
    position: { x: 3800, y: 4400 },
    radius: 400,
    snapshottedTargetPosition: { x: 8000, y: 10000 },
    unclamped: { x: 3800, y: 4400 },
  });
  const targetVector = { x: 3000, y: 4000 };
  assert.ok(
    result.displacement.x * targetVector.x +
      result.displacement.y * targetVector.y <
      0,
  );
  assert.equal(
    result.displacement.x ** 2 + result.displacement.y ** 2,
    2000 ** 2,
  );
  result.position.x = 0;
  assert.equal(
    evaluateRecoilQuestionBoundary(
      { x: 5000, y: 6000 },
      { x: 8000, y: 10000 },
      400,
    ).position.x,
    3800,
  );
});

test("recoil special: radius-inset arena clamping is explicit", () => {
  assert.deepEqual(evaluateRecoilQuestionBoundary(
    { x: 500, y: 500 },
    { x: 3500, y: 4500 },
    400,
  ), {
    clamped: true,
    displacement: { x: -1200, y: -1600 },
    origin: { x: 500, y: 500 },
    position: { x: 400, y: 400 },
    radius: 400,
    snapshottedTargetPosition: { x: 3500, y: 4500 },
    unclamped: { x: -700, y: -1100 },
  });
  assert.deepEqual(evaluateRecoilQuestionBoundary(
    { x: 17_500, y: 31_500 },
    { x: 14_500, y: 27_500 },
    400,
  ).position, { x: 17_600, y: 31_600 });
});

test("recoil special: safe-integer projection boundaries are exact", () => {
  const maximum = Number.MAX_SAFE_INTEGER;
  const axisCases = [
    {
      origin: { x: 0, y: 0 },
      target: { x: 1, y: 0 },
      displacement: { x: -maximum, y: 0 },
      unclamped: { x: -maximum, y: 0 },
    },
    {
      origin: { x: 0, y: 0 },
      target: { x: 0, y: 1 },
      displacement: { x: 0, y: -maximum },
      unclamped: { x: 0, y: -maximum },
    },
  ];
  for (const { origin, target, displacement, unclamped } of axisCases) {
    const result = evaluateRecoilQuestionBoundary(
      origin,
      target,
      0,
      maximum,
    );
    assert.deepEqual(result.displacement, displacement);
    assert.deepEqual(result.unclamped, unclamped);
    assert.ok(Number.isSafeInteger(result.unclamped.x));
    assert.ok(Number.isSafeInteger(result.unclamped.y));
  }

  for (const { origin, target, distance, expected } of [
    {
      origin: { x: 18_000, y: 0 },
      target: { x: 17_999, y: 0 },
      distance: maximum - 18_000,
      expected: { x: maximum, y: 0 },
    },
    {
      origin: { x: 0, y: 32_000 },
      target: { x: 0, y: 31_999 },
      distance: maximum - 32_000,
      expected: { x: 0, y: maximum },
    },
  ]) {
    assert.deepEqual(
      evaluateRecoilQuestionBoundary(origin, target, 0, distance).unclamped,
      expected,
    );
    assert.throws(
      () => evaluateRecoilQuestionBoundary(origin, target, 0, distance + 1),
      /unclamped\.[xy].*safe integer range/u,
    );
  }

  const diagonalVector = { x: 3161, y: 5520 };
  for (const [xSign, ySign] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) {
    const origin = { x: 9000, y: 16_000 };
    const target = {
      x: origin.x + xSign * diagonalVector.x,
      y: origin.y + ySign * diagonalVector.y,
    };
    const result = evaluateRecoilQuestionBoundary(
      origin,
      target,
      0,
      maximum,
    );
    assert.deepEqual(result.displacement, {
      x: -xSign * 4_475_987_556_081_791,
      y: -ySign * 7_816_340_180_187_120,
    });
    for (const value of [
      result.displacement.x,
      result.displacement.y,
      result.unclamped.x,
      result.unclamped.y,
    ]) {
      assert.ok(Number.isSafeInteger(value));
    }
  }

  assert.throws(
    () => evaluateRecoilQuestionBoundary(
      { x: 4, y: 5 },
      { x: 1, y: 1 },
      0,
      maximum,
    ),
    /exact integer millitile components/u,
  );
});

test("recoil special: overflow rejection is non-coercive and atomic", () => {
  let getterCalls = 0;
  const accessorOrigin = { y: 0 };
  Object.defineProperty(accessorOrigin, "x", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 18_000;
    },
  });
  assert.throws(
    () => evaluateRecoilQuestionBoundary(
      accessorOrigin,
      { x: 17_999, y: 0 },
      0,
      1,
    ),
    /enumerable data property/u,
  );
  assert.equal(getterCalls, 0);

  let coercionCalls = 0;
  const coerciveDistance = {
    valueOf() {
      coercionCalls += 1;
      return Number.MAX_SAFE_INTEGER;
    },
  };
  assert.throws(
    () => evaluateRecoilQuestionBoundary(
      { x: 18_000, y: 0 },
      { x: 17_999, y: 0 },
      0,
      coerciveDistance,
    ),
    /positive safe integer/u,
  );
  assert.equal(coercionCalls, 0);

  const origin = { x: 18_000, y: 32_000 };
  const target = { x: 17_999, y: 32_000 };
  const before = structuredClone({ origin, target });
  assert.throws(
    () => evaluateRecoilQuestionBoundary(
      origin,
      target,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    /unclamped\.x.*safe integer range/u,
  );
  assert.deepEqual({ origin, target }, before);
  assert.deepEqual(
    evaluateRecoilQuestionBoundary(
      origin,
      target,
      0,
      Number.MAX_SAFE_INTEGER - origin.x,
    ).unclamped,
    { x: Number.MAX_SAFE_INTEGER, y: 32_000 },
  );
});

test("recoil special: attack launch precedes same-boundary recoil", () => {
  const encounter = new RecoilEncounter();
  encounter.stepMany(144);
  const events = encounter.step();
  assert.deepEqual(events.map(({ type }) => type), [
    "attack-projectile-launched",
    "attack-recoil",
  ]);
  assert.deepEqual(events[0].projectile, {
    attackerId: 101,
    damage: 1,
    id: 1,
    impactTick: 194,
    launchTick: 144,
    origin: { x: 5000, y: 6000 },
    radius: 0,
    speed: 100,
    targetId: 202,
    targetPosition: { x: 8000, y: 10000 },
    targetRadius: 0,
  });
  assert.deepEqual(events[1], {
    clamped: false,
    displacement: { x: -1200, y: -1600 },
    from: { x: 5000, y: 6000 },
    snapshottedTargetPosition: { x: 8000, y: 10000 },
    tick: 144,
    to: { x: 3800, y: 4400 },
    type: "attack-recoil",
    unclamped: { x: 3800, y: 4400 },
  });
  assert.deepEqual(encounter.state.position, { x: 3800, y: 4400 });
  assert.deepEqual(encounter.state.projectileState.projectiles[0].origin, {
    x: 5000,
    y: 6000,
  });
});

test("recoil special: edge encounter applies the same vector then clamps", () => {
  const encounter = new RecoilEncounter(
    createRecoilSpecialFixture([], "edge"),
  );
  encounter.stepMany(145);
  assert.deepEqual(eventsOf(encounter, "attack-recoil"), [{
    clamped: true,
    displacement: { x: -1200, y: -1600 },
    from: { x: 500, y: 500 },
    snapshottedTargetPosition: { x: 3500, y: 4500 },
    tick: 144,
    to: { x: 400, y: 400 },
    type: "attack-recoil",
    unclamped: { x: -700, y: -1100 },
  }]);
  assert.deepEqual(encounter.state.position, { x: 400, y: 400 });
});

test("recoil special: interruption through launch boundary suppresses both effects", () => {
  for (const tick of [0, 143, 144]) {
    const encounter = new RecoilEncounter(createRecoilSpecialFixture([
      { tick, type: "interrupt" },
    ]));
    encounter.run();
    assert.deepEqual(eventsOf(encounter, "attack-projectile-launched"), []);
    assert.deepEqual(eventsOf(encounter, "attack-recoil"), []);
    assert.deepEqual(encounter.state.position, { x: 5000, y: 6000 });
    assert.deepEqual(encounter.state.projectileState.projectiles, []);
    assert.equal(encounter.state.projectileState.nextProjectileId, 1);
  }
});

test("recoil special: target death after launch preserves recoil and flight", () => {
  const encounter = new RecoilEncounter(createRecoilSpecialFixture([
    { tick: 150, type: "target-killed" },
  ]));
  encounter.stepMany(150);
  assert.equal(encounter.state.projectileState.projectiles[0].id, 1);
  assert.deepEqual(encounter.step().map(({ type }) => type), [
    "target-kill-projectile-launched",
    "projectile-impact",
    "projectile-damage",
    "projectile-death",
  ]);
  assert.equal(encounter.state.projectileState.projectiles[0].id, 1);
  assert.deepEqual(encounter.state.position, { x: 3800, y: 4400 });
  encounter.run();
  assert.deepEqual(eventsOf(encounter, "attack-recoil").map(({ to }) => to), [
    { x: 3800, y: 4400 },
  ]);
  assert.deepEqual(
    eventsOf(encounter, "projectile-impact")
      .map(({ projectileId, status, tick }) => ({ projectileId, status, tick })),
    [
      { projectileId: 2, status: "contact", tick: 150 },
      { projectileId: 1, status: "target_dead", tick: 194 },
    ],
  );
});

test("recoil special: ordinary projectile contact remains launch-independent", () => {
  const encounter = new RecoilEncounter();
  encounter.run();
  assert.deepEqual(eventsOf(encounter, "projectile-impact"), [{
    projectileId: 1,
    status: "contact",
    targetId: 202,
    tick: 194,
    type: "projectile-impact",
  }]);
  assert.equal(encounter.state.projectileState.entities[1].hitpoints, 999);
  assert.deepEqual(encounter.state.position, { x: 3800, y: 4400 });
});

test("recoil special: fresh, chunked, and causal restore bytes agree", () => {
  for (const [commands, scenario] of [
    [[], "open"],
    [[], "edge"],
    [[{ tick: 144, type: "interrupt" }], "open"],
    [[{ tick: 150, type: "target-killed" }], "open"],
  ]) {
    const fresh = runFresh(commands, scenario);
    const chunked = new RecoilEncounter(
      createRecoilSpecialFixture(commands, scenario),
    );
    for (const chunk of [1, 59, 60, 24, 1, 6, 44]) {
      chunked.stepMany(chunk);
    }
    chunked.run();
    assert.deepEqual({
      replay: chunked.replay,
      snapshot: chunked.serialize(),
      state: chunked.state,
    }, fresh);

    const partial = new RecoilEncounter(
      createRecoilSpecialFixture(commands, scenario),
    );
    partial.stepMany(Math.min(145, fresh.state.tick));
    const restored = RecoilEncounter.restore(partial.serialize());
    partial.run();
    restored.run();
    assert.deepEqual(restored.replay, partial.replay);
    assert.deepEqual(restored.state, partial.state);
    assert.equal(restored.serialize(), partial.serialize());
  }
});

test("recoil special: setup, outputs, evaluator, and bounds are hostile-safe", () => {
  const setup = createRecoilSpecialFixture([
    { tick: 150, type: "target-killed" },
  ], "edge");
  const encounter = new RecoilEncounter(setup);
  setup.commands[0].tick = 0;
  setup.scenario = "open";
  encounter.run();
  assert.equal(eventsOf(encounter, "projectile-death")[0].tick, 150);
  assert.deepEqual(encounter.state.position, { x: 400, y: 400 });

  const state = encounter.state;
  const replay = encounter.replay;
  state.position.x = 0;
  state.projectileState.entities[1].hitpoints = 999;
  replay.length = 0;
  assert.deepEqual(encounter.state.position, { x: 400, y: 400 });
  assert.equal(encounter.state.projectileState.entities[1].hitpoints, 0);
  assert.ok(encounter.replay.length > 0);

  for (const [commands, scenario] of [
    [new Array(2).fill({ tick: 1, type: "interrupt" }), "open"],
    [[{ tick: -1, type: "interrupt" }], "open"],
    [[{ tick: 145, type: "interrupt" }], "open"],
    [[{ tick: 144, type: "target-killed" }], "open"],
    [[{ tick: 194, type: "target-killed" }], "open"],
    [[{ tick: 1, type: "unknown" }], "open"],
    [[{ tick: 1, type: "interrupt", extra: true }], "open"],
    [[], "unknown"],
  ]) {
    assert.throws(() => createRecoilSpecialFixture(commands, scenario));
  }
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => createRecoilSpecialFixture(sparse));
  const accessor = {};
  Object.defineProperty(accessor, "tick", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  Object.defineProperty(accessor, "type", {
    enumerable: true,
    value: "interrupt",
  });
  assert.throws(
    () => createRecoilSpecialFixture([accessor]),
    /invalid shape/u,
  );

  for (const args of [
    [{ x: 1, y: 1 }, { x: 1, y: 1 }, 0],
    [{ x: 1, y: 1 }, { x: 2, y: 2 }, 0],
    [{ x: -1, y: 1 }, { x: 2, y: 1 }, 0],
    [{ x: 1, y: 1 }, { x: 4, y: 1 }, 400],
    [{ x: 1, y: 1 }, { x: 18_001, y: 1 }, 0],
    [{ x: 1, y: 1 }, { x: 4, y: 1 }, 10_000],
    [{ x: 1, y: 1 }, { x: 4, y: 1 }, 0, 0],
    [{ x: 1, y: 1 }, { x: 4, y: 5 }, 0, 1],
  ]) {
    assert.throws(() => evaluateRecoilQuestionBoundary(...args));
  }
  assert.throws(
    () => evaluateRecoilQuestionBoundary(
      { x: 1, y: 1 },
      { x: 4, y: 1 },
      0,
      1,
      "extra",
    ),
    /extra arguments/u,
  );
  assert.throws(() => encounter.stepMany(-1));
  assert.throws(() => encounter.run(197), /exceeds its bound/u);
});

test("recoil special: snapshots bind scenario, commands, and causal tick", () => {
  const encounter = new RecoilEncounter(createRecoilSpecialFixture([
    { tick: 150, type: "target-killed" },
  ], "edge"));
  encounter.stepMany(160);
  const canonical = encounter.serialize();
  assert.equal(RecoilEncounter.restore(canonical).serialize(), canonical);
  const raw = JSON.parse(canonical);
  const invalid = [
    "no",
    "{}",
    JSON.stringify({ ...raw, version: 2 }),
    JSON.stringify({ ...raw, tick: -1 }),
    JSON.stringify({ ...raw, tick: 197 }),
    JSON.stringify({ ...raw, surprise: true }),
    JSON.stringify({
      ...raw,
      identity: { ...raw.identity, encounter: "other" },
    }),
    JSON.stringify({
      ...raw,
      identity: { ...raw.identity, scenario: "unknown" },
    }),
    JSON.stringify({
      ...raw,
      identity: {
        ...raw.identity,
        commands: [{ tick: 1, type: "interrupt", extra: true }],
      },
    }),
    " ".repeat(4097),
  ];
  for (const snapshot of invalid) {
    assert.throws(() => RecoilEncounter.restore(snapshot));
  }
  assert.throws(() => RecoilEncounter.restore({}), /must be a string/u);

  const completed = new RecoilEncounter();
  completed.run();
  const postTerminal = JSON.parse(completed.serialize());
  postTerminal.tick += 1;
  assert.throws(
    () => RecoilEncounter.restore(JSON.stringify(postTerminal)),
    /post-terminal time/u,
  );
});

test("recoil special: shipped source is original and non-claims are explicit", () => {
  const source = readFileSync(
    new URL("../src/content/cards/special-movement-recoil.js", import.meta.url),
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
    "projectile travel/damage",
    "moving",
    "retargeting",
    "collision/obstacle",
    "animation",
    "footage",
    "knockback",
    "charge",
    "dash",
    "jump",
    "repeated-attack",
    "general recoil",
  ]) {
    assert.match(source, new RegExp(nonClaim, "u"));
  }
});
