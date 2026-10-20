import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MatchClock } from "../src/sim/match.js";
import { mapBattleTowerIdToMatchTowerId, mapLiveBattleTowerStateToMatchEvidence, TowerEvidenceBridge } from "../src/sim/tower-evidence.js";
import { CrownTowerBattle, TOWER_COMBAT_CONFIG } from "../src/sim/towers.js";

const noInput = () => ({ candidates: [], damage: [] });
const battle = () => new CrownTowerBattle({ initialWindupTicks: { central: 0, lane: 0 } });
const initialMatchTowers = () => [
  { hitpoints: TOWER_COMBAT_CONFIG.central.hitpoints, id: "north:central" },
  { hitpoints: TOWER_COMBAT_CONFIG.lane.hitpoints, id: "north:lane:left" },
  { hitpoints: TOWER_COMBAT_CONFIG.lane.hitpoints, id: "north:lane:right" },
  { hitpoints: TOWER_COMBAT_CONFIG.central.hitpoints, id: "south:central" },
  { hitpoints: TOWER_COMBAT_CONFIG.lane.hitpoints, id: "south:lane:left" },
  { hitpoints: TOWER_COMBAT_CONFIG.lane.hitpoints, id: "south:lane:right" },
];

function schedule(match, commands) {
  for (const command of commands) match.scheduleTowerEvidence(command.tick, command.evidence);
}

test("tower evidence: lane vocabulary mapping is explicit and total", () => {
  assert.deepEqual([
    "north:central", "north:lane:west", "north:lane:east",
    "south:central", "south:lane:west", "south:lane:east",
  ].map(mapBattleTowerIdToMatchTowerId), [
    "north:central", "north:lane:left", "north:lane:right",
    "south:central", "south:lane:left", "south:lane:right",
  ]);
  assert.throws(() => mapBattleTowerIdToMatchTowerId("north:lane:left"), /unknown/);
});

test("tower evidence: authoritative live tower state maps without a second battle", () => {
  const towers = battle().state.towers;
  assert.deepEqual(mapLiveBattleTowerStateToMatchEvidence(towers), {
    destroyedTowerIds: [],
    towers: initialMatchTowers(),
  });
  const hostile = structuredClone(towers);
  hostile[1].id = hostile[0].id;
  assert.throws(() => mapLiveBattleTowerStateToMatchEvidence(hostile), /invalid/u);
});

test("tower evidence: authoritative nonlethal replay updates HP without crowns", () => {
  const towers = battle();
  const actualEvents = towers.step({
    candidates: [],
    damage: [{ amount: 1, towerId: "north:central" }],
  });
  const bridge = new TowerEvidenceBridge();
  const commands = bridge.observe(towers.serialize());
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].provenance.events, actualEvents);
  assert.deepEqual(commands[0].causes, [{
    eventOrdinal: null,
    kind: "nonlethal-damage",
    source: "CrownTowerBattle:causal-step",
    sourceTowerId: "north:central",
    tick: 0,
    towerId: "north:central",
  }]);
  assert.deepEqual(commands[0].evidence.destroyedTowerIds, []);

  const match = new MatchClock({ initialTowers: initialMatchTowers() });
  schedule(match, commands);
  match.runToTick(1);
  assert.deepEqual(match.state.crowns, { north: 0, south: 0 });
  assert.equal(match.state.towers[0].hitpoints, TOWER_COMBAT_CONFIG.central.hitpoints - 1);
});

