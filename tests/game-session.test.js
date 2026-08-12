import assert from "node:assert/strict";
import test from "node:test";
import { DeckCycle } from "../src/sim/deck.js";
import { GAME_SESSION_MAX_SETUP_BYTES, GAME_SESSION_MAX_TRANSCRIPT,
  GameSession } from "../src/sim/game-session.js";
import { createPlayableRoster, createPlayableRosterQuestionRecords } from "../src/content/playable-roster.js";

const ROSTER = createPlayableRoster();
const DECK = ROSTER.map(({ id }) => id);
const SOUTH = { x: 3_500, y: 14_500 };
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }
const clone = (value) => JSON.parse(JSON.stringify(value));
function setup({ candidates, seed = 0, starting = 10, think = 1,
  windup = { central: 0, lane: 0 } } = {}) {
  const questions = createPlayableRosterQuestionRecords(), roster = createPlayableRoster();
  const battleSetup = canonical({ initialWindupTicks: windup, questions, roster });
  const legalNorthDeployments = candidates ?? DECK.flatMap((cardId) => [
    { cardId, point: { x: 3_500, y: 17_500 } },
    { cardId, point: { x: 14_500, y: 17_500 } },
  ]).sort((a, b) => a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : a.point.x - b.point.x);
  return canonical({ battleSetup, deck: DECK, legalNorthDeployments,
    rosterWitness: canonical({ questions, roster }), seed,
    startingElixir: { north: starting, south: starting },
    thinkIntervalTicks: think, thinkOffsetTicks: 0 });
}
function command(session, commandId, tick = session.state.tick, slot = 0) {
  return canonical({ cardId: session.state.decks.south.hand[slot], commandId,
    point: SOUTH, slot, tick, type: "deploy" });
}
function nestedArrays(depth) { let value = 0;
  for (let index = 0; index < depth; index += 1) value = [value]; return value; }
function exactAsciiJsonBytes(bytes) { return `{"x":"${"a".repeat(bytes - 8)}"}`; }
function exactAstralJsonBytes(bytes) { const base = 8;
  return `{"x":"${"😀".repeat((bytes - base) / 4)}"}`; }

test("game session: one boundary commits south ingress and north proposal into one battle", () => {
  const session = new GameSession(setup());
  const southCard = session.state.decks.south.hand[0];
  session.submitPlayerCommand(command(session, 0));
  session.step();
  const commits = session.replay.filter(({ type }) => type === "session-deployed");
  assert.equal(commits.length, 2);
  assert.deepEqual(new Set(commits.map(({ side }) => side)), new Set(["north", "south"]));
  assert.ok(commits.find(({ side }) => side === "south").deployment.cardId === southCard);
  assert.equal(session.state.tick, 1);
  assert.equal(session.state.battle.tick, 1);
  assert.equal(session.state.clock.tick, 1);
  assert.equal(session.state.elixir.tick, 1);
  assert.equal(session.state.opponent.nextTick, 1);
  assert.notDeepEqual(session.state.decks.south.hand, new GameSession(setup()).state.decks.south.hand);
  assert.ok(session.state.battle.units.some(({ side }) => side === "south"));
  assert.ok(session.state.battle.units.some(({ side }) => side === "north"));
});

test("game session: both sides materialize all eight cards and repeated plays fight", () => {
  const counts = new Map(ROSTER.map(({ count, id }) => [id, count]));
  for (const cardId of DECK) {
    let seed = 0;
    for (; seed < 10_000; seed += 1) {
      if (new DeckCycle({ deck: DECK, seed: `${seed}:south` }).state.hand.includes(cardId) &&
          new DeckCycle({ deck: DECK, seed: `${seed}:north` }).state.hand.includes(cardId)) break;
    }
    const session = new GameSession(setup({ candidates: [
      { cardId, point: { x: 3_500, y: 17_500 } },
    ], seed }));
    const slot = session.state.decks.south.hand.indexOf(cardId);
    session.submitPlayerCommand(canonical({ cardId, commandId: 0, point: SOUTH,
      slot, tick: 0, type: "deploy" }));
    session.step();
    for (const side of ["north", "south"]) {
      assert.equal(session.state.battle.units.filter((unit) =>
        unit.cardId === cardId && unit.side === side).length, counts.get(cardId));
    }
  }
  const session = new GameSession(setup({ seed: "coverage" }));
  session.submitPlayerCommand(command(session, 0));
  session.stepMany(400);
  const commits = session.replay.filter(({ type }) => type === "session-deployed");
  assert.ok(commits.length >= 4);
  assert.ok(session.replay.some(({ type }) => type === "damage"));
  assert.ok(session.replay.some(({ type }) => type === "death"));
  assert.ok(session.state.battle.towers.some(({ hitpoints, side }) => side === "south" && hitpoints < 3_052));
  assert.ok(session.state.clock.crowns.north + session.state.clock.crowns.south >= 0);
});

