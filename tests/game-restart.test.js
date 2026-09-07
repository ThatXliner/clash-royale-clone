import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createPlayableRoster, createPlayableRosterQuestionRecords } from
  "../src/content/playable-roster.js";
import { GameSession } from "../src/sim/game-session.js";
import {
  createShippedGameSessionSetup,
  mountShippedGameBrowser,
} from "../src/ui/game-browser-entry.js";
import { createGameUiFrame } from "../src/ui/game-ui-projection.js";
import { getHudMarkup } from "../src/ui/hud-state.js";

const ROSTER = createPlayableRoster();
const DECK = ROSTER.map(({ id }) => id);
let terminalSessionBytes = null;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function seedTwoSetup() {
  const questions = createPlayableRosterQuestionRecords();
  return canonical({
    battleSetup: canonical({ initialWindupTicks: { central: 10_000, lane: 10_000 },
      questions, roster: ROSTER }),
    deck: DECK,
    legalNorthDeployments: [{ cardId: "coilblade", point: { x: 3_500, y: 17_500 } }],
    rosterWitness: canonical({ questions, roster: ROSTER }),
    seed: 2,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 60,
    thinkOffsetTicks: 0,
  });
}

function liveSeedTwoSession() {
  const session = new GameSession(seedTwoSetup());
  session.submitPlayerCommand(canonical({
    cardId: "coilblade",
    commandId: 0,
    point: { x: 14_500, y: 14_500 },
    slot: session.state.decks.south.hand.indexOf("coilblade"),
    tick: 105,
    type: "deploy",
  }));
  return session;
}

