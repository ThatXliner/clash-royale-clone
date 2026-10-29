import assert from "node:assert/strict";
import test from "node:test";

import { createSessionTroopWitness } from "../src/content/session-troop-roster.js";
import { createSessionTroopStatusRuntimeProfiles } from "../src/content/session-troop-status-runtime-profiles.js";
import { BattleCombat } from "../src/sim/battle-combat.js";
import { LiveBattle, parseLiveBattleSetup } from "../src/sim/live-battle.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function healingWitness() {
  const dawn = createSessionTroopWitness("dawnmender");
  const bloom = createSessionTroopWitness("bloom-wisp");
  const roster = [
    dawn.roster.find(({ id }) => id === "dawnmender"),
    bloom.roster.find(({ id }) => id === "bloom-wisp"),
    ...dawn.roster.filter(({ id }) => id !== "dawnmender").slice(0, 6),
  ];
  const questionKeys = new Set();
  function collect(value) {
    if (value === null || typeof value !== "object") return;
    if (typeof value.questionKey === "string") questionKeys.add(value.questionKey);
    for (const child of Object.values(value)) collect(child);
  }
  collect(roster);
  const questions = [...new Map([...dawn.questions, ...bloom.questions]
    .filter(({ key }) => questionKeys.has(key)).map((record) => [record.key, record])).values()]
    .sort((left, right) => left.key.localeCompare(right.key));
  return { initialWindupTicks: dawn.initialWindupTicks, questions, roster };
}

function makeBattle() {
  const battle = new LiveBattle(parseLiveBattleSetup(canonical(healingWitness())), undefined,
    canonical(createSessionTroopStatusRuntimeProfiles()));
  for (const [sequence, cardId, side, y] of [
    [0, "dawnmender", "south", 14_500],
    [1, "bloom-wisp", "north", 17_500],
  ]) {
    battle.scheduleDeploy(canonical({ cardId, point: { x: 3_500, y }, sequence, side, tick: 0 }));
  }
  battle.step();
  return battle;
}

function status(source, tick, commandId = 7) {
  return canonical({ actionId: "heal", commandId, point: null, side: source.side,
    sourceId: source.id, targetId: source.id, tick, type: "status" });
}

test("heal identities: opposing local command IDs both resolve with their own health receipt", () => {
  const battle = makeBattle();
  const sources = battle.state.units;
  assert.equal(sources.length, 2);
  assert.notEqual(sources[0].maxHealth, sources[1].maxHealth,
    "distinct source maxima make cross-wired receipts observable");
  for (const source of sources) battle.scheduleTroopStatus(status(source, battle.state.tick));
  const restored = LiveBattle.restore(battle.serialize());
  const events = battle.step();
  const restoredEvents = restored.step();
  assert.deepEqual(restoredEvents, events);
  const heals = events.filter(({ type }) => type === "heal");
  const receipts = events.filter(({ type }) => type === "troop-status-receipt");
  assert.equal(heals.length, 2);
  assert.equal(receipts.length, 2);
  for (const source of sources) {
    const heal = heals.find(({ sourceId }) => sourceId === source.id);
    const receipt = receipts.find(({ sourceId }) => sourceId === source.id);
    assert.ok(heal);
    assert.ok(receipt);
    assert.equal(heal.commandId, 7);
    assert.equal(receipt.commandId, 7);
    assert.equal(receipt.targetId, source.id);
    assert.equal(receipt.currentHealth, heal.currentHealth);
    assert.equal(receipt.currentHealth, source.maxHealth);
    assert.equal(receipt.appliedAmount, 0);
    assert.equal(receipt.status, "capped");
  }
  assert.equal(restored.serialize(), battle.serialize());
  battle.stepMany(3);
  restored.stepMany(3);
  assert.equal(restored.serialize(), battle.serialize());
});

test("heal identities: duplicate player identity still rejects atomically", () => {
  const battle = makeBattle();
  const source = battle.state.units.find(({ side }) => side === "south");
  const command = status(source, battle.state.tick);
  battle.scheduleTroopStatus(command);
  const before = battle.serialize();
  assert.throws(() => battle.scheduleTroopStatus(command), /duplicate/u);
  assert.equal(battle.serialize(), before);
});

function unit(id, side, maxHealth) {
  return { cadenceTicks: 60, damage: 0, delivery: "melee", deployTicks: 0,
    firstHitTicks: 0, id, layer: "ground", maxHealth, position: { x: id * 1_000, y: 0 },
    projectileSpeed: null, radius: 100, reach: 0, side, sightRange: 0, targetMode: "none" };
}

function boundary(tick, unitHeals, externalHits = []) {
  return { externalHits, externalProjectiles: [], structures: [], tick,
    unitControls: [], unitHeals };
}

test("heal identities: distinct sources heal once and duplicate ingress remains atomic", () => {
  const battle = new BattleCombat({ units: [unit(1, "south", 100), unit(2, "north", 200)] });
  battle.stepBoundary(boundary(0, [], [
    { damage: 30, delivery: "melee", sourceId: "fixture-damage-one", targetUnitId: 1 },
    { damage: 80, delivery: "melee", sourceId: "fixture-damage-two", targetUnitId: 2 },
  ]));
  const heals = [
    { amount: 10, commandId: 7, sourceId: 1, targetUnitId: 1 },
    { amount: 50, commandId: 7, sourceId: 2, targetUnitId: 2 },
  ];
  const before = battle.serialize();
  assert.throws(() => battle.stepBoundary(boundary(1, [heals[0], heals[0]])), /unique/u);
  assert.equal(battle.serialize(), before);
  const restored = BattleCombat.restore(before);
  const events = battle.stepBoundary(boundary(1, heals));
  const restoredEvents = restored.stepBoundary(boundary(1, [...heals].reverse()));
  assert.deepEqual(restoredEvents, events);
  assert.deepEqual(events.filter(({ type }) => type === "heal")
    .map(({ sourceId, appliedAmount, currentHealth }) => [sourceId, appliedAmount, currentHealth]),
  [[1, 10, 80], [2, 50, 170]]);
  assert.equal(restored.serialize(), battle.serialize());
});
