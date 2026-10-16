import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, extname, relative } from 'node:path';
const root = process.cwd();
const seen = new Set();
const pending = process.argv.slice(2).map((p) => resolve(root, p));
const patterns = [
  /\bimport\s*(?:[^'";]*?\sfrom\s*)?["']([^"']+)["']/gu,
  /\bexport\s*[^'";]*?\sfrom\s*["']([^"']+)["']/gu,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
];
while (pending.length) {
  const file = pending.pop();
  if (seen.has(file) || !existsSync(file)) continue;
  seen.add(file);
  if (extname(file) !== '.js' && extname(file) !== '.mjs' && extname(file) !== '.cjs') continue;
  const source = readFileSync(file, 'utf8');
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const spec = match[1];
      if (!spec.startsWith('.')) continue;
      let target = resolve(dirname(file), spec);
      if (!extname(target)) {
        const found = ['.js', '.mjs', '.json'].map((ext) => `${target}${ext}`).find(existsSync);
        if (found) target = found;
      }
      if (existsSync(target)) pending.push(target);
    }
  }
}
for (const file of [...seen].sort()) {
  const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
  process.stdout.write(`${sha}  ${relative(root, file)}\n`);
}
