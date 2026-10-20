import { once } from "node:events";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createPagesPreviewServer } from "./preview-pages.js";
import { createReleaseServer } from "./serve-release.js";

const WORKSPACE_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const MANIFEST_NAME = "release-manifest.json";
const QUALIFICATION_TIMEOUT_MS = 15_000;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isWithin(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function normalizePrefix(prefix) {
  invariant(typeof prefix === "string", "browser qualification prefix must be a string");
  if (prefix === "" || prefix === "/") return { path: "", pagesBasePath: "" };
  invariant(prefix.startsWith("/") && !prefix.includes("\\") &&
    !/[?#\u0000-\u001f]/u.test(prefix),
  "browser qualification prefix must be a plain URL path");
  const path = prefix.replace(/\/+$/u, "");
  const parts = path.slice(1).split("/");
  invariant(parts.length > 0 && parts.every((part) => part && part !== "." && part !== ".." &&
    /^[A-Za-z0-9._~-]+$/u.test(part)),
  "browser qualification prefix contains an invalid path segment");
  return { path, pagesBasePath: `${path}/` };
}

function normalizeRelativePath(value, label) {
  invariant(typeof value === "string" && value.length > 0 &&
    !value.startsWith("/") && !value.includes("\\"),
  `${label} must be a non-empty root-relative path`);
  const parts = value.split("/");
  invariant(parts.every((part) => part && part !== "." && part !== ".."),
    `${label} contains an invalid path segment: ${value}`);
  return value;
}

async function readArtifactManifest(root, manifestPath) {
  const normalizedPath = normalizeRelativePath(manifestPath, "manifestPath");
  const manifestAbsolute = resolve(root, ...normalizedPath.split("/"));
  invariant(isWithin(root, manifestAbsolute), "browser qualification manifest escapes artifact root");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestAbsolute, "utf8"));
  } catch (error) {
    throw new Error(`cannot read browser qualification manifest ${normalizedPath}: ${error.message}`);
  }
  invariant(manifest?.schemaVersion === 1 && Array.isArray(manifest.files),
    "browser qualification manifest has an unsupported shape");
  const paths = new Set();
  for (const entry of manifest.files) {
    const path = normalizeRelativePath(entry?.path, "manifest file path");
    invariant(!paths.has(path), `browser qualification manifest repeats ${path}`);
    paths.add(path);
  }
  invariant(paths.size > 0, "browser qualification manifest has no files");
  return { manifest, paths, path: normalizedPath };
}

async function listArtifactFiles(root) {
  const files = new Set();
  async function visit(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute, path);
      else if (entry.isFile()) files.add(path);
    }
  }
  await visit(root);
  return files;
}

function normalizeMountedPath(mountedPath) {
  invariant(typeof mountedPath === "string" && !mountedPath.startsWith("/") &&
    !mountedPath.includes("\\"), "mountedPath must be empty or a root-relative path");
  if (mountedPath === "") return "";
  return normalizeRelativePath(mountedPath, "mountedPath");
}

