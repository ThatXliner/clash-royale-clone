import * as basicFlyingSource from "./cards/basic-flying.js";
import * as chargeKnockbackSource from "./cards/special-movement-charge-knockback.js";
import * as chargeSource from "./cards/special-movement-charge.js";
import * as dashSource from "./cards/special-movement-dash.js";
import * as jumpSource from "./cards/special-movement-jump.js";
import * as recoilSource from "./cards/special-movement-recoil.js";
import * as retargetSource from "./cards/special-movement-retarget.js";
import * as shieldFormSource from "./cards/shields-forms.js";
import { createSessionTroopProfileManifest } from "./session-troop-profile-catalog.js";

const VERSION = 1;
const RUNTIME_INTEGRATION_STATUS = "pending-shared-host";
const PLACEMENT_CLASS = "ground_entity";
const SOURCE_RECORD_KEYS = [
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
];
const ORDINARY_INTEGER_FIELDS = [
  "cost",
  "count",
  "deployTimeTicks",
  "firstHitTicks",
  "hitSpeedTicks",
  "hitpoints",
  "movementMillitilesPerSecond",
  "rangeMillitiles",
  "sightRangeMillitiles",
];

const EXPECTED_OCCURRENCES = Object.freeze([
  Object.freeze({ exportName: "createRecoilSpecialCatalog", id: "cinderback", status: "admitted" }),
  Object.freeze({ exportName: "createBasicFlyingCatalog", id: "copperskiff", status: "admitted" }),
  Object.freeze({ exportName: "createChargeKnockbackCatalog", id: "emberlance", status: "admitted" }),
  Object.freeze({ exportName: "createChargeSpecialCatalog", id: "emberlance", status: "admitted" }),
  Object.freeze({ exportName: "createShieldFormCatalog", id: "railward", status: "admitted" }),
  Object.freeze({ exportName: "createBasicFlyingCatalog", id: "skymaul", status: "admitted" }),
  Object.freeze({ exportName: "createJumpSpecialCatalog", id: "stonevault", status: "admitted" }),
  Object.freeze({ exportName: "createDashSpecialCatalog", id: "veilrunner", status: "admitted" }),
  Object.freeze({ exportName: "createRetargetSpecialCatalog", id: "wayfinder", status: "admitted" }),
]);

const CLAIM_SPECS = Object.freeze([
  Object.freeze({
    claimFamily: "flight",
    exportName: "createBasicFlyingCatalog",
    questionFactory: null,
  }),
  Object.freeze({
    claimFamily: "shield-form",
    exportName: "createShieldFormCatalog",
    questionFactory: null,
  }),
  Object.freeze({
    claimFamily: "charge",
    exportName: "createChargeSpecialCatalog",
    questionFactory: "createChargeQuestionFixture",
  }),
  Object.freeze({
    claimFamily: "charge-knockback-membership",
    exportName: "createChargeKnockbackCatalog",
    questionFactory: "createChargeKnockbackQuestionRecords",
  }),
  Object.freeze({
    claimFamily: "dash",
    exportName: "createDashSpecialCatalog",
    questionFactory: "createDashQuestionFixture",
  }),
  Object.freeze({
    claimFamily: "jump",
    exportName: "createJumpSpecialCatalog",
    questionFactory: "createJumpQuestionFixture",
  }),
  Object.freeze({
    claimFamily: "recoil",
    exportName: "createRecoilSpecialCatalog",
    questionFactory: "createRecoilQuestionFixture",
  }),
  Object.freeze({
    claimFamily: "retarget",
    exportName: "createRetargetSpecialCatalog",
    questionFactory: "createRetargetQuestionRecords",
  }),
]);

const COMPOSITION_QUESTION_FIELDS = Object.freeze([
  "compositionOrdering",
  "chargeKnockbackInteraction",
  "cancellation",
  "targetInvalidation",
  "phaseTiming",
  "sameBoundaryBehavior",
]);
const SHIELD_UNRESOLVED_REASON =
  "no exported shield/form QUESTION-record factory; shield HP, transition timing, ordering, retargeting, and stationary-form stats remain unresolved";
const SHIELD_UNRESOLVED_FIELDS = Object.freeze([
  "shieldHitpoints",
  "transitionTiming",
  "transitionOrdering",
  "retargeting",
  "stationaryFormStats",
]);

