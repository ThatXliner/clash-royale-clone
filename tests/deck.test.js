import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DECK_CYCLE_ALGORITHM,
  DECK_MAX_PLAY_COMMANDS,
  DeckCycle,
  getDeckCycleRules,
} from "../src/sim/deck.js";

const STRING_DECK = Object.freeze(["a", "b", "c", "d", "e", "f", "g", "h"]);
const NUMBER_DECK = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);

test("deck: original configurable shuffle rule and seed vectors are pinned", () => {
  assert.deepEqual(getDeckCycleRules(), {
    algorithm: "fisher-yates-pcg32-deck-cycle-v1",
    fidelity: "original_configurable_rule_pending_footage_validation",
    handSize: 4,
    maxPlayCommands: 10_000,
    shuffle: "descending-fisher-yates",
    shuffleStream: "deck-cycle-v1",
    version: 1,
  });
  assert.equal(DECK_CYCLE_ALGORITHM, "fisher-yates-pcg32-deck-cycle-v1");

  const vectors = [
    [0, ["b", "h", "g", "f"], ["d", "a", "c", "e"]],
    [1, ["f", "b", "d", "h"], ["g", "e", "c", "a"]],
    ["match-42", ["a", "b", "d", "h"], ["f", "c", "e", "g"]],
  ];
  for (const [seed, hand, queue] of vectors) {
    const cycle = new DeckCycle({ deck: [...STRING_DECK], seed });
    assert.deepEqual(cycle.state, {
      hand,
      next: queue[0],
      queue,
      sequence: 0,
    });
  }
});

test("deck: slot replacement, next card, and full eight-card cycle are exact", () => {
  const cycle = new DeckCycle({ deck: [...STRING_DECK], seed: 0 });
  const initial = cycle.state;
  const played = [];
  for (let slot = 0; slot < 4; slot += 1) {
    const cardId = cycle.state.hand[slot];
    played.push(cardId);
    const expectedDraw = cycle.state.next;
    assert.deepEqual(cycle.play(cardId), {
      accepted: true,
      cardId,
      drawnCard: expectedDraw,
      reason: "accepted",
      sequence: slot,
      slot,
      type: "play",
    });
    assert.equal(cycle.state.hand[slot], expectedDraw);
  }
  assert.deepEqual(cycle.state.queue, played);

  for (let slot = 0; slot < 4; slot += 1) {
    cycle.play(cycle.state.hand[slot]);
  }
  assert.deepEqual(cycle.state, { ...initial, sequence: 8 });
});

test("deck: invalid and not-in-hand commands are explicit, stable, and atomic", () => {
  const cycle = new DeckCycle({ deck: [...STRING_DECK], seed: 0 });
  const before = cycle.state;
  assert.deepEqual(cycle.play({ card: "b" }), {
    accepted: false,
    cardId: null,
    drawnCard: null,
    reason: "invalid_card",
    sequence: 0,
    slot: null,
    type: "play",
  });
  assert.deepEqual(cycle.state, { ...before, sequence: 1 });
  assert.deepEqual(cycle.play("outside-deck"), {
    accepted: false,
    cardId: "outside-deck",
    drawnCard: null,
    reason: "not_in_hand",
    sequence: 1,
    slot: null,
    type: "play",
  });
  assert.deepEqual(cycle.state, { ...before, sequence: 2 });
  assert.deepEqual(cycle.events, [
    {
      accepted: false,
      cardId: null,
      drawnCard: null,
      reason: "invalid_card",
      sequence: 0,
      slot: null,
      type: "play",
    },
    {
      accepted: false,
      cardId: "outside-deck",
      drawnCard: null,
      reason: "not_in_hand",
      sequence: 1,
      slot: null,
      type: "play",
    },
  ]);
});

