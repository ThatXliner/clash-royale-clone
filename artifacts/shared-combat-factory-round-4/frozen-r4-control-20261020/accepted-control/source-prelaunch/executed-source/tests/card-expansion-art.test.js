import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { createVisualAssetManifest } from "../src/content/visual-asset-manifest.js";
import { getCardLore } from "../src/ui/card-lore.js";
import { getCardPortrait, getCardPortraitIds } from "../src/ui/card-portrait-art.js";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const COPPERSHADE_REFERENCE = Object.freeze({
  path: "public/assets/coppershade-flock-painted.webp",
  sha256: "8d56aad804ca150372aa7a08af118f43ad33a2577f2604bee2ddcaaea1bac624",
  dimensions: Object.freeze({ width: 512, height: 512 }),
  source_commit: "5acec5bf2dae658fc299dc05417df84722ad1d0d",
  role: "design reference",
});
const ASSETS = Object.freeze([
  Object.freeze({
    id: "gloamwing-cluster",
    file: "gloamwing-cluster-painted",
    sourceSha256: "2537f0de61793fc87866fb65894e0c83c98614f00c6c459ed3dc49604c92025a",
    outputSha256: "176687230a5e9b3b57364437692308f568e2933b7b0225e46694cfbbfb4b6cf8",
    sourceBytes: 2_341_041,
    outputBytes: 40_140,
    inputImages: Object.freeze([]),
  }),
  Object.freeze({
    id: "coppershade-flock",
    file: "coppershade-flock-painted",
    sourceSha256: "ae5b7361274dee316fb2c3f0062b74718e3af1687f3766f857a3573b8250c203",
    outputSha256: "521167c772916265e797c51c28183d91f090c2670ec7d527bf59e60a85684dec",
    sourceBytes: 2_280_778,
    outputBytes: 36_532,
    inputImages: Object.freeze([COPPERSHADE_REFERENCE]),
  }),
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function pngSize(bytes) {
  if (bytes.length < 24 || bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a") {
    return null;
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function webpSize(bytes) {
  if (bytes.length < 30 || bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 12) !== "WEBP") return null;
  if (bytes.toString("ascii", 12, 16) !== "VP8 " ||
      bytes.toString("hex", 23, 26) !== "9d012a") return null;
  return {
    width: bytes.readUInt16LE(26) & 0x3fff,
    height: bytes.readUInt16LE(28) & 0x3fff,
  };
}

test("card expansion portraits resolve to original standalone square assets", () => {
  const portraitIds = new Set(getCardPortraitIds());
  for (const { id, file } of ASSETS) {
    assert.ok(portraitIds.has(id), `${id} is in the portrait lookup`);
    const portrait = getCardPortrait(id);
    assert.ok(portrait, `${id} resolves a portrait`);
    assert.equal(portrait.asset, file);
    assert.equal(portrait.cell, null, `${id} uses a standalone image, not an atlas cell`);
    assert.equal(new URL(portrait.src).pathname,
      join(ROOT, "public", "assets", `${file}.webp`));

    const lore = getCardLore(id);
    assert.equal(typeof lore, "string");
    assert.ok(lore.trim().length > 0);
    assert.equal((lore.match(/[.!?](?:\s|$)/gu) ?? []).length, 2,
      `${id} has exactly two concrete lore sentences`);
  }
  assert.equal(getCardPortrait("missing-expansion-card"), null);
});

test("card expansion art preserves full sources and licensed, hashed shipped portraits", () => {
  const manifest = createVisualAssetManifest();
  for (const { id, file, sourceSha256, outputSha256, sourceBytes, outputBytes,
    inputImages } of ASSETS) {
    const sourcePath = join(ROOT, "demo", "assets", `${file}.png`);
    const outputPath = join(ROOT, "public", "assets", `${file}.webp`);
    const provenancePath = join(ROOT, "docs", "art", `${id}-provenance.json`);
    const source = readFileSync(sourcePath);
    const output = readFileSync(outputPath);
    const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
    const assetRecord = provenance.assets.find(({ asset }) => asset === `public/assets/${file}.webp`);
    const manifestRecord = manifest.assets.find(({ id: assetId }) => assetId === file);

    assert.equal(source.byteLength, sourceBytes, `${file} retains its full source PNG`);
    assert.equal(sha256(source), sourceSha256, `${file} source hash matches provenance`);
    assert.deepEqual(pngSize(source), { width: 1254, height: 1254 });
    assert.equal(output.byteLength, outputBytes, `${file} output byte count is recorded`);
    assert.ok(output.byteLength <= 1_048_576, `${file} stays at or below 1 MiB`);
    assert.equal(sha256(output), outputSha256, `${file} shipped hash matches provenance`);
    assert.deepEqual(webpSize(output), { width: 512, height: 512 });

    assert.equal(provenance.license, "AGPL-3.0-only");
    assert.equal(provenance.authorship, "in-repo-authored");
    assert.equal(provenance.generation_tool, "built-in imagegen");
    assert.deepEqual(provenance.generation_settings, {
      transparent_background: false,
      input_images: inputImages.map(({ path }) => path),
    });
    assert.equal(provenance.encoding_tool, "cwebp 1.6.0");
    assert.equal(typeof provenance.assets[0].prompt, "string");
    assert.ok(provenance.assets[0].prompt.includes("Use case: stylized-concept"));
    assert.ok(assetRecord, `${id} has a matching generation receipt`);
    assert.deepEqual(assetRecord.input_images, inputImages);
    assert.equal(assetRecord.source_png, `demo/assets/${file}.png`);
    assert.equal(assetRecord.source_sha256, sourceSha256);
    assert.equal(assetRecord.source_bytes, sourceBytes);
    assert.deepEqual(assetRecord.source_dimensions, { width: 1254, height: 1254 });
    assert.equal(assetRecord.sha256, outputSha256);
    assert.equal(assetRecord.bytes, outputBytes);
    assert.deepEqual(assetRecord.dimensions, { width: 512, height: 512 });
    assert.deepEqual(assetRecord.encoding,
      ["-q", "82", "-m", "6", "-mt", "-resize", "512", "512"]);

    assert.equal(statSync(outputPath).size, manifestRecord.byteLength);
    assert.equal(manifestRecord.path, `assets/${file}.webp`);
    assert.equal(manifestRecord.authorship, "in-repo-authored");
    assert.equal(manifestRecord.license, "AGPL-3.0-only");
    assert.equal(manifestRecord.sha256, outputSha256);
    assert.deepEqual(manifestRecord.dimensions, { height: 512, width: 512 });
  }
});
