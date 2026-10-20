import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ReflectionEncounter,
  createReflectionQuestionFixture,
  createReflectionSpecialCatalog,
  createReflectionSpecialFixture,
} from "../src/content/index.js";
import { protectedIdentityHits } from "./helpers/protected-identity-scan.js";
import { createReferenceParityEvaluator } from "./helpers/reference-parity.js";

const benchmark = JSON.parse(readFileSync(
  new URL("../reference/stats/cards.json", import.meta.url), "utf8",
));
const FIELDS = [
  ["cost", "elixir_cost", (value) => value],
  ["kind", "type", (value) => value === "troop" ? "unit" : value],
  ["rarity", "rarity", (value) => value === "champion" ? "heroic" : value],
  ["hitpoints", "hitpoints", (value) => value],
  ["damage", "damage", (value) => value],
  ["hitSpeedTicks", "hit_speed_seconds", (value) => value * 60],
  ["firstHitTicks", "first_hit_seconds", (value) => value * 60],
  ["deployTimeTicks", "deploy_time_seconds", (value) => value * 60],
  ["rangeMillitiles", "range_tiles", (value) => value * 1000],
  ["sightRangeMillitiles", "sight_range_tiles", (value) => value * 1000],
  ["movementMillitilesPerSecond", "movement_speed_tiles_per_second",
    (value) => value * 1000],
  ["targetMode", "targets", (value) => value],
  ["count", "count", (value) => value],
  ["areaDamageRadiusMillitiles", "area_damage_radius_tiles",
    (value) => value === null ? null : value * 1000],
];
const parity = createReferenceParityEvaluator(benchmark.cards, FIELDS, ["monk"]);

function entity(id, x, y, ownerId, overrides = {}) {
  return {
    alive: true,
    id,
    kind: "troop",
    layer: "ground",
    maxHealth: 1000,
    ownerId,
    position: { x, y },
    radius: 0,
    reflector: false,
    targetable: true,
    ...overrides,
  };
}

function projectile(sourceId = 101, targetId = 301, overrides = {}) {
  return {
    damage: 140,
    ownerId: 1,
    radius: 0,
    sourceId,
    speed: 1000,
    targetId,
    ...overrides,
  };
}

function setup(overrides = {}) {
  return createReflectionSpecialFixture(
    overrides.entities ?? [
      entity(101, -4000, 0, 1),
      entity(201, 0, 0, 2, { reflector: true }),
      entity(301, 4000, 0, 2),
    ],
    overrides.projectiles ?? [projectile()],
    overrides.commands ?? [],
  );
}

function resultOf(identity) {
  const encounter = new ReflectionEncounter(identity);
  encounter.run();
  return {
    replay: encounter.replay,
    snapshot: encounter.serialize(),
    state: encounter.state,
  };
}

function reflections(encounter) {
  return encounter.replay.filter(({ type }) => type === "projectile-reflection");
}

function independentSegmentCircle(start, end, center, radius) {
  const dx = BigInt(end.x - start.x);
  const dy = BigInt(end.y - start.y);
  const px = BigInt(center.x - start.x);
  const py = BigInt(center.y - start.y);
  const length2 = dx * dx + dy * dy;
  const dot = px * dx + py * dy;
  const radius2 = BigInt(radius) ** 2n;
  if (dot <= 0n) return px * px + py * py <= radius2;
  if (dot >= length2) {
    const ex = BigInt(center.x - end.x);
    const ey = BigInt(center.y - end.y);
    return ex * ex + ey * ey <= radius2;
  }
  return (px * dy - py * dx) ** 2n <= radius2 * length2;
}

function independentIntegerSquareRoot(value) {
  if (value < 2n) return value;
  let low = 1n;
  let high = value;
  while (low + 1n < high) {
    const middle = (low + high) / 2n;
    if (middle * middle <= value) low = middle;
    else high = middle;
  }
  return low;
}

