import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

const root = resolve(process.argv[2]);
const rows = [];
async function walk(dir) {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name))) {
    if (dir === root && entry.name === 'artifacts') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile()) {
      const bytes = await readFile(path);
      rows.push(`${createHash('sha256').update(bytes).digest('hex')}  ${relative(root, path).split(sep).join('/')}`);
    } else if (entry.isSymbolicLink()) {
      rows.push(`SYMLINK  ${relative(root, path).split(sep).join('/')} -> ${await stat(path).then(() => 'resolves')}`);
    }
  }
}
await walk(root);
rows.sort();
process.stdout.write(`${rows.join('\n')}\n`);
