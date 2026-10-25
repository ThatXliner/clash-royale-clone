import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { buildRelease } from "../scripts/build-release.js";

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// The observed 0.01171875px delta stays within one CSS layout unit.
const CSS_LAYOUT_UNIT = 1 / 64;
const MATRIX_SCALE_EPSILON = 0.000001;
const MAX_SETTLEMENT_RAF_SAMPLES = 120;
const LAYOUT_SAMPLE_RECEIPT = new URL(
  "../artifacts/frame-layout-round1/builder/repro/focused-layout-settlement-samples.json",
  import.meta.url,
);

async function serverAddress(stream) {
  let output = "";
  for await (const chunk of stream) {
    output += chunk;
    const newline = output.indexOf("\n");
    if (newline >= 0) return JSON.parse(output.slice(0, newline));
  }
  throw new Error("app-shell layout test server stopped before readiness");
}

async function readFrameLayout(page) {
  return page.evaluate(() => {
    const slot = document.querySelector("[data-battle-frame-slot]");
    const iframe = slot?.querySelector("iframe");
    if (slot === null || iframe === null) return null;
    const rect = (element) => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    };
    const slotRect = rect(slot);
    const slotStyle = getComputedStyle(slot);
    const border = Object.fromEntries(["Left", "Right", "Top", "Bottom"].map((side) =>
      [side.toLowerCase(), Number.parseFloat(slotStyle[`border${side}Width`]) || 0]));
    const slotContent = {
      x: slotRect.x + border.left,
      y: slotRect.y + border.top,
      width: slotRect.width - border.left - border.right,
      height: slotRect.height - border.top - border.bottom,
    };
    const matrix = getComputedStyle(iframe).transform;
    const match = matrix.match(/^matrix\(([^)]+)\)$/u);
    const values = match?.[1].split(",").map(Number) ?? [];
    return {
      slot: slotRect,
      slotContent,
      iframe: rect(iframe),
      inline: {
        left: iframe.style.left,
        top: iframe.style.top,
        transform: iframe.style.transform,
      },
      matrix,
      scale: values.length === 6 ? Math.hypot(values[0], values[1]) : null,
      viewport: { width: innerWidth, height: innerHeight },
      frameViewport: iframe.contentWindow === null ? null : {
        width: iframe.contentWindow.innerWidth,
        height: iframe.contentWindow.innerHeight,
      },
    };
  });
}

async function persistLayoutSamples(page) {
  if (page === null) return;
  const samples = await page.evaluate(() => ({
    rafCount: window.__appShellLayoutRafCount,
    samples: window.__appShellLayoutSamples,
  })).catch(() => null);
  if (samples === null) return;
  await mkdir(new URL(".", LAYOUT_SAMPLE_RECEIPT), { recursive: true });
  await writeFile(LAYOUT_SAMPLE_RECEIPT, `${JSON.stringify({
    schemaVersion: 1,
    command: "node --test tests/app-shell-layout.test.js",
    acceptedBaseCommit: "095a8c55a6721c74f7555939a9ce21182bec3f2a",
    sampleSource: "native requestAnimationFrame polling; no sleeps or forced events",
    maxRafSamplesPerSettledSlot: MAX_SETTLEMENT_RAF_SAMPLES,
    ...samples,
  }, null, 2)}\n`);
}

