import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  TimedMovementOnlySnareEncounter,
  createSnareFixture,
  createSnareQuestionRecords,
  createSnareSpecialCatalog,
} from "../src/content/cards/special-combat-snare.js";

const command = (tick, type, sourceId = null, targetId = null) => ({
  sourceId,
  targetId,
  tick,
  type,
});

function eventsOf(encounter, type) {
  return encounter.replay.filter((event) => event.type === type);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function scalarPosition(ticks, direction, applications) {
  let position = 0;
  let remainder = 0;
  let through = null;
  let applicationIndex = 0;
  for (let tick = 0; tick < ticks; tick += 1) {
    if (applications[applicationIndex]?.tick === tick) {
      through = tick + 89;
      applicationIndex += 1;
    }
    if (through === null || tick > through) {
      const accumulated = remainder + 1000;
      position += direction * Math.floor(accumulated / 60);
      remainder = accumulated % 60;
    }
    if (tick === through) through = null;
  }
  return { position, remainder };
}

function scalarAttackTicks(ticks, acquireTick = 0) {
  const launches = [];
  const contacts = [];
  let remaining = null;
  const pending = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    if (tick === acquireTick) remaining = 72;
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      pending[index].remaining -= 1;
      if (pending[index].remaining === 0) {
        contacts.push(tick);
        pending.splice(index, 1);
      }
    }
    if (remaining !== null) {
      remaining -= 1;
      if (remaining === 0) {
        launches.push(tick);
        pending.push({ remaining: 2 });
        remaining = 108;
      }
    }
  }
  return { contacts, launches };
}

function encounter(commands, direction = 1) {
  return new TimedMovementOnlySnareEncounter(
    createSnareFixture(commands, direction),
  );
}

test("Tether Rider catalog maps only ordinary unverified primary fields", () => {
  const catalog = createSnareSpecialCatalog();
  assert.equal(catalog.length, 1);
  assert.deepEqual(catalog[0], {
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 5,
    count: 1,
    damage: 266,
    deployTimeTicks: 60,
    displayName: "Tether Rider",
    firstHitTicks: 72,
    hitSpeedTicks: 108,
    hitpoints: 1767,
    id: "tether-rider",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 800,
    rarity: "mythic",
    sightRangeMillitiles: 7500,
    targetMode: "structures",
  });

  // Test-only correspondence for common fields. The benchmark corpus has no
  // rider-secondary or snare record, so no special value comes from this map.
  const ramRiderTestOnlyMap = {
    areaDamageRadiusMillitiles: null,
    count: 1,
    damage: 266,
    deployTimeTicks: 60,
    firstHitTicks: 72,
    hitSpeedTicks: 108,
    hitpoints: 1767,
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 800,
    sightRangeMillitiles: 7500,
    targetMode: "structures",
  };
  for (const [key, value] of Object.entries(ramRiderTestOnlyMap)) {
    assert.equal(catalog[0][key], value);
  }
});

test("all special policies and mapped unverified fields are fresh frozen questions", () => {
  const first = createSnareQuestionRecords();
  const second = createSnareQuestionRecords();
  const required = [
    "applyBoundary", "attackAcquisitionBehavior", "attackCadenceBehavior",
    "attackContactBehavior", "attackWindupBehavior", "cleansePolicy",
    "commonAreaDamageRadiusMillitiles", "commonCount", "commonDamage",
    "commonDeployTimeTicks", "commonFirstHitTicks", "commonHitSpeedTicks",
    "commonHitpoints", "commonMovementMillitilesPerSecond",
    "commonRangeMillitiles", "commonSightRangeMillitiles", "commonTargetMode",
    "contactDelayTicks", "deathPolicy", "delivery", "durationTicks",
    "eligibility", "expiry", "expiryBoundaryOrder", "fullFidelity",
    "immunityPolicy", "interruptionPolicy", "movementRateWhileSnared",
    "movementRemainder", "rageComposition", "reapplyDifferentSource",
    "reapplySameSource", "resetComposition", "sameBoundaryPriority",
    "slowComposition", "source", "sourceCadence", "sourceReplacement", "stack",
    "stunComposition", "targetClasses", "targetRetention", "ticksPerSecond",
  ];
  assert.deepEqual(Object.keys(first).sort(), required.sort());
  assert.equal(first.durationTicks.value, 90);
  assert.equal(first.movementRateWhileSnared.value, 0);
  assert.notStrictEqual(first, second);
  for (const key of required) {
    assert.notStrictEqual(first[key], second[key]);
    assert.deepEqual(
      {
        authoritative: first[key].authoritative,
        confidence: first[key].confidence,
        disposition: first[key].disposition,
        key: first[key].key,
      },
      {
        authoritative: false,
        confidence: "unverified",
        disposition: "question",
        key,
      },
    );
    assert.ok(Object.isFrozen(first[key]));
  }
  assert.ok(Object.isFrozen(first));
  assert.throws(() => createSnareQuestionRecords({ durationTicks: 1 }), TypeError);
});

