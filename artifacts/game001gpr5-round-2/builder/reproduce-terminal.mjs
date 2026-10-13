import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createPlayableRoster } from "../../../src/content/playable-roster.js";
import { GameSession } from "../../../src/sim/game-session.js";

const here = new URL("./", import.meta.url);
const data = JSON.parse(readFileSync(new URL("fresh-failed-transcript.json", here), "utf8"));
const roster = createPlayableRoster();
const costs = new Map(roster.map(({ id, cost }) => [id, cost]));
const defensive = new Map(roster.map((card) => [card.id, {
  airPressure: card.entities.filter(({ targetMode }) => targetMode === "ground-and-air")
    .reduce((sum, entity) => sum + entity.count * entity.damage * 1_000 / entity.hitSpeedTicks, 0),
  durability: card.entities.reduce((sum, entity) => sum + entity.count * entity.hitpoints, 0),
  groundPressure: card.entities.reduce((sum, entity) => sum + entity.count * entity.damage * 1_000 / entity.hitSpeedTicks, 0),
  range: Math.max(...card.entities.map(({ rangeMillitiles }) => rangeMillitiles)),
  speed: card.entities.reduce((sum, entity) => sum + entity.count * entity.movementMillitilesPerSecond, 0),
}]));
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function plannedSouthAttempt(session) {
  const state = session.state;
  const incoming = state.battle.units.filter(({ alive, position, side }) =>
    alive && side === "north" && position.y < 15_000);
  const lastSouthDeploymentTick = state.cardRuntime.history
    .filter(({ side }) => side === "south").at(-1)?.tick ?? 0;
  const guardRefreshDue = state.tick - lastSouthDeploymentTick >= 900;
  if (incoming.length === 0 && !guardRefreshDue) return null;
  const candidates = state.decks.south.hand.map((cardId, slot) =>
    ({ ...defensive.get(cardId), cardId, cost: costs.get(cardId), slot }))
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
  if (card === undefined || card.cost > state.elixir.sides.south.amount) return null;
  const lanes = state.battle.towers.filter(({ id }) => id.startsWith("south:lane:"));
  const nearestThreat = incoming.sort((left, right) =>
    left.position.y - right.position.y || left.id - right.id)[0];
  const lane = nearestThreat === undefined
    ? lanes.sort((left, right) => left.hitpoints - right.hitpoints || left.id.localeCompare(right.id))[0]
    : lanes.sort((left, right) => Math.abs(left.position.x - nearestThreat.position.x) -
      Math.abs(right.position.x - nearestThreat.position.x) || left.id.localeCompare(right.id))[0];
  assert.ok(lane);
  return { cardId: card.cardId, point: { x: lane.position.x, y: lane.position.y - 2_000 }, slot: card.slot, tick: state.tick };
}

assert.equal(data.segments.at(-1).tick, 13_352);
assert.equal(data.transportIdNormalization.at(-1).tick, 13_200);
const session = GameSession.restore(data.restore.after.sessionBytes);
assert.equal(session.state.tick, data.restore.rewindToTick);
const checkpointHash = hash(session.serialize());
let firstTerminalTick = session.state.terminal ? session.state.tick : null;
let accepted = 0;
let steps = 0;
for (let recordIndex = 2; recordIndex < data.transportIdNormalization.length; recordIndex += 1) {
  const record = data.transportIdNormalization[recordIndex];
  const segment = data.segments[recordIndex];
  assert.equal(record.timeline, "replayed");
  assert.equal(session.state.tick, record.tick);
  if (record.normalized !== null) {
    const command = { ...record.normalized, commandId: record.acceptedBrowserCommandId, type: "deploy" };
    assert.equal(session.submitPlayerCommand(canonical(command)).accepted, true);
    accepted += 1;
  }
  for (const chunk of segment.chunks) {
    assert.equal(session.state.tick, chunk.fromTick);
    const wasTerminal = session.state.terminal;
    session.stepMany(chunk.sessionTick - chunk.fromTick);
    steps += session.state.tick - chunk.fromTick;
    if (!wasTerminal && session.state.terminal && firstTerminalTick === null) firstTerminalTick = session.state.tick;
    assert.equal(session.state.tick, chunk.sessionTick);
  }
  if (session.state.tick === 600) {
    assert.equal(session.serialize(), data.restore.before.sessionBytes);
  }
}
assert.equal(accepted, 24, "all 24 browser-accepted deliveries are replayed after the tick-300 restore cut");
assert.equal(session.state.tick, 13_352);
assert.equal(firstTerminalTick, 13_352);
assert.equal(session.state.terminal, true);
const state = session.state;
const plan = plannedSouthAttempt(session);
let postTerminalSubmission;
try {
  session.submitPlayerCommand(canonical({ ...plan, commandId: 25, type: "deploy" }));
  postTerminalSubmission = "unexpectedly accepted";
} catch (error) {
  postTerminalSubmission = { name: error.name, message: error.message };
}
const summary = {
  replay: { source: "copied fresh Chrome failure transcript", restoreStartTick: data.restore.rewindToTick,
    endingTick: state.tick, transcriptRecords: data.transportIdNormalization.length,
    restoredRecordsReplayed: data.transportIdNormalization.length - 2, acceptedCommandsAfterRestore: accepted,
    simulatedTicks: steps, restoreSnapshotSha256: checkpointHash },
  terminal: { firstTerminalTick, isTerminal: state.terminal, reason: state.result?.reason ?? state.clock?.phase ?? null,
    result: state.result ?? null, crowns: state.clock?.crowns ?? null,
    towers: state.battle.towers.filter(({ id }) => id.startsWith("south:lane:"))
      .map(({ id, hitpoints }) => ({ id, hitpoints })) },
  postTerminalWorkload: {
    nextGhAttemptTick: state.tick,
    latestSouthDeployment: state.cardRuntime.history.filter(({ side }) => side === "south").at(-1) ?? null,
    southHand: state.decks.south.hand,
    southElixir: state.elixir.sides.south.amount,
    incomingNorth: state.battle.units.filter(({ alive, position, side }) =>
      alive && side === "north" && position.y < 15_000)
      .map(({ id, cardId, layer, position, hitpoints }) => ({ id, cardId, layer, position, hitpoints })),
    plannedSouthAttempt: plan,
    submitAfterTerminal: postTerminalSubmission,
  },
};
writeFileSync(new URL("terminal-replay-output.json", here), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
