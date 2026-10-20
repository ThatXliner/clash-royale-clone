import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ConsecutiveTargetRampEncounter,
  createRampFixture,
  createRampQuestionRecords,
  createRampSpecialCatalog,
} from "../src/content/index.js";
import { protectedIdentityHits } from "./helpers/protected-identity-scan.js";

const benchmark = JSON.parse(readFileSync(
  new URL("../reference/stats/cards.json", import.meta.url),
  "utf8",
));

const acquire = (tick, targetId) => ({
  targetId,
  tick,
  type: "target-acquired",
});
const command = (tick, type, targetId = null) => ({ targetId, tick, type });
const damageEvents = (encounter) =>
  encounter.replay.filter(({ type }) => type === "damage");

test("combat status ramp: original runtime identity is isolated", () => {
  const catalog = createRampSpecialCatalog();
  assert.deepEqual(catalog, [{
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 4,
    count: 1,
    damage: 36,
    deployTimeTicks: 60,
    displayName: "Cinder Ray",
    firstHitTicks: 72,
    hitSpeedTicks: 24,
    hitpoints: 1294,
    id: "cinder-ray",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 3500,
    rarity: "mythic",
    sightRangeMillitiles: 5500,
    targetMode: "ground-and-air",
  }]);
  catalog[0].damage = 1;
  assert.equal(createRampSpecialCatalog()[0].damage, 36);

  const source = readFileSync(
    new URL("../src/content/cards/special-combat-ramp.js", import.meta.url),
    "utf8",
  );
  const protectedTokens = new Set(
    benchmark.cards.flatMap(({ key, name }) => [
      key.toLowerCase(),
      name.toLowerCase(),
    ]),
  );
  assert.deepEqual(protectedIdentityHits(source, protectedTokens), []);
  assert.doesNotMatch(source, /readFile|cards\.json|reference\//u);
});

test("combat status ramp: ordinary benchmark fields remain questions", () => {
  const card = createRampSpecialCatalog()[0];
  const comparison = benchmark.cards.find(({ id }) => id === 26000037);
  assert.ok(comparison);
  assert.deepEqual(
    [card.cost, card.kind, card.rarity],
    [
      comparison.elixir_cost,
      comparison.type === "troop" ? "unit" : comparison.type,
      comparison.rarity === "legendary" ? "mythic" : comparison.rarity,
    ],
  );
  assert.equal(card.damage, comparison.damage);
  assert.equal(card.hitSpeedTicks, comparison.hit_speed_seconds * 60);
  assert.ok(comparison.unverified_fields.includes("damage"));
  assert.ok(comparison.unverified_fields.includes("hit_speed_seconds"));
  const records = createRampQuestionRecords();
  assert.equal(records.commonBaseDamage.value, card.damage);
  assert.equal(records.commonHitCadenceTicks.value, card.hitSpeedTicks);
  assert.equal(records.commonBaseDamage.disposition, "question");
});

test("combat status ramp: every absent value and policy has a frozen record", () => {
  const expected = [
    "commonAreaDamageRadius",
    "commonBaseDamage",
    "commonCount",
    "commonDeployTicks",
    "commonFirstHitTicks",
    "commonHitCadenceTicks",
    "commonHitpoints",
    "commonMovementMillitilesPerSecond",
    "commonRangeMillitiles",
    "commonSightRangeMillitiles",
    "commonTargetMode",
    "contactDelayTicks",
    "damageProgression",
    "decay",
    "eligibility",
    "explicitReset",
    "firstLaunchTicks",
    "interruption",
    "launchSnapshot",
    "lossChangeDeathReset",
    "retainedTargetIdentity",
    "sameBoundaryOrdering",
    "stageAdvancement",
    "stageCount",
    "stageThresholds",
  ];
  const first = createRampQuestionRecords();
  assert.deepEqual(Object.keys(first).sort(), expected.sort());
  assert.ok(Object.isFrozen(first));
  for (const [key, record] of Object.entries(first)) {
    assert.deepEqual(
      {
        authoritative: record.authoritative,
        confidence: record.confidence,
        disposition: record.disposition,
        key: record.key,
        source: record.source,
      },
      {
        authoritative: false,
        confidence: "unverified",
        disposition: "question",
        key,
        source: "unsourced-consecutive-target-ramp-fixture",
      },
    );
    assert.ok(Object.isFrozen(record));
    if (record.value !== null && typeof record.value === "object") {
      assert.ok(Object.isFrozen(record.value));
    }
  }
  assert.deepEqual(first.stageThresholds.value, [0, 2, 4]);
  assert.deepEqual(first.damageProgression.value, [10, 20, 40]);

  const second = createRampQuestionRecords();
  assert.notEqual(first, second);
  assert.notEqual(first.stageThresholds, second.stageThresholds);
  assert.notEqual(first.stageThresholds.value, second.stageThresholds.value);
  assert.throws(() => {
    first.stageThresholds.value[0] = 99;
  }, TypeError);
  assert.deepEqual(createRampQuestionRecords().stageThresholds.value, [0, 2, 4]);
  assert.throws(
    () => createRampQuestionRecords({ stageCount: 1 }),
    /do not accept overrides/u,
  );
});

test("combat status ramp: retained contact advances exact stages and ticks", () => {
  const encounter = new ConsecutiveTargetRampEncounter(
    createRampFixture([acquire(0, 41)]),
  );
  encounter.stepMany(101);
  assert.deepEqual(
    damageEvents(encounter).map((event) => ({
      amount: event.amount,
      sequence: event.sequence,
      stageIndex: event.stageIndex,
      targetId: event.targetId,
      tick: event.tick,
    })),
    [
      { amount: 10, sequence: 1, stageIndex: 0, targetId: 41, tick: 2 },
      { amount: 10, sequence: 2, stageIndex: 0, targetId: 41, tick: 26 },
      { amount: 20, sequence: 3, stageIndex: 1, targetId: 41, tick: 50 },
      { amount: 20, sequence: 4, stageIndex: 1, targetId: 41, tick: 74 },
      { amount: 40, sequence: 5, stageIndex: 2, targetId: 41, tick: 98 },
    ],
  );
  assert.deepEqual(
    encounter.replay.filter(({ type }) => type === "stage-changed"),
    [
      {
        consecutiveContacts: 2,
        stageIndex: 1,
        targetId: 41,
        tick: 26,
        type: "stage-changed",
      },
      {
        consecutiveContacts: 4,
        stageIndex: 2,
        targetId: 41,
        tick: 74,
        type: "stage-changed",
      },
    ],
  );
  assert.equal(encounter.state.stageIndex, 2);
});

test("combat status ramp: launch snapshot is isolated from returned mutation", () => {
  const encounter = new ConsecutiveTargetRampEncounter(
    createRampFixture([acquire(0, 7)]),
  );
  const launch = encounter.step();
  assert.deepEqual(launch, [
    { targetId: 7, tick: 0, type: "target-acquired" },
    {
      amount: 10,
      contactTick: 2,
      sequence: 1,
      stageIndex: 0,
      targetId: 7,
      tick: 0,
      type: "attack-launched",
    },
  ]);
  launch.at(-1).amount = 999;
  const state = encounter.state;
  state.pending.amount = 999;
  state.history.length = 0;
  encounter.stepMany(2);
  assert.equal(damageEvents(encounter)[0].amount, 10);
});

test("combat status ramp: loss, change, death, interruption, and reset clear", () => {
  const cases = [
    {
      commands: [
        acquire(0, 1),
        command(51, "target-lost"),
        acquire(52, 1),
      ],
      reason: "target-loss",
      targetAtReset: 1,
    },
    {
      commands: [acquire(0, 1), acquire(51, 2)],
      reason: "target-change",
      targetAtReset: 1,
    },
    {
      commands: [
        acquire(0, 1),
        command(51, "target-died", 1),
        acquire(52, 1),
      ],
      reason: "target-death",
      targetAtReset: 1,
    },
    {
      commands: [acquire(0, 1), command(51, "interrupt")],
      reason: "interruption",
      targetAtReset: 1,
    },
    {
      commands: [acquire(0, 1), command(51, "reset")],
      reason: "explicit",
      targetAtReset: 1,
    },
  ];
  for (const scenario of cases) {
    const encounter = new ConsecutiveTargetRampEncounter(
      createRampFixture(scenario.commands),
    );
    encounter.stepMany(51);
    assert.equal(encounter.state.stageIndex, 1);
    encounter.step();
    assert.deepEqual(
      encounter.replay.filter(({ type }) => type === "ramp-reset").at(-1),
      {
        reason: scenario.reason,
        targetId: scenario.targetAtReset,
        tick: 51,
        type: "ramp-reset",
      },
    );
    assert.equal(encounter.state.stageIndex, 0);
    assert.equal(encounter.state.consecutiveContacts, 0);
    if (encounter.state.pending !== null) {
      assert.equal(encounter.state.pending.stageIndex, 0);
      assert.equal(encounter.state.pending.amount, 10);
    }
  }
});

test("combat status ramp: command-first same-boundary order cancels contact", () => {
  for (const type of ["interrupt", "reset", "target-lost"]) {
    const encounter = new ConsecutiveTargetRampEncounter(createRampFixture([
      acquire(0, 9),
      command(2, type),
    ]));
    encounter.stepMany(3);
    assert.deepEqual(damageEvents(encounter), []);
    assert.equal(encounter.state.stageIndex, 0);
    const tickTwo = encounter.replay.filter(({ tick }) => tick === 2);
    assert.equal(tickTwo[0].type, "ramp-reset");
  }
});

test("combat status ramp: stable IDs govern retention and unrelated death", () => {
  const encounter = new ConsecutiveTargetRampEncounter(createRampFixture([
    acquire(0, 17),
    command(25, "target-died", 88),
  ]));
  encounter.stepMany(51);
  assert.deepEqual(
    damageEvents(encounter).map(({ amount, targetId, tick }) => ({
      amount,
      targetId,
      tick,
    })),
    [
      { amount: 10, targetId: 17, tick: 2 },
      { amount: 10, targetId: 17, tick: 26 },
      { amount: 20, targetId: 17, tick: 50 },
    ],
  );
  assert.equal(encounter.state.targetId, 17);
  assert.equal(encounter.state.stageIndex, 1);
});

test("combat status ramp: fresh, chunked, reordered, and restored runs are exact", () => {
  const normal = [
    acquire(0, 5),
    command(77, "interrupt"),
    acquire(130, 6),
    command(181, "reset"),
  ];
  const reordered = normal.map(({ targetId, tick, type }) => {
    const value = Object.create(null);
    value.type = type;
    value.targetId = targetId;
    value.tick = tick;
    return value;
  });
  const one = new ConsecutiveTargetRampEncounter(createRampFixture(normal));
  for (let tick = 0; tick < 230; tick += 1) one.step();
  const chunked = new ConsecutiveTargetRampEncounter(
    createRampFixture(reordered),
  );
  chunked.stepMany(17);
  chunked.stepMany(99);
  chunked.stepMany(114);
  const fresh = new ConsecutiveTargetRampEncounter(createRampFixture(normal));
  fresh.stepMany(230);
  assert.equal(chunked.serialize(), one.serialize());
  assert.equal(fresh.serialize(), one.serialize());
  assert.deepEqual(chunked.replay, one.replay);

  const causal = new ConsecutiveTargetRampEncounter(createRampFixture(normal));
  for (let tick = 0; tick <= 230; tick += 1) {
    const restored = ConsecutiveTargetRampEncounter.restore(causal.serialize());
    assert.equal(restored.serialize(), causal.serialize());
    if (tick < 230) {
      assert.deepEqual(restored.step(), causal.step());
      assert.equal(restored.serialize(), causal.serialize());
    }
  }
});

test("combat status ramp: every stage and pending phase restores byte exactly", () => {
  const encounter = new ConsecutiveTargetRampEncounter(
    createRampFixture([acquire(0, 22)]),
  );
  const observed = new Set();
  for (let tick = 0; tick < 100; tick += 1) {
    const before = encounter.state;
    observed.add(`${before.stageIndex}:${before.pending === null ? "cadence" : "pending"}`);
    const restored = ConsecutiveTargetRampEncounter.restore(encounter.serialize());
    assert.equal(restored.serialize(), encounter.serialize());
    assert.deepEqual(restored.step(), encounter.step());
    assert.equal(restored.serialize(), encounter.serialize());
  }
  assert.deepEqual([...observed].sort(), [
    "0:cadence",
    "0:pending",
    "1:cadence",
    "1:pending",
    "2:cadence",
    "2:pending",
  ]);
});

test("combat status ramp: caller mutation after setup cannot alter behavior", () => {
  const commands = [acquire(0, 3), command(51, "reset")];
  const fixture = createRampFixture(commands);
  const encounter = new ConsecutiveTargetRampEncounter(fixture);
  commands[0].targetId = 999;
  commands.push(command(2, "target-lost"));
  fixture.commands[0].targetId = 888;
  fixture.commands.length = 0;
  encounter.stepMany(3);
  assert.equal(damageEvents(encounter)[0].targetId, 3);
});

test("combat status ramp: hostile fixtures reject unread and atomically", () => {
  const invalid = [
    [acquire(-1, 1)],
    [acquire(4096, 1)],
    [acquire(0, 0)],
    [acquire(0, Number.MAX_SAFE_INTEGER + 1)],
    [command(0, "target-lost", 1)],
    [command(0, "unknown")],
    [acquire(2, 1), acquire(2, 2)],
    [acquire(3, 1), acquire(2, 2)],
    Array.from({ length: 65 }, (_, tick) => command(tick, "reset")),
  ];
  for (const commands of invalid) {
    assert.throws(() => createRampFixture(commands));
  }
  const sparse = [acquire(0, 1)];
  delete sparse[0];
  assert.throws(() => createRampFixture(sparse), /dense/u);
  const extraArray = [acquire(0, 1)];
  extraArray.extra = true;
  assert.throws(() => createRampFixture(extraArray));
  const extraCommand = { ...acquire(0, 1), extra: true };
  assert.throws(() => createRampFixture([extraCommand]));
  const unsafePrototype = Object.create({ inherited: true });
  Object.assign(unsafePrototype, acquire(0, 1));
  assert.throws(() => createRampFixture([unsafePrototype]), /plain object/u);
  const getter = acquire(0, 1);
  let getterCalls = 0;
  Object.defineProperty(getter, "tick", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error("must not execute");
    },
  });
  assert.throws(() => createRampFixture([getter]), /invalid shape/u);
  assert.equal(getterCalls, 0);

  const encounter = new ConsecutiveTargetRampEncounter(
    createRampFixture([acquire(0, 1)]),
  );
  encounter.stepMany(3);
  const before = encounter.serialize();
  for (const count of [-1, 0.5, 4097, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => encounter.stepMany(count));
    assert.equal(encounter.serialize(), before);
  }
});

