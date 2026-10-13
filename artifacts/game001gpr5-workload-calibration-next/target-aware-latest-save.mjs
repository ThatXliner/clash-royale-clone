import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createPlayableRoster, createPlayableRosterQuestionRecords } from "../../src/content/playable-roster.js";
import { getArenaGeometry } from "../../src/sim/arena-geometry.js";
import { evaluateDeployment } from "../../src/sim/deployment.js";
import { acquireTarget } from "../../src/sim/targeting.js";
import { layoutFormation } from "../../src/sim/formations.js";
import { GROUND_PATH_GRID_STEP_MILLITILES, isGroundNavigationNode } from "../../src/sim/pathfinding.js";
import { GameSession } from "../../src/sim/game-session.js";
import { plannedSouthAttempt } from "../../tests/helpers/endurance-workload.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function hash(value) { return createHash("sha256").update(value).digest("hex"); }

const REACTION_INTERVAL_TICKS = 60;
const BASELINE_INTERVAL_TICKS = 300;
const EMERGENCY_COOLDOWN_TICKS = 300;
const REQUIRED_TICK = 18_000;
const roster = createPlayableRoster();
const cards = new Map(roster.map((card) => [card.id, card]));
const questions = createPlayableRosterQuestionRecords();
const battleSetup = canonical({ initialWindupTicks: { central: 0, lane: 0 }, questions, roster });
const deck = roster.map(({ id }) => id);
const legalNorthDeployments = deck.flatMap((cardId) => [
  { cardId, point: { x: 3_500, y: 17_500 } },
  { cardId, point: { x: 14_500, y: 17_500 } },
]).sort((left, right) => left.cardId.localeCompare(right.cardId) || left.point.x - right.point.x);
const setupBytes = canonical({ battleSetup, deck, legalNorthDeployments,
  rosterWitness: canonical({ questions, roster }), seed: 0,
  startingElixir: { north: 10, south: 10 }, thinkIntervalTicks: 1, thinkOffsetTicks: 0 });
const session = new GameSession(setupBytes);
const initialLaneHitpoints = new Map(session.state.battle.towers
  .filter(({ id, role }) => id.startsWith("south:lane:") && role === "lane")
  .map(({ hitpoints, id }) => [id, hitpoints]));

// BattleCombat assigns its six tower targets from these stable numeric IDs.
// The mapping is the runtime's own TOWER_IDS mapping in the battle kernel.
const southLaneTargetIds = new Map([
  [Number.MAX_SAFE_INTEGER - 4, "south:lane:west"],
  [Number.MAX_SAFE_INTEGER - 3, "south:lane:east"],
]);
const costs = new Map(roster.map(({ cost, id }) => [id, cost]));
const arenaTowers = getArenaGeometry().towers;
let commandId = 1;
let lastEmergencyTick = -EMERGENCY_COOLDOWN_TICKS;
const attempts = [];
const observations = [];
const opportunities = { total: 0, baseline: 0, overtime: 0, emergency: 0,
  oneLaneLeft: 0, targeted: 0, inRange: 0, lethalDeadline: 0,
  feasibleCounter: 0, cooldownSuppressed: 0, committedLethal: 0 };
const significantEvents = [];

function nearestLegalOwnSidePoint(target) {
  let best = null;
  for (let x = 500; x <= 17_500; x += 250) {
    for (let y = 500; y < 15_000; y += 250) {
      const point = { x, y };
      const decision = evaluateDeployment({ side: "south", placementClass: "ground_entity",
        point, destroyedOpposingLaneTowers: [] });
      if (!decision.legal) continue;
      const distanceSquared = (target.x - x) ** 2 + (target.y - y) ** 2;
      if (best === null || distanceSquared < best.distanceSquared ||
          (distanceSquared === best.distanceSquared && y > best.point.y)) {
        best = { point, distanceSquared, reason: decision.reason };
      }
    }
  }
  return best;
}

const questionValues = new Map(questions.map(({ key, value }) => [key, value]));
const groundNodes = Object.freeze(Array.from({ length: 32 }, (_, row) =>
  Array.from({ length: 18 }, (_, column) => ({
    x: column * GROUND_PATH_GRID_STEP_MILLITILES + GROUND_PATH_GRID_STEP_MILLITILES / 2,
    y: row * GROUND_PATH_GRID_STEP_MILLITILES + GROUND_PATH_GRID_STEP_MILLITILES / 2,
  }))).flat().filter((point) => isGroundNavigationNode(point)));

