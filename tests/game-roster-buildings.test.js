import assert from "node:assert/strict";
import test from "node:test";

import { createPlayableRoster, createPlayableRosterQuestionRecords } from "../src/content/playable-roster.js";
import {
  createSessionCardManifest,
  getSessionCardAdmissionRecord,
  projectSessionNonUnitBattleCard,
} from "../src/content/session-card-catalog.js";
import { GameSession } from "../src/sim/game-session.js";
import {
  SESSION_BUILDING_ADMITTED_IDS,
  SESSION_BUILDING_QUESTION_IDS,
} from "../src/sim/session-building-runtime.js";
import occurrenceBindings from "./fixtures/integration-occurrence-bindings.json" with { type: "json" };

const SOUTH = Object.freeze({ x: 3_500, y: 14_500 });
const NORTH = Object.freeze({ x: 3_500, y: 17_500 });
const TRAVEL_DESTINATION = Object.freeze({ x: 3_500, y: 12_500 });
const BUILDING_EXPORTS = new Set([
  "SPAWNER_BUILDING_IDENTITIES",
  "createDeathEffectsCatalog",
  "createDefensiveBuildingCatalog",
  "createResourceBuildingCatalog",
  "createUndergroundTravelBuildingCatalog",
]);
const BUILDING_CLASS_BY_ID = Object.freeze({
  "aether-well": "resource",
  "bulwark-needle": "defensive",
  "buried-coil": "defensive",
  "burrow-rig": "travel",
  "cinder-reliquary": "death-effect",
  "ember-basin": "defensive",
  "horizon-caster": "defensive",
  "prism-furnace": "defensive",
});

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function rosterFor(cardId) {
  const roster = structuredClone(createPlayableRoster());
  roster.splice(0, 1, structuredClone(projectSessionNonUnitBattleCard(cardId)));
  const referenced = new Set(roster.flatMap(({ entities }) => entities.flatMap((entity) =>
    [entity.bodyRadiusPolicy, entity.projectileSpeedPolicy]
      .filter((policy) => policy.kind === "question").map(({ questionKey }) => questionKey))));
  const questions = createPlayableRosterQuestionRecords().filter(({ key }) => referenced.has(key));
  return { questions, roster };
}

function gameSessionSetup({
  battleSetup,
  deck,
  legalNorthDeployments,
  rosterWitness,
  seed,
}) {
  return canonical({ battleSetup, deck, legalNorthDeployments, rosterWitness, seed,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: legalNorthDeployments.length > 0 ? 1 : 3_600, thinkOffsetTicks: 0 });
}

function seedFor(setup, cardId, northCardId = null) {
  for (let seed = 0; seed < 10_000; seed += 1) {
    const session = new GameSession(gameSessionSetup({ ...setup, seed }));
    const south = session.state.decks.south.hand;
    const north = session.state.decks.north.hand;
    if (south.includes(cardId) && (northCardId === null || north.includes(northCardId))) return seed;
  }
  throw new Error(`missing deterministic south hand witness for ${cardId}`);
}

function sessionSetup(cardId, {
  initialWindupTicks = { central: 999, lane: 999 },
  legalNorthCardIds = [],
  requiredNorthCardId = null,
  seed = null,
} = {}) {
  const { questions, roster } = rosterFor(cardId);
  const deck = roster.map(({ id }) => id);
  const legalNorthDeployments = legalNorthCardIds.map((candidate) => ({
    cardId: candidate,
    point: NORTH,
  })).sort((left, right) => left.cardId.localeCompare(right.cardId));
  const common = {
    battleSetup: canonical({ initialWindupTicks, questions, roster }),
    deck,
    legalNorthDeployments,
    rosterWitness: canonical({ questions, roster }),
  };
  const selectedSeed = seed ?? seedFor(common, cardId, requiredNorthCardId);
  return gameSessionSetup({ ...common, seed: selectedSeed });
}

