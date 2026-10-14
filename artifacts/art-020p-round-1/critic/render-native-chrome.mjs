import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { chromium } from "/tmp/codex-art020p-critic-20261013/node_modules/playwright/index.mjs";

const output = "/tmp/codex-art020p-pages-output";
const evidence = new URL("./", import.meta.url).pathname;
const assetPath = "game/public/assets/rivet-runners-portrait-painted.webp";
const asset = await readFile(join(output, assetPath));
const assetSha256 = createHash("sha256").update(asset).digest("hex");
const pageHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rivet Runners native portrait review</title>
<style>html,body{margin:0;background:#eeeae1;color:#24221e;font:12px system-ui,sans-serif}body{padding:8px}.row{display:flex;align-items:flex-start;gap:12px}figure{margin:0}img{display:block;object-fit:fill}#portrait64{width:64px;height:64px}#portrait128{width:128px;height:128px}figcaption{padding-top:4px}</style></head>
<body><main class="row"><figure><img id="portrait64" src="/${assetPath}" alt="Rivet Runners portrait at 64 CSS pixels"><figcaption>64 CSS px</figcaption></figure><figure><img id="portrait128" src="/${assetPath}" alt="Rivet Runners portrait at 128 CSS pixels"><figcaption>128 CSS px</figcaption></figure></main><output id="dpr"></output></body></html>`;

const mimeTypes = { ".webp": "image/webp", ".html": "text/html; charset=utf-8" };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/__review.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(pageHtml);
      return;
    }
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = resolve(output, relativePath);
    if (file !== output && !file.startsWith(`${output}${sep}`)) {
      response.writeHead(403);
      response.end("forbidden");
      return;
    }
    const bytes = await readFile(file);
    response.writeHead(200, { "content-type": mimeTypes[extname(file)] ?? "application/octet-stream" });
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end("not found");
  }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 240, height: 220 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/__review.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth === 512));
  const metrics = await page.evaluate(() => ({
    devicePixelRatio: window.devicePixelRatio,
    userAgent: navigator.userAgent,
    images: [...document.images].map((image) => {
      const bounds = image.getBoundingClientRect();
      return {
        id: image.id,
        alt: image.alt,
        cssWidth: bounds.width,
        cssHeight: bounds.height,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        currentSrc: image.currentSrc,
      };
    }),
  }));
  await page.locator("#portrait64").screenshot({ path: join(evidence, "rivet-runners-chrome-css64-dpr1.png") });
  await page.locator("#portrait128").screenshot({ path: join(evidence, "rivet-runners-chrome-css128-dpr1.png") });
  await page.screenshot({ path: join(evidence, "rivet-runners-chrome-native-pair.png"), fullPage: true });
  const result = {
    browser: "Google Chrome via Playwright channel=chrome",
    chromeVersion: browser.version(),
    headless: true,
    deviceScaleFactor: metrics.devicePixelRatio,
    pageUrl: `http://127.0.0.1:${address.port}/__review.html`,
    publishedAsset: assetPath,
    publishedAssetBytes: asset.byteLength,
    publishedAssetSha256: assetSha256,
    metrics,
    screenshots: [
      "rivet-runners-chrome-css64-dpr1.png",
      "rivet-runners-chrome-css128-dpr1.png",
      "rivet-runners-chrome-native-pair.png",
    ],
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  await import("node:fs/promises").then(({ writeFile }) => writeFile(join(evidence, "native-chrome-render.json"), `${JSON.stringify(result, null, 2)}\n`));
} finally {
  await browser.close();
  await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
}