function encodePath(path) {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function pageUrl(baseUrl, path) {
  return `${baseUrl}/${encodePath(path)}`;
}

async function launchChromium() {
  const configuredPlaywright = process.env.GAME_BROWSER_PLAYWRIGHT;
  const playwrightPath = configuredPlaywright === undefined
    ? import.meta.resolve("playwright")
    : configuredPlaywright.startsWith("file:")
      ? configuredPlaywright
      : pathToFileURL(resolve(WORKSPACE_ROOT, configuredPlaywright)).href;
  const { chromium } = await import(playwrightPath);
  const executablePath = process.env.GAME_BROWSER_CHROME ?? chromium.executablePath();
  return chromium.launch({ executablePath, headless: true });
}

function sendMissing(response) {
  response.writeHead(404, { "Cache-Control": "no-store" });
  response.end();
}

async function startHost({ root, prefix, serverMode }) {
  let server;
  let releaseServer;
  if (serverMode === "release") {
    const release = await createReleaseServer({ root, logRequests: false });
    releaseServer = release.server;
    if (prefix === "") server = release.server;
    else {
      server = createServer((request, response) => {
        let parsed;
        try {
          parsed = new URL(request.url ?? "/", "http://127.0.0.1");
        } catch {
          sendMissing(response);
          return;
        }
        if (parsed.pathname !== prefix && !parsed.pathname.startsWith(`${prefix}/`)) {
          sendMissing(response);
          return;
        }
        const path = parsed.pathname.slice(prefix.length) || "/";
        request.url = `${path}${parsed.search}`;
        releaseServer.emit("request", request, response);
      });
    }
  } else {
    const pages = await createPagesPreviewServer({
      root,
      basePath: prefix ? `${prefix}/` : "",
      logRequests: false,
    });
    server = pages.server;
  }

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  invariant(address && typeof address === "object", "browser qualification host did not bind a port");
  return {
    baseUrl: `http://127.0.0.1:${address.port}${prefix}`,
    close: () => new Promise((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    }),
    server,
  };
}

function captureBrowserActivity(context) {
  const requests = [];
  const byRequest = new WeakMap();
  const runtimeErrors = [];
  const workerUrls = new Set();
  const attachedPages = new WeakSet();

  context.on("request", (request) => {
    const record = {
      failure: null,
      method: request.method(),
      resourceType: request.resourceType(),
      status: null,
      contentType: null,
      url: request.url(),
    };
    requests.push(record);
    byRequest.set(request, record);
  });
  context.on("response", (response) => {
    const record = byRequest.get(response.request());
    if (record) {
      record.status = response.status();
      record.contentType = response.headers()["content-type"] ?? null;
    }
  });
  context.on("requestfailed", (request) => {
    const record = byRequest.get(request);
    if (record) record.failure = request.failure()?.errorText ?? "request failed";
  });
  context.on("weberror", (webError) => {
    const error = typeof webError.error === "function" ? webError.error() : webError.error;
    runtimeErrors.push(error?.stack ?? error?.message ?? String(error));
  });

  function attachPage(page) {
    if (attachedPages.has(page)) return;
    attachedPages.add(page);
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });
    page.on("pageerror", (error) => runtimeErrors.push(error.stack ?? String(error)));
    page.on("crash", () => runtimeErrors.push(`page crashed: ${page.url()}`));
    page.on("worker", (worker) => {
      workerUrls.add(worker.url());
      worker.on("console", (message) => {
        if (message.type() === "error") runtimeErrors.push(message.text());
      });
    });
  }
  context.on("page", attachPage);
  for (const page of context.pages()) attachPage(page);
  return { requests, runtimeErrors, workerUrls };
}

async function browserFailureSnapshot(context, activity, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const pages = await Promise.all(context.pages().map(async (page) => {
    if (page.isClosed()) return { closed: true };
    const document = await page.evaluate(() => {
      const battleView = document.querySelector('[data-app-view="battle"]');
      const frame = document.querySelector("[data-battle-frame-slot] iframe");
      let frameSummary = null;
      if (frame) {
        const bounds = frame.getBoundingClientRect();
        frameSummary = {
          src: frame.getAttribute("src"),
          resolvedSrc: frame.src,
          sandbox: frame.getAttribute("sandbox"),
          loading: frame.loading,
          width: bounds.width,
          height: bounds.height,
        };
      }
      return {
        url: location.href,
        title: document.title,
        readyState: document.readyState,
        activeView: document.querySelector(".app-shell")?.dataset.viewActive ?? null,
        battleViewHidden: battleView?.hidden ?? null,
        battleFrameCount: document.querySelectorAll("[data-battle-frame-slot] iframe").length,
        battleFrame: frameSummary,
      };
    }).catch((error) => ({ inspectionError: error?.message ?? String(error) }));
    const frames = await Promise.all(page.frames().map(async (frame) => ({
      name: frame.name(),
      url: frame.url(),
      document: await frame.evaluate(() => {
        const arena = document.querySelector('[data-ui="arena"]');
        const bounds = arena?.getBoundingClientRect();
        return {
          title: document.title,
          readyState: document.readyState,
          bodyAppFrame: document.body?.dataset.appFrame ?? null,
          bodyText: document.body?.innerText?.slice(0, 400) ?? "",
          arenaCount: document.querySelectorAll('[data-ui="arena"]').length,
          arenaVisible: Boolean(arena && bounds && bounds.width > 0 && bounds.height > 0),
          scripts: [...document.scripts].map((script) => ({
            type: script.type,
            path: script.src ? new URL(script.src, document.baseURI).pathname : "inline",
          })),
          stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) =>
            new URL(link.href, document.baseURI).pathname),
        };
      }).catch((error) => ({ inspectionError: error?.message ?? String(error) })),
    })));
    return { url: page.url(), document, frames };
  }));
  const requests = activity.requests.slice(-200).map((record) => {
    let url = record.url;
    try {
      const parsed = new URL(record.url);
      url = parsed.origin === origin ? `${parsed.pathname}${parsed.search}` : parsed.origin;
    } catch {
      url = "<invalid URL>";
    }
    return {
      method: record.method,
      resourceType: record.resourceType,
      url,
      status: record.status,
      contentType: record.contentType,
      failure: record.failure,
    };
  });
  return {
    runtimeErrors: [...activity.runtimeErrors],
    requests,
    pages,
  };
}

