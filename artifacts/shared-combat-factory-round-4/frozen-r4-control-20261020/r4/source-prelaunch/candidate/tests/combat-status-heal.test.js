import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  InstantHealingEncounter,
  createHealCatalog,
  createHealFixture,
  createHealQuestionRecords,
} from "../src/content/index.js";
import { protectedIdentityHits } from "./helpers/protected-identity-scan.js";

const benchmark = JSON.parse(readFileSync(
  new URL("../reference/stats/cards.json", import.meta.url),
  "utf8",
));
const entity = (
  id,
  ownerId,
  kind,
  maxHealth,
  currentHealth = maxHealth,
) => ({ currentHealth, id, kind, maxHealth, ownerId });
const damage = (tick, targetId, amount) => ({
  amount,
  sourceId: null,
  targetId,
  tick,
  type: "damage",
});
const heal = (tick, sourceId, targetId, amount) => ({
  amount,
  sourceId,
  targetId,
  tick,
  type: "heal",
});
const encounter = (entities, commands) =>
  new InstantHealingEncounter(createHealFixture(entities, commands));

function scalarOracle(initialEntities, commands) {
  const entities = initialEntities.map((entry) => ({ ...entry }));
  const history = [];
  const lastTick = commands.at(-1)?.tick ?? -1;
  for (let tick = 0; tick <= lastTick; tick += 1) {
    const due = commands.filter((command) => command.tick === tick);
    const damages = due.filter((command) => command.type === "damage");
    const heals = due.filter((command) => command.type === "heal");
    const initialHealth = entities.map(({ currentHealth }) => currentHealth);
    const totals = entities.map(() => 0);
    for (const command of damages) {
      const index = entities.findIndex(({ id }) => id === command.targetId);
      if (index !== -1 && initialHealth[index] > 0) {
        totals[index] += command.amount;
      }
    }
    const cumulative = entities.map(() => 0);
    for (const command of damages) {
      const index = entities.findIndex(({ id }) => id === command.targetId);
      if (index === -1 || initialHealth[index] === 0) continue;
      const before = Math.max(0, initialHealth[index] - cumulative[index]);
      cumulative[index] += command.amount;
      history.push({
        amount: command.amount,
        currentHealthAfter: Math.max(0, initialHealth[index] - cumulative[index]),
        currentHealthBefore: before,
        targetId: command.targetId,
        tick,
        type: "damage",
      });
    }
    const deaths = [];
    for (let index = 0; index < entities.length; index += 1) {
      if (initialHealth[index] > 0 && totals[index] > 0) {
        entities[index].currentHealth =
          Math.max(0, initialHealth[index] - totals[index]);
        if (entities[index].currentHealth === 0) {
          deaths.push({ targetId: entities[index].id, tick, type: "death" });
        }
      }
    }
    history.push(...deaths.sort((left, right) => left.targetId - right.targetId));
    for (const command of heals) {
      const source = entities.find(({ id }) => id === command.sourceId);
      const target = entities.find(({ id }) => id === command.targetId);
      let status = "applied";
      if (source === undefined) status = "source-missing";
      else if (source.currentHealth === 0) status = "source-dead";
      else if (target === undefined) status = "target-missing";
      else if (target.currentHealth === 0) status = "target-dead";
      else if (source.ownerId !== target.ownerId) status = "enemy";
      else if (target.kind !== "troop") status = "target-ineligible";
      const before = target?.currentHealth ?? null;
      const applied = status === "applied"
        ? Math.min(command.amount, target.maxHealth - target.currentHealth)
        : 0;
      if (status === "applied") target.currentHealth += applied;
      history.push({
        applied,
        currentHealthAfter: target?.currentHealth ?? null,
        currentHealthBefore: before,
        requested: command.amount,
        sourceId: command.sourceId,
        status,
        targetId: command.targetId,
        tick,
        type: "heal",
      });
    }
  }
  return { entities, history, tick: Math.max(0, lastTick + 1) };
}

