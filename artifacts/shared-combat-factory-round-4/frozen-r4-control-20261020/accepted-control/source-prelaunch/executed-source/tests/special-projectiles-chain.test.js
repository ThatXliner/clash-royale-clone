import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ChainEncounter,
  createChainQuestionFixture,
  createChainSpecialCatalog,
  createChainSpecialFixture,
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
  ["electro-dragon"],
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

function run(candidates, primaryTargetId = 201, commands = []) {
  const encounter = new ChainEncounter(
    createChainSpecialFixture(candidates, primaryTargetId, commands),
  );
  encounter.run();
  return encounter;
}

function hitIds(encounter) {
  return encounter.replay
    .filter(({ type }) => type === "chain-hit")
    .map(({ targetId }) => targetId);
}

function resultOf(setup) {
  const encounter = new ChainEncounter(setup);
  encounter.run();
  return {
    replay: encounter.replay,
    snapshot: encounter.serialize(),
    state: encounter.state,
  };
}

test("chain special: original definition maps only in tests to base fields", () => {
  const catalog = createChainSpecialCatalog();
  assert.deepEqual(catalog, [{
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 5,
    count: 1,
    damage: 192,
    deployTimeTicks: 60,
    displayName: "Stormkite",
    firstHitTicks: 84,
    hitSpeedTicks: 126,
    hitpoints: 950,
    id: "stormkite",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 3500,
    rarity: "special",
    sightRangeMillitiles: 5500,
    targetMode: "ground-and-air",
  }]);
  catalog[0].hitpoints = 1;
  assert.equal(createChainSpecialCatalog()[0].hitpoints, 950);

  const report = parity(createChainSpecialCatalog()[0], "electro-dragon");
  assert.deepEqual(report.authoritativeFailures, []);
  assert.ok(report.fields.every(({ disposition }) =>
    disposition === "match" || disposition === "question-backed-match"
  ));
});

test("chain special: every absent number and policy is its own frozen question", () => {
  const fixture = createChainQuestionFixture();
  assert.deepEqual(
    Object.fromEntries(Object.entries(fixture).map(([key, record]) => [
      key,
      record.value,
    ])),
    {
      attackerCancellationRule:
        "death-through-primary-boundary-cancels;death-after-primary-does-not-cancel",
      candidateDeathRule: "dead-before-selection-is-ineligible",
      damagePerHop: 192,
      eventOrderRule:
        "commands-then-start-hit-damage-death-then-pending-or-complete",
      hopDelayTicks: 1,
      hopRangeMillitiles: 3000,
      lethalHopRule:
        "lethal-current-hit-keeps-snapshotted-origin-and-does-not-cancel-continuation",
      rangeRule: "circle-edge-to-circle-edge-inclusive",
      selectionRule:
        "explicit-primary-then-nearest-eligible-unhit-center-distance-stable-id",
      targetCap: 3,
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
      source: "unsourced-chained-target-attack-fixture",
    });
  }
  const second = createChainQuestionFixture();
  assert.notEqual(second, fixture);
  assert.notEqual(second.targetCap, fixture.targetCap);
  assert.throws(() => {
    fixture.targetCap.value = 4;
  }, TypeError);
  assert.throws(
    () => createChainQuestionFixture({ targetCap: 4 }),
    /does not accept overrides/u,
  );
});

test("chain special: explicit primary resolves before a closer candidate", () => {
  const encounter = run([
    candidate(201, 4000),
    candidate(202, 2000),
  ]);
  assert.deepEqual(hitIds(encounter), [201, 202]);
  assert.deepEqual(
    encounter.replay.filter(({ type }) =>
      type === "chain-start" || type === "chain-hit"
    ).map(({ type, targetId }) => ({ type, targetId })),
    [
      { targetId: 201, type: "chain-start" },
      { targetId: 201, type: "chain-hit" },
      { targetId: 202, type: "chain-hit" },
    ],
  );
});

test("chain special: each hop chooses nearest eligible unhit target", () => {
  const encounter = run([
    candidate(201, 4000),
    candidate(202, 6500),
    candidate(203, 7000),
    candidate(204, 9000),
  ]);
  assert.deepEqual(hitIds(encounter), [201, 202, 203]);
  assert.equal(new Set(hitIds(encounter)).size, 3);
});