function independentTimeline(source, target, reflector, speed = 1000, radius = 500) {
  let position = { ...source };
  for (let tick = 1; tick <= 128; tick += 1) {
    const dx = BigInt(target.x) - BigInt(position.x);
    const dy = BigInt(target.y) - BigInt(position.y);
    const distanceSquared = dx * dx + dy * dy;
    const distance = independentIntegerSquareRoot(distanceSquared);
    assert.equal(distance * distance, distanceSquared);
    const speedBig = BigInt(speed);
    const next = distance <= speedBig
      ? { ...target }
      : {
        x: Number(BigInt(position.x) + dx * speedBig / distance),
        y: Number(BigInt(position.y) + dy * speedBig / distance),
      };
    assert.equal(dx * speedBig % distance, 0n);
    assert.equal(dy * speedBig % distance, 0n);
    if (independentSegmentCircle(position, next, reflector, radius)) return tick;
    position = next;
  }
  return null;
}

test("reflection special: original identity maps test-only to caveated base fields", () => {
  const catalog = createReflectionSpecialCatalog();
  assert.deepEqual(catalog, [{
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 5,
    count: 1,
    damage: 140,
    deployTimeTicks: 60,
    displayName: "Aegis Sage",
    firstHitTicks: 36,
    hitSpeedTicks: 48,
    hitpoints: 2000,
    id: "aegis-sage",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 1200,
    rarity: "heroic",
    sightRangeMillitiles: 5500,
    targetMode: "ground",
  }]);
  catalog[0].damage = 1;
  assert.equal(createReflectionSpecialCatalog()[0].damage, 140);
  const report = parity(createReflectionSpecialCatalog()[0], "monk");
  assert.deepEqual(report.authoritativeFailures, []);
  assert.deepEqual(
    report.fields.filter(({ disposition }) =>
      disposition === "question-backed-match")
      .map(({ benchmarkField }) => benchmarkField).sort(),
    [
      "count", "damage", "deploy_time_seconds", "first_hit_seconds",
      "hit_speed_seconds", "hitpoints", "movement_speed_tiles_per_second",
      "range_tiles", "sight_range_tiles", "targets",
    ],
  );
});

test("reflection special: every absent value and policy is a fresh frozen QUESTION", () => {
  const fixture = createReflectionQuestionFixture();
  assert.equal(Object.keys(fixture).length, 31);
  assert.ok(Object.isFrozen(fixture));
  for (const record of Object.values(fixture)) {
    assert.ok(Object.isFrozen(record));
    assert.deepEqual({
      authoritative: record.authoritative,
      confidence: record.confidence,
      disposition: record.disposition,
      source: record.source,
    }, {
      authoritative: false,
      confidence: "unverified",
      disposition: "question",
      source: "unsourced-projectile-reflection-fixture",
    });
  }
  const second = createReflectionQuestionFixture();
  assert.notEqual(second, fixture);
  for (const key of Object.keys(fixture)) assert.notEqual(second[key], fixture[key]);
  assert.throws(() => { fixture.loopPolicy.value = "changed"; }, TypeError);
  assert.throws(() => createReflectionQuestionFixture({}), /does not accept/u);
});

test("reflection special: replacement is exact, monotonic, and provenance linked", () => {
  const encounter = new ReflectionEncounter();
  encounter.run();
  const [event] = reflections(encounter);
  assert.equal(event.tick, 4);
  assert.equal(event.parentProjectileId, 1);
  assert.deepEqual(event.projectile, {
    damage: 140,
    id: 2,
    launchTick: 4,
    origin: { x: 0, y: 0 },
    ownerId: 2,
    position: { x: 0, y: 0 },
    provenance: {
      parentProjectileId: 1,
      reflectionCount: 1,
      rootProjectileId: 1,
    },
    radius: 0,
    sourceId: 201,
    speed: 1000,
    targetId: 101,
    targetPosition: { x: -4000, y: 0 },
  });
  assert.deepEqual(
    encounter.replay.filter(({ type }) =>
      ["projectile-reflection", "projectile-contact", "projectile-damage"]
        .includes(type)).map(({ projectileId, tick, type }) => ({
      projectileId: projectileId ?? null, tick, type,
    })),
    [
      { projectileId: null, tick: 4, type: "projectile-reflection" },
      { projectileId: 2, tick: 8, type: "projectile-contact" },
      { projectileId: 2, tick: 8, type: "projectile-damage" },
    ],
  );
  assert.equal(encounter.state.entities.find(({ id }) => id === 101).hitpoints, 860);
  assert.equal(encounter.state.entities.find(({ id }) => id === 301).hitpoints, 1000);
});

