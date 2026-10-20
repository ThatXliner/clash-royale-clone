import assert from "node:assert/strict";
import test from "node:test";

import { createInitialArenaHudSystems } from "../src/ui/arena-shell-entry.js";
import {
  createArenaInputHudCapability,
  mountArenaInputController,
  serializeArenaInputCards,
} from "../src/ui/input-controller.js";
import {
  bindPlacementFeedback,
  mountPlacementFeedback,
  PLACEMENT_FEEDBACK_HISTORY_LIMIT,
  PlacementFeedbackController,
} from "../src/ui/placement-feedback.js";

const BORDER_RECT = Object.freeze({
  height: 968,
  left: 86,
  top: 104,
  width: 548,
});
const LEGAL = Object.freeze({ clientX: 270, clientY: 708 });
const RIVER = Object.freeze({ clientX: 360, clientY: 588 });
const BORDER = Object.freeze({ clientX: 88, clientY: 708 });

function systems() {
  const initial = createInitialArenaHudSystems();
  let external = { deck: initial.deck, elixir: initial.elixir };
  return createArenaInputHudCapability(
    serializeArenaInputCards(initial.cards),
    external.deck.serializeJson(),
    external.elixir.serialize(),
    (next) => { external = next; },
    () => {},
  );
}

class Style {
  values = new Map();

  setProperty(name, value) {
    this.values.set(name, value);
  }
}

class Node {
  attributes = new Map();
  children = [];
  dataset = {};
  listeners = new Map();
  lookups = new Map();
  ownerDocument = null;
  parentNode = null;
  style = new Style();

  addEventListener(type, listener) {
    const values = this.listeners.get(type) ?? [];
    values.push(listener);
    this.listeners.set(type, values);
  }

  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  emit(type, event) {
    let result;
    for (const listener of this.listeners.get(type) ?? []) {
      result = listener(event);
    }
    return result;
  }

  querySelectorAll(selector) {
    const value = this.lookups.get(selector);
    return Array.isArray(value) ? value : value === undefined ? [] : [value];
  }

  remove() {
    if (this.parentNode !== null) {
      this.parentNode.children = this.parentNode.children.filter(
        (child) => child !== this,
      );
      this.parentNode = null;
    }
  }

  removeEventListener(type, listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((value) => value !== listener),
    );
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
}

function browser({ pointer = true } = {}) {
  const document = {
    defaultView: pointer ? { PointerEvent: class PointerEvent {} } : {},
    createElement() {
      const node = new Node();
      node.ownerDocument = document;
      return node;
    },
  };
  const shell = new Node();
  const arena = new Node();
  shell.ownerDocument = document;
  arena.ownerDocument = document;
  arena.clientHeight = 960;
  arena.clientLeft = 4;
  arena.clientTop = 4;
  arena.clientWidth = 540;
  arena.getBoundingClientRect = () => BORDER_RECT;
  const hand = ["mossguard", "cinderlings", "briar-band", "reedsting"]
    .map((cardId) => {
      const node = new Node();
      node.dataset.cardId = cardId;
      node.ownerDocument = document;
      return node;
    });
  shell.lookups.set('[data-ui="arena"]', arena);
  shell.lookups.set('[data-ui="card-slot"]', hand);
  return { arena, hand, shell };
}

function mountedBrowser() {
  const nodes = browser();
  const input = mountArenaInputController(nodes.shell, systems());
  const feedback = mountPlacementFeedback(nodes.shell, input);
  return { ...nodes, feedback, input };
}

function receiptBrowser() {
  const nodes = browser();
  const input = mountArenaInputController(nodes.shell, systems());
  const receipts = [];
  input.setFeedback({
    onPlace(receipt) {
      receipts.push(receipt);
    },
    onSelect() {},
  });
  return { ...nodes, input, receipts };
}

function domBytes(mounted) {
  return JSON.stringify({
    attributes: [...mounted.feedback.node.attributes],
    controller: mounted.feedback.controller.serialize(),
    dataset: mounted.feedback.node.dataset,
    style: [...mounted.feedback.node.style.values],
  });
}

