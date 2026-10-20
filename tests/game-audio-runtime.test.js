import assert from "node:assert/strict";
import test from "node:test";

import {
  GAME_AUDIO_RUNTIME_MAX_ACCELERATED_CUES,
  GameAudioRuntime,
} from "../src/audio/game-audio-runtime.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
} from "../src/content/playable-roster.js";
import {
  GameSession,
  getGameSessionAudioReplay,
} from "../src/sim/game-session.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hasSourceConfidenceField(entity, field) {
  return entity.sourceConfidencePolicy?.fields.some((entry) =>
    entry.field === field) ?? false;
}

function acceleratedRoster() {
  return createPlayableRoster().map((card) => {
    if (card.entities.some(({ sourceConfidencePolicy }) =>
      sourceConfidencePolicy !== undefined)) return card;
    return {
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
    };
  });
}

function sessionSetup({ accelerated = false, stationary = false } = {}) {
  let roster = accelerated ? acceleratedRoster() : createPlayableRoster();
  if (stationary) {
    roster = roster.map((card) => {
      const hasTrackedMovement = card.entities.some((entity) =>
        hasSourceConfidenceField(entity, "movementMillitilesPerSecond"));
      return {
        ...card,
        movementMillitilesPerSecond: hasTrackedMovement
          ? card.movementMillitilesPerSecond
          : 0,
        entities: card.entities.map((entity) => ({
          ...entity,
          movementMillitilesPerSecond: hasSourceConfidenceField(
            entity, "movementMillitilesPerSecond",
          ) ? entity.movementMillitilesPerSecond : 0,
        })),
      };
    });
  }
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
    thinkIntervalTicks: stationary ? 3_600 : 60,
    thinkOffsetTicks: stationary ? 3_599 : 0,
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
  assert.equal(runtime.state.cursor, getGameSessionAudioReplay(session).length);
});

test("game audio runtime: locomotion starts require real displacement and restore exactly", () => {
  const stationarySetup = sessionSetup({ stationary: true });
  const stationary = new GameSession(stationarySetup);
  const stationaryRuntime = new GameAudioRuntime(stationary);
  const stationaryRoster = JSON.parse(JSON.parse(stationarySetup).battleSetup).roster;
  const stationaryCardIds = new Set(stationaryRoster
    .filter(({ entities }) => entities.every((entity) =>
      !hasSourceConfidenceField(entity, "movementMillitilesPerSecond")))
    .map(({ id }) => id));
  const stationaryCardId = stationary.state.decks.south.hand.find((cardId) =>
    stationaryCardIds.has(cardId));
  assert.ok(stationaryCardId, "the starting hand contains a card with stationary fixture movement");
  submitPlayable(stationary, 1, stationaryCardId);
  stationary.stepMany(120);
  assert.ok(stationary.replay.some(({ type }) => type === "session-deployed"));
  assert.equal(getGameSessionAudioReplay(stationary).some(
    ({ type }) => type === "locomotion-start"), false);
  assert.equal(stationaryRuntime.renderFrame().cues.some(
    ({ family }) => family === "movement"), false);

  const direct = new GameSession(sessionSetup());
  const chunked = new GameSession(sessionSetup());
  submitPlayable(direct);
  submitPlayable(chunked);
  direct.stepMany(180);
  chunked.stepMany(37);
  const restored = GameSession.restore(chunked.serialize());
  restored.stepMany(143);
  const directAudioReplay = getGameSessionAudioReplay(direct);
  const restoredAudioReplay = getGameSessionAudioReplay(restored);
  assert.equal(canonical(restoredAudioReplay), canonical(directAudioReplay));
  assert.equal(canonical(restored.replay), canonical(direct.replay));
  assert.deepEqual(
    directAudioReplay.filter(({ type }) => type !== "locomotion-start"),
    direct.replay,
  );
  const movementStarts = directAudioReplay.filter(
    ({ type }) => type === "locomotion-start",
  );
  assert.ok(movementStarts.length > 0);
  assert.equal(new Set(movementStarts.map(({ entityId }) => entityId)).size,
    movementStarts.length);
  const directCues = new GameAudioRuntime(direct).renderFrame().cues;
  const restoredCues = new GameAudioRuntime(restored).renderFrame().cues;
  assert.deepEqual(restoredCues, directCues);
  assert.ok(directCues.some(({ family }) => family === "movement"));
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
  assert.equal(restored.state.cursor, getGameSessionAudioReplay(restoredSession).length);
  assert.equal(restored.state.cueCount >= cueCount, true);
});

