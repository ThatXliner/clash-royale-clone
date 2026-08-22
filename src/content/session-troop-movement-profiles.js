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
const SOURCE_INTEGER_RULES = Object.freeze([
  Object.freeze({ field: "cost", allowNull: false, minimum: 1, maximum: 10 }),
  Object.freeze({ field: "count", allowNull: false, minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  Object.freeze({ field: "damage", allowNull: true, minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  Object.freeze({ field: "deployTimeTicks", allowNull: true, minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  Object.freeze({ field: "firstHitTicks", allowNull: true, minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  Object.freeze({ field: "hitSpeedTicks", allowNull: true, minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  Object.freeze({ field: "hitpoints", allowNull: true, minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  Object.freeze({ field: "movementMillitilesPerSecond", allowNull: true, minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  Object.freeze({ field: "rangeMillitiles", allowNull: true, minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  Object.freeze({ field: "sightRangeMillitiles", allowNull: true, minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
  Object.freeze({ field: "areaDamageRadiusMillitiles", allowNull: true, minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
]);
const COMPONENT_RECORD_KEYS = [
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
];
const COMPONENT_INTEGER_RULES = Object.freeze(
  SOURCE_INTEGER_RULES.filter(({ field }) => field !== "cost"),
);
const CANONICAL_MAX_ARRAY_LENGTH = 1_000_000;
const ADMITTED_CANONICAL_OBJECTS = new WeakSet();

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
  const active = new Set();

  function visit(candidate) {
    if (candidate === null) return "null";
    const type = typeof candidate;
    if (type === "string" || type === "boolean") return JSON.stringify(candidate);
    if (type === "number") {
      if (!Number.isFinite(candidate)) {
        throw new TypeError("canonical data must contain finite JSON numbers");
      }
      return JSON.stringify(candidate);
    }
    if (type !== "object") {
      throw new TypeError("canonical data must contain only JSON values");
    }
    // This check is deliberately the first operation on an object. WeakSet.has
    // does not consult Proxy traps, so no caller-owned object can reach the
    // descriptor, prototype, property, iteration, or clone operations below.
    if (!ADMITTED_CANONICAL_OBJECTS.has(candidate)) {
      throw new TypeError("canonical data must be admitted data");
    }
    if (active.has(candidate)) {
      throw new TypeError("canonical data must not contain cycles");
    }

    let isArray;
    let descriptors;
    try {
      isArray = Array.isArray(candidate);
      descriptors = Object.getOwnPropertyDescriptors(candidate);
    } catch {
      throw new TypeError("canonical data must be inspectable data");
    }
    const ownKeys = Reflect.ownKeys(descriptors);
    let keys;
    if (isArray) {
      const lengthDescriptor = descriptors.length;
      const length = lengthDescriptor?.value;
      if (
        !lengthDescriptor ||
        !Object.hasOwn(lengthDescriptor, "value") ||
        lengthDescriptor.enumerable ||
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > CANONICAL_MAX_ARRAY_LENGTH ||
        ownKeys.length !== length + 1
      ) {
        throw new TypeError("canonical arrays must be dense and bounded");
      }
      keys = Array.from({ length }, (_, index) => String(index));
      const expectedKeys = new Set(["length", ...keys]);
      if (ownKeys.some((key) => !expectedKeys.has(key))) {
        throw new TypeError("canonical arrays must contain only indexed data");
      }
      for (const key of keys) {
        const descriptor = descriptors[key];
        if (
          descriptor === undefined ||
          !descriptor.enumerable ||
          !Object.hasOwn(descriptor, "value")
        ) {
          throw new TypeError("canonical arrays must contain enumerable data");
        }
      }
    } else {
      keys = [...ownKeys].sort(compareText);
      for (const key of keys) {
        const descriptor = descriptors[key];
        if (
          typeof key !== "string" ||
          !descriptor.enumerable ||
          !Object.hasOwn(descriptor, "value")
        ) {
          throw new TypeError("canonical objects must contain enumerable data");
        }
      }
    }

    active.add(candidate);
    try {
      const encoded = isArray
        ? `[${keys.map((key) => visit(descriptors[key].value)).join(",")}]`
        : `{${keys.map((key) =>
          `${JSON.stringify(key)}:${visit(descriptors[key].value)}`
        ).join(",")}}`;
      return encoded;
    } finally {
      active.delete(candidate);
    }
  }

  return visit(value);
}

function samePrototypeSurface(actual, expected) {
  let left = actual;
  let right = expected;
  while (true) {
    if (left === right) return true;
    if (
      left === null ||
      right === null ||
      typeof left !== "object" ||
      typeof right !== "object"
    ) {
      return false;
    }
    let leftDescriptors;
    let rightDescriptors;
    try {
      leftDescriptors = Object.getOwnPropertyDescriptors(left);
      rightDescriptors = Object.getOwnPropertyDescriptors(right);
    } catch {
      return false;
    }
    const leftKeys = Reflect.ownKeys(leftDescriptors).map((key) =>
      typeof key === "symbol" ? `symbol:${key.description ?? ""}` : `string:${key}`
    ).sort(compareText);
    const rightKeys = Reflect.ownKeys(rightDescriptors).map((key) =>
      typeof key === "symbol" ? `symbol:${key.description ?? ""}` : `string:${key}`
    ).sort(compareText);
    if (
      leftKeys.length !== rightKeys.length ||
      leftKeys.some((key, index) => key !== rightKeys[index])
    ) {
      return false;
    }
    try {
      left = Object.getPrototypeOf(left);
      right = Object.getPrototypeOf(right);
    } catch {
      return false;
    }
  }
}

function admitCanonicalGraph(value, label = "canonical data") {
  const active = new Set();
  const nodes = [];

  function copy(candidate, path) {
    if (candidate === null) return null;
    const type = typeof candidate;
    if (type === "string" || type === "boolean") return candidate;
    if (type === "number") {
      if (!Number.isFinite(candidate)) {
        throw new TypeError(`${path} must contain finite JSON numbers`);
      }
      return candidate;
    }
    if (type !== "object") {
      throw new TypeError(`${path} must contain only JSON values`);
    }
    if (active.has(candidate)) {
      throw new TypeError(`${path} must not contain cycles`);
    }

    let isArray;
    let prototype;
    let descriptors;
    try {
      isArray = Array.isArray(candidate);
      prototype = Object.getPrototypeOf(candidate);
      descriptors = Object.getOwnPropertyDescriptors(candidate);
    } catch {
      throw new TypeError(`${path} must be inspectable data`);
    }
    if (
      isArray
        ? !samePrototypeSurface(prototype, Array.prototype)
        : prototype !== null && !samePrototypeSurface(prototype, Object.prototype)
    ) {
      throw new TypeError(`${path} must use plain JSON prototypes`);
    }

    const ownKeys = Reflect.ownKeys(descriptors);
    let keys;
    if (isArray) {
      const lengthDescriptor = descriptors.length;
      const length = lengthDescriptor?.value;
      if (
        !lengthDescriptor ||
        !Object.hasOwn(lengthDescriptor, "value") ||
        lengthDescriptor.enumerable ||
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > CANONICAL_MAX_ARRAY_LENGTH ||
        ownKeys.length !== length + 1
      ) {
        throw new TypeError(`${path} must be a dense and bounded array`);
      }
      keys = Array.from({ length }, (_, index) => String(index));
      const expectedKeys = new Set(["length", ...keys]);
      if (ownKeys.some((key) => !expectedKeys.has(key))) {
        throw new TypeError(`${path} must contain only indexed data`);
      }
    } else {
      keys = [...ownKeys].sort(compareText);
      if (keys.some((key) => typeof key !== "string")) {
        throw new TypeError(`${path} must contain only string data keys`);
      }
    }
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !Object.hasOwn(descriptor, "value")
      ) {
        throw new TypeError(`${path}.${key} must be an enumerable data property`);
      }
    }

    const copyTarget = isArray
      ? []
      : prototype === null ? Object.create(null) : {};
    active.add(candidate);
    try {
      for (const key of keys) {
        const child = copy(descriptors[key].value, `${path}.${key}`);
        if (isArray) {
          copyTarget[key] = child;
        } else {
          Object.defineProperty(copyTarget, key, {
            configurable: true,
            enumerable: true,
            value: child,
            writable: true,
          });
        }
      }
    } finally {
      active.delete(candidate);
    }
    nodes.push(copyTarget);
    return copyTarget;
  }

  const copyValue = copy(value, label);
  for (const node of nodes) ADMITTED_CANONICAL_OBJECTS.add(node);
  return copyValue;
}

function canonicalTrusted(value, label = "canonical data") {
  if (value !== null && typeof value === "object") {
    return canonical(admitCanonicalGraph(value, label));
  }
  return canonical(value);
}

function sourceRecordKey(exportName, id) {
  return `${exportName}\u0000${id}`;
}

function assertFactoryShapeSurface(factory, label) {
  let source;
  try {
    source = Function.prototype.toString.call(factory);
  } catch {
    throw new TypeError(`${label} is not an inspectable source factory`);
  }
  // Source factories are trusted module capabilities, but their returned
  // graphs are still validated below. Reject shape-changing wrapper code
  // before invoking it so a transformed or hostile factory cannot create a
  // Proxy/accessor/custom-prototype graph whose inspection would call back.
  if (/(?:new\s+Proxy|Proxy\.revocable|Object\.defineProperty|Object\.setPrototypeOf)/u.test(source)) {
    throw new TypeError(`${label} contains an unadmitted object shape transform`);
  }
}

const EXPECTED_QUESTION_FACTORIES = Object.freeze([
  "createChargeQuestionFixture",
  "createChargeKnockbackQuestionRecords",
  "createDashQuestionFixture",
  "createJumpQuestionFixture",
  "createRecoilQuestionFixture",
  "createRetargetQuestionRecords",
]);

// These are complete raw factory results serialized by the canonical
// serializer below. They are intentional conscious-update barriers: a
// question factory may not change its records, values, metadata, nesting, or
// array order without updating this profile contract.
const EXPECTED_QUESTION_WITNESS = Object.freeze({
  createChargeQuestionFixture: "{\"armDistanceMillitiles\":3500,\"authoritative\":false,\"bonusDamage\":392,\"chargedMovementMillitilesPerSecond\":2000,\"confidence\":\"unverified\",\"disposition\":\"question\",\"provenance\":{\"armDistanceMillitiles\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-special-mechanic-fixture\"},\"bonusDamage\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-special-mechanic-fixture\"},\"chargedMovementMillitilesPerSecond\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-special-mechanic-fixture\"}},\"source\":\"unsourced-special-mechanic-fixture\"}",
  createChargeKnockbackQuestionRecords: "{\"attackAfterDisplacement\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"attackAfterDisplacement\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":\"reach-is-recomputed-before-readiness\"},\"attackBoundaryInclusive\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"attackBoundaryInclusive\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":true},\"attackDamageOrder\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"attackDamageOrder\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":\"damage-then-death-then-charge-consumption\"},\"chargeArmDistanceMillitiles\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"chargeArmDistanceMillitiles\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":3500},\"chargeBonusDamage\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"chargeBonusDamage\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":392},\"chargeConsumption\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"chargeConsumption\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":\"first-ready-strike-only\"},\"chargeResetOnDisplacement\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"chargeResetOnDisplacement\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":\"any-applied-forced-displacement\"},\"chargeResetOnTargetChange\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"chargeResetOnTargetChange\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":\"any-loss-or-different-id-reacquisition\"},\"chargedMovementMillitilesPerSecond\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"chargedMovementMillitilesPerSecond\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":2000},\"commandPriority\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"commandPriority\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":\"all-commands-before-selection-movement-and-readiness\"},\"deathInvalidation\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"deathInvalidation\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":\"dead-target-is-lost-on-next-boundary\"},\"displacementEligibility\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"displacementEligibility\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":\"living-charger-only\"},\"displacementGeometry\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"displacementGeometry\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":\"delegate-exact-forced-knockback-projection\"},\"displacementRoutePolicy\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"displacementRoutePolicy\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":\"reanchor-manhattan-route-from-exact-displaced-position\"},\"eventOrdering\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"eventOrdering\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":[\"forced-knockback\",\"target-lost\",\"target-acquired\",\"charge-reset\",\"move\",\"charge-armed\",\"reached\",\"attack\",\"death\",\"charge-consumed\"]},\"firstHitAfterReacquisition\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"firstHitAfterReacquisition\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":\"full-54-tick-windup\"},\"knockbackAttackCancellation\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"knockbackAttackCancellation\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":\"reach-loss-cancels-current-windup\"},\"movementAfterCommand\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"movementAfterCommand\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":\"same-boundary-after-selection\"},\"retargetPolicy\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"retargetPolicy\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":\"sticky-valid-then-nearest-with-ascending-stable-id-ties\"},\"routeDistanceCompatibility\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"routeDistanceCompatibility\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":\"undisplaced-trace-identical-to-content-008c\"},\"sightBoundaryInclusive\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"sightBoundaryInclusive\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":true},\"sightRangeCompositionMillitiles\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"sightRangeCompositionMillitiles\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":7000},\"targetHealthFixture\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"targetHealthFixture\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":5000},\"targetMode\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"targetMode\",\"source\":\"unsourced-charge-forced-knockback-retarget-composition\",\"value\":\"ground\"}}",
  createDashQuestionFixture: "{\"authoritative\":false,\"bonusDamage\":193,\"confidence\":\"unverified\",\"disposition\":\"question\",\"inclusiveLaunchBoundary\":true,\"interpolationRule\":\"integer-truncate-toward-zero\",\"interruptionRule\":\"cancel-at-last-completed-position\",\"launchMaximumMillitiles\":6000,\"launchMinimumMillitiles\":3500,\"provenance\":{\"bonusDamage\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-dash-fixture\"},\"inclusiveLaunchBoundary\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-dash-fixture\"},\"interpolationRule\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-dash-fixture\"},\"interruptionRule\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-dash-fixture\"},\"launchMaximumMillitiles\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-dash-fixture\"},\"launchMinimumMillitiles\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-dash-fixture\"},\"targetDeathRule\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-dash-fixture\"},\"transitTicks\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-dash-fixture\"},\"untargetableDuringTransit\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-dash-fixture\"}},\"source\":\"unsourced-targeted-dash-fixture\",\"targetDeathRule\":\"continue-to-snapshot-and-skip-damage\",\"transitTicks\":30,\"untargetableDuringTransit\":true}",
  createJumpQuestionFixture: "{\"authoritative\":false,\"commandsResolveBeforeMovement\":true,\"confidence\":\"unverified\",\"destinationRule\":\"snapshot-at-takeoff\",\"disposition\":\"question\",\"inclusiveTriggerBoundary\":true,\"interpolationRule\":\"integer-truncate-toward-zero\",\"interruptionRule\":\"cancel-at-last-completed-position-without-impact\",\"landingDamage\":536,\"landingMode\":\"ground\",\"landingRadiusMillitiles\":1300,\"provenance\":{\"commandsResolveBeforeMovement\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-jump-fixture\"},\"destinationRule\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-jump-fixture\"},\"inclusiveTriggerBoundary\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-jump-fixture\"},\"interpolationRule\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-jump-fixture\"},\"interruptionRule\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-jump-fixture\"},\"landingDamage\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-jump-fixture\"},\"landingMode\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-jump-fixture\"},\"landingRadiusMillitiles\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-jump-fixture\"},\"targetDeathRule\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-jump-fixture\"},\"transitTicks\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-jump-fixture\"},\"triggerMaximumMillitiles\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-jump-fixture\"},\"triggerMinimumMillitiles\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-jump-fixture\"},\"untargetableDuringTransit\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-targeted-jump-fixture\"}},\"source\":\"unsourced-targeted-jump-fixture\",\"targetDeathRule\":\"cancel-before-takeoff; continue-to-snapshot-after-takeoff-and-exclude-dead-target\",\"transitTicks\":36,\"triggerMaximumMillitiles\":5000,\"triggerMinimumMillitiles\":3500,\"untargetableDuringTransit\":true}",
  createRecoilQuestionFixture: "{\"authoritative\":false,\"boundsRule\":\"clamp-center-to-radius-inset-closed-arena\",\"commandsResolveBeforeLaunch\":true,\"confidence\":\"unverified\",\"directionRule\":\"opposite-snapshotted-target-vector\",\"displacementProjectionRule\":\"euclidean-components-divide-by-exact-integer-vector-length\",\"disposition\":\"question\",\"interruptionRule\":\"interrupt-at-or-before-launch-boundary-suppresses-projectile-and-recoil\",\"launchBoundaryTick\":144,\"projectileDamage\":1,\"projectileRadiusMillitiles\":0,\"projectileSpeedMillitilesPerTick\":100,\"provenance\":{\"boundsRule\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-attack-recoil-fixture\"},\"commandsResolveBeforeLaunch\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-attack-recoil-fixture\"},\"directionRule\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-attack-recoil-fixture\"},\"displacementProjectionRule\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-attack-recoil-fixture\"},\"interruptionRule\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-attack-recoil-fixture\"},\"launchBoundaryTick\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-attack-recoil-fixture\"},\"projectileDamage\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-attack-recoil-fixture\"},\"projectileRadiusMillitiles\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-attack-recoil-fixture\"},\"projectileSpeedMillitilesPerTick\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-attack-recoil-fixture\"},\"recoilDistanceMillitiles\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-attack-recoil-fixture\"},\"targetDeathRule\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-attack-recoil-fixture\"},\"timingRule\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-attack-recoil-fixture\"},\"zeroVectorRule\":{\"confidence\":\"unverified\",\"disposition\":\"question\",\"source\":\"unsourced-attack-recoil-fixture\"}},\"recoilDistanceMillitiles\":2000,\"source\":\"unsourced-attack-recoil-fixture\",\"targetDeathRule\":\"death-after-launch-does-not-undo-recoil-or-remove-in-flight-projectile\",\"timingRule\":\"same-boundary-immediately-after-projectile-launch\",\"zeroVectorRule\":\"reject-undefined-direction\"}",
  createRetargetQuestionRecords: "{\"attackBoundaryInclusive\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"attackBoundaryInclusive\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":true},\"attackReachEligibility\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"attackReachEligibility\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":\"independent-from-sight-retention\"},\"attackerPosition\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"attackerPosition\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":{\"x\":0,\"y\":0}},\"attackerRadiusMillitiles\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"attackerRadiusMillitiles\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":300},\"candidateMutationPriority\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"candidateMutationPriority\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":\"commands-before-selection\"},\"damageApplication\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"damageApplication\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":\"ready-event-applies-one-damage-value\"},\"deathInvalidation\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"deathInvalidation\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":true},\"deathOnReadyBoundarySuppression\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"deathOnReadyBoundarySuppression\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":true},\"differentIdReacquisition\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"differentIdReacquisition\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":\"full-first-hit-windup\"},\"distanceMetric\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"distanceMetric\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":\"exact-bigint-squared-center-distance\"},\"eligibilityLossCancellation\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"eligibilityLossCancellation\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":true},\"eligibilityReentry\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"eligibilityReentry\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":\"full-first-hit-windup\"},\"eventOrdering\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"eventOrdering\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":[\"target-lost\",\"target-acquired\",\"attack-ready\",\"damage\",\"death\"]},\"idLossCancellation\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"idLossCancellation\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":true},\"missingIdInvalidation\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"missingIdInvalidation\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":true},\"modeInvalidation\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"modeInvalidation\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":true},\"readinessPriority\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"readinessPriority\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":\"selection-before-readiness\"},\"sameIdReentry\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"sameIdReentry\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":\"full-first-hit-windup\"},\"sightBoundaryInclusive\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"sightBoundaryInclusive\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":true},\"sightInvalidation\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"sightInvalidation\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":true},\"stickyRetention\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"stickyRetention\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":\"valid-current-target-is-retained\"},\"syntheticCandidateHealth\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"syntheticCandidateHealth\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":1000},\"targetableInvalidation\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"targetableInvalidation\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":true},\"tieBreak\":{\"authoritative\":false,\"confidence\":\"unverified\",\"disposition\":\"question\",\"key\":\"tieBreak\",\"source\":\"unsourced-retarget-attack-lifecycle-composition\",\"value\":\"ascending-stable-id\"}}",
});

function assertExpectedQuestionWitnessCoverage() {
  const expectedKeys = [...EXPECTED_QUESTION_FACTORIES].sort(compareText);
  const actualKeys = Object.keys(EXPECTED_QUESTION_WITNESS).sort(compareText);
  if (
    expectedKeys.length !== 6 ||
    canonicalTrusted(actualKeys) !== canonicalTrusted(expectedKeys) ||
    actualKeys.some((key) => typeof EXPECTED_QUESTION_WITNESS[key] !== "string")
  ) {
    throw new Error("movement question witness key set is missing, stale, or extra");
  }
}

// This is an intentional source-update barrier. These are complete runtime
// source records, serialized with the same canonical format used by the
// public receipt; an ID match alone is not sufficient authority.
const EXPECTED_SOURCE_WITNESS_MAP = Object.freeze({
  [sourceRecordKey("createBasicFlyingCatalog", "copperskiff")]: canonicalTrusted({
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
  [sourceRecordKey("createBasicFlyingCatalog", "skymaul")]: canonicalTrusted({
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
  [sourceRecordKey("createShieldFormCatalog", "railward")]: canonicalTrusted({
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
  [sourceRecordKey("createChargeSpecialCatalog", "emberlance")]: canonicalTrusted({
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
  [sourceRecordKey("createChargeKnockbackCatalog", "emberlance")]: canonicalTrusted({
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
  [sourceRecordKey("createDashSpecialCatalog", "veilrunner")]: canonicalTrusted({
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
  [sourceRecordKey("createJumpSpecialCatalog", "stonevault")]: canonicalTrusted({
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
  [sourceRecordKey("createRecoilSpecialCatalog", "cinderback")]: canonicalTrusted({
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
  [sourceRecordKey("createRetargetSpecialCatalog", "wayfinder")]: canonicalTrusted({
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
  if (canonicalTrusted(actualKeys) !== canonicalTrusted(expectedKeys)) {
    throw new Error("movement source witness key set is missing, stale, or extra");
  }
}

function assertNoArguments(args, label) {
  if (args.length !== 0) throw new TypeError(`${label} takes no arguments`);
}

function assertPlainDataObject(value, label) {
  let prototype;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    throw new TypeError(`${label} must be a plain data object`);
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain data object`);
  }
}

function assertPlainDataArray(value, label) {
  let prototype;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    throw new TypeError(`${label} must be a bounded array`);
  }
  if (prototype !== Array.prototype) {
    throw new TypeError(`${label} must be a bounded array`);
  }
}

function assertExactDataObject(value, keys, label, verifyPrototype = true) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
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
  if (verifyPrototype) assertPlainDataObject(value, label);
  return descriptors;
}

function assertDenseDataArray(value, label, maximum = 16, verifyPrototype = true) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be a bounded array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = descriptors.length?.value;
  if (
    !descriptors.length ||
    !Object.hasOwn(descriptors.length, "value") ||
    descriptors.length.enumerable ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > maximum
  ) {
    throw new TypeError(`${label} must be a bounded array`);
  }
  if (
    Reflect.ownKeys(descriptors).length !== length + 1 ||
    Array.from({ length }, (_, index) => index).some((index) =>
      !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value")
    )
  ) {
    throw new TypeError(`${label} must be a dense data array`);
  }
  if (verifyPrototype) assertPlainDataArray(value, label);
  return descriptors;
}

function assertSourceInteger(value, rule, label) {
  if (
    (rule.allowNull && value === null) ||
    (
      typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= rule.minimum &&
      value <= rule.maximum
    )
  ) {
    return;
  }
  const nullable = rule.allowNull ? " or null" : "";
  throw new TypeError(
    `${label} must be a safe integer between ${rule.minimum} and ${rule.maximum}${nullable}`,
  );
}

function validateSourceRecord(record, label) {
  const recordDescriptors = assertExactDataObject(record, SOURCE_RECORD_KEYS, label, false);
  const recordValue = (field) => recordDescriptors[field].value;
  if (
    typeof recordValue("id") !== "string" ||
    recordValue("id").length === 0 ||
    typeof recordValue("displayName") !== "string" ||
    recordValue("displayName").length === 0 ||
    recordValue("kind") !== "unit" ||
    !["standard", "uncommon", "rare", "epic", "legendary", "mythic", "special", "champion"].includes(recordValue("rarity")) ||
    !["ground", "air", "ground-and-air"].includes(recordValue("targetMode"))
  ) {
    throw new TypeError(`${label} is not a complete unit catalog record`);
  }
  for (const rule of SOURCE_INTEGER_RULES) {
    assertSourceInteger(recordValue(rule.field), rule, `${label}.${rule.field}`);
  }

  const components = recordValue("components");
  const componentDescriptors = assertDenseDataArray(components, `${label}.components`, 16, false);
  const normalizedComponents = [];
  for (let index = 0; index < componentDescriptors.length.value; index += 1) {
    const component = componentDescriptors[index].value;
    const descriptors = assertExactDataObject(
      component,
      COMPONENT_RECORD_KEYS,
      `${label}.components[${index}]`,
      false,
    );
    const componentValue = (field) => descriptors[field].value;
    if (
      typeof componentValue("id") !== "string" ||
      componentValue("id").length === 0 ||
      typeof componentValue("displayName") !== "string" ||
      componentValue("displayName").length === 0 ||
      !["unit", "structure", "effect"].includes(componentValue("kind")) ||
      !["primary", "secondary", "spawn", "spawn-over-time"].includes(componentValue("role")) ||
      !["none", "ground", "air", "ground-and-air", "structures"].includes(componentValue("targetMode"))
    ) {
      throw new TypeError(`${label}.components[${index}] is not a complete source component`);
    }
    for (const rule of COMPONENT_INTEGER_RULES) {
      assertSourceInteger(
        componentValue(rule.field),
        rule,
        `${label}.components[${index}].${rule.field}`,
      );
    }
    assertPlainDataObject(component, `${label}.components[${index}]`);
    normalizedComponents.push(Object.fromEntries(
      COMPONENT_RECORD_KEYS.map((field) => [field, componentValue(field)]),
    ));
  }
  assertPlainDataArray(components, `${label}.components`);
  assertPlainDataObject(record, label);
  const normalized = Object.fromEntries(SOURCE_RECORD_KEYS.map((field) => [
    field,
    field === "components" ? normalizedComponents : recordValue(field),
  ]));
  return admitCanonicalGraph(normalized, label);
}

function sourceRecordsFor(exportName) {
  const sourceModule = SOURCE_MODULES_BY_EXPORT[exportName];
  const factory = sourceModule?.[exportName];
  if (typeof factory !== "function") {
    throw new Error(`movement source export ${exportName} is missing`);
  }
  assertFactoryShapeSurface(factory, exportName);
  const records = factory();
  if (!Array.isArray(records)) {
    throw new TypeError(`${exportName} must return a catalog array`);
  }
  const normalizedRecords = records.map((record, index) =>
    validateSourceRecord(record, `${exportName}[${index}]`)
  );
  return admitCanonicalGraph(normalizedRecords, `${exportName} catalog`);
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
    if (canonicalTrusted(records) !== canonicalTrusted(secondRead)) {
      throw new Error(`${exportName} is not deterministic across source reads`);
    }
    const ids = records.map(({ id }) => id).sort(compareText);
    const expectedIds = expectedIdsForExport(exportName, occurrences);
    if (canonicalTrusted(ids) !== canonicalTrusted(expectedIds)) {
      throw new Error(`${exportName} has a missing, stale, or extra source record`);
    }
    if (new Set(ids).size !== ids.length) {
      throw new Error(`${exportName} has duplicate source IDs`);
    }
    for (const record of records) {
      const key = sourceRecordKey(exportName, record.id);
      const expectedWitness = EXPECTED_SOURCE_WITNESS_MAP[key];
      if (typeof expectedWitness !== "string" || canonicalTrusted(record) !== expectedWitness) {
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
    if (canonicalTrusted(actual) !== canonicalTrusted(sortedExpected)) {
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
  if (canonicalTrusted(candidateRows) !== canonicalTrusted(expectedRows)) {
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
    if (profile === undefined || canonicalTrusted(profile.occurrenceExports) !== canonicalTrusted(expectedExports)) {
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

const QUESTION_FIXTURE_METADATA_KEYS = Object.freeze([
  "authoritative",
  "confidence",
  "disposition",
  "provenance",
  "source",
]);

function prototypeSurfaceMatches(actual, expected) {
  if (actual === expected) return true;
  if (actual === null || typeof actual !== "object") return false;
  const expectedParent = Object.getPrototypeOf(expected);
  const actualParent = Object.getPrototypeOf(actual);
  if (
    expectedParent === null
      ? actualParent !== null
      : !prototypeSurfaceMatches(actualParent, expectedParent)
  ) {
    return false;
  }
  const actualNames = Object.getOwnPropertyNames(actual).sort(compareText);
  const expectedNames = Object.getOwnPropertyNames(expected).sort(compareText);
  if (canonicalTrusted(actualNames) !== canonicalTrusted(expectedNames)) return false;
  const actualSymbols = Object.getOwnPropertySymbols(actual)
    .map((symbol) => symbol.description ?? "")
    .sort(compareText);
  const expectedSymbols = Object.getOwnPropertySymbols(expected)
    .map((symbol) => symbol.description ?? "")
    .sort(compareText);
  return canonicalTrusted(actualSymbols) === canonicalTrusted(expectedSymbols);
}

function assertQuestionDataGraph(value, label, active = new Set()) {
  if (value === null) return value;
  const type = typeof value;
  if (type === "string" || type === "boolean") return value;
  if (type === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new TypeError(`${label} must contain finite JSON numbers`);
    }
    return value;
  }
  if (type !== "object") {
    throw new TypeError(`${label} must contain cloneable JSON data`);
  }
  if (active.has(value)) {
    throw new TypeError(`${label} must not contain cycles`);
  }

  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw new TypeError(`${label} must be inspectable data`);
  }
  const ownKeys = Reflect.ownKeys(descriptors);
  if (Array.isArray(value)) {
    if (
      !prototypeSurfaceMatches(prototype, Array.prototype) ||
      value.length > 16
    ) {
      throw new TypeError(`${label} must use the ordinary array prototype`);
    }
    if (
      ownKeys.length !== value.length + 1 ||
      !Object.hasOwn(descriptors, "length") ||
      !Object.hasOwn(descriptors.length, "value") ||
      descriptors.length.enumerable ||
      Array.from({ length: value.length }, (_, index) => String(index))
        .some((key) => {
          const descriptor = descriptors[key];
          return descriptor === undefined ||
            !descriptor.enumerable ||
            !Object.hasOwn(descriptor, "value");
        })
    ) {
      throw new TypeError(`${label} must be a dense data array`);
    }
  } else if (!prototypeSurfaceMatches(prototype, Object.prototype)) {
    throw new TypeError(`${label} must use a plain object prototype`);
  }
  if (ownKeys.some((key) => {
    const descriptor = descriptors[key];
    if (key === "length" && Array.isArray(value)) return false;
    return typeof key !== "string" ||
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, "value");
  })) {
    throw new TypeError(`${label} must contain enumerable data properties`);
  }

  active.add(value);
  try {
    for (const key of ownKeys) {
      if (key === "length" && Array.isArray(value)) continue;
      assertQuestionDataGraph(descriptors[key].value, `${label}.${String(key)}`, active);
    }
  } finally {
    active.delete(value);
  }
  try {
    structuredClone(value);
  } catch {
    throw new TypeError(`${label} must be cloneable data`);
  }
  return value;
}

function assertQuestionFactoryShape(value, label) {
  assertQuestionDataGraph(value, label);
  if (Object.hasOwn(value, "provenance")) {
    const provenance = value.provenance;
    const provenanceKeys = Object.keys(provenance).sort(compareText);
    if (provenanceKeys.some((key) => QUESTION_FIXTURE_METADATA_KEYS.includes(key))) {
      throw new TypeError(`${label}.provenance contains a reserved key`);
    }
    assertExactDataObject(value, [
      ...QUESTION_FIXTURE_METADATA_KEYS,
      ...provenanceKeys,
    ], label);
    assertExactDataObject(provenance, provenanceKeys, `${label}.provenance`);
    if (
      value.authoritative !== false ||
      value.confidence !== "unverified" ||
      value.disposition !== "question" ||
      typeof value.source !== "string"
    ) {
      throw new TypeError(`${label} has invalid fixture-level question metadata`);
    }
    if (provenanceKeys.length === 0) {
      throw new Error(`${label} has an empty question surface`);
    }
    for (const key of provenanceKeys) {
      assertQuestionMetadata(provenance[key], `${label}.provenance.${key}`);
    }
    return { kind: "fixture", keys: provenanceKeys };
  }

  const keys = Object.keys(value).sort(compareText);
  assertExactDataObject(value, keys, label);
  if (keys.length === 0) {
    throw new Error(`${label} has an empty question surface`);
  }
  for (const key of keys) {
    assertQuestionRecord(value[key], key, `${label}.${key}`);
  }
  return { kind: "records", keys };
}

function normalizeQuestionPolicy(spec) {
  assertExpectedQuestionWitnessCoverage();
  if (spec.questionFactory === null) return null;
  const sourceModule = SOURCE_MODULES_BY_EXPORT[spec.exportName];
  const factory = sourceModule?.[spec.questionFactory];
  if (typeof factory !== "function") {
    throw new Error(`${spec.questionFactory} is not exported by ${spec.exportName} source module`);
  }
  assertFactoryShapeSurface(factory, spec.questionFactory);
  const firstRaw = factory();
  const secondRaw = factory();
  if (firstRaw === secondRaw) {
    throw new Error(`${spec.questionFactory} is not fresh and deterministic`);
  }
  const firstShape = assertQuestionFactoryShape(firstRaw, `${spec.questionFactory} first read`);
  const secondShape = assertQuestionFactoryShape(secondRaw, `${spec.questionFactory} second read`);
  const first = admitCanonicalGraph(firstRaw, `${spec.questionFactory} first read`);
  const second = admitCanonicalGraph(secondRaw, `${spec.questionFactory} second read`);
  if (firstShape.kind !== secondShape.kind) {
    throw new Error(`${spec.questionFactory} changed output shape across reads`);
  }
  const firstCanonical = canonical(first);
  if (firstCanonical !== canonical(second)) {
    throw new Error(`${spec.questionFactory} is not fresh and deterministic`);
  }
  const expectedWitness = EXPECTED_QUESTION_WITNESS[spec.questionFactory];
  if (firstCanonical !== expectedWitness) {
    throw new Error(`${spec.questionFactory} differs from its pinned QUESTION witness`);
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

  let records;
  if (firstShape.kind === "fixture") {
    records = firstShape.keys.map((key) => {
      const provenance = first.provenance[key];
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
    records = firstShape.keys.map((key) => clone(first[key]));
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
    kind: firstShape.kind,
    raw: clone(first),
    rawCanonical: firstCanonical,
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
    canonicalTrusted(restored) !== canonicalTrusted(initial)
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
    sourceRecordCanonical: canonicalTrusted(sourceRecord),
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
  if (canonicalTrusted(base) !== canonicalTrusted(expected)) {
    throw new Error(`movement/form base identity diverges from HTP for ${id}`);
  }
  return base;
}

function buildManifest() {
  assertExpectedQuestionWitnessCoverage();
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
      return { exportName, recordCanonical: canonicalTrusted(record) };
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
  if (canonicalTrusted(counts) !== canonicalTrusted({
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
  return freeze(admitCanonicalGraph(manifest, "movement profile manifest"));
}

function profilesWithDuplicateExports(profiles) {
  const duplicateIds = profiles
    .filter(({ occurrenceExports }) => occurrenceExports.length > 1)
    .map(({ id }) => id)
    .sort(compareText);
  if (canonicalTrusted(duplicateIds) !== canonicalTrusted(["emberlance"])) {
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
