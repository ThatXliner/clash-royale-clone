import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../../..');
const evidence = path.resolve(here, '..');
const imagePath = path.join(repo, 'public/assets/brackenwheel-battle-sprite.webp');
const imageBytes = fs.readFileSync(imagePath);
const imageData = `data:image/webp;base64,${imageBytes.toString('base64')}`;
const chromiumPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const expected = { width: 540, height: 960, deviceScaleFactor: 1 };
const cases = [
  { id: 'native-13-light', bodyCssPx: 13, tone: 'light' },
  { id: 'native-13-dark', bodyCssPx: 13, tone: 'dark' },
  { id: 'native-26-light', bodyCssPx: 26, tone: 'light' },
  { id: 'native-26-dark', bodyCssPx: 26, tone: 'dark' },
  { id: 'diagnostic-13-light-8x', bodyCssPx: 13 * 8, tone: 'light', diagnostic: true },
];
const colors = {
  light: 'linear-gradient(180deg, #9baa76 0%, #b2bf8a 38%, #a5b881 62%, #849d68 100%)',
  dark: 'linear-gradient(180deg, #344735 0%, #3e573d 38%, #304733 62%, #263a2b 100%)',
};

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function chromeProcesses() {
  const output = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' });
  return output.split('\n').flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (!match || !match[3].includes(chromiumPath) || !match[3].includes('--user-data-dir') || !match[3].includes('--headless')) return [];
    return [{ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] }];
  });
}
function pageMarkup(item) {
  const imageHeight = item.bodyCssPx * (512 / 492);
  const background = colors[item.tone];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    html, body { width: 540px; height: 960px; margin: 0; overflow: hidden; }
    body { position: relative; background: ${background}; }
    body::before { content: ""; position: absolute; inset: 0; opacity: .16;
      background-image: radial-gradient(ellipse at 20% 30%, rgba(234,238,194,.22), transparent 27%),
                        radial-gradient(ellipse at 79% 70%, rgba(24,45,27,.18), transparent 31%); }
    #unit { position: absolute; left: 270px; top: 480px; width: ${imageHeight}px; height: ${imageHeight}px;
      transform: translate(-50%, -50%); object-fit: fill; image-rendering: auto; }
  </style></head><body><img id="unit" src="${imageData}"></body></html>`;
}

const chromeBefore = chromeProcesses();
const browser = await chromium.launch({ headless: true, executablePath: chromiumPath });
const browserVersion = browser.version();
await new Promise(resolve => setTimeout(resolve, 100));
const chromeLaunched = chromeProcesses().filter(item => !chromeBefore.some(before => before.pid === item.pid));
const chromiumPids = chromeLaunched.map(item => item.pid);
const results = [];
try {
  for (const item of cases) {
    const page = await browser.newPage({ viewport: expected, deviceScaleFactor: expected.deviceScaleFactor });
    await page.setContent(pageMarkup(item), { waitUntil: 'load' });
    await page.locator('#unit').evaluate(img => img.decode());
    const measurement = await page.evaluate(() => {
      const image = document.querySelector('#unit');
      const r = image.getBoundingClientRect();
      return {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        cssFrame: { x: r.x, y: r.y, width: r.width, height: r.height },
      };
    });
    const file = path.join(evidence, 'images', `${item.id}.png`);
    const bytes = await page.screenshot({ path: file, type: 'png' });
    results.push({
      id: item.id,
      tone: item.tone,
      bodyCssPx: item.bodyCssPx,
      diagnostic: Boolean(item.diagnostic),
      derivedImageCssPx: item.bodyCssPx * (512 / 492),
      sourceAlphaBoundsGE128: [94, 10, 417, 502],
      expected,
      browserMeasurement: measurement,
      screenshot: { path: path.relative(repo, file), bytes: bytes.length, sha256: sha256(bytes) },
    });
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => setTimeout(resolve, 200));
}
const chromeAfter = chromeProcesses();
const chromeAfterPids = new Set(chromeAfter.map(item => item.pid));
const receipt = {
  method: 'Independent Playwright 1.58.2 render with installed Chrome; standalone image over two arena-tone gradients; no application UI or gameplay state.',
  chromeExecutable: chromiumPath,
  chromeVersion: browserVersion,
  launchedChromePids: chromiumPids,
  launchedChromeProcessesClosed: chromiumPids.length > 0 && chromiumPids.every(pid => !chromeAfterPids.has(pid)),
  chromeProcessTableAfterClose: chromeAfter,
  device: expected,
  asset: {
    path: path.relative(repo, imagePath),
    bytes: imageBytes.length,
    sha256: sha256(imageBytes),
    dimensions: [512, 512],
    measuredBodyAlphaGE128: { boundsXYXYExclusive: [94, 10, 417, 502], heightPixels: 492, canvasHeightPixels: 512 },
  },
  cases: results,
};
const receiptPath = path.join(evidence, 'receipts', 'independent-native-render.json');
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
