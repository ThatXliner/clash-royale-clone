import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createPlayableRoster, createPlayableRosterQuestionRecords } from "../../src/content/playable-roster.js";
import { createEditableGameSessionSetup } from "../../src/content/editable-deck.js";
import { getArenaGeometry } from "../../src/sim/arena-geometry.js";
import { evaluateDeployment } from "../../src/sim/deployment.js";
import { acquireTarget } from "../../src/sim/targeting.js";
import { layoutFormation } from "../../src/sim/formations.js";
import { GROUND_PATH_GRID_STEP_MILLITILES, isGroundNavigationNode } from "../../src/sim/pathfinding.js";
import { GameSession } from "../../src/sim/game-session.js";

export const ENDURANCE_REACTION_INTERVAL_TICKS = 15;
export const ENDURANCE_BASELINE_INTERVAL_TICKS = 300;
export const ENDURANCE_EMERGENCY_COOLDOWN_TICKS = 300;
export const ENDURANCE_REQUIRED_TICK = 18_000;

const DEFAULT_ROSTER = createPlayableRoster();
const DEFAULT_QUESTIONS = createPlayableRosterQuestionRecords();
const arenaTowers = getArenaGeometry().towers;
export const KILNKEEPER_ENDURANCE_DECK = Object.freeze([
  "coilblade", "mossguard", "copperskiff", "kilnkeeper",
  "brassbolt", "reedsting", "briar-band", "cinderlings",
]);
export const BRACKENWHEEL_ENDURANCE_DECK = Object.freeze([
  "brackenwheel", "briar-band", "coilblade", "mossguard",
  "ironroot", "copperskiff", "brassbolt", "reedsting",
]);

function createWorkloadCatalog(roster, questions, label) {
  if (!Array.isArray(roster) || roster.length !== 8 ||
      new Set(roster.map(({ id }) => id)).size !== 8 ||
      !Array.isArray(questions)) {
    throw new TypeError(`${label} must contain one admitted eight-unit roster and its questions`);
  }
  const questionValues = new Map(questions.map(({ key, value }) => [key, value]));
  const cards = new Map();
  const costs = new Map();
  const defensiveProfiles = new Map();
  for (const card of roster) {
    if (typeof card.id !== "string" || card.kind !== "unit" ||
        !Number.isSafeInteger(card.cost) || card.cost < 0 ||
        !Array.isArray(card.entities) || card.entities.length === 0) {
      throw new TypeError(`${label} contains a missing or unsupported unit profile`);
    }
    cards.set(card.id, card);
    costs.set(card.id, card.cost);
    const entities = card.entities;
    defensiveProfiles.set(card.id, {
      airPressure: entities.filter(({ targetMode }) => targetMode === "ground-and-air")
        .reduce((total, entity) => total + entity.count * entity.damage * 1_000 /
          entity.hitSpeedTicks, 0),
      durability: entities.reduce((total, entity) => total + entity.count * entity.hitpoints, 0),
      groundPressure: entities.reduce((total, entity) => total + entity.count * entity.damage * 1_000 /
        entity.hitSpeedTicks, 0),
      range: Math.max(...entities.map(({ rangeMillitiles }) => rangeMillitiles)),
      speed: entities.reduce((total, entity) =>
        total + entity.count * entity.movementMillitilesPerSecond, 0),
    });
    for (const entity of entities) {
      const key = entity.bodyRadiusPolicy?.questionKey;
      if (typeof key !== "string" || !Number.isFinite(questionValues.get(key))) {
        throw new TypeError(`${label} has no admitted body-radius question for ${card.id}`);
      }
    }
  }
  return Object.freeze({ cards, costs, defensiveProfiles, questionValues, roster });
}

const DEFAULT_WORKLOAD_CATALOG = createWorkloadCatalog(
  DEFAULT_ROSTER, DEFAULT_QUESTIONS, "default endurance setup");

