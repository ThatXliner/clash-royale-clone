import assert from "node:assert/strict";
import test from "node:test";

import {
  EDITABLE_MIXED_DECK_CARD_IDS,
  createEditableGameSessionSetup,
  createEditableMixedDeckWitness,
} from "../src/content/editable-deck.js";
import {
  EDITABLE_DECK_CARD_IDS,
  createEditableDeckWitness,
  createSessionTroopWitnessQuestions,
} from "../src/content/session-troop-roster.js";
import { PLAYABLE_CARD_IDS } from "../src/content/playable-roster.js";
import { projectSessionNonUnitBattleCard } from "../src/content/session-card-catalog.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";
import { LiveBattle } from "../src/sim/live-battle.js";
import { createShippedGameSessionSetup } from "../src/ui/game-browser-entry.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function combinationsOfEight() {
  return EDITABLE_DECK_CARD_IDS.map((_, start) =>
    Array.from({ length: 8 }, (_unused, offset) =>
      EDITABLE_DECK_CARD_IDS[(start + offset) % EDITABLE_DECK_CARD_IDS.length]));
}

function questionReferences(roster) {
  return roster.flatMap(({ entities }) => entities.flatMap((entity) => [
    ...[entity.bodyRadiusPolicy, entity.projectileSpeedPolicy, entity.deliveryPolicy,
      entity.layerPolicy, entity.damagePolicy]
      .filter((policy) => policy?.kind === "question")
      .map(({ questionKey }) => questionKey),
    ...(entity.sourceConfidencePolicy?.fields ?? []).map(({ questionKey }) => questionKey),
  ]));
}

function command(session, cardId, commandId = 0) {
  return canonical({
    cardId,
    commandId,
    point: { x: 3_500, y: 14_500 },
    slot: session.state.decks.south.hand.indexOf(cardId),
    tick: session.state.tick,
    type: "deploy",
  });
}

test("editable deck setup admits every card in canonical eight-card witnesses and closes QUESTION records", () => {
  assert.ok(EDITABLE_DECK_CARD_IDS.length >= PLAYABLE_CARD_IDS.length);
  assert.deepEqual(EDITABLE_DECK_CARD_IDS.slice(0, 8), PLAYABLE_CARD_IDS);
  const decks = combinationsOfEight();
  assert.equal(decks.length, EDITABLE_DECK_CARD_IDS.length);
  const originalQuestions = new Map();
  for (const id of EDITABLE_DECK_CARD_IDS) {
    for (const question of createSessionTroopWitnessQuestions(id)) {
      const previous = originalQuestions.get(question.key);
      if (previous !== undefined) assert.deepEqual(question, previous, question.key);
      else originalQuestions.set(question.key, question);
    }
  }

  for (const deck of decks) {
    const witness = createEditableDeckWitness(deck);
    assert.deepEqual(witness.roster.map(({ id }) => id), deck);
    assert.equal(new Set(witness.roster.map(({ id }) => id)).size, 8);
    assert.ok(witness.roster.flatMap(({ entities }) => entities).every((entity) =>
      (entity.deliveryPolicy?.kind === "question" ||
       entity.deliveryPolicy?.kind === "source-backed") &&
      entity.layerPolicy?.kind === "question"));

    const references = questionReferences(witness.roster);
    const expectedKeys = [...new Set(references)].sort();
    assert.deepEqual(witness.questions.map(({ key }) => key), expectedKeys);
    assert.ok(witness.questions.every(({ authoritative, confidence, disposition, key, value }) =>
      authoritative === false && confidence === "unverified" && disposition === "question" &&
      Number.isSafeInteger(value) &&
      (key === "kilnkeeper.character-area-damage-radius-millitiles" ? value === 0 : value > 0)));
    for (const question of witness.questions) {
      assert.deepEqual(question, originalQuestions.get(question.key), question.key);
    }

    const setup = createEditableGameSessionSetup(deck, 17);
    assert.equal(setup, canonical(JSON.parse(setup)));
    const decoded = JSON.parse(setup);
    assert.deepEqual(decoded.deck, deck);
    assert.deepEqual(JSON.parse(decoded.battleSetup).roster.map(({ id }) => id), deck);
    assert.deepEqual(JSON.parse(decoded.rosterWitness), {
      questions: JSON.parse(decoded.battleSetup).questions,
      roster: JSON.parse(decoded.battleSetup).roster,
    });
    const session = new GameSession(setup);
    assert.deepEqual(JSON.parse(session.serialize()).setup.deck, deck);

    const direct = new GameSession(setup);
    const expected = direct.stepMany(90);
    const chunked = new GameSession(setup);
    const actual = [...chunked.stepMany(13), ...chunked.stepMany(29),
      ...chunked.stepMany(48)];
    assert.deepEqual(actual, expected);
    assert.equal(chunked.serialize(), direct.serialize());
    assert.equal(GameSession.restore(direct.serialize()).serialize(), direct.serialize());
  }
});

