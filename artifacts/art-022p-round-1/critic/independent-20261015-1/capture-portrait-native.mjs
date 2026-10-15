import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const webpPath = join(root, "public/assets/brackenwheel-portrait-painted.webp");
const webpBytes = readFileSync(webpPath);
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Brackenwheel portrait thumbnail inspection</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 272px; height: 184px; }
  body { color: #f4f0e5; background: #28312f; font: 11px/14px system-ui, sans-serif; }
  main { display: flex; align-items: flex-start; gap: 20px; padding: 12px; }
  figure { display: grid; gap: 6px; margin: 0; }
  figcaption { white-space: nowrap; }
  img { display: block; object-fit: cover; image-rendering: auto; }
  #portrait64 { width: 64px; height: 64px; }
  #portrait128 { width: 128px; height: 128px; }
</style>
</head>
<body>
<main>
  <figure><figcaption>64 CSS px · DPR 1</figcaption><img id="portrait64" src="/assets/brackenwheel-portrait-painted.webp" alt="Brackenwheel, river-workshop sickle maker"></figure>
  <figure><figcaption>128 CSS px · DPR 1</figcaption><img id="portrait128" src="/assets/brackenwheel-portrait-painted.webp" alt="Brackenwheel, river-workshop sickle maker"></figure>
</main>
</body>
</html>`;
const requests = [];
const pageErrors = [];
const consoleErrors = [];
let browser;
let context;
let server;
const report = {
  command: ["node", fileURLToPath(import.meta.url)],
  chromeBinary: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  customLaunchArgs: [],
  headless: false,
  context: { viewport: { width: 272, height: 184 }, deviceScaleFactor: 1 },
  screenshots: [],
  pageErrors,
  consoleErrors,
  requests,
};
try {
  writeFileSync(join(here, "portrait-thumbnails.html"), html);
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    requests.push({ url: url.pathname, method: request.method ?? "GET", status: null, failed: false });
    const record = requests.at(-1);
    if (url.pathname === "/" || url.pathname === "/fixture.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(html);
      record.status = 200;
    } else if (url.pathname === "/assets/brackenwheel-portrait-painted.webp") {
      response.writeHead(200, { "content-type": "image/webp", "content-length": webpBytes.length, "cache-control": "no-store" });
      response.end(webpBytes);
      record.status = 200;
    } else if (url.pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      record.status = 204;
    } else {
      response.writeHead(404);
      response.end();
      record.status = 404;
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/fixture.html`;
  report.url = url;

  browser = await chromium.launch({
    executablePath: report.chromeBinary,
    headless: false,
    args: [],
  });
  report.browserVersion = browser.version();
  context = await browser.newContext({
    viewport: report.context.viewport,
    deviceScaleFactor: report.context.deviceScaleFactor,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth === 512));
  report.userAgent = await page.evaluate(() => navigator.userAgent);
  report.render = await page.evaluate(() => ({
    devicePixelRatio: window.devicePixelRatio,
    images: [...document.images].map((image) => {
      const box = image.getBoundingClientRect();
      const style = getComputedStyle(image);
      return {
        id: image.id,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        cssWidth: style.width,
        cssHeight: style.height,
        box: { x: box.x, y: box.y, width: box.width, height: box.height },
      };
    }),
  }));
  assert.equal(report.browserVersion, "155.0.8059.40");
  assert.equal(report.render.devicePixelRatio, 1);
  assert.deepEqual(report.render.images.map(({ box }) => [box.width, box.height]), [[64, 64], [128, 128]]);
  assert.ok(report.render.images.every((image) => image.complete && image.naturalWidth === 512 && image.naturalHeight === 512));

  const screenshotNames = [
    ["#portrait64", "portrait-thumbnail-64px.png"],
    ["#portrait128", "portrait-thumbnail-128px.png"],
  ];
  for (const [selector, name] of screenshotNames) {
    const path = join(here, name);
    await page.locator(selector).screenshot({ path, animations: "disabled", caret: "hide" });
    const png = readFileSync(path);
    report.screenshots.push({
      path: name,
      bytes: png.length,
      sha256: createHash("sha256").update(png).digest("hex"),
      dimensions: { width: png.readUInt32BE(16), height: png.readUInt32BE(20) },
    });
  }
  const fixturePath = join(here, "portrait-thumbnail-fixture.png");
  await page.screenshot({ path: fixturePath, fullPage: true, animations: "disabled", caret: "hide" });
  const fixturePng = readFileSync(fixturePath);
  report.screenshots.push({
    path: "portrait-thumbnail-fixture.png",
    bytes: fixturePng.length,
    sha256: createHash("sha256").update(fixturePng).digest("hex"),
    dimensions: { width: fixturePng.readUInt32BE(16), height: fixturePng.readUInt32BE(20) },
  });
  assert.deepEqual(report.screenshots.slice(0, 2).map(({ dimensions }) => [dimensions.width, dimensions.height]), [[64, 64], [128, 128]]);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.ok(requests.every(({ status, failed }) => status !== null && !failed));
  report.result = "PASS";
} catch (error) {
  report.result = "FAIL";
  report.error = error?.stack ?? String(error);
  process.exitCode = 1;
} finally {
  if (context) await context.close().catch((error) => { report.closeContextError = String(error); process.exitCode = 1; });
  if (browser) await browser.close().catch((error) => { report.closeBrowserError = String(error); process.exitCode = 1; });
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  writeFileSync(join(here, "portrait-native-capture.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
