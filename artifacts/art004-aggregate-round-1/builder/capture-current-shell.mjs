import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

import { chromium } from "playwright";

const ROOT = process.cwd();
const OUTPUT = resolve(ROOT, "artifacts/art004-aggregate-round-1/builder");
const CAPTURE_PREFIX = process.env.SPRITE_CAPTURE_PREFIX ?? "";
const EVIDENCE_FILE = process.env.SPRITE_EVIDENCE_FILE ??
  `${CAPTURE_PREFIX ? `current-shell-${CAPTURE_PREFIX}evidence` : "current-shell-evidence"}.json`;
const DEPLOY_RATIO = Number(process.env.SPRITE_DEPLOY_RATIO ?? 0.79);
const VIEWPORT_FILTER = process.env.SPRITE_VIEWPORT_ONLY ?? "";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DISPLAY_DECK = Object.freeze([
  "skymaul", "brassbolt", "reedsting", "briar-band",
  "cinderlings", "coilblade", "mossguard", "copperskiff",
]);
const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function startStaticServer() {
  const missingPaths = [];
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
    if (pathname === "/favicon.ico") {
      response.writeHead(204).end();
      return;
    }
    const file = resolve(ROOT, `.${pathname}`);
    if (file !== ROOT && !file.startsWith(`${ROOT}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const bytes = await readFile(file);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": bytes.length,
        "Content-Type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      }).end(bytes);
    } catch {
      missingPaths.push(pathname);
      response.writeHead(404).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    close: () => new Promise((resolveClose, reject) => server.close((error) =>
      error ? reject(error) : resolveClose())),
    missingPaths,
    url: `http://127.0.0.1:${server.address().port}`,
  };
}

async function inspectMarkers(child, frameElement) {
  const frameBox = await frameElement.boundingBox();
  assert.ok(frameBox && frameBox.width > 0 && frameBox.height > 0);
  return child.evaluate(({ scaleX, scaleY }) => {
    const arena = document.querySelector('[data-ui="arena"]');
    const arenaRect = arena.getBoundingClientRect();
    const markers = [...document.querySelectorAll(
      '.combat-marker[data-kind="briar-runner"]',
    )].map((marker) => {
      const art = marker.querySelector(".combat-art");
      const rect = marker.getBoundingClientRect();
      const footring = art?.querySelector("[data-team-color]");
      return {
        action: art?.dataset.spriteAction ?? null,
        direction: art?.dataset.spriteDirection ?? null,
        frame: art?.dataset.spriteFrame ?? null,
        height: Number(rect.height.toFixed(4)),
        pageHeight: Number((rect.height * scaleY).toFixed(4)),
        pageX: Number((rect.x * scaleX).toFixed(3)),
        pageY: Number((rect.y * scaleY).toFixed(3)),
        reaction: marker.dataset.reaction,
        side: marker.classList.contains("combat-marker--north") ? "north" : "south",
        teamColor: footring?.getAttribute("fill") ?? null,
        teamColorSide: footring?.dataset.teamColor ?? null,
        tick: Number(art?.dataset.simulationTick),
        width: Number(rect.width.toFixed(4)),
        pageWidth: Number((rect.width * scaleX).toFixed(4)),
      };
    });
    return {
      arena: {
        contentHeight: Number((arena.clientHeight * scaleY).toFixed(3)),
        contentWidth: Number((arena.clientWidth * scaleX).toFixed(3)),
        sourceHeight: arena.clientHeight,
        sourceWidth: arena.clientWidth,
        visibleHeight: Number((arenaRect.height * scaleY).toFixed(3)),
        visibleWidth: Number((arenaRect.width * scaleX).toFixed(3)),
      },
      markers,
      sessionTick: globalThis.__spriteRendererProbe.state.sessionTick,
      unitCount: globalThis.__spriteRendererProbe.session.state.battle.units.length,
    };
  }, { scaleX: frameBox.width / 720, scaleY: frameBox.height / 1280 });
}

async function screenshotAndTeamPixels(page, markers, name, frameBox) {
  const file = resolve(OUTPUT, `${name}.png`);
  const screenshot = await page.screenshot({ path: file });
  const samples = await page.evaluate(async ({ base64, crops }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return crops.map((crop) => {
      const left = Math.max(0, Math.floor(crop.x));
      const top = Math.max(0, Math.floor(crop.y));
      const right = Math.min(canvas.width, Math.ceil(crop.x + crop.width));
      const bottom = Math.min(canvas.height, Math.ceil(crop.y + crop.height));
      const pixels = context.getImageData(left, top, right - left, bottom - top).data;
      const channels = crop.color.match(/[0-9A-F]{2}/giu)
        .map((part) => Number.parseInt(part, 16));
      let visibleTeamColorPixels = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] >= 210 &&
            Math.abs(pixels[index] - channels[0]) <= 24 &&
            Math.abs(pixels[index + 1] - channels[1]) <= 24 &&
            Math.abs(pixels[index + 2] - channels[2]) <= 24) {
          visibleTeamColorPixels += 1;
        }
      }
      return {
        side: crop.side,
        teamColor: crop.color,
        visibleTeamColorPixels,
        crop: { x: left, y: top, width: right - left, height: bottom - top },
      };
    });
  }, {
    base64: screenshot.toString("base64"),
    crops: markers.map((marker) => ({
      color: marker.teamColor,
      height: marker.pageHeight,
      side: marker.side,
      width: marker.pageWidth,
      x: marker.pageX + frameBox.x,
      y: marker.pageY + frameBox.y,
    })),
  });
  return { path: file, sha256: sha256(screenshot), samples };
}

