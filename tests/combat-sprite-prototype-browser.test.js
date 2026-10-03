import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { chromium } from "playwright";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ARTIFACTS = resolve(ROOT, "artifacts/sprite-art-round-4");
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
});
const DISPLAY_DECK = Object.freeze([
  "skymaul", "brassbolt", "reedsting", "briar-band",
  "cinderlings", "coilblade", "mossguard", "copperskiff",
]);

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

async function setPresentation(page, { action, direction = "south", tick, reducedMotion = false }) {
  await page.locator('[data-control="action"]').selectOption(action);
  await page.locator('[data-control="direction"]').selectOption(direction);
  await page.locator('[data-control="tick"]').evaluate((input, nextTick) => {
    input.value = String(nextTick);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, tick);
  const motion = page.locator('[data-control="reduced-motion"]');
  if (await motion.isChecked() !== reducedMotion) await motion.setChecked(reducedMotion);
  await page.waitForFunction(() =>
    document.querySelector("[data-current-tick]")?.dataset.currentTick ===
      document.querySelector('[data-control="tick"]')?.value);
}

async function boardEvidence(page, viewport) {
  return page.evaluate(({ width, height }) => {
    const boards = [...document.querySelectorAll("[data-scale-board]")].map((board) => {
      const rect = board.getBoundingClientRect();
      const markers = [...board.querySelectorAll("[data-sprite-frame]")].map((node) => {
        const marker = node.getBoundingClientRect();
        return {
          frame: node.dataset.spriteFrame,
          height: Number(marker.height.toFixed(4)),
          side: node.dataset.spriteSide,
          width: Number(marker.width.toFixed(4)),
        };
      });
      return {
        height: Number(rect.height.toFixed(2)),
        markerCount: markers.length,
        markers,
        renderer: board.dataset.renderer,
        unitSize: Number(board.dataset.unitSize),
        width: Number(rect.width.toFixed(2)),
      };
    });
    return { viewport: { width, height }, boards };
  }, viewport);
}

async function sampleTeamPixelsFromScreenshot(page, screenshot, markers) {
  return page.evaluate(async ({ base64, crops }) => {
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
  }, { base64: screenshot.toString("base64"), crops: markers });
}

async function compareScreenshotsAtPoint(page, before, after, point) {
  return page.evaluate(async ({ beforePng, afterPng, samplePoint }) => {
    const decode = async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      return { canvas, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data };
    };
    const first = await decode(beforePng);
    const second = await decode(afterPng);
    const differentPixels = [];
    let differentPixelCount = 0;
    let maximumChannelDelta = 0;
    for (let pixel = 0; pixel < Math.min(first.pixels.length, second.pixels.length); pixel += 4) {
      const rgbaBefore = [...first.pixels.slice(pixel, pixel + 4)];
      const rgbaAfter = [...second.pixels.slice(pixel, pixel + 4)];
      const channelDelta = Math.max(...rgbaBefore.map((channel, index) =>
        Math.abs(channel - rgbaAfter[index])));
      if (channelDelta > 0) {
        differentPixelCount += 1;
        maximumChannelDelta = Math.max(maximumChannelDelta, channelDelta);
        if (differentPixels.length < 24) {
          const offset = pixel / 4;
          differentPixels.push({
            x: offset % first.canvas.width,
            y: Math.floor(offset / first.canvas.width),
            before: rgbaBefore,
            after: rgbaAfter,
          });
        }
      }
    }
    const elementChain = (documentNode, x, y) => {
      let node = documentNode.elementFromPoint(x, y);
      const chain = [];
      while (node && chain.length < 6) {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        chain.push({
          tag: node.tagName,
          id: node.id,
          className: typeof node.className === "string" ? node.className : node.className?.baseVal,
          dataUi: node.dataset?.ui ?? null,
          dataKind: node.dataset?.kind ?? null,
          dataCardId: node.dataset?.cardId ?? null,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          transitionProperty: style.transitionProperty,
          transitionDuration: style.transitionDuration,
          animationName: style.animationName,
          animationDuration: style.animationDuration,
          transform: style.transform,
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
        });
        node = node.parentElement;
      }
      return chain;
    };
    const frame = document.querySelector("[data-battle-frame-slot] iframe");
    const frameRect = frame?.getBoundingClientRect();
    const topLevel = elementChain(document, samplePoint.x, samplePoint.y);
    const childFrame = frame?.contentDocument;
    const childPoint = frameRect ? {
      x: (samplePoint.x - frameRect.x) * (720 / frameRect.width),
      y: (samplePoint.y - frameRect.y) * (1280 / frameRect.height),
    } : null;
    const child = childFrame && childPoint
      ? elementChain(childFrame, childPoint.x, childPoint.y) : [];
    return {
      dimensions: [first.canvas.width, first.canvas.height],
      differingPixelCount: differentPixelCount,
      maximumChannelDelta,
      differingPixels: differentPixels,
      samplePoint,
      frame: frameRect?.toJSON() ?? null,
      childPoint,
      topLevelElementChain: topLevel,
      childElementChain: child,
      activeAnimations: [...document.getAnimations()].map((animation) => ({
        playState: animation.playState,
        currentTime: animation.currentTime,
        target: animation.effect?.target?.className?.baseVal ??
          animation.effect?.target?.className ?? animation.effect?.target?.tagName ?? null,
      })),
    };
  }, {
    beforePng: before.toString("base64"),
    afterPng: after.toString("base64"),
    samplePoint: point,
  });
}

