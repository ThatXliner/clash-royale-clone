import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DeathEffectsEncounter,
  createDeathEffectsCatalog,
  createDeathEffectsFixture,
  createDeathEffectsQuestions,
} from "../src/content/index.js";

const DAMAGE = 200n;
const RADIUS = 2000n;

function entity(id, overrides = {}) {
  return {
    alive: true,
    deathEffect: false,
    id,
    kind: "troop",
    layer: "ground",
    maxHealth: 1000,
    owner: "north",
    position: { x: 0, y: 0 },
    radius: 0,
    targetable: true,
    ...overrides,
  };
}

function command(targetId, amount, tick = 0, overrides = {}) {
  return {
    amount,
    cause: "combat-damage",
    sourceId: 999,
    targetId,
    tick,
    ...overrides,
  };
}

function setup(entities, commands) {
  return createDeathEffectsFixture(entities, commands);
}

function run(entities, commands) {
  const encounter = new DeathEffectsEncounter(setup(entities, commands));
  encounter.run();
  return encounter;
}

function events(encounter, type) {
  return encounter.replay.filter((event) => event.type === type);
}

// Independent test-local oracle: it intentionally does not import spatial,
// damage, area-damage, or death-effect production helpers.
function oracleOverlap(source, target) {
  const dx = BigInt(source.position.x) - BigInt(target.position.x);
  const dy = BigInt(source.position.y) - BigInt(target.position.y);
  const reach = RADIUS + BigInt(source.radius) + BigInt(target.radius);
  return dx * dx + dy * dy <= reach * reach;
}

function oracleDamage(target) {
  return target.kind === "crown-tower" ? DAMAGE * 35n / 100n : DAMAGE;
}

function oracleQueue(inputEntities, initiallyDead) {
  const rows = new Map(inputEntities.map((value) => [
    value.id,
    { ...structuredClone(value), health: BigInt(value.maxHealth) },
  ]));
  const queue = [...initiallyDead].sort((a, b) => a - b);
  const triggered = [];
  const hits = [];
  for (const id of initiallyDead) rows.get(id).health = 0n;
  while (queue.length > 0) {
    const source = rows.get(queue.shift());
    if (triggered.includes(source.id) || !source.deathEffect) continue;
    triggered.push(source.id);
    const targets = [...rows.values()]
      .filter((target) =>
        target.health > 0n &&
        target.targetable &&
        target.owner !== source.owner &&
        target.layer === "ground" &&
        oracleOverlap(source, target)
      )
      .sort((left, right) => left.id - right.id);
    for (const target of targets) {
      const amount = oracleDamage(target);
      hits.push({ amount: Number(amount), sourceId: source.id, targetId: target.id });
      target.health = target.health > amount ? target.health - amount : 0n;
      if (target.health === 0n && target.deathEffect) queue.push(target.id);
    }
  }
  return {
    health: [...rows.values()].map(({ health, id }) => [id, Number(health)]),
    hits,
    triggered,
  };
}

test("death effects: original identity is shipped and benchmark identity stays test-only", () => {
  const card = createDeathEffectsCatalog().find(
    ({ id }) => id === "cinder-reliquary",
  );
  assert.equal(card.displayName, "Cinder Reliquary");
  const corpus = JSON.parse(readFileSync(
    new URL("../reference/stats/cards.json", import.meta.url),
    "utf8",
  ));
  const protectedBenchmark = corpus.cards.find(
    ({ name }) => name === "Giant Skeleton",
  );
  assert.ok(protectedBenchmark);
  assert.equal(Object.hasOwn(protectedBenchmark, "death_damage"), false);
  assert.equal(card.id === protectedBenchmark.key, false);
});

test("death effects: every absent value and policy is a fresh recursively frozen QUESTION", () => {
  const first = createDeathEffectsQuestions();
  const second = createDeathEffectsQuestions();
  const keys = [
    "trigger",
    "radius",
    "damage",
    "eligibility",
    "cause",
    "sameTickOrder",
    "chain",
    "selfSourceInclusion",
    "towerModifier",
    "recursion",
    "cap",
  ];
  assert.deepEqual(Object.keys(first), keys);
  assert.notEqual(first, second);
  for (const key of keys) {
    assert.notEqual(first[key], second[key]);
    assert.equal(first[key].authoritative, false);
    assert.equal(first[key].confidence, "unverified");
    assert.equal(first[key].disposition, "question");
    assert.equal(first[key].key, key);
    assert.deepEqual(first[key].provenance, {
      accessed: "2026-07-30",
      document: "SOURCES.md",
      location: "Known limitations",
      statement:
        "Card abilities, including death damage and crown-tower damage multipliers, are outside the common schema.",
    });
    assert.equal(Object.isFrozen(first[key]), true);
    assert.equal(Object.isFrozen(first[key].provenance), true);
    if (typeof first[key].value === "object") {
      assert.equal(Object.isFrozen(first[key].value), true);
    }
  }
  assert.equal(
    first.cause.value,
    "the FIFO request supplying the final positive applied damage owns the death; zero and post-lethal overkill requests do not contribute; only combat-damage deaths trigger",
  );
  assert.throws(() => createDeathEffectsQuestions(1), /do not accept overrides/u);
});

