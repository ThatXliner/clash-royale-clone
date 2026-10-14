import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const readmePath = path.join(repoRoot, "README.md");
const source = readFileSync(readmePath, "utf8");
const targets = [];

for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
  targets.push({ kind: "markdown", target: match[1].trim().split(/\s+/, 1)[0] });
}
for (const match of source.matchAll(/<(?:a|img)\b[^>]*?\b(?:href|src)=["']([^"']+)["'][^>]*>/gi)) {
  targets.push({ kind: "html", target: match[1].trim() });
}

const localTargets = [];
const skippedExternal = [];
for (const item of targets) {
  const { target } = item;
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target) || target.startsWith("#")) {
    skippedExternal.push(item);
    continue;
  }
  const decoded = decodeURIComponent(target.split(/[?#]/, 1)[0]);
  if (!decoded) continue;
  const resolved = path.resolve(repoRoot, decoded);
  const insideRepo = resolved === repoRoot || resolved.startsWith(`${repoRoot}${path.sep}`);
  localTargets.push({
    ...item,
    path: decoded,
    exists: insideRepo && existsSync(resolved),
  });
}

const missing = localTargets.filter(({ exists }) => !exists);
const result = {
  readmeSha256: createHash("sha256").update(source).digest("hex"),
  localLinksChecked: localTargets.length,
  localLinksMissing: missing.length,
  localLinks: localTargets,
  externalLinksSkipped: skippedExternal.length,
  missing,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (missing.length > 0) process.exitCode = 1;
