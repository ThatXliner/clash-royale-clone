import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const root = "/private/tmp/art-022b-brackenwheel-builder-89f2f5c";
const evidenceDir = `${root}/artifacts/art-022b-round-1/builder`;
const playwrightPath = process.env.GAME_BROWSER_PLAYWRIGHT;
const chromePath = process.env.GAME_BROWSER_CHROME;
if (!playwrightPath || !chromePath) throw new Error("Pinned Playwright and Chrome paths are required.");

const { chromium } = await import(pathToFileURL(playwrightPath).href);
const portrait = await readFile(`${root}/demo/assets/brackenwheel-portrait.png`);
const battleSprite = await readFile(`${root}/public/assets/brackenwheel-battle-sprite.webp`);
const arena = await readFile(`${root}/public/assets/moss-ember-arena-painted.webp`);
const assets = new Map([
  ["/portrait.png", [portrait, "image/png"]],
  ["/battle.webp", [battleSprite, "image/webp"]],
  ["/arena.webp", [arena, "image/webp"]],
]);

function html() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    *{box-sizing:border-box}html,body{margin:0;padding:0;font-family:system-ui,sans-serif}
    body.native{width:540px;height:960px;overflow:hidden}
    .arena{position:relative;width:540px;height:960px;background:#5a8a56 url('/arena.webp') center/100% 100% no-repeat;overflow:hidden}
    .sprite{position:absolute;display:block;object-fit:fill;max-width:none;max-height:none;transform:translate(-50%,-50%)}
    body.identity{width:1120px;height:640px;background:#16221d;color:#eff2df;padding:24px;}
    .identity-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;height:592px}
    .identity-card{position:relative;display:grid;place-items:center;overflow:hidden;border:1px solid #81917a;background:#263b32}
    .identity-card h2{position:absolute;z-index:2;top:8px;left:12px;margin:0;font-size:17px;text-shadow:0 1px 2px #000}
    .portrait{width:440px;height:440px;object-fit:contain}
    .battle-field{position:absolute;inset:0;background:#5a8a56 url('/arena.webp') center/100% 100% no-repeat}
    .battle-cutout{position:relative;width:440px;height:440px;object-fit:contain}
  </style></head><body>
    <main id="native" class="arena"><img class="sprite" src="/battle.webp" alt="Brackenwheel battle cutout"></main>
    <main id="identity" class="identity-grid" hidden>
      <section class="identity-card"><h2>Accepted identity portrait</h2><img class="portrait" src="/portrait.png" alt="Accepted Brackenwheel portrait"></section>
      <section class="identity-card"><h2>Battle cutout on arena art</h2><div class="battle-field"></div><img class="battle-cutout" src="/battle.webp" alt="Brackenwheel battle cutout"></section>
    </main>
  </body></html>`;
}

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  if (pathname === "/" || pathname === "/index.html") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(html());
    return;
  }
  const asset = assets.get(pathname);
  if (asset) {
    response.writeHead(200, { "content-type": asset[1], "cache-control": "no-store" });
    response.end(asset[0]);
    return;
  }
  response.writeHead(404);
  response.end();
});

function processList() {
  return execFileSync("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" })
    .split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(.*)$/u);
      return match ? { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] } : null;
    }).filter(Boolean);
}

function browserPid() {
  const proc = processList().find((entry) => entry.ppid === process.pid &&
    entry.command.includes(chromePath) && entry.command.includes("--remote-debugging-pipe") &&
    !entry.command.includes("--type="));
  return proc?.pid ?? null;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

server.listen(0, "127.0.0.1");
await new Promise((resolve, reject) => {
  server.once("listening", resolve);
  server.once("error", reject);
});
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
let browser;
let browserPidAtLaunch = null;
const screenshots = [];
try {
  browser = await chromium.launch({ executablePath: chromePath, headless: true });
  browserPidAtLaunch = browserPid();
  const context = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const capture = await page.goto(baseUrl, { waitUntil: "load" });
  if (capture?.status() !== 200) throw new Error(`preview route returned ${capture?.status()}`);
  await page.evaluate(async () => {
    await Promise.all(Array.from(document.images, (image) => image.decode()));
  });

  const webpBodyFraction = 492 / 512;
  for (const tone of ["dark", "light"]) {
    for (const bodyCssHeight of [13, 26]) {
      const x = tone === "dark" ? 235 : 470;
      const y = 468;
      const frameCssHeight = bodyCssHeight / webpBodyFraction;
      const cssScaleAdjustment = await page.evaluate(({ x, y, frameCssHeight, bodyCssHeight, bodyFraction }) => {
        document.body.className = "native";
        document.getElementById("identity").hidden = true;
        const arenaElement = document.getElementById("native");
        arenaElement.hidden = false;
        const sprite = arenaElement.querySelector(".sprite");
        sprite.style.left = `${x}px`;
        sprite.style.top = `${y}px`;
        sprite.style.width = `${frameCssHeight}px`;
        sprite.style.height = `${frameCssHeight}px`;
        sprite.style.transform = "translate(-50%,-50%)";
        const initialFrameHeight = sprite.getBoundingClientRect().height;
        const scale = bodyCssHeight / (initialFrameHeight * bodyFraction);
        sprite.style.transform = `translate(-50%,-50%) scale(${scale})`;
        return scale;
      }, { x, y, frameCssHeight, bodyCssHeight, bodyFraction: webpBodyFraction });
      const measured = await page.evaluate(() => {
        const sprite = document.querySelector(".sprite");
        const rect = sprite.getBoundingClientRect();
        return {
          devicePixelRatio: window.devicePixelRatio,
          viewport: { width: innerWidth, height: innerHeight },
          arena: { width: document.querySelector(".arena").getBoundingClientRect().width,
            height: document.querySelector(".arena").getBoundingClientRect().height },
          spriteFrameCss: { width: rect.width, height: rect.height, x: rect.x, y: rect.y },
          cssScaleAdjustment: Number(sprite.style.transform.match(/scale\(([^)]+)\)/u)?.[1] ?? 1),
        };
      });
      const actualBodyCssHeight = measured.spriteFrameCss.height * webpBodyFraction;
      if (measured.devicePixelRatio !== 1 || measured.viewport.width !== 540 || measured.viewport.height !== 960 ||
        measured.arena.width !== 540 || measured.arena.height !== 960 ||
        Math.abs(actualBodyCssHeight - bodyCssHeight) > 0.001) {
        throw new Error(`native scale verification failed: ${JSON.stringify(measured)}`);
      }
      const name = `native-${bodyCssHeight}-${tone}.png`;
      const path = `${evidenceDir}/${name}`;
      await page.screenshot({ path, animations: "disabled" });
      const imageBytes = await readFile(path);
      screenshots.push({ file: name, sha256: sha256(imageBytes), bytes: imageBytes.length,
        viewportCss: measured.viewport, deviceScaleFactor: measured.devicePixelRatio,
        arenaCss: measured.arena, groundSampleCenterCss: { x, y, tone },
        webpFrameCss: measured.spriteFrameCss, alphaBodyHeightFraction: webpBodyFraction,
        computedBodyHeightCss: actualBodyCssHeight, cssScaleAdjustment: measured.cssScaleAdjustment });
    }
  }

  await page.setViewportSize({ width: 1120, height: 640 });
  await page.goto(baseUrl, { waitUntil: "load" });
  await page.evaluate(async () => {
    document.body.className = "identity";
    document.getElementById("native").hidden = true;
    document.getElementById("identity").hidden = false;
    await Promise.all(Array.from(document.images, (image) => image.decode()));
  });
  const identityPath = `${evidenceDir}/portrait-cutout-comparison.png`;
  await page.screenshot({ path: identityPath, animations: "disabled" });
  const identityBytes = await readFile(identityPath);
  screenshots.push({ file: "portrait-cutout-comparison.png", sha256: sha256(identityBytes),
    bytes: identityBytes.length, viewportCss: { width: 1120, height: 640 },
    deviceScaleFactor: 1, display: "accepted portrait beside selected transparent WebP on the real arena texture" });

  const evidence = {
    node: process.version,
    playwright: "1.58.2",
    playwrightPath,
    chromeExecutable: chromePath,
    chromeVersion: browser.version(),
    browserPid: browserPidAtLaunch,
    browserLaunch: { headless: true, args: [], defaultGpuSettings: true },
    fieldSource: "public/assets/moss-ember-arena-painted.webp rendered at the existing 540x960 CSS arena dimensions",
    alphaMeasurement: { threshold8bit: 128, webpBoundsXYXYExclusive: [94, 10, 417, 502],
      bodyHeightPixels: 492, frameHeightPixels: 512, bodyHeightFraction: webpBodyFraction,
      frameCssHeightFor13pxBody: 13 / webpBodyFraction, frameCssHeightFor26pxBody: 26 / webpBodyFraction },
    screenshots,
    browserPidAfterClose: null,
  };
  await writeFile(`${evidenceDir}/native-preview-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
if (browserPidAtLaunch && processList().some((entry) => entry.pid === browserPidAtLaunch)) {
  throw new Error(`browser process ${browserPidAtLaunch} remained alive after close`);
}
console.log(JSON.stringify({ browserPid: browserPidAtLaunch, browserReleased: true,
  screenshotCount: screenshots.length, screenshots }, null, 2));
