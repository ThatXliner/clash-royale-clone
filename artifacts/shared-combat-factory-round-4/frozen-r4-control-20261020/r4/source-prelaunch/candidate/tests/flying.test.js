import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceFlying,
  createFlyingState,
  restoreFlyingState,
  serializeFlyingState,
  setFlyingTarget,
  stopFlying,
} from "../src/sim/flying.js";
import { MOVEMENT_SPEEDS } from "../src/sim/movement.js";

function target(position, radius = 0, range = 0) {
  return { position, radius, range };
}

test("flying: neutral state and explicit target/stop commands are immutable", () => {
  const neutral = createFlyingState({
    collisionRadius: 250,
    position: { x: 9000, y: 14000 },
    speed: MOVEMENT_SPEEDS.fast,
  });
  assert.deepEqual(neutral, {
    collisionRadius: 250,
    position: { x: 9000, y: 14000 },
    remainder: 0,
    speed: 1500,
    target: null,
  });
  assert.deepEqual(advanceFlying(neutral, 500), neutral);

  const commanded = setFlyingTarget(
    neutral,
    target({ x: 9000, y: 18000 }, 300, 500),
  );
  assert.equal(neutral.target, null);
  assert.notDeepEqual(commanded, neutral);
  const stopped = stopFlying(advanceFlying(commanded));
  assert.equal(stopped.target, null);
  assert.equal(stopped.remainder, 0);
  assert.deepEqual(stopped.position, { x: 9000, y: 14025 });
});

test("flying: crosses river outside bridges directly in both rotations", () => {
  for (const [startY, targetY] of [[14000, 18000], [18000, 14000]]) {
    const state = createFlyingState({
      collisionRadius: 0,
      position: { x: 9000, y: startY },
      speed: MOVEMENT_SPEEDS.very_fast,
      target: target({ x: 9000, y: targetY }),
    });
    const crossed = advanceFlying(state, 120);
    assert.deepEqual(crossed.position, { x: 9000, y: targetY });
  }
});

test("flying: tower footprints do not obstruct straight-line travel", () => {
  for (const [startY, targetY] of [[500, 5500], [31500, 26500]]) {
    const state = createFlyingState({
      collisionRadius: 0,
      position: { x: 9000, y: startY },
      speed: MOVEMENT_SPEEDS.medium,
      target: target({ x: 9000, y: targetY }),
    });
    const insideTower = advanceFlying(state, 150);
    assert.deepEqual(insideTower.position, {
      x: 9000,
      y: startY < targetY ? 3000 : 29000,
    });
    assert.deepEqual(advanceFlying(state, 300).position, {
      x: 9000,
      y: targetY,
    });
  }
});

test("flying: circle-edge target range stops exactly without overshoot", () => {
  for (const [startX, targetX] of [[2000, 10000], [16000, 8000]]) {
    const state = createFlyingState({
      collisionRadius: 200,
      position: { x: startX, y: 12000 },
      speed: MOVEMENT_SPEEDS.very_fast,
      target: target({ x: targetX, y: 12000 }, 300, 500),
    });
    const stopped = advanceFlying(state, 1000);
    assert.equal(stopped.position.x, startX < targetX ? 9000 : 9000);
    assert.equal(
      Math.abs(stopped.position.x - targetX),
      200 + 300 + 500,
    );
    assert.equal(stopped.remainder, 0);
    assert.deepEqual(advanceFlying(stopped, 1000), stopped);
  }
});

test("flying: radius-adjusted outer bounds are exact and rotation symmetric", () => {
  const cases = [
    [{ x: 1000, y: 1000 }, { x: 0, y: 1000 }, { x: 250, y: 1000 }],
    [{ x: 17000, y: 31000 }, { x: 18000, y: 31000 }, { x: 17750, y: 31000 }],
    [{ x: 1000, y: 1000 }, { x: 1000, y: 0 }, { x: 1000, y: 250 }],
    [{ x: 17000, y: 31000 }, { x: 17000, y: 32000 }, { x: 17000, y: 31750 }],
  ];
  for (const [position, targetPosition, expected] of cases) {
    const state = createFlyingState({
      collisionRadius: 250,
      position,
      speed: MOVEMENT_SPEEDS.fast,
      target: target(targetPosition),
    });
    const result = advanceFlying(state, 1000);
    assert.deepEqual(result.position, expected);
    assert.equal(result.remainder, 0);
  }
});

test("flying: chunking and restored fractional phase are byte-identical", () => {
  const initial = createFlyingState({
    collisionRadius: 100,
    position: { x: 5000, y: 10000 },
    remainder: 37,
    speed: MOVEMENT_SPEEDS.slow,
    target: target({ x: 5000, y: 30000 }, 100, 200),
  });
  let repeated = initial;
  for (let tick = 0; tick < 997; tick += 1) {
    repeated = advanceFlying(repeated);
  }
  const chunked = advanceFlying(initial, 997);
  assert.deepEqual(chunked, repeated);

  const interrupted = advanceFlying(initial, 17);
  const bytes = serializeFlyingState(interrupted);
  const restored = restoreFlyingState(bytes);
  assert.equal(serializeFlyingState(restored), bytes);
  assert.deepEqual(
    advanceFlying(restored, 980),
    advanceFlying(initial, 997),
  );
});

test("flying: target changes reset phase and use the new axis only", () => {
  const north = advanceFlying(createFlyingState({
    collisionRadius: 100,
    position: { x: 5000, y: 5000 },
    speed: MOVEMENT_SPEEDS.medium,
    target: target({ x: 5000, y: 10000 }),
  }));
  assert.equal(north.remainder, 40);
  const east = setFlyingTarget(north, target({ x: 10000, y: north.position.y }));
  assert.equal(east.remainder, 0);
  const moved = advanceFlying(east);
  assert.deepEqual(moved.position, { x: 5016, y: north.position.y });
});

test("flying: invalid state, commands, ticks, and snapshots reject atomically", () => {
  const original = createFlyingState({
    collisionRadius: 100,
    position: { x: 5000, y: 5000 },
    speed: MOVEMENT_SPEEDS.slow,
  });
  const bytes = serializeFlyingState(original);
  for (const ticks of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => advanceFlying(original, ticks), /ticks/);
    assert.equal(serializeFlyingState(original), bytes);
  }
  assert.throws(
    () => setFlyingTarget(original, target({ x: 6000, y: 6000 })),
    /axis-aligned/,
  );
  assert.throws(
    () => createFlyingState({ ...original, position: { x: 50, y: 5000 } }),
    /fit inside/,
  );
  assert.throws(
    () => createFlyingState({ ...original, speed: 999 }),
    /reference speed/,
  );
  assert.throws(() => advanceFlying({ ...original, extra: true }), /shape/);
  assert.equal(serializeFlyingState(original), bytes);

  for (const snapshot of [
    "",
    "{}",
    '{"state":{},"version":1}',
    `{"state":${JSON.stringify(original)},"version":2}`,
    `{"extra":true,"state":${JSON.stringify(original)},"version":1}`,
  ]) {
    assert.throws(() => restoreFlyingState(snapshot));
  }
});
