import assert from "node:assert/strict";
import test from "node:test";

import {
  BATTLE_MOVEMENT_MODES,
  BattleMovement,
  MAX_BATTLE_MOVEMENT_STEP_TICKS,
} from "../src/sim/battle-movement.js";
import { findGroundPath } from "../src/sim/pathfinding.js";

function destination(position, radius = 0, range = 0) {
  return { position, radius, range };
}

test("battle movement: ground delegates a stable bridge-constrained route", () => {
  const mover = new BattleMovement({
    bodyRadius: 200,
    mode: BATTLE_MOVEMENT_MODES.ground,
    position: { x: 8_500, y: 10_500 },
    speed: 1_500,
  });
  mover.setTarget(destination({ x: 8_500, y: 21_500 }));
  const initial = mover.state;
  assert.ok(initial.route.length > 11);
  assert.ok(initial.route.some((point) => point.x === 3_500));
  assert.ok(initial.route.some((point) => point.y === 15_500));
  assert.ok(initial.route.some((point) => point.y === 16_500));
  for (let index = 1; index < initial.route.length; index += 1) {
    const dx = Math.abs(initial.route[index].x - initial.route[index - 1].x);
    const dy = Math.abs(initial.route[index].y - initial.route[index - 1].y);
    assert.equal(dx + dy, 1_000);
  }
  mover.stepMany(1_000);
  assert.deepEqual(mover.state.position, { x: 8_300, y: 21_500 });
  assert.equal(mover.state.route.length, 0);
});

test("battle movement: air follows arbitrary signed direct 2D segments", () => {
  for (const end of [
    { x: 8_000, y: 9_000 },
    { x: 2_000, y: 9_000 },
    { x: 8_000, y: 3_000 },
    { x: 2_000, y: 3_000 },
  ]) {
    const mover = new BattleMovement({
      bodyRadius: 100,
      mode: BATTLE_MOVEMENT_MODES.air,
      position: { x: 5_000, y: 6_000 },
      speed: 2_000,
    });
    mover.setTarget(destination(end));
    const route = mover.state.route;
    assert.deepEqual(route, [end]);
    const events = mover.stepMany(300);
    const dx = end.x - mover.state.position.x;
    const dy = end.y - mover.state.position.y;
    assert.ok(dx * dx + dy * dy <= 100 * 100);
    assert.ok(events.some((entry) => entry.kind === "arrived"));
  }
});

test("battle movement: rational 60 Hz phase is exact and never overshoots", () => {
  const mover = new BattleMovement({
    mode: "air",
    position: { x: 1_000, y: 1_000 },
    speed: 1_000,
  });
  mover.setTarget(destination({ x: 7_000, y: 9_000 }, 200, 300));
  mover.step();
  assert.equal(mover.state.remainder, 40);
  assert.deepEqual(mover.state.position, { x: 1_009, y: 1_012 });
  mover.stepMany(1_000);
  const dx = 7_000 - mover.state.position.x;
  const dy = 9_000 - mover.state.position.y;
  assert.ok(dx * dx + dy * dy <= 500 * 500);
  assert.equal(mover.state.remainder, 0);
  assert.equal(mover.state.route.length, 0);
});

test("battle movement: retargeting is canonical and an in-bar command stops", () => {
  const mover = new BattleMovement({
    bodyRadius: 200,
    mode: "ground",
    position: { x: 3_500, y: 9_500 },
    speed: 1_500,
  });
  mover.setTarget(destination({ x: 3_500, y: 22_500 }));
  mover.stepMany(13);
  const retargetEvents = mover.setTarget(
    destination({ x: 14_500, y: 22_500 }, 100, 100),
  );
  assert.equal(retargetEvents[0].kind, "target-set");
  assert.equal(mover.state.remainder, 0);
  assert.deepEqual(mover.state.route[0], { x: 3_500, y: 10_500 });
  mover.stepMany(1_000);
  assert.equal(mover.state.route.length, 0);

  const near = new BattleMovement({
    bodyRadius: 200,
    mode: "air",
    position: { x: 5_000, y: 5_000 },
    speed: 1_500,
  });
  near.setTarget(destination({ x: 5_500, y: 5_000 }, 200, 100));
  assert.equal(near.state.route.length, 0);
  assert.deepEqual(near.state.position, { x: 5_000, y: 5_000 });
  assert.equal(near.stop()[0].kind, "stopped");
  assert.equal(near.state.target, null);

  const interrupted = new BattleMovement({
    mode: "ground",
    position: { x: 3_500, y: 10_500 },
    speed: 1_000,
  });
  interrupted.setTarget(destination({ x: 3_500, y: 22_500 }));
  interrupted.stepMany(17);
  interrupted.stop();
  const stoppedPosition = interrupted.state.position;
  assert.deepEqual(interrupted.state.anchor, { x: 3_500, y: 11_500 });
  const stoppedBytes = interrupted.serialize();
  const resumed = BattleMovement.restore(stoppedBytes);
  assert.equal(resumed.serialize(), stoppedBytes);
  resumed.setTarget(destination({ x: 14_500, y: 22_500 }));
  assert.deepEqual(resumed.state.position, stoppedPosition);
  assert.deepEqual(resumed.state.route[0], { x: 3_500, y: 11_500 });
});

