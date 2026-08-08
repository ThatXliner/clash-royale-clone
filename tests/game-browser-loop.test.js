import assert from "node:assert/strict";
import test from "node:test";

import { createPlayableRoster, createPlayableRosterQuestionRecords } from
  "../src/content/playable-roster.js";
import { DeckCycle } from "../src/sim/deck.js";
import { ElixirMatch } from "../src/sim/elixir.js";
import { GameSession } from "../src/sim/game-session.js";
import {
  GAME_BROWSER_MAX_BACKLOG_TICKS,
  GAME_BROWSER_MAX_TICKS_PER_FRAME,
  mountGameBrowserLoop,
} from "../src/ui/game-browser-loop.js";
import {
  createArenaInputSessionContinuationCapability,
  mountArenaInputController,
  serializeArenaInputCards,
} from "../src/ui/input-controller.js";

const ROSTER = createPlayableRoster();
const DECK = ROSTER.map(({ id }) => id);
const RECT = Object.freeze({ height: 960, left: 90, top: 108, width: 540 });

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function setup({ candidates = null, seed = "browser-loop", starting = 10,
  think = 60, windup = { central: 0, lane: 0 } } = {}) {
  const questions = createPlayableRosterQuestionRecords();
  const battleSetup = canonical({ initialWindupTicks: windup, questions, roster: ROSTER });
  const legalNorthDeployments = candidates ?? DECK.map((cardId) =>
    ({ cardId, point: { x: 3_500, y: 17_500 } }))
    .sort((left, right) => left.cardId.localeCompare(right.cardId));
  return canonical({ battleSetup, deck: DECK, legalNorthDeployments,
    rosterWitness: canonical({ questions, roster: ROSTER }), seed,
    startingElixir: { north: starting, south: starting },
    thinkIntervalTicks: think, thinkOffsetTicks: 0 });
}

