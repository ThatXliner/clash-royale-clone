import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [checkoutArg, archiveRootArg, artifactArg] = process.argv.slice(2);
const checkout = resolve(checkoutArg);
const archiveRoot = resolve(archiveRootArg);
const artifact = resolve(artifactArg);
const candidate = "d20938f";
const baseline = "a142ec8";
const git = (...args) => execFileSync("git", ["-C", checkout, ...args], { encoding: "utf8" }).trim();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const changed = git("diff", "--name-only", `${baseline}..${candidate}`).split("\n").filter(Boolean);
const expectedChanged = [
  "artifacts/cards018-core-round-1/builder/evidence.md",
  "src/content/editable-deck.js",
  "src/rl/environment.js",
  "tests/editable-deck.test.js",
  "tests/game-building-policy.test.js",
  "tests/game-building-runtime.test.js",
  "tests/game-roster-buildings.test.js",
  "tests/rl-environment.test.js",
];
assert.deepEqual(changed, expectedChanged);
const changedBlobs = changed.map((path) => {
  const expected = git("rev-parse", `${candidate}:${path}`);
  const extracted = execFileSync("git", ["-C", checkout, "hash-object", join(archiveRoot, path)],
    { encoding: "utf8" }).trim();
  assert.equal(extracted, expected, `extracted archive blob mismatch: ${path}`);
  const bytes = readFileSync(join(archiveRoot, path));
  return { path, gitBlob: expected, extractedGitBlob: extracted, sha256: sha256(bytes), bytes: bytes.length };
});

const blobRecords = execFileSync("git", ["-C", checkout, "ls-tree", "-r", "-z", candidate]);
const blobManifestLines = [];
for (const record of blobRecords.toString("utf8").split("\0").filter(Boolean)) {
  const separator = record.indexOf("\t");
  const [mode, type, expected] = record.slice(0, separator).split(" ");
  const path = record.slice(separator + 1);
  assert.equal(type, "blob", `non-blob tree entry: ${path}`);
  const fullPath = join(archiveRoot, path);
  const bytes = mode === "120000" ? Buffer.from(readlinkSync(fullPath)) : readFileSync(fullPath);
  const extracted = createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex");
  assert.equal(extracted, expected, `extracted archive blob mismatch: ${path}`);
  assert.ok(!path.includes("\t") && !path.includes("\n"), `manifest path needs escaping: ${path}`);
  blobManifestLines.push(`${path}\t${mode}\t${expected}\t${sha256(bytes)}`);
}
const blobManifestPath = join(artifact, "d20938f-blobs.tsv");
const blobManifestBytes = Buffer.from(`${blobManifestLines.join("\n")}\n`);
writeFileSync(blobManifestPath, blobManifestBytes);

const archivePath = "/tmp/cards018k-d20938f.tar";
const archiveBytes = readFileSync(archivePath);
const archiveHash = sha256(archiveBytes);
const tree = git("rev-parse", `${candidate}^{tree}`);
const parentTree = git("rev-parse", `${baseline}^{tree}`);
const diffChangedSourcePaths = changed.filter((path) => path.startsWith("src/") || path.startsWith("reference/"));
assert.ok(!changed.some((path) => path.startsWith("src/sim/")), "simulation authority source changed");
assert.ok(!changed.some((path) => path.startsWith("reference/stats/")), "reference source changed");
assert.ok(!changed.includes("src/content/session-card-catalog.js"), "session-card catalog changed");
assert.ok(!changed.includes("src/content/cards/buildings-defensive.js"), "defensive source catalog changed");

