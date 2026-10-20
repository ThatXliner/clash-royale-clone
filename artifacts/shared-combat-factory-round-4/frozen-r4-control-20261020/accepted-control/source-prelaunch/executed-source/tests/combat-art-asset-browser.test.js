import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import test from "node:test";

import { chromium } from "playwright";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const ARTIFACTS = resolve(ROOT, "artifacts/game-001gpr-round-2/builder");
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PACKAGE_PREFIX = "/packaged";
const CONTENT_TYPES = Object.freeze({
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
    const localPath = requestedPath.startsWith(`${PACKAGE_PREFIX}/`)
      ? requestedPath.slice(PACKAGE_PREFIX.length)
      : requestedPath;
    const file = resolve(ROOT, `.${localPath}`);
    if (file !== ROOT && !file.startsWith(`${ROOT}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const bytes = await readFile(file);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": bytes.length,
        "Content-Type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
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

test("painted combat art resolves and decodes its atlas from a packaged subpath", {
  timeout: 15_000,
}, async (t) => {
  mkdirSync(ARTIFACTS, { recursive: true });
  const server = await startStaticServer();
  t.after(() => server.close());
  const browser = await chromium.launch({
    executablePath: existsSync(CHROME) ? CHROME : undefined,
    headless: true,
  });
  t.after(() => browser.close());

  const page = await browser.newPage({ viewport: { width: 320, height: 320 } });
  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];
  const atlasResponses = [];
  const atlasRequests = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => failedRequests.push({
    error: request.failure()?.errorText ?? "unknown",
    url: request.url(),
  }));
  page.on("request", (request) => {
    if (request.url().includes("briar-runner-painted-sheet.png")) {
      atlasRequests.push(request.url());
    }
  });
  page.on("response", (response) => {
    if (response.url().includes("briar-runner-painted-sheet.png")) {
      atlasResponses.push({ status: response.status(), url: response.url() });
    }
  });

  const missingStart = server.missingPaths.length;
  const response = await page.goto(
    `${server.url}${PACKAGE_PREFIX}/tests/combat-art-asset-fixture.html`,
    { waitUntil: "networkidle" },
  );
  assert.equal(response.status(), 200);
  await page.waitForFunction(() => document.documentElement.dataset.assetReady === "true");
  const decoded = await page.evaluate(() => globalThis.__combatArtAssetFixture);
  const screenshotPath = resolve(ARTIFACTS, "combat-art-asset-fixture.png");
  await page.screenshot({ path: screenshotPath });

  assert.equal(decoded.decodedWidth, 1254);
  assert.equal(decoded.decodedHeight, 1254);
  assert.equal(new URL(decoded.renderedSource).pathname,
    `${PACKAGE_PREFIX}/public/assets/briar-runner-painted-sheet.png`);
  assert.ok(atlasRequests.some((url) => new URL(url).pathname ===
    `${PACKAGE_PREFIX}/public/assets/briar-runner-painted-sheet.png`));
  assert.ok(atlasResponses.some(({ status, url }) => status === 200 &&
    new URL(url).pathname === `${PACKAGE_PREFIX}/public/assets/briar-runner-painted-sheet.png`));
  assert.deepEqual(failedRequests, []);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(server.missingPaths.slice(missingStart), []);

  const evidence = {
    atlasRequests,
    atlasResponses,
    consoleErrors,
    decoded,
    failedRequests,
    missingPaths: server.missingPaths.slice(missingStart),
    pageErrors,
    screenshot: screenshotPath,
    url: page.url(),
  };
  writeFileSync(resolve(ARTIFACTS, "combat-art-asset-fixture.json"),
    `${JSON.stringify(evidence, null, 2)}\n`);
});
