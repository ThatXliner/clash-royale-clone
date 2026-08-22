import { createBasicFlyingCatalog } from "./cards/basic-flying.js";
import { createBasicMeleeCatalog } from "./cards/basic-melee.js";
import { createBasicRangedCatalog } from "./cards/basic-ranged.js";
import { createSwarmCatalog } from "./cards/swarms.js";
import { createStructureSeekerCatalog } from "./cards/structure-seeker.js";
import { createShieldFormCatalog } from "./cards/shields-forms.js";
import { createChargeSpecialCatalog } from "./cards/special-movement-charge.js";
import { createDashSpecialCatalog } from "./cards/special-movement-dash.js";
import { createJumpSpecialCatalog } from "./cards/special-movement-jump.js";
import { createRecoilSpecialCatalog } from "./cards/special-movement-recoil.js";
import { createRetargetSpecialCatalog } from "./cards/special-movement-retarget.js";
import { createChargeKnockbackCatalog } from "./cards/special-movement-charge-knockback.js";
import { createChainSpecialCatalog } from "./cards/special-projectiles-chain.js";
import { createPierceSpecialCatalog } from "./cards/special-projectiles-pierce.js";
import { createReturnSpecialCatalog } from "./cards/special-projectiles-return.js";
import { createPelletSpecialCatalog } from "./cards/special-projectiles-pellets.js";
import { createReflectionSpecialCatalog } from "./cards/special-projectiles-reflection.js";
import { createRampSpecialCatalog } from "./cards/special-combat-ramp.js";
import { createStunSpecialCatalog } from "./cards/combat-status-stun.js";
import { createSlowSpecialCatalog } from "./cards/special-combat-slow.js";
import { createSnareSpecialCatalog } from "./cards/special-combat-snare.js";
import { createHealCatalog } from "./cards/combat-status-heal.js";
import { createInvisibilitySpecialCatalog } from "./cards/combat-status-invisibility.js";
import { createChampionAbilityCatalog } from "./cards/champion-abilities.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
  PLAYABLE_CARD_IDS,
} from "./playable-roster.js";
import { createSessionTroopProfileManifest } from "./session-troop-profile-catalog.js";

const QUESTION_SOURCE = "runtime-playability-estimate-not-comparison-corpus";
const DELIVERY_VALUES = Object.freeze({ melee: 1, projectile: 2 });
const LAYER_VALUES = Object.freeze({ ground: 1, air: 2 });
const QUESTION_ESTIMATES = Object.freeze({
  bodyRadiusForCountOne: 500,
  bodyRadiusForMembers: 300,
  damage: 1,
  projectileSpeed: 500,
});

// These are source-occurrence classifications for an ordinary runtime estimate.
// They do not claim the special mechanic represented by the catalog export.
const PROJECTILE_OCCURRENCES = new Set([
  "createChainSpecialCatalog",
  "createPelletSpecialCatalog",
  "createPierceSpecialCatalog",
  "createReflectionSpecialCatalog",
  "createReturnSpecialCatalog",
]);

const SOURCE_FACTORIES = Object.freeze({
  createBasicFlyingCatalog,
  createBasicMeleeCatalog,
  createBasicRangedCatalog,
  createSwarmCatalog,
  createStructureSeekerCatalog,
  createShieldFormCatalog,
  createChargeSpecialCatalog,
  createDashSpecialCatalog,
  createJumpSpecialCatalog,
  createRecoilSpecialCatalog,
  createRetargetSpecialCatalog,
  createChargeKnockbackCatalog,
  createChainSpecialCatalog,
  createPierceSpecialCatalog,
  createReturnSpecialCatalog,
  createPelletSpecialCatalog,
  createReflectionSpecialCatalog,
  createRampSpecialCatalog,
  createStunSpecialCatalog,
  createSlowSpecialCatalog,
  createSnareSpecialCatalog,
  createHealCatalog,
  createInvisibilitySpecialCatalog,
  createChampionAbilityCatalog,
});

