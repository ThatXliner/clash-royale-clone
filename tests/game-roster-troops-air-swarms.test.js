import assert from "node:assert/strict";
import test from "node:test";

import {
  createSessionTroopWitness,
  createEditableDeckWitness,
  EDITABLE_DECK_CARD_IDS,
  projectSessionTroopBattleCard,
} from "../src/content/session-troop-roster.js";
import { PLAYABLE_CARD_IDS } from "../src/content/playable-roster.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";
import { parseLiveBattleSetup } from "../src/sim/battle-continuation-kernel.js";
import { RLEnvironment } from "../src/rl/environment.js";

const SOUTH = Object.freeze({ x: 3_500, y: 14_500 });
const NORTH = Object.freeze({ x: 3_500, y: 17_500 });
const GLOAMWING = "gloamwing-cluster";
const COPPERSHADE = "coppershade-flock";

const SOURCE_FACTS = Object.freeze([
  Object.freeze({
    cardId: GLOAMWING,
    archetypeId: "gloamwing",
    cost: 2,
    count: 5,
    hitpoints: 81,
    damage: 81,
    cadenceTicks: 78,
    firstHitTicks: 42,
    deployTicks: 60,
    range: 1_200,
    sightRange: 5_500,
    speed: 2_000,
    delivery: "melee",
  }),
  Object.freeze({
    cardId: COPPERSHADE,
    archetypeId: "coppershade",
    cost: 5,
    count: 6,
    hitpoints: 230,
    damage: 117,
    cadenceTicks: 60,
    firstHitTicks: 30,
    deployTicks: 60,
    range: 1_600,
    sightRange: 5_500,
    speed: 1_500,
    delivery: "projectile",
  }),
]);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function clone(value) {
  return structuredClone(value);
}

function deckFor(selectedIds) {
  const deck = [...selectedIds];
  for (const id of PLAYABLE_CARD_IDS) {
    if (!deck.includes(id) && deck.length < 8) deck.push(id);
  }
  assert.equal(deck.length, 8);
  assert.equal(new Set(deck).size, 8);
  return deck;
}

function witnessSetup(deck, legalCards, seed, {
  startingElixir = { north: 10, south: 10 },
  thinkIntervalTicks = 3_600,
} = {}) {
  const cards = new Map();
  const questions = new Map();
  for (const id of deck) {
    const witness = createSessionTroopWitness(id);
    for (const card of witness.roster) cards.set(card.id, card);
    for (const question of witness.questions) {
      const prior = questions.get(question.key);
      if (prior !== undefined) assert.deepEqual(question, prior, question.key);
      else questions.set(question.key, question);
    }
  }
  const roster = deck.map((id) => {
    const card = cards.get(id);
    assert.ok(card, `canonical witness includes ${id}`);
    return clone(card);
  });
  const questionKeys = [...new Set(roster.flatMap(({ entities }) => entities.flatMap((entity) => {
    const policyKeys = ["bodyRadiusPolicy", "deliveryPolicy", "layerPolicy",
      "projectileSpeedPolicy", "damagePolicy"]
      .filter((field) => entity[field]?.kind === "question")
      .map((field) => entity[field].questionKey);
    const confidenceKeys = (entity.sourceConfidencePolicy?.fields ?? [])
      .map(({ questionKey }) => questionKey);
    return [...policyKeys, ...confidenceKeys];
  })))].sort();
  const selectedQuestions = questionKeys.map((key) => {
    const question = questions.get(key);
    assert.ok(question, `witness closure includes ${key}`);
    return clone(question);
  });
  const candidates = legalCards.map((cardId) => ({ cardId, point: clone(NORTH) }))
    .sort((left, right) => left.cardId < right.cardId ? -1 :
      left.cardId > right.cardId ? 1 : left.point.x - right.point.x || left.point.y - right.point.y);
  const battleSetup = canonical({
    initialWindupTicks: { central: 0, lane: 0 },
    questions: selectedQuestions,
    roster,
  });
  return canonical({
    battleSetup,
    deck,
    legalNorthDeployments: candidates,
    rosterWitness: canonical({ questions: selectedQuestions, roster }),
    seed,
    startingElixir,
    thinkIntervalTicks,
    thinkOffsetTicks: 0,
  });
}

function mutateWitnessSetup(cardId, mutate) {
  const deck = deckFor([cardId]);
  const seed = seedFor(deck, { southCard: cardId, northHandCards: [cardId] });
  const wrapper = JSON.parse(witnessSetup(deck, [cardId], seed));
  const battleSetup = JSON.parse(wrapper.battleSetup);
  mutate(battleSetup);
  return canonical(battleSetup);
}

