import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createVisualAssetManifest } from "../../../src/content/visual-asset-manifest.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const BASE = "b0b20ad6b50e7d99b59abeb799708a64ce92f192";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = (relative) => readFileSync(path.join(ROOT, relative));
const baseBlob = (relative) => execFileSync("git", ["show", BASE + ":" + relative], { cwd: ROOT });
const fileEntries = [
  "artifacts/buried-coil-concept/builder/concept.json",
  "demo/assets/buried-coil-portrait.png",
  "demo/assets/buried-coil-hidden.png",
  "demo/assets/buried-coil-revealed-original.svg",
  "public/assets/buried-coil-portrait.webp",
  "public/assets/buried-coil-hidden.webp",
  "public/assets/buried-coil-revealed.svg",
  "docs/art/buried-coil-portrait-provenance.json",
  "docs/art/buried-coil-hidden-provenance.json",
  "docs/art/buried-coil-revealed-provenance.json",
  "artifacts/art021p-round3/builder/previous-bitmap-shipped.webp",
  "artifacts/art021p-round3/builder/previous-bitmap-provenance.json",
  "src/content/visual-asset-manifest.js",
];
const hashRows = (files) => Object.fromEntries(files.map((relative) => {
  const bytes = read(relative);
  return [relative, { bytes: bytes.length, sha256: hash(bytes) }];
}));
const manifest = createVisualAssetManifest();
const current = manifest.assets;
const baseSource = baseBlob("src/content/visual-asset-manifest.js").toString("utf8");
const baseModule = path.join(HERE, "base-manifest-source.mjs");
writeFileSync(baseModule, baseSource);
const baseApi = await import(pathToFileURL(baseModule).href);
const baseManifest = baseApi.createVisualAssetManifest();
const byId = (assets) => new Map(assets.map((asset) => [asset.id, asset]));
const currentById = byId(current);
const baseById = byId(baseManifest.assets);
const changedId = "buried-coil-revealed-battle-sprite";
const unchangedRecords = current.filter((asset) =>
  asset.id !== changedId && JSON.stringify(asset) === JSON.stringify(baseById.get(asset.id)));
const changedOtherRecordIds = current.filter((asset) =>
  asset.id !== changedId && JSON.stringify(asset) !== JSON.stringify(baseById.get(asset.id)))
  .map((asset) => asset.id);
const sourceSvgBytes = read("demo/assets/buried-coil-revealed-original.svg");
const outputSvgBytes = read("public/assets/buried-coil-revealed.svg");
const sourceSvg = sourceSvgBytes.toString("utf8");
const outputSvg = outputSvgBytes.toString("utf8");
const minifiedSvg = sourceSvg
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/>\s+</g, "><")
  .trim();
const svgMetadata = JSON.parse(read("docs/art/buried-coil-revealed-provenance.json").toString("utf8"));
const concept = JSON.parse(read("artifacts/buried-coil-concept/builder/concept.json").toString("utf8"));
const provenance = {
  portrait: JSON.parse(read("docs/art/buried-coil-portrait-provenance.json").toString("utf8")),
  hidden: JSON.parse(read("docs/art/buried-coil-hidden-provenance.json").toString("utf8")),
};
const assetMetadata = (id) => {
  const asset = currentById.get(id);
  assert.ok(asset, "missing manifest asset " + id);
  const bytes = read(path.join("public", asset.path));
  assert.equal(bytes.length, asset.byteLength, id + " byte length");
  assert.equal(hash(bytes), asset.sha256, id + " SHA-256");
  assert.equal(asset.license, "AGPL-3.0-only", id + " license");
  return { ...asset, actualBytes: bytes.length, actualSha256: hash(bytes) };
};

const portrait = assetMetadata("buried-coil-portrait");
const hidden = assetMetadata("buried-coil-hidden-battle-sprite");
const revealed = assetMetadata(changedId);
assert.equal(current.length, 27, "manifest remains bounded at 27 records");
assert.equal(baseManifest.assets.length, 27, "accepted bitmap base has 27 records");
assert.equal(current.filter((asset) => asset.id !== changedId).length, 26);
assert.equal(changedOtherRecordIds.length, 0, "no other manifest records changed");
assert.deepEqual(concept.hiddenVsRevealedArenaForm.revealed,
  "The hatch opens into a short, sturdy lookout tower with a three-footed silhouette, a bright central emberseed, and two thick copper coil rings crowning the mast.");
