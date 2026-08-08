import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TimedFullDisableStunEncounter,
  createStunFixture,
  createStunQuestionRecords,
  createStunSpecialCatalog,
} from "../src/content/index.js";
import { protectedIdentityHits } from "./helpers/protected-identity-scan.js";

const benchmark = JSON.parse(readFileSync(
  new URL("../reference/stats/cards.json", import.meta.url),
  "utf8",
));
const entry = (tick, type, sourceId = null, targetId = null) => ({
  sourceId, targetId, tick, type,
});
const acquire = (tick, targetId = 7) =>
  entry(tick, "acquire-target", null, targetId);
const stun = (tick, sourceId = 99) => entry(tick, "stun", sourceId);
const typesAt = (encounter, tick) =>
  encounter.replay.filter((event) => event.tick === tick).map(({ type }) => type);

test("combat status stun: shipped runtime identity is original and isolated", () => {
  const catalog = createStunSpecialCatalog();
  assert.deepEqual(catalog, [{
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 4,
    count: 1,
    damage: 110,
    deployTimeTicks: 60,
    displayName: "Pulse Sentry",
    firstHitTicks: 6,
    hitSpeedTicks: 8,
    hitpoints: 1000,
    id: "pulse-sentry",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 5000,
    rarity: "uncommon",
    sightRangeMillitiles: 5500,
    targetMode: "ground-and-air",
  }]);
  catalog[0].damage = 1;
  assert.equal(createStunSpecialCatalog()[0].damage, 110);
  const source = readFileSync(
    new URL("../src/content/cards/combat-status-stun.js", import.meta.url),
    "utf8",
  );
  const protectedTokens = new Set(benchmark.cards.flatMap(({ key, name }) =>
    [key.toLowerCase(), name.toLowerCase()]));
  assert.deepEqual(protectedIdentityHits(source, protectedTokens), []);
  assert.doesNotMatch(source, /readFile|cards\.json|reference\//u);
});

test("combat status stun: protected benchmarks remain test-only mappings", () => {
  const benchmarkIds = [
    26000052, // Zappies
    26000042, // Electro Wizard
    28000008, // Zap
    28000007, // Lightning
    28000005, // Freeze
    26000030, // Ice Spirit
    26000084, // Electro Spirit
  ];
  const mapped = benchmarkIds.map((id) => benchmark.cards.find((card) =>
    card.id === id)).map((card) => ({
    cost: card.elixir_cost,
    damage: card.damage,
    hitpoints: card.hitpoints,
    id: card.id,
    kind: card.type,
  }));
  assert.equal(mapped.length, benchmarkIds.length);
  assert.ok(mapped.every(({ id }) => Number.isSafeInteger(id)));
  assert.equal(createStunQuestionRecords().durationTicks.value, 30);
});

test("combat status stun: every absent value and policy is independently frozen", () => {
  const expected = [
    "applyTick", "attackCadenceBehavior", "attackReadinessBehavior",
    "commonAreaDamageRadius", "commonBaseDamage", "commonCount",
    "commonDeployTicks", "commonFirstHitTicks", "commonHitCadenceTicks",
    "commonHitpoints", "commonMovementMillitilesPerSecond",
    "commonRangeMillitiles", "commonSightRangeMillitiles",
    "commonTargetMode", "contactBehavior", "contactDelayTicks", "deathPolicy",
    "durationTicks", "eligibility", "expiry", "healthPreservation",
    "interruptionPolicy", "launchSnapshot", "movementPerTickPattern",
    "movementSuppression", "reapply", "refresh", "resetCoupling",
    "sameBoundaryOrdering", "simulationTicksPerSecond", "sourceEligibility",
    "stack", "targetEligibility", "targetRetention", "windupBehavior",
  ];
  const records = createStunQuestionRecords();
  assert.deepEqual(Object.keys(records).sort(), expected.sort());
  assert.ok(Object.isFrozen(records));
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
      source: "unsourced-timed-full-disable-stun-fixture",
    });
    assert.ok(Object.isFrozen(record));
  }
  const again = createStunQuestionRecords();
  assert.notEqual(records, again);
  assert.notEqual(records.durationTicks, again.durationTicks);
  assert.throws(() => createStunQuestionRecords({ durationTicks: 2 }),
    /do not accept overrides/u);
});