async function waitForSettledPages(context) {
  const pages = context.pages();
  for (const page of pages) {
    if (page.isClosed()) continue;
    await page.waitForLoadState("networkidle", { timeout: QUALIFICATION_TIMEOUT_MS });
  }
}

function assertNavigationResponse(response, label) {
  invariant(response && response.status() === 200,
    `${label} returned ${response?.status() ?? "no HTTP response"}`);
}

async function enterBattle(page) {
  const battleButton = page.locator('[data-nav-to="battle"]');
  await battleButton.waitFor({ state: "visible", timeout: QUALIFICATION_TIMEOUT_MS });
  await battleButton.click();
  await page.frameLocator("[data-battle-frame-slot] iframe")
    .locator('[data-ui="arena"]')
    .waitFor({ state: "visible", timeout: QUALIFICATION_TIMEOUT_MS });
}

async function runGameFlow({ baseUrl, browserEntrypoints, context, landingPage, mountedPath }) {
  const flows = [];
  let gamePage;
  if (landingPage) {
    gamePage = await context.newPage();
    const landing = await gamePage.goto(`${baseUrl}/`, { waitUntil: "load" });
    assertNavigationResponse(landing, "Pages landing page");
    flows.push({ kind: "landing", path: "index.html" });
    const launchLink = gamePage.locator(".primary-nav__play");
    await launchLink.waitFor({ state: "visible", timeout: QUALIFICATION_TIMEOUT_MS });
    const gameResponse = await Promise.all([
      gamePage.waitForNavigation({ waitUntil: "load", timeout: QUALIFICATION_TIMEOUT_MS }),
      launchLink.click(),
    ]).then(([response]) => response);
    assertNavigationResponse(gameResponse, "Pages game entrypoint");
    flows.push({ kind: "pages-cta", path: `${mountedPath}/public/index.html` });
  } else {
    invariant(browserEntrypoints.length > 0,
      "game qualification requires at least one browser entrypoint");
    const firstEntry = browserEntrypoints[0];
    gamePage = await context.newPage();
    const response = await gamePage.goto(pageUrl(baseUrl, firstEntry), { waitUntil: "load" });
    assertNavigationResponse(response, `browser entrypoint ${firstEntry}`);
    flows.push({ kind: "browser-entrypoint", path: firstEntry });
  }

  await enterBattle(gamePage);
  flows.push({ kind: "battle", path: landingPage
    ? `${mountedPath}/public/index.html`
    : browserEntrypoints[0] });
  if (!landingPage) {
    for (const entrypoint of browserEntrypoints.slice(1)) {
      const page = await context.newPage();
      const response = await page.goto(pageUrl(baseUrl, entrypoint), { waitUntil: "load" });
      assertNavigationResponse(response, `browser entrypoint ${entrypoint}`);
      flows.push({ kind: "browser-entrypoint", path: entrypoint });
    }
  }
  await waitForSettledPages(context);
  return { flows, gamePage };
}

async function runGenericFlow({ baseUrl, browserEntrypoints, context, moduleEntrypoints }) {
  const flows = [];
  const pages = [];
  for (const entrypoint of browserEntrypoints) {
    const page = await context.newPage();
    const response = await page.goto(pageUrl(baseUrl, entrypoint), { waitUntil: "load" });
    assertNavigationResponse(response, `browser entrypoint ${entrypoint}`);
    await waitForSettledPages(context);
    pages.push(page);
    flows.push({ kind: "browser-entrypoint", path: entrypoint });
  }
  let page = pages[0];
  if (!page && moduleEntrypoints.length > 0) {
    page = await context.newPage();
    const response = await page.goto(pageUrl(baseUrl, moduleEntrypoints[0]), { waitUntil: "load" });
    assertNavigationResponse(response, `module entrypoint ${moduleEntrypoints[0]}`);
    flows.push({ kind: "module-document", path: moduleEntrypoints[0] });
  }
  return { flows, gamePage: page };
}

