import assert from "node:assert/strict";
import test from "node:test";

import {
  BATTLE_MOVEMENT_MODES,
  BattleMovement,
} from "../src/sim/battle-movement.js";
import {
  ARENA_LENGTH_MILLITILES,
  ARENA_WIDTH_MILLITILES,
} from "../src/sim/arena-geometry.js";

function target(position, radius = 0, range = 0) {
  return { position, radius, range };
}

function assertSelfRestores(mover, label) {
  const bytes = mover.serialize();
  const restored = BattleMovement.restore(bytes);
  assert.equal(restored.serialize(), bytes, label);
  assert.deepEqual(restored.state, mover.state, label);
  return restored;
}

function createGroundJourney() {
  const mover = new BattleMovement({
    bodyRadius: 600,
    mode: BATTLE_MOVEMENT_MODES.ground,
    position: { x: 8_500, y: 10_500 },
    speed: 1_500,
  });
  mover.setTarget(target({ x: 8_500, y: 21_500 }, 100, 100));
  return mover;
}

function applyGroundCommands(mover) {
  switch (mover.state.tick) {
    case 37:
      return mover.setTarget(target({ x: 14_500, y: 22_500 }, 100, 200));
    case 83:
      return mover.stop();
    case 100:
      return mover.setTarget(target({ x: 3_500, y: 22_500 }, 200, 100));
    default:
      return [];
  }
}

function advanceGround(mover, endTick, chunked = false) {
  const events = [];
  const boundaries = [37, 83, 100, endTick]
    .filter((tick) => tick >= mover.state.tick && tick <= endTick)
    .sort((left, right) => left - right);
  if (!chunked) {
    while (mover.state.tick < endTick) {
      events.push(...applyGroundCommands(mover));
      events.push(...mover.step());
    }
    return events;
  }
  for (const boundary of boundaries) {
    const distance = boundary - mover.state.tick;
    if (distance > 0) events.push(...mover.stepMany(distance));
    if (mover.state.tick < endTick) events.push(...applyGroundCommands(mover));
  }
  return events;
}

function createAirJourney() {
  const mover = new BattleMovement({
    bodyRadius: 150,
    mode: BATTLE_MOVEMENT_MODES.air,
    position: { x: 4_000, y: 5_000 },
    speed: 1_000,
  });
  mover.setTarget(target({ x: 13_000, y: 19_000 }, 200, 300));
  return mover;
}

function applyAirCommands(mover) {
  switch (mover.state.tick) {
    case 29:
      return mover.setTarget(target({ x: 2_000, y: 18_000 }, 100, 200));
    case 71:
      return mover.stop();
    case 88:
      return mover.setTarget(target({ x: 15_000, y: 7_000 }, 250, 150));
    default:
      return [];
  }
}

function advanceAir(mover, endTick, chunked = false) {
  const events = [];
  const boundaries = [29, 71, 88, endTick]
    .filter((tick) => tick >= mover.state.tick && tick <= endTick)
    .sort((left, right) => left - right);
  if (!chunked) {
    while (mover.state.tick < endTick) {
      events.push(...applyAirCommands(mover));
      events.push(...mover.step());
    }
    return events;
  }
  for (const boundary of boundaries) {
    const distance = boundary - mover.state.tick;
    if (distance > 0) events.push(...mover.stepMany(distance));
    if (mover.state.tick < endTick) events.push(...applyAirCommands(mover));
  }
  return events;
}

test("battle movement kernel: radius-safe ground routes cross the river only through a bridge", () => {
  const mover = createGroundJourney();
  const route = mover.state.route;
  assert.ok(route.some((point) => point.x === 3_500 && point.y === 15_500));
  assert.ok(route.some((point) => point.x === 3_500 && point.y === 16_500));
  for (const point of route) {
    assert.ok(point.x >= 600 && point.x <= ARENA_WIDTH_MILLITILES - 600);
    assert.ok(point.y >= 600 && point.y <= ARENA_LENGTH_MILLITILES - 600);
    if (point.y === 15_500 || point.y === 16_500) {
      assert.ok(point.x === 3_500 || point.x === 14_500);
    }
  }
  assertSelfRestores(mover, "initial radius-safe ground route");
});

