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
import { BattleTowerCombat } from "../src/sim/battle-continuation-kernel.js";
import { ProjectileCombat } from "../src/sim/projectile.js";
import {
  appendCombatEffectEvent,
  appendCombatEffectRoot,
  combatEffectRootId,
  createCombatEffectFeed,
  validateCombatEffectFeed,
} from "../src/sim/combat-effect-feed.js";
import { position, radius } from "../src/sim/spatial.js";
import { targetCandidate } from "../src/sim/targeting.js";
import {
  COMBAT_EFFECT_EVENT_LIMIT,
  bindCombatEffectsViewModel,
  createCombatEffectsViewModel,
  restoreCombatEffectsViewModel,
  serializeCombatEffectsViewModel,
} from "../src/ui/combat-effects.js";

function point(x, y) {
  return { x, y };
}

function independentCanonical(value) {
  if (Array.isArray(value)) return `[${value.map(independentCanonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${independentCanonical(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function feedPrefixInput(feed, count, tick) {
  return { feed: { records: feed.records.slice(0, count), version: 1 }, tick };
}

function directFeed({ impactTick = 10, sourceId = 9, projectileId = 1 } = {}) {
  const feed = createCombatEffectFeed();
  const root = appendCombatEffectRoot(feed, {
    direction: "projectile",
    effectId: null,
    from: point(1000, 1000),
    impactTick,
    projectileId,
    radius: 0,
    segments: [],
    sequence: projectileId,
    sourceId,
    tick: 0,
    to: point(5000, 1000),
    type: "projectile",
  });
  return { feed, root };
}

function areaFeed() {
  const feed = createCombatEffectFeed();
  const root = appendCombatEffectRoot(feed, {
    direction: "area",
    effectId: 7,
    from: point(9000, 16000),
    impactTick: 4,
    projectileId: null,
    radius: 1500,
    segments: [],
    sequence: null,
    sourceId: null,
    tick: 4,
    to: null,
    type: "area",
  });
  const impact = appendCombatEffectEvent(feed, {
    parentId: root.eventId,
    payload: {
      center: point(9000, 16000),
      radius: 1500,
      targetIds: [2, 9],
    },
    phase: "impact",
    rootId: root.rootId,
    tick: 4,
    type: "area",
  });
  const damageTwo = appendCombatEffectEvent(feed, {
    parentId: impact.eventId,
    payload: {
      amount: 0,
      currentHealthAfter: 100,
      currentHealthBefore: 100,
      targetId: 2,
    },
    phase: "damage",
    rootId: root.rootId,
    tick: 4,
    type: "area",
  });
  appendCombatEffectEvent(feed, {
    parentId: damageTwo.eventId,
    payload: {
      amount: 0,
      currentHealthAfter: 50,
      currentHealthBefore: 50,
      targetId: 9,
    },
    phase: "damage",
    rootId: root.rootId,
    tick: 4,
    type: "area",
  });
  appendCombatEffectEvent(feed, {
    parentId: feed.records.at(-1).eventId,
    payload: { reason: "complete" },
    phase: "close",
    rootId: root.rootId,
    tick: 4,
    type: "area",
  });
  return feed;
}

function returnFeed() {
  const feed = createCombatEffectFeed();
  const root = appendCombatEffectRoot(feed, {
    direction: "return",
    effectId: null,
    from: point(1000, 1000),
    impactTick: 20,
    projectileId: null,
    radius: 250,
    segments: [],
    sequence: 1,
    sourceId: 9,
    tick: 0,
    to: point(5000, 1000),
    type: "projectile",
  });
  const contact = appendCombatEffectEvent(feed, {
    parentId: root.eventId,
    payload: {
      point: point(2500, 1000),
      status: "contact",
      subId: null,
      targetId: 2,
    },
    phase: "contact",
    rootId: root.rootId,
    tick: 3,
    type: "projectile",
  });
  const damage = appendCombatEffectEvent(feed, {
    parentId: contact.eventId,
    payload: {
      amount: 10,
      currentHealthAfter: 90,
      currentHealthBefore: 100,
      targetId: 2,
    },
    phase: "damage",
    rootId: root.rootId,
    tick: 3,
    type: "projectile",
  });
  const turn = appendCombatEffectEvent(feed, {
    parentId: damage.eventId,
    payload: { point: point(5000, 1000) },
    phase: "turn",
    rootId: root.rootId,
    tick: 10,
    type: "projectile",
  });
  const inboundContact = appendCombatEffectEvent(feed, {
    parentId: turn.eventId,
    payload: {
      point: point(2500, 1000),
      status: "contact",
      subId: null,
      targetId: 2,
    },
    phase: "contact",
    rootId: root.rootId,
    tick: 13,
    type: "projectile",
  });
  const inboundDamage = appendCombatEffectEvent(feed, {
    parentId: inboundContact.eventId,
    payload: {
      amount: 10,
      currentHealthAfter: 80,
      currentHealthBefore: 90,
      targetId: 2,
    },
    phase: "damage",
    rootId: root.rootId,
    tick: 13,
    type: "projectile",
  });
  appendCombatEffectEvent(feed, {
    parentId: inboundDamage.eventId,
    payload: { reason: "complete" },
    phase: "close",
    rootId: root.rootId,
    tick: 20,
    type: "projectile",
  });
  return feed;
}

class Node {
  constructor(ownerDocument, name) {
    this.ownerDocument = ownerDocument;
    this.name = name;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.className = "";
    this.style = {
      values: new Map(),
      setProperty: (key, value) => this.style.values.set(key, value),
    };
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  replaceChildren(...children) {
    this.children = children;
  }
  setAttribute(key, value) {
    this.attributes.set(key, value);
  }
}

function dom() {
  const document = {
    createElement(name) {
      return new Node(document, name);
    },
    createElementNS(_namespace, name) {
      return new Node(document, name);
    },
  };
  return { document, layer: new Node(document, "layer") };
}

function nodeBytes(node) {
  return JSON.stringify({
    attributes: [...node.attributes],
    children: node.children.map(nodeBytes),
    className: node.className,
    dataset: Object.entries(node.dataset).sort(),
    name: node.name,
    style: [...node.style.values].sort(),
  });
}

function assertRestoresExactly(view) {
  const bytes = serializeCombatEffectsViewModel(view);
  const restored = restoreCombatEffectsViewModel(bytes);
  assert.equal(serializeCombatEffectsViewModel(restored), bytes);
  return restored;
}

function assertPrefixViews(feed) {
  for (let count = 0; count <= feed.records.length; count += 1) {
    const records = feed.records.slice(0, count);
    const tick = records.at(-1)?.tick ?? 0;
    const view = createCombatEffectsViewModel({
      feed: { records, version: 1 },
      tick,
    });
    assertRestoresExactly(view);
  }
}

test("ui combat effects: canonical direct feed projects exact rational travel", () => {
  const { feed } = directFeed();
  const view = createCombatEffectsViewModel(feed, 5);
  assert.deepEqual(view.events, feed.records);
  assert.deepEqual(view.paths, [{
    from: { denominator: "1", xNumerator: "1000", yNumerator: "1000" },
    impactTick: 10,
    key: "projectile.projectile.9.none.1.1",
    kind: "projectile",
    launchTick: 0,
    sourceSequence: 1,
    to: { denominator: "1", xNumerator: "5000", yNumerator: "1000" },
  }]);
  assert.deepEqual(view.projectiles[0].point, {
    denominator: "10",
    xNumerator: "30000",
    yNumerator: "10000",
  });
  assert.equal(Object.isFrozen(view), true);
  assert.equal(Object.isFrozen(view.events[0].payload), true);
  const named = createCombatEffectsViewModel({
    combatEffectFeed: { records: feed.records.slice(), version: 1 },
    tick: 5,
  });
  assert.equal(serializeCombatEffectsViewModel(named), serializeCombatEffectsViewModel(view));
});


test("ui combat effects: live homing point uses the full typed projectile identity", () => {
  const feed = createCombatEffectFeed();
  const unitRoot = appendCombatEffectRoot(feed, {
    direction: "unit-to-tower", effectId: null, from: point(1_000, 1_000),
    impactTick: 3, projectileId: 1, radius: 0, segments: [], sequence: 1,
    sourceId: 9, tick: 0, to: point(9_000, 1_000), type: "projectile",
  });
  const towerRoot = appendCombatEffectRoot(feed, {
    direction: "tower-to-unit", effectId: null, from: point(2_000, 2_000),
    impactTick: 3, projectileId: 1, radius: 0, segments: [], sequence: 1,
    sourceId: "south:lane:west", tick: 0, to: point(8_000, 2_000), type: "projectile",
  });
  const live = [{
    attackSequence: 1,
    direction: "unit-to-tower",
    position: point(7_000, 4_000),
    projectileId: 1,
    projectileIdentity: {
      attackSequence: 1,
      direction: "unit-to-tower",
      projectileId: 1,
      sourceId: 9,
    },
    sourceId: 9,
    splashProfile: { homing: true },
  }];
  const view = createCombatEffectsViewModel(feed, 2, live);
  assert.deepEqual(view.projectiles.find(({ key }) => key === unitRoot.rootId)?.point, {
    denominator: "1", xNumerator: "7000", yNumerator: "4000",
  });
  assert.deepEqual(view.projectiles.find(({ key }) => key === towerRoot.rootId)?.point, {
    denominator: "3", xNumerator: "18000", yNumerator: "6000",
  }, "the tower projectile with the same local id retains its own straight-flight point");
  const bytes = serializeCombatEffectsViewModel(view);
  assert.equal(serializeCombatEffectsViewModel(restoreCombatEffectsViewModel(bytes, live)), bytes);
  assert.throws(() => restoreCombatEffectsViewModel(bytes), /not causally derivable/u,
    "a homing position is restored from the current authentic battle state");

  const forged = structuredClone(live);
  forged[0].projectileIdentity.sourceId = 10;
  assert.throws(() => createCombatEffectsViewModel(feed, 2, forged), /diverges/u);
  assert.equal(combatEffectRootId({
    direction: "unit-to-tower", effectId: null, projectileId: 1,
    sequence: 1, sourceId: 9, type: "projectile",
  }), unitRoot.rootId, "root identity encoding is injective over source and direction");
  assert.notEqual(unitRoot.rootId, towerRoot.rootId);
});

test("ui combat effects: contact, lethal damage, death, and close are feed-causal", () => {
  const { feed, root } = directFeed({ impactTick: 10 });
  const contact = appendCombatEffectEvent(feed, {
    parentId: root.eventId,
    payload: {
      point: point(5000, 1000),
      status: "contact",
      subId: null,
      targetId: 2,
    },
    phase: "contact",
    rootId: root.rootId,
    tick: 10,
    type: "projectile",
  });
  const damage = appendCombatEffectEvent(feed, {
    parentId: contact.eventId,
    payload: {
      amount: 100,
      currentHealthAfter: 0,
      currentHealthBefore: 100,
      targetId: 2,
    },
    phase: "damage",
    rootId: root.rootId,
    tick: 10,
    type: "projectile",
  });
  const death = appendCombatEffectEvent(feed, {
    parentId: damage.eventId,
    payload: { targetId: 2 },
    phase: "death",
    rootId: root.rootId,
    tick: 10,
    type: "projectile",
  });
  appendCombatEffectEvent(feed, {
    parentId: death.eventId,
    payload: { reason: "complete" },
    phase: "close",
    rootId: root.rootId,
    tick: 10,
    type: "projectile",
  });

  const impact = createCombatEffectsViewModel(feed, 10);
  assert.deepEqual(impact.impacts, [{
    key: "projectile.projectile.9.none.1.1:contact:2",
    kind: "projectile",
    point: { denominator: "1", xNumerator: "5000", yNumerator: "1000" },
    sourceSequence: 1,
  }]);
  assert.deepEqual(impact.paths, []);
  assert.deepEqual(createCombatEffectsViewModel(feed, 11).impacts, []);
  assert.deepEqual(impact.events.map(({ phase }) => phase), [
    "open", "contact", "damage", "death", "close",
  ]);
});

test("ui combat effects: area roots retain zero-damage shared-target outcomes", () => {
  const feed = areaFeed();
  const view = createCombatEffectsViewModel(feed, 4);
  assert.deepEqual(view.areas, [{
    key: "area.area.none.7.none.none",
    point: { denominator: "1", xNumerator: "9000", yNumerator: "16000" },
    radius: 1500,
    sourceSequence: null,
  }]);
  assert.deepEqual(view.impacts, []);
  assert.deepEqual(view.events.map(({ phase }) => phase), [
    "open", "impact", "damage", "damage", "close",
  ]);
  assert.equal(createCombatEffectsViewModel(feed, 5).areas.length, 0);
});

test("ui combat effects: return turn switches the canonical carrier leg", () => {
  const feed = returnFeed();
  const outbound = createCombatEffectsViewModel(feedPrefixInput(feed, 3, 5));
  assert.deepEqual(outbound.paths.map(({ launchTick, impactTick }) => ({ launchTick, impactTick })), [
    { launchTick: 0, impactTick: 20 },
  ]);
  assert.deepEqual(outbound.projectiles[0].point, {
    denominator: "20",
    xNumerator: "40000",
    yNumerator: "20000",
  });

  const inbound = createCombatEffectsViewModel(feedPrefixInput(feed, 4, 12));
  assert.deepEqual(inbound.paths.map(({ launchTick, impactTick }) => ({ launchTick, impactTick })), [
    { launchTick: 10, impactTick: 20 },
  ]);
  assert.deepEqual(inbound.projectiles[0].point, {
    denominator: "10",
    xNumerator: "42000",
    yNumerator: "10000",
  });
  assert.equal(inbound.events.some(({ phase }) => phase === "turn"), true);
});

test("ui combat effects: pellet segments are stable carriers and cancellations clear them", () => {
  const feed = createCombatEffectFeed();
  const root = appendCombatEffectRoot(feed, {
    direction: "pellet",
    effectId: null,
    from: point(0, 0),
    impactTick: 10,
    projectileId: null,
    radius: 40,
    segments: [
      { id: 2, to: point(4000, 1000) },
      { id: 1, to: point(3000, 1000) },
    ],
    sequence: 1,
    sourceId: 9,
    tick: 0,
    to: null,
    type: "projectile",
  });
  const open = createCombatEffectsViewModel(feed, 5);
  assert.deepEqual(open.paths.map(({ key }) => key), [
    `${root.rootId}:segment:1`, `${root.rootId}:segment:2`,
  ]);
  assert.deepEqual(open.projectiles.map(({ point: value }) => value), [
    { denominator: "10", xNumerator: "15000", yNumerator: "5000" },
    { denominator: "10", xNumerator: "20000", yNumerator: "5000" },
  ]);

  const cancelled = createCombatEffectFeed();
  const cancelledRoot = appendCombatEffectRoot(cancelled, {
    direction: "pellet",
    effectId: null,
    from: point(0, 0),
    impactTick: 10,
    projectileId: null,
    radius: 40,
    segments: [{ id: 1, to: point(3000, 1000) }],
    sequence: 1,
    sourceId: 9,
    tick: 0,
    to: null,
    type: "projectile",
  });
  appendCombatEffectEvent(cancelled, {
    parentId: cancelledRoot.eventId,
    payload: { reason: "explicit-cancel" },
    phase: "close",
    rootId: cancelledRoot.rootId,
    tick: 3,
    type: "projectile",
  });
  const cancelledView = createCombatEffectsViewModel(cancelled, 3);
  assert.deepEqual(cancelledView.paths, []);
  assert.equal(cancelledView.events.at(-1).payload.reason, "explicit-cancel");
});

test("ui combat effects: serialization, restore, and DOM bytes use feed authority", () => {
  const feed = returnFeed();
  const view = createCombatEffectsViewModel(feedPrefixInput(feed, 3, 5));
  const restored = assertRestoresExactly(view);
  const left = dom();
  const right = dom();
  bindCombatEffectsViewModel(left.layer, view);
  bindCombatEffectsViewModel(right.layer, restored);
  assert.equal(nodeBytes(left.layer), nodeBytes(right.layer));
  assert.equal(left.layer.children[0].children.length, 2);

  const forged = JSON.parse(serializeCombatEffectsViewModel(view));
  forged.projectiles[0].point.xNumerator = "9999";
  assert.throws(() => restoreCombatEffectsViewModel(JSON.stringify(forged)), /causally derivable|canonical/u);

  const sentinel = left.document.createElement("sentinel");
  left.layer.replaceChildren(sentinel);
  const original = left.document.createElementNS.bind(left.document);
  let calls = 0;
  left.document.createElementNS = (...args) => {
    calls += 1;
    if (calls === 1) throw new Error("hostile document");
    return original(...args);
  };
  assert.throws(() => bindCombatEffectsViewModel(left.layer, view), /hostile document/u);
  assert.deepEqual(left.layer.children, [sentinel]);
});

test("ui combat effects: immutable event byte caching preserves canonical views", () => {
  const { feed, root } = directFeed();
  const firstView = createCombatEffectsViewModel(feed, 5);
  const firstBytes = serializeCombatEffectsViewModel(firstView);
  assert.equal(firstBytes, independentCanonical(firstView));
  assert.equal(serializeCombatEffectsViewModel(firstView), firstBytes);

  appendCombatEffectEvent(feed, {
    parentId: root.eventId,
    payload: {
      point: point(5000, 1000),
      status: "contact",
      subId: null,
      targetId: 2,
    },
    phase: "contact",
    rootId: root.rootId,
    tick: 10,
    type: "projectile",
  });
  const appendedView = createCombatEffectsViewModel(feed, 10);
  assert.equal(appendedView.events.length, firstView.events.length + 1);
  const appendedBytes = serializeCombatEffectsViewModel(appendedView);
  assert.equal(appendedBytes, independentCanonical(appendedView));

  const restored = restoreCombatEffectsViewModel(appendedBytes);
  assert.equal(serializeCombatEffectsViewModel(restored), appendedBytes);
});

test("ui combat effects: malformed feed is rejected before projection and raw dialects never enter", () => {
  const { feed } = directFeed();
  const valid = { records: feed.records.slice(), version: 1 };
  assert.throws(() => createCombatEffectsViewModel({ events: [], tick: 0 }), /invalid shape|feed/u);
  assert.throws(() => createCombatEffectsViewModel({ events: valid.records, tick: 11 }), /invalid shape|feed/u);

  let accessed = false;
  const hostile = {
    records: [],
    version: 1,
  };
  Object.defineProperty(hostile, "replay", {
    enumerable: true,
    get() {
      accessed = true;
      throw new Error("replay accessed");
    },
  });
  assert.throws(() => createCombatEffectsViewModel(hostile, 0), /shape|combat effect/u);
  assert.equal(accessed, false);

  const malformed = structuredClone(valid);
  malformed.records[0].eventId = 2;
  assert.throws(() => createCombatEffectsViewModel(malformed, 0), /contiguous|duplicated/u);
  const postClose = structuredClone(valid);
  postClose.records.push({
    eventId: 2,
    parentId: 1,
    payload: { reason: "complete" },
    phase: "close",
    rootId: postClose.records[0].rootId,
    tick: 10,
    type: "projectile",
  });
  assert.throws(() => createCombatEffectsViewModel(postClose, 10), /causal|close|contact|impact/u);

  assert.throws(() => createCombatEffectsViewModel({
    records: Array.from({ length: COMBAT_EFFECT_EVENT_LIMIT + 1 }, () => ({})),
    version: 1,
  }, 0), /bounded|shape|records/u);
});

test("ui combat effects: authentic sources project prefixes and restore exactly", () => {
  const entity = (id, x, targetMode) => ({
    attackRange: 5000,
    id,
    kind: "troop",
    layer: "ground",
    maxHealth: 100,
    position: { x, y: 1000 },
    radius: 0,
    targetMode,
    targetable: true,
  });
  const combat = new ProjectileCombat({ entities: [
    entity(1, 1000, "ground"),
    entity(2, 5000, "none"),
  ] });
  combat.launch({
    attackerId: 1,
    damage: 10,
    radius: 0,
    speed: 1000,
    targetId: 2,
    tick: 0,
  });
  for (let tick = 0; tick <= 4; tick += 1) combat.step(tick);
  assertPrefixViews(combat.combatEffectFeed);
  assert.equal(createCombatEffectsViewModel(combat.combatEffectFeed, 4).impacts.length, 1);

  const area = new AreaDamageSystem();
  area.add(2, 100);
  const candidate = targetCandidate({
    alive: true,
    id: 2,
    kind: "troop",
    layer: "ground",
    position: position(5, 1),
    radius: radius(0),
    targetable: true,
  });
  area.resolve({
    center: position(5, 1),
    damage: 10,
    mode: "ground",
    radius: radius(1),
    tick: 4,
  }, [candidate]);
  assertPrefixViews(area.combatEffectFeed);
  assert.equal(createCombatEffectsViewModel(area.combatEffectFeed, 4).areas.length, 1);

  const actualCases = [
    [PierceEncounter, createPierceSpecialFixture([], { x: 1, y: 0 })],
    [PelletEncounter, createPelletSpecialFixture([], { x: 1, y: 0 })],
    [ReturnEncounter, createReturnSpecialFixture([], { x: 1, y: 0 })],
    [TravelingLineSpellEncounter, createTravelingLineSpellFixture({
      commands: [{ center: point(6000, 1000), effectId: null, id: 1, sourceId: 1,
        targetId: null, tick: 0, type: "cast" }],
      sources: [{ id: 1, ownerId: 1, position: point(1000, 1000) }],
      victims: [],
    })],
    [ReturningSpellEncounter, createReturningSpellFixture({
      commands: [{ center: point(6000, 1000), effectId: null, id: 1, sourceId: 1,
        targetId: null, tick: 0, type: "cast" }],
      sources: [{ id: 1, ownerId: 1, position: point(1000, 1000) }],
      victims: [],
    })],
  ];
  for (const [Encounter, setup] of actualCases) {
    const encounter = new Encounter(setup);
    encounter.run();
    assertPrefixViews(encounter.combatEffectFeed);
    const terminal = createCombatEffectsViewModel(
      encounter.combatEffectFeed,
      encounter.state.tick,
    );
    assert.deepEqual(terminal.paths, []);
    assert.deepEqual(terminal.projectiles, []);
  }
});

test("ui combat effects: authentic battle feed and empty feed are deterministic", () => {
  const unit = (id, side, unitPosition, overrides = {}) => ({
    cadenceTicks: 60,
    damage: 10,
    delivery: "projectile",
    deployTicks: 0,
    firstHitTicks: 0,
    id,
    layer: "ground",
    maxHealth: 1000,
    position: unitPosition,
    projectileSpeed: 1000,
    radius: 0,
    reach: 5000,
    side,
    sightRange: 10000,
    targetMode: "air_and_ground",
    ...overrides,
  });
  const battle = new BattleTowerCombat({
    initialWindupTicks: { central: 0, lane: 0 },
    units: [
      unit(1, "north", point(1000, 1000), {
        delivery: "melee", reach: 0, projectileSpeed: null,
      }),
      unit(2, "south", point(5000, 1000), {
        damage: 0, delivery: "melee", firstHitTicks: 999,
        projectileSpeed: null, reach: 0,
      }),
    ],
  });
  battle.step(0);
  assertPrefixViews(battle.combatEffectFeed);
  assert.ok(createCombatEffectsViewModel(battle.combatEffectFeed, 0).events.length > 0);

  const empty = createCombatEffectFeed();
  const view = createCombatEffectsViewModel(empty, 0);
  assert.deepEqual(view.events, []);
  assert.deepEqual(view.paths, []);
  assert.deepEqual(view.projectiles, []);
  assert.deepEqual(view.areas, []);
  assert.deepEqual(view.impacts, []);
  assertRestoresExactly(view);
  assert.deepEqual(validateCombatEffectFeed({ records: [], version: 1 }), {
    records: [],
    version: 1,
  });
});