async function importAndExerciseModules({
  baseUrl,
  context,
  flow,
  gamePage,
  moduleEntrypoints,
  mountedPath,
}) {
  const checks = [];
  if (flow === "game") {
    const rlPath = moduleEntrypoints.find((path) => path === "src/rl/environment.js");
    invariant(rlPath, "game qualification requires the standalone RL environment module");
  }
  for (const path of moduleEntrypoints) {
    const artifactPath = mountedPath ? `${mountedPath}/${path}` : path;
    if (flow === "game" && path === "src/ui/arena-shell-entry.js") {
      const arenaFrame = gamePage?.frames().find((frame) => {
        try {
          return new URL(frame.url()).pathname.endsWith("/public/ui-arena-shell.html");
        } catch {
          return false;
        }
      });
      invariant(arenaFrame,
        "game qualification could not find the loaded public arena iframe for its standalone controller entry");
      const result = await arenaFrame.evaluate(async (moduleUrl) => {
        const module = await import(moduleUrl);
        const controller = module.arenaHudController;
        const arena = document.querySelector('[data-ui="arena"]');
        return {
          attachedArena: arena?.isConnected === true,
          controllerPresent: controller !== null && controller !== undefined,
          exports: Object.keys(module).sort(),
          hasControllerApi: ["enterManualStepMode", "serialize", "stepMany"]
            .every((name) => typeof controller?.[name] === "function"),
          imported: true,
          sessionActive: controller?.state?.active === true,
          sessionTick: controller?.state?.sessionTick ?? null,
        };
      }, pageUrl(baseUrl, artifactPath));
      invariant(result.imported && result.controllerPresent && result.attachedArena &&
        result.hasControllerApi && result.sessionActive &&
        Number.isSafeInteger(result.sessionTick),
      "standalone arena controller entry did not expose the active shipped iframe controller");
      checks.push({ path, ...result });
      await waitForSettledPages(context);
      continue;
    }
    const page = gamePage ?? await context.newPage();
    const result = await page.evaluate(async ({ moduleUrl, exerciseRLEnvironment }) => {
      const module = await import(moduleUrl);
      const exports = Object.keys(module).sort();
      if (!exerciseRLEnvironment) return { exports, imported: true };
      if (typeof module.createRLEnvironment !== "function" ||
          typeof module.RLEnvironment?.restore !== "function") {
        throw new Error("standalone RL module is missing its factory or restore API");
      }
      const environment = module.createRLEnvironment({
        horizonTicks: 3,
        seed: 319,
        strideTicks: 1,
      });
      const initial = environment.observe();
      const reset = environment.reset();
      const stepped = environment.step(0);
      const serialized = environment.serialize();
      const restored = module.RLEnvironment.restore(serialized);
      const restoredObservation = restored.observe();
      return {
        exports,
        imported: true,
        initialTick: initial.tick,
        resetTick: reset.tick,
        stepTick: stepped.observation.tick,
        stepStatus: stepped.observation.status,
        terminated: stepped.terminated,
        truncated: stepped.truncated,
        restoredTick: restoredObservation.tick,
        restoredMatches: JSON.stringify(restoredObservation) === JSON.stringify(environment.observe()),
        serializedBytes: new TextEncoder().encode(serialized).byteLength,
      };
    }, {
      exerciseRLEnvironment: flow === "game" && path === "src/rl/environment.js",
      moduleUrl: pageUrl(baseUrl, artifactPath),
    });
    invariant(result.imported, `standalone module did not import: ${path}`);
    if (flow === "game" && path === "src/rl/environment.js") {
      invariant(result.initialTick === 0 && result.resetTick === 0 && result.stepTick === 1 &&
        result.stepStatus === "running" && !result.terminated && !result.truncated &&
        result.restoredTick === 1 && result.restoredMatches && result.serializedBytes > 0,
      "standalone RL reset/step/serialize/restore smoke check failed");
    }
    checks.push({ path, ...result });
    await waitForSettledPages(context);
  }
  return checks;
}

