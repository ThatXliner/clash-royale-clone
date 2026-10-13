import assert from "node:assert/strict";
import test from "node:test";

import { DeckCycle } from "../src/sim/deck.js";
import { ElixirMatch } from "../src/sim/elixir.js";
import {
  isPlayerDeployBridge,
  PlayerDeployBridge,
  createPlayerDeployIntent,
} from "../src/sim/game-player-deploy.js";
import { LiveBattle, parseLiveBattleSetup } from "../src/sim/live-battle.js";
import { ArenaInputController } from "../src/ui/input-controller.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
} from "../src/content/playable-roster.js";

const POINT = Object.freeze({ x: 3_500, y: 14_500 });

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function configuredBattle() {
  return new LiveBattle(parseLiveBattleSetup(canonical({
    initialWindupTicks: { central: 0, lane: 0 },
    questions: structuredClone(createPlayableRosterQuestionRecords()),
    roster: structuredClone(createPlayableRoster()),
  })));
}

function cards() {
  return createPlayableRoster().map(({ cost, id }) => ({ cost, id }));
}

function deckBytes(deck) {
  return deck.bytes ?? deck.serializeJson();
}

function elixirBytes(elixir) {
  return elixir.bytes ?? elixir.serialize();
}

function seedFor(cardId) {
  const ids = cards().map(({ id }) => id);
  for (let seed = 0; seed < 10_000; seed += 1) {
    const deck = new DeckCycle({ deck: ids, seed });
    if (deck.state.hand.includes(cardId)) return seed;
  }
  throw new Error(`no seed found for ${cardId}`);
}

function bridgeFor(cardId, { battle = configuredBattle(), elixir = null } = {}) {
  const catalog = cards();
  const deck = new DeckCycle({ deck: catalog.map(({ id }) => id), seed: seedFor(cardId) });
  const resource = elixir ?? new ElixirMatch({ startingElixir: 10 });
  return new PlayerDeployBridge({ battle, cards: catalog, deck, elixir: resource });
}

function receipt(bridge, cardId, overrides = {}) {
  const catalog = cards();
  const card = catalog.find(({ id }) => id === cardId);
  return {
    accepted: true,
    cardId,
    commandId: 1,
    cost: card.cost,
    point: { ...POINT },
    side: "south",
    slot: bridge.state.deck.hand.indexOf(cardId),
    spendSequence: 0,
    tick: bridge.state.tick,
    type: "deploy",
    ...overrides,
  };
}

test("game player deploy: all eight player cards spend, cycle, and materialize exact stable IDs once", () => {
  const expected = new Map([
    ["coilblade", 1], ["mossguard", 1], ["copperskiff", 1], ["skymaul", 1],
    ["brassbolt", 1], ["reedsting", 1], ["briar-band", 6], ["cinderlings", 3],
  ]);
  for (const card of cards()) {
    const bridge = bridgeFor(card.id);
    const before = bridge.state;
    const command = receipt(bridge, card.id);
    const intent = card.id === "coilblade"
      ? canonical(command)
      : createPlayerDeployIntent(command);
    const result = bridge.play(intent);
    assert.deepEqual(result.entityIds,
      Array.from({ length: expected.get(card.id) }, (_, index) => index + 1), card.id);
    assert.equal(bridge.state.elixir.sides.south.amount, 10 - card.cost, card.id);
    assert.equal(bridge.state.deck.sequence, before.deck.sequence + 1, card.id);
    assert.equal(bridge.state.deck.hand[command.slot], before.deck.next, card.id);
    assert.equal(bridge.state.battle.units.filter(({ cardId }) => cardId === card.id).length,
      card.id === "briar-band" ? 1 : expected.get(card.id),
      `${card.id} exposes only its first member at the sourced stagger boundary`);
    assert.equal(bridge.replay.length, 1);
    assert.deepEqual(bridge.replay[0].deployment.entityIds, result.entityIds);
    assert.equal(bridge.replay[0].spend.cost, card.cost);
    assert.equal(bridge.replay[0].deck.slot, command.slot);

    const bytes = bridge.serialize();
    assert.deepEqual(bridge.play(intent), result, "identical receipt is idempotent");
    assert.equal(bridge.serialize(), bytes, "idempotent replay changes no bytes");
    assert.throws(() => bridge.play(createPlayerDeployIntent({
      ...command, point: { x: 4_500, y: 14_500 },
    })),
      /divergent/u);
    assert.equal(bridge.serialize(), bytes);
  }
});

