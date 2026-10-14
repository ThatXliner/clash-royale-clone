import assert from "node:assert/strict";
import test from "node:test";

import { EDITABLE_DECK_CARD_IDS } from "../src/content/session-troop-roster.js";
import { createEditableGameSessionSetup } from "../src/content/editable-deck.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";

const SOUTH = Object.freeze({ x: 3_500, y: 14_500 });
const NORTH = Object.freeze({ x: 3_500, y: 17_500 });
const BURIED_COIL = "buried-coil";
const DECK = Object.freeze([
  BURIED_COIL,
  "mossguard",
  "duskwing-trio",
  "coilblade",
  "copperskiff",
  "skymaul",
  "brassbolt",
  "reedsting",
]);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function seedForHands(deck, southCardId, northCardId) {
  for (let seed = 0; seed < 1_000; seed += 1) {
    const south = new DeckCycle({ deck, seed: `${seed}:south` }).state.hand;
    const north = new DeckCycle({ deck, seed: `${seed}:north` }).state.hand;
    if (south.includes(southCardId) && north.includes(northCardId)) return seed;
  }
  throw new Error(`no bounded seeded starting-hand witness for ${southCardId}/${northCardId}`);
}

function sessionSetup(seed, { legalNorthCardId = null, thinkIntervalTicks = 3_600 } = {}) {
  const setup = JSON.parse(createEditableGameSessionSetup(DECK, seed));
  setup.legalNorthDeployments = legalNorthCardId === null ? [] : [{
    cardId: legalNorthCardId,
    point: NORTH,
  }];
  setup.thinkIntervalTicks = thinkIntervalTicks;
  setup.thinkOffsetTicks = 0;
  return canonical(setup);
}

function deployPlayerCard(session, cardId, commandId = 0) {
  const slot = session.state.decks.south.hand.indexOf(cardId);
  assert.notEqual(slot, -1, `${cardId} has to be in the authentic player hand`);
  return session.submitPlayerCommand(canonical({
    cardId,
    commandId,
    point: SOUTH,
    slot,
    tick: session.state.tick,
    type: "deploy",
  }));
}

test("Buried Coil custom eight-card GameSession deploys, spends once, reveals, and contacts ground and air", () => {
  for (const targetCardId of ["mossguard", "duskwing-trio"]) {
    const seed = seedForHands(DECK, BURIED_COIL, targetCardId);
    const session = new GameSession(sessionSetup(seed, {
      legalNorthCardId: targetCardId,
      thinkIntervalTicks: 1,
    }));
    const before = session.state;
    assert.deepEqual(deployPlayerCard(session, BURIED_COIL), {
      accepted: true,
      commandId: 0,
      tick: 0,
      type: "player-command-admitted",
    });
    const initialBoundary = session.step();
    const afterDeploy = session.state;
    const coil = afterDeploy.battle.structures.find(({ cardId, side }) =>
      cardId === BURIED_COIL && side === "south");
    assert.ok(coil?.alive, `${targetCardId}: shared GameSession materializes the selected building`);
    assert.equal(afterDeploy.decks.south.sequence, before.decks.south.sequence + 1,
      `${targetCardId}: the player deck cycles exactly once`);
    assert.equal(afterDeploy.elixir.sides.south.amount, before.elixir.sides.south.amount - 4,
      `${targetCardId}: the player pays the existing four-elixir card cost once`);
    assert.equal(afterDeploy.cardRuntime.history.filter(({ cardId, side }) =>
      cardId === BURIED_COIL && side === "south").length, 1);
    assert.equal(session.replay.filter(({ materialization, side, type }) =>
      type === "session-structure-deployed" && side === "south" &&
      materialization.cardId === BURIED_COIL).length, 1);
    assert.ok(initialBoundary.some(({ cardId, side, type }) =>
      type === "structure-materialized" && side === "south" && cardId === BURIED_COIL));

    const aiTarget = afterDeploy.battle.units.find(({ cardId, side }) =>
      cardId === targetCardId && side === "north");
    assert.ok(aiTarget?.alive, `${targetCardId}: the actual seeded opponent deploys its legal hand card`);
    assert.equal(session.replay.filter(({ deployment, side, type }) =>
      type === "session-deployed" && side === "north" &&
      deployment.cardId === targetCardId).length, 1);

    const checkpoint = session.serialize();
    const left = GameSession.restore(checkpoint);
    const right = GameSession.restore(checkpoint);
    assert.equal(left.serialize(), checkpoint);
    assert.equal(right.serialize(), checkpoint);
    const leftEvents = left.stepMany(103);
    const rightEvents = right.stepMany(103);
    assert.deepEqual(leftEvents, rightEvents,
      `${targetCardId}: two authenticated restores independently continue the same battle branch`);
    assert.equal(left.serialize(), right.serialize());
    assert.equal(left.replayBytes(), right.replayBytes());

    const attack = left.replay.find(({ buildingId, type }) =>
      buildingId === coil.id && type === "structure-attack");
    assert.ok(attack, `${targetCardId}: the real building reducer resolves an attack`);
    assert.equal(attack.amount, 230, "the current runtime estimate is used without confidence promotion");
    const contactedTarget = left.state.battle.units.find(({ id }) => id === attack.targetId);
    assert.equal(contactedTarget?.cardId, targetCardId);
    assert.equal(contactedTarget?.side, "north");
    assert.equal(contactedTarget?.layer, targetCardId === "mossguard" ? "ground" : "air");
    const reveal = left.replay.find(({ buildingId, type }) =>
      buildingId === coil.id && type === "building-revealed");
    assert.ok(reveal, `${targetCardId}: contact flow reveals the actual hidden building`);
    assert.equal(left.state.battle.structures.find(({ id }) => id === coil.id).hidden, false);
    const sourcePolicy = left.state.battle.structures.find(({ id }) => id === coil.id).policy;
    assert.equal(sourcePolicy.disposition, "question");
    assert.equal(sourcePolicy.confidence, "unverified");
    assert.equal(sourcePolicy.corpusFields.damage.authoritative, false);
    assert.equal(sourcePolicy.corpusFields.damage.confidence, "unverified");
  }
});

