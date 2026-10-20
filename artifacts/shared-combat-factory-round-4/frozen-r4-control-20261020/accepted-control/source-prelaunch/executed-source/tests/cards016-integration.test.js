import assert from "node:assert/strict";
import test from "node:test";

import {
  EDITABLE_MIXED_DECK_CARD_IDS,
  createEditableGameSessionSetup,
  createEditableMixedDeckWitness,
} from "../src/content/editable-deck.js";
import {
  EDITABLE_DECK_CARD_IDS,
  createEditableDeckWitness,
  projectSessionTroopBattleCard,
} from "../src/content/session-troop-roster.js";
import { PLAYABLE_CARD_IDS } from "../src/content/playable-roster.js";
import { RLEnvironment, RL_ACTION_COUNT } from "../src/rl/environment.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";
import { createShippedGameSessionSetup } from "../src/ui/game-browser-entry.js";

const GLOAMWING = "gloamwing-cluster";
const COPPERSHADE = "coppershade-flock";
const AIR_SWARMS = Object.freeze([GLOAMWING, COPPERSHADE]);
const CONFIDENCE_FIELDS = Object.freeze([
  ["count", "count"],
  ["damage", "damage"],
  ["deployTimeTicks", "deploy-time-ticks"],
  ["firstHitTicks", "first-hit-ticks"],
  ["hitSpeedTicks", "hit-speed-ticks"],
  ["hitpoints", "hitpoints"],
  ["movementMillitilesPerSecond", "movement-millitiles-per-second"],
  ["rangeMillitiles", "range-millitiles"],
  ["sightRangeMillitiles", "sight-range-millitiles"],
  ["targetMode", "target-mode"],
]);
const TARGET_MODE_CODE = Object.freeze({
  buildings: 1,
  ground: 2,
  "ground-and-air": 3,
  structures: 4,
});

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function troopDeck() {
  return [...AIR_SWARMS, ...PLAYABLE_CARD_IDS.slice(0, 6)];
}

function mixedDeck() {
  return ["squall-orb", ...AIR_SWARMS, ...PLAYABLE_CARD_IDS.slice(0, 5)];
}

function seedWithHand(deck, side, cardIds) {
  for (let seed = 0; seed < 1_000; seed += 1) {
    const hand = new DeckCycle({ deck, seed: `${seed}:${side}` }).state.hand;
    if (cardIds.every((id) => hand.includes(id))) return seed;
  }
  assert.fail(`a deterministic ${side} opening hand exists for ${cardIds.join(", ")}`);
}

function battleSetupFrom(bytes) {
  return JSON.parse(JSON.parse(bytes).battleSetup);
}

function assertAirSwarmConfidenceQuestions(battleSetup) {
  const questionByKey = new Map(battleSetup.questions.map((question) =>
    [question.key, question]));
  for (const cardId of AIR_SWARMS) {
    const card = battleSetup.roster.find(({ id }) => id === cardId);
    assert.ok(card, `${cardId} is present in the editable session roster`);
    const entity = card.entities[0];
    assert.equal(entity.sourceConfidencePolicy.fields.length, 10,
      `${cardId} carries all ten source-confidence fields`);
    assert.deepEqual(entity.sourceConfidencePolicy.deploymentInterval, {
      milliseconds: 100,
      sourceId: "supercell-2020-06-02-multi-unit-deployment",
      ticks: 6,
    }, `${cardId} carries the sourced member-to-member interval`);
    assert.deepEqual(entity.sourceConfidencePolicy.fields.map(({ field, questionKey }) =>
      [field, questionKey.slice(entity.archetypeId.length + 1)]), CONFIDENCE_FIELDS);
    for (const [field, suffix] of CONFIDENCE_FIELDS) {
      const key = `${entity.archetypeId}.${suffix}`;
      const question = questionByKey.get(key);
      assert.ok(question, `${cardId} setup closes ${key}`);
      assert.deepEqual(question, {
        authoritative: false,
        confidence: "unverified",
        disposition: "question",
        key,
        source: "runtime-playability-estimate-not-comparison-corpus",
        value: field === "targetMode" ? TARGET_MODE_CODE[entity[field]] : entity[field],
      }, `${key} stays an explicit estimate QUESTION`);
    }
  }
}

function playerDeploy(session, cardId, commandId, point = { x: 3_500, y: 14_500 }) {
  const slot = session.state.decks.south.hand.indexOf(cardId);
  assert.notEqual(slot, -1, `${cardId} is available in the south hand`);
  return session.submitPlayerCommand(canonical({
    cardId,
    commandId,
    point,
    slot,
    tick: session.state.tick,
    type: "deploy",
  }));
}

