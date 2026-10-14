const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require('/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright');

const outDir = __dirname;
const repo = path.resolve(outDir, '../../..');
const asset = path.join(repo, 'public/assets/buried-coil-revealed.webp');
const htmlPath = path.join(outDir, 'native-board.html');
const assetUrl = pathToFileURL(asset).href;
const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Buried Coil native arena pixel check</title>
<style>
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
  body { background: #60734d; }
  #board { position: fixed; inset: 0; background-color: #60734d;
    background-image: linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px),
      linear-gradient(rgba(15,28,18,.045) 1px, transparent 1px);
    background-size: 32px 32px; }
  #sprite { position: absolute; left: 100px; top: 100px; width: 13px; height: 13px;
    display: block; object-fit: fill; image-rendering: auto; }
</style>
<main id="board"><img id="sprite" src="${assetUrl}" alt=""></main>`;
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

(async () => {
  fs.writeFileSync(htmlPath, html);
  const browser = await chromium.launch({ headless: true });
  const report = {
    browser: `Playwright Chromium ${browser.version()}`,
    deviceScaleFactor: 1,
    assetSha256: sha(asset),
    assetBytes: fs.statSync(asset).size,
    viewports: []
  };
  try {
    for (const [label, width, height] of [['phone', 390, 844], ['desktop', 1440, 933]]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
      await page.locator('#sprite').evaluate((image) => image.decode());
      const metrics = await page.evaluate(() => {
        const image = document.querySelector('#sprite');
        const rect = image.getBoundingClientRect();
        return {
          dpr: window.devicePixelRatio,
          viewport: [innerWidth, innerHeight],
          natural: [image.naturalWidth, image.naturalHeight],
          css: [rect.width, rect.height],
          xy: [rect.x, rect.y],
          complete: image.complete
        };
      });
      const viewportShot = path.join(outDir, `${label}-native-board.png`);
      const pixelShot = path.join(outDir, `${label}-sprite-css13px-dpr1.png`);
      await page.screenshot({ path: viewportShot, fullPage: true });
      await page.evaluate(() => { document.documentElement.style.background = "transparent"; document.body.style.background = "transparent"; document.querySelector("#board").style.background = "transparent"; document.querySelector("#board").style.backgroundImage = "none"; });
      await page.locator('#sprite').screenshot({ path: pixelShot, omitBackground: true });
      report.viewports.push({
        label, ...metrics, consoleErrors: errors,
        viewportScreenshot: path.basename(viewportShot),
        viewportScreenshotSha256: sha(viewportShot),
        nativePixelScreenshot: path.basename(pixelShot),
        nativePixelScreenshotSha256: sha(pixelShot)
      });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, 'native-board-capture.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });

