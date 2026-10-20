import assert from "node:assert/strict";
import test from "node:test";

import { createPlayableRoster, createPlayableRosterQuestionRecords } from
  "../src/content/playable-roster.js";
import { DeckCycle } from "../src/sim/deck.js";
import { ElixirMatch } from "../src/sim/elixir.js";
import { GameSession } from "../src/sim/game-session.js";
import { GameInputBridge } from "../src/ui/game-input-bridge.js";
import {
  consumeArenaInputFeedbackReceipt,
  createArenaInputHudCapability,
  mountArenaInputController,
  serializeArenaInputCards,
} from "../src/ui/input-controller.js";
import { createEditableGameSessionSetup } from "../src/content/editable-deck.js";

const RECT = Object.freeze({ height: 960, left: 90, top: 108, width: 540 });
const LEGAL = Object.freeze({ clientX: 270, clientY: 708 });
const RIVER = Object.freeze({ clientX: 360, clientY: 588 });
const ROSTER = createPlayableRoster();
const DECK = ROSTER.map(({ id }) => id);
const SEED = "input-bridge";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sessionSetup(startingElixir = 10) {
  const questions = createPlayableRosterQuestionRecords();
  const battleSetup = canonical({
    initialWindupTicks: { central: 0, lane: 0 }, questions, roster: ROSTER,
  });
  const legalNorthDeployments = DECK.map((cardId) => ({
    cardId, point: { x: 3_500, y: 17_500 },
  })).sort((left, right) => left.cardId.localeCompare(right.cardId));
  return canonical({
    battleSetup,
    deck: DECK,
    legalNorthDeployments,
    rosterWitness: canonical({ questions, roster: ROSTER }),
    seed: SEED,
    startingElixir: { north: startingElixir, south: startingElixir },
    thinkIntervalTicks: 60,
    thinkOffsetTicks: 0,
  });
}