test("editable deck setup preserves the shipped standard setup and selected order", () => {
  assert.equal(createEditableGameSessionSetup(PLAYABLE_CARD_IDS, 0),
    createShippedGameSessionSetup(0));
  assert.equal(createEditableGameSessionSetup(PLAYABLE_CARD_IDS, 23),
    createShippedGameSessionSetup(23));
  for (const seed of [0, 23]) {
    assert.equal(new GameSession(createEditableGameSessionSetup(PLAYABLE_CARD_IDS, seed)).serialize(),
      new GameSession(createShippedGameSessionSetup(seed)).serialize(),
      "the default eight-card GameSession state bytes remain unchanged");
  }

  const reordered = [...PLAYABLE_CARD_IDS].reverse();
  const decoded = JSON.parse(createEditableGameSessionSetup(reordered, 23));
  assert.deepEqual(decoded.deck, reordered);
  assert.deepEqual(JSON.parse(decoded.battleSetup).roster.map(({ id }) => id), reordered);
  assert.ok(JSON.parse(decoded.battleSetup).roster.every(({ entities }) =>
    entities.every(({ deliveryPolicy, layerPolicy }) =>
      deliveryPolicy?.kind === "question" && layerPolicy?.kind === "question")));
});

test("editable mixed witnesses retain troop questions and exact non-unit profile receipts", () => {
  const decks = [
    ["squall-orb", ...EDITABLE_DECK_CARD_IDS.slice(0, 7)],
    ["ember-basin", ...EDITABLE_DECK_CARD_IDS.slice(0, 7)],
    ["buried-coil", ...EDITABLE_DECK_CARD_IDS.slice(0, 7)],
    ["squall-orb", "ember-basin", ...EDITABLE_DECK_CARD_IDS.slice(0, 6)],
    ["buried-coil", "ember-basin", ...EDITABLE_DECK_CARD_IDS.slice(0, 6)],
  ];
  for (const deck of decks) {
    const witness = createEditableMixedDeckWitness(deck);
    assert.deepEqual(witness.roster.map(({ id }) => id), deck);
    assert.equal(witness.roster.filter(({ kind }) => kind === "effect").length,
      Number(deck.includes("squall-orb")));
    assert.equal(witness.roster.filter(({ kind }) => kind === "structure").length,
      Number(deck.includes("ember-basin")) + Number(deck.includes("buried-coil")));
    assert.deepEqual(witness.questions.map(({ key }) => key),
      [...new Set(questionReferences(witness.roster))].sort());

    const setup = JSON.parse(createEditableGameSessionSetup(deck, 1));
    const battleSetup = JSON.parse(setup.battleSetup);
    assert.deepEqual(setup.deck, deck);
    assert.deepEqual(JSON.parse(setup.rosterWitness).roster, battleSetup.roster);
    if (deck.includes("squall-orb")) {
      const radius = battleSetup.spellProfileReceipts.profiles.find(({ profileId }) =>
        profileId === "squall-orb-radius-v2");
      assert.ok(radius, "mixed setup retains the separate radius v2 receipt");
      assert.equal(radius.fact.areaDamageRadiusMillitiles, 2_500);
      assert.ok(Object.values(radius.policies).every(({ authoritative, disposition }) =>
        authoritative === false && disposition === "question"));
    } else {
      assert.equal(Object.hasOwn(battleSetup, "spellProfileReceipts"), false);
    }
    if (deck.includes("ember-basin")) {
      const actual = battleSetup.roster.find(({ id }) => id === "ember-basin");
      assert.deepEqual(actual, projectSessionNonUnitBattleCard("ember-basin"),
        "the editable witness carries the admitted defensive profile receipt byte-for-byte");
      assert.equal(actual.buildingRuntime.policy.disposition, "question");
      assert.equal(actual.buildingRuntime.policy.confidence, "unverified");
      assert.equal(actual.buildingRuntime.policy.corpusFields.damage.authoritative, false);
      assert.equal(actual.buildingRuntime.policy.corpusFields.damage.confidence, "unverified");
      assert.equal(actual.buildingRuntime.policy.corpusFields.damage.source,
        "pinned-pre-march-2023-building-constants");
    }
    if (deck.includes("buried-coil")) {
      const actual = battleSetup.roster.find(({ id }) => id === "buried-coil");
      assert.deepEqual(actual, projectSessionNonUnitBattleCard("buried-coil"),
        "the editable witness carries the existing Buried Coil profile and source receipt unchanged");
      assert.equal(actual.buildingRuntime.class, "defensive");
      assert.equal(actual.buildingRuntime.variant, "hidden");
      assert.equal(actual.buildingRuntime.policy.disposition, "question");
      assert.equal(actual.buildingRuntime.policy.confidence, "unverified");
      assert.deepEqual(actual.buildingRuntime.policy.corpusFields.cost, {
        authoritative: true,
        confidence: "high",
        source: "pinned-pre-march-2023-card-roster-identity",
        value: 4,
      }, "only the existing four-elixir card cost has high-confidence source support");
      for (const field of ["damage", "deployTicks", "firstHitTicks", "hitSpeedTicks",
        "hitpoints", "maxRange", "mode", "sightRange"]) {
        assert.equal(actual.buildingRuntime.policy.corpusFields[field].authoritative, false,
          `Buried Coil ${field} remains non-authoritative`);
        assert.equal(actual.buildingRuntime.policy.corpusFields[field].confidence, "unverified",
          `Buried Coil ${field} remains unverified`);
      }
    }
    assert.throws(() => createEditableDeckWitness(deck), /not supported/u,
      "the closed troop witness stays troop-only");
  }

  assert.ok(EDITABLE_MIXED_DECK_CARD_IDS.includes("squall-orb"));
  assert.ok(EDITABLE_MIXED_DECK_CARD_IDS.includes("ember-basin"));
  assert.ok(EDITABLE_MIXED_DECK_CARD_IDS.includes("buried-coil"));
  assert.equal(EDITABLE_MIXED_DECK_CARD_IDS.length, 21);
  assert.throws(() => createEditableMixedDeckWitness(PLAYABLE_CARD_IDS),
    /requires an admitted spell or structure/u);
  assert.throws(() => createEditableMixedDeckWitness([
    "squall-orb", "squall-orb", ...EDITABLE_DECK_CARD_IDS.slice(0, 6),
  ]), /unique/u);
});

