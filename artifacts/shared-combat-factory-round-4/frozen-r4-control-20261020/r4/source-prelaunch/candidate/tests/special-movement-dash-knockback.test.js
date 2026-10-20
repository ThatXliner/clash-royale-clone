import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DashEncounter,
  DashKnockbackRetargetEncounter,
  createDashSpecialFixture,
  createDashKnockbackFixture,
  createDashKnockbackQuestionRecords,
} from "../src/content/index.js";
import { protectedIdentityHits } from "./helpers/protected-identity-scan.js";

function events(encounter, type) {
  return encounter.replay.filter((event) => event.type === type);
}

// Independent literal oracle: it neither imports nor calls the production
// encounter, interpolation, targeting, attack-cycle, or knockback evaluator.
function literalBaselineOracle() {
  const output = [{ targetId: 202, tick: 0, type: "target-acquired" }];
  for (let elapsed = 1; elapsed <= 30; elapsed += 1) {
    const tick = 59 + elapsed;
    if (elapsed === 1) {
      output.push({
        from: { x: 3500, y: 11500 },
        targetId: 202,
        tick,
        to: { x: 3500, y: 16500 },
        type: "dash-launched",
      });
      output.push({ targetable: false, tick, type: "targetability-changed" });
    }
    output.push({
      elapsedTicks: elapsed,
      position: { x: 3500, y: 11500 + Math.trunc((5000 * elapsed) / 30) },
      tick,
      type: "dash-move",
    });
  }
  output.push({ targetable: true, tick: 89, type: "targetability-changed" });
  output.push({
    position: { x: 3500, y: 16500 },
    targetId: 202,
    tick: 89,
    type: "dash-arrived",
  });
  output.push({
    amount: 386,
    baseAmount: 193,
    bonusAmount: 193,
    currentHealth: 614,
    targetId: 202,
    tick: 89,
    type: "dash-damage",
  });
  output.push({ targetId: 202, tick: 90, type: "target-acquired" });
  output.push({
    sequence: 1,
    targetId: 202,
    tick: 126,
    type: "attack-ready",
  });
  return output;
}

test("dash-knockback composition: every absent coupling policy is a fresh QUESTION", () => {
  const records = createDashKnockbackQuestionRecords();
  assert.equal(Object.keys(records).length, 22);
  assert.deepEqual(Object.keys(records).sort(), [
    "arrivalBoundaryOrder",
    "arrivalDamage",
    "arrivalKnockbackEligibility",
    "attackAfterDash",
    "attackDamage",
    "collisionPolicy",
    "commandPriority",
    "diagonalInterpolation",
    "fullFreshWindup",
    "interruption",
    "interruptionKnockbackEligibility",
    "knockbackDirection",
    "knockbackDistanceMillitiles",
    "nextBoundaryReacquisition",
    "prelaunchDisplacement",
    "prelaunchKnockbackEligibility",
    "retargetOrigin",
    "stableIdReacquisition",
    "targetDeathDuringTransit",
    "targetabilityDuringTransit",
    "targetabilityRestoration",
    "transitKnockbackEligibility",
  ]);
  for (const [key, record] of Object.entries(records)) {
    assert.deepEqual({
      authoritative: record.authoritative,
      confidence: record.confidence,
      disposition: record.disposition,
      key: record.key,
      source: record.source,
    }, {
      authoritative: false,
      confidence: "unverified",
      disposition: "question",
      key,
      source: "unsourced-dash-knockback-retarget-composition",
    });
    assert.equal(Object.isFrozen(record), true);
  }
  assert.equal(Object.isFrozen(records), true);
  assert.throws(() => createDashKnockbackQuestionRecords({}), /do not accept/u);
});

test("dash-knockback composition: literal oracle preserves launch, 30 transit ticks, arrival, and full windup", () => {
  const encounter = new DashKnockbackRetargetEncounter();
  encounter.stepMany(127);
  assert.deepEqual(encounter.replay, literalBaselineOracle());
  assert.equal(events(encounter, "dash-move").length, 30);
  assert.deepEqual(events(encounter, "targetability-changed"), [
    { targetable: false, tick: 60, type: "targetability-changed" },
    { targetable: true, tick: 89, type: "targetability-changed" },
  ]);
  assert.deepEqual(events(encounter, "attack-ready"), [{
    sequence: 1,
    targetId: 202,
    tick: 126,
    type: "attack-ready",
  }]);
});

