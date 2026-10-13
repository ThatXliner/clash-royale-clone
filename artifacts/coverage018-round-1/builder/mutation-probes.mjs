import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const GENERATOR = path.join(ROOT,
  "artifacts/completion-inventory-current-18/generate.mjs");
const RECORD = path.join(HERE, "logs/semantic-mutations.json");
const expectedNames = [
  "missing historical row",
  "duplicate historical row",
  "duplicate editable ID",
  "unsupported comparator join",
  "private QUESTION fixture promotion",
  "forged/wrong-line evidence",
];

const run = spawnSync(process.execPath, [GENERATOR, "--check", "--self-test"], {
  cwd: ROOT,
  encoding: "utf8",
});
if (run.error) throw run.error;
assert.equal(run.status, 0, "generator semantic self-tests must exit successfully");
const output = run.stdout;
const mutationOutputs = output.split("\n").filter((line) => line.startsWith("self-check "));
assert.equal(mutationOutputs.length, 6,
  "expected six actual generator mutation outputs");
for (let index = 0; index < expectedNames.length; index += 1) {
  assert.ok(mutationOutputs[index].includes("self-check " + (index + 1) + "/6 PASS — " +
    expectedNames[index] + ":"), "missing mutation output for " + expectedNames[index]);
}
assert.ok(output.includes("set Coilblade mapping line to 999999"),
  "raw generator output must include the mapping-line adversary as well as declaration-line evidence");

const record = {
  command: "node artifacts/completion-inventory-current-18/generate.mjs --check --self-test",
  frozenSourceCommit: "a8c39bcc02329ba22b3fdd50be7d1089bc6010dc",
  exitCode: run.status,
  mutationOutputs,
  mappingLineMutationRejected: output.includes("set Coilblade mapping line to 999999"),
  rawGeneratorOutput: output,
};
mkdirSync(path.dirname(RECORD), { recursive: true });
writeFileSync(RECORD, JSON.stringify(record, null, 2) + "\n");
process.stdout.write(JSON.stringify(record, null, 2) + "\n");
