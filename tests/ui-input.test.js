import assert from "node:assert/strict";
import test from "node:test";

import {
  createInitialArenaHudSystems,
} from "../src/ui/arena-shell-entry.js";
import {
  ArenaInputController,
  clientPointToArenaPoint,
  consumeArenaInputFeedbackReceipt,
  createArenaInputBridgeWitness,
  createArenaInputHudCapability,
  mountArenaInputController,
  serializeArenaInputCards,
} from "../src/ui/input-controller.js";
import { PlayerDeployBridge } from "../src/sim/game-player-deploy.js";
import { LiveBattle, parseLiveBattleSetup } from "../src/sim/live-battle.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
} from "../src/content/playable-roster.js";

const RECT = Object.freeze({
  height: 960,
  left: 90,
  top: 108,
  width: 540,
});
const LEGAL_CLIENT_POINT = Object.freeze({
  clientX: 270,
  clientY: 708,
});
const ILLEGAL_CLIENT_POINT = Object.freeze({
  clientX: 360,
  clientY: 588,
});

function systems() {
  const initial = createInitialArenaHudSystems();
  return {
    cards: initial.cards,
    commitSystems() {},
    deck: initial.deck,
    elixir: initial.elixir,
    hudUpdate() {},
  };
}

function controller() {
  return new ArenaInputController(systems());
}

function hudCapability(hud) {
  return createArenaInputHudCapability(
    serializeArenaInputCards(hud.cards),
    deckBytes(hud.deck),
    elixirBytes(hud.elixir),
    hud.replaceInteractionSystems ?? hud.commitSystems,
    hud.update ?? hud.hudUpdate,
    hud.deployBridge === undefined || hud.deployBridge === null
      ? null
      : createArenaInputBridgeWitness(hud.deployBridge),
  );
}

function deckBytes(deck) {
  return deck.bytes ?? deck.serializeJson();
}

function elixirBytes(elixir) {
  return elixir.bytes ?? elixir.serialize();
}

function stateBytes(input) {
  return JSON.stringify({
    commands: input.commands,
    deck: input.deck.bytes,
    elixir: input.elixir.bytes,
    replay: input.replay,
    selectedCardId: input.selectedCardId,
  });
}

test("ui input: viewport coordinates map exactly to integer arena millitiles", () => {
  assert.deepEqual(
    clientPointToArenaPoint(RECT, { clientX: 90, clientY: 1068 }),
    { x: 0, y: 0 },
  );
  assert.deepEqual(
    clientPointToArenaPoint(RECT, { clientX: 630, clientY: 108 }),
    { x: 18_000, y: 32_000 },
  );
  assert.deepEqual(
    clientPointToArenaPoint(RECT, { clientX: 360, clientY: 588 }),
    { x: 9_000, y: 16_000 },
  );
  assert.deepEqual(
    clientPointToArenaPoint(RECT, LEGAL_CLIENT_POINT),
    { x: 6_000, y: 12_000 },
  );
  assert.equal(
    clientPointToArenaPoint(RECT, { clientX: 89.999, clientY: 588 }),
    null,
  );
});

test("ui input: each hand card selects and a repeated selection cancels", () => {
  const source = systems();
  const input = new ArenaInputController(source);
  assert.deepEqual(
    source.deck.state.hand,
    ["mossguard", "cinderlings", "briar-band", "reedsting"],
  );
  for (const cardId of source.deck.state.hand) {
    assert.equal(input.select(cardId).accepted, true);
    assert.equal(input.selectedCardId, cardId);
    assert.equal(input.select(cardId).type, "cancel");
    assert.equal(input.selectedCardId, null);
  }
  assert.equal(input.replay.length, 8);
});

test("ui input: legal ground play schedules deck, elixir, and stable deploy command", () => {
  const source = systems();
  const input = new ArenaInputController(source);
  const beforeHand = source.deck.state.hand;
  assert.equal(input.select("cinderlings").accepted, true);
  const result = input.placeClientPoint(RECT, LEGAL_CLIENT_POINT);
  assert.equal(result.accepted, true);
  assert.deepEqual(result.command, {
    cardId: "cinderlings",
    cost: 1,
    id: 1,
    point: { x: 6_000, y: 12_000 },
    sequence: 0,
    side: "south",
    spendSequence: 0,
    tick: 0,
    type: "deploy",
  });
  assert.equal(input.selectedCardId, null);
  assert.notDeepEqual(input.deck.state.hand, beforeHand);
  assert.deepEqual(
    JSON.parse(input.elixir.bytes).commands,
    [{ cost: 1, side: "south", tick: 0 }],
  );
});

