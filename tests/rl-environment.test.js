import assert from "node:assert/strict";
import test from "node:test";
import {
  createRLEnvironment,
  RL_ACTION_COUNT,
  RLEnvironment,
} from "../src/rl/environment.js";
import { EDITABLE_DECK_CARD_IDS } from "../src/content/session-troop-roster.js";
import { PLAYABLE_CARD_IDS } from "../src/content/playable-roster.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function checkpointWithEngineOperation(env, { pause, pending }) {
  const wrapper = JSON.parse(env.serialize());
  const session = GameSession.restore(wrapper.session);
  if (pending) {
    const observation = env.observe();
    const actionId = firstLegalDeployment(observation);
    const action = env.actionSpace().actions[actionId];
    session.submitPlayerCommand(JSON.stringify({
      cardId: observation.hand[action.slot],
      commandId: 0,
      point: action.point,
      slot: action.slot,
      tick: observation.tick,
      type: "deploy",
    }));
    wrapper.nextCommandId = 1;
  }
  if (pause) session.pause();
  wrapper.session = session.serialize();
  return canonical(wrapper);
}

function firstLegalDeployment(observation, slot = 0) {
  const start = 1 + slot * 576;
  const end = start + 576;
  for (let actionId = start; actionId < end; actionId += 1) {
    if (observation.actionMask[actionId]) return actionId;
  }
  throw new Error(`no legal deployment for hand slot ${slot}`);
}

function seedWithCardInHand(deck, cardId) {
  for (let seed = 0; seed < 1_000; seed += 1) {
    if (new DeckCycle({ deck, seed: `${seed}:south` }).state.hand.includes(cardId)) {
      return seed;
    }
  }
  throw new Error(`${cardId} has no bounded deterministic south hand witness`);
}

test("RL environment exposes a finite action catalogue and masks legal deploys", () => {
  const env = createRLEnvironment({ seed: 17, strideTicks: 6, horizonTicks: 30 });
  const observation = env.reset();
  const space = env.actionSpace();

  assert.equal(RL_ACTION_COUNT, 2_305);
  assert.equal(space.actionCount, RL_ACTION_COUNT);
  assert.equal(space.actions.length, RL_ACTION_COUNT);
  assert.deepEqual(space.actions[0], { id: 0, type: "wait" });
  assert.deepEqual(space.actions[1 + 2 * 576 + 5 * 18 + 4], {
    id: 1 + 2 * 576 + 5 * 18 + 4,
    point: { x: 4_500, y: 5_500 },
    slot: 2,
    type: "deploy",
  });
  assert.equal(observation.actionMask.length, RL_ACTION_COUNT);
  assert.equal(observation.actionMask[0], true);

  const cardId = observation.hand[0];
  const actionId = firstLegalDeployment(observation);
  const transition = env.step(actionId);
  assert.equal(transition.info.actionId, actionId);
  assert.equal(transition.info.ticksAdvanced, 6);
  assert.equal(transition.observation.tick, 6);
  assert.equal(transition.observation.status, "running");
  assert.ok(transition.observation.units.some((unit) =>
    unit.side === "south" && unit.cardId === cardId));
  assert.notEqual(transition.observation.hand[0], cardId,
    "playing the selected slot cycles the shared deck state");
});

test("seeded trajectories and restored checkpoints continue identically", () => {
  const config = { seed: "same-seed", strideTicks: 5, horizonTicks: 25 };
  const left = createRLEnvironment(config);
  const right = createRLEnvironment(config);
  assert.deepEqual(left.observe(), right.observe());
  const initial = left.serialize();
  left.reset();
  assert.equal(left.serialize(), initial, "reset without options reuses its selected config");
  left.reset({ seed: "replacement-seed" });
  const resetConfig = JSON.parse(left.serialize()).config;
  assert.equal(resetConfig.seed, "replacement-seed");
  assert.deepEqual(resetConfig.deck, PLAYABLE_CARD_IDS);
  assert.equal(resetConfig.strideTicks, config.strideTicks);
  assert.equal(resetConfig.horizonTicks, config.horizonTicks);
  left.reset({ seed: config.seed });
  assert.equal(left.serialize(), initial, "a partial reset can restore the original seed");

  for (const action of [firstLegalDeployment(left.observe()), 0]) {
    assert.deepEqual(left.step(action), right.step(action));
  }

  const restored = RLEnvironment.restore(left.serialize());
  assert.deepEqual(restored.observe(), left.observe());
  assert.deepEqual(restored.step(0), left.step(0));
  assert.deepEqual(restored.observe(), left.observe());
});

