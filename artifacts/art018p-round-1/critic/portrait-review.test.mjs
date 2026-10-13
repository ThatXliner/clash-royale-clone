import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const archive = process.env.ART018P_ARCHIVE;
const evidence = "/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/art018p-round-1/critic";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pngSize = (bytes) => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });

test("candidate source and shipped portrait match declared provenance", async () => {
  assert.ok(archive, "ART018P_ARCHIVE must point at the clean candidate archive");
  const sourcePath = join(archive, "demo/assets/ember-basin-portrait.png");
  const outputPath = join(archive, "public/assets/ember-basin-portrait-painted.webp");
  const provenance = JSON.parse(await readFile(join(archive, "docs/art/ember-basin-portrait-provenance.json"), "utf8"));
  const asset = provenance.assets[0];
  const sourceBytes = await readFile(sourcePath);
  const outputBytes = await readFile(outputPath);
  assert.equal(digest(sourceBytes), asset.source_sha256);
  assert.equal(sourceBytes.length, asset.source_bytes);
  assert.deepEqual(asset.source_dimensions, { width: 1254, height: 1254 });
  assert.equal(digest(outputBytes), asset.sha256);
  assert.equal(outputBytes.length, asset.bytes);
  assert.ok(outputBytes.length <= 1024 * 1024);
  assert.deepEqual(asset.dimensions, { width: 512, height: 512 });
  assert.equal(provenance.license, "AGPL-3.0-only");
  assert.equal(provenance.authorship, "in-repo-authored");
  assert.equal(provenance.generation_tool, "built-in imagegen");
  assert.ok(provenance.generation_mode);
  assert.ok(asset.prompt.length > 100);
  assert.ok(asset.encoding.length > 0);
  assert.deepEqual(asset.input_images, []);
});

test("fresh browser fixture rendered and decoded square thumbnails", async () => {
  const result = JSON.parse(await readFile(join(evidence, "fixture-result.json"), "utf8"));
  assert.deepEqual(result.decodedAssets, {
    source: { width: 1254, height: 1254 },
    shipped: { width: 512, height: 512 },
  });
  assert.deepEqual(result.geometry["thumb-64"], {
    loaded: true, naturalWidth: 512, naturalHeight: 512, width: 64, height: 64,
  });
  assert.deepEqual(result.geometry["thumb-128"], {
    loaded: true, naturalWidth: 512, naturalHeight: 512, width: 128, height: 128,
  });
  const expected = [
    ["portrait-64px.png", { width: 64, height: 64 }],
    ["portrait-128px.png", { width: 128, height: 128 }],
    ["portrait-thumbnails-fixture.png", { width: 360, height: 220 }],
  ];
  for (const [name, dimensions] of expected) {
    const bytes = await readFile(join(evidence, name));
    assert.equal(bytes.toString("ascii", 1, 4), "PNG");
    assert.deepEqual(pngSize(bytes), dimensions);
  }
});

test("the concept contains exactly two concrete original lore sentences", async () => {
  const concept = await readFile(join(archive, "artifacts/art018p-round-1/builder/ember-basin-concept.md"), "utf8");
  const prose = concept.split("\n").filter((line) => line.trim() && !line.startsWith("#")).join(" ");
  const sentences = prose.match(/[.!?](?:\s|$)/g) ?? [];
  assert.equal(sentences.length, 2);
  assert.match(prose, /creek|copper|emberseed|rootwood|slate/i);
});
