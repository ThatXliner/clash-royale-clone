import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  TimedMovementAttackSlowEncounter,
  TimedMovementAttackRageEncounter,
  createSlowFixture,
  createRageFixture,
  createRageQuestionRecords,
  createRageSpecialCatalog,
} from "../src/content/index.js";
import { protectedIdentityHits } from "./helpers/protected-identity-scan.js";

const benchmark = JSON.parse(readFileSync(
  new URL("../reference/stats/cards.json", import.meta.url), "utf8",
));
const command = (tick, type, sourceId = null, targetId = null) => ({
  sourceId, targetId, tick, type,
});
const acquire = (tick, targetId = 7) =>
  command(tick, "acquire-target", null, targetId);
const accelerate = (tick, sourceId = 99) =>
  command(tick, "accelerate", sourceId);
const slow = (tick, sourceId = 88) => command(tick, "slow", sourceId);
const eventTicks = (encounter, type) =>
  encounter.replay.filter((event) => event.type === type)
    .map(({ tick }) => tick);

function run(commands, ticks, direction = 1) {
  const encounter = new TimedMovementAttackRageEncounter(
    createRageFixture(commands, direction),
  );
  encounter.stepMany(ticks);
  return encounter;
}

// Independent scalar BigInt oracle: literals intentionally do not import
// production constants or helpers.
function oracle(commands, boundaries, direction = 1) {
  const state = {
    alive: true,
    attackPhase: "idle",
    attackSequence: 0,
    attackWork: null,
    boostSourceId: null,
    boostUntilTick: null,
    commandIndex: 0,
    movementRemainder: 0n,
    pendingAttack: null,
    position: 0n,
    slowSourceId: null,
    slowUntilTick: null,
    targetId: null,
    tick: 0,
  };
  const launchTicks = [];
  const contactTicks = [];
  while (state.tick < boundaries) {
    if (state.boostUntilTick !== null && state.tick >= state.boostUntilTick) {
      state.boostSourceId = null;
      state.boostUntilTick = null;
    }
    if (state.slowUntilTick !== null && state.tick >= state.slowUntilTick) {
      state.slowSourceId = null;
      state.slowUntilTick = null;
    }
    while (commands[state.commandIndex]?.tick === state.tick) {
      const entry = commands[state.commandIndex];
      state.commandIndex += 1;
      if (entry.type === "accelerate" && state.alive) {
        state.boostSourceId = entry.sourceId;
        state.boostUntilTick = state.tick + 90;
      } else if (entry.type === "slow" && state.alive) {
        state.slowSourceId = entry.sourceId;
        state.slowUntilTick = state.tick + 60;
      } else if (entry.type === "acquire-target" && state.alive &&
        state.targetId !== entry.targetId) {
        state.targetId = entry.targetId;
        state.attackPhase = "windup";
        state.attackWork = 5760n;
        state.pendingAttack = null;
      } else if (entry.type === "lose-target" && state.targetId !== null) {
        state.targetId = null;
        state.attackPhase = "idle";
        state.attackWork = null;
        state.pendingAttack = null;
      } else if (entry.type === "target-died" && state.targetId !== null &&
        (entry.targetId === null || entry.targetId === state.targetId)) {
        state.targetId = null;
        state.attackPhase = "idle";
        state.attackWork = null;
        state.pendingAttack = null;
      } else if (entry.type === "interrupt" && state.alive &&
        state.targetId !== null) {
        state.attackPhase = "windup";
        state.attackWork = 5760n;
        state.pendingAttack = null;
      } else if (entry.type === "die" && state.alive) {
        state.alive = false;
        state.targetId = null;
        state.attackPhase = "idle";
        state.attackWork = null;
        state.pendingAttack = null;
        state.boostSourceId = null;
        state.boostUntilTick = null;
        state.slowSourceId = null;
        state.slowUntilTick = null;
      }
    }
    if (state.alive && state.targetId !== null && state.attackWork === 0n) {
      if (state.attackPhase === "contact") {
        contactTicks.push(state.tick);
        state.pendingAttack = null;
        state.attackPhase = "cadence";
        state.attackWork = 8160n;
      } else {
        state.attackSequence += 1;
        launchTicks.push(state.tick);
        state.pendingAttack = {
          sequence: state.attackSequence,
          targetId: state.targetId,
        };
        state.attackPhase = "contact";
        state.attackWork = 160n;
      }
    }
    if (state.alive) {
      const rate = state.boostUntilTick !== null
        ? (state.slowUntilTick !== null ? 91n : 140n)
        : (state.slowUntilTick !== null ? 52n : 80n);
      const accumulated = state.movementRemainder + 1000n * rate;
      state.position += BigInt(direction) * (accumulated / 4800n);
      state.movementRemainder = accumulated % 4800n;
      if (state.attackWork !== null && state.attackWork > 0n) {
        state.attackWork = state.attackWork > rate
          ? state.attackWork - rate : 0n;
      }
    }
    state.tick += 1;
  }
  return { contactTicks, launchTicks, state };
}

