import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import test from "node:test";

import {
  ARENA_SHELL_PLAYFIELD,
  getArenaShellMarkup,
} from "../src/ui/arena-shell.js";
import {
  ARENA_LENGTH_MILLITILES,
  ARENA_WIDTH_MILLITILES,
  getArenaGeometry,
} from "../src/sim/arena-geometry.js";
import {
  admitVisualAssetManifestFromGraph,
  createVisualAssetManifest,
} from "../src/content/visual-asset-manifest.js";

const ROOT = new URL("..", import.meta.url).pathname;
const HTML_PATH = `${ROOT}public/ui-arena-shell.html`;
const CSS_PATH = `${ROOT}src/ui/arena-shell.css`;
const ASSETS_DISK_ROOT = `${ROOT}public/assets`;
const ARTIFACTS = new URL("../artifacts/visual-003b-round-1/", import.meta.url).pathname;

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function listFilesRecursively(rootDirectory) {
  const found = [];
  const visit = (absolute, relative) => {
    for (const entry of readdirSync(absolute).sort()) {
      if (entry === ".DS_Store") continue;
      const entryAbsolute = `${absolute}/${entry}`;
      if (statSync(entryAbsolute).isDirectory()) {
        visit(entryAbsolute, relative ? `${relative}/${entry}` : entry);
      } else {
        found.push({
          absolute: entryAbsolute,
          manifestPath: `assets/${relative ? `${relative}/` : ""}${entry}`,
        });
      }
    }
  };
  visit(rootDirectory, "");
  return found;
}

function expectedClientRect(bounds) {
  const pixelsPerMillitileX = ARENA_SHELL_PLAYFIELD.width / ARENA_WIDTH_MILLITILES;
  const pixelsPerMillitileY = ARENA_SHELL_PLAYFIELD.height / ARENA_LENGTH_MILLITILES;
  return {
    x: ARENA_SHELL_PLAYFIELD.left + bounds.minX * pixelsPerMillitileX,
    y: ARENA_SHELL_PLAYFIELD.top +
      (ARENA_LENGTH_MILLITILES - bounds.maxY) * pixelsPerMillitileY,
    width: (bounds.maxX - bounds.minX) * pixelsPerMillitileX,
    height: (bounds.maxY - bounds.minY) * pixelsPerMillitileY,
  };
}

function assertRectMatches(actual, expected, label) {
  for (const field of ["x", "y", "width", "height"]) {
    assert.ok(
      Math.abs(actual[field] - expected[field]) <= 1,
      `${label}.${field}: rendered ${actual[field]} vs expected ${expected[field]}`,
    );
  }
}

const html = readFileSync(HTML_PATH, "utf8");
const css = readFileSync(CSS_PATH, "utf8");

