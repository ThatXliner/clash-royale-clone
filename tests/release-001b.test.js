import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { buildRelease } from "../scripts/build-release.js";
import { auditReleaseArtifact } from "../scripts/release-isolation-guard.js";
import {
  assertManifestRequests,
  launchReleaseChromium,
  recordBrowserRequests,
  startManifestHost,
} from "./helpers/release-browser-audit.js";

const WORKSPACE_ROOT = resolve(new URL("..", import.meta.url).pathname);
const EVIDENCE_DIRECTORY = join(WORKSPACE_ROOT, "artifacts/release-001b-round-2");
const EVIDENCE_PATH = join(EVIDENCE_DIRECTORY, "evidence.json");
const LIMITS = Object.freeze({ maxFiles: 128, maxFileBytes: 1_048_576, maxTotalBytes: 8_388_608 });
const ALLOWED_EXTENSIONS = Object.freeze([
  ".html", ".css", ".js", ".json", ".gif", ".jpeg", ".jpg", ".mp3", ".mp4",
  ".ogg", ".otf", ".png", ".svg", ".ttf", ".wav", ".webm", ".webp", ".woff", ".woff2",
]);

async function snapshot(directory) {
  const result = {};
  async function visit(current) {
    const entries = (await readdir(current, { withFileTypes: true }))
      .toSorted((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else result[relative(directory, absolute).split("\\").join("/")] = await readFile(absolute, "hex");
    }
  }
  await visit(directory);
  return result;
}

async function writeEvidence(value) {
  await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
  await writeFile(EVIDENCE_PATH, `${JSON.stringify(value, null, 2)}\n`);
}

async function createFixture(t, files, {
  entries = ["public/index.html"],
  staticAssetRoots = [],
  maxFiles = 64,
  maxFileBytes = 65536,
  maxTotalBytes = 262144,
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "release-001b-fixture-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, contents] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, contents);
  }
  const configPath = join(root, "release-build.config.json");
  await writeFile(configPath, `${JSON.stringify({
    schemaVersion: 1,
    entries,
    browserEntrypoints: ["public/index.html"],
    moduleEntrypoints: [],
    staticAssetRoots,
    limits: { maxFiles, maxFileBytes, maxTotalBytes },
    allowedExtensions: ALLOWED_EXTENSIONS,
  }, null, 2)}\n`);
  return { configPath, output: join(root, "artifact"), root };
}

function manifestHash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceAssetWasRequested(paths, sourcePath) {
  const file = sourcePath.split("/").at(-1);
  const extension = file.slice(file.lastIndexOf("."));
  const stem = file.slice(0, -extension.length).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const escapedExtension = extension.replace(".", "\\.");
  const pattern = new RegExp(`(?:^|[/~])${stem}(?:-[A-Za-z0-9_-]+)?${escapedExtension}$`, "u");
  return [...paths].some((path) => pattern.test(path));
}

test("RELEASE-001B emits a deterministic bounded graph and serves the exact game and RL module", {
  timeout: 120_000,
}, async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "release-001b-production-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const first = join(temporary, "first");
  const second = join(temporary, "second");
  await mkdir(first);
  await writeFile(join(first, "stale.txt"), "stale output must be atomically replaced");
  const firstBuild = await buildRelease({ output: first });
  await assert.rejects(readFile(join(first, "stale.txt")), { code: "ENOENT" });
  const secondBuild = await buildRelease({ output: second });
  assert.deepEqual(await snapshot(first), await snapshot(second),
    "two clean release builds must have byte-identical paths and contents");

  const manifestBytes = await readFile(join(first, "release-manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const config = JSON.parse(await readFile(join(WORKSPACE_ROOT,
    "scripts/release-build.config.json"), "utf8"));
  const rootPackage = JSON.parse(await readFile(join(WORKSPACE_ROOT,
    "package.json"), "utf8"));
  assert.deepEqual(manifest.entrypoints, ["public/index.html"]);
  assert.deepEqual(manifest.standaloneModules,
    ["src/rl/environment.js", "src/ui/arena-shell-entry.js"]);
  assert.equal(manifest.fileCount, manifest.files.length);
  assert.ok(manifest.fileCount <= config.limits.maxFiles);
  assert.ok(manifest.totalBytes <= config.limits.maxTotalBytes);
  assert.equal(firstBuild.fileCount, manifest.fileCount);
  assert.equal(secondBuild.totalBytes, manifest.totalBytes);
  assert.deepEqual(manifest.files.map(({ path }) => path),
    manifest.files.map(({ path }) => path).toSorted());
  assert.equal(manifest.build.bundler, "vite");
  assert.equal(manifest.build.version, rootPackage.devDependencies.vite);
  assert.equal(manifest.build.qualificationProfile, "game");
  assert.deepEqual(manifest.build.runtimeDependencies, []);
  assert.deepEqual(manifest.build.inputs, config.entries.toSorted());
  assert.deepEqual(manifest.build.staticAssetRoots, config.staticAssetRoots);

  const paths = new Set(manifest.files.map(({ path }) => path));
  for (const file of manifest.files) {
    assert.ok(file.size <= config.limits.maxFileBytes, `${file.path} exceeds the per-file bound`);
    assert.doesNotMatch(file.path, /(?:^|\/)(?:\.vite|\.agents|\.codex|\.git|artifacts|dist|reference|tests)(?:\/|$)|\.map$/iu);
    const bytes = await readFile(join(first, ...file.path.split("/")));
    assert.equal(file.size, bytes.length);
    assert.equal(file.sha256, manifestHash(bytes));
  }
  assert.ok(paths.has("src/ui/app-shell.js"));
  assert.ok(paths.has("src/ui/arena-shell-entry.js"));
  assert.ok(paths.has("src/rl/environment.js"));
  for (const node of Object.values(manifest.build.graph)) {
    for (const output of [node.file, ...(node.css ?? []), ...(node.assets ?? [])]) {
      assert.ok(paths.has(output), `graph output is absent from the canonical manifest: ${output}`);
    }
    for (const imported of [...(node.imports ?? []), ...(node.dynamicImports ?? [])]) {
      assert.ok(Object.hasOwn(manifest.build.graph, imported),
        `manifest graph has an unresolved import key: ${imported}`);
    }
  }
  const isolation = await auditReleaseArtifact({ artifactRoot: first, referenceRoot: WORKSPACE_ROOT });
  assert.equal(isolation.fileCount, manifest.fileCount);
  assert.ok(isolation.referenceFileCount > 0);

  const browser = await launchReleaseChromium();
  t.after(() => browser.close());
  const context = await browser.newContext({ serviceWorkers: "block" });
  t.after(() => context.close());
  const prefix = "/moss-and-ember";
  const host = await startManifestHost(first, { prefix });
  t.after(() => host.close());
  const page = await context.newPage();
  const requests = recordBrowserRequests(context);
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.stack ?? String(error)));
  const homeResponse = await page.goto(`${host.baseUrl}/public/index.html`, { waitUntil: "load" });
  assert.equal(homeResponse.status(), 200);
  assert.equal(await page.title(), "Moss & Ember — Card battler");
  await page.locator('[data-nav-to="battle"]').click();
  try {
    await page.frameLocator("[data-battle-frame-slot] iframe")
      .locator('[data-ui="arena"]').waitFor({ timeout: 8_000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      activeView: document.querySelector(".app-shell")?.dataset.viewActive,
      frameSources: [...document.querySelectorAll("iframe")].map(({ src }) => src),
    }));
    throw new Error(`${error.message}\n${JSON.stringify({ state, consoleErrors }, null, 2)}`);
  }
  const arenaController = await page.frameLocator("[data-battle-frame-slot] iframe")
    .locator('[data-ui="arena"]')
    .evaluate(async (arena, mountedPrefix) => {
      const module = await import(`${mountedPrefix}/src/ui/arena-shell-entry.js`);
      const controller = module.arenaHudController;
      return {
        attachedArena: arena.isConnected,
        controllerPresent: controller !== null && controller !== undefined,
        exports: Object.keys(module).sort(),
        hasControllerApi: ["enterManualStepMode", "serialize", "stepMany"]
          .every((name) => typeof controller?.[name] === "function"),
        sessionActive: controller?.state?.active === true,
        sessionTick: controller?.state?.sessionTick ?? null,
      };
    }, prefix);
  assert.equal(arenaController.controllerPresent, true);
  assert.equal(arenaController.attachedArena, true);
  assert.equal(arenaController.hasControllerApi, true);
  assert.equal(arenaController.sessionActive, true);
  assert.ok(Number.isSafeInteger(arenaController.sessionTick));
  assert.ok(arenaController.exports.includes("arenaHudController"));
  assert.deepEqual(arenaController.exports.toSorted(), [
    "arenaHudController",
    "createArenaHudController",
    "createArenaSessionInjectionCapability",
    "createInitialArenaHudSystems",
    "mountArenaShellWithHud",
  ]);
  const rl = await page.evaluate(async (mountedPrefix) => {
    const module = await import(`${mountedPrefix}/src/rl/environment.js`);
    const environment = module.createRLEnvironment({ horizonTicks: 3, seed: 319, strideTicks: 1 });
    const initial = environment.observe();
    const stepped = environment.step(0);
    const restored = module.RLEnvironment.restore(environment.serialize());
    return {
      exports: ["RLEnvironment", "createRLEnvironment"].filter((name) => name in module),
      initialTick: initial.tick,
      stepTick: stepped.observation.tick,
      restoreTick: restored.observe().tick,
      status: stepped.observation.status,
      truncated: stepped.truncated,
    };
  }, prefix);
  assert.deepEqual(rl, {
    exports: ["RLEnvironment", "createRLEnvironment"],
    initialTick: 0,
    stepTick: 1,
    restoreTick: 1,
    status: "running",
    truncated: false,
  });
  assert.deepEqual(consoleErrors, [], "the game and direct RL module must run without browser errors");
  const productionRequests = assertManifestRequests(requests, {
    baseUrl: host.baseUrl,
    manifest,
    prefix,
  });
  assert.ok(productionRequests.some(({ path }) => path === "public/index.html"));
  assert.ok(productionRequests.some(({ path }) => path === "public/ui-arena-shell.html"));
  assert.ok(productionRequests.some(({ path }) => path === "src/ui/arena-shell-bootstrap.js"));
  assert.ok(productionRequests.some(({ path }) => path === "src/ui/arena-shell-entry.js"));
  assert.ok(productionRequests.some(({ path }) => path === "src/rl/environment.js"));

  await writeEvidence({
    schemaVersion: 1,
    candidate: "RELEASE-001B",
    buildToolchain: { vite: manifest.build.version, runtimeDependencies: [] },
    production: {
      twoCleanBuildsByteIdentical: true,
      fileCount: manifest.fileCount,
      totalBytes: manifest.totalBytes,
      manifestSha256: manifestHash(manifestBytes),
      isolation: {
        referenceFilesCompared: isolation.referenceFileCount,
        mapsOrProtectedPaths: false,
      },
      projectSubpath: prefix,
      producerBrowserQualification: firstBuild.browserQualification,
      chromiumRequestCount: productionRequests.length,
      chromiumRequests: productionRequests,
      arenaController,
      rlModule: rl,
    },
  });
});