test("seeded AI deploys Buried Coil through its custom deck and preserves hidden lifetime on restore", () => {
  const seed = seedForHands(DECK, "mossguard", BURIED_COIL);
  const setup = sessionSetup(seed, {
    legalNorthCardId: BURIED_COIL,
    thinkIntervalTicks: 3_600,
  });
  const session = new GameSession(setup);
  const before = session.state;
  const events = session.step();
  const coil = session.state.battle.structures.find(({ cardId, side }) =>
    cardId === BURIED_COIL && side === "north");
  assert.ok(coil?.alive, "seeded AI materializes Buried Coil through ordinary GameSession admission");
  assert.equal(session.state.decks.north.sequence, before.decks.north.sequence + 1);
  assert.equal(session.state.elixir.sides.north.amount, before.elixir.sides.north.amount - 4);
  assert.equal(session.replay.filter(({ materialization, side, type }) =>
    type === "session-structure-deployed" && side === "north" &&
    materialization.cardId === BURIED_COIL).length, 1);
  assert.ok(events.some(({ cardId, side, type }) =>
    type === "structure-materialized" && side === "north" && cardId === BURIED_COIL));
  assert.equal(coil.hidden, true, "without an eligible target the hidden building remains concealed");
  assert.equal(coil.targetable, false);
});

test("Buried Coil hidden state and provisional lifetime survive an actual pre-expiry restore", () => {
  const seed = seedForHands(DECK, BURIED_COIL, "mossguard");
  const session = new GameSession(sessionSetup(seed));
  deployPlayerCard(session, BURIED_COIL);
  session.step();
  const [coil] = session.state.battle.structures;
  assert.equal(coil.cardId, BURIED_COIL);
  assert.equal(coil.alive, true);
  assert.equal(coil.hidden, true, "without an eligible enemy the actual structure starts concealed");
  assert.equal(coil.targetable, false);

  session.stepMany(1_799);
  assert.equal(session.state.tick, 1_800);
  const preExpiry = session.serialize();
  const restored = GameSession.restore(preExpiry);
  assert.equal(restored.serialize(), preExpiry,
    "the actual hidden structure and its causal lifetime transcript restore exactly before expiry");
  const terminalBoundary = session.step();
  assert.deepEqual(restored.step(), terminalBoundary);
  assert.equal(restored.serialize(), session.serialize());
  const expired = session.state.battle.structures.find(({ id }) => id === coil.id);
  assert.equal(expired.alive, false);
  assert.equal(expired.deathCause, "expiry");
  assert.ok(session.replay.some(({ buildingId, reason, type }) =>
    type === "structure-destroyed" && buildingId === coil.id && reason === "lifetime"));
});
