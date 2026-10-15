import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const parent = "3e0734ef95c5cd5b926e9289e5588a020fc0e752";
const baselineSource = execFileSync("git", ["show", `${parent}:src/content/visual-asset-manifest.js`], { encoding: "utf8" });
const baselineModule = await import(`data:text/javascript;base64,${Buffer.from(baselineSource).toString("base64")}`);
const currentModule = await import(new URL("../../../../src/content/visual-asset-manifest.js", import.meta.url));
const previousAssets = baselineModule.createVisualAssetManifest().assets;
const currentAssets = currentModule.createVisualAssetManifest().assets;
assert.equal(currentAssets.length, previousAssets.length + 1);
assert.deepEqual(currentAssets.slice(0, previousAssets.length), previousAssets);
const additions = currentAssets.slice(previousAssets.length);
assert.deepEqual(additions.map(({ id }) => id), ["brackenwheel-portrait-painted"]);
const summary = {
  parent,
  candidate: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  previousAssetCount: previousAssets.length,
  currentAssetCount: currentAssets.length,
  addedEntries: additions.map(({ id, path, byteLength, dimensions, sha256 }) => ({ id, path, byteLength, dimensions, sha256 })),
  priorRecordsByteEquivalent: true,
  candidateManifestSha256: createHash("sha256").update(readFileSync(resolve("src/content/visual-asset-manifest.js"))).digest("hex"),
};
writeFileSync(new URL("./manifest-compare.json", import.meta.url), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