test("ui placement feedback: canonical legality drives exact stable view states", () => {
  const feedback = new PlacementFeedbackController();
  feedback.select("cinderlings");
  assert.deepEqual(feedback.previewArenaPoint({ x: 6_000, y: 12_000 }), {
    command: null,
    legal: true,
    point: { x: 6_000, y: 12_000 },
    reason: "own_side_ground",
    selectedCardId: "cinderlings",
    sequence: 2,
    status: "legal",
  });
  assert.deepEqual(feedback.previewArenaPoint({ x: 9_000, y: 16_000 }), {
    command: null,
    legal: false,
    point: { x: 9_000, y: 16_000 },
    reason: "river_excluded",
    selectedCardId: "cinderlings",
    sequence: 3,
    status: "illegal",
  });
  assert.deepEqual(
    feedback.previewArenaPoint({ x: 18_001, y: 1 }),
    {
      command: null,
      legal: false,
      point: { x: 18_001, y: 1 },
      reason: "outside_playfield",
      selectedCardId: "cinderlings",
      sequence: 4,
      status: "illegal",
    },
  );
  assert.equal(feedback.serialize(), feedback.serialize());
});

test("ui placement feedback: selected card tracks exact inner client coordinates", () => {
  const mounted = mountedBrowser();
  mounted.hand[1].emit("click", { currentTarget: mounted.hand[1] });
  mounted.arena.emit("pointermove", LEGAL);
  assert.deepEqual(mounted.feedback.controller.view.point, {
    x: 6_000,
    y: 12_000,
  });
  assert.equal(mounted.feedback.node.dataset.state, "legal");
  assert.equal(
    mounted.feedback.node.style.values.get("--placement-x"),
    "6000",
  );
  assert.equal(
    mounted.feedback.node.style.values.get("--placement-y"),
    "20000",
  );
  mounted.arena.emit("pointermove", RIVER);
  assert.equal(mounted.feedback.node.dataset.state, "illegal");
  assert.equal(mounted.feedback.node.dataset.reason, "river_excluded");
});

test("ui placement feedback: decorative border rejects without input mutation", () => {
  const mounted = mountedBrowser();
  mounted.hand[1].emit("click", { currentTarget: mounted.hand[1] });
  const before = mounted.input.input.serialize();
  mounted.arena.emit("pointermove", BORDER);
  assert.deepEqual(mounted.feedback.controller.view, {
    command: null,
    legal: false,
    point: null,
    reason: "outside_client_bounds",
    selectedCardId: "cinderlings",
    sequence: 2,
    status: "illegal",
  });
  const rejected = mounted.arena.emit("pointerup", BORDER);
  assert.equal(rejected.reason, "outside_client_bounds");
  assert.equal(mounted.input.input.serialize(), before);
  assert.equal(mounted.feedback.node.dataset.state, "illegal");
  assert.equal(mounted.feedback.node.dataset.commandId, "");
});

test("ui placement feedback: accepted state is derived from the exact deploy command", () => {
  const mounted = mountedBrowser();
  mounted.hand[1].emit("click", { currentTarget: mounted.hand[1] });
  mounted.arena.emit("pointermove", LEGAL);
  const result = mounted.arena.emit("pointerup", LEGAL);
  assert.equal(result.accepted, true);
  assert.deepEqual(
    mounted.feedback.controller.view.command,
    result.command,
  );
  assert.deepEqual(mounted.feedback.controller.view.point, result.command.point);
  assert.equal(mounted.feedback.controller.view.status, "accepted");
  assert.equal(mounted.feedback.node.dataset.commandId, String(result.command.id));
  assert.equal(mounted.input.input.commands.length, 1);
  assert.deepEqual(mounted.input.input.commands[0], result.command);
});

test("ui placement feedback: mouse and touch produce byte-identical projection", () => {
  const mouse = mountedBrowser();
  const touch = mountedBrowser();
  mouse.hand[1].emit("click", { currentTarget: mouse.hand[1] });
  touch.hand[1].emit("click", { currentTarget: touch.hand[1] });
  mouse.arena.emit("pointermove", LEGAL);
  touch.arena.emit("pointermove", { ...LEGAL, pointerType: "touch" });
  const mouseResult = mouse.arena.emit("pointerup", LEGAL);
  const touchResult = touch.arena.emit("pointerup", {
    ...LEGAL,
    pointerType: "touch",
  });
  assert.deepEqual(mouseResult, touchResult);
  assert.equal(mouse.input.input.serialize(), touch.input.input.serialize());
  assert.equal(domBytes(mouse), domBytes(touch));
});