test("combat status stun: idle application has inclusive expiry and exact resume", () => {
  const encounter = new TimedFullDisableStunEncounter(
    createStunFixture([stun(0)]),
  );
  encounter.stepMany(30);
  assert.equal(encounter.state.tick, 30);
  assert.equal(encounter.state.position, 0);
  assert.deepEqual(typesAt(encounter, 29), ["stun-expired"]);
  encounter.step();
  assert.equal(encounter.state.position, 16);
  assert.equal(encounter.state.movementRemainder, 40);
});

test("combat status stun: movement is exactly paused with remainder preserved", () => {
  const encounter = new TimedFullDisableStunEncounter(
    createStunFixture([stun(1)]),
  );
  encounter.step();
  const before = encounter.state;
  encounter.stepMany(30);
  assert.deepEqual(
    [encounter.state.position, encounter.state.movementRemainder],
    [before.position, before.movementRemainder],
  );
  encounter.step();
  assert.deepEqual(
    [encounter.state.position, encounter.state.movementRemainder],
    [33, 20],
  );
});

test("combat status stun: windup and retained target health pause exactly", () => {
  const encounter = new TimedFullDisableStunEncounter(
    createStunFixture([acquire(0, 41), stun(1)]),
  );
  encounter.stepMany(31);
  assert.equal(encounter.state.targetId, 41);
  assert.equal(encounter.state.targetHealth, 1000);
  assert.equal(encounter.state.health, 1000);
  assert.equal(encounter.state.attackRemaining, 5);
  assert.equal(encounter.replay.some(({ type }) =>
    type === "attack-launched" || type === "attack-contact"), false);
  encounter.stepMany(5);
  assert.deepEqual(typesAt(encounter, 35), ["attack-launched"]);
});

test("combat status stun: command-first stun suppresses an attack-ready boundary", () => {
  const baseline = new TimedFullDisableStunEncounter(
    createStunFixture([acquire(0)]),
  );
  baseline.stepMany(6);
  assert.deepEqual(typesAt(baseline, 5), ["attack-launched"]);

  const stunned = new TimedFullDisableStunEncounter(
    createStunFixture([acquire(0), stun(5)]),
  );
  stunned.stepMany(35);
  assert.equal(stunned.replay.some(({ type }) =>
    type === "attack-launched" || type === "attack-contact"), false);
  assert.deepEqual(typesAt(stunned, 34), ["stun-expired"]);
  stunned.step();
  assert.deepEqual(typesAt(stunned, 35), ["attack-launched"]);
});

test("combat status stun: launched contact and cadence both pause", () => {
  const encounter = new TimedFullDisableStunEncounter(
    createStunFixture([acquire(0), stun(6)]),
  );
  encounter.stepMany(36);
  assert.deepEqual(
    encounter.replay.filter(({ type }) => type === "attack-launched")
      .map(({ tick }) => tick),
    [5],
  );
  assert.equal(encounter.replay.some(({ type }) => type === "attack-contact"),
    false);
  assert.equal(encounter.state.pendingContact.remaining, 2);
  encounter.stepMany(2);
  assert.deepEqual(
    encounter.replay.filter(({ type }) => type === "attack-contact")
      .map(({ tick }) => tick),
    [37],
  );
  assert.equal(encounter.state.targetHealth, 890);
});

test("combat status stun: no displacement launch or contact occurs while disabled", () => {
  const encounter = new TimedFullDisableStunEncounter(
    createStunFixture([acquire(0), stun(6)]),
  );
  encounter.stepMany(36);
  const applied = encounter.replay.find(({ type }) => type === "stun-applied");
  const forbidden = encounter.replay.filter(({ tick, type }) =>
    tick >= applied.tick &&
    tick <= applied.disabledThroughTick &&
    ["attack-launched", "attack-contact"].includes(type));
  assert.deepEqual(forbidden, []);
  assert.equal(encounter.state.position, 100);
});

