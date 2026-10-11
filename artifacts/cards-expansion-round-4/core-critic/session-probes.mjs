import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = process.cwd();
const fromRoot = (path) => pathToFileURL(resolve(root, path)).href;
const [{ GameSession }, { DeckCycle }, roster, playable, { RLEnvironment }, cards,
  { createSessionCardManifest }, { createSessionTroopProfileManifest }, deliveryAuthority,
  editableDeck] =
  await Promise.all([
    import(fromRoot("src/sim/game-session.js")),
    import(fromRoot("src/sim/deck.js")),
    import(fromRoot("src/content/session-troop-roster.js")),
    import(fromRoot("src/content/playable-roster.js")),
    import(fromRoot("src/rl/environment.js")),
    import(fromRoot("src/content/session-troop-projectile-profiles.js")),
    import(fromRoot("src/content/session-card-catalog.js")),
    import(fromRoot("src/content/session-troop-profile-catalog.js")),
    import(fromRoot("src/shared/ordinary-projectile-delivery-authority.js")),
    import(fromRoot("src/content/editable-deck.js")),
  ]);

const { createSessionTroopWitness, projectSessionTroopBattleCard,
  EDITABLE_DECK_CARD_IDS, createEditableDeckWitness } = roster;
const { PLAYABLE_CARD_IDS } = playable;
const { getOrdinaryProjectileDeliveryPolicy, assertOrdinaryProjectileDeliveryPolicy } =
  deliveryAuthority;
const { EDITABLE_MIXED_DECK_CARD_IDS, createEditableMixedDeckWitness } = editableDeck;
const source = JSON.parse(readFileSync(resolve(root, "reference/stats/cards.json"), "utf8"));
const referenceByKey = new Map(source.cards.map((card) => [card.key, card]));

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function clone(value) { return structuredClone(value); }

function deckFor(selectedIds) {
  const deck = [...selectedIds];
  for (const id of PLAYABLE_CARD_IDS) {
    if (!deck.includes(id) && deck.length < 8) deck.push(id);
  }
  assert.equal(deck.length, 8);
  assert.equal(new Set(deck).size, 8);
  return deck;
}

function seedFor(deck, { southCard, northHandCards = [] }) {
  for (let seed = 0; seed < 10_000; seed += 1) {
    const southHand = new DeckCycle({ deck, seed: `${seed}:south` }).state.hand;
    const northHand = new DeckCycle({ deck, seed: `${seed}:north` }).state.hand;
    if (southHand.includes(southCard) && northHandCards.every((id) => northHand.includes(id))) {
      return seed;
    }
  }
  throw new Error(`could not find seed for ${southCard}`);
}

function witnessSetup(deck, legalCards, seed) {
  const cardsById = new Map();
  const questionsByKey = new Map();
  for (const id of deck) {
    const witness = createSessionTroopWitness(id);
    for (const card of witness.roster) cardsById.set(card.id, card);
    for (const question of witness.questions) {
      const previous = questionsByKey.get(question.key);
      if (previous !== undefined) assert.deepEqual(question, previous, question.key);
      else questionsByKey.set(question.key, question);
    }
  }
  const sessionRoster = deck.map((id) => {
    const card = cardsById.get(id);
    assert.ok(card, `canonical witness includes ${id}`);
    return clone(card);
  });
  const questionKeys = [...new Set(sessionRoster.flatMap(({ entities }) => entities.flatMap((entity) =>
    ["bodyRadiusPolicy", "deliveryPolicy", "layerPolicy", "projectileSpeedPolicy", "damagePolicy"]
      .filter((field) => entity[field]?.kind === "question")
      .map((field) => entity[field].questionKey))))].sort();
  const questions = questionKeys.map((key) => {
    const question = questionsByKey.get(key);
    assert.ok(question, `witness closure includes ${key}`);
    return clone(question);
  });
  const legalNorthDeployments = legalCards.map((cardId) => ({
    cardId,
    point: { x: 3_500, y: 17_500 },
  })).sort((left, right) => left.cardId < right.cardId ? -1 : left.cardId > right.cardId ? 1 : 0);
  const battleSetup = canonical({
    initialWindupTicks: { central: 0, lane: 0 },
    questions,
    roster: sessionRoster,
  });
  return canonical({
    battleSetup,
    deck,
    legalNorthDeployments,
    rosterWitness: canonical({ questions, roster: sessionRoster }),
    seed,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 3_600,
    thinkOffsetTicks: 0,
  });
}