async function capture(page, child, frameElement, prefix, mode) {
  const state = await inspectMarkers(child, frameElement);
  assert.ok(state.markers.length > 0, `${prefix} must render real Briar units`);
  assert.deepEqual([...new Set(state.markers.map(({ side }) => side))].sort(), ["north", "south"]);
  for (const marker of state.markers) {
    assert.ok(["walk", "attack"].includes(marker.action));
    assert.ok(["north", "east", "south", "west"].includes(marker.direction));
    assert.equal(marker.teamColorSide, marker.side);
    assert.equal(marker.teamColor,
      marker.side === "north" ? "#C6452E" : "#2E7F86");
    assert.equal(marker.tick, state.sessionTick);
  }
  const frameBox = await frameElement.boundingBox();
  const pixels = await screenshotAndTeamPixels(page, state.markers,
    `${prefix}-${mode}`, frameBox);
  return { ...state, screenshot: pixels };
}

async function verifyRestore(page, child, checkpoint, prefix, reducedMotion) {
  const before = await page.screenshot();
  const beforeHash = sha256(before);
  const restored = await child.evaluate((bytes) => {
    const controller = globalThis.__spriteRendererProbe;
    const beforeDom = document.querySelector(
      '[data-game-browser-layer="combat"]',
    ).innerHTML;
    controller.stepMany(7);
    controller.restore(bytes);
    controller.enterManualStepMode();
    const afterDom = document.querySelector(
      '[data-game-browser-layer="combat"]',
    ).innerHTML;
    return {
      domIdentical: beforeDom === afterDom,
      sessionTick: controller.state.sessionTick,
    };
  }, checkpoint);
  const after = await page.screenshot();
  assert.deepEqual(after, before, `${prefix} ${reducedMotion ? "reduced" : "normal"} restore pixels`);
  assert.equal(restored.domIdentical, true);
  writeFileSync(resolve(OUTPUT, `${prefix}-${reducedMotion ? "reduced" : "normal"}-restore.png`), after);
  return {
    ...restored,
    beforeSha256: beforeHash,
    afterSha256: sha256(after),
    pixelIdentical: true,
    reducedMotion,
  };
}

