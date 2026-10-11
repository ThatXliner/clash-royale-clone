import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const archiveRoot = process.env.RELEASE_ARCHIVE_ROOT;
if (!archiveRoot) throw new Error("RELEASE_ARCHIVE_ROOT is required");
const { buildPages } = await import(join(archiveRoot, "scripts/build-pages.js"));
const { auditReleaseArtifact } = await import(join(archiveRoot, "scripts/release-isolation-guard.js"));
const evidenceRoot = dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "release-pages-audit-"));
const output = join(temporary, "pages-artifact");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function listFiles(root, prefix = "") {
  const result = [];
  for (const entry of (await readdir(join(root, prefix), { withFileTypes: true }))
    .toSorted((left, right) => left.name.localeCompare(right.name))) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await listFiles(root, path));
    else result.push(path);
  }
  return result;
}

try {
  const build = await buildPages({
    output,
    repository: "MossTeam/ember-arena",
    ref: "release-test-001-critic",
  });
  const gameRoot = join(output, "game");
  const manifestBytes = await readFile(join(gameRoot, "release-manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const releaseSnapshot = join(temporary, "manifest-scoped-release");
  await mkdir(releaseSnapshot, { recursive: true });
  await writeFile(join(releaseSnapshot, "release-manifest.json"), manifestBytes);
  for (const { path } of manifest.files) {
    const source = join(gameRoot, ...path.split("/"));
    const destination = join(releaseSnapshot, ...path.split("/"));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(source));
  }
  const audit = await auditReleaseArtifact({
    artifactRoot: releaseSnapshot,
    referenceRoot: archiveRoot,
  });
  const sourceAssets = await listFiles(join(archiveRoot, "public/assets"));
  const canonicalAssetAudit = [];
  const sourceHashes = new Set();
  const emittedByHash = new Map(manifest.files.map((entry) => [entry.sha256, entry.path]));
  for (const relativePath of sourceAssets) {
    const path = `public/assets/${relativePath}`;
    const sourceBytes = await readFile(join(archiveRoot, ...path.split("/")));
    const emitted = manifest.files.find((entry) => entry.path === path);
    assert.ok(emitted, `missing canonical source asset ${path}`);
    const emittedBytes = await readFile(join(gameRoot, ...path.split("/")));
    assert.equal(emitted.size, sourceBytes.length, `size mismatch: ${path}`);
    assert.equal(emitted.sha256, sha256(sourceBytes), `hash mismatch: ${path}`);
    assert.deepEqual(emittedBytes, sourceBytes, `byte mismatch: ${path}`);
    sourceHashes.add(emitted.sha256);
    canonicalAssetAudit.push({ path, size: emitted.size, sha256: emitted.sha256, byteIdentical: true });
  }
  const duplicateAssetCopies = manifest.files.filter(({ path, sha256: hash }) =>
    !path.startsWith("public/assets/") && sourceHashes.has(hash));
  assert.deepEqual(duplicateAssetCopies, [], "canonical public assets have no duplicate hashed copies");
  assert.equal(manifest.build.runtimeDependencies.length, 0);
  assert.ok(manifest.fileCount <= 128, "release file cap remains at 128");
  assert.ok(manifest.totalBytes <= 8_388_608, "release byte cap remains at 8 MiB");

  const pagesPaths = await listFiles(output);
  const pagesFiles = await Promise.all(pagesPaths.map(async (path) => {
    const bytes = await readFile(join(output, ...path.split("/")));
    return { path, size: bytes.length, sha256: sha256(bytes) };
  }));
  const summary = {
    schemaVersion: 1,
    candidate: "RELEASE-TEST-001",
    outcome: "PASS",
    output: "temporary Pages artifact (removed after audit)",
    pages: {
      fileCount: pagesFiles.length,
      totalBytes: pagesFiles.reduce((sum, entry) => sum + entry.size, 0),
      files: pagesFiles,
    },
    release: {
      fileCount: manifest.fileCount,
      totalBytes: manifest.totalBytes,
      manifestBytes: manifestBytes.length,
      manifestSha256: sha256(manifestBytes),
      auditedManifestSha256: audit.manifestSha256,
      referenceFilesCompared: audit.referenceFileCount,
      maxFiles: 128,
      maxTotalBytes: 8_388_608,
      runtimeDependencies: manifest.build.runtimeDependencies,
      browserQualification: build.browserQualification,
    },
    sourceAssets: {
      count: canonicalAssetAudit.length,
      allCanonicalPathsAndBytesMatch: true,
      duplicateHashedCopies: duplicateAssetCopies,
      assets: canonicalAssetAudit,
    },
  };
  assert.equal(summary.release.manifestSha256, summary.release.auditedManifestSha256);
  const rawManifest = join(evidenceRoot, "pages-manifest.json");
  await writeFile(rawManifest, manifestBytes);
  const auditPath = join(evidenceRoot, "pages-audit.json");
  await writeFile(auditPath, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