test("game player deploy: illegal, insufficient, wrong slot/card, side and tick reject byte-atomically", () => {
  const cases = [
    (bridge, value) => ({ ...value, point: { x: 3_500, y: 16_000 } }),
    (bridge, value) => ({ ...value, slot: (value.slot + 1) % 4 }),
    (bridge, value) => ({ ...value, cardId: "not-a-card" }),
    (bridge, value) => ({ ...value, cost: value.cost + 1 }),
    (bridge, value) => ({ ...value, side: "north" }),
    (bridge, value) => ({ ...value, tick: 1 }),
    (bridge, value) => ({ ...value, commandId: 10_001 }),
    (bridge, value) => ({ ...value, spendSequence: 7 }),
  ];
  for (const mutate of cases) {
    const bridge = bridgeFor("coilblade");
    const value = mutate(bridge, receipt(bridge, "coilblade"));
    const before = bridge.serialize();
    assert.throws(() => bridge.play(createPlayerDeployIntent(value)));
    assert.equal(bridge.serialize(), before);
    assert.equal(bridge.replay.length, 0);
  }

  const empty = bridgeFor("coilblade", {
    elixir: new ElixirMatch({ startingElixir: 0 }),
  });
  const emptyBefore = empty.serialize();
  assert.throws(() => empty.play(createPlayerDeployIntent(receipt(empty, "coilblade"))),
    /insufficient/u);
  assert.equal(empty.serialize(), emptyBefore);
});

test("game player deploy: battle capacity/materialization failure rolls back every owned system", () => {
  const battle = configuredBattle();
  for (let sequence = 0; sequence < 1_024; sequence += 1) {
    battle.scheduleDeploy(canonical({
      cardId: "coilblade", point: { ...POINT }, sequence, side: "south", tick: 0,
    }));
  }
  const bridge = bridgeFor("mossguard", {
    battle,
    elixir: new ElixirMatch({ startingElixir: 10 }),
  });
  const command = receipt(bridge, "mossguard", { spendSequence: 0 });
  const before = bridge.serialize();
  const state = bridge.state;
  assert.throws(() => bridge.play(createPlayerDeployIntent(command)), /bound|capacity/u);
  assert.equal(bridge.serialize(), before);
  assert.deepEqual(bridge.state, state);
  assert.equal(bridge.replay.length, 0);
});

test("game player deploy: steps, chunks, snapshots and restore continuation are byte-identical", () => {
  const configure = () => {
    const bridge = bridgeFor("cinderlings");
    bridge.play(createPlayerDeployIntent(receipt(bridge, "cinderlings")));
    return bridge;
  };
  const direct = configure();
  const snapshots = [direct.serialize()];
  const continuationTicks = 6;
  for (let tick = 0; tick < continuationTicks; tick += 1) {
    direct.step();
    snapshots.push(direct.serialize());
  }
  const chunked = configure();
  chunked.stepMany(continuationTicks);
  assert.equal(chunked.serialize(), direct.serialize());
  assert.deepEqual(chunked.state, direct.state);
  assert.deepEqual(chunked.replay, direct.replay);
  for (let cut = 0; cut < snapshots.length; cut += 1) {
    const restored = PlayerDeployBridge.restore(snapshots[cut]);
    restored.stepMany(continuationTicks - cut);
    assert.equal(restored.serialize(), direct.serialize(), `cut ${cut}`);
    assert.deepEqual(restored.state, direct.state, `state ${cut}`);
    assert.deepEqual(restored.replay, direct.replay, `replay ${cut}`);
  }
});

