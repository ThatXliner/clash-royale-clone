import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const docPath = resolve(root, "docs/completion-inventory.md");
const document = readFileSync(docPath, "utf8");
const localLinks = [...document.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)]
  .map((match) => match[1])
  .filter((target) => !/^https?:\/\//u.test(target))
  .map((target) => target.split("#", 1)[0])
  .filter(Boolean);
const missingLinks = localLinks.filter((target) =>
  !existsSync(resolve(dirname(docPath), decodeURIComponent(target))));
assert.deepEqual(missingLinks, [], "all local completion-guide links must resolve");

const mapping = readJson("artifacts/completion-inventory-current-18/card-coverage-109-current-18.json");
assert.equal(mapping.historicalRows.length, 109);
assert.deepEqual(mapping.counts.historicalTypes, { troop: 78, building: 13, spell: 18 });
assert.equal(mapping.currentEditableCards.length, 18);
assert.deepEqual(mapping.counts.editableCurrentKinds, { unit: 17, structure: 0, effect: 1 });
assert.equal(mapping.counts.unchangedDefaultDeckIds, 8);
assert.equal(mapping.counts.fullHistoricalCardExecutions, 0);
assert.equal(mapping.counts.historicalParityClaims, 0);

const browser = readJson("artifacts/cards018-browser-round-1/builder/candidate-7f8baee/verification/app-shell/browser-evidence.json");
const frozenIds = new Set(mapping.currentEditableCards.map(({ id }) => id));
assert.ok(Array.isArray(browser.editablePoolIds), "pinned CARDS-018I browser evidence must list the editable pool");
const browserIds = new Set(browser.editablePoolIds);
const additions = [...browserIds].filter((id) => !frozenIds.has(id)).sort();
assert.equal(browser.editablePoolIds.length, 19);
assert.equal(browserIds.size, 19);
assert.equal(frozenIds.size, 18);
assert([...frozenIds].every((id) => browserIds.has(id)));
assert.deepEqual(additions, ["ember-basin"]);
assert(browserIds.has("squall-orb"));
assert.equal(browser.result, "passed");

const cards018Verdict = readFileSync(resolve(root, "artifacts/cards018-browser-round-1/critic/verdict.md"), "utf8");
const pinnedTestCommit = cards018Verdict.match(/Candidate `([0-9a-f]{40})`/u)?.[1];
assert.equal(pinnedTestCommit, "7f8baee2922a7eff197f43d1804a526ffacacd22");
const pinnedTestHash = cards018Verdict.match(/Browser integration test SHA-256: `tests\/cards018-browser-integration\.test\.js` `([0-9a-f]{64})`/u)?.[1];
assert.equal(pinnedTestHash, "a66f6d45e99d26b5fbddd2213be4836a4eb417002e432b4b3dfcd08d2e8e36ab");
const pinnedTestSource = readFileSync(resolve(root, "artifacts/coverage004-round-2/builder/cards018-browser-integration.test.js"));
const pinnedTestSourceHash = createHash("sha256").update(pinnedTestSource).digest("hex");
assert.equal(pinnedTestSourceHash, pinnedTestHash, "saved test source must match the independent review's pinned source hash");
const normalizedPinnedTest = pinnedTestSource.toString("utf8").replace(/\s+/gu, " ");
assert(normalizedPinnedTest.includes('assert.equal(await page.locator("[data-card-grid] [data-card-id]").count(), 19, "the released collection visibly contains exactly nineteen cards");'));
const browserTAP = readFileSync(resolve(root, "artifacts/cards018-browser-round-1/critic/browser-integration.tap"), "utf8");
assert.match(browserTAP, /^# tests 1$/mu);
assert.match(browserTAP, /^# pass 1$/mu);
assert.match(browserTAP, /^# fail 0$/mu);
assert.match(browserTAP, /^# cancelled 0$/mu);
const criticBrowserReceipt = readJson("artifacts/cards018-browser-round-1/critic/browser/browser-evidence.json");
assert.ok(Array.isArray(criticBrowserReceipt.deck), "critic browser receipt must report the actual battle deck separately");
assert.equal(criticBrowserReceipt.deck.length, 8, "the reviewed test's battle deck is eight, separate from its 19-card collection assertion");
assert.equal(browser.release.manifestSha256, criticBrowserReceipt.release.manifestSha256);

const currentProbe = readJson("artifacts/cards019i-integration-scope/builder/current-ui-browser-probe.json");
assert.equal(currentProbe.collectionCount, 20);
assert.equal(currentProbe.collectionContainsKilnkeeper, true);
assert.equal(currentProbe.deckReplacementContainsKilnkeeper, true);
assert.equal(currentProbe.detailEvidence.portraitCount, 0);
assert.equal(currentProbe.detailEvidence.loreCount, 0);
assert.deepEqual(currentProbe.loadedKilnkeeperAssets, []);
assert.deepEqual(currentProbe.errors, []);

const liveProbe = readJson("artifacts/coverage004-round-1/critic/live-browser-recheck.json");
assert.equal(liveProbe.http.status, 200);
assert.equal(liveProbe.collection.count, 20);
assert.equal(liveProbe.collection.containsKilnkeeper, true);
assert.ok(liveProbe.detailEvidence && typeof liveProbe.detailEvidence === "object", "live probe must include detail evidence");
assert.equal(liveProbe.detailEvidence.heading, "Kilnkeeper");
assert.equal(liveProbe.detailEvidence.portraitCount, 0);
assert.equal(liveProbe.detailEvidence.loreCount, 0);
assert.deepEqual(liveProbe.errors, []);
const liveEntry = liveProbe.javascriptResponses.find(({ url }) => url.endsWith("index-DL8YB73d.js"));
assert(liveEntry, "live entry bundle response must be present");
assert.equal(liveEntry.status, 200);
assert.equal(liveEntry.sha256, "76dcd24f375ea20dea41742dfcbd0e1c02bf3db9394f48868be687e762159f7b");
const liveScreenshotBytes = readFileSync(resolve(root, "artifacts/coverage004-round-1/critic/live-kilnkeeper-recheck.png"));
assert.equal(createHash("sha256").update(liveScreenshotBytes).digest("hex"), liveProbe.screenshot.sha256);

const catalog = readJson("artifacts/coverage004-round-2/builder/catalog-counts-151f.json");
assert.deepEqual(catalog.counts, {
  admittedIds: 56,
  admittedOccurrences: 61,
  claimedIds: 62,
  claimedOccurrences: 67,
  excludedClaimedIds: 6,
  excludedClaimedOccurrences: 6,
  questionOnlyExports: 5,
});
const audit = readJson("artifacts/cards019k-scope/builder/verification/round432-integration-audit-receipt.json");
assert.equal(audit.covered, 67);
assert.equal(audit.uniqueSupportedIds, 62);
assert.equal(audit.questionOnly, 5);

const endurance = readJson("artifacts/game001gpr6-round-1/critic/full-browser-evidence.json");
assert.equal(endurance.candidateCommit, "9f64011378d3ce1c6281d9292950a7b52f11fd2c");
assert.equal(endurance.result.deckSize, 8);
assert.equal(endurance.result.segments, 67);
assert.equal(endurance.result.terminalTick, 18000);
assert.equal(endurance.result.restoreFromTick, 600);
assert.equal(endurance.result.restoreToTick, 300);
assert.equal(endurance.result.state.restartSessionTick, 0);
assert.equal(endurance.result.longTaskCapsMilliseconds.initialization, 300);
assert.equal(endurance.result.longTaskCapsMilliseconds.nonInitialization, 50);
assert.equal(endurance.result.serializedTranscriptEventCountsAtTerminal.pause, 1);
assert.equal(endurance.result.serializedTranscriptEventCountsAtTerminal.resume, 1);
const defaultEightComparison = readJson("artifacts/cards-expansion-round-4/core-critic/default8-comparison.json");
assert.equal(defaultEightComparison.exact, true);
assert.equal(defaultEightComparison.snapshots.length, 6);
assert.deepEqual([...new Set(defaultEightComparison.snapshots.map(({ seed }) => seed))].sort((a, b) => a - b), [0, 23]);
assert(defaultEightComparison.snapshots.every(({ tick, exact }) => [0, 120, 900].includes(tick) && exact));

const sourceIsolationPass = readFileSync(resolve(root, "artifacts/release-test-round-2/critic/verdict.md"), "utf8");
const sourceIsolationHistory = readFileSync(resolve(root, "artifacts/release-test-round-1/critic/verdict.md"), "utf8");
assert(sourceIsolationPass.includes("VERDICT: PASS"));
assert(sourceIsolationPass.includes("passed 28/28"));
assert(sourceIsolationPass.includes("passed 5/5"));
assert(sourceIsolationHistory.includes("VERDICT: FAIL"));

const live = readJson("artifacts/coverage004-round-1/critic/live-release-recheck.json");
assert.equal(live.main.matchesExpected, true);
assert.equal(live.workflow.status, "completed");
assert.equal(live.workflow.conclusion, "success");
assert(live.workflow.jobs.every(({ status, conclusion }) => status === "completed" && conclusion === "success"));
assert.equal(live.livePages.landing.status, 200);
assert.equal(live.livePages.game.status, 200);

for (const phrase of ["zero full historical card executions", "zero historical parity claims", "do not mean 56 card roles", "one pause and one resume record", "does not establish full-browser endurance for the current public `dbd7afe4` runtime", "20 visible choices does not mean 20 reviewed presentations"]) {
  assert(document.toLowerCase().includes(phrase.toLowerCase()), `guide must preserve claim boundary: ${phrase}`);
}

const receipt = {
  guideSha256: createHash("sha256").update(document).digest("hex"),
  localMarkdownLinks: { checked: localLinks.length, missing: missingLinks.length },
  frozenMapping: {
    historicalRows: mapping.historicalRows.length,
    editableIds: mapping.currentEditableCards.length,
    historicalExecutions: mapping.counts.fullHistoricalCardExecutions,
    parityClaims: mapping.counts.historicalParityClaims,
  },
  reviewedBrowser: {
    choices: browserIds.size,
    evidenceCandidate: pinnedTestCommit,
    testSourceSha256: pinnedTestSourceHash,
    testAssertion: "released collection visibly contains exactly nineteen cards",
    criticTap: { tests: 1, pass: 1, fail: 0, cancelled: 0 },
    criticBattleDeckSize: criticBrowserReceipt.deck.length,
    releaseManifestSha256: browser.release.manifestSha256,
    addedSinceFrozenMapping: additions,
  },
  currentSourceProbe: {
    choices: currentProbe.collectionCount,
    kilnkeeperVisible: currentProbe.collectionContainsKilnkeeper,
    portraitCount: currentProbe.detailEvidence.portraitCount,
    loreCount: currentProbe.detailEvidence.loreCount,
  },
  liveBrowserProbe: {
    choices: liveProbe.collection.count,
    kilnkeeperVisible: liveProbe.collection.containsKilnkeeper,
    portraitCount: liveProbe.detailEvidence.portraitCount,
    loreCount: liveProbe.detailEvidence.loreCount,
    errors: liveProbe.errors.length,
    entryBundleStatus: liveEntry.status,
    entryBundleSha256: liveEntry.sha256,
    screenshotSha256Verified: true,
  },
  sessionCatalog: catalog.counts,
  endurance: {
    candidate: endurance.candidateCommit,
    deckSize: endurance.result.deckSize,
    ticks: endurance.result.terminalTick,
    segments: endurance.result.segments,
    pauseRecords: endurance.result.serializedTranscriptEventCountsAtTerminal.pause,
    resumeRecords: endurance.result.serializedTranscriptEventCountsAtTerminal.resume,
    appliesToCurrentPublicRuntime: false,
  },
  defaultEightSnapshotComparison: {
    baselineCommit: defaultEightComparison.baselineCommit,
    reviewedCommit: defaultEightComparison.reviewedCommit,
    seeds: [0, 23],
    ticks: [0, 120, 900],
    exactSnapshots: defaultEightComparison.snapshots.length,
  },
  sourceIsolation: { successor: "PASS 28/28 + Pages 5/5", olderFailureRetained: true },
  liveRelease: {
    mainSha: live.main.sha,
    workflow: live.workflow.id,
    workflowConclusion: live.workflow.conclusion,
    landingStatus: live.livePages.landing.status,
    gameStatus: live.livePages.game.status,
  },
};
await writeFile(resolve(root, "artifacts/coverage004-round-2/builder/guide-checks.json"), `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
