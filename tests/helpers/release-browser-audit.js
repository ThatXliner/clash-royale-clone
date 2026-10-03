import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createReleaseServer } from "../../scripts/serve-release.js";

const WORKSPACE_ROOT = resolve(new URL("../..", import.meta.url).pathname);

export async function launchReleaseChromium() {
  const configuredPlaywright = process.env.GAME_BROWSER_PLAYWRIGHT;
  const playwrightPath = configuredPlaywright === undefined
    ? fileURLToPath(import.meta.resolve("playwright"))
    : configuredPlaywright.startsWith("file:")
      ? fileURLToPath(configuredPlaywright)
      : resolve(WORKSPACE_ROOT, configuredPlaywright);
  const { chromium } = await import(pathToFileURL(playwrightPath).href);
  const executablePath = process.env.GAME_BROWSER_CHROME ?? chromium.executablePath();
  return chromium.launch({ executablePath, headless: true });
}

export async function startManifestHost(artifactRoot, { prefix = "" } = {}) {
  const normalizedPrefix = prefix ? `/${prefix.split("/").filter(Boolean).join("/")}` : "";
  const { manifest, server: manifestServer } = await createReleaseServer({ root: artifactRoot });
  const server = normalizedPrefix ? createServer((request, response) => {
    const parsed = new URL(request.url ?? "/", "http://127.0.0.1");
    if (!parsed.pathname.startsWith(`${normalizedPrefix}/`)) {
      response.writeHead(404);
      response.end();
      return;
    }
    request.url = `${parsed.pathname.slice(normalizedPrefix.length)}${parsed.search}`;
    manifestServer.emit("request", request, response);
  }) : manifestServer;
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    baseUrl: `http://127.0.0.1:${address.port}${normalizedPrefix}`,
    close: () => new Promise((resolveClose, rejectClose) =>
      server.close((error) => error ? rejectClose(error) : resolveClose())),
    manifest,
    server,
    prefix: normalizedPrefix,
  };
}

export function recordBrowserRequests(browserContext) {
  const records = [];
  const byRequest = new WeakMap();
  browserContext.on("request", (request) => {
    const record = {
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
      status: null,
      failure: null,
    };
    records.push(record);
    byRequest.set(request, record);
  });
  browserContext.on("response", (response) => {
    const record = byRequest.get(response.request());
    if (record) record.status = response.status();
  });
  browserContext.on("requestfailed", (request) => {
    const record = byRequest.get(request);
    if (record) record.failure = request.failure()?.errorText ?? "request failed";
  });
  return records;
}

export function assertManifestRequests(records, { baseUrl, manifest, prefix = "" }) {
  const base = new URL(baseUrl);
  const listed = new Set(manifest.files.map(({ path }) => path));
  const audited = records.filter((record) => {
    try { return new URL(record.url).origin === base.origin; }
    catch { return false; }
  });
  for (const record of records) {
    const url = new URL(record.url);
    if (url.origin !== base.origin) {
      assert.fail(`browser attempted an off-origin release request: ${record.url}`);
    }
  }
  for (const record of audited) {
    let pathname = decodeURIComponent(new URL(record.url).pathname);
    if (prefix) {
      assert.ok(pathname.startsWith(`${prefix}/`),
        `browser request escaped the mounted Pages prefix: ${pathname}`);
      pathname = pathname.slice(prefix.length);
    }
    const path = pathname.replace(/^\//u, "");
    assert.ok(listed.has(path), `browser requested an unmanifested path: ${path}`);
    assert.equal(record.failure, null, `${record.url} failed: ${record.failure}`);
    assert.equal(record.status, 200, `${record.url} returned ${record.status}`);
  }
  return audited.map((record) => ({
    method: record.method,
    path: (() => {
      let pathname = decodeURIComponent(new URL(record.url).pathname);
      if (prefix) pathname = pathname.slice(prefix.length);
      return pathname.replace(/^\//u, "");
    })(),
    resourceType: record.resourceType,
    status: record.status,
  }));
}