const SOURCE_MODULES_BY_EXPORT = Object.freeze({
  createBasicFlyingCatalog: basicFlyingSource,
  createChargeKnockbackCatalog: chargeKnockbackSource,
  createChargeSpecialCatalog: chargeSource,
  createDashSpecialCatalog: dashSource,
  createJumpSpecialCatalog: jumpSource,
  createRecoilSpecialCatalog: recoilSource,
  createRetargetSpecialCatalog: retargetSource,
  createShieldFormCatalog: shieldFormSource,
});

const EXPECTED_ID_SET = new Set(EXPECTED_OCCURRENCES.map(({ id }) => id));
const EXPECTED_EXPORT_SET = new Set(EXPECTED_OCCURRENCES.map(({ exportName }) => exportName));
const CLAIM_SPEC_BY_EXPORT = new Map(
  CLAIM_SPECS.map((spec) => [spec.exportName, spec]),
);

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

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareOccurrence(left, right) {
  return compareText(left.id, right.id) || compareText(left.exportName, right.exportName);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`
    ).join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError("canonical data cannot contain undefined");
  return encoded;
}

function sourceRecordKey(exportName, id) {
  return `${exportName}\u0000${id}`;
}

// This is an intentional source-update barrier. These are complete runtime
// source records, serialized with the same canonical format used by the
// public receipt; an ID match alone is not sufficient authority.
const EXPECTED_SOURCE_WITNESS_MAP = Object.freeze({
  [sourceRecordKey("createBasicFlyingCatalog", "copperskiff")]: canonical({
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 4,
    count: 1,
    damage: 171,
    deployTimeTicks: 60,
    displayName: "Copperskiff",
    firstHitTicks: 36,
    hitSpeedTicks: 66,
    hitpoints: 614,
    id: "copperskiff",
    kind: "unit",
    movementMillitilesPerSecond: 1500,
    rangeMillitiles: 6000,
    rarity: "uncommon",
    sightRangeMillitiles: 6000,
    targetMode: "ground-and-air",
  }),
  [sourceRecordKey("createBasicFlyingCatalog", "skymaul")]: canonical({
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 3,
    count: 1,
    damage: 311,
    deployTimeTicks: 60,
    displayName: "Skymaul",
    firstHitTicks: 72,
    hitSpeedTicks: 96,
    hitpoints: 837,
    id: "skymaul",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 1600,
    rarity: "uncommon",
    sightRangeMillitiles: 5500,
    targetMode: "ground-and-air",
  }),
  [sourceRecordKey("createShieldFormCatalog", "railward")]: canonical({
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 5,
    count: 1,
    damage: 212,
    deployTimeTicks: 60,
    displayName: "Railward",
    firstHitTicks: 24,
    hitSpeedTicks: 60,
    hitpoints: 892,
    id: "railward",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 5500,
    rarity: "special",
    sightRangeMillitiles: 6000,
    targetMode: "ground",
  }),
  [sourceRecordKey("createChargeSpecialCatalog", "emberlance")]: canonical({
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 5,
    count: 1,
    damage: 392,
    deployTimeTicks: 60,
    displayName: "Emberlance",
    firstHitTicks: 54,
    hitSpeedTicks: 84,
    hitpoints: 1920,
    id: "emberlance",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 1600,
    rarity: "special",
    sightRangeMillitiles: 5500,
    targetMode: "ground",
  }),
  [sourceRecordKey("createChargeKnockbackCatalog", "emberlance")]: canonical({
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 5,
    count: 1,
    damage: 392,
    deployTimeTicks: 60,
    displayName: "Emberlance",
    firstHitTicks: 54,
    hitSpeedTicks: 84,
    hitpoints: 1920,
    id: "emberlance",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 1600,
    rarity: "special",
    sightRangeMillitiles: 5500,
    targetMode: "ground",
  }),
  [sourceRecordKey("createDashSpecialCatalog", "veilrunner")]: canonical({
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 3,
    count: 1,
    damage: 193,
    deployTimeTicks: 60,
    displayName: "Veilrunner",
    firstHitTicks: 36,
    hitSpeedTicks: 60,
    hitpoints: 907,
    id: "veilrunner",
    kind: "unit",
    movementMillitilesPerSecond: 1500,
    rangeMillitiles: 750,
    rarity: "mythic",
    sightRangeMillitiles: 6000,
    targetMode: "ground",
  }),
  [sourceRecordKey("createJumpSpecialCatalog", "stonevault")]: canonical({
    areaDamageRadiusMillitiles: 1300,
    components: [],
    cost: 7,
    count: 1,
    damage: 268,
    deployTimeTicks: 60,
    displayName: "Stonevault",
    firstHitTicks: 72,
    hitSpeedTicks: 102,
    hitpoints: 3993,
    id: "stonevault",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 1200,
    rarity: "mythic",
    sightRangeMillitiles: 5500,
    targetMode: "ground",
  }),
  [sourceRecordKey("createRecoilSpecialCatalog", "cinderback")]: canonical({
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 3,
    count: 1,
    damage: null,
    deployTimeTicks: 60,
    displayName: "Cinderback",
    firstHitTicks: 144,
    hitSpeedTicks: 180,
    hitpoints: 304,
    id: "cinderback",
    kind: "unit",
    movementMillitilesPerSecond: 1500,
    rangeMillitiles: 6000,
    rarity: "standard",
    sightRangeMillitiles: 8500,
    targetMode: "ground-and-air",
  }),
  [sourceRecordKey("createRetargetSpecialCatalog", "wayfinder")]: canonical({
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 3,
    count: 1,
    damage: 202,
    deployTimeTicks: 60,
    displayName: "Wayfinder",
    firstHitTicks: 42,
    hitSpeedTicks: 72,
    hitpoints: 1766,
    id: "wayfinder",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 1200,
    rarity: "standard",
    sightRangeMillitiles: 5500,
    targetMode: "ground",
  }),
});

function assertExpectedWitnessCoverage() {
  const expectedKeys = EXPECTED_OCCURRENCES
    .map(({ exportName, id }) => sourceRecordKey(exportName, id))
    .sort(compareText);
  const actualKeys = Object.keys(EXPECTED_SOURCE_WITNESS_MAP).sort(compareText);
  if (canonical(actualKeys) !== canonical(expectedKeys)) {
    throw new Error("movement source witness key set is missing, stale, or extra");
  }
}

function assertNoArguments(args, label) {
  if (args.length !== 0) throw new TypeError(`${label} takes no arguments`);
}

function assertExactDataObject(value, keys, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new TypeError(`${label} must be a plain data object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  const expected = [...keys].sort();
  const sortedActual = actual.filter((key) => typeof key === "string").sort();
  if (
    actual.length !== expected.length ||
    sortedActual.length !== actual.length ||
    sortedActual.some((key, index) => key !== expected[index]) ||
    Object.values(descriptors).some((descriptor) =>
      !descriptor.enumerable || !Object.hasOwn(descriptor, "value")
    )
  ) {
    throw new TypeError(`${label} has an invalid data shape`);
  }
  return value;
}