test("game player deploy: hostile commands, setup and snapshots never invoke accessors", () => {
  const bridge = bridgeFor("coilblade");
  const before = bridge.serialize();
  let reads = 0;
  const hostile = {};
  Object.defineProperty(hostile, "accepted", {
    enumerable: true,
    get() { reads += 1; return true; },
  });
  assert.throws(() => bridge.play(hostile), /branded intent/u);
  assert.equal(reads, 0);
  assert.equal(bridge.serialize(), before);
  let traps = 0;
  const proxy = new Proxy({}, {
    get() { traps += 1; return undefined; },
    getOwnPropertyDescriptor() { traps += 1; return undefined; },
    getPrototypeOf() { traps += 1; return Object.prototype; },
    ownKeys() { traps += 1; return []; },
  });
  assert.throws(() => bridge.play(proxy), /branded intent/u);
  assert.equal(traps, 0);
  assert.equal(bridge.serialize(), before);

  const valid = bridge.serialize();
  assert.equal(PlayerDeployBridge.restore(valid).serialize(), valid);
  assert.throws(() => PlayerDeployBridge.restore(` ${valid}`), /canonical/u);
  const forged = JSON.parse(valid);
  forged.history.push({ tick: 99, type: "step" });
  assert.throws(() => PlayerDeployBridge.restore(canonical(forged)));
  assert.throws(() => PlayerDeployBridge.restore("x".repeat(16_777_217)), /byte bound/u);
  const depthTwentyThousand = `${'{"x":'.repeat(20_000)}0${"}".repeat(20_000)}`;
  assert.throws(() => PlayerDeployBridge.restore(depthTwentyThousand), /depth bound/u);
  const tooManyNodes = `[${Array.from({ length: 100_001 }, () => "0").join(",")}]`;
  assert.throws(() => PlayerDeployBridge.restore(tooManyNodes), /node bound/u);
  assert.throws(() => PlayerDeployBridge.restore('{"cards":"\\ud800","history":[],"initial":{},"version":1}'),
    /Unicode surrogate/u);

  const catalog = cards();
  const wrong = catalog.map((card, index) => index === 0 ? { ...card, cost: card.cost + 1 } : card);
  assert.throws(() => new PlayerDeployBridge({
    battle: configuredBattle(), cards: wrong,
    deck: new DeckCycle({ deck: catalog.map(({ id }) => id), seed: 1 }),
    elixir: new ElixirMatch({ startingElixir: 10 }),
  }), /roster/u);
});

test("game player deploy: module-owned bridge brand rejects prototype forgeries trap-free", () => {
  const genuine = bridgeFor("coilblade");
  assert.equal(isPlayerDeployBridge(genuine), true);
  assert.equal(isPlayerDeployBridge(PlayerDeployBridge.restore(genuine.serialize())), true);
  assert.equal(isPlayerDeployBridge(Object.create(PlayerDeployBridge.prototype)), false);
  let traps = 0;
  const forged = new Proxy({}, {
    get() { traps += 1; return undefined; },
    getOwnPropertyDescriptor() { traps += 1; return undefined; },
    getPrototypeOf() { traps += 1; return PlayerDeployBridge.prototype; },
    ownKeys() { traps += 1; return []; },
  });
  assert.equal(isPlayerDeployBridge(forged), false);
  assert.equal(traps, 0);
  assert.equal(isPlayerDeployBridge(null), false);
  class ForgedSubclass extends PlayerDeployBridge {}
  assert.throws(() => new ForgedSubclass({}), /subclass construction is forbidden/u);
  assert.equal(Object.isFrozen(genuine), true);
  assert.equal(Object.isFrozen(PlayerDeployBridge.prototype), true);
  assert.throws(() => { genuine.play = () => ({ accepted: true }); }, TypeError);
  assert.throws(() => { PlayerDeployBridge.prototype.play = () => ({ accepted: true }); },
    TypeError);
  assert.equal(Object.hasOwn(genuine, "play"), false);
});

