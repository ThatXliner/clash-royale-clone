import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, lstat, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = process.env.RELEASE_ARCHIVE_ROOT;
const output = process.env.PAGES_ARTIFACT_ROOT;
const evidence = process.env.BUILDER_EVIDENCE_ROOT;
const candidate = '46c542a10df358902fa1147e6d2b7ad04ea80d57';
const prefix = '/clash-royale-clone';
assert.ok(repo && output && evidence, 'private source, Pages output, and evidence roots are required');
const [{ createPagesPreviewServer }, { launchReleaseChromium, recordBrowserRequests, assertManifestRequests },
  { createVisualAssetManifest }, { getCardPortraitIds, getCardPortrait }] = await Promise.all([
  import(pathToFileURL(join(repo, 'scripts/preview-pages.js')).href),
  import(pathToFileURL(join(repo, 'tests/helpers/release-browser-audit.js')).href),
  import(pathToFileURL(join(repo, 'src/content/visual-asset-manifest.js')).href),
  import(pathToFileURL(join(repo, 'src/ui/card-portrait-art.js')).href),
]);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const records = [];
let server;
let browser;
let browserPid = null;
let serverClosed = false;
let browserClosed = false;

async function filesUnder(root) {
  const found = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else {
        const metadata = await lstat(absolute);
        assert.ok(metadata.isFile() && !metadata.isSymbolicLink(), `${absolute} must be a regular file`);
        found.push(relative(root, absolute).split('\\').join('/'));
      }
    }
  }
  await visit(root);
  return found.toSorted();
}

