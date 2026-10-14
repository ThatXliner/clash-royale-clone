import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const workspace = "/private/tmp/cards019i-integration-scope";
const evidenceDir = dirname(fileURLToPath(import.meta.url));
const outputPath = join(evidenceDir, "current-ui-browser-probe.json");
const screenshotPath = join(evidenceDir, "kilnkeeper-details-current-phone-390x844.png");
const playwrightPath = "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const { buildRelease } = await import(`${workspace}/scripts/build-release.js`);
const { chromium } = await import(playwrightPath);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const serverAddress = (server) => new Promise((resolve, reject) => {
  let output = "";
  const onData = (chunk) => {
    output += chunk;
    const newline = output.indexOf("\n");
    if (newline < 0) return;
    server.stdout.off("data", onData);
    try { resolve(JSON.parse(output.slice(0, newline))); }
    catch (error) { reject(error); }
  };
  server.stdout.on("data", onData);
  server.once("error", reject);
  server.once("exit", (code) => reject(new Error(`release server exited early (${code})`)));
});

await mkdir(evidenceDir, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), "cards019i-ui-probe-"));
const releaseRoot = join(temporary, "release");
let server;
let browser;
try {
  await buildRelease({ output: releaseRoot });
  server = spawn(process.execPath, [
    join(workspace, "tests/game-browser-journey-server.js"),
    `--root=${releaseRoot}`,
  ], { cwd: workspace, stdio: ["ignore", "pipe", "pipe"] });
  const address = await serverAddress(server);
  const origin = `http://${address.host}:${address.port}`;
  browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const pageErrors = [];
  const loadedPaths = new Set();
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === origin && response.status() >= 200 && response.status() < 400) {
      loadedPaths.add(url.pathname.slice(1));
    }
  });
  const response = await page.goto(`${origin}/public/index.html`, { waitUntil: "networkidle" });
  await page.locator('.app-nav [data-nav-to="cards"]').click();
  const cardIds = await page.locator("[data-card-grid] [data-card-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.cardId));
  const kilnkeeperCard = page.locator('[data-card-grid] [data-card-id="kilnkeeper"]');
  await kilnkeeperCard.click();
  const details = page.locator("[data-card-detail]");
  const portrait = details.locator(".detail-portrait .card-art-image");
  const lore = details.locator(".card-lore p");
  const detailEvidence = {
    heading: await details.locator("h2").innerText(),
    portraitCount: await portrait.count(),
    portraitPath: await portrait.count() ? await portrait.getAttribute("src") : null,
    loreCount: await lore.count(),
    loreText: await lore.count() ? await lore.innerText() : null,
    detailText: await details.innerText(),
  };
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.locator('.app-nav [data-nav-to="deck"]').click();
  await page.locator('[data-replace-slot="7"]').click();
  await page.locator('[data-replacement-card-id="kilnkeeper"]').click();
  const deckIds = await page.locator("[data-deck-cards] [data-card-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.cardId));
  const result = {
    browser: "Google Chrome",
    chromeDpr: await page.evaluate(() => window.devicePixelRatio),
    collectionCount: cardIds.length,
    collectionContainsKilnkeeper: cardIds.includes("kilnkeeper"),
    deckReplacementContainsKilnkeeper: deckIds.includes("kilnkeeper"),
    deckIds,
    detailEvidence,
    errors: pageErrors,
    httpStatus: response.status(),
    loadedKilnkeeperAssets: [...loadedPaths].filter((path) => /kilnkeeper/u.test(path)).sort(),
    screenshot: {
      path: "artifacts/cards019i-integration-scope/builder/kilnkeeper-details-current-phone-390x844.png",
      sha256: sha256(await readFile(screenshotPath)),
    },
    viewport: { width: 390, height: 844 },
  };
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
  await rm(temporary, { recursive: true, force: true });
}
