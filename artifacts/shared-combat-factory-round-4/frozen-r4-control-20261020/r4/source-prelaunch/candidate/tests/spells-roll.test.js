import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  RollingSpellEncounter,
  createRollingSpellCatalog,
  createRollingSpellFixture,
  createRollingSpellQuestionRecords,
} from "../src/content/cards/spells-roll.js";

function source(id = 1, ownerId = 1, position = { x: 1000, y: 1000 }) {
  return { id, ownerId, position };
}

function victim(id, overrides = {}) {
  return {
    combatTargetId: null,
    combatTargetMode: null,
    health: 1000,
    id,
    kind: "troop",
    layer: "ground",
    ownerId: 2,
    position: { x: 5000, y: 1000 },
    radius: 0,
    targetable: true,
    ...overrides,
  };
}

function obstacle(id, overrides = {}) {
  return {
    blocking: true,
    id,
    position: { x: 7000, y: 1000 },
    radius: 0,
    ...overrides,
  };
}

function cast(id, tick = 0, overrides = {}) {
  return {
    center: { x: 9000, y: 1000 },
    effectId: null,
    id,
    obstacleId: null,
    sourceId: 1,
    targetId: null,
    tick,
    type: "cast",
    ...overrides,
  };
}

function command(type, id, tick, overrides = {}) {
  return {
    center: null,
    effectId: null,
    id,
    obstacleId: null,
    sourceId: null,
    targetId: null,
    tick,
    type,
    ...overrides,
  };
}

function fixture(commands, victims = [], obstacles = [], sources = [source()]) {
  return createRollingSpellFixture({ commands, obstacles, sources, victims });
}

function encounter(commands, victims = [], obstacles = [], sources = [source()]) {
  return new RollingSpellEncounter(fixture(commands, victims, obstacles, sources));
}

function frozen(value) {
  if (value !== null && typeof value === "object") {
    assert.equal(Object.isFrozen(value), true);
    Object.values(value).forEach(frozen);
  }
}

test("rolling spell: catalog ships one original identity", () => {
  assert.deepEqual(createRollingSpellCatalog(), [{
    areaDamageRadiusMillitiles: 1950,
    components: [],
    cost: 2,
    count: 1,
    damage: 290,
    deployTimeTicks: null,
    displayName: "Ironbark Roller",
    firstHitTicks: null,
    hitSpeedTicks: null,
    hitpoints: null,
    id: "ironbark-roller",
    kind: "effect",
    movementMillitilesPerSecond: null,
    rangeMillitiles: null,
    rarity: "mythic",
    sightRangeMillitiles: null,
    targetMode: "ground",
  }]);
});

test("rolling spell: corpus-absent policies are isolated frozen QUESTION records", () => {
  const questions = createRollingSpellQuestionRecords();
  assert.deepEqual(Object.keys(questions), [
    "cancellationBoundary",
    "collisionDamage",
    "collisionGeometry",
    "collisionOrder",
    "damageComposition",
    "expiryBoundary",
    "movingTargetPolicy",
    "obstaclePolicy",
    "repeatHitPolicy",
    "rollingRadiusMillitiles",
    "sameBoundaryOrder",
    "sourceDeathAfterContact",
    "stopBoundary",
    "targetDeathBoundary",
    "targetFilter",
    "travelComposition",
    "travelSpeedMillitilesPerTick",
  ]);
  for (const [key, record] of Object.entries(questions)) {
    assert.deepEqual(
      {
        authoritative: record.authoritative,
        confidence: record.confidence,
        disposition: record.disposition,
        key: record.key,
      },
      {
        authoritative: false,
        confidence: "unverified",
        disposition: "question",
        key,
      },
    );
  }
  frozen(questions);
});