async function auditArtifact() {
  const releaseRoot = join(output, 'game');
  const manifestBytes = await readFile(join(releaseRoot, 'release-manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const config = JSON.parse(await readFile(join(repo, 'scripts/release-build.config.json'), 'utf8'));
  assert.equal(config.limits.maxFiles, 128);
  assert.equal(config.limits.maxFileBytes, 1_048_576);
  assert.equal(config.limits.maxTotalBytes, 8_388_608);
  assert.equal(manifest.fileCount, manifest.files.length);
  assert.ok(manifest.fileCount <= config.limits.maxFiles);
  const releaseFiles = [];
  for (const entry of manifest.files) {
    const bytes = await readFile(join(releaseRoot, ...entry.path.split('/')));
    assert.equal(bytes.length, entry.size, `${entry.path} size matches release manifest`);
    assert.equal(sha256(bytes), entry.sha256, `${entry.path} SHA-256 matches release manifest`);
    assert.ok(bytes.length <= config.limits.maxFileBytes, `${entry.path} stays within the per-file cap`);
    releaseFiles.push({ path: entry.path, bytes: bytes.length, sha256: entry.sha256 });
  }
  const totalBytes = releaseFiles.reduce((sum, entry) => sum + entry.bytes, 0);
  assert.equal(totalBytes, manifest.totalBytes, 'manifest total is the sum of emitted file bytes');
  assert.ok(totalBytes <= config.limits.maxTotalBytes, 'release stays within the unchanged total cap');
  const releaseProtectedPaths = releaseFiles.map(({ path }) => path).filter((path) =>
    path.split('/').some((part) => ['reference', 'tests', 'artifacts', 'dist'].includes(part)));
  assert.deepEqual(releaseProtectedPaths, [], 'release manifest excludes protected source and evidence paths');

  const pageFiles = await filesUnder(output);
  const pageBytes = await Promise.all(pageFiles.map(async (path) => ({
    path, bytes: (await stat(join(output, ...path.split('/')))).size,
  })));
  const pageProtectedPaths = pageFiles.filter((path) =>
    path.split('/').some((part) => ['reference', 'tests', 'artifacts', 'dist'].includes(part)));
  assert.deepEqual(pageProtectedPaths, [], 'assembled Pages files exclude protected source and evidence paths');
  const siteHtml = await readFile(join(output, 'index.html'), 'utf8');
  assert.ok(siteHtml.includes(candidate), 'assembled landing page points to the complete frozen candidate SHA');
  assert.ok(siteHtml.includes('./game/public/index.html'), 'landing page carries the game link under its prefix');

  const publicRoot = join(repo, 'public/assets');
  const publicPaths = (await filesUnder(publicRoot)).map((path) => `public/assets/${path}`).toSorted();
  const emittedAssets = manifest.files.filter(({ path }) => path.startsWith('public/assets/'))
    .toSorted((a, b) => a.path.localeCompare(b.path));
  assert.deepEqual(emittedAssets.map(({ path }) => path), publicPaths,
    'release preserves the complete canonical public asset path inventory');
  const publicAssetReceipts = [];
  const publicHashes = new Set();
  for (const path of publicPaths) {
    const source = await readFile(join(repo, ...path.split('/')));
    const emitted = emittedAssets.find((entry) => entry.path === path);
    const artifact = await readFile(join(releaseRoot, ...path.split('/')));
    const hash = sha256(source);
    assert.equal(emitted.size, source.length, `${path} bytes match the manifest`);
    assert.equal(emitted.sha256, hash, `${path} hash matches the manifest`);
    assert.deepEqual(artifact, source, `${path} is byte-exact in the assembled release`);
    publicHashes.add(hash);
    publicAssetReceipts.push({ path, size: source.length, sha256: hash });
  }
  const redundantHashedCopies = manifest.files.filter(({ path, sha256: hash }) =>
    !path.startsWith('public/assets/') && publicHashes.has(hash));
  assert.deepEqual(redundantHashedCopies, [], 'canonical public assets have no redundant hash aliases');

  const visualRegistry = createVisualAssetManifest();
  assert.equal(visualRegistry.assets.length, publicPaths.length, 'visual registry covers all shipped public assets');
  const visualByPath = new Map(visualRegistry.assets.map((asset) => [asset.path, asset]));
  for (const asset of publicAssetReceipts) {
    const registered = visualByPath.get(asset.path.replace(/^public\//u, ''));
    assert.ok(registered, `${asset.path} is registered`);
    assert.equal(registered.byteLength, asset.size, `${asset.path} visual registry size matches`);
    assert.equal(registered.sha256, asset.sha256, `${asset.path} visual registry hash matches`);
  }
  const portraitIds = getCardPortraitIds();
  assert.equal(portraitIds.length, 21, 'all current registered portrait records are included');
  const portraitAssets = portraitIds.map((id) => {
    const portrait = getCardPortrait(id);
    assert.ok(portrait, `${id} has a registered portrait`);
    const absolute = fileURLToPath(portrait.src);
    const path = `public/assets/${relative(publicRoot, absolute).split('\\').join('/')}`;
    assert.ok(publicPaths.includes(path), `${id} portrait resolves to a shipped public asset`);
    return { cardId: id, assetPath: path, cell: portrait.cell };
  });
  const maxPagesBytes = pageBytes.reduce((sum, entry) => sum + entry.bytes, 0);
  records.push({
    artifact: {
      candidate,
      repository: 'ThatXliner/clash-royale-clone',
      pagesOutput: output,
      sitePrefix: prefix,
      manifestSha256: sha256(manifestBytes),
      releaseFileCount: manifest.fileCount,
      releaseTotalBytes: totalBytes,
      caps: config.limits,
      releaseFiles,
      protectedPaths: releaseProtectedPaths,
      pagesFileCount: pageFiles.length,
      pagesTotalBytes: maxPagesBytes,
      pagesProtectedPaths: pageProtectedPaths,
      canonicalAssetCount: publicAssetReceipts.length,
      canonicalPublicAssets: publicAssetReceipts,
      redundantHashedCopies,
      registeredCardPortraitCount: portraitIds.length,
      registeredCardPortraits: portraitAssets,
    },
  });
  return { manifest, pageFiles, config };
}

async function browserAudit(manifest, pageFiles) {
  const mounted = await createPagesPreviewServer({ root: output, basePath: `${prefix}/` });
  server = mounted.server;
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}${prefix}`;
  browser = await launchReleaseChromium();
  browserPid = browser.process?.()?.pid ?? null;
  const expectedPortraitIds = getCardPortraitIds().toSorted();
  const portraitPathById = new Map(getCardPortraitIds().map((id) => {
    const portrait = getCardPortrait(id);
    const relativePath = relative(join(repo, 'public/assets'), fileURLToPath(portrait.src)).split('\\').join('/');
    return [id, `${prefix}/game/public/assets/${relativePath}`];
  }));
  const viewportResults = [];
  const pagesManifest = {
    files: [...manifest.files.map((file) => ({ ...file, path: `game/${file.path}` })),
      ...pageFiles.map((path) => ({ path }))],
  };

  for (const viewport of [{ name: 'phone-390x844', width: 390, height: 844 },
    { name: 'desktop-1440x933', width: 1440, height: 933 }]) {
    const context = await browser.newContext({ deviceScaleFactor: 1, serviceWorkers: 'block',
      viewport: { width: viewport.width, height: viewport.height } });
    const requests = recordBrowserRequests(context);
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error?.stack ?? error)));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    const screenshots = {};
    const rootUrl = `${baseUrl}/`;
    const rootResponse = await page.goto(rootUrl, { waitUntil: 'networkidle', timeout: 20_000 });
    assert.equal(rootResponse?.status(), 200, `${viewport.name}: assembled landing returns 200`);
    assert.ok(page.url().startsWith(`${baseUrl}/`), `${viewport.name}: landing remains under Pages prefix`);
    screenshots.landing = join(evidence, `pages-v2-${viewport.name}-landing.png`);
    await page.screenshot({ path: screenshots.landing });
    const playLink = page.locator('.hero__actions a.button--ember');
    assert.ok(await playLink.isVisible(), `${viewport.name}: landing game link is visible`);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20_000 }),
      playLink.click(),
    ]);
    const gameUrl = `${baseUrl}/game/public/index.html`;
    assert.equal(page.url(), gameUrl, `${viewport.name}: play link resolves beneath the Pages prefix`);
    assert.ok(page.url().startsWith(`${baseUrl}/`));
    screenshots.gameHome = join(evidence, `pages-v2-${viewport.name}-game-home.png`);
    await page.screenshot({ path: screenshots.gameHome });

    await page.locator('[data-nav-to="cards"]').click();
    await page.locator('[data-card-grid] .collection-card').first().waitFor({ state: 'visible' });
    const renderedPortraits = await page.evaluate(async () => {
      const cards = [...document.querySelectorAll('[data-card-grid] .collection-card')];
      const rows = cards.map((card) => {
        const image = card.querySelector('img.card-art-image');
        return { cardId: card.dataset.cardId, src: image?.src ?? null, cell: image?.dataset.portraitCell ?? null };
      });
      const images = [...document.querySelectorAll('[data-card-grid] img.card-art-image')];
      await Promise.all(images.map((image) => image.decode()));
      return {
        rows,
        images: images.map((image) => ({
          complete: image.complete,
          currentSrc: image.currentSrc,
          height: image.naturalHeight,
          width: image.naturalWidth,
        })),
      };
    });
    const renderedIds = renderedPortraits.rows.map(({ cardId }) => cardId).toSorted();
    assert.deepEqual(renderedIds, expectedPortraitIds, `${viewport.name}: all 21 card portraits render`);
    assert.equal(renderedPortraits.images.length, 21);
    renderedPortraits.rows.forEach((row, index) => {
      assert.equal(new URL(row.src).pathname, portraitPathById.get(row.cardId),
        `${viewport.name}: ${row.cardId} portrait uses its registered prefixed path`);
      assert.ok(renderedPortraits.images[index].complete && renderedPortraits.images[index].width > 0 &&
        renderedPortraits.images[index].height > 0, `${viewport.name}: ${row.cardId} portrait decodes`);
    });
    screenshots.cards = join(evidence, `pages-v2-${viewport.name}-cards.png`);
    await page.screenshot({ path: screenshots.cards });

    const rl = await page.evaluate(async () => {
      const moduleUrl = new URL('../src/rl/environment.js', location.href);
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
    assert.equal(rl.actionCount, 2305, `${viewport.name}: prefixed RL module exposes 2305 actions`);
    assert.equal(rl.initialTick, 0);
    assert.equal(rl.firstTick, 1);
    assert.equal(rl.restoredTick, 1);
    assert.equal(rl.secondTick, 2);
    assert.equal(rl.firstTicksAdvanced, 1);
    assert.equal(rl.secondTicksAdvanced, 1);
    assert.ok(new URL(rl.moduleUrl).pathname.startsWith(`${prefix}/game/src/rl/`),
      `${viewport.name}: RL import stays beneath the Pages prefix`);

    await page.locator('[data-nav-to="home"]').click();
    await page.locator('.hero-actions [data-action="begin-battle"]').click();
    const arena = page.frameLocator('iframe.battle-frame').locator('[data-ui="arena"]');
    await arena.waitFor({ state: 'visible' });
    await page.frameLocator('iframe.battle-frame').locator('[data-ui="tower-pad"]').first().waitFor({ state: 'visible' });
    const arenaReceipt = await arena.evaluate(async (element) => {
      const backgroundImage = getComputedStyle(element).backgroundImage;
      const paths = ['./assets/moss-ember-arena-painted.webp',
        './assets/briar-runner-painted-sheet.png', './assets/briar-runner-sprite-sheet.svg'];
      const decoded = await Promise.all(paths.map(async (path) => {
        const url = new URL(path, location.href);
        const image = new Image();
        image.src = url.href;
        await image.decode();
        return { path, url: url.href, complete: image.complete,
          width: image.naturalWidth, height: image.naturalHeight };
      }));
      return {
        backgroundImage,
        arenaBounds: (() => { const box = element.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height }; })(),
        decoded,
      };
    });
    assert.ok(arenaReceipt.backgroundImage.includes('moss-ember-arena-painted.webp'),
      `${viewport.name}: original arena art is the actual computed arena background`);
    assert.ok(arenaReceipt.backgroundImage.includes(`${prefix}/game/public/assets/`) ||
      arenaReceipt.backgroundImage.includes('/game/public/assets/'),
      `${viewport.name}: arena background URL resolves under the Pages artifact`);
    for (const item of arenaReceipt.decoded) {
      assert.ok(item.complete && item.width > 0 && item.height > 0, `${viewport.name}: ${item.path} decodes`);
      assert.ok(new URL(item.url).pathname.startsWith(`${prefix}/game/public/assets/`),
        `${viewport.name}: ${item.path} resolves under the Pages prefix`);
    }
    screenshots.battle = join(evidence, `pages-v2-${viewport.name}-battle.png`);
    await page.screenshot({ path: screenshots.battle });
    assert.deepEqual(pageErrors, [], `${viewport.name}: no uncaught page errors`);
    assert.deepEqual(consoleErrors, [], `${viewport.name}: no console errors`);
    const requestsInManifest = assertManifestRequests(requests, {
      baseUrl,
      manifest: pagesManifest,
      prefix,
    });
    const requestPaths = new Set(requestsInManifest.map(({ path }) => path));
    for (const required of [
      'index.html', 'game/public/index.html', 'game/src/ui/app-shell.js',
      'game/src/rl/environment.js', 'game/public/ui-arena-shell.html',
      'game/src/ui/arena-shell-entry.js', 'game/src/ui/arena-shell.css',
      'game/public/assets/moss-ember-arena-painted.webp',
      'game/public/assets/briar-runner-painted-sheet.png',
      'game/public/assets/briar-runner-sprite-sheet.svg',
    ]) assert.ok(requestPaths.has(required), `${viewport.name}: actual browser requested ${required}`);
    viewportResults.push({
      viewport: { name: viewport.name, width: viewport.width, height: viewport.height, deviceScaleFactor: 1 },
      baseUrl,
      gameUrl,
      rootStatus: rootResponse.status(),
      renderedPortraits,
      rl,
      arena: arenaReceipt,
      requestCount: requestsInManifest.length,
      requests: requestsInManifest,
      pageErrors,
      consoleErrors,
      screenshots,
    });
    await context.close();
  }
  records.push({ browser: { browserPid, browserVersion: await browser.version(), viewportResults } });
}

let errorReceipt = null;
try {
  const { manifest, pageFiles } = await auditArtifact();
  await browserAudit(manifest, pageFiles);
} catch (error) {
  errorReceipt = String(error?.stack ?? error);
  records.push({ error: errorReceipt });
  throw error;
} finally {
  if (browser) {
    await browser.close().catch(() => {});
    browserClosed = !browser.isConnected();
  }
  if (server) {
    await new Promise((resolveClose, rejectClose) => server.close((error) =>
      error ? rejectClose(error) : resolveClose()));
    serverClosed = !server.listening;
  }
  const receipt = {
    schemaVersion: 1,
    candidate,
    sourceHead: candidate,
    results: records,
    error: errorReceipt,
    lifecycle: { browserPid, browserClosed, serverClosed },
  };
  await writeFile(join(evidence, 'pages-native-audit-v2.receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  if (browser && !browserClosed) throw new Error('native Chrome did not close cleanly');
  if (server && !serverClosed) throw new Error('Pages preview server did not close cleanly');
}