async function setupMatch(page, baseUrl) {
  const response = await page.goto(`${baseUrl}/public/index.html`, {
    waitUntil: "networkidle",
  });
  assert.equal(response.status(), 200);
  await page.locator('.app-nav [data-nav-to="battle"]').click();
  const frameElement = page.locator("[data-battle-frame-slot] iframe");
  await frameElement.waitFor({ state: "attached" });
  const frame = frameElement.contentFrame();
  await frame.locator('[data-ui="arena"]').waitFor({ state: "visible", timeout: 8_000 });
  const child = page.frames().find((candidate) => candidate.url().includes("app-frame=1"));
  assert.ok(child, "actual app shell battle iframe must be present");
  const boot = await child.evaluate(async (deck) => {
    const { arenaHudController } = await import("/src/ui/arena-shell-entry.js");
    const controller = arenaHudController;
    globalThis.__spriteRendererProbe = controller;
    const wasRunning = !controller.state.paused;
    if (wasRunning) controller.pause();
    controller.replaceDeck(deck);
    const resumed = controller.state.paused ? controller.resume() : false;
    const manual = controller.enterManualStepMode();
    return {
      deck: JSON.parse(controller.session.serialize()).setup.deck,
      manual,
      pausedBeforeSetup: !wasRunning,
      resumed,
      running: !controller.state.paused,
    };
  }, DISPLAY_DECK);
  assert.deepEqual(boot.deck, DISPLAY_DECK);
  assert.equal(boot.pausedBeforeSetup, false);
  assert.equal(boot.manual, true);
  assert.equal(boot.running, true);
  const card = frame.locator('[data-ui="card-slot"][data-card-id="briar-band"]');
  await card.waitFor();
  await card.click();
  const arena = frame.locator('[data-ui="arena"]');
  const arenaBox = await arena.boundingBox();
  assert.ok(arenaBox && arenaBox.width > 0 && arenaBox.height > 0);
  await page.mouse.click(arenaBox.x + arenaBox.width / 2,
    arenaBox.y + arenaBox.height * DEPLOY_RATIO);
  await child.evaluate(() => globalThis.__spriteRendererProbe.stepMany(120));
  await frame.locator('.combat-marker[data-kind="briar-runner"]').first().waitFor({
    state: "attached",
    timeout: 5_000,
  });
  return { child, frame, frameElement };
}

async function findAttack(child, maxTicks) {
  return child.evaluate(async (limit) => {
    const controller = globalThis.__spriteRendererProbe;
    for (let stepped = 0; stepped < limit; stepped += 1) {
      controller.stepMany(1);
      await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      const markers = [...document.querySelectorAll(
        '.combat-marker[data-kind="briar-runner"]',
      )].map((marker) => {
        const art = marker.querySelector(".combat-art");
        return {
          action: art?.dataset.spriteAction ?? null,
          direction: art?.dataset.spriteDirection ?? null,
          frame: art?.dataset.spriteFrame ?? null,
          side: marker.classList.contains("combat-marker--north") ? "north" : "south",
          tick: Number(art?.dataset.simulationTick),
        };
      });
      if (markers.some(({ action }) => action === "attack")) {
        return {
          found: true,
          stepsAfterWalk: stepped + 1,
          sessionTick: controller.state.sessionTick,
          markers,
        };
      }
    }
    return {
      found: false,
      stepsAfterWalk: limit,
      sessionTick: controller.state.sessionTick,
      markers: [...document.querySelectorAll(
        '.combat-marker[data-kind="briar-runner"]',
      )].map((marker) => ({
        action: marker.querySelector(".combat-art")?.dataset.spriteAction ?? null,
        direction: marker.querySelector(".combat-art")?.dataset.spriteDirection ?? null,
        frame: marker.querySelector(".combat-art")?.dataset.spriteFrame ?? null,
        side: marker.classList.contains("combat-marker--north") ? "north" : "south",
        tick: Number(marker.querySelector(".combat-art")?.dataset.simulationTick),
      })),
    };
  }, maxTicks);
}

