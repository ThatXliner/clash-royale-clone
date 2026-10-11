import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const archiveRoot = process.env.RELEASE_ARCHIVE_ROOT;
if (!archiveRoot) throw new Error("RELEASE_ARCHIVE_ROOT is required");
const { buildRelease } = await import(join(archiveRoot, "scripts/build-release.js"));
const temp = await mkdtemp(join(tmpdir(), "release-source-graph-probes-"));
const evidenceRoot = join(dirname(fileURLToPath(import.meta.url)), "source-graph-probe-artifacts");
await mkdir(evidenceRoot, { recursive: true });
const records = [];

async function probe(name, files, { index, config = {} } = {}) {
  const root = join(temp, name);
  const output = join(temp, `${name}-artifact`);
  await mkdir(root, { recursive: true });
  const sourceFiles = {
    "public/index.html": index ?? '<!doctype html><script type="module" src="./entry.js"></script>',
    "public/entry.js": "export const clean = true;\n",
    ...files,
  };
  const evidenceCase = join(evidenceRoot, name);
  for (const [path, contents] of Object.entries(sourceFiles)) {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, contents);
    const preserved = join(evidenceCase, "input", ...path.split("/"));
    await mkdir(dirname(preserved), { recursive: true });
    await writeFile(preserved, contents);
  }
  const configPath = join(root, "release-build.config.json");
  await writeFile(configPath, `${JSON.stringify({
    schemaVersion: 1,
    entries: ["public/index.html"],
    limits: { maxFiles: 32, maxFileBytes: 4096, maxTotalBytes: 32768 },
    allowedExtensions: [".html", ".js", ".json"],
    ...config,
  })}\n`);
  await writeFile(join(evidenceCase, "input", "release-build.config.json"),
    await readFile(configPath));
  try {
    const result = await buildRelease({ root, output, configPath });
    const manifestBytes = await readFile(join(output, "release-manifest.json"));
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    const preservedManifest = join(evidenceCase, "output", "release-manifest.json");
    await mkdir(dirname(preservedManifest), { recursive: true });
    await writeFile(preservedManifest, manifestBytes);
    const emittedJs = await Promise.all(manifest.files
      .filter(({ path }) => path.endsWith(".js"))
      .map(async ({ path }) => {
        const bytes = await readFile(join(output, ...path.split("/")));
        const preservedJs = join(evidenceCase, "output", ...path.split("/"));
        await mkdir(dirname(preservedJs), { recursive: true });
        await writeFile(preservedJs, bytes);
        const text = bytes.toString("utf8");
        return {
          path,
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          containsReferenceMarker: text.includes("REF-SOURCE-GRAPH-PROBE-7e1f6cc2"),
          containsPackageMarker: text.includes("PACKAGE-SOURCE-GRAPH-PROBE-0f1a8b6d"),
          containsModulepreloadText: /modulepreload|modulepreload-polyfill/iu.test(text),
          initializesVitePolyfill: text.includes("init_modulepreload_polyfill();"),
          markerLines: text.split("\n").filter((line) =>
            /globalThis\.(?:cardCount|packageMarker)/u.test(line)),
        };
      }));
    records.push({
      name,
      outcome: "accepted",
      artifactFiles: result.fileCount,
      totalBytes: result.totalBytes,
      manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
      manifestPath: `${name}/output/release-manifest.json`,
      graphKeys: Object.keys(manifest.build.graph).sort(),
      emittedPaths: manifest.files.map(({ path }) => path),
      emittedJs,
    });
  } catch (error) {
    const record = { name, outcome: "rejected", error: error.message };
    await writeFile(join(evidenceCase, "receipt.json"), `${JSON.stringify(record, null, 2)}\n`);
    records.push(record);
  }
  const record = records.at(-1);
  await writeFile(join(evidenceCase, "receipt.json"), `${JSON.stringify(record, null, 2)}\n`);
}

try {
  const cards = JSON.stringify({ cards: [], marker: "REF-SOURCE-GRAPH-PROBE-7e1f6cc2" }) + "\n";
  await probe("reference-json-unused", {
    "public/entry.js": 'import cards from "../reference/stats/cards.json";\nexport const clean = true;\n',
    "reference/stats/cards.json": cards,
  });
  await probe("reference-json-used", {
    "public/entry.js": 'import cards from "../reference/stats/cards.json";\nglobalThis.cardCount = cards.cards.length;\n',
    "reference/stats/cards.json": cards,
  });

  const packagePath = "node_modules/reviewer-probe/file.js";
  const packageSource = 'export const marker = "PACKAGE-SOURCE-GRAPH-PROBE-0f1a8b6d";\n';
  await probe("package-relative-unused-export", {
    "public/entry.js": 'import { marker } from "../node_modules/reviewer-probe/file.js";\nexport const clean = true;\n',
    [packagePath]: packageSource,
  });
  await probe("package-relative-used-export", {
    "public/entry.js": 'import { marker } from "../node_modules/reviewer-probe/file.js";\nglobalThis.packageMarker = marker;\n',
    [packagePath]: packageSource,
  });

  for (const [name, use] of [["unused", false], ["used", true]]) {
    const root = join(temp, `package-absolute-${name}-export`);
    const absoluteSpecifier = join(root, packagePath);
    await probe(`package-absolute-${name}-export`, {
      "public/entry.js": use
        ? `import { marker } from ${JSON.stringify(absoluteSpecifier)};\nglobalThis.packageMarker = marker;\n`
        : `import { marker } from ${JSON.stringify(absoluteSpecifier)};\nexport const clean = true;\n`,
      [packagePath]: packageSource,
    });
  }
  await probe("bare-package-unused-import", {
    "public/entry.js": 'import { marker } from "reviewer-probe";\nexport const clean = true;\n',
    "node_modules/reviewer-probe/package.json": JSON.stringify({
      name: "reviewer-probe",
      exports: { ".": "./file.js" },
    }),
    [packagePath]: packageSource,
  });

  await probe("inline-vite-export-from", {
    "public/entry.js": "export const clean = true;\n",
  }, {
    index: '<!doctype html><script type="module">export * from "vite/modulepreload-polyfill";</script>',
  });
  await probe("benign-comment-and-string-import-text", {
    "public/entry.js": "export const clean = true;\n",
  }, {
    index: [
      '<!-- <script type="module">import "vite/modulepreload-polyfill";</script> -->',
      '<script type="module">',
      '/* import "vite/modulepreload-polyfill"; */',
      'const phrase = "vite/modulepreload-polyfill";',
      'const markup = \'<script type="module">import "vite/modulepreload-polyfill";\';',
      '</script>',
    ].join("\n"),
  });
  process.stdout.write(`${JSON.stringify({ probes: records }, null, 2)}\n`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
