import { createHealCatalog, createHealQuestionRecords } from "./cards/combat-status-heal.js";
import { createInvisibilityQuestionRecords, createInvisibilitySpecialCatalog } from "./cards/combat-status-invisibility.js";
import { createShieldFormCatalog } from "./cards/shields-forms.js";
import { createSlowQuestionRecords, createSlowSpecialCatalog } from "./cards/special-combat-slow.js";
import { createSnareQuestionRecords, createSnareSpecialCatalog } from "./cards/special-combat-snare.js";
import { createReflectionQuestionFixture, createReflectionSpecialCatalog } from "./cards/special-projectiles-reflection.js";
import { createStunQuestionRecords, createStunSpecialCatalog } from "./cards/combat-status-stun.js";
import { createSessionTroopProfileManifest } from "./session-troop-profile-catalog.js";

const VERSION = 1;
const MAX_ID_LENGTH = 128;
const MAX_SOURCE_CATALOG_ROWS = 8;
const MAX_COMPONENT_ROWS = 16;
const MAX_DISPLAY_NAME_LENGTH = 80;
const INTEGRATION_PENDING = Object.freeze({
  status: "pending",
  statement: "shared runtime integration remains pending",
});

const EXPECTED_OCCURRENCES = Object.freeze([
  Object.freeze({ exportName: "createReflectionSpecialCatalog", id: "aegis-sage" }),
  Object.freeze({ exportName: "createHealCatalog", id: "bloom-wisp" }),
  Object.freeze({ exportName: "createHealCatalog", id: "dawnmender" }),
  Object.freeze({ exportName: "createStunSpecialCatalog", id: "pulse-sentry" }),
  Object.freeze({ exportName: "createShieldFormCatalog", id: "railward" }),
  Object.freeze({ exportName: "createSlowSpecialCatalog", id: "rime-adept" }),
  Object.freeze({ exportName: "createSnareSpecialCatalog", id: "tether-rider" }),
  Object.freeze({ exportName: "createInvisibilitySpecialCatalog", id: "veil-prowler" }),
]);
const DOMAIN_EXPORTS = new Set(EXPECTED_OCCURRENCES.map(({ exportName }) => exportName));

const EXPECTED_SOURCE_IDS_BY_EXPORT = Object.freeze({
  createReflectionSpecialCatalog: Object.freeze(["aegis-sage"]),
  createHealCatalog: Object.freeze(["bloom-wisp", "dawnmender"]),
  createStunSpecialCatalog: Object.freeze(["pulse-sentry"]),
  createShieldFormCatalog: Object.freeze(["railward"]),
  createSlowSpecialCatalog: Object.freeze(["rime-adept"]),
  createSnareSpecialCatalog: Object.freeze(["tether-rider"]),
  createInvisibilitySpecialCatalog: Object.freeze(["veil-prowler"]),
});

