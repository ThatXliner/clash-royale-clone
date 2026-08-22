import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CrownTowerBattle,
  TOWER_LIVE_SHOT_DELIVERY,
} from "../src/sim/towers.js";

const create = (windups = { central: 0, lane: 0 }) =>
  new CrownTowerBattle({ initialWindupTicks: windups });
const candidate = ({
  alive = true,
  id,
  kind = "troop",
  layer = "ground",
  position = { x: 3500, y: 7500 },
  radius = 0,
  side,
  targetable = true,
}) => ({ alive, id, kind, layer, position, radius, side, targetable });
const liveInput = (candidates = [], damage = []) => ({ candidates, damage });
const legacyCandidate = ({ id, position = { x: 3500, y: 7500 } }) => ({
  alive: true,
  id,
  kind: "troop",
  layer: "ground",
  position,
  radius: 0,
  targetable: true,
});

function westShot(events) {
  return events.find(({ towerId, type }) =>
    towerId === "south:lane:west" && type === "shot-ready"
  );
}

test("tower live targets: ownership is required and friendly candidates are never targeted", () => {
  const towers = create();
  const events = towers.stepLive(liveInput([
    candidate({ id: 1, side: "south" }),
    candidate({ id: 2, side: "north" }),
  ]));
  assert.equal(westShot(events).targetId, 2);
  assert.equal(events.some(({ sourceSide, targetSide }) => sourceSide === targetSide), false);

  const onlyFriendly = create();
  assert.equal(westShot(onlyFriendly.stepLive(liveInput([
    candidate({ id: 3, side: "south" }),
  ]))), undefined);
});

test("tower live targets: layer, exact range boundary, liveness, and stable ties remain exact", () => {
  for (const layer of ["ground", "air"]) {
    const towers = create();
    assert.equal(westShot(towers.stepLive(liveInput([
      candidate({ id: 20, layer, side: "north" }),
    ]))).targetId, 20);
  }

  const boundary = create();
  assert.equal(westShot(boundary.stepLive(liveInput([
    candidate({ id: 9, position: { x: 3500, y: 0 }, side: "north" }),
    candidate({ id: 3, position: { x: 3500, y: 0 }, side: "north" }),
    candidate({ id: 1, position: { x: 3500, y: -1 }, side: "north" }),
  ]))).targetId, 3);

  const ineligible = create();
  assert.equal(westShot(ineligible.stepLive(liveInput([
    candidate({ alive: false, id: 1, side: "north" }),
    candidate({ id: 2, side: "north", targetable: false }),
    candidate({ id: 3, position: { x: 3500, y: -1 }, side: "north" }),
  ]))), undefined);
});

test("tower live targets: shot readiness carries explicit external projectile provenance", () => {
  const towers = create();
  const shot = westShot(towers.stepLive(liveInput([
    candidate({ id: 41, side: "north" }),
  ])));
  assert.deepEqual(shot, {
    attackSequence: 1,
    damage: 109,
    delivery: "projectile",
    direction: "tower-to-unit",
    projectileId: 1,
    projectileIdentity: {
      attackSequence: 1,
      direction: "tower-to-unit",
      projectileId: 1,
      sourceId: "south:lane:west",
    },
    projectileResolution: "external",
    projectileScope: "tower-to-unit",
    sequence: 1,
    sourceId: "south:lane:west",
    sourceSide: "south",
    targetId: 41,
    targetSide: "north",
    tick: 0,
    towerId: "south:lane:west",
    type: "shot-ready",
  });
  assert.deepEqual(TOWER_LIVE_SHOT_DELIVERY, {
    delivery: "projectile",
    projectileResolution: "external",
  });
  assert.equal(Object.isFrozen(TOWER_LIVE_SHOT_DELIVERY), true);
});

test("tower live targets: candidate ownership is immutable across target retention", () => {
  const towers = create({ central: 0, lane: 2 });
  const hostile = candidate({ id: 8, side: "north" });
  towers.stepLive(liveInput([hostile]));
  assert.equal(towers.state.towers.find(({ id }) => id === "south:lane:west").attack.targetId, 8);
  const before = towers.serialize();
  assert.throws(
    () => towers.stepLive(liveInput([{ ...hostile, side: "south" }])),
    /cannot change side/,
  );
  assert.equal(towers.serialize(), before);
  const state = towers.state.towers.find(({ id }) => id === "south:lane:west").attack;
  assert.equal(state.targetId, 8);
  assert.equal(state.phase, "winding");
});

test("tower live targets: legacy step remains strict and byte-compatible", () => {
  const towers = create();
  const legacy = liveInput([legacyCandidate({ id: 5 })]);
  const events = towers.step(legacy);
  assert.equal(westShot(events).targetId, 5);
  assert.equal(Object.hasOwn(westShot(events), "sourceSide"), false);
  assert.equal(JSON.parse(towers.serialize()).version, 3);
  assert.deepEqual(Object.keys(JSON.parse(towers.serialize()).steps[0]).sort(), ["candidates", "damage"]);

  const before = towers.serialize();
  assert.throws(() => towers.step(liveInput([candidate({ id: 6, side: "north" })])), /invalid shape/);
  assert.equal(towers.serialize(), before);
});

