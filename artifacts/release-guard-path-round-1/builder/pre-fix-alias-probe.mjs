import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, readlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { buildRelease } = await import(pathToFileURL(resolve("scripts/build-release.js")).href);
const sandbox = await mkdtemp(join(tmpdir(), "cards023i-r2-alias-probe-"));
const canonicalParent = join(sandbox, "canonical-parent");
const workspace = join(canonicalParent, "empty-workspace");
const aliasParent = join(sandbox, "parent-alias");
const aliasedWorkspace = join(aliasParent, "empty-workspace");
const missingConfigPath = join(sandbox, "missing-release-build.config.json");
await mkdir(workspace, { recursive: true });
await symlink(canonicalParent, aliasParent, "dir");

async function snapshot(directory) {
  const entries = [];
  async function visit(current) {
    const children = (await readdir(current, { withFileTypes: true }))
      .toSorted((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      const absolute = join(current, child.name);
      const path = relative(directory, absolute).split("\\").join("/");
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) entries.push({ path, type: "symlink", target: await readlink(absolute) });
      else if (info.isDirectory()) {
        entries.push({ path, type: "directory" });
        await visit(absolute);
      } else if (info.isFile()) {
        const bytes = await readFile(absolute);
        entries.push({ path, type: "file", bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex") });
      } else entries.push({ path, type: "other" });
    }
  }
  await visit(directory);
  return entries;
}

const before = await snapshot(sandbox);
let outcome;
try {
  await buildRelease({ root: aliasedWorkspace, output: aliasedWorkspace, configPath: missingConfigPath });
  outcome = { type: "resolved" };
} catch (error) {
  outcome = { type: "rejected", name: error?.name, code: error?.code, message: error?.message };
}
const after = await snapshot(sandbox);
const unchanged = JSON.stringify(before) === JSON.stringify(after);
console.log(JSON.stringify({
  tmpdir: tmpdir(), sandbox, workspaceAlias: aliasedWorkspace,
  workspaceReal: await realpath(aliasedWorkspace), outputAlias: aliasedWorkspace,
  missingConfigPath, outcome, before, after, unchanged,
}, null, 2));
await rm(sandbox, { recursive: true, force: true });
if (!unchanged) process.exitCode = 2;