test("chain special: exact hop boundary is included", () => {
  const encounter = run([
    candidate(201, 4000),
    candidate(202, 7000),
  ]);
  assert.deepEqual(hitIds(encounter), [201, 202]);
});

test("chain special: one millitile beyond hop boundary misses", () => {
  const encounter = run([
    candidate(201, 4000),
    candidate(202, 7001),
  ]);
  assert.deepEqual(hitIds(encounter), [201]);
  assert.equal(
    encounter.replay.find(({ type }) => type === "chain-complete").reason,
    "no-eligible-target",
  );
});

test("chain special: circle edges participate in the inclusive boundary", () => {
  const edge = run([
    candidate(201, 4000, { radius: 100 }),
    candidate(202, 7300, { radius: 200 }),
  ]);
  const miss = run([
    candidate(201, 4000, { radius: 100 }),
    candidate(202, 7301, { radius: 200 }),
  ]);
  assert.deepEqual(hitIds(edge), [201, 202]);
  assert.deepEqual(hitIds(miss), [201]);
});

test("chain special: stable-ID tie is independent of candidate order", () => {
  const primary = candidate(201, 4000);
  const low = candidate(202, 4000, { y: 1000 });
  const high = candidate(203, 4000, { y: 7000 });
  const first = createChainSpecialFixture([primary, high, low], 201);
  const second = createChainSpecialFixture([low, primary, high], 201);
  assert.deepEqual(hitIds(run(first.candidates, 201)), [201, 202]);
  assert.deepEqual(resultOf(first), resultOf(second));
});

test("chain special: target cap stops a reachable chain without repeats", () => {
  const encounter = run([
    candidate(201, 4000),
    candidate(202, 5000),
    candidate(203, 6000),
    candidate(204, 7000),
    candidate(205, 8000),
  ]);
  assert.deepEqual(hitIds(encounter), [201, 202, 203]);
  assert.deepEqual(
    encounter.replay.find(({ type }) => type === "chain-complete"),
    {
      hitTargetIds: [201, 202, 203],
      reason: "target-cap",
      tick: 86,
      type: "chain-complete",
    },
  );
});

test("chain special: air, ground, troop, and structure targets are eligible", () => {
  const airAndStructure = run([
    candidate(201, 4000, { layer: "ground" }),
    candidate(202, 6000, { layer: "air" }),
    candidate(203, 8000, { kind: "structure", layer: "ground" }),
  ]);
  assert.deepEqual(hitIds(airAndStructure), [201, 202, 203]);
});

test("chain special: initially dead and untargetable candidates are skipped", () => {
  const encounter = run([
    candidate(201, 4000),
    candidate(202, 5000, { alive: false }),
    candidate(203, 5500, { targetable: false }),
    candidate(204, 6000),
  ]);
  assert.deepEqual(hitIds(encounter), [201, 204]);
  const state = encounter.state.candidates;
  assert.equal(state.find(({ id }) => id === 202).alive, false);
  assert.equal(state.find(({ id }) => id === 203).hitpoints, 500);
});

test("chain special: every hop deals full fixture damage and lethal hops continue", () => {
  const encounter = run([
    candidate(201, 4000, { maxHealth: 100 }),
    candidate(202, 6000, { maxHealth: 500 }),
    candidate(203, 8000, { maxHealth: 192 }),
  ]);
  assert.deepEqual(hitIds(encounter), [201, 202, 203]);
  assert.deepEqual(
    encounter.replay.filter(({ type }) => type === "chain-damage")
      .map(({ amount, currentHealthAfter, targetId }) => ({
        amount,
        currentHealthAfter,
        targetId,
      })),
    [
      { amount: 192, currentHealthAfter: 0, targetId: 201 },
      { amount: 192, currentHealthAfter: 308, targetId: 202 },
      { amount: 192, currentHealthAfter: 0, targetId: 203 },
    ],
  );
  assert.deepEqual(
    encounter.replay.filter(({ type }) => type === "chain-death")
      .map(({ targetId }) => targetId),
    [201, 203],
  );
});

