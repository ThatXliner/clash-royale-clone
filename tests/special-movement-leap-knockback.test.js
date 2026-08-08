import assert from "node:assert/strict";
import test from "node:test";

import {
  LeapKnockbackRetargetEncounter,
  createLeapKnockbackFixture,
  createLeapKnockbackQuestionRecords,
} from "../src/content/cards/special-movement-leap-knockback.js";
import {
  JumpEncounter,
} from "../src/content/cards/special-movement-jump.js";

const command = (
  tick,
  type,
  { distance = null, source = null, targetId = null } = {},
) => ({ distance, source, targetId, tick, type });

function jumpOracle() {
  const events = [
    { targetId: 202, tick: 0, type: "target-acquired" },
    {
      from: { x: 3500, y: 11500 },
      targetId: 202,
      tick: 60,
      to: { x: 3500, y: 15500 },
      type: "jump-takeoff",
    },
    { targetable: false, tick: 60, type: "targetability-changed" },
  ];
  for (let elapsedTicks = 1; elapsedTicks <= 36; elapsedTicks += 1) {
    events.push({
      elapsedTicks,
      position: {
        x: 3500,
        y: 11500 + Math.trunc((4000 * elapsedTicks) / 36),
      },
      tick: 60 + elapsedTicks,
      type: "jump-move",
    });
  }
  events.push(
    { targetable: true, tick: 96, type: "targetability-changed" },
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
  );
  for (const targetId of [202, 203, 207]) {
    events.push({
      amount: 536, effectId: 1, targetId, tick: 96, type: "hit",
    });
  }
  for (const [targetId, currentHealthBefore, currentHealthAfter] of [
    [202, 1000, 464],
    [203, 536, 0],
    [207, 536, 0],
  ]) {
    events.push({
      amount: 536,
      currentHealthAfter,
      currentHealthBefore,
      targetId,
      tick: 96,
      type: "damage",
      effectId: 1,
    });
  }
  for (const targetId of [203, 207]) {
    events.push({
      effectId: 1,
      targetId,
      tick: 96,
      type: "death",
    });
  }
  events.push({ tick: 96, type: "encounter-complete" });
  return events;
}

test("leap composition: baseline preserves the literal jump snapshot, transit, and landing trace", () => {
  const sim = new LeapKnockbackRetargetEncounter();
  sim.stepMany(97);
  assert.deepEqual(sim.replay, jumpOracle());
  const prerequisite = new JumpEncounter();
  prerequisite.stepMany(97);
  assert.deepEqual(sim.replay, prerequisite.replay);
  assert.deepEqual(sim.state.position, { x: 3500, y: 15500 });
  assert.equal(sim.state.candidates.find(({ id }) => id === 202).health, 464);
  assert.equal(sim.state.candidates.find(({ id }) => id === 203).health, 0);
  assert.equal(sim.state.candidates.find(({ id }) => id === 207).health, 0);
});

test("leap composition: all absent coupling choices are separate fresh frozen QUESTIONS", () => {
  const first = createLeapKnockbackQuestionRecords();
  const second = createLeapKnockbackQuestionRecords();
  assert.equal(Object.keys(first).length, 20);
  assert.ok(Object.isFrozen(first));
  for (const [key, record] of Object.entries(first)) {
    assert.notStrictEqual(record, second[key]);
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
      source: "unsourced-leap-knockback-retarget-composition",
    });
    assert.ok(Object.isFrozen(record));
  }
  assert.throws(() => {
    first.commandPriority.value = "forged";
  }, TypeError);
  assert.throws(() => createLeapKnockbackQuestionRecords({}));
});

test("leap composition: prelaunch displacement changes only the snapshotted origin", () => {
  const sim = new LeapKnockbackRetargetEncounter(createLeapKnockbackFixture([
    command(30, "displace-jumper", {
      distance: 1000,
      source: { x: 3500, y: 10500 },
    }),
  ]));
  sim.stepMany(97);
  const takeoff = sim.replay.find(({ type }) => type === "jump-takeoff");
  assert.deepEqual(takeoff.from, { x: 3500, y: 12500 });
  assert.deepEqual(takeoff.to, { x: 3500, y: 15500 });
  assert.deepEqual(sim.state.position, { x: 3500, y: 15500 });
});

