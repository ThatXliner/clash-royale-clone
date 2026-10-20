import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ForcedKnockbackEncounter,
  createKnockbackQuestionRecords,
  createKnockbackSpecialCatalog,
  createKnockbackSpecialFixture,
  evaluateForcedKnockbackQuestionBoundary,
} from "../src/content/cards/special-movement-knockback.js";

const MODULE_URL = new URL(
  "../src/content/cards/special-movement-knockback.js",
  import.meta.url,
);

function victim({
  eligible = true,
  id = 1,
  position = { x: 9000, y: 16000 },
  radius = 400,
} = {}) {
  return { eligible, id, position, radius };
}

function evaluate(source, oneVictim, distance) {
  return evaluateForcedKnockbackQuestionBoundary(
    source,
    [oneVictim],
    distance,
  )[0];
}

test("knockback special: original identity maps ordinary fields to the test-only benchmark", () => {
  const catalog = createKnockbackSpecialCatalog();
  const original = catalog.find(({ id }) => id === "squall-orb");
  const corpus = JSON.parse(readFileSync(
    new URL("../reference/stats/cards.json", import.meta.url),
    "utf8",
  ));
  const protectedBenchmarkName = "Fireball";
  const benchmark = corpus.cards.find(
    ({ name }) => name === protectedBenchmarkName,
  );
  assert.deepEqual(
    {
      areaDamageRadiusMillitiles: original.areaDamageRadiusMillitiles,
      cost: original.cost,
      damage: original.damage,
      targetMode: original.targetMode,
    },
    {
      areaDamageRadiusMillitiles:
        benchmark.area_damage_radius_tiles * 1000,
      cost: benchmark.elixir_cost,
      damage: benchmark.damage,
      targetMode: "ground-and-air",
    },
  );
  assert.deepEqual(benchmark.unverified_fields, [
    "targets",
    "area_damage_radius_tiles",
  ]);
  assert.notEqual(original.displayName, protectedBenchmarkName);
});

test("knockback special: each absent policy and mapped field is a separate fresh frozen QUESTION", () => {
  const first = createKnockbackQuestionRecords();
  const second = createKnockbackQuestionRecords();
  assert.notEqual(first, second);
  assert.deepEqual(Object.keys(first), [
    "arenaClamp",
    "collision",
    "distance",
    "eligibility",
    "interruption",
    "mappedAreaDamageRadius",
    "mappedTargets",
    "order",
    "timing",
    "vector",
    "zeroVector",
  ]);
  assert.equal(Object.keys(first).length, 11);
  for (const [name, record] of Object.entries(first)) {
    assert.equal(record.authoritative, false, name);
    assert.equal(record.confidence, "unverified", name);
    assert.equal(record.disposition, "question", name);
    assert.equal(record.source, "unsourced-external-knockback-fixture", name);
    assert.equal(Object.isFrozen(record), true, name);
    assert.notEqual(record, second[name], name);
  }
  assert.equal(Object.isFrozen(first), true);
  assert.throws(() => {
    first.vector.value = "mutated";
  }, TypeError);
  assert.throws(() => createKnockbackQuestionRecords("override"));
});

test("knockback special: exact integer projection covers axes and every signed 3-4-5 diagonal", () => {
  const source = { x: 9000, y: 16000 };
  const vectors = [
    [1000, 0],
    [-1000, 0],
    [0, 1000],
    [0, -1000],
    [3000, 4000],
    [3000, -4000],
    [-3000, 4000],
    [-3000, -4000],
    [4000, 3000],
    [4000, -3000],
    [-4000, 3000],
    [-4000, -3000],
  ];
  for (const [dx, dy] of vectors) {
    const result = evaluate(source, victim({
      position: { x: source.x + dx, y: source.y + dy },
      radius: 0,
    }), dx === 0 || dy === 0 ? 1000 : 5000);
    const divisor = dx === 0 || dy === 0 ? 1 : 1;
    assert.deepEqual(
      result.requested,
      dx === 0 || dy === 0
        ? { x: Math.sign(dx) * 1000, y: Math.sign(dy) * 1000 }
        : { x: dx / divisor, y: dy / divisor },
    );
    assert.deepEqual(result.applied, result.requested);
    assert.deepEqual(result.blocked, { x: 0, y: 0 });
    assert.equal(result.clamped, false);
  }
});