test("rolling spell: passed line carrier defines launch path and exact expiry", () => {
  const spell = encounter([cast(1)]);
  assert.deepEqual(spell.step(), [{
    center: { x: 9000, y: 1000 },
    duration: 8,
    effectId: 1,
    expiryTick: 8,
    origin: { x: 1000, y: 1000 },
    primitiveEffectId: 1,
    radius: 1950,
    sourceId: 1,
    tick: 0,
    type: "roll-launch",
  }]);
  assert.deepEqual(spell.stepMany(7), []);
  assert.deepEqual(spell.step(), [{
    center: { x: 9000, y: 1000 },
    duration: 8,
    effectId: 1,
    sourceId: 1,
    tick: 8,
    type: "roll-expired",
  }]);
  assert.deepEqual(spell.state.pending, []);
});

test("rolling spell: swept closed capsule uses exact signed axis and diagonal boundaries", () => {
  const axis = encounter([cast(1)], [
    victim(9, { position: { x: 3950, y: 2949 } }),
    victim(10, { position: { x: 3950, y: 2950 } }),
    victim(11, { position: { x: 3950, y: 2951 } }),
  ]);
  axis.stepMany(9);
  assert.deepEqual(
    axis.replay.filter(({ type }) => type === "roll-contact")
      .map(({ targetId, tick }) => ({ targetId, tick })),
    [{ targetId: 9, tick: 3 }, { targetId: 10, tick: 3 }],
  );

  const origin = { x: 9000, y: 16000 };
  for (const { den, dx, dy, ux, uy } of [
    { den: 1, dx: 4000, dy: 0, ux: 1, uy: 0 },
    { den: 1, dx: -4000, dy: 0, ux: -1, uy: 0 },
    { den: 1, dx: 0, dy: 4000, ux: 0, uy: 1 },
    { den: 1, dx: 0, dy: -4000, ux: 0, uy: -1 },
    { den: 5, dx: 3000, dy: 4000, ux: 3, uy: 4 },
    { den: 5, dx: 3000, dy: -4000, ux: 3, uy: -4 },
    { den: 5, dx: -3000, dy: 4000, ux: -3, uy: 4 },
    { den: 5, dx: -3000, dy: -4000, ux: -3, uy: -4 },
  ]) {
    const spell = encounter(
      [cast(1, 0, { center: { x: origin.x + dx, y: origin.y + dy } })],
      [victim(10, {
        position: { x: origin.x + dx / 2, y: origin.y + dy / 2 },
      })],
      [],
      [source(1, 1, origin)],
    );
    spell.run();
    assert.equal(
      spell.replay.filter(({ type }) => type === "roll-contact").length,
      1,
      `${dx},${dy}`,
    );

    const equalEntry = encounter(
      [cast(1, 0, { center: { x: origin.x + dx, y: origin.y + dy } })],
      [victim(10, {
        position: {
          x: origin.x + ux * 2450 / den,
          y: origin.y + uy * 2450 / den,
        },
      })],
      [obstacle(20, {
        position: {
          x: origin.x + ux * 3050 / den,
          y: origin.y + uy * 3050 / den,
        },
        radius: 600,
      })],
      [source(1, 1, origin)],
    );
    equalEntry.run();
    assert.deepEqual(
      equalEntry.replay.filter(({ type }) => type === "roll-contact"),
      [],
      `equal entry ${dx},${dy}`,
    );
    assert.equal(
      equalEntry.replay.find(({ type }) => type === "roll-stopped").obstacleId,
      20,
      `equal blocker ${dx},${dy}`,
    );
  }

  const large = encounter(
    [cast(1, 0, { center: { x: 18000, y: 32000 } })],
    [victim(10, { position: { x: 4500, y: 8000 } })],
    [obstacle(20, {
      position: { x: 5400, y: 9600 },
      radius: 2000,
    })],
    [source(1, 1, { x: 0, y: 0 })],
  );
  large.run();
  assert.deepEqual(
    large.replay.filter(({ type }) => type === "roll-contact"),
    [],
  );
  assert.equal(
    large.replay.find(({ type }) => type === "roll-stopped").tick,
    8,
  );
});

