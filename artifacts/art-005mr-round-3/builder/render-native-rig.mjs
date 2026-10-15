import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";
import { chromium } from "/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright/index.mjs";

const root = process.cwd();
const evidenceDir = path.join(root, "artifacts/art-005mr-round-3/builder");
const chromeExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const pageErrors = [];
const consoleErrors = [];
const captures = [];
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const file = path.resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    const body = await fs.readFile(file);
    const type = file.endsWith(".html") ? "text/html; charset=utf-8"
      : file.endsWith(".js") || file.endsWith(".mjs") ? "text/javascript; charset=utf-8"
        : file.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream";
    response.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(body);
  } catch {
    response.writeHead(404).end();
  }
});

await fs.mkdir(evidenceDir, { recursive: true });
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
let browser;

try {
  browser = await chromium.launch({
    executablePath: chromeExecutable,
    headless: true,
    ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  async function capture(view, selector, name) {
    const url = `${baseUrl}/demo/mossguard-vector-rig.html${view ? `?view=${view}` : ""}`;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const bytes = selector
      ? await page.locator(selector).screenshot()
      : await page.screenshot({ fullPage: true });
    const pngWidth = bytes.readUInt32BE(16);
    const pngHeight = bytes.readUInt32BE(20);
    const file = `${name}-${pngWidth}x${pngHeight}.png`;
    await fs.writeFile(path.join(evidenceDir, file), bytes);
    captures.push({
      path: `artifacts/art-005mr-round-3/builder/${file}`,
      width: pngWidth,
      height: pngHeight,
      bytes: bytes.length,
    });
  }

  await capture("before", "[data-section=baseline]", "before-original-native13");
  await capture("after", "[data-section=poses]", "after-rig-native13");
  await capture("after", "[data-section=diagnostic]", "after-rig-diagnostic96");
  await capture(null, null, "comparison-page-full");

  const auditPage = browser.contexts()[0].pages()[0];
  const measurements = await auditPage.evaluate(() => {
    const safe = { x: 4, y: 6, right: 60, bottom: 58 };
    const native = [...document.querySelectorAll("[data-pose-grid] .pose-cell")].map((cell) => {
      const svg = cell.querySelector("svg");
      const body = svg.querySelector("[data-mossguard-body]");
      const box = body.getBBox();
      const outer = body.transform.baseVal.consolidate()?.matrix ?? new DOMMatrix();
      const corners = [
        new DOMPoint(box.x, box.y),
        new DOMPoint(box.x + box.width, box.y),
        new DOMPoint(box.x, box.y + box.height),
        new DOMPoint(box.x + box.width, box.y + box.height),
      ].map((point) => point.matrixTransform(outer));
      const x = Math.min(...corners.map((point) => point.x));
      const y = Math.min(...corners.map((point) => point.y));
      const right = Math.max(...corners.map((point) => point.x));
      const bottom = Math.max(...corners.map((point) => point.y));
      const paths = [...body.querySelectorAll("path")];
      const legBottoms = paths.slice(0, 2).map((leg) => {
        const legBox = leg.getBBox();
        return legBox.y + legBox.height;
      });
      const strokes = paths.filter((node) => getComputedStyle(node).stroke !== "none").length;
      const anchor = new DOMPoint(32, 58).matrixTransform(outer);
      return {
        direction: cell.dataset.direction,
        pose: cell.dataset.pose,
        team: cell.dataset.team,
        boundsViewBox: { x, y, width: right - x, height: bottom - y },
        bodyHeightCssPx: (bottom - y) * svg.getBoundingClientRect().height / 64,
        soleAnchor: { x: anchor.x, y: anchor.y },
        legBottomsViewBox: legBottoms,
        strokedPaths: strokes,
        bodyPathCount: paths.length,
        svgCssSize: svg.getBoundingClientRect().width,
        insideSafeBounds: x >= safe.x - 0.01 && y >= safe.y - 0.01 && right <= safe.right + 0.01 && bottom <= safe.bottom + 0.01,
      };
    });
    const gradientIds = [...document.querySelectorAll("linearGradient[id]")].map((node) => node.id);
    const localRefs = [...document.querySelectorAll(".mossguard-vector-art")].map((svg) => {
      const ids = new Set([...svg.querySelectorAll("[id]")].map((node) => node.id));
      const refs = [...svg.querySelectorAll("[fill]")].flatMap((node) => [...node.getAttribute("fill").matchAll(/url\(#([^)]+)\)/g)].map(([, id]) => id));
      return refs.every((id) => ids.has(id));
    });
    return {
      native,
      baseline: JSON.parse(document.documentElement.dataset.baselineMetrics),
      declaredRigMetrics: JSON.parse(document.documentElement.dataset.rigMetrics),
      diagnosticPoseCount: document.querySelectorAll("[data-diagnostic-grid] .diagnostic-cell").length,
      gradientIdCount: gradientIds.length,
      uniqueGradientIdCount: new Set(gradientIds).size,
      localRefs,
      measureLabel: document.querySelector("[data-rig-measure]").textContent,
    };
  });

  const versionPage = await browser.newPage();
  let chromeCommandLine = "unavailable";
  try {
    await versionPage.goto("chrome://version/", { waitUntil: "domcontentloaded" });
    chromeCommandLine = await versionPage.locator("#command_line").innerText({ timeout: 5000 });
  } catch (error) {
    pageErrors.push(`chrome://version command line unavailable: ${String(error)}`);
  }
  const gpuFlagsPresent = /--(?:disable-gpu|enable-gpu|use-angle|use-gl|gpu-launcher|disable-software-rasterizer|enable-unsafe-swiftshader)/i.test(chromeCommandLine);
  const assertions = measurements.native.map((pose) => {
    const box = pose.boundsViewBox;
    const expectedPlant = pose.pose === "walkA" ? pose.legBottomsViewBox[0]
      : pose.pose === "walkB" ? pose.legBottomsViewBox[1] : null;
    const lifted = pose.pose === "walkA" ? pose.legBottomsViewBox[1]
      : pose.pose === "walkB" ? pose.legBottomsViewBox[0] : null;
    return {
      id: `${pose.direction}/${pose.pose}`,
      bodyHeight13: Math.abs(pose.bodyHeightCssPx - 13) < 0.01,
      insideSafeBounds: pose.insideSafeBounds,
      sharedSoleAnchor: Math.abs(pose.soleAnchor.x - 32) < 0.01 && Math.abs(pose.soleAnchor.y - 58) < 0.01,
      noStrokes: pose.strokedPaths === 0,
      walkingPlantAt58: expectedPlant === null || Math.abs(expectedPlant - 58) < 0.01,
      alternateFootLiftAtLeast11Units: lifted === null || 58 - lifted >= 11 - 0.01,
      nativeCell16: Math.abs(pose.svgCssSize - 16) < 0.01,
      boundsInsideDeclaredBox: box.x >= 4 - 0.01 && box.y >= 6 - 0.01 && box.x + box.width <= 60 + 0.01 && box.y + box.height <= 58 + 0.01,
    };
  });
  const summary = {
    schemaVersion: 1,
    round: 3,
    nodeVersion: process.version,
    playwrightVersion: "1.58.2",
    browserVersion: browser.version(),
    executable: chromeExecutable,
    method: "Pinned Playwright 1.58.2 launched installed Chrome headless at a 1440x1200 CSS viewport and deviceScaleFactor 1. Playwright's automatic --enable-unsafe-swiftshader default argument was explicitly filtered; no GPU override was supplied. SVG body groups were measured in browser at native 16x16 cells (13 CSS px body).",
    viewport: { width: 1440, height: 1200 },
    deviceScaleFactor: 1,
    chromeCommandLine,
    gpuFlagsPresent,
    pageErrors,
    consoleErrors,
    captures,
    measurementMethod: "Actual Chrome SVGElement.getBBox for the visible body group, including its child action-layer transforms, followed only by the explicit outer facing transform; all path children are included and none has a stroke. The shadow is outside the measured body group. The first two path boxes record the actual alternate feet; no pixels were masked or compared by tolerance.",
    measurements,
    safeBounds: { x: 4, y: 6, right: 60, bottom: 58 },
    assertions,
    checks: {
      nativePoseCount: measurements.native.length === 16,
      diagnosticPoseCount: measurements.diagnosticPoseCount === 16,
      bodyHeights13: assertions.every((item) => item.bodyHeight13),
      allInsideSafeBounds: assertions.every((item) => item.insideSafeBounds && item.boundsInsideDeclaredBox),
      sharedSoleAnchors: assertions.every((item) => item.sharedSoleAnchor),
      allWalkPlantsAt58: assertions.filter((item) => item.id.endsWith("/walkA") || item.id.endsWith("/walkB")).every((item) => item.walkingPlantAt58),
      alternateFeetLiftAtLeast11ViewBoxUnits: assertions.filter((item) => item.id.endsWith("/walkA") || item.id.endsWith("/walkB")).every((item) => item.alternateFootLiftAtLeast11Units),
      nativeCells16: assertions.every((item) => item.nativeCell16),
      allMeasuredPathsStrokeFree: assertions.every((item) => item.noStrokes),
      gradientIdsUnique: measurements.gradientIdCount === 96 && measurements.uniqueGradientIdCount === 96,
      gradientRefsLocal: measurements.localRefs.length === 32 && measurements.localRefs.every(Boolean),
      noGpuFlags: !gpuFlagsPresent,
      noPageOrConsoleErrors: pageErrors.length === 0 && consoleErrors.length === 0,
    },
  };
  await fs.writeFile(path.join(evidenceDir, "native-render-evidence.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  if (Object.values(summary.checks).some((value) => value !== true)) process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
