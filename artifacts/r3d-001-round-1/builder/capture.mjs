// Builder capture: opens the shipped app, enters Battle, waits, screenshots.
// Usage: node capture.mjs <out-prefix> [--query=renderer=dom] [--seconds=0,20]
//        [--sizes=390x844,1280x800] [--reduced-motion]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const prefix = resolve(args[0] ?? "shot");
const option = (name, fallback) =>
  args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const query = option("query", "");
const seconds = option("seconds", "1").split(",").map(Number);
const sizes = option("sizes", "390x844,1280x800").split(",").map((size) => size.split("x").map(Number));
const deploy = args.includes("--deploy");
const reducedMotion = args.includes("--reduced-motion") ? "reduce" : "no-preference";
const base = option("url", "http://127.0.0.1:4173/public/index.html");
mkdirSync(dirname(prefix), { recursive: true });

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const problems = [];
for (const [width, height] of sizes) {
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: width < 600 ? 2 : 1, reducedMotion,
  });
  const page = await context.newPage();
  const record = (where) => (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      problems.push(`${width}x${height} ${where} ${message.type()}: ${message.text()}`);
    }
  };
  page.on("console", record("top"));
  page.on("pageerror", (error) => problems.push(`${width}x${height} pageerror: ${error.message}`));
  page.on("frameattached", () => {});
  await page.goto(`${base}${query ? `?${query}` : ""}`);
  await page.click('[data-action="begin-battle"]');
  const frame = await (await page.waitForSelector("iframe.battle-frame")).contentFrame();
  frame.page().on("console", () => {});
  await frame.waitForSelector('[data-ui="arena"]');
  let elapsed = 0;
  for (const target of seconds) {
    const wait = Math.max(0, target - elapsed);
    if (deploy && wait > 4) {
      // Deploy a few cards through the real pointer path so towers get hit.
      const end = Date.now() + wait * 1000;
      let lane = 0;
      while (Date.now() < end - 1500) {
        const slots = await frame.$$('[data-ui="card-slot"]');
        const arena = await frame.$('[data-ui="arena"]');
        const box = await arena.boundingBox();
        if (slots.length > 0 && box) {
          await slots[lane % slots.length].click().catch(() => {});
          const x = box.x + box.width * (lane % 2 === 0 ? 0.25 : 0.75);
          const y = box.y + box.height * 0.56;
          await page.mouse.click(x, y).catch(() => {});
        }
        lane += 1;
        await page.waitForTimeout(1500);
      }
      await page.waitForTimeout(Math.max(0, end - Date.now()));
    } else {
      await page.waitForTimeout(wait * 1000);
    }
    elapsed = target;
    const file = `${prefix}-${width}x${height}-${target}s.png`;
    await page.screenshot({ path: file });
    process.stdout.write(`${file}\n`);
  }
  await context.close();
}
await browser.close();
process.stdout.write(`${JSON.stringify({ problems }, null, 2)}\n`);
