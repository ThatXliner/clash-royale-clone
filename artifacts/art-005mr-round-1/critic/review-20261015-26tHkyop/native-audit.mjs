import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { chromium } from "/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright/index.mjs";

const outDir = "/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/art-005mr-round-1/critic/review-20261015-26tHkyop";
const baseUrl = "http://127.0.0.1:57123/demo/mossguard-vector-rig.html";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error") pageErrors.push(`console: ${message.text()}`); });

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function capture(url, filename, fullPage = true) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${outDir}/${filename}`, fullPage });
  return filename;
}

await capture(`${baseUrl}?view=before`, "before-original-vector-1440px.png");
await capture(`${baseUrl}?view=after`, "after-vector-rig-1440px.png");
await page.locator("[data-diagnostic-grid]").screenshot({ path: `${outDir}/enlarged-diagnostic-grid.png` });
await capture(`${baseUrl}?view=compare`, "comparison-native-1440px.png");

const audit = await page.evaluate(() => {
  const union = (boxes) => {
    if (!boxes.length) return null;
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.x + b.width));
    const bottom = Math.max(...boxes.map((b) => b.y + b.height));
    return { x, y, width: right - x, height: bottom - y };
  };
  const withStroke = (element) => {
    const b = element.getBBox();
    const style = getComputedStyle(element);
    const width = style.stroke === "none" ? 0 : Number.parseFloat(style.strokeWidth) || 0;
    return { x: b.x - width / 2, y: b.y - width / 2, width: b.width + width, height: b.height + width, stroke: style.stroke, strokeWidth: width };
  };
  const baseline = [...document.querySelectorAll(".baseline-sample")].map((sample) => {
    const svg = sample.querySelector("svg");
    const pathBounds = [...svg.querySelectorAll("path,ellipse,circle,rect,line,polyline,polygon")]
      .filter((element) => !element.closest("defs"))
      .map(withStroke);
    const bodyBounds = union(pathBounds);
    const cssScale = svg.getBoundingClientRect().height / 64;
    return {
      facing: sample.querySelector("span")?.textContent ?? "unknown",
      svgCssSize: { width: svg.getBoundingClientRect().width, height: svg.getBoundingClientRect().height },
      viewBoxBodyBoundsIncludingStroke: bodyBounds,
      bodyHeightCssPx: bodyBounds.height * cssScale,
      strokedElements: pathBounds.filter((b) => b.stroke !== "none"),
    };
  });
  const safe = { x: 4, y: 6, width: 56, height: 52 };
  const native = [...document.querySelectorAll(".pose-cell svg")].map((svg) => {
    const group = svg.querySelector("[data-mossguard-body]");
    const body = group.getBBox();
    const bodyChildren = [...group.querySelectorAll("path,ellipse,circle,rect,line,polyline,polygon")]
      .filter((element) => !element.closest("defs"))
      .map(withStroke);
    const bodyStrokeBounds = union(bodyChildren);
    const scale = svg.getBoundingClientRect().height / 64;
    const safeContains = bodyStrokeBounds.x >= safe.x && bodyStrokeBounds.y >= safe.y &&
      bodyStrokeBounds.x + bodyStrokeBounds.width <= safe.x + safe.width &&
      bodyStrokeBounds.y + bodyStrokeBounds.height <= safe.y + safe.height;
    const shadow = [...svg.querySelectorAll("ellipse,circle,rect,path")]
      .filter((element) => !element.closest("defs") && !element.closest("[data-mossguard-body]"))
      .map(withStroke);
    const allVisible = union([...bodyChildren, ...shadow]);
    const transform = group.getAttribute("transform");
    return {
      direction: svg.dataset.direction,
      pose: svg.dataset.pose,
      team: svg.dataset.team,
      tick: Number(svg.dataset.tick),
      declaredBodyHeightUnits: Number(svg.dataset.bodyHeightUnits),
      declaredSoleAnchor: svg.dataset.soleAnchor,
      declaredSafeBounds: svg.dataset.safeBounds,
      svgCssSize: { width: svg.getBoundingClientRect().width, height: svg.getBoundingClientRect().height },
      rawBodyGroupBounds: { x: body.x, y: body.y, width: body.width, height: body.height },
      bodyBoundsIncludingAnyStroke: bodyStrokeBounds,
      bodyHeightCssPx: bodyStrokeBounds.height * scale,
      safeBoundsContainBodyAndStrokes: safeContains,
      allVisibleArtBoundsIncludingShadow: allVisible,
      shadowBoundsInViewBox: shadow.length ? union(shadow) : null,
      groupTransform: transform,
    };
  });
  const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  const bodyCanvasViolations = native.filter((entry) => {
    const b = entry.allVisibleArtBoundsIncludingShadow;
    return !b || b.x < 0 || b.y < 0 || b.x + b.width > 64 || b.y + b.height > 64;
  });
  return {
    url: location.href,
    userAgent: navigator.userAgent,
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    baseline,
    nativeRig: native,
    nativeBodyCssHeightRange: [Math.min(...native.map((entry) => entry.bodyHeightCssPx)), Math.max(...native.map((entry) => entry.bodyHeightCssPx))],
    nativeBodySafeBoundsPassCount: native.filter((entry) => entry.safeBoundsContainBodyAndStrokes).length,
    allVisibleArtCanvasPassCount: native.length - bodyCanvasViolations.length,
    bodyCanvasViolations,
    duplicateSvgIds: duplicateIds.map((id) => ({ id, count: ids.filter((value) => value === id).length })),
    renderedPoseCount: native.length,
  };
});

const processCmdlines = execFileSync("ps", ["-axo", "command"], { encoding: "utf8" })
  .split("\n")
  .filter((line) => line.includes("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"));
const screenshotFiles = [
  "before-original-vector-1440px.png",
  "after-vector-rig-1440px.png",
  "enlarged-diagnostic-grid.png",
  "comparison-native-1440px.png",
];
const hashes = {};
for (const filename of screenshotFiles) {
  const { readFile } = await import("node:fs/promises");
  hashes[filename] = sha256(await readFile(`${outDir}/${filename}`));
}
const output = {
  browser: { version: browser.version(), channel: "chrome", launchMode: "headless installed Google Chrome", executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", processCmdlines, gpuDisableFlags: processCmdlines.flatMap((line) => line.match(/--(?:disable-gpu|disable-accelerated[^ ]*|use-gl=[^ ]*)/g) ?? []) },
  screenshotFiles: hashes,
  pageErrors,
  geometry: audit,
};
await writeFile(`${outDir}/independent-geometry-audit.json`, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ browser: output.browser, screenshotFiles: hashes, pageErrors, geometrySummary: { viewport: audit.viewport, baselineHeightsCssPx: audit.baseline.map((b) => b.bodyHeightCssPx), nativeBodyCssHeightRange: audit.nativeBodyCssHeightRange, nativeBodySafeBoundsPassCount: audit.nativeBodySafeBoundsPassCount, allVisibleArtCanvasPassCount: audit.allVisibleArtCanvasPassCount, duplicateSvgIds: audit.duplicateSvgIds, renderedPoseCount: audit.renderedPoseCount } }, null, 2));
await browser.close();
