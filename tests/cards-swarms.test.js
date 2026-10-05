import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createSquadMembers,
  createSwarmCatalog,
  layoutSquad,
} from "../src/content/index.js";
import { DamageSystem } from "../src/sim/damage.js";
import { protectedIdentityHits } from "./helpers/protected-identity-scan.js";
import { createReferenceParityEvaluator } from "./helpers/reference-parity.js";

const benchmark = JSON.parse(readFileSync(
  new URL("../reference/stats/cards.json", import.meta.url),
  "utf8",
));
const benchmarkByKey = new Map(
  benchmark.cards.map((card) => [card.key, card]),
);

const CARD_KEYS = {
  "briar-band": "goblin-gang",
  cinderlings: "skeletons",
};

const CARD_FIELDS = [
  ["cost", "elixir_cost", (value) => value],
  ["kind", "type", (value) => value === "troop" ? "unit" : value],
  ["rarity", "rarity", (value) => value === "common" ? "standard" : value],
  ["hitpoints", "hitpoints", (value) => value],
  ["damage", "damage", (value) => value],
  ["hitSpeedTicks", "hit_speed_seconds", (value) => value * 60],
  ["firstHitTicks", "first_hit_seconds", (value) => value * 60],
  ["deployTimeTicks", "deploy_time_seconds", (value) => value * 60],
  ["rangeMillitiles", "range_tiles", (value) => value * 1000],
  ["sightRangeMillitiles", "sight_range_tiles", (value) => value * 1000],
  [
    "movementMillitilesPerSecond",
    "movement_speed_tiles_per_second",
    (value) => value * 1000,
  ],
  [
    "targetMode",
    "targets",
    (value) => ({
      air_and_ground: "ground-and-air",
      ground: "ground",
    })[value],
  ],
  ["count", "count", (value) => value],
  [
    "areaDamageRadiusMillitiles",
    "area_damage_radius_tiles",
    (value) => value === null ? null : value * 1000,
  ],
];

const COMPONENT_FIELDS = CARD_FIELDS.filter(
  ([runtimeField]) => !["cost", "kind", "rarity"].includes(runtimeField),
);

/*
 * This test-only snapshot pins exactly the nested comparison data and its
 * confidence. It is deliberately independent of the runtime catalog. The
 * reference-integrity test below proves that the snapshot still matches the
 * selected comparison rows before the provenance-safe evaluator uses it.
 */
const COMPONENT_SNAPSHOT = [
  {
    key: "comparison-cinderling",
    unverified_fields: [
      "hitpoints",
      "damage",
      "hit_speed_seconds",
      "first_hit_seconds",
      "deploy_time_seconds",
      "range_tiles",
      "sight_range_tiles",
      "movement_speed_tiles_per_second",
      "targets",
    ],
    hitpoints: 81,
    damage: 81,
    hit_speed_seconds: 1,
    first_hit_seconds: 0.5,
    deploy_time_seconds: 1,
    range_tiles: 0.5,
    sight_range_tiles: 5.5,
    movement_speed_tiles_per_second: 1.5,
    targets: "ground",
    count: 3,
    area_damage_radius_tiles: null,
  },
  {
    key: "comparison-briar-runner",
    unverified_fields: [
      "hitpoints",
      "damage",
      "hit_speed_seconds",
      "first_hit_seconds",
      "deploy_time_seconds",
      "range_tiles",
      "sight_range_tiles",
      "movement_speed_tiles_per_second",
      "targets",
      "count",
    ],
    hitpoints: 202,
    damage: 120,
    hit_speed_seconds: 1.1,
    first_hit_seconds: 0.7,
    deploy_time_seconds: 1,
    range_tiles: 0.5,
    sight_range_tiles: 5.5,
    movement_speed_tiles_per_second: 2,
    targets: "ground",
    count: 3,
    area_damage_radius_tiles: null,
  },
  {
    key: "comparison-briar-darter",
    unverified_fields: [
      "hitpoints",
      "damage",
      "hit_speed_seconds",
      "first_hit_seconds",
      "deploy_time_seconds",
      "range_tiles",
      "sight_range_tiles",
      "movement_speed_tiles_per_second",
      "targets",
      "count",
    ],
    hitpoints: 133,
    damage: 81,
    hit_speed_seconds: 1.7,
    first_hit_seconds: 1.2,
    deploy_time_seconds: 1,
    range_tiles: 5,
    sight_range_tiles: 5.5,
    movement_speed_tiles_per_second: 2,
    targets: "air_and_ground",
    count: 3,
    area_damage_radius_tiles: null,
  },
  {
    key: "comparison-thornscout",
    unverified_fields: [
      "hitpoints",
      "damage",
      "hit_speed_seconds",
      "first_hit_seconds",
      "deploy_time_seconds",
      "range_tiles",
      "sight_range_tiles",
      "movement_speed_tiles_per_second",
      "targets",
      "count",
    ],
    hitpoints: 202,
    damage: 120,
    hit_speed_seconds: 1.1,
    first_hit_seconds: 0.7,
    deploy_time_seconds: 1,
    range_tiles: 0.5,
    sight_range_tiles: 5.5,
    movement_speed_tiles_per_second: 2,
    targets: "ground",
    count: 4,
    area_damage_radius_tiles: null,
  },
  {
    key: "comparison-forgeguard",
    unverified_fields: [
      "hitpoints",
      "damage",
      "hit_speed_seconds",
      "first_hit_seconds",
      "deploy_time_seconds",
      "range_tiles",
      "sight_range_tiles",
      "movement_speed_tiles_per_second",
      "targets",
      "count",
    ],
    hitpoints: 670,
    damage: 192,
    hit_speed_seconds: 1.3,
    first_hit_seconds: 0.9,
    deploy_time_seconds: 1,
    range_tiles: 0.7,
    sight_range_tiles: 5.5,
    movement_speed_tiles_per_second: 1,
    targets: "ground",
    count: 5,
    area_damage_radius_tiles: null,
  },
];

