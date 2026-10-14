import assert from "node:assert/strict";
import { createSessionTroopWitness } from "/tmp/cards019h1-critic-7a6bc18/src/content/session-troop-roster.js";
import { PLAYABLE_CARD_IDS } from "/tmp/cards019h1-critic-7a6bc18/src/content/playable-roster.js";
import { LiveBattle } from "/tmp/cards019h1-critic-7a6bc18/src/sim/live-battle.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function questionReferences(roster) {
  return roster.flatMap(({ entities }) => entities.flatMap((entity) => [
    entity.bodyRadiusPolicy, entity.projectileSpeedPolicy, entity.deliveryPolicy,
    entity.layerPolicy, entity.damagePolicy,
  ].filter((policy) => policy?.kind === "question").map(({ questionKey }) => questionKey)
    .concat((entity.sourceConfidencePolicy?.fields ?? [])
      .map(({ questionKey }) => questionKey))));
}

function pairedProjectileSetup(cardIds) {
  const sourceIds = [...cardIds];
  const witnesses = sourceIds.map((id) => createSessionTroopWitness(id));
  const cardsById = new Map();
  const questionsByKey = new Map();
  for (const witness of witnesses) {
    for (const card of witness.roster) cardsById.set(card.id, card);
    for (const question of witness.questions) {
      const previous = questionsByKey.get(question.key);
      if (previous !== undefined) assert.deepEqual(question, previous, question.key);
      else questionsByKey.set(question.key, question);
    }
  }
  const selectedIds = [...sourceIds,
    ...PLAYABLE_CARD_IDS.filter((id) => !sourceIds.includes(id)).slice(0, 8 - sourceIds.length)];
  const roster = selectedIds.map((id) => {
    const card = cardsById.get(id);
    assert.ok(card, `paired witness includes ${id}`);
    return structuredClone(card);
  });
  const keys = [...new Set(questionReferences(roster))].sort();
  return canonical({ initialWindupTicks: { central: 0, lane: 0 },
    questions: keys.map((key) => {
      const question = questionsByKey.get(key);
      assert.ok(question, `paired witness closes ${key}`);
      return question;
    }), roster });
}

function ceilSqrt(value) {
  let low = 0n;
  let high = value + 1n;
  while (low + 1n < high) {
    const middle = (low + high) / 2n;
    if (middle * middle < value) low = middle;
    else high = middle;
  }
  return high * high === value ? high : high;
}

function oracleAdvance(position, targetPosition, targetRadius, speed) {
  const dx = BigInt(targetPosition.x) - BigInt(position.x);
  const dy = BigInt(targetPosition.y) - BigInt(position.y);
  const distanceSquared = dx * dx + dy * dy;
  const reach = BigInt(targetRadius + speed);
  if (distanceSquared <= reach * reach) return { contact: true, position: { ...targetPosition } };
  const distance = ceilSqrt(distanceSquared);
  return { contact: false, position: {
    x: Number(BigInt(position.x) + dx * BigInt(speed) / distance),
    y: Number(BigInt(position.y) + dy * BigInt(speed) / distance),
  } };
}

function travelTicks(position, targetPosition, targetRadius, speed) {
  const dx = BigInt(position.x) - BigInt(targetPosition.x);
  const dy = BigInt(position.y) - BigInt(targetPosition.y);
  const distanceSquared = dx * dx + dy * dy;
  const reached = (ticks) => {
    const distance = BigInt(targetRadius) + BigInt(speed) * ticks;
    return distance * distance >= distanceSquared;
  };
  let low = 0n;
  let high = 1n;
  while (!reached(high)) high *= 2n;
  while (low + 1n < high) {
    const middle = (low + high) / 2n;
    if (reached(middle)) high = middle;
    else low = middle;
  }
  return Number(high);
}

function distanceCeil(left, right) {
  const dx = BigInt(left.x - right.x);
  const dy = BigInt(left.y - right.y);
  return Number(ceilSqrt(dx * dx + dy * dy));
}

