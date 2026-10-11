import { createPagesPreviewServer } from "../../../scripts/preview-pages.js";
import { chromium } from "playwright";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = "/tmp/game-001gpr-round2-pages.DpK5Se";
const basePath = "/clash-royale-clone/";
const evidenceDir = resolve("artifacts/game-001gpr-round-2/critic");
const screenshotPath = resolve(evidenceDir, "pages-painted-sprite-production.png");
const jsonPath = resolve(evidenceDir, "pages-painted-sprite-production.json");
const displayDeck = [
  "skymaul", "brassbolt", "reedsting", "briar-band",
  "cinderlings", "coilblade", "mossguard", "copperskiff",
];

await mkdir(evidenceDir, { recursive: true });
const { server } = await createPagesPreviewServer({ root, basePath, logRequests: false });
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
if (!address || typeof address === "string") throw new Error("Pages preview did not bind a TCP port");
const baseUrl = `http://127.0.0.1:${address.port}${basePath}`;

const evidence = {
  basePath,
  baseUrl,
  browserPid: null,
  browserErrors: [],
  console: [],
  pageErrors: [],
  requests: [],
  responses: [],
  requestFailures: [],
  boot: null,
  renderedMarkers: [],
  atlasChecks: [],
  screenshotPath,
  testCommit: "e97dfde5b52635e59b6cb326dee10df9d93388e0",
  artifactRoot: root,
};