function comparable(state) {
  return {
    alive: state.alive,
    attackPhase: state.attackPhase,
    attackSequence: state.attackSequence,
    attackWork: state.attackWork === null ? null : BigInt(state.attackWork),
    boostSourceId: state.boostSourceId,
    boostUntilTick: state.boostUntilTick,
    commandIndex: state.commandIndex,
    movementRemainder: BigInt(state.movementRemainder),
    pendingAttack: state.pendingAttack,
    position: BigInt(state.position),
    slowSourceId: state.slowSourceId,
    slowUntilTick: state.slowUntilTick,
    targetId: state.targetId,
    tick: state.tick,
  };
}

function oracleComparable(state) {
  return {
    alive: state.alive,
    attackPhase: state.attackPhase,
    attackSequence: state.attackSequence,
    attackWork: state.attackWork,
    boostSourceId: state.boostSourceId,
    boostUntilTick: state.boostUntilTick,
    commandIndex: state.commandIndex,
    movementRemainder: state.movementRemainder,
    pendingAttack: state.pendingAttack,
    position: state.position,
    slowSourceId: state.slowSourceId,
    slowUntilTick: state.slowUntilTick,
    targetId: state.targetId,
    tick: state.tick,
  };
}

test("combat status rage: original runtime identity is isolated and protected identities are test-only", () => {
  const catalog = createRageSpecialCatalog();
  assert.deepEqual(catalog, [{
    areaDamageRadiusMillitiles: 3000,
    components: [],
    cost: 2,
    count: 1,
    damage: 192,
    deployTimeTicks: 0,
    displayName: "Tempo Field",
    firstHitTicks: null,
    hitSpeedTicks: null,
    hitpoints: null,
    id: "tempo-field",
    kind: "effect",
    movementMillitilesPerSecond: null,
    rangeMillitiles: null,
    rarity: "mythic",
    sightRangeMillitiles: null,
    targetMode: "ground-and-air",
  }]);
  catalog[0].damage = 1;
  assert.equal(createRageSpecialCatalog()[0].damage, 192);
  const source = readFileSync(new URL(
    "../src/content/cards/special-combat-rage.js", import.meta.url,
  ), "utf8");
  const protectedTokens = new Set(benchmark.cards.flatMap(({ key, name }) =>
    [key.toLowerCase(), name.toLowerCase()]));
  assert.deepEqual(protectedIdentityHits(source, protectedTokens), []);
  assert.doesNotMatch(source, /readFile|cards\.json|reference\//u);
  assert.match(source, /\bBigInt\b/u);
});

test("combat status rage: mapped corpus values remain separate unverified questions", () => {
  const protectedComparison = benchmark.cards.find(({ id }) => id === 28000002);
  assert.ok(protectedComparison);
  const card = createRageSpecialCatalog()[0];
  assert.deepEqual(
    [card.damage, card.areaDamageRadiusMillitiles, card.targetMode],
    [protectedComparison.damage,
      protectedComparison.area_damage_radius_tiles * 1000,
      "ground-and-air"],
  );
  for (const field of ["damage", "area_damage_radius_tiles", "targets"]) {
    assert.ok(protectedComparison.unverified_fields.includes(field));
  }
  const questions = createRageQuestionRecords();
  assert.equal(questions.commonBaseDamage.value, card.damage);
  assert.equal(questions.commonAreaDamageRadius.value,
    card.areaDamageRadiusMillitiles);
  assert.equal(questions.commonTargetMode.value, card.targetMode);
});

test("combat status rage: every absent value and policy is a fresh recursively frozen QUESTION", () => {
  const expected = [
    "applyBoundary", "attackMultiplier", "attackWorkRate",
    "boundaryOrdering", "cadenceWorkUnits", "commonAreaDamageRadius",
    "commonBaseDamage", "commonCount", "commonDeployTicks",
    "commonFirstHitTicks", "commonHitCadenceTicks", "commonHitpoints",
    "commonMovementMillitilesPerSecond", "commonRangeMillitiles",
    "commonSightRangeMillitiles", "commonTargetMode", "contactDelayTicks",
    "contactRageApplication", "deathPolicy", "delivery",
    "differentSourceRefresh", "durationTicks", "eligibility",
    "expiryBoundaryReapply", "expiryWindow", "fidelity", "idleApplication",
    "interruptionPolicy", "movementMultiplier", "movementRemainder",
    "nonStacking", "normalRateUnits", "rageRateUnits", "readyApplication",
    "retainedAttackRemainder", "sameSourceRefresh", "slowComposition",
    "slowDurationTicks", "slowEligibility", "slowMultiplier",
    "slowNonStacking", "slowRefresh", "sourceDeath", "stack",
    "targetChange", "targetDeath", "targetLoss", "windupWorkUnits",
  ];
  const first = createRageQuestionRecords();
  assert.deepEqual(Object.keys(first).sort(), expected.sort());
  assert.equal(Object.keys(first).length, 48);
  assert.ok(Object.isFrozen(first));
  for (const [key, record] of Object.entries(first)) {
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
      source: "unsourced-timed-movement-and-attack-rage-fixture",
    });
    assert.ok(Object.isFrozen(record));
    if (record.value !== null && typeof record.value === "object") {
      assert.ok(Object.isFrozen(record.value));
    }
  }
  const second = createRageQuestionRecords();
  assert.notEqual(first, second);
  assert.notEqual(first.attackMultiplier, second.attackMultiplier);
  assert.notEqual(first.attackMultiplier.value, second.attackMultiplier.value);
  assert.throws(() => {
    first.attackMultiplier.value.numerator = 1;
  }, TypeError);
  assert.throws(() => createRageQuestionRecords({ durationTicks: 1 }),
    /do not accept overrides/u);
});