test("ui placement feedback: DOM binding is deterministic and rejects accessors", () => {
  const left = mountedBrowser();
  const right = mountedBrowser();
  for (const mounted of [left, right]) {
    mounted.hand[1].emit("click", { currentTarget: mounted.hand[1] });
    mounted.arena.emit("pointermove", RIVER);
  }
  assert.equal(domBytes(left), domBytes(right));

  let read = false;
  const hostile = {};
  Object.defineProperty(hostile, "status", {
    enumerable: true,
    get() {
      read = true;
      return "legal";
    },
  });
  assert.throws(
    () => bindPlacementFeedback(left.feedback.node, hostile),
    /data property/u,
  );
  assert.equal(read, false);
});

test("ui placement feedback: history is bounded and cleanup is idempotent", () => {
  const controller = new PlacementFeedbackController();
  controller.select("mossguard");
  for (let index = 0; index < PLACEMENT_FEEDBACK_HISTORY_LIMIT + 17; index += 1) {
    controller.previewArenaPoint({
      x: 6_000 + index % 2,
      y: 12_000,
    });
  }
  assert.equal(controller.history.length, PLACEMENT_FEEDBACK_HISTORY_LIMIT);
  assert.equal(
    controller.history.at(-1).sequence,
    PLACEMENT_FEEDBACK_HISTORY_LIMIT + 18,
  );

  const mounted = mountedBrowser();
  assert.equal(mounted.feedback.cleanup(), true);
  assert.equal(mounted.feedback.cleanup(), false);
  assert.equal(mounted.arena.children.length, 0);
  assert.equal(mounted.arena.listeners.get("pointermove").length, 0);
  assert.equal(mounted.arena.listeners.get("pointerup").length, 0);
  assert.equal(mounted.hand[0].listeners.get("click").length, 0);
  mounted.hand[1].emit("click", { currentTarget: mounted.hand[1] });
  assert.equal(mounted.feedback.controller.view.sequence, 0);
});

test("ui placement feedback: malformed touch, metrics, hooks, and results fail closed", () => {
  const mounted = mountedBrowser();
  mounted.hand[1].emit("click", { currentTarget: mounted.hand[1] });
  const before = mounted.feedback.controller.serialize();
  assert.throws(
    () => mounted.feedback.onTouchMove({ changedTouches: [] }),
    /exactly one/u,
  );
  assert.equal(mounted.feedback.controller.serialize(), before);
  assert.throws(
    () => mounted.input.setFeedback({ onPlace() {} }),
    /hook/u,
  );
  assert.throws(
    () => mounted.feedback.controller.recordPlacement({
      accepted: true,
      command: { type: "forged" },
      type: "place",
    }),
    /receipt/u,
  );
  assert.equal(mounted.feedback.controller.serialize(), before);

  const bad = browser();
  bad.arena.clientWidth = 549;
  const input = mountArenaInputController(bad.shell, systems());
  const feedback = mountPlacementFeedback(bad.shell, input);
  bad.hand[1].emit("click", { currentTarget: bad.hand[1] });
  assert.throws(
    () => bad.arena.emit("pointermove", LEGAL),
    /exceed/u,
  );
  assert.equal(feedback.controller.view.sequence, 1);
});

