import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const output = resolve(root, "artifacts/art-022l-round-1/builder");
const playwrightPath = process.env.GAME_BROWSER_PLAYWRIGHT;
const chromePath = process.env.GAME_BROWSER_CHROME;
if (!playwrightPath || !chromePath || !playwrightPath.startsWith("/")) {
  throw new Error("Absolute GAME_BROWSER_PLAYWRIGHT and GAME_BROWSER_CHROME paths are required.");
}
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".webp", "image/webp"],
]);
const allowedFiles = new Map([
  ["/demo/brackenwheel-scale-art.html", "demo/brackenwheel-scale-art.html"],
  ["/demo/brackenwheel-scale-art.js", "demo/brackenwheel-scale-art.js"],
  ["/src/ui/brackenwheel-art.js", "src/ui/brackenwheel-art.js"],
  ["/public/assets/brackenwheel-battle-sprite.webp", "public/assets/brackenwheel-battle-sprite.webp"],
]);
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const relativePath = allowedFiles.get(pathname);
  if (!relativePath) {
    response.writeHead(404).end();
    return;
  }
  try {
    const bytes = await readFile(resolve(root, relativePath));
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": bytes.length,
      "Content-Type": contentTypes.get(extname(relativePath)) ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    }).end(bytes);
  } catch {
    response.writeHead(500).end();
  }
});

server.listen(0, "127.0.0.1");
await new Promise((resolveListening, reject) => {
  server.once("listening", resolveListening);
  server.once("error", reject);
});
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const captures = [];
let browser;
let capturedBrowserVersion;
try {
  browser = await chromium.launch({
    args: [
      "--force-color-profile=srgb",
      "--force-device-scale-factor=1",
      "--disable-gpu",
      "--use-angle=swiftshader",
      "--font-render-hinting=none",
      "--disable-lcd-text",
    ],
    executablePath: chromePath,
    headless: true,
  });
  capturedBrowserVersion = browser.version();
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { width: 540, height: 960 },
  });
  for (const tone of ["light", "dark"]) {
    for (const bodyCssPixels of [13, 26]) {
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(String(error)));
      const pageUrl = `${baseUrl}/demo/brackenwheel-scale-art.html?body=${bodyCssPixels}&tone=${tone}`;
      const response = await page.goto(pageUrl, { waitUntil: "networkidle" });
      if (response?.status() !== 200) throw new Error(`fixture returned HTTP ${response?.status()}`);
      await page.waitForFunction(() => document.documentElement.dataset.fixtureReady === "true");
      const metrics = await page.evaluate(() => {
        const arena = document.querySelector("[data-art-host]");
        const art = arena.firstElementChild;
        const rect = art.getBoundingClientRect();
        const bodyCssPixels = Number(arena.dataset.bodyCssPixels);
        const native = art.tagName.toLowerCase() === "svg";
        const measureFraction = native ? 28.4 / 32 : 501 / 512;
        const box = native ? art.getBBox() : null;
        return {
          arenaCssPixels: {
            height: arena.getBoundingClientRect().height,
            width: arena.getBoundingClientRect().width,
          },
          artFrameCssPixels: { height: rect.height, width: rect.width, x: rect.x, y: rect.y },
          bodyCssPixels,
          devicePixelRatio: window.devicePixelRatio,
          figureCssPixelsFromSourceBounds: rect.height * measureFraction,
          nativeGeometryBounds: box ? { height: box.height, width: box.width, x: box.x, y: box.y } : null,
          naturalImagePixels: native ? null : { height: art.naturalHeight, width: art.naturalWidth },
          renderer: art.dataset.renderer,
          tone: arena.dataset.tone,
          viewportCssPixels: { height: innerHeight, width: innerWidth },
        };
      });
      const expectedRenderer = bodyCssPixels < 26 ? "native-svg" : "painted-webp";
      if (metrics.devicePixelRatio !== 1 || metrics.viewportCssPixels.width !== 540 ||
          metrics.viewportCssPixels.height !== 960 || metrics.arenaCssPixels.width !== 540 ||
          metrics.arenaCssPixels.height !== 960 || metrics.renderer !== expectedRenderer ||
          Math.abs(metrics.figureCssPixelsFromSourceBounds - bodyCssPixels) > 0.01 || pageErrors.length > 0) {
        throw new Error(`native-scale verification failed: ${JSON.stringify({ metrics, pageErrors })}`);
      }
      if (metrics.naturalImagePixels &&
          (metrics.naturalImagePixels.width !== 512 || metrics.naturalImagePixels.height !== 512)) {
        throw new Error(`painted image natural dimensions changed: ${JSON.stringify(metrics.naturalImagePixels)}`);
      }
      const name = `${bodyCssPixels}-css-${tone}.png`;
      const path = resolve(output, name);
      const screenshot = await page.screenshot({ fullPage: true, path });
      captures.push({
        file: name,
        pageErrors,
        pageUrl,
        png: {
          bytes: screenshot.length,
          height: screenshot.readUInt32BE(20),
          sha256: createHash("sha256").update(screenshot).digest("hex"),
          width: screenshot.readUInt32BE(16),
        },
        metrics,
      });
      await page.close();
    }
  }
  await context.close();
} finally {
  if (browser) await browser.close();
  await new Promise((resolveClose, reject) => server.close((error) =>
    error ? reject(error) : resolveClose()));
}

const evidence = {
  browserVersion: capturedBrowserVersion,
  chromeExecutable: chromePath,
  deviceScaleFactor: 1,
  fixture: "demo/brackenwheel-scale-art.html",
  viewport: { height: 960, width: 540 },
  captures,
};
await writeFile(resolve(output, "browser-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
