const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");
const sourceRel = "demo/assets/buried-coil-revealed-original.svg";
const outputRel = "public/assets/buried-coil-revealed.svg";
const manifestRel = "src/content/visual-asset-manifest.js";
const provenanceRel = "docs/art/buried-coil-revealed-provenance.json";
const sourcePath = path.join(root, sourceRel);
const outputPath = path.join(root, outputRel);
const source = fs.readFileSync(sourcePath, "utf8");
const output = source.replace(/<!--[\s\S]*?-->/g, "").replace(/>\s+</g, "><").trim();
const outputBytes = Buffer.from(output, "utf8");
const outputSha = hash(outputBytes);
fs.writeFileSync(outputPath, outputBytes);

let manifest = fs.readFileSync(path.join(root, manifestRel), "utf8");
const recordPattern = /(    byteLength: )\d+(,\n    dimensions: \{ height: 13, width: 13 \},\n    format: "svg",\n    id: "buried-coil-revealed-battle-sprite",\n    kind: "image",\n    license: "AGPL-3.0-only",\n    path: "assets\/buried-coil-revealed\.svg",\n    sha256: ")[a-f0-9]{64}(")/g;
let replacements = 0;
manifest = manifest.replace(recordPattern, (_, prefix, suffix, ending) => {
  replacements += 1;
  return `${prefix}${outputBytes.length}${suffix}${outputSha}${ending}`;
});
assert.equal(replacements, 1, "expected one revealed SVG manifest record");
fs.writeFileSync(path.join(root, manifestRel), manifest);

const sourceBytes = fs.readFileSync(sourcePath);
const provenancePath = path.join(root, provenanceRel);
const provenance = JSON.parse(fs.readFileSync(provenancePath, "utf8"));
assert.equal(provenance.asset_id, "buried-coil-revealed-battle-sprite");
provenance.version = 4;
provenance.authored_source.bytes = sourceBytes.length;
provenance.authored_source.sha256 = hash(sourceBytes);
provenance.shipped_output.bytes = outputBytes.length;
provenance.shipped_output.sha256 = outputSha;
provenance.vector_prototype_reference.note = "The R3 prototype captures use the original source SVG before public minification. R3's independent critique found the loops and three feet discernible, but only 3 exact team-color pixels at 13 CSS px versus the 8-pixel bar; the 26 CSS px stage had 24. R4 shortens only the lower foot bases to leave a transparent row over the separate plate. R4 native captures use the unchanged asset-stage fixture and do not claim live arena or card-template integration.";
provenance.round3_status = "R3 independent critique failed the 13 CSS px team-plate bar (3 exact pixels versus 8); loops and three feet were discernible, and the 26 CSS px stage had 24. Raw critique evidence is preserved under artifacts/art021p-round4/builder/r3-reference/.";
provenance.round4_status = "R4 asset revision prepared; exact fixture rerender and focused manifest verification pending. No pass or adoption claim. Live arena and card-template integration remain unverified.";
fs.writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);

const recordStart = manifest.indexOf('    id: "buried-coil-revealed-battle-sprite",');
const recordEnd = manifest.indexOf("\n  },", recordStart);
assert.notEqual(recordStart, -1);
const recordText = manifest.slice(recordStart, recordEnd + 5);
const receipt = {
  base: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  source: { path: sourceRel, bytes: sourceBytes.length, sha256: hash(sourceBytes) },
  output: { path: outputRel, format: "svg", dimensions: { width: 13, height: 13 }, bytes: outputBytes.length, sha256: outputSha },
  optimization: "Deterministic removal of XML comments and whitespace between tags only.",
  manifestRecord: recordText,
  provenance: { path: provenanceRel, version: provenance.version, bytes: fs.statSync(provenancePath).size, sha256: hash(fs.readFileSync(provenancePath)) },
  r3FailureRetained: "Exact source, shipped SVG, provenance, independent critic teamplate counts, and native stage screenshots are in r3-reference/.",
};
fs.writeFileSync(path.join(__dirname, "asset-build-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
