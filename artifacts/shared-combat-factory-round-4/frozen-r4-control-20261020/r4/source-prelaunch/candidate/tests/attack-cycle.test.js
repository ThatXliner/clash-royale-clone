import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTACK_CYCLE_TICKS_PER_SECOND,
  AttackCycle,
  attackSecondsToTicks,
} from "../src/sim/attack-cycle.js";

const target = (targetId, targetEligible = true) => ({
  targetEligible,
  targetId,
});
const none = () => target(null, false);

test("attack-cycle: high-confidence hit speeds convert exactly", () => {
  assert.equal(ATTACK_CYCLE_TICKS_PER_SECOND, 60);
  assert.equal(attackSecondsToTicks("0.8"), 48); // Princess Tower cadence
  assert.equal(attackSecondsToTicks("0.9"), 54); // Cannon cadence
  assert.equal(attackSecondsToTicks(0.8), 48);
  assert.throws(() => attackSecondsToTicks("0.81"), /exact 60 Hz/);
  assert.throws(() => attackSecondsToTicks("1e3"), /plain decimal/);
  assert.throws(() => attackSecondsToTicks(-1), /non-negative/);
});

test("attack-cycle: boundary semantics cover deploy, first hit, and cadence", () => {
  // Deploy and first-hit values are configurable estimate fixtures; reference
  // first-hit/load and deploy-time values are not authoritative yet.
  const cycle = new AttackCycle({
    deployTicks: 2,
    firstHitTicks: 3,
    hitSpeedTicks: attackSecondsToTicks("0.8"),
  });

  assert.deepEqual(cycle.step(target(7)), []); // T0, deploying
  assert.deepEqual(cycle.step(target(7)), []); // T1, deploying
  assert.deepEqual(cycle.step(target(7)), []); // T2 acquisition, due T5
  assert.equal(cycle.state.nextAttackTick, 5);
  assert.deepEqual(cycle.stepMany([target(7), target(7)]), []); // T3-T4
  assert.deepEqual(cycle.step(target(7)), [{
    sequence: 1,
    targetId: 7,
    tick: 5,
    type: "attack-ready",
  }]);

  assert.deepEqual(cycle.stepMany(Array.from({ length: 47 }, () => target(7))), []);
  assert.deepEqual(cycle.step(target(7)), [{
    sequence: 2,
    targetId: 7,
    tick: 53,
    type: "attack-ready",
  }]);
});

test("attack-cycle: zero first-hit duration emits on acquisition boundary", () => {
  const cycle = new AttackCycle({
    deployTicks: 0,
    firstHitTicks: 0,
    hitSpeedTicks: 2,
  });
  assert.deepEqual(cycle.step(target(1)), [{
    sequence: 1,
    targetId: 1,
    tick: 0,
    type: "attack-ready",
  }]);
  assert.deepEqual(cycle.step(target(1)), []);
  assert.deepEqual(cycle.step(target(1)), [{
    sequence: 2,
    targetId: 1,
    tick: 2,
    type: "attack-ready",
  }]);
});

test("attack-cycle: loss cancels and same target reacquisition restarts", () => {
  const cycle = new AttackCycle({
    deployTicks: 0,
    firstHitTicks: 3,
    hitSpeedTicks: 5,
  });
  cycle.step(target(4)); // T0 due T3
  cycle.step(target(4)); // T1 retains deadline
  assert.equal(cycle.state.nextAttackTick, 3);
  cycle.step(target(4, false)); // T2 cancels
  assert.deepEqual(cycle.state, {
    attackSequence: 0,
    config: { deployTicks: 0, firstHitTicks: 3, hitSpeedTicks: 5 },
    nextAttackTick: null,
    nextTick: 3,
    phase: "idle",
    targetId: null,
  });

  cycle.step(target(4)); // T3 reacquisition due T6, not old T3
  assert.deepEqual(cycle.stepMany([target(4), target(4)]), []);
  assert.deepEqual(cycle.step(target(4)), [{
    sequence: 1,
    targetId: 4,
    tick: 6,
    type: "attack-ready",
  }]);
});

