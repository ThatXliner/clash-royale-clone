import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const root = process.cwd();
const outputDir = resolve(root, 'artifacts/art-020b-round-2/builder');
const webpPath = resolve(root, 'public/assets/rivet-runners-battle-sprite.webp');
await mkdir(outputDir, { recursive: true });
const bytes = await readFile(webpPath);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const source = `data:image/webp;base64,${bytes.toString('base64')}`;
const backgrounds = {
  dark: 'linear-gradient(140deg, #1c302b 0%, #354838 55%, #766044 100%)',
  light: 'linear-gradient(140deg, #f0e7d4 0%, #d5c59e 55%, #a89169 100%)',
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const browserVersion = browser.version();
const renders = [];
try {
  for (const size of [13, 26]) {
    for (const [background, paint] of Object.entries(backgrounds)) {
      const page = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 1 });
      await page.setContent(`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;padding:0;width:64px;height:64px}#stage{width:${size}px;height:${size}px;background:${paint};overflow:hidden}img{display:block;width:${size}px;height:${size}px;object-fit:contain}</style><div id="stage"><img id="sprite" src="${source}" alt=""></div>`);
      const metrics = await page.evaluate(async () => {
        const image = document.querySelector('#sprite');
        await image.decode();
        const imageRect = image.getBoundingClientRect();
        const stageRect = document.querySelector('#stage').getBoundingClientRect();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        let alphaMin8Bit = 255;
        let alphaMax8Bit = 0;
        let transparentPixels = 0;
        let translucentPixels = 0;
        let opaquePixels = 0;
        for (let i = 3; i < data.length; i += 4) {
          const alpha = data[i];
          alphaMin8Bit = Math.min(alphaMin8Bit, alpha);
          alphaMax8Bit = Math.max(alphaMax8Bit, alpha);
          if (alpha === 0) transparentPixels++;
          else if (alpha === 255) opaquePixels++;
          else translucentPixels++;
        }
        return {
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          renderedWidth: imageRect.width,
          renderedHeight: imageRect.height,
          stageWidth: stageRect.width,
          stageHeight: stageRect.height,
          devicePixelRatio: window.devicePixelRatio,
          alphaMin8Bit,
          alphaMax8Bit,
          transparentPixels,
          translucentPixels,
          opaquePixels,
        };
      });
      const screenshot = resolve(outputDir, `native-chrome-css-${size}-${background}-dpr1.png`);
      await page.locator('#stage').screenshot({ path: screenshot, type: 'png' });
      renders.push({ sizeCssPx: size, background, screenshot, ...metrics });
      await page.close();
    }
  }
} finally {
  await browser.close();
}
const report = { browser: 'Google Chrome', version: browserVersion, source: webpPath, sha256, bytes: bytes.length, renders };
await writeFile(resolve(outputDir, 'native-chrome-evidence.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
