import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createBasicMeleeCatalog } from "../src/content/cards/basic-melee.js";
import { createSwarmCatalog } from "../src/content/cards/swarms.js";
import {
  EDITABLE_DECK_CARD_IDS,
  createEditableDeckWitness,
} from "../src/content/session-troop-roster.js";
import { PLAYABLE_CARD_IDS } from "../src/content/playable-roster.js";
import { GameSession } from "../src/sim/game-session.js";

const EXPECTED = JSON.parse(readFileSync(
  new URL("../artifacts/cards-expansion-round-2/reference-normalization.json", import.meta.url),
  "utf8",
));
const REFERENCE = JSON.parse(readFileSync(
  new URL("../reference/stats/cards.json", import.meta.url),
  "utf8",
));
const DECK = Object.freeze([
  "coilblade", "mossguard", "copperskiff", "skymaul",
  "brassbolt", "reedsting", "cinder-host", "ironroot",
]);
const SOUTH = Object.freeze({ x: 3_500, y: 14_500 });
const NORTH_IRONROOT = Object.freeze({ x: 3_500, y: 17_500 });
const FINAL_TICK = 408;
const RESTORE_CUT = 150;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function setup() {
  const witness = createEditableDeckWitness(DECK);
  const battleSetup = canonical(witness);
  return canonical({
    battleSetup,
    deck: DECK,
    legalNorthDeployments: [{ cardId: "ironroot", point: NORTH_IRONROOT }],
    rosterWitness: canonical({ questions: witness.questions, roster: witness.roster }),
    seed: 21,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 3_600,
    thinkOffsetTicks: 0,
  });
}

function liveUnit(session, cardId, side) {
  return session.state.battle.units.find((unit) =>
    unit.cardId === cardId && unit.side === side);
}

