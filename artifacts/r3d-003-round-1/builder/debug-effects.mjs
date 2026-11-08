// Samples the effect layer's live visual count and the feed during a match.
import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto("http://127.0.0.1:4391/public/index.html");
await page.click('[data-action="begin-battle"]');
const handle = await page.waitForSelector("iframe.battle-frame");
const frame = await handle.contentFrame();
await frame.waitForFunction(() => document.querySelector('[data-ui="arena-shell"]')?.dataset.renderer === "three", null, { timeout: 15000 });
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(250);
  const info = await frame.evaluate(() => {
    const debug = document.querySelector('[data-ui="battlefield-3d"]').battlefieldDebug;
    const meshes = {};
    debug.effects.group.traverse((node) => {
      if (!node.isInstancedMesh) return;
      meshes[node.name] = node.count;
      if (node.count > 0) {
        const m = new node.matrixWorld.constructor();
        node.getMatrixAt(0, m);
        meshes[node.name + "@"] = [m.elements[12], m.elements[13], m.elements[14]].map((v) => v.toFixed(2)).join(",") + " s=" + Math.hypot(m.elements[0], m.elements[1], m.elements[2]).toFixed(2);
      }
    });
    return { tick: document.querySelector(".game-ui-hud-frame")?.dataset.tick, active: debug.effects.activeCount, meshes,
      domProjectiles: document.querySelectorAll(".combat-effect-projectile").length };
  });
  console.log(JSON.stringify(info));
}
await browser.close();