test("an existing positive movement remainder freezes and resumes on exact expiry", () => {
  const applications = [{ tick: 10 }];
  const sim = encounter([command(10, "snare", 7)]);
  sim.stepMany(10);
  assert.deepEqual(
    { position: sim.state.position, remainder: sim.state.movementRemainder },
    scalarPosition(10, 1, applications),
  );
  const before = sim.state;
  sim.stepMany(90);
  assert.equal(sim.state.position, before.position);
  assert.equal(sim.state.movementRemainder, before.movementRemainder);
  assert.deepEqual(eventsOf(sim, "snare-expired").map(({ tick }) => tick), [99]);
  sim.step();
  assert.deepEqual(
    { position: sim.state.position, remainder: sim.state.movementRemainder },
    scalarPosition(101, 1, applications),
  );
});

test("negative movement uses the same scalar oracle without floating point", () => {
  const applications = [{ tick: 7 }];
  const sim = encounter([command(7, "snare", 9)], -1);
  for (const chunk of [3, 4, 11, 79, 1, 23]) sim.stepMany(chunk);
  const expected = scalarPosition(121, -1, applications);
  assert.equal(sim.state.position, expected.position);
  assert.equal(sim.state.movementRemainder, expected.remainder);
  assert.ok(sim.state.position < 0);
});

test("acquisition, windup, launch, contact, and cadence ignore snare", () => {
  const commands = [
    command(0, "acquire-target", null, 41),
    command(20, "snare", 5),
    command(140, "snare", 6),
  ];
  const sim = encounter(commands);
  sim.stepMany(320);
  const oracle = scalarAttackTicks(320);
  assert.deepEqual(eventsOf(sim, "attack-launched").map(({ tick }) => tick),
    oracle.launches);
  assert.deepEqual(eventsOf(sim, "attack-contact").map(({ tick }) => tick),
    oracle.contacts);
  assert.deepEqual(eventsOf(sim, "attack-launched").map(({ sequence }) => sequence),
    [1, 2, 3]);
});

test("a target acquired during snare starts its ordinary schedule immediately", () => {
  const sim = encounter([
    command(0, "snare", 5),
    command(10, "acquire-target", null, 41),
  ]);
  sim.stepMany(200);
  const oracle = scalarAttackTicks(200, 10);
  assert.deepEqual(eventsOf(sim, "attack-launched").map(({ tick }) => tick),
    oracle.launches);
  assert.deepEqual(eventsOf(sim, "attack-contact").map(({ tick }) => tick),
    oracle.contacts);
  assert.equal(sim.state.position, scalarPosition(
    200,
    1,
    [{ tick: 0 }],
  ).position);
});

test("application is deterministic in idle, movement, windup, ready, contact, and cadence", () => {
  const phases = [
    { acquire: null, tick: 0 },
    { acquire: null, tick: 10 },
    { acquire: 0, tick: 20 },
    { acquire: 0, tick: 71 },
    { acquire: 0, tick: 73 },
    { acquire: 0, tick: 90 },
  ];
  for (const [index, phase] of phases.entries()) {
    const commands = [];
    if (phase.acquire !== null) {
      commands.push(command(phase.acquire, "acquire-target", null, 100 + index));
    }
    commands.push(command(phase.tick, "snare", 200 + index));
    const sim = encounter(commands);
    sim.stepMany(190);
    assert.deepEqual(eventsOf(sim, "snare-applied").map(({ tick }) => tick),
      [phase.tick]);
    if (phase.acquire !== null) {
      const oracle = scalarAttackTicks(190);
      assert.deepEqual(eventsOf(sim, "attack-launched").map(({ tick }) => tick),
        oracle.launches);
      assert.deepEqual(eventsOf(sim, "attack-contact").map(({ tick }) => tick),
        oracle.contacts);
    }
  }
});

