import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const [baselineDir, candidateDir, evidenceDir] = process.argv.slice(2);
if (!baselineDir || !candidateDir || !evidenceDir) {
  throw new Error("usage: node continuity-probe.mjs BASELINE_WORKTREE CANDIDATE_WORKTREE EVIDENCE_DIR");
}

const baselineCommit = "09b0f9c741f4f2860785b18ab7b82002fd623426";
const candidateCommit = "796708ef622a0292cdd71fa4cf0a81c9af48b3b1";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const pathsAt = (cwd, rev) => git(cwd, "ls-tree", "-r", "--name-only", rev)
  .split("\n").filter(Boolean).sort();
const fileHash = (cwd, path) => hash(readFileSync(join(cwd, path)));
const listDigest = (records) => hash(records.map(({ path, sha256 }) => `${path}\0${sha256}\n`).join(""));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(git(baselineDir, "rev-parse", "HEAD") === baselineCommit, "baseline worktree is not the frozen round-one candidate");
assert(git(candidateDir, "rev-parse", "HEAD") === candidateCommit, "candidate worktree is not the frozen round-two candidate");

const baselinePaths = pathsAt(baselineDir, baselineCommit);
const candidatePaths = pathsAt(candidateDir, candidateCommit);
const sourceAndAsset = (path) => /^(src|public|demo)\//u.test(path);
const scriptPath = (path) => path.startsWith("scripts/");
const testPath = (path) => path.startsWith("tests/");
const compareGroup = (name, predicate) => {
  const leftPaths = baselinePaths.filter(predicate);
  const rightPaths = candidatePaths.filter(predicate);
  const samePathSet = JSON.stringify(leftPaths) === JSON.stringify(rightPaths);
  const records = leftPaths.map((path) => ({
    path,
    baselineSha256: fileHash(baselineDir, path),
    candidateSha256: fileHash(candidateDir, path),
  }));
  const mismatches = records.filter(({ baselineSha256, candidateSha256 }) => baselineSha256 !== candidateSha256);
  const baselineRecords = records.map(({ path, baselineSha256 }) => ({ path, sha256: baselineSha256 }));
  const candidateRecords = records.map(({ path, candidateSha256 }) => ({ path, sha256: candidateSha256 }));
  return {
    name,
    baselineFileCount: leftPaths.length,
    candidateFileCount: rightPaths.length,
    samePathSet,
    allHashesEqual: samePathSet && mismatches.length === 0,
    baselineManifestSha256: listDigest(baselineRecords),
    candidateManifestSha256: listDigest(candidateRecords),
    mismatches,
    files: records.map(({ path, baselineSha256, candidateSha256 }) => ({
      path, sha256: candidateSha256, equalToRoundOne: baselineSha256 === candidateSha256,
    })),
  };
};

const runtimeAssets = compareGroup("runtime and shipped assets", sourceAndAsset);
const scripts = compareGroup("scripts", scriptPath);
const allTests = compareGroup("test files", testPath);
const changedTestPaths = allTests.mismatches.map(({ path }) => path);
assert(runtimeAssets.allHashesEqual, "runtime or asset hashes changed between candidates");
assert(scripts.allHashesEqual, "script hashes changed between candidates");
assert(JSON.stringify(changedTestPaths) === JSON.stringify(["tests/game-roster-troops-ordinary.test.js"]),
  `unexpected test inputs changed: ${changedTestPaths.join(", ")}`);

const preflightInputs = [
  "package.json",
  "tests/app-shell.test.js",
  "tests/cards016-stagger.test.js",
  "tests/cards016-integration.test.js",
  "tests/game-roster-troops-air-swarms.test.js",
  "tests/editable-deck-runner.js",
  "tests/rl-environment-runner.js",
  "tests/nondeterminism-guard-runner.js",
  "tests/shipping-isolation-guard-runner.js",
  "scripts/nondeterminism-guard.js",
  "scripts/shipping-isolation-guard.js",
];
const preflightHarnesses = preflightInputs.map((path) => {
  const baselineSha256 = fileHash(baselineDir, path);
  const candidateSha256 = fileHash(candidateDir, path);
  return { path, baselineSha256, candidateSha256, unchanged: baselineSha256 === candidateSha256 };
});
assert(preflightHarnesses.every(({ unchanged }) => unchanged), "a prior preflight harness changed");