test("editable mixed setup rejects missing troop QUESTIONs and forged building provenance", () => {
  const deck = ["squall-orb", "ember-basin", ...EDITABLE_DECK_CARD_IDS.slice(0, 6)];
  const valid = JSON.parse(createEditableGameSessionSetup(deck, 4));
  const missingQuestion = structuredClone(valid);
  const missingBattle = JSON.parse(missingQuestion.battleSetup);
  missingBattle.questions.pop();
  missingQuestion.battleSetup = canonical(missingBattle);
  missingQuestion.rosterWitness = canonical({ questions: missingBattle.questions,
    roster: missingBattle.roster });
  assert.throws(() => new GameSession(canonical(missingQuestion)),
    /question|witness|unresolved/iu, "every referenced troop QUESTION remains required");

  const forgedSource = structuredClone(valid);
  const forgedBattle = JSON.parse(forgedSource.battleSetup);
  const basin = forgedBattle.roster.find(({ id }) => id === "ember-basin");
  basin.buildingRuntime.policy.corpusFields.damage.source = "comparison-corpus-authoritative";
  forgedSource.battleSetup = canonical(forgedBattle);
  forgedSource.rosterWitness = canonical({ questions: forgedBattle.questions,
    roster: forgedBattle.roster });
  assert.throws(() => new GameSession(canonical(forgedSource)),
    /provenance|receipt/iu, "a mixed deck cannot forge the source attached to low-confidence damage");
});

