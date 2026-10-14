import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSessionTroopWitnessQuestions, projectSessionTroopBattleCard } from "../../../src/content/session-troop-roster.js";
import { createVisualAssetManifest } from "../../../src/content/visual-asset-manifest.js";
import { getCardLore } from "../../../src/ui/card-lore.js";
import { getCardPortrait, getCardPortraitIds } from "../../../src/ui/card-portrait-art.js";

const here = new URL(".", import.meta.url);
const root = fileURLToPath(new URL("../../..", import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const oldIds = [
  "coilblade", "mossguard", "copperskiff", "skymaul", "brassbolt", "reedsting",
  "briar-band", "cinderlings", "stonehauler", "thornscouts", "forgeguard", "squall-orb",
  "cinder-host", "ironroot", "sunthread-pair", "duskwing-trio", "gloamwing-cluster",
  "coppershade-flock", "ember-basin",
];
const oldPortraitIds = getCardPortraitIds().filter((id) => id !== "kilnkeeper");
const oldPortraitRows = oldPortraitIds.map((id) => {
  const portrait = getCardPortrait(id);
  return [id, portrait.asset, portrait.cell];
});
const oldLoreRows = oldPortraitIds.map((id) => [id, getCardLore(id)]);
const oldPortraitSha256 = sha256(Buffer.from(JSON.stringify(oldPortraitRows)));
const oldLoreSha256 = sha256(Buffer.from(JSON.stringify(oldLoreRows)));
const previousSourceProof = JSON.parse(await readFile(join(root,
  "artifacts/cards019d-round-1/critic/source-confidence-proof.json"), "utf8"));
const previousQuestions = previousSourceProof.sourceConfidenceQuestions;
const currentQuestions = createSessionTroopWitnessQuestions("kilnkeeper")
  .filter(({ key }) => key.startsWith("kilnkeeper."));
const currentQuestionsByKey = new Map(currentQuestions.map((question) => [question.key, question]));
for (const question of previousQuestions) {
  assert.deepEqual(currentQuestionsByKey.get(question.key), question,
    `prior QUESTION record remains byte-equivalent for ${question.key}`);
}
assert.ok(currentQuestions.every(({ authoritative, confidence, disposition }) =>
  authoritative === false && confidence === "unverified" && disposition === "question"));

const card = projectSessionTroopBattleCard("kilnkeeper");
const entity = card.entities.find(({ archetypeId }) => archetypeId === "kilnkeeper");
const visualManifest = createVisualAssetManifest();
const manifestAsset = visualManifest.assets.find(({ id }) => id === "kilnkeeper-portrait-painted");
const provenance = JSON.parse(await readFile(join(root,
  "docs/art/kilnkeeper-portrait-provenance.json"), "utf8"));
const sourceAsset = provenance.assets[0];
const sourcePngBytes = await readFile(join(root, sourceAsset.source_png));
const shippedBytes = await readFile(join(root, sourceAsset.asset));
const sourcePngDimensions = {
  width: sourcePngBytes.readUInt32BE(16),
  height: sourcePngBytes.readUInt32BE(20),
};
assert.deepEqual(oldPortraitIds, oldIds);
assert.equal(oldPortraitSha256, "81c05bdd4e1f3cab949409ebccee575f29d4f3e1116fa3cbd5d9dddabc245dd3");
assert.equal(oldLoreSha256, "575ffb9a932b2e5d33c610539615e8bf94e925bbf1f82dee06384aa3f4407c05");
assert.equal(card.cost, 5);
assert.deepEqual(entity.layerPolicy, { kind: "question", questionKey: "kilnkeeper.layer" });
assert.equal(entity.deliveryPolicy.kind, "source-backed");
assert.equal(manifestAsset.license, "AGPL-3.0-only");
assert.equal(provenance.license, "AGPL-3.0-only");
assert.deepEqual(sourceAsset.input_images, []);
assert.equal(shippedBytes.byteLength, 65626);
assert.equal(sha256(shippedBytes), "38e9f64348fa823a64755fda2496b699c88c27c7dd0a14a440e704d9093d2240");

const proof = {
  candidateCommit: "b8c70ba5325d53e2f376ce3108c3a87a6ccb9e92",
  sourceCommit: "7f2c978309d792059fdd09586ca8fbefc155a69c",
  baseCommit: "ddaf00e64eab6e1d314163fc5212b19f4398c8fd",
  kilnkeeper: {
    cost: card.cost,
    costIsOutsideCombatQuestions: !currentQuestions.some(({ key }) => key === "kilnkeeper.cost"),
    layerPolicy: entity.layerPolicy,
    deliveryPolicy: entity.deliveryPolicy,
    values: {
      count: card.count,
      hitpoints: card.hitpoints,
      damage: card.damage,
      hitSpeedTicks: card.hitSpeedTicks,
      firstHitTicks: card.firstHitTicks,
      movementMillitilesPerSecond: card.movementMillitilesPerSecond,
      rangeMillitiles: card.rangeMillitiles,
      sightRangeMillitiles: card.sightRangeMillitiles,
      targetMode: card.targetMode,
    },
    currentQuestionCount: currentQuestions.length,
    allCurrentQuestionsRemainUnverified: currentQuestions.every(({ authoritative, confidence, disposition }) =>
      authoritative === false && confidence === "unverified" && disposition === "question"),
    priorRoundQuestionCount: previousQuestions.length,
    priorQuestionsRemainExact: true,
  },
  legacyMappings: {
    portraitCount: oldPortraitIds.length,
    portraitRows: oldPortraitRows,
    portraitSha256: oldPortraitSha256,
    loreRows: oldLoreRows,
    loreSha256: oldLoreSha256,
  },
  approvedStory: {
    text: getCardLore("kilnkeeper"),
    sentenceCount: getCardLore("kilnkeeper").split(/(?<=[.!?])\s+/u).length,
  },
  asset: {
    path: sourceAsset.asset,
    sourcePng: {
      path: sourceAsset.source_png,
      bytes: sourcePngBytes.byteLength,
      dimensions: sourcePngDimensions,
      sha256: sha256(sourcePngBytes),
    },
    shipped: {
      bytes: shippedBytes.byteLength,
      dimensions: manifestAsset.dimensions,
      sha256: sha256(shippedBytes),
      manifest: manifestAsset,
    },
    provenance: {
      authorship: provenance.authorship,
      generation_tool: provenance.generation_tool,
      input_images: sourceAsset.input_images,
      license: provenance.license,
    },
  },
};
await writeFile(new URL("surface-integrity-proof.json", here), `${JSON.stringify(proof, null, 2)}\n`);
process.stdout.write(`Legacy portrait/lore mappings match; ${previousQuestions.length} prior combat QUESTION records remain exact; ${currentQuestions.length} current witness records remain QUESTION; cost=5; portrait=512x512, 65626 bytes, SHA-256 ${sha256(shippedBytes)}\n`);
