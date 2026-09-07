import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  bindCombatViewModel,
  COMBAT_ENTITY_LIMIT,
  COMBAT_EVENT_LIMIT,
  createCombatViewModel,
  getCombatStyleText,
  mountCombatLayer,
  restoreCombatViewModel,
  serializeCombatViewModel,
} from "../src/ui/combat-state.js";

function entity({
  hitpoints = 640,
  id = 1,
  kind = "mossguard",
  layer = "ground",
  maxHitpoints = 640,
  position = { x: 6_000, y: 12_000 },
  side = "south",
  targetId = "north:lane:left",
} = {}) {
  return { hitpoints, id, kind, layer, maxHitpoints, position, side, targetId };
}

function tower({
  hitpoints = 3_052,
  id = "north:lane:left",
  maxHitpoints = 3_052,
  position = { x: 3_500, y: 24_500 },
  role = "lane",
  side = "north",
  targetId = 1,
} = {}) {
  return { hitpoints, id, maxHitpoints, position, role, side, targetId };
}

function state(overrides = {}) {
  return {
    entities: [
      entity({
        hitpoints: 231,
        id: 2,
        kind: "cinderwing",
        layer: "air",
        maxHitpoints: 462,
        position: { x: 14_500, y: 17_000 },
        targetId: null,
      }),
      entity(),
    ],
    events: [],
    tick: 42,
    towers: [
      tower({
        hitpoints: 4_824,
        id: "south:central",
        maxHitpoints: 4_824,
        position: { x: 9_000, y: 3_000 },
        role: "central",
        side: "south",
        targetId: null,
      }),
      tower(),
    ],
    ...overrides,
  };
}

class Style {
  values = new Map();
  setProperty(name, value) { this.values.set(name, value); }
}

class Node {
  attributes = new Map();
  children = [];
  className = "";
  dataset = {};
  ownerDocument = null;
  parentNode = null;
  style = new Style();

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    for (const child of children) child.parentNode = this;
    this.children = children;
  }

  setAttribute(name, value) { this.attributes.set(name, value); }
}

function dom() {
  const document = {
    createElement() {
      const node = new Node();
      node.ownerDocument = document;
      return node;
    },
    createElementNS(_namespace, _name) {
      return this.createElement();
    },
  };
  const layer = document.createElement("div");
  return { document, layer };
}

