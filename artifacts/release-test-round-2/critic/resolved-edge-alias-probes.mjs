import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
const archiveRoot = process.env.RELEASE_ARCHIVE_ROOT;
if (!archiveRoot) throw new Error("RELEASE_ARCHIVE_ROOT is required");
const { buildRelease } = await import(join(archiveRoot, "scripts/build-release.js"));

const temporary = await mkdtemp(join(tmpdir(), "release-resolved-edge-critic-"));
const cases = [];
async function probe(name, entry, files, expectReject) {
  const root = join(temporary, name);
  const output = join(temporary, `${name}-artifact`);
  const sourceFiles = {
    "public/index.html": '<!doctype html><script type="module" src="./entry.js"></script>',
    "public/entry.js": entry,
    ...files,
  };
  for (const [path, contents] of Object.entries(sourceFiles)) {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  }
  const configPath = join(root, "release-build.config.json");
  await writeFile(configPath, `${JSON.stringify({
    schemaVersion: 1,
    entries: ["public/index.html"],
    limits: { maxFiles: 32, maxFileBytes: 4096, maxTotalBytes: 32768 },
    allowedExtensions: [".html", ".js", ".json"],
  })}\n`);
  try {
    const result = await buildRelease({ root, output, configPath });
    const manifestBytes = await readFile(join(output, "release-manifest.json"));
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    const js = [];
    for (const file of manifest.files.filter(({ path }) => path.endsWith(".js"))) {
      js.push({ path: file.path, source: (await readFile(join(output, file.path), "utf8")) });
    }
    cases.push({ name, outcome: "accepted", fileCount: result.fileCount, js });
  } catch (error) {
    cases.push({ name, outcome: "rejected", error: error.message });
  }
  const actual = cases.at(-1).outcome === "rejected";
  assert.equal(actual, expectReject, `${name} expected rejection=${expectReject}`);
}

try {
  const referenceName = "vite-fs-reference-alias-query";
  const referencePath = join(temporary, referenceName, "reference/stats/cards.json");
  await probe(referenceName,
    `import cards from ${JSON.stringify(`/@fs${referencePath}?raw`)};\nexport const clean = true;\n`,
    { "reference/stats/cards.json": JSON.stringify({ marker: "REF-ALIAS-7a2c" }) }, true);

  const packageName = "vite-fs-package-alias";
  const packagePath = join(temporary, packageName, "node_modules/reviewer-probe/file.js");
  await probe(packageName,
    `import { marker } from ${JSON.stringify(`/@fs${packagePath}`)};\nexport const clean = true;\n`,
    { "node_modules/reviewer-probe/file.js": 'export const marker = "PACKAGE-ALIAS-7a2c";\n' }, true);

  await probe("js-export-star-reference",
    'export * from "../reference/private.js";\n',
    { "reference/private.js": "export const marker = true;\n" }, true);

  await probe("inline-static-import-internal",
    "export const clean = true;\n",
    { "public/index.html": '<!doctype html><script type="module">import "vite/modulepreload-polyfill";</script>' }, true);

  await probe("inline-dynamic-import-internal",
    "export const clean = true;\n",
    { "public/index.html": '<!doctype html><script type="module">void import("vite/modulepreload-polyfill");</script>' }, true);

  await probe("inline-reference-import",
    "export const clean = true;\n",
    {
      "public/index.html": '<!doctype html><script type="module">import cards from "../reference/stats/cards.json"; globalThis.cardCount = cards.marker;</script>',
      "reference/stats/cards.json": JSON.stringify({ marker: "REF-INLINE-7a2c" }),
    }, true);

  await probe("inline-reference-export-star",
    "export const clean = true;\n",
    {
      "public/index.html": '<!doctype html><script type="module">export * from "../reference/private.js";</script>',
      "reference/private.js": "export const marker = true;\n",
    }, true);

  await probe("generated-modulepreload-acceptance",
    "globalThis.clean = true;\n",
    { "public/index.html": '<!doctype html><script type="module" src="./entry.js"></script>' }, false);
  const accepted = cases.at(-1);
  const generatedPreload = accepted.js.some(({ source }) =>
    source.includes("init_modulepreload_polyfill();"));
  assert.equal(generatedPreload, true, "the generated Vite preload helper remains admitted");
  process.stdout.write(`${JSON.stringify({ probes: cases }, null, 2)}\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
