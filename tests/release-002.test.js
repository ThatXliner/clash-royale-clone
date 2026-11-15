// REL-002: a browser that loaded release N must get release N+1 on a normal
// reload, even though the host (GitHub Pages) serves every file with
// `Cache-Control: max-age=600`.
//
// 1. Static: every non-HTML file reachable from the shipped pages has a content
//    hash in its URL, and every page-to-page link carries a hash of its target.
// 2. Content addressing: across two builds, the same URL always means the same bytes.
// 3. Behavior: load N behind a max-age=600 server, swap in N+1 (deleting N's
//    files, as a Pages deploy does), reload normally, and observe N+1 running.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, posix, resolve } from "node:path";
import test from "node:test";

import { buildRelease } from "../scripts/build-release.js";
import { launchReleaseChromium } from "./helpers/release-browser-audit.js";

const WORKSPACE_ROOT = resolve(new URL("..", import.meta.url).pathname);
const EVIDENCE_DIRECTORY = join(WORKSPACE_ROOT, "artifacts/rel-002-round-1");
const HASHED_NAME = /-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/u;
const ASSET_EXTENSIONS = "css|js|json|gif|jpeg|jpg|mp3|mp4|ogg|otf|png|svg|ttf|wav|webm|webp|woff2?";
const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function buildMarkedRelease(t, marker) {
  // Build from a scratch copy of the sources so the checkout is never edited.
  const root = await mkdtemp(join(tmpdir(), `rel-002-${marker}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ["src", "public", "reference", "package.json"])
    await cp(join(WORKSPACE_ROOT, name), join(root, name), { recursive: true });
  await cp(join(WORKSPACE_ROOT, "node_modules/three"), join(root, "node_modules/three"), { recursive: true });
  const shell = join(root, "src/ui/app-shell.js");
  await writeFile(shell, `${await readFile(shell, "utf8")}\ndocument.documentElement.dataset.buildMarker = ${JSON.stringify(marker)};\n`);
  const output = join(root, "out");
  await buildRelease({ root, output, configPath: join(WORKSPACE_ROOT, "scripts/release-build.config.json") });
  const files = new Map();
  async function visit(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(join(directory, entry.name), path);
      else files.set(path, await readFile(join(directory, entry.name)));
    }
  }
  await visit(output);
  return { files, marker };
}

function resolveReference(from, reference) {
  const clean = reference.split(/[?#]/u, 1)[0];
  return posix.normalize(posix.join(posix.dirname(from), clean));
}

/**
 * Walk everything the shipped pages load. Returns every reachable file and any
 * violation of the "hashed or reached through a hashed URL" rule.
 */
function auditReachableAssets(files) {
  const violations = [];
  const reachable = new Set();
  const pages = [...files.keys()].filter((path) => extname(path) === ".html");
  const queue = [];
  const visit = (from, reference, kind) => {
    if (/^(?:data:|https?:|mailto:|#)/iu.test(reference)) return;
    const path = resolveReference(from, reference);
    if (!files.has(path)) {
      violations.push(`${from} references ${reference}, which the release does not contain`);
      return;
    }
    if (extname(path) === ".html") {
      const version = new URL(reference, "http://x/").searchParams.get("v");
      const expected = sha256(files.get(path)).slice(0, 12);
      if (version !== expected) {
        violations.push(`${from} links page ${path} without its content hash (v=${version}, expected ${expected})`);
      }
      return;
    }
    if (!HASHED_NAME.test(path)) violations.push(`${from} loads ${path} (${kind}) without a content hash`);
    if (!reachable.has(path)) {
      reachable.add(path);
      queue.push(path);
    }
  };

  for (const page of pages) {
    reachable.add(page);
    const html = files.get(page).toString("utf8");
    for (const [, reference] of html.matchAll(/\s(?:src|href)="([^"]+)"/gu)) {
      if (/^\.\/[\w.-]+\.html/u.test(reference) || reference.endsWith(".html")) {
        visit(page, reference, "page");
      } else visit(page, reference, "html reference");
    }
    for (const [, reference] of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gu)) visit(page, reference, "inline css");
  }
  while (queue.length > 0) {
    const path = queue.pop();
    const text = files.get(path).toString("utf8");
    if (extname(path) === ".css") {
      for (const [, reference] of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gu)) visit(path, reference, "css url");
    } else if (extname(path) === ".js") {
      const relative = new RegExp(`["'\`](\\.{1,2}/[^"'\`\\s]*\\.(?:${ASSET_EXTENSIONS}))["'\`]`, "gu");
      for (const [, reference] of text.matchAll(relative)) visit(path, reference, "js reference");
    }
  }
  return { reachable, violations };
}