const SOURCE_RECORD_FIELDS = Object.freeze([
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

const SOURCE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const SOURCE_RARITIES = new Set([
  "standard", "uncommon", "special", "mythic", "heroic",
]);
const SOURCE_TARGET_MODES = new Set([
  "none", "ground", "air", "ground-and-air", "structures",
]);
const SOURCE_COMPONENT_ROLES = new Set([
  "primary", "secondary", "spawn", "spawn-over-time",
]);
const SOURCE_COMPONENT_KINDS = new Set(["unit", "structure", "effect"]);

const SOURCE_BINDINGS = Object.freeze([
  Object.freeze({
    claimFamily: "reflection",
    exportName: "createReflectionSpecialCatalog",
    factory: createReflectionSpecialCatalog,
    questionFactory: createReflectionQuestionFixture,
    questionFactoryName: "createReflectionQuestionFixture",
  }),
  Object.freeze({
    claimFamily: "heal",
    exportName: "createHealCatalog",
    factory: createHealCatalog,
    questionFactory: createHealQuestionRecords,
    questionFactoryName: "createHealQuestionRecords",
  }),
  Object.freeze({
    claimFamily: "stun",
    exportName: "createStunSpecialCatalog",
    factory: createStunSpecialCatalog,
    questionFactory: createStunQuestionRecords,
    questionFactoryName: "createStunQuestionRecords",
  }),
  Object.freeze({
    claimFamily: "shield-form",
    exportName: "createShieldFormCatalog",
    factory: createShieldFormCatalog,
    questionFactory: null,
    questionFactoryName: null,
  }),
  Object.freeze({
    claimFamily: "slow",
    exportName: "createSlowSpecialCatalog",
    factory: createSlowSpecialCatalog,
    questionFactory: createSlowQuestionRecords,
    questionFactoryName: "createSlowQuestionRecords",
  }),
  Object.freeze({
    claimFamily: "snare",
    exportName: "createSnareSpecialCatalog",
    factory: createSnareSpecialCatalog,
    questionFactory: createSnareQuestionRecords,
    questionFactoryName: "createSnareQuestionRecords",
  }),
  Object.freeze({
    claimFamily: "invisibility",
    exportName: "createInvisibilitySpecialCatalog",
    factory: createInvisibilitySpecialCatalog,
    questionFactory: createInvisibilityQuestionRecords,
    questionFactoryName: "createInvisibilityQuestionRecords",
  }),
]);

const EXPECTED_QUESTION_RECORD_COUNTS = Object.freeze({
  createHealQuestionRecords: 47,
  createInvisibilityQuestionRecords: 41,
  createReflectionQuestionFixture: 31,
  createSlowQuestionRecords: 43,
  createSnareQuestionRecords: 43,
  createStunQuestionRecords: 35,
});

const HTP_COMPOSITION_QUESTION_FIELDS = Object.freeze([
  "abilityCost",
  "cancellation",
  "damage",
  "mechanicOrdering",
  "phaseTiming",
  "radius",
  "runtimeComposition",
  "targeting",
]);
const ADDITIONAL_AEGIS_COMPOSITION_QUESTIONS = Object.freeze([
  "loops",
  "sameBoundaryTiming",
  "targetOwnership",
]);
const AEGIS_COMPOSITION_QUESTION_FIELDS = Object.freeze([
  ...HTP_COMPOSITION_QUESTION_FIELDS,
  ...ADDITIONAL_AEGIS_COMPOSITION_QUESTIONS,
]);

const EXPECTED_COUNTS = Object.freeze({
  occurrencePairs: 8,
  ids: 8,
  profiles: 8,
  claims: 8,
  healClaims: 2,
  statusClaims: 5,
  visibilityClaims: 1,
  questionBearingClaims: 7,
  unresolvedOnlyClaims: 1,
  duplicatedCompositionIds: 1,
  compositionOwnedIds: 1,
  questionFactories: 6,
  questionRecords: 240,
});

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) freeze(value[key]);
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

function compareOccurrences(left, right) {
  return compareText(left.id, right.id) || compareText(left.exportName, right.exportName);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort(compareText).map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertNoArguments(args, label) {
  if (args.length !== 0) throw new TypeError(`${label} accepts no arguments`);
}

function assertPlainDataObject(value, label) {
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
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key !== "string" || !descriptor.enumerable ||
        !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label} must contain enumerable data properties`);
    }
  }
  return descriptors;
}

function assertExactFields(value, fields, label) {
  const descriptors = assertPlainDataObject(value, label);
  const actual = Reflect.ownKeys(descriptors).sort(compareText);
  const expected = [...fields].sort(compareText);
  if (actual.length !== expected.length ||
      actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has an incomplete or extra field`);
  }
  return descriptors;
}