test("tower evidence: simultaneous activation and deaths preserve source order but map evidence canonically", () => {
  const towers = battle();
  const actualEvents = towers.step({
    candidates: [],
    damage: [
      { amount: TOWER_COMBAT_CONFIG.lane.hitpoints, towerId: "south:lane:east" },
      { amount: TOWER_COMBAT_CONFIG.lane.hitpoints, towerId: "north:lane:west" },
      { amount: TOWER_COMBAT_CONFIG.lane.hitpoints, towerId: "south:lane:west" },
      { amount: TOWER_COMBAT_CONFIG.lane.hitpoints, towerId: "north:lane:east" },
    ],
  });
  const commands = new TowerEvidenceBridge().observe(towers.serialize());
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].provenance.events, actualEvents);
  assert.deepEqual(actualEvents.map(({ type, towerId, cause = null }) => ({ cause, towerId, type })), [
    { cause: "friendly-lane-destroyed", towerId: "north:central", type: "tower-activated" },
    { cause: "friendly-lane-destroyed", towerId: "south:central", type: "tower-activated" },
    { cause: null, towerId: "north:lane:east", type: "tower-destroyed" },
    { cause: null, towerId: "north:lane:west", type: "tower-destroyed" },
    { cause: null, towerId: "south:lane:east", type: "tower-destroyed" },
    { cause: null, towerId: "south:lane:west", type: "tower-destroyed" },
  ]);
  assert.deepEqual(commands[0].causes.map(({ eventOrdinal, towerId }) => ({ eventOrdinal, towerId })), [
    { eventOrdinal: 3, towerId: "north:lane:left" },
    { eventOrdinal: 2, towerId: "north:lane:right" },
    { eventOrdinal: 5, towerId: "south:lane:left" },
    { eventOrdinal: 4, towerId: "south:lane:right" },
  ]);
  assert.deepEqual(commands[0].evidence.destroyedTowerIds, [
    "north:lane:left", "north:lane:right", "south:lane:left", "south:lane:right",
  ]);
});

test("tower evidence: every activation, destruction, and shot event is the replayed tower event", () => {
  const towers = battle();
  const observed = [];
  observed.push(towers.step({
    candidates: [{
      alive: true,
      id: 7,
      kind: "troop",
      layer: "ground",
      position: { x: 3500, y: 7000 },
      radius: 0,
      targetable: true,
    }],
    damage: [{ amount: 1, towerId: "south:central" }],
  }));
  observed.push(towers.step({
    candidates: [],
    damage: [{ amount: TOWER_COMBAT_CONFIG.lane.hitpoints, towerId: "north:lane:east" }],
  }));
  const bridge = new TowerEvidenceBridge();
  bridge.observe(towers.serialize());
  assert.deepEqual(bridge.state.provenance.map(({ events }) => events), observed);
  assert.ok(observed.flat().some(({ type }) => type === "tower-activated"));
  assert.ok(observed.flat().some(({ type }) => type === "tower-destroyed"));
  assert.ok(observed.flat().some(({ type }) => type === "shot-ready"));
});

test("tower evidence: real tower replay schedules exact MatchClock lane and central awards once", () => {
  const towers = battle();
  const bridge = new TowerEvidenceBridge();
  const match = new MatchClock({ initialTowers: initialMatchTowers() });
  towers.step({
    candidates: [],
    damage: [{ amount: TOWER_COMBAT_CONFIG.lane.hitpoints, towerId: "north:lane:west" }],
  });
  schedule(match, bridge.observe(towers.serialize()));
  match.runToTick(1);
  assert.deepEqual(match.state.crowns, { north: 0, south: 1 });

  towers.step({
    candidates: [],
    damage: [{ amount: TOWER_COMBAT_CONFIG.central.hitpoints, towerId: "north:central" }],
  });
  const central = bridge.observe(towers.serialize());
  schedule(match, central);
  match.runToTick(2);
  assert.deepEqual(match.state.crowns, { north: 0, south: 3 });
  assert.equal(match.state.result.reason, "central_destroyed");

  const restored = TowerEvidenceBridge.restore(bridge.serialize());
  assert.deepEqual(restored.observe(towers.serialize()), []);
  assert.equal(restored.serialize(), bridge.serialize());
  assert.deepEqual(restored.state.provenance, bridge.state.provenance);
});

