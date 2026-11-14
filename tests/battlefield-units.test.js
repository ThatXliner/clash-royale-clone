import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  bridgeDeckAt, createUnitLayer, groundHeightAt, PLACEMENT_SCALE, resolveModelKind,
} from "../src/ui/three/battlefield/units-layer.js";
import { createTowerSet, RUBBLE_MAX_HEIGHT } from "../src/ui/three/battlefield/towers.js";
import { createEffectLayer } from "../src/ui/three/battlefield/effects-layer.js";
import { createBattlefieldHost } from "../src/ui/three/battlefield/host.js";
import { createUnitModel, TEAM_COLORS, UNIT_MODEL_KINDS } from "../src/ui/three/units/index.js";
import { Color, Vector3 } from "../src/ui/three/three-module.js";

const ELEVATION = (47 * Math.PI) / 180;
const DEPTH = 1 / Math.sin(ELEVATION);
// Same mapping as scene.js boardToWorld (tiles → world).
const toWorld = (tx, ty) => [tx - 9, (16 - ty) * DEPTH];
const TICK_MS = 1000 / 60;

function layer({ reduced = false } = {}) {
  return createUnitLayer({ toWorld, elevation: ELEVATION, isReducedMotion: () => reduced });
}

function entity(id, kind, side, x, y, { layer: entityLayer = "ground", hp = 500, max = 500, hidden } = {}) {
  return {
    healthDenominator: max, healthNumerator: hp, id, key: `n:${id}`, kind, layer: entityLayer, side, x, y,
    ...(hidden === undefined ? {} : { hidden }),
  };
}

function view(tick, entities, links = []) {
  return { entities, links, tick, towers: [] };
}

function holderOf(units, key) {
  return units.group.children[0].children.find((node) => node.name === `entity:${key}`) ?? null;
}

function run(units, from, to, step = TICK_MS) {
  for (let now = from; now <= to; now += step) units.animate(now, step / 1000);
}

test("battlefield units: every runtime kind has a model and unknown kinds fall back by layer", () => {
  for (const kind of UNIT_MODEL_KINDS) assert.equal(resolveModelKind(kind, "ground"), kind);
  assert.equal(resolveModelKind("not-a-kind", "air"), "duskwing");
  assert.equal(resolveModelKind("not-a-kind", "ground"), "mossguard");
});

test("battlefield units: units spawn at boardToWorld with a uniform placement scale and team identity", () => {
  const units = layer();
  units.sync(view(1, [entity(1, "mossguard", "south", 3500, 6000), entity(2, "skymaul", "north", 14500, 25000,
    { layer: "air" })]), null, 0);
  run(units, 0, 100);
  const south = holderOf(units, "n:1");
  const north = holderOf(units, "n:2");
  const [x, z] = toWorld(3.5, 6);
  assert.ok(Math.abs(south.position.x - x) < 1e-6 && Math.abs(south.position.z - z) < 1e-6);
  assert.equal(south.scale.x, PLACEMENT_SCALE.unit);
  assert.equal(south.scale.z, PLACEMENT_SCALE.unit, "no depth stretch on models");
  assert.equal(south.children[0].userData.unitModel.side, "south");
  assert.equal(north.children[0].userData.unitModel.kind, "skymaul");
  // South starts facing north (away from the camera), north faces south.
  assert.ok(Math.abs(Math.abs(south.rotation.y) - Math.PI) < 1e-6);
  assert.ok(Math.abs(north.rotation.y) < 1e-6);
  units.dispose();
});

test("battlefield units: positions interpolate between ticks and facing turns smoothly toward travel", () => {
  const units = layer();
  units.sync(view(1, [entity(1, "mossguard", "south", 3000, 6000)]), null, 0);
  run(units, 0, 400);
  // Walk east one tile over 6 ticks.
  units.sync(view(7, [entity(1, "mossguard", "south", 4000, 6000)]), null, 500);
  units.animate(500 + 50, 0.05);
  const holder = holderOf(units, "n:1");
  const [x0] = toWorld(3, 6);
  const [x1] = toWorld(4, 6);
  assert.ok(holder.position.x > x0 + 0.3 && holder.position.x < x1 - 0.3, `mid-segment x ${holder.position.x}`);
  const yawEarly = holder.rotation.y;
  run(units, 600, 1200);
  assert.ok(Math.abs(holder.position.x - x1) < 1e-6, "arrives at the latest simulated position");
  // Facing east is yaw +π/2; turning is gradual, not a snap.
  assert.ok(Math.abs(yawEarly - Math.PI / 2) > 0.05);
  assert.ok(Math.abs(Math.cos(holder.rotation.y)) < 0.05 && Math.sin(holder.rotation.y) > 0.99);
  assert.equal(holder.children[0].userData.unitModel.kind, "mossguard");
  units.dispose();
});

