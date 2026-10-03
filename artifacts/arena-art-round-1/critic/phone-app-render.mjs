import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = "/tmp/painted-arena-critic-5c81b55";
const output = join(root, "artifacts/arena-art-round-1/critic");
const serverPath = join(root, "tests/game-browser-journey-server.js");
const playwrightPath = process.env.GAME_BROWSER_PLAYWRIGHT;
const chromePath = process.env.GAME_BROWSER_CHROME;
assert.ok(playwrightPath && chromePath);
mkdirSync(output, { recursive: true });

const server = spawn(process.execPath, [serverPath, `--root=${root}`], {
  stdio: ["ignore", "pipe", "pipe"],
});
let browser;
const errors = [];
const requests = [];
async function readReadyLine(stream) {
  let value = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    value += chunk;
    const index = value.indexOf("\n");
    if (index >= 0) return JSON.parse(value.slice(0, index));
  }
  throw new Error("frozen source server exited before readiness");
}
async function clickPoint(page, locator, offset) {
  const bounds = await locator.boundingBox();
  assert.ok(bounds && bounds.width > 0 && bounds.height > 0, "click target has a visible box");
  await page.mouse.click(bounds.x + offset.x, bounds.y + offset.y);
  return bounds;
}

try {
  const address = await readReadyLine(server.stdout);
  const origin = `http://${address.host}:${address.port}`;
  const { chromium } = await import(pathToFileURL(playwrightPath).href);
  browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on("response", (response) => {
    const url = new URL(response.url());
    requests.push({ path: url.pathname, status: response.status(), contentType: response.headers()["content-type"] ?? null });
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });

  const response = await page.goto(`${origin}/public/index.html`, { waitUntil: "networkidle" });
  assert.equal(response.status(), 200);
  await page.locator('[data-action="begin-battle"]').first().click();
  const frameSelector = "iframe.battle-frame";
  const frameElement = page.locator(frameSelector);
  await frameElement.waitFor({ state: "attached" });
  const battleFrame = page.frameLocator(frameSelector);
  await battleFrame.locator('[data-ui="arena"]').waitFor({ state: "visible" });
  const frame = page.frames().find((candidate) => candidate.url().includes("ui-arena-shell.html?app-frame=1"));
  assert.ok(frame, "battle iframe is the actual public arena shell app frame");
  await frame.evaluate(async () => {
    globalThis.__criticJourney = (await import("/src/ui/arena-shell-entry.js")).arenaHudController;
    __criticJourney.enterManualStepMode();
    document.querySelector('[data-ui="arena"]').addEventListener("pointerup", (event) => {
      globalThis.__criticArenaPointerTrusted = event.isTrusted;
    }, { once: true });
  });

  await page.screenshot({ path: join(output, "phone-390x844-app-opening.png") });
  const card = battleFrame.locator('[data-ui="card-slot"][data-card-id]').first();
  const cardBox = await card.boundingBox();
  assert.ok(cardBox && cardBox.width > 0 && cardBox.height > 0, "first live hand card is visible");
  await page.mouse.click(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);

  const arena = battleFrame.locator('[data-ui="arena"]');
  const arenaBox = await arena.boundingBox();
  assert.ok(arenaBox && arenaBox.width > 0 && arenaBox.height > 0, "app-frame arena is visible");
  const placement = { x: arenaBox.width * 0.5, y: arenaBox.height * 0.8 };
  await page.mouse.click(arenaBox.x + placement.x, arenaBox.y + placement.y);
  await frame.evaluate(() => __criticJourney.stepMany(240));
  const gameplay = await frame.evaluate(() => {
    const controller = __criticJourney;
    const rect = (node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const visible = (node) => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return !node.hidden && style.display !== "none" && style.visibility === "visible" &&
        Number(style.opacity) > 0 && box.width > 0 && box.height > 0;
    };
    const selectors = [
      '[data-ui="opponent-hud"]', '[data-ui="player-hud"]', '[data-ui="hand-tray"]',
      '[data-ui="next-card"]', '[data-ui="hud-timer"]', '[data-ui="elixir-rail"]',
      '[data-ui="arena"]', '[data-ui="river"]', '[data-ui="bridge"][data-lane="west"]',
      '[data-ui="bridge"][data-lane="east"]', ...[...document.querySelectorAll('[data-ui="tower-pad"]')]
        .map((node) => `[data-ui="tower-pad"][data-side="${node.dataset.side}"][data-role="${node.dataset.role}"]${node.dataset.lane ? `[data-lane="${node.dataset.lane}"]` : ""}`),
    ];
    const core = selectors.map((selector) => {
      const node = document.querySelector(selector);
      return { selector, visible: Boolean(node && visible(node)), rect: node ? rect(node) : null };
    });
    const arenaNode = document.querySelector('[data-ui="arena"]');
    const riverNode = document.querySelector('[data-ui="river"]');
    const bridges = [...document.querySelectorAll('[data-ui="bridge"]')].map(rect);
    const units = [...document.querySelectorAll('.combat-marker--entity-ground,.combat-marker--entity-air')]
      .map((node) => ({ side: node.dataset.side, className: node.className.baseVal ?? node.className,
        rect: rect(node), ariaLabel: node.getAttribute("aria-label"),
        paths: node.querySelectorAll("path").length,
        visible: visible(node),
        tickX: node.style.getPropertyValue("--combat-x"),
        tickY: node.style.getPropertyValue("--combat-y") }));
    const image = getComputedStyle(arenaNode).backgroundImage;
    return {
      tick: controller.state.sessionTick,
      replaySouthDeploys: controller.session.replay.filter((event) => event.type === "session-deployed" && event.side === "south"),
      sessionUnits: controller.session.state.battle.units.map(({ id, side, hitpoints, x, y }) => ({ id, side, hitpoints, x, y })),
      arena: { rect: rect(arenaNode), client: { left: arenaNode.clientLeft, top: arenaNode.clientTop,
        width: arenaNode.clientWidth, height: arenaNode.clientHeight } },
      river: rect(riverNode), bridges,
      towerCount: document.querySelectorAll('[data-ui="tower-pad"]').length,
      core,
      units,
      backgroundImage: image,
      manualStep: controller.state.manualStepMode,
      innerViewport: { width: innerWidth, height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      playerHudText: document.querySelector('[data-ui="player-hud"]').innerText,
      handText: document.querySelector('[data-ui="hand-tray"]').innerText,
      timerText: document.querySelector('[data-ui="hud-timer"]')?.textContent ?? document.querySelector('[data-ui="hud-timer"]')?.textContent,
      elixirText: document.querySelector('[data-ui="hud-elixir"]')?.textContent ?? document.querySelector('[data-ui="elixir-rail"] output')?.textContent,
    };
  });
  const outer = await page.evaluate(() => {
    const bounds = (selector) => {
      const node = document.querySelector(selector);
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height,
        right: box.right, bottom: box.bottom };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight, scrollX, scrollY },
      appFrameSlot: bounds('[data-battle-frame-slot]'),
      iframe: bounds('iframe.battle-frame'),
      nav: bounds('.app-nav'),
      appHeader: bounds('.app-header'),
      battleHeading: bounds('.battle-heading'),
    };
  });
  const trusted = await frame.evaluate(() => globalThis.__criticArenaPointerTrusted === true);
  assert.equal(trusted, true, "arena deployment input came from a trusted browser pointer event");
  assert.equal(gameplay.replaySouthDeploys.length, 1, "one trusted legal south troop deployment entered replay");
  assert.equal(gameplay.towerCount, 6);
  assert.ok(gameplay.units.length > 0, "deployed unit is visible in the actual production shell");
  assert.ok(gameplay.core.every(({ visible }) => visible), "all core HUD, river, bridge and tower layers are visible: " + JSON.stringify(gameplay.core.filter(({ visible }) => !visible)));
  assert.ok(gameplay.units.every(({ visible, paths }) => visible && paths > 0), "rendered units have visible original vector art");
  assert.equal(gameplay.innerViewport.scrollWidth, 720);
  assert.equal(gameplay.innerViewport.scrollHeight, 1280);
  assert.ok(outer.iframe.x >= outer.appFrameSlot.x && outer.iframe.y >= outer.appFrameSlot.y);
  assert.ok(outer.iframe.right <= outer.appFrameSlot.right + 0.5 && outer.iframe.bottom <= outer.appFrameSlot.bottom + 0.5,
    "scaled shell iframe stays inside the phone battle frame slot");
  assert.deepEqual(errors, []);

  await page.screenshot({ path: join(output, "phone-390x844-app-deployed.png") });
  const evidence = {
    sourceCommit: "5c81b556bb5cd949c59b92399f01ec624d95ca17",
    route: "/public/index.html",
    viewport: { width: 390, height: 844, isMobile: true },
    actualShell: "public/ui-arena-shell.html?app-frame=1",
    trustedArenaPointerEvent: trusted,
    placementRatioWithinArenaOuterBox: placement,
    gameplay,
    outer,
    imageRequest: requests.find(({ path }) => path === "/public/assets/moss-ember-arena-painted.webp") ?? null,
    errors,
    requests,
  };
  writeFileSync(join(output, "phone-390x844-app-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    viewport: outer.viewport,
    iframe: outer.iframe,
    playfield: gameplay.arena,
    river: gameplay.river,
    bridges: gameplay.bridges,
    towers: gameplay.towerCount,
    trustedArenaPointerEvent: trusted,
    replaySouthDeploys: gameplay.replaySouthDeploys,
    unitCount: gameplay.units.length,
    unitSizes: gameplay.units.map(({ rect, paths, visible }) => ({ width: rect.width, height: rect.height, paths, visible })),
    imageRequest: evidence.imageRequest,
    errors,
  }, null, 2)}\n`);
  await context.close();
} catch (error) {
  errors.push(String(error?.stack ?? error));
  writeFileSync(join(output, "phone-390x844-app-error.json"), `${JSON.stringify({ errors, requests }, null, 2)}\n`);
  throw error;
} finally {
  await browser?.close().catch(() => {});
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([once(server, "exit"), new Promise((resolve) => setTimeout(resolve, 2_000))]);
  }
}
