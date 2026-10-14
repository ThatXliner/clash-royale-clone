import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const root = process.env.PUB003_CLEAN_ROOT;
const gitRepo = process.env.PUB003_GIT_REPO;
const base = "bfd957c5d044137dca1a17a21b3b79edc5760782";
const candidate = "87f7966fcf1c31399e327fa0a32bb68c3e008926";
assert.ok(root, "PUB003_CLEAN_ROOT must point at the fresh archive");
assert.ok(gitRepo, "PUB003_GIT_REPO must point at the candidate git object store");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const count = JSON.parse(read("artifacts/pub003-round-2/critic/count-capture.stdout.json"));
const builderCount = JSON.parse(read("artifacts/pub003-round-2/builder/collection-count-evidence.json"));
const links = JSON.parse(read("artifacts/pub003-round-2/critic/readme-linkcheck.stdout.json"));


test("README keeps the prototype, original art, AI-opponent, and pre-2023 framing", () => {
  const readme = read("README.md");
  assert.match(readme, /Play against a computer opponent\./);
  assert.match(readme, /Build an eight-card deck from the twenty-card\ncollection/);
  assert.match(readme, /inspired by the rules of Clash Royale\nbefore March 2023/);
  assert.match(readme, /The game uses original\nnames, art, and sound\./);
  assert.match(readme, /active prototype, not a complete recreation/);
  assert.match(readme, /some cards and arena rules are still being worked out/);
});

test("README differs from base by exactly the nineteen-to-twenty count word", () => {
  const baseReadme = execFileSync("git", ["-C", gitRepo, "show", `${base}:README.md`], { encoding: "utf8" });
  const readme = read("README.md");
  assert.equal((baseReadme.match(/nineteen-card\ncollection/g) ?? []).length, 1);
  assert.equal(readme, baseReadme.replace("nineteen-card\ncollection", "twenty-card\ncollection"));
  const changed = execFileSync("git", ["-C", gitRepo, "diff", "--no-ext-diff", "--no-renames", "--name-only", base, candidate], { encoding: "utf8" }).trim().split("\n");
  const unexpected = changed.filter((file) => file !== "README.md" && !file.startsWith("artifacts/pub003-round-2/builder/"));
  assert.deepEqual(unexpected, []);
  assert.equal(changed.filter((file) => file === "README.md").length, 1);
});

test("admitted editable collection contains 20 cards and default deck contains 8", async () => {
  const editable = await import(pathToFileURL(path.join(root, "src/content/editable-deck.js")));
  const roster = await import(pathToFileURL(path.join(root, "src/content/playable-roster.js")));
  assert.equal(editable.EDITABLE_DECK_CARD_IDS.length, 18);
  assert.equal(editable.EDITABLE_MIXED_DECK_CARD_IDS.length, 20);
  assert.equal(roster.PLAYABLE_CARD_IDS.length, 8);
  assert.equal(new Set(editable.EDITABLE_MIXED_DECK_CARD_IDS).size, 20);
  assert.equal(count.source.editableTroopCount, 18);
  assert.equal(count.source.mixedCollectionCount, 20);
  assert.equal(count.source.defaultDeckCount, 8);
  assert.deepEqual(count.source.mixedCollectionIds, editable.EDITABLE_MIXED_DECK_CARD_IDS);
  assert.deepEqual(count.source.defaultDeckIds, roster.PLAYABLE_CARD_IDS);
});

test("current guide and versioned live release receipt match the admitted count", () => {
  const freeze = JSON.parse(read("artifacts/pub003-round-2/builder/candidate-freeze.json"));
  const guide = read("docs/completion-inventory.md");
  const receiptPath = "artifacts/coverage004-round-4/builder/live-release-evidence.json";
  const receipt = JSON.parse(read(receiptPath));
  const guideLine = guide.split("\n").find((line) => line.includes("Current editable collection"));
  assert.match(guideLine ?? "", /20 choices/);
  assert.match(guideLine ?? "", /default deck 8/);
  assert.deepEqual(count, builderCount);
  assert.equal(freeze.base.acceptedCommit, base);
  assert.equal(freeze.scope.file, "README.md");
  assert.equal(freeze.countEvidence.mixedCollectionChoices, 20);
  assert.equal(freeze.countEvidence.defaultDeckCards, 8);
  assert.equal(count.currentGuide.sha256, createHash("sha256").update(guide).digest("hex"));
  assert.equal(count.publicReleaseReceipt.sha256, createHash("sha256").update(read(receiptPath)).digest("hex"));
  assert.equal(count.currentGuide.collectionLine, guideLine);
  assert.equal(count.publicReleaseReceipt.commit, "bf1e6120196db8a2927ce6ae893812e4c9b1115d");
  assert.equal(receipt.release.ref, "main");
  assert.equal(receipt.release.commit, "bf1e6120196db8a2927ce6ae893812e4c9b1115d");
  assert.equal(receipt.release.workflow.conclusion, "success");
  assert.equal(receipt.live.landing.status, 200);
  assert.equal(receipt.live.game.status, 200);
  assert.equal(receipt.live.landing.containsFullReleaseCommit, true);
  assert.equal(count.publicReleaseReceipt.workflowRun, receipt.release.workflow.runId);
  assert.equal(count.publicReleaseReceipt.workflowConclusion, receipt.release.workflow.conclusion);
});

test("all 14 local README targets resolve", () => {
  assert.equal(links.localLinksChecked, 14);
  assert.equal(links.localLinksMissing, 0);
  assert.deepEqual(links.missing, []);
  assert.equal(links.externalLinksSkipped, 2);
});