class Node {
  constructor(ownerDocument) {
    this.dataset = {};
    this.listeners = new Map();
    this.lookups = new Map();
    this.ownerDocument = ownerDocument;
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
  querySelectorAll(selector) {
    const value = this.lookups.get(selector);
    return Array.isArray(value) ? value : value === undefined ? [] : [value];
  }
  emit(type, event) { return this.listeners.get(type)(event); }
}

function fixture({ pointer = true, sessionElixir = 10, uiElixir = 10 } = {}) {
  const document = {
    defaultView: pointer ? { PointerEvent: class PointerEvent {} } : {},
  };
  const shell = new Node(document);
  const arena = new Node(document);
  arena.clientHeight = RECT.height;
  arena.clientLeft = 0;
  arena.clientTop = 0;
  arena.clientWidth = RECT.width;
  arena.getBoundingClientRect = () => RECT;
  const deck = new DeckCycle({ deck: DECK, seed: `${SEED}:south` });
  const elixir = new ElixirMatch({ startingElixir: uiElixir });
  let projected = { deck, elixir };
  const hand = deck.state.hand.map((cardId) => {
    const node = new Node(document);
    node.dataset.cardId = cardId;
    return node;
  });
  shell.lookups.set('[data-ui="arena"]', arena);
  shell.lookups.set('[data-ui="card-slot"]', hand);
  const mounted = mountArenaInputController(shell, createArenaInputHudCapability(
    serializeArenaInputCards(ROSTER),
    deck.serializeJson(),
    elixir.serialize(),
    (next) => { projected = next; },
    () => {},
  ));
  const session = new GameSession(sessionSetup(sessionElixir));
  const bridge = new GameInputBridge(mounted, session);
  return { arena, bridge, hand, mounted, projected: () => projected, session };
}

function spellFixture() {
  const deckIds = ["coilblade", "mossguard", "squall-orb", "skymaul",
    "brassbolt", "reedsting", "briar-band", "cinderlings"];
  const session = new GameSession(createEditableGameSessionSetup(deckIds, 0));
  const sessionSetup = JSON.parse(session.serialize()).setup;
  const battleSetup = JSON.parse(sessionSetup.battleSetup);
  const spellProfile = battleSetup.spellProfileReceipts.profiles.find(({ profileId }) =>
    profileId === "squall-orb-radius-v2");
  const cards = battleSetup.roster.map((card) => ({
    areaDamageRadiusMillitiles: card.id === spellProfile.fact.cardId
      ? spellProfile.fact.areaDamageRadiusMillitiles : card.areaDamageRadiusMillitiles,
    cost: card.cost,
    count: card.count,
    damage: card.damage,
    deployTimeTicks: card.deployTimeTicks,
    displayName: card.displayName,
    entities: card.entities,
    firstHitTicks: card.firstHitTicks,
    formation: card.formation,
    hitSpeedTicks: card.hitSpeedTicks,
    hitpoints: card.hitpoints,
    id: card.id,
    kind: card.kind,
    movementMillitilesPerSecond: card.movementMillitilesPerSecond,
    rangeMillitiles: card.rangeMillitiles,
    rarity: card.rarity,
    sightRangeMillitiles: card.sightRangeMillitiles,
    targetMode: card.targetMode,
  }));
  const document = { defaultView: { PointerEvent: class PointerEvent {} } };
  const shell = new Node(document);
  const arena = new Node(document);
  arena.clientHeight = RECT.height;
  arena.clientLeft = 0;
  arena.clientTop = 0;
  arena.clientWidth = RECT.width;
  arena.getBoundingClientRect = () => RECT;
  const deck = new DeckCycle({ deck: deckIds, seed: "0:south" });
  assert.ok(deck.state.hand.includes("squall-orb"), "the fixture opens with Squall Orb in hand");
  const elixir = new ElixirMatch({ startingElixir: 10 });
  const hand = deck.state.hand.map((cardId) => {
    const node = new Node(document);
    node.dataset.cardId = cardId;
    return node;
  });
  shell.lookups.set('[data-ui="arena"]', arena);
  shell.lookups.set('[data-ui="card-slot"]', hand);
  const mounted = mountArenaInputController(shell, createArenaInputHudCapability(
    serializeArenaInputCards(cards), deck.serializeJson(), elixir.serialize(), () => {}, () => {},
  ));
  const bridge = new GameInputBridge(mounted, session);
  return { arena, bridge, hand, mounted, session };
}

function selectCheapest(value) {
  const costs = new Map(ROSTER.map(({ cost, id }) => [id, cost]));
  const handIds = value.mounted.input.deck.state.hand;
  const cardId = [...handIds].sort((left, right) =>
    costs.get(left) - costs.get(right) || left.localeCompare(right))[0];
  const slot = handIds.indexOf(cardId);
  value.hand[slot].dataset.cardId = cardId;
  value.hand[slot].emit("click", { currentTarget: value.hand[slot] });
  return { cardId, slot };
}

function allTrapHandler(deny) {
  return {
    apply: deny,
    construct: deny,
    defineProperty: deny,
    deleteProperty: deny,
    get: deny,
    getOwnPropertyDescriptor: deny,
    getPrototypeOf: deny,
    has: deny,
    isExtensible: deny,
    ownKeys: deny,
    preventExtensions: deny,
    set: deny,
    setPrototypeOf: deny,
  };
}

function allTrapProxy(target) {
  let callbacks = 0;
  const deny = () => { callbacks += 1; throw new Error("proxy trap executed"); };
  const handler = allTrapHandler(deny);
  return { callbacks: () => callbacks, proxy: new Proxy(target, handler) };
}

test("game input bridge: pointer commit reaches session and feedback exactly once", () => {
  const value = fixture();
  const feedback = [];
  value.mounted.setFeedback({
    onPlace(receipt) { feedback.push(consumeArenaInputFeedbackReceipt(receipt)); },
    onSelect() {},
  });
  const selected = selectCheapest(value);
  const result = value.arena.emit("pointerup", LEGAL);
  assert.equal(result.accepted, true);
  assert.equal(feedback.length, 1);
  assert.equal(value.bridge.state.deliveries.length, 1);
  assert.deepEqual(value.bridge.state.deliveries[0].command, {
    cardId: selected.cardId,
    commandId: 1,
    point: { x: 6_000, y: 12_000 },
    slot: selected.slot,
    tick: 0,
    type: "deploy",
  });
  assert.deepEqual(value.session.state.pendingPlayerCommands,
    [value.bridge.state.deliveries[0].command]);
  value.session.step();
  assert.equal(value.session.replay.filter(({ side, type }) =>
    side === "south" && type === "session-deployed").length, 1);
});

test("game input bridge: typed Squall Orb command carries its required side and restores exactly", () => {
  const value = spellFixture();
  const slot = value.hand.findIndex(({ dataset }) => dataset.cardId === "squall-orb");
  assert.notEqual(slot, -1);
  value.hand[slot].emit("click", { currentTarget: value.hand[slot] });
  const placed = value.arena.emit("pointerup", LEGAL);
  assert.equal(placed.accepted, true);
  assert.deepEqual(value.bridge.state.deliveries[0].command, {
    cardId: "squall-orb",
    commandId: 1,
    point: { x: 6_000, y: 12_000 },
    side: "south",
    slot,
    tick: 0,
    type: "spell",
  });
  assert.deepEqual(value.session.state.pendingPlayerCommands,
    [value.bridge.state.deliveries[0].command]);
  value.session.step();
  assert.deepEqual(value.session.state.battle.pendingSpellIntents.map(({ cardId, profileId }) =>
    ({ cardId, profileId })), [{ cardId: "squall-orb", profileId: "squall-orb-radius-v2" }]);

  const bridgeBytes = value.bridge.serialize();
  const sessionBytes = value.session.serialize();
  assert.equal(value.bridge.unsubscribe(), true);
  const restoredSession = GameSession.restore(sessionBytes);
  const restored = GameInputBridge.restore(bridgeBytes, value.mounted, restoredSession);
  assert.equal(restored.serialize(), bridgeBytes);
  assert.equal(restoredSession.serialize(), sessionBytes);
  restoredSession.stepMany(2);
  assert.ok(restoredSession.replay.some(({ profileId, type }) =>
    type === "spell-intent-resolved" && profileId === "squall-orb-radius-v2"));
});

test("game input bridge: illegal, duplicate and compatibility mouse mutate no session", () => {
  const illegal = fixture();
  selectCheapest(illegal);
  const beforeIllegal = illegal.session.serialize();
  assert.equal(illegal.arena.emit("pointerup", RIVER).accepted, false);
  assert.equal(illegal.session.serialize(), beforeIllegal);
  assert.equal(illegal.bridge.state.deliveries.length, 0);

  const touch = fixture({ pointer: false });
  selectCheapest(touch);
  const accepted = touch.arena.emit("touchend", { changedTouches: [LEGAL] });
  assert.equal(accepted.accepted, true);
  const once = touch.session.serialize();
  assert.equal(touch.arena.emit("mouseup", LEGAL).reason,
    "compatibility_mouse_suppressed");
  assert.equal(touch.session.serialize(), once);
  assert.equal(touch.bridge.state.deliveries.length, 1);
  assert.equal(touch.arena.emit("mouseup", { clientX: 271, clientY: 708 }).accepted,
    false, "second placement has no selection");
  assert.equal(touch.session.serialize(), once);
});

test("game input bridge: rejected session command is atomic and never recorded", () => {
  const value = fixture({ sessionElixir: 0, uiElixir: 10 });
  selectCheapest(value);
  const before = value.session.serialize();
  assert.throws(() => value.arena.emit("pointerup", LEGAL), /unaffordable/u);
  assert.equal(value.session.serialize(), before);
  assert.deepEqual(value.bridge.state.deliveries, []);
});

test("game input bridge: unsubscribe and restore never redeliver", () => {
  const value = fixture();
  selectCheapest(value);
  value.arena.emit("pointerup", LEGAL);
  const bridgeBytes = value.bridge.serialize();
  const sessionBytes = value.session.serialize();
  assert.equal(value.bridge.unsubscribe(), true);
  assert.equal(value.bridge.unsubscribe(), false);

  selectCheapest(value);
  const beforeUnsubscribedGesture = value.session.serialize();
  assert.equal(value.arena.emit("pointerup", LEGAL).accepted, true);
  assert.equal(value.session.serialize(), beforeUnsubscribedGesture);

  const restoredSession = GameSession.restore(sessionBytes);
  const beforeRestore = restoredSession.serialize();
  const restored = GameInputBridge.restore(
    bridgeBytes,
    value.mounted,
    restoredSession,
  );
  assert.equal(restoredSession.serialize(), beforeRestore);
  assert.equal(restored.state.deliveries.length, 1);
  assert.equal(restored.unsubscribe(), true);
  assert.equal(restoredSession.serialize(), beforeRestore);

  value.mounted.cleanup();
  assert.throws(() => new GameInputBridge(value.mounted, restoredSession),
    /live mount/u);
  assert.equal(restoredSession.serialize(), beforeRestore);
});

test("game input bridge: duplicate sink and hostile snapshots fail without session mutation", () => {
  const value = fixture();
  const before = value.session.serialize();
  assert.throws(() => new GameInputBridge(value.mounted, value.session),
    /already subscribed/u);
  assert.equal(value.session.serialize(), before);
  for (const bytes of ["{}", ` ${value.bridge.serialize()}`,
    value.bridge.serialize().replace('"version":1', '"version":2')]) {
    assert.throws(() => GameInputBridge.restore(bytes, value.mounted, value.session));
    assert.equal(value.session.serialize(), before);
  }
});

test("game input bridge: GameSession authentication is trap-zero in construction and restore", () => {
  const value = fixture();
  selectCheapest(value);
  value.arena.emit("pointerup", LEGAL);
  const bridgeBytes = value.bridge.serialize();
  const sessionBytes = value.session.serialize();
  assert.equal(value.bridge.unsubscribe(), true);

  const objectProxy = allTrapProxy({});
  const callableProxy = allTrapProxy(() => {});
  let revokedCallbacks = 0;
  const revoked = Proxy.revocable({}, allTrapHandler(() => {
    revokedCallbacks += 1;
    throw new Error("revoked proxy trap executed");
  }));
  revoked.revoke();
  const impostors = [objectProxy.proxy, callableProxy.proxy, revoked.proxy];

  for (const session of impostors) {
    assert.throws(() => new GameInputBridge(value.mounted, session),
      /requires one exact GameSession/u);
    assert.throws(() => GameInputBridge.restore(bridgeBytes, value.mounted, session),
      /requires one exact GameSession/u);
  }
  assert.equal(objectProxy.callbacks(), 0);
  assert.equal(callableProxy.callbacks(), 0);
  assert.equal(revokedCallbacks, 0);
  assert.equal(value.session.serialize(), sessionBytes);

  const genuine = GameInputBridge.restore(bridgeBytes, value.mounted, value.session);
  assert.equal(genuine.serialize(), bridgeBytes);
  assert.equal(value.session.serialize(), sessionBytes);
  assert.equal(genuine.unsubscribe(), true);
});
