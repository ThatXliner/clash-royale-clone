import { createBrackenwheelScaleArt } from "../src/ui/brackenwheel-art.js";

const params = new URL(window.location.href).searchParams;
const bodyCssPixels = Number(params.get("body") ?? 13);
const tone = params.get("tone") ?? "light";
if (tone !== "light" && tone !== "dark") {
  throw new RangeError("tone must be light or dark");
}

const arena = document.querySelector("[data-art-host]");
arena.dataset.tone = tone;
arena.dataset.bodyCssPixels = String(bodyCssPixels);
const art = createBrackenwheelScaleArt(document, { bodyCssPixels });
arena.replaceChildren(art);
if (art.tagName === "IMG") await art.decode();
document.documentElement.dataset.fixtureReady = "true";
