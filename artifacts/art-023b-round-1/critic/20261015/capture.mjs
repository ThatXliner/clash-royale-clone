import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";

const CANDIDATE = resolve(process.env.CANDIDATE_ROOT ??
  "/private/tmp/art023b-aether-well-critic-20261015T201653Z");
const OUTPUT = resolve(process.env.REVIEW_CAPTURE_DIR ??
  "/private/tmp/art023b-aether-well-review-20261015/captures/attempt-01");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 933 },
];
const TONES = ["light", "dark"];
const BODY_TARGETS = [13, 26];
const TEAM_COLORS = { north: "#C6452E", south: "#2E7F86" };
const SAMPLE_POINTS = [
  [12.9, 23.7], [13.7, 23.7], [14.5, 23.7], [17.5, 23.7],
  [18.3, 23.7], [19.1, 23.7], [13.7, 24.3], [18.3, 24.3],
];
const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function inside(parent, child) {
  const rel = child.x >= parent.x - 0.02 && child.y >= parent.y - 0.02;
  return rel && child.x + child.width <= parent.x + parent.width + 0.02 &&
    child.y + child.height <= parent.y + parent.height + 0.02;
}

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function decodePng(bytes) {
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a",
    "capture must be a PNG");
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  const compressed = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      compressed.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12;
  }
  assert.equal(bitDepth, 8, "PNG pixel audit expects 8-bit channels");
  assert.ok(colorType === 2 || colorType === 6,
    `PNG pixel audit does not support color type ${colorType}`);
  assert.equal(interlace, 0, "PNG pixel audit expects non-interlaced data");
  const channels = colorType === 6 ? 4 : 3;
  const rowBytes = width * channels;
  const inflated = inflateSync(Buffer.concat(compressed));
  const pixels = Buffer.alloc(width * height * 4);
  let inputOffset = 0;
  let previous = Buffer.alloc(rowBytes);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset++];
    const row = Buffer.alloc(rowBytes);
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = inflated[inputOffset + x];
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x];
      const upperLeft = x >= channels ? previous[x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paeth(left, up, upperLeft);
      else assert.equal(filter, 0, `unknown PNG row filter ${filter}`);
      row[x] = (raw + predictor) & 0xff;
    }
    inputOffset += rowBytes;
    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      pixels[target] = row[source];
      pixels[target + 1] = row[source + 1];
      pixels[target + 2] = row[source + 2];
      pixels[target + 3] = channels === 4 ? row[source + 3] : 255;
    }
    previous = row;
  }
  assert.equal(inputOffset, inflated.length, "PNG scanline data must be complete");
  return {
    width,
    height,
    pixelAt(x, y) {
      const px = Math.max(0, Math.min(width - 1, Math.floor(x)));
      const py = Math.max(0, Math.min(height - 1, Math.floor(y)));
      const offset = (py * width + px) * 4;
      return {
        x: px,
        y: py,
        rgba: [...pixels.subarray(offset, offset + 4)],
      };
    },
  };
}