test("dash-knockback composition: launch and arrival boundary traces are exact", () => {
  const encounter = new DashKnockbackRetargetEncounter();
  encounter.stepMany(60);
  assert.deepEqual(encounter.step(), [
    {
      from: { x: 3500, y: 11500 },
      targetId: 202,
      tick: 60,
      to: { x: 3500, y: 16500 },
      type: "dash-launched",
    },
    { targetable: false, tick: 60, type: "targetability-changed" },
    {
      elapsedTicks: 1,
      position: { x: 3500, y: 11666 },
      tick: 60,
      type: "dash-move",
    },
  ]);
  encounter.stepMany(28);
  assert.deepEqual(encounter.step(), [
    {
      elapsedTicks: 30,
      position: { x: 3500, y: 16500 },
      tick: 89,
      type: "dash-move",
    },
    { targetable: true, tick: 89, type: "targetability-changed" },
    {
      position: { x: 3500, y: 16500 },
      targetId: 202,
      tick: 89,
      type: "dash-arrived",
    },
    {
      amount: 386,
      baseAmount: 193,
      bonusAmount: 193,
      currentHealth: 614,
      targetId: 202,
      tick: 89,
      type: "dash-damage",
    },
  ]);
});

test("dash-knockback composition: launch-boundary interruption preserves the dash primitive event", () => {
  const commands = [{ tick: 60, type: "interrupt" }];
  const primitive = new DashEncounter(createDashSpecialFixture(commands));
  const composition = new DashKnockbackRetargetEncounter(
    createDashKnockbackFixture(commands),
  );
  primitive.stepMany(60);
  composition.stepMany(60);
  const primitiveEvent = primitive.step().find(({ type }) =>
    type === "dash-interrupted"
  );
  const compositionEvent = composition.step().find(({ type }) =>
    type === "dash-interrupted"
  );
  assert.deepEqual(Object.keys(compositionEvent).sort(), [
    "phase",
    "position",
    "targetId",
    "tick",
    "type",
  ]);
  assert.deepEqual(compositionEvent, primitiveEvent);
});

test("dash-knockback composition: forced target deaths preserve the dash primitive events", () => {
  for (const tick of [59, 60, 70, 89]) {
    const commands = [{ tick, type: "target-killed" }];
    const primitive = new DashEncounter(createDashSpecialFixture(commands));
    const composition = new DashKnockbackRetargetEncounter(
      createDashKnockbackFixture(commands),
    );
    primitive.stepMany(tick);
    composition.stepMany(tick);
    const primitiveEvent = primitive.step().find(({ type }) =>
      type === "target-died"
    );
    const compositionEvent = composition.step().find(({ type }) =>
      type === "target-died"
    );
    assert.deepEqual(Object.keys(compositionEvent).sort(), [
      "currentHealth",
      "targetId",
      "tick",
      "type",
    ]);
    assert.deepEqual(compositionEvent, primitiveEvent);
  }
});

test("dash-knockback composition: prelaunch pulse is eligible and mutates the launch origin", () => {
  const encounter = new DashKnockbackRetargetEncounter(createDashKnockbackFixture([
    { tick: 59, type: "knockback" },
  ]));
  encounter.stepMany(60);
  assert.deepEqual(encounter.state.position, { x: 1500, y: 11500 });
  assert.deepEqual(events(encounter, "forced-knockback")[0].result, {
    applied: { x: -2000, y: 0 },
    blocked: { x: 0, y: 0 },
    clamped: false,
    eligible: true,
    id: 101,
    origin: { x: 3500, y: 11500 },
    position: { x: 1500, y: 11500 },
    requested: { x: -2000, y: 0 },
  });
  assert.deepEqual(encounter.step()[0], {
    from: { x: 1500, y: 11500 },
    targetId: 202,
    tick: 60,
    to: { x: 3500, y: 16500 },
    type: "dash-launched",
  });
});

