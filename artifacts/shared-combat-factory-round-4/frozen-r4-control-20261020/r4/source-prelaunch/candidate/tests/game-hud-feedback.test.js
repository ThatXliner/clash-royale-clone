import assert from "node:assert/strict";
import test from "node:test";

import { createPlayableRoster } from "../src/content/playable-roster.js";
import { GameSession } from "../src/sim/game-session.js";
import { createShippedGameSessionSetup } from "../src/ui/game-browser-entry.js";

const SOUTH_POINT = { x: 3_500, y: 14_500 };

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function cardCosts() {
  return new Map(createPlayableRoster().map(({ cost, id }) => [id, cost]));
}

function deployCommand(session, commandId = 0) {
  const state = session.state;
  const slot = 0;
  return canonical({
    cardId: state.decks.south.hand[slot],
    commandId,
    point: SOUTH_POINT,
    slot,
    tick: state.tick,
    type: "deploy",
  });
}

function feedback(session) {
  return session.projectionSnapshot().hudFeedback;
}

function assertFrozenFeedback(value) {
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.lastCardPlay), true);
  assert.ok(Object.values(value.lastCardPlay).every((receipt) => (
    receipt === null || Object.isFrozen(receipt)
  )));
}

test("game HUD feedback: shipped session starts empty and records both accepted card plays", () => {
  const session = new GameSession(createShippedGameSessionSetup("hud-feedback"));
  const costs = cardCosts();
  const initial = feedback(session);
  assert.deepEqual(initial, { lastCardPlay: { north: null, south: null } });
  assertFrozenFeedback(initial);

  const initialState = session.state;
  const southCardId = initialState.decks.south.hand[0];
  const northHand = initialState.decks.north.hand;
  session.submitPlayerCommand(deployCommand(session));
  session.step();

  const deployedNorth = session.replay.find((event) =>
    event.type === "session-deployed" && event.side === "north");
  assert.ok(deployedNorth);
  const northCardId = deployedNorth.deployment.cardId;
  const projected = feedback(session);
  assert.deepEqual(projected.lastCardPlay.south, {
    cardId: southCardId,
    cost: costs.get(southCardId),
    slot: 0,
    tick: 0,
  });
  assert.deepEqual(projected.lastCardPlay.north, {
    cardId: northCardId,
    cost: costs.get(northCardId),
    slot: northHand.indexOf(northCardId),
    tick: 0,
  });
  assertFrozenFeedback(projected);
  assert.equal(Object.hasOwn(session.state, "hudFeedback"), false);

  const serialized = session.serialize();
  const replay = session.replayBytes();
  feedback(session);
  assert.equal(session.serialize(), serialized);
  assert.equal(session.replayBytes(), replay);

  session.restart();
  assert.deepEqual(feedback(session), { lastCardPlay: { north: null, south: null } });
});

test("game HUD feedback: direct, chunked, and restored sessions have identical receipts", () => {
  const setup = createShippedGameSessionSetup("hud-feedback-continuation");
  const direct = new GameSession(setup);
  direct.submitPlayerCommand(deployCommand(direct));
  direct.stepMany(120);
  const directFeedback = feedback(direct);

  const chunked = new GameSession(setup);
  chunked.submitPlayerCommand(deployCommand(chunked));
  for (const count of [1, 17, 3, 41, 58]) chunked.stepMany(count);
  assert.deepEqual(feedback(chunked), directFeedback);

  const restored = GameSession.restore(direct.serialize());
  assert.deepEqual(feedback(restored), directFeedback);
  assertFrozenFeedback(feedback(restored));
});
