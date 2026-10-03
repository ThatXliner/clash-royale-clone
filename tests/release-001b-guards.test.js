import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildRelease } from "../scripts/build-release.js";

const WORKSPACE = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ALLOWED_EXTENSIONS = [".html", ".css", ".js", ".json", ".svg", ".png", ".woff2"];

async function snapshot(directory) {
  const result = {};
  async function visit(current) {
    const entries = (await readdir(current, { withFileTypes: true }))
      .toSorted((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = join(current, entry.name);
      const path = relative(directory, absolute).split("\\").join("/");
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) result[path] = (await readFile(absolute)).toString("base64");
      else if (entry.isSymbolicLink()) result[path] = `symlink:${await readFile(absolute).catch(() => "")}`;
      else result[path] = `unsupported:${entry.name}`;
    }
  }
  await visit(directory);
  return result;
}

async function fixture(t, files, {
  entries = ["public/index.html"],
  limits = {},
  staticAssetRoots = [],
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "release-001b-guard-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, contents] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, contents);
  }
  const configPath = join(root, "release-build.config.json");
  const config = {
    schemaVersion: 1,
    entries,
    staticAssetRoots,
    browserEntrypoints: entries.filter((entry) => entry.endsWith(".html")),
    moduleEntrypoints: entries.filter((entry) => entry.endsWith(".js")),
    limits: { maxFiles: 32, maxFileBytes: 4096, maxTotalBytes: 32768, ...limits },
    allowedExtensions: ALLOWED_EXTENSIONS,
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return { configPath, output: join(root, "artifact"), root };
}

async function createPriorArtifact(output) {
  await mkdir(join(output, "prior", "nested"), { recursive: true });
  await writeFile(join(output, "release-manifest.json"), '{"prior":"manifest"}\n');
  await writeFile(join(output, "prior", "sentinel.txt"), "preserve every prior file\n");
  await writeFile(join(output, "prior", "nested", "chunk.bin"), Buffer.from([0, 1, 2, 255]));
}

async function rejectWithoutChangingOutput(project, expected) {
  await createPriorArtifact(project.output);
  const before = await snapshot(project.output);
  await assert.rejects(buildRelease(project), expected);
  assert.deepEqual(await snapshot(project.output), before,
    "a rejected build must leave every prior output path and byte unchanged");
}

test("escaped workspace entry paths fail before publication and preserve the prior output", async (t) => {
  const project = await fixture(t, {
    "public/index.html": "<!doctype html><title>guard</title>\n",
  }, { entries: ["../outside.html"] });
  await rejectWithoutChangingOutput(project, /non-canonical release input entries/u);
});

test("internal and external symlink inputs are refused atomically", async (t) => {
  await t.test("internal target", async (t) => {
    const project = await fixture(t, {
      "public/index.html": "<!doctype html><title>guard</title>\n",
      "public/assets/real.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\"/>\n",
    }, { staticAssetRoots: ["public/assets"] });
    await symlink("real.svg", join(project.root, "public/assets/linked.svg"));
    await rejectWithoutChangingOutput(project, /symbolic link in release static assets/u);
  });

  await t.test("external target", async (t) => {
    const project = await fixture(t, {
      "public/index.html": "<!doctype html><title>guard</title>\n",
      "public/assets/ordinary.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\"/>\n",
    }, { staticAssetRoots: ["public/assets"] });
    const externalRoot = await mkdtemp(join(tmpdir(), "release-001b-external-"));
    t.after(() => rm(externalRoot, { recursive: true, force: true }));
    const externalTarget = join(externalRoot, "outside.svg");
    await writeFile(externalTarget, "<svg xmlns=\"http://www.w3.org/2000/svg\"/>\n");
    await symlink(externalTarget, join(project.root, "public/assets/external.svg"));
    await rejectWithoutChangingOutput(project, /symbolic link in release static assets/u);
  });
});

test("source maps are refused even when found in a configured static input tree", async (t) => {
  const project = await fixture(t, {
    "public/index.html": "<!doctype html><title>guard</title>\n",
    "public/assets/app.js.map": '{"version":3,"sources":[]}\n',
  }, { staticAssetRoots: ["public/assets"] });
  await rejectWithoutChangingOutput(project, /source maps are not allowed/u);
});

test("file count, per-file size, and aggregate size limits fail atomically", async (t) => {
  await t.test("file count", async (t) => {
    const project = await fixture(t, {
      "public/index.html": "<!doctype html><title>count</title>\n",
      "public/assets/pixel.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\"/>\n",
    }, { staticAssetRoots: ["public/assets"], limits: { maxFiles: 1 } });
    await rejectWithoutChangingOutput(project, /file-count limit/u);
  });

  await t.test("per-file byte cap", async (t) => {
    const project = await fixture(t, {
      "public/index.html": `<!doctype html><html><body>${"x".repeat(512)}</body></html>\n`,
    }, { limits: { maxFileBytes: 256, maxTotalBytes: 8192 } });
    await rejectWithoutChangingOutput(project, /release file exceeds byte limit/u);
  });

  await t.test("aggregate byte cap", async (t) => {
    const project = await fixture(t, {
      "public/index.html": "<!doctype html><title>aggregate</title>\n",
      "public/assets/large.svg": `<svg xmlns=\"http://www.w3.org/2000/svg\">${"x".repeat(512)}</svg>\n`,
    }, {
      staticAssetRoots: ["public/assets"],
      limits: { maxFiles: 8, maxFileBytes: 4096, maxTotalBytes: 700 },
    });
    await rejectWithoutChangingOutput(project, /release graph exceeds total byte limit/u);
  });
});

test("dangerous and protected output targets are refused before any build work", async (t) => {
  const cases = [
    [WORKSPACE, /workspace root/u],
    [join(WORKSPACE, "reference", "guard-output"), /protected repository path/u],
    [join(WORKSPACE, "dist", "guard-output"), /protected repository path/u],
    [dirname(WORKSPACE), /contains the workspace/u],
    [tmpdir(), /temporary directory root/u],
  ];
  for (const [output, expected] of cases) {
    await t.test(output, async () => {
      await assert.rejects(buildRelease({ output }), expected);
    });
  }
});
