import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outputRoot = join(here, "pages-output");
const gameRoot = join(outputRoot, "game");
const manifestBytes = await readFile(join(gameRoot, "release-manifest.json"));
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function listFiles(root, prefix = "") {
  const rows = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) rows.push(...await listFiles(root, path));
    else rows.push(path);
  }
  return rows.toSorted();
}

const checks = await Promise.all(manifest.files.map(async ({ path, size, sha256: expectedSha256 }) => {
  const bytes = await readFile(join(gameRoot, ...path.split("/")));
  return {
    path,
    expectedSize: size,
    actualSize: bytes.byteLength,
    expectedSha256,
    actualSha256: sha256(bytes),
    matches: bytes.byteLength === size && sha256(bytes) === expectedSha256,
  };
}));
const outputFiles = await listFiles(outputRoot);
const forbiddenPaths = outputFiles.filter((path) =>
  /(?:^|\/)(?:reference|tests|artifacts|dist)(?:\/|$)/u.test(path));
const landing = await readFile(join(outputRoot, "index.html"), "utf8");
const portrait = checks.find(({ path }) => path === "public/assets/kilnkeeper-portrait-painted.webp");
const audit = {
  candidateCommit: "b8c70ba5325d53e2f376ce3108c3a87a6ccb9e92",
  sourceCommit: "7f2c978309d792059fdd09586ca8fbefc155a69c",
  baseCommit: "ddaf00e64eab6e1d314163fc5212b19f4398c8fd",
  pagesBuild: {
    repository: "ThatXliner/clash-royale-clone",
    ref: "main",
    projectSubpath: "/clash-royale-clone/",
    outputFiles: outputFiles.length,
    forbiddenPaths,
    relativeGameLink: landing.includes('href="./game/public/index.html"'),
    repositoryLink: landing.includes("https://github.com/ThatXliner/clash-royale-clone"),
    sourceLink: landing.includes("https://github.com/ThatXliner/clash-royale-clone/blob/main/src/rl/environment.js"),
  },
  release: {
    declaredFileCount: manifest.fileCount,
    listedFileCount: manifest.files.length,
    totalBytes: manifest.totalBytes,
    manifestSha256: sha256(manifestBytes),
    allFilesMatchSizeAndSha256: checks.every(({ matches }) => matches),
    forbiddenReleasePaths: manifest.files.map(({ path }) => path)
      .filter((path) => /(?:^|\/)(?:reference|tests|artifacts|dist)(?:\/|$)/u.test(path)),
    portrait,
    files: checks,
  },
};
assert.equal(manifest.fileCount, 51);
assert.equal(manifest.files.length, 51);
assert.equal(audit.release.allFilesMatchSizeAndSha256, true);
assert.deepEqual(audit.release.forbiddenReleasePaths, []);
assert.deepEqual(forbiddenPaths, []);
assert.equal(audit.pagesBuild.relativeGameLink, true);
assert.equal(audit.pagesBuild.repositoryLink, true);
assert.equal(audit.pagesBuild.sourceLink, true);
assert.equal(portrait?.expectedSize, 65626);
assert.equal(portrait?.expectedSha256, "38e9f64348fa823a64755fda2496b699c88c27c7dd0a14a440e704d9093d2240");
await import("node:fs/promises").then(({ writeFile }) =>
  writeFile(join(here, "pages-integrity-audit.json"), `${JSON.stringify(audit, null, 2)}\n`));
process.stdout.write(`51/51 release files match manifest size and SHA-256; Pages output excludes protected paths. Manifest SHA-256: ${audit.release.manifestSha256}\n`);