test("reflection special: runtime timing agrees with an independent timeline oracle", () => {
  const encounter = new ReflectionEncounter();
  encounter.run();
  assert.equal(
    reflections(encounter)[0].tick,
    independentTimeline(
      { x: -4000, y: 0 }, { x: 4000, y: 0 }, { x: 0, y: 0 },
    ),
  );
  const replacementFlightTicks = independentTimeline(
    { x: 0, y: 0 }, { x: -4000, y: 0 }, { x: -4000, y: 0 }, 1000, 0,
  );
  assert.equal(replacementFlightTicks, 4);
  assert.equal(encounter.state.tick, reflections(encounter)[0].tick + replacementFlightTicks);
});

test("reflection special: reflection precedes otherwise same-boundary damage", () => {
  const encounter = new ReflectionEncounter(setup({
    entities: [
      entity(101, -1000, 0, 1),
      entity(201, 0, 0, 2, { reflector: true }),
      entity(301, 0, 0, 2),
    ],
  }));
  encounter.step();
  assert.deepEqual(encounter.replay.filter(({ tick }) => tick === 1)
    .map(({ type }) => type), ["projectile-reflection"]);
  assert.equal(encounter.state.entities.find(({ id }) => id === 301).hitpoints, 1000);
});

test("reflection special: simultaneous parents and reflectors use stable IDs", () => {
  const identity = setup({
    entities: [
      entity(101, -4000, -1000, 1),
      entity(102, -4000, 1000, 1),
      entity(201, 0, -1000, 2, { reflector: true }),
      entity(202, 0, 1000, 2, { reflector: true }),
      entity(301, 4000, -1000, 2),
      entity(302, 4000, 1000, 2),
    ],
    projectiles: [projectile(102, 302), projectile(101, 301)],
  });
  const encounter = new ReflectionEncounter(identity);
  encounter.stepMany(4);
  assert.deepEqual(reflections(encounter).map((event) => ({
    parent: event.parentProjectileId,
    replacement: event.projectile.id,
    reflector: event.reflectorId,
  })), [
    { parent: 1, replacement: 3, reflector: 201 },
    { parent: 2, replacement: 4, reflector: 202 },
  ]);
});

test("reflection special: lowest reflector ID wins an exact simultaneous tie", () => {
  const encounter = new ReflectionEncounter(setup({
    entities: [
      entity(101, -4000, 0, 1),
      entity(201, 0, 500, 2, { reflector: true }),
      entity(202, 0, -500, 2, { reflector: true }),
      entity(301, 4000, 0, 2),
    ],
    projectiles: [projectile(101, 301, { speed: 5000 })],
  }));
  encounter.stepMany(4);
  assert.equal(reflections(encounter)[0].reflectorId, 201);
});

