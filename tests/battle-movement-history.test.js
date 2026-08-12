import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BATTLE_MOVEMENT_MODES,
  BattleMovement,
  MAX_BATTLE_MOVEMENT_STEP_TICKS,
} from "../src/sim/battle-movement.js";

const MAX_COMMANDS = 1_024;
const MAX_TICK = 18_000;
const MAX_SNAPSHOT_BYTES = 262_144;

function destination(position, radius = 0, range = 0) {
  return { position, radius, range };
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function rawSnapshot(mover) {
  return { state: mover.state, version: 1 };
}

function bytes(snapshot) {
  return JSON.stringify(snapshot);
}

function assertRejectsSnapshot(snapshot, message = /(?:canonical|reachable|invalid|bound|shape|segment|point)/u) {
  assert.throws(() => BattleMovement.restore(bytes(snapshot)), message);
}

function assertRestores(mover, label) {
  const snapshot = mover.serialize();
  const restored = BattleMovement.restore(snapshot);
  assert.equal(restored.serialize(), snapshot, label);
  assert.deepEqual(restored.state, mover.state, label);
  return restored;
}

function makeAirJourney() {
  const mover = new BattleMovement({
    bodyRadius: 150,
    mode: BATTLE_MOVEMENT_MODES.air,
    position: { x: 4_000, y: 5_000 },
    speed: 1_000,
  });
  mover.setTarget(destination({ x: 13_000, y: 19_000 }, 200, 300));
  return mover;
}

function makeGroundJourney() {
  const mover = new BattleMovement({
    bodyRadius: 600,
    mode: BATTLE_MOVEMENT_MODES.ground,
    position: { x: 8_500, y: 10_500 },
    speed: 1_500,
  });
  mover.setTarget(destination({ x: 8_500, y: 21_500 }, 100, 100));
  return mover;
}

function groundCommand(mover) {
  switch (mover.state.tick) {
    case 37:
      return mover.setTarget(destination({ x: 14_500, y: 22_500 }, 100, 200));
    case 83:
      return mover.stop();
    case 100:
      return mover.setTarget(destination({ x: 3_500, y: 22_500 }, 200, 100));
    default:
      return [];
  }
}

function airCommand(mover) {
  switch (mover.state.tick) {
    case 29:
      return mover.setTarget(destination({ x: 2_000, y: 18_000 }, 100, 200));
    case 71:
      return mover.stop();
    case 88:
      return mover.setTarget(destination({ x: 15_000, y: 7_000 }, 250, 150));
    default:
      return [];
  }
}

function advance(mover, ticks, chunked = false) {
  if (!chunked) return mover.stepMany(ticks);
  const events = [];
  for (const chunk of [1, 7, 19, 43, 101, 257]) {
    if (ticks <= 0) break;
    const count = Math.min(chunk, ticks);
    events.push(...mover.stepMany(count));
    ticks -= count;
  }
  if (ticks > 0) events.push(...mover.stepMany(ticks));
  return events;
}

function driveTo(mover, endTick, commandAt, commandTicks, chunked = false, includeCurrent = true) {
  const events = [];
  let applyCurrent = includeCurrent;
  while (true) {
    if (applyCurrent) events.push(...commandAt(mover));
    if (mover.state.tick === endTick) break;
    const nextCommand = commandTicks.find((tick) => tick > mover.state.tick);
    const next = Math.min(endTick, nextCommand ?? endTick);
    events.push(...advance(mover, next - mover.state.tick, chunked));
    applyCurrent = true;
  }
  return events;
}

function authority(state) {
  const copyState = copy(state);
  copyState.commands = [];
  return JSON.stringify(copyState);
}

function commandSequenceCompare(left, right) {
  if (left.length !== right.length) return left.length - right.length;
  const leftBytes = JSON.stringify(left);
  const rightBytes = JSON.stringify(right);
  return leftBytes < rightBytes ? -1 : leftBytes > rightBytes ? 1 : 0;
}

function replayCommands(configuration, commands, tick) {
  const mover = new BattleMovement(configuration);
  for (const command of commands) {
    mover.stepMany(command.tick - mover.state.tick);
    if (command.kind === "stop") mover.stop();
    else mover.setTarget(command.target);
  }
  mover.stepMany(tick - mover.state.tick);
  return mover;
}

function shortestSubsequence(configuration, commands, tick, expectedAuthority) {
  let best = null;
  for (let mask = 0; mask < 2 ** commands.length; mask += 1) {
    const candidate = commands.filter((_, index) => (mask & (2 ** index)) !== 0);
    if (authority(replayCommands(configuration, candidate, tick).state) !== expectedAuthority) {
      continue;
    }
    if (best === null || commandSequenceCompare(candidate, best) < 0) best = candidate;
  }
  return best;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 2 ** 32;
  };
}

