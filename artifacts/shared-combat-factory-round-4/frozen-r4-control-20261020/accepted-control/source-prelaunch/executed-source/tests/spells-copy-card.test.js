import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PREVIOUS_CARD_COPY_QUESTIONS,
  PreviousCardCopyMatch,
  getPreviousCardCopyQuestions,
} from "../src/content/cards/spells-copy-card.js";

const IDS = Object.freeze([
  "echo",
  "ember",
  "frost",
  "gale",
  "hearth",
  "iron",
  "jade",
  "kite",
]);

function setup(overrides = {}) {
  const cards = IDS.map((id, index) => ({
    cost: index === 1 ? 10 : index + 1,
    excludedFromCopy: id === "echo" || id === "frost",
    id,
    level: index === 1 ? 15 : 10 + (index % 4),
  }));
  return {
    cards,
    copyCardId: "echo",
    deck: [...IDS],
    seed: 0,
    ...overrides,
  };
}

function fresh(overrides) {
  return new PreviousCardCopyMatch(setup(overrides));
}

function copyJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function scheduleFirstNormalThenCopy(match, tick = 0) {
  const first = match.state.deck.hand.find((id) => id !== "echo");
  match.schedulePlay({ cardId: first, tick });
  const copyTick = match.state.deck.hand.includes("echo") ? tick : tick + 8;
  return { copyTick, first };
}

test("copy spell: every absent policy is an isolated frozen QUESTION", () => {
  assert.equal(PREVIOUS_CARD_COPY_QUESTIONS.length, 10);
  assert.ok(Object.isFrozen(PREVIOUS_CARD_COPY_QUESTIONS));
  assert.ok(PREVIOUS_CARD_COPY_QUESTIONS.every((record) =>
    Object.isFrozen(record) &&
    record.status === "QUESTION" &&
    record.confidence === "absent"
  ));
  assert.deepEqual(
    PREVIOUS_CARD_COPY_QUESTIONS.map(({ id }) => id),
    [
      "copy-cost-increment",
      "copy-cost-cap",
      "copy-level-increment",
      "copy-level-cap",
      "copy-history-selection",
      "copy-history-after-copy",
      "copy-rejection-cycle",
      "copy-exclusions",
      "copy-same-tick-order",
      "copy-form-semantics",
    ],
  );
  const mutable = getPreviousCardCopyQuestions();
  mutable[0].policy = "changed";
  assert.notEqual(mutable[0].policy, PREVIOUS_CARD_COPY_QUESTIONS[0].policy);
});

test("copy spell: normal play delegates exact hand and queue mutation", () => {
  const match = fresh();
  const before = match.state.deck;
  const cardId = before.hand[2];
  match.schedulePlay({ cardId, tick: 0 });
  const [event] = match.advanceTicks(1);
  assert.deepEqual(event, {
    accepted: true,
    copiedCardId: null,
    drawnCard: before.next,
    effectiveCost: setup().cards.find(({ id }) => id === cardId).cost,
    effectiveLevel: setup().cards.find(({ id }) => id === cardId).level,
    reason: "accepted",
    requestedCardId: cardId,
    sequence: 0,
    slot: 2,
    tick: 0,
    type: "card-play",
  });
  assert.equal(match.state.deck.hand[2], before.next);
  assert.equal(match.state.deck.queue.at(-1), cardId);
});

test("copy spell: empty history rejects atomically without cycling", () => {
  const match = fresh({ seed: "match-42" });
  assert.ok(match.state.deck.hand.includes("echo"));
  const before = match.state.deck;
  match.schedulePlay({ cardId: "echo", tick: 0 });
  assert.deepEqual(match.advanceTicks(1), [{
    accepted: false,
    copiedCardId: null,
    drawnCard: null,
    effectiveCost: null,
    effectiveLevel: null,
    reason: "empty_history",
    requestedCardId: "echo",
    sequence: 0,
    slot: null,
    tick: 0,
    type: "card-play",
  }]);
  assert.deepEqual(match.state.deck, before);
  assert.equal(match.state.previous, null);
});

test("copy spell: copied effective cost and level increment and cap", () => {
  for (const seed of [0, "match-42"]) {
    const match = fresh({ seed });
    const { first } = scheduleFirstNormalThenCopy(match);
    const firstCard = setup().cards.find(({ id }) => id === first);
    match.advanceTicks(1);
    if (!match.state.deck.hand.includes("echo")) continue;
    match.schedulePlay({ cardId: "echo", tick: 1 });
    const [copy] = match.advanceTicks(1);
    assert.equal(copy.accepted, true);
    assert.equal(copy.copiedCardId, first);
    assert.equal(copy.effectiveCost, Math.min(10, firstCard.cost + 1));
    assert.equal(copy.effectiveLevel, Math.min(15, firstCard.level + 1));
    assert.deepEqual(match.state.previous, {
      cardId: first,
      effectiveCost: firstCard.cost,
      effectiveLevel: firstCard.level,
    });
  }
});

