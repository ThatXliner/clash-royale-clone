import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL(".", import.meta.url));
const fixtureUrl = new URL("./render-native.html", import.meta.url);
const variant = process.argv[2] ?? "v1";
const source = process.argv[3] ?? "./v1-preview.webp";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 64, height: 64 },
  deviceScaleFactor: 1,
});
const renders = [];

try {
  for (const size of [13, 26]) {
    const url = new URL(fixtureUrl);
    url.searchParams.set("size", String(size));
    url.searchParams.set("src", source);
    await page.goto(url.href, { waitUntil: "load" });
    const image = await page.evaluate(async () => {
      const element = document.querySelector("#sprite");
      await element.decode();
      const rect = element.getBoundingClientRect();
      const stage = document.querySelector("#stage").getBoundingClientRect();
      return {
        complete: element.complete,
        naturalHeight: element.naturalHeight,
        naturalWidth: element.naturalWidth,
        renderedHeight: rect.height,
        renderedWidth: rect.width,
        stageHeight: stage.height,
        stageWidth: stage.width,
        devicePixelRatio: window.devicePixelRatio,
      };
    });
    if (
      !image.complete || image.naturalWidth !== 512 || image.naturalHeight !== 512 ||
      image.renderedWidth !== size || image.renderedHeight !== size ||
      image.stageWidth !== size || image.stageHeight !== size || image.devicePixelRatio !== 1
    ) {
      throw new Error(`Unexpected ${size}px render metrics: ${JSON.stringify(image)}`);
    }
    const screenshot = resolve(directory, `rivet-runners-battle-${variant}-${size}px.png`);
    await page.locator("#stage").screenshot({ path: screenshot, type: "png" });
    renders.push({
      size,
      screenshot: `artifacts/art-020b-round-1/builder/rivet-runners-battle-${variant}-${size}px.png`,
      ...image,
    });
  }
  await writeFile(
    resolve(directory, `native-chrome-render-${variant}.json`),
    `${JSON.stringify({ browser: "Google Chrome", version: browser.version(), renders }, null, 2)}\n`,
  );
} finally {
  await browser.close();
}
