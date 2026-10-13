import assert from "node:assert/strict";
import { createPlayableRoster } from "../../src/content/playable-roster.js";

const ROSTER = createPlayableRoster();
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

/**
 * The GAME-001GH seed-zero decision rule. GH names one attempt each 300 ticks;
 * the browser endurance layer names only accepted physical deliveries.
 */
export function plannedSouthAttempt(session) {
  const state = session.state;
  if (state.terminal) return null;
  const incoming = state.battle.units.filter(({ alive, position, side }) =>
    alive && side === "north" && position.y < 15_000);
  const lastSouthDeploymentTick = state.cardRuntime.history
    .filter(({ side }) => side === "south").at(-1)?.tick ?? 0;
  const guardRefreshDue = state.tick - lastSouthDeploymentTick >= 900;
  if (incoming.length === 0 && !guardRefreshDue) return null;
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
  if (card === undefined || card.cost > state.elixir.sides.south.amount) return null;
  const lanes = state.battle.towers.filter(({ id }) => id.startsWith("south:lane:"));
  const nearestThreat = incoming.sort((left, right) =>
    left.position.y - right.position.y || left.id - right.id)[0];
  const lane = nearestThreat === undefined
    ? lanes.sort((left, right) => left.hitpoints - right.hitpoints ||
      left.id.localeCompare(right.id))[0]
    : lanes.sort((left, right) => Math.abs(left.position.x - nearestThreat.position.x) -
      Math.abs(right.position.x - nearestThreat.position.x) ||
      left.id.localeCompare(right.id))[0];
  assert.ok(lane, "a threatened south lane is present in canonical tower state");
  return {
    cardId: card.cardId,
    point: { x: lane.position.x, y: lane.position.y - 2_000 },
    slot: card.slot,
    tick: state.tick,
  };
}

/** Fails the full-duration workload immediately when the natural match ends. */
export function assertEnduranceWorkloadCanContinue(session, requiredTick) {
  const state = session.state;
  if (state.terminal) {
    const result = state.clock.result;
    throw new Error(`endurance workload ended naturally at tick ${result?.endedAtTick ?? state.tick} ` +
      `before required tick ${requiredTick} (${result?.reason ?? "unknown result"}; ` +
      `${result?.winner ?? "no winner"} won)`);
  }
  return true;
}
