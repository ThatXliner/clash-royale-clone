import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const playwrightPath = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const chromePath = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outputRoot = resolve("artifacts/art-023p-round-1/builder");
const fixturePath = resolve(outputRoot, "portrait-thumbnails.html");
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const browserVersion = browser.version();
const browserPid = typeof browser.process === "function" ? browser.process()?.pid ?? null : null;
const captures = [];
let captureError = null;

try {
  for (const [device, viewport] of [
    ["phone", { width: 390, height: 844 }],
    ["desktop", { width: 1440, height: 933 }],
  ]) {
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: theme });
      try {
        const page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        const url = `${pathToFileURL(fixturePath).href}?theme=${theme}`;
        await page.goto(url, { waitUntil: "load" });
        await page.waitForFunction(() => Array.from(document.images).every((image) =>
          image.complete && image.naturalWidth === 512 && image.naturalHeight === 512));
        const metrics = await page.evaluate(() => ({
          colorScheme: getComputedStyle(document.documentElement).colorScheme,
          devicePixelRatio: window.devicePixelRatio,
          theme: document.documentElement.dataset.theme,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          images: Array.from(document.images, (image) => {
            const rect = image.getBoundingClientRect();
            return {
              alt: image.alt,
              cssHeight: rect.height,
              cssWidth: rect.width,
              naturalHeight: image.naturalHeight,
              naturalWidth: image.naturalWidth,
            };
          }),
        }));
        assert.equal(metrics.theme, theme);
        assert.equal(metrics.viewport.width, viewport.width);
        assert.equal(metrics.viewport.height, viewport.height);
        assert.equal(metrics.devicePixelRatio, 1);
        assert.deepEqual(metrics.images.map(({ cssWidth, cssHeight }) => [cssWidth, cssHeight]), [[64, 64], [128, 128]]);
        assert.deepEqual(pageErrors, []);
        const screenshotPath = resolve(outputRoot, `portrait-${device}-${theme}-${viewport.width}x${viewport.height}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: "disabled" });
        const bytes = await readFile(screenshotPath);
        captures.push({
          device,
          theme,
          viewport,
          devicePixelRatio: metrics.devicePixelRatio,
          colorScheme: metrics.colorScheme,
          cssImageSizes: metrics.images.map(({ cssWidth, cssHeight }) => [cssWidth, cssHeight]),
          screenshot: screenshotPath,
          screenshotBytes: bytes.length,
          screenshotSha256: createHash("sha256").update(bytes).digest("hex"),
        });
      } finally {
        await context.close();
      }
    }
  }
} catch (error) {
  captureError = String(error?.stack ?? error);
} finally {
  await browser.close();
}

let browserProcessClosed = null;
if (browserPid !== null) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const check = spawnSync("ps", ["-p", String(browserPid), "-o", "pid="], { encoding: "utf8" });
    if (check.status !== 0 || !check.stdout.trim()) {
      browserProcessClosed = true;
      break;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  if (browserProcessClosed === null) browserProcessClosed = false;
}
const result = {
  browser: "Google Chrome",
  browserVersion,
  browserProcessId: browserPid,
  browserClosed: true,
  browserProcessClosed,
  chromeLaunchArgs: [],
  captureError,
  captures,
};
await writeFile(resolve(outputRoot, "thumbnail-browser-evidence.json"), `${JSON.stringify(result, null, 2)}\n`);
if (captureError !== null || browserProcessClosed === false || captures.length !== 4) {
  process.exitCode = 1;
}
console.log(JSON.stringify(result, null, 2));
