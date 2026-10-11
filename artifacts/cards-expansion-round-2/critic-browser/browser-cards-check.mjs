import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const root = process.env.CANDIDATE_ROOT;
const artifacts = process.env.CARDS_BROWSER_ARTIFACTS;
const playwrightPath = process.env.GAME_BROWSER_PLAYWRIGHT ?? "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const chromePath = process.env.GAME_BROWSER_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
assert.ok(root && artifacts);
await mkdir(artifacts, { recursive: true });
const { clientPointToArenaPoint } = await import(pathToFileURL(join(root, "src/ui/input-controller.js")));
const { evaluateDeployment } = await import(pathToFileURL(join(root, "src/sim/deployment.js")));
const { buildRelease } = await import(pathToFileURL(join(root, "scripts/build-release.js")));
const temp = await mkdtemp(join(tmpdir(), "cards-expansion-browser-"));
let server;
let browser;
try {
  const release = join(temp, "release");
  await buildRelease({ output: release });
  server = spawn(process.execPath, [join(root, "tests/game-browser-journey-server.js"), `--root=${release}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let line = "";
  for await (const chunk of server.stdout) {
    line += chunk;
    const newline = line.indexOf("\n");
    if (newline >= 0) { line = line.slice(0, newline); break; }
  }
  const address = JSON.parse(line);
  const origin = `http://${address.host}:${address.port}`;
  const controllerUrl = new URL("/src/ui/arena-shell-entry.js", origin).href;
  const { chromium } = await import(pathToFileURL(playwrightPath));
  browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 933 }, deviceScaleFactor: 1 });
  const failures = [];
  page.on("pageerror", (error) => failures.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
  await page.goto(`${origin}/public/index.html`, { waitUntil: "networkidle" });
  await page.locator('[data-nav-to="cards"]').click();

  const cards = {};
  for (const id of ["cinder-host", "ironroot"]) {
    await page.locator(`[data-card-grid] [data-card-id="${id}"]`).click();
    const detail = page.locator("[data-card-detail]");
    const title = await detail.locator("h2").innerText();
    const lore = await detail.locator(".card-lore p").innerText();
    const description = await detail.locator(".detail-description").innerText();
    const stats = await detail.locator(".unit-profile .stat-cell").evaluateAll((nodes) =>
      nodes.map((node) => [node.querySelector("span")?.textContent, node.querySelector("strong")?.textContent]));
    const portrait = await page.locator(`[data-card-grid] [data-card-id="${id}"] img`).evaluate((img) => ({
      alt: img.alt,
      decoded: img.complete && img.naturalWidth > 0,
      naturalSize: [img.naturalWidth, img.naturalHeight],
      src: new URL(img.currentSrc || img.src, document.baseURI).pathname,
    }));
    assert.ok(title.length > 0 && lore.length > 0, `${id} detail and lore render`);
    assert.ok(portrait.decoded && portrait.naturalSize[0] > 0, `${id} portrait decodes`);
    const name = id === "cinder-host" ? "cinder-host" : "ironroot";
    await page.screenshot({ path: join(artifacts, `${name}-detail-desktop-1440x933.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: join(artifacts, `${name}-detail-phone-390x844.png`), fullPage: true });
    cards[id] = { title, description, lore, stats, portrait };
    await page.setViewportSize({ width: 1440, height: 933 });
    await page.keyboard.press("Escape");
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.app-nav [data-nav-to="deck"]').click();
  const selectCard = async (slot, id) => {
    await page.locator(`[data-replace-slot="${slot}"]`).click();
    await page.locator(`[data-replacement-card-id="${id}"]`).click();
  };
  await selectCard(1, "cinder-host");
  await selectCard(2, "ironroot");
  const deckIds = await page.locator("[data-deck-cards] [data-card-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.cardId));
  assert.equal(deckIds.length, 8);
  assert.equal(new Set(deckIds).size, 8);
  assert.ok(deckIds.includes("cinder-host") && deckIds.includes("ironroot"));
  await page.screenshot({ path: join(artifacts, "editable-deck-cinder-host-ironroot-390x844.png"), fullPage: true });

  await page.setViewportSize({ width: 720, height: 1280 });
  await page.waitForTimeout(150);
  await page.locator('.app-nav [data-nav-to="battle"]').click();
  const frameLocator = page.frameLocator("[data-battle-frame-slot] iframe");
  await frameLocator.locator('[data-ui="arena"]').waitFor({ state: "visible", timeout: 8_000 });
  const child = page.frames().find((frame) => frame.url().includes("app-frame=1"));
  assert.ok(child);
  await child.waitForFunction(async ({ expected, moduleUrl }) => {
    const { arenaHudController } = await import(moduleUrl);
    return JSON.stringify(JSON.parse(arenaHudController.session.serialize()).setup.deck) === JSON.stringify(expected);
  }, { expected: deckIds, moduleUrl: controllerUrl }, { timeout: 8_000 });
  const launch = await child.evaluate(async (moduleUrl) => {
    const { arenaHudController } = await import(moduleUrl);
    arenaHudController.enterManualStepMode();
    arenaHudController.stepMany(1);
    return {
      hand: arenaHudController.session.state.decks.south.hand,
      setupDeck: JSON.parse(arenaHudController.session.serialize()).setup.deck,
      tick: arenaHudController.session.state.tick,
    };
  }, controllerUrl);
  assert.ok(launch.hand.includes("cinder-host") && launch.hand.includes("ironroot"));
  const preDeployEvidence = {
    browser: "Google Chrome headless via Playwright, production release build",
    viewports: [{ width: 1440, height: 933 }, { width: 390, height: 844 }, { width: 720, height: 1280 }],
    cards,
    selectableDeck: { ids: deckIds, handOnLaunch: launch.hand, setupDeck: launch.setupDeck },
  };
  await writeFile(join(artifacts, "cards-browser-evidence.json"), `${JSON.stringify(preDeployEvidence, null, 2)}\n`);

  const deploy = async (id, xFraction) => {
    const slot = frameLocator.locator(`[data-ui="card-slot"][data-card-id="${id}"]`);
    await slot.waitFor({ state: "visible" });
    await slot.click();
    assert.equal(await frameLocator.locator(`[data-ui="hud-hand"] [data-card-id="${id}"]`).getAttribute("data-selected"), "true");
    await child.evaluate(() => {
      globalThis.__cardsCriticPointers = [];
      document.querySelector('[data-ui="arena"]').addEventListener("pointerup", (event) => {
        globalThis.__cardsCriticPointers.push({ trusted: event.isTrusted, x: event.clientX, y: event.clientY });
      }, true);
    });
    const arenaLocator = frameLocator.locator('[data-ui="arena"]');
    const arena = await arenaLocator.boundingBox();
    assert.ok(arena);
    const pointerPoint = {
      x: arena.width * xFraction,
      y: arena.height * 0.79,
    };
    await arenaLocator.click({ position: pointerPoint });
    await child.evaluate(async (moduleUrl) => {
      const { arenaHudController } = await import(moduleUrl);
      arenaHudController.stepMany(1);
    }, controllerUrl);
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const event = await child.evaluate(async ({ moduleUrl, cardId }) => {
        const { arenaHudController } = await import(moduleUrl);
        return arenaHudController.session.replay.find(({ side, type, deployment }) =>
          side === "south" && type === "session-deployed" && deployment.cardId === cardId) ?? null;
      }, { moduleUrl: controllerUrl, cardId: id });
      if (event) return event;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const diagnostics = await child.evaluate(async ({ moduleUrl, pointerPoint }) => {
      const { arenaHudController } = await import(moduleUrl);
      return {
        input: arenaHudController.input,
        pointers: globalThis.__cardsCriticPointers,
        pointerPoint,
        hand: arenaHudController.session.state.decks.south.hand,
        elixir: arenaHudController.session.state.elixir.sides.south.amount,
        tick: arenaHudController.session.state.tick,
        lastEvents: arenaHudController.session.replay.slice(-8),
        feedback: arenaHudController.placementFeedback,
        arena: document.querySelector('[data-ui="arena"]').getBoundingClientRect().toJSON(),
      };
    }, { moduleUrl: controllerUrl, pointerPoint });
    const trustedPointer = diagnostics.pointers?.at(-1) ?? null;
    const worldPoint = trustedPointer === null ? null : clientPointToArenaPoint({
      left: diagnostics.arena.left,
      top: diagnostics.arena.top,
      width: diagnostics.arena.width,
      height: diagnostics.arena.height,
    }, { clientX: trustedPointer.x, clientY: trustedPointer.y });
    const deployDecision = worldPoint === null ? null : evaluateDeployment({
      destroyedOpposingLaneTowers: [],
      placementClass: "ground_entity",
      point: worldPoint,
      side: "south",
    });
    await writeFile(join(artifacts, "cards-browser-evidence.json"), `${JSON.stringify({
      ...preDeployEvidence,
      deploymentAttempt: {
        cardId: id,
        selectedInHand: diagnostics.hand.includes(id),
        elixir: diagnostics.elixir,
        hand: diagnostics.hand,
        trustedPointer,
        arenaLocalPointer: pointerPoint,
        worldPoint,
        eligibility: deployDecision,
        lastSessionEvents: diagnostics.lastEvents,
        browserErrors: failures,
        sessionDeploymentEvent: null,
        screenshot: `${id}-deployment-rejected.png`,
      },
      result: "failed: trusted legal deployment did not reach GameSession",
    }, null, 2)}\n`);
    await page.screenshot({ path: join(artifacts, `${id}-deployment-rejected.png`) });
    throw new Error(`${id} trusted browser deployment did not reach GameSession: ${JSON.stringify(diagnostics)}`);
  };
  const cinderDeployment = await deploy("cinder-host", 0.36);
  const ironrootDeployment = await deploy("ironroot", 0.64);
  assert.equal(cinderDeployment.deployment.entityIds.length, 15);
  assert.equal(ironrootDeployment.deployment.entityIds.length, 1);
  assert.ok(cinderDeployment.deployment.point.y < 15_000 && ironrootDeployment.deployment.point.y < 15_000);
  const restored = await child.evaluate(async (moduleUrl) => {
    const { arenaHudController } = await import(moduleUrl);
    const checkpoint = arenaHudController.serialize();
    arenaHudController.restore(checkpoint);
    return { checkpoint, exact: arenaHudController.serialize() === checkpoint };
  }, controllerUrl);
  assert.equal(restored.exact, true);
  await page.screenshot({ path: join(artifacts, "live-battle-cinder-host-ironroot-deployed-720x1280.png") });
  assert.deepEqual(failures, []);
  const evidence = {
    browser: "Google Chrome headless via Playwright, production release build",
    viewports: [{ width: 1440, height: 933 }, { width: 390, height: 844 }],
    cards,
    selectableDeck: { ids: deckIds, handOnLaunch: launch.hand, setupDeck: launch.setupDeck },
    trustedDeployments: {
      cinderHost: { cardId: cinderDeployment.deployment.cardId, entityIds: cinderDeployment.deployment.entityIds, point: cinderDeployment.deployment.point, cost: cinderDeployment.spend.cost },
      ironroot: { cardId: ironrootDeployment.deployment.cardId, entityIds: ironrootDeployment.deployment.entityIds, point: ironrootDeployment.deployment.point, cost: ironrootDeployment.spend.cost },
      exactSnapshotRestore: restored.exact,
    },
    consoleErrors: failures,
    result: "passed",
  };
  await writeFile(join(artifacts, "cards-browser-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  if (browser) await browser.close();
  if (server) { server.kill("SIGTERM"); await once(server, "exit").catch(() => {}); }
  await rm(temp, { recursive: true, force: true });
}
