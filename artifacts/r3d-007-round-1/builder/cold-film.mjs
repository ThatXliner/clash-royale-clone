// Films the cold first battle (fresh Chromium profile, Metal) from the Battle
// click until the 3D board is live, via a CDP screencast, and writes every
// frame with its time since the click plus the shell's renderer state.
// Usage: node cold-film.mjs <outDir> [--url=...] [--size=390x844] [--seconds=2.5]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const out = resolve(args.find((value) => !value.startsWith("--")) ?? "cold-film");
const base = option("url", "http://127.0.0.1:4417/public/index.html");
const [width, height] = option("size", "390x844").split("x").map(Number);
const seconds = Number(option("seconds", "2.5"));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
const page = await context.newPage();
const problems = [];
page.on("pageerror", (error) => problems.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !/status of 404/u.test(message.text())) problems.push(message.text());
});
await page.goto(base);
await page.waitForTimeout(600);
const cdp = await context.newCDPSession(page);
const frames = [];
let clickAt = null;
cdp.on("Page.screencastFrame", async ({ data, sessionId, metadata }) => {
  frames.push({ data, at: metadata.timestamp * 1000 });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
await page.waitForTimeout(150);
const states = [];
clickAt = Date.now();
await page.click('[data-action="begin-battle"]');
const until = clickAt + seconds * 1000;
while (Date.now() < until) {
  const state = await page.evaluate(() => {
    const frame = document.querySelector("iframe.battle-frame");
    const doc = frame?.contentDocument;
    const shell = doc?.querySelector('[data-ui="arena-shell"]');
    return {
      renderer: shell?.dataset.renderer ?? null,
      tick: Number(doc?.querySelector(".game-ui-hud-frame")?.dataset.tick ?? -1),
    };
  }).catch(() => ({ renderer: "?", tick: -1 }));
  states.push({ t: Date.now() - clickAt, ...state });
  await page.waitForTimeout(16);
}
await cdp.send("Page.stopScreencast");
const log = [];
for (const [index, frame] of frames.entries()) {
  const t = Math.round(frame.at - clickAt);
  if (t < -100) continue;
  const name = `f${String(index).padStart(3, "0")}-${String(Math.max(0, t)).padStart(4, "0")}ms.png`;
  writeFileSync(`${out}/${name}`, Buffer.from(frame.data, "base64"));
  log.push(name);
}
const transitions = states.filter((state, index) => index === 0 || state.renderer !== states[index - 1].renderer ||
  (state.tick > 0 && states[index - 1].tick <= 0));
writeFileSync(`${out}/states.json`, `${JSON.stringify({ transitions, problems, frames: log }, null, 1)}\n`);
console.log(JSON.stringify({ frames: log.length, transitions, problems }));
await browser.close();