test("combat status stun: reapply refreshes later expiry and never stacks", () => {
  const encounter = new TimedFullDisableStunEncounter(createStunFixture([
    stun(0, 1),
    stun(20, 2),
  ]));
  encounter.stepMany(50);
  assert.deepEqual(
    encounter.replay.filter(({ type }) => type === "stun-applied")
      .map(({ disabledThroughTick, sourceId, tick }) =>
        ({ disabledThroughTick, sourceId, tick })),
    [
      { disabledThroughTick: 29, sourceId: 1, tick: 0 },
      { disabledThroughTick: 49, sourceId: 2, tick: 20 },
    ],
  );
  assert.deepEqual(typesAt(encounter, 49), ["stun-expired"]);
  assert.equal(encounter.state.position, 0);
  encounter.step();
  assert.equal(encounter.state.position, 16);
});

test("combat status stun: reapply on expiry boundary is command-first", () => {
  const encounter = new TimedFullDisableStunEncounter(createStunFixture([
    stun(0, 1),
    stun(29, 2),
  ]));
  encounter.stepMany(59);
  assert.equal(typesAt(encounter, 29).includes("stun-expired"), false);
  assert.deepEqual(typesAt(encounter, 58), ["stun-expired"]);
  assert.equal(encounter.state.position, 0);
});

test("combat status stun: death and interruption obey pinned policies", () => {
  const dead = new TimedFullDisableStunEncounter(createStunFixture([
    acquire(0), stun(1), entry(5, "die"),
  ]));
  dead.stepMany(40);
  assert.equal(dead.state.alive, false);
  assert.equal(dead.state.health, 0);
  assert.equal(dead.state.targetId, null);
  assert.equal(dead.state.disabledThroughTick, null);
  assert.equal(dead.replay.some(({ type }) => type === "attack-launched"), false);

  const interrupted = new TimedFullDisableStunEncounter(createStunFixture([
    acquire(0), entry(6, "interrupt"), stun(7),
  ]));
  interrupted.stepMany(37);
  assert.equal(interrupted.state.pendingContact, null);
  assert.equal(interrupted.state.attackPhase, "windup");
  assert.equal(interrupted.state.attackRemaining, 5);
  assert.equal(interrupted.state.targetId, 7);
  assert.equal(interrupted.state.targetHealth, 1000);
});

test("combat status stun: targetless loss is a valid deterministic no-op", () => {
  const idle = new TimedFullDisableStunEncounter(createStunFixture([
    entry(0, "lose-target"),
    entry(1, "lose-target"),
  ]));
  assert.deepEqual(idle.step(), []);
  assert.deepEqual(idle.step(), []);
  assert.deepEqual(idle.replay, []);
  assert.doesNotThrow(() => idle.serialize());
  assert.doesNotThrow(() => idle.stepMany(1));

  const afterDeath = new TimedFullDisableStunEncounter(createStunFixture([
    acquire(0, 31),
    entry(1, "die"),
    entry(2, "lose-target"),
    entry(3, "lose-target"),
  ]));
  afterDeath.stepMany(4);
  assert.deepEqual(
    afterDeath.replay.filter(({ type }) => type === "target-lost"),
    [],
  );
  assert.deepEqual(
    afterDeath.replay.map(({ type }) => type),
    ["target-acquired", "died"],
  );
  assert.doesNotThrow(() => afterDeath.serialize());
  assert.doesNotThrow(() => afterDeath.stepMany(1));
});

test("combat status stun: same-boundary duplicate loss remains invalid setup", () => {
  assert.throws(() => createStunFixture([
    entry(0, "lose-target"),
    entry(0, "lose-target"),
  ]), /unique increasing ticks/u);
});

test("combat status stun: present-target loss emits its bounded ID only once", () => {
  const encounter = new TimedFullDisableStunEncounter(createStunFixture([
    acquire(0, Number.MAX_SAFE_INTEGER),
    entry(1, "lose-target"),
    entry(2, "lose-target"),
  ]));
  encounter.stepMany(3);
  assert.deepEqual(
    encounter.replay.filter(({ type }) => type === "target-lost"),
    [{
      targetId: Number.MAX_SAFE_INTEGER,
      tick: 1,
      type: "target-lost",
    }],
  );
  assert.equal(encounter.state.targetId, null);
  assert.doesNotThrow(() => encounter.serialize());
});

