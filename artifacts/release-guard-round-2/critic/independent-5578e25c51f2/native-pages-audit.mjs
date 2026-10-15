import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { lstat, readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const checkout = "/private/tmp/release-guard-round2-critic-5578e25c51f2";
const evidenceRoot = "/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/release-guard-round-2/critic/independent-5578e25c51f2";
const outputRoot = join(evidenceRoot, "generated/full-pages-candidate");
const gameRoot = join(outputRoot, "game");
const generated = join(evidenceRoot, "generated/native-pages-audit-v7");
const prefix = "/clash-royale-clone";
await mkdir(generated, { recursive: true });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
function invariant(value, message) { assert.ok(value, message); }

async function walk(root, rel = "") {
  const out = [];
  for (const entry of await readdir(join(root, rel), { withFileTypes: true })) {
    const path = rel ? join(rel, entry.name) : entry.name;
    const absolute = join(root, path);
    const info = await lstat(absolute);
    invariant(!info.isSymbolicLink(), "symlink in emitted Pages tree: " + path);
    if (info.isDirectory()) out.push(...await walk(root, path));
    else {
      invariant(info.isFile(), "non-file entry in emitted Pages tree: " + path);
      const bytes = await readFile(absolute);
      out.push({ path: path.split(sep).join("/"), size: bytes.length, sha256: sha256(bytes), bytes });
    }
  }
  return out;
}

const releaseManifestBytes = await readFile(join(gameRoot, "release-manifest.json"));
const releaseManifest = JSON.parse(releaseManifestBytes.toString("utf8"));
assert.equal(releaseManifest.schemaVersion, 1);
assert.equal(releaseManifest.fileCount, releaseManifest.files.length);
assert.ok(releaseManifest.fileCount <= 128);
assert.ok(releaseManifest.totalBytes <= 8 * 1024 * 1024);
assert.ok(releaseManifest.files.every((file) => file.size <= 1024 * 1024),
  "release manifest contains a file above the 1 MiB per-file cap");
const releaseByPath = new Map(releaseManifest.files.map((file) => [file.path, file]));
for (const file of releaseManifest.files) {
  const bytes = await readFile(join(gameRoot, ...file.path.split("/")));
  assert.equal(bytes.length, file.size, "emitted release size mismatch: " + file.path);
  assert.equal(sha256(bytes), file.sha256, "emitted release SHA-256 mismatch: " + file.path);
}
const { assertReleaseFilesIsolated } =
  await import(pathToFileURL(join(checkout, "scripts/release-isolation-guard.js")).href);
const pageFiles = await walk(outputRoot);
assert.equal(pageFiles.length, 64, "actual Pages file count");
const pagesBytes = pageFiles.reduce((sum, file) => sum + file.size, 0);
assert.ok(pagesBytes <= 8 * 1024 * 1024, "actual Pages output exceeds 8 MiB");
const pagesByPath = new Map(pageFiles.map(({ path, size, sha256 }) => [path, { path, size, sha256 }]));
const actualGameReleasePaths = pageFiles.map(({ path }) => path)
  .filter((path) => path.startsWith("game/") &&
    path !== "game/release-manifest.json" && path !== "game/index.html")
  .map((path) => path.slice("game/".length)).sort();
assert.deepEqual(actualGameReleasePaths, releaseManifest.files.map(({ path }) => path).sort(),
  "actual Pages game tree differs from release manifest beyond the known Pages redirect wrapper");
const releaseIsolation = await assertReleaseFilesIsolated({
  files: new Map(await Promise.all(releaseManifest.files.map(async ({ path }) =>
    [path, await readFile(join(gameRoot, ...path.split("/")))]))),
  referenceRoot: checkout,
});
await assertReleaseFilesIsolated({
  files: new Map(pageFiles.map(({ path, bytes }) => [path, bytes])),
  referenceRoot: checkout,
});
const pagesInventory = {
  outputRoot,
  pageFileCount: pageFiles.length,
  pageBytes: pagesBytes,
  pageMaxFileBytes: Math.max(...pageFiles.map((file) => file.size)),
  releaseFileCount: releaseManifest.fileCount,
  releaseBytes: releaseManifest.totalBytes,
  releaseMaxFileBytes: Math.max(...releaseManifest.files.map((file) => file.size)),
  releaseManifestSha256: sha256(releaseManifestBytes),
  releaseIsolation,
  releaseFiles: releaseManifest.files.map(({ path, size, sha256 }) => ({ path, size, sha256 })),
  pagesFiles: pageFiles.map(({ path, size, sha256 }) => ({ path, size, sha256 })),
};
await writeFile(join(generated, "emitted-pages-inventory.json"), JSON.stringify(pagesInventory, null, 2) + "\n");

const { createPagesPreviewServer } = await import(pathToFileURL(join(checkout, "scripts/preview-pages.js")).href);
const { server } = await createPagesPreviewServer({ root: outputRoot, basePath: prefix + "/", logRequests: false });
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
const origin = "http://127.0.0.1:" + address.port;
const baseUrl = origin + prefix + "/";
const prefixResponse = await fetch(baseUrl);
const prefixBytes = Buffer.from(await prefixResponse.arrayBuffer());
const emittedIndexBytes = await readFile(join(outputRoot, "index.html"));
assert.equal(prefixResponse.status, 200, "Pages prefix did not return 200");
assert.deepEqual(prefixBytes, emittedIndexBytes, "Pages prefix body differs from emitted index.html");
const prefixReceipt = {
  url: baseUrl,
  status: prefixResponse.status,
  contentLength: prefixBytes.length,
  responseSha256: sha256(prefixBytes),
  emittedIndexBytes: emittedIndexBytes.length,
  emittedIndexSha256: sha256(emittedIndexBytes),
  bodyEqual: prefixBytes.equals(emittedIndexBytes),
};
await writeFile(join(generated, "prefix-response.json"), JSON.stringify(prefixReceipt, null, 2) + "\n");

const configuredPlaywright = process.env.GAME_BROWSER_PLAYWRIGHT;
assert.ok(configuredPlaywright, "pinned Playwright path missing");
const { chromium } = await import(pathToFileURL(configuredPlaywright).href);
const browser = await chromium.launch({
  executablePath: process.env.GAME_BROWSER_CHROME,
  headless: true,
});
const context = await browser.newContext({ deviceScaleFactor: 1 });
const requests = [];
const requestIndex = new WeakMap();
const browserErrors = [];
function attachPage(page) {
  page.on("pageerror", (error) => browserErrors.push({ type: "pageerror", message: String(error) }));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push({ type: "console", message: message.text() });
  });
  page.on("crash", () => browserErrors.push({ type: "crash", message: page.url() }));
}
context.on("page", attachPage);
context.on("request", (request) => {
  const row = { method: request.method(), url: request.url(), resourceType: request.resourceType(), status: null, failure: null };
  requests.push(row);
  requestIndex.set(request, row);
});
context.on("response", (response) => {
  const row = requestIndex.get(response.request());
  if (row) row.status = response.status();
});
context.on("requestfailed", (request) => {
  const row = requestIndex.get(request);
  if (row) row.failure = request.failure()?.errorText ?? "request failed";
});