test("attack-cycle: changing target restarts windup, including at deadline", () => {
  const cycle = new AttackCycle({
    deployTicks: 0,
    firstHitTicks: 2,
    hitSpeedTicks: 3,
  });
  cycle.step(target(2)); // T0 due T2
  cycle.step(target(2)); // T1
  assert.deepEqual(cycle.step(target(9)), []); // T2 old attack cancelled
  assert.equal(cycle.state.nextAttackTick, 4);
  cycle.step(target(9));
  assert.deepEqual(cycle.step(target(9)), [{
    sequence: 1,
    targetId: 9,
    tick: 4,
    type: "attack-ready",
  }]);
});

test("attack-cycle: chunking and serialize/restore are identical", () => {
  const config = { deployTicks: 1, firstHitTicks: 2, hitSpeedTicks: 4 };
  const inputs = [
    target(1), target(1), target(1), target(1), target(1),
    target(1), none(), target(2), target(2), target(2),
    target(2), target(2), target(2), target(2),
  ];
  const chunked = new AttackCycle(config);
  const oneByOne = new AttackCycle(config);

  const chunkEvents = chunked.stepMany(inputs);
  const singleEvents = inputs.flatMap((input) => oneByOne.step(input));
  assert.deepEqual(chunkEvents, singleEvents);
  assert.equal(chunked.serialize(), oneByOne.serialize());

  const restored = AttackCycle.restore(chunked.serialize());
  const tail = Array.from({ length: 10 }, () => target(2));
  assert.deepEqual(restored.stepMany(tail), chunked.stepMany(tail));
  assert.equal(restored.serialize(), chunked.serialize());
});

test("attack-cycle: fork is an independent ordinary continuation", () => {
  const source = new AttackCycle({
    deployTicks: 0,
    firstHitTicks: 2,
    hitSpeedTicks: 3,
  });
  source.step(target(4));
  const fork = source.fork();

  assert.ok(fork instanceof AttackCycle);
  assert.notEqual(fork, source);
  assert.deepEqual(fork.state, source.state);
  assert.equal(fork.serialize(), source.serialize());

  assert.deepEqual(fork.step(target(4)), []);
  assert.equal(fork.state.nextTick, 2);
  assert.equal(source.state.nextTick, 1);
  assert.notEqual(fork.serialize(), source.serialize());

  assert.deepEqual(source.step(target(4)), []);
  assert.equal(fork.serialize(), source.serialize());
  assert.throws(
    () => AttackCycle.prototype.fork.call(new Proxy(source, {})),
    TypeError,
  );
});

test("attack-cycle: invalid operations reject without mutation", () => {
  const cycle = new AttackCycle({
    deployTicks: 0,
    firstHitTicks: 2,
    hitSpeedTicks: 3,
  });
  cycle.step(target(1));
  const before = cycle.serialize();

  assert.throws(
    () => cycle.stepMany([target(1), { targetEligible: true, targetId: null }]),
    /must identify a target/,
  );
  assert.equal(cycle.serialize(), before);
  assert.throws(() => cycle.step({ targetEligible: true, targetId: 1, x: 2 }));
  assert.equal(cycle.serialize(), before);
  assert.throws(() => cycle.stepMany("no"), /must be an array/);
  assert.equal(cycle.serialize(), before);

  for (const config of [
    { deployTicks: -1, firstHitTicks: 0, hitSpeedTicks: 1 },
    { deployTicks: 0, firstHitTicks: 0.5, hitSpeedTicks: 1 },
    { deployTicks: 0, firstHitTicks: 0, hitSpeedTicks: 0 },
  ]) {
    assert.throws(() => new AttackCycle(config));
  }
});

test("attack-cycle: malformed snapshots reject strictly", () => {
  const valid = new AttackCycle({
    deployTicks: 0,
    firstHitTicks: 2,
    hitSpeedTicks: 3,
  });
  valid.step(target(1));
  const state = JSON.parse(valid.serialize()).state;
  const invalid = [
    "not json",
    "null",
    "{}",
    JSON.stringify({ state, version: 2 }),
    JSON.stringify({ extra: true, state, version: 1 }),
    JSON.stringify({ state: { ...state, phase: "bogus" }, version: 1 }),
    JSON.stringify({
      state: { ...state, nextAttackTick: null },
      version: 1,
    }),
    JSON.stringify({
      state: { ...state, config: { ...state.config, hitSpeedTicks: 0 } },
      version: 1,
    }),
  ];
  for (const snapshot of invalid) {
    assert.throws(() => AttackCycle.restore(snapshot));
  }
  assert.throws(() => AttackCycle.restore({}), /must be a string/);
});