function rlAction(env, observation, cardId) {
  const slot = observation.hand.indexOf(cardId);
  assert.notEqual(slot, -1, `${cardId} is available in the RL hand`);
  const action = env.actionSpace().actions.find(({ point, slot: actionSlot }) =>
    actionSlot === slot && point.x === 8_500 && point.y === 14_500);
  assert.ok(action, `${cardId} has an own-side tile action`);
  assert.equal(observation.actionMask[action.id], true,
    `${cardId} own-side tile action is legal`);
  return action;
}

test("editable collections admit exactly 17 troops and 18 mixed choices while preserving default eight", () => {
  assert.equal(EDITABLE_DECK_CARD_IDS.length, 17);
  assert.deepEqual(EDITABLE_DECK_CARD_IDS.slice(0, 8), PLAYABLE_CARD_IDS);
  assert.deepEqual(EDITABLE_DECK_CARD_IDS.slice(-2), AIR_SWARMS);
  assert.equal(EDITABLE_MIXED_DECK_CARD_IDS.length, 18);
  assert.deepEqual(EDITABLE_MIXED_DECK_CARD_IDS.slice(0, -1), EDITABLE_DECK_CARD_IDS);
  assert.equal(EDITABLE_MIXED_DECK_CARD_IDS.at(-1), "squall-orb");
  assert.equal(createEditableGameSessionSetup(PLAYABLE_CARD_IDS, 0),
    createShippedGameSessionSetup(0), "the default seed-zero setup remains byte-identical");
  assert.equal(createEditableGameSessionSetup(PLAYABLE_CARD_IDS, 23),
    createShippedGameSessionSetup(23), "the default seed-23 setup remains byte-identical");

  for (const cardId of AIR_SWARMS) {
    const card = projectSessionTroopBattleCard(cardId);
    assert.equal(card.entities[0].layer, "air");
    assert.equal(card.entities[0].targetMode, "ground-and-air");
    assert.deepEqual(createEditableDeckWitness([...PLAYABLE_CARD_IDS.slice(0, 7), cardId])
      .roster.map(({ id }) => id), [...PLAYABLE_CARD_IDS.slice(0, 7), cardId]);
  }
});

test("troop and mixed editable setups retain every air-swarm confidence QUESTION through restore", () => {
  const decks = [troopDeck(), mixedDeck()];
  for (const deck of decks) {
    assert.equal(deck.length, 8);
    assert.equal(new Set(deck).size, 8);
    const bytes = createEditableGameSessionSetup(deck, 15);
    const parsed = JSON.parse(bytes);
    const battleSetup = battleSetupFrom(bytes);
    assert.deepEqual(parsed.deck, deck);
    assert.deepEqual(battleSetup.roster.map(({ id }) => id), deck);
    assert.deepEqual(JSON.parse(parsed.rosterWitness), {
      questions: battleSetup.questions,
      roster: battleSetup.roster,
    });
    assertAirSwarmConfidenceQuestions(battleSetup);

    const session = new GameSession(bytes);
    const checkpoint = session.serialize();
    assert.equal(GameSession.restore(checkpoint).serialize(), checkpoint,
      "the admitted eight-card setup restores exactly");
  }

  const mixedWitness = createEditableMixedDeckWitness(mixedDeck());
  assertAirSwarmConfidenceQuestions(mixedWitness);
});

test("editable GameSession opponent naturally selects both new roles from the full deck", () => {
  for (const [seed, expectedCard] of [[0, GLOAMWING], [3, COPPERSHADE]]) {
    const deck = troopDeck();
    const session = new GameSession(createEditableGameSessionSetup(deck, seed));
    assert.ok(session.state.decks.north.hand.includes(expectedCard),
      `${expectedCard} is in the seeded opponent hand`);
    const events = session.step();
    const deployed = events.find(({ side, type, deployment }) =>
      side === "north" && type === "session-deployed" &&
      deployment.cardId === expectedCard);
    assert.ok(deployed, `${expectedCard} is chosen through the ordinary seeded AI`);
    assert.equal(deployed.deployment.entityIds.length,
      expectedCard === GLOAMWING ? 5 : 6);
    assert.equal(deployed.spend.cost, expectedCard === GLOAMWING ? 2 : 5);
    assert.equal(session.state.decks.north.sequence, 1);
  }
});