function requestSummary({ records, origin, prefix, serverMode, mountedPath, manifestPaths, pagesFiles }) {
  const summary = [];
  for (const record of records) {
    let url;
    try {
      url = new URL(record.url);
    } catch {
      throw new Error(`browser emitted an invalid request URL: ${record.url}`);
    }
    invariant(url.origin === origin,
      `browser attempted an off-origin request: ${record.url}`);
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      throw new Error(`browser requested an invalid encoded path: ${record.url}`);
    }
    invariant(!pathname.includes("\\") && !pathname.includes("\0"),
      `browser requested an invalid path: ${pathname}`);
    if (prefix) {
      invariant(pathname === prefix || pathname.startsWith(`${prefix}/`),
        `browser request escaped mounted prefix ${prefix}: ${pathname}`);
      pathname = pathname.slice(prefix.length) || "/";
    }
    const requestedPath = pathname.replace(/^\/+/, "");
    let artifactPath = requestedPath;
    let scope = "release";
    if (serverMode === "pages") {
      if (mountedPath && (requestedPath === mountedPath ||
          requestedPath.startsWith(`${mountedPath}/`))) {
        artifactPath = requestedPath === mountedPath
          ? ""
          : requestedPath.slice(mountedPath.length + 1);
        if (!artifactPath || !manifestPaths.has(artifactPath)) {
          throw new Error(`browser requested an unmanifested release path ${requestedPath} ` +
            `(manifest: false, HTTP ${record.status ?? "no response"})`);
        }
      } else {
        scope = "pages";
        let pagesPath = requestedPath;
        if (pagesPath === "") pagesPath = "index.html";
        else if (pagesPath.endsWith("/")) pagesPath += "index.html";
        if (!pagesFiles.has(pagesPath)) {
          throw new Error(`browser requested an unmanifested Pages path ${requestedPath} ` +
            `(artifact: false, HTTP ${record.status ?? "no response"})`);
        }
        artifactPath = pagesPath;
      }
    } else {
      if (!manifestPaths.has(artifactPath)) {
        throw new Error(`browser requested an unmanifested release path ${artifactPath} ` +
          `(manifest: false, HTTP ${record.status ?? "no response"})`);
      }
    }
    invariant(record.failure === null,
      `${record.url} failed: ${record.failure}`);
    invariant(record.status === 200,
      `${record.url} returned ${record.status ?? "no HTTP response"}`);
    summary.push({
      method: record.method,
      path: artifactPath,
      resourceType: record.resourceType,
      scope,
      status: record.status,
    });
  }
  summary.sort((left, right) =>
    left.path.localeCompare(right.path) ||
    left.method.localeCompare(right.method) ||
    left.resourceType.localeCompare(right.resourceType) ||
    left.scope.localeCompare(right.scope) ||
    left.status - right.status);
  return summary;
}

function workerSummary(workerUrls, { origin, prefix }) {
  const result = [];
  for (const rawUrl of workerUrls) {
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new Error(`browser started a worker with an invalid URL: ${rawUrl}`);
    }
    invariant(url.origin === origin, `browser started an off-origin worker: ${rawUrl}`);
    let pathname = decodeURIComponent(url.pathname);
    if (prefix) {
      invariant(pathname === prefix || pathname.startsWith(`${prefix}/`),
        `browser worker escaped mounted prefix ${prefix}: ${pathname}`);
      pathname = pathname.slice(prefix.length) || "/";
    }
    result.push(pathname.replace(/^\/+/, ""));
  }
  return result.toSorted();
}

/**
 * Runs a Chromium qualification pass against the same release or Pages host used by previews.
 * A successful result is a deterministic, port-free summary suitable for build metadata.
 */