test("combat status heal: shipped identities are original and ordinary fields map test-only corpus rows", () => {
  const catalog = createHealCatalog();
  assert.deepEqual(catalog.map(({ id, displayName }) => ({ displayName, id })), [
    { displayName: "Bloom Wisp", id: "bloom-wisp" },
    { displayName: "Dawnmender", id: "dawnmender" },
  ]);
  const mappings = [
    [benchmark.cards.find(({ id }) => id === 28000016), catalog[0]],
    [benchmark.cards.find(({ id }) => id === 26000068), catalog[1]],
  ];
  for (const [comparison, card] of mappings) {
    assert.deepEqual({
      areaDamageRadiusMillitiles:
        comparison.area_damage_radius_tiles === null
          ? null
          : comparison.area_damage_radius_tiles * 1000,
      cost: comparison.elixir_cost,
      count: comparison.count,
      damage: comparison.damage,
      deployTimeTicks: comparison.deploy_time_seconds * 60,
      firstHitTicks: comparison.first_hit_seconds * 60,
      hitpoints: comparison.hitpoints,
      hitSpeedTicks: comparison.hit_speed_seconds * 60,
      kind: comparison.type === "troop" ? "unit" : comparison.type,
      movementMillitilesPerSecond:
        comparison.movement_speed_tiles_per_second * 1000,
      rangeMillitiles: comparison.range_tiles * 1000,
      sightRangeMillitiles: comparison.sight_range_tiles * 1000,
      targetMode: comparison.targets === "air_and_ground"
        ? "ground-and-air"
        : comparison.targets,
    }, {
      areaDamageRadiusMillitiles: card.areaDamageRadiusMillitiles,
      cost: card.cost,
      count: card.count,
      damage: card.damage,
      deployTimeTicks: card.deployTimeTicks,
      firstHitTicks: card.firstHitTicks,
      hitpoints: card.hitpoints,
      hitSpeedTicks: card.hitSpeedTicks,
      kind: card.kind,
      movementMillitilesPerSecond: card.movementMillitilesPerSecond,
      rangeMillitiles: card.rangeMillitiles,
      sightRangeMillitiles: card.sightRangeMillitiles,
      targetMode: card.targetMode,
    });
    assert.deepEqual(comparison.unverified_fields, [
      "hitpoints",
      "damage",
      "hit_speed_seconds",
      "first_hit_seconds",
      "deploy_time_seconds",
      "range_tiles",
      "sight_range_tiles",
      "movement_speed_tiles_per_second",
      "movement_speed",
      "targets",
      "count",
    ]);
  }
  catalog[0].hitpoints = 1;
  assert.equal(createHealCatalog()[0].hitpoints, 231);
  const source = readFileSync(
    new URL("../src/content/cards/combat-status-heal.js", import.meta.url),
    "utf8",
  );
  const protectedTokens = new Set(benchmark.cards.flatMap(({ key, name }) => [
    key.toLowerCase(),
    name.toLowerCase(),
  ]));
  assert.deepEqual(protectedIdentityHits(source, protectedTokens), []);
  assert.doesNotMatch(source, /readFile|cards\.json|reference\//u);
});

test("combat status heal: every healing value and policy is a fresh recursive frozen QUESTION", () => {
  const required = [
    "bloomWispCount",
    "bloomWispDamage",
    "bloomWispDeployTimeTicks",
    "bloomWispFirstHitTicks",
    "bloomWispHealAmount",
    "bloomWispHitSpeedTicks",
    "bloomWispHitpoints",
    "bloomWispMovementMillitilesPerSecond",
    "bloomWispMovementSpeedLabel",
    "bloomWispRangeMillitiles",
    "bloomWispSightRangeMillitiles",
    "bloomWispTargetMode",
    "bloomWispTrigger",
    "boundaryOrder",
    "conversionCoupling",
    "damageCoupling",
    "dawnmenderCount",
    "dawnmenderDamage",
    "dawnmenderDeployTimeTicks",
    "dawnmenderFirstHitTicks",
    "dawnmenderHealAmount",
    "dawnmenderHitSpeedTicks",
    "dawnmenderHitpoints",
    "dawnmenderMovementMillitilesPerSecond",
    "dawnmenderMovementSpeedLabel",
    "dawnmenderRangeMillitiles",
    "dawnmenderSightRangeMillitiles",
    "dawnmenderTargetMode",
    "dawnmenderTrigger",
    "deliveryRule",
    "duplicateHeals",
    "eligibleTargetClass",
    "enemyTarget",
    "invisibilityCoupling",
    "maximumHealthCap",
    "missingTarget",
    "noRevivalRule",
    "ownershipRule",
    "rageCoupling",
    "reflectionCoupling",
    "selfHealRule",
    "sourceAliveRule",
    "sourceDeathSameTick",
    "structureTarget",
    "targetDeathSameTick",
    "towerTarget",
    "zeroAmount",
  ];
  const first = createHealQuestionRecords();
  const second = createHealQuestionRecords();
  assert.deepEqual(Object.keys(first).sort(), required.sort());
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.keys(first).length, 47);
  const ordinary = new Set(required.filter((key) =>
    /^(?:bloomWisp|dawnmender)(?:Area|Count|Damage|Deploy|First|HitSpeed|Hitpoints|Movement|Range|Sight|TargetMode)/u
      .test(key)));
  for (const key of required) {
    assert.notStrictEqual(first[key], second[key]);
    assert.deepEqual({
      authoritative: first[key].authoritative,
      confidence: first[key].confidence,
      disposition: first[key].disposition,
      key: first[key].key,
      source: first[key].source,
    }, {
      authoritative: false,
      confidence: "unverified",
      disposition: "question",
      key,
      source: ordinary.has(key)
        ? "royaleapi-cr-api-data-54fdef5-character-and-troop-snapshot-unverified"
        : "unsourced-instant-healing-and-health-cap-composition",
    });
    assert.equal(Object.isFrozen(first[key]), true);
  }
  assert.throws(
    () => createHealQuestionRecords({ dawnmenderHealAmount: 1 }),
    /do not accept overrides/u,
  );
});

