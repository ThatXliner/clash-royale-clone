import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readdir, readFile, readlink, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const oldScript = process.argv[2];
const { buildRelease } = await import(pathToFileURL(oldScript));
const base = await mkdtemp(join(tmpdir(), 'release-001b-old-negative-'));
const root = join(base, 'workspace');
const alias = join(tmpdir(), `release-001b-old-parent-alias-${process.pid}`);
const missingConfig = join(base, 'missing-config.json');
await mkdir(root);
await writeFile(join(root, 'sentinel.txt'), Buffer.from('old control sentinel\n'));
await symlink(base, alias, 'dir');
async function snapshot(path) {
 const result=[];
 async function visit(current, rel) {
  const info=await lstat(current);
  if(info.isSymbolicLink()) result.push([rel,'symlink',await readlink(current)]);
  else if(info.isDirectory()) { result.push([rel,'directory']); for(const name of (await readdir(current)).sort()) await visit(join(current,name),rel?`${rel}/${name}`:name); }
  else if(info.isFile()) result.push([rel,'file',Buffer.from(await readFile(current)).toString('base64')]);
 }
 await visit(path,'.'); return result;
}
const before={fixture:await snapshot(base),alias:await readlink(alias)};
let observed;
try {
 await buildRelease({root:await realpath(root),output:join(alias,'workspace'),configPath:missingConfig});
 observed='<resolved unexpectedly>';
} catch(error) { observed=error?.message ?? String(error); }
const after={fixture:await snapshot(base),alias:await readlink(alias)};
assert.match(observed,/ENOENT|no such file/i,'old source unexpectedly passed the guarded aliased target');
assert.deepEqual(after,before,'old-source negative control changed the disposable fixture');
console.log(JSON.stringify({oldScript,observed,expectedRegression:'missing-config error instead of workspace-output guard',fixtureUnchanged:true},null,2));
