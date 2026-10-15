import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const candidate = process.argv[2];
const { buildRelease } = await import(pathToFileURL(candidate));
const base = await mkdtemp(join(tmpdir(), 'release-001b-independent-preflight-'));
const root = join(base, 'workspace');
const alias = join(tmpdir(), `release-001b-parent-alias-${process.pid}`);
const target = join(base, 'sentinel-target');
const missingConfig = join(base, 'missing-config.json');
await mkdir(join(root, 'reference'), { recursive: true });
await mkdir(join(root, 'dist'), { recursive: true });
await mkdir(target);
await writeFile(join(root, 'sentinel.txt'), Buffer.from('workspace sentinel\n'));
await writeFile(join(root, 'reference', 'sentinel.txt'), Buffer.from('reference sentinel\n'));
await writeFile(join(root, 'dist', 'sentinel.txt'), Buffer.from('dist sentinel\n'));
await writeFile(join(target, 'sentinel.txt'), Buffer.from('target sentinel\n'));
await symlink(base, alias, 'dir');

async function snapshot(path) {
  const result = [];
  async function visit(current, rel) {
    const info = await lstat(current);
    if (info.isSymbolicLink()) {
      result.push([rel, 'symlink', await readlink(current)]);
    } else if (info.isDirectory()) {
      result.push([rel, 'directory']);
      for (const name of (await readdir(current)).sort()) await visit(join(current, name), rel ? `${rel}/${name}` : name);
    } else if (info.isFile()) {
      result.push([rel, 'file', Buffer.from(await readFile(current)).toString('base64')]);
    } else {
      result.push([rel, 'other']);
    }
  }
  await visit(path, '.');
  return result;
}

const before = { fixture: await snapshot(base), alias: await readlink(alias) };
const canonicalRoot = await realpath(root);
const cases = [
  ['filesystem-root', '/', 'refusing filesystem root as release output'],
  ['home-root', homedir(), 'refusing home directory as release output'],
  ['temporary-directory-root', tmpdir(), 'refusing temporary directory root as release output'],
  ['workspace-root', root, 'refusing workspace root as release output'],
  ['workspace-through-symlinked-parent', join(alias, 'workspace'), 'refusing workspace root as release output'],
  ['ordinary-ancestor', base, 'refusing an output that contains the workspace'],
  ['ancestor-through-symlinked-parent', alias, 'refusing an output that contains the workspace'],
  ['reference-protected-target', join(root, 'reference', 'probe'), 'refusing protected repository path as release output'],
  ['dist-protected-target', join(root, 'dist', 'probe'), 'refusing protected repository path as release output'],
];
const results = [];
for (const [name, output, expected] of cases) {
  let actual;
  try {
    await buildRelease({ root: canonicalRoot, output, configPath: missingConfig });
    actual = '<resolved unexpectedly>';
  } catch (error) {
    actual = error?.message ?? String(error);
  }
  results.push({ name, output, expected, actual, pass: actual === expected });
}
const after = { fixture: await snapshot(base), alias: await readlink(alias) };
assert.deepEqual(results.filter((result) => !result.pass), [], 'preflight error did not match exactly');
assert.deepEqual(after, before, 'preflight probe changed a disposable fixture or alias');
console.log(JSON.stringify({ candidate, tmpdir: tmpdir(), cases: results, fixtureUnchanged: true }, null, 2));
