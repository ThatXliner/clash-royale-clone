import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  AUDIO_CUE_TAXONOMY,
  AUDIO_EVENT_MAX_RECORDS,
  AUDIO_UNKNOWN_EVENT_POLICY,
  AudioEventProjection,
} from "../src/audio/audio-events.js";
import { DeathEffectsEncounter } from "../src/content/cards/death-effects.js";
import {
  DefensiveBuildingEncounter,
  createDefensiveBuildingFixture,
} from "../src/content/cards/buildings-defensive.js";
import { ResourceBuildingEncounter, createResourceBuildingFixture } from
  "../src/content/cards/buildings-resource.js";
import { RecoilEncounter, createRecoilSpecialFixture } from
  "../src/content/cards/special-movement-recoil.js";
import { ChainEncounter } from "../src/content/cards/special-projectiles-chain.js";
import { PelletEncounter } from "../src/content/cards/special-projectiles-pellets.js";
import { AreaDamageSystem } from "../src/sim/area-damage.js";
import { DamageSystem } from "../src/sim/damage.js";
import { MatchClock, MATCH_REGULATION_TICKS } from "../src/sim/match.js";
import { ProjectileCombat } from "../src/sim/projectile.js";

function envelope(event, sequence, tick = event.tick ?? 0) {
  return { event, sequence, tick };
}

function entity(overrides) {
  return {
    attackRange: 4_000, id: 1, kind: "troop", layer: "ground", maxHealth: 100,
    position: { x: 0, y: 0 }, radius: 500, targetMode: "air_and_ground",
    targetable: true, ...overrides,
  };
}

function projectileEvents() {
  const combat = new ProjectileCombat({ entities: [
    entity({ id: 10 }),
    entity({ id: 20, maxHealth: 30, position: { x: 2_000, y: 0 }, targetMode: "none" }),
  ] });
  combat.launch({ attackerId: 10, damage: 30, radius: 100, speed: 1_400, targetId: 20, tick: 0 });
  combat.step(0);
  return [combat.replay[0], ...combat.step(1)];
}

const TOWER_IDS = [
  "north:central", "north:lane:left", "north:lane:right",
  "south:central", "south:lane:left", "south:lane:right",
];

function initialTowers() {
  return TOWER_IDS.map((id) => ({ hitpoints: id.endsWith(":central") ? 4_824 : 3_052, id }));
}

function towerEvidence(changes = {}) {
  const towers = initialTowers().map((tower) => ({
    ...tower,
    hitpoints: Object.hasOwn(changes, tower.id) ? changes[tower.id] : tower.hitpoints,
  }));
  return { destroyedTowerIds: towers.filter(({ hitpoints }) => hitpoints === 0).map(({ id }) => id), towers };
}

test("audio events: representative runtime deploy, combat, death, tower, crown, and match records map exactly", () => {
  const damage = new DamageSystem();
  damage.add(7, 1);
  const directDamage = damage.damage(7, 1).events;

  const building = new ResourceBuildingEncounter(createResourceBuildingFixture([{
    destroyedOpposingLaneTowers: [], id: 1, position: { x: 9_001, y: 12_000 }, side: "south",
  }], [], { north: 0, south: 0 }));
  building.stepMany(60);
  const deploy = building.step()[0];
  building.stepMany(4_139);
  const destruction = building.step()[0];

  const combat = projectileEvents();
  const game = new MatchClock({ initialTowers: initialTowers() });
  game.scheduleTowerEvidence(2, towerEvidence({ "north:lane:left": 0 }));
  game.runToTick(3);
  game.runToTick(MATCH_REGULATION_TICKS);
  const matchEvents = game.eventLog;

  const events = [
    deploy,
    { tick: 0, type: "attack" },
    ...combat,
    ...directDamage.map((event) => ({ ...event, tick: 2 })),
    { tick: 2, towerId: "north:lane:left", type: "tower-destroyed" },
    destruction,
    ...matchEvents,
  ];
  events.sort((left, right) => (left.tick ?? 0) - (right.tick ?? 0));
  const projection = new AudioEventProjection();
  const records = projection.projectBatch(events.map((event, sequence) => envelope(event, sequence)));
  const families = records.filter(({ cueId }) => cueId !== null).map(({ family }) => family);
  assert.ok(families.includes("deploy"));
  assert.ok(families.includes("attack"));
  assert.ok(families.includes("launch"));
  assert.ok(families.includes("impact"));
  assert.ok(families.includes("damage"));
  assert.ok(families.includes("death"));
  assert.ok(families.includes("tower"));
  assert.ok(families.includes("crown"));
  assert.ok(families.includes("matchEnd"));
  assert.deepEqual(Object.keys(AUDIO_CUE_TAXONOMY).sort(), [
    "attack", "crown", "damage", "death", "deploy", "impact", "launch",
    "matchEnd", "overtime", "tiebreak", "tower",
  ]);
});

