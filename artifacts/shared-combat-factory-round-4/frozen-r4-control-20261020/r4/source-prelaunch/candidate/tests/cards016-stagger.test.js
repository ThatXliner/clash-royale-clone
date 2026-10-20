import assert from "node:assert/strict";
import test from "node:test";

import { createSessionTroopWitness } from "../src/content/session-troop-roster.js";
import { PLAYABLE_CARD_IDS } from "../src/content/playable-roster.js";
import { BattleCombat } from "../src/sim/battle-combat.js";
import { LiveBattle, MAX_LIVE_BATTLE_UNITS } from "../src/sim/live-battle.js";

const GLOAMWING = "gloamwing-cluster";
const COPPERSHADE = "coppershade-flock";
const INTERVAL_TICKS = 6;
const SOUTH_POINT = Object.freeze({ x: 3_500, y: 14_500 });
const NORTH_POINT = Object.freeze({ x: 3_500, y: 17_500 });

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function swarmSetup(cardId) {
  const cardIds = [cardId, ...PLAYABLE_CARD_IDS.filter((id) => id !== cardId).slice(0, 7)];
  const cards = new Map();
  const questions = new Map();
  for (const id of cardIds) {
    const witness = createSessionTroopWitness(id);
    for (const card of witness.roster) cards.set(card.id, card);
    for (const question of witness.questions) {
      const previous = questions.get(question.key);
      if (previous !== undefined) assert.deepEqual(question, previous);
      else questions.set(question.key, question);
    }
  }
  const roster = cardIds.map((id) => {
    const card = cards.get(id);
    assert.ok(card, `source witness includes ${id}`);
    return card;
  });
  const referencedQuestionKeys = new Set(roster.flatMap(({ entities }) => entities.flatMap((entity) => [
    ...Object.values(entity).filter((value) => value?.kind === "question")
      .map(({ questionKey }) => questionKey),
    ...(entity.sourceConfidencePolicy?.fields ?? []).map(({ questionKey }) => questionKey),
  ])));
  const selectedQuestions = [...referencedQuestionKeys].sort().map((key) => {
    const question = questions.get(key);
    assert.ok(question, `source witness closes ${key}`);
    return question;
  });
  return canonical({
    initialWindupTicks: { central: 0, lane: 0 },
    questions: selectedQuestions,
    roster,
  });
}

function deployedBattle(cardId) {
  const battle = new LiveBattle(swarmSetup(cardId));
  battle.scheduleDeploy(canonical({
    cardId,
    point: SOUTH_POINT,
    sequence: 0,
    side: "south",
    tick: 0,
  }));
  battle.scheduleDeploy(canonical({
    cardId,
    point: NORTH_POINT,
    sequence: 1,
    side: "north",
    tick: 0,
  }));
  return battle;
}

function scheduledHistory(serialized) {
  const live = JSON.parse(serialized);
  const tower = JSON.parse(live.battle);
  return BattleCombat.restore(tower.combat).state.pendingSpawns
    .map(({ id, tick }) => ({ id, tick }));
}

function forgeScheduledHistory(serialized, mutate) {
  const live = JSON.parse(serialized);
  const tower = JSON.parse(live.battle);
  const combat = JSON.parse(tower.combat);
  mutate(combat.history.filter(({ type }) => type === "schedule-spawn"));
  tower.combat = canonical(combat);
  live.battle = canonical(tower);
  return canonical(live);
}

function combatUnit(id) {
  return {
    cadenceTicks: 60,
    damage: 0,
    delivery: "melee",
    deployTicks: 0,
    firstHitTicks: 0,
    id,
    layer: "ground",
    maxHealth: 100,
    position: { x: id, y: 0 },
    projectileSpeed: null,
    radius: 100,
    reach: 800,
    side: id % 2 === 0 ? "north" : "south",
    sightRange: 5_000,
    targetMode: "none",
  };
}

