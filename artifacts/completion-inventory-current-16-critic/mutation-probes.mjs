import assert from "node:assert/strict";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
if (!root) throw new Error("usage: node mutation-probes.mjs CLEAN_ARCHIVE_ROOT");
const artifactDir = path.join(root, "artifacts/completion-inventory-current-16");
const submittedGenerator = path.join(artifactDir, "generate.mjs");
const source = readFileSync(submittedGenerator, "utf8").trimEnd();
const tail = "await main();";
assert.ok(source.endsWith(tail), "unexpected submitted generator ending");
const probeGenerator = path.join(artifactDir, "generate-probe.mjs");
writeFileSync(probeGenerator, `${source.slice(0, -tail.length)}\nexport { makeInventory, validateInventory };\n`);
const { makeInventory, validateInventory } = await import(pathToFileURL(probeGenerator));
unlinkSync(probeGenerator);
const original = await makeInventory();

function rejection(label, mutation) {
  const candidate = structuredClone(original);
  mutation(candidate);
  assert.throws(() => validateInventory(candidate));
  console.log(`REJECTED ${label}`);
}
function acceptance(label, mutation) {
  const candidate = structuredClone(original);
  mutation(candidate);
  validateInventory(candidate);
  console.log(`ACCEPTED ${label}`);
}

rejection("missing historical row", (candidate) => candidate.historicalRows.pop());
rejection("duplicate historical key", (candidate) => {
  candidate.historicalRows[1].key = candidate.historicalRows[0].key;
});
rejection("duplicate editable ID", (candidate) => {
  candidate.currentEditableCards[1].id = candidate.currentEditableCards[0].id;
});
rejection("unsupported unknown join", (candidate) => {
  const row = candidate.currentEditableCards.find(({ id }) => id === "sunthread-pair");
  row.comparison = {
    status: "declared-test-comparator",
    referenceKey: "invented-card",
    fullParityClaimed: false,
  };
});
acceptance("known fixture promotion: cinder-host -> skeleton-army", (candidate) => {
  const row = candidate.currentEditableCards.find(({ id }) => id === "cinder-host");
  row.comparison = {
    status: "declared-test-comparator",
    referenceKey: "skeleton-army",
    fullParityClaimed: false,
  };
});
acceptance("out-of-range declaration line 999999", (candidate) => {
  candidate.currentEditableCards.find(({ id }) => id === "coilblade").evidence[0].line = 999999;
});
acceptance("out-of-range mapping line 999999", (candidate) => {
  candidate.currentEditableCards.find(({ id }) => id === "coilblade").comparison.evidenceMappingLine = 999999;
});