test("round 2: Cinder Host and Ironroot enter an editable deck and trade through GameSession", () => {
  assert.equal(PLAYABLE_CARD_IDS.length, 8, "the default starter deck stays eight cards");
  assert.ok(EDITABLE_DECK_CARD_IDS.includes("cinder-host"));
  assert.ok(EDITABLE_DECK_CARD_IDS.includes("ironroot"));

  const cinderExpected = EXPECTED.runtimeProjection;
  const ironrootExpected = EXPECTED.tradeFixture;
  const cinderSource = createSwarmCatalog().find(({ id }) => id === cinderExpected.id);
  const ironrootSource = createBasicMeleeCatalog().find(({ id }) =>
    id === ironrootExpected.opponentRuntimeId);
  assert.ok(cinderSource, "the 15-body source card is registered");
  assert.ok(ironrootSource, "the single-body source card is registered");
  assert.deepEqual(
    [cinderSource.count, cinderSource.hitpoints, cinderSource.damage,
      cinderSource.movementMillitilesPerSecond, cinderSource.targetMode],
    [cinderExpected.count, cinderExpected.hitpointsPerBody,
      cinderExpected.damagePerBody, cinderExpected.movementMillitilesPerSecond,
      cinderExpected.targetMode],
  );
  assert.deepEqual(
    [ironrootSource.count, ironrootSource.hitpoints, ironrootSource.damage,
      ironrootSource.hitSpeedTicks, ironrootSource.firstHitTicks,
      ironrootSource.deployTimeTicks, ironrootSource.rangeMillitiles,
      ironrootSource.sightRangeMillitiles,
      ironrootSource.movementMillitilesPerSecond, ironrootSource.targetMode],
    [ironrootExpected.count, ironrootExpected.hitpoints, ironrootExpected.damage,
      ironrootExpected.hitSpeedTicks, ironrootExpected.firstHitTicks,
      ironrootExpected.deployTimeTicks, ironrootExpected.rangeMillitiles,
      ironrootExpected.sightRangeMillitiles,
      ironrootExpected.movementMillitilesPerSecond, ironrootExpected.targetMode],
  );

  const legacySwarmRow = REFERENCE.cards.find(({ key }) =>
    key === EXPECTED.normalization.legacyNormalizedRow.key);
  assert.ok(legacySwarmRow);
  assert.equal(legacySwarmRow.hitpoints, EXPECTED.normalization.legacyNormalizedRow.hitpoints);
  assert.equal(legacySwarmRow.damage, EXPECTED.normalization.legacyNormalizedRow.damage);
  assert.ok(legacySwarmRow.unverified_fields.includes("hitpoints"));
  assert.ok(legacySwarmRow.unverified_fields.includes("damage"));
  assert.match(EXPECTED.normalization.legacyNormalizedRow.status, /^QUESTION:/u);
  const sourceIndex = EXPECTED.normalization.summonerRarityArrayIndex +
    EXPECTED.normalization.summon_character_level_index;
  assert.equal(sourceIndex, EXPECTED.normalization.characterArrayIndex);
  assert.equal(
    EXPECTED.upstream.characterStats.hitpoints_per_level[sourceIndex],
    EXPECTED.normalization.selectedHitpoints,
  );
  assert.equal(
    EXPECTED.upstream.characterStats.damage_per_level[sourceIndex],
    EXPECTED.normalization.selectedDamage,
  );
  assert.equal(EXPECTED.upstream.troopStats.summon_number, cinderExpected.count);
  assert.equal(EXPECTED.upstream.troopStats.summon_character_level_index,
    EXPECTED.normalization.summon_character_level_index);
  const ironrootComparison = REFERENCE.cards.find(({ key }) =>
    key === ironrootExpected.sourceComparisonKey);
  assert.ok(ironrootComparison);
  for (const field of ["hitpoints", "damage", "hit_speed_seconds", "first_hit_seconds",
    "deploy_time_seconds", "range_tiles", "sight_range_tiles",
    "movement_speed_tiles_per_second", "targets", "count"]) {
    assert.ok(ironrootComparison.unverified_fields.includes(field),
      `${ironrootExpected.sourceComparisonKey}.${field} remains a question`);
  }

  const witness = createEditableDeckWitness(DECK);
  const projected = new Map(witness.roster.map((card) => [card.id, card]));
  const cinderProjection = projected.get("cinder-host");
  const ironrootProjection = projected.get("ironroot");
  assert.equal(cinderProjection.formation.totalCount, 15);
  assert.equal(cinderProjection.entities.length, 1);
  assert.equal(cinderProjection.entities[0].archetypeId, "cinderling");
  assert.equal(cinderProjection.entities[0].count, 15);
  assert.equal(cinderProjection.entities[0].hitpoints, 81);
  assert.equal(cinderProjection.entities[0].damage, 81);
  assert.equal(cinderProjection.entities[0].bodyRadiusPolicy.kind, "question");
  assert.equal(cinderProjection.entities[0].deliveryPolicy.kind, "question");
  assert.equal(cinderProjection.entities[0].layerPolicy.kind, "question");
  const cinderQuestionPolicies = new Map(witness.questions
    .filter(({ key }) => key.startsWith("cinderling."))
    .map((policy) => [policy.key, policy]));
  for (const [key, value] of [
    ["cinderling.body-radius-millitiles", EXPECTED.runtimeProjection.questionPolicies.bodyRadiusMillitiles],
    ["cinderling.delivery", EXPECTED.runtimeProjection.questionPolicies.deliveryEnum],
    ["cinderling.layer", EXPECTED.runtimeProjection.questionPolicies.layerEnum],
  ]) {
    const policy = cinderQuestionPolicies.get(key);
    assert.equal(policy.value, value);
    assert.equal(policy.authoritative, false);
    assert.equal(policy.source, EXPECTED.runtimeProjection.questionPolicies.source);
  }
  assert.equal(ironrootProjection.formation.totalCount, 1);
  assert.equal(ironrootProjection.entities[0].hitpoints, 3_760);
  assert.equal(ironrootProjection.entities[0].damage, 816);
  assert.equal(ironrootProjection.entities[0].bodyRadiusPolicy.kind, "question");
  assert.equal(ironrootProjection.entities[0].deliveryPolicy.kind, "question");
  assert.equal(ironrootProjection.entities[0].layerPolicy.kind, "question");
  const ironrootQuestionPolicies = new Map(witness.questions
    .filter(({ key }) => key.startsWith("ironroot."))
    .map((policy) => [policy.key, policy]));
  for (const [key, value] of [
    ["ironroot.body-radius-millitiles", EXPECTED.ironrootRuntimeQuestionPolicies.bodyRadiusMillitiles],
    ["ironroot.delivery", EXPECTED.ironrootRuntimeQuestionPolicies.deliveryEnum],
    ["ironroot.layer", EXPECTED.ironrootRuntimeQuestionPolicies.layerEnum],
  ]) {
    const policy = ironrootQuestionPolicies.get(key);
    assert.equal(policy.value, value);
    assert.equal(policy.authoritative, false);
    assert.equal(policy.source, EXPECTED.ironrootRuntimeQuestionPolicies.source);
  }

  const session = new GameSession(setup());
  assert.ok(session.state.decks.south.hand.includes("cinder-host"));
  assert.ok(session.state.decks.north.hand.includes("ironroot"));
  const playerSlot = session.state.decks.south.hand.indexOf("cinder-host");
  const accepted = session.submitPlayerCommand(canonical({
    cardId: "cinder-host",
    commandId: 0,
    point: SOUTH,
    slot: playerSlot,
    tick: 0,
    type: "deploy",
  }));
  assert.equal(accepted.accepted, true);
  session.step();

  const openingDeployments = session.replay.filter(({ type }) => type === "session-deployed");
  const southDeployment = openingDeployments.find(({ side }) => side === "south");
  const northDeployment = openingDeployments.find(({ side }) => side === "north");
  assert.equal(southDeployment.deployment.cardId, "cinder-host");
  assert.equal(southDeployment.deployment.entityIds.length, 15);
  assert.equal(northDeployment.deployment.cardId, "ironroot");
  assert.equal(northDeployment.deployment.entityIds.length, 1);
  assert.equal(southDeployment.spend.cost, 3);
  assert.equal(northDeployment.spend.cost, 7);

  const cinderPositionsAtDeploy = new Map(session.state.battle.units
    .filter(({ cardId, side }) => cardId === "cinder-host" && side === "south")
    .map(({ id, position }) => [id, position]));
  const ironrootId = northDeployment.deployment.entityIds[0];
  while (session.state.tick < 100) session.step();
  assert.ok(session.state.battle.units.some((unit) => unit.cardId === "cinder-host" &&
    unit.side === "south" && unit.alive && canonical(unit.position) !==
      canonical(cinderPositionsAtDeploy.get(unit.id))),
    "a surviving swarm member advances from its deployed position");
  assert.equal(liveUnit(session, "ironroot", "north").movement.speed, 750,
    "the single unit enters the runtime with its source movement speed");

  while (session.state.tick < RESTORE_CUT) session.step();
  const checkpoint = session.serialize();
  while (session.state.tick < FINAL_TICK) session.step();

  const cinderUnits = session.state.battle.units.filter(({ cardId, side }) =>
    cardId === "cinder-host" && side === "south");
  const ironrootUnit = session.state.battle.units.find(({ cardId, side }) =>
    cardId === "ironroot" && side === "north");
  assert.equal(cinderUnits.length, 15);
  assert.ok(cinderUnits.every(({ archetypeId, count, maxHealth }) =>
    archetypeId === "cinderling" && count === 15 && maxHealth === 81));
  assert.equal(cinderUnits.filter(({ alive }) => alive).length, 0);
  assert.ok(ironrootUnit);
  assert.equal(ironrootUnit.id, ironrootId);
  assert.equal(ironrootUnit.alive, false);

  const damageToIronroot = session.replay.filter(({ targetId, type }) =>
    type === "damage" && targetId === ironrootId);
  const damageFromIronroot = session.replay.filter(({ attackerId, type }) =>
    type === "damage" && attackerId === ironrootId);
  assert.ok(damageToIronroot.every(({ amount, delivery }) =>
    amount === 81 && delivery === "melee"));
  assert.ok(damageFromIronroot.every(({ amount, delivery }) =>
    amount === 816 && delivery === "melee"));
  const swarmHits = damageToIronroot;
  const ironrootHits = damageFromIronroot;
  assert.equal(swarmHits.length, 47);
  assert.equal(swarmHits.reduce((sum, { amount }) => sum + amount, 0), 3_807);
  assert.equal(swarmHits.at(-1).currentHealthAfter, 0);
  assert.equal(ironrootHits.length, 4);
  assert.equal(ironrootHits.reduce((sum, { amount }) => sum + amount, 0), 3_264);
  assert.equal(new Set(ironrootHits.map(({ targetId }) => targetId)).size, 4,
    "each heavy strike removes one 81-HP body");

  const restored = GameSession.restore(checkpoint);
  assert.equal(restored.serialize(), checkpoint, "the saved checkpoint restores byte-for-byte");
  restored.stepMany(FINAL_TICK - RESTORE_CUT);
  assert.equal(restored.serialize(), session.serialize());
  assert.equal(restored.replayBytes(), session.replayBytes());
  assert.deepEqual(restored.state, session.state);
});
