import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';

const pages = 'artifacts/art-020b-round-1/critic/pages-final';
const releaseRoot = join(pages, 'game');
const manifest = JSON.parse(await readFile(join(releaseRoot, 'release-manifest.json'), 'utf8'));
const protectedSegments = new Set(['reference', 'tests', 'artifacts', 'docs', 'demo', 'node_modules', '.git']);
const forbiddenSourceNames = new Set([
  'rivet-runners-battle-sprite-v1.png',
  'rivet-runners-battle-sprite.png',
  'rivet-runners-portrait.png',
  'rivet-runners-battle-sprite-provenance.json',
]);
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`symlink in Pages output: ${path}`);
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile()) files.push(path);
    else throw new Error(`unsupported Pages output entry: ${path}`);
  }
}
await walk(pages);
const forbiddenPaths = files.map((path) => relative(pages, path).split(sep).join('/'))
  .filter((path) => path.split('/').some((part) => protectedSegments.has(part.toLowerCase())));
const forbiddenNames = files.map((path) => relative(pages, path).split(sep).join('/'))
  .filter((path) => forbiddenSourceNames.has(basename(path)));
const releaseChecks = [];
for (const item of manifest.files) {
  const path = join(releaseRoot, item.path);
  const bytes = await readFile(path);
  const hash = createHash('sha256').update(bytes).digest('hex');
  releaseChecks.push({ path: item.path, expectedBytes: item.size, actualBytes: bytes.length, expectedSha256: item.sha256, actualSha256: hash, pass: bytes.length === item.size && hash === item.sha256 });
}
const newAssetPath = 'public/assets/rivet-runners-battle-sprite.webp';
const newAssetEntries = manifest.files.filter((item) => item.path === newAssetPath);
const newAssetHash = '1813f2570ddf88dc72144ea2b49a24d818e639054c23145aed2a368d619925b4';
const exactHashOccurrences = [];
for (const path of files) {
  const bytes = await readFile(path);
  if (createHash('sha256').update(bytes).digest('hex') === newAssetHash)
    exactHashOccurrences.push(relative(pages, path).split(sep).join('/'));
}
const report = {
  pagesRoot: pages,
  allPagesFiles: files.length,
  releaseFileCount: manifest.fileCount,
  releaseBytes: manifest.totalBytes,
  releaseFileHashesVerified: releaseChecks.every((item) => item.pass),
  releaseChecks,
  protectedPathCount: forbiddenPaths.length,
  protectedPaths: forbiddenPaths,
  sourceOrProvenanceFileCount: forbiddenNames.length,
  sourceOrProvenancePaths: forbiddenNames,
  newAssetManifestEntryCount: newAssetEntries.length,
  newAssetManifestEntry: newAssetEntries[0] ?? null,
  exactNewAssetHashOccurrenceCount: exactHashOccurrences.length,
  exactNewAssetHashOccurrences: exactHashOccurrences,
  result: releaseChecks.every((item) => item.pass) && forbiddenPaths.length === 0 && forbiddenNames.length === 0 && newAssetEntries.length === 1 && exactHashOccurrences.length === 1 ? 'pass' : 'fail',
};
await (await import('node:fs/promises')).writeFile('artifacts/art-020b-round-1/critic/independent-pages-audit.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.result !== 'pass') process.exitCode = 1;
