import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const playwrightPath = process.env.GAME_BROWSER_PLAYWRIGHT;
const chromePath = process.env.GAME_BROWSER_CHROME;
const outputRoot = resolve('/var/folders/7l/qx4ns2fn79n6g7l7c1b5p0100000gp/T/aether-well-art023p-critic-pd7grwof/captures');
const fixturePath = resolve('/var/folders/7l/qx4ns2fn79n6g7l7c1b5p0100000gp/T/aether-well-art023p-critic-pd7grwof/checkout/artifacts/art-023p-round-1/builder/portrait-thumbnails.html');
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const browserVersion = browser.version();
const browserProcessId = typeof browser.process === "function" ? browser.process()?.pid ?? null : null;
const captures = [];
const failures = [];
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
        page.on("pageerror", error => pageErrors.push(error.message));
        await page.goto(pathToFileURL(fixturePath).href + "?theme=" + theme, { waitUntil: "load" });
        await page.waitForFunction(() => [...document.images].every(image =>
          image.complete && image.naturalWidth === 512 && image.naturalHeight === 512));
        const metrics = await page.evaluate(() => ({
          colorScheme: getComputedStyle(document.documentElement).colorScheme,
          devicePixelRatio: window.devicePixelRatio,
          theme: document.documentElement.dataset.theme,
          viewport: { width: innerWidth, height: innerHeight },
          images: [...document.images].map(image => {
            const rect = image.getBoundingClientRect();
            return { alt: image.alt, cssWidth: rect.width, cssHeight: rect.height,
              naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
          }),
        }));
        assert.equal(metrics.theme, theme);
        assert.equal(metrics.colorScheme, theme);
        assert.deepEqual(metrics.viewport, viewport);
        assert.equal(metrics.devicePixelRatio, 1);
        assert.deepEqual(metrics.images.map(({ cssWidth, cssHeight }) => [cssWidth, cssHeight]), [[64, 64], [128, 128]]);
        assert.deepEqual(metrics.images.map(({ naturalWidth, naturalHeight }) => [naturalWidth, naturalHeight]), [[512, 512], [512, 512]]);
        assert.deepEqual(pageErrors, []);
        const filename = `portrait-${device}-${theme}-${viewport.width}x${viewport.height}.png`;
        const screenshot = resolve(outputRoot, filename);
        await page.screenshot({ path: screenshot, fullPage: false, animations: "disabled" });
        const bytes = await readFile(screenshot);
        captures.push({
          device, theme, viewport, devicePixelRatio: metrics.devicePixelRatio,
          colorScheme: metrics.colorScheme,
          cssImageSizes: metrics.images.map(({ cssWidth, cssHeight }) => [cssWidth, cssHeight]),
          naturalSizes: metrics.images.map(({ naturalWidth, naturalHeight }) => [naturalWidth, naturalHeight]),
          screenshot: screenshot, screenshotBytes: bytes.length,
          screenshotSha256: createHash("sha256").update(bytes).digest("hex"),
        });
      } finally { await context.close(); }
    }
  }
} catch (error) { failures.push(String(error?.stack ?? error)); }
finally { await browser.close(); }
let browserProcessClosed = null;
if (browserProcessId !== null) {
  const check = spawnSync("ps", ["-p", String(browserProcessId), "-o", "pid="], { encoding: "utf8" });
  browserProcessClosed = check.status !== 0 || !check.stdout.trim();
}
const evidence = {
  schemaVersion: 1, browser: "Google Chrome", browserVersion, browserProcessId,
  browserClosed: true, browserProcessClosed, chromeLaunchArgs: [],
  node: process.execPath + " " + process.version,
  playwright: playwrightPath, fixture: fixturePath, captureError: failures.length ? failures.join("\n") : null,
  captures,
};
await writeFile(resolve(outputRoot, "thumbnail-captures.json"), JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence, null, 2));
if (failures.length || browserProcessClosed === false || captures.length !== 4) process.exitCode = 1;