test("copy spell: excluded previous card rejects atomically", () => {
  const match = fresh({ seed: 11 });
  const excluded = match.state.deck.hand.find((id) => id === "frost");
  assert.equal(excluded, "frost");
  match.schedulePlay({ cardId: excluded, tick: 0 });
  match.schedulePlay({ cardId: "echo", tick: 0 });
  const before = match.state.deck;
  const events = match.advanceTicks(1);
  assert.equal(events[0].accepted, true);
  assert.deepEqual(match.state.previous, {
    cardId: "frost",
    effectiveCost: 3,
    effectiveLevel: 12,
  });
  assert.equal(events[1].reason, "excluded_previous_card");
  assert.equal(match.state.deck.hand[3], before.hand[3]);
});

test("copy spell: same-tick commands resolve in deterministic sequence order", () => {
  const match = fresh({ seed: "match-42" });
  const normal = match.state.deck.hand.find((id) =>
    id !== "echo" && id !== "frost"
  );
  assert.ok(normal);
  assert.ok(match.state.deck.hand.includes("echo"));
  match.schedulePlay({ cardId: normal, tick: 4 });
  match.schedulePlay({ cardId: "echo", tick: 4 });
  const events = match.advanceTicks(5);
  assert.deepEqual(events.map(({ sequence, reason, tick }) => ({
    reason,
    sequence,
    tick,
  })), [
    { reason: "accepted", sequence: 0, tick: 4 },
    { reason: "accepted_copy", sequence: 1, tick: 4 },
  ]);
  assert.equal(events[1].copiedCardId, normal);
});

test("copy spell: out-of-hand and unknown cards reject without history change", () => {
  const match = fresh();
  const outsideHand = IDS.find((id) => !match.state.deck.hand.includes(id));
  match.schedulePlay({ cardId: outsideHand, tick: 0 });
  match.schedulePlay({ cardId: "unknown", tick: 0 });
  const events = match.advanceTicks(1);
  assert.deepEqual(events.map(({ reason }) => reason), [
    "not_in_hand",
    "unknown_card",
  ]);
  assert.equal(match.state.previous, null);
});

test("copy spell: chunking, fresh replay, and every restore cut are identical", () => {
  const build = () => {
    const match = fresh({ seed: "match-42" });
    const normal = match.state.deck.hand.find((id) =>
      id !== "echo" && id !== "frost"
    );
    match.schedulePlay({ cardId: normal, tick: 2 });
    match.schedulePlay({ cardId: "echo", tick: 2 });
    match.schedulePlay({ cardId: "unknown", tick: 3 });
    match.schedulePlay({ cardId: match.state.deck.hand[3], tick: 7 });
    return match;
  };
  const whole = build();
  whole.advanceTicks(12);
  const chunked = build();
  for (const chunk of [0, 1, 2, 1, 3, 5]) chunked.advanceTicks(chunk);
  assert.equal(chunked.serialize(), whole.serialize());
  assert.deepEqual(chunked.state, whole.state);
  assert.deepEqual(chunked.replay, whole.replay);

  for (let cut = 0; cut <= 12; cut += 1) {
    const partial = build();
    partial.advanceTicks(cut);
    const restored = PreviousCardCopyMatch.restore(partial.serialize());
    restored.advanceTicks(12 - cut);
    assert.equal(restored.serialize(), whole.serialize(), `cut ${cut}`);
    assert.deepEqual(restored.state, whole.state, `state cut ${cut}`);
    assert.deepEqual(restored.replay, whole.replay, `replay cut ${cut}`);
  }
});

test("copy spell: serialization is canonical, isolated, and causal", () => {
  const match = fresh({ seed: "match-42" });
  const normal = match.state.deck.hand.find((id) => id !== "echo");
  match.schedulePlay({ cardId: normal, tick: 0 });
  match.schedulePlay({ cardId: "echo", tick: 0 });
  match.advanceTicks(1);
  const bytes = match.serialize();
  assert.equal(PreviousCardCopyMatch.restore(bytes).serialize(), bytes);
  const state = match.state;
  const replay = match.replay;
  state.deck.hand[0] = "tampered";
  replay[0].reason = "tampered";
  assert.notDeepEqual(match.state, state);
  assert.notDeepEqual(match.replay, replay);

  const parsed = JSON.parse(bytes);
  assert.deepEqual(Object.keys(parsed).sort(), [
    "commands", "fixture", "setup", "tick", "version",
  ]);
  assert.equal("state" in parsed, false);
  assert.equal("events" in parsed, false);
  assert.equal("previous" in parsed, false);
});