test("battle movement history: critic cross-tick case is rejected and live serialization is canonical", () => {
  const target = destination({ x: 14_000, y: 23_000 });
  const mover = new BattleMovement({
    mode: "air",
    position: { x: 1_000, y: 1_000 },
    speed: 60,
  });
  for (const tick of [0, 5, 10, 20]) {
    mover.stepMany(tick - mover.state.tick);
    mover.setTarget(target);
  }
  const longer = rawSnapshot(mover);
  assert.deepEqual(longer.state.commands.map(({ tick }) => tick), [0, 5, 10, 20]);
  assertRejectsSnapshot(longer, /canonical/u);

  const canonical = mover.serialize();
  assert.deepEqual(JSON.parse(canonical).state.commands.map(({ tick }) => tick), [0, 5, 20]);
  const restored = BattleMovement.restore(canonical);
  assert.equal(restored.serialize(), canonical);
  assert.deepEqual(restored.state, mover.state);
});

test("battle movement history: changing-position redundancy covers signed air and bridge ground paths", () => {
  const cases = [
    {
      configuration: {
        mode: "air",
        position: { x: 16_000, y: 12_000 },
        speed: 750,
      },
      commands: [
        { kind: "target", target: destination({ x: 2_000, y: 12_000 }), tick: 0 },
        { kind: "target", target: destination({ x: 2_000, y: 12_000 }), tick: 1 },
        { kind: "target", target: destination({ x: 2_000, y: 12_000 }), tick: 3 },
        { kind: "target", target: destination({ x: 15_000, y: 5_000 }), tick: 4 },
      ],
      tick: 24,
    },
    {
      configuration: {
        bodyRadius: 600,
        mode: "ground",
        position: { x: 8_500, y: 10_500 },
        speed: 1_500,
      },
      commands: [
        { kind: "target", target: destination({ x: 8_500, y: 21_500 }, 100, 100), tick: 0 },
        { kind: "target", target: destination({ x: 8_500, y: 21_500 }, 100, 100), tick: 1 },
        { kind: "target", target: destination({ x: 8_500, y: 21_500 }, 100, 100), tick: 2 },
        { kind: "target", target: destination({ x: 14_500, y: 22_500 }, 100, 100), tick: 3 },
      ],
      tick: 23,
    },
  ];
  for (const { configuration, commands, tick } of cases) {
    const full = replayCommands(configuration, commands, tick);
    const expectedAuthority = authority(full.state);
    const shortest = shortestSubsequence(configuration, commands, tick, expectedAuthority);
    assert.ok(shortest.length < commands.length);
    const hostile = copy(rawSnapshot(full));
    hostile.state.commands = copy(commands);
    assertRejectsSnapshot(hostile, /canonical/u);
    assert.deepEqual(JSON.parse(full.serialize()).state.commands, shortest);
    assert.equal(authority(BattleMovement.restore(full.serialize()).state), expectedAuthority);
  }
});

