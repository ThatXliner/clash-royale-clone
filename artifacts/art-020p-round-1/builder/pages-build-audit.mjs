import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPages } from "../../../scripts/build-pages.js";

const repositoryRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const evidenceDirectory = fileURLToPath(new URL(".", import.meta.url));
const tempRoot = await mkdtemp(join(tmpdir(), "art020p-pages-"));
const output = join(tempRoot, "artifact");

async function listFiles(root, prefix = "") {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(root, path));
    else files.push(path);
  }
  return files.toSorted();
}

try {
  const result = await buildPages({
    output,
    repository: "ThatXliner/clash-royale-clone",
    ref: "art-020p-portrait-stage",
  });
  const releaseManifest = JSON.parse(await readFile(join(output, "game/release-manifest.json"), "utf8"));
  const releaseAsset = releaseManifest.files.find(({ path }) =>
    path === "public/assets/rivet-runners-portrait-painted.webp");
  assert.ok(releaseAsset, "Pages release includes the new public portrait");
  const sourceBytes = await readFile(join(repositoryRoot, "public/assets/rivet-runners-portrait-painted.webp"));
  const sourceHash = createHash("sha256").update(sourceBytes).digest("hex");
  assert.equal(releaseAsset.size, sourceBytes.length);
  assert.equal(releaseAsset.sha256, sourceHash);
  assert.deepEqual(
    await readFile(join(output, "game/public/assets/rivet-runners-portrait-painted.webp")),
    sourceBytes,
    "Pages output preserves the portrait bytes",
  );

  const files = await listFiles(output);
  const forbiddenPaths = files.filter((path) =>
    /(?:^|\/)(?:reference|tests|artifacts|dist|demo)(?:\/|$)/u.test(path));
  assert.deepEqual(forbiddenPaths, [], "Pages output excludes source-only and verification directories");
  const evidence = {
    command: "buildPages({ output: external temporary directory, repository: ThatXliner/clash-royale-clone, ref: art-020p-portrait-stage })",
    result: {
      outputWasExternalTemporaryDirectory: true,
      fileCount: result.fileCount,
      releaseBytes: result.releaseBytes,
      browserQualification: result.browserQualification,
    },
    outputTopLevel: (await readdir(output)).toSorted(),
    emittedPortrait: {
      path: "game/public/assets/rivet-runners-portrait-painted.webp",
      size: releaseAsset.size,
      sha256: releaseAsset.sha256,
      byteForByteMatch: true,
    },
    excludedPathPatterns: ["reference", "tests", "artifacts", "dist", "demo"],
    forbiddenOutputPaths: forbiddenPaths,
    totalPagesFiles: files.length,
  };
  await writeFile(
    join(evidenceDirectory, "pages-build-exclusion.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