test("visual arena art: required production art layers ship in the shell page", () => {
  const styleStart = html.indexOf('<style id="arena-production-art">');
  const styleEnd = html.indexOf("</style>", styleStart);
  assert.ok(styleStart >= 0 && styleEnd > styleStart, "art style block must exist");
  const art = html.slice(styleStart, styleEnd);
  assert.match(art, /\.arena \{/, "ground treatment must restyle the playfield");
  assert.match(art, /\.arena::before/, "depth-cue rim layer must exist");
  assert.match(art, /\.river::before/, "river surface detail must exist");
  assert.match(art, /\.bridge i:first-child/, "bridge plank detail must exist");
  assert.match(art, /box-shadow: 8px 10px 0/, "hard cel drop shadows must exist");
  assert.doesNotMatch(html, /@keyframes|animation\s*:|transition\s*:/);
});

test("visual arena art: tower bodies exist for all six towers with distinct faction styling", () => {
  const geometry = getArenaGeometry();
  const towerClasses = new Set(geometry.towers.map(({ side, role, lane }) =>
    lane === undefined ? `.tower-pad--${side}-central` : `.tower-pad--${side}-${lane}`));
  for (const towerClass of towerClasses) {
    assert.ok(html.includes(`${towerClass}::before`) || html.includes(`${towerClass} i`),
      `missing authored tower body for ${towerClass}`);
  }
  const styleStart = html.indexOf('<style id="arena-production-art">');
  const styleEnd = html.indexOf("</style>", styleStart);
  const artSource = html.slice(styleStart, styleEnd);
  const art = artSource.toUpperCase();
  const emberPalette = ["#C6452E", "#E9A83A", "#4A332A"];
  const tidePalette = ["#2E7F86", "#16324F", "#DCEDE9"];
  for (const hex of emberPalette) {
    assert.ok(art.includes(hex), `emberfall palette missing ${hex}`);
  }
  for (const hex of tidePalette) {
    assert.ok(art.includes(hex), `tidewarden palette missing ${hex}`);
  }
  const northRule = artSource.indexOf(".tower-pad--north-west");
  const southRule = artSource.indexOf(".tower-pad--south-west");
  const northBlock = art.slice(northRule, southRule);
  const southBlock = art.slice(southRule);
  assert.ok(emberPalette.some((hex) => northBlock.includes(hex)) &&
    !southBlock.includes("#C6452E"),
    "north towers must be emberfall-styled, not tidewarden");
  assert.ok(tidePalette.some((hex) => southBlock.includes(hex)) &&
    !northBlock.includes("#2E7F86"),
    "south towers must be tidewarden-styled, not emberfall");
});

test("visual arena art: rendered landmarks keep the exact gameplay geometry mapping", () => {
  const geometry = getArenaGeometry();
  const pixelsPerMillitileX = ARENA_SHELL_PLAYFIELD.width / ARENA_WIDTH_MILLITILES;
  const pixelsPerMillitileY = ARENA_SHELL_PLAYFIELD.height / ARENA_LENGTH_MILLITILES;
  assert.equal(pixelsPerMillitileX, ARENA_SHELL_PLAYFIELD.tileWidth / 1000);
  assert.equal(pixelsPerMillitileY, ARENA_SHELL_PLAYFIELD.tileHeight / 1000);
  assert.equal(pixelsPerMillitileX, pixelsPerMillitileY);

  const percentageFor = (value, extent) => `${(value / extent * 100).toFixed(6)}%`;
  const width = geometry.bounds.maxX;
  const height = geometry.bounds.maxY;
  assert.ok(css.includes(`top: ${percentageFor(geometry.river.minY, height)};`));
  for (const bridge of geometry.bridges) {
    assert.ok(css.includes(`left: ${percentageFor(bridge.bounds.minX, width)};`));
  }
  for (const tower of geometry.towers) {
    assert.ok(css.includes(`left: ${percentageFor(tower.bounds.minX, width)};`));
    assert.ok(css.includes(`top: ${percentageFor(height - tower.bounds.maxY, height)};`));
  }
});

test("visual arena art: pinned shell primitives are untouched and art stays inside provenance rules", () => {
  assert.equal(
    sha256(Buffer.from(getArenaShellMarkup())),
    "51dd05f9eea755f24e9db13e676e681fce67e189a6327e209310aa14ff17a680",
  );
  assert.equal(sha256(css),
    "913e4ac772c5d481cabb74e944e892b2fc12b738cb755caa92c4b08425d94802");
  assert.doesNotMatch(html, /(?:https?:|blob:|url\s*\(|reference\/)/i);
  assert.doesNotMatch(html, /\.(?:png|jpe?g|gif|webp|avif|svg|mp[34]|wav|ogg)\b/i);
  assert.match(html, /src="\.\.\/src\/ui\/arena-shell-entry\.js"/);
  assert.doesNotMatch(html, /<script(?![^>]*src=)/);
});

test("visual arena art: shipped asset directory stays manifest-registered", () => {
  const manifest = admitVisualAssetManifestFromGraph(createVisualAssetManifest());
  const disk = listFilesRecursively(ASSETS_DISK_ROOT);
  const registered = new Map(manifest.assets.map((asset) => [asset.path, asset]));
  assert.equal(disk.length, manifest.assets.length);
  for (const file of disk) {
    const entry = registered.get(file.manifestPath);
    assert.ok(entry, `unregistered shipped asset: ${file.manifestPath}`);
    const bytes = readFileSync(file.absolute);
    assert.equal(bytes.byteLength, entry.byteLength, file.manifestPath);
    assert.equal(sha256(bytes), entry.sha256, file.manifestPath);
  }
});

test("visual arena art: fixed 720×1280 Chrome render keeps gameplay geometry above production art", {
  timeout: 300_000,
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
    const ready = JSON.parse(await (async () => {
      let text = "";
      server.stdout.setEncoding("utf8");
      for await (const chunk of server.stdout) {
        text += chunk;
        const end = text.indexOf("\n");
        if (end >= 0) return text.slice(0, end);
      }
      throw new Error("journey server exited before readiness");
    })());
    const { chromium } = await import(PLAYWRIGHT);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const context = await browser.newContext({ deviceScaleFactor: 1,
      viewport: { height: 1_280, width: 720 } });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => unhandled.push(String(error)));
    const response = await page.goto(
      `http://${ready.host}:${ready.port}/public/ui-arena-shell.html`,
      { waitUntil: "domcontentloaded" },
    );
    assert.equal(response.status(), 200);
    await page.waitForSelector('[data-ui="arena"]');
    await page.waitForSelector('[data-ui="tower-pad"]');

    const geometry = getArenaGeometry();
    const landmarkSelectors = [
      ...geometry.bridges.map((bridge) => [`bridge-${bridge.lane}`, `[data-ui="bridge"][data-lane="${bridge.lane}"]`, bridge.bounds]),
      ...geometry.towers.map((tower) => [
        tower.lane === undefined ? `tower-${tower.side}-central`
          : `tower-${tower.side}-lane-${tower.lane}`,
        `[data-ui="tower-pad"][data-side="${tower.side}"][data-role="${tower.role}"]${
          tower.lane === undefined ? "" : `[data-lane="${tower.lane}"]`}`,
        tower.bounds,
      ]),
    ];
    const rects = {};
    for (const [label, selector] of landmarkSelectors) {
      rects[label] = await page.locator(selector).first().boundingBox();
      assert.ok(rects[label], `${label} must render`);
    }
    for (const [label, , bounds] of landmarkSelectors) {
      assertRectMatches(rects[label], expectedClientRect(bounds), label);
    }
    const towerArt = await page.locator('[data-ui="tower-pad"]').evaluateAll((towers) =>
      towers.map((tower) => ({
        classes: tower.className,
        side: tower.dataset.side,
        layers: ["::before", "::after"].map((pseudo) => {
          const style = getComputedStyle(tower, pseudo);
          return { pseudo, content: style.content, display: style.display,
            visibility: style.visibility, opacity: style.opacity,
            left: Number.parseFloat(style.left), top: Number.parseFloat(style.top),
            width: Number.parseFloat(style.width), height: Number.parseFloat(style.height) };
        }),
      })));
    assert.equal(towerArt.length, 6, "all six authored towers must render");
    for (const tower of towerArt) {
      for (const layer of tower.layers) {
        assert.ok(!["none", "normal"].includes(layer.content) &&
          layer.display !== "none" && layer.visibility === "visible" &&
          Number(layer.opacity) > 0 && layer.width > 0 && layer.height > 0,
        `${tower.classes}${layer.pseudo} must generate visible tower art: ${JSON.stringify(layer)}`);
      }
      if (tower.side === "north") {
        const [body, roof] = tower.layers;
        assert.ok(roof.width > body.width && roof.height >= body.height / 2 &&
          roof.left < body.left && roof.left + roof.width > body.left + body.width &&
          roof.top < body.top && roof.top + roof.height > body.top &&
          roof.top + roof.height < body.top + body.height / 2,
        `${tower.classes} roof must span and overlap the upper body while leaving the wall visible`);
      }
    }

    await page.click('[data-ui="audio-toggle"]');
    await page.evaluate(async () => {
      const controller =
        (await import("/src/ui/arena-shell-entry.js")).arenaHudController;
      controller.enterManualStepMode();
    });
    await page.screenshot({ path: `${ARTIFACTS}initial.png` });

    await page.click('[data-ui="card-slot"][data-card-id]');
    const arenaBox = await page.locator('[data-ui="arena"]').boundingBox();
    await page.mouse.click(arenaBox.x + 439, arenaBox.y + 529);
    await page.evaluate(async () => {
      const controller =
        (await import("/src/ui/arena-shell-entry.js")).arenaHudController;
      controller.stepMany(240);
    });

    const combatProbe = await page.evaluate(() => {
      const marker = document.querySelector(
        ".combat-marker--entity-ground,.combat-marker--entity-air");
      if (!marker) return null;
      const box = marker.getBoundingClientRect();
      const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const layerZ = (selector) => {
        const node = document.querySelector(selector);
        return node ? Number(getComputedStyle(node).zIndex) : null;
      };
      return {
        markerZ: Number(getComputedStyle(marker).zIndex),
        towerPadZ: layerZ('[data-ui="tower-pad"]'),
        riverZ: layerZ('[data-ui="river"]'),
        markerBox: { height: box.height, width: box.width, x: box.x, y: box.y },
        x: Number(marker.style.getPropertyValue("--combat-x")),
        y: Number(marker.style.getPropertyValue("--combat-y")),
      };
    });
    assert.ok(combatProbe, "deployed unit marker must be visible over the art");
    assert.ok(combatProbe.markerZ > combatProbe.towerPadZ &&
      combatProbe.towerPadZ > combatProbe.riverZ,
      `unexpected z order ${JSON.stringify(combatProbe)}`);
    const expectedMarker = {
      x: ARENA_SHELL_PLAYFIELD.left +
        combatProbe.x * (ARENA_SHELL_PLAYFIELD.width / ARENA_WIDTH_MILLITILES),
      y: ARENA_SHELL_PLAYFIELD.top + combatProbe.y *
        (ARENA_SHELL_PLAYFIELD.height / ARENA_LENGTH_MILLITILES),
    };
    assert.ok(Math.abs(combatProbe.markerBox.x + combatProbe.markerBox.width / 2 - expectedMarker.x) <= 2 &&
      Math.abs(combatProbe.markerBox.y + combatProbe.markerBox.height / 2 - expectedMarker.y) <= 2,
      `marker pixel mapping drifted: ${JSON.stringify({
        box: combatProbe.markerBox, expectedMarker })}`);

    await page.screenshot({ path: `${ARTIFACTS}mid-combat.png` });
    writeFileSync(`${ARTIFACTS}render-probe.json`, `${JSON.stringify({
      combatProbe,
      landmarks: rects,
      towerArt,
    }, null, 2)}\n`);

    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(unhandled, []);
  } finally {
    try { await browser?.close(); } catch {}
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await Promise.race([once(server, "exit"),
        new Promise((resolve) => setTimeout(resolve, 2_000))]);
    }
  }
});