const CARD_FIELDS = Object.freeze([
  "areaDamageRadiusMillitiles",
  "components",
  "cost",
  "count",
  "damage",
  "deployTimeTicks",
  "displayName",
  "firstHitTicks",
  "hitSpeedTicks",
  "hitpoints",
  "id",
  "kind",
  "movementMillitilesPerSecond",
  "rangeMillitiles",
  "rarity",
  "sightRangeMillitiles",
  "targetMode",
]);
const COMPONENT_FIELDS = Object.freeze([
  "areaDamageRadiusMillitiles",
  "count",
  "damage",
  "deployTimeTicks",
  "displayName",
  "firstHitTicks",
  "hitSpeedTicks",
  "hitpoints",
  "id",
  "kind",
  "movementMillitilesPerSecond",
  "rangeMillitiles",
  "role",
  "sightRangeMillitiles",
  "targetMode",
]);

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function deepFreezeClone(value) {
  return freeze(clone(value));
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertNoArguments(args, label) {
  if (args.length !== 0) throw new TypeError(`${label} takes exactly one argument`);
}

function checkedId(id, args, label) {
  assertNoArguments(args, label);
  if (typeof id !== "string") throw new TypeError(`${label} ID must be a primitive string`);
  return id;
}

function exactFields(value, fields, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain source record`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]) ||
      Object.values(descriptors).some((descriptor) =>
        !descriptor.enumerable || !Object.hasOwn(descriptor, "value"))) {
    throw new TypeError(`${label} has an incomplete or extra source field`);
  }
  return value;
}

function sourceRecords(exportName) {
  const factory = SOURCE_FACTORIES[exportName];
  if (typeof factory !== "function") {
    throw new Error(`session troop source export ${exportName} is missing`);
  }
  const records = factory();
  if (!Array.isArray(records)) throw new TypeError(`${exportName} does not provide source records`);
  return records;
}

function sourceRecordFor(exportName, id) {
  const matches = sourceRecords(exportName).filter((record) =>
    record !== null && typeof record === "object" && record.id === id);
  if (matches.length !== 1) {
    throw new Error(`${exportName}/${id} does not provide exactly one source record`);
  }
  return matches[0];
}

function validateSourceRecord(record, label) {
  exactFields(record, CARD_FIELDS, label);
  if (record.kind !== "unit" || !Array.isArray(record.components) || record.components.length > 16) {
    throw new TypeError(`${label} is not a bounded unit source record`);
  }
  for (let index = 0; index < record.components.length; index += 1) {
    exactFields(record.components[index], COMPONENT_FIELDS, `${label}.components[${index}]`);
  }
  return record;
}

function sourceProjectionState() {
  const manifest = createSessionTroopProfileManifest();
  const occurrenceExports = new Set(
    manifest.profiles.flatMap(({ occurrenceExports: exports }) => exports),
  );
  const factoryExports = Object.keys(SOURCE_FACTORIES);
  if (canonical([...occurrenceExports].sort()) !== canonical([...factoryExports].sort())) {
    throw new Error("session troop source factory map is not bijective with admitted occurrences");
  }
  const byId = new Map();
  const exportsById = new Map();
  for (const profile of manifest.profiles) {
    const records = profile.occurrenceExports.map((exportName) =>
      validateSourceRecord(sourceRecordFor(exportName, profile.id),
        `${exportName}/${profile.id}`));
    const sourceBytes = canonical(records[0]);
    if (records.some((record) => canonical(record) !== sourceBytes)) {
      throw new Error(`session troop duplicate source records diverge for ${profile.id}`);
    }
    byId.set(profile.id, records[0]);
    exportsById.set(profile.id, Object.freeze([...profile.occurrenceExports].sort()));
  }
  if (byId.size !== manifest.profiles.length) {
    throw new Error("session troop source projection has duplicate profile identities");
  }
  return { byId, exportsById };
}

const { byId: SOURCE_BY_ID, exportsById: EXPORTS_BY_ID } = sourceProjectionState();
const PLAYABLE_BY_ID = new Map(createPlayableRoster().map((card) => [card.id, card]));
const PLAYABLE_QUESTIONS_BY_KEY = new Map(
  createPlayableRosterQuestionRecords().map((record) => [record.key, record]),
);

function questionPolicy(key) {
  return { kind: "question", questionKey: key };
}

function estimateBodyRadius(component) {
  return component.count === 1
    ? QUESTION_ESTIMATES.bodyRadiusForCountOne
    : QUESTION_ESTIMATES.bodyRadiusForMembers;
}

function estimateDelivery(id) {
  return [...EXPORTS_BY_ID.get(id)].some((exportName) =>
    PROJECTILE_OCCURRENCES.has(exportName)) ? "projectile" : "melee";
}

function estimateLayer() {
  return "ground";
}

function estimateQuestion(key, value) {
  return {
    authoritative: false,
    confidence: "unverified",
    disposition: "question",
    key,
    source: QUESTION_SOURCE,
    value,
  };
}

function projectOrdinaryEntity(card, component) {
  const source = component ?? card;
  const archetypeId = component === null ? card.id : component.id;
  const delivery = estimateDelivery(card.id);
  const layer = estimateLayer(card.id);
  const bodyRadiusKey = `${archetypeId}.body-radius-millitiles`;
  const projectileSpeedKey = `${archetypeId}.projectile-speed-millitiles-per-tick`;
  const entity = {
    archetypeId,
    areaDamageRadiusMillitiles: source.areaDamageRadiusMillitiles,
    bodyRadiusPolicy: questionPolicy(bodyRadiusKey),
    count: source.count,
    damage: source.damage,
    delivery,
    deployTimeTicks: source.deployTimeTicks,
    displayName: source.displayName,
    firstHitTicks: source.firstHitTicks,
    hitSpeedTicks: source.hitSpeedTicks,
    hitpoints: source.hitpoints,
    kind: source.kind,
    layer,
    movementMillitilesPerSecond: source.movementMillitilesPerSecond,
    projectileSpeedPolicy: delivery === "projectile"
      ? questionPolicy(projectileSpeedKey)
      : { kind: "not-applicable", questionKey: null },
    rangeMillitiles: source.rangeMillitiles,
    role: component === null ? "primary" : component.role,
    sightRangeMillitiles: source.sightRangeMillitiles,
    targetMode: source.targetMode,
    deliveryPolicy: questionPolicy(`${archetypeId}.delivery`),
    layerPolicy: questionPolicy(`${archetypeId}.layer`),
  };
  if (source.damage === null) {
    entity.damagePolicy = questionPolicy(`${archetypeId}.damage`);
  }
  return entity;
}

function projectFromSource(id) {
  const source = SOURCE_BY_ID.get(id);
  const components = source.components.length === 0
    ? [projectOrdinaryEntity(source, null)]
    : source.components.map((component) => projectOrdinaryEntity(source, component));
  return {
    areaDamageRadiusMillitiles: source.areaDamageRadiusMillitiles,
    cost: source.cost,
    count: source.count,
    damage: source.damage,
    deployTimeTicks: source.deployTimeTicks,
    displayName: source.displayName,
    entities: components,
    firstHitTicks: source.firstHitTicks,
    formation: {
      componentOrder: components.map(({ archetypeId }) => archetypeId),
      expansionOrder: "component-order-then-member-index",
      totalCount: components.reduce((sum, component) => sum + component.count, 0),
    },
    hitSpeedTicks: source.hitSpeedTicks,
    hitpoints: source.hitpoints,
    id: source.id,
    kind: source.kind,
    movementMillitilesPerSecond: source.movementMillitilesPerSecond,
    rangeMillitiles: source.rangeMillitiles,
    rarity: source.rarity,
    sightRangeMillitiles: source.sightRangeMillitiles,
    targetMode: source.targetMode,
  };
}

function compileProjection(id) {
  if (PLAYABLE_BY_ID.has(id)) return PLAYABLE_BY_ID.get(id);
  return projectFromSource(id);
}

const PROJECTED_BY_ID = new Map(
  [...SOURCE_BY_ID.keys()].map((id) => [id, freeze(compileProjection(id))]),
);

function policyQuestionKeys(card) {
  return card.entities.flatMap((entity) => [
    entity.bodyRadiusPolicy,
    entity.projectileSpeedPolicy,
    entity.deliveryPolicy,
    entity.layerPolicy,
    entity.damagePolicy,
  ].filter((policy) => policy?.kind === "question").map(({ questionKey }) => questionKey));
}

function questionRecordFor(key, card) {
  const playable = PLAYABLE_QUESTIONS_BY_KEY.get(key);
  if (playable !== undefined) return playable;
  const entity = card.entities.find((candidate) => [
    candidate.bodyRadiusPolicy,
    candidate.projectileSpeedPolicy,
    candidate.deliveryPolicy,
    candidate.layerPolicy,
    candidate.damagePolicy,
  ].some((policy) => policy?.questionKey === key));
  if (entity === undefined) throw new Error(`session troop question ${key} is not referenced`);
  if (key.endsWith(".body-radius-millitiles")) {
    return estimateQuestion(key, estimateBodyRadius(entity));
  }
  if (key.endsWith(".projectile-speed-millitiles-per-tick")) {
    return estimateQuestion(key, QUESTION_ESTIMATES.projectileSpeed);
  }
  if (key.endsWith(".delivery")) {
    return estimateQuestion(key, entity.delivery === "projectile"
      ? DELIVERY_VALUES.projectile : DELIVERY_VALUES.melee);
  }
  if (key.endsWith(".layer")) {
    return estimateQuestion(key, entity.layer === "air" ? LAYER_VALUES.air : LAYER_VALUES.ground);
  }
  if (key.endsWith(".damage")) return estimateQuestion(key, QUESTION_ESTIMATES.damage);
  throw new Error(`session troop question ${key} has no bounded runtime estimate`);
}

function compileWitness(id) {
  const fillerIds = PLAYABLE_CARD_IDS.filter((candidate) => candidate !== id).slice(0, 7);
  const roster = [id, ...fillerIds].map((cardId) => PROJECTED_BY_ID.get(cardId));
  if (roster.length !== 8 || roster.some((card) => card === undefined)) {
    throw new Error(`session troop witness for ${id} is not exactly eight cards`);
  }
  const cards = roster.map((card) => clone(card));
  const questionKeys = [...new Set(cards.flatMap(policyQuestionKeys))].sort();
  const questions = questionKeys.map((key) => questionRecordFor(key, cards.find((card) =>
    policyQuestionKeys(card).includes(key))));
  return freeze({
    initialWindupTicks: { central: 0, lane: 0 },
    questions,
    roster: cards,
  });
}

const WITNESS_BY_ID = new Map(
  [...PROJECTED_BY_ID.keys()].map((id) => [id, compileWitness(id)]),
);

function clonePublic(value) {
  return deepFreezeClone(value);
}

export function projectSessionTroopBattleCard(id, ...args) {
  const checked = checkedId(id, args, "session troop battle card projection");
  const card = PROJECTED_BY_ID.get(checked);
  if (card === undefined) {
    throw new RangeError("session troop battle card ID is unknown or not admitted");
  }
  return clonePublic(card);
}

export function createSessionTroopWitnessRoster(id, ...args) {
  const checked = checkedId(id, args, "session troop witness roster");
  const witness = WITNESS_BY_ID.get(checked);
  if (witness === undefined) {
    throw new RangeError("session troop witness ID is unknown or not admitted");
  }
  return clonePublic(witness.roster);
}

export function createSessionTroopWitnessQuestions(id, ...args) {
  const checked = checkedId(id, args, "session troop witness questions");
  const witness = WITNESS_BY_ID.get(checked);
  if (witness === undefined) {
    throw new RangeError("session troop witness ID is unknown or not admitted");
  }
  return clonePublic(witness.questions);
}

export function createSessionTroopWitness(id, ...args) {
  const checked = checkedId(id, args, "session troop witness");
  const witness = WITNESS_BY_ID.get(checked);
  if (witness === undefined) {
    throw new RangeError("session troop witness ID is unknown or not admitted");
  }
  return clonePublic(witness);
}

export function serializeSessionTroopWitness(id, ...args) {
  const checked = checkedId(id, args, "session troop witness serialization");
  const witness = WITNESS_BY_ID.get(checked);
  if (witness === undefined) {
    throw new RangeError("session troop witness ID is unknown or not admitted");
  }
  return canonical(witness);
}
