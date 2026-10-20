import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  UndergroundTravelBuildingEncounter,
  createUndergroundTravelBuildingCatalog,
  createUndergroundTravelBuildingCorpusRecords,
  createUndergroundTravelBuildingFixture,
  createUndergroundTravelBuildingQuestionRecords,
} from "../src/content/cards/buildings-travel.js";

const ORIGIN = Object.freeze({ x: 2_500, y: 10_500 });
const DESTINATION = Object.freeze({ x: 2_500, y: 12_500 });

function building(overrides = {}) {
  return {
    destination: { ...DESTINATION },
    destroyedOpposingLaneTowers: [],
    id: 1,
    origin: { ...ORIGIN },
    ownerId: 7,
    side: "south",
    ...overrides,
  };
}

function command(id, tick, type, overrides = {}) {
  return {
    amount: null,
    buildingId: 1,
    id,
    tick,
    type,
    ...overrides,
  };
}

function encounter(overrides = {}, commands = []) {
  return new UndergroundTravelBuildingEncounter(
    createUndergroundTravelBuildingFixture([building(overrides)], commands),
  );
}

function pinnedHash(relativePath, expected) {
  const source = readFileSync(new URL(relativePath, import.meta.url));
  assert.equal(createHash("sha256").update(source).digest("hex"), expected);
}

test("buildings travel: original catalog and conservative corpus are isolated", () => {
  const card = createUndergroundTravelBuildingCatalog()[0];
  assert.deepEqual({
    cost: card.cost, deploy: card.deployTimeTicks, first: card.firstHitTicks,
    hp: card.hitpoints, id: card.id, name: card.displayName,
  }, {
    cost: 4, deploy: 60, first: 12, hp: 1440,
    id: "burrow-rig", name: "Burrow Rig",
  });
  const corpus = createUndergroundTravelBuildingCorpusRecords();
  assert.deepEqual(Object.keys(corpus), [
    "cost", "deployTicks", "firstSpawnDelayTicks", "hitpoints",
  ]);
  assert.ok(Object.values(corpus).every((record) =>
    !record.authoritative && record.confidence === "unverified"));
  assert.ok(Object.isFrozen(corpus));
  assert.notEqual(corpus, createUndergroundTravelBuildingCorpusRecords());
});

test("buildings travel: every unsupported policy is an isolated frozen QUESTION", () => {
  const records = createUndergroundTravelBuildingQuestionRecords();
  assert.deepEqual(Object.keys(records).sort(), [
    "commandBoundaryOrder", "deploymentCompletionBoundary",
    "destinationPlacementPolicy", "emergenceBoundary",
    "emergenceSpawnDelayTicks", "emergenceSpawnPolicy", "interruptionPolicy",
    "lifetimeBoundary", "lifetimeTicks", "ordinaryDamageWhileUntargetable",
    "pathPolicy", "sameBoundaryDeathPolicy",
    "travelSpeedMillitilesPerSecond", "undergroundTargetabilityPolicy",
  ].sort());
  for (const [key, record] of Object.entries(records)) {
    assert.deepEqual(
      [record.authoritative, record.confidence, record.disposition, record.key],
      [false, "unverified", "question", key],
    );
    assert.ok(Object.isFrozen(record));
  }
  assert.throws(() => createUndergroundTravelBuildingQuestionRecords({}), /do not accept/);
});