const tapNames = [
  "editable-deck", "rl-environment", "game-building-runtime", "game-roster-buildings",
  "game-building-policy", "nondeterminism-guard", "shipping-isolation-guard",
];
const taps = tapNames.map((name) => {
  const path = join(artifact, `${name}.tap`);
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");
  const count = Number(text.match(/^# tests (\d+)$/m)?.[1]);
  const pass = Number(text.match(/^# pass (\d+)$/m)?.[1]);
  const fail = Number(text.match(/^# fail (\d+)$/m)?.[1]);
  assert.ok(Number.isSafeInteger(count) && count > 0 && pass === count && fail === 0, `${name} TAP not clean`);
  return { name, tests: count, pass, fail, sha256: sha256(bytes), bytes: bytes.length };
});

const baselineComparisonPath = join(artifact, "default8-byte-comparison.json");
const baselineComparisonBytes = readFileSync(baselineComparisonPath);
const baselineComparison = JSON.parse(baselineComparisonBytes);
assert.equal(baselineComparison.baseline, baseline);
assert.equal(baselineComparison.candidate, candidate);
assert.ok(baselineComparison.results.every(({ fields }) =>
  Object.values(fields).every(({ exactBytesEqual }) => exactBytesEqual)));

const probesPath = join(artifact, "critic-probes.json");
const probesBytes = readFileSync(probesPath);
const probes = JSON.parse(probesBytes);
assert.equal(probes.briarQuestionClosure.sourceRecords, 20);
assert.equal(probes.briarQuestionClosure.setupRecords, 20);
assert.ok(probes.hostileProvenance.every(({ rejected }) => rejected));
assert.deepEqual(probes.liveSplash.pendingContactsAtTick127.map(({ targetId }) => targetId), [3, 4, 5]);
assert.equal(probes.deadStructureObservation.alive, false);

const candidateRoot = archiveRoot;
const { createSessionCardManifest } = await import(pathToFileURL(join(candidateRoot,
  "src/content/session-card-catalog.js")));
const manifest = createSessionCardManifest();
assert.deepEqual(manifest.counts, {
  admittedIds: 55,
  admittedOccurrences: 60,
  claimedIds: 61,
  claimedOccurrences: 66,
  excludedClaimedIds: 6,
  excludedClaimedOccurrences: 6,
  questionOnlyExports: 5,
});

const docsPath = join(archiveRoot, "docs/rl-api.md");
const docsBytes = readFileSync(docsPath);
const docsText = docsBytes.toString("utf8");
const observationDocs = docsText.match(/An observation is[\s\S]*?\n\n/)[0];
assert.equal(observationDocs.includes("structures"), false);
assert.ok(docsText.includes("version-1 checkpoint"));

const receipt = {
  archive: {
    commit: candidate,
    tree,
    tar: archivePath,
    tarBytes: archiveBytes.length,
    tarSha256: archiveHash,
    trackedBlobsVerified: blobManifestLines.length,
    allImportedTrackedBlobsMatch: true,
    blobManifest: "d20938f-blobs.tsv",
    blobManifestSha256: sha256(blobManifestBytes),
    changedBlobs,
  },
  baseline: {
    commit: baseline,
    tree: parentTree,
    comparedActualBytes: true,
    seeds: baselineComparison.results,
    jsonSha256: sha256(baselineComparisonBytes),
  },
  focusedAndGuardChecks: taps,
  probes: {
    path: "critic-probes.json",
    sha256: sha256(probesBytes),
    briarQuestionRecords: 20,
    hostileProvenanceCasesRejected: probes.hostileProvenance.length,
    liveSplashAtTick120: {
      hp: probes.liveSplash.hp,
      maxHitpoints: probes.liveSplash.maxHitpoints,
      incomingDamage: probes.liveSplash.damageEvent.amountApplied,
      attackTarget: probes.liveSplash.tick127AttackState.targetId,
      splashTargetIds: probes.liveSplash.pendingContactsAtTick127.map(({ targetId }) => targetId),
    },
    deadStructureObserved: probes.deadStructureObservation.alive === false,
  },
  catalogCountsFromRuntimeManifest: manifest.counts,
  apiDocumentationGap: {
    path: "docs/rl-api.md",
    sha256: sha256(docsBytes),
    observationSectionListsStructures: false,
    saysCheckpointVersion1: true,
    candidateExportedVersion: probes.schema.exportedVersion,
    candidateCheckpointVersion: probes.schema.checkpointVersion,
  },
  unchangedAuthority: {
    changedSourcePaths: diffChangedSourcePaths,
    changedSimulationModules: [],
    changedReferenceStats: [],
  },
};
console.log(JSON.stringify(receipt, null, 2));
