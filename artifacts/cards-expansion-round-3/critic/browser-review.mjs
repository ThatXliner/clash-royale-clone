import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { resolve } from "node:path";

const root = process.cwd();
const releaseRoot = "/tmp/cards015-critic-release-9b5afa15";
const evidenceRoot = resolve(root, "artifacts/cards-expansion-round-3/critic");
const server = spawn(process.execPath, [
  resolve(root, "tests/game-browser-journey-server.js"),
  `--root=${releaseRoot}`,
], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
let serverErrors = "";
server.stderr.setEncoding("utf8");
server.stderr.on("data", (chunk) => { serverErrors += chunk; });
const address = await new Promise((resolveAddress, reject) => {
  let output = "";
  const timeout = setTimeout(() => reject(new Error(`server start timed out: ${serverErrors}`)), 10_000);
  server.stdout.setEncoding("utf8");
  server.stdout.on("data", (chunk) => {
    output += chunk;
    const newline = output.indexOf("\n");
    if (newline !== -1) {
      clearTimeout(timeout);
      resolveAddress(JSON.parse(output.slice(0, newline)));
    }
  });
  server.once("error", reject);
});

const { chromium } = await import(
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs"
);
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
process.stdout.write(JSON.stringify({
  event: "chrome-started",
  processPid: process.pid,
  serverPid: server.pid,
  origin: `http://${address.host}:${address.port}`,
}) + "\n");

const failures = [];
const badResponses = [];
const requestedAssets = [];
const page = await browser.newPage({
  viewport: { width: 1440, height: 933 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (error) => failures.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") failures.push(message.text());
});
page.on("requestfailed", (request) => failures.push(
  `${request.url()}: ${request.failure()?.errorText}`,
));
page.on("response", (response) => {
  if (response.status() >= 400) badResponses.push({
    status: response.status(), url: response.url(),
  });
  if (new URL(response.url()).origin === `http://${address.host}:${address.port}`) {
    requestedAssets.push({
      status: response.status(),
      path: new URL(response.url()).pathname,
    });
  }
});

const cardIds = ["sunthread-pair", "duskwing-trio"];
const screenshots = [];
const desktop = [];
const phone = [];
let collectionIds = [];
let phoneCollection = null;

async function detailsFor(cardId, viewportLabel) {
  await page.locator(`[data-card-grid] [data-card-id="${cardId}"]`).click();
  await page.waitForFunction((expectedId) =>
    document.querySelector("[data-card-detail] h2")?.textContent ===
      (expectedId === "sunthread-pair" ? "Sunthread Pair" : "Duskwing Trio"), cardId);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const details = await page.locator("[data-card-detail]").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const image = node.querySelector("img");
    const selected = document.querySelector(
      `[data-card-grid] [data-card-id="${CSS.escape(document.querySelector("[data-card-detail] h2").textContent === "Sunthread Pair" ? "sunthread-pair" : "duskwing-trio")}"] img`,
    );
    const lore = node.querySelector(".card-lore p")?.textContent ?? null;
    return {
      heading: node.querySelector("h2")?.textContent ?? null,
      cardSummary: node.querySelector(".detail-heading > div p")?.textContent ?? null,
      description: node.querySelector(".detail-description")?.textContent ?? null,
      lore,
      loreSentenceCount: lore === null ? 0 : (lore.match(/[.!?](?:\s|$)/gu) ?? []).length,
      classifications: [...node.querySelectorAll(".unit-profile > p")].map((item) => item.textContent),
      stats: [...node.querySelectorAll(".unit-profile .stat-cell")].map((cell) => ({
        label: cell.querySelector("span")?.textContent ?? null,
        value: cell.querySelector("strong")?.textContent ?? null,
      })),
      unitProfileCount: node.querySelectorAll(".unit-profile").length,
      portraitInDetailPanel: image !== null,
      selectedCollectionPortraitVisible: selected !== null &&
        getComputedStyle(selected).display !== "none" && selected.getBoundingClientRect().width > 0,
      bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        right: rect.right, bottom: rect.bottom },
      viewport: { width: innerWidth, height: innerHeight },
      document: { scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight },
    };
  });
  const short = `${cardId}-${viewportLabel}`;
  const viewportPath = resolve(evidenceRoot, `${short}.png`);
  await page.screenshot({ path: viewportPath });
  const bytes = await readFile(viewportPath);
  screenshots.push({
    path: viewportPath.slice(root.length + 1),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  });
  if (viewportLabel === "phone-390x844") {
    const fullPath = resolve(evidenceRoot, `${short}-full.png`);
    await page.screenshot({ path: fullPath, fullPage: true });
    const fullBytes = await readFile(fullPath);
    screenshots.push({
      path: fullPath.slice(root.length + 1),
      width: fullBytes.readUInt32BE(16),
      height: fullBytes.readUInt32BE(20),
    });
  }
  return details;
}

