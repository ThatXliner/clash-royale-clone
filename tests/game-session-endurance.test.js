import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { createPlayableRoster,
  createPlayableRosterQuestionRecords } from "../src/content/playable-roster.js";
import { GameSession } from "../src/sim/game-session.js";

const SEGMENT_TICKS = 300;
const TERMINAL_TICK = 18_000;
const TEST_END_TICK = process.env.GAME_SESSION_ENDURANCE_TICKS === undefined ? TERMINAL_TICK :
  Number(process.env.GAME_SESSION_ENDURANCE_TICKS);
if (!Number.isSafeInteger(TEST_END_TICK) || TEST_END_TICK < 900 ||
    TEST_END_TICK > TERMINAL_TICK || TEST_END_TICK % SEGMENT_TICKS !== 0) {
  throw new TypeError("GAME_SESSION_ENDURANCE_TICKS must be a 300-tick multiple from 900 to 18000");
}
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }
const ROSTER = createPlayableRoster(), DECK = ROSTER.map(({ id }) => id);
const COSTS = new Map(ROSTER.map(({ cost, id }) => [id, cost]));

function setup() {
  const questions = createPlayableRosterQuestionRecords(), roster = createPlayableRoster();
  const battleSetup = canonical({ initialWindupTicks: { central: 0, lane: 0 }, questions, roster });
  const legalNorthDeployments = DECK.flatMap((cardId) => [
    { cardId, point: { x: 3_500, y: 17_500 } },
    { cardId, point: { x: 14_500, y: 17_500 } },
  ]).sort((a, b) => a.cardId.localeCompare(b.cardId) || a.point.x - b.point.x);
  return canonical({ battleSetup, deck: DECK, legalNorthDeployments,
    rosterWitness: canonical({ questions, roster }), seed: 0,
    startingElixir: { north: 10, south: 10 }, thinkIntervalTicks: 1, thinkOffsetTicks: 0 });
}

function deploySouth(session, commandId) {
  const state = session.state;
  const card = state.decks.south.hand.map((cardId, slot) =>
    ({ cardId, cost: COSTS.get(cardId), slot })).sort((a, b) => a.cost - b.cost || a.slot - b.slot)
    .find(({ cost }) => cost <= state.elixir.sides.south.amount);
  if (card === undefined) return false;
  session.submitPlayerCommand(canonical({ cardId: card.cardId, commandId,
    point: { x: commandId % 2 === 0 ? 3_500 : 14_500, y: 14_500 }, slot: card.slot,
    tick: state.tick, type: "deploy" }));
  return true;
}

function continueMatch(session, commandId, chunker, snapshots, metrics) {
  let lastSuccessfulTick = session.state.cardRuntime.history
    .filter(({ side }) => side === "south").at(-1)?.tick ?? session.state.tick;
  while (session.state.tick < TEST_END_TICK) {
    assert.equal(session.state.terminal, false, `match ended before tick ${TEST_END_TICK}`);
    const started = performance.now();
    if (deploySouth(session, commandId)) lastSuccessfulTick = session.state.tick;
    for (const ticks of chunker(commandId, SEGMENT_TICKS)) session.stepMany(ticks);
    const bytes = session.serialize(), elapsedMs = Math.round(performance.now() - started);
    assert.equal(session.state.tick, (commandId + 1) * SEGMENT_TICKS);
    assert.equal(canonical(JSON.parse(bytes)), bytes);
    assert.ok(Buffer.byteLength(bytes) < 1_048_576, "session transcript snapshot remains practical");
    assert.ok(session.state.tick - lastSuccessfulTick <= 900,
      "one successful legal paid south deployment occurs in every 900-tick window");
    snapshots?.set(session.state.tick, bytes);
    const metric = { elapsedMs, snapshotBytes: Buffer.byteLength(bytes), tick: session.state.tick };
    if (metrics) assert.ok(elapsedMs < 30_000, `300-tick segment at ${metric.tick} stayed bounded`);
    metrics?.push(metric);
    if (metrics) console.log(`# endurance-segment ${canonical(metric)}`);
    commandId += 1;
  }
  assert.equal(session.state.tick, TEST_END_TICK);
  assert.equal(session.state.terminal, TEST_END_TICK === TERMINAL_TICK);
  return session;
}

test("game session endurance: active seed-zero match is bounded across chunks and restore cuts", (t) => {
  const snapshots = new Map(), metrics = [];
  const direct = continueMatch(new GameSession(setup()), 0, (unused, ticks) => [ticks],
    snapshots, metrics);
  t.diagnostic(`segments=${JSON.stringify(metrics)}`);
  const directBytes = direct.serialize(), directReplay = direct.replayBytes(), directState = direct.state;

  const chunkMetrics = [];
  const chunked = continueMatch(new GameSession(setup()), 0, (unused, ticks) =>
    ticks <= 18 ? [ticks] : [1, 17, ticks - 18], null, chunkMetrics);
  assert.equal(chunked.serialize(), directBytes);
  assert.equal(chunked.replayBytes(), directReplay);
  assert.deepEqual(chunked.state, directState);

  for (const cut of [2_100, 9_000, 17_700].filter((tick) => tick < TEST_END_TICK)) {
    const restored = GameSession.restore(snapshots.get(cut));
    continueMatch(restored, cut / SEGMENT_TICKS, (unused, ticks) => [ticks], null, []);
    assert.equal(restored.serialize(), directBytes, `snapshot bytes from ${cut}`);
    assert.equal(restored.replayBytes(), directReplay, `replay bytes from ${cut}`);
    assert.deepEqual(restored.state, directState, `authority state from ${cut}`);
  }
});