const evaluateCardParity = createReferenceParityEvaluator(
  benchmark.cards,
  CARD_FIELDS,
  Object.values(CARD_KEYS),
);
const evaluateComponentParity = createReferenceParityEvaluator(
  COMPONENT_SNAPSHOT,
  COMPONENT_FIELDS,
  COMPONENT_SNAPSHOT.map(({ key }) => key),
);

function card(id) {
  return createSwarmCatalog().find((entry) => entry.id === id);
}

function component(id) {
  const cards = createSwarmCatalog();
  const parentId = id === "cinderling" ? "cinderlings" : null;
  const parent = cards.find(({ components, id: cardId }) =>
    (parentId === null || cardId === parentId) &&
    components.some(({ id: componentId }) => componentId === id));
  return parent?.components.find(({ id: componentId }) => componentId === id);
}

function comparisonComponent(benchmarkKey, index, snapshotKey = null) {
  const source = benchmarkByKey.get(benchmarkKey);
  const nested = source.components[index];
  const key = snapshotKey ?? (benchmarkKey === "skeletons"
    ? "comparison-cinderling"
    : index === 0
      ? "comparison-briar-runner"
      : "comparison-briar-darter");
  return Object.fromEntries(
    COMPONENT_SNAPSHOT
      .filter((snapshot) => snapshot.key === key)
      .flatMap((snapshot) => Object.keys(snapshot))
      .filter((key) => !["key", "unverified_fields"].includes(key))
      .map((key) => [key, nested[key]]),
  );
}

test("squad content: catalog is canonical with exact component counts and roles", () => {
  const catalog = createSwarmCatalog();
  assert.deepEqual(
    catalog.map(({ id, displayName, count }) => ({ count, displayName, id })),
    [
      { count: 6, displayName: "Briar Band", id: "briar-band" },
      { count: 15, displayName: "Cinder Host", id: "cinder-host" },
      { count: 3, displayName: "Cinderlings", id: "cinderlings" },
      { count: 5, displayName: "Forgeguard", id: "forgeguard" },
      { count: 4, displayName: "Thornscouts", id: "thornscouts" },
    ],
  );
  assert.deepEqual(
    card("cinderlings").components.map(
      ({ count, id, role }) => ({ count, id, role }),
    ),
    [{ count: 3, id: "cinderling", role: "primary" }],
  );
  assert.deepEqual(
    card("cinder-host").components.map(
      ({ count, id, role }) => ({ count, id, role }),
    ),
    [{ count: 15, id: "cinderling", role: "primary" }],
  );
  assert.deepEqual(
    card("briar-band").components.map(
      ({ count, id, role }) => ({ count, id, role }),
    ),
    [
      { count: 3, id: "briar-runner", role: "primary" },
      { count: 3, id: "briar-darter", role: "secondary" },
    ],
  );
  for (const entry of catalog) {
    const primary = entry.components.find(({ role }) => role === "primary");
    for (const field of [
      "kind",
      "hitpoints",
      "damage",
      "hitSpeedTicks",
      "firstHitTicks",
      "deployTimeTicks",
      "rangeMillitiles",
      "sightRangeMillitiles",
      "movementMillitilesPerSecond",
      "targetMode",
      "areaDamageRadiusMillitiles",
    ]) {
      assert.equal(entry[field], primary[field], `${entry.id}.${field}`);
    }
  }
});

