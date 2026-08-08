import * as content from "./index.js";
import { createDeathEffectsQuestions } from "./cards/death-effects.js";
import { createDefensiveBuildingRuntimeProfiles } from "./cards/buildings-defensive.js";
import { createResourceBuildingQuestionRecords } from "./cards/buildings-resource.js";
import { createUndergroundTravelBuildingQuestionRecords } from "./cards/buildings-travel.js";
import { assertSessionBuildingProfileReceipt } from "../sim/session-building-profile-receipts.js";

const CLAIMS = Object.freeze([
  ["createBasicFlyingCatalog", ["copperskiff", "skymaul"]],
  ["createBasicMeleeCatalog", ["coilblade", "mossguard"]],
  ["createBasicRangedCatalog", ["brassbolt", "reedsting"]],
  ["createSwarmCatalog", ["briar-band", "cinderlings"]],
  ["DEATH_SPAWN_IDENTITY", ["ashen-nest"]],
  ["DEATH_CONVERSION_IDENTITY", ["gloam-shepherd"]],
  ["createStructureSeekerCatalog", ["stonehauler"]],
  ["createShieldFormCatalog", ["railward"]],
  ["createChargeSpecialCatalog", ["emberlance"]],
  ["createDashSpecialCatalog", ["veilrunner"]],
  ["createJumpSpecialCatalog", ["stonevault"]],
  ["createRecoilSpecialCatalog", ["cinderback"]],
  ["createKnockbackSpecialCatalog", ["squall-orb"]],
  ["createRetargetSpecialCatalog", ["wayfinder"]],
  ["createChargeKnockbackCatalog", ["emberlance"]],
  ["createChainSpecialCatalog", ["stormkite"]],
  ["createPierceSpecialCatalog", ["prism-warden"]],
  ["createReturnSpecialCatalog", ["rune-reaver"]],
  ["createPelletSpecialCatalog", ["scatterguard"]],
  ["createReflectionSpecialCatalog", ["aegis-sage"]],
  ["createRampSpecialCatalog", ["cinder-ray"]],
  ["createResetSpecialCatalog", ["static-burst"]],
  ["createStunSpecialCatalog", ["pulse-sentry"]],
  ["createSlowSpecialCatalog", ["rime-adept"]],
  ["createRageSpecialCatalog", ["tempo-field"]],
  ["createSnareSpecialCatalog", ["tether-rider"]],
  ["createDeathEffectsCatalog", ["cinder-reliquary"]],
  ["createHealCatalog", ["bloom-wisp", "dawnmender"]],
  ["createInvisibilitySpecialCatalog", ["veil-prowler"]],
  ["createDefensiveBuildingCatalog", ["bulwark-needle", "buried-coil",
    "ember-basin", "horizon-caster", "prism-furnace"]],
  ["SPAWNER_BUILDING_IDENTITIES", ["bramble-cage", "ember-roost"]],
  ["createResourceBuildingCatalog", ["aether-well"]],
  ["createUndergroundTravelBuildingCatalog", ["burrow-rig"]],
  ["createInstantSpellCatalog", ["squall-orb"]],
  ["SPAWN_SPELL_IDENTITIES", ["cloudseed-flask", "hollowgarden"]],
  ["createPeriodicSpellCatalog", ["blight-ring", "fault-pulse", "gravity-well"]],
  ["createTravelingLineSpellCatalog", ["squall-orb"]],
  ["createReturningSpellCatalog", ["squall-orb"]],
  ["createThreeWaveTravelingSpellCatalog", ["skyshard-volley"]],
  ["createRollingSpellCatalog", ["ironbark-roller"]],
  ["createChampionAbilityCatalog", ["aegis-sage", "bone-regent", "dusk-ranger",
    "gilded-lancer", "iron-borer"]],
]);

const INCOMPLETE = new Set([
  "ashen-nest", "bramble-cage", "cloudseed-flask", "ember-roost",
  "gloam-shepherd", "hollowgarden",
]);
const QUESTION_ONLY = Object.freeze([
  ["SpawnBatchMaterializer", "shared placement primitive has no exported runtime card identity"],
  ["DashKnockbackRetargetEncounter", "composition policies are corpus-absent QUESTION records"],
  ["LeapKnockbackRetargetEncounter", "composition policies are corpus-absent QUESTION records"],
  ["PreviousCardCopyMatch", "copy card identity and mechanics are intentionally unclaimed"],
  ["DeployedUnitCloneEncounter", "clone card identity and mechanics are intentionally unclaimed"],
]);
const KINDS = new Set(["effect", "structure", "unit"]);
function clone(value) { return structuredClone(value); }

