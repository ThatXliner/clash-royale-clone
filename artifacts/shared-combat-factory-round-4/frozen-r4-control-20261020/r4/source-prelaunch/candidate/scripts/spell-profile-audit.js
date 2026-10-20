import { createSessionCardManifest } from "../src/content/session-card-catalog.js";
import { createSessionSpellProfileReceipts } from "../src/content/session-spell-profile-receipts.js";
import { createKnockbackSpecialCatalog } from "../src/content/cards/special-movement-knockback.js";
import { createInstantSpellCatalog } from "../src/content/cards/spells-instant.js";
import { createReturningSpellCatalog } from "../src/content/cards/spells-return.js";
import { createTravelingLineSpellCatalog } from "../src/content/cards/spells-travel-line.js";

const VERSION = 1;
const SQUALL_ID = "squall-orb";
const EXCLUDED_IDS = Object.freeze(["cloudseed-flask", "hollowgarden"]);
const UNRESOLVED_SQUALL_FACTS = Object.freeze([
  "activation",
  "travel",
  "impact-order",
  "knockback-eligibility",
  "damage-modifier-rounding",
]);
const CONTEXT_BY_EXPORT = Object.freeze({
  SPAWN_SPELL_IDENTITIES: "spawn-identity",
  createInstantSpellCatalog: "instant",
  createKnockbackSpecialCatalog: "knockback",
  createPeriodicSpellCatalog: "periodic",
  createRageSpecialCatalog: "rage",
  createResetSpecialCatalog: "reset",
  createReturningSpellCatalog: "return",
  createRollingSpellCatalog: "roll",
  createThreeWaveTravelingSpellCatalog: "three-wave",
  createTravelingLineSpellCatalog: "travel-line",
});
const SQUALL_CATALOGS = Object.freeze([
  ["createKnockbackSpecialCatalog", createKnockbackSpecialCatalog],
  ["createInstantSpellCatalog", createInstantSpellCatalog],
  ["createTravelingLineSpellCatalog", createTravelingLineSpellCatalog],
  ["createReturningSpellCatalog", createReturningSpellCatalog],
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

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function countDistinct(rows) {
  return new Set(rows.map(({ id }) => id)).size;
}

function assertNoArguments(args) {
  if (args.length !== 0) throw new TypeError("spell occurrence audit takes no arguments");
}

function buildOccurrences(cardManifest) {
  const effectIds = new Set([
    ...cardManifest.cards
      .filter(({ kind }) => kind === "effect")
      .map(({ id }) => id),
    ...EXCLUDED_IDS,
  ]);
  const occurrences = cardManifest.occurrences
    .filter(({ id }) => effectIds.has(id))
    // Keep the manifest's established order and its admission status exactly;
    // this audit adds context and execution classification only.
    .map(({ exportName, id, status }) => {
      const context = CONTEXT_BY_EXPORT[exportName];
      if (context === undefined) {
        throw new Error(`spell occurrence export ${exportName} has no explicit context`);
      }
      return { context, executionStatus: "question", exportName, id, status };
    });
  return { effectIds, occurrences };
}

function buildSquall(occurrences, receipts) {
  const squallOccurrences = occurrences.filter(({ id }) => id === SQUALL_ID);
  const exports = squallOccurrences.map(({ exportName }) => exportName);
  if (exports.length !== SQUALL_CATALOGS.length || new Set(exports).size !== exports.length) {
    throw new Error("Squall occurrence exports no longer have four independent contexts");
  }

  const catalogBytes = SQUALL_CATALOGS.map(([, factory]) => JSON.stringify(factory()));
  if (new Set(catalogBytes).size !== 1) {
    throw new Error("Squall catalog contexts no longer reuse one catalog record");
  }

  // Byte-identical catalogs establish fixture-context reuse only. They do not
  // authorize a union of mechanics or turn the return fixture into a card phase.
  return {
    complete: false,
    compositionStatus: "question",
    exports,
    id: SQUALL_ID,
    isolatedFactProfileIds: receipts.profiles.map(({ profileId }) => profileId),
    relation: "shared-base-catalog-in-independent-fixture-contexts",
    unresolved: [...UNRESOLVED_SQUALL_FACTS],
  };
}

function buildCards(occurrences) {
  return [...new Set(occurrences.map(({ id }) => id))]
    .sort(compareText)
    .map((id) => ({
      executionStatus: "question",
      id,
      occurrenceExports: occurrences
        .filter((occurrence) => occurrence.id === id)
        .map(({ exportName }) => exportName),
    }));
}

function buildAudit() {
  const cardManifest = createSessionCardManifest();
  const receipts = createSessionSpellProfileReceipts();
  const { effectIds, occurrences } = buildOccurrences(cardManifest);
  const questions = occurrences.filter(({ status }) => status === "question");
  const admitted = occurrences.filter(({ status }) => status === "admitted");
  const counts = {
    admittedIds: countDistinct(admitted),
    admittedOccurrences: admitted.length,
    claimedIds: countDistinct(occurrences),
    claimedOccurrences: occurrences.length,
    completeCardProfiles: 0,
    isolatedFactProfiles: receipts.profiles.length,
    questionIds: countDistinct(questions),
    questionOccurrences: questions.length,
  };
  if (
    counts.claimedOccurrences !== 13 ||
    counts.claimedIds !== 10 ||
    counts.admittedOccurrences !== 11 ||
    counts.admittedIds !== 8 ||
    counts.questionOccurrences !== 2 ||
    counts.questionIds !== 2
  ) {
    throw new Error(`spell occurrence counts diverge: ${JSON.stringify(counts)}`);
  }
  const excluded = occurrences.filter(({ id }) => EXCLUDED_IDS.includes(id));
  if (excluded.length !== EXCLUDED_IDS.length || excluded.some(({ status }) => status !== "question")) {
    throw new Error("spell identity-only exclusions no longer remain explicit QUESTIONs");
  }
  if (effectIds.size !== counts.claimedIds) {
    throw new Error("spell effect ID derivation diverges from occurrence accounting");
  }

  return freeze({
    cards: buildCards(occurrences),
    counts,
    occurrences,
    squall: buildSquall(occurrences, receipts),
    version: VERSION,
  });
}

const AUDIT = buildAudit();

export function createSpellOccurrenceAudit(...args) {
  assertNoArguments(args);
  return freeze(clone(AUDIT));
}
