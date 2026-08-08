import assert from "node:assert/strict";
import test from "node:test";

import { GameAudioRuntime } from "../src/audio/game-audio-runtime.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
} from "../src/content/playable-roster.js";
import { GameSession } from "../src/sim/game-session.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function acceleratedRoster() {
  return createPlayableRoster().map((card) => ({
    ...card,
    damage: 100,
    deployTimeTicks: 0,
    firstHitTicks: 0,
    hitSpeedTicks: 1,
    hitpoints: 100,
    movementMillitilesPerSecond: 60_000,
    rangeMillitiles: 32_000,
    sightRangeMillitiles: 32_000,
    entities: card.entities.map((entity) => ({
      ...entity,
      damage: 100,
      deployTimeTicks: 0,
      firstHitTicks: 0,
      hitSpeedTicks: 1,
      hitpoints: 100,
      movementMillitilesPerSecond: 60_000,
      rangeMillitiles: 32_000,
      sightRangeMillitiles: 32_000,
    })),
  }));
}

function sessionSetup({ accelerated = false } = {}) {
  const roster = accelerated ? acceleratedRoster() : createPlayableRoster();
  const questions = createPlayableRosterQuestionRecords();
  const battleSetup = canonical({
    initialWindupTicks: { central: 0, lane: 0 },
    questions,
    roster,
  });
  const deck = roster.map(({ id }) => id);
  return canonical({
    battleSetup,
    deck,
    legalNorthDeployments: deck.map((cardId) => ({
      cardId,
      point: { x: 3_500, y: 17_500 },
    })).sort((left, right) => left.cardId.localeCompare(right.cardId)),
    rosterWitness: canonical({ questions, roster }),
    seed: "game-audio-runtime",
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 60,
    thinkOffsetTicks: 0,
  });
}

function submitPlayable(session, commandId = 1, preferredCardId = null) {
  const hand = session.state.decks.south.hand;
  const costs = new Map(JSON.parse(JSON.parse(session.serialize()).setup.battleSetup)
    .roster.map(({ cost, id }) => [id, cost]));
  const cardId = preferredCardId !== null && hand.includes(preferredCardId)
    ? preferredCardId
    : [...hand].sort((left, right) =>
      costs.get(left) - costs.get(right) || left.localeCompare(right))[0];
  const command = {
    cardId,
    commandId,
    point: { x: 6_000, y: 12_000 },
    slot: hand.indexOf(cardId),
    tick: session.state.tick,
    type: "deploy",
  };
  session.submitPlayerCommand(canonical(command));
  return command;
}

function allTrapProxy(target) {
  let calls = 0;
  const deny = () => { calls += 1; throw new Error("proxy trap executed"); };
  return {
    calls: () => calls,
    proxy: new Proxy(target, {
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
    }),
  };
}

test("game audio runtime: ordered session events render once across repeated frames", () => {
  const session = new GameSession(sessionSetup({ accelerated: true }));
  const runtime = new GameAudioRuntime(session);
  submitPlayable(session, 1, "reedsting");
  session.stepMany(30);
  const first = runtime.renderFrame();
  assert.ok(first.cues.length > 0);
  assert.ok(first.cues.some(({ family }) => family === "deploy"));
  assert.ok(first.cues.some(({ family }) => family === "attack"));
  assert.ok(first.cues.some(({ family }) => family === "launch"));
  assert.ok(first.cues.some(({ family }) => family === "impact"),
    JSON.stringify(session.replay.map(({ type }) => type)));
  assert.ok(first.cues.some(({ family }) => family === "damage"));
  assert.deepEqual(
    first.cues.map(({ sequence }) => sequence),
    first.cues.map(({ sequence }) => sequence).sort((left, right) => left - right),
  );
  assert.deepEqual(runtime.cues.map(({ family }) => family),
    first.cues.map(({ family }) => family));
  const transactionCount = runtime.state.transactionCount;
  const repeated = runtime.renderFrame();
  assert.deepEqual(repeated.cues, []);
  assert.deepEqual(repeated.starts, []);
  assert.equal(runtime.state.transactionCount, transactionCount);
  assert.equal(runtime.state.cursor, session.replay.length);
});

