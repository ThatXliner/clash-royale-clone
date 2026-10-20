import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from '/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright/index.mjs';

const require = createRequire(import.meta.url);
const repo = '/Users/me/.codex/worktrees/9456/clash-royale-clone';
const proposal = path.join(repo, 'design/20261020-redesign/claude');
const output = '/Users/me/.codex/clash-qualification/20261020-design-critic';
const sourceNames = ['design-board.html', 'art-direction.md', 'character-to-3D-handoff.md', 'motion-direction.md'];
const frames = [
  ['f-phone-landing', 390, 844], ['f-phone-deck', 390, 844], ['f-phone-battle', 390, 844],
  ['f-desk-landing', 1440, 933], ['f-desk-deck', 1440, 933], ['f-desk-battle', 1440, 933],
  ['s-cast', 1800, 1200],
];
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const sourceHashes = Object.fromEntries(sourceNames.map((name) => [
  `design/20261020-redesign/claude/${name}`,
  sha256(fs.readFileSync(path.join(proposal, name))),
]));
const rendererScriptSha256 = sha256(fs.readFileSync(new URL(import.meta.url)));
const requestLog = [];
const externalAttempts = [];
const consoleLog = [];
const pageErrors = [];
let browser;

function getBrowserPid() {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' }).split('\n');
  for (const row of rows) {
    const match = row.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (match && Number(match[2]) === process.pid && /chrome-headless-shell/.test(match[3]) && !/--type=/.test(match[3])) {
      return Number(match[1]);
    }
  }
  return null;
}

async function main() {
  browser = await chromium.launch({ headless: true });
  const browserPid = getBrowserPid();
  const context = await browser.newContext({
    viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false,
  });
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    requestLog.push(url);
    if (/^https?:\/\//i.test(url)) {
      externalAttempts.push(url);
      await route.abort('blockedbyclient');
    } else {
      await route.continue();
    }
  });
  const page = await context.newPage();
  page.on('console', (message) => consoleLog.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  const boardPath = path.join(proposal, 'design-board.html');
  const boardUrl = pathToFileURL(boardPath).href;
  console.log(`renderer_pid=${process.pid}`);
  console.log(`renderer_ppid=${process.ppid}`);
  console.log(`node=${process.execPath} ${process.version}`);
  console.log(`playwright=${require('/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright/package.json').version}`);
  console.log(`browser_version=${browser.version()}`);
  console.log(`browser_pid=${browserPid}`);
  console.log(`browser_executable=${chromium.executablePath()}`);
  console.log(`board_url=${boardUrl}`);
  console.log(`screenshot_method=locator.scrollIntoViewIfNeeded + page.screenshot(clip=measured CSS box); no scaling, no CSS/style injection`);
  await page.goto(boardUrl, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const pageMetrics = await page.evaluate(() => ({
    title: document.title, url: location.href,
    dpr: devicePixelRatio, fontStatus: document.fonts.status,
    fontFaces: [...document.fonts].map((face) => ({ family: face.family, status: face.status })),
    externalResourceElements: [...document.querySelectorAll('img,script[src],link[rel="stylesheet"],iframe,video,source')]
      .map((element) => element.currentSrc || element.src || element.href || ''),
  }));
  console.log(`page_metrics=${JSON.stringify(pageMetrics)}`);
  const captures = [];
  for (const [id, width, height] of frames) {
    await page.setViewportSize({ width, height });
    const locator = page.locator(`#${id}`);
    const count = await locator.count();
    if (count !== 1) throw new Error(`expected one #${id}, found ${count}`);
    await locator.scrollIntoViewIfNeeded();
    const measurement = await locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        cssWidth: style.width, cssHeight: style.height,
        status: element.getAttribute('data-status'), overflow: style.overflow,
        scrollX, scrollY, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      };
    });
    if (measurement.width !== width || measurement.height !== height) {
      throw new Error(`${id} measured ${measurement.width}x${measurement.height}; expected CSS box ${width}x${height}`);
    }
    const screenshotPath = path.join(output, `${id}.png`);
    await page.screenshot({
      path: screenshotPath,
      clip: { x: measurement.x, y: measurement.y, width: measurement.width, height: measurement.height },
      animations: 'allow',
    });
    const bytes = fs.readFileSync(screenshotPath);
    const pngPixels = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    if (pngPixels.width !== width || pngPixels.height !== height) {
      throw new Error(`${id} PNG is ${pngPixels.width}x${pngPixels.height}; expected ${width}x${height}`);
    }
    const item = {
      id, screenshot: screenshotPath, screenshotSha256: sha256(bytes), bytes: bytes.length,
      pngPixels, measuredCssBox: measurement,
    };
    captures.push(item);
    console.log(`capture=${JSON.stringify(item)}`);
  }
  const runtime = {
    platform: process.platform, arch: process.arch, osRelease: os.release(),
    macOSVersion: execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim(),
    cwd: process.cwd(), execPath: process.execPath, nodeVersion: process.version,
    rendererPid: process.pid, rendererPpid: process.ppid, browserPid, browserVersion: browser.version(),
    browserExecutable: chromium.executablePath(),
    playwrightVersion: require('/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright/package.json').version,
    selectedEnvironmentVariables: Object.fromEntries(['PATH', 'NODE_OPTIONS', 'PLAYWRIGHT_BROWSERS_PATH', 'CI', 'LANG', 'TERM'].map((key) => [key, process.env[key] ?? null])),
    frameViewportSettings: frames.map(([id, width, height]) => ({ id, width, height, deviceScaleFactor: 1 })),
    boardUrl, screenshotMethod: 'page.screenshot with measured CSS bounding-box clip after scrollIntoViewIfNeeded; animations allowed; no scale or style overrides',
    network: { requestLog, externalHttpAttemptsBlocked: externalAttempts },
    console: consoleLog, pageErrors, captures, sourceHashes, rendererScriptSha256,
  };
  fs.writeFileSync(path.join(output, 'runtime.json'), `${JSON.stringify(runtime, null, 2)}\n`);
  console.log(`runtime_json=${path.join(output, 'runtime.json')}`);
  console.log(`external_http_attempts=${JSON.stringify(externalAttempts)}`);
  console.log(`page_errors=${JSON.stringify(pageErrors)}`);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close().catch((error) => console.error(`browser_close_error=${error}`));
});
