import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PelletEncounter,
  createPelletQuestionFixture,
  createPelletSpecialCatalog,
  createPelletSpecialFixture,
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
  ["hunter"],
);

const LOCAL_RAYS = [
  [375, -200],
  [385, -180],
  [408, -119],
  [416, -87],
  [420, -65],
  [420, 65],
  [416, 87],
  [408, 119],
  [385, 180],
  [375, 200],
];

function candidate(
  id,
  x,
  {
    alive = true,
    kind = "troop",
    layer = "ground",
    maxHealth = 2000,
    radius = 0,
    targetable = true,
    y = 0,
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
  const encounter = new PelletEncounter(
    createPelletSpecialFixture(candidates, aim, commands),
  );
  encounter.run();
  return encounter;
}

function contacts(encounter) {
  return encounter.replay
    .filter(({ type }) => type === "pellet-contact")
    .map(({ pelletId, targetId }) => ({ pelletId, targetId }));
}

function resultOf(setup) {
  const encounter = new PelletEncounter(setup);
  encounter.run();
  return {
    replay: encounter.replay,
    snapshot: encounter.serialize(),
    state: encounter.state,
  };
}

function rotate(point, quarterTurns) {
  let result = { ...point };
  for (let index = 0; index < quarterTurns; index += 1) {
    result = { x: -result.y, y: result.x };
  }
  return result;
}

function boundaryCandidates(quarterTurns) {
  const points = [
    { id: 201, point: { x: -375, y: 200 } },
    { id: 202, point: { x: -376, y: 200 } },
    { id: 203, point: { x: 2075, y: -625 } },
    { id: 204, point: { x: 2075, y: -624 } },
    { id: 205, point: { x: 4125, y: -2200 } },
    { id: 206, point: { x: 4126, y: -2200 } },
  ];
  return points.map(({ id, point }) => {
    const rotated = rotate(point, quarterTurns);
    return candidate(id, rotated.x, { radius: 385, y: rotated.y });
  });
}

function diagonalBoundaryCandidates(aim) {
  const transform = ({ x, y }) => {
    const xNumerator = aim.x * x - aim.y * y;
    const yNumerator = aim.y * x + aim.x * y;
    assert.ok(xNumerator % 5 === 0);
    assert.ok(yNumerator % 5 === 0);
    return { x: xNumerator / 5, y: yNumerator / 5 };
  };
  return [
    [{ x: -375, y: 200 }, { x: -375, y: 200 }],
    [{ x: 2075, y: -625 }, { x: 200, y: 375 }],
    [{ x: 4125, y: -2200 }, { x: 375, y: -200 }],
  ].flatMap(([point, outward], index) => {
    const hit = transform(point);
    const direction = transform(outward);
    const useX = Math.abs(direction.x) >= Math.abs(direction.y);
    const miss = {
      x: hit.x + (useX ? Math.sign(direction.x) : 0),
      y: hit.y + (useX ? 0 : Math.sign(direction.y)),
    };
    return [
      candidate(301 + index * 2, hit.x, { radius: 385, y: hit.y }),
      candidate(302 + index * 2, miss.x, { radius: 385, y: miss.y }),
    ];
  });
}

test("pellet special: original identity maps test-only to caveated base fields", () => {
  const catalog = createPelletSpecialCatalog();
  assert.deepEqual(catalog, [{
    areaDamageRadiusMillitiles: 70,
    components: [],
    cost: 4,
    count: 1,
    damage: 84,
    deployTimeTicks: 60,
    displayName: "Scatterguard",
    firstHitTicks: 84,
    hitSpeedTicks: 132,
    hitpoints: 838,
    id: "scatterguard",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 4000,
    rarity: "special",
    sightRangeMillitiles: 5500,
    targetMode: "ground-and-air",
  }]);
  catalog[0].damage = 1;
  assert.equal(createPelletSpecialCatalog()[0].damage, 84);

  const report = parity(createPelletSpecialCatalog()[0], "hunter");
  assert.deepEqual(report.authoritativeFailures, []);
  assert.deepEqual(
    report.fields.filter(({ disposition }) => disposition === "match")
      .map(({ runtimeField }) => runtimeField),
    ["cost", "kind", "rarity"],
  );
  assert.ok(report.fields
    .filter(({ runtimeField }) => !["cost", "kind", "rarity"].includes(runtimeField))
    .every(({ disposition }) => disposition === "question-backed-match"));
});

test("pellet special: every absent number and policy is an isolated question", () => {
  const first = createPelletQuestionFixture();
  const second = createPelletQuestionFixture();
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.rayPattern, second.rayPattern);
  assert.notStrictEqual(first.rayPattern.value, second.rayPattern.value);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.values(first).every(Object.isFrozen));
  assert.ok(first.rayPattern.value.every(Object.isFrozen));
  assert.deepEqual(first.rayPattern.value, LOCAL_RAYS.map(([x, y]) => ({ x, y })));
  assert.equal(first.pelletCount.value, 10);
  for (const [x, y] of LOCAL_RAYS) {
    assert.equal(x * x + y * y, 425 * 425);
  }
  assert.throws(() => {
    first.rayPattern.value[0].x = 0;
  });
  assert.deepEqual(createPelletQuestionFixture(), second);
  assert.throws(() => createPelletQuestionFixture("override"));
});