test("knockback special: zero and non-integral vectors reject without rounding", () => {
  assert.throws(
    () => evaluate(
      { x: 9000, y: 16000 },
      victim({ position: { x: 9000, y: 16000 } }),
      1000,
    ),
    /zero vector/,
  );
  assert.throws(
    () => evaluate(
      { x: 9000, y: 16000 },
      victim({ position: { x: 9001, y: 16001 } }),
      1000,
    ),
    /exact integer millitile value/,
  );
  assert.throws(
    () => evaluate(
      { x: 9000, y: 16000 },
      victim({ position: { x: 9003, y: 16004 } }),
      1,
    ),
    /exact integer components/,
  );
});

test("knockback special: radius-inset tangency and both ±1 sides are exact on all arena edges", () => {
  const radius = 400;
  const cases = [
    {
      axis: "x",
      origin: { x: 1400, y: 16000 },
      sign: -1,
      source: { x: 2400, y: 16000 },
    },
    {
      axis: "x",
      origin: { x: 16600, y: 16000 },
      sign: 1,
      source: { x: 15600, y: 16000 },
    },
    {
      axis: "y",
      origin: { x: 9000, y: 1400 },
      sign: -1,
      source: { x: 9000, y: 2400 },
    },
    {
      axis: "y",
      origin: { x: 9000, y: 30600 },
      sign: 1,
      source: { x: 9000, y: 29600 },
    },
  ];
  for (const edge of cases) {
    for (const distance of [999, 1000, 1001]) {
      const result = evaluate(
        edge.source,
        victim({ position: edge.origin, radius }),
        distance,
      );
      const expectedApplied = edge.sign * Math.min(distance, 1000);
      const expectedBlocked = distance > 1000
        ? edge.sign * (distance - 1000)
        : 0;
      assert.equal(result.applied[edge.axis], expectedApplied);
      assert.equal(result.blocked[edge.axis], expectedBlocked);
      assert.equal(result.clamped, distance === 1001);
      assert.equal(
        result.position[edge.axis],
        edge.origin[edge.axis] + expectedApplied,
      );
    }
  }
});

test("knockback special: stable victim order and eligibility are explicit", () => {
  const source = { x: 9000, y: 16000 };
  const results = evaluateForcedKnockbackQuestionBoundary(source, [
    victim({ id: 9, position: { x: 12000, y: 20000 } }),
    victim({
      eligible: false,
      id: 2,
      position: { x: 9000, y: 16000 },
    }),
    victim({ id: 5, position: { x: 6000, y: 12000 } }),
  ]);
  assert.deepEqual(results.map(({ id }) => id), [2, 5, 9]);
  assert.deepEqual(results[0], {
    applied: { x: 0, y: 0 },
    blocked: { x: 0, y: 0 },
    clamped: false,
    eligible: false,
    id: 2,
    origin: { x: 9000, y: 16000 },
    position: { x: 9000, y: 16000 },
    requested: { x: 0, y: 0 },
  });
  assert.deepEqual(results[1].requested, { x: -1200, y: -1600 });
  assert.deepEqual(results[2].requested, { x: 1200, y: 1600 });
});

test("knockback special: collision policy is arena-only and does not separate victims", () => {
  const results = evaluateForcedKnockbackQuestionBoundary(
    { x: 9000, y: 15000 },
    [
      victim({ id: 7, position: { x: 9000, y: 16000 } }),
      victim({ id: 3, position: { x: 9000, y: 16000 } }),
    ],
    1000,
  );
  assert.deepEqual(results.map(({ id }) => id), [3, 7]);
  assert.deepEqual(results.map(({ position }) => position), [
    { x: 9000, y: 17000 },
    { x: 9000, y: 17000 },
  ]);
});

test("knockback special: overflow and unsafe values reject the whole batch atomically", () => {
  const source = { x: 9000, y: 16000 };
  const victims = [
    victim({ id: 1, position: { x: 10000, y: 16000 }, radius: 0 }),
    victim({ id: 2, position: { x: 8000, y: 16000 }, radius: 0 }),
  ];
  const before = structuredClone(victims);
  assert.throws(
    () => evaluateForcedKnockbackQuestionBoundary(
      source,
      victims,
      Number.MAX_SAFE_INTEGER,
    ),
    /safe integer range/,
  );
  assert.deepEqual(victims, before);
  for (const hostileDistance of [
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    1n,
    { valueOf: () => 1 },
  ]) {
    assert.throws(() =>
      evaluateForcedKnockbackQuestionBoundary(
        source,
        victims,
        hostileDistance,
      )
    );
    assert.deepEqual(victims, before);
  }
});

