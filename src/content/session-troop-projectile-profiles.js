import {
  createBasicFlyingCatalog,
} from "./cards/basic-flying.js";
import {
  BasicRangedDuel,
  createBasicRangedCatalog,
  createBasicRangedCombatant,
} from "./cards/basic-ranged.js";
import {
  createSquadMembers,
  createSwarmCatalog,
} from "./cards/swarms.js";
import {
  createChainQuestionFixture,
  createChainSpecialCatalog,
} from "./cards/special-projectiles-chain.js";
import {
  createPierceQuestionFixture,
  createPierceSpecialCatalog,
} from "./cards/special-projectiles-pierce.js";
import {
  createReturnQuestionFixture,
  createReturnSpecialCatalog,
} from "./cards/special-projectiles-return.js";
import {
  createPelletQuestionFixture,
  createPelletSpecialCatalog,
} from "./cards/special-projectiles-pellets.js";
import {
  createReflectionQuestionFixture,
  createReflectionSpecialCatalog,
} from "./cards/special-projectiles-reflection.js";
import { createChampionAbilityCatalog } from "./cards/champion-abilities.js";
import { createSessionTroopProfileManifest } from "./session-troop-profile-catalog.js";
import { createSessionTroopWitnessQuestions } from "./session-troop-roster.js";

const VERSION = 1;
const MAX_SOURCE_RECORDS = 64;
const MAX_COMPONENTS = 16;
const MAX_QUESTION_RECORDS = 64;
const MAX_UNRESOLVED_DELIVERY_DEPENDENCIES = 16;
const MAX_ID_LENGTH = 128;

const EXPECTED_COUNTS = Object.freeze({
  claimedOccurrencePairs: 7,
  uniqueCardIds: 7,
  ordinarySourceClaims: 2,
  specialSourceClaims: 5,
  questionBearingClaims: 7,
  unresolvedDeliveryDependencies: 2,
  duplicatedCompositionOwnedIds: 1,
});

const IDENTITY_FIELDS = Object.freeze([
  "attackSequence",
  "direction",
  "projectileId",
  "sourceId",
]);

const SHARED_HOST_INTEGRATION = Object.freeze({
  authority: "LiveBattle",
  status: "pending-shared-host-integration",
});

const IDENTITY_REQUIREMENTS = Object.freeze({
  authority: "GAME-001TH",
  fields: IDENTITY_FIELDS,
  minting: "shared-host-owned",
  state: "not-owned-by-this-receipt",
  status: "required-adapter-contract",
});

const CLAIM_SPECS = Object.freeze([
  {
    archetype: "brassbolt",
    claimFamily: "ordinary-single-projectile",
    componentId: null,
    exportName: "createBasicRangedCatalog",
    id: "brassbolt",
    sourceKind: "ordinary",
  },
  {
    archetype: "reedsting",
    claimFamily: "ordinary-single-projectile",
    componentId: null,
    exportName: "createBasicRangedCatalog",
    id: "reedsting",
    sourceKind: "ordinary",
  },
  {
    archetype: "stormkite",
    claimFamily: "chain",
    componentId: null,
    exportName: "createChainSpecialCatalog",
    id: "stormkite",
    sourceKind: "special",
  },
  {
    archetype: "prism-warden",
    claimFamily: "pierce",
    componentId: null,
    exportName: "createPierceSpecialCatalog",
    id: "prism-warden",
    sourceKind: "special",
  },
  {
    archetype: "rune-reaver",
    claimFamily: "return",
    componentId: null,
    exportName: "createReturnSpecialCatalog",
    id: "rune-reaver",
    sourceKind: "special",
  },
  {
    archetype: "scatterguard",
    claimFamily: "pellets",
    componentId: null,
    exportName: "createPelletSpecialCatalog",
    id: "scatterguard",
    sourceKind: "special",
  },
  {
    archetype: "aegis-sage",
    claimFamily: "reflection",
    componentId: null,
    exportName: "createReflectionSpecialCatalog",
    id: "aegis-sage",
    sourceKind: "special",
  },
]);

const UNRESOLVED_DELIVERY_SPECS = Object.freeze([
  Object.freeze({
    archetype: "briar-darter",
    claimFamily: "ordinary-component-projectile",
    componentId: "briar-darter",
    exportName: "createSwarmCatalog",
    htoDeliveryQuestionKey: "briar-darter.delivery",
    htoDeliveryQuestionSource: "runtime-playability-estimate-not-comparison-corpus",
    htoDeliveryQuestionValue: 2,
    id: "briar-band",
    sourceKind: "ordinary",
  }),
  Object.freeze({
    archetype: "copperskiff",
    claimFamily: "ordinary-single-projectile",
    componentId: null,
    exportName: "createBasicFlyingCatalog",
    htoDeliveryQuestionKey: "copperskiff.delivery",
    htoDeliveryQuestionSource: "runtime-playability-estimate-not-comparison-corpus",
    htoDeliveryQuestionValue: 2,
    id: "copperskiff",
    sourceKind: "ordinary",
  }),
]);