test("ui input: illegal river, client bounds, and no-selection plays are atomic", () => {
  const source = systems();
  const input = new ArenaInputController(source);
  input.select("mossguard");
  const before = stateBytes(input);
  assert.deepEqual(input.placeClientPoint(RECT, ILLEGAL_CLIENT_POINT), {
    accepted: false,
    confidence: "high",
    point: { x: 9_000, y: 16_000 },
    reason: "river_excluded",
    type: "place",
  });
  assert.equal(stateBytes(input), before);
  assert.equal(
    input.placeClientPoint(RECT, { clientX: 0, clientY: 0 }).reason,
    "outside_client_bounds",
  );
  assert.equal(stateBytes(input), before);
  input.cancel();
  const emptyBefore = stateBytes(input);
  assert.equal(
    input.placeClientPoint(RECT, LEGAL_CLIENT_POINT).reason,
    "nothing_selected",
  );
  assert.equal(stateBytes(input), emptyBefore);
});

test("ui input: same-tick reservations prevent overspending atomically", () => {
  const source = systems();
  const input = new ArenaInputController(source);
  input.select("cinderlings");
  assert.equal(input.placeClientPoint(RECT, LEGAL_CLIENT_POINT).accepted, true);
  assert.equal(input.select("mossguard").accepted, true);
  const before = stateBytes(input);
  const rejected = input.placeClientPoint(RECT, LEGAL_CLIENT_POINT);
  assert.equal(rejected.accepted, true);
  assert.equal(input.commands.length, 2);
  assert.equal(input.select("reedsting").accepted, false);
  assert.equal(input.select("reedsting").reason, "insufficient_elixir");
  assert.notEqual(stateBytes(input), before);
});

test("ui input: mouse and touch coordinates produce byte-identical commands", () => {
  const leftSource = systems();
  const rightSource = systems();
  const left = new ArenaInputController(leftSource);
  const right = new ArenaInputController(rightSource);
  left.select("cinderlings");
  right.select("cinderlings");
  const mouse = left.placeClientPoint(RECT, LEGAL_CLIENT_POINT);
  const touch = right.placeClientPoint(RECT, {
    clientX: LEGAL_CLIENT_POINT.clientX,
    clientY: LEGAL_CLIENT_POINT.clientY,
  });
  assert.deepEqual(mouse, touch);
  assert.equal(left.serialize(), right.serialize());
});

test("ui input: downstream HUD failure leaves every canonical byte unchanged", () => {
  const source = systems();
  source.hudUpdate = (selectedCardId, projected) => {
    if (projected !== undefined) throw new Error("hostile HUD setter");
  };
  const input = new ArenaInputController(source);
  input.select("cinderlings");
  const before = input.serialize();
  assert.throws(
    () => input.placeClientPoint(RECT, LEGAL_CLIENT_POINT),
    /hostile HUD setter/u,
  );
  assert.equal(input.serialize(), before);
  assert.equal(input.selectedCardId, "cinderlings");
  assert.deepEqual(input.commands, []);
});

test("ui input: throwing system commit restores visible HUD and every canonical byte", () => {
  const source = systems();
  let external = { deck: source.deck, elixir: source.elixir };
  let throwOnce = true;
  let visible = null;
  source.hudUpdate = (selectedCardId, projected = external) => {
    visible = JSON.stringify({
      amount: projected.elixir.state.sides.south.amount,
      deck: projected.deck.state,
      selectedCardId,
    });
  };
  source.commitSystems = (next) => {
    external = next;
    if (throwOnce) {
      throwOnce = false;
      throw new Error("commit probe");
    }
  };
  const input = new ArenaInputController(source);
  input.select("cinderlings");
  const beforeController = input.serialize();
  const beforeDeck = deckBytes(external.deck);
  const beforeElixir = elixirBytes(external.elixir);
  const beforeVisible = visible;
  assert.throws(
    () => input.placeClientPoint(RECT, LEGAL_CLIENT_POINT),
    /commit probe/u,
  );
  assert.equal(input.serialize(), beforeController);
  assert.equal(deckBytes(external.deck), beforeDeck);
  assert.equal(elixirBytes(external.elixir), beforeElixir);
  assert.equal(visible, beforeVisible);
  assert.equal(input.selectedCardId, "cinderlings");
  assert.deepEqual(input.commands, []);

  const accepted = input.placeClientPoint(RECT, LEGAL_CLIENT_POINT);
  assert.equal(accepted.accepted, true);
  assert.equal(deckBytes(external.deck), input.deck.bytes);
  assert.equal(elixirBytes(external.elixir), input.elixir.bytes);
  assert.equal(input.selectedCardId, null);
});