function nearestGroundNode(point, occupied = new Set()) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of groundNodes) {
    if (occupied.has(`${candidate.x}:${candidate.y}`)) continue;
    const distance = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
    if (distance < bestDistance || (distance === bestDistance &&
        (candidate.y < best.y || (candidate.y === best.y && candidate.x < best.x)))) {
      best = candidate;
      bestDistance = distance;
    }
  }
  assert.ok(best, "a legal ground placement must materialize on the navigation graph");
  return best;
}

function counterTargetAcquisitions(cardId, point, state) {
  const card = cards.get(cardId);
  const expanded = card.entities.flatMap((component) => Array.from(
    { length: component.count }, () => ({ component,
      radius: questionValues.get(component.bodyRadiusPolicy.questionKey) })));
  const laidOut = layoutFormation(point, expanded.map(({ component, radius }, index) => ({
    id: index + 1, radius, role: component.role,
  })));
  const occupied = new Set();
  const enemyTroops = state.battle.units.filter(({ alive, side }) => alive && side === "north")
    .map(({ alive, id, layer, position, radius, targetable }) => ({
      alive, id, kind: "troop", layer, position, radius, targetable: targetable !== false,
    }));
  return expanded.map(({ component, radius }, index) => {
    const desired = laidOut[index].position;
    const position = component.layer === "ground" ? nearestGroundNode(desired, occupied) : desired;
    if (component.layer === "ground") occupied.add(`${position.x}:${position.y}`);
    const targetMode = component.targetMode === "ground-and-air"
      ? "air_and_ground" : component.targetMode;
    const target = acquireTarget({ position, radius }, enemyTroops, {
      mode: targetMode, sightRange: component.sightRangeMillitiles,
    });
    return { memberOrdinal: index, archetypeId: component.archetypeId,
      position, acquiredTargetId: target?.id ?? null,
      acquiredTargetCardId: target === null ? null : state.battle.units.find(({ id }) => id === target.id)?.cardId ?? null };
  });
}

function towerFootprintRadius(laneId) {
  const lane = laneId.endsWith(":west") ? "west" : "east";
  const geometry = arenaTowers.find((entry) => entry.side === "south" &&
    entry.role === "lane" && entry.lane === lane);
  assert.ok(geometry, `arena geometry must contain ${laneId}`);
  return Math.ceil(Math.hypot((geometry.bounds.maxX - geometry.bounds.minX) / 2,
    (geometry.bounds.maxY - geometry.bounds.minY) / 2));
}

function attackRangeEvidence(unit, tower) {
  const reach = unit.radius + unit.reach + towerFootprintRadius(tower.id);
  const dx = unit.position.x - tower.position.x;
  const dy = unit.position.y - tower.position.y;
  const distanceSquared = dx * dx + dy * dy;
  return { distanceSquared, reachSquared: reach * reach,
    inRange: distanceSquared <= reach * reach };
}

function entityForUnit(unit) {
  const card = cards.get(unit.cardId);
  return card?.entities.find((entity) => entity.damage === unit.damage &&
    entity.hitpoints === unit.maxHealth && entity.rangeMillitiles === unit.reach) ?? null;
}

function moveToward(origin, destination, distance) {
  const dx = destination.x - origin.x;
  const dy = destination.y - origin.y;
  const length = Math.hypot(dx, dy);
  if (length === 0 || distance === 0) return origin;
  const moved = Math.min(length, distance);
  return { x: Math.round(origin.x + dx * moved / length),
    y: Math.round(origin.y + dy * moved / length) };
}

