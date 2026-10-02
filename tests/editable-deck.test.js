import assert from "node:assert/strict";
import test from "node:test";

import {
  createEditableGameSessionSetup,
} from "../src/content/editable-deck.js";
import {
  EDITABLE_DECK_CARD_IDS,
  createEditableDeckWitness,
  createSessionTroopWitnessQuestions,
} from "../src/content/session-troop-roster.js";
import { PLAYABLE_CARD_IDS } from "../src/content/playable-roster.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";
import { createShippedGameSessionSetup } from "../src/ui/game-browser-entry.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function combinationsOfEight() {
  return EDITABLE_DECK_CARD_IDS.map((excluded) =>
    EDITABLE_DECK_CARD_IDS.filter((id) => id !== excluded));
}

function questionReferences(roster) {
  return roster.flatMap(({ entities }) => entities.flatMap((entity) =>
    [entity.bodyRadiusPolicy, entity.projectileSpeedPolicy, entity.deliveryPolicy,
      entity.layerPolicy, entity.damagePolicy]
      .filter((policy) => policy?.kind === "question")
      .map(({ questionKey }) => questionKey)));
}

function command(session, cardId, commandId = 0) {
  return canonical({
    cardId,
    commandId,
    point: { x: 3_500, y: 14_500 },
    slot: session.state.decks.south.hand.indexOf(cardId),
    tick: session.state.tick,
    type: "deploy",
  });
}

test("editable deck setup admits every eight-card subset and closes QUESTION records", () => {
  assert.equal(EDITABLE_DECK_CARD_IDS.length, 9);
  assert.deepEqual(EDITABLE_DECK_CARD_IDS.slice(0, 8), PLAYABLE_CARD_IDS);
  const decks = combinationsOfEight();
  assert.equal(decks.length, 9);
  const originalQuestions = new Map();
  for (const id of EDITABLE_DECK_CARD_IDS) {
    for (const question of createSessionTroopWitnessQuestions(id)) {
      const previous = originalQuestions.get(question.key);
      if (previous !== undefined) assert.deepEqual(question, previous, question.key);
      else originalQuestions.set(question.key, question);
    }
  }

  for (const deck of decks) {
    const witness = createEditableDeckWitness(deck);
    assert.deepEqual(witness.roster.map(({ id }) => id), deck);
    assert.equal(new Set(witness.roster.map(({ id }) => id)).size, 8);
    assert.ok(witness.roster.flatMap(({ entities }) => entities).every((entity) =>
      entity.deliveryPolicy?.kind === "question" && entity.layerPolicy?.kind === "question"));

    const references = questionReferences(witness.roster);
    const expectedKeys = [...new Set(references)].sort();
    assert.equal(references.length, expectedKeys.length, deck.join(","));
    assert.deepEqual(witness.questions.map(({ key }) => key), expectedKeys);
    assert.ok(witness.questions.every(({ authoritative, confidence, disposition, value }) =>
      authoritative === false && confidence === "unverified" && disposition === "question" &&
      Number.isSafeInteger(value) && value > 0));
    for (const question of witness.questions) {
      assert.deepEqual(question, originalQuestions.get(question.key), question.key);
    }

    const setup = createEditableGameSessionSetup(deck, 17);
    assert.equal(setup, canonical(JSON.parse(setup)));
    const decoded = JSON.parse(setup);
    assert.deepEqual(decoded.deck, deck);
    assert.deepEqual(JSON.parse(decoded.battleSetup).roster.map(({ id }) => id), deck);
    assert.deepEqual(JSON.parse(decoded.rosterWitness), {
      questions: JSON.parse(decoded.battleSetup).questions,
      roster: JSON.parse(decoded.battleSetup).roster,
    });
    const session = new GameSession(setup);
    assert.deepEqual(JSON.parse(session.serialize()).setup.deck, deck);

    const direct = new GameSession(setup);
    const expected = direct.stepMany(90);
    const chunked = new GameSession(setup);
    const actual = [...chunked.stepMany(13), ...chunked.stepMany(29),
      ...chunked.stepMany(48)];
    assert.deepEqual(actual, expected);
    assert.equal(chunked.serialize(), direct.serialize());
    assert.equal(GameSession.restore(direct.serialize()).serialize(), direct.serialize());
  }
});