function nodeBytes(node) {
  return JSON.stringify({
    attributes: [...node.attributes].sort(),
    children: node.children.map(nodeBytes),
    className: node.className,
    dataset: Object.fromEntries(Object.entries(node.dataset).sort()),
    style: [...node.style.values].sort(),
  });
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("ui combat state: stable ID order projects exact millitile geometry and layers", () => {
  const view = createCombatViewModel(state());
  assert.deepEqual(view.entities.map(({ key }) => key), ["n:1", "n:2"]);
  assert.deepEqual(view.towers.map(({ key }) => key), [
    "s:north:lane:left",
    "s:south:central",
  ]);
  assert.deepEqual(view.entities[0], {
    healthDenominator: 640,
    healthNumerator: 640,
    id: 1,
    key: "n:1",
    kind: "mossguard",
    layer: "ground",
    side: "south",
    x: 6_000,
    y: 12_000,
  });
  assert.deepEqual(view.links, [
    { fromKey: "n:1", toKey: "s:north:lane:left", x1: 6_000, x2: 3_500, y1: 12_000, y2: 24_500 },
    { fromKey: "s:north:lane:left", toKey: "n:1", x1: 3_500, x2: 6_000, y1: 24_500, y2: 12_000 },
  ]);
  assert.ok(Object.isFrozen(view));
  assert.ok(Object.isFrozen(view.links[0]));
});

test("ui combat state: high-confidence tower HP bounds health exactly", () => {
  const reference = JSON.parse(readFileSync(
    new URL("../reference/stats/towers.json", import.meta.url),
    "utf8",
  ));
  const central = reference.towers.find(({ key }) => key === "king_tower");
  const lane = reference.towers.find(({ key }) => key === "princess_tower");
  assert.deepEqual(central.unverified_fields, ["first_hit_seconds"]);
  assert.deepEqual(lane.unverified_fields, []);
  const view = createCombatViewModel(state({
    towers: [
      tower({
        hitpoints: central.hitpoints,
        id: "south:central",
        maxHitpoints: central.hitpoints,
        position: { x: 9_000, y: 3_000 },
        role: "central",
        side: "south",
        targetId: null,
      }),
      tower({ hitpoints: lane.hitpoints, maxHitpoints: lane.hitpoints }),
    ],
  }));
  assert.deepEqual(
    view.towers.map(({ healthDenominator, healthNumerator, role }) => ({
      healthDenominator, healthNumerator, role,
    })),
    [
      { healthDenominator: 3_052, healthNumerator: 3_052, role: "lane" },
      { healthDenominator: 4_824, healthNumerator: 4_824, role: "central" },
    ],
  );
});

test("ui combat state: damage changes only numerator; death removes entities and terminals towers", () => {
  const damaged = createCombatViewModel(state({
    entities: [entity({ hitpoints: 127, targetId: null })],
    towers: [tower({ hitpoints: 1_526, targetId: null })],
  }));
  assert.equal(damaged.entities[0].healthNumerator, 127);
  assert.equal(damaged.entities[0].healthDenominator, 640);
  assert.equal(damaged.towers[0].healthNumerator, 1_526);
  const dead = createCombatViewModel(state({
    entities: [entity({ hitpoints: 0, targetId: null })],
    towers: [tower({ hitpoints: 0, targetId: null })],
  }));
  assert.deepEqual(dead.entities, []);
  assert.equal(dead.towers[0].destroyed, true);
  assert.equal(dead.towers[0].healthNumerator, 0);
});

test("ui combat state: canonical serialization restores byte-identically", () => {
  const view = createCombatViewModel(state());
  const bytes = serializeCombatViewModel(view);
  const restored = restoreCombatViewModel(bytes);
  assert.deepEqual(restored, view);
  assert.equal(serializeCombatViewModel(restored), bytes);
  const parsed = JSON.parse(bytes);
  assert.throws(
    () => restoreCombatViewModel(JSON.stringify({ version: parsed.version, ...parsed })),
    /canonical encoding/u,
  );
});

test("ui combat state: one-shot and chunked state projection end in identical bytes", () => {
  const frames = [
    state({ tick: 42 }),
    state({ tick: 43, entities: [entity({ hitpoints: 400, targetId: null })], towers: [tower({ targetId: null })] }),
    state({ tick: 44, entities: [entity({ hitpoints: 0, targetId: null })], towers: [tower({ hitpoints: 2_900, targetId: null })] }),
  ];
  const oneShot = createCombatViewModel(frames.at(-1));
  let chunked;
  for (const frame of frames) chunked = createCombatViewModel(frame);
  assert.equal(serializeCombatViewModel(chunked), serializeCombatViewModel(oneShot));
});

test("ui combat state: bounded causal events survive canonical restore without driving current state", () => {
  const events = [
    { entityId: 1, sequence: 0, tick: 40, type: "damage" },
    { entityId: 1, sequence: 1, tick: 41, type: "target" },
    { entityId: 9, sequence: 2, tick: 42, type: "death" },
  ];
  const view = createCombatViewModel(state({ events }));
  assert.deepEqual(view.events, [
    { entityId: 1, entityKey: "n:1", sequence: 0, tick: 40, type: "damage" },
    { entityId: 1, entityKey: "n:1", sequence: 1, tick: 41, type: "target" },
    { entityId: 9, entityKey: "n:9", sequence: 2, tick: 42, type: "death" },
  ]);
  assert.equal(
    serializeCombatViewModel(restoreCombatViewModel(serializeCombatViewModel(view))),
    serializeCombatViewModel(view),
  );
  assert.throws(() => createCombatViewModel(state({
    events: Array.from({ length: COMBAT_EVENT_LIMIT + 1 }, (_, sequence) => ({
      entityId: 1, sequence, tick: 42, type: "damage",
    })),
  })), /at most/u);
  assert.throws(() => createCombatViewModel(state({
    events: [{ entityId: 1, sequence: 1, tick: 42, type: "damage" }],
  })), /contiguous/u);
});

test("ui combat state: DOM projection is byte-stable with exact inverted arena coordinates", () => {
  const first = dom();
  const second = dom();
  const view = createCombatViewModel(state());
  bindCombatViewModel(first.layer, view);
  bindCombatViewModel(second.layer, restoreCombatViewModel(serializeCombatViewModel(view)));
  const bytes = nodeBytes(first.layer);
  assert.equal(bytes, nodeBytes(second.layer));
  assert.equal(
    digest(bytes),
    "44c99d6d4ccae99e4b987869084b5aaa6934f17226ce8e1e9d9329da6ce5aec9",
  );
  const frame = first.layer.children[0];
  assert.equal(frame.dataset.tick, "42");
  const entityNodes = frame.children.filter(({ className }) => className.includes("entity-"));
  assert.deepEqual(entityNodes.map(({ dataset }) => dataset.combatKey), ["n:1", "n:2"]);
  assert.equal(entityNodes[0].style.values.get("--combat-x"), "6000");
  assert.equal(entityNodes[0].style.values.get("--combat-y"), "20000");
  const link = frame.children[0].children[0];
  assert.equal(link.attributes.get("x1"), "6000");
  assert.equal(link.attributes.get("y1"), "20000");
  assert.equal(link.attributes.get("y2"), "7500");
});

test("ui combat state: terminal restore produces byte-identical DOM and zero health", () => {
  const terminalState = state({
    entities: [entity({ hitpoints: 0, targetId: null })],
    tick: 99,
    towers: [tower({ hitpoints: 0, targetId: null })],
  });
  const view = createCombatViewModel(terminalState);
  const restored = restoreCombatViewModel(serializeCombatViewModel(view));
  const left = dom();
  const right = dom();
  bindCombatViewModel(left.layer, view);
  bindCombatViewModel(right.layer, restored);
  assert.equal(nodeBytes(left.layer), nodeBytes(right.layer));
  const towerNode = left.layer.children[0].children[0];
  assert.equal(towerNode.dataset.destroyed, "true");
  assert.equal(towerNode.style.values.get("--combat-health"), "0");
});

test("ui combat state: DOM binding validates/builds before its single commit", () => {
  const { document, layer } = dom();
  const sentinel = document.createElement("sentinel");
  layer.replaceChildren(sentinel);
  let calls = 0;
  const original = document.createElement.bind(document);
  document.createElement = (...args) => {
    calls += 1;
    if (calls === 3) throw new Error("hostile document");
    return original(...args);
  };
  assert.throws(() => bindCombatViewModel(layer, createCombatViewModel(state())), /hostile document/u);
  assert.deepEqual(layer.children, [sentinel]);
  assert.throws(() => bindCombatViewModel(layer, {}), /must come from/u);
  assert.deepEqual(layer.children, [sentinel]);
});

test("ui combat state: exact shapes, accessors, prototypes, IDs, targets, HP, and bounds fail closed", () => {
  assert.throws(() => createCombatViewModel({ ...state(), extra: true }), /invalid shape/u);
  assert.throws(() => createCombatViewModel(Object.create({ entities: [], tick: 0, towers: [] })), /plain data object/u);
  let accessed = false;
  const hostile = state();
  Object.defineProperty(hostile, "tick", { enumerable: true, get() { accessed = true; return 0; } });
  assert.throws(() => createCombatViewModel(hostile), /data property/u);
  assert.equal(accessed, false);
  assert.throws(() => createCombatViewModel(state({ entities: [entity(), entity()] })), /unique/u);
  assert.throws(() => createCombatViewModel(state({ entities: [entity({ targetId: 999 })] })), /missing or dead/u);
  assert.throws(() => createCombatViewModel(state({ entities: [entity({ hitpoints: 641 })] })), /hitpoints/u);
  assert.throws(() => createCombatViewModel(state({ entities: [entity({ position: { x: 18_001, y: 0 } })] })), /position.x/u);
  assert.throws(() => createCombatViewModel(state({ entities: Array.from({ length: COMBAT_ENTITY_LIMIT + 1 }, (_, id) => entity({ id: id + 1, targetId: null })) })), /at most/u);
  assert.throws(() => serializeCombatViewModel({}), /must come from/u);
});

test("ui combat state: combat layer mounts inside the shipped arena primitive", () => {
  const { document } = dom();
  const arena = document.createElement("section");
  const shell = {
    querySelector(selector) {
      return selector === '[data-ui="arena"]' ? arena : null;
    },
  };
  const layer = mountCombatLayer(shell);
  assert.equal(arena.children[1], layer);
  assert.equal(arena.children[0].dataset.ui, "combat-style");
  assert.equal(arena.children[0].textContent, getCombatStyleText());
  assert.equal(layer.className, "combat-layer");
  assert.equal(layer.dataset.ui, "combat-layer");
  const entry = readFileSync(
    new URL("../src/ui/arena-shell-entry.js", import.meta.url),
    "utf8",
  );
  assert.match(entry, /mountCombatLayer\(shell\)/u);
  assert.match(getCombatStyleText(), /\.combat-marker--entity-air/u);
  assert.match(getCombatStyleText(), /\.combat-target-link line/u);
});
