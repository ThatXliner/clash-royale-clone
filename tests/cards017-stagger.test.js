import assert from "node:assert/strict";
import test from "node:test";

import { createSessionTroopWitness } from "../src/content/session-troop-roster.js";
import { createEditableGameSessionSetup } from "../src/content/editable-deck.js";
import { PLAYABLE_CARD_IDS } from "../src/content/playable-roster.js";
import { DeckCycle } from "../src/sim/deck.js";
import { BattleCombat } from "../src/sim/battle-combat.js";
import { GameSession } from "../src/sim/game-session.js";
import { LiveBattle, MAX_LIVE_BATTLE_UNITS } from "../src/sim/live-battle.js";
import { RLEnvironment } from "../src/rl/environment.js";

const INTERVAL_TICKS = 6;
const SOURCE_ID = "supercell-2020-06-02-multi-unit-deployment";
const STAGGERED_CARDS = Object.freeze([
  Object.freeze({ cardId: "briar-band", count: 6, componentCounts: [3, 3] }),
  Object.freeze({ cardId: "coppershade-flock", count: 6, componentCounts: [6] }),
  Object.freeze({ cardId: "duskwing-trio", count: 3, componentCounts: [3] }),
  Object.freeze({ cardId: "forgeguard", count: 5, componentCounts: [5] }),
  Object.freeze({ cardId: "gloamwing-cluster", count: 5, componentCounts: [5] }),
  Object.freeze({ cardId: "sunthread-pair", count: 2, componentCounts: [2] }),
  Object.freeze({ cardId: "thornscouts", count: 4, componentCounts: [4] }),
]);
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

function seedWithCardInBothHands(deck, cardId, requireNorth = true) {
  for (let seed = 0; seed < 10_000; seed += 1) {
    const south = new DeckCycle({ deck, seed: `${seed}:south` }).state.hand;
    const north = new DeckCycle({ deck, seed: `${seed}:north` }).state.hand;
    if (south.includes(cardId) && (north.includes(cardId) === requireNorth)) return seed;
  }
  assert.fail(`a deterministic opening hand exists for ${cardId} on both sides`);
}