async function main() {
  mkdirSync(OUTPUT, { recursive: true });
  const server = await startStaticServer();
  const browser = await chromium.launch({
    executablePath: existsSync(CHROME) ? CHROME : undefined,
    headless: true,
  });
  const evidence = {
    app: "/public/index.html",
    browser: "Google Chrome via Playwright Chromium driver",
    createdAt: new Date().toISOString(),
    deviceScaleFactor: 1,
    pageErrors: [],
    consoleErrors: [],
    viewports: [],
  };
  try {
    for (const viewportBase of [
      { name: "phone-390x844", width: 390, height: 844 },
      { name: "desktop-1440x900", width: 1440, height: 900 },
    ].filter(({ name }) => !VIEWPORT_FILTER || name.startsWith(VIEWPORT_FILTER))) {
      const viewport = { ...viewportBase, name: `${CAPTURE_PREFIX}${viewportBase.name}` };
      const page = await browser.newPage({
        deviceScaleFactor: 1,
        viewport: { width: viewport.width, height: viewport.height },
      });
      page.on("pageerror", (error) => evidence.pageErrors.push(String(error)));
      page.on("console", (message) => {
        if (message.type() === "error") evidence.consoleErrors.push(message.text());
      });
      const { child, frame, frameElement } = await setupMatch(page, server.url);
      await child.evaluate(() => new Promise((resolveFrame) =>
        requestAnimationFrame(resolveFrame)));
      const animationTick = await child.evaluate(async () => {
        const controller = globalThis.__spriteRendererProbe;
        controller.stepMany(5);
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
        return controller.state.sessionTick;
      });
      assert.equal(animationTick, 125);
      const walkCheckpoint = await child.evaluate(() =>
        globalThis.__spriteRendererProbe.serialize());
      const walk = await capture(page, child, frameElement, viewport.name, "walk-normal");
      const walkRestore = await verifyRestore(page, child, walkCheckpoint,
        viewport.name, false);

      await page.emulateMedia({ reducedMotion: "reduce" });
      const reducedWalk = await child.evaluate((bytes) => {
        const controller = globalThis.__spriteRendererProbe;
        controller.restore(bytes);
        controller.enterManualStepMode();
        return {
          mediaReducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
          sessionTick: controller.state.sessionTick,
        };
      }, walkCheckpoint);
      assert.equal(reducedWalk.mediaReducedMotion, true);
      const reducedWalkCapture = await capture(page, child, frameElement,
        viewport.name, "walk-reduced");
      assert.ok(reducedWalkCapture.markers.every(({ frame: id }) => id.endsWith("-0")));
      const reducedWalkRestore = await verifyRestore(page, child, walkCheckpoint,
        viewport.name, true);
      await page.emulateMedia({ reducedMotion: "no-preference" });

      const attackSearch = await findAttack(child, 600);
      if (attackSearch.found) {
        const attackCheckpoint = await child.evaluate(() =>
          globalThis.__spriteRendererProbe.serialize());
        const attack = await capture(page, child, frameElement,
          viewport.name, "attack-normal");
        assert.ok(attack.markers.some(({ action }) => action === "attack"));
        const attackRestore = await verifyRestore(page, child, attackCheckpoint,
          viewport.name, false);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await child.evaluate((bytes) => {
          const controller = globalThis.__spriteRendererProbe;
          controller.restore(bytes);
          controller.enterManualStepMode();
        }, attackCheckpoint);
        const reducedAttack = await capture(page, child, frameElement,
          viewport.name, "attack-reduced");
        assert.ok(reducedAttack.markers.every(({ frame: id }) => id.endsWith("-0")));
        assert.ok(reducedAttack.markers.some(({ action }) => action === "attack"));
        const reducedAttackRestore = await verifyRestore(page, child,
          attackCheckpoint, viewport.name, true);
        evidence.viewports.push({
          ...viewport,
          attackSearch,
          attack,
          attackRestore,
          reducedAttack,
          reducedAttackRestore,
          reducedWalk,
          reducedWalkCapture,
          reducedWalkRestore,
          walk,
          walkRestore,
        });
      } else {
        evidence.viewports.push({
          ...viewport,
          attackSearch,
          reducedWalk,
          reducedWalkCapture,
          reducedWalkRestore,
          walk,
          walkRestore,
        });
      }
      await page.close();
    }
    evidence.missingPaths = server.missingPaths;
    assert.deepEqual(evidence.pageErrors, []);
    assert.deepEqual(evidence.consoleErrors, []);
    assert.deepEqual(evidence.missingPaths, []);
    writeFileSync(resolve(OUTPUT, EVIDENCE_FILE),
      `${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    await browser.close();
    await server.close();
  }
  process.stdout.write(`${JSON.stringify({
    viewports: evidence.viewports.map(({ name, attackSearch, walk, reducedWalkCapture, attack, reducedAttack }) => ({
      name,
      walkTick: walk?.sessionTick,
      walkActions: [...new Set(walk?.markers.map(({ action }) => action) ?? [])],
      reducedWalkPixelCounts: reducedWalkCapture?.screenshot.samples.map((sample) => sample.visibleTeamColorPixels),
      attackFoundAtTick: attackSearch?.found ? attackSearch.sessionTick : null,
      attackActions: [...new Set(attack?.markers.map(({ action }) => action) ?? [])],
      reducedAttackActions: [...new Set(reducedAttack?.markers.map(({ action }) => action) ?? [])],
    })),
    pageErrors: evidence.pageErrors,
    consoleErrors: evidence.consoleErrors,
    missingPaths: evidence.missingPaths,
  }, null, 2)}\n`);
}

await main();