function projectedTowerAttack(state, lane, targetId, unit) {
  if (unit.targetId !== targetId || unit.damage <= 0) return null;
  const range = attackRangeEvidence(unit, lane);
  const attack = unit.attack;
  const currentCycle = attack.targetId === targetId &&
    (attack.phase === "winding" || attack.phase === "cycling") && range.inRange &&
    attack.nextAttackTick !== null;
  let firstLaunchTick;
  let positionAtFirstLaunch;
  let basis;
  if (currentCycle) {
    const ticksUntilLaunch = attack.nextAttackTick - attack.nextTick;
    if (ticksUntilLaunch < 0) return null;
    firstLaunchTick = state.tick + ticksUntilLaunch;
    positionAtFirstLaunch = unit.position;
    basis = "observed-active-cycle-and-in-range";
  } else {
    const entity = entityForUnit(unit);
    if (entity === null) return null;
    const towerReach = unit.radius + unit.reach + towerFootprintRadius(lane.id);
    const currentDistance = Math.hypot(unit.position.x - lane.position.x,
      unit.position.y - lane.position.y);
    const approachDistance = Math.max(0, currentDistance - towerReach);
    const approachTicks = Math.ceil(approachDistance * 60 /
      Math.max(entity.movementMillitilesPerSecond, 1));
    const remainingDeployTicks = attack.phase === "deploying"
      ? Math.max(0, attack.config.deployTicks - attack.nextTick)
      : 0;
    const approachOrDeployTicks = Math.max(approachTicks, remainingDeployTicks);
    firstLaunchTick = state.tick + approachOrDeployTicks + attack.config.firstHitTicks;
    const projectedMove = entity.movementMillitilesPerSecond *
      (firstLaunchTick - state.tick) / 60;
    positionAtFirstLaunch = moveToward(unit.position, lane.position, projectedMove);
    basis = "projected-from-current-tower-target-deploy-and-roster-movement";
  }
  const travelTicks = unit.delivery === "projectile"
    ? Math.ceil(Math.max(0, Math.hypot(positionAtFirstLaunch.x - lane.position.x,
      positionAtFirstLaunch.y - lane.position.y) - towerFootprintRadius(lane.id)) /
      Math.max(unit.projectileSpeed ?? 0, 1))
    : 0;
  return { unit, basis, firstLaunchTick, firstImpactTick: firstLaunchTick + travelTicks,
    travelTicks, positionAtFirstLaunch, currentRange: range,
    activeTicksUntilNextAttack: currentCycle ? attack.nextAttackTick - attack.nextTick : null,
    approachTicks: currentCycle ? 0 : firstLaunchTick - state.tick -
      Math.max(attack.config.firstHitTicks,
        attack.phase === "deploying" ? Math.max(0, attack.config.deployTicks - attack.nextTick) : 0),
    remainingDeployTicks: currentCycle ? 0 : attack.phase === "deploying"
      ? Math.max(0, attack.config.deployTicks - attack.nextTick) : 0,
  };
}

function attackSchedule(state, lane, targetId, threats) {
  const scheduled = state.battle.projectiles.filter(({ direction, targetId: id }) =>
    direction === "unit-to-tower" && id === targetId).map(({ damage, impactTick, sourceId }) =>
      ({ damage, impactTick, launchTick: null, sourceId, source: "launched-projectile" }));
  const activeThreats = threats.map((unit) => projectedTowerAttack(state, lane, targetId, unit))
    .filter(Boolean);
  for (const estimate of activeThreats) {
    const { unit } = estimate;
    const firstLaunchTick = estimate.firstLaunchTick;
    const requiredCycles = Math.ceil(lane.hitpoints / unit.damage) + 1;
    for (let index = 0; index < requiredCycles; index += 1) {
      const launchTick = firstLaunchTick + index * unit.attack.config.hitSpeedTicks;
      scheduled.push({ damage: unit.damage,
        impactTick: launchTick + estimate.travelTicks, launchTick,
        sourceId: unit.id, source: estimate.basis });
    }
  }
  scheduled.sort((left, right) => left.impactTick - right.impactTick ||
    left.sourceId - right.sourceId || left.source.localeCompare(right.source));
  let damage = 0;
  let lethalIndex = -1;
  for (let index = 0; index < scheduled.length; index += 1) {
    damage += scheduled[index].damage;
    if (damage >= lane.hitpoints) { lethalIndex = index; break; }
  }
  return { activeThreats, scheduled, lethalIndex,
    lethalDeadline: lethalIndex < 0 ? null : scheduled[lethalIndex].impactTick };
}

