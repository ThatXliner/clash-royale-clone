import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TimedMovementAttackSlowEncounter,
  createSlowFixture,
  createSlowQuestionRecords,
  createSlowSpecialCatalog,
} from "../src/content/index.js";
import { protectedIdentityHits } from "./helpers/protected-identity-scan.js";

const benchmark = JSON.parse(readFileSync(
  new URL("../reference/stats/cards.json", import.meta.url),
  "utf8",
));
const command = (tick, type, sourceId = null, targetId = null) => ({
  sourceId, targetId, tick, type,
});
const acquire = (tick, targetId = 7) =>
  command(tick, "acquire-target", null, targetId);
const slow = (tick, sourceId = 99) => command(tick, "slow", sourceId);
const attacks = (encounter) =>
  encounter.replay.filter(({ type }) => type === "attack");

function run(commands, ticks, direction = 1) {
  const encounter = new TimedMovementAttackSlowEncounter(
    createSlowFixture(commands, direction),
  );
  encounter.stepMany(ticks);
  return encounter;
}

// Deliberately test-local and scalar. Constants are literals rather than
// imports or production helpers, so this remains an independent oracle.
function oracle(commands, boundaries, direction = 1) {
  const state = {
    alive: true,
    attackPhase: "idle",
    attackSequence: 0,
    attackWork: null,
    commandIndex: 0,
    movementRemainder: 0,
    position: 0,
    slowSourceId: null,
    slowUntilTick: null,
    targetId: null,
    tick: 0,
  };
  const attackTicks = [];
  while (state.tick < boundaries) {
    if (state.slowUntilTick !== null && state.tick >= state.slowUntilTick) {
      state.slowSourceId = null;
      state.slowUntilTick = null;
    }
    while (commands[state.commandIndex]?.tick === state.tick) {
      const entry = commands[state.commandIndex];
      state.commandIndex += 1;
      if (entry.type === "slow" && state.alive) {
        state.slowSourceId = entry.sourceId;
        state.slowUntilTick = state.tick + 60;
      } else if (
        entry.type === "acquire-target" &&
        state.alive &&
        state.targetId !== entry.targetId
      ) {
        state.targetId = entry.targetId;
        state.attackPhase = "windup";
        state.attackWork = 1440;
      } else if (
        entry.type === "lose-target" &&
        state.targetId !== null
      ) {
        state.targetId = null;
        state.attackPhase = "idle";
        state.attackWork = null;
      } else if (
        entry.type === "target-died" &&
        state.targetId !== null &&
        (entry.targetId === null || entry.targetId === state.targetId)
      ) {
        state.targetId = null;
        state.attackPhase = "idle";
        state.attackWork = null;
      } else if (entry.type === "die" && state.alive) {
        state.alive = false;
        state.targetId = null;
        state.attackPhase = "idle";
        state.attackWork = null;
        state.slowSourceId = null;
        state.slowUntilTick = null;
      }
    }
    if (state.alive && state.targetId !== null && state.attackWork === 0) {
      state.attackSequence += 1;
      attackTicks.push(state.tick);
      state.attackPhase = "cadence";
      state.attackWork = 2040;
    }
    if (state.alive) {
      const progress = state.slowUntilTick === null ? 20 : 13;
      const accumulated = state.movementRemainder + 1000 * progress;
      const magnitude = Math.floor(accumulated / 1200);
      state.movementRemainder = accumulated % 1200;
      state.position += direction * magnitude;
      if (state.attackWork > 0) {
        state.attackWork = Math.max(0, state.attackWork - progress);
      }
    }
    state.tick += 1;
  }
  return { attackTicks, state };
}

function comparable(state) {
  return {
    alive: state.alive,
    attackPhase: state.attackPhase,
    attackSequence: state.attackSequence,
    attackWork: state.attackWork,
    commandIndex: state.commandIndex,
    movementRemainder: state.movementRemainder,
    position: state.position,
    slowSourceId: state.slowSourceId,
    slowUntilTick: state.slowUntilTick,
    targetId: state.targetId,
    tick: state.tick,
  };
}