test("pellet special: launch has stable left-to-right pellet IDs and integer rays", () => {
  const encounter = new PelletEncounter(createPelletSpecialFixture([]));
  encounter.stepMany(85);
  const launch = encounter.replay.find(
    ({ type }) => type === "pellet-volley-launch",
  );
  assert.equal(launch.tick, 84);
  assert.equal(launch.impactTick, 94);
  assert.deepEqual(
    launch.pellets.map(({ pelletId }) => pelletId),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.deepEqual(
    launch.pellets.map(({ endpoint }) => endpoint),
    LOCAL_RAYS.map(([x, y]) => ({
      denominator: "1",
      xNumerator: String(x * 10),
      yNumerator: String(y * 10),
    })),
  );
});

test("pellet special: a near target intercepts all rays and aggregates damage", () => {
  const encounter = run([
    candidate(201, 500, { maxHealth: 2000, radius: 300 }),
  ]);
  assert.deepEqual(contacts(encounter), Array.from(
    { length: 10 },
    (_, index) => ({ pelletId: index + 1, targetId: 201 }),
  ));
  const aggregate = encounter.replay.find(
    ({ type }) => type === "pellet-aggregate-damage",
  );
  assert.deepEqual(aggregate, {
    amount: 840,
    pelletIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    targetId: 201,
    tick: 94,
    type: "pellet-aggregate-damage",
  });
  assert.equal(encounter.state.candidates[0].hitpoints, 1160);
});

test("pellet special: separate targets split the ten rays", () => {
  const candidates = LOCAL_RAYS.map(([x, y], index) =>
    candidate(201 + index, x * 10, { y: y * 10 })
  );
  const encounter = run(candidates);
  assert.deepEqual(contacts(encounter), candidates.map(({ id }, index) => ({
    pelletId: index + 1,
    targetId: id,
  })));
  assert.deepEqual(
    encounter.replay
      .filter(({ type }) => type === "pellet-aggregate-damage")
      .map(({ amount, pelletIds, targetId }) => ({
        amount,
        pelletIds,
        targetId,
      })),
    candidates.map(({ id }, index) => ({
      amount: 84,
      pelletIds: [index + 1],
      targetId: id,
    })),
  );
});

test("pellet special: each ray stops at its first contact", () => {
  const encounter = run([
    candidate(900, 3750, { y: -2000 }),
    candidate(201, 1875, { y: -1000 }),
  ]);
  assert.deepEqual(
    contacts(encounter).filter(({ pelletId }) => pelletId === 1),
    [{ pelletId: 1, targetId: 201 }],
  );
});

test("pellet special: equal contact parameters use stable target IDs", () => {
  const forward = run([
    candidate(900, 1875, { y: -1000 }),
    candidate(201, 1875, { y: -1000 }),
  ]);
  const reverse = run([
    candidate(201, 1875, { y: -1000 }),
    candidate(900, 1875, { y: -1000 }),
  ]);
  assert.equal(
    contacts(forward).find(({ pelletId }) => pelletId === 1).targetId,
    201,
  );
  assert.deepEqual(resultOf(createPelletSpecialFixture([
    candidate(900, 1875, { y: -1000 }),
    candidate(201, 1875, { y: -1000 }),
  ])), resultOf(createPelletSpecialFixture([
    candidate(201, 1875, { y: -1000 }),
    candidate(900, 1875, { y: -1000 }),
  ])));
  assert.deepEqual(contacts(reverse), contacts(forward));
});

for (const [name, aim, turns] of [
  ["east", { x: 1, y: 0 }, 0],
  ["north", { x: 0, y: 1 }, 1],
  ["west", { x: -1, y: 0 }, 2],
  ["south", { x: 0, y: -1 }, 3],
]) {
  test(`pellet special: exact capsule boundaries and one-millitile misses face ${name}`, () => {
    const encounter = run(boundaryCandidates(turns), aim);
    const pelletOne = contacts(encounter)
      .filter(({ pelletId }) => pelletId === 1)
      .map(({ targetId }) => targetId);
    assert.deepEqual(pelletOne, [201]);

    for (const [hitId, missId] of [[201, 202], [203, 204], [205, 206]]) {
      const hit = run(
        boundaryCandidates(turns).filter(({ id }) => id === hitId),
        aim,
      );
      const miss = run(
        boundaryCandidates(turns).filter(({ id }) => id === missId),
        aim,
      );
      assert.ok(
        contacts(hit).some(
          ({ pelletId, targetId }) => pelletId === 1 && targetId === hitId,
        ),
        `${name} boundary ${hitId}`,
      );
      assert.ok(
        !contacts(miss).some(({ pelletId }) => pelletId === 1),
        `${name} miss ${missId}`,
      );
    }
  });
}

for (const aim of [
  { x: 3, y: 4 },
  { x: 3, y: -4 },
  { x: -3, y: 4 },
  { x: -3, y: -4 },
]) {
  test(`pellet special: signed 3-4-5 aim ${aim.x},${aim.y} is exact`, () => {
    const cases = diagonalBoundaryCandidates(aim);
    for (let index = 0; index < cases.length; index += 2) {
      const hit = run([cases[index]], aim);
      const miss = run([cases[index + 1]], aim);
      assert.ok(contacts(hit).some(({ pelletId }) => pelletId === 1));
      assert.ok(!contacts(miss).some(({ pelletId }) => pelletId === 1));
    }
    const launch = new PelletEncounter(
      createPelletSpecialFixture([], aim),
    );
    launch.stepMany(85);
    const endpoint = launch.replay.find(
      ({ type }) => type === "pellet-volley-launch",
    ).pellets[0].endpoint;
    assert.equal(endpoint.denominator, "5");
    assert.ok(Number.isSafeInteger(Number(endpoint.xNumerator)));
    assert.ok(Number.isSafeInteger(Number(endpoint.yNumerator)));
  });
}

test("pellet special: ground, air, troops, and structures are eligible", () => {
  const cases = [
    candidate(201, 3750, { kind: "troop", layer: "ground", y: -2000 }),
    candidate(202, 3850, { kind: "troop", layer: "air", y: -1800 }),
    candidate(203, 4080, { kind: "structure", layer: "ground", y: -1190 }),
  ];
  const encounter = run(cases);
  assert.deepEqual(contacts(encounter).slice(0, 3), [
    { pelletId: 1, targetId: 201 },
    { pelletId: 2, targetId: 202 },
    { pelletId: 3, targetId: 203 },
  ]);
});

test("pellet special: dead and untargetable launch snapshots do not obstruct", () => {
  const encounter = run([
    candidate(201, 1875, { alive: false, y: -1000 }),
    candidate(202, 2500, { targetable: false, y: -1333 }),
    candidate(203, 3750, { y: -2000 }),
  ]);
  assert.deepEqual(
    contacts(encounter).filter(({ pelletId }) => pelletId === 1),
    [{ pelletId: 1, targetId: 203 }],
  );
});

test("pellet special: same-boundary commands resolve before launch", () => {
  for (const type of ["kill-attacker", "interrupt-attacker"]) {
    const encounter = run(
      [candidate(201, 500, { radius: 300 })],
      { x: 1, y: 0 },
      [{ targetId: null, tick: 84, type }],
    );
    assert.equal(encounter.state.launched, false);
    assert.equal(encounter.replay.at(-1).reason, "launch-cancelled");
    assert.equal(encounter.replay[0].type, "pellet-command");
  }
});

test("pellet special: death and interruption after launch do not recall pellets", () => {
  for (const type of ["kill-attacker", "interrupt-attacker"]) {
    const encounter = run(
      [candidate(201, 500, { radius: 300 })],
      { x: 1, y: 0 },
      [{ targetId: null, tick: 85, type }],
    );
    assert.equal(encounter.state.launched, true);
    assert.equal(contacts(encounter).length, 10);
  }
});

test("pellet special: impact-boundary target death is command-first and unobstructed", () => {
  const encounter = run([
    candidate(201, 1875, { y: -1000 }),
    candidate(202, 3750, { y: -2000 }),
  ], { x: 1, y: 0 }, [
    { targetId: 201, tick: 94, type: "kill-target" },
  ]);
  assert.deepEqual(
    contacts(encounter).filter(({ pelletId }) => pelletId === 1),
    [{ pelletId: 1, targetId: 202 }],
  );
  assert.equal(encounter.replay.findIndex(
    ({ type }) => type === "pellet-command",
  ) < encounter.replay.findIndex(
    ({ type }) => type === "pellet-contact",
  ), true);
});

test("pellet special: launch geometry is isolated from caller mutation", () => {
  const candidates = [candidate(201, 500, { radius: 300 })];
  const aim = { x: 1, y: 0 };
  const commands = [];
  const setup = createPelletSpecialFixture(candidates, aim, commands);
  const encounter = new PelletEncounter(setup);
  encounter.stepMany(85);
  candidates[0].position.x = -9999;
  aim.x = -1;
  commands.push({ targetId: null, tick: 85, type: "kill-attacker" });
  setup.candidates[0].position.x = -8888;
  setup.aim.x = -1;
  encounter.run();
  assert.equal(contacts(encounter).length, 10);
  assert.deepEqual(
    encounter.replay.find(({ type }) => type === "pellet-volley-launch")
      .pellets[0].endpoint,
    {
      denominator: "1",
      xNumerator: "3750",
      yNumerator: "-2000",
    },
  );
});

test("pellet special: fresh, reordered, and chunked runs are byte-identical", () => {
  const candidates = [
    candidate(900, 3750, { y: -2000 }),
    candidate(201, 500, { radius: 300 }),
  ];
  const setup = createPelletSpecialFixture(candidates);
  const expected = resultOf(setup);
  assert.deepEqual(resultOf(createPelletSpecialFixture(candidates)), expected);
  assert.deepEqual(
    resultOf(createPelletSpecialFixture([...candidates].reverse())),
    expected,
  );
  const chunked = new PelletEncounter(setup);
  for (const chunk of [1, 7, 13, 16, 3, 8, 21, 2, 24, 99]) {
    chunked.stepMany(chunk);
  }
  chunked.run();
  assert.deepEqual({
    replay: chunked.replay,
    snapshot: chunked.serialize(),
    state: chunked.state,
  }, expected);
  assert.equal(
    JSON.stringify(resultOf(createPelletSpecialFixture(candidates))),
    JSON.stringify(expected),
  );
});

test("pellet special: every-tick restore is byte-identical", () => {
  const setup = createPelletSpecialFixture([
    candidate(201, 500, { maxHealth: 500, radius: 300 }),
    candidate(202, 3750, { y: -2000 }),
  ], { x: 1, y: 0 }, [
    { targetId: null, tick: 85, type: "interrupt-attacker" },
  ]);
  const expected = resultOf(setup);
  for (let split = 0; split <= expected.state.tick; split += 1) {
    const partial = new PelletEncounter(setup);
    partial.stepMany(split);
    const restored = PelletEncounter.restore(partial.serialize());
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

test("pellet special: invalid and unsafe aims fail closed", () => {
  for (const aim of [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 3 },
    { x: 1.5, y: 0 },
    { x: Number.MAX_SAFE_INTEGER, y: 0 },
  ]) {
    assert.throws(() => createPelletSpecialFixture([], aim));
  }
});

test("pellet special: hostile accessors and prototypes are rejected unread", () => {
  let getterCalls = 0;
  const accessor = candidate(201, 500, { radius: 300 });
  Object.defineProperty(accessor.position, "x", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 500;
    },
  });
  assert.throws(
    () => createPelletSpecialFixture([accessor]),
    /data property|invalid shape/u,
  );
  assert.equal(getterCalls, 0);

  const aim = { x: 1, y: 0 };
  Object.defineProperty(aim, "x", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 1;
    },
  });
  assert.throws(() => createPelletSpecialFixture([], aim), /invalid shape/u);
  assert.equal(getterCalls, 0);

  const foreign = Object.create({ inherited: true });
  Object.assign(foreign, candidate(201, 500));
  assert.throws(() => createPelletSpecialFixture([foreign]), /plain object/u);
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => createPelletSpecialFixture(sparse), /dense/u);
  const extra = [candidate(201, 500)];
  extra.extra = true;
  assert.throws(() => createPelletSpecialFixture(extra), /dense/u);
});

