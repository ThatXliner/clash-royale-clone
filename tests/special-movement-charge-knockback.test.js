import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ChargeKnockbackRetargetEncounter,
  createChargeKnockbackCatalog,
  createChargeKnockbackFixture,
  createChargeKnockbackQuestionRecords,
} from "../src/content/cards/special-movement-charge-knockback.js";

const candidate = (
  id,
  {
    alive = true,
    health = 5000,
    kind = "troop",
    layer = "ground",
    radius = 0,
    targetable = true,
    x = 3500,
    y = 18500,
  } = {},
) => ({
  alive,
  health,
  id,
  kind,
  layer,
  position: { x, y },
  radius,
  targetable,
});
const set = (tick, value) => ({
  candidate: value,
  distance: null,
  source: null,
  targetId: value.id,
  tick,
  type: "set-candidate",
});
const remove = (tick, targetId) => ({
  candidate: null,
  distance: null,
  source: null,
  targetId,
  tick,
  type: "remove-candidate",
});
const knockback = (tick, source, distance) => ({
  candidate: null,
  distance,
  source,
  targetId: 101,
  tick,
  type: "knockback-attacker",
});
const encounter = (candidates, commands = []) =>
  new ChargeKnockbackRetargetEncounter(
    createChargeKnockbackFixture(candidates, commands),
  );
const at = (sim, tick) => sim.replay.filter((entry) => entry.tick === tick);
const ofType = (sim, type) =>
  sim.replay.filter((entry) => entry.type === type);
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
};
const setupSnapshot = (commands, tick = 0) => canonicalJson({
  setup: {
    candidates: [candidate(202)],
    commands,
  },
  tick,
  version: 1,
});
const assertRejectedByEverySetupPath = (commands, pattern) => {
  assert.throws(
    () => createChargeKnockbackFixture([candidate(202)], commands),
    pattern,
  );
  assert.throws(
    () => new ChargeKnockbackRetargetEncounter({
      candidates: [candidate(202)],
      commands,
    }),
    pattern,
  );
  assert.throws(
    () => ChargeKnockbackRetargetEncounter.restore(setupSnapshot(commands)),
    pattern,
  );
};
const observable = (sim) => ({
  replay: sim.replay,
  route: sim.route,
  serialized: sim.serialize(),
  state: sim.state,
});
const assertAtomicFailure = (sim, action, pattern) => {
  const before = observable(sim);
  assert.throws(action, pattern);
  assert.deepEqual(observable(sim), before);
};

// Literal independent oracle for the undisplaced composition. It imports no
// composition helper, movement, targeting, attack-cycle, or damage primitive.
function literalChargeOracle(tickCount, health = 5000) {
  const history = [{ targetId: 202, tick: 0, type: "target-acquired" }];
  let chargeProgress = 0;
  let charged = false;
  let movementPosition = 0;
  let remainder = 0;
  let positionY = 11500;
  let nextAttackTick = null;
  let sequence = 0;
  let targetHealth = health;
  for (let tick = 0; tick < tickCount; tick += 1) {
    const reached = positionY >= 16900;
    if (tick >= 60 && !reached) {
      const speed = charged ? 2000 : 1000;
      const numerator = speed + remainder;
      const travelled = Math.floor(numerator / 60);
      remainder = numerator % 60;
      movementPosition += travelled;
      chargeProgress += travelled;
      positionY = 11500 + movementPosition;
      history.push({
        position: { x: 3500, y: positionY },
        tick,
        type: "move",
      });
      if (!charged && chargeProgress >= 3500) {
        charged = true;
        history.push({
          distanceMillitiles: 3500,
          tick,
          type: "charge-armed",
        });
      }
      if (positionY >= 16900) {
        history.push({
          position: { x: 3500, y: positionY },
          targetId: 202,
          tick,
          type: "reached",
        });
        nextAttackTick = tick + 54;
      }
    }
    if (nextAttackTick === tick && targetHealth > 0) {
      sequence += 1;
      const bonusAmount = charged ? 392 : 0;
      const amount = 392 + bonusAmount;
      const healthBefore = targetHealth;
      targetHealth = Math.max(0, targetHealth - amount);
      history.push({
        amount,
        baseAmount: 392,
        bonusAmount,
        charged,
        currentHealth: targetHealth,
        healthBefore,
        sequence,
        targetId: 202,
        tick,
        type: "attack",
      });
      if (targetHealth === 0) {
        history.push({ targetId: 202, tick, type: "death" });
      }
      if (charged) {
        charged = false;
        chargeProgress = 0;
        history.push({ tick, type: "charge-consumed" });
      }
      nextAttackTick = tick + 84;
    }
  }
  return {
    chargeProgress,
    charged,
    history: history.filter(({ tick }) => tick < tickCount),
    movementPosition,
    position: { x: 3500, y: positionY },
    targetHealth,
  };
}