function run(targetCardId, targetLayer, sourcePoint, targetPoint) {
  const battle = new LiveBattle(pairedProjectileSetup(["kilnkeeper", targetCardId]));
  battle.scheduleDeploy(canonical({ cardId: targetCardId, point: targetPoint,
    sequence: 0, side: "north", tick: 0 }));
  battle.scheduleDeploy(canonical({ cardId: "kilnkeeper", point: sourcePoint,
    sequence: 1, side: "south", tick: 0 }));
  let launch = null;
  for (let tick = 0; tick < 240 && launch === null; tick += 1) {
    launch = battle.step().find(({ projectile, type }) => type === "projectile-launch" &&
      projectile?.splashProfile?.homing === true) ?? null;
  }
  assert.ok(launch, `${targetLayer} homing projectile launched`);
  const launchProjectile = launch.projectile;
  const targetId = launchProjectile.targetId;
  const targetAtLaunch = battle.state.units.find(({ id }) => id === targetId);
  assert.equal(targetAtLaunch?.cardId, targetCardId);
  const checkpoint = battle.serialize();
  const snapshot = JSON.parse(checkpoint);
  const restoredByteExact = LiveBattle.restore(checkpoint).serialize() === checkpoint;
  const injectedMotion = structuredClone(snapshot);
  injectedMotion.homingProjectiles = [{ id: launchProjectile.id, impactTick: battle.state.tick,
    position: { x: 1, y: 1 } }];
  const injectedState = structuredClone(snapshot);
  injectedState.state = { projectiles: [{ id: launchProjectile.id,
    position: { x: 1, y: 1 } }] };
  const tamperedProfile = structuredClone(snapshot);
  tamperedProfile.setup.roster.find(({ id }) => id === "kilnkeeper")
    .entities[0].projectileSplashPolicy.homing = false;
  const nestedBattle = JSON.parse(snapshot.battle);
  assert.ok(nestedBattle.history.length > 0);
  nestedBattle.history.pop();
  const tamperedCausalState = structuredClone(snapshot);
  tamperedCausalState.battle = canonical(nestedBattle);
  const rejects = (value) => {
    try {
      LiveBattle.restore(canonical(value));
      return false;
    } catch {
      return true;
    }
  };
  const snapshotValidation = {
    restoredByteExact,
    injectedMotionRejected: rejects(injectedMotion),
    injectedStateRejected: rejects(injectedState),
    tamperedProfileRejected: rejects(tamperedProfile),
    tamperedCausalBattleStateRejected: rejects(tamperedCausalState),
    serializedMotionWitnessFieldAbsent: !Object.hasOwn(snapshot, "homingProjectiles"),
    battleHistoryRecordsAtPendingLaunch: nestedBattle.history.length + 1,
  };
  assert.ok(Object.values(snapshotValidation).filter((value) => typeof value === "boolean")
    .every(Boolean));
  const lockedCenter = { ...launchProjectile.targetPosition };
  const lockedRadius = targetAtLaunch.radius;
  let lockedPath = { ...launchProjectile.position };
  let targetMovedBoundaries = 0;
  let uniqueLiveSteps = new Set();
  let firstLockedPathDivergence = null;
  let actualPath = [];
  let targetPath = [];
  let oracleChecks = 0;
  let impact = null;
  let contactPosition = null;
  let targetAtContact = null;
  let boundaries = 0;
  let previousTarget = { ...targetAtLaunch.position };
  while (boundaries < 120 && impact === null) {
    const before = battle.state.projectiles.find(({ id }) => id === launchProjectile.id);
    assert.ok(before);
    const events = battle.step();
    const after = battle.state.projectiles.find(({ id }) => id === launchProjectile.id);
    const liveTarget = battle.state.units.find(({ id }) => id === targetId);
    assert.ok(liveTarget?.alive);
    if (liveTarget.position.x !== previousTarget.x || liveTarget.position.y !== previousTarget.y) {
      targetMovedBoundaries += 1;
    }
    previousTarget = { ...liveTarget.position };
    const expected = oracleAdvance(before.position, liveTarget.position, liveTarget.radius, 500);
    oracleChecks += 1;
    targetPath.push({ tick: battle.state.tick, x: liveTarget.position.x, y: liveTarget.position.y });
    const fixed = oracleAdvance(lockedPath, lockedCenter, lockedRadius, 500);
    lockedPath = fixed.position;
    if (after !== undefined) {
      assert.equal(expected.contact, false);
      assert.deepEqual(after.position, expected.position);
      assert.deepEqual(after.targetPosition, liveTarget.position);
      assert.equal(after.targetId, targetId);
      assert.equal(after.impactTick, battle.state.tick);
      const step = { x: after.position.x - before.position.x,
        y: after.position.y - before.position.y };
      uniqueLiveSteps.add(`${step.x},${step.y}`);
      actualPath.push({ tick: battle.state.tick, x: after.position.x, y: after.position.y });
      if (firstLockedPathDivergence === null &&
          (after.position.x !== lockedPath.x || after.position.y !== lockedPath.y)) {
        firstLockedPathDivergence = { tick: battle.state.tick,
          live: { ...after.position }, locked: { ...lockedPath } };
      }
    } else {
      impact = events.find(({ projectileId, type }) =>
        projectileId === launchProjectile.id && type === "projectile-impact");
      assert.ok(impact);
      assert.equal(expected.contact, true);
      assert.equal(impact.status, "contact");
      contactPosition = expected.position;
      targetAtContact = { ...liveTarget.position };
    }
    boundaries += 1;
  }
  assert.ok(impact);
  return { targetCardId, targetLayer, launchTick: launch.tick,
    projectileId: launchProjectile.id, targetId, launchProjectilePosition: launchProjectile.position,
    launchTargetCenter: launchProjectile.targetPosition, launchTargetRadius: lockedRadius,
    contactTick: impact.tick, pursuitBoundaries: boundaries,
    targetMovedBoundaries, oracleChecks, oracleMismatches: 0,
    uniqueLiveStepVectors: uniqueLiveSteps.size, firstFiveLivePositions: actualPath.slice(0, 5),
    targetPositions: targetPath,
    firstLockedPathDivergence, targetDisplacementFromLaunchAtContact:
      distanceCeil(targetAtContact, launchProjectile.targetPosition),
    launchPointTravelTicksAtRuntimeSpeed: travelTicks(launchProjectile.position,
      launchProjectile.targetPosition, lockedRadius, 500),
    contactPosition, targetAtContact, impactStatus: impact.status,
    liveContactCenterDiffersFromLockedLaunchCenter:
      contactPosition.x !== lockedCenter.x || contactPosition.y !== lockedCenter.y,
    exactlyOneImpact: battle.replay.filter(({ projectileId, type }) =>
      projectileId === launchProjectile.id && type === "projectile-impact").length === 1,
    snapshotValidation };
}

const results = [
  run("coilblade", "ground", { x: 5_000, y: 14_500 }, { x: 3_500, y: 19_500 }),
  run("skymaul", "air", { x: 3_500, y: 14_500 }, { x: 5_000, y: 19_500 }),
];
console.log(JSON.stringify(results, null, 2));
