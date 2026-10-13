import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createPlayableRoster, createPlayableRosterQuestionRecords } from '../../../src/content/playable-roster.js';
import { GameSession } from '../../../src/sim/game-session.js';

const root = new URL('./browser-artifacts/endurance-result.json', import.meta.url);
const data = JSON.parse(readFileSync(root, 'utf8'));
const roster = createPlayableRoster();
const costs = new Map(roster.map(({ id, cost }) => [id, cost]));
const defensive = new Map(roster.map((card) => [card.id, {
  airPressure: card.entities.filter(({ targetMode }) => targetMode === 'ground-and-air')
    .reduce((sum, entity) => sum + entity.count * entity.damage * 1_000 / entity.hitSpeedTicks, 0),
  durability: card.entities.reduce((sum, entity) => sum + entity.count * entity.hitpoints, 0),
  groundPressure: card.entities.reduce((sum, entity) => sum + entity.count * entity.damage * 1_000 / entity.hitSpeedTicks, 0),
  range: Math.max(...card.entities.map(({ rangeMillitiles }) => rangeMillitiles)),
  speed: card.entities.reduce((sum, entity) => sum + entity.count * entity.movementMillitilesPerSecond, 0),
}]));
function plannedSouthAttempt(session) {
  const state = session.state;
  const incoming = state.battle.units.filter(({ alive, position, side }) =>
    alive && side === 'north' && position.y < 15_000);
  const lastSouthDeploymentTick = state.cardRuntime.history
    .filter(({ side }) => side === 'south').at(-1)?.tick ?? 0;
  const guardRefreshDue = state.tick - lastSouthDeploymentTick >= 900;
  if (incoming.length === 0 && !guardRefreshDue) return null;
  const candidates = state.decks.south.hand.map((cardId, slot) =>
    ({ ...defensive.get(cardId), cardId, cost: costs.get(cardId), slot }))
    .sort((left, right) => right.durability - left.durability || left.speed - right.speed ||
      left.cost - right.cost || left.cardId.localeCompare(right.cardId));
  const airThreat = incoming.some(({ layer }) => layer === 'air');
  const card = incoming.length === 0
    ? candidates[0]
    : candidates.filter(({ cost }) => cost <= state.elixir.sides.south.amount)
      .sort((left, right) => {
        const pressure = airThreat ? 'airPressure' : 'groundPressure';
        return right[pressure] - left[pressure] || right.range - left.range ||
          right.durability - left.durability || left.speed - right.speed ||
          left.cost - right.cost || left.cardId.localeCompare(right.cardId);
      })[0];
  if (card === undefined || card.cost > state.elixir.sides.south.amount) return null;
  const lanes = state.battle.towers.filter(({ id }) => id.startsWith('south:lane:'));
  const nearestThreat = incoming.sort((left, right) =>
    left.position.y - right.position.y || left.id - right.id)[0];
  const lane = nearestThreat === undefined
    ? lanes.sort((left, right) => left.hitpoints - right.hitpoints || left.id.localeCompare(right.id))[0]
    : lanes.sort((left, right) => Math.abs(left.position.x - nearestThreat.position.x) -
      Math.abs(right.position.x - nearestThreat.position.x) || left.id.localeCompare(right.id))[0];
  assert.ok(lane);
  return { cardId: card.cardId, point: { x: lane.position.x, y: lane.position.y - 2_000 }, slot: card.slot, tick: state.tick };
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function hash(value) { return createHash('sha256').update(value).digest('hex'); }

const session = GameSession.restore(data.restore.after.sessionBytes);
assert.equal(session.state.tick, data.restore.rewindToTick);
const checkpointHash = hash(session.serialize());
let firstTerminalTick = session.state.terminal ? session.state.tick : null;
let commandsAccepted = 0;
let steps = 0;
const checkpoints = [];
for (let recordIndex = 2; recordIndex < data.transportIdNormalization.length; recordIndex += 1) {
  const record = data.transportIdNormalization[recordIndex];
  const segment = data.segments[recordIndex];
  assert.equal(record.timeline, 'replayed');
  assert.equal(session.state.tick, record.tick, `record ${recordIndex} starts at exact tick`);
  if (record.normalized !== null) {
    const command = { ...record.normalized, commandId: record.acceptedBrowserCommandId, type: 'deploy' };
    const result = session.submitPlayerCommand(canonical(command));
    assert.equal(result.accepted, true, `browser-accepted command ${record.acceptedBrowserCommandId} matches deterministic mirror`);
    commandsAccepted += 1;
  }
  assert.equal(segment.chunks[0].fromTick, record.tick);
  for (const chunk of segment.chunks) {
    assert.equal(session.state.tick, chunk.fromTick);
    const wasTerminal = session.state.terminal;
    session.stepMany(chunk.sessionTick - chunk.fromTick);
    steps += session.state.tick - chunk.fromTick;
    if (!wasTerminal && session.state.terminal && firstTerminalTick === null) firstTerminalTick = session.state.tick;
    assert.equal(session.state.tick, chunk.sessionTick,
      `deterministic session reproduces browser chunk ending at ${chunk.sessionTick}`);
  }
  if (session.state.tick === 600) {
    const bytesHash = hash(session.serialize());
    assert.equal(session.serialize(), data.restore.before.sessionBytes,
      'reconstructed replay branch at tick 600 equals captured browser branch bytes');
    checkpoints.push({ tick: 600, sessionBytesSha256: bytesHash, exactBrowserBranchMatch: true });
  }
}
assert.equal(session.state.tick, data.segments.at(-1).tick);
const attempt = plannedSouthAttempt(session);
const state = session.state;
const lastSouth = state.cardRuntime.history.filter(({ side }) => side === 'south').at(-1) ?? null;
const summary = {
  analysis: 'Deterministic reconstruction from the fresh browser transcript, starting at the captured 300-tick restore snapshot; no browser rerun.',
  checkpoint: { tick: data.restore.rewindToTick, sessionBytesSha256: checkpointHash, matchesCapturedRestoreAfter: true },
  reconstructedReplay: { startingTick: data.restore.rewindToTick, endingTick: state.tick, transcriptRecords: data.transportIdNormalization.length, replayedRecords: data.transportIdNormalization.length - 2, acceptedCommands: commandsAccepted, simulationSteps: steps, checkpoints },
  terminal: { firstTerminalTick, isTerminalAtFailureBoundary: state.terminal, crowns: state.clock?.crowns ?? null, clock: state.clock ?? null, towers: state.battle.towers.map(({ id, hitpoints }) => ({ id, hitpoints })), result: state.result ?? null },
  workloadAtFailureBoundary: {
    tick: state.tick, lastSouthDeployment: lastSouth, hand: state.decks.south.hand,
    elixir: state.elixir.sides.south.amount,
    incomingNorth: state.battle.units.filter(({ alive, position, side }) => alive && side === 'north' && position.y < 15_000)
      .map(({ id, cardId, layer, position, hitpoints }) => ({ id, cardId, layer, position, hitpoints })),
    plannedSouthAttempt: attempt,
    bridgeDeliveryAssertion: { before: 24, expectedAfter: 25, actualAfter: 24, source: 'raw TAP assertion from failed deliverPhysicalPlan call' },
  },
  performanceEvidence: { initializationMaxLongTaskMs: data.maxInitializationLongTaskMilliseconds, drivenMaxLongTaskMs: data.maxDrivenLongTaskMilliseconds, totalMaxLongTaskMs: data.maxLongTaskMilliseconds, segmentCount: data.segments.length, finalCompletedTick: data.segments.at(-1).tick, terminalObservationAndRestartCompleted: data.terminal !== null },
};
writeFileSync(new URL('./reconstruction.json', import.meta.url), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
