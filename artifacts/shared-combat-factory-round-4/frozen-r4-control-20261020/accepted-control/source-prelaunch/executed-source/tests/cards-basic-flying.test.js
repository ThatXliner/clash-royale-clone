import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BasicFlyingDuel,
  acquireBasicFlyingTarget,
  advanceBasicFlyingMovement,
  createBasicFlyingCatalog,
  createBasicFlyingCombatant,
  createBasicFlyingMovement,
  restoreBasicFlyingMovement,
  serializeBasicFlyingMovement,
} from "../src/content/index.js";
import { acquireTarget } from "../src/sim/targeting.js";
import { protectedIdentityHits } from "./helpers/protected-identity-scan.js";
import { createReferenceParityEvaluator } from "./helpers/reference-parity.js";

const benchmark = JSON.parse(readFileSync(
  new URL("../reference/stats/cards.json", import.meta.url),
  "utf8",
));

const EXPECTED = {
  skymaul: "mega-minion",
  copperskiff: "flying-machine",
};

const MECHANIC_FIELDS = [
  ["cost", "elixir_cost", (value) => value],
  ["kind", "type", (value) => value === "troop" ? "unit" : value],
  [
    "rarity",
    "rarity",
    (value) => ({ common: "standard", rare: "uncommon" })[value],
  ],
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
    (value) => value === "air_and_ground" ? "ground-and-air" : value,
  ],
  ["count", "count", (value) => value],
  [
    "areaDamageRadiusMillitiles",
    "area_damage_radius_tiles",
    (value) => value === null ? null : value * 1000,
  ],
];

const evaluateReferenceParity = createReferenceParityEvaluator(
  benchmark.cards,
  MECHANIC_FIELDS,
  Object.values(EXPECTED),
);

function setup(left, right, reverse = false) {
  const combatants = [
    createBasicFlyingCombatant(left, 101),
    createBasicFlyingCombatant(right, 202),
  ];
  return { combatants: reverse ? combatants.reverse() : combatants };
}

function run(left, right, reverse = false) {
  const duel = new BasicFlyingDuel(setup(left, right, reverse));
  return { duel, result: duel.run(1000) };
}