test("combat status slow: shipped identity is original, isolated, and reference-free", () => {
  const catalog = createSlowSpecialCatalog();
  assert.deepEqual(catalog, [{
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 3,
    count: 1,
    damage: 90,
    deployTimeTicks: 60,
    displayName: "Rime Adept",
    firstHitTicks: 72,
    hitSpeedTicks: 102,
    hitpoints: 688,
    id: "rime-adept",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 5500,
    rarity: "mythic",
    sightRangeMillitiles: 5500,
    targetMode: "ground-and-air",
  }]);
  catalog[0].damage = 1;
  assert.equal(createSlowSpecialCatalog()[0].damage, 90);
  const source = readFileSync(
    new URL("../src/content/cards/special-combat-slow.js", import.meta.url),
    "utf8",
  );
  const protectedTokens = new Set(benchmark.cards.flatMap(({ key, name }) =>
    [key.toLowerCase(), name.toLowerCase()]));
  assert.deepEqual(protectedIdentityHits(source, protectedTokens), []);
  assert.doesNotMatch(source, /readFile|cards\.json|reference\//u);
  assert.match(source, /\bBigInt\b/u);
});

test("combat status slow: benchmark ordinary fields are test-only questions", () => {
  const card = createSlowSpecialCatalog()[0];
  const comparison = benchmark.cards.find(({ id }) => id === 26000023);
  assert.ok(comparison);
  assert.deepEqual(
    [card.cost, card.kind, card.rarity],
    [comparison.elixir_cost, "unit", "mythic"],
  );
  assert.deepEqual(
    [
      card.hitpoints,
      card.damage,
      card.hitSpeedTicks,
      card.firstHitTicks,
      card.deployTimeTicks,
      card.rangeMillitiles,
      card.sightRangeMillitiles,
      card.movementMillitilesPerSecond,
      card.targetMode,
      card.count,
      card.areaDamageRadiusMillitiles,
    ],
    [688, 90, 102, 72, 60, 5500, 5500, 1000,
      "ground-and-air", 1, null],
  );
  assert.ok(comparison.unverified_fields.includes("hitpoints"));
  assert.ok(comparison.unverified_fields.includes("hit_speed_seconds"));
  const records = createSlowQuestionRecords();
  assert.equal(records.commonHitpoints.value, card.hitpoints);
  assert.equal(records.commonHitCadenceTicks.value, card.hitSpeedTicks);
  assert.equal(records.commonTargetMode.disposition, "question");
});

test("combat status slow: every assumption is a fresh recursively frozen question", () => {
  const expected = [
    "alreadyEarnedReadiness", "attackProgressRate", "boundaryOrdering",
    "cadenceWorkTwentieths", "commonAreaDamageRadius", "commonBaseDamage",
    "commonCount", "commonDeployTicks", "commonFirstHitTicks",
    "commonHitCadenceTicks", "commonHitpoints",
    "commonMovementMillitilesPerSecond", "commonRangeMillitiles",
    "commonSightRangeMillitiles", "commonTargetMode", "deadlineRescaling",
    "deathPolicy", "delivery", "deployment", "differentSourceReapply",
    "durationTicks", "eligibility", "expiryWindow", "fidelity", "immunity",
    "movementProgressRate", "movementRemainder", "nonStacking",
    "rageComposition", "reciprocalAttackInterval", "refresh",
    "resetComposition", "sameSourceReapply", "snareComposition",
    "sourceDeath", "stack", "stunComposition", "targetChange",
    "targetDeath", "targetLoss", "windupWorkTwentieths", "workRemainder",
    "workUnderSlow",
  ];
  const first = createSlowQuestionRecords();
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
        source: "unsourced-timed-movement-and-attack-slow-fixture",
      },
    );
    assert.ok(Object.isFrozen(record));
    if (record.value !== null && typeof record.value === "object") {
      assert.ok(Object.isFrozen(record.value));
    }
  }
  assert.deepEqual(first.attackProgressRate.value, {
    denominator: 20,
    numerator: 13,
  });
  assert.deepEqual(first.reciprocalAttackInterval.value, {
    denominator: 13,
    numerator: 20,
  });
  const second = createSlowQuestionRecords();
  assert.notEqual(first, second);
  assert.notEqual(first.attackProgressRate, second.attackProgressRate);
  assert.notEqual(first.attackProgressRate.value, second.attackProgressRate.value);
  assert.throws(() => {
    first.attackProgressRate.value.numerator = 20;
  }, TypeError);
  assert.throws(
    () => createSlowQuestionRecords({ durationTicks: 1 }),
    /do not accept overrides/u,
  );
});

