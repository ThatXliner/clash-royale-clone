import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createPlayableRoster, createPlayableRosterQuestionRecords } from "../../../src/content/playable-roster.js";
import { GameSession } from "../../../src/sim/game-session.js";

const archivePath = process.argv[2];
const outputPath = process.argv[3];
const stopTick = Number(process.argv[4] ?? 14_100);
assert.ok(archivePath && outputPath, "usage: node late-host-replay-profile.mjs ARCHIVE OUTPUT [STOP_TICK]");
assert.ok(Number.isSafeInteger(stopTick) && stopTick >= 600 && stopTick <= 18_000 && stopTick % 300 === 0);
const archiveText = readFileSync(archivePath, "utf8");
const archive = JSON.parse(archiveText);
const archiveSha256 = createHash("sha256").update(archiveText).digest("hex");
const transcript = new Map(archive.transportIdNormalization
  .filter(({ timeline, tick }) => timeline === "replayed" || (timeline === "primary" && tick === 0))
  .map((entry) => [entry.tick, entry]));
for (let tick = 300; tick < stopTick; tick += 300) {
  assert.ok(transcript.has(tick), `missing semantic transcript row at ${tick}`);
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
const roster = createPlayableRoster();
const deck = roster.map(({ id }) => id);
const costs = new Map(roster.map(({ cost, id }) => [id, cost]));
const profiles = new Map(roster.map((card) => [card.id, {
  airPressure: card.entities.filter(({ targetMode }) => targetMode === "ground-and-air")
    .reduce((sum, entity) => sum + entity.count * entity.damage * 1_000 / entity.hitSpeedTicks, 0),
  durability: card.entities.reduce((sum, entity) => sum + entity.count * entity.hitpoints, 0),
  groundPressure: card.entities.reduce((sum, entity) => sum + entity.count * entity.damage * 1_000 / entity.hitSpeedTicks, 0),
  range: Math.max(...card.entities.map(({ rangeMillitiles }) => rangeMillitiles)),
  speed: card.entities.reduce((sum, entity) => sum + entity.count * entity.movementMillitilesPerSecond, 0),
}]));
function exactGhSetup() {
  const questions = createPlayableRosterQuestionRecords();
  const currentRoster = createPlayableRoster();
  const battleSetup = canonical({ initialWindupTicks: { central: 0, lane: 0 }, questions, roster: currentRoster });
  const legalNorthDeployments = deck.flatMap((cardId) => [
    { cardId, point: { x: 3_500, y: 17_500 } },
    { cardId, point: { x: 14_500, y: 17_500 } },
  ]).sort((left, right) => left.cardId.localeCompare(right.cardId) || left.point.x - right.point.x);
  return canonical({ battleSetup, deck, legalNorthDeployments,
    rosterWitness: canonical({ questions, roster: currentRoster }), seed: 0,
    startingElixir: { north: 10, south: 10 }, thinkIntervalTicks: 1, thinkOffsetTicks: 0 });
}
function plannedSouthAttempt(session) {
  const state = session.state;
  const incoming = state.battle.units.filter(({ alive, position, side }) =>
    alive && side === "north" && position.y < 15_000);
  const lastSouthDeploymentTick = state.cardRuntime.history.filter(({ side }) => side === "south").at(-1)?.tick ?? 0;
  const guardRefreshDue = state.tick - lastSouthDeploymentTick >= 900;
  if (incoming.length === 0 && !guardRefreshDue) return null;
  const candidates = state.decks.south.hand.map((cardId, slot) =>
    ({ ...profiles.get(cardId), cardId, cost: costs.get(cardId), slot }))
    .sort((left, right) => right.durability - left.durability || left.speed - right.speed ||
      left.cost - right.cost || left.cardId.localeCompare(right.cardId));
  const airThreat = incoming.some(({ layer }) => layer === "air");
  const card = incoming.length === 0 ? candidates[0] : candidates
    .filter(({ cost }) => cost <= state.elixir.sides.south.amount)
    .sort((left, right) => {
      const pressure = airThreat ? "airPressure" : "groundPressure";
      return right[pressure] - left[pressure] || right.range - left.range ||
        right.durability - left.durability || left.speed - right.speed ||
        left.cost - right.cost || left.cardId.localeCompare(right.cardId);
    })[0];
  if (card === undefined || card.cost > state.elixir.sides.south.amount) return null;
  const lanes = state.battle.towers.filter(({ id }) => id.startsWith("south:lane:"));
  const nearestThreat = incoming.sort((left, right) => left.position.y - right.position.y || left.id - right.id)[0];
  const lane = nearestThreat === undefined
    ? lanes.sort((left, right) => left.hitpoints - right.hitpoints || left.id.localeCompare(right.id))[0]
    : lanes.sort((left, right) => Math.abs(left.position.x - nearestThreat.position.x) -
      Math.abs(right.position.x - nearestThreat.position.x) || left.id.localeCompare(right.id))[0];
  assert.ok(lane);
  return { cardId: card.cardId, point: { x: lane.position.x, y: lane.position.y - 2_000 }, slot: card.slot, tick: state.tick };
}
function clocked(fn) {
  const start = performance.now();
  const value = fn();
  return { value, milliseconds: performance.now() - start };
}
function firstDiff(left, right, path = "$") {
  if (Object.is(left, right)) return null;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return { path, actual: left, expected: right };
  }
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  for (const key of keys) {
    if (!(key in left) || !(key in right)) return { path: `${path}.${key}`, actual: left[key], expected: right[key] };
    const mismatch = firstDiff(left[key], right[key], `${path}.${key}`);
    if (mismatch !== null) return mismatch;
  }
  return null;
}
const session = new GameSession(exactGhSetup());
const initial = clocked(() => session.serialize());
assert.equal(session.state.tick, 0);
const archivedCheckpoint = archive.restore?.before?.sessionBytes
  ? JSON.parse(archive.restore.before.sessionBytes) : null;