test("game audio runtime: restore retains prefix without replay and continues once", () => {
  const session = new GameSession(sessionSetup());
  const runtime = new GameAudioRuntime(session);
  submitPlayable(session);
  session.step();
  runtime.renderFrame();
  const cueCount = runtime.state.cueCount;
  const restoredSession = GameSession.restore(session.serialize());
  const restored = GameAudioRuntime.restore(runtime.serialize(), restoredSession);
  assert.equal(restored.state.cueCount, cueCount);
  const transactions = restored.state.transactionCount;
  assert.deepEqual(restored.renderFrame().cues, []);
  assert.equal(restored.state.transactionCount, transactions);
  restoredSession.step();
  restored.renderFrame();
  assert.equal(restored.state.cursor, restoredSession.replay.length);
  assert.equal(restored.state.cueCount >= cueCount, true);
});

test("game audio runtime: session restart creates a fresh dedupe generation", () => {
  const session = new GameSession(sessionSetup());
  const runtime = new GameAudioRuntime(session);
  runtime.setGainBasisPoints(3_333);
  runtime.setMuted(true);
  submitPlayable(session);
  session.step();
  runtime.renderFrame();
  assert.ok(runtime.state.cueCount > 0);
  for (let generation = 1; generation <= 2; generation += 1) {
    session.restart();
    const reset = runtime.renderFrame();
    assert.equal(reset.state.generation, generation);
    assert.equal(reset.state.cursor, 0);
    assert.equal(reset.state.cueCount, 0);
    assert.equal(reset.state.gainBasisPoints, 3_333);
    assert.equal(reset.state.muted, true);
    submitPlayable(session);
    session.step();
    const fresh = runtime.renderFrame();
    assert.ok(fresh.cues.some(({ family }) => family === "deploy"));
    assert.equal(fresh.cues[0].sequence, 0);
    assert.ok(fresh.starts.every(({ effectiveGainBasisPoints }) =>
      effectiveGainBasisPoints === 0));
  }
});

test("game audio runtime: mute, gain, and cleanup are deterministic", () => {
  const session = new GameSession(sessionSetup());
  const runtime = new GameAudioRuntime(session);
  assert.equal(runtime.setGainBasisPoints(2_500).gainBasisPoints, 2_500);
  assert.equal(runtime.setMuted(true).muted, true);
  const beforeRepeat = runtime.state.transactionCount;
  runtime.setGainBasisPoints(2_500);
  runtime.setMuted(true);
  assert.equal(runtime.state.transactionCount, beforeRepeat);
  submitPlayable(session);
  session.step();
  const frame = runtime.renderFrame();
  assert.ok(frame.starts.length > 0);
  assert.ok(frame.starts.every(({ effectiveGainBasisPoints }) =>
    effectiveGainBasisPoints === 0));
  const stopped = runtime.dispose();
  assert.equal(runtime.state.disposed, true);
  assert.deepEqual(runtime.dispose(), []);
  assert.equal(stopped.length >= 0, true);
  assert.throws(() => runtime.setMuted(false), /disposed/u);
  assert.throws(() => runtime.setGainBasisPoints(1), /disposed/u);
});

test("game audio runtime: terminal tower, crown, and end cues clean up once", () => {
  const session = new GameSession(sessionSetup({ accelerated: true }));
  const runtime = new GameAudioRuntime(session);
  submitPlayable(session, 1, "reedsting");
  session.stepMany(300);
  assert.equal(session.state.terminal, true);
  const frame = runtime.renderFrame();
  const families = new Set(frame.cues.map(({ family }) => family));
  assert.equal(families.has("tower"), true);
  assert.equal(families.has("crown"), true);
  assert.equal(families.has("matchEnd"), true);
  assert.equal(runtime.state.disposed, true);
  assert.equal(runtime.state.renderer.activeVoiceCount, 0);
  const restoredSession = GameSession.restore(session.serialize());
  const restored = GameAudioRuntime.restore(runtime.serialize(), restoredSession);
  assert.equal(restored.state.disposed, true);
  assert.deepEqual(restored.renderFrame().cues, []);
  const transactions = runtime.state.transactionCount;
  assert.deepEqual(runtime.renderFrame().cues, []);
  assert.equal(runtime.state.transactionCount, transactions);
});

