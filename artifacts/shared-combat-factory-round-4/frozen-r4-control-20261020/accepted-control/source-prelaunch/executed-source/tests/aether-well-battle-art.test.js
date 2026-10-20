import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  AETHER_WELL_TEAM_COLORS,
  createAetherWellBattleArt,
} from "../src/ui/aether-well-art.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

test("the native well silhouette measures exactly 13 and 26 CSS pixels", () => {
  for (const bodyCssPixels of [13, 26]) {
    const art = createAetherWellBattleArt(fakeDocument(), { bodyCssPixels, side: "south" });
    const frameCssPixels = Number.parseFloat(art.style.height);
    const visibleBodyCssPixels = frameCssPixels * (25.425 / 32);

    assert.equal(art.name, "svg");
    assert.equal(art.getAttribute("viewBox"), "0 0 32 32");
    assert.equal(art.dataset.artId, "aether-well");
    assert.equal(art.dataset.renderer, "native-svg");
    assert.equal(art.dataset.bodyCssPixels, String(bodyCssPixels));
    assert.equal(art.dataset.bodyBoundsUnits, "2.575:28");
    assert.ok(Math.abs(visibleBodyCssPixels - bodyCssPixels) < 1e-12);
  }
});

test("fixed inputs rebuild the same static SVG tree without raster assets", () => {
  const first = createAetherWellBattleArt(fakeDocument(), { bodyCssPixels: 13, side: "north" });
  const again = createAetherWellBattleArt(fakeDocument(), { bodyCssPixels: 13, side: "north" });
  const parts = descendants(first, (element) => element.dataset.part)
    .map((element) => element.dataset.part);

  assert.deepEqual(serialize(first), serialize(again));
  assert.equal(first.dataset.motion, "static");
  assert.equal(descendants(first, (element) => element.name === "image").length, 0);
  assert.equal(descendants(first, (element) => element.name === "animate").length, 0);
  for (const part of [
    "rootwood-uprights", "rootwood-crossbeam", "copper-crank", "chain",
    "copper-scoop", "stone-well-body", "copper-basin-rim", "still-water",
    "emberseed-center", "team-ring", "team-badge",
  ]) {
    assert.ok(parts.includes(part), `missing Aether Well silhouette part: ${part}`);
  }
});

test("north and south use distinct visible team colors", () => {
  const north = createAetherWellBattleArt(fakeDocument(), { side: "north" });
  const south = createAetherWellBattleArt(fakeDocument(), { side: "south" });
  const northBadge = descendants(north, (element) => element.dataset.part === "team-badge")[0];
  const southBadge = descendants(south, (element) => element.dataset.part === "team-badge")[0];

  assert.deepEqual(AETHER_WELL_TEAM_COLORS, { north: "#C6452E", south: "#2E7F86" });
  assert.equal(north.dataset.teamColor, AETHER_WELL_TEAM_COLORS.north);
  assert.equal(south.dataset.teamColor, AETHER_WELL_TEAM_COLORS.south);
  assert.equal(northBadge.getAttribute("fill"), AETHER_WELL_TEAM_COLORS.north);
  assert.equal(southBadge.getAttribute("fill"), AETHER_WELL_TEAM_COLORS.south);
});

test("the helper rejects invalid body sizes, teams, and document objects", () => {
  for (const bodyCssPixels of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => createAetherWellBattleArt(fakeDocument(), { bodyCssPixels }), RangeError);
  }
  for (const side of ["east", "west", null]) {
    assert.throws(() => createAetherWellBattleArt(fakeDocument(), { side }), RangeError);
  }
  assert.throws(() => createAetherWellBattleArt(null), TypeError);
});

test("the fixture uses the shipped 720 by 1280 shell and 540 by 960 arena", async () => {
  const [html, script] = await Promise.all([
    read("demo/aether-well-battle-art.html"),
    read("demo/aether-well-battle-art.js"),
  ]);

  assert.match(html, /width:\s*720px/u);
  assert.match(html, /height:\s*1280px/u);
  assert.match(html, /\.battle-shell\s*\{[^}]*position:\s*absolute/u);
  assert.match(html, /width:\s*540px/u);
  assert.match(html, /height:\s*960px/u);
  assert.match(html, /moss-ember-arena-painted\.webp/u);
  assert.match(script, /bodyCssPixels:\s*bodyTargetCssPixels\s*\/\s*scale/u);
  assert.ok(script.includes("window.innerWidth - SHELL_WIDTH * scale"));
  assert.ok(script.includes("window.innerHeight - SHELL_HEIGHT * scale"));
  assert.match(script, /\["north",\s*270,\s*300\]/u);
  assert.match(script, /\["south",\s*270,\s*660\]/u);
  assert.match(script, /bodyTargetCssPixels\s*!==\s*13\s*&&\s*bodyTargetCssPixels\s*!==\s*26/u);
  assert.match(script, /window\.addEventListener\("resize",\s*render/u);
  assert.doesNotMatch(script, /Math\.random|Date\.now|setInterval/u);
});

async function read(path) {
  return readFile(resolve(ROOT, path), "utf8");
}

function fakeDocument() {
  return {
    createElementNS(namespace, name) {
      assert.equal(namespace, "http://www.w3.org/2000/svg");
      return new FakeNode(name);
    },
  };
}

class FakeNode {
  constructor(name) {
    this.name = name;
    this.attributes = new Map();
    this.childNodes = [];
    this.dataset = {};
    this.style = {};
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  appendChild(child) { this.childNodes.push(child); return child; }
}

function descendants(element, predicate) {
  return [
    ...(predicate(element) ? [element] : []),
    ...element.childNodes.flatMap((child) => descendants(child, predicate)),
  ];
}

function serialize(element) {
  return {
    name: element.name,
    attributes: [...element.attributes],
    dataset: { ...element.dataset },
    style: { ...element.style },
    children: element.childNodes.map(serialize),
  };
}