test("game audio runtime: accelerated batches are bounded and rebase is silent", () => {
  const session = new GameSession(sessionSetup({ accelerated: true }));
  const runtime = new GameAudioRuntime(session);
  submitPlayable(session, 1, "reedsting");
  session.stepMany(300);
  const accelerated = runtime.renderAcceleratedFrame();
  assert.equal(session.state.terminal, true);
  assert.equal(accelerated.cues.length, GAME_AUDIO_RUNTIME_MAX_ACCELERATED_CUES);
  assert.equal(accelerated.starts.length <= GAME_AUDIO_RUNTIME_MAX_ACCELERATED_CUES, true);
  assert.equal(accelerated.candidateCueCount > accelerated.cues.length, true);
  assert.equal(accelerated.skippedCueCount,
    accelerated.candidateCueCount - accelerated.cues.length);
  assert.equal(runtime.state.suppressedAcceleratedCueCount,
    accelerated.skippedCueCount);

  const restoredSession = GameSession.restore(session.serialize());
  const beforeRebase = runtime.state;
  const rebased = runtime.rebase(restoredSession);
  const restoredAudioReplay = getGameSessionAudioReplay(restoredSession);
  assert.equal(rebased.cursor, restoredAudioReplay.length);
  assert.equal(rebased.eventCount, restoredAudioReplay.length);
  assert.equal(rebased.projectionOffset, restoredAudioReplay.length);
  assert.equal(rebased.suppressedAcceleratedCueCount,
    beforeRebase.suppressedAcceleratedCueCount);
  const silent = runtime.renderAcceleratedFrame();
  assert.deepEqual(silent.cues, []);
  assert.deepEqual(silent.starts, []);
});

test("game audio runtime: version one snapshots restore as version two", () => {
  const session = new GameSession(sessionSetup());
  const runtime = new GameAudioRuntime(session);
  submitPlayable(session);
  session.step();
  runtime.renderFrame();
  const legacy = JSON.parse(runtime.serialize());
  delete legacy.projectionOffset;
  delete legacy.suppressedAcceleratedCueCount;
  legacy.version = 1;
  const restored = GameAudioRuntime.restore(canonical(legacy),
    GameSession.restore(session.serialize()));
  assert.equal(restored.state.cursor, getGameSessionAudioReplay(session).length);
  assert.equal(restored.state.suppressedAcceleratedCueCount, 0);
  assert.equal(JSON.parse(restored.serialize()).version, 2);
});

test("game audio runtime: rebase rejects unseen authority atomically", () => {
  const session = new GameSession(sessionSetup({ accelerated: true }));
  const runtime = new GameAudioRuntime(session);
  submitPlayable(session, 1, "reedsting");
  session.stepMany(30);
  runtime.renderFrame();
  const before = runtime.serialize();
  const later = GameSession.restore(session.serialize());
  const beforeReplay = getGameSessionAudioReplay(later).length;
  submitPlayable(later, 2);
  later.step();
  assert.equal(getGameSessionAudioReplay(later).length > beforeReplay, true);
  assert.throws(() => runtime.rebase(later), /unseen authority records/u);
  assert.equal(runtime.serialize(), before);
  assert.equal(runtime.assertRebaseable(GameSession.restore(session.serialize())), true);

  const silentlyConsumed = runtime.rebaseSilently(later);
  const laterAudioReplay = getGameSessionAudioReplay(later);
  assert.equal(silentlyConsumed.cursor, laterAudioReplay.length);
  assert.equal(silentlyConsumed.eventCount, laterAudioReplay.length,
    "unseen restore records are actually projected rather than assigned as an offset");
  assert.equal(silentlyConsumed.projectionOffset, 0);
  assert.deepEqual(runtime.renderFrame().cues, [],
    "the silent restore itself produces no retrospective audible cue burst");
  later.step();
  const continued = runtime.renderFrame();
  assert.equal(runtime.state.cursor, getGameSessionAudioReplay(later).length);
  assert.equal(new Set(continued.cues.map(({ sequence }) => sequence)).size,
    continued.cues.length, "new authority after silent restore remains deduplicated");
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

  const shadowedSession = new GameSession(sessionSetup());
  let shadowCalls = 0;
  Object.defineProperty(shadowedSession, "audioReplay", {
    configurable: true,
    get() { shadowCalls += 1; throw new Error("shadow getter executed"); },
  });
  const shadowedRuntime = new GameAudioRuntime(shadowedSession);
  submitPlayable(shadowedSession);
  shadowedSession.step();
  shadowedRuntime.renderFrame();
  assert.equal(shadowCalls, 0);

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
  const forged = runtime.serialize().replace('"version":2', '"version":3');
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