function sessionFor(cardId, options = {}) {
  return new GameSession(sessionSetup(cardId, options));
}

function deploy(session, cardId, { commandId = 0, destination } = {}) {
  const slot = session.state.decks.south.hand.indexOf(cardId);
  assert.notEqual(slot, -1, `${cardId} must have a deterministic deck witness`);
  const command = { cardId, commandId, point: SOUTH, slot, tick: session.state.tick, type: "deploy" };
  if (destination !== undefined) command.destination = destination;
  return session.submitPlayerCommand(canonical(command));
}

test("game roster buildings: bulwark uses one real GameSession route, spend, cycle, materialization, and shared unit ingress", () => {
  const session = sessionFor("bulwark-needle", {
    legalNorthCardIds: ["mossguard"],
    requiredNorthCardId: "mossguard",
  });
  const before = session.state;
  deploy(session, "bulwark-needle");
  session.step();
  const after = session.state;
  const route = after.cardRuntime.history.find(({ cardId }) => cardId === "bulwark-needle");
  const committed = session.replay.find(({ type }) => type === "session-structure-deployed");

  assert.deepEqual(route?.kind, "structure");
  assert.equal(after.decks.south.sequence, before.decks.south.sequence + 1);
  assert.equal(after.elixir.sides.south.amount,
    before.elixir.sides.south.amount - getSessionCardAdmissionRecord("bulwark-needle").cost);
  assert.equal(after.battle.units.some(({ cardId }) => cardId === "bulwark-needle"), false,
    "a structure is never fabricated as a placeholder troop");
  assert.deepEqual(after.battle.structures.map(({ cardId, id }) => ({ cardId, id })),
    [{ cardId: "bulwark-needle", id: 2 }],
  "the north unit and south structure consume the one shared LiveBattle allocator in stable phase order");
  assert.equal(committed?.materialization.structureId, 2);
  assert.equal(committed?.route.sequence, route?.sequence);

  session.stepMany(61);
  assert.deepEqual(session.replay.find(({ buildingId, type }) =>
    buildingId === 2 && type === "structure-attack"), {
    amount: 212, buildingId: 2, targetId: 1, tick: 60, type: "structure-attack",
  });
  assert.deepEqual(session.replay.find(({ externalSourceId, type }) =>
    externalSourceId === "building:2" && type === "damage"), {
    amount: 212, currentHealthAfter: 1554, currentHealthBefore: 1766,
    delivery: "melee", externalSourceId: "building:2", targetId: 1, tick: 61, type: "damage",
  });
});