test("Chromium manifest audit covers legacy HTML, CSS, SVG and opaque-frame dependency forms", {
  timeout: 90_000,
}, async (t) => {
  const fixture = await createFixture(t, {
    "public/index.html": [
      "<!doctype html><html><head><meta charset=\"utf-8\">",
      '<base href="./?fixture=1#entry">',
      '<link rel="prefetch" as="fetch" crossorigin href="./assets/prefetch.json">',
      '<link rel="preload" as="fetch" crossorigin href="./assets/preload.json">',
      '<link rel="preload" as="image" imagesrcset="./assets/preload-small.svg 1x, ./assets/preload-large.svg 2x">',
      '<link rel="stylesheet" href="../styles/surface.css">',
      '<style>.style-tag { width: 4px; height: 4px; background-image: url("./assets/style-tag.svg"); }</style>',
      "</head><body>",
      '<img id="ordinary" src="./assets/image.svg">',
      '<input id="image-control" type="image" src="./assets/input-image.svg">',
      '<img id="responsive" src="./assets/srcset-one.svg" srcset="./assets/srcset-one.svg 1x, ./assets/srcset-two.svg 2x">',
      '<div id="css-url" class="css-url"></div><div id="image-set" class="image-set"></div>',
      '<div class="style-tag"></div>',
      '<div class="inline-style" style="background-image: url(\'./assets/inline-style.svg\')"></div>',
      '<iframe id="srcdoc" srcdoc="&lt;img src=&quot;./assets/srcdoc-image.svg&quot; width=&quot;1&quot; height=&quot;1&quot;&gt;"></iframe>',
      '<button id="open-popup" type="button">Open dependency popup</button>',
      '<script type="module" src="./entry.js"></script>',
      "</body></html>",
    ].join("\n"),
    "public/entry.js": [
      'const parserDecoy = `import("./not-a-real-module.js")`;',
      '// import "./also-not-a-real-module.js"',
      'import data from "./data.json" with { type: "json" };',
      'import"./module.js";',
      'import("./dynamic-module.js").then(({ status }) => { document.documentElement.dataset.dynamicStatus = status; });',
      "document.documentElement.dataset.releaseFixture = data.status;",
      'const worker = new Worker(new URL("./assets/audit-worker.js", document.location.href), { type: "module" });',
      'worker.addEventListener("message", ({ data: status }) => { document.documentElement.dataset.workerStatus = status; });',
      'worker.postMessage("load");',
      'document.querySelector("#open-popup").addEventListener("click", () => { window.open(new URL("./assets/popup.html", document.location.href), "release-dependency-popup"); });',
    ].join("\n"),
    "public/module.js": "globalThis.__releaseFixtureModule = true;\n",
    "public/dynamic-module.js": 'export const status = "dynamic-manifest-dependency-loaded";\n',
    "public/data.json": JSON.stringify({ status: "module-and-json-import-loaded" }),
    "styles/surface.css": [
      '@import "./theme.css";',
      '.css-url { width: 4px; height: 4px; background-image: url("../public/assets/css-url.svg"); }',
      '.image-set { width: 4px; height: 4px; background-image: image-set("../public/assets/image-set-one.svg" 1x, url("../public/assets/image-set-two.svg") 2x); }',
    ].join("\n"),
    "styles/theme.css": ".css-url, .image-set { background-repeat: no-repeat; }\n",
    "public/assets/prefetch.json": JSON.stringify({ kind: "prefetch" }),
    "public/assets/preload.json": JSON.stringify({ kind: "preload" }),
    "public/assets/image.svg": svg("#24577a"),
    "public/assets/input-image.svg": svg("#467542"),
    "public/assets/srcset-one.svg": svg("#ac5b31"),
    "public/assets/srcset-two.svg": svg("#9a3933"),
    "public/assets/srcdoc-image.svg": svg("#849c50"),
    "public/assets/css-url.svg": svg("#653f83"),
    "public/assets/image-set-one.svg": svg("#38527a"),
    "public/assets/image-set-two.svg": svg("#883d55"),
    "public/assets/external-style.svg": [
      '<?xml-stylesheet type="text/css" href="./external-style.css"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect class="external-style" width="12" height="12"/></svg>',
    ].join("\n"),
    "public/assets/external-style.css": ".external-style { fill: #346; }\n",
    "public/assets/xhtml-foreign-object.svg": [
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml" width="12" height="12">',
      '<foreignObject width="12" height="12"><div xmlns="http://www.w3.org/1999/xhtml"><img src="./foreign-object-image.svg" width="1" height="1"></div></foreignObject>',
      "</svg>",
    ].join("\n"),
    "public/assets/foreign-object-image.svg": svg("#376985"),
    "public/assets/nested-svg.svg": [
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12">',
      '<image href="./nested-leaf.svg" width="12" height="12"/>',
      "</svg>",
    ].join("\n"),
    "public/assets/nested-leaf.svg": svg("#788943"),
    "public/assets/presentation-url.svg": [
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12">',
      '<rect width="12" height="12" fill="url(./presentation-gradient.svg#paint)"/>',
      "</svg>",
    ].join("\n"),
    "public/assets/presentation-gradient.svg": [
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="paint"><stop stop-color="#254"/></linearGradient></defs></svg>',
    ].join("\n"),
    "public/assets/preload-small.svg": svg("#455672"),
    "public/assets/preload-large.svg": svg("#a25673"),
    "public/assets/style-tag.svg": svg("#345e7d"),
    "public/assets/inline-style.svg": svg("#926442"),
    "public/assets/audit-worker.js": [
      'self.addEventListener("message", async () => {',
      '  const result = await fetch("./worker-data.json").then((response) => response.json());',
      '  self.postMessage(result.status);',
      "});",
    ].join("\n"),
    "public/assets/worker-data.json": JSON.stringify({ status: "worker-manifest-dependency-loaded" }),
    "public/assets/popup.html": [
      "<!doctype html><html><head><meta charset=\"utf-8\"><link rel=\"icon\" href=\"data:,\"></head><body>",
      '<p id="popup-status">waiting</p><script type="module" src="./popup.js"></script>',
      "</body></html>",
    ].join("\n"),
    "public/assets/popup.js": [
      'const result = await fetch("./popup-data.json").then((response) => response.json());',
      'document.querySelector("#popup-status").textContent = result.status;',
    ].join("\n"),
    "public/assets/popup-data.json": JSON.stringify({ status: "popup-manifest-dependency-loaded" }),
  }, { staticAssetRoots: ["public/assets"] });
  const built = await buildRelease(fixture);
  const manifest = JSON.parse(await readFile(join(fixture.output, "release-manifest.json"), "utf8"));
  assert.equal(manifest.fileCount, built.fileCount);

  const browser = await launchReleaseChromium();
  t.after(() => browser.close());
  const context = await browser.newContext({ serviceWorkers: "block" });
  t.after(() => context.close());
  const host = await startManifestHost(fixture.output);
  t.after(() => host.close());
  const page = await context.newPage();
  const requests = recordBrowserRequests(context);
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(String(error)));
  const response = await page.goto(`${host.baseUrl}/public/index.html`, { waitUntil: "load" });
  assert.equal(response.status(), 200);
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator("html").getAttribute("data-release-fixture"),
    "module-and-json-import-loaded");
  assert.equal(await page.evaluate(() => globalThis.__releaseFixtureModule), true);
  await page.waitForFunction(() => {
    const srcdocImage = document.querySelector("#srcdoc")?.contentDocument?.querySelector("img");
    return document.querySelector("#ordinary")?.naturalWidth === 1 &&
      document.querySelector("#responsive")?.naturalWidth === 1 &&
      srcdocImage?.complete && srcdocImage.naturalWidth === 1 &&
      document.documentElement.dataset.workerStatus === "worker-manifest-dependency-loaded";
  }, null, { timeout: 5_000 });
  await page.waitForFunction(() =>
    document.documentElement.dataset.dynamicStatus === "dynamic-manifest-dependency-loaded",
  null, { timeout: 5_000 });
  const imageControlDecode = await page.locator("#image-control").evaluate(async (control) => {
    const image = new Image();
    image.src = control.src;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  });
  assert.deepEqual(imageControlDecode, { width: 1, height: 1 });
  const popupPromise = context.waitForEvent("page");
  await page.locator("#open-popup").click();
  const popup = await popupPromise;
  await popup.waitForLoadState("networkidle");
  assert.equal(await popup.locator("#popup-status").textContent(),
    "popup-manifest-dependency-loaded");

  for (const [documentPath, dependencyPath] of [
    ["external-style.svg", "external-style.css"],
    ["xhtml-foreign-object.svg", "foreign-object-image.svg"],
    ["nested-svg.svg", "nested-leaf.svg"],
    ["presentation-url.svg", "presentation-gradient.svg"],
  ]) {
    const dependency = page.waitForResponse((candidate) =>
      candidate.url().endsWith(`/public/assets/${dependencyPath}`), { timeout: 5_000 });
    const frameId = `inspect-${documentPath.replaceAll(/[^a-z0-9-]/giu, "-")}`;
    await page.evaluate(({ frameId: id, source }) => {
      const frame = document.createElement("iframe");
      frame.id = id;
      frame.width = "24";
      frame.height = "24";
      frame.src = source;
      document.body.append(frame);
    }, {
      frameId,
      source: `${host.baseUrl}/public/assets/${documentPath}`,
    });
    await dependency;
    await page.frameLocator(`#${frameId}`).locator("svg").waitFor({ state: "visible" });
  }
  assert.deepEqual(errors, []);
  const audited = assertManifestRequests(requests, { baseUrl: host.baseUrl, manifest });
  const actualPaths = new Set(audited.map(({ path }) => path));
  for (const name of [
    "prefetch.json", "preload.json", "input-image.svg", "srcdoc-image.svg",
    "css-url.svg", "image-set-one.svg", "external-style.css",
    "foreign-object-image.svg", "nested-leaf.svg", "presentation-gradient.svg",
    "worker-data.json", "popup-data.json", "audit-worker.js", "popup.html", "popup.js",
    "style-tag.svg", "inline-style.svg", "dynamic-module.js",
  ]) {
    assert.ok(sourceAssetWasRequested(actualPaths, name),
      `fixture did not make Chromium request ${name}`);
  }

  const previous = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
  previous.dependencyMutations = {
    status: "PASS",
    fixtureManifestFileCount: manifest.fileCount,
    chromiumRequestCount: audited.length,
    requestedDependencies: [...actualPaths].filter((path) => path.startsWith("public/assets/")).sort(),
    browserRequests: audited,
  };
  await writeEvidence(previous);
});