test("dash-knockback composition: transit pulse is ineligible and cannot perturb the snapshot trace", () => {
  const encounter = new DashKnockbackRetargetEncounter(createDashKnockbackFixture([
    { tick: 70, type: "knockback" },
  ]));
  encounter.stepMany(70);
  const before = encounter.state.position;
  assert.deepEqual(encounter.step(), [
    {
      elapsedTicks: 11,
      position: { x: 3500, y: 13333 },
      tick: 70,
      type: "dash-move",
    },
    {
      eligible: false,
      reason: "dash-unit-untargetable",
      tick: 70,
      type: "forced-knockback-skipped",
    },
  ]);
  assert.deepEqual(before, { x: 3500, y: 13166 });
  encounter.stepMany(19);
  assert.deepEqual(encounter.state.position, { x: 3500, y: 16500 });
});

test("dash-knockback composition: arrival restores eligibility before same-boundary pulse", () => {
  const encounter = new DashKnockbackRetargetEncounter(createDashKnockbackFixture([
    { tick: 89, type: "knockback" },
  ]));
  encounter.stepMany(89);
  const boundary = encounter.step();
  assert.deepEqual(boundary.map(({ type }) => type), [
    "dash-move",
    "targetability-changed",
    "dash-arrived",
    "dash-damage",
    "forced-knockback",
  ]);
  assert.deepEqual(boundary[4].result.position, { x: 1500, y: 16500 });
  assert.equal(encounter.state.targetable, true);
});

test("dash-knockback composition: interruption restores eligibility and reacquires next boundary", () => {
  const encounter = new DashKnockbackRetargetEncounter(createDashKnockbackFixture([
    { tick: 70, type: "interrupt" },
    { tick: 70, type: "knockback" },
  ]));
  encounter.stepMany(70);
  assert.deepEqual(encounter.step().map(({ type }) => type), [
    "dash-interrupted",
    "targetability-changed",
    "forced-knockback",
  ]);
  assert.deepEqual(encounter.state.position, { x: 1500, y: 13166 });
  assert.deepEqual(encounter.step(), [{
    targetId: 202,
    tick: 71,
    type: "target-acquired",
  }]);
  encounter.stepMany(35);
  assert.deepEqual(encounter.step(), [{
    sequence: 1,
    targetId: 202,
    tick: 107,
    type: "attack-ready",
  }]);
});

test("dash-knockback composition: transit target death skips damage and reacquires stable backup ID", () => {
  const encounter = new DashKnockbackRetargetEncounter(createDashKnockbackFixture([
    { tick: 70, type: "target-killed" },
  ]));
  encounter.stepMany(90);
  assert.deepEqual(events(encounter, "target-died"), [{
    currentHealth: 0,
    targetId: 202,
    tick: 70,
    type: "target-died",
  }]);
  assert.deepEqual(events(encounter, "dash-damage-skipped"), [{
    reason: "snapshotted-target-dead",
    targetId: 202,
    tick: 89,
    type: "dash-damage-skipped",
  }]);
  assert.deepEqual(encounter.step(), [{
    targetId: 303,
    tick: 90,
    type: "target-acquired",
  }]);
  encounter.stepMany(35);
  assert.deepEqual(encounter.step(), [{
    sequence: 1,
    targetId: 303,
    tick: 126,
    type: "attack-ready",
  }]);
});

test("dash-knockback composition: arrival damage death precedes next-boundary backup acquisition", () => {
  const encounter = new DashKnockbackRetargetEncounter(
    createDashKnockbackFixture([], "fragile"),
  );
  encounter.stepMany(89);
  assert.deepEqual(encounter.step().slice(-2), [
    {
      amount: 386,
      baseAmount: 193,
      bonusAmount: 193,
      currentHealth: 0,
      targetId: 202,
      tick: 89,
      type: "dash-damage",
    },
    { targetId: 202, tick: 89, type: "target-died" },
  ]);
  assert.deepEqual(encounter.step(), [{
    targetId: 303,
    tick: 90,
    type: "target-acquired",
  }]);
});

