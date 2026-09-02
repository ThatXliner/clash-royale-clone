import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import { GameSession } from "../src/sim/game-session.js";
import { TOWER_COMBAT_CONFIG } from "../src/sim/towers.js";
import {
  serializeCombatEffectsViewModel,
} from "../src/ui/combat-effects.js";
import {
  serializeCombatViewModel,
} from "../src/ui/combat-state.js";
import {
  composeGameUiFrame,
  createGameUiFrame,
  createGameUiOptions,
  mountGameUiProjection,
} from "../src/ui/game-ui-projection.js";
import { serializeHudViewModel } from "../src/ui/hud-state.js";
import { serializeMatchFeedbackViewModel } from "../src/ui/match-feedback.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
} from "../src/content/playable-roster.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function setup({
  candidates,
  initialWindupTicks = { central: 0, lane: 0 },
  seed = "ui-projection",
  starting = 10,
  think = 1,
} = {}) {
  const roster = createPlayableRoster();
  const questions = createPlayableRosterQuestionRecords();
  const battleSetup = canonical({ initialWindupTicks, questions, roster });
  return canonical({
    battleSetup,
    deck: roster.map(({ id }) => id),
    legalNorthDeployments: candidates ?? [
      { cardId: roster[0].id, point: { x: 3_500, y: 17_500 } },
    ],
    rosterWitness: canonical({ questions, roster }),
    seed,
    startingElixir: { north: starting, south: starting },
    thinkIntervalTicks: think,
    thinkOffsetTicks: 0,
  });
}

function projectionBytes(frame) {
  return canonical({
    combat: serializeCombatViewModel(frame.combat),
    effects: serializeCombatEffectsViewModel(frame.effects),
    feedback: serializeMatchFeedbackViewModel(frame.feedback),
    hud: serializeHudViewModel(frame.hud),
    tick: frame.tick,
  });
}

