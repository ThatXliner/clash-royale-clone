import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import test from "node:test";

const { chromium } = await import(process.env.GAME_BROWSER_PLAYWRIGHT ?? "playwright");
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const ARTIFACTS = resolve(ROOT, "artifacts/skymaul-live-sprite-browser");
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const EXPECTED_ATLAS_SHA256 =
  "e6c02d3a0ce4634f060f508cca00f72a729551805536dc0a80930a74bf7b3fcb";
const EXPECTED_TRANSPARENT_PIXELS = Object.freeze({
  "river-east-idle": 3817,
  "river-north-idle": 3810,
  "river-south-idle": 3815,
  "river-west-idle": 3810,
  "river-east-walk": 3807,
  "river-north-walk": 3808,
  "river-south-walk": 3813,
  "river-west-walk": 3802,
  "river-east-contact": 3800,
  "river-north-contact": 3797,
  "river-south-contact": 3818,
  "river-west-contact": 3803,
  "ember-east-idle": 3834,
  "ember-north-idle": 3829,
  "ember-south-idle": 3834,
  "ember-west-idle": 3827,
  "ember-east-walk": 3824,
  "ember-north-walk": 3827,
  "ember-south-walk": 3832,
  "ember-west-walk": 3819,
  "ember-east-contact": 3817,
  "ember-north-contact": 3816,
  "ember-south-contact": 3837,
  "ember-west-contact": 3820
});
const EXPECTED_VIEWBOX_BY_POSE = Object.freeze({
  "north:idle:east": "0 192 64 64",
  "north:idle:north": "64 192 64 64",
  "north:idle:south": "128 192 64 64",
  "north:idle:west": "192 192 64 64",
  "north:walk:east": "0 256 64 64",
  "north:walk:north": "64 256 64 64",
  "north:walk:south": "128 256 64 64",
  "north:walk:west": "192 256 64 64",
  "north:contact:east": "0 320 64 64",
  "north:contact:north": "64 320 64 64",
  "north:contact:south": "128 320 64 64",
  "north:contact:west": "192 320 64 64",
  "south:idle:east": "0 0 64 64",
  "south:idle:north": "64 0 64 64",
  "south:idle:south": "128 0 64 64",
  "south:idle:west": "192 0 64 64",
  "south:walk:east": "0 64 64 64",
  "south:walk:north": "64 64 64 64",
  "south:walk:south": "128 64 64 64",
  "south:walk:west": "192 64 64 64",
  "south:contact:east": "0 128 64 64",
  "south:contact:north": "64 128 64 64",
  "south:contact:south": "128 128 64 64",
  "south:contact:west": "192 128 64 64",
});

const TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
});