test("combat status heal: independent integer ledger matches cap, zero, duplicates, self-heal, and stable order", () => {
  const entities = [
    entity(1, 1, "troop", 100, 50),
    entity(2, 1, "troop", 100, 90),
    entity(3, 1, "troop", 100, 100),
  ];
  const commands = [
    heal(0, 1, 2, 5),
    heal(0, 1, 2, 20),
    heal(0, 1, 1, 30),
    heal(0, 1, 3, 9),
    heal(0, 1, 1, 0),
  ];
  const sim = encounter(entities, commands);
  sim.run();
  const oracle = scalarOracle(entities, commands);
  assert.deepEqual(sim.state.entities, oracle.entities);
  assert.deepEqual(sim.replay, oracle.history);
  assert.deepEqual(sim.replay.map(({ applied, currentHealthAfter, targetId }) => ({
    applied,
    currentHealthAfter,
    targetId,
  })), [
    { applied: 5, currentHealthAfter: 95, targetId: 2 },
    { applied: 5, currentHealthAfter: 100, targetId: 2 },
    { applied: 30, currentHealthAfter: 80, targetId: 1 },
    { applied: 0, currentHealthAfter: 100, targetId: 3 },
    { applied: 0, currentHealthAfter: 80, targetId: 1 },
  ]);
});

test("combat status heal: simultaneous damage and ascending deaths precede command-order heals", () => {
  const entities = [
    entity(1, 1, "troop", 30),
    entity(2, 1, "troop", 20),
    entity(7, 1, "troop", 100, 80),
    entity(9, 1, "troop", 20),
  ];
  const commands = [
    heal(0, 1, 7, 10),
    damage(0, 9, 20),
    damage(0, 2, 20),
    damage(0, 7, 30),
    heal(0, 1, 7, 25),
  ];
  const sim = encounter(entities, commands);
  sim.step();
  assert.deepEqual(sim.replay.map(({ type, targetId }) => [type, targetId]), [
    ["damage", 9],
    ["damage", 2],
    ["damage", 7],
    ["death", 2],
    ["death", 9],
    ["heal", 7],
    ["heal", 7],
  ]);
  assert.deepEqual(sim.replay.slice(-2).map(
    ({ applied, currentHealthAfter, currentHealthBefore }) => ({
      applied,
      currentHealthAfter,
      currentHealthBefore,
    }),
  ), [
    { applied: 10, currentHealthAfter: 60, currentHealthBefore: 50 },
    { applied: 25, currentHealthAfter: 85, currentHealthBefore: 60 },
  ]);
});