async function waitForFrameAndSlotToSettle(page, description, phone) {
  const frameStart = await page.evaluate(() => window.__appShellLayoutRafCount);
  await page.waitForFunction(({ description: phase, frameLimit, sampleLimit,
    layoutUnit, matrixScaleEpsilon, expectPhone }) => {
    window.__appShellLayoutRafCount += 1;
    if (window.__appShellLayoutRafCount > frameLimit) {
      throw new Error(`${phase} exceeded its bounded ${sampleLimit} RAF sample window`);
    }
    const main = document.querySelector(".app-main");
    const slot = document.querySelector("[data-battle-frame-slot]");
    const iframe = slot?.querySelector("iframe");
    if (main === null || slot === null || iframe === null ||
        matchMedia("(max-width: 760px)").matches !== expectPhone) return false;
    const slotBounds = slot.getBoundingClientRect();
    const slotStyle = getComputedStyle(slot);
    const borderLeft = Number.parseFloat(slotStyle.borderLeftWidth) || 0;
    const borderRight = Number.parseFloat(slotStyle.borderRightWidth) || 0;
    const borderTop = Number.parseFloat(slotStyle.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(slotStyle.borderBottomWidth) || 0;
    const content = {
      x: slotBounds.x + borderLeft,
      y: slotBounds.y + borderTop,
      width: slotBounds.width - borderLeft - borderRight,
      height: slotBounds.height - borderTop - borderBottom,
    };
    const expectedSlotWidth = expectPhone ? 390 : 1_296;
    const expectedSlotHeight = expectPhone ? 725 : 761.125;
    const slotSettled = Math.abs(slotBounds.width - expectedSlotWidth) <= layoutUnit &&
      Math.abs(slotBounds.height - expectedSlotHeight) <= layoutUnit &&
      getComputedStyle(main).paddingLeft === (expectPhone ? "0px" : "72px");
    const fit = Math.min(content.width / 720, content.height / 1_280, 8);
    let scaleUnits = Math.floor(fit * 64);
    while (scaleUnits > 0) {
      const reciprocal = Math.fround(64 / scaleUnits);
      const relativeError = Math.abs(reciprocal * scaleUnits - 64) / 64;
      if (relativeError <= 2 ** -25) break;
      scaleUnits -= 1;
    }
    const expectedScale = scaleUnits / 64;
    const style = getComputedStyle(iframe);
    const matrix = style.transform.match(/^matrix\(([^)]+)\)$/u);
    const values = matrix?.[1].split(",").map(Number) ?? [];
    const scale = values.length === 6 ? Math.hypot(values[0], values[1]) : null;
    const bounds = iframe.getBoundingClientRect();
    const frameFits = Number.isFinite(scale) && scale === expectedScale &&
      Math.abs(bounds.x / expectedScale - Math.round(bounds.x / expectedScale)) <= matrixScaleEpsilon &&
      Math.abs(bounds.y / expectedScale - Math.round(bounds.y / expectedScale)) <= matrixScaleEpsilon &&
      bounds.x >= content.x - layoutUnit &&
      bounds.x + bounds.width <= content.x + content.width + layoutUnit &&
      bounds.y >= content.y - layoutUnit &&
      bounds.y + bounds.height <= content.y + content.height + layoutUnit;
    const fits = slotSettled && frameFits;
    const finiteGeometry = [
      content.x, content.y, content.width, content.height, expectedScale,
      bounds.x, bounds.y, bounds.width, bounds.height,
    ].every(Number.isFinite);
    if (finiteGeometry) {
      window.__appShellLayoutSamples.push({
        phase,
        sample: window.__appShellLayoutSamples.length + 1,
        raf: window.__appShellLayoutRafCount,
        time: performance.now(),
        viewport: { width: innerWidth, height: innerHeight },
        slot: {
          x: slotBounds.x,
          y: slotBounds.y,
          width: slotBounds.width,
          height: slotBounds.height,
        },
        content,
        iframe: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        },
        inline: {
          left: iframe.style.left,
          top: iframe.style.top,
          transform: iframe.style.transform,
        },
        computed: {
          left: style.left,
          top: style.top,
          transform: style.transform,
          transformOrigin: style.transformOrigin,
          transitionProperty: style.transitionProperty,
          transitionDuration: style.transitionDuration,
          transitionDelay: style.transitionDelay,
          animations: iframe.getAnimations().map((animation) => ({
            type: animation.constructor.name,
            property: animation.transitionProperty ?? null,
            name: animation.animationName ?? null,
            playState: animation.playState,
            currentTime: animation.currentTime,
            timing: animation.effect?.getComputedTiming() ?? null,
          })),
        },
        expectedScale,
        scale,
        slotSettled,
        frameFits,
        fits,
      });
    }
    return fits;
  }, {
    description,
    frameLimit: frameStart + MAX_SETTLEMENT_RAF_SAMPLES,
    sampleLimit: MAX_SETTLEMENT_RAF_SAMPLES,
    layoutUnit: CSS_LAYOUT_UNIT,
    matrixScaleEpsilon: MATRIX_SCALE_EPSILON,
    expectPhone: phone,
  }, { polling: "raf", timeout: 8_000 }).catch(async (error) => {
    throw new Error(`${description}: actual iframe geometry did not settle to the measured slot`, {
      cause: error,
    });
  });
}

