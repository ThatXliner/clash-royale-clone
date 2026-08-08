import assert from "node:assert/strict";
import test from "node:test";

import {
  PelletEncounter,
  PierceEncounter,
  ReturnEncounter,
  ReturningSpellEncounter,
  TravelingLineSpellEncounter,
  createPelletSpecialFixture,
  createPierceSpecialFixture,
  createReturnSpecialFixture,
  createReturningSpellFixture,
  createTravelingLineSpellFixture,
} from "../src/content/index.js";
import { AreaDamageSystem } from "../src/sim/area-damage.js";
import { ProjectileCombat } from "../src/sim/projectile.js";
import { position, radius } from "../src/sim/spatial.js";
import { targetCandidate } from "../src/sim/targeting.js";

import {
  COMBAT_EFFECT_EVENT_LIMIT,
  bindCombatEffectsViewModel,
  createCombatEffectsViewModel,
  restoreCombatEffectsViewModel,
  serializeCombatEffectsViewModel,
} from "../src/ui/combat-effects.js";

function point(x, y) { return { x, y }; }
function projectileLaunch(overrides = {}) {
  return {
    projectile: {
      attackerId: 9, damage: 12, id: 1, impactTick: 10, launchTick: 0,
      origin: point(1000, 2000), targetPosition: point(5000, 6000),
      radius: 100, speed: 500, targetId: 10, targetRadius: 200,
      ...overrides,
    },
    tick: overrides.launchTick ?? 0,
    type: "launch",
  };
}

class Node {
  constructor(ownerDocument, name) {
    this.ownerDocument = ownerDocument;
    this.name = name;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.className = "";
    this.style = { values: new Map(), setProperty: (key, value) => this.style.values.set(key, value) };
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this.attributes.set(key, value); }
}
function dom() {
  const document = {
    createElement(name) { return new Node(document, name); },
    createElementNS(_namespace, name) { return new Node(document, name); },
  };
  return { document, layer: new Node(document, "layer") };
}
function bytes(node) {
  return JSON.stringify({
    attributes: [...node.attributes], children: node.children.map(bytes), className: node.className,
    dataset: Object.entries(node.dataset).sort(), name: node.name, style: [...node.style.values].sort(),
  });
}

test("ui combat effects: projectile launch and travel use exact rational millitiles", () => {
  const view = createCombatEffectsViewModel({ events: [projectileLaunch()], tick: 5 });
  assert.deepEqual(view.projectiles, [{
    key: "projectile:1", kind: "projectile",
    point: { denominator: "10", xNumerator: "30000", yNumerator: "40000" },
    sourceSequence: 0,
  }]);
  assert.deepEqual(view.paths[0].from, { denominator: "1", xNumerator: "1000", yNumerator: "2000" });
});

test("ui combat effects: impact is one-tick feedback and then cleans up", () => {
  const events = [projectileLaunch(), {
    projectileId: 1, status: "contact", targetId: 2, tick: 10, type: "impact",
  }];
  const impact = createCombatEffectsViewModel({ events, tick: 10 });
  assert.equal(impact.paths.length, 0);
  assert.deepEqual(impact.impacts.map(({ key }) => key), ["projectile:1"]);
  assert.deepEqual(createCombatEffectsViewModel({ events, tick: 11 }).impacts, []);
});

test("ui combat effects: return, pierce, and pellets preserve source-stable path order", () => {
  const rational = (x, y) => ({ denominator: "1", xNumerator: String(x), yNumerator: String(y) });
  const events = [
    { attackerId: 1, completeTick: 12, origin: point(1000, 1000), tick: 0, turnPoint: rational(3000, 1000), turnTick: 6, type: "return-launch" },
    { endpoint: rational(6000, 2000), impactTick: 8, origin: point(2000, 2000), tick: 0, type: "pierce-launch" },
    { impactTick: 10, origin: point(3000, 3000), pellets: [
      { endpoint: rational(5000, 2800), pelletId: 1 },
      { endpoint: rational(5000, 3200), pelletId: 2 },
    ], tick: 0, type: "pellet-volley-launch" },
  ];
  const view = createCombatEffectsViewModel({ events, tick: 4 });
  assert.deepEqual(view.paths.map(({ key }) => key), ["return:0", "pierce:1", "pellet:2:1", "pellet:2:2"]);
  assert.deepEqual(view.projectiles.map(({ kind }) => kind), ["return", "pierce", "pellet", "pellet"]);
});

