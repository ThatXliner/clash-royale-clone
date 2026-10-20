import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  InvisibilityRevealEncounter,
  createInvisibilityFixture,
  createInvisibilityMappedFieldQuestionRecords,
  createInvisibilityQuestionRecords,
  createInvisibilitySpecialCatalog,
} from "../src/content/index.js";
import { protectedIdentityHits } from "./helpers/protected-identity-scan.js";

const benchmark = JSON.parse(readFileSync(
  new URL("../reference/stats/cards.json", import.meta.url),
  "utf8",
));
const mappedBenchmarkCards = [26000050, 26000087].map((id) =>
  benchmark.cards.find((card) => card.id === id));
const mappedBenchmarkFixtures = mappedBenchmarkCards.map((card) => ({
  fixtureIdentity: `cards.json#${card.id}`,
  unverifiedFields: card.unverified_fields.map((field) => ({
    field,
    value: card[field],
  })),
}));
const target = (
  id,
  x,
  radius = 0,
  health = 1000,
  kind = "troop",
  layer = "ground",
) => ({
  alive: health > 0,
  health,
  id,
  kind,
  layer,
  position: { x, y: 0 },
  radius,
});
const command = (tick, type, targetId = null, sourceId = null) => ({
  sourceId,
  targetId,
  tick,
  type,
});
const hide = (tick, targetId, sourceId = 90) =>
  command(tick, "hide", targetId, sourceId);
const reveal = (tick, targetId, sourceId = 91) =>
  command(tick, "reveal", targetId, sourceId);
const typesAt = (encounter, tick) =>
  encounter.replay.filter((event) => event.tick === tick)
    .map(({ type }) => type);
const eventsOf = (encounter, type) =>
  encounter.replay.filter((event) => event.type === type);