test("battlefield units: the attack pose lands its blow on the simulated strike tick", () => {
  const units = layer();
  const target = entity(2, "coilblade", "north", 3500, 7200);
  const link = { fromKey: "n:1", toKey: "n:2", x1: 3500, y1: 6000, x2: 3500, y2: 7200 };
  const hints = (tick) => ({ spells: [], tick, lastCardPlay: { north: null, south: null }, units: [
    { attackPhase: "cycling", attackSequence: 3, deployTicks: 60, hitSpeedTicks: 72, id: 1, nextStrikeTick: 200,
      spawnedAt: 0, statusWork: false },
  ] });
  units.sync(view(100, [entity(1, "mossguard", "south", 3500, 6000), target], [link]), hints(100), 0);
  let now = 0;
  let started = null;
  for (let tick = 101; tick <= 200; tick += 1) {
    now += TICK_MS;
    units.sync(view(tick, [entity(1, "mossguard", "south", 3500, 6000), target], [link]), hints(tick), now);
    units.animate(now, TICK_MS / 1000);
    if (started === null && units.poseOf(1).pose === "attack") started = tick;
  }
  // The clip spans the sim cadence (72 ticks) and its blow lands at
  // attackStrike of it, so the wind-up begins strike × 72 ticks early.
  const expected = 200 - units.poseOf(1).strike * 72;
  assert.ok(started !== null, "attack pose started");
  assert.ok(Math.abs(started - expected) <= 2, `attack started at tick ${started}, expected ≈${expected}`);
  units.dispose();
});

test("battlefield units: damage plays a hit reaction and deaths topple across the screen, then recycle", () => {
  const units = layer();
  units.sync(view(1, [entity(1, "mossguard", "north", 9000, 20000)]), null, 0);
  run(units, 0, 700);
  const holder = holderOf(units, "n:1");
  const model = holder.children[0];
  units.sync(view(2, [entity(1, "mossguard", "north", 9000, 20000, { hp: 300 })]), null, 710);
  units.animate(720, 0.01);
  const flashed = [];
  model.traverse((node) => { if (node.isSkinnedMesh) flashed.push(node.material.name); });
  assert.ok(flashed.some((name) => name.includes(":flash:")), `hit flash on damage: ${flashed}`);
  // Gone from the view: a death plays, then the model returns to the pool.
  units.sync(view(3, []), null, 800);
  assert.equal(units.dyingCount, 1);
  run(units, 800, 1250);
  const mover = model.getObjectByName("mover");
  // Facing the camera (yaw 0) the fall is sideways (about local z), so the
  // lying figure reads across the screen instead of along the view axis.
  assert.ok(Math.abs(mover.rotation.z) > 0.8, `sideways topple ${mover.rotation.z}`);
  assert.ok(Math.abs(mover.rotation.x) < 1e-6);
  run(units, 1250, 2400);
  assert.equal(units.count, 0);
  assert.equal(holder.parent, null);
  // The pooled model is reused for the next unit of the same kind and side.
  units.sync(view(4, [entity(9, "mossguard", "north", 3000, 20000)]), null, 2500);
  assert.equal(holderOf(units, "n:9").children[0], model);
  units.dispose();
});

