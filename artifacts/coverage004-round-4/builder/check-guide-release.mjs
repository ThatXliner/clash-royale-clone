import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EDITABLE_DECK_CARD_IDS, EDITABLE_MIXED_DECK_CARD_IDS } from "../../../src/content/editable-deck.js";
import { PLAYABLE_CARD_IDS } from "../../../src/content/playable-roster.js";
import { createSessionCardManifest } from "../../../src/content/session-card-catalog.js";
import { createSessionTroopProfileManifest } from "../../../src/content/session-troop-profile-catalog.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const guidePath = resolve(root, "docs/completion-inventory.md");
const guide = readFileSync(guidePath, "utf8");
const freeze = readJson("artifacts/coverage004-round-4/builder/candidate-freeze.json");
const release = readJson("artifacts/coverage004-round-4/builder/live-release-evidence.json");
const workflow = readJson("artifacts/coverage004-round-4/builder/github-workflow-38510398827.json");

const localLinks = [...guide.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)]
  .map((match) => match[1])
  .filter((target) => !/^https?:\/\//u.test(target))
  .map((target) => target.split("#", 1)[0])
  .filter(Boolean);
const missingLinks = localLinks.filter((target) =>
  !exists(resolve(dirname(guidePath), decodeURIComponent(target))));
function exists(path) {
  try { lstatSync(path); return true; } catch { return false; }
}
assert.deepEqual(missingLinks, [], "all local completion-guide links must resolve");
assert(!/\b(?:20th|twentieth)\b/iu.test(guide),
  "the guide must report collection size without calling it a display ordinal");

const mapping = readJson("artifacts/completion-inventory-current-18/card-coverage-109-current-18.json");
assert.equal(mapping.historicalRows.length, 109);
assert.deepEqual(mapping.counts.historicalTypes, { troop: 78, building: 13, spell: 18 });
assert.equal(mapping.currentEditableCards.length, 18);
assert.deepEqual(mapping.counts.editableCurrentKinds, { unit: 17, structure: 0, effect: 1 });
assert.equal(mapping.counts.unchangedDefaultDeckIds, 8);
assert.equal(mapping.counts.fullHistoricalCardExecutions, 0);
assert.equal(mapping.counts.historicalParityClaims, 0);

const sessionCards = createSessionCardManifest().counts;
const troopProfiles = createSessionTroopProfileManifest().counts;
assert.deepEqual(sessionCards, {
  admittedIds: 56,
  admittedOccurrences: 61,
  claimedIds: 62,
  claimedOccurrences: 67,
  excludedClaimedIds: 6,
  excludedClaimedOccurrences: 6,
  questionOnlyExports: 5,
});
assert.deepEqual(troopProfiles, {
  admittedIds: 40,
  admittedOccurrences: 42,
  claimedIds: 42,
  claimedOccurrences: 44,
  duplicateCompositionIds: 2,
  questionIds: 2,
  questionOccurrences: 2,
});
assert.equal(EDITABLE_DECK_CARD_IDS.length, 18);
assert.equal(EDITABLE_MIXED_DECK_CARD_IDS.length, 20);
assert.equal(PLAYABLE_CARD_IDS.length, 8);

const releaseCommit = "bf1e6120196db8a2927ce6ae893812e4c9b1115d";
assert.equal(freeze.sourceSnapshot.commit, releaseCommit);
assert.equal(freeze.sourceSnapshot.tree, "a306815db49583c41059dc19b37628aa5cb8c7a7");
assert.equal(freeze.immutableArchiveCheck.candidateMustBeBuiltFrom, releaseCommit);
assert.equal(freeze.externalReleaseSnapshot.commit, releaseCommit);
assert.equal(freeze.externalReleaseSnapshot.ref, "main");
assert.equal(freeze.externalReleaseSnapshot.workflowRun, 38510398827);
assert.equal(freeze.externalReleaseSnapshot.capturedAtUtc, release.capturedAtUtc);
assert.equal(release.release.ref, "main");
assert.equal(release.release.commit, releaseCommit);
assert.equal(release.release.workflow.status, "completed");
assert.equal(release.release.workflow.conclusion, "success");
assert.equal(workflow.databaseId, 38510398827);
assert.equal(workflow.headBranch, "main");
assert.equal(workflow.headSha, releaseCommit);
assert.equal(workflow.status, "completed");
assert.equal(workflow.conclusion, "success");
assert.equal(workflow.workflowName, "Publish GitHub Pages");
assert.equal(workflow.jobs.length, 2);
assert.deepEqual(workflow.jobs.map(({ name }) => name).sort(), ["build", "deploy"]);
assert(workflow.jobs.every(({ status, conclusion, steps }) =>
  status === "completed" && conclusion === "success" &&
  steps.every(({ status: stepStatus, conclusion: stepConclusion }) =>
    stepStatus === "completed" && stepConclusion === "success")));
assert.equal(release.live.landing.status, 200);
assert.equal(release.live.landing.containsFullReleaseCommit, true);
assert.equal(release.live.game.status, 200);
assert.equal(release.live.kilnkeeperPortrait.status, 200);
assert.equal(release.live.kilnkeeperPortrait.bytes, 65_626);
assert.equal(release.live.kilnkeeperPortrait.sha256,
  "38e9f64348fa823a64755fda2496b699c88c27c7dd0a14a440e704d9093d2240");
assert.equal(release.live.kilnkeeperPortrait.sha256,
  sha256(readFileSync(resolve(root, "public/assets/kilnkeeper-portrait-painted.webp"))));

const reviewSnapshot = freeze.reviewSnapshot;
assert.equal(reviewSnapshot["CARDS-019H1"].status, "PASS");
assert.equal(reviewSnapshot["CARDS-019H2"].status, "QUESTION");
assert.equal(reviewSnapshot["CARDS-019D"].status, "PASS");
assert.equal(reviewSnapshot["APP-004G"].status, "PASS");
assert.equal(reviewSnapshot["CARDS-019I"].status, "unaccepted");
assert.equal(reviewSnapshot["CARDS-019I"].candidate,
  "32c31da5269391cc0f6766cfacc0c78f0982fa5d");

const priorManifestPath = "artifacts/coverage004-round-4/builder/preserved-prior-evidence.sha256";
const manifest = readFileSync(resolve(root, priorManifestPath), "utf8");
const savedHashes = new Map();
for (const line of manifest.trimEnd().split(/\r?\n/u)) {
  const match = line.match(/^([0-9a-f]{64})  (.+)$/u);
  assert(match, `invalid prior evidence hash row: ${line}`);
  assert(!savedHashes.has(match[2]), `duplicate prior evidence path: ${match[2]}`);
  savedHashes.set(match[2], match[1]);
}
function filesUnder(path) {
  const absolute = resolve(root, path);
  return readdirSync(absolute).flatMap((name) => {
    const relative = `${path}/${name}`;
    const entry = lstatSync(resolve(root, relative));
    assert(!entry.isSymbolicLink(), `unexpected symlink in prior evidence: ${relative}`);
    return entry.isDirectory() ? filesUnder(relative) : [relative];
  });
}
const priorPaths = [1, 2, 3].flatMap((round) => filesUnder(`artifacts/coverage004-round-${round}`)).sort();
assert.deepEqual([...savedHashes.keys()].sort(), priorPaths,
  "preservation manifest must cover every prior COVERAGE-004 round file exactly once");
const changedPriorEvidence = priorPaths.filter((path) =>
  sha256(readFileSync(resolve(root, path))) !== savedHashes.get(path));
assert.deepEqual(changedPriorEvidence, [], "prior COVERAGE-004 evidence bytes must remain unchanged");

const defaultEight = readJson("artifacts/cards-expansion-round-4/core-critic/default8-comparison.json");
assert.equal(defaultEight.exact, true);
assert.equal(defaultEight.snapshots.length, 6);
assert.deepEqual([...new Set(defaultEight.snapshots.map(({ seed }) => seed))].sort((a, b) => a - b), [0, 23]);
assert(defaultEight.snapshots.every(({ tick, exact }) => [0, 120, 900].includes(tick) && exact));
const endurance = readJson("artifacts/game001gpr6-round-1/critic/full-browser-evidence.json");
assert.equal(endurance.candidateCommit, "9f64011378d3ce1c6281d9292950a7b52f11fd2c");
assert.equal(endurance.result.deckSize, 8);
assert.equal(endurance.result.segments, 67);
assert.equal(endurance.result.terminalTick, 18000);
assert.equal(endurance.result.serializedTranscriptEventCountsAtTerminal.pause, 1);
assert.equal(endurance.result.serializedTranscriptEventCountsAtTerminal.resume, 1);
const releaseTestPass = readFileSync(resolve(root, "artifacts/release-test-round-2/critic/verdict.md"), "utf8");
const releaseTestHistory = readFileSync(resolve(root, "artifacts/release-test-round-1/critic/verdict.md"), "utf8");
assert(releaseTestPass.includes("VERDICT: PASS") && releaseTestPass.includes("28/28") && releaseTestPass.includes("5/5"));
assert(releaseTestHistory.includes("VERDICT: FAIL"));

for (const phrase of [
  releaseCommit,
  "109 identities: 78 troops, 13 buildings, 18 spells",
  "18 editable IDs",
  "zero full historical card executions",
  "zero historical parity claims",
  "20 choices: 18 troop IDs, Squall Orb, and Ember Basin",
  "56 admitted IDs / 61 admitted occurrences",
  "40 admitted IDs / 42 admitted occurrences",
  "CARDS-019D passed round 443",
  "APP-004G passed round 444",
  "CARDS-019H1 passed round 439",
  reviewSnapshot["CARDS-019I"].candidate,
  "remains unaccepted in independent review",
  "workflow `38510398827` completed successfully",
  "65,626 bytes",
  "does not establish endurance for the current `bf1e612` runtime",
  "The comparison corpus and its historical names and keys remain outside runtime imports, release builds, and the Pages site",
]) {
  assert(guide.includes(phrase), `guide must retain the pinned claim: ${phrase}`);
}

const receipt = {
  sourceSnapshot: {
    commit: freeze.sourceSnapshot.commit,
    tree: freeze.sourceSnapshot.tree,
  },
  guide: {
    sha256: sha256(Buffer.from(guide)),
    localMarkdownLinksChecked: localLinks.length,
    localMarkdownLinksMissing: missingLinks.length,
    displayOrdinalClaimed: false,
  },
  historicalScope: {
    targetRows: mapping.historicalRows.length,
    types: mapping.counts.historicalTypes,
    frozenEditableIds: mapping.currentEditableCards.length,
    fullHistoricalExecutions: mapping.counts.fullHistoricalCardExecutions,
    historicalParityClaims: mapping.counts.historicalParityClaims,
  },
  currentCollection: {
    editableTroopIds: EDITABLE_DECK_CARD_IDS.length,
    mixedCollectionChoices: EDITABLE_MIXED_DECK_CARD_IDS.length,
    defaultDeckIds: PLAYABLE_CARD_IDS.length,
  },
  generatedCatalogs: { sessionCards, troopProfiles },
  reviewSnapshot: {
    h1: reviewSnapshot["CARDS-019H1"].status,
    h2: reviewSnapshot["CARDS-019H2"].status,
    collectionPresentation: reviewSnapshot["CARDS-019D"].status,
    appPolish: reviewSnapshot["APP-004G"].status,
    arenaCandidate: reviewSnapshot["CARDS-019I"].candidate,
    arenaAccepted: false,
  },
  publicRelease: {
    ref: release.release.ref,
    commit: release.release.commit,
    workflowRun: release.release.workflow.runId,
    workflowConclusion: release.release.workflow.conclusion,
    capturedAtUtc: release.capturedAtUtc,
    landingStatus: release.live.landing.status,
    landingContainsFullCommit: release.live.landing.containsFullReleaseCommit,
    gameStatus: release.live.game.status,
    portraitStatus: release.live.kilnkeeperPortrait.status,
    portraitBytes: release.live.kilnkeeperPortrait.bytes,
    portraitSha256: release.live.kilnkeeperPortrait.sha256,
  },
  priorCoverage004Evidence: {
    filesChecked: priorPaths.length,
    changedFiles: changedPriorEvidence.length,
  },
  olderRuntimeEvidence: {
    defaultEightExactSnapshots: defaultEight.snapshots.length,
    enduranceCandidate: endurance.candidateCommit,
    enduranceTicks: endurance.result.terminalTick,
    enduranceSegments: endurance.result.segments,
    appliesToCurrentRuntime: false,
  },
  sourceIsolation: {
    successor: "PASS 28/28 + Pages 5/5",
    olderFailureRetained: true,
  },
};
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