test("rolling spell: first-contact damage order is exact capsule entry then stable ID", () => {
  const spell = encounter([cast(1)], [
    victim(40, { position: { x: 5000, y: 1000 } }),
    victim(20, { position: { x: 3000, y: 1000 } }),
    victim(10, { position: { x: 3000, y: 1000 } }),
  ]);
  spell.stepMany(9);
  assert.deepEqual(
    spell.replay.filter(({ type }) => type === "roll-contact")
      .map(({ targetId, tick }) => ({ targetId, tick })),
    [
      { targetId: 10, tick: 1 },
      { targetId: 20, tick: 1 },
      { targetId: 40, tick: 3 },
    ],
  );
  assert.deepEqual(
    spell.replay.filter(({ type }) => type === "roll-damage")
      .map(({ targetId }) => targetId),
    [10, 20, 40],
  );
});

test("rolling spell: each target is damaged at most once per effect", () => {
  const spell = encounter([cast(1)], [victim(8)]);
  spell.run();
  assert.equal(
    spell.replay.filter(({ type, targetId }) => (
      type === "roll-damage" && targetId === 8
    )).length,
    1,
  );
  assert.equal(spell.state.victims[0].health, 710);
});

test("rolling spell: damage phases adapt passed instant ordering and crown modifier", () => {
  const spell = encounter([cast(1)], [
    victim(8, { health: 200 }),
    victim(9, { health: 100, kind: "crown" }),
  ]);
  spell.stepMany(9);
  assert.deepEqual(
    spell.replay.filter(({ type }) => (
      type === "roll-hit" ||
      type === "roll-damage" ||
      type === "roll-death"
    )).map(({ targetId, type }) => ({ targetId, type })),
    [
      { targetId: 8, type: "roll-hit" },
      { targetId: 8, type: "roll-damage" },
      { targetId: 8, type: "roll-death" },
      { targetId: 9, type: "roll-hit" },
      { targetId: 9, type: "roll-damage" },
    ],
  );
  assert.equal(spell.state.victims.find(({ id }) => id === 8).health, 0);
  assert.equal(spell.state.victims.find(({ id }) => id === 9).health, 13);
});

test("rolling spell: first blocking obstacle stops before equal and later targets", () => {
  const spell = encounter(
    [cast(1)],
    [
      victim(10, { position: { x: 5000, y: 1000 } }),
      victim(20, { position: { x: 7000, y: 1000 } }),
      victim(30, { position: { x: 8000, y: 1000 } }),
    ],
    [obstacle(100)],
  );
  spell.run();
  assert.deepEqual(
    spell.replay.filter(({ type }) => type === "roll-contact")
      .map(({ targetId }) => targetId),
    [10],
  );
  assert.deepEqual(
    spell.replay.find(({ type }) => type === "roll-stopped"),
    {
      effectId: 1,
      obstacleId: 100,
      orderNumerator: "48000000",
      tick: 5,
      type: "roll-stopped",
    },
  );
  assert.equal(spell.replay.some(({ type }) => type === "roll-expired"), false);

  for (const { obstaclePosition, obstacleRadius, targets } of [
    {
      obstaclePosition: { x: 3950, y: 1000 },
      obstacleRadius: 900,
      targets: [],
    },
    {
      obstaclePosition: { x: 3950, y: 1000 },
      obstacleRadius: 500,
      targets: [],
    },
    {
      obstaclePosition: { x: 3800, y: 1000 },
      obstacleRadius: 0,
      targets: [10],
    },
  ]) {
    const unequal = encounter(
      [cast(1)],
      [victim(10, { position: { x: 3450, y: 1000 } })],
      [obstacle(20, {
        position: obstaclePosition,
        radius: obstacleRadius,
      })],
    );
    unequal.run();
    assert.deepEqual(
      unequal.replay.filter(({ type }) => type === "roll-contact")
        .map(({ targetId }) => targetId),
      targets,
    );
    assert.equal(
      unequal.replay.find(({ type }) => type === "roll-stopped").obstacleId,
      20,
    );
  }
});

