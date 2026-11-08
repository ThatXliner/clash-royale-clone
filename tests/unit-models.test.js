import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { Box3, Color, Object3D, Scene, Vector3 } from "../src/ui/three/three-module.js";
import {
  createEffectModel,
  createUnitModel,
  disposeUnitModelCaches,
  EFFECT_MODEL_KINDS,
  TEAM_COLORS,
  UNIT_MODEL_KINDS,
  UNIT_POSES,
} from "../src/ui/three/units/index.js";
import { EDITABLE_MIXED_DECK_CARD_IDS } from "../src/content/editable-deck.js";
import { projectSessionTroopBattleCard } from "../src/content/session-troop-roster.js";
import { projectSessionNonUnitBattleCard } from "../src/content/session-card-catalog.js";
import { COMBAT_ART_ARCHETYPES, COMBAT_STRUCTURE_ART_IDS } from "../src/ui/combat-art.js";

const SIDES = ["south", "north"];
const SWARM_MEMBERS = new Set(["cinderling", "gloamwing", "coppershade", "briar-runner", "briar-darter", "thornscout", "forgeguard"]);
const MAX_DRAW_CALLS = 6;

// Every entity the 24-card collection can put on the field, with its layer.
function spawnableEntities() {
  const entities = new Map();
  const effects = new Set();
  for (const cardId of EDITABLE_MIXED_DECK_CARD_IDS) {
    let troop = null;
    try {
      troop = projectSessionTroopBattleCard(cardId);
    } catch {
      troop = null;
    }
    if (troop !== null) {
      for (const entity of troop.entities) entities.set(entity.archetypeId, entity.layer);
      continue;
    }
    const card = projectSessionNonUnitBattleCard(cardId);
    if (card.kind === "structure") entities.set(card.id, "structure");
    else if (card.kind === "effect") effects.add(card.id);
    else throw new Error(`unexpected card kind ${card.kind} for ${cardId}`);
    for (const entity of card.entities) entities.set(entity.archetypeId, entity.layer);
  }
  return { entities, effects };
}

function collect(object) {
  const geometries = new Set();
  const materials = new Set();
  object.traverse((node) => {
    if (!node.isMesh) return;
    geometries.add(node.geometry);
    for (const material of [node.material].flat()) materials.add(material);
  });
  return { geometries, materials };
}

