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

const REACTION_INTERVAL_TICKS = 15;
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

const aggregateTrace = { startTick: null, endTick: null, laneId: null,
  commandIds: [], deployedSouthEntityIds: [], eventTypes: {}, events: [], boundaries: [] };
const traceRelevantIds = new Set();
function compactUnit(unit) {
  return { id: unit.id, cardId: unit.cardId, side: unit.side, alive: unit.alive,
    hitpoints: unit.hitpoints, maxHealth: unit.maxHealth, layer: unit.layer,
    targetMode: unit.targetMode, position: unit.position, targetId: unit.targetId,
    damage: unit.damage, reach: unit.reach, radius: unit.radius,
    attack: unit.attack, movementTarget: unit.movement?.target ?? null };
}
function canHitLayer(mode, layer) {
  return mode === "ground-and-air" || mode === "air_and_ground" || mode === layer;
}
function segmentApproach(origin, destination, point) {
  const dx = destination.x - origin.x;
  const dy = destination.y - origin.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((point.x - origin.x) * dx + (point.y - origin.y) * dy) / lengthSquared));
  const closest = { x: origin.x + t * dx, y: origin.y + t * dy };
  return { distance: Math.hypot(point.x - closest.x, point.y - closest.y),
    distanceAlong: Math.hypot(dx, dy) * t };
}
function aggregateIncomingEstimate(state, lane, point, defender, horizonTicks) {
  const defenderRadius = questionValues.get(defender.bodyRadiusPolicy.questionKey);
  const towerTargetId = [...southLaneTargetIds].find(([, id]) => id === lane.id)?.[0];
  const incoming = [];
  for (const enemy of state.battle.units.filter(({ alive, side }) => alive && side === "north")) {
    const profile = entityForUnit(enemy);
    if (profile === null || !canHitLayer(profile.targetMode, "air")) continue;
    const speed = Math.max(profile.movementMillitilesPerSecond, 1);
    const directDistance = Math.hypot(enemy.position.x - point.x, enemy.position.y - point.y);
    let closestDistance = directDistance;
    let approachTicks = Math.ceil(Math.max(0, directDistance - enemy.reach - enemy.radius - defenderRadius) * 60 / speed);
    let approachBasis = "current-position";
    if (southLaneTargetIds.has(enemy.targetId) && enemy.targetId === towerTargetId) {
      const travel = speed * horizonTicks / 60;
      const projected = moveToward(enemy.position, lane.position, travel);
      const path = segmentApproach(enemy.position, projected, point);
      if (path.distance < closestDistance) {
        closestDistance = path.distance;
        approachTicks = Math.ceil(path.distanceAlong * 60 / speed) +
          Math.ceil(Math.max(0, path.distance - enemy.reach - enemy.radius - defenderRadius) * 60 / speed);
        approachBasis = "projected-current-tower-approach";
      }
    }
    if (closestDistance > enemy.sightRange + enemy.radius + defenderRadius ||
        approachTicks >= horizonTicks) continue;
    const firstHit = Math.max(0, enemy.attack.config.firstHitTicks);
    const travelTicks = enemy.delivery === "projectile"
      ? Math.ceil(closestDistance / Math.max(enemy.projectileSpeed ?? 0, 1)) : 0;
    const firstImpactOffset = approachTicks + firstHit + travelTicks;
    const hits = firstImpactOffset > horizonTicks ? 0 :
      1 + Math.floor((horizonTicks - firstImpactOffset) / enemy.attack.config.hitSpeedTicks);
    if (hits <= 0) continue;
    incoming.push({ id: enemy.id, cardId: enemy.cardId, targetId: enemy.targetId,
      targetMode: enemy.targetMode, damage: enemy.damage, hitSpeedTicks: enemy.attack.config.hitSpeedTicks,
      closestDistance: Math.round(closestDistance), approachTicks, firstImpactOffset,
      projectedHits: hits, projectedDamage: hits * enemy.damage, approachBasis });
  }
  return { projectedDamage: incoming.reduce((sum, entry) => sum + entry.projectedDamage, 0), incoming };
}
function aggregateDefensePlan(state) {
  if (state.clock.phase !== "overtime") return null;
  opportunities.overtime += 1;
  const livingSouthLanes = state.battle.towers.filter(({ hitpoints, id, role, side }) =>
    side === "south" && role === "lane" && hitpoints > 0);
  if (livingSouthLanes.length !== 1) return null;
  opportunities.oneLaneLeft += 1;
  const lane = livingSouthLanes[0];
  const towerTargetId = [...southLaneTargetIds].find(([, id]) => id === lane.id)?.[0];
  const threats = state.battle.units.filter(({ alive, side, targetId }) =>
    alive && side === "north" && targetId === towerTargetId)
    .sort((a, b) => a.id - b.id);
  if (threats.length === 0) return null;
  opportunities.targeted += 1;
  if (state.tick - lastEmergencyTick < EMERGENCY_COOLDOWN_TICKS) {
    opportunities.cooldownSuppressed += 1;
    return null;
  }
  const options = [];
  const checks = [];
  for (const threat of threats) {
    const targetableCards = state.decks.south.hand.flatMap((cardId, slot) => {
      const card = cards.get(cardId);
      if (card === undefined || card.kind !== "unit" || costs.get(cardId) > state.elixir.sides.south.amount ||
          card.entities.length !== 1 || card.entities[0].count !== 1) return [];
      const entity = card.entities[0];
      if (entity.layer !== "air" || entity.damage <= 0 || !canHitLayer(entity.targetMode, threat.layer)) return [];
      return [{ cardId, card, entity, slot }];
    });
    for (const candidate of targetableCards) {
      const { cardId, entity, slot } = candidate;
      const radius = questionValues.get(entity.bodyRadiusPolicy.questionKey);
      let bestForPair = null;
      for (let x = 500; x <= 17_500; x += 250) {
        for (let y = 500; y < 15_000; y += 250) {
          const point = { x, y };
          const distance = Math.hypot(threat.position.x - x, threat.position.y - y);
          if (distance > entity.rangeMillitiles + threat.radius + radius) continue;
          const placement = evaluateDeployment({ side: "south", placementClass: "ground_entity",
            point, destroyedOpposingLaneTowers: [] });
          if (!placement.legal) continue;
          const acquisition = counterTargetAcquisitions(cardId, point, state);
          if (acquisition.length !== 1 || acquisition[0].acquiredTargetId !== threat.id) continue;
          const impactsToKill = Math.ceil(threat.hitpoints / entity.damage);
          const projectileTicks = entity.delivery === "projectile"
            ? Math.ceil(distance / Math.max(entity.projectileSpeed ?? 0, 1)) : 0;
          const killTick = state.tick + entity.deployTimeTicks + entity.firstHitTicks + projectileTicks +
            Math.max(0, impactsToKill - 1) * entity.hitSpeedTicks;
          const horizon = killTick - state.tick;
          const risk = aggregateIncomingEstimate(state, lane, point, entity, horizon);
          const candidateEvidence = { threat, cardId, slot, point, radius, distance: Math.round(distance),
            killTick, horizonTicks: horizon, impactsToKill, risk, acquisition: acquisition[0],
            placementReason: placement.reason };
          if (bestForPair === null || risk.projectedDamage < bestForPair.risk.projectedDamage ||
              (risk.projectedDamage === bestForPair.risk.projectedDamage &&
               (horizon < bestForPair.horizonTicks || (horizon === bestForPair.horizonTicks &&
                distance < bestForPair.distance)))) bestForPair = candidateEvidence;
        }
      }
      if (bestForPair !== null) options.push(bestForPair);
      else checks.push({ threatId: threat.id, cardId, result: "no-legal-in-range-point-acquires-current-tower-targeter" });
    }
  }
  if (options.length === 0) return null;
  options.sort((a, b) => a.risk.projectedDamage - b.risk.projectedDamage ||
    a.horizonTicks - b.horizonTicks || b.threat.damage - a.threat.damage ||
    a.cardId.localeCompare(b.cardId) || a.point.y - b.point.y || a.point.x - b.point.x);
  const selected = options[0];
  observations.push({ tick: state.tick, phase: state.clock.phase, laneId: lane.id,
    laneHitpoints: lane.hitpoints, towerTargetIds: threats.map(({ id }) => id),
    selected: { id: selected.threat.id, cardId: selected.threat.cardId,
      position: selected.threat.position, targetId: selected.threat.targetId,
      hitpoints: selected.threat.hitpoints, targetMode: selected.threat.targetMode },
    point: selected.point, cardId: selected.cardId, predictedKillTick: selected.killTick,
    predictedIncoming: selected.risk, alternatives: options.map(({ threat, cardId, point, killTick, risk }) =>
      ({ threatId: threat.id, cardId, point, killTick, projectedIncomingDamage: risk.projectedDamage,
        incoming: risk.incoming })), checks });
  opportunities.feasibleCounter += 1;
  const estimatedTowerDps = threats.reduce((sum, unit) =>
    sum + unit.damage * 60 / Math.max(unit.attack.config.hitSpeedTicks, 1), 0);
  return { cardId: selected.cardId, point: selected.point, slot: selected.slot, tick: state.tick,
    decision: "overtime-last-lane-aggregate-air-intercept",
    policyEvidence: { laneId: lane.id, laneHitpoints: lane.hitpoints,
      currentTowerTargeters: threats.map(({ id, cardId, position, targetId, hitpoints, damage }) =>
        ({ id, cardId, position, targetId, hitpoints, damage })),
      selectedThreatId: selected.threat.id, actualCounterAcquisition: selected.acquisition,
      predictedKillTick: selected.killTick, projectedIncoming: selected.risk,
      estimatedTowerDps, candidates: options.map(({ threat, cardId, point, killTick, risk }) =>
        ({ threatId: threat.id, cardId, point, killTick, projectedIncomingDamage: risk.projectedDamage })) } };
}
function appendBoundary(tick) {
  const state = session.state;
  const laneId = aggregateTrace.laneId;
  const towerTargetId = [...southLaneTargetIds].find(([, id]) => id === laneId)?.[0];
  const screenUnits = state.battle.units.filter(({ id, side }) => side === "south" &&
    aggregateTrace.deployedSouthEntityIds.includes(id));
  for (const unit of state.battle.units) {
    if (unit.side === "north" && (unit.targetId === towerTargetId ||
        (canHitLayer(unit.targetMode, "air") && screenUnits.some((screen) =>
          Math.hypot(unit.position.x - screen.position.x, unit.position.y - screen.position.y) <= 11_000)))) {
      traceRelevantIds.add(unit.id);
    }
  }
  const relevant = state.battle.units.filter(({ id }) => traceRelevantIds.has(id) ||
    aggregateTrace.deployedSouthEntityIds.includes(id)).map(compactUnit);
  aggregateTrace.boundaries.push({ tick, laneHitpoints: state.battle.towers.find(({ id }) => id === laneId)?.hitpoints ?? null,
    units: relevant });
  aggregateTrace.endTick = tick;
}
while (session.state.tick < REQUIRED_TICK && !session.state.terminal) {
  const state = session.state;
  opportunities.total += 1;
  const baselinePlan = state.tick % BASELINE_INTERVAL_TICKS === 0
    ? plannedSouthAttempt(session) : null;
  let plan = aggregateDefensePlan(state);
  if (plan !== null) {
    plan = { ...plan, suppressedBaseline: baselinePlan === null ? null : {
      cardId: baselinePlan.cardId, point: baselinePlan.point, slot: baselinePlan.slot, tick: baselinePlan.tick } };
    opportunities.emergency += 1;
    lastEmergencyTick = state.tick;
  }
  if (plan === null && baselinePlan !== null) {
    plan = { ...baselinePlan, decision: "frozen-GH-baseline" };
    opportunities.baseline += 1;
  }
  if (plan !== null) {
    const command = { cardId: plan.cardId, point: plan.point, slot: plan.slot,
      tick: plan.tick, commandId, type: "deploy" };
    const admitted = session.submitPlayerCommand(canonical(command));
    assert.equal(admitted.accepted, true, `${plan.decision} command at ${state.tick} must be admitted`);
    attempts.push({ ...plan, commandId });
    if (plan.decision === "overtime-last-lane-aggregate-air-intercept") {
      aggregateTrace.commandIds.push(commandId);
      if (aggregateTrace.startTick === null) {
        aggregateTrace.startTick = state.tick;
        aggregateTrace.laneId = plan.policyEvidence.laneId;
        for (const unit of state.battle.units.filter((unit) =>
          unit.alive && unit.side === "north" && (unit.targetId === [...southLaneTargetIds].find(([, id]) =>
            id === aggregateTrace.laneId)?.[0] || canHitLayer(unit.targetMode, "air")))) {
          traceRelevantIds.add(unit.id);
        }
      }
    }
    commandId += 1;
  }
  const events = session.stepMany(Math.min(REACTION_INTERVAL_TICKS, REQUIRED_TICK - state.tick));
  for (const event of events) {
    if (event.type === "tower-destroyed" || event.type === "match_end" ||
        event.type === "external-structure-contact") significantEvents.push(event);
    if (aggregateTrace.startTick !== null && ["attack", "projectile-launch", "projectile-impact",
        "damage", "death", "external-structure-contact", "tower-destroyed", "match_end",
        "session-deployed"].includes(event.type)) {
      aggregateTrace.events.push(event);
      aggregateTrace.eventTypes[event.type] = (aggregateTrace.eventTypes[event.type] ?? 0) + 1;
      if (event.type === "session-deployed" && event.side === "south") {
        const ids = event.deployment?.entityIds ?? [];
        aggregateTrace.deployedSouthEntityIds.push(...ids);
        for (const id of ids) traceRelevantIds.add(id);
      }
    }
  }
  if (aggregateTrace.startTick !== null) appendBoundary(session.state.tick);
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
  scope: "Offline deterministic seed-zero full-workload calibration; state-aware aggregate-risk candidate, not a runtime or engine change.",
  policy: { sourceSetup: "exact seed-zero default-eight setup",
    baseline: "frozen GH planner at each 300-tick decision boundary",
    reactionIntervalTicks: REACTION_INTERVAL_TICKS,
    emergency: "during overtime with one South lane remaining and a live North tower-targeter, evaluate affordable single-body air cards at legal own-side points where actual current target acquisition selects that tower-targeter and attack range already reaches it; rank by estimated aggregate incoming damage from current air-capable enemies and tower-approaching air-capable units through estimated removal time, then urgency and kill time; replace a coincident baseline command",
    emergencyCooldownTicks: EMERGENCY_COOLDOWN_TICKS,
    estimateLimits: ["aggregate attack risk uses current unit profiles and straight-line approach to the defended lane for soon approachers", "predicted counter kill assumes the acquired target remains available and does not model future retargeting", "body radii and deployment geometry retain their existing confidence limits"],
    unchanged: ["seed 0", "default eight-card deck", "north AI", "tower stats", "simulation rules", "18,000-tick requirement"] },
  setup: { bytes: setupBytes.length, sha256: hash(setupBytes) },
  outcome: { tick: state.tick, terminal: state.terminal, clock: state.clock,
    requiredTick: REQUIRED_TICK, requiredTickReached: state.tick >= REQUIRED_TICK,
    towers: state.battle.towers.map(({ hitpoints, id }) => ({ hitpoints, id })),
    activeUnits: { north: units.filter(({ alive, side }) => alive && side === "north").length,
      south: units.filter(({ alive, side }) => alive && side === "south").length,
      totalCreated: { north: units.filter(({ side }) => side === "north").length,
        south: units.filter(({ side }) => side === "south").length } },
    towerContacts: { total: contacts.length,
      againstNorth: contacts.filter(({ structureId }) => structureId.startsWith("north:")).length,
      againstSouth: contacts.filter(({ structureId }) => structureId.startsWith("south:")).length },
    deployments: { north: state.cardRuntime.history.filter(({ side }) => side === "north").length,
      south: state.cardRuntime.history.filter(({ side }) => side === "south").length,
      acceptedSouthCommands: attempts.length }, opportunities,
    elixir: state.elixir.sides, southDeck: state.decks.south },
  placementChecks: geometryChecks, attempts, observations, significantEvents,
  trace: { startTick: aggregateTrace.startTick, endTick: aggregateTrace.endTick,
    laneId: aggregateTrace.laneId, commandIds: aggregateTrace.commandIds,
    deployedSouthEntityIds: aggregateTrace.deployedSouthEntityIds,
    eventTypes: aggregateTrace.eventTypes, eventCount: aggregateTrace.events.length,
    boundaryCount: aggregateTrace.boundaries.length },
};
writeFileSync(new URL("./aggregate-defense-result.json", import.meta.url), `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(new URL("./aggregate-defense-trace.json", import.meta.url), `${JSON.stringify({
  startTick: aggregateTrace.startTick, endTick: aggregateTrace.endTick, laneId: aggregateTrace.laneId,
  commandIds: aggregateTrace.commandIds, deployedSouthEntityIds: aggregateTrace.deployedSouthEntityIds,
  eventTypes: aggregateTrace.eventTypes, events: aggregateTrace.events, boundaries: aggregateTrace.boundaries,
}, null, 2)}\n`);
console.log(JSON.stringify({ outcome: summary.outcome, attempts: attempts.filter(({ decision }) =>
  decision === "overtime-last-lane-aggregate-air-intercept"), observations,
  trace: summary.trace }));