test("editable mixed spell and Ember Basin replay spends and cycles each card once", () => {
  const deck = ["squall-orb", "ember-basin", ...EDITABLE_DECK_CARD_IDS.slice(0, 6)];
  let seed = 0;
  while (!deck.every((cardId) => !["squall-orb", "ember-basin"].includes(cardId) ||
      new DeckCycle({ deck, seed: `${seed}:south` }).state.hand.includes(cardId))) {
    seed += 1;
    assert.ok(seed < 1_000, "both supported non-unit cards share a deterministic starting hand");
  }
  const rawSetup = JSON.parse(createEditableGameSessionSetup(deck, seed));
  rawSetup.legalNorthDeployments = [];
  rawSetup.thinkIntervalTicks = 3_600;
  const session = new GameSession(canonical(rawSetup));
  const before = session.state;
  const structureSlot = before.decks.south.hand.indexOf("ember-basin");
  session.submitPlayerCommand(canonical({ cardId: "ember-basin", commandId: 0,
    point: { x: 3_500, y: 14_500 }, slot: structureSlot, tick: 0, type: "deploy" }));
  session.step();
  const afterStructure = session.state;
  assert.equal(afterStructure.decks.south.sequence, before.decks.south.sequence + 1);
  assert.equal(afterStructure.elixir.sides.south.amount, before.elixir.sides.south.amount - 4);
  assert.deepEqual(afterStructure.battle.structures.map(({ cardId, side }) => ({ cardId, side })),
    [{ cardId: "ember-basin", side: "south" }]);

  const spellSlot = afterStructure.decks.south.hand.indexOf("squall-orb");
  assert.notEqual(spellSlot, -1, "the other non-unit card remains available after the structure play");
  session.submitPlayerCommand(canonical({ cardId: "squall-orb", commandId: 1,
    point: { x: 8_500, y: 15_500 }, side: "south", slot: spellSlot,
    tick: afterStructure.tick, type: "spell" }));
  session.stepMany(3);
  const replay = session.replay;
  assert.equal(replay.filter(({ side, type }) =>
    side === "south" && type === "session-structure-deployed").length, 1);
  assert.equal(replay.filter(({ side, type }) =>
    side === "south" && type === "session-spell-played").length, 1);
  assert.ok(replay.some(({ profileId, type }) =>
    type === "spell-intent-resolved" && profileId === "squall-orb-radius-v2"));
  assert.equal(session.state.decks.south.sequence, before.decks.south.sequence + 2);
  assert.equal(session.state.elixir.sides.south.amount, before.elixir.sides.south.amount - 8);
  assert.equal(session.state.cardRuntime.history.filter(({ cardId }) =>
    cardId === "ember-basin" || cardId === "squall-orb").length, 2);
  const checkpoint = session.serialize();
  const restored = GameSession.restore(checkpoint);
  session.stepMany(90);
  restored.stepMany(90);
  assert.equal(restored.serialize(), session.serialize(),
    "the combined spell and structure history continues identically after restore");
  assert.equal(restored.replayBytes(), session.replayBytes());
});

test("editable mixed GameSession casts from center, spends, cycles, and restores pending impact", () => {
  const deck = ["squall-orb", ...EDITABLE_DECK_CARD_IDS.slice(0, 7)];
  let seed = 0;
  while (!new DeckCycle({ deck, seed: `${seed}:south` }).state.hand.includes("squall-orb")) {
    seed += 1;
    assert.ok(seed < 1_000, "a deterministic starting-hand witness exists");
  }
  const session = new GameSession(createEditableGameSessionSetup(deck, seed));
  const before = session.state;
  const slot = before.decks.south.hand.indexOf("squall-orb");
  assert.notEqual(slot, -1);
  assert.deepEqual(session.submitPlayerCommand(canonical({
    cardId: "squall-orb", commandId: 0, point: { x: 8_500, y: 15_500 },
    side: "south", slot, tick: 0, type: "spell",
  })), { accepted: true, commandId: 0, tick: 0, type: "player-command-admitted" });
  session.step();

  const pending = session.state;
  assert.equal(pending.decks.south.sequence, before.decks.south.sequence + 1);
  assert.equal(pending.elixir.sides.south.amount, before.elixir.sides.south.amount - 4);
  assert.equal(pending.battle.pendingSpellIntents[0].impactTick, 2);
  assert.equal(Object.hasOwn(pending.battle.pendingSpellIntents[0], "target"), false);
  const checkpoint = session.serialize();
  const restored = GameSession.restore(checkpoint);
  assert.equal(restored.serialize(), checkpoint);

  session.stepMany(2);
  restored.stepMany(2);
  assert.equal(restored.serialize(), session.serialize());
  assert.deepEqual(restored.state.battle.pendingSpellIntents, []);
  assert.ok(restored.replay.some(({ profileId, type }) =>
    type === "spell-intent-resolved" && profileId === "squall-orb-radius-v2"));
  assert.equal(restored.replayBytes(), session.replayBytes());
});