test("game player deploy: real ArenaInputController intent commits each roster card exactly once", () => {
  const expected = new Map([
    ["coilblade", 1], ["mossguard", 1], ["copperskiff", 1], ["skymaul", 1],
    ["brassbolt", 1], ["reedsting", 1], ["briar-band", 6], ["cinderlings", 3],
  ]);
  const uiCards = createPlayableRoster();
  for (const card of uiCards) {
    const deck = new DeckCycle({ deck: uiCards.map(({ id }) => id), seed: seedFor(card.id) });
    const elixir = new ElixirMatch({ startingElixir: 10 });
    const bridge = new PlayerDeployBridge({
      battle: configuredBattle(), cards: cards(), deck, elixir,
    });
    let visible = { deck, elixir };
    const input = new ArenaInputController({
      cards: uiCards,
      commitSystems(next) { visible = next; },
      deck,
      deployBridge: bridge,
      elixir,
      hudUpdate() {},
    });
    assert.equal(input.select(card.id).accepted, true);
    const result = input.placeArenaPoint({ ...POINT });
    assert.equal(result.accepted, true, card.id);
    assert.equal(result.command.id, 1);
    assert.equal(result.command.spendSequence, 0);
    assert.equal(bridge.replay[0].deployment.entityIds.length, expected.get(card.id));
    assert.equal(bridge.replay.length, 1);
    assert.equal(input.deck.bytes, bridge.deckBytes);
    assert.equal(input.elixir.bytes, bridge.elixirBytes);
    assert.equal(deckBytes(visible.deck), bridge.deckBytes);
    assert.equal(elixirBytes(visible.elixir), bridge.elixirBytes);
    const bytes = bridge.serialize();
    assert.equal(input.placeArenaPoint({ ...POINT }).reason, "nothing_selected");
    assert.equal(bridge.serialize(), bytes);
  }
});

test("game player deploy: prepared transactions are single-flight epoch capabilities", () => {
  const bridge = bridgeFor("coilblade");
  const intent = createPlayerDeployIntent(receipt(bridge, "coilblade"));
  const before = bridge.serialize();
  const stale = bridge.prepare(intent);
  assert.equal(bridge.serialize(), before, "prepare does not expose candidate state");
  assert.throws(() => bridge.prepare(intent), /outstanding/u);
  assert.throws(() => bridge.commitPrepared(Object.freeze(Object.create(null))), /invalid/u);
  assert.throws(() => bridgeFor("coilblade").commitPrepared(stale), /invalid/u);
  assert.equal(bridge.preparedResult(stale).result.commandId, 1);
  bridge.step();
  const stepped = bridge.serialize();
  assert.throws(() => bridge.commitPrepared(stale), /invalid/u);
  assert.equal(bridge.serialize(), stepped, "stale commit cannot overwrite stepped state");

  const sequential = bridgeFor("coilblade");
  const first = sequential.prepare(createPlayerDeployIntent(receipt(sequential, "coilblade")));
  sequential.commitPrepared(first);
  const afterFirst = sequential.serialize();
  assert.throws(() => sequential.commitPrepared(first), /invalid/u);
  assert.equal(sequential.serialize(), afterFirst, "consumed token cannot be reused");
  const nextCard = sequential.state.deck.hand[0];
  const second = sequential.prepare(createPlayerDeployIntent(receipt(sequential, nextCard, {
    commandId: 2,
    slot: 0,
    spendSequence: 1,
  })));
  assert.throws(() => sequential.commitPrepared(first), /invalid/u);
  sequential.commitPrepared(second);
  assert.equal(sequential.replay.length, 2);
  assert.deepEqual(sequential.state.processedCommandIds, [1, 2]);
});

