import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { MatchClock } from "../src/sim/match.js";
import {
  bindMatchFeedback,
  getMatchFeedbackStyleText,
  MatchFeedbackProjector,
  mountMatchFeedback,
  serializeMatchFeedbackViewModel,
} from "../src/ui/match-feedback.js";

const IDS = [
  "north:central", "north:lane:left", "north:lane:right",
  "south:central", "south:lane:left", "south:lane:right",
];

function initialTowers() {
  return IDS.map((id) => ({ hitpoints: id.endsWith(":central") ? 4_824 : 3_052, id }));
}

function evidence(previous = initialTowers(), changes = {}) {
  const towers = previous.map((tower) => ({
    ...tower,
    hitpoints: Object.hasOwn(changes, tower.id) ? changes[tower.id] : tower.hitpoints,
  }));
  return {
    destroyedTowerIds: towers.filter(({ hitpoints }) => hitpoints === 0).map(({ id }) => id),
    towers,
  };
}

function game() { return new MatchClock({ initialTowers: initialTowers() }); }

function causal(match) {
  return { replayBytes: match.replayBytes(), snapshot: match.serialize() };
}

function projected(match) {
  const projector = new MatchFeedbackProjector();
  return {
    projector,
    view: projector.project(match.state, match.eventLog, causal(match)),
  };
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function forgedResult(match, changes) {
  const state = clone(match.state);
  const events = clone(match.eventLog);
  const result = { ...state.result, ...changes };
  state.result = result;
  const terminal = events.findLast((event) => event.type === "match_end" || event.type === "tiebreak");
  terminal.result = clone(result);
  return { events, state };
}

function rejectsAtomically(match, mutate, pattern = /causal|account|result|tiebreak/u) {
  const projector = new MatchFeedbackProjector();
  const initial = game();
  projector.project(initial.state, [], causal(initial));
  const before = projector.serialize();
  const forged = { events: clone(match.eventLog), state: clone(match.state) };
  mutate(forged);
  assert.throws(
    () => projector.project(forged.state, forged.events, causal(match)),
    pattern,
  );
  assert.equal(projector.serialize(), before);
}

class Style {
  values = new Map();
  setProperty(name, value) { this.values.set(name, value); }
}

class Node {
  attributes = new Map();
  children = [];
  className = "";
  dataset = {};
  ownerDocument = null;
  parentNode = null;
  style = new Style();
  textContent = "";
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((node) => node !== this);
    this.parentNode = null;
  }
  replaceChildren(...nodes) { for (const node of nodes) node.parentNode = this; this.children = nodes; }
  setAttribute(name, value) { this.attributes.set(name, value); }
}

function dom() {
  const document = {
    createElement() { const node = new Node(); node.ownerDocument = document; return node; },
  };
  const arena = document.createElement("main");
  const shell = document.createElement("section");
  shell.querySelector = (selector) => selector === '[data-ui="arena"]' ? arena : null;
  return { arena, document, layer: document.createElement("div"), shell };
}

function nodeBytes(node) {
  return JSON.stringify({
    attributes: [...node.attributes].sort(),
    children: node.children.map(nodeBytes),
    className: node.className,
    dataset: Object.fromEntries(Object.entries(node.dataset).sort()),
    style: [...node.style.values].sort(),
    textContent: node.textContent,
  });
}

test("ui match feedback: canonical tower destruction projects crowns and stable same-tick order", () => {
  const match = game();
  const northLost = evidence(initialTowers(), { "north:lane:left": 0 });
  const bothLost = evidence(northLost.towers, { "south:lane:right": 0 });
  match.scheduleTowerEvidence(10_800, northLost);
  match.scheduleTowerEvidence(10_800, bothLost);
  match.runToTick(10_801);
  const { view } = projected(match);
  assert.deepEqual(view.crowns, { north: 1, south: 1 });
  assert.deepEqual(view.effects, [
    { ordinal: 1, tick: 10_800, towerId: "north:lane:left", type: "tower_destroyed" },
    { ordinal: 2, tick: 10_800, towerId: "south:lane:right", type: "tower_destroyed" },
  ]);
  assert.deepEqual(view.overlay, {
    crowns: { north: 1, south: 1 }, endedAtTick: 10_800, kind: "draw",
    reason: "overtime_sudden_death", winner: null,
  });
});