test("editable mixed AI chooses a legal Squall Orb cast without a selected target", () => {
  const deck = ["squall-orb", ...EDITABLE_DECK_CARD_IDS.slice(0, 7)];
  const setup = JSON.parse(createEditableGameSessionSetup(deck, 9));
  setup.thinkIntervalTicks = 1;
  const session = new GameSession(canonical(setup));
  assert.ok(session.state.decks.north.hand.includes("squall-orb"));

  const events = session.step();
  const cast = session.replay.find(({ side, type }) =>
    side === "north" && type === "session-spell-played");
  assert.ok(cast, "the shared opponent controller stages a spell from its legal card set");
  assert.deepEqual(events.map(({ type }) => type), ["session-spell-played"]);
  assert.equal(cast.intent.profileId, "squall-orb-radius-v2");
  assert.equal(Object.hasOwn(cast.intent, "target"), false,
    "the AI center cast does not choose a caller target");
  assert.equal(cast.spend.cost, 4);
  assert.equal(cast.spend.amountAfter, 6);
  assert.equal(session.state.battle.pendingSpellIntents[0].side, "north");
});

test("shared Cinderling archetype deploys from both cards and restores distinct member identities", () => {
  const deck = ["cinderlings", "cinder-host", ...PLAYABLE_CARD_IDS.slice(0, 6)];
  let seed = 0;
  while (true) {
    const hand = new DeckCycle({ deck, seed: `${seed}:south` }).state.hand;
    if (hand.includes("cinderlings") && hand.includes("cinder-host")) break;
    seed += 1;
    assert.ok(seed < 1_000, "both Cinder cards share a deterministic starting hand");
  }

  const session = new GameSession(createEditableGameSessionSetup(deck, seed));
  session.submitPlayerCommand(command(session, "cinderlings", 0));
  session.stepMany(61);
  assert.ok(session.state.decks.south.hand.includes("cinder-host"));
  session.submitPlayerCommand(command(session, "cinder-host", 1));
  session.stepMany(61);

  const southUnits = session.state.battle.units.filter(({ side }) => side === "south");
  assert.equal(southUnits.filter(({ cardId }) => cardId === "cinderlings").length, 3);
  assert.equal(southUnits.filter(({ cardId }) => cardId === "cinder-host").length, 15);
  assert.equal(new Set(southUnits.map(({ id }) => id)).size, southUnits.length,
    "member identities remain distinct across the shared archetype");
  const checkpoint = session.serialize();
  session.stepMany(90);
  const forward = session.serialize();
  const restored = GameSession.restore(checkpoint);
  restored.stepMany(90);
  assert.equal(restored.serialize(), forward,
    "shared body facts keep deterministic replay and restore continuation");

  const witness = createEditableDeckWitness(deck);
  const conflictingRoster = structuredClone(witness.roster);
  conflictingRoster.find(({ id }) => id === "cinder-host").entities[0].hitpoints += 1;
  assert.throws(() => new LiveBattle(canonical({
    initialWindupTicks: witness.initialWindupTicks,
    questions: witness.questions,
    roster: conflictingRoster,
  })), /duplicate archetype facts must be canonically identical/u,
  "a reused identity with conflicting body facts remains rejected");
});

test("editable Stonehauler deployment survives deterministic restore continuation", () => {
  const deck = ["stonehauler", ...PLAYABLE_CARD_IDS.slice(0, 7)];
  let seed = 0;
  while (!new DeckCycle({ deck, seed: `${seed}:south` }).state.hand.includes("stonehauler")) {
    seed += 1;
    assert.ok(seed < 1_000, "a deterministic starting-hand witness exists");
  }
  const setup = createEditableGameSessionSetup(deck, seed);
  const session = new GameSession(setup);
  session.submitPlayerCommand(command(session, "stonehauler"));
  session.stepMany(61);
  assert.ok(session.state.battle.units.some(({ cardId, side }) =>
    cardId === "stonehauler" && side === "south"));

  const restored = GameSession.restore(session.serialize());
  session.stepMany(75);
  restored.stepMany(75);
  assert.equal(restored.serialize(), session.serialize());
  assert.deepEqual(JSON.parse(restored.serialize()).setup.deck, deck);
});