// This is the complete non-projectile remainder of the HTP occurrence
// surface. Keeping it explicit prevents a range or name from becoming a
// projectile claim when a source catalog changes.
const EXCLUDED_OCCURRENCE_SPECS = Object.freeze([
  {
    exportName: "createChampionAbilityCatalog",
    id: "aegis-sage",
    reason: "composition membership is owned by the reflection claim; it is not a second projectile occurrence",
    status: "admitted",
  },
  {
    exportName: "DEATH_SPAWN_IDENTITY",
    id: "ashen-nest",
    reason: "HTP identity QUESTION is not a sourced projectile claim",
    status: "question",
  },
  {
    exportName: "createHealCatalog",
    id: "bloom-wisp",
    reason: "the status/heal occurrence exports no projectile delivery claim",
    status: "admitted",
  },
  {
    exportName: "createChampionAbilityCatalog",
    id: "bone-regent",
    reason: "the champion occurrence exports no projectile delivery claim",
    status: "admitted",
  },
  {
    exportName: "createRampSpecialCatalog",
    id: "cinder-ray",
    reason: "the status/combat occurrence exports no projectile delivery claim",
    status: "admitted",
  },
  {
    exportName: "createRecoilSpecialCatalog",
    id: "cinderback",
    reason: "the recoil occurrence exports movement displacement, not a projectile claim",
    status: "admitted",
  },
  {
    exportName: "createSwarmCatalog",
    id: "cinderlings",
    reason: "the swarm occurrence exports component statistics without projectile delivery evidence",
    status: "admitted",
  },
  {
    exportName: "createBasicMeleeCatalog",
    id: "coilblade",
    reason: "the melee occurrence is outside the projectile claim surface",
    status: "admitted",
  },
  {
    exportName: "createHealCatalog",
    id: "dawnmender",
    reason: "the status/heal occurrence exports no projectile delivery claim",
    status: "admitted",
  },
  {
    exportName: "createChampionAbilityCatalog",
    id: "dusk-ranger",
    reason: "the champion occurrence exports no projectile delivery claim",
    status: "admitted",
  },
  {
    exportName: "createChargeKnockbackCatalog",
    id: "emberlance",
    reason: "the charge composition occurrence does not source projectile delivery",
    status: "admitted",
  },
  {
    exportName: "createChargeSpecialCatalog",
    id: "emberlance",
    reason: "the charge occurrence exports movement mechanics, not a projectile claim",
    status: "admitted",
  },
  {
    exportName: "createChampionAbilityCatalog",
    id: "gilded-lancer",
    reason: "the champion occurrence exports no projectile delivery claim",
    status: "admitted",
  },
  {
    exportName: "DEATH_CONVERSION_IDENTITY",
    id: "gloam-shepherd",
    reason: "HTP identity QUESTION is not a sourced projectile claim",
    status: "question",
  },
  {
    exportName: "createChampionAbilityCatalog",
    id: "iron-borer",
    reason: "the champion occurrence exports no projectile delivery claim",
    status: "admitted",
  },
  {
    exportName: "createBasicMeleeCatalog",
    id: "mossguard",
    reason: "the melee occurrence is outside the projectile claim surface",
    status: "admitted",
  },
  {
    exportName: "createStunSpecialCatalog",
    id: "pulse-sentry",
    reason: "the status occurrence exports no projectile delivery claim",
    status: "admitted",
  },
  {
    exportName: "createShieldFormCatalog",
    id: "railward",
    reason: "the shield/form occurrence exports no projectile delivery claim",
    status: "admitted",
  },
  {
    exportName: "createSlowSpecialCatalog",
    id: "rime-adept",
    reason: "the status occurrence exports no projectile delivery claim",
    status: "admitted",
  },
  {
    exportName: "createBasicFlyingCatalog",
    id: "skymaul",
    reason: "the source and HTO projection do not claim delivery for this card; name and range are not delivery evidence",
    status: "admitted",
  },
  {
    exportName: "createStructureSeekerCatalog",
    id: "stonehauler",
    reason: "the structure-seeker occurrence exports targeting/movement, not a projectile claim",
    status: "admitted",
  },
  {
    exportName: "createJumpSpecialCatalog",
    id: "stonevault",
    reason: "the jump occurrence exports movement mechanics, not a projectile claim",
    status: "admitted",
  },
  {
    exportName: "createSnareSpecialCatalog",
    id: "tether-rider",
    reason: "the status occurrence exports no projectile delivery claim",
    status: "admitted",
  },
  {
    exportName: "createInvisibilitySpecialCatalog",
    id: "veil-prowler",
    reason: "the status occurrence exports no projectile delivery claim",
    status: "admitted",
  },
  {
    exportName: "createDashSpecialCatalog",
    id: "veilrunner",
    reason: "the dash occurrence exports movement mechanics, not a projectile claim",
    status: "admitted",
  },
  {
    exportName: "createRetargetSpecialCatalog",
    id: "wayfinder",
    reason: "the retarget occurrence exports targeting mechanics, not a projectile claim",
    status: "admitted",
  },
]);