function attacks(replay, attackerId) {
  return replay
    .filter((event) => (
      event.type === "launch" &&
      event.projectile.attackerId === attackerId
    ))
    .map(({ tick }) => tick);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function candidate(id, layer, position = { x: 9000, y: 16000 }) {
  return {
    alive: true,
    id,
    kind: "troop",
    layer,
    position,
    radius: 0,
    targetable: true,
  };
}

function leafPaths(value, path = []) {
  if (value === null || typeof value !== "object") return [path];
  return Object.keys(value).flatMap((key) =>
    leafPaths(value[key], [...path, key])
  );
}

function mutateLeaf(snapshot, path) {
  const mutated = clone(snapshot);
  let parent = mutated;
  for (const key of path.slice(0, -1)) parent = parent[key];
  const key = path.at(-1);
  const value = parent[key];
  parent[key] = typeof value === "number"
    ? value + 1
    : typeof value === "string"
    ? `${value}-forged`
    : typeof value === "boolean"
    ? !value
    : "forged";
  return mutated;
}

test("basic flying content: exact original catalog is isolated", () => {
  const first = createBasicFlyingCatalog();
  assert.deepEqual(
    first.map(({ id, displayName }) => ({ id, displayName })),
    [
      { id: "copperskiff", displayName: "Copperskiff" },
      { id: "skymaul", displayName: "Skymaul" },
    ],
  );
  assert.equal(first.length, 2);
  for (const card of first) {
    assert.equal(card.kind, "unit");
    assert.equal(card.rarity, "uncommon");
    assert.equal(card.targetMode, "ground-and-air");
    assert.equal(card.count, 1);
    assert.equal(card.areaDamageRadiusMillitiles, null);
    assert.deepEqual(card.components, []);
  }
  first[0].hitpoints = 1;
  first[0].components.push({});
  assert.equal(
    createBasicFlyingCatalog().find(({ id }) => id === "copperskiff").hitpoints,
    614,
  );
  assert.deepEqual(
    createBasicFlyingCatalog().find(({ id }) => id === "copperskiff").components,
    [],
  );
});

test("basic flying content: all mechanics use trusted confidence dispositions", (context) => {
  const reports = createBasicFlyingCatalog().map((runtimeCard) => ({
    identity: "original-runtime-identity",
    runtimeId: runtimeCard.id,
    ...evaluateReferenceParity(runtimeCard, EXPECTED[runtimeCard.id]),
  }));
  assert.deepEqual(
    reports.flatMap(({ authoritativeFailures }) => authoritativeFailures),
    [],
  );
  assert.equal(reports.flatMap(({ fields }) => fields).length, 28);
  assert.ok(reports.flatMap(({ questions }) => questions).length > 0);
  assert.equal(
    reports.flatMap(({ fields }) => fields).every(({ disposition }) => (
      disposition === "match" ||
      disposition === "question-backed-match"
    )),
    true,
  );
  context.diagnostic(`parity report ${JSON.stringify(reports)}`);
});

test("basic flying content: confidence separates failure from question", () => {
  const authoritative = createBasicFlyingCatalog().find(
    ({ id }) => id === "skymaul",
  );
  authoritative.cost += 1;
  assert.deepEqual(
    evaluateReferenceParity(authoritative, EXPECTED.skymaul)
      .authoritativeFailures.map(({ runtimeField }) => runtimeField),
    ["cost"],
  );

  const uncertain = createBasicFlyingCatalog().find(
    ({ id }) => id === "copperskiff",
  );
  uncertain.damage += 1;
  const report = evaluateReferenceParity(uncertain, EXPECTED.copperskiff);
  assert.deepEqual(report.authoritativeFailures, []);
  assert.deepEqual(
    report.questions.filter(({ disposition }) => disposition === "question")
      .map(({ runtimeField }) => runtimeField),
    ["damage"],
  );
});

test("basic flying content: shipped module contains original identities only", () => {
  const source = readFileSync(
    new URL("../src/content/cards/basic-flying.js", import.meta.url),
    "utf8",
  );
  const protectedTokens = new Set(
    benchmark.cards.flatMap(({ key, name }) => [
      key.toLowerCase(),
      name.toLowerCase(),
    ]),
  );
  assert.deepEqual(protectedIdentityHits(source, protectedTokens), []);
  assert.doesNotMatch(source, /\breference\b/u);
  assert.doesNotMatch(source, /readFile|cards\.json/u);
});

test("basic flying content: movement binds exact card speed and composes restore", () => {
  for (const [cardId, distance] of [
    ["skymaul", 1000],
    ["copperskiff", 1500],
  ]) {
    const initial = createBasicFlyingMovement(cardId, {
      collisionRadius: 0,
      position: { x: 9000, y: 10000 },
      target: {
        position: { x: 9000, y: 20000 },
        radius: 0,
        range: 0,
      },
    });
    assert.deepEqual(
      advanceBasicFlyingMovement(initial, 60).position,
      { x: 9000, y: 10000 + distance },
    );

    const partial = advanceBasicFlyingMovement(initial, 17);
    const bytes = serializeBasicFlyingMovement(partial);
    const restored = restoreBasicFlyingMovement(bytes);
    assert.equal(serializeBasicFlyingMovement(restored), bytes);
    assert.deepEqual(
      advanceBasicFlyingMovement(restored, 43),
      advanceBasicFlyingMovement(initial, 60),
    );
  }
});

test("basic flying content: layer-aware targeting is delegated, not approximated", () => {
  const origin = { position: { x: 9000, y: 16000 }, radius: 0 };
  const ground = candidate(20, "ground", { x: 9000, y: 17000 });
  const air = candidate(10, "air", { x: 9000, y: 17000 });

  assert.equal(
    acquireBasicFlyingTarget("skymaul", origin, [ground, air]).id,
    10,
  );
  assert.equal(
    acquireBasicFlyingTarget("copperskiff", origin, [air, ground]).id,
    10,
  );
  assert.equal(
    acquireTarget(origin, [air], { mode: "ground", sightRange: 6000 }),
    null,
  );
  assert.equal(
    acquireTarget(origin, [air], { mode: "air", sightRange: 6000 }).id,
    10,
  );
  assert.equal(
    acquireTarget(
      origin,
      [air],
      { mode: "air_and_ground", sightRange: 6000 },
    ).id,
    10,
  );
});

test("basic flying content: mirror cadence and derived outcomes are exact", () => {
  const sky = run("skymaul", "skymaul");
  assert.deepEqual(attacks(sky.duel.replay, 101), [132, 228, 324]);
  assert.deepEqual(attacks(sky.duel.replay, 202), [132, 228, 324]);
  assert.deepEqual(sky.result.outcome, {
    deathTick: 324,
    draw: true,
    winnerId: null,
  });

  const copper = run("copperskiff", "copperskiff");
  assert.deepEqual(attacks(copper.duel.replay, 101), [96, 162, 228, 294]);
  assert.deepEqual(attacks(copper.duel.replay, 202), [96, 162, 228, 294]);
  assert.deepEqual(copper.result.outcome, {
    deathTick: 294,
    draw: true,
    winnerId: null,
  });
});

test("basic flying content: cross duel resolves simultaneous boundary consistently", () => {
  const { duel, result } = run("skymaul", "copperskiff");
  assert.deepEqual(attacks(duel.replay, 101), [132, 228]);
  assert.deepEqual(attacks(duel.replay, 202), [96, 162, 228]);
  assert.deepEqual(result.outcome, {
    deathTick: 228,
    draw: false,
    winnerId: 101,
  });
  assert.deepEqual(
    result.state.combatants.map(({ hitpoints, id }) => ({ hitpoints, id })),
    [
      { hitpoints: 324, id: 101 },
      { hitpoints: 0, id: 202 },
    ],
  );
});

test("basic flying content: duel uses air entities and explicit immediate geometry", () => {
  const duel = new BasicFlyingDuel(setup("skymaul", "copperskiff"));
  duel.stepMany(97);
  const snapshot = JSON.parse(duel.serialize());
  assert.deepEqual(
    snapshot.combat.setup.entities.map(({ layer }) => layer),
    ["air", "air"],
  );
  const launch = duel.replay.find(({ type }) => type === "launch");
  assert.deepEqual(
    {
      impactTick: launch.projectile.impactTick,
      launchTick: launch.projectile.launchTick,
      origin: launch.projectile.origin,
      radius: launch.projectile.radius,
      speed: launch.projectile.speed,
      targetPosition: launch.projectile.targetPosition,
    },
    {
      impactTick: 96,
      launchTick: 96,
      origin: { x: 0, y: 0 },
      radius: 0,
      speed: 1,
      targetPosition: { x: 0, y: 0 },
    },
  );
});

test("basic flying content: fresh, chunked, reversed, and restored are byte deterministic", () => {
  const fresh = run("skymaul", "copperskiff");
  const again = run("skymaul", "copperskiff");
  const reversed = run("skymaul", "copperskiff", true);
  assert.deepEqual(again.result, fresh.result);
  assert.deepEqual(again.duel.replay, fresh.duel.replay);
  assert.equal(again.duel.serialize(), fresh.duel.serialize());
  assert.deepEqual(reversed.result, fresh.result);
  assert.deepEqual(reversed.duel.replay, fresh.duel.replay);
  assert.equal(reversed.duel.serialize(), fresh.duel.serialize());

  const chunked = new BasicFlyingDuel(setup("skymaul", "copperskiff"));
  for (const count of [1, 17, 38, 44]) chunked.stepMany(count);
  const uninterrupted = new BasicFlyingDuel(
    setup("skymaul", "copperskiff"),
  );
  uninterrupted.stepMany(100);
  assert.equal(chunked.serialize(), uninterrupted.serialize());
  const restored = BasicFlyingDuel.restore(chunked.serialize());
  assert.equal(restored.serialize(), chunked.serialize());
  assert.deepEqual(restored.run(1000), chunked.run(1000));
  assert.equal(restored.serialize(), chunked.serialize());
});

test("basic flying content: projections, setup, and causal snapshots reject mutation", () => {
  assert.throws(() => createBasicFlyingCombatant("unknown", 1));
  for (const entityId of [0, -1, 1.5, "1"]) {
    assert.throws(() => createBasicFlyingCombatant("skymaul", entityId));
  }
  const valid = setup("skymaul", "copperskiff");
  const forged = clone(valid);
  forged.combatants[0].damage += 1;
  assert.throws(() => new BasicFlyingDuel(forged), /runtime card definition/u);
  assert.throws(() => new BasicFlyingDuel({
    combatants: valid.combatants,
    extra: true,
  }));

  for (const tick of [0, 97, 180, 229]) {
    const duel = new BasicFlyingDuel(valid);
    if (tick === 229) duel.run(1000);
    else duel.stepMany(tick);
    const serialized = duel.serialize();
    const snapshot = JSON.parse(serialized);
    assert.equal(BasicFlyingDuel.restore(serialized).serialize(), serialized);
    for (const path of leafPaths(snapshot)) {
      assert.throws(
        () => BasicFlyingDuel.restore(JSON.stringify(mutateLeaf(snapshot, path))),
        undefined,
        `accepted mutation at tick ${tick}: ${path.join(".")}`,
      );
    }
  }
});

test("basic flying content: derived snapshot ceilings reject before hostile traversal", () => {
  const limits = new Map([
    ["skymaul/skymaul", { history: 331, tick: 325 }],
    ["skymaul/copperskiff", { history: 234, tick: 229 }],
    ["copperskiff/skymaul", { history: 234, tick: 229 }],
    ["copperskiff/copperskiff", { history: 303, tick: 295 }],
  ]);

  for (const [pair, limit] of limits) {
    const [left, right] = pair.split("/");
    const duel = new BasicFlyingDuel(setup(left, right));
    duel.run(1000);
    const snapshot = JSON.parse(duel.serialize());
    assert.deepEqual(
      { history: snapshot.combat.history.length, tick: snapshot.tick },
      limit,
      pair,
    );
    assert.equal(BasicFlyingDuel.restore(duel.serialize()).serialize(),
      duel.serialize());
    const oneOverTick = clone(snapshot);
    oneOverTick.tick += 1;
    assert.throws(
      () => BasicFlyingDuel.restore(JSON.stringify(oneOverTick)),
      /tick exceeds its derived duel limit/u,
    );
    const oneOverHistory = clone(snapshot);
    oneOverHistory.combat.history.push(null);
    assert.throws(
      () => BasicFlyingDuel.restore(JSON.stringify(oneOverHistory)),
      /history exceeds its derived duel limit/u,
    );
  }

  const terminal = new BasicFlyingDuel(setup("skymaul", "skymaul"));
  terminal.run(1000);
  const hostile = JSON.parse(terminal.serialize());
  hostile.combat.history = Array(1_000_000).fill(null);
  const originalDescriptors = Object.getOwnPropertyDescriptors;
  let scans = 0;
  Object.getOwnPropertyDescriptors = function counted(value) {
    if (Array.isArray(value) && value.length === 1_000_000) scans += 1;
    return originalDescriptors(value);
  };
  try {
    assert.throws(
      () => BasicFlyingDuel.restore(JSON.stringify(hostile)),
      /history exceeds its derived duel limit/u,
    );
  } finally {
    Object.getOwnPropertyDescriptors = originalDescriptors;
  }
  assert.equal(scans, 0);
});

test("basic flying content: collision, travel, and moving-target parity are not claimed", () => {
  const source = readFileSync(
    new URL("../src/content/cards/basic-flying.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /Collision, projectile\s+\* travel, and moving-target parity/u);
  assert.match(source, /no projectile-speed value/u);
  assert.match(source, /radius 0 and synthetic speed 1/u);
});