const tapCounts = (path) => {
  const text = readFileSync(join(evidenceDir, path), "utf8");
  const find = (field) => {
    const match = text.match(new RegExp(`^# ${field} (\\d+)$`, "mu"));
    return match ? Number(match[1]) : null;
  };
  const tests = find("tests");
  const pass = find("pass");
  const fail = find("fail");
  assert(tests !== null && pass !== null && fail !== null, `missing TAP summary in ${path}`);
  return { path, tests, pass, fail };
};
const priorReceipts = [
  "artifacts/cards016-stagger-round-1/critic/focused.tap",
  "artifacts/cards016-stagger-round-1/critic/editable-deck.tap",
  "artifacts/cards016-stagger-round-1/critic/rl-environment.tap",
  "artifacts/cards016-stagger-round-1/critic/nondeterminism-guard.tap",
  "artifacts/cards016-stagger-round-1/critic/shipping-isolation-guard.tap",
  "artifacts/cards016-stagger-round-1/critic/app-shell-redirected.tap",
];
const retainedGateReceipts = priorReceipts.map((path) => {
  const counts = tapCounts(path);
  return { ...counts, receiptSha256: hash(readFileSync(join(evidenceDir, path))) };
});
const retainedPassingTestCount = retainedGateReceipts.reduce((sum, { pass }) => sum + pass, 0);
assert(retainedPassingTestCount === 61, `round-one receipts total ${retainedPassingTestCount}, expected 61`);
assert(retainedGateReceipts.every(({ tests, pass, fail }) => tests === pass && fail === 0),
  "a prior requested preflight receipt is not wholly passing");

const roundOneRoot = join(evidenceDir, "artifacts/cards016-stagger-round-1/critic");
const defaultComparison = JSON.parse(readFileSync(join(roundOneRoot, "default-session-comparison.json"), "utf8"));
assert(defaultComparison.comparisons.length === 6, "expected six serialized default-eight comparisons");
assert(defaultComparison.comparisons.every(({ fullSerializedBytesEqual }) => fullSerializedBytesEqual),
  "a default-eight serialized snapshot comparison differs");
const snapshotArtifacts = defaultComparison.comparisons.flatMap(({ seed, tick }) => [
  `snapshots/baseline-seed-${seed}-tick-${tick}.json`,
  `snapshots/candidate-seed-${seed}-tick-${tick}.json`,
]).map((relativePath) => {
  const path = join(roundOneRoot, relativePath);
  return { path: relativePath, bytes: statSync(path).size, sha256: hash(readFileSync(path)) };
});

const kernelPath = "src/sim/battle-continuation-kernel.js";
const kernelBytes = statSync(join(candidateDir, kernelPath)).size;
const kernelBaselineSha256 = fileHash(baselineDir, kernelPath);
const kernelCandidateSha256 = fileHash(candidateDir, kernelPath);
assert(kernelBytes === 524275, `kernel size is ${kernelBytes}, expected 524275 bytes`);
assert(kernelBaselineSha256 === kernelCandidateSha256, "continuation kernel changed between candidates");
const guardSource = readFileSync(join(candidateDir, "scripts/nondeterminism-guard.js"), "utf8");
assert(guardSource.includes("maxSourceBytes: 512 * 1024"), "source-size cap declaration changed");

const roundTwoTaps = [
  "artifacts/cards016-stagger-round-2/critic/ordinary-roster.tap",
  "artifacts/cards016-stagger-round-2/critic/focused-stagger-air-integration.tap",
].map((path) => {
  const counts = tapCounts(path);
  return { ...counts, receiptSha256: hash(readFileSync(join(evidenceDir, path))) };
});
assert(roundTwoTaps.every(({ tests, pass, fail }) => tests === 16 && pass === 16 && fail === 0),
  "round-two ordinary or focused suite failed its 16/16 gate");

const report = {
  candidateCommit: candidateCommit,
  roundOneCandidateCommit: baselineCommit,
  frozenWorktrees: { baselineDir, candidateDir },
  runtimeAndAssetContinuity: runtimeAssets,
  scriptContinuity: scripts,
  testInputContinuity: {
    baselineFileCount: allTests.baselineFileCount,
    candidateFileCount: allTests.candidateFileCount,
    unchangedFileCount: allTests.baselineFileCount - changedTestPaths.length,
    onlyChangedTestFile: changedTestPaths,
    changedTestHashes: allTests.mismatches,
    unchangedFilesManifestSha256: hash(allTests.files
      .filter(({ path }) => !changedTestPaths.includes(path))
      .map(({ path, sha256 }) => `${path}\0${sha256}\n`).join("")),
    roundTwoPreflightHarnesses: preflightHarnesses,
  },
  retainedRoundOnePreflight: {
    requestedPassingTests: retainedPassingTestCount,
    retainedByContinuity: true,
    rerunOrResummed: false,
    receipts: retainedGateReceipts,
  },
  defaultEightSnapshotContinuity: {
    comparisons: defaultComparison.comparisons,
    comparisonReceiptSha256: hash(readFileSync(join(roundOneRoot, "default-session-comparison.json"))),
    serializedSnapshotArtifacts: snapshotArtifacts,
    allSixSerializedComparisonsMatch: true,
  },
  unchangedKernelSourceCap: {
    path: kernelPath,
    sourceBytes: kernelBytes,
    configuredCapBytes: 512 * 1024,
    bytesBelowCap: 512 * 1024 - kernelBytes,
    baselineSha256: kernelBaselineSha256,
    candidateSha256: kernelCandidateSha256,
  },
  roundTwoActualRuns: roundTwoTaps,
  notRun: ["fresh app-shell/browser run", "fresh RL suite", "18,000-tick full run"],
  result: "round-two code changes are confined to the ordinary troop test and evidence/docs; previous requested preflight receipts and six full default-eight serialization comparisons remain valid by content continuity",
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
