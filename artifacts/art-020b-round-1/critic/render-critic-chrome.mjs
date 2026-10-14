import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const checkout = '/tmp/art-020b-rivet-runners.HZPTr8/checkout-final';
const outputDir = resolve('artifacts/art-020b-round-1/critic');
const webpPath = resolve(checkout, 'public/assets/rivet-runners-battle-sprite.webp');
const webp = await readFile(webpPath);
const sha256 = await import('node:crypto').then(({ createHash }) => createHash('sha256').update(webp).digest('hex'));
const imageDataUrl = `data:image/webp;base64,${webp.toString('base64')}`;
const backgrounds = {
  dark: 'linear-gradient(140deg, #1c302b 0%, #354838 55%, #766044 100%)',
  light: 'linear-gradient(140deg, #f0e7d4 0%, #d5c59e 55%, #a89169 100%)',
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const size of [13, 26]) {
    for (const [background, paint] of Object.entries(backgrounds)) {
      const page = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 1 });
      await page.setContent(`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;padding:0;width:64px;height:64px}#stage{width:${size}px;height:${size}px;background:${paint};overflow:hidden}img{display:block;width:${size}px;height:${size}px;object-fit:contain}</style><div id="stage"><img id="sprite" src="${imageDataUrl}" alt=""></div>`);
      const metrics = await page.evaluate(async () => {
        const image = document.querySelector('#sprite');
        await image.decode();
        const rect = image.getBoundingClientRect();
        const stage = document.querySelector('#stage').getBoundingClientRect();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        let minAlpha = 255;
        let maxAlpha = 0;
        let transparentPixels = 0;
        let translucentPixels = 0;
        let opaquePixels = 0;
        const distinctAlpha = new Set();
        for (let i = 3; i < data.length; i += 4) {
          const alpha = data[i];
          minAlpha = Math.min(minAlpha, alpha);
          maxAlpha = Math.max(maxAlpha, alpha);
          distinctAlpha.add(alpha);
          if (alpha === 0) transparentPixels++;
          else if (alpha === 255) opaquePixels++;
          else translucentPixels++;
        }
        return {
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          renderedWidth: rect.width,
          renderedHeight: rect.height,
          stageWidth: stage.width,
          stageHeight: stage.height,
          devicePixelRatio: window.devicePixelRatio,
          alphaMin8Bit: minAlpha,
          alphaMax8Bit: maxAlpha,
          alphaDistinctValues: distinctAlpha.size,
          transparentPixels,
          translucentPixels,
          opaquePixels,
        };
      });
      const screenshotPath = resolve(outputDir, `fresh-chrome-css-${size}-${background}-dpr1.png`);
      await page.locator('#stage').screenshot({ path: screenshotPath, type: 'png' });
      results.push({ sizeCssPx: size, background, screenshot: screenshotPath, ...metrics });
      await page.close();
    }
  }
} finally {
  await browser.close();
}
const report = {
  browser: 'Google Chrome',
  version: browser.version(),
  source: webpPath,
  sha256,
  bytes: webp.length,
  renders: results,
};
await writeFile(resolve(outputDir, 'fresh-chrome-native-evidence.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