test("audio events: cumulative MatchClock evidence credits each destroyed tower identity once across restore", () => {
  const first = towerEvidence({ "north:lane:left": 0 });
  const second = towerEvidence({
    "north:lane:left": 0,
    "south:lane:right": 0,
  });
  const game = new MatchClock({ initialTowers: initialTowers() });
  game.scheduleTowerEvidence(2, first);
  game.scheduleTowerEvidence(3, first);
  game.scheduleTowerEvidence(4, second);
  game.runToTick(5);
  assert.deepEqual(game.state.crowns, { north: 1, south: 1 });
  const actual = game.eventLog.filter(({ type }) => type === "tower_evidence");
  assert.deepEqual(actual.map(({ destroyedTowerIds }) => destroyedTowerIds), [
    ["north:lane:left"],
    ["north:lane:left"],
    ["north:lane:left", "south:lane:right"],
  ]);

  const entries = actual.map((event, sequence) => envelope(event, sequence));
  const whole = new AudioEventProjection();
  whole.projectBatch(entries);
  assert.deepEqual(whole.records.map(({ cueId, reason }) => [cueId, reason]), [
    ["crown-award", "mapped"],
    [null, "no-new-destruction"],
    ["crown-award", "mapped"],
  ]);
  assert.deepEqual(whole.state.creditedTowerIds, [
    "north:lane:left", "south:lane:right",
  ]);
  assert.equal(whole.cues.filter(({ family }) => family === "crown").length, 2);

  const chunked = new AudioEventProjection();
  chunked.project(entries[0]);
  const restored = AudioEventProjection.restore(chunked.serialize());
  restored.projectBatch(entries.slice(1));
  assert.equal(restored.serialize(), whole.serialize());
  assert.deepEqual(restored.records, whole.records);
  assert.deepEqual(restored.state, whole.state);
  assert.deepEqual(restored.cues, whole.cues);
});

test("audio events: actual defensive-building target destruction maps to death", () => {
  const encounter = new DefensiveBuildingEncounter(createDefensiveBuildingFixture([{
    archetypeId: "ember-basin",
    destroyedOpposingLaneTowers: [],
    id: 1,
    position: { x: 9_000, y: 12_000 },
    side: "south",
  }], [{
    health: 222,
    id: 7,
    kind: "troop",
    layer: "ground",
    position: { x: 13_000, y: 12_000 },
    radius: 0,
    targetable: true,
  }]));
  encounter.stepMany(129);
  const actual = encounter.replay.filter(
    ({ type }) => type === "damage" || type === "target-destroyed",
  );
  assert.deepEqual(actual.map(({ type }) => type), ["damage", "target-destroyed"]);
  const projection = new AudioEventProjection();
  const records = projection.projectBatch(
    actual.map((event, sequence) => envelope(event, sequence)),
  );
  assert.deepEqual(records.map(({ family }) => family), ["damage", "death"]);
});

