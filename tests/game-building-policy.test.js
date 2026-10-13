import assert from "node:assert/strict";
import test from "node:test";

import { createDeathEffectsCatalog, createDeathEffectsQuestions } from "../src/content/cards/death-effects.js";
import { createResourceBuildingQuestionRecords } from "../src/content/cards/buildings-resource.js";
import { createUndergroundTravelBuildingQuestionRecords } from "../src/content/cards/buildings-travel.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
} from "../src/content/playable-roster.js";
import { projectSessionNonUnitBattleCard } from "../src/content/session-card-catalog.js";
import { createShippedGameSessionSetup } from "../src/ui/game-browser-entry.js";
import { GameSession } from "../src/sim/game-session.js";
import { createSessionBuildingRuntime } from "../src/sim/session-building-runtime.js";

const SOUTH = Object.freeze({ x: 3_500, y: 14_500 });
const NORTH = Object.freeze({ x: 3_500, y: 17_500 });
const DESTINATION = Object.freeze({ x: 3_500, y: 12_500 });

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
    [
      ...[entity.bodyRadiusPolicy, entity.projectileSpeedPolicy]
        .filter((policy) => policy.kind === "question").map(({ questionKey }) => questionKey),
      ...(entity.sourceConfidencePolicy?.fields ?? []).map(({ questionKey }) => questionKey),
    ])));
  const questions = createPlayableRosterQuestionRecords().filter(({ key }) => referenced.has(key));
  return { questions, roster };
}

function sessionSetup(cardId, { legalNorthCardIds = [], requiredNorthCardId = null } = {}) {
  const { questions, roster } = rosterFor(cardId);
  const deck = roster.map(({ id }) => id);
  const legalNorthDeployments = legalNorthCardIds.map((candidate) => ({
    cardId: candidate,
    point: NORTH,
  })).sort((left, right) => left.cardId.localeCompare(right.cardId));
  const common = {
    battleSetup: canonical({ initialWindupTicks: { central: 999, lane: 999 }, questions, roster }),
    deck,
    legalNorthDeployments,
    rosterWitness: canonical({ questions, roster }),
  };
  let seed = 0;
  for (; seed < 10_000; seed += 1) {
    const candidate = new GameSession(canonical({ ...common, seed,
      startingElixir: { north: 10, south: 10 }, thinkIntervalTicks: 3_600, thinkOffsetTicks: 0 }));
    const northHand = candidate.state.decks.north.hand;
    const southHand = candidate.state.decks.south.hand;
    if (southHand.includes(cardId) &&
        (requiredNorthCardId === null || northHand.includes(requiredNorthCardId))) break;
  }
  assert.ok(seed < 10_000, `missing deterministic hand witness for ${cardId}`);
  return canonical({ ...common, seed, startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 3_600, thinkOffsetTicks: 0 });
}

function sessionFor(cardId, options) {
  return new GameSession(sessionSetup(cardId, options));
}

function deploy(session, cardId) {
  const slot = session.state.decks.south.hand.indexOf(cardId);
  assert.notEqual(slot, -1, `${cardId} has a deterministic south-hand witness`);
  const command = { cardId, commandId: 0, point: SOUTH, slot,
    tick: session.state.tick, type: "deploy" };
  if (cardId === "burrow-rig") command.destination = DESTINATION;
  return session.submitPlayerCommand(canonical(command));
}

function setupWithPolicyMutation(cardId, mutate) {
  const setup = JSON.parse(sessionSetup(cardId));
  for (const key of ["battleSetup", "rosterWitness"]) {
    const witness = JSON.parse(setup[key]);
    const card = witness.roster.find(({ id }) => id === cardId);
    mutate(card.buildingRuntime);
    setup[key] = canonical(witness);
  }
  return canonical(setup);
}

const POLICY_CASES = Object.freeze([
  {
    cardId: "aether-well",
    fields: ["generationAmount", "generationCadenceTicks", "lifetimeTicks"],
    policy: () => {
      const records = createResourceBuildingQuestionRecords();
      return Object.fromEntries(["generationAmount", "generationCadenceTicks", "lifetimeTicks"]
        .map((key) => [key, records[key]]));
    },
  },
  {
    cardId: "burrow-rig",
    fields: ["travelSpeedMillitilesPerSecond", "emergenceSpawnDelayTicks", "lifetimeTicks"],
    policy: () => {
      const records = createUndergroundTravelBuildingQuestionRecords();
      return Object.fromEntries(["travelSpeedMillitilesPerSecond", "emergenceSpawnDelayTicks",
        "lifetimeTicks"].map((key) => [key, records[key]]));
    },
  },
  {
    cardId: "cinder-reliquary",
    fields: ["deathDamage", "radius", "towerModifier"],
    policy: () => {
      const records = createDeathEffectsQuestions();
      return { deathDamage: records.damage, radius: records.radius,
        towerModifier: records.towerModifier };
    },
  },
]);

