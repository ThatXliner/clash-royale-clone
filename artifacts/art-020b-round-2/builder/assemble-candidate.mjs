import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const expectedHead = 'dbd7afe4a8901b5b61c83ebc92137a5bd26e5451';
const root = process.cwd();
const privateIndex = '/tmp/art-020b-round-2-builder.index';
const baseManifestPath = '/tmp/art-020b-round-2-base-manifest.js';
const candidateManifestPath = '/tmp/art-020b-round-2-candidate-manifest.js';
const gitEnv = { ...process.env, GIT_INDEX_FILE: privateIndex };
function git(args, env = gitEnv) {
  return execFileSync('git', args, { cwd: root, env, encoding: 'utf8' }).trimEnd();
}
const head = git(['rev-parse', 'HEAD'], process.env);
if (head !== expectedHead) throw new Error(`HEAD moved: expected ${expectedHead}, got ${head}`);
const baseManifest = git(['show', 'HEAD:src/content/visual-asset-manifest.js'], process.env) + '\n';
if (baseManifest.includes('id: "rivet-runners-battle-sprite"')) throw new Error('Asset record already exists in base HEAD');
const record = `  {
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
const targetId = '    id: "rivet-runners-portrait-painted",';
const target = baseManifest.indexOf(targetId);
if (target < 0) throw new Error('Expected portrait record anchor is absent from base HEAD');
const rowStart = baseManifest.lastIndexOf('  {\n', target);
if (rowStart < 0) throw new Error('Could not locate portrait record boundary');
const candidateManifest = baseManifest.slice(0, rowStart) + record + baseManifest.slice(rowStart);
if (candidateManifest.replace(record, '') !== baseManifest) throw new Error('Candidate manifest changes more than the new record');
await writeFile(candidateManifestPath, candidateManifest);
await writeFile(baseManifestPath, baseManifest);
const delta = spawnSync('diff', [
  '-u', '--label', 'a/src/content/visual-asset-manifest.js', '--label', 'b/src/content/visual-asset-manifest.js',
  baseManifestPath, candidateManifestPath,
], { encoding: 'utf8' });
if (delta.status !== 1) throw new Error(`Expected one manifest diff, got status ${delta.status}`);
await writeFile(`${root}/artifacts/art-020b-round-2/builder/manifest-delta.patch`, delta.stdout);
git(['read-tree', 'HEAD']);
const manifestBlob = git(['hash-object', '-w', candidateManifestPath]);
git(['update-index', '--cacheinfo', `100644,${manifestBlob},src/content/visual-asset-manifest.js`]);
git([
  'add', '--',
  'demo/assets/rivet-runners-battle-sprite-v1.png',
  'demo/assets/rivet-runners-battle-sprite-v2.png',
  'demo/assets/rivet-runners-battle-sprite.png',
  'public/assets/rivet-runners-battle-sprite.webp',
  'docs/art/rivet-runners-battle-sprite-provenance.json',
  'artifacts/art-020b-round-2/builder',
]);
const tree = git(['write-tree']);
const files = git(['ls-tree', '-r', '--name-only', tree]).split('\n');
const owned = files.filter((path) => path.startsWith('demo/assets/rivet-runners-battle-sprite')
  || path === 'public/assets/rivet-runners-battle-sprite.webp'
  || path === 'docs/art/rivet-runners-battle-sprite-provenance.json'
  || path.startsWith('artifacts/art-020b-round-2/builder/'));
const baseline = git(['diff-tree', '--no-commit-id', '--name-status', '-r', 'HEAD', tree]).split('\n').filter(Boolean);
const manifestBytes = await readFile(candidateManifestPath);
const report = {
  baseHead: head,
  candidateTree: tree,
  manifestBaseSha256: createHash('sha256').update(Buffer.from(baseManifest)).digest('hex'),
  manifestCandidateSha256: createHash('sha256').update(manifestBytes).digest('hex'),
  changePaths: baseline,
  ownedPaths: owned,
};
console.log(JSON.stringify(report, null, 2));
