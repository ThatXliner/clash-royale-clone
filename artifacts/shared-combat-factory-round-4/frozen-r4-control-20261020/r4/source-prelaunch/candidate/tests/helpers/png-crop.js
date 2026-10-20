import { writeFileSync } from "node:fs";

export async function cropPngOnBlankPage(page, sourcePng, rect, outputPath) {
  const croppedBytes = await page.evaluate(async ({ base64, rect }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > image.naturalWidth ||
        rect.y + rect.height > image.naturalHeight) {
      throw new RangeError("PNG crop must stay inside the source viewport");
    }
    const canvas = document.createElement("canvas");
    canvas.width = rect.width;
    canvas.height = rect.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height,
      0, 0, rect.width, rect.height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) :
        reject(new Error("PNG crop encoding failed")), "image/png");
    });
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, { base64: sourcePng.toString("base64"), rect });
  const croppedPng = Buffer.from(croppedBytes);
  writeFileSync(outputPath, croppedPng);
  return croppedPng;
}
