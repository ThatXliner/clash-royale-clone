import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright/index.mjs';

const root = new URL('../../../', import.meta.url);
const fixtureUrl = new URL('artifacts/art-022p-round-1/builder/portrait-thumbnails.html', root);
const browserPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: browserPath, headless: false, args: [] });
try {
  const page = await browser.newPage({ viewport: { width: 500, height: 220 }, deviceScaleFactor: 1 });
  await page.goto(fixtureUrl.href, { waitUntil: 'load' });
  await page.locator('#portrait-64').evaluate((image) => image.decode());
  await page.locator('#portrait-128').evaluate((image) => image.decode());
  await page.screenshot({
    path: new URL('native-thumbnails-fixture.png', new URL('.', import.meta.url)).pathname,
    fullPage: true,
  });
  const box64 = await page.locator('#portrait-64').boundingBox();
  const box128 = await page.locator('#portrait-128').boundingBox();
  await page.screenshot({
    path: new URL('portrait-64px.png', new URL('.', import.meta.url)).pathname,
    clip: { x: box64.x, y: box64.y, width: box64.width, height: box64.height },
  });
  await page.screenshot({
    path: new URL('portrait-128px.png', new URL('.', import.meta.url)).pathname,
    clip: { x: box128.x, y: box128.y, width: box128.width, height: box128.height },
  });
  const result = await page.evaluate(() => ({
    devicePixelRatio: window.devicePixelRatio,
    image64: {
      cssWidth: document.querySelector('#portrait-64').getBoundingClientRect().width,
      cssHeight: document.querySelector('#portrait-64').getBoundingClientRect().height,
      naturalWidth: document.querySelector('#portrait-64').naturalWidth,
      naturalHeight: document.querySelector('#portrait-64').naturalHeight,
    },
    image128: {
      cssWidth: document.querySelector('#portrait-128').getBoundingClientRect().width,
      cssHeight: document.querySelector('#portrait-128').getBoundingClientRect().height,
      naturalWidth: document.querySelector('#portrait-128').naturalWidth,
      naturalHeight: document.querySelector('#portrait-128').naturalHeight,
    },
    userAgent: navigator.userAgent,
  }));
  const pngInfo = async (filename) => {
    const bytes = await readFile(new URL(filename, new URL('.', import.meta.url)));
    return {
      path: `artifacts/art-022p-round-1/builder/${filename}`,
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  };
  const metadata = {
    browser: await browser.version(),
    browserPath,
    node: process.version,
    playwright: '1.58.2',
    headless: false,
    customLaunchArgs: [],
    gpuFlags: 'none',
    fixtureUrl: fixtureUrl.href,
    layout: result,
    screenshots: await Promise.all([
      pngInfo('native-thumbnails-fixture.png'),
      pngInfo('portrait-64px.png'),
      pngInfo('portrait-128px.png'),
    ]),
  };
  await writeFile(new URL('browser-capture.json', new URL('.', import.meta.url)), `${JSON.stringify(metadata, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
} finally {
  await browser.close();
}