test("same-source and different-source reapplication refresh one nonstacking status", () => {
  const applications = [{ tick: 10 }, { tick: 50 }, { tick: 100 }];
  const sim = encounter([
    command(10, "snare", 3),
    command(50, "snare", 3),
    command(100, "snare", 8),
  ]);
  sim.stepMany(191);
  assert.deepEqual(eventsOf(sim, "snare-applied").map(
    ({ snaredThroughTick, sourceId, tick }) =>
      ({ snaredThroughTick, sourceId, tick })),
  [
    { snaredThroughTick: 99, sourceId: 3, tick: 10 },
    { snaredThroughTick: 139, sourceId: 3, tick: 50 },
    { snaredThroughTick: 189, sourceId: 8, tick: 100 },
  ]);
  assert.deepEqual(eventsOf(sim, "snare-expired"), [
    { sourceId: 8, tick: 189, type: "snare-expired" },
  ]);
  assert.deepEqual(
    { position: sim.state.position, remainder: sim.state.movementRemainder },
    scalarPosition(191, 1, applications),
  );
});

test("reapplication on the inclusive expiry boundary wins before expiry", () => {
  const sim = encounter([
    command(0, "snare", 4),
    command(89, "snare", 12),
  ]);
  sim.stepMany(180);
  assert.deepEqual(eventsOf(sim, "snare-expired"), [
    { sourceId: 12, tick: 178, type: "snare-expired" },
  ]);
  assert.equal(sim.state.position, scalarPosition(
    180,
    1,
    [{ tick: 0 }, { tick: 89 }],
  ).position);
});

test("command-first loss, change, target death, and unit death cancel boundary work", () => {
  const cases = [
    {
      commands: [
        command(0, "acquire-target", null, 1),
        command(10, "snare", 9),
        command(71, "lose-target"),
      ],
      event: "target-lost",
    },
    {
      commands: [
        command(0, "acquire-target", null, 1),
        command(10, "snare", 9),
        command(71, "acquire-target", null, 2),
      ],
      event: "target-acquired",
    },
    {
      commands: [
        command(0, "acquire-target", null, 1),
        command(10, "snare", 9),
        command(71, "target-died", null, 1),
      ],
      event: "target-died",
    },
    {
      commands: [
        command(0, "acquire-target", null, 1),
        command(10, "snare", 9),
        command(71, "die"),
      ],
      event: "died",
    },
  ];
  for (const entry of cases) {
    const sim = encounter(entry.commands);
    sim.stepMany(72);
    assert.equal(eventsOf(sim, "attack-launched").length, 0);
    assert.equal(eventsOf(sim, entry.event).at(-1).tick, 71);
  }
});

test("stable target IDs ignore an unrelated same-boundary death command", () => {
  const sim = encounter([
    command(0, "acquire-target", null, 41),
    command(10, "snare", 5),
    command(71, "target-died", null, 99),
  ]);
  sim.stepMany(74);
  assert.equal(sim.state.targetId, 41);
  assert.deepEqual(eventsOf(sim, "attack-launched").map(({ tick }) => tick), [71]);
  assert.deepEqual(eventsOf(sim, "attack-contact").map(({ tick }) => tick), [73]);
  assert.equal(eventsOf(sim, "target-died").length, 0);
});

test("interruption clears pending contact, restarts windup, and retains snare", () => {
  const sim = encounter([
    command(0, "acquire-target", null, 11),
    command(50, "snare", 2),
    command(72, "interrupt"),
  ]);
  sim.stepMany(145);
  assert.deepEqual(eventsOf(sim, "attack-launched").map(({ tick }) => tick),
    [71, 143]);
  assert.deepEqual(eventsOf(sim, "attack-contact").map(({ tick }) => tick), []);
  assert.equal(sim.state.snaredThroughTick, null);
  assert.deepEqual(eventsOf(sim, "snare-expired").map(({ tick }) => tick), [139]);
});