test("leap composition: every transit displacement cut interrupts before displacement and suppresses impact", () => {
  for (const tick of [61, 72, 95]) {
    const baseline = new LeapKnockbackRetargetEncounter();
    baseline.stepMany(tick);
    const expectedOrigin = baseline.state.position;
    const sim = new LeapKnockbackRetargetEncounter(createLeapKnockbackFixture([
      command(tick, "displace-jumper", {
        distance: 1000,
        source: { x: expectedOrigin.x, y: expectedOrigin.y - 1000 },
      }),
    ]));
    sim.stepMany(97);
    assert.deepEqual(
      sim.replay.filter(({ tick: at }) => at === tick).map(({ type }) => type),
      [
        "targetability-changed",
        "jump-interrupted",
        "external-forced-knockback",
      ],
      `tick ${tick}`,
    );
    assert.equal(sim.replay.some(({ type }) => type === "jump-landed"), false);
    assert.equal(sim.state.targetable, true);
  }
});

test("leap composition: interruption invalidation reacquires stable ID on the next boundary", () => {
  const sim = new LeapKnockbackRetargetEncounter(createLeapKnockbackFixture([
    command(80, "interrupt"),
    command(80, "invalidate-target", { targetId: 202 }),
    command(82, "restore-target", { targetId: 202 }),
  ]));
  sim.stepMany(83);
  assert.deepEqual(
    sim.replay.filter(({ tick }) => tick === 80).map(({ type }) => type),
    [
      "targetability-changed",
      "jump-interrupted",
      "candidate-targetability-changed",
    ],
  );
  assert.deepEqual(
    sim.replay.filter(({ type }) => type.startsWith("target-"))
      .map(({ targetId, tick, type }) => ({ targetId, tick, type })),
    [
      { targetId: 202, tick: 0, type: "target-acquired" },
      { targetId: 202, tick: 81, type: "target-lost" },
      { targetId: 203, tick: 81, type: "target-acquired" },
    ],
  );
  assert.deepEqual(
    sim.replay.filter(({ tick }) => tick === 82),
    [{
      targetId: 202,
      targetable: true,
      tick: 82,
      type: "candidate-targetability-changed",
    }],
  );
  assert.equal(sim.state.selectedTargetId, 203);
  assert.equal(sim.replay.some(({ type }) => type === "effect"), false);
  assert.equal(sim.state.candidates.find(({ id }) => id === 203).health, 536);
});

test("leap composition: forced-displacement interruption starts reachable restored target windup next boundary", () => {
  const sim = new LeapKnockbackRetargetEncounter(createLeapKnockbackFixture([
    command(70, "invalidate-target", { targetId: 202 }),
    command(80, "restore-target", { targetId: 202 }),
    command(80, "displace-jumper", {
      distance: 1000,
      source: { x: 3500, y: 12611 },
    }),
  ]));
  sim.stepMany(124);
  assert.deepEqual(
    sim.replay.filter(({ tick }) => tick === 80).map(({ type }) => type),
    [
      "candidate-targetability-changed",
      "targetability-changed",
      "jump-interrupted",
      "external-forced-knockback",
    ],
  );
  assert.deepEqual(sim.state.position, { x: 3500, y: 14611 });
  assert.deepEqual(
    sim.replay.filter(({ type }) =>
      type.startsWith("target-") || type === "attack-ready"
    ).map(({ sequence, targetId, tick, type }) => ({
      ...(sequence === undefined ? {} : { sequence }),
      targetId,
      tick,
      type,
    })),
    [
      { targetId: 202, tick: 0, type: "target-acquired" },
      { sequence: 1, targetId: 202, tick: 123, type: "attack-ready" },
    ],
  );
  assert.equal(sim.replay.some(({ type }) => type === "jump-landed"), false);
});

test("leap composition: airborne state is neither targetable nor attack-eligible", () => {
  const sim = new LeapKnockbackRetargetEncounter();
  sim.stepMany(80);
  assert.equal(sim.state.airborne, true);
  assert.equal(sim.state.targetable, false);
  assert.equal(sim.state.attack.targetId, null);
  assert.equal(sim.replay.some(({ type }) => type === "attack-ready"), false);
});

test("leap composition: landing-boundary jumper displacement resolves after exact impact", () => {
  const sim = new LeapKnockbackRetargetEncounter(createLeapKnockbackFixture([
    command(96, "displace-jumper", {
      distance: 1000,
      source: { x: 3500, y: 14500 },
    }),
  ]));
  sim.stepMany(97);
  const atLanding = sim.replay.filter(({ tick }) => tick === 96);
  assert.ok(atLanding.findIndex(({ type }) => type === "encounter-complete") <
    atLanding.findIndex(({ type }) => type === "external-forced-knockback"));
  assert.deepEqual(sim.state.position, { x: 3500, y: 16500 });
  assert.equal(sim.state.candidates.find(({ id }) => id === 203).health, 0);
});

test("leap composition: target displacement before takeoff changes the snapshotted destination", () => {
  const sim = new LeapKnockbackRetargetEncounter(createLeapKnockbackFixture([
    command(30, "displace-target", {
      distance: 1000,
      source: { x: 3500, y: 14500 },
      targetId: 202,
    }),
  ]));
  sim.stepMany(61);
  assert.deepEqual(
    sim.replay.find(({ type }) => type === "jump-takeoff").to,
    { x: 3500, y: 16500 },
  );
});

