import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  JumpEncounter,
  createJumpQuestionFixture,
  createJumpSpecialCatalog,
  createJumpSpecialFixture,
  evaluateJumpQuestionBoundary,
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
  ["targetMode", "targets", (value) => value],
  ["count", "count", (value) => value],
  ["areaDamageRadiusMillitiles", "area_damage_radius_tiles",
    (value) => value === null ? null : value * 1000],
];
const parity = createReferenceParityEvaluator(
  benchmark.cards,
  FIELDS,
  ["mega-knight"],
);

function replayOf(encounter, type) {
  return encounter.replay.filter((event) => event.type === type);
}

function runFresh(commands = []) {
  const encounter = new JumpEncounter(createJumpSpecialFixture(commands));
  encounter.run();
  return {
    replay: encounter.replay,
    snapshot: encounter.serialize(),
    state: encounter.state,
  };
}

test("jump special: original definition has exact researched base fields", () => {
  const first = createJumpSpecialCatalog();
  assert.deepEqual(first, [{
    areaDamageRadiusMillitiles: 1300,
    components: [],
    cost: 7,
    count: 1,
    damage: 268,
    deployTimeTicks: 60,
    displayName: "Stonevault",
    firstHitTicks: 72,
    hitSpeedTicks: 102,
    hitpoints: 3993,
    id: "stonevault",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 1200,
    rarity: "mythic",
    sightRangeMillitiles: 5500,
    targetMode: "ground",
  }]);
  first[0].hitpoints = 1;
  assert.equal(createJumpSpecialCatalog()[0].hitpoints, 3993);

  const report = parity(createJumpSpecialCatalog()[0], "mega-knight");
  assert.deepEqual(report.authoritativeFailures, []);
  assert.deepEqual(
    report.fields.filter(({ disposition }) => disposition === "match")
      .map(({ runtimeField }) => runtimeField),
    ["cost", "kind", "rarity"],
  );
  assert.equal(report.questions.length, 11);
  assert.ok(report.questions.every(
    ({ disposition }) => disposition === "question-backed-match",
  ));
});

test("jump special: every mechanic is an isolated per-value question", () => {
  const fixture = createJumpQuestionFixture();
  assert.deepEqual({
    authoritative: fixture.authoritative,
    commandsResolveBeforeMovement: fixture.commandsResolveBeforeMovement,
    confidence: fixture.confidence,
    destinationRule: fixture.destinationRule,
    disposition: fixture.disposition,
    inclusiveTriggerBoundary: fixture.inclusiveTriggerBoundary,
    interpolationRule: fixture.interpolationRule,
    interruptionRule: fixture.interruptionRule,
    landingDamage: fixture.landingDamage,
    landingMode: fixture.landingMode,
    landingRadiusMillitiles: fixture.landingRadiusMillitiles,
    source: fixture.source,
    targetDeathRule: fixture.targetDeathRule,
    transitTicks: fixture.transitTicks,
    triggerMaximumMillitiles: fixture.triggerMaximumMillitiles,
    triggerMinimumMillitiles: fixture.triggerMinimumMillitiles,
    untargetableDuringTransit: fixture.untargetableDuringTransit,
  }, {
    authoritative: false,
    commandsResolveBeforeMovement: true,
    confidence: "unverified",
    destinationRule: "snapshot-at-takeoff",
    disposition: "question",
    inclusiveTriggerBoundary: true,
    interpolationRule: "integer-truncate-toward-zero",
    interruptionRule: "cancel-at-last-completed-position-without-impact",
    landingDamage: 536,
    landingMode: "ground",
    landingRadiusMillitiles: 1300,
    source: "unsourced-targeted-jump-fixture",
    targetDeathRule:
      "cancel-before-takeoff; continue-to-snapshot-after-takeoff-and-exclude-dead-target",
    transitTicks: 36,
    triggerMaximumMillitiles: 5000,
    triggerMinimumMillitiles: 3500,
    untargetableDuringTransit: true,
  });
  const values = Object.keys(fixture).filter((key) => ![
    "authoritative",
    "confidence",
    "disposition",
    "provenance",
    "source",
  ].includes(key));
  assert.deepEqual(Object.keys(fixture.provenance).sort(), values.sort());
  for (const value of Object.values(fixture.provenance)) {
    assert.deepEqual(value, {
      confidence: "unverified",
      disposition: "question",
      source: "unsourced-targeted-jump-fixture",
    });
  }
  fixture.landingDamage = 1;
  fixture.provenance.transitTicks.disposition = "match";
  assert.equal(createJumpQuestionFixture().landingDamage, 536);
  assert.equal(
    createJumpQuestionFixture().provenance.transitTicks.disposition,
    "question",
  );
  assert.throws(
    () => createJumpQuestionFixture({ transitTicks: 1 }),
    /does not accept overrides/u,
  );
  assert.throws(
    () => new JumpEncounter({ commands: [], transitTicks: 1 }),
    /invalid shape/u,
  );
});

