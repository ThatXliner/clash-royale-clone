import assert from "node:assert/strict";
import test from "node:test";

import {
  MOVEMENT_SPEEDS,
  MOVEMENT_TICKS_PER_SECOND,
  advanceMovement,
  createMovementState,
  restoreMovementState,
  serializeMovementState,
  stopMovement,
} from "../src/sim/movement.js";
import { MAX_SPATIAL_MILLITILES } from "../src/sim/spatial.js";

const referenceSpeeds = [
  ["slow", 750],
  ["medium", 1000],
  ["fast", 1500],
  ["very_fast", 2000],
];

test("movement: reference speeds cover exact pinned seconds and minutes", () => {
  assert.equal(MOVEMENT_TICKS_PER_SECOND, 60);
  for (const [name, speed] of referenceSpeeds) {
    assert.equal(MOVEMENT_SPEEDS[name], speed);
    for (const seconds of [1, 3, 60, 180]) {
      const result = advanceMovement(
        createMovementState({ direction: 1, speed }),
        seconds * MOVEMENT_TICKS_PER_SECOND,
      );
      assert.equal(result.position, speed * seconds, `${name} at ${seconds}s`);
      assert.equal(result.remainder, 0, `${name} phase at ${seconds}s`);
    }
  }
});

test("movement: intermediate rounding is deterministic and documented", () => {
  const expectedDeltas = {
    slow: [12, 13, 12, 13, 12, 13],
    medium: [16, 17, 17, 16, 17, 17],
    fast: [25, 25, 25, 25, 25, 25],
    very_fast: [33, 33, 34, 33, 33, 34],
  };
  for (const [name, expected] of Object.entries(expectedDeltas)) {
    let state = createMovementState({
      direction: 1,
      speed: MOVEMENT_SPEEDS[name],
    });
    const deltas = [];
    for (let tick = 0; tick < expected.length; tick += 1) {
      const previous = state.position;
      state = advanceMovement(state);
      deltas.push(state.position - previous);
    }
    assert.deepEqual(deltas, expected, name);
  }
});

test("movement: positive and negative axes are exactly symmetric", () => {
  for (const [, speed] of referenceSpeeds) {
    for (const ticks of [1, 2, 17, 59, 61, 3599]) {
      const positive = advanceMovement(
        createMovementState({ direction: 1, position: 1234, speed }),
        ticks,
      );
      const negative = advanceMovement(
        createMovementState({ direction: -1, position: -1234, speed }),
        ticks,
      );
      assert.equal(positive.position, -negative.position);
      assert.equal(positive.remainder, negative.remainder);
    }
  }
});

test("movement: chunking preserves position and fractional phase", () => {
  for (const direction of [-1, 1]) {
    for (const [, speed] of referenceSpeeds) {
      let repeated = createMovementState({
        direction,
        position: 99,
        remainder: 37,
        speed,
      });
      for (let tick = 0; tick < 997; tick += 1) {
        repeated = advanceMovement(repeated);
      }
      const chunked = advanceMovement(
        createMovementState({
          direction,
          position: 99,
          remainder: 37,
          speed,
        }),
        997,
      );
      assert.deepEqual(chunked, repeated);
    }
  }
});

test("movement: stop is explicit and clears fractional phase", () => {
  const moving = advanceMovement(
    createMovementState({
      direction: 1,
      position: 200,
      speed: MOVEMENT_SPEEDS.medium,
    }),
  );
  assert.equal(moving.remainder, 40);
  const stopped = stopMovement(moving);
  assert.deepEqual(stopped, {
    direction: 0,
    position: 216,
    remainder: 0,
    speed: 0,
  });
  assert.deepEqual(advanceMovement(stopped, 10_000), stopped);
});

test("movement: serialize/restore preserves phase and continuation bytes", () => {
  const initial = createMovementState({
    direction: -1,
    position: 12_345,
    speed: MOVEMENT_SPEEDS.medium,
  });
  const interrupted = advanceMovement(initial, 7);
  assert.notEqual(interrupted.remainder, 0);
  const bytes = serializeMovementState(interrupted);
  const restored = restoreMovementState(bytes);
  assert.equal(serializeMovementState(restored), bytes);

  const continued = advanceMovement(restored, 1001);
  const uninterrupted = advanceMovement(initial, 1008);
  assert.deepEqual(continued, uninterrupted);
  assert.equal(
    serializeMovementState(continued),
    serializeMovementState(uninterrupted),
  );
});

test("movement: invalid tick, speed, direction, state, and overflow reject atomically", () => {
  const original = createMovementState({
    direction: 1,
    position: 50,
    remainder: 11,
    speed: MOVEMENT_SPEEDS.slow,
  });
  const bytes = JSON.stringify(original);

  for (const ticks of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => advanceMovement(original, ticks), /ticks/);
    assert.equal(JSON.stringify(original), bytes);
  }
  assert.throws(
    () => createMovementState({ direction: 1, speed: 749 }),
    /reference speed/,
  );
  assert.throws(
    () => createMovementState({ direction: 2, speed: MOVEMENT_SPEEDS.slow }),
    /direction/,
  );
  assert.throws(
    () => createMovementState({ direction: 0, speed: MOVEMENT_SPEEDS.slow }),
    /pair stopped/,
  );
  assert.throws(
    () => createMovementState({ direction: 0, remainder: 1, speed: 0 }),
    /pair stopped/,
  );
  assert.throws(
    () => advanceMovement({ ...original, extra: true }),
    /invalid shape/,
  );
  assert.throws(
    () =>
      advanceMovement({
        ...original,
        position: MAX_SPATIAL_MILLITILES,
      }),
    /outside/,
  );
  assert.equal(JSON.stringify(original), bytes);
});

test("movement: malformed snapshots reject without producing partial state", () => {
  const invalid = [
    null,
    "",
    "{}",
    '{"state":{},"version":1}',
    '{"state":{"direction":0,"position":0,"remainder":1,"speed":0},"version":1}',
    '{"state":{"direction":0,"position":0,"remainder":0,"speed":0},"version":2}',
    '{"extra":true,"state":{"direction":0,"position":0,"remainder":0,"speed":0},"version":1}',
  ];
  for (const serialized of invalid) {
    assert.throws(() => restoreMovementState(serialized));
  }
});