test("game session: pause, resume, restart, chunks, and restore cuts preserve exact bytes", () => {
  const configured = setup({ seed: "chunks", think: 7 });
  const paused = new GameSession(configured); paused.stepMany(20); paused.pause();
  const frozen = paused.serialize(); assert.deepEqual(paused.stepMany(30), []);
  assert.equal(paused.serialize(), frozen); paused.resume(); paused.stepMany(10);
  const restarted = paused.restart();
  const seedZero = setup({ seed: 0, think: 7 });
  assert.deepEqual(restarted, new GameSession(seedZero).state);
  assert.equal(paused.serialize(), new GameSession(seedZero).serialize());

  const direct = new GameSession(configured); const expectedEvents = direct.stepMany(120);
  const expected = direct.serialize(), expectedState = direct.state;
  const chunked = new GameSession(configured), actual = [];
  for (const count of [1, 17, 3, 41, 58]) actual.push(...chunked.stepMany(count));
  assert.deepEqual(actual, expectedEvents); assert.equal(chunked.serialize(), expected);
  for (const cut of [0, 1, 19, 60, 119, 120]) {
    const partial = new GameSession(configured); partial.stepMany(cut);
    const restored = GameSession.restore(partial.serialize()); restored.stepMany(120 - cut);
    assert.equal(restored.serialize(), expected, `bytes ${cut}`);
    assert.deepEqual(restored.state, expectedState, `state ${cut}`);
  }
});

test("game session: append-only transcript witness stays canonical across isolated ticks", () => {
  const configured = setup({ seed: "cached-transcript", think: 7 });
  const session = new GameSession(configured);
  for (let tick = 0; tick < 48; tick += 1) {
    if (tick === 12) session.submitPlayerCommand(command(session, 0));
    if (tick === 24) { session.pause(); session.resume(); }
    session.stepMany(1);
    const bytes = session.serialize();
    assert.equal(bytes, canonical(JSON.parse(bytes)), `canonical bytes at tick ${tick + 1}`);
  }
  const checkpoint = session.serialize();
  const restored = GameSession.restore(checkpoint);
  restored.stepMany(12);
  assert.equal(session.serialize(), checkpoint, "restored continuation cannot mutate source bytes");
  assert.equal(GameSession.restore(checkpoint).serialize(), checkpoint,
    "cached transcript reconstructs the exact public restore witness");
});

test("game session: full regulation/overtime/tiebreak reaches one frozen terminal result", () => {
  const session = new GameSession(setup({ candidates: [], starting: 0, think: 3_600 }));
  session.stepMany(18_000);
  assert.equal(session.state.tick, 18_000);
  assert.equal(session.state.clock.result.reason, "tiebreak_exact_tie");
  assert.deepEqual(session.state.clock.crowns, { north: 2, south: 2 });
  const terminal = session.serialize(); assert.deepEqual(session.step(), []);
  assert.equal(session.serialize(), terminal);
  assert.equal(GameSession.restore(terminal).serialize(), terminal);
});

test("game session: illegal, insufficient, stale, duplicate, and hostile inputs are atomic", () => {
  const zero = new GameSession(setup({ candidates: [], starting: 0 }));
  const bytes = zero.serialize();
  assert.throws(() => zero.submitPlayerCommand(command(zero, 0)), /unaffordable/u);
  assert.equal(zero.serialize(), bytes);
  const illegal = JSON.parse(command(new GameSession(setup()), 0)); illegal.point = { x: 0, y: 0 };
  const live = new GameSession(setup()), before = live.serialize();
  assert.throws(() => live.submitPlayerCommand(canonical(illegal)), /illegal/u);
  assert.equal(live.serialize(), before);
  live.submitPlayerCommand(command(live, 1));
  const admitted = live.serialize();
  assert.throws(() => live.submitPlayerCommand(command(live, 1)), /duplicate/u);
  assert.equal(live.serialize(), admitted);
  assert.throws(() => new GameSession({}), /canonical JSON text/u);
  assert.throws(() => GameSession.restore(` ${before}`), /canonical JSON/u);
});

