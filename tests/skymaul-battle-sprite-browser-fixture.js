import {
  createSkymaulBattleArt,
  getSkymaulBattleFrame,
} from "../src/ui/skymaul-battle-sprite.js";

const DIRECTIONS = ["east", "north", "south", "west"];
const ACTIONS = ["idle", "walk", "contact"];
const samples = document.querySelector("#samples");
const bodyCssPixels = window.innerWidth < 600 ? 13 : 26;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
document.documentElement.dataset.combatBodyCssPixels = String(bodyCssPixels);
document.documentElement.dataset.combatFrameScale = "1";

const frames = [];
for (const side of ["north", "south"]) {
  for (const action of ACTIONS) {
    for (const direction of DIRECTIONS) {
      const frame = getSkymaulBattleFrame({
        action, direction, reducedMotion, side, tick: 90,
      });
      const figure = document.createElement("figure");
      figure.dataset.sample = `${side}-${direction}-${action}`;
      figure.style.width = `${64 * bodyCssPixels / 13}px`;
      figure.style.height = `${64 * bodyCssPixels / 13}px`;
      const art = createSkymaulBattleArt(document, {
        action, bodyCssPixels, direction, frameScale: 1,
        reducedMotion, side, tick: 90,
      });
      figure.appendChild(art);
      const caption = document.createElement("figcaption");
      caption.textContent = `${side} · ${direction} · ${action}`;
      figure.appendChild(caption);
      samples.appendChild(figure);
      frames.push({
        action: frame.action,
        column: frame.column,
        direction: frame.direction,
        id: frame.id,
        row: frame.row,
        side: frame.side,
        source: frame.source,
        team: frame.team,
        viewBox: frame.viewBox,
      });
    }
  }
}

function sha256(bytes) {
  return crypto.subtle.digest("SHA-256", bytes).then((digest) =>
    [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""));
}

function bounds(width, height, pixels, x0, y0, threshold = 16) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] <= threshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return { left: left + x0, top: top + y0, right: right + x0, bottom: bottom + y0 };
}

async function inspectAtlas() {
  const assetUrl = new URL("../public/assets/skymaul-battle-sprite.png", import.meta.url);
  const response = await fetch(assetUrl);
  if (!response.ok) throw new Error(`Skymaul atlas fetch returned ${response.status}`);
  const bytes = await response.arrayBuffer();
  const image = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const cellReports = [];
  for (const frame of frames) {
    const { x, y, width, height } = frame.source;
    const rgba = new Uint8Array(width * height * 4);
    for (let row = 0; row < height; row += 1) {
      const sourceStart = ((y + row) * image.width + x) * 4;
      rgba.set(pixels.subarray(sourceStart, sourceStart + width * 4), row * width * 4);
    }
    const localPixels = new Uint8ClampedArray(rgba.buffer);
    let transparentPixels = 0;
    for (let index = 3; index < rgba.length; index += 4) {
      if (rgba[index] === 0) transparentPixels += 1;
    }
    cellReports.push({
      ...frame,
      rgbaSha256: await sha256(rgba),
      transparentPixels,
      alphaPaintBounds16: bounds(width, height, localPixels, 0, 0),
    });
  }
  image.close();
  return {
    assetBytes: bytes.byteLength,
    assetSha256: await sha256(bytes),
    bodyCssPixels,
    decodedHeight: canvas.height,
    decodedWidth: canvas.width,
    frames: cellReports,
    reducedMotion,
  };
}

try {
  const report = await inspectAtlas();
  window.__skymaulSpriteFixture = report;
  document.documentElement.dataset.bodyCssPixels = String(bodyCssPixels);
  document.documentElement.dataset.assetReady = "true";
} catch (error) {
  document.documentElement.dataset.assetError = String(error);
  document.documentElement.dataset.assetReady = "false";
}