test("combat status slow: source-derived movement-only rates preserve attack work and restore", () => {
  const cases = [
    { movementTwentieths: 17, expectedPosition: 1850 },
    { movementTwentieths: 10, expectedPosition: 1500 },
  ];
  for (const { movementTwentieths, expectedPosition } of cases) {
    const commands = [slow(0), acquire(0)];
    const setup = createSlowFixture(commands, 1, {
      attackWorkTwentieths: 20,
      movementTwentieths,
    });
    const whole = new TimedMovementAttackSlowEncounter(setup);
    whole.stepMany(120);

    const prefix = new TimedMovementAttackSlowEncounter(setup);
    prefix.stepMany(60);
    assert.equal(prefix.state.slowUntilTick, 60);
    const checkpoint = prefix.serialize();
    const restored = TimedMovementAttackSlowEncounter.restore(checkpoint);
    restored.stepMany(60);

    assert.equal(whole.state.position, expectedPosition);
    assert.equal(whole.state.attackWork, 1080);
    assert.deepEqual(attacks(whole).map(({ tick }) => tick), [72]);
    assert.equal(whole.state.slowUntilTick, null);
    assert.equal(restored.serialize(), whole.serialize());
    assert.deepEqual(restored.replay, whole.replay);
  }
});

test("combat status slow: optional progress profiles are bounded and defaults stay legacy-shaped", () => {
  assert.deepEqual(createSlowFixture(), { commands: [], direction: 1 });
  assert.throws(() => createSlowFixture([], 1, {
    attackWorkTwentieths: 20,
    movementTwentieths: 0,
  }), /bounded safe integer/u);
  assert.throws(() => createSlowFixture([], 1, {
    attackWorkTwentieths: 21,
    movementTwentieths: 17,
  }), /bounded safe integer/u);
  assert.throws(() => createSlowFixture([], 1, {
    attackWorkTwentieths: 20,
    movementTwentieths: 17,
    ignored: true,
  }), /invalid shape/u);
});

test("combat status slow: normal timeline has literal movement and attacks", () => {
  const encounter = run([acquire(0)], 200);
  assert.deepEqual(attacks(encounter).map(({ tick }) => tick), [72, 174]);
  const at72 = run([acquire(0)], 72).state;
  assert.deepEqual(
    [at72.tick, at72.position, at72.movementRemainder],
    [72, 1200, 0],
  );
});

test("combat status slow: application at zero delays both work streams exactly", () => {
  const commands = [acquire(0), slow(0)];
  const encounter = run(commands, 220);
  assert.deepEqual(attacks(encounter).map(({ tick }) => tick), [93, 195]);
  const at60 = run(commands, 60).state;
  assert.deepEqual(
    [at60.tick, at60.position, at60.movementRemainder],
    [60, 650, 0],
  );
  const at93 = run(commands, 93).state;
  assert.deepEqual(
    [at93.tick, at93.position, at93.movementRemainder],
    [93, 1200, 0],
  );
});

test("combat status slow: application during windup and refresh have pinned ticks", () => {
  const delayed = run([acquire(0), slow(20)], 200);
  assert.equal(attacks(delayed)[0].tick, 93);

  const commands = [acquire(0), slow(0, 10), slow(30, 20)];
  const refreshed = run(commands, 230);
  assert.deepEqual(attacks(refreshed).map(({ tick }) => tick), [104, 206]);
  const at104 = run(commands, 104).state;
  assert.deepEqual(
    [
      at104.position,
      at104.movementRemainder,
      at104.slowSourceId,
      at104.slowUntilTick,
    ],
    [1208, 400, null, null],
  );
  assert.deepEqual(
    refreshed.replay.filter(({ type }) => type === "slow-expired"),
    [{ sourceId: 20, tick: 90, type: "slow-expired" }],
  );
});