test("death effects: lethal combat damage triggers exactly once in stable event order", () => {
  const source = entity(10, {
    deathEffect: true,
    kind: "structure",
    maxHealth: 100,
    owner: "south",
  });
  const target = entity(20, { maxHealth: 500, position: { x: 2000, y: 0 } });
  const encounter = run(
    [target, source],
    [command(10, 60), command(10, 40), command(10, 999, 1)],
  );
  assert.deepEqual(encounter.replay.map(({ type }) => type), [
    "damage-requested",
    "damage-requested",
    "damage-applied",
    "death",
    "death-triggered",
    "damage-requested",
    "damage-applied",
  ]);
  assert.deepEqual(events(encounter, "death-triggered"), [{
    queueIndex: 1,
    sourceId: 10,
    tick: 0,
    type: "death-triggered",
  }]);
  assert.equal(encounter.state.entities.find(({ id }) => id === 20).hitpoints, 300);
});

test("death effects: inclusive radius, ±1, axes, and signed diagonals match BigInt oracle", () => {
  const source = entity(1, {
    deathEffect: true,
    maxHealth: 1,
    owner: "south",
  });
  const positions = [
    [2, 2000, 0],
    [3, -2000, 0],
    [4, 0, 2000],
    [5, 0, -2000],
    [6, 1200, 1600],
    [7, -1200, -1600],
    [8, 2001, 0],
    [9, -2001, 0],
    [10, 1201, 1600],
    [11, -1201, -1600],
  ];
  const targets = positions.map(([id, x, y]) =>
    entity(id, { position: { x, y } })
  );
  const encounter = run([source, ...targets], [command(1, 1)]);
  const actual = events(encounter, "damage-requested")
    .filter(({ origin }) => origin === "death-effect")
    .map(({ targetId }) => targetId);
  const expected = targets.filter((target) => oracleOverlap(source, target))
    .map(({ id }) => id);
  assert.deepEqual(actual, expected);
  assert.deepEqual(actual, [2, 3, 4, 5, 6, 7]);
});

test("death effects: circle radii are inclusive and evaluated without Number squares", () => {
  const edge = Number.MAX_SAFE_INTEGER - 10_000;
  const source = entity(1, {
    deathEffect: true,
    maxHealth: 1,
    owner: "south",
    position: { x: edge, y: -edge },
    radius: 500,
  });
  const hit = entity(2, {
    position: { x: edge - 2500, y: -edge },
  });
  const miss = entity(3, {
    position: { x: edge - 2501, y: -edge },
  });
  const encounter = run([source, hit, miss], [command(1, 1)]);
  assert.deepEqual(
    events(encounter, "damage-requested")
      .filter(({ origin }) => origin === "death-effect")
      .map(({ targetId }) => targetId),
    [2],
  );
});

test("death effects: owner, layer, kind, life, and targetable filters are explicit", () => {
  const source = entity(1, {
    deathEffect: true,
    maxHealth: 1,
    owner: "south",
  });
  const candidates = [
    entity(2, { kind: "troop" }),
    entity(3, { kind: "structure" }),
    entity(4, { kind: "crown-tower" }),
    entity(5, { layer: "air" }),
    entity(6, { owner: "south" }),
    entity(7, { targetable: false }),
    entity(8, { alive: false }),
  ];
  const encounter = run([source, ...candidates], [command(1, 1)]);
  assert.deepEqual(
    events(encounter, "damage-requested")
      .filter(({ origin }) => origin === "death-effect")
      .map(({ targetId }) => targetId),
    [2, 3, 4],
  );
});