test("separate instances and a custom shared deck remain independent", () => {
  const customDeck = ["stonehauler", ...PLAYABLE_CARD_IDS.slice(0, 7)];
  const custom = createRLEnvironment({
    deck: customDeck,
    seed: 9,
    strideTicks: 2,
    horizonTicks: 8,
  });
  const other = createRLEnvironment({ seed: 9, strideTicks: 2, horizonTicks: 8 });
  const privileged = JSON.parse(custom.serialize());
  const engine = JSON.parse(privileged.session);

  assert.deepEqual(engine.setup.deck, customDeck);
  assert.ok(custom.observe().hand.every((cardId) => customDeck.includes(cardId)));
  const otherBefore = other.serialize();
  custom.step(0);
  assert.equal(other.serialize(), otherBefore);
});

test("RL mask casts an editable Squall Orb center point and restores its pending effect", () => {
  const deck = ["squall-orb", ...EDITABLE_DECK_CARD_IDS.slice(0, 7)];
  const env = createRLEnvironment({ deck, seed: 1, strideTicks: 1, horizonTicks: 5 });
  const observation = env.observe();
  const slot = observation.hand.indexOf("squall-orb");
  assert.notEqual(slot, -1, "the deterministic policy starts with Squall Orb in hand");
  const centerAction = env.actionSpace().actions.find(({ point, slot: actionSlot }) =>
    actionSlot === slot && point.x === 8_500 && point.y === 15_500);
  assert.ok(centerAction);
  assert.equal(observation.actionMask[centerAction.id], true,
    "the effect center placement is included in the policy's legal-action mask");

  const cast = env.step(centerAction.id);
  assert.equal(cast.observation.tick, 1);
  assert.equal(cast.observation.elixir, observation.elixir - 4);
  assert.notEqual(cast.observation.hand[slot], "squall-orb",
    "the shared deck cycles after the cast");
  const pendingBytes = env.serialize();
  const engine = JSON.parse(JSON.parse(pendingBytes).session);
  assert.ok(engine.transcript.some(({ command, type }) =>
    type === "submit" && command.type === "spell" && command.cardId === "squall-orb"),
  "the RL adapter submits a typed GameSession spell command");

  const restored = RLEnvironment.restore(pendingBytes);
  assert.equal(restored.serialize(), pendingBytes,
    "restore retains the pending radius effect and action counter exactly");
  assert.deepEqual(restored.step(0), env.step(0));
  assert.equal(restored.serialize(), env.serialize(),
    "pending effect replay remains byte-exact after restore");
});

test("RL reset and legal mask deploy both sourced projectile squads with exact deck restore", () => {
  for (const [cardId, memberCount, hitpoints, damage, layer] of [
    ["sunthread-pair", 2, 304, 107, "ground"],
    ["duskwing-trio", 3, 230, 117, "air"],
  ]) {
    const deck = [cardId, ...PLAYABLE_CARD_IDS.slice(0, 7)];
    const seed = seedWithCardInHand(deck, cardId);
    const env = createRLEnvironment({ seed: 0, strideTicks: 1, horizonTicks: 10 });
    const observation = env.reset({ deck, seed, strideTicks: 1, horizonTicks: 10 });
    const slot = observation.hand.indexOf(cardId);
    assert.notEqual(slot, -1, `${cardId} is in the reset hand`);
    const action = env.actionSpace().actions.find(({ point, slot: actionSlot }) =>
      actionSlot === slot && point.x === 8_500 && point.y === 14_500);
    assert.ok(action, `${cardId} has a center own-side action`);
    assert.equal(observation.actionMask[action.id], true,
      `${cardId} center action is marked legal`);

    const transition = env.step(action.id);
    assert.equal(transition.info.actionId, action.id);
    assert.equal(transition.observation.tick, 1);
    const publicUnits = transition.observation.units.filter(({ cardId: id, side }) =>
      id === cardId && side === "south");
    assert.equal(publicUnits.length, memberCount);
    assert.ok(publicUnits.every((unit) => unit.maxHitpoints === hitpoints &&
      unit.count === memberCount && unit.layer === layer));

    const bytes = env.serialize();
    const snapshot = JSON.parse(bytes);
    const session = GameSession.restore(snapshot.session);
    assert.deepEqual(snapshot.config.deck, deck);
    assert.deepEqual(JSON.parse(snapshot.session).setup.deck, deck);
    const typedReceipt = session.state.cardRuntime.history.find(({ cardId: id }) => id === cardId);
    assert.deepEqual({ cardId: typedReceipt?.cardId, kind: typedReceipt?.kind,
      placementClass: typedReceipt?.placementClass }, {
      cardId, kind: "unit", placementClass: "ground_entity",
    });
    const committed = session.replay.find(({ side, type }) =>
      side === "south" && type === "session-deployed");
    assert.equal(committed?.deployment.cardId, cardId);
    assert.equal(committed?.deployment.entityIds.length, memberCount);
    const runtimeUnits = session.state.battle.units.filter(({ cardId: id, side }) =>
      id === cardId && side === "south");
    assert.ok(runtimeUnits.every((unit) => unit.damage === damage &&
      unit.delivery === "projectile" && unit.layer === layer));

    const restored = RLEnvironment.restore(bytes);
    assert.equal(restored.serialize(), bytes);
    assert.deepEqual(restored.observe(), transition.observation);
    assert.deepEqual(restored.step(0), env.step(0));
    assert.equal(restored.serialize(), env.serialize());
  }
});

