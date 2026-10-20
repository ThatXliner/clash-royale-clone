import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildPages } from "../scripts/build-pages.js";
import { createPagesPreviewServer } from "../scripts/preview-pages.js";
import {
  assertManifestRequests,
  launchReleaseChromium,
  recordBrowserRequests,
} from "./helpers/release-browser-audit.js";

const WORKSPACE = resolve(fileURLToPath(new URL("..", import.meta.url)));
const REPOSITORY = "MossTeam/ember-arena";
const REF = "feature/pages-landing";
const PAGES_PREFIX = "/clash-royale-clone";
const ASSET_EVIDENCE_DIRECTORY = join(WORKSPACE, "artifacts/release-asset-round-1/builder");

async function listFiles(root, prefix = "") {
  const result = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await listFiles(root, relative));
    else result.push(relative);
  }
  return result.toSorted();
}

async function createPagesFixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), "moss-ember-pages-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const output = join(temporary, "artifact");
  await buildPages({ output, repository: REPOSITORY, ref: REF });
  return { output, temporary };
}

test("Pages build contains the branded landing, approved source assets, and isolated game release", async (t) => {
  const { output } = await createPagesFixture(t);
  const topLevel = (await readdir(output)).toSorted();
  assert.deepEqual(topLevel, [".nojekyll", "LICENSE", "NOTICE", "assets", "brand", "game", "index.html"]);

  const landing = await readFile(join(output, "index.html"), "utf8");
  assert.match(landing, /Active prototype/u);
  assert.match(landing, /eight-card deck/u);
  assert.match(landing, /four-card hand/u);
  assert.match(landing, /spend elixir/u);
  assert.match(landing, /opposing towers/u);
  assert.match(landing, /href="\.\/game\/public\/index\.html"/u);
  assert.match(landing, /href="https:\/\/github\.com\/MossTeam\/ember-arena"/u);
  assert.match(landing,
    /href="https:\/\/github\.com\/MossTeam\/ember-arena\/blob\/feature\/pages-landing\/src\/rl\/environment\.js"/u);
  assert.match(landing,
    /href="https:\/\/github\.com\/MossTeam\/ember-arena\/blob\/feature\/pages-landing\/docs\/rl-api\.md"/u);
  assert.doesNotMatch(landing, /@@[A-Z0-9_]+@@|localhost|\.example\//u);
  assert.match(landing, /href="\.\/LICENSE"/u);
  assert.match(landing, /href="\.\/NOTICE"/u);

  const brandFiles = await readdir(join(output, "brand"));
  assert.deepEqual(brandFiles.toSorted(), ["banner.svg", "gameplay.png", "logo.svg"]);
  for (const [source, destination] of [
    ["LICENSE", "LICENSE"],
    ["NOTICE", "NOTICE"],
    ["docs/brand/logo.svg", "brand/logo.svg"],
    ["docs/brand/banner.svg", "brand/banner.svg"],
    ["docs/brand/gameplay.png", "brand/gameplay.png"],
  ]) {
    assert.deepEqual(await readFile(join(output, destination)),
      await readFile(join(WORKSPACE, source)), `${destination} is copied from its approved source`);
  }

  const releaseRoot = join(output, "game");
  const release = JSON.parse(await readFile(join(releaseRoot, "release-manifest.json"), "utf8"));
  assert.ok(release.files.some(({ path }) => path === "public/index.html"));
  const gameLanding = await readFile(join(releaseRoot, "public/index.html"), "utf8");
  assert.match(gameLanding,
    /<script type="module"[^>]*src="\.\.\/src\/ui\/app-shell\.js"[^>]*><\/script>/u);
  assert.match(gameLanding, /data-deck-size/u);
  assert.match(gameLanding, /data-average-cost/u);
  assert.match(gameLanding, /src="\.\/ui-arena-shell\.html\?app-frame=1"/u);
  assert.equal(await readFile(join(releaseRoot, "index.html"), "utf8")
    .then((html) => /\.\/public\/index\.html/u.test(html)), true);
  assert.equal(await stat(join(releaseRoot, "public/index.html")).then((info) => info.isFile()), true);
  assert.equal(release.fileCount, release.files.length);
  assert.ok(release.files.some(({ path }) => path === "src/ui/app-shell.js"));
  assert.ok(release.files.every(({ path }) =>
    !/(?:^|\/)(?:reference|tests|artifacts|dist)(?:\/|$)/u.test(path)));

  const publicAssetPaths = (await listFiles(join(WORKSPACE, "public/assets")))
    .map((path) => `public/assets/${path}`);
  const emittedPublicAssets = release.files.filter(({ path }) => path.startsWith("public/assets/"));
  assert.deepEqual(emittedPublicAssets.map(({ path }) => path).toSorted(),
    publicAssetPaths.toSorted(), "every approved public asset keeps its canonical path");
  const publicAssetHashes = new Set();
  for (const path of publicAssetPaths) {
    const sourceBytes = await readFile(join(WORKSPACE, ...path.split("/")));
    const emitted = release.files.find((file) => file.path === path);
    assert.ok(emitted, `${path} remains available in the release`);
    assert.equal(emitted.size, sourceBytes.length, `${path} preserves its source byte count`);
    assert.equal(emitted.sha256, createHash("sha256").update(sourceBytes).digest("hex"),
      `${path} preserves its source hash`);
    assert.deepEqual(await readFile(join(releaseRoot, ...path.split("/"))), sourceBytes,
      `${path} is emitted byte-for-byte`);
    publicAssetHashes.add(emitted.sha256);
  }
  assert.deepEqual(release.files.filter(({ path, sha256 }) =>
    !path.startsWith("public/assets/") && publicAssetHashes.has(sha256)), [],
  "public assets do not keep redundant hashed copies");
  const generatedStylesheets = release.files.filter(({ path }) =>
    path.startsWith("assets/") && path.endsWith(".css"));
  assert.ok(generatedStylesheets.length > 0, "generated non-public assets remain in the release graph");
  assert.ok(generatedStylesheets.every(({ path }) => /-[A-Za-z0-9_-]{8}\.css$/u.test(path)),
    "generated non-public assets retain content-hashed filenames");
  assert.ok(release.totalBytes < 8_388_608, "the existing 8 MiB release cap remains in force");

  const files = await listFiles(output);
  assert.ok(files.includes(".nojekyll"));
  assert.ok(files.every((path) =>
    !/(?:^|\/)(?:reference|tests|artifacts|dist)(?:\/|$)/u.test(path)));
  assert.ok(files.includes("game/public/index.html"));
  assert.ok(files.includes("game/src/rl/environment.js"));

  const localLinks = [...landing.matchAll(/(?:href|src)="([^"]+)"/gu)]
    .map(([, value]) => value)
    .filter((value) => !/^(?:https?:|#|mailto:)/u.test(value));
  assert.ok(localLinks.length > 0);
  assert.ok(localLinks.every((value) => !value.startsWith("/") && !value.includes("\\")),
    "Pages links stay relative to a repository project subpath");
});

test("Pages output refuses protected workspace destinations before writing", async () => {
  await assert.rejects(buildPages({
    output: join(WORKSPACE, "dist"),
    repository: REPOSITORY,
    ref: REF,
  }), /in-repository Pages output is restricted/u);
  await assert.rejects(buildPages({
    output: WORKSPACE,
    repository: REPOSITORY,
    ref: REF,
  }), /cannot contain the workspace/u);
});

test("local preview serves the landing and playable routes without escaping its artifact", async (t) => {
  const { output } = await createPagesFixture(t);
  const { server } = await createPagesPreviewServer({ root: output });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  t.after(() => new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  }));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const landing = await fetch(`${base}/`);
  assert.equal(landing.status, 200);
  assert.match(landing.headers.get("content-type"), /text\/html/u);
  assert.match(await landing.text(), /Moss &amp; Ember/u);

  const gameRedirect = await fetch(`${base}/game/`);
  assert.equal(gameRedirect.status, 200);
  assert.match(await gameRedirect.text(), /\.\/public\/index\.html/u);

  const game = await fetch(`${base}/game/public/index.html`);
  assert.equal(game.status, 200);
  assert.match(await game.text(), /<title>/u);

  const gameModule = await fetch(`${base}/game/src/ui/app-shell.js`);
  assert.equal(gameModule.status, 200);
  assert.match(gameModule.headers.get("content-type"), /javascript/u);
  const appBootstrap = await gameModule.text();
  const runtimeImport = appBootstrap.match(/from ["']\.\.\/\.\.\/(assets\/[^"']+\.js)["']/u);
  assert.ok(runtimeImport, "the app bootstrap points to a generated runtime chunk");
  assert.equal(await stat(join(output, "game", runtimeImport[1])).then((info) => info.isFile()), true,
    "the Pages preview serves the referenced runtime chunk");

  const gameplay = await fetch(`${base}/brand/gameplay.png`);
  assert.equal(gameplay.status, 200);
  assert.match(gameplay.headers.get("content-type"), /image\/png/u);

  const license = await fetch(`${base}/LICENSE`);
  assert.equal(license.status, 200);
  assert.match(license.headers.get("content-type"), /text\/plain/u);

  const traversal = await fetch(`${base}/..%2fLICENSE`);
  assert.equal(traversal.status, 404);
  const missing = await fetch(`${base}/reference/README.md`);
  assert.equal(missing.status, 404);

  const mounted = await createPagesPreviewServer({
    root: output,
    basePath: "/clash-royale-clone/",
  });
  await new Promise((resolveListen) => mounted.server.listen(0, "127.0.0.1", resolveListen));
  t.after(() => new Promise((resolveClose, rejectClose) => {
    mounted.server.close((error) => error ? rejectClose(error) : resolveClose());
  }));
  const mountedBase = `http://127.0.0.1:${mounted.server.address().port}/clash-royale-clone`;
  const mountedLanding = await fetch(`${mountedBase}/`);
  assert.equal(mountedLanding.status, 200);
  assert.match(await mountedLanding.text(), /href="\.\/game\/public\/index\.html"/u);
  const mountedGame = await fetch(`${mountedBase}/game/public/index.html`);
  assert.equal(mountedGame.status, 200);
  assert.match(await mountedGame.text(), /data-deck-size/u);
  const mountedBootstrapResponse = await fetch(`${mountedBase}/game/src/ui/app-shell.js`);
  assert.equal(mountedBootstrapResponse.status, 200);
  assert.match(await mountedBootstrapResponse.text(), /game-runtime/u);
  assert.equal((await fetch(`http://127.0.0.1:${mounted.server.address().port}/game/`)).status, 404);
  assert.equal((await fetch(`${mountedBase}/missing.js`)).status, 404);
  await assert.rejects(createPagesPreviewServer({ root: output, basePath: "/../" }),
    /base path/u);

  const release = JSON.parse(await readFile(join(output, "game/release-manifest.json"), "utf8"));
  const pagesManifest = {
    files: release.files.map((file) => ({ ...file, path: `game/${file.path}` })),
  };
  const screenshotPath = join(ASSET_EVIDENCE_DIRECTORY, "pages-painted-briar.png");
  const evidencePath = join(ASSET_EVIDENCE_DIRECTORY, "pages-painted-briar.json");
  const evidence = {
    schemaVersion: 1,
    candidate: "RELEASE-ASSET-001",
    basePath: `${PAGES_PREFIX}/`,
    artifactRoot: output,
    screenshotPath,
    browserErrors: [],
    consoleErrors: [],
    requestFailures: [],
    page: null,
    boot: null,
    renderedMarkers: [],
    atlas: null,
    requests: [],
  };
  let browser;
  let context;
  try {
    browser = await launchReleaseChromium();
    context = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 720, height: 1280 },
      deviceScaleFactor: 1,
    });
    const requests = recordBrowserRequests(context);
    const page = await context.newPage();
    page.on("pageerror", (error) => evidence.browserErrors.push(String(error?.stack ?? error)));
    page.on("console", (message) => {
      if (message.type() === "error") evidence.consoleErrors.push(message.text());
    });

    const pageUrl = `${mountedBase}/game/public/ui-arena-shell.html?session-profile=stonehauler-witness`;
    const pageResponse = await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 20_000 });
    evidence.page = {
      requestedUrl: pageUrl,
      responseStatus: pageResponse?.status() ?? null,
      finalUrl: page.url(),
      title: await page.title(),
    };
    assert.equal(pageResponse?.status(), 200);
    await page.locator('[data-ui="arena"]').waitFor({ state: "visible", timeout: 10_000 });

    const displayDeck = [
      "skymaul", "brassbolt", "reedsting", "briar-band",
      "cinderlings", "coilblade", "mossguard", "copperskiff",
    ];
    const expectedAtlasUrl =
      `${mountedBase}/game/public/assets/briar-runner-painted-sheet.png`;
    evidence.boot = await page.evaluate(async ({ deck, expectedAtlasUrl }) => {
      const moduleUrl = new URL("../src/ui/arena-shell-entry.js", location.href).href;
      const { arenaHudController: controller } = await import(moduleUrl);
      globalThis.__releaseAssetController = controller;
      const wasRunning = !controller.state.paused;
      if (wasRunning) controller.pause();
      controller.replaceDeck(deck);
      const resumed = controller.state.paused ? controller.resume() : false;
      const manual = controller.enterManualStepMode();
      return {
        deck: JSON.parse(controller.session.serialize()).setup.deck,
        expectedAtlasUrl,
        manual,
        pausedBeforeSetup: !wasRunning,
        resumed,
        running: !controller.state.paused,
        sessionTick: controller.state.sessionTick,
      };
    }, { deck: displayDeck, expectedAtlasUrl });
    assert.deepEqual(evidence.boot.deck, displayDeck);
    assert.equal(evidence.boot.running, true);

    const card = page.locator('[data-ui="card-slot"][data-card-id="briar-band"]');
    await card.waitFor({ state: "visible", timeout: 5_000 });
    await card.click();
    const arena = page.locator('[data-ui="arena"]');
    const arenaBox = await arena.boundingBox();
    assert.ok(arenaBox && arenaBox.width > 0 && arenaBox.height > 0,
      `arena must have visible bounds: ${JSON.stringify(arenaBox)}`);
    await page.mouse.click(arenaBox.x + arenaBox.width / 2,
      arenaBox.y + arenaBox.height * 0.79);
    await page.evaluate(() => globalThis.__releaseAssetController.stepMany(120));
    await page.locator('.combat-marker[data-kind="briar-runner"]').first().waitFor({
      state: "attached",
      timeout: 8_000,
    });

    const rendered = await page.evaluate(async (expectedAtlasUrl) => {
      const markers = [...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')];
      const renderedMarkers = markers.map((marker) => {
        const art = marker.querySelector(".combat-art");
        const image = art?.querySelector("image");
        const href = image?.getAttribute("href") ?? null;
        return {
          action: art?.dataset.spriteAction ?? null,
          direction: art?.dataset.spriteDirection ?? null,
          frame: art?.dataset.spriteFrame ?? null,
          imageHref: href,
          imageAbsoluteHref: href ? new URL(href, location.href).href : null,
          side: marker.classList.contains("combat-marker--north") ? "north" : "south",
          svgViewBox: art?.getAttribute("viewBox") ?? null,
          tick: Number(art?.dataset.simulationTick),
        };
      });
      const actualUrls = [...new Set(renderedMarkers.map(({ imageAbsoluteHref }) => imageAbsoluteHref)
        .filter(Boolean))];
      if (actualUrls.length !== 1) {
        return { expectedAtlasUrl, renderedMarkers, error: `expected one actual atlas URL, found ${actualUrls.length}` };
      }

      const response = await fetch(actualUrls[0], { cache: "no-store" });
      const atlas = {
        url: actualUrls[0],
        status: response.status,
        contentType: response.headers.get("content-type"),
      };
      if (!response.ok) return { expectedAtlasUrl, renderedMarkers, atlas };

      const blob = await response.blob();
      atlas.byteLength = blob.size;
      const bitmap = await createImageBitmap(blob);
      atlas.width = bitmap.width;
      atlas.height = bitmap.height;
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let opaquePixels = 0;
      let coloredPixels = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] > 0) {
          opaquePixels += 1;
          if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) -
              Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) > 12) {
            coloredPixels += 1;
          }
        }
      }
      atlas.opaquePixels = opaquePixels;
      atlas.coloredPixels = coloredPixels;
      atlas.crops = renderedMarkers.map((marker) => {
        const viewBox = (marker.svgViewBox ?? "").trim().split(/[\s,]+/u).map(Number);
        if (viewBox.length !== 4 || !viewBox.every(Number.isFinite)) {
          return { viewBox: marker.svgViewBox, error: "invalid SVG viewBox" };
        }
        const [x, y, width, height] = viewBox;
        const left = Math.max(0, Math.floor(x));
        const top = Math.max(0, Math.floor(y));
        const right = Math.min(canvas.width, Math.ceil(x + width));
        const bottom = Math.min(canvas.height, Math.ceil(y + height));
        if (right <= left || bottom <= top) {
          return { viewBox: marker.svgViewBox, error: "viewBox outside decoded atlas" };
        }
        const crop = context.getImageData(left, top, right - left, bottom - top).data;
        let cropOpaquePixels = 0;
        let cropColoredPixels = 0;
        for (let index = 0; index < crop.length; index += 4) {
          if (crop[index + 3] > 0) {
            cropOpaquePixels += 1;
            if (Math.max(crop[index], crop[index + 1], crop[index + 2]) -
                Math.min(crop[index], crop[index + 1], crop[index + 2]) > 12) {
              cropColoredPixels += 1;
            }
          }
        }
        return {
          crop: { x: left, y: top, width: right - left, height: bottom - top },
          opaquePixels: cropOpaquePixels,
          coloredPixels: cropColoredPixels,
          viewBox: marker.svgViewBox,
        };
      });
      bitmap.close();
      return { expectedAtlasUrl, renderedMarkers, atlas };
    }, evidence.boot.expectedAtlasUrl);
    evidence.renderedMarkers = rendered.renderedMarkers;
    evidence.atlas = rendered.atlas ?? null;
    assert.equal(rendered.error, undefined, rendered.error);
    const deployedMarkers = evidence.renderedMarkers.filter(({ side }) => side === "south");
    assert.ok(deployedMarkers.length > 0, "a Briar Runner must deploy through the visible hand");
    assert.ok(deployedMarkers.every(({ imageAbsoluteHref, action, direction, frame }) =>
      imageAbsoluteHref === evidence.boot.expectedAtlasUrl &&
      ["walk", "attack"].includes(action) && ["north", "east", "south", "west"].includes(direction) &&
      frame?.startsWith(`briar-${action}-${direction}-`)),
    "the deployed Briar uses a registered painted frame from the canonical Pages URL");
    assert.equal(evidence.atlas?.status, 200);
    assert.match(evidence.atlas?.contentType ?? "", /image\/png/u);
    assert.deepEqual([evidence.atlas?.width, evidence.atlas?.height], [1254, 1254]);
    assert.ok(evidence.atlas?.opaquePixels > 0, "decoded painted atlas has visible opaque pixels");
    assert.ok(evidence.atlas?.coloredPixels > 0, "decoded painted atlas has visible colored pixels");
    assert.ok(evidence.atlas?.crops?.every(({ opaquePixels, coloredPixels }) =>
      opaquePixels > 0 && coloredPixels > 0), "every visible Briar frame crop contains painted pixels");

    evidence.requestFailures = requests.filter(({ failure }) => failure !== null);
    evidence.requests = assertManifestRequests(requests, {
      baseUrl: mountedBase,
      manifest: pagesManifest,
      prefix: PAGES_PREFIX,
    });
    assert.ok(evidence.requests.some(({ path, status }) =>
      path === "game/public/assets/briar-runner-painted-sheet.png" && status === 200),
    "the actual painted atlas request stays within the Pages project prefix");
    assert.deepEqual(evidence.requestFailures, []);
    assert.deepEqual(evidence.browserErrors, []);
    assert.deepEqual(evidence.consoleErrors, []);

    await mkdir(ASSET_EVIDENCE_DIRECTORY, { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    evidence.pass = true;
  } catch (error) {
    evidence.error = String(error?.stack ?? error);
    throw error;
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    await mkdir(ASSET_EVIDENCE_DIRECTORY, { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  }
});

test("Pages workflow is manually dispatched and uses the required official deploy actions", async () => {
  const workflow = await readFile(join(WORKSPACE, ".github/workflows/pages.yml"), "utf8");
  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/mu);
  assert.doesNotMatch(workflow, /^\s+(?:push|pull_request):/mu);
  for (const action of [
    "actions/checkout@v6",
    "actions/configure-pages@v5",
    "actions/upload-pages-artifact@v4",
    "actions/deploy-pages@v4",
  ]) assert.ok(workflow.includes(action), `${action} is used`);
  assert.match(workflow, /pages:\s*write/u);
  assert.match(workflow, /id-token:\s*write/u);
  assert.match(workflow, /needs:\s*build/u);
  assert.match(workflow, /cancel-in-progress:\s*false/u);
  assert.match(workflow, /environment:\s*\n\s+name:\s*github-pages/u);
});