test("death effects: expiry death does not trigger and source/self are never included", () => {
  const source = entity(1, {
    deathEffect: true,
    maxHealth: 1,
    owner: "south",
  });
  const friend = entity(2, { owner: "south" });
  const enemy = entity(3);
  const encounter = run(
    [source, friend, enemy],
    [command(1, 0, 0, { cause: "expiry" })],
  );
  assert.deepEqual(events(encounter, "death-triggered"), []);
  assert.equal(encounter.state.entities.find(({ id }) => id === 1).hitpoints, 0);
  assert.equal(encounter.state.entities.find(({ id }) => id === 2).hitpoints, 1000);
  assert.equal(encounter.state.entities.find(({ id }) => id === 3).hitpoints, 1000);
});

test("death effects: zero combat cannot steal lethal expiry attribution in either order", () => {
  const source = entity(1, {
    deathEffect: true,
    maxHealth: 100,
    owner: "south",
  });
  const target = entity(2);
  const orders = [
    [
      command(1, 0, 0, { cause: "combat-damage", sourceId: 2 }),
      command(1, 0, 0, { cause: "expiry", sourceId: null }),
    ],
    [
      command(1, 0, 0, { cause: "expiry", sourceId: null }),
      command(1, 0, 0, { cause: "combat-damage", sourceId: 2 }),
    ],
  ];
  for (const commands of orders) {
    const encounter = run([source, target], commands);
    assert.deepEqual(
      events(encounter, "damage-requested").map(
        ({ amount, cause, sourceId }) => ({ amount, cause, sourceId }),
      ),
      commands.map(({ amount, cause, sourceId }) => ({
        amount: cause === "expiry" ? 100 : amount,
        cause,
        sourceId,
      })),
    );
    assert.deepEqual(events(encounter, "damage-applied"), [{
      applied: 100,
      cause: "expiry",
      healthAfter: 0,
      healthBefore: 100,
      origin: "command",
      requested: "100",
      targetId: 1,
      tick: 0,
      triggerId: null,
      type: "damage-applied",
    }]);
    assert.deepEqual(events(encounter, "death"), [{
      cause: "expiry",
      targetId: 1,
      tick: 0,
      triggerId: null,
      type: "death",
    }]);
    assert.deepEqual(events(encounter, "death-triggered"), []);
    assert.equal(encounter.state.entities.find(({ id }) => id === 2).hitpoints, 1000);
  }
});

test("death effects: final positive FIFO contributor owns mixed-cause death", () => {
  const source = entity(1, {
    deathEffect: true,
    maxHealth: 100,
    owner: "south",
  });
  const target = entity(2);

  const nonlethalCombatThenExpiry = run(
    [source, target],
    [
      command(1, 40, 0, { cause: "combat-damage", sourceId: 2 }),
      command(1, 0, 0, { cause: "expiry", sourceId: null }),
    ],
  );
  assert.equal(events(nonlethalCombatThenExpiry, "damage-applied")[0].cause, "expiry");
  assert.equal(events(nonlethalCombatThenExpiry, "death")[0].cause, "expiry");
  assert.deepEqual(events(nonlethalCombatThenExpiry, "death-triggered"), []);

  const lethalCombatThenExpiryOverkill = run(
    [source, target],
    [
      command(1, 100, 0, { cause: "combat-damage", sourceId: 2 }),
      command(1, 0, 0, { cause: "expiry", sourceId: null }),
    ],
  );
  assert.equal(
    events(lethalCombatThenExpiryOverkill, "damage-applied")[0].cause,
    "combat-damage",
  );
  assert.equal(
    events(lethalCombatThenExpiryOverkill, "death")[0].cause,
    "combat-damage",
  );
  assert.deepEqual(
    events(lethalCombatThenExpiryOverkill, "death-triggered")
      .map(({ sourceId }) => sourceId),
    [1],
  );
  assert.equal(
    lethalCombatThenExpiryOverkill.state.entities.find(({ id }) => id === 2)
      .hitpoints,
    800,
  );
});

test("death effects: competing positive lethal causes obey FIFO in both orders", () => {
  const source = entity(1, {
    deathEffect: true,
    maxHealth: 100,
    owner: "south",
  });
  const target = entity(2);
  const combat = command(1, 100, 0, {
    cause: "combat-damage",
    sourceId: 2,
  });
  const expiry = command(1, 0, 0, { cause: "expiry", sourceId: null });
  const cases = [
    {
      commands: [combat, expiry],
      cause: "combat-damage",
      triggered: [1],
      targetHealth: 800,
    },
    {
      commands: [expiry, combat],
      cause: "expiry",
      triggered: [],
      targetHealth: 1000,
    },
  ];
  for (const expected of cases) {
    const encounter = run([source, target], expected.commands);
    assert.equal(events(encounter, "damage-applied")[0].cause, expected.cause);
    assert.equal(events(encounter, "death")[0].cause, expected.cause);
    assert.deepEqual(
      events(encounter, "death-triggered").map(({ sourceId }) => sourceId),
      expected.triggered,
    );
    assert.equal(
      encounter.state.entities.find(({ id }) => id === 2).hitpoints,
      expected.targetHealth,
    );
  }
});

