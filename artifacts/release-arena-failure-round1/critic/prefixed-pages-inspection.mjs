import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildPages } from "../../../scripts/build-pages.js";
import { createPagesPreviewServer } from "../../../scripts/preview-pages.js";

const WORKSPACE = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const EVIDENCE_DIR = join(WORKSPACE, "artifacts/release-arena-failure-round1/critic");
const EVIDENCE_PATH = join(EVIDENCE_DIR, "prefixed-pages-inspection.json");
const PREFIX = "/clash-royale-clone/";
const repository = "ThatXliner/clash-royale-clone";
const temporary = await mkdtemp(join(tmpdir(), "release-arena-pages-inspection-"));
const output = join(temporary, "site");
const configuredPlaywright = process.env.GAME_BROWSER_PLAYWRIGHT ??
  join(WORKSPACE, "node_modules/playwright/index.mjs");
const playwrightUrl = configuredPlaywright.startsWith("file:")
  ? configuredPlaywright
  : pathToFileURL(resolve(configuredPlaywright)).href;
const { chromium } = await import(playwrightUrl);
let browser;
let context;
let pagesHost;
let evidence = { schemaVersion: 1, prefix: PREFIX, repository };

try {
  const build = await buildPages({ output, repository, ref: "43292aae51a80966d2e02bd7dd38d5e9342b8ec2" });
  const manifest = JSON.parse(await readFile(join(output, "game/release-manifest.json"), "utf8"));
  const gameHtml = await readFile(join(output, "game/public/index.html"), "utf8");
  const csp = gameHtml.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/u)?.[1]
    ?.replaceAll("&#39;", "'") ?? null;
  pagesHost = await createPagesPreviewServer({ root: output, basePath: PREFIX, logRequests: false });
  pagesHost.server.listen(0, "127.0.0.1");
  await once(pagesHost.server, "listening");
  const address = pagesHost.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}${PREFIX.slice(0, -1)}`;
  const executablePath = process.env.GAME_BROWSER_CHROME ?? chromium.executablePath();
  browser = await chromium.launch({ executablePath, headless: true });
  context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const runtimeErrors = [];
  const consoleErrors = [];
  const failedRequests = [];
  const requestUrls = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", (request) => requestUrls.push(request.url()));
  page.on("requestfailed", (request) => failedRequests.push({
    url: request.url(), failure: request.failure()?.errorText ?? "request failed",
  }));

  const landingResponse = await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
  await page.locator(".primary-nav__play").waitFor({ state: "visible" });
  const gameResponse = await Promise.all([
    page.waitForNavigation({ waitUntil: "load" }),
    page.locator(".primary-nav__play").click(),
  ]).then(([response]) => response);
  await page.locator('[data-nav-to="cards"]').waitFor({ state: "visible" });
  const navCount = await page.locator(".app-nav [data-nav-to]").count();
  await page.locator('[data-nav-to="cards"]').click();
  const cardIds = await page.locator("[data-card-grid] [data-card-id]")
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.cardId));
  const buriedChoice = page.locator('[data-card-grid] [data-card-id="buried-coil"]');
  await buriedChoice.click();
  const buriedCoil = {
    heading: await page.locator("[data-card-detail] h2").innerText(),
    description: await page.locator("[data-card-detail] .detail-description").innerText(),
    profileHeading: await page.locator("[data-card-detail] .structure-profile h3").innerText(),
    profileText: await page.locator("[data-card-detail] .structure-profile").innerText(),
  };
  const detailScreenshot = join(EVIDENCE_DIR, "prefixed-buried-coil-detail.png");
  await page.screenshot({ path: detailScreenshot, fullPage: true });
  await page.keyboard.press("Escape");
  await page.locator('[data-nav-to="battle"]').click();
  const arena = page.frameLocator("[data-battle-frame-slot] iframe").locator('[data-ui="arena"]');
  await arena.waitFor({ state: "visible", timeout: 15_000 });
  const arenaSummary = await arena.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return {
      visible: bounds.width > 0 && bounds.height > 0,
      width: bounds.width,
      height: bounds.height,
      bodyText: document.body.innerText.slice(0, 240),
    };
  });
  const frame = await page.locator("[data-battle-frame-slot] iframe").evaluate((node) => ({
    src: node.getAttribute("src"),
    resolvedSrc: node.src,
    sandbox: node.getAttribute("sandbox"),
    loading: node.loading,
  }));
  const outsidePrefix = requestUrls.filter((url) => {
    const parsed = new URL(url);
    return parsed.origin === new URL(baseUrl).origin &&
      !parsed.pathname.startsWith(PREFIX);
  });
  const qualification = build.browserQualification;
  evidence = {
    schemaVersion: 1,
    prefix: PREFIX,
    repository,
    build: {
      fileCount: build.fileCount,
      releaseBytes: build.releaseBytes,
      manifestFileCount: manifest.fileCount,
      manifestTotalBytes: manifest.totalBytes,
      manifestSha256: manifest.manifestSha256,
      underExisting8MiBCap: manifest.totalBytes < 8_388_608,
      csp,
      cspHasSelfScript: Boolean(csp?.includes("script-src 'self'")),
      cspHasNoUnsafeEval: Boolean(csp && !csp.includes("unsafe-eval")),
      qualification: {
        flow: qualification.flow,
        prefix: qualification.prefix,
        flows: qualification.flows,
        requestCount: qualification.requestCount,
        runtimeErrors: qualification.runtimeErrors,
        workers: qualification.workers,
        moduleCount: qualification.modules.length,
        moduleKinds: qualification.modules.map((module) => module.kind ?? module.path ?? module.name),
        releaseManifestFileCount: qualification.releaseManifestFileCount,
        pagesFileCount: qualification.pagesFileCount,
      },
    },
    browser: {
      landingStatus: landingResponse?.status() ?? null,
      gameStatus: gameResponse?.status() ?? null,
      gameUrl: page.url(),
      navigationCount: navCount,
      collectionCount: cardIds.length,
      cardIds,
      buriedCoil,
      buriedCoilDetailScreenshot: detailScreenshot,
      activeView: await page.locator(".app-shell").getAttribute("data-view-active"),
      battleFrameCount: await page.locator("[data-battle-frame-slot] iframe").count(),
      frame,
      arena: arenaSummary,
      runtimeErrors,
      consoleErrors,
      failedRequests,
      ownOriginRequestsOutsidePrefix: outsidePrefix,
    },
    checks: {
      landingAndGameNavigation: landingResponse?.status() === 200 && gameResponse?.status() === 200,
      admittedCollectionHas21Cards: cardIds.length === 21 && cardIds.includes("buried-coil"),
      buriedCoilTypedStructureProfile: buriedCoil.profileHeading.includes("Defensive structure"),
      buriedCoilTargetIsGroundAndAir: buriedCoil.profileText.includes("Targets\nground and air (QUESTION)"),
      buriedCoilShowsNoSplashRadius: buriedCoil.profileText.includes("Splash radius\nNot available (QUESTION)"),
      descriptionClaimsSplashDamage: /splash damage/iu.test(buriedCoil.description),
      liveProfileHasNoSplashRadius: /Splash radius\s+Not available/iu.test(buriedCoil.profileText),
      mechanicDescriptionConflict: /splash damage/iu.test(buriedCoil.description) &&
        /Splash radius\s+Not available/iu.test(buriedCoil.profileText),
      arenaLoadsInBattleView: arenaSummary.visible && frame.resolvedSrc.includes("clash-royale-clone/game/public/ui-arena-shell.html"),
      allOwnOriginRequestsStayUnderPrefix: outsidePrefix.length === 0,
      noRuntimeConsoleOrRequestErrors: runtimeErrors.length === 0 && consoleErrors.length === 0 && failedRequests.length === 0,
      pagesQualificationHasNoRuntimeErrors: qualification.runtimeErrors.length === 0,
    },
  };
  await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  if (evidence.checks.mechanicDescriptionConflict) process.exitCode = 2;
} catch (error) {
  evidence.error = error?.stack ?? String(error);
  await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stderr.write(`${JSON.stringify(evidence, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (pagesHost?.server.listening) await new Promise((resolveClose) => pagesHost.server.close(resolveClose));
  await rm(temporary, { recursive: true, force: true });
}
