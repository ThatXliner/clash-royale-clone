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
const sourceNames = [
  'design-board.html',
  'art-direction.md',
  'character-to-3D-handoff.md',
  'motion-direction.md',
];
const ids = [
  'f-phone-landing', 'f-phone-deck', 'f-phone-battle',
  'f-desk-landing', 'f-desk-deck', 'f-desk-battle',
];
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const sourceHashes = Object.fromEntries(sourceNames.map((name) => [
  `design/20261020-redesign/claude/${name}`,
  sha256(fs.readFileSync(path.join(proposal, name))),
]));
const scriptBytes = fs.readFileSync(new URL(import.meta.url));
const externalAttempts = [];
const requestLog = [];
const consoleLog = [];
const pageErrors = [];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1800, height: 1200 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  });
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    requestLog.push(url);
    if (/^https?:\/\//i.test(url)) {
      externalAttempts.push(url);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
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
  console.log(`browser_executable=${chromium.executablePath()}`);
  console.log(`board_url=${boardUrl}`);
  console.log(`browser_launch=headless viewport=1800x1200 deviceScaleFactor=1 reducedMotion=no-preference`);
  console.log(`browser_pid=${browser._browserProcess?.process?.pid ?? 'unavailable'}`);
  await page.goto(boardUrl, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const metrics = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    fontsStatus: document.fonts.status,
    fontFaces: [...document.fonts].map((face) => ({ family: face.family, status: face.status })),
    externalResourceElements: [...document.querySelectorAll('img,script[src],link[rel="stylesheet"],iframe,video,source')]
      .map((element) => ({ tag: element.tagName.toLowerCase(), source: element.currentSrc || element.src || element.href || '' })),
  }));
  console.log(`document_metrics=${JSON.stringify(metrics)}`);
  const captures = [];
  for (const id of ids) {
    const locator = page.locator(`#${id}`);
    const count = await locator.count();
    if (count !== 1) throw new Error(`expected one #${id}, found ${count}`);
    const before = await locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        cssWidth: style.width, cssHeight: style.height,
        status: element.getAttribute('data-status'),
        overflow: style.overflow,
      };
    });
    const expected = id.startsWith('f-phone') ? [390, 844] : [1440, 933];
    if (before.width !== expected[0] || before.height !== expected[1]) {
      throw new Error(`${id} has ${before.width}x${before.height}; expected ${expected.join('x')}`);
    }
    const screenshotPath = path.join(output, `${id}.png`);
    await locator.screenshot({ path: screenshotPath, animations: 'allow' });
    const bytes = fs.readFileSync(screenshotPath);
    const pngWidth = bytes.readUInt32BE(16);
    const pngHeight = bytes.readUInt32BE(20);
    const item = {
      id, screenshot: screenshotPath, screenshotSha256: sha256(bytes), bytes: bytes.length,
      pngPixels: { width: pngWidth, height: pngHeight }, cssBox: before,
    };
    if (pngWidth !== expected[0] || pngHeight !== expected[1]) {
      throw new Error(`${id} screenshot is ${pngWidth}x${pngHeight}; expected ${expected.join('x')}`);
    }
    captures.push(item);
    console.log(`capture=${JSON.stringify(item)}`);
  }
  const env = {
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    macOSVersion: execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim(),
    cwd: process.cwd(),
    execPath: process.execPath,
    nodeVersion: process.version,
    pid: process.pid,
    ppid: process.ppid,
    browserPid: browser._browserProcess?.process?.pid ?? null,
    browserVersion: browser.version(),
    browserExecutable: chromium.executablePath(),
    playwrightVersion: require('/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright/package.json').version,
    selectedEnvironmentVariables: Object.fromEntries(['PATH', 'NODE_OPTIONS', 'PLAYWRIGHT_BROWSERS_PATH', 'CI', 'LANG', 'TERM'].map((key) => [key, process.env[key] ?? null])),
    viewport: { width: 1800, height: 1200 },
    deviceScaleFactor: 1,
    userAgent: await page.evaluate(() => navigator.userAgent),
    boardUrl,
    launchArguments: ['headless: true'],
    network: { allRequests: requestLog, externalHttpAttemptsBlocked: externalAttempts },
    console: consoleLog,
    pageErrors,
    captures,
    sourceHashes,
    rendererScriptSha256: sha256(scriptBytes),
  };
  fs.writeFileSync(path.join(output, 'runtime.json'), `${JSON.stringify(env, null, 2)}\n`);
  console.log(`runtime_json=${path.join(output, 'runtime.json')}`);
  console.log(`external_http_attempts=${JSON.stringify(externalAttempts)}`);
  console.log(`page_errors=${JSON.stringify(pageErrors)}`);
  await browser.close();
  await context.close();
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
