import assert from "node:assert/strict";
import test from "node:test";

import { BattleCombat } from "../src/sim/battle-combat.js";
import { LiveBattle, parseLiveBattleSetup } from "../src/sim/live-battle.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
} from "../src/content/playable-roster.js";

const FULL_MATCH_TICKS = 18_000;
const PRACTICAL_LIVE_BYTES = 4_194_304;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function legacyCombatSnapshot(serialized) {
  const current = JSON.parse(serialized);
  assert.equal(current.version, 2);
  assert.deepEqual(current.transcript, []);
  return canonical({ history: current.history, setup: current.setup, version: 1 });
}

function legacyTowerSnapshot(serialized) {
  const current = JSON.parse(serialized);
  assert.equal(current.version, 2);
  current.combat = legacyCombatSnapshot(current.combat);
  current.version = 1;
  return canonical(current);
}

function setup() {
  return parseLiveBattleSetup(canonical({
    initialWindupTicks: { central: 0, lane: 0 },
    questions: structuredClone(createPlayableRosterQuestionRecords()),
    roster: structuredClone(createPlayableRoster()),
  }));
}

function activeBattle() {
  const battle = new LiveBattle(setup());
  for (let index = 0; index < 4; index += 1) {
    battle.scheduleDeploy({
      cardId: "coilblade",
      point: { x: 3_500 + index * 500, y: 14_500 },
      sequence: index * 2,
      side: "south",
      tick: 0,
    });
    battle.scheduleDeploy({
      cardId: "coilblade",
      point: { x: 3_500 + index * 500, y: 17_500 },
      sequence: index * 2 + 1,
      side: "north",
      tick: 0,
    });
  }
  return battle;
}

test("game history cap: BattleCombat and empty LiveBattle cross tick 874 and full match", () => {
  const combat = new BattleCombat();
  combat.stepMany(FULL_MATCH_TICKS);
  const combatBytes = combat.serialize();
  assert.ok(Buffer.byteLength(combatBytes) < 16_384);
  assert.equal(BattleCombat.restore(combatBytes).serialize(), combatBytes);

  const battle = new LiveBattle(setup());
  battle.stepMany(874);
  assert.doesNotThrow(() => battle.serialize());
  battle.stepMany(FULL_MATCH_TICKS - 874);
  const bytes = battle.serialize();
  assert.ok(Buffer.byteLength(bytes) < PRACTICAL_LIVE_BYTES,
    `empty full-match snapshot was ${Buffer.byteLength(bytes)} bytes`);
  const restored = LiveBattle.restore(bytes);
  assert.equal(restored.serialize(), bytes);
  assert.deepEqual(restored.state, battle.state);
  assert.deepEqual(restored.replay, battle.replay);
});

test("game history cap: cuts around structural run boundaries restore and continue exactly", () => {
  const battle = new LiveBattle(setup());
  const cuts = new Set([255, 256, 257, 1_023, 1_024, 1_025]);
  const snapshots = new Map();
  for (let tick = 0; tick <= 1_026; tick += 1) {
    if (cuts.has(tick)) snapshots.set(tick, battle.serialize());
    if (tick < 1_026) battle.step(tick);
  }
  for (const [cut, bytes] of snapshots) {
    const restored = LiveBattle.restore(bytes);
    restored.step(cut);
    const expected = new LiveBattle(setup());
    expected.stepMany(cut + 1);
    assert.equal(restored.serialize(), expected.serialize(), `bytes at cut ${cut}`);
    assert.deepEqual(restored.state, expected.state, `state at cut ${cut}`);
    assert.deepEqual(restored.replay, expected.replay, `replay at cut ${cut}`);
  }
});

test("game history cap: eight active units complete, chunk, and restore a bounded full match", () => {
  const direct = activeBattle();
  direct.stepMany(FULL_MATCH_TICKS);
  const bytes = direct.serialize();
  assert.equal(direct.state.tick, FULL_MATCH_TICKS);
  assert.equal(direct.state.units.length, 8);
  assert.ok(direct.replay.some(({ type }) => type === "damage"));
  assert.ok(Buffer.byteLength(bytes) < PRACTICAL_LIVE_BYTES,
    `active full-match snapshot was ${Buffer.byteLength(bytes)} bytes`);

  const chunks = activeBattle();
  for (const count of [1, 255, 1_024, 3_333, 4_096, 9_291]) chunks.stepMany(count);
  assert.equal(chunks.serialize(), bytes);
  assert.deepEqual(chunks.state, direct.state);
  assert.deepEqual(chunks.replay, direct.replay);

  const restored = LiveBattle.restore(bytes);
  assert.equal(restored.serialize(), bytes);
  assert.deepEqual(restored.state, direct.state);
  assert.deepEqual(restored.replay, direct.replay);
});

test("game history cap: malformed compact runs and oversized tails reject", () => {
  const original = new LiveBattle(setup());
  original.stepMany(300);
  const before = original.serialize();
  const malformed = JSON.parse(before);
  malformed.transcript[0].ticks = 99_745;
  assert.throws(() => LiveBattle.restore(canonical(malformed)), /ticks|operation bound|tick bound/u);
  assert.equal(original.serialize(), before);

  const forgedCombat = JSON.parse(new BattleCombat().serialize());
  forgedCombat.transcript = [{ tick: 1, ticks: 1, type: "step-run" }];
  assert.throws(() => BattleCombat.restore(canonical(forgedCombat)), /noncausal/u);
});

test("game history cap: genuine nested Live, tower, and combat v1 witnesses upgrade", () => {
  const battle = new LiveBattle(setup());
  battle.stepMany(4);
  const current = JSON.parse(battle.serialize());
  const currentBattle = JSON.parse(current.battle);
  assert.equal(current.version, 2);
  assert.equal(currentBattle.version, 2);
  assert.equal(JSON.parse(currentBattle.combat).version, 2);

  const legacy = canonical({
    battle: legacyTowerSnapshot(current.battle),
    history: current.history,
    movements: current.movements,
    setup: current.setup,
    version: 1,
  });
  const restored = LiveBattle.restore(legacy);
  assert.deepEqual(restored.state, battle.state);
  assert.deepEqual(restored.replay, battle.replay);
  const upgraded = JSON.parse(restored.serialize());
  assert.equal(upgraded.version, 2);
  assert.equal(JSON.parse(upgraded.battle).version, 2);
  assert.equal(JSON.parse(JSON.parse(upgraded.battle).combat).version, 2);
  restored.stepMany(4);
  battle.stepMany(4);
  assert.equal(restored.serialize(), battle.serialize());

  current.version = 1;
  delete current.transcript;
  assert.throws(() => LiveBattle.restore(canonical(current)), /versions are mixed/u);

  const upgradedLegacy = JSON.parse(legacy);
  upgradedLegacy.version = 2;
  assert.throws(() => LiveBattle.restore(canonical(upgradedLegacy)), /invalid shape/u);
});