test("pellet special: malformed, duplicate, unsafe, and oversized inputs reject", () => {
  for (const candidates of [
    new Array(33).fill(null).map((_, index) =>
      candidate(200 + index, 500 + index)
    ),
    [candidate(101, 500)],
    [candidate(201, 500), candidate(201, 600)],
    [{ ...candidate(201, 500), extra: true }],
    [candidate(201, Number.MAX_SAFE_INTEGER)],
    [candidate(201, 500, { radius: Number.MAX_SAFE_INTEGER })],
    [candidate(201, 500, { maxHealth: Number.MAX_SAFE_INTEGER + 1 })],
    [candidate(201, 500, { kind: "effect" })],
    [candidate(201, 500, { layer: "both" })],
  ]) {
    assert.throws(() => createPelletSpecialFixture(candidates));
  }
  assert.throws(
    () => createPelletSpecialFixture([], { x: 1, y: 0 }, [], "extra"),
    /extra arguments/u,
  );
});

test("pellet special: command and execution bounds reject", () => {
  const valid = [candidate(201, 500)];
  for (const commands of [
    new Array(25).fill(null).map((_, tick) => ({
      targetId: null,
      tick,
      type: "interrupt-attacker",
    })),
    [{ targetId: null, tick: -1, type: "kill-attacker" }],
    [{ targetId: null, tick: 95, type: "kill-attacker" }],
    [{ targetId: 999, tick: 1, type: "kill-target" }],
    [{ targetId: 201, tick: 1, type: "kill-attacker" }],
    [{ targetId: null, tick: 1, type: "kill-target" }],
    [{ targetId: null, tick: 1, type: "unknown" }],
    [{ extra: true, targetId: null, tick: 1, type: "kill-attacker" }],
  ]) {
    assert.throws(() =>
      createPelletSpecialFixture(valid, { x: 1, y: 0 }, commands)
    );
  }
  const encounter = new PelletEncounter();
  assert.throws(() => encounter.stepMany(-1));
  assert.throws(() => encounter.run(96), /exceeds its bound/u);
});

