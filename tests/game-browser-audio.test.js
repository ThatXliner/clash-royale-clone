import assert from "node:assert/strict";
import test from "node:test";

import {
  BrowserPcmAudioSink,
  createBrowserAudioContextFactoryCapability,
} from "../src/audio/browser-audio.js";
import { GameAudioRuntime } from "../src/audio/game-audio-runtime.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
} from "../src/content/playable-roster.js";
import { GameSession } from "../src/sim/game-session.js";
import { mountGameAudioControls } from "../src/ui/game-audio-controls.js";
import { mountShippedGameBrowser } from "../src/ui/game-browser-entry.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function setup() {
  const roster = createPlayableRoster();
  const questions = createPlayableRosterQuestionRecords();
  const battleSetup = canonical({
    initialWindupTicks: { central: 0, lane: 0 }, questions, roster,
  });
  const deck = roster.map(({ id }) => id);
  return canonical({
    battleSetup,
    deck,
    legalNorthDeployments: deck.map((cardId) => ({
      cardId, point: { x: 3_500, y: 17_500 },
    })).sort((left, right) => left.cardId.localeCompare(right.cardId)),
    rosterWitness: canonical({ questions, roster }),
    seed: "browser-audio",
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 60,
    thinkOffsetTicks: 0,
  });
}

function submit(session, commandId = 1) {
  const hand = session.state.decks.south.hand;
  const roster = JSON.parse(JSON.parse(session.serialize()).setup.battleSetup).roster;
  const costs = new Map(roster.map(({ cost, id }) => [id, cost]));
  const cardId = [...hand].sort((left, right) =>
    costs.get(left) - costs.get(right) || left.localeCompare(right))[0];
  session.submitPlayerCommand(canonical({
    cardId,
    commandId,
    point: { x: 6_000, y: 12_000 },
    slot: hand.indexOf(cardId),
    tick: session.state.tick,
    type: "deploy",
  }));
}