test("chain special: death before selection excludes a candidate", () => {
  const encounter = run([
    candidate(201, 4000),
    candidate(202, 5000),
    candidate(203, 6000),
  ], 201, [{ targetId: 202, tick: 85, type: "kill-target" }]);
  assert.deepEqual(hitIds(encounter), [201, 203]);
  assert.deepEqual(
    encounter.replay.filter(({ tick }) => tick === 85).map(({ type }) => type),
    [
      "chain-command",
      "external-damage",
      "external-death",
      "chain-hit",
      "chain-damage",
      "chain-hop-pending",
    ],
  );
});

test("chain special: attacker death through primary boundary cancels", () => {
  for (const tick of [0, 84]) {
    const encounter = run([
      candidate(201, 4000),
      candidate(202, 5000),
    ], 201, [{ targetId: null, tick, type: "kill-attacker" }]);
    assert.deepEqual(hitIds(encounter), []);
    assert.equal(
      encounter.replay.find(({ type }) => type === "chain-complete").reason,
      "attacker-dead-before-primary",
    );
  }
});

test("chain special: attacker death after primary does not cancel continuation", () => {
  const encounter = run([
    candidate(201, 4000),
    candidate(202, 5000),
    candidate(203, 6000),
  ], 201, [{ targetId: null, tick: 85, type: "kill-attacker" }]);
  assert.deepEqual(hitIds(encounter), [201, 202, 203]);
  assert.equal(encounter.state.attackerAlive, false);
});

test("chain special: event order is deterministic at primary and terminal hops", () => {
  const encounter = run([
    candidate(201, 4000, { maxHealth: 100 }),
    candidate(202, 5000, { maxHealth: 100 }),
    candidate(203, 6000, { maxHealth: 100 }),
  ]);
  assert.deepEqual(
    encounter.replay.filter(({ tick }) => tick === 84).map(({ type }) => type),
    [
      "chain-start",
      "chain-hit",
      "chain-damage",
      "chain-death",
      "chain-hop-pending",
    ],
  );
  assert.deepEqual(
    encounter.replay.filter(({ tick }) => tick === 86).map(({ type }) => type),
    [
      "chain-hit",
      "chain-damage",
      "chain-death",
      "chain-complete",
    ],
  );
});

test("chain special: fresh runs and reordered candidates are byte-identical", () => {
  const candidates = [
    candidate(203, 6000),
    candidate(201, 4000),
    candidate(202, 5000),
  ];
  const reversed = [...candidates].reverse();
  const first = resultOf(createChainSpecialFixture(candidates, 201));
  const second = resultOf(createChainSpecialFixture(candidates, 201));
  const reordered = resultOf(createChainSpecialFixture(reversed, 201));
  assert.deepEqual(second, first);
  assert.deepEqual(reordered, first);
  assert.equal(JSON.stringify(second), JSON.stringify(first));
  assert.equal(JSON.stringify(reordered), JSON.stringify(first));
});

test("chain special: arbitrary chunks preserve replay, state, and snapshot", () => {
  const setup = createChainSpecialFixture([
    candidate(201, 4000),
    candidate(202, 5000),
    candidate(203, 6000),
  ], 201, [{ targetId: null, tick: 85, type: "kill-attacker" }]);
  const expected = resultOf(setup);
  const chunked = new ChainEncounter(setup);
  for (const chunk of [1, 17, 31, 35, 1, 2, 99]) {
    chunked.stepMany(chunk);
  }
  chunked.run();
  assert.deepEqual({
    replay: chunked.replay,
    snapshot: chunked.serialize(),
    state: chunked.state,
  }, expected);
});

