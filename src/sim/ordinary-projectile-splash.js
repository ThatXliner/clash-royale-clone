import {
  assertOrdinaryProjectileSplashProfile,
  getOrdinaryProjectileSplashSourceFacts,
} from "../shared/ordinary-projectile-delivery-authority.js";
import {
  MAX_SPATIAL_MILLITILES,
  circlesOverlap,
  validateCircle,
  validatePosition,
} from "./spatial.js";

export const COMBAT_UNIT_KEYS = Object.freeze([
  "cadenceTicks", "damage", "delivery", "deployTicks", "firstHitTicks",
  "id", "layer", "maxHealth", "position", "projectileSpeed", "radius",
  "reach", "side", "sightRange", "targetMode",
]);
const SIDES = new Set(["north", "south"]);
const LAYERS = new Set(["air", "ground"]);
const TARGET_MODES = new Set(["air", "air_and_ground", "buildings", "ground", "none"]);
const DELIVERIES = new Set(["melee", "projectile"]);
const MAX_TICK = 1_000_000_000;
const MAX_STAT = 1_000_000_000;

const UNIT_PROFILE_KEYS = Object.freeze([
  "archetypeId", "cardId", "catalogId", "enemiesOnly", "radiusMillitiles",
  "sourceExport", "targetLayers",
]);
const SOURCE_FACT_KEYS = Object.freeze([
  "aoeToAir", "aoeToGround", "characterAreaDamageRadiusMillitiles", "homing",
  "onlyEnemies", "radiusMillitiles", "speedRaw",
]);
const SETUP_FIELDS = Object.freeze([
  "projectileSplashPolicy", "projectileSplashSourceFacts",
]);