function questionValues(records) {
  return Object.fromEntries(Object.entries(records).map(([key, record]) => [key, clone(record.value)]));
}

const DEFENSIVE_RUNTIME = createDefensiveBuildingRuntimeProfiles();
const RESOURCE_RUNTIME = questionValues(createResourceBuildingQuestionRecords());
const TRAVEL_RUNTIME = questionValues(createUndergroundTravelBuildingQuestionRecords());
const DEATH_RUNTIME = questionValues(createDeathEffectsQuestions());

function buildingRuntimeProfile(id, source) {
  let profile;
  if (Object.hasOwn(DEFENSIVE_RUNTIME, id)) {
    const { policy: _policy, ...defensiveProfile } = DEFENSIVE_RUNTIME[id];
    profile = { class: "defensive", ...clone(defensiveProfile) };
  } else if (id === "aether-well") {
    profile = { class: "resource", deployTicks: source.deployTimeTicks,
      generationAmount: RESOURCE_RUNTIME.generationAmount,
      generationCadenceTicks: RESOURCE_RUNTIME.generationCadenceTicks,
      hitpoints: source.hitpoints, lifetimeTicks: RESOURCE_RUNTIME.lifetimeTicks };
  } else if (id === "burrow-rig") {
    profile = { class: "travel", deployTicks: source.deployTimeTicks,
      emergenceSpawnDelayTicks: TRAVEL_RUNTIME.emergenceSpawnDelayTicks,
      hitpoints: source.hitpoints, lifetimeTicks: TRAVEL_RUNTIME.lifetimeTicks,
      travelSpeedMillitilesPerSecond: TRAVEL_RUNTIME.travelSpeedMillitilesPerSecond };
  } else if (id === "cinder-reliquary") {
    profile = { class: "death-effect", damage: source.damage, deployTicks: source.deployTimeTicks,
      firstHitTicks: source.firstHitTicks, hitSpeedTicks: source.hitSpeedTicks,
      hitpoints: source.hitpoints, radius: DEATH_RUNTIME.radius,
      rangeMillitiles: source.rangeMillitiles, targetMode: "ground",
      towerModifier: clone(DEATH_RUNTIME.towerModifier) };
  }
  if (profile !== undefined) assertSessionBuildingProfileReceipt(id, canonical(profile),
    "session card catalog building runtime profile");
  return profile ?? null;
}

function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) {
  for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function records(exportName) {
  const value = content[exportName];
  if (typeof value === "function") return value();
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && typeof value.id === "string") return [value];
  return Object.values(value);
}
function checkedCatalogRecord(record, exportName) {
  if (!record || typeof record !== "object" || !KINDS.has(record.kind) ||
      typeof record.id !== "string" || typeof record.displayName !== "string" ||
      !Number.isSafeInteger(record.cost) || record.cost < 1 || record.cost > 10 ||
      !(record.deployTimeTicks === null ||
        (Number.isSafeInteger(record.deployTimeTicks) && record.deployTimeTicks >= 0))) {
    throw new TypeError(`${exportName} does not provide a complete session admission record`);
  }
  return record;
}

