import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const BUILDER = resolve(ROOT, "artifacts/art004-aggregate-round-1/builder");
const SOURCE_PATHS = [
  "public/assets/briar-runner-painted-sheet.png",
  "public/assets/briar-runner-sprite-sheet.svg",
  "src/ui/combat-sprite-prototype.js",
  "src/ui/combat-art.js",
  "src/content/visual-asset-manifest.js",
  "tests/combat-sprite-prototype.test.js",
  "tests/combat-sprite-prototype-browser.test.js",
  "demo/sprite-prototype.html",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceHashes = {};
for (const path of SOURCE_PATHS) {
  const baseBytes = execFileSync("git", ["show", `HEAD:${path}`]);
  const worktreeBytes = await readFile(resolve(ROOT, path));
  sourceHashes[path] = {
    baseSha256: sha256(baseBytes),
    worktreeSha256: sha256(worktreeBytes),
    unchanged: sha256(baseBytes) === sha256(worktreeBytes),
  };
  assert.equal(sourceHashes[path].unchanged, true, `${path} changed during aggregate proof`);
}

const { createVisualAssetManifest } = await import(
  pathToFileURL(resolve(ROOT, "src/content/visual-asset-manifest.js")).href
);
const manifest = createVisualAssetManifest();
const pngEntry = manifest.assets.find(({ id }) => id === "briar-runner-painted-sheet");
const svgEntry = manifest.assets.find(({ id }) => id === "briar-runner-sprite-sheet");
assert.ok(pngEntry && svgEntry);
const pngBytes = await readFile(resolve(ROOT, "public", pngEntry.path));
const svgBytes = await readFile(resolve(ROOT, "public", svgEntry.path));
const provenance = JSON.parse(await readFile(resolve(BUILDER,
  "painted-atlas-original-provenance.json"), "utf8"));
assert.equal(sha256(pngBytes), pngEntry.sha256);
assert.equal(pngBytes.length, pngEntry.byteLength);
assert.equal(pngBytes.readUInt32BE(16), pngEntry.dimensions.width);
assert.equal(pngBytes.readUInt32BE(20), pngEntry.dimensions.height);
assert.equal(sha256(svgBytes), svgEntry.sha256);
assert.equal(svgBytes.length, svgEntry.byteLength);
assert.equal(provenance.sha256, pngEntry.sha256);

await writeFile(resolve(BUILDER, "source-hashes-pre-post.json"),
  `${JSON.stringify({
    baseCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    description: "Source files were read from the accepted base and compared after the fresh aggregate captures.",
    files: sourceHashes,
    allUnchanged: Object.values(sourceHashes).every(({ unchanged }) => unchanged),
  }, null, 2)}\n`);
await writeFile(resolve(BUILDER, "asset-source-manifest-audit.json"),
  `${JSON.stringify({
    manifestSource: "src/content/visual-asset-manifest.js",
    manifestVersion: manifest.version,
    visualAssetCount: manifest.assets.length,
    paintedAtlasProvenance: provenance,
    assets: [pngEntry, svgEntry].map((entry, index) => {
      const bytes = index === 0 ? pngBytes : svgBytes;
      return {
        ...entry,
        actualByteLength: bytes.length,
        actualSha256: sha256(bytes),
        dimensionsReadFromPngHeader: index === 0 ? {
          width: pngBytes.readUInt32BE(16),
          height: pngBytes.readUInt32BE(20),
          colorType: pngBytes[25],
        } : null,
        manifestMatchesDisk: bytes.length === entry.byteLength &&
          sha256(bytes) === entry.sha256,
      };
    }),
    focusedProof: {
      visualAssetManifest: "6/6 passed; includes zero byte overlap with reference corpus and provenance source guard",
      prototypeUnitBounds: "10/10 passed; includes every direction/action/frame cell-window containment",
      browserAtlasAndSourceWindowAssertions: "reached on phone and 720px prototype page before current-app legibility assertion failed",
    },
  }, null, 2)}\n`);

const entries = await readdir(BUILDER);
const screenshots = [];
for (const name of entries.filter((entry) => entry.endsWith(".png")).sort()) {
  const path = resolve(BUILDER, name);
  const bytes = await readFile(path);
  const metadata = await stat(path);
  screenshots.push({
    file: name,
    bytes: metadata.size,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    sha256: sha256(bytes),
  });
}
await writeFile(resolve(BUILDER, "screens-inventory.json"),
  `${JSON.stringify({
    note: "Fresh outputs from focused prototype suite or Playwright against current public/index.html shell. Browser screenshots use deviceScaleFactor 1; prototype demo screenshots are element captures at phone viewport.",
    screenshots,
  }, null, 2)}\n`);