test("buildings travel: deployment precedes exact underground movement and emergence", () => {
  pinnedHash(
    "../src/sim/deployment.js",
    "f22067c2bfbd1ccdad6f913a50efa19899c7ee4254ffac35b473e3fb8978b563",
  );
  pinnedHash(
    "../src/sim/movement.js",
    "0988abf424abf5edb9d4d4da1dfbfc9f4a56732c065436ee1fc04ccbdd667586",
  );
  pinnedHash(
    "../src/sim/pathfinding.js",
    "49729ea021c954e66b2fe0c6f027410974a2cb994f3d092e92a175d6af72d296",
  );
  const value = encounter();
  value.stepMany(60);
  assert.deepEqual(
    value.state.buildings[0],
    {
      ...value.state.buildings[0],
      phase: "deploying",
      position: ORIGIN,
      targetable: false,
      travelStartedTick: null,
    },
  );
  assert.deepEqual(value.step(), [{
    buildingId: 1,
    destination: DESTINATION,
    path: [ORIGIN, { x: 2_500, y: 11_500 }, DESTINATION],
    tick: 60,
    type: "underground-travel-started",
  }]);
  const moves = value.stepMany(80).filter(({ type }) => type === "underground-travel-moved");
  assert.deepEqual(moves.slice(0, 4).map(({ position }) => position), [
    { x: 2_500, y: 10_525 }, { x: 2_500, y: 10_550 },
    { x: 2_500, y: 10_575 }, { x: 2_500, y: 10_600 },
  ]);
  assert.equal(value.state.tick, 141);
  assert.equal(value.state.buildings[0].phase, "emerged");
  assert.equal(value.state.buildings[0].targetable, true);
  assert.deepEqual(value.state.buildings[0].position, DESTINATION);
  assert.deepEqual(value.replay.filter(({ type }) => type === "travel-building-emerged"), [{
    buildingId: 1, position: DESTINATION, tick: 140, type: "travel-building-emerged",
  }]);
});

test("buildings travel: emergence spawn has exact owner, placement, and timing", () => {
  const value = encounter();
  value.stepMany(153);
  assert.deepEqual(value.replay.filter(({ type }) => type === "travel-emergence-spawn"), [{
    buildingId: 1,
    ownerId: 7,
    position: DESTINATION,
    spawnId: "1:1",
    tick: 152,
    type: "travel-emergence-spawn",
  }]);
  assert.equal(value.state.buildings[0].spawnCount, 1);
  assert.equal(value.state.buildings[0].nextSpawnTick, null);
});

test("buildings travel: deploying and underground phases are untargetable", () => {
  const value = encounter({}, [
    command(1, 59, "damage-building", { amount: 500 }),
    command(2, 100, "damage-building", { amount: 500 }),
    command(3, 141, "damage-building", { amount: 500 }),
  ]);
  value.stepMany(142);
  assert.equal(value.state.buildings[0].health, 940);
  assert.deepEqual(
    value.replay.filter(({ type }) => type === "travel-damage-ignored")
      .map(({ tick }) => tick),
    [59, 100],
  );
  assert.deepEqual(
    value.replay.filter(({ type }) => type === "travel-building-damaged")
      .map(({ tick, healthAfter }) => ({ healthAfter, tick })),
    [{ healthAfter: 940, tick: 141 }],
  );
});

test("buildings travel: interruption and forced death suppress later effects", () => {
  for (const [type, tick, reason] of [
    ["interrupt-travel", 60, "interrupted"],
    ["kill-building", 140, "forced-death"],
    ["kill-building", 152, "forced-death"],
  ]) {
    const value = encounter({}, [command(1, tick, type)]);
    value.stepMany(200);
    assert.equal(value.state.buildings[0].phase, "dead");
    assert.deepEqual(
      value.replay.filter(({ type: eventType }) =>
        eventType === "travel-building-destroyed")
        .map(({ tick: eventTick, reason: eventReason }) => ({
          reason: eventReason, tick: eventTick,
        })),
      [{ reason, tick }],
    );
    assert.equal(
      value.replay.some(({ type: eventType, tick: eventTick }) =>
        eventTick >= tick && (
          eventType === "travel-building-emerged" ||
          eventType === "travel-emergence-spawn"
        )),
      false,
    );
  }
});

test("buildings travel: same-boundary command IDs are stable and command-first", () => {
  const value = encounter({}, [
    command(2, 141, "damage-building", { amount: 1000 }),
    command(3, 141, "damage-building", { amount: 440 }),
  ]);
  value.stepMany(142);
  assert.deepEqual(
    value.replay.filter(({ tick }) => tick === 141).map(({ type }) => type),
    ["travel-building-damaged", "travel-building-damaged", "travel-building-destroyed"],
  );
  assert.equal(value.state.buildings[0].phase, "dead");
});

test("buildings travel: path validation delegates blocked, off-grid, and outside failures", () => {
  assert.throws(
    () => encounter({ destination: { x: 8_500, y: 15_500 } }),
    /end is blocked/,
  );
  assert.throws(
    () => encounter({ destination: { x: 2_500, y: 12_000 } }),
    /navigation lattice/,
  );
  assert.throws(
    () => encounter({ destination: { x: -500, y: 500 } }),
    /inside the arena/,
  );
  assert.throws(
    () => encounter({ origin: { x: 2_500, y: 16_000 } }),
    /origin is illegal: river_excluded/,
  );
});