test("tower evidence: appended chunks and restore reproduce bytes, commands, and provenance", () => {
  const left = battle();
  const right = battle();
  const whole = new TowerEvidenceBridge();
  let chunked = new TowerEvidenceBridge();
  const inputs = [
    noInput(),
    { candidates: [], damage: [{ amount: 17, towerId: "south:lane:east" }] },
    noInput(),
    { candidates: [], damage: [{ amount: TOWER_COMBAT_CONFIG.lane.hitpoints, towerId: "north:lane:west" }] },
  ];
  for (const input of inputs) {
    left.step(input);
    right.step(input);
    assert.deepEqual(chunked.observe(right.serialize()), whole.observe(left.serialize()));
    chunked = TowerEvidenceBridge.restore(chunked.serialize());
    assert.equal(chunked.serialize(), whole.serialize());
    assert.deepEqual(chunked.state, whole.state);
  }
});

test("tower evidence: missing, false, reversed, and spurious caller event streams have no API", () => {
  const towers = battle();
  towers.step({
    candidates: [],
    damage: [{ amount: TOWER_COMBAT_CONFIG.lane.hitpoints, towerId: "south:lane:west" }],
  });
  const bridge = new TowerEvidenceBridge();
  const before = bridge.serialize();
  for (const forgedEvents of [
    [],
    [{ cause: "damaged", tick: 0, towerId: "south:central", type: "tower-activated" }],
    [
      { tick: 0, towerId: "south:lane:west", type: "tower-destroyed" },
      { cause: "friendly-lane-destroyed", tick: 0, towerId: "south:central", type: "tower-activated" },
    ],
    [{ damage: 999, sequence: 1, targetId: 8, tick: 0, towerId: "south:lane:west", type: "shot-ready" }],
  ]) {
    assert.throws(() => bridge.observe({ battleSnapshot: towers.serialize(), events: forgedEvents }), /must be a string/);
    assert.equal(bridge.serialize(), before);
  }
  const commands = bridge.observe(towers.serialize());
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].provenance.events.map(({ type }) => type), ["tower-activated", "tower-destroyed"]);
});

test("tower evidence: noncausal adjacent snapshots and hostile bytes reject atomically", () => {
  const accepted = battle();
  accepted.step(noInput());
  const bridge = new TowerEvidenceBridge();
  bridge.observe(accepted.serialize());
  const before = bridge.serialize();

  const divergent = battle();
  divergent.step({ candidates: [], damage: [{ amount: 1, towerId: "north:central" }] });
  assert.throws(() => bridge.observe(divergent.serialize()), /append to the exact prior replay/);
  assert.equal(bridge.serialize(), before);

  const shorter = battle();
  assert.throws(() => bridge.observe(shorter.serialize()), /append to the exact prior replay/);
  assert.equal(bridge.serialize(), before);

  assert.throws(() => bridge.observe(JSON.stringify(JSON.parse(accepted.serialize()), null, 2)), /canonical bytes/);
  assert.throws(() => bridge.observe("{"), /valid JSON/);
  assert.equal(bridge.serialize(), before);
});

test("tower evidence: bridge snapshots are canonical and returned evidence is frozen", () => {
  const towers = battle();
  towers.step(noInput());
  const bridge = new TowerEvidenceBridge();
  bridge.observe(towers.serialize());
  const bytes = bridge.serialize();
  assert.equal(TowerEvidenceBridge.restore(bytes).serialize(), bytes);
  assert.throws(() => TowerEvidenceBridge.restore(JSON.stringify(JSON.parse(bytes), null, 2)), /canonical bytes/);
  assert.throws(() => TowerEvidenceBridge.restore(JSON.stringify({ battleSnapshot: null, version: 1 })), /version/);
  const view = bridge.state;
  assert.equal(Object.isFrozen(view.provenance), true);
  assert.equal(Object.isFrozen(view.evidence.towers), true);
  assert.throws(() => { view.evidence.towers[0].hitpoints = 0; }, TypeError);
});

test("tower evidence: runtime has no reference import or ambient nondeterminism", () => {
  const source = readFileSync(new URL("../src/sim/tower-evidence.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /reference\/|Math\.random|Date\.now|new Date|performance\.now/);
});