test("ui match feedback: regulation and overtime boundaries project without inference from wall time", () => {
  const regulation = game();
  regulation.scheduleTowerEvidence(10_799, evidence(initialTowers(), { "north:lane:left": 0 }));
  regulation.runToTick(10_800);
  const regulationView = projected(regulation).view;
  assert.equal(regulationView.phase, "ended");
  assert.equal(regulationView.overlay.reason, "regulation_crowns");
  assert.equal(regulationView.overlay.winner, "south");

  const overtime = game();
  overtime.runToTick(10_800);
  const overtimeView = projected(overtime).view;
  assert.equal(overtimeView.phase, "overtime");
  assert.equal(overtimeView.overlay, null);
  assert.deepEqual(overtime.eventLog, [{ tick: 10_800, type: "overtime_started" }]);
});

test("ui match feedback: central destruction projects three crowns and winner overlay", () => {
  const match = game();
  match.scheduleTowerEvidence(42, evidence(initialTowers(), { "south:central": 0 }));
  match.runToTick(43);
  const view = projected(match).view;
  assert.deepEqual(view.crowns, { north: 3, south: 0 });
  assert.equal(view.effects[0].towerId, "south:central");
  assert.deepEqual(view.overlay, {
    crowns: { north: 3, south: 0 }, endedAtTick: 42, kind: "win",
    reason: "central_destroyed", winner: "north",
  });
});

test("ui match feedback: tiebreak winner and exact tie draw use canonical drain order", () => {
  const winner = game();
  winner.scheduleTowerEvidence(17_999, evidence(initialTowers(), {
    "north:lane:left": 500, "south:lane:left": 501,
  }));
  winner.runToTick(18_000);
  const winnerView = projected(winner).view;
  assert.equal(winnerView.overlay.reason, "tiebreak_lowest_hp");
  assert.equal(winnerView.overlay.winner, "south");
  assert.deepEqual(winnerView.effects.map(({ towerId }) => towerId), ["north:lane:left"]);

  const draw = game();
  draw.scheduleTowerEvidence(17_999, evidence(initialTowers(), {
    "north:lane:left": 333, "south:lane:right": 333,
  }));
  draw.runToTick(18_000);
  const drawView = projected(draw).view;
  assert.equal(drawView.overlay.reason, "tiebreak_exact_tie");
  assert.equal(drawView.overlay.kind, "draw");
  assert.deepEqual(drawView.effects.map(({ towerId }) => towerId), ["north:lane:left", "south:lane:right"]);
});

test("ui match feedback: one-shot, chunked, restored, and independent runs are byte-identical", () => {
  function completed() {
    const match = game();
    match.scheduleTowerEvidence(100, evidence(initialTowers(), { "north:lane:left": 0 }));
    return match;
  }
  const oneMatch = completed();
  oneMatch.runToTick(10_800);
  const one = projected(oneMatch).projector;

  const chunkMatch = completed();
  const chunked = new MatchFeedbackProjector();
  chunked.project(chunkMatch.state, [], causal(chunkMatch));
  chunkMatch.runToTick(101);
  chunked.project(chunkMatch.state, chunkMatch.eventLog, causal(chunkMatch));
  const seen = chunkMatch.eventLog.length;
  chunkMatch.runToTick(10_800);
  chunked.project(
    chunkMatch.state,
    chunkMatch.eventLog.slice(seen),
    causal(chunkMatch),
  );

  assert.equal(chunked.serialize(), one.serialize());
  const restored = MatchFeedbackProjector.restore(one.serialize());
  assert.equal(restored.serialize(), one.serialize());
  assert.equal(serializeMatchFeedbackViewModel(restored.view), serializeMatchFeedbackViewModel(one.view));
  const secondMatch = completed();
  secondMatch.runToTick(10_800);
  assert.equal(projected(secondMatch).projector.serialize(), one.serialize());
});