function seedFor(deck, { southCard, northHandCards = [] }) {
  for (let seed = 0; seed < 10_000; seed += 1) {
    const southHand = new DeckCycle({ deck, seed: `${seed}:south` }).state.hand;
    const northHand = new DeckCycle({ deck, seed: `${seed}:north` }).state.hand;
    if (southHand.includes(southCard) &&
        northHandCards.every((id) => northHand.includes(id))) return seed;
  }
  assert.fail(`seed exists for south ${southCard} and north hand ${northHandCards.join(",")}`);
}

function playerDeploy(session, cardId, commandId = 0) {
  const slot = session.state.decks.south.hand.indexOf(cardId);
  assert.notEqual(slot, -1, `${cardId} is in the south opening hand`);
  return canonical({ cardId, commandId, point: SOUTH, slot,
    tick: session.state.tick, type: "deploy" });
}

function attackBetween(session, attackerIds, targetIds) {
  return session.replay.some(({ attackerId, targetId, type }) =>
    type === "damage" && attackerIds.has(attackerId) && targetIds.has(targetId));
}

function spawnIds(session, side, cardId) {
  return new Set(session.state.battle.units.filter((unit) =>
    unit.side === side && unit.cardId === cardId).map(({ id }) => id));
}

test("original air swarm records preserve pinned tournament stats and explicit estimates", () => {
  for (const expected of SOURCE_FACTS) {
    const card = projectSessionTroopBattleCard(expected.cardId);
    assert.equal(card.cost, expected.cost, `${expected.cardId}.cost`);
    assert.equal(card.count, expected.count, `${expected.cardId}.count`);
    assert.equal(card.hitpoints, expected.hitpoints, `${expected.cardId}.hitpoints`);
    assert.equal(card.damage, expected.damage, `${expected.cardId}.damage`);
    assert.equal(card.hitSpeedTicks, expected.cadenceTicks, `${expected.cardId}.hitSpeedTicks`);
    assert.equal(card.firstHitTicks, expected.firstHitTicks, `${expected.cardId}.firstHitTicks`);
    assert.equal(card.deployTimeTicks, expected.deployTicks, `${expected.cardId}.deployTimeTicks`);
    assert.equal(card.rangeMillitiles, expected.range, `${expected.cardId}.rangeMillitiles`);
    assert.equal(card.sightRangeMillitiles, expected.sightRange,
      `${expected.cardId}.sightRangeMillitiles`);
    assert.equal(card.movementMillitilesPerSecond, expected.speed,
      `${expected.cardId}.movementMillitilesPerSecond`);
    assert.equal(card.targetMode, "ground-and-air", `${expected.cardId}.targetMode`);
    assert.equal(card.entities.length, 1);
    assert.equal(card.entities[0].archetypeId, expected.archetypeId);
    assert.equal(card.entities[0].count, expected.count);
    assert.equal(card.entities[0].delivery, expected.delivery,
      `${expected.cardId} runtime delivery classification`);
    assert.equal(card.entities[0].layer, "air",
      `${expected.cardId} air layer remains a runtime estimate`);
  }
});

