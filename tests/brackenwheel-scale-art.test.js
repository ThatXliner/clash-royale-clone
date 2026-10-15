import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createVisualAssetManifest } from "../src/content/visual-asset-manifest.js";
import { createBrackenwheelScaleArt } from "../src/ui/brackenwheel-art.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PAINTED_IMAGE_URL = new URL(
  "../public/assets/brackenwheel-battle-sprite.webp",
  import.meta.url,
).href;

test("native SVG is selected below 26 body CSS pixels with deterministic sizing", () => {
  for (const bodyCssPixels of [13, 25.999]) {
    const first = createBrackenwheelScaleArt(fakeDocument(), { bodyCssPixels });
    const again = createBrackenwheelScaleArt(fakeDocument(), { bodyCssPixels });
    const expectedFrame = bodyCssPixels * (32 / 28.4);

    assert.equal(first.name, "svg");
    assert.equal(first.dataset.artId, "brackenwheel");
    assert.equal(first.dataset.renderer, "native-svg");
    assert.equal(first.dataset.bodyCssPixels, String(bodyCssPixels));
    assert.equal(first.getAttribute("viewBox"), "0 0 32 32");
    assert.equal(first.style.height, `${expectedFrame}px`);
    assert.deepEqual(serialize(first), serialize(again));
    assert.equal(descendants(first, (node) => node.name === "image").length, 0);
  }
});

test("the exact 26-pixel threshold uses the original frozen painted WebP", () => {
  for (const bodyCssPixels of [26, 26.001]) {
    const art = createBrackenwheelScaleArt(fakeDocument(), { bodyCssPixels });
    const expectedFrame = bodyCssPixels / (501 / 512);

    assert.equal(art.name, "img");
    assert.equal(art.dataset.renderer, "painted-webp");
    assert.equal(art.dataset.source, "frozen-painted-cutout");
    assert.equal(art.getAttribute("src"), PAINTED_IMAGE_URL);
    assert.equal(art.getAttribute("alt"), "");
    assert.equal(art.style.width, `${expectedFrame}px`);
    assert.equal(art.style.height, `${expectedFrame}px`);
  }
});

test("native SVG exposes the character-family parts and an open sickle", () => {
  const art = createBrackenwheelScaleArt(fakeDocument(), { bodyCssPixels: 13 });
  const parts = descendants(art, (node) => node.dataset.part).map((node) => node.dataset.part);
  const hook = descendants(art, (node) => node.dataset.part === "hook-blade")[0];

  for (const part of ["hair", "face", "apron", "sickle", "feet", "left-boot", "right-boot"]) {
    assert.ok(parts.includes(part), `missing native Brackenwheel part: ${part}`);
  }
  assert.equal(hook.dataset.openSide, "right");
  assert.equal(hook.getAttribute("fill"), "none");
  assert.equal(hook.getAttribute("stroke-width"), "4.4");
  assert.equal(hook.getAttribute("stroke-linecap"), "butt");
  assert.equal(hook.getAttribute("d").includes("Z"), false,
    "the C-shaped blade path stays open instead of closing across its mouth");
});

test("boot paths keep a visible horizontal gap after their outlines", () => {
  const art = createBrackenwheelScaleArt(fakeDocument(), { bodyCssPixels: 13 });
  const left = descendants(art, (node) => node.dataset.part === "left-boot")[0];
  const right = descendants(art, (node) => node.dataset.part === "right-boot")[0];
  const leftMax = Math.max(...pathXCoordinates(left.getAttribute("d"))) + 0.6;
  const rightMin = Math.min(...pathXCoordinates(right.getAttribute("d"))) - 0.6;

  assert.ok(rightMin - leftMax >= 1,
    `expected at least one SVG unit of clear separation, got ${rightMin - leftMax}`);
});

test("renderer rejects invalid sizes and requires a DOM document", () => {
  for (const bodyCssPixels of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => createBrackenwheelScaleArt(fakeDocument(), { bodyCssPixels }), RangeError);
  }
  assert.throws(() => createBrackenwheelScaleArt(null, { bodyCssPixels: 13 }), TypeError);
});

test("the frozen source, shipped output, and manifest record retain their exact values", async () => {
  const sourcePath = joinPath("demo/assets/brackenwheel-battle-sprite.png");
  const outputPath = joinPath("public/assets/brackenwheel-battle-sprite.webp");
  const source = await readFile(sourcePath);
  const output = await readFile(outputPath);
  const manifestEntry = createVisualAssetManifest().assets.find(
    (asset) => asset.id === "brackenwheel-battle-sprite",
  );

  assert.equal(createHash("sha256").update(source).digest("hex"),
    "699d28064446b7fd17d5acaba45fdabcbf91f6ffde82252cd39ff294b792dc35");
  assert.equal(createHash("sha256").update(output).digest("hex"),
    "440ef5d41aa289c8701151ad36916e0cdce1ce3bcfb2996852c0dc3d10d4621c");
  assert.equal((await stat(sourcePath)).size, 996149);
  assert.equal((await stat(outputPath)).size, 49440);
  assert.deepEqual(manifestEntry, {
    authorship: "in-repo-authored",
    byteLength: 49440,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "brackenwheel-battle-sprite",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/brackenwheel-battle-sprite.webp",
    sha256: "440ef5d41aa289c8701151ad36916e0cdce1ce3bcfb2996852c0dc3d10d4621c",
  });
});

function joinPath(path) {
  return resolve(ROOT, ...path.split("/"));
}

function fakeDocument() {
  return {
    createElement(name) { return new FakeNode(name); },
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

function descendants(node, predicate) {
  return [
    ...(predicate(node) ? [node] : []),
    ...node.childNodes.flatMap((child) => descendants(child, predicate)),
  ];
}

function serialize(node) {
  return {
    name: node.name,
    attributes: [...node.attributes],
    dataset: { ...node.dataset },
    style: { ...node.style },
    children: node.childNodes.map(serialize),
  };
}

function pathXCoordinates(path) {
  const numbers = path.match(/-?\d+(?:\.\d+)?/gu).map(Number);
  return numbers.filter((_number, index) => index % 2 === 0);
}
