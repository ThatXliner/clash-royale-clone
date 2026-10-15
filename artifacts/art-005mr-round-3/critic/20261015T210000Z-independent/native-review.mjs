import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const scriptPath = fileURLToPath(import.meta.url);
const evidenceDir = dirname(scriptPath);
const projectRoot = resolve(evidenceDir, '../../../../');
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profileDir = mkdtempSync(join(tmpdir(), 'art-005mr-critic-chrome-'));
const requestFailures = [];
const pageErrors = [];
const consoleErrors = [];
let server;
let chromeProcess;
let browser;
let result;

function pngInfo(path) {
  const bytes = readFileSync(path);
  return {
    path: relative(projectRoot, path),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function writeEvidence(name, value) {
  writeFileSync(join(evidenceDir, name), `${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);
}

try {
  const serverReady = new Promise((resolveReady, rejectReady) => {
    server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      const requestedPath = decodeURIComponent(requestUrl.pathname);
      const filePath = resolve(projectRoot, `.${requestedPath}`);
      if (filePath !== projectRoot && !filePath.startsWith(`${projectRoot}/`)) {
        response.writeHead(403).end('forbidden');
        return;
      }
      try {
        const content = readFileSync(filePath);
        const contentType = extname(filePath) === '.html' ? 'text/html; charset=utf-8'
          : extname(filePath) === '.js' ? 'text/javascript; charset=utf-8'
            : 'application/octet-stream';
        response.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' });
        response.end(content);
      } catch (error) {
        response.writeHead(404).end(String(error));
      }
    });
    server.once('error', rejectReady);
    server.listen(0, '127.0.0.1', () => resolveReady(server.address().port));
  });
  const port = await serverReady;
  const origin = `http://127.0.0.1:${port}`;
  const initialUrl = `${origin}/demo/mossguard-vector-rig.html?view=compare`;
  const openedAt = new Date().toISOString();
  chromeProcess = spawn(chromePath, [
    `--user-data-dir=${profileDir}`,
    '--remote-debugging-port=0',
    initialUrl,
  ], { stdio: 'ignore' });

  const activePortPath = join(profileDir, 'DevToolsActivePort');
  let devToolsPort;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      devToolsPort = Number(readFileSync(activePortPath, 'utf8').split('\n')[0]);
      if (Number.isInteger(devToolsPort) && devToolsPort > 0) break;
    } catch {}
    if (chromeProcess.exitCode !== null) throw new Error(`Chrome exited before DevTools came up: ${chromeProcess.exitCode}`);
    await delay(50);
  }
  if (!devToolsPort) throw new Error('Chrome did not publish DevToolsActivePort within 10 seconds');

  browser = await chromium.connectOverCDP(`http://127.0.0.1:${devToolsPort}`);
  const context = browser.contexts()[0];
  if (!context) throw new Error('Chrome exposed no default browser context');
  const pages = context.pages();
  let page = pages.find((candidate) => candidate.url().startsWith(origin));
  if (!page) page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? null }));

  const versionPage = await context.newPage();
  await versionPage.goto('chrome://version/', { waitUntil: 'load' });
  const chromeVersion = await versionPage.locator('#version').innerText();
  const chromeCommandLine = await versionPage.locator('#command_line').innerText();
  const chromeExecutable = await versionPage.locator('#executable_path').innerText();
  await versionPage.close();

  const gpuPage = await context.newPage();
  await gpuPage.goto('chrome://gpu/', { waitUntil: 'load' });
  const gpuStatusLines = (await gpuPage.locator('body').innerText()).split('\n')
    .filter((line) => /Graphics Feature Status|Canvas:|Compositing:|WebGL:|Rasterization:|Video Decode:|Video Encode:|Vulkan:|OpenGL:/i.test(line));
  await gpuPage.close();

  const viewport = { width: 1440, height: 1200, deviceScaleFactor: 1 };
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`${origin}/demo/mossguard-vector-rig.html?view=before`, { waitUntil: 'load' });
  await page.screenshot({ path: join(evidenceDir, 'before-original-native.png'), fullPage: true });
  const before = await page.evaluate(() => ({
    title: document.title,
    view: document.body.dataset.view,
    baselineLabel: document.querySelector('[data-baseline-measure]')?.textContent,
    baselineMetrics: JSON.parse(document.documentElement.dataset.baselineMetrics ?? 'null'),
  }));

  await page.goto(`${origin}/demo/mossguard-vector-rig.html?view=after`, { waitUntil: 'load' });
  await page.screenshot({ path: join(evidenceDir, 'after-rig-native.png'), fullPage: true });
  const after = await page.evaluate(() => ({
    title: document.title,
    view: document.body.dataset.view,
    rigLabel: document.querySelector('[data-rig-measure]')?.textContent,
    nativeMetrics: JSON.parse(document.documentElement.dataset.rigMetrics ?? 'null'),
  }));

  await page.goto(`${origin}/demo/mossguard-vector-rig.html?view=compare`, { waitUntil: 'load' });
  await page.screenshot({ path: join(evidenceDir, 'comparison-before-after-native.png'), fullPage: true });
  await page.locator('[data-section="diagnostic"]').screenshot({ path: join(evidenceDir, 'diagnostic-96px-labeled-not-native-proof.png') });
  const audit = await page.evaluate(() => {
    function transformedBounds(element, svg, includeStroke = true) {
      const box = element.getBBox();
      const style = getComputedStyle(element);
      const stroke = includeStroke && style.stroke !== 'none' ? Number.parseFloat(style.strokeWidth) || 0 : 0;
      const half = stroke / 2;
      const expanded = { x: box.x - half, y: box.y - half, width: box.width + stroke, height: box.height + stroke };
      const matrix = svg.getScreenCTM().inverse().multiply(element.getScreenCTM());
      const points = [
        new DOMPoint(expanded.x, expanded.y),
        new DOMPoint(expanded.x + expanded.width, expanded.y),
        new DOMPoint(expanded.x, expanded.y + expanded.height),
        new DOMPoint(expanded.x + expanded.width, expanded.y + expanded.height),
      ].map((point) => point.matrixTransform(matrix));
      const xs = points.map(({ x }) => x);
      const ys = points.map(({ y }) => y);
      return {
        x: Math.min(...xs), y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
        stroke, strokeColor: style.stroke,
      };
    }
    function union(boxes) {
      const left = Math.min(...boxes.map(({ x }) => x));
      const top = Math.min(...boxes.map(({ y }) => y));
      const right = Math.max(...boxes.map(({ x, width }) => x + width));
      const bottom = Math.max(...boxes.map(({ y, height }) => y + height));
      return { x: left, y: top, width: right - left, height: bottom - top };
    }
    const nativeSvgs = [...document.querySelectorAll('[data-pose-grid] svg')];
    const bodies = nativeSvgs.map((svg) => {
      const body = svg.querySelector('[data-mossguard-body]');
      const paths = [...body.querySelectorAll('path')];
      const bounds = union(paths.map((path) => transformedBounds(path, svg, true)));
      const soles = paths.slice(0, 2).map((path) => transformedBounds(path, svg, true));
      const rootBounds = { x: 0, y: 0, width: 64, height: 64 };
      const safe = { x: 4, y: 6, width: 56, height: 52 };
      const shadow = svg.querySelector('ellipse');
      const shadowBounds = transformedBounds(shadow, svg, true);
      const viewBoxRect = svg.getBoundingClientRect();
      const scale = viewBoxRect.height / 64;
      return {
        direction: svg.dataset.direction,
        pose: svg.dataset.pose,
        team: svg.dataset.team,
        cssCell: { width: viewBoxRect.width, height: viewBoxRect.height },
        bodyBoundsStrokeInclusiveViewBox: bounds,
        bodyHeightCssPx: bounds.height * scale,
        bodyInsideSafeBounds: bounds.x >= safe.x && bounds.y >= safe.y &&
          bounds.x + bounds.width <= safe.x + safe.width && bounds.y + bounds.height <= safe.y + safe.height,
        solePathBottoms: soles.map(({ y, height }) => y + height),
        plantedSoleBottom: Math.max(...soles.map(({ y, height }) => y + height)),
        soleAnchorAttribute: body.getAttribute('data-anchor-y'),
        shadowBoundsViewBox: shadowBounds,
        shadowInsideViewBox: shadowBounds.x >= rootBounds.x && shadowBounds.y >= rootBounds.y &&
          shadowBounds.x + shadowBounds.width <= rootBounds.x + rootBounds.width &&
          shadowBounds.y + shadowBounds.height <= rootBounds.y + rootBounds.height,
        visibleStrokePathCount: paths.filter((path) => {
          const style = getComputedStyle(path);
          return style.stroke !== 'none' && Number.parseFloat(style.strokeWidth) > 0;
        }).length,
      };
    });
    const svgs = [...document.querySelectorAll('.mossguard-vector-art')];
    const allIds = svgs.flatMap((svg) => [...svg.querySelectorAll('linearGradient')].map((gradient) => gradient.id));
    const localRefs = svgs.every((svg) => {
      const ids = new Set([...svg.querySelectorAll('[id]')].map((element) => element.id));
      return [...svg.outerHTML.matchAll(/url\(#([^)]+)\)/g)].every(([, id]) => ids.has(id));
    });
    const gradientRefsAreLocal = svgs.every((svg) => {
      const ids = new Set([...svg.querySelectorAll('[id]')].map((element) => element.id));
      return [...svg.outerHTML.matchAll(/url\(#([^)]+)\)/g)].every(([, id]) => ids.has(id));
    });
    const nativeTeams = Object.fromEntries(['ember', 'jade'].map((team) => [team, nativeSvgs.filter((svg) => svg.dataset.team === team).length]));
    const explicitTeamFills = Object.fromEntries(['#C6452E', '#2E7F86'].map((color) => [color, nativeSvgs.reduce((count, svg) => count + [...svg.querySelectorAll('path')].filter((path) => path.getAttribute('fill') === color).length, 0)]));
    const rootArtifacts = {
      imageElements: document.querySelectorAll('img, image').length,
      canvasElements: document.querySelectorAll('canvas').length,
      foreignObjectElements: document.querySelectorAll('foreignObject').length,
      useElements: document.querySelectorAll('use').length,
    };
    return {
      title: document.title,
      view: document.body.dataset.view,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      nativePoseCount: bodies.length,
      nativeBodyHeightsCssPx: bodies.map(({ bodyHeightCssPx }) => bodyHeightCssPx),
      allNativeBodiesInsideDeclaredSafeBounds: bodies.every(({ bodyInsideSafeBounds }) => bodyInsideSafeBounds),
      allNativeShadowsInside64ViewBox: bodies.every(({ shadowInsideViewBox }) => shadowInsideViewBox),
      shadowBoundsViewBox: bodies[0]?.shadowBoundsViewBox,
      soleAnchorY: [...new Set(bodies.map(({ soleAnchorAttribute }) => soleAnchorAttribute))],
      plantedSoleBottoms: [...new Set(bodies.map(({ plantedSoleBottom }) => plantedSoleBottom))],
      visibleStrokePathCounts: [...new Set(bodies.map(({ visibleStrokePathCount }) => visibleStrokePathCount))],
      allIdsCount: allIds.length,
      uniqueIdCount: new Set(allIds).size,
      gradientRefsAreLocal,
      nativeTeams,
      explicitTeamFills,
      rootArtifacts,
      bodies,
    };
  });

  const screenshotPaths = [
    'before-original-native.png',
    'after-rig-native.png',
    'comparison-before-after-native.png',
    'diagnostic-96px-labeled-not-native-proof.png',
  ].map((name) => pngInfo(join(evidenceDir, name)));
  let processCommand = null;
  try {
    processCommand = execFileSync('ps', ['-ww', '-p', String(chromeProcess.pid), '-o', 'pid=,ppid=,command='], { encoding: 'utf8' }).trim();
  } catch (error) {
    processCommand = `ps capture failed: ${error.message}`;
  }
  result = {
    openedAt,
    capturedAt: new Date().toISOString(),
    chromeSpawnPid: chromeProcess.pid,
    chromeSpawnCommand: processCommand,
    chromeVersion,
    chromeExecutable,
    chromeCommandLine,
    gpuStatusLines,
    playwrightVersion: '1.58.2 (project node_modules)',
    browserConnection: 'Playwright connectOverCDP to separately launched installed Chrome; no Playwright launch flags used',
    profilePath: profileDir,
    profilePolicy: 'Fresh temporary profile outside evidence tree; removed after capture.',
    viewport,
    before,
    after,
    audit,
    screenshots: screenshotPaths,
    pageErrors,
    consoleErrors,
    requestFailures,
  };
  writeEvidence('native-review-evidence.json', result);
} finally {
  if (browser) {
    try { await browser.close(); } catch (error) { writeEvidence('browser-close-error.raw', String(error.stack ?? error)); }
  }
  if (chromeProcess && chromeProcess.exitCode === null) {
    chromeProcess.kill('SIGTERM');
    await Promise.race([
      new Promise((resolveExit) => chromeProcess.once('exit', resolveExit)),
      delay(5000),
    ]);
    if (chromeProcess.exitCode === null) {
      chromeProcess.kill('SIGKILL');
      await Promise.race([
        new Promise((resolveExit) => chromeProcess.once('exit', resolveExit)),
        delay(2000),
      ]);
    }
  }
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  rmSync(profileDir, { recursive: true, force: true });
  writeEvidence('profile-cleanup.json', {
    removed: true,
    path: profileDir,
    chromeProcessExitCode: chromeProcess?.exitCode ?? null,
    cleanupAt: new Date().toISOString(),
  });
}

if (!result) throw new Error('Native review ended without a completed evidence record');
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