async function startCachingHost() {
  // Mirrors GitHub Pages: validators plus max-age=600. `current` is swapped to model a deploy.
  const host = { current: new Map(), log: [] };
  host.server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const path = decodeURIComponent(url.pathname).replace(/^\//u, "");
    const bytes = host.current.get(path);
    const entry = { path, query: url.search, status: 404, conditional: Boolean(request.headers["if-none-match"]) };
    host.log.push(entry);
    if (!bytes) {
      entry.status = 404;
      response.writeHead(404, { "Cache-Control": "max-age=600" });
      response.end();
      return;
    }
    const etag = `"${sha256(bytes).slice(0, 16)}"`;
    const headers = {
      "Cache-Control": "max-age=600",
      ETag: etag,
      "Last-Modified": "Sat, 07 Nov 2026 00:00:00 GMT",
      "Content-Type": MIME_TYPES[extname(path)] ?? "application/octet-stream",
    };
    if (request.headers["if-none-match"] === etag) {
      entry.status = 304;
      response.writeHead(304, headers);
      response.end();
      return;
    }
    entry.status = 200;
    response.writeHead(200, headers);
    response.end(bytes);
  });
  await new Promise((done) => host.server.listen(0, "127.0.0.1", done));
  host.baseUrl = `http://127.0.0.1:${host.server.address().port}`;
  host.close = () => new Promise((done) => host.server.close(done));
  return host;
}