test("combat status rage: idle and movement application accelerate exact rational work", () => {
  const normal = run([], 90);
  const boosted = run([accelerate(0)], 90);
  assert.deepEqual(
    [normal.state.position, normal.state.movementRemainder],
    [1500, 0],
  );
  assert.deepEqual(
    [boosted.state.position, boosted.state.movementRemainder],
    [2625, 0],
  );
  const during = run([accelerate(17)], 107);
  assert.deepEqual(comparable(during.state),
    oracleComparable(oracle([accelerate(17)], 107).state));
});

test("combat status rage: windup, ready, contact, and cadence applications have exact ticks", () => {
  const windup = run([acquire(0), accelerate(20)], 230);
  assert.deepEqual(eventTicks(windup, "attack-launched"), [50, 111, 215]);
  assert.deepEqual(eventTicks(windup, "attack-contact"), [52, 113, 217]);

  const ready = run([acquire(0), accelerate(72)], 210);
  assert.deepEqual(eventTicks(ready, "attack-launched"), [72, 133]);

  const contact = run([acquire(0), accelerate(73)], 210);
  assert.deepEqual(eventTicks(contact, "attack-contact"), [74, 135]);

  const cadence = run([acquire(0), accelerate(90)], 240);
  const expected = oracle([acquire(0), accelerate(90)], 240);
  assert.deepEqual(eventTicks(cadence, "attack-launched"), expected.launchTicks);
  assert.deepEqual(eventTicks(cadence, "attack-contact"), expected.contactTicks);
});

