// Captures scripted battlefield moments from scenes.html and runs the
// renderer-only stress benchmark.
// Usage: node scenes.mjs <outDir> [--size=390x844] [--dpr=3] [--times=0.6,1.3] [--stress=60]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const out = resolve(args[0] ?? "scenes");
const [width, height] = option("size", "390x844").split("x").map(Number);
const dpr = Number(option("dpr", width < 600 ? "3" : "1"));
const times = option("times", "").split(",").filter(Boolean).map(Number);
const stress = Number(option("stress", "0"));
const reduced = args.includes("--reduced-motion");
const base = option("url", "http://127.0.0.1:4391/artifacts/r3d-003-round-1/builder/scenes.html");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr,
  reducedMotion: reduced ? "reduce" : "no-preference" });
const problems = [];
for (const t of times) {
  const page = await context.newPage();
  page.on("console", (message) => { if (message.type() === "error") problems.push(message.text()); });
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto(`${base}?scene=${option("scene", "showcase")}&t=${t}`);
  await page.waitForFunction(() => document.body.dataset.frozen === "true", null, { timeout: 30000 });
  await page.waitForTimeout(120);
  const file = `${out}/scene-${option("scene", "showcase")}-${width}x${height}${reduced ? "-reduced" : ""}-t${t}.png`;
  await page.screenshot({ path: file });
  console.log(file);
  await page.close();
}
if (stress > 0) {
  const page = await context.newPage();
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto(`${base}?scene=stress&units=${stress}`);
  await page.waitForFunction(() => window.__scene !== undefined, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    window.__intervals = [];
    let last = null;
    const tick = (now) => {
      if (last !== null) window.__intervals.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__scene.view.element.battlefieldDebug.resetTimings();
  });
  await page.waitForTimeout(8000);
  const result = await page.evaluate(() => ({
    intervals: window.__intervals,
    timings: window.__scene.view.element.battlefieldDebug.timings(),
    units: window.__scene.view.element.battlefieldDebug.units.liveCount,
    calls: window.__scene.view.element.battlefieldDebug.renderer.info.render.calls,
    triangles: window.__scene.view.element.battlefieldDebug.renderer.info.render.triangles,
  }));
  const stats = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    return { n: values.length, median: Number(at(0.5).toFixed(2)), p95: Number(at(0.95).toFixed(2)), max: Number(sorted.at(-1).toFixed(2)) };
  };
  const summary = { size: `${width}x${height}@${dpr}`, units: result.units, drawCalls: result.calls, triangles: result.triangles,
    frameInterval: stats(result.intervals), battlefieldCpuPerFrame: stats(result.timings.render),
    battlefieldCpuPerUpdate: stats(result.timings.update) };
  writeFileSync(`${out}/stress-${stress}-${width}x${height}.json`, `${JSON.stringify(summary, null, 1)}\n`);
  console.log(JSON.stringify(summary));
  await page.screenshot({ path: `${out}/stress-${stress}-${width}x${height}.png` });
}
console.log(JSON.stringify({ problems }));
await browser.close();