test("game session: setup admission is scalar-safe, byte-exact, bounded, and non-observing", () => {
  const atAscii = exactAsciiJsonBytes(GAME_SESSION_MAX_SETUP_BYTES);
  const overAscii = exactAsciiJsonBytes(GAME_SESSION_MAX_SETUP_BYTES + 1);
  assert.throws(() => new GameSession(atAscii), (error) => !/byte bound/u.test(error.message));
  assert.throws(() => new GameSession(overAscii), /byte bound/u);
  const atAstral = exactAstralJsonBytes(GAME_SESSION_MAX_SETUP_BYTES);
  assert.throws(() => new GameSession(atAstral), (error) => !/byte bound/u.test(error.message));
  assert.throws(() => new GameSession(`${atAstral.slice(0, -1)}a}`), /byte bound/u);

  for (const hostile of ['{"x":"\ud800"}', '{"x":"\udfff"}',
    '{"\ud800":0}', '{"\udfff":0}']) {
    assert.throws(() => new GameSession(hostile), /lone surrogate/u);
  }
  for (const hostile of ['{"x":"\\ud800"}', '{"x":"\\udfff"}',
    '{"\\ud800":0}', '{"\\udfff":0}']) {
    assert.throws(() => new GameSession(hostile), /lone surrogate/u);
  }
  assert.throws(() => new GameSession(canonical({ x: nestedArrays(65) })), /depth bound/u);
  const valid = JSON.parse(setup());
  valid.battleSetup = canonical(nestedArrays(65));
  assert.throws(() => new GameSession(canonical(valid)), /battle setup exceeds its depth bound/u);
  const rosterDeep = JSON.parse(setup()); rosterDeep.rosterWitness = canonical(nestedArrays(65));
  assert.throws(() => new GameSession(canonical(rosterDeep)), /roster witness exceeds its depth bound/u);

  let callbacks = 0;
  const proxy = new Proxy({}, { get() { callbacks += 1; throw new Error("observed"); },
    ownKeys() { callbacks += 1; throw new Error("observed"); } });
  assert.throws(() => new GameSession(proxy), /canonical JSON text/u);
  assert.throws(() => GameSession.restore(proxy), /canonical JSON text/u);
  assert.equal(callbacks, 0);
});

test("game session: transcript admission and causal replay reject all supplied witnesses", () => {
  const live = new GameSession(setup({ seed: "causal", think: 7 }));
  live.submitPlayerCommand(command(live, 0)); live.stepMany(20); live.pause(); live.resume();
  const bytes = live.serialize(), snapshot = JSON.parse(bytes);
  const restored = GameSession.restore(bytes);
  assert.equal(restored.serialize(), bytes); assert.deepEqual(restored.state, live.state);
  assert.equal(restored.replayBytes(), live.replayBytes());

  for (const [field, supplied] of Object.entries({ battle: {}, clock: { crowns: { north: 3, south: 0 },
    result: { reason: "forged" }, tick: 18_000 }, controller: {}, decks: {}, elixir: {}, events: [],
    nextDeploymentSequence: 9_007_199_254_740_991, paused: true, pending: [], processed: [] })) {
    const forged = clone(snapshot); forged[field] = supplied;
    assert.throws(() => GameSession.restore(canonical(forged)), /invalid shape/u, field);
  }
  const falseTower = clone(snapshot); falseTower.towers = [{ crowns: 3, destroyed: true }];
  assert.throws(() => GameSession.restore(canonical(falseTower)), /invalid shape/u);

  const unsafeSequence = clone(snapshot);
  unsafeSequence.transcript[0].command.commandId = 9_007_199_254_740_992;
  assert.throws(() => GameSession.restore(canonical(unsafeSequence)), /non-safe integer/u);
  const uncausedPause = clone(snapshot); uncausedPause.transcript.push({ type: "pause" }, { type: "pause" });
  assert.throws(() => GameSession.restore(canonical(uncausedPause)), /uncaused pause/u);
  const uncausedResume = clone(snapshot); uncausedResume.transcript.unshift({ type: "resume" });
  assert.throws(() => GameSession.restore(canonical(uncausedResume)), /uncaused resume/u);
  const uncausedStep = JSON.parse(new GameSession(setup()).serialize());
  uncausedStep.transcript.push({ type: "pause" }, { type: "step" });
  assert.throws(() => GameSession.restore(canonical(uncausedStep)), /uncaused step/u);

  const at = canonical({ setup: snapshot.setup,
    transcript: Array.from({ length: GAME_SESSION_MAX_TRANSCRIPT }, () => ({ type: "invalid" })),
    version: 2 });
  assert.throws(() => GameSession.restore(at), /operation type/u);
  const over = canonical({ setup: snapshot.setup,
    transcript: Array.from({ length: GAME_SESSION_MAX_TRANSCRIPT + 1 }, () => ({ type: "invalid" })),
    version: 2 });
  assert.throws(() => GameSession.restore(over), /array bound/u);
  const deep = canonical({ setup: snapshot.setup, transcript: [nestedArrays(128)], version: 2 });
  assert.throws(() => GameSession.restore(deep), /depth bound/u);
});