test("combat status slow: expiry precedes same-boundary reapplication", () => {
  const commands = [acquire(0), slow(0, 10), slow(60, 20)];
  const encounter = run(commands, 220);
  assert.deepEqual(attacks(encounter).map(({ tick }) => tick), [111, 217]);
  const at111 = run(commands, 111).state;
  assert.deepEqual(
    [at111.position, at111.movementRemainder],
    [1202, 600],
  );
  assert.deepEqual(
    encounter.replay.filter(({ tick }) => tick === 60)
      .filter(({ type }) => type !== "moved")
      .map(({ sourceId, type }) => ({ sourceId, type })),
    [
      { sourceId: 10, type: "slow-expired" },
      { sourceId: 20, type: "slow-applied" },
    ],
  );
});

test("combat status slow: ready-at-start fires before newly slowed cadence", () => {
  const commands = [acquire(0), slow(72)];
  const encounter = run(commands, 210);
  assert.deepEqual(attacks(encounter).map(({ tick }) => tick), [72, 195]);
  assert.deepEqual(
    encounter.replay.filter(({ tick }) => tick === 72)
      .filter(({ type }) => type !== "moved").map(({ type }) => type),
    ["slow-applied", "attack"],
  );
});

test("combat status slow: inclusive duration ends before boundary 60 work", () => {
  const encounter = run([slow(0)], 61);
  assert.deepEqual(
    [encounter.state.position, encounter.state.movementRemainder],
    [666, 800],
  );
  assert.deepEqual(
    encounter.replay.filter(({ tick }) => tick === 60)
      .map(({ type }) => type),
    ["slow-expired", "moved"],
  );
});

test("combat status slow: loss and change cancel delayed readiness first", () => {
  const lost = run([
    acquire(0, 1),
    slow(0),
    command(93, "lose-target"),
  ], 180);
  assert.deepEqual(attacks(lost), []);

  const changed = run([
    acquire(0, 1),
    slow(0),
    acquire(93, 2),
  ], 220);
  assert.deepEqual(
    attacks(changed).map(({ targetId, tick }) => ({ targetId, tick })),
    [{ targetId: 2, tick: 165 }],
  );
});

test("combat status slow: death and unrelated target death are deterministic", () => {
  const unrelated = run([
    acquire(0, 8),
    slow(0),
    command(93, "target-died", null, 9),
  ], 100);
  assert.deepEqual(attacks(unrelated).map(({ tick }) => tick), [93]);
  const killed = run([
    acquire(0, 8),
    slow(0),
    command(93, "target-died", null, 8),
  ], 100);
  assert.deepEqual(attacks(killed), []);
  const deadUnit = run([acquire(0), slow(0), command(20, "die")], 100);
  assert.equal(deadUnit.state.position, run([acquire(0), slow(0)], 20).state.position);
  assert.equal(deadUnit.state.slowUntilTick, null);
  assert.equal(deadUnit.state.targetId, null);
});

test("combat status slow: nonstacking double apply equals latest-source single slot", () => {
  const doubled = run([acquire(0), slow(0, 1), slow(0, 2)], 230);
  const single = run([acquire(0), slow(0, 2)], 230);
  const doubledState = comparable(doubled.state);
  const singleState = comparable(single.state);
  delete doubledState.commandIndex;
  delete singleState.commandIndex;
  assert.deepEqual(doubledState, singleState);
  assert.deepEqual(
    attacks(doubled).map(({ tick }) => tick),
    attacks(single).map(({ tick }) => tick),
  );
  assert.equal(doubled.replay.filter(({ type }) => type === "slow-applied").length, 2);
  assert.equal(doubled.replay.filter(({ type }) => type === "slow-expired")[0].sourceId, 2);
});

test("combat status slow: negative direction is the exact inverse", () => {
  const commands = [acquire(0), slow(0), slow(30, 2)];
  const positive = run(commands, 230, 1);
  const negative = run(commands, 230, -1);
  assert.equal(negative.state.position, -positive.state.position);
  assert.equal(negative.state.movementRemainder, positive.state.movementRemainder);
  assert.deepEqual(
    attacks(negative).map(({ tick }) => tick),
    attacks(positive).map(({ tick }) => tick),
  );
});

