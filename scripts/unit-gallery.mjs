#!/usr/bin/env node
// Serves the unit model gallery with Vite's dev server.
//   node scripts/unit-gallery.mjs [--port 5199] [--host 127.0.0.1] [--open]
// The gallery is a development page only; it is not a release build entry.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const port = Number(option("--port", "5199"));
const host = option("--host", "127.0.0.1");

const server = await createServer({
  root,
  configFile: false,
  logLevel: "warn",
  server: { host, port, strictPort: false, open: args.includes("--open") ? "/public/unit-gallery.html" : false },
});
await server.listen();
const address = server.httpServer.address();
const url = `http://${host}:${address.port}/public/unit-gallery.html`;
process.stdout.write(`Unit gallery: ${url}\n  phone scale: ${url}?view=phone\n  frozen pose: ${url}?pose=walk\n`);

// --shots <dir>: render the standard review set with headless Chromium and exit.
const shotsDir = option("--shots", null);
if (shotsDir) {
  const { mkdir } = await import("node:fs/promises");
  const { chromium } = await import("playwright");
  await mkdir(shotsDir, { recursive: true });
  const browser = await chromium.launch({
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  const errors = [];
  const shots = [
    ...["idle", "walk", "attack", "hit", "death", "deploy"].map((pose) => ({
      name: `grid-${pose}`, query: `pose=${pose}`, viewport: { width: 1600, height: 1000 }, scale: 1,
    })),
    ...[
      "coilblade,mossguard,brassbolt,reedsting,briar-runner,briar-darter,cinderling,brackenwheel",
      "stonehauler,thornscout,forgeguard,ironroot,sunthread-warden,kilnkeeper,stormkite,copperskiff",
      "skymaul,duskwing,gloamwing,coppershade,ember-basin,buried-coil,aether-well,bulwark-needle",
    ].flatMap((kinds, index) => ["idle", "attack"].map((pose) => ({
      name: `closeup-${index + 1}-${pose}`, query: `pose=${pose}&cols=4&kinds=${kinds}`,
      viewport: { width: 1600, height: 900 }, scale: 1,
    }))),
    { name: "phone-idle-dpr3", query: "view=phone&pose=idle", viewport: { width: 390, height: 844 }, scale: 3 },
    { name: "phone-idle-dpr1", query: "view=phone&pose=idle", viewport: { width: 390, height: 844 }, scale: 1 },
    { name: "phone-walk-labels-dpr2", query: "view=phone&pose=walk&labels=1", viewport: { width: 390, height: 844 }, scale: 2 },
    { name: "phone-attack-dpr3", query: "view=phone&pose=attack", viewport: { width: 390, height: 844 }, scale: 3 },
  ];
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: shot.viewport, deviceScaleFactor: shot.scale });
    page.on("console", (message) => { if (message.type() === "error") errors.push(`${shot.name}: ${message.text()}`); });
    page.on("pageerror", (error) => errors.push(`${shot.name}: ${error.message}`));
    await page.goto(`${url}?${shot.query}`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__unitGallery?.ready === true, null, { timeout: 60_000 });
    await page.waitForTimeout(150);
    const path = resolve(shotsDir, `${shot.name}.png`);
    await page.screenshot({ path });
    process.stdout.write(`  wrote ${path}\n`);
    await page.close();
  }
  await browser.close();
  if (errors.length > 0) {
    process.stderr.write(`console errors:\n${errors.join("\n")}\n`);
    process.exitCode = 1;
  }
  await server.close();
  process.exit();
}

const stop = async () => {
  await server.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