test("reflection special: inclusive segment-circle edges are exact across signed axes and diagonals", () => {
  const directions = [
    { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
    { x: 3, y: 4 }, { x: -3, y: 4 }, { x: 3, y: -4 }, { x: -3, y: -4 },
  ];
  let probes = 0;
  for (const direction of directions) {
    const source = { x: -800 * direction.x, y: -800 * direction.y };
    const target = { x: 800 * direction.x, y: 800 * direction.y };
    const magnitude = Math.hypot(direction.x, direction.y);
    const tangent = {
      x: -direction.y * 500 / magnitude,
      y: direction.x * 500 / magnitude,
    };
    const outward = {
      x: tangent.x + Math.sign(tangent.x || direction.y * -1),
      y: tangent.y + Math.sign(tangent.y || direction.x),
    };
    for (const [point, expected] of [[tangent, true], [outward, false]]) {
      const oracle = independentSegmentCircle(source, target, point, 500);
      assert.equal(oracle, expected);
      const encounter = new ReflectionEncounter(setup({
        entities: [
          entity(101, source.x, source.y, 1),
          entity(201, point.x, point.y, 2, { reflector: true }),
          entity(301, target.x, target.y, 2),
        ],
        projectiles: [projectile(101, 301, { speed: 5000 })],
      }));
      encounter.step();
      assert.equal(reflections(encounter).length === 1, expected);
      probes += 1;
    }
  }
  assert.equal(probes, 16);
});

test("reflection special: invalid and ineligible reflectors are ignored", () => {
  const variants = [
    { alive: false }, { ownerId: 1 }, { reflector: false },
    { targetable: false },
  ];
  for (const override of variants) {
    const encounter = new ReflectionEncounter(setup({
      entities: [
        entity(101, -4000, 0, 1),
        entity(201, 0, 0, 2, { reflector: true, ...override }),
        entity(301, 4000, 0, 2),
      ],
    }));
    encounter.run();
    assert.equal(reflections(encounter).length, 0);
    assert.equal(
      encounter.state.entities.find(({ id }) => id === 301).hitpoints, 860,
    );
  }
});

test("reflection special: source and target cannot self-reflect", () => {
  const encounter = new ReflectionEncounter(setup({
    entities: [
      entity(101, -4000, 0, 1, { reflector: true }),
      entity(301, 4000, 0, 2, { reflector: true }),
    ],
  }));
  encounter.run();
  assert.equal(reflections(encounter).length, 0);
});

test("reflection special: maximum-one policy prevents loops", () => {
  const encounter = new ReflectionEncounter(setup({
    entities: [
      entity(101, -4000, 0, 1),
      entity(201, 0, 0, 2, { reflector: true }),
      entity(202, -2000, 0, 1, { reflector: true }),
      entity(301, 4000, 0, 2),
    ],
  }));
  encounter.run();
  assert.equal(reflections(encounter).length, 1);
  assert.equal(encounter.state.nextProjectileId, 3);
});

test("reflection special: target death before original contact fizzles", () => {
  const encounter = new ReflectionEncounter(setup({
    entities: [
      entity(101, -4000, 0, 1),
      entity(301, 4000, 0, 2),
    ],
    commands: [{ targetId: 301, tick: 4, type: "kill-entity" }],
  }));
  encounter.run();
  assert.deepEqual(encounter.replay.filter(({ type }) =>
    type === "projectile-fizzle").map(({ tick }) => tick), [4]);
});

test("reflection special: original source death after launch does not cancel flight", () => {
  const encounter = new ReflectionEncounter(setup({
    commands: [{ targetId: 101, tick: 1, type: "kill-entity" }],
  }));
  encounter.run();
  assert.equal(reflections(encounter).length, 1);
  assert.deepEqual(encounter.replay.filter(({ type }) =>
    type === "projectile-fizzle").map(({ projectileId }) => projectileId), [2]);
});

test("reflection special: reflected-target death on reflection boundary fizzles later", () => {
  const encounter = new ReflectionEncounter(setup({
    commands: [{ targetId: 101, tick: 4, type: "kill-entity" }],
  }));
  encounter.run();
  assert.equal(reflections(encounter).length, 1);
  assert.deepEqual(encounter.replay.filter(({ type }) =>
    type === "projectile-fizzle").map(({ projectileId, tick }) => ({
      projectileId, tick,
    })), [{ projectileId: 2, tick: 5 }]);
});

test("reflection special: reflector death on inclusive boundary suppresses reflection", () => {
  const encounter = new ReflectionEncounter(setup({
    commands: [{ targetId: 201, tick: 4, type: "kill-entity" }],
  }));
  encounter.run();
  assert.equal(reflections(encounter).length, 0);
  assert.equal(encounter.state.entities.find(({ id }) => id === 301).hitpoints, 860);
});

test("reflection special: caller setup and returned output are isolated", () => {
  const identity = setup();
  const expected = resultOf(setup());
  const encounter = new ReflectionEncounter(identity);
  identity.entities.reverse();
  identity.entities[0].position.x = 9999;
  identity.projectiles[0].damage = 999;
  encounter.run();
  const state = encounter.state;
  const replay = encounter.replay;
  state.entities[0].hitpoints = 1;
  replay.length = 0;
  assert.deepEqual({
    replay: encounter.replay,
    snapshot: encounter.serialize(),
    state: encounter.state,
  }, expected);
});

test("reflection special: fresh, reordered, and chunked execution is byte-identical", () => {
  const identity = setup();
  const expected = resultOf(identity);
  assert.deepEqual(resultOf(setup()), expected);
  assert.deepEqual(resultOf(createReflectionSpecialFixture(
    [...identity.entities].reverse(),
    [...identity.projectiles].reverse(),
    [...identity.commands].reverse(),
  )), expected);
  const chunked = new ReflectionEncounter(identity);
  for (const chunk of [1, 2, 1, 3, 1]) chunked.stepMany(chunk);
  chunked.run();
  assert.deepEqual({
    replay: chunked.replay,
    snapshot: chunked.serialize(),
    state: chunked.state,
  }, expected);
});

test("reflection special: every pre- and post-reflection restore is byte-identical", () => {
  const identity = setup();
  const expected = resultOf(identity);
  let splits = 0;
  for (let split = 0; split <= expected.state.tick; split += 1) {
    const partial = new ReflectionEncounter(identity);
    partial.stepMany(split);
    const restored = ReflectionEncounter.restore(partial.serialize());
    restored.run();
    assert.deepEqual({
      replay: restored.replay,
      snapshot: restored.serialize(),
      state: restored.state,
    }, expected, `restore split ${split}`);
    splits += 1;
  }
  assert.equal(splits, 9);
});

test("reflection special: hostile getters, prototypes, sparse, extra, and symbols reject", () => {
  let calls = 0;
  const hostile = entity(101, -4000, 0, 1);
  Object.defineProperty(hostile.position, "x", {
    enumerable: true,
    get() { calls += 1; return -4000; },
  });
  assert.throws(() => createReflectionSpecialFixture([hostile], []));
  assert.equal(calls, 0);
  const inherited = Object.create({ inherited: true });
  Object.assign(inherited, entity(101, 0, 0, 1));
  assert.throws(() => createReflectionSpecialFixture([inherited], []), /plain/u);
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => createReflectionSpecialFixture(sparse, []), /dense/u);
  const extraArray = [entity(101, 0, 0, 1)];
  extraArray.extra = true;
  assert.throws(() => createReflectionSpecialFixture(extraArray, []), /dense/u);
  const symbol = entity(101, 0, 0, 1);
  symbol[Symbol("hostile")] = true;
  assert.throws(() => createReflectionSpecialFixture([symbol], []), /shape/u);
});

