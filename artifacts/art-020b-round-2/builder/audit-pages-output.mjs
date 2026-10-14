import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const outputRoot = '/tmp/art-020b-round-2-pages';
const gameRoot = resolve(outputRoot, 'game');
const releaseManifest = JSON.parse(await readFile(resolve(gameRoot, 'release-manifest.json'), 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const checks = [];
for (const file of releaseManifest.files) {
  const path = resolve(gameRoot, file.path);
  const bytes = await readFile(path);
  const actualHash = hash(bytes);
  const actualSize = (await stat(path)).size;
  if (actualHash !== file.sha256 || actualSize !== file.size) throw new Error(`Release file mismatch: ${file.path}`);
  checks.push({ path: file.path, sha256: actualHash, bytes: actualSize });
}
const webpRelative = 'public/assets/rivet-runners-battle-sprite.webp';
const webp = checks.filter((file) => file.path === webpRelative);
if (webp.length !== 1 || webp[0].sha256 !== '0a9d033f894bd19178871a2927117cf66bb7f42c0b65dc224e11cecca0b4ce53') {
  throw new Error('New battle WebP is missing, duplicated, or hash-mismatched');
}
const allFiles = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else allFiles.push(path.slice(outputRoot.length + 1));
  }
}
await walk(outputRoot);
const protectedFiles = allFiles.filter((path) => path.includes('/demo/assets/')
  || path.startsWith('demo/assets/')
  || path.includes('/docs/art/')
  || path.startsWith('docs/art/'));
if (protectedFiles.length !== 0) throw new Error(`Source/provenance leaked into Pages output: ${protectedFiles.join(', ')}`);
const baseManifest = await readFile('/tmp/art-020b-round-2-base-manifest.js', 'utf8');
const candidateManifest = await readFile('/tmp/art-020b-round-2-candidate-manifest.js', 'utf8');
const addedRecord = `  {
    authorship: "in-repo-authored",
    byteLength: 78170,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "rivet-runners-battle-sprite",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/rivet-runners-battle-sprite.webp",
    sha256: "0a9d033f894bd19178871a2927117cf66bb7f42c0b65dc224e11cecca0b4ce53",
  },
`;
if (candidateManifest.replace(addedRecord, '') !== baseManifest) throw new Error('Candidate manifest changes bytes beyond its one new record');
const report = {
  releaseFileCount: releaseManifest.fileCount,
  releaseTotalBytes: releaseManifest.totalBytes,
  verifiedReleaseFileHashes: checks.length,
  battleWebp: webp[0],
  protectedSourceOrProvenancePathsInOutput: protectedFiles,
  priorManifestBytesPreserved: true,
  manifestAddedRecordCount: 1,
  outputFiles: allFiles.length,
};
console.log(JSON.stringify(report, null, 2));
