import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { writeFile } from "node:fs/promises";

const archiveRoot = process.env.RELEASE_ARCHIVE_ROOT;
const evidenceRoot = process.env.CRITIC_EVIDENCE_ROOT;
if (!archiveRoot || !evidenceRoot) throw new Error("archive and critic evidence roots are required");
const { buildPages } = await import(join(archiveRoot, "scripts/build-pages.js"));
const { createPagesPreviewServer } = await import(join(archiveRoot, "scripts/preview-pages.js"));
const { assertManifestRequests, launchReleaseChromium, recordBrowserRequests } =
  await import(join(archiveRoot, "tests/helpers/release-browser-audit.js"));
const temporary = await mkdtemp(join(tmpdir(), "release-pages-critic-"));
const output = join(temporary, "artifact");
const records = [];
let server;
let browser;
let context;
let browserPid = null;
let serverClosed = false;
let browserClosed = false;
let temporaryRemoved = false;

async function filesUnder(root) {
  const result = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else result.push(relative(root, absolute).split("\\").join("/"));
    }
  }
  await visit(root);
  return result.toSorted();
}

try {
  await buildPages({ output, repository: "MossTeam/ember-arena", ref: "feature/pages-landing" });
  const releaseRoot = join(output, "game");
  const manifestBytes = await readFile(join(releaseRoot, "release-manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const sourcePaths = (await filesUnder(join(archiveRoot, "public/assets")))
    .map((path) => `public/assets/${path}`).toSorted();
  const emittedAssets = manifest.files.filter(({ path }) => path.startsWith("public/assets/"))
    .toSorted((a, b) => a.path.localeCompare(b.path));
  assert.deepEqual(emittedAssets.map(({ path }) => path), sourcePaths,
    "the release preserves the exact canonical public asset paths");
  const publicHashes = new Set();
  const assetReceipts = [];
  for (const path of sourcePaths) {
    const source = await readFile(join(archiveRoot, ...path.split("/")));
    const emitted = emittedAssets.find((entry) => entry.path === path);
    const artifact = await readFile(join(releaseRoot, ...path.split("/")));
    const sourceHash = createHash("sha256").update(source).digest("hex");
    assert.equal(emitted.size, source.length, `${path} size is preserved`);
    assert.equal(emitted.sha256, sourceHash, `${path} manifest hash is preserved`);
    assert.deepEqual(artifact, source, `${path} bytes are preserved`);
    publicHashes.add(sourceHash);
    assetReceipts.push({ path, size: source.length, sha256: sourceHash });
  }
  const redundantHashedCopies = manifest.files.filter(({ path, sha256 }) =>
    !path.startsWith("public/assets/") && publicHashes.has(sha256));
  assert.deepEqual(redundantHashedCopies, [], "canonical public assets have no hashed aliases");
  const releasePaths = manifest.files.map(({ path }) => path);
  const protectedReleasePaths = releasePaths.filter((path) =>
    path.split("/").some((segment) => ["reference", "tests", "artifacts", "dist"].includes(segment)));
  assert.deepEqual(protectedReleasePaths, [], "release paths exclude protected source and evidence");
  const pagesPaths = await filesUnder(output);
  const protectedPagesPaths = pagesPaths.filter((path) =>
    path.split("/").some((segment) => ["reference", "tests", "artifacts", "dist"].includes(segment)));
  assert.deepEqual(protectedPagesPaths, [], "Pages paths exclude protected source and evidence");
  const pagesTotalBytes = (await Promise.all(pagesPaths.map(async (path) =>
    (await stat(join(output, ...path.split("/")))).size)))
    .reduce((sum, size) => sum + size, 0);
  const config = JSON.parse(await readFile(join(archiveRoot, "scripts/release-build.config.json"), "utf8"));
  const capBytes = config.limits.maxTotalBytes;
  assert.equal(capBytes, 8_388_608, "the established 8 MiB cap remains configured");
  assert.ok(manifest.totalBytes < capBytes, "the release stays below its configured byte cap");
  records.push({
    release: {
      fileCount: manifest.fileCount,
      totalBytes: manifest.totalBytes,
      maxTotalBytes: capBytes,
      manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
      canonicalPublicAssetCount: emittedAssets.length,
      canonicalPublicAssets: assetReceipts,
      redundantHashedCopies,
      protectedPaths: protectedReleasePaths,
    },
    pages: {
      fileCount: pagesPaths.length,
      totalBytes: pagesTotalBytes,
      protectedPaths: protectedPagesPaths,
    },
  });

  const mounted = await createPagesPreviewServer({
    root: output,
    basePath: "/clash-royale-clone/",
  });
  server = mounted.server;
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/clash-royale-clone`;
  browser = await launchReleaseChromium();
  const browserChild = browser.process?.() ?? null;
  browserPid = browserChild?.pid ?? null;
  context = await browser.newContext({ serviceWorkers: "block" });
  const requests = recordBrowserRequests(context);
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack ?? error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const gameUrl = `${baseUrl}/game/public/index.html`;
  const gamePage = await page.goto(gameUrl, { waitUntil: "networkidle", timeout: 20_000 });
  assert.equal(gamePage?.status(), 200);
  const rl = await page.evaluate(async () => {
    const moduleUrl = new URL("../src/rl/environment.js", location.href);
    const { RLEnvironment, RL_ACTION_COUNT } = await import(moduleUrl.href);
    const environment = new RLEnvironment({ seed: 17, horizonTicks: 10, strideTicks: 1 });
    const initial = environment.reset({ seed: 17, horizonTicks: 10, strideTicks: 1 });
    const first = environment.step(0);
    const snapshot = environment.serialize();
    const restored = RLEnvironment.restore(snapshot);
    const restoredAt = restored.observe();
    const second = restored.step(0);
    return {
      actionCount: RL_ACTION_COUNT,
      initialTick: initial.tick,
      initialStatus: initial.status,
      firstTick: first.observation.tick,
      firstTicksAdvanced: first.info.ticksAdvanced,
      restoredTick: restoredAt.tick,
      secondTick: second.observation.tick,
      secondTicksAdvanced: second.info.ticksAdvanced,
      moduleUrl: moduleUrl.href,
      finalStatus: second.observation.status,
    };
  });
  assert.equal(rl.initialTick, 0);
  assert.equal(rl.firstTick, 1);
  assert.equal(rl.restoredTick, 1);
  assert.equal(rl.secondTick, 2);
  assert.equal(rl.firstTicksAdvanced, 1);
  assert.equal(rl.secondTicksAdvanced, 1);
  assert.equal(rl.actionCount, 2305);
  const pagesManifest = {
    files: manifest.files.map((file) => ({ ...file, path: `game/${file.path}` })),
  };
  const requestsInManifest = assertManifestRequests(requests, {
    baseUrl,
    manifest: { files: [...pagesManifest.files, ...pagesPaths.map((path) => ({ path }))] },
    prefix: "/clash-royale-clone",
  });
  assert.ok(requestsInManifest.some(({ path, status }) =>
    path === "game/src/rl/environment.js" && status === 200), "the RL entry loads under the Pages prefix");
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  records.push({
    browser: {
      baseUrl,
      prefix: "/clash-royale-clone",
    gameUrl,
    gameStatus: gamePage.status(),
      rl,
      requestCount: requestsInManifest.length,
      requests: requestsInManifest,
      pageErrors,
      consoleErrors,
    },
  });
} catch (error) {
  records.push({ error: String(error?.stack ?? error) });
  throw error;
} finally {
  await context?.close().catch(() => {});
  if (browser) {
    const child = browser.process?.() ?? null;
    await browser.close().catch(() => {});
    browserClosed = !browser.isConnected();
    if (child?.exitCode === null) {
      await Promise.race([
        new Promise((resolveExit) => child.once("exit", resolveExit)),
        new Promise((resolveTimeout) => setTimeout(resolveTimeout, 3_000)),
      ]);
    }
  }
  if (server) {
    await new Promise((resolveClose, rejectClose) => server.close((error) =>
      error ? rejectClose(error) : resolveClose()));
    serverClosed = !server.listening;
  }
  await rm(temporary, { recursive: true, force: true });
  try { await access(temporary); } catch { temporaryRemoved = true; }
  const receipt = {
    schemaVersion: 1,
    candidate: "1872eb965aeb62232994541a517f39c65974241d",
    results: records,
    lifecycle: { browserPid, browserClosed, serverClosed, temporaryRemoved },
  };
  await writeFile(join(evidenceRoot, "pages-release-browser-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`);
  if (!browserClosed || !serverClosed || !temporaryRemoved) {
    throw new Error(`cleanup failed: ${JSON.stringify(receipt.lifecycle)}`);
  }
}