let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.GAME_BROWSER_CHROME ?? chromium.executablePath(),
    headless: true,
  });
  evidence.browserPid = typeof browser.process === "function" ? browser.process()?.pid ?? null : null;
  const context = await browser.newContext({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
  context.on("request", (request) => evidence.requests.push({
    method: request.method(),
    resourceType: request.resourceType(),
    url: request.url(),
  }));
  context.on("response", (response) => evidence.responses.push({
    status: response.status(),
    url: response.url(),
  }));
  context.on("requestfailed", (request) => evidence.requestFailures.push({
    error: request.failure()?.errorText ?? "request failed",
    resourceType: request.resourceType(),
    url: request.url(),
  }));
  const page = await context.newPage();
  page.on("pageerror", (error) => evidence.pageErrors.push(String(error?.stack ?? error)));
  page.on("console", (message) => evidence.console.push({
    type: message.type(),
    text: message.text(),
  }));

  const pageUrl = `${baseUrl}game/public/ui-arena-shell.html?session-profile=stonehauler-witness`;
  const pageResponse = await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 20_000 });
  evidence.page = {
    requestedUrl: pageUrl,
    responseStatus: pageResponse?.status() ?? null,
    finalUrl: page.url(),
    title: await page.title(),
  };
  await page.locator('[data-ui="arena"]').waitFor({ state: "visible", timeout: 10_000 });

  evidence.boot = await page.evaluate(async (deck) => {
    const moduleUrl = new URL("../src/ui/arena-shell-entry.js", location.href).href;
    const { arenaHudController } = await import(moduleUrl);
    const controller = arenaHudController;
    globalThis.__pagesSpriteProbeController = controller;
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
      sessionTick: controller.state.sessionTick,
    };
  }, displayDeck);

  const card = page.locator('[data-ui="card-slot"][data-card-id="briar-band"]');
  await card.waitFor({ state: "visible", timeout: 5_000 });
  await card.click();
  const arena = page.locator('[data-ui="arena"]');
  const arenaBox = await arena.boundingBox();
  if (!arenaBox || arenaBox.width <= 0 || arenaBox.height <= 0)
    throw new Error(`Arena has no visible bounds: ${JSON.stringify(arenaBox)}`);
  await page.mouse.click(arenaBox.x + arenaBox.width / 2, arenaBox.y + arenaBox.height * 0.79);
  await page.evaluate(() => globalThis.__pagesSpriteProbeController.stepMany(120));
  await page.locator('.combat-marker[data-kind="briar-runner"]').first().waitFor({
    state: "attached",
    timeout: 8_000,
  });

  evidence.renderedMarkers = await page.evaluate(async () => {
    const markers = [...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')];
    return await Promise.all(markers.map(async (marker) => {
      const art = marker.querySelector(".combat-art");
      const image = art?.querySelector("image");
      const rect = marker.getBoundingClientRect();
      const imageHref = image?.getAttribute("href") ?? null;
      const absoluteHref = imageHref ? new URL(imageHref, location.href).href : null;
      return {
        action: art?.dataset.spriteAction ?? null,
        direction: art?.dataset.spriteDirection ?? null,
        frame: art?.dataset.spriteFrame ?? null,
        imageHref,
        imageAbsoluteHref: absoluteHref,
        imageSvgHrefBaseVal: image?.href?.baseVal ?? null,
        imageHrefAttribute: image?.getAttribute("href") ?? null,
        imageHrefXlink: image?.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? null,
        markerBounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        side: marker.classList.contains("combat-marker--north") ? "north" : "south",
        svgViewBox: art?.getAttribute("viewBox") ?? null,
        tick: Number(art?.dataset.simulationTick),
        teamColor: art?.querySelector("[data-team-color]")?.getAttribute("fill") ?? null,
        teamColorFrontmost: art?.lastElementChild?.matches("[data-team-color]") ?? false,
      };
    }));
  });

  const expectedAtlasUrl = `${baseUrl}game/assets/briar-runner-painted-sheet-GjQaSmoe.png`;
  evidence.atlasChecks = await page.evaluate(async ({ expectedAtlasUrl, markers }) => {
    async function inspect(url, viewBox) {
      const response = await fetch(url, { cache: "no-store" });
      const result = { url, status: response.status, contentType: response.headers.get("content-type") };
      if (!response.ok) return result;
      const blob = await response.blob();
      result.byteLength = blob.size;
      const bitmap = await createImageBitmap(blob);
      result.width = bitmap.width;
      result.height = bitmap.height;
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      const allPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let totalOpaque = 0;
      let totalColored = 0;
      for (let index = 0; index < allPixels.length; index += 4) {
        if (allPixels[index + 3] > 0) {
          totalOpaque += 1;
          if (Math.max(allPixels[index], allPixels[index + 1], allPixels[index + 2]) -
              Math.min(allPixels[index], allPixels[index + 1], allPixels[index + 2]) > 12)
            totalColored += 1;
        }
      }
      result.totalOpaquePixels = totalOpaque;
      result.totalColoredPixels = totalColored;
      result.crops = markers.map((marker) => {
        const values = (marker.svgViewBox ?? "").trim().split(/[\s,]+/u).map(Number);
        if (values.length !== 4 || !values.every(Number.isFinite))
          return { side: marker.side, viewBox: marker.svgViewBox, error: "invalid SVG viewBox" };
        const [x, y, width, height] = values;
        const left = Math.max(0, Math.floor(x));
        const top = Math.max(0, Math.floor(y));
        const right = Math.min(canvas.width, Math.ceil(x + width));
        const bottom = Math.min(canvas.height, Math.ceil(y + height));
        if (right <= left || bottom <= top)
          return { side: marker.side, viewBox: marker.svgViewBox, error: "viewBox outside decoded atlas" };
        const pixels = context.getImageData(left, top, right - left, bottom - top).data;
        let opaquePixels = 0;
        let coloredPixels = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] > 0) {
            opaquePixels += 1;
            if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) -
                Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) > 12)
              coloredPixels += 1;
          }
        }
        return {
          side: marker.side,
          viewBox: marker.svgViewBox,
          crop: { x: left, y: top, width: right - left, height: bottom - top },
          opaquePixels,
          coloredPixels,
        };
      });
      bitmap.close();
      return result;
    }

    const urls = new Map();
    for (const marker of markers) {
      if (marker.imageAbsoluteHref) urls.set(marker.imageAbsoluteHref, marker.svgViewBox);
    }
    const checks = [];
    for (const [url, viewBox] of urls) checks.push(await inspect(url, markers));
    checks.push(await inspect(expectedAtlasUrl, markers));
    return checks;
  }, { expectedAtlasUrl, markers: evidence.renderedMarkers });

  await page.screenshot({ path: screenshotPath, fullPage: true });
  evidence.final = {
    markerCount: evidence.renderedMarkers.length,
    sessionTick: await page.evaluate(() => globalThis.__pagesSpriteProbeController.state.sessionTick),
    screenshotBytes: (await import("node:fs/promises")).stat(screenshotPath).then((info) => info.size),
  };
  evidence.final.screenshotBytes = await evidence.final.screenshotBytes;
} catch (error) {
  evidence.browserErrors.push(String(error?.stack ?? error));
} finally {
  if (browser) await browser.close().catch((error) => evidence.browserErrors.push(String(error)));
  await new Promise((resolveClose) => server.close(() => resolveClose()));
  await writeFile(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ jsonPath, screenshotPath, ...evidence }, null, 2)}\n`);
}

const actualChecks = evidence.atlasChecks.filter((check) =>
  evidence.renderedMarkers.some((marker) => marker.imageAbsoluteHref === check.url));
const actualPixelPass = actualChecks.some((check) => check.status === 200 &&
  check.crops?.some((crop) => crop.opaquePixels > 0 && crop.coloredPixels > 0));
const markerPass = evidence.renderedMarkers.length > 0;
process.exitCode = evidence.browserErrors.length === 0 && markerPass && actualPixelPass ? 0 : 1;