function assertDenseArray(value, label, maximum = MAX_SOURCE_CATALOG_ROWS) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maximum
  ) {
    throw new TypeError(`${label} must be a bounded plain array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expected = new Set(["length", ...Array.from(
    { length: value.length }, (_, index) => String(index),
  )]);
  const lengthDescriptor = descriptors.length;
  if (
    Reflect.ownKeys(descriptors).length !== expected.size ||
    [...Reflect.ownKeys(descriptors)].some((key) =>
      typeof key !== "string" || !expected.has(key)) ||
    !lengthDescriptor ||
    !Object.hasOwn(lengthDescriptor, "value") ||
    lengthDescriptor.value !== value.length ||
    lengthDescriptor.enumerable ||
    [...Array(value.length).keys()].some((index) => {
      const descriptor = descriptors[String(index)];
      return !descriptor || !descriptor.enumerable ||
        !Object.hasOwn(descriptor, "value");
    })
  ) {
    throw new TypeError(`${label} must be dense and data-only`);
  }
  return descriptors;
}

function assertSourceNumber(value, label, minimum = 0) {
  if (value !== null && (!Number.isSafeInteger(value) || value < minimum)) {
    throw new TypeError(`${label} must be a safe integer or null`);
  }
}

function validateSourceRecord(record, exportName, rowLabel) {
  assertExactFields(record, SOURCE_RECORD_FIELDS, `${exportName}/${rowLabel}`);
  if (
      typeof record.id !== "string" || record.id.length === 0 ||
      record.id.length > MAX_ID_LENGTH || !SOURCE_ID_PATTERN.test(record.id) ||
      record.kind !== "unit" ||
      typeof record.displayName !== "string" ||
      record.displayName.length === 0 ||
      record.displayName.length > MAX_DISPLAY_NAME_LENGTH ||
      record.displayName.trim() !== record.displayName ||
      /[\u0000-\u001f\u007f]/u.test(record.displayName) ||
      !Number.isSafeInteger(record.cost) || record.cost < 1 || record.cost > 10 ||
      !Number.isSafeInteger(record.count) || record.count < 1) {
    throw new TypeError(`${exportName}/${rowLabel} has a noncanonical unit identity`);
  }
  for (const [field, minimum] of [
    ["damage", 1],
    ["deployTimeTicks", 0],
    ["firstHitTicks", 0],
    ["hitSpeedTicks", 1],
    ["hitpoints", 1],
    ["movementMillitilesPerSecond", 0],
    ["rangeMillitiles", 0],
    ["sightRangeMillitiles", 1],
    ["areaDamageRadiusMillitiles", 1],
  ]) assertSourceNumber(record[field], `${exportName}/${rowLabel}.${field}`, minimum);
  if (!SOURCE_RARITIES.has(record.rarity) ||
      !SOURCE_TARGET_MODES.has(record.targetMode)) {
    throw new TypeError(`${exportName}/${rowLabel} has an invalid archetype`);
  }
  const componentDescriptors = assertDenseArray(
    record.components, `${exportName}/${rowLabel}.components`, MAX_COMPONENT_ROWS,
  );
  for (let index = 0; index < record.components.length; index += 1) {
    const component = componentDescriptors[String(index)].value;
    assertExactFields(
      component,
      COMPONENT_FIELDS,
      `${exportName}/${rowLabel}.components[${index}]`,
    );
    if (
      typeof component.id !== "string" ||
      component.id.length === 0 ||
      component.id.length > MAX_ID_LENGTH ||
      !SOURCE_ID_PATTERN.test(component.id) ||
      typeof component.displayName !== "string" ||
      component.displayName.length === 0 ||
      component.displayName.length > MAX_DISPLAY_NAME_LENGTH ||
      component.displayName.trim() !== component.displayName ||
      /[\u0000-\u001f\u007f]/u.test(component.displayName) ||
      !SOURCE_COMPONENT_KINDS.has(component.kind) ||
      !SOURCE_COMPONENT_ROLES.has(component.role) ||
      !SOURCE_TARGET_MODES.has(component.targetMode)
    ) {
      throw new TypeError(`${exportName}/${rowLabel} has a noncanonical component`);
    }
    for (const [field, minimum] of [
      ["damage", 1],
      ["deployTimeTicks", 0],
      ["firstHitTicks", 0],
      ["hitSpeedTicks", 1],
      ["hitpoints", 1],
      ["movementMillitilesPerSecond", 0],
      ["rangeMillitiles", 0],
      ["sightRangeMillitiles", 1],
      ["areaDamageRadiusMillitiles", 1],
    ]) {
      assertSourceNumber(
        component[field],
        `${exportName}/${rowLabel}.components[${index}].${field}`,
        minimum,
      );
    }
    if (!Number.isSafeInteger(component.count) || component.count < 1) {
      throw new TypeError(`${exportName}/${rowLabel}.components[${index}].count must be a positive safe integer`);
    }
  }
  return record;
}

function validateSourceCatalogRows(value, binding) {
  const descriptors = assertDenseArray(value, `${binding.exportName} result`);
  const records = [...Array(value.length).keys()].map((index) =>
    validateSourceRecord(
      descriptors[String(index)].value,
      binding.exportName,
      `row-${index}`,
    )
  );
  try {
    structuredClone(value);
  } catch {
    throw new TypeError(`${binding.exportName} result must contain cloneable data`);
  }
  return records;
}

function assertExpectedSourceIds(binding, records) {
  const expected = EXPECTED_SOURCE_IDS_BY_EXPORT[binding.exportName];
  if (expected === undefined) {
    throw new Error(`${binding.exportName} has no pinned source ID set`);
  }
  const actual = records.map(({ id }) => id);
  const sortedActual = [...actual].sort(compareText);
  const sortedExpected = [...expected].sort(compareText);
  if (canonical(sortedActual) !== canonical(sortedExpected)) {
    throw new Error(`${binding.exportName} has a missing, stale, or extra source record`);
  }
  if (new Set(actual).size !== actual.length) {
    throw new Error(`${binding.exportName} has duplicate source IDs`);
  }
}

function assertFreshSourceCatalog(firstValue, secondValue, first, second, binding) {
  if (firstValue === secondValue || first.length !== second.length) {
    throw new Error(`${binding.exportName} source catalog is not fresh`);
  }
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] === second[index] ||
        first[index].components === second[index].components) {
      throw new Error(`${binding.exportName} source catalog rows are not fresh`);
    }
    for (let componentIndex = 0;
         componentIndex < first[index].components.length;
         componentIndex += 1) {
      if (first[index].components[componentIndex] ===
          second[index].components[componentIndex]) {
        throw new Error(`${binding.exportName} source catalog components are not fresh`);
      }
    }
  }
}

function buildSourceCatalogCache() {
  const cache = new Map();
  for (const binding of SOURCE_BINDINGS) {
    if (cache.has(binding.exportName)) {
      throw new Error(`${binding.exportName} source export is bound more than once`);
    }
    const firstValue = binding.factory();
    const first = validateSourceCatalogRows(firstValue, binding);
    const secondValue = binding.factory();
    const second = validateSourceCatalogRows(secondValue, binding);
    assertFreshSourceCatalog(firstValue, secondValue, first, second, binding);
    if (canonical(first) !== canonical(second)) {
      throw new Error(`${binding.exportName} is not deterministic across source reads`);
    }
    assertExpectedSourceIds(binding, first);
    assertExpectedSourceIds(binding, second);
    const byId = new Map(first.map((record) => [record.id, record]));
    cache.set(binding.exportName, { byId, records: first });
  }
  if (cache.size !== Object.keys(EXPECTED_SOURCE_IDS_BY_EXPORT).length ||
      Object.keys(EXPECTED_SOURCE_IDS_BY_EXPORT).some((exportName) =>
        !cache.has(exportName))) {
    throw new Error("status source catalog cache is incomplete");
  }
  return cache;
}

function sourceRecordFor(cache, binding, id) {
  const catalog = cache.get(binding.exportName);
  if (catalog === undefined) {
    throw new Error(`no cached source catalog for ${binding.exportName}`);
  }
  const record = catalog.byId.get(id);
  if (record === undefined) {
    throw new Error(`${binding.exportName}/${id} does not provide exactly one source record`);
  }
  return record;
}

function htpOccurrenceSlice(htp) {
  if (htp === null || typeof htp !== "object" || !Array.isArray(htp.occurrences)) {
    throw new TypeError("session troop status profiles require the HTP occurrence manifest");
  }
  const expected = EXPECTED_OCCURRENCES.map((entry) => ({
    ...entry,
    status: "admitted",
  }));
  const candidate = htp.occurrences.filter(({ exportName }) => DOMAIN_EXPORTS.has(exportName));
  if (canonical(candidate) !== canonical(expected)) {
    throw new Error("session troop status occurrence slice diverges from HTP");
  }
  if (new Set(candidate.map(({ exportName, id }) => `${exportName}\u0000${id}`)).size !==
      candidate.length) {
    throw new Error("session troop status occurrence slice contains a duplicate pair");
  }
  return candidate;
}

function htpProfileFor(htp, id, exportName) {
  const profiles = htp.profiles.filter((profile) => profile.id === id);
  if (profiles.length !== 1) throw new Error(`HTP must have one profile for ${id}`);
  const profile = profiles[0];
  if (!Array.isArray(profile.occurrenceExports) ||
      [...profile.occurrenceExports].sort(compareText).join("\u0000") !==
        profile.occurrenceExports.join("\u0000") ||
      !profile.occurrenceExports.includes(exportName)) {
    throw new Error(`HTP profile ${id} is stale for ${exportName}`);
  }
  return profile;
}

function htpIdentity(profile) {
  return {
    cost: profile.cost,
    deployTimeTicks: profile.deployTimeTicks,
    displayName: profile.displayName,
    id: profile.id,
    kind: profile.kind,
    placementClass: profile.placementClass,
  };
}

function sourceIdentity(record) {
  return {
    cost: record.cost,
    deployTimeTicks: record.deployTimeTicks,
    displayName: record.displayName,
    id: record.id,
    kind: record.kind,
    placementClass: "ground_entity",
  };
}

function validateQuestionRecord(record, mapKey, label) {
  const descriptors = assertPlainDataObject(record, label);
  const hasKey = Object.hasOwn(descriptors, "key");
  const expected = hasKey
    ? ["authoritative", "confidence", "disposition", "key", "source", "value"]
    : ["authoritative", "confidence", "disposition", "source", "value"];
  assertExactFields(record, expected, label);
  if (record.authoritative !== false || record.confidence !== "unverified" ||
      record.disposition !== "question" || typeof record.source !== "string" ||
      record.source.length === 0 || (hasKey && record.key !== mapKey)) {
    throw new TypeError(`${label} is not the exact non-authoritative QUESTION shape`);
  }
  clone(record.value);
}

function questionReceipt(binding) {
  if (binding.questionFactory === null) return null;
  const first = binding.questionFactory();
  const second = binding.questionFactory();
  if (first === second || canonical(first) !== canonical(second)) {
    throw new Error(`${binding.questionFactoryName} is not fresh and deterministic`);
  }
  let rejected = false;
  try {
    binding.questionFactory({ override: true });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error(`${binding.questionFactoryName} accepts overrides`);
  const firstDescriptors = assertPlainDataObject(first, binding.questionFactoryName);
  const keys = Reflect.ownKeys(firstDescriptors).sort(compareText);
  const expectedCount = EXPECTED_QUESTION_RECORD_COUNTS[binding.questionFactoryName];
  if (expectedCount === undefined || keys.length !== expectedCount) {
    throw new Error(`${binding.questionFactoryName} has an unexpected record count`);
  }
  const records = keys.map((key) => {
    const firstRecord = firstDescriptors[key].value;
    const secondRecord = Object.getOwnPropertyDescriptor(second, key)?.value;
    if (firstRecord === secondRecord || canonical(firstRecord) !== canonical(secondRecord)) {
      throw new Error(`${binding.questionFactoryName}/${key} is not fresh and deterministic`);
    }
    validateQuestionRecord(firstRecord, key, `${binding.questionFactoryName}.${key}`);
    return { key, rawRecord: clone(firstRecord) };
  });
  return {
    claimFamily: binding.claimFamily,
    factory: binding.questionFactoryName,
    records,
    sourceExport: binding.exportName,
  };
}

function pendingAegisComposition() {
  return {
    mode: "membership-only",
    questions: AEGIS_COMPOSITION_QUESTION_FIELDS.map((field) => ({
      field,
      reason: "shared composition remains pending",
      status: "question",
    })),
    runtime: "shared runtime integration remains pending",
  };
}

function buildManifest() {
  const htp = createSessionTroopProfileManifest();
  const occurrences = htpOccurrenceSlice(htp);
  const sourceCatalogCache = buildSourceCatalogCache();
  const bindingsByExport = new Map(SOURCE_BINDINGS.map((binding) =>
    [binding.exportName, binding]));
  const questionReceipts = SOURCE_BINDINGS
    .map(questionReceipt)
    .filter((receipt) => receipt !== null)
    .sort((left, right) => compareText(left.factory, right.factory));
  const receiptsByFamily = new Map(questionReceipts.map((receipt) =>
    [receipt.claimFamily, receipt]));
  const claims = occurrences.map((occurrence) => {
    const binding = bindingsByExport.get(occurrence.exportName);
    if (binding === undefined) throw new Error(`no source binding for ${occurrence.exportName}`);
    const profile = htpProfileFor(htp, occurrence.id, occurrence.exportName);
    const record = sourceRecordFor(sourceCatalogCache, binding, occurrence.id);
    if (canonical(sourceIdentity(record)) !== canonical(htpIdentity(profile))) {
      throw new Error(`${binding.exportName}/${occurrence.id} diverges from HTP identity`);
    }
    const receipt = receiptsByFamily.get(binding.claimFamily);
    const claim = {
      claimFamily: binding.claimFamily,
      id: occurrence.id,
      integration: { ...INTEGRATION_PENDING },
      sourceExport: binding.exportName,
      sourceRecord: clone(record),
      sourceWitness: canonical(record),
      htpProvenance: {
        manifest: "createSessionTroopProfileManifest",
        occurrence: clone(occurrence),
        profile: {
          ...htpIdentity(profile),
          id: profile.id,
          occurrenceExports: [...profile.occurrenceExports],
        },
      },
    };
    if (receipt === undefined) {
      if (binding.claimFamily !== "shield-form") {
        throw new Error(`${binding.claimFamily} is missing its QUESTION receipt`);
      }
      claim.resolution = "unresolved-only";
      claim.questionReceipt = null;
      claim.unresolved = {
        fields: [
          "shieldMagnitude",
          "shieldDuration",
          "formTransition",
          "phaseTiming",
          "retargeting",
          "stationaryForm",
        ].map((field) => ({
          field,
          reason: "source does not supply this shield/form fact",
          status: "unresolved",
        })),
        reason: "createShieldFormCatalog has no exported QUESTION factory; shield/form mechanics remain unresolved-only",
      };
    } else {
      claim.resolution = "question-bearing";
      claim.questionReceipt = receipt.factory;
      claim.unresolved = null;
    }
    if (binding.claimFamily === "reflection") {
      claim.reflection = {
        projectileMembership: "pending",
        statusMembership: "provenance-only",
      };
      claim.composition = pendingAegisComposition();
    } else {
      claim.reflection = null;
      claim.composition = null;
    }
    return claim;
  }).sort(compareOccurrences);

  const profiles = claims.map((claim) => ({
    claimFamily: claim.claimFamily,
    composition: claim.composition === null ? null : clone(claim.composition),
    id: claim.id,
    integration: { ...INTEGRATION_PENDING },
    occurrence: clone(claim.htpProvenance.occurrence),
    questionReceipt: claim.questionReceipt,
    resolution: claim.resolution,
    sourceExport: claim.sourceExport,
    sourceRecord: clone(claim.sourceRecord),
    sourceWitness: claim.sourceWitness,
    unresolved: claim.unresolved === null ? null : clone(claim.unresolved),
  }));

  const ids = [...new Set(claims.map(({ id }) => id))].sort(compareText);
  const questionRecordCount = questionReceipts.reduce((total, receipt) =>
    total + receipt.records.length, 0);
  const compositionOwnedIds = new Set(claims.filter(({ htpProvenance: provenance }) =>
    htp.compositions.some((composition) =>
      composition.id === provenance.occurrence.id &&
      composition.occurrenceExports.includes(provenance.occurrence.exportName)),
  ).map(({ id }) => id));
  const counts = {
    claims: claims.length,
    compositionOwnedIds: compositionOwnedIds.size,
    duplicatedCompositionIds: compositionOwnedIds.size,
    healClaims: claims.filter(({ claimFamily }) => claimFamily === "heal").length,
    ids: ids.length,
    occurrencePairs: occurrences.length,
    profiles: profiles.length,
    questionBearingClaims: claims.filter(({ resolution }) => resolution === "question-bearing").length,
    questionFactories: questionReceipts.length,
    questionRecords: questionRecordCount,
    statusClaims: claims.filter(({ claimFamily }) =>
      ["shield-form", "stun", "slow", "snare", "reflection"].includes(claimFamily)).length,
    unresolvedOnlyClaims: claims.filter(({ resolution }) => resolution === "unresolved-only").length,
    visibilityClaims: claims.filter(({ claimFamily }) => claimFamily === "invisibility").length,
  };
  if (canonical(counts) !== canonical(EXPECTED_COUNTS)) {
    throw new Error(`session troop status profile counts diverge: ${canonical(counts)}`);
  }
  return freeze({
    claims,
    counts,
    occurrences: occurrences.map((occurrence) => ({
      ...occurrence,
      claimFamily: claims.find((claim) =>
        claim.id === occurrence.id && claim.sourceExport === occurrence.exportName).claimFamily,
    })),
    profiles,
    questionReceipts,
    version: VERSION,
  });
}

const MANIFEST = buildManifest();

export function createSessionTroopStatusProfileManifest(...args) {
  assertNoArguments(args, "session troop status profile manifest");
  return deepFreezeClone(MANIFEST);
}

export function serializeSessionTroopStatusProfileManifest(...args) {
  assertNoArguments(args, "session troop status profile manifest serialization");
  return canonical(MANIFEST);
}

export function getSessionTroopStatusProfile(id, ...args) {
  if (args.length !== 0) {
    throw new TypeError("session troop status profile lookup takes exactly one argument");
  }
  if (typeof id !== "string") {
    throw new TypeError("session troop status profile ID must be a primitive string");
  }
  if (id.length > MAX_ID_LENGTH) {
    throw new RangeError("session troop status profile ID is oversized");
  }
  const profile = MANIFEST.profiles.find((candidate) => candidate.id === id);
  if (profile === undefined) {
    throw new RangeError("session troop status profile ID is unknown or not admitted");
  }
  return deepFreezeClone(profile);
}
