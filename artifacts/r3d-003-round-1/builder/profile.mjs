// CPU profile of the battle frame during a busy horde match (self time by file
// and by function), to see where frame time goes. Usage: node profile.mjs [query]
import { chromium } from "playwright";
const query = process.argv[2] ?? "";
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const page = await context.newPage();
await page.goto(`http://127.0.0.1:4391/public/index.html${query ? `?${query}` : ""}`);
await page.click('[data-action="begin-battle"]');
const handle = await page.waitForSelector("iframe.battle-frame");
const frame = await handle.contentFrame();
await frame.waitForSelector('[data-ui="arena"]');
await page.waitForTimeout(2500);
const post = (message) => page.evaluate((value) => {
  document.querySelector("iframe.battle-frame").contentWindow.postMessage(value, window.location.origin);
}, message);
const frameScale = await page.evaluate(() => {
  const target = document.querySelector("iframe.battle-frame");
  return target.getBoundingClientRect().width / target.offsetWidth;
});
const presentation = { bodyCssPixels: 13, frameScale };
await post({ active: false, channel: "moss-and-ember-battle", deckIds: ["coilblade", "mossguard", "copperskiff", "skymaul", "brassbolt", "reedsting", "briar-band", "cinderlings"], presentation });
await page.waitForTimeout(200);
const horde = ["cinder-host", "forgeguard", "gloamwing-cluster", "coppershade-flock", "briar-band", "thornscouts", "cinderlings", "duskwing-trio"];
await post({ active: false, channel: "moss-and-ember-battle", deckIds: horde, presentation });
await page.waitForTimeout(200);
await post({ active: true, channel: "moss-and-ember-battle", deckIds: horde, presentation });
const spots = [[4.5, 4.5], [13.5, 4.5], [9, 6.5]];
for (let i = 0; i < 16; i += 1) {
  const slots = await frame.$$('[data-ui="card-slot"]');
  const slotBox = await slots[i % slots.length].boundingBox();
  await page.mouse.click(slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2);
  const box = await (await frame.$('[data-ui="arena"]')).boundingBox();
  const [tx, ty] = spots[i % spots.length];
  await page.mouse.click(box.x + box.width * (tx / 18), box.y + box.height * (1 - ty / 32));
  await page.waitForTimeout(400);
}
const session = await context.newCDPSession(page);
await session.send("Profiler.enable");
await session.send("Profiler.setSamplingInterval", { interval: 200 });
await session.send("Profiler.start");
await page.waitForTimeout(3000);
const { profile } = await session.send("Profiler.stop");
const units = await frame.evaluate(() => document.querySelectorAll(".combat-marker--entity-ground,.combat-marker--entity-air").length);
const byId = new Map(profile.nodes.map((node) => [node.id, node]));
const self = new Map();
const dt = profile.timeDeltas;
profile.samples.forEach((id, index) => {
  self.set(id, (self.get(id) ?? 0) + (dt[index] ?? 0));
});
const byFile = new Map();
const byFn = new Map();
let total = 0;
for (const [id, micros] of self) {
  const node = byId.get(id);
  const url = node.callFrame.url.replace(/^.*\/(src|node_modules)\//u, "$1/") || node.callFrame.functionName || "(native)";
  total += micros;
  byFile.set(url, (byFile.get(url) ?? 0) + micros);
  const fn = `${node.callFrame.functionName || "(anon)"} ${url}:${node.callFrame.lineNumber}`;
  byFn.set(fn, (byFn.get(fn) ?? 0) + micros);
}
const top = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n)
  .map(([key, micros]) => `${(micros / 1000).toFixed(0).padStart(6)} ms ${(100 * micros / total).toFixed(1).padStart(5)}%  ${key}`);
console.log(`units=${units} sampled=${(total / 1000).toFixed(0)}ms`);
console.log(top(byFile, 18).join("\n"));
console.log("---");
console.log(top(byFn, 25).join("\n"));
await browser.close();
