import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import test from 'node:test';

const { chromium } = await import(process.env.COPPERSKIFF_PLAYWRIGHT_MODULE ?? 'playwright');

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const ARTIFACTS = resolve(ROOT, 'artifacts/app-redesign-copper-001-builder/browser');
const CHROME = process.env.GAME_BROWSER_CHROME ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
});

async function startStaticServer() {
  const missingPaths = [];
  const server = createServer(async (request, response) => {
    const requestedPath = decodeURIComponent(new URL(request.url, 'http://local').pathname);
    if (requestedPath === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    const file = resolve(ROOT, `.${requestedPath}`);
    if (file !== ROOT && !file.startsWith(`${ROOT}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const bytes = await readFile(file);
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Length': bytes.length,
        'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      }).end(bytes);
    } catch {
      missingPaths.push(requestedPath);
      response.writeHead(404).end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    close: () => new Promise((resolveClose, reject) => server.close((error) =>
      error ? reject(error) : resolveClose())),
    missingPaths,
    url: `http://127.0.0.1:${server.address().port}`,
  };
}

test('Copperskiff fixed atlas windows decode and stay stable at phone and desktop size', {
  timeout: 20_000,
}, async (t) => {
  mkdirSync(ARTIFACTS, { recursive: true });
  const server = await startStaticServer();
  t.after(() => server.close());
  const browser = await chromium.launch({
    executablePath: existsSync(CHROME) ? CHROME : undefined,
    headless: true,
  });
  t.after(() => browser.close());
  const observed = [];
  for (const { width, height, bodyCssPixels } of [
    { width: 390, height: 844, bodyCssPixels: 13 },
    { width: 1440, height: 933, bodyCssPixels: 26 },
  ]) {
    for (const reducedMotion of [false, true]) {
      const context = await browser.newContext({
        colorScheme: 'dark',
        deviceScaleFactor: 1,
        reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
        viewport: { width, height },
      });
      const page = await context.newPage();
      const errors = [];
      const requests = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      page.on('requestfailed', (request) => errors.push(`${request.url()}: ${request.failure()?.errorText ?? 'failed'}`));
      page.on('request', (request) => {
        if (request.url().includes('copperskiff-battle-sprite.png')) requests.push(request.url());
      });
      const missingStart = server.missingPaths.length;
      const response = await page.goto(`${server.url}/tests/copperskiff-live-sprite-browser-fixture.html`, {
        waitUntil: 'networkidle',
      });
      assert.equal(response.status(), 200);
      await page.waitForFunction(() => document.documentElement.dataset.assetReady === 'true');
      const fixture = await page.evaluate(() => globalThis.__copperskiffSpriteFixture);
      const screenshot = resolve(ARTIFACTS, `${width}x${height}-${bodyCssPixels}px-${reducedMotion ? 'reduced' : 'normal'}.png`);
      await page.screenshot({ path: screenshot });
      const geometry = await page.locator('.combat-art--copperskiff').evaluateAll((arts) => arts.map((art) => ({
        action: art.dataset.spriteAction,
        direction: art.dataset.spriteDirection,
        frame: art.dataset.spriteFrame,
        height: art.getBoundingClientRect().height,
        pivotErrorX: (art.getBoundingClientRect().left + art.getBoundingClientRect().width / 2) -
          (art.parentElement.getBoundingClientRect().left + art.parentElement.getBoundingClientRect().width / 2),
        pivotErrorY: (art.getBoundingClientRect().top + art.getBoundingClientRect().height * 0.84375) -
          (art.parentElement.getBoundingClientRect().top + art.parentElement.getBoundingClientRect().height / 2),
        side: art.dataset.spriteSide,
        width: art.getBoundingClientRect().width,
        window: art.getAttribute('viewBox'),
      })));

      assert.deepEqual(errors, []);
      assert.equal(fixture.bodyCssPixels, bodyCssPixels);
      assert.equal(fixture.decodedWidth, 256);
      assert.equal(fixture.decodedHeight, 256);
      assert.equal(fixture.frames.length, 16);
      assert.equal(new Set(fixture.frames.map(({ id }) => id)).size, 16);
      assert.equal(fixture.alphaBounds.length, 16);
      assert.ok(fixture.alphaBounds.every(({ left, top, right, bottom }) =>
        left >= 0 && top >= 0 && right < 64 && bottom < 64 && right >= left && bottom >= top),
      'every fixed source cell contains decoded sprite pixels');
      assert.equal(geometry.length, 16);
      for (const art of geometry) {
        assert.ok(Math.abs(art.width - 64 * bodyCssPixels / 13) < 0.01);
        assert.ok(Math.abs(art.height - 64 * bodyCssPixels / 13) < 0.01);
        assert.ok(Math.abs(art.pivotErrorX) < 0.01);
        assert.ok(Math.abs(art.pivotErrorY) < 0.01);
        assert.equal(art.window.endsWith('64 64'), true, 'every frame uses the same fixed cell window');
      }
      assert.ok(requests.length > 0, 'the live SVG atlas made a browser request');
      assert.deepEqual(server.missingPaths.slice(missingStart), []);
      observed.push({ bodyCssPixels, reducedMotion, fixture, geometry });
      await context.close();
    }
  }
  for (const bodyCssPixels of [13, 26]) {
    const normal = observed.find((result) => result.bodyCssPixels === bodyCssPixels && !result.reducedMotion);
    const reduced = observed.find((result) => result.bodyCssPixels === bodyCssPixels && result.reducedMotion);
    assert.deepEqual(reduced.fixture.frames, normal.fixture.frames,
      `${bodyCssPixels}px reduced motion keeps every team, facing, and action cell`);
    assert.deepEqual(reduced.geometry.map(({ frame, window }) => [frame, window]),
      normal.geometry.map(({ frame, window }) => [frame, window]));
  }
  writeFileSync(resolve(ARTIFACTS, 'browser-report.json'), `${JSON.stringify(observed.map(({ bodyCssPixels, reducedMotion, fixture, geometry }) => ({
    bodyCssPixels, reducedMotion, frames: geometry, alphaBounds: fixture.alphaBounds,
  })), null, 2)}\n`);
});