test("squad content: top-level parity reports authority and questions", (context) => {
  const reports = createSwarmCatalog().filter(({ id }) => Object.hasOwn(CARD_KEYS, id)).map((runtimeCard) => ({
    runtimeId: runtimeCard.id,
    ...evaluateCardParity(runtimeCard, CARD_KEYS[runtimeCard.id]),
  }));
  assert.deepEqual(reports.flatMap(({ authoritativeFailures }) =>
    authoritativeFailures
  ), []);
  assert.equal(
    reports.flatMap(({ fields }) => fields).length,
    28,
  );
  assert.ok(reports.flatMap(({ questions }) => questions).length > 0);
  context.diagnostic(`top-level parity ${JSON.stringify(reports)}`);
});

test("new squads retain the pinned Goblins and Barbarians mechanics as unverified questions", () => {
  const sourceRows = [
    ["thornscouts", "goblins", 2, 4, 202, 120, 66, 42, 60, 500, 5500, 2000],
    ["forgeguard", "barbarians", 5, 5, 670, 192, 78, 54, 60, 700, 5500, 1000],
  ];
  const mechanicsFields = [
    "hitpoints", "damage", "hit_speed_seconds", "first_hit_seconds",
    "deploy_time_seconds", "range_tiles", "sight_range_tiles",
    "movement_speed_tiles_per_second", "targets", "count",
  ];
  for (const [id, key, cost, count, hp, damage, hitTicks, firstTicks,
    deployTicks, range, sight, speed] of sourceRows) {
    const pinned = benchmarkByKey.get(key);
    const runtime = card(id);
    assert.ok(pinned.unverified_fields.includes("count"));
    assert.ok(mechanicsFields.every((field) => pinned.unverified_fields.includes(field)),
      `${key} mechanics remain explicitly unverified`);
    assert.deepEqual(
      [runtime.cost, runtime.count, runtime.hitpoints, runtime.damage,
        runtime.hitSpeedTicks, runtime.firstHitTicks, runtime.deployTimeTicks,
        runtime.rangeMillitiles, runtime.sightRangeMillitiles,
        runtime.movementMillitilesPerSecond, runtime.targetMode],
      [cost, count, hp, damage, hitTicks, firstTicks, deployTicks, range, sight,
        speed, "ground"],
      `${id} keeps its selected comparison-derived runtime values`,
    );
  }
});

test("squad content: nested trusted snapshot matches the reference rows", () => {
  const sourceRows = [
    comparisonComponent("skeletons", 0),
    comparisonComponent("goblin-gang", 0),
    comparisonComponent("goblin-gang", 1),
    comparisonComponent("goblins", 0, "comparison-thornscout"),
    comparisonComponent("barbarians", 0, "comparison-forgeguard"),
  ];
  const expectedRows = COMPONENT_SNAPSHOT.map((snapshot) =>
    Object.fromEntries(
      Object.entries(snapshot).filter(
        ([key]) => !["key", "unverified_fields"].includes(key),
      ),
    )
  );
  assert.deepEqual(sourceRows, expectedRows);

  const sources = [
    benchmarkByKey.get("skeletons"),
    benchmarkByKey.get("goblin-gang"),
    benchmarkByKey.get("goblin-gang"),
    benchmarkByKey.get("goblins"),
    benchmarkByKey.get("barbarians"),
  ];
  const comparedBenchmarkFields = new Set(
    COMPONENT_FIELDS.map(([, benchmarkField]) => benchmarkField),
  );
  assert.deepEqual(
    COMPONENT_SNAPSHOT.map(({ unverified_fields }) => unverified_fields),
    sources.map(({ unverified_fields }) =>
      unverified_fields.filter((field) => comparedBenchmarkFields.has(field))
    ),
  );
});

