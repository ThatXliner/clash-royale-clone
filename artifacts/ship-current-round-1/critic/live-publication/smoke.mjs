import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = "https://bryanhu.com/clash-royale-clone/";
const EXPECTED_REF = "8e24c1e44fc26827ffb7e7e5a50b4a4b933f045c";
const OUT = new URL("./", import.meta.url).pathname;
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync(OUT, { recursive: true });

const evidence = {
  base: BASE,
  expectedDeploymentRef: EXPECTED_REF,
  checks: {},
  requestFailures: [],
  badResponses: [],
  consoleErrors: [],
  pageErrors: [],
  browserRequests: [],
};
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  context.on("request", (request) => evidence.browserRequests.push(request.url()));
  context.on("requestfailed", (request) => evidence.requestFailures.push({
    url: request.url(), error: request.failure()?.errorText ?? "unknown",
  }));
  context.on("response", (response) => {
    if (response.status() >= 400) evidence.badResponses.push({
      url: response.url(), status: response.status(),
    });
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(String(error?.stack ?? error)));

  const landing = await page.goto(BASE, { waitUntil: "networkidle", timeout: 45_000 });
  assert.equal(landing?.status(), 200, "public HTTPS landing route returns 200");
  assert.equal(new URL(page.url()).protocol, "https:");
  assert.match(new URL(page.url()).pathname, /^\/clash-royale-clone\/?$/u);
  const sourceLink = await page.locator('a[href*="/src/rl/environment.js"]').getAttribute("href");
  assert.ok(sourceLink, "landing page exposes the RL source link");
  const sourceUrl = new URL(sourceLink);
  const refMatch = sourceUrl.pathname.match(/\/blob\/([^/]+)\/src\/rl\/environment\.js$/u);
  assert.ok(refMatch, `RL source link has a pinned Git ref: ${sourceLink}`);
  evidence.checks.landing = {
    status: landing.status(), finalUrl: page.url(), title: await page.title(),
    linkedSource: sourceLink, deployedRef: refMatch[1],
    refMatchesDeployment: refMatch[1] === EXPECTED_REF,
  };
  assert.equal(refMatch[1], EXPECTED_REF, "published source link points to the deployed SHA");
  await page.screenshot({ path: `${OUT}landing.png`, fullPage: true });

  const manifestUrl = `${BASE}game/release-manifest.json`;
  const manifestResponse = await context.request.get(manifestUrl, { timeout: 20_000 });
  assert.equal(manifestResponse.status(), 200, "published release manifest returns 200");
  const manifestBytes = await manifestResponse.body();
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const paths = manifest.files.map(({ path }) => path);
  const listedBytes = manifest.files.reduce((sum, file) => sum + file.size, 0);
  const forbiddenManifestPaths = paths.filter((path) =>
    /(^|\/)(reference|artifacts|\.git)(\/|$)/iu.test(path) ||
    /(^|\/)\.env(?:\.|$)/iu.test(path) || /(^|\/)private(?:\/|$)/iu.test(path));
  assert.equal(manifest.fileCount, paths.length);
  assert.equal(manifest.totalBytes, listedBytes);
  assert.deepEqual(forbiddenManifestPaths, [], "release manifest excludes reference/private paths");
  const rlFile = manifest.files.find(({ path }) => path === "src/rl/environment.js");
  assert.ok(rlFile, "release manifest lists the public RL module");
  const rlUrl = `${BASE}game/${rlFile.path}`;
  const rlResponse = await context.request.get(rlUrl, { timeout: 20_000 });
  assert.equal(rlResponse.status(), 200, "public RL module returns 200 beneath the Pages prefix");
  const rlBytes = await rlResponse.body();
  const rlHash = createHash("sha256").update(rlBytes).digest("hex");
  assert.equal(rlHash, rlFile.sha256, "deployed RL module matches its release manifest digest");
  evidence.checks.manifest = {
    url: manifestUrl,
    status: manifestResponse.status(),
    schemaVersion: manifest.schemaVersion,
    fileCount: manifest.fileCount,
    totalBytes: manifest.totalBytes,
    listedBytes,
    standaloneModules: manifest.standaloneModules,
    hasReferenceOrPrivatePaths: forbiddenManifestPaths.length !== 0,
    rlModule: { url: rlUrl, status: rlResponse.status(), bytes: rlBytes.length, sha256: rlHash },
  };

  await page.locator("a.primary-nav__play").click();
  await page.waitForURL((url) => url.pathname === "/clash-royale-clone/game/public/index.html", {
    timeout: 20_000,
  });
  await page.locator(".app-shell").waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
  await page.setViewportSize({ width: 720, height: 1280 });
  evidence.checks.gameRoute = {
    status: 200,
    finalUrl: page.url(),
    title: await page.title(),
    prefixPreserved: new URL(page.url()).pathname.startsWith("/clash-royale-clone/game/"),
  };
  await page.screenshot({ path: `${OUT}game-home.png`, fullPage: true });

  await page.locator('[data-nav-to="cards"]').click();
  const collection = await page.locator("[data-card-grid] [data-card-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.cardId));
  assert.equal(collection.length, 16, "live UI shows all 16 editable collection entries");
  await page.locator('[data-card-grid] [data-card-id="stonehauler"]').click();
  const detail = await page.locator("[data-card-detail]").evaluate((node) => ({
    text: node.innerText.trim(),
    lore: node.querySelector(".card-lore p")?.textContent.trim() ?? null,
    heading: node.querySelector("#selected-card-title")?.textContent.trim() ?? null,
  }));
  assert.equal(detail.heading, "Stonehauler");
  assert.ok(detail.lore && detail.lore.length > 20, "selected card includes its lore text");
  evidence.checks.collectionAndLore = { count: collection.length, ids: collection, selected: detail };
  await page.screenshot({ path: `${OUT}collection-stonehauler.png`, fullPage: true });

  await page.locator('.app-nav [data-nav-to="deck"]').click();
  const readDeck = () => page.locator("[data-deck-cards] [data-card-id]")
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.cardId));
  const defaultDeck = await readDeck();
  assert.equal(defaultDeck.length, 8);
  assert.equal(new Set(defaultDeck).size, 8);
  await page.locator('[data-replace-slot="1"]').click();
  await page.locator('[data-replacement-card-id="stonehauler"]').click();
  const editedDeck = await readDeck();
  assert.equal(editedDeck.length, 8);
  assert.equal(new Set(editedDeck).size, 8);
  assert.equal(editedDeck[1], "stonehauler");
  evidence.checks.deck = { defaultCount: defaultDeck.length, defaultDeck, editedCount: editedDeck.length, editedDeck };
  await page.screenshot({ path: `${OUT}deck-stonehauler.png`, fullPage: true });

  await page.locator('[data-nav-to="battle"]').click();
  await page.locator("[data-battle-frame-slot] iframe").waitFor({
    state: "attached", timeout: 20_000,
  });
  await page.waitForFunction(() => {
    const frame = document.querySelector("[data-battle-frame-slot] iframe");
    return frame?.contentWindow?.location?.pathname.endsWith("/game/public/ui-arena-shell.html");
  }, { timeout: 20_000 });
  const child = page.frames().find((frame) => {
    try {
      const url = new URL(frame.url());
      return url.pathname === "/clash-royale-clone/game/public/ui-arena-shell.html" &&
        url.searchParams.get("app-frame") === "1";
    } catch { return false; }
  });
  assert.ok(child, "Battle opened the same-origin packaged game iframe");
  await child.locator('[data-ui="arena"]').waitFor({ state: "visible", timeout: 20_000 });
  const controllerUrl = new URL("../src/ui/arena-shell-entry.js", child.url()).href;
  const initialBattle = await child.evaluate(async (moduleUrl) => {
    const { arenaHudController: controller } = await import(moduleUrl);
    globalThis.__publicShipController = controller;
    return {
      state: controller.state,
      deck: JSON.parse(controller.session.serialize()).setup.deck,
      hand: [...controller.session.state.decks.south.hand],
      tick: controller.state.sessionTick,
    };
  }, controllerUrl);
  assert.deepEqual(initialBattle.deck, editedDeck, "live Battle receives the selected eight-card deck");
  const battleCardId = "stonehauler";
  assert.ok(initialBattle.hand.includes(battleCardId), "replacement card is in the live opening hand");
  await page.screenshot({ path: `${OUT}battle-opening.png`, fullPage: true });

  await child.evaluate(() => {
    globalThis.__trustedPointerEvents = [];
    document.addEventListener("pointerup", (event) => {
      const ui = event.target?.closest?.("[data-ui]")?.dataset?.ui ?? null;
      globalThis.__trustedPointerEvents.push({ isTrusted: event.isTrusted, ui });
    }, true);
  });
  const cardSlot = child.locator('[data-ui="card-slot"][data-card-id="stonehauler"]');
  const cardBox = await cardSlot.boundingBox();
  assert.ok(cardBox, "Stonehauler has a visible physical hand slot");
  await page.mouse.click(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  assert.equal(await child.locator('[data-ui="hud-hand"] [data-card-id="stonehauler"]')
    .getAttribute("data-selected"), "true", "trusted Chrome click selects Stonehauler");
  const arenaBox = await child.locator('[data-ui="arena"]').boundingBox();
  assert.ok(arenaBox);
  await page.mouse.click(arenaBox.x + arenaBox.width / 2, arenaBox.y + arenaBox.height * 0.79);
  await child.waitForFunction(async (moduleUrl) => {
    const { arenaHudController: controller } = await import(moduleUrl);
    return controller.session.replay.some((event) => event.type === "session-deployed" &&
      event.side === "south" && event.deployment?.cardId === "stonehauler");
  }, controllerUrl, { timeout: 8_000 });
  await child.waitForFunction(async (moduleUrl) => {
    const { arenaHudController: controller } = await import(moduleUrl);
    return controller.session.replay.some((event) => event.type === "session-deployed" &&
      event.side === "north");
  }, controllerUrl, { timeout: 8_000 });
  const battleEvidence = await child.evaluate(async (moduleUrl) => {
    const { arenaHudController: controller } = await import(moduleUrl);
    const deployments = controller.session.replay.filter((event) => event.type === "session-deployed")
      .map((event) => ({ side: event.side, cardId: event.deployment?.cardId ?? null,
        point: event.deployment?.point ?? null, tick: event.tick ?? null }));
    return {
      tick: controller.state.sessionTick,
      deployments,
      trustedPointerEvents: globalThis.__trustedPointerEvents,
      selected: document.querySelector('[data-ui="hud-hand"] [data-card-id="stonehauler"]')
        ?.getAttribute("data-selected"),
    };
  }, controllerUrl);
  assert.ok(battleEvidence.trustedPointerEvents.some((event) => event.ui === "card-slot" && event.isTrusted));
  assert.ok(battleEvidence.trustedPointerEvents.some((event) => event.ui === "arena" && event.isTrusted));
  assert.ok(battleEvidence.deployments.some((event) => event.side === "south" &&
    event.cardId === battleCardId), "trusted UI input deployed the selected default card");
  assert.ok(battleEvidence.deployments.some((event) => event.side === "north"),
    "opponent AI made a public match deployment");
  evidence.checks.trustedBattle = { ...battleEvidence, controllerUrl, controllerModuleStatus: 200 };
  await page.screenshot({ path: `${OUT}battle-after-trusted-deploy.png`, fullPage: true });

  const rlModuleUrl = new URL("../src/rl/environment.js", page.url()).href;
  const rl = await page.evaluate(async (moduleUrl) => {
    const { RL_ACTION_COUNT, RL_ENVIRONMENT_VERSION, RLEnvironment,
      createRLEnvironment } = await import(moduleUrl);
    const options = { seed: 23, strideTicks: 30, horizonTicks: 120 };
    const environment = createRLEnvironment(options);
    const initial = environment.observe();
    const initialBytes = environment.serialize();
    const firstStep = environment.step(0);
    const checkpoint = environment.serialize();
    const expectedContinuation = environment.step(0);
    const expectedBytes = environment.serialize();
    const restored = RLEnvironment.restore(checkpoint);
    const restoredContinuation = restored.step(0);
    const restoreExact = restored.serialize() === expectedBytes &&
      JSON.stringify(restoredContinuation) === JSON.stringify(expectedContinuation);
    const resetObservation = environment.reset({ seed: 0 });
    const resetBytes = environment.serialize();
    const defaultZero = createRLEnvironment({ seed: 0, strideTicks: 30, horizonTicks: 120 })
      .serialize();
    return {
      moduleUrl,
      version: RL_ENVIRONMENT_VERSION,
      actionCount: RL_ACTION_COUNT,
      initial: { tick: initial.tick, status: initial.status, hand: initial.hand },
      firstStep: { from: initial.tick, to: firstStep.observation.tick,
        ticksAdvanced: firstStep.info.ticksAdvanced, status: firstStep.observation.status },
      restoredContinuation: { tick: restoredContinuation.observation.tick,
        restoreExact, bytesMatch: restored.serialize() === expectedBytes },
      reset: { tick: resetObservation.tick, status: resetObservation.status,
        exactSeedZeroOpening: resetBytes === defaultZero,
        openingBytes: initialBytes.length },
    };
  }, rlModuleUrl);
  assert.equal(rl.version, 1);
  assert.equal(rl.actionCount, 2305);
  assert.equal(rl.initial.tick, 0);
  assert.equal(rl.initial.status, "running");
  assert.equal(rl.initial.hand.length, 4);
  assert.equal(rl.firstStep.to, 30);
  assert.equal(rl.firstStep.ticksAdvanced, 30);
  assert.equal(rl.restoredContinuation.tick, 60);
  assert.equal(rl.restoredContinuation.restoreExact, true);
  assert.equal(rl.reset.tick, 0);
  assert.equal(rl.reset.exactSeedZeroOpening, true);
  evidence.checks.publicRL = rl;

  const isCloudflareTelemetry = (requestUrl) => {
    const url = new URL(requestUrl);
    return url.hostname === "static.cloudflareinsights.com" ||
      (url.hostname === "bryanhu.com" && url.pathname.startsWith("/cdn-cgi/rum"));
  };
  const telemetryFailures = evidence.requestFailures.filter(({ url }) => isCloudflareTelemetry(url));
  const appRequestFailures = evidence.requestFailures.filter(({ url }) => !isCloudflareTelemetry(url));
  const telemetryConsoleErrors = evidence.consoleErrors.filter((message) =>
    message.includes("static.cloudflareinsights.com"));
  const appConsoleErrors = evidence.consoleErrors.filter((message) =>
    !message.includes("static.cloudflareinsights.com"));
  const appBrowserRequests = evidence.browserRequests.filter((requestUrl) =>
    !isCloudflareTelemetry(requestUrl));
  const offOriginRequests = appBrowserRequests.filter((requestUrl) => {
    const url = new URL(requestUrl);
    return url.origin !== "https://bryanhu.com" ||
      !url.pathname.startsWith("/clash-royale-clone/");
  });
  const referenceRequests = appBrowserRequests.filter((requestUrl) =>
    /(^|\/)reference(\/|$)/iu.test(new URL(requestUrl).pathname));
  evidence.checks.isolation = {
    browserRequestCount: appBrowserRequests.length,
    offOriginOrOutOfPrefixRequests: offOriginRequests,
    referenceRequests,
    manifestReferencePrivatePaths: forbiddenManifestPaths,
    blockedCloudflareTelemetry: {
      requestFailures: telemetryFailures,
      consoleErrors: telemetryConsoleErrors,
    },
  };
  assert.deepEqual(offOriginRequests, [], "game browser resources stay at the prefixed public origin");
  assert.deepEqual(referenceRequests, [], "browser does not request the comparison reference tree");
  assert.deepEqual(appRequestFailures, [], "no first-party app resource request failed");
  assert.deepEqual(evidence.badResponses, []);
  assert.deepEqual(appConsoleErrors, [], "no first-party app console error occurred");
  assert.deepEqual(evidence.pageErrors, []);
  evidence.result = "PASS";
} catch (error) {
  evidence.result = "FAIL";
  evidence.failure = { name: error?.name ?? "Error", message: String(error?.message ?? error),
    stack: String(error?.stack ?? "") };
} finally {
  if (browser) await browser.close();
  writeFileSync(`${OUT}live-public-smoke.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  writeFileSync(`${OUT}browser-request-errors.json`, `${JSON.stringify({
    requestFailures: evidence.requestFailures,
    badResponses: evidence.badResponses,
    consoleErrors: evidence.consoleErrors,
    pageErrors: evidence.pageErrors,
  }, null, 2)}\n`);
  console.log(JSON.stringify({ result: evidence.result, checks: evidence.checks,
    failure: evidence.failure ?? null, requestFailures: evidence.requestFailures.length,
    badResponses: evidence.badResponses.length, consoleErrors: evidence.consoleErrors.length,
    pageErrors: evidence.pageErrors.length }, null, 2));
}
if (evidence.result !== "PASS") process.exitCode = 1;