function triangles(object) {
  let total = 0;
  object.traverse((node) => {
    if (!node.isMesh) return;
    const g = node.geometry;
    total += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return total;
}

// Vertex colours baked into the model, as rounded linear RGB keys.
function bakedColours(object) {
  const keys = new Set();
  object.traverse((node) => {
    const colours = node.isSkinnedMesh ? node.geometry.attributes.color : null;
    if (!colours) return;
    for (let i = 0; i < colours.count; i += 1) {
      keys.add([colours.getX(i), colours.getY(i), colours.getZ(i)].map((v) => v.toFixed(3)).join(","));
    }
  });
  return keys;
}
const colourKey = (hex) => {
  const c = new Color(hex);
  return [c.r, c.g, c.b].map((v) => v.toFixed(3)).join(",");
};

// Skinned bounds after posing (bone matrices must be refreshed first).
function posedBounds(model) {
  model.object.updateMatrixWorld(true);
  const box = new Box3();
  for (const mesh of model.parts.meshes) {
    mesh.skeleton.update();
    mesh.computeBoundingBox();
    box.union(mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  }
  return box;
}

function snapshot(object) {
  const values = [];
  object.updateMatrixWorld(true);
  object.traverse((node) => values.push(node.visible, ...node.matrixWorld.elements.map((v) => Math.round(v * 1e6))));
  return values.join(",");
}

test("UNIT_MODEL_KINDS is a frozen list of unique kinds", () => {
  assert.ok(Object.isFrozen(UNIT_MODEL_KINDS));
  assert.ok(Object.isFrozen(EFFECT_MODEL_KINDS));
  assert.equal(new Set(UNIT_MODEL_KINDS).size, UNIT_MODEL_KINDS.length);
  assert.deepEqual([...UNIT_POSES].sort(), ["attack", "death", "deploy", "hit", "idle", "walk"]);
});

test("the kit reaches three only through the pinned import seam", () => {
  const dir = new URL("../src/ui/three/units/", import.meta.url);
  for (const file of readdirSync(dir)) {
    const source = readFileSync(new URL(file, dir), "utf8");
    const specifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const specifier of specifiers) {
      assert.ok(specifier.startsWith("./") || specifier === "../three-module.js" ||
        specifier === "../battlefield/palette.js", `${file} imports ${specifier}`);
    }
  }
});

test("every entity kind the 24-card collection can spawn has a model with the matching layer", () => {
  assert.equal(EDITABLE_MIXED_DECK_CARD_IDS.length, 24);
  const { entities, effects } = spawnableEntities();
  assert.ok(entities.size >= 23, `expected the collection to spawn at least 23 kinds, found ${entities.size}`);
  for (const [kind, layer] of entities) {
    assert.ok(UNIT_MODEL_KINDS.includes(kind), `missing model for spawnable kind ${kind}`);
    assert.equal(createUnitModel(kind, "south").layer, layer, `${kind} layer`);
  }
  for (const kind of effects) assert.ok(EFFECT_MODEL_KINDS.includes(kind), `missing effect prop for ${kind}`);
  for (const kind of [...COMBAT_ART_ARCHETYPES, ...COMBAT_STRUCTURE_ART_IDS]) {
    assert.ok(UNIT_MODEL_KINDS.includes(kind), `missing model for combat art id ${kind}`);
  }
});

test("every kind builds for both sides within triangle and draw-call budgets", () => {
  for (const kind of UNIT_MODEL_KINDS) {
    for (const side of SIDES) {
      const model = createUnitModel(kind, side);
      assert.ok(model.object instanceof Object3D, kind);
      assert.ok(["ground", "air", "structure"].includes(model.layer), `${kind} layer ${model.layer}`);
      assert.ok(model.height >= 0.5 && model.height <= 3, `${kind} height ${model.height}`);
      assert.equal(model.object.position.y, 0, `${kind} origin on the ground`);
      const tris = triangles(model.object);
      assert.ok(tris > 50 && tris < 1500, `${kind} has ${tris} triangles`);
      if (SWARM_MEMBERS.has(kind)) assert.ok(tris < 700, `${kind} swarm member has ${tris} triangles`);
      assert.ok(model.drawCalls <= MAX_DRAW_CALLS, `${kind} costs ${model.drawCalls} draw calls`);
      let casters = 0;
      let flat = true;
      model.object.traverse((node) => {
        if (!node.isMesh) return;
        if (node.castShadow) casters += 1;
        if (node.material.isMeshStandardMaterial && node.material.flatShading !== true) flat = false;
      });
      assert.ok(flat, `${kind} uses flat-shaded standard materials`);
      assert.ok(model.parts.teamRing, `${kind} has a team ring`);
      if (model.parts.shadow) assert.equal(casters, 0, `${kind} uses a blob instead of a cast shadow`);
      else assert.equal(casters, 1, `${kind} casts one shadow`);
      if (model.layer === "air") assert.ok(model.parts.shadow, `${kind} flyer has a shadow blob`);
    }
  }
  for (const kind of EFFECT_MODEL_KINDS) {
    const model = createEffectModel(kind, "north");
    assert.equal(model.layer, "effect");
    assert.ok(triangles(model.object) < 1500);
  }
});

test("unknown kinds, sides, poses and timings are rejected", () => {
  assert.throws(() => createUnitModel("not-a-unit", "south"), RangeError);
  assert.throws(() => createUnitModel("squall-orb", "south"), RangeError);
  assert.throws(() => createEffectModel("coilblade", "south"), RangeError);
  assert.throws(() => createUnitModel("coilblade", "east"), RangeError);
  const model = createUnitModel("coilblade", "south");
  assert.throws(() => model.setPose("dance"), RangeError);
  assert.throws(() => model.update(-1), RangeError);
  assert.throws(() => model.setPose("attack", { duration: 0 }), RangeError);
  assert.throws(() => model.setTimeScale(-1), RangeError);
});

test("poses cycle without throwing and death completes", () => {
  for (const kind of [...UNIT_MODEL_KINDS, ...EFFECT_MODEL_KINDS]) {
    for (const reducedMotion of [false, true]) {
      const make = EFFECT_MODEL_KINDS.includes(kind) ? createEffectModel : createUnitModel;
      const model = make(kind, "north", { reducedMotion });
      for (const pose of ["deploy", "idle", "walk", "attack", "hit", "walk", "attack", "idle"]) {
        model.setPose(pose);
        for (let i = 0; i < 40; i += 1) assert.equal(model.update(1 / 30), false, `${kind} ${pose}`);
      }
      model.setPose("death");
      let done = false;
      let seconds = 0;
      while (!done && seconds < 3) {
        done = model.update(1 / 30);
        seconds += 1 / 30;
      }
      assert.ok(done, `${kind} death finished`);
      assert.ok(seconds < 1.6, `${kind} death took ${seconds}s`);
      assert.equal(model.update(1 / 30), true, `${kind} stays dead`);
      assert.equal(model.pose, "death");
      model.setPose("deploy");
      assert.equal(model.update(1 / 30), false, `${kind} can be revived for pooling`);
    }
  }
});

test("attack clips stretch to a caller-supplied duration and time scale", () => {
  const strikeFrame = (model, seconds) => {
    // The weapon arm moves most at the strike; sample a frame there.
    const frames = [];
    for (let t = 0; t <= seconds + 1e-9; t += seconds / 20) {
      frames.push(snapshot(model.object));
      model.update(seconds / 20);
    }
    return frames;
  };
  const fast = createUnitModel("ironroot", "north");
  const slow = createUnitModel("ironroot", "north");
  fast.setPose("idle");
  slow.setPose("idle");
  fast.setPose("attack");
  slow.setPose("attack", { duration: 1.5 });
  assert.equal(slow.attackSeconds, 1.5);
  assert.ok(fast.attackSeconds < 1.5);
  assert.ok(slow.attackStrike > 0 && slow.attackStrike < 1);
  // Normalised timelines match: frame k of the 1.5 s clip equals frame k of the default clip.
  assert.deepEqual(strikeFrame(slow, 1.5).slice(0, 18), strikeFrame(fast, fast.attackSeconds).slice(0, 18));

  const scaled = createUnitModel("ironroot", "north");
  const plain = createUnitModel("ironroot", "north");
  scaled.setTimeScale(2);
  for (const model of [scaled, plain]) model.setPose("walk");
  scaled.update(0.1);
  plain.update(0.2);
  assert.equal(snapshot(scaled.object), snapshot(plain.object));
});

test("poses visibly change the model and animation is deterministic", () => {
  for (const kind of UNIT_MODEL_KINDS) {
    const a = createUnitModel(kind, "south");
    const b = createUnitModel(kind, "south");
    const run = (model) => {
      const frames = [];
      for (const pose of ["idle", "walk", "attack", "hit", "death"]) {
        model.setPose(pose);
        for (let i = 0; i < 9; i += 1) model.update(0.037);
        frames.push(snapshot(model.object));
      }
      return frames;
    };
    const framesA = run(a);
    assert.deepEqual(run(b), framesA, `${kind} deterministic`);
    assert.ok(new Set(framesA).size >= 4, `${kind} poses differ from each other`);
  }
});

test("side colours differ and use the team palette", () => {
  for (const kind of UNIT_MODEL_KINDS) {
    const colours = {};
    for (const side of SIDES) {
      const model = createUnitModel(kind, side);
      const other = side === "south" ? "north" : "south";
      colours[side] = bakedColours(model.object);
      assert.ok(colours[side].has(colourKey(TEAM_COLORS[side].main)), `${kind} ${side} uses its team colour`);
      for (const role of ["main", "dark", "light"]) {
        assert.ok(!colours[side].has(colourKey(TEAM_COLORS[other][role])), `${kind} ${side} avoids the ${other} ${role}`);
      }
      assert.equal(`#${model.parts.teamRing.material.color.getHexString().toUpperCase()}`, TEAM_COLORS[side].main);
    }
    assert.notDeepEqual([...colours.south].sort(), [...colours.north].sort(), `${kind} sides differ`);
  }
  assert.notEqual(TEAM_COLORS.south.main, TEAM_COLORS.north.main);
});

test("geometry and materials are shared through module caches", () => {
  for (const kind of UNIT_MODEL_KINDS) {
    const first = collect(createUnitModel(kind, "south").object);
    const second = collect(createUnitModel(kind, "south").object);
    const opposing = collect(createUnitModel(kind, "north").object);
    for (const g of second.geometries) assert.ok(first.geometries.has(g), `${kind} geometry identity`);
    for (const m of second.materials) assert.ok(first.materials.has(m), `${kind} material identity`);
    const sharedMaterials = [...opposing.materials].filter((m) => first.materials.has(m));
    assert.ok(sharedMaterials.length > 0, `${kind} body materials shared across sides`);
  }
});

test("hit flash tints toward the model's own side and restores the original", () => {
  const model = createUnitModel("mossguard", "south");
  model.setPose("idle");
  model.update(0.6);
  const before = collect(model.object).materials;
  model.setPose("hit");
  model.update(0.02);
  const during = [...collect(model.object).materials].filter((m) => !before.has(m));
  assert.ok(during.length > 0, "flash materials applied");
  for (const material of during) {
    assert.equal(`#${material.emissive.getHexString().toUpperCase()}`, TEAM_COLORS.south.main, "flash keeps team hue");
    assert.ok(material.emissiveIntensity <= 0.35, "flash stays below wash-out");
  }
  assert.ok(model.parts.teamRing.visible, "team ring survives the flash");
  const other = createUnitModel("mossguard", "south");
  other.setPose("idle");
  other.update(0.6);
  for (const m of collect(other.object).materials) assert.ok(before.has(m), "other instances do not flash");
  model.update(0.3);
  assert.deepEqual([...collect(model.object).materials].sort(), [...before].sort());
});

test("buried-coil hides and reveals; other kinds ignore hidden state", () => {
  const coil = createUnitModel("buried-coil", "north");
  coil.setHidden(true, { immediate: true });
  coil.update(0.01);
  const turret = coil.object.getObjectByName("turret");
  assert.ok(turret.scale.x < 0.01, "hidden turret collapses");
  coil.setHidden(false);
  for (let i = 0; i < 30; i += 1) coil.update(1 / 30);
  assert.ok(turret.scale.x > 0.5, "revealed turret is full size");
  const blade = createUnitModel("coilblade", "north");
  assert.doesNotThrow(() => blade.setHidden(true));
});

test("flyers hover above a ground-level origin; ground units stand on it", () => {
  for (const kind of UNIT_MODEL_KINDS) {
    const model = createUnitModel(kind, "south");
    model.setPose("idle");
    model.update(0.5);
    const box = posedBounds(model);
    if (model.layer === "air") assert.ok(box.min.y > 0.4, `${kind} hovers (min y ${box.min.y})`);
    else assert.ok(box.min.y < 0.1, `${kind} stands on the ground (min y ${box.min.y})`);
    // Stormkite's kite flies well above the keeper; its height marks the keeper.
    const ceiling = kind === "stormkite" ? 2.6 : model.height * 1.6;
    assert.ok(box.max.y > model.height * 0.6 && box.max.y < ceiling,
      `${kind} height ${model.height} vs visual top ${box.max.y}`);
    assert.ok(Math.abs(box.getCenter(new Vector3()).x) < 1.2, `${kind} centred on its origin`);
  }
});

test("dispose detaches the instance without freeing shared resources", () => {
  const scene = new Scene();
  const model = createUnitModel("ironroot", "south");
  scene.add(model.object);
  const { geometries, materials } = collect(model.object);
  let disposed = 0;
  for (const g of geometries) g.addEventListener("dispose", () => { disposed += 1; });
  for (const m of materials) m.addEventListener("dispose", () => { disposed += 1; });
  model.dispose();
  model.dispose();
  assert.equal(model.object.parent, null);
  assert.equal(disposed, 0);
  assert.equal(model.update(0.1), true, "disposed models report finished");
  assert.throws(() => model.setPose("idle"));
  const again = collect(createUnitModel("ironroot", "south").object);
  for (const g of again.geometries) assert.ok(geometries.has(g), "cache survives instance dispose");

  disposeUnitModelCaches();
  assert.ok(disposed >= geometries.size, "cache dispose frees shared resources");
  const rebuilt = collect(createUnitModel("ironroot", "south").object);
  for (const g of rebuilt.geometries) assert.ok(!geometries.has(g), "caches rebuild after dispose");
});

test("100 mixed units stay within the draw-call budget; 500 share resources", () => {
  let drawCalls = 0;
  const models = [];
  for (let i = 0; i < 500; i += 1) {
    const model = createUnitModel(UNIT_MODEL_KINDS[i % UNIT_MODEL_KINDS.length], i % 2 ? "south" : "north");
    if (i < 100) drawCalls += model.drawCalls;
    models.push(model);
  }
  assert.ok(drawCalls <= 100 * MAX_DRAW_CALLS, `${drawCalls} draw calls for 100 units`);
  const geometries = new Set();
  const materials = new Set();
  for (const model of models) {
    const used = collect(model.object);
    for (const g of used.geometries) geometries.add(g);
    for (const m of used.materials) materials.add(m);
  }
  assert.ok(geometries.size < 200, `${geometries.size} geometries for 500 models`);
  assert.ok(materials.size < 16, `${materials.size} materials for 500 models`);
  for (const model of models) model.update(1 / 60);
  for (const model of models) model.dispose();
});
