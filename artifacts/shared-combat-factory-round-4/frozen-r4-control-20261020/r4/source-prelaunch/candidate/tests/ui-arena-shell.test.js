import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ARENA_SHELL_PLAYFIELD,
  ARENA_SHELL_PROVENANCE,
  ARENA_SHELL_VIEWPORT,
  getArenaShellMarkup,
  mountArenaShell,
} from "../src/ui/arena-shell.js";
import { getArenaGeometry } from "../src/sim/arena-geometry.js";
import {
  admitVisualAssetManifestFromGraph,
  createVisualAssetManifest,
} from "../src/content/visual-asset-manifest.js";

const cssUrl = new URL("../src/ui/arena-shell.css", import.meta.url);
const entryUrl = new URL("../public/ui-arena-shell.html", import.meta.url);
const moduleUrl = new URL("../src/ui/arena-shell.js", import.meta.url);
const css = readFileSync(cssUrl, "utf8");
const html = readFileSync(entryUrl, "utf8");
const moduleSource = readFileSync(moduleUrl, "utf8");

const ARENA_TERRAIN_CSS_URL = "../../public/assets/moss-ember-arena-painted.webp";
const ARENA_TERRAIN_MANIFEST_PATH = "assets/moss-ember-arena-painted.webp";

function cssUrlValues(source) {
  return [...source.matchAll(/\burl\(([^)]*)\)/giu)].map(([, rawValue]) => {
    const value = rawValue.trim();
    const quote = value[0];
    if ((quote === "\"" || quote === "'") && value.at(-1) === quote) {
      return value.slice(1, -1);
    }
    return value;
  });
}

function assertCssUrlsPointToRegisteredLocalArt() {
  const urlValues = cssUrlValues(css);
  assert.deepEqual(urlValues, [ARENA_TERRAIN_CSS_URL],
    "the stylesheet may reference only the registered arena terrain asset");

  const manifest = admitVisualAssetManifestFromGraph(createVisualAssetManifest());
  const asset = manifest.assets.find(({ id }) => id === "moss-ember-arena-painted");
  assert.ok(asset, "the arena terrain must be registered in the canonical visual manifest");
  assert.equal(asset.path, ARENA_TERRAIN_MANIFEST_PATH);
  assert.equal(asset.kind, "image");
  assert.equal(asset.format, "webp");
  assert.equal(asset.authorship, "in-repo-authored");
  assert.equal(asset.license, "AGPL-3.0-only");

  const resolvedCssUrl = new URL(urlValues[0], cssUrl);
  const manifestAssetUrl = new URL(`../public/${asset.path}`, import.meta.url);
  assert.equal(resolvedCssUrl.protocol, "file:", "CSS art must stay local");
  assert.equal(resolvedCssUrl.search, "", "CSS art URLs may not add query parameters");
  assert.equal(resolvedCssUrl.hash, "", "CSS art URLs may not add fragments");
  assert.equal(resolvedCssUrl.href, manifestAssetUrl.href,
    "the CSS path must resolve to the exact manifest asset");

  const bytes = readFileSync(fileURLToPath(resolvedCssUrl));
  assert.equal(bytes.byteLength, asset.byteLength, asset.path);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256, asset.path);
}

function occurrences(value, needle) {
  return value.split(needle).length - 1;
}

function percentageFor(value, extent) {
  return `${(value / extent * 100).toFixed(6)}%`;
}

test("ui arena shell: fixed viewport and every required primitive are complete", () => {
  const markup = getArenaShellMarkup();
  assert.deepEqual(ARENA_SHELL_VIEWPORT, { width: 720, height: 1280 });
  assert.match(css, /width: 720px;\n  height: 1280px;/);
  assert.equal(occurrences(markup, 'data-ui="arena"'), 1);
  assert.equal(occurrences(markup, 'data-ui="river"'), 1);
  assert.equal(occurrences(markup, 'data-ui="bridge"'), 2);
  assert.equal(occurrences(markup, 'data-ui="tower-pad"'), 6);
  assert.equal(occurrences(markup, 'data-ui="opponent-hud"'), 1);
  assert.equal(occurrences(markup, 'data-ui="player-hud"'), 1);
  assert.equal(occurrences(markup, 'data-ui="hand-tray"'), 1);
  assert.equal(occurrences(markup, 'data-ui="card-slot"'), 4);
  assert.equal(occurrences(markup, 'data-ui="next-card"'), 1);
  assert.equal(occurrences(markup, 'data-ui="timer"'), 1);
  assert.equal(occurrences(markup, 'data-ui="elixir-rail"'), 1);
  assert.equal(occurrences(markup, 'data-ui="audio-toggle"'), 1);
  assert.equal(occurrences(markup, 'data-ui="deck-choice-open"'), 1);
  assert.equal(occurrences(markup, 'data-ui="deck-choice"'), 1);
  assert.equal(occurrences(markup, 'data-deck-choice="standard"'), 1);
  assert.equal(occurrences(markup, 'data-deck-choice="stonehauler"'), 1);
  assert.equal(occurrences(markup, 'data-deck-choice="bulwark-needle"'), 1);
  assert.equal(occurrences(markup, 'data-ui="deck-start"'), 1);
  assert.equal(occurrences(markup, 'data-ui="restart"'), 1);
  assert.equal(occurrences(markup, "<i></i>"), 30);
});