test("copy spell: hostile setup and command inputs reject without getters", () => {
  const badSetups = [
    null,
    {},
    { ...setup(), extra: true },
    { ...setup(), deck: IDS.slice(0, 7) },
    { ...setup(), deck: [...IDS.slice(0, 7), IDS[0]] },
    { ...setup(), copyCardId: "missing" },
    { ...setup(), cards: setup().cards.map((card) =>
      card.id === "echo" ? { ...card, excludedFromCopy: false } : card
    ) },
    { ...setup(), seed: {} },
  ];
  for (const value of badSetups) {
    assert.throws(() => new PreviousCardCopyMatch(value), /copy|deck|seed/);
  }

  const match = fresh();
  for (const command of [
    null,
    {},
    { cardId: "echo", tick: 0, extra: true },
    { cardId: "", tick: 0 },
    { cardId: "echo", tick: -1 },
    { cardId: "echo", tick: 1.5 },
  ]) {
    assert.throws(() => match.schedulePlay(command), /command|cardId|tick/);
  }

  let getterCalls = 0;
  const accessor = {};
  Object.defineProperties(accessor, {
    cardId: {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "echo";
      },
    },
    tick: { enumerable: true, value: 0 },
  });
  assert.throws(() => match.schedulePlay(accessor), /data object|shape/);
  assert.equal(getterCalls, 0);
});

test("copy spell: hostile snapshots reject before derived state is trusted", () => {
  const match = fresh();
  match.schedulePlay({ cardId: match.state.deck.hand[0], tick: 0 });
  match.advanceTicks(1);
  const canonical = match.serialize();
  const raw = JSON.parse(canonical);
  const mutations = [
    null,
    {},
    { ...raw, version: 2 },
    { ...raw, fixture: "future" },
    { ...raw, tick: -1 },
    { ...raw, extra: true },
    { ...raw, commands: [{ cardId: "echo", tick: -1 }] },
    { ...raw, commands: Array(10_001).fill({ cardId: "echo", tick: 0 }) },
    { ...raw, setup: { ...raw.setup, seed: {} } },
  ];
  for (const value of mutations) {
    assert.throws(
      () => PreviousCardCopyMatch.restore(JSON.stringify(value)),
      /snapshot|rule|tick|commands|copy|seed/,
    );
  }
  const reorderedRoot = JSON.stringify({
    version: raw.version,
    tick: raw.tick,
    setup: raw.setup,
    fixture: raw.fixture,
    commands: raw.commands,
  });
  const reorderedSetup = JSON.stringify({
    ...raw,
    setup: {
      seed: raw.setup.seed,
      deck: raw.setup.deck,
      copyCardId: raw.setup.copyCardId,
      cards: raw.setup.cards,
    },
  });
  const reorderedCard = copyJson(raw);
  reorderedCard.setup.cards[0] = {
    level: raw.setup.cards[0].level,
    id: raw.setup.cards[0].id,
    excludedFromCopy: raw.setup.cards[0].excludedFromCopy,
    cost: raw.setup.cards[0].cost,
  };
  const reorderedCommand = copyJson(raw);
  reorderedCommand.commands[0] = {
    tick: raw.commands[0].tick,
    cardId: raw.commands[0].cardId,
  };
  const noncanonical = [
    ` ${canonical}`,
    `${canonical}\n`,
    reorderedRoot,
    reorderedSetup,
    JSON.stringify(reorderedCard),
    JSON.stringify(reorderedCommand),
    canonical.replace('"tick":1', '"tick":1e0'),
    canonical.replace(
      '"fixture":"previous-card-copy-v1"',
      '"fixture":"previous-card-copy-v\\u0031"',
    ),
    canonical.replace('"version":1', '"version":1,"version":1'),
    canonical.replace('"seed":0', '"seed":0,"seed":0'),
    canonical.replace('"cost":1', '"cost":1,"cost":1'),
    canonical.replace('"cardId":', '"cardId":null,"cardId":'),
  ];
  for (const serialized of noncanonical) {
    assert.notEqual(serialized, canonical);
    assert.throws(
      () => PreviousCardCopyMatch.restore(serialized),
      /canonical serialization/,
    );
  }
  assert.throws(() => PreviousCardCopyMatch.restore(null), /string/);
  assert.throws(() => PreviousCardCopyMatch.restore("{"), /valid JSON/);
  assert.throws(
    () => PreviousCardCopyMatch.restore(" ".repeat(2_000_001)),
    /size bound/,
  );

  const emptySeed = fresh({ seed: "" }).serialize();
  for (const [seed, byteLength] of [
    ["é", 2],
    ["€", 3],
    ["😀", 4],
  ]) {
    const multibyte = fresh({ seed }).serialize();
    assert.equal(
      Buffer.byteLength(multibyte) - Buffer.byteLength(emptySeed),
      byteLength,
    );
    assert.equal(PreviousCardCopyMatch.restore(multibyte).serialize(), multibyte);
  }

  const boundaryPrefix = "é€😀";
  const boundarySeed = boundaryPrefix + "a".repeat(
    2_000_000 -
      Buffer.byteLength(emptySeed) -
      Buffer.byteLength(boundaryPrefix),
  );
  const exactBoundary = fresh({ seed: boundarySeed }).serialize();
  assert.equal(Buffer.byteLength(exactBoundary), 2_000_000);
  assert.ok(exactBoundary.length < 2_000_000);
  assert.equal(
    PreviousCardCopyMatch.restore(exactBoundary).serialize(),
    exactBoundary,
  );

  const oneByteOverRaw = JSON.parse(exactBoundary);
  oneByteOverRaw.setup.seed += "a";
  const oneByteOver = JSON.stringify(oneByteOverRaw);
  assert.equal(Buffer.byteLength(oneByteOver), 2_000_001);
  assert.throws(
    () => fresh({ seed: `${boundarySeed}a` }).serialize(),
    /size bound/,
  );

  const malformedSurrogates = exactBoundary.replace("😀", "\ud800\ud800");
  assert.equal(malformedSurrogates.length, exactBoundary.length);
  assert.equal(Buffer.byteLength(malformedSurrogates), 2_000_002);

  const originalParse = JSON.parse;
  let parseCalls = 0;
  JSON.parse = (...arguments_) => {
    parseCalls += 1;
    return originalParse(...arguments_);
  };
  try {
    assert.throws(
      () => PreviousCardCopyMatch.restore(oneByteOver),
      /size bound/,
    );
    assert.throws(
      () => PreviousCardCopyMatch.restore(malformedSurrogates),
      /size bound/,
    );
  } finally {
    JSON.parse = originalParse;
  }
  assert.equal(parseCalls, 0);
});