test("horizon clipping truncates exactly and rejects later steps", () => {
  const env = createRLEnvironment({ seed: 4, strideTicks: 7, horizonTicks: 10 });
  const first = env.step(0);
  assert.equal(first.observation.tick, 7);
  assert.equal(first.terminated, false);
  assert.equal(first.truncated, false);

  const second = env.step(0);
  assert.equal(second.observation.tick, 10);
  assert.equal(second.terminated, false);
  assert.equal(second.truncated, true);
  assert.equal(second.observation.status, "truncated");
  assert.ok(second.observation.actionMask.every((legal) => legal === false));
  const checkpoint = env.serialize();
  const restored = RLEnvironment.restore(checkpoint);
  assert.deepEqual(restored.observe(), second.observation);
  assert.throws(() => env.step(0), /finished RL environment/);
  assert.throws(() => restored.step(0), /finished RL environment/);
  assert.equal(env.serialize(), checkpoint);
});

test("restore rejects paused or pending GameSession checkpoints", () => {
  const env = createRLEnvironment({ seed: 22, strideTicks: 4, horizonTicks: 20 });
  for (const state of [
    { pause: true, pending: false },
    { pause: false, pending: true },
    { pause: true, pending: true },
  ]) {
    const checkpoint = checkpointWithEngineOperation(env, state);
    assert.throws(() => RLEnvironment.restore(checkpoint),
      /cannot contain a paused session or pending player commands/);
  }
});

test("masked and out-of-range actions are atomic", () => {
  const env = createRLEnvironment({ seed: 5, strideTicks: 4, horizonTicks: 20 });
  const observation = env.observe();
  const masked = observation.actionMask.findIndex((legal, id) => id > 0 && !legal);
  const checkpoint = env.serialize();

  assert.notEqual(masked, -1);
  assert.throws(() => env.step(masked), /masked/);
  assert.throws(() => env.step(RL_ACTION_COUNT), /actionId/);
  assert.throws(() => env.step(1.5), /actionId/);
  assert.equal(env.serialize(), checkpoint);
  assert.equal(env.observe().tick, observation.tick);
});

test("observations are allowlisted, JSON-safe, and detached", () => {
  const env = createRLEnvironment({ seed: "private-policy-seed", strideTicks: 2, horizonTicks: 10 });
  const observation = env.observe();
  const allowed = [
    "actionMask", "crowns", "elixir", "hand", "next", "phase", "status",
    "tick", "towers", "units", "version",
  ];
  assert.deepEqual(Object.keys(observation).sort(), [...allowed].sort());
  assert.deepEqual(JSON.parse(JSON.stringify(observation)), observation);
  const serialized = JSON.stringify(observation);
  for (const forbidden of ["private-policy-seed", "opponent", "rng", "transcript", "pending", "queue"]) {
    assert.equal(serialized.includes(forbidden), false, `policy output leaked ${forbidden}`);
  }

  const original = structuredClone(observation);
  observation.actionMask[0] = false;
  observation.hand[0] = "changed";
  observation.towers[0].hitpoints = -1;
  observation.towers[0].position.x = -1;
  assert.deepEqual(env.observe(), original);

  const space = env.actionSpace();
  space.actions[0].id = 99;
  space.actions[1].point.x = -1;
  assert.deepEqual(env.actionSpace().actions[0], { id: 0, type: "wait" });
  assert.equal(env.actionSpace().actions[1].point.x, 500);
});

