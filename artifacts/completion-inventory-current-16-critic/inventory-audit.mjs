import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
if (!root) throw new Error("usage: node inventory-audit.mjs PINNED_ARCHIVE_ROOT");
const artifactPath = path.join(root,
  "artifacts/completion-inventory-current-16/card-coverage-109-current-16.json");
const inventory = JSON.parse(readFileSync(artifactPath, "utf8"));
const corpus = JSON.parse(readFileSync(path.join(root, "reference/stats/cards.json"), "utf8"));
const sources = readFileSync(path.join(root, "reference/stats/SOURCES.md"), "utf8");
const legacyPath = path.join(root, "artifacts/completion-inventory/reference/card-coverage-109.json");
const legacyBytes = readFileSync(legacyPath);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

assert.match(sources, /unverified_fields.*second historical source/iu);
assert.equal(inventory.historicalRows.length, 109);
assert.equal(new Set(inventory.historicalRows.map(({ key }) => key)).size, 109);
assert.equal(new Set(inventory.historicalRows.map(({ id }) => id)).size, 109);
assert.deepEqual(inventory.counts.historicalTypes, { troop: 78, building: 13, spell: 18 });
const referenceByKey = new Map(corpus.cards.map((row) => [row.key, row]));
for (const row of inventory.historicalRows) {
  assert.deepEqual(row.unverifiedFields, referenceByKey.get(row.key).unverified_fields,
    `${row.key} QUESTION fields must match the pinned corpus`);
  assert.equal(row.unverifiedFieldsDisposition, "QUESTION");
}
assert.equal(sha256(legacyBytes), inventory.pinnedInputs.retained11CardBaseline.sha256);
assert.equal(legacyBytes.length, inventory.pinnedInputs.retained11CardBaseline.bytes);

const editable = await import(pathToFileURL(path.join(root, "src/content/editable-deck.js")));
const playable = await import(pathToFileURL(path.join(root, "src/content/playable-roster.js")));
const cardCatalog = await import(pathToFileURL(path.join(root, "src/content/session-card-catalog.js")));
const currentIds = [...editable.EDITABLE_MIXED_DECK_CARD_IDS];
assert.deepEqual(inventory.currentEditableCards.map(({ id }) => id), currentIds);
assert.deepEqual(inventory.currentEditableCards
  .filter(({ defaultDeckOrder }) => defaultDeckOrder !== null)
  .map(({ id }) => id), [...playable.PLAYABLE_CARD_IDS]);
assert.equal(inventory.counts.editableCurrentIds, 16);
assert.equal(inventory.counts.unchangedDefaultDeckIds, 8);
assert.equal(inventory.counts.currentAdmittedOccurrences, 19);

const catalog = cardCatalog.createSessionCardManifest();
assert.equal(catalog.counts.admittedIds, 53);
assert.equal(catalog.counts.admittedOccurrences, 58);
assert.equal(inventory.counts.sessionCatalog.admittedIds, catalog.counts.admittedIds);
assert.equal(inventory.counts.sessionCatalog.admittedOccurrences, catalog.counts.admittedOccurrences);

const comparatorRows = inventory.currentEditableCards
  .filter(({ comparison }) => comparison.status === "declared-test-comparator");
assert.equal(comparatorRows.length, 12);
for (const row of inventory.currentEditableCards) {
  assert.ok(row.evidence.length > 0, `${row.id} needs test declaration evidence`);
  for (const evidence of row.evidence) {
    const lines = readFileSync(path.join(root, evidence.file), "utf8").split("\n");
    assert.ok(lines[evidence.line - 1]?.startsWith(`test(${JSON.stringify(evidence.test)}`),
      `${row.id} declaration line must contain its exact test`);
  }
  if (row.comparison.status === "declared-test-comparator") {
    assert.match(row.comparison.fieldDisposition, /QUESTION/u);
    const source = readFileSync(path.join(root, row.evidence[0].file), "utf8").split("\n");
    const mappingWindow = source.slice(row.comparison.evidenceMappingLine - 1,
      row.comparison.evidenceMappingLine + 2).join("\n");
    if (row.id !== "stonehauler") {
      assert.ok(mappingWindow.includes(row.id), `${row.id} comparator mapping line is wrong`);
    }
    assert.ok(mappingWindow.includes(row.comparison.referenceKey),
      `${row.id} reference mapping line is wrong`);
  } else {
    assert.equal(Object.hasOwn(row.comparison, "referenceKey"), false);
  }
}
const fixtureReferences = inventory.currentEditableCards
  .flatMap(({ comparison }) => comparison.fixtureReferences ?? []);
assert.equal(fixtureReferences.length, 2);
assert.ok(fixtureReferences.every(({ status, identityJoin }) =>
  /QUESTION/u.test(status) && identityJoin === false));
assert.equal(inventory.counts.IDsWithoutExactHistoricalIdentityClaim, 4);
assert.equal(inventory.counts.fullHistoricalCardExecutions, 0);
assert.equal(inventory.counts.historicalParityClaims, 0);

const releaseConfig = JSON.parse(readFileSync(path.join(root, "scripts/release-build.config.json"), "utf8"));
const releasePaths = [...releaseConfig.entries, ...releaseConfig.staticAssetRoots];
assert.ok(releasePaths.every((value) => !/(?:^|\/)(?:artifacts|reference|tests)(?:\/|$)/iu.test(value)));
assert.match(readFileSync(path.join(root, "scripts/build-release.js"), "utf8"),
  /"artifacts", "reference", "tests"/u);
assert.match(readFileSync(path.join(root, "scripts/build-pages.js"), "utf8"),
  /copySourceTree\(SOURCE_SITE, stage\)/u);

console.log(JSON.stringify({
  historicalRows: inventory.historicalRows.length,
  historicalTypes: inventory.counts.historicalTypes,
  questionFieldMismatches: 0,
  editableIds: inventory.currentEditableCards.length,
  defaultIds: 8,
  currentOccurrences: inventory.counts.currentAdmittedOccurrences,
  comparatorCandidates: comparatorRows.length,
  fixtureMentions: fixtureReferences.length,
  unjoinedIds: inventory.currentEditableCards.filter(({ comparison }) =>
    !Object.hasOwn(comparison, "referenceKey")).map(({ id }) => id),
  admittedIds: catalog.counts.admittedIds,
  admittedOccurrences: catalog.counts.admittedOccurrences,
  retainedBaselineBytes: legacyBytes.length,
  retainedBaselineSha256: sha256(legacyBytes),
  fullHistoricalExecutions: inventory.counts.fullHistoricalCardExecutions,
  parityClaims: inventory.counts.historicalParityClaims,
  releaseAllowlistExcludesComparisonPaths: true,
}, null, 2));
