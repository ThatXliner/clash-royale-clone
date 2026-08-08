import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DashEncounter,
  createDashQuestionFixture,
  createDashSpecialCatalog,
  createDashSpecialFixture,
  evaluateDashQuestionBoundary,
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
  ["bandit"],
);

function events(encounter, type) {
  return encounter.replay.filter((event) => event.type === type);
}

test("dash special: original definition is isolated and question-backed", () => {
  const first = createDashSpecialCatalog();
  assert.deepEqual(first, [{
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 3,
    count: 1,
    damage: 193,
    deployTimeTicks: 60,
    displayName: "Veilrunner",
    firstHitTicks: 36,
    hitSpeedTicks: 60,
    hitpoints: 907,
    id: "veilrunner",
    kind: "unit",
    movementMillitilesPerSecond: 1500,
    rangeMillitiles: 750,
    rarity: "mythic",
    sightRangeMillitiles: 6000,
    targetMode: "ground",
  }]);
  first[0].damage = 1;
  assert.equal(createDashSpecialCatalog()[0].damage, 193);

  const report = parity(createDashSpecialCatalog()[0], "bandit");
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

test("dash special: question fixture is complete, explicit, and isolated", () => {
  const expected = {
    authoritative: false,
    bonusDamage: 193,
    confidence: "unverified",
    disposition: "question",
    inclusiveLaunchBoundary: true,
    interruptionRule: "cancel-at-last-completed-position",
    interpolationRule: "integer-truncate-toward-zero",
    launchMaximumMillitiles: 6000,
    launchMinimumMillitiles: 3500,
    provenance: {
      bonusDamage: {
        confidence: "unverified",
        disposition: "question",
        source: "unsourced-targeted-dash-fixture",
      },
      inclusiveLaunchBoundary: {
        confidence: "unverified",
        disposition: "question",
        source: "unsourced-targeted-dash-fixture",
      },
      interruptionRule: {
        confidence: "unverified",
        disposition: "question",
        source: "unsourced-targeted-dash-fixture",
      },
      interpolationRule: {
        confidence: "unverified",
        disposition: "question",
        source: "unsourced-targeted-dash-fixture",
      },
      launchMaximumMillitiles: {
        confidence: "unverified",
        disposition: "question",
        source: "unsourced-targeted-dash-fixture",
      },
      launchMinimumMillitiles: {
        confidence: "unverified",
        disposition: "question",
        source: "unsourced-targeted-dash-fixture",
      },
      targetDeathRule: {
        confidence: "unverified",
        disposition: "question",
        source: "unsourced-targeted-dash-fixture",
      },
      transitTicks: {
        confidence: "unverified",
        disposition: "question",
        source: "unsourced-targeted-dash-fixture",
      },
      untargetableDuringTransit: {
        confidence: "unverified",
        disposition: "question",
        source: "unsourced-targeted-dash-fixture",
      },
    },
    source: "unsourced-targeted-dash-fixture",
    targetDeathRule: "continue-to-snapshot-and-skip-damage",
    transitTicks: 30,
    untargetableDuringTransit: true,
  };
  const fixture = createDashQuestionFixture();
  assert.deepEqual(fixture, expected);
  fixture.bonusDamage = 0;
  fixture.provenance.transitTicks.disposition = "match";
  assert.deepEqual(createDashQuestionFixture(), expected);
  assert.throws(
    () => createDashQuestionFixture({ transitTicks: 1 }),
    /does not accept overrides/u,
  );
  assert.throws(
    () => new DashEncounter({ commands: [], transitTicks: 1 }),
    /invalid shape/u,
  );
});

test("dash special: inclusive launch boundary is exact and immutable", () => {
  for (const distance of [3499, 3500, 6000, 6001]) {
    assert.deepEqual(evaluateDashQuestionBoundary(distance), {
      eligible: distance >= 3500 && distance <= 6000,
      launchMaximumMillitiles: 6000,
      launchMinimumMillitiles: 3500,
    });
  }
  for (const hostile of [-1, 1.5, NaN, Infinity, "3500", 3500n, null]) {
    assert.throws(() => evaluateDashQuestionBoundary(hostile));
  }
  assert.throws(
    () => evaluateDashQuestionBoundary(5000, { transitTicks: 1 }),
    /one non-negative safe integer/u,
  );
  const value = evaluateDashQuestionBoundary(5000);
  value.launchMinimumMillitiles = 0;
  assert.equal(
    evaluateDashQuestionBoundary(3499).eligible,
    false,
  );
});

test("dash special: source is original and scope exclusions are explicit", () => {
  const source = readFileSync(
    new URL("../src/content/cards/special-movement-dash.js", import.meta.url),
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
    "collision",
    "animation",
    "footage",
    "general",
    "charge",
    "jump",
    "recoil",
    "pathfinding",
    "crowd-control",
    "retargeting",
  ]) {
    assert.match(source, new RegExp(nonClaim, "u"));
  }
});

test("dash special: fixed launch snapshots target and exact start trace", () => {
  const encounter = new DashEncounter();
  assert.deepEqual(encounter.step(), [{
    targetId: 202,
    tick: 0,
    type: "target-acquired",
  }]);
  encounter.stepMany(59);
  assert.deepEqual(encounter.state, {
    inTransit: false,
    launch: null,
    phase: "ready",
    position: { x: 3500, y: 11500 },
    targetAlive: true,
    targetHealth: 1000,
    targetId: 202,
    targetable: true,
    terminal: false,
    tick: 60,
  });
  assert.deepEqual(encounter.step(), [
    {
      from: { x: 3500, y: 11500 },
      targetId: 202,
      tick: 60,
      to: { x: 3500, y: 16500 },
      type: "dash-launched",
    },
    {
      targetable: false,
      tick: 60,
      type: "targetability-changed",
    },
    {
      elapsedTicks: 1,
      position: { x: 3500, y: 11666 },
      tick: 60,
      type: "dash-move",
    },
  ]);
  assert.deepEqual(encounter.state.launch, {
    elapsedTicks: 1,
    from: { x: 3500, y: 11500 },
    targetId: 202,
    to: { x: 3500, y: 16500 },
  });
  assert.equal(encounter.state.targetable, false);
});

test("dash special: 30-tick integer transit and arrival order are exact", () => {
  const encounter = new DashEncounter();
  encounter.stepMany(61);
  encounter.stepMany(28);
  assert.deepEqual(encounter.state.position, { x: 3500, y: 16333 });
  assert.equal(encounter.state.launch.elapsedTicks, 29);
  assert.equal(encounter.state.targetable, false);
  assert.deepEqual(encounter.step(), [
    {
      elapsedTicks: 30,
      position: { x: 3500, y: 16500 },
      tick: 89,
      type: "dash-move",
    },
    {
      targetable: true,
      tick: 89,
      type: "targetability-changed",
    },
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
    { tick: 89, type: "encounter-complete" },
  ]);
  assert.equal(events(encounter, "dash-move").length, 30);
  assert.deepEqual(
    events(encounter, "targetability-changed").map(
      ({ targetable, tick }) => ({ targetable, tick }),
    ),
    [
      { targetable: false, tick: 60 },
      { targetable: true, tick: 89 },
    ],
  );
  assert.equal(encounter.state.terminal, true);
  assert.equal(encounter.state.targetable, true);
  assert.equal(encounter.state.tick, 90);
});

test("dash special: pre-launch loss cancels without transit", () => {
  const encounter = new DashEncounter(createDashSpecialFixture([
    { tick: 30, type: "target-lost" },
  ]));
  encounter.stepMany(30);
  assert.deepEqual(encounter.step(), [{
    reason: "target-lost-before-launch",
    targetId: 202,
    tick: 30,
    type: "dash-cancelled",
  }]);
  assert.equal(encounter.state.terminal, true);
  assert.equal(encounter.state.targetable, true);
  assert.deepEqual(events(encounter, "dash-launched"), []);
  assert.deepEqual(encounter.step(), []);
});

test("dash special: prelaunch and launch-boundary death cancel before movement", () => {
  for (const tick of [59, 60]) {
    const encounter = new DashEncounter(createDashSpecialFixture([
      { tick, type: "target-killed" },
    ]));
    encounter.stepMany(tick);
    assert.deepEqual(encounter.step(), [
      {
        currentHealth: 0,
        targetId: 202,
        tick,
        type: "target-died",
      },
      {
        reason: "target-killed-before-launch",
        targetId: 202,
        tick,
        type: "dash-cancelled",
      },
    ]);
    assert.deepEqual(encounter.state, {
      inTransit: false,
      launch: null,
      phase: "terminal",
      position: { x: 3500, y: 11500 },
      targetAlive: false,
      targetHealth: 0,
      targetId: 202,
      targetable: true,
      terminal: true,
      tick: tick + 1,
    });
    assert.deepEqual(events(encounter, "dash-launched"), []);
    assert.deepEqual(events(encounter, "dash-move"), []);
    assert.deepEqual(events(encounter, "dash-arrived"), []);
    assert.deepEqual(events(encounter, "dash-damage"), []);
  }
});

test("dash special: launch-boundary interrupt cancels before first movement", () => {
  const encounter = new DashEncounter(createDashSpecialFixture([
    { tick: 60, type: "interrupt" },
  ]));
  encounter.stepMany(60);
  assert.deepEqual(encounter.step(), [{
    phase: "prelaunch",
    position: { x: 3500, y: 11500 },
    targetId: 202,
    tick: 60,
    type: "dash-interrupted",
  }]);
  assert.deepEqual(encounter.state, {
    inTransit: false,
    launch: null,
    phase: "terminal",
    position: { x: 3500, y: 11500 },
    targetAlive: true,
    targetHealth: 1000,
    targetId: 202,
    targetable: true,
    terminal: true,
    tick: 61,
  });
  assert.deepEqual(events(encounter, "dash-launched"), []);
  assert.deepEqual(events(encounter, "dash-move"), []);
  assert.deepEqual(events(encounter, "dash-arrived"), []);
  assert.deepEqual(events(encounter, "dash-damage"), []);
});

test("dash special: interruption stops at last completed position", () => {
  const encounter = new DashEncounter(createDashSpecialFixture([
    { tick: 70, type: "interrupt" },
  ]));
  encounter.stepMany(70);
  assert.deepEqual(encounter.state.position, { x: 3500, y: 13166 });
  assert.equal(encounter.state.targetable, false);
  assert.deepEqual(encounter.step(), [
    {
      position: { x: 3500, y: 13166 },
      tick: 70,
      type: "dash-interrupted",
    },
    {
      targetable: true,
      tick: 70,
      type: "targetability-changed",
    },
  ]);
  assert.equal(encounter.state.terminal, true);
  assert.equal(encounter.state.inTransit, false);
  assert.equal(encounter.state.targetable, true);
  assert.deepEqual(events(encounter, "dash-damage"), []);
});

test("dash special: target death preserves snapshot transit and skips damage", () => {
  const encounter = new DashEncounter(createDashSpecialFixture([
    { tick: 70, type: "target-killed" },
  ]));
  encounter.stepMany(70);
  assert.deepEqual(encounter.step(), [
    {
      currentHealth: 0,
      targetId: 202,
      tick: 70,
      type: "target-died",
    },
    {
      elapsedTicks: 11,
      position: { x: 3500, y: 13333 },
      tick: 70,
      type: "dash-move",
    },
  ]);
  assert.equal(encounter.state.targetId, 202);
  assert.equal(encounter.state.targetAlive, false);
  encounter.run();
  assert.deepEqual(events(encounter, "dash-arrived"), [{
    position: { x: 3500, y: 16500 },
    targetId: 202,
    tick: 89,
    type: "dash-arrived",
  }]);
  assert.deepEqual(events(encounter, "dash-damage"), []);
  assert.deepEqual(events(encounter, "dash-damage-skipped"), [{
    reason: "snapshotted-target-dead",
    targetId: 202,
    tick: 89,
    type: "dash-damage-skipped",
  }]);
});

test("dash special: death and interruption boundary matrix has exact ordering", () => {
  for (const { tick, elapsedBefore, positionBefore } of [
    { tick: 61, elapsedBefore: 1, positionBefore: 11666 },
    { tick: 88, elapsedBefore: 28, positionBefore: 16166 },
    { tick: 89, elapsedBefore: 29, positionBefore: 16333 },
  ]) {
    const death = new DashEncounter(createDashSpecialFixture([
      { tick, type: "target-killed" },
    ]));
    death.stepMany(tick);
    assert.equal(death.state.launch.elapsedTicks, elapsedBefore);
    assert.deepEqual(death.state.position, { x: 3500, y: positionBefore });
    const deathEvents = death.step();
    assert.deepEqual(deathEvents.slice(0, 2), [
      {
        currentHealth: 0,
        targetId: 202,
        tick,
        type: "target-died",
      },
      {
        elapsedTicks: elapsedBefore + 1,
        position: {
          x: 3500,
          y: tick === 89
            ? 16500
            : 11500 + Math.trunc((5000 * (elapsedBefore + 1)) / 30),
        },
        tick,
        type: "dash-move",
      },
    ]);
    if (tick === 89) {
      assert.deepEqual(deathEvents.slice(2), [
        {
          targetable: true,
          tick: 89,
          type: "targetability-changed",
        },
        {
          position: { x: 3500, y: 16500 },
          targetId: 202,
          tick: 89,
          type: "dash-arrived",
        },
        {
          reason: "snapshotted-target-dead",
          targetId: 202,
          tick: 89,
          type: "dash-damage-skipped",
        },
        { tick: 89, type: "encounter-complete" },
      ]);
    } else {
      death.run();
      assert.deepEqual(events(death, "dash-damage"), []);
      assert.equal(events(death, "dash-damage-skipped").length, 1);
    }

    const interruption = new DashEncounter(createDashSpecialFixture([
      { tick, type: "interrupt" },
    ]));
    interruption.stepMany(tick);
    assert.deepEqual(interruption.step(), [
      {
        position: { x: 3500, y: positionBefore },
        tick,
        type: "dash-interrupted",
      },
      {
        targetable: true,
        tick,
        type: "targetability-changed",
      },
    ]);
    assert.equal(interruption.state.terminal, true);
    assert.equal(interruption.state.targetable, true);
    assert.deepEqual(interruption.state.position, {
      x: 3500,
      y: positionBefore,
    });
    assert.deepEqual(events(interruption, "dash-arrived"), []);
    assert.deepEqual(events(interruption, "dash-damage"), []);
  }
});

test("dash special: fixed commands reject hostile and noncausal inputs", () => {
  for (const commands of [
    [{ tick: -1, type: "target-lost" }],
    [{ tick: 60, type: "target-lost" }],
    [{ tick: 90, type: "interrupt" }],
    [{ tick: 59, type: "interrupt" }],
    [{ tick: 90, type: "target-killed" }],
    [{ tick: 61, type: "target-lost" }],
    [{ tick: 61, type: "charge" }],
    [
      { tick: 10, type: "target-lost" },
      { tick: 70, type: "interrupt" },
    ],
  ]) {
    assert.throws(() => createDashSpecialFixture(commands));
  }
  const sparse = [{ tick: 10, type: "target-lost" }];
  delete sparse[0];
  assert.throws(() => createDashSpecialFixture(sparse), /dense/u);
  const getter = [{ tick: 10, type: "target-lost" }];
  Object.defineProperty(getter[0], "tick", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  assert.throws(
    () => createDashSpecialFixture(getter),
    /invalid shape|data/u,
  );
});

test("dash special: fixture, state, and replay observations are isolated", () => {
  const commands = [{ tick: 70, type: "interrupt" }];
  const fixture = createDashSpecialFixture(commands);
  commands[0].tick = 61;
  assert.deepEqual(fixture, {
    commands: [{ tick: 70, type: "interrupt" }],
  });
  fixture.commands[0].tick = 62;

  const encounter = new DashEncounter(createDashSpecialFixture([
    { tick: 70, type: "interrupt" },
  ]));
  encounter.stepMany(65);
  const state = encounter.state;
  const replay = encounter.replay;
  state.position.y = 0;
  state.launch.from.y = 0;
  replay[0].targetId = 999;
  assert.deepEqual(encounter.state.position, { x: 3500, y: 12333 });
  assert.deepEqual(encounter.state.launch.from, { x: 3500, y: 11500 });
  assert.equal(encounter.replay[0].targetId, 202);
});

test("dash special: chunk, fresh, and causal restore are byte exact", () => {
  for (const commands of [
    [],
    [{ tick: 30, type: "target-lost" }],
    [{ tick: 59, type: "target-killed" }],
    [{ tick: 60, type: "interrupt" }],
    [{ tick: 60, type: "target-killed" }],
    [{ tick: 70, type: "interrupt" }],
    [{ tick: 70, type: "target-killed" }],
  ]) {
    const fixture = createDashSpecialFixture(commands);
    const one = new DashEncounter(fixture);
    for (let tick = 0; tick < 69; tick += 1) one.step();
    const chunk = new DashEncounter(fixture);
    chunk.stepMany(69);
    assert.equal(chunk.serialize(), one.serialize());
    assert.deepEqual(chunk.state, one.state);
    assert.deepEqual(chunk.replay, one.replay);

    const restored = DashEncounter.restore(chunk.serialize());
    assert.equal(restored.serialize(), chunk.serialize());
    assert.deepEqual(restored.state, chunk.state);
    assert.deepEqual(restored.replay, chunk.replay);
    one.run();
    restored.run();
    assert.equal(restored.serialize(), one.serialize());
    assert.deepEqual(restored.state, one.state);
    assert.deepEqual(restored.replay, one.replay);
  }
});

test("dash special: hostile snapshots and post-terminal time are rejected", () => {
  const encounter = new DashEncounter();
  encounter.stepMany(69);
  const snapshot = JSON.parse(encounter.serialize());
  for (const mutate of [
    (value) => { value.tick = -1; },
    (value) => { value.tick = 101; },
    (value) => { value.version = 2; },
    (value) => { value.extra = true; },
    (value) => { value.identity.encounter = "forged"; },
    (value) => {
      value.identity.commands = [{ tick: 59, type: "interrupt" }];
    },
  ]) {
    const hostile = structuredClone(snapshot);
    mutate(hostile);
    assert.throws(() => DashEncounter.restore(JSON.stringify(hostile)));
  }
  assert.throws(
    () => DashEncounter.restore(" ".repeat(4097)),
    /size bound/u,
  );
  assert.throws(() => DashEncounter.restore(null));
  assert.throws(() => DashEncounter.restore("{"));

  const terminal = new DashEncounter();
  terminal.run();
  const postTerminal = JSON.parse(terminal.serialize());
  postTerminal.tick += 1;
  assert.throws(
    () => DashEncounter.restore(JSON.stringify(postTerminal)),
    /post-terminal/u,
  );
});

test("dash special: terminal state and bounds are stable", () => {
  const encounter = new DashEncounter();
  const result = encounter.run();
  assert.equal(result.tick, 90);
  assert.equal(result.terminal, true);
  const serialized = encounter.serialize();
  assert.deepEqual(encounter.step(), []);
  assert.deepEqual(encounter.stepMany(100), []);
  assert.equal(encounter.serialize(), serialized);
  assert.throws(() => encounter.run(101), /tick limit/u);
});