test("battle movement: radius-inset arena bounds reject before exposure", () => {
  assert.throws(
    () => new BattleMovement({
      bodyRadius: 250,
      mode: "air",
      position: { x: 249, y: 1_000 },
      speed: 1_000,
    }),
    /radius-inset/u,
  );
  const mover = new BattleMovement({
    bodyRadius: 250,
    mode: "air",
    position: { x: 1_000, y: 1_000 },
    speed: 1_000,
  });
  const before = mover.serialize();
  assert.throws(
    () => mover.setTarget(destination({ x: 100, y: 1_000 })),
    /radius-inset/u,
  );
  assert.equal(mover.serialize(), before);

  const wideGround = new BattleMovement({
    bodyRadius: 600,
    mode: "ground",
    position: { x: 1_500, y: 1_500 },
    speed: 1_000,
  });
  const wideBefore = wideGround.serialize();
  assert.throws(
    () => wideGround.setTarget(destination({ x: 15_500, y: 2_500 })),
    /radius-inset/u,
  );
  assert.equal(wideGround.serialize(), wideBefore);
});

test("battle movement: chunking and restore cuts are byte-identical", () => {
  function fresh() {
    const mover = new BattleMovement({
      bodyRadius: 100,
      mode: "air",
      position: { x: 2_000, y: 3_000 },
      speed: 750,
    });
    mover.setTarget(destination({ x: 15_000, y: 27_000 }, 200, 300));
    return mover;
  }
  const expected = fresh();
  expected.stepMany(777);
  const bytes = expected.serialize();

  const chunked = fresh();
  for (const count of [1, 7, 19, 50, 100, 200, 400]) chunked.stepMany(count);
  assert.equal(chunked.serialize(), bytes);

  for (let cut = 0; cut <= 777; cut += 7) {
    const partial = fresh();
    partial.stepMany(cut);
    const snapshot = partial.serialize();
    const restored = BattleMovement.restore(snapshot);
    assert.equal(restored.serialize(), snapshot);
    restored.stepMany(777 - cut);
    assert.equal(restored.serialize(), bytes, `restore cut ${cut}`);
  }

  function freshGround() {
    const mover = new BattleMovement({
      bodyRadius: 100,
      mode: "ground",
      position: { x: 8_500, y: 10_500 },
      speed: 750,
    });
    mover.setTarget(destination({ x: 8_500, y: 21_500 }, 100, 200));
    return mover;
  }
  const groundExpected = freshGround();
  const groundEvents = groundExpected.stepMany(500);
  const groundBytes = groundExpected.serialize();
  const repeated = freshGround();
  const repeatedEvents = [];
  for (let tick = 0; tick < 500; tick += 1) {
    repeatedEvents.push(...repeated.step());
  }
  assert.equal(repeated.serialize(), groundBytes);
  assert.deepEqual(repeatedEvents, groundEvents);
  for (let cut = 0; cut <= 500; cut += 5) {
    const partial = freshGround();
    partial.stepMany(cut);
    const restored = BattleMovement.restore(partial.serialize());
    restored.stepMany(500 - cut);
    assert.equal(restored.serialize(), groundBytes, `ground restore cut ${cut}`);
  }

  for (const cut of [0, 1, 39, 40, 41, 79, 80, 81, 399, 400, 401]) {
    const wide = new BattleMovement({
      bodyRadius: 600,
      mode: "ground",
      position: { x: 8_500, y: 10_500 },
      speed: 1_500,
    });
    wide.setTarget(destination({ x: 8_500, y: 21_500 }, 100, 100));
    wide.stepMany(cut);
    if (cut === 39) assert.equal(wide.state.routeIndex, 1);
    if (cut === 40 || cut === 41) assert.equal(wide.state.routeIndex, 2);
    const wideBytes = wide.serialize();
    assert.equal(BattleMovement.restore(wideBytes).serialize(), wideBytes);
    const continued = BattleMovement.restore(wideBytes);
    const adjacent = BattleMovement.restore(wideBytes);
    continued.stepMany(2);
    adjacent.step();
    adjacent.step();
    assert.equal(continued.serialize(), adjacent.serialize(), `radius 600 cut ${cut}`);
  }
});

