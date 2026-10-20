import assert from "node:assert/strict";
import test from "node:test";

import { createKnockbackSpecialCatalog } from "../src/content/cards/special-movement-knockback.js";
import { createInstantSpellCatalog } from "../src/content/cards/spells-instant.js";
import { createReturningSpellCatalog } from "../src/content/cards/spells-return.js";
import { createTravelingLineSpellCatalog } from "../src/content/cards/spells-travel-line.js";
import { createSessionCardManifest } from "../src/content/session-card-catalog.js";
import {
  createSessionSpellProfileReceipts,
  serializeSessionSpellProfileReceipts,
} from "../src/content/session-spell-profile-receipts.js";
import { createSpellOccurrenceAudit } from "../scripts/spell-profile-audit.js";

const EXCLUDED_IDS = ["cloudseed-flask", "hollowgarden"];
const EXPECTED_OCCURRENCES = [
  ["createPeriodicSpellCatalog", "blight-ring", "admitted"],
  ["SPAWN_SPELL_IDENTITIES", "cloudseed-flask", "question"],
  ["createPeriodicSpellCatalog", "fault-pulse", "admitted"],
  ["createPeriodicSpellCatalog", "gravity-well", "admitted"],
  ["SPAWN_SPELL_IDENTITIES", "hollowgarden", "question"],
  ["createRollingSpellCatalog", "ironbark-roller", "admitted"],
  ["createThreeWaveTravelingSpellCatalog", "skyshard-volley", "admitted"],
  ["createInstantSpellCatalog", "squall-orb", "admitted"],
  ["createKnockbackSpecialCatalog", "squall-orb", "admitted"],
  ["createReturningSpellCatalog", "squall-orb", "admitted"],
  ["createTravelingLineSpellCatalog", "squall-orb", "admitted"],
  ["createResetSpecialCatalog", "static-burst", "admitted"],
  ["createRageSpecialCatalog", "tempo-field", "admitted"],
];
const EXPECTED_IDS = [
  "blight-ring", "cloudseed-flask", "fault-pulse", "gravity-well",
  "hollowgarden", "ironbark-roller", "skyshard-volley", "squall-orb",
  "static-burst", "tempo-field",
];

function deepFrozen(value) {
  if (value === null || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(deepFrozen);
}

test("game roster spell occurrences: exact effect occurrence pairs and IDs derive from the session manifest", () => {
  const audit = createSpellOccurrenceAudit();
  const session = createSessionCardManifest();
  const effectIds = [
    ...session.cards.filter(({ kind }) => kind === "effect").map(({ id }) => id),
    ...EXCLUDED_IDS,
  ];
  const expectedFromManifest = session.occurrences
    .filter(({ id }) => effectIds.includes(id))
    .map(({ exportName, id, status }) => [exportName, id, status]);
  assert.deepEqual(expectedFromManifest, EXPECTED_OCCURRENCES);
  assert.deepEqual(audit.occurrences.map(({ exportName, id, status }) =>
    [exportName, id, status]), EXPECTED_OCCURRENCES);
  assert.deepEqual([...new Set(audit.occurrences.map(({ id }) => id))], EXPECTED_IDS);
});

test("game roster spell occurrences: admission counts and card execution status stay explicit", () => {
  const audit = createSpellOccurrenceAudit();
  assert.deepEqual(audit.counts, {
    admittedIds: 8,
    admittedOccurrences: 11,
    claimedIds: 10,
    claimedOccurrences: 13,
    completeCardProfiles: 0,
    isolatedFactProfiles: 1,
    questionIds: 2,
    questionOccurrences: 2,
  });
  assert.ok(audit.cards.every(({ executionStatus }) => executionStatus === "question"));
  assert.deepEqual(audit.occurrences.filter(({ status }) => status === "question")
    .map(({ exportName, id }) => [exportName, id]), [
      ["SPAWN_SPELL_IDENTITIES", "cloudseed-flask"],
      ["SPAWN_SPELL_IDENTITIES", "hollowgarden"],
    ]);
  assert.deepEqual([...new Set(audit.occurrences
    .filter(({ status }) => status === "admitted").map(({ id }) => id))], [
    "blight-ring", "fault-pulse", "gravity-well", "ironbark-roller",
    "skyshard-volley", "squall-orb", "static-burst", "tempo-field",
  ]);
});

test("game roster spell occurrences: Squall catalogs reuse one record while composition remains QUESTION", () => {
  const audit = createSpellOccurrenceAudit();
  const catalogs = [
    createKnockbackSpecialCatalog(),
    createInstantSpellCatalog(),
    createTravelingLineSpellCatalog(),
    createReturningSpellCatalog(),
  ];
  assert.ok(catalogs.every((catalog) => JSON.stringify(catalog) === JSON.stringify(catalogs[0])));
  assert.deepEqual(audit.squall.exports, [
    "createInstantSpellCatalog",
    "createKnockbackSpecialCatalog",
    "createReturningSpellCatalog",
    "createTravelingLineSpellCatalog",
  ]);
  assert.deepEqual(audit.squall, {
    complete: false,
    compositionStatus: "question",
    exports: audit.squall.exports,
    id: "squall-orb",
    isolatedFactProfileIds: createSessionSpellProfileReceipts().profiles
      .map(({ profileId }) => profileId),
    relation: "shared-base-catalog-in-independent-fixture-contexts",
    unresolved: [
      "activation", "travel", "impact-order", "knockback-eligibility",
      "damage-modifier-rounding",
    ],
  });
  assert.deepEqual(createSessionSpellProfileReceipts().profiles,
    [{
      claims: ["cardId", "kind", "cost", "count", "damage"],
      fact: {
        cardId: "squall-orb",
        count: 1,
        cost: 4,
        damage: 689,
        kind: "effect",
        sourceExport: "createInstantSpellCatalog",
      },
      mode: "isolated-direct-command-target-damage-not-card-composition",
      profileId: "isolated-sourced-instant-v1",
    }]);
});

test("game roster spell occurrences: fresh audit results are recursively frozen and receipt bytes stay unchanged", () => {
  const receiptBytes = serializeSessionSpellProfileReceipts();
  const first = createSpellOccurrenceAudit();
  const second = createSpellOccurrenceAudit();
  assert.notEqual(first, second);
  assert.notEqual(first.occurrences, second.occurrences);
  assert.ok(deepFrozen(first));
  assert.ok(deepFrozen(second));
  assert.throws(() => { first.occurrences[0].context = "altered"; }, TypeError);
  assert.throws(() => { first.cards.push({ id: "altered" }); }, TypeError);
  assert.throws(() => { first.squall.unresolved[0] = "altered"; }, TypeError);
  assert.equal(serializeSessionSpellProfileReceipts(), receiptBytes);
  assert.deepEqual(createSpellOccurrenceAudit(), second);
});