test("air swarm witnesses close source QUESTIONS over every unverified runtime field", () => {
  const expectedFields = [
    ["count", "count", "positive-integer"],
    ["damage", "damage", "positive-integer"],
    ["deployTimeTicks", "deploy-time-ticks", "positive-integer"],
    ["firstHitTicks", "first-hit-ticks", "positive-integer"],
    ["hitSpeedTicks", "hit-speed-ticks", "positive-integer"],
    ["hitpoints", "hitpoints", "positive-integer"],
    ["movementMillitilesPerSecond", "movement-millitiles-per-second", "positive-integer"],
    ["rangeMillitiles", "range-millitiles", "positive-integer"],
    ["sightRangeMillitiles", "sight-range-millitiles", "positive-integer"],
    ["targetMode", "target-mode", "target-mode-code"],
  ];
  for (const expected of SOURCE_FACTS) {
    const witness = createSessionTroopWitness(expected.cardId);
    const card = witness.roster.find(({ id }) => id === expected.cardId);
    const entity = card.entities[0];
    const policy = entity.sourceConfidencePolicy;
    assert.ok(policy, `${expected.cardId} has a source-confidence policy`);
    assert.deepEqual(policy.fields.map(({ field, questionKey, valueEncoding }) =>
      [field, questionKey.slice(expected.archetypeId.length + 1), valueEncoding]),
    expectedFields.map(([field, suffix, encoding]) => [field, suffix, encoding]));

    const questions = new Map(witness.questions.map((question) => [question.key, question]));
    for (const field of policy.fields) {
      const question = questions.get(field.questionKey);
      assert.ok(question, `${expected.cardId} witness closes ${field.questionKey}`);
      assert.equal(question.authoritative, false);
      assert.equal(question.confidence, "unverified");
      assert.equal(question.disposition, "question");
      const encoded = field.valueEncoding === "target-mode-code"
        ? { buildings: 1, ground: 2, "ground-and-air": 3, structures: 4 }[entity[field.field]]
        : entity[field.field];
      assert.equal(question.value, encoded, `${field.questionKey} records the runtime estimate`);
    }
    assert.equal(policy.fields.some(({ field }) =>
      ["cost", "kind", "rarity"].includes(field)), false,
    "identity, cost, kind, and rarity stay on their source-backed admission path");
    if (expected.cardId === COPPERSHADE) {
      assert.equal(entity.deliveryPolicy.kind, "source-backed",
        "projectile delivery stays bound to its sourced distinction");
    }

    const deck = deckFor([expected.cardId]);
    const seed = seedFor(deck, { southCard: expected.cardId,
      northHandCards: [expected.cardId] });
    const session = new GameSession(witnessSetup(deck, [expected.cardId], seed));
    const snapshot = session.serialize();
    const snapshotSetup = JSON.parse(JSON.parse(snapshot).setup.battleSetup);
    const snapshotEntity = snapshotSetup.roster.find(({ id }) => id === expected.cardId)
      .entities[0];
    assert.deepEqual(snapshotEntity.sourceConfidencePolicy, policy,
      `${expected.cardId} confidence metadata survives into the typed snapshot`);
    const snapshotQuestionKeys = snapshotSetup.questions.map(({ key }) => key);
    assert.ok(policy.fields.every(({ questionKey }) => snapshotQuestionKeys.includes(questionKey)),
      `${expected.cardId} snapshot preserves the complete confidence QUESTION closure`);
    assert.equal(GameSession.restore(snapshot).serialize(), snapshot,
      `${expected.cardId} confidence metadata restores byte-for-byte`);
  }
});

test("typed swarm confidence policy rejects missing, forged, dangling, and wrong-value QUESTIONS", () => {
  for (const expected of SOURCE_FACTS) {
    const missingPolicy = mutateWitnessSetup(expected.cardId, ({ roster }) => {
      delete roster.find(({ id }) => id === expected.cardId).entities[0].sourceConfidencePolicy;
    });
    assert.throws(() => parseLiveBattleSetup(missingPolicy), /source confidence policy is missing/u,
      `${expected.cardId} cannot omit its confidence policy`);

    const forgedConfidence = mutateWitnessSetup(expected.cardId, ({ questions }) => {
      const question = questions.find(({ key }) => key === `${expected.archetypeId}.hitpoints`);
      question.confidence = "high";
    });
    assert.throws(() => parseLiveBattleSetup(forgedConfidence), /unverified provenance/u,
      `${expected.cardId} cannot upgrade an unverified QUESTION`);

    const forgedField = mutateWitnessSetup(expected.cardId, ({ roster }) => {
      const fields = roster.find(({ id }) => id === expected.cardId)
        .entities[0].sourceConfidencePolicy.fields;
      fields[0].field = "displayName";
    });
    assert.throws(() => parseLiveBattleSetup(forgedField), /field inventory diverges/u,
      `${expected.cardId} cannot substitute a different field`);

    const missingQuestion = mutateWitnessSetup(expected.cardId, ({ questions }) => {
      const index = questions.findIndex(({ key }) => key === `${expected.archetypeId}.hitpoints`);
      questions.splice(index, 1);
    });
    assert.throws(() => parseLiveBattleSetup(missingQuestion), /lacks a QUESTION record/u,
      `${expected.cardId} cannot omit a field QUESTION`);

    const danglingQuestion = mutateWitnessSetup(expected.cardId, ({ questions }) => {
      questions.push({
        authoritative: false,
        confidence: "unverified",
        disposition: "question",
        key: `${expected.archetypeId}.unsupported-confidence-field`,
        source: "runtime-playability-estimate-not-comparison-corpus",
        value: 1,
      });
    });
    assert.throws(() => parseLiveBattleSetup(danglingQuestion), /canonical exact referenced inventory/u,
      `${expected.cardId} rejects dangling confidence QUESTIONS`);

    const wrongValue = mutateWitnessSetup(expected.cardId, ({ questions }) => {
      const question = questions.find(({ key }) => key === `${expected.archetypeId}.hitpoints`);
      question.value += 1;
    });
    assert.throws(() => parseLiveBattleSetup(wrongValue), /QUESTION diverges from its estimate/u,
      `${expected.cardId} confidence QUESTIONS must equal the runtime estimate`);
  }
});

