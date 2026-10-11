import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import test from "node:test";

import { buildRelease } from "../scripts/build-release.js";
import { auditReleaseArtifact } from "../scripts/release-isolation-guard.js";

const WORKSPACE = resolve(new URL("../", import.meta.url).pathname);
const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const EVIDENCE_PATH = process.env.SHIPPING_ISOLATION_RELEASE_EVIDENCE ??
  join(WORKSPACE, "artifacts/guard-002r-round-1/release-isolation-evidence.json");
let productionEvidence;

async function snapshot(directory) {
  const result = {};
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else result[relative(directory, absolute).split("\\").join("/")] =
        await readFile(absolute, "hex");
    }
  }
  await visit(directory);
  return result;
}

async function fixture(t, files, { config = {}, name = "fixture" } = {}) {
  const root = await mkdtemp(join(tmpdir(), `shipping-release-${name}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, contents] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, contents);
  }
  const configPath = join(root, "release-build.config.json");
  await writeFile(configPath, `${JSON.stringify({
    schemaVersion: 1,
    entries: ["public/index.html"],
    limits: { maxFiles: 32, maxFileBytes: 4096, maxTotalBytes: 32768 },
    allowedExtensions: [".html", ".js", ".json", ".css", ".svg", ".wav"],
    ...config,
  })}\n`);
  return { configPath, output: join(root, "artifact"), root };
}

function mimeType(path) {
  return new Map([
    [".css", "text/css; charset=utf-8"],
    [".html", "text/html; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".json", "application/json; charset=utf-8"],
    [".svg", "image/svg+xml"],
    [".wav", "audio/wav"],
  ]).get(extname(path).toLowerCase()) ?? "application/octet-stream";
}

async function serveArtifact(artifactRoot, manifestPaths, { responseHeaders = {} } = {}) {
  const requests = [];
  const allowed = new Set(manifestPaths);
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://release.invalid").pathname);
    const path = pathname.replace(/^\/+/, "");
    const isAllowed = allowed.has(path);
    let status = isAllowed ? 200 : 404;
    const record = { method: request.method, path, status };
    requests.push(record);
    if (!isAllowed) {
      response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("outside release manifest");
      return;
    }
    try {
      const bytes = await readFile(join(artifactRoot, ...path.split("/")));
      response.writeHead(status, {
        "Cache-Control": "no-store",
        "Content-Length": bytes.length,
        "Content-Type": mimeType(path),
        ...responseHeaders,
      });
      response.end(bytes);
    } catch {
      status = 404;
      record.status = status;
      response.writeHead(status);
      response.end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose, reject) =>
      server.close((error) => error ? reject(error) : resolveClose())),
    requests,
  };
}

function watchPage(page, records) {
  const byRequest = new WeakMap();
  page.on("request", (request) => {
    const url = new URL(request.url());
    const record = {
      method: request.method(),
      path: url.pathname,
      resourceType: request.resourceType(),
      status: null,
      failure: null,
    };
    records.push(record);
    byRequest.set(request, record);
  });
  page.on("response", (response) => {
    const record = byRequest.get(response.request());
    if (record) record.status = response.status();
  });
  page.on("requestfailed", (request) => {
    const record = byRequest.get(request);
    if (record) record.failure = request.failure()?.errorText ?? "failed";
  });
  return page.addInitScript(() => {
    globalThis.__releasePolicyViolations = [];
    globalThis.__releaseFetchCalls = [];
    const nativeFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = (input, init) => {
      const value = input instanceof Request ? input.url : String(input);
      globalThis.__releaseFetchCalls.push(new URL(value, location.href).href);
      return nativeFetch(input, init);
    };
    addEventListener("securitypolicyviolation", (event) => {
      globalThis.__releasePolicyViolations.push({
        blockedURI: event.blockedURI,
        effectiveDirective: event.effectiveDirective,
        violatedDirective: event.violatedDirective,
      });
    }, true);
  });
}

async function writeEvidence(evidence) {
  await mkdir(dirname(EVIDENCE_PATH), { recursive: true });
  await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
}

test("production release builds are byte-identical and pass emitted-byte isolation", {
  timeout: 180_000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "shipping-release-production-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = join(directory, "first");
  const second = join(directory, "second");
  await buildRelease({ output: first });
  await buildRelease({ output: second });
  const firstBytes = await snapshot(first);
  const secondBytes = await snapshot(second);
  assert.deepEqual(secondBytes, firstBytes, "clean production artifacts must be byte-identical");

  const audit = await auditReleaseArtifact({ artifactRoot: first, referenceRoot: WORKSPACE });
  const manifest = JSON.parse(await readFile(join(first, "release-manifest.json"), "utf8"));
  const paths = manifest.files.map(({ path }) => path);
  assert.equal(audit.fileCount, manifest.fileCount);
  assert.ok(audit.referenceFileCount > 0, "the release audit compared the repository reference corpus");
  assert.equal(paths.some((path) => /(?:^|\/)(?:reference|tests)(?:\/|$)/i.test(path)), false);
  assert.equal(paths.some((path) => path.endsWith(".map")), false);

  const html = await readFile(join(first, manifest.entrypoints[0]), "utf8");
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(policy, "the emitted entry includes its runtime policy");
  const decodedPolicy = policy.replaceAll("&#39;", "'");
  assert.match(decodedPolicy, /script-src 'self'/);
  assert.doesNotMatch(decodedPolicy, /unsafe-eval/);
  assert.match(decodedPolicy, /connect-src 'self'/);

  productionEvidence = {
    artifactFiles: audit.fileCount,
    identicalBuilds: true,
    manifestSha256: audit.manifestSha256,
    referenceFilesCompared: audit.referenceFileCount,
    totalBytes: audit.totalBytes,
    csp: decodedPolicy,
  };
  await writeEvidence({ schemaVersion: 1, production: productionEvidence });
});

test("release builder rejects package imports and emitted protected/reference bytes", async (t) => {
  const packageCases = [
    { name: "exports-unscoped-root", specifier: "conditional-package" },
    { name: "exports-scoped-root", specifier: "@moss/conditional-package" },
    {
      name: "exports-scoped-subpath",
      specifier: "@moss/conditional-package/components/widget",
    },
  ];
  for (const { name, specifier } of packageCases) {
    const packageName = specifier.startsWith("@")
      ? "@moss/conditional-package"
      : "conditional-package";
    const packageRoot = `node_modules/${packageName}`;
    const packageImport = await fixture(t, {
      "public/index.html": '<script type="module" src="./entry.js"></script>',
      "public/entry.js": `import ${JSON.stringify(specifier)};\n`,
      [`${packageRoot}/package.json`]: JSON.stringify({
        name: packageName,
        exports: {
          ".": {
            browser: "./browser.js",
            import: "./import.js",
          },
          "./components/widget": {
            browser: "./widget.browser.js",
            import: "./widget.import.js",
          },
        },
      }),
      [`${packageRoot}/browser.js`]: 'globalThis.__conditionalPackage = "browser";\n',
      [`${packageRoot}/import.js`]: 'globalThis.__conditionalPackage = "import";\n',
      [`${packageRoot}/widget.browser.js`]: 'globalThis.__conditionalWidget = "browser";\n',
      [`${packageRoot}/widget.import.js`]: 'globalThis.__conditionalWidget = "import";\n',
    }, { name });
    await assert.rejects(
      buildRelease(packageImport),
      (error) => error.message.includes(`bare dependency is not allowed: ${specifier}`),
    );
  }

  for (const specifier of [
    "vite/modulepreload-polyfill",
    "vite:preload-helper",
    "virtual:release-policy-bypass",
  ]) {
    const sourceImport = await fixture(t, {
      "public/index.html": '<script type="module" src="./entry.js"></script>',
      "public/entry.js": `import ${JSON.stringify(specifier)};\n`,
    }, { name: `internal-import-${specifier.replace(/[^a-z0-9]+/giu, "-")}` });
    await assert.rejects(
      buildRelease(sourceImport),
      (error) => error.message.includes(`bare dependency is not allowed: ${specifier}`),
    );
  }

  const htmlInternalImport = await fixture(t, {
    "public/index.html": '<script type="module">import "vite/modulepreload-polyfill";</script>',
  }, { name: "html-internal-import" });
  await assert.rejects(buildRelease(htmlInternalImport),
    /release HTML may not import Vite's internal modulepreload polyfill/);

  const preloadExceptionRoot = await fixture(t, {
    "public/index.html": '<script type="module" async src="./entry.js"></script>',
    "public/entry.js": 'globalThis.__releasePreloadException = true;\n',
  }, { name: "generated-modulepreload-exception" });
  await buildRelease(preloadExceptionRoot);
  const preloadManifest = JSON.parse(await readFile(
    join(preloadExceptionRoot.output, "release-manifest.json"), "utf8",
  ));
  assert.ok(preloadManifest.build.graph["public/index.html"],
    "the release builder permits Vite's generated HTML modulepreload import");

  const identityRoot = await fixture(t, {
    "public/index.html": '<script type="module" src="./entry.js"></script>',
    "public/entry.js": 'document.title = "Knight";\n',
    "reference/stats/cards.json": JSON.stringify({ cards: [{ key: "knight", name: "Knight" }] }),
  }, { name: "identity" });
  await assert.rejects(buildRelease(identityRoot), /protected benchmark identity/);

  const referenceBytes = JSON.stringify({ cards: [{ key: "guard-token-8972", name: "Guard Token" }],
    corpus: "x".repeat(64) });
  const embeddedReferenceFiles = {
    "public/index.html": '<script type="module" src="./entry.js"></script>',
    "public/entry.js": "export const clean = true;\n",
    "public/static/reference.js": `/*${referenceBytes}*/\n`,
  };
  const emittedReferenceRoot = await fixture(t, embeddedReferenceFiles, {
    name: "reference-bytes-emitted",
    config: { staticAssetRoots: ["public/static"] },
  });
  await buildRelease(emittedReferenceRoot);
  const emittedReferenceBytes = await readFile(
    join(emittedReferenceRoot.output, "public/static/reference.js"),
  );
  assert.ok(emittedReferenceBytes.includes(Buffer.from(referenceBytes)),
    "the static fixture bytes are emitted unchanged when the reference corpus is absent");

  const referenceRoot = await fixture(t, {
    ...embeddedReferenceFiles,
    "reference/stats/cards.json": referenceBytes,
  }, { name: "reference-bytes", config: { staticAssetRoots: ["public/static"] } });
  await assert.rejects(buildRelease(referenceRoot),
    /reference bytes from reference\/stats\/cards\.json are present in public\/static\/reference\.js/);
});

test("Chrome serves only manifest paths and records CSP-blocked and failed requests", {
  timeout: 180_000,
}, async (t) => {
  assert.ok(await import("node:fs/promises").then(({ access }) => access(PLAYWRIGHT).then(() => true, () => false)),
    "installed Playwright is required");
  assert.ok(await import("node:fs/promises").then(({ access }) => access(CHROME).then(() => true, () => false)),
    "installed Chrome is required");

  const directory = await mkdtemp(join(tmpdir(), "shipping-release-browser-"));
  const first = join(directory, "production");
  const servers = [];
  let browser;
  const failedRequestRecords = [];
  const cleanup = async () => {
    const activeBrowser = browser;
    browser = undefined;
    try {
      if (activeBrowser) await activeBrowser.close();
    } finally {
      await Promise.all(servers.splice(0).map((server) => server.close()));
    }
  };
  t.after(async () => {
    await cleanup();
    await rm(directory, { recursive: true, force: true });
  });
  await buildRelease({ output: first });
  const manifest = JSON.parse(await readFile(join(first, "release-manifest.json"), "utf8"));
  const productionPaths = manifest.files.map(({ path }) => path);
  const productionServer = await serveArtifact(first, productionPaths);
  servers.push(productionServer);

  const loaderFixture = await fixture(t, {
    "public/index.html": [
      '<!doctype html><html><head><meta charset="utf-8">',
      '<link rel="stylesheet" href="./probe.css"></head><body>',
      '<img id="asset-image" src="./pixel.svg">',
      '<div class="asset-background"></div>',
      '<audio id="asset-audio" src="./quiet.wav" preload="auto"></audio>',
      '<script type="module" src="./loader.js"></script></body></html>',
    ].join("\n"),
    "public/probe.css": '.asset-background { width: 2px; height: 2px; background-image: url("./surface.svg"); }',
    "public/pixel.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#000"/></svg>',
    "public/surface.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#fff"/></svg>',
    "public/quiet.wav": Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x28, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
      0x66, 0x6d, 0x74, 0x20, 0x10, 0, 0, 0, 1, 0, 1, 0, 0x40, 0x1f,
      0, 0, 0x80, 0x3e, 0, 0, 2, 0, 0x10, 0, 0x64, 0x61, 0x74, 0x61,
      4, 0, 0, 0, 0, 0, 0, 0,
    ]),
    "public/loader.js": [
      'globalThis.__releaseLoaderAttempts = [];',
      'if (new URL(location.href).searchParams.get("probe") === "hostile") {',
      '  const attempts = [];',
      '  function run(label, loader) { try { loader(); attempts.push({ label, result: "ran" }); } catch (error) { attempts.push({ label, result: error.name }); } }',
      `  run("eval", () => globalThis["ev" + "al"]("fetch('/__from_eval__')"));`,
      `  run("Function", () => new globalThis["Func" + "tion"]("fetch('/__from_function__')")());`,
      `  run("aliased Function", () => { const factory = (() => {}).constructor; factory("fetch('/__from_alias__')")(); });`,
      '  fetch("https://release-off-manifest.invalid/__release_unmanifested_fetch__").catch(() => {});',
      '  const offOriginFrame = document.createElement("iframe");',
      '  offOriginFrame.src = "https://release-off-manifest.invalid/__release_unmanifested_frame__";',
      '  document.body.appendChild(offOriginFrame);',
      '  globalThis.__releaseLoaderAttempts = attempts;',
      '}',
    ].join("\n"),
  }, { name: "reflective-loaders" });
  const hostileArtifact = join(directory, "hostile");
  await buildRelease({ ...loaderFixture, output: hostileArtifact });
  const hostileManifest = JSON.parse(await readFile(join(hostileArtifact, "release-manifest.json"), "utf8"));
  const hostilePaths = hostileManifest.files.map(({ path }) => path);
  const hostileServer = await serveArtifact(hostileArtifact, hostilePaths);
  servers.push(hostileServer);

  const { chromium } = await import(PLAYWRIGHT);
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const requestRecords = [];
  let hostileViolations = [];
  let hostileFetchCalls = [];
  let loaderAttempts = [];
  let serverRecords = [];
  let failedProbe;
  try {
    const page = await browser.newPage();
    await watchPage(page, requestRecords);
    const productionConsoleErrors = [];
    const productionPageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") productionConsoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => productionPageErrors.push(String(error)));
    const response = await page.goto(`${productionServer.baseUrl}/${manifest.entrypoints[0]}`, {
      waitUntil: "domcontentloaded",
    });
    assert.equal(response.status(), 200);
    assert.equal(await page.title(), "Moss & Ember — Card battler");
    await page.locator('[data-nav-to="battle"]').click();
    const productionFrame = page.frameLocator("[data-battle-frame-slot] iframe");
    try {
      await productionFrame.locator('[data-ui="arena"]').waitFor({ timeout: 8_000 });
    } catch (error) {
      const debug = await page.evaluate(() => ({
        body: document.body.innerHTML.slice(0, 800),
        violations: globalThis.__releasePolicyViolations,
        frames: [...document.querySelectorAll("iframe")].map((frame) => frame.src),
      }));
      throw new Error(`${error.message}\n${JSON.stringify({
        debug,
        consoleErrors: productionConsoleErrors,
        pageErrors: productionPageErrors,
        requests: requestRecords,
        server: productionServer.requests,
      }, null, 2)}`);
    }
    const productionState = await page.evaluate(() => ({
      appMounted: Boolean(document.querySelector("[data-nav-to=\"home\"]")),
      policy: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content,
    }));
    assert.equal(productionState.appMounted, true);
    assert.match(productionState.policy, /script-src 'self'/);
    assert.match(productionState.policy, /connect-src 'self'/);
    assert.match(productionState.policy, /frame-src 'self'/);
    assert.doesNotMatch(productionState.policy, /unsafe-eval/);

    const failedPage = await browser.newPage();
    await watchPage(failedPage, failedRequestRecords);
    await failedPage.route("**/src/ui/arena-shell.css", (route) => route.abort("failed"));
    await assert.rejects(
      failedPage.goto(`${productionServer.baseUrl}/src/ui/arena-shell.css`),
      /net::ERR_FAILED/,
    );
    failedProbe = failedRequestRecords.find(({ path, failure }) =>
      path === "/src/ui/arena-shell.css" && failure !== null);
    assert.ok(failedProbe, "Chrome request and requestfailed events include the failed in-manifest request");

    const hostilePage = await browser.newPage();
    const hostileRequests = [];
    await watchPage(hostilePage, hostileRequests);
    const hostileResponse = await hostilePage.goto(`${hostileServer.baseUrl}/public/index.html?probe=hostile`, {
      waitUntil: "load",
    });
    assert.equal(hostileResponse.status(), 200);
    await hostilePage.waitForFunction(() => Array.isArray(globalThis.__releaseLoaderAttempts));
    await hostilePage.waitForFunction(() => {
      const image = document.querySelector("#asset-image");
      const audio = document.querySelector("#asset-audio");
      return image?.complete && image.naturalWidth === 1 && audio?.readyState >= 1;
    });
    await hostilePage.waitForTimeout(50);
    loaderAttempts = await hostilePage.evaluate(() => globalThis.__releaseLoaderAttempts);
    hostileViolations = await hostilePage.evaluate(() => globalThis.__releasePolicyViolations);
    assert.deepEqual(loaderAttempts, [
      { label: "eval", result: "EvalError" },
      { label: "Function", result: "EvalError" },
      { label: "aliased Function", result: "EvalError" },
    ]);
    const evalViolations = hostileViolations.filter(({ blockedURI, effectiveDirective }) =>
      blockedURI === "eval" && effectiveDirective === "script-src");
    assert.ok(evalViolations.length >= 3, "Chrome reports each reflective loader blocked by script-src");
    hostileFetchCalls = await hostilePage.evaluate(() => globalThis.__releaseFetchCalls);
    assert.ok(hostileFetchCalls.includes(
      "https://release-off-manifest.invalid/__release_unmanifested_fetch__"),
    "the browser probe records the fetch API call before CSP evaluation");
    const offManifestViolation = hostileViolations.find(({ blockedURI, effectiveDirective }) =>
      effectiveDirective === "connect-src" && blockedURI.includes("release-off-manifest.invalid"));
    assert.ok(offManifestViolation,
      "Chrome's production policy event records the off-manifest origin blocked before network dispatch");
    const offOriginFrameViolation = hostileViolations.find(({ blockedURI, effectiveDirective }) =>
      effectiveDirective === "frame-src" && blockedURI.includes("release-off-manifest.invalid"));
    assert.ok(offOriginFrameViolation,
      "same-origin frame-src permits the shipped battle and still blocks off-origin frames");
    assert.equal(hostileServer.requests.some(({ path }) =>
      path === "__release_unmanifested_fetch__"), false);
    assert.equal(hostileServer.requests.some(({ path }) =>
      path === "__release_unmanifested_frame__"), false,
    "off-origin frames are blocked before network dispatch");
    assert.equal(hostileRequests.some(({ path }) => /__from_(?:eval|function|alias)__/.test(path)), false,
      "reflective loaders never run far enough to issue their embedded requests");
    assert.equal(hostileServer.requests.some(({ path }) => /__from_(?:eval|function|alias)__/.test(path)), false);

    const productionRequestPaths = new Set(productionPaths.map((path) => `/${path}`));
    for (const record of requestRecords)
      assert.ok(productionRequestPaths.has(record.path),
        `normal production browser request is outside the manifest: ${record.path}`);
    const hostileManifestPaths = new Set(hostilePaths.map((path) => `/${path}`));
    for (const record of hostileRequests) {
      if (record.path === "/__release_unmanifested_fetch__") {
        assert.ok(record.failure, "any emitted request event reflects the CSP failure");
        continue;
      }
      assert.ok(hostileManifestPaths.has(record.path),
        `normal hostile fixture request is outside its manifest: ${record.path}`);
    }
    assert.equal(productionServer.requests.some(({ status }) => status !== 200), false,
      "normal production asset requests all came from the manifest and succeeded");
    assert.equal(hostileServer.requests.some(({ status }) => status !== 200), false,
    "hostile fixture manifest asset requests all succeeded");
    const hostileAssetPaths = hostilePaths.filter((path) =>
      [".css", ".svg", ".wav"].includes(extname(path).toLowerCase()));
    for (const extension of [".css", ".wav"]) {
      const emittedAsset = hostileAssetPaths.find((path) => extname(path).toLowerCase() === extension);
      assert.ok(emittedAsset, `the manifest contains an emitted ${extension} asset`);
      assert.ok(hostileServer.requests.some((request) => request.path === emittedAsset),
        `Chrome loaded the manifest-listed ${extension} asset at ${emittedAsset}`);
    }
    const emittedSvgPaths = hostileAssetPaths.filter((path) => extname(path).toLowerCase() === ".svg");
    assert.equal(emittedSvgPaths.length, 2, "the manifest lists both fixture SVG assets");
    for (const emittedAsset of emittedSvgPaths)
      assert.ok(hostileServer.requests.some((request) => request.path === emittedAsset),
        `Chrome loaded the manifest-listed SVG asset at ${emittedAsset}`);

    serverRecords = [
      ...productionServer.requests.map((entry) => ({ artifact: "production", ...entry })),
      ...hostileServer.requests.map((entry) => ({ artifact: "hostile", ...entry })),
    ];
    const audit = await auditReleaseArtifact({ artifactRoot: first, referenceRoot: WORKSPACE });
    assert.ok(productionEvidence, "the byte-identical production build evidence was recorded first");
    assert.equal(audit.manifestSha256, productionEvidence.manifestSha256,
      "the Chrome-served production artifact matches the two reproducible production builds");
    await writeEvidence({
      schemaVersion: 1,
      production: {
        ...productionEvidence,
        normalRequestCount: requestRecords.length,
      },
      browser: {
        attemptedRequests: [
          ...requestRecords,
          ...failedRequestRecords,
          ...hostileRequests,
          {
            failure: "blocked by CSP before network dispatch",
            path: new URL(hostileFetchCalls.find((value) =>
              new URL(value).href === "https://release-off-manifest.invalid/__release_unmanifested_fetch__")).href,
            resourceType: "fetch",
            status: null,
          },
        ].map((record) => ({
          failure: record.failure,
          path: record.path,
          resourceType: record.resourceType,
          status: record.status,
        })),
        failedManifestRequest: failedProbe,
        fetchCallsBeforeCsp: hostileFetchCalls.map((value) => new URL(value).pathname),
        hostileLoaderAttempts: loaderAttempts,
        hostilePolicyViolations: hostileViolations.map((violation) => ({
          blockedURI: violation.blockedURI,
          effectiveDirective: violation.effectiveDirective,
        })),
        requestsSeenByServers: serverRecords,
        offManifestFetchReachedServer: false,
      },
    });
  } finally {
    await cleanup();
  }
});
