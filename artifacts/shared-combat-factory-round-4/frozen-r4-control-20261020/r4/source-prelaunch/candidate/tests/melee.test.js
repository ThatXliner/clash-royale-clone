import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { attackSecondsToTicks } from "../src/sim/attack-cycle.js";
import { MOVEMENT_SPEEDS } from "../src/sim/movement.js";
import { MeleeDuel } from "../src/sim/melee.js";

const reference = JSON.parse(readFileSync(
  new URL("../reference/stats/cards.json", import.meta.url),
  "utf8",
));
const cards = new Map(reference.cards.map((card) => [card.key, card]));

function synthetic(overrides) {
  return {
    damage: 10,
    deployTicks: 0,
    firstHitTicks: 0,
    hitSpeedTicks: 60,
    hitpoints: 100,
    id: 1,
    position: 0,
    radius: 500,
    reach: 500,
    sightRange: 6000,
    speed: MOVEMENT_SPEEDS.medium,
    ...overrides,
  };
}

function fixture(card, id, position) {
  const uncertain = new Set(card.unverified_fields);
  // These values remain stat-table baseline estimates/questions when flagged.
  // The integration claim is exact arithmetic from supplied fixture values,
  // not independent proof that an uncorroborated source value is authoritative.
  for (const field of [
    "hitpoints",
    "damage",
    "first_hit_seconds",
    "deploy_time_seconds",
  ]) {
    assert.ok(
      uncertain.has(field),
      `${card.key}.${field} unexpectedly became corroborated; revisit fixture label`,
    );
  }
  return {
    damage: card.damage,
    deployTicks: attackSecondsToTicks(String(card.deploy_time_seconds)),
    firstHitTicks: attackSecondsToTicks(String(card.first_hit_seconds)),
    hitSpeedTicks: attackSecondsToTicks(String(card.hit_speed_seconds)),
    hitpoints: card.hitpoints,
    id,
    position,
    radius: 500, // Synthetic body circle; contact begins at boundary zero.
    reach: Math.round(card.range_tiles * 1000),
    sightRange: Math.round(card.sight_range_tiles * 1000),
    speed: MOVEMENT_SPEEDS[card.movement_speed.replaceAll(" ", "_")],
  };
}

function attacks(replay, attackerId) {
  return replay.filter(
    (event) => event.type === "attack" && event.attackerId === attackerId,
  );
}

test("melee: same-boundary lethal hits resolve as a mutual trade", () => {
  const duel = new MeleeDuel({
    combatants: [
      synthetic({ damage: 100, id: 11, position: 0 }),
      synthetic({ damage: 100, id: 22, position: 1500 }),
    ],
  });

  const result = duel.run(1);
  assert.deepEqual(result.outcome, {
    deathTick: 0,
    draw: true,
    winnerId: null,
  });
  assert.deepEqual(
    result.events.map((event) => [event.type, event.attackerId, event.targetId]),
    [
      ["target", 11, 22],
      ["target", 22, 11],
      ["attack", 11, 22],
      ["attack", 22, 11],
      ["damage", 11, 22],
      ["damage", 22, 11],
      ["death", undefined, 11],
      ["death", undefined, 22],
    ],
  );
});

test("melee: tick order moves into edge reach before starting windup", () => {
  const duel = new MeleeDuel({
    combatants: [
      synthetic({ id: 7, position: 0, speed: MOVEMENT_SPEEDS.fast }),
      synthetic({ id: 9, position: 4000, speed: MOVEMENT_SPEEDS.fast }),
    ],
  });

  duel.run(50);
  assert.equal(duel.state.tick, 50);
  assert.deepEqual(
    attacks(duel.replay, 7).map((event) => event.tick),
    [49],
  );
  assert.deepEqual(
    attacks(duel.replay, 9).map((event) => event.tick),
    [49],
  );
  assert.deepEqual(
    duel.state.combatants.map(({ position }) => position),
    [1250, 2750],
  );
});