test("combat status stun: post-loss restore and same-boundary re-entry continue once", () => {
  const commands = [
    acquire(0, 44),
    entry(2, "lose-target"),
    entry(3, "lose-target"),
    stun(4, 8),
  ];
  const original = new TimedFullDisableStunEncounter(createStunFixture(commands));
  original.stepMany(3);
  const snapshot = original.serialize();
  const restored = TimedFullDisableStunEncounter.restore(snapshot);

  assert.deepEqual(original.stepMany(0), []);
  assert.deepEqual(restored.stepMany(0), []);
  assert.equal(original.serialize(), snapshot);
  assert.equal(restored.serialize(), snapshot);
  assert.deepEqual(original.step(), []);
  assert.deepEqual(restored.step(), []);
  assert.equal(original.serialize(), restored.serialize());
  original.stepMany(32);
  restored.stepMany(32);
  assert.equal(restored.serialize(), original.serialize());
  assert.deepEqual(
    restored.replay.filter(({ type }) => type === "target-lost"),
    [{ targetId: 44, tick: 2, type: "target-lost" }],
  );
});

test("combat status stun: targetless loss replay is reorder chunk and cut invariant", () => {
  const commands = [
    entry(0, "lose-target"),
    acquire(1, 52),
    entry(2, "lose-target"),
    entry(3, "lose-target"),
    acquire(4, 53),
    entry(5, "die"),
    entry(6, "lose-target"),
  ];
  const reordered = commands.map(({ sourceId, targetId, tick, type }) => {
    const value = Object.create(null);
    value.targetId = targetId;
    value.type = type;
    value.sourceId = sourceId;
    value.tick = tick;
    return value;
  });
  const expected = new TimedFullDisableStunEncounter(createStunFixture(commands));
  expected.stepMany(12);
  const fresh = new TimedFullDisableStunEncounter(createStunFixture(reordered));
  fresh.stepMany(12);
  const chunked = new TimedFullDisableStunEncounter(createStunFixture(commands));
  for (const count of [1, 2, 1, 3, 5]) chunked.stepMany(count);
  assert.equal(fresh.serialize(), expected.serialize());
  assert.equal(chunked.serialize(), expected.serialize());

  for (let cut = 0; cut <= 12; cut += 1) {
    const causal = new TimedFullDisableStunEncounter(createStunFixture(commands));
    causal.stepMany(cut);
    const restored = TimedFullDisableStunEncounter.restore(causal.serialize());
    restored.stepMany(12 - cut);
    assert.equal(restored.serialize(), expected.serialize(), `cut ${cut}`);
  }
});

test("combat status stun: targetless loss is isolated from caller mutation", () => {
  const loss = entry(0, "lose-target");
  const commands = [loss];
  const fixture = createStunFixture(commands);
  const encounter = new TimedFullDisableStunEncounter(fixture);
  loss.type = "die";
  commands.push(acquire(1, 90));
  fixture.commands[0].type = "die";
  fixture.commands.push(acquire(1, 91));
  assert.deepEqual(encounter.step(), []);
  assert.equal(encounter.state.alive, true);
  assert.equal(encounter.state.targetId, null);
  assert.deepEqual(encounter.replay, []);
  assert.doesNotThrow(() => encounter.serialize());
});

test("combat status stun: fresh reordered chunked and every causal restore cut match", () => {
  const commands = [
    acquire(0, 12), stun(4, 20), stun(18, 21),
    entry(55, "interrupt"), entry(80, "lose-target"),
  ];
  const reordered = commands.map(({ sourceId, targetId, tick, type }) => {
    const value = Object.create(null);
    value.type = type;
    value.tick = tick;
    value.targetId = targetId;
    value.sourceId = sourceId;
    return value;
  });
  const expected = new TimedFullDisableStunEncounter(createStunFixture(commands));
  expected.stepMany(100);
  const fresh = new TimedFullDisableStunEncounter(createStunFixture(reordered));
  fresh.stepMany(100);
  const chunked = new TimedFullDisableStunEncounter(createStunFixture(commands));
  chunked.stepMany(7);
  chunked.stepMany(31);
  chunked.stepMany(62);
  assert.equal(fresh.serialize(), expected.serialize());
  assert.equal(chunked.serialize(), expected.serialize());

  for (let cut = 0; cut <= 100; cut += 1) {
    const causal = new TimedFullDisableStunEncounter(createStunFixture(commands));
    causal.stepMany(cut);
    const restored = TimedFullDisableStunEncounter.restore(causal.serialize());
    restored.stepMany(100 - cut);
    assert.equal(restored.serialize(), expected.serialize(), `cut ${cut}`);
  }
});