function literalProjection(origin, source, distance) {
  const dx = BigInt(origin.x - source.x);
  const dy = BigInt(origin.y - source.y);
  const squared = dx * dx + dy * dy;
  let root = 0n;
  while ((root + 1n) * (root + 1n) <= squared) root += 1n;
  assert.equal(root * root, squared);
  const requested = {
    x: Number(dx * BigInt(distance) / root),
    y: Number(dy * BigInt(distance) / root),
  };
  const raw = {
    x: origin.x + requested.x,
    y: origin.y + requested.y,
  };
  const position = {
    x: Math.max(0, Math.min(18000, raw.x)),
    y: Math.max(0, Math.min(32000, raw.y)),
  };
  return {
    applied: {
      x: position.x - origin.x,
      y: position.y - origin.y,
    },
    blocked: {
      x: requested.x - (position.x - origin.x),
      y: requested.y - (position.y - origin.y),
    },
    clamped: position.x !== raw.x || position.y !== raw.y,
    eligible: true,
    id: 101,
    origin,
    position,
    requested,
  };
}

test("charge-knockback composition: original catalog is isolated", () => {
  const card = createChargeKnockbackCatalog()[0];
  assert.deepEqual(card, {
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
  });
  card.damage = 1;
  assert.equal(createChargeKnockbackCatalog()[0].damage, 392);
});

test("charge-knockback composition: every coupling is a separate fresh recursively frozen QUESTION", () => {
  const first = createChargeKnockbackQuestionRecords();
  const second = createChargeKnockbackQuestionRecords();
  const expected = [
    "attackAfterDisplacement",
    "attackBoundaryInclusive",
    "attackDamageOrder",
    "chargeArmDistanceMillitiles",
    "chargeBonusDamage",
    "chargeConsumption",
    "chargeResetOnDisplacement",
    "chargeResetOnTargetChange",
    "chargedMovementMillitilesPerSecond",
    "commandPriority",
    "deathInvalidation",
    "displacementEligibility",
    "displacementGeometry",
    "displacementRoutePolicy",
    "eventOrdering",
    "firstHitAfterReacquisition",
    "knockbackAttackCancellation",
    "movementAfterCommand",
    "retargetPolicy",
    "routeDistanceCompatibility",
    "sightBoundaryInclusive",
    "sightRangeCompositionMillitiles",
    "targetHealthFixture",
    "targetMode",
  ];
  assert.deepEqual(Object.keys(first).sort(), expected.sort());
  assert.ok(Object.isFrozen(first));
  for (const key of expected) {
    assert.notStrictEqual(first[key], second[key]);
    assert.deepEqual({
      authoritative: first[key].authoritative,
      confidence: first[key].confidence,
      disposition: first[key].disposition,
      key: first[key].key,
      source: first[key].source,
    }, {
      authoritative: false,
      confidence: "unverified",
      disposition: "question",
      key,
      source: "unsourced-charge-forced-knockback-retarget-composition",
    });
    assert.ok(Object.isFrozen(first[key]));
    if (first[key].value && typeof first[key].value === "object") {
      assert.ok(Object.isFrozen(first[key].value));
    }
  }
  assert.throws(() => first.eventOrdering.value.push("forged"), TypeError);
  assert.throws(() => createChargeKnockbackQuestionRecords({}), /overrides/u);
});