function assertDenseDataArray(value, label, maximum = 16) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maximum
  ) {
    throw new TypeError(`${label} must be a bounded array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== value.length + 1 ||
    Array.from({ length: value.length }, (_, index) => index).some((index) =>
      !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value")
    )
  ) {
    throw new TypeError(`${label} must be a dense data array`);
  }
  return value;
}

function assertCloneableSourceRecord(value, label) {
  try {
    structuredClone(value);
  } catch {
    throw new TypeError(`${label} must be cloneable data`);
  }
}

function validateSourceRecord(record, label) {
  assertExactDataObject(record, SOURCE_RECORD_KEYS, label);
  if (
    typeof record.id !== "string" ||
    record.id.length === 0 ||
    typeof record.displayName !== "string" ||
    record.displayName.length === 0 ||
    record.kind !== "unit" ||
    !["standard", "uncommon", "rare", "epic", "legendary", "mythic", "special", "champion"].includes(record.rarity) ||
    !["ground", "air", "ground-and-air"].includes(record.targetMode)
  ) {
    throw new TypeError(`${label} is not a complete unit catalog record`);
  }
  for (const field of ORDINARY_INTEGER_FIELDS) {
    if (record[field] !== null && !Number.isSafeInteger(record[field])) {
      throw new TypeError(`${label}.${field} must be an exact integer or null`);
    }
  }
  if (
    record.areaDamageRadiusMillitiles !== null &&
    !Number.isSafeInteger(record.areaDamageRadiusMillitiles)
  ) {
    throw new TypeError(`${label}.areaDamageRadiusMillitiles must be an exact integer or null`);
  }
  assertDenseDataArray(record.components, `${label}.components`);
  assertCloneableSourceRecord(record, label);
  return record;
}

function sourceRecordsFor(exportName) {
  const sourceModule = SOURCE_MODULES_BY_EXPORT[exportName];
  const factory = sourceModule?.[exportName];
  if (typeof factory !== "function") {
    throw new Error(`movement source export ${exportName} is missing`);
  }
  const records = factory();
  if (!Array.isArray(records)) {
    throw new TypeError(`${exportName} must return a catalog array`);
  }
  return records.map((record, index) =>
    validateSourceRecord(record, `${exportName}[${index}]`)
  );
}

function expectedIdsForExport(exportName, occurrences) {
  return occurrences
    .filter(({ exportName: candidate }) => candidate === exportName)
    .map(({ id }) => id)
    .sort(compareText);
}

function buildCatalogCache(occurrences) {
  assertExpectedWitnessCoverage();
  const cache = new Map();
  for (const exportName of [...EXPECTED_EXPORT_SET].sort(compareText)) {
    const records = sourceRecordsFor(exportName);
    const secondRead = sourceRecordsFor(exportName);
    if (canonical(records) !== canonical(secondRead)) {
      throw new Error(`${exportName} is not deterministic across source reads`);
    }
    const ids = records.map(({ id }) => id).sort(compareText);
    const expectedIds = expectedIdsForExport(exportName, occurrences);
    if (canonical(ids) !== canonical(expectedIds)) {
      throw new Error(`${exportName} has a missing, stale, or extra source record`);
    }
    if (new Set(ids).size !== ids.length) {
      throw new Error(`${exportName} has duplicate source IDs`);
    }
    for (const record of records) {
      const key = sourceRecordKey(exportName, record.id);
      const expectedWitness = EXPECTED_SOURCE_WITNESS_MAP[key];
      if (typeof expectedWitness !== "string" || canonical(record) !== expectedWitness) {
        throw new Error(`${exportName}/${record.id} differs from its pinned source witness`);
      }
    }
    cache.set(exportName, records);
  }
  return cache;
}

function sourceRecordFor(cache, exportName, id) {
  const records = cache.get(exportName);
  if (records === undefined) throw new Error(`no cached source records for ${exportName}`);
  const matches = records.filter((record) => record.id === id);
  if (matches.length !== 1) {
    throw new Error(`${exportName}/${id} does not provide exactly one source record`);
  }
  return matches[0];
}

function sourceQuestionExports(sourceModule) {
  return Object.keys(sourceModule)
    .filter((name) => name.startsWith("create") && name.includes("Question"))
    .sort(compareText);
}

function assertQuestionSourceSurface() {
  const expectations = new Map();
  for (const spec of CLAIM_SPECS) {
    const sourceModule = SOURCE_MODULES_BY_EXPORT[spec.exportName];
    const existing = expectations.get(sourceModule) ?? [];
    if (spec.questionFactory !== null) existing.push(spec.questionFactory);
    expectations.set(sourceModule, existing);
  }
  for (const [sourceModule, expected] of expectations) {
    const actual = sourceQuestionExports(sourceModule);
    const sortedExpected = [...expected].sort(compareText);
    if (canonical(actual) !== canonical(sortedExpected)) {
      throw new Error("movement question source exports are missing, stale, or extra");
    }
  }
  const shieldPolicyExports = Object.keys(shieldFormSource).filter((name) =>
    name.startsWith("createShieldForm") && name !== "createShieldFormCatalog"
  );
  if (shieldPolicyExports.length !== 0) {
    throw new Error("shield form gained an exported policy without a conscious profile update");
  }
}

function deriveOccurrences() {
  const profileManifest = createSessionTroopProfileManifest();
  if (!Array.isArray(profileManifest.occurrences) || !Array.isArray(profileManifest.profiles)) {
    throw new TypeError("session troop profile manifest has no occurrence/profile surface");
  }
  const candidateRows = profileManifest.occurrences.filter(({ exportName, id }) =>
    EXPECTED_EXPORT_SET.has(exportName) || EXPECTED_ID_SET.has(id)
  ).sort(compareOccurrence);
  const expectedRows = [...EXPECTED_OCCURRENCES].sort(compareOccurrence);
  if (canonical(candidateRows) !== canonical(expectedRows)) {
    throw new Error("movement/form occurrence surface diverges from HTP");
  }
  if (candidateRows.some(({ status }) => status !== "admitted")) {
    throw new Error("movement/form occurrence surface contains a non-admitted row");
  }
  const ids = [...new Set(candidateRows.map(({ id }) => id))].sort(compareText);
  if (ids.length !== 8) throw new Error("movement/form occurrence surface must contain eight IDs");

  const profiles = profileManifest.profiles.filter(({ id }) => EXPECTED_ID_SET.has(id));
  if (profiles.length !== ids.length || new Set(profiles.map(({ id }) => id)).size !== ids.length) {
    throw new Error("movement/form HTP profiles must be one per ID");
  }
  for (const id of ids) {
    const profile = profiles.find((candidate) => candidate.id === id);
    const expectedExports = candidateRows
      .filter((row) => row.id === id)
      .map(({ exportName }) => exportName)
      .sort(compareText);
    if (profile === undefined || canonical(profile.occurrenceExports) !== canonical(expectedExports)) {
      throw new Error(`movement/form HTP profile membership is stale for ${id}`);
    }
  }
  return { profileManifest, occurrences: candidateRows, ids, profiles };
}

function assertQuestionMetadata(value, label) {
  assertExactDataObject(value, ["confidence", "disposition", "source"], label);
  if (
    typeof value.confidence !== "string" ||
    value.disposition !== "question" ||
    typeof value.source !== "string"
  ) {
    throw new TypeError(`${label} is not an explicit question provenance record`);
  }
  return value;
}

function assertQuestionRecord(value, key, label) {
  assertExactDataObject(value, [
    "authoritative",
    "confidence",
    "disposition",
    "key",
    "source",
    "value",
  ], label);
  if (
    value.authoritative !== false ||
    value.confidence !== "unverified" ||
    value.disposition !== "question" ||
    value.key !== key ||
    typeof value.source !== "string"
  ) {
    throw new TypeError(`${label} is not a non-authoritative question receipt`);
  }
  return value;
}

function normalizeQuestionPolicy(spec) {
  if (spec.questionFactory === null) return null;
  const sourceModule = SOURCE_MODULES_BY_EXPORT[spec.exportName];
  const factory = sourceModule?.[spec.questionFactory];
  if (typeof factory !== "function") {
    throw new Error(`${spec.questionFactory} is not exported by ${spec.exportName} source module`);
  }
  const first = factory();
  const second = factory();
  if (first === second || canonical(first) !== canonical(second)) {
    throw new Error(`${spec.questionFactory} is not fresh and deterministic`);
  }
  try {
    factory("override");
  } catch {
    // Every named policy factory must reject caller-supplied policy data.
  }
  let overrideAccepted = false;
  try {
    factory("override");
    overrideAccepted = true;
  } catch {
    // Expected path.
  }
  if (overrideAccepted) {
    throw new Error(`${spec.questionFactory} accepts a policy override`);
  }

  let kind;
  let records;
  if (Object.hasOwn(first, "provenance")) {
    kind = "fixture";
    assertExactDataObject(first.provenance,
      Object.keys(first.provenance), `${spec.questionFactory}.provenance`);
    if (
      first.authoritative !== false ||
      first.confidence !== "unverified" ||
      first.disposition !== "question" ||
      typeof first.source !== "string"
    ) {
      throw new TypeError(`${spec.questionFactory} has invalid fixture-level question metadata`);
    }
    const keys = Object.keys(first.provenance).sort(compareText);
    records = keys.map((key) => {
      if (!Object.hasOwn(first, key)) {
        throw new Error(`${spec.questionFactory} provenance names a missing question value`);
      }
      const provenance = assertQuestionMetadata(
        first.provenance[key], `${spec.questionFactory}.provenance.${key}`
      );
      return {
        authoritative: first.authoritative,
        confidence: provenance.confidence,
        disposition: provenance.disposition,
        key,
        source: provenance.source,
        value: clone(first[key]),
      };
    });
  } else {
    kind = "records";
    const keys = Object.keys(first).sort(compareText);
    records = keys.map((key) => clone(
      assertQuestionRecord(first[key], key, `${spec.questionFactory}.${key}`)
    ));
  }
  if (records.length === 0 || records.some((record) =>
    record.authoritative !== false ||
    record.confidence !== "unverified" ||
    record.disposition !== "question"
  )) {
    throw new Error(`${spec.questionFactory} has an empty or authoritative policy surface`);
  }
  return {
    factory: spec.questionFactory,
    kind,
    raw: clone(first),
    rawCanonical: canonical(first),
    records,
  };
}

function buildFlightBehavior(id, sourceRecord) {
  const initial = basicFlyingSource.createBasicFlyingMovement(id, {
    position: { x: 100, y: 100 },
    target: { position: { x: 100, y: 200 }, radius: 0, range: 0 },
  });
  const advanced = basicFlyingSource.advanceBasicFlyingMovement(initial, 1);
  const serialized = basicFlyingSource.serializeBasicFlyingMovement(initial);
  const restored = basicFlyingSource.restoreBasicFlyingMovement(serialized);
  if (
    initial.speed !== sourceRecord.movementMillitilesPerSecond ||
    advanced.speed !== sourceRecord.movementMillitilesPerSecond ||
    canonical(restored) !== canonical(initial)
  ) {
    throw new Error(`basic flying public movement functions diverge for ${id}`);
  }
  return {
    exportedFunctions: [
      "createBasicFlyingMovement",
      "advanceBasicFlyingMovement",
      "serializeBasicFlyingMovement",
      "restoreBasicFlyingMovement",
      "acquireBasicFlyingTarget",
    ],
    pathScope: "axis-aligned-only",
    sourceTest: "cards-basic-flying",
    speedField: "movementMillitilesPerSecond",
    roundTrip: "serialize-restore-byte-stable",
    excludedMechanics: [
      "collision",
      "projectile-travel",
      "moving-target-parity",
    ],
  };
}

function compositionQuestions() {
  return COMPOSITION_QUESTION_FIELDS.map((field) => ({
    field,
    owner: "GAME-001HTC",
    reason: "duplicated movement claims provide membership only; composition execution is unsourced",
    status: "question",
  }));
}

function buildClaim(spec, id, sourceRecord) {
  const claim = {
    claimFamily: spec.claimFamily,
    exportName: spec.exportName,
    runtimeIntegrationStatus: RUNTIME_INTEGRATION_STATUS,
    sourceRecordCanonical: canonical(sourceRecord),
    questionPolicy: normalizeQuestionPolicy(spec),
  };
  if (spec.claimFamily === "flight") {
    claim.flightBehavior = buildFlightBehavior(id, sourceRecord);
  }
  if (spec.claimFamily === "shield-form") {
    claim.questionPolicy = null;
    claim.unresolvedOnly = true;
    claim.unresolvedFields = [...SHIELD_UNRESOLVED_FIELDS];
    claim.unresolvedReason = SHIELD_UNRESOLVED_REASON;
  }
  return claim;
}

function baseIdentity(sourceRecord, htpProfile, id) {
  const base = {
    cost: sourceRecord.cost,
    deployTimeTicks: sourceRecord.deployTimeTicks,
    displayName: sourceRecord.displayName,
    id,
    kind: sourceRecord.kind,
    placementClass: PLACEMENT_CLASS,
  };
  const expected = {
    cost: htpProfile.cost,
    deployTimeTicks: htpProfile.deployTimeTicks,
    displayName: htpProfile.displayName,
    id: htpProfile.id,
    kind: htpProfile.kind,
    placementClass: htpProfile.placementClass,
  };
  if (canonical(base) !== canonical(expected)) {
    throw new Error(`movement/form base identity diverges from HTP for ${id}`);
  }
  return base;
}

function buildManifest() {
  assertQuestionSourceSurface();
  const { profileManifest, occurrences, ids, profiles: htpProfiles } = deriveOccurrences();
  const catalogCache = buildCatalogCache(occurrences);
  const sourceRecordByOccurrence = new Map();
  for (const occurrence of occurrences) {
    const record = sourceRecordFor(catalogCache, occurrence.exportName, occurrence.id);
    sourceRecordByOccurrence.set(
      `${occurrence.exportName}\u0000${occurrence.id}`,
      record,
    );
  }

  const profileRows = ids.map((id) => {
    const htpProfile = htpProfiles.find((candidate) => candidate.id === id);
    if (htpProfile === undefined) throw new Error(`missing HTP profile for ${id}`);
    const profileOccurrences = occurrences
      .filter((occurrence) => occurrence.id === id)
      .sort(compareOccurrence);
    const occurrenceExports = profileOccurrences.map(({ exportName }) => exportName);
    const sourceRows = occurrenceExports.map((exportName) => {
      const record = sourceRecordByOccurrence.get(`${exportName}\u0000${id}`);
      if (record === undefined) throw new Error(`missing source witness for ${exportName}/${id}`);
      return { exportName, recordCanonical: canonical(record) };
    });
    const claims = profileOccurrences.map(({ exportName }) => {
      const spec = CLAIM_SPEC_BY_EXPORT.get(exportName);
      if (spec === undefined) throw new Error(`movement occurrence ${exportName} has no claim spec`);
      return buildClaim(spec, id,
        sourceRecordByOccurrence.get(`${exportName}\u0000${id}`));
    });
    if (new Set(claims.map(({ exportName }) => exportName)).size !== claims.length) {
      throw new Error(`movement/form profile ${id} has duplicate claims`);
    }
    const profile = {
      ...baseIdentity(
        sourceRecordByOccurrence.get(`${occurrenceExports[0]}\u0000${id}`),
        htpProfile,
        id,
      ),
      claims,
      occurrenceExports,
      sourceRecords: sourceRows,
    };
    if (id === "emberlance") {
      const sourceBytes = sourceRows.map(({ recordCanonical }) => recordCanonical);
      if (sourceBytes.length !== 2 || sourceBytes[0] !== sourceBytes[1]) {
        throw new Error("Emberlance duplicated source records disagree");
      }
      profile.composition = {
        mode: "one-shared-session-profile-membership-only",
        owner: "GAME-001HTC",
        questions: compositionQuestions(),
      };
    }
    return profile;
  }).sort((left, right) => compareText(left.id, right.id));

  const duplicatedIds = profilesWithDuplicateExports(profileRows);
  const questionBearingClaims = profileRows.flatMap(({ claims }) => claims)
    .filter(({ questionPolicy }) => questionPolicy !== null).length;
  const unresolvedOnlyClaims = profileRows.flatMap(({ claims }) => claims)
    .filter(({ unresolvedOnly }) => unresolvedOnly === true).length;
  const counts = {
    duplicatedIds,
    ids: ids.length,
    occurrences: occurrences.length,
    profiles: profileRows.length,
    questionBearingClaims,
    unresolvedOnlyClaims,
  };
  if (canonical(counts) !== canonical({
    duplicatedIds: 1,
    ids: 8,
    occurrences: 9,
    profiles: 8,
    questionBearingClaims: 6,
    unresolvedOnlyClaims: 1,
  })) {
    throw new Error("movement/form profile counts diverge from the pinned surface");
  }
  if (
    profileRows.length !== ids.length ||
    new Set(profileRows.map(({ id }) => id)).size !== ids.length ||
    profileRows.flatMap(({ claims }) => claims).length !== occurrences.length
  ) {
    throw new Error("movement/form profiles are not one-per-ID and one-per-occurrence");
  }
  const manifest = {
    counts,
    occurrences: occurrences.map((occurrence) => ({ ...occurrence })),
    profiles: profileRows,
    version: VERSION,
  };
  return freeze(manifest);
}

function profilesWithDuplicateExports(profiles) {
  const duplicateIds = profiles
    .filter(({ occurrenceExports }) => occurrenceExports.length > 1)
    .map(({ id }) => id)
    .sort(compareText);
  if (canonical(duplicateIds) !== canonical(["emberlance"])) {
    throw new Error("movement/form duplicated profile IDs diverge from HTP");
  }
  return duplicateIds.length;
}

const MANIFEST = buildManifest();

export function createSessionTroopMovementProfileManifest(...args) {
  assertNoArguments(args, "session troop movement profile manifest");
  return deepFreezeClone(MANIFEST);
}

export function serializeSessionTroopMovementProfileManifest(...args) {
  assertNoArguments(args, "session troop movement profile manifest serialization");
  return canonical(MANIFEST);
}

export function getSessionTroopMovementProfile(id, ...args) {
  if (args.length !== 0) {
    throw new TypeError("session troop movement profile lookup takes exactly one argument");
  }
  if (typeof id !== "string") {
    throw new TypeError("session troop movement profile ID must be a primitive string");
  }
  const profile = MANIFEST.profiles.find((candidate) => candidate.id === id);
  if (profile === undefined) {
    throw new RangeError("session troop movement profile ID is unknown or not admitted");
  }
  return deepFreezeClone(profile);
}