test("editable deck setup preserves the shipped standard setup and selected order", () => {
  assert.equal(createEditableGameSessionSetup(PLAYABLE_CARD_IDS, 0),
    createShippedGameSessionSetup(0));
  assert.equal(createEditableGameSessionSetup(PLAYABLE_CARD_IDS, 23),
    createShippedGameSessionSetup(23));

  const reordered = [...PLAYABLE_CARD_IDS].reverse();
  const decoded = JSON.parse(createEditableGameSessionSetup(reordered, 23));
  assert.deepEqual(decoded.deck, reordered);
  assert.deepEqual(JSON.parse(decoded.battleSetup).roster.map(({ id }) => id), reordered);
  assert.ok(JSON.parse(decoded.battleSetup).roster.every(({ entities }) =>
    entities.every(({ deliveryPolicy, layerPolicy }) =>
      deliveryPolicy?.kind === "question" && layerPolicy?.kind === "question")));
});

test("editable Stonehauler deployment survives deterministic restore continuation", () => {
  const deck = ["stonehauler", ...PLAYABLE_CARD_IDS.slice(0, 7)];
  let seed = 0;
  while (!new DeckCycle({ deck, seed: `${seed}:south` }).state.hand.includes("stonehauler")) {
    seed += 1;
    assert.ok(seed < 1_000, "a deterministic starting-hand witness exists");
  }
  const setup = createEditableGameSessionSetup(deck, seed);
  const session = new GameSession(setup);
  session.submitPlayerCommand(command(session, "stonehauler"));
  session.stepMany(61);
  assert.ok(session.state.battle.units.some(({ cardId, side }) =>
    cardId === "stonehauler" && side === "south"));

  const restored = GameSession.restore(session.serialize());
  session.stepMany(75);
  restored.stepMany(75);
  assert.equal(restored.serialize(), session.serialize());
  assert.deepEqual(JSON.parse(restored.serialize()).setup.deck, deck);
});

test("editable deck rejects malformed, duplicate, unsupported, and noncanonical setups", () => {
  const defaultDeck = [...PLAYABLE_CARD_IDS];
  assert.throws(() => createEditableDeckWitness(defaultDeck.slice(1)), /exactly eight/u);
  assert.throws(() => createEditableDeckWitness([...defaultDeck, "stonehauler"]),
    /exactly eight/u);
  assert.throws(() => createEditableDeckWitness([
    ...defaultDeck.slice(0, 7), defaultDeck[0],
  ]), /unique/u);
  assert.throws(() => createEditableDeckWitness([
    ...defaultDeck.slice(0, 7), "railward",
  ]), /not supported/u);
  assert.throws(() => createEditableDeckWitness([
    ...defaultDeck.slice(0, 7), "bulwark-needle",
  ]), /not supported/u);
  assert.throws(() => createEditableDeckWitness("coilblade,mossguard"), /plain array/u);
  const sparse = new Array(8);
  for (let index = 0; index < 7; index += 1) sparse[index] = defaultDeck[index];
  assert.throws(() => createEditableDeckWitness(sparse), /dense array/u);
  const accessor = [...defaultDeck];
  Object.defineProperty(accessor, "0", { enumerable: true, get: () => defaultDeck[0] });
  assert.throws(() => createEditableDeckWitness(accessor), /data property/u);
  const extra = [...defaultDeck];
  extra.extra = true;
  assert.throws(() => createEditableDeckWitness(extra), /exact dense array/u);
  assert.throws(() => createEditableGameSessionSetup(defaultDeck, Number.NaN), /seed/u);

  const valid = JSON.parse(createEditableGameSessionSetup([
    "stonehauler", ...PLAYABLE_CARD_IDS.slice(0, 7),
  ]));
  valid.deck = [...valid.deck].reverse();
  assert.throws(() => new GameSession(canonical(valid)), /deck must exactly equal/u);
});
