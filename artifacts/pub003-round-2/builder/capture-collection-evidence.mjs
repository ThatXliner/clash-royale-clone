import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  EDITABLE_DECK_CARD_IDS,
  EDITABLE_MIXED_DECK_CARD_IDS,
} from "../../../src/content/editable-deck.js";
import { PLAYABLE_CARD_IDS } from "../../../src/content/playable-roster.js";

const readText = (path) => readFileSync(path, "utf8");
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const guidePath = "docs/completion-inventory.md";
const guide = readText(guidePath);
const guideLine = guide.split("\n").find((line) => line.includes("Current editable collection"));
const browserAuditPath = "artifacts/app004g-round-1/critic/live-dom-audit.json";
const browserAudit = JSON.parse(readText(browserAuditPath));
const releaseReceiptPath = "artifacts/coverage004-round-4/builder/live-release-evidence.json";
const releaseReceipt = JSON.parse(readText(releaseReceiptPath));

assert.equal(EDITABLE_DECK_CARD_IDS.length, 18);
assert.equal(EDITABLE_MIXED_DECK_CARD_IDS.length, 20);
assert.equal(PLAYABLE_CARD_IDS.length, 8);
assert.match(guideLine ?? "", /20 choices/);
assert.match(guideLine ?? "", /default deck 8/);
assert.equal(browserAudit.cardCollectionCount, 20);
assert.equal(releaseReceipt.release.ref, "main");
assert.equal(releaseReceipt.release.commit, "bf1e6120196db8a2927ce6ae893812e4c9b1115d");
assert.equal(releaseReceipt.live.landing.status, 200);
assert.equal(releaseReceipt.live.game.status, 200);
assert.equal(releaseReceipt.live.landing.containsFullReleaseCommit, true);

const result = {
  source: {
    troopIdsPath: "src/content/session-troop-roster.js",
    troopIdsSha256: digest("src/content/session-troop-roster.js"),
    mixedCollectionPath: "src/content/editable-deck.js",
    mixedCollectionSha256: digest("src/content/editable-deck.js"),
    playableRosterPath: "src/content/playable-roster.js",
    playableRosterSha256: digest("src/content/playable-roster.js"),
    editableTroopCount: EDITABLE_DECK_CARD_IDS.length,
    editableTroopIds: EDITABLE_DECK_CARD_IDS,
    mixedCollectionCount: EDITABLE_MIXED_DECK_CARD_IDS.length,
    mixedCollectionIds: EDITABLE_MIXED_DECK_CARD_IDS,
    defaultDeckCount: PLAYABLE_CARD_IDS.length,
    defaultDeckIds: PLAYABLE_CARD_IDS,
  },
  currentGuide: {
    path: guidePath,
    sha256: digest(guidePath),
    collectionLine: guideLine,
  },
  browserCollectionAudit: {
    path: browserAuditPath,
    sha256: digest(browserAuditPath),
    browser: browserAudit.browser,
    cardCollectionCount: browserAudit.cardCollectionCount,
  },
  publicReleaseReceipt: {
    path: releaseReceiptPath,
    sha256: digest(releaseReceiptPath),
    ref: releaseReceipt.release.ref,
    commit: releaseReceipt.release.commit,
    workflowRun: releaseReceipt.release.workflow.runId,
    workflowConclusion: releaseReceipt.release.workflow.conclusion,
    capturedAtUtc: releaseReceipt.capturedAtUtc,
    landingStatus: releaseReceipt.live.landing.status,
    gameStatus: releaseReceipt.live.game.status,
    landingContainsFullReleaseCommit: releaseReceipt.live.landing.containsFullReleaseCommit,
  },
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