test("portable test wrapper resolves local browser paths and preserves explicit overrides", () => {
  const probe = [
    "process.stdout.write(JSON.stringify({",
    "  chrome: process.env.GAME_BROWSER_CHROME,",
    "  playwright: process.env.GAME_BROWSER_PLAYWRIGHT,",
    "}));",
  ].join("\n");
  const runProbe = (extraEnvironment = {}) => {
    const environment = { ...process.env, ...extraEnvironment };
    if (!Object.hasOwn(extraEnvironment, "GAME_BROWSER_CHROME"))
      delete environment.GAME_BROWSER_CHROME;
    if (!Object.hasOwn(extraEnvironment, "GAME_BROWSER_PLAYWRIGHT"))
      delete environment.GAME_BROWSER_PLAYWRIGHT;
    return spawnSync(process.execPath, [
      join(WORKSPACE, "scripts/test-portable.js"),
      "--",
      process.execPath,
      "-e",
      probe,
    ], { cwd: WORKSPACE, encoding: "utf8", env: environment });
  };
  const local = runProbe();
  assert.equal(local.status, 0, local.stderr);
  const localValues = JSON.parse(local.stdout);
  assert.ok(localValues.playwright.startsWith("/"),
    "Playwright path is absolute for existsSync consumers");
  assert.ok(/(?:^|\/)node_modules\/playwright\//u.test(localValues.playwright));
  assert.ok(localValues.chrome.startsWith("/"), "Chromium executable path is absolute");

  const playwrightOverride = fileURLToPath(import.meta.resolve("playwright"));
  const chromeOverride = "/tmp/moss-ember-custom-chromium";
  for (const playwrightSelection of [
    relative(WORKSPACE, playwrightOverride),
    pathToFileURL(playwrightOverride).href,
  ]) {
    const overridden = runProbe({
      GAME_BROWSER_CHROME: chromeOverride,
      GAME_BROWSER_PLAYWRIGHT: playwrightSelection,
    });
    assert.equal(overridden.status, 0, overridden.stderr);
    const overrideValues = JSON.parse(overridden.stdout);
    assert.equal(overrideValues.chrome, chromeOverride);
    assert.equal(overrideValues.playwright, playwrightOverride);
  }
});
