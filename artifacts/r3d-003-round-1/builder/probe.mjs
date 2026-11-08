// Builder probe: open the shipped app, enter Battle, report GPU, renderer
// state and console problems, take one screenshot.
// Usage: node probe.mjs <out.png> [baseUrl] [query]
import { chromium } from "playwright";

const out = process.argv[2] ?? "probe.png";
const base = process.argv[3] ?? "http://127.0.0.1:4391/public/index.html";
const query = process.argv[4] ?? "";
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"], channel: "chromium" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const page = await context.newPage();
const problems = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${message.text()}`);
});
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
await page.goto(`${base}${query}`);
await page.click('[data-action="begin-battle"]');
const frame = await (await page.waitForSelector("iframe.battle-frame")).contentFrame();
await frame.waitForSelector('[data-ui="arena"]');
const t0 = Date.now();
await frame.waitForFunction(() => document.querySelector('[data-ui="arena-shell"]')?.dataset.renderer === "three", null, { timeout: 15000 }).catch(() => {});
console.log("three after", Date.now() - t0, "ms");
const gpu = await frame.evaluate(() => {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2");
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});
console.log("gpu", gpu);
await page.waitForTimeout(Number(process.env.WAIT ?? 12000));
const tick = await frame.evaluate(() => document.querySelector(".game-ui-hud-frame")?.dataset.tick);
console.log("tick", tick);
await page.screenshot({ path: out });
console.log(JSON.stringify(problems, null, 1));
await browser.close();
