import assert from "node:assert/strict";
import test from "node:test";
import {
  ReflectionEncounter,
  createReflectionSpecialFixture,
} from "../src/content/cards/special-projectiles-reflection.js";

function withCommands(commands) {
  const setup = createReflectionSpecialFixture();
  return new ReflectionEncounter({ ...setup, commands });
}

function command(targetId, tick) {
  return { targetId, tick, type: "kill-entity" };
}

function health(encounter, entityId) {
  return encounter.state.entities.find(({ id }) => id === entityId).hitpoints;
}

test("reflection: initial-boundary death executes and does not block later commands", () => {
  const encounter = withCommands([command(201, 0), command(301, 3)]);
  assert.equal(encounter.state.tick, 0);
  assert.equal(health(encounter, 201), 0);
  assert.deepEqual(encounter.replay.filter(({ type }) => type === "reflection-command"), [
    { targetId: 201, tick: 0, type: "reflection-command" },
  ]);
  encounter.run();
  assert.equal(health(encounter, 301), 0);
  assert.equal(encounter.replay.some(({ type }) => type === "projectile-reflection"), false);
  assert.deepEqual(encounter.replay.filter(({ type }) => type === "reflection-command"), [
    { targetId: 201, tick: 0, type: "reflection-command" },
    { targetId: 301, tick: 3, type: "reflection-command" },
  ]);
  assert.deepEqual(encounter.replay.filter(({ type }) => type === "projectile-fizzle"), [
    { projectileId: 1, status: "target-dead", tick: 3, type: "projectile-fizzle" },
  ]);
});

test("reflection: initial source death preserves launched flight and target-death policy", () => {
  const encounter = withCommands([command(101, 0)]);
  assert.equal(health(encounter, 101), 0);
  encounter.run();
  const reflected = encounter.replay.filter(({ type }) => type === "projectile-reflection");
  assert.equal(reflected.length, 1);
  assert.equal(reflected[0].tick, 4);
  assert.deepEqual(encounter.replay.filter(({ type }) => type === "projectile-fizzle"), [
    { projectileId: 2, status: "target-dead", tick: 5, type: "projectile-fizzle" },
  ]);
  assert.equal(health(encounter, 301), 1000);
});

test("reflection: restore at zero and later boundaries does not lose or repeat commands", () => {
  const commands = [command(201, 0), command(301, 3)];
  const expected = withCommands(commands);
  expected.run();
  for (const tick of [0, 1, 2, 3]) {
    const encounter = withCommands([...commands].reverse());
    encounter.stepMany(tick);
    const restored = ReflectionEncounter.restore(encounter.serialize());
    assert.deepEqual(restored.state, encounter.state);
    assert.deepEqual(restored.replay, encounter.replay);
    restored.run();
    assert.deepEqual(restored.state, expected.state);
    assert.deepEqual(restored.replay, expected.replay);
    assert.equal(restored.serialize(), expected.serialize());
  }
});
