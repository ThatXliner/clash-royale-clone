import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createEditableGameSessionSetup } from "../src/content/editable-deck.js";
import { getSessionTroopProfile } from "../src/content/session-troop-profile-catalog.js";
import { PLAYABLE_CARD_IDS, serializePlayableRoster } from "../src/content/playable-roster.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";
import { LiveBattle, parseLiveBattleSetup } from "../src/sim/live-battle.js";
import { createRLEnvironment, RLEnvironment } from "../src/rl/environment.js";

const CORE_IDS = Object.freeze([
  "brackenwheel", "coilblade", "mossguard", "ironroot",
]);
const DECK = Object.freeze([
  ...CORE_IDS,
  ...PLAYABLE_CARD_IDS.filter((id) => !CORE_IDS.includes(id)).slice(0, 4),
]);
const AREA_POLICY = Object.freeze({
  authoritative: false,
  center: "attacker",
  confidence: "question",
  contactOrder: "ascending-entity-id",
  geometry: "circle-overlap-inclusive",
  radiusMillitiles: 2_000,
  secondaryDamage: "base-attack",
  structureTargets: "exclude",
  targetLayers: Object.freeze(["ground"]),
  version: "melee-area-question-v1",
});

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function baseSetup(seed = 2) {
  return JSON.parse(createEditableGameSessionSetup(DECK, seed));
}

function battleSetup(seed = 2) {
  return JSON.parse(baseSetup(seed).battleSetup);
}

function schedule(battle, cardId, side, point, sequence) {
  return battle.scheduleDeploy(canonical({
    cardId,
    point,
    sequence,
    side,
    tick: 0,
  }));
}

function liveAreaBattle() {
  const setup = battleSetup();
  const battle = new LiveBattle(canonical(setup));
  schedule(battle, "brackenwheel", "south", { x: 3_500, y: 14_500 }, 0);
  schedule(battle, "coilblade", "north", { x: 2_500, y: 17_500 }, 1);
  schedule(battle, "mossguard", "north", { x: 3_500, y: 17_500 }, 2);
  schedule(battle, "ironroot", "north", { x: 4_500, y: 17_500 }, 3);
  return battle;
}

test("Brackenwheel mixed-deck profile carries closed per-field QUESTION receipts", () => {
  const defaultRosterBytes = serializePlayableRoster();
  assert.equal(defaultRosterBytes.length, 17_267);
  assert.equal(createHash("sha256").update(defaultRosterBytes).digest("hex"),
    "ae6c0bf3db8dce45c9eace06215b45c2972203d4ed08d6df6fe9f7cc925e0785");
  assert.equal(DECK.length, 8);
  assert.equal(new Set(DECK).size, 8);
  const profile = getSessionTroopProfile("brackenwheel");
  assert.deepEqual({
    cost: profile.cost,
    displayName: profile.displayName,
    id: profile.id,
    kind: profile.kind,
    placementClass: profile.placementClass,
  }, {
    cost: 4,
    displayName: "Brackenwheel",
    id: "brackenwheel",
    kind: "unit",
    placementClass: "ground_entity",
  });

  const setup = battleSetup();
  const card = setup.roster.find(({ id }) => id === "brackenwheel");
  const entity = card.entities[0];
  assert.deepEqual(entity.meleeAreaPolicy, AREA_POLICY);
  const brackenQuestions = setup.questions
    .filter(({ key }) => key.startsWith("brackenwheel."));
  const byKey = new Map(brackenQuestions.map((question) => [question.key, question]));
  const expectedValues = {
    "area-damage-radius-millitiles": 2_000,
    "body-radius-millitiles": 500,
    count: 1,
    damage: 267,
    delivery: 1,
    "deploy-time-ticks": 60,
    "first-hit-ticks": 84,
    "hit-speed-ticks": 90,
    hitpoints: 1_908,
    layer: 1,
    "melee-area-contact-order": 1,
    "movement-millitiles-per-second": 1_000,
    "range-millitiles": 1_200,
    "sight-range-millitiles": 5_500,
    "target-mode": 2,
  };
  assert.deepEqual(brackenQuestions.map(({ key }) => key).sort(),
    Object.keys(expectedValues).map((suffix) => `brackenwheel.${suffix}`).sort());
  for (const [suffix, value] of Object.entries(expectedValues)) {
    assert.deepEqual(byKey.get(`brackenwheel.${suffix}`), {
      authoritative: false,
      confidence: "unverified",
      disposition: "question",
      key: `brackenwheel.${suffix}`,
      source: "runtime-playability-estimate-not-comparison-corpus",
      value,
    });
  }

  const parsed = parseLiveBattleSetup(canonical(setup));
  assert.deepEqual(parsed.roster.find(({ id }) => id === "brackenwheel")
    .entities[0].meleeAreaPolicy, AREA_POLICY);
  for (const mutate of [
    (forged) => { delete forged.roster.find(({ id }) => id === "brackenwheel")
      .entities[0].meleeAreaPolicy; },
    (forged) => { forged.roster.find(({ id }) => id === "brackenwheel")
      .entities[0].meleeAreaPolicy.contactOrder = "descending-entity-id"; },
    (forged) => { forged.roster.find(({ id }) => id === "brackenwheel")
      .entities[0].meleeAreaPolicy.radiusMillitiles += 1; },
    (forged) => { forged.roster.find(({ id }) => id === "brackenwheel")
      .entities[0].areaDamageRadiusMillitiles += 1; },
    (forged) => { forged.questions = forged.questions.filter(({ key }) =>
      key !== "brackenwheel.melee-area-contact-order"); },
    (forged) => { forged.questions.find(({ key }) =>
      key === "brackenwheel.melee-area-contact-order").value = 2; },
  ]) {
    const forged = structuredClone(setup);
    mutate(forged);
    assert.throws(() => parseLiveBattleSetup(canonical(forged)),
      /question|confidence|source|melee-area|shape|policy/u);
  }
});