test("ui combat effects: return turn changes to the inbound exact segment", () => {
  const events = [
    { attackerId: 1, completeTick: 10, origin: point(1000, 1000), tick: 0, turnPoint: point(5000, 1000), turnTick: 5, type: "return-launch" },
    { tick: 5, turnPoint: point(5000, 1000), type: "return-turn" },
  ];
  const view = createCombatEffectsViewModel({ events, tick: 7 });
  assert.equal(view.paths[0].launchTick, 5);
  assert.deepEqual(view.projectiles[0].point, { denominator: "5", xNumerator: "17000", yNumerator: "5000" });
});

test("ui combat effects: area feedback and simultaneous events keep canonical order", () => {
  const events = [
    { center: point(9000, 16000), damage: 30, effectId: 7, mode: "ground", radius: 1500, tick: 4, type: "effect" },
    { amount: 30, effectId: 7, targetId: 2, tick: 4, type: "hit" },
    { amount: 30, effectId: 7, targetId: 9, tick: 4, type: "hit" },
  ];
  const view = createCombatEffectsViewModel({ events, tick: 4 });
  assert.deepEqual(view.areas, [{
    key: "area:7", point: { denominator: "1", xNumerator: "9000", yNumerator: "16000" },
    radius: 1500, sourceSequence: 0,
  }]);
  assert.deepEqual(createCombatEffectsViewModel({ events, tick: 5 }).areas, []);
});

test("ui combat effects: serialize/restore and DOM projection are byte-identical", () => {
  const view = createCombatEffectsViewModel({ events: [projectileLaunch()], tick: 3 });
  const serialized = serializeCombatEffectsViewModel(view);
  const restored = restoreCombatEffectsViewModel(serialized);
  assert.equal(serializeCombatEffectsViewModel(restored), serialized);
  const left = dom();
  const right = dom();
  bindCombatEffectsViewModel(left.layer, view);
  bindCombatEffectsViewModel(right.layer, restored);
  assert.equal(bytes(left.layer), bytes(right.layer));
  assert.equal(left.layer.children[0].children[0].attributes.get("viewBox"), "0 0 18000 32000");
});

test("ui combat effects: hostile input and forged restores fail atomically", () => {
  let accessed = false;
  const hostile = { events: [], tick: 0 };
  Object.defineProperty(hostile, "tick", { enumerable: true, get() { accessed = true; return 0; } });
  assert.throws(() => createCombatEffectsViewModel(hostile), /data property/u);
  assert.equal(accessed, false);
  let nestedAccessed = false;
  const nested = { tick: 0, type: "damage" };
  Object.defineProperty(nested, "payload", { enumerable: true, get() { nestedAccessed = true; return 1; } });
  assert.throws(() => createCombatEffectsViewModel({ events: [nested], tick: 0 }), /data property/u);
  assert.equal(nestedAccessed, false);
  assert.throws(() => createCombatEffectsViewModel({ events: [{ tick: 0, type: "unknown" }], tick: 0 }), /unsupported/u);
  assert.throws(() => createCombatEffectsViewModel({ events: [projectileLaunch({ targetPosition: point(18001, 0) })], tick: 0 }), /targetPosition.x/u);
  assert.throws(() => createCombatEffectsViewModel({ events: Array.from({ length: COMBAT_EFFECT_EVENT_LIMIT + 1 }, () => ({ tick: 0, type: "damage" })), tick: 0 }), /at most/u);
  const valid = JSON.parse(serializeCombatEffectsViewModel(createCombatEffectsViewModel({ events: [projectileLaunch()], tick: 5 })));
  valid.projectiles[0].point.xNumerator = "30001";
  assert.throws(() => restoreCombatEffectsViewModel(JSON.stringify(valid)), /causally derivable/u);

  const { document, layer } = dom();
  const sentinel = document.createElement("sentinel");
  layer.replaceChildren(sentinel);
  let calls = 0;
  const original = document.createElement.bind(document);
  document.createElement = (...args) => { if (++calls === 2) throw new Error("hostile document"); return original(...args); };
  assert.throws(() => bindCombatEffectsViewModel(layer, createCombatEffectsViewModel({ events: [projectileLaunch()], tick: 2 })), /hostile document/u);
  assert.deepEqual(layer.children, [sentinel]);
});