function assertDeepFrozen(value) {
  if (value === null || typeof value !== "object") return;
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

function independentOracle(targets, commands, tickCount) {
  const entities = targets.map((entry) => ({
    ...structuredClone(entry),
    hides: new Map(),
    revealThrough: -1,
    visible: entry.alive,
  }));
  let lock = null;
  let remaining = null;
  let phase = "idle";
  let commandIndex = 0;
  const trace = [];
  for (let tick = 0; tick < tickCount; tick += 1) {
    const current = commands[commandIndex];
    if (current?.tick === tick) {
      commandIndex += 1;
      const entity = entities.find(({ id }) => id === current.targetId);
      if (current.type === "hide" && entity.alive) {
        entity.hides.set(
          current.sourceId,
          Math.max(entity.hides.get(current.sourceId) ?? -1, tick + 11),
        );
      } else if (current.type === "reveal" && entity.alive) {
        entity.revealThrough = Math.max(entity.revealThrough, tick + 3);
      } else if (current.type === "target-died" && entity.alive) {
        entity.alive = false;
        entity.health = 0;
      }
    }
    for (const entity of entities) {
      for (const [sourceId, through] of entity.hides) {
        if (through < tick) entity.hides.delete(sourceId);
      }
      entity.visible = entity.alive &&
        (entity.revealThrough >= tick || entity.hides.size === 0);
    }
    const sightEligible = (entity) =>
      entity.alive && entity.visible &&
      Math.hypot(entity.position.x, entity.position.y) - entity.radius <= 5000;
    if (lock !== null && !sightEligible(
      entities.find(({ id }) => id === lock),
    )) {
      trace.push(`${tick}:lost:${lock}`);
      lock = null;
      remaining = null;
      phase = "idle";
    }
    if (lock === null) {
      const eligible = entities.filter(sightEligible).sort((left, right) => {
        const ld = Math.hypot(left.position.x, left.position.y) - left.radius;
        const rd = Math.hypot(right.position.x, right.position.y) - right.radius;
        return ld - rd || left.id - right.id;
      });
      if (eligible.length > 0) {
        lock = eligible[0].id;
        trace.push(`${tick}:acquired:${lock}`);
        const inRange =
          Math.hypot(eligible[0].position.x, eligible[0].position.y) -
            eligible[0].radius <= 2000;
        phase = inRange ? "windup" : "tracking";
        remaining = inRange ? 4 : null;
      }
    }
    if (lock !== null) {
      const entity = entities.find(({ id }) => id === lock);
      const inRange = sightEligible(entity) &&
        Math.hypot(entity.position.x, entity.position.y) - entity.radius <= 2000;
      if (inRange) {
        if (phase === "tracking") {
          phase = "windup";
          remaining = 4;
        }
        remaining -= 1;
        if (remaining === 0) {
          trace.push(`${tick}:launched:${lock}`);
          phase = "cadence";
          remaining = 6;
        }
      } else {
        phase = "tracking";
        remaining = null;
      }
    }
  }
  return trace;
}

function productionTrace(encounter) {
  return encounter.replay.filter(({ type }) =>
    ["target-acquired", "target-lost", "projectile-launched"].includes(type)
  ).map(({ targetId, tick, type }) => {
    const mapped = type === "target-acquired"
      ? "acquired"
      : type === "target-lost" ? "lost" : "launched";
    return `${tick}:${mapped}:${targetId}`;
  });
}

test("combat status invisibility: original shipped identity is isolated", () => {
  assert.deepEqual(createInvisibilitySpecialCatalog(), [{
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 3,
    count: 1,
    damage: 96,
    deployTimeTicks: 60,
    displayName: "Veil Prowler",
    firstHitTicks: 4,
    hitSpeedTicks: 6,
    hitpoints: 900,
    id: "veil-prowler",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 2000,
    rarity: "uncommon",
    sightRangeMillitiles: 5000,
    targetMode: "ground-and-air",
  }]);
  const catalog = createInvisibilitySpecialCatalog();
  catalog[0].damage = 1;
  assert.equal(createInvisibilitySpecialCatalog()[0].damage, 96);
  const source = readFileSync(
    new URL("../src/content/cards/combat-status-invisibility.js", import.meta.url),
    "utf8",
  );
  const protectedTokens = new Set(benchmark.cards.flatMap(({ key, name }) =>
    [key.toLowerCase(), name.toLowerCase()]));
  assert.deepEqual(protectedIdentityHits(source, protectedTokens), []);
  assert.doesNotMatch(source, /readFile|cards\.json|reference\//u);
});

test("combat status invisibility: protected benchmark mapping is test-only", () => {
  assert.equal(mappedBenchmarkCards.length, 2);
  assert.ok(mappedBenchmarkCards.every((entry) => entry !== undefined));
  assert.deepEqual(mappedBenchmarkCards.map(
    ({ unverified_fields: fields }) => fields.length,
  ), [12, 11]);
  assert.ok(mappedBenchmarkCards.every(({ unverified_fields: fields }) =>
    Array.isArray(fields)));

  const first = createInvisibilityMappedFieldQuestionRecords(
    mappedBenchmarkFixtures,
  );
  const second = createInvisibilityMappedFieldQuestionRecords(
    mappedBenchmarkFixtures,
  );
  const expectedKeys = mappedBenchmarkFixtures.flatMap((fixture) =>
    fixture.unverifiedFields.map(({ field }) =>
      `mappedField:${fixture.fixtureIdentity}:${field}`));
  assert.equal(expectedKeys.length, 23);
  assert.equal(new Set(expectedKeys).size, expectedKeys.length);
  assert.deepEqual(Object.keys(first), expectedKeys);
  assertDeepFrozen(first);
  assertDeepFrozen(second);
  assert.equal(new Set([
    ...Object.values(first),
    ...Object.values(second),
  ]).size, 46);

  const seenRecords = new Set();
  for (const [fixtureIndex, fixture] of mappedBenchmarkFixtures.entries()) {
    const card = mappedBenchmarkCards[fixtureIndex];
    assert.deepEqual(
      fixture.unverifiedFields.map(({ field }) => field),
      card.unverified_fields,
    );
    for (const { field, value } of fixture.unverifiedFields) {
      const key = `mappedField:${fixture.fixtureIdentity}:${field}`;
      const record = first[key];
      assert.deepEqual(record, {
        authoritative: false,
        confidence: "unverified",
        disposition: "question",
        key,
        source:
          `test-only benchmark fixture ${fixture.fixtureIdentity} ` +
          `unverified_fields contains ${field}`,
        value,
      });
      assert.notEqual(record, second[key]);
      assert.equal(seenRecords.has(record), false);
      seenRecords.add(record);
    }
  }
  assert.equal(seenRecords.size, 23);
  assert.throws(() => createInvisibilityMappedFieldQuestionRecords([
    mappedBenchmarkFixtures[0],
    mappedBenchmarkFixtures[0],
  ]), /unique identities/u);
  assert.throws(() => createInvisibilityMappedFieldQuestionRecords([{
    ...mappedBenchmarkFixtures[0],
    unverifiedFields: [
      ...mappedBenchmarkFixtures[0].unverifiedFields,
      mappedBenchmarkFixtures[0].unverifiedFields[0],
    ],
  }]), /fields must be unique/u);
});

test("combat status invisibility: all 41 generic questions are fresh and recursively frozen", () => {
  const first = createInvisibilityQuestionRecords();
  const second = createInvisibilityQuestionRecords();
  assert.equal(Object.keys(first).length, 41);
  assert.ok(Object.isFrozen(first));
  assert.notEqual(first, second);
  for (const [key, record] of Object.entries(first)) {
    assert.deepEqual({
      authoritative: record.authoritative,
      confidence: record.confidence,
      disposition: record.disposition,
      key: record.key,
      source: record.source,
    }, {
      authoritative: false,
      confidence: "unverified",
      disposition: "question",
      key,
      source: "unsourced-invisibility-reveal-reacquisition-fixture",
    });
    assert.ok(Object.isFrozen(record));
    assert.notEqual(record, second[key]);
    if (record.value !== null && typeof record.value === "object") {
      assert.ok(Object.isFrozen(record.value));
    }
  }
  assert.throws(() => createInvisibilityQuestionRecords({ duration: 1 }),
    /do not accept overrides/u);
});

test("combat status invisibility: exact hide, reveal, and re-hide boundaries", () => {
  const commands = [hide(2, 7), reveal(5, 7)];
  const encounter = new InvisibilityRevealEncounter(
    createInvisibilityFixture([target(7, 1000)], commands),
  );
  encounter.stepMany(15);
  assert.deepEqual(eventsOf(encounter, "target-hidden").map(({ tick }) => tick),
    [2, 9]);
  assert.deepEqual(eventsOf(encounter, "target-revealed").map(({ tick }) => tick),
    [5, 14]);
  assert.deepEqual(productionTrace(encounter),
    independentOracle([target(7, 1000)], commands, 15));
});

test("combat status invisibility: hide expiry is inclusive and reapply refreshes", () => {
  const encounter = new InvisibilityRevealEncounter(createInvisibilityFixture(
    [target(7, 1000)],
    [hide(0, 7, 1), hide(7, 7, 1)],
  ));
  encounter.stepMany(20);
  assert.deepEqual(eventsOf(encounter, "hide-applied").map(
    ({ hiddenThroughTick, tick }) => [tick, hiddenThroughTick],
  ), [[0, 11], [7, 18]]);
  assert.deepEqual(eventsOf(encounter, "target-revealed").map(({ tick }) => tick),
    [19]);
});

test("combat status invisibility: multiple sources form a deterministic union", () => {
  const encounter = new InvisibilityRevealEncounter(createInvisibilityFixture(
    [target(7, 1000)],
    [hide(0, 7, 9), hide(3, 7, 2)],
  ));
  encounter.stepMany(16);
  assert.deepEqual(encounter.replay.filter(({ type }) =>
    type === "target-hidden" || type === "target-revealed"
  ).map(({ tick, type }) => [tick, type]), [
    [0, "target-hidden"],
    [15, "target-revealed"],
  ]);
  assert.deepEqual(encounter.state.targets[0].hideSources, []);
});

test("combat status invisibility: hidden loss cancels readiness and reacquisition restarts full windup", () => {
  const commands = [hide(3, 7), reveal(6, 7)];
  const encounter = new InvisibilityRevealEncounter(
    createInvisibilityFixture([target(7, 1000)], commands),
  );
  encounter.stepMany(12);
  assert.deepEqual(eventsOf(encounter, "projectile-launched").map(
    ({ targetId, tick }) => [tick, targetId],
  ), [[9, 7]]);
  assert.deepEqual(productionTrace(encounter),
    independentOracle([target(7, 1000)], commands, 12));
});

test("combat status invisibility: stable-ID reacquisition wins equal-distance ties", () => {
  const targets = [target(9, -1500), target(3, 1500)];
  const commands = [hide(2, 3), hide(3, 9), reveal(5, 3)];
  const encounter = new InvisibilityRevealEncounter(
    createInvisibilityFixture(targets, commands),
  );
  encounter.stepMany(11);
  assert.deepEqual(eventsOf(encounter, "target-acquired").map(
    ({ targetId, tick }) => [tick, targetId],
  ), [[0, 3], [2, 9], [5, 3]]);
  assert.deepEqual(productionTrace(encounter),
    independentOracle(targets, commands, 11));
});

test("combat status invisibility: sight boundary is inclusive at minus/exact/plus one", () => {
  const run = (x) => {
    const encounter = new InvisibilityRevealEncounter(
      createInvisibilityFixture([target(7, x, 100)]),
    );
    encounter.step();
    return encounter.state.targetId;
  };
  assert.equal(run(5099), 7);
  assert.equal(run(5100), 7);
  assert.equal(run(5101), null);
});

test("combat status invisibility: attack boundary is inclusive at minus/exact/plus one", () => {
  const launchTicks = (x) => {
    const encounter = new InvisibilityRevealEncounter(
      createInvisibilityFixture([target(7, x, 100)]),
    );
    encounter.stepMany(8);
    return eventsOf(encounter, "projectile-launched").map(({ tick }) => tick);
  };
  assert.deepEqual(launchTicks(2099), [3]);
  assert.deepEqual(launchTicks(2100), [3]);
  assert.deepEqual(launchTicks(2101), []);
});

test("combat status invisibility: edge-distance beats center-distance and ID ties", () => {
  const encounter = new InvisibilityRevealEncounter(
    createInvisibilityFixture([
      target(8, 1700, 800),
      target(2, 1000, 100),
      target(1, -1000, 100),
    ]),
  );
  encounter.step();
  assert.equal(encounter.state.targetId, 1);
  const largerRadius = new InvisibilityRevealEncounter(
    createInvisibilityFixture([
      target(8, 1700, 801),
      target(2, 1000, 100),
    ]),
  );
  largerRadius.step();
  assert.equal(largerRadius.state.targetId, 8);
});

test("combat status invisibility: launched projectile hits a hidden target", () => {
  const encounter = new InvisibilityRevealEncounter(createInvisibilityFixture(
    [target(7, 1000)],
    [hide(4, 7)],
  ));
  encounter.stepMany(7);
  assert.deepEqual(typesAt(encounter, 3), ["projectile-launched"]);
  assert.deepEqual(typesAt(encounter, 4),
    ["hide-applied", "target-hidden", "target-lost"]);
  const contact = eventsOf(encounter, "projectile-contact")[0];
  assert.deepEqual(
    [contact.tick, contact.targetId, contact.targetVisible, contact.healthAfter],
    [5, 7, false, 904],
  );
});

test("combat status invisibility: apply at ready, contact, and cadence boundaries is command-first", () => {
  const ready = new InvisibilityRevealEncounter(createInvisibilityFixture(
    [target(7, 1000)], [hide(3, 7)],
  ));
  ready.stepMany(6);
  assert.deepEqual(eventsOf(ready, "projectile-launched"), []);

  const contact = new InvisibilityRevealEncounter(createInvisibilityFixture(
    [target(7, 1000)], [hide(5, 7)],
  ));
  contact.stepMany(7);
  assert.deepEqual(typesAt(contact, 5), [
    "hide-applied", "target-hidden", "target-lost", "projectile-contact",
  ]);

  const cadence = new InvisibilityRevealEncounter(createInvisibilityFixture(
    [target(7, 1000)], [hide(9, 7)],
  ));
  cadence.stepMany(12);
  assert.deepEqual(eventsOf(cadence, "projectile-launched")
    .map(({ tick }) => tick), [3]);
});

test("combat status invisibility: reveal at a ready boundary reacquires with full windup", () => {
  const encounter = new InvisibilityRevealEncounter(createInvisibilityFixture(
    [target(7, 1000)],
    [hide(0, 7), reveal(3, 7)],
  ));
  encounter.stepMany(8);
  assert.deepEqual(eventsOf(encounter, "target-acquired").map(({ tick }) => tick),
    [3]);
  assert.deepEqual(eventsOf(encounter, "projectile-launched").map(({ tick }) =>
    tick), [6]);
});

test("combat status invisibility: reveal at contact and cadence boundaries is command-first", () => {
  const contact = new InvisibilityRevealEncounter(createInvisibilityFixture(
    [target(7, 1000)],
    [hide(4, 7), reveal(5, 7)],
  ));
  contact.stepMany(10);
  assert.deepEqual(typesAt(contact, 5), [
    "reveal-applied", "target-revealed", "target-acquired",
    "projectile-contact",
  ]);
  assert.deepEqual(eventsOf(contact, "projectile-launched")
    .map(({ tick }) => tick), [3, 8]);

  const cadence = new InvisibilityRevealEncounter(createInvisibilityFixture(
    [target(7, 1000)],
    [hide(7, 7), reveal(9, 7)],
  ));
  cadence.stepMany(14);
  assert.deepEqual(typesAt(cadence, 9), [
    "reveal-applied", "target-revealed", "target-acquired",
  ]);
  assert.deepEqual(eventsOf(cadence, "projectile-launched")
    .map(({ tick }) => tick), [3, 12]);
});

test("combat status invisibility: target death is command-first and projectile misses", () => {
  const encounter = new InvisibilityRevealEncounter(createInvisibilityFixture(
    [target(7, 1000)],
    [command(5, "target-died", 7)],
  ));
  encounter.stepMany(7);
  assert.deepEqual(typesAt(encounter, 5), [
    "target-died", "target-lost", "projectile-missed",
  ]);
  assert.equal(encounter.state.targetId, null);
});

test("combat status invisibility: attacker death and interruption clear all attack work", () => {
  const dead = new InvisibilityRevealEncounter(
    createInvisibilityFixture([target(7, 1000)], [command(4, "die")]),
  );
  dead.stepMany(8);
  assert.equal(dead.state.targetId, null);
  assert.deepEqual(dead.state.pendingProjectiles, []);
  assert.equal(eventsOf(dead, "projectile-contact").length, 0);

  const interrupted = new InvisibilityRevealEncounter(
    createInvisibilityFixture([target(7, 1000)], [command(4, "interrupt")]),
  );
  interrupted.stepMany(8);
  assert.deepEqual(typesAt(interrupted, 4), [
    "target-lost", "interrupted",
  ]);
  assert.deepEqual(typesAt(interrupted, 5), ["target-acquired"]);
  assert.deepEqual(interrupted.state.pendingProjectiles, []);
  assert.equal(eventsOf(interrupted, "projectile-contact").length, 0);
  assert.equal(eventsOf(interrupted, "projectile-launched").length, 1);
});

test("combat status invisibility: caller inputs and returned outputs are isolated", () => {
  const targets = [target(7, 1000)];
  const commands = [hide(3, 7)];
  const fixture = createInvisibilityFixture(targets, commands);
  targets[0].position.x = 999999;
  commands[0].tick = 99;
  const encounter = new InvisibilityRevealEncounter(fixture);
  const events = encounter.stepMany(4);
  const state = encounter.state;
  const replay = encounter.replay;
  events[0].targetId = 999;
  state.targets[0].position.x = 999;
  replay[0].targetId = 999;
  assert.equal(encounter.state.targets[0].position.x, 1000);
  assert.equal(encounter.replay[0].targetId, 7);
  fixture.targets[0].position.x = 88;
  assert.equal(encounter.state.targets[0].position.x, 1000);
});

test("combat status invisibility: target reordering and chunking are canonical", () => {
  const targets = [target(9, -1000), target(3, 1000)];
  const commands = [hide(2, 3), reveal(5, 3), hide(10, 9)];
  const left = new InvisibilityRevealEncounter(
    createInvisibilityFixture(targets, commands),
  );
  const right = new InvisibilityRevealEncounter(
    createInvisibilityFixture([...targets].reverse(), commands),
  );
  left.stepMany(20);
  for (const count of [1, 2, 4, 3, 10]) right.stepMany(count);
  assert.equal(left.serialize(), right.serialize());
  assert.deepEqual(left.replay, right.replay);
});

test("combat status invisibility: every-boundary restore matches fresh timeline", () => {
  const fixture = createInvisibilityFixture(
    [target(9, -1000), target(3, 1000)],
    [hide(2, 3), hide(4, 9), reveal(6, 3), hide(13, 3, 2)],
  );
  const fresh = new InvisibilityRevealEncounter(fixture);
  fresh.stepMany(30);
  const expected = fresh.serialize();
  for (let cut = 0; cut <= 30; cut += 1) {
    const partial = new InvisibilityRevealEncounter(fixture);
    partial.stepMany(cut);
    const restored = InvisibilityRevealEncounter.restore(partial.serialize());
    restored.stepMany(30 - cut);
    assert.equal(restored.serialize(), expected, `restore cut ${cut}`);
  }
});

test("combat status invisibility: snapshots are canonical, bounded, and causal", () => {
  const encounter = new InvisibilityRevealEncounter(
    createInvisibilityFixture([target(7, 1000)], [hide(3, 7)]),
  );
  encounter.stepMany(8);
  const snapshot = encounter.serialize();
  assert.equal(InvisibilityRevealEncounter.restore(snapshot).serialize(),
    snapshot);
  assert.throws(() => InvisibilityRevealEncounter.restore(` ${snapshot}`),
    /canonical/u);
  assert.throws(() => InvisibilityRevealEncounter.restore(
    snapshot.replace('"version":1', '"version":1,"version":1'),
  ), /canonical/u);
  const forged = JSON.parse(snapshot);
  forged.state.tick += 1;
  assert.throws(() => InvisibilityRevealEncounter.restore(
    JSON.stringify(forged, Object.keys(forged).sort()),
  ));
  assert.throws(() => InvisibilityRevealEncounter.restore("x".repeat(524289)),
    /byte bound/u);
});

test("combat status invisibility: hostile objects, getters, prototypes, and symbols reject", () => {
  const base = target(7, 1000);
  const getter = { ...base };
  Object.defineProperty(getter, "id", {
    enumerable: true,
    get() {
      throw new Error("getter executed");
    },
  });
  assert.throws(() => createInvisibilityFixture([getter]), /invalid shape/u);
  assert.throws(() => createInvisibilityFixture([
    Object.assign(Object.create({ hostile: true }), base),
  ]), /plain object/u);
  const symbolic = { ...base, [Symbol("extra")]: 1 };
  assert.throws(() => createInvisibilityFixture([symbolic]), /invalid shape/u);
  const nullPrototype = Object.assign(Object.create(null), base);
  assert.doesNotThrow(() => createInvisibilityFixture([nullPrototype]));
});

test("combat status invisibility: sparse, extra, duplicate, unsafe, and overflow inputs reject", () => {
  const sparse = Array(1);
  assert.throws(() => createInvisibilityFixture(sparse), /dense/u);
  assert.throws(() => createInvisibilityFixture([
    { ...target(7, 1000), extra: true },
  ]), /invalid shape/u);
  assert.throws(() => createInvisibilityFixture([
    target(7, 1000), target(7, 2000),
  ]), /unique IDs/u);
  assert.throws(() => createInvisibilityFixture([
    target(Number.MAX_SAFE_INTEGER + 1, 1000),
  ]), /safe integer/u);
  assert.throws(() => createInvisibilityFixture([
    target(7, 1_000_001),
  ]), /safe integer/u);
  assert.throws(() => createInvisibilityFixture(
    [target(7, 1000)],
    [hide(4090, 7)],
  ), /cannot fit/u);
  assert.throws(() => createInvisibilityFixture(
    [target(7, 1000)],
    [hide(1, 7), reveal(1, 7)],
  ), /unique increasing/u);
  assert.throws(() => createInvisibilityFixture(
    [target(7, 1000)],
    [hide(1, 99)],
  ), /unknown target/u);
});

test("combat status invisibility: oversized inputs and non-data arrays reject", () => {
  assert.throws(() => createInvisibilityFixture(
    Array.from({ length: 33 }, (_, index) => target(index + 1, 1000)),
  ), /bounded plain array/u);
  assert.throws(() => createInvisibilityFixture(
    [target(7, 1000)],
    Array.from({ length: 97 }, (_, index) =>
      hide(index, 7, index + 1)),
  ), /bounded plain array/u);
  const array = [target(7, 1000)];
  array.extra = true;
  assert.throws(() => createInvisibilityFixture(array), /dense/u);
});

test("combat status invisibility: step bounds are atomic", () => {
  const encounter = new InvisibilityRevealEncounter(
    createInvisibilityFixture([target(7, 1000)]),
  );
  const before = encounter.serialize();
  for (const invalid of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, 4097]) {
    assert.throws(() => encounter.stepMany(invalid));
    assert.equal(encounter.serialize(), before);
  }
  encounter.stepMany(4090);
  const nearEnd = encounter.serialize();
  assert.throws(() => encounter.stepMany(7), /encounter bound/u);
  assert.equal(encounter.serialize(), nearEnd);
});

test("combat status invisibility: full bounded run is deterministic", () => {
  const fixture = createInvisibilityFixture(
    [target(7, 1000, 0, 1_000_000)],
    [hide(2, 7), reveal(8, 7), hide(20, 7, 2)],
  );
  const left = new InvisibilityRevealEncounter(fixture);
  const right = new InvisibilityRevealEncounter(fixture);
  left.run();
  for (let index = 0; index < 4; index += 1) right.stepMany(1024);
  assert.equal(left.state.tick, 4096);
  assert.equal(left.serialize(), right.serialize());
  assert.ok(left.replay.length <= 8192);
});
