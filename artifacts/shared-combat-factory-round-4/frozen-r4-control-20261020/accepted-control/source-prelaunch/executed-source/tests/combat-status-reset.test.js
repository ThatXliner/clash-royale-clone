import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  InstantaneousCombatResetEncounter,
  createResetFixture,
  createResetQuestionRecords,
  createResetSpecialCatalog,
} from "../src/content/index.js";
import { protectedIdentityHits } from "./helpers/protected-identity-scan.js";

const benchmark = JSON.parse(readFileSync(
  new URL("../reference/stats/cards.json", import.meta.url),
  "utf8",
));

const command = (
  tick,
  type,
  sourceId = null,
  targetId = null,
) => ({ sourceId, targetId, tick, type });
const acquire = (tick, targetId) =>
  command(tick, "acquire-target", null, targetId);
const reset = (tick, targetId, sourceId = 91) =>
  command(tick, "reset", sourceId, targetId);
const eventsOf = (encounter, type) =>
  encounter.replay.filter((event) => event.type === type);
const encounter = (commands) =>
  new InstantaneousCombatResetEncounter(createResetFixture(commands));

test("combat status reset: Static Burst is original and ordinary mapping is test-only", () => {
  const catalog = createResetSpecialCatalog();
  assert.deepEqual(catalog, [{
    areaDamageRadiusMillitiles: 2500,
    components: [],
    cost: 2,
    count: 1,
    damage: 192,
    deployTimeTicks: null,
    displayName: "Static Burst",
    firstHitTicks: null,
    hitSpeedTicks: null,
    hitpoints: null,
    id: "static-burst",
    kind: "effect",
    movementMillitilesPerSecond: null,
    rangeMillitiles: null,
    rarity: "standard",
    sightRangeMillitiles: null,
    targetMode: "ground-and-air",
  }]);
  catalog[0].damage = 1;
  assert.equal(createResetSpecialCatalog()[0].damage, 192);

  const comparison = benchmark.cards.find(({ id }) => id === 28000008);
  assert.ok(comparison);
  assert.deepEqual(
    {
      areaDamageRadiusMillitiles:
        comparison.area_damage_radius_tiles * 1000,
      cost: comparison.elixir_cost,
      count: comparison.count,
      damage: comparison.damage,
      kind: comparison.type === "spell" ? "effect" : comparison.type,
      targetMode: comparison.targets === "air_and_ground"
        ? "ground-and-air"
        : comparison.targets,
    },
    {
      areaDamageRadiusMillitiles:
        createResetSpecialCatalog()[0].areaDamageRadiusMillitiles,
      cost: createResetSpecialCatalog()[0].cost,
      count: createResetSpecialCatalog()[0].count,
      damage: createResetSpecialCatalog()[0].damage,
      kind: createResetSpecialCatalog()[0].kind,
      targetMode: createResetSpecialCatalog()[0].targetMode,
    },
  );
  assert.ok(comparison.unverified_fields.includes("damage"));
  assert.ok(comparison.unverified_fields.includes("area_damage_radius_tiles"));

  const source = readFileSync(
    new URL("../src/content/cards/special-combat-reset.js", import.meta.url),
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

test("combat status reset: every absent number and policy is a fresh frozen question", () => {
  const required = [
    "attackCadenceTicks",
    "attackReadyBoundary",
    "buffCoupling",
    "cadenceRestart",
    "chargeCoupling",
    "commandFirstPriority",
    "commonAreaDamageRadiusMillitiles",
    "commonCount",
    "commonDamage",
    "commonDeployTimeTicks",
    "commonFirstHitTicks",
    "commonHitSpeedTicks",
    "commonHitpoints",
    "commonMovementMillitilesPerSecond",
    "commonRangeMillitiles",
    "commonSightRangeMillitiles",
    "commonTargetMode",
    "contactDelayTicks",
    "deathPolicy",
    "delivery",
    "firstHitWindupTicks",
    "hitCounterClearing",
    "idleBehavior",
    "immunity",
    "instantaneousTick",
    "interruption",
    "pendingContactCancellation",
    "pendingLaunchCancellation",
    "rampDamageStages",
    "rampStageClearing",
    "rampStageThresholds",
    "repeatedResets",
    "sameBoundaryOrdering",
    "slowCoupling",
    "snareCoupling",
    "sourceEligibility",
    "stunCoupling",
    "syntheticTargetHealth",
    "targetEligibility",
    "targetReacquisition",
    "targetRetention",
    "ticksPerSecond",
    "windupRestart",
  ];
  const first = createResetQuestionRecords();
  const second = createResetQuestionRecords();
  assert.deepEqual(Object.keys(first).sort(), required.sort());
  assert.ok(Object.isFrozen(first));
  for (const key of required) {
    assert.notStrictEqual(first[key], second[key]);
    assert.deepEqual(
      {
        authoritative: first[key].authoritative,
        confidence: first[key].confidence,
        disposition: first[key].disposition,
        key: first[key].key,
        source: first[key].source,
      },
      {
        authoritative: false,
        confidence: "unverified",
        disposition: "question",
        key,
        source: "unsourced-instantaneous-combat-reset-composition",
      },
    );
    assert.ok(Object.isFrozen(first[key]));
    if (first[key].value !== null && typeof first[key].value === "object") {
      assert.ok(Object.isFrozen(first[key].value));
    }
  }
  assert.deepEqual(first.rampDamageStages.value, [10, 20, 40]);
  assert.deepEqual(first.rampStageThresholds.value, [0, 2, 4]);
  assert.throws(() => {
    first.rampDamageStages.value[0] = 99;
  }, TypeError);
  assert.throws(
    () => createResetQuestionRecords({ firstHitWindupTicks: 1 }),
    /do not accept overrides/u,
  );
});

test("combat status reset: untouched ramp schedule has exact integer ticks and stages", () => {
  const sim = encounter([acquire(0, 41)]);
  sim.stepMany(41);
  assert.deepEqual(eventsOf(sim, "attack-contact").map((event) => ({
    amount: event.amount,
    sequence: event.sequence,
    stageIndex: event.stageIndex,
    targetId: event.targetId,
    tick: event.tick,
  })), [
    { amount: 10, sequence: 1, stageIndex: 0, targetId: 41, tick: 8 },
    { amount: 10, sequence: 2, stageIndex: 0, targetId: 41, tick: 16 },
    { amount: 20, sequence: 3, stageIndex: 1, targetId: 41, tick: 24 },
    { amount: 20, sequence: 4, stageIndex: 1, targetId: 41, tick: 32 },
    { amount: 40, sequence: 5, stageIndex: 2, targetId: 41, tick: 40 },
  ]);
});

test("combat status reset: reset at idle is an instantaneous recorded no-op", () => {
  const sim = encounter([reset(0, 99), acquire(2, 7)]);
  sim.stepMany(11);
  assert.deepEqual(eventsOf(sim, "combat-reset"), [{
    applied: false,
    reason: "idle",
    sourceId: 91,
    targetId: 99,
    tick: 0,
    type: "combat-reset",
  }]);
  assert.deepEqual(
    eventsOf(sim, "attack-contact").map(({ amount, stageIndex, tick }) => ({
      amount,
      stageIndex,
      tick,
    })),
    [{ amount: 10, stageIndex: 0, tick: 10 }],
  );
});

test("combat status reset: windup reset retains target and restarts exact first hit", () => {
  const sim = encounter([acquire(0, 7), reset(3, 7)]);
  sim.stepMany(12);
  assert.equal(sim.state.targetId, 7);
  assert.deepEqual(eventsOf(sim, "attack-launched").map(({ tick }) => tick), [9]);
  assert.deepEqual(
    eventsOf(sim, "attack-contact").map(({ amount, stageIndex, tick }) => ({
      amount,
      stageIndex,
      tick,
    })),
    [{ amount: 10, stageIndex: 0, tick: 11 }],
  );
});

test("combat status reset: command-first reset wins on attack-ready boundary", () => {
  const sim = encounter([acquire(0, 8), reset(6, 8)]);
  sim.stepMany(15);
  assert.deepEqual(eventsOf(sim, "attack-launched").map(({ tick }) => tick), [12]);
  assert.deepEqual(eventsOf(sim, "attack-contact").map(({ tick }) => tick), [14]);
  assert.equal(sim.replay.some(
    ({ tick, type }) => tick === 6 && type === "attack-launched",
  ), false);
});

test("combat status reset: reset between launch and contact cancels contact", () => {
  const sim = encounter([acquire(0, 9), reset(7, 9)]);
  sim.stepMany(16);
  assert.deepEqual(eventsOf(sim, "attack-launched").map(({ tick }) => tick), [6, 13]);
  assert.deepEqual(eventsOf(sim, "attack-contact").map(({ tick }) => tick), [15]);
  assert.equal(sim.state.consecutiveHits, 1);
  assert.equal(sim.state.stageIndex, 0);
});

test("combat status reset: command-first reset wins on contact boundary", () => {
  const sim = encounter([acquire(0, 10), reset(8, 10)]);
  sim.stepMany(17);
  assert.deepEqual(eventsOf(sim, "attack-contact").map(({ tick }) => tick), [16]);
  assert.deepEqual(eventsOf(sim, "attack-contact").map(({ amount }) => amount), [10]);
  assert.equal(sim.replay.some(
    ({ tick, type }) => tick === 8 && type === "attack-contact",
  ), false);
});

test("combat status reset: cadence reset restarts windup and stage zero damage", () => {
  const sim = encounter([acquire(0, 11), reset(10, 11)]);
  sim.stepMany(19);
  assert.deepEqual(
    eventsOf(sim, "attack-contact").map(({ amount, stageIndex, tick }) => ({
      amount,
      stageIndex,
      tick,
    })),
    [
      { amount: 10, stageIndex: 0, tick: 8 },
      { amount: 10, stageIndex: 0, tick: 18 },
    ],
  );
  assert.equal(sim.state.targetId, 11);
});

test("combat status reset: every ramp stage and counter clear to exact post-reset hit", () => {
  for (const scenario of [
    { expectedBefore: 0, resetTick: 10 },
    { expectedBefore: 1, resetTick: 18 },
    { expectedBefore: 2, resetTick: 34 },
  ]) {
    const sim = encounter([acquire(0, 12), reset(scenario.resetTick, 12)]);
    sim.stepMany(scenario.resetTick);
    assert.equal(sim.state.stageIndex, scenario.expectedBefore);
    sim.step();
    assert.equal(sim.state.stageIndex, 0);
    assert.equal(sim.state.consecutiveHits, 0);
    assert.equal(sim.state.pendingContact, null);
    assert.equal(sim.state.nextLaunchTick, scenario.resetTick + 6);
    sim.stepMany(8);
    assert.deepEqual(
      eventsOf(sim, "attack-contact").at(-1),
      {
        amount: 10,
        healthAfter:
          1_000_000 -
          eventsOf(sim, "attack-contact").reduce(
            (sum, event) => sum + event.amount,
            0,
          ),
        healthBefore:
          1_000_000 -
          eventsOf(sim, "attack-contact").slice(0, -1).reduce(
            (sum, event) => sum + event.amount,
            0,
          ),
        sequence: eventsOf(sim, "attack-contact").at(-1).sequence,
        stageIndex: 0,
        targetId: 12,
        tick: scenario.resetTick + 8,
        type: "attack-contact",
      },
    );
  }
});

test("combat status reset: repeated resets restart from the latest tick", () => {
  const sim = encounter([acquire(0, 13), reset(3, 13), reset(5, 13, 92)]);
  sim.stepMany(14);
  assert.deepEqual(eventsOf(sim, "combat-reset").map(
    ({ applied, sourceId, tick }) => ({ applied, sourceId, tick }),
  ), [
    { applied: true, sourceId: 91, tick: 3 },
    { applied: true, sourceId: 92, tick: 5 },
  ]);
  assert.deepEqual(eventsOf(sim, "attack-launched").map(({ tick }) => tick), [11]);
  assert.deepEqual(eventsOf(sim, "attack-contact").map(({ tick }) => tick), [13]);
});

test("combat status reset: source, target, mismatch, and immunity rejection preserve state", () => {
  for (const scenario of [
    { reason: "source-ineligible", type: "reset-ineligible-source" },
    { reason: "target-ineligible", type: "reset-ineligible-target" },
    { reason: "target-immune", type: "reset-immune-target" },
    { reason: "target-mismatch", targetId: 99, type: "reset" },
  ]) {
    const targetId = scenario.targetId ?? 14;
    const sim = encounter([
      acquire(0, 14),
      command(7, scenario.type, 93, targetId),
    ]);
    sim.stepMany(9);
    assert.deepEqual(eventsOf(sim, "combat-reset"), [{
      applied: false,
      reason: scenario.reason,
      sourceId: 93,
      targetId,
      tick: 7,
      type: "combat-reset",
    }]);
    assert.deepEqual(eventsOf(sim, "attack-contact").map(({ tick }) => tick), [8]);
    assert.equal(sim.state.targetId, 14);
  }
});

test("combat status reset: stable IDs ignore unrelated death and clear related death", () => {
  const unrelated = encounter([
    acquire(0, 15),
    command(7, "target-died", null, 99),
  ]);
  unrelated.stepMany(17);
  assert.deepEqual(
    eventsOf(unrelated, "attack-contact").map(({ tick }) => tick),
    [8, 16],
  );
  assert.equal(unrelated.state.targetId, 15);

  const related = encounter([
    acquire(0, 15),
    command(7, "target-died", null, 15),
  ]);
  related.stepMany(17);
  assert.deepEqual(eventsOf(related, "attack-contact"), []);
  assert.equal(related.state.phase, "idle");
  assert.equal(related.state.targetId, null);
});

test("combat status reset: interruption restarts while death terminates", () => {
  const interrupted = encounter([
    acquire(0, 16),
    command(7, "interrupt"),
  ]);
  interrupted.stepMany(16);
  assert.deepEqual(eventsOf(interrupted, "attack-contact").map(({ tick }) => tick), [15]);
  assert.equal(interrupted.state.targetId, 16);

  const died = encounter([acquire(0, 16), command(7, "die")]);
  died.stepMany(20);
  assert.deepEqual(eventsOf(died, "attack-contact"), []);
  assert.equal(died.state.phase, "dead");
  assert.equal(died.state.targetId, null);
});

test("combat status reset: fresh, reordered, and arbitrary chunks are byte identical", () => {
  const commands = [
    acquire(0, 20),
    reset(7, 20),
    command(25, "target-died", null, 99),
    reset(34, 20, 92),
  ];
  const reordered = commands.map(({ sourceId, targetId, tick, type }) => {
    const value = Object.create(null);
    value.type = type;
    value.tick = tick;
    value.targetId = targetId;
    value.sourceId = sourceId;
    return value;
  });
  const one = encounter(commands);
  for (let tick = 0; tick < 80; tick += 1) one.step();
  const fresh = encounter(commands);
  fresh.stepMany(80);
  const chunked = encounter(reordered);
  for (const count of [1, 6, 2, 17, 3, 29, 22]) chunked.stepMany(count);
  assert.equal(fresh.serialize(), one.serialize());
  assert.equal(chunked.serialize(), one.serialize());
  assert.deepEqual(chunked.replay, one.replay);
});

test("combat status reset: every causal restore cut resumes byte identically", () => {
  const sim = encounter([
    acquire(0, 21),
    reset(7, 21),
    command(25, "target-died", null, 88),
    reset(34, 21),
    command(47, "interrupt"),
  ]);
  const observed = new Set();
  for (let tick = 0; tick <= 90; tick += 1) {
    observed.add(`${sim.state.stageIndex}:${sim.state.phase}`);
    const restored = InstantaneousCombatResetEncounter.restore(sim.serialize());
    assert.equal(restored.serialize(), sim.serialize());
    if (tick < 90) {
      assert.deepEqual(restored.step(), sim.step());
      assert.equal(restored.serialize(), sim.serialize());
    }
  }
  assert.ok(observed.has("0:windup"));
  assert.ok(observed.has("0:contact"));
  assert.ok(observed.has("0:cadence"));
  assert.ok(observed.has("1:cadence"));
  assert.ok(observed.has("2:cadence"));
});

test("combat status reset: caller and returned-value mutation cannot alter runtime", () => {
  const commands = [acquire(0, 22), reset(7, 22)];
  const fixture = createResetFixture(commands);
  const sim = new InstantaneousCombatResetEncounter(fixture);
  commands[0].targetId = 999;
  commands.push(command(2, "die"));
  fixture.commands[0].targetId = 888;
  fixture.commands.length = 0;
  const returned = sim.step();
  returned[0].targetId = 777;
  const state = sim.state;
  state.targetId = 666;
  state.history.length = 0;
  sim.stepMany(15);
  assert.equal(sim.state.targetId, 22);
  assert.deepEqual(eventsOf(sim, "attack-contact").map(({ tick }) => tick), [15]);
});

test("combat status reset: hostile fixtures reject getters, prototypes, sparsity, extras, and bounds", () => {
  const invalid = [
    [acquire(-1, 1)],
    [acquire(512, 1)],
    [acquire(0, 0)],
    [acquire(0, Number.MAX_SAFE_INTEGER + 1)],
    [command(0, "reset", null, 1)],
    [command(0, "reset", 1, null)],
    [command(0, "die", 1, null)],
    [command(0, "unknown")],
    [acquire(2, 1), acquire(2, 2)],
    [acquire(3, 1), acquire(2, 2)],
    Array.from({ length: 65 }, (_, tick) => reset(tick, 1)),
  ];
  for (const commands of invalid) {
    assert.throws(() => createResetFixture(commands));
  }
  const sparse = [acquire(0, 1)];
  delete sparse[0];
  assert.throws(() => createResetFixture(sparse), /dense/u);
  const extraArray = [acquire(0, 1)];
  extraArray.extra = true;
  assert.throws(() => createResetFixture(extraArray));
  assert.throws(() => createResetFixture([{ ...acquire(0, 1), extra: true }]));
  const unsafePrototype = Object.create({ inherited: true });
  Object.assign(unsafePrototype, acquire(0, 1));
  assert.throws(() => createResetFixture([unsafePrototype]), /plain object/u);
  const getter = acquire(0, 1);
  let getterCalls = 0;
  Object.defineProperty(getter, "tick", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error("must not execute");
    },
  });
  assert.throws(() => createResetFixture([getter]), /invalid shape/u);
  assert.equal(getterCalls, 0);
});

test("combat status reset: stepMany rejects atomically including oversized remainder", () => {
  const sim = encounter([acquire(0, 23)]);
  sim.stepMany(9);
  const before = sim.serialize();
  for (const count of [-1, 0.5, 1025, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => sim.stepMany(count));
    assert.equal(sim.serialize(), before);
  }
  assert.throws(() => sim.stepMany(1016), /encounter bound/u);
  assert.equal(sim.serialize(), before);
});

test("combat status reset: canonical snapshots reject forged phase, ramp, cursor, and history", () => {
  const sim = encounter([acquire(0, 24), reset(17, 24)]);
  sim.stepMany(30);
  const serialized = sim.serialize();
  const snapshot = JSON.parse(serialized);
  const reordered = JSON.stringify({
    version: snapshot.version,
    state: snapshot.state,
    identity: snapshot.identity,
  });
  assert.throws(
    () => InstantaneousCombatResetEncounter.restore(reordered),
    /canonical duplicate-free/u,
  );
  assert.throws(
    () => InstantaneousCombatResetEncounter.restore(
      serialized.replace('"version":1', '"version":1,"version":1'),
    ),
    /canonical duplicate-free/u,
  );
  for (const mutate of [
    (value) => { value.extra = true; },
    (value) => { value.version = 2; },
    (value) => { value.identity.fixture = "forged"; },
    (value) => { value.identity.commands.push(acquire(0, 99)); },
    (value) => { value.state.tick = -1; },
    (value) => { value.state.tick = 1025; },
    (value) => { value.state.commandIndex = 0; },
    (value) => { value.state.phase = "idle"; },
    (value) => { value.state.stageIndex = 2; },
    (value) => { value.state.consecutiveHits = 511; },
    (value) => { value.state.attackSequence = 4097; },
    (value) => { value.state.nextLaunchTick = 1025; },
    (value) => { value.state.targetId = null; },
    (value) => { value.state.history[0].tick = value.state.tick; },
    (value) => { value.state.history[0].extra = true; },
    (value) => { value.state.history[0].type = "forged"; },
    (value) => {
      value.state.pendingContact = {
        amount: 999,
        contactTick: value.state.tick,
        sequence: 1,
        stageIndex: 0,
        targetId: 24,
      };
    },
  ]) {
    const hostile = structuredClone(snapshot);
    mutate(hostile);
    assert.throws(
      () => InstantaneousCombatResetEncounter.restore(JSON.stringify(hostile)),
    );
  }
  assert.throws(() => InstantaneousCombatResetEncounter.restore(null));
  assert.throws(() => InstantaneousCombatResetEncounter.restore("{"));
  assert.throws(
    () => InstantaneousCombatResetEncounter.restore(
      `"${"x".repeat(262145)}"`,
    ),
    /byte bound/u,
  );
});

test("combat status reset: terminal bounds remain causal and reject atomically", () => {
  const sim = encounter([acquire(0, 25), reset(511, 25)]);
  sim.run();
  assert.equal(sim.state.tick, 1024);
  assert.equal(sim.state.pendingContact, null);
  const terminal = sim.serialize();
  assert.equal(
    InstantaneousCombatResetEncounter.restore(terminal).serialize(),
    terminal,
  );
  assert.throws(() => sim.step(), /encounter bound/u);
  assert.equal(sim.serialize(), terminal);
  assert.throws(() => sim.stepMany(1), /encounter bound/u);
  assert.equal(sim.serialize(), terminal);
});

test("combat status reset: status delivery and unrelated couplings remain deferred", () => {
  const source = readFileSync(
    new URL("../src/content/cards/special-combat-reset.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /combat-status-stun|special-combat-slow|special-combat-snare|special-movement-charge/u,
  );
  const records = createResetQuestionRecords();
  for (const key of [
    "buffCoupling",
    "chargeCoupling",
    "delivery",
    "slowCoupling",
    "snareCoupling",
    "stunCoupling",
  ]) {
    assert.equal(records[key].disposition, "question");
    assert.match(records[key].value, /deferred|explicit-command-only/u);
  }
});