test("game audio runtime: hostile admission and divergent restore are atomic", () => {
  const objectProxy = allTrapProxy({});
  const callableProxy = allTrapProxy(() => {});
  let revokedCalls = 0;
  const revoked = Proxy.revocable({}, {
    get() { revokedCalls += 1; throw new Error("revoked trap executed"); },
    getPrototypeOf() { revokedCalls += 1; throw new Error("revoked trap executed"); },
    ownKeys() { revokedCalls += 1; throw new Error("revoked trap executed"); },
  });
  revoked.revoke();
  for (const value of [
    objectProxy.proxy, callableProxy.proxy, revoked.proxy, {}, null, false, 0, "",
  ]) {
    assert.throws(() => new GameAudioRuntime(value), /authentic GameSession/u);
  }
  assert.equal(objectProxy.calls(), 0);
  assert.equal(callableProxy.calls(), 0);
  assert.equal(revokedCalls, 0);

  const session = new GameSession(sessionSetup());
  const runtime = new GameAudioRuntime(session);
  const beforeSession = session.serialize();
  const beforeTransactions = runtime.transactions;
  assert.throws(() => GameAudioRuntime.restore(objectProxy.proxy, session),
    /bounded canonical text/u);
  assert.equal(objectProxy.calls(), 0);
  for (const value of [objectProxy.proxy, callableProxy.proxy, revoked.proxy]) {
    assert.throws(() => GameAudioRuntime.restore(runtime.serialize(), value),
      /authentic GameSession/u);
  }
  assert.equal(objectProxy.calls(), 0);
  assert.equal(callableProxy.calls(), 0);
  assert.equal(revokedCalls, 0);
  const forged = runtime.serialize().replace('"version":1', '"version":2');
  assert.throws(() => GameAudioRuntime.restore(forged, session), /snapshot is invalid/u);
  assert.equal(session.serialize(), beforeSession);
  assert.deepEqual(runtime.transactions, beforeTransactions);

  submitPlayable(session);
  session.step();
  assert.throws(() => GameAudioRuntime.restore(runtime.serialize(), session),
    /diverges/u);
  assert.equal(runtime.state.cursor, 0);
  assert.equal(Object.isFrozen(runtime.state), true);
  assert.equal(Object.isFrozen(runtime.cues), true);
  assert.equal(Object.isFrozen(runtime.transactions), true);
});

test("game audio runtime: hostile deep and oversized JSON rejects iteratively", () => {
  const session = new GameSession(sessionSetup());
  const runtime = new GameAudioRuntime(session);
  const sessionBytes = session.serialize();
  const transactions = runtime.transactions;
  const atBoundary = `${"[".repeat(128)}0${"]".repeat(128)}`;
  const beyondBoundary = `${"[".repeat(129)}0${"]".repeat(129)}`;
  const twentyThousandLevels =
    `${"[".repeat(20_000)}0${"]".repeat(20_000)}`;
  assert.equal(new TextEncoder().encode(twentyThousandLevels).byteLength, 40_001);
  for (const [bytes, pattern] of [
    [atBoundary, /snapshot is invalid/u],
    [beyondBoundary, /graph exceeds its bound/u],
    [twentyThousandLevels, /graph exceeds its bound/u],
    [`"${"x".repeat(8 * 1_024 * 1_024)}"`, /bounded canonical text/u],
  ]) {
    let thrown;
    try { GameAudioRuntime.restore(bytes, session); }
    catch (error) { thrown = error; }
    assert.ok(thrown instanceof TypeError, String(thrown));
    assert.equal(thrown instanceof RangeError, false);
    assert.match(thrown.message, pattern);
    assert.equal(session.serialize(), sessionBytes);
    assert.deepEqual(runtime.transactions, transactions);
  }
});