test("battle movement history: arrival and A-to-B-to-A reductions preserve the final continuation", () => {
  const arrivalConfiguration = {
    mode: "air",
    position: { x: 5_000, y: 5_000 },
    speed: 1_000,
  };
  const arrivalTarget = destination({ x: 5_000, y: 10_000 });
  const arrivalCommands = [
    { kind: "target", target: arrivalTarget, tick: 0 },
    { kind: "target", target: arrivalTarget, tick: 400 },
  ];
  const arrived = replayCommands(arrivalConfiguration, arrivalCommands, 450);
  const arrivedAuthority = authority(arrived.state);
  const arrivedShortest = shortestSubsequence(
    arrivalConfiguration,
    arrivalCommands,
    450,
    arrivedAuthority,
  );
  assert.deepEqual(arrivedShortest.map(({ tick }) => tick), [0]);
  const arrivedHostile = copy(rawSnapshot(arrived));
  arrivedHostile.state.commands = copy(arrivalCommands);
  assertRejectsSnapshot(arrivedHostile, /canonical/u);
  assert.deepEqual(JSON.parse(arrived.serialize()).state.commands, arrivedShortest);

  const loopConfiguration = {
    mode: "air",
    position: { x: 1_000, y: 1_000 },
    speed: 1_000,
  };
  const pointA = destination({ x: 14_000, y: 23_000 });
  const pointB = destination({ x: 2_000, y: 2_000 });
  const loopCommands = [
    { kind: "target", target: pointA, tick: 0 },
    { kind: "target", target: pointB, tick: 1 },
    { kind: "target", target: pointA, tick: 86 },
  ];
  const loop = replayCommands(loopConfiguration, loopCommands, 87);
  const loopAuthority = authority(loop.state);
  const loopShortest = shortestSubsequence(loopConfiguration, loopCommands, 87, loopAuthority);
  assert.equal(loopShortest.length, 2);
  const loopHostile = copy(rawSnapshot(loop));
  loopHostile.state.commands = copy(loopCommands);
  assertRejectsSnapshot(loopHostile, /canonical/u);
  assert.deepEqual(JSON.parse(loop.serialize()).state.commands, loopShortest);
});

test("battle movement history: joint redundancy reaches one shortest lexicographic fixed point", () => {
  const targets = [
    destination({ x: 3_500, y: 22_500 }, 200, 100),
    destination({ x: 15_000, y: 5_000 }),
    destination({ x: 2_000, y: 2_000 }),
    destination({ x: 5_000, y: 25_000 }),
    destination({ x: 14_000, y: 23_000 }),
  ];
  const configuration = { mode: "air", position: { x: 1_000, y: 1_000 }, speed: 600 };
  const commands = [
    { kind: "target", target: targets[0], tick: 1 },
    { kind: "target", target: targets[0], tick: 2 },
    { kind: "stop", tick: 2 },
    { kind: "stop", tick: 2 },
    { kind: "target", target: targets[3], tick: 3 },
    { kind: "target", target: targets[1], tick: 5 },
    { kind: "stop", tick: 5 },
    { kind: "target", target: targets[4], tick: 7 },
  ];
  const full = replayCommands(configuration, commands, 8);
  const expectedAuthority = authority(full.state);
  const shortest = shortestSubsequence(configuration, commands, 8, expectedAuthority);
  assert.deepEqual(shortest.map(({ kind, tick }) => ({ kind, tick })), [
    { kind: "target", tick: 2 },
    { kind: "target", tick: 3 },
    { kind: "stop", tick: 5 },
    { kind: "target", tick: 7 },
  ]);

  const hostile = copy(rawSnapshot(full));
  hostile.state.commands = commands;
  assertRejectsSnapshot(hostile, /canonical/u);
  const accepted = copy(hostile);
  accepted.state.commands = shortest;
  const restored = BattleMovement.restore(bytes(accepted));
  assert.equal(restored.serialize(), bytes(accepted));
  assert.equal(authority(restored.state), expectedAuthority);
});

test("battle movement history: seeded exhaustive subsequences choose the independent shortest representative", () => {
  const targets = [
    destination({ x: 14_000, y: 23_000 }),
    destination({ x: 2_000, y: 2_000 }),
    destination({ x: 15_000, y: 5_000 }, 100, 200),
    destination({ x: 5_000, y: 25_000 }, 200, 100),
  ];
  const configuration = { mode: "air", position: { x: 1_000, y: 1_000 }, speed: 600 };
  const random = seededRandom(0x5eed_001);
  for (let trial = 0; trial < 1_000; trial += 1) {
    const count = 1 + Math.floor(random() * 7);
    const commands = [];
    let tick = 0;
    for (let index = 0; index < count; index += 1) {
      tick += 1 + Math.floor(random() * 3);
      commands.push(random() < 0.2
        ? { kind: "stop", tick }
        : {
            kind: "target",
            target: copy(targets[Math.floor(random() * targets.length)]),
            tick,
          });
    }
    const horizon = tick + Math.floor(random() * 5);
    const full = replayCommands(configuration, commands, horizon);
    const expectedAuthority = authority(full.state);
    const expected = shortestSubsequence(configuration, commands, horizon, expectedAuthority);
    assert.deepEqual(
      JSON.parse(full.serialize()).state.commands,
      expected,
      `seeded history ${trial}`,
    );
  }
});

