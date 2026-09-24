import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { inflateSync } from "node:zlib";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import test from "node:test";

import { getArenaShellMarkup } from "../src/ui/arena-shell.js";
import {
  bindHudViewModel,
  createHudViewModel,
  getHudMarkup,
} from "../src/ui/hud-state.js";
import {
  createPlayableRoster,
  PLAYABLE_CARD_IDS,
} from "../src/content/playable-roster.js";

const ROOT = new URL("..", import.meta.url).pathname;
const HTML_PATH = `${ROOT}public/ui-arena-shell.html`;
const ARTIFACTS = new URL("../artifacts/visual-003d-round-4/", import.meta.url)
  .pathname;

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Keep the capture surface on one explicit raster path. These flags are
// bounded to color management, device scale, GPU backend, and text hinting;
// they do not change the page, hide interface pixels, or relax comparisons.
const CAPTURE_FLAGS = Object.freeze([
  "--force-color-profile=srgb",
  "--force-device-scale-factor=1",
  "--disable-gpu",
  "--use-angle=swiftshader",
  "--font-render-hinting=none",
  "--disable-lcd-text",
]);

const SCREENSHOTS = Object.freeze([
  "initial.png",
  "card-selected.png",
  "insufficient-elixir.png",
  "winner-overlay.png",
  "restart.png",
]);

const CONTACT_SHEET_CSS = `
  .card-contact-sheet {
    position: absolute;
    z-index: 1000;
    left: 10px;
    top: 10px;
    width: 392px;
    height: 194px;
    display: grid;
    grid-template-columns: repeat(4, 88px);
    grid-template-rows: 72px 72px;
    gap: 8px;
    padding: 30px 12px 12px;
    border: 2px solid #191d22;
    border-radius: 10px;
    background: #f4ebd6;
    box-shadow: 0 5px 0 #191d2266;
  }
  .card-contact-sheet__title {
    position: absolute;
    left: 12px;
    top: 7px;
    color: #191d22;
    font: 700 12px/1 Georgia, "Times New Roman", serif;
    letter-spacing: .2px;
  }
  .card-contact-sheet .hud-card {
    width: 88px;
    height: 72px;
  }
`;

const MOVING_WORLD_MASK_INVENTORY = Object.freeze([
  Object.freeze({
    selector: ".game-browser-layer--combat .combat-marker--entity-ground",
    region: "ground combat marker",
    reason: "moving entity position is outside the card and HUD dimension",
  }),
  Object.freeze({
    selector: ".game-browser-layer--combat .combat-marker--entity-air",
    region: "air combat marker",
    reason: "moving entity position is outside the card and HUD dimension",
  }),
  Object.freeze({
    selector: ".game-browser-layer--combat .combat-target-link",
    region: "combat target link",
    reason: "moving target-link geometry is outside the card and HUD dimension",
  }),
  Object.freeze({
    selector: ".game-browser-layer--effects .combat-effect-projectile",
    region: "projectile effect marker",
    reason: "moving projectile state is outside the card and HUD dimension",
  }),
  Object.freeze({
    selector: ".game-browser-layer--effects .combat-effect-impact",
    region: "impact effect marker",
    reason: "moving impact state is outside the card and HUD dimension",
  }),
  Object.freeze({
    selector: ".game-browser-layer--effects .combat-effect-area",
    region: "area effect marker",
    reason: "moving area-effect state is outside the card and HUD dimension",
  }),
  Object.freeze({
    selector: ".game-browser-layer--effects .combat-effect-path",
    region: "effect path marker",
    reason: "moving effect-path state is outside the card and HUD dimension",
  }),
]);

// No coordinate or broad-region masks are allowed. Keeping this list explicit
// makes an accidental arena, bridge, card, or HUD crop fail before capture.
const MOVING_WORLD_MASK_REGIONS = Object.freeze([]);