function buildManifest() {
  const occurrences = [];
  const admittedById = new Map();
  for (const [exportName, expectedIds] of CLAIMS) {
    const byId = new Map(records(exportName).map((record) => [record.id, record]));
    if (canonical([...byId.keys()]) !== canonical(expectedIds)) {
      throw new Error(`${exportName} diverges from the canonical integration claim`);
    }
    for (const id of expectedIds) {
      if (INCOMPLETE.has(id)) {
        occurrences.push({ exportName, id, reason:
          "identity-only claim lacks sourced kind/cost/deploy admission fields", status: "question" });
        continue;
      }
      const source = checkedCatalogRecord(byId.get(id), exportName);
      const prior = admittedById.get(id);
      const identity = { cost: source.cost, deployTimeTicks: source.deployTimeTicks,
        displayName: source.displayName, id, kind: source.kind,
        placementClass: source.kind === "effect" ? "global_effect" : "ground_entity" };
      if (prior && canonical(prior.identity) !== canonical(identity)) {
        throw new Error(`shared session identity ${id} has divergent admission records`);
      }
      if (prior) prior.occurrenceExports.push(exportName);
      else admittedById.set(id, { identity, occurrenceExports: [exportName], source: clone(source) });
      occurrences.push({ exportName, id, status: "admitted" });
    }
  }
  const cards = [...admittedById.values()].map(({ identity, occurrenceExports }) => ({
    ...identity, occurrenceExports: [...occurrenceExports].sort(),
  })).sort((left, right) => left.id.localeCompare(right.id));
  const excludedClaims = occurrences.filter(({ status }) => status === "question")
    .sort((left, right) => left.id.localeCompare(right.id));
  const questionOnly = QUESTION_ONLY.map(([exportName, reason]) => ({ exportName, reason,
    status: "question-only" })).sort((left, right) => left.exportName.localeCompare(right.exportName));
  const admittedOccurrences = occurrences.filter(({ status }) => status === "admitted").length;
  return freeze({ cards, counts: {
    admittedIds: cards.length,
    admittedOccurrences,
    claimedIds: new Set(occurrences.map(({ id }) => id)).size,
    claimedOccurrences: occurrences.length,
    excludedClaimedIds: new Set(excludedClaims.map(({ id }) => id)).size,
    excludedClaimedOccurrences: excludedClaims.length,
    questionOnlyExports: questionOnly.length,
  }, excludedClaims, occurrences: occurrences.sort((left, right) =>
    left.id.localeCompare(right.id) || left.exportName.localeCompare(right.exportName)),
  questionOnly, version: 1 });
}

const MANIFEST = buildManifest();

export function createSessionCardManifest(...args) {
  if (args.length) throw new TypeError("session card manifest takes no arguments");
  return freeze(clone(MANIFEST));
}

export function serializeSessionCardManifest(...args) {
  if (args.length) throw new TypeError("session card manifest serialization takes no arguments");
  return canonical(MANIFEST);
}

export function getSessionCardAdmissionRecord(id) {
  if (typeof id !== "string") throw new TypeError("session card ID must be a primitive string");
  const excluded = MANIFEST.excludedClaims.find((entry) => entry.id === id);
  if (excluded) throw new RangeError(`session card ${id} remains an explicit QUESTION`);
  const card = MANIFEST.cards.find((entry) => entry.id === id);
  if (!card) throw new RangeError(`session card ${id} is not claimed`);
  return freeze(clone(card));
}

export function createSessionCardDeckWitnesses(...args) {
  if (args.length) throw new TypeError("session deck witnesses take no arguments");
  const ids = MANIFEST.cards.map(({ id }) => id);
  return freeze(ids.map((id) => ({
    cardId: id,
    deck: [id, ...ids.filter((candidate) => candidate !== id).slice(0, 7)],
  })));
}

export function projectSessionNonUnitBattleCard(id) {
  const admitted = getSessionCardAdmissionRecord(id);
  if (admitted.kind === "unit") throw new TypeError("unit runtime projection belongs to troop binding");
  const sourceExport = admitted.occurrenceExports[0];
  const source = records(sourceExport).find((record) => record.id === id);
  const buildingRuntime = source.kind === "structure" ? buildingRuntimeProfile(id, source) : null;
  if (source.kind === "structure" && buildingRuntime === null) {
    throw new Error("admitted structure lacks a shared building runtime profile");
  }
  const projection = {
    areaDamageRadiusMillitiles: source.areaDamageRadiusMillitiles,
    cost: source.cost,
    count: source.count,
    damage: source.damage,
    deployTimeTicks: source.deployTimeTicks,
    displayName: source.displayName,
    entities: [],
    firstHitTicks: source.firstHitTicks,
    formation: { componentOrder: [], expansionOrder: "component-order-then-member-index",
      totalCount: 0 },
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
  if (buildingRuntime !== null) projection.buildingRuntime = buildingRuntime;
  return freeze(projection);
}
