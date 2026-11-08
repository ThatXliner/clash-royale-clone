// Lists every element under a page point inside the battle frame.
// Usage: node debug-point.mjs <x> <y> [waitMs]
import { chromium } from "playwright";
const [x, y] = [Number(process.argv[2]), Number(process.argv[3])];
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto("http://127.0.0.1:4391/public/index.html");
await page.click('[data-action="begin-battle"]');
const handle = await page.waitForSelector("iframe.battle-frame");
const frame = await handle.contentFrame();
await frame.waitForFunction(() => document.querySelector('[data-ui="arena-shell"]')?.dataset.renderer === "three", null, { timeout: 15000 });
await page.waitForTimeout(Number(process.argv[4] ?? 4000));
const box = await handle.boundingBox();
const scale = await page.evaluate(() => {
  const frame = document.querySelector("iframe.battle-frame");
  return frame.getBoundingClientRect().width / frame.offsetWidth;
});
const local = { x: (x - box.x) / scale, y: (y - box.y) / scale };
const hits = await frame.evaluate(({ x, y }) => document.elementsFromPoint(x, y).map((node) =>
  `${node.tagName.toLowerCase()}.${String(node.className?.baseVal ?? node.className).replace(/ /g, ".")} ${node.dataset?.ui ?? ""} ${getComputedStyle(node).display}`), local);
console.log(JSON.stringify({ local, hits }, null, 1));
await browser.close();