test("tower live targets: mixed chunking and restore preserve canonical v4 replay", () => {
  const inputs = Array.from({ length: 70 }, (_, tick) => liveInput([
    candidate({
      id: tick < 35 ? 11 : 12,
      layer: tick % 2 === 0 ? "air" : "ground",
      side: "north",
    }),
    candidate({ id: 99, side: "south" }),
  ], tick === 5 ? [{ amount: 1, towerId: "south:central" }] : []));
  const chunked = create({ central: 3, lane: 2 });
  const singles = create({ central: 3, lane: 2 });
  assert.deepEqual(
    chunked.stepManyLive(inputs),
    inputs.flatMap((input) => singles.stepLive(input)),
  );
  assert.equal(chunked.serialize(), singles.serialize());
  assert.equal(JSON.parse(chunked.serialize()).version, 4);
  assert.ok(JSON.parse(chunked.serialize()).steps.every(({ mode }) => mode === "side-aware"));

  const restored = CrownTowerBattle.restore(chunked.serialize());
  assert.equal(restored.serialize(), chunked.serialize());
  const tail = Array.from({ length: 20 }, () => liveInput([
    candidate({ id: 12, side: "north" }),
  ]));
  assert.deepEqual(restored.stepManyLive(tail), chunked.stepManyLive(tail));
  assert.equal(restored.serialize(), chunked.serialize());

  const mixed = create();
  mixed.step(liveInput([legacyCandidate({ id: 2 })]));
  mixed.stepLive(liveInput([candidate({ id: 3, side: "north" })]));
  const mixedBytes = mixed.serialize();
  assert.equal(JSON.parse(mixedBytes).version, 4);
  assert.deepEqual(JSON.parse(mixedBytes).steps.map(({ mode }) => mode), ["legacy", "side-aware"]);
  assert.equal(CrownTowerBattle.restore(mixedBytes).serialize(), mixedBytes);
});

test("tower live targets: hostile ownership, accessors, duplicates, and bounds reject atomically", () => {
  const towers = create();
  const before = towers.serialize();
  const missing = legacyCandidate({ id: 1 });
  assert.throws(() => towers.stepLive(liveInput([missing])), /invalid shape/);
  assert.equal(towers.serialize(), before);
  assert.throws(() => towers.stepLive(liveInput([candidate({ id: 1, side: "east" })])), /side is invalid/);
  assert.equal(towers.serialize(), before);
  assert.throws(() => towers.stepLive(liveInput([
    candidate({ id: 1, side: "north" }), candidate({ id: 1, side: "south" }),
  ])), /unique IDs/);
  assert.equal(towers.serialize(), before);

  const poison = candidate({ id: 2, side: "north" });
  Object.defineProperty(poison, "side", {
    enumerable: true,
    get() { throw new Error("must not execute"); },
  });
  assert.throws(() => towers.stepLive(liveInput([poison])), /enumerable data property/);
  assert.equal(towers.serialize(), before);

  assert.throws(() => towers.stepLive(liveInput(Array.from(
    { length: 257 }, (_, index) => candidate({ id: index + 1, side: "north" }),
  ))), /exceeds 256/);
  assert.equal(towers.serialize(), before);

  assert.throws(() => towers.stepManyLive(Array.from(
    { length: 4_097 },
    (_, index) => liveInput([candidate({ id: index + 1, side: "north" })]),
  )), /identities exceed 4096/);
  assert.equal(towers.serialize(), before);
});

test("tower live targets: v4 mode and ownership forgeries reject", () => {
  const towers = create();
  towers.stepLive(liveInput([candidate({ id: 4, side: "north" })]));
  const snapshot = JSON.parse(towers.serialize());

  const badMode = structuredClone(snapshot);
  badMode.steps[0].mode = "automatic";
  assert.throws(() => CrownTowerBattle.restore(JSON.stringify(badMode)), /mode is invalid/);

  const badSide = structuredClone(snapshot);
  badSide.steps[0].input.candidates[0].side = "west";
  assert.throws(() => CrownTowerBattle.restore(JSON.stringify(badSide)), /side is invalid/);

  const disguisedV3 = structuredClone(snapshot);
  disguisedV3.steps = disguisedV3.steps.map(({ input }) => ({ input, mode: "legacy" }));
  assert.throws(() => CrownTowerBattle.restore(JSON.stringify(disguisedV3)), /requires a side-aware step|invalid shape/);

  const accessor = structuredClone(snapshot);
  Object.defineProperty(accessor.steps[0].input.candidates[0], "side", {
    enumerable: true,
    get() { throw new Error("must not execute"); },
  });
  assert.throws(() => CrownTowerBattle.restore(JSON.stringify(accessor)), /must not execute/);
});

test("tower live targets: runtime remains isolated from reference and ambient nondeterminism", () => {
  const source = readFileSync(new URL("../src/sim/towers.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /reference\/|Math\.random|Date\.now|new Date|performance\.now/);
});
