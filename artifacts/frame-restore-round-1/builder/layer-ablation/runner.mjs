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
const OUTPUT = resolve("/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/frame-restore-round-1/builder/layer-ablation");
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DECK = ["skymaul", "brassbolt", "reedsting", "briar-band",
  "cinderlings", "coilblade", "mossguard", "copperskiff"];
const MIME = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml" };

async function startStaticServer() {
  const missingPaths = [];
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
    if (pathname === "/favicon.ico") return response.writeHead(204).end();
    const file = resolve(ROOT, `.${pathname}`);
    if (file !== ROOT && !file.startsWith(`${ROOT}${sep}`))
      return response.writeHead(403).end();
    try {
      const bytes = await readFile(file);
      response.writeHead(200, { "Cache-Control": "no-store",
        "Content-Length": bytes.length,
        "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff" }).end(bytes);
    } catch {
      missingPaths.push(pathname);
      response.writeHead(404).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { missingPaths, url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolveClose, reject) =>
      server.close((error) => error ? reject(error) : resolveClose())) };
}

async function waitForPaintFrames(page, child) {
  const next = () => new Promise((resolveFrame) =>
    requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
  await Promise.all([page.evaluate(next), child.evaluate(next)]);
  await page.evaluate(next);
}

async function stableViewportScreenshot(page, child) {
  await Promise.all([
    page.evaluate(() => document.fonts.ready),
    child.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) =>
        image.decode().catch(() => undefined)));
    }),
  ]);
  let previous = null;
  for (let captures = 1; captures <= 8; captures += 1) {
    await waitForPaintFrames(page, child);
    const screenshot = await page.screenshot();
    if (previous !== null && screenshot.equals(previous))
      return { captures, screenshot, stable: true };
    previous = screenshot;
  }
  return { captures: 8, screenshot: previous, stable: false };
}

async function fingerprint(page, child) {
  const outer = await page.evaluate(() => {
    const frame = document.querySelector("[data-battle-frame-slot] iframe");
    const rect = frame?.getBoundingClientRect();
    return {
      activeElement: document.activeElement ? {
        tag: document.activeElement.tagName,
        className: typeof document.activeElement.className === "string"
          ? document.activeElement.className : null,
      } : null,
      frameRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      nav: [...document.querySelectorAll(".app-nav [data-nav-to]")].map((node) => ({
        target: node.dataset.navTo, ariaCurrent: node.getAttribute("aria-current"),
        className: node.className,
      })),
      scroll: { x: scrollX, y: scrollY },
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    };
  });
  const inner = await child.evaluate(() => {
    const controller = globalThis.__spriteRendererProbe;
    const card = document.querySelector('[data-ui="card-slot"][data-card-id="brassbolt"]');
    const audio = document.querySelector('[data-ui="audio-toggle"]');
    const styleOf = (node) => {
      if (!node) return null;
      const computed = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        offset: { width: node.offsetWidth, height: node.offsetHeight },
        transform: computed.transform,
        willChange: computed.willChange,
        boxShadow: computed.boxShadow,
        backgroundColor: computed.backgroundColor,
        borderColor: computed.borderColor,
        borderWidth: computed.borderWidth,
        borderStyle: computed.borderStyle,
        transitionProperty: computed.transitionProperty,
        transitionDuration: computed.transitionDuration,
        animationName: computed.animationName,
        animationDuration: computed.animationDuration,
      };
    };
    const pseudo = (node, selector) => {
      if (!node) return null;
      const computed = getComputedStyle(node, selector);
      return Object.fromEntries(["content", "background-color", "border-color",
        "box-shadow", "transform", "animation-name", "transition-duration"]
        .map((key) => [key, computed.getPropertyValue(key)]));
    };
    const controls = [...document.querySelectorAll("button,input,select")].map((node) => ({
      tag: node.tagName, type: node.getAttribute("type"),
      ui: node.dataset.ui ?? null, cardId: node.dataset.cardId ?? null,
      name: node.getAttribute("name"), value: "value" in node ? node.value : null,
      text: node.textContent?.trim() ?? "", checked: "checked" in node ? node.checked : null,
      pressed: node.getAttribute("aria-pressed"), label: node.getAttribute("aria-label"),
      disabled: node.disabled, selected: node.dataset.selected ?? null,
      focused: node === document.activeElement, hovered: node.matches(":hover"),
    }));
    const serialized = controller.serialize();
    const combat = document.querySelector('[data-game-browser-layer="combat"]');
    return {
      tick: controller.state.sessionTick,
      controllerState: controller.state,
      serialized,
      serializedSha256: null,
      fonts: document.fonts.status,
      mediaReducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      activeElement: document.activeElement ? {
        tag: document.activeElement.tagName,
        id: document.activeElement.id,
        cardId: document.activeElement.dataset?.cardId ?? null,
        className: typeof document.activeElement.className === "string"
          ? document.activeElement.className : null,
      } : null,
      card: card ? {
        html: card.outerHTML, text: card.textContent,
        attributes: [...card.attributes].map(({ name, value }) => [name, value]),
        focus: card.matches(":focus"), focusVisible: card.matches(":focus-visible"),
        hover: card.matches(":hover"), style: styleOf(card), parentStyle: styleOf(card.parentElement),
        before: pseudo(card, "::before"), after: pseudo(card, "::after"),
      } : null,
      allCardSlots: [...document.querySelectorAll(".card-slot")].map((node) => ({
        cardId: node.dataset.cardId ?? null, style: styleOf(node),
        focus: node.matches(":focus"), hover: node.matches(":hover"),
      })),
      audio: audio ? { text: audio.textContent.trim(), pressed: audio.getAttribute("aria-pressed"),
        label: audio.getAttribute("aria-label"), html: audio.outerHTML } : null,
      controls,
      combatHtmlSha256: null,
      activeAnimations: document.getAnimations({ subtree: true }).map((animation) => ({
        playState: animation.playState,
        target: animation.effect?.target?.className?.baseVal ??
          animation.effect?.target?.className ?? animation.effect?.target?.tagName ?? null,
        name: animation.animationName ?? null,
      })),
      missingCombatLayer: !combat,
    };
  });
  const bytes = Buffer.from(inner.serialized);
  const combatHtml = await child.locator('[data-game-browser-layer="combat"]').evaluate((node) => node.innerHTML);
  inner.serializedSha256 = createHash("sha256").update(bytes).digest("hex");
  inner.combatHtmlSha256 = createHash("sha256").update(combatHtml).digest("hex");
  delete inner.serialized;
  return { outer, inner };
}