test("charge-knockback composition: exact CONTENT-008C route-distance trace is preserved", () => {
  const sim = encounter([candidate(202)]);
  assert.deepEqual(sim.route.map(({ y }) => y), [
    11500, 12500, 13500, 14500, 15500, 16500, 17500, 18500,
  ]);
  sim.stepMany(381);
  const oracle = literalChargeOracle(381);
  assert.deepEqual(sim.replay, oracle.history);
  assert.deepEqual(at(sim, 60), [
    { position: { x: 3500, y: 11516 }, tick: 60, type: "move" },
  ]);
  assert.deepEqual(at(sim, 269), [
    { position: { x: 3500, y: 15000 }, tick: 269, type: "move" },
    { distanceMillitiles: 3500, tick: 269, type: "charge-armed" },
  ]);
  assert.deepEqual(at(sim, 270), [
    { position: { x: 3500, y: 15033 }, tick: 270, type: "move" },
  ]);
  assert.deepEqual(at(sim, 326), [
    { position: { x: 3500, y: 16900 }, tick: 326, type: "move" },
    {
      position: { x: 3500, y: 16900 },
      targetId: 202,
      tick: 326,
      type: "reached",
    },
  ]);
  assert.deepEqual(at(sim, 380), [
    {
      amount: 784,
      baseAmount: 392,
      bonusAmount: 392,
      charged: true,
      currentHealth: 4216,
      healthBefore: 5000,
      sequence: 1,
      targetId: 202,
      tick: 380,
      type: "attack",
    },
    { tick: 380, type: "charge-consumed" },
  ]);
});

test("charge-knockback composition: forced displacement is exact on every axis", () => {
  const cases = [
    [{ x: 2500, y: 11500 }, { x: 1000, y: 0 }],
    [{ x: 4500, y: 11500 }, { x: -1000, y: 0 }],
    [{ x: 3500, y: 10500 }, { x: 0, y: 1000 }],
    [{ x: 3500, y: 12500 }, { x: 0, y: -1000 }],
  ];
  for (const [source, requested] of cases) {
    const sim = encounter([candidate(202)], [knockback(0, source, 1000)]);
    sim.step();
    const event = ofType(sim, "forced-knockback")[0];
    assert.deepEqual(event.result.requested, requested);
    assert.deepEqual(
      event.result,
      literalProjection({ x: 3500, y: 11500 }, source, 1000),
    );
  }
});

test("charge-knockback composition: all signed 3-4-5 diagonals use exact components", () => {
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const source = { x: 3500 - sx * 300, y: 11500 - sy * 400 };
      const sim = encounter([candidate(202)], [knockback(0, source, 1000)]);
      sim.step();
      assert.deepEqual(ofType(sim, "forced-knockback")[0].result.requested, {
        x: sx * 600,
        y: sy * 800,
      });
    }
  }
});

test("charge-knockback composition: late zero vectors reject in fixture, constructor, and restore", () => {
  const commands = [
    knockback(100, { x: 3500, y: 12166 }, 1000),
  ];
  assertRejectedByEverySetupPath(commands, /zero vector/u);
});

test("charge-knockback composition: every signed axis and safe raw-position boundary is preflighted", () => {
  const maximum = Number.MAX_SAFE_INTEGER;
  const initial = { x: 3500, y: 11500 };
  const signedCases = [
    [{ x: 0, y: initial.y }, maximum - initial.x, { x: maximum, y: initial.y }],
    [{ x: 18000, y: initial.y }, maximum, {
      x: initial.x - maximum,
      y: initial.y,
    }],
    [{ x: initial.x, y: 0 }, maximum - initial.y, {
      x: initial.x,
      y: maximum,
    }],
    [{ x: initial.x, y: 32000 }, maximum, {
      x: initial.x,
      y: initial.y - maximum,
    }],
  ];
  for (const [source, distance, raw] of signedCases) {
    const sim = encounter(
      [candidate(202)],
      [knockback(0, source, distance)],
    );
    sim.step();
    const result = ofType(sim, "forced-knockback")[0].result;
    assert.deepEqual({
      x: result.origin.x + result.requested.x,
      y: result.origin.y + result.requested.y,
    }, raw);
  }

  assertRejectedByEverySetupPath(
    [knockback(0, { x: 0, y: initial.y }, maximum - initial.x + 1)],
    /raw position\.x/u,
  );
  assertRejectedByEverySetupPath(
    [knockback(0, { x: initial.x, y: 0 }, maximum - initial.y + 1)],
    /raw position\.y/u,
  );
});

test("charge-knockback composition: overflow boundaries use the displaced command-time position", () => {
  const maximum = Number.MAX_SAFE_INTEGER;
  const axes = [
    {
      first: knockback(0, { x: 0, y: 11500 }, 14500),
      secondSource: { x: 0, y: 11500 },
      validDistance: maximum - 18000,
    },
    {
      first: knockback(0, { x: 3500, y: 0 }, 20500),
      secondSource: { x: 3500, y: 0 },
      validDistance: maximum - 32000,
    },
  ];
  for (const { first, secondSource, validDistance } of axes) {
    const valid = encounter(
      [candidate(202)],
      [first, knockback(1, secondSource, validDistance)],
    );
    valid.stepMany(2);
    assert.equal(ofType(valid, "forced-knockback").length, 2);
    assertRejectedByEverySetupPath(
      [first, knockback(1, secondSource, validDistance + 1)],
      /raw position\.[xy]/u,
    );
  }
});

