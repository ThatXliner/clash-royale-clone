import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, candidate, reportPath] = process.argv.slice(2);
if (!repo || !candidate || !reportPath) {
  throw new Error('usage: independent-asset-audit.mjs REPO CANDIDATE REPORT');
}
const base = '3f02b25b84972bc7fcf8963847f899631815d344';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBytes = (path) => execFileSync('git', ['show', `${base}:${path}`], { cwd: repo, maxBuffer: 16 * 1024 * 1024 });
const beforeSource = gitBytes('src/content/visual-asset-manifest.js').toString('base64');
const before = await import(`data:text/javascript;base64,${beforeSource}`);
const after = await import(pathToFileURL(`${candidate}/src/content/visual-asset-manifest.js`).href);
const oldManifest = before.createVisualAssetManifest();
const newManifest = after.createVisualAssetManifest();
const id = 'kilnkeeper-battle-sprite';
const oldRecord = oldManifest.assets.find((asset) => asset.id === id);
const newRecord = newManifest.assets.find((asset) => asset.id === id);
assert.ok(oldRecord && newRecord);
assert.equal(newManifest.assets.length, oldManifest.assets.length);
assert.deepEqual(newManifest.assets.filter((asset) => asset.id !== id), oldManifest.assets.filter((asset) => asset.id !== id));
const oldTargetWithoutExpectedChanges = { ...oldRecord };
const newTargetWithoutExpectedChanges = { ...newRecord };
delete oldTargetWithoutExpectedChanges.byteLength;
delete oldTargetWithoutExpectedChanges.sha256;
delete newTargetWithoutExpectedChanges.byteLength;
delete newTargetWithoutExpectedChanges.sha256;
assert.deepEqual(newTargetWithoutExpectedChanges, oldTargetWithoutExpectedChanges);

const portraitPath = 'demo/assets/kilnkeeper-portrait.png';
const v1Path = 'demo/assets/kilnkeeper-battle-sprite.png';
for (const path of [portraitPath, v1Path]) {
  assert.deepEqual(readFileSync(`${candidate}/${path}`), gitBytes(path), `${path} differs from parent bytes`);
}
const oldOutput = gitBytes('public/assets/kilnkeeper-battle-sprite.webp');
const output = readFileSync(`${candidate}/public/assets/kilnkeeper-battle-sprite.webp`);
const generated = readFileSync(`${candidate}/demo/assets/kilnkeeper-battle-sprite-v2.png`);
const provenance = JSON.parse(readFileSync(`${candidate}/docs/art/kilnkeeper-battle-sprite-provenance.json`, 'utf8'));
const metadata = JSON.parse(readFileSync(`${candidate}/artifacts/art019b-round-2/builder/asset-metadata.json`, 'utf8'));

assert.equal(newRecord.byteLength, output.length);
assert.equal(newRecord.sha256, hash(output));
assert.ok(output.length < 1024 * 1024);
assert.equal(provenance.license, 'AGPL-3.0-only');
assert.equal(provenance.authorship, 'in-repo-authored');
assert.equal(provenance.tool_source, 'OpenAI built-in imagegen image-edit tool');
assert.equal(provenance.generated_source.sha256, hash(generated));
assert.equal(provenance.shipped_output.sha256, hash(output));
assert.equal(provenance.shipped_output.bytes, output.length);
assert.equal(provenance.supersedes.generated_source_sha256, hash(readFileSync(`${candidate}/${v1Path}`)));
assert.equal(provenance.supersedes.shipped_output_sha256, hash(oldOutput));
assert.ok(provenance.prompt.length > 1000);
assert.equal(metadata.source_generation_tool, 'OpenAI built-in imagegen edit tool');
assert.deepEqual(metadata.encoding.arguments, ['-q', '88', '-m', '6', '-mt', '-resize', '512', '512']);
assert.equal(metadata.v2.generated_source.sha256, hash(generated));
assert.equal(metadata.v2.shipped_output.sha256, hash(output));
assert.equal(metadata.inputs.approved_portrait.sha256, hash(readFileSync(`${candidate}/${portraitPath}`)));
assert.equal(metadata.inputs.v1_cutout.sha256, hash(readFileSync(`${candidate}/${v1Path}`)));

const result = {
  base_commit: base,
  candidate: candidate,
  manifest_asset_count: newManifest.assets.length,
  unchanged_non_target_manifest_records: true,
  target_changed_fields_only: ['byteLength', 'sha256'],
  approved_portrait_bytes_match_parent: true,
  v1_cutout_bytes_match_parent: true,
  v1_output_hash_preserved_in_history: hash(oldOutput),
  generated_source_sha256: hash(generated),
  shipped_output_sha256: hash(output),
  shipped_output_bytes: output.length,
  under_1_mib: true,
  provenance_license_tool_prompt_and_encoding_verified: true,
};
writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
