const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "../../..");
const acceptedBase = "b0b20ad6b50e7d99b59abeb799708a64ce92f192";
const targetId = "buried-coil-revealed-battle-sprite";
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const gitShow = (file) => execFileSync("git", ["show", `${acceptedBase}:${file}`], { cwd: root });

(async () => {
  const currentModule = await import(pathToFileURL(path.join(root, "src/content/visual-asset-manifest.js")).href);
  const baseSource = gitShow("src/content/visual-asset-manifest.js").toString("utf8");
  const baseModule = await import(`data:text/javascript;base64,${Buffer.from(baseSource).toString("base64")}`);
  const currentManifest = currentModule.createVisualAssetManifest();
  const baseManifest = baseModule.createVisualAssetManifest();
  const currentById = new Map(currentManifest.assets.map((asset) => [asset.id, asset]));
  const baseById = new Map(baseManifest.assets.map((asset) => [asset.id, asset]));
  assert.equal(currentManifest.assets.length, 27);
  assert.equal(baseManifest.assets.length, 27);
  assert.deepEqual(
    currentManifest.assets.filter((asset) => asset.id !== targetId),
    baseManifest.assets.filter((asset) => asset.id !== targetId),
  );

  const unchangedAssets = [];
  for (const asset of baseManifest.assets.filter((item) => item.id !== targetId)) {
    const bytes = fs.readFileSync(path.join(root, "public", asset.path));
    assert.equal(bytes.length, asset.byteLength, `${asset.id}: byte length changed`);
    assert.equal(hash(bytes), asset.sha256, `${asset.id}: shipped bytes changed`);
    unchangedAssets.push({ id: asset.id, path: asset.path, bytes: bytes.length, sha256: hash(bytes) });
  }

  const target = currentById.get(targetId);
  assert.deepEqual(target, {
    authorship: "in-repo-authored",
    byteLength: 1565,
    dimensions: { height: 13, width: 13 },
    format: "svg",
    id: targetId,
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/buried-coil-revealed.svg",
    sha256: "0e677493ea65b9132ed553ec21a1efdf474cc887d6e21d569ff4fc3f96189b53",
  });
  const publicPath = path.join(root, "public", target.path);
  const sourcePath = path.join(root, "demo/assets/buried-coil-revealed-original.svg");
  const publicSvg = fs.readFileSync(publicPath);
  const sourceSvg = fs.readFileSync(sourcePath);
  assert.equal(fs.statSync(publicPath).size, target.byteLength);
  assert.equal(hash(publicSvg), target.sha256);
  assert.equal(hash(sourceSvg), "984c2fde2620d6f936e078d7c773618fc300875227e7ec7f28d8f73d8430c3f5");
  const minifiedSource = sourceSvg.toString("utf8").replace(/<!--[\s\S]*?-->/g, "").replace(/>\s+</g, "><").trim();
  assert.equal(publicSvg.toString("utf8"), minifiedSource);
  assert.equal(fs.existsSync(path.join(root, "public/assets/buried-coil-revealed.webp")), false);
  assert.deepEqual([...publicSvg.toString("utf8").match(/viewBox="0 0 (\d+) (\d+)"/).slice(1)].map(Number), [13, 13]);

  const provenancePath = path.join(root, "docs/art/buried-coil-revealed-provenance.json");
  const provenance = JSON.parse(fs.readFileSync(provenancePath, "utf8"));
  assert.equal(provenance.asset_id, targetId);
  assert.equal(provenance.authorship, "in-repo-authored");
  assert.equal(provenance.license, "AGPL-3.0-only");
  assert.deepEqual(provenance.input_images, []);
  assert.deepEqual(provenance.external_references, []);
  assert.equal(provenance.authored_source.path, "demo/assets/buried-coil-revealed-original.svg");
  assert.equal(provenance.authored_source.format, "SVG");
  assert.equal(provenance.authored_source.bytes, sourceSvg.length);
  assert.equal(provenance.authored_source.sha256, hash(sourceSvg));
  assert.equal(provenance.shipped_output.path, "public/assets/buried-coil-revealed.svg");
  assert.equal(provenance.shipped_output.format, "SVG");
  assert.equal(provenance.shipped_output.bytes, publicSvg.length);
  assert.equal(provenance.shipped_output.sha256, hash(publicSvg));
  assert.deepEqual(provenance.shipped_output.dimensions, { width: 13, height: 13 });
  assert.match(provenance.vector_prototype_reference.note, /Chromium 145 at 13 CSS px and DPR 1/);
  assert.match(provenance.vector_prototype_reference.note, /does not verify live arena or card-template integration/);
  assert.match(provenance.round3_status, /independent native-scale critique remains pending/);
  assert.match(provenance.round3_status, /Live arena and card-template integration remain unverified/);

  const oldWebp = gitShow("public/assets/buried-coil-revealed.webp");
  const archivedWebp = fs.readFileSync(path.join(__dirname, "previous-bitmap-shipped.webp"));
  const oldProvenance = gitShow("docs/art/buried-coil-revealed-provenance.json");
  const archivedProvenance = fs.readFileSync(path.join(__dirname, "previous-bitmap-provenance.json"));
  assert.equal(hash(oldWebp), hash(archivedWebp));
  assert.equal(hash(oldProvenance), hash(archivedProvenance));
  const oldOriginalBitmap = gitShow("demo/assets/buried-coil-revealed.png");
  const currentOriginalBitmap = fs.readFileSync(path.join(root, "demo/assets/buried-coil-revealed.png"));
  assert.equal(hash(oldOriginalBitmap), hash(currentOriginalBitmap));

  const receipt = {
    acceptedBase,
    candidateHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    manifestAssetCount: currentManifest.assets.length,
    unchangedManifestRecordCount: unchangedAssets.length,
    allOtherManifestRecordsUnchanged: true,
    allOtherShippedAssetBytesMatchAcceptedBaseAndManifest: true,
    unchangedAssets,
    revealedAsset: {
      id: targetId,
      manifestRecord: target,
      source: { path: "demo/assets/buried-coil-revealed-original.svg", bytes: sourceSvg.length, sha256: hash(sourceSvg) },
      output: { path: target.path, bytes: publicSvg.length, sha256: hash(publicSvg), dimensions: { width: 13, height: 13 } },
      sourceToOutput: "Verified exact deterministic removal of XML comments and inter-tag whitespace; geometry, fills, and metadata otherwise retained.",
    },
    provenance: {
      path: "docs/art/buried-coil-revealed-provenance.json",
      sha256: hash(fs.readFileSync(provenancePath)),
      sourceAndOutputFieldsMatchBytesAndManifest: true,
      authorship: "in-repo-authored",
      license: "AGPL-3.0-only",
      inputImages: [],
      externalReferences: [],
      scopeNoteAccuratelyLimitsNativeRenderToAssetStage: true,
    },
    priorBitmapFailurePreserved: {
      originalPngStillMatchesBase: true,
      failedShippedWebpArchivedByteExact: true,
      priorProvenanceArchivedByteExact: true,
      archivedWebpSha256: hash(archivedWebp),
      archivedProvenanceSha256: hash(archivedProvenance),
    },
    productOutputNativeCapture: "product-native-measurements.json",
    focusedManifestTest: { command: "npm run test:visual-asset-manifest", rawTap: "manifest-test-after-provenance.tap", result: "6 passed, 0 failed after the provenance note update" },
    independentCritique: "pending; no pass/adoption claim",
  };
  fs.writeFileSync(path.join(__dirname, "verification-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({
    manifestAssetCount: receipt.manifestAssetCount,
    unchangedManifestRecordCount: receipt.unchangedManifestRecordCount,
    allOtherManifestRecordsUnchanged: receipt.allOtherManifestRecordsUnchanged,
    unchangedPublicAssets: unchangedAssets.length,
    revealedOutput: receipt.revealedAsset.output,
    archivedWebpSha256: receipt.priorBitmapFailurePreserved.archivedWebpSha256,
    archivedProvenanceSha256: receipt.priorBitmapFailurePreserved.archivedProvenanceSha256,
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
