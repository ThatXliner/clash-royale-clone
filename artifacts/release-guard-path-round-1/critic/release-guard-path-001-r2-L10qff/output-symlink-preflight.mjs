import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const { buildRelease } = await import(pathToFileURL(process.argv[2]));
const base=await mkdtemp(join(tmpdir(),'release-001b-output-symlink-'));
const root=join(base,'workspace');
const target=join(base,'target');
const output=join(base,'output-link');
const missingConfig=join(base,'missing-config.json');
await mkdir(root); await mkdir(target);
await writeFile(join(root,'sentinel.txt'),'workspace sentinel\\n');
await writeFile(join(target,'sentinel.txt'),'target sentinel\\n');
await symlink(target,output,'dir');
async function snapshot(path){const result=[];async function visit(current,rel){const info=await lstat(current);if(info.isSymbolicLink())result.push([rel,'symlink',await readlink(current)]);else if(info.isDirectory()){result.push([rel,'directory']);for(const name of (await readdir(current)).sort())await visit(join(current,name),rel?`${rel}/${name}`:name);}else if(info.isFile())result.push([rel,'file',Buffer.from(await readFile(current)).toString('base64')]);}await visit(path,'.');return result;}
const before=await snapshot(base);
let observed;
try{await buildRelease({root:await realpath(root),output,configPath:missingConfig});observed='<resolved unexpectedly>';}catch(error){observed=error?.message??String(error);}
const after=await snapshot(base);
assert.equal(observed,'release output must not be a symbolic link');
assert.deepEqual(after,before,'output symlink preflight mutated the fixture');
console.log(JSON.stringify({observed,fixtureUnchanged:true},null,2));