test("Brackenwheel live area contact is stable and survives exact restore and fork", () => {
  const battle = liveAreaBattle();
  for (let tick = 0; tick < 143; tick += 1) battle.step();
  const checkpoint = battle.serialize();
  const snapshot = JSON.parse(checkpoint);
  assert.deepEqual(snapshot.setup.roster.find(({ id }) => id === "brackenwheel")
    .entities[0].meleeAreaPolicy, AREA_POLICY);
  const restored = LiveBattle.restore(checkpoint);
  const forked = battle.fork();
  assert.equal(restored.serialize(), checkpoint);
  assert.equal(forked.serialize(), checkpoint);

  const continuations = [battle, restored, forked];
  const beforeContact = continuations.map((continuation) => continuation.step());
  assert.deepEqual(beforeContact[1], beforeContact[0]);
  assert.deepEqual(beforeContact[2], beforeContact[0]);
  const events = continuations.map((continuation) => continuation.step());
  assert.deepEqual(events[1], events[0]);
  assert.deepEqual(events[2], events[0]);
  const damage = events[0].filter(({ attackerId, type }) =>
    attackerId === 1 && type === "damage");
  assert.deepEqual(damage.map(({ targetId }) => targetId), [3, 2, 4],
    "primary resolves once; eligible secondaries resolve once in ascending ID order");
  assert.equal(new Set(damage.map(({ targetId }) => targetId)).size, 3);
  assert.ok(damage.every(({ amount }) => amount === 267));
  assert.deepEqual(damage.slice(1).map(({ meleeAreaPolicyVersion }) =>
    meleeAreaPolicyVersion), [AREA_POLICY.version, AREA_POLICY.version]);
  for (const continuation of continuations.slice(1)) {
    assert.equal(continuation.serialize(), battle.serialize());
    assert.deepEqual(continuation.replay, battle.replay);
  }

  const forged = JSON.parse(checkpoint);
  delete forged.setup.roster.find(({ id }) => id === "brackenwheel")
    .entities[0].meleeAreaPolicy;
  assert.throws(() => LiveBattle.restore(canonical(forged)),
    /question|confidence|source|melee-area|snapshot/u);
});