test("charge-knockback composition: same-boundary semantic duplicates reject through every setup path", () => {
  const duplicateSchedules = [
    [
      knockback(10, { x: 2500, y: 11500 }, 1000),
      knockback(10, { x: 4500, y: 11500 }, 2000),
    ],
    [
      remove(10, 202),
      {
        type: "remove-candidate",
        tick: 10,
        targetId: 202,
        source: null,
        distance: null,
        candidate: null,
      },
    ],
    [
      set(10, candidate(202, { health: 4000 })),
      set(10, candidate(202, { health: 3000 })),
    ],
  ];
  for (const commands of duplicateSchedules) {
    assertRejectedByEverySetupPath(commands, /semantic duplicates/u);
  }
});

test("charge-knockback composition: radius-inset arena clamp reports blocked displacement", () => {
  const cases = [
    [{ x: 4500, y: 11500 }, 10000, { x: 0, y: 11500 }],
    [{ x: 2500, y: 11500 }, 20000, { x: 18000, y: 11500 }],
    [{ x: 3500, y: 12500 }, 20000, { x: 3500, y: 0 }],
    [{ x: 3500, y: 10500 }, 30000, { x: 3500, y: 32000 }],
  ];
  for (const [source, distance, position] of cases) {
    const sim = encounter([candidate(202)], [knockback(0, source, distance)]);
    sim.step();
    const result = ofType(sim, "forced-knockback")[0].result;
    assert.equal(result.clamped, true);
    assert.deepEqual(result.position, position);
    assert.notDeepEqual(result.blocked, { x: 0, y: 0 });
  }
});

test("charge-knockback composition: displacement resets charge in deploy, moving, armed, and winding phases", () => {
  for (const [tick, y] of [[10, 11500], [100, 12166], [300, 16000], [350, 16900]]) {
    const sim = encounter(
      [candidate(202)],
      [knockback(tick, { x: 2500, y }, 1000)],
    );
    sim.stepMany(tick + 1);
    const boundary = at(sim, tick);
    assert.equal(boundary[0].type, "forced-knockback", `tick ${tick}`);
    if (tick >= 60) {
      assert.ok(boundary.some(({ type }) => type === "charge-reset"));
    }
    assert.equal(sim.state.charged, false);
    assert.ok(sim.state.chargeProgressMillitiles < 20);
  }
});

test("charge-knockback composition: literal command-first moving-phase trace resets before same-boundary movement", () => {
  const source = { x: 2500, y: 12166 };
  const sim = encounter(
    [candidate(202)],
    [knockback(100, source, 1000)],
  );
  sim.stepMany(100);
  assert.deepEqual(sim.state.position, { x: 3500, y: 12166 });
  assert.equal(sim.state.chargeProgressMillitiles, 666);
  sim.step();
  assert.deepEqual(at(sim, 100), [
    {
      result: literalProjection(
        { x: 3500, y: 12166 },
        source,
        1000,
      ),
      source,
      targetId: 101,
      tick: 100,
      type: "forced-knockback",
    },
    { tick: 100, type: "charge-reset" },
    { position: { x: 4484, y: 12166 }, tick: 100, type: "move" },
  ]);
  assert.equal(sim.state.chargeProgressMillitiles, 16);
  assert.equal(sim.state.movement.position, 16);
  assert.equal(sim.state.movement.remainder, 40);
});

test("charge-knockback composition: target invalidation reacquires stable ID with a full windup", () => {
  const sim = encounter(
    [candidate(202), candidate(203)],
    [set(350, candidate(202, {
      alive: false,
      health: 0,
      targetable: false,
    }))],
  );
  sim.stepMany(405);
  assert.deepEqual(at(sim, 350).slice(0, 3), [
    { targetId: 202, tick: 350, type: "target-lost" },
    { targetId: 203, tick: 350, type: "target-acquired" },
    { tick: 350, type: "charge-reset" },
  ]);
  assert.deepEqual(
    ofType(sim, "attack").map(({ targetId, tick }) => ({ targetId, tick })),
    [{ targetId: 203, tick: 404 }],
  );
});