test("battlefield units: overlapping swarm members are spread apart in presentation only", () => {
  const units = layer();
  const members = [1, 2, 3, 4].map((id) => entity(id, "cinderling", "north", 9000, 22000));
  units.sync(view(1, members), null, 0);
  run(units, 0, 1500);
  const positions = members.map((member) => holderOf(units, member.key).position.clone());
  for (let a = 0; a < positions.length; a += 1) {
    for (let b = a + 1; b < positions.length; b += 1) {
      assert.ok(positions[a].distanceTo(positions[b]) > 0.2, "members no longer share one spot");
    }
  }
  const [cx, cz] = toWorld(9, 22);
  for (const position of positions) {
    assert.ok(Math.hypot(position.x - cx, (position.z - cz) / DEPTH) <= 0.62 + 1e-6, "offset stays bounded");
  }
  units.dispose();
});

test("battlefield units: the buried coil's hidden state and bridge decks are honoured", () => {
  const units = layer();
  units.sync(view(1, [entity(5, "buried-coil", "north", 9000, 21000, { hidden: true, max: 1152, hp: 1152 })]), null, 0);
  run(units, 0, 600);
  assert.equal(units.count, 1);
  assert.equal(groundHeightAt(3.5, 16) > 0.2, true, "bridge deck lifts ground units");
  assert.equal(groundHeightAt(9, 16), 0);
  assert.equal(groundHeightAt(3.5, 10), 0);
  units.dispose();
});

function meshNamed(units, name) {
  return units.group.children.find((node) => node.name === name) ?? null;
}

function instanceColor(mesh, index) {
  const colors = mesh.instanceColor.array;
  return [colors[index * 3], colors[index * 3 + 1], colors[index * 3 + 2]];
}

test("battlefield units: every model shows its side in its own body from the 47° camera", () => {
  // Share of the camera-facing surface painted in strong team colours (main,
  // dark, glow), for every kind, side and facing: no overlay marker needed.
  const view = new Vector3(0, Math.sin(ELEVATION), Math.cos(ELEVATION));
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const normal = new Vector3();
  const colour = new Color();
  for (const kind of UNIT_MODEL_KINDS) {
    for (const side of ["south", "north"]) {
      const team = [TEAM_COLORS[side].main, TEAM_COLORS[side].dark, TEAM_COLORS[side].glow].map((hex) => new Color(hex));
      for (const yaw of [0, Math.PI, Math.PI / 2]) {
        const model = createUnitModel(kind, side);
        model.setPose("idle");
        model.update(0.6);
        model.object.rotation.y = yaw;
        model.object.updateMatrixWorld(true);
        let teamArea = 0;
        let total = 0;
        for (const mesh of model.parts.meshes) {
          const positions = mesh.geometry.attributes.position;
          const colours = mesh.geometry.attributes.color;
          for (let index = 0; index < positions.count; index += 3) {
            mesh.getVertexPosition(index, a).applyMatrix4(mesh.matrixWorld);
            mesh.getVertexPosition(index + 1, b).applyMatrix4(mesh.matrixWorld);
            mesh.getVertexPosition(index + 2, c).applyMatrix4(mesh.matrixWorld);
            const facing = normal.subVectors(b, a).cross(c.sub(a)).dot(view) / 2;
            if (facing <= 0) continue;
            total += facing;
            colour.fromBufferAttribute(colours, index);
            if (team.some((t) => Math.abs(t.r - colour.r) + Math.abs(t.g - colour.g) + Math.abs(t.b - colour.b) < 0.03)) {
              teamArea += facing;
            }
          }
        }
        model.dispose();
        assert.ok(teamArea / total >= 0.15, `${kind} ${side} shows its side (${(teamArea / total).toFixed(2)})`);
      }
    }
  }
});

test("battlefield units: no marker covers a full-health unit; a hurt unit's bar is in team colours", () => {
  const units = layer();
  units.sync(view(1, [
    entity(1, "briar-darter", "south", 3500, 10000),
    entity(2, "briar-darter", "north", 3500, 22000),
    entity(3, "briar-darter", "north", 9000, 22000, { hp: 200 }),
  ]), null, 0);
  run(units, 0, 400);
  const bars = meshNamed(units, "health-fill");
  const frames = meshNamed(units, "health-frame");
  assert.equal(bars.count, 1, "only the hurt unit carries an overlay");
  assert.equal(units.group.children.some((node) => /badge/u.test(node.name)), false);
  // The bar frame (its empty track) and fill stay in the unit's team colour.
  const [r, g, b] = instanceColor(frames, 0);
  assert.ok(r > g && r > b, "north bar frame is warm");
  const [fr, fg, fb] = instanceColor(bars, 0);
  assert.ok(fr > fg && fr > fb, "north bar fill is warm");
  units.dispose();
});

