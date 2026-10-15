import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "/Users/me/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const root = process.cwd();
const evidenceDir = path.join(root, "artifacts/art-005mr-round-2/builder");
const chromeExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const pageErrors = [];
const consoleErrors = [];
const assertResults = [];
const captures = [];
await fs.mkdir(evidenceDir, { recursive: true });
const browser = await chromium.launch({ executablePath: chromeExecutable, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

async function captureView(view, label) {
  const url = "http://127.0.0.1:4176/demo/mossguard-vector-rig.html" + (view ? "?view=" + view : "");
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const bytes = await page.screenshot({ fullPage: true });
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const file = label + "-" + width + "x" + height + ".png";
  await fs.writeFile(path.join(evidenceDir, file), bytes);
  captures.push({ path: "artifacts/art-005mr-round-2/builder/" + file, width, height, bytes: bytes.length });
  return { width, height };
}

await captureView("before", "before-original-vector");
await captureView("after", "after-vector-rig");
await captureView(null, "comparison-default");
const measurements = await page.evaluate(() => {
  const nativeCells = [...document.querySelectorAll("[data-pose-grid] .pose-cell")];
  const diagnosticCells = [...document.querySelectorAll("[data-diagnostic-grid] .diagnostic-cell")];
  const native = nativeCells.map((cell) => {
    const svg = cell.querySelector("svg");
    const group = svg.querySelector("[data-mossguard-body]");
    const local = group.getBBox();
    const matrix = group.getCTM();
    const corners = [
      new DOMPoint(local.x, local.y),
      new DOMPoint(local.x + local.width, local.y),
      new DOMPoint(local.x, local.y + local.height),
      new DOMPoint(local.x + local.width, local.y + local.height),
    ].map((point) => point.matrixTransform(matrix));
    const x = Math.min(...corners.map((point) => point.x));
    const y = Math.min(...corners.map((point) => point.y));
    const right = Math.max(...corners.map((point) => point.x));
    const bottom = Math.max(...corners.map((point) => point.y));
    const paths = [...group.querySelectorAll("path")];
    const strokedPaths = paths.filter((node) => getComputedStyle(node).stroke !== "none").length;
    const anchor = new DOMPoint(32, 58).matrixTransform(group.getCTM());
    return {
      direction: cell.dataset.direction,
      pose: cell.dataset.pose,
      team: cell.dataset.team,
      boundsViewBox: { x, y, width: right - x, height: bottom - y },
      bodyHeightCssPx: (bottom - y) * svg.getBoundingClientRect().height / 64,
      soleAnchor: { x: anchor.x, y: anchor.y },
      strokedPaths,
      pathCount: paths.length,
      svgCssSize: svg.getBoundingClientRect().width,
      boundsSource: "body group getBBox transformed by its CTM; all body paths inspected",
    };
  });
  const gradientIds = [...document.querySelectorAll("linearGradient[id]")].map((node) => node.id);
  const localGradientRefs = [...document.querySelectorAll(".mossguard-vector-art")].map((svg) => {
    const ids = new Set([...svg.querySelectorAll("[id]")].map((node) => node.id));
    const refs = [...svg.querySelectorAll("[fill]")].flatMap((node) => [...node.getAttribute("fill").matchAll(/url\(#([^)]+)\)/g)].map(([, id]) => id));
    return refs.every((id) => ids.has(id));
  });
  return {
    native,
    diagnosticCount: diagnosticCells.length,
    baselineMetrics: JSON.parse(document.documentElement.dataset.baselineMetrics),
    declaredMetrics: JSON.parse(document.documentElement.dataset.rigMetrics),
    gradientIdCount: gradientIds.length,
    uniqueGradientIdCount: new Set(gradientIds).size,
    localGradientRefs,
    rigMeasureLabel: document.querySelector("[data-rig-measure]").textContent,
  };
});
const safe = { x: 4, y: 6, right: 60, bottom: 58 };
for (const pose of measurements.native) {
  const box = pose.boundsViewBox;
  assertResults.push({
    id: pose.direction + "/" + pose.pose,
    bodyHeight13: Math.abs(pose.bodyHeightCssPx - 13) < 0.01,
    insideSafeBounds: box.x >= safe.x - 0.01 && box.y >= safe.y - 0.01 && box.x + box.width <= safe.right + 0.01 && box.y + box.height <= safe.bottom + 0.01,
    sharedSole: Math.abs(pose.soleAnchor.x - 32) < 0.01 && Math.abs(pose.soleAnchor.y - 58) < 0.01,
    strokeFreeMeasuredPaths: pose.strokedPaths === 0,
  });
}
const versionPage = await browser.newPage();
let chromeCommandLine = "unavailable";
try {
  await versionPage.goto("chrome://version/", { waitUntil: "domcontentloaded" });
  chromeCommandLine = await versionPage.locator("#command_line").innerText({ timeout: 5000 });
} catch (error) {
  pageErrors.push("chrome://version command line unavailable: " + String(error));
}
const gpuFlagsPresent = /--(?:disable-gpu|enable-gpu|use-angle|use-gl|gpu-launcher|disable-software-rasterizer)/i.test(chromeCommandLine);
const summary = {
  schemaVersion: 1,
  round: 2,
  browserVersion: browser.version(),
  executable: chromeExecutable,
  method: "Playwright launched the installed Google Chrome with headless:true; no args override. The main page used a 1440x1200 CSS viewport at deviceScaleFactor 1. Screenshots were fullPage.",
  viewport: { width: 1440, height: 1200 },
  deviceScaleFactor: 1,
  chromeCommandLine,
  gpuFlagsPresent,
  pageErrors,
  consoleErrors,
  captures,
  measurementMethod: "Actual DOM SVG body-group getBBox transformed through getCTM; every visible body path was included. Body paths have zero strokes. Ground shadow remains outside the measured body group.",
  measurements,
  safeBounds: safe,
  assertions: assertResults,
  checks: {
    nativePoseCount: measurements.native.length === 16,
    diagnosticPoseCount: measurements.diagnosticCount === 16,
    bodyHeights13: assertResults.every((item) => item.bodyHeight13),
    allInsideSafeBounds: assertResults.every((item) => item.insideSafeBounds),
    sharedSole: assertResults.every((item) => item.sharedSole),
    allMeasuredPathsStrokeFree: assertResults.every((item) => item.strokeFreeMeasuredPaths),
    gradientIdsUnique: measurements.gradientIdCount === 96 && measurements.uniqueGradientIdCount === 96,
    gradientRefsLocal: measurements.localGradientRefs.length === 32 && measurements.localGradientRefs.every(Boolean),
    noGpuFlags: !gpuFlagsPresent,
    noPageOrConsoleErrors: pageErrors.length === 0 && consoleErrors.length === 0,
  },
  browserExit: "browser.close() awaited",
};
await browser.close();
await fs.writeFile(path.join(evidenceDir, "native-render-evidence.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
if (Object.values(summary.checks).some((value) => value !== true)) process.exitCode = 1;