test("editable player air swarms target each other, Coppershade launches a projectile, and restore replays it exactly", () => {
  const deck = troopDeck();
  const seed = 28;
  const session = new GameSession(createEditableGameSessionSetup(deck, seed));
  assert.ok(session.state.decks.south.hand.includes(GLOAMWING));
  assert.ok(session.state.decks.north.hand.includes(COPPERSHADE));
  const before = session.state;
  assert.deepEqual(playerDeploy(session, GLOAMWING, 0), {
    accepted: true,
    commandId: 0,
    tick: 0,
    type: "player-command-admitted",
  });
  const deployments = session.step().filter(({ type }) => type === "session-deployed");
  assert.deepEqual(deployments.map(({ side, deployment, spend }) =>
    [side, deployment.cardId, deployment.entityIds.length, spend.cost]), [
    ["south", GLOAMWING, 5, 2],
    ["north", COPPERSHADE, 6, 5],
  ], "the player command and natural opponent command commit through the full editable setup");
  assert.equal(session.state.decks.south.sequence, before.decks.south.sequence + 1);
  assert.equal(session.state.elixir.sides.south.amount, before.elixir.sides.south.amount - 2);
  assert.equal(session.state.decks.north.sequence, before.decks.north.sequence + 1);
  assert.equal(session.state.elixir.sides.north.amount, before.elixir.sides.north.amount - 5);

  session.stepMany(30);

  const southIds = new Set(session.state.battle.units.filter(({ side, cardId }) =>
    side === "south" && cardId === GLOAMWING).map(({ id }) => id));
  const northIds = new Set(session.state.battle.units.filter(({ side, cardId }) =>
    side === "north" && cardId === COPPERSHADE).map(({ id }) => id));
  assert.equal(southIds.size, 5);
  assert.equal(northIds.size, 6);
  let inFlight = null;
  let airTargetDamage = false;
  for (let tick = 0; tick < 240 && !(inFlight !== null && airTargetDamage); tick += 1) {
    const events = session.step();
    airTargetDamage ||= events.some(({ attackerId, targetId, type }) => type === "damage" &&
      ((southIds.has(attackerId) && northIds.has(targetId)) ||
        (northIds.has(attackerId) && southIds.has(targetId))));
    if (inFlight === null && session.state.battle.projectiles.some(({ attackerId }) =>
      northIds.has(attackerId))) {
      inFlight = session.serialize();
    }
  }
  assert.equal(airTargetDamage, true, "the two admitted air groups can acquire and damage one another");
  assert.ok(inFlight, "the admitted Coppershade squad produces a real in-flight projectile");
  const firstRestore = GameSession.restore(inFlight);
  const secondRestore = GameSession.restore(inFlight);
  assert.equal(firstRestore.serialize(), inFlight, "the in-flight editable setup restores exactly");
  firstRestore.stepMany(120);
  secondRestore.stepMany(120);
  assert.equal(firstRestore.serialize(), secondRestore.serialize(),
    "restored projectile continuation is deterministic");
});

test("mixed RL reset admits both swarms, masks legal air deployments, cycles, and restores", () => {
  const deck = mixedDeck();
  const seed = seedWithHand(deck, "south", AIR_SWARMS);
  const env = new RLEnvironment({ deck, seed, strideTicks: 1, horizonTicks: 80 });
  assert.equal(RL_ACTION_COUNT, 2_305, "the finite tile action space is unchanged");
  let observation = env.observe();
  const rlSnapshot = JSON.parse(env.serialize());
  const gameSnapshot = JSON.parse(rlSnapshot.session);
  assert.deepEqual(gameSnapshot.setup.deck, deck);
  assertAirSwarmConfidenceQuestions(JSON.parse(gameSnapshot.setup.battleSetup));

  for (const cardId of [COPPERSHADE, GLOAMWING]) {
    const action = rlAction(env, observation, cardId);
    const before = observation;
    const transition = env.step(action.id);
    assert.equal(transition.info.actionId, action.id);
    assert.equal(transition.observation.elixir, before.elixir -
      (cardId === COPPERSHADE ? 5 : 2));
    assert.notEqual(transition.observation.hand[action.slot], cardId,
      `${cardId} cycles out of its played hand slot`);
    const members = transition.observation.units.filter(({ cardId: id, side }) =>
      id === cardId && side === "south");
    assert.equal(members.length, 1,
      `${cardId} exposes only its first member when the deployment command resolves`);
    assert.ok(members.every(({ layer, count }) => layer === "air" &&
      count === (cardId === GLOAMWING ? 5 : 6)));
    observation = transition.observation;
    const memberCount = cardId === GLOAMWING ? 5 : 6;
    for (let waited = 1; waited <= 6 * (memberCount - 1); waited += 1) {
      observation = env.step(0).observation;
      const visible = observation.units.filter(({ cardId: id, side }) =>
        id === cardId && side === "south");
      assert.equal(visible.length, Math.min(memberCount, 1 + Math.floor(waited / 6)),
        `${cardId} reveals one additional member after each six simulation ticks`);
      assert.ok(visible.every(({ layer, count }) => layer === "air" && count === memberCount));
    }
  }

  const checkpoint = env.serialize();
  const restored = RLEnvironment.restore(checkpoint);
  assert.equal(restored.serialize(), checkpoint);
  assert.deepEqual(restored.step(0), env.step(0));
  assert.equal(restored.serialize(), env.serialize());
});