test("reflection special: duplicate, unsafe, overflow, and oversized setup rejects", () => {
  const source = entity(101, -4000, 0, 1);
  const target = entity(301, 4000, 0, 2);
  for (const entities of [
    [source, source],
    new Array(33).fill(null).map((_, index) => entity(100 + index, 0, 0, 1)),
    [{ ...source, id: Number.MAX_SAFE_INTEGER + 1 }, target],
    [{ ...source, position: { x: Number.MAX_SAFE_INTEGER, y: 0 } }, target],
    [{ ...source, radius: Number.MAX_SAFE_INTEGER }, target],
  ]) assert.throws(() => createReflectionSpecialFixture(entities, []));
  assert.throws(() => createReflectionSpecialFixture(
    [source, target],
    new Array(33).fill(null).map(() => projectile()),
  ));
  assert.throws(() => createReflectionSpecialFixture(
    [source, target], [projectile(), projectile()],
  ), /unique/u);
  assert.throws(() => createReflectionSpecialFixture(
    [source, target], [{ ...projectile(), damage: Number.MAX_SAFE_INTEGER + 1 }],
  ));
});

test("reflection special: malformed ownership, endpoints, commands, and extras reject", () => {
  const entities = [entity(101, -4000, 0, 1), entity(301, 4000, 0, 2)];
  for (const projectiles of [
    [{ ...projectile(), ownerId: 2 }],
    [{ ...projectile(), sourceId: 999 }],
    [{ ...projectile(), targetId: 101 }],
    [{ ...projectile(), speed: 0 }],
    [{ ...projectile(), extra: true }],
  ]) assert.throws(() => createReflectionSpecialFixture(entities, projectiles));
  for (const commands of [
    [{ targetId: 999, tick: 1, type: "kill-entity" }],
    [{ targetId: 101, tick: -1, type: "kill-entity" }],
    [{ targetId: 101, tick: 1, type: "other" }],
    [{ targetId: 101, tick: 1, type: "kill-entity", extra: true }],
    [
      { targetId: 101, tick: 1, type: "kill-entity" },
      { targetId: 101, tick: 1, type: "kill-entity" },
    ],
  ]) assert.throws(() =>
    createReflectionSpecialFixture(entities, [projectile()], commands));
  assert.throws(() =>
    createReflectionSpecialFixture(entities, [projectile()], [], "extra"),
  /extra arguments/u);
});