test("game player deploy: authoritative HUD reentrancy cannot duplicate one command", () => {
  const uiCards = createPlayableRoster();
  const deck = new DeckCycle({ deck: uiCards.map(({ id }) => id), seed: seedFor("coilblade") });
  const elixir = new ElixirMatch({ startingElixir: 10 });
  const bridge = new PlayerDeployBridge({ battle: configuredBattle(), cards: cards(), deck, elixir });
  let input;
  let publishes = 0;
  let reentrantError = null;
  input = new ArenaInputController({
    cards: uiCards,
    commitSystems() { publishes += 1; },
    deck,
    deployBridge: bridge,
    elixir,
    hudUpdate(_selected, projection) {
      if (projection === undefined) return;
      try { input.placeArenaPoint({ ...POINT }); } catch (error) { reentrantError = error; }
    },
  });
  input.select("coilblade");
  assert.equal(input.placeArenaPoint({ ...POINT }).accepted, true);
  assert.match(reentrantError.message, /reentrant operation/u);
  assert.equal(publishes, 1);
  assert.equal(bridge.replay.length, 1);
  assert.equal(input.commands.length, 1);
});

test("game player deploy: selection HUD reentry cannot contradict one selection record", () => {
  const uiCards = createPlayableRoster();
  const deck = new DeckCycle({ deck: uiCards.map(({ id }) => id), seed: seedFor("coilblade") });
  const elixir = new ElixirMatch({ startingElixir: 10 });
  let input;
  const errors = [];
  input = new ArenaInputController({
    cards: uiCards,
    commitSystems() {},
    deck,
    elixir,
    hudUpdate(selected, projection) {
      if (selected === null || projection !== undefined) return;
      for (const nested of [
        () => input.cancel(),
        () => input.select(input.deck.state.hand[1]),
        () => input.dispose(),
      ]) {
        try { nested(); } catch (error) { errors.push(error); }
      }
    },
  });
  assert.equal(input.select("coilblade").accepted, true);
  assert.equal(input.selectedCardId, "coilblade");
  assert.equal(input.replay.length, 1);
  assert.deepEqual(input.commands, []);
  assert.equal(errors.length, 3);
  assert.match(errors[0].message, /reentrant operation/u);
  assert.match(errors[1].message, /reentrant operation/u);
  assert.match(errors[2].message, /reentrant disposal/u);
});

test("game player deploy: authoritative projection throw retains committed authority and poisons input", () => {
  const uiCards = createPlayableRoster();
  const deck = new DeckCycle({ deck: uiCards.map(({ id }) => id), seed: seedFor("coilblade") });
  const elixir = new ElixirMatch({ startingElixir: 10 });
  const bridge = new PlayerDeployBridge({ battle: configuredBattle(), cards: cards(), deck, elixir });
  let external = { deck, elixir };
  let calls = 0;
  const input = new ArenaInputController({
    cards: uiCards,
    commitSystems(next) {
      calls += 1;
      external = next;
      throw new Error("projection failed");
    },
    deck,
    deployBridge: bridge,
    elixir,
    hudUpdate() {},
  });
  input.select("coilblade");
  const bridgeBefore = bridge.serialize();
  let projectionFault;
  try { input.placeArenaPoint({ ...POINT }); } catch (error) { projectionFault = error; }
  assert.match(projectionFault.message, /projection failed/u);
  assert.ok(projectionFault instanceof AggregateError);
  assert.equal(Object.isFrozen(projectionFault), true);
  assert.equal(Object.isFrozen(projectionFault.errors), true);
  assert.equal(Object.isFrozen(projectionFault.errors[0]), true);
  assert.notEqual(bridge.serialize(), bridgeBefore);
  assert.equal(bridge.replay.length, 1);
  assert.equal(input.commands.length, 1);
  assert.equal(input.selectedCardId, null);
  assert.equal(input.faultCode, "authoritative_projection_failed");
  assert.equal(input.deck.bytes, bridge.deckBytes);
  assert.equal(input.elixir.bytes, bridge.elixirBytes);
  assert.equal(input.deck.play, undefined);
  assert.equal(Object.isFrozen(input.deck), true);
  assert.equal(Object.isFrozen(input.deck.state.hand), true);
  assert.equal(Object.isFrozen(input.commands), true);
  assert.equal(Object.isFrozen(input.commands[0].point), true);
  assert.equal(deckBytes(external.deck), bridge.deckBytes);
  assert.equal(elixirBytes(external.elixir), bridge.elixirBytes);
  assert.equal(Object.isFrozen(external), true);
  assert.equal(Object.isFrozen(external.deck), true);
  assert.equal(Object.isFrozen(external.deck.state), true);
  assert.equal(external.deck.play, undefined);
  const retainedBytes = external.deck.bytes;
  assert.throws(() => { external.deck.state.hand[0] = "forged"; }, TypeError);
  assert.equal(external.deck.bytes, retainedBytes);
  assert.equal(bridge.deckBytes, retainedBytes);
  assert.equal(calls, 1);
  assert.throws(() => input.select(input.deck.state.hand[0]), /poisoned/u);
  assert.throws(() => input.placeArenaPoint({ ...POINT }), /poisoned/u);
  assert.throws(() => input.serialize(), /poisoned/u);
});

