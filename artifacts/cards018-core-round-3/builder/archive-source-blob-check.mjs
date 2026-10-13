import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const commit = "d20938fad64bfcf93fce48c08de54c2d5ba854bf";
const archiveRoot = resolve(process.argv[2] ?? "/tmp/cards018k-candidate-5DtH2y");
const listing = execFileSync("git", [
  "ls-tree", "-r", "--full-tree", commit, "--", "src", "tests", "reference/stats", "package.json",
], { encoding: "utf8" });
const mismatches = [];
let checked = 0;
for (const line of listing.trimEnd().split("\n")) {
  const match = /^(\d+) blob ([0-9a-f]{40})\t(.+)$/.exec(line);
  assert.ok(match, `unexpected git ls-tree line: ${line}`);
  const [, , expected, path] = match;
  const contents = readFileSync(resolve(archiveRoot, path));
  const actual = createHash("sha1")
    .update(Buffer.from(`blob ${contents.length}\0`))
    .update(contents)
    .digest("hex");
  checked += 1;
  if (actual !== expected) mismatches.push({ path, expected, actual });
}
const result = {
  candidateCommit: commit,
  candidateTree: execFileSync("git", ["rev-parse", `${commit}^{tree}`], { encoding: "utf8" }).trim(),
  archiveRoot,
  checkedRoots: ["src", "tests", "reference/stats", "package.json"],
  checkedFiles: checked,
  mismatches,
  allImportedBlobsMatch: mismatches.length === 0,
};
writeFileSync(new URL("./archive-source-blob-check.json", import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
assert.equal(mismatches.length, 0, `${mismatches.length} source blobs differ from the candidate commit`);
console.log(JSON.stringify(result, null, 2));