test("battle movement history: semantic admission has no guessed-position canonicalization gate", () => {
  const source = readFileSync(new URL("../src/sim/battle-continuation-kernel.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /mayHaveCrossTickRedundancy/u);
  assert.doesNotMatch(source, /priorCommandPosition/u);
});

test("battle movement history: same-tick overrides and duplicate stop/target forms are not admitted", () => {
  const targetA = destination({ x: 6_000, y: 6_000 });
  const targetB = destination({ x: 13_000, y: 13_000 });
  const source = new BattleMovement({
    mode: "air",
    position: { x: 1_000, y: 1_000 },
    speed: 1_000,
  });
  source.setTarget(targetA);
  source.setTarget(targetB);
  const canonical = rawSnapshot(source);
  assert.equal(canonical.state.commands.length, 1);
  assert.deepEqual(canonical.state.commands[0].target, targetB);

  const overridden = copy(canonical);
  overridden.state.commands = [
    { kind: "target", target: targetA, tick: 0 },
    { kind: "target", target: targetB, tick: 0 },
  ];
  assertRejectsSnapshot(overridden);

  const duplicateTarget = copy(canonical);
  duplicateTarget.state.commands = [
    { kind: "target", target: targetB, tick: 0 },
    { kind: "target", target: targetB, tick: 0 },
  ];
  assertRejectsSnapshot(duplicateTarget);

  const idle = new BattleMovement({
    mode: "air",
    position: { x: 1_000, y: 1_000 },
    speed: 0,
  });
  const stopSnapshot = copy(rawSnapshot(idle));
  stopSnapshot.state.commands = [
    { kind: "stop", tick: 0 },
    { kind: "stop", tick: 0 },
  ];
  assertRejectsSnapshot(stopSnapshot);

  const targetThenStop = copy(rawSnapshot(idle));
  targetThenStop.state.commands = [
    { kind: "target", target: targetA, tick: 0 },
    { kind: "stop", tick: 0 },
  ];
  assertRejectsSnapshot(targetThenStop);
});

test("battle movement history: later target/stop commands are removed only when full authoritative omission is equal", () => {
  const speedZero = new BattleMovement({
    mode: "air",
    position: { x: 2_000, y: 2_000 },
    speed: 0,
  });
  speedZero.setTarget(destination({ x: 13_000, y: 22_000 }));
  speedZero.stepMany(17);
  speedZero.stop();
  const redundant = copy(rawSnapshot(speedZero));
  redundant.state.commands = [
    { kind: "target", target: destination({ x: 13_000, y: 22_000 }), tick: 0 },
    { kind: "stop", tick: 17 },
  ];
  assert.deepEqual(redundant.state.commands.map(({ kind, tick }) => ({ kind, tick })), [
    { kind: "target", tick: 0 },
    { kind: "stop", tick: 17 },
  ]);
  assertRejectsSnapshot(redundant);
  assert.deepEqual(JSON.parse(speedZero.serialize()).state.commands, []);

  const inBar = new BattleMovement({
    mode: "air",
    position: { x: 5_000, y: 5_000 },
    speed: 1_000,
  });
  const near = destination({ x: 5_100, y: 5_000 }, 100, 50);
  inBar.setTarget(near);
  inBar.stepMany(9);
  inBar.setTarget(near);
  const duplicateLater = copy(rawSnapshot(inBar));
  duplicateLater.state.commands = [
    { kind: "target", target: near, tick: 0 },
    { kind: "target", target: near, tick: 9 },
  ];
  assertRejectsSnapshot(duplicateLater);
});

test("battle movement history: same-target retarget after movement preserves route/remainder causality", () => {
  for (const [mode, start, end, speed] of [
    ["air", { x: 1_000, y: 1_000 }, { x: 14_000, y: 23_000 }, 1_000],
    ["ground", { x: 8_500, y: 10_500 }, { x: 8_500, y: 21_500 }, 1_500],
  ]) {
    const mover = new BattleMovement({ mode, position: start, speed });
    const target = destination(end, 100, 100);
    mover.setTarget(target);
    mover.stepMany(mode === "air" ? 1 : 37);
    const beforeRetarget = mover.state;
    mover.setTarget(target);
    const afterRetarget = mover.state;
    assert.equal(afterRetarget.commands.length, 2);
    assert.equal(afterRetarget.target.position.x, end.x);
    assert.equal(afterRetarget.remainder, 0);
    assert.notDeepEqual(
      {
        remainder: beforeRetarget.remainder,
        routeIndex: beforeRetarget.routeIndex,
        segmentProgress: beforeRetarget.segmentProgress,
      },
      {
        remainder: afterRetarget.remainder,
        routeIndex: afterRetarget.routeIndex,
        segmentProgress: afterRetarget.segmentProgress,
      },
    );
    assertRestores(mover, `${mode} causal retarget`);
  }
});

test("battle movement history: omitted, altered, forged, duplicated, and reordered histories fail atomically", () => {
  const mover = makeAirJourney();
  mover.stepMany(29);
  mover.setTarget(destination({ x: 2_000, y: 18_000 }, 100, 200));
  mover.stepMany(42);
  mover.stop();
  mover.stepMany(17);
  mover.setTarget(destination({ x: 15_000, y: 7_000 }, 250, 150));
  const before = mover.serialize();
  const canonical = JSON.parse(before);

  const omitted = copy(canonical);
  omitted.state.commands.splice(1, 1);
  assertRejectsSnapshot(omitted, /reachable|canonical/u);

  const forged = copy(canonical);
  forged.state.position.x += 1;
  assertRejectsSnapshot(forged, /reachable|canonical|segment/u);

  const alteredTarget = copy(canonical);
  alteredTarget.state.commands[1].target.position.x += 1_000;
  assertRejectsSnapshot(alteredTarget, /reachable|canonical/u);

  const alteredKind = copy(canonical);
  alteredKind.state.commands[1] = { kind: "stop", tick: alteredKind.state.commands[1].tick };
  assertRejectsSnapshot(alteredKind, /reachable|canonical/u);

  const alteredTick = copy(canonical);
  alteredTick.state.commands[1].tick -= 1;
  assertRejectsSnapshot(alteredTick, /reachable|canonical/u);

  const duplicate = copy(canonical);
  duplicate.state.commands.splice(2, 0, copy(duplicate.state.commands[1]));
  assertRejectsSnapshot(duplicate, /reachable|canonical/u);

  const reordered = copy(canonical);
  reordered.state.commands.reverse();
  assertRejectsSnapshot(reordered, /tick|canonical|reachable/u);
  assert.equal(mover.serialize(), before);
});

test("battle movement history: ground bridge provenance and signed air movement restore as one authority", () => {
  const ground = makeGroundJourney();
  ground.stepMany(39);
  const groundState = ground.state;
  assert.ok(groundState.route.some((point) => point.x === 3_500));
  assert.ok(groundState.route.some((point) => point.y === 15_500));
  assert.ok(groundState.routeIndex > 0);
  assert.ok(groundState.anchor !== null);
  assert.ok(groundState.edgeStart !== null);
  const groundRestored = assertRestores(ground, "ground bridge provenance");
  assert.deepEqual(groundRestored.state.route, groundState.route);
  assert.deepEqual(groundRestored.state.anchor, groundState.anchor);
  assert.deepEqual(groundRestored.state.edgeStart, groundState.edgeStart);

  for (const [startX, endX] of [[16_000, 2_000], [2_000, 16_000]]) {
    const air = new BattleMovement({
      mode: "air",
      position: { x: startX, y: 12_000 },
      speed: 750,
    });
    air.setTarget(destination({ x: endX, y: 12_000 }));
    air.stepMany(60);
    const restored = assertRestores(air, `signed air ${startX} to ${endX}`);
    assert.equal(restored.state.position.x, startX + (endX < startX ? -750 : 750));
    assert.equal(restored.state.position.y, 12_000);
  }

  const forged = copy(rawSnapshot(ground));
  forged.state.routeIndex += 1;
  assertRejectsSnapshot(forged, /reachable|canonical ground path/u);
});

test("battle movement history: idle, active, arrived, in-bar, speed-zero, and stop/restart states are canonical", () => {
  const idle = new BattleMovement({
    mode: "air",
    position: { x: 1_000, y: 1_000 },
    speed: 1_000,
  });
  assertRestores(idle, "idle");

  const active = new BattleMovement({
    mode: "air",
    position: { x: 1_000, y: 1_000 },
    speed: 1_000,
  });
  active.setTarget(destination({ x: 15_000, y: 25_000 }));
  active.stepMany(3);
  assertRestores(active, "active");

  const arrived = new BattleMovement({
    mode: "air",
    position: { x: 5_000, y: 5_000 },
    speed: 1_500,
  });
  arrived.setTarget(destination({ x: 5_200, y: 5_200 }, 100, 100));
  arrived.stepMany(100);
  assert.equal(arrived.state.route.length, 0);
  assertRestores(arrived, "arrived");

  const inBar = new BattleMovement({
    mode: "air",
    position: { x: 5_000, y: 5_000 },
    speed: 1_500,
  });
  inBar.setTarget(destination({ x: 5_100, y: 5_000 }, 100, 100));
  assert.equal(inBar.state.route.length, 0);
  assertRestores(inBar, "in bar");

  const speedZero = new BattleMovement({
    mode: "air",
    position: { x: 5_000, y: 5_000 },
    speed: 0,
  });
  speedZero.setTarget(destination({ x: 15_000, y: 25_000 }));
  speedZero.stepMany(100);
  assertRestores(speedZero, "speed zero");

  const restart = new BattleMovement({
    mode: "ground",
    position: { x: 3_500, y: 10_500 },
    speed: 1_000,
  });
  restart.setTarget(destination({ x: 3_500, y: 22_500 }));
  restart.stepMany(17);
  restart.stop();
  restart.setTarget(destination({ x: 14_500, y: 22_500 }));
  assertRestores(restart, "stop/restart");
});

test("battle movement history: every representative live cut restores bytes and continuation events", () => {
  for (const [make, commandAt, horizon] of [
    [makeGroundJourney, groundCommand, 120],
    [makeAirJourney, airCommand, 100],
  ]) {
    for (let cut = 0; cut <= horizon; cut += 5) {
      const original = make();
      const commandTicks = commandAt === groundCommand ? [37, 83, 100] : [29, 71, 88];
      driveTo(original, cut, commandAt, commandTicks);
      const snapshot = original.serialize();
      const restored = BattleMovement.restore(snapshot);
      assert.equal(restored.serialize(), snapshot, `cut ${cut} bytes`);
      assert.deepEqual(restored.state, original.state, `cut ${cut} state`);

      const originalEvents = driveTo(original, horizon, commandAt, commandTicks, false, false);
      const restoredEvents = driveTo(restored, horizon, commandAt, commandTicks, true, false);
      assert.deepEqual(restoredEvents, originalEvents, `cut ${cut} events`);
      assert.deepEqual(restored.state, original.state, `cut ${cut} continuation`);
      assert.equal(restored.serialize(), original.serialize(), `cut ${cut} final bytes`);
    }
  }
});

test("battle movement history: MAX_COMMANDS, MAX_TICK, and byte bounds remain fixed", () => {
  const mover = new BattleMovement({
    mode: "air",
    position: { x: 8_000, y: 12_000 },
    speed: 100,
  });
  const targets = [
    destination({ x: 15_000, y: 25_000 }),
    destination({ x: 2_000, y: 2_000 }),
  ];
  for (let index = 0; index < MAX_COMMANDS; index += 1) {
    mover.setTarget(targets[index % targets.length]);
    if (index + 1 < MAX_COMMANDS) mover.stepMany(17);
  }
  assert.equal(mover.state.commands.length, MAX_COMMANDS);
  const atCommandBound = mover.serialize();
  assert.ok(new TextEncoder().encode(atCommandBound).byteLength <= MAX_SNAPSHOT_BYTES);
  const beforeRejectedCommand = mover.serialize();
  assert.throws(() => mover.setTarget(targets[0]), /command bound/u);
  assert.equal(mover.serialize(), beforeRejectedCommand);
  assertRestores(mover, "MAX_COMMANDS");

  const maxTick = new BattleMovement({
    mode: "air",
    position: { x: 8_000, y: 12_000 },
    speed: 0,
  });
  maxTick.stepMany(MAX_TICK);
  const maxTickBytes = maxTick.serialize();
  assertRestores(maxTick, "MAX_TICK");
  assert.throws(() => maxTick.stepMany(1), /tick bound/u);
  assert.equal(maxTick.serialize(), maxTickBytes);

  assert.throws(
    () => BattleMovement.restore("x".repeat(MAX_SNAPSHOT_BYTES + 1)),
    /byte bound/u,
  );
});

test("battle movement history: hostile depth, shape, accessors, callables, and revoked proxies never execute callbacks", () => {
  const mover = makeAirJourney();
  mover.stepMany(4);
  const before = mover.serialize();

  const deep = JSON.parse(before);
  let nested = 0;
  for (let index = 0; index < 80; index += 1) nested = { value: nested };
  deep.state.position.x = nested;
  assertRejectsSnapshot(deep, /depth|number|point|reachable|shape/u);

  const extraKey = JSON.parse(before);
  extraKey.state.extra = 1;
  assertRejectsSnapshot(extraKey, /shape/u);

  const sparseCommand = JSON.parse(before);
  sparseCommand.state.commands = [{ kind: "stop", tick: 0, extra: 1 }];
  assertRejectsSnapshot(sparseCommand, /shape/u);

  let configGetterCalls = 0;
  const config = {
    mode: "air",
    position: { x: 1_000, y: 1_000 },
  };
  Object.defineProperty(config, "speed", {
    enumerable: true,
    get() {
      configGetterCalls += 1;
      return 1_000;
    },
  });
  assert.throws(() => new BattleMovement(config), /enumerable data property/u);
  assert.equal(configGetterCalls, 0);

  let targetGetterCalls = 0;
  const targetWithGetter = {
    position: { x: 2_000, y: 2_000 },
    radius: 0,
    range: 0,
  };
  Object.defineProperty(targetWithGetter, "range", {
    enumerable: true,
    get() {
      targetGetterCalls += 1;
      return 0;
    },
  });
  assert.throws(() => mover.setTarget(targetWithGetter), /enumerable data property/u);
  assert.equal(targetGetterCalls, 0);

  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const hostile of [{}, function callable() {}, new Proxy({}, {}), revoked.proxy]) {
    assert.throws(() => BattleMovement.restore(hostile), /serialized battle movement/u);
  }
  assert.equal(mover.serialize(), before);
});

test("battle movement history: canonical JSON, fresh frozen state, and deterministic runs are stable", () => {
  function fresh() {
    const mover = new BattleMovement({
      mode: "air",
      position: { x: 2_000, y: 3_000 },
      speed: 750,
    });
    mover.setTarget(destination({ x: 15_000, y: 27_000 }, 200, 300));
    mover.stepMany(257);
    return mover;
  }

  const left = fresh();
  const right = fresh();
  assert.equal(left.serialize(), right.serialize());
  assert.deepEqual(left.state, right.state);
  const first = left.state;
  const second = left.state;
  assert.notEqual(first, second);
  assert.notEqual(first.position, second.position);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.commands));
  assert.ok(Object.isFrozen(first.commands[0]));
  assert.ok(Object.isFrozen(first.commands[0].target.position));

  const bytesBefore = left.serialize();
  const restored = BattleMovement.restore(bytesBefore);
  assert.equal(restored.serialize(), bytesBefore);
  restored.stepMany(31);
  left.stepMany(31);
  assert.deepEqual(restored.state, left.state);
  assert.equal(restored.serialize(), left.serialize());

  for (const ticks of [-1, 0.5, MAX_BATTLE_MOVEMENT_STEP_TICKS + 1]) {
    assert.throws(() => restored.stepMany(ticks));
  }
});