test("buildings travel: path tie, IDs, and setup order are deterministic", () => {
  const first = createUndergroundTravelBuildingFixture([
    building({ id: 9, ownerId: 9 }),
    building({ id: 2, ownerId: 2 }),
  ]);
  const second = createUndergroundTravelBuildingFixture([
    building({ id: 2, ownerId: 2 }),
    building({ id: 9, ownerId: 9 }),
  ]);
  const a = new UndergroundTravelBuildingEncounter(first);
  const b = new UndergroundTravelBuildingEncounter(second);
  a.stepMany(200);
  b.stepMany(200);
  assert.deepEqual(a.state, b.state);
  assert.deepEqual(a.replay, b.replay);
});

test("buildings travel: arbitrary chunks match single ticks and every phase restores", () => {
  const setup = createUndergroundTravelBuildingFixture([building()], [
    command(1, 153, "damage-building", { amount: 10 }),
  ]);
  const single = new UndergroundTravelBuildingEncounter(setup);
  for (let index = 0; index < 300; index += 1) single.step();
  const chunked = new UndergroundTravelBuildingEncounter(setup);
  for (const count of [17, 44, 1, 79, 63, 96]) chunked.stepMany(count);
  assert.deepEqual(chunked.state, single.state);
  assert.deepEqual(chunked.replay, single.replay);
  assert.equal(chunked.serialize(), single.serialize());

  for (let cut = 0; cut <= 300; cut += 1) {
    const original = new UndergroundTravelBuildingEncounter(setup);
    original.stepMany(cut);
    const bytes = original.serialize();
    const restored = UndergroundTravelBuildingEncounter.restore(bytes);
    assert.equal(restored.serialize(), bytes, `cut ${cut}`);
    original.stepMany(300 - cut);
    restored.stepMany(300 - cut);
    assert.equal(restored.serialize(), original.serialize(), `continuation ${cut}`);
  }
});

test("buildings travel: snapshots are canonical, causal, and hostile input rejects atomically", () => {
  const value = encounter();
  value.stepMany(100);
  const before = value.serialize();
  for (const count of [-1, 0.5, 4097]) {
    assert.throws(() => value.stepMany(count));
    assert.equal(value.serialize(), before);
  }
  assert.throws(() => UndergroundTravelBuildingEncounter.restore("{}"));
  assert.throws(() => UndergroundTravelBuildingEncounter.restore(
    before.replace('"version":1', '"version":2'),
  ));
  assert.throws(() => UndergroundTravelBuildingEncounter.restore(
    before.replace('"tick":100', '"tick":101'),
  ), /causal/);
  assert.throws(() => UndergroundTravelBuildingEncounter.restore(
    ` ${before}`,
  ), /canonical/);
  assert.throws(() => createUndergroundTravelBuildingFixture([building()], [
    command(2, 1, "kill-building"),
    command(1, 1, "kill-building"),
  ]), /increasing/);
  assert.throws(() => createUndergroundTravelBuildingFixture([
    building({ id: 1 }), building({ id: 1 }),
  ]), /unique/);
});

test("buildings travel: lifetime and replay bounds are exact", () => {
  const value = encounter({ destination: ORIGIN });
  value.stepMany(1860);
  assert.equal(value.state.buildings[0].alive, true);
  value.step();
  assert.deepEqual(value.replay.at(-1), {
    buildingId: 1,
    reason: "lifetime",
    tick: 1860,
    type: "travel-building-destroyed",
  });
  assert.throws(() => value.stepMany(4096), /encounter bound/);
});

test("buildings travel: runtime is original, deterministic, and excludes adjacent generation", () => {
  const source = readFileSync(
    new URL("../src/content/cards/buildings-travel.js", import.meta.url),
    "utf8",
  );
  for (const forbidden of [
    "reference/", "Math.random", "Date.now", "performance.now",
    "setTimeout", "setInterval", "randomUUID",
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  assert.equal(/\bgoblin\b/i.test(source), false);
  assert.equal(/\bdrill\b/i.test(source), false);
  assert.equal(/resource.?generation|generate.?resource/i.test(source), false);
});