test("ui arena shell: nominal playfield is an exact square-tile inner coordinate box", () => {
  assert.deepEqual(ARENA_SHELL_PLAYFIELD, {
    left: 90,
    top: 108,
    width: 540,
    height: 960,
    columns: 18,
    rows: 32,
    tileWidth: 30,
    tileHeight: 30,
  });
  assert.equal(
    ARENA_SHELL_PLAYFIELD.width / ARENA_SHELL_PLAYFIELD.columns,
    ARENA_SHELL_PLAYFIELD.tileWidth,
  );
  assert.equal(
    ARENA_SHELL_PLAYFIELD.height / ARENA_SHELL_PLAYFIELD.rows,
    ARENA_SHELL_PLAYFIELD.tileHeight,
  );
  assert.equal(
    ARENA_SHELL_PLAYFIELD.tileWidth,
    ARENA_SHELL_PLAYFIELD.tileHeight,
  );
  assert.match(css, /box-sizing: content-box;/);
  assert.match(
    css,
    /left: calc\(var\(--arena-left\) - var\(--arena-border\)\);/,
  );
  assert.match(
    css,
    /top: calc\(var\(--arena-top\) - var\(--arena-border\)\);/,
  );
  assert.match(css, /border: var\(--arena-border\) solid #687d67;/);
});

test("ui arena shell: authored percentages project centralized arena geometry", () => {
  const geometry = getArenaGeometry();
  const width = geometry.bounds.maxX;
  const height = geometry.bounds.maxY;
  assert.ok(css.includes(`top: ${percentageFor(geometry.river.minY, height)};`));
  assert.ok(css.includes(`height: ${percentageFor(geometry.river.maxY - geometry.river.minY, height)};`));

  for (const bridge of geometry.bridges) {
    assert.ok(css.includes(`left: ${percentageFor(bridge.bounds.minX, width)};`));
  }
  for (const tower of geometry.towers) {
    assert.ok(css.includes(`left: ${percentageFor(tower.bounds.minX, width)};`));
    const screenTop = height - tower.bounds.maxY;
    assert.ok(css.includes(`top: ${percentageFor(screenTop, height)};`));
    assert.ok(css.includes(`width: ${percentageFor(tower.bounds.maxX - tower.bounds.minX, width)};`));
    assert.ok(css.includes(`height: ${percentageFor(tower.bounds.maxY - tower.bounds.minY, height)};`));
  }
});

test("ui arena shell: canonical markup and source bytes are stable", () => {
  const first = getArenaShellMarkup();
  const second = getArenaShellMarkup();
  assert.equal(first, second);
  assert.equal(
    createHash("sha256").update(first).digest("hex"),
    "51dd05f9eea755f24e9db13e676e681fce67e189a6327e209310aa14ff17a680",
  );
  assert.equal(
    createHash("sha256").update(css).digest("hex"),
    "f3daa8659e1ac6ccbaeadd9017a3f8f30e5b8e065a7d5bcdabec81291860978e",
  );
  assert.match(css,
    /\.card-slot\s*\{[^}]*transform:\s*translateZ\(0\);/su,
    "card-slot has a stable compositor layer for exact scaled HUD restore");
});

test("ui arena shell: provenance is local primitives with no external assets", () => {
  assert.deepEqual(ARENA_SHELL_PROVENANCE, {
    kind: "original-authored-primitives",
    externalAssets: [],
    calibration: "uncalibrated-no-licensed-reference-still",
  });
  const shippedSources = `${html}\n${css}\n${moduleSource}`;
  assert.doesNotMatch(shippedSources, /(?:https?:|data:|blob:|reference\/)/i);
  assert.doesNotMatch(`${html}\n${moduleSource}`,
    /\.(?:png|jpe?g|gif|webp|avif|svg|mp[34]|wav|ogg)\b/i);
  assert.doesNotMatch(css.replace(/\burl\(([^)]*)\)/giu, ""),
    /\.(?:png|jpe?g|gif|webp|avif|svg|mp[34]|wav|ogg)\b/i,
    "the CSS may not reference other static assets outside url() declarations");
  assertCssUrlsPointToRegisteredLocalArt();
  assert.match(html, /src="\.\.\/src\/ui\/arena-shell-entry\.js"/);
  assert.match(html, /href="\.\.\/src\/ui\/arena-shell\.css"/);
});

test("ui arena shell: entry is static and contains no nondeterministic APIs", () => {
  const sources = `${html}\n${css}\n${moduleSource}`;
  assert.doesNotMatch(
    sources,
    /\b(?:Date|Math\.random|crypto\.randomUUID|setTimeout|setInterval|fetch|XMLHttpRequest|WebSocket|EventSource)\b/,
  );
  assert.doesNotMatch(html, /on(?:click|load|error|pointer|mouse|touch|key)\s*=/i);
});

test("ui arena shell: hostile mount targets reject before mutation", () => {
  for (const value of [null, undefined, 0, "", [], {}, { replaceChildren() {} }]) {
    assert.throws(() => mountArenaShell(value), {
      name: "TypeError",
      message: "arena shell target must be a DOM element",
    });
  }

  let mutated = false;
  const target = {
    replaceChildren() {
      mutated = true;
    },
    ownerDocument: null,
  };
  assert.throws(() => mountArenaShell(target), TypeError);
  assert.equal(mutated, false);
});