test("ui match feedback: terminal state is immutable and failed projection is atomic", () => {
  const match = game();
  match.scheduleTowerEvidence(1, evidence(initialTowers(), { "north:central": 0 }));
  match.runToTick(2);
  const projector = projected(match).projector;
  const before = projector.serialize();
  assert.throws(() => projector.project(match.state, []), /immutable/u);
  assert.equal(projector.serialize(), before);

  const active = new MatchFeedbackProjector();
  const activeMatch = game();
  active.project(activeMatch.state, [], causal(activeMatch));
  const activeBefore = active.serialize();
  const hostile = game().state;
  let accessed = false;
  Object.defineProperty(hostile, "tick", { enumerable: true, get() { accessed = true; return 2; } });
  assert.throws(
    () => active.project(hostile, [], causal(activeMatch)),
    /data property/u,
  );
  assert.equal(accessed, false);
  assert.equal(active.serialize(), activeBefore);
});

test("ui match feedback: canonical restore rejects shape, encoding, and fabricated event/state disagreement", () => {
  const initial = game();
  const projector = projected(initial).projector;
  const parsed = JSON.parse(projector.serialize());
  assert.throws(
    () => MatchFeedbackProjector.restore(JSON.stringify({
      version: parsed.version,
      state: parsed.state,
      events: parsed.events,
      causal: parsed.causal,
    })),
    /canonical encoding/u,
  );
  assert.throws(
    () => new MatchFeedbackProjector().project(
      { ...initial.state, extra: true },
      [],
      causal(initial),
    ),
    /invalid shape/u,
  );
  assert.throws(() => new MatchFeedbackProjector().project({
    ...initial.state,
    destroyedTowerIds: ["north:lane:left"],
  }, [], causal(initial)), /disagree/u);
});

test("ui match feedback: terminal winner and kind are derived instead of trusting repeated claims", () => {
  const regulation = game();
  regulation.scheduleTowerEvidence(10_799, evidence(initialTowers(), { "north:lane:left": 0 }));
  regulation.runToTick(10_800);
  for (const changes of [
    { kind: "win", winner: "north" },
    { kind: "draw", winner: null },
  ]) {
    const forged = forgedResult(regulation, changes);
    rejectsAtomically(regulation, (value) => Object.assign(value, forged));
  }

  const central = game();
  central.scheduleTowerEvidence(42, evidence(initialTowers(), { "south:central": 0 }));
  central.runToTick(43);
  const falseEarlyTiebreak = forgedResult(central, { reason: "tiebreak_exact_tie" });
  rejectsAtomically(central, (value) => Object.assign(value, falseEarlyTiebreak));
  const falseEarlyLowest = forgedResult(central, {
    kind: "draw", reason: "tiebreak_lowest_hp", winner: null,
  });
  rejectsAtomically(central, (value) => Object.assign(value, falseEarlyLowest));

  const simultaneous = game();
  simultaneous.scheduleTowerEvidence(10_800, evidence(initialTowers(), {
    "north:lane:left": 0, "south:lane:right": 0,
  }));
  simultaneous.runToTick(10_801);
  const falseWinner = forgedResult(simultaneous, { kind: "win", winner: "north" });
  rejectsAtomically(simultaneous, (value) => Object.assign(value, falseWinner));
});

test("ui match feedback: every destruction terminal reason follows its exact causal boundary", () => {
  const central = game();
  central.scheduleTowerEvidence(17, evidence(initialTowers(), { "north:central": 0 }));
  central.runToTick(18);
  const wrongCentral = forgedResult(central, { reason: "overtime_sudden_death" });
  rejectsAtomically(central, (value) => Object.assign(value, wrongCentral));

  const sudden = game();
  sudden.scheduleTowerEvidence(10_800, evidence(initialTowers(), { "north:lane:left": 0 }));
  sudden.runToTick(10_801);
  const wrongSudden = forgedResult(sudden, { reason: "regulation_crowns" });
  rejectsAtomically(sudden, (value) => Object.assign(value, wrongSudden));

  const regulation = game();
  regulation.scheduleTowerEvidence(99, evidence(initialTowers(), { "north:lane:left": 0 }));
  regulation.runToTick(10_800);
  const wrongRegulation = forgedResult(regulation, { reason: "overtime_sudden_death" });
  rejectsAtomically(regulation, (value) => Object.assign(value, wrongRegulation));
});