test("leap composition: transit target displacement leaves destination snapshotted", () => {
  const sim = new LeapKnockbackRetargetEncounter(createLeapKnockbackFixture([
    command(70, "displace-target", {
      distance: 1000,
      source: { x: 3500, y: 14500 },
      targetId: 202,
    }),
  ]));
  sim.stepMany(97);
  assert.deepEqual(sim.state.position, { x: 3500, y: 15500 });
  assert.deepEqual(
    sim.state.candidates.find(({ id }) => id === 202).position,
    { x: 3500, y: 16500 },
  );
});

test("leap composition: target displacement on landing is command-first for area eligibility", () => {
  const sim = new LeapKnockbackRetargetEncounter(createLeapKnockbackFixture([
    command(96, "displace-target", {
      distance: 2000,
      source: { x: 3500, y: 14500 },
      targetId: 202,
    }),
  ]));
  sim.stepMany(97);
  assert.equal(sim.state.candidates.find(({ id }) => id === 202).health, 1000);
  assert.equal(
    sim.replay.some(({ type, targetId }) =>
      type === "hit" && targetId === 202
    ),
    false,
  );
});

test("leap composition: airborne target invalidation excludes impact without moving the snapshot", () => {
  const sim = new LeapKnockbackRetargetEncounter(createLeapKnockbackFixture([
    command(70, "invalidate-target", { targetId: 202 }),
  ]));
  sim.stepMany(97);
  assert.deepEqual(sim.state.position, { x: 3500, y: 15500 });
  assert.equal(sim.state.candidates.find(({ id }) => id === 202).health, 1000);
  assert.equal(sim.state.targetable, true);
});

test("leap composition: restoration at every transit cut re-enables the snapshotted target", () => {
  for (const cut of [61, 80, 95, 96]) {
    const sim = new LeapKnockbackRetargetEncounter(createLeapKnockbackFixture([
      command(61, "invalidate-target", { targetId: 202 }),
      command(cut, "restore-target", { targetId: 202 }),
    ]));
    sim.stepMany(97);
    assert.equal(
      sim.state.candidates.find(({ id }) => id === 202).health,
      464,
      `cut ${cut}`,
    );
  }
});

test("leap composition: landing invalidation reacquires stable ID next boundary with full windup", () => {
  const sim = new LeapKnockbackRetargetEncounter(createLeapKnockbackFixture([
    command(96, "invalidate-target", { targetId: 202 }),
  ]));
  sim.stepMany(140);
  assert.deepEqual(
    sim.replay.filter(({ type }) => type.startsWith("target-"))
      .map(({ targetId, tick, type }) => ({ targetId, tick, type })),
    [
      { targetId: 202, tick: 0, type: "target-acquired" },
      { targetId: 202, tick: 97, type: "target-lost" },
      { targetId: 204, tick: 97, type: "target-acquired" },
    ],
  );
  assert.deepEqual(
    sim.replay.filter(({ type }) => type === "attack-ready")
      .map(({ targetId, tick }) => ({ targetId, tick })),
    [{ targetId: 204, tick: 139 }],
  );
});

test("leap composition: exact projection covers signed axes, diagonals, and arena clamps", () => {
  const cases = [
    [{ x: 3500, y: 10500 }, 1000, { x: 3500, y: 12500 }],
    [{ x: 2500, y: 11500 }, 1000, { x: 4500, y: 11500 }],
    [{ x: 500, y: 7500 }, 5000, { x: 6500, y: 15500 }],
    [{ x: 3500, y: 12500 }, 20000, { x: 3500, y: 0 }],
  ];
  for (const [source, distance, expected] of cases) {
    const sim = new LeapKnockbackRetargetEncounter(createLeapKnockbackFixture([
      command(30, "displace-jumper", { distance, source }),
    ]));
    sim.stepMany(31);
    assert.deepEqual(sim.state.position, expected);
  }
  for (const [dx, dy] of [
    [3000, 4000],
    [3000, -4000],
    [-3000, 4000],
    [-3000, -4000],
    [4000, 3000],
    [4000, -3000],
    [-4000, 3000],
    [-4000, -3000],
  ]) {
    const sim = new LeapKnockbackRetargetEncounter(createLeapKnockbackFixture([
      command(30, "displace-jumper", {
        distance: 5500,
        source: { x: 2500, y: 11500 },
      }),
      command(30, "displace-jumper", {
        distance: 4500,
        source: { x: 9000, y: 10500 },
      }),
      command(30, "displace-jumper", {
        distance: 5000,
        source: { x: 9000 - dx, y: 16000 - dy },
      }),
    ]));
    sim.stepMany(31);
    assert.deepEqual(sim.state.position, {
      x: 9000 + dx,
      y: 16000 + dy,
    }, `${dx},${dy}`);
  }
});