test("combat status ramp: snapshots are canonical, bounded, and strict", () => {
  const encounter = new ConsecutiveTargetRampEncounter(
    createRampFixture([acquire(0, 12)]),
  );
  encounter.stepMany(80);
  const snapshot = JSON.parse(encounter.serialize());
  for (const mutate of [
    (value) => { value.extra = true; },
    (value) => { value.version = 2; },
    (value) => { value.identity.fixture = "forged"; },
    (value) => { value.identity.commands.push(acquire(0, 99)); },
    (value) => { value.state.tick = -1; },
    (value) => { value.state.commandIndex = 0; },
    (value) => { value.state.stageIndex = 0; },
    (value) => {
      value.state.attackSequence = Number.MAX_SAFE_INTEGER;
      value.state.consecutiveContacts = Number.MAX_SAFE_INTEGER;
      value.state.stageIndex = 2;
    },
    (value) => { value.state.targetId = null; },
    (value) => { value.state.history[0].tick = value.state.tick; },
    (value) => { value.state.history[0].extra = true; },
    (value) => {
      value.state.pending = {
        amount: 999,
        contactTick: value.state.tick,
        sequence: 1,
        stageIndex: 0,
        targetId: 12,
      };
    },
  ]) {
    const hostile = structuredClone(snapshot);
    mutate(hostile);
    assert.throws(
      () => ConsecutiveTargetRampEncounter.restore(JSON.stringify(hostile)),
    );
  }
  assert.throws(() => ConsecutiveTargetRampEncounter.restore(null));
  assert.throws(() => ConsecutiveTargetRampEncounter.restore("{"));
  assert.throws(
    () => ConsecutiveTargetRampEncounter.restore(`"${"x".repeat(131073)}"`),
    /byte bound/u,
  );
});