test("ui input: failed compensation poisons every continuation before hooks run", () => {
  const source = systems();
  let commitCalls = 0;
  let hudCalls = 0;
  let external = { deck: source.deck, elixir: source.elixir };
  source.hudUpdate = () => {
    hudCalls += 1;
  };
  source.commitSystems = (next) => {
    commitCalls += 1;
    if (commitCalls === 1) {
      external = next;
      throw new Error("candidate install failed");
    }
    throw new Error("rollback failed before install");
  };
  const input = new ArenaInputController(source);
  input.select("cinderlings");
  assert.throws(
    () => input.placeClientPoint(RECT, LEGAL_CLIENT_POINT),
    (error) => (
      error instanceof AggregateError &&
      error.message === "arena input commit failed and could not be fully rolled back"
    ),
  );
  assert.equal(input.faultCode, "commit_rollback_failed");
  assert.notEqual(deckBytes(external.deck), input.deck.bytes);
  assert.equal(input.selectedCardId, "cinderlings");
  assert.deepEqual(input.commands, []);
  const hooksAfterFault = { commitCalls, hudCalls };

  let hostileReads = 0;
  const hostilePoint = {};
  Object.defineProperties(hostilePoint, {
    clientX: {
      enumerable: true,
      get() {
        hostileReads += 1;
        return 270;
      },
    },
    clientY: {
      enumerable: true,
      get() {
        hostileReads += 1;
        return 708;
      },
    },
  });
  for (const continuation of [
    () => input.select("mossguard"),
    () => input.cancel(),
    () => input.placeArenaPoint({ x: 6_000, y: 12_000 }),
    () => input.placeClientPoint(RECT, hostilePoint),
    () => input.serialize(),
  ]) {
    assert.throws(
      continuation,
      (error) => (
        error.message === "arena input is poisoned: commit_rollback_failed"
      ),
    );
  }
  assert.equal(hostileReads, 0);
  assert.deepEqual({ commitCalls, hudCalls }, hooksAfterFault);
  assert.equal(input.selectedCardId, "cinderlings");
  assert.deepEqual(input.commands, []);
});

test("ui input: causal restore and chunked interactions remain byte-identical", () => {
  const source = systems();
  const input = new ArenaInputController(source);
  input.select("cinderlings");
  input.placeClientPoint(RECT, LEGAL_CLIENT_POINT);
  input.select("mossguard");
  input.cancel();
  const bytes = input.serialize();
  const restored = ArenaInputController.restore(bytes, {
    cards: source.cards,
    hudUpdate() {},
  });
  assert.equal(restored.serialize(), bytes);
  assert.deepEqual(restored.commands, input.commands);
  assert.deepEqual(restored.replay, input.replay);
  restored.select("mossguard");
  input.select("mossguard");
  assert.equal(restored.serialize(), input.serialize());
});