for (const [cardId, count] of [[GLOAMWING, 5], [COPPERSHADE, 6]]) {
  test(`${cardId} births one member per sourced six-tick interval on both sides and restores at every boundary`, () => {
    const battle = deployedBattle(cardId);
    const idsBySide = new Map();
    const expectedBirthTick = new Map();
    const born = new Set();
    const lastBirthTick = INTERVAL_TICKS * (count - 1);

    for (let tick = 0; tick <= lastBirthTick; tick += 1) {
      const checkpoint = battle.serialize();
      const restored = LiveBattle.restore(checkpoint);
      assert.equal(restored.serialize(), checkpoint, `${cardId} snapshot at tick ${tick}`);
      assert.deepEqual(restored.state, battle.state, `${cardId} restored state at tick ${tick}`);

      const events = battle.step();
      assert.deepEqual(restored.step(), events,
        `${cardId} restored and original transitions agree at tick ${tick}`);
      const deployments = events.filter(({ type }) => type === "deployed");
      for (const deployment of deployments) {
        idsBySide.set(deployment.side, deployment.entityIds);
        deployment.entityIds.forEach((id, memberIndex) => {
          expectedBirthTick.set(id, INTERVAL_TICKS * memberIndex);
        });
      }

      const bornThisTick = events.filter(({ type }) => type === "spawn").map(({ id }) => id).sort((a, b) => a - b);
      const expectedThisTick = [...expectedBirthTick]
        .filter(([, birthTick]) => birthTick === tick).map(([id]) => id).sort((a, b) => a - b);
      assert.deepEqual(bornThisTick, expectedThisTick,
        `${cardId} actual spawn events occur on their exact sourced ticks`);
      for (const id of bornThisTick) born.add(id);

      const sideCounts = Object.fromEntries(["north", "south"].map((side) => [
        side,
        battle.state.units.filter((unit) => unit.cardId === cardId && unit.side === side).length,
      ]));
      const expectedCount = Math.min(count, 1 + Math.floor(tick / INTERVAL_TICKS));
      assert.deepEqual(sideCounts, { north: expectedCount, south: expectedCount },
        `${cardId} state contains only members born by tick ${tick}`);

      for (const target of events.filter(({ type }) => type === "target")) {
        assert.ok(born.has(target.id), `${cardId} pending unit cannot acquire a target`);
        assert.ok(born.has(target.targetId), `${cardId} pending unit cannot be targeted`);
      }
      for (const event of events.filter(({ type }) => type === "damage" || type === "attack")) {
        for (const id of [event.attackerId, event.sourceId, event.targetId]) {
          if (Number.isSafeInteger(id) && expectedBirthTick.has(id)) {
            assert.ok(born.has(id), `${cardId} pending member ${id} cannot enter combat`);
          }
        }
      }

      const pendingRecords = scheduledHistory(battle.serialize());
      const expectedRecords = [...expectedBirthTick]
        .filter(([, birthTick]) => birthTick > tick)
        .map(([id, birthTick]) => ({ id, tick: birthTick })).sort((a, b) => a.tick - b.tick || a.id - b.id);
      assert.deepEqual(pendingRecords, expectedRecords,
        `${cardId} serialized queue records each future birth exactly once`);
    }

    assert.deepEqual([...idsBySide.keys()].sort(), ["north", "south"]);
    assert.equal(expectedBirthTick.size, count * 2);
    const finalSnapshot = battle.serialize();
    assert.equal(LiveBattle.restore(finalSnapshot).serialize(), finalSnapshot);

    const forgedTick = forgeScheduledHistory(finalSnapshot, (records) => {
      records[0].command.tick += 1;
    });
    assert.throws(() => LiveBattle.restore(forgedTick), /causal|diverge|tick|snapshot/u,
      `${cardId} forged queue time is rejected by restore replay`);
    const duplicateId = forgeScheduledHistory(finalSnapshot, (records) => {
      records[1].command.id = records[0].command.id;
    });
    assert.throws(() => LiveBattle.restore(duplicateId), /already exists|unique|occupied|ID|causal/u,
      `${cardId} duplicate queued member IDs are rejected`);

    const chunked = deployedBattle(cardId);
    for (const size of [1, 5, 6, 2, 7, lastBirthTick + 1 - 21]) {
      if (chunked.state.tick >= lastBirthTick + 1) break;
      chunked.stepMany(Math.min(size, lastBirthTick + 1 - chunked.state.tick));
    }
    assert.equal(chunked.serialize(), finalSnapshot,
      `${cardId} one-tick and uneven chunk boundaries serialize identically`);
  });
}

test("scheduled combat births reject duplicate IDs and queue overflow atomically", () => {
  const duplicate = new BattleCombat();
  duplicate.scheduleSpawn({ ...combatUnit(1), tick: 6 });
  const beforeDuplicate = duplicate.serialize();
  assert.throws(() => duplicate.scheduleSpawn({ ...combatUnit(1), tick: 12 }), /already exists/u);
  assert.equal(duplicate.serialize(), beforeDuplicate);

  const bounded = new BattleCombat();
  for (let id = 1; id <= MAX_LIVE_BATTLE_UNITS; id += 1) {
    bounded.scheduleSpawn({ ...combatUnit(id), tick: 6 });
  }
  const beforeOverflow = bounded.serialize();
  assert.throws(() => bounded.scheduleSpawn({ ...combatUnit(MAX_LIVE_BATTLE_UNITS + 1), tick: 6 }),
    /unit bound/u);
  assert.equal(bounded.serialize(), beforeOverflow,
    "overflow rejection preserves the prior causal queue and history");
});