test("battlefield units: a flyer just behind a deck swarm flies lower instead of burying it", () => {
  const units = layer();
  const swarm = [1, 2, 3, 4, 5, 6].map((id) => entity(id, "cinderling", "south", 3500, 15500 + (id % 3) * 200));
  // The flyer's ground spot is south of the swarm, so at full height its body is drawn right over it.
  const flyer = entity(9, "duskwing", "south", 3500, 14200, { layer: "air" });
  const lone = entity(10, "duskwing", "south", 9000, 8000, { layer: "air" });
  units.sync(view(1, [...swarm, flyer, lone]), null, 0);
  run(units, 0, 1500);
  const liftOf = (key) => holderOf(units, key).getObjectByName("lift").position.y;
  assert.ok(liftOf("n:9") < liftOf("n:10") * 0.6, "the flyer behind the swarm dips");
  const holder = holderOf(units, "n:9");
  const [fx, fz] = toWorld(3.5, 14.2);
  assert.ok(Math.hypot(holder.position.x - fx, (holder.position.z - fz) / DEPTH) <= 0.5 + 1e-6,
    "and keeps within half a tile of its simulated spot");
  const xs = swarm.map((member) => holderOf(units, member.key).position.x + 9);
  const [west, east] = bridgeDeckAt(3.5, 15.5);
  for (const x of xs) assert.ok(x > west && x < east, "the swarm stays on the deck");
  units.dispose();
});

test("battlefield units: a same-kind swarm packed on a bridge deck fans out so each member has its own footprint", () => {
  const units = layer();
  // Seven cinderlings on two exact sim spots, as in a real bridge push.
  const swarm = [1, 2, 3, 4, 5, 6, 7].map((id) => entity(id, "cinderling", "south", 3500, id < 3 ? 16650 : 16700));
  units.sync(view(2, swarm), null, 0);
  run(units, 0, 2000);
  const spots = swarm.map((member) => {
    const position = holderOf(units, member.key).position;
    return [position.x + 9, 16 - position.z / DEPTH];
  });
  let closest = Infinity;
  for (let a = 0; a < spots.length; a += 1) {
    for (let b = a + 1; b < spots.length; b += 1) {
      closest = Math.min(closest, Math.hypot(spots[a][0] - spots[b][0], spots[a][1] - spots[b][1]));
    }
  }
  assert.ok(closest >= 0.5, `members stand apart (closest ${closest.toFixed(2)} tiles)`);
  const [west, east] = bridgeDeckAt(3.5, 16.7);
  for (const [x] of spots) assert.ok(x > west && x < east, "on the deck between the rails");
  const ys = spots.map(([, y]) => y);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 0.9, "the block runs along the deck");
  units.dispose();
});


test("battlefield units: a column on a bridge fans out across the deck but never off it", () => {
  const units = layer();
  const column = [1, 2, 3, 4, 5].map((id) => entity(id, "thornscout", "south", 3500, 15600 + id * 120));
  units.sync(view(1, column), null, 0);
  run(units, 0, 1500);
  const xs = column.map((member) => holderOf(units, member.key).position.x + 9);
  const [west, east] = bridgeDeckAt(3.5, 16);
  for (const x of xs) assert.ok(x > west + 0.2 && x < east - 0.2, `stays on the deck (${x.toFixed(2)})`);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 0.4, "the column steps aside into staggered files");
  assert.equal(bridgeDeckAt(9, 16), null);
  assert.equal(bridgeDeckAt(3.5, 10), null);
  units.dispose();
});