const SOURCE_BINDINGS = new Map([
  ["createBasicRangedCatalog", {
    catalog: createBasicRangedCatalog,
    expectedIds: ["brassbolt", "reedsting"],
    evidence: {
      delivery: "projectile",
      verification: "cards-basic-ranged",
      sourceExports: [
        "createBasicRangedCatalog",
        "createBasicRangedCombatant",
        "BasicRangedDuel",
      ],
      sourceModule: "cards/basic-ranged",
    },
    interfaces: {
      BasicRangedDuel,
      createBasicRangedCatalog,
      createBasicRangedCombatant,
    },
  }],
  ["createBasicFlyingCatalog", {
    catalog: createBasicFlyingCatalog,
    expectedIds: ["copperskiff", "skymaul"],
    evidence: {
      delivery: "not-sourced",
      verification: "cards-basic-flying",
      sourceExports: ["createBasicFlyingCatalog"],
      sourceModule: "cards/basic-flying",
    },
    interfaces: {
      createBasicFlyingCatalog,
    },
  }],
  ["createSwarmCatalog", {
    catalog: createSwarmCatalog,
    expectedIds: ["briar-band", "cinderlings"],
    evidence: {
      delivery: "not-sourced",
      verification: "cards-swarms",
      sourceExports: ["createSwarmCatalog", "createSquadMembers"],
      sourceModule: "cards/swarms",
    },
    interfaces: { createSquadMembers, createSwarmCatalog },
  }],
  ["createChainSpecialCatalog", {
    catalog: createChainSpecialCatalog,
    expectedIds: ["stormkite"],
    evidence: {
      delivery: "special-projectile",
      verification: "special-projectiles-chain",
      sourceExports: ["createChainSpecialCatalog", "createChainQuestionFixture"],
      sourceModule: "cards/special-projectiles-chain",
    },
    interfaces: { createChainQuestionFixture, createChainSpecialCatalog },
    questionFactory: createChainQuestionFixture,
    questionSource: "unsourced-chained-target-attack-fixture",
  }],
  ["createPierceSpecialCatalog", {
    catalog: createPierceSpecialCatalog,
    expectedIds: ["prism-warden"],
    evidence: {
      delivery: "special-projectile",
      verification: "special-projectiles-pierce",
      sourceExports: ["createPierceSpecialCatalog", "createPierceQuestionFixture"],
      sourceModule: "cards/special-projectiles-pierce",
    },
    interfaces: { createPierceQuestionFixture, createPierceSpecialCatalog },
    questionFactory: createPierceQuestionFixture,
    questionSource: "unsourced-linear-through-shot-fixture",
  }],
  ["createReturnSpecialCatalog", {
    catalog: createReturnSpecialCatalog,
    expectedIds: ["rune-reaver"],
    evidence: {
      delivery: "special-projectile",
      verification: "special-projectiles-return",
      sourceExports: ["createReturnSpecialCatalog", "createReturnQuestionFixture"],
      sourceModule: "cards/special-projectiles-return",
    },
    interfaces: { createReturnQuestionFixture, createReturnSpecialCatalog },
    questionFactory: createReturnQuestionFixture,
    questionSource: "unsourced-outbound-returning-projectile-fixture",
  }],
  ["createPelletSpecialCatalog", {
    catalog: createPelletSpecialCatalog,
    expectedIds: ["scatterguard"],
    evidence: {
      delivery: "special-projectile",
      verification: "special-projectiles-pellets",
      sourceExports: ["createPelletSpecialCatalog", "createPelletQuestionFixture"],
      sourceModule: "cards/special-projectiles-pellets",
    },
    interfaces: { createPelletQuestionFixture, createPelletSpecialCatalog },
    questionFactory: createPelletQuestionFixture,
    questionSource: "unsourced-fixed-fan-pellet-volley-fixture",
  }],
  ["createReflectionSpecialCatalog", {
    catalog: createReflectionSpecialCatalog,
    expectedIds: ["aegis-sage"],
    evidence: {
      delivery: "special-projectile",
      verification: "special-projectiles-reflection",
      sourceExports: ["createReflectionSpecialCatalog", "createReflectionQuestionFixture"],
      sourceModule: "cards/special-projectiles-reflection",
    },
    interfaces: { createReflectionQuestionFixture, createReflectionSpecialCatalog },
    questionFactory: createReflectionQuestionFixture,
    questionSource: "unsourced-projectile-reflection-fixture",
  }],
  ["createChampionAbilityCatalog", {
    catalog: createChampionAbilityCatalog,
    expectedIds: ["aegis-sage", "bone-regent", "dusk-ranger", "gilded-lancer", "iron-borer"],
    evidence: {
      delivery: "composition-only",
      verification: "game-roster-troop-profiles",
      sourceExports: ["createChampionAbilityCatalog"],
      sourceModule: "cards/champion-abilities",
    },
    interfaces: { createChampionAbilityCatalog },
  }],
]);