class Node {
  constructor() {
    this.dataset = {};
    this.listeners = new Map();
    this.lookups = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  querySelectorAll(selector) {
    const value = this.lookups.get(selector);
    return Array.isArray(value) ? value : value === undefined ? [] : [value];
  }
}

function browserShell({
  borderRect = RECT,
  clientHeight = RECT.height,
  clientLeft = 0,
  clientTop = 0,
  clientWidth = RECT.width,
} = {}) {
  const shell = new Node();
  const arena = new Node();
  arena.clientHeight = clientHeight;
  arena.clientLeft = clientLeft;
  arena.clientTop = clientTop;
  arena.clientWidth = clientWidth;
  let rectReads = 0;
  arena.getBoundingClientRect = () => {
    rectReads += 1;
    return borderRect;
  };
  const hand = ["mossguard", "cinderlings", "briar-band", "reedsting"]
    .map((cardId) => {
      const node = new Node();
      node.dataset.cardId = cardId;
      return node;
    });
  shell.lookups.set('[data-ui="arena"]', arena);
  shell.lookups.set('[data-ui="card-slot"]', hand);
  return { arena, hand, rectReads: () => rectReads, shell };
}

test("ui input: browser seam binds one arena and four unique hand slots", () => {
  const source = systems();
  const nodes = browserShell();
  let updates = 0;
  const mounted = mountArenaInputController(nodes.shell, hudCapability({
    ...source,
    replaceInteractionSystems() {},
    update() {
      updates += 1;
    },
  }));
  nodes.hand[1].listeners.get("click")({ currentTarget: nodes.hand[1] });
  assert.equal(mounted.input.selectedCardId, "cinderlings");
  const result = mounted.onPointer(LEGAL_CLIENT_POINT);
  assert.equal(result.accepted, true);
  assert.equal(updates, 2);
  assert.equal(nodes.rectReads(), 1);

  const touchNodes = browserShell();
  const touchMounted = mountArenaInputController(touchNodes.shell, hudCapability({
    ...systems(),
    replaceInteractionSystems() {},
    update() {},
  }));
  touchNodes.hand[1].listeners.get("click")({
    currentTarget: touchNodes.hand[1],
  });
  const touch = touchMounted.onTouch({
    changedTouches: [LEGAL_CLIENT_POINT],
  });
  assert.deepEqual(touch.command, result.command);
});

test("ui input: HUD admission is an opaque zero-execution mount capability", () => {
  const fields = [
    "cards", "deck", "elixir", "replaceInteractionSystems", "update", "deployBridge",
  ];
  for (const field of fields) {
    const nodes = browserShell();
    let reads = 0;
    const raw = {};
    Object.defineProperty(raw, field, {
      enumerable: true,
      get() { reads += 1; throw new Error(field); },
    });
    assert.throws(() => mountArenaInputController(nodes.shell, raw), /capability is invalid/u);
    assert.equal(reads, 0, field);
    assert.equal([...nodes.hand, nodes.arena]
      .every(({ listeners }) => listeners.size === 0), true, field);
  }
  let traps = 0;
  const proxy = new Proxy({}, {
    get() { traps += 1; return undefined; },
    getOwnPropertyDescriptor() { traps += 1; return undefined; },
    getPrototypeOf() { traps += 1; return Object.prototype; },
    has() { traps += 1; return false; },
    ownKeys() { traps += 1; return []; },
    set() { traps += 1; return false; },
  });
  assert.throws(() => mountArenaInputController(browserShell().shell, proxy),
    /capability is invalid/u);
  assert.equal(traps, 0);
  for (const invalid of [null, undefined, false, 0, "", Object.freeze(Object.create(null))]) {
    assert.throws(() => mountArenaInputController(browserShell().shell, invalid),
      /capability is invalid/u);
  }

  const source = systems();
  const cardsText = serializeArenaInputCards(source.cards);
  const deckText = source.deck.serializeJson();
  const elixirText = source.elixir.serialize();
  for (const position of [0, 1, 2]) {
    let dataTraps = 0;
    const dataProxy = new Proxy({}, {
      get() { dataTraps += 1; return undefined; },
      getOwnPropertyDescriptor() { dataTraps += 1; return undefined; },
      getPrototypeOf() { dataTraps += 1; return Object.prototype; },
      ownKeys() { dataTraps += 1; return []; },
    });
    const values = [cardsText, deckText, elixirText];
    values[position] = dataProxy;
    assert.throws(() => createArenaInputHudCapability(
      values[0], values[1], values[2], () => {}, () => {},
    ), /canonical strings/u);
    assert.equal(dataTraps, 0, `data position ${position}`);
  }
  let witnessTraps = 0;
  const witnessProxy = new Proxy({}, {
    get() { witnessTraps += 1; return undefined; },
    getOwnPropertyDescriptor() { witnessTraps += 1; return undefined; },
    getPrototypeOf() { witnessTraps += 1; return PlayerDeployBridge.prototype; },
    ownKeys() { witnessTraps += 1; return []; },
  });
  assert.throws(() => createArenaInputHudCapability(
    cardsText, deckText, elixirText, () => {}, () => {}, witnessProxy,
  ), /bridge witness is invalid/u);
  assert.equal(witnessTraps, 0);
  assert.throws(() => createArenaInputBridgeWitness(
    Object.create(PlayerDeployBridge.prototype)), /exact bridge/u);

  let callbackCalls = 0;
  const capability = createArenaInputHudCapability(
    cardsText,
    deckText,
    elixirText,
    () => { callbackCalls += 1; },
    () => { callbackCalls += 1; },
  );
  assert.equal(Object.getPrototypeOf(capability), null);
  assert.equal(Reflect.ownKeys(capability).length, 0);
  assert.equal(Object.isFrozen(capability), true);
  const gestureNodes = browserShell();
  const first = mountArenaInputController(gestureNodes.shell, capability);
  assert.equal(callbackCalls, 0, "admission does not invoke callbacks");
  assert.throws(() => mountArenaInputController(browserShell().shell, capability),
    /consumed/u);
  gestureNodes.hand[1].listeners.get("click")({ currentTarget: gestureNodes.hand[1] });
  assert.equal(first.onPointer(LEGAL_CLIENT_POINT).accepted, true);
  assert.equal(first.input.commands.length, 1);
  assert.ok(callbackCalls > 0, "callbacks begin only in the interaction phase");
  assert.equal(first.cleanup(), true);
  assert.throws(() => mountArenaInputController(browserShell().shell, capability),
    /consumed/u);
  assert.equal(first.input.commands.length, 1, "consumed token cannot rewind authority");

  const failureCommit = () => {};
  const failureUpdate = () => {};
  const shellFailureCapability = createArenaInputHudCapability(
    cardsText, deckText, elixirText, failureCommit, failureUpdate,
  );
  let shellTraps = 0;
  const hostileShell = new Proxy({}, {
    get() { shellTraps += 1; return undefined; },
    getOwnPropertyDescriptor() { shellTraps += 1; return undefined; },
    getPrototypeOf() { shellTraps += 1; return Object.prototype; },
    ownKeys() { shellTraps += 1; return []; },
  });
  assert.throws(() => mountArenaInputController(hostileShell, shellFailureCapability),
    /shell validation failed/u);
  assert.ok(shellTraps > 0, "first valid-token attempt reaches shell only after consumption");
  let retryShellTraps = 0;
  const retryShell = new Proxy({}, {
    get() { retryShellTraps += 1; return undefined; },
    getOwnPropertyDescriptor() { retryShellTraps += 1; return undefined; },
    getPrototypeOf() { retryShellTraps += 1; return Object.prototype; },
    ownKeys() { retryShellTraps += 1; return []; },
  });
  assert.throws(() => mountArenaInputController(retryShell, shellFailureCapability),
    /consumed/u);
  assert.equal(retryShellTraps, 0, "consumed token rejects before shell access");
  const postFailureCapability = createArenaInputHudCapability(
    cardsText, deckText, elixirText, failureCommit, failureUpdate,
  );
  const postFailureMount = mountArenaInputController(browserShell().shell,
    postFailureCapability);
  assert.equal(postFailureMount.cleanup(), true, "shell failure releases sink authority");

  let callbackApplies = 0;
  const callableProxy = new Proxy(function callback() {}, {
    apply() { callbackApplies += 1; return undefined; },
    get() { throw new Error("callback property read"); },
    getPrototypeOf() { throw new Error("callback prototype read"); },
  });
  const callbackCapability = createArenaInputHudCapability(
    cardsText, deckText, elixirText, callableProxy, callableProxy,
  );
  const callbackNodes = browserShell();
  const callbackMount = mountArenaInputController(callbackNodes.shell, callbackCapability);
  assert.equal(callbackApplies, 0);
  callbackNodes.hand[1].listeners.get("click")({ currentTarget: callbackNodes.hand[1] });
  assert.equal(callbackApplies, 1, "callable proxy runs only in the documented HUD phase");
  assert.equal(callbackMount.cleanup(), true);

  let published = { deck: source.deck, elixir: source.elixir };
  let publications = 0;
  let updates = 0;
  const commitSink = (next) => { publications += 1; published = next; };
  const updateSink = () => { updates += 1; };
  const firstSinkToken = createArenaInputHudCapability(
    cardsText, deckText, elixirText, commitSink, updateSink,
  );
  const duplicateSinkToken = createArenaInputHudCapability(
    cardsText, deckText, elixirText, commitSink, updateSink,
  );
  const sinkNodes = browserShell();
  const sinkMount = mountArenaInputController(sinkNodes.shell, firstSinkToken);
  let conflictShellTraps = 0;
  const conflictShell = new Proxy({}, {
    get() { conflictShellTraps += 1; return undefined; },
    getPrototypeOf() { conflictShellTraps += 1; return Object.prototype; },
    ownKeys() { conflictShellTraps += 1; return []; },
  });
  assert.throws(() => mountArenaInputController(conflictShell, duplicateSinkToken),
    /authority is already mounted/u);
  assert.equal(conflictShellTraps, 0, "sink conflict rejects before shell access");
  sinkNodes.hand[1].listeners.get("click")({ currentTarget: sinkNodes.hand[1] });
  assert.equal(sinkMount.onPointer(LEGAL_CLIENT_POINT).accepted, true);
  assert.equal(publications, 1);
  assert.equal(updates, 2);
  assert.equal(sinkMount.input.commands.length, 1);
  assert.equal(sinkMount.cleanup(), true);
  const sequentialSinkToken = createArenaInputHudCapability(
    cardsText, published.deck.bytes, published.elixir.bytes, commitSink, updateSink,
  );
  const sequentialSinkMount = mountArenaInputController(browserShell().shell,
    sequentialSinkToken);
  assert.equal(sequentialSinkMount.input.commands.length, 0);
  assert.equal(sequentialSinkMount.cleanup(), true);

  const distinctLeft = createArenaInputHudCapability(
    cardsText, deckText, elixirText, () => {}, () => {},
  );
  const distinctRight = createArenaInputHudCapability(
    cardsText, deckText, elixirText, () => {}, () => {},
  );
  const distinctLeftMount = mountArenaInputController(browserShell().shell, distinctLeft);
  const distinctRightMount = mountArenaInputController(browserShell().shell, distinctRight);
  assert.equal(distinctLeftMount.cleanup(), true);
  assert.equal(distinctRightMount.cleanup(), true);

  const directCommit = () => {};
  const directUpdate = () => {};
  const directlyDisposed = mountArenaInputController(browserShell().shell,
    createArenaInputHudCapability(
      cardsText, deckText, elixirText, directCommit, directUpdate,
    ));
  assert.equal(directlyDisposed.input.dispose(), true);
  const afterDirectDispose = mountArenaInputController(browserShell().shell,
    createArenaInputHudCapability(
      cardsText, deckText, elixirText, directCommit, directUpdate,
    ));
  assert.equal(directlyDisposed.cleanup(), true);
  assert.equal(afterDirectDispose.cleanup(), true);
});

test("ui input: browser seam maps the inner client box and rejects border pixels", () => {
  const nodes = browserShell({
    borderRect: { height: 968, left: 86, top: 104, width: 548 },
    clientHeight: 960,
    clientLeft: 4,
    clientTop: 4,
    clientWidth: 540,
  });
  const mounted = mountArenaInputController(nodes.shell, hudCapability({
    ...systems(),
    replaceInteractionSystems() {},
    update() {},
  }));
  nodes.hand[1].listeners.get("click")({ currentTarget: nodes.hand[1] });
  const leftBorder = mounted.onPointer({ clientX: 89, clientY: 708 });
  assert.equal(leftBorder.reason, "outside_client_bounds");
  assert.equal(mounted.input.selectedCardId, "cinderlings");
  assert.deepEqual(
    clientPointToArenaPoint(
      { height: 960, left: 90, top: 108, width: 540 },
      { clientX: 90, clientY: 1068 },
    ),
    { x: 0, y: 0 },
  );
  assert.deepEqual(
    clientPointToArenaPoint(
      { height: 960, left: 90, top: 108, width: 540 },
      { clientX: 630, clientY: 108 },
    ),
    { x: 18_000, y: 32_000 },
  );
  const accepted = mounted.onPointer(LEGAL_CLIENT_POINT);
  assert.equal(accepted.accepted, true);
  assert.deepEqual(accepted.command.point, { x: 6_000, y: 12_000 });
  assert.equal(nodes.rectReads(), 2);

  for (const invalid of [
    { clientLeft: NaN },
    { clientTop: -1 },
    { clientWidth: 549 },
    { clientHeight: 969 },
    { clientWidth: 0 },
  ]) {
    const hostile = browserShell({
      borderRect: { height: 968, left: 86, top: 104, width: 548 },
      clientHeight: 960,
      clientLeft: 4,
      clientTop: 4,
      clientWidth: 540,
      ...invalid,
    });
    const bound = mountArenaInputController(hostile.shell, hudCapability({
      ...systems(),
      replaceInteractionSystems() {},
      update() {},
    }));
    assert.throws(
      () => bound.onPointer(LEGAL_CLIENT_POINT),
      /client metric|exceed/u,
    );
  }
});

test("ui input: authoritative bridge receives one legacy touch and suppresses compatibility mouse", () => {
  const initial = createInitialArenaHudSystems();
  const roster = createPlayableRoster();
  const canonical = (value) => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  };
  const setup = parseLiveBattleSetup(canonical({
    initialWindupTicks: { central: 0, lane: 0 },
    questions: createPlayableRosterQuestionRecords(),
    roster,
  }));
  const bridge = new PlayerDeployBridge({
    battle: new LiveBattle(setup),
    cards: roster.map(({ cost, id }) => ({ cost, id })),
    deck: initial.deck,
    elixir: initial.elixir,
  });
  const nodes = browserShell();
  const bridgeWitness = createArenaInputBridgeWitness(bridge);
  const authoritativeCapability = createArenaInputHudCapability(
    serializeArenaInputCards(initial.cards),
    initial.deck.serializeJson(),
    initial.elixir.serialize(),
    () => {},
    () => {},
    bridgeWitness,
  );
  assert.throws(() => createArenaInputHudCapability(
    serializeArenaInputCards(initial.cards),
    initial.deck.serializeJson(),
    initial.elixir.serialize(),
    () => {},
    () => {},
    bridgeWitness,
  ), /bridge witness is invalid/u);
  const alternateBridgeCapability = createArenaInputHudCapability(
    serializeArenaInputCards(initial.cards),
    initial.deck.serializeJson(),
    initial.elixir.serialize(),
    function alternateCommit() {},
    function alternateUpdate() {},
    createArenaInputBridgeWitness(bridge),
  );
  const mounted = mountArenaInputController(nodes.shell, authoritativeCapability);
  let alternateShellTraps = 0;
  const alternateShell = new Proxy({}, {
    get() { alternateShellTraps += 1; return undefined; },
    getPrototypeOf() { alternateShellTraps += 1; return Object.prototype; },
    ownKeys() { alternateShellTraps += 1; return []; },
  });
  assert.throws(() => mountArenaInputController(alternateShell,
    alternateBridgeCapability), /authority is already mounted/u);
  assert.equal(alternateShellTraps, 0);
  const receipts = [];
  const reentrantErrors = [];
  mounted.setFeedback({
    onPlace(value) {
      receipts.push(value);
      try { mounted.input.select(mounted.input.deck.state.hand[0]); } catch (error) {
        reentrantErrors.push(error);
      }
    },
    onSelect() {},
  });
  nodes.hand[1].listeners.get("click")({ currentTarget: nodes.hand[1] });
  const touch = mounted.onTouch({ changedTouches: [LEGAL_CLIENT_POINT] });
  assert.equal(touch.accepted, true);
  assert.equal(bridge.replay.length, 1);
  assert.equal(receipts.length, 1);
  assert.equal(reentrantErrors.length, 1);
  assert.match(reentrantErrors[0].message, /reentrant feedback delivery/u);
  assert.equal(consumeArenaInputFeedbackReceipt(receipts[0]).result.accepted, true);
  const bytes = bridge.serialize();
  assert.throws(() => consumeArenaInputFeedbackReceipt(receipts[0]), /consumed/u);
  assert.equal(bridge.serialize(), bytes);
  const mouse = mounted.onMouse(LEGAL_CLIENT_POINT);
  assert.equal(mouse.reason, "compatibility_mouse_suppressed");
  assert.equal(bridge.serialize(), bytes);
  assert.equal(mounted.input.deck.bytes, bridge.deckBytes);
  assert.equal(mounted.input.elixir.bytes, bridge.elixirBytes);
  assert.equal(mounted.cleanup(), true);
  const committedBytes = bridge.serialize();
  assert.throws(() => mountArenaInputController(browserShell().shell,
    authoritativeCapability), /consumed/u);
  assert.equal(bridge.serialize(), committedBytes);
});