test("battlefield units: a tower plate knows when a unit stands under it", () => {
  const units = layer();
  units.sync(view(1, [entity(1, "coilblade", "south", 3500, 24000)]), null, 0);
  run(units, 0, 100);
  // North west lane tower plate: centred 1.95 world units south of the tower, just off the ground.
  const [x, z] = toWorld(3.5, 25.5);
  assert.equal(units.coversPlate(x, 0.2, z + 1.95, 1.25, 0.39), true);
  const [fx, fz] = toWorld(14.5, 25.5);
  assert.equal(units.coversPlate(fx, 0.2, fz + 1.95, 1.25, 0.39), false);
  units.dispose();
});

function fakeCanvasDocument() {
  const context = new Proxy({}, { get: (target, key) => key in target ? target[key]
    : () => ({ addColorStop() {} }) });
  return { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
}

function visibleMaxY(root) {
  let max = -Infinity;
  root.updateMatrixWorld(true);
  root.traverseVisible((node) => {
    if (!node.isMesh) return;
    node.geometry.computeBoundingBox();
    const box = node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld);
    max = Math.max(max, box.max.y);
  });
  return max;
}

test("battlefield towers: rubble stays low enough to walk across and covered plates fade back", () => {
  const towers = createTowerSet({ document: fakeCanvasDocument(), toWorld, isReducedMotion: () => false });
  const tower = (destroyed) => ({ id: "north:lane:west", key: "t:nw", role: "lane", side: "north", x: 3500, y: 25500,
    healthDenominator: 3052, healthNumerator: destroyed ? 0 : 3052, destroyed });
  towers.update([tower(false)], 0);
  assert.ok(visibleMaxY(towers.group) > 3, "a standing tower is tall");
  const label = towers.group.children[0].children.find((node) => node.isSprite);
  for (let now = 0; now <= 600; now += 16) towers.animate(now, () => true);
  assert.ok(label.material.opacity < 0.5, "a plate with a unit under it fades back");
  for (let now = 616; now <= 1200; now += 16) towers.animate(now, () => false);
  assert.equal(label.material.opacity, 1, "and returns once the unit has gone");
  towers.update([tower(true)], 1300);
  assert.ok(visibleMaxY(towers.group) <= RUBBLE_MAX_HEIGHT + 0.08, "rubble is a low ruin");
  towers.dispose();
});

test("battlefield host: a neutral loading panel replaces the flat arena until the renderer settles", async () => {
  const element = () => {
    const node = {
      dataset: {}, children: [], parent: null, className: "", textContent: "",
      setAttribute() {}, append(...nodes) { for (const child of nodes) { child.parent = node; node.children.push(child); } },
      remove() {
        if (node.parent === null) return;
        node.parent.children.splice(node.parent.children.indexOf(node), 1);
        node.parent = null;
      },
    };
    return node;
  };
  const document = {
    createElement(name) {
      if (name === "canvas") return { getContext: () => null, addEventListener() {} };
      return element();
    },
  };
  const shell = element();
  Object.defineProperty(shell, "firstChild", { get: () => shell.children[0] ?? null });
  shell.insertBefore = (node) => { node.parent = shell; shell.children.unshift(node); };
  const timers = [];
  const window = { setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {} };
  const host = createBattlefieldHost({ document, window });
  host.attach(shell);
  assert.equal(shell.dataset.renderer, "loading");
  const panel = shell.children.find((node) => node.dataset.ui === "battlefield-loading");
  assert.ok(panel, "loading panel mounted in the shell");
  const style = panel.children.find((node) => node.textContent.includes('[data-renderer="loading"]'));
  assert.ok(style.textContent.includes(".arena>.tower-pad"), "the flat arena art is hidden while loading");
  assert.equal(await host.ready, "dom");
  assert.equal(shell.dataset.renderer, "dom");
  assert.equal(shell.children.includes(panel), false, "the DOM fallback shows the flat arena again");
  host.dispose();
});

