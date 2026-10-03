import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  createBriarRunnerSprite,
  restoreBriarRunnerState,
  selectBriarRunnerFrame,
  serializeBriarRunnerState,
} from "../src/ui/combat-sprite-prototype.js";

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

test("every cardinal facing and action has two authored atlas frames", async () => {
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

function joinPath(path) {
  return resolve(WORKSPACE, ...path.split("/"));
}

function fakeDocument() {
  return {
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