test("audio events: composed runtime vocabularies classify launch, contact, damage, and death without aliases", () => {
  const chain = new ChainEncounter();
  chain.run();
  const pellets = new PelletEncounter();
  pellets.run();
  const recoil = new RecoilEncounter();
  recoil.run();
  const targetKillRecoil = new RecoilEncounter(createRecoilSpecialFixture([
    { tick: 150, type: "target-killed" },
  ]));
  targetKillRecoil.run();
  const deathEffects = new DeathEffectsEncounter();
  deathEffects.run();
  const area = new AreaDamageSystem();
  area.add(91, 1);
  const areaEvents = area.resolve({
    center: { x: 0, y: 0 }, damage: 1, mode: "ground", radius: 0, tick: 0,
  }, [{
    alive: true, id: 91, kind: "troop", layer: "ground",
    position: { x: 0, y: 0 }, radius: 0, targetable: true,
  }]).events;
  const actual = [
    ...chain.replay,
    ...pellets.replay,
    ...recoil.replay,
    ...targetKillRecoil.replay,
    ...deathEffects.replay,
    ...areaEvents,
  ].sort((left, right) => left.tick - right.tick);
  const projection = new AudioEventProjection();
  projection.projectBatch(actual.map((event, sequence) => envelope(event, sequence)));
  const records = projection.records;
  const byType = new Map(records.map((record) => [record.type, record]));
  for (const type of [
    "attack-projectile-launched", "chain-start", "pellet-volley-launch",
    "target-kill-projectile-launched",
  ]) assert.equal(byType.get(type).family, "launch", type);
  for (const type of ["chain-hit", "hit", "pellet-contact"]) {
    assert.equal(byType.get(type).family, "impact", type);
  }
  assert.ok(records.some(({ family, type }) => type === "projectile-impact" && family === "impact"));
  assert.ok(records.some(({ cueId, reason, type }) =>
    type === "projectile-impact" && cueId === null && reason === "no-contact"));
  for (const type of [
    "chain-damage", "damage-applied", "pellet-aggregate-damage", "pellet-damage",
    "projectile-damage",
  ]) assert.equal(byType.get(type).family, "damage", type);
  assert.equal(byType.get("death").family, "death");
  assert.deepEqual(
    { cueId: byType.get("death-triggered").cueId, reason: byType.get("death-triggered").reason },
    { cueId: null, reason: "irrelevant" },
  );
});

test("audio events: overtime, tiebreak, match end, and explicit no-cue policies are stable", () => {
  const projection = new AudioEventProjection();
  const records = projection.projectBatch([
    envelope({ accepted: false, type: "play" }, 0, 1),
    envelope({ accepted: false, tick: 1, type: "card-play" }, 1, 1),
    envelope({ tick: 1, type: "moved", x: 3 }, 2, 1),
    envelope({ tick: 1, type: "future-event" }, 3, 1),
    envelope({ tick: 2, type: "overtime_started" }, 4, 2),
    envelope({ tick: 3, type: "tiebreak" }, 5, 3),
    envelope({ tick: 3, type: "match_end" }, 6, 3),
    envelope({ tick: 3, type: "cast" }, 7, 3),
    envelope({ tick: 3, type: "deploy" }, 8, 3),
    envelope({ tick: 3, type: "lethal" }, 9, 3),
  ]);
  assert.equal(AUDIO_UNKNOWN_EVENT_POLICY, "explicit-no-cue");
  assert.deepEqual(records.map(({ cueId, reason }) => [cueId, reason]), [
    [null, "rejected"], [null, "rejected"], [null, "irrelevant"], [null, "unknown"],
    ["phase-overtime", "mapped"], ["phase-tiebreak", "mapped"],
    ["match-complete", "mapped"],
    [null, "irrelevant"], [null, "irrelevant"], [null, "irrelevant"],
  ]);
  assert.equal(projection.cues.length, 3);
  assert.equal(projection.records.length, 10);
});