test("combat status heal: lethal damage blocks source and target while nonlethal damage heals from post-damage health", () => {
  const entities = [
    entity(1, 1, "troop", 20),
    entity(2, 1, "troop", 50, 30),
    entity(3, 1, "troop", 50, 30),
  ];
  const commands = [
    damage(0, 1, 20),
    damage(0, 2, 30),
    damage(0, 3, 10),
    heal(0, 1, 3, 20),
    heal(0, 3, 2, 20),
    heal(0, 3, 3, 20),
  ];
  const sim = encounter(entities, commands);
  sim.step();
  assert.deepEqual(
    sim.replay.filter(({ type }) => type === "heal").map(
      ({ applied, currentHealthAfter, status }) => ({
        applied,
        currentHealthAfter,
        status,
      }),
    ),
    [
      { applied: 0, currentHealthAfter: 20, status: "source-dead" },
      { applied: 0, currentHealthAfter: 0, status: "target-dead" },
      { applied: 20, currentHealthAfter: 40, status: "applied" },
    ],
  );
});

test("combat status heal: ownership, kind, missing, and dead exclusions are exact valid no-ops", () => {
  const entities = [
    entity(1, 1, "troop", 20),
    entity(2, 2, "troop", 20, 10),
    entity(3, 1, "structure", 20, 10),
    entity(4, 1, "tower", 20, 10),
    entity(5, 1, "troop", 20, 0),
  ];
  const commands = [
    heal(0, 99, 1, 1),
    heal(0, 1, 99, 1),
    heal(0, 1, 2, 1),
    heal(0, 1, 3, 1),
    heal(0, 1, 4, 1),
    heal(0, 1, 5, 1),
  ];
  const sim = encounter(entities, commands);
  sim.step();
  assert.deepEqual(sim.replay.map(({ status }) => status), [
    "source-missing",
    "target-missing",
    "enemy",
    "target-ineligible",
    "target-ineligible",
    "target-dead",
  ]);
  assert.deepEqual(sim.state.entities, entities);
});

test("combat status heal: returned fixture, state, replay, events, and catalog are mutation-isolated", () => {
  const fixture = createHealFixture(
    [entity(1, 1, "troop", 10, 5)],
    [heal(0, 1, 1, 3)],
  );
  const sim = new InstantHealingEncounter(fixture);
  fixture.entities[0].currentHealth = 1;
  fixture.commands[0].amount = 9;
  const events = sim.step();
  events[0].applied = 99;
  const state = sim.state;
  state.entities[0].currentHealth = 0;
  const replay = sim.replay;
  replay[0].status = "enemy";
  assert.equal(sim.state.entities[0].currentHealth, 8);
  assert.equal(sim.replay[0].applied, 3);
  assert.equal(sim.replay[0].status, "applied");
});

test("combat status heal: hostile getters, prototypes, sparse, extra, duplicate, unsafe, and oversized setup fail", () => {
  let getterCalls = 0;
  const hostile = {};
  Object.defineProperty(hostile, "entities", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return [];
    },
  });
  Object.defineProperty(hostile, "commands", {
    enumerable: true,
    value: [],
  });
  assert.throws(() => new InstantHealingEncounter(hostile), /invalid shape/u);
  assert.equal(getterCalls, 0);
  assert.throws(
    () => createHealFixture(
      [Object.assign(Object.create({ inherited: true }), entity(1, 1, "troop", 1))],
      [],
    ),
    /plain object/u,
  );
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => createHealFixture([], sparse), /dense/u);
  assert.throws(
    () => createHealFixture([], [{ ...heal(0, 1, 1, 1), extra: true }]),
    /invalid shape/u,
  );
  assert.throws(
    () => createHealFixture(
      [entity(1, 1, "troop", 1), entity(1, 1, "troop", 1)],
      [],
    ),
    /unique ascending/u,
  );
  for (const amount of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createHealFixture([], [heal(0, 1, 1, amount)]));
  }
  assert.throws(
    () => createHealFixture(
      Array.from({ length: 65 }, (_, index) =>
        entity(index + 1, 1, "troop", 1)),
      [],
    ),
    /bounded/u,
  );
  assert.throws(
    () => createHealFixture(
      [],
      Array.from({ length: 129 }, () => heal(0, 1, 1, 0)),
    ),
    /bounded/u,
  );
});

