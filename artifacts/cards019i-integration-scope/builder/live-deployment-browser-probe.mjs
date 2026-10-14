import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outputDir = dirname(fileURLToPath(import.meta.url));
const outputPath = join(outputDir, "live-deployment-browser-probe.json");
const screenshotPath = join(outputDir, "live-kilnkeeper-detail-phone-390x844.png");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const playwrightPath = "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const { chromium } = await import(playwrightPath);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
try {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors = [];
  const javascriptResponses = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("response", async (response) => {
    const url = new URL(response.url());
    const contentType = response.headers()["content-type"] ?? "";
    if (/\.(?:m?js)(?:$|\?)/u.test(url.pathname) || contentType.includes("javascript")) {
      let bodyHash = null;
      let bodyBytes = null;
      try {
        const body = await response.body();
        bodyHash = sha256(body);
        bodyBytes = body.byteLength;
      } catch {}
      javascriptResponses.push({
        bodyBytes,
        contentType,
        sha256: bodyHash,
        status: response.status(),
        url: response.url(),
      });
    }
  });
  const url = "https://bryanhu.com/clash-royale-clone/game/public/index.html";
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
  await page.locator('.app-nav [data-nav-to="cards"]').waitFor({ state: "visible", timeout: 15_000 });
  await page.locator('.app-nav [data-nav-to="cards"]').click();
  const collection = await page.locator("[data-card-grid] [data-card-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.cardId));
  const kilnkeeper = page.locator('[data-card-grid] [data-card-id="kilnkeeper"]');
  const kilnkeeperPresent = await kilnkeeper.count() === 1;
  if (kilnkeeperPresent) await kilnkeeper.click();
  const details = page.locator("[data-card-detail]");
  const portrait = details.locator(".detail-portrait .card-art-image");
  const lore = details.locator(".card-lore p");
  const detailEvidence = {
    heading: await details.locator("h2").innerText().catch(() => null),
    portraitCount: await portrait.count(),
    portraitNaturalSize: await portrait.evaluate((img) => ({ width: img.naturalWidth, height: img.naturalHeight })).catch(() => null),
    portraitPath: await portrait.getAttribute("src").catch(() => null),
    loreCount: await lore.count(),
    loreText: await lore.allInnerTexts().catch(() => []),
    text: await details.innerText().catch(() => ""),
  };
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const htmlBytes = await response.body();
  const domHtml = await page.evaluate(() => document.documentElement.outerHTML);
  const domHtmlBytes = Buffer.from(domHtml, "utf8");
  const result = {
    source: "live deployed read-only browser probe",
    targetUrl: url,
    browser: "Google Chrome",
    viewport: { width: 390, height: 844 },
    dpr: await page.evaluate(() => window.devicePixelRatio),
    http: {
      status: response.status(),
      contentType: response.headers()["content-type"] ?? null,
      playwrightResponseBodyBytes: htmlBytes.byteLength,
      playwrightResponseBodySha256: sha256(htmlBytes),
      rawCurlBodyBytes: 11_284,
      rawCurlBodySha256: "d7f0d91e13a33a6d1a966302f7a338208ddad7dc9bbf13a733f292ef076ef470",
      finalUrl: page.url(),
    },
    domSerializedHtml: {
      bytes: domHtmlBytes.byteLength,
      sha256: sha256(domHtmlBytes),
    },
    javascriptResponses,
    collection: {
      count: collection.length,
      ids: collection,
      containsKilnkeeper: kilnkeeperPresent,
    },
    detailEvidence,
    errors,
    screenshot: { path: screenshotPath, sha256: sha256(await (await import("node:fs/promises")).readFile(screenshotPath)) },
  };
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await browser.close();
}