const PROTECTED_MASK_TARGETS = Object.freeze([
  Object.freeze({ label: ".bridge", pattern: /\.bridge|data-ui=["']bridge/i }),
  Object.freeze({ label: ".bridge::before", pattern: /\.bridge::before/i }),
  Object.freeze({ label: ".bridge::after", pattern: /\.bridge::after/i }),
  Object.freeze({ label: "bridge corners", pattern: /bridge[ _-]*(?:corner|ornament)/i }),
  Object.freeze({ label: "arena art", pattern: /(?:^|[\s,.])\.(?:arena|river|lane|tower-pad)(?:$|[\s:#.[,])|data-ui=["'](?:arena|river|lane|bridge|tower-pad)/i }),
  Object.freeze({ label: "HUD", pattern: /(?:^|[\s,.])\.(?:match-rail|hand-tray|hud|hud-card|crown-track)(?:$|[\s:#.[,])|data-ui=["'](?:hud|hand-tray|next-card|elixir-rail)/i }),
  Object.freeze({ label: "cards", pattern: /(?:^|[\s,.])(?:\.hud-card|\.card-slot|\.next-card|\[data-ui=["'](?:card-slot|next-card))/i }),
  Object.freeze({ label: "controls", pattern: /(?:^|[\s,.])\.(?:audio-toggle|restart-control)(?:$|[\s:#.[,])|data-ui=["'](?:audio-toggle|restart)/i }),
  Object.freeze({ label: "timer", pattern: /(?:^|[\s,.])\.(?:timer|hud-timer)(?:$|[\s:#.[,])|data-ui=["']hud-timer/i }),
  Object.freeze({ label: "crowns", pattern: /(?:^|[\s,.])\.crown(?:s|\b)|data-ui=["']hud-crowns/i }),
  Object.freeze({ label: "health", pattern: /(?:^|[\s,.])\.(?:combat-health|health-bar)(?:$|[\s:#.[,])|data-ui=["'](?:health|tower-health)/i }),
  Object.freeze({ label: "elixir", pattern: /(?:^|[\s,.])\.(?:elixir|elixir-rail|elixir-fill)(?:$|[\s:#.[,])|data-ui=["']hud-elixir/i }),
  Object.freeze({ label: "winner", pattern: /(?:^|[\s,.])\.match-feedback(?:$|[\s:#.[,])/i }),
  Object.freeze({ label: "restart", pattern: /(?:^|[\s,.])\.restart-control(?:$|[\s:#.[,])/i }),
]);

function assertMaskInventory(inventory, regions) {
  assert.ok(Array.isArray(inventory), "mask selector inventory must be an array");
  assert.ok(Array.isArray(regions), "mask region inventory must be an array");
  const selectors = inventory.map((entry, index) => {
    assert.equal(typeof entry?.selector, "string",
      `mask selector ${index} must be a string`);
    assert.ok(entry.selector.length > 0, `mask selector ${index} must not be empty`);
    assert.equal(typeof entry.region, "string",
      `mask selector ${index} must name its rendered region`);
    assert.equal(typeof entry.reason, "string",
      `mask selector ${index} must explain why it moves`);
    assert.match(entry.selector,
      /^\.game-browser-layer--(?:combat|effects) \.combat-(?:marker--entity-(?:ground|air)|target-link|effect-(?:projectile|impact|area|path))$/,
      `mask selector ${index} must target one moving combat/effect marker`);
    return entry.selector;
  });
  assert.equal(new Set(selectors).size, selectors.length,
    "mask selector inventory must not contain duplicates");
  assert.equal(regions.length, 0,
    "fixed coordinate/region masks are forbidden for VIS-003D evidence");
  const targets = [
    ...selectors.map((selector) => ({ kind: "selector", value: selector })),
    ...regions.map((region) => ({ kind: "region", value: region.name })),
  ];
  for (const target of targets) {
    assert.equal(typeof target.value, "string",
      `${target.kind} mask target must have a string value`);
    for (const protectedTarget of PROTECTED_MASK_TARGETS) {
      assert.doesNotMatch(target.value, protectedTarget.pattern,
        `${target.kind} mask must not hide ${protectedTarget.label}: ${target.value}`);
    }
  }
  return targets;
}

const MASKED_WORLD_TARGETS = assertMaskInventory(
  MOVING_WORLD_MASK_INVENTORY,
  MOVING_WORLD_MASK_REGIONS,
);

const MOVING_WORLD_MASK_CSS = MOVING_WORLD_MASK_INVENTORY.map(({ selector }) =>
  `${selector} { display: none !important; }`).join("\n");

const BRIDGE_ORNAMENT_REGIONS = Object.freeze([
  Object.freeze({ label: "west-before", x: 164, y: 557, w: 10, h: 10 }),
  Object.freeze({ label: "west-after", x: 216, y: 609, w: 10, h: 10 }),
  Object.freeze({ label: "east-before", x: 494, y: 557, w: 10, h: 10 }),
  Object.freeze({ label: "east-after", x: 546, y: 609, w: 10, h: 10 }),
]);

const html = readFileSync(HTML_PATH, "utf8");

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digestValue(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function decodePng(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual(bytes.subarray(0, 8), signature, "PNG signature must be valid");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const chunks = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = bytes.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      chunks.push(data);
    }
    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
  assert.equal(bitDepth, 8, "contact sheet PNG must use 8-bit channels");
  assert.equal(colorType, 2, "contact sheet PNG must use truecolor RGB");
  const bytesPerPixel = 3;
  const rowLength = width * bytesPerPixel;
  const encoded = inflateSync(Buffer.concat(chunks));
  const pixels = Buffer.alloc(height * rowLength);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = encoded[sourceOffset++];
    const rowStart = y * rowLength;
    for (let x = 0; x < rowLength; x += 1) {
      const raw = encoded[sourceOffset++];
      const left = x >= bytesPerPixel ? pixels[rowStart + x - bytesPerPixel] : 0;
      const above = y > 0 ? pixels[rowStart - rowLength + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel
        ? pixels[rowStart - rowLength + x - bytesPerPixel] : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = (raw + left) & 255;
      else if (filter === 2) value = (raw + above) & 255;
      else if (filter === 3) value = (raw + Math.floor((left + above) / 2)) & 255;
      else if (filter === 4) {
        const estimate = left + above - upperLeft;
        const pa = Math.abs(estimate - left);
        const pb = Math.abs(estimate - above);
        const pc = Math.abs(estimate - upperLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft;
        value = (raw + predictor) & 255;
      } else {
        throw new TypeError(`unsupported PNG filter ${filter}`);
      }
      pixels[rowStart + x] = value;
    }
  }
  return { height, pixels, width };
}

function pixelAt(image, x, y) {
  const offset = (y * image.width + x) * 3;
  return [image.pixels[offset], image.pixels[offset + 1], image.pixels[offset + 2]];
}

function imageMetrics(bytes, rect) {
  const image = decodePng(bytes);
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const x1 = Math.min(image.width, x0 + Math.round(rect.w));
  const y1 = Math.min(image.height, y0 + Math.round(rect.h));
  let occupiedPixels = 0;
  let edgePixels = 0;
  let minLuminance = 255;
  let maxLuminance = 0;
  const cropPixels = [];
  const art = (r, g, b, luminance) => {
    const maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b);
    // The Rivermark card fills are all below 90 in their brightest channel;
    // this threshold admits the authored subject colors and antialiasing but
    // excludes the dark card gradient, border, and drop shadow.
    return maximum >= 90 && (maximum - minimum >= 16 || luminance >= 95);
  };
  const occupied = [];
  for (let y = y0; y < y1; y += 1) {
    const row = [];
    for (let x = x0; x < x1; x += 1) {
      const [r, g, b] = pixelAt(image, x, y);
      cropPixels.push(r, g, b);
      const luminance = Math.round((2126 * r + 7152 * g + 722 * b) / 10_000);
      const signal = art(r, g, b, luminance);
      row.push(signal);
      if (signal) occupiedPixels += 1;
      minLuminance = Math.min(minLuminance, luminance);
      maxLuminance = Math.max(maxLuminance, luminance);
    }
    occupied.push(row);
  }
  for (let y = 0; y < occupied.length; y += 1) {
    for (let x = 0; x < occupied[y].length; x += 1) {
      if (!occupied[y][x]) continue;
      if (x === 0 || y === 0 || x === occupied[y].length - 1 ||
          y === occupied.length - 1 || !occupied[y][x - 1] ||
          !occupied[y][x + 1] || !occupied[y - 1][x] ||
          !occupied[y + 1][x]) edgePixels += 1;
    }
  }
  const area = Math.max(1, (x1 - x0) * (y1 - y0));
  return {
    edgePixels,
    edgeRatio: edgePixels / area,
    luminanceRange: maxLuminance - minLuminance,
    occupiedPixels,
    occupiedRatio: occupiedPixels / area,
    signature: createHash("sha256").update(Buffer.from(cropPixels)).digest("hex"),
  };
}

function readableCard(metrics) {
  return metrics.occupiedRatio >= 0.14 &&
    metrics.edgeRatio >= 0.012 && metrics.luminanceRange >= 45;
}

function comparePngs(leftBytes, rightBytes) {
  const left = decodePng(leftBytes);
  const right = decodePng(rightBytes);
  assert.equal(left.width, right.width, "PNG comparison widths must match");
  assert.equal(left.height, right.height, "PNG comparison heights must match");
  let changedPixels = 0;
  let changedChannels = 0;
  let maxChannelDelta = 0;
  for (let index = 0; index < left.pixels.length; index += 1) {
    const delta = Math.abs(left.pixels[index] - right.pixels[index]);
    if (delta !== 0) changedChannels += 1;
    maxChannelDelta = Math.max(maxChannelDelta, delta);
  }
  for (let index = 0; index < left.pixels.length; index += 3) {
    if (left.pixels[index] !== right.pixels[index] ||
        left.pixels[index + 1] !== right.pixels[index + 1] ||
        left.pixels[index + 2] !== right.pixels[index + 2]) {
      changedPixels += 1;
    }
  }
  return { changedChannels, changedPixels, maxChannelDelta };
}

function regionPixelEvidence(bytes, rect) {
  const image = decodePng(bytes);
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const x1 = Math.min(image.width, x0 + Math.round(rect.w));
  const y1 = Math.min(image.height, y0 + Math.round(rect.h));
  const pixels = [];
  let darkPixels = 0;
  let lightPixels = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const pixel = pixelAt(image, x, y);
      pixels.push(...pixel);
      if (Math.max(...pixel) <= 70) darkPixels += 1;
      if (Math.min(...pixel) >= 105) lightPixels += 1;
    }
  }
  return {
    darkPixels,
    distinctColors: new Set(Array.from({ length: pixels.length / 3 }, (_, index) =>
      pixels.slice(index * 3, index * 3 + 3).join(","))).size,
    label: rect.label,
    lightPixels,
    rect: { h: rect.h, w: rect.w, x: rect.x, y: rect.y },
    signature: createHash("sha256").update(Buffer.from(pixels)).digest("hex"),
  };
}

function bridgePixelEvidence(bytes) {
  const evidence = BRIDGE_ORNAMENT_REGIONS.map((region) =>
    regionPixelEvidence(bytes, region));
  for (const probe of evidence) {
    assert.ok(probe.darkPixels > 0 && probe.lightPixels > 0,
      `${probe.label} bridge ornament must leave dark border and light fill pixels visible: ` +
      JSON.stringify(probe));
  }
  return evidence;
}

function changedPixelsInRegion(leftBytes, rightBytes, rect) {
  const left = decodePng(leftBytes);
  const right = decodePng(rightBytes);
  assert.equal(left.width, right.width, "region comparison widths must match");
  assert.equal(left.height, right.height, "region comparison heights must match");
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const x1 = Math.min(left.width, x0 + Math.round(rect.w));
  const y1 = Math.min(left.height, y0 + Math.round(rect.h));
  let changedPixels = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (pixelAt(left, x, y).some((value, index) =>
        value !== pixelAt(right, x, y)[index])) changedPixels += 1;
    }
  }
  return changedPixels;
}

function styleBlock(source, id) {
  const start = source.indexOf(`<style id="${id}">`);
  const end = source.indexOf("</style>", start);
  assert.ok(start >= 0 && end > start, `style block ${id} must exist`);
  return source.slice(start, end);
}

function ruleBody(css, selector) {
  const at = css.indexOf(selector);
  assert.ok(at >= 0, `missing css rule ${selector}`);
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function occurrences(value, needle) {
  return value.split(needle).length - 1;
}

function intersects(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w &&
    a.y < b.y + b.h && b.y < a.y + a.h;
}

const roster = createPlayableRoster();
const rosterById = new Map(roster.map((card) => [card.id, card]));
const costsById = new Map(roster.map((card) => [card.id, card.cost]));

function viewModelInput({ amount = 10, selectedCardId = null, ended = false }) {
  const ids = [...PLAYABLE_CARD_IDS];
  const towers = [
    "north:central",
    "north:lane:left",
    "north:lane:right",
    "south:central",
    "south:lane:left",
    "south:lane:right",
  ].map((id) => ({ hitpoints: ended && id === "north:central" ? 0 : 1400, id }));
  return {
    cards: roster.map(({ cost, displayName, id }) =>
      ({ cost, displayName, id })),
    deck: {
      hand: ids.slice(0, 4),
      next: ids[4],
      queue: ids.slice(4),
      sequence: 0,
    },
    elixir: {
      sides: {
        north: { accumulator: 0, amount: 10 },
        south: { accumulator: 0, amount },
      },
      tick: ended ? 11_000 : 0,
    },
    localSide: "south",
    match: {
      crowns: ended ? { north: 0, south: 3 } : { north: 0, south: 0 },
      destroyedTowerIds: ended ? ["north:central"] : [],
      phase: ended ? "ended" : "regulation",
      result: ended
        ? {
          crowns: { north: 0, south: 3 },
          endedAtTick: 11_000,
          kind: "win",
          reason: "central_destroyed",
          winner: "south",
        }
        : null,
      tick: ended ? 11_000 : 0,
      towers,
    },
    selectedCardId,
  };
}

class FakeNode {
  constructor() {
    this.dataset = {};
    this.innerHTML = "";
    this.style = { width: "" };
    this.textContent = "";
    this.value = "";
    this.lookups = new Map();
  }

  querySelectorAll(selector) {
    const value = this.lookups.get(selector);
    if (Array.isArray(value)) return value;
    return value === undefined ? [] : [value];
  }
}

function fakeShell() {
  const shell = new FakeNode();
  const timer = new FakeNode();
  const north = new FakeNode();
  const south = new FakeNode();
  north.lookups.set("i", [new FakeNode(), new FakeNode(), new FakeNode()]);
  south.lookups.set("i", [new FakeNode(), new FakeNode(), new FakeNode()]);
  const hand = [new FakeNode(), new FakeNode(), new FakeNode(), new FakeNode()];
  const next = new FakeNode();
  const rail = new FakeNode();
  const fill = new FakeNode();
  const output = new FakeNode();
  rail.lookups.set(".elixir-fill", fill);
  rail.lookups.set("output", output);
  shell.lookups.set('[data-ui="timer"]', timer);
  shell.lookups.set('[data-ui="opponent-hud"] .crown-track', north);
  shell.lookups.set('[data-ui="player-hud"] .crown-track', south);
  shell.lookups.set('[data-ui="card-slot"]', hand);
  shell.lookups.set('[data-ui="next-card"]', next);
  shell.lookups.set('[data-ui="elixir-rail"]', rail);
  return { fill, hand, next, output, rail, shell };
}

async function mountCardContactSheet(page) {
  await page.addStyleTag({ content: CONTACT_SHEET_CSS });
  const records = roster.map(({ cost, displayName, id }) =>
    ({ cost, displayName, id }));
  return page.evaluate((cards) => {
    const sheet = document.createElement("section");
    sheet.className = "card-contact-sheet";
    sheet.setAttribute("aria-label", "Gameplay-scale card art contact sheet");
    const title = document.createElement("strong");
    title.className = "card-contact-sheet__title";
    title.textContent = "Gameplay-scale card art";
    sheet.append(title);
    for (const card of cards) {
      const node = document.createElement("span");
      node.className = "hud-card";
      node.dataset.cardId = card.id;
      node.dataset.kind = "hand";
      node.title = card.displayName;
      const cost = document.createElement("b");
      cost.className = "hud-card__cost";
      cost.textContent = String(card.cost);
      const name = document.createElement("span");
      name.className = "hud-card__name";
      name.textContent = card.displayName;
      node.append(cost, name);
      sheet.append(node);
    }
    document.body.append(sheet);
    const sheetBox = sheet.getBoundingClientRect();
    const cardsById = Object.fromEntries([...sheet.querySelectorAll(".hud-card")]
      .map((node) => {
        const box = node.getBoundingClientRect();
        const art = {
          h: 47,
          w: 68,
          x: Math.round(box.left - sheetBox.left) + 10,
          y: Math.round(box.top - sheetBox.top) + 3,
        };
        return [node.dataset.cardId, art];
      }));
    return {
      height: Math.round(sheetBox.height),
      rects: cardsById,
      width: Math.round(sheetBox.width),
    };
  }, records);
}

async function removeCardContactSheet(page) {
  await page.evaluate(() => {
    document.querySelector(".card-contact-sheet")?.remove();
    document.querySelectorAll("style").forEach((node) => {
      if (node.textContent.includes(".card-contact-sheet")) node.remove();
    });
  });
}

async function captureFreshRun(directory) {
  mkdirSync(directory, { recursive: true });
  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let browser;
  try {
    let readyText = "";
    server.stdout.setEncoding("utf8");
    for await (const chunk of server.stdout) {
      readyText += chunk;
      const end = readyText.indexOf("\n");
      if (end >= 0) break;
    }
    const ready = JSON.parse(readyText);
    const { chromium } = await import(PLAYWRIGHT);
    browser = await chromium.launch({
      args: [...CAPTURE_FLAGS],
      executablePath: CHROME,
      headless: true,
    });
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      viewport: { height: 1_280, width: 720 },
    });
    const page = await context.newPage();
    const response = await page.goto(
      "http://" + ready.host + ":" + ready.port +
      "/public/ui-arena-shell.html?session-profile=live-seed-2-terminal",
      { waitUntil: "domcontentloaded" },
    );
    assert.equal(response.status(), 200);
    await page.waitForSelector('[data-ui="arena"]');
    await page.waitForSelector('[data-ui="hud-hand"] .hud-card');
    await page.click('[data-ui="audio-toggle"]');
    await page.addStyleTag({ content: MOVING_WORLD_MASK_CSS });
    const startTick = await page.evaluate(async () => {
      const [{ arenaHudController: controller },
        { createShippedGameSessionSetup },
        { GameSession }] = await Promise.all([
        import("/src/ui/arena-shell-entry.js"),
        import("/src/ui/game-browser-entry.js"),
        import("/src/sim/game-session.js"),
      ]);
      globalThis.__visController = controller;
      controller.enterManualStepMode();
      const fresh = new GameSession(
        createShippedGameSessionSetup(2, "live-seed-2-terminal"),
      );
      controller.restore(JSON.stringify({
        bridge: JSON.stringify({ deliveries: [], version: 1 }),
        running: false,
        session: fresh.serialize(),
        version: 1,
      }));
      controller.stepMany(60);
      return controller.state.sessionTick;
    });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))));
    });
    const initial = await collectState(page);
    await page.screenshot({ path: directory + "/initial.png" });
    const bridgePixels = bridgePixelEvidence(
      readFileSync(directory + "/initial.png"),
    );
    const arenaBox = await page.locator('[data-ui="arena"]').boundingBox();
    const costs = Object.fromEntries(costsById);
    let drainRounds = 0;
    for (;;) {
      const wallet = await page.evaluate(() => ({
        amount: globalThis.__visController.session.state.elixir.sides.south.amount,
        hand: [...globalThis.__visController.session.state.decks.south.hand],
      }));
      if (wallet.hand.some((id) => costsById.get(id) > wallet.amount)) break;
      assert.ok(drainRounds < 4, "fresh capture wallet must reach insufficient state");
      drainRounds += 1;
      const target = wallet.hand.reduce((best, id) =>
        costsById.get(id) <= wallet.amount &&
        costsById.get(id) < costsById.get(best) ? id : best,
      wallet.hand.find((id) => costsById.get(id) <= wallet.amount));
      await page.click('[data-ui="card-slot"][data-card-id="' + target + '"]');
      await page.mouse.click(arenaBox.x + 439, arenaBox.y + 529);
      await page.evaluate(() => globalThis.__visController.stepMany(1));
    }
    const selectionTarget = await page.evaluate((costMap) => {
      const controller = globalThis.__visController;
      const amount = controller.session.state.elixir.sides.south.amount;
      return [...document.querySelectorAll('[data-ui="card-slot"]')]
        .map((node) => node.dataset.cardId)
        .find((id) => costMap[id] <= amount);
    }, costs);
    assert.ok(selectionTarget);
    await page.click(
      '[data-ui="card-slot"][data-card-id="' + selectionTarget + '"]',
    );
    const selected = await collectState(page);
    await page.screenshot({ path: directory + "/card-selected.png" });
    await page.mouse.click(arenaBox.x + 439, arenaBox.y + 529);
    await page.evaluate(() => globalThis.__visController.stepMany(2));
    await page.waitForFunction(() =>
      document.querySelectorAll(
        '[data-ui="hud-hand"] .hud-card[data-insufficient="true"]',
      ).length > 0,
    null, { polling: 50, timeout: 10_000 });
    const insufficient = await collectState(page);
    await page.screenshot({ path: directory + "/insufficient-elixir.png" });

    const restartSelection = await page.evaluate((costMap) => {
      const controller = globalThis.__visController;
      let amount = controller.session.state.elixir.sides.south.amount;
      let target;
      for (let index = 0; index < 20 && target === undefined; index += 1) {
        target = [...document.querySelectorAll('[data-ui="card-slot"]')]
          .map((node) => node.dataset.cardId)
          .find((id) => costMap[id] <= amount);
        if (target === undefined) {
          controller.stepMany(60);
          amount = controller.session.state.elixir.sides.south.amount;
        }
      }
      return { amount, target };
    }, costs);
    assert.ok(restartSelection.target);
    await page.click(
      '[data-ui="card-slot"][data-card-id="' + restartSelection.target + '"]',
    );
    let terminal = false;
    for (let index = 0; index < 40 && !terminal; index += 1) {
      terminal = await page.evaluate(() => {
        const controller = globalThis.__visController;
        controller.fastForwardSegment(600);
        return controller.state.terminal;
      });
    }
    assert.equal(terminal, true);
    await page.waitForFunction(() =>
      document.querySelector(".match-feedback__overlay") !== null,
    null, { polling: 50, timeout: 10_000 });
    const winner = await page.evaluate(() => {
      const controller = globalThis.__visController;
      const overlay = document.querySelector(".match-feedback__overlay");
      return {
        kind: overlay.dataset.kind,
        selectedCardId: controller.state.selectedCardId,
        sessionTick: controller.state.sessionTick,
        winner: overlay.dataset.winner,
      };
    });
    await page.screenshot({ path: directory + "/winner-overlay.png" });
    await page.click('[data-ui="restart"]');
    await page.waitForFunction(() =>
      globalThis.__visController.state.sessionTick === 0 &&
      document.querySelector('[data-ui="restart"]').hidden === true &&
      document.querySelector(".match-feedback__overlay") === null,
    null, { polling: 50, timeout: 10_000 });
    const restart = await collectState(page);
    await page.screenshot({ path: directory + "/restart.png" });
    const screenshotHashes = Object.fromEntries(SCREENSHOTS.map((name) =>
      [name, sha256(directory + "/" + name)]));
    const screenshotDimensions = Object.fromEntries(SCREENSHOTS.map((name) => {
      const image = decodePng(readFileSync(directory + "/" + name));
      return [name, { height: image.height, width: image.width }];
    }));
    const states = { initial, insufficient, restart, selected, winner };
    return {
      bridgePixels,
      drainRounds,
      screenshotDimensions,
      screenshotHashes,
      selectionTarget,
      startTick,
      stateHashes: Object.fromEntries(Object.entries(states).map(([name, state]) =>
        [name, digestValue(state)])),
      states,
    };
  } finally {
    try { await browser?.close(); } catch {}
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await Promise.race([once(server, "exit"),
        new Promise((resolve) => setTimeout(resolve, 2_000))]);
    }
  }
}

async function screenshotCardContactSheet(page, path, layout) {
  await page.locator(".card-contact-sheet").screenshot({ path });
  const bytes = readFileSync(path);
  const image = decodePng(bytes);
  assert.equal(image.width, layout.width, "contact sheet width must be canonical");
  assert.equal(image.height, layout.height, "contact sheet height must be canonical");
  const metrics = Object.fromEntries(Object.entries(layout.rects).map(([id, rect]) =>
    [id, imageMetrics(bytes, rect)]));
  return {
    dimensions: { height: image.height, width: image.width },
    hash: sha256(path),
    metrics,
    rects: layout.rects,
  };
}

test("visual interface art: every shipped card has distinct authored art in the shell", () => {
  const art = styleBlock(html, "interface-production-art");
  const signatures = new Map();
  for (const id of PLAYABLE_CARD_IDS) {
    const body = ruleBody(art, `.hud-card[data-card-id="${id}"]::before`);
    assert.match(body, /clip-path|radial-gradient|conic-gradient/,
      `${id} emblem must use authored shape work`);
    signatures.set(id, body.trim());
  }
  assert.equal(signatures.size, PLAYABLE_CARD_IDS.length);
  assert.equal(new Set(signatures.values()).size, PLAYABLE_CARD_IDS.length,
    "every card emblem must be visually distinct");
  for (const hex of [
    "#191d22", "#f4ebd6", "#c6452e", "#e9a83a", "#4a332a",
    "#2e7f86", "#16324f", "#dcede9", "#5c8a46",
  ]) {
    assert.ok(art.includes(hex), `rivermark palette missing ${hex}`);
  }
});

test("visual interface art: HUD state mutation pipeline binds every hook with art classes intact", () => {
  const markup = getArenaShellMarkup();
  assert.equal(occurrences(markup, 'data-ui="arena"'), 1);
  assert.equal(occurrences(markup, 'data-ui="card-slot"'), 4);
  assert.equal(occurrences(markup, 'data-ui="next-card"'), 1);
  assert.equal(occurrences(markup, 'data-ui="timer"'), 1);
  assert.equal(occurrences(markup, 'data-ui="elixir-rail"'), 1);

  const view = createHudViewModel(viewModelInput({}));
  const fake = fakeShell();
  bindHudViewModel(fake.shell, view);
  view.hand.forEach((card, index) => {
    const inner = fake.hand[index].innerHTML;
    assert.ok(inner.includes(`data-card-id="${card.id}"`), inner);
    assert.ok(inner.includes('class="hud-card"'), inner);
    assert.ok(inner.includes('class="hud-card__cost"'), inner);
    assert.ok(inner.includes(`>${card.cost}</b>`), inner);
    assert.ok(inner.includes(card.displayName), inner);
  });
  assert.ok(fake.next.innerHTML.includes(`data-card-id="${view.next.id}"`));
  assert.equal(fake.output.textContent, String(view.elixir.amount));
});

test("visual interface art: selection, disabled, and insufficient states render distinctly", () => {
  const art = styleBlock(html, "interface-production-art");
  const normal = getHudMarkup(createHudViewModel(viewModelInput({})));
  const selected = getHudMarkup(
    createHudViewModel(viewModelInput({ selectedCardId: PLAYABLE_CARD_IDS[0] })));
  const poor = getHudMarkup(createHudViewModel(viewModelInput({ amount: 1 })));

  assert.equal(normal.includes('data-selected="true"'), false);
  assert.equal(selected.includes('data-selected="true"'), true);
  const expectedInsufficient = PLAYABLE_CARD_IDS.slice(0, 4)
    .filter((id) => costsById.get(id) > 1).length;
  const poorInsufficient =
    poor.split('data-insufficient="true"').length - 1;
  assert.equal(poorInsufficient, expectedInsufficient);
  assert.ok(poorInsufficient >= 1);
  assert.ok(poor.includes('data-disabled="true"'));

  const selectedBody = ruleBody(art, '.hud-card[data-selected="true"]');
  const disabledBody = ruleBody(art, '.hud-card[data-disabled="true"]');
  const insufficientBody =
    ruleBody(art, '.hud-card[data-insufficient="true"]');
  assert.notEqual(selectedBody, disabledBody);
  assert.notEqual(disabledBody, insufficientBody);
  assert.notEqual(selectedBody, insufficientBody);
  assert.match(selectedBody, /#e9a83a/);
  assert.match(disabledBody, /grayscale/);
  assert.match(insufficientBody, /dashed/);
  assert.match(ruleBody(art, ".hud-card__cost"), /radial-gradient/);
});

test("visual interface art: winner, overtime, and terminal hierarchy rules exist", () => {
  const art = styleBlock(html, "interface-production-art");
  assert.match(art, /\[data-phase="overtime"\] \[data-ui="hud-timer"\]/);
  assert.match(art, /\[data-phase="ended"\] \[data-ui="hud-timer"\]/);
  assert.match(art, /\.match-feedback__overlay\[data-winner="north"\]/);
  assert.match(art, /\.match-feedback__overlay\[data-winner="south"\]/);
  assert.match(art, /\.match-feedback__overlay\[data-kind="draw"\]/);
  for (let amount = 0; amount <= 10; amount += 1) {
    assert.match(art,
      new RegExp(`\\[data-ui="hud-elixir"\\]\\[data-amount="${amount}"\\]`),
      `elixir fill mapping must cover amount ${amount}`);
  }
  const ended = getHudMarkup(createHudViewModel(viewModelInput({
    amount: 5,
    ended: true,
  })));
  assert.match(ended, /data-phase="ended"/);
});

test("visual interface art: no debug labels and provenance-safe primitives ship", () => {
  assert.doesNotMatch(html, /debug|TODO|FIXME|placeholder|lorem/i);
  assert.doesNotMatch(html, /(?:https?:|data:|blob:|url\s*\(|reference\/)/i);
  assert.doesNotMatch(html, /\.(?:png|jpe?g|gif|webp|avif|svg|mp[34]|wav|ogg)\b/i);
  assert.doesNotMatch(html, /@keyframes|animation\s*:|transition\s*:/);
  assert.doesNotMatch(html, /<script(?![^>]*src=)/);
  assert.doesNotMatch(html, /on(?:click|load|error|pointer|mouse|touch|key)\s*=/i);
  assert.match(html, /src="\.\.\/src\/ui\/arena-shell-entry\.js"/);
  assert.match(html, /href="\.\.\/src\/ui\/arena-shell\.css"/);
});

test("visual interface art: interactive controls never overlap the arena click zone", () => {
  assert.ok(getArenaShellMarkup().includes(
    '<button class="restart-control" type="button" data-ui="restart" hidden>'),
    "restart control must ship hidden outside terminal state");
  const arena = { x: 86, y: 104, w: 548, h: 968 };
  const controls = {
    audioToggle: { x: 638, y: 118, w: 72, h: 48 },
    topRail: { x: 42, y: 24, w: 636, h: 62 },
    bottomRail: { x: 42, y: 1082, w: 636, h: 62 },
    handTray: { x: 112, y: 1154, w: 496, h: 88 },
    elixirRail: { x: 112, y: 1248, w: 496, h: 22 },
    elixirBadge: { x: 556, y: 1224, w: 56, h: 52 },
    crownsChip: { x: 492, y: 34, w: 150, h: 44 },
  };
  for (const [label, rect] of Object.entries(controls)) {
    assert.equal(intersects(rect, arena), false,
      `${label} overlaps the arena input region`);
  }
});

test("visual interface art: evidence mask inventories moving markers only", () => {
  const targets = assertMaskInventory(
    MOVING_WORLD_MASK_INVENTORY,
    MOVING_WORLD_MASK_REGIONS,
  );
  assert.equal(targets.length, 7,
    "the evidence mask must enumerate all seven moving marker selectors");
  assert.deepEqual(targets, MOVING_WORLD_MASK_INVENTORY.map(({ selector }) =>
    ({ kind: "selector", value: selector })));
  assert.equal(MOVING_WORLD_MASK_REGIONS.length, 0);
  for (const { selector } of MOVING_WORLD_MASK_INVENTORY) {
    assert.match(MOVING_WORLD_MASK_CSS,
      new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(MOVING_WORLD_MASK_CSS, /bridge|arena|hud|card|timer|crown|health|elixir|winner|restart/i,
    "the exact evidence mask must not name static bridge, arena, or interface art");
});

test("visual interface art: fixed 720x1280 Chrome evidence captures every hierarchy state", {
  timeout: 420_000,
}, async () => {
  assert.ok(existsSync(PLAYWRIGHT), "installed Playwright equivalent is required");
  assert.ok(existsSync(CHROME), "installed Chrome is required");
  mkdirSync(ARTIFACTS, { recursive: true });
  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let browser;
  const consoleErrors = [];
  const unhandled = [];
  try {
    let readyText = "";
    server.stdout.setEncoding("utf8");
    for await (const chunk of server.stdout) {
      readyText += chunk;
      const end = readyText.indexOf("\n");
      if (end >= 0) break;
    }
    const ready = JSON.parse(readyText);
    const { chromium } = await import(PLAYWRIGHT);
    browser = await chromium.launch({
      args: [...CAPTURE_FLAGS],
      executablePath: CHROME,
      headless: true,
    });
    const context = await browser.newContext({ deviceScaleFactor: 1,
      viewport: { height: 1_280, width: 720 } });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => unhandled.push(String(error)));
    const response = await page.goto(
      `http://${ready.host}:${ready.port}/public/ui-arena-shell.html?session-profile=live-seed-2-terminal`,
      { waitUntil: "domcontentloaded" },
    );
    assert.equal(response.status(), 200);
    await page.waitForSelector('[data-ui="arena"]');
    await page.waitForSelector('[data-ui="hud-hand"] .hud-card');
    await page.click('[data-ui="audio-toggle"]');
    // The terminal-profile combat/effect markers have interpolated positions
    // that can differ between Chrome processes while authoritative session
    // bytes and ticks remain identical. Hide only those moving markers for
    // this HUD-focused evidence. Static arena art, bridge corners, towers,
    // health bars, and every interface control remain visible.
    await page.addStyleTag({ content: MOVING_WORLD_MASK_CSS });
    const startTick = await page.evaluate(async () => {
      const [{ arenaHudController: controller },
        { createShippedGameSessionSetup },
        { GameSession }] = await Promise.all([
        import("/src/ui/arena-shell-entry.js"),
        import("/src/ui/game-browser-entry.js"),
        import("/src/sim/game-session.js"),
      ]);
      globalThis.__visController = controller;
      controller.enterManualStepMode();
      // Rebase through a fresh, canonical terminal-profile session so the
      // first evidence frame is always the same authoritative tick even if
      // Chrome advanced a few RAFs while the module graph loaded.
      const fresh = new GameSession(
        createShippedGameSessionSetup(2, "live-seed-2-terminal"),
      );
      const snapshot = JSON.stringify({
        bridge: JSON.stringify({ deliveries: [], version: 1 }),
        running: false,
        session: fresh.serialize(),
        version: 1,
      });
      controller.restore(snapshot);
      controller.stepMany(60);
      return controller.state.sessionTick;
    });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    const initial = await collectState(page);
    const geometry = await page.evaluate(() => {
      const box = (selector) => {
        const node = document.querySelector(selector);
        const rect = node?.getBoundingClientRect();
        return rect === undefined ? null : {
          bottom: Math.round(rect.bottom),
          height: Math.round(rect.height),
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
        };
      };
      return {
        arena: box('[data-ui="arena"]'),
        audioToggle: box('[data-ui="audio-toggle"]'),
        bottomRail: box('.match-rail--bottom'),
        crownsChip: box('[data-ui="hud-crowns"]'),
        elixirBadge: box('[data-ui="hud-elixir"]'),
        elixirRail: box('[data-ui="elixir-rail"]'),
        handTray: box('[data-ui="hand-tray"]'),
        topRail: box('.match-rail--top'),
      };
    });
    assert.match(initial.timerText, /^\d:\d\d$/);
    assert.equal(startTick, 60, "startup evidence must be pinned to tick 60");
    assert.equal(new Set(initial.handIds).size, initial.handIds.length);
    for (const id of initial.handIds.concat([initial.nextId])) {
      assert.ok(rosterById.has(id), `projected card ${id} must be shipped roster`);
    }
    assert.equal(initial.costTexts.length, initial.handIds.length);
    assert.equal(initial.towerHealthBars.visible, true);
    assert.ok(initial.towerHealthBars.count >= 6);
    assert.ok(initial.crowns.north !== undefined);
    assert.ok(initial.crowns.south !== undefined);
    assert.ok(geometry.elixirBadge.bottom <= 1_280,
      "elixir badge must stay inside the fixed viewport");
    await page.screenshot({ path: `${ARTIFACTS}initial.png` });
    const initialBytes = readFileSync(`${ARTIFACTS}initial.png`);
    const bridgePixels = bridgePixelEvidence(initialBytes);
    const bridgeStyles = await page.evaluate(() =>
      [...document.querySelectorAll('[data-ui="bridge"]')].map((node) => {
        const pseudo = (kind) => {
          const style = getComputedStyle(node, kind);
          return {
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
            display: style.display,
            height: style.height,
            width: style.width,
          };
        };
        return {
          after: pseudo("::after"),
          before: pseudo("::before"),
          lane: node.dataset.lane,
        };
      }));
    assert.equal(bridgeStyles.length, 2);
    for (const bridge of bridgeStyles) {
      for (const [kind, style] of Object.entries({
        before: bridge.before,
        after: bridge.after,
      })) {
        assert.notEqual(style.display, "none",
          `${bridge.lane} ${kind} bridge ornament must remain painted`);
        assert.equal(style.width, "10px");
        assert.equal(style.height, "10px");
      }
    }

    const bridgeMutationStyle = await page.addStyleTag({ content: `
      .bridge--west::before {
        background: #c6452e !important;
        border-color: #e9a83a !important;
      }
    ` });
    await page.screenshot({
      path: `${ARTIFACTS}mutation-bridge-ornament.png`,
    });
    const bridgeMutationBytes =
      readFileSync(`${ARTIFACTS}mutation-bridge-ornament.png`);
    const bridgeDiff = comparePngs(initialBytes, bridgeMutationBytes);
    const bridgeMutationPixels = changedPixelsInRegion(
      initialBytes,
      bridgeMutationBytes,
      BRIDGE_ORNAMENT_REGIONS[0],
    );
    assert.ok(bridgeDiff.changedPixels > 0,
      "a static bridge ornament mutation must change the exact screenshot");
    assert.ok(bridgeMutationPixels > 0,
      "the bridge ornament mutation must change pixels inside its corner region");
    await bridgeMutationStyle.evaluate((node) => node.remove());

    const contactLayout = await mountCardContactSheet(page);
    const contactSheet = await screenshotCardContactSheet(
      page, ARTIFACTS + "card-contact-sheet.png", contactLayout,
    );
    assert.equal(Object.keys(contactSheet.metrics).length, 8);
    for (const [id, metrics] of Object.entries(contactSheet.metrics)) {
      assert.ok(readableCard(metrics),
        id + " must have occupied, edged, high-contrast gameplay-scale art");
    }
    assert.equal(
      new Set(Object.values(contactSheet.metrics).map((metrics) =>
        metrics.signature)).size,
      8,
      "all eight gameplay-scale card silhouettes must remain distinct",
    );

    await page.addStyleTag({ content: [
      "      .card-contact-sheet .hud-card[data-card-id=\"briar-band\"]::before {",
      "        top: 7px !important;",
      "        width: 48px !important;",
      "        height: 40px !important;",
      "        filter: none !important;",
      "        background: conic-gradient(",
      "          from 210deg at 50% 85%,",
      "          #5c8a46 0 7deg, transparent 7deg 24deg,",
      "          #47703a 24deg 31deg, transparent 31deg 48deg,",
      "          #5c8a46 48deg 55deg, transparent 55deg) !important;",
      "        clip-path: polygon(0 0, 100% 0, 100% 78%, 50% 100%, 0 78%) !important;",
      "      }",
      "      .card-contact-sheet .hud-card[data-card-id=\"briar-band\"]::after {",
      "        display: none !important;",
      "      }",
    ].join("\n") });
    const thinMutation = await screenshotCardContactSheet(
      page, ARTIFACTS + "mutation-briar-thin.png", contactLayout,
    );
    assert.equal(readableCard(thinMutation.metrics["briar-band"]), false,
      "the prior thin Briar mark must fail the gameplay-scale readability bar: " +
      JSON.stringify(thinMutation.metrics["briar-band"]));

    await page.addStyleTag({ content: [
      "      .card-contact-sheet .hud-card[data-card-id=\"coilblade\"] {",
      "        border-color: #c6452e !important;",
      "      }",
    ].join("\n") });
    const hudMutation = await screenshotCardContactSheet(
      page, ARTIFACTS + "mutation-hud-style.png", contactLayout,
    );
    const hudDiff = comparePngs(
      readFileSync(ARTIFACTS + "card-contact-sheet.png"),
      readFileSync(ARTIFACTS + "mutation-hud-style.png"),
    );
    assert.ok(hudDiff.changedPixels > 0,
      "a visible card style mutation must be caught by exact pixel comparison");
    await removeCardContactSheet(page);

    const arenaBox = await page.locator('[data-ui="arena"]').boundingBox();
    for (const point of [{ x: 439, y: 529 }, { x: 270, y: 760 }]) {
      const probe = await page.evaluate(([px, py]) => {
        const node = document.elementFromPoint(px, py);
        return Boolean(node?.closest?.('[data-ui="arena"]'));
      }, [arenaBox.x + point.x, arenaBox.y + point.y]);
      assert.equal(probe, true,
        `journey click zone ${JSON.stringify(point)} must reach the arena`);
    }
    const slotsReachable = await page.evaluate(() => [...document
      .querySelectorAll('[data-ui="card-slot"]')].map((slot) => {
      const box = slot.getBoundingClientRect();
      const node = document.elementFromPoint(box.x + box.width / 2,
        box.y + box.height / 2);
      return node === slot || slot.contains(node);
    }));
    assert.deepEqual(slotsReachable, [true, true, true, true]);

    const costsMap = Object.fromEntries(costsById);
    const deployPoint = { x: 439, y: 529 };
    let drainRounds = 0;
    for (;;) {
      const wallet = await page.evaluate((costs) => {
        const controller = globalThis.__visController;
        return {
          amount: controller.session.state.elixir.sides.south.amount,
          hand: [...controller.session.state.decks.south.hand],
        };
      }, costsMap);
      if (wallet.hand.some((id) => costsById.get(id) > wallet.amount)) break;
      assert.ok(drainRounds < 4, "wallet drain must reach an insufficient state");
      drainRounds += 1;
      const target = wallet.hand.reduce((best, id) =>
        costsById.get(id) <= wallet.amount &&
        costsById.get(id) < costsById.get(best) ? id : best,
      wallet.hand.find((id) => costsById.get(id) <= wallet.amount));
      await page.click(`[data-ui="card-slot"][data-card-id="${target}"]`);
      await page.mouse.click(arenaBox.x + deployPoint.x, arenaBox.y + deployPoint.y);
      await page.evaluate(() => {
        globalThis.__visController.stepMany(1);
      });
    }

    // Select through the shipped input controller and inspect the live HUD
    // projection. No test-only HUD rebinding is allowed on this path.
    const selectionTarget = await page.evaluate((costs) => {
      const controller = globalThis.__visController;
      const amount = controller.session.state.elixir.sides.south.amount;
      return [...document.querySelectorAll('[data-ui="card-slot"]')]
        .map((node) => node.dataset.cardId)
        .find((id) => costs[id] <= amount);
    }, Object.fromEntries(costsById));
    assert.ok(selectionTarget, "an affordable card must remain to select");
    await page.click(`[data-ui="card-slot"][data-card-id="${selectionTarget}"]`);
    const selectionStyles = await page.evaluate((id) => {
      const controller = globalThis.__visController;
      const selectedCardId = controller.state.selectedCardId;
      if (selectedCardId !== id) {
        throw new TypeError(`input lost the selection: wanted ${id}, ` +
          `state has ${String(selectedCardId)}, slots ` +
          `${JSON.stringify([...document.querySelectorAll('[data-ui="card-slot"]')]
            .map((node) => node.dataset.cardId))}`);
      }
      const cards = [...document.querySelectorAll(
        '[data-ui="hud-hand"] .hud-card')];
      const pick = (node) => {
        const style = getComputedStyle(node);
        return { borderColor: style.borderColor, shadow: style.boxShadow };
      };
      const selectedNode = cards.find((node) => node.dataset.cardId === id);
      const otherNode = cards.find((node) => node.dataset.cardId !== id);
      return { other: pick(otherNode), selected: pick(selectedNode),
        flag: selectedNode.dataset.selected,
        domTick: controller.state.domTick,
        sessionTick: controller.state.sessionTick };
    }, selectionTarget);
    assert.equal(selectionStyles.flag, "true");
    assert.notDeepEqual(selectionStyles.selected, selectionStyles.other,
      "the selected card must render a distinct highlight");
    await page.screenshot({ path: `${ARTIFACTS}card-selected.png` });
    await page.mouse.click(arenaBox.x + 439, arenaBox.y + 529);
    await page.evaluate(() => {
      globalThis.__visController.stepMany(2);
    });
    await page.waitForFunction(() =>
      document.querySelectorAll(
        '[data-ui="hud-hand"] .hud-card[data-insufficient="true"]').length > 0,
    null, { polling: 50, timeout: 10_000 });
    const insufficient = await page.evaluate(() => ({
      amount: document.querySelector('[data-ui="hud-elixir"]').dataset.amount,
      disabledCount: document.querySelectorAll(
        '[data-ui="hud-hand"] .hud-card[data-disabled="true"]').length,
      insufficientCount: document.querySelectorAll(
        '[data-ui="hud-hand"] .hud-card[data-insufficient="true"]').length,
      domTick: globalThis.__visController.state.domTick,
      sessionTick: globalThis.__visController.state.sessionTick,
    }));
    assert.ok(insufficient.insufficientCount >= 1,
      "spending on an expensive card must disable cards above the wallet");
    assert.ok(insufficient.disabledCount >= insufficient.insufficientCount);
    await page.screenshot({ path: `${ARTIFACTS}insufficient-elixir.png` });

    // Leave one affordable card selected before terminal suspension. Restart
    // must mount a fresh session with no stale browser presentation state.
    const restartSelection = await page.evaluate((costs) => {
      const controller = globalThis.__visController;
      let amount = controller.session.state.elixir.sides.south.amount;
      let target;
      for (let index = 0; index < 20 && target === undefined; index += 1) {
        target = [...document.querySelectorAll('[data-ui="card-slot"]')]
          .map((node) => node.dataset.cardId)
          .find((id) => costs[id] <= amount);
        if (target === undefined) {
          controller.stepMany(60);
          amount = controller.session.state.elixir.sides.south.amount;
        }
      }
      return { amount, target };
    }, Object.fromEntries(costsById));
    assert.ok(restartSelection.target,
      "restart regression requires an affordable card to remain selectable");
    await page.click(
      `[data-ui="card-slot"][data-card-id="${restartSelection.target}"]`,
    );
    const selectedBeforeTerminal = await page.evaluate((id) => {
      const controller = globalThis.__visController;
      const selected = document.querySelector(
        `[data-ui="hud-hand"] .hud-card[data-card-id="${id}"]`,
      );
      return {
        flag: selected?.dataset.selected,
        selectedCardId: controller.state.selectedCardId,
        sessionTick: controller.state.sessionTick,
      };
    }, restartSelection.target);
    assert.equal(selectedBeforeTerminal.selectedCardId, restartSelection.target);
    assert.equal(selectedBeforeTerminal.flag, "true");

    const terminalReached = await page.evaluate(() => {
      const controller = globalThis.__visController;
      for (let index = 0; index < 40 && !controller.state.terminal; index += 1) {
        controller.fastForwardSegment(600);
      }
      return controller.state.terminal;
    });
    assert.equal(terminalReached, true);
    await page.waitForFunction(() =>
      document.querySelector(".match-feedback__overlay") !== null,
    null, { polling: 50, timeout: 10_000 });
    const winner = await page.evaluate(() => {
      const controller = globalThis.__visController;
      const overlay = document.querySelector(".match-feedback__overlay");
      const box = overlay.getBoundingClientRect();
      return {
        height: Math.round(box.height),
        kind: overlay.dataset.kind,
        domTick: controller.state.domTick,
        selectedCardId: controller.state.selectedCardId,
        sessionTick: controller.state.sessionTick,
        text: overlay.textContent,
        width: Math.round(box.width),
        winner: overlay.dataset.winner,
        restartHidden: document.querySelector('[data-ui="restart"]').hidden,
      };
    });
    assert.ok(winner.width > 200 && winner.height > 100);
    assert.match(winner.text, /wins|draw/i);
    assert.equal(winner.restartHidden, false);
    await page.screenshot({ path: `${ARTIFACTS}winner-overlay.png` });

    await page.click('[data-ui="restart"]');
    await page.waitForFunction(() =>
      globalThis.__visController.state.sessionTick === 0 &&
      document.querySelector('[data-ui="restart"]').hidden === true &&
      document.querySelector(".match-feedback__overlay") === null,
    null, { polling: 50, timeout: 10_000 });
    await page.screenshot({ path: `${ARTIFACTS}restart.png` });

    const restart = await page.evaluate(() => ({
      domTick: globalThis.__visController.state.domTick,
      selectedCardId: globalThis.__visController.state.selectedCardId,
      sessionTick: globalThis.__visController.state.sessionTick,
      terminal: globalThis.__visController.state.terminal,
    }));

    const finalText = await page.evaluate(() => document.body.innerText);
    assert.doesNotMatch(finalText, /debug|placeholder/i);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(unhandled, []);
    const screenshots = [...SCREENSHOTS];
    const screenshotHashes = Object.fromEntries(screenshots.map((name) =>
      [name, sha256(`${ARTIFACTS}${name}`)]));
    const screenshotDimensions = Object.fromEntries(screenshots.map((name) => {
      const image = decodePng(readFileSync(`${ARTIFACTS}${name}`));
      return [name, { height: image.height, width: image.width }];
    }));
    const stateHashes = {
      initial: digestValue(initial),
      insufficient: digestValue(insufficient),
      selected: digestValue(selectionStyles),
      restart: digestValue(restart),
      winner: digestValue(winner),
    };
    writeFileSync(`${ARTIFACTS}visual-interface-evidence.json`,
      `${JSON.stringify({
        consoleErrors,
        drainRounds,
        geometry,
        arenaMask: {
          policy: "Only moving combat/effect markers outside the card and HUD dimension are hidden",
          css: MOVING_WORLD_MASK_CSS,
          selectors: MOVING_WORLD_MASK_INVENTORY,
          regions: MOVING_WORLD_MASK_REGIONS,
        },
        bridgeVisibility: {
          computedStyles: bridgeStyles,
          ornamentRegions: BRIDGE_ORNAMENT_REGIONS,
          pixelEvidence: bridgePixels,
        },
        captureNormalization: {
          flags: [...CAPTURE_FLAGS],
          timing: "manual mode, fresh terminal session restored to tick 0, stepMany(60), document.fonts.ready, three requestAnimationFrames",
          comparison: "exact SHA-256 over 8-bit RGB screenshot pixels; no tolerance or HUD/card masks",
        },
        contactSheet,
        mutationProof: {
          briarThinMark: {
            image: "mutation-briar-thin.png",
            metrics: thinMutation.metrics["briar-band"],
            readable: readableCard(thinMutation.metrics["briar-band"]),
          },
          hudStyle: {
            image: "mutation-hud-style.png",
            comparison: hudDiff,
            mutation: "coilblade border-color changed to #c6452e",
          },
          bridgeOrnament: {
            changedPixelsInWestBefore: bridgeMutationPixels,
            comparison: bridgeDiff,
            image: "mutation-bridge-ornament.png",
            mutation: "west bridge ::before background changed to #c6452e and border to #e9a83a",
          },
        },
        maskInventory: MASKED_WORLD_TARGETS,
        screenshotHashes,
        screenshotDimensions,
        selectionTarget,
        initial,
        insufficient,
        selectionStyles,
        screenshots,
        stateHashes,
        restart,
        restartSelection,
        selectedBeforeTerminal,
        unhandled,
        winner,
      }, null, 2)}\n`);
  } finally {
    try { await browser?.close(); } catch {}
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await Promise.race([once(server, "exit"),
        new Promise((resolve) => setTimeout(resolve, 2_000))]);
    }
  }
});

test("visual interface art: four fresh Chrome captures are exact canonical evidence", {
  timeout: 420_000,
}, async () => {
  assert.ok(existsSync(PLAYWRIGHT), "installed Playwright equivalent is required");
  assert.ok(existsSync(CHROME), "installed Chrome is required");
  const runsRoot = mkdtempSync(tmpdir() + "/visual-003d-round-4-");
  const runs = [];
  for (let index = 0; index < 4; index += 1) {
    runs.push(await captureFreshRun(runsRoot + "/run-" + (index + 1)));
  }
  const canonicalHashes = Object.fromEntries(SCREENSHOTS.map((name) => {
    const hashes = runs.map((run) => run.screenshotHashes[name]);
    assert.equal(new Set(hashes).size, 1,
      name + " must be byte-identical across four fresh Chrome captures");
    return [name, hashes[0]];
  }));
  const stateHashRuns = Object.fromEntries(
    ["initial", "selected", "insufficient", "winner", "restart"].map((name) => {
      const hashes = runs.map((run) => run.stateHashes[name]);
      assert.equal(new Set(hashes).size, 1,
        name + " state metadata must be canonical across fresh captures");
      return [name, hashes];
    }),
  );
  for (const run of runs) {
    assert.equal(run.startTick, 60);
    for (const dimensions of Object.values(run.screenshotDimensions)) {
      assert.deepEqual(dimensions, { height: 1_280, width: 720 });
    }
  }
  // Promote capture 1 to the canonical five-state evidence set. This keeps
  // the committed images exactly equal to the hashes proved across all four
  // independent browser processes below.
  for (const name of SCREENSHOTS) {
    writeFileSync(
      ARTIFACTS + name,
      readFileSync(runsRoot + "/run-1/" + name),
    );
  }
  const evidencePath = ARTIFACTS + "visual-interface-evidence.json";
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  evidence.screenshotHashes = canonicalHashes;
  evidence.screenshotDimensions = runs[0].screenshotDimensions;
  evidence.independentRuns = runs.map((run, index) => ({
    bridgePixels: run.bridgePixels,
    capture: index + 1,
    drainRounds: run.drainRounds,
    screenshotDimensions: run.screenshotDimensions,
    screenshotHashes: run.screenshotHashes,
    selectionTarget: run.selectionTarget,
    startTick: run.startTick,
    stateHashes: run.stateHashes,
    states: run.states,
  }));
  evidence.canonicalHashes = canonicalHashes;
  evidence.stateHashRuns = stateHashRuns;
  evidence.independentCaptureCount = runs.length;
  evidence.captureRunStorage = "fresh browser processes captured in a temporary directory; only canonical top-level images are shipped";
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
});

async function collectState(page) {
  return page.evaluate(() => {
    const controller = globalThis.__visController;
    const hudCards = [...document.querySelectorAll(
      '[data-ui="hud-hand"] .hud-card')];
    const healthBars = [...document.querySelectorAll(
      ".combat-marker--tower .combat-health")].map((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    return {
      costTexts: hudCards.map((node) =>
        node.querySelector(".hud-card__cost")?.textContent ?? null),
      crowns: {
        north: document.querySelector('[data-ui="hud-crowns"]')?.dataset.north,
        south: document.querySelector('[data-ui="hud-crowns"]')?.dataset.south,
      },
      handIds: controller.session.state.decks.south.hand.slice(),
      nextId: controller.session.state.decks.south.queue[0],
      domTick: controller.state.domTick,
      selectedCardId: controller.state.selectedCardId,
      sessionTick: controller.state.sessionTick,
      timerText: document.querySelector('[data-ui="hud-timer"]').textContent,
      towerHealthBars: {
        count: healthBars.length,
        visible: healthBars.every(Boolean),
      },
    };
  });
}
