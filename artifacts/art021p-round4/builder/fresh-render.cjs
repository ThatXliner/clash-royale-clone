const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "../../..");
const imageFiles = {
  "buried-coil-hidden": "public/assets/buried-coil-hidden.webp",
  "buried-coil-revealed": "public/assets/buried-coil-revealed.svg",
  "buried-coil-portrait": "public/assets/buried-coil-portrait.webp",
};
const bytesByAsset = Object.fromEntries(Object.entries(imageFiles).map(([key, relative]) =>
  [key, fs.readFileSync(path.join(ROOT, relative))]));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const contentType = (key) => key.endsWith(".svg") ? "image/svg+xml"
  : key.endsWith(".webp") ? "image/webp" : "application/octet-stream";
const imageMarkup = (key, size, label, extraClass) =>
  '<figure class="specimen"><figcaption>' + label + '</figcaption><img data-key="' +
  key + '-' + size + '" data-asset="' + key + '" data-css-size="' + size +
  '" class="asset-image ' + (extraClass || "") + '" src="/assets/' + path.basename(imageFiles[key]) +
  '" alt="" style="width:' + size + 'px;height:' + size + 'px"></figure>';
function buildHtml(theme) {
  const bodyClass = theme === "dark" ? "theme-dark" : "theme-light";
  const content = [
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>ART-021P native asset-stage evidence</title>',
    '<style>',
    '*{box-sizing:border-box}html,body{margin:0;min-width:100%;min-height:100%;font-family:Arial,sans-serif}',
    'body.theme-light{background:#f2eddf;color:#27251f}body.theme-dark{background:#171a21;color:#f1eee7}',
    '.page{padding:12px 14px;max-width:680px;margin:0 auto}',
    'h1{font-size:16px;line-height:20px;margin:0 0 8px;font-weight:700}',
    '.context{font-size:10px;line-height:13px;margin:0 0 9px;opacity:.8}',
    '.catalog{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
    '.panel{min-width:0;border:1px solid currentColor;border-radius:7px;padding:7px 8px 8px}',
    '.panel h2{font-size:11px;line-height:14px;margin:0 0 7px;font-weight:700}',
    '.specimen-row{display:flex;align-items:flex-start;gap:18px}',
    '.specimen{display:flex;flex-direction:column;align-items:flex-start;gap:4px;margin:0}',
    '.specimen-row .specimen{flex:0 0 40px;width:40px}',
    'figcaption{font-size:9px;line-height:11px;white-space:nowrap}',
    '.asset-image{display:block;object-fit:fill;image-rendering:auto;transform:none;filter:none}',
    '.wide{grid-column:1/-1}',
    '.team-row{display:flex;align-items:flex-start;gap:20px}.team-row .specimen{flex:0 0 50px;width:50px}',
    '.team-stage{position:relative;display:block;overflow:visible}',
    '.team-plate{position:absolute;left:1px;bottom:0;width:11px;height:4px;border:1px solid #f4ebd6;border-radius:50%;background:var(--team-color);box-shadow:0 1px 1px #191d22}',
    '.team-stage img{position:absolute;left:0;top:0}',
    '.team-stage[data-size="26"]{width:26px;height:30px}',
    '.team-stage[data-size="26"] .team-plate{left:2px;width:22px;height:8px;border-width:2px}',
    '.team-stage[data-size="26"] img{width:26px;height:26px}',
    '.team-stage[data-size="13"]{width:13px;height:15px}',
    '.team-stage[data-side="north"]{--team-color:#c6452e}.team-stage[data-side="south"]{--team-color:#2e7f86}',
    '.portrait-row{display:flex;align-items:flex-start;gap:18px}',
    '.portrait-row img{display:block;object-fit:fill;image-rendering:auto}',
    '</style>',
    '<body class="' + bodyClass + '"><main class="page">',
    '<h1>Buried Coil • asset-stage native rendering</h1>',
    '<p class="context">Public asset paths · DPR 1 · CSS sizes recorded per sample · transparent art over ' + theme + ' page</p>',
    '<div class="catalog">',
    '<section class="panel"><h2>13 CSS px battle forms</h2><div class="specimen-row">',
    imageMarkup("buried-coil-hidden", 13, "Hidden"),
    imageMarkup("buried-coil-revealed", 13, "Revealed"),
    '</div></section>',
    '<section class="panel"><h2>26 CSS px battle forms</h2><div class="specimen-row">',
    imageMarkup("buried-coil-hidden", 26, "Hidden"),
    imageMarkup("buried-coil-revealed", 26, "Revealed"),
    '</div></section>',
    '<section class="panel wide"><h2>Separate team plate layer beneath the 13 CSS px revealed sprite</h2><div class="team-row">',
    '<figure class="specimen"><figcaption>North plate</figcaption><div class="team-stage" data-size="13" data-side="north"><span class="team-plate"></span><img data-key="plate-north-13" data-asset="buried-coil-revealed" data-css-size="13" class="asset-image" src="/assets/buried-coil-revealed.svg" alt="" style="width:13px;height:13px"></div></figure>',
    '<figure class="specimen"><figcaption>South plate</figcaption><div class="team-stage" data-size="13" data-side="south"><span class="team-plate"></span><img data-key="plate-south-13" data-asset="buried-coil-revealed" data-css-size="13" class="asset-image" src="/assets/buried-coil-revealed.svg" alt="" style="width:13px;height:13px"></div></figure>',
    '<figure class="specimen"><figcaption>North 26 px</figcaption><div class="team-stage" data-size="26" data-side="north"><span class="team-plate"></span><img data-key="plate-north-26" data-asset="buried-coil-revealed" data-css-size="26" class="asset-image" src="/assets/buried-coil-revealed.svg" alt="" style="width:26px;height:26px"></div></figure>',
    '<figure class="specimen"><figcaption>South 26 px</figcaption><div class="team-stage" data-size="26" data-side="south"><span class="team-plate"></span><img data-key="plate-south-26" data-asset="buried-coil-revealed" data-css-size="26" class="asset-image" src="/assets/buried-coil-revealed.svg" alt="" style="width:26px;height:26px"></div></figure>',
    '</div></section>',
    '<section class="panel wide"><h2>Card portrait at requested review sizes</h2><div class="portrait-row">',
    imageMarkup("buried-coil-portrait", 64, "64 × 64"),
    imageMarkup("buried-coil-portrait", 78, "78 × 78"),
    '</div></section>',
    '</div></main></body></html>',
  ];
  return content.join("");
}
const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/") {
    const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(buildHtml(theme));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    const key = url.pathname.slice("/assets/".length).replace(/\.(?:svg|webp)$/, "");
    if (Object.hasOwn(bytesByAsset, key)) {
      const filename = imageFiles[key];
      response.writeHead(200, {
        "content-type": contentType(filename),
        "content-length": bytesByAsset[key].length,
        "cache-control": "no-store",
      });
      response.end(bytesByAsset[key]);
      return;
    }
  }
  response.writeHead(404);
  response.end("Not found");
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const browser = await chromium.launch({ headless: true });
  const result = {
    candidateHead: require("node:child_process").execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
    browser: await browser.version(),
    sourceAssets: Object.fromEntries(Object.entries(imageFiles).map(([key, relative]) =>
      [key, { path: relative, bytes: bytesByAsset[key].length, sha256: sha256(bytesByAsset[key]) }])),
    renderMethod: "Fresh Chromium page served only the candidate public asset paths; actual <img> elements at their CSS dimensions; DPR 1; image-rendering:auto; transform:none; no filters or nearest-neighbor processing.",
    integrationScope: "Asset-stage fixture only. Does not claim live arena or card-template integration.",
    captures: [],
  };
  const viewports = [
    ["phone", { width: 390, height: 844 }],
    ["desktop", { width: 1440, height: 933 }],
  ];
  for (const [viewportName, viewport] of viewports) {
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
      page.on("pageerror", (error) => consoleErrors.push(error.message));
      const url = "http://127.0.0.1:" + address.port + "/?theme=" + theme;
      await page.goto(url, { waitUntil: "load" });
      await page.evaluate(() => Promise.all(Array.from(document.images, (image) => image.decode())));
      const measurements = await page.evaluate(() => {
        const images = Array.from(document.querySelectorAll("img[data-key]"));
        return images.map((image) => {
          const rect = image.getBoundingClientRect();
          const canvas = document.createElement("canvas");
          const width = Math.round(rect.width);
          const height = Math.round(rect.height);
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context.drawImage(image, 0, 0, width, height);
          const rgba = Array.from(context.getImageData(0, 0, width, height).data);
          const alphaRows = [];
          for (let y = 0; y < height; y += 1) {
            let row = "";
            for (let x = 0; x < width; x += 1) row += rgba[(y * width + x) * 4 + 3] > 32 ? "#" : ".";
            alphaRows.push(row);
          }
          const visible = [];
          for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
            if (rgba[(y * width + x) * 4 + 3] > 32) visible.push([x, y]);
          }
          return {
            key: image.dataset.key,
            asset: image.dataset.asset,
            currentSrc: image.currentSrc,
            complete: image.complete,
            natural: [image.naturalWidth, image.naturalHeight],
            cssSize: [getComputedStyle(image).width, getComputedStyle(image).height],
            rect: [rect.x, rect.y, rect.width, rect.height],
            dpr: window.devicePixelRatio,
            imageRendering: getComputedStyle(image).imageRendering,
            transform: getComputedStyle(image).transform,
            objectFit: getComputedStyle(image).objectFit,
            decodedPixels: {
              width,
              height,
              rgbaBase64: btoa(String.fromCharCode(...rgba)),
              sha256: "",
              visiblePixelCountAlphaGt32: visible.length,
              visibleBounds: visible.length ? [
                Math.min(...visible.map(([x]) => x)),
                Math.min(...visible.map(([, y]) => y)),
                Math.max(...visible.map(([x]) => x)) + 1,
                Math.max(...visible.map(([, y]) => y)) + 1,
              ] : null,
              alphaMaskRows: alphaRows,
            },
          };
        });
      });
      for (const item of measurements) {
        const raw = Buffer.from(item.decodedPixels.rgbaBase64, "base64");
        item.decodedPixels.sha256 = sha256(raw);
        const pngName = viewportName + "-" + theme + "-" + item.key + ".png";
        await page.locator('img[data-key="' + item.key + '"]').screenshot({
          path: path.join(HERE, pngName),
          animations: "disabled",
        });
        item.screenshot = {
          path: pngName,
          sha256: sha256(fs.readFileSync(path.join(HERE, pngName))),
          note: "Element crop at its rendered CSS size; browser page background is included.",
        };
        assert.equal(item.complete, true, item.key + " loaded");
        assert.equal(item.dpr, 1, item.key + " DPR");
        assert.equal(item.rect[2], Number(item.cssSize[0].replace("px", "")), item.key + " width");
        assert.equal(item.rect[3], Number(item.cssSize[1].replace("px", "")), item.key + " height");
        assert.equal(item.imageRendering, "auto", item.key + " image-rendering");
        assert.equal(item.transform, "none", item.key + " transform");
        assert.ok(item.currentSrc.startsWith("http://127.0.0.1:"), item.key + " local candidate asset URL");
      }
      const plateStages = [];
      for (const size of [13, 26]) {
        for (const side of ["north", "south"]) {
          const selector = '.team-stage[data-size="' + size + '"][data-side="' + side + '"]';
          const locator = page.locator(selector);
          const rect = await locator.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const plate = element.querySelector(".team-plate").getBoundingClientRect();
            const image = element.querySelector("img").getBoundingClientRect();
            return {
              stage: [bounds.x, bounds.y, bounds.width, bounds.height],
              plate: [plate.x, plate.y, plate.width, plate.height],
              image: [image.x, image.y, image.width, image.height],
              plateColor: getComputedStyle(element.querySelector(".team-plate")).backgroundColor,
            };
          });
          const stageName = viewportName + "-" + theme + "-teamplate-" + side + "-" + size + ".png";
          await locator.screenshot({ path: path.join(HERE, stageName), animations: "disabled" });
          plateStages.push({
            key: side + "-" + size,
            ...rect,
            screenshot: {
              path: stageName,
              sha256: sha256(fs.readFileSync(path.join(HERE, stageName))),
            },
          });
        }
      }
      const pageDimensions = await page.evaluate(() => ({
        viewport: [window.innerWidth, window.innerHeight],
        outer: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
        body: [document.body.scrollWidth, document.body.scrollHeight],
      }));
      const pageName = viewportName + "-" + theme + "-viewport.png";
      await page.screenshot({ path: path.join(HERE, pageName), fullPage: false, animations: "disabled" });
      const screenshotHash = sha256(fs.readFileSync(path.join(HERE, pageName)));
      const scenario = {
        viewportName,
        viewport: [viewport.width, viewport.height],
        theme,
        dpr: 1,
        url,
        pageDimensions,
        consoleErrors,
        viewportScreenshot: { path: pageName, sha256: screenshotHash },
        teamPlateStages: plateStages,
        images: measurements,
      };
      result.captures.push(scenario);
      await context.close();
    }
  }
  await browser.close();
  server.close();
  const reveal13 = result.captures[0].images.find((image) => image.key === "buried-coil-revealed-13").decodedPixels.rgbaBase64;
  const hidden13 = result.captures[0].images.find((image) => image.key === "buried-coil-hidden-13").decodedPixels.rgbaBase64;
  const reveal13Raw = Buffer.from(reveal13, "base64");
  const hidden13Raw = Buffer.from(hidden13, "base64");
  let hiddenRevealedDifferentPixels = 0;
  for (let i = 0; i < Math.min(reveal13Raw.length, hidden13Raw.length); i += 4) {
    if (reveal13Raw.subarray(i, i + 4).compare(hidden13Raw.subarray(i, i + 4)) !== 0) hiddenRevealedDifferentPixels += 1;
  }
  result.hiddenVsRevealedNative13 = {
    decodedPixelDifferences: hiddenRevealedDifferentPixels,
    totalPixels: 13 * 13,
    revealedMaskRows: result.captures[0].images.find((image) => image.key === "buried-coil-revealed-13").decodedPixels.alphaMaskRows,
    hiddenMaskRows: result.captures[0].images.find((image) => image.key === "buried-coil-hidden-13").decodedPixels.alphaMaskRows,
  };
  result.visibleTeamPlateEvidence = {
    previewLayer: "Independent team-color plate nodes behind the candidate revealed image in the asset-stage fixture.",
    screenshotFiles: result.captures.flatMap((capture) => capture.teamPlateStages.map((stage) => stage.screenshot.path)),
    note: "This is an asset-stage layering sample only; runtime team identity integration is outside ART-021P.",
  };
  fs.writeFileSync(path.join(HERE, "fresh-browser-native-renders.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({
    candidateHead: result.candidateHead,
    browser: result.browser,
    renderMethod: result.renderMethod,
    integrationScope: result.integrationScope,
    captures: result.captures.map((capture) => ({
      viewportName: capture.viewportName,
      viewport: capture.viewport,
      theme: capture.theme,
      dpr: capture.dpr,
      pageDimensions: capture.pageDimensions,
      consoleErrors: capture.consoleErrors,
      viewportScreenshot: capture.viewportScreenshot,
      images: capture.images.map((image) => ({
        key: image.key,
        currentSrc: image.currentSrc,
        natural: image.natural,
        cssSize: image.cssSize,
        rect: image.rect.map((value) => Math.round(value * 100) / 100),
        imageRendering: image.imageRendering,
        transform: image.transform,
        visiblePixelCountAlphaGt32: image.decodedPixels.visiblePixelCountAlphaGt32,
        visibleBounds: image.decodedPixels.visibleBounds,
        alphaMaskRows: image.decodedPixels.width <= 26 ? image.decodedPixels.alphaMaskRows : undefined,
        decodedPixelsSha256: image.decodedPixels.sha256,
        screenshot: image.screenshot,
      })),
    })),
    hiddenVsRevealedNative13: result.hiddenVsRevealedNative13,
    visibleTeamPlateEvidence: result.visibleTeamPlateEvidence,
  }, null, 2));
  assert.equal(result.captures.length, 4);
  for (const capture of result.captures) {
    assert.deepEqual(capture.pageDimensions.viewport, capture.viewport);
    assert.equal(capture.dpr, 1);
    assert.deepEqual(capture.consoleErrors, []);
    const byKey = new Map(capture.images.map((image) => [image.key, image]));
    assert.deepEqual(byKey.get("buried-coil-revealed-13").natural, [13, 13]);
    assert.deepEqual(byKey.get("buried-coil-revealed-13").rect.slice(2), [13, 13]);
    assert.deepEqual(byKey.get("buried-coil-revealed-26").rect.slice(2), [26, 26]);
    assert.deepEqual(byKey.get("buried-coil-hidden-13").rect.slice(2), [13, 13]);
    assert.deepEqual(byKey.get("buried-coil-hidden-26").rect.slice(2), [26, 26]);
    assert.deepEqual(byKey.get("buried-coil-portrait-64").rect.slice(2), [64, 64]);
    assert.deepEqual(byKey.get("buried-coil-portrait-78").rect.slice(2), [78, 78]);
  }
  assert.ok(hiddenRevealedDifferentPixels > 40, "hidden and revealed forms differ at native 13px");
})().catch((error) => {
  server.close();
  console.error(error);
  process.exit(1);
});

