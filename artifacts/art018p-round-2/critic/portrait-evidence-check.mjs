import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const candidate = "a3ebdb1d41e8a6527b2d50a9928a883b429a5ba0";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pngSize = (bytes) => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
const checks = [];
function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false, error: error.message });
  }
}

const provenance = JSON.parse(await readFile(resolve(root, "docs/art/ember-basin-portrait-v2-provenance.json"), "utf8"));
const source = await readFile(resolve(root, "demo/assets/ember-basin-portrait-v2.png"));
const output = await readFile(resolve(root, "public/assets/ember-basin-portrait-painted-v2.webp"));
const input = await readFile(resolve(root, "demo/assets/ember-basin-portrait.png"));
const lore = (await readFile(resolve(root, "artifacts/art018p-round-2/builder/ember-basin-concept.md"), "utf8")).trim();
const commitFiles = execFileSync("git", ["show", "--pretty=format:", "--name-only", candidate], { encoding: "utf8" }).trim().split("\n").filter(Boolean).sort();
const expectedFiles = [
  "artifacts/art018p-round-2/builder/ember-basin-concept.md",
  "artifacts/art018p-round-2/builder/portrait-128px.png",
  "artifacts/art018p-round-2/builder/portrait-64px.png",
  "artifacts/art018p-round-2/builder/portrait-thumbnails-fixture.png",
  "artifacts/art018p-round-2/builder/portrait-thumbnails.html",
  "artifacts/art018p-round-2/builder/render-portrait-fixture.mjs",
  "demo/assets/ember-basin-portrait-v2.png",
  "docs/art/ember-basin-portrait-v2-provenance.json",
  "public/assets/ember-basin-portrait-painted-v2.webp",
].sort();
const render64 = await readFile(resolve(root, "artifacts/art018p-round-2/critic/fresh-render-64px.png"));
const render128 = await readFile(resolve(root, "artifacts/art018p-round-2/critic/fresh-render-128px.png"));
const fixture = await readFile(resolve(root, "artifacts/art018p-round-2/critic/fresh-render-fixture.png"));

check("candidate is the requested exact commit", () => {
  assert.equal(execFileSync("git", ["rev-parse", candidate], { encoding: "utf8" }).trim(), candidate);
});
check("candidate asset-stage scope is exactly the nine declared files", () => assert.deepEqual(commitFiles, expectedFiles));
check("v1 edit input remains byte-identical to its recorded SHA-256", () => {
  assert.equal(digest(input), "15656baececa9314f1f9ed8b7d2a9539c54acf90e9c53ec1bad8edad14d60926");
  assert.equal(digest(input), provenance.input_images[0].sha256);
  assert.equal(input.length, provenance.input_images[0].bytes);
});
check("v2 source provenance has exact hash, byte count, square dimensions, prompt, tool and license", () => {
  const asset = provenance.assets[0];
  assert.equal(provenance.license, "AGPL-3.0-only");
  assert.equal(provenance.generation_tool, "built-in imagegen");
  assert.equal(provenance.generation_mode, "built-in image edit");
  assert.equal(provenance.input_images[0].asset, "demo/assets/ember-basin-portrait.png");
  assert.equal(asset.source_sha256, digest(source));
  assert.equal(asset.source_bytes, source.length);
  assert.deepEqual(asset.source_dimensions, { width: 1254, height: 1254 });
  assert.ok(asset.prompt.length > 1000);
  assert.equal(asset.generation_output, "/Users/me/.codex/generated_images/01a13730-d3b6-7991-a6bc-47fbddf02af1/exec-0c2dd538-d1cf-4f1d-9fad-09822537541b.png");
});
check("optimized v2 output is byte/hash documented, square 512px and under 1 MiB", () => {
  const asset = provenance.assets[0];
  assert.equal(asset.sha256, digest(output));
  assert.equal(asset.bytes, output.length);
  assert.deepEqual(asset.dimensions, { width: 512, height: 512 });
  assert.ok(output.length <= 1024 * 1024);
  assert.deepEqual(asset.encoding, ["-q", "85", "-m", "6", "-mt", "-resize", "512", "512"]);
});
check("lore has exactly two concrete original sentences", () => {
  const sentences = lore.split(/(?<=[.!?])\s+/);
  assert.equal(sentences.length, 2);
  assert.match(sentences[0], /creek|copper|emberseeds|workshop/i);
  assert.match(sentences[1], /braces|launch channel|water/i);
});
check("fresh browser captures are native-size PNGs", () => {
  assert.equal(render64.toString("ascii", 1, 4), "PNG");
  assert.equal(render128.toString("ascii", 1, 4), "PNG");
  assert.equal(fixture.toString("ascii", 1, 4), "PNG");
  assert.deepEqual(pngSize(render64), { width: 64, height: 64 });
  assert.deepEqual(pngSize(render128), { width: 128, height: 128 });
  assert.deepEqual(pngSize(fixture), { width: 360, height: 220 });
});

console.log(`TAP version 13\n1..${checks.length}`);
checks.forEach((entry, index) => console.log(`${entry.ok ? "ok" : "not ok"} ${index + 1} - ${entry.name}${entry.ok ? "" : `: ${entry.error}`}`));
console.log(`# source ${source.length} bytes sha256=${digest(source)} dimensions=${JSON.stringify(pngSize(source))}`);
console.log(`# output ${output.length} bytes sha256=${digest(output)} webp dimensions=${JSON.stringify(provenance.assets[0].dimensions)}`);
console.log(`# v1 input ${input.length} bytes sha256=${digest(input)}`);
console.log(`# render64 ${render64.length} bytes sha256=${digest(render64)} dimensions=${JSON.stringify(pngSize(render64))}`);
console.log(`# render128 ${render128.length} bytes sha256=${digest(render128)} dimensions=${JSON.stringify(pngSize(render128))}`);
if (checks.some((entry) => !entry.ok)) process.exitCode = 1;