function estimateCounter(cardId, slot, target, state, point) {
  const card = cards.get(cardId);
  if (card.kind !== "unit") return null;
  const eligibleEntities = card.entities.filter((entity) => entity.damage > 0 &&
    entity.movementMillitilesPerSecond > 0 &&
    (entity.targetMode === "ground-and-air" ||
      (target.layer === "ground" && entity.targetMode === "ground") ||
      (target.layer === "air" && entity.targetMode === "air")));
  if (eligibleEntities.length === 0) return null;
  const attackImpacts = [];
  const componentEvidence = [];
  const spacingTicks = card.entities.some((entity) =>
    entity.sourceConfidencePolicy?.deploymentInterval?.ticks === 6) ? 6 : 0;
  let globalOrdinal = 0;
  for (const entity of card.entities) {
    const firstOrdinal = globalOrdinal;
    globalOrdinal += entity.count;
    if (!eligibleEntities.includes(entity)) continue;
    const distance = Math.hypot(target.position.x - point.x, target.position.y - point.y);
    const approachDistance = Math.max(0, distance - target.radius - entity.rangeMillitiles);
    const approachTicks = Math.ceil(approachDistance * 60 /
      entity.movementMillitilesPerSecond);
    const impacts = [];
    for (let member = 0; member < entity.count; member += 1) {
      const ordinalDelay = spacingTicks === 0 ? 0 : (firstOrdinal + member) * spacingTicks;
      const firstHitTick = state.tick + entity.deployTimeTicks + ordinalDelay +
        approachTicks + entity.firstHitTicks;
      const requiredHits = Math.ceil(target.hitpoints / entity.damage) + 1;
      for (let hit = 0; hit < requiredHits; hit += 1) {
        const impactTick = firstHitTick + hit * entity.hitSpeedTicks;
        impacts.push({ damage: entity.damage, impactTick, memberOrdinal: firstOrdinal + member,
          component: entity.archetypeId });
        attackImpacts.push({ damage: entity.damage, impactTick,
          memberOrdinal: firstOrdinal + member, component: entity.archetypeId });
      }
    }
    componentEvidence.push({ archetypeId: entity.archetypeId, count: entity.count,
      damage: entity.damage, movementMillitilesPerSecond: entity.movementMillitilesPerSecond,
      rangeMillitiles: entity.rangeMillitiles, deployTimeTicks: entity.deployTimeTicks,
      firstHitTicks: entity.firstHitTicks, hitSpeedTicks: entity.hitSpeedTicks,
      approachTicks, firstOrdinal, spacingTicks,
      firstProjectedImpactTick: impacts[0]?.impactTick ?? null });
  }
  attackImpacts.sort((left, right) => left.impactTick - right.impactTick ||
    left.memberOrdinal - right.memberOrdinal || left.component.localeCompare(right.component));
  let cumulativeDamage = 0;
  let estimatedKillTick = null;
  let lethalHits = [];
  for (const impact of attackImpacts) {
    cumulativeDamage += impact.damage;
    lethalHits.push(impact);
    if (cumulativeDamage >= target.hitpoints) {
      estimatedKillTick = impact.impactTick;
      break;
    }
  }
  if (estimatedKillTick === null) return null;
  return { cardId, cost: costs.get(cardId), slot, estimatedKillTick,
    estimatedApproachTicks: Math.max(...componentEvidence.map(({ approachTicks }) => approachTicks)),
    estimatedHitsToKill: lethalHits.length, componentEvidence, lethalHits,
    estimateBasis: "card-wide eligible member damage; 6-tick deployment offsets only where this card carries the sourced interval receipt; own movement estimate omits target approach and projectile travel; assumes members focus the threat" };
}

function estimateCounters(target, state, point) {
  const candidates = state.decks.south.hand.flatMap((cardId, slot) => {
    const card = cards.get(cardId);
    if (card === undefined || costs.get(cardId) > state.elixir.sides.south.amount) return [];
    const candidate = estimateCounter(cardId, slot, target, state, point);
    return candidate === null ? [] : [candidate];
  });
  return candidates.sort((left, right) => left.estimatedKillTick - right.estimatedKillTick ||
    left.cost - right.cost || left.cardId.localeCompare(right.cardId));
}

