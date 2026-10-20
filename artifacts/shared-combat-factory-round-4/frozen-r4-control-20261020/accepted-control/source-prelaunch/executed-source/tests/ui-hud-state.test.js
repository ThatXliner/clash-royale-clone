import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { DeckCycle } from "../src/sim/deck.js";
import { ElixirMatch } from "../src/sim/elixir.js";
import { MatchClock } from "../src/sim/match.js";
import {
  bindHudViewModel,
  createHudViewModel,
  getHudMarkup,
  serializeHudViewModel,
} from "../src/ui/hud-state.js";
import {
  createArenaHudController,
  createInitialArenaHudSystems,
} from "../src/ui/arena-shell-entry.js";

const CARDS = Object.freeze([
  Object.freeze({ cost: 1, displayName: "Ashling", id: "ashling" }),
  Object.freeze({ cost: 2, displayName: "Bramble Guard", id: "bramble-guard" }),
  Object.freeze({ cost: 3, displayName: "Cinderwing", id: "cinderwing" }),
  Object.freeze({ cost: 4, displayName: "Dawn Golem", id: "dawn-golem" }),
  Object.freeze({ cost: 5, displayName: "Ember Sage", id: "ember-sage" }),
  Object.freeze({ cost: 6, displayName: "Frost Ram", id: "frost-ram" }),
  Object.freeze({ cost: 7, displayName: "Grove Giant", id: "grove-giant" }),
  Object.freeze({ cost: 8, displayName: "Hollow Drake", id: "hollow-drake" }),
]);
const TOWERS = Object.freeze([
  "north:central",
  "north:lane:left",
  "north:lane:right",
  "south:central",
  "south:lane:left",
  "south:lane:right",
].map((id) => Object.freeze({ hitpoints: 3_000, id })));

function systems() {
  return {
    deck: new DeckCycle({ deck: CARDS.map(({ id }) => id), seed: 0 }),
    elixir: new ElixirMatch(),
    match: new MatchClock({ initialTowers: TOWERS }),
  };
}