test("combat status slow: literal scalar oracle covers every phase and remainder boundary", () => {
  const scenarios = [
    [acquire(0)],
    [acquire(0), slow(0)],
    [acquire(0), slow(20)],
    [acquire(0), slow(0, 1), slow(30, 2)],
    [acquire(0), slow(0, 1), slow(60, 2)],
    [acquire(0), slow(72)],
    [acquire(0, 1), slow(0), acquire(93, 2)],
  ];
  for (const commands of scenarios) {
    const encounter = new TimedMovementAttackSlowEncounter(
      createSlowFixture(commands),
    );
    for (let boundary = 1; boundary <= 260; boundary += 1) {
      encounter.step();
      const expected = oracle(commands, boundary);
      assert.deepEqual(comparable(encounter.state), expected.state);
      assert.deepEqual(
        attacks(encounter).map(({ tick }) => tick),
        expected.attackTicks,
      );
    }
  }
});

test("combat status slow: fresh, reordered, arbitrary chunks, and every restore cut pass", () => {
  const commands = [
    acquire(0, 4),
    slow(20, 8),
    slow(75, 9),
    acquire(130, 5),
    command(210, "lose-target"),
  ];
  const reordered = commands.map(({ sourceId, targetId, tick, type }) => {
    const entry = Object.create(null);
    entry.type = type;
    entry.tick = tick;
    entry.targetId = targetId;
    entry.sourceId = sourceId;
    return entry;
  });
  const stepped = new TimedMovementAttackSlowEncounter(
    createSlowFixture(commands),
  );
  for (let tick = 0; tick < 260; tick += 1) stepped.step();
  const chunked = new TimedMovementAttackSlowEncounter(
    createSlowFixture(reordered),
  );
  for (const count of [1, 17, 0, 43, 99, 100]) chunked.stepMany(count);
  const fresh = run(commands, 260);
  assert.equal(chunked.serialize(), stepped.serialize());
  assert.equal(fresh.serialize(), stepped.serialize());

  const causal = new TimedMovementAttackSlowEncounter(
    createSlowFixture(commands),
  );
  for (let cut = 0; cut <= 260; cut += 1) {
    const restored = TimedMovementAttackSlowEncounter.restore(causal.serialize());
    assert.equal(restored.serialize(), causal.serialize());
    if (cut < 260) {
      assert.deepEqual(restored.step(), causal.step());
      assert.equal(restored.serialize(), causal.serialize());
    }
  }
});

test("combat status slow: setup, state, replay, and returned events are isolated", () => {
  const commands = [acquire(0, 3), slow(5, 4)];
  const fixture = createSlowFixture(commands);
  const encounter = new TimedMovementAttackSlowEncounter(fixture);
  commands[0].targetId = 999;
  commands.push(command(1, "die"));
  fixture.commands.length = 0;
  const events = encounter.step();
  events[0].targetId = 888;
  const state = encounter.state;
  state.targetId = 777;
  state.history.length = 0;
  const replay = encounter.replay;
  replay[0].targetId = 666;
  encounter.stepMany(93);
  assert.equal(attacks(encounter)[0].targetId, 3);
  assert.equal(encounter.state.targetId, 3);
});

test("combat status slow: hostile fixtures reject getters, prototypes, sparse, extra, and unsafe data", () => {
  const invalid = [
    [acquire(-1, 1)],
    [acquire(4096, 1)],
    [acquire(0, 0)],
    [acquire(0, Number.MAX_SAFE_INTEGER + 1)],
    [slow(4037, 1)],
    [slow(0, 0)],
    [command(0, "unknown")],
    [acquire(3, 1), acquire(2, 2)],
    Array.from({ length: 65 }, (_, tick) => slow(tick, tick + 1)),
  ];
  for (const commands of invalid) {
    assert.throws(() => createSlowFixture(commands));
  }
  assert.throws(() => createSlowFixture([], 0), /direction/u);
  const sparse = [acquire(0)];
  delete sparse[0];
  assert.throws(() => createSlowFixture(sparse), /dense/u);
  const extraArray = [acquire(0)];
  extraArray.extra = true;
  assert.throws(() => createSlowFixture(extraArray));
  assert.throws(() => createSlowFixture([{ ...acquire(0), extra: true }]));
  const unsafePrototype = Object.create({ inherited: true });
  Object.assign(unsafePrototype, acquire(0));
  assert.throws(() => createSlowFixture([unsafePrototype]), /plain object/u);
  const getter = acquire(0);
  let getterCalls = 0;
  Object.defineProperty(getter, "tick", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error("must not execute");
    },
  });
  assert.throws(() => createSlowFixture([getter]), /invalid shape/u);
  assert.equal(getterCalls, 0);
});

