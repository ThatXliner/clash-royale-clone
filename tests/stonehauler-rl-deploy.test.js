import assert from "node:assert/strict";
import test from "node:test";
import { PLAYABLE_CARD_IDS } from "../src/content/playable-roster.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";
import { createRLEnvironment, RLEnvironment } from "../src/rl/environment.js";

function openingSeed(deck) {
  for (let seed = 0; seed < 1_000; seed += 1) {
    if (new DeckCycle({ deck, seed: `${seed}:south` }).state.hand.includes("stonehauler")) {
      return seed;
    }
  }
  throw new Error("no bounded Stonehauler opening-hand seed");
}

test("Stonehauler RL action spends five, creates one body, and restores through deployment", () => {
  const deck = ["stonehauler", ...PLAYABLE_CARD_IDS.slice(0, 7)];
  const env = createRLEnvironment({
    deck, seed: openingSeed(deck), strideTicks: 1, horizonTicks: 90,
  });
  const opening = env.reset();
  const slot = opening.hand.indexOf("stonehauler");
  assert.notEqual(slot, -1);
  const action = env.actionSpace().actions.find(({ point, slot: candidate }) =>
    candidate === slot && point?.x === 3_500 && point?.y === 14_500);
  assert.ok(action);
  assert.equal(opening.actionMask[action.id], true);

  const transition = env.step(action.id);
  assert.equal(transition.observation.elixir, opening.elixir - 5);
  assert.notEqual(transition.observation.hand[slot], "stonehauler");
  const bodies = transition.observation.units.filter(({ cardId, side }) =>
    cardId === "stonehauler" && side === "south");
  assert.equal(bodies.length, 1, "the RL action materializes exactly one original unit");

  const checkpoint = env.serialize();
  const saved = JSON.parse(checkpoint);
  const setup = JSON.parse(saved.session).setup;
  assert.deepEqual(setup.deck, deck);
  assert.ok(setup.legalNorthDeployments.some(({ cardId }) => cardId === "stonehauler"),
    "the selected card remains available to the ordinary AI deployment path");
  const witness = JSON.parse(setup.battleSetup);
  const card = witness.roster.find(({ id }) => id === "stonehauler");
  assert.equal(card.targetMode, "structures");
  for (const policy of [card.entities[0].bodyRadiusPolicy,
    card.entities[0].deliveryPolicy, card.entities[0].layerPolicy]) {
    assert.equal(policy.kind, "question");
    const receipt = witness.questions.find(({ key }) => key === policy.questionKey);
    assert.ok(receipt, "the replay closes every runtime estimate against an explicit receipt");
    assert.equal(receipt.authoritative, false);
  }
  const session = GameSession.restore(saved.session);
  assert.equal(session.replay.filter(({ deployment, side, type }) =>
    type === "session-deployed" && side === "south" &&
    deployment.cardId === "stonehauler").length, 1);

  const restored = RLEnvironment.restore(checkpoint);
  assert.equal(restored.serialize(), checkpoint);
  for (let index = 0; index < 61; index += 1) {
    assert.deepEqual(restored.step(0), env.step(0));
  }
  assert.equal(restored.serialize(), env.serialize(),
    "checkpoint continuation stays byte-exact across the deployment boundary");
  assert.ok(env.observe().units.some(({ cardId, id, side }) =>
    cardId === "stonehauler" && side === "south" && id === bodies[0].id),
  "the deployed body keeps its identity through startup and early combat");
});