test("fixture input, returned events, replay, and state are caller-mutation isolated", () => {
  const commands = [command(4, "snare", 3)];
  const setup = createSnareFixture(commands, -1);
  const sim = new TimedMovementOnlySnareEncounter(setup);
  commands[0].tick = 0;
  setup.commands[0].tick = 1;
  const returned = sim.stepMany(6);
  returned[0].tick = 999;
  const replay = sim.replay;
  replay[0].tick = 999;
  const state = sim.state;
  state.position = 999;
  state.history.length = 0;
  assert.equal(eventsOf(sim, "snare-applied")[0].tick, 4);
  assert.notEqual(sim.state.position, 999);
  assert.notEqual(sim.replay[0].tick, 999);
});

test("fresh, reordered, and arbitrary chunk schedules are byte-identical", () => {
  const commands = [
    command(0, "acquire-target", null, 5),
    command(13, "snare", 10),
    command(79, "snare", 11),
    command(190, "interrupt"),
  ];
  const one = encounter(commands, -1);
  one.stepMany(260);
  const reordered = commands.map(({ sourceId, targetId, tick, type }) => {
    const entry = Object.create(null);
    entry.type = type;
    entry.tick = tick;
    entry.targetId = targetId;
    entry.sourceId = sourceId;
    return entry;
  });
  const chunks = encounter(reordered, -1);
  for (const count of [1, 12, 0, 31, 7, 63, 2, 88, 56]) {
    chunks.stepMany(count);
  }
  assert.equal(chunks.state.tick, 260);
  assert.equal(chunks.serialize(), one.serialize());
  assert.deepEqual(chunks.replay, one.replay);
  assert.throws(() => createSnareFixture([...commands].reverse(), -1), TypeError);
});

test("restore is byte-identical at every causal cut through at least 230 ticks", () => {
  const commands = [
    command(0, "acquire-target", null, 5),
    command(9, "snare", 2),
    command(89, "snare", 3),
    command(205, "interrupt"),
  ];
  const expected = encounter(commands);
  expected.stepMany(260);
  for (let cut = 0; cut <= 230; cut += 1) {
    const original = encounter(commands);
    original.stepMany(cut);
    const restored = TimedMovementOnlySnareEncounter.restore(original.serialize());
    restored.stepMany(260 - cut);
    assert.equal(restored.serialize(), expected.serialize(), `cut ${cut}`);
  }
});

test("hostile, sparse, extra, duplicate, unsafe, overflow, and oversized setup inputs reject", () => {
  const getter = {};
  Object.defineProperties(getter, {
    sourceId: { enumerable: true, get() { throw new Error("getter ran"); } },
    targetId: { enumerable: true, value: null },
    tick: { enumerable: true, value: 0 },
    type: { enumerable: true, value: "snare" },
  });
  assert.throws(() => createSnareFixture([getter]), /invalid shape/u);
  assert.throws(() => createSnareFixture(
    Object.assign([command(0, "snare", 1)], { extra: true }),
  ), TypeError);
  const hostilePrototype = [command(0, "snare", 1)];
  Object.setPrototypeOf(hostilePrototype, null);
  assert.throws(() => createSnareFixture(hostilePrototype), TypeError);
  const sparse = Array(1);
  assert.throws(() => createSnareFixture(sparse), TypeError);
  assert.throws(() => createSnareFixture([
    { ...command(0, "snare", 1), extra: true },
  ]), TypeError);
  assert.throws(() => createSnareFixture([
    command(0, "snare", Number.MAX_SAFE_INTEGER + 1),
  ]), TypeError);
  assert.throws(() => createSnareFixture([
    command(0, "snare", 1),
    command(0, "snare", 2),
  ]), TypeError);
  assert.throws(() => createSnareFixture([
    command(4095, "snare", 1),
  ]), TypeError);
  assert.throws(() => createSnareFixture(
    Array.from({ length: 65 }, (_, tick) => command(tick, "die")),
  ), TypeError);
  assert.throws(() => createSnareFixture([], 0), TypeError);
  assert.throws(() => new TimedMovementOnlySnareEncounter(
    Object.create({ commands: [], direction: 1 }),
  ), TypeError);
});