test("combat status rage: same and different source refresh are nonstacking and latest wins", () => {
  const doubled = run([
    acquire(0), accelerate(0, 1), accelerate(0, 2), accelerate(30, 2),
  ], 240);
  const single = run([
    acquire(0), accelerate(0, 2), accelerate(30, 2),
  ], 240);
  assert.equal(doubled.state.boostUntilTick, single.state.boostUntilTick);
  assert.equal(doubled.state.boostSourceId, single.state.boostSourceId);
  assert.deepEqual(eventTicks(doubled, "attack-launched"),
    eventTicks(single, "attack-launched"));
  assert.equal(doubled.replay.filter(({ type }) =>
    type === "rage-applied").length, 3);
  assert.deepEqual(doubled.replay.filter(({ type }) =>
    type === "rage-expired"), [
    { sourceId: 2, tick: 120, type: "rage-expired" },
  ]);
});

test("combat status rage: expiry is inclusive and boundary reapply follows expiry", () => {
  const commands = [accelerate(0, 1), accelerate(90, 2)];
  const encounter = run(commands, 181);
  assert.deepEqual(encounter.replay.filter(({ tick }) => tick === 90)
    .filter(({ type }) => type !== "moved"), [
    { sourceId: 1, tick: 90, type: "rage-expired" },
    { sourceId: 2, tick: 90, type: "rage-applied", untilTick: 180 },
  ]);
  assert.deepEqual(encounter.replay.filter(({ tick }) => tick === 180)
    .map(({ type }) => type), ["rage-expired", "moved"]);
  assert.equal(encounter.replay.find(({ tick, type }) =>
    tick === 89 && type === "moved").rate, 140);
  assert.equal(encounter.replay.find(({ tick, type }) =>
    tick === 90 && type === "moved").rate, 140);
});

test("combat status rage: slow composition is explicit, multiplicative, and exact", () => {
  const commands = [acquire(0), accelerate(0), slow(0)];
  const encounter = run(commands, 180);
  const expected = oracle(commands, 180);
  assert.deepEqual(comparable(encounter.state), oracleComparable(expected.state));
  assert.deepEqual(eventTicks(encounter, "attack-launched"),
    expected.launchTicks);
  assert.deepEqual(
    encounter.replay.filter(({ type, tick }) =>
      type === "moved" && [0, 59, 60, 89, 90].includes(tick))
      .map(({ rate }) => rate),
    [91, 91, 140, 140, 80],
  );
});

test("combat status rage: command-first loss, change, death, and interruption cancel earned work", () => {
  const lost = run([acquire(0), command(72, "lose-target")], 100);
  assert.deepEqual(eventTicks(lost, "attack-launched"), []);
  const changed = run([acquire(0, 1), acquire(72, 2)], 150);
  assert.deepEqual(changed.replay.filter(({ type }) =>
    type === "attack-launched").map(({ targetId, tick }) =>
    ({ targetId, tick })), [{ targetId: 2, tick: 144 }]);
  const targetDead = run([
    acquire(0, 1), command(72, "target-died", null, 1),
  ], 100);
  assert.deepEqual(eventTicks(targetDead, "attack-launched"), []);
  const interrupted = run([
    acquire(0), command(72, "interrupt"),
  ], 150);
  assert.deepEqual(eventTicks(interrupted, "attack-launched"), [144]);
  const dead = run([acquire(0), accelerate(0), command(30, "die")], 100);
  assert.equal(dead.state.targetId, null);
  assert.equal(dead.state.boostUntilTick, null);
  assert.equal(dead.state.position, run([acquire(0), accelerate(0)], 30)
    .state.position);
});

test("combat status rage: exact positions and attack ticks match the independent oracle", () => {
  const scenarios = [
    [acquire(0)],
    [acquire(0), accelerate(0)],
    [acquire(0), accelerate(20)],
    [acquire(0), accelerate(0), slow(0)],
    [acquire(0), slow(10), accelerate(30)],
    [acquire(0), accelerate(0, 1), accelerate(90, 2)],
    [acquire(0, 1), accelerate(20), acquire(70, 2)],
  ];
  for (const commands of scenarios) {
    const encounter = new TimedMovementAttackRageEncounter(
      createRageFixture(commands),
    );
    for (let boundary = 1; boundary <= 260; boundary += 1) {
      encounter.step();
      const expected = oracle(commands, boundary);
      assert.deepEqual(comparable(encounter.state),
        oracleComparable(expected.state));
      assert.deepEqual(eventTicks(encounter, "attack-launched"),
        expected.launchTicks);
      assert.deepEqual(eventTicks(encounter, "attack-contact"),
        expected.contactTicks);
    }
  }
});