export async function qualifyBrowserArtifact({
  root,
  manifestPath = MANIFEST_NAME,
  serverMode,
  prefix = "",
  mountedPath = "",
  browserEntrypoints = [],
  moduleEntrypoints = [],
  landingPage = false,
  flow = "generic",
} = {}) {
  invariant(serverMode === "release" || serverMode === "pages",
    'serverMode must be "release" or "pages"');
  invariant(flow === "game" || flow === "generic", 'flow must be "game" or "generic"');
  invariant(Array.isArray(browserEntrypoints) && Array.isArray(moduleEntrypoints),
    "browser and module entrypoints must be arrays");
  browserEntrypoints = browserEntrypoints.map((path) =>
    normalizeRelativePath(path, "browser entrypoint"));
  moduleEntrypoints = moduleEntrypoints.map((path) =>
    normalizeRelativePath(path, "module entrypoint"));
  const normalizedPrefix = normalizePrefix(prefix);
  const normalizedMountedPath = normalizeMountedPath(mountedPath);
  invariant(serverMode === "pages" || normalizedMountedPath === "",
    "release qualification cannot have a mountedPath");
  invariant(serverMode !== "release" || !landingPage,
    "release qualification cannot include a Pages landing page");
  invariant(serverMode !== "pages" || (landingPage && flow === "game"),
    "Pages qualification requires the production landing page and game flow");

  const rootReal = await realpath(resolve(root));
  const rootInfo = await lstat(rootReal);
  invariant(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(),
    "browser qualification root must be a regular directory");
  const { manifest, paths: manifestPaths } = await readArtifactManifest(rootReal, manifestPath);
  invariant(serverMode !== "release" || manifestPath === MANIFEST_NAME,
    `release manifest must be at ${MANIFEST_NAME}`);
  invariant(serverMode !== "pages" || (normalizedMountedPath &&
    manifestPath === `${normalizedMountedPath}/${MANIFEST_NAME}`),
  "Pages release manifest must be rooted at mountedPath");
  const pagesFiles = serverMode === "pages" ? await listArtifactFiles(rootReal) : new Set();
  for (const path of browserEntrypoints) {
    const manifestPathEntry = serverMode === "pages" && normalizedMountedPath
      ? `${normalizedMountedPath}/${path}`
      : path;
    invariant(manifestPaths.has(path) ||
      (serverMode === "pages" && pagesFiles.has(manifestPathEntry)),
    `browser entrypoint is absent from artifact: ${manifestPathEntry}`);
  }
  for (const path of moduleEntrypoints) {
    invariant(manifestPaths.has(path), `module entrypoint is absent from release manifest: ${path}`);
  }
  if (flow === "game") {
    invariant(moduleEntrypoints.includes("src/rl/environment.js"),
      "game qualification requires src/rl/environment.js as a standalone module");
  }

  const host = await startHost({
    prefix: normalizedPrefix.path,
    root: rootReal,
    serverMode,
  });
  let browser;
  let context;
  try {
    browser = await launchChromium();
    context = await browser.newContext({ serviceWorkers: "block" });
    const activity = captureBrowserActivity(context);
    let flowResult;
    try {
      flowResult = flow === "game"
        ? await runGameFlow({
          baseUrl: host.baseUrl,
          browserEntrypoints,
          context,
          landingPage,
          mountedPath: normalizedMountedPath,
        })
        : await runGenericFlow({
          baseUrl: host.baseUrl,
          browserEntrypoints,
          context,
          moduleEntrypoints,
        });
    } catch (error) {
      if (flow === "game") {
        try {
          const diagnostics = await browserFailureSnapshot(context, activity, host.baseUrl);
          error.message = `${error.message}\nRelease browser failure diagnostics:\n${JSON.stringify(diagnostics, null, 2)}`;
        } catch (diagnosticError) {
          error.message = `${error.message}\nRelease browser diagnostics unavailable: ${diagnosticError?.message ?? diagnosticError}`;
        }
      }
      throw error;
    }
    const { flows, gamePage } = flowResult;
    const modules = await importAndExerciseModules({
      baseUrl: host.baseUrl,
      context,
      flow,
      gamePage,
      moduleEntrypoints,
      mountedPath: normalizedMountedPath,
    });
    await waitForSettledPages(context);
    const origin = new URL(host.baseUrl).origin;
    const requests = requestSummary({
      records: activity.requests,
      origin,
      prefix: normalizedPrefix.path,
      serverMode,
      mountedPath: normalizedMountedPath,
      manifestPaths,
      pagesFiles,
    });
    invariant(activity.runtimeErrors.length === 0,
      `browser runtime errors:\n${activity.runtimeErrors.join("\n")}`);
    const workers = workerSummary(activity.workerUrls, {
      origin,
      prefix: normalizedPrefix.path,
    });
    return Object.freeze({
      schemaVersion: 1,
      serverMode,
      flow,
      prefix: normalizedPrefix.path,
      mountedPath: normalizedMountedPath,
      browserEntrypoints: [...browserEntrypoints],
      moduleEntrypoints: [...moduleEntrypoints],
      flows,
      modules,
      requestCount: requests.length,
      requests,
      workers,
      serviceWorkers: "blocked",
      runtimeErrors: [],
      releaseManifestPath: serverMode === "pages"
        ? `${normalizedMountedPath}/${basename(manifestPath)}`
        : manifestPath,
      releaseManifestFileCount: manifest.files.length,
      pagesFileCount: pagesFiles.size,
    });
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    await host.close();
  }
}