test("squad content: nested component parity is provenance-aware", (context) => {
  const reports = [
    evaluateComponentParity(
      component("cinderling"),
      "comparison-cinderling",
    ),
    evaluateComponentParity(
      component("briar-runner"),
      "comparison-briar-runner",
    ),
    evaluateComponentParity(
      component("briar-darter"),
      "comparison-briar-darter",
    ),
    evaluateComponentParity(
      component("thornscout"),
      "comparison-thornscout",
    ),
    evaluateComponentParity(
      component("forgeguard"),
      "comparison-forgeguard",
    ),
  ];
  assert.deepEqual(reports.flatMap(({ authoritativeFailures }) =>
    authoritativeFailures
  ), []);
  assert.equal(reports.flatMap(({ fields }) => fields).length, 55);
  assert.ok(reports.flatMap(({ questions }) => questions).length > 0);
  context.diagnostic(`nested parity ${JSON.stringify(reports)}`);
});

test("squad content: expansion preserves component order, roles, and ascending IDs", () => {
  const cinderHost = createSquadMembers("cinder-host", 70);
  assert.deepEqual(cinderHost.map(({ componentId, id, role }) => ({
    componentId, id, role,
  })), Array.from({ length: 15 }, (_, index) => ({
    componentId: "cinderling", id: 70 + index, role: "primary",
  })));
  assert.ok(cinderHost.every(({ damage, hitpoints, speed, targetMode }) =>
    damage === 81 && hitpoints === 81 && speed === 1500 && targetMode === "ground"));

  const cinderlings = createSquadMembers("cinderlings", 40);
  assert.deepEqual(
    cinderlings.map(({ componentId, id, role }) => ({
      componentId,
      id,
      role,
    })),
    [
      { componentId: "cinderling", id: 40, role: "primary" },
      { componentId: "cinderling", id: 41, role: "primary" },
      { componentId: "cinderling", id: 42, role: "primary" },
    ],
  );

  const band = createSquadMembers("briar-band", 100);
  assert.deepEqual(
    band.map(({ componentId, id, role }) => ({ componentId, id, role })),
    [
      { componentId: "briar-runner", id: 100, role: "primary" },
      { componentId: "briar-runner", id: 101, role: "primary" },
      { componentId: "briar-runner", id: 102, role: "primary" },
      { componentId: "briar-darter", id: 103, role: "secondary" },
      { componentId: "briar-darter", id: 104, role: "secondary" },
      { componentId: "briar-darter", id: 105, role: "secondary" },
    ],
  );
  assert.deepEqual(
    band.slice(0, 3).map(({ damage, hitpoints, targetMode }) => ({
      damage,
      hitpoints,
      targetMode,
    })),
    Array(3).fill({ damage: 120, hitpoints: 202, targetMode: "ground" }),
  );
  assert.deepEqual(
    band.slice(3).map(({ damage, hitpoints, targetMode }) => ({
      damage,
      hitpoints,
      targetMode,
    })),
    Array(3).fill({
      damage: 81,
      hitpoints: 133,
      targetMode: "ground-and-air",
    }),
  );
  for (const [cardId, componentId, count, hp, damage] of [
    ["thornscouts", "thornscout", 4, 202, 120],
    ["forgeguard", "forgeguard", 5, 670, 192],
  ]) {
    const members = createSquadMembers(cardId, 300);
    assert.equal(members.length, count, `${cardId} expands its pinned count`);
    assert.deepEqual(members.map(({ componentId: id, damage: hit, hitpoints }) => ({
      componentId: id, damage: hit, hitpoints,
    })), Array(count).fill({ componentId, damage, hitpoints: hp }));
  }
});

