import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(here, "../../..");
const source = resolve(workspace, "demo/assets/ember-basin-portrait-v2.png");
const shipped = resolve(workspace, "public/assets/ember-basin-portrait-painted-v2.webp");
const editTarget = resolve(workspace, "demo/assets/ember-basin-portrait.png");
const provenancePath = resolve(workspace, "docs/art/ember-basin-portrait-v2-provenance.json");
const sourceInfo = await stat(source);
const shippedInfo = await stat(shipped);
const provenance = JSON.parse(await readFile(provenancePath, "utf8"));
const provenanceAsset = provenance.assets?.[0];
const inputImage = provenance.input_images?.[0];
assert.equal(provenance.license, "AGPL-3.0-only");
assert.equal(provenance.generation_tool, "built-in imagegen");
assert.equal(provenance.generation_mode, "built-in image edit");
assert.equal(inputImage?.asset, "demo/assets/ember-basin-portrait.png");
assert.ok(shippedInfo.size <= 1024 * 1024, "shipped portrait must be at most 1 MiB");
const sourceBytes = await readFile(source);
const shippedBytes = await readFile(shipped);
const editTargetBytes = await readFile(editTarget);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
assert.equal(sourceInfo.size, provenanceAsset.source_bytes);
assert.equal(digest(sourceBytes), provenanceAsset.source_sha256);
assert.equal(shippedInfo.size, provenanceAsset.bytes);
assert.equal(digest(shippedBytes), provenanceAsset.sha256);
assert.equal(digest(editTargetBytes), inputImage.sha256, "the recorded edit target must remain intact");
assert.deepEqual(provenanceAsset.source_dimensions, { width: 1254, height: 1254 });
assert.deepEqual(provenanceAsset.dimensions, { width: 512, height: 512 });

const playwrightPath = process.env.GAME_BROWSER_PLAYWRIGHT;
const playwrightModule = playwrightPath
  ? await import(pathToFileURL(playwrightPath).href)
  : await import("playwright");
const chromePath = process.env.GAME_BROWSER_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const { chromium } = playwrightModule;
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 220 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(resolve(here, "portrait-thumbnails.html")).href);
  const geometry = await page.evaluate(() => Object.fromEntries(
    ["thumb-64", "thumb-128"].map((id) => {
      const image = document.getElementById(id);
      const rect = image.getBoundingClientRect();
      return [id, {
        loaded: image.complete && image.naturalWidth === 512 && image.naturalHeight === 512,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        width: rect.width,
        height: rect.height,
      }];
    }),
  ));
  assert.deepEqual(geometry["thumb-64"], {
    loaded: true, naturalWidth: 512, naturalHeight: 512, width: 64, height: 64,
  });
  assert.deepEqual(geometry["thumb-128"], {
    loaded: true, naturalWidth: 512, naturalHeight: 512, width: 128, height: 128,
  });
  const decodedAssets = await page.evaluate(async () => {
    const decode = (path) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("Browser failed to decode " + path));
      image.src = new URL(path, document.baseURI).href;
    });
    return {
      source: await decode("../../../demo/assets/ember-basin-portrait-v2.png"),
      shipped: await decode("../../../public/assets/ember-basin-portrait-painted-v2.webp"),
    };
  });
  assert.deepEqual(decodedAssets, {
    source: { width: 1254, height: 1254 },
    shipped: { width: 512, height: 512 },
  });
  await page.screenshot({ path: resolve(here, "portrait-thumbnails-fixture.png"), fullPage: true });
  await page.locator("#thumb-64").screenshot({ path: resolve(here, "portrait-64px.png") });
  await page.locator("#thumb-128").screenshot({ path: resolve(here, "portrait-128px.png") });
  const screenshotDimensions = {};
  for (const [name, expected] of Object.entries({
    "portrait-64px.png": { width: 64, height: 64 },
    "portrait-128px.png": { width: 128, height: 128 },
    "portrait-thumbnails-fixture.png": { width: 360, height: 220 },
  })) {
    const png = await readFile(resolve(here, name));
    assert.equal(png.toString("ascii", 1, 4), "PNG");
    const size = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
    assert.deepEqual(size, expected, name + " must capture the intended CSS pixel size");
    screenshotDimensions[name] = size;
  }
  console.log(JSON.stringify({
    input: { bytes: editTargetBytes.length, sha256: digest(editTargetBytes) },
    source: { bytes: sourceInfo.size, sha256: digest(sourceBytes) },
    shipped: { bytes: shippedInfo.size, sha256: digest(shippedBytes) },
    decodedAssets,
    geometry,
    screenshotDimensions,
  }, null, 2));
} finally {
  await browser.close();
}