test("REL-002: shipped assets are hashed and a normal reload picks up the next release", async (t) => {
  const releaseN = await buildMarkedRelease(t, "release-N");
  const releaseN1 = await buildMarkedRelease(t, "release-N-plus-1");

  // 1. Every non-HTML asset the pages load is hashed; pages link pages by content hash.
  const audits = [releaseN, releaseN1].map(({ files }) => auditReachableAssets(files));
  for (const { violations } of audits) assert.deepEqual(violations, []);
  const [auditN, auditN1] = audits;
  assert.ok(auditN.reachable.size > 40, "the audit actually walked the game");
  for (const path of ["public/index.html", "public/ui-arena-shell.html"]) assert.ok(auditN.reachable.has(path));
  assert.ok([...auditN.reachable].some((path) => path.endsWith(".webp")), "images are in the audited set");
  assert.ok([...auditN.reachable].some((path) => path.endsWith(".ttf")), "the font is in the audited set");
  assert.ok([...auditN.reachable].some((path) => path.endsWith(".css")), "stylesheets are in the audited set");
  const unhashedUnreachable = [...releaseN.files.keys()].filter((path) =>
    !auditN.reachable.has(path) && !HASHED_NAME.test(path) && extname(path) !== ".html");
  for (const path of unhashedUnreachable) {
    assert.match(path, /^(?:public\/(?:assets|licenses)\/|src\/(?:rl\/environment|ui\/arena-shell-entry)\.js$|release-manifest\.json$)/u,
      `${path} ships unhashed and must be unreachable from the pages`);
  }

  // 2. Content addressing: one URL never means two different byte strings.
  const sharedHashedPaths = [...auditN.reachable].filter((path) =>
    extname(path) !== ".html" && auditN1.reachable.has(path));
  assert.ok(sharedHashedPaths.length > 0);
  for (const path of sharedHashedPaths) {
    assert.equal(sha256(releaseN.files.get(path)), sha256(releaseN1.files.get(path)),
      `${path} has the same URL in both releases but different bytes`);
  }
  const entryPattern = /<script type="module" crossorigin src="\.\.\/(assets\/index-[\w-]{8}\.js)"/u;
  const entryN = releaseN.files.get("public/index.html").toString("utf8").match(entryPattern)[1];
  const entryN1 = releaseN1.files.get("public/index.html").toString("utf8").match(entryPattern)[1];
  assert.notEqual(entryN, entryN1, "changed code gets a new script URL");
  const frameN = releaseN.files.get("public/index.html").toString("utf8").match(/ui-arena-shell\.html\?app-frame=1&v=([0-9a-f]{12})/u)[1];
  const frameN1 = releaseN1.files.get("public/index.html").toString("utf8").match(/ui-arena-shell\.html\?app-frame=1&v=([0-9a-f]{12})/u)[1];
  assert.notEqual(frameN, frameN1, "changed code gets a new battle-frame URL");

  // 3. Behavior behind max-age=600.
  const host = await startCachingHost();
  t.after(() => host.close());
  const browser = await launchReleaseChromium();
  t.after(() => browser.close());
  const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
  t.after(() => context.close());
  const page = await context.newPage();
  const problems = [];
  page.on("console", (message) => { if (message.type() === "error") problems.push(message.text()); });
  page.on("pageerror", (error) => problems.push(String(error)));
  const loaded = [];
  context.on("response", (response) => loaded.push({ url: response.url(), status: response.status() }));

  async function enterBattle() {
    await page.locator('[data-nav-to="battle"]').click();
    const arena = page.frameLocator("[data-battle-frame-slot] iframe").locator('[data-ui="arena"]');
    await arena.waitFor({ timeout: 15_000 });
    return page.locator("[data-battle-frame-slot] iframe").getAttribute("src");
  }
  const marker = () => page.evaluate(() => document.documentElement.dataset.buildMarker);

  host.current = releaseN.files;
  await page.goto(`${host.baseUrl}/public/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.dataset.buildMarker);
  assert.equal(await marker(), "release-N");
  assert.match(await enterBattle(), new RegExp(`v=${frameN}$`, "u"));
  const loadedN = loaded.length;

  // Deploy N+1: Pages replaces the whole site, so N's files are gone.
  host.current = releaseN1.files;
  host.log.length = 0;
  problems.length = 0;
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.dataset.buildMarker);
  assert.equal(await marker(), "release-N-plus-1", "a normal reload runs the new release");
  assert.match(await enterBattle(), new RegExp(`v=${frameN1}$`, "u"));
  assert.deepEqual(problems, [], "no console errors after the swap");
  assert.deepEqual(host.log.filter(({ status }) => status === 404), [], "nothing from release N was requested after the swap");
  const afterSwap = loaded.slice(loadedN);
  assert.ok(afterSwap.some(({ url }) => url.endsWith(`/${entryN1}`)), "the new script URL was fetched");
  assert.ok(afterSwap.every(({ url }) => !url.endsWith(`/${entryN}`)), "the old script URL was not used");
  const subresourcePaths = loaded.map(({ url }) => new URL(url).pathname.slice(1))
    .filter((path) => extname(path) !== ".html");
  for (const path of subresourcePaths) assert.match(path, HASHED_NAME, `${path} was loaded without a content hash`);

  await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
  await writeFile(join(EVIDENCE_DIRECTORY, "evidence.json"), `${JSON.stringify({
    cacheControl: "max-age=600",
    releaseN: { marker: "release-N", entryScript: entryN, battleFrameVersion: frameN },
    releaseNPlus1: { marker: "release-N-plus-1", entryScript: entryN1, battleFrameVersion: frameN1 },
    reachableFiles: auditN.reachable.size,
    sharedHashedPaths: sharedHashedPaths.length,
    unhashedUnreachable,
    requestsAfterSwap: host.log.map(({ path, query, status }) => `${status} ${path}${query}`),
  }, null, 2)}\n`);
});