test("leap composition: arbitrary chunks and two fresh runs are byte/event identical", () => {
  const setup = createLeapKnockbackFixture([
    command(70, "invalidate-target", { targetId: 202 }),
    command(80, "restore-target", { targetId: 202 }),
  ]);
  const one = new LeapKnockbackRetargetEncounter(setup);
  const two = new LeapKnockbackRetargetEncounter(setup);
  const chunks = new LeapKnockbackRetargetEncounter(setup);
  one.stepMany(200);
  two.stepMany(200);
  for (const count of [1, 59, 0, 1, 9, 11, 16, 1, 42, 60]) {
    chunks.stepMany(count);
  }
  assert.equal(chunks.state.tick, 200);
  assert.deepEqual(chunks.replay, one.replay);
  assert.deepEqual(two.replay, one.replay);
  assert.equal(chunks.serialize(), one.serialize());
  assert.equal(two.serialize(), one.serialize());
});

test("leap composition: restore is byte-identical at every causal cut", () => {
  const setup = createLeapKnockbackFixture([
    command(70, "invalidate-target", { targetId: 202 }),
    command(80, "restore-target", { targetId: 202 }),
  ]);
  for (let cut = 0; cut <= 200; cut += 1) {
    const original = new LeapKnockbackRetargetEncounter(setup);
    original.stepMany(cut);
    const bytes = original.serialize();
    const restored = LeapKnockbackRetargetEncounter.restore(bytes);
    assert.equal(restored.serialize(), bytes, `bytes ${cut}`);
    original.stepMany(200 - cut);
    restored.stepMany(200 - cut);
    assert.equal(restored.serialize(), original.serialize(), `end ${cut}`);
    assert.deepEqual(restored.replay, original.replay, `replay ${cut}`);
  }
});

test("leap composition: hostile input, bounds, and forged snapshots reject atomically", () => {
  const hostile = command(1, "interrupt");
  Object.defineProperty(hostile, "tick", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  assert.throws(() => createLeapKnockbackFixture([hostile]), /invalid shape/u);
  const sparse = Array(1);
  assert.throws(() => createLeapKnockbackFixture(sparse));
  assert.throws(() => createLeapKnockbackFixture([
    { ...command(1, "interrupt"), extra: true },
  ]));
  assert.throws(() => createLeapKnockbackFixture(
    Array.from({ length: 33 }, (_, tick) => command(tick, "interrupt")),
  ));
  assert.throws(() => createLeapKnockbackFixture([
    command(2, "interrupt"),
    command(1, "interrupt"),
  ]));
  assert.throws(() => createLeapKnockbackFixture([
    command(96, "displace-jumper", {
      distance: 1000,
      source: { x: 3500, y: 14500 },
    }),
    command(96, "invalidate-target", { targetId: 202 }),
  ]), /pre-impact commands must precede/u);

  const sim = new LeapKnockbackRetargetEncounter();
  sim.stepMany(10);
  const before = sim.serialize();
  assert.throws(() => sim.stepMany(191), /tick bound/u);
  assert.equal(sim.serialize(), before);

  const atomic = new LeapKnockbackRetargetEncounter(
    createLeapKnockbackFixture([
      command(10, "displace-jumper", {
        distance: 1000,
        source: { x: 3500, y: 10500 },
      }),
      command(10, "displace-jumper", {
        distance: 1,
        source: { x: 3497, y: 12496 },
      }),
    ]),
  );
  atomic.stepMany(10);
  const atomicBefore = atomic.serialize();
  assert.throws(() => atomic.step(), /exact integer components/u);
  assert.equal(atomic.serialize(), atomicBefore);
  assert.throws(() => sim.stepMany(-1));
  assert.equal(sim.serialize(), before);

  const parsed = JSON.parse(before);
  assert.throws(() =>
    LeapKnockbackRetargetEncounter.restore(` ${before}`), /canonical/u
  );
  assert.throws(() => LeapKnockbackRetargetEncounter.restore(
    JSON.stringify({ ...parsed, forged: true }),
  ));
  assert.throws(() => LeapKnockbackRetargetEncounter.restore(
    before.replace('"version":1', '"version":2'),
  ));
  assert.throws(() => LeapKnockbackRetargetEncounter.restore(
    `{"padding":"${"x".repeat(65_536)}"}`,
  ));
  assert.throws(() => LeapKnockbackRetargetEncounter.restore({}));
});