function emergencyPlan(state) {
  if (state.clock.phase !== "overtime") return null;
  opportunities.overtime += 1;
  const livingSouthLanes = state.battle.towers.filter(({ hitpoints, id, role, side }) =>
    side === "south" && role === "lane" && hitpoints > 0);
  if (livingSouthLanes.length !== 1) return null;
  opportunities.oneLaneLeft += 1;
  const lane = livingSouthLanes[0];
  const observation = { tick: state.tick, phase: state.clock.phase,
    lane: { id: lane.id, hitpoints: lane.hitpoints }, reason: null };
  const liveTargets = state.battle.units.filter(({ alive, side, targetId }) =>
    alive && side === "north" && southLaneTargetIds.has(targetId));
  const threats = liveTargets.filter(({ targetId }) => southLaneTargetIds.get(targetId) === lane.id);
  if (threats.length === 0) {
    observation.reason = "no-live-unit-targets-last-lane";
    observation.targetIds = liveTargets.map(({ id, targetId }) => ({ id, targetId }));
    observations.push(observation);
    return null;
  }
  observation.targets = threats.map((unit) => ({ id: unit.id, layer: unit.layer,
    position: unit.position, targetId: unit.targetId, spawnedAt: unit.spawnedAt,
    damage: unit.damage, hitpoints: unit.hitpoints, reach: unit.reach, radius: unit.radius,
    delivery: unit.delivery, projectileSpeed: unit.projectileSpeed,
    range: attackRangeEvidence(unit, lane), attack: unit.attack,
    activeTicksUntilNextAttack: unit.attack.nextAttackTick === null ? null :
      unit.attack.nextAttackTick - unit.attack.nextTick,
    earliestGlobalAttackTick: unit.attack.nextAttackTick === null ? null : state.tick +
      unit.attack.nextAttackTick - unit.attack.nextTick }));
  opportunities.targeted += 1;
  if (state.tick - lastEmergencyTick < EMERGENCY_COOLDOWN_TICKS) {
    opportunities.cooldownSuppressed += 1;
    observation.reason = "cooldown";
    observations.push(observation);
    return null;
  }
  const targetId = [...southLaneTargetIds].find(([, id]) => id === lane.id)?.[0];
  const committedProjectiles = state.battle.projectiles.filter(({ direction, targetId: id }) =>
    direction === "unit-to-tower" && id === targetId);
  const committedDamage = committedProjectiles.reduce((total, { damage }) => total + damage, 0);
  if (committedDamage >= lane.hitpoints) {
    opportunities.committedLethal += 1;
    observation.reason = "already-launched-projectiles-lethal";
    observation.committedProjectiles = committedProjectiles;
    observation.committedDamage = committedDamage;
    observations.push(observation);
    return null;
  }
  const schedule = attackSchedule(state, lane, targetId, threats);
  observation.committedProjectiles = committedProjectiles;
  observation.committedDamage = committedDamage;
  observation.attackSchedule = schedule.scheduled;
  observation.lethalDeadline = schedule.lethalDeadline;
  observation.threatEstimates = schedule.activeThreats.map(({ unit, ...estimate }) => ({
    id: unit.id, cardId: unit.cardId, phase: unit.attack.phase,
    currentAttackTargetId: unit.attack.targetId, currentRange: estimate.currentRange,
    basis: estimate.basis, remainingDeployTicks: estimate.remainingDeployTicks,
    approachTicks: estimate.approachTicks, firstLaunchTick: estimate.firstLaunchTick,
    firstImpactTick: estimate.firstImpactTick, projectileTravelTicks: estimate.travelTicks,
    projectedPositionAtLaunch: estimate.positionAtFirstLaunch,
    activeTicksUntilNextAttack: estimate.activeTicksUntilNextAttack,
  }));
  observation.inRangeThreatIds = schedule.activeThreats.filter(({ currentRange }) =>
    currentRange.inRange).map(({ unit }) => unit.id);
  if (schedule.activeThreats.length === 0) {
    observation.reason = "no-current-or-projected-tower-target-attack";
    observations.push(observation);
    return null;
  }
  if (observation.inRangeThreatIds.length > 0) opportunities.inRange += 1;
  if (schedule.lethalDeadline === null) {
    observation.reason = "projected-attack-cycles-and-projectiles-not-lethal";
    observations.push(observation);
    return null;
  }
  opportunities.lethalDeadline += 1;
  const lethalSources = new Set(schedule.scheduled.slice(0, schedule.lethalIndex + 1)
    .filter(({ source }) => source !== "launched-projectile").map(({ sourceId }) => sourceId));
  const options = [];
  observation.counterChecks = [];
  observation.decisionHorizonTicks = REACTION_INTERVAL_TICKS;
  for (const estimate of schedule.activeThreats.filter(({ unit }) => lethalSources.has(unit.id))) {
    const threat = estimate.unit;
    const placement = nearestLegalOwnSidePoint(threat.position);
    if (placement === null) continue;
    const counters = estimateCounters(threat, state, placement.point);
    if (counters.length === 0) {
      observation.counterChecks.push({ threatId: threat.id, result: "no-affordable-layer-capable-unit-card" });
      continue;
    }
    for (const counter of counters) {
      const remainingTicks = schedule.lethalDeadline - state.tick;
      const etaTicks = counter.estimatedKillTick - state.tick;
      const actualTargetAcquisitions = counterTargetAcquisitions(counter.cardId, placement.point, state);
      const check = { threatId: threat.id, counterCardId: counter.cardId,
        counterCost: counter.cost, estimatedKillTick: counter.estimatedKillTick,
        estimatedEtaTicks: etaTicks, lethalDeadline: schedule.lethalDeadline,
        remainingTicks, nextOpportunityTick: state.tick + REACTION_INTERVAL_TICKS,
        point: placement.point, placementReason: placement.reason,
        distance: Math.round(Math.sqrt(placement.distanceSquared)),
        estimatedApproachTicks: counter.estimatedApproachTicks,
        estimatedHitsToKill: counter.estimatedHitsToKill,
        componentEvidence: counter.componentEvidence, lethalHits: counter.lethalHits,
        estimateBasis: counter.estimateBasis,
        actualTargetAcquisitions };
      const eligibleMemberTargets = actualTargetAcquisitions.filter(({ memberOrdinal }) =>
        counter.componentEvidence.some(({ firstOrdinal, count }) =>
          memberOrdinal >= firstOrdinal && memberOrdinal < firstOrdinal + count));
      if (eligibleMemberTargets.length === 0 || eligibleMemberTargets.some(({ acquiredTargetId }) =>
          acquiredTargetId !== threat.id)) {
        check.result = "actual-spawn-acquires-other-or-no-current-unit-target";
        observation.counterChecks.push(check);
        continue;
      }
      if (counter.estimatedKillTick >= schedule.lethalDeadline) {
        check.result = "counter-kill-estimate-at-or-after-lethal-deadline";
        observation.counterChecks.push(check);
        continue;
      }
      const unavoidableBeforeKill = committedProjectiles.filter(({ impactTick }) =>
        impactTick <= counter.estimatedKillTick).reduce((total, { damage }) => total + damage, 0);
      if (unavoidableBeforeKill >= lane.hitpoints) {
        check.result = "in-flight-projectiles-lethal-before-counter-kill";
        check.unavoidableBeforeKill = unavoidableBeforeKill;
        observation.counterChecks.push(check);
        continue;
      }
      check.unavoidableBeforeKill = unavoidableBeforeKill;
      check.nextObservationWouldMissWindow = etaTicks + REACTION_INTERVAL_TICKS >= remainingTicks;
      check.result = check.nextObservationWouldMissWindow
        ? "feasible-last-observation-window" : "feasible-but-waiting-still-feasible";
      observation.counterChecks.push(check);
      if (check.nextObservationWouldMissWindow) {
        options.push({ threat, placement, counter, unavoidableBeforeKill });
      }
    }
  }
  if (options.length === 0) {
    observation.reason = "no-feasible-counter-in-last-observation-window";
    observations.push(observation);
    return null;
  }
  opportunities.feasibleCounter += 1;
  options.sort((left, right) => left.counter.estimatedKillTick - right.counter.estimatedKillTick ||
    left.counter.cost - right.counter.cost || left.threat.id - right.threat.id);
  const { threat, placement, counter, unavoidableBeforeKill } = options[0];
  observation.reason = "feasible-counter-in-last-observation-window-selected";
  observations.push(observation);
  return { cardId: counter.cardId, point: placement.point, slot: counter.slot, tick: state.tick,
    decision: "overtime-latest-feasible-counter-window", laneId: lane.id,
    laneHitpoints: lane.hitpoints, laneInitialHitpoints: initialLaneHitpoints.get(lane.id),
    committedProjectiles: committedProjectiles.map(({ damage, impactTick, sourceId }) =>
      ({ damage, impactTick, sourceId })), committedDamage, unavoidableBeforeKill,
    lethalDeadline: schedule.lethalDeadline,
    hitSchedule: schedule.scheduled.slice(0, schedule.lethalIndex + 1),
    selectedThreat: { id: threat.id, cardId: threat.cardId, layer: threat.layer, damage: threat.damage,
      hitpoints: threat.hitpoints, position: threat.position, targetId: threat.targetId,
      radius: threat.radius, reach: threat.reach, delivery: threat.delivery,
      projectileSpeed: threat.projectileSpeed, spawnedAt: threat.spawnedAt,
      attack: threat.attack, projectedThreat: schedule.activeThreats.find(({ unit }) =>
        unit.id === threat.id),
      attackTicksUntilNext: threat.attack.nextAttackTick === null ? null :
        threat.attack.nextAttackTick - threat.attack.nextTick,
      attackGlobalDeadline: threat.attack.nextAttackTick === null ? null : state.tick +
        threat.attack.nextAttackTick - threat.attack.nextTick,
      towerRangeSquared: (threat.radius + threat.reach + towerFootprintRadius(lane.id)) ** 2,
      towerDistanceSquared: (threat.position.x - lane.position.x) ** 2 +
        (threat.position.y - lane.position.y) ** 2 },
    estimatedDefenderKillTick: counter.estimatedKillTick,
    estimatedApproachTicks: counter.estimatedApproachTicks,
    estimatedHitsToKill: counter.estimatedHitsToKill,
    counterComponents: counter.componentEvidence,
    counterLethalHits: counter.lethalHits,
    estimateBasis: counter.estimateBasis,
    lastFeasibleObservationWindow: { remainingTicks: schedule.lethalDeadline - state.tick,
      etaTicks: counter.estimatedKillTick - state.tick,
      nextOpportunityTick: state.tick + REACTION_INTERVAL_TICKS },
    targetDistanceAtDecision: Math.round(Math.sqrt(placement.distanceSquared)),
    placementReason: placement.reason };
}