const groundNodes = Object.freeze(Array.from({ length: 32 }, (_, row) =>
  Array.from({ length: 18 }, (_, column) => ({
    x: column * GROUND_PATH_GRID_STEP_MILLITILES + GROUND_PATH_GRID_STEP_MILLITILES / 2,
    y: row * GROUND_PATH_GRID_STEP_MILLITILES + GROUND_PATH_GRID_STEP_MILLITILES / 2,
  }))).flat().filter((point) => isGroundNavigationNode(point)));

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function createExactEnduranceSetup() {
  const battleSetup = canonical({ initialWindupTicks: { central: 0, lane: 0 },
    questions: DEFAULT_QUESTIONS, roster: DEFAULT_ROSTER });
  const deck = DEFAULT_ROSTER.map(({ id }) => id);
  const legalNorthDeployments = deck.flatMap((cardId) => [
    { cardId, point: { x: 3_500, y: 17_500 } },
    { cardId, point: { x: 14_500, y: 17_500 } },
  ]).sort((left, right) => left.cardId.localeCompare(right.cardId) ||
    left.point.x - right.point.x);
  const setupBytes = canonical({ battleSetup, deck, legalNorthDeployments,
    rosterWitness: canonical({ questions: DEFAULT_QUESTIONS, roster: DEFAULT_ROSTER }), seed: 0,
    startingElixir: { north: 10, south: 10 }, thinkIntervalTicks: 1, thinkOffsetTicks: 0 });
  return Object.freeze({ bytes: setupBytes, sha256: createHash("sha256").update(setupBytes).digest("hex") });
}

/** The exact seed-zero default-eight setup used by the GAME-001GH workload. */
export function exactEnduranceSetupBytes() {
  return createExactEnduranceSetup().bytes;
}

/** The source-authenticated seed-zero custom deck used for the Kilnkeeper smoke. */
export function exactKilnkeeperEnduranceSetupBytes() {
  return createEditableGameSessionSetup(KILNKEEPER_ENDURANCE_DECK, 0);
}

/** The accepted seed-two custom deck used for the Brackenwheel browser workload. */
export function exactBrackenwheelEnduranceSetupBytes() {
  return createEditableGameSessionSetup(BRACKENWHEEL_ENDURANCE_DECK, 2);
}

function workloadCatalogFromSetupBytes(setupBytes) {
  if (typeof setupBytes !== "string" || canonical(JSON.parse(setupBytes)) !== setupBytes) {
    throw new TypeError("endurance setup must be canonical JSON text");
  }
  // GameSession is the authority for whether the selected deck and its source
  // witness are complete. Planner profiles are read from that accepted setup.
  const accepted = new GameSession(setupBytes);
  const setup = JSON.parse(accepted.serialize()).setup;
  const battleSetup = JSON.parse(setup.battleSetup);
  const rosterWitness = JSON.parse(setup.rosterWitness);
  if (canonical(rosterWitness) !== canonical({
    questions: battleSetup.questions,
    roster: battleSetup.roster,
  }) || !Array.isArray(setup.deck) || setup.deck.length !== 8 ||
      setup.deck.some((id, index) => battleSetup.roster[index]?.id !== id)) {
    throw new TypeError("endurance setup is missing its admitted selected-roster profile");
  }
  return createWorkloadCatalog(battleSetup.roster, battleSetup.questions,
    "selected endurance setup");
}

