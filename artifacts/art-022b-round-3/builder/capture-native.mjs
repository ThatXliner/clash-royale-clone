import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const evidence = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const captureDir = join(evidence, "native-captures");
const profile = join(evidence, "chrome-profile");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const spritePath = new URL("../../../public/assets/brackenwheel-battle-sprite.webp", import.meta.url).pathname;
const arenaPath = new URL("../../../demo/assets/moss-ember-arena-painted.png", import.meta.url).pathname;
const spriteBytes = await readFile(spritePath);
const arenaBytes = await readFile(arenaPath);
const spriteData = spriteBytes.toString("base64");
const arenaData = arenaBytes.toString("base64");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const chromeVersion = spawnSync(chromePath, ["--version"], { encoding: "utf8" });
const ownedChromePids = () => {
  const result = spawnSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout.split("\n").flatMap((line) => {
    if (!line.includes(profile)) return [];
    const match = line.trim().match(/^(\d+)\s+(.*)$/);
    return match ? [{ pid: Number(match[1]), command: match[2] }] : [];
  });
};

await mkdir(captureDir, { recursive: true });
await rm(profile, { recursive: true, force: true });

const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  executablePath: chromePath,
  viewport: { width: 540, height: 960 },
  deviceScaleFactor: 1,
  args: [],
});
let ownedPidsAtCapture = [];
let contextClosed = false;
let ownedPidsAfterClose = [];
let profileRemoved = false;

try {
  const page = context.pages()[0] ?? await context.newPage();
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    html, body { width: 540px; height: 960px; margin: 0; overflow: hidden; }
    .arena { position: relative; width: 540px; height: 960px; overflow: hidden; }
    .background { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; }
    .arena[data-tone="light"] .background { filter: brightness(1.15) saturate(.78) contrast(.96); }
    .arena[data-tone="dark"] .background { filter: brightness(.43) saturate(.82) contrast(1.08); }
    .sprite { position: absolute; left: 50%; top: 50%; width: 1px; height: 1px; transform: translate(-50%, -50%); image-rendering: auto; }
  </style></head><body><main class="arena" data-tone="light">
    <img class="background" alt="" src="data:image/png;base64,${arenaData}">
    <img class="sprite" alt="" src="data:image/webp;base64,${spriteData}">
  </main></body></html>`;
  await page.setContent(html, { waitUntil: "load" });
  const source = await page.evaluate(async () => {
    const img = document.querySelector(".sprite");
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1, count = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] >= 128) {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); count++;
      }
    }
    return {
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      alpha128Bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
      alpha128Pixels: count,
      devicePixelRatio: window.devicePixelRatio,
    };
  });
  const captures = [];
  for (const targetBodyPx of [13, 26]) for (const tone of ["light", "dark"]) {
    const sizing = await page.evaluate(({ targetBodyPx, tone, alphaHeight, naturalHeight }) => {
      const arena = document.querySelector(".arena");
      const img = document.querySelector(".sprite");
      arena.dataset.tone = tone;
      const size = targetBodyPx * naturalHeight / alphaHeight;
      img.style.width = `${size}px`;
      img.style.height = `${size}px`;
      const r = img.getBoundingClientRect();
      return {
        requestedBodyCssPx: targetBodyPx,
        imageCssSizePx: r.width,
        measuredBodyCssPx: alphaHeight * r.height / naturalHeight,
        devicePixelRatio: window.devicePixelRatio,
      };
    }, { targetBodyPx, tone, alphaHeight: source.alpha128Bounds.height, naturalHeight: source.naturalHeight });
    const name = `${targetBodyPx}-css-${tone}-native.png`;
    const path = join(captureDir, name);
    await page.screenshot({ path, fullPage: false, animations: "disabled" });
    captures.push({ ...sizing, tone, path, screenshotPixels: "540x960" });
  }
  ownedPidsAtCapture = ownedChromePids();
  const ownership = {
    chromePath,
    chromeVersion: chromeVersion.stdout.trim(),
    chromeVersionExit: chromeVersion.status,
    playwrightVersion: "1.58.2",
    browserPid: ownedPidsAtCapture[0]?.pid ?? null,
    ownedChromeProcesses: ownedPidsAtCapture,
    profile,
    headed: true,
    customLaunchArgs: [],
    closed: false,
  };
  await writeFile(join(evidence, "browser-ownership.json"), JSON.stringify(ownership, null, 2) + "\n");
  await writeFile(join(evidence, "native-measurements.json"), JSON.stringify({
    capture_environment: {
      chrome: chromeVersion.stdout.trim(),
      playwright: "1.58.2",
      device_pixel_ratio: 1,
      viewport: "540x960",
      actual_shipped_webp: true,
      enlarged_image_substitution: false,
      sprite_sha256: sha256(spriteBytes),
      arena_sha256: sha256(arenaBytes),
    },
    source,
    captures,
  }, null, 2) + "\n");
  console.log(JSON.stringify({ ownership, source, captures }, null, 2));
} finally {
  await context.close();
  contextClosed = true;
  await new Promise((resolve) => setTimeout(resolve, 300));
  ownedPidsAfterClose = ownedChromePids();
  await rm(profile, { recursive: true, force: true });
  profileRemoved = true;
  await writeFile(join(evidence, "browser-closure.json"), JSON.stringify({
    browserPid: ownedPidsAtCapture[0]?.pid ?? null,
    ownedPidsAtCapture: ownedPidsAtCapture.map(({ pid }) => pid),
    contextClosed,
    ownedPidsStillAliveAfterClose: ownedPidsAfterClose.map(({ pid }) => pid),
    profile,
    profileRemoved,
  }, null, 2) + "\n");
  if (ownedPidsAfterClose.length) process.exitCode = 2;
}
