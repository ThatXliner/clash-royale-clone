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
import { selectBriarRunnerFrame } from "../src/ui/combat-sprite-prototype.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ARTIFACTS = resolve(ROOT, "artifacts/art004-aggregate-round-5/builder/live-browser");
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

function audioContinuationFacts(audio) {
  return Object.fromEntries([
    "cursor",
    "eventCount",
    "gainBasisPoints",
    "muted",
    "sessionTick",
    "suppressedAcceleratedCueCount",
    "terminal",
    "uiCommandCount",
    "uiSequence",
    "uiLastTick",
  ].map((key) => [key, audio[key]]));
}

function pcmContinuationProof(receipts) {
  return receipts.map(({ cueId, effectiveGainBasisPoints, energy, family,
    mixGainBasisPoints, outputGainBasisPoints, outputMuted, peak, rmsBasisPoints,
    sampleCount, sampleRateHz, sequence, sourceType, startTick, waveformSha256 }) => ({
    cueId,
    effectiveGainBasisPoints,
    energy,
    family,
    mixGainBasisPoints,
    outputGainBasisPoints,
    outputMuted,
    peak,
    rmsBasisPoints,
    sampleCount,
    sampleRateHz,
    sequence,
    sourceType,
    startTick,
    waveformSha256,
  }));
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Canonical(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
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
        actorId: crop.actorId,
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

async function reducedRestorePaintFingerprint(page, child, point) {
  const frameBox = await page.locator("[data-battle-frame-slot] iframe").boundingBox();
  assert.ok(frameBox && frameBox.width > 0 && frameBox.height > 0);
  const childPoint = {
    x: (point.x - frameBox.x) * (720 / frameBox.width),
    y: (point.y - frameBox.y) * (1280 / frameBox.height),
  };
  const [outer, inner] = await Promise.all([
    page.evaluate(({ x, y }) => {
      const frame = document.querySelector("[data-battle-frame-slot] iframe");
      const slot = frame?.parentElement;
      const element = document.elementFromPoint(x, y);
      const style = (node) => {
        if (!node) return null;
        const computed = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return {
          animationDuration: computed.animationDuration,
          animationName: computed.animationName,
          backgroundColor: computed.backgroundColor,
          borderColor: computed.borderColor,
          borderStyle: computed.borderStyle,
          borderWidth: computed.borderWidth,
          className: typeof node.className === "string"
            ? node.className : node.className?.baseVal ?? null,
          filter: computed.filter,
          id: node.id,
          opacity: computed.opacity,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          tag: node.tagName,
          transform: computed.transform,
          transitionDuration: computed.transitionDuration,
          transitionProperty: computed.transitionProperty,
          willChange: computed.willChange,
        };
      };
      return {
        chain: [element, element?.parentElement, frame, slot]
          .filter(Boolean).map(style),
        point: { x, y },
      };
    }, point),
    child.evaluate(({ x, y }) => {
      const slot = document.querySelector(
        '[data-ui="card-slot"][data-card-id="brassbolt"]',
      );
      const style = (node) => {
        if (!node) return null;
        const computed = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return {
          animationDuration: computed.animationDuration,
          animationName: computed.animationName,
          backgroundColor: computed.backgroundColor,
          borderColor: computed.borderColor,
          borderStyle: computed.borderStyle,
          borderWidth: computed.borderWidth,
          boxShadow: computed.boxShadow,
          className: typeof node.className === "string"
            ? node.className : node.className?.baseVal ?? null,
          filter: computed.filter,
          id: node.id,
          opacity: computed.opacity,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          tag: node.tagName,
          transform: computed.transform,
          transitionDuration: computed.transitionDuration,
          transitionProperty: computed.transitionProperty,
          willChange: computed.willChange,
        };
      };
      const pseudo = (node, selector) => {
        if (!node) return null;
        const computed = getComputedStyle(node, selector);
        return Object.fromEntries([
          "content", "backgroundColor", "borderColor", "borderStyle",
          "borderWidth", "boxShadow", "filter", "opacity", "transform",
          "transitionDuration", "animationName", "animationDuration",
        ].map((property) => [property,
          computed.getPropertyValue(property.replace(/[A-Z]/gu,
            (letter) => `-${letter.toLowerCase()}`))]));
      };
      const active = document.activeElement;
      return {
        activeElement: active ? {
          cardId: active.dataset?.cardId ?? null,
          className: typeof active.className === "string" ? active.className : null,
          tag: active.tagName,
        } : null,
        animations: document.getAnimations({ subtree: true }).map((animation) => ({
          currentTime: animation.currentTime,
          playState: animation.playState,
          target: animation.effect?.target?.tagName ?? null,
        })),
        bodyText: document.body.innerText,
        card: slot ? {
          attributes: [...slot.attributes].map(({ name, value }) => [name, value]),
          children: [...slot.children].map((node) => node.outerHTML),
          html: slot.outerHTML,
          matchesFocus: slot.matches(":focus"),
          matchesFocusVisible: slot.matches(":focus-visible"),
          matchesHover: slot.matches(":hover"),
          parent: style(slot.parentElement),
          style: style(slot),
          text: slot.textContent,
          before: pseudo(slot, "::before"),
          after: pseudo(slot, "::after"),
        } : null,
        fonts: document.fonts.status,
        point: { x, y },
      };
    }, childPoint),
  ]);
  return { inner, outer };
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
    { width: 1440, height: 933 },
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
    await child.evaluate(() => {
      globalThis.__art004TrustedPointers = [];
      document.addEventListener("pointerup", (event) => {
        if (!(event.target instanceof Element)) return;
        const target = event.target.closest('[data-ui="card-slot"], [data-ui="arena"]');
        if (!target) return;
        globalThis.__art004TrustedPointers.push({
          cardId: target.dataset.cardId ?? null,
          isTrusted: event.isTrusted,
          type: event.type,
          ui: target.dataset.ui,
        });
      }, true);
    });
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
      arenaBox.y + arenaBox.height * 0.54);
    const actualAttack = await child.evaluate(() => {
      const controller = globalThis.__spriteRendererProbe;
      for (let step = 0; step < 600; step += 1) {
        const beforeState = controller.session.state;
        const events = controller.stepMany(1);
        const state = controller.session.state;
        const units = new Map(beforeState.battle.units.map((unit) => [unit.id, unit]));
        const attack = events.find((event) => event.type === "attack" &&
          units.get(event.attackerId)?.archetypeId === "briar-runner" &&
          units.get(event.attackerId)?.side === "south");
        if (!attack) continue;
        const source = state.battle.units.find((unit) => unit.id === attack.attackerId);
        if (!source) continue;
        const damage = events.find((event) => event.type === "damage" &&
          event.attackerId === attack.attackerId && event.targetId === attack.targetId &&
          event.delivery === "melee" && event.tick === attack.tick);
        if (!damage) continue;
        const marker = [...document.querySelectorAll(
          '.combat-marker[data-kind="briar-runner"]',
        )].find((candidate) => candidate.dataset.combatId === String(attack.attackerId));
        const art = marker?.querySelector(".combat-art");
        return {
          attack: {
            attackerId: attack.attackerId,
            sequence: attack.sequence,
            targetId: attack.targetId,
            tick: attack.tick,
            type: attack.type,
          },
          damage: {
            amount: damage.amount,
            attackerId: damage.attackerId,
            currentHealthAfter: damage.currentHealthAfter,
            currentHealthBefore: damage.currentHealthBefore,
            delivery: damage.delivery,
            targetId: damage.targetId,
            tick: damage.tick,
            type: damage.type,
          },
          frame: art ? {
            action: art.dataset.spriteAction,
            animationAge: Number(art.dataset.attackAnimationAge),
            sourceClass: art.dataset.attackSourceClass ?? null,
            sourceId: Number(art.dataset.attackSourceId),
            sourceSequence: Number(art.dataset.attackSourceSequence),
            sourceTick: Number(art.dataset.attackSourceTick),
            tick: Number(art.dataset.simulationTick),
          } : null,
          source: {
            alive: source.alive,
            attackSequence: source.attack.attackSequence,
            archetypeId: source.archetypeId,
            delivery: source.delivery,
            id: source.id,
            hitpoints: source.hitpoints,
            side: source.side,
            sourceTick: source.spawnedAt + source.attack.nextAttackTick -
              source.attack.config.hitSpeedTicks,
          },
          sessionTick: state.tick,
        };
      }
      return null;
    });
    assert.ok(actualAttack, "the actual legal south Briar deployment lands a primary melee attack");
    assert.equal(actualAttack.source.archetypeId, "briar-runner");
    assert.equal(actualAttack.source.delivery, "melee");
    assert.equal(actualAttack.source.side, "south");
    assert.equal(actualAttack.attack.attackerId, actualAttack.source.id);
    assert.equal(actualAttack.attack.sequence, actualAttack.source.attackSequence);
    assert.equal(actualAttack.attack.tick, actualAttack.source.sourceTick);
    assert.equal(actualAttack.sessionTick - actualAttack.attack.tick, 1,
      "the live renderer starts from the first simulation age after primary contact");
    assert.equal(actualAttack.source.alive, true);
    assert.ok(actualAttack.source.hitpoints > 0,
      "the primary source is still alive when its contact frame is projected");
    assert.equal(actualAttack.damage.attackerId, actualAttack.attack.attackerId);
    assert.equal(actualAttack.damage.targetId, actualAttack.attack.targetId);
    assert.equal(actualAttack.damage.delivery, "melee");
    assert.equal(actualAttack.damage.tick, actualAttack.attack.tick);
    assert.equal(actualAttack.damage.currentHealthAfter, Math.max(0,
      actualAttack.damage.currentHealthBefore - actualAttack.damage.amount));
    assert.deepEqual(actualAttack.frame, {
      action: "attack",
      animationAge: 1,
      sourceClass: "melee",
      sourceId: actualAttack.attack.attackerId,
      sourceSequence: actualAttack.attack.sequence,
      sourceTick: actualAttack.attack.tick,
      tick: actualAttack.sessionTick,
    });
    await frame.locator('.combat-marker[data-kind="briar-runner"]').first().waitFor({
      state: "attached",
      timeout: 5_000,
    });
    const frameBox = await frameElement.boundingBox();
    assert.ok(frameBox && frameBox.width > 0 && frameBox.height > 0,
      `the real app-shell iframe is laid out: ${JSON.stringify(frameBox)}`);
    const live = await child.evaluate(async ({ actualAttack, scaleX, scaleY }) => {
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
          actorId: Number(marker.dataset.combatId),
          action: art?.dataset.spriteAction ?? null,
          attackAnimationAge: art?.dataset.attackAnimationAge ?? null,
          attackSourceClass: art?.dataset.attackSourceClass ?? null,
          attackSourceId: art?.dataset.attackSourceId ?? null,
          attackSourceSequence: art?.dataset.attackSourceSequence ?? null,
          attackSourceTick: art?.dataset.attackSourceTick ?? null,
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
        actualAttack,
        sessionTick: globalThis.__spriteRendererProbe.state.sessionTick,
        unitCount: globalThis.__spriteRendererProbe.session.state.battle.units.length,
      };
    }, { actualAttack, scaleX: frameBox.width / 720, scaleY: frameBox.height / 1280 });
    assert.ok(Math.abs(frameBox.width / 720 - frameBox.height / 1280) < 0.005,
      `app-shell scales the canonical battle frame uniformly: ${JSON.stringify(frameBox)}`);
    assert.ok(live.arena.width > 0 && live.arena.height > 0);
    assert.ok(live.markers.length > 0, "real GameSession deployment must render Briar Runner");
    assert.deepEqual([...new Set(live.markers.map(({ side }) => side))].sort(), ["north", "south"],
      "the real two-sided match must show painted Briar units for both teams");
    assert.deepEqual(live.actualAttack, actualAttack);
    const attackedMarker = live.markers.find(({ actorId }) =>
      actorId === actualAttack.attack.attackerId);
    assert.ok(attackedMarker);
    assert.equal(attackedMarker.action, "attack");
    assert.equal(Number(attackedMarker.attackAnimationAge), 1);
    assert.equal(attackedMarker.attackSourceClass, "melee");
    assert.equal(Number(attackedMarker.attackSourceId), actualAttack.attack.attackerId);
    assert.equal(Number(attackedMarker.attackSourceSequence), actualAttack.attack.sequence);
    assert.equal(Number(attackedMarker.attackSourceTick), actualAttack.attack.tick);
    assert.equal(attackedMarker.frame, selectBriarRunnerFrame({
      action: "attack",
      direction: attackedMarker.direction,
      tick: actualAttack.sessionTick - actualAttack.attack.tick,
    }).id);
    const phoneViewport = viewport.width === 390;
    for (const marker of live.markers) {
      assert.ok(Math.abs(marker.width - live.arena.sourceWidth * 0.048) < 0.02,
        `live marker ${marker.width}px must be 4.8% of arena content width ${live.arena.sourceWidth}px`);
      assert.ok(Math.abs(marker.height - live.arena.sourceWidth * 0.048) < 0.02);
      assert.ok(Math.abs(marker.displayedWidth - live.arena.displayedContentWidth * 0.048) < 0.02);
      assert.ok(Math.abs(marker.displayedHeight - live.arena.displayedContentWidth * 0.048) < 0.02);
      assert.equal(new URL(marker.asset, child.url()).pathname.endsWith(
        "/public/assets/briar-runner-painted-sheet.png"), true);
      assert.equal(marker.teamColorSide, marker.side);
      assert.equal(marker.teamColor, marker.side === "north" ? "#C6452E" : "#2E7F86");
      assert.equal(marker.teamColorFrontmost, true,
        "the painted sprite keeps its team-color baseplate above the atlas image");
      assert.ok(["walk", "attack"].includes(marker.action));
      assert.ok(["north", "east", "south", "west"].includes(marker.direction));
      assert.match(marker.frame, /^briar-(walk|attack)-(north|east|south|west)-[01]$/u);
      assert.equal(marker.tick, live.sessionTick);
    }
    const checkpoint = await child.evaluate(() => {
      const controller = globalThis.__spriteRendererProbe;
      const bytes = controller.serialize();
      const browser = JSON.parse(bytes);
      const audio = controller.audioDiagnostics;
      return {
        audio: {
          continuationBytes: controller.audioContinuationBytes,
          cursor: audio.cursor,
          eventCount: audio.eventCount,
          gainBasisPoints: audio.gainBasisPoints,
          muted: audio.muted,
          pcm: controller.audioScheduledPcm.map((observation) => ({ ...observation })),
          sessionTick: audio.sessionTick,
          suppressedAcceleratedCueCount: audio.suppressedAcceleratedCueCount,
          terminal: audio.terminal,
          uiCommandCount: audio.uiCommandCount,
          uiLastTick: audio.uiLastTick,
          uiSequence: audio.uiSequence,
        },
        bridgeBytes: browser.bridge,
        bytes,
        combat: document.querySelector('[data-game-browser-layer="combat"]').innerHTML,
        deliveries: JSON.parse(browser.bridge).deliveries,
        trustedPointers: [...globalThis.__art004TrustedPointers],
      };
    });
    assert.ok(checkpoint.trustedPointers.some(({ isTrusted, ui }) =>
      isTrusted && ui === "card-slot"),
    "the Briar card selection is submitted by a trusted player pointer");
    assert.ok(checkpoint.trustedPointers.some(({ isTrusted, ui }) =>
      isTrusted && ui === "arena"),
    "the Briar deployment point is submitted by a trusted player pointer");
    assert.equal(checkpoint.deliveries.length, 1,
      "the browser input bridge retains exactly the real player deployment");
    assert.deepEqual(checkpoint.deliveries[0].command, {
      cardId: "briar-band",
      commandId: 1,
      point: checkpoint.deliveries[0].command.point,
      slot: checkpoint.deliveries[0].command.slot,
      tick: checkpoint.deliveries[0].command.tick,
      type: "deploy",
    });
    assert.deepEqual(Object.keys(checkpoint.deliveries[0].command.point).sort(), ["x", "y"]);
    assert.ok(Number.isSafeInteger(checkpoint.deliveries[0].command.slot));
    assert.ok(Number.isSafeInteger(checkpoint.deliveries[0].command.tick));
    assert.ok(checkpoint.audio.continuationBytes.length > 0);
    assert.ok(checkpoint.audio.cursor > 0,
      "the audio continuation has consumed real session events before checkpointing");
    assert.equal(checkpoint.audio.sessionTick, live.sessionTick);
    const beforeRestoreScreenshot = await page.screenshot();
    writeFileSync(resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}-attack-contact.png`), beforeRestoreScreenshot);
    const screenScaleX = frameBox.width / 720;
    const screenScaleY = frameBox.height / 1280;

    const evolvedAttack = await child.evaluate(({ sourceId, sequence }) => {
      const controller = globalThis.__spriteRendererProbe;
      controller.stepMany(2);
      const state = controller.session.state;
      const source = state.battle.units.find((unit) => unit.id === sourceId);
      const marker = [...document.querySelectorAll(
        '.combat-marker[data-kind="briar-runner"]',
      )].find((candidate) => candidate.dataset.combatId === String(sourceId));
      const art = marker?.querySelector(".combat-art");
      return art ? {
        action: art.dataset.spriteAction,
        animationAge: art.dataset.attackAnimationAge ?? null,
        frame: art.dataset.spriteFrame,
        sourceClass: art.dataset.attackSourceClass ?? null,
        sourceId: art.dataset.attackSourceId === undefined
          ? null : Number(art.dataset.attackSourceId),
        sourceSequence: art.dataset.attackSourceSequence === undefined
          ? null : Number(art.dataset.attackSourceSequence),
        sourceTick: art.dataset.attackSourceTick === undefined
          ? null : Number(art.dataset.attackSourceTick),
        tick: Number(art.dataset.simulationTick),
        sequence,
        witness: source ? {
          alive: source.alive,
          attackSequence: source.attack.attackSequence,
          cyclePhase: source.attack.phase,
          hp: source.hitpoints,
          pose: marker.dataset.pose,
          sourceTick: source.spawnedAt + source.attack.nextAttackTick -
            source.attack.config.hitSpeedTicks,
          stateTick: state.tick,
          targetId: source.attack.targetId,
        } : null,
      } : null;
    }, { sourceId: actualAttack.attack.attackerId,
      sequence: actualAttack.attack.sequence });
    assert.ok(evolvedAttack);
    assert.equal(evolvedAttack.tick, live.sessionTick + 2,
      JSON.stringify(evolvedAttack));
    assert.equal(evolvedAttack.action, "walk");
    assert.equal(evolvedAttack.animationAge, null);
    assert.equal(evolvedAttack.sourceClass, null);
    assert.equal(evolvedAttack.sourceId, null);
    assert.equal(evolvedAttack.sourceSequence, null);
    assert.equal(evolvedAttack.sourceTick, null);
    assert.equal(evolvedAttack.witness.alive, true);
    assert.ok(evolvedAttack.witness.hp > 0);
    assert.equal(evolvedAttack.witness.attackSequence, actualAttack.attack.sequence);
    assert.equal(evolvedAttack.witness.cyclePhase, "winding");
    assert.equal(evolvedAttack.witness.pose, "idle");
    assert.notEqual(evolvedAttack.witness.targetId, actualAttack.attack.targetId,
      "the source has retargeted after its authentic lethal contact");
    assert.notEqual(evolvedAttack.witness.sourceTick, actualAttack.attack.tick,
      "the new cycle has no current attack pose to animate from the old contact");

    const teamReadability = await child.evaluate(({ sourceId, sequence }) => {
      const controller = globalThis.__spriteRendererProbe;
      controller.stepMany(6);
      const markers = [...document.querySelectorAll(
        '.combat-marker[data-kind="briar-runner"]',
      )].map((marker) => {
        const rect = marker.getBoundingClientRect();
        const art = marker.querySelector(".combat-art");
        const footring = art?.querySelector('[data-team-color]');
        return {
          actorId: Number(marker.dataset.combatId),
          color: footring?.getAttribute("fill") ?? null,
          height: rect.height,
          side: marker.classList.contains("combat-marker--north") ? "north" : "south",
          width: rect.width,
          x: rect.x,
          y: rect.y,
        };
      });
      const audio = controller.audioDiagnostics;
      return {
        audioContinuationBytes: controller.audioContinuationBytes,
        audioDiagnostics: {
          cursor: audio.cursor,
          eventCount: audio.eventCount,
          gainBasisPoints: audio.gainBasisPoints,
          muted: audio.muted,
          sessionTick: audio.sessionTick,
          suppressedAcceleratedCueCount: audio.suppressedAcceleratedCueCount,
          terminal: audio.terminal,
          uiCommandCount: audio.uiCommandCount,
          uiLastTick: audio.uiLastTick,
          uiSequence: audio.uiSequence,
        },
        audioPcm: controller.audioScheduledPcm.map((observation) => ({ ...observation })),
        browserBytes: controller.serialize(),
        contactOverlayVisible: [...document.querySelectorAll(".combat-melee-contact")]
          .some((node) => node.dataset.contactId === `${sourceId}:${sequence}`),
        markers,
        tick: controller.state.sessionTick,
      };
    }, { sourceId: actualAttack.attack.attackerId,
      sequence: actualAttack.attack.sequence });
    assert.equal(teamReadability.tick, live.sessionTick + 8);
    assert.equal(teamReadability.contactOverlayVisible, false,
      "the authentic contact star has expired before sampling team pixels");
    const teamReadabilityScreenshot = await page.screenshot();
    const screenshotMarkers = teamReadability.markers.map((marker) => ({
      actorId: marker.actorId,
      side: marker.side,
      color: marker.color,
      x: frameBox.x + marker.x * screenScaleX,
      y: frameBox.y + marker.y * screenScaleY,
      width: marker.width * screenScaleX,
      height: marker.height * screenScaleY,
    }));
    const teamPixelSamples = await sampleTeamPixelsFromScreenshot(
      page, teamReadabilityScreenshot, screenshotMarkers);
    writeFileSync(resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}-team-readability.png`),
    teamReadabilityScreenshot);
    writeFileSync(resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}-team-pixels.json`),
    `${JSON.stringify({ teamReadability, samples: teamPixelSamples }, null, 2)}\n`);
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
    const restored = await child.evaluate(({ bytes, expectedCombat }) => {
      const controller = globalThis.__spriteRendererProbe;
      controller.restore(bytes);
      controller.enterManualStepMode();
      const after = document.querySelector('[data-game-browser-layer="combat"]').innerHTML;
      const browserBytes = controller.serialize();
      const browser = JSON.parse(browserBytes);
      const audio = controller.audioDiagnostics;
      return {
        audio: {
          continuationBytes: controller.audioContinuationBytes,
          cursor: audio.cursor,
          eventCount: audio.eventCount,
          gainBasisPoints: audio.gainBasisPoints,
          muted: audio.muted,
          pcm: controller.audioScheduledPcm.map((observation) => ({ ...observation })),
          sessionTick: audio.sessionTick,
          suppressedAcceleratedCueCount: audio.suppressedAcceleratedCueCount,
          terminal: audio.terminal,
          uiCommandCount: audio.uiCommandCount,
          uiLastTick: audio.uiLastTick,
          uiSequence: audio.uiSequence,
        },
        bridgeBytes: browser.bridge,
        browserBytes,
        identical: expectedCombat === after,
        tick: controller.state.sessionTick,
      };
    }, { bytes: checkpoint.bytes, expectedCombat: checkpoint.combat });
    assert.equal(restored.identical, true);
    assert.equal(restored.tick, live.sessionTick);
    assert.equal(restored.browserBytes, checkpoint.bytes,
      "production restore preserves the exact browser, session, and typed command snapshot");
    assert.equal(restored.bridgeBytes, checkpoint.bridgeBytes,
      "the trusted typed deployment remains in the restored input bridge");
    assert.equal(restored.audio.continuationBytes, checkpoint.audio.continuationBytes,
      "restore reproduces the exact deterministic audio continuation bytes");
    assert.deepEqual(audioContinuationFacts(restored.audio), audioContinuationFacts(checkpoint.audio),
      "restore reproduces the checkpoint audio cursor and stable diagnostics exactly");
    assert.deepEqual(teamReadability.audioPcm.slice(0, checkpoint.audio.pcm.length),
      checkpoint.audio.pcm,
      "advancing after the checkpoint keeps its already scheduled PCM receipts as an exact prefix");
    assert.deepEqual(restored.audio.pcm, teamReadability.audioPcm,
      "restore leaves the complete already scheduled typed PCM receipt history unchanged");
    const afterRestoreScreenshot = await page.screenshot();
    assert.deepEqual(afterRestoreScreenshot, beforeRestoreScreenshot,
      "the real scaled battle screenshot must restore pixel-identically");
    const screenshotSha256 = createHash("sha256").update(beforeRestoreScreenshot).digest("hex");
    writeFileSync(resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}-before-restore.png`), beforeRestoreScreenshot);
    writeFileSync(resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}-after-restore.png`), afterRestoreScreenshot);

    const replayedAudio = await child.evaluate(() => {
      const controller = globalThis.__spriteRendererProbe;
      controller.stepMany(2);
      controller.stepMany(6);
      const audio = controller.audioDiagnostics;
      return {
        audioContinuationBytes: controller.audioContinuationBytes,
        audioDiagnostics: {
          cursor: audio.cursor,
          eventCount: audio.eventCount,
          gainBasisPoints: audio.gainBasisPoints,
          muted: audio.muted,
          sessionTick: audio.sessionTick,
          suppressedAcceleratedCueCount: audio.suppressedAcceleratedCueCount,
          terminal: audio.terminal,
          uiCommandCount: audio.uiCommandCount,
          uiLastTick: audio.uiLastTick,
          uiSequence: audio.uiSequence,
        },
        audioPcm: controller.audioScheduledPcm.map((observation) => ({ ...observation })),
        browserBytes: controller.serialize(),
        tick: controller.state.sessionTick,
      };
    });
    assert.equal(replayedAudio.tick, teamReadability.tick);
    assert.equal(replayedAudio.browserBytes, teamReadability.browserBytes,
      "restoring and replaying the same ticks reproduces the exact browser continuation bytes");
    assert.equal(replayedAudio.audioContinuationBytes, teamReadability.audioContinuationBytes,
      "restoring and replaying reproduces the exact audio continuation bytes");
    assert.deepEqual(audioContinuationFacts(replayedAudio.audioDiagnostics),
      audioContinuationFacts(teamReadability.audioDiagnostics),
      "restoring and replaying reproduces the stable audio cursor and diagnostics");
    const expectedAudioTail = pcmContinuationProof(
      teamReadability.audioPcm.slice(checkpoint.audio.pcm.length));
    const replayedAudioTail = pcmContinuationProof(
      replayedAudio.audioPcm.slice(teamReadability.audioPcm.length));
    assert.deepEqual(replayedAudioTail, expectedAudioTail,
      "restored future ticks produce the exact typed cue and PCM waveform-hash suffix");

    const audioRestoreProof = {
      checkpoint: {
        audioContinuationBytes: checkpoint.audio.continuationBytes,
        audioContinuationSha256: createHash("sha256")
          .update(checkpoint.audio.continuationBytes).digest("hex"),
        diagnostics: audioContinuationFacts(checkpoint.audio),
        pcmReceiptCount: checkpoint.audio.pcm.length,
        pcmReceipts: checkpoint.audio.pcm,
        pcmReceiptsSha256: sha256Canonical(checkpoint.audio.pcm),
      },
      beforeRestore: {
        audioContinuationBytes: teamReadability.audioContinuationBytes,
        diagnostics: audioContinuationFacts(teamReadability.audioDiagnostics),
        pcmReceiptCount: teamReadability.audioPcm.length,
        pcmReceipts: teamReadability.audioPcm,
        pcmReceiptsSha256: sha256Canonical(teamReadability.audioPcm),
      },
      afterRestore: {
        audioContinuationBytes: restored.audio.continuationBytes,
        diagnostics: audioContinuationFacts(restored.audio),
        pcmReceiptCount: restored.audio.pcm.length,
        pcmReceipts: restored.audio.pcm,
        pcmReceiptsSha256: sha256Canonical(restored.audio.pcm),
      },
      replayed: {
        audioContinuationBytes: replayedAudio.audioContinuationBytes,
        diagnostics: audioContinuationFacts(replayedAudio.audioDiagnostics),
        pcmReceiptCount: replayedAudio.audioPcm.length,
        pcmReceipts: replayedAudio.audioPcm,
        pcmReceiptsSha256: sha256Canonical(replayedAudio.audioPcm),
        pcmContinuationTail: replayedAudioTail,
        pcmContinuationTailSha256: sha256Canonical(replayedAudioTail),
        expectedPcmContinuationTail: expectedAudioTail,
        expectedPcmContinuationTailSha256: sha256Canonical(expectedAudioTail),
      },
    };
    writeFileSync(resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}-audio-restore.json`),
    `${JSON.stringify(audioRestoreProof, null, 2)}\n`);

    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedMotionState = await child.evaluate(({ bytes, sourceId }) => {
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
        attack: (() => {
          const marker = [...document.querySelectorAll(
            '.combat-marker[data-kind="briar-runner"]',
          )].find((candidate) => candidate.dataset.combatId === String(sourceId));
          const node = marker?.querySelector(".combat-art");
          return node ? {
            action: node.dataset.spriteAction,
            animationAge: Number(node.dataset.attackAnimationAge),
            frame: node.dataset.spriteFrame,
            reducedMotion: node.dataset.reducedMotion,
            sourceClass: node.dataset.attackSourceClass,
            sourceId: Number(node.dataset.attackSourceId),
            sourceSequence: Number(node.dataset.attackSourceSequence),
            sourceTick: Number(node.dataset.attackSourceTick),
            tick: Number(node.dataset.simulationTick),
          } : null;
        })(),
        tick: controller.state.sessionTick,
      };
    }, { bytes: checkpoint.bytes, sourceId: actualAttack.attack.attackerId });
    assert.equal(reducedMotionState.mediaReducedMotion, true);
    assert.equal(reducedMotionState.tick, live.sessionTick);
    assert.ok(reducedMotionState.sprites.length > 0);
    for (const sprite of reducedMotionState.sprites) {
      assert.equal(sprite.reducedMotion, "true");
      assert.ok(sprite.frame.endsWith("-0"), `reduced motion frame ${sprite.frame}`);
      assert.equal(sprite.teamColor, sprite.side === "north" ? "#C6452E" : "#2E7F86");
    }
    assert.deepEqual(reducedMotionState.attack, {
      action: "attack",
      animationAge: 1,
      frame: selectBriarRunnerFrame({
        action: "attack",
        direction: attackedMarker.direction,
        reducedMotion: true,
        tick: 1,
      }).id,
      reducedMotion: "true",
      sourceClass: "melee",
      sourceId: actualAttack.attack.attackerId,
      sourceSequence: actualAttack.attack.sequence,
      sourceTick: actualAttack.attack.tick,
      tick: live.sessionTick,
    });
    const reducedHold = await child.evaluate(({ sourceId }) => {
      const controller = globalThis.__spriteRendererProbe;
      controller.stepMany(2);
      const marker = [...document.querySelectorAll(
        '.combat-marker[data-kind="briar-runner"]',
      )].find((candidate) => candidate.dataset.combatId === String(sourceId));
      const art = marker?.querySelector(".combat-art");
      return art ? {
        action: art.dataset.spriteAction,
        animationAge: art.dataset.attackAnimationAge ?? null,
        frame: art.dataset.spriteFrame,
        reducedMotion: art.dataset.reducedMotion,
        sourceId: art.dataset.attackSourceId === undefined
          ? null : Number(art.dataset.attackSourceId),
        sourceSequence: art.dataset.attackSourceSequence === undefined
          ? null : Number(art.dataset.attackSourceSequence),
        sourceTick: art.dataset.attackSourceTick === undefined
          ? null : Number(art.dataset.attackSourceTick),
        tick: Number(art.dataset.simulationTick),
      } : null;
    }, { sourceId: actualAttack.attack.attackerId });
    assert.deepEqual(reducedHold, {
      action: "walk",
      animationAge: null,
      frame: selectBriarRunnerFrame({
        action: "walk",
        direction: attackedMarker.direction,
        reducedMotion: true,
        tick: live.sessionTick + 2,
      }).id,
      reducedMotion: "true",
      sourceId: null,
      sourceSequence: null,
      sourceTick: null,
      tick: live.sessionTick + 2,
    });
    const beforeReducedChild = await frame.locator("body").screenshot();
    const beforeReducedFingerprint = await reducedRestorePaintFingerprint(page, child,
      { x: 105, y: 700 });
    const beforeReducedMotion = await page.screenshot();
    const reducedCheckpoint = await child.evaluate(() =>
      globalThis.__spriteRendererProbe.serialize());
    await child.evaluate((bytes) => {
      const controller = globalThis.__spriteRendererProbe;
      controller.stepMany(1);
      controller.restore(bytes);
      controller.enterManualStepMode();
    }, reducedCheckpoint);
    const afterReducedChild = await frame.locator("body").screenshot();
    const afterReducedFingerprint = await reducedRestorePaintFingerprint(page, child,
      { x: 105, y: 700 });
    const afterReducedMotion = await page.screenshot();
    const reducedMotionPixelDiagnostics = await compareScreenshotsAtPoint(
      page,
      beforeReducedMotion,
      afterReducedMotion,
      { x: 105, y: 700 },
    );
    const reducedMotionPaintDiagnostics = {
      after: afterReducedFingerprint,
      afterChildBodySha256: createHash("sha256").update(afterReducedChild).digest("hex"),
      before: beforeReducedFingerprint,
      beforeChildBodySha256: createHash("sha256").update(beforeReducedChild).digest("hex"),
      childBodyPixelIdentical: beforeReducedChild.equals(afterReducedChild),
      domAndStyleIdentical: JSON.stringify(beforeReducedFingerprint) ===
        JSON.stringify(afterReducedFingerprint),
      viewportPixelIdentical: beforeReducedMotion.equals(afterReducedMotion),
      viewportSha256Before: createHash("sha256").update(beforeReducedMotion).digest("hex"),
      viewportSha256After: createHash("sha256").update(afterReducedMotion).digest("hex"),
      pointDiff: reducedMotionPixelDiagnostics,
    };
    writeFileSync(resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}-reduced-motion.png`), beforeReducedMotion);
    writeFileSync(resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}-reduced-motion-after-restore.png`),
    afterReducedMotion);
    writeFileSync(resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}-reduced-motion-diagnostics.json`),
    `${JSON.stringify(reducedMotionPixelDiagnostics, null, 2)}\n`);
    writeFileSync(resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}-reduced-motion-paint-diagnostics.json`),
    `${JSON.stringify(reducedMotionPaintDiagnostics, null, 2)}\n`);
    writeFileSync(resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}-reduced-motion-child-before.png`),
    beforeReducedChild);
    writeFileSync(resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}-reduced-motion-child-after.png`),
    afterReducedChild);
    assert.deepEqual(afterReducedMotion, beforeReducedMotion,
      "the real scaled battle screenshot with reduced motion must restore pixel-identically");
    const reducedMotionSha256 = createHash("sha256").update(beforeReducedMotion).digest("hex");
    await page.screenshot({ path: resolve(ARTIFACTS,
      `live-arena-integration-${viewport.width}.png`) });
    evidence.liveArenaIntegration.push({
      actualAttack,
      audioRestore: {
        checkpointContinuationSha256: audioRestoreProof.checkpoint.audioContinuationSha256,
        checkpointPcmReceiptCount: audioRestoreProof.checkpoint.pcmReceiptCount,
        checkpointPcmReceiptsSha256: audioRestoreProof.checkpoint.pcmReceiptsSha256,
        afterRestorePcmReceiptCount: audioRestoreProof.afterRestore.pcmReceiptCount,
        afterRestorePcmReceiptsSha256: audioRestoreProof.afterRestore.pcmReceiptsSha256,
        replayedPcmReceiptCount: audioRestoreProof.replayed.pcmReceiptCount,
        replayedPcmReceiptsSha256: audioRestoreProof.replayed.pcmReceiptsSha256,
        replayedPcmContinuationTailSha256: audioRestoreProof.replayed.pcmContinuationTailSha256,
      },
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
        paintDiagnostics: reducedMotionPaintDiagnostics,
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