test("jump special: inclusive trigger boundaries are pure and exact", () => {
  for (const distance of [3499, 3500, 5000, 5001]) {
    assert.deepEqual(evaluateJumpQuestionBoundary(distance), {
      eligible: distance >= 3500 && distance <= 5000,
      triggerMaximumMillitiles: 5000,
      triggerMinimumMillitiles: 3500,
    });
  }
  for (const hostile of [-1, 1.5, NaN, Infinity, "3500", 3500n, null]) {
    assert.throws(() => evaluateJumpQuestionBoundary(hostile));
  }
  assert.throws(
    () => evaluateJumpQuestionBoundary(4000, { minimum: 0 }),
    /one non-negative safe integer/u,
  );
  const result = evaluateJumpQuestionBoundary(4000);
  result.triggerMinimumMillitiles = 0;
  assert.equal(evaluateJumpQuestionBoundary(3499).eligible, false);
});

test("jump special: shipped source is original and non-claims are explicit", () => {
  const source = readFileSync(
    new URL("../src/content/cards/special-movement-jump.js", import.meta.url),
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
    "charge",
    "dash",
    "recoil",
    "collision",
    "arc/height",
    "animation",
    "footage",
    "pathfinding",
    "knockback",
    "retargeting",
    "deploy",
    "ordinary-attack",
  ]) {
    assert.match(source, new RegExp(nonClaim, "u"));
  }
});

test("jump special: takeoff at 60 snapshots destination without moving", () => {
  const encounter = new JumpEncounter();
  assert.deepEqual(encounter.step(), [{
    targetId: 202,
    tick: 0,
    type: "target-acquired",
  }]);
  encounter.stepMany(59);
  assert.equal(encounter.state.tick, 60);
  assert.deepEqual(encounter.step(), [
    {
      from: { x: 3500, y: 11500 },
      targetId: 202,
      tick: 60,
      to: { x: 3500, y: 15500 },
      type: "jump-takeoff",
    },
    {
      targetable: false,
      tick: 60,
      type: "targetability-changed",
    },
  ]);
  assert.deepEqual(encounter.state.jump, {
    elapsedTicks: 0,
    from: { x: 3500, y: 11500 },
    targetId: 202,
    to: { x: 3500, y: 15500 },
  });
  assert.deepEqual(encounter.state.position, { x: 3500, y: 11500 });
  assert.equal(encounter.state.targetable, false);
});

test("jump special: researched 36-tick truncated transit trace is exact", () => {
  const encounter = new JumpEncounter();
  encounter.stepMany(61);
  const checkpoints = [
    [61, 11611, 1],
    [78, 13500, 18],
    [95, 15388, 35],
  ];
  for (const [tick, y, elapsedTicks] of checkpoints) {
    while (encounter.state.tick < tick) encounter.step();
    assert.deepEqual(encounter.step(), [{
      elapsedTicks,
      position: { x: 3500, y },
      tick,
      type: "jump-move",
    }]);
    assert.equal(encounter.state.targetable, false);
  }
  assert.equal(encounter.state.tick, 96);
  assert.deepEqual(encounter.state.position, { x: 3500, y: 15388 });
});

test("jump special: landing composes shared area damage in engine order", () => {
  const encounter = new JumpEncounter();
  encounter.stepMany(96);
  const landing = encounter.step();
  assert.deepEqual(landing, [
    {
      elapsedTicks: 36,
      position: { x: 3500, y: 15500 },
      tick: 96,
      type: "jump-move",
    },
    {
      targetable: true,
      tick: 96,
      type: "targetability-changed",
    },
    {
      position: { x: 3500, y: 15500 },
      targetId: 202,
      tick: 96,
      type: "jump-landed",
    },
    {
      center: { x: 3500, y: 15500 },
      damage: 536,
      effectId: 1,
      mode: "ground",
      radius: 1300,
      tick: 96,
      type: "effect",
    },
    {
      amount: 536,
      effectId: 1,
      targetId: 202,
      tick: 96,
      type: "hit",
    },
    {
      amount: 536,
      effectId: 1,
      targetId: 203,
      tick: 96,
      type: "hit",
    },
    {
      amount: 536,
      effectId: 1,
      targetId: 207,
      tick: 96,
      type: "hit",
    },
    {
      amount: 536,
      currentHealthAfter: 464,
      currentHealthBefore: 1000,
      effectId: 1,
      targetId: 202,
      tick: 96,
      type: "damage",
    },
    {
      amount: 536,
      currentHealthAfter: 0,
      currentHealthBefore: 536,
      effectId: 1,
      targetId: 203,
      tick: 96,
      type: "damage",
    },
    {
      amount: 536,
      currentHealthAfter: 0,
      currentHealthBefore: 536,
      effectId: 1,
      targetId: 207,
      tick: 96,
      type: "damage",
    },
    {
      effectId: 1,
      targetId: 203,
      tick: 96,
      type: "death",
    },
    {
      effectId: 1,
      targetId: 207,
      tick: 96,
      type: "death",
    },
    { tick: 96, type: "encounter-complete" },
  ]);
  assert.deepEqual(encounter.state.candidateHealth, {
    202: 464,
    203: 0,
    204: 1000,
    205: 1000,
    206: 1000,
    207: 0,
  });
  assert.equal(encounter.state.targetable, true);
  assert.equal(encounter.state.terminal, true);
  assert.equal(encounter.state.tick, 97);
});

