import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL(".", import.meta.url));
const htmlUrl = new URL("./render-portrait.html", import.meta.url);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 256, height: 256 },
  deviceScaleFactor: 1,
});
const renders = [];

try {
  for (const size of [64, 128]) {
    const url = new URL(htmlUrl);
    url.searchParams.set("size", String(size));
    await page.goto(url.href, { waitUntil: "load" });
    const image = await page.evaluate(async () => {
      const element = document.querySelector("#portrait");
      await element.decode();
      const rect = element.getBoundingClientRect();
      return {
        complete: element.complete,
        naturalHeight: element.naturalHeight,
        naturalWidth: element.naturalWidth,
        renderedHeight: rect.height,
        renderedWidth: rect.width,
        devicePixelRatio: window.devicePixelRatio,
      };
    });
    if (
      !image.complete || image.naturalWidth !== 512 || image.naturalHeight !== 512 ||
      image.renderedWidth !== size || image.renderedHeight !== size ||
      image.devicePixelRatio !== 1
    ) {
      throw new Error(`Unexpected ${size}px render metrics: ${JSON.stringify(image)}`);
    }
    const screenshot = resolve(directory, `rivet-runners-${size}px.png`);
    await page.locator("#portrait").screenshot({ path: screenshot, type: "png" });
    renders.push({ size, screenshot: `artifacts/art-020p-round-1/builder/rivet-runners-${size}px.png`, ...image });
  }
  await writeFile(
    resolve(directory, "native-chrome-render.json"),
    `${JSON.stringify({ browser: "Google Chrome", version: browser.version(), renders }, null, 2)}\n`,
  );
} finally {
  await browser.close();
}