test("ui placement feedback: capability detection binds one deterministic event family", () => {
  const pointer = mountedBrowser();
  assert.equal(pointer.input.eventFamily, "pointer");
  assert.equal(pointer.arena.listeners.get("pointerup").length, 1);
  assert.equal(pointer.arena.listeners.get("pointermove").length, 1);
  assert.equal(pointer.arena.listeners.has("touchend"), false);
  assert.equal(pointer.arena.listeners.has("touchmove"), false);
  assert.equal(pointer.arena.listeners.has("mouseup"), false);
  assert.equal(pointer.arena.listeners.has("mousemove"), false);

  pointer.hand[1].emit("click", { currentTarget: pointer.hand[1] });
  pointer.arena.emit("pointermove", { ...LEGAL, pointerType: "pen" });
  const pen = pointer.arena.emit("pointerup", {
    ...LEGAL,
    pointerType: "pen",
  });
  assert.equal(pen.accepted, true);
  assert.equal(pointer.input.input.commands.length, 1);
  assert.equal(
    pointer.feedback.controller.history.filter(
      ({ status }) => status === "accepted",
    ).length,
    1,
  );

  const nodes = browser({ pointer: false });
  const input = mountArenaInputController(nodes.shell, systems());
  const feedback = mountPlacementFeedback(nodes.shell, input);
  assert.equal(input.eventFamily, "legacy");
  assert.equal(nodes.arena.listeners.has("pointerup"), false);
  assert.equal(nodes.arena.listeners.has("pointermove"), false);
  for (const type of ["touchend", "mouseup", "touchmove", "mousemove"]) {
    assert.equal(nodes.arena.listeners.get(type).length, 1);
  }

  nodes.hand[1].emit("click", { currentTarget: nodes.hand[1] });
  nodes.arena.emit("touchmove", { changedTouches: [LEGAL] });
  const touch = nodes.arena.emit("touchend", { changedTouches: [LEGAL] });
  assert.equal(touch.accepted, true);
  const afterTouch = feedback.controller.serialize();
  nodes.arena.emit("mousemove", {
    ...LEGAL,
    sourceCapabilities: { firesTouchEvents: true },
  });
  const compatibility = nodes.arena.emit("mouseup", {
    ...LEGAL,
    sourceCapabilities: { firesTouchEvents: true },
  });
  assert.equal(compatibility.reason, "compatibility_mouse_suppressed");
  assert.equal(input.input.commands.length, 1);
  assert.equal(feedback.controller.serialize(), afterTouch);
  assert.equal(
    feedback.controller.history.filter(
      ({ status }) => status === "accepted",
    ).length,
    1,
  );

  nodes.hand[0].emit("click", { currentTarget: nodes.hand[0] });
  nodes.arena.emit("mousemove", { clientX: 271, clientY: 708 });
  const mouse = nodes.arena.emit("mouseup", {
    clientX: 271,
    clientY: 708,
  });
  assert.equal(mouse.accepted, true);
  assert.equal(input.input.commands.length, 2);

  assert.equal(feedback.cleanup(), true);
  for (const type of ["touchend", "mouseup", "touchmove", "mousemove"]) {
    assert.equal(nodes.arena.listeners.get(type).length, 0);
  }
  for (const hand of nodes.hand) {
    assert.equal(hand.listeners.get("click").length, 0);
  }
});

test("ui placement feedback: only single-use canonical input receipts have authority", () => {
  const source = receiptBrowser();
  source.hand[1].emit("click", { currentTarget: source.hand[1] });
  const result = source.arena.emit("pointerup", LEGAL);
  assert.equal(source.receipts.length, 1);
  const controller = new PlacementFeedbackController(source.input.cards);
  assert.deepEqual(
    controller.recordPlacement(source.receipts[0]).command,
    result.command,
  );
  const before = controller.serialize();
  assert.throws(
    () => controller.recordPlacement(source.receipts[0]),
    /consumed/u,
  );
  assert.throws(() => controller.recordPlacement({}), /receipt/u);
  let reads = 0;
  const hostile = {};
  Object.defineProperty(hostile, "result", {
    enumerable: true,
    get() {
      reads += 1;
      return {};
    },
  });
  assert.throws(() => controller.recordPlacement(hostile), /receipt/u);
  assert.equal(reads, 0);
  assert.equal(controller.serialize(), before);
});