const portraitModule = await import(pathToFileURL(join(checkout, "src/ui/card-portrait-art.js")).href);
const expectedPortraitIds = portraitModule.getCardPortraitIds();
assert.equal(expectedPortraitIds.length, 21, "registered portrait mappings count");
const visualModule = await import(pathToFileURL(join(checkout, "src/content/visual-asset-manifest.js")).href);
const visualManifest = visualModule.createVisualAssetManifest();
const registeredVisuals = ["moss-ember-arena-painted", "briar-runner-painted-sheet", "briar-runner-sprite-sheet"]
  .map((id) => visualManifest.assets.find((asset) => asset.id === id));
assert.ok(registeredVisuals.every(Boolean), "registered arena and Briar art entries are missing");
const registeredVisualReceipts = [];
for (const asset of registeredVisuals) {
  const path = "public/" + asset.path;
  const emitted = releaseByPath.get(path);
  assert.ok(emitted, "registered visual asset missing from emitted release manifest: " + path);
  assert.equal(emitted.size, asset.byteLength, "registered visual asset size differs from release manifest: " + path);
  assert.equal(emitted.sha256, asset.sha256, "registered visual asset hash differs from release manifest: " + path);
  registeredVisualReceipts.push({ id: asset.id, path, bytes: emitted.size, sha256: emitted.sha256 });
}
const standaloneController = releaseManifest.standaloneModules.find((path) => path === "src/ui/arena-shell-entry.js");
const standaloneRl = releaseManifest.standaloneModules.find((path) => path === "src/rl/environment.js");
assert.ok(standaloneController && standaloneRl, "actual emitted release manifest lacks standalone modules");