test("charge-knockback composition: charged strike consumes once and preserves ordinary cadence", () => {
  const sim = encounter([candidate(202, { health: 2000 })]);
  sim.stepMany(466);
  assert.deepEqual(
    ofType(sim, "attack").map(
      ({ amount, bonusAmount, charged, tick }) => ({
        amount,
        bonusAmount,
        charged,
        tick,
      }),
    ),
    [
      { amount: 784, bonusAmount: 392, charged: true, tick: 380 },
      { amount: 392, bonusAmount: 0, charged: false, tick: 464 },
    ],
  );
  assert.deepEqual(ofType(sim, "charge-consumed").map(({ tick }) => tick), [380]);
});

test("charge-knockback composition: lethal charged damage invalidates and reacquires on the next boundary", () => {
  const sim = encounter([
    candidate(202, { health: 784 }),
    candidate(203, { health: 5000 }),
  ]);
  sim.stepMany(436);
  assert.deepEqual(at(sim, 380).map(({ type }) => type), [
    "attack",
    "death",
    "charge-consumed",
  ]);
  assert.deepEqual(at(sim, 381).slice(0, 2), [
    { targetId: 202, tick: 381, type: "target-lost" },
    { targetId: 203, tick: 381, type: "target-acquired" },
  ]);
  assert.deepEqual(
    ofType(sim, "attack").map(({ targetId, tick }) => ({ targetId, tick })),
    [
      { targetId: 202, tick: 380 },
      { targetId: 203, tick: 435 },
    ],
  );
});

test("charge-knockback composition: command-first ready-boundary invalidation suppresses stale attack", () => {
  const sim = encounter(
    [candidate(202), candidate(203)],
    [set(380, candidate(202, {
      alive: false,
      health: 0,
      targetable: false,
    }))],
  );
  sim.stepMany(435);
  assert.equal(ofType(sim, "attack").some(
    ({ targetId, tick }) => targetId === 202 && tick === 380
  ), false);
  assert.deepEqual(
    ofType(sim, "attack").map(({ targetId, tick }) => ({ targetId, tick })),
    [{ targetId: 203, tick: 434 }],
  );
});

test("charge-knockback composition: sticky selection and stable-ID tie break survive input order", () => {
  for (const values of [
    [candidate(203), candidate(202)],
    [candidate(202), candidate(203)],
  ]) {
    const sim = encounter(values);
    sim.step();
    assert.equal(sim.state.selectedTargetId, 202);
  }
  const sticky = encounter(
    [candidate(202)],
    [set(10, candidate(201, { y: 18000 }))],
  );
  sticky.stepMany(11);
  assert.equal(sticky.state.selectedTargetId, 202);
});

test("charge-knockback composition: target mode, targetability, death, and sight exclusions compose", () => {
  const sim = encounter([
    candidate(1, { layer: "air" }),
    candidate(2, { targetable: false }),
    candidate(3, { alive: false, health: 0 }),
    candidate(4, { kind: "structure", y: 18500 }),
    candidate(5, { y: 18501 }),
  ]);
  sim.step();
  assert.equal(sim.state.selectedTargetId, 4);
});

test("charge-knockback composition: arbitrary chunks and every restore cut are byte/event identical", () => {
  const setup = createChargeKnockbackFixture(
    [candidate(202), candidate(203)],
    [
      knockback(100, { x: 2500, y: 12166 }, 1000),
      set(380, candidate(202, {
        alive: false,
        health: 0,
        targetable: false,
      })),
    ],
  );
  const expected = new ChargeKnockbackRetargetEncounter(setup);
  expected.stepMany(500);
  const chunked = new ChargeKnockbackRetargetEncounter(setup);
  for (const count of [1, 59, 0, 40, 17, 83, 101, 199]) {
    chunked.stepMany(count);
  }
  assert.equal(chunked.state.tick, 500);
  assert.deepEqual(chunked.replay, expected.replay);
  assert.equal(chunked.serialize(), expected.serialize());

  for (let cut = 0; cut <= 500; cut += 1) {
    const partial = new ChargeKnockbackRetargetEncounter(setup);
    partial.stepMany(cut);
    const bytes = partial.serialize();
    const restored = ChargeKnockbackRetargetEncounter.restore(bytes);
    assert.equal(restored.serialize(), bytes, `cut ${cut}`);
    restored.stepMany(500 - cut);
    assert.equal(restored.serialize(), expected.serialize(), `end ${cut}`);
    assert.deepEqual(restored.replay, expected.replay, `replay ${cut}`);
  }
});