test("combat status stun: caller mutations cannot alter setup state replay or snapshots", () => {
  const commands = [acquire(0), stun(2)];
  const fixture = createStunFixture(commands);
  const encounter = new TimedFullDisableStunEncounter(fixture);
  commands[0].tick = 99;
  fixture.commands[0].tick = 99;
  const first = encounter.step();
  first[0].targetId = 999;
  const state = encounter.state;
  state.health = 1;
  state.history.length = 0;
  const replay = encounter.replay;
  replay[0].targetId = 999;
  encounter.stepMany(40);
  assert.equal(encounter.state.targetId, 7);
  assert.equal(encounter.state.health, 1000);
  assert.equal(encounter.replay[0].targetId, 7);
});

test("combat status stun: hostile setup inputs reject unread and atomically", () => {
  let reads = 0;
  const hostile = {};
  Object.defineProperty(hostile, "tick", {
    enumerable: true,
    get() {
      reads += 1;
      return 0;
    },
  });
  for (const bad of [
    [hostile],
    Object.assign(Object.create({ inherited: true }), []),
    new Array(1),
    [entry(0, "stun", 1), entry(0, "stun", 2)],
    [{ ...stun(0), extra: true }],
    [stun(Number.MAX_SAFE_INTEGER)],
    [stun(4067)],
    Array.from({ length: 65 }, (_, tick) => stun(tick)),
  ]) {
    assert.throws(() => createStunFixture(bad));
  }
  assert.equal(reads, 0);

  const valid = new TimedFullDisableStunEncounter(createStunFixture([stun(0)]));
  valid.stepMany(3);
  const before = valid.serialize();
  assert.throws(() => valid.stepMany(4097));
  assert.equal(valid.serialize(), before);
});

test("combat status stun: forged snapshots and all serialization bounds reject", () => {
  const encounter = new TimedFullDisableStunEncounter(
    createStunFixture([acquire(0), stun(2)]),
  );
  encounter.stepMany(20);
  const snapshot = JSON.parse(encounter.serialize());
  for (const mutate of [
    (value) => { value.version = 2; },
    (value) => { value.identity.fixture = "forged"; },
    (value) => { value.state.health = 1; },
    (value) => { value.state.position += 1; },
    (value) => { value.state.history.pop(); },
    (value) => { value.state.commandIndex = 0; },
    (value) => { value.state.attackSequence = 99999; },
    (value) => { value.state.history.push({ tick: 999, type: "bogus" }); },
    (value) => { value.state.extra = true; },
  ]) {
    const value = structuredClone(snapshot);
    mutate(value);
    assert.throws(() =>
      TimedFullDisableStunEncounter.restore(JSON.stringify(value)));
  }
  assert.throws(() => TimedFullDisableStunEncounter.restore(
    encounter.serialize().replace('"version":1', '"version":1,"version":1'),
  ), /duplicate-free/u);
  assert.throws(() => TimedFullDisableStunEncounter.restore("x".repeat(131073)));
  assert.throws(() => TimedFullDisableStunEncounter.restore(null));
});

test("combat status stun: timing is integer deterministic and runtime is clean", () => {
  const encounter = new TimedFullDisableStunEncounter(
    createStunFixture([acquire(0), stun(3)]),
  );
  encounter.stepMany(100);
  const inspect = (value) => {
    if (Array.isArray(value)) {
      value.forEach(inspect);
    } else if (value !== null && typeof value === "object") {
      Object.values(value).forEach(inspect);
    } else if (typeof value === "number") {
      assert.ok(Number.isSafeInteger(value));
    }
  };
  inspect(encounter.state);
  const source = readFileSync(
    new URL("../src/content/cards/combat-status-stun.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /Date|performance|setTimeout|setInterval|Math\.random/u);
  assert.doesNotMatch(source, /\d+\.\d+/u);
  assert.equal(
    TimedFullDisableStunEncounter.restore(encounter.serialize()).serialize(),
    encounter.serialize(),
  );
});