test("rolling spell: nonblocking and command-first dead obstacles do not stop", () => {
  const spell = encounter(
    [
      cast(1),
      command("obstacle-died", 2, 5, { obstacleId: 100 }),
    ],
    [victim(20, { position: { x: 8000, y: 1000 } })],
    [
      obstacle(90, { blocking: false, position: { x: 6000, y: 1000 } }),
      obstacle(100),
    ],
  );
  spell.run();
  assert.deepEqual(
    spell.replay.filter(({ type }) => type === "roll-contact")
      .map(({ targetId }) => targetId),
    [20],
  );
  assert.equal(spell.replay.some(({ type }) => type === "roll-expired"), true);
});

test("rolling spell: cancellation and source death are command-first boundaries", () => {
  for (const cancellation of [
    command("cancel-effect", 2, 3, { effectId: 1 }),
    command("source-died", 2, 3, { sourceId: 1 }),
  ]) {
    const spell = encounter(
      [cast(1), cancellation],
      [
        victim(10, { position: { x: 3000, y: 1000 } }),
        victim(20, { position: { x: 5000, y: 1000 } }),
      ],
    );
    spell.run();
    assert.deepEqual(
      spell.replay.filter(({ type }) => type === "roll-contact")
        .map(({ targetId }) => targetId),
      [10],
    );
    assert.equal(
      spell.replay.filter(({ type }) => type === "roll-cancelled").length,
      1,
    );
  }
});

test("rolling spell: target death boundaries and simultaneous effect order are causal", () => {
  const commanded = encounter([
    cast(1),
    command("target-died", 2, 1, { targetId: 8 }),
  ], [victim(8, { position: { x: 3000, y: 1000 } })]);
  commanded.run();
  assert.equal(
    commanded.replay.some(({ type }) => type === "roll-contact"),
    false,
  );

  const simultaneous = encounter(
    [cast(10), cast(20)],
    [victim(8, { health: 400, position: { x: 3000, y: 1000 } })],
  );
  simultaneous.run();
  assert.deepEqual(
    simultaneous.replay.filter(({ type }) => type === "roll-damage")
      .map(({ effectId, healthAfter, healthBefore }) => ({
        effectId, healthAfter, healthBefore,
      })),
    [
      { effectId: 1, healthAfter: 110, healthBefore: 400 },
      { effectId: 2, healthAfter: 0, healthBefore: 110 },
    ],
  );
  assert.equal(
    simultaneous.replay.some(({ type, effectId }) => (
      type === "roll-death" && effectId === 2
    )),
    true,
  );
});

test("rolling spell: chunks and every restore cut are byte-identical", () => {
  const commands = [
    cast(1),
    cast(2, 4, { center: { x: 6000, y: 4000 } }),
  ];
  const victims = [
    victim(8, { position: { x: 4000, y: 1000 } }),
    victim(9, { position: { x: 6000, y: 4000 } }),
  ];
  const obstacles = [
    obstacle(100, { position: { x: 3950, y: 1000 }, radius: 900 }),
  ];
  const expected = encounter(commands, victims, obstacles);
  expected.stepMany(12);
  const chunked = encounter(commands, victims, obstacles);
  for (const count of [1, 0, 2, 3, 1, 5]) chunked.stepMany(count);
  assert.equal(chunked.serialize(), expected.serialize());
  assert.deepEqual(chunked.state, expected.state);

  const bounded = encounter(commands, victims, obstacles);
  bounded.run();
  for (let cut = 0; cut <= 128; cut += 1) {
    const causal = encounter(commands, victims, obstacles);
    causal.stepMany(cut);
    const restored = RollingSpellEncounter.restore(causal.serialize());
    assert.deepEqual(restored.state.pending, causal.state.pending, `latches ${cut}`);
    restored.stepMany(128 - cut);
    assert.equal(restored.serialize(), bounded.serialize(), `cut ${cut}`);
    assert.deepEqual(restored.state, bounded.state, `state ${cut}`);
  }
});