class Node {
  constructor(ownerDocument = null) {
    this.attributes = new Map();
    this.children = [];
    this.className = "";
    this.dataset = {};
    this.listeners = new Map();
    this.lookups = new Map();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.style = { setProperty() {} };
    this.textContent = "";
    this.toggle = null;
  }
  get childNodes() { return this.children; }
  get firstElementChild() { return this.children[0] ?? null; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  querySelectorAll(selector) {
    const found = this.lookups.get(selector);
    if (found !== undefined) return Array.isArray(found) ? found : [found];
    return selector === '[data-ui="audio-toggle"]' && this.toggle !== null
      ? [this.toggle] : [];
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  replaceChildren(...children) {
    for (const child of children) child.parentNode = this;
    this.children = children;
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  emit(type, event) {
    const results = [];
    for (const listener of this.listeners.get(type) ?? []) results.push(listener(event));
    return results;
  }
}

class FakeRaf {
  constructor() { this.callbacks = new Map(); this.next = 1; }
  cancelAnimationFrame = (handle) => { this.callbacks.delete(handle); };
  requestAnimationFrame = (callback) => {
    const handle = this.next;
    this.next += 1;
    this.callbacks.set(handle, callback);
    return handle;
  };
}

function shippedDom() {
  const document = {
    defaultView: { PointerEvent: class PointerEvent {} },
    createElement(name) {
      if (name !== "template") return new Node(document);
      const template = new Node(document);
      template.content = { cloneNode() {
        const shell = new Node(document);
        const arena = new Node(document);
        arena.clientHeight = 960;
        arena.clientLeft = 0;
        arena.clientTop = 0;
        arena.clientWidth = 540;
        arena.getBoundingClientRect = () =>
          ({ height: 960, left: 90, top: 108, width: 540 });
        const hand = Array.from({ length: 4 }, () => new Node(document));
        const toggle = new Node(document);
        const restart = new Node(document);
        shell.toggle = toggle;
        shell.lookups.set('[data-ui="arena"]', arena);
        shell.lookups.set('[data-ui="card-slot"]', hand);
        shell.lookups.set('[data-ui="audio-toggle"]', toggle);
        shell.lookups.set('[data-ui="restart"]', restart);
        return shell;
      } };
      return template;
    },
  };
  return { document, root: new Node(document) };
}

function fakeAudioContext({ closeRejects = false, gainFailureAt = null,
  resumeRejects = false, startFailureAt = null, suspendRejects = false } = {}) {
  const state = {
    buffers: [],
    closeCalls: 0,
    gainConnects: 0,
    gainDisconnects: 0,
    gainSetCalls: 0,
    gainValues: [],
    resumeCalls: 0,
    sources: [],
    startCalls: 0,
    suspendCalls: 0,
  };
  const context = {
    currentTime: 4.25,
    destination: {},
    close() { state.closeCalls += 1;
      return closeRejects ? Promise.reject(new Error("close rejected")) : Promise.resolve(); },
    createBuffer(channels, length, sampleRate) {
      const channel = new Float32Array(length);
      const buffer = {
        channels,
        length,
        sampleRate,
        copyToChannel(samples) { channel.set(samples); },
        get channel() { return channel; },
      };
      state.buffers.push(buffer);
      return buffer;
    },
    createBufferSource() {
      const source = {
        buffer: null,
        connectTarget: null,
        disconnected: 0,
        onended: null,
        starts: [],
        stops: [],
        connect(target) { this.connectTarget = target; },
        disconnect() { this.disconnected += 1; },
        start(time) {
          state.startCalls += 1;
          if (state.startCalls === startFailureAt) throw new Error("source start rejected");
          this.starts.push(time);
        },
        stop(time) { this.stops.push(time); },
      };
      state.sources.push(source);
      return source;
    },
    createGain() {
      return {
        connect() { state.gainConnects += 1; },
        disconnect() { state.gainDisconnects += 1; },
        gain: {
          setValueAtTime(value, time) {
            state.gainSetCalls += 1;
            if (state.gainSetCalls === gainFailureAt) {
              throw new Error("gain policy rejected");
            }
            state.gainValues.push({ time, value });
          },
        },
      };
    },
    resume() { state.resumeCalls += 1;
      return resumeRejects ? Promise.reject(new Error("resume rejected")) : Promise.resolve(); },
    suspend() { state.suspendCalls += 1;
      return suspendRejects ? Promise.reject(new Error("suspend rejected")) : Promise.resolve(); },
  };
  return { context, state };
}

function fixture(audioOptions = {}) {
  const fake = fakeAudioContext(audioOptions);
  let factoryCalls = 0;
  const browserAudio = new BrowserPcmAudioSink(
    createBrowserAudioContextFactoryCapability(() => {
      factoryCalls += 1;
      return fake.context;
    }),
  );
  const session = new GameSession(setup());
  const runtime = new GameAudioRuntime(
    session,
    browserAudio.createRuntimeSinkCapability(),
  );
  const shell = new Node();
  const toggle = new Node();
  shell.toggle = toggle;
  const controls = mountGameAudioControls(shell, browserAudio, runtime);
  return { browserAudio, controls, factoryCalls: () => factoryCalls,
    fake, runtime, session, shell, toggle };
}

test("game browser audio: first trusted gesture unlocks exactly one context", async () => {
  const value = fixture();
  assert.equal(value.factoryCalls(), 0);
  assert.equal(value.browserAudio.state.transactionCount, 1,
    "renderer output policy reaches the locked sink");
  assert.equal(await value.controls.unlock({ isTrusted: false }), false);
  assert.equal(value.factoryCalls(), 0);
  assert.equal(await value.controls.unlock({ isTrusted: true }), true);
  assert.equal(await value.controls.unlock({ isTrusted: true }), false);
  value.shell.emit("pointerdown", { isTrusted: true });
  assert.equal(value.factoryCalls(), 1);
  assert.equal(value.fake.state.resumeCalls, 1);
  assert.equal(value.fake.state.gainConnects, 1);
  assert.equal(value.browserAudio.state.unlockCount, 1);
});

test("game browser audio: cues create real buffers and sources only after unlock", async () => {
  const value = fixture();
  submit(value.session);
  value.session.step();
  value.runtime.renderFrame();
  assert.equal(value.fake.state.sources.length, 0, "locked cues are not played later");
  await value.controls.unlock({ isTrusted: true });
  value.session.restart();
  value.runtime.renderFrame();
  submit(value.session);
  value.session.step();
  const frame = value.runtime.renderFrame();
  assert.ok(frame.starts.length > 0);
  assert.equal(value.fake.state.sources.length, frame.starts.length);
  assert.ok(value.fake.state.buffers.every(({ channel, length }) =>
    length > 0 && channel.some((sample) => sample !== 0)));
  assert.ok(value.fake.state.sources.every((source) =>
    source.starts.length === 1 && source.starts[0] === value.fake.context.currentTime));
});

test("game browser audio: toggle and gain affect active and future voices", async () => {
  const value = fixture();
  await value.controls.unlock({ isTrusted: true });
  submit(value.session);
  value.session.step();
  value.runtime.renderFrame();
  const active = value.fake.state.sources.length;
  assert.ok(active > 0);
  value.controls.setGainBasisPoints(2_500);
  assert.deepEqual(value.fake.state.gainValues.at(-1), { time: 4.25, value: 0.25 });
  value.toggle.emit("click", { isTrusted: true });
  assert.equal(value.runtime.state.muted, true);
  assert.deepEqual(value.fake.state.gainValues.at(-1), { time: 4.25, value: 0 });
  assert.equal(value.toggle.attributes.get("aria-pressed"), "true");
  assert.equal(value.toggle.attributes.get("aria-label"), "Unmute audio");
  value.toggle.emit("click", { isTrusted: true });
  assert.equal(value.runtime.state.muted, false);
  assert.deepEqual(value.fake.state.gainValues.at(-1), { time: 4.25, value: 0.25 });
  value.session.restart();
  value.runtime.renderFrame();
  submit(value.session);
  value.session.step();
  value.runtime.renderFrame();
  assert.ok(value.fake.state.sources.length > active);
  assert.ok(value.fake.state.sources.slice(active).every(({ connectTarget }) =>
    connectTarget !== null));
});

test("game browser audio: disposal stops voices, disconnects, closes, and unbinds once", async () => {
  const value = fixture();
  await value.controls.unlock({ isTrusted: true });
  submit(value.session);
  value.session.step();
  value.runtime.renderFrame();
  const sources = [...value.fake.state.sources];
  assert.equal(value.controls.dispose(), true);
  assert.equal(value.controls.dispose(), false);
  assert.ok(sources.every((source) => source.stops.length === 1));
  assert.ok(sources.every((source) => source.disconnected === 1));
  assert.equal(value.fake.state.gainDisconnects, 1);
  assert.equal(value.fake.state.closeCalls, 1);
  assert.equal(value.browserAudio.state.disposed, true);
  assert.equal(value.runtime.state.disposed, true);
  assert.ok([...value.shell.listeners.values()].every((listeners) => listeners.size === 0));
  assert.ok([...value.toggle.listeners.values()].every((listeners) => listeners.size === 0));
});

test("game browser audio: session replacement preserves one sink and output policy", async () => {
  const value = fixture();
  await value.controls.unlock({ isTrusted: true });
  value.controls.setGainBasisPoints(2_500);
  value.toggle.emit("click", { isTrusted: true });
  submit(value.session);
  value.session.step();
  value.runtime.renderFrame();
  const oldSources = value.fake.state.sources.length;
  const replacement = new GameSession(setup());
  const state = value.runtime.restart(replacement);
  assert.equal(state.generation, 1);
  assert.equal(state.gainBasisPoints, 2_500);
  assert.equal(state.muted, true);
  assert.equal(value.factoryCalls(), 1);
  assert.equal(value.browserAudio.state.activeVoiceCount, 0);
  submit(replacement);
  replacement.step();
  value.runtime.renderFrame();
  assert.ok(value.fake.state.sources.length > oldSources);
  assert.equal(value.fake.state.gainValues.at(-1).value, 0);
});

test("game browser audio: shipped entry mounts, renders, restores, and disposes one sink", async () => {
  const dom = shippedDom();
  const scheduler = new FakeRaf();
  const fake = fakeAudioContext();
  let factoryCalls = 0;
  const browser = mountShippedGameBrowser(
    dom.root,
    scheduler,
    new GameSession(setup()),
    () => { factoryCalls += 1; return fake.context; },
  );
  const shell = dom.root.firstElementChild;
  assert.equal(factoryCalls, 0);
  await Promise.all(shell.emit("pointerdown", { isTrusted: true }));
  assert.equal(factoryCalls, 1);
  submit(browser.session);
  browser.stepMany(1);
  assert.ok(fake.state.sources.length > 0);
  const snapshot = browser.serialize();
  const previousSession = browser.session;
  browser.stepMany(1);
  browser.restore(snapshot);
  assert.notEqual(browser.session, previousSession);
  assert.equal(browser.audio.audio.unlockCount, 1);
  assert.equal(browser.dispose(), true);
  assert.equal(browser.dispose(), false);
  assert.equal(fake.state.closeCalls, 1);
  assert.equal(scheduler.callbacks.size, 0);
});

test("game browser audio: a later source failure rolls back and faults the whole transaction", async () => {
  const value = fixture({ startFailureAt: 2 });
  await value.controls.unlock({ isTrusted: true });
  submit(value.session);
  value.session.step();
  assert.throws(() => value.runtime.renderFrame(), /source start rejected/u);
  assert.equal(value.fake.state.sources.length, 2, "the second source is the failure point");
  assert.equal(value.fake.state.sources[0].starts.length, 1);
  assert.equal(value.fake.state.sources[1].starts.length, 0);
  assert.ok(value.fake.state.sources.every((source) => source.stops.length === 1));
  assert.ok(value.fake.state.sources.every((source) => source.disconnected === 1));
  assert.equal(value.browserAudio.state.activeVoiceCount, 0);
  assert.equal(value.browserAudio.state.faulted, true);
  assert.equal(value.browserAudio.state.transactionCount, 2);
  assert.equal(value.runtime.state.renderer.faulted, true);
  assert.equal(value.runtime.state.renderer.faultTransactionId, 2);
  assert.equal(value.runtime.state.transactionCount, 1);
  assert.deepEqual(value.runtime.transactions.map(({ transactionId }) => transactionId), [1]);
  assert.throws(() => value.runtime.renderFrame(), /permanently faulted/u);
  assert.throws(() => value.browserAudio.unlock({ isTrusted: true }), /permanently faulted/u);
  assert.throws(() => value.controls.dispose(), /cleanup failed/u);
  assert.equal(value.controls.dispose(), false);
  assert.equal(value.browserAudio.state.disposed, true);
  assert.equal(value.fake.state.suspendCalls, 1);
  assert.equal(value.fake.state.closeCalls, 1);
});

async function assertRejectedOutputPolicy(kind) {
  const value = fixture({ gainFailureAt: 2 });
  await value.controls.unlock({ isTrusted: true });
  submit(value.session);
  value.session.step();
  value.runtime.renderFrame();
  const sources = [...value.fake.state.sources];
  assert.ok(sources.length > 0, `${kind} failure must exercise current voices`);
  const committedTransactions = value.runtime.transactions.map(({ transactionId }) =>
    transactionId);
  assert.deepEqual(committedTransactions, [1, 2]);
  const apply = kind === "gain"
    ? () => value.runtime.setGainBasisPoints(2_500)
    : () => value.runtime.setMuted(true);
  assert.throws(apply, /gain policy rejected/u);
  assert.deepEqual({
    gainBasisPoints: value.browserAudio.state.gainBasisPoints,
    muted: value.browserAudio.state.muted,
  }, { gainBasisPoints: 10_000, muted: false });
  assert.deepEqual({
    gainBasisPoints: value.runtime.state.gainBasisPoints,
    muted: value.runtime.state.muted,
  }, { gainBasisPoints: 10_000, muted: false });
  assert.deepEqual({
    gainBasisPoints: value.runtime.state.renderer.gainBasisPoints,
    muted: value.runtime.state.renderer.muted,
  }, { gainBasisPoints: 10_000, muted: false });
  assert.deepEqual(value.runtime.transactions.map(({ transactionId }) => transactionId), [1, 2],
    "the backend must not commit the rejected output transaction");
  assert.equal(value.runtime.state.transactionCount, 2);
  assert.equal(value.runtime.state.renderer.faultTransactionId, 3);
  assert.equal(value.browserAudio.state.transactionCount, 3);
  assert.equal(value.browserAudio.state.activeVoiceCount, 0);
  assert.equal(value.browserAudio.state.faulted, true);
  assert.ok(sources.every((source) => source.stops.length === 1));
  assert.ok(sources.every((source) => source.disconnected === 1));
  assert.deepEqual(value.fake.state.gainValues, [{ time: 4.25, value: 1 }],
    "the rejected policy must not appear in the Web Audio transaction log");
  const sourceCount = value.fake.state.sources.length;
  assert.throws(() => value.runtime.renderFrame(), /permanently faulted/u);
  assert.throws(apply, /permanently faulted/u);
  assert.equal(value.fake.state.sources.length, sourceCount,
    "faulted policy cannot create future voices");
  assert.throws(() => value.controls.dispose(), /cleanup failed/u);
  assert.equal(value.controls.dispose(), false);
}

test("game browser audio: rejected gain policy retains exact committed state", async () => {
  await assertRejectedOutputPolicy("gain");
});

test("game browser audio: rejected mute policy retains exact committed state", async () => {
  await assertRejectedOutputPolicy("mute");
});

test("game browser audio: rejected resume, suspend, and close promises are all observed", async () => {
  const unhandled = [];
  const onUnhandled = (error) => { unhandled.push(error); };
  process.on("unhandledRejection", onUnhandled);
  try {
    const failedUnlock = fixture({ closeRejects: true, resumeRejects: true,
      suspendRejects: true });
    await assert.rejects(
      failedUnlock.controls.unlock({ isTrusted: true }),
      /resume rejected/u,
    );
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(failedUnlock.fake.state.resumeCalls, 1);
    assert.equal(failedUnlock.fake.state.suspendCalls, 1);
    assert.equal(failedUnlock.fake.state.closeCalls, 1);
    assert.equal(failedUnlock.browserAudio.state.faulted, true);
    assert.equal(failedUnlock.controls.dispose(), true);
    assert.equal(failedUnlock.controls.dispose(), false);

    const failedCleanup = fixture({ closeRejects: true, suspendRejects: true });
    await failedCleanup.controls.unlock({ isTrusted: true });
    assert.equal(failedCleanup.controls.dispose(), true);
    assert.equal(failedCleanup.controls.dispose(), false);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(failedCleanup.fake.state.suspendCalls, 1);
    assert.equal(failedCleanup.fake.state.closeCalls, 1);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("game browser audio: hostile environment admission is callback-atomic", async () => {
  let traps = 0;
  const deny = () => { traps += 1; throw new Error("proxy trap executed"); };
  const proxy = new Proxy(() => {}, {
    apply: deny, get: deny, getOwnPropertyDescriptor: deny, getPrototypeOf: deny,
    ownKeys: deny,
  });
  const capability = createBrowserAudioContextFactoryCapability(proxy);
  const browserAudio = new BrowserPcmAudioSink(capability);
  assert.equal(traps, 0);
  assert.equal(await browserAudio.unlock({ isTrusted: false }), false);
  assert.equal(traps, 0);
  await assert.rejects(browserAudio.unlock({ isTrusted: true }), /proxy trap executed/u);
  assert.equal(traps, 1);
  assert.equal(browserAudio.state.faulted, true);

  const hostileToken = new Proxy({}, {
    get: deny, getPrototypeOf: deny, ownKeys: deny,
  });
  assert.throws(() => new BrowserPcmAudioSink(hostileToken), /capability is invalid/u);
  assert.equal(traps, 1);

  const broken = fakeAudioContext();
  const originalCreateGain = broken.context.createGain;
  broken.context.createGain = () => {
    const gain = originalCreateGain();
    gain.gain.setValueAtTime = () => { throw new Error("gain setup failed"); };
    return gain;
  };
  const brokenSink = new BrowserPcmAudioSink(
    createBrowserAudioContextFactoryCapability(() => broken.context),
  );
  await assert.rejects(brokenSink.unlock({ isTrusted: true }), /gain setup failed/u);
  assert.equal(broken.state.gainDisconnects, 1);
  assert.equal(broken.state.closeCalls, 1);
  assert.equal(brokenSink.state.faulted, true);

  const admissionFake = fakeAudioContext();
  const admissionSink = new BrowserPcmAudioSink(
    createBrowserAudioContextFactoryCapability(() => admissionFake.context),
  );
  const admissionRuntime = new GameAudioRuntime(
    new GameSession(setup()),
    admissionSink.createRuntimeSinkCapability(),
  );
  const admissionShell = new Node();
  admissionShell.toggle = new Node();
  const add = admissionShell.addEventListener;
  let addCalls = 0;
  admissionShell.addEventListener = function failingAdd(type, listener) {
    add.call(this, type, listener);
    addCalls += 1;
    if (addCalls === 3) throw new Error("listener admission failed");
  };
  assert.throws(
    () => mountGameAudioControls(admissionShell, admissionSink, admissionRuntime),
    /listener admission failed/u,
  );
  assert.ok([...admissionShell.listeners.values()].every((listeners) => listeners.size === 0));
  assert.equal(admissionShell.toggle.listeners.size, 0);
  assert.equal(admissionRuntime.state.disposed, false);
  assert.equal(admissionSink.state.disposed, false);
  admissionRuntime.dispose();
  admissionSink.dispose();
});