test("squad content: catalog, expansion, and layout outputs are isolated", () => {
  const catalog = createSwarmCatalog();
  catalog[0].components[0].damage = 1;
  catalog[0].components.pop();
  assert.equal(component("briar-runner").damage, 120);
  assert.equal(card("briar-band").components.length, 2);

  const firstMembers = createSquadMembers("briar-band", 1);
  firstMembers[0].damage = 1;
  firstMembers.reverse();
  assert.deepEqual(
    createSquadMembers("briar-band", 1).map(({ damage, id }) => ({
      damage,
      id,
    })),
    [
      { damage: 120, id: 1 },
      { damage: 120, id: 2 },
      { damage: 120, id: 3 },
      { damage: 81, id: 4 },
      { damage: 81, id: 5 },
      { damage: 81, id: 6 },
    ],
  );

  const firstLayout = layoutSquad("cinderlings", 1, 250, { x: 0, y: 0 });
  firstLayout[0].offset.x = 99;
  firstLayout[0].position.x = 99;
  assert.equal(
    layoutSquad("cinderlings", 1, 250, { x: 0, y: 0 })[0].offset.x,
    0,
  );
});

test("squad content: radius-250 layouts are pinned to formation-engine slots", () => {
  assert.deepEqual(
    layoutSquad("cinderlings", 7, 250, { x: 1000, y: 2000 }),
    [
      {
        id: 7,
        role: "primary",
        radius: 250,
        offset: { x: 0, y: -502 },
        position: { x: 1000, y: 1498 },
      },
      {
        id: 8,
        role: "primary",
        radius: 250,
        offset: { x: -251, y: 251 },
        position: { x: 749, y: 2251 },
      },
      {
        id: 9,
        role: "primary",
        radius: 250,
        offset: { x: 251, y: 251 },
        position: { x: 1251, y: 2251 },
      },
    ],
  );
  assert.deepEqual(
    layoutSquad("briar-band", 10, 250, { x: 0, y: 0 })
      .map(({ id, offset, role }) => ({ id, offset, role })),
    [
      { id: 10, offset: { x: -502, y: -251 }, role: "primary" },
      { id: 11, offset: { x: 0, y: -251 }, role: "primary" },
      { id: 12, offset: { x: 502, y: -251 }, role: "primary" },
      { id: 13, offset: { x: -502, y: 251 }, role: "secondary" },
      { id: 14, offset: { x: 0, y: 251 }, role: "secondary" },
      { id: 15, offset: { x: 502, y: 251 }, role: "secondary" },
    ],
  );
});

test("squad content: layouts are non-overlapping, ordered, and symmetric", () => {
  for (const cardId of ["cinderlings", "briar-band"]) {
    const layout = layoutSquad(cardId, 1, 250, { x: -4000, y: 6000 });
    assert.deepEqual(
      layout.map(({ id }) => id),
      Array.from({ length: layout.length }, (_, index) => index + 1),
    );
    assert.equal(
      layout.reduce((sum, { offset }) => sum + offset.x, 0),
      0,
    );
    assert.equal(
      layout.reduce((sum, { offset }) => sum + offset.y, 0),
      0,
    );
    for (let left = 0; left < layout.length; left += 1) {
      for (let right = left + 1; right < layout.length; right += 1) {
        const dx = layout[left].position.x - layout[right].position.x;
        const dy = layout[left].position.y - layout[right].position.y;
        assert.ok(
          dx * dx + dy * dy >
            (layout[left].radius + layout[right].radius) ** 2,
        );
      }
    }
  }
});

test("squad content: identity and geometry boundaries reject unsafe shapes", () => {
  for (const cardId of [null, 1, {}, new String("cinderlings"), "unknown"]) {
    assert.throws(() => createSquadMembers(cardId, 1));
  }
  for (const firstId of [
    0,
    -1,
    1.5,
    Number.NaN,
    Number.MAX_SAFE_INTEGER,
    { valueOf: () => 1 },
  ]) {
    assert.throws(() => createSquadMembers("cinderlings", firstId));
  }
  for (const radius of [-1, 0.5, Number.NaN, { valueOf: () => 250 }]) {
    assert.throws(() =>
      layoutSquad("cinderlings", 1, radius, { x: 0, y: 0 })
    );
  }
  for (const anchor of [
    { x: 0 },
    { x: 0, y: 0, extra: true },
    { x: 0.5, y: 0 },
    Object.defineProperty({ y: 0 }, "x", {
      enumerable: true,
      get() {
        throw new Error("must not execute");
      },
    }),
  ]) {
    assert.throws(() => layoutSquad("cinderlings", 1, 250, anchor));
  }

  const sparseAnchor = [];
  sparseAnchor.length = 2;
  assert.throws(() => layoutSquad("cinderlings", 1, 250, sparseAnchor));
});

