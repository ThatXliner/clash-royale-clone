import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BasicRangedDuel,
  createBasicMeleeCatalog,
  createBasicRangedCatalog,
  createBasicRangedCombatant,
} from "../src/content/index.js";
import { protectedIdentityHits } from "./helpers/protected-identity-scan.js";
import { createReferenceParityEvaluator } from "./helpers/reference-parity.js";

const benchmark = JSON.parse(readFileSync(
  new URL("../reference/stats/cards.json", import.meta.url),
  "utf8",
));
const benchmarkCards = new Map(
  benchmark.cards.map((card) => [card.key, card]),
);

const EXPECTED = {
  brassbolt: "musketeer",
  reedsting: "dart-goblin",
};

const MECHANIC_FIELDS = [
  ["cost", "elixir_cost", (value) => value],
  ["kind", "type", (value) => value === "troop" ? "unit" : value],
  [
    "rarity",
    "rarity",
    (value) => ({
      common: "standard",
      rare: "uncommon",
    })[value],
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

function setup(leftCardId, rightCardId, reverse = false) {
  const combatants = [
    createBasicRangedCombatant(leftCardId, 101),
    createBasicRangedCombatant(rightCardId, 202),
  ];
  return {
    combatants: reverse ? combatants.reverse() : combatants,
  };
}

function run(leftCardId, rightCardId, reverse = false) {
  const duel = new BasicRangedDuel(
    setup(leftCardId, rightCardId, reverse),
  );
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

test("basic ranged content: catalog is exact, canonical, and isolated", () => {
  const first = createBasicRangedCatalog();
  assert.deepEqual(
    first.map(({ id, displayName }) => ({ id, displayName })),
    [
      { id: "brassbolt", displayName: "Brassbolt" },
      { id: "reedsting", displayName: "Reedsting" },
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

  first[0].damage = 1;
  first[0].components.push({});
  const second = createBasicRangedCatalog();
  assert.equal(second[0].damage, 218);
  assert.deepEqual(second[0].components, []);
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first[0], second[0]);

  assert.deepEqual(
    createBasicMeleeCatalog().map(({ id }) => id),
    ["coilblade", "ironroot", "mossguard"],
  );
});

test("basic ranged content: every mechanic is compared with trusted confidence", (context) => {
  const reports = createBasicRangedCatalog().map((runtimeCard) => {
    const benchmarkKey = EXPECTED[runtimeCard.id];
    assert.ok(benchmarkCards.has(benchmarkKey));
    return {
      identity: "original-runtime-identity",
      runtimeId: runtimeCard.id,
      ...evaluateReferenceParity(runtimeCard, benchmarkKey),
    };
  });

  assert.equal(reports.length, 2);
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

test("basic ranged content: confidence controls failure versus question", () => {
  const authoritative = createBasicRangedCatalog().find(
    ({ id }) => id === "brassbolt",
  );
  authoritative.cost += 1;
  const failed = evaluateReferenceParity(authoritative, EXPECTED.brassbolt);
  assert.equal(failed.authoritativeFailures.length, 1);
  assert.equal(failed.authoritativeFailures[0].runtimeField, "cost");

  const uncertain = createBasicRangedCatalog().find(
    ({ id }) => id === "reedsting",
  );
  uncertain.damage += 1;
  const questioned = evaluateReferenceParity(uncertain, EXPECTED.reedsting);
  assert.deepEqual(questioned.authoritativeFailures, []);
  assert.deepEqual(
    questioned.questions.filter(({ disposition }) => (
      disposition === "question"
    )).map(({ runtimeField }) => runtimeField),
    ["damage"],
  );
});

test("basic ranged content: shipped module contains only original identities", () => {
  const source = readFileSync(
    new URL("../src/content/cards/basic-ranged.js", import.meta.url),
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

test("basic ranged content: mirror cadence and draw ticks are derived", () => {
  const brass = run("brassbolt", "brassbolt");
  assert.deepEqual(attacks(brass.duel.replay, 101), [72, 132, 192, 252]);
  assert.deepEqual(attacks(brass.duel.replay, 202), [72, 132, 192, 252]);
  assert.deepEqual(brass.result.outcome, {
    deathTick: 252,
    draw: true,
    winnerId: null,
  });

  const reed = run("reedsting", "reedsting");
  assert.deepEqual(attacks(reed.duel.replay, 101), [81, 123]);
  assert.deepEqual(attacks(reed.duel.replay, 202), [81, 123]);
  assert.deepEqual(reed.result.outcome, {
    deathTick: 123,
    draw: true,
    winnerId: null,
  });
});

test("basic ranged content: cross duel is derived from runtime definitions", () => {
  const { duel, result } = run("brassbolt", "reedsting");
  assert.deepEqual(attacks(duel.replay, 101), [72, 132]);
  assert.deepEqual(attacks(duel.replay, 202), [81, 123]);
  assert.deepEqual(result.outcome, {
    deathTick: 132,
    draw: false,
    winnerId: 101,
  });
  assert.deepEqual(
    result.state.combatants.map(({ hitpoints, id }) => ({ hitpoints, id })),
    [
      { hitpoints: 458, id: 101 },
      { hitpoints: 0, id: 202 },
    ],
  );
});

test("basic ranged content: fresh, chunked, reversed, and restored runs are byte deterministic", () => {
  const fresh = run("brassbolt", "reedsting");
  const again = run("brassbolt", "reedsting");
  const reversed = run("brassbolt", "reedsting", true);
  assert.deepEqual(again.result, fresh.result);
  assert.deepEqual(again.duel.replay, fresh.duel.replay);
  assert.equal(again.duel.serialize(), fresh.duel.serialize());
  assert.deepEqual(reversed.result, fresh.result);
  assert.deepEqual(reversed.duel.replay, fresh.duel.replay);
  assert.equal(reversed.duel.serialize(), fresh.duel.serialize());

  const chunked = new BasicRangedDuel(setup("brassbolt", "reedsting"));
  for (const count of [1, 17, 38, 44]) chunked.stepMany(count);
  const uninterrupted = new BasicRangedDuel(
    setup("brassbolt", "reedsting"),
  );
  uninterrupted.stepMany(100);
  assert.equal(chunked.serialize(), uninterrupted.serialize());
  assert.deepEqual(chunked.state, uninterrupted.state);
  assert.deepEqual(chunked.replay, uninterrupted.replay);

  const restored = BasicRangedDuel.restore(chunked.serialize());
  assert.equal(restored.serialize(), chunked.serialize());
  assert.deepEqual(restored.state, chunked.state);
  assert.deepEqual(restored.replay, chunked.replay);
  assert.deepEqual(restored.run(1000), chunked.run(1000));
  assert.equal(restored.serialize(), chunked.serialize());
  assert.deepEqual(restored.replay, chunked.replay);
});

test("basic ranged content: duel geometry is explicit and immediate-impact only", () => {
  const duel = new BasicRangedDuel(setup("brassbolt", "reedsting"));
  duel.stepMany(73);
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
      impactTick: 72,
      launchTick: 72,
      origin: { x: 0, y: 0 },
      radius: 0,
      speed: 1,
      targetPosition: { x: 0, y: 0 },
    },
  );
});

test("basic ranged content: projection, setup, and snapshot reject malformed inputs", () => {
  assert.throws(() => createBasicRangedCombatant("unknown", 1));
  for (const entityId of [0, -1, 1.5, "1"]) {
    assert.throws(() => createBasicRangedCombatant("brassbolt", entityId));
  }
  const valid = setup("brassbolt", "reedsting");
  assert.throws(() => new BasicRangedDuel({ combatants: [
    valid.combatants[0],
    valid.combatants[0],
  ] }));
  assert.throws(() => new BasicRangedDuel({
    combatants: valid.combatants,
    extra: true,
  }));
  const forgedSetupDamage = clone(valid);
  forgedSetupDamage.combatants[0].damage += 1;
  assert.throws(
    () => new BasicRangedDuel(forgedSetupDamage),
    /runtime card definition/u,
  );
  assert.throws(() => BasicRangedDuel.restore("not json"));
  assert.throws(() => BasicRangedDuel.restore(JSON.stringify({
    setup: valid,
    tick: 0,
    version: 2,
  })));

  const duel = new BasicRangedDuel(valid);
  duel.stepMany(10);
  const snapshot = JSON.parse(duel.serialize());
  snapshot.tick = Number.MAX_SAFE_INTEGER;
  assert.throws(
    () => BasicRangedDuel.restore(JSON.stringify(snapshot)),
    /tick exceeds its derived duel limit/u,
  );
  const forgedCadence = JSON.parse(duel.serialize());
  forgedCadence.nextAttacks[0].tick += 1;
  assert.throws(
    () => BasicRangedDuel.restore(JSON.stringify(forgedCadence)),
    /cadence is incoherent/u,
  );
});

test("basic ranged content: snapshot ceilings are derived for every ordered pairing", () => {
  const expected = new Map([
    ["brassbolt/brassbolt", { history: 261, tick: 253 }],
    ["brassbolt/reedsting", { history: 137, tick: 133 }],
    ["reedsting/brassbolt", { history: 137, tick: 133 }],
    ["reedsting/reedsting", { history: 128, tick: 124 }],
  ]);

  for (const [pair, limit] of expected) {
    const [left, right] = pair.split("/");
    for (const reverse of [false, true]) {
      const duel = new BasicRangedDuel(setup(left, right, reverse));
      duel.run(1000);
      const serialized = duel.serialize();
      const snapshot = JSON.parse(serialized);
      assert.deepEqual(
        {
          history: snapshot.combat.history.length,
          tick: snapshot.tick,
        },
        limit,
        `${pair}, reverse=${reverse}`,
      );
      assert.equal(
        BasicRangedDuel.restore(serialized).serialize(),
        serialized,
        `canonical terminal snapshot rejected at its limit: ${pair}`,
      );
      const oneOver = clone(snapshot);
      oneOver.combat.history.push(null);
      assert.throws(
        () => BasicRangedDuel.restore(JSON.stringify(oneOver)),
        /combat history exceeds its derived duel limit/u,
        `one-over history accepted: ${pair}`,
      );
    }
  }
});

test("basic ranged content: oversized histories reject before entry inspection", () => {
  const terminal = new BasicRangedDuel(setup("brassbolt", "brassbolt"));
  terminal.run(1000);
  const canonical = JSON.parse(terminal.serialize());
  assert.equal(canonical.combat.history.length, 261);

  for (const length of [262, 1_000_000]) {
    const hostile = clone(canonical);
    hostile.combat.history = Array(length).fill(null);
    const serialized = JSON.stringify(hostile);
    const originalDescriptors = Object.getOwnPropertyDescriptors;
    let historyDescriptorScans = 0;
    Object.getOwnPropertyDescriptors = function countedDescriptors(value) {
      if (Array.isArray(value) && value.length === length) {
        historyDescriptorScans += 1;
      }
      return originalDescriptors(value);
    };
    try {
      assert.throws(
        () => BasicRangedDuel.restore(serialized),
        /combat history exceeds its derived duel limit/u,
        `history length ${length} reached entry validation`,
      );
    } finally {
      Object.getOwnPropertyDescriptors = originalDescriptors;
    }
    assert.equal(
      historyDescriptorScans,
      0,
      `history length ${length} reached descriptor traversal`,
    );
  }

  let getterReads = 0;
  const sparseHistory = [];
  sparseHistory.length = 1_000_000;
  Object.defineProperty(sparseHistory, 0, {
    get() {
      getterReads += 1;
      return null;
    },
  });
  const nonStringSnapshot = {
    get combat() {
      getterReads += 1;
      return { history: sparseHistory };
    },
  };
  assert.throws(
    () => BasicRangedDuel.restore(nonStringSnapshot),
    /must be a string/u,
  );
  assert.equal(getterReads, 0);
});

test("basic ranged content: snapshot ticks reject one boundary beyond each duel", () => {
  for (const [left, right] of [
    ["brassbolt", "brassbolt"],
    ["brassbolt", "reedsting"],
    ["reedsting", "brassbolt"],
    ["reedsting", "reedsting"],
  ]) {
    const duel = new BasicRangedDuel(setup(left, right));
    duel.run(1000);
    const snapshot = JSON.parse(duel.serialize());
    snapshot.tick += 1;
    assert.throws(
      () => BasicRangedDuel.restore(JSON.stringify(snapshot)),
      /tick exceeds its derived duel limit/u,
      `${left}/${right}`,
    );
  }
});

test("basic ranged content: snapshots are canonical causal histories", () => {
  for (const tick of [0, 73, 100, 133]) {
    const duel = new BasicRangedDuel(setup("brassbolt", "reedsting"));
    if (tick === 133) duel.run(1000);
    else duel.stepMany(tick);
    const serialized = duel.serialize();
    const snapshot = JSON.parse(serialized);

    assert.equal(BasicRangedDuel.restore(serialized).serialize(), serialized);
    for (const path of leafPaths(snapshot)) {
      assert.throws(
        () => BasicRangedDuel.restore(JSON.stringify(mutateLeaf(snapshot, path))),
        undefined,
        `accepted one-field mutation at tick ${tick}: ${path.join(".")}`,
      );
    }

    for (const field of Object.keys(snapshot)) {
      const missing = clone(snapshot);
      delete missing[field];
      assert.throws(() => BasicRangedDuel.restore(JSON.stringify(missing)));
    }
    const extra = clone(snapshot);
    extra.extra = true;
    assert.throws(() => BasicRangedDuel.restore(JSON.stringify(extra)));
  }
});

test("basic ranged content: reordered, duplicate, future, and post-terminal histories reject atomically", () => {
  const duel = new BasicRangedDuel(setup("brassbolt", "reedsting"));
  duel.stepMany(100);
  const snapshot = JSON.parse(duel.serialize());

  const reordered = clone(snapshot);
  reordered.combat.history.reverse();
  assert.throws(() => BasicRangedDuel.restore(JSON.stringify(reordered)));

  const duplicate = clone(snapshot);
  duplicate.combat.history.splice(1, 0, clone(duplicate.combat.history[0]));
  assert.throws(() => BasicRangedDuel.restore(JSON.stringify(duplicate)));

  const missing = clone(snapshot);
  missing.combat.history.pop();
  assert.throws(() => BasicRangedDuel.restore(JSON.stringify(missing)));

  const future = clone(snapshot);
  future.tick += 1;
  assert.throws(() => BasicRangedDuel.restore(JSON.stringify(future)));

  const terminal = new BasicRangedDuel(setup("brassbolt", "reedsting"));
  terminal.run(1000);
  assert.deepEqual(BasicRangedDuel.restore(terminal.serialize()).state, terminal.state);
  assert.throws(() => terminal.step(), /after its outcome/u);

  const postTerminal = JSON.parse(terminal.serialize());
  postTerminal.tick += 1;
  postTerminal.combat.history.push({ tick: postTerminal.tick - 1, type: "step" });
  assert.throws(
    () => BasicRangedDuel.restore(JSON.stringify(postTerminal)),
    /tick exceeds its derived duel limit/u,
  );
});
