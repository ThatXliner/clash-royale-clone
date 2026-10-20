import assert from "node:assert/strict";
import test from "node:test";

import { PlayerDeployBridge } from "../src/sim/game-player-deploy.js";
import { LiveBattle, parseLiveBattleSetup } from "../src/sim/live-battle.js";
import { ElixirMatch } from "../src/sim/elixir.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
} from "../src/content/playable-roster.js";
import {
  createArenaSessionInjectionCapability,
  createInitialArenaHudSystems,
  mountArenaShellWithHud,
} from "../src/ui/arena-shell-entry.js";
import {
  consumeArenaInputFeedbackReceipt,
  createArenaInputBridgeWitness,
  createArenaInputHudCapability,
  mountArenaInputController,
  serializeArenaInputCards,
} from "../src/ui/input-controller.js";

const RECT = Object.freeze({ height: 960, left: 90, top: 108, width: 540 });
const LEGAL_POINT = Object.freeze({ clientX: 270, clientY: 708 });

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

class Node {
  constructor(ownerDocument = null) {
    this.dataset = {};
    this.children = [];
    this.className = "";
    this.innerHTML = "";
    this.listeners = new Map();
    this.lookups = new Map();
    this.ownerDocument = ownerDocument;
    this.style = { setProperty() {}, width: "" };
    this.textContent = "";
    this.value = "";
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  appendChild(child) { this.children.push(child); return child; }
  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
  remove() { this.removed = true; }
  setAttribute(name, value) { this[name] = value; }
  querySelector(selector) {
    const value = this.lookups.get(selector);
    return Array.isArray(value) ? value[0] ?? null : value ?? null;
  }
  querySelectorAll(selector) {
    const value = this.lookups.get(selector);
    return Array.isArray(value) ? value : value === undefined ? [] : [value];
  }
}

function entryRoot() {
  let shell;
  const document = {
    createElement(tag) {
      if (tag === "template") {
        return {
          content: { cloneNode() { return shell; } },
          innerHTML: "",
        };
      }
      return new Node(document);
    },
  };
  shell = new Node(document);
  const timer = new Node(document);
  const north = new Node(document);
  const south = new Node(document);
  north.lookups.set("i", [new Node(document), new Node(document), new Node(document)]);
  south.lookups.set("i", [new Node(document), new Node(document), new Node(document)]);
  const hand = Array.from({ length: 4 }, () => new Node(document));
  const next = new Node(document);
  const rail = new Node(document);
  const fill = new Node(document);
  const output = new Node(document);
  const arena = new Node(document);
  arena.clientHeight = RECT.height;
  arena.clientLeft = 0;
  arena.clientTop = 0;
  arena.clientWidth = RECT.width;
  arena.getBoundingClientRect = () => RECT;
  rail.lookups.set(".elixir-fill", fill);
  rail.lookups.set("output", output);
  shell.lookups.set('[data-ui="arena"]', arena);
  shell.lookups.set('[data-ui="timer"]', timer);
  shell.lookups.set('[data-ui="opponent-hud"] .crown-track', north);
  shell.lookups.set('[data-ui="player-hud"] .crown-track', south);
  shell.lookups.set('[data-ui="card-slot"]', hand);
  shell.lookups.set('[data-ui="next-card"]', next);
  shell.lookups.set('[data-ui="elixir-rail"]', rail);
  const root = new Node(document);
  root.replaceChildren = (child) => { root.firstElementChild = child; };
  return { arena, hand, output, root };
}

function browserShell() {
  const shell = new Node();
  const arena = new Node();
  arena.clientHeight = RECT.height;
  arena.clientLeft = 0;
  arena.clientTop = 0;
  arena.clientWidth = RECT.width;
  arena.getBoundingClientRect = () => RECT;
  const hand = Array.from({ length: 4 }, () => new Node());
  shell.lookups.set('[data-ui="arena"]', arena);
  shell.lookups.set('[data-ui="card-slot"]', hand);
  return { arena, hand, shell };
}

function authoritativeSystems() {
  const initial = createInitialArenaHudSystems();
  const roster = createPlayableRoster();
  const cards = initial.cards;
  const battle = new LiveBattle(parseLiveBattleSetup(canonical({
    initialWindupTicks: { central: 0, lane: 0 },
    questions: createPlayableRosterQuestionRecords(),
    roster,
  })));
  const bridge = new PlayerDeployBridge({
    battle,
    cards: roster.map(({ cost, id }) => ({ cost, id })),
    deck: initial.deck,
    elixir: new ElixirMatch({ startingElixir: 10 }),
  });
  return { bridge, cards };
}

function tokenFor(cards, bridge, commit, update, overrides = {}) {
  return createArenaInputHudCapability(
    overrides.cardsText ?? serializeArenaInputCards(cards),
    overrides.deckBytes ?? bridge.deckBytes,
    overrides.elixirBytes ?? bridge.elixirBytes,
    commit,
    update,
    createArenaInputBridgeWitness(bridge),
  );
}

function playCheapest(mounted, nodes, cards, cycle, receipts) {
  const costs = new Map(cards.map(({ cost, id }) => [id, cost]));
  const hand = mounted.input.deck.state.hand;
  const cardId = [...hand].sort((left, right) =>
    costs.get(left) - costs.get(right) || left.localeCompare(right))[0];
  const slot = hand.indexOf(cardId);
  nodes.hand[slot].dataset.cardId = cardId;
  nodes.hand[slot].listeners.get("click")({ currentTarget: nodes.hand[slot] });
  const result = cycle % 2 === 0
    ? mounted.onTouch({ changedTouches: [LEGAL_POINT] })
    : mounted.onMouse(LEGAL_POINT);
  if (cycle % 2 === 0) {
    const before = receipts.length;
    assert.equal(mounted.onMouse(LEGAL_POINT).reason, "compatibility_mouse_suppressed");
    assert.equal(receipts.length, before, "compatibility mouse redelivered no feedback");
  }
  return result;
}

test("game player remount: sixteen fresh-token mounts preserve one authoritative cursor", () => {
  const source = authoritativeSystems();
  let bridge = source.bridge;
  let projected = null;
  let publications = 0;
  let updates = 0;
  const receipts = [];
  const commit = (next) => { publications += 1; projected = next; };
  const update = () => { updates += 1; };
  let capability = tokenFor(source.cards, bridge, commit, update);
  let mounted;
  const entityIds = [];

  for (let cycle = 1; cycle <= 16; cycle += 1) {
    const nodes = browserShell();
    mounted = mountArenaInputController(nodes.shell, capability);
    mounted.setFeedback({
      onPlace(receipt) { receipts.push(receipt); },
      onSelect() {},
    });
    const priorCommandCount = Math.min(cycle - 1, 3);
    assert.equal(mounted.input.commands.length, priorCommandCount);
    assert.equal(mounted.input.replay.length, priorCommandCount * 2);
    let result;
    if (cycle <= 3) {
      result = playCheapest(mounted, nodes, source.cards, cycle, receipts);
      assert.equal(result.accepted, true);
      assert.equal(result.command.id, cycle);
      assert.equal(result.command.sequence, cycle - 1);
      assert.equal(result.command.spendSequence, cycle - 1);
      assert.equal(Object.isFrozen(projected), true);
    } else if (cycle % 2 === 0) {
      result = mounted.onTouch({ changedTouches: [LEGAL_POINT] });
      const before = receipts.length;
      assert.equal(mounted.onMouse(LEGAL_POINT).reason,
        "compatibility_mouse_suppressed");
      assert.equal(receipts.length, before);
    } else {
      result = mounted.onMouse(LEGAL_POINT);
    }
    const commandCount = Math.min(cycle, 3);
    assert.equal(mounted.input.commands.length, commandCount);
    assert.equal(mounted.input.replay.length, commandCount * 2);
    assert.equal(mounted.input.deck.state.sequence, commandCount);

    const feedback = consumeArenaInputFeedbackReceipt(receipts.at(-1));
    assert.equal(feedback.result.accepted, cycle <= 3);
    if (cycle <= 3) assert.equal(feedback.result.command.id, cycle);
    assert.equal(feedback.commands.length, commandCount);
    assert.throws(() => consumeArenaInputFeedbackReceipt(receipts.at(-1)), /consumed/u);
    const deployments = bridge.replay.filter(({ type }) => type === "player-deployed");
    assert.equal(deployments.length, commandCount);
    assert.deepEqual(deployments.map(({ receipt }) => receipt.commandId),
      Array.from({ length: commandCount }, (_, index) => index + 1));
    if (cycle <= 3) entityIds.push(...deployments.at(-1).deployment.entityIds);

    const oldCapability = capability;
    assert.equal(mounted.cleanup(), true);
    assert.throws(() => mountArenaInputController(browserShell().shell, oldCapability),
      /consumed/u);
    if (cycle < 16) {
      if (cycle === 2) {
        bridge.stepMany(1);
        bridge = PlayerDeployBridge.restore(bridge.serialize());
        capability = tokenFor(source.cards, bridge, commit, update);
      } else {
        capability = mounted.createContinuationCapability();
      }
    }
  }

  assert.equal(new Set(entityIds).size, entityIds.length, "entities materialized once");
  assert.equal(publications, 3);
  assert.equal(updates, 6);
  assert.equal(receipts.length, 16);
  assert.equal(bridge.state.processedCommandIds.length, 3);
});

test("game player remount: shipped entry owns bridge lifecycle through restore and remount", () => {
  const defaultSession = mountArenaShellWithHud(entryRoot().root);
  assert.equal(defaultSession.elixir.state.sides.south.amount, 5,
    "shipped default retains the canonical initial resource state");
  assert.equal(defaultSession.disposeSession(), true);

  const nodes = entryRoot();
  const supplied = authoritativeSystems();
  const injection = createArenaSessionInjectionCapability(supplied.bridge);
  supplied.bridge.stepMany(1);
  const session = mountArenaShellWithHud(nodes.root, injection);
  const retained = session.bridge;
  for (const [surface, method] of [
    [session.bridge, "stepMany"],
    [session.battle, "step"],
    [session.deck, "play"],
    [session.elixir, "scheduleSpend"],
    [session.input, "placeArenaPoint"],
    [session.match, "step"],
    [session.placementFeedback, "recordPlacement"],
  ]) {
    assert.equal(surface[method], undefined, `${method} is not exposed`);
    assert.equal(Object.isFrozen(surface), true);
  }
  assert.notEqual(session.bridge, retained, "diagnostics are fresh snapshots");
  assert.throws(() => { retained.deck.state.sequence = 99; }, TypeError);
  for (const invoke of [
    () => session.bridge.stepMany(1),
    () => session.deck.play("cinderlings"),
    () => session.elixir.scheduleSpend(0, "south", 1),
    () => session.match.step(),
    () => session.input.placeArenaPoint({ x: 6_000, y: 12_000 }),
  ]) assert.throws(invoke, TypeError);
  const beforeInvalidOperation = session.bridge.bytes;
  assert.throws(() => session.advance(-1), /ticks are invalid/u);
  assert.throws(() => session.remountInput(), /requires clean input/u);
  assert.equal(session.bridge.bytes, beforeInvalidOperation);
  supplied.bridge.stepMany(1);
  assert.equal(session.bridge.bytes, beforeInvalidOperation,
    "injected bridge authority is cloned on admission");
  const entityIds = [];
  const play = (commandId) => {
    const hand = session.input.deck.state.hand;
    const cards = new Map(session.cards.map((card) => [card.id, card]));
    const cardId = [...hand].sort((left, right) =>
      cards.get(left).cost - cards.get(right).cost)[0];
    const slot = hand.indexOf(cardId);
    nodes.hand[slot].listeners.get("click")({ currentTarget: nodes.hand[slot] });
    const result = nodes.arena.listeners.get("mouseup")(LEGAL_POINT);
    assert.equal(result.command.id, commandId);
    assert.equal(result.command.sequence, commandId - 1);
    assert.equal(result.command.spendSequence, commandId - 1);
    const deployment = session.bridge.replay.filter(({ type }) =>
      type === "player-deployed").at(-1);
    entityIds.push(...deployment.deployment.entityIds);
    assert.deepEqual(nodes.hand.map(({ dataset }) => dataset.cardId),
      session.input.deck.state.hand);
    assert.equal(Number(nodes.output.textContent),
      session.input.elixir.state.sides.south.amount);
  };

  assert.equal(session.bridge.rosterBytes, serializeArenaInputCards(session.cards));
  play(1);
  const beforeMountedRestore = session.bridge.bytes;
  assert.throws(() => session.restoreBridge(beforeMountedRestore), /requires input cleanup/u);
  assert.equal(session.bridge.bytes, beforeMountedRestore);
  assert.equal(session.cleanupInput(), true);
  session.remountInput();
  const advanced = session.advance(1);
  assert.equal(advanced.tick, 2);
  assert.equal(session.input.elixir.state.tick, session.bridge.tick);
  play(2);
  assert.equal(session.cleanupInput(), true);
  const restoredBytes = session.bridge.bytes;
  const restoredBridge = session.restoreBridge(restoredBytes);
  assert.equal(Object.isFrozen(restoredBridge), true);
  session.remountInput();
  play(3);
  assert.deepEqual(session.bridge.processedCommandIds, [1, 2, 3]);
  assert.equal(retained.processedCommandIds.length, 0,
    "retained diagnostics never observe later mutations");
  assert.equal(new Set(entityIds).size, entityIds.length);
  assert.equal(session.disposeSession(), true);
  assert.equal(session.disposeSession(), false);
  assert.throws(() => session.remountInput(), /session is disposed/u);
});

test("game player remount: reentrant session advance terminally seals callback failure", () => {
  const nodes = entryRoot();
  const supplied = authoritativeSystems();
  const session = mountArenaShellWithHud(nodes.root,
    createArenaSessionInjectionCapability(supplied.bridge));
  const hand = session.input.deck.state.hand;
  const cards = new Map(session.cards.map((card) => [card.id, card]));
  const cardId = [...hand].sort((left, right) =>
    cards.get(left).cost - cards.get(right).cost)[0];
  const slot = hand.indexOf(cardId);
  nodes.hand[slot].listeners.get("click")({ currentTarget: nodes.hand[slot] });
  let setterCalls = 0;
  Object.defineProperty(nodes.output, "textContent", {
    configurable: true,
    get() { return "10"; },
    set() {
      setterCalls += 1;
      session.advance(1);
    },
  });
  assert.throws(() => nodes.arena.listeners.get("mouseup")(LEGAL_POINT),
    /state committed but projection failed/u);
  assert.ok(setterCalls > 0);
  assert.equal(session.status, "faulted");
  assert.equal(session.bridge.processedCommandIds.length, 1);
  assert.throws(() => session.advance(1), /terminally faulted/u);
  assert.throws(() => session.cleanupInput(), /terminally faulted/u);
  assert.equal(session.disposeSession(), true);
  assert.equal(session.status, "disposed");
});

test("game player remount: session injection admission is fieldless, trap-zero, and single-use", () => {
  let traps = 0;
  const proxy = new Proxy(function hostile() {}, {
    apply() { traps += 1; throw new Error("apply trap"); },
    construct() { traps += 1; throw new Error("construct trap"); },
    defineProperty() { traps += 1; return false; },
    deleteProperty() { traps += 1; return false; },
    get() { traps += 1; return undefined; },
    getOwnPropertyDescriptor() { traps += 1; return undefined; },
    getPrototypeOf() { traps += 1; return Object.prototype; },
    has() { traps += 1; return false; },
    isExtensible() { traps += 1; return true; },
    ownKeys() { traps += 1; return []; },
    preventExtensions() { traps += 1; return false; },
    set() { traps += 1; return false; },
    setPrototypeOf() { traps += 1; return false; },
  });
  assert.throws(() => createArenaSessionInjectionCapability(proxy), /exact bridge/u);
  assert.equal(traps, 0);
  assert.throws(() => mountArenaShellWithHud(entryRoot().root, proxy),
    /capability is invalid/u);
  assert.equal(traps, 0);

  let accessorReads = 0;
  const raw = {};
  Object.defineProperty(raw, "bridge", {
    enumerable: true,
    get() { accessorReads += 1; return authoritativeSystems().bridge; },
  });
  for (const invalid of [raw, null, undefined, false, 0, "", Object.freeze({})]) {
    assert.throws(() => mountArenaShellWithHud(entryRoot().root, invalid),
      /capability is invalid/u);
  }
  assert.equal(accessorReads, 0);

  const source = authoritativeSystems();
  const capability = createArenaSessionInjectionCapability(source.bridge);
  assert.equal(Object.getPrototypeOf(capability), null);
  assert.equal(Reflect.ownKeys(capability).length, 0);
  assert.equal(Object.isFrozen(capability), true);
  source.bridge.stepMany(1);
  const mounted = mountArenaShellWithHud(entryRoot().root, capability);
  assert.equal(mounted.bridge.tick, 0, "factory captured canonical bytes by value");
  assert.throws(() => mountArenaShellWithHud(entryRoot().root, capability), /consumed/u);
  mounted.disposeSession();

  const failed = createArenaSessionInjectionCapability(authoritativeSystems().bridge);
  assert.throws(() => mountArenaShellWithHud(null, failed), /target/u);
  assert.throws(() => mountArenaShellWithHud(entryRoot().root, failed), /consumed/u);
  assert.throws(() => mountArenaShellWithHud(entryRoot().root,
    Object.freeze(Object.create(null))), /capability is invalid/u);
});

test("game player remount: authoritative full catalog rejects every identity forgery", () => {
  const { bridge, cards } = authoritativeSystems();
  const commit = () => {};
  const update = () => {};
  const forgeries = [
    cards.map((card, index) => index === 0
      ? { ...card, displayName: `${card.displayName} forged` } : card),
    cards.map((card, index) => index === 0
      ? { ...card, cost: card.cost + 1 } : card),
    cards.map((card, index) => index === 0
      ? { ...card, id: `${card.id}-forged` } : card),
    [cards[1], cards[0], ...cards.slice(2)],
  ];
  for (const forged of forgeries) {
    const token = tokenFor(cards, bridge, commit, update, {
      cardsText: serializeArenaInputCards(forged),
    });
    assert.throws(() => mountArenaInputController(browserShell().shell, token),
      /controller construction failed/u);
  }
  for (const forged of [cards.slice(0, -1), [...cards, cards[0]]]) {
    assert.throws(() => serializeArenaInputCards(forged), /exactly eight/u);
  }
});

test("game player remount: stale, mismatched and concurrent tokens cannot fork history", () => {
  const { bridge, cards } = authoritativeSystems();
  const originalDeck = bridge.deckBytes;
  const originalElixir = bridge.elixirBytes;
  const commit = () => {};
  const update = () => {};
  const firstNodes = browserShell();
  const first = mountArenaInputController(firstNodes.shell,
    tokenFor(cards, bridge, commit, update));
  first.setFeedback({ onPlace() {}, onSelect() {} });
  assert.equal(playCheapest(first, firstNodes, cards, 1, []).accepted, true);
  first.cleanup();

  for (const overrides of [
    { deckBytes: originalDeck },
    { elixirBytes: originalElixir },
    { cardsText: serializeArenaInputCards(cards.map((card, index) =>
      index === 0 ? { ...card, cost: card.cost + 1 } : card)) },
  ]) {
    const stale = tokenFor(cards, bridge, commit, update, overrides);
    assert.throws(() => mountArenaInputController(browserShell().shell, stale),
      /controller construction failed/u);
    assert.throws(() => mountArenaInputController(browserShell().shell, stale), /consumed/u);
  }

  const leftToken = first.createContinuationCapability();
  const rightToken = first.createContinuationCapability();
  const nodes = browserShell();
  const left = mountArenaInputController(nodes.shell, leftToken);
  assert.throws(() => mountArenaInputController(browserShell().shell, rightToken),
    /authority is already mounted/u);
  assert.throws(() => mountArenaInputController(browserShell().shell, rightToken), /consumed/u);
  assert.equal(playCheapest(left, nodes, cards, 2, []).command.id, 2);
  assert.equal(left.input.commands.length, 2);
  assert.equal(left.cleanup(), true);
  assert.deepEqual(bridge.state.processedCommandIds, [1, 2]);

  const forged = JSON.parse(bridge.serialize());
  forged.history.push(structuredClone(forged.history.find(({ type }) =>
    type === "play")));
  assert.throws(() => PlayerDeployBridge.restore(canonical(forged)),
    /history|command|causal/u);
});

test("game player remount: terminal callback fault, direct dispose, and legacy scope are exact", () => {
  const { bridge, cards } = authoritativeSystems();
  let fail = true;
  const commit = () => {
    if (fail) { fail = false; throw new Error("projection failure"); }
  };
  const update = () => {};
  const nodes = browserShell();
  const mounted = mountArenaInputController(nodes.shell,
    tokenFor(cards, bridge, commit, update));
  nodes.hand[1].dataset.cardId = mounted.input.deck.state.hand[1];
  nodes.hand[1].listeners.get("click")({ currentTarget: nodes.hand[1] });
  assert.throws(() => mounted.onMouse(LEGAL_POINT), /state committed but projection failed/u);
  assert.equal(mounted.input.faultCode, "authoritative_projection_failed");
  assert.equal(bridge.state.processedCommandIds.length, 1);
  assert.equal(mounted.cleanup(), true);

  const nextNodes = browserShell();
  const next = mountArenaInputController(nextNodes.shell,
    mounted.createContinuationCapability());
  assert.equal(playCheapest(next, nextNodes, cards, 2, []).command.id, 2);
  assert.equal(next.input.dispose(), true);
  assert.equal(next.cleanup(), true);
  const resumed = mountArenaInputController(browserShell().shell,
    next.createContinuationCapability());
  assert.equal(resumed.input.commands.length, 2);
  assert.equal(resumed.cleanup(), true);

  const initial = createInitialArenaHudSystems();
  const legacy = mountArenaInputController(browserShell().shell,
    createArenaInputHudCapability(
      serializeArenaInputCards(initial.cards),
      initial.deck.serializeJson(),
      initial.elixir.serialize(),
      () => {},
      () => {},
    ));
  assert.equal(legacy.cleanup(), true);
  assert.throws(() => legacy.createContinuationCapability(), /legacy.*cursor/u);
});