test("authored modules cannot impersonate Vite's virtual preload helper", async (t) => {
  const moduleCases = [
    { name: "import", code: 'import "\\0vite/preload-helper.js";' },
    { name: "named-export", code: 'export { preload } from "\\0vite/preload-helper.js";' },
    { name: "star-export", code: 'export * from "\\0vite/preload-helper.js";' },
    { name: "dynamic-import", code: 'void import("\\0vite/preload-helper.js");' },
    {
      name: "dynamic-import-with-legitimate-local-import",
      code: [
        'import "./local-module.js";',
        'void import("./dynamic-module.js");',
        'void import("\\0vite/preload-helper.js");',
      ].join("\n"),
    },
  ];

  for (const { name, code } of moduleCases) {
    const fixture = await createFixture(t, {
      "public/index.html": '<script type="module" src="./entry.js"></script>',
      "public/entry.js": code,
      "public/local-module.js": "export const local = true;\n",
      "public/dynamic-module.js": "export const dynamic = true;\n",
    });
    await assert.rejects(buildRelease(fixture),
      /authored release modules may not import Vite's internal preload helper/u, name);
  }

  for (const { name, code } of moduleCases) {
    const fixture = await createFixture(t, {
      "public/index.html": `<script type="module">${code}</script>`,
      "public/local-module.js": "export const local = true;\n",
      "public/dynamic-module.js": "export const dynamic = true;\n",
    });
    await assert.rejects(buildRelease(fixture),
      /authored release modules may not import Vite's internal preload helper/u,
      `inline ${name}`);
  }
});

test("Vite preload helpers remain available for authored inline dynamic imports", {
  timeout: 60_000,
}, async (t) => {
  const fixture = await createFixture(t, {
    "public/index.html": [
      "<!doctype html><html><head><meta charset=\"utf-8\"></head><body>",
      "<script type=\"module\">",
      'const literal = await import("./literal-module.js");',
      'const template = await import(`./template-module.js`);',
      'document.documentElement.dataset.inlineDynamicStatus = `${literal.status}:${template.status}`;',
      "</script>",
      "</body></html>",
    ].join("\n"),
    "public/literal-module.js": 'export const status = "literal-loaded";\n',
    "public/template-module.js": 'export const status = "template-loaded";\n',
  });
  const built = await buildRelease(fixture);
  const manifest = JSON.parse(await readFile(join(fixture.output, "release-manifest.json"), "utf8"));
  assert.equal(manifest.fileCount, built.fileCount);

  const browser = await launchReleaseChromium();
  t.after(() => browser.close());
  const context = await browser.newContext({ serviceWorkers: "block" });
  t.after(() => context.close());
  const host = await startManifestHost(fixture.output);
  t.after(() => host.close());
  const page = await context.newPage();
  const requests = recordBrowserRequests(context);
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(String(error)));
  const response = await page.goto(`${host.baseUrl}/public/index.html`, { waitUntil: "load" });
  assert.equal(response.status(), 200);
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() =>
    document.documentElement.dataset.inlineDynamicStatus === "literal-loaded:template-loaded",
  null, { timeout: 5_000 });
  assert.deepEqual(errors, []);

  const audited = assertManifestRequests(requests, { baseUrl: host.baseUrl, manifest });
  const actualPaths = new Set(audited.map(({ path }) => path));
  assert.ok(sourceAssetWasRequested(actualPaths, "literal-module.js"));
  assert.ok(sourceAssetWasRequested(actualPaths, "template-module.js"));
});

