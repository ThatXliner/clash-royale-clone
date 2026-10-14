import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  createBriarRunnerSprite,
  createBriarRunnerPaintedSprite,
  getBriarRunnerPaintedFrameTransform,
  restoreBriarRunnerState,
  selectBriarRunnerFrame,
  serializeBriarRunnerState,
} from "../src/ui/combat-sprite-prototype.js";
import { createBriarRunnerPaintedArt } from "../src/ui/combat-art.js";

const WORKSPACE = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIRECTIONS = ["north", "east", "south", "west"];

test("walk and attack frames are selected only from the simulation tick and facing", () => {
  assert.deepEqual([
    selectBriarRunnerFrame({ action: "walk", direction: "south", tick: 0 }).id,
    selectBriarRunnerFrame({ action: "walk", direction: "south", tick: 4 }).id,
    selectBriarRunnerFrame({ action: "walk", direction: "south", tick: 5 }).id,
    selectBriarRunnerFrame({ action: "walk", direction: "south", tick: 10 }).id,
  ], [
    "briar-walk-south-0",
    "briar-walk-south-0",
    "briar-walk-south-1",
    "briar-walk-south-0",
  ]);
  assert.deepEqual([
    selectBriarRunnerFrame({ action: "attack", direction: "west", tick: 0 }).id,
    selectBriarRunnerFrame({ action: "attack", direction: "west", tick: 2 }).id,
    selectBriarRunnerFrame({ action: "attack", direction: "west", tick: 3 }).id,
    selectBriarRunnerFrame({ action: "attack", direction: "west", tick: 6 }).id,
  ], [
    "briar-attack-west-0",
    "briar-attack-west-0",
    "briar-attack-west-1",
    "briar-attack-west-0",
  ]);
});

test("the vector comparison baseline has two authored frames per facing and action", async () => {
  const source = await readFile(joinPath("public/assets/briar-runner-sprite-sheet.svg"), "utf8");
  for (const action of ["walk", "attack"]) {
    for (const direction of DIRECTIONS) {
      for (const frame of [0, 1]) {
        const id = `briar-${action}-${direction}-${frame}`;
        assert.match(source, new RegExp(`<symbol id="${id}"(?:\\s|>)`, "u"),
          `sprite sheet is missing ${id}`);
      }
    }
  }
});

