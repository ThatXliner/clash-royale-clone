import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [assetPath, screenshotPath, metadataPath] = process.argv.slice(2);
if (!assetPath || !screenshotPath || !metadataPath) throw new Error('usage: render-native-browser.mjs asset.webp screenshot.png metadata.json');
const dataUrl = `data:image/webp;base64,${(await readFile(assetPath)).toString('base64')}`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 760, height: 440 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; background: #f0eee4; color: #24231e; font: 14px/1.3 system-ui, sans-serif; }
    h1 { margin: 0 0 16px; font-size: 17px; }
    .row { display: flex; gap: 26px; margin-bottom: 22px; align-items: flex-start; }
    .card { width: 345px; padding: 12px; border: 1px solid #aaa79e; background: #faf9f4; }
    .label { font-weight: 650; margin-bottom: 8px; }
    .samples { display: flex; gap: 18px; align-items: flex-start; }
    .native, .zoom { position: relative; background-color: #deded2; background-image: linear-gradient(45deg,#b9c4bb 25%,transparent 25%),linear-gradient(-45deg,#b9c4bb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#b9c4bb 75%),linear-gradient(-45deg,transparent 75%,#b9c4bb 75%); background-size: 8px 8px; background-position: 0 0,0 4px,4px -4px,-4px 0; }
    .native { width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; border: 1px solid #777; }
    .native img { display: block; image-rendering: auto; }
    .zoom { width: 104px; height: 104px; border: 1px solid #777; overflow: hidden; }
    .zoom img { position: absolute; left: 0; top: 0; display: block; image-rendering: pixelated; transform-origin: top left; }
    .caption { margin-top: 6px; font-size: 11px; color: #555; }
    footer { margin-top: 12px; font: 12px ui-monospace, monospace; color: #4c4b44; }
  </style></head><body><h1>WebP at native CSS pixels and magnified raster · browser DPR 1</h1>
  <div id="rows"></div><footer id="meta"></footer>
  <script>
    const source = ${JSON.stringify(dataUrl)};
    const sizes = [13, 26];
    const rows = document.querySelector('#rows');
    for (const size of sizes) {
      const row = document.createElement('section'); row.className = 'row';
      const card = document.createElement('div'); card.className = 'card';
      const label = document.createElement('div'); label.className = 'label'; label.textContent = size + ' × ' + size + ' CSS px';
      const samples = document.createElement('div'); samples.className = 'samples';
      const nativeWrap = document.createElement('div');
      const native = document.createElement('div'); native.className = 'native'; native.style.width = (size + 24) + 'px'; native.style.height = (size + 24) + 'px';
      const image = document.createElement('img'); image.src = source; image.width = size; image.height = size; native.append(image);
      const nc = document.createElement('div'); nc.className = 'caption'; nc.textContent = 'native image element'; nativeWrap.append(native, nc);
      const zoomWrap = document.createElement('div');
      const zoom = document.createElement('div'); zoom.className = 'zoom';
      const zi = document.createElement('img'); zi.src = source; zi.width = size; zi.height = size; zi.style.transform = 'scale(' + (104 / size) + ')'; zoom.append(zi);
      const zc = document.createElement('div'); zc.className = 'caption'; zc.textContent = 'same raster enlarged'; zoomWrap.append(zoom, zc);
      samples.append(nativeWrap, zoomWrap); card.append(label, samples); row.append(card); rows.append(row);
    }
    Promise.all([...document.images].map(img => img.decode())).then(() => {
      document.querySelector('#meta').textContent = 'devicePixelRatio=' + devicePixelRatio + '; naturalSize=' + document.images[0].naturalWidth + '×' + document.images[0].naturalHeight + '; CSS sizes=' + sizes.join('px, ') + 'px';
    });
  </script></body></html>`);
  await page.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth === 512));
  await page.screenshot({ path: screenshotPath });
  const metadata = await page.evaluate(() => ({
    browser: navigator.userAgent,
    devicePixelRatio,
    viewport: { width: innerWidth, height: innerHeight },
    images: [...document.images].map((img) => ({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, cssWidth: img.getBoundingClientRect().width, cssHeight: img.getBoundingClientRect().height })),
  }));
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
} finally {
  await browser.close();
}