const QUESTION_SPECS = Object.freeze({
  chain: {
    exportName: "createChainSpecialCatalog",
    keys: [
      "attackerCancellationRule", "candidateDeathRule", "damagePerHop",
      "eventOrderRule", "hopDelayTicks", "hopRangeMillitiles", "lethalHopRule",
      "rangeRule", "selectionRule", "targetCap", "targetEligibilityRule",
    ],
  },
  pierce: {
    exportName: "createPierceSpecialCatalog",
    keys: [
      "attackerDeathAfterLaunchRule", "attackerDeathThroughLaunchRule",
      "collisionGeometryRule", "corridorHalfWidthMillitiles",
      "damageApplicationRule", "eventOrderRule", "hitOrderRule",
      "interruptionAfterLaunchRule", "interruptionThroughLaunchRule",
      "movingCollisionRule", "oneHitRule", "pierceLengthMillitiles",
      "projectionRule", "projectileSpeedMillitilesPerTick", "sameBoundaryRule",
      "targetDeathRule", "targetEligibilityRule",
    ],
  },
  return: {
    exportName: "createReturnSpecialCatalog",
    keys: [
      "attackerDeathAfterLaunchRule", "attackerDeathThroughLaunchRule",
      "collisionGeometryRule", "collisionWidthMillitiles", "damagePerPass",
      "damagePerPassRule", "eventOrderRule", "inboundTimingRule",
      "interruptionAfterLaunchRule", "interruptionThroughLaunchRule",
      "launchTimingTicks", "movingTargetRule", "obstacleRule", "oneHitPerLegRule",
      "projectileSpeedMillitilesPerTick", "sameBoundaryRule", "targetDeathRule",
      "targetEligibilityRule", "turnDistanceMillitiles", "turnaroundTimingRule",
    ],
  },
  pellets: {
    exportName: "createPelletSpecialCatalog",
    keys: [
      "aggregateDamageOrderRule", "areaDamageRadiusMillitiles",
      "attackerDeathAfterLaunchRule", "attackerDeathThroughLaunchRule",
      "collisionWidthMillitiles", "count", "damage", "damagePerPellet",
      "deployTimeTicks", "firstContactObstructionRule", "firstHitTicks",
      "hitSpeedTicks", "hitpoints", "interruptionAfterLaunchRule",
      "interruptionThroughLaunchRule", "launchSnapshotRule",
      "movementMillitilesPerSecond", "pelletCount", "pelletIdRule",
      "pelletRangeMillitiles", "pelletSpeedMillitilesPerTick", "rangeMillitiles",
      "rayPattern", "rayPatternNorm", "sameBoundaryRule", "sightRangeMillitiles",
      "targetDeathRule", "targetEligibilityRule", "targetMode", "volleyDamageRule",
    ],
  },
  reflection: {
    exportName: "createReflectionSpecialCatalog",
    keys: [
      "benchmarkCount", "benchmarkDamage", "benchmarkDeployTimeSeconds",
      "benchmarkFirstHitSeconds", "benchmarkHitSpeedSeconds", "benchmarkHitpoints",
      "benchmarkMovementSpeed", "benchmarkMovementSpeedTilesPerSecond",
      "benchmarkRangeTiles", "benchmarkSightRangeTiles", "benchmarkTargets",
      "eventOrderRule", "geometryRule", "integerPathDomainRule", "invalidReflectorRule",
      "lifecycleRule", "loopPolicy", "maximumReflections", "movingTargetRule",
      "reflectedDamageRule", "reflectedOwnershipRule", "reflectedSpeedRule",
      "reflectedTargetRule", "reflectionEligibilityRule", "reflectionRadiusMillitiles",
      "reflectionTimingRule", "selfReflectionRule", "simultaneousReflectionRule",
      "sourceDeathRule", "sourceProvenanceRule", "targetDeathRule",
    ],
  },
});

const QUESTION_FAMILY_ORDER = Object.freeze([
  "chain", "pierce", "return", "pellets", "reflection",
]);

const AEGIS_COMPOSITION_PENDING = Object.freeze({
  abilityCost: Object.freeze({
    owner: "GAME-001HTC",
    status: "pending",
  }),
  cancellation: Object.freeze({
    owner: "GAME-001HTC",
    status: "pending",
  }),
  compositionWithChampionAbility: Object.freeze({
    owner: "GAME-001HTC",
    status: "pending",
  }),
  loopPolicy: Object.freeze({
    owner: "GAME-001HTC",
    status: "pending",
  }),
  mechanicOrdering: Object.freeze({
    owner: "GAME-001HTC",
    status: "pending",
  }),
  sameBoundaryTiming: Object.freeze({
    owner: "GAME-001HTC",
    status: "pending",
  }),
  targetOwnership: Object.freeze({
    owner: "GAME-001HTC",
    status: "pending",
  }),
});

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

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareOccurrences(left, right) {
  return compareText(left.id, right.id) ||
    compareText(left.exportName, right.exportName) ||
    compareText(left.archetype ?? "", right.archetype ?? "");
}

function compareClaims(left, right) {
  return compareOccurrences(left, right) ||
    compareText(left.claimFamily, right.claimFamily);
}