test("ui combat effects: actual signed-axis and diagonal special replays project at every cut", () => {
  const cases = [
    [ReturnEncounter, createReturnSpecialFixture([], { x: -3, y: -4 })],
    [PierceEncounter, createPierceSpecialFixture([], { x: -1, y: 0 })],
    [PelletEncounter, createPelletSpecialFixture([], { x: 3, y: -4 })],
  ];
  for (const [Encounter, setup] of cases) {
    const encounter = new Encounter(setup);
    encounter.run();
    for (const cut of [0, ...new Set(encounter.replay.map(({ tick }) => tick))]) {
      const events = encounter.replay.filter(({ tick }) => tick <= cut);
      const view = createCombatEffectsViewModel({ events, tick: cut });
      const restored = restoreCombatEffectsViewModel(serializeCombatEffectsViewModel(view));
      assert.equal(serializeCombatEffectsViewModel(restored), serializeCombatEffectsViewModel(view));
    }
  }
});

test("ui combat effects: actual projectile and area replay events project directly", () => {
  const entity = (id, x, mode) => ({
    attackRange: 5000, id, kind: "troop", layer: "ground", maxHealth: 100,
    position: { x, y: 1000 }, radius: 0, targetMode: mode, targetable: true,
  });
  const combat = new ProjectileCombat({ entities: [
    entity(1, 1000, "ground"), entity(2, 5000, "none"),
  ] });
  combat.launch({ attackerId: 1, damage: 10, radius: 0, speed: 1000, targetId: 2, tick: 0 });
  for (let tick = 0; tick <= 4; tick += 1) combat.step(tick);
  const projectileView = createCombatEffectsViewModel({ events: combat.replay, tick: 4 });
  assert.deepEqual(projectileView.impacts.map(({ key }) => key), ["projectile:1"]);

  const area = new AreaDamageSystem();
  area.add(2, 100);
  const candidate = targetCandidate({
    alive: true, id: 2, kind: "troop", layer: "ground", position: position(5, 1),
    radius: radius(0), targetable: true,
  });
  const result = area.resolve({
    center: position(5, 1), damage: 10, mode: "ground", radius: radius(1), tick: 4,
  }, [candidate]);
  const areaView = createCombatEffectsViewModel({ events: result.events, tick: 4 });
  assert.deepEqual(areaView.areas.map(({ key }) => key), ["area:1"]);
});

test("ui combat effects: concurrent actual traveling-line replay projects and restores at every cut", () => {
  const cast = (id, center) => ({
    center, effectId: null, id, sourceId: 1, targetId: null, tick: 0, type: "cast",
  });
  const setup = createTravelingLineSpellFixture({
    commands: [cast(1, point(5000, 1000)), cast(2, point(6000, 1000))],
    sources: [{ id: 1, ownerId: 1, position: point(1000, 1000) }],
    victims: [{
      combatTargetId: null, combatTargetMode: null, health: 1000, id: 8,
      kind: "troop", layer: "ground", ownerId: 2, position: point(5000, 1000),
      radius: 100, targetable: true,
    }],
  });
  const encounter = new TravelingLineSpellEncounter(setup);
  encounter.run();
  assert.ok(encounter.replay.some(({ tick, type }) => tick === 4 && type === "travel-spell-impact"));
  for (const cut of [...new Set(encounter.replay.map(({ tick }) => tick))]) {
    const events = encounter.replay.filter(({ tick }) => tick <= cut);
    const view = createCombatEffectsViewModel({ events, tick: cut });
    assert.equal(serializeCombatEffectsViewModel(restoreCombatEffectsViewModel(
      serializeCombatEffectsViewModel(view))), serializeCombatEffectsViewModel(view));
  }
});

test("ui combat effects: concurrent actual returning-spell replay projects and restores at every cut", () => {
  const cast = (id, center) => ({
    center, effectId: null, id, sourceId: 1, targetId: null, tick: 0, type: "cast",
  });
  const encounter = new ReturningSpellEncounter(createReturningSpellFixture({
    commands: [cast(1, point(5000, 1000)), cast(2, point(6000, 1000))],
    sources: [{ id: 1, ownerId: 1, position: point(1000, 1000) }],
    victims: [{
      combatTargetId: null, combatTargetMode: null, health: 1, id: 8,
      kind: "troop", layer: "ground", ownerId: 2, position: point(2000, 1000),
      radius: 0, targetable: true,
    }],
  }));
  encounter.run();
  assert.ok(encounter.replay.some(({ type }) => type === "return-spell-death"));
  for (const cut of [...new Set(encounter.replay.map(({ tick }) => tick))]) {
    const events = encounter.replay.filter(({ tick }) => tick <= cut);
    const view = createCombatEffectsViewModel({ events, tick: cut });
    assert.equal(serializeCombatEffectsViewModel(restoreCombatEffectsViewModel(
      serializeCombatEffectsViewModel(view))), serializeCombatEffectsViewModel(view));
  }
});

