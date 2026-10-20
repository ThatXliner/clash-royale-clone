import assert from "node:assert/strict";
import test from "node:test";

import { FixedStepWorld } from "../src/sim/fixed-step.js";

function reducer(state, command, context) {
  state.total += command.amount;
  state.applied.push(`${command.name}@${context.tick}`);
  context.emit({ name: command.name, total: state.total });
  return state;
}

function createRun() {
  const world = new FixedStepWorld({
    initialState: { applied: [], total: 0 },
    reducer,
  });
  world.schedule(4, { amount: 5, name: "late" });
  world.schedule(1, { amount: 2, name: "first" });
  world.schedule(1, { amount: 3, name: "second" });
  return world;
}

test("fixed-step-kernel: commands resolve only at exact integer ticks", () => {
  const world = createRun();

  assert.deepEqual(world.step(), []);
  assert.deepEqual(world.state, { applied: [], total: 0 });

  const atOne = world.step();
  assert.deepEqual(
    atOne.map(({ sequence, tick }) => ({ sequence, tick })),
    [
      { sequence: 1, tick: 1 },
      { sequence: 2, tick: 1 },
    ],
  );
  assert.deepEqual(world.state, {
    applied: ["first@1", "second@1"],
    total: 5,
  });

  assert.deepEqual(world.step(), []);
  assert.deepEqual(world.step(), []);
  assert.equal(world.state.total, 5);

  const atFour = world.step();
  assert.equal(atFour.length, 1);
  assert.equal(atFour[0].tick, 4);
  assert.deepEqual(world.state, {
    applied: ["first@1", "second@1", "late@4"],
    total: 10,
  });
});

test("fixed-step-kernel: fresh runs are byte-identical", () => {
  const left = createRun();
  const right = createRun();

  left.runThrough(6);
  right.runThrough(6);

  assert.equal(left.replayBytes(), right.replayBytes());
  assert.equal(left.serialize(), right.serialize());
  assert.deepEqual(JSON.parse(left.replayBytes()), [
    {
      command: { amount: 2, name: "first" },
      events: [{ name: "first", total: 2 }],
      sequence: 1,
      tick: 1,
    },
    {
      command: { amount: 3, name: "second" },
      events: [{ name: "second", total: 5 }],
      sequence: 2,
      tick: 1,
    },
    {
      command: { amount: 5, name: "late" },
      events: [{ name: "late", total: 10 }],
      sequence: 0,
      tick: 4,
    },
  ]);
});

test("fixed-step-kernel: serialize/restore is byte-identical", () => {
  const uninterrupted = createRun();
  uninterrupted.runThrough(6);

  const interrupted = createRun();
  interrupted.runThrough(2);
  const restored = FixedStepWorld.restore(interrupted.serialize(), {
    reducer,
  });
  restored.runThrough(6);

  assert.equal(restored.replayBytes(), uninterrupted.replayBytes());
  assert.equal(restored.serialize(), uninterrupted.serialize());
});

test("fixed-step-kernel: JSON inputs and snapshots are isolated", () => {
  const initialState = { applied: [], total: 0 };
  const command = { amount: 1, name: "isolated" };
  const world = new FixedStepWorld({ initialState, reducer });
  world.schedule(0, command);

  initialState.total = 99;
  command.amount = 99;
  world.runThrough(0);

  const observedState = world.state;
  const observedReplay = world.replayLog;
  observedState.total = 77;
  observedReplay[0].command.amount = 77;

  assert.equal(world.state.total, 1);
  assert.equal(world.replayLog[0].command.amount, 1);
  assert.throws(
    () => world.schedule(1.5, { amount: 1, name: "bad" }),
    /safe integer/,
  );
  assert.throws(
    () => world.schedule(1, { amount: Number.NaN, name: "bad" }),
    /finite numbers/,
  );
});