test("death effects: already-dead and post-lethal requests contribute no cause", () => {
  const source = entity(1, {
    deathEffect: true,
    maxHealth: 100,
    owner: "south",
  });
  const target = entity(2);
  const encounter = run(
    [source, target],
    [
      command(1, 100, 0, { cause: "combat-damage", sourceId: 2 }),
      command(1, 0, 0, { cause: "expiry", sourceId: null }),
      command(1, 0, 1, { cause: "combat-damage", sourceId: 2 }),
      command(1, 0, 1, { cause: "expiry", sourceId: null }),
    ],
  );
  assert.deepEqual(
    events(encounter, "damage-requested")
      .filter(({ origin }) => origin === "command")
      .map(({ amount, cause }) => ({ amount, cause })),
    [
      { amount: 100, cause: "combat-damage" },
      { amount: 100, cause: "expiry" },
    ],
  );
  assert.deepEqual(
    events(encounter, "damage-applied")
      .filter(({ origin }) => origin === "command")
      .map(({ applied, cause, requested }) => ({ applied, cause, requested })),
    [{ applied: 100, cause: "combat-damage", requested: "200" }],
  );
  assert.deepEqual(
    events(encounter, "death").map(({ cause }) => cause),
    ["combat-damage"],
  );
});

test("death effects: simultaneous deaths queue by id and chained deaths append FIFO", () => {
  const rows = [
    entity(20, {
      deathEffect: true,
      maxHealth: 1,
      owner: "south",
      position: { x: 0, y: 0 },
    }),
    entity(10, {
      deathEffect: true,
      maxHealth: 1,
      owner: "south",
      position: { x: 5000, y: 0 },
    }),
    entity(30, {
      deathEffect: true,
      maxHealth: 200,
      owner: "north",
      position: { x: 1000, y: 0 },
    }),
    entity(40, {
      maxHealth: 500,
      owner: "south",
      position: { x: 1000, y: 1000 },
    }),
  ];
  const encounter = run(rows, [command(20, 1), command(10, 1)]);
  assert.deepEqual(
    events(encounter, "death-triggered").map(({ sourceId }) => sourceId),
    [10, 20, 30],
  );
  const oracle = oracleQueue(rows, [10, 20]);
  assert.deepEqual(encounter.state.triggeredIds, oracle.triggered);
  assert.deepEqual(
    encounter.state.entities.map(({ hitpoints, id }) => [id, hitpoints]),
    oracle.health.sort(([left], [right]) => left - right),
  );
});

test("death effects: recursion is duplicate-free even when multiple triggers kill one source", () => {
  const rows = [
    entity(1, { deathEffect: true, maxHealth: 1, owner: "south" }),
    entity(2, { deathEffect: true, maxHealth: 1, owner: "south" }),
    entity(3, { deathEffect: true, maxHealth: 300, owner: "north" }),
  ];
  const encounter = run(rows, [command(1, 1), command(2, 1)]);
  assert.deepEqual(
    events(encounter, "death-triggered").map(({ sourceId }) => sourceId),
    [1, 2, 3],
  );
  assert.equal(
    events(encounter, "death-triggered").filter(({ sourceId }) => sourceId === 3).length,
    1,
  );
});

test("death effects: crown-tower modifier is exact and ordinary targets take full damage", () => {
  const source = entity(1, {
    deathEffect: true,
    maxHealth: 1,
    owner: "south",
  });
  const troop = entity(2);
  const tower = entity(3, { kind: "crown-tower" });
  const encounter = run([source, troop, tower], [command(1, 1)]);
  const hits = events(encounter, "damage-requested")
    .filter(({ origin }) => origin === "death-effect")
    .map(({ amount, targetId }) => ({ amount, targetId }));
  assert.deepEqual(hits, [
    { amount: Number(oracleDamage(troop)), targetId: 2 },
    { amount: Number(oracleDamage(tower)), targetId: 3 },
  ]);
  assert.deepEqual(hits, [
    { amount: 200, targetId: 2 },
    { amount: 70, targetId: 3 },
  ]);
});

