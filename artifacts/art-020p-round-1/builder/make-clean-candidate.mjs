import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const outputDirectory = fileURLToPath(new URL(".", import.meta.url));
const patchPath = join(outputDirectory, "own-product.patch");
const expectedFiles = [
  "demo/assets/rivet-runners-portrait.png",
  "docs/art/rivet-runners-portrait-provenance.json",
  "public/assets/rivet-runners-portrait-painted.webp",
  "src/content/visual-asset-manifest.js",
];
const temporaryDirectory = await mkdtemp(join(tmpdir(), "art020p-index-"));
const indexPath = join(temporaryDirectory, "index");
const checkIndexPath = join(temporaryDirectory, "check-index");

function gitAtIndex(args, privateIndexPath) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_INDEX_FILE: privateIndexPath },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${result.status}): ${result.stderr}`);
  }
  return result.stdout;
}

function git(args) {
  return gitAtIndex(args, indexPath);
}

try {
  const baseCommit = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).stdout.trim();
  git(["read-tree", "HEAD"]);
  git(["add", "--", ...expectedFiles]);
  const files = git(["diff", "--cached", "--name-only", "--"]).trim().split("\n").filter(Boolean);
  assert.deepEqual(files, expectedFiles, "candidate contains only the four authorized product paths");
  const manifestDiff = git([
    "--no-pager", "-c", "diff.external=", "diff", "--cached",
    "--no-ext-diff", "--no-textconv", "--no-color", "--unified=0",
    "--", "src/content/visual-asset-manifest.js",
  ]);
  const manifestAdded = manifestDiff.split(/\r?\n/u).filter((line) =>
    line.startsWith("+") && !line.startsWith("+++"));
  const manifestRemoved = manifestDiff.split(/\r?\n/u).filter((line) =>
    line.startsWith("-") && !line.startsWith("---"));
  assert.equal(manifestAdded.length, 11, "candidate manifest delta is one complete asset record");
  assert.equal(manifestRemoved.length, 0, "candidate manifest delta has no removals");
  assert.equal(
    (manifestDiff.match(/^\+\s+id: "rivet-runners-portrait-painted",$/gmu) ?? []).length,
    1,
    "candidate manifest delta contains the new portrait id once",
  );
  const patchText = git([
    "--no-pager", "-c", "diff.external=", "diff", "--cached", "--binary",
    "--no-ext-diff", "--no-textconv", "--no-color", "--",
  ]);
  await writeFile(patchPath, patchText);
  gitAtIndex(["read-tree", "HEAD"], checkIndexPath);
  gitAtIndex(["apply", "--cached", "--check", patchPath], checkIndexPath);
  gitAtIndex(["apply", "--cached", patchPath], checkIndexPath);
  const verifiedFiles = gitAtIndex(["diff", "--cached", "--name-only", "--"], checkIndexPath)
    .trim().split("\n").filter(Boolean);
  assert.deepEqual(verifiedFiles, expectedFiles, "candidate patch applies cleanly to its recorded base");
  const receipt = {
    baseCommit,
    candidatePaths: files,
    manifestAddedLines: manifestAdded.length,
    manifestRemovedLines: manifestRemoved.length,
    manifestRecordId: "rivet-runners-portrait-painted",
    patch: "artifacts/art-020p-round-1/builder/own-product.patch",
    patchByteLength: Buffer.byteLength(patchText),
    patchSha256: createHash("sha256").update(patchText).digest("hex"),
    patchAppliesToBase: true,
    sharedIndexTouched: false,
  };
  await writeFile(join(outputDirectory, "own-candidate-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