class Node {
  constructor(ownerDocument, name = "node") {
    this.attributes = new Map(); this.children = []; this.className = "";
    this.dataset = {}; this.innerHTML = ""; this.listeners = new Map();
    this.lookups = new Map(); this.name = name; this.ownerDocument = ownerDocument;
    this.parentNode = null; this.style = { values: new Map(),
      setProperty: (key, value) => this.style.values.set(key, value) };
    this.textContent = "";
  }
  get childNodes() { return this.children; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  emit(type, event) { let result;
    for (const listener of [...(this.listeners.get(type) ?? [])]) result = listener(event);
    return result; }
  listenerCount() { return [...this.listeners.values()]
    .reduce((sum, listeners) => sum + listeners.size, 0); }
  querySelectorAll(selector) { const result = this.lookups.get(selector);
    return result === undefined ? [] : Array.isArray(result) ? result : [result]; }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  replaceChildren(...children) { for (const child of children) child.parentNode = this;
    this.children = children; }
  setAttribute(key, value) { this.attributes.set(key, value); }
}

class FakeRaf {
  #callbacks = new Map(); #next = 1;
  cancelAnimationFrame = (handle) => { this.#callbacks.delete(handle); };
  requestAnimationFrame = (callback) => { const handle = this.#next++;
    this.#callbacks.set(handle, callback); return handle; };
  get size() { return this.#callbacks.size; }
  take() { const entry = [...this.#callbacks][0];
    if (!entry) throw new Error("no scheduled frame"); this.#callbacks.delete(entry[0]); return entry[1]; }
  fire(timestamp) { return this.take()(timestamp); }
}

function fixture(session = new GameSession(setup())) {
  const document = { defaultView: { PointerEvent: class PointerEvent {} },
    createElement(name) { return new Node(document, name); },
    createElementNS(_namespace, name) { return new Node(document, name); } };
  const root = new Node(document, "root"), shell = new Node(document, "shell");
  const arena = new Node(document, "arena");
  arena.clientHeight = RECT.height; arena.clientLeft = 0; arena.clientTop = 0;
  arena.clientWidth = RECT.width; arena.getBoundingClientRect = () => RECT;
  const hand = Array.from({ length: 4 }, () => new Node(document, "card"));
  shell.lookups.set('[data-ui="arena"]', arena);
  shell.lookups.set('[data-ui="card-slot"]', hand);
  const layers = Object.fromEntries(["combat", "effects", "feedback", "hud"]
    .map((name) => [name, new Node(document, name)]));
  const createInput = (candidateSession, nextCommandId) => {
    const serialized = JSON.parse(candidateSession.serialize());
    const parsed = serialized.setup;
    const deck = new DeckCycle({ deck: DECK, seed: `${parsed.seed}:south` });
    const elixir = new ElixirMatch({ startingElixir: parsed.startingElixir });
    const state = candidateSession.state;
    const pending = new Set(state.pendingPlayerCommands.map(({ commandId }) => commandId));
    const costs = new Map(ROSTER.map(({ cost, id }) => [id, cost]));
    const commands = serialized.transcript.filter(({ type }) => type === "submit")
      .map(({ command }) => command).filter(({ commandId }) => !pending.has(commandId))
      .sort((left, right) => left.tick - right.tick || left.commandId - right.commandId);
    let commandIndex = 0;
    for (let tick = 0; tick < state.tick; tick += 1) {
      const command = commands[commandIndex];
      if (command?.tick === tick) {
        elixir.scheduleSpend(tick, "south", costs.get(command.cardId));
        deck.play(command.cardId); commandIndex += 1;
      }
      elixir.step();
    }
    for (let index = 0; index < hand.length; index += 1) {
      hand[index].dataset.cardId = deck.state.hand[index];
    }
    return mountArenaInputController(shell, createArenaInputSessionContinuationCapability(
      serializeArenaInputCards(ROSTER), deck.serializeJson(), elixir.serialize(), nextCommandId,
      () => {}, (_selected, projected = { deck }) => {
        for (let index = 0; index < hand.length; index += 1) {
          hand[index].dataset.cardId = projected.deck.state.hand[index];
        }
      }));
  };
  const scheduler = new FakeRaf();
  const loop = mountGameBrowserLoop({ createInput, layers, root,
    scheduler: { cancelAnimationFrame: scheduler.cancelAnimationFrame,
      requestAnimationFrame: scheduler.requestAnimationFrame }, session });
  return { arena, hand, layers, loop, root, scheduler, shell };
}

function assertTicks(value, tick) {
  assert.equal(value.loop.state.sessionTick, tick); assert.equal(value.loop.state.domTick, tick);
  for (const layer of Object.values(value.layers)) {
    assert.equal(layer.children[0].dataset.tick, String(tick));
  }
}

test("game browser loop: one session mounts all projections and manual pause/resume stays aligned", () => {
  const value = fixture();
  assertTicks(value, 0); assert.equal(value.scheduler.size, 1);
  assert.equal(value.loop.stepMany(5).length >= 0, true); assertTicks(value, 5);
  assert.equal(value.loop.pause(), true); assert.equal(value.scheduler.size, 0);
  assert.equal(value.arena.listenerCount(), 0);
  assert.equal(value.hand.reduce((sum, node) => sum + node.listenerCount(), 0), 0);
  assert.equal(value.loop.state.paused, true); assert.deepEqual(value.loop.stepMany(5), []);
  assertTicks(value, 5); assert.equal(value.loop.resume(), true); assert.equal(value.scheduler.size, 1);
  assert.equal(value.arena.listenerCount(), 1);
  assert.equal(value.hand.reduce((sum, node) => sum + node.listenerCount(), 0), 4);
  value.scheduler.fire(0); value.scheduler.fire(1_000 / 60); assertTicks(value, 6);
  assert.equal(value.loop.resume(), false);
  assert.equal(value.loop.dispose(), true); assert.equal(value.loop.dispose(), false);
});

test("game browser loop: RAF backlog is capped and each frame coalesces into one stepMany", () => {
  const value = fixture();
  const originalMany = GameSession.prototype.stepMany;
  const originalStep = GameSession.prototype.step;
  const counts = [];
  GameSession.prototype.step = () => { throw new Error("public step must not drive catch-up"); };
  GameSession.prototype.stepMany = function observedStepMany(count) {
    counts.push(count); return originalMany.call(this, count);
  };
  try {
    value.scheduler.fire(0);
    value.scheduler.fire(10_000);
    assert.deepEqual(counts, [GAME_BROWSER_MAX_TICKS_PER_FRAME]);
    assert.equal(value.loop.state.backlogTicks,
      GAME_BROWSER_MAX_BACKLOG_TICKS - GAME_BROWSER_MAX_TICKS_PER_FRAME);
    assertTicks(value, GAME_BROWSER_MAX_TICKS_PER_FRAME);
    value.scheduler.fire(10_000);
    assert.deepEqual(counts, [GAME_BROWSER_MAX_TICKS_PER_FRAME,
      GAME_BROWSER_MAX_TICKS_PER_FRAME]);
    assert.equal(value.loop.state.backlogTicks, 0); assertTicks(value, 240);
  } finally {
    GameSession.prototype.stepMany = originalMany; GameSession.prototype.step = originalStep;
    value.loop.dispose();
  }
});

test("game browser loop: input reaches the sole session and restore replaces listeners without redelivery", () => {
  const value = fixture();
  const costs = new Map(ROSTER.map(({ cost, id }) => [id, cost]));
  const place = (commandId, tick) => {
    const hand = value.loop.session.state.decks.south.hand;
    const cardId = [...hand].sort((left, right) =>
      costs.get(left) - costs.get(right) || left.localeCompare(right))[0];
    const slot = hand.indexOf(cardId);
    assert.equal(value.hand[slot].dataset.cardId, cardId);
    value.hand[slot].emit("click", { currentTarget: value.hand[slot] });
    assert.equal(value.arena.emit("pointerup", { clientX: 270, clientY: 708 }).accepted, true);
    assert.deepEqual(value.loop.session.state.pendingPlayerCommands.map((command) =>
      ({ commandId: command.commandId, tick: command.tick })), [{ commandId, tick }]);
  };
  value.scheduler.fire(0); value.scheduler.fire(1_000 / 60); assertTicks(value, 1);
  place(1, 1); value.loop.stepMany(1); assertTicks(value, 2);
  place(2, 2); value.loop.stepMany(1); assertTicks(value, 3);
  const snapshot = value.loop.serialize(), beforeSession = value.loop.session;
  const stalePointer = [...value.arena.listeners.get("pointerup")][0];
  value.loop.stepMany(10); assertTicks(value, 13);
  value.loop.restore(snapshot); assert.notEqual(value.loop.session, beforeSession); assertTicks(value, 3);
  assert.equal(value.arena.listenerCount(), 1);
  assert.equal(value.hand.reduce((sum, node) => sum + node.listenerCount(), 0), 4);
  const restoredBytes = value.loop.session.serialize();
  assert.throws(() => stalePointer({ clientX: 270, clientY: 708 }), /disposed/u);
  assert.equal(value.loop.session.serialize(), restoredBytes);
  place(3, 3); value.loop.stepMany(1); assertTicks(value, 4);
  const commits = value.loop.session.replay.filter(({ side, type }) =>
    side === "south" && type === "session-deployed");
  assert.equal(commits.length, 3);
  assert.equal(new Set(commits.map(({ deployment }) => deployment.sequence)).size, 3);
  assert.equal(value.loop.dispose(), true);
  assert.equal(value.arena.listenerCount(), 0);
  assert.equal(value.hand.reduce((sum, node) => sum + node.listenerCount(), 0), 0);
});

test("game browser loop: duplicate mount rejects and cleanup is idempotent", () => {
  const value = fixture();
  const session = new GameSession(setup());
  assert.throws(() => mountGameBrowserLoop({ createInput: () => {}, layers: value.layers,
    root: value.root, scheduler: { cancelAnimationFrame() {}, requestAnimationFrame() {} },
    session }), /already mounted/u);
  assert.equal(value.loop.dispose(), true); assert.equal(value.loop.dispose(), false);
  assert.throws(() => value.loop.stepMany(1), /disposed/u);
});

test("game browser loop: live terminal inside a batch stops scheduler and every DOM tick exactly", () => {
  const configured = setup({ candidates: [{ cardId: "coilblade",
    point: { x: 3_500, y: 17_500 } }], seed: 2,
    windup: { central: 10_000, lane: 10_000 } });
  const session = new GameSession(configured);
  session.submitPlayerCommand(canonical({ cardId: "coilblade", commandId: 0,
    point: { x: 14_500, y: 14_500 }, slot: session.state.decks.south.hand.indexOf("coilblade"),
    tick: 105, type: "deploy" }));
  const value = fixture(session);
  value.loop.stepMany(3_000); assertTicks(value, 1_590);
  assert.equal(value.loop.state.terminal, true); assert.equal(value.loop.state.running, false);
  assert.equal(value.loop.state.scheduled, false); assert.equal(value.scheduler.size, 0);
  const bytes = value.loop.serialize(); assert.deepEqual(value.loop.stepMany(3_000), []);
  assert.equal(value.loop.serialize(), bytes); assertTicks(value, 1_590);
  value.loop.dispose();
});

test("game browser loop: runtime and shipped entry contain no wall clock, RNG, or repeated-step catch-up", async () => {
  const fs = await import("node:fs/promises");
  const loop = await fs.readFile(new URL("../src/ui/game-browser-loop.js", import.meta.url), "utf8");
  const entry = await fs.readFile(new URL("../src/ui/game-browser-entry.js", import.meta.url), "utf8");
  const html = await fs.readFile(new URL("../public/ui-arena-shell.html", import.meta.url), "utf8");
  for (const source of [loop, entry]) {
    assert.doesNotMatch(source, /Date\s*[.(]|Math\.random|performance\s*\./u);
  }
  assert.doesNotMatch(loop, /\.step\s*\(/u);
  assert.match(loop, /session\.stepMany\(count\)/u);
  assert.match(html, /arena-shell-entry\.js/u);
  const shellEntry = await fs.readFile(new URL("../src/ui/arena-shell-entry.js", import.meta.url),
    "utf8");
  assert.match(shellEntry, /mountShippedGameBrowser/u);

  let traps = 0;
  const hostileId = new Proxy({}, { get() { traps += 1; throw new Error("executed"); },
    getPrototypeOf() { traps += 1; throw new Error("executed"); },
    valueOf() { traps += 1; throw new Error("executed"); } });
  const deck = new DeckCycle({ deck: DECK, seed: "trap-zero" });
  const elixir = new ElixirMatch();
  assert.throws(() => createArenaInputSessionContinuationCapability(
    serializeArenaInputCards(ROSTER), deck.serializeJson(), elixir.serialize(), hostileId,
    () => {}, () => {}), /next command ID/u);
  assert.equal(traps, 0);
});
