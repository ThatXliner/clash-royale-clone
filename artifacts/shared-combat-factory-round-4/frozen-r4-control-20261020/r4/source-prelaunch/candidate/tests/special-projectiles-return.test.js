import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ReturnEncounter,
  createReturnQuestionFixture,
  createReturnSpecialCatalog,
  createReturnSpecialFixture,
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
  ["targetMode", "targets",
    (value) => value === "air_and_ground" ? "ground-and-air" : value],
  ["count", "count", (value) => value],
  ["areaDamageRadiusMillitiles", "area_damage_radius_tiles",
    (value) => value === null ? null : value * 1000],
];
const parity = createReferenceParityEvaluator(
  benchmark.cards,
  FIELDS,
  ["executioner"],
);

function candidate(
  id,
  x,
  {
    alive = true,
    kind = "troop",
    layer = "ground",
    maxHealth = 1000,
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
  const encounter = new ReturnEncounter(
    createReturnSpecialFixture(candidates, aim, commands),
  );
  encounter.run();
  return encounter;
}

function hitIds(encounter, leg) {
  return encounter.replay
    .filter((event) => event.type === "return-hit" && event.leg === leg)
    .map(({ targetId }) => targetId);
}

function resultOf(setup) {
  const encounter = new ReturnEncounter(setup);
  encounter.run();
  return {
    replay: encounter.replay,
    snapshot: encounter.serialize(),
    state: encounter.state,
  };
}

function boundaryCandidates(aim) {
  const origin = { x: 1000, y: 4000 };
  const magnitude = Math.abs(aim.x) === 3 ? 5 : 1;
  const reach = 350;
  const offset = (point, vector, distance) => {
    assert.ok(vector.x * distance % magnitude === 0);
    assert.ok(vector.y * distance % magnitude === 0);
    return {
      x: point.x + vector.x * distance / magnitude,
      y: point.y + vector.y * distance / magnitude,
    };
  };
  const oneMillitileOutward = (point, vector) => {
    if (vector.x !== 0) {
      return { x: point.x + Math.sign(vector.x), y: point.y };
    }
    return { x: point.x, y: point.y + Math.sign(vector.y) };
  };
  const normal = { x: -aim.y, y: aim.x };
  const startTangent = offset(origin, aim, -reach);
  const corridorCenter = offset(origin, aim, 3500);
  const corridorTangent = offset(corridorCenter, normal, reach);
  const end = offset(origin, aim, 7000);
  const endTangent = offset(end, aim, reach);
  const at = (id, point) =>
    candidate(id, point.x, { radius: 100, y: point.y });
  return [
    at(201, startTangent),
    at(202, oneMillitileOutward(startTangent, {
      x: -aim.x,
      y: -aim.y,
    })),
    at(203, corridorTangent),
    at(204, oneMillitileOutward(corridorTangent, normal)),
    at(205, endTangent),
    at(206, oneMillitileOutward(endTangent, aim)),
  ];
}

test("return special: original identity maps test-only to caveated base fields", () => {
  const catalog = createReturnSpecialCatalog();
  assert.deepEqual(catalog, [{
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 5,
    count: 1,
    damage: 169,
    deployTimeTicks: 60,
    displayName: "Rune Reaver",
    firstHitTicks: 24,
    hitSpeedTicks: 54,
    hitpoints: 1280,
    id: "rune-reaver",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 4500,
    rarity: "special",
    sightRangeMillitiles: 5500,
    targetMode: "ground-and-air",
  }]);
  catalog[0].damage = 1;
  assert.equal(createReturnSpecialCatalog()[0].damage, 169);
  const report = parity(createReturnSpecialCatalog()[0], "executioner");
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

test("return special: every absent value and policy is independently frozen", () => {
  const fixture = createReturnQuestionFixture();
  assert.deepEqual(
    Object.fromEntries(Object.entries(fixture).map(([key, record]) =>
      [key, record.value]
    )),
    {
      attackerDeathAfterLaunchRule: "launched-projectile-continues",
      attackerDeathThroughLaunchRule: "cancels-launch",
      collisionGeometryRule:
        "static-directed-finite-segment-with-inclusive-start-cap-corridor-and-end-cap",
      collisionWidthMillitiles: 250,
      damagePerPass: 169,
      damagePerPassRule: "full-base-damage-on-each-leg",
      eventOrderRule:
        "commands;launch;outbound-hits-near-to-far;turn;inbound-hits-far-to-near;complete",
      inboundTimingRule: "first-inbound-travel-boundary-is-after-turn",
      interruptionAfterLaunchRule: "launched-projectile-continues",
      interruptionThroughLaunchRule: "cancels-launch",
      launchTimingTicks: 24,
      movingTargetRule: "launch-time-position-snapshot",
      obstacleRule: "obstacles-not-modeled-static-segment-unblocked",
      oneHitPerLegRule: "at-most-once-per-target-per-leg",
      projectileSpeedMillitilesPerTick: 1000,
      sameBoundaryRule: "commands-resolve-before-projectile-events",
      targetDeathRule: "dead-before-pass-contact-is-ineligible",
      targetEligibilityRule:
        "alive-targetable-ground-or-air-troops-and-structures",
      turnDistanceMillitiles: 7000,
      turnaroundTimingRule: "turn-after-outbound-contacts-at-end-boundary",
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
      source: "unsourced-outbound-returning-projectile-fixture",
    });
  }
  const second = createReturnQuestionFixture();
  assert.notEqual(second, fixture);
  for (const key of Object.keys(fixture)) assert.notEqual(second[key], fixture[key]);
  assert.throws(() => {
    fixture.turnDistanceMillitiles.value = 1;
  }, TypeError);
  assert.throws(
    () => createReturnQuestionFixture({ turnDistanceMillitiles: 1 }),
    /does not accept overrides/u,
  );
});

test("return special: minimal encounter has exact phase and event order", () => {
  const encounter = run([
    candidate(300, 3000),
    candidate(200, 6000),
  ]);
  assert.deepEqual(
    encounter.replay.filter(({ type }) =>
      ["return-launch", "return-hit", "return-turn", "return-complete"]
        .includes(type)
    ).map(({ leg, targetId, tick, type }) => ({
      leg: leg ?? null,
      targetId: targetId ?? null,
      tick,
      type,
    })),
    [
      { leg: null, targetId: null, tick: 24, type: "return-launch" },
      { leg: "outbound", targetId: 300, tick: 26, type: "return-hit" },
      { leg: "outbound", targetId: 200, tick: 29, type: "return-hit" },
      { leg: null, targetId: null, tick: 31, type: "return-turn" },
      { leg: "inbound", targetId: 200, tick: 33, type: "return-hit" },
      { leg: "inbound", targetId: 300, tick: 36, type: "return-hit" },
      { leg: null, targetId: null, tick: 38, type: "return-complete" },
    ],
  );
});

test("return special: stable-ID ties hold on both legs", () => {
  const encounter = run([
    candidate(900, 5000, { y: 4200 }),
    candidate(200, 5000, { y: 3800 }),
  ]);
  assert.deepEqual(hitIds(encounter, "outbound"), [200, 900]);
  assert.deepEqual(hitIds(encounter, "inbound"), [200, 900]);
});

test("return special: each target is hit at most once per leg and twice total", () => {
  const encounter = run([candidate(201, 4000)]);
  assert.deepEqual(hitIds(encounter, "outbound"), [201]);
  assert.deepEqual(hitIds(encounter, "inbound"), [201]);
  assert.equal(
    encounter.replay.filter(({ type }) => type === "return-damage").length,
    2,
  );
  assert.equal(encounter.state.candidates[0].hitpoints, 662);
});

test("return special: per-pass lethal damage prevents a second pass", () => {
  const encounter = run([candidate(201, 4000, { maxHealth: 169 })]);
  assert.deepEqual(hitIds(encounter, "outbound"), [201]);
  assert.deepEqual(hitIds(encounter, "inbound"), []);
  assert.deepEqual(
    encounter.replay.filter(({ type }) => type === "return-death")
      .map(({ targetId }) => targetId),
    [201],
  );
});

test("return special: corridor is inclusive and one millitile outside misses", () => {
  const encounter = run([
    candidate(201, 4000, { y: 4250 }),
    candidate(202, 5000, { y: 4251 }),
    candidate(203, 6000, { radius: 100, y: 4350 }),
    candidate(204, 7000, { radius: 100, y: 4351 }),
  ]);
  assert.deepEqual(hitIds(encounter, "outbound"), [201, 203]);
  assert.deepEqual(hitIds(encounter, "inbound"), [203, 201]);
});

test("return special: origin cap is inclusive and one millitile behind misses", () => {
  const encounter = run([
    candidate(201, 750),
    candidate(202, 749),
    candidate(203, 650, { radius: 100 }),
    candidate(204, 649, { radius: 100 }),
  ]);
  assert.deepEqual(hitIds(encounter, "outbound"), [203, 201]);
  assert.deepEqual(hitIds(encounter, "inbound"), [201, 203]);
});

test("return special: turn cap is inclusive and one millitile beyond misses", () => {
  const encounter = run([
    candidate(201, 8250),
    candidate(202, 8251),
    candidate(203, 8350, { radius: 100 }),
    candidate(204, 8351, { radius: 100 }),
  ]);
  assert.deepEqual(hitIds(encounter, "outbound"), [201, 203]);
  assert.deepEqual(hitIds(encounter, "inbound"), [203, 201]);
});

test("return special: signed 3-4-5 geometry uses exact BigInt boundaries", () => {
  const encounter = run([
    candidate(201, 3400, { y: 7200 }),
    candidate(202, 3200, { y: 7350 }),
    candidate(203, 3199, { y: 7350 }),
  ], { x: 3, y: 4 });
  assert.deepEqual(hitIds(encounter, "outbound"), [201, 202]);
  assert.deepEqual(
    encounter.replay.find(({ type }) => type === "return-launch").turnPoint,
    { x: 5200, y: 9600 },
  );
});

test("return special: every signed axis and 3-4-5 capsule boundary is exact", () => {
  const directions = [
    ["positive X", { x: 1, y: 0 }],
    ["negative X", { x: -1, y: 0 }],
    ["positive Y", { x: 0, y: 1 }],
    ["negative Y", { x: 0, y: -1 }],
    ["positive X positive Y", { x: 3, y: 4 }],
    ["negative X positive Y", { x: -3, y: 4 }],
    ["positive X negative Y", { x: 3, y: -4 }],
    ["negative X negative Y", { x: -3, y: -4 }],
  ];
  for (const [label, aim] of directions) {
    const encounter = run(boundaryCandidates(aim), aim);
    assert.deepEqual(
      hitIds(encounter, "outbound"),
      [201, 203, 205],
      `${label} outbound start/corridor/end tangencies`,
    );
    assert.deepEqual(
      hitIds(encounter, "inbound"),
      [205, 203, 201],
      `${label} inbound end/corridor/start tangencies`,
    );
    assert.deepEqual(
      encounter.state.candidates
        .filter(({ hitpoints }) => hitpoints === 1000)
        .map(({ id }) => id),
      [202, 204, 206],
      `${label} one-millitile start/corridor/end misses`,
    );
  }
});

test("return special: launch snapshots caller setup for both contact orders", () => {
  const candidates = [
    candidate(201, 3000),
    candidate(202, 5000),
    candidate(203, 7000),
  ];
  const expected = resultOf(createReturnSpecialFixture(candidates));
  const setup = createReturnSpecialFixture(candidates);
  const encounter = new ReturnEncounter(setup);
  encounter.stepMany(25);

  setup.aim.x = -1;
  setup.candidates.reverse();
  for (const target of setup.candidates) {
    target.alive = false;
    target.position.x = 1000;
    target.position.y = 9000;
    target.radius = 1000;
    target.targetable = false;
  }
  setup.commands.push({
    targetId: 201,
    tick: 26,
    type: "kill-target",
  });

  encounter.run();
  const actual = {
    replay: encounter.replay,
    snapshot: encounter.serialize(),
    state: encounter.state,
  };
  assert.deepEqual(hitIds(encounter, "outbound"), [201, 202, 203]);
  assert.deepEqual(hitIds(encounter, "inbound"), [203, 202, 201]);
  assert.deepEqual(actual, expected);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
});

test("return special: ground, air, troop, and structure candidates are eligible", () => {
  const encounter = run([
    candidate(201, 3000, { layer: "ground" }),
    candidate(202, 5000, { layer: "air" }),
    candidate(203, 7000, { kind: "structure" }),
  ]);
  assert.deepEqual(hitIds(encounter, "outbound"), [201, 202, 203]);
});

test("return special: dead and untargetable candidates are filtered", () => {
  const encounter = run([
    candidate(201, 3000, { alive: false }),
    candidate(202, 5000, { targetable: false }),
    candidate(203, 7000),
  ]);
  assert.deepEqual(hitIds(encounter, "outbound"), [203]);
  assert.deepEqual(hitIds(encounter, "inbound"), [203]);
  assert.equal(encounter.state.candidates[0].alive, false);
  assert.equal(encounter.state.candidates[1].hitpoints, 1000);
});

test("return special: command-first target death on contact suppresses that pass", () => {
  const encounter = run(
    [candidate(201, 3000), candidate(202, 5000)],
    { x: 1, y: 0 },
    [{ targetId: 201, tick: 26, type: "kill-target" }],
  );
  assert.deepEqual(hitIds(encounter, "outbound"), [202]);
  assert.deepEqual(
    encounter.replay.filter(({ tick }) => tick === 26).map(({ type }) => type),
    ["return-command", "external-damage", "external-death"],
  );
});

test("return special: target death between legs suppresses inbound only", () => {
  const encounter = run(
    [candidate(201, 3000), candidate(202, 5000)],
    { x: 1, y: 0 },
    [{ targetId: 201, tick: 32, type: "kill-target" }],
  );
  assert.deepEqual(hitIds(encounter, "outbound"), [201, 202]);
  assert.deepEqual(hitIds(encounter, "inbound"), [202]);
});

test("return special: attacker death through launch cancels", () => {
  for (const tick of [0, 24]) {
    const encounter = run(
      [candidate(201, 3000)],
      { x: 1, y: 0 },
      [{ targetId: null, tick, type: "kill-attacker" }],
    );
    assert.deepEqual(hitIds(encounter, "outbound"), []);
    assert.equal(
      encounter.replay.find(({ type }) => type === "return-complete").reason,
      "launch-cancelled",
    );
  }
});

test("return special: attacker death after launch does not recall projectile", () => {
  const encounter = run(
    [candidate(201, 3000)],
    { x: 1, y: 0 },
    [{ targetId: null, tick: 25, type: "kill-attacker" }],
  );
  assert.deepEqual(hitIds(encounter, "outbound"), [201]);
  assert.deepEqual(hitIds(encounter, "inbound"), [201]);
  assert.equal(encounter.state.attackerAlive, false);
});

test("return special: interruption through launch cancels; later does not", () => {
  for (const tick of [0, 24]) {
    const encounter = run(
      [candidate(201, 3000)],
      { x: 1, y: 0 },
      [{ targetId: null, tick, type: "interrupt-attacker" }],
    );
    assert.deepEqual(hitIds(encounter, "outbound"), []);
  }
  const later = run(
    [candidate(201, 3000)],
    { x: 1, y: 0 },
    [{ targetId: null, tick: 25, type: "interrupt-attacker" }],
  );
  assert.deepEqual(hitIds(later, "inbound"), [201]);
  assert.equal(later.state.interrupted, true);
});

test("return special: snapshots expose prelaunch, outbound, turn, inbound, terminal", () => {
  const encounter = new ReturnEncounter();
  const checkpoints = [
    [0, "prelaunch"],
    [25, "outbound"],
    [31, "turn"],
    [32, "inbound"],
    [39, "terminal"],
  ];
  for (const [tick, phase] of checkpoints) {
    encounter.stepMany(tick - encounter.state.tick);
    assert.equal(encounter.state.phase, phase);
    assert.equal(ReturnEncounter.restore(encounter.serialize()).state.phase, phase);
  }
});

test("return special: fresh, reordered, and chunked runs are byte-identical", () => {
  const candidates = [
    candidate(900, 7000),
    candidate(201, 3000),
    candidate(500, 5000),
  ];
  const setup = createReturnSpecialFixture(candidates);
  const expected = resultOf(setup);
  assert.deepEqual(resultOf(createReturnSpecialFixture(candidates)), expected);
  assert.deepEqual(
    resultOf(createReturnSpecialFixture([...candidates].reverse())),
    expected,
  );
  const chunked = new ReturnEncounter(setup);
  for (const chunk of [1, 7, 13, 9, 2, 3, 99]) chunked.stepMany(chunk);
  chunked.run();
  const actual = {
    replay: chunked.replay,
    snapshot: chunked.serialize(),
    state: chunked.state,
  };
  assert.deepEqual(actual, expected);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
});

test("return special: every-tick causal restore is byte-identical", () => {
  const setup = createReturnSpecialFixture(
    [candidate(900, 3000), candidate(200, 5000), candidate(300, 7000)],
    { x: 1, y: 0 },
    [{ targetId: 900, tick: 32, type: "kill-target" }],
  );
  const expected = resultOf(setup);
  for (let split = 0; split <= expected.state.tick; split += 1) {
    const partial = new ReturnEncounter(setup);
    partial.stepMany(split);
    const restored = ReturnEncounter.restore(partial.serialize());
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

test("return special: invalid vectors and unsafe spatial values fail closed", () => {
  const valid = [candidate(201, 3000)];
  for (const aim of [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 5, y: 12 },
    { x: Number.MAX_SAFE_INTEGER, y: 0 },
    { x: 1.5, y: 0 },
  ]) {
    assert.throws(() => createReturnSpecialFixture(valid, aim));
  }
  for (const candidates of [
    [candidate(201, Number.MAX_SAFE_INTEGER)],
    [candidate(201, 3000, { radius: Number.MAX_SAFE_INTEGER })],
    [candidate(201, 3000, { maxHealth: Number.MAX_SAFE_INTEGER + 1 })],
  ]) {
    assert.throws(() => createReturnSpecialFixture(candidates));
  }
});

test("return special: hostile accessors, prototypes, sparse, and extra data reject", () => {
  let getterCalls = 0;
  const accessor = candidate(201, 3000);
  Object.defineProperty(accessor.position, "x", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 3000;
    },
  });
  assert.throws(() => createReturnSpecialFixture([accessor]));
  assert.equal(getterCalls, 0);
  const foreign = Object.create({ inherited: true });
  Object.assign(foreign, candidate(201, 3000));
  assert.throws(() => createReturnSpecialFixture([foreign]), /plain object/u);
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => createReturnSpecialFixture(sparse), /dense/u);
  const extraArray = [candidate(201, 3000)];
  extraArray.extra = true;
  assert.throws(() => createReturnSpecialFixture(extraArray), /dense/u);
  for (const candidates of [
    new Array(33).fill(null).map((_, index) =>
      candidate(200 + index, 3000 + index)
    ),
    [candidate(101, 3000)],
    [candidate(201, 3000), candidate(201, 5000)],
    [{ ...candidate(201, 3000), extra: true }],
  ]) {
    assert.throws(() => createReturnSpecialFixture(candidates));
  }
});

test("return special: command, execution, replay, and output bounds hold", () => {
  const valid = [candidate(201, 3000)];
  for (const commands of [
    new Array(25).fill(null).map((_, tick) => ({
      targetId: null,
      tick,
      type: "interrupt-attacker",
    })),
    [{ targetId: null, tick: -1, type: "kill-attacker" }],
    [{ targetId: null, tick: 39, type: "kill-attacker" }],
    [{ targetId: 999, tick: 1, type: "kill-target" }],
    [{ targetId: 201, tick: 1, type: "kill-attacker" }],
    [{ targetId: null, tick: 1, type: "kill-target" }],
    [{ targetId: null, tick: 1, type: "unknown" }],
    [{ extra: true, targetId: null, tick: 1, type: "kill-attacker" }],
  ]) {
    assert.throws(() =>
      createReturnSpecialFixture(valid, { x: 1, y: 0 }, commands)
    );
  }
  assert.throws(
    () => createReturnSpecialFixture(valid, { x: 1, y: 0 }, [], "extra"),
    /extra arguments/u,
  );
  const encounter = new ReturnEncounter();
  encounter.run();
  const replay = encounter.replay;
  const state = encounter.state;
  replay.length = 0;
  state.candidates[0].hitpoints = 999;
  assert.ok(encounter.replay.length > 0);
  assert.notEqual(encounter.state.candidates[0].hitpoints, 999);
  assert.ok(encounter.replay.length <= 256);
  assert.throws(() => encounter.stepMany(-1));
  assert.throws(() => encounter.run(40), /exceeds its bound/u);
});

test("return special: snapshots reject oversized, extra, and non-causal data", () => {
  const encounter = new ReturnEncounter();
  encounter.stepMany(25);
  const canonical = encounter.serialize();
  assert.equal(ReturnEncounter.restore(canonical).serialize(), canonical);
  const raw = JSON.parse(canonical);
  for (const serialized of [
    "no",
    "{}",
    JSON.stringify({ ...raw, version: 2 }),
    JSON.stringify({ ...raw, tick: -1 }),
    JSON.stringify({ ...raw, tick: 40 }),
    JSON.stringify({ ...raw, extra: true }),
    JSON.stringify({ ...raw, identity: { ...raw.identity, extra: true } }),
    JSON.stringify({
      ...raw,
      identity: { ...raw.identity, aim: { x: 1, y: 1 } },
    }),
    " ".repeat(65_537),
  ]) {
    assert.throws(() => ReturnEncounter.restore(serialized));
  }
  assert.throws(() => ReturnEncounter.restore({}), /must be a string/u);
  const cancelled = new ReturnEncounter(createReturnSpecialFixture(
    [candidate(201, 3000)],
    { x: 1, y: 0 },
    [{ targetId: null, tick: 0, type: "kill-attacker" }],
  ));
  cancelled.run();
  const postTerminal = JSON.parse(cancelled.serialize());
  postTerminal.tick += 1;
  assert.throws(
    () => ReturnEncounter.restore(JSON.stringify(postTerminal)),
    /post-terminal time/u,
  );
});

test("return special: shipped source has original identity and explicit nonclaims", () => {
  const source = readFileSync(
    new URL("../src/content/cards/special-projectiles-return.js", import.meta.url),
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
    "return distance",
    "collision width",
    "speed",
    "launch",
    "turn",
    "inbound timing",
    "damage-per-pass",
    "one-hit",
    "event-order",
    "moving-target",
    "obstacle",
    "eligibility",
    "interruption",
    "death",
    "projectile-height",
    "animation",
    "visual",
    "audio",
    "full-match",
  ]) {
    assert.match(source, new RegExp(nonClaim, "u"));
  }
});