const DISPLAY_DECK = ["skymaul", "brassbolt", "reedsting", "briar-band", "cinderlings", "coilblade", "mossguard", "copperskiff"];
const viewportAudit = [];
const screenshots = [];
async function capture(page, name, fullPage = false) {
  const path = join(generated, name + ".png");
  const bytes = await page.screenshot({ path, fullPage });
  const record = { path, bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), sha256: sha256(bytes) };
  screenshots.push(record);
  return record;
}
async function decodeImageUrls(frame, items) {
  return await frame.evaluate(async (records) => {
    const out = [];
    for (const record of records) {
      const image = new Image();
      image.src = record.url;
      await image.decode();
      out.push({
        id: record.id,
        src: image.currentSrc,
        path: new URL(image.currentSrc).pathname,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      });
    }
    return out;
  }, items);
}

try {
  for (const viewport of [
    { name: "phone", width: 390, height: 844 },
    { name: "desktop", width: 1440, height: 933 },
  ]) {
    const page = await context.newPage();
    attachPage(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const landingResponse = await page.goto(baseUrl, { waitUntil: "networkidle" });
    assert.equal(landingResponse.status(), 200, viewport.name + " landing HTTP");
    await page.locator(".primary-nav__play").waitFor({ state: "visible" });
    const landingScreen = await capture(page, viewport.name + "-landing");

    const gameNavigation = Promise.all([
      page.waitForNavigation({ waitUntil: "load" }),
      page.locator(".primary-nav__play").click(),
    ]).then(([response]) => response);
    const gameResponse = await gameNavigation;
    assert.equal(gameResponse.status(), 200, viewport.name + " Pages game CTA HTTP");
    assert.equal(new URL(page.url()).pathname, prefix + "/game/public/index.html",
      viewport.name + " CTA target");
    await page.locator('[data-nav-to="home"]').waitFor({ state: "visible" });
    const gameHomeScreen = await capture(page, viewport.name + "-game-home");

    await page.locator('[data-nav-to="cards"]').click();
    await page.locator("[data-card-grid] [data-card-id]").first().waitFor({ state: "visible" });
    const cards = await page.locator("[data-card-grid] [data-card-id]").evaluateAll(async (nodes) => {
      const images = nodes.map((node) => node.querySelector(".card-art-image"));
      await Promise.all(images.map((image) => image.decode()));
      return nodes.map((node, index) => {
        const image = images[index];
        const box = image.closest(".card-art-window").getBoundingClientRect();
        return {
          cardId: node.dataset.cardId,
          cell: image.dataset.portraitCell ?? null,
          src: image.currentSrc,
          path: new URL(image.currentSrc).pathname,
          decoded: image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
          naturalSize: [image.naturalWidth, image.naturalHeight],
          window: { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom },
        };
      });
    });
    assert.equal(new Set(cards.map(({ cardId }) => cardId)).size, 21,
      viewport.name + " collection does not contain 21 distinct cards");
    assert.deepEqual([...cards.map(({ cardId }) => cardId)].sort(), [...expectedPortraitIds].sort(),
      viewport.name + " complete portrait mapping set");
    for (const card of cards) {
      const expected = portraitModule.getCardPortrait(card.cardId);
      assert.equal(card.cell, expected.cell === null ? null : String(expected.cell),
        viewport.name + " atlas cell mapping for " + card.cardId);
      assert.ok(card.decoded && card.naturalSize[0] > 0 && card.naturalSize[1] > 0,
        viewport.name + " portrait decode failed for " + card.cardId);
      const fileName = new URL(expected.src).pathname.split("/").pop();
      assert.ok(card.path.endsWith("/game/public/assets/" + fileName),
        viewport.name + " portrait URL differs from registered production asset: " + card.cardId);
      const releasePath = "public/assets/" + fileName;
      assert.ok(releaseByPath.has(releasePath), viewport.name + " portrait asset missing from manifest: " + releasePath);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width,
      viewport.name + " Cards view horizontal overflow");
    const cardsScreen = await capture(page, viewport.name + "-cards");
    const cardsFullScreen = await capture(page, viewport.name + "-cards-full", true);

    await page.locator('[data-nav-to="battle"]').click();
    const appBattleFrame = page.locator("[data-battle-frame-slot] iframe");
    await appBattleFrame.waitFor({ state: "attached" });
    await page.frameLocator("[data-battle-frame-slot] iframe").locator('[data-ui="arena"]').waitFor({ state: "visible", timeout: 15000 });
    const battleFrame = page.frames().find((frame) => {
      try { return new URL(frame.url()).pathname.endsWith("/game/public/ui-arena-shell.html"); }
      catch { return false; }
    });
    assert.ok(battleFrame, viewport.name + " actual packaged battle iframe missing");
    const actualEntryUrl = await battleFrame.evaluate(() => {
      const script = [...document.scripts].find((node) => node.type === "module" && node.src);
      return script?.src ?? null;
    });
    assert.ok(actualEntryUrl, viewport.name + " iframe HTML module import URL missing");
    const actualHtmlModulePath = new URL(actualEntryUrl).pathname;
    const gameMountPrefix = prefix + "/game/";
    assert.ok(actualHtmlModulePath.startsWith(gameMountPrefix),
      viewport.name + " iframe HTML module URL escaped emitted game mount");
    const actualHtmlModuleRelativePath = actualHtmlModulePath.slice(gameMountPrefix.length);
    assert.ok(releaseByPath.has(actualHtmlModuleRelativePath),
      viewport.name + " actual iframe HTML import is absent from emitted release manifest");
    const controllerModuleUrl = new URL("game/" + standaloneController, baseUrl).href;
    assert.ok(releaseByPath.has(standaloneController),
      viewport.name + " standalone controller import is absent from emitted release manifest");
    const arenaUrl = await battleFrame.locator('[data-ui="arena"]').evaluate((arena) => {
      const match = getComputedStyle(arena).backgroundImage.match(/url\(["']?(.*?)["']?\)/u);
      return match?.[1] ? new URL(match[1], document.baseURI).href : null;
    });
    assert.ok(arenaUrl, viewport.name + " live arena CSS background URL missing");
    const arenaPath = new URL(arenaUrl).pathname;
    const registeredArena = registeredVisuals.find(({ id }) => id === "moss-ember-arena-painted");
    assert.equal(arenaPath, prefix + "/game/public/" + registeredArena.path,
      viewport.name + " live arena background differs from registered asset path");
    const arenaDecode = (await decodeImageUrls(battleFrame, [{ id: registeredArena.id, url: arenaUrl }]))[0];
    assert.ok(arenaDecode.complete && arenaDecode.naturalWidth > 0 && arenaDecode.naturalHeight > 0,
      viewport.name + " registered arena art did not decode");
    const beforeBattleScreen = await capture(page, viewport.name + "-battle");

    const controller = await battleFrame.evaluate(async ({ entryUrl, displayDeck }) => {
      const imported = await import(entryUrl);
      const controller = imported.arenaHudController;
      if (controller === null || typeof controller !== "object") throw new Error("packaged controller import missing");
      globalThis.__criticPackagedController = controller;
      const before = controller.state;
      const wasRunning = !before.paused;
      if (wasRunning) controller.pause();
      controller.replaceDeck(displayDeck);
      const deck = JSON.parse(controller.session.serialize()).setup.deck;
      const resumed = controller.state.paused ? controller.resume() : false;
      const enteredManualStep = controller.enterManualStepMode();
      const initialTick = controller.state.sessionTick;
      const checkpoint = controller.serialize();
      const stepEvents = controller.stepMany(1);
      const stepTick = controller.state.sessionTick;
      const restoreState = controller.restore(checkpoint);
      const restoredTick = controller.state.sessionTick;
      const restoredExactly = controller.serialize() === checkpoint;
      return {
        attachedArena: document.querySelector('[data-ui="arena"]')?.isConnected === true,
        exports: Object.keys(imported).sort(),
        hasControllerApi: ["enterManualStepMode", "serialize", "stepMany", "restore", "replaceDeck"]
          .every((name) => typeof controller[name] === "function"),
        tickIsNumeric: Number.isSafeInteger(controller.state.sessionTick),
        deck,
        wasRunning,
        resumed,
        enteredManualStep,
        initialTick,
        stepEventCount: stepEvents.length,
        stepTick,
        restoredTick,
        restoredExactly,
        restoreState,
        status: controller.state,
      };
    }, { entryUrl: controllerModuleUrl, displayDeck: DISPLAY_DECK });
    assert.ok(controller.hasControllerApi && controller.attachedArena && controller.tickIsNumeric,
      viewport.name + " real packaged controller API/state");
    assert.deepEqual(controller.deck, DISPLAY_DECK, viewport.name + " packaged deck replacement");
    assert.ok(controller.enteredManualStep, viewport.name + " packaged controller did not enter manual step mode");
    assert.equal(controller.stepTick, controller.initialTick + 1, viewport.name + " packaged controller step");
    assert.equal(controller.restoredTick, controller.initialTick, viewport.name + " packaged controller restore tick");
    assert.ok(controller.restoredExactly, viewport.name + " packaged controller snapshot restore equality");

    const slotCards = await battleFrame.locator('[data-ui="card-slot"]').evaluateAll((slots) =>
      slots.map((slot) => slot.dataset.cardId ?? slot.querySelector("[data-card-id]")?.dataset.cardId ?? null));
    assert.equal(slotCards.length, 4, viewport.name + " actual game hand slot count");
    const briarSlotIndex = slotCards.indexOf("briar-band");
    assert.ok(briarSlotIndex >= 0, viewport.name + " actual game hand does not contain the selected Briar card");
    await battleFrame.locator('[data-ui="card-slot"]').nth(briarSlotIndex).click();
    const arenaSize = await battleFrame.locator('[data-ui="arena"]').evaluate((arena) =>
      ({ width: arena.clientWidth, height: arena.clientHeight }));
    assert.ok(arenaSize.width > 0 && arenaSize.height > 0, viewport.name + " arena bounds");
    await battleFrame.locator('[data-ui="arena"]').click({
      position: { x: Math.round(arenaSize.width * 0.5), y: Math.round(arenaSize.height * 0.78) },
    });
    await battleFrame.locator('.combat-marker[data-kind="briar-runner"]').first().waitFor({ state: "attached", timeout: 10000 });
    const briarMarkers = await battleFrame.locator('.combat-marker[data-kind="briar-runner"]').evaluateAll((markers) =>
      markers.map((marker) => {
        const art = marker.querySelector(".combat-art");
        const image = art?.querySelector("image");
        return {
          kind: marker.dataset.kind,
          artId: art?.dataset.artId ?? null,
          spriteAction: art?.dataset.spriteAction ?? null,
          href: image?.getAttribute("href") ?? image?.getAttribute("xlink:href") ?? null,
          visible: marker.getBoundingClientRect().width > 0 && marker.getBoundingClientRect().height > 0,
        };
      }));
    assert.ok(briarMarkers.length > 0, viewport.name + " actual Briar deployment did not render");
    assert.ok(briarMarkers.every((marker) => marker.visible && marker.artId === "briar-runner" && marker.href),
      viewport.name + " Briar sprite markers did not render real registered art");
    const registeredPng = registeredVisuals.find(({ id }) => id === "briar-runner-painted-sheet");
    const registeredSvg = registeredVisuals.find(({ id }) => id === "briar-runner-sprite-sheet");
    const liveBriarPath = new URL(briarMarkers[0].href, battleFrame.url()).pathname;
    assert.equal(liveBriarPath, prefix + "/game/public/" + registeredPng.path,
      viewport.name + " live Briar marker does not use registered painted sprite");
    const briarDecode = await decodeImageUrls(battleFrame, [
      { id: registeredPng.id, url: origin + prefix + "/game/public/" + registeredPng.path },
      { id: registeredSvg.id, url: origin + prefix + "/game/public/" + registeredSvg.path },
    ]);
    assert.ok(briarDecode.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0),
      viewport.name + " registered Briar sprites did not decode");
    const afterBattleScreen = await capture(page, viewport.name + "-battle-briar");

    const rlUrl = new URL("game/" + standaloneRl, baseUrl).href;
    const rl = await page.evaluate(async (moduleUrl) => {
      const module = await import(moduleUrl);
      const environment = module.createRLEnvironment({ horizonTicks: 3, seed: 319, strideTicks: 1 });
      const initial = environment.observe();
      const reset = environment.reset();
      const stepped = environment.step(0);
      const serialized = environment.serialize();
      const restored = module.RLEnvironment.restore(serialized);
      const restoredObservation = restored.observe();
      return {
        moduleUrl,
        exports: Object.keys(module).sort(),
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
    }, rlUrl);
    assert.equal(new URL(rl.moduleUrl).pathname, prefix + "/game/" + standaloneRl,
      viewport.name + " RL module URL");
    assert.equal(rl.initialTick, 0);
    assert.equal(rl.resetTick, 0);
    assert.equal(rl.stepTick, 1);
    assert.equal(rl.stepStatus, "running");
    assert.equal(rl.terminated, false);
    assert.equal(rl.truncated, false);
    assert.equal(rl.restoredTick, 1);
    assert.equal(rl.restoredMatches, true);
    assert.ok(rl.serializedBytes > 0);

    viewportAudit.push({
      viewport: { width: viewport.width, height: viewport.height },
      landing: landingScreen,
      gameHome: gameHomeScreen,
      cards: cardsScreen,
      cardsFull: cardsFullScreen,
      battle: beforeBattleScreen,
      battleAfterBriarDeployment: afterBattleScreen,
      portraitCount: cards.length,
      portraitAssets: [...new Set(cards.map((card) => card.path))].sort(),
      portraits: cards,
      arenaDecode,
      arenaUrl,
      htmlModuleUrl: actualEntryUrl,
      controllerModuleUrl,
      packagedController: controller,
      slotCards,
      briarMarkers,
      briarDecode,
      rl,
    });
    await page.close();
  }

  const auditedRequests = [];
  for (const record of requests) {
    const url = new URL(record.url);
    assert.equal(url.origin, origin, "browser attempted off-origin fetch: " + record.url);
    let path = decodeURIComponent(url.pathname);
    assert.ok(path === prefix || path.startsWith(prefix + "/"),
      "browser request escaped Pages prefix: " + path);
    path = path.slice(prefix.length).replace(/^\/+/, "");
    if (path === "") path = "index.html";
    else if (path.endsWith("/")) path += "index.html";
    let scope = "pages";
    let emittedPath = path;
    if (path.startsWith("game/")) {
      scope = "release";
      emittedPath = path.slice("game/".length);
      assert.ok(releaseByPath.has(emittedPath),
        "browser requested a path absent from actual release manifest: " + emittedPath);
    } else {
      assert.ok(pagesByPath.has(emittedPath),
        "browser requested a path absent from actual Pages output: " + emittedPath);
    }
    assert.equal(record.failure, null, "browser request failed: " + record.url + " " + record.failure);
    assert.equal(record.status, 200, "browser request returned " + record.status + ": " + record.url);
    auditedRequests.push({
      method: record.method,
      path: emittedPath,
      scope,
      resourceType: record.resourceType,
      status: record.status,
    });
  }
  assert.equal(browserErrors.length, 0, "native Pages browser errors: " + JSON.stringify(browserErrors));
  const browserReceipt = {
    candidate: "46c542a10df358902fa1147e6d2b7ad04ea80d57",
    chrome: "Google Chrome 155.0.8059.40",
    browserRequests: auditedRequests,
    browserRequestCount: auditedRequests.length,
    uniqueRequestedPaths: [...new Set(auditedRequests.map((record) => record.scope + ":" + record.path))].sort(),
    browserErrors,
    prefixResponse: prefixReceipt,
    registeredVisualAssets: registeredVisualReceipts,
    viewports: viewportAudit,
    screenshots,
  };
  await writeFile(join(generated, "native-pages-audit.json"), JSON.stringify(browserReceipt, null, 2) + "\n");
  process.stdout.write(JSON.stringify({
    candidate: browserReceipt.candidate,
    chrome: browserReceipt.chrome,
    pageFileCount: pageFiles.length,
    pageBytes: pagesBytes,
    releaseFileCount: releaseManifest.fileCount,
    releaseBytes: releaseManifest.totalBytes,
    prefixStatus: prefixReceipt.status,
    prefixExactIndexBody: prefixReceipt.bodyEqual,
    viewports: viewportAudit.map((item) => ({
      viewport: item.viewport,
      portraitCount: item.portraitCount,
      arenaDecode: item.arenaDecode,
      briarMarkers: item.briarMarkers.length,
      controller: {
        initialTick: item.packagedController.initialTick,
        stepTick: item.packagedController.stepTick,
        restoredTick: item.packagedController.restoredTick,
        restoredExactly: item.packagedController.restoredExactly,
      },
      rl: {
        resetTick: item.rl.resetTick,
        stepTick: item.rl.stepTick,
        restoredTick: item.rl.restoredTick,
        restoredMatches: item.rl.restoredMatches,
      },
    })),
    browserRequestCount: auditedRequests.length,
    uniqueRequestedPathCount: browserReceipt.uniqueRequestedPaths.length,
    browserErrors: browserErrors.length,
    screenshots: screenshots.map(({ path, bytes, width, height, sha256 }) => ({ path, bytes, width, height, sha256 })),
  }) + "\n");
} catch (error) {
  await writeFile(join(generated, "native-pages-audit-failure.json"), JSON.stringify({
    candidate: "46c542a10df358902fa1147e6d2b7ad04ea80d57",
    error: { name: error?.name ?? "Error", message: error?.message ?? String(error), stack: error?.stack ?? null },
    requests: requests.map((record) => ({ ...record })),
    browserErrors,
    completedViewports: viewportAudit,
    screenshots,
  }, null, 2) + "\n");
  throw error;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await new Promise((resolveClose) => server.close(() => resolveClose()));
}