test("battle movement kernel: rational speed has exact signed displacement and no drift", () => {
  for (const [startX, endX, direction] of [
    [2_000, 16_000, 1],
    [16_000, 2_000, -1],
  ]) {
    const mover = new BattleMovement({
      mode: "air",
      position: { x: startX, y: 12_000 },
      speed: 750,
    });
    mover.setTarget(target({ x: endX, y: 12_000 }));
    mover.stepMany(60);
    assert.equal(mover.state.position.x, startX + direction * 750);
    assert.equal(mover.state.position.y, 12_000);
    assert.equal(mover.state.remainder, 0);
    mover.stepMany(540);
    assert.equal(mover.state.position.x, startX + direction * 7_500);
    assert.equal(mover.state.remainder, 0);
    assertSelfRestores(mover, `signed direction ${direction}`);
  }
});

test("battle movement kernel: every live ground cut restores identical continuation events/state/bytes", () => {
  const horizon = 120;
  const single = createGroundJourney();
  const singleEvents = advanceGround(single, horizon);
  const chunked = createGroundJourney();
  const chunkedEvents = advanceGround(chunked, horizon, true);
  assert.deepEqual(chunkedEvents, singleEvents);
  assert.equal(chunked.serialize(), single.serialize());

  for (let cut = 0; cut <= horizon; cut += 1) {
    const original = createGroundJourney();
    advanceGround(original, cut);
    const restored = assertSelfRestores(original, `ground cut ${cut}`);
    const originalEvents = advanceGround(original, horizon);
    const restoredEvents = advanceGround(restored, horizon);
    assert.deepEqual(restoredEvents, originalEvents, `ground events cut ${cut}`);
    assert.deepEqual(restored.state, original.state, `ground state cut ${cut}`);
    assert.equal(restored.serialize(), original.serialize(), `ground bytes cut ${cut}`);
  }
});

test("battle movement kernel: every live air cut restores arbitrary-angle stop/retarget continuation", () => {
  const horizon = 100;
  const single = createAirJourney();
  const singleEvents = advanceAir(single, horizon);
  const chunked = createAirJourney();
  const chunkedEvents = advanceAir(chunked, horizon, true);
  assert.deepEqual(chunkedEvents, singleEvents);
  assert.equal(chunked.serialize(), single.serialize());

  for (let cut = 0; cut <= horizon; cut += 1) {
    const original = createAirJourney();
    advanceAir(original, cut);
    const restored = assertSelfRestores(original, `air cut ${cut}`);
    const originalEvents = advanceAir(original, horizon);
    const restoredEvents = advanceAir(restored, horizon);
    assert.deepEqual(restoredEvents, originalEvents, `air events cut ${cut}`);
    assert.deepEqual(restored.state, original.state, `air state cut ${cut}`);
    assert.equal(restored.serialize(), original.serialize(), `air bytes cut ${cut}`);
  }
});

test("battle movement kernel: live radius and total-tick bounds reject without mutation", () => {
  const ground = new BattleMovement({
    bodyRadius: 600,
    mode: "ground",
    position: { x: 1_500, y: 1_500 },
    speed: 1_000,
  });
  const groundBytes = ground.serialize();
  assert.throws(
    () => ground.setTarget(target({ x: 15_500, y: 2_500 })),
    /radius-inset/u,
  );
  assert.equal(ground.serialize(), groundBytes);
  assertSelfRestores(ground, "rejected ground route leaves live bytes valid");

  const air = new BattleMovement({
    bodyRadius: 250,
    mode: "air",
    position: { x: 1_000, y: 1_000 },
    speed: 1_000,
  });
  const airBytes = air.serialize();
  assert.throws(
    () => air.setTarget(target({ x: 100, y: 1_000 })),
    /radius-inset/u,
  );
  assert.equal(air.serialize(), airBytes);

  const bounded = new BattleMovement({
    mode: "air",
    position: { x: 9_000, y: 16_000 },
    speed: 0,
  });
  bounded.stepMany(18_000);
  assertSelfRestores(bounded, "complete live tick horizon");
  const boundedBytes = bounded.serialize();
  assert.throws(() => bounded.step(), /tick bound/u);
  assert.equal(bounded.serialize(), boundedBytes);
});

// Deliberately excluded: synthetic minimal-history/canonical hostile snapshots.
// Those belong to GAME-001PH; this kernel suite exercises only live API output.