test("the painted atlas maps every action, facing, and tick frame to a contained source window", async () => {
  const image = await readFile(joinPath("public/assets/briar-runner-painted-sheet.png"));
  assert.deepEqual(image.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(image.readUInt32BE(16), 1254);
  assert.equal(image.readUInt32BE(20), 1254);
  assert.equal(image[25], 6, "painted sprite atlas must preserve an alpha channel");

  for (const [row, direction] of DIRECTIONS.entries()) {
    for (const action of ["walk", "attack"]) {
      for (const frame of [0, 1]) {
        const tick = frame === 0 ? 0 : action === "walk" ? 5 : 3;
        const transform = getBriarRunnerPaintedFrameTransform({
          action,
          direction,
          reducedMotion: false,
          tick,
        });
        const column = (action === "walk" ? 0 : 2) + frame;
        const cellSize = 313.5;
        assert.equal(transform.id, `briar-${action}-${direction}-${frame}`);
        assert.equal(transform.row, row);
        assert.equal(transform.column, column);
        assert.equal(transform.source.width, 220);
        assert.equal(transform.source.height, 220);
        assert.ok(transform.source.x >= column * cellSize);
        assert.ok(transform.source.x + transform.source.width <= (column + 1) * cellSize);
        assert.ok(transform.source.y >= row * cellSize);
        assert.ok(transform.source.y + transform.source.height <= (row + 1) * cellSize);
      }
    }
  }
});

test("reduced motion holds the first painted atlas column for every facing", () => {
  for (const direction of DIRECTIONS) {
    for (const action of ["walk", "attack"]) {
      const transform = getBriarRunnerPaintedFrameTransform({
        action,
        direction,
        reducedMotion: true,
        tick: 119,
      });
      assert.equal(transform.frame, 0);
      assert.equal(transform.column, action === "walk" ? 0 : 2);
      assert.equal(transform.row, DIRECTIONS.indexOf(direction));
    }
  }
});

test("painted Briar artwork carries a persistent bordered team-color footring", () => {
  const expectedColors = new Map([
    ["north", "#C6452E"],
    ["south", "#2E7F86"],
  ]);
  for (const [side, color] of expectedColors) {
    const art = createBriarRunnerPaintedArt(fakeDocument(), {
      action: "attack",
      direction: "west",
      reducedMotion: true,
      side,
      tick: 47,
    });
    const [shadow, atlas, footring] = art.childNodes;
    assert.equal(art.dataset.spriteFrame, "briar-attack-west-0",
      "reduced motion keeps the footring with the first artwork frame");
    assert.equal(art.dataset.reducedMotion, "true");
    assert.equal(shadow.name, "ellipse");
    assert.equal(footring.name, "rect");
    assert.equal(footring.dataset.teamColor, side);
    assert.equal(footring.getAttribute("fill"), color);
    assert.equal(footring.getAttribute("stroke"), "#F4EBD6");
    assert.equal(footring.getAttribute("stroke-width"), "5");
    assert.equal(footring.getAttribute("x"), "676.75");
    assert.equal(footring.getAttribute("y"), "1108.5");
    assert.equal(footring.getAttribute("width"), "214");
    assert.equal(footring.getAttribute("height"), "72");
    assert.equal(footring.getAttribute("rx"), "36");
    assert.equal(atlas.name, "image");
    assert.equal(atlas.getAttribute("href"),
      new URL("../public/assets/briar-runner-painted-sheet.png", import.meta.url).href);
    assert.equal(art.childNodes.at(-1), footring,
      "the bordered team color remains in front of the unchanged painted atlas");
  }
});

test("reduced motion fixes the frame while retaining the selected direction and action", () => {
  for (const action of ["walk", "attack"]) {
    for (const direction of DIRECTIONS) {
      const first = selectBriarRunnerFrame({ action, direction, tick: 0, reducedMotion: true });
      const later = selectBriarRunnerFrame({ action, direction, tick: 119, reducedMotion: true });
      assert.equal(later.id, first.id);
      assert.equal(later.frame, 0);
      assert.equal(later.reducedMotion, true);
    }
  }
});

test("checkpoint restore reproduces the exact sprite frame and reduced-motion state", () => {
  const original = Object.freeze({
    action: "attack",
    direction: "east",
    reducedMotion: false,
    tick: 47,
  });
  const bytes = serializeBriarRunnerState(original);
  const restored = restoreBriarRunnerState(bytes);
  assert.deepEqual(restored, original);
  assert.deepEqual(
    selectBriarRunnerFrame(original),
    selectBriarRunnerFrame(restored),
  );
  assert.equal(serializeBriarRunnerState(restored), bytes);

  const reduced = restoreBriarRunnerState(serializeBriarRunnerState({
    ...original,
    reducedMotion: true,
  }));
  assert.equal(selectBriarRunnerFrame(reduced).id, "briar-attack-east-0");
});

test("restore rejects malformed or noncanonical sprite checkpoints", () => {
  for (const bad of [
    null,
    "{",
    JSON.stringify({ action: "run", direction: "south", reducedMotion: false, tick: 0, version: 1 }),
    JSON.stringify({ action: "walk", direction: "north-east", reducedMotion: false, tick: 0, version: 1 }),
    JSON.stringify({ action: "walk", direction: "north", reducedMotion: false, tick: -1, version: 1 }),
    JSON.stringify({ action: "walk", direction: "north", reducedMotion: false, tick: 0, extra: true, version: 1 }),
  ]) assert.throws(() => restoreBriarRunnerState(bad));
});

test("rendered SVG carries clear team identity, frame identity, and an outlined external atlas use", () => {
  const document = fakeDocument();
  const north = createBriarRunnerSprite(document, {
    action: "walk",
    assetUrl: "/public/assets/briar-runner-sprite-sheet.svg",
    direction: "north",
    side: "north",
    tick: 5,
  });
  const south = createBriarRunnerSprite(document, {
    action: "attack",
    assetUrl: "/public/assets/briar-runner-sprite-sheet.svg",
    direction: "south",
    side: "south",
    tick: 6,
  });
  assert.equal(north.dataset.spriteSide, "north");
  assert.equal(north.dataset.spriteFrame, "briar-walk-north-1");
  assert.equal(north.style.values.get("--team-color"), "#d85b4f");
  assert.equal(north.childNodes[0].getAttribute("href"),
    "/public/assets/briar-runner-sprite-sheet.svg#briar-walk-north-1");
  assert.equal(south.dataset.spriteSide, "south");
  assert.equal(south.dataset.spriteFrame, "briar-attack-south-0");
  assert.equal(south.style.values.get("--team-color"), "#2e7f86");
  assert.equal(north.getAttribute("viewBox"), "0 0 64 64");
});

test("painted renderer carries team identity and the same deterministic atlas frame", () => {
  const document = fakeDocument();
  const painted = createBriarRunnerPaintedSprite(document, {
    action: "attack",
    assetUrl: "/public/assets/briar-runner-painted-sheet.png",
    direction: "west",
    side: "south",
    tick: 3,
  });
  const transform = getBriarRunnerPaintedFrameTransform({
    action: "attack",
    direction: "west",
    reducedMotion: false,
    tick: 3,
  });
  assert.equal(painted.name, "span");
  assert.equal(painted.dataset.spriteSide, "south");
  assert.equal(painted.dataset.spriteFrame, "briar-attack-west-1");
  assert.equal(painted.dataset.simulationTick, "3");
  assert.match(painted.getAttribute("aria-label"), /South painted Briar Runner attack, facing west/u);
  assert.equal(painted.style.backgroundImage,
    'url("/public/assets/briar-runner-painted-sheet.png")');
  assert.equal(painted.style.backgroundPosition, transform.backgroundPosition);
  assert.equal(painted.style.backgroundSize, transform.backgroundSize);
  assert.equal(painted.style.position, "relative");
  assert.equal(painted.style.values.get("--team-color"), "#2e7f86");
  assert.equal(painted.style.values.get("--team-accent"), "#9bbb76");
  const [teamFootring] = painted.childNodes;
  assert.equal(teamFootring.dataset.teamColor, "south");
  assert.equal(teamFootring.getAttribute("aria-hidden"), "true");
  assert.equal(teamFootring.style.backgroundColor, "#2e7f86");
  assert.equal(teamFootring.style.left, "5%");
  assert.equal(teamFootring.style.right, "5%");
  assert.equal(teamFootring.style.height, "20%");
});

function joinPath(path) {
  return resolve(WORKSPACE, ...path.split("/"));
}

function fakeDocument() {
  return {
    createElement(name) {
      return new FakeSvgNode(name);
    },
    createElementNS(namespace, name) {
      assert.equal(namespace, "http://www.w3.org/2000/svg");
      return new FakeSvgNode(name);
    },
  };
}

class FakeSvgNode {
  constructor(name) {
    this.name = name;
    this.attributes = new Map();
    this.childNodes = [];
    this.dataset = {};
    this.style = {
      color: "",
      values: new Map(),
      setProperty(name, value) { this.values.set(name, value); },
    };
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  appendChild(child) { this.childNodes.push(child); return child; }
}