test("combat status slow: stepMany rejects atomically and obeys encounter bounds", () => {
  const encounter = run([acquire(0), slow(0)], 100);
  const before = encounter.serialize();
  for (const count of [-1, 0.5, 4097, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => encounter.stepMany(count));
    assert.equal(encounter.serialize(), before);
  }
  const nearEnd = new TimedMovementAttackSlowEncounter(createSlowFixture());
  nearEnd.stepMany(4096);
  const endedState = nearEnd.state;
  const endedReplay = nearEnd.replay;
  assert.throws(() => nearEnd.step());
  assert.deepEqual(nearEnd.state, endedState);
  assert.deepEqual(nearEnd.replay, endedReplay);
  assert.throws(() => nearEnd.stepMany(1));
  assert.deepEqual(nearEnd.state, endedState);
  assert.deepEqual(nearEnd.replay, endedReplay);
});

test("combat status slow: snapshots reject forged status, work, cursor, events, and bounds", () => {
  const encounter = run([acquire(0, 12), slow(20, 4)], 180);
  const snapshot = JSON.parse(encounter.serialize());
  for (const mutate of [
    (value) => { value.extra = true; },
    (value) => { value.version = 2; },
    (value) => { value.identity.fixture = "forged"; },
    (value) => { value.identity.direction = 0; },
    (value) => { value.identity.commands.push(acquire(0, 99)); },
    (value) => { value.state.tick = -1; },
    (value) => { value.state.commandIndex = 0; },
    (value) => { value.state.attackWork = 999; },
    (value) => { value.state.attackWork = 2041; },
    (value) => { value.state.slowUntilTick = value.state.tick + 1; },
    (value) => { value.state.slowSourceId = 99; },
    (value) => { value.state.movementRemainder = 1200; },
    (value) => { value.state.position = 1000001; },
    (value) => { value.state.history[0].tick = value.state.tick; },
    (value) => { value.state.history[0].extra = true; },
  ]) {
    const hostile = structuredClone(snapshot);
    mutate(hostile);
    assert.throws(
      () => TimedMovementAttackSlowEncounter.restore(JSON.stringify(hostile)),
    );
  }
});

test("combat status slow: snapshots are canonical, duplicate-free, and bounded", () => {
  const encounter = run([acquire(0), slow(0)], 90);
  const serialized = encounter.serialize();
  assert.equal(
    TimedMovementAttackSlowEncounter.restore(serialized).serialize(),
    serialized,
  );
  assert.throws(() => TimedMovementAttackSlowEncounter.restore(null));
  assert.throws(() => TimedMovementAttackSlowEncounter.restore("{"));
  assert.throws(
    () => TimedMovementAttackSlowEncounter.restore(
      serialized.replace('"version":1', '"version":1,"version":1'),
    ),
    /canonical duplicate-free/u,
  );
  assert.throws(
    () => TimedMovementAttackSlowEncounter.restore(`"${"x".repeat(1048577)}"`),
    /byte bound/u,
  );
});

test("combat status slow: deferred mechanics do not leak into the fixture surface", () => {
  const source = readFileSync(
    new URL("../src/content/cards/special-combat-slow.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /DamageSystem|AreaDamageSystem|Projectile|stun-applied|snare-applied|rage-applied/u,
  );
  const records = createSlowQuestionRecords();
  for (const key of [
    "delivery", "fidelity", "immunity", "rageComposition",
    "resetComposition", "snareComposition", "stunComposition",
  ]) {
    assert.equal(records[key].disposition, "question");
  }
});