const actualInitial = JSON.parse(initial.value);
const setupMismatch = archivedCheckpoint === null ? null
  : firstDiff(actualInitial.setup, archivedCheckpoint.setup, "$.setup");
console.log(JSON.stringify({ event: "setup-audit", setupMatchesArchive: setupMismatch === null,
  firstSetupDifference: setupMismatch }));
writeFileSync(outputPath, "");
console.log(JSON.stringify({ event: "start", pid: process.pid, archivePath, archiveDurationMs: archive.durationMilliseconds,
  archiveSha256, stopTick, setupSerializeMs: initial.milliseconds, setupBytes: initial.value.length,
  source: "fresh exact GH setup; semantic accepted commands replayed from archived browser transcript; no browser" }));
let lastCommandId = null;
for (let fromTick = 0; fromTick < stopTick; fromTick += 300) {
  const transcriptEntry = transcript.get(fromTick);
  assert.ok(transcriptEntry, `missing transcript row ${fromTick}`);
  const measuredPlan = clocked(() => plannedSouthAttempt(session));
  assert.deepEqual(measuredPlan.value, transcriptEntry.planned,
    `GH policy recomputation matches archived semantic command at ${fromTick}`);
  let submitMs = 0;
  if (measuredPlan.value !== null) {
    assert.equal(transcriptEntry.acceptedBrowserCommandId === null, false,
      `accepted semantic action has browser command ID at ${fromTick}`);
    lastCommandId = transcriptEntry.acceptedBrowserCommandId;
    const command = { ...measuredPlan.value, commandId: lastCommandId, type: "deploy" };
    submitMs = clocked(() => session.submitPlayerCommand(canonical(command))).milliseconds;
  } else {
    assert.equal(transcriptEntry.acceptedBrowserCommandId, null,
      `no accepted browser command when GH plan is null at ${fromTick}`);
  }
  const serialized = clocked(() => session.serialize());
  const stepChunks = [];
  for (let n = 0; n < 3; n++) {
    stepChunks.push(clocked(() => session.stepMany(100)).milliseconds);
  }
  const state = clocked(() => session.state).value;
  assert.equal(state.tick, fromTick + 300);
  let lifecyclePauseResumeMs = 0;
  if (state.tick === 300) {
    lifecyclePauseResumeMs = clocked(() => { session.pause(); session.resume(); }).milliseconds;
  }
  if (state.tick === 600 && archive.restore?.before?.sessionBytes) {
    const checkpoint = clocked(() => session.serialize());
    writeFileSync("/tmp/game-001gpvt-latehost-tick600-actual.json", checkpoint.value);
    const actual = JSON.parse(checkpoint.value);
    const mismatch = firstDiff(actual, archivedCheckpoint);
    console.log(JSON.stringify({ event: "tick600-audit", exactBytes: checkpoint.value === archive.restore.before.sessionBytes,
      actualBytes: checkpoint.value.length, expectedBytes: archive.restore.before.sessionBytes.length,
      firstDifference: mismatch }));
    assert.ok(checkpoint.value === archive.restore.before.sessionBytes,
      "fresh exact GH replay matches archived pre-rewind tick-600 session bytes");
  }
  if (state.terminal) break;
  const row = {
    event: "segment", fromTick, tick: state.tick,
    planMs: measuredPlan.milliseconds, submitMs,
    serializeMs: serialized.milliseconds, serializedBytes: serialized.value.length,
    stepChunksMs: stepChunks, stepTotalMs: stepChunks.reduce((a, b) => a + b, 0),
    stateReadMs: state.milliseconds ?? undefined,
    unitCount: state.battle.units.length,
    southHistoryCount: state.cardRuntime.history.filter(({ side }) => side === "south").length,
    commandId: lastCommandId, lifecyclePauseResumeMs, terminal: state.terminal,
    rssBytes: process.memoryUsage().rss,
  };
  const stateReadMs = clocked(() => session.state).milliseconds;
  row.stateReadMs = stateReadMs;
  appendFileSync(outputPath, `${JSON.stringify(row)}\n`);
  console.log(JSON.stringify(row));
}
const finalState = clocked(() => session.state);
console.log(JSON.stringify({ event: "done", pid: process.pid, tick: finalState.value.tick,
  finalStateReadMs: finalState.milliseconds, terminal: finalState.value.terminal }));