test("copy spell: runtime source is isolated and uses shared cycle/cost bounds", () => {
  const source = readFileSync(
    new URL("../src/content/cards/spells-copy-card.js", import.meta.url),
    "utf8",
  );
  assert.equal(source.includes("reference/"), false);
  assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now/);
  assert.match(source, /DeckCycle/);
  assert.match(source, /ELIXIR_CAPACITY/);
  assert.doesNotMatch(source, /Mirror|Supercell|Royale/u);
});

test("copy spell: caller mutation cannot alter setup or scheduled commands", () => {
  const options = setup();
  const match = new PreviousCardCopyMatch(options);
  options.deck[0] = "tampered";
  options.cards[0].cost = 10;
  assert.notEqual(match.state.deck.hand[0], "tampered");

  const command = { cardId: match.state.deck.hand[0], tick: 0 };
  match.schedulePlay(command);
  command.cardId = "tampered";
  match.advanceTicks(1);
  assert.notEqual(match.replay[0].requestedCardId, "tampered");
});

test("copy spell: scheduling limits and tick boundaries are explicit", () => {
  const match = fresh();
  assert.throws(() => match.runToTick(-1), /target tick/);
  match.advanceTicks(1);
  assert.throws(
    () => match.schedulePlay({ cardId: "echo", tick: 0 }),
    /resolved tick/,
  );
  assert.throws(() => match.runToTick(0), /already resolved/);

  const raw = JSON.parse(match.serialize());
  raw.commands = Array.from({ length: 10_000 }, () => ({
    cardId: "echo",
    tick: 999_999,
  }));
  const full = PreviousCardCopyMatch.restore(JSON.stringify(raw));
  assert.throws(
    () => full.schedulePlay({ cardId: "echo", tick: 999_999 }),
    /command limit/,
  );
  assert.throws(() => full.advanceTicks(1_000_000), /advance count/);
});
