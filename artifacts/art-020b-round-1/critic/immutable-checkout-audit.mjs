import { createHash } from 'node:crypto';
import { lstat, readlink, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const commit = '6402dd6c472c3cfd63fd8f06a62505e759159ece';
const root = '/tmp/art-020b-rivet-runners.HZPTr8/checkout-final';
const tree = spawnSync('git', ['ls-tree', '-r', '-z', '-l', '--full-tree', commit], { encoding: 'buffer' });
if (tree.status !== 0) throw new Error(`git ls-tree failed: ${tree.stderr.toString()}`);
const expected = new Map();
for (const record of tree.stdout.toString('utf8').split('\0').filter(Boolean)) {
  const tab = record.indexOf('\t');
  const [mode, type, oid, size] = record.slice(0, tab).split(' ');
  const path = record.slice(tab + 1);
  if (type !== 'blob') throw new Error(`unexpected ${type} entry: ${path}`);
  expected.set(path, { mode, oid, size: Number(size) });
}
const actual = new Set();
const environmentSymlinks = [];
const expectedDependencyLink = '/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules';
const mismatches = [];
let checked = 0;
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    const info = await lstat(full);
    const path = relative(root, full).split(sep).join('/');
    if (info.isDirectory()) await walk(full);
    else if (info.isSymbolicLink() && path === 'node_modules') {
      const target = await readlink(full);
      environmentSymlinks.push({ path, target, expectedTarget: expectedDependencyLink, pass: target === expectedDependencyLink });
    }
    else if (info.isFile() || info.isSymbolicLink()) actual.add(path);
    else mismatches.push({ path, reason: 'unsupported filesystem entry' });
  }
}
await walk(root);
for (const [path, expectedFile] of expected) {
  const full = join(root, path);
  let bytes;
  try {
    const info = await lstat(full);
    bytes = info.isSymbolicLink() ? Buffer.from(await readlink(full)) : await readFile(full);
  } catch (error) {
    if (error?.code === 'ENOENT') mismatches.push({ path, reason: 'missing from clean checkout' });
    else throw error;
    continue;
  }
  const oid = createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
  if (oid !== expectedFile.oid) mismatches.push({ path, reason: 'content differs from immutable commit', expectedOid: expectedFile.oid, actualOid: oid });
  checked++;
}
const extra = [...actual].filter((path) => !expected.has(path)).sort();
const treeSha = spawnSync('git', ['rev-parse', `${commit}^{tree}`], { encoding: 'utf8' });
const report = {
  immutableCommit: commit,
  immutableTreeSha: treeSha.stdout.trim(),
  candidateReceiptTreeSha: 'c1c85103e4caf14c4f05a3dbe101364c8c0ec7a6',
  candidateRoot: root,
  treeShaMatchesCandidateReceipt: treeSha.stdout.trim() === 'c1c85103e4caf14c4f05a3dbe101364c8c0ec7a6',
  expectedTrackedFileCount: expected.size,
  checkedTrackedFileCount: checked,
  extraFileCount: extra.length,
  extraFiles: extra,
  environmentSymlinks,
  mismatchCount: mismatches.length,
  mismatches,
  result: treeSha.stdout.trim() === 'c1c85103e4caf14c4f05a3dbe101364c8c0ec7a6' && checked === expected.size && extra.length === 0 && mismatches.length === 0 && environmentSymlinks.every((item) => item.pass) ? 'pass' : 'fail',
};
await writeFile('artifacts/art-020b-round-1/critic/immutable-checkout-audit.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.result !== 'pass') process.exitCode = 1;