function viewOf(
  state,
  { localSide = "south", selectedCardId = null } = {},
) {
  return createHudViewModel({
    cards: [...CARDS],
    deck: state.deck.state,
    elixir: state.elixir.state,
    localSide,
    match: state.match.state,
    selectedCardId,
  });
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("ui HUD: initial canonical projection contains exact timer, rail, hand, and next", () => {
  const state = systems();
  const view = viewOf(state);
  assert.deepEqual(view, {
    crowns: { north: 0, south: 0 },
    deckSequence: 0,
    elixir: { accumulator: 0, amount: 5, capacity: 10, side: "south" },
    hand: [
      { cost: 2, disabled: false, displayName: "Bramble Guard", id: "bramble-guard", insufficient: false, selected: false, slot: 0 },
      { cost: 8, disabled: true, displayName: "Hollow Drake", id: "hollow-drake", insufficient: true, selected: false, slot: 1 },
      { cost: 7, disabled: true, displayName: "Grove Giant", id: "grove-giant", insufficient: true, selected: false, slot: 2 },
      { cost: 6, disabled: true, displayName: "Frost Ram", id: "frost-ram", insufficient: true, selected: false, slot: 3 },
    ],
    next: { cost: 4, displayName: "Dawn Golem", id: "dawn-golem" },
    phase: "regulation",
    tick: 0,
    timer: { remainingTicks: 10_800, text: "3:00" },
    version: 1,
  });
  assert.ok(Object.isFrozen(view));
  assert.ok(Object.isFrozen(view.hand[0]));
});

test("ui HUD: regulation, overtime, triple-rate, and terminal boundaries are exact", () => {
  const state = systems();
  state.elixir.runToTick(10_799);
  state.match.runToTick(10_799);
  assert.deepEqual(viewOf(state).timer, { remainingTicks: 1, text: "0:01" });

  state.elixir.step();
  state.match.step();
  assert.equal(viewOf(state).phase, "overtime");
  assert.deepEqual(viewOf(state).timer, {
    remainingTicks: 7_200,
    text: "2:00",
  });

  state.elixir.runToTick(14_400);
  state.match.runToTick(14_400);
  const triple = viewOf(state);
  assert.equal(triple.tick, 14_400);
  assert.equal(triple.phase, "overtime");
  assert.equal(triple.timer.text, "1:00");

  state.elixir.runToTick(18_000);
  state.match.runToTick(18_000);
  const ended = viewOf(state);
  assert.equal(ended.phase, "ended");
  assert.deepEqual(ended.timer, { remainingTicks: 0, text: "0:00" });
  assert.ok(ended.hand.every(({ disabled }) => disabled));
});

test("ui HUD: canonical spends, selection, deck play, and crowns project without mutation", () => {
  const state = systems();
  const selected = state.deck.state.hand[0];
  state.elixir.scheduleSpend(0, "south", 4);
  state.elixir.step();
  state.match.step();
  const before = JSON.stringify({
    deck: state.deck.state,
    elixir: state.elixir.state,
    match: state.match.state,
  });
  const view = viewOf(state, { selectedCardId: selected });
  assert.equal(view.elixir.amount, 1);
  assert.equal(view.hand[0].selected, true);
  assert.deepEqual(
    view.hand.map(({ insufficient }) => insufficient),
    [true, true, true, true],
  );
  assert.equal(JSON.stringify({
    deck: state.deck.state,
    elixir: state.elixir.state,
    match: state.match.state,
  }), before);

  state.deck.play(selected);
  const cycled = viewOf(state);
  assert.equal(cycled.deckSequence, 1);
  assert.equal(cycled.hand[0].id, "dawn-golem");
  assert.equal(cycled.next.id, "ashling");

  const evidence = TOWERS.map((tower) => ({ ...tower }));
  evidence[1].hitpoints = 0;
  state.match.scheduleTowerEvidence(state.match.tick, {
    destroyedTowerIds: ["north:lane:left"],
    towers: evidence,
  });
  state.match.step();
  state.elixir.step();
  assert.deepEqual(viewOf(state).crowns, { north: 0, south: 1 });
});

test("ui HUD: permanent early results remain projectable after later canonical ticks", () => {
  const state = systems();
  const evidence = TOWERS.map((tower) => ({ ...tower }));
  evidence[0].hitpoints = 0;
  state.match.scheduleTowerEvidence(0, {
    destroyedTowerIds: ["north:central"],
    towers: evidence,
  });
  state.match.step();
  state.elixir.step();
  state.match.advanceTicks(9);
  state.elixir.advanceTicks(9);
  const view = viewOf(state);
  assert.equal(view.phase, "ended");
  assert.equal(view.tick, 10);
  assert.deepEqual(view.crowns, { north: 0, south: 3 });
  assert.equal(view.timer.text, "0:00");
});

test("ui HUD: causal replay and serialize/restore produce byte-identical output", () => {
  const original = systems();
  original.deck.play(original.deck.state.hand[0]);
  original.deck.play(original.deck.state.hand[2]);
  original.elixir.scheduleSpend(20, "south", 3);
  original.elixir.scheduleSpend(7_200, "north", 5);
  original.elixir.runToTick(8_000);
  original.match.runToTick(8_000);

  const restored = {
    deck: DeckCycle.restore(original.deck.serializeJson()),
    elixir: ElixirMatch.restore(original.elixir.serialize()),
    match: MatchClock.restore(original.match.serialize()),
  };
  const left = viewOf(original);
  const right = viewOf(restored);
  assert.equal(serializeHudViewModel(left), serializeHudViewModel(right));
  assert.equal(getHudMarkup(left), getHudMarkup(right));
  assert.equal(
    digest(`${serializeHudViewModel(left)}\n${getHudMarkup(left)}`),
    digest(`${serializeHudViewModel(right)}\n${getHudMarkup(right)}`),
  );
});

class FakeNode {
  constructor() {
    this.dataset = {};
    this.innerHTML = "";
    this.style = { width: "" };
    this.textContent = "";
    this.value = "";
    this.children = [];
    this.lookups = new Map();
  }

  querySelector(selector) {
    const value = this.lookups.get(selector);
    return Array.isArray(value) ? value[0] ?? null : value ?? null;
  }

  querySelectorAll(selector) {
    const value = this.lookups.get(selector);
    if (Array.isArray(value)) return value;
    return value === undefined ? [] : [value];
  }
}

function fakeShell() {
  const shell = new FakeNode();
  const timer = new FakeNode();
  const north = new FakeNode();
  const south = new FakeNode();
  north.lookups.set("i", [new FakeNode(), new FakeNode(), new FakeNode()]);
  south.lookups.set("i", [new FakeNode(), new FakeNode(), new FakeNode()]);
  const hand = [new FakeNode(), new FakeNode(), new FakeNode(), new FakeNode()];
  const next = new FakeNode();
  const rail = new FakeNode();
  const fill = new FakeNode();
  const output = new FakeNode();
  rail.lookups.set(".elixir-fill", fill);
  rail.lookups.set("output", output);
  shell.lookups.set('[data-ui="timer"]', timer);
  shell.lookups.set('[data-ui="opponent-hud"] .crown-track', north);
  shell.lookups.set('[data-ui="player-hud"] .crown-track', south);
  shell.lookups.set('[data-ui="card-slot"]', hand);
  shell.lookups.set('[data-ui="next-card"]', next);
  shell.lookups.set('[data-ui="elixir-rail"]', rail);
  return { fill, hand, next, north, output, rail, shell, south, timer };
}

function domBytes(nodes) {
  return JSON.stringify({
    fill: nodes.fill.style,
    hand: nodes.hand.map(({ dataset, innerHTML }) => ({ dataset, innerHTML })),
    next: { dataset: nodes.next.dataset, innerHTML: nodes.next.innerHTML },
    north: nodes.north.querySelectorAll("i").map(({ dataset }) => dataset),
    output: { textContent: nodes.output.textContent, value: nodes.output.value },
    rail: nodes.rail.dataset,
    south: nodes.south.querySelectorAll("i").map(({ dataset }) => dataset),
    timer: { dataset: nodes.timer.dataset, textContent: nodes.timer.textContent },
  });
}

test("ui HUD: DOM binding is deterministic at state boundaries", () => {
  const state = systems();
  const first = fakeShell();
  const second = fakeShell();
  const view = viewOf(state, { selectedCardId: state.deck.state.hand[0] });
  assert.equal(bindHudViewModel(first.shell, view), first.shell);
  bindHudViewModel(second.shell, view);
  assert.equal(domBytes(first), domBytes(second));
  assert.equal(first.fill.style.width, "50.000000%");
  assert.equal(first.timer.textContent, "3:00");
  assert.equal(first.hand.filter(({ dataset }) => dataset.selected === "true").length, 1);
  assert.equal(first.hand.filter(({ dataset }) => dataset.disabled === "true").length, 3);
});

test("ui HUD: local north maps player and opponent crown rails without changing absolute state", () => {
  const state = systems();
  const evidence = TOWERS.map((tower) => ({ ...tower }));
  evidence[4].hitpoints = 0;
  state.match.scheduleTowerEvidence(0, {
    destroyedTowerIds: ["south:lane:left"],
    towers: evidence,
  });
  state.match.step();
  state.elixir.step();
  const nodes = fakeShell();
  bindHudViewModel(nodes.shell, viewOf(state, { localSide: "north" }));
  assert.equal(
    nodes.north.querySelectorAll("i")
      .filter(({ dataset }) => dataset.earned === "true").length,
    0,
  );
  assert.equal(
    nodes.south.querySelectorAll("i")
      .filter(({ dataset }) => dataset.earned === "true").length,
    1,
  );
});

test("ui HUD: hostile shapes, accessors, prototypes, duplicates, and unsafe values reject", () => {
  const state = systems();
  const valid = {
    cards: [...CARDS],
    deck: state.deck.state,
    elixir: state.elixir.state,
    localSide: "south",
    match: state.match.state,
    selectedCardId: null,
  };
  const variants = [
    null,
    { ...valid, extra: true },
    { ...valid, localSide: "east" },
    { ...valid, selectedCardId: "not-in-hand" },
    { ...valid, cards: [...CARDS.slice(0, 7), CARDS[0]] },
    { ...valid, deck: { ...valid.deck, hand: [...valid.deck.hand, "ashling"] } },
    { ...valid, deck: { ...valid.deck, next: valid.deck.hand[0] } },
    { ...valid, elixir: { ...valid.elixir, tick: Number.MAX_SAFE_INTEGER } },
    { ...valid, match: { ...valid.match, phase: "overtime" } },
    Object.create({ cards: valid.cards }),
  ];
  for (const variant of variants) assert.throws(() => createHudViewModel(variant));

  let invoked = false;
  const accessor = { ...valid };
  Object.defineProperty(accessor, "cards", {
    enumerable: true,
    get() {
      invoked = true;
      return valid.cards;
    },
  });
  assert.throws(() => createHudViewModel(accessor), /data property/u);
  assert.equal(invoked, false);
});

test("ui HUD: shipped controller, exact hooks, bounded access, and setter rollback are strict", () => {
  const state = systems();
  const view = viewOf(state);
  const nodes = fakeShell();
  nodes.shell.lookups.delete('[data-ui="next-card"]');
  assert.throws(() => bindHudViewModel(nodes.shell, view), /missing/u);
  assert.equal(domBytes(nodes), domBytes(fakeShell()));
  assert.throws(() => bindHudViewModel(fakeShell().shell, { ...view }));

  const duplicateSingleton = fakeShell();
  duplicateSingleton.shell.lookups.set(
    '[data-ui="timer"]',
    [duplicateSingleton.timer, new FakeNode()],
  );
  assert.throws(
    () => bindHudViewModel(duplicateSingleton.shell, view),
    /exactly 1/u,
  );
  assert.equal(domBytes(duplicateSingleton), domBytes(fakeShell()));

  const duplicateHand = fakeShell();
  duplicateHand.shell.lookups.set(
    '[data-ui="card-slot"]',
    [
      duplicateHand.hand[0],
      duplicateHand.hand[1],
      duplicateHand.hand[2],
      duplicateHand.hand[2],
    ],
  );
  assert.throws(() => bindHudViewModel(duplicateHand.shell, view), /unique/u);
  assert.equal(domBytes(duplicateHand), domBytes(fakeShell()));

  const throwing = fakeShell();
  let setterCalls = 0;
  throwing.hand[0].dataset = new Proxy({}, {
    set(target, key, value) {
      setterCalls += 1;
      if (key === "disabled" && setterCalls === 2) {
        throw new Error("setter probe");
      }
      target[key] = value;
      return true;
    },
  });
  const beforeSetter = domBytes(throwing);
  assert.throws(
    () => bindHudViewModel(throwing.shell, view),
    /setter probe/u,
  );
  assert.equal(domBytes(throwing), beforeSetter);

  const bounded = fakeShell();
  let queryReads = 0;
  const query = bounded.shell.querySelectorAll.bind(bounded.shell);
  Object.defineProperty(bounded.shell, "querySelectorAll", {
    configurable: true,
    get() {
      queryReads += 1;
      if (queryReads > 1) throw new Error("unbounded accessor read");
      return query;
    },
  });
  bindHudViewModel(bounded.shell, view);
  assert.equal(queryReads, 1);

  const initial = createInitialArenaHudSystems();
  assert.deepEqual(
    initial.cards.map(({ id }) => id),
    [
      "coilblade",
      "mossguard",
      "copperskiff",
      "skymaul",
      "brassbolt",
      "reedsting",
      "briar-band",
      "cinderlings",
    ],
  );
  const shipped = fakeShell();
  const controller = createArenaHudController(shipped.shell);
  assert.equal(controller.initialView.timer.text, "3:00");
  assert.equal(shipped.hand.every(({ dataset }) => dataset.cardId.length > 0), true);
  assert.equal(shipped.next.dataset.cardId.length > 0, true);
  assert.equal(shipped.output.textContent, "5");
  assert.equal(shipped.timer.dataset.phase, "regulation");
  assert.deepEqual(
    shipped.south.querySelectorAll("i").map(({ dataset }) => dataset.earned),
    ["false", "false", "false"],
  );
  controller.elixir.step();
  controller.match.step();
  const updated = controller.update(controller.deck.state.hand[0]);
  assert.equal(updated.tick, 1);
  assert.equal(shipped.timer.dataset.tick, "1");
});