test("ui input: mount cleanup releases authority for exact recreation", () => {
  const initial = createInitialArenaHudSystems();
  const nodes = browserShell();
  let projected = { deck: initial.deck, elixir: initial.elixir };
  const hud = {
    cards: initial.cards,
    get deck() { return projected.deck; },
    get elixir() { return projected.elixir; },
    replaceInteractionSystems(next) { projected = next; },
    update() {},
  };
  const first = mountArenaInputController(nodes.shell, hudCapability(hud));
  nodes.hand[1].listeners.get("click")({ currentTarget: nodes.hand[1] });
  assert.equal(first.onPointer(LEGAL_CLIENT_POINT).accepted, true);
  assert.equal(Object.isFrozen(projected.deck.state), true);
  assert.equal(first.cleanup(), true);
  assert.equal(first.cleanup(), false);
  const second = mountArenaInputController(nodes.shell, hudCapability(hud));
  nodes.hand[0].listeners.get("click")({ currentTarget: nodes.hand[0] });
  assert.equal(second.input.selectedCardId, projected.deck.state.hand[0]);
  assert.equal(second.cleanup(), true);
});

test("ui input: mount registration and removal failures unwind every claim and listener", () => {
  for (let failAt = 0; failAt < 6; failAt += 1) {
    const source = systems();
    const hud = {
      cards: source.cards,
      deck: source.deck,
      elixir: source.elixir,
      replaceInteractionSystems: source.commitSystems,
      update: source.hudUpdate,
    };
    const nodes = browserShell();
    const allNodes = [...nodes.hand, nodes.arena];
    let addIndex = 0;
    for (const node of allNodes) {
      const add = node.addEventListener.bind(node);
      node.addEventListener = (type, listener) => {
        const index = addIndex;
        addIndex += 1;
        add(type, listener);
        if (index === failAt) throw new Error(`add ${index}`);
      };
    }
    let failure;
    const failedCapability = hudCapability(hud);
    try { mountArenaInputController(nodes.shell, failedCapability); } catch (error) {
      failure = error;
    }
    assert.ok(failure instanceof AggregateError, `add ${failAt}`);
    assert.equal(Object.isFrozen(failure), true, `aggregate ${failAt}`);
    assert.equal(Object.isFrozen(failure.errors), true, `errors ${failAt}`);
    assert.equal(allNodes.every(({ listeners }) => listeners.size === 0), true,
      `listener residue ${failAt}`);
    assert.throws(() => mountArenaInputController(browserShell().shell, failedCapability),
      /consumed/u, `failed token ${failAt}`);
    for (const node of allNodes) node.addEventListener = Node.prototype.addEventListener;
    const recreated = mountArenaInputController(nodes.shell, hudCapability(hud));
    assert.equal(recreated.cleanup(), true);
  }

  const source = systems();
  const hud = {
    cards: source.cards,
    deck: source.deck,
    elixir: source.elixir,
    replaceInteractionSystems: source.commitSystems,
    update: source.hudUpdate,
  };
  const nodes = browserShell();
  const mounted = mountArenaInputController(nodes.shell, hudCapability(hud));
  const allNodes = [...nodes.hand, nodes.arena];
  let removeIndex = 0;
  for (const node of allNodes) {
    const remove = node.removeEventListener.bind(node);
    node.removeEventListener = (type, listener) => {
      const index = removeIndex;
      removeIndex += 1;
      remove(type, listener);
      if (index === 2) throw new Error("remove 2");
    };
  }
  let cleanupFailure;
  try { mounted.cleanup(); } catch (error) { cleanupFailure = error; }
  assert.ok(cleanupFailure instanceof AggregateError);
  assert.equal(Object.isFrozen(cleanupFailure), true);
  assert.equal(Object.isFrozen(cleanupFailure.errors), true);
  assert.equal(allNodes.every(({ listeners }) => listeners.size === 0), true);
  assert.equal(mounted.cleanup(), false, "failed removal is terminal after all attempts");
  for (const node of allNodes) node.removeEventListener = Node.prototype.removeEventListener;
  const recreated = mountArenaInputController(nodes.shell, hudCapability(hud));
  assert.equal(recreated.cleanup(), true);

  const hudSource = systems();
  const hudNodes = browserShell();
  const validHud = {
    cards: hudSource.cards,
    deck: hudSource.deck,
    elixir: hudSource.elixir,
    replaceInteractionSystems: hudSource.commitSystems,
    update: hudSource.hudUpdate,
  };
  let hudTraps = 0;
  const hostileHud = new Proxy({}, {
    get() { hudTraps += 1; return undefined; },
    getOwnPropertyDescriptor() { hudTraps += 1; return undefined; },
    getPrototypeOf() { hudTraps += 1; return Object.prototype; },
    ownKeys() { hudTraps += 1; return []; },
  });
  assert.throws(() => mountArenaInputController(hudNodes.shell, hostileHud),
    /HUD capability is invalid/u);
  assert.equal(hudTraps, 0);
  assert.equal([...hudNodes.hand, hudNodes.arena]
    .every(({ listeners }) => listeners.size === 0), true);
  const hudRecreated = mountArenaInputController(hudNodes.shell, hudCapability(validHud));
  let feedbackReads = 0;
  const hostileFeedback = { onPlace() {} };
  Object.defineProperty(hostileFeedback, "onSelect", {
    enumerable: true,
    get() { feedbackReads += 1; throw new Error("feedback getter"); },
  });
  assert.throws(() => hudRecreated.setFeedback(hostileFeedback), /invalid/u);
  assert.equal(feedbackReads, 0);
  assert.equal([...hudNodes.hand, hudNodes.arena]
    .every(({ listeners }) => listeners.size === 0), true);
  assert.equal(hudRecreated.cleanup(), false);
  const feedbackRecreated = mountArenaInputController(hudNodes.shell,
    hudCapability(validHud));
  feedbackRecreated.setFeedback({ onPlace() {}, onSelect() {} });
  assert.equal(feedbackRecreated.cleanup(), true);
});