test("Brackenwheel GameSession AI contact applies primary and secondary damage once across restore forks", () => {
  const deck = ["brackenwheel", "briar-band", "coilblade", "mossguard", "ironroot",
    "copperskiff", "brassbolt", "reedsting"];
  const setup = JSON.parse(createEditableGameSessionSetup(deck, 2));
  setup.legalNorthDeployments = [{ cardId: "briar-band", point: { x: 3_500, y: 17_500 } }];
  setup.startingElixir = { north: 10, south: 10 };
  setup.thinkIntervalTicks = 1;
  const session = new GameSession(canonical(setup));
  const slot = session.state.decks.south.hand.indexOf("brackenwheel");
  assert.notEqual(slot, -1);
  assert.ok(session.state.decks.north.hand.includes("briar-band"));
  session.submitPlayerCommand(canonical({
    cardId: "brackenwheel",
    commandId: 0,
    point: { x: 3_500, y: 14_500 },
    slot,
    tick: 0,
    type: "deploy",
  }));
  session.stepMany(144);
  assert.equal(session.state.tick, 144);
  assert.deepEqual(session.replay.filter(({ attackerId, type }) =>
    type === "damage" && attackerId === 1), [], "checkpoint is immediately before the contact boundary");
  const checkpoint = session.serialize();
  const battleSetup = JSON.parse(JSON.parse(checkpoint).setup.battleSetup);
  assert.deepEqual(battleSetup.roster.find(({ id }) => id === "brackenwheel")
    .entities[0].meleeAreaPolicy, AREA_POLICY);

  for (const mutate of [
    (forged) => { delete forged.roster.find(({ id }) => id === "brackenwheel")
      .entities[0].meleeAreaPolicy; },
    (forged) => { forged.roster.find(({ id }) => id === "brackenwheel")
      .entities[0].meleeAreaPolicy.contactOrder = "descending-entity-id"; },
  ]) {
    const forgedSnapshot = JSON.parse(checkpoint);
    const forgedBattleSetup = JSON.parse(forgedSnapshot.setup.battleSetup);
    mutate(forgedBattleSetup);
    forgedSnapshot.setup.battleSetup = canonical(forgedBattleSetup);
    forgedSnapshot.setup.rosterWitness = canonical({
      questions: forgedBattleSetup.questions,
      roster: forgedBattleSetup.roster,
    });
    assert.throws(() => GameSession.restore(canonical(forgedSnapshot)),
      /melee-area|confidence|question|policy|witness/u);
  }

  const restored = GameSession.restore(checkpoint);
  const restoreFork = GameSession.restore(checkpoint);
  assert.equal(restored.serialize(), checkpoint);
  assert.equal(restoreFork.serialize(), checkpoint);
  for (const continuation of [session, restored, restoreFork]) continuation.stepMany(6);
  const hits = session.replay.filter(({ attackerId, type }) =>
    type === "damage" && attackerId === 1);
  assert.deepEqual(hits.map(({ targetId }) => targetId), [2, 3, 4],
    "one primary and two secondaries resolve once in stable entity-ID order");
  assert.ok(hits.every(({ amount, tick }) => amount === 267 && tick === 144));
  assert.deepEqual(hits.slice(1).map(({ meleeAreaPolicyVersion }) =>
    meleeAreaPolicyVersion), [AREA_POLICY.version, AREA_POLICY.version]);
  assert.equal(session.state.battle.units.find(({ id }) => id === 1)?.count, 1);
  const deployments = session.replay.filter(({ deployment, type }) =>
    type === "session-deployed" &&
    ["brackenwheel", "briar-band"].includes(deployment?.cardId));
  assert.deepEqual(deployments.map(({ deployment, side, spend }) =>
    [side, deployment.cardId, spend.accepted, spend.cost]), [
    ["south", "brackenwheel", true, 4],
    ["north", "briar-band", true, 3],
  ]);
  assert.equal(session.state.decks.south.sequence, 1);
  assert.equal(session.state.decks.north.sequence, 1);
  for (const continuation of [restored, restoreFork]) {
    assert.equal(continuation.serialize(), session.serialize());
    assert.equal(continuation.replayBytes(), session.replayBytes());
    assert.deepEqual(continuation.state, session.state);
  }
});

test("Brackenwheel player, AI, and RL deployments charge and cycle once", () => {
  const setup = baseSetup(2);
  setup.legalNorthDeployments = [{
    cardId: "brackenwheel",
    point: { x: 3_500, y: 17_500 },
  }];
  setup.startingElixir = { north: 10, south: 10 };
  setup.thinkIntervalTicks = 1;
  const session = new GameSession(canonical(setup));
  const playerSlot = session.state.decks.south.hand.indexOf("brackenwheel");
  assert.notEqual(playerSlot, -1);
  assert.ok(session.state.decks.north.hand.includes("brackenwheel"));
  session.submitPlayerCommand(canonical({
    cardId: "brackenwheel",
    commandId: 0,
    point: { x: 3_500, y: 14_500 },
    slot: playerSlot,
    tick: 0,
    type: "deploy",
  }));
  const events = session.stepMany(1);
  const deployed = events.filter(({ deployment, type }) =>
    type === "session-deployed" && deployment.cardId === "brackenwheel");
  assert.deepEqual(deployed.map(({ side }) => side), ["south", "north"]);
  assert.ok(deployed.every(({ spend }) => spend.accepted && spend.cost === 4 &&
    spend.amountAfter === 6));
  assert.equal(session.state.cardRuntime.history.filter(({ cardId }) =>
    cardId === "brackenwheel").length, 2);
  assert.equal(session.state.decks.south.sequence, 1);
  assert.equal(session.state.decks.north.sequence, 1);
  const checkpoint = session.serialize();
  assert.equal(GameSession.restore(checkpoint).serialize(), checkpoint);

  const deck = [...DECK];
  const rl = createRLEnvironment({ deck, seed: 2, strideTicks: 1, horizonTicks: 8 });
  const observation = rl.observe();
  const slot = observation.hand.indexOf("brackenwheel");
  assert.notEqual(slot, -1);
  const action = rl.actionSpace().actions.find(({ point, slot: actionSlot }) =>
    actionSlot === slot && point.x === 3_500 && point.y === 14_500);
  assert.ok(action);
  assert.equal(observation.actionMask[action.id], true);
  const transition = rl.step(action.id);
  assert.equal(transition.observation.elixir, observation.elixir - 4);
  assert.ok(transition.observation.units.some(({ cardId, side }) =>
    cardId === "brackenwheel" && side === "south"));
  assert.notEqual(transition.observation.hand[slot], "brackenwheel");
  const rlCheckpoint = rl.serialize();
  const restored = RLEnvironment.restore(rlCheckpoint);
  assert.equal(restored.serialize(), rlCheckpoint);
  assert.deepEqual(restored.observe(), rl.observe());
});