test("ui combat effects: actual command damage and launch cancellations are accepted and clean", () => {
  const cases = [
    [ReturnEncounter, createReturnSpecialFixture([], { x: 1, y: 0 }, [
      { targetId: null, tick: 24, type: "kill-attacker" },
    ])],
    [PierceEncounter, createPierceSpecialFixture([], { x: 1, y: 0 }, [
      { targetId: null, tick: 36, type: "interrupt-attacker" },
    ])],
    [PelletEncounter, createPelletSpecialFixture([], { x: 1, y: 0 }, [
      { targetId: null, tick: 84, type: "kill-attacker" },
    ])],
  ];
  for (const [Encounter, setup] of cases) {
    const encounter = new Encounter(setup);
    encounter.run();
    assert.ok(encounter.replay.some(({ type }) => type === "external-damage" || type.endsWith("-complete")));
    const tick = encounter.replay.at(-1).tick;
    const view = createCombatEffectsViewModel({ events: encounter.replay, tick });
    assert.deepEqual(view.paths, []);
    assert.deepEqual(view.projectiles, []);
    assert.equal(serializeCombatEffectsViewModel(restoreCombatEffectsViewModel(
      serializeCombatEffectsViewModel(view))), serializeCombatEffectsViewModel(view));
  }
});

test("ui combat effects: overlapping same-kind paths transition by causal identity", () => {
  const events = [
    { completeTick: 8, effectId: 10, origin: point(1000, 1000), sourceId: 1, tick: 0, turn: point(3000, 1000), turnTick: 4, type: "return-launch" },
    { completeTick: 10, effectId: 11, origin: point(2000, 2000), sourceId: 2, tick: 0, turn: point(5000, 2000), turnTick: 5, type: "return-launch" },
    { effectId: 10, tick: 4, turn: point(3000, 1000), type: "return-turn" },
  ];
  const view = createCombatEffectsViewModel({ events, tick: 4 });
  assert.deepEqual(view.paths.map(({ key, launchTick }) => ({ key, launchTick })), [
    { key: "return:effect:10", launchTick: 4 },
    { key: "return:effect:11", launchTick: 0 },
  ]);
});

test("ui combat effects: replay-backed restore rejects forged identity and sequence", () => {
  const valid = JSON.parse(serializeCombatEffectsViewModel(
    createCombatEffectsViewModel({ events: [projectileLaunch()], tick: 2 }),
  ));
  valid.paths[0].key = "forged";
  valid.paths[0].sourceSequence = COMBAT_EFFECT_EVENT_LIMIT - 1;
  valid.projectiles[0].key = "forged";
  valid.projectiles[0].sourceSequence = COMBAT_EFFECT_EVENT_LIMIT - 1;
  assert.throws(() => restoreCombatEffectsViewModel(JSON.stringify(valid)), /causally derivable/u);
});

test("ui combat effects: exact event schemas reject extra, missing, wrong, accessor, and prototype data", () => {
  const projected = projectileLaunch();
  const effect = {
    center: point(5000, 5000), damage: 10, effectId: 1, mode: "ground",
    radius: 1000, tick: 0, type: "effect",
  };
  const ignored = {
    amount: 10, effectId: 1, targetId: 2, tick: 0, type: "hit",
  };
  for (const base of [projected, effect, ignored]) {
    const extra = structuredClone(base);
    extra.forged = true;
    const missing = structuredClone(base);
    delete missing.tick;
    const wrong = structuredClone(base);
    wrong.tick = "0";
    let accessed = false;
    const accessor = structuredClone(base);
    Object.defineProperty(accessor, "tick", { enumerable: true, get() { accessed = true; return 0; } });
    const inherited = Object.create(base);
    for (const candidate of [extra, missing, wrong, accessor, inherited]) {
      assert.throws(() => createCombatEffectsViewModel({ events: [candidate], tick: 0 }));
    }
    assert.equal(accessed, false);
  }
  for (const forged of [
    { forged: true, projectile: projected.projectile, tick: 0, type: "launch" },
    { forged: true, projectileId: 1, status: "contact", targetId: 2, tick: 0, type: "impact" },
    { ...effect, forged: true },
  ]) assert.throws(() => createCombatEffectsViewModel({ events: [forged], tick: 0 }), /invalid shape/u);
});
