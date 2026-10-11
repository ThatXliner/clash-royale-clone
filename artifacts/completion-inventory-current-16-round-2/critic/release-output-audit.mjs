import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [sourceRoot, releaseRoot] = process.argv.slice(2);
if (!sourceRoot || !releaseRoot) {
  throw new Error("usage: node release-output-audit.mjs PINNED_ARCHIVE_ROOT RELEASE_ROOT");
}
const { auditReleaseArtifact } = await import(pathToFileURL(
  path.join(sourceRoot, "scripts/release-isolation-guard.js")));
const audit = await auditReleaseArtifact({ artifactRoot: releaseRoot, referenceRoot: sourceRoot });
const manifest = JSON.parse(await readFile(path.join(releaseRoot, "release-manifest.json"), "utf8"));
const inventoryPath = path.join(sourceRoot,
  "artifacts/completion-inventory-current-16/card-coverage-109-current-16.json");
const inventoryBytes = await readFile(inventoryPath);
const inventoryDigest = createHash("sha256").update(inventoryBytes).digest("hex");
const markers = [
  "card-coverage-109-current-16",
  "offline test-only historical comparison inventory",
  "historicalRows",
  "currentEditableCards",
  "question-fixture-only",
  "reference/stats/cards.json",
];
const scanned = [];
const exactInventoryCopies = [];
const mismatchedManifestFiles = [];
for (const entry of manifest.files) {
  const bytes = await readFile(path.join(releaseRoot, ...entry.path.split("/")));
  const source = bytes.toString("utf8");
  scanned.push({ path: entry.path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  for (const marker of markers) {
    if (source.includes(marker)) mismatchedManifestFiles.push({ path: entry.path, marker });
  }
  if (bytes.equals(inventoryBytes)) exactInventoryCopies.push(entry.path);
}
assert.deepEqual(mismatchedManifestFiles, [], "offline coverage artifact marker leaked into release bytes");
assert.deepEqual(exactInventoryCopies, [], "coverage inventory JSON was copied to release bytes");
assert.equal(manifest.fileCount, audit.fileCount);
assert.equal(manifest.totalBytes, audit.totalBytes);
assert.ok(audit.referenceFileCount > 0);
const protectedPaths = manifest.files.map(({ path: file }) => file).filter((file) =>
  /(?:^|\/)(?:reference|tests)(?:\/|$)|completion-inventory-current-16/iu.test(file));
assert.deepEqual(protectedPaths, []);
const statInfo = await stat(releaseRoot);
console.log(JSON.stringify({
  output: releaseRoot,
  releaseFileCount: audit.fileCount,
  releaseTotalBytes: audit.totalBytes,
  manifestSha256: audit.manifestSha256,
  referenceFilesChecked: audit.referenceFileCount,
  sourceInventorySha256: inventoryDigest,
  emittedCoverageMarkers: mismatchedManifestFiles,
  exactInventoryCopies: exactInventoryCopies,
  protectedManifestPaths: protectedPaths,
  actualScannedFiles: scanned.length,
  releaseDirectoryBytesFromFilesystem: statInfo.isDirectory(),
}, null, 2));