test("chain special: every causal restore split is byte-identical", () => {
  const setup = createChainSpecialFixture([
    candidate(201, 4000, { maxHealth: 100 }),
    candidate(202, 5000),
    candidate(203, 6000),
    candidate(204, 7000),
  ], 201, [{ targetId: null, tick: 85, type: "kill-attacker" }]);
  const expected = resultOf(setup);
  for (let split = 0; split <= expected.state.tick; split += 1) {
    const partial = new ChainEncounter(setup);
    partial.stepMany(split);
    const restored = ChainEncounter.restore(partial.serialize());
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

test("chain special: hostile setup fails closed without invoking getters", () => {
  let getterCalls = 0;
  const accessor = candidate(201, 4000);
  Object.defineProperty(accessor, "alive", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return true;
    },
  });
  assert.throws(
    () => createChainSpecialFixture([accessor], 201),
    /invalid shape/u,
  );
  assert.equal(getterCalls, 0);

  const foreign = Object.create({ inherited: true });
  Object.assign(foreign, candidate(201, 4000));
  assert.throws(
    () => createChainSpecialFixture([foreign], 201),
    /plain object/u,
  );
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => createChainSpecialFixture(sparse, 201), /dense/u);
  const extraArray = [candidate(201, 4000)];
  extraArray.extra = true;
  assert.throws(() => createChainSpecialFixture(extraArray, 201), /dense/u);

  for (const candidates of [
    [],
    new Array(17).fill(null).map((_, index) =>
      candidate(200 + index, 4000 + index)
    ),
    [candidate(101, 4000)],
    [candidate(201, 4000), candidate(201, 5000)],
    [{ ...candidate(201, 4000), surprise: true }],
    [candidate(201, Number.MAX_SAFE_INTEGER)],
    [candidate(201, 4000, { maxHealth: Number.MAX_SAFE_INTEGER + 1 })],
  ]) {
    assert.throws(() => createChainSpecialFixture(candidates, 201));
  }

  const valid = [candidate(201, 4000)];
  for (const commands of [
    new Array(9).fill({ targetId: null, tick: 1, type: "kill-attacker" }),
    [{ targetId: null, tick: -1, type: "kill-attacker" }],
    [{ targetId: null, tick: 88, type: "kill-attacker" }],
    [{ targetId: 999, tick: 1, type: "kill-target" }],
    [{ targetId: 201, tick: 1, type: "kill-attacker" }],
    [{ targetId: null, tick: 1, type: "kill-target" }],
    [{ targetId: null, tick: 1, type: "unknown" }],
    [{ extra: true, targetId: null, tick: 1, type: "kill-attacker" }],
  ]) {
    assert.throws(() => createChainSpecialFixture(valid, 201, commands));
  }
  assert.throws(
    () => createChainSpecialFixture(valid, 201, [], "extra"),
    /extra arguments/u,
  );
});

test("chain special: outputs are isolated and execution bounds are enforced", () => {
  const setup = createChainSpecialFixture();
  const encounter = new ChainEncounter(setup);
  setup.candidates[0].position.x = 0;
  encounter.run();
  assert.deepEqual(hitIds(encounter), [201, 202, 203]);

  const replay = encounter.replay;
  const state = encounter.state;
  replay.length = 0;
  state.candidates[0].hitpoints = 999;
  assert.ok(encounter.replay.length > 0);
  assert.equal(encounter.state.candidates[0].hitpoints, 308);
  assert.throws(() => encounter.stepMany(-1));
  assert.throws(() => encounter.run(89), /exceeds its bound/u);
});

test("chain special: snapshots reject non-causal, oversized, and extra data", () => {
  const encounter = new ChainEncounter();
  encounter.stepMany(85);
  const canonical = encounter.serialize();
  assert.equal(ChainEncounter.restore(canonical).serialize(), canonical);
  const raw = JSON.parse(canonical);
  for (const serialized of [
    "no",
    "{}",
    JSON.stringify({ ...raw, version: 2 }),
    JSON.stringify({ ...raw, tick: -1 }),
    JSON.stringify({ ...raw, tick: 89 }),
    JSON.stringify({ ...raw, extra: true }),
    JSON.stringify({
      ...raw,
      identity: { ...raw.identity, primaryTargetId: 999 },
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
    " ".repeat(32_769),
  ]) {
    assert.throws(() => ChainEncounter.restore(serialized));
  }
  assert.throws(() => ChainEncounter.restore({}), /must be a string/u);

  const completed = new ChainEncounter();
  completed.run();
  const postTerminal = JSON.parse(completed.serialize());
  postTerminal.tick += 1;
  assert.throws(
    () => ChainEncounter.restore(JSON.stringify(postTerminal)),
    /post-terminal time/u,
  );
});

test("chain special: shipped source has original identity and explicit non-claims", () => {
  const source = readFileSync(
    new URL(
      "../src/content/cards/special-projectiles-chain.js",
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
    "chain-cap",
    "hop-range",
    "timing",
    "damage-per-hop",
    "death/cancellation",
    "moving-target",
    "stun/reset",
    "obstacle",
    "projectile-travel",
    "visual",
    "animation",
    "audio",
    "full-match",
  ]) {
    assert.match(source, new RegExp(nonClaim, "u"));
  }
});