while (session.state.tick < REQUIRED_TICK && !session.state.terminal) {
  const state = session.state;
  opportunities.total += 1;
  const baselinePlan = state.tick % BASELINE_INTERVAL_TICKS === 0
    ? plannedSouthAttempt(session) : null;
  let plan = emergencyPlan(state);
  if (plan !== null) {
    plan = { ...plan, suppressedBaseline: baselinePlan === null ? null : {
      cardId: baselinePlan.cardId, point: baselinePlan.point, slot: baselinePlan.slot,
      tick: baselinePlan.tick },
      decision: "overtime-latest-feasible-counter-window" };
    opportunities.emergency += 1;
    lastEmergencyTick = state.tick;
  }
  if (plan === null && baselinePlan !== null) {
    plan = { ...baselinePlan, decision: "frozen-GH-baseline" };
    opportunities.baseline += 1;
  }
  if (plan !== null) {
    const { decision, laneId: _laneId, laneHitpoints: _laneHitpoints,
      laneInitialHitpoints: _laneInitialHitpoints, committedProjectiles: _projectiles,
      committedDamage: _committedDamage, unavoidableBeforeKill: _unavoidableBeforeKill,
      lethalDeadline: _lethalDeadline, hitSchedule: _hitSchedule,
      selectedThreat: _selectedThreat, estimatedDefenderKillTick: _defenderKillTick,
      estimatedApproachTicks: _approachTicks, estimatedHitsToKill: _hitsToKill,
      counterComponents: _counterComponents, counterLethalHits: _counterLethalHits,
      lastFeasibleObservationWindow: _lastFeasibleObservationWindow,
      suppressedBaseline: _suppressedBaseline,
      estimateBasis: _estimateBasis, targetDistanceAtDecision: _distance,
      placementReason: _placementReason, ...commandFields } = plan;
    const command = { ...commandFields, commandId, type: "deploy" };
    const admitted = session.submitPlayerCommand(canonical(command));
    assert.equal(admitted.accepted, true, `${decision} command at ${state.tick} must be admitted`);
    attempts.push({ ...plan, commandId });
    commandId += 1;
  }
  const events = session.stepMany(Math.min(REACTION_INTERVAL_TICKS, REQUIRED_TICK - state.tick));
  for (const event of events) {
    if (event.type === "tower-destroyed" || event.type === "match_end" ||
        event.type === "external-structure-contact") significantEvents.push(event);
  }
}