test("ui match feedback: both tiebreak reasons, minima, and drains are causally verified", () => {
  const winner = game();
  winner.scheduleTowerEvidence(17_999, evidence(initialTowers(), {
    "north:lane:left": 500, "south:lane:right": 501,
  }));
  winner.runToTick(18_000);
  const falseDraw = forgedResult(winner, {
    kind: "draw", reason: "tiebreak_lowest_hp", winner: null,
  });
  rejectsAtomically(winner, (value) => Object.assign(value, falseDraw));
  rejectsAtomically(winner, ({ events }) => {
    events.find((event) => event.type === "tiebreak").minima.north = 502;
  });

  const draw = game();
  draw.scheduleTowerEvidence(17_999, evidence(initialTowers(), {
    "north:lane:left": 333, "south:lane:right": 333,
  }));
  draw.runToTick(18_000);
  const falseWin = forgedResult(draw, {
    kind: "win", reason: "tiebreak_exact_tie", winner: "north",
  });
  rejectsAtomically(draw, (value) => Object.assign(value, falseWin));
  rejectsAtomically(draw, ({ events }) => {
    events.find((event) => event.type === "tiebreak").drainedTowerIds = ["north:lane:left"];
  });
});

test("ui match feedback: omitted boundary, destruction, and tiebreak events fail closed", () => {
  const overtime = game();
  overtime.runToTick(10_800);
  rejectsAtomically(overtime, ({ events }) => events.splice(0, 1), /causal|boundary|phase|account/u);

  const sudden = game();
  sudden.scheduleTowerEvidence(10_800, evidence(initialTowers(), { "north:lane:left": 0 }));
  sudden.runToTick(10_801);
  rejectsAtomically(sudden, ({ events }) => {
    events.splice(events.findIndex((event) => event.type === "overtime_started"), 1);
  });

  const central = game();
  central.scheduleTowerEvidence(12, evidence(initialTowers(), { "north:central": 0 }));
  central.runToTick(13);
  rejectsAtomically(central, ({ events }) => {
    events.splice(events.findIndex((event) => event.type === "match_end"), 1);
  }, /causal|omit|required|account/u);
  rejectsAtomically(central, ({ events }) => {
    events.splice(events.findIndex((event) => event.type === "tower_evidence"), 1);
  }, /causal|account/u);

  const tiebreak = game();
  tiebreak.runToTick(18_000);
  rejectsAtomically(tiebreak, ({ events }) => {
    events.splice(events.findIndex((event) => event.type === "tiebreak"), 1);
  }, /causal|terminal tiebreak|account/u);
});

test("ui match feedback: pre-drain replay evidence rejects exact co-forged minima and tower identity", () => {
  const winner = game();
  winner.scheduleTowerEvidence(17_999, evidence(initialTowers(), {
    "north:lane:left": 500, "south:lane:right": 501,
  }));
  winner.runToTick(18_000);
  rejectsAtomically(winner, ({ events }) => {
    events.find((event) => event.type === "tiebreak").minima.north = 499;
  });
  rejectsAtomically(winner, ({ events, state }) => {
    const tiebreak = events.find((event) => event.type === "tiebreak");
    tiebreak.drainedTowerIds = ["north:lane:right"];
    state.destroyedTowerIds = ["north:lane:right"];
    state.towers.find(({ id }) => id === "north:lane:left").hitpoints = 500;
    state.towers.find(({ id }) => id === "north:lane:right").hitpoints = 0;
  });

  const draw = game();
  draw.scheduleTowerEvidence(17_999, evidence(initialTowers(), {
    "north:lane:left": 333, "south:lane:right": 333,
  }));
  draw.runToTick(18_000);
  rejectsAtomically(draw, ({ events }) => {
    const tiebreak = events.find((event) => event.type === "tiebreak");
    tiebreak.minima.north = 1;
    tiebreak.minima.south = 1;
  });
});