test("ui input: rejected nested touch cannot corrupt later mouse compatibility state", () => {
  const nodes = browserShell();
  const source = systems();
  const mounted = mountArenaInputController(nodes.shell, hudCapability({
    cards: source.cards,
    deck: source.deck,
    elixir: source.elixir,
    replaceInteractionSystems: source.commitSystems,
    update: source.hudUpdate,
  }));
  const nestedPoint = Object.freeze({ clientX: 300, clientY: 708 });
  const nestedErrors = [];
  let deliveries = 0;
  mounted.setFeedback({
    onPlace() {
      deliveries += 1;
      if (deliveries !== 1) return;
      try { mounted.onTouch({ changedTouches: [nestedPoint] }); } catch (error) {
        nestedErrors.push(error);
      }
    },
    onSelect() {},
  });
  nodes.hand[1].listeners.get("click")({ currentTarget: nodes.hand[1] });
  assert.equal(mounted.onTouch({ changedTouches: [LEGAL_CLIENT_POINT] }).accepted, true);
  assert.equal(nestedErrors.length, 1);
  assert.match(nestedErrors[0].message, /reentrant browser mutation/u);
  const mouse = mounted.onMouse(nestedPoint);
  assert.notEqual(mouse.reason, "compatibility_mouse_suppressed");
  assert.equal(mouse.reason, "nothing_selected");
  assert.equal(mounted.input.commands.length, 1);
});