test("game player deploy: authoritative thenable publication commits once and terminally faults", () => {
  const uiCards = createPlayableRoster();
  const deck = new DeckCycle({ deck: uiCards.map(({ id }) => id), seed: seedFor("coilblade") });
  const elixir = new ElixirMatch({ startingElixir: 10 });
  const bridge = new PlayerDeployBridge({ battle: configuredBattle(), cards: cards(), deck, elixir });
  let publisherCalls = 0;
  const input = new ArenaInputController({
    cards: uiCards,
    commitSystems() { publisherCalls += 1; },
    deck,
    deployBridge: bridge,
    elixir,
    hudUpdate(_selected, projection) {
      return projection === undefined ? undefined : Object.freeze({ then() {} });
    },
  });
  input.select("coilblade");
  assert.throws(() => input.placeArenaPoint({ ...POINT }), /projection failed/u);
  assert.equal(publisherCalls, 0, "thenable HUD blocks the later publisher");
  assert.equal(bridge.replay.length, 1);
  assert.equal(input.commands.length, 1);
  assert.equal(input.faultCode, "authoritative_projection_failed");
  assert.equal(input.deck.bytes, bridge.deckBytes);
  assert.throws(() => input.cancel(), /poisoned/u);

  const deck2 = new DeckCycle({ deck: uiCards.map(({ id }) => id), seed: seedFor("coilblade") });
  const elixir2 = new ElixirMatch({ startingElixir: 10 });
  const bridge2 = new PlayerDeployBridge({
    battle: configuredBattle(), cards: cards(), deck: deck2, elixir: elixir2,
  });
  let publisherCalls2 = 0;
  const input2 = new ArenaInputController({
    cards: uiCards,
    commitSystems() {
      publisherCalls2 += 1;
      return Object.freeze({ then() {} });
    },
    deck: deck2,
    deployBridge: bridge2,
    elixir: elixir2,
    hudUpdate() {},
  });
  input2.select("coilblade");
  assert.throws(() => input2.placeArenaPoint({ ...POINT }), /projection failed/u);
  assert.equal(publisherCalls2, 1);
  assert.equal(bridge2.replay.length, 1);
  assert.equal(input2.commands.length, 1);
  assert.equal(input2.faultCode, "authoritative_projection_failed");
});

test("game player deploy: legacy and authoritative controllers cannot share mutable systems", () => {
  const uiCards = createPlayableRoster();
  const deck = new DeckCycle({ deck: uiCards.map(({ id }) => id), seed: seedFor("coilblade") });
  const elixir = new ElixirMatch({ startingElixir: 10 });
  const bridge = new PlayerDeployBridge({ battle: configuredBattle(), cards: cards(), deck, elixir });
  const authoritative = new ArenaInputController({
    cards: uiCards,
    commitSystems() {},
    deck,
    deployBridge: bridge,
    elixir,
    hudUpdate() {},
  });
  assert.throws(() => new ArenaInputController({
    cards: uiCards,
    commitSystems() {},
    deck,
    elixir,
    hudUpdate() {},
  }), /already have an input authority/u);
  authoritative.select("coilblade");
  authoritative.placeArenaPoint({ ...POINT });
  assert.equal(bridge.replay.length, 1);
  assert.equal(authoritative.dispose(), true);
  assert.equal(authoritative.dispose(), false);
  const legacy = new ArenaInputController({
    cards: uiCards,
    commitSystems() {},
    deck,
    elixir,
    hudUpdate() {},
  });
  assert.ok(legacy);
});