test("knockback special: caller inputs and returned results are isolated", () => {
  const source = { x: 9000, y: 16000 };
  const victims = [
    victim({ id: 3, position: { x: 12000, y: 20000 } }),
  ];
  const result = evaluateForcedKnockbackQuestionBoundary(source, victims);
  source.x = 0;
  victims[0].position.x = 0;
  result[0].position.x = 0;
  const repeated = evaluateForcedKnockbackQuestionBoundary(
    { x: 9000, y: 16000 },
    [victim({ id: 3, position: { x: 12000, y: 20000 } })],
  );
  assert.deepEqual(repeated[0].position, { x: 13200, y: 21600 });

  const setup = createKnockbackSpecialFixture([], "open");
  const encounter = new ForcedKnockbackEncounter(setup);
  setup.scenario = "edge";
  const output = encounter.run();
  output.victims[0].position.x = 0;
  assert.notEqual(encounter.state.victims[0].position.x, 0);
});

test("knockback special: hostile getters, prototypes, sparse, extra, duplicate, and oversized input reject", () => {
  let getterCalls = 0;
  const accessorVictim = victim();
  Object.defineProperty(accessorVictim, "radius", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 400;
    },
  });
  const accessorSource = { y: 16000 };
  Object.defineProperty(accessorSource, "x", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 9000;
    },
  });
  const sparse = [];
  sparse.length = 1;
  const inherited = Object.create({ eligible: true });
  Object.assign(inherited, {
    id: 1,
    position: { x: 10000, y: 16000 },
    radius: 0,
  });
  const withExtra = victim();
  withExtra.extra = true;
  const arrayExtra = [victim()];
  arrayExtra.extra = true;
  for (const [source, victims] of [
    [{ x: 9000, y: 16000 }, [accessorVictim]],
    [accessorSource, [victim()]],
    [{ x: 9000, y: 16000 }, sparse],
    [{ x: 9000, y: 16000 }, [inherited]],
    [{ x: 9000, y: 16000 }, [withExtra]],
    [{ x: 9000, y: 16000 }, [
      victim({ id: 1 }),
      victim({ id: 1, position: { x: 10000, y: 16000 } }),
    ]],
    [{ x: 9000, y: 16000 }, Array.from(
      { length: 17 },
      (_, index) => victim({
        eligible: false,
        id: index + 1,
        position: { x: 9000, y: 16000 },
      }),
    )],
    [{ x: 9000, y: 16000 }, arrayExtra],
  ]) {
    assert.throws(() =>
      evaluateForcedKnockbackQuestionBoundary(source, victims)
    );
  }
  assert.equal(getterCalls, 0);
});

test("knockback special: encounter emits one externally forced pulse in stable victim order", () => {
  const encounter = new ForcedKnockbackEncounter(
    createKnockbackSpecialFixture([], "open"),
  );
  assert.deepEqual(encounter.step(), []);
  assert.deepEqual(encounter.step(), []);
  const pulse = encounter.step();
  assert.equal(pulse.length, 1);
  assert.equal(pulse[0].type, "external-forced-knockback");
  assert.equal(pulse[0].tick, 2);
  assert.deepEqual(pulse[0].results.map(({ id }) => id), [12, 20, 31]);
  assert.deepEqual(pulse[0].results.map(({ requested }) => requested), [
    { x: -1200, y: -1600 },
    { x: 0, y: 0 },
    { x: 1200, y: 1600 },
  ]);
  assert.deepEqual(encounter.step(), []);
  assert.equal(encounter.state.terminal, true);
});

test("knockback special: edge encounter reports requested, applied, and blocked vectors", () => {
  const encounter = new ForcedKnockbackEncounter(
    createKnockbackSpecialFixture([], "edge"),
  );
  const event = encounter.stepMany(3).find(
    ({ type }) => type === "external-forced-knockback",
  );
  assert.deepEqual(event.results[1], {
    applied: { x: -100, y: -100 },
    blocked: { x: -1100, y: -1500 },
    clamped: true,
    eligible: true,
    id: 31,
    origin: { x: 500, y: 500 },
    position: { x: 400, y: 400 },
    requested: { x: -1200, y: -1600 },
  });
});

test("knockback special: command-first interruption suppresses the entire external pulse", () => {
  for (const tick of [0, 1, 2]) {
    const encounter = new ForcedKnockbackEncounter(
      createKnockbackSpecialFixture([{ tick, type: "interrupt" }], "open"),
    );
    const state = encounter.run();
    assert.equal(state.interrupted, true);
    assert.equal(
      state.events.some(({ type }) => type === "external-forced-knockback"),
      false,
    );
    assert.deepEqual(
      state.victims.map(({ position }) => position),
      [
        { x: 12000, y: 20000 },
        { x: 9000, y: 20000 },
        { x: 6000, y: 12000 },
      ],
    );
  }
});