function assertFrameFits(layout, description) {
  assert.ok(layout, `${description}: the real battle iframe is mounted`);
  const fit = Math.min(layout.slotContent.width / 720,
    layout.slotContent.height / 1_280, 8);
  let scaleUnits = Math.floor(fit * 64);
  while (scaleUnits > 0) {
    const reciprocal = Math.fround(64 / scaleUnits);
    const relativeError = Math.abs(reciprocal * scaleUnits - 64) / 64;
    if (relativeError <= 2 ** -25) break;
    scaleUnits -= 1;
  }
  const expectedScale = scaleUnits / 64;
  assert.ok(Number.isFinite(layout.scale) && layout.scale === expectedScale,
    `${description}: iframe uses the exact derived k/64 scale; ${JSON.stringify({ layout, expectedScale })}`);
  assert.ok(Math.abs(layout.iframe.x / layout.scale - Math.round(layout.iframe.x / layout.scale)) <= MATRIX_SCALE_EPSILON,
    `${description}: iframe page x origin is rounded to a scale multiple; ${JSON.stringify(layout)}`);
  assert.ok(Math.abs(layout.iframe.y / layout.scale - Math.round(layout.iframe.y / layout.scale)) <= MATRIX_SCALE_EPSILON,
    `${description}: iframe page y origin is rounded to a scale multiple; ${JSON.stringify(layout)}`);
  assert.ok(layout.iframe.x >= layout.slotContent.x - CSS_LAYOUT_UNIT &&
    layout.iframe.x + layout.iframe.width <= layout.slotContent.x +
      layout.slotContent.width + CSS_LAYOUT_UNIT &&
    layout.iframe.y >= layout.slotContent.y - CSS_LAYOUT_UNIT &&
    layout.iframe.y + layout.iframe.height <= layout.slotContent.y +
      layout.slotContent.height + CSS_LAYOUT_UNIT,
  `${description}: scaled iframe remains inside the slot content box; ${JSON.stringify(layout)}`);
  assert.deepEqual([layout.frameViewport.width, layout.frameViewport.height], [720, 1_280],
    `${description}: responsive outer layout preserves the original battle coordinate space`);
}

test("battle iframe follows the settled slot across viewport, motion, and view changes", {
  timeout: 90_000,
}, async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "app-shell-layout-"));
  const releaseRoot = join(temporary, "release");
  await buildRelease({ output: releaseRoot });

  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
    `--root=${releaseRoot}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let browser = null;
  let page = null;
  t.after(async () => {
    await persistLayoutSamples(page);
    await browser?.close();
    if (server.exitCode === null) {
      const exit = once(server, "exit");
      server.kill("SIGTERM");
      await exit;
    }
    await rm(temporary, { recursive: true, force: true });
  });
  const address = await serverAddress(server.stdout);
  const { chromium } = await import(PLAYWRIGHT);
  browser = await chromium.launch({ executablePath: CHROME, headless: true });

  page = await browser.newPage({
    viewport: { width: 1_440, height: 933 },
    deviceScaleFactor: 1,
  });
  await page.addInitScript(() => {
    window.__appShellLayoutRafCount = 0;
    window.__appShellLayoutSamples = [];
  });
  await page.goto(`http://${address.host}:${address.port}/public/index.html`, {
    waitUntil: "networkidle",
  });
  const homeDeckCardCount = await page.locator("[data-home-deck] [data-card-id]").count();
  const layouts = [];
  await page.locator('[data-nav-to="battle"]').click();
  const frameArena = page.frameLocator("[data-battle-frame-slot] iframe")
    .locator('[data-ui="arena"]');
  await frameArena.waitFor({ state: "attached", timeout: 8_000 });
  await waitForFrameAndSlotToSettle(page, "desktop Battle", false);
  layouts.push(await readFrameLayout(page));

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForFrameAndSlotToSettle(page, "phone Battle after desktop resize", true);
  layouts.push(await readFrameLayout(page));

  await page.locator('.app-nav [data-nav-to="deck"]').click();
  await page.waitForFunction(() => document.querySelector('[data-app-view="deck"]')?.hidden === false,
    null, { polling: "raf", timeout: 8_000 });
  await page.setViewportSize({ width: 1_440, height: 933 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator('[data-nav-to="battle"]').click();
  await waitForFrameAndSlotToSettle(page, "desktop Battle after hidden-slot resize", false);
  layouts.push(await readFrameLayout(page));

  await page.setViewportSize({ width: 390, height: 844 });
  await waitForFrameAndSlotToSettle(page, "phone Battle after returning from Deck", true);
  layouts.push(await readFrameLayout(page));

  await persistLayoutSamples(page);
  assert.equal(homeDeckCardCount, 8, "the standard home deck remains eight cards");
  assertFrameFits(layouts[0], "desktop Battle");
  assert.ok(Math.abs(layouts[1].slot.width - 390) <= CSS_LAYOUT_UNIT &&
    Math.abs(layouts[1].slot.height - 725) <= CSS_LAYOUT_UNIT,
  `390x844 Battle reaches the expanded full-width phone slot: ${JSON.stringify(layouts[1])}`);
  assertFrameFits(layouts[1], "phone Battle after desktop resize");
  assertFrameFits(layouts[2], "desktop Battle after hidden-slot resize");
  assertFrameFits(layouts[3], "phone Battle after returning from Deck");
});
