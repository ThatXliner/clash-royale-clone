import { createAetherWellBattleArt } from "../src/ui/aether-well-art.js";

const SHELL_WIDTH = 720;
const SHELL_HEIGHT = 1280;
const params = new URL(window.location.href).searchParams;
const bodyTargetCssPixels = Number(params.get("body") ?? 13);
const tone = params.get("tone") ?? "light";

if (bodyTargetCssPixels !== 13 && bodyTargetCssPixels !== 26) {
  throw new RangeError("body must be 13 or 26 CSS pixels");
}
if (tone !== "light" && tone !== "dark") {
  throw new RangeError("tone must be light or dark");
}

const shell = document.querySelector(".battle-shell");
const arena = document.querySelector("[data-art-host]");
arena.dataset.tone = tone;
arena.dataset.targetBodyCssPixels = String(bodyTargetCssPixels);
arena.dataset.shellWidth = String(SHELL_WIDTH);
arena.dataset.shellHeight = String(SHELL_HEIGHT);

function render() {
  const scale = Math.min(window.innerWidth / SHELL_WIDTH, window.innerHeight / SHELL_HEIGHT);
  shell.style.left = `${(window.innerWidth - SHELL_WIDTH * scale) / 2}px`;
  shell.style.top = `${(window.innerHeight - SHELL_HEIGHT * scale) / 2}px`;
  shell.style.transform = `scale(${scale})`;
  arena.replaceChildren();

  for (const [side, x, y] of [
    ["north", 270, 300],
    ["south", 270, 660],
  ]) {
    const placement = document.createElement("div");
    placement.className = "arena-unit";
    placement.dataset.team = side;
    placement.dataset.targetBodyCssPixels = String(bodyTargetCssPixels);
    placement.dataset.shellScale = String(scale);
    placement.style.left = `${x}px`;
    placement.style.top = `${y}px`;

    // The app scales its fixed 720 × 1280 shell as a unit. Counter-scale the
    // source size so the visible well body remains 13 or 26 CSS pixels tall.
    const art = createAetherWellBattleArt(document, {
      bodyCssPixels: bodyTargetCssPixels / scale,
      side,
    });
    art.dataset.targetBodyCssPixels = String(bodyTargetCssPixels);
    placement.appendChild(art);
    arena.appendChild(placement);
  }

  document.documentElement.dataset.fixtureReady = "true";
}

render();
window.addEventListener("resize", render, { passive: true });