test("jump special: ground landing hits troop and structure boundaries while filtering ineligible candidates", () => {
  const encounter = new JumpEncounter();
  encounter.run();
  const effect = replayOf(encounter, "effect");
  assert.deepEqual(effect, [{
    center: { x: 3500, y: 15500 },
    damage: 536,
    effectId: 1,
    mode: "ground",
    radius: 1300,
    tick: 96,
    type: "effect",
  }]);
  assert.deepEqual(
    replayOf(encounter, "hit").map(({ targetId }) => targetId),
    [202, 203, 207],
  );
  assert.deepEqual(
    replayOf(encounter, "death").map(({ targetId }) => targetId),
    [203, 207],
  );
  assert.deepEqual(
    [204, 205, 206].map((id) => encounter.state.candidateHealth[id]),
    [1000, 1000, 1000],
  );
});

test("jump special: pre-takeoff loss and death cancel without movement or impact", () => {
  for (const command of [
    { tick: 30, type: "target-lost" },
    { tick: 59, type: "target-killed" },
    { tick: 60, type: "target-killed" },
  ]) {
    const encounter = new JumpEncounter(createJumpSpecialFixture([command]));
    encounter.run();
    assert.equal(replayOf(encounter, "jump-cancelled").length, 1);
    assert.deepEqual(replayOf(encounter, "jump-takeoff"), []);
    assert.deepEqual(replayOf(encounter, "jump-move"), []);
    assert.deepEqual(replayOf(encounter, "effect"), []);
    assert.deepEqual(encounter.state.position, { x: 3500, y: 11500 });
    assert.equal(encounter.state.targetable, true);
  }
});

test("jump special: post-takeoff death keeps snapshot and excludes dead target", () => {
  const encounter = new JumpEncounter(createJumpSpecialFixture([
    { tick: 61, type: "target-killed" },
  ]));
  encounter.stepMany(61);
  assert.deepEqual(encounter.step(), [
    { targetId: 202, tick: 61, type: "target-died" },
    {
      elapsedTicks: 1,
      position: { x: 3500, y: 11611 },
      tick: 61,
      type: "jump-move",
    },
  ]);
  encounter.run();
  assert.deepEqual(
    replayOf(encounter, "hit").map(({ targetId }) => targetId),
    [203, 207],
  );
  assert.deepEqual(
    replayOf(encounter, "death").map(({ targetId }) => targetId),
    [203, 207],
  );
  assert.deepEqual(encounter.state.candidateHealth, {
    202: 0,
    203: 0,
    204: 1000,
    205: 1000,
    206: 1000,
    207: 0,
  });
  assert.deepEqual(replayOf(encounter, "jump-landed"), [{
    position: { x: 3500, y: 15500 },
    targetId: 202,
    tick: 96,
    type: "jump-landed",
  }]);
});

test("jump special: command-first interruption prevents motion and landing impact", () => {
  for (const [tick, y] of [
    [61, 11500],
    [78, 13388],
    [95, 15277],
    [96, 15388],
  ]) {
    const encounter = new JumpEncounter(createJumpSpecialFixture([
      { tick, type: "interrupt" },
    ]));
    encounter.stepMany(tick);
    assert.deepEqual(encounter.step(), [
      {
        phase: "transit",
        position: { x: 3500, y },
        tick,
        type: "jump-interrupted",
      },
      {
        targetable: true,
        tick,
        type: "targetability-changed",
      },
    ]);
    assert.deepEqual(encounter.state.position, { x: 3500, y });
    assert.equal(encounter.state.targetable, true);
    assert.equal(encounter.state.terminal, true);
    assert.deepEqual(replayOf(encounter, "effect"), []);
    assert.deepEqual(replayOf(encounter, "jump-landed"), []);
  }
});