function rgb(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function distance(left, right) {
  return Math.sqrt(left.reduce((sum, value, index) =>
    sum + (value - right[index]) ** 2, 0));
}

function rounded(value) {
  return Math.round(value * 10000) / 10000;
}

async function nextPaint(page) {
  await page.evaluate(() => new Promise((resolvePaint) =>
    requestAnimationFrame(() => requestAnimationFrame(resolvePaint))));
}

function createStaticServer() {
  const requests = [];
  const server = createServer(async (request, response) => {
    const rawUrl = request.url ?? "/";
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(rawUrl, "http://127.0.0.1").pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    if (pathname === "/favicon.ico") {
      response.writeHead(204, { "Cache-Control": "no-store" }).end();
      return;
    }
    const absolute = resolve(CANDIDATE, `.${pathname}`);
    if (absolute !== CANDIDATE && !absolute.startsWith(`${CANDIDATE}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    let body;
    try {
      body = await readFile(absolute);
    } catch {
      requests.push({ path: pathname, status: 404 });
      response.writeHead(404, { "Cache-Control": "no-store" }).end();
      return;
    }
    const type = MIME_TYPES.get(extname(absolute).toLowerCase()) ??
      "application/octet-stream";
    requests.push({ path: pathname, status: 200, bytes: body.byteLength });
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": body.byteLength,
      "Content-Type": type,
      "X-Content-Type-Options": "nosniff",
    });
    response.end(body);
  });
  return { server, requests };
}

async function inspectCase(page, expectedBodyCssPixels) {
  const report = await page.evaluate((samplePointsInUserSpace) => {
    const arena = document.querySelector("[data-art-host]");
    const arenaRect = arena.getBoundingClientRect();
    const viewport = { x: 0, y: 0, width: innerWidth, height: innerHeight };
    const rect = (element) => {
      const bounds = element.getBoundingClientRect();
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    };
    const transformedBounds = (matrix, bounds) => {
      const points = [
        [bounds.x, bounds.y],
        [bounds.x + bounds.width, bounds.y],
        [bounds.x, bounds.y + bounds.height],
        [bounds.x + bounds.width, bounds.y + bounds.height],
      ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
      const xs = points.map(({ x }) => x);
      const ys = points.map(({ y }) => y);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
    };
    const art = [...document.querySelectorAll('svg[data-art-id="aether-well"]')]
      .map((svg) => {
        const bbox = svg.getBBox();
        const frame = rect(svg);
        const userBounds = {
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height,
        };
        const screenBounds = transformedBounds(svg.getScreenCTM(), userBounds);
        const badge = svg.querySelector('[data-part="team-badge"]');
        const matrix = svg.getScreenCTM();
        const samplePoints = samplePointsInUserSpace.map(([x, y]) => {
          const screen = new DOMPoint(x, y).matrixTransform(matrix);
          return { userX: x, userY: y, screenX: screen.x, screenY: screen.y };
        });
        return {
          side: svg.dataset.side,
          bodyTargetCssPixels: Number(svg.dataset.targetBodyCssPixels),
          helperBodyInputCssPixels: Number(svg.dataset.bodyCssPixels),
          bodyBoundsUnits: userBounds,
          bodyBoundsScreenCssPixels: screenBounds,
          frameScreenCssPixels: frame,
          measuredBodyCssPixels: bbox.height * frame.height / 32,
          teamColor: svg.dataset.teamColor,
          badgeFill: badge?.getAttribute("fill") ?? null,
          teamSamples: samplePoints,
        };
      });
    return {
      title: document.title,
      ready: document.documentElement.dataset.fixtureReady === "true",
      viewport,
      devicePixelRatio,
      arena: rect(arena),
      shell: rect(document.querySelector(".battle-shell")),
      tone: arena.dataset.tone,
      targetBodyCssPixels: Number(arena.dataset.targetBodyCssPixels),
      art,
    };
  }, SAMPLE_POINTS);

  assert.equal(report.ready, true, "fixture must finish rendering");
  assert.deepEqual(report.viewport, {
    x: 0,
    y: 0,
    width: await page.evaluate(() => innerWidth),
    height: await page.evaluate(() => innerHeight),
  });
  assert.equal(report.devicePixelRatio, 1, "native captures must use DPR 1");
  assert.equal(report.art.length, 2, "fixture must show north and south wells");
  assert.deepEqual(report.art.map(({ side }) => side).sort(), ["north", "south"]);
  for (const art of report.art) {
    assert.equal(art.bodyTargetCssPixels, expectedBodyCssPixels);
    assert.ok(Math.abs(art.measuredBodyCssPixels - expectedBodyCssPixels) <= 0.01,
      `${art.side} body is ${art.measuredBodyCssPixels} CSS px, expected ` +
      `${expectedBodyCssPixels} ± 0.01`);
    assert.ok(inside(report.viewport, art.bodyBoundsScreenCssPixels),
      `${art.side} body must be fully inside the viewport`);
    assert.ok(inside(report.arena, art.bodyBoundsScreenCssPixels),
      `${art.side} body must be fully visible inside the arena`);
    assert.equal(art.teamColor, art.badgeFill,
      `${art.side} badge fill must match its team color`);
  }
  return report;
}

function pixelAudit(decoded, report) {
  const rows = report.art.map((art) => {
    const own = rgb(TEAM_COLORS[art.side]);
    const opposite = rgb(TEAM_COLORS[art.side === "north" ? "south" : "north"]);
    const samples = art.teamSamples.map((sample) => {
      const pixel = decoded.pixelAt(sample.screenX, sample.screenY);
      const observed = pixel.rgba.slice(0, 3);
      const ownDistance = distance(observed, own);
      const oppositeDistance = distance(observed, opposite);
      return {
        userUnits: [sample.userX, sample.userY],
        pixel: [pixel.x, pixel.y],
        rgb: observed,
        ownDistance: rounded(ownDistance),
        opposingDistance: rounded(oppositeDistance),
        closerToOwnTeam: ownDistance < oppositeDistance,
      };
    });
    const ownCloser = samples.filter(({ closerToOwnTeam }) => closerToOwnTeam);
    const closestOwn = samples.reduce((best, sample) =>
      sample.ownDistance < best.ownDistance ? sample : best, samples[0]);
    assert.ok(ownCloser.length > 0,
      `${art.side} team color must be visible in screenshot pixels`);
    assert.ok(closestOwn.ownDistance <= 90,
      `${art.side} badge pixels are too far from its expected team color`);
    return {
      side: art.side,
      expectedTeamColor: TEAM_COLORS[art.side],
      closerToOwnCount: ownCloser.length,
      sampleCount: samples.length,
      closestOwnSample: closestOwn,
      samples,
    };
  });
  return rows;
}

async function run() {
  await mkdir(OUTPUT, { recursive: true });
  const playwrightPackage = JSON.parse(await readFile(
    join(CANDIDATE, "node_modules/playwright/package.json"), "utf8"));
  assert.equal(playwrightPackage.version, "1.58.2",
    "review must use private pinned Playwright 1.58.2");
  const playwrightUrl = pathToFileURL(join(CANDIDATE,
    "node_modules/playwright/index.mjs")).href;
  const { chromium } = await import(playwrightUrl);
  const hosted = createStaticServer();
  let browser;
  const completed = [];
  let baseUrl;

  try {
    hosted.server.listen(0, "127.0.0.1");
    await new Promise((resolveListen, rejectListen) => {
      hosted.server.once("listening", resolveListen);
      hosted.server.once("error", rejectListen);
    });
    const address = hosted.server.address();
    assert.ok(address && typeof address === "object");
    baseUrl = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    assert.match(browser.version(), /^155\./,
      `expected native Chrome 155, received ${browser.version()}`);

    for (const viewport of VIEWPORTS) {
      for (const tone of TONES) {
        for (const bodyTargetCssPixels of BODY_TARGETS) {
          const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            deviceScaleFactor: 1,
            colorScheme: tone,
            reducedMotion: "no-preference",
          });
          const page = await context.newPage();
          const runtimeErrors = [];
          const requestFailures = [];
          page.on("pageerror", (error) => runtimeErrors.push(error.stack ?? String(error)));
          page.on("console", (message) => {
            if (message.type() === "error") runtimeErrors.push(message.text());
          });
          page.on("requestfailed", (request) => requestFailures.push({
            url: request.url(),
            error: request.failure()?.errorText ?? "failed",
          }));
          const caseId = `${viewport.name}-${tone}-${bodyTargetCssPixels}px`;
          const url = `${baseUrl}/demo/aether-well-battle-art.html?body=` +
            `${bodyTargetCssPixels}&tone=${tone}`;
          const response = await page.goto(url, {
            waitUntil: "networkidle",
            timeout: 15_000,
          });
          assert.equal(response?.status(), 200, `${caseId} fixture response`);
          await page.waitForFunction(() =>
            document.documentElement.dataset.fixtureReady === "true", null,
          { timeout: 15_000 });
          await page.evaluate(() => document.fonts.ready);
          await nextPaint(page);
          const inspection = await inspectCase(page, bodyTargetCssPixels);
          assert.equal(inspection.viewport.width, viewport.width);
          assert.equal(inspection.viewport.height, viewport.height);
          assert.equal(inspection.tone, tone);
          assert.equal(inspection.targetBodyCssPixels, bodyTargetCssPixels);

          const baselinePng = await page.screenshot({ type: "png", fullPage: false });
          const decoded = decodePng(baselinePng);
          assert.equal(decoded.width, viewport.width,
            `${caseId} screenshot width must equal the viewport at DPR 1`);
          assert.equal(decoded.height, viewport.height,
            `${caseId} screenshot height must equal the viewport at DPR 1`);
          const audit = pixelAudit(decoded, inspection);
          const baselineHash = sha256(baselinePng);
          const screenshotPath = join(OUTPUT, `${caseId}.png`);
          await writeFile(screenshotPath, baselinePng);

          await page.evaluate(() => window.dispatchEvent(new Event("resize")));
          await nextPaint(page);
          const repeatedPng = await page.screenshot({ type: "png", fullPage: false });
          const repeatedHash = sha256(repeatedPng);

          await page.emulateMedia({ reducedMotion: "reduce" });
          await nextPaint(page);
          const reducedMotionPng = await page.screenshot({ type: "png", fullPage: false });
          const reducedMotionHash = sha256(reducedMotionPng);
          const reducedMotionActive = await page.evaluate(() =>
            matchMedia("(prefers-reduced-motion: reduce)").matches);
          assert.equal(reducedMotionActive, true);
          assert.equal(repeatedHash, baselineHash,
            `${caseId} repeat render must be byte-identical`);
          assert.equal(reducedMotionHash, baselineHash,
            `${caseId} reduced-motion render must be byte-identical`);
          assert.deepEqual(runtimeErrors, [], `${caseId} browser runtime errors`);
          assert.deepEqual(requestFailures, [], `${caseId} failed browser requests`);
          await context.close();

          completed.push({
            id: caseId,
            url,
            viewport: { width: viewport.width, height: viewport.height },
            dpr: 1,
            tone,
            bodyTargetCssPixels,
            screenshot: {
              path: `${caseId}.png`,
              width: decoded.width,
              height: decoded.height,
              bytes: baselinePng.byteLength,
              sha256: baselineHash,
            },
            repeatedRender: {
              bytes: repeatedPng.byteLength,
              sha256: repeatedHash,
              exactMatch: repeatedHash === baselineHash,
            },
            reducedMotion: {
              active: reducedMotionActive,
              bytes: reducedMotionPng.byteLength,
              sha256: reducedMotionHash,
              exactMatch: reducedMotionHash === baselineHash,
            },
            inspection,
            teamPixelAudit: audit,
            runtimeErrors,
            requestFailures,
          });
        }
      }
    }

    assert.equal(completed.length, 8, "capture matrix must contain all eight cases");
    const missing = hosted.requests.filter(({ status }) => status !== 200);
    assert.deepEqual(missing, [], "fixture asset requests must all succeed");
    const manifest = {
      schemaVersion: 1,
      commit: "1d026c4987b0d99e3043d3b1004e6c00e7502081",
      baseCommit: "330f2804ebd5b421b5f952ca0187fcb76d4c6af6",
      runtime: {
        node: process.version,
        nodeExecutable: process.execPath,
        playwright: playwrightPackage.version,
        chromeExecutable: CHROME,
        chromeVersion: browser.version(),
        headless: true,
        launchArgsAddedByHarness: [],
      },
      fixture: "demo/aether-well-battle-art.html",
      queryContract: "?body=13|26&tone=light|dark",
      capturePolicy: {
        viewportScreenshot: true,
        fullPage: false,
        deviceScaleFactor: 1,
        contexts: 8,
        tones: TONES,
        bodyTargetsCssPixels: BODY_TARGETS,
        viewports: VIEWPORTS.map(({ name, width, height }) => ({ name, width, height })),
      },
      bodyMeasurement: "svg.getBBox().height * getBoundingClientRect().height / 32",
      bodyToleranceCssPixels: 0.01,
      screenshotByteEquality: {
        repeatedResizeRender: completed.every((item) => item.repeatedRender.exactMatch),
        reducedMotion: completed.every((item) => item.reducedMotion.exactMatch),
      },
      requests: hosted.requests,
      captures: completed,
    };
    await writeFile(join(OUTPUT, "capture-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({
      captureCount: completed.length,
      chromeVersion: browser.version(),
      exactRepeatedRenders: manifest.screenshotByteEquality.repeatedResizeRender,
      exactReducedMotion: manifest.screenshotByteEquality.reducedMotion,
      outputs: OUTPUT,
    }, null, 2)}\n`);
  } catch (error) {
    await writeFile(join(OUTPUT, "capture-failure.json"), `${JSON.stringify({
      completedCaseIds: completed.map(({ id }) => id),
      chromeVersion: browser?.version() ?? null,
      baseUrl: baseUrl ?? null,
      error: error?.stack ?? String(error),
      requests: hosted.requests,
    }, null, 2)}\n`);
    throw error;
  } finally {
    if (browser) await browser.close();
    if (hosted.server.listening) {
      await new Promise((resolveClose, rejectClose) => hosted.server.close((error) =>
        error ? rejectClose(error) : resolveClose()));
    }
  }
}

await run();