test("CSS-escaped URL dependencies are rejected before publishing", { timeout: 60_000 }, async (t) => {
  const fixture = await createFixture(t, {
    "public/index.html": [
      "<!doctype html><html><head><meta charset=\"utf-8\">",
      '<link rel="stylesheet" href="./assets/surface.css">',
      "</head><body><div class=\"escaped-resource\"></div></body></html>",
    ].join("\n"),
    "public/assets/surface.css": '.escaped-resource { width: 4px; height: 4px; background-image: url("./safe.svg"); }',
    "public/assets/safe.svg": svg("#653f83"),
  }, { staticAssetRoots: ["public/assets"] });
  await buildRelease(fixture);
  const previousOutput = await snapshot(fixture.output);
  const previousManifest = await readFile(join(fixture.output, "release-manifest.json"));
  await writeFile(join(fixture.root, "public/assets/surface.css"),
    '.escaped-resource { width: 4px; height: 4px; background-image: u\\72l("./escaped.svg"); }');
  await writeFile(join(fixture.root, "public/assets/escaped.svg"), svg("#653f83"));
  let qualificationError;
  await assert.rejects(buildRelease(fixture), (error) => {
    qualificationError = error;
    return /browser requested an unmanifested release path .*escaped\.svg \(manifest: false, HTTP 404\)/u
      .test(error.message);
  });
  assert.deepEqual(await snapshot(fixture.output), previousOutput,
    "an escaped CSS dependency must not replace a previously valid artifact");
  const requestedMatch = qualificationError.message.match(
    /browser requested an unmanifested release path (.+) \(manifest: false, HTTP (\d+)\)/u);
  assert.ok(requestedMatch, qualificationError.message);
  const evidence = {
    sourceForm: 'background-image: u\\72l("./escaped.svg")',
    status: "PRODUCER_REJECTED_BEFORE_PUBLISH",
    requestedPath: requestedMatch[1],
    responseStatus: Number(requestedMatch[2]),
    requestedPathInManifest: false,
    previousArtifactPreserved: true,
    previousArtifactFileCount: Object.keys(previousOutput).length,
    previousManifestSha256: manifestHash(previousManifest),
    failureMessage: qualificationError.message,
  };
  await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
  await writeFile(join(EVIDENCE_DIRECTORY, "escaped-css-producer-rejection.json"),
    `${JSON.stringify(evidence, null, 2)}\n`);
});