const state = session.state;
const units = state.battle.units;
const contacts = significantEvents.filter(({ type }) => type === "external-structure-contact");
const geometryChecks = [3_500, 14_500].map((x) => {
  const decision = evaluateDeployment({ side: "south", placementClass: "ground_entity",
    point: { x, y: 5_500 }, destroyedOpposingLaneTowers: [] });
  return { x, y: 5_500, ...decision };
});
assert.ok(geometryChecks.every(({ legal }) => legal), "both baseline defensive points remain legal");
const summary = {
  scope: "Offline deterministic seed-zero full-workload calibration; the overtime latest-feasible-counter reaction is a changed workload policy, not prior GH/browser equivalence.",
  policy: {
    sourceSetup: "exact seed-zero default-eight setup",
    baseline: "frozen GH planner at each 300-tick decision boundary",
    reactionIntervalTicks: REACTION_INTERVAL_TICKS,
    emergency: "only in overtime with exactly one south lane tower remaining; forecast lethal damage from already-launched projectiles and alive north units currently targeting that tower, including observed attack cycles or projected deploy/approach/first-hit timing; choose an affordable layer-capable card only when actual spawned members acquire the lethal threat, its member-level estimated kill precedes the forecast deadline, and waiting one 60-tick observation would make it too late; replace a coincident baseline command with this one command; skip if committed projectiles are independently lethal before the counter estimate",
    emergencyCooldownTicks: EMERGENCY_COOLDOWN_TICKS,
    placement: "nearest legal own-side point to the selected current attacker position, using the existing deployment evaluator",
    stateAdaptiveInputs: ["overtime phase", "number and HP of surviving south lane towers", "alive unit targetId/layer/position/range/attack phase", "observed active-cycle remaining ticks or projected deploy/approach/first-hit schedule", "already-launched unit-to-tower projectiles", "current hand and elixir", "nearest legal own-side deployment point", "public target-acquisition result for every spawned counter member", "estimated member-level counter attack schedule"],
    estimateLimits: ["future target schedules assume current tower target and attack cadence persist", "projected movement and projectile travel use roster speed and estimated tower footprint", "counter ETA assumes eligible members retain the observed acquisition and omits future retargeting/projectile travel", "body radii use unverified runtime questions"],
    unchanged: ["seed 0", "default eight-card deck", "north AI", "tower stats", "simulation rules", "18,000-tick requirement"],
  },
  setup: { bytes: setupBytes.length, sha256: hash(setupBytes) },
  outcome: {
    tick: state.tick, terminal: state.terminal, clock: state.clock,
    requiredTick: REQUIRED_TICK, requiredTickReached: state.tick >= REQUIRED_TICK,
    towers: state.battle.towers.map(({ hitpoints, id }) => ({ hitpoints, id })),
    activeUnits: {
      north: units.filter(({ alive, side }) => alive && side === "north").length,
      south: units.filter(({ alive, side }) => alive && side === "south").length,
      totalCreated: {
        north: units.filter(({ side }) => side === "north").length,
        south: units.filter(({ side }) => side === "south").length,
      },
    },
    towerContacts: {
      total: contacts.length,
      againstNorth: contacts.filter(({ structureId }) => structureId.startsWith("north:")).length,
      againstSouth: contacts.filter(({ structureId }) => structureId.startsWith("south:")).length,
    },
    deployments: {
      north: state.cardRuntime.history.filter(({ side }) => side === "north").length,
      south: state.cardRuntime.history.filter(({ side }) => side === "south").length,
      acceptedSouthCommands: attempts.length,
    },
    opportunities,
    elixir: state.elixir.sides,
    southDeck: state.decks.south,
  },
  placementChecks: geometryChecks,
  attempts,
  observations,
  significantEvents,
};
const out = new URL("./target-aware-latest-save-result.json", import.meta.url);
writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