test("deck: canonical command replay restores a mid-cycle state byte-for-byte", () => {
  const commands = ["b", "outside-deck", null, "h", "g", "f", "d"];
  const original = new DeckCycle({ deck: [...STRING_DECK], seed: 0 });
  for (const command of commands) original.play(command);

  assert.equal(
    original.serializeJson(),
    '{"algorithm":"fisher-yates-pcg32-deck-cycle-v1","deck":["a","b","c","d","e","f","g","h"],"plays":["b","outside-deck",null,"h","g","f","d"],"ruleVersion":1,"seed":0}',
  );
  const restored = DeckCycle.restore(original.serializeJson());
  assert.equal(restored.serializeJson(), original.serializeJson());
  assert.deepEqual(restored.state, original.state);
  assert.deepEqual(restored.events, original.events);

  for (let index = 0; index < 24; index += 1) {
    const card = original.state.hand[index % 4];
    assert.deepEqual(restored.play(card), original.play(card));
  }
  assert.equal(restored.serializeJson(), original.serializeJson());
});

test("deck: 10,000 commands replay identically with a hard history bound", () => {
  const left = new DeckCycle({ deck: [...NUMBER_DECK], seed: "stress" });
  const right = new DeckCycle({ deck: [...NUMBER_DECK], seed: "stress" });
  for (let index = 0; index < DECK_MAX_PLAY_COMMANDS; index += 1) {
    const command =
      index % 13 === 0 ? 999 : left.state.hand[index % 4];
    assert.deepEqual(left.play(command), right.play(command));
  }
  assert.equal(left.serializeJson(), right.serializeJson());

  const restored = DeckCycle.restore(left.serializeJson());
  assert.deepEqual(restored.state, left.state);
  assert.deepEqual(restored.events, left.events);
  assert.equal(restored.serializeJson(), left.serializeJson());
  assert.throws(() => left.play(left.state.hand[0]), /cannot exceed 10000/);
});

test("deck: deck and snapshot validation reject malformed or accessor input", () => {
  const invalidDecks = [
    [],
    ["a", "b", "c", "d", "e", "f", "g"],
    ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
    ["a", "a", "c", "d", "e", "f", "g", "h"],
    ["a", "b", "c", "d", "e", "f", "g", 0],
    ["a", "b", "c", "d", "e", "f", "g", {}],
  ];
  for (const deck of invalidDecks) {
    assert.throws(() => new DeckCycle({ deck, seed: 0 }), /deck/);
  }
  for (const seed of [undefined, null, 1.5, Number.NaN, {}, []]) {
    assert.throws(
      () => new DeckCycle({ deck: [...STRING_DECK], seed }),
      /seed/,
    );
  }

  let getterCalls = 0;
  const accessorOptions = {};
  Object.defineProperty(accessorOptions, "deck", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return [...STRING_DECK];
    },
  });
  Object.defineProperty(accessorOptions, "seed", {
    enumerable: true,
    value: 0,
  });
  assert.throws(() => new DeckCycle(accessorOptions), /data property/);
  assert.equal(getterCalls, 0);

  const accessorDeck = [...STRING_DECK];
  Object.defineProperty(accessorDeck, "0", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "a";
    },
  });
  assert.throws(
    () => new DeckCycle({ deck: accessorDeck, seed: 0 }),
    /data property/,
  );
  assert.equal(getterCalls, 0);

  const valid = new DeckCycle({ deck: [...STRING_DECK], seed: 0 }).serialize();
  for (const snapshot of [
    null,
    [],
    {},
    { ...valid, extra: true },
    { ...valid, algorithm: "future" },
    { ...valid, ruleVersion: 2 },
    { ...valid, plays: [false] },
    { ...valid, plays: Array(10_001).fill("a") },
  ]) {
    assert.throws(() => DeckCycle.restore(snapshot), /snapshot|plays|rule/);
  }
  assert.throws(() => DeckCycle.restore("{"), /valid JSON/);

  const accessorSnapshot = { ...valid };
  Object.defineProperty(accessorSnapshot, "plays", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return [];
    },
  });
  assert.throws(() => DeckCycle.restore(accessorSnapshot), /data property/);
  assert.equal(getterCalls, 0);
});

test("deck: runtime remains isolated from reference and ambient nondeterminism", () => {
  const source = readFileSync(
    new URL("../src/sim/deck.js", import.meta.url),
    "utf8",
  );
  assert.equal(source.includes("reference/"), false);
  assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now/);
});