test("opaque runtime srcdoc requests outside the built manifest are rejected", {
  timeout: 60_000,
}, async (t) => {
  const fixture = await createFixture(t, {
    "public/index.html": [
      "<!doctype html><html><head><meta charset=\"utf-8\"></head><body>",
      '<script type="module" src="./entry.js"></script>',
      "</body></html>",
    ].join("\n"),
    "public/entry.js": 'document.documentElement.dataset.releaseFixture = "previous-valid-artifact";\n',
    "public/opaque-runtime-image.svg": svg("#992f46"),
    "public/assets/allowlisted.svg": svg("#224466"),
  }, { staticAssetRoots: ["public/assets"] });
  const previousBuild = await buildRelease(fixture);
  const previousOutput = await snapshot(fixture.output);
  const previousManifest = await readFile(join(fixture.output, "release-manifest.json"));
  await writeFile(join(fixture.root, "public/entry.js"), [
    'const frame = document.createElement("iframe");',
    'frame.srcdoc = "<img src=\\\"./opaque-runtime-image.svg\\\" width=\\\"1\\\" height=\\\"1\\\">";',
    "document.body.append(frame);",
  ].join("\n"));
  await assert.rejects(buildRelease(fixture),
    /browser requested an unmanifested release path public\/opaque-runtime-image\.svg \(manifest: false, HTTP 404\)/u);
  assert.deepEqual(await snapshot(fixture.output), previousOutput,
    "qualification failure must leave every byte of the previously valid artifact unchanged");

  const evidence = {
    status: "PRODUCER_REJECTED_BEFORE_PUBLISH",
    source: "runtime-constructed iframe.srcdoc",
    requestedPath: "public/opaque-runtime-image.svg",
    responseStatus: 404,
    manifestMembership: false,
    previousArtifactPreserved: true,
    previousArtifactFileCount: Object.keys(previousOutput).length,
    previousManifestSha256: manifestHash(previousManifest),
    previousBrowserQualification: previousBuild.browserQualification,
  };
  await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
  await writeFile(join(EVIDENCE_DIRECTORY, "opaque-srcdoc-producer-rejection.json"),
    `${JSON.stringify(evidence, null, 2)}\n`);
});

