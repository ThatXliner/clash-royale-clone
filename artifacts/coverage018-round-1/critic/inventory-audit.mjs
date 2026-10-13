import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("usage: node inventory-audit.mjs PINNED_ARCHIVE_ROOT");
const read = (relative) => readFileSync(path.join(root, relative));
const json = (relative) => JSON.parse(read(relative).toString("utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const inventory = json("artifacts/completion-inventory-current-18/card-coverage-109-current-18.json");
const corpus = json("reference/stats/cards.json");
const sources = read("reference/stats/SOURCES.md").toString("utf8");
const legacyBytes = read("artifacts/completion-inventory/reference/card-coverage-109.json");
const prior16Bytes = read("artifacts/completion-inventory-current-16/card-coverage-109-current-16.json");
const referenceByKey = new Map(corpus.cards.map((row) => [row.key, row]));

assert.match(sources, /unverified_fields[\s\S]*second historical source/iu);
assert.equal(inventory.historicalRows.length, 109);
assert.equal(new Set(inventory.historicalRows.map(({ key }) => key)).size, 109);
assert.equal(new Set(inventory.historicalRows.map(({ id }) => id)).size, 109);
assert.deepEqual(inventory.counts.historicalTypes, { troop: 78, building: 13, spell: 18 });
assert.deepEqual(inventory.historicalRows.map(({ key }) => key).sort(),
  corpus.cards.map(({ key }) => key).sort());
for (const row of inventory.historicalRows) {
  const source = referenceByKey.get(row.key);
  assert.ok(source, `${row.key} must exist in the pinned corpus`);
  assert.deepEqual({ id: row.id, name: row.name, type: row.type,
    elixirCost: row.elixirCost, rarity: row.rarity },
  { id: source.id, name: source.name, type: source.type,
    elixirCost: source.elixir_cost, rarity: source.rarity }, `${row.key} identity differs`);
  assert.deepEqual(row.unverifiedFields, source.unverified_fields,
    `${row.key} QUESTION fields must match the pinned corpus`);
  assert.equal(row.unverifiedFieldsDisposition, "QUESTION");
  assert.equal(row.fullHistoricalCardExecutionClaimed, false);
}

assert.equal(sha256(legacyBytes), inventory.pinnedInputs.retained11CardBaseline.sha256);
assert.equal(legacyBytes.length, inventory.pinnedInputs.retained11CardBaseline.bytes);
assert.equal(sha256(prior16Bytes), inventory.pinnedInputs.retained16CardInventory.sha256);
assert.equal(prior16Bytes.length, inventory.pinnedInputs.retained16CardInventory.bytes);
const prior16 = JSON.parse(prior16Bytes.toString("utf8"));
assert.deepEqual(prior16.currentEditableCards.map(({ id }) => id), [
  "coilblade", "mossguard", "copperskiff", "skymaul", "brassbolt", "reedsting",
  "briar-band", "cinderlings", "stonehauler", "thornscouts", "forgeguard",
  "cinder-host", "ironroot", "sunthread-pair", "duskwing-trio", "squall-orb",
]);

const importModule = async (relative) => import(pathToFileURL(path.join(root, relative)));
const editable = await importModule("src/content/editable-deck.js");
const troop = await importModule("src/content/session-troop-roster.js");
const playable = await importModule("src/content/playable-roster.js");
const cardCatalog = await importModule("src/content/session-card-catalog.js");
const currentIds = [...editable.EDITABLE_MIXED_DECK_CARD_IDS];
const currentTroopIds = [...troop.EDITABLE_DECK_CARD_IDS];
assert.deepEqual(inventory.currentEditableCards.map(({ id }) => id), currentIds);
assert.deepEqual(currentTroopIds, currentIds.filter((id) => id !== "squall-orb"));
assert.deepEqual(inventory.currentEditableCards
  .filter(({ defaultDeckOrder }) => defaultDeckOrder !== null)
  .sort((left, right) => left.defaultDeckOrder - right.defaultDeckOrder)
  .map(({ id }) => id), [...playable.PLAYABLE_CARD_IDS]);
assert.equal(inventory.counts.editableCurrentIds, 18);
assert.equal(inventory.counts.unchangedDefaultDeckIds, 8);
assert.equal(inventory.counts.currentAdmittedOccurrences, 21);

const catalog = cardCatalog.createSessionCardManifest();
const catalogById = new Map(catalog.cards.map((card) => [card.id, card]));
assert.equal(catalogById.size, catalog.cards.length, "catalog IDs must be unique");
assert.deepEqual({ admittedIds: catalog.counts.admittedIds,
  admittedOccurrences: catalog.counts.admittedOccurrences,
  units: catalog.cards.filter(({ kind }) => kind === "unit").length,
  unitOccurrences: catalog.occurrences.filter((entry) => entry.status === "admitted" &&
    catalog.cards.find(({ id }) => id === entry.id)?.kind === "unit").length,
  structures: catalog.cards.filter(({ kind }) => kind === "structure").length,
  effects: catalog.cards.filter(({ kind }) => kind === "effect").length },
{
  admittedIds: inventory.counts.sessionCatalog.admittedIds,
  admittedOccurrences: inventory.counts.sessionCatalog.admittedOccurrences,
  units: inventory.counts.sessionCatalog.units,
  unitOccurrences: inventory.counts.sessionCatalog.unitOccurrences,
  structures: inventory.counts.sessionCatalog.structures,
  effects: inventory.counts.sessionCatalog.effects,
});
const currentOccurrenceCount = catalog.occurrences.filter((entry) =>
  entry.status === "admitted" && currentIds.includes(entry.id)).length;
assert.equal(currentOccurrenceCount, 21);
assert.deepEqual(inventory.currentEditableCards.map(({ editableOrder }) => editableOrder),
  currentIds.map((_, index) => index));
assert.deepEqual(inventory.counts.editableCurrentKinds, { unit: 17, structure: 0, effect: 1 });
assert.equal(inventory.currentEditableCards.reduce((sum, row) => {
  const catalogCard = catalogById.get(row.id);
  assert.ok(catalogCard, `${row.id} must be admitted by the session catalog`);
  assert.equal(row.kind, catalogCard.kind, `${row.id} kind differs from the catalog`);
  assert.equal(row.displayName, catalogCard.displayName, `${row.id} display name differs`);
  assert.deepEqual(row.admission.occurrenceExports, catalogCard.occurrenceExports,
    `${row.id} catalog occurrence exports differ`);
  assert.equal(row.admission.occurrenceCount, catalogCard.occurrenceExports.length,
    `${row.id} occurrence count differs`);
  return sum + row.admission.occurrenceCount;
}, 0), 21);

const comparatorRows = inventory.currentEditableCards
  .filter(({ comparison }) => comparison.status === "declared-test-comparator");
assert.equal(comparatorRows.length, 12);
assert.equal(new Set(comparatorRows.map(({ comparison }) => comparison.referenceKey)).size, 12);
for (const row of inventory.currentEditableCards) {
  assert.ok(row.evidence.length > 0, `${row.id} needs test declaration evidence`);
  for (const evidence of row.evidence) {
    const lines = read(evidence.file).toString("utf8").split("\n");
    assert.ok(lines[evidence.line - 1]?.startsWith(
      `test(${JSON.stringify(evidence.test)}`),
    `${row.id} declaration line must contain its exact test`);
  }
  assert.equal(row.fullHistoricalCardExecutionClaimed, false);
  assert.match(row.currentProfileSupport, /not historical card execution/u);
  if (row.comparison.status === "declared-test-comparator") {
    assert.equal(row.comparison.fullParityClaimed, false);
    assert.match(row.comparison.fieldDisposition, /QUESTION/u);
    const lines = read(row.evidence[0].file).toString("utf8").split("\n");
    const window = lines.slice(row.comparison.evidenceMappingLine - 1,
      row.comparison.evidenceMappingLine + 2).join("\n");
    assert.ok(window.includes(row.comparison.referenceKey),
      `${row.id} mapping evidence does not name ${row.comparison.referenceKey}`);
    if (row.id !== "stonehauler") assert.ok(window.includes(row.id),
      `${row.id} mapping evidence does not name its current ID`);
    assert.ok(referenceByKey.has(row.comparison.referenceKey),
      `${row.id} has unsupported comparator key ${row.comparison.referenceKey}`);
  } else {
    assert.equal(Object.hasOwn(row.comparison, "referenceKey"), false,
      `${row.id} must remain unjoined`);
  }
}

const fixtureReferences = inventory.currentEditableCards
  .flatMap(({ comparison }) => comparison.fixtureReferences ?? []);
assert.equal(fixtureReferences.length, 2);
assert.ok(fixtureReferences.every(({ status, identityJoin }) =>
  /QUESTION/u.test(status) && identityJoin === false));
const unjoinedIds = inventory.currentEditableCards.filter(({ comparison }) =>
  comparison.status !== "declared-test-comparator").map(({ id }) => id).sort();
assert.deepEqual(unjoinedIds, ["cinder-host", "coppershade-flock", "duskwing-trio",
  "gloamwing-cluster", "squall-orb", "sunthread-pair"].sort());
assert.equal(inventory.counts.IDsWithoutExactHistoricalIdentityClaim, 6);

const typedCards = inventory.currentEditableCards.filter(({ typedUnverifiedMechanicsQuestions }) =>
  typedUnverifiedMechanicsQuestions);
assert.deepEqual(typedCards.map(({ id }) => id).sort(), ["coppershade-flock", "gloamwing-cluster"]);
let typedQuestionRecordCount = 0;
for (const row of typedCards) {
  const typed = row.typedUnverifiedMechanicsQuestions;
  assert.equal(typed.disposition, "QUESTION");
  assert.equal(typed.source, "runtime-playability-estimate-not-comparison-corpus");
  assert.equal(typed.bindings.length, 13);
  assert.equal(typed.records.length, 13);
  assert.equal(typed.bindings.filter(({ policy }) => policy === "sourceConfidencePolicy.fields").length, 10);
  const bindingKeys = typed.bindings.map(({ questionKey }) => questionKey).sort();
  const recordKeys = typed.records.map(({ key }) => key).sort();
  assert.deepEqual(bindingKeys, recordKeys, `${row.id} typed bindings must close exactly`);
  assert.equal(new Set(bindingKeys).size, 13, `${row.id} typed QUESTION keys must be unique`);
  assert.ok(typed.records.every((record) => record.authoritative === false &&
    record.confidence === "unverified" && record.disposition === "question" &&
    record.source === typed.source), `${row.id} typed questions were promoted`);
  typedQuestionRecordCount += typed.records.length;
}
assert.equal(typedQuestionRecordCount, 26);
assert.equal(inventory.counts.typedUnverifiedMechanicsQuestionCards, 2);
assert.equal(inventory.counts.typedUnverifiedMechanicsQuestionRecords, 26);
assert.equal(inventory.counts.fullHistoricalCardExecutions, 0);
assert.equal(inventory.counts.historicalParityClaims, 0);

const config = json("scripts/release-build.config.json");
const releasePaths = [...config.entries, ...config.staticAssetRoots];
assert.ok(releasePaths.every((value) =>
  !/(?:^|\/)(?:artifacts|reference|tests)(?:\/|$)/iu.test(value)));
assert.match(read("scripts/build-release.js").toString("utf8"),
  /"artifacts", "reference", "tests"/u);
assert.equal(config.limits.maxFiles, 128);
assert.equal(config.limits.maxTotalBytes, 8_388_608);

console.log(JSON.stringify({
  sourceCommit: inventory.pinnedInputs.sourceCommit,
  historicalRows: inventory.historicalRows.length,
  historicalTypes: inventory.counts.historicalTypes,
  questionFieldMismatches: 0,
  editableIds: currentIds.length,
  defaultIds: playable.PLAYABLE_CARD_IDS.length,
  currentOccurrences: currentOccurrenceCount,
  comparatorCandidates: comparatorRows.length,
  fixtureMentions: fixtureReferences.length,
  unjoinedIds,
  admittedIds: catalog.counts.admittedIds,
  admittedOccurrences: catalog.counts.admittedOccurrences,
  retainedBaselineBytes: legacyBytes.length,
  retainedBaselineSha256: sha256(legacyBytes),
  retained16Sha256: sha256(prior16Bytes),
  typedQuestionCards: typedCards.length,
  typedQuestionRecords: typedQuestionRecordCount,
  fullHistoricalExecutions: inventory.counts.fullHistoricalCardExecutions,
  parityClaims: inventory.counts.historicalParityClaims,
  releaseAllowlistExcludesComparisonPaths: true,
}, null, 2));