test("painted sprite atlas renders at real playfield scale in both teams, viewports, and restore", {
  timeout: 90_000,
}, async (t) => {
  mkdirSync(ARTIFACTS, { recursive: true });
  const server = await startStaticServer();
  t.after(() => server.close());
  const browser = await chromium.launch({
    executablePath: existsSync(CHROME) ? CHROME : undefined,
    headless: true,
  });
  t.after(() => browser.close());
  const pageErrors = [];
  const consoleErrors = [];
  const evidence = {
    createdAt: new Date().toISOString(),
    pageErrors,
    consoleErrors,
    viewports: [],
  };

  for (const viewport of [
    { width: 720, height: 1280 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ deviceScaleFactor: 1, viewport });
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    const response = await page.goto(`${server.url}/demo/sprite-prototype.html`, {
      waitUntil: "networkidle",
    });
    assert.equal(response.status(), 200);
    await page.locator("[data-sprite-frame]").first().waitFor();
    await page.evaluate(() => document.fonts.ready);

    const viewportEvidence = { ...await boardEvidence(page, viewport), frames: {} };
    const expectedBoardWidth = Math.min(540, viewport.width * 0.75);
    const expectedMarkerWidth = expectedBoardWidth * 0.048;
    for (const board of viewportEvidence.boards) {
      assert.equal(board.markerCount, 8, `${board.renderer} must show both teams across four facings`);
      assert.ok(Math.abs(board.width - expectedBoardWidth) < 0.02);
      assert.ok(Math.abs(board.height - expectedBoardWidth * (960 / 540)) < 0.03);
      assert.ok(Math.abs(board.unitSize - expectedMarkerWidth) < 0.01);
      for (const marker of board.markers) {
        assert.ok(Math.abs(marker.width - expectedMarkerWidth) < 0.02,
          `${board.renderer}/${marker.side}/${marker.frame} width ${marker.width} != ${expectedMarkerWidth}; board=${board.width}, unit=${board.unitSize}`);
        assert.ok(Math.abs(marker.height - expectedMarkerWidth) < 0.02,
          `${board.renderer}/${marker.side}/${marker.frame} height ${marker.height} != ${expectedMarkerWidth}`);
      }
    }

    for (const state of [
      { action: "walk", direction: "west", tick: 5 },
      { action: "attack", direction: "east", tick: 3 },
    ]) {
      await setPresentation(page, state);
      const frames = await page.evaluate(() => [...document.querySelectorAll(
        "[data-scale-board] [data-sprite-frame]",
      )].map(({ dataset }) => ({ frame: dataset.spriteFrame, side: dataset.spriteSide })));
      assert.equal(frames.length, 16);
      for (const direction of ["north", "east", "south", "west"]) {
        for (const side of ["north", "south"]) {
          assert.ok(frames.some(({ frame, side: actualSide }) =>
            frame === `briar-${state.action}-${direction}-1` && actualSide === side));
        }
      }
      viewportEvidence.frames[`${state.action}-${state.tick}`] = frames;
      await page.locator(".comparison").screenshot({
        path: resolve(ARTIFACTS, `${viewport.width}-${state.action}.png`),
      });
    }

    await setPresentation(page, { action: "attack", direction: "north", tick: 119,
      reducedMotion: true });
    const reducedFrames = await page.evaluate(() => [...document.querySelectorAll(
      "[data-scale-board] [data-sprite-frame]",
    )].map(({ dataset }) => dataset.spriteFrame));
    assert.equal(reducedFrames.length, 16);
    assert.ok(reducedFrames.every((frame) => frame.endsWith("-0")));
    viewportEvidence.frames.reducedMotion = reducedFrames;

    await setPresentation(page, { action: "attack", direction: "west", tick: 47 });
    await page.locator('[data-action="checkpoint"]').click();
    const beforeRestore = await page.locator(".comparison").screenshot();
    await page.locator('[data-action="advance"]').click();
    await page.locator('[data-action="restore"]').click();
    const afterRestore = await page.locator(".comparison").screenshot();
    assert.deepEqual(afterRestore, beforeRestore, "restore must reproduce identical rendered pixels");
    writeFileSync(resolve(ARTIFACTS, `${viewport.width}-restore-exact.png`), afterRestore);
    viewportEvidence.restore = {
      action: await page.locator('[data-control="action"]').inputValue(),
      direction: await page.locator('[data-control="direction"]').inputValue(),
      reducedMotion: await page.locator('[data-control="reduced-motion"]').isChecked(),
      screenshotSha256Before: createHash("sha256").update(beforeRestore).digest("hex"),
      screenshotSha256After: createHash("sha256").update(afterRestore).digest("hex"),
      tick: Number(await page.locator('[data-control="tick"]').inputValue()),
    };
    assert.deepEqual(viewportEvidence.restore, {
      ...viewportEvidence.restore,
      action: "attack",
      direction: "west",
      reducedMotion: false,
      tick: 47,
    });

    evidence.viewports.push(viewportEvidence);
    await page.close();
  }

  evidence.liveArenaIntegration = [];
  for (const viewport of [
    { width: 720, height: 1280 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ deviceScaleFactor: 1, viewport });
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    const response = await page.goto(`${server.url}/public/index.html`, {
      waitUntil: "networkidle",
    });
    assert.equal(response.status(), 200);
    await page.locator('.app-nav [data-nav-to="battle"]').click();
    const frameElement = page.locator("[data-battle-frame-slot] iframe");
    await frameElement.waitFor({ state: "attached" });
    await frameElement.contentFrame().locator('[data-ui="arena"]').waitFor({
      state: "visible",
      timeout: 8_000,
    });
    const child = page.frames().find((candidate) => candidate.url().includes("app-frame=1"));
    assert.ok(child, "the app shell must mount its real scaled battle frame");
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
        running: !controller.state.paused,
        resumed,
        state: controller.state,
      };
    }, DISPLAY_DECK);
    assert.deepEqual(boot.deck, DISPLAY_DECK);
    assert.equal(boot.pausedBeforeSetup, false);
    assert.equal(boot.manual, true);
    assert.equal(boot.running, true);

    const frame = frameElement.contentFrame();
    const card = frame.locator('[data-ui="card-slot"][data-card-id="briar-band"]');
    await card.waitFor();
    await card.click();
    const arena = frame.locator('[data-ui="arena"]');
    const arenaBox = await arena.boundingBox();
    assert.ok(arenaBox && arenaBox.width > 0 && arenaBox.height > 0);
    await page.mouse.click(arenaBox.x + arenaBox.width / 2,
      arenaBox.y + arenaBox.height * 0.79);
    await child.evaluate(() => globalThis.__spriteRendererProbe.stepMany(120));
    await frame.locator('.combat-marker[data-kind="briar-runner"]').first().waitFor({
      state: "attached",
      timeout: 5_000,
    });
    const frameBox = await frameElement.boundingBox();
    assert.ok(frameBox && frameBox.width > 0 && frameBox.height > 0,
      `the real app-shell iframe is laid out: ${JSON.stringify(frameBox)}`);
    const live = await child.evaluate(async ({ scaleX, scaleY }) => {
      const arenaNode = document.querySelector('[data-ui="arena"]');
      const arenaRect = arenaNode.getBoundingClientRect();
      const markers = await Promise.all([...document.querySelectorAll(
        '.combat-marker[data-kind="briar-runner"]',
      )].map((marker) => {
        const rect = marker.getBoundingClientRect();
        const art = marker.querySelector('.combat-art');
        const footring = art?.querySelector('[data-team-color]');
        const footringRect = footring?.getBoundingClientRect();
        return {
          action: art?.dataset.spriteAction ?? null,
          asset: art?.querySelector('image')?.getAttribute('href') ?? null,
          direction: art?.dataset.spriteDirection ?? null,
          frame: art?.dataset.spriteFrame ?? null,
          height: Number(rect.height.toFixed(4)),
          displayedHeight: Number((rect.height * scaleY).toFixed(4)),
          side: marker.classList.contains("combat-marker--north") ? "north" : "south",
          tick: Number(art?.dataset.simulationTick),
          width: Number(rect.width.toFixed(4)),
          displayedWidth: Number((rect.width * scaleX).toFixed(4)),
          teamColor: footring?.getAttribute('fill') ?? null,
          teamColorSide: footring?.dataset.teamColor ?? null,
          teamColorFrontmost: art?.lastElementChild === footring,
          teamColorRect: footringRect ? {
            height: Number(footringRect.height.toFixed(3)),
            width: Number(footringRect.width.toFixed(3)),
          } : null,
          visibleTeamColorPixels: null,
          x: Number(rect.x.toFixed(2)),
          y: Number(rect.y.toFixed(2)),
        };
      }));
      return {
        arena: {
          height: Number((arenaRect.height * scaleY).toFixed(2)),
          width: Number((arenaRect.width * scaleX).toFixed(2)),
          sourceHeight: arenaNode.clientHeight,
          sourceWidth: arenaNode.clientWidth,
          displayedContentHeight: Number((arenaNode.clientHeight * scaleY).toFixed(2)),
          displayedContentWidth: Number((arenaNode.clientWidth * scaleX).toFixed(2)),
          x: Number(arenaRect.x.toFixed(2)),
          y: Number(arenaRect.y.toFixed(2)),
        },
        markers,
        sessionTick: globalThis.__spriteRendererProbe.state.sessionTick,
        unitCount: globalThis.__spriteRendererProbe.session.state.battle.units.length,
      };
    }, { scaleX: frameBox.width / 720, scaleY: frameBox.height / 1280 });
    assert.ok(Math.abs(frameBox.width / 720 - frameBox.height / 1280) < 0.005,
      `app-shell scales the canonical battle frame uniformly: ${JSON.stringify(frameBox)}`);
    assert.ok(live.arena.width > 0 && live.arena.height > 0);
    assert.ok(live.markers.length > 0, "real GameSession deployment must render Briar Runner");
    assert.deepEqual([...new Set(live.markers.map(({ side }) => side))].sort(), ["north", "south"],
      "the real two-sided match must show painted Briar units for both teams");
    const phoneViewport = viewport.width === 390;
    for (const marker of live.markers) {
      assert.ok(Math.abs(marker.width - live.arena.sourceWidth * 0.048) < 0.02,
        `live marker ${marker.width}px must be 4.8% of arena content width ${live.arena.sourceWidth}px`);
      assert.ok(Math.abs(marker.height - live.arena.sourceWidth * 0.048) < 0.02);
      assert.ok(Math.abs(marker.displayedWidth - live.arena.displayedContentWidth * 0.048) < 0.02);
      assert.ok(Math.abs(marker.displayedHeight - live.arena.displayedContentWidth * 0.048) < 0.02);
      assert.equal(marker.asset, './assets/briar-runner-painted-sheet.png');
      assert.equal(marker.teamColorSide, marker.side);
      assert.equal(marker.teamColor, marker.side === "north" ? "#C6452E" : "#2E7F86");
      assert.equal(marker.teamColorFrontmost, true,
        "the painted sprite keeps its team-color baseplate above the atlas image");
      assert.ok(["walk", "attack"].includes(marker.action));
      assert.ok(["north", "east", "south", "west"].includes(marker.direction));
      assert.match(marker.frame, /^briar-(walk|attack)-(north|east|south|west)-[01]$/u);
      assert.equal(marker.tick, live.sessionTick);
    }
    const beforeRestoreScreenshot = await page.screenshot();
    const screenScaleX = frameBox.width / 720;
    const screenScaleY = frameBox.height / 1280;
    const screenshotMarkers = live.markers.map((marker) => ({
      side: marker.side,
      color: marker.teamColor,
      x: frameBox.x + marker.x * screenScaleX,
      y: frameBox.y + marker.y * screenScaleY,
      width: marker.width * screenScaleX,
      height: marker.height * screenScaleY,
    }));
    const teamPixelSamples = await sampleTeamPixelsFromScreenshot(
      page, beforeRestoreScreenshot, screenshotMarkers);
    for (let index = 0; index < live.markers.length; index += 1) {
      live.markers[index].visibleTeamColorPixels = teamPixelSamples[index].visibleTeamColorPixels;
    }
    writeFileSync(resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}-marker-sample.png`), beforeRestoreScreenshot);
    writeFileSync(resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}-team-pixels.json`),
    `${JSON.stringify(teamPixelSamples, null, 2)}\n`);
    const minimumVisibleTeamColorPixels = phoneViewport ? 8 : 24;
    for (const side of ["north", "south"]) {
      const maximumVisiblePixels = Math.max(...teamPixelSamples
        .filter((sample) => sample.side === side)
        .map((sample) => sample.visibleTeamColorPixels));
      assert.ok(maximumVisiblePixels >= minimumVisibleTeamColorPixels,
        `${side} team color survives the actual ${viewport.width}px scaled marker: ` +
          `${maximumVisiblePixels} pixels in the most visible ${teamPixelSamples[0].crop.width}×` +
          `${teamPixelSamples[0].crop.height} marker; expected at least ` +
          `${minimumVisibleTeamColorPixels}`);
    }
    const checkpoint = await child.evaluate(() => globalThis.__spriteRendererProbe.serialize());
    const restored = await child.evaluate((bytes) => {
      const controller = globalThis.__spriteRendererProbe;
      const before = document.querySelector('[data-game-browser-layer="combat"]').innerHTML;
      controller.stepMany(1);
      controller.restore(bytes);
      controller.enterManualStepMode();
      const after = document.querySelector('[data-game-browser-layer="combat"]').innerHTML;
      return { identical: before === after, tick: controller.state.sessionTick };
    }, checkpoint);
    assert.deepEqual(restored, { identical: true, tick: live.sessionTick });
    const afterRestoreScreenshot = await page.screenshot();
    assert.deepEqual(afterRestoreScreenshot, beforeRestoreScreenshot,
      "the real scaled battle screenshot must restore pixel-identically");
    const screenshotSha256 = createHash("sha256").update(beforeRestoreScreenshot).digest("hex");
    writeFileSync(resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}-before-restore.png`), beforeRestoreScreenshot);
    writeFileSync(resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}-after-restore.png`), afterRestoreScreenshot);

    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedMotionState = await child.evaluate((bytes) => {
      const controller = globalThis.__spriteRendererProbe;
      controller.restore(bytes);
      controller.enterManualStepMode();
      const art = [...document.querySelectorAll(
        '.combat-marker[data-kind="briar-runner"] .combat-art',
      )];
      return {
        mediaReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        sprites: art.map((node) => ({
          frame: node.dataset.spriteFrame,
          reducedMotion: node.dataset.reducedMotion,
          side: node.dataset.spriteSide,
          teamColor: node.querySelector('[data-team-color]')?.getAttribute('fill') ?? null,
        })),
        tick: controller.state.sessionTick,
      };
    }, checkpoint);
    assert.equal(reducedMotionState.mediaReducedMotion, true);
    assert.equal(reducedMotionState.tick, live.sessionTick);
    assert.ok(reducedMotionState.sprites.length > 0);
    for (const sprite of reducedMotionState.sprites) {
      assert.equal(sprite.reducedMotion, "true");
      assert.ok(sprite.frame.endsWith("-0"), `reduced motion frame ${sprite.frame}`);
      assert.equal(sprite.teamColor, sprite.side === "north" ? "#C6452E" : "#2E7F86");
    }
    const beforeReducedMotion = await page.screenshot();
    await child.evaluate((bytes) => {
      const controller = globalThis.__spriteRendererProbe;
      controller.stepMany(1);
      controller.restore(bytes);
      controller.enterManualStepMode();
    }, checkpoint);
    const afterReducedMotion = await page.screenshot();
    const reducedMotionPixelDiagnostics = await compareScreenshotsAtPoint(
      page,
      beforeReducedMotion,
      afterReducedMotion,
      { x: 105, y: 700 },
    );
    writeFileSync(resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}-reduced-motion.png`), beforeReducedMotion);
    writeFileSync(resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}-reduced-motion-after-restore.png`),
    afterReducedMotion);
    writeFileSync(resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}-reduced-motion-diagnostics.json`),
    `${JSON.stringify(reducedMotionPixelDiagnostics, null, 2)}\n`);
    assert.deepEqual(afterReducedMotion, beforeReducedMotion,
      "the real scaled battle screenshot with reduced motion must restore pixel-identically");
    const reducedMotionSha256 = createHash("sha256").update(beforeReducedMotion).digest("hex");
    await page.screenshot({ path: resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}.png`) });
    evidence.liveArenaIntegration.push({
      ...live,
      markerPixelSamples: teamPixelSamples,
      frame: { height: Number(frameBox.height.toFixed(2)),
        scaleX: Number((frameBox.width / 720).toFixed(6)),
        scaleY: Number((frameBox.height / 1280).toFixed(6)),
        width: Number(frameBox.width.toFixed(2)) },
      restore: { ...restored, pixelIdentical: true, screenshotSha256 },
      reducedMotion: {
        ...reducedMotionState,
        pixelIdenticalAfterRestore: true,
        screenshotSha256: reducedMotionSha256,
      },
      viewport,
    });
    await page.close();
  }

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(server.missingPaths, [], `unexpected 404s: ${server.missingPaths.join(", ")}`);
  assert.deepEqual(consoleErrors, []);
  writeFileSync(resolve(ARTIFACTS, "browser-render-evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`);
});
