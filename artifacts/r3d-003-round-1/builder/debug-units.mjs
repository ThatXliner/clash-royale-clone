import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("console", m.text(), m.location().url); });
await page.goto("http://127.0.0.1:4391/public/index.html");
await page.click('[data-action="begin-battle"]');
const frame = await (await page.waitForSelector("iframe.battle-frame")).contentFrame();
await frame.waitForFunction(() => document.querySelector('[data-ui="arena-shell"]')?.dataset.renderer === "three", null, { timeout: 15000 });
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(3000);
  const info = await frame.evaluate(() => {
    const dbg = document.querySelector('[data-ui="battlefield-3d"]').battlefieldDebug;
    const out = [];
    dbg.units.group.children[0].children.forEach((holder) => {
      const m = holder.children[0];
      const mover = m.getObjectByName("mover");
      const mesh = mover.children.find((c) => c.isSkinnedMesh);
      const bone = mesh.skeleton.bones[0];
      const w = bone.getWorldPosition(new bone.position.constructor());
      out.push(`bone0=${bone.name} ${w.x.toFixed(2)},${w.y.toFixed(2)},${w.z.toFixed(2)} meshvis=${mesh.visible} mat=${mesh.material.name} lift=${m.getObjectByName("lift").position.y.toFixed(2)} kind=${m.name}`);
      out.push(`${holder.name} pos=${holder.position.x.toFixed(1)},${holder.position.y.toFixed(2)},${holder.position.z.toFixed(1)} vis=${m.visible}/${mover.visible} moverScale=${mover.scale.x.toFixed(2)} children=${mover.children.length} rot=${mover.rotation.x.toFixed(2)}`);
    });
    return { tick: document.querySelector(".game-ui-hud-frame")?.dataset.tick, out, calls: dbg.renderer.info.render.calls };
  });
  console.log(JSON.stringify(info, null, 1));
}
await page.screenshot({ path: process.argv[2] });
await browser.close();