test("game session: live simultaneous tower deaths and central terminal stop every authority exactly", () => {
  const configured = setup({ candidates: [{ cardId: "coilblade",
    point: { x: 3_500, y: 17_500 } }], seed: 2,
    windup: { central: 10_000, lane: 10_000 } });
  const admit = (session) => session.submitPlayerCommand(canonical({ cardId: "coilblade",
    commandId: 0, point: { x: 14_500, y: 14_500 },
    slot: session.state.decks.south.hand.indexOf("coilblade"), tick: 105, type: "deploy" }));

  const batch = new GameSession(configured); admit(batch);
  const batchEvents = batch.stepMany(3_000);
  assert.equal(batch.state.tick, 1_590);
  assert.deepEqual(batch.state.clock.result, { crowns: { north: 3, south: 1 },
    endedAtTick: 1_589, kind: "win", reason: "central_destroyed", winner: "north" });
  const towerDeaths = batch.replay.filter(({ type }) => type === "tower-destroyed");
  assert.deepEqual(towerDeaths.slice(0, 2), [
    { tick: 818, towerId: "north:lane:east", type: "tower-destroyed" },
    { tick: 818, towerId: "south:lane:west", type: "tower-destroyed" },
  ]);
  assert.deepEqual(towerDeaths.at(-1),
    { tick: 1_589, towerId: "south:central", type: "tower-destroyed" });
  assert.deepEqual(batchEvents.at(-1), { result: batch.state.clock.result,
    tick: 1_589, type: "match_end" });
  const terminalBytes = batch.serialize(), terminalReplay = batch.replayBytes();
  const terminalState = batch.state;
  assert.deepEqual(batch.stepMany(3_000), []);
  assert.equal(batch.serialize(), terminalBytes); assert.equal(batch.replayBytes(), terminalReplay);
  assert.deepEqual(batch.state, terminalState);

  const chunked = new GameSession(configured); admit(chunked); const chunkEvents = [];
  chunkEvents.push(...chunked.stepMany(317), ...chunked.stepMany(500));
  const cut817 = { bytes: chunked.serialize(), replay: chunked.replayBytes(), state: chunked.state };
  chunkEvents.push(...chunked.stepMany(2));
  const cut819 = { bytes: chunked.serialize(), replay: chunked.replayBytes(), state: chunked.state };
  chunkEvents.push(...chunked.stepMany(770));
  const cut1589 = { bytes: chunked.serialize(), replay: chunked.replayBytes(), state: chunked.state };
  chunkEvents.push(...chunked.stepMany(1_412));
  assert.equal(chunked.serialize(), terminalBytes); assert.equal(chunked.replayBytes(), terminalReplay);
  assert.deepEqual(chunked.state, terminalState); assert.deepEqual(chunkEvents, batchEvents);

  for (const [cut, partial] of [[817, cut817], [819, cut819]]) {
    const restored = GameSession.restore(partial.bytes);
    assert.equal(restored.serialize(), partial.bytes, `bytes at cut ${cut}`);
    assert.equal(restored.replayBytes(), partial.replay, `replay at cut ${cut}`);
    assert.deepEqual(restored.state, partial.state, `state at cut ${cut}`);
  }
  const continued = GameSession.restore(cut1589.bytes);
  const finalStepEvents = continued.step();
  assert.equal(continued.serialize(), terminalBytes); assert.equal(continued.replayBytes(), terminalReplay);
  assert.deepEqual(continued.state, terminalState);
  assert.deepEqual(finalStepEvents, batchEvents.filter(({ tick }) => tick === 1_589));
  const restoredTerminal = GameSession.restore(terminalBytes);
  assert.equal(restoredTerminal.serialize(), terminalBytes);
  assert.deepEqual(restoredTerminal.stepMany(3_000), []);
  assert.equal(restoredTerminal.serialize(), terminalBytes);
});
