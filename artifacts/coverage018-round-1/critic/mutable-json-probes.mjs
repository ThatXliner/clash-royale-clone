import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(process.argv[2] ?? process.cwd());
const artifact = path.join(root,
  "artifacts/completion-inventory-current-18/card-coverage-109-current-18.json");
const generator = path.join(root,
  "artifacts/completion-inventory-current-18/generate.mjs");
const pristineBytes = readFileSync(artifact);
const pristine = JSON.parse(pristineBytes.toString("utf8"));
const pristineSha256 = createHash("sha256").update(pristineBytes).digest("hex");

function write(value) {
  writeFileSync(artifact, JSON.stringify(value, null, 2) + "\n");
}

function check() {
  return spawnSync(process.execPath, [generator, "--check"], {
    cwd: root,
    encoding: "utf8",
  });
}

assert.equal(check().status, 0, "pristine candidate must pass before mutations");

const cases = [
  ["missing historical row", (value) => value.historicalRows.pop()],
  ["duplicate historical row", (value) => {
    value.historicalRows[1].key = value.historicalRows[0].key;
  }],
  ["duplicate editable ID", (value) => {
    value.currentEditableCards[1].id = value.currentEditableCards[0].id;
  }],
  ["unsupported known comparator join", (value) => {
    const row = value.currentEditableCards.find(({ id }) => id === "sunthread-pair");
    row.comparison = {
      status: "declared-test-comparator",
      referenceKey: "mini-pekka",
      evidenceMappingLine: 22,
      fullParityClaimed: false,
      fieldDisposition: "source-unverified fields remain QUESTION",
    };
  }],
  ["private QUESTION fixture promotion", (value) => {
    const row = value.currentEditableCards.find(({ id }) => id === "cinder-host");
    row.comparison = {
      status: "declared-test-comparator",
      referenceKey: "skeleton-army",
      evidenceMappingLine: 12,
      fullParityClaimed: false,
      fieldDisposition: "source-unverified fields remain QUESTION",
    };
  }],
  ["wrong declaration evidence line", (value) => {
    value.currentEditableCards.find(({ id }) => id === "coilblade")
      .evidence[0].line = 999999;
  }],
  ["wrong comparator mapping line", (value) => {
    value.currentEditableCards.find(({ id }) => id === "coilblade")
      .comparison.evidenceMappingLine = 999999;
  }],
  ["promoted typed QUESTION record", (value) => {
    const question = value.currentEditableCards.find(({ id }) => id === "gloamwing-cluster")
      .typedUnverifiedMechanicsQuestions.records[0];
    question.authoritative = true;
  }],
  ["historical execution claim", (value) => {
    value.historicalRows[0].fullHistoricalCardExecutionClaimed = true;
  }],
];

const results = [];
for (const [name, mutate] of cases) {
  const candidate = structuredClone(pristine);
  mutate(candidate);
  write(candidate);
  const run = check();
  const output = run.stderr || run.stdout || "";
  assert.notEqual(run.status, 0, name + " mutation was accepted");
  assert.match(output, /generated inventory differs/u,
    name + " was not rejected by the pinned exact-output check");
  results.push({
    case: name,
    exitCode: run.status,
    rejectedBy: "pinned exact-output comparison",
    error: output.split("\n").find((line) => line.includes("generated inventory differs")),
  });
}

writeFileSync(artifact, pristineBytes);
assert.equal(check().status, 0, "restored pristine candidate must pass after mutations");
process.stdout.write(JSON.stringify({
  probe: "actual mutable JSON tampering against clean frozen-source archive",
  pristineSha256,
  cases: results,
  pristineRestored: true,
}, null, 2) + "\n");
