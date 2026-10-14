import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const pagesRoot = resolve(process.argv[2]);
const candidateRoot = resolve(process.argv[3]);
const receiptPath = resolve(process.argv[4]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const files = [];
async function walk(directory) {
  for (const name of (await readdir(directory)).sort()) {
    const absolute = join(directory, name);
    const info = await stat(absolute);
    if (info.isDirectory()) await walk(absolute);
    else files.push({ absolute, path: relative(pagesRoot, absolute).split(sep).join("/") });
  }
}
await walk(pagesRoot);

const forbiddenSegments = new Set(["reference", "tests", "artifacts", "dist", "demo", "node_modules"]);
const forbiddenPaths = files
  .map(({ path }) => path)
  .filter((path) => path.split("/").some((segment) => forbiddenSegments.has(segment)));
assert.deepEqual(forbiddenPaths, [], "Pages output must exclude source, test, demo, and reference trees");

const releasePath = join(pagesRoot, "game", "release-manifest.json");
const release = JSON.parse(await readFile(releasePath, "utf8"));
assert.equal(release.fileCount, release.files.length);
for (const item of release.files) {
  const absolute = join(pagesRoot, "game", item.path);
  const bytes = await readFile(absolute);
  assert.equal(bytes.byteLength, item.size, `${item.path} byte length`);
  assert.equal(sha256(bytes), item.sha256, `${item.path} SHA-256`);
}

const modulePath = pathToFileURL(join(candidateRoot, "src/content/visual-asset-manifest.js")).href;
const { createVisualAssetManifest } = await import(modulePath);
const sourceManifest = createVisualAssetManifest();
const preservedV1SourcePath = "demo/assets/rivet-runners-battle-sprite-v1.png";
const preservedV1Bytes = await readFile(join(candidateRoot, preservedV1SourcePath));
assert.equal(
  sha256(preservedV1Bytes),
  "39b814504a9efe7f65b044ad0706589d3419d04ad3be0e53f55cdda5846edac3",
  "canonical preserved v1 source SHA-256",
);
assert.equal(
  files.some(({ path }) => path.endsWith("rivet-runners-battle-sprite-v1.png")),
  false,
  "Pages output must exclude the canonical preserved v1 source",
);
const battle = sourceManifest.assets.find(({ id }) => id === "rivet-runners-battle-sprite");
const portrait = sourceManifest.assets.find(({ id }) => id === "rivet-runners-portrait-painted");
assert.ok(battle, "candidate manifest is missing the new battle asset");
assert.ok(portrait, "candidate manifest must preserve the accepted portrait record");
assert.deepEqual(
  { path: battle.path, bytes: battle.byteLength, sha256: battle.sha256, dimensions: battle.dimensions },
  {
    path: "assets/rivet-runners-battle-sprite.webp",
    bytes: 94112,
    sha256: "1813f2570ddf88dc72144ea2b49a24d818e639054c23145aed2a368d619925b4",
    dimensions: { width: 512, height: 512 },
  },
);
assert.deepEqual(
  { path: portrait.path, bytes: portrait.byteLength, sha256: portrait.sha256, dimensions: portrait.dimensions },
  {
    path: "assets/rivet-runners-portrait-painted.webp",
    bytes: 76868,
    sha256: "6df560ccabb6c7f7347225bdb4c0fe2f9eadbb3aa1f769b6b540cd6f96c35b77",
    dimensions: { width: 512, height: 512 },
  },
);

function releaseEntry(path) {
  const entry = release.files.find((file) => file.path === path);
  assert.ok(entry, `Pages release is missing ${path}`);
  return entry;
}
const battleRelease = releaseEntry("public/assets/rivet-runners-battle-sprite.webp");
const portraitRelease = releaseEntry("public/assets/rivet-runners-portrait-painted.webp");
assert.equal(battleRelease.size, battle.byteLength);
assert.equal(battleRelease.sha256, battle.sha256);
assert.equal(portraitRelease.size, portrait.byteLength);
assert.equal(portraitRelease.sha256, portrait.sha256);

const receipt = {
  result: "pass",
  pagesRoot,
  candidateRoot,
  pagesFileCount: files.length,
  forbiddenSegmentNames: [...forbiddenSegments],
  forbiddenPathCount: forbiddenPaths.length,
  releaseManifestFileCount: release.fileCount,
  releaseManifestBytes: release.totalBytes,
  everyReleaseFileHashVerified: true,
  preservedV1Source: {
    sourcePath: preservedV1SourcePath,
    bytes: preservedV1Bytes.byteLength,
    sha256: sha256(preservedV1Bytes),
    absentFromPagesOutput: true,
  },
  battleAsset: { id: battle.id, path: battle.path, bytes: battleRelease.size, sha256: battleRelease.sha256 },
  preservedPortrait: { id: portrait.id, path: portrait.path, bytes: portraitRelease.size, sha256: portraitRelease.sha256 },
  sourceAssetManifestEntryCount: sourceManifest.assets.length,
};
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