test("combat status rage: thousands-tick drift probe has no floating-point drift", () => {
  const commands = [
    acquire(0), accelerate(1), slow(47), accelerate(500, 2),
    slow(1300, 3), accelerate(2500, 4), slow(3300, 5),
  ];
  const encounter = run(commands, 4096);
  const expected = oracle(commands, 4096);
  assert.deepEqual(comparable(encounter.state), oracleComparable(expected.state));
  assert.deepEqual(eventTicks(encounter, "attack-launched"),
    expected.launchTicks);
  assert.deepEqual(eventTicks(encounter, "attack-contact"),
    expected.contactTicks);
});

test("combat status rage: fresh, reordered, arbitrary chunks, and every-phase restore pass", () => {
  const commands = [
    acquire(0, 4), accelerate(20, 8), slow(55, 2), accelerate(110, 9),
    command(170, "interrupt"), acquire(210, 5),
  ];
  const reordered = commands.map(({ sourceId, targetId, tick, type }) => {
    const entry = Object.create(null);
    entry.type = type;
    entry.tick = tick;
    entry.targetId = targetId;
    entry.sourceId = sourceId;
    return entry;
  });
  const stepped = new TimedMovementAttackRageEncounter(
    createRageFixture(commands),
  );
  for (let tick = 0; tick < 280; tick += 1) stepped.step();
  const chunked = new TimedMovementAttackRageEncounter(
    createRageFixture(reordered),
  );
  for (const count of [1, 17, 0, 43, 99, 120]) chunked.stepMany(count);
  assert.equal(chunked.serialize(), stepped.serialize());
  assert.equal(run(commands, 280).serialize(), stepped.serialize());

  const causal = new TimedMovementAttackRageEncounter(
    createRageFixture(commands),
  );
  for (let cut = 0; cut <= 280; cut += 1) {
    const restored = TimedMovementAttackRageEncounter.restore(causal.serialize());
    assert.equal(restored.serialize(), causal.serialize());
    if (cut < 280) {
      assert.deepEqual(restored.step(), causal.step());
      assert.equal(restored.serialize(), causal.serialize());
    }
  }
});

test("combat status rage: caller, setup, output, state, and replay are isolated", () => {
  const commands = [acquire(0, 3), accelerate(5, 4)];
  const fixture = createRageFixture(commands);
  const encounter = new TimedMovementAttackRageEncounter(fixture);
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
  encounter.stepMany(100);
  assert.equal(encounter.state.targetId, 3);
  assert.equal(encounter.replay.find(({ type }) =>
    type === "target-acquired").targetId, 3);
});

test("combat status rage: hostile accessor, prototype, sparse, extra, duplicate, unsafe, and oversized inputs reject", () => {
  const invalid = [
    [acquire(-1, 1)],
    [acquire(4096, 1)],
    [acquire(0, 0)],
    [acquire(0, Number.MAX_SAFE_INTEGER + 1)],
    [accelerate(4007, 1)],
    [accelerate(0, 0)],
    [command(0, "unknown")],
    [acquire(3, 1), acquire(2, 2)],
    Array.from({ length: 97 }, (_, tick) => accelerate(tick, tick + 1)),
  ];
  for (const commands of invalid) {
    assert.throws(() => createRageFixture(commands));
  }
  assert.throws(() => createRageFixture([], 0), /direction/u);
  const sparse = [acquire(0)];
  delete sparse[0];
  assert.throws(() => createRageFixture(sparse), /dense/u);
  const extraArray = [acquire(0)];
  extraArray.extra = true;
  assert.throws(() => createRageFixture(extraArray));
  assert.throws(() => createRageFixture([{ ...acquire(0), extra: true }]));
  const inherited = Object.create({ inherited: true });
  Object.assign(inherited, acquire(0));
  assert.throws(() => createRageFixture([inherited]), /plain object/u);
  const getter = acquire(0);
  let getterCalls = 0;
  Object.defineProperty(getter, "tick", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error("must not execute");
    },
  });
  assert.throws(() => createRageFixture([getter]), /invalid shape/u);
  assert.equal(getterCalls, 0);
});

