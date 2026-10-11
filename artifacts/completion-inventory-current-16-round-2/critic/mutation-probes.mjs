import assert from "node:assert/strict";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
if (!root) throw new Error("usage: node mutation-probes.mjs CLEAN_ARCHIVE_ROOT");
const artifactDir = path.join(root, "artifacts/completion-inventory-current-16");
const source = readFileSync(path.join(artifactDir, "generate.mjs"), "utf8").trimEnd();
const tail = "await main();";
assert.ok(source.endsWith(tail), "unexpected submitted generator ending");
const probeGenerator = path.join(artifactDir, "generate-probe.mjs");
writeFileSync(probeGenerator,
  `${source.slice(0, -tail.length)}\nexport { makeInventory, validateInventory };\n`);
const { makeInventory, validateInventory } = await import(pathToFileURL(probeGenerator));
unlinkSync(probeGenerator);
const original = await makeInventory();

function rejected(label, mutation, expectedMessage) {
  const candidate = structuredClone(original);
  mutation(candidate);
  assert.throws(() => validateInventory(candidate), expectedMessage);
  console.log(`REJECTED ${label}`);
}

rejected("missing historical row", (candidate) => candidate.historicalRows.pop(), /exactly 109/u);
rejected("duplicate historical key", (candidate) => {
  candidate.historicalRows[1].key = candidate.historicalRows[0].key;
}, /duplicate historical row key/u);
rejected("duplicate editable ID", (candidate) => {
  candidate.currentEditableCards[1].id = candidate.currentEditableCards[0].id;
}, /duplicate current editable id/u);
rejected("unsupported unknown join", (candidate) => {
  const row = candidate.currentEditableCards.find(({ id }) => id === "sunthread-pair");
  row.comparison = {
    status: "declared-test-comparator",
    referenceKey: "invented-card",
    fullParityClaimed: false,
  };
}, /unsupported reference join/u);
rejected("fixture promotion cinder-host -> skeleton-army", (candidate) => {
  const row = candidate.currentEditableCards.find(({ id }) => id === "cinder-host");
  row.comparison = {
    status: "declared-test-comparator",
    referenceKey: "skeleton-army",
    evidenceMappingLine: 12,
    fullParityClaimed: false,
    fieldDisposition: "source-unverified fields remain QUESTION",
  };
}, /comparison disagrees with pinned declaration and QUESTION ledger/u);
rejected("declaration evidence line 999999", (candidate) => {
  candidate.currentEditableCards.find(({ id }) => id === "coilblade").evidence[0].line = 999999;
}, /evidence disagrees with pinned test declarations/u);
rejected("mapping evidence line 999999", (candidate) => {
  candidate.currentEditableCards.find(({ id }) => id === "coilblade")
    .comparison.evidenceMappingLine = 999999;
}, /comparison disagrees with pinned declaration and QUESTION ledger/u);
