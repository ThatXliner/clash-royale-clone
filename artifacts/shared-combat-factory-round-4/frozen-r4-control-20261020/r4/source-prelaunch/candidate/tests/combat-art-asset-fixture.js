import { createBriarRunnerPaintedArt } from "../src/ui/combat-art.js";

const art = createBriarRunnerPaintedArt(document, {
  action: "walk",
  direction: "south",
  side: "south",
  tick: 0,
});
art.setAttribute("width", "220");
art.setAttribute("height", "220");
const atlas = art.querySelector("image");
const svgImageLoaded = new Promise((resolve, reject) => {
  atlas.addEventListener("load", () => resolve(), { once: true });
  atlas.addEventListener("error", () => reject(new Error("painted atlas SVG image failed to load")), {
    once: true,
  });
});
document.querySelector("#combat-art").append(art);

const decodedImage = new Image();
decodedImage.src = atlas.href.baseVal;
await Promise.all([svgImageLoaded, decodedImage.decode()]);

document.documentElement.dataset.assetReady = "true";
globalThis.__combatArtAssetFixture = Object.freeze({
  decodedHeight: decodedImage.naturalHeight,
  decodedWidth: decodedImage.naturalWidth,
  renderedSource: atlas.href.baseVal,
});
