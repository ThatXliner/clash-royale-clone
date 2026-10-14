const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const html = path.join(__dirname, 'native-scale.html');
const artifactDir = __dirname;
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const version = browser.version();
  const report = { browser: `Playwright Chromium ${version}`, deviceScaleFactor: 1, viewports: [] };
  try {
    for (const [label, width, height] of [['phone', 390, 844], ['desktop', 1440, 933]]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
      page.on('pageerror', (err) => errors.push(err.message));
      await page.goto(pathToFileURL(html).href, { waitUntil: 'load' });
      await page.locator('#revealed').evaluate((img) => img.decode());
      const metrics = await page.evaluate(() => {
        const img = document.querySelector('#revealed');
        const r = img.getBoundingClientRect();
        return {
          dpr: window.devicePixelRatio,
          viewport: [innerWidth, innerHeight],
          natural: [img.naturalWidth, img.naturalHeight],
          css: [r.width, r.height],
          xy: [r.x, r.y],
          complete: img.complete,
          currentSrc: img.currentSrc,
        };
      });
      const full = path.join(artifactDir, `${label}-viewport.png`);
      const crop = path.join(artifactDir, `${label}-revealed-css-13px-dpr1.png`);
      await page.screenshot({ path: full, fullPage: true, omitBackground: true });
      await page.locator('#revealed').screenshot({ path: crop, omitBackground: true });
      report.viewports.push({ label, ...metrics, consoleErrors: errors, viewportScreenshot: path.basename(full), viewportScreenshotSha256: hash(full), pixelAlignedCrop: path.basename(crop), pixelAlignedCropSha256: hash(crop) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(artifactDir, 'native-scale-capture.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