class Node {
  constructor(ownerDocument, name = "node") {
    this.attributes = new Map(); this.children = []; this.className = "";
    this.dataset = {}; this.hidden = false; this.innerHTML = "";
    this.listeners = new Map(); this.lookups = new Map(); this.name = name;
    this.ownerDocument = ownerDocument; this.parentNode = null;
    this.style = { setProperty() {} }; this.textContent = "";
  }
  get childNodes() { return this.children; }
  get firstElementChild() { return this.children[0] ?? null; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  emit(type, event) {
    let result;
    for (const listener of [...(this.listeners.get(type) ?? [])]) result = listener(event);
    return result;
  }
  listenerCount() { return [...this.listeners.values()]
    .reduce((sum, listeners) => sum + listeners.size, 0); }
  querySelectorAll(selector) {
    const value = this.lookups.get(selector);
    return value === undefined ? [] : Array.isArray(value) ? value : [value];
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  replaceChildren(...children) {
    for (const child of children) child.parentNode = this;
    this.children = children;
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
}

class FakeRaf {
  callbacks = new Map();
  next = 1;
  cancelAnimationFrame = (handle) => { this.callbacks.delete(handle); };
  requestAnimationFrame = (callback) => {
    const handle = this.next++;
    this.callbacks.set(handle, callback);
    return handle;
  };
}

function fakeAudioContext() {
  const state = { closeCalls: 0, sources: [], suspendCalls: 0 };
  const context = {
    currentTime: 0,
    destination: {},
    close() { state.closeCalls += 1; return Promise.resolve(); },
    createBuffer(_channels, length) {
      const channel = new Float32Array(length);
      return { copyToChannel(value) { channel.set(value); }, getChannelData() { return channel; } };
    },
    createBufferSource() {
      const source = { disconnected: 0, onended: null, starts: 0, stops: 0,
        connect() {}, disconnect() { this.disconnected += 1; },
        start() { this.starts += 1; }, stop() { this.stops += 1; } };
      state.sources.push(source); return source;
    },
    createGain() { return { connect() {}, disconnect() {},
      gain: { setValueAtTime() {} } }; },
    resume() { return Promise.resolve(); },
    suspend() { state.suspendCalls += 1; return Promise.resolve(); },
  };
  return { context, state };
}

function fixture(session) {
  const shells = [];
  const contexts = [];
  const document = {
    defaultView: { PointerEvent: class PointerEvent {} },
    createElement(name) {
      if (name !== "template") return new Node(document, name);
      const template = new Node(document, "template");
      template.content = { cloneNode() {
        const shell = new Node(document, "shell");
        const arena = new Node(document, "arena");
        arena.clientHeight = 960; arena.clientLeft = 0; arena.clientTop = 0;
        arena.clientWidth = 540; arena.getBoundingClientRect = () =>
          ({ height: 960, left: 90, top: 108, width: 540 });
        const hand = Array.from({ length: 4 }, () => new Node(document, "card"));
        const audio = new Node(document, "audio-toggle");
        const restart = new Node(document, "restart"); restart.hidden = true;
        shell.lookups.set('[data-ui="arena"]', arena);
        shell.lookups.set('[data-ui="card-slot"]', hand);
        shell.lookups.set('[data-ui="audio-toggle"]', audio);
        shell.lookups.set('[data-ui="restart"]', restart);
        shell.appendChild(audio); shell.appendChild(restart); shell.appendChild(arena);
        for (const card of hand) shell.appendChild(card);
        shells.push({ arena, audio, hand, restart, shell });
        return shell;
      } };
      return template;
    },
  };
  const root = new Node(document, "root");
  const scheduler = new FakeRaf();
  const browser = mountShippedGameBrowser(root, scheduler, session, () => {
    const value = fakeAudioContext(); contexts.push(value); return value.context;
  });
  return { browser, contexts, root, scheduler, shells };
}

function layer(shell, name) {
  const found = shell.children.flatMap((child) => [child, ...child.children])
    .find(({ dataset }) => dataset.gameBrowserLayer === name);
  assert.ok(found, `missing ${name} layer`);
  return found;
}

function descendants(node) {
  return node.children.flatMap((child) => [child, ...descendants(child)]);
}

test("game restart: terminal click atomically replaces the whole graph with exact seed zero", async () => {
  const session = liveSeedTwoSession();
  const value = fixture(session);
  const first = value.shells[0];
  const staleFrame = [...value.scheduler.callbacks.values()][0];
  const stalePointer = [...first.arena.listeners.get("pointerup")][0];
  const staleRestart = [...first.restart.listeners.get("click")][0];
  assert.equal(first.restart.hidden, true);
  assert.equal(value.browser.restart(), false);
  assert.equal(first.restart.emit("click", { isTrusted: false }), false);
  assert.equal(first.restart.emit("click", { isTrusted: true }), false);

  await first.shell.emit("pointerdown", { isTrusted: true });
  value.browser.setAudioGainBasisPoints(2_500);
  first.audio.emit("click", { isTrusted: true });
  const policy = { gainBasisPoints: value.browser.audio.gainBasisPoints,
    muted: value.browser.audio.muted };
  value.browser.stepMany(3_000);
  assert.equal(value.browser.state.sessionTick, 1_590);
  assert.equal(value.browser.state.terminal, true);
  terminalSessionBytes = value.browser.session.serialize();
  assert.equal(first.restart.hidden, false);
  const terminalBrowserBytes = value.browser.serialize();
  const terminalSession = value.browser.session;
  assert.equal(value.scheduler.callbacks.size, 1, "the terminal presentation tail is scheduled");
  const terminalTailFrame = [...value.scheduler.callbacks.values()][0];

  const restarted = first.restart.emit("click", { isTrusted: true });
  assert.equal(restarted.restartCount, 1);
  assert.equal([...value.scheduler.callbacks.values()].includes(terminalTailFrame), false);
  assert.equal(value.browser.state.terminalPresentationTick, 0);
  assert.equal(value.shells.length, 2);
  assert.notEqual(value.browser.session, terminalSession);
  const expected = new GameSession(createShippedGameSessionSetup(0));
  assert.equal(value.browser.session.serialize(), expected.serialize());
  assert.deepEqual(value.browser.session.state, expected.state);
  assert.equal(value.browser.state.sessionTick, 0);
  assert.equal(value.browser.state.terminal, false);
  assert.deepEqual({ gainBasisPoints: value.browser.audio.gainBasisPoints,
    muted: value.browser.audio.muted }, policy);
  assert.deepEqual({ gainBasisPoints: value.browser.audio.audio.gainBasisPoints,
    muted: value.browser.audio.audio.muted }, policy);

  const second = value.shells[1];
  assert.equal(value.root.firstElementChild, second.shell);
  assert.equal(second.restart.hidden, true);
  assert.equal(first.shell.listenerCount(), 0);
  assert.equal(first.audio.listenerCount(), 0);
  assert.equal(first.restart.listenerCount(), 0);
  assert.equal(first.arena.listenerCount(), 0);
  for (const name of ["combat", "effects", "feedback", "hud"]) {
    assert.equal(layer(first.shell, name).children.length, 0,
      `${name} stale projection must be empty`);
  }
  const expectedHud = getHudMarkup(createGameUiFrame(expected).hud);
  assert.equal(layer(second.shell, "hud").firstElementChild.innerHTML, expectedHud);
  assert.equal(layer(second.shell, "effects").children.length, 1);
  assert.equal(layer(second.shell, "effects").firstElementChild.children.length, 0);
  assert.equal(descendants(layer(second.shell, "feedback"))
    .some(({ className }) => className === "match-feedback__overlay"), false);
  assert.equal(value.contexts[0].state.suspendCalls, 1);
  assert.equal(value.contexts[0].state.closeCalls, 1);
  assert.ok(value.contexts[0].state.sources.length > 0);
  assert.ok(value.contexts[0].state.sources.every(({ disconnected, stops }) =>
    disconnected === 1 && stops === 1));
  const cleanBytes = value.browser.serialize();
  assert.equal(staleRestart({ isTrusted: true }), false);
  assert.throws(() => stalePointer({ clientX: 270, clientY: 708 }), /disposed/u);
  staleFrame(16);
  assert.equal(value.browser.serialize(), cleanBytes);
  assert.equal(value.scheduler.callbacks.size, 1);

  value.browser.restore(terminalBrowserBytes);
  assert.equal(second.restart.hidden, false);
  assert.equal(second.restart.emit("click", { isTrusted: true }).restartCount, 2);
  assert.equal(value.shells.length, 3);
  assert.equal(value.browser.session.serialize(), expected.serialize());
  assert.equal(value.shells[2].restart.listenerCount(), 1);
  assert.equal(value.shells[2].arena.listenerCount(), 1);
  assert.equal(value.shells[2].hand.reduce((sum, node) => sum + node.listenerCount(), 0), 4);
  assert.equal(value.browser.dispose(), true);
  assert.equal(value.browser.dispose(), false);
});

test("game restart: hostile cleanup aggregates and cannot create split authority", () => {
  const session = terminalSessionBytes === null
    ? liveSeedTwoSession()
    : GameSession.restore(terminalSessionBytes);
  if (terminalSessionBytes === null) session.stepMany(3_000);
  assert.equal(session.state.terminal, true);
  const value = fixture(session);
  const first = value.shells[0];
  const originalRestartRemove = first.restart.removeEventListener.bind(first.restart);
  first.restart.removeEventListener = () => { throw new Error("restart cleanup rejected"); };
  first.shell.removeEventListener = () => { throw new Error("gesture cleanup rejected"); };
  assert.throws(() => first.restart.emit("click", { isTrusted: true }), (error) => {
    assert.equal(error.name, "AggregateError");
    assert.equal(error.errors.length, 2);
    assert.match(String(error.errors[0]), /restart cleanup rejected/u);
    assert.equal(error.errors[1].name, "AggregateError");
    return true;
  });
  assert.equal(value.browser.state.active, false);
  assert.equal(value.shells.length, 1);
  assert.equal(value.scheduler.callbacks.size, 0);
  assert.throws(() => value.browser.restart(), /disposed/u);
  const staleRestart = [...first.restart.listeners.get("click")][0];
  assert.equal(staleRestart({ isTrusted: true }), false);
  originalRestartRemove("click", staleRestart);
});

test("game restart: shipped selector, dependency seam, and deterministic guards are exact", () => {
  const entry = readFileSync(new URL("../src/ui/game-browser-entry.js", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../src/ui/arena-shell.js", import.meta.url), "utf8");
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const aggregate = readFileSync(new URL("./content-schema-runner.js", import.meta.url), "utf8");
  assert.equal(packageJson.scripts["test:game-restart"],
    "node tests/game-restart-runner.js game-restart");
  assert.equal(aggregate.split('"game-restart"').length - 1, 2);
  assert.equal(shell.split('data-ui="restart"').length - 1, 1);
  assert.match(entry, /new GameSession\(createShippedGameSessionSetup\(0\)\)/u);
  assert.match(entry, /candidate\.loop\?\.dispose/u);
  assert.match(entry, /candidate\.controls\?\.dispose/u);
  assert.doesNotMatch(entry,
    /\b(?:Date|Math\.random|setTimeout|setInterval|performance|requestIdleCallback)\b/u);
  assert.doesNotMatch(`${entry}\n${shell}`, /(?:\.\.\/)*reference\//u);
});