test("external base dependencies are rejected before publishing", {
  timeout: 60_000,
}, async (t) => {
  const fixture = await createFixture(t, {
    "public/index.html": [
      "<!doctype html><html><head><meta charset=\"utf-8\">",
      '<link rel="stylesheet" href="./remote-base.css">',
      "</head><body><p>Local stylesheet control.</p></body></html>",
    ].join("\n"),
    "public/remote-base.css": "body { color: red; }\n",
  });
  await buildRelease(fixture);
  const previousOutput = await snapshot(fixture.output);
  const previousManifest = await readFile(join(fixture.output, "release-manifest.json"));
  await writeFile(join(fixture.root, "public/index.html"), [
    "<!doctype html><html><head><meta charset=\"utf-8\">",
    '<base href="https://release-dependency.invalid/">',
    '<link rel="stylesheet" href="./remote-base.css">',
    "</head><body><p>External base must not publish.</p></body></html>",
  ].join("\n"));
  let qualificationError;
  await assert.rejects(buildRelease(fixture), (error) => {
    qualificationError = error;
    return /browser (?:runtime errors|attempted an off-origin request)/u.test(error.message);
  });
  assert.deepEqual(await snapshot(fixture.output), previousOutput,
    "a rejected external-base page must leave the prior artifact byte-identical");
  const evidence = {
    status: "PRODUCER_REJECTED_BEFORE_PUBLISH",
    source: "external HTML base URL",
    previousArtifactPreserved: true,
    previousArtifactFileCount: Object.keys(previousOutput).length,
    previousManifestSha256: manifestHash(previousManifest),
    failureMessage: qualificationError.message,
  };
  await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
  await writeFile(join(EVIDENCE_DIRECTORY, "external-base-producer-rejection.json"),
    `${JSON.stringify(evidence, null, 2)}\n`);
});

function svg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="${color}"/></svg>`;
}
