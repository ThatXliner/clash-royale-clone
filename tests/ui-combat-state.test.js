import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import { createCombatArt, COMBAT_ART_ARCHETYPES } from "../src/ui/combat-art.js";
import { createEditableGameSessionSetup } from "../src/content/editable-deck.js";
import { GameSession } from "../src/sim/game-session.js";
import { createGameUiFrame } from "../src/ui/game-ui-projection.js";
import { AETHER_WELL_TEAM_COLORS } from "../src/ui/aether-well-art.js";
import { getCardLore } from "../src/ui/card-lore.js";
import { getCardPortrait, getCardPortraitIds } from "../src/ui/card-portrait-art.js";
import { createPlayableRoster, PLAYABLE_CARD_IDS } from "../src/content/playable-roster.js";

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

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
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
  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

function dom() {
  const document = {
    createElement(name) {
      const node = new Node();
      node.name = name;
      node.ownerDocument = document;
      return node;
    },
    createElementNS(_namespace, name) {
      return this.createElement(name);
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

function renderedArtBytes(node) {
  const attributes = [...node.attributes].map(([name, value]) => {
    if (name !== "href" || typeof value !== "string" || !value.startsWith("file:")) {
      return [name, value];
    }
    const pathname = new URL(value).pathname;
    const asset = pathname.slice(pathname.lastIndexOf("/public/") + 1);
    return [name, `/${asset}`];
  }).sort();
  return JSON.stringify({
    attributes,
    children: node.children.map((child) => JSON.parse(renderedArtBytes(child))),
    className: node.className,
    dataset: Object.fromEntries(Object.entries(node.dataset).sort()),
    style: [...node.style.values].sort(),
  });
}

function renderedArtSnapshot(node) {
  const assets = [];
  const collect = (current) => {
    const href = current.attributes.get("href");
    if (typeof href === "string" && href.startsWith("file:")) {
      const assetPath = fileURLToPath(href);
      assets.push({
        path: `/public/assets/${basename(assetPath)}`,
        sha256: createHash("sha256").update(readFileSync(assetPath)).digest("hex"),
      });
    }
    for (const child of current.children) collect(child);
  };
  collect(node);
  return { assets, bytes: renderedArtBytes(node) };
}

function artDocument() {
  return dom().document;
}

function cardPortraitOutput(module, cardId) {
  const portrait = module.getCardPortrait(cardId);
  const assetPath = fileURLToPath(portrait.src);
  return {
    asset: portrait.asset,
    cell: portrait.cell,
    imageSha256: createHash("sha256").update(readFileSync(assetPath)).digest("hex"),
    src: `/public/assets/${basename(assetPath)}`,
  };
}

test("Brackenwheel resolves its accepted portrait and exactly two approved lore sentences", () => {
  assert.equal(getCardLore("brackenwheel"),
    "Brackenwheel learned to clear jammed sluice gates by spinning a copperroot sickle through the reeds. After dusk, emberseed sparks trace a ring around her boots, and she counts each flicker as a warning from the river.");
  assert.deepEqual(getCardPortrait("brackenwheel"), {
    asset: "brackenwheel-portrait-painted",
    cell: null,
    src: new URL("../public/assets/brackenwheel-portrait-painted.webp", import.meta.url).href,
  });
  assert.deepEqual(getCardPortraitIds().slice(-2), ["brackenwheel", "aether-well"]);
});

test("Aether Well resolves the accepted standalone portrait and two exact lore sentences", () => {
  assert.equal(getCardLore("aether-well"),
    "At dusk, the Aether Well’s copper scoop gathers glowing emberseed from the quiet river water. Workshop keepers wind its rootwood crank to lift the seeds into stoppered flasks for the nearby repair shed.");
  assert.deepEqual(getCardPortrait("aether-well"), {
    asset: "aether-well-portrait-painted",
    cell: null,
    src: new URL("../public/assets/aether-well-portrait-painted.webp", import.meta.url).href,
  });
  assert.deepEqual(getCardPortraitIds().slice(-1), ["aether-well"]);
});

test("Brackenwheel selects renderer and physical body size from deterministic presentation context", () => {
  for (const { bodyCssPixels, frameScale, renderer, bodyFraction } of [
    { bodyCssPixels: 13, frameScale: 0.5, renderer: "native-svg", bodyFraction: 28.4 / 32 },
    { bodyCssPixels: 26, frameScale: 0.75, renderer: "painted-webp", bodyFraction: 501 / 512 },
  ]) {
    const { document, layer } = dom();
    document.documentElement = { dataset: {
      combatBodyCssPixels: String(bodyCssPixels),
      combatFrameScale: String(frameScale),
    } };
    const brackenwheel = entity({ kind: "brackenwheel", side: "south", targetId: null });
    bindCombatViewModel(layer, createCombatViewModel(state({
      entities: [brackenwheel],
      towers: [],
    })));
    const marker = layer.children[0].children.find((node) => node.dataset.kind === "brackenwheel");
    const art = marker.children.find((node) => node.dataset.artId === "brackenwheel");
    assert.equal(art.dataset.renderer, renderer);
    assert.equal(art.dataset.bodyCssPixels, String(bodyCssPixels));
    assert.equal(art.getAttribute("class"), "combat-art",
      "the SVG and painted renderer expose the same stylesheet class through a DOM attribute");
    assert.ok(Math.abs(Number.parseFloat(art.style.width) * frameScale * bodyFraction -
      bodyCssPixels) < 1e-9, "iframe compensation keeps the requested physical body size");
    assert.equal(marker.style.width, art.style.width);
    assert.equal(marker.style.height, art.style.height);
  }
});

test("Aether Well art renders from an authentic GameSession projection at phone and desktop scale", () => {
  const deck = ["aether-well", ...PLAYABLE_CARD_IDS.slice(1)];
  const session = new GameSession(createEditableGameSessionSetup(deck, 2));
  const opening = session.state;
  const slot = opening.decks.south.hand.indexOf("aether-well");
  assert.notEqual(slot, -1, "seed 2 places Aether Well in the player's authentic opening hand");
  assert.ok(opening.decks.north.hand.includes("aether-well"),
    "the unforced AI has Aether Well in its natural opening hand");
  session.submitPlayerCommand(canonicalJson({
    cardId: "aether-well",
    commandId: 0,
    point: { x: 3_500, y: 14_500 },
    slot,
    tick: 0,
    type: "deploy",
  }));
  session.stepMany(1);
  const projected = createGameUiFrame(session);
  const expectedSides = projected.combat.entities
    .filter(({ kind }) => kind === "aether-well")
    .map(({ side }) => side).sort();
  assert.deepEqual(expectedSides, ["north", "south"],
    "canonical session state projects the player's and unforced AI's actual Aether Well structures");

  const snapshot = (node) => JSON.stringify({
    attributes: [...node.attributes].sort(),
    children: node.children.map(snapshot),
    className: node.className,
    dataset: Object.fromEntries(Object.entries(node.dataset).sort()),
    style: { display: node.style.display ?? null, height: node.style.height ?? null,
      width: node.style.width ?? null },
  });
  for (const { bodyCssPixels, frameScale } of [
    { bodyCssPixels: 13, frameScale: 0.5 },
    { bodyCssPixels: 26, frameScale: 0.75 },
  ]) {
    const render = (reducedMotion) => {
      const { document, layer } = dom();
      document.documentElement = { dataset: {
        combatBodyCssPixels: String(bodyCssPixels),
        combatFrameScale: String(frameScale),
      } };
      document.defaultView = { matchMedia: () => ({ matches: reducedMotion }) };
      bindCombatViewModel(layer, projected.combat);
      const markers = layer.children[0].children
        .filter((node) => node.dataset.kind === "aether-well")
        .sort((left, right) => left.dataset.side.localeCompare(right.dataset.side));
      assert.equal(markers.length, 2);
      return markers.map((marker) => {
        const art = marker.children.find((node) => node.dataset.artId === "aether-well");
        assert.ok(art, "the authentic game UI projection reaches the battle renderer");
        assert.equal(marker.dataset.structure, "true");
        assert.equal(marker.className.includes("combat-marker--structure"), true);
        assert.equal(art.dataset.renderer, "native-svg");
        assert.equal(art.dataset.motion, "static");
        assert.equal(art.dataset.bodyBoundsUnits, "2.575:28");
        assert.equal(art.dataset.bodyCssPixels, String(bodyCssPixels));
        assert.equal(art.dataset.side, marker.dataset.side);
        assert.equal(art.dataset.teamColor, AETHER_WELL_TEAM_COLORS[marker.dataset.side]);
        assert.ok(Math.abs(Number.parseFloat(art.style.height) * frameScale * 25.425 / 32 -
          bodyCssPixels) < 1e-9, "iframe compensation preserves the physical structure body size");
        assert.equal(marker.style.width, art.style.width);
        assert.equal(marker.style.height, art.style.height);
        return snapshot(art);
      });
    };
    assert.deepEqual(render(true), render(false),
      `${bodyCssPixels}px Aether Well art restores identically in normal and reduced-motion modes`);
  }
});

test("non-Briar artwork and all accepted parent portraits match the accepted 5ed renderer", {
  skip: process.env.ART004_PARENT_ROOT ? false : "set ART004_PARENT_ROOT to the accepted 5ed checkout",
}, async () => {
  const parentRoot = resolve(process.env.ART004_PARENT_ROOT);
  const parentSha = execFileSync("git", ["-C", parentRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  assert.equal(parentSha, "5ed9d7c76a7bf3b4b3c6fe6a98102921e078f146",
    "the visual comparison must execute the exact accepted parent source");
  const parentStatus = execFileSync("git", ["-C", parentRoot, "status", "--porcelain=v1",
    "--untracked-files=no", "--", "src", "public", "tests", "package.json", "package-lock.json"], {
    encoding: "utf8",
  });
  assert.equal(parentStatus, "", "the accepted parent's source, assets, tests, and manifest are clean");
  assert.equal(createHash("sha256").update(readFileSync(resolve(parentRoot, "package-lock.json")))
    .digest("hex"), "d707c780097d5e60bd33d03a60a35087c04c789f2f44717bb6812913bf933bf4",
  "the accepted parent lockfile matches the Round 476 source fence");

  const parentModule = (path) => import(pathToFileURL(resolve(parentRoot, path)).href);
  const [parentArt, parentState, parentPortraits, parentLore, parentRoster] = await Promise.all([
    parentModule("src/ui/combat-art.js"),
    parentModule("src/ui/combat-state.js"),
    parentModule("src/ui/card-portrait-art.js"),
    parentModule("src/ui/card-lore.js"),
    parentModule("src/content/playable-roster.js"),
  ]);

  assert.deepEqual(PLAYABLE_CARD_IDS, parentRoster.PLAYABLE_CARD_IDS,
    "the accepted default deck order remains exact");
  assert.deepEqual(createPlayableRoster(), parentRoster.createPlayableRoster(),
    "default card rendering metadata remains exact");
  const copperskiffMotionCss = `.combat-marker[data-kind="copperskiff"][data-pose] .combat-art{transform:none;transform-origin:50% 84.375%}`;
  const copperskiffWindowCss = `.combat-art--copperskiff{overflow:hidden}`;
  const styleWithoutCopperskiffRules = getCombatStyleText()
    .replace(copperskiffMotionCss, "")
    .replace(copperskiffWindowCss, "");
  assert.equal(styleWithoutCopperskiffRules, parentState.getCombatStyleText() +
    `.combat-marker[data-kind="brackenwheel"]::before{content:"";position:absolute;z-index:-1;inset:-3px;border:2px solid;border-radius:50%;pointer-events:none}.combat-marker[data-kind="brackenwheel"][data-side="north"]::before{border-color:#b95c4c}.combat-marker[data-kind="brackenwheel"][data-side="south"]::before{border-color:#398ba4}`,
  "Copperskiff only adds its fixed window and no-rotation rules on top of the accepted combat CSS");
  assert.ok(getCombatStyleText().includes(copperskiffMotionCss));
  assert.ok(getCombatStyleText().includes(copperskiffWindowCss));

  const portraitIds = getCardPortraitIds();
  assert.equal(portraitIds.length, parentPortraits.getCardPortraitIds().length + 2,
    "Brackenwheel and Aether Well append two new portrait outputs to the accepted collection");
  assert.deepEqual(portraitIds, [...parentPortraits.getCardPortraitIds(), "brackenwheel", "aether-well"],
    "the accepted collection order, including Buried Coil, is preserved with Brackenwheel and Aether Well appended");
  assert.ok(portraitIds.includes("buried-coil"));
  for (const cardId of parentPortraits.getCardPortraitIds()) {
    assert.deepEqual({
      lore: getCardLore(cardId),
      portrait: cardPortraitOutput({ getCardPortrait }, cardId),
    }, {
      lore: parentLore.getCardLore(cardId),
      portrait: cardPortraitOutput(parentPortraits, cardId),
    }, `${cardId} keeps the accepted lore and pixel-source asset`);
  }
  assert.deepEqual({
    lore: getCardLore("brackenwheel"),
    portrait: cardPortraitOutput({ getCardPortrait }, "brackenwheel"),
  }, {
    lore: "Brackenwheel learned to clear jammed sluice gates by spinning a copperroot sickle through the reeds. After dusk, emberseed sparks trace a ring around her boots, and she counts each flicker as a warning from the river.",
    portrait: {
      asset: "brackenwheel-portrait-painted",
      cell: null,
      imageSha256: createHash("sha256").update(readFileSync(fileURLToPath(
        new URL("../public/assets/brackenwheel-portrait-painted.webp", import.meta.url),
      ))).digest("hex"),
      src: "/public/assets/brackenwheel-portrait-painted.webp",
    },
  }, "Brackenwheel adds the accepted standalone portrait without changing parent outputs");
  assert.deepEqual({
    lore: getCardLore("aether-well"),
    portrait: cardPortraitOutput({ getCardPortrait }, "aether-well"),
  }, {
    lore: "At dusk, the Aether Well’s copper scoop gathers glowing emberseed from the quiet river water. Workshop keepers wind its rootwood crank to lift the seeds into stoppered flasks for the nearby repair shed.",
    portrait: {
      asset: "aether-well-portrait-painted",
      cell: null,
      imageSha256: createHash("sha256").update(readFileSync(fileURLToPath(
        new URL("../public/assets/aether-well-portrait-painted.webp", import.meta.url),
      ))).digest("hex"),
      src: "/public/assets/aether-well-portrait-painted.webp",
    },
  }, "Aether Well appends its accepted portrait and lore without changing parent outputs");

  const expectedKinds = parentArt.COMBAT_ART_ARCHETYPES
    .filter((kind) => kind !== "briar-runner").sort();
  assert.deepEqual(COMBAT_ART_ARCHETYPES.filter((kind) => kind !== "briar-runner").sort(),
    expectedKinds, "all other combat-art archetypes remain present");
  const layersByKind = new Map(createPlayableRoster().flatMap(({ entities }) =>
    entities.map(({ archetypeId, layer }) => [archetypeId, layer])));
  for (const kind of expectedKinds) {
    const layer = layersByKind.get(kind) ?? "ground";
    for (const side of ["north", "south"]) {
      const hiddenStates = kind === "buried-coil" ? [false, true] : [false];
      for (const hidden of hiddenStates) {
        const expected = parentArt.createCombatArt(artDocument(), kind, side, layer, hidden);
        const actual = createCombatArt(artDocument(), kind, side, layer, hidden);
        assert.deepEqual(renderedArtSnapshot(actual), renderedArtSnapshot(expected),
          `${kind}/${side}/${layer}/hidden=${hidden} keeps its accepted rendered SVG`);
      }
    }
  }
});

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

test("Buried Coil keeps its original hidden and revealed render geometry through restore", () => {
  for (const side of ["north", "south"]) {
    for (const hidden of [true, false]) {
      const { document, layer } = dom();
      const buriedCoil = entity({
        id: side === "north" ? 10 : 11,
        kind: "buried-coil",
        layer: "ground",
        position: side === "north" ? { x: 3_500, y: 24_000 } : { x: 3_500, y: 8_000 },
        side,
        targetId: null,
      });
      const source = createCombatViewModel({
        entities: [{ ...buriedCoil, hidden }],
        events: [],
        tick: 17,
        towers: [],
      });
      bindCombatViewModel(layer, source);
      const marker = layer.children[0].children.find(({ dataset }) =>
        dataset.kind === "buried-coil");
      const art = marker.children[1];
      const [image, plate] = art.children;
      const color = side === "north" ? "#C6452E" : "#2E7F86";
      assert.equal(marker.dataset.hidden, String(hidden));
      assert.equal(marker.dataset.structure, "true");
      assert.equal(art.dataset.hidden, String(hidden));
      assert.equal(art.dataset.form, hidden ? "hidden" : "revealed");
      assert.equal(art.attributes.get("viewBox"), "0 0 512 512");
      assert.equal(image.attributes.get("href"), new URL(
        hidden ? "../public/assets/buried-coil-hidden.webp" :
          "../public/assets/buried-coil-revealed.svg",
        import.meta.url,
      ).href);
      assert.deepEqual(Object.fromEntries(plate.attributes), {
        x: "38",
        y: side === "north" ? "-512" : "512",
        width: "436",
        height: "88",
        rx: "44",
        fill: color,
        "shape-rendering": "crispEdges",
        "aria-hidden": "true",
      });
      assert.equal(plate.dataset.teamColor, side);

      const checkpoint = serializeCombatViewModel(source);
      const restoredLayer = dom().layer;
      bindCombatViewModel(restoredLayer, restoreCombatViewModel(checkpoint));
      assert.equal(nodeBytes(restoredLayer), nodeBytes(layer),
        `${side}/hidden=${hidden} artwork restores byte-for-byte`);
      assert.equal(document, layer.ownerDocument);
    }
  }
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
    "c0aedecf124f2abdb75cadc59bdf9b7b6b0a82bbbfc8165a7c115217114b89e5",
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

test("ui combat state: a generic target reaction cannot fabricate a Briar Runner attack pose", () => {
  const runnerState = (tick, eventTick = null) => state({
    entities: [entity({
      id: 17,
      kind: "briar-runner",
      position: { x: 6_000, y: 12_000 },
      side: "south",
      targetId: "north:lane:left",
    })],
    events: eventTick === null ? [] : [
      { entityId: 17, sequence: 0, tick: eventTick, type: "target" },
    ],
    tick,
    towers: [tower({ targetId: null })],
  });
  const boundArt = (input) => {
    const { layer } = dom();
    const view = createCombatViewModel(input);
    bindCombatViewModel(layer, view);
    const runner = layer.children[0].children.find(({ dataset }) =>
      dataset.kind === "briar-runner");
    return { art: runner.children[1], bytes: nodeBytes(layer), runner, view };
  };

  const walking = boundArt(runnerState(40));
  assert.equal(walking.art.dataset.spriteAction, "walk");
  assert.equal(walking.art.dataset.spriteDirection, "north");
  assert.equal(walking.art.dataset.spriteFrame, "briar-walk-north-0");
  assert.equal(walking.art.dataset.simulationTick, "40");
  const atlas = walking.art.children.find(({ name }) => name === "image");
  assert.ok(atlas, "painted Briar Runner must render its atlas image node");
  assert.equal(atlas.attributes.get("href"),
    new URL("../public/assets/briar-runner-painted-sheet.png", import.meta.url).href);
  const southFootring = walking.art.children.find(({ dataset }) =>
    dataset.teamColor === "south");
  assert.equal(southFootring.attributes.get("fill"), "#2E7F86");

  const walkingNext = boundArt(runnerState(45));
  assert.equal(walkingNext.art.dataset.spriteFrame, "briar-walk-north-1");

  const targetReaction = boundArt(runnerState(42, 42));
  assert.equal(targetReaction.runner.dataset.reaction, "target");
  assert.equal(targetReaction.art.dataset.spriteAction, "walk");
  assert.equal(targetReaction.art.dataset.spriteFrame, "briar-walk-north-0");
  const restoredLayer = dom().layer;
  const restoredView = restoreCombatViewModel(serializeCombatViewModel(targetReaction.view));
  bindCombatViewModel(restoredLayer, restoredView);
  const restoredBytes = nodeBytes(restoredLayer);
  const restoredRunner = restoredLayer.children[0].children.find(({ dataset }) =>
    dataset.kind === "briar-runner");
  assert.equal(restoredBytes, targetReaction.bytes);
  assert.equal(restoredRunner.dataset.reaction, "target");
  assert.equal(restoredRunner.children[1].dataset.spriteAction, "walk");

  const reducedDocument = dom();
  reducedDocument.document.defaultView = {
    matchMedia(query) {
      assert.equal(query, "(prefers-reduced-motion: reduce)");
      return { matches: true };
    },
  };
  bindCombatViewModel(reducedDocument.layer, createCombatViewModel(runnerState(45)));
  const reducedRunner = reducedDocument.layer.children[0].children.find(({ dataset }) =>
    dataset.kind === "briar-runner");
  assert.equal(reducedRunner.children[1].dataset.spriteFrame, "briar-walk-north-0");
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

test("Kilnkeeper battle cutout keeps a team ring and enters the animated combat-art set", () => {
  const { document } = dom();
  const art = createCombatArt(document, "kilnkeeper", "south", "ground");
  assert.ok(COMBAT_ART_ARCHETYPES.includes("kilnkeeper"));
  assert.equal(art.dataset.artId, "kilnkeeper");
  assert.equal(art.attributes.get("viewBox"), "0 0 512 512");
  assert.deepEqual(art.children.map(({ name }) => name), ["ellipse", "image"]);
  assert.equal(art.children[0].attributes.get("stroke"), "#2E7F86");
  assert.equal(art.children[1].attributes.get("href"),
    new URL("../public/assets/kilnkeeper-battle-sprite.webp", import.meta.url).href);
});
