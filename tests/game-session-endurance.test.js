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
const DEFENSIVE_PROFILE = new Map(ROSTER.map((card) => [card.id, {
  airPressure: card.entities.filter(({ targetMode }) => targetMode === "ground-and-air")
    .reduce((total, entity) => total + entity.count * entity.damage * 1_000 /
      entity.hitSpeedTicks, 0),
  durability: card.entities.reduce((total, entity) => total + entity.count * entity.hitpoints, 0),
  groundPressure: card.entities.reduce((total, entity) => total + entity.count * entity.damage * 1_000 /
    entity.hitSpeedTicks, 0),
  range: Math.max(...card.entities.map(({ rangeMillitiles }) => rangeMillitiles)),
  speed: card.entities.reduce((total, entity) =>
    total + entity.count * entity.movementMillitilesPerSecond, 0),
}]));

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
  const incoming = state.battle.units.filter(({ alive, position, side }) =>
    alive && side === "north" && position.y < 15_000);
  const lastSouthDeploymentTick = state.cardRuntime.history
    .filter(({ side }) => side === "south").at(-1)?.tick ?? 0;
  const guardRefreshDue = state.tick - lastSouthDeploymentTick >= 900;
  if (incoming.length === 0 && !guardRefreshDue) return false;
  const candidates = state.decks.south.hand.map((cardId, slot) =>
    ({ ...DEFENSIVE_PROFILE.get(cardId), cardId, cost: COSTS.get(cardId), slot }))
    .sort((left, right) => right.durability - left.durability || left.speed - right.speed ||
      left.cost - right.cost || left.cardId.localeCompare(right.cardId));
  const airThreat = incoming.some(({ layer }) => layer === "air");
  const card = incoming.length === 0
    ? candidates[0]
    : candidates.filter(({ cost }) => cost <= state.elixir.sides.south.amount)
      .sort((left, right) => {
        const pressure = airThreat ? "airPressure" : "groundPressure";
        return right[pressure] - left[pressure] || right.range - left.range ||
          right.durability - left.durability || left.speed - right.speed ||
          left.cost - right.cost || left.cardId.localeCompare(right.cardId);
      })[0];
  if (card === undefined || card.cost > state.elixir.sides.south.amount) return false;
  const lanes = state.battle.towers.filter(({ id }) => id.startsWith("south:lane:"));
  const nearestThreat = incoming.sort((left, right) =>
    left.position.y - right.position.y || left.id - right.id)[0];
  const lane = nearestThreat === undefined
    ? lanes.sort((left, right) => left.hitpoints - right.hitpoints ||
      left.id.localeCompare(right.id))[0]
    : lanes.sort((left, right) => Math.abs(left.position.x - nearestThreat.position.x) -
      Math.abs(right.position.x - nearestThreat.position.x) || left.id.localeCompare(right.id))[0];
  assert.ok(lane, "a threatened south lane is present in canonical tower state");
  session.submitPlayerCommand(canonical({ cardId: card.cardId, commandId,
    point: { x: lane.position.x, y: lane.position.y - 2_000 }, slot: card.slot,
    tick: state.tick, type: "deploy" }));
  return true;
}

function continueMatch(session, commandId, chunker, snapshots, metrics) {
  const initialTick = session.state.tick;
  let southAttempts = 0;
  let lastSuccessfulTick = session.state.cardRuntime.history
    .filter(({ side }) => side === "south").at(-1)?.tick ?? session.state.tick;
  while (session.state.tick < TEST_END_TICK) {
    const state = session.state;
    assert.equal(state.terminal, false,
      `match ended before tick ${TEST_END_TICK}: ${canonical({ result: state.clock.result,
        towers: state.clock.towers })}`);
    const started = performance.now();
    southAttempts += 1;
    if (deploySouth(session, commandId)) lastSuccessfulTick = session.state.tick;
    for (const ticks of chunker(commandId, SEGMENT_TICKS)) session.stepMany(ticks);
    const bytes = session.serialize(), elapsedMs = Math.round(performance.now() - started);
    assert.equal(session.state.terminal, session.state.tick === TERMINAL_TICK,
      `match ended before tick ${TEST_END_TICK}: ${canonical({ result: session.state.clock.result,
        towers: session.state.clock.towers })}`);
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
  assert.equal(southAttempts, (TEST_END_TICK - initialTick) / SEGMENT_TICKS,
    "south attempts one deterministic legal deployment decision per 300-tick segment");
  assert.equal(session.state.terminal, TEST_END_TICK === TERMINAL_TICK);
  return session;
}

test("game session endurance: active seed-zero match is bounded across chunks and restore cuts", (t) => {
  const snapshots = new Map(), metrics = [];
  const direct = continueMatch(new GameSession(setup()), 0, (unused, ticks) => [ticks],
    snapshots, metrics);
  t.diagnostic(`segments=${JSON.stringify(metrics)}`);
  const directBytes = direct.serialize(), directReplay = direct.replayBytes(), directState = direct.state;
  const activeSides = new Set(directState.cardRuntime.history.map(({ side }) => side));
  assert.ok(activeSides.has("north") && activeSides.has("south"),
    "the endurance workload retains paid active play for both sides");

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
