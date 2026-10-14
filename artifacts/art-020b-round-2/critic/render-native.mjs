import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium } from '/private/tmp/art020b-round2-critic/node_modules/playwright/index.mjs';

const root = process.cwd();
const outputDir = '/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/art-020b-round-2/critic';
const spritePath = resolve(root, 'public/assets/rivet-runners-battle-sprite.webp');
const spriteBytes = await readFile(spritePath);
await mkdir(outputDir, { recursive: true });
const spriteSha256 = createHash('sha256').update(spriteBytes).digest('hex');
const source = `data:image/webp;base64,${spriteBytes.toString('base64')}`;
const backgrounds = {
  dark: 'linear-gradient(140deg, #1c302b 0%, #354838 55%, #766044 100%)',
  light: 'linear-gradient(140deg, #f0e7d4 0%, #d5c59e 55%, #a89169 100%)',
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const renders = [];
try {
  for (const size of [13, 26]) {
    for (const [background, paint] of Object.entries(backgrounds)) {
      const page = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 1 });
      await page.setContent(`<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;padding:0;width:64px;height:64px}#stage{width:${size}px;height:${size}px;background:${paint};overflow:hidden}img{display:block;width:${size}px;height:${size}px;object-fit:contain}</style><div id="stage"><img id="sprite" src="${source}" alt=""></div>`);
      const metrics = await page.evaluate(async (nativeSize) => {
        const image = document.querySelector('#sprite');
        await image.decode();
        const imageRect = image.getBoundingClientRect();
        const stageRect = document.querySelector('#stage').getBoundingClientRect();
        const alpha = document.createElement('canvas');
        alpha.width = image.naturalWidth;
        alpha.height = image.naturalHeight;
        const alphaContext = alpha.getContext('2d', { willReadFrequently: true });
        alphaContext.drawImage(image, 0, 0);
        const imageData = alphaContext.getImageData(0, 0, alpha.width, alpha.height).data;
        let alphaMin8Bit = 255;
        let alphaMax8Bit = 0;
        let transparentPixels = 0;
        let translucentPixels = 0;
        let opaquePixels = 0;
        for (let i = 3; i < imageData.length; i += 4) {
          const a = imageData[i];
          alphaMin8Bit = Math.min(alphaMin8Bit, a);
          alphaMax8Bit = Math.max(alphaMax8Bit, a);
          if (a === 0) transparentPixels++;
          else if (a === 255) opaquePixels++;
          else translucentPixels++;
        }
        const nativeCanvas = document.createElement('canvas');
        nativeCanvas.width = nativeSize;
        nativeCanvas.height = nativeSize;
        const nativeContext = nativeCanvas.getContext('2d', { willReadFrequently: true });
        nativeContext.drawImage(image, 0, 0, nativeSize, nativeSize);
        const nativeData = nativeContext.getImageData(0, 0, nativeSize, nativeSize).data;
        const nativeColorGrid = [];
        for (let y = 0; y < nativeSize; y++) {
          let row = '';
          for (let x = 0; x < nativeSize; x++) {
            const i = (y * nativeSize + x) * 4;
            const [r, g, b, a] = nativeData.slice(i, i + 4);
            let c = '.';
            if (a >= 24) {
              if (g > r * 1.12 && g > 82 && b > r * 0.6) c = 'T';
              else if (r > 185 && g > 150 && b > 100 && r - g < 85) c = 'C';
              else if (r > 135 && r > g * 1.22 && g > b * 1.06) c = 'O';
              else if (Math.max(r, g, b) < 72) c = '#';
              else if (r > g * 1.1 && g > b * 1.02) c = 'B';
              else c = '?';
            }
            row += c;
          }
          nativeColorGrid.push(row);
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
          stagePixelWidth: stageRect.width * window.devicePixelRatio,
          stagePixelHeight: stageRect.height * window.devicePixelRatio,
          nativeColorGrid,
        };
      }, size);
      const screenshot = resolve(outputDir, `fresh-chrome-css-${size}-${background}-dpr1.png`);
      await page.locator('#stage').screenshot({ path: screenshot, type: 'png' });
      await page.locator('#sprite').evaluate((image) => image.remove());
      const backgroundScreenshot = resolve(outputDir, `fresh-chrome-background-css-${size}-${background}-dpr1.png`);
      await page.locator('#stage').screenshot({ path: backgroundScreenshot, type: 'png' });
      const screenshotBytes = await readFile(screenshot);
      const backgroundScreenshotBytes = await readFile(backgroundScreenshot);
      renders.push({
        sizeCssPx: size, background, screenshot,
        screenshotBytes: screenshotBytes.length,
        screenshotSha256: createHash('sha256').update(screenshotBytes).digest('hex'),
        backgroundScreenshot,
        backgroundScreenshotBytes: backgroundScreenshotBytes.length,
        backgroundScreenshotSha256: createHash('sha256').update(backgroundScreenshotBytes).digest('hex'),
        ...metrics,
      });
      await page.close();
    }
  }
} finally {
  await browser.close();
}
const report = {
  candidate: '473e853cfb6fc6a35476a82fb096cbef08e21835',
  browser: 'Google Chrome',
  browserVersion: browser.version(),
  sourcePath: spritePath,
  sourceSha256: spriteSha256,
  sourceBytes: spriteBytes.length,
  renders,
};
await writeFile(resolve(outputDir, 'fresh-native-browser-evidence.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
