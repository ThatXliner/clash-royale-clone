import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import {
  createSkymaulBattleArt,
  getSkymaulBattleFrame,
  updateSkymaulBattleArt,
} from "../src/ui/skymaul-battle-sprite.js";

const EXPECTED_ATLAS_SHA256 =
  "e6c02d3a0ce4634f060f508cca00f72a729551805536dc0a80930a74bf7b3fcb";
const DIRECTIONS = ["east", "north", "south", "west"];
const ACTIONS = ["idle", "walk", "contact"];
const EXPECTED_COLUMNS = { east: 0, north: 1, south: 2, west: 3 };
const EXPECTED_ROWS = {
  north: { idle: 3, walk: 4, contact: 5 },
  south: { idle: 0, walk: 1, contact: 2 },
};

const EXPECTED_CELL_SHA256 = Object.freeze({
  "river-east-idle": "f5ce3a177e1a7a938076d93faf7b861d45d6b8d8e312233918fae2d1cce070fe",
  "river-north-idle": "560d62aef87178f3a3a737c098c4d0d8a2466c4715c7ca127d7c410eca91b9d8",
  "river-south-idle": "7a24b411a65b2c1c0f63b371e8c87e36299835a725fa0cf6b297e58c00b86433",
  "river-west-idle": "b8de0b3fb62abc2fda71e4d92fe61722f975227c07ccb015da3b128e34ef6468",
  "river-east-walk": "ab30d30222bd98e77ca4e7c551b99b786cafba13a9d1dc4853d7c8f8d060bb32",
  "river-north-walk": "ee4b18a493b9ecd03386d6f92dcf4a1388c40f16c0fd5a3b3adcce8ee057d4e6",
  "river-south-walk": "deac5fd22d41891c92f8d3e9afbdc08e40172639b378b200f6e8b4d5d928ba62",
  "river-west-walk": "20934fc9c71f292ca6a3bb2fa876ec8e6b9380dbdcc8497e8fa402427318d72c",
  "river-east-contact": "7654ce3d3376e1f87e123dbb2f0d3e6fbd06d9eefbaab7b960ce193e93acdf5c",
  "river-north-contact": "80cc517aaafcb361229aa4779c5bce79e59610c059a7735be2942a95faf558fa",
  "river-south-contact": "9a4258892c5d61235ba88a595e8937b308e8f7341258e58b956f46c5d627a407",
  "river-west-contact": "8361d10e8c37cfd919ba29c780ffedfab55eb8804939f802e958debb9d22b27d",
  "ember-east-idle": "845ed2c50bada1d19c90ece30aba7b81938624adda8be162e287cf34d27006cd",
  "ember-north-idle": "47829d7d0fb2582aa130ca4668da34e98b199a0e6f7ee0feb74f7940a14d2ab0",
  "ember-south-idle": "8ba75c218484c571465c8c13348b162bf49fa73db7a666bb1ed191efc332cf9c",
  "ember-west-idle": "35a15b558b45f82778ccb7c0694ed573e0439a0defdc3679358422e729a905bd",
  "ember-east-walk": "df8bcca3093ccad51ecb5f73b58c6dcac67d88499f189ff1c7efc7ae3b8c102d",
  "ember-north-walk": "02e62fa2d58c345a2eb5e176b252fe0484b28f33c6518d9d2063fefa098563f0",
  "ember-south-walk": "f9b4f664d67dfec59af11307aa16d37119e0932cb9dce13410da302cb4939897",
  "ember-west-walk": "0d57fb9a15b93a5e0bbd6ec1223fd60fbaead0bae70a58127e663b5a57c96f67",
  "ember-east-contact": "3dcbe7e2dd1e61e7534c3e0fae0e3971213673e6c08ad66768d4360571c2a424",
  "ember-north-contact": "45ac57c1054b54b66d5dad45e176c14327c23c3a546e5d43fc7b407de92fd132",
  "ember-south-contact": "9f2e29f0e8b3f7511742a6eb1d8e28a8a82520c73106c153c692f1311d0cb27c",
  "ember-west-contact": "661fa10c5adfb04e914a414f0d041816210082a8001b062f78c74f715b8c150e",
});