function playerDeploy(session, cardId) {
  const slot = session.state.decks.south.hand.indexOf(cardId);
  assert.notEqual(slot, -1, `${cardId} is in the south opening hand`);
  return canonical({ cardId, commandId: 0, point: { x: 3_500, y: 14_500 },
    slot, tick: session.state.tick, type: "deploy" });
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

const comparisons = [
  { id: "gloamwing-cluster", archetype: "gloamwing", referenceKey: "bats" },
  { id: "coppershade-flock", archetype: "coppershade", referenceKey: "minion-horde" },
].map(({ id, archetype, referenceKey }) => {
  const expected = referenceByKey.get(referenceKey);
  const actual = projectSessionTroopBattleCard(id);
  const mapping = [
    ["cost", "elixir_cost", (value) => value],
    ["kind", "type", (value) => value === "troop" ? "unit" : value],
    ["rarity", "rarity", (value) => value === "common" ? "standard" : value],
    ["hitpoints", "hitpoints", (value) => value],
    ["damage", "damage", (value) => value],
    ["hitSpeedTicks", "hit_speed_seconds", (value) => value * 60],
    ["firstHitTicks", "first_hit_seconds", (value) => value * 60],
    ["deployTimeTicks", "deploy_time_seconds", (value) => value * 60],
    ["rangeMillitiles", "range_tiles", (value) => value * 1_000],
    ["sightRangeMillitiles", "sight_range_tiles", (value) => value * 1_000],
    ["movementMillitilesPerSecond", "movement_speed_tiles_per_second", (value) => value * 1_000],
    ["targetMode", "targets", (value) => ({ air_and_ground: "ground-and-air", ground: "ground" })[value]],
    ["count", "count", (value) => value],
    ["areaDamageRadiusMillitiles", "area_damage_radius_tiles", (value) => value === null ? null : value * 1_000],
  ];
  const fields = mapping.map(([runtimeField, sourceField, convert]) => ({
    runtimeField,
    sourceField,
    sourceValue: expected[sourceField],
    runtimeValue: actual[runtimeField],
    unverified: expected.unverified_fields.includes(sourceField),
    matches: actual[runtimeField] === convert(expected[sourceField]),
  }));
  const entity = actual.entities[0];
  const witness = createSessionTroopWitness(id);
  const questionKeys = witness.questions.map(({ key }) => key).filter((key) =>
    key.startsWith(`${archetype}.`));
  return {
    id,
    sourceIdentity: { key: expected.key, name: expected.name, id: expected.id },
    fields,
    allMappedFieldsMatch: fields.every(({ matches }) => matches),
    unverifiedFields: expected.unverified_fields,
    runtimeQuestionKeys: questionKeys,
    runtimeEstimates: {
      bodyRadius: entity.bodyRadiusPolicy,
      delivery: entity.deliveryPolicy,
      layer: entity.layerPolicy,
      projectileSpeed: entity.projectileSpeedPolicy,
    },
  };
});

const deployRuns = [];
for (const id of ["gloamwing-cluster", "coppershade-flock"]) {
  const deck = deckFor([id]);
  const seed = seedFor(deck, { southCard: id, northHandCards: [id] });
  const session = new GameSession(witnessSetup(deck, [id], seed));
  const before = session.state;
  const accepted = session.submitPlayerCommand(playerDeploy(session, id)).accepted;
  assert.equal(accepted, true);
  const events = session.step();
  const after = session.state;
  const deployments = session.replay.filter(({ type }) => type === "session-deployed");
  const units = after.battle.units.filter(({ cardId }) => cardId === id);
  const record = projectSessionTroopBattleCard(id);
  assert.equal(deployments.length, 2);
  assert.equal(units.length, record.count * 2);
  assert.equal(after.elixir.sides.south.amount, before.elixir.sides.south.amount - record.cost);
  assert.equal(after.elixir.sides.north.amount, before.elixir.sides.north.amount - record.cost);
  assert.equal(after.decks.south.sequence, before.decks.south.sequence + 1);
  assert.equal(after.decks.north.sequence, before.decks.north.sequence + 1);
  const snapshot = session.serialize();
  assert.equal(GameSession.restore(snapshot).serialize(), snapshot);
  deployRuns.push({
    id,
    seed,
    deployments: deployments.map(({ side, deployment }) => ({ side, entityCount: deployment.entityIds.length })),
    runtimeEntityCount: units.length,
    elixir: { before: before.elixir.sides, after: after.elixir.sides },
    deckSequence: { south: after.decks.south.sequence, north: after.decks.north.sequence },
    deploymentEventsThisStep: events.filter(({ type }) => type === "session-deployed").length,
    snapshotBytes: Buffer.byteLength(snapshot),
    snapshotSha256: hash(snapshot),
    snapshotRestoreExact: true,
  });
}

const seededDeck = deckFor(["gloamwing-cluster", "coppershade-flock"]);
const seededAiSeed = seedFor(seededDeck, {
  southCard: "gloamwing-cluster",
  northHandCards: ["gloamwing-cluster", "coppershade-flock"],
});
const aiSession = new GameSession(witnessSetup(
  seededDeck, ["gloamwing-cluster", "coppershade-flock"], seededAiSeed,
));
aiSession.submitPlayerCommand(playerDeploy(aiSession, "gloamwing-cluster"));
aiSession.step();
const aiChosen = [...new Set(aiSession.state.battle.units
  .filter(({ side, cardId }) => side === "north" &&
    ["gloamwing-cluster", "coppershade-flock"].includes(cardId))
  .map(({ cardId }) => cardId))];
const repeatedAi = new GameSession(witnessSetup(
  seededDeck, ["gloamwing-cluster", "coppershade-flock"], seededAiSeed,
));
repeatedAi.submitPlayerCommand(playerDeploy(repeatedAi, "gloamwing-cluster"));
repeatedAi.step();
assert.equal(aiChosen.length, 1);
assert.equal(repeatedAi.serialize(), aiSession.serialize());

const duels = [];
for (const [attackerCard, defenderCard] of [
  ["gloamwing-cluster", "coppershade-flock"],
  ["gloamwing-cluster", "mossguard"],
  ["coppershade-flock", "mossguard"],
  ["coppershade-flock", "gloamwing-cluster"],
]) {
  const deck = deckFor([attackerCard, defenderCard]);
  const seed = seedFor(deck, { southCard: attackerCard, northHandCards: [defenderCard] });
  const session = new GameSession(witnessSetup(deck, [defenderCard], seed));
  session.submitPlayerCommand(playerDeploy(session, attackerCard));
  session.step();
  const attackerIds = new Set(session.state.battle.units
    .filter(({ side, cardId }) => side === "south" && cardId === attackerCard)
    .map(({ id }) => id));
  const defenderIds = new Set(session.state.battle.units
    .filter(({ side, cardId }) => side === "north" && cardId === defenderCard)
    .map(({ id }) => id));
  let firstDamage = session.replay.find(({ type, attackerId, targetId }) =>
    type === "damage" && attackerIds.has(attackerId) && defenderIds.has(targetId));
  for (let ticks = 0; ticks < 360 && firstDamage === undefined; ticks += 1) {
    session.step();
    firstDamage = session.replay.find(({ type, attackerId, targetId }) =>
      type === "damage" && attackerIds.has(attackerId) && defenderIds.has(targetId));
  }
  assert.ok(firstDamage, `${attackerCard} damages ${defenderCard}`);
  duels.push({
    attackerCard,
    defenderCard,
    tick: firstDamage.tick,
    attackerId: firstDamage.attackerId,
    targetId: firstDamage.targetId,
    damage: firstDamage.amount ?? firstDamage.damage ?? null,
    targetSide: "north",
    bothSidesMaterialized: attackerIds.size > 0 && defenderIds.size > 0,
  });
}

const flightDeck = deckFor(["gloamwing-cluster", "coppershade-flock"]);
const flightSeed = seedFor(flightDeck, {
  southCard: "gloamwing-cluster", northHandCards: ["coppershade-flock"],
});
const flightSession = new GameSession(witnessSetup(
  flightDeck, ["coppershade-flock"], flightSeed,
));
flightSession.submitPlayerCommand(playerDeploy(flightSession, "gloamwing-cluster"));
flightSession.step();
const coppershadeIds = new Set(flightSession.state.battle.units
  .filter(({ side, cardId }) => side === "north" && cardId === "coppershade-flock")
  .map(({ id }) => id));
let flightTick = null;
for (let tick = 0; tick < 360 && flightTick === null; tick += 1) {
  flightSession.step();
  const projectiles = flightSession.state.battle.projectiles.filter(({ attackerId }) =>
    coppershadeIds.has(attackerId));
  if (projectiles.length > 0) flightTick = flightSession.state.tick;
}
assert.notEqual(flightTick, null);
const flightBytes = flightSession.serialize();
const resumedFlight = GameSession.restore(flightBytes);
assert.equal(resumedFlight.serialize(), flightBytes);
let deathTick = null;
for (let tick = 0; tick < 600 && deathTick === null; tick += 1) {
  const leftEvents = flightSession.step();
  const rightEvents = resumedFlight.step();
  assert.deepEqual(rightEvents, leftEvents);
  assert.equal(resumedFlight.serialize(), flightSession.serialize());
  if (leftEvents.some(({ type }) => type === "death")) deathTick = flightSession.state.tick;
}
assert.notEqual(deathTick, null);
const deathBytes = flightSession.serialize();
const resumedDeath = GameSession.restore(deathBytes);
assert.equal(resumedDeath.serialize(), deathBytes);
for (let tick = 0; tick < 120; tick += 1) {
  assert.deepEqual(resumedDeath.step(), flightSession.step());
  assert.equal(resumedDeath.serialize(), flightSession.serialize());
}

const coppershadeCard = projectSessionTroopBattleCard("coppershade-flock");
const goodPolicy = getOrdinaryProjectileDeliveryPolicy("coppershade-flock", "coppershade");
assert.equal(goodPolicy.delivery, "projectile");
assertOrdinaryProjectileDeliveryPolicy(goodPolicy, "coppershade-flock", "coppershade", "projectile");
let forgedPolicyRejected = false;
try {
  assertOrdinaryProjectileDeliveryPolicy(
    { ...goodPolicy, cardId: "forged-card" },
    "coppershade-flock",
    "coppershade",
    "projectile",
  );
} catch {
  forgedPolicyRejected = true;
}
assert.equal(forgedPolicyRejected, true);

let editableRejected = 0;
let mixedEditableRejected = 0;
let rlRejected = 0;
for (const id of ["gloamwing-cluster", "coppershade-flock"]) {
  try { createEditableDeckWitness([...EDITABLE_DECK_CARD_IDS.slice(0, 7), id]); }
  catch { editableRejected += 1; }
  try {
    createEditableMixedDeckWitness(["squall-orb", ...EDITABLE_DECK_CARD_IDS.slice(0, 6), id]);
  } catch { mixedEditableRejected += 1; }
  try { new RLEnvironment({ deck: [...EDITABLE_DECK_CARD_IDS.slice(0, 7), id], horizonTicks: 60 }); }
  catch { rlRejected += 1; }
}
assert.equal(editableRejected, 2);
assert.equal(mixedEditableRejected, 2);
assert.equal(rlRejected, 2);

const sessionCards = createSessionCardManifest();
const troopProfiles = createSessionTroopProfileManifest();
const snapshot = {
  reviewedCommit: "e3413fdc529a366a56e2d0b35afb7fa7b14dcd6f",
  sourceComparison: comparisons,
  sourceQuestionFinding: {
    unverifiedRuntimeFieldsWithoutQuestionPolicy: comparisons.map((card) => ({
      id: card.id,
      fields: card.fields.filter(({ unverified, runtimeField }) => unverified &&
        !card.runtimeQuestionKeys.includes(`${card.id === "gloamwing-cluster" ? "gloamwing" : "coppershade"}.${runtimeField}`))
        .map(({ runtimeField, sourceField }) => ({ runtimeField, sourceField })),
    })),
  },
  sharedSession: {
    deployRuns,
    seededNaturalAi: {
      seed: seededAiSeed,
      playerCard: "gloamwing-cluster",
      opponentEligibleCards: ["gloamwing-cluster", "coppershade-flock"],
      opponentChosenCards: aiChosen,
      sameSeedSnapshotExact: true,
    },
    targetTrades: duels,
    coppershadeProjectile: {
      sourceDeliveryPolicy: goodPolicy,
      forgedPolicyRejected,
      inFlightTick: flightTick,
      inFlightSnapshotBytes: Buffer.byteLength(flightBytes),
      inFlightSnapshotSha256: hash(flightBytes),
      inFlightRestoreExact: true,
      deathTick,
      deathSnapshotBytes: Buffer.byteLength(deathBytes),
      deathSnapshotSha256: hash(deathBytes),
      postDeath120TickContinuationExact: true,
      firstImpactSource: coppershadeCard.entities[0].archetypeId,
    },
  },
  inventory: {
    sessionCards: sessionCards.counts,
    troopProfiles: troopProfiles.counts,
    editableDeckCardIds: [...EDITABLE_DECK_CARD_IDS],
    editableDeckCardCount: EDITABLE_DECK_CARD_IDS.length,
    editableMixedDeckCardIds: [...EDITABLE_MIXED_DECK_CARD_IDS],
    editableMixedDeckCardCount: EDITABLE_MIXED_DECK_CARD_IDS.length,
    playableDefaultCardCount: PLAYABLE_CARD_IDS.length,
    newIdsRejectedByEditableWitness: editableRejected,
    newIdsRejectedByMixedEditableWitness: mixedEditableRejected,
    newIdsRejectedByRlEnvironment: rlRejected,
    warning: "Manifest admission/profile inventory is not a full-roster execution count.",
  },
};

console.log(JSON.stringify(snapshot, null, 2));