function exactKeys(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a data object`);
  }
  const actual = Reflect.ownKeys(Object.getOwnPropertyDescriptors(value));
  if (actual.some((key) => typeof key !== "string")) {
    throw new TypeError(`${label} has a non-string key`);
  }
  const actualSorted = actual.sort(compareText);
  const expectedSorted = [...expected].sort(compareText);
  if (canonical(actualSorted) !== canonical(expectedSorted) ||
      Object.values(Object.getOwnPropertyDescriptors(value)).some((descriptor) =>
        !descriptor.enumerable || !Object.hasOwn(descriptor, "value"))) {
    throw new TypeError(`${label} has an invalid field surface`);
  }
  return value;
}

function deepFrozen(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return true;
  if (seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Object.values(value).every((child) =>
    deepFrozen(child, seen));
}

function sourceBinding(exportName) {
  const binding = SOURCE_BINDINGS.get(exportName);
  if (binding === undefined) {
    throw new Error(`projectile source binding ${exportName} is missing`);
  }
  return binding;
}

function sourceRows(exportName) {
  const binding = sourceBinding(exportName);
  for (const [name, value] of Object.entries(binding.interfaces)) {
    if (typeof value !== "function") {
      throw new TypeError(`${exportName} source interface ${name} is missing`);
    }
  }
  const rows = binding.catalog();
  if (!Array.isArray(rows) || rows.length > MAX_SOURCE_RECORDS) {
    throw new TypeError(`${exportName} source catalog is unbounded or not an array`);
  }
  const ids = rows.map((row) => row?.id);
  if (ids.some((id) => typeof id !== "string" || id.length === 0 || id.length > MAX_ID_LENGTH) ||
      new Set(ids).size !== ids.length) {
    throw new TypeError(`${exportName} source catalog has invalid or duplicate IDs`);
  }
  const expected = [...binding.expectedIds].sort(compareText);
  if (canonical([...ids].sort(compareText)) !== canonical(expected)) {
    throw new Error(`${exportName} source catalog has stale, missing, or extra records`);
  }
  return rows;
}

function sourceRowFor(exportName, id) {
  const rows = sourceRows(exportName).filter((row) => row.id === id);
  if (rows.length !== 1) {
    throw new Error(`${exportName}/${id} does not provide exactly one source record`);
  }
  return rows[0];
}

function htpOccurrenceMap(manifest) {
  if (!Array.isArray(manifest.occurrences) || manifest.occurrences.length > MAX_SOURCE_RECORDS) {
    throw new TypeError("HTP occurrence surface is missing or unbounded");
  }
  const map = new Map();
  for (const occurrence of manifest.occurrences) {
    exactKeys(occurrence, ["exportName", "id", "status", ...(occurrence.status === "question" ? ["reason"] : [])],
      "HTP occurrence");
    const key = `${occurrence.exportName}\u0000${occurrence.id}`;
    if (map.has(key)) throw new Error("HTP occurrence surface contains a duplicate pair");
    map.set(key, occurrence);
  }
  return map;
}

function occurrenceKey(spec) {
  return `${spec.exportName}\u0000${spec.id}`;
}

function assertUnresolvedSpecSurface() {
  if (UNRESOLVED_DELIVERY_SPECS.length === 0 ||
      UNRESOLVED_DELIVERY_SPECS.length > MAX_UNRESOLVED_DELIVERY_DEPENDENCIES) {
    throw new RangeError("projectile unresolved delivery spec collection is unbounded or empty");
  }
  const occurrenceKeys = new Set();
  const archetypes = new Set();
  for (const spec of UNRESOLVED_DELIVERY_SPECS) {
    exactKeys(spec, [
      "archetype", "claimFamily", "componentId", "exportName",
      "htoDeliveryQuestionKey", "htoDeliveryQuestionSource",
      "htoDeliveryQuestionValue", "id", "sourceKind",
    ], "unresolved delivery spec");
    const key = occurrenceKey(spec);
    if (occurrenceKeys.has(key)) {
      throw new Error("projectile unresolved delivery specs contain a duplicate occurrence");
    }
    occurrenceKeys.add(key);
    if (archetypes.has(spec.archetype)) {
      throw new Error("projectile unresolved delivery specs contain duplicate archetypes");
    }
    archetypes.add(spec.archetype);
    if (spec.sourceKind !== "ordinary" ||
        typeof spec.htoDeliveryQuestionKey !== "string" ||
        spec.htoDeliveryQuestionKey !== `${spec.archetype}.delivery` ||
        spec.htoDeliveryQuestionSource !== "runtime-playability-estimate-not-comparison-corpus" ||
        spec.htoDeliveryQuestionValue !== 2) {
      throw new Error(`unresolved delivery spec ${spec.exportName}/${spec.id} is not a pinned HTO question`);
    }
    if (spec.componentId !== null && typeof spec.componentId !== "string") {
      throw new TypeError(`unresolved delivery spec ${spec.exportName}/${spec.id} has an invalid component ID`);
    }
  }
  return occurrenceKeys;
}

function assertHtpJoin(htpMap, spec, label) {
  const occurrence = htpMap.get(occurrenceKey(spec));
  if (occurrence === undefined || occurrence.status !== "admitted") {
    throw new Error(`${label} is missing an admitted HTP occurrence`);
  }
  return occurrence;
}

function assertHtpSurface(htpManifest) {
  const htpMap = htpOccurrenceMap(htpManifest);
  const unresolvedSpecKeys = assertUnresolvedSpecSurface();
  const claimed = CLAIM_SPECS.map((spec) => occurrenceKey(spec));
  const unresolved = [...unresolvedSpecKeys];
  const excluded = EXCLUDED_OCCURRENCE_SPECS.map((spec) => occurrenceKey(spec));
  const classified = [...claimed, ...unresolved, ...excluded];
  if (new Set(classified).size !== classified.length) {
    throw new Error("projectile HTP classification contains a duplicate pair");
  }
  const actual = [...htpMap.keys()].sort(compareText);
  if (canonical(actual) !== canonical([...classified].sort(compareText))) {
    throw new Error("projectile HTP classification has a stale, missing, or extra occurrence");
  }
  for (const spec of CLAIM_SPECS) assertHtpJoin(htpMap, spec, `${spec.exportName}/${spec.id}`);
  for (const spec of UNRESOLVED_DELIVERY_SPECS) {
    assertHtpJoin(htpMap, spec, `${spec.exportName}/${spec.id}`);
  }
  for (const spec of EXCLUDED_OCCURRENCE_SPECS) {
    const occurrence = htpMap.get(occurrenceKey(spec));
    if (occurrence?.status !== spec.status) {
      throw new Error(`projectile exclusion status changed for ${spec.exportName}/${spec.id}`);
    }
  }
  return { htpMap };
}

function assertAdmissionIdentity(profile, record, label) {
  for (const field of ["id", "displayName", "kind", "cost", "deployTimeTicks"]) {
    if (profile[field] !== record[field]) {
      throw new Error(`${label} diverges from its HTP/source identity at ${field}`);
    }
  }
}

function componentFor(record, componentId, expectedRole, label) {
  if (!Array.isArray(record.components) || record.components.length > MAX_COMPONENTS) {
    throw new TypeError(`${label} has an invalid component surface`);
  }
  const matches = record.components.filter(({ id }) => id === componentId);
  if (matches.length !== 1 || matches[0].role !== expectedRole) {
    throw new Error(`${label} component identity or role is stale`);
  }
  return matches[0];
}

function validateUnresolvedComponent(record, spec) {
  if (spec.componentId === null) return null;
  const component = componentFor(
    record,
    spec.componentId,
    "secondary",
    `${spec.exportName}/${spec.id}`,
  );
  const members = createSquadMembers(spec.id, 1);
  if (!Array.isArray(members) || members.length !== 6 ||
      members.filter(({ componentId, role }) =>
        componentId === spec.componentId && role === "secondary").length !== 3) {
    throw new Error(`${spec.componentId} component expansion is stale`);
  }
  return component;
}

function validateQuestionFactory(binding, spec) {
  if (typeof binding.questionFactory !== "function") {
    throw new TypeError(`${spec.claimFamily} question factory is missing`);
  }
  const first = binding.questionFactory();
  const second = binding.questionFactory();
  if (first === second || canonical(first) !== canonical(second)) {
    throw new Error(`${spec.claimFamily} question factory is not fresh and stable`);
  }
  if (!deepFrozen(first) || !deepFrozen(second)) {
    throw new Error(`${spec.claimFamily} question fixture is not deeply frozen`);
  }
  const questionSpec = QUESTION_SPECS[spec.claimFamily];
  if (questionSpec === undefined || questionSpec.exportName !== spec.exportName) {
    throw new Error(`${spec.claimFamily} question key mapping is stale`);
  }
  exactKeys(first, questionSpec.keys, `${spec.claimFamily} question fixture`);
  if (Object.keys(first).length > MAX_QUESTION_RECORDS) {
    throw new RangeError(`${spec.claimFamily} question fixture exceeds its bound`);
  }
  for (const [key, record] of Object.entries(first)) {
    exactKeys(record, ["authoritative", "confidence", "disposition", "source", "value"],
      `${spec.claimFamily}.${key}`);
    if (record.authoritative !== false || record.confidence !== "unverified" ||
        record.disposition !== "question" || record.source !== binding.questionSource) {
      throw new Error(`${spec.claimFamily}.${key} lost its non-authoritative provenance`);
    }
  }
  let rejected = false;
  try {
    binding.questionFactory({});
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error(`${spec.claimFamily} question factory accepts overrides`);
  return clone(first);
}

function validateQuestionFixtures() {
  const fixtures = {};
  for (const family of QUESTION_FAMILY_ORDER) {
    const spec = CLAIM_SPECS.find(({ claimFamily }) => claimFamily === family);
    if (spec === undefined) throw new Error(`question family ${family} has no claim`);
    fixtures[family] = validateQuestionFactory(sourceBinding(spec.exportName), spec);
  }
  return fixtures;
}

function absentGeometryQuestion() {
  return {
    authoritative: false,
    confidence: "unverified",
    disposition: "question",
    source: "projectile-source-profile-absent-geometry",
    value: null,
  };
}

function ordinaryQuestionPolicies() {
  return {
    projectileLengthMillitiles: absentGeometryQuestion(),
    projectileSpeedMillitilesPerTick: absentGeometryQuestion(),
    projectileTravelTicks: absentGeometryQuestion(),
    projectileWidthMillitiles: absentGeometryQuestion(),
  };
}

function deliveryEvidence(binding, status = "sourced") {
  return {
    classification: status,
    delivery: "projectile",
    evidence: {
      sourceExports: [...binding.evidence.sourceExports],
      sourceModule: binding.evidence.sourceModule,
      verification: binding.evidence.verification,
    },
  };
}

function sourceReceipt(binding, exportName, record, component = null) {
  return {
    catalogExport: exportName,
    component: component === null ? null : clone(component),
    evidence: clone(binding.evidence),
    record: clone(record),
  };
}

function specialQuestionFor(claimFamily, fixtures) {
  const fixture = fixtures[claimFamily];
  if (fixture === undefined) throw new Error(`${claimFamily} has no question fixture`);
  return clone(fixture);
}

function buildClaim(spec, htpProfile, record, fixtures) {
  const binding = sourceBinding(spec.exportName);
  const component = spec.componentId === null
    ? null
    : componentFor(record, spec.componentId, "secondary", `${spec.exportName}/${spec.id}`);
  assertAdmissionIdentity(htpProfile, record, `${spec.exportName}/${spec.id}`);
  const questions = spec.sourceKind === "ordinary"
    ? ordinaryQuestionPolicies()
    : specialQuestionFor(spec.claimFamily, fixtures);
  return {
    archetype: spec.archetype,
    claimFamily: spec.claimFamily,
    component: component === null ? null : clone(component),
    delivery: deliveryEvidence(binding),
    questions,
    source: sourceReceipt(binding, spec.exportName, record, component),
  };
}

function buildAegisComposition(reflectionRecord, htpProfile) {
  const composition = htpProfile.occurrenceExports;
  const expectedExports = ["createChampionAbilityCatalog", "createReflectionSpecialCatalog"];
  if (canonical([...composition].sort(compareText)) !== canonical([...expectedExports].sort(compareText))) {
    throw new Error("Aegis Sage composition membership is stale");
  }
  const championRecord = sourceRowFor("createChampionAbilityCatalog", "aegis-sage");
  if (canonical(championRecord) !== canonical(reflectionRecord)) {
    throw new Error("Aegis Sage champion and reflection source identities diverge");
  }
  return {
    ownedId: "aegis-sage",
    sourceExports: expectedExports,
    sourceRecords: [
      {
        exportName: "createChampionAbilityCatalog",
        record: clone(championRecord),
      },
      {
        exportName: "createReflectionSpecialCatalog",
        record: clone(reflectionRecord),
      },
    ],
    pending: clone(AEGIS_COMPOSITION_PENDING),
  };
}

function assertHtoQuestion(question, spec, expectedKey, expectedValue, label) {
  if (question === undefined) {
    throw new Error(`${label} is missing from the HTO witness`);
  }
  exactKeys(question, ["authoritative", "confidence", "disposition", "key", "source", "value"], label);
  if (question.key !== expectedKey || question.value !== expectedValue ||
      question.authoritative !== false || question.confidence !== "unverified" ||
      question.disposition !== "question" ||
      question.source !== spec.htoDeliveryQuestionSource) {
    throw new Error(`${label} is not the exact HTO delivery QUESTION record`);
  }
  return question;
}

function buildUnresolvedDependency(htpManifest, htpMap, sourceCache, spec) {
  const occurrence = assertHtpJoin(htpMap, spec, `${spec.exportName}/${spec.id}`);
  const htpProfile = htpManifest.profiles.find(({ id }) => id === spec.id);
  if (htpProfile === undefined || !htpProfile.occurrenceExports.includes(spec.exportName)) {
    throw new Error(`${spec.exportName}/${spec.id} has no exact HTP profile join`);
  }
  const record = sourceCache.get(spec.exportName).find(({ id }) => id === spec.id);
  if (record === undefined) throw new Error(`${spec.exportName}/${spec.id} source record is missing`);
  assertAdmissionIdentity(htpProfile, record, `${spec.exportName}/${spec.id}`);
  const component = validateUnresolvedComponent(record, spec);
  const htoQuestions = createSessionTroopWitnessQuestions(spec.id);
  const deliveryQuestions = htoQuestions.filter(({ key }) =>
    key === spec.htoDeliveryQuestionKey);
  if (deliveryQuestions.length !== 1) {
    throw new Error(`${spec.archetype} HTO delivery question mapping is stale`);
  }
  const deliveryQuestion = assertHtoQuestion(
    deliveryQuestions[0],
    spec,
    spec.htoDeliveryQuestionKey,
    spec.htoDeliveryQuestionValue,
    `${spec.archetype}.delivery`,
  );
  const speedKey = `${spec.archetype}.projectile-speed-millitiles-per-tick`;
  const speedQuestions = htoQuestions.filter(({ key }) => key === speedKey);
  if (speedQuestions.length !== 1) {
    throw new Error(`${spec.archetype} HTO projectile speed question mapping is stale`);
  }
  const speedQuestion = speedQuestions[0];
  exactKeys(speedQuestion,
    ["authoritative", "confidence", "disposition", "key", "source", "value"],
    `${spec.archetype}.projectile-speed-millitiles-per-tick`);
  if (speedQuestion.key !== speedKey || speedQuestion.value !== 500 ||
      speedQuestion.authoritative !== false || speedQuestion.confidence !== "unverified" ||
      speedQuestion.disposition !== "question" ||
      speedQuestion.source !== spec.htoDeliveryQuestionSource) {
    throw new Error(`${spec.archetype} HTO projectile speed QUESTION record is stale`);
  }
  return {
    archetype: spec.archetype,
    claimFamily: spec.claimFamily,
    component: component === null ? null : clone(component),
    delivery: {
      classification: "question",
      estimateOnly: true,
      evidence: "HTO-delivery-estimate-not-source-proof",
      value: null,
    },
    htpOccurrence: clone(occurrence),
    id: spec.id,
    questions: {
      delivery: clone(deliveryQuestion),
      projectileSpeedMillitilesPerTick: clone(speedQuestion),
    },
    source: sourceReceipt(
      sourceBinding(spec.exportName),
      spec.exportName,
      record,
      component,
    ),
    status: "question",
  };
}

function buildExclusions(htpMap) {
  return EXCLUDED_OCCURRENCE_SPECS.map((spec) => {
    const occurrence = htpMap.get(occurrenceKey(spec));
    if (occurrence === undefined) throw new Error(`missing pinned exclusion ${occurrenceKey(spec)}`);
    return {
      archetype: null,
      exportName: spec.exportName,
      htpReason: occurrence.reason ?? null,
      htpStatus: occurrence.status,
      id: spec.id,
      reason: spec.reason,
      status: "excluded",
    };
  }).sort(compareOccurrences);
}

function buildManifest() {
  const htpManifest = createSessionTroopProfileManifest();
  const { htpMap } = assertHtpSurface(htpManifest);
  const sourceCache = new Map();
  for (const exportName of SOURCE_BINDINGS.keys()) {
    sourceCache.set(exportName, sourceRows(exportName));
  }
  const fixtures = validateQuestionFixtures();
  const claims = CLAIM_SPECS.map((spec) => {
    const htpOccurrence = assertHtpJoin(htpMap, spec, `${spec.exportName}/${spec.id}`);
    const htpProfile = htpManifest.profiles.find(({ id }) => id === spec.id);
    if (htpProfile === undefined || !htpProfile.occurrenceExports.includes(spec.exportName)) {
      throw new Error(`${spec.exportName}/${spec.id} has no exact HTP profile join`);
    }
    const record = sourceCache.get(spec.exportName).find(({ id }) => id === spec.id);
    if (record === undefined) throw new Error(`${spec.exportName}/${spec.id} source record is missing`);
    const claim = buildClaim(spec, htpProfile, record, fixtures);
    return { claim, htpOccurrence, htpProfile, record, spec };
  }).sort(({ spec: left }, { spec: right }) => compareClaims(left, right));

  const unresolved = UNRESOLVED_DELIVERY_SPECS
    .map((spec) => buildUnresolvedDependency(htpManifest, htpMap, sourceCache, spec))
    .sort(compareOccurrences);
  const exclusions = buildExclusions(htpMap);

  const profileIds = [...new Set(claims.map(({ spec }) => spec.id))].sort(compareText);
  const profiles = profileIds.map((id) => {
    const profileClaims = claims.filter(({ spec }) => spec.id === id);
    const htpProfile = profileClaims[0].htpProfile;
    const sourceCard = profileClaims[0].record;
    const profile = {
      id,
      identityRequirements: clone(IDENTITY_REQUIREMENTS),
      occurrenceExports: [...htpProfile.occurrenceExports].sort(compareText),
      sharedHostIntegration: clone(SHARED_HOST_INTEGRATION),
      sourceCard: clone(sourceCard),
      sourceIdentity: clone(htpProfile),
      claims: profileClaims.map(({ claim }) => claim).sort(compareClaims),
    };
    profile.composition = id === "aegis-sage"
      ? buildAegisComposition(sourceCard, htpProfile)
      : null;
    return profile;
  });
  if (profiles.length !== EXPECTED_COUNTS.uniqueCardIds ||
      new Set(profiles.map(({ id }) => id)).size !== profiles.length) {
    throw new Error("projectile profiles must be one-per-claimed-card-ID");
  }

  const occurrences = claims.map(({ spec }) => ({
    archetype: spec.archetype,
    claimFamily: spec.claimFamily,
    componentId: spec.componentId,
    exportName: spec.exportName,
    id: spec.id,
    status: "claimed",
  })).sort(compareOccurrences);
  const questionFixtures = Object.fromEntries(QUESTION_FAMILY_ORDER.map((family) =>
    [family, clone(fixtures[family])]));
  const compositionOwnedIds = profiles.filter(({ composition }) => composition !== null)
    .map(({ id }) => id).sort(compareText);
  const counts = {
    claimedOccurrencePairs: occurrences.length,
    uniqueCardIds: profiles.length,
    ordinarySourceClaims: claims.filter(({ spec }) => spec.sourceKind === "ordinary").length,
    specialSourceClaims: claims.filter(({ spec }) => spec.sourceKind === "special").length,
    questionBearingClaims: claims.filter(({ claim }) => Object.keys(claim.questions).length > 0).length,
    unresolvedDeliveryDependencies: unresolved.length,
    duplicatedCompositionOwnedIds: compositionOwnedIds.length,
  };
  if (canonical(counts) !== canonical(EXPECTED_COUNTS)) {
    throw new Error(`projectile profile counts diverge: expected=${canonical(EXPECTED_COUNTS)} actual=${canonical(counts)}`);
  }
  if (canonical(compositionOwnedIds) !== canonical(["aegis-sage"])) {
    throw new Error("projectile composition ownership is stale");
  }

  return freeze({
    compositionOwnedIds,
    counts,
    excludedOccurrences: exclusions,
    identityRequirements: clone(IDENTITY_REQUIREMENTS),
    occurrences,
    profiles,
    questionFixtures,
    unresolvedDeliveryDependencies: unresolved,
    version: VERSION,
  });
}

const MANIFEST = buildManifest();

function assertNoArguments(args, label) {
  if (args.length !== 0) throw new TypeError(`${label} takes no arguments`);
}

export function createSessionTroopProjectileProfileManifest(...args) {
  assertNoArguments(args, "session troop projectile profile manifest");
  return deepFreezeClone(MANIFEST);
}

export function serializeSessionTroopProjectileProfileManifest(...args) {
  assertNoArguments(args, "session troop projectile profile manifest serialization");
  return canonical(MANIFEST);
}

export function getSessionTroopProjectileProfile(id, ...args) {
  if (args.length !== 0) {
    throw new TypeError("session troop projectile profile lookup takes exactly one argument");
  }
  if (typeof id !== "string") {
    throw new TypeError("session troop projectile profile ID must be a primitive string");
  }
  if (id.length === 0 || id.length > MAX_ID_LENGTH) {
    throw new RangeError("session troop projectile profile ID is out of bounds");
  }
  const profile = MANIFEST.profiles.find((candidate) => candidate.id === id);
  if (profile === undefined) {
    const unresolved = MANIFEST.unresolvedDeliveryDependencies.find(({ id: dependencyId }) =>
      dependencyId === id);
    if (unresolved !== undefined) {
      throw new RangeError("session troop projectile profile remains an explicit QUESTION");
    }
    throw new RangeError("session troop projectile profile ID is unknown or not admitted");
  }
  return deepFreezeClone(profile);
}