test("new squads deploy through custom eight-card battles and restore exactly", () => {
  for (const [cardId, memberCount, hitpoints] of [
    ["thornscouts", 4, 202],
    ["forgeguard", 5, 670],
  ]) {
    const deck = [cardId, ...PLAYABLE_CARD_IDS.slice(0, 7)];
    let seed = 0;
    while (!new DeckCycle({ deck, seed: `${seed}:south` }).state.hand.includes(cardId)) {
      seed += 1;
      assert.ok(seed < 1_000, `${cardId} has a deterministic starting-hand witness`);
    }
    const session = new GameSession(createEditableGameSessionSetup(deck, seed));
    session.submitPlayerCommand(command(session, cardId));
    session.stepMany(61);
    const deployed = session.state.battle.units.filter(({ cardId: id, side }) =>
      id === cardId && side === "south");
    assert.equal(deployed.length, memberCount, `${cardId} materializes its complete squad`);
    assert.ok(deployed.every(({ hitpoints: hp }) => hp === hitpoints),
      `${cardId} members carry the pinned comparison health`);
    assert.equal(session.state.cardRuntime.history.find(({ cardId: id }) => id === cardId)?.cardId,
      cardId, `${cardId} is admitted through the real card runtime`);

    const checkpoint = session.serialize();
    session.stepMany(120);
    const forward = session.serialize();
    const restored = GameSession.restore(checkpoint);
    restored.stepMany(120);
    assert.equal(restored.serialize(), forward, `${cardId} replay after restore is deterministic`);
    assert.deepEqual(JSON.parse(restored.serialize()).setup.deck, deck,
      `${cardId} restore retains the custom deck`);
  }
});