test("dash-knockback composition: prelaunch death cancels dash and starts fresh retarget next boundary", () => {
  const encounter = new DashKnockbackRetargetEncounter(createDashKnockbackFixture([
    { tick: 59, type: "target-killed" },
  ]));
  encounter.stepMany(59);
  assert.deepEqual(encounter.step(), [
    { currentHealth: 0, targetId: 202, tick: 59, type: "target-died" },
    {
      reason: "target-killed-before-launch",
      targetId: 202,
      tick: 59,
      type: "dash-cancelled",
    },
  ]);
  assert.deepEqual(encounter.step(), [{
    targetId: 303,
    tick: 60,
    type: "target-acquired",
  }]);
  assert.equal(events(encounter, "dash-launched").length, 0);
});

test("dash-knockback composition: diagonal interpolation uses exact integer truncation", () => {
  const encounter = new DashKnockbackRetargetEncounter(
    createDashKnockbackFixture([], "diagonal"),
  );
  encounter.stepMany(61);
  assert.deepEqual(events(encounter, "dash-move")[0], {
    elapsedTicks: 1,
    position: { x: 3600, y: 11633 },
    tick: 60,
    type: "dash-move",
  });
  encounter.stepMany(29);
  assert.deepEqual(encounter.state.position, { x: 6500, y: 15500 });
  assert.equal(events(encounter, "dash-move").length, 30);
});

test("dash-knockback composition: radius-inset clamp reports requested, applied, and blocked vectors", () => {
  const encounter = new DashKnockbackRetargetEncounter(
    createDashKnockbackFixture([{ tick: 89, type: "knockback" }], "clamp"),
  );
  encounter.stepMany(90);
  assert.deepEqual(events(encounter, "forced-knockback")[0].result, {
    applied: { x: -1200, y: 0 },
    blocked: { x: -800, y: 0 },
    clamped: true,
    eligible: true,
    id: 101,
    origin: { x: 1500, y: 16500 },
    position: { x: 300, y: 16500 },
    requested: { x: -2000, y: 0 },
  });
});

test("dash-knockback composition: chunking and every restore cut are byte exact", () => {
  const fixtures = [
    createDashKnockbackFixture(),
    createDashKnockbackFixture([{ tick: 59, type: "knockback" }]),
    createDashKnockbackFixture([{ tick: 70, type: "knockback" }]),
    createDashKnockbackFixture([{ tick: 89, type: "knockback" }], "clamp"),
    createDashKnockbackFixture([{ tick: 59, type: "target-killed" }]),
    createDashKnockbackFixture([{ tick: 60, type: "target-killed" }]),
    createDashKnockbackFixture([{ tick: 70, type: "target-killed" }]),
    createDashKnockbackFixture([{ tick: 89, type: "target-killed" }]),
    createDashKnockbackFixture([{ tick: 60, type: "interrupt" }]),
    createDashKnockbackFixture([
      { tick: 70, type: "interrupt" },
      { tick: 70, type: "knockback" },
    ]),
  ];
  let restoreCuts = 0;
  for (const fixture of fixtures) {
    const one = new DashKnockbackRetargetEncounter(fixture);
    const chunk = new DashKnockbackRetargetEncounter(fixture);
    one.stepMany(47);
    one.stepMany(93);
    chunk.stepMany(140);
    assert.equal(one.serialize(), chunk.serialize());
    assert.deepEqual(one.state, chunk.state);
    assert.deepEqual(one.replay, chunk.replay);
    for (let cut = 0; cut <= 140; cut += 1) {
      const original = new DashKnockbackRetargetEncounter(fixture);
      original.stepMany(cut);
      const restored = DashKnockbackRetargetEncounter.restore(original.serialize());
      assert.equal(restored.serialize(), original.serialize());
      assert.deepEqual(restored.state, original.state);
      assert.deepEqual(restored.replay, original.replay);
      restoreCuts += 1;
    }
  }
  assert.equal(restoreCuts, 1_410);
});

