import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ARENA_SHELL_PLAYFIELD,
  ARENA_SHELL_PROVENANCE,
  ARENA_SHELL_VIEWPORT,
  getArenaShellMarkup,
  mountArenaShell,
} from "../src/ui/arena-shell.js";
import { getArenaGeometry } from "../src/sim/arena-geometry.js";

const cssUrl = new URL("../src/ui/arena-shell.css", import.meta.url);
const entryUrl = new URL("../public/ui-arena-shell.html", import.meta.url);
const moduleUrl = new URL("../src/ui/arena-shell.js", import.meta.url);
const css = readFileSync(cssUrl, "utf8");
const html = readFileSync(entryUrl, "utf8");
const moduleSource = readFileSync(moduleUrl, "utf8");

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
    "4cbc0f14cc874845e02c64bb779cc2b85b3549a1851c0371af436de23249ea44",
  );
});

test("ui arena shell: provenance is local primitives with no external assets", () => {
  assert.deepEqual(ARENA_SHELL_PROVENANCE, {
    kind: "original-authored-primitives",
    externalAssets: [],
    calibration: "uncalibrated-no-licensed-reference-still",
  });
  const shippedSources = `${html}\n${css}\n${moduleSource}`;
  assert.doesNotMatch(shippedSources, /(?:https?:|data:|blob:|url\s*\(|reference\/)/i);
  assert.doesNotMatch(shippedSources, /\.(?:png|jpe?g|gif|webp|avif|svg|mp[34]|wav|ogg)\b/i);
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