function playerDeploy(session, cardId) {
  const slot = session.state.decks.south.hand.indexOf(cardId);
  assert.notEqual(slot, -1, `${cardId} is in the player opening hand`);
  return canonical({ cardId, commandId: 0, point: SOUTH_POINT, slot,
    tick: session.state.tick, type: "deploy" });
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

for (const { cardId, count, componentCounts } of STAGGERED_CARDS) {
  test(`${cardId} births members at each sourced 100 ms interval on both sides and restores at every boundary`, () => {
    const witness = createSessionTroopWitness(cardId);
    const target = witness.roster.find(({ id }) => id === cardId);
    assert.deepEqual(target.entities.map(({ count: entityCount }) => entityCount), componentCounts,
      `${cardId} source component counts are unchanged`);
    for (const entity of target.entities) {
      assert.deepEqual(entity.sourceConfidencePolicy.deploymentInterval, {
        milliseconds: 100, sourceId: SOURCE_ID, ticks: INTERVAL_TICKS,
      }, `${cardId}.${entity.archetypeId} carries the exact interval receipt`);
      assert.equal(entity.sourceConfidencePolicy.fields.length, 10,
        `${cardId}.${entity.archetypeId} retains explicit numeric QUESTIONS`);
      const questions = new Map(witness.questions.map((question) => [question.key, question]));
      for (const field of entity.sourceConfidencePolicy.fields) {
        const question = questions.get(field.questionKey);
        assert.ok(question, `${cardId}.${entity.archetypeId} closes ${field.questionKey}`);
        assert.equal(question.authoritative, false);
        assert.equal(question.confidence, "unverified");
        assert.equal(question.disposition, "question");
        assert.equal(question.value, field.valueEncoding === "target-mode-code"
          ? { buildings: 1, ground: 2, "ground-and-air": 3, structures: 4 }[entity[field.field]]
          : entity[field.field]);
      }
    }
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
      for (const side of ["north", "south"]) {
        const sideIds = idsBySide.get(side);
        let cardOffset = 0;
        for (const entity of target.entities) {
          for (let memberIndex = 0; memberIndex < entity.count; memberIndex += 1) {
            const id = sideIds[cardOffset + memberIndex];
            const unit = battle.state.units.find((candidate) => candidate.id === id);
            if (born.has(id)) {
              assert.equal(unit.archetypeId, entity.archetypeId);
              assert.equal(unit.memberIndex, memberIndex,
                `${cardId}.${entity.archetypeId} keeps component-local combat indices`);
            } else {
              assert.equal(unit, undefined, `${cardId} future member ${id} is not in battle state`);
            }
          }
          cardOffset += entity.count;
        }
      }

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

test("source receipts are required per component and reject forged interval data", () => {
  for (const { cardId } of STAGGERED_CARDS) {
    const witness = createSessionTroopWitness(cardId);
    const targetIndex = witness.roster.findIndex(({ id }) => id === cardId);
    const target = witness.roster[targetIndex];
    for (let index = 0; index < target.entities.length; index += 1) {
      const missing = structuredClone(witness);
      delete missing.roster[targetIndex].entities[index].sourceConfidencePolicy;
      assert.throws(() => new LiveBattle(canonical(missing)),
        /source confidence policy is missing or unexpected/u,
        `${cardId}.${target.entities[index].archetypeId} cannot omit its receipt`);

      const forged = structuredClone(witness);
      forged.roster[targetIndex].entities[index].sourceConfidencePolicy.deploymentInterval.ticks = 5;
      assert.throws(() => new LiveBattle(canonical(forged)), /deployment interval receipt diverges/u,
        `${cardId}.${target.entities[index].archetypeId} rejects a forged interval`);
    }
    if (cardId === "briar-band") {
      const swapped = structuredClone(witness);
      swapped.roster[targetIndex].entities[0].sourceConfidencePolicy =
        structuredClone(target.entities[1].sourceConfidencePolicy);
      assert.throws(() => new LiveBattle(canonical(swapped)), /field inventory diverges/u,
        "Briar Band receipts cannot be swapped between component identities");
    }
  }
});

test("skeleton exceptions and a singleton retain their existing immediate expansion", () => {
  for (const [cardId, count] of [["cinderlings", 3], ["cinder-host", 15], ["reedsting", 1]]) {
    const witness = createSessionTroopWitness(cardId);
    const card = witness.roster.find(({ id }) => id === cardId);
    assert.ok(card.entities.every((entity) => entity.sourceConfidencePolicy === undefined), cardId);
    const battle = new LiveBattle(canonical(witness));
    battle.scheduleDeploy(canonical({ cardId, point: SOUTH_POINT,
      sequence: 0, side: "south", tick: 0 }));
    const events = battle.step();
    assert.equal(battle.state.units.filter(({ cardId: id }) => id === cardId).length, count, cardId);
    assert.equal(events.filter(({ type }) => type === "spawn").length, count, cardId);
  }
});

test("Briar Band commits one player cost and natural AI cycle while both sides restore through mixed births", () => {
  const cardId = "briar-band";
  const deck = [cardId, ...PLAYABLE_CARD_IDS.filter((id) => id !== cardId).slice(0, 7)];
  const seed = seedWithCardInBothHands(deck, cardId);
  const setup = JSON.parse(createEditableGameSessionSetup(deck, seed));
  setup.legalNorthDeployments = [{ cardId, point: NORTH_POINT }];
  const session = new GameSession(canonical(setup));
  const before = session.state;
  assert.equal(session.submitPlayerCommand(playerDeploy(session, cardId)).accepted, true);
  const events = session.step();
  const deployments = events.filter(({ type }) => type === "session-deployed");
  assert.deepEqual(deployments.map(({ side, deployment, spend }) =>
    [side, deployment.cardId, deployment.entityIds.length, spend.cost]).sort(), [
    ["north", cardId, 6, 3], ["south", cardId, 6, 3],
  ]);
  assert.equal(session.state.decks.north.sequence, before.decks.north.sequence + 1);
  assert.equal(session.state.decks.south.sequence, before.decks.south.sequence + 1);
  assert.equal(session.state.elixir.sides.north.amount, before.elixir.sides.north.amount - 3);
  assert.equal(session.state.elixir.sides.south.amount, before.elixir.sides.south.amount - 3);
  assert.deepEqual(Object.fromEntries(["north", "south"].map((side) => [side,
    session.state.battle.units.filter((unit) => unit.cardId === cardId && unit.side === side).length,
  ])), { north: 1, south: 1 });

  for (let elapsedTicks = 1; elapsedTicks <= 30; elapsedTicks += 1) {
    const checkpoint = session.serialize();
    const restored = GameSession.restore(checkpoint);
    assert.equal(restored.serialize(), checkpoint, `session snapshot at ${elapsedTicks - 1}`);
    const resumedEvents = restored.step();
    const directEvents = session.step();
    assert.deepEqual(resumedEvents, directEvents, `both sides resume at tick ${elapsedTicks}`);
    assert.equal(restored.serialize(), session.serialize(), `session bytes at ${elapsedTicks}`);
    const expected = Math.min(6, 1 + Math.floor(elapsedTicks / INTERVAL_TICKS));
    for (const side of ["north", "south"]) {
      assert.equal(session.state.battle.units.filter((unit) =>
        unit.cardId === cardId && unit.side === side).length, expected,
      `only ${expected} ${side} units exist at elapsed tick ${elapsedTicks}`);
    }
  }
});

test("mixed editable RL exposes and restores Briar Band's members at exact source ticks", () => {
  const deck = ["briar-band", "thornscouts", "forgeguard", "sunthread-pair",
    "duskwing-trio", "gloamwing-cluster", "coppershade-flock", "squall-orb"];
  const seed = seedWithCardInBothHands(deck, "briar-band", false);
  const env = new RLEnvironment({ deck, seed, strideTicks: 1, horizonTicks: 40 });
  let observation = env.observe();
  const slot = observation.hand.indexOf("briar-band");
  const action = env.actionSpace().actions.find(({ point, slot: actionSlot }) =>
    actionSlot === slot && point.x === SOUTH_POINT.x && point.y === SOUTH_POINT.y);
  assert.ok(action);
  assert.equal(observation.actionMask[action.id], true, "the player can legally deploy the mixed squad");
  observation = env.step(action.id).observation;
  assert.equal(observation.units.filter(({ cardId }) => cardId === "briar-band").length, 1,
    "RL observes only the first born member");
  for (let elapsedTicks = 1; elapsedTicks <= 30; elapsedTicks += 1) {
    const checkpoint = env.serialize();
    const restored = RLEnvironment.restore(checkpoint);
    assert.equal(restored.serialize(), checkpoint, `RL snapshot at ${elapsedTicks - 1}`);
    observation = env.step(0).observation;
    assert.deepEqual(restored.step(0).observation, observation,
      `RL continuation at elapsed tick ${elapsedTicks}`);
    assert.equal(observation.units.filter(({ cardId }) => cardId === "briar-band").length,
      Math.min(6, 1 + Math.floor(elapsedTicks / INTERVAL_TICKS)),
      `RL exposes exactly the born member count at tick ${elapsedTicks}`);
  }
});

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
