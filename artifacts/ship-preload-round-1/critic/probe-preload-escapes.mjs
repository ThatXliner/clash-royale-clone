import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspace = resolve(process.argv[2] ?? process.cwd());
const { buildRelease } = await import(pathToFileURL(join(workspace, "scripts/build-release.js")));
const escapeForms = [
  ["short", String.raw`\0`],
  ["hex", String.raw`\x00`],
  ["unicode4", String.raw`\u0000`],
  ["unicode-codepoint", String.raw`\u{0}`],
];
const importForms = [
  ["static-import", (specifier) => `import ${specifier};`],
  ["named-export", (specifier) => `export { preload } from ${specifier};`],
  ["star-export", (specifier) => `export * from ${specifier};`],
  ["dynamic-import", (specifier) => `void import(${specifier});`],
];

async function rejectAuthoredHelper(code, inline, name) {
  const root = await mkdtemp(join(tmpdir(), "preload-helper-escape-"));
  try {
    const html = inline
      ? `<script type="module">${code}</script>`
      : '<script type="module" src="./entry.js"></script>';
    for (const [path, contents] of Object.entries({
      "public/index.html": html,
      ...(inline ? {} : { "public/entry.js": code }),
      "public/local.js": "export const local = true;\n",
      "public/dynamic.js": "export const dynamic = true;\n",
    })) {
      const absolute = join(root, path);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, contents);
    }
    const configPath = join(root, "release-build.config.json");
    await writeFile(configPath, `${JSON.stringify({
      schemaVersion: 1,
      entries: ["public/index.html"],
      browserEntrypoints: ["public/index.html"],
      moduleEntrypoints: [],
      staticAssetRoots: [],
      limits: { maxFiles: 64, maxFileBytes: 65536, maxTotalBytes: 262144 },
      allowedExtensions: [".html", ".js"],
    })}\n`);
    await assert.rejects(
      buildRelease({ root, output: join(root, "release-output"), configPath }),
      /authored release modules may not import Vite's internal preload helper/u,
      name,
    );
    return { name, rejected: true };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const results = [];
for (const [escapeName, escape] of escapeForms) {
  const specifier = `"${escape}vite/preload-helper.js"`;
  for (const [formName, makeCode] of importForms) {
    const name = `${escapeName}/${formName}`;
    const code = makeCode(specifier);
    results.push(await rejectAuthoredHelper(code, false, `external/${name}`));
    results.push(await rejectAuthoredHelper(code, true, `inline/${name}`));
  }
  const mixed = [
    'import "./local.js";',
    'void import("./dynamic.js");',
    `void import(${specifier});`,
  ].join("\n");
  results.push(await rejectAuthoredHelper(mixed, false, `external/${escapeName}/mixed-dynamic`));
  results.push(await rejectAuthoredHelper(mixed, true, `inline/${escapeName}/mixed-dynamic`));
}

assert.equal(results.length, 40);
process.stdout.write(`${JSON.stringify({ probes: results.length, results }, null, 2)}\n`);