test("natural engine completion reports one sparse reward and seals the episode", () => {
  const env = createRLEnvironment({
    seed: 2,
    strideTicks: 600,
    horizonTicks: 18_000,
  });
  let observation = env.observe();
  let result;
  let steps = 0;
  let deployments = 0;
  let totalReward = 0;
  while (observation.status === "running") {
    let actionId = 0;
    for (let slot = 0; slot < 4; slot += 1) {
      const nearBridge = 1 + slot * 576 + 14 * 18 + 3;
      if (observation.actionMask[nearBridge]) {
        actionId = nearBridge;
        break;
      }
    }
    result = env.step(actionId);
    if (actionId !== 0) deployments += 1;
    totalReward += result.reward;
    steps += 1;
    observation = result.observation;
  }

  assert.equal(result.terminated, true);
  assert.equal(result.truncated, false);
  assert.ok(deployments > 0);
  assert.ok(steps <= 30, "each match step is bounded to 600 ticks");
  assert.ok(observation.tick < 18_000, "natural battle result precedes the external horizon");
  assert.ok([-1, 0, 1].includes(result.reward));
  assert.equal(totalReward, result.reward, "only the terminal transition receives a reward");
  assert.equal(result.observation.status, "terminated");
  assert.ok(result.observation.actionMask.every((legal) => legal === false));
  const checkpoint = env.serialize();
  const restored = RLEnvironment.restore(checkpoint);
  assert.deepEqual(restored.observe(), result.observation);
  assert.throws(() => restored.step(0), /finished RL environment/);
  assert.throws(() => env.step(0), /finished RL environment/);
  assert.equal(env.serialize(), checkpoint);
});

test("wait-only seed 2 reaches its pinned natural engine terminal after checkpoint restore", () => {
  const config = { seed: 2, strideTicks: 600, horizonTicks: 18_000 };
  const expected = {
    crowns: { north: 3, south: 0 },
    endedAtTick: 4_898,
    kind: "win",
    reason: "central_destroyed",
    reward: -1,
    tick: 4_899,
    winner: "north",
  };
  const env = createRLEnvironment(config);
  let observation = env.observe();
  let transitions = 0;
  let totalReward = 0;
  while (observation.tick < 2_400) {
    const result = env.step(0);
    observation = result.observation;
    totalReward += result.reward;
    transitions += 1;
  }

  const checkpoint = env.serialize();
  const restored = RLEnvironment.restore(checkpoint);
  assert.deepEqual(restored.observe(), observation);

  let result;
  while (observation.status === "running") {
    result = env.step(0);
    const restoredResult = restored.step(0);
    assert.deepEqual(restoredResult, result,
      "the restored wait-only episode follows the original transition exactly");
    observation = result.observation;
    totalReward += result.reward;
    transitions += 1;
  }

  assert.equal(transitions, 9);
  assert.equal(observation.tick, expected.tick);
  assert.equal(result.info.ticksAdvanced, 99,
    "the final engine step stops at its natural terminal inside the 600-tick stride");
  assert.equal(result.terminated, true);
  assert.equal(result.truncated, false,
    "the distant external horizon cannot relabel natural engine completion");
  assert.equal(result.reward, expected.reward);
  assert.equal(totalReward, expected.reward, "only natural termination pays the sparse reward");
  assert.equal(observation.status, "terminated");
  assert.deepEqual(observation.crowns, expected.crowns);
  assert.ok(observation.tick < config.horizonTicks);
  assert.deepEqual(restored.observe(), observation);
  assert.equal(restored.serialize(), env.serialize(),
    "checkpoint-restored continuation reproduces the exact terminal wrapper snapshot");

  const terminalSnapshot = JSON.parse(env.serialize());
  const engine = GameSession.restore(terminalSnapshot.session);
  assert.equal(engine.state.terminal, true);
  assert.equal(engine.state.tick, expected.tick);
  assert.deepEqual(engine.state.clock.result, {
    crowns: expected.crowns,
    endedAtTick: expected.endedAtTick,
    kind: expected.kind,
    reason: expected.reason,
    winner: expected.winner,
  }, "the restored real GameSession supplies the pinned natural match result");
  assert.equal(totalReward, expected.reward);
  assert.throws(() => env.step(0), /finished RL environment/);
  assert.throws(() => restored.step(0), /finished RL environment/);
});