test("rolling spell: canonical restore rejects forged and oversized snapshots", () => {
  const spell = encounter([cast(1)], [victim(8)]);
  spell.stepMany(3);
  const serialized = spell.serialize();
  assert.equal(RollingSpellEncounter.restore(serialized).serialize(), serialized);
  assert.deepEqual(Object.keys(JSON.parse(serialized)), [
    "identity", "tick", "version",
  ]);
  assert.throws(() => RollingSpellEncounter.restore(` ${serialized}`), /canonical/u);
  assert.throws(
    () => RollingSpellEncounter.restore(
      serialized.replace('"version":1', '"version":2'),
    ),
    /version/u,
  );
  assert.throws(
    () => RollingSpellEncounter.restore("é".repeat(131073)),
    /byte bound/u,
  );
});

test("rolling spell: hostile shapes bounds and failed execution are atomic", () => {
  const valid = {
    commands: [cast(1)],
    obstacles: [],
    sources: [source()],
    victims: [victim(8)],
  };
  let reads = 0;
  const hostile = cast(1);
  Object.defineProperty(hostile, "tick", {
    enumerable: true,
    get() {
      reads += 1;
      return 0;
    },
  });
  assert.throws(() => createRollingSpellFixture({
    ...valid, commands: [hostile],
  }));
  assert.equal(reads, 0);
  assert.throws(() => createRollingSpellFixture({
    ...valid, commands: [Object.create(cast(1))],
  }), /plain object/u);
  const sparse = [];
  sparse.length = 1;
  assert.throws(() => createRollingSpellFixture({
    ...valid, victims: sparse,
  }), /dense/u);
  assert.throws(() => createRollingSpellFixture({ ...valid, extra: true }));
  assert.throws(() => createRollingSpellFixture({
    ...valid, commands: [cast(1), cast(1)],
  }), /unique/u);
  assert.throws(() => createRollingSpellFixture({
    ...valid, obstacles: [obstacle(8)],
  }), /disjoint/u);
  assert.throws(() => createRollingSpellFixture({
    ...valid,
    commands: Array.from({ length: 97 }, (_, index) => cast(index + 1)),
  }), /bounded plain array/u);

  const spell = encounter([cast(1)], [victim(8)]);
  const before = spell.serialize();
  for (const count of [-1, 129, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => spell.stepMany(count));
    assert.equal(spell.serialize(), before);
  }
  spell.stepMany(127);
  const nearEnd = spell.serialize();
  assert.throws(() => spell.stepMany(2), /encounter bound/u);
  assert.equal(spell.serialize(), nearEnd);

  const tooLate = encounter(
    [cast(1, 127, { center: { x: 18000, y: 0 } })],
    [],
    [],
    [source(1, 1, { x: 0, y: 0 })],
  );
  tooLate.stepMany(127);
  const prior = tooLate.serialize();
  assert.throws(() => tooLate.step(), /tick bound/u);
  assert.equal(tooLate.serialize(), prior);
});

test("rolling spell: passed line and instant primitives are pinned and imported", () => {
  const hashes = {
    "../src/content/cards/spells-instant.js":
      "d62c418b375be6ed28c7f79a115fa3e9c2e425db210018a0d9919bdb7993325a",
    "../src/content/cards/spells-travel-line.js":
      "7694602949b8725db96ab0049f3bdbdd37a432fd6c850d0f1b9913ba5c5983d5",
  };
  for (const [path, expected] of Object.entries(hashes)) {
    const contents = readFileSync(new URL(path, import.meta.url));
    assert.equal(
      createHash("sha256").update(contents).digest("hex"),
      expected,
      path,
    );
  }
  const sourceText = readFileSync(
    new URL("../src/content/cards/spells-roll.js", import.meta.url),
    "utf8",
  );
  assert.match(sourceText, /new TravelingLineSpellEncounter/u);
  assert.match(sourceText, /new InstantRadiusSpellEncounter/u);
  assert.doesNotMatch(sourceText, /waveIndex|returnLeg|returnTick/u);
  assert.doesNotMatch(sourceText, /reference\//u);
});