test("knockback special: fresh, chunked, and every-boundary restore are byte-identical", () => {
  const setups = [
    createKnockbackSpecialFixture([], "open"),
    createKnockbackSpecialFixture([], "edge"),
    createKnockbackSpecialFixture([{ tick: 2, type: "interrupt" }], "open"),
  ];
  for (const setup of setups) {
    const fresh = new ForcedKnockbackEncounter(setup);
    fresh.run();
    const expectedBytes = fresh.serialize();
    const expectedState = fresh.state;

    const chunked = new ForcedKnockbackEncounter(setup);
    chunked.stepMany(1);
    chunked.stepMany(2);
    chunked.stepMany(1);
    assert.equal(chunked.serialize(), expectedBytes);
    assert.deepEqual(chunked.state, expectedState);

    for (let boundary = 0; boundary <= 4; boundary += 1) {
      const partial = new ForcedKnockbackEncounter(setup);
      partial.stepMany(boundary);
      const boundaryBytes = partial.serialize();
      const restored = ForcedKnockbackEncounter.restore(boundaryBytes);
      assert.equal(restored.serialize(), boundaryBytes);
      restored.run();
      assert.equal(restored.serialize(), expectedBytes);
      assert.deepEqual(restored.state, expectedState);
    }
  }
});

test("knockback special: canonical bounded snapshots reject hostile and foreign state", () => {
  const encounter = new ForcedKnockbackEncounter();
  encounter.stepMany(2);
  const canonical = encounter.serialize();
  const parsed = JSON.parse(canonical);
  const hostile = [
    null,
    {},
    { ...parsed, version: 2 },
    { ...parsed, extra: true },
    { ...parsed, tick: -1 },
    { ...parsed, tick: 5 },
    {
      ...parsed,
      identity: { ...parsed.identity, encounter: "foreign" },
    },
    {
      ...parsed,
      identity: { ...parsed.identity, scenario: "foreign" },
    },
    {
      ...parsed,
      identity: { ...parsed.identity, extra: true },
    },
  ];
  for (const value of hostile) {
    assert.throws(() =>
      ForcedKnockbackEncounter.restore(JSON.stringify(value))
    );
  }
  assert.throws(() => ForcedKnockbackEncounter.restore({}));
  assert.throws(() => ForcedKnockbackEncounter.restore("{"));
  assert.throws(() =>
    ForcedKnockbackEncounter.restore(JSON.stringify(parsed, null, 2))
  , /canonical/);
  assert.throws(() =>
    ForcedKnockbackEncounter.restore(
      canonical.replace('"tick":2', '"tick":2,"tick":2'),
    )
  , /canonical/);
  assert.throws(() =>
    ForcedKnockbackEncounter.restore(`"${"é".repeat(4096)}"`)
  , /byte bound/);
});

test("knockback special: fixture commands reject hostile shapes and remain bounded", () => {
  let getterCalls = 0;
  const command = { type: "interrupt" };
  Object.defineProperty(command, "tick", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 1;
    },
  });
  const sparse = [];
  sparse.length = 1;
  for (const commands of [
    [command],
    sparse,
    [{ tick: 0, type: "interrupt", extra: true }],
    [{ tick: 0, type: "interrupt" }, { tick: 1, type: "interrupt" }],
    [{ tick: 3, type: "interrupt" }],
    [{ tick: 0, type: "attack-recoil" }],
  ]) {
    assert.throws(() => createKnockbackSpecialFixture(commands));
  }
  assert.equal(getterCalls, 0);
});

test("knockback special: shipped runtime keeps protected identity test-only and exposes no composed lifecycle", () => {
  const source = readFileSync(MODULE_URL, "utf8");
  for (const protectedName of [
    "Fireball",
    "Giant Snowball",
    "The Log",
    "Bowler",
  ]) {
    assert.equal(source.includes(protectedName), false, protectedName);
  }
  assert.match(source, /not attack-triggered recoil/);
  assert.match(source, /no charge, leap, dash, retarget/);
  assert.deepEqual(
    Object.getOwnPropertyNames(ForcedKnockbackEncounter.prototype).sort(),
    ["constructor", "run", "serialize", "state", "step", "stepMany"],
  );
});
