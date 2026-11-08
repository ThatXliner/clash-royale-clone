// Checks the real pointer deploy path inside the scaled battle frame.
import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto("http://127.0.0.1:4391/public/index.html");
await page.click('[data-action="begin-battle"]');
const handle = await page.waitForSelector("iframe.battle-frame");
const frame = await handle.contentFrame();
await frame.waitForFunction(() => document.querySelector('[data-ui="arena-shell"]')?.dataset.renderer === "three", null, { timeout: 15000 });
await page.waitForTimeout(1500);
const ctl = () => frame.evaluate(async () => {
  const { arenaHudController: c } = await import("/src/ui/arena-shell-entry.js");
  return { selected: c.state.selectedCardId, tick: c.state.sessionTick, paused: c.state.paused };
});
const slots = await frame.$$('[data-ui="card-slot"]');
console.log("slots", slots.length, await ctl());
const slotBox = await slots[1].boundingBox();
console.log("slotBox", slotBox);
await slots[1].click();
console.log("after slot click", await ctl());
const box = await (await frame.$('[data-ui="arena"]')).boundingBox();
console.log("arena", box);
await page.mouse.click(box.x + box.width * (3.5 / 18), box.y + box.height * (1 - 13.5 / 32));
await page.waitForTimeout(300);
console.log("after arena click", await ctl(), await frame.evaluate(() => document.querySelectorAll(".combat-marker--south").length));
await browser.close();
