import assert from "node:assert/strict";
import test from "node:test";

import { ProjectileCombat } from "../src/sim/projectile.js";

function entity(overrides) {
  return {
    attackRange: 4000,
    id: 1,
    kind: "troop",
    layer: "ground",
    maxHealth: 100,
    position: { x: 0, y: 0 },
    radius: 500,
    targetMode: "air_and_ground",
    targetable: true,
    ...overrides,
  };
}

function setup(overrides = {}) {
  return {
    entities: [
      entity({ id: 10 }),
      entity({ id: 20, position: { x: 5000, y: 0 }, targetMode: "none" }),
    ],
    ...overrides,
  };
}

function launch(overrides = {}) {
  return {
    attackerId: 10,
    damage: 30,
    radius: 100,
    speed: 1000,
    targetId: 20,
    tick: 0,
    ...overrides,
  };
}

test("projectile: launch snapshots static geometry and hits at exact contact tick", () => {
  const combat = new ProjectileCombat(setup());
  const projectile = combat.launch(launch());
  assert.deepEqual(projectile, {
    attackerId: 10,
    damage: 30,
    id: 1,
    impactTick: 5,
    launchTick: 0,
    origin: { x: 0, y: 0 },
    radius: 100,
    speed: 1000,
    targetId: 20,
    targetPosition: { x: 5000, y: 0 },
    targetRadius: 500,
  });
  for (let tick = 0; tick < 5; tick += 1) {
    assert.deepEqual(combat.step(tick), []);
  }
  assert.deepEqual(combat.step(5), [
    {
      projectileId: 1,
      status: "contact",
      targetId: 20,
      tick: 5,
      type: "impact",
    },
    {
      amount: 30,
      currentHealthAfter: 70,
      currentHealthBefore: 100,
      projectileId: 1,
      targetId: 20,
      tick: 5,
      type: "damage",
    },
  ]);
  assert.equal(combat.state.entities.find(({ id }) => id === 20).hitpoints, 70);
});

test("projectile: inclusive circle-edge range accepts boundary and rejects 1 millitile out", () => {
  const boundary = new ProjectileCombat(setup());
  assert.doesNotThrow(() => boundary.launch(launch()));

  const outside = new ProjectileCombat(setup({
    entities: [
      entity({ id: 10 }),
      entity({
        id: 20,
        position: { x: 5001, y: 0 },
        targetMode: "none",
      }),
    ],
  }));
  assert.throws(() => outside.launch(launch()), /not eligible or in attack range/);
  assert.deepEqual(outside.state.projectiles, []);
});

test("projectile: target modes cover ground, air, both, buildings, and none", () => {
  const cases = [
    ["ground", "ground", "troop", true],
    ["ground", "air", "troop", false],
    ["air", "air", "troop", true],
    ["air", "ground", "troop", false],
    ["air_and_ground", "air", "structure", true],
    ["buildings", "ground", "structure", true],
    ["buildings", "ground", "troop", false],
    ["none", "ground", "structure", false],
  ];
  for (const [targetMode, layer, kind, accepted] of cases) {
    const combat = new ProjectileCombat({
      entities: [
        entity({ id: 10, targetMode }),
        entity({
          id: 20,
          kind,
          layer,
          position: { x: 2000, y: 0 },
          targetMode: "none",
        }),
      ],
    });
    if (accepted) assert.doesNotThrow(() => combat.launch(launch()));
    else assert.throws(() => combat.launch(launch()));
  }
});

test("projectile: death before impact fizzles without damage or retargeting", () => {
  const combat = new ProjectileCombat(setup({
    entities: [
      entity({ id: 10 }),
      entity({ id: 11 }),
      entity({
        id: 20,
        maxHealth: 40,
        position: { x: 5000, y: 0 },
        targetMode: "none",
      }),
      entity({
        id: 30,
        position: { x: 4000, y: 0 },
        targetMode: "none",
      }),
    ],
  }));
  combat.launch(launch({ attackerId: 10, damage: 10, speed: 1000 }));
  combat.launch(launch({ attackerId: 11, damage: 40, speed: 5000 }));
  combat.step(0);
  const lethal = combat.step(1);
  assert.equal(lethal.find(({ type }) => type === "death").targetId, 20);
  for (let tick = 2; tick < 5; tick += 1) combat.step(tick);
  assert.deepEqual(combat.step(5), [{
    projectileId: 1,
    status: "target_dead",
    targetId: 20,
    tick: 5,
    type: "impact",
  }]);
  assert.deepEqual(
    combat.replay.filter(({ type }) => type === "damage").map(({ amount }) => amount),
    [40],
  );
  assert.equal(combat.state.entities.find(({ id }) => id === 30).hitpoints, 100);
});

