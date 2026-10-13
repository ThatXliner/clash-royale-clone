import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [sourceRootArg, releaseRootArg] = process.argv.slice(2);
if (!sourceRootArg || !releaseRootArg) {
  throw new Error("usage: node release-output-audit.mjs PINNED_ARCHIVE_ROOT RELEASE_ROOT");
}
const sourceRoot = path.resolve(sourceRootArg);
const releaseRoot = path.resolve(releaseRootArg);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const { auditReleaseArtifact } = await import(pathToFileURL(
  path.join(sourceRoot, "scripts/release-isolation-guard.js")));
const audit = await auditReleaseArtifact({ artifactRoot: releaseRoot, referenceRoot: sourceRoot });
const manifestBytes = await readFile(path.join(releaseRoot, "release-manifest.json"));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const inventoryPath = path.join(sourceRoot,
  "artifacts/completion-inventory-current-18/card-coverage-109-current-18.json");
const inventoryBytes = await readFile(inventoryPath);
const markers = [
  "card-coverage-109-current-18",
  "COVERAGE-003",
  "offline test-only historical comparison inventory",
  "historicalRows",
  "currentEditableCards",
  "question-fixture-only",
  "reference/stats/cards.json",
];
const scannedFiles = [];
const leakedMarkers = [];
const exactInventoryCopies = [];
const manifestDrift = [];
const manifestText = manifestBytes.toString("utf8");
for (const marker of markers) {
  if (manifestText.includes(marker)) {
    leakedMarkers.push({ path: "release-manifest.json", marker });
  }
}
const serializedManifest = JSON.stringify(manifest);
const privateManifestMarkers = ["reference/", "tests/", "artifacts/",
  "completion-inventory-current-18"].filter((marker) => serializedManifest.includes(marker));
assert.deepEqual(privateManifestMarkers, [],
  "release manifest mentions a comparison, test, evidence or inventory path");
const listedPaths = new Set();
let measuredBytes = 0;
for (const entry of manifest.files) {
  assert.ok(!listedPaths.has(entry.path), `duplicate release manifest path: ${entry.path}`);
  listedPaths.add(entry.path);
  const bytes = await readFile(path.join(releaseRoot, ...entry.path.split("/")));
  measuredBytes += bytes.length;
  if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) {
    manifestDrift.push({ path: entry.path, listedSize: entry.size, actualSize: bytes.length,
      listedSha256: entry.sha256, actualSha256: sha256(bytes) });
  }
  const content = bytes.toString("utf8");
  for (const marker of markers) {
    if (content.includes(marker)) leakedMarkers.push({ path: entry.path, marker });
  }
  if (bytes.equals(inventoryBytes)) exactInventoryCopies.push(entry.path);
  scannedFiles.push({ path: entry.path, size: bytes.length, sha256: sha256(bytes) });
}
assert.deepEqual(manifestDrift, [], "release manifest sizes or SHA-256 values differ from actual files");
assert.deepEqual(leakedMarkers, [], "comparison inventory markers leaked into release files");
assert.deepEqual(exactInventoryCopies, [], "the inventory JSON was copied into release output");
assert.equal(manifest.fileCount, audit.fileCount);
assert.equal(measuredBytes, manifest.totalBytes);
assert.equal(manifest.totalBytes, audit.totalBytes);
assert.ok(manifest.fileCount <= 128);
assert.ok(manifest.files.every(({ size }) => size <= 1_048_576));
assert.ok(manifest.totalBytes <= 8_388_608);
assert.ok(audit.referenceFileCount > 0);
const protectedPaths = manifest.files.map(({ path: file }) => file).filter((file) =>
  /(?:^|\/)(?:reference|tests|artifacts)(?:\/|$)|completion-inventory-current-18/iu.test(file));
assert.deepEqual(protectedPaths, [], "manifest lists a comparison or evidence path");

const referenceFiles = [];
async function collectReference(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectReference(absolute, relative);
    else if (entry.isFile()) referenceFiles.push(relative);
  }
}
await collectReference(path.join(sourceRoot, "reference"));
const result = {
  output: releaseRoot,
  releaseFileCount: manifest.fileCount,
  releaseTotalBytes: manifest.totalBytes,
  manifestSha256: sha256(manifestBytes),
  manifestBytes: manifestBytes.length,
  manifestPrivateMarkers: privateManifestMarkers,
  referenceFilesChecked: referenceFiles.length,
  actualScannedFiles: scannedFiles.length,
  leakedMarkers,
  exactInventoryCopies,
  protectedManifestPaths: protectedPaths,
  manifestFilesMatchActualBytes: manifestDrift.length === 0,
  limits: { maxFiles: 128, maxFileBytes: 1_048_576, maxTotalBytes: 8_388_608 },
  releaseDirectory: (await stat(releaseRoot)).isDirectory(),
};
console.log(JSON.stringify(result, null, 2));