test("game building policy: nondefensive profiles carry exact catalog QUESTION records through live structures", () => {
  for (const { cardId, fields, policy: expectedPolicy } of POLICY_CASES) {
    const profile = projectSessionNonUnitBattleCard(cardId).buildingRuntime;
    assert.deepEqual(profile.policy, expectedPolicy(), `${cardId}: field records match its catalog`);
    for (const field of fields) {
      const record = profile.policy[field];
      assert.equal(record.authoritative, false, `${cardId}.${field} is never source-backed`);
      assert.equal(record.disposition, "question", `${cardId}.${field} remains QUESTION`);
      const profileValue = field === "deathDamage" ? profile.deathDamage : profile[field];
      assert.deepEqual(record.value, profileValue, `${cardId}.${field} policy value matches the executed field`);
    }

    const runtime = createSessionBuildingRuntime(canonical({ profiles: [{ cardId,
      profile: structuredClone(profile) }], version: 1 }));
    const structure = runtime.materializePlacement(canonical({ cardId,
      destination: cardId === "burrow-rig" ? DESTINATION : null,
      id: 1, point: SOUTH, side: "south", tick: 0 }));
    assert.deepEqual(structure.policy, profile.policy, `${cardId}: live receipt retains policy records`);
    assert.deepEqual(runtime.validateStructureReceipt(canonical(structure)).policy, profile.policy,
      `${cardId}: live state boundary returns the exact policy records`);

    const omitted = structuredClone(structure);
    delete omitted.policy;
    assert.throws(() => runtime.validateStructureReceipt(canonical(omitted)), /shape/u,
      `${cardId}: live restore boundary rejects an omitted policy`);
    const forged = structuredClone(structure);
    const field = fields[0];
    forged.policy[field].authoritative = true;
    assert.throws(() => runtime.validateStructureReceipt(canonical(forged)), /provenance/u,
      `${cardId}: live restore boundary rejects source promotion`);
  }

  const profile = projectSessionNonUnitBattleCard("cinder-reliquary").buildingRuntime;
  const deathQuestion = createDeathEffectsQuestions().damage;
  assert.equal(profile.damage, createDeathEffectsCatalog()[0].damage,
    "160 remains the separate common-schema card damage field");
  assert.equal(profile.damage, 160);
  assert.equal(profile.deathDamage, deathQuestion.value,
    "200 is the separate death-effect QUESTION value");
  assert.equal(profile.deathDamage, 200);
  assert.equal(profile.policy.deathDamage.key, "damage",
    "the policy preserves the isolated effect record's key while naming its runtime meaning explicitly");

  const runtime = createSessionBuildingRuntime(canonical({ profiles: [{
    cardId: "cinder-reliquary", profile: structuredClone(profile),
  }], version: 1 }));
  const dead = structuredClone(runtime.materializePlacement(canonical({
    cardId: "cinder-reliquary", destination: null, id: 1, point: SOUTH, side: "south", tick: 0,
  })));
  dead.alive = false;
  dead.deathCause = "combat-damage";
  dead.hitpoints = 0;
  dead.targetable = false;
  const deathIntents = runtime.reduceBoundary(canonical({ structures: [dead], tick: 1,
    towers: [{ hitpoints: 1_000, id: "north:lane:west", position: SOUTH, side: "north" }], units: [] }));
  assert.deepEqual(deathIntents.intents.find(({ type, value }) =>
    type === "event" && value.type === "death-effect-hit")?.value, {
    amount: 70, origin: "death-effect", sourceId: 1, targetId: "north:lane:west",
    tick: 1, type: "death-effect-hit",
  }, "the provisional 200 death damage applies its provisional 35% tower modifier");
});

test("game building policy: stripped, forged, contradictory, and omitted policies reject at setup admission", () => {
  for (const { cardId, fields } of POLICY_CASES) {
    const field = fields[0];
    const mutations = [
      (profile) => { delete profile.policy[field]; },
      (profile) => { profile.policy[field].authoritative = true; },
      (profile) => {
        const value = profile.policy[field].value;
        profile.policy[field].value = Number.isSafeInteger(value) ? value + 1 : { ...value, numerator: 99 };
      },
      (profile) => { delete profile.policy; },
      (profile) => {
        const value = profile[field];
        profile[field] = Number.isSafeInteger(value) ? value + 1 : { ...value, numerator: 99 };
      },
    ];
    for (const [index, mutate] of mutations.entries()) {
      assert.throws(() => new GameSession(setupWithPolicyMutation(cardId, mutate)),
        /canonical session-card receipt|QUESTION record|provenance/u,
        `${cardId}: hostile policy variant ${index} rejects before a session can spend or deploy`);
    }
  }
});

test("game building policy: single steps, chunks, and restored sessions retain exact policy bytes", () => {
  for (const { cardId } of POLICY_CASES) {
    const direct = sessionFor(cardId);
    deploy(direct, cardId);
    const directEvents = [];
    for (let index = 0; index < 12; index += 1) directEvents.push(...direct.step());

    const chunked = sessionFor(cardId);
    deploy(chunked, cardId);
    const chunkEvents = chunked.stepMany(12);

    const partial = sessionFor(cardId);
    deploy(partial, cardId);
    partial.stepMany(5);
    const restored = GameSession.restore(partial.serialize());
    restored.stepMany(7);

    for (const candidate of [chunked, restored]) {
      assert.equal(candidate.serialize(), direct.serialize(), `${cardId}: canonical session bytes`);
      assert.equal(candidate.replayBytes(), direct.replayBytes(), `${cardId}: canonical replay bytes`);
      assert.deepEqual(candidate.state, direct.state, `${cardId}: canonical resumed state`);
      assert.deepEqual(candidate.state.battle.structures[0].policy,
        projectSessionNonUnitBattleCard(cardId).buildingRuntime.policy,
        `${cardId}: resumed live structure retains exact catalog policy`);
    }
    assert.deepEqual(chunkEvents, directEvents, `${cardId}: chunking preserves one-step events`);
  }

  const standardDeck = JSON.parse(createShippedGameSessionSetup(0)).deck;
  assert.deepEqual(standardDeck, ["coilblade", "mossguard", "copperskiff", "skymaul",
    "brassbolt", "reedsting", "briar-band", "cinderlings"],
  "the shipped seed-zero standard deck remains exact");
});