function decodeRgbaPng(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual(bytes.subarray(0, 8), signature, "PNG signature must be valid");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let compression = 0;
  let filterMethod = 0;
  let interlace = 0;
  const chunks = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    assert.ok(dataEnd + 4 <= bytes.length, "PNG chunk must fit inside the source file");
    const data = bytes.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      compression = data[10];
      filterMethod = data[11];
      interlace = data[12];
    } else if (type === "IDAT") {
      chunks.push(data);
    }
    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
  assert.equal(bitDepth, 8, "Skymaul atlas uses 8-bit channels");
  assert.equal(colorType, 6, "Skymaul atlas uses RGBA truecolor");
  assert.equal(compression, 0);
  assert.equal(filterMethod, 0);
  assert.equal(interlace, 0);
  const bytesPerPixel = 4;
  const rowLength = width * bytesPerPixel;
  const encoded = inflateSync(Buffer.concat(chunks));
  assert.equal(encoded.length, height * (rowLength + 1));
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
        throw new TypeError("unsupported PNG filter " + filter);
      }
      pixels[rowStart + x] = value;
    }
  }
  return { height, pixels, width };
}

class FakeElement {
  attributes = new Map();
  children = [];
  dataset = {};
  style = {};
  ownerDocument = null;

  appendChild(child) {
    child.ownerDocument = this.ownerDocument;
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

function fakeDocument() {
  const document = {
    createElement() {
      const node = new FakeElement();
      node.ownerDocument = document;
      return node;
    },
    createElementNS(_namespace, name) {
      const node = this.createElement(name);
      node.name = name;
      return node;
    },
  };
  return document;
}

test("Skymaul source atlas is the accepted lossless R4 copy", () => {
  const atlas = readFileSync(fileURLToPath(new URL(
    "../public/assets/skymaul-battle-sprite.png", import.meta.url,
  )));
  assert.equal(atlas.length, 27_488);
  assert.equal(createHash("sha256").update(atlas).digest("hex"), EXPECTED_ATLAS_SHA256);
});


test("Skymaul raw RGBA pixels match all 24 accepted atlas cell hashes", () => {
  const atlas = readFileSync(fileURLToPath(new URL(
    "../public/assets/skymaul-battle-sprite.png", import.meta.url,
  )));
  const decoded = decodeRgbaPng(atlas);
  assert.equal(decoded.width, 256);
  assert.equal(decoded.height, 384);
  const seen = new Set();
  for (const side of ["north", "south"]) {
    for (const action of ACTIONS) {
      for (const direction of DIRECTIONS) {
        const frame = getSkymaulBattleFrame({ action, direction, side, tick: 0 });
        const team = side === "north" ? "ember" : "river";
        const key = team + "-" + direction + "-" + action;
        const cell = Buffer.alloc(64 * 64 * 4);
        for (let y = 0; y < 64; y += 1) {
          const sourceStart = ((frame.source.y + y) * decoded.width + frame.source.x) * 4;
          decoded.pixels.copy(cell, y * 64 * 4, sourceStart, sourceStart + 64 * 4);
        }
        assert.ok(EXPECTED_CELL_SHA256[key], "missing accepted hash for " + key);
        assert.equal(
          createHash("sha256").update(cell).digest("hex"),
          EXPECTED_CELL_SHA256[key],
          key + " losslessly decoded raw RGBA bytes must match the accepted cell receipt",
        );
        seen.add(key);
      }
    }
  }
  assert.equal(seen.size, 24);
});

test("Skymaul maps both teams, four actor facings, and three fixed poses to 24 cells", () => {
  const seen = new Set();
  for (const side of ["north", "south"]) {
    for (const action of ACTIONS) {
      for (const direction of DIRECTIONS) {
        const frame = getSkymaulBattleFrame({
          action, direction, reducedMotion: false, side, tick: 40,
        });
        const team = side === "north" ? "ember" : "river";
        const row = EXPECTED_ROWS[side][action];
        const column = EXPECTED_COLUMNS[direction];
        assert.equal(frame.team, team);
        assert.equal(frame.row, row);
        assert.equal(frame.column, column);
        assert.deepEqual(frame.source, {
          x: column * 64,
          y: row * 64,
          width: 64,
          height: 64,
        });
        assert.equal(frame.viewBox, `${column * 64} ${row * 64} 64 64`);
        assert.equal(frame.id, `skymaul-${team}-${direction}-${action}`);
        seen.add(frame.viewBox);
      }
    }
  }
  assert.equal(seen.size, 24);
});

test("Skymaul tick and reduced-motion mode never cycle fixed atlas cells", () => {
  for (const side of ["north", "south"]) {
    for (const action of ACTIONS) {
      for (const direction of DIRECTIONS) {
        const first = getSkymaulBattleFrame({
          action, direction, reducedMotion: false, side, tick: 1,
        });
        const later = getSkymaulBattleFrame({
          action, direction, reducedMotion: false, side, tick: 9_001,
        });
        const reduced = getSkymaulBattleFrame({
          action, direction, reducedMotion: true, side, tick: 9_001,
        });
        assert.equal(later.id, first.id);
        assert.deepEqual(later.source, first.source);
        assert.equal(reduced.id, first.id);
        assert.deepEqual(reduced.source, first.source);
        assert.equal(reduced.tick, 9_001);
      }
    }
  }
});

test("Skymaul art keeps the 32:54 pivot, ignores pointer input, and scales only its fixed window", () => {
  const document = fakeDocument();
  for (const { bodyCssPixels, frameScale } of [
    { bodyCssPixels: 13, frameScale: 0.5 },
    { bodyCssPixels: 26, frameScale: 0.75 },
  ]) {
    for (const side of ["north", "south"]) {
      for (const action of ACTIONS) {
        for (const direction of DIRECTIONS) {
          const art = createSkymaulBattleArt(document, {
            action, bodyCssPixels, direction, frameScale,
            reducedMotion: false, side, tick: 77,
          });
          const frame = getSkymaulBattleFrame({ action, direction, side, tick: 77 });
          const image = art.children[0];
          const size = 64 * bodyCssPixels / 13 / frameScale;
          assert.equal(art.getAttribute("viewBox"), frame.viewBox);
          assert.equal(art.dataset.artId, "skymaul");
          assert.equal(art.dataset.pivot, "32:54");
          assert.equal(art.style.translate, "-50% -84.375%");
          assert.equal(art.style.pointerEvents, "none");
          assert.equal(art.style.left, "50%");
          assert.equal(art.style.top, "50%");
          assert.equal(art.style.width, `${size}px`);
          assert.equal(art.style.height, `${size}px`);
          assert.equal(image.getAttribute("width"), "256");
          assert.equal(image.getAttribute("height"), "384");
          assert.match(image.getAttribute("href"), /public\/assets\/skymaul-battle-sprite\.png$/u);
        }
      }
    }
  }
});

test("Skymaul updates only frame selection and keeps its original presentation bounds", () => {
  const art = createSkymaulBattleArt(fakeDocument(), {
    action: "idle", bodyCssPixels: 26, direction: "north", frameScale: 0.75,
    side: "north", tick: 10,
  });
  const width = art.style.width;
  const height = art.style.height;
  const frame = updateSkymaulBattleArt(art, {
    action: "contact", direction: "west", reducedMotion: true,
    side: "north", tick: 11,
  });
  assert.equal(art.getAttribute("viewBox"), "192 320 64 64");
  assert.equal(art.dataset.spriteFrame, "skymaul-ember-west-contact");
  assert.equal(art.dataset.simulationTick, "11");
  assert.equal(art.dataset.reducedMotion, "true");
  assert.equal(frame.tick, 11);
  assert.equal(art.style.width, width);
  assert.equal(art.style.height, height);
});

test("Skymaul factory rejects an unknown facing instead of guessing", () => {
  assert.throws(() => getSkymaulBattleFrame({
    action: "idle", side: "north", tick: 0,
  }), /actor-facing cardinal/u);
  assert.throws(() => getSkymaulBattleFrame({
    action: "attack", direction: "east", side: "north", tick: 0,
  }), /idle, walk, or contact/u);
});