test("seeded opponent naturally chooses both new projectile squads through typed receipts", () => {
  for (const [cardId, memberCount, hitpoints, damage, layer] of [
    ["sunthread-pair", 2, 304, 107, "ground"],
    ["duskwing-trio", 3, 230, 117, "air"],
  ]) {
    const deck = [cardId, ...PLAYABLE_CARD_IDS.slice(0, 7)];
    let fixture = null;
    for (let seed = 0; seed < 1_000 && fixture === null; seed += 1) {
      if (!new DeckCycle({ deck, seed: `${seed}:north` }).state.hand.includes(cardId)) continue;
      const setup = JSON.parse(createEditableGameSessionSetup(deck, seed));
      setup.thinkIntervalTicks = 1;
      const battleSetup = JSON.parse(setup.battleSetup);
      assert.equal(setup.legalNorthDeployments.length, 8,
        "the opponent keeps every naturally legal card candidate");
      const session = new GameSession(canonical(setup));
      assert.ok(session.state.decks.north.hand.includes(cardId),
        `${cardId} is held by the seeded opponent at decision time`);
      session.stepMany(1);
      const committed = session.replay.find(({ side, type }) =>
        side === "north" && type === "session-deployed");
      if (committed?.deployment.cardId === cardId) {
        fixture = { seed, session, committed, battleSetup };
      }
    }
    assert.ok(fixture, `${cardId} is chosen from an unmodified seeded legal set`);
    const { session, committed, battleSetup } = fixture;
    assert.equal(committed.deployment.entityIds.length, memberCount);
    assert.equal(committed.spend.cost, 3);

    const typedReceipt = session.state.cardRuntime.history.find(({ cardId: id }) => id === cardId);
    assert.deepEqual({ cardId: typedReceipt?.cardId, kind: typedReceipt?.kind,
      placementClass: typedReceipt?.placementClass }, {
      cardId, kind: "unit", placementClass: "ground_entity",
    });
    const units = session.state.battle.units.filter(({ cardId: id, side }) =>
      id === cardId && side === "north");
    assert.equal(units.length, 1, `${cardId} births only its first member on the first tick`);
    assert.ok(units.every((unit) => unit.maxHealth === hitpoints &&
      unit.damage === damage && unit.delivery === "projectile" && unit.layer === layer),
    `${cardId} opponent units keep their admitted squad and projectile facts`);

    const squad = battleSetup.roster.find(({ id }) => id === cardId);
    const intervals = squad?.entities.map(({ sourceConfidencePolicy }) =>
      sourceConfidencePolicy?.deploymentInterval);
    assert.ok(intervals?.length > 0 && intervals.every((interval) =>
      interval?.milliseconds === 100 &&
      interval.sourceId === "supercell-2020-06-02-multi-unit-deployment" &&
      interval.ticks === intervals[0].ticks),
    `${cardId} members share the admitted source-derived interval receipt`);
    const intervalTicks = intervals[0].ticks;
    const checkpoint = session.serialize();
    const restored = GameSession.restore(checkpoint);
    assert.equal(restored.serialize(), checkpoint);
    for (let elapsedTicks = 1; elapsedTicks <= intervalTicks * (memberCount - 1);
      elapsedTicks += 1) {
      session.stepMany(1);
      restored.stepMany(1);
      const expectedCount = Math.min(memberCount,
        1 + Math.floor(elapsedTicks / intervalTicks));
      const currentUnits = session.state.battle.units.filter(({ cardId: id, side }) =>
        id === cardId && side === "north");
      const restoredUnits = restored.state.battle.units.filter(({ cardId: id, side }) =>
        id === cardId && side === "north");
      assert.equal(currentUnits.length, expectedCount,
        `${cardId} birth count at state tick ${session.state.tick}`);
      assert.equal(restoredUnits.length, expectedCount,
        `${cardId} restored birth count at state tick ${restored.state.tick}`);
      assert.ok(currentUnits.every((unit) => unit.maxHealth === hitpoints &&
        unit.damage === damage && unit.delivery === "projectile" && unit.layer === layer),
      `${cardId} keeps typed projectile facts through each birth`);
      assert.equal(restored.serialize(), session.serialize(),
        `${cardId} partial squad restores exactly at tick ${session.state.tick}`);
    }
    assert.equal(session.state.battle.units.filter(({ cardId: id, side }) =>
      id === cardId && side === "north").length, memberCount,
    `${cardId} reaches its complete admitted count after all source intervals`);
    session.stepMany(120);
    restored.stepMany(120);
    assert.equal(restored.serialize(), session.serialize(),
      `${cardId} opponent continuation restores exactly`);
  }
});

test("editable deck rejects malformed, duplicate, unsupported, and noncanonical setups", () => {
  const defaultDeck = [...PLAYABLE_CARD_IDS];
  assert.throws(() => createEditableDeckWitness(defaultDeck.slice(1)), /exactly eight/u);
  assert.throws(() => createEditableDeckWitness([...defaultDeck, "stonehauler"]),
    /exactly eight/u);
  assert.throws(() => createEditableDeckWitness([
    ...defaultDeck.slice(0, 7), defaultDeck[0],
  ]), /unique/u);
  assert.throws(() => createEditableDeckWitness([
    ...defaultDeck.slice(0, 7), "railward",
  ]), /not supported/u);
  assert.throws(() => createEditableDeckWitness([
    ...defaultDeck.slice(0, 7), "bulwark-needle",
  ]), /not supported/u);
  assert.throws(() => createEditableDeckWitness("coilblade,mossguard"), /plain array/u);
  const sparse = new Array(8);
  for (let index = 0; index < 7; index += 1) sparse[index] = defaultDeck[index];
  assert.throws(() => createEditableDeckWitness(sparse), /dense array/u);
  const accessor = [...defaultDeck];
  Object.defineProperty(accessor, "0", { enumerable: true, get: () => defaultDeck[0] });
  assert.throws(() => createEditableDeckWitness(accessor), /data property/u);
  const extra = [...defaultDeck];
  extra.extra = true;
  assert.throws(() => createEditableDeckWitness(extra), /exact dense array/u);
  assert.throws(() => createEditableGameSessionSetup(defaultDeck, Number.NaN), /seed/u);

  const valid = JSON.parse(createEditableGameSessionSetup([
    "stonehauler", ...PLAYABLE_CARD_IDS.slice(0, 7),
  ]));
  valid.deck = [...valid.deck].reverse();
  assert.throws(() => new GameSession(canonical(valid)), /deck must exactly equal/u);
});