async function startStaticServer() {
  const missingPaths = [];
  const server = createServer(async (request, response) => {
    const requestedPath = decodeURIComponent(new URL(request.url, "http://local").pathname);
    if (requestedPath === "/favicon.ico") {
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
        "Cache-Control": "no-store",
        "Content-Length": bytes.length,
        "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      }).end(bytes);
    } catch {
      missingPaths.push(requestedPath);
      response.writeHead(404).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    close: () => new Promise((resolveClose, reject) => server.close((error) =>
      error ? reject(error) : resolveClose())),
    missingPaths,
    url: `http://127.0.0.1:${server.address().port}`,
  };
}

test("Skymaul atlas decodes and anchors all 24 fixed poses in a real browser", {
  timeout: 30_000,
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
    { width: 1_440, height: 933, bodyCssPixels: 26 },
  ]) {
    for (const reducedMotion of [false, true]) {
      const context = await browser.newContext({
        colorScheme: "dark",
        deviceScaleFactor: 1,
        reducedMotion: reducedMotion ? "reduce" : "no-preference",
        viewport: { width, height },
      });
      const page = await context.newPage();
      const errors = [];
      const requests = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      page.on("requestfailed", (request) => errors.push(
        `${request.url()}: ${request.failure()?.errorText ?? "failed"}`,
      ));
      page.on("request", (request) => {
        if (request.url().includes("skymaul-battle-sprite.png")) requests.push(request.url());
      });
      const missingStart = server.missingPaths.length;
      const response = await page.goto(
        `${server.url}/tests/skymaul-battle-sprite-browser-fixture.html`,
        { waitUntil: "networkidle" },
      );
      assert.equal(response.status(), 200);
      await page.waitForFunction(() =>
        document.documentElement.dataset.assetReady === "true");
      const fixture = await page.evaluate(() => globalThis.__skymaulSpriteFixture);
      const screenshot = resolve(ARTIFACTS,
        `${width}x${height}-${bodyCssPixels}px-${reducedMotion ? "reduced" : "normal"}.png`);
      await page.screenshot({ path: screenshot });
      const geometry = await page.locator(".combat-art--skymaul").evaluateAll((arts) =>
        arts.map((art) => {
          const rect = art.getBoundingClientRect();
          const marker = art.parentElement.getBoundingClientRect();
          return {
            action: art.dataset.spriteAction,
            direction: art.dataset.spriteDirection,
            frame: art.dataset.spriteFrame,
            height: rect.height,
            pivotErrorX: (rect.left + rect.width / 2) - (marker.left + marker.width / 2),
            pivotErrorY: (rect.top + rect.height * 0.84375) - (marker.top + marker.height / 2),
            pointerEvents: getComputedStyle(art).pointerEvents,
            side: art.dataset.spriteSide,
            width: rect.width,
            window: art.getAttribute("viewBox"),
          };
        }));

      assert.deepEqual(errors, []);
      assert.equal(fixture.assetBytes, 27_488);
      assert.equal(fixture.assetSha256, EXPECTED_ATLAS_SHA256);
      assert.equal(fixture.bodyCssPixels, bodyCssPixels);
      assert.equal(fixture.decodedWidth, 256);
      assert.equal(fixture.decodedHeight, 384);
      assert.equal(fixture.frames.length, 24);
      assert.equal(new Set(fixture.frames.map(({ id }) => id)).size, 24);
      assert.equal(geometry.length, 24);
      for (const frame of fixture.frames) {
        const key = `${frame.team}-${frame.direction}-${frame.action}`;
        const poseKey = [frame.side, frame.action, frame.direction].join(":");
        assert.equal(frame.team, frame.side === "north" ? "ember" : "river");
        assert.equal(frame.viewBox, EXPECTED_VIEWBOX_BY_POSE[poseKey],
          poseKey + " browser viewBox must match the independently pinned atlas mapping");
        assert.equal(frame.transparentPixels, EXPECTED_TRANSPARENT_PIXELS[key],
          `${key} browser-decoded alpha count must match the independent accepted atlas receipt`);
        const bounds = frame.alphaPaintBounds16;
        assert.ok(bounds.left >= 0 && bounds.top >= 0 && bounds.right < 64 && bounds.bottom < 64);
        assert.ok(bounds.right >= bounds.left && bounds.bottom >= bounds.top);
      }
      for (const art of geometry) {
        const expectedSize = 64 * bodyCssPixels / 13;
        assert.ok(Math.abs(art.width - expectedSize) < 0.01);
        assert.ok(Math.abs(art.height - expectedSize) < 0.01);
        assert.ok(Math.abs(art.pivotErrorX) < 0.01);
        assert.ok(Math.abs(art.pivotErrorY) < 0.01);
        assert.equal(art.pointerEvents, "none");
        const poseKey = [art.side, art.action, art.direction].join(":");
        assert.equal(art.window, EXPECTED_VIEWBOX_BY_POSE[poseKey],
          poseKey + " rendered window must match the independently pinned atlas mapping");
        assert.equal(art.window.endsWith("64 64"), true);
      }
      assert.ok(requests.length > 0, "the SVG atlas URL was requested by the browser");
      assert.deepEqual(server.missingPaths.slice(missingStart), []);
      observed.push({ bodyCssPixels, reducedMotion, fixture, geometry });
      await context.close();
    }
  }

  for (const bodyCssPixels of [13, 26]) {
    const normal = observed.find((entry) =>
      entry.bodyCssPixels === bodyCssPixels && !entry.reducedMotion);
    const reduced = observed.find((entry) =>
      entry.bodyCssPixels === bodyCssPixels && entry.reducedMotion);
    assert.deepEqual(
      reduced.fixture.frames.map(({ side, action, direction, id, viewBox, rgbaSha256 }) =>
        [side, action, direction, id, viewBox, rgbaSha256]),
      normal.fixture.frames.map(({ side, action, direction, id, viewBox, rgbaSha256 }) =>
        [side, action, direction, id, viewBox, rgbaSha256]),
      `${bodyCssPixels}px reduced motion keeps all static team, facing, and pose cells`,
    );
    assert.deepEqual(
      reduced.geometry.map(({ frame, window }) => [frame, window]),
      normal.geometry.map(({ frame, window }) => [frame, window]),
    );
  }
  writeFileSync(resolve(ARTIFACTS, "browser-report.json"),
    `${JSON.stringify(observed.map(({ bodyCssPixels, reducedMotion, fixture, geometry }) => ({
      bodyCssPixels, reducedMotion, frames: geometry, alphaPaintBounds16: fixture.frames.map(({ id, alphaPaintBounds16 }) => ({ id, ...alphaPaintBounds16 })),
    })), null, 2)}\n`);
});