test("combat status rage: multi-step rejection and overflow boundaries are atomic", () => {
  const encounter = run([acquire(0), accelerate(0)], 100);
  const before = encounter.serialize();
  for (const count of [-1, 0.5, 4097, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => encounter.stepMany(count));
    assert.equal(encounter.serialize(), before);
  }
  const ended = new TimedMovementAttackRageEncounter(createRageFixture());
  ended.stepMany(4096);
  const endedState = ended.state;
  assert.throws(() => ended.step());
  assert.deepEqual(ended.state, endedState);
  assert.throws(() => ended.stepMany(1));
  assert.deepEqual(ended.state, endedState);

  const sustained = Array.from({ length: 51 }, (_, index) =>
    accelerate(index * 80, index + 1));
  const overflowing = new TimedMovementAttackRageEncounter(
    createRageFixture(sustained),
  );
  const overflowBefore = overflowing.serialize();
  assert.throws(() => overflowing.stepMany(4096), /position bound/u);
  assert.equal(overflowing.serialize(), overflowBefore);
});

test("combat status rage: snapshots are canonical, bounded, causal, and every field is validated", () => {
  const encounter = run([
    acquire(0, 12), accelerate(20, 4), slow(40, 5),
  ], 180);
  const serialized = encounter.serialize();
  const snapshot = JSON.parse(serialized);
  assert.equal(TimedMovementAttackRageEncounter.restore(serialized).serialize(),
    serialized);
  for (const mutate of [
    (value) => { value.extra = true; },
    (value) => { value.version = 2; },
    (value) => { value.identity.fixture = "forged"; },
    (value) => { value.identity.direction = 0; },
    (value) => { value.identity.commands.push(acquire(0, 99)); },
    (value) => { value.state.tick = -1; },
    (value) => { value.state.commandIndex = 0; },
    (value) => { value.state.attackWork = 8161; },
    (value) => { value.state.boostUntilTick = value.state.tick + 1; },
    (value) => { value.state.boostSourceId = 99; },
    (value) => { value.state.movementRemainder = 4800; },
    (value) => { value.state.position = 1000001; },
    (value) => { value.state.history[0].tick = value.state.tick; },
    (value) => { value.state.history[0].extra = true; },
  ]) {
    const hostile = structuredClone(snapshot);
    mutate(hostile);
    assert.throws(() =>
      TimedMovementAttackRageEncounter.restore(JSON.stringify(hostile)));
  }
  assert.throws(() => TimedMovementAttackRageEncounter.restore(null));
  assert.throws(() => TimedMovementAttackRageEncounter.restore("{"));
  assert.throws(() => TimedMovementAttackRageEncounter.restore(
    serialized.replace('"version":1', '"version":1,"version":1'),
  ), /canonical duplicate-free/u);
  assert.throws(() => TimedMovementAttackRageEncounter.restore(
    `"${"x".repeat(1048577)}"`,
  ), /byte bound/u);
});

test("combat status rage: unrelated systems stay absent and default slow behavior stays compatible", () => {
  const source = readFileSync(new URL(
    "../src/content/cards/special-combat-rage.js", import.meta.url,
  ), "utf8");
  assert.doesNotMatch(source,
    /DamageSystem|heal-applied|invisibility|Projectile|reflection/u);

  const slowEncounter = new TimedMovementAttackSlowEncounter(createSlowFixture([
    command(0, "slow", 88),
    acquire(0, 7),
  ]));
  slowEncounter.stepMany(60);
  assert.deepEqual([
    slowEncounter.state.position,
    slowEncounter.state.movementRemainder,
    slowEncounter.state.attackWork,
    slowEncounter.state.slowUntilTick,
  ], [650, 0, 660, 60]);
  assert.deepEqual(slowEncounter.replay.filter(({ type }) => type === "attack"), []);

  slowEncounter.stepMany(34);
  assert.deepEqual(slowEncounter.replay.filter(({ type }) => type === "attack"), [
    { sequence: 1, targetId: 7, tick: 93, type: "attack" },
  ]);
  assert.equal(slowEncounter.state.slowUntilTick, null);
  slowEncounter.stepMany(26);
  assert.deepEqual([
    slowEncounter.state.position,
    slowEncounter.state.movementRemainder,
    slowEncounter.state.attackWork,
  ], [1650, 0, 1500]);
});