test("audio events: same-tick input order is sequence order and chunking is byte-identical", () => {
  const entries = [
    envelope({ tick: 4, type: "attack" }, 0, 4),
    envelope({ tick: 4, type: "launch" }, 1, 4),
    envelope({ status: "contact", tick: 4, type: "impact" }, 2, 4),
    envelope({ tick: 4, type: "attack-contact" }, 3, 4),
    envelope({ amount: 9, tick: 5, type: "damage" }, 4, 5),
  ];
  const whole = new AudioEventProjection();
  whole.projectBatch(entries);
  const chunked = new AudioEventProjection();
  chunked.projectBatch(entries.slice(0, 1));
  chunked.projectBatch(entries.slice(1, 3));
  chunked.projectBatch(entries.slice(3));
  assert.deepEqual(whole.records.map(({ sequence }) => sequence), [0, 1, 2, 3, 4]);
  assert.equal(whole.records[3].family, "impact");
  assert.equal(chunked.serialize(), whole.serialize());
  assert.deepEqual(chunked.records, whole.records);
});

test("audio events: restore continues with byte-identical isolated frozen outputs", () => {
  const projection = new AudioEventProjection();
  projection.projectBatch([
    envelope({ tick: 1, type: "spawn" }, 0, 1),
    envelope({ tick: 2, type: "attack-ready" }, 1, 2),
  ]);
  const restored = AudioEventProjection.restore(projection.serialize());
  const next = envelope({ tick: 3, type: "death" }, 2, 3);
  assert.deepEqual(restored.project(next), projection.project(next));
  assert.equal(restored.serialize(), projection.serialize());
  assert.deepEqual(restored.records, projection.records);
  const records = restored.records;
  assert.ok(Object.isFrozen(records));
  assert.ok(records.every(Object.isFrozen));
  assert.notEqual(records, restored.records);
});

test("audio events: batches validate atomically and enforce ordering and capacity", () => {
  const projection = new AudioEventProjection();
  projection.project(envelope({ tick: 2, type: "spawn" }, 0, 2));
  const before = projection.serialize();
  assert.throws(() => projection.projectBatch([
    envelope({ tick: 2, type: "attack" }, 1, 2),
    envelope({ tick: 1, type: "impact", status: "contact" }, 2, 1),
  ]), /must not move backwards/);
  assert.equal(projection.serialize(), before);
  assert.throws(() => projection.project(envelope({ tick: 3, type: "attack" }, 9, 3)), /sequence must be 1/);
  assert.equal(projection.serialize(), before);

  const huge = Array.from({ length: AUDIO_EVENT_MAX_RECORDS + 1 }, (_, sequence) =>
    envelope({ tick: 2, type: "moved" }, sequence, 2));
  assert.throws(() => new AudioEventProjection().projectBatch(huge), /cannot exceed/);

  const wideEvent = { type: "moved" };
  for (let index = 0; index < 127; index += 1) wideEvent[`field-${index}`] = "x".repeat(512);
  const oversizedHistory = Array.from({ length: 70 }, (_, sequence) =>
    envelope(wideEvent, sequence, 2));
  const bounded = new AudioEventProjection();
  assert.throws(() => bounded.projectBatch(oversizedHistory), /snapshot byte bound/);
  assert.equal(bounded.serialize(), '{"entries":[],"version":1}');
});

test("audio events: tower evidence identities and shapes reject exactly and atomically", () => {
  const accepted = (destroyedTowerIds, tick, sequence) => ({
    accepted: true,
    destroyedTowerIds,
    sequence,
    tick,
    type: "tower_evidence",
  });
  for (const ids of [
    ["north:lane:west"],
    ["north:lane:left", "north:lane:left"],
    ["south:lane:right", "north:lane:left"],
  ]) {
    assert.throws(
      () => new AudioEventProjection().project(envelope(accepted(ids, 1, 0), 0, 1)),
      /canonical match tower IDs/,
    );
  }
  assert.throws(
    () => new AudioEventProjection().project(envelope({
      ...accepted(["north:lane:left"], 1, 0),
      extra: true,
    }, 0, 1)),
    /invalid shape/,
  );
  assert.throws(
    () => new AudioEventProjection().project(envelope({
      accepted: false,
      destroyedTowerIds: ["north:lane:left"],
      sequence: 0,
      tick: 1,
      type: "tower_evidence",
    }, 0, 1)),
    /invalid shape/,
  );

  const projection = new AudioEventProjection();
  const before = projection.serialize();
  assert.throws(() => projection.projectBatch([
    envelope(accepted(["north:lane:left"], 1, 0), 0, 1),
    envelope(accepted(["north:lane:west"], 1, 1), 1, 1),
  ]), /canonical match tower IDs/);
  assert.equal(projection.serialize(), before);
  assert.deepEqual(projection.state.creditedTowerIds, []);
  assert.deepEqual(projection.records, []);
});