test("death effects: BigInt aggregation safely reports extreme overkill", () => {
  const source = entity(1, {
    deathEffect: true,
    maxHealth: 1,
    owner: "south",
  });
  const encounter = run(
    [source, entity(2)],
    [
      command(1, Number.MAX_SAFE_INTEGER),
      command(1, Number.MAX_SAFE_INTEGER, 0, { sourceId: 998 }),
    ],
  );
  const applied = events(encounter, "damage-applied")[0];
  assert.deepEqual(applied, {
    applied: 1,
    cause: "combat-damage",
    healthAfter: 0,
    healthBefore: 1,
    origin: "command",
    requested: (BigInt(Number.MAX_SAFE_INTEGER) * 2n).toString(),
    targetId: 1,
    tick: 0,
    triggerId: null,
    type: "damage-applied",
  });
});

test("death effects: causal attribution is byte-identical across chunk and restore cuts", () => {
  const fixture = setup(
    [
      entity(1, {
        deathEffect: true,
        maxHealth: 100,
        owner: "south",
      }),
      entity(2),
      entity(3, {
        deathEffect: true,
        maxHealth: 100,
        owner: "south",
        position: { x: 5000, y: 0 },
      }),
    ],
    [
      command(1, 0, 0, { cause: "combat-damage", sourceId: 2 }),
      command(1, 0, 0, { cause: "expiry", sourceId: null }),
      command(3, 40, 2, { cause: "combat-damage", sourceId: 2 }),
      command(3, 0, 2, { cause: "expiry", sourceId: null }),
    ],
  );
  const bytes = (encounter) => JSON.stringify({
    replay: encounter.replay,
    snapshot: encounter.serialize(),
    state: encounter.state,
  });
  const fresh = new DeathEffectsEncounter(fixture);
  fresh.run();
  const expected = bytes(fresh);
  assert.deepEqual(
    events(fresh, "death").map(({ cause, targetId }) => ({ cause, targetId })),
    [
      { cause: "expiry", targetId: 1 },
      { cause: "expiry", targetId: 3 },
    ],
  );

  const chunked = new DeathEffectsEncounter(fixture);
  chunked.stepMany(1);
  chunked.stepMany(2);
  chunked.run();
  assert.equal(bytes(chunked), expected);

  for (let cut = 0; cut <= fresh.state.tick; cut += 1) {
    const partial = new DeathEffectsEncounter(fixture);
    partial.stepMany(cut);
    const before = partial.serialize();
    assert.throws(() => DeathEffectsEncounter.restore(`${before} `));
    assert.equal(partial.serialize(), before);
    const restored = DeathEffectsEncounter.restore(before);
    restored.run();
    assert.equal(bytes(restored), expected, `attribution cut ${cut}`);
  }
});

test("death effects: constructor and outputs isolate all caller mutations", () => {
  const entities = [
    entity(1, { deathEffect: true, maxHealth: 1, owner: "south" }),
    entity(2),
  ];
  const commands = [command(1, 1)];
  const fixture = setup(entities, commands);
  const encounter = new DeathEffectsEncounter(fixture);
  fixture.entities[0].position.x = 9000;
  fixture.commands[0].amount = 0;
  entities[0].owner = "north";
  commands[0].amount = 0;
  const output = encounter.run();
  output[0].type = "corrupt";
  const state = encounter.state;
  state.entities[0].hitpoints = 999;
  assert.equal(encounter.replay[0].type, "damage-requested");
  assert.equal(encounter.state.entities[0].hitpoints, 0);
});

test("death effects: hostile objects, accessors, sparse, extra, duplicate, and unsafe inputs reject", () => {
  const validEntities = [entity(1), entity(2)];
  const validCommands = [command(1, 1)];
  const accessor = entity(1);
  Object.defineProperty(accessor, "id", {
    enumerable: true,
    get() {
      throw new Error("getter must not run");
    },
  });
  const sparse = new Array(1);
  const extraEntity = entity(1);
  extraEntity.extra = true;
  const extraCommand = { ...command(1, 1), extra: true };
  const hostile = Object.create({ inherited: true });
  Object.assign(hostile, entity(1));
  const cases = [
    () => setup([accessor], []),
    () => setup(sparse, []),
    () => setup([extraEntity], []),
    () => setup(validEntities, [extraCommand]),
    () => setup([entity(1), entity(1)], []),
    () => setup(validEntities, [command(1, 1), command(1, 1)]),
    () => setup([hostile], []),
    () => setup([entity(Number.MAX_SAFE_INTEGER + 1)], []),
    () => setup(validEntities, [command(1, Number.MAX_SAFE_INTEGER + 1)]),
    () => setup(validEntities, [command(99, 1)]),
  ];
  for (const invalid of cases) assert.throws(invalid);
  assert.doesNotThrow(() => setup(validEntities, validCommands));
});

