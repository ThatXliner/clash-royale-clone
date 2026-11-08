// R3D-006 cold first battle probe. Each run launches a fresh Chromium profile
// (empty HTTP and GPU shader caches) on Metal, opens the app, enters Battle and
// records, inside the battle frame: every long task (PerformanceObserver
// 'longtask', installed at document start), the moment the match becomes
// interactive (the HUD tick first advances) and the match tick 6 s later.
// Usage: node cold-start.mjs [--url=...] [--query=renderer=dom] [--runs=3]
import { chromium } from "playwright";

const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const base = option("url", "http://127.0.0.1:4391/public/index.html");
const query = option("query", "");
const runs = Number(option("runs", "3"));

const init = (bust) => {
  // --bust appends a per-run comment to every shader so neither Chrome's GPU
  // program cache nor the OS Metal cache can serve a previous compile.
  if (bust !== null) {
    for (const Context of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
      if (!Context) continue;
      const original = Context.prototype.shaderSource;
      Context.prototype.shaderSource = function shaderSource(shader, source) {
        return original.call(this, shader, `${source}\n// cold ${bust}\n`);
      };
    }
  }
  const probe = { longtasks: [], interactiveAt: null, tickAtSix: null, firstTick: null, clickAt: null };
  window.__coldProbe = probe;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) probe.longtasks.push([Math.round(entry.startTime), Math.round(entry.duration)]);
    }).observe({ type: "longtask", buffered: true });
  } catch {}
  const poll = () => {
    const node = document.querySelector(".game-ui-hud-frame");
    const tick = node ? Number(node.dataset.tick) : null;
    if (tick !== null && probe.firstTick === null) probe.firstTick = tick;
    if (tick !== null && probe.interactiveAt === null && tick > probe.firstTick) {
      probe.interactiveAt = performance.now();
      setTimeout(() => {
        probe.tickAtSix = Number(document.querySelector(".game-ui-hud-frame")?.dataset.tick ?? -1);
      }, 6000);
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
};

const results = [];
for (let run = 0; run < runs; run += 1) {
  const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  await context.addInitScript(init, args.includes("--bust") ? `${Date.now()}-${run}` : null);
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/status of 404/u.test(message.text())) problems.push(message.text());
  });
  await page.goto(`${base}${query ? `?${query}` : ""}`);
  await page.waitForTimeout(500);
  await page.click('[data-action="begin-battle"]');
  const clickedAt = Date.now();
  const frame = await (await page.waitForSelector("iframe.battle-frame")).contentFrame();
  await frame.waitForFunction(() => window.__coldProbe?.tickAtSix !== null, null, { timeout: 30000 });
  const probe = await frame.evaluate(() => window.__coldProbe);
  // The app page shares the event loop; read its long tasks too, mapped onto
  // the battle frame's clock.
  const topTasks = await page.evaluate(() => window.__coldProbe.longtasks);
  const offset = await frame.evaluate(() => performance.timeOrigin) - await page.evaluate(() => performance.timeOrigin);
  const topAfter = topTasks.map(([start, duration]) => [start - offset, duration])
    .filter(([start]) => start >= probe.interactiveAt).map(([start, duration]) => [Math.round(start - probe.interactiveAt), duration]);
  const renderer = await frame.evaluate(() => document.querySelector('[data-ui="arena-shell"]')?.dataset.renderer);
  const after = probe.longtasks.filter(([start]) => start >= probe.interactiveAt)
    .map(([start, duration]) => [Math.round(start - probe.interactiveAt), duration]);
  const before = probe.longtasks.filter(([start]) => start < probe.interactiveAt).map(([, duration]) => duration);
  const result = {
    run, renderer,
    interactiveAtFrameMs: Math.round(probe.interactiveAt),
    tickAtSixSeconds: probe.tickAtSix,
    longtasksAfterInteractive: after,
    maxLongtaskAfterInteractive: after.reduce((max, [, duration]) => Math.max(max, duration), 0),
    longtasksBeforeInteractive: before,
    appPageLongtasksAfterInteractive: topAfter,
    wallClickToProbeMs: Date.now() - clickedAt,
    problems,
  };
  results.push(result);
  console.log(JSON.stringify(result));
  await browser.close();
}