test("game player deploy: one bridge has one controller authority and failed claims unwind", () => {
  const uiCards = createPlayableRoster();
  const originalDeck = new DeckCycle({
    deck: uiCards.map(({ id }) => id), seed: seedFor("coilblade"),
  });
  const originalElixir = new ElixirMatch({ startingElixir: 10 });
  const bridge = new PlayerDeployBridge({
    battle: configuredBattle(), cards: cards(), deck: originalDeck, elixir: originalElixir,
  });
  const firstDeck = DeckCycle.restore(originalDeck.serializeJson());
  const firstElixir = ElixirMatch.restore(originalElixir.serialize());
  const first = new ArenaInputController({
    cards: uiCards, commitSystems() {}, deck: firstDeck, deployBridge: bridge,
    elixir: firstElixir, hudUpdate() {},
  });
  const rejectedDeck = DeckCycle.restore(originalDeck.serializeJson());
  const rejectedElixir = ElixirMatch.restore(originalElixir.serialize());
  assert.throws(() => new ArenaInputController({
    cards: uiCards, commitSystems() {}, deck: rejectedDeck, deployBridge: bridge,
    elixir: rejectedElixir, hudUpdate() {},
  }), /already have an input authority/u);
  const provesUnwound = new ArenaInputController({
    cards: uiCards, commitSystems() {}, deck: rejectedDeck,
    elixir: rejectedElixir, hudUpdate() {},
  });
  assert.ok(provesUnwound);
  provesUnwound.dispose();
  first.dispose();
  const recreated = new ArenaInputController({
    cards: uiCards, commitSystems() {}, deck: rejectedDeck, deployBridge: bridge,
    elixir: rejectedElixir, hudUpdate() {},
  });
  assert.ok(recreated);
});

test("game player deploy: authoritative recreate continues command, action and spend identities", () => {
  const uiCards = createPlayableRoster();
  const initialDeck = new DeckCycle({
    deck: uiCards.map(({ id }) => id), seed: seedFor("coilblade"),
  });
  const initialElixir = new ElixirMatch({ startingElixir: 10 });
  let bridge = new PlayerDeployBridge({
    battle: configuredBattle(), cards: cards(), deck: initialDeck, elixir: initialElixir,
  });
  let deck = initialDeck;
  let elixir = initialElixir;
  const build = () => new ArenaInputController({
    cards: uiCards,
    commitSystems(next) { ({ deck, elixir } = next); },
    deck,
    deployBridge: bridge,
    elixir,
    hudUpdate() {},
  });
  let input = build();
  for (let commandId = 1; commandId <= 3; commandId += 1) {
    const cardId = input.deck.state.hand[0];
    assert.equal(input.select(cardId).accepted, true);
    const result = input.placeArenaPoint({ ...POINT });
    assert.equal(result.command.id, commandId);
    assert.equal(result.command.sequence, commandId - 1);
    assert.equal(result.command.spendSequence, commandId - 1);
    assert.equal(input.commands.length, commandId);
    assert.equal(input.replay.length, commandId * 2);
    assert.equal(bridge.replay.filter(({ type }) => type === "player-deployed").length,
      commandId);
    input.dispose();
    if (commandId === 2) {
      bridge = PlayerDeployBridge.restore(bridge.serialize());
      bridge.stepMany(2);
      deck = DeckCycle.restore(bridge.deckBytes);
      elixir = ElixirMatch.restore(bridge.elixirBytes);
    }
    input = build();
    assert.equal(input.commands.length, commandId);
    assert.equal(input.replay.length, commandId * 2);
  }
});