test("death effects: oversized entities, commands, coordinates, ticks, and extras reject atomically", () => {
  const before = run(
    [entity(1, { maxHealth: 1 }), entity(2)],
    [command(1, 1)],
  ).serialize();
  const tooManyEntities = Array.from({ length: 65 }, (_, index) =>
    entity(index + 1)
  );
  const tooManyCommands = Array.from({ length: 65 }, () => command(1, 0));
  const invalid = [
    () => setup(tooManyEntities, []),
    () => setup([entity(1)], tooManyCommands),
    () => setup([entity(1, {
      position: { x: Number.MAX_SAFE_INTEGER + 1, y: 0 },
    })], []),
    () => setup([entity(1)], [command(1, 1, 1024)]),
    () => createDeathEffectsFixture([], [], "extra"),
  ];
  for (const operation of invalid) assert.throws(operation);
  const existing = new DeathEffectsEncounter(setup(
    [entity(1, { maxHealth: 1 }), entity(2)],
    [command(1, 1)],
  ));
  const existingBefore = existing.serialize();
  assert.throws(() => existing.stepMany(Number.MAX_SAFE_INTEGER));
  assert.equal(existing.serialize(), existingBefore);
  const after = run(
    [entity(1, { maxHealth: 1 }), entity(2)],
    [command(1, 1)],
  ).serialize();
  assert.equal(after, before);
});

test("death effects: canonical bounded snapshots reject hostile and non-causal state", () => {
  const encounter = run(
    [entity(1, { deathEffect: true, maxHealth: 1, owner: "south" }), entity(2)],
    [command(1, 1)],
  );
  const canonical = encounter.serialize();
  assert.equal(DeathEffectsEncounter.restore(canonical).serialize(), canonical);
  const raw = JSON.parse(canonical);
  const reordered = JSON.stringify({
    version: raw.version,
    tick: raw.tick,
    identity: raw.identity,
  });
  const cases = [
    reordered,
    canonical.replace('"version":1', '"version":1,"version":1'),
    JSON.stringify({ ...raw, extra: true }),
    JSON.stringify({ ...raw, version: 2 }),
    JSON.stringify({ ...raw, tick: -1 }),
    JSON.stringify({ ...raw, tick: 2 }),
    "{",
    "x".repeat(262145),
  ];
  for (const serialized of cases) {
    assert.throws(() => DeathEffectsEncounter.restore(serialized));
  }
  assert.throws(() => DeathEffectsEncounter.restore({}), /must be a string/u);
});

test("death effects: two fresh, chunked, and every-causal-cut runs are byte-identical", () => {
  const fixture = setup(
    [
      entity(1, {
        deathEffect: true,
        maxHealth: 1,
        owner: "south",
        position: { x: 0, y: 0 },
      }),
      entity(2, {
        deathEffect: true,
        maxHealth: 200,
        owner: "north",
        position: { x: 1000, y: 0 },
      }),
      entity(3, {
        maxHealth: 500,
        owner: "south",
        position: { x: 1500, y: 0 },
      }),
      entity(4, { maxHealth: 100, position: { x: 5000, y: 0 } }),
    ],
    [command(1, 1, 0), command(4, 30, 2), command(4, 70, 4)],
  );
  const freshA = new DeathEffectsEncounter(fixture);
  const freshB = new DeathEffectsEncounter(fixture);
  freshA.run();
  freshB.run();
  const bytes = (value) => JSON.stringify({
    replay: value.replay,
    snapshot: value.serialize(),
    state: value.state,
  });
  const expected = bytes(freshA);
  assert.equal(bytes(freshB), expected);

  const chunked = new DeathEffectsEncounter(fixture);
  for (const count of [1, 2, 1, 99]) chunked.stepMany(count);
  chunked.run();
  assert.equal(bytes(chunked), expected);

  for (let cut = 0; cut <= freshA.state.tick; cut += 1) {
    const partial = new DeathEffectsEncounter(fixture);
    partial.stepMany(cut);
    const restored = DeathEffectsEncounter.restore(partial.serialize());
    restored.run();
    assert.equal(bytes(restored), expected, `causal cut ${cut}`);
  }
});