test("game roster buildings: the exact HA/INTEGRATION building occurrence subset is bijective and keeps global shared IDs explicit", () => {
  const manifest = createSessionCardManifest();
  const staticOccurrences = Object.keys(occurrenceBindings)
    .map((binding) => {
      const [exportName, id] = binding.split("\u0000");
      return { exportName, id };
    })
    .sort((left, right) => left.id.localeCompare(right.id) ||
      left.exportName.localeCompare(right.exportName));
  const occurrences = manifest.occurrences.filter(({ exportName }) => BUILDING_EXPORTS.has(exportName));
  const integrationOccurrences = staticOccurrences.filter(({ exportName }) => BUILDING_EXPORTS.has(exportName));
  const expected = [
    ["createResourceBuildingCatalog", "aether-well", "admitted"],
    ["SPAWNER_BUILDING_IDENTITIES", "bramble-cage", "question"],
    ["createDefensiveBuildingCatalog", "bulwark-needle", "admitted"],
    ["createDefensiveBuildingCatalog", "buried-coil", "admitted"],
    ["createUndergroundTravelBuildingCatalog", "burrow-rig", "admitted"],
    ["createDeathEffectsCatalog", "cinder-reliquary", "admitted"],
    ["createDefensiveBuildingCatalog", "ember-basin", "admitted"],
    ["SPAWNER_BUILDING_IDENTITIES", "ember-roost", "question"],
    ["createDefensiveBuildingCatalog", "horizon-caster", "admitted"],
    ["createDefensiveBuildingCatalog", "prism-furnace", "admitted"],
  ];
  assert.deepEqual(manifest.occurrences.map(({ exportName, id }) => ({ exportName, id })),
    staticOccurrences, "the HA manifest is the complete frozen INTEGRATION occurrence union");
  assert.deepEqual(occurrences.map(({ exportName, id, status }) => [exportName, id, status]), expected);
  assert.deepEqual(occurrences.map(({ exportName, id }) => ({ exportName, id })), integrationOccurrences);
  assert.deepEqual(manifest.counts, { admittedIds: 47, admittedOccurrences: 52,
    claimedIds: 53, claimedOccurrences: 58, excludedClaimedIds: 6,
    excludedClaimedOccurrences: 6, questionOnlyExports: 5 });
  assert.deepEqual(SESSION_BUILDING_ADMITTED_IDS, [
    "aether-well", "bulwark-needle", "buried-coil", "burrow-rig", "cinder-reliquary",
    "ember-basin", "horizon-caster", "prism-furnace",
  ]);
  assert.deepEqual(SESSION_BUILDING_QUESTION_IDS, ["bramble-cage", "ember-roost"]);

  const admittedOccurrences = occurrences.filter(({ status }) => status === "admitted")
    .map(({ exportName, id }) => ({ exportName, id }));
  const cards = manifest.cards.filter(({ id }) => SESSION_BUILDING_ADMITTED_IDS.includes(id));
  assert.equal(cards.length, 8);
  assert.ok(cards.every(({ kind }) => kind === "structure"));
  assert.deepEqual(cards.flatMap(({ id, occurrenceExports }) => occurrenceExports.map((exportName) =>
    ({ exportName, id }))).sort((left, right) => left.id.localeCompare(right.id) ||
      left.exportName.localeCompare(right.exportName)), admittedOccurrences,
  "each admitted building occurrence has exactly one card identity and each card occurrence is accounted for");
  assert.deepEqual(occurrences.filter(({ status }) => status === "question").map(({ id, reason }) => ({ id, reason })), [
    { id: "bramble-cage", reason: "identity-only claim lacks sourced kind/cost/deploy admission fields" },
    { id: "ember-roost", reason: "identity-only claim lacks sourced kind/cost/deploy admission fields" },
  ]);
  assert.deepEqual(manifest.cards.filter(({ occurrenceExports }) => occurrenceExports.length > 1)
    .map(({ id, occurrenceExports }) => ({ id, occurrenceExports })), [
    { id: "aegis-sage", occurrenceExports: ["createChampionAbilityCatalog", "createReflectionSpecialCatalog"] },
    { id: "emberlance", occurrenceExports: ["createChargeKnockbackCatalog", "createChargeSpecialCatalog"] },
    { id: "squall-orb", occurrenceExports: ["createInstantSpellCatalog", "createKnockbackSpecialCatalog",
      "createReturningSpellCatalog", "createTravelingLineSpellCatalog"] },
  ], "the full global occurrence union retains its intentional non-building shared IDs");
});