async function pixelDiff(page, first, second) {
  return page.evaluate(async ({ a, b }) => {
    const decode = async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return { width: canvas.width, height: canvas.height,
        pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
    };
    const one = await decode(a), two = await decode(b);
    let count = 0, max = 0, minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    const firstPixels = [];
    for (let p = 0; p < Math.min(one.pixels.length, two.pixels.length); p += 4) {
      let delta = 0;
      for (let c = 0; c < 4; c += 1) delta = Math.max(delta,
        Math.abs(one.pixels[p + c] - two.pixels[p + c]));
      if (!delta) continue;
      const i = p / 4, x = i % one.width, y = Math.floor(i / one.width);
      count += 1; max = Math.max(max, delta);
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      if (firstPixels.length < 32) firstPixels.push({ x, y,
        before: [...one.pixels.slice(p, p + 4)], after: [...two.pixels.slice(p, p + 4)] });
    }
    return { dimensions: [one.width, one.height], differingPixelCount: count,
      maximumChannelDelta: max, boundingBox: count ? { minX, minY, maxX, maxY } : null,
      firstDifferingPixels: firstPixels };
  }, { a: first.toString("base64"), b: second.toString("base64") });
}

test("FRAME-RESTORE001: one reduced-motion baseline restore and one card-layer ablation", {
  timeout: 90_000,
}, async (t) => {
  mkdirSync(OUTPUT, { recursive: true });
  const server = await startStaticServer();
  t.after(() => server.close());
  const browser = await chromium.launch({
    executablePath: existsSync(CHROME) ? CHROME : undefined, headless: true,
  });
  t.after(() => browser.close());
  const page = await browser.newPage({
    deviceScaleFactor: 1, viewport: { width: 390, height: 844 },
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto(`${server.url}/public/index.html`, { waitUntil: "networkidle" });
  assert.equal(response.status(), 200);
  await page.locator('.app-nav [data-nav-to="battle"]').click();
  const frameElement = page.locator("[data-battle-frame-slot] iframe");
  await frameElement.waitFor({ state: "attached" });
  const frame = frameElement.contentFrame();
  await frame.locator('[data-ui="arena"]').waitFor({ state: "visible", timeout: 8_000 });
  const child = page.frames().find((candidate) => candidate.url().includes("app-frame=1"));
  assert.ok(child, "real same-origin app battle iframe mounted");
  const boot = await child.evaluate(async (deck) => {
    const { arenaHudController: controller } = await import("/src/ui/arena-shell-entry.js");
    globalThis.__spriteRendererProbe = controller;
    const wasRunning = !controller.state.paused;
    if (wasRunning) controller.pause();
    controller.replaceDeck(deck);
    const resumed = controller.state.paused ? controller.resume() : false;
    const manual = controller.enterManualStepMode();
    return { deck: JSON.parse(controller.session.serialize()).setup.deck,
      pausedBeforeSetup: !wasRunning, resumed, manual, running: !controller.state.paused };
  }, DECK);
  assert.deepEqual(boot.deck, DECK);
  assert.equal(boot.pausedBeforeSetup, false);
  assert.equal(boot.manual, true);
  assert.equal(boot.running, true);

  await frame.locator('[data-ui="card-slot"][data-card-id="briar-band"]').click();
  const arena = frame.locator('[data-ui="arena"]');
  const arenaRect = await arena.boundingBox();
  assert.ok(arenaRect && arenaRect.width > 0 && arenaRect.height > 0);
  await page.mouse.click(arenaRect.x + arenaRect.width / 2,
    arenaRect.y + arenaRect.height * 0.54);
  const attack = await child.evaluate(() => {
    const controller = globalThis.__spriteRendererProbe;
    for (let n = 0; n < 600; n += 1) {
      const prior = controller.session.state;
      const events = controller.stepMany(1);
      const state = controller.session.state;
      const priorUnits = new Map(prior.battle.units.map((unit) => [unit.id, unit]));
      const hit = events.find((event) => event.type === "attack" &&
        priorUnits.get(event.attackerId)?.archetypeId === "briar-runner" &&
        priorUnits.get(event.attackerId)?.side === "south");
      if (!hit) continue;
      const damage = events.find((event) => event.type === "damage" &&
        event.attackerId === hit.attackerId && event.targetId === hit.targetId &&
        event.delivery === "melee" && event.tick === hit.tick);
      const source = state.battle.units.find((unit) => unit.id === hit.attackerId);
      if (!damage || !source) continue;
      const marker = [...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')]
        .find((node) => node.dataset.combatId === String(hit.attackerId));
      const art = marker?.querySelector(".combat-art");
      return {
        attack: { attackerId: hit.attackerId, sequence: hit.sequence,
          targetId: hit.targetId, tick: hit.tick },
        damage: { amount: damage.amount, currentHealthBefore: damage.currentHealthBefore,
          currentHealthAfter: damage.currentHealthAfter, delivery: damage.delivery,
          targetId: damage.targetId, tick: damage.tick },
        source: { id: source.id, side: source.side, archetypeId: source.archetypeId,
          delivery: source.delivery, alive: source.alive, hitpoints: source.hitpoints,
          attackSequence: source.attack.attackSequence },
        frame: art ? { action: art.dataset.spriteAction,
          animationAge: Number(art.dataset.attackAnimationAge),
          sourceClass: art.dataset.attackSourceClass ?? null,
          sourceId: Number(art.dataset.attackSourceId),
          sourceSequence: Number(art.dataset.attackSourceSequence),
          sourceTick: Number(art.dataset.attackSourceTick),
          tick: Number(art.dataset.simulationTick),
          reducedMotion: art.dataset.reducedMotion } : null,
        sessionTick: controller.state.sessionTick,
      };
    }
    return null;
  });
  assert.ok(attack, "legal Briar deployment produced a real melee contact");
  assert.equal(attack.attack.tick, 170, "reproduce the known melee contact tick");
  assert.equal(attack.sessionTick, 171, "render the first age after tick-170 contact");
  assert.equal(attack.sessionTick - attack.attack.tick, 1);
  assert.equal(attack.source.archetypeId, "briar-runner");
  assert.equal(attack.source.side, "south");
  assert.equal(attack.damage.delivery, "melee");
  assert.equal(attack.frame.animationAge, 1);
  assert.equal(attack.frame.reducedMotion, "true");

  const frameBox = await frameElement.boundingBox();
  assert.ok(frameBox && frameBox.width > 0 && frameBox.height > 0);
  const checkpoint = await child.evaluate(() => ({
    bytes: globalThis.__spriteRendererProbe.serialize(),
    tick: globalThis.__spriteRendererProbe.state.sessionTick,
  }));
  assert.equal(checkpoint.tick, 171, "the rendered checkpoint is one tick after contact");
  const preFingerprint = await fingerprint(page, child);
  const preCapture = await stableViewportScreenshot(page, child);
  writeFileSync(resolve(OUTPUT, "baseline-before-restore-390x844.png"), preCapture.screenshot);

  await child.evaluate((bytes) => {
    const controller = globalThis.__spriteRendererProbe;
    controller.stepMany(1);
    controller.restore(bytes);
    controller.enterManualStepMode();
  }, checkpoint.bytes);
  await waitForPaintFrames(page, child);
  const baselineFingerprint = await fingerprint(page, child);
  const baselineCapture = await stableViewportScreenshot(page, child);
  writeFileSync(resolve(OUTPUT, "baseline-after-restore-390x844.png"), baselineCapture.screenshot);

  await child.addStyleTag({ content: ".card-slot{transform:none!important}" });
  await child.evaluate((bytes) => {
    const controller = globalThis.__spriteRendererProbe;
    controller.stepMany(1);
    controller.restore(bytes);
    controller.enterManualStepMode();
  }, checkpoint.bytes);
  await waitForPaintFrames(page, child);
  const ablationFingerprint = await fingerprint(page, child);
  const ablationCapture = await stableViewportScreenshot(page, child);
  writeFileSync(resolve(OUTPUT, "layer-ablation-after-restore-390x844.png"), ablationCapture.screenshot);

  const baselineRestoreDiff = await pixelDiff(page, preCapture.screenshot,
    baselineCapture.screenshot);
  const ablationVsBaselineDiff = await pixelDiff(page, baselineCapture.screenshot,
    ablationCapture.screenshot);
  const report = {
    diagnostic: "FRAME-RESTORE001",
    candidateCommit: "8983794bdba940cc8232bdfe1d6181a823776916",
    privateCheckout: ROOT,
    viewport: { width: 390, height: 844, deviceScaleFactor: 1 },
    pageFrame: frameBox,
    emulatedReducedMotion: true,
    baselineAndAblationUsedSamePage: true,
    restoreCount: { baseline: 1, ablation: 1 },
    checkpointSha256: createHash("sha256").update(checkpoint.bytes).digest("hex"),
    checkpointTick: checkpoint.tick,
    actualAttack: attack,
    stableCaptures: {
      beforeBaseline: { stable: preCapture.stable, count: preCapture.captures },
      afterBaseline: { stable: baselineCapture.stable, count: baselineCapture.captures },
      afterAblation: { stable: ablationCapture.stable, count: ablationCapture.captures },
    },
    baselineRestoreDiff,
    ablationVsBaselineDiff,
    fingerprints: {
      beforeBaseline: preFingerprint,
      afterBaseline: baselineFingerprint,
      afterAblation: ablationFingerprint,
    },
    invariants: {
      baselineStateMatchesCheckpoint:
        baselineFingerprint.inner.serializedSha256 === createHash("sha256").update(checkpoint.bytes).digest("hex"),
      ablationStateMatchesCheckpoint:
        ablationFingerprint.inner.serializedSha256 === createHash("sha256").update(checkpoint.bytes).digest("hex"),
      stateBytesEqualBeforeAndAfterAblation:
        baselineFingerprint.inner.serializedSha256 === ablationFingerprint.inner.serializedSha256,
      cardGeometryEqual:
        JSON.stringify(baselineFingerprint.inner.card?.style.rect) ===
        JSON.stringify(ablationFingerprint.inner.card?.style.rect),
      allCardGeometryEqual:
        JSON.stringify(baselineFingerprint.inner.allCardSlots.map(({ cardId, style }) =>
          [cardId, style.rect, style.offset])) ===
        JSON.stringify(ablationFingerprint.inner.allCardSlots.map(({ cardId, style }) =>
          [cardId, style.rect, style.offset])),
      inputAndAudioEqual:
        JSON.stringify({ controls: baselineFingerprint.inner.controls,
          audio: baselineFingerprint.inner.audio }) ===
        JSON.stringify({ controls: ablationFingerprint.inner.controls,
          audio: ablationFingerprint.inner.audio }),
      onlyTargetTransformExpected:
        baselineFingerprint.inner.card?.style.transform !==
        ablationFingerprint.inner.card?.style.transform,
      baselineCardTransform: baselineFingerprint.inner.card?.style.transform ?? null,
      ablationCardTransform: ablationFingerprint.inner.card?.style.transform ?? null,
    },
    server404s: server.missingPaths,
  };
  writeFileSync(resolve(OUTPUT, "frame-restore-001-evidence.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  assert.deepEqual(server.missingPaths, [], "no unexpected app asset requests failed");
  console.log(JSON.stringify({ diagnostic: report.diagnostic,
    resultFile: resolve(OUTPUT, "frame-restore-001-evidence.json"),
    baselineRestoreDiff, ablationVsBaselineDiff, invariants: report.invariants }, null, 2));
  await page.close();
});