test("Gloamwing and Coppershade deploy through typed shared sessions with exact spend and cycle", () => {
  for (const expected of SOURCE_FACTS) {
    const deck = deckFor([expected.cardId]);
    const seed = seedFor(deck, { southCard: expected.cardId,
      northHandCards: [expected.cardId] });
    const session = new GameSession(witnessSetup(deck, [expected.cardId], seed));
    const before = session.state;
    assert.equal(session.submitPlayerCommand(playerDeploy(session, expected.cardId)).accepted, true);
    const events = session.step();
    const after = session.state;
    const deployments = session.replay.filter(({ type }) => type === "session-deployed");
    assert.equal(deployments.length, 2, `${expected.cardId} both sides commit`);
    assert.deepEqual(new Set(deployments.map(({ side }) => side)), new Set(["north", "south"]));
    assert.ok(deployments.every(({ deployment }) =>
      deployment.entityIds.length === expected.count), `${expected.cardId} deployed count`);
    assert.equal(after.decks.south.sequence, before.decks.south.sequence + 1);
    assert.equal(after.decks.north.sequence, before.decks.north.sequence + 1);
    assert.equal(after.elixir.sides.south.amount, before.elixir.sides.south.amount - expected.cost);
    assert.equal(after.elixir.sides.north.amount, before.elixir.sides.north.amount - expected.cost);
    assert.equal(events.filter(({ type }) => type === "session-deployed").length, 2);
    assert.equal(after.cardRuntime.history.filter(({ cardId }) =>
      cardId === expected.cardId).length, 2);
    for (const side of ["north", "south"]) {
      const units = after.battle.units.filter(({ cardId, side: owner }) =>
        cardId === expected.cardId && owner === side);
      assert.equal(units.length, expected.count);
      assert.ok(units.every((unit) => unit.maxHealth === expected.hitpoints &&
        unit.damage === expected.damage && unit.cadenceTicks === expected.cadenceTicks &&
        unit.firstHitTicks === expected.firstHitTicks && unit.deployTicks === expected.deployTicks &&
        unit.reach === expected.range && unit.sightRange === expected.sightRange &&
        unit.movement.speed === expected.speed && unit.layer === "air" &&
        unit.targetMode === "air_and_ground" && unit.delivery === expected.delivery),
      `${expected.cardId} ${side} runtime stats`);
    }
    const snapshot = session.serialize();
    assert.equal(GameSession.restore(snapshot).serialize(), snapshot,
      `${expected.cardId} same-tick session snapshot restores byte-for-byte`);
  }
});

test("seeded GameSession opponent chooses naturally between both admitted swarm cards", () => {
  const deck = deckFor([GLOAMWING, COPPERSHADE]);
  const seed = seedFor(deck, { southCard: GLOAMWING,
    northHandCards: [GLOAMWING, COPPERSHADE] });
  const session = new GameSession(witnessSetup(deck, [GLOAMWING, COPPERSHADE], seed));
  const initial = session.state;
  assert.ok(initial.decks.north.hand.includes(GLOAMWING));
  assert.ok(initial.decks.north.hand.includes(COPPERSHADE));
  session.submitPlayerCommand(playerDeploy(session, GLOAMWING));
  session.step();
  const chosen = session.state.battle.units.filter(({ side, cardId }) =>
    side === "north" && [GLOAMWING, COPPERSHADE].includes(cardId));
  const chosenCards = new Set(chosen.map(({ cardId }) => cardId));
  assert.equal(chosenCards.size, 1, "seeded opponent commits one eligible swarm candidate");
  assert.ok(chosen.every(({ alive }) => alive), "the selected squad materializes as a shared unit group");
  assert.equal(session.state.decks.north.sequence, initial.decks.north.sequence + 1);
  assert.equal(session.state.elixir.sides.north.amount,
    10 - (chosenCards.has(GLOAMWING) ? 2 : 5));
  const snapshot = session.serialize();
  const repeated = new GameSession(witnessSetup(deck, [GLOAMWING, COPPERSHADE], seed));
  repeated.submitPlayerCommand(playerDeploy(repeated, GLOAMWING));
  repeated.step();
  assert.equal(repeated.serialize(), snapshot, "the natural seeded choice repeats exactly");
  assert.deepEqual(repeated.replay, session.replay);
});