test("squad content: one simultaneous hit kills all three 81-health members", () => {
  const members = createSquadMembers("cinderlings", 30);
  const damage = new DamageSystem();
  for (const member of members) damage.add(member.id, member.hitpoints);
  const result = damage.damageSimultaneously(
    [...members].reverse().map(({ id }) => ({ amount: 81, targetId: id })),
  );
  assert.deepEqual(
    damage.list().map(({ currentHealth, dead, id }) => ({
      currentHealth,
      dead,
      id,
    })),
    [
      { currentHealth: 0, dead: true, id: 30 },
      { currentHealth: 0, dead: true, id: 31 },
      { currentHealth: 0, dead: true, id: 32 },
    ],
  );
  assert.deepEqual(
    result.events.filter(({ type }) => type === "death"),
    [
      { targetId: 30, type: "death" },
      { targetId: 31, type: "death" },
      { targetId: 32, type: "death" },
    ],
  );
});

test("squad content: mixed 133 damage leaves primaries at 69 and kills secondaries", () => {
  const members = createSquadMembers("briar-band", 50);
  const damage = new DamageSystem();
  for (const member of members) damage.add(member.id, member.hitpoints);
  const result = damage.damageSimultaneously(
    [...members].reverse().map(({ id }) => ({ amount: 133, targetId: id })),
  );
  assert.deepEqual(
    damage.list().map(({ currentHealth, dead, id }) => ({
      currentHealth,
      dead,
      id,
    })),
    [
      { currentHealth: 69, dead: false, id: 50 },
      { currentHealth: 69, dead: false, id: 51 },
      { currentHealth: 69, dead: false, id: 52 },
      { currentHealth: 0, dead: true, id: 53 },
      { currentHealth: 0, dead: true, id: 54 },
      { currentHealth: 0, dead: true, id: 55 },
    ],
  );
  assert.deepEqual(
    result.events.filter(({ type }) => type === "death"),
    [
      { targetId: 53, type: "death" },
      { targetId: 54, type: "death" },
      { targetId: 55, type: "death" },
    ],
  );
});

test("squad content: aggregate offense is 243 and 603 with a 603/604 boundary", () => {
  const cinderlings = createSquadMembers("cinderlings", 1);
  const band = createSquadMembers("briar-band", 10);
  assert.equal(
    cinderlings.reduce((sum, { damage }) => sum + damage, 0),
    243,
  );
  assert.equal(
    band.reduce((sum, { damage }) => sum + damage, 0),
    603,
  );

  for (const health of [603, 604]) {
    const defender = new DamageSystem();
    defender.add(1000, health);
    const result = defender.damageSimultaneously(
      band.map(({ damage }) => ({ amount: damage, targetId: 1000 })),
    );
    assert.deepEqual(defender.get(1000), {
      currentHealth: health === 603 ? 0 : 1,
      dead: health === 603,
      id: 1000,
      maxHealth: health,
    });
    assert.equal(
      result.events.filter(({ type }) => type === "death").length,
      health === 603 ? 1 : 0,
    );
  }
});

test("squad content: shipped module has original identities and scoped claims", () => {
  const source = readFileSync(
    new URL("../src/content/cards/swarms.js", import.meta.url),
    "utf8",
  );
  const protectedTokens = new Set(
    benchmark.cards.flatMap(({ key, name }) => [
      key.toLowerCase(),
      name.toLowerCase(),
    ]),
  );
  assert.deepEqual(protectedIdentityHits(source, protectedTokens), []);
  assert.doesNotMatch(source, /\breference\b|readFile|cards\.json/u);

  for (const member of createSquadMembers("briar-band", 1)) {
    assert.equal(Object.hasOwn(member, "radius"), false);
    assert.equal(Object.hasOwn(member, "position"), false);
    assert.equal(Object.hasOwn(member, "projectileSpeed"), false);
    assert.equal(Object.hasOwn(member, "projectileTravelTicks"), false);
  }
  assert.equal(
    Object.hasOwn(card("briar-band"), "formationRadiusMillitiles"),
    false,
  );
});