test("game roster buildings: every admitted identity uses exactly one kind-correct GameSession placement with no placeholder unit", () => {
  for (const cardId of SESSION_BUILDING_ADMITTED_IDS) {
    const session = sessionFor(cardId);
    const before = session.state;
    deploy(session, cardId, cardId === "burrow-rig" ? { destination: TRAVEL_DESTINATION } : {});
    const boundary = session.step();
    const after = session.state;
    const card = getSessionCardAdmissionRecord(cardId);
    const route = after.cardRuntime.history.filter((entry) => entry.cardId === cardId);
    const commits = session.replay.filter((entry) => entry.type === "session-structure-deployed" &&
      entry.materialization.cardId === cardId);
    const materializations = boundary.filter((entry) => entry.type === "structure-materialized" &&
      entry.cardId === cardId);
    assert.equal(card.kind, "structure", cardId);
    assert.equal(route.length, 1, `${cardId}: route exactly once`);
    assert.equal(route[0].kind, "structure", `${cardId}: kind-correct route`);
    assert.equal(commits.length, 1, `${cardId}: one session commit`);
    assert.equal(materializations.length, 1, `${cardId}: one LiveBattle materialization`);
    assert.equal(after.decks.south.sequence, before.decks.south.sequence + 1, `${cardId}: deck cycle once`);
    assert.equal(after.elixir.sides.south.amount, before.elixir.sides.south.amount - card.cost,
      `${cardId}: ElixirMatch spends once`);
    assert.deepEqual(after.battle.structures.map(({ cardId: actualId, id }) => ({ cardId: actualId, id })),
      [{ cardId, id: 1 }], `${cardId}: sole shared LiveBattle structure`);
    assert.equal(after.battle.units.some(({ cardId: actualId }) => actualId === cardId), false,
      `${cardId}: structure never becomes a placeholder troop`);
    assert.equal(after.battle.structures[0].class, BUILDING_CLASS_BY_ID[cardId],
      `${cardId}: exact receipt-pinned reducer class reaches the shared LiveBattle host`);
    const buildingRuntime = projectSessionNonUnitBattleCard(cardId).buildingRuntime;
    if (buildingRuntime?.class === "defensive") {
      assert.equal(buildingRuntime.policy.disposition, "question",
        `${cardId}: combat remains explicitly provisional`);
      assert.deepEqual(after.battle.structures[0].policy, buildingRuntime.policy,
        `${cardId}: exact corpus provenance reaches live shared structure state`);
    }
    assert.equal(commits[0].materialization.structureId, 1, `${cardId}: shared allocator receipt`);
  }
});

test("game roster buildings: identity-only spawner claims reject visibly and leave the real session unchanged", () => {
  for (const cardId of SESSION_BUILDING_QUESTION_IDS) {
    assert.throws(() => getSessionCardAdmissionRecord(cardId), /explicit QUESTION/u, cardId);
    assert.throws(() => projectSessionNonUnitBattleCard(cardId), /explicit QUESTION/u, cardId);
    const session = sessionFor("bulwark-needle");
    const before = session.serialize();
    assert.throws(() => session.submitPlayerCommand(canonical({ cardId, commandId: 0, point: SOUTH,
      slot: 0, tick: 0, type: "deploy" })), /unknown/u, cardId);
    assert.equal(session.serialize(), before, `${cardId}: no deck, elixir, battle, or history mutation`);
  }
});

test("game roster buildings: defensive QUESTION estimates reach shared attacks, concealment, ramp, and siege phases", () => {
  const scenarios = [
    ["bulwark-needle", 60, 212, true],
    ["buried-coil", 102, 230, true],
    ["ember-basin", 126, 222, true],
    ["prism-furnace", 132, 42, true],
    ["horizon-caster", 450, 266, false],
  ];
  for (const [cardId, tick, amount, needsNorthTarget] of scenarios) {
    const session = sessionFor(cardId, needsNorthTarget ? {
      legalNorthCardIds: ["mossguard"], requiredNorthCardId: "mossguard",
    } : {});
    deploy(session, cardId);
    session.stepMany(tick + 1);
    const buildingId = needsNorthTarget ? 2 : 1;
    assert.deepEqual(session.replay.find(({ buildingId: sourceId, type }) =>
      sourceId === buildingId && type === "structure-attack"), {
      amount, buildingId, targetId: needsNorthTarget ? 1 : "north:lane:west", tick,
      type: "structure-attack",
    }, `${cardId}: post-combat building reducer publishes its exact first attack`);
    if (cardId === "buried-coil") {
      assert.deepEqual(session.replay.find(({ type }) => type === "building-revealed"), {
        buildingId: 2, tick: 0, type: "building-revealed",
      });
    }
    if (cardId === "prism-furnace") {
      session.stepMany(96);
      assert.deepEqual(session.replay.filter(({ buildingId: sourceId, type }) =>
        sourceId === 2 && type === "ramp-contact").map(({ consecutiveHits, stageIndex, tick: eventTick }) =>
        ({ consecutiveHits, stageIndex, tick: eventTick })), [
        { consecutiveHits: 1, stageIndex: 0, tick: 132 },
        { consecutiveHits: 2, stageIndex: 0, tick: 156 },
        { consecutiveHits: 3, stageIndex: 1, tick: 180 },
        { consecutiveHits: 4, stageIndex: 1, tick: 204 },
        { consecutiveHits: 5, stageIndex: 2, tick: 228 },
      ]);
    }
  }
});