test("reflection special: invalid operations reject atomically", () => {
  const encounter = new ReflectionEncounter();
  const before = {
    replay: encounter.replay,
    snapshot: encounter.serialize(),
    state: encounter.state,
  };
  for (const operation of [
    () => encounter.stepMany(-1),
    () => encounter.stepMany(129),
    () => encounter.run(129),
  ]) {
    assert.throws(operation);
    assert.deepEqual({
      replay: encounter.replay,
      snapshot: encounter.serialize(),
      state: encounter.state,
    }, before);
  }
});

test("reflection special: all eight signed 5-12-13 nonintegral tick paths reject at setup", () => {
  const directions = [
    { x: 5, y: 12 }, { x: 5, y: -12 },
    { x: -5, y: 12 }, { x: -5, y: -12 },
    { x: 12, y: 5 }, { x: 12, y: -5 },
    { x: -12, y: 5 }, { x: -12, y: -5 },
  ];
  let rejected = 0;
  for (const direction of directions) {
    const entities = [
      entity(101, 0, 0, 1),
      entity(201, direction.x * 200, direction.y * 200, 2, {
        reflector: true,
      }),
      entity(301, direction.x * 1000, direction.y * 1000, 2),
    ];
    const commands = [{
      targetId: 101,
      tick: 1,
      type: "kill-entity",
    }];
    assert.throws(
      () => createReflectionSpecialFixture(
        entities, [projectile(101, 301)], commands,
      ),
      /original path must remain on integer coordinates/u,
    );
    assert.throws(
      () => new ReflectionEncounter({ commands, entities, projectiles: [
        projectile(101, 301),
      ] }),
      /original path must remain on integer coordinates/u,
    );
    rejected += 1;
  }
  assert.equal(rejected, 8);
});

test("reflection special: irrational and possible reflected legs reject at setup", () => {
  const irrational = [
    entity(101, 0, 0, 1),
    entity(301, 5000, 5000, 2),
  ];
  assert.throws(
    () => createReflectionSpecialFixture(irrational, [projectile()]),
    /original path must have an exact integer magnitude/u,
  );

  const entities = [
    entity(101, 0, 0, 1),
    entity(201, 1104, 47, 2, { reflector: true }),
    entity(301, 4000, 0, 2),
  ];
  assert.throws(
    () => createReflectionSpecialFixture(entities, [projectile()]),
    /reflected path via entity 201 must remain on integer coordinates/u,
  );
  const ineligible = entities.map((entry) =>
    entry.id === 201 ? { ...entry, reflector: false } : entry);
  assert.doesNotThrow(() =>
    createReflectionSpecialFixture(ineligible, [projectile()]));
});