test("ui match feedback: actual MatchClock replay commands are exact, complete, and ordered", () => {
  const match = game();
  const first = evidence(initialTowers(), { "north:lane:left": 900 });
  const second = evidence(first.towers, { "south:lane:right": 901 });
  match.scheduleTowerEvidence(17_998, first);
  match.scheduleTowerEvidence(17_999, second);
  match.runToTick(18_000);
  const replay = JSON.parse(match.replayBytes());
  assert.equal(replay.length, 2);
  assert.equal(replay[0].command.evidence.towers[1].hitpoints, 900);
  assert.equal(replay[1].command.evidence.towers[5].hitpoints, 901);

  for (const mutate of [
    (entries) => entries.splice(0, 1),
    (entries) => entries.push(clone(entries.at(-1))),
    (entries) => entries.reverse(),
  ]) {
    const projector = new MatchFeedbackProjector();
    const initial = game();
    projector.project(initial.state, [], causal(initial));
    const before = projector.serialize();
    const forgedCausal = causal(match);
    const entries = JSON.parse(forgedCausal.replayBytes);
    mutate(entries);
    forgedCausal.replayBytes = JSON.stringify(entries);
    assert.throws(
      () => projector.project(match.state, match.eventLog, forgedCausal),
      /causal replay bytes/u,
    );
    assert.equal(projector.serialize(), before);
  }
});

test("ui match feedback: DOM/view bytes are stable and overlay uses original bounded primitives", () => {
  const match = game();
  match.scheduleTowerEvidence(7, evidence(initialTowers(), { "south:central": 0 }));
  match.runToTick(8);
  const projector = projected(match).projector;
  const restored = MatchFeedbackProjector.restore(projector.serialize());
  const left = dom();
  const right = dom();
  bindMatchFeedback(left.layer, projector.view);
  bindMatchFeedback(right.layer, restored.view);
  const bytes = nodeBytes(left.layer);
  assert.equal(bytes, nodeBytes(right.layer));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "6cf9ca79fdc480577e4bead30a3ab85de7dc00e046a43a128107c4b93884b908");
  const overlay = left.layer.children[0].children.at(-1);
  assert.equal(overlay.dataset.winner, "north");
  assert.equal(overlay.children[0].textContent, "north wins");
  assert.match(getMatchFeedbackStyleText(), /match-feedback__overlay/u);
});

test("ui match feedback: DOM binding builds before commit and mount cleanup is idempotent", () => {
  const nodes = dom();
  const sentinel = nodes.document.createElement("sentinel");
  nodes.layer.replaceChildren(sentinel);
  const view = projected(game()).view;
  const original = nodes.document.createElement.bind(nodes.document);
  let calls = 0;
  nodes.document.createElement = (...args) => {
    calls += 1;
    if (calls === 3) throw new Error("hostile document");
    return original(...args);
  };
  assert.throws(() => bindMatchFeedback(nodes.layer, view), /hostile document/u);
  assert.deepEqual(nodes.layer.children, [sentinel]);
  assert.throws(() => bindMatchFeedback(nodes.layer, {}), /must come from/u);
  assert.deepEqual(nodes.layer.children, [sentinel]);

  const mountedNodes = dom();
  const mounted = mountMatchFeedback(mountedNodes.shell);
  mounted.bind(view);
  assert.equal(mountedNodes.arena.children.length, 2);
  assert.equal(mounted.cleanup(), true);
  assert.equal(mounted.cleanup(), false);
  assert.equal(mountedNodes.arena.children.length, 0);
  assert.throws(() => mounted.bind(view), /cleaned up/u);
});
