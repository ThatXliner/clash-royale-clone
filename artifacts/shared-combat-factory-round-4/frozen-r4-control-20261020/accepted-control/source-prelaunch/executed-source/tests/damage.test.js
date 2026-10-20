import assert from "node:assert/strict";
import test from "node:test";

import { DamageSystem, HealthStore } from "../src/sim/damage.js";

test("damage: health values and stable numeric IDs are strictly validated", () => {
  const health = new DamageSystem();
  assert.deepEqual(health.add(7, 100, 75), {
    currentHealth: 75,
    dead: false,
    id: 7,
    maxHealth: 100,
  });
  health.add(2, 50);
  assert.deepEqual(health.list().map(({ id }) => id), [2, 7]);
  assert.equal(HealthStore, DamageSystem);

  for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => health.add(id, 1), /positive safe integer/);
  }
  for (const value of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => health.add(20, value), /positive safe integer/);
  }
  assert.throws(() => health.add(20, 10, 11), /must not exceed/);
  assert.throws(() => health.add(7, 100), /already has health/);
});

test("damage: sequential armor-free damage clamps overkill and dies once", () => {
  const health = new DamageSystem();
  health.add(1, 10);

  assert.deepEqual(health.damage(1, 4), {
    amount: 4,
    currentHealth: 6,
    events: [{
      amount: 4,
      currentHealthAfter: 6,
      currentHealthBefore: 10,
      targetId: 1,
      type: "damage",
    }],
    status: "applied",
    targetId: 1,
  });
  assert.deepEqual(health.damage(1, 99).events, [
    {
      amount: 99,
      currentHealthAfter: 0,
      currentHealthBefore: 6,
      targetId: 1,
      type: "damage",
    },
    { targetId: 1, type: "death" },
  ]);
  assert.deepEqual(health.get(1), {
    currentHealth: 0,
    dead: true,
    id: 1,
    maxHealth: 10,
  });
  assert.deepEqual(health.damage(1, 5), {
    amount: 5,
    currentHealth: 0,
    events: [],
    status: "dead",
    targetId: 1,
  });
  assert.deepEqual(health.damage(999, 5), {
    amount: 5,
    currentHealth: null,
    events: [],
    status: "missing",
    targetId: 999,
  });
});

test("damage: sequential hits resolve in caller input order", () => {
  const health = new DamageSystem();
  health.add(1, 10);
  assert.equal(health.damage(1, 3).currentHealth, 7);
  assert.equal(health.damage(1, 4).currentHealth, 3);
  assert.equal(health.damage(1, 2).currentHealth, 1);
});

test("damage: simultaneous lethal hits trade from pre-batch alive state", () => {
  const health = new DamageSystem();
  health.add(9, 5);
  health.add(2, 5);

  const resolution = health.damageSimultaneously([
    { amount: 5, targetId: 9 },
    { amount: 5, targetId: 2 },
  ]);
  assert.deepEqual(resolution.events, [
    {
      amount: 5,
      currentHealthAfter: 0,
      currentHealthBefore: 5,
      targetId: 9,
      type: "damage",
    },
    {
      amount: 5,
      currentHealthAfter: 0,
      currentHealthBefore: 5,
      targetId: 2,
      type: "damage",
    },
    { targetId: 2, type: "death" },
    { targetId: 9, type: "death" },
  ]);
  assert.equal(health.get(2).dead, true);
  assert.equal(health.get(9).dead, true);
});

test("damage: simultaneous multiple hits aggregate deterministically", () => {
  const health = new DamageSystem();
  health.add(4, 10);
  const resolution = health.damageSimultaneously([
    { amount: 7, targetId: 4 },
    { amount: 7, targetId: 4 },
    { amount: 1, targetId: 404 },
  ]);

  assert.deepEqual(
    resolution.events.map((event) => [
      event.type,
      event.targetId,
      event.currentHealthBefore,
      event.currentHealthAfter,
    ]),
    [
      ["damage", 4, 10, 3],
      ["damage", 4, 3, 0],
      ["death", 4, undefined, undefined],
    ],
  );
  assert.deepEqual(resolution.results[2], {
    amount: 1,
    currentHealth: null,
    status: "missing",
    targetId: 404,
  });
  assert.equal(health.get(4).currentHealth, 0);
});

test("damage: invalid batches are atomic, including unsafe aggregation", () => {
  const health = new DamageSystem();
  health.add(1, Number.MAX_SAFE_INTEGER);
  const before = health.serialize();

  assert.throws(
    () => health.damageSimultaneously([
      { amount: 3, targetId: 1 },
      { amount: -1, targetId: 1 },
    ]),
    /non-negative safe integer/,
  );
  assert.equal(health.serialize(), before);

  assert.throws(
    () => health.damageSimultaneously([
      { amount: Number.MAX_SAFE_INTEGER, targetId: 1 },
      { amount: 1, targetId: 1 },
    ]),
    /exceeds safe integer/,
  );
  assert.equal(health.serialize(), before);
  assert.throws(
    () => health.damageSimultaneously([{ amount: 1, extra: 1, targetId: 1 }]),
    /invalid shape/,
  );
  assert.equal(health.serialize(), before);
});

test("damage: returned values are isolated JSON", () => {
  const health = new DamageSystem();
  const added = health.add(1, 10);
  added.currentHealth = 1;
  const listed = health.list();
  listed[0].dead = true;
  const resolution = health.damageSimultaneously([
    { amount: 1, targetId: 1 },
  ]);
  resolution.events[0].currentHealthAfter = 0;
  assert.equal(health.get(1).currentHealth, 9);
  assert.equal(health.get(1).dead, false);
});

test("damage: restore continues byte-identically", () => {
  const uninterrupted = new DamageSystem();
  uninterrupted.add(7, 30);
  uninterrupted.add(2, 12);
  uninterrupted.damage(7, 4);

  const restored = DamageSystem.restore(uninterrupted.serialize());
  const hits = [
    { amount: 12, targetId: 2 },
    { amount: 6, targetId: 7 },
  ];
  assert.deepEqual(
    restored.damageSimultaneously(hits),
    uninterrupted.damageSimultaneously(hits),
  );
  assert.equal(restored.serialize(), uninterrupted.serialize());
});

test("damage: malformed snapshots are rejected", () => {
  const invalid = [
    "no",
    "null",
    "{}",
    JSON.stringify({ combatants: [], version: 2 }),
    JSON.stringify({ combatants: {}, version: 1 }),
    JSON.stringify({
      combatants: [{
        currentHealth: 0, dead: false, id: 1, maxHealth: 10,
      }],
      version: 1,
    }),
    JSON.stringify({
      combatants: [{
        currentHealth: 1, dead: true, id: 1, maxHealth: 10,
      }],
      version: 1,
    }),
    JSON.stringify({
      combatants: [
        { currentHealth: 1, dead: false, id: 2, maxHealth: 1 },
        { currentHealth: 1, dead: false, id: 1, maxHealth: 1 },
      ],
      version: 1,
    }),
    JSON.stringify({
      combatants: [{
        currentHealth: 11, dead: false, id: 1, maxHealth: 10,
      }],
      version: 1,
    }),
    JSON.stringify({ combatants: [], surprise: true, version: 1 }),
  ];
  for (const snapshot of invalid) {
    assert.throws(() => DamageSystem.restore(snapshot));
  }
  assert.throws(() => DamageSystem.restore({}), /must be a string/);
});
