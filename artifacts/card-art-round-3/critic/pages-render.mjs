import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createPagesPreviewServer } from "../../../scripts/preview-pages.js";

const PACKAGE = new URL("./pages-package/", import.meta.url).pathname;
const OUT = new URL("./", import.meta.url).pathname;
const BASE_PATH = "/clash-royale-clone/";
const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const EXPECTED = [
  ["coilblade", "0"], ["mossguard", "1"], ["copperskiff", "2"],
  ["skymaul", "3"], ["brassbolt", "4"], ["reedsting", "5"],
  ["briar-band", "6"], ["cinderlings", "7"], ["stonehauler", null],
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const screenshots = [];
const browserFailures = [];
const badResponses = [];
const routeEvidence = [];

await mkdir(OUT, { recursive: true });
const manifest = JSON.parse(await readFile(join(PACKAGE, "game/release-manifest.json"), "utf8"));
const manifestFiles = new Map(manifest.files.map((file) => [file.path, file]));
const registeredAssets = [];
for (const [sourcePath, expectedPath] of [
  ["public/assets/card-portraits-painted.webp", "assets/card-portraits-painted-"],
  ["public/assets/stonehauler-painted.webp", "assets/stonehauler-painted-"],
]) {
  const sourceBytes = await readFile(join(PACKAGE, "game", sourcePath));
  const entry = [...manifestFiles.values()].find((file) => file.path.startsWith(expectedPath) &&
    file.path.endsWith(".webp"));
  assert.ok(entry, "registered packaged portrait output exists: " + expectedPath);
  const outputBytes = await readFile(join(PACKAGE, "game", entry.path));
  assert.equal(outputBytes.length, entry.size, "registered packaged portrait size matches manifest");
  assert.equal(sha256(outputBytes), entry.sha256, "registered packaged portrait hash matches manifest");
  assert.equal(sha256(outputBytes), sha256(sourceBytes), "packaged portrait bytes match original registered source");
  registeredAssets.push({ sourcePath, output: entry, sourceBytes: sourceBytes.length });
}

const { server } = await createPagesPreviewServer({ root: PACKAGE, basePath: BASE_PATH, logRequests: false });
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
const origin = "http://127.0.0.1:" + address.port;
const base = origin + BASE_PATH;
const { chromium } = await import(PLAYWRIGHT);
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 933 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (error) => browserFailures.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") browserFailures.push(message.text());
  });
  page.on("requestfailed", (request) => browserFailures.push(
    request.url() + ": " + (request.failure()?.errorText ?? "request failed"),
  ));
  page.on("response", (response) => {
    if (response.status() >= 400) badResponses.push({
      status: response.status(),
      url: response.url(),
    });
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 933 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of ["home", "cards", "deck"]) {
      await page.goto(base + "game/public/index.html", { waitUntil: "networkidle" });
      if (route !== "home") {
        await page.locator('.app-nav [data-nav-to="' + route + '"]').click();
      }
      const selector = route === "home" ? "[data-home-deck] .card-art-image"
        : route === "cards" ? "[data-card-grid] .card-art-image"
          : "[data-deck-cards] .card-art-image";
      await page.locator(selector).first().waitFor({ state: "attached" });
      const portraits = await page.locator(selector).evaluateAll(async (images) => {
        await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
        return images.map((image) => {
          const card = image.closest("[data-card-id]");
          const artWindow = image.closest(".card-art-window");
          const rect = (node) => {
            const r = node.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
          };
          const style = getComputedStyle(image);
          return {
            cardId: card?.dataset.cardId ?? null,
            cell: image.dataset.portraitCell ?? null,
            path: new URL(image.currentSrc || image.src, document.baseURI).pathname,
            decoded: image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
            naturalSize: [image.naturalWidth, image.naturalHeight],
            imageRect: rect(image),
            windowRect: artWindow ? rect(artWindow) : null,
            objectFit: style.objectFit,
            visible: !!artWindow && artWindow.getBoundingClientRect().width > 0 &&
              artWindow.getBoundingClientRect().height > 0 &&
              getComputedStyle(artWindow).visibility !== "hidden",
          };
        });
      });
      const cardIds = route === "cards" ? EXPECTED.map(([id]) => id) :
        EXPECTED.slice(0, 8).map(([id]) => id);
      assert.deepEqual(portraits.map((portrait) => portrait.cardId), cardIds,
        viewport.name + " " + route + " portrait card order");
      assert.ok(portraits.every((portrait) => portrait.decoded && portrait.visible),
        viewport.name + " " + route + " all portraits decode and have visible art windows");
      if (route === "cards") {
        assert.deepEqual(portraits.map((portrait) => [portrait.cardId, portrait.cell]), EXPECTED,
          viewport.name + " Cards maps all nine portraits to their intended cells");
      }
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.equal(scrollWidth, viewport.width, viewport.name + " " + route + " has no horizontal overflow");
      const imageName = "pages-" + viewport.name + "-" + route + "-" +
        viewport.width + "x" + viewport.height + ".png";
      const screenshotPath = join(OUT, imageName);
      await page.screenshot({ path: screenshotPath });
      const png = await readFile(screenshotPath);
      screenshots.push({
        path: "artifacts/card-art-round-3/critic/" + imageName,
        width: png.readUInt32BE(16),
        height: png.readUInt32BE(20),
        sha256: sha256(png),
      });
      if (route === "cards") {
        const fullName = "pages-" + viewport.name + "-cards-full.png";
        const fullPath = join(OUT, fullName);
        await page.screenshot({ path: fullPath, fullPage: true });
        const fullPng = await readFile(fullPath);
        screenshots.push({
          path: "artifacts/card-art-round-3/critic/" + fullName,
          width: fullPng.readUInt32BE(16),
          height: fullPng.readUInt32BE(20),
          sha256: sha256(fullPng),
        });
      }
      if (viewport.name === "phone") {
        const region = route === "home" ? "[data-home-deck]"
          : route === "cards" ? "[data-card-grid]" : "[data-deck-cards]";
        const bottomRow = route === "home"
          ? ["brassbolt", "reedsting", "briar-band", "cinderlings"]
          : route === "cards" ? ["briar-band", "cinderlings", "stonehauler"]
            : ["briar-band", "cinderlings"];
        await page.evaluate(({ regionSelector }) => {
          const lastId = regionSelector === "[data-card-grid]" ? "stonehauler" : "cinderlings";
          const last = document.querySelector(regionSelector + ' [data-card-id="' + lastId + '"]');
          const nav = document.querySelector(".app-nav");
          const delta = last.getBoundingClientRect().bottom - nav.getBoundingClientRect().top + 10;
          window.scrollTo({ top: window.scrollY + Math.max(0, delta), behavior: "instant" });
        }, { regionSelector: region });
        const bottomRowLayout = await page.evaluate(({ regionSelector, ids }) => {
          const nav = document.querySelector(".app-nav").getBoundingClientRect();
          const entries = ids.map((id) => {
            const card = document.querySelector(regionSelector + ' [data-card-id="' + id + '"]');
            const art = card?.querySelector(".card-art-window");
            const bounds = art?.getBoundingClientRect();
            return {
              cardId: id,
              visible: !!bounds && bounds.width > 0 && bounds.height > 0,
              artTop: bounds?.top ?? null,
              artBottom: bounds?.bottom ?? null,
              navTop: nav.top,
              navigationOverlapPx: bounds ? Math.max(0, bounds.bottom - nav.top) : null,
              noHarmfulCrop: !!bounds && bounds.top >= 0 && bounds.bottom - nav.top <= 4,
            };
          });
          return { scrollY: window.scrollY, entries };
        }, { regionSelector: region, ids: bottomRow });
        assert.ok(bottomRowLayout.entries.every((entry) =>
          entry.visible && entry.noHarmfulCrop),
        viewport.name + " " + route + " bottom portraits avoid harmful navigation crops: " +
          JSON.stringify(bottomRowLayout));
        const bottomName = "pages-phone-" + route + "-bottom-390x844.png";
        const bottomPath = join(OUT, bottomName);
        await page.screenshot({ path: bottomPath });
        const bottomPng = await readFile(bottomPath);
        const bottomScreenshot = {
          path: "artifacts/card-art-round-3/critic/" + bottomName,
          width: bottomPng.readUInt32BE(16),
          height: bottomPng.readUInt32BE(20),
          sha256: sha256(bottomPng),
        };
        screenshots.push(bottomScreenshot);
        routeEvidence.push({
          route: route + "-bottom",
          viewport: { width: viewport.width, height: viewport.height },
          screenshot: bottomScreenshot,
          bottomRowLayout,
        });
      }
      routeEvidence.push({
        route,
        viewport: { width: viewport.width, height: viewport.height },
        documentWidth: scrollWidth,
        portraitCount: portraits.length,
        portraits,
      });
      if (route === "deck") {
        const customDeckIds = [
          "coilblade", "stonehauler", "copperskiff", "skymaul",
          "brassbolt", "reedsting", "briar-band", "cinderlings",
        ];
        await page.locator('[data-replace-slot="1"]').focus();
        await page.keyboard.press("Enter");
        await page.locator('[data-replacement-card-id="stonehauler"]').waitFor({ state: "visible" });
        await page.locator('[data-replacement-card-id="stonehauler"]').click();
        const customPortraits = await page.locator("[data-deck-cards] .card-art-image").evaluateAll(
          async (images) => {
            await Promise.all(images.map((image) => image.decode()));
            return images.map((image) => ({
              cardId: image.closest("[data-card-id]")?.dataset.cardId ?? null,
              cell: image.dataset.portraitCell ?? null,
              decoded: image.complete && image.naturalWidth > 0,
              path: new URL(image.currentSrc || image.src, document.baseURI).pathname,
            }));
          },
        );
        assert.deepEqual(customPortraits.map((portrait) => portrait.cardId), customDeckIds,
          viewport.name + " custom Deck maps Stonehauler in the selected slot");
        assert.ok(customPortraits.every((portrait) => portrait.decoded &&
          portrait.path.startsWith(BASE_PATH + "game/assets/")),
        viewport.name + " custom Deck portraits load from the Pages subpath");
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        const customDeckName = "pages-" + viewport.name + "-deck-stonehauler-" +
          viewport.width + "x" + viewport.height + ".png";
        const customDeckPath = join(OUT, customDeckName);
        await page.screenshot({ path: customDeckPath });
        const customDeckPng = await readFile(customDeckPath);
        const customDeckScreenshot = {
          path: "artifacts/card-art-round-3/critic/" + customDeckName,
          width: customDeckPng.readUInt32BE(16),
          height: customDeckPng.readUInt32BE(20),
          sha256: sha256(customDeckPng),
        };
        screenshots.push(customDeckScreenshot);
        routeEvidence.push({
          route: "deck-stonehauler",
          viewport: { width: viewport.width, height: viewport.height },
          portraitCount: customPortraits.length,
          portraits: customPortraits,
          screenshot: customDeckScreenshot,
        });
        await page.locator('.app-nav [data-nav-to="home"]').click();
        const customHomeSelector = "[data-home-deck] .card-art-image";
        const customHomePortraits = await page.locator(customHomeSelector).evaluateAll(
          async (images) => {
            await Promise.all(images.map((image) => image.decode()));
            return images.map((image) => ({
              cardId: image.closest("[data-card-id]")?.dataset.cardId ?? null,
              cell: image.dataset.portraitCell ?? null,
              decoded: image.complete && image.naturalWidth > 0,
              path: new URL(image.currentSrc || image.src, document.baseURI).pathname,
            }));
          },
        );
        assert.deepEqual(customHomePortraits.map((portrait) => portrait.cardId), customDeckIds,
          viewport.name + " Home shows the selected Stonehauler portrait");
        assert.ok(customHomePortraits.every((portrait) => portrait.decoded &&
          portrait.path.startsWith(BASE_PATH + "game/assets/")),
        viewport.name + " custom Home portraits load from the Pages subpath");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width,
          viewport.name + " custom Home has no horizontal overflow");
        const customHomeName = "pages-" + viewport.name + "-home-stonehauler-" +
          viewport.width + "x" + viewport.height + ".png";
        const customHomePath = join(OUT, customHomeName);
        await page.screenshot({ path: customHomePath });
        const customHomePng = await readFile(customHomePath);
        const customHomeScreenshot = {
          path: "artifacts/card-art-round-3/critic/" + customHomeName,
          width: customHomePng.readUInt32BE(16),
          height: customHomePng.readUInt32BE(20),
          sha256: sha256(customHomePng),
        };
        screenshots.push(customHomeScreenshot);
        routeEvidence.push({
          route: "home-stonehauler",
          viewport: { width: viewport.width, height: viewport.height },
          portraitCount: customHomePortraits.length,
          portraits: customHomePortraits,
          screenshot: customHomeScreenshot,
        });
      }
    }
  }
  assert.deepEqual(badResponses, [], "Pages subpath has no HTTP errors");
  assert.deepEqual(browserFailures, [], "Pages subpath has no browser errors");
  const evidence = {
    commit: "686b6ee640fbbe18f21acdd1df136f3007135029",
    basePath: BASE_PATH,
    pagesUrl: base + "game/public/index.html",
    packageRoot: PACKAGE,
    releaseManifestSha256: sha256(await readFile(join(PACKAGE, "game/release-manifest.json"))),
    releaseFileCount: manifest.fileCount,
    registeredAssets,
    screenshots,
    routes: routeEvidence,
    badResponses,
    browserFailures,
    result: "passed",
  };
  await writeFile(join(OUT, "pages-browser-evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
  process.stdout.write(JSON.stringify(evidence, null, 2) + "\n");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