test("audio events: hostile shapes, accessors, symbols, prototypes, and unsafe data reject without observation", () => {
  let observed = 0;
  const accessor = { sequence: 0, tick: 0 };
  Object.defineProperty(accessor, "event", { enumerable: true, get() { observed += 1; return { type: "spawn" }; } });
  const projection = new AudioEventProjection();
  assert.throws(() => projection.project(accessor), /data property/);
  assert.equal(observed, 0);
  assert.throws(() => projection.project({ event: { type: "spawn" }, sequence: 0, tick: -1 }), /in-range/);
  assert.throws(() => projection.project({ event: { type: "spawn", tick: 1 }, sequence: 0, tick: 0 }), /must match/);
  assert.throws(() => projection.project({ event: { type: "spawn", value: 0.5 }, sequence: 0, tick: 0 }), /safe integers/);
  const unsafeKey = { type: "spawn" };
  Object.defineProperty(unsafeKey, "__proto__", { enumerable: true, value: null });
  assert.throws(() => projection.project({ event: unsafeKey, sequence: 0, tick: 0 }), /unsafe key/);
  assert.throws(() => projection.project({ event: Object.assign(Object.create({}), { type: "spawn" }), sequence: 0, tick: 0 }), /canonical data/);
  assert.throws(() => projection.project({ event: { type: "spawn", [Symbol("x")]: 1 }, sequence: 0, tick: 0 }), /canonical data/);
  assert.throws(() => projection.project({ event: { type: "Spawn" }, sequence: 0, tick: 0 }), /canonical event type/);
  assert.equal(projection.serialize(), '{"entries":[],"version":1}');
});

test("audio events: snapshots reject noncanonical, malformed, and oversized encodings atomically", () => {
  assert.throws(() => AudioEventProjection.restore("{}"), /invalid shape/);
  assert.throws(() => AudioEventProjection.restore('{"version":1,"entries":[]}'), /canonical encoding/);
  assert.throws(() => AudioEventProjection.restore('{"entries":[],"version":2}'), /unsupported/);
  assert.throws(() => AudioEventProjection.restore("x".repeat(4_194_305)), /byte bound/);
  const valid = new AudioEventProjection();
  valid.project(envelope({ tick: 1, type: "spawn" }, 0, 1));
  const forged = JSON.parse(valid.serialize());
  forged.entries[0].sequence = 2;
  assert.throws(() => AudioEventProjection.restore(JSON.stringify(forged)), /sequence must be 0/);
});

test("audio events: two fresh Node processes produce identical cue and snapshot bytes", () => {
  const source = `
    import { AudioEventProjection } from ${JSON.stringify(new URL("../src/audio/audio-events.js", import.meta.url).href)};
    const p = new AudioEventProjection();
    p.projectBatch([
      {event:{tick:2,type:"spawn"},sequence:0,tick:2},
      {event:{tick:2,type:"attack"},sequence:1,tick:2},
      {event:{status:"contact",tick:3,type:"impact"},sequence:2,tick:3}
    ]);
    process.stdout.write(JSON.stringify({cues:p.cues,snapshot:p.serialize()}));
  `;
  const run = () => spawnSync(process.execPath, ["--input-type=module", "--eval", source], { encoding: "utf8" });
  const first = run();
  const second = run();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  assert.ok(first.stdout.length > 100);
});