class Node {
  constructor(ownerDocument, name) {
    this.attributes = new Map();
    this.children = [];
    this.className = "";
    this.dataset = {};
    this.innerHTML = "";
    this.name = name;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.style = { values: new Map(), setProperty: (key, value) => this.style.values.set(key, value) };
    this.textContent = "";
    this.throwAfterReplace = false;
    this.throwOnReplace = false;
  }
  get childNodes() { return this.children; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  replaceChildren(...children) {
    if (this.throwOnReplace) { this.throwOnReplace = false; throw new Error("hostile commit"); }
    for (const child of children) child.parentNode = this;
    this.children = children;
    if (this.throwAfterReplace) {
      this.throwAfterReplace = false;
      throw new Error("hostile mutate-then-throw commit");
    }
  }
  setAttribute(key, value) { this.attributes.set(key, value); }
}

function fixture() {
  const document = {
    createElement(name) { return new Node(document, name); },
    createElementNS(_namespace, name) { return new Node(document, name); },
  };
  return {
    document,
    layers: Object.fromEntries(["combat", "effects", "feedback", "hud"]
      .map((name) => [name, new Node(document, name)])),
  };
}

function nodeBytes(node) {
  return JSON.stringify({
    attributes: [...node.attributes].sort(),
    children: node.children.map(nodeBytes),
    className: node.className,
    dataset: Object.entries(node.dataset).sort(),
    innerHTML: node.innerHTML,
    name: node.name,
    style: [...node.style.values].sort(),
    textContent: node.textContent,
  });
}

function allBytes(layers) {
  return canonical(Object.fromEntries(Object.entries(layers)
    .map(([name, layer]) => [name, nodeBytes(layer)])));
}

function layerChildren(layers) {
  return Object.fromEntries(Object.entries(layers)
    .map(([name, layer]) => [name, [...layer.children]]));
}

function assertSameLayerChildren(layers, prior) {
  for (const name of Object.keys(prior)) {
    assert.equal(layers[name].children.length, prior[name].length, name);
    for (const [index, child] of prior[name].entries()) {
      assert.strictEqual(layers[name].children[index], child, `${name}[${index}]`);
    }
  }
}

function installHostileCommit(layer, behavior) {
  const normal = layer.replaceChildren.bind(layer);
  let first = true;
  layer.replaceChildren = (...candidate) => {
    if (!first) return normal(...candidate);
    first = false;
    if (behavior === "before") throw new Error("hostile throw before mutation");
    if (behavior === "one") {
      if (candidate.length > 0) {
        candidate[0].parentNode = layer;
        if (layer.children.length === 0) layer.children.push(candidate[0]);
        else layer.children[0] = candidate[0];
      }
      throw new Error("hostile mutate one child then throw");
    }
    if (behavior === "all") {
      for (const child of candidate) child.parentNode = layer;
      layer.children = candidate;
      throw new Error("hostile replace all then throw");
    }
    if (behavior === "empty") {
      layer.children = [];
      throw new Error("hostile candidate empty then throw");
    }
    throw new TypeError(`unknown hostile commit behavior: ${behavior}`);
  };
}

function installRestorationFailure(layer) {
  const normal = layer.replaceChildren.bind(layer);
  let calls = 0;
  layer.replaceChildren = (...candidate) => {
    calls += 1;
    if (calls === 1) {
      for (const child of candidate) child.parentNode = layer;
      layer.children = candidate;
      throw new Error("hostile commit before restoration failure");
    }
    if (calls === 2) throw new Error("hostile restoration");
    return normal(...candidate);
  };
  return () => calls;
}

function mutableProjectionSnapshot(session, originalSnapshot) {
  const originalFreeze = Object.freeze;
  Object.freeze = (value) => {
    if (value && typeof value === "object") {
      const keys = Object.keys(value).sort();
      if (keys.length === 8 &&
          keys.join(",") === "combatEffectFeed,matchFeedback,replay,sequence,setup,source,state,version") {
        return value;
      }
    }
    return originalFreeze(value);
  };
  try {
    return originalSnapshot.call(session);
  } finally {
    Object.freeze = originalFreeze;
  }
}

test("game UI projection: one authentic session frame commits all four matching ticks", () => {
  const session = new GameSession(setup());
  const initial = createGameUiFrame(session);
  assert.deepEqual([
    initial.tick, initial.hud.tick, initial.combat.tick,
    initial.effects.tick, initial.feedback.tick,
  ], [0, 0, 0, 0, 0]);
  const { layers } = fixture();
  const mounted = mountGameUiProjection(layers);
  assert.equal(mounted.project(initial), initial);
  assert.equal(layers.combat.children[0].dataset.tick, "0");
  assert.equal(layers.effects.children[0].dataset.tick, "0");
  assert.equal(layers.feedback.children[0].dataset.tick, "0");
  assert.equal(layers.hud.children[0].dataset.tick, "0");

  session.step();
  const next = createGameUiFrame(session);
  mounted.project(next);
  assert.ok(next.combat.entities.length > 0);
  for (const name of ["combat", "effects", "feedback", "hud"]) {
    assert.equal(layers[name].children[0].dataset.tick, "1", name);
  }
});

test("game UI projection: mismatched and backward canonical frames preserve every DOM byte", () => {
  const session = new GameSession(setup());
  const zero = createGameUiFrame(session);
  session.step();
  const one = createGameUiFrame(session);
  const { layers } = fixture();
  const mounted = mountGameUiProjection(layers);
  mounted.project(one);
  const before = allBytes(layers);
  const otherSession = new GameSession(setup());
  otherSession.step();
  const other = createGameUiFrame(otherSession);
  assert.throws(() => mounted.project(other), /different session/u);
  assert.equal(allBytes(layers), before);
  assert.throws(() => mounted.project(zero), /backward/u);
  assert.equal(allBytes(layers), before);
});

test("game UI projection: hostile frames and accessors execute nothing and write nothing", () => {
  const session = new GameSession(setup());
  const frame = createGameUiFrame(session);
  const { layers } = fixture();
  const mounted = mountGameUiProjection(layers);
  mounted.project(frame);
  const before = allBytes(layers);
  let calls = 0;
  const proxy = new Proxy({}, { get() { calls += 1; throw new Error("executed"); } });
  assert.throws(() => mounted.project(proxy), /canonical session frame/u);
  assert.throws(() => createGameUiFrame(proxy), /authentic GameSession/u);
  const accessor = {};
  Object.defineProperty(accessor, "tick", {
    enumerable: true,
    get() { calls += 1; throw new Error("executed"); },
  });
  assert.throws(() => composeGameUiFrame(accessor), /minted by this module/u);
  assert.equal(calls, 0);
  assert.equal(allBytes(layers), before);
});

test("game UI projection: staging and commit failures roll back all live layers", () => {
  const session = new GameSession(setup());
  const frame = createGameUiFrame(session);
  const first = fixture();
  const mounted = mountGameUiProjection(first.layers);
  mounted.project(frame);
  const before = allBytes(first.layers);
  session.step();
  const next = createGameUiFrame(session);
  const originalCreate = first.document.createElement.bind(first.document);
  let creates = 0;
  first.document.createElement = (name) => {
    if (++creates === 4) throw new Error("hostile staging");
    return originalCreate(name);
  };
  assert.throws(() => mounted.project(next), /hostile staging/u);
  assert.equal(allBytes(first.layers), before);
  first.document.createElement = originalCreate;

});

for (const failingLayer of ["combat", "effects", "feedback", "hud"]) {
  test(`game UI projection: ${failingLayer} mutate-then-throw rolls back itself and prior layers`, () => {
    const session = new GameSession(setup());
    const zero = createGameUiFrame(session);
    session.step();
    const one = createGameUiFrame(session);
    const { layers } = fixture();
    const mounted = mountGameUiProjection(layers);
    mounted.project(zero);
    const before = allBytes(layers);
    layers[failingLayer].throwAfterReplace = true;
    assert.throws(() => mounted.project(one), /mutate-then-throw/u);
    assert.equal(allBytes(layers), before);
  });
}

for (const behavior of ["before", "one", "all", "empty"]) {
  test(`game UI projection: ${behavior} host failure restores exact child identities and recovers`, () => {
    const session = new GameSession(setup());
    const zero = createGameUiFrame(session);
    session.step();
    const one = createGameUiFrame(session);
    session.step();
    const two = createGameUiFrame(session);
    const { document, layers } = fixture();
    const mounted = mountGameUiProjection(layers);
    mounted.project(zero);
    if (behavior === "one") {
      const unrelated = new Node(document, "unrelated");
      unrelated.textContent = "preserve me";
      layers.combat.appendChild(unrelated);
    }
    const prior = layerChildren(layers);
    const before = allBytes(layers);
    installHostileCommit(layers.effects, behavior);

    assert.throws(() => mounted.project(one), /hostile/u);
    assert.equal(allBytes(layers), before);
    assertSameLayerChildren(layers, prior);
    for (const name of Object.keys(layers)) {
      assert.equal(layers[name].children[0].dataset.tick, "0", name);
    }

    mounted.project(two);
    for (const name of Object.keys(layers)) {
      assert.equal(layers[name].children[0].dataset.tick, "2", name);
    }
  });
}

test("game UI projection: an empty prior DOM rolls back and accepts a later update", () => {
  const session = new GameSession(setup());
  const zero = createGameUiFrame(session);
  session.step();
  const one = createGameUiFrame(session);
  const { layers } = fixture();
  const mounted = mountGameUiProjection(layers);
  installHostileCommit(layers.effects, "empty");
  const before = allBytes(layers);
  assert.throws(() => mounted.project(zero), /hostile/u);
  assert.equal(allBytes(layers), before);
  for (const layer of Object.values(layers)) assert.equal(layer.children.length, 0);
  mounted.project(one);
  for (const name of Object.keys(layers)) {
    assert.equal(layers[name].children[0].dataset.tick, "1", name);
  }
});

test("game UI projection: restoration failure poisons the mount without later writes", () => {
  const session = new GameSession(setup());
  const zero = createGameUiFrame(session);
  session.step();
  const one = createGameUiFrame(session);
  session.step();
  const two = createGameUiFrame(session);
  const { layers } = fixture();
  const mounted = mountGameUiProjection(layers);
  mounted.project(zero);
  const calls = installRestorationFailure(layers.effects);
  assert.throws(() => mounted.project(one), /poisoned/u);
  const afterFailure = allBytes(layers);
  assert.equal(calls(), 2);
  assert.throws(() => mounted.project(two), /poisoned/u);
  assert.equal(calls(), 2);
  assert.equal(allBytes(layers), afterFailure);
  assert.equal(mounted.cleanup(), true);
  assert.equal(allBytes(layers), afterFailure);
  assert.equal(mounted.cleanup(), false);
});

test("game UI projection: composition rejects every hostile proxy class without callbacks", () => {
  let callbacks = 0;
  const handler = new Proxy({}, {
    get(_target, _key) {
      return () => { callbacks += 1; throw new Error("proxy trap executed"); };
    },
  });
  const objectProxy = new Proxy({}, handler);
  const callableProxy = new Proxy(() => {}, handler);
  const revoked = Proxy.revocable({}, handler);
  revoked.revoke();
  const crossRealmProxy = vm.runInNewContext(
    "new Proxy({}, {get(){ bump(); throw new Error('cross-realm trap executed') }, getPrototypeOf(){ bump(); throw new Error('cross-realm trap executed') }, ownKeys(){ bump(); throw new Error('cross-realm trap executed') }})",
    { bump() { callbacks += 1; } },
  );
  const accessorTarget = {};
  Object.defineProperty(accessorTarget, "tick", {
    enumerable: true,
    get() { callbacks += 1; throw new Error("accessor executed"); },
  });
  const accessorProxy = new Proxy(accessorTarget, handler);
  for (const hostile of [objectProxy, callableProxy, revoked.proxy, crossRealmProxy, accessorProxy]) {
    assert.throws(() => composeGameUiFrame(hostile), /minted by this module/u);
  }
  assert.equal(callbacks, 0);
});

test("game UI projection: options reject every hostile proxy class without callbacks", () => {
  const session = new GameSession(setup());
  let callbacks = 0;
  const handler = new Proxy({}, {
    get() { return () => { callbacks += 1; throw new Error("options trap executed"); }; },
  });
  const objectProxy = new Proxy({}, handler);
  const callableProxy = new Proxy(() => {}, handler);
  const revoked = Proxy.revocable({}, handler);
  revoked.revoke();
  const crossRealmProxy = vm.runInNewContext(
    "new Proxy({}, {get(){ bump(); throw new Error('options trap') }, getPrototypeOf(){ bump(); throw new Error('options trap') }, ownKeys(){ bump(); throw new Error('options trap') }})",
    { bump() { callbacks += 1; } },
  );
  const accessorTarget = {};
  Object.defineProperty(accessorTarget, "localSide", {
    enumerable: true,
    get() { callbacks += 1; throw new Error("options accessor executed"); },
  });
  const accessorProxy = new Proxy(accessorTarget, handler);
  for (const hostile of [objectProxy, callableProxy, revoked.proxy, crossRealmProxy, accessorProxy]) {
    assert.throws(() => createGameUiFrame(session, hostile), /minted by this module/u);
  }
  assert.equal(callbacks, 0);
});

test("game UI projection: frame creation mints once and performs zero session restores", () => {
  const session = new GameSession(setup());
  const originalRestore = GameSession.restore;
  const originalSnapshot = GameSession.prototype.projectionSnapshot;
  let restores = 0;
  let snapshots = 0;
  GameSession.restore = (...args) => { restores += 1; return originalRestore(...args); };
  GameSession.prototype.projectionSnapshot = function projectionSnapshotProbe(...args) {
    snapshots += 1;
    return originalSnapshot.call(this, ...args);
  };
  try {
    const frame = createGameUiFrame(session);
    assert.equal(frame.tick, 0);
  } finally {
    GameSession.restore = originalRestore;
    GameSession.prototype.projectionSnapshot = originalSnapshot;
  }
  assert.equal(snapshots, 1);
  assert.equal(restores, 0);
});

test("game UI projection: combat frame and mount never read raw replay authorities", () => {
  const session = new GameSession(setup());
  const originalSnapshot = GameSession.prototype.projectionSnapshot;
  const originalReplay = Object.getOwnPropertyDescriptor(GameSession.prototype, "replay");
  const originalReplayBytes = GameSession.prototype.replayBytes;
  const snapshots = [mutableProjectionSnapshot(session, originalSnapshot)];
  session.step();
  snapshots.push(mutableProjectionSnapshot(session, originalSnapshot));
  let snapshotGetterHits = 0;
  let producerGetterHits = 0;
  for (const snapshot of snapshots) {
    Object.defineProperty(snapshot, "replay", {
      configurable: true,
      enumerable: true,
      get() {
        snapshotGetterHits += 1;
        throw new Error("CRITIC: snapshot.replay was read");
      },
    });
  }
  Object.defineProperty(GameSession.prototype, "replay", {
    configurable: true,
    enumerable: false,
    get() {
      producerGetterHits += 1;
      throw new Error("CRITIC: producer replay was read");
    },
  });
  GameSession.prototype.replayBytes = function replayBytesProbe() {
    producerGetterHits += 1;
    throw new Error("CRITIC: producer replay bytes were read");
  };
  let index = 0;
  GameSession.prototype.projectionSnapshot = function hostileSnapshot() {
    return snapshots[index++];
  };
  try {
    const zero = createGameUiFrame(session);
    const one = createGameUiFrame(session);
    assert.equal(projectionBytes(zero), projectionBytes(zero));
    assert.equal(projectionBytes(one), projectionBytes(one));
    const { layers } = fixture();
    const mounted = mountGameUiProjection(layers);
    mounted.project(zero);
    mounted.project(one);
  } finally {
    GameSession.prototype.projectionSnapshot = originalSnapshot;
    if (originalReplay) Object.defineProperty(GameSession.prototype, "replay", originalReplay);
    else delete GameSession.prototype.replay;
    GameSession.prototype.replayBytes = originalReplayBytes;
  }
  assert.equal(snapshotGetterHits, 0);
  assert.equal(producerGetterHits, 0);
});

test("game UI projection: terminal feedback never reads raw producer authorities", () => {
  const configured = setup({
    candidates: [{ cardId: "coilblade", point: { x: 3_500, y: 17_500 } }],
    initialWindupTicks: { central: 10_000, lane: 10_000 },
    seed: 2,
  });
  const session = new GameSession(configured);
  session.submitPlayerCommand(canonical({
    cardId: "coilblade",
    commandId: 0,
    point: { x: 14_500, y: 14_500 },
    slot: session.state.decks.south.hand.indexOf("coilblade"),
    tick: 105,
    type: "deploy",
  }));
  session.stepMany(3_000);
  assert.equal(session.state.tick, 1_590);

  const names = ["events", "replay", "replayBytes", "state"];
  const descriptors = new Map(names.map((name) => [
    name,
    Object.getOwnPropertyDescriptor(GameSession.prototype, name),
  ]));
  const hits = Object.fromEntries(names.map((name) => [name, 0]));
  for (const name of names) {
    Object.defineProperty(GameSession.prototype, name, {
      configurable: true,
      get() {
        hits[name] += 1;
        throw new Error(`FORBIDDEN producer ${name}`);
      },
    });
  }
  try {
    const frame = createGameUiFrame(session);
    assert.equal(frame.feedback.overlay.reason, "central_destroyed");
    const { layers } = fixture();
    mountGameUiProjection(layers).project(frame);
    assert.equal(layers.feedback.children[0].dataset.tick, "1590");
  } finally {
    for (const name of names) {
      const descriptor = descriptors.get(name);
      if (descriptor) Object.defineProperty(GameSession.prototype, name, descriptor);
      else delete GameSession.prototype[name];
    }
  }
  assert.deepEqual(hits, { events: 0, replay: 0, replayBytes: 0, state: 0 });
});

test("game UI projection: tower health denominators come from the authoritative snapshot", () => {
  const session = new GameSession(setup({
    initialWindupTicks: { central: 37, lane: 19 },
  }));
  const originalSnapshot = GameSession.prototype.projectionSnapshot;
  let capturedSnapshot;
  GameSession.prototype.projectionSnapshot = function projectionSnapshotCapture(...args) {
    capturedSnapshot = originalSnapshot.call(this, ...args);
    return capturedSnapshot;
  };
  let frame;
  try {
    frame = createGameUiFrame(session);
  } finally {
    GameSession.prototype.projectionSnapshot = originalSnapshot;
  }

  const projectionTowers = new Map(capturedSnapshot.state.battle.towers
    .map((tower) => [tower.id, tower]));
  for (const tower of frame.combat.towers) {
    const projected = projectionTowers.get(tower.id);
    assert.equal(tower.healthDenominator, projected.maxHitpoints);
    assert.equal(projected.maxHitpoints, TOWER_COMBAT_CONFIG[projected.role].hitpoints);
  }
});

test("game UI projection: tick-120 live replay normalizes identically across chunks and restore", () => {
  const configured = setup();
  const direct = new GameSession(configured);
  direct.stepMany(120);
  const directFrame = createGameUiFrame(direct);
  assert.equal(directFrame.tick, 120);
  assert.ok(directFrame.effects.events.some((event) =>
    event.phase === "damage" && event.tick === 79 && event.payload.targetId > 0));

  const chunked = new GameSession(configured);
  for (const count of [1, 17, 3, 41, 58]) chunked.stepMany(count);
  assert.equal(projectionBytes(createGameUiFrame(chunked)), projectionBytes(directFrame));

  const restored = GameSession.restore(direct.serialize());
  assert.equal(projectionBytes(createGameUiFrame(restored)), projectionBytes(directFrame));
});

test("game UI projection: authentic projectile lifecycle keeps exact IDs, ticks, and order", () => {
  const configured = setup({
    candidates: [{ cardId: "copperskiff", point: { x: 3_500, y: 17_500 } }],
    initialWindupTicks: { central: 10_000, lane: 10_000 },
    seed: 3,
  });
  const session = new GameSession(configured);
  session.submitPlayerCommand(canonical({
    cardId: "copperskiff",
    commandId: 0,
    point: { x: 3_500, y: 14_500 },
    slot: session.state.decks.south.hand.indexOf("copperskiff"),
    tick: 0,
    type: "deploy",
  }));
  session.stepMany(320);
  const frame = createGameUiFrame(session);
  const feed = session.projectionSnapshot().combatEffectFeed;
  assert.deepEqual(frame.effects.events, feed.records);
  const phases = new Set(frame.effects.events.map(({ phase }) => phase));
  for (const phase of ["open", "contact", "damage", "close"]) {
    assert.equal(phases.has(phase), true, phase);
  }
  const launches = frame.effects.events.filter(({ phase }) => phase === "open");
  assert.ok(launches.length > 0);
  assert.ok(launches.every(({ payload }) => payload.projectileId !== null));
  assert.ok(frame.combat.events.some(({ type }) => type === "target"));
});

test("game UI projection: seed-2 live terminal clears dead targets and is chunk/restore exact", () => {
  const configured = setup({
    candidates: [{ cardId: "coilblade", point: { x: 3_500, y: 17_500 } }],
    initialWindupTicks: { central: 10_000, lane: 10_000 },
    seed: 2,
  });
  const admit = (session) => session.submitPlayerCommand(canonical({
    cardId: "coilblade",
    commandId: 0,
    point: { x: 14_500, y: 14_500 },
    slot: session.state.decks.south.hand.indexOf("coilblade"),
    tick: 105,
    type: "deploy",
  }));

  const direct = new GameSession(configured);
  admit(direct);
  direct.stepMany(3_000);
  const directFrame = createGameUiFrame(direct);
  assert.equal(directFrame.tick, 1_590);
  assert.equal(directFrame.feedback.overlay.reason, "central_destroyed");

  const chunked = new GameSession(configured);
  admit(chunked);
  for (const count of [317, 500, 2, 770, 1_412]) chunked.stepMany(count);
  assert.equal(projectionBytes(createGameUiFrame(chunked)), projectionBytes(directFrame));

  const restored = GameSession.restore(direct.serialize());
  assert.equal(projectionBytes(createGameUiFrame(restored)), projectionBytes(directFrame));
});

test("game UI projection: stale same-tick frame cannot replace newer selected-card bytes", () => {
  const session = new GameSession(setup());
  const stale = createGameUiFrame(session);
  const selected = session.state.decks.south.hand[0];
  const current = createGameUiFrame(session, createGameUiOptions("south", selected));
  assert.equal(stale.tick, current.tick);
  assert.notEqual(stale.sequence, current.sequence);
  assert.notDeepEqual(stale.hud, current.hud);
  const { layers } = fixture();
  const mounted = mountGameUiProjection(layers);
  mounted.project(current);
  const before = allBytes(layers);
  assert.throws(() => mounted.project(stale), /sequence must advance strictly/u);
  assert.equal(allBytes(layers), before);
});

test("game UI projection: cleanup is idempotent and rejects later projection", () => {
  const session = new GameSession(setup());
  const frame = createGameUiFrame(session);
  const { layers } = fixture();
  const mounted = mountGameUiProjection(layers);
  mounted.project(frame);
  assert.equal(mounted.cleanup(), true);
  const empty = allBytes(layers);
  assert.equal(mounted.cleanup(), false);
  assert.equal(allBytes(layers), empty);
  assert.throws(() => mounted.project(frame), /cleaned up/u);
  assert.equal(allBytes(layers), empty);
});

test("game UI projection: a real terminal session drives the match overlay at tick 18000", () => {
  const configured = JSON.parse(setup());
  configured.legalNorthDeployments = [];
  configured.startingElixir = { north: 0, south: 0 };
  configured.thinkIntervalTicks = 3_600;
  const session = new GameSession(canonical(configured));
  session.stepMany(18_000);
  const frame = createGameUiFrame(session);
  assert.equal(frame.tick, 18_000);
  assert.notEqual(frame.feedback.overlay, null);
  const { layers } = fixture();
  mountGameUiProjection(layers).project(frame);
  assert.equal(layers.feedback.children[0].dataset.tick, "18000");
  assert.ok(layers.feedback.children[0].children.some((node) =>
    node.className === "match-feedback__overlay"));
});
