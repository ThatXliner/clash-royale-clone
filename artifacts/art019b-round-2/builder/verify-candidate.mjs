import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repoArg, base, candidateArg] = process.argv.slice(2);
if (!repoArg || !base || !candidateArg) throw new Error('usage: verify-candidate.mjs REPO BASE CANDIDATE');
const repo = resolve(repoArg);
const candidate = resolve(candidateArg);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const source = execFileSync('git', ['show', `${base}:src/content/visual-asset-manifest.js`], { cwd: repo, maxBuffer: 16 * 1024 * 1024 });
const before = await import(`data:text/javascript;base64,${source.toString('base64')}`);
const after = await import(pathToFileURL(join(candidate, 'src/content/visual-asset-manifest.js')).href);
const oldAssets = before.createVisualAssetManifest().assets;
const newAssets = after.createVisualAssetManifest().assets;
const id = 'kilnkeeper-battle-sprite';
const oldRecord = oldAssets.find((item) => item.id === id);
const newRecord = newAssets.find((item) => item.id === id);
assert.ok(oldRecord && newRecord, 'expected existing Kilnkeeper battle asset record');
assert.deepEqual(newAssets.filter((item) => item.id !== id), oldAssets.filter((item) => item.id !== id));
const oldWithoutUpdatedFields = { ...oldRecord };
const newWithoutUpdatedFields = { ...newRecord };
delete oldWithoutUpdatedFields.byteLength;
delete oldWithoutUpdatedFields.sha256;
delete newWithoutUpdatedFields.byteLength;
delete newWithoutUpdatedFields.sha256;
assert.deepEqual(newWithoutUpdatedFields, oldWithoutUpdatedFields);
const portraitPath = 'demo/assets/kilnkeeper-portrait.png';
const v1Path = 'demo/assets/kilnkeeper-battle-sprite.png';
for (const path of [portraitPath, v1Path]) {
  const original = execFileSync('git', ['show', `${base}:${path}`], { cwd: repo, maxBuffer: 16 * 1024 * 1024 });
  const retained = readFileSync(join(candidate, path));
  assert.deepEqual(retained, original, `${path} changed from the base commit`);
}
const outputPath = 'public/assets/kilnkeeper-battle-sprite.webp';
const output = readFileSync(join(candidate, outputPath));
assert.equal(newRecord.byteLength, output.length);
assert.equal(newRecord.sha256, sha(output));
const provenance = JSON.parse(readFileSync(join(candidate, 'docs/art/kilnkeeper-battle-sprite-provenance.json'), 'utf8'));
assert.equal(provenance.license, 'AGPL-3.0-only');
assert.equal(provenance.generated_source.sha256, sha(readFileSync(join(candidate, provenance.generated_source.path))));
assert.equal(provenance.shipped_output.sha256, sha(output));
assert.ok(provenance.prompt.length > 1000);
const result = {
  base_head: base,
  manifest_asset_count_before: oldAssets.length,
  manifest_asset_count_after: newAssets.length,
  unchanged_existing_manifest_records: true,
  changed_target_fields: ['byteLength', 'sha256'],
  approved_portrait_bytes_unchanged: true,
  v1_source_bytes_retained: true,
  output_hash_and_length_match_manifest: true,
  provenance_hashes_and_prompt_verified: true,
};
const outputFile = join(candidate, 'artifacts/art019b-round-2/builder/manifest-preservation.json');
writeFileSync(outputFile, JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
