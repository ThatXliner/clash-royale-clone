import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import test from "node:test";

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = new URL("../artifacts/visual-003h-round-1/", import.meta.url).pathname;

async function line(stream) {
  let value = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    value += chunk;
    const end = value.indexOf("\n");
    if (end >= 0) return value.slice(0, end);
  }
  throw new Error("browser-frame-restore server exited before readiness");
}

async function click(page, selector, offset = null) {
  const box = await page.locator(selector).first().boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, `${selector} must be visible`);
  await page.mouse.click(box.x + (offset?.x ?? box.width / 2),
    box.y + (offset?.y ?? box.height / 2));
}

async function settleBrowserPaint(page) {
  await page.evaluate(() => new Promise((resolve) => {
    window.__nativePaintFrame(() => window.__nativePaintFrame(resolve));
  }));
}

async function stateBytes(page) {
  return page.evaluate(() => {
    const controller = globalThis.__frameRestoreController;
    const controllerState = controller.state;
    const layers = ["combat", "effects", "feedback", "hud"].map((name) => [
      name,
      document.querySelector(`[data-game-browser-layer="${name}"]`).innerHTML,
    ]);
    const slots = [...document.querySelectorAll('[data-ui="card-slot"]')]
      .map((node) => node.outerHTML);
    return {
      arenaHtml: document.querySelector('[data-ui="arena"]').innerHTML,
      browserBytes: controller.serialize(),
      hudHtml: document.querySelector('[data-game-browser-layer="hud"]').innerHTML,
      inputHtml: JSON.stringify(slots),
      layers,
      running: controllerState.running,
      sessionBytes: controller.session.serialize(),
      sessionTick: controller.session.state.tick,
    };
  });
}

async function comparePngPixels(page, left, right) {
  return page.evaluate(async ([leftBase64, rightBase64]) => {
    const read = async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      return { data: context.getImageData(0, 0, canvas.width, canvas.height).data,
        height: canvas.height, width: canvas.width };
    };
    const [a, b] = await Promise.all([read(leftBase64), read(rightBase64)]);
    if (a.width !== b.width || a.height !== b.height) {
      return { changedPixels: a.width * a.height, height: a.height,
        maxChannelDelta: 255, width: a.width };
    }
    let changedPixels = 0;
    let maxChannelDelta = 0;
    for (let offset = 0; offset < a.data.length; offset += 4) {
      const delta = Math.max(Math.abs(a.data[offset] - b.data[offset]),
        Math.abs(a.data[offset + 1] - b.data[offset + 1]),
        Math.abs(a.data[offset + 2] - b.data[offset + 2]));
      if (delta > 0) changedPixels += 1;
      maxChannelDelta = Math.max(maxChannelDelta, delta);
    }
    return { changedPixels, height: a.height, maxChannelDelta, width: a.width };
  }, [left.toString("base64"), right.toString("base64")]);
}

async function captureRestoreWitness(page, label, artifactName) {
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const checkpointState = await stateBytes(page);
  await settleBrowserPaint(page);
  const checkpointPng = await page.screenshot({
    path: `${ARTIFACTS}${artifactName}-checkpoint.png`,
  });
  const repeatPng = await page.screenshot();
  const repeatedState = await stateBytes(page);

  await page.evaluate(() => {
    const controller = globalThis.__frameRestoreController;
    controller.stepMany(2);
    controller.restore(globalThis.__frameRestoreSnapshot);
  });
  await settleBrowserPaint(page);
  const restoredState = await stateBytes(page);
  const restoredPng = await page.screenshot({
    path: `${ARTIFACTS}${artifactName}-restored.png`,
  });
  const report = {
    checkpointSha256: hash(checkpointPng),
    consecutiveSha256: hash(repeatPng),
    consecutivePixelDelta: await comparePngPixels(page, checkpointPng, repeatPng),
    exactBrowserState: restoredState.browserBytes === checkpointState.browserBytes,
    exactSessionState: restoredState.sessionBytes === checkpointState.sessionBytes,
    exactConsecutiveState: JSON.stringify(repeatedState) === JSON.stringify(checkpointState),
    frozenTick: checkpointState.running === false &&
      repeatedState.sessionTick === checkpointState.sessionTick,
    exactArenaDom: restoredState.arenaHtml === checkpointState.arenaHtml,
    exactLayerDom: JSON.stringify(restoredState.layers) ===
      JSON.stringify(checkpointState.layers),
    exactHud: restoredState.hudHtml === checkpointState.hudHtml,
    exactInput: restoredState.inputHtml === checkpointState.inputHtml,
    label,
    restoreSha256: hash(restoredPng),
    restorePixelDelta: await comparePngPixels(page, checkpointPng, restoredPng),
    strictConsecutivePng: repeatPng.equals(checkpointPng),
    strictRestorePng: restoredPng.equals(checkpointPng),
  };
  return report;
}

