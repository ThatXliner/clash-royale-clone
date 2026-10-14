import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = process.cwd();
const builder = `${root}/artifacts/art-020b-round-2/builder`;
const fileInfo = async (path) => {
  const bytes = await readFile(`${root}/${path}`);
  return { path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: (await stat(`${root}/${path}`)).size };
};
const products = await Promise.all([
  'demo/assets/rivet-runners-battle-sprite-v1.png',
  'demo/assets/rivet-runners-battle-sprite-v2.png',
  'demo/assets/rivet-runners-battle-sprite.png',
  'public/assets/rivet-runners-battle-sprite.webp',
  'docs/art/rivet-runners-battle-sprite-provenance.json',
].map(fileInfo));
const candidateManifest = await readFile('/tmp/art-020b-round-2-candidate-manifest.js');
const manifest = {
  path: 'src/content/visual-asset-manifest.js',
  sha256: createHash('sha256').update(candidateManifest).digest('hex'),
  bytes: candidateManifest.length,
  base_sha256: '7687ba0f87627eb9866a98153db4318d223431cb2a6b45eed851e4048ce79358',
  added_records: 1,
};
const chrome = JSON.parse(await readFile(`${builder}/native-chrome-evidence.json`, 'utf8'));
const tap = await readFile(`${builder}/visual-asset-manifest.tap`, 'utf8');
const pass = Number(tap.match(/^# pass (\d+)$/m)?.[1] ?? 0);
const fail = Number(tap.match(/^# fail (\d+)$/m)?.[1] ?? -1);
if (pass !== 6 || fail !== 0) throw new Error(`Unexpected manifest test result: ${pass} pass, ${fail} fail`);
const pages = JSON.parse(await readFile(`${builder}/pages-build-exclusion.json`, 'utf8'));
const files = [
  'artifacts/art-020b-round-2/builder/assemble-candidate.mjs',
  'artifacts/art-020b-round-2/builder/audit-pages-output.mjs',
  'artifacts/art-020b-round-2/builder/asset-hashes.sha256',
  'artifacts/art-020b-round-2/builder/builder-receipt.json',
  'artifacts/art-020b-round-2/builder/candidate-owned-files.txt',
  'artifacts/art-020b-round-2/builder/manifest-delta.patch',
  'artifacts/art-020b-round-2/builder/native-chrome-css-13-dark-dpr1.png',
  'artifacts/art-020b-round-2/builder/native-chrome-css-13-light-dpr1.png',
  'artifacts/art-020b-round-2/builder/native-chrome-css-26-dark-dpr1.png',
  'artifacts/art-020b-round-2/builder/native-chrome-css-26-light-dpr1.png',
  'artifacts/art-020b-round-2/builder/native-chrome-evidence.json',
  'artifacts/art-020b-round-2/builder/pages-build-exclusion.json',
  'artifacts/art-020b-round-2/builder/pages-build.log',
  'artifacts/art-020b-round-2/builder/record-receipts.mjs',
  'artifacts/art-020b-round-2/builder/render-native.mjs',
  'artifacts/art-020b-round-2/builder/update-provenance.mjs',
  'artifacts/art-020b-round-2/builder/visual-asset-manifest.tap',
  ...products.map((file) => file.path),
  manifest.path,
];
await writeFile(`${builder}/candidate-owned-files.txt`, `${files.join('\n')}\n`);
await writeFile(`${builder}/asset-hashes.sha256`, `${[...products, { path: manifest.path, sha256: manifest.sha256 }]
  .map((file) => `${file.sha256}  ${file.path}`).join('\n')}\n`);
const receipt = {
  baseHead: 'dbd7afe4a8901b5b61c83ebc92137a5bd26e5451',
  scope: 'ART-020B round-two asset preparation only; no gameplay integration or art verdict',
  authorship: 'in-repo-authored',
  license: 'AGPL-3.0-only',
  sources: products.slice(0, 3),
  approvedPortraitInput: {
    path: 'demo/assets/rivet-runners-portrait.png',
    sha256: 'b84c733e475b50d746d955ec805d0c5da1e998ca4e2fc9f76305f661ce942de0',
    dimensions: { width: 1254, height: 1254 },
    bytes: 2819557,
  },
  shippedOutput: products[3],
  provenance: products[4],
  manifest,
  nativeChromeDpr1: {
    browser: chrome.browser,
    version: chrome.version,
    sourceSha256: chrome.sha256,
    renders: chrome.renders.map(({ sizeCssPx, background, complete, naturalWidth, naturalHeight, renderedWidth, renderedHeight, stageWidth, stageHeight, devicePixelRatio, alphaMin8Bit, alphaMax8Bit, screenshot }) => ({
      sizeCssPx, background, complete, naturalWidth, naturalHeight, renderedWidth, renderedHeight, stageWidth, stageHeight, devicePixelRatio, alphaMin8Bit, alphaMax8Bit, screenshot: screenshot.split('/').at(-1),
    })),
  },
  manifestTests: { command: 'npm run test:visual-asset-manifest', passed: pass, failed: fail },
  pagesBuild: {
    command: 'npm run build:pages -- --out /tmp/art-020b-round-2-pages --repository ThatXliner/clash-royale-clone --ref art-020b-round-2-candidate',
    releaseFileCount: pages.releaseFileCount,
    releaseTotalBytes: pages.releaseTotalBytes,
    verifiedReleaseFileHashes: pages.verifiedReleaseFileHashes,
    newWebpOccurrences: 1,
    protectedSourceOrProvenancePathsInOutput: pages.protectedSourceOrProvenancePathsInOutput,
    priorManifestBytesPreserved: pages.priorManifestBytesPreserved,
    manifestAddedRecordCount: pages.manifestAddedRecordCount,
  },
  candidateFiles: files,
  candidateTree: 'reported separately; this receipt is part of the candidate tree',
};
delete receipt.candidateTree;
await writeFile(`${builder}/builder-receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`);