test("combat status heal: unsafe simultaneous aggregation and multi-step failures are atomic", () => {
  const sim = encounter(
    [entity(1, 1, "troop", Number.MAX_SAFE_INTEGER, 1)],
    [
      heal(0, 1, 1, 1),
      damage(1, 1, Number.MAX_SAFE_INTEGER),
      damage(1, 1, 1),
    ],
  );
  const before = sim.serialize();
  assert.throws(() => sim.stepMany(2), /exceeds safe integer/u);
  assert.equal(sim.serialize(), before);
});

test("combat status heal: arbitrary chunking, two fresh runs, and every causal-cut restore are byte-identical", () => {
  const entities = [
    entity(1, 1, "troop", 100, 60),
    entity(2, 1, "troop", 80, 70),
    entity(3, 2, "troop", 50, 40),
  ];
  const commands = [
    heal(0, 1, 2, 20),
    damage(2, 1, 15),
    heal(2, 2, 1, 7),
    damage(5, 2, 80),
    heal(5, 1, 2, 80),
    heal(8, 1, 1, 100),
    heal(8, 1, 3, 4),
  ];
  const first = encounter(entities, commands);
  first.run();
  const second = encounter(entities, commands);
  second.run();
  assert.equal(first.serialize(), second.serialize());
  assert.deepEqual(first.state, second.state);
  assert.deepEqual(first.replay, second.replay);

  const chunked = encounter(entities, commands);
  for (const count of [1, 2, 1, 3, 2]) chunked.stepMany(count);
  assert.equal(chunked.serialize(), first.serialize());

  for (let cut = 0; cut <= 9; cut += 1) {
    const uninterrupted = encounter(entities, commands);
    uninterrupted.stepMany(cut);
    const restored = InstantHealingEncounter.restore(uninterrupted.serialize());
    uninterrupted.stepMany(9 - cut);
    restored.stepMany(9 - cut);
    assert.equal(restored.serialize(), uninterrupted.serialize());
    assert.equal(restored.serialize(), first.serialize());
  }
});

test("combat status heal: forged, noncanonical, duplicate-key, and oversized snapshots are rejected", () => {
  const sim = encounter(
    [entity(1, 1, "troop", 10, 5)],
    [heal(0, 1, 1, 3)],
  );
  sim.step();
  const valid = sim.serialize();
  assert.equal(InstantHealingEncounter.restore(valid).serialize(), valid);
  assert.throws(() => InstantHealingEncounter.restore({}), /must be a string/u);
  assert.throws(() => InstantHealingEncounter.restore("{"), /valid JSON/u);
  assert.throws(
    () => InstantHealingEncounter.restore(` ${valid}`),
    /canonical/u,
  );
  assert.throws(
    () => InstantHealingEncounter.restore(
      valid.replace('"version":1', '"version":1,"version":1'),
    ),
    /canonical/u,
  );
  const forged = JSON.parse(valid);
  forged.state.entities[0].currentHealth = 9;
  const canonical = (value) => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  };
  assert.throws(
    () => InstantHealingEncounter.restore(canonical(forged)),
    /not a causal execution/u,
  );
  assert.throws(
    () => InstantHealingEncounter.restore(`"${"x".repeat(1048577)}"`),
    /byte bound/u,
  );
});

test("combat status heal: step bounds and command schedule stay finite and integral", () => {
  const sim = encounter([], []);
  for (const count of [-1, 0.5, Infinity, 4097]) {
    assert.throws(() => sim.stepMany(count));
  }
  assert.deepEqual(sim.stepMany(0), []);
  assert.throws(() => createHealFixture([], [heal(4096, 1, 1, 1)]));
  assert.throws(() => createHealFixture([], [
    heal(2, 1, 1, 1),
    heal(1, 1, 1, 1),
  ]), /nondecreasing/u);
});
