import assert from "node:assert/strict";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
if (!root) throw new Error("usage: node mutation-probes.mjs CLEAN_ARCHIVE_ROOT");
const artifactDir = path.join(root, "artifacts/completion-inventory-current-16");
const generator = path.join(artifactDir, "generate.mjs");
const source = readFileSync(generator, "utf8").trimEnd();
const tail = "await main();";
assert.ok(source.endsWith(tail), "unexpected generator ending");

const probeGenerator = path.join(artifactDir, `generate-probe-${process.pid}.mjs`);
writeFileSync(probeGenerator,
  `${source.slice(0, -tail.length)}export { makeInventory, validateInventory };\n${tail}\n`);

try {
  const { makeInventory, validateInventory } = await import(pathToFileURL(probeGenerator));
  const original = await makeInventory();

  function rejected(label, mutation, expectedError) {
    const candidate = structuredClone(original);
    mutation(candidate);
    assert.throws(() => validateInventory(candidate), expectedError);
    process.stdout.write(`REJECTED ${label}\n`);
  }

  rejected("Cinder Host promoted from Skeleton Army QUESTION fixture", (candidate) => {
    candidate.currentEditableCards.find(({ id }) => id === "cinder-host").comparison = {
      status: "declared-test-comparator",
      referenceKey: "skeleton-army",
      evidenceMappingLine: 12,
      fullParityClaimed: false,
      fieldDisposition: "source-unverified fields remain QUESTION",
    };
  }, /comparison disagrees with pinned declaration and QUESTION ledger/u);

  rejected("out-of-range test declaration line", (candidate) => {
    candidate.currentEditableCards.find(({ id }) => id === "coilblade").evidence[0].line = 999999;
  }, /evidence disagrees with pinned test declarations/u);

  rejected("out-of-range comparator mapping line", (candidate) => {
    candidate.currentEditableCards.find(({ id }) => id === "coilblade")
      .comparison.evidenceMappingLine = 999999;
  }, /comparison disagrees with pinned declaration and QUESTION ledger/u);
} finally {
  unlinkSync(probeGenerator);
}