test("battle movement: isolated state/events are deeply frozen fresh data", () => {
  const mover = new BattleMovement({
    mode: "air",
    position: { x: 1_000, y: 1_000 },
    speed: 1_500,
  });
  const commandEvents = mover.setTarget(destination({ x: 2_000, y: 2_000 }));
  assert.ok(Object.isFrozen(commandEvents));
  assert.ok(Object.isFrozen(commandEvents[0]));
  assert.ok(Object.isFrozen(commandEvents[0].position));
  assert.ok(Object.isFrozen(commandEvents[0].target));
  assert.ok(Object.isFrozen(commandEvents[0].target.position));
  const first = mover.state;
  const second = mover.state;
  assert.notEqual(first, second);
  assert.notEqual(first.position, second.position);
  assert.ok(Object.isFrozen(first));
  assert.equal(first.anchor, null);
  assert.ok(Object.isFrozen(first.position));
  assert.ok(Object.isFrozen(first.route));
  assert.ok(Object.isFrozen(first.commands));
  assert.ok(Object.isFrozen(first.commands[0]));
  assert.ok(Object.isFrozen(first.commands[0].target.position));
});

test("battle movement: hostile snapshots and oversized steps reject atomically", () => {
  const mover = new BattleMovement({
    bodyRadius: 100,
    mode: "air",
    position: { x: 1_000, y: 1_000 },
    speed: 1_000,
  });
  mover.setTarget(destination({ x: 10_000, y: 12_000 }));
  mover.stepMany(5);
  const before = mover.serialize();
  for (const count of [-1, 0.5, MAX_BATTLE_MOVEMENT_STEP_TICKS + 1]) {
    assert.throws(() => mover.stepMany(count));
    assert.equal(mover.serialize(), before);
  }
  for (const hostile of [
    {},
    "{",
    ` ${before}`,
    before.replace('"version":1', '"version":2'),
    before.replace('"segmentProgress":83', '"segmentProgress":84'),
    "x".repeat(262_145),
  ]) {
    assert.throws(() => BattleMovement.restore(hostile));
    assert.equal(mover.serialize(), before);
  }
  const forgedGround = new BattleMovement({
    mode: "ground",
    position: { x: 8_500, y: 10_500 },
    speed: 1_000,
  });
  forgedGround.setTarget(destination({ x: 8_500, y: 21_500 }));
  const forgedSnapshot = JSON.parse(forgedGround.serialize());
  forgedSnapshot.state.route.splice(1, 4);
  assert.throws(
    () => BattleMovement.restore(JSON.stringify(forgedSnapshot)),
    /canonical ground path/u,
  );

  const forgedIndex = JSON.parse(forgedGround.serialize());
  forgedIndex.state.routeIndex += 1;
  assert.throws(
    () => BattleMovement.restore(JSON.stringify(forgedIndex)),
    /canonical ground path/u,
  );

  const tickZeroProgress = JSON.parse(forgedGround.serialize());
  tickZeroProgress.state.segmentProgress = 500;
  tickZeroProgress.state.position = {
    x: (tickZeroProgress.state.segmentStart.x +
      tickZeroProgress.state.route[0].x) / 2,
    y: (tickZeroProgress.state.segmentStart.y +
      tickZeroProgress.state.route[0].y) / 2,
  };
  assert.equal(tickZeroProgress.state.tick, 0);
  assert.throws(
    () => BattleMovement.restore(JSON.stringify(tickZeroProgress)),
    /not reachable/u,
  );

  const tickZeroIndex = JSON.parse(forgedGround.serialize());
  const fullRoute = [
    tickZeroIndex.state.routeOrigin,
    ...tickZeroIndex.state.route,
  ];
  tickZeroIndex.state.routeIndex = 5;
  tickZeroIndex.state.route = fullRoute.slice(5);
  tickZeroIndex.state.edgeStart = { ...fullRoute[4] };
  tickZeroIndex.state.segmentStart = { ...fullRoute[4] };
  tickZeroIndex.state.position = { ...fullRoute[4] };
  tickZeroIndex.state.anchor = { ...fullRoute[5] };
  tickZeroIndex.state.segmentLength = 1_000;
  tickZeroIndex.state.segmentProgress = 0;
  assert.throws(
    () => BattleMovement.restore(JSON.stringify(tickZeroIndex)),
    /not reachable/u,
  );

  const alternateEdge = JSON.parse(forgedGround.serialize());
  const alternateOrigin = { x: 9_500, y: 10_500 };
  alternateEdge.state.routeOrigin = alternateOrigin;
  alternateEdge.state.routeIndex = 0;
  alternateEdge.state.route = findGroundPath(
    alternateOrigin,
    alternateEdge.state.target.position,
  );
  alternateEdge.state.anchor = alternateOrigin;
  alternateEdge.state.edgeStart = { ...alternateEdge.state.initialPosition };
  alternateEdge.state.segmentStart = { ...alternateEdge.state.initialPosition };
  alternateEdge.state.position = { ...alternateEdge.state.initialPosition };
  alternateEdge.state.segmentLength = 1_000;
  alternateEdge.state.segmentProgress = 0;
  assert.throws(
    () => BattleMovement.restore(JSON.stringify(alternateEdge)),
    /not reachable/u,
  );

  const oneTick = new BattleMovement({
    mode: "ground",
    position: { x: 8_500, y: 10_500 },
    speed: 1_000,
  });
  oneTick.setTarget(destination({ x: 8_500, y: 21_500 }));
  oneTick.step();
  const adjacentTick = JSON.parse(oneTick.serialize());
  adjacentTick.state.tick += 1;
  assert.throws(
    () => BattleMovement.restore(JSON.stringify(adjacentTick)),
    /not reachable/u,
  );
  const adjacentRemainder = JSON.parse(oneTick.serialize());
  adjacentRemainder.state.remainder += 1;
  assert.throws(
    () => BattleMovement.restore(JSON.stringify(adjacentRemainder)),
    /not reachable/u,
  );

  const normalizedStop = new BattleMovement({
    mode: "ground",
    position: { x: 3_500, y: 10_500 },
    speed: 1_000,
  });
  normalizedStop.setTarget(destination({ x: 3_500, y: 22_500 }));
  normalizedStop.stepMany(17);
  normalizedStop.stop();
  assert.equal(normalizedStop.state.routeIndex, 0);
  const stoppedIndex = JSON.parse(normalizedStop.serialize());
  stoppedIndex.state.routeIndex = 999;
  assert.throws(
    () => BattleMovement.restore(JSON.stringify(stoppedIndex)),
    /noncanonical stopped route provenance/u,
  );


  const riverForgery = JSON.parse(forgedGround.serialize());
  riverForgery.state.anchor = { x: 8_500, y: 11_500 };
  riverForgery.state.edgeStart = { x: 8_500, y: 10_500 };
  riverForgery.state.route = [];
  for (let y = 11_500; y <= 21_500; y += 1_000) {
    riverForgery.state.route.push({ x: 8_500, y });
  }
  assert.throws(
    () => BattleMovement.restore(JSON.stringify(riverForgery)),
    /ground navigation node/u,
  );

  const nonshortest = JSON.parse(forgedGround.serialize());
  nonshortest.state.route.splice(
    3,
    0,
    { ...nonshortest.state.route[1] },
    { ...nonshortest.state.route[2] },
  );
  assert.throws(
    () => BattleMovement.restore(JSON.stringify(nonshortest)),
    /canonical ground path/u,
  );
});