test("browser frame restore: full viewport PNG and visible bytes restore exactly", {
  timeout: 600_000,
}, async () => {
  mkdirSync(ARTIFACTS, { recursive: true });
  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let browser;
  let evidence = { scenarios: [] };
  const consoleErrors = [];
  const pageErrors = [];
  try {
    const ready = JSON.parse(await line(server.stdout));
    const { chromium } = await import(PLAYWRIGHT);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const context = await browser.newContext({ deviceScaleFactor: 1,
      viewport: { height: 1_280, width: 720 } });
    await context.addInitScript(() => {
      window.__nativePaintFrame = window.requestAnimationFrame.bind(window);
      let nextFrame = 1;
      const pending = new Map();
      window.requestAnimationFrame = (callback) => {
        const handle = nextFrame++;
        pending.set(handle, callback);
        return handle;
      };
      window.cancelAnimationFrame = (handle) => pending.delete(handle);
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    const response = await page.goto(
      `http://${ready.host}:${ready.port}/public/ui-arena-shell.html`,
      { waitUntil: "domcontentloaded" },
    );
    assert.equal(response.status(), 200);
    await page.waitForSelector('[data-ui="deck-choice-open"]');
    const standard = await page.evaluate(async () => {
      const controller = (await import("/src/ui/arena-shell-entry.js")).arenaHudController;
      controller.enterManualStepMode();
      globalThis.__frameRestoreController = controller;
      globalThis.__frameRestoreSnapshot = controller.serialize();
      const sessionBytes = controller.session.serialize();
      return {
        deck: JSON.parse(sessionBytes).setup.deck,
        tick: controller.session.state.tick,
      };
    });
    const standardReport = await captureRestoreWitness(page, "standard-arena",
      "standard-arena");
    standardReport.startingTick = standard.tick;

    await click(page, '[data-ui="deck-choice-open"]');
    await page.waitForSelector('[data-ui="deck-choice"]:not([hidden])');
    await click(page, '[data-deck-choice="bulwark-needle"]');
    await click(page, '[data-ui="deck-start"]');
    await page.evaluate(() => {
      const controller = globalThis.__frameRestoreController;
      controller.enterManualStepMode();
    });
    await click(page, '[data-ui="card-slot"][data-card-id="bulwark-needle"]');
    await click(page, '[data-ui="arena"]', { x: 105, y: 666 });
    const target = await page.evaluate(() => {
      const controller = globalThis.__frameRestoreController;
      controller.stepMany(1);
      let advancedTicks = 1;
      const structure = () => controller.session.state.battle.structures.find(
        ({ cardId, side }) => cardId === "bulwark-needle" && side === "south");
      while (structure() !== undefined && structure().targetKey == null &&
          advancedTicks < 241) {
        controller.stepMany(1);
        advancedTicks += 1;
      }
      globalThis.__frameRestoreSnapshot = controller.serialize();
      return {
        advancedTicks,
        targetKey: structure()?.targetKey ?? null,
        tick: controller.session.state.tick,
      };
    });
    const bulwarkReport = await captureRestoreWitness(page,
      "deployed targeting Bulwark Needle", "bulwark-targeting");
    bulwarkReport.advancedTicks = target.advancedTicks;
    bulwarkReport.targetKey = target.targetKey;
    bulwarkReport.startingTick = target.tick;

    evidence = {
      chromeVersion: browser.version(),
      viewport: page.viewportSize(),
      consoleErrors,
      pageErrors,
      scenarios: [standardReport, bulwarkReport],
    };
    assert.equal(standard.tick, 0, "standard arena is captured at its frozen opening tick");
    assert.equal(standard.deck.length, 8);
    assert.ok(!standard.deck.includes("bulwark-needle"),
      "standard arena uses the standard shipped deck");
    assert.ok(target.targetKey?.startsWith("unit:"),
      `Bulwark must be deployed and targeting a live unit: ${JSON.stringify(target)}`);
    for (const report of evidence.scenarios) {
      assert.equal(report.strictConsecutivePng, true,
        `${report.label}: consecutive full viewport PNGs must be byte-identical: ${JSON.stringify(report)}`);
      assert.equal(report.strictRestorePng, true,
        `${report.label}: restored full viewport PNG must be byte-identical: ${JSON.stringify(report)}`);
      assert.equal(report.exactBrowserState, true, `${report.label}: browser bytes`);
      assert.equal(report.exactSessionState, true, `${report.label}: session bytes`);
      assert.equal(report.exactConsecutiveState, true,
        `${report.label}: state stays frozen between consecutive captures`);
      assert.equal(report.frozenTick, true, `${report.label}: frozen session tick`);
      assert.equal(report.exactArenaDom, true, `${report.label}: arena DOM bytes`);
      assert.equal(report.exactLayerDom, true, `${report.label}: projected layer DOM bytes`);
      assert.equal(report.exactHud, true, `${report.label}: HUD bytes`);
      assert.equal(report.exactInput, true, `${report.label}: input slot bytes`);
    }
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
  } finally {
    writeFileSync(`${ARTIFACTS}restore-evidence.json`,
      `${JSON.stringify(evidence, null, 2)}\n`);
    server.kill("SIGTERM");
    await Promise.race([once(server, "exit"), new Promise((resolve) =>
      setTimeout(resolve, 2_000))]);
    await browser?.close();
  }
});