test("game roster buildings: Ember Basin splash contacts every authoritative same-circle target in stable ID order", () => {
  const session = sessionFor("ember-basin", {
    legalNorthCardIds: ["brassbolt", "briar-band", "cinderlings", "mossguard", "reedsting"],
    seed: 1,
  });
  deploy(session, "ember-basin");
  session.stepMany(128);
  assert.deepEqual(session.replay.filter(({ externalSourceId, type }) =>
    externalSourceId === "building:2" && type === "damage").map(({ amount, targetId, tick }) =>
    ({ amount, targetId, tick })), [
    { amount: 222, targetId: 1, tick: 127 },
    { amount: 222, targetId: 3, tick: 127 },
  ]);
});

test("game roster buildings: defensive lifetime reaches canonical terminal state in a bounded 1,800-tick real session", () => {
  const session = sessionFor("bulwark-needle");
  deploy(session, "bulwark-needle");
  session.stepMany(1_801);
  const structure = session.state.battle.structures[0];
  assert.deepEqual({
    alive: structure.alive,
    deathCause: structure.deathCause,
    hitpoints: structure.hitpoints,
    targetable: structure.targetable,
  }, {
    alive: false, deathCause: "expiry", hitpoints: 0, targetable: false,
  });
  assert.deepEqual(session.replay.filter(({ type }) => type === "structure-destroyed").at(-1), {
    buildingId: 1, cause: "expiry", reason: "lifetime", tick: 1_800,
    type: "structure-destroyed",
  });
});

test("game roster buildings: simultaneous two-owner Aether grants enter ElixirMatch once and preserve chunk/restore bytes", () => {
  const create = () => {
    const session = sessionFor("aether-well", {
      legalNorthCardIds: ["aether-well"],
      requiredNorthCardId: "aether-well",
    });
    deploy(session, "aether-well");
    return session;
  };
  const direct = create(); direct.stepMany(511);
  const chunked = create(); [1, 59, 451].forEach((count) => chunked.stepMany(count));
  const partial = create(); partial.stepMany(180);
  const restored = GameSession.restore(partial.serialize()); restored.stepMany(331);
  for (const candidate of [chunked, restored]) {
    assert.equal(candidate.serialize(), direct.serialize());
    assert.equal(candidate.replayBytes(), direct.replayBytes());
    assert.deepEqual(candidate.state, direct.state);
  }
  assert.deepEqual(direct.replay.filter(({ type }) => type === "building-resource-grant"), [
    { amount: 1, side: "south", sourceId: 1, tick: 510, type: "building-resource-grant" },
    { amount: 1, side: "north", sourceId: 2, tick: 510, type: "building-resource-grant" },
  ]);
  assert.deepEqual(direct.replay.filter(({ type }) => type === "building-resource-granted"), [
    { amountAfter: 8, amountGranted: 1, amountRequested: 1, buildingId: 1,
      side: "south", tick: 510, type: "building-resource-granted" },
    { amountAfter: 8, amountGranted: 1, amountRequested: 1, buildingId: 2,
      side: "north", tick: 510, type: "building-resource-granted" },
  ]);
  assert.equal(direct.replay.filter(({ type }) => type === "building-resource-grant").length, 2,
    "each causally emitted source grant reaches the sole ElixirMatch exactly once");
});