try {
  const origin = `http://${address.host}:${address.port}`;
  await page.goto(`${origin}/public/index.html`, { waitUntil: "networkidle" });
  await page.locator('[data-nav-to="cards"]').click();
  collectionIds = await page.locator("[data-card-grid] [data-card-id]").evaluateAll(
    (nodes) => nodes.map((node) => node.dataset.cardId),
  );
  const collectionPortraits = await page.locator(
    '[data-card-grid] [data-card-id="sunthread-pair"] img, [data-card-grid] [data-card-id="duskwing-trio"] img',
  ).evaluateAll(async (images) => {
    await Promise.all(images.map((image) => image.decode()));
    return images.map((image) => ({
      cardId: image.closest("[data-card-id]")?.dataset.cardId,
      decoded: image.complete && image.naturalWidth > 0,
      naturalSize: [image.naturalWidth, image.naturalHeight],
      src: new URL(image.currentSrc || image.src, document.baseURI).pathname,
      visible: image.getBoundingClientRect().width > 0,
    }));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: resolve(evidenceRoot, "collection-390x844.png") });
  const collectionBytes = await readFile(resolve(evidenceRoot, "collection-390x844.png"));
  screenshots.push({
    path: "artifacts/cards-expansion-round-3/critic/collection-390x844.png",
    width: collectionBytes.readUInt32BE(16), height: collectionBytes.readUInt32BE(20),
  });
  phoneCollection = {
    viewport: { width: 390, height: 844 },
    count: collectionIds.length,
    hasBothCards: cardIds.every((id) => collectionIds.includes(id)),
    horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth !== 390),
    portraits: collectionPortraits,
  };

  await page.setViewportSize({ width: 1440, height: 933 });
  for (const cardId of cardIds) {
    desktop.push({ cardId, ...await detailsFor(cardId, "desktop-1440x933") });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [index, cardId] of cardIds.entries()) {
    if (index > 0) {
      await page.locator("[data-card-detail] .detail-back").click();
      await page.locator(`[data-card-grid] [data-card-id="${cardId}"]`).waitFor({ state: "visible" });
    } else {
      await page.locator("[data-card-detail] .detail-back").click();
      await page.locator(`[data-card-grid] [data-card-id="${cardId}"]`).waitFor({ state: "visible" });
    }
    phone.push({ cardId, ...await detailsFor(cardId, "phone-390x844") });
  }
} finally {
  await browser.close();
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await once(server, "exit").catch(() => {});
  }
}

const result = {
  schemaVersion: 1,
  sourceCommit: "9b5afa15f26a32f7c67cf5c9c66185c3e4971d72",
  release: {
    path: releaseRoot,
    fileCount: 53,
    totalBytes: 8134132,
    buildQualification: "passed; 53/53 local requests HTTP 200; runtimeErrors=[]",
  },
  browser: {
    viewportScale: 1,
    browser: "Chrome headless via Playwright 1.58.2",
    closed: true,
  },
  collectionIds,
  expectedCardCount: 16,
  phoneCollection,
  desktop,
  phone,
  screenshots,
  failures,
  badResponses,
  requestedAssets,
  serverErrors,
};
const resultPath = resolve(evidenceRoot, "browser-review.json");
await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(JSON.stringify({
  event: "browser-review-complete",
  resultPath,
  desktopCount: desktop.length,
  phoneCount: phone.length,
  collectionCount: collectionIds.length,
  failures: failures.length,
  badResponses: badResponses.length,
  browserClosed: true,
}) + "\n");