assert.equal(svgMetadata.authorship, "in-repo-authored");
assert.equal(svgMetadata.license, "AGPL-3.0-only");
assert.deepEqual(svgMetadata.external_references, []);
assert.equal(svgMetadata.authored_source.path, "demo/assets/buried-coil-revealed-original.svg");
assert.equal(svgMetadata.authored_source.bytes, sourceSvgBytes.length);
assert.equal(svgMetadata.authored_source.sha256, hash(sourceSvgBytes));
assert.equal(svgMetadata.shipped_output.path, "public/assets/buried-coil-revealed.svg");
assert.equal(svgMetadata.shipped_output.bytes, outputSvgBytes.length);
assert.equal(svgMetadata.shipped_output.sha256, hash(outputSvgBytes));
assert.equal(svgMetadata.shipped_output.dimensions.width, 13);
assert.equal(svgMetadata.shipped_output.dimensions.height, 13);
assert.equal(minifiedSvg, outputSvg, "output equals documented comments/whitespace-only minification");
assert.doesNotMatch(sourceSvg, /<image\b|<script\b|(?:href|src)\s*=/i);
assert.doesNotMatch(outputSvg, /<image\b|<script\b|(?:href|src)\s*=/i);
assert.equal(provenance.portrait.authorship, "in-repo-authored");
assert.equal(provenance.portrait.license, "AGPL-3.0-only");
assert.deepEqual(provenance.portrait.generation_settings.input_images, []);
assert.equal(provenance.hidden.authorship, "in-repo-authored");
assert.equal(provenance.hidden.license, "AGPL-3.0-only");
assert.deepEqual(provenance.hidden.generation_settings.input_images, []);
const compareGeneratedFile = (label, prov, sourceRel, outputRel, manifestAsset) => {
  const sourceBytes = read(sourceRel);
  const outputBytes = read(outputRel);
  assert.equal(hash(sourceBytes), prov.generated_source.sha256, label + " source hash");
  assert.equal(sourceBytes.length, prov.generated_source.bytes, label + " source bytes");
  assert.equal(hash(outputBytes), prov.shipped_output.sha256, label + " shipped hash");
  assert.equal(outputBytes.length, prov.shipped_output.bytes, label + " shipped bytes");
  assert.equal(manifestAsset.sha256, hash(outputBytes), label + " manifest hash");
  assert.equal(manifestAsset.byteLength, outputBytes.length, label + " manifest byte length");
  return {
    source: { path: sourceRel, bytes: sourceBytes.length, sha256: hash(sourceBytes), documented: prov.generated_source },
    output: { path: outputRel, bytes: outputBytes.length, sha256: hash(outputBytes), documented: prov.shipped_output },
  };
};
const portraitFiles = compareGeneratedFile("portrait", provenance.portrait,
  "demo/assets/buried-coil-portrait.png", "public/assets/buried-coil-portrait.webp", portrait);
const hiddenFiles = compareGeneratedFile("hidden", provenance.hidden,
  "demo/assets/buried-coil-hidden.png", "public/assets/buried-coil-hidden.webp", hidden);
const oldBitmapArchive = read("artifacts/art021p-round3/builder/previous-bitmap-shipped.webp");
const oldProvenanceArchive = read("artifacts/art021p-round3/builder/previous-bitmap-provenance.json");
const oldBitmapFromBase = baseBlob("public/assets/buried-coil-revealed.webp");
const oldProvenanceFromBase = baseBlob("docs/art/buried-coil-revealed-provenance.json");
assert.equal(hash(oldBitmapArchive), hash(oldBitmapFromBase), "historical WebP equals accepted base bytes");
assert.equal(hash(oldProvenanceArchive), hash(oldProvenanceFromBase), "historical provenance equals accepted base bytes");
assert.equal(hash(oldBitmapArchive), svgMetadata.supersedes_prior_bitmap_candidate.prior_shipped_sha256);
assert.equal(hash(oldProvenanceArchive), svgMetadata.supersedes_prior_bitmap_candidate.prior_provenance_sha256);
assert.equal(existsSync(path.join(ROOT, "public/assets/buried-coil-revealed.webp")), false, "superseded WebP is not shipped");
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
const before = {
  candidateHead: head,
  candidateTree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: ROOT, encoding: "utf8" }).trim(),
  files: hashRows(fileEntries),
};
writeFileSync(path.join(HERE, "source-before.json"), JSON.stringify(before, null, 2) + "\n");
const result = {
  candidateHead: head,
  acceptedBase: BASE,
  manifest: {
    recordCount: current.length,
    acceptedBaseRecordCount: baseManifest.assets.length,
    changedRecordId: changedId,
    unchangedOtherRecordCount: current.filter((asset) => asset.id !== changedId).length,
    changedOtherRecordIds,
    allOtherRecordsUnchanged: changedOtherRecordIds.length === 0,
    buriedCoilEntries: { portrait, hidden, revealed },
  },
  originalVector: {
    conceptPath: "artifacts/buried-coil-concept/builder/concept.json",
    conceptRevealedBrief: concept.hiddenVsRevealedArenaForm.revealed,
    source: {
      path: "demo/assets/buried-coil-revealed-original.svg",
      bytes: sourceSvgBytes.length,
      sha256: hash(sourceSvgBytes),
      documentedBytes: svgMetadata.authored_source.bytes,
      documentedSha256: svgMetadata.authored_source.sha256,
      width: 13,
      height: 13,
    },
    output: {
      path: "public/assets/buried-coil-revealed.svg",
      bytes: outputSvgBytes.length,
      sha256: hash(outputSvgBytes),
      documentedBytes: svgMetadata.shipped_output.bytes,
      documentedSha256: svgMetadata.shipped_output.sha256,
      dimensions: revealed.dimensions,
      equalsDocumentedCommentWhitespaceMinification: minifiedSvg === outputSvg,
    },
    noImageInputsOrExternalRefs: true,
    provenanceAuthorship: svgMetadata.authorship,
    provenanceLicense: svgMetadata.license,
  },
  portraitFiles,
  hiddenFiles,
  historicalArtifacts: {
    previousBitmapArchiveMatchesAcceptedBase: hash(oldBitmapArchive) === hash(oldBitmapFromBase),
    previousProvenanceArchiveMatchesAcceptedBase: hash(oldProvenanceArchive) === hash(oldProvenanceFromBase),
    oldRevealedWebpPresentInPublicAssets: existsSync(path.join(ROOT, "public/assets/buried-coil-revealed.webp")),
    oldWebpSha256: hash(oldBitmapArchive),
    oldProvenanceSha256: hash(oldProvenanceArchive),
  },
  sourceBeforeSnapshot: "source-before.json",
};
writeFileSync(path.join(HERE, "independent-source-provenance-manifest-audit.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));