test("battlefield effects: feed launches projectiles once, places team-tinted spell areas, never replays history", () => {
  const units = layer();
  // Two shooters share one spot, so the drawn shooter is spread off the sim point.
  units.sync(view(10, [entity(1, "brassbolt", "south", 3500, 12000), entity(3, "brassbolt", "south", 3500, 12000),
    entity(2, "mossguard", "north", 3500, 18000)]), null, 0);
  run(units, 0, 1000);
  const towers = new Map();
  const effects = createEffectLayer({
    toWorld, elevation: ELEVATION, depthScale: DEPTH, isReducedMotion: () => false, units,
    towerAnchor: (id) => towers.get(id) ?? null,
  });
  const source = {};
  const point = (x, y) => ({ denominator: "1", xNumerator: String(x), yNumerator: String(y) });
  const events = [
    { eventId: 1, parentId: null, phase: "open", rootId: "projectile.unit-to-unit.1.none.1.1", tick: 10, type: "projectile",
      payload: { direction: "unit-to-unit", effectId: null, from: point(3500, 12000), impactTick: 14, projectileId: 1,
        radius: 0, segments: [], sequence: 1, sourceId: 1, to: point(3500, 18000) } },
  ];
  effects.sync({ areas: [], events: [], tick: 9 }, null, 0, source);
  effects.sync({ areas: [], events, tick: 10 }, null, 10, source);
  assert.equal(effects.counts.projectiles, 1);
  const [flight] = effects.flights;
  const shooter = units.anchor(1);
  const [simX, simZ] = toWorld(3.5, 12);
  assert.ok(Math.hypot(shooter.x - simX, shooter.z - simZ) > 0.1, "the shooter is drawn off its sim point");
  assert.ok(Math.hypot(flight.from[0] - shooter.x, flight.from[1] - shooter.z) < 1e-6, "the shot leaves the drawn shooter");
  const target = units.anchor(2);
  assert.ok(Math.hypot(flight.to[0] - target.x, flight.to[1] - target.z) < 1e-6, "and lands on the drawn target");
  effects.sync({ areas: [], events, tick: 11 }, null, 20, source);
  assert.equal(effects.counts.projectiles, 1, "a record is consumed once");
  events.push({ eventId: 2, parentId: null, phase: "open", rootId: "area.area.none.7.none.none", tick: 12, type: "area",
    payload: { direction: "area", effectId: 7, from: point(3500, 18000), impactTick: 12, projectileId: null, radius: 2500,
      segments: [], sequence: null, sourceId: null, to: null } });
  const hints = { spells: [{ cardId: "squall-orb", effectId: 7, impactTick: 12, side: "south", x: 3500, y: 18000 }],
    tick: 12, units: [], lastCardPlay: { north: null, south: null } };
  effects.sync({ areas: [], events, tick: 12 }, hints, 30, source);
  assert.equal(effects.counts.decals, 1);
  assert.equal(effects.counts.orbs, 1, "the squall orb prop drops into its area");
  const decal = effects.group.children.find((node) => node.isGroup && node.visible && node.children.length === 3);
  assert.ok(decal.children[0].material.color.getHexString() === "3fa7b5", "south spell is tinted south");
  effects.animate(100, 0.07);
  assert.ok(effects.counts.projectiles <= 1);
  // A remounted session never replays the earlier feed.
  effects.sync({ areas: [], events, tick: 12 }, hints, 40, {});
  assert.equal(effects.counts.projectiles + effects.counts.decals + effects.counts.orbs, 0);
  effects.animate(2000, 0.1);
  assert.equal(effects.activeCount, 0, "every visual expires on the wall clock");
  effects.dispose();
  units.dispose();
});

test("battlefield host: readiness settles to the DOM fallback when WebGL is unavailable", async () => {
  const document = {
    createElement(name) {
      if (name === "canvas") return { getContext: () => null, addEventListener() {} };
      return { appendChild() {}, setAttribute() {}, dataset: {}, style: {} };
    },
  };
  const timers = [];
  const window = { setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {} };
  const host = createBattlefieldHost({ document, window });
  assert.equal(host.isReady, false);
  assert.equal(await host.ready, "dom");
  assert.equal(host.isReady, true);
  host.dispose();
});

test("battlefield scene: 3D mode hides DOM unit and effect visuals but keeps their nodes", () => {
  const source = readFileSync(new URL("../src/ui/three/battlefield/scene.js", import.meta.url), "utf8");
  for (const selector of [".combat-marker--entity-ground", ".combat-marker--entity-air", ".combat-target-link",
    ".combat-effects__frame"]) {
    assert.ok(source.includes(`.battle-shell[data-renderer="three"] ${selector}`), selector);
  }
});