test("projectile: same-tick impacts use projectile ID order and one damage batch", () => {
  const combat = new ProjectileCombat(setup({ entities: [
    entity({ id: 10 }),
    entity({ id: 11 }),
    entity({
      id: 20,
      maxHealth: 50,
      position: { x: 2000, y: 0 },
      targetMode: "none",
    }),
  ] }));
  combat.launch(launch({ attackerId: 10, damage: 30, speed: 1400 }));
  combat.launch(launch({ attackerId: 11, damage: 30, speed: 1400 }));
  combat.step(0);
  const events = combat.step(1);
  assert.deepEqual(
    events.filter(({ type }) => type === "impact").map(({ projectileId }) => projectileId),
    [1, 2],
  );
  assert.deepEqual(
    events.filter(({ type }) => type === "damage").map(
      ({ currentHealthAfter, currentHealthBefore, projectileId }) => ({
        currentHealthAfter,
        currentHealthBefore,
        projectileId,
      }),
    ),
    [
      { currentHealthAfter: 20, currentHealthBefore: 50, projectileId: 1 },
      { currentHealthAfter: 0, currentHealthBefore: 20, projectileId: 2 },
    ],
  );
  assert.equal(events.filter(({ type }) => type === "death").length, 1);
});

test("projectile: diagonal rational scheduling has an exact first contact boundary", () => {
  const combat = new ProjectileCombat(setup({ entities: [
    entity({ id: 10 }),
    entity({
      id: 20,
      position: { x: 3000, y: 4000 },
      targetMode: "none",
    }),
  ] }));
  assert.equal(combat.launch(launch({ radius: 0, speed: 1000 })).impactTick, 5);
});

test("projectile: chunked serialize/restore is byte and result identical mid-flight", () => {
  const original = new ProjectileCombat(setup());
  const isolated = launch();
  const projectile = original.launch(isolated);
  isolated.damage = 999;
  projectile.damage = 999;
  original.step(0);
  original.step(1);
  const restored = ProjectileCombat.restore(original.serialize());
  assert.equal(restored.serialize(), original.serialize());
  assert.deepEqual(restored.state, original.state);
  assert.deepEqual(restored.replay, original.replay);
  for (let tick = 2; tick <= 5; tick += 1) {
    assert.deepEqual(restored.step(tick), original.step(tick));
  }
  assert.equal(restored.serialize(), original.serialize());
  assert.deepEqual(restored.state, original.state);
  assert.deepEqual(restored.replay, original.replay);
});

test("projectile: invalid launch, tick, setup, and snapshot reject atomically", () => {
  assert.throws(() => new ProjectileCombat({ entities: [] , extra: true }));
  assert.throws(() => new ProjectileCombat({ entities: [
    entity({ id: 1 }),
    entity({ id: 1 }),
  ] }));

  const combat = new ProjectileCombat(setup());
  const before = combat.serialize();
  const replayBefore = combat.replay;
  for (const invalid of [
    launch({ tick: 1 }),
    launch({ speed: 0 }),
    launch({ damage: -1 }),
    launch({ targetId: 999 }),
    { ...launch(), extra: true },
  ]) {
    assert.throws(() => combat.launch(invalid));
    assert.equal(combat.serialize(), before);
    assert.deepEqual(combat.replay, replayBefore);
  }
  for (const tick of [-1, 1, 0.5, "0"]) {
    assert.throws(() => combat.step(tick));
    assert.equal(combat.serialize(), before);
  }
  for (const snapshot of [
    "not json",
    "{}",
    JSON.stringify({ history: [], setup: setup(), version: 2 }),
    JSON.stringify({ extra: true, history: [], setup: setup(), version: 1 }),
    JSON.stringify({
      history: [{ tick: 1, type: "step" }],
      setup: setup(),
      version: 1,
    }),
  ]) {
    assert.throws(() => ProjectileCombat.restore(snapshot));
  }
});
