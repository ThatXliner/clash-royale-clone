const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { chromium } = require("/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright");

const artifactDir = __dirname;
const repoRoot = path.resolve(artifactDir, "../../..");
const publicSvg = path.join(repoRoot, "public/assets/buried-coil-revealed.svg");
const publicBytes = fs.readFileSync(publicSvg);
const pageHtml = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:transparent}#sprite{position:absolute;left:100px;top:100px;width:13px;height:13px;image-rendering:auto}</style><img id="sprite" src="/assets/buried-coil-revealed.svg" alt="">`;
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://127.0.0.1").pathname;
  if (pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(pageHtml);
    return;
  }
  if (pathname === "/assets/buried-coil-revealed.svg") {
    res.writeHead(200, { "content-type": "image/svg+xml; charset=utf-8" });
    res.end(publicBytes);
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const browser = await chromium.launch({ headless: true });
  const result = {
    candidateHead: require("node:child_process").execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim(),
    browser: await browser.version(),
    sourcePath: "public/assets/buried-coil-revealed.svg",
    sourceBytes: publicBytes.length,
    sourceSha256: sha256(publicBytes),
    captures: [],
  };

  for (const [label, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1440, height: 933 }]]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const consoleErrors = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "load" });
    await page.locator("#sprite").evaluate((img) => img.decode());

    const element = page.locator("#sprite");
    const dimensions = await element.evaluate((img) => {
      const rect = img.getBoundingClientRect();
      return {
        complete: img.complete,
        currentSrc: img.currentSrc,
        natural: [img.naturalWidth, img.naturalHeight],
        cssSize: [getComputedStyle(img).width, getComputedStyle(img).height],
        objectFit: getComputedStyle(img).objectFit,
        transform: getComputedStyle(img).transform,
        rect: [rect.x, rect.y, rect.width, rect.height],
        dpr: window.devicePixelRatio,
      };
    });
    const data = await element.evaluate((img) => {
      const canvas = document.createElement("canvas");
      canvas.width = 13;
      canvas.height = 13;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(img, 0, 0, 13, 13);
      return Array.from(context.getImageData(0, 0, 13, 13).data);
    });
    const rgba = [];
    for (let index = 0; index < data.length; index += 4) rgba.push(data.slice(index, index + 4));
    const maskRows = [];
    for (let y = 0; y < 13; y++) {
      let row = "";
      for (let x = 0; x < 13; x++) row += rgba[y * 13 + x][3] > 32 ? "#" : ".";
      maskRows.push(row);
    }
    const pngPath = path.join(artifactDir, `product-${label}-native-13px-dpr1.png`);
    await element.screenshot({ path: pngPath, omitBackground: true, animations: "disabled" });
    const pngBytes = fs.readFileSync(pngPath);
    result.captures.push({
      label,
      viewport: [viewport.width, viewport.height],
      ...dimensions,
      consoleErrors,
      pngPath: path.basename(pngPath),
      pngBytes: pngBytes.length,
      pngSha256: sha256(pngBytes),
      visiblePixelCount: rgba.filter((pixel) => pixel[3] > 32).length,
      visibleBounds: (() => {
        const visible = [];
        for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) if (rgba[y * 13 + x][3] > 32) visible.push([x, y]);
        return [Math.min(...visible.map(([x]) => x)), Math.min(...visible.map(([, y]) => y)), Math.max(...visible.map(([x]) => x)) + 1, Math.max(...visible.map(([, y]) => y)) + 1];
      })(),
      maskRows,
      rgbaPixels: rgba,
    });
    await page.close();
  }

  await browser.close();
  server.close();
  result.actualNativeCheck = "Public SVG bytes served from the candidate repository path; direct 13 CSS px image, DPR 1, no transform, aligned at [100,100]; element crop taken by Chromium.";
  fs.writeFileSync(path.join(artifactDir, "product-native-measurements.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  for (const capture of result.captures) {
    assert.equal(capture.complete, true);
    assert.deepEqual(capture.natural, [13, 13]);
    assert.deepEqual(capture.rect, [100, 100, 13, 13]);
    assert.equal(capture.dpr, 1);
    assert.equal(capture.visiblePixelCount, 77);
    assert.deepEqual(capture.visibleBounds, [1, 0, 12, 13]);
    assert.deepEqual(capture.consoleErrors, []);
  }
  assert.equal(result.captures[0].pngSha256, result.captures[1].pngSha256);
})().catch((error) => {
  server.close();
  console.error(error);
  process.exit(1);
});