test("charge-knockback composition: fixture, commands, state, route, replay, and outputs are isolated", () => {
  const candidates = [candidate(202)];
  const commands = [knockback(10, { x: 2500, y: 11500 }, 1000)];
  const setup = createChargeKnockbackFixture(candidates, commands);
  candidates[0].position.y = 1;
  commands[0].source.x = 1;
  setup.candidates[0].position.y = 2;
  const sim = encounter([candidate(202)]);
  sim.stepMany(61);
  const state = sim.state;
  const replay = sim.replay;
  const route = sim.route;
  state.position.y = 1;
  replay[0].targetId = 1;
  route[0].y = 1;
  assert.deepEqual(sim.state.position, { x: 3500, y: 11516 });
  assert.equal(sim.replay[0].targetId, 202);
  assert.equal(sim.route[0].y, 11500);
});

test("charge-knockback composition: hostile shapes, getters, sparse arrays, duplicates, and oversized inputs reject", () => {
  let getterCalls = 0;
  const hostile = candidate(202);
  Object.defineProperty(hostile, "id", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 202;
    },
  });
  const sparse = [];
  sparse.length = 1;
  for (const values of [
    [hostile],
    sparse,
    [{ ...candidate(202), extra: true }],
    [candidate(202), candidate(202)],
    [Object.assign(Object.create({}), candidate(202))],
    Array.from({ length: 17 }, (_, index) => candidate(index + 1)),
  ]) {
    assert.throws(() => createChargeKnockbackFixture(values));
  }
  assert.equal(getterCalls, 0);
  assert.throws(() => createChargeKnockbackFixture(
    [candidate(202)],
    Array.from({ length: 65 }, (_, tick) => remove(tick, 202)),
  ));
  assert.throws(
    () => encounter(
      [candidate(202)],
      [
        set(0, candidate(202, { health: 4000 })),
        knockback(0, { x: 3500, y: 11500 }, 1000),
      ],
    ),
    /zero vector/u,
  );
});

test("charge-knockback composition: bounds reject atomically and snapshots are canonical", () => {
  const sim = encounter([candidate(202)]);
  sim.stepMany(10);
  const before = sim.serialize();
  assert.throws(() => sim.stepMany(1000), /tick bound/u);
  assert.equal(sim.serialize(), before);
  assert.throws(() => sim.stepMany(-1));
  assert.equal(sim.serialize(), before);
  assert.throws(() => ChargeKnockbackRetargetEncounter.restore(` ${before}`),
    /canonical/u);
  assert.throws(() => ChargeKnockbackRetargetEncounter.restore(
    before.replace('"version":1', '"version":2'),
  ));
  assert.throws(() => ChargeKnockbackRetargetEncounter.restore(
    before.replace('"tick":10', '"tick":10,"tick":10'),
  ), /canonical/u);
  assert.throws(() => ChargeKnockbackRetargetEncounter.restore("{"));
  assert.throws(() => ChargeKnockbackRetargetEncounter.restore({}));
  assert.throws(() => ChargeKnockbackRetargetEncounter.restore(
    `{"padding":"${"é".repeat(262_144)}"}`,
  ), /byte bound/u);
});

test("charge-knockback composition: step and stepMany failures are atomic before and after progress", () => {
  for (const progressed of [false, true]) {
    const sim = encounter([candidate(202)]);
    if (progressed) sim.stepMany(137);
    assertAtomicFailure(
      sim,
      () => sim.step("unexpected"),
      /does not accept arguments/u,
    );
    assertAtomicFailure(
      sim,
      () => sim.stepMany(-1),
      /bounded safe integer/u,
    );
    assertAtomicFailure(
      sim,
      () => sim.stepMany(1001 - sim.state.tick),
      /bounded safe integer|tick bound/u,
    );
  }
});

test("charge-knockback composition: primitive sources remain unchanged and shipped source is deterministic", () => {
  const moduleUrl = new URL(
    "../src/content/cards/special-movement-charge-knockback.js",
    import.meta.url,
  );
  const source = readFileSync(moduleUrl, "utf8");
  assert.doesNotMatch(source, /Date|Math\.random|setTimeout|reference\//u);
  for (const protectedName of [
    "Prince",
    "Dark Prince",
    "Ram Rider",
    "Fireball",
    "Giant Snowball",
  ]) {
    assert.equal(source.includes(protectedName), false);
  }
  assert.match(source, /evaluateForcedKnockbackQuestionBoundary/u);
  assert.match(source, /retainOrAcquireTarget/u);
  assert.match(source, /AttackCycle/u);
});