test("both swarm roles acquire ground and air opponents in shared GameSession combat", () => {
  const duels = [
    [GLOAMWING, COPPERSHADE],
    [GLOAMWING, "mossguard"],
    [COPPERSHADE, "mossguard"],
  ];
  for (const [attackerCard, defenderCard] of duels) {
    const deck = deckFor([attackerCard, defenderCard]);
    const seed = seedFor(deck, { southCard: attackerCard,
      northHandCards: [defenderCard] });
    const session = new GameSession(witnessSetup(deck, [defenderCard], seed));
    session.submitPlayerCommand(playerDeploy(session, attackerCard));
    session.step();
    const attackers = spawnIds(session, "south", attackerCard);
    const defenders = spawnIds(session, "north", defenderCard);
    assert.ok(attackers.size > 0, `${attackerCard} deployed`);
    assert.ok(defenders.size > 0, `${defenderCard} deployed`);
    for (let tick = 0; tick < 360 && !attackBetween(session, attackers, defenders); tick += 1) {
      session.step();
    }
    assert.ok(attackBetween(session, attackers, defenders),
      `${attackerCard} damages ${defenderCard} through the shared combat runtime`);
  }
});

test("in-flight projectile and post-death GameSession snapshots continue exactly", () => {
  const deck = deckFor([GLOAMWING, COPPERSHADE]);
  const seed = seedFor(deck, { southCard: GLOAMWING,
    northHandCards: [COPPERSHADE] });
  const session = new GameSession(witnessSetup(deck, [COPPERSHADE], seed));
  session.submitPlayerCommand(playerDeploy(session, GLOAMWING));
  session.step();
  const bats = spawnIds(session, "south", GLOAMWING);
  const minions = spawnIds(session, "north", COPPERSHADE);
  assert.equal(bats.size, 5);
  assert.equal(minions.size, 6);

  let flightSnapshot = null;
  for (let tick = 0; tick < 360 && flightSnapshot === null; tick += 1) {
    session.step();
    const projectiles = session.state.battle.projectiles.filter(({ attackerId }) =>
      minions.has(attackerId));
    if (projectiles.length > 0) {
      assert.ok(projectiles.every(({ impactTick, launchTick }) => impactTick > launchTick));
      flightSnapshot = session.serialize();
    }
  }
  assert.ok(flightSnapshot, "Coppershade leaves a live projectile in flight");
  const resumed = GameSession.restore(flightSnapshot);
  assert.equal(resumed.serialize(), flightSnapshot,
    "the in-flight session restores byte-for-byte");

  let deathSnapshot = null;
  for (let tick = 0; tick < 600 && deathSnapshot === null; tick += 1) {
    const directEvents = session.step();
    const resumedEvents = resumed.step();
    assert.deepEqual(resumedEvents, directEvents, `continuation tick ${tick}`);
    assert.equal(resumed.serialize(), session.serialize(), `snapshot tick ${tick}`);
    if (directEvents.some(({ type }) => type === "death")) deathSnapshot = session.serialize();
  }
  assert.ok(deathSnapshot, "the shared air swarm fight reaches a unit death");
  const afterDeath = GameSession.restore(deathSnapshot);
  assert.equal(afterDeath.serialize(), deathSnapshot,
    "the post-death session restores byte-for-byte");
  for (let tick = 0; tick < 120; tick += 1) {
    assert.deepEqual(afterDeath.step(), session.step(), `post-death continuation tick ${tick}`);
    assert.equal(afterDeath.serialize(), session.serialize(), `post-death snapshot tick ${tick}`);
  }
});

test("new session-only swarm IDs do not enter the unchanged editable or RL deck seam", () => {
  assert.deepEqual(EDITABLE_DECK_CARD_IDS, [
    ...PLAYABLE_CARD_IDS,
    "stonehauler", "thornscouts", "forgeguard", "cinder-host", "ironroot",
    "sunthread-pair", "duskwing-trio",
  ]);
  for (const id of [GLOAMWING, COPPERSHADE]) {
    const deck = [...EDITABLE_DECK_CARD_IDS.slice(0, 7), id];
    assert.throws(() => createEditableDeckWitness(deck), /not supported/u);
    assert.throws(() => new RLEnvironment({ deck, horizonTicks: 60 }), /not supported/u);
  }
});