test("ui placement feedback: retained prefixes ignore public source rewrites", () => {
  const source = receiptBrowser();
  source.hand[1].emit("click", { currentTarget: source.hand[1] });
  source.arena.emit("pointerup", LEGAL);
  const controller = new PlacementFeedbackController(source.input.cards);
  const first = controller.recordPlacement(source.receipts[0]).command;

  Object.defineProperties(source.input.input, {
    commands: {
      configurable: true,
      value: [{ ...first, cardId: "forged-prefix" }],
    },
    elixir: {
      configurable: true,
      value: { serialize: () => "{\"forged\":true}" },
    },
    selectedCardId: {
      configurable: true,
      value: "forged-selection",
    },
  });
  source.hand[0].emit("click", { currentTarget: source.hand[0] });
  const secondResult = source.arena.emit("pointerup", LEGAL);
  const second = controller.recordPlacement(source.receipts[1]).command;
  assert.equal(second.cardId, "mossguard");
  assert.equal(second.cost, 3);
  assert.deepEqual(second, secondResult.command);
  assert.deepEqual(controller.view.command, second);
});

test("ui placement feedback: remount prefix seed accepts continuation and rejects divergence", () => {
  const continued = receiptBrowser();
  continued.hand[1].emit("click", { currentTarget: continued.hand[1] });
  continued.arena.emit("pointerup", LEGAL);
  const seeded = new PlacementFeedbackController(
    continued.input.cards,
    continued.input.input.commands,
  );
  continued.hand[0].emit("click", { currentTarget: continued.hand[0] });
  const second = continued.arena.emit("pointerup", LEGAL);
  assert.deepEqual(seeded.recordPlacement(continued.receipts[1]).command,
    second.command);
  assert.throws(() => seeded.recordPlacement(continued.receipts[1]), /consumed/u);

  const divergent = receiptBrowser();
  divergent.hand[1].emit("click", { currentTarget: divergent.hand[1] });
  divergent.arena.emit("pointerup", LEGAL);
  const forgedPrefix = divergent.input.input.commands.map((command) => ({
    ...command,
    point: { x: command.point.x + 1_000, y: command.point.y },
  }));
  const rejecting = new PlacementFeedbackController(
    divergent.input.cards,
    forgedPrefix,
  );
  const before = rejecting.serialize();
  divergent.hand[0].emit("click", { currentTarget: divergent.hand[0] });
  divergent.arena.emit("pointerup", LEGAL);
  assert.throws(() => rejecting.recordPlacement(divergent.receipts[1]),
    /prefix changed/u);
  assert.equal(rejecting.serialize(), before);
  assert.throws(() => rejecting.recordPlacement(divergent.receipts[1]), /consumed/u);
});

test("ui placement feedback: source swaps and catalog-cost forgeries reject atomically", () => {
  const left = receiptBrowser();
  const right = receiptBrowser();
  for (const source of [left, right]) {
    source.hand[1].emit("click", { currentTarget: source.hand[1] });
    source.arena.emit("pointerup", LEGAL);
  }
  const controller = new PlacementFeedbackController(left.input.cards);
  controller.recordPlacement(left.receipts[0]);
  const before = controller.serialize();
  assert.throws(
    () => controller.recordPlacement(right.receipts[0]),
    /source changed/u,
  );
  assert.equal(controller.serialize(), before);

  const wrongCatalogSource = receiptBrowser();
  wrongCatalogSource.hand[1].emit("click", {
    currentTarget: wrongCatalogSource.hand[1],
  });
  wrongCatalogSource.arena.emit("pointerup", LEGAL);
  const wrongCards = wrongCatalogSource.input.cards.map((card) => (
    card.id === "cinderlings" ? { ...card, cost: 2 } : card
  ));
  const wrongCatalog = new PlacementFeedbackController(wrongCards);
  const wrongBefore = wrongCatalog.serialize();
  assert.throws(
    () => wrongCatalog.recordPlacement(wrongCatalogSource.receipts[0]),
    /catalog card/u,
  );
  assert.equal(wrongCatalog.serialize(), wrongBefore);
  assert.throws(
    () => {
      wrongCatalogSource.input.cards[0].cost = 99;
    },
    /read only|extensible|Cannot assign/u,
  );
});

test("ui placement feedback: forged authority leaves visible DOM bytes unchanged", () => {
  const mounted = mountedBrowser();
  mounted.hand[1].emit("click", { currentTarget: mounted.hand[1] });
  mounted.arena.emit("pointermove", LEGAL);
  const before = domBytes(mounted);
  assert.throws(
    () => mounted.feedback.controller.recordPlacement(Object.freeze({})),
    /receipt/u,
  );
  assert.equal(domBytes(mounted), before);
});