/** Keep the defensive priority order and use its most durable affordable card for idle refreshes. */
export function plannedSouthAttempt(session, catalog = DEFAULT_WORKLOAD_CATALOG) {
  const state = session.state;
  if (state.terminal) return null;
  const incoming = state.battle.units.filter(({ alive, position, side }) =>
    alive && side === "north" && position.y < 15_000);
  const lastSouthDeploymentTick = state.cardRuntime.history
    .filter(({ side }) => side === "south").at(-1)?.tick ?? 0;
  const guardRefreshDue = state.tick - lastSouthDeploymentTick >= 900;
  if (incoming.length === 0 && !guardRefreshDue) return null;
  const candidates = state.decks.south.hand.map((cardId, slot) => {
    const profile = catalog.defensiveProfiles.get(cardId);
    const cost = catalog.costs.get(cardId);
    if (profile === undefined || cost === undefined) {
      throw new TypeError(`endurance selected roster has no profile for ${cardId}`);
    }
    return { ...profile, cardId, cost, slot };
  })
    .sort((left, right) => right.durability - left.durability || left.speed - right.speed ||
      left.cost - right.cost || left.cardId.localeCompare(right.cardId));
  const airThreat = incoming.some(({ layer }) => layer === "air");
  const card = incoming.length === 0
    ? candidates.find(({ cost }) => cost <= state.elixir.sides.south.amount)
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

function counterTargetAcquisitions(cardId, point, state, catalog) {
  const card = catalog.cards.get(cardId);
  const expanded = card.entities.flatMap((component) => Array.from(
    { length: component.count }, () => ({ component,
      radius: catalog.questionValues.get(component.bodyRadiusPolicy.questionKey) })));
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
      acquiredTargetCardId: target === null ? null : state.battle.units.find(({ id }) =>
        id === target.id)?.cardId ?? null };
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

function canHitLayer(mode, layer) {
  return mode === "ground-and-air" || mode === "air_and_ground" || mode === layer;
}

function entityForUnit(unit, catalog) {
  const card = catalog.cards.get(unit.cardId);
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

function aggregateIncomingEstimate(state, lane, point, defender, horizonTicks, catalog) {
  const defenderRadius = catalog.questionValues.get(defender.bodyRadiusPolicy.questionKey);
  const towerTargetId = towerTargetIdForLane(lane.id);
  const incoming = [];
  for (const enemy of state.battle.units.filter(({ alive, side }) => alive && side === "north")) {
    const profile = entityForUnit(enemy, catalog);
    if (profile === null || !canHitLayer(profile.targetMode, "air")) continue;
    const speed = Math.max(profile.movementMillitilesPerSecond, 1);
    const directDistance = Math.hypot(enemy.position.x - point.x, enemy.position.y - point.y);
    let closestDistance = directDistance;
    let approachTicks = Math.ceil(Math.max(0, directDistance - enemy.reach - enemy.radius - defenderRadius) * 60 / speed);
    let approachBasis = "current-position";
    if (towerTargetId !== null && enemy.targetId === towerTargetId) {
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
      targetMode: enemy.targetMode, damage: enemy.damage,
      hitSpeedTicks: enemy.attack.config.hitSpeedTicks, closestDistance: Math.round(closestDistance),
      approachTicks, firstImpactOffset, projectedHits: hits,
      projectedDamage: hits * enemy.damage, approachBasis });
  }
  return { projectedDamage: incoming.reduce((sum, entry) => sum + entry.projectedDamage, 0), incoming };
}

const southLaneTargetIds = new Map([
  [Number.MAX_SAFE_INTEGER - 4, "south:lane:west"],
  [Number.MAX_SAFE_INTEGER - 3, "south:lane:east"],
]);

function towerTargetIdForLane(laneId) {
  for (const [targetId, targetLaneId] of southLaneTargetIds) {
    if (targetLaneId === laneId) return targetId;
  }
  return null;
}

function aggregateDefensePlan(state, lastEmergencyTick, catalog) {
  if (state.clock.phase !== "overtime") return null;
  const livingSouthLanes = state.battle.towers.filter(({ hitpoints, id, role, side }) =>
    side === "south" && role === "lane" && hitpoints > 0);
  if (livingSouthLanes.length !== 1) return null;
  const lane = livingSouthLanes[0];
  const towerTargetId = towerTargetIdForLane(lane.id);
  if (towerTargetId === null) return null;
  const threats = state.battle.units.filter(({ alive, side, targetId }) =>
    alive && side === "north" && targetId === towerTargetId).sort((a, b) => a.id - b.id);
  if (threats.length === 0 || state.tick - lastEmergencyTick < ENDURANCE_EMERGENCY_COOLDOWN_TICKS) {
    return null;
  }
  const options = [];
  const checkedPairs = new Set();
  for (const threat of threats) {
    const targetableCards = state.decks.south.hand.flatMap((cardId, slot) => {
      const card = catalog.cards.get(cardId);
      if (card === undefined || card.kind !== "unit" ||
          catalog.costs.get(cardId) > state.elixir.sides.south.amount ||
          card.entities.length !== 1 || card.entities[0].count !== 1) return [];
      const entity = card.entities[0];
      if (entity.layer !== "air" || entity.damage <= 0 || !canHitLayer(entity.targetMode, threat.layer)) return [];
      return [{ cardId, entity, slot }];
    });
    for (const candidate of targetableCards) {
      const { cardId, entity, slot } = candidate;
      const radius = catalog.questionValues.get(entity.bodyRadiusPolicy.questionKey);
      let bestForPair = null;
      for (let x = 500; x <= 17_500; x += 250) {
        for (let y = 500; y < 15_000; y += 250) {
          const point = { x, y };
          const distance = Math.hypot(threat.position.x - x, threat.position.y - y);
          if (distance > entity.rangeMillitiles + threat.radius + radius) continue;
          const placement = evaluateDeployment({ side: "south", placementClass: "ground_entity",
            point, destroyedOpposingLaneTowers: [] });
          if (!placement.legal) continue;
          const acquisition = counterTargetAcquisitions(cardId, point, state, catalog);
          if (acquisition.length !== 1 || acquisition[0].acquiredTargetId !== threat.id) continue;
          const impactsToKill = Math.ceil(threat.hitpoints / entity.damage);
          const projectileTicks = entity.delivery === "projectile"
            ? Math.ceil(distance / Math.max(entity.projectileSpeed ?? 0, 1)) : 0;
          const killTick = state.tick + entity.deployTimeTicks + entity.firstHitTicks + projectileTicks +
            Math.max(0, impactsToKill - 1) * entity.hitSpeedTicks;
          const horizon = killTick - state.tick;
          const risk = aggregateIncomingEstimate(state, lane, point, entity, horizon, catalog);
          const candidateEvidence = { threat, cardId, slot, point, distance: Math.round(distance),
            killTick, horizonTicks: horizon, risk, acquisition: acquisition[0],
            placementReason: placement.reason };
          if (bestForPair === null || risk.projectedDamage < bestForPair.risk.projectedDamage ||
              (risk.projectedDamage === bestForPair.risk.projectedDamage &&
               (horizon < bestForPair.horizonTicks || (horizon === bestForPair.horizonTicks &&
                distance < bestForPair.distance)))) bestForPair = candidateEvidence;
        }
      }
      if (bestForPair !== null) options.push(bestForPair);
      else checkedPairs.add(`${threat.id}:${cardId}`);
    }
  }
  if (options.length === 0) return null;
  options.sort((a, b) => a.risk.projectedDamage - b.risk.projectedDamage ||
    a.horizonTicks - b.horizonTicks || b.threat.damage - a.threat.damage ||
    a.cardId.localeCompare(b.cardId) || a.point.y - b.point.y || a.point.x - b.point.x);
  const selected = options[0];
  return { cardId: selected.cardId, point: selected.point, slot: selected.slot, tick: state.tick,
    decision: "overtime-last-lane-aggregate-air-intercept",
    policyEvidence: {
      laneId: lane.id,
      selectedThreatId: selected.threat.id,
      acquiredTargetId: selected.acquisition.acquiredTargetId,
      predictedKillTick: selected.killTick,
      projectedIncomingDamage: selected.risk.projectedDamage,
      candidateCount: options.length,
      uncheckedPairs: checkedPairs.size,
    } };
}

/**
 * State-aware GAME-001GPR5 policy. It keeps the frozen 300-tick planner and
 * checks aggregate-risk air counters at each 15-tick reaction boundary.
 */
export function createEnduranceWorkloadPolicy({ emergencyDecisionTicks = [] } = {}) {
  return createEnduranceWorkloadPolicyForCatalog({
    emergencyDecisionTicks,
    catalog: DEFAULT_WORKLOAD_CATALOG,
  });
}

/** Create a policy whose defensive choices come from an accepted setup. */
export function createSelectedEnduranceWorkloadPolicy({
  emergencyDecisionTicks = [],
  setupBytes,
} = {}) {
  return createEnduranceWorkloadPolicyForCatalog({
    emergencyDecisionTicks,
    catalog: workloadCatalogFromSetupBytes(setupBytes),
  });
}

function createEnduranceWorkloadPolicyForCatalog({ emergencyDecisionTicks, catalog }) {
  if (!Array.isArray(emergencyDecisionTicks) ||
      !emergencyDecisionTicks.every(Number.isSafeInteger) ||
      emergencyDecisionTicks.some((tick, index) => index > 0 && tick <= emergencyDecisionTicks[index - 1])) {
    throw new TypeError("endurance policy emergency history is invalid");
  }
  let emergencyHistory = [...emergencyDecisionTicks];
  let previewSession = null;
  let expectedPreviewTick = null;
  let expectedPreviewPlan = null;

  const mostRecentEmergencyTick = () => emergencyHistory.at(-1) ??
    -ENDURANCE_EMERGENCY_COOLDOWN_TICKS;

  return Object.freeze({
    plan(session) {
      const state = session.state;
      if (state.terminal) return null;
      if (state.tick % ENDURANCE_REACTION_INTERVAL_TICKS !== 0) {
        throw new TypeError("endurance decisions require a 15-tick reaction boundary");
      }
      const baseline = state.tick % ENDURANCE_BASELINE_INTERVAL_TICKS === 0
        ? plannedSouthAttempt(session, catalog) : null;
      const emergency = aggregateDefensePlan(state, mostRecentEmergencyTick(), catalog);
      let plan;
      if (emergency !== null) {
        emergencyHistory.push(state.tick);
        plan = { ...emergency,
          suppressedBaseline: baseline === null ? null : normalizedWorkloadCommand(baseline) };
      } else {
        plan = baseline === null ? null : { ...baseline, decision: "frozen-GH-baseline" };
      }
      if (expectedPreviewTick !== null) {
        if (state.tick !== expectedPreviewTick) {
          throw new Error(`endurance preview expected tick ${expectedPreviewTick}, received ${state.tick}`);
        }
        assert.deepEqual(normalizedWorkloadDecision(plan), normalizedWorkloadDecision(expectedPreviewPlan),
          "the live state-aware decision matches the adaptive forecast at its exact boundary");
        expectedPreviewTick = null;
        expectedPreviewPlan = null;
      }
      return plan;
    },

    /** Snapshot the policy cooldown alongside a simulation restore point. */
    snapshot() {
      return Object.freeze({ emergencyDecisionTicks: Object.freeze([...emergencyHistory]) });
    },

    /** Rewind policy state when its matching serialized simulation is restored. */
    restore(snapshot) {
      if (!Array.isArray(snapshot?.emergencyDecisionTicks) ||
          !snapshot.emergencyDecisionTicks.every(Number.isSafeInteger) ||
          snapshot.emergencyDecisionTicks.some((tick, index) =>
            index > 0 && tick <= snapshot.emergencyDecisionTicks[index - 1])) {
        throw new TypeError("endurance policy snapshot is invalid");
      }
      emergencyHistory = [...snapshot.emergencyDecisionTicks];
      previewSession = null;
      expectedPreviewTick = null;
      expectedPreviewPlan = null;
      return true;
    },

    /** Keep an already-created forecast on the same accepted physical branch. */
    recordAcceptedPhysicalDelivery(command) {
      if (previewSession === null) return false;
      if (previewSession.state.tick !== command.tick) {
        throw new Error(`endurance forecast at tick ${previewSession.state.tick} cannot admit tick ${command.tick}`);
      }
      const accepted = previewSession.submitPlayerCommand(canonical(command));
      if (!accepted.accepted) throw new Error("endurance forecast rejected an accepted physical delivery");
      return true;
    },

    /**
     * Simulate a clone to the earliest future 15-tick boundary with an action.
     * Browser segments can therefore remain 300 ticks when no action is due.
     */
    nextPlannedAttempt(session, maxTicks) {
      if (!Number.isSafeInteger(maxTicks) || maxTicks < 1 || maxTicks > ENDURANCE_BASELINE_INTERVAL_TICKS) {
        throw new TypeError("endurance look-ahead horizon must be 1 to 300 ticks");
      }
      const startTick = session.state.tick;
      if (startTick % ENDURANCE_REACTION_INTERVAL_TICKS !== 0 ||
          maxTicks % ENDURANCE_REACTION_INTERVAL_TICKS !== 0) {
        throw new TypeError("endurance look-ahead must start and end on a 15-tick reaction boundary");
      }
      const untilBaseline = ENDURANCE_BASELINE_INTERVAL_TICKS -
        (startTick % ENDURANCE_BASELINE_INTERVAL_TICKS);
      if (session.state.clock.phase !== "overtime" && maxTicks > ENDURANCE_REACTION_INTERVAL_TICKS &&
          maxTicks <= untilBaseline) {
        // No emergency is eligible in regulation, and the browser scheduler
        // ends this span at the next baseline boundary. The next loop checks
        // that boundary before any further simulation tick is driven.
        return null;
      }
      if (previewSession === null || previewSession.state.tick !== startTick) {
        previewSession = GameSession.restore(session.serialize());
      }
      assert.equal(previewSession.serialize(), session.serialize(),
        "retained forecast bytes exactly match the live session at each policy boundary");
      const preview = previewSession;
      const previewPolicy = createEnduranceWorkloadPolicyForCatalog({
        emergencyDecisionTicks: emergencyHistory,
        catalog,
      });
      let elapsedTicks = 0;
      while (elapsedTicks < maxTicks && !preview.state.terminal) {
        const remaining = maxTicks - elapsedTicks;
        const untilReaction = ENDURANCE_REACTION_INTERVAL_TICKS -
          (preview.state.tick % ENDURANCE_REACTION_INTERVAL_TICKS);
        const stepTicks = Math.min(remaining, untilReaction);
        preview.stepMany(stepTicks);
        elapsedTicks += stepTicks;
        if (preview.state.terminal || preview.state.tick % ENDURANCE_REACTION_INTERVAL_TICKS !== 0) continue;
        const plan = previewPolicy.plan(preview);
        if (plan !== null) {
          expectedPreviewTick = preview.state.tick;
          expectedPreviewPlan = plan;
          return Object.freeze({ plan, ticksAhead: preview.state.tick - startTick });
        }
      }
      expectedPreviewTick = preview.state.tick;
      expectedPreviewPlan = null;
      return null;
    },
  });
}

export function normalizedWorkloadCommand(command) {
  return { cardId: command.cardId, point: command.point, slot: command.slot, tick: command.tick };
}

function normalizedWorkloadDecision(plan) {
  return plan === null ? null : { ...normalizedWorkloadCommand(plan), decision: plan.decision };
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