test("pellet special: output, replay, and snapshot bounds hold", () => {
  const encounter = new PelletEncounter();
  encounter.run();
  const replay = encounter.replay;
  const state = encounter.state;
  replay.length = 0;
  state.candidates[0].hitpoints = 9999;
  assert.ok(encounter.replay.length > 0);
  assert.notEqual(encounter.state.candidates[0].hitpoints, 9999);
  assert.ok(encounter.replay.length <= 256);
  assert.ok(encounter.serialize().length <= 65_536);
});

test("pellet special: snapshots reject oversized, extra, and non-causal data", () => {
  const encounter = new PelletEncounter();
  encounter.stepMany(85);
  const canonical = encounter.serialize();
  assert.equal(PelletEncounter.restore(canonical).serialize(), canonical);
  const raw = JSON.parse(canonical);
  for (const serialized of [
    "no",
    "{}",
    JSON.stringify({ ...raw, version: 2 }),
    JSON.stringify({ ...raw, tick: -1 }),
    JSON.stringify({ ...raw, tick: 96 }),
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
    assert.throws(() => PelletEncounter.restore(serialized));
  }
  assert.throws(() => PelletEncounter.restore({}), /must be a string/u);

  const cancelled = new PelletEncounter(createPelletSpecialFixture(
    [candidate(201, 500)],
    { x: 1, y: 0 },
    [{ targetId: null, tick: 0, type: "kill-attacker" }],
  ));
  cancelled.run();
  const postTerminal = JSON.parse(cancelled.serialize());
  postTerminal.tick += 1;
  assert.throws(
    () => PelletEncounter.restore(JSON.stringify(postTerminal)),
    /post-terminal time/u,
  );
});

test("pellet special: shipped source has original identity and explicit nonclaims", () => {
  const source = readFileSync(
    new URL(
      "../src/content/cards/special-projectiles-pellets.js",
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
    "pellet-count",
    "ray-pattern",
    "range",
    "speed",
    "width",
    "damage-per-pellet",
    "first-contact",
    "obstruction",
    "aggregation",
    "event-order",
    "launch-snapshot",
    "death",
    "interruption",
    "target-eligibility",
    "same-boundary",
    "animation",
    "visual",
    "audio",
    "full-match",
  ]) {
    assert.match(source, new RegExp(nonClaim, "u"));
  }
});