test("reflection special: path rejection precedes source target and reflector death commands", () => {
  const entities = [
    entity(101, 0, 0, 1),
    entity(201, 1104, 47, 2, { reflector: true }),
    entity(301, 4000, 0, 2),
  ];
  for (const targetId of [101, 201, 301]) {
    const commands = [{ targetId, tick: 2, type: "kill-entity" }];
    assert.throws(
      () => createReflectionSpecialFixture(
        entities, [projectile()], commands,
      ),
      /reflected path via entity 201 must remain on integer coordinates/u,
    );
    assert.throws(
      () => new ReflectionEncounter({
        commands,
        entities,
        projectiles: [projectile()],
      }),
      /reflected path via entity 201 must remain on integer coordinates/u,
    );
  }
});

test("reflection special: same-boundary deaths and near-limit stepMany failure are atomic", () => {
  const identity = setup({
    entities: [
      entity(101, -100000, 0, 1),
      entity(201, 0, 0, 2, { reflector: true }),
      entity(301, 100000, 0, 2),
    ],
    commands: [
      { targetId: 101, tick: 128, type: "kill-entity" },
      { targetId: 201, tick: 128, type: "kill-entity" },
      { targetId: 301, tick: 128, type: "kill-entity" },
    ],
    projectiles: [projectile(101, 301, { speed: 1 })],
  });
  const encounter = new ReflectionEncounter(identity);
  encounter.stepMany(127);
  const before = {
    replay: encounter.replay,
    snapshot: encounter.serialize(),
    state: encounter.state,
  };
  assert.throws(() => encounter.stepMany(2), /exceeds its bound/u);
  assert.deepEqual({
    replay: encounter.replay,
    snapshot: encounter.serialize(),
    state: encounter.state,
  }, before);

  const restored = ReflectionEncounter.restore(before.snapshot);
  assert.throws(() => restored.stepMany(2), /exceeds its bound/u);
  assert.deepEqual({
    replay: restored.replay,
    snapshot: restored.serialize(),
    state: restored.state,
  }, before);

  encounter.step();
  const atLimit = {
    replay: encounter.replay,
    snapshot: encounter.serialize(),
    state: encounter.state,
  };
  assert.deepEqual(
    atLimit.state.entities.map(({ hitpoints }) => hitpoints),
    [0, 0, 0],
  );
  assert.throws(() => encounter.step(), /tick space is exhausted/u);
  assert.deepEqual({
    replay: encounter.replay,
    snapshot: encounter.serialize(),
    state: encounter.state,
  }, atLimit);
});

test("reflection special: snapshots are canonical, bounded, and strict", () => {
  const encounter = new ReflectionEncounter();
  encounter.stepMany(4);
  const canonical = encounter.serialize();
  assert.equal(ReflectionEncounter.restore(canonical).serialize(), canonical);
  const raw = JSON.parse(canonical);
  for (const serialized of [
    "no", "{}", JSON.stringify({ ...raw, version: 2 }),
    JSON.stringify({ ...raw, tick: -1 }),
    JSON.stringify({ ...raw, tick: 129 }),
    JSON.stringify({ ...raw, extra: true }),
    JSON.stringify({ tick: raw.tick, version: 1, identity: raw.identity }),
    " ".repeat(131_073),
  ]) assert.throws(() => ReflectionEncounter.restore(serialized));
  assert.throws(() => ReflectionEncounter.restore({}), /must be a string/u);
});

test("reflection special: shipped source has original identity and explicit nonclaims", () => {
  const source = readFileSync(new URL(
    "../src/content/cards/special-projectiles-reflection.js", import.meta.url,
  ), "utf8");
  const protectedTokens = new Set(benchmark.cards.flatMap(({ key, name }) => [
    key.toLowerCase(), name.toLowerCase(),
  ]));
  assert.deepEqual(protectedIdentityHits(source, protectedTokens), []);
  assert.doesNotMatch(source, /readFile|cards\.json/u);
  for (const nonClaim of [
    "not an authoritative", "eligibility", "radius", "timing", "ownership",
    "target", "speed", "damage", "loop", "lifecycle", "event-order", "source",
    "death", "moving-target", "projectile-height", "animation", "visual",
    "audio", "full-match",
  ]) assert.match(source, new RegExp(nonClaim, "u"));
});