test("jump special: takeoff-boundary interruption resolves before takeoff", () => {
  const encounter = new JumpEncounter(createJumpSpecialFixture([
    { tick: 60, type: "interrupt" },
  ]));
  encounter.stepMany(60);
  assert.deepEqual(encounter.step(), [{
    phase: "pretakeoff",
    position: { x: 3500, y: 11500 },
    tick: 60,
    type: "jump-interrupted",
  }]);
  assert.deepEqual(replayOf(encounter, "jump-takeoff"), []);
  assert.deepEqual(replayOf(encounter, "jump-move"), []);
  assert.deepEqual(replayOf(encounter, "effect"), []);
});

test("jump special: replay is stable across fresh, chunks, and causal restore", () => {
  for (const commands of [
    [],
    [{ tick: 61, type: "target-killed" }],
    [{ tick: 96, type: "interrupt" }],
  ]) {
    const fresh = runFresh(commands);
    const chunked = new JumpEncounter(createJumpSpecialFixture(commands));
    for (const chunk of [1, 59, 1, 17, 18, 30]) {
      chunked.stepMany(chunk);
    }
    chunked.run();
    assert.deepEqual({
      replay: chunked.replay,
      snapshot: chunked.serialize(),
      state: chunked.state,
    }, fresh);

    const partial = new JumpEncounter(createJumpSpecialFixture(commands));
    partial.stepMany(61);
    const restored = JumpEncounter.restore(partial.serialize());
    partial.run();
    restored.run();
    assert.deepEqual(restored.replay, partial.replay);
    assert.deepEqual(restored.state, partial.state);
    assert.equal(restored.serialize(), partial.serialize());
  }
});

test("jump special: setup, snapshot, return values, and bounds are hostile-safe", () => {
  const setup = createJumpSpecialFixture([
    { tick: 61, type: "target-killed" },
  ]);
  const encounter = new JumpEncounter(setup);
  setup.commands[0].tick = 0;
  encounter.run();
  assert.equal(replayOf(encounter, "target-died")[0].tick, 61);

  const returnedState = encounter.state;
  const returnedReplay = encounter.replay;
  returnedState.position.y = 0;
  returnedState.candidateHealth[203] = 999;
  returnedState.candidateHealth[207] = 999;
  returnedReplay.length = 0;
  assert.deepEqual(encounter.state.position, { x: 3500, y: 15500 });
  assert.equal(encounter.state.candidateHealth[203], 0);
  assert.equal(encounter.state.candidateHealth[207], 0);
  assert.ok(encounter.replay.length > 0);

  for (const commands of [
    new Array(2).fill({ tick: 1, type: "target-killed" }),
    [{ tick: -1, type: "target-killed" }],
    [{ tick: 97, type: "target-killed" }],
    [{ tick: 61, type: "target-lost" }],
    [{ tick: 59, type: "interrupt" }],
    [{ tick: 1, type: "unknown" }],
    [{ tick: 1, type: "target-killed", extra: true }],
  ]) {
    assert.throws(() => createJumpSpecialFixture(commands));
  }
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => createJumpSpecialFixture(sparse));
  const accessor = {};
  Object.defineProperty(accessor, "tick", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  Object.defineProperty(accessor, "type", {
    enumerable: true,
    value: "target-killed",
  });
  assert.throws(
    () => createJumpSpecialFixture([accessor]),
    /invalid shape/u,
  );
  assert.throws(() => encounter.stepMany(-1));
  assert.throws(() => encounter.run(121), /exceeds its bound/u);
});

test("jump special: snapshots bind identity, commands, and causal tick", () => {
  const encounter = new JumpEncounter(createJumpSpecialFixture([
    { tick: 61, type: "target-killed" },
  ]));
  encounter.stepMany(70);
  const canonical = encounter.serialize();
  assert.equal(JumpEncounter.restore(canonical).serialize(), canonical);
  const raw = JSON.parse(canonical);
  const invalid = [
    "no",
    "{}",
    JSON.stringify({ ...raw, version: 2 }),
    JSON.stringify({ ...raw, tick: -1 }),
    JSON.stringify({ ...raw, tick: 121 }),
    JSON.stringify({ ...raw, surprise: true }),
    JSON.stringify({
      ...raw,
      identity: { ...raw.identity, encounter: "other" },
    }),
    JSON.stringify({
      ...raw,
      identity: {
        ...raw.identity,
        commands: [{ tick: 1, type: "target-killed", extra: true }],
      },
    }),
    " ".repeat(4097),
  ];
  for (const snapshot of invalid) {
    assert.throws(() => JumpEncounter.restore(snapshot));
  }
  assert.throws(() => JumpEncounter.restore({}), /must be a string/u);

  const completed = new JumpEncounter();
  completed.run();
  const postTerminal = JSON.parse(completed.serialize());
  postTerminal.tick += 1;
  assert.throws(
    () => JumpEncounter.restore(JSON.stringify(postTerminal)),
    /post-terminal time/u,
  );
});