test("stepMany rejects hostile bounds atomically", () => {
  const sim = encounter([command(3, "snare", 1)]);
  sim.stepMany(2);
  const before = sim.serialize();
  for (const value of [-1, 1.5, NaN, Infinity, 4097, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => sim.stepMany(value));
    assert.equal(sim.serialize(), before);
  }
  sim.stepMany(4094);
  const atBound = sim.serialize();
  assert.throws(() => sim.step(), RangeError);
  assert.equal(sim.serialize(), atBound);
  assert.throws(() => sim.stepMany(1), RangeError);
  assert.equal(sim.serialize(), atBound);
});

test("snapshots reject noncanonical, duplicate, hostile, and oversized encodings", () => {
  const sim = encounter([command(1, "snare", 4)]);
  sim.stepMany(8);
  const serialized = sim.serialize();
  assert.equal(TimedMovementOnlySnareEncounter.restore(serialized).serialize(),
    serialized);
  assert.throws(() => TimedMovementOnlySnareEncounter.restore(null), TypeError);
  assert.throws(() => TimedMovementOnlySnareEncounter.restore("{"), TypeError);
  assert.throws(() => TimedMovementOnlySnareEncounter.restore(
    JSON.stringify(JSON.parse(serialized), null, 2),
  ), /canonical/u);
  assert.throws(() => TimedMovementOnlySnareEncounter.restore(
    serialized.replace('"version":1', '"version":1,"version":1'),
  ), /canonical/u);
  assert.throws(() => TimedMovementOnlySnareEncounter.restore(
    `{"__proto__":{},"identity":{},"state":{},"version":1}`,
  ), TypeError);
  assert.throws(() => TimedMovementOnlySnareEncounter.restore(
    " ".repeat(262145),
  ), RangeError);
});

test("forged remainder, status, target, cursor, history, and bounds reject", () => {
  const sim = encounter([
    command(0, "acquire-target", null, 3),
    command(5, "snare", 8),
  ]);
  sim.stepMany(40);
  const base = JSON.parse(sim.serialize());
  const forgeries = [
    (value) => { value.state.movementRemainder = 59; },
    (value) => { value.state.snaredThroughTick = 200; },
    (value) => { value.state.snareSourceId = 9; },
    (value) => { value.state.targetId = 99; },
    (value) => { value.state.commandIndex = 1; },
    (value) => { value.state.history[0].tick = 39; },
    (value) => { value.state.attackRemaining = 108; },
    (value) => { value.state.position = 1000001; },
    (value) => { value.state.pendingContacts = [{ remaining: 3,
      sequence: 1, targetId: 3 }]; },
  ];
  for (const forge of forgeries) {
    const value = structuredClone(base);
    forge(value);
    assert.throws(() => TimedMovementOnlySnareEncounter.restore(
      canonicalJson(value),
    ));
  }
});

test("snapshots are canonical causal state rather than trusted accumulated state", () => {
  const sim = encounter([
    command(0, "acquire-target", null, 7),
    command(6, "snare", 2),
  ]);
  sim.stepMany(230);
  const snapshot = JSON.parse(sim.serialize());
  assert.deepEqual(Object.keys(snapshot), ["identity", "state", "version"]);
  assert.equal(snapshot.state.tick, 230);
  assert.equal(snapshot.state.commandIndex, 2);
  assert.equal(snapshot.state.history.length, sim.replay.length);
  assert.equal(canonicalJson(snapshot), sim.serialize());
});

test("runtime has original identity and no benchmark import or deferred mechanics", async () => {
  const source = await readFile(
    new URL("../src/content/cards/special-combat-snare.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /tether-rider/u);
  assert.match(source, /Tether Rider/u);
  assert.doesNotMatch(source, /Ram Rider|ram-rider|reference\//u);
  assert.doesNotMatch(source,
    /Projectile|damage-applied|slow-applied|stun-applied|rage-applied|cleanse-applied/u);
  const sim = encounter([command(0, "snare", 1)]);
  sim.stepMany(100);
  assert.deepEqual([...new Set(sim.replay.map(({ type }) => type))].sort(),
    ["moved", "snare-applied", "snare-expired"]);
});