test("dash-knockback composition: hostile fixtures are rejected atomically", () => {
  const hostile = [
    { commands: [], scenario: "forged" },
    { commands: [{ tick: -1, type: "knockback" }], scenario: "baseline" },
    { commands: [{ tick: 59, type: "interrupt" }], scenario: "baseline" },
    { commands: [{ tick: 90, type: "interrupt" }], scenario: "baseline" },
    { commands: [{ tick: 90, type: "target-killed" }], scenario: "baseline" },
    { commands: [{ tick: 1, type: "warp" }], scenario: "baseline" },
    {
      commands: [
        { tick: 70, type: "knockback" },
        { tick: 69, type: "target-killed" },
      ],
      scenario: "baseline",
    },
    {
      commands: [
        { tick: 70, type: "knockback" },
        { tick: 70, type: "knockback" },
      ],
      scenario: "baseline",
    },
    {
      commands: [
        { tick: 59, type: "knockback" },
        { tick: 89, type: "knockback" },
      ],
      scenario: "baseline",
    },
  ];
  for (const value of hostile) {
    assert.throws(() => new DashKnockbackRetargetEncounter(value));
  }
  const sparse = [{ tick: 70, type: "knockback" }];
  delete sparse[0];
  assert.throws(() => createDashKnockbackFixture(sparse), /dense/u);
  const encounter = new DashKnockbackRetargetEncounter();
  encounter.stepMany(10);
  const before = encounter.serialize();
  assert.throws(() => encounter.stepMany(131), /tick bound/u);
  assert.equal(encounter.serialize(), before);
});

test("dash-knockback composition: canonical hostile snapshots and bounds are rejected", () => {
  const encounter = new DashKnockbackRetargetEncounter();
  encounter.stepMany(70);
  const parsed = JSON.parse(encounter.serialize());
  for (const mutate of [
    (value) => { value.tick = -1; },
    (value) => { value.tick = 141; },
    (value) => { value.version = 2; },
    (value) => { value.extra = true; },
    (value) => { value.setup.scenario = "forged"; },
    (value) => { value.setup.commands = [{ tick: 59, type: "interrupt" }]; },
  ]) {
    const hostile = structuredClone(parsed);
    mutate(hostile);
    assert.throws(() =>
      DashKnockbackRetargetEncounter.restore(JSON.stringify(hostile))
    );
  }
  assert.throws(() =>
    DashKnockbackRetargetEncounter.restore(` ${encounter.serialize()}`),
  /canonical/u);
  assert.throws(() => DashKnockbackRetargetEncounter.restore("{"));
  assert.throws(() => DashKnockbackRetargetEncounter.restore(null));
  assert.throws(() =>
    DashKnockbackRetargetEncounter.restore(" ".repeat(32_769)),
  /byte bound/u);
  encounter.stepMany(70);
  const final = encounter.serialize();
  assert.deepEqual(encounter.step(), []);
  assert.equal(encounter.serialize(), final);
  assert.throws(() => encounter.run(141), /tick limit/u);
});

test("dash-knockback composition: fixture, state, replay, and questions are isolated", () => {
  const commands = [{ tick: 70, type: "knockback" }];
  const fixture = createDashKnockbackFixture(commands);
  commands[0].tick = 1;
  assert.deepEqual(fixture, {
    commands: [{ tick: 70, type: "knockback" }],
    scenario: "baseline",
  });
  fixture.commands[0].tick = 2;
  const encounter = new DashKnockbackRetargetEncounter(
    createDashKnockbackFixture([{ tick: 70, type: "knockback" }]),
  );
  encounter.stepMany(71);
  const state = encounter.state;
  const replay = encounter.replay;
  state.position.x = 0;
  replay[0].targetId = 999;
  assert.deepEqual(encounter.state.position, { x: 3500, y: 13333 });
  assert.equal(encounter.replay[0].targetId, 202);
});

test("dash-knockback composition: shipped source is original and reference-isolated", () => {
  const source = readFileSync(
    new URL("../src/content/cards/special-movement-dash-knockback.js", import.meta.url),
    "utf8",
  );
  const benchmark = JSON.parse(readFileSync(
    new URL("../reference/stats/cards.json", import.meta.url),
    "utf8",
  ));
  const protectedTokens = new Set(benchmark.cards.flatMap(({ key, name }) => [
    key.toLowerCase(),
    name.toLowerCase(),
  ]));
  assert.deepEqual(protectedIdentityHits(source, protectedTokens), []);
  assert.doesNotMatch(source, /readFile|reference\/|cards\.json/u);
  for (const exclusion of [
    "no authoritative",
    "collision",
    "ordinary movement",
    "stun",
    "mass",
    "animation",
    "pathfinding",
    "multi-pulse",
    "post-attack-damage",
  ]) {
    assert.match(source, new RegExp(exclusion, "u"));
  }
});