test("melee: level-11 Knight vs Mini P.E.K.K.A baseline follows table values", () => {
  const left = cards.get("knight");
  const right = cards.get("mini-pekka");
  const duel = new MeleeDuel({
    combatants: [fixture(left, 101, 0), fixture(right, 202, 1800)],
  });

  const result = duel.run(1000);
  // Derived independently from the loaded table:
  // Knight: deploy 60 + first hit 42 = T102, then every 72 ticks.
  // Mini P.E.K.K.A: deploy 60 + first hit 66 = T126, then every 96 ticks.
  assert.deepEqual(attacks(duel.replay, 101).map(({ tick }) => tick), [
    102, 174, 246, 318,
  ]);
  assert.deepEqual(attacks(duel.replay, 202).map(({ tick }) => tick), [
    126, 222, 318,
  ]);
  assert.deepEqual(result.outcome, {
    deathTick: 318,
    draw: false,
    winnerId: 202,
  });
  assert.deepEqual(
    result.state.combatants.map(({ hitpoints, id }) => ({ hitpoints, id })),
    [
      { hitpoints: 0, id: 101 },
      { hitpoints: right.hitpoints - 4 * left.damage, id: 202 },
    ],
  );
});

test("melee: level-11 Knight vs Valkyrie baseline follows table values", () => {
  const left = cards.get("knight");
  const right = cards.get("valkyrie");
  const duel = new MeleeDuel({
    combatants: [fixture(left, 301, 0), fixture(right, 302, 1800)],
  });

  const result = duel.run(1000);
  assert.deepEqual(attacks(duel.replay, 301).map(({ tick }) => tick), [
    102, 174, 246, 318, 390, 462, 534, 606, 678,
  ]);
  assert.deepEqual(attacks(duel.replay, 302).map(({ tick }) => tick), [
    144, 234, 324, 414, 504, 594, 684,
  ]);
  assert.deepEqual(result.outcome, {
    deathTick: 684,
    draw: false,
    winnerId: 302,
  });
  assert.deepEqual(
    result.state.combatants.map(({ hitpoints, id }) => ({ hitpoints, id })),
    [
      { hitpoints: 0, id: 301 },
      { hitpoints: right.hitpoints - 9 * left.damage, id: 302 },
    ],
  );
});

test("melee: chunking and serialize/restore are byte and result identical", () => {
  const setup = {
    combatants: [
      synthetic({
        damage: 23,
        firstHitTicks: 3,
        hitSpeedTicks: 11,
        id: 41,
        position: 0,
      }),
      synthetic({
        damage: 17,
        deployTicks: 2,
        firstHitTicks: 5,
        hitSpeedTicks: 7,
        id: 82,
        position: 3000,
      }),
    ],
  };
  const chunked = new MeleeDuel(setup);
  const singles = new MeleeDuel(setup);
  chunked.stepMany(20);
  for (let index = 0; index < 20; index += 1) singles.step();
  assert.equal(chunked.serialize(), singles.serialize());
  assert.deepEqual(chunked.state, singles.state);
  assert.deepEqual(chunked.replay, singles.replay);

  const restored = MeleeDuel.restore(chunked.serialize());
  assert.equal(restored.serialize(), chunked.serialize());
  assert.deepEqual(restored.state, chunked.state);
  assert.deepEqual(restored.replay, chunked.replay);
  assert.deepEqual(restored.run(100), chunked.run(100));
  assert.equal(restored.serialize(), chunked.serialize());
});

test("melee: invalid setup and commands reject atomically", () => {
  const valid = {
    combatants: [
      synthetic({ id: 1, position: 0 }),
      synthetic({ id: 2, position: 2000 }),
    ],
  };
  for (const setup of [
    {},
    { combatants: [] },
    { combatants: [valid.combatants[0], valid.combatants[0]] },
    {
      combatants: [
        valid.combatants[0],
        { ...valid.combatants[1], hitSpeedTicks: 0 },
      ],
    },
    {
      combatants: [
        valid.combatants[0],
        { ...valid.combatants[1], runtimeName: "not allowed" },
      ],
    },
  ]) {
    assert.throws(() => new MeleeDuel(setup));
  }

  const duel = new MeleeDuel(valid);
  duel.stepMany(2);
  const before = duel.serialize();
  const replayBefore = duel.replay;
  for (const command of [-1, 0.5, "2", Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => duel.stepMany(command));
    assert.equal(duel.serialize(), before);
    assert.deepEqual(duel.replay, replayBefore);
  }
  for (const snapshot of [
    "not json",
    "{}",
    JSON.stringify({ setup: valid, tick: 0, version: 2 }),
    JSON.stringify({ extra: true, setup: valid, tick: 0, version: 1 }),
    JSON.stringify({
      setup: {
        combatants: [
          synthetic({ damage: 100, id: 11, position: 0 }),
          synthetic({ damage: 100, id: 22, position: 1500 }),
        ],
      },
      tick: 2,
      version: 1,
    }),
  ]) {
    assert.throws(() => MeleeDuel.restore(snapshot));
  }
});