function exact(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
       Object.getPrototypeOf(value) !== null)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length ||
      actual.some((key, index) => key !== expected[index]) ||
      Object.values(descriptors).some((descriptor) =>
        !descriptor.enumerable || !Object.hasOwn(descriptor, "value"))) {
    throw new TypeError(`${label} has an invalid shape`);
  }
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function ownDataObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
       Object.getPrototypeOf(value) !== null) || Object.getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError(`${label} must be a plain string-keyed data object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
  }
  return descriptors;
}

function integer(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be a safe integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function checkedProfile(value, label) {
  const profile = exact(value, UNIT_PROFILE_KEYS, label);
  return assertOrdinaryProjectileSplashProfile(profile, profile.cardId, profile.archetypeId);
}

export function checkedUnitSplashShape(value, label, keys) {
  const descriptors = ownDataObject(value, label);
  const hasProfile = Object.hasOwn(descriptors, "splashProfile");
  const unit = exact(value, hasProfile ? [...keys, "splashProfile"] : keys, label);
  return {
    profile: hasProfile ? checkedProfile(unit.splashProfile, `${label}.splashProfile`) : null,
    unit,
  };
}

export function checkedSpawnSplashShape(value, label, keys) {
  const descriptors = ownDataObject(value, label);
  const hasProfile = Object.hasOwn(descriptors, "splashProfile");
  const record = exact(value, hasProfile ? [...keys, "splashProfile"] : keys, label);
  return {
    profile: hasProfile ? checkedProfile(record.splashProfile, `${label}.splashProfile`) : null,
    record,
  };
}

export function checkedCombatUnit(value, label = "battle combat unit") {
  const { profile, unit } = checkedUnitSplashShape(value, label, COMBAT_UNIT_KEYS);
  integer(unit.id, 1, Number.MAX_SAFE_INTEGER, `${label}.id`);
  if (!SIDES.has(unit.side)) throw new TypeError(`${label}.side is invalid`);
  if (!LAYERS.has(unit.layer)) throw new TypeError(`${label}.layer is invalid`);
  if (!TARGET_MODES.has(unit.targetMode)) {
    throw new TypeError(`${label}.targetMode is invalid`);
  }
  if (!DELIVERIES.has(unit.delivery)) {
    throw new TypeError(`${label}.delivery is invalid`);
  }
  const position = validatePosition(unit.position, `${label}.position`);
  validateCircle({ position, radius: unit.radius }, `${label} circle`);
  integer(unit.sightRange, 0, MAX_SPATIAL_MILLITILES, `${label}.sightRange`);
  integer(unit.reach, 0, MAX_SPATIAL_MILLITILES, `${label}.reach`);
  integer(unit.maxHealth, 1, MAX_STAT, `${label}.maxHealth`);
  integer(unit.damage, 0, MAX_STAT, `${label}.damage`);
  integer(unit.deployTicks, 0, MAX_TICK, `${label}.deployTicks`);
  integer(unit.firstHitTicks, 0, MAX_TICK, `${label}.firstHitTicks`);
  integer(unit.cadenceTicks, 1, MAX_TICK, `${label}.cadenceTicks`);
  if (unit.delivery === "melee") {
    if (unit.projectileSpeed !== null) {
      throw new TypeError(`${label}.projectileSpeed must be null for melee delivery`);
    }
  } else {
    integer(unit.projectileSpeed, 1, MAX_STAT, `${label}.projectileSpeed`);
  }
  return { ...unit, position: { ...position },
    ...(profile === null ? {} : { splashProfile: profile }) };
}

export function copyCombatUnitFields(unit, cloneValue) {
  const fields = Object.fromEntries(COMBAT_UNIT_KEYS.map((key) => [key, cloneValue(unit[key])]));
  if (Object.hasOwn(unit, "splashProfile")) fields.splashProfile = cloneValue(unit.splashProfile);
  return fields;
}

export function checkedCombatSpawn(value, label = "battle combat spawn") {
  const { profile, record: command } =
    checkedSpawnSplashShape(value, label, [...COMBAT_UNIT_KEYS, "tick"]);
  const tick = integer(command.tick, 0, MAX_TICK, `${label}.tick`);
  const unit = checkedCombatUnit(Object.fromEntries([
    ...COMBAT_UNIT_KEYS, ...(profile === null ? [] : ["splashProfile"]),
  ].map((key) => [key, command[key]])), `${label}.unit`);
  return { ...unit, tick };
}

export function ordinaryProjectileSplashEntityShape(raw, keys) {
  const hasProfile = raw !== null && typeof raw === "object" && !Array.isArray(raw) &&
    (Object.hasOwn(raw, "projectileSplashPolicy") ||
      Object.hasOwn(raw, "projectileSplashSourceFacts"));
  return {
    hasProfile,
    keys: hasProfile ? [...keys, ...SETUP_FIELDS] : keys,
  };
}

export function assertOrdinaryProjectileSplashReceipt(entity, cardId, archetypeId, label) {
  const profile = assertOrdinaryProjectileSplashProfile(
    exact(entity.projectileSplashPolicy, UNIT_PROFILE_KEYS,
      `${label}.projectileSplashPolicy`), cardId, archetypeId,
  );
  const sourceFacts = exact(entity.projectileSplashSourceFacts, SOURCE_FACT_KEYS,
    `${label}.projectileSplashSourceFacts`);
  const expected = getOrdinaryProjectileSplashSourceFacts(cardId, archetypeId);
  if (expected === null || SOURCE_FACT_KEYS.some((key) => sourceFacts[key] !== expected[key])) {
    throw new TypeError(`${label} splash source facts diverge from their pinned receipt`);
  }
  return { profile, sourceFacts };
}

export function ordinaryProjectileSplashEntityFields(entity, cardId, archetypeId, label) {
  const { profile, sourceFacts } =
    assertOrdinaryProjectileSplashReceipt(entity, cardId, archetypeId, label);
  return {
    projectileSplashPolicy: profile,
    projectileSplashSourceFacts: sourceFacts,
  };
}

export function ordinaryProjectileSplashCombatFields(component) {
  return component.projectileSplashPolicy === undefined
    ? {} : { splashProfile: component.projectileSplashPolicy };
}

function selectTargets({ center, enemySide, primaryTargetId, profile, structures, units }) {
  const targets = [];
  const overlaps = (target) => circlesOverlap(
    { position: center, radius: profile.radiusMillitiles },
    { position: target.position, radius: target.radius },
  );
  for (const unit of units) {
    if (!unit.alive || !unit.targetable || unit.side !== enemySide ||
        unit.id === primaryTargetId || !profile.targetLayers.includes(unit.layer) ||
        !overlaps(unit)) continue;
    targets.push({ ...unit, targetKind: "unit" });
  }
  for (const structure of structures) {
    if (!structure.alive || !structure.targetable || structure.side !== enemySide ||
        structure.id === primaryTargetId || !profile.targetLayers.includes(structure.layer) ||
        !overlaps(structure)) continue;
    targets.push({ ...structure, targetKind: "structure" });
  }
  targets.sort((left, right) => left.id - right.id);
  return targets;
}

export function planOrdinaryProjectileSplashImpact({
  attackerId, attackSequence, center, damage, enemySide, primaryKind, primaryStatus,
  primaryTarget, primaryTargetId, primaryTargetable, profile, projectileId, structures,
  tick, units,
}) {
  const primaryWithinSplash = profile === null || primaryStatus !== "contact" ||
    (primaryTarget !== null && circlesOverlap(
      { position: center, radius: profile.radiusMillitiles },
      { position: primaryTarget.position, radius: primaryTarget.radius ?? 0 },
    ));
  const eligiblePrimary = profile === null || primaryStatus !== "contact" ||
    (primaryTarget !== null && primaryTarget.side === enemySide &&
      profile.targetLayers.includes(primaryTarget.layer) && primaryTargetable && primaryWithinSplash);
  const impactStatus = eligiblePrimary ? primaryStatus : "target_missing";
  const splashTargets = profile === null ? [] : selectTargets({
    center, enemySide, primaryTargetId, profile, structures, units,
  });
  const unitHits = [];
  const hitSources = [];
  const structureContacts = [];
  const visualContacts = [{ id: primaryTargetId, position: center, status: impactStatus }];
  const addContact = (target, kind) => {
    visualContacts.push({ id: target.id, position: target.position, status: "contact" });
    if (kind === "unit") {
      unitHits.push({ amount: damage, targetId: target.id });
      hitSources.push({ attackerId, delivery: "projectile", projectileId });
    } else {
      structureContacts.push({
        contactTick: tick,
        attackSequence,
        damage,
        delivery: "projectile",
        projectileId,
        sourceUnitId: attackerId,
        structureId: target.structureId,
        tick,
        type: "external-structure-contact",
      });
    }
  };
  if (impactStatus === "contact") {
    addContact(primaryKind === "structure"
      ? { ...primaryTarget, structureId: primaryTarget.structureId }
      : { id: primaryTargetId, position: center }, primaryKind);
  }
  for (const target of splashTargets) addContact(target, target.targetKind);
  return { hitSources, impactStatus, structureContacts, unitHits, visualContacts };
}

export function selectOrdinaryProjectileSplashTargets({
  center, enemySide, primaryTargetId, profile, structures, units,
}) {
  return selectTargets({ center, enemySide, primaryTargetId, profile, structures, units });
}