test("ui input: malformed coordinates, events, hooks, and snapshots fail closed", () => {
  let invoked = false;
  const hostile = { clientX: 1, clientY: 2 };
  Object.defineProperty(hostile, "clientX", {
    enumerable: true,
    get() {
      invoked = true;
      return 1;
    },
  });
  assert.throws(() => clientPointToArenaPoint(RECT, hostile), /data property/u);
  assert.equal(invoked, false);
  for (const point of [
    { clientX: NaN, clientY: 2 },
    { clientX: 1, clientY: Infinity },
    { clientX: "1", clientY: 2 },
  ]) {
    assert.throws(() => clientPointToArenaPoint(RECT, point));
  }

  const duplicate = browserShell();
  duplicate.shell.lookups.set(
    '[data-ui="card-slot"]',
    [duplicate.hand[0], duplicate.hand[1], duplicate.hand[2], duplicate.hand[2]],
  );
  assert.throws(
    () => mountArenaInputController(duplicate.shell, hudCapability({
      ...systems(),
      update() {},
    })),
    /shell validation failed/u,
  );

  const input = controller();
  input.select("cinderlings");
  input.placeClientPoint(RECT, LEGAL_CLIENT_POINT);
  const snapshot = JSON.parse(input.serialize());
  for (const mutate of [
    (value) => value.commands[0].cost += 1,
    (value) => value.actions[1].point.x += 1,
    (value) => value.selectedCardId = "forged",
    (value) => value.extra = true,
    (value) => value.version += 1,
  ]) {
    const forged = structuredClone(snapshot);
    mutate(forged);
    assert.throws(() => ArenaInputController.restore(JSON.stringify(forged), {
      cards: systems().cards,
      hudUpdate() {},
    }));
  }
});