test("game roster buildings: Burrow Rig travels through the shared path state and freezes its unsourced child as QUESTION", () => {
  const create = () => {
    const session = sessionFor("burrow-rig");
    deploy(session, "burrow-rig", { destination: TRAVEL_DESTINATION });
    return session;
  };
  const direct = create(); direct.stepMany(160);
  const chunked = create(); [1, 59, 100].forEach((count) => chunked.stepMany(count));
  const partial = create(); partial.stepMany(100);
  const restored = GameSession.restore(partial.serialize()); restored.stepMany(60);
  for (const candidate of [chunked, restored]) {
    assert.equal(candidate.serialize(), direct.serialize());
    assert.equal(candidate.replayBytes(), direct.replayBytes());
    assert.deepEqual(candidate.state, direct.state);
  }
  const structure = direct.state.battle.structures[0];
  assert.deepEqual({ phase: structure.phase, position: structure.position, targetable: structure.targetable }, {
    phase: "emerged", position: TRAVEL_DESTINATION, targetable: true,
  });
  assert.ok(direct.replay.some(({ type }) => type === "underground-travel-started"));
  assert.ok(direct.replay.some(({ type }) => type === "underground-travel-moved"));
  assert.ok(direct.replay.some(({ type }) => type === "travel-building-emerged"));
  assert.deepEqual(direct.replay.filter(({ type }) => type === "travel-emergence-spawn-question"), [{
    buildingId: 1, reason: "spawn identity and combat fields are unsourced", tick: structure.emergedTick + 12,
    type: "travel-emergence-spawn-question",
  }]);
  assert.deepEqual(direct.state.battle.units, [], "no unsourced travel child becomes a placeholder unit");
});

test("game roster buildings: Cinder Reliquary dies from authoritative unit contact and triggers its death effect once", () => {
  const create = () => {
    const session = sessionFor("cinder-reliquary", {
      legalNorthCardIds: ["mossguard"], requiredNorthCardId: "mossguard",
    });
    deploy(session, "cinder-reliquary");
    return session;
  };
  const direct = create(); direct.stepMany(481);
  const chunked = create(); [1, 118, 360, 2].forEach((count) => chunked.stepMany(count));
  const partial = create(); partial.stepMany(479);
  const restored = GameSession.restore(partial.serialize()); restored.stepMany(2);
  for (const candidate of [chunked, restored]) {
    assert.equal(candidate.serialize(), direct.serialize());
    assert.equal(candidate.replayBytes(), direct.replayBytes());
    assert.deepEqual(candidate.state, direct.state);
  }
  const structure = direct.state.battle.structures[0];
  assert.deepEqual({ alive: structure.alive, deathCause: structure.deathCause,
    deathTriggered: structure.deathTriggered, hitpoints: structure.hitpoints }, {
    alive: false, deathCause: "combat-damage", deathTriggered: true, hitpoints: 0,
  });
  assert.deepEqual(direct.replay.filter(({ type }) => type === "death-effect-triggered"), [
    { sourceId: 2, tick: 479, type: "death-effect-triggered" },
  ]);
  assert.deepEqual(direct.replay.filter(({ origin, type }) => origin === "death-effect" &&
    type === "death-effect-hit"), [
    { amount: 160, origin: "death-effect", sourceId: 2, targetId: 1, tick: 479,
      type: "death-effect-hit" },
  ]);
  assert.deepEqual(direct.replay.filter(({ externalSourceId, tick, type }) =>
    externalSourceId === "building:2" && tick === 480 && type === "damage"), [
    { amount: 160, currentHealthAfter: 1126, currentHealthBefore: 1286, delivery: "melee",
      externalSourceId: "building:2", targetId: 1, tick: 480, type: "damage" },
  ]);
});
