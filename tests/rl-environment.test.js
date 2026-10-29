import assert from "node:assert/strict";
import test from "node:test";
import {
  createRLEnvironment,
  RL_ACTION_COUNT,
  RLEnvironment,
} from "../src/rl/environment.js";
import { EDITABLE_DECK_CARD_IDS } from "../src/content/session-troop-roster.js";
import { createEditableGameSessionSetup } from "../src/content/editable-deck.js";
import { PLAYABLE_CARD_IDS } from "../src/content/playable-roster.js";
import { projectSessionNonUnitBattleCard } from "../src/content/session-card-catalog.js";
import { createDefensiveBuildingQuestionRecords } from "../src/content/cards/buildings-defensive.js";
import { createResourceBuildingQuestionRecords } from "../src/content/cards/buildings-resource.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function checkpointWithEngineOperation(env, { pause, pending }) {
  const wrapper = JSON.parse(env.serialize());
  const session = GameSession.restore(wrapper.session);
  if (pending) {
    const observation = env.observe();
    const actionId = firstLegalDeployment(observation);
    const action = env.actionSpace().actions[actionId];
    session.submitPlayerCommand(JSON.stringify({
      cardId: observation.hand[action.slot],
      commandId: 0,
      point: action.point,
      slot: action.slot,
      tick: observation.tick,
      type: "deploy",
    }));
    wrapper.nextCommandId = 1;
  }
  if (pause) session.pause();
  wrapper.session = session.serialize();
  return canonical(wrapper);
}

function firstLegalDeployment(observation, slot = 0) {
  const start = 1 + slot * 576;
  const end = start + 576;
  for (let actionId = start; actionId < end; actionId += 1) {
    if (observation.actionMask[actionId]) return actionId;
  }
  throw new Error(`no legal deployment for hand slot ${slot}`);
}

function seedWithCardInHand(deck, cardId) {
  for (let seed = 0; seed < 1_000; seed += 1) {
    if (new DeckCycle({ deck, seed: `${seed}:south` }).state.hand.includes(cardId)) {
      return seed;
    }
  }
  throw new Error(`${cardId} has no bounded deterministic south hand witness`);
}

function seedWithCardOnlyInSouthHand(deck, cardId) {
  for (let seed = 0; seed < 1_000; seed += 1) {
    const south = new DeckCycle({ deck, seed: `${seed}:south` }).state.hand;
    const north = new DeckCycle({ deck, seed: `${seed}:north` }).state.hand;
    if (south.includes(cardId) && !north.includes(cardId)) return seed;
  }
  throw new Error(`${cardId} has no bounded south-only starting-hand witness`);
}

function buriedCoilHiddenQuestions() {
  const records = createDefensiveBuildingQuestionRecords();
  return Object.fromEntries([
    "hiddenInitialPolicy",
    "hiddenReconcealPolicy",
    "hiddenRevealAttackBoundary",
  ].map((key) => [key, records[key]]));
}

function checkpointWithBuriedCoilPolicyMutation(serialized, mutate) {
  const wrapper = JSON.parse(serialized);
  const session = JSON.parse(wrapper.session);
  for (const key of ["battleSetup", "rosterWitness"]) {
    const witness = JSON.parse(session.setup[key]);
    const card = witness.roster.find(({ id }) => id === "buried-coil");
    assert.ok(card?.buildingRuntime?.policy, "the canonical setup carries Buried Coil policy receipts");
    mutate(card.buildingRuntime.policy);
    session.setup[key] = canonical(witness);
  }
  wrapper.session = canonical(session);
  return canonical(wrapper);
}

function checkpointWithAetherWellPolicyMutation(serialized, mutate) {
  const wrapper = JSON.parse(serialized);
  const session = JSON.parse(wrapper.session);
  for (const key of ["battleSetup", "rosterWitness"]) {
    const witness = JSON.parse(session.setup[key]);
    const card = witness.roster.find(({ id }) => id === "aether-well");
    assert.ok(card?.buildingRuntime?.policy,
      "the canonical setup carries the complete Aether Well resource receipt");
    mutate(card.buildingRuntime.policy);
    session.setup[key] = canonical(witness);
  }
  wrapper.session = canonical(session);
  return canonical(wrapper);
}

function legacyV1AetherWellProfile() {
  const questions = createResourceBuildingQuestionRecords();
  return {
    class: "resource",
    deployTicks: 60,
    generationAmount: questions.generationAmount.value,
    generationCadenceTicks: questions.generationCadenceTicks.value,
    hitpoints: 1_070,
    lifetimeTicks: questions.lifetimeTicks.value,
    policy: Object.fromEntries(["generationAmount", "generationCadenceTicks", "lifetimeTicks"]
      .map((key) => [key, questions[key]])),
  };
}

function legacyV1AetherWellSetup(deck, seed) {
  const setup = JSON.parse(createEditableGameSessionSetup(deck, seed));
  for (const key of ["battleSetup", "rosterWitness"]) {
    const witness = JSON.parse(setup[key]);
    witness.roster.find(({ id }) => id === "aether-well").buildingRuntime =
      legacyV1AetherWellProfile();
    setup[key] = canonical(witness);
  }
  return canonical(setup);
}

test("RL environment exposes a finite action catalogue and masks legal deploys", () => {
  const env = createRLEnvironment({ seed: 17, strideTicks: 6, horizonTicks: 30 });
  const observation = env.reset();
  const space = env.actionSpace();

  assert.equal(RL_ACTION_COUNT, 2_305);
  assert.equal(space.actionCount, RL_ACTION_COUNT);
  assert.equal(space.actions.length, RL_ACTION_COUNT);
  assert.equal(space.version, 2);
  assert.equal(observation.version, 2,
    "the observation schema version advances with its new structures field");
  assert.deepEqual(space.actions[0], { id: 0, type: "wait" });
  assert.deepEqual(space.actions[1 + 2 * 576 + 5 * 18 + 4], {
    id: 1 + 2 * 576 + 5 * 18 + 4,
    point: { x: 4_500, y: 5_500 },
    slot: 2,
    type: "deploy",
  });
  assert.equal(observation.actionMask.length, RL_ACTION_COUNT);
  assert.equal(observation.actionMask[0], true);

  const cardId = observation.hand[0];
  const actionId = firstLegalDeployment(observation);
  const transition = env.step(actionId);
  assert.equal(transition.info.actionId, actionId);
  assert.equal(transition.info.ticksAdvanced, 6);
  assert.equal(transition.observation.tick, 6);
  assert.equal(transition.observation.status, "running");
  assert.ok(transition.observation.units.some((unit) =>
    unit.side === "south" && unit.cardId === cardId));
  assert.notEqual(transition.observation.hand[0], cardId,
    "playing the selected slot cycles the shared deck state");
});

test("RL reset, legal mask, deployment, restore, and fork preserve selected Stormkite", () => {
  const deck = ["stormkite", ...PLAYABLE_CARD_IDS.slice(0, 7)];
  const seed = seedWithCardInHand(deck, "stormkite");
  const env = createRLEnvironment({ deck, seed, strideTicks: 1, horizonTicks: 32 });
  const initial = env.reset();
  assert.deepEqual(JSON.parse(JSON.parse(env.serialize()).session).setup.deck, deck,
    "RL reset keeps the selected eight-card Stormkite deck in canonical setup");
  const slot = initial.hand.indexOf("stormkite");
  assert.notEqual(slot, -1, "the reset Stormkite deck exposes Stormkite in its RL hand");
  const action = env.actionSpace().actions.find(({ point, slot: actionSlot }) =>
    actionSlot === slot && point.x === 8_500 && point.y === 14_500);
  assert.ok(action, "the finite action catalogue contains a Stormkite own-side deployment cell");
  assert.equal(initial.actionMask[action.id], true,
    "the selected Stormkite deployment is legal in the RL action mask");

  const transition = env.step(action.id);
  assert.equal(transition.info.actionId, action.id);
  assert.equal(transition.info.ticksAdvanced, 1);
  assert.equal(transition.observation.tick, 1);
  assert.ok(transition.observation.units.some(({ cardId, side }) =>
    cardId === "stormkite" && side === "south"),
  "the RL action reaches the canonical GameSession and deploys Stormkite");

  const checkpoint = env.serialize();
  const snapshot = JSON.parse(checkpoint);
  const session = GameSession.restore(snapshot.session);
  const setup = JSON.parse(snapshot.session).setup;
  const policy = JSON.parse(setup.battleSetup).chainQuestionPolicy;
  assert.deepEqual(setup.deck, deck);
  assert.ok(setup.projectileRuntimeProfiles,
    "the selected Stormkite runtime profile stays attached to the RL GameSession");
  assert.equal(policy.cardId, "stormkite",
    "the explicit Stormkite chain QUESTION policy survives through the RL adapter");
  assert.ok(session.replay.some(({ deployment, side, type }) =>
    side === "south" && type === "session-deployed" &&
    deployment.cardId === "stormkite"),
  "the saved RL GameSession replay contains the committed canonical deployment");

  const restored = RLEnvironment.restore(checkpoint);
  const fork = RLEnvironment.restore(checkpoint);
  assert.equal(restored.serialize(), checkpoint);
  assert.deepEqual(restored.observe(), transition.observation);
  assert.deepEqual(restored.step(0), fork.step(0),
    "restored and forked Stormkite environments continue with identical observations");
  assert.equal(restored.serialize(), fork.serialize(),
    "the fork remains byte-identical through the next deterministic RL step");
});

test("seeded trajectories and restored checkpoints continue identically", () => {
  const config = { seed: "same-seed", strideTicks: 5, horizonTicks: 25 };
  const left = createRLEnvironment(config);
  const right = createRLEnvironment(config);
  assert.deepEqual(left.observe(), right.observe());
  const initial = left.serialize();
  left.reset();
  assert.equal(left.serialize(), initial, "reset without options reuses its selected config");
  left.reset({ seed: "replacement-seed" });
  const resetConfig = JSON.parse(left.serialize()).config;
  assert.equal(resetConfig.seed, "replacement-seed");
  assert.deepEqual(resetConfig.deck, PLAYABLE_CARD_IDS);
  assert.equal(resetConfig.strideTicks, config.strideTicks);
  assert.equal(resetConfig.horizonTicks, config.horizonTicks);
  left.reset({ seed: config.seed });
  assert.equal(left.serialize(), initial, "a partial reset can restore the original seed");

  for (const action of [firstLegalDeployment(left.observe()), 0]) {
    assert.deepEqual(left.step(action), right.step(action));
  }

  const restored = RLEnvironment.restore(left.serialize());
  assert.deepEqual(restored.observe(), left.observe());
  assert.deepEqual(restored.step(0), left.step(0));
  assert.deepEqual(restored.observe(), left.observe());
});

test("separate instances and a custom shared deck remain independent", () => {
  const customDeck = ["stonehauler", ...PLAYABLE_CARD_IDS.slice(0, 7)];
  const custom = createRLEnvironment({
    deck: customDeck,
    seed: 9,
    strideTicks: 2,
    horizonTicks: 8,
  });
  const other = createRLEnvironment({ seed: 9, strideTicks: 2, horizonTicks: 8 });
  const privileged = JSON.parse(custom.serialize());
  const engine = JSON.parse(privileged.session);

  assert.deepEqual(engine.setup.deck, customDeck);
  assert.ok(custom.observe().hand.every((cardId) => customDeck.includes(cardId)));
  const otherBefore = other.serialize();
  custom.step(0);
  assert.equal(other.serialize(), otherBefore);
});

test("RL mask casts an editable Squall Orb center point and restores its pending effect", () => {
  const deck = ["squall-orb", ...EDITABLE_DECK_CARD_IDS.slice(0, 7)];
  const env = createRLEnvironment({ deck, seed: 1, strideTicks: 1, horizonTicks: 5 });
  const observation = env.observe();
  const slot = observation.hand.indexOf("squall-orb");
  assert.notEqual(slot, -1, "the deterministic policy starts with Squall Orb in hand");
  const centerAction = env.actionSpace().actions.find(({ point, slot: actionSlot }) =>
    actionSlot === slot && point.x === 8_500 && point.y === 15_500);
  assert.ok(centerAction);
  assert.equal(observation.actionMask[centerAction.id], true,
    "the effect center placement is included in the policy's legal-action mask");

  const cast = env.step(centerAction.id);
  assert.equal(cast.observation.tick, 1);
  assert.equal(cast.observation.elixir, observation.elixir - 4);
  assert.notEqual(cast.observation.hand[slot], "squall-orb",
    "the shared deck cycles after the cast");
  const pendingBytes = env.serialize();
  const engine = JSON.parse(JSON.parse(pendingBytes).session);
  assert.ok(engine.transcript.some(({ command, type }) =>
    type === "submit" && command.type === "spell" && command.cardId === "squall-orb"),
  "the RL adapter submits a typed GameSession spell command");

  const restored = RLEnvironment.restore(pendingBytes);
  assert.equal(restored.serialize(), pendingBytes,
    "restore retains the pending radius effect and action counter exactly");
  assert.deepEqual(restored.step(0), env.step(0));
  assert.equal(restored.serialize(), env.serialize(),
    "pending effect replay remains byte-exact after restore");
});

test("RL reset and legal mask deploy sourced projectile cards with exact deck restore", () => {
  for (const [cardId, memberCount, hitpoints, damage, layer, cost] of [
    ["sunthread-pair", 2, 304, 107, "ground", 3],
    ["duskwing-trio", 3, 230, 117, "air", 3],
    ["kilnkeeper", 1, 720, 281, "ground", 5],
  ]) {
    const deck = [cardId, ...PLAYABLE_CARD_IDS.slice(0, 7)];
    const seed = seedWithCardInHand(deck, cardId);
    const horizonTicks = 20;
    const env = createRLEnvironment({ seed: 0, strideTicks: 1, horizonTicks });
    let observation = env.reset({ deck, seed, strideTicks: 1, horizonTicks });
    const slot = observation.hand.indexOf(cardId);
    assert.notEqual(slot, -1, `${cardId} is in the reset hand`);
    const action = env.actionSpace().actions.find(({ point, slot: actionSlot }) =>
      actionSlot === slot && point.x === 8_500 && point.y === 14_500);
    assert.ok(action, `${cardId} has a center own-side action`);
    assert.equal(observation.actionMask[action.id], true,
      `${cardId} center action is marked legal`);

    const transition = env.step(action.id);
    assert.equal(transition.info.actionId, action.id);
    assert.equal(transition.observation.tick, 1);
    observation = transition.observation;
    const publicUnits = transition.observation.units.filter(({ cardId: id, side }) =>
      id === cardId && side === "south");
    assert.equal(publicUnits.length, 1,
      `${cardId} exposes only its first member at the initial boundary`);
    assert.ok(publicUnits.every((unit) => unit.maxHitpoints === hitpoints &&
      unit.count === memberCount && unit.layer === layer));

    for (let elapsedTicks = 1; elapsedTicks <= 6 * (memberCount - 1); elapsedTicks += 1) {
      observation = env.step(0).observation;
      const visible = observation.units.filter(({ cardId: id, side }) =>
        id === cardId && side === "south");
      assert.equal(visible.length, Math.min(memberCount, 1 + Math.floor(elapsedTicks / 6)),
        `${cardId} reveals one member every six simulation ticks`);
    }

    const bytes = env.serialize();
    const snapshot = JSON.parse(bytes);
    const session = GameSession.restore(snapshot.session);
    assert.deepEqual(snapshot.config.deck, deck);
    assert.deepEqual(JSON.parse(snapshot.session).setup.deck, deck);
    const typedReceipt = session.state.cardRuntime.history.find(({ cardId: id }) => id === cardId);
    assert.deepEqual({ cardId: typedReceipt?.cardId, kind: typedReceipt?.kind,
      placementClass: typedReceipt?.placementClass }, {
      cardId, kind: "unit", placementClass: "ground_entity",
    });
    const committed = session.replay.find(({ side, type }) =>
      side === "south" && type === "session-deployed");
    assert.equal(committed?.deployment.cardId, cardId);
    assert.equal(committed?.deployment.entityIds.length, memberCount);
    assert.equal(committed?.spend.cost, cost);
    const runtimeUnits = session.state.battle.units.filter(({ cardId: id, side }) =>
      id === cardId && side === "south");
    assert.ok(runtimeUnits.every((unit) => unit.damage === damage &&
      unit.delivery === "projectile" && unit.layer === layer));

    const restored = RLEnvironment.restore(bytes);
    assert.equal(restored.serialize(), bytes);
    assert.deepEqual(restored.observe(), observation);
    assert.deepEqual(restored.step(0), env.step(0));
    assert.equal(restored.serialize(), env.serialize());
  }
});

test("RL observes Ember Basin targeting, damage, lifetime, and exact in-flight restore", () => {
  const deck = ["ember-basin", ...EDITABLE_DECK_CARD_IDS.slice(0, 7)];
  const seed = seedWithCardInHand(deck, "ember-basin");
  const env = createRLEnvironment({ deck, seed, strideTicks: 1, horizonTicks: 1_800 });
  const initial = env.observe();
  assert.deepEqual(initial.structures, []);
  const slot = initial.hand.indexOf("ember-basin");
  const action = env.actionSpace().actions.find(({ point, slot: actionSlot }) =>
    actionSlot === slot && point.x === 3_500 && point.y === 14_500);
  assert.ok(action, "the finite action catalogue has the legal Ember Basin center cell");
  assert.equal(initial.actionMask[action.id], true,
    "a ground-building deployment is exposed as a legal ground-entity action");

  let observation = env.step(action.id).observation;
  assert.equal(observation.tick, 1);
  assert.equal(observation.elixir, initial.elixir - 4);
  assert.notEqual(observation.hand[slot], "ember-basin",
    "the shared deck advances exactly once after structure placement");
  assert.deepEqual(observation.structures.map(({ cardId, id }) => ({ cardId, id })),
    [{ cardId: "ember-basin", id: 2 }]);
  let structure = observation.structures[0];
  assert.deepEqual({ alive: structure.alive, hitpoints: structure.hitpoints,
    layer: structure.layer, maxHitpoints: structure.maxHitpoints,
    owner: structure.owner, remainingTicks: structure.lifetime.remainingTicks,
    targetMode: structure.targetMode, totalTicks: structure.lifetime.totalTicks }, {
    alive: true, hitpoints: 1_356, layer: "ground", maxHitpoints: 1_356,
    owner: "south", remainingTicks: 1_799, targetMode: "ground", totalTicks: 1_800,
  });
  assert.deepEqual(structure.lifetime.question, {
    authoritative: false,
    confidence: "unverified",
    disposition: "question",
    key: "lifetimeTicks",
    source: "pre-evolutions-building-corpus-and-unsourced-policy-fixture",
    value: 1_800,
  });
  assert.equal(Object.hasOwn(structure, "hidden"), false,
    "non-hidden building roles keep the previous observation shape");
  assert.equal(Object.hasOwn(structure, "hiddenPolicyQuestions"), false,
    "hidden-only QUESTIONS are not attached to ordinary buildings");
  assert.equal(structure.policy.disposition, "question");
  assert.equal(structure.policy.confidence, "unverified");
  assert.equal(structure.policy.corpusFields.hitpoints.authoritative, false);
  assert.equal(structure.policy.corpusFields.hitpoints.confidence, "unverified");

  while (observation.tick < 120) observation = env.step(0).observation;
  structure = observation.structures[0];
  assert.ok(structure.hitpoints < structure.maxHitpoints,
    "a hostile troop can target and damage the live structure");
  const damagedBytes = env.serialize();
  const damagedSession = GameSession.restore(JSON.parse(damagedBytes).session);
  const incoming = damagedSession.replay.find(({ buildingId, type }) =>
    buildingId === structure.id && type === "structure-damaged");
  assert.ok(incoming && incoming.amountApplied > 0 && incoming.origin === "combat-damage");
  const attacker = observation.units.find(({ id }) => id === incoming.sourceId);
  assert.equal(attacker?.side, "north");
  assert.equal(attacker?.layer, "air");

  while (observation.tick < 127) observation = env.step(0).observation;
  structure = observation.structures[0];
  const target = observation.units.find(({ id }) => id === structure.attackState.targetId);
  assert.equal(target?.layer, "ground",
    "the Ember Basin runtime keeps its ground-only target mode when an air target is present");
  assert.equal(structure.targetKey, `unit:${structure.attackState.targetId}`);
  assert.equal(structure.attackState.phase, "cycling");
  assert.equal(structure.attackState.sequence, 1);

  const inFlightBytes = env.serialize();
  const inFlightSession = GameSession.restore(JSON.parse(inFlightBytes).session);
  assert.deepEqual(inFlightSession.state.battle.pendingBuildingHits.map((hit) => ({
    applyTick: hit.applyTick, origin: hit.origin, sourceId: hit.sourceId, targetId: hit.targetId,
  })), [
    { applyTick: 127, origin: "defensive-splash", sourceId: structure.id, targetId: 3 },
    { applyTick: 127, origin: "defensive-splash", sourceId: structure.id, targetId: 4 },
    { applyTick: 127, origin: "defensive-splash", sourceId: structure.id, targetId: 5 },
  ], "one shared splash contact queues all eligible ground targets in stable ID order");
  const restored = RLEnvironment.restore(inFlightBytes);
  assert.deepEqual(restored.observe(), observation);
  assert.equal(restored.serialize(), inFlightBytes);
  assert.deepEqual(restored.step(0), env.step(0));
  assert.equal(restored.serialize(), env.serialize(),
    "damaged structure state and queued contacts continue exactly after RL restore");
});

test("RL admits Aether Well with source-aligned resource observation and exact restore", () => {
  const deck = ["aether-well", ...EDITABLE_DECK_CARD_IDS.slice(0, 7)];
  const config = { deck, seed: 2, strideTicks: 1, horizonTicks: 3_900 };
  const env = createRLEnvironment(config);
  const initial = env.observe();
  assert.deepEqual(JSON.parse(env.serialize()).config.deck, deck);
  const slot = initial.hand.indexOf("aether-well");
  assert.notEqual(slot, -1, "the real RL setup places the selected structure in the player hand");
  const action = env.actionSpace().actions.find(({ point, slot: actionSlot }) =>
    actionSlot === slot && point.x === 3_500 && point.y === 14_500);
  assert.ok(action, "the finite action catalog contains the legal building center point");
  assert.equal(initial.actionMask[action.id], true,
    "the selected resource structure is admitted by the public legal action mask");
  assert.deepEqual(initial.structures, []);

  const transition = env.step(action.id);
  assert.equal(transition.info.actionId, action.id);
  assert.equal(transition.observation.tick, 1);
  assert.equal(transition.observation.elixir, initial.elixir - 6);
  assert.notEqual(transition.observation.hand[slot], "aether-well",
    "the actual player command spends and cycles the selected card once");
  const structures = transition.observation.structures.filter(({ cardId }) =>
    cardId === "aether-well");
  assert.deepEqual(structures.map(({ owner }) => owner).sort(), ["north", "south"],
    "seed 2 naturally deploys Aether Well for the opponent in the same GameSession tick");

  const profile = projectSessionNonUnitBattleCard("aether-well").buildingRuntime;
  const [south] = structures.filter(({ owner }) => owner === "south");
  assert.deepEqual(south, {
    ...south,
    attackState: null,
    cardId: "aether-well",
    deathCause: null,
    hitpoints: 1_070,
    layer: "ground",
    lifetime: {
      elapsedTicks: 1,
      remainingTicks: 3_899,
      totalTicks: 3_900,
      question: profile.policy.lifetimeTicks,
    },
    maxHitpoints: 1_070,
    owner: "south",
    policy: profile.policy,
    targetKey: null,
    targetMode: "none",
  });
  assert.deepEqual(south.policy, profile.policy,
    "the observation carries every canonical resource receipt unchanged");
  assert.equal(south.policy.generationAmount.authoritative, false);
  assert.equal(south.policy.generationAmount.confidence, "datamine-only");
  assert.equal(south.policy.deployTicks.authoritative, false);
  assert.equal(south.policy.hitpoints.authoritative, false);
  assert.equal(south.policy.resourceCapacity.authoritative, false);
  assert.equal(south.policy.recipientPolicy.authoritative, false);
  assert.deepEqual(JSON.parse(JSON.stringify(transition.observation)), transition.observation,
    "resource observations contain no undefined fields and remain canonical JSON data");

  const checkpoint = env.serialize();
  assert.throws(() => RLEnvironment.restore(checkpointWithAetherWellPolicyMutation(
    checkpoint, (policy) => { delete policy.lifetimeTicks; },
  )), /canonical session-card receipt/u,
  "the public restore API rejects a missing resource lifetime receipt");
  assert.throws(() => RLEnvironment.restore(checkpointWithAetherWellPolicyMutation(
    checkpoint, (policy) => { policy.generationCadenceTicks.value = 539; },
  )), /canonical session-card receipt/u,
  "the public restore API rejects a forged source-aligned cadence receipt");
  assert.equal(env.serialize(), checkpoint,
    "rejected restore candidates do not mutate the live RL environment");

  const legacySession = new GameSession(legacyV1AetherWellSetup(deck, 2));
  assert.equal(GameSession.restore(legacySession.serialize()).serialize(),
    legacySession.serialize(), "the host still restores its explicit v1 resource receipt");
  const legacyWrapper = JSON.parse(checkpoint);
  legacyWrapper.session = legacySession.serialize();
  legacyWrapper.nextCommandId = 0;
  assert.throws(() => RLEnvironment.restore(canonical(legacyWrapper)),
    /serialized environment configuration does not match its GameSession/u,
    "the RL restore API rejects a valid legacy setup against its current v2 deck configuration");

  const restored = RLEnvironment.restore(checkpoint);
  assert.equal(restored.serialize(), checkpoint);
  assert.deepEqual(restored.observe(), transition.observation);
  assert.deepEqual(restored.step(0), env.step(0));
  assert.equal(restored.serialize(), env.serialize(),
    "restored observations and deterministic continuation remain byte-identical");
});

test("RL admits Buried Coil in a custom eight-card deck and restores its QUESTION observation", () => {
  const deck = ["buried-coil", ...EDITABLE_DECK_CARD_IDS.slice(0, 7)];
  const seed = seedWithCardOnlyInSouthHand(deck, "buried-coil");
  const env = createRLEnvironment({ deck, seed, strideTicks: 1, horizonTicks: 12 });
  const initial = env.observe();
  assert.deepEqual(JSON.parse(env.serialize()).config.deck, deck);
  const slot = initial.hand.indexOf("buried-coil");
  assert.notEqual(slot, -1, "the selected mixed deck exposes Buried Coil in the player hand");
  const action = env.actionSpace().actions.find(({ point, slot: actionSlot }) =>
    actionSlot === slot && point.x === 3_500 && point.y === 14_500);
  assert.ok(action, "the ordinary ground-building action is present in the finite action catalog");
  assert.equal(initial.actionMask[action.id], true,
    "the selected Buried Coil card is legal in the RL action mask");

  const transition = env.step(action.id);
  assert.equal(transition.info.actionId, action.id);
  assert.equal(transition.observation.tick, 1);
  assert.equal(transition.observation.elixir, initial.elixir - 4);
  assert.notEqual(transition.observation.hand[slot], "buried-coil",
    "the real RL action spends and cycles the selected card exactly once");
  const [structure] = transition.observation.structures.filter(({ cardId, owner }) =>
    cardId === "buried-coil" && owner === "south");
  assert.ok(structure?.alive, "the shared GameSession materializes the real defensive building");
  assert.equal(structure.layer, "ground");
  assert.equal(structure.targetMode, "air_and_ground");
  assert.equal(structure.policy.disposition, "question");
  assert.equal(structure.policy.confidence, "unverified");
  assert.deepEqual(structure.policy.corpusFields.cost, {
    authoritative: true,
    confidence: "high",
    source: "pinned-pre-march-2023-card-roster-identity",
    value: 4,
  });
  assert.deepEqual(structure.lifetime.question, {
    authoritative: false,
    confidence: "unverified",
    disposition: "question",
    key: "lifetimeTicks",
    source: "pre-evolutions-building-corpus-and-unsourced-policy-fixture",
    value: 1_800,
  });
  assert.equal(typeof structure.hidden, "boolean",
    "the RL boundary exposes the canonical live hidden state for this role");
  assert.equal(structure.hidden, !structure.targetable,
    "concealment and targetability reflect the same canonical structure state");
  assert.deepEqual(structure.hiddenPolicyQuestions, buriedCoilHiddenQuestions(),
    "the structure carries the separate canonical hidden-policy QUESTION receipts");
  for (const field of ["damage", "deployTicks", "firstHitTicks", "hitSpeedTicks",
    "hitpoints", "maxRange", "mode", "sightRange"]) {
    assert.equal(structure.policy.corpusFields[field].authoritative, false,
      `${field} remains non-authoritative in the RL observation`);
    assert.equal(structure.policy.corpusFields[field].confidence, "unverified",
      `${field} remains unverified in the RL observation`);
  }

  const checkpoint = env.serialize();
  const restored = RLEnvironment.restore(checkpoint);
  assert.equal(restored.serialize(), checkpoint,
    "the exact mixed-deck setup and live Buried Coil state survive authenticated restore");
  assert.deepEqual(restored.observe(), transition.observation);
  assert.deepEqual(restored.step(0), env.step(0));
  assert.equal(restored.serialize(), env.serialize(),
    "restored RL observations and deterministic continuation remain byte-identical");
});

test("RL exposes Buried Coil conceal, reveal, reconceal, and restored QUESTION state", () => {
  const deck = ["buried-coil", "mossguard", "duskwing-trio", "coilblade",
    "copperskiff", "skymaul", "brassbolt", "reedsting"];
  const env = createRLEnvironment({ deck, seed: 1, strideTicks: 30, horizonTicks: 1_200 });
  const initial = env.observe();
  const slot = initial.hand.indexOf("buried-coil");
  assert.notEqual(slot, -1);
  const deployment = env.actionSpace().actions.find(({ point, slot: actionSlot }) =>
    actionSlot === slot && point.x === 3_500 && point.y === 9_500);
  assert.ok(deployment && initial.actionMask[deployment.id],
    "the selected card has an ordinary legal deployment cell outside initial sight");

  let observation = env.step(deployment.id).observation;
  let [structure] = observation.structures.filter(({ cardId, owner }) =>
    cardId === "buried-coil" && owner === "south");
  assert.ok(structure?.alive);
  assert.equal(structure.hidden, true,
    "the actual structure begins concealed before an eligible enemy arrives in sight");
  assert.equal(structure.targetable, false);
  assert.deepEqual(structure.hiddenPolicyQuestions, buriedCoilHiddenQuestions());

  while (structure.hidden && observation.tick < 300) {
    observation = env.step(0).observation;
    structure = observation.structures.find(({ id }) => id === structure.id);
  }
  assert.equal(structure.hidden, false,
    "the actual seeded opponent causes the shared structure runtime to reveal the building");
  assert.equal(structure.targetable, true);
  assert.ok(Number.isSafeInteger(structure.attackState.targetId),
    "the revealed observation names the live canonical target");

  const revealedCheckpoint = env.serialize();
  assert.throws(() => RLEnvironment.restore(checkpointWithBuriedCoilPolicyMutation(
    revealedCheckpoint, (policy) => { delete policy.corpusFields.mode; },
  )), /canonical session-card receipt/u,
  "the real RL restore route rejects a missing canonical profile QUESTION receipt");
  assert.throws(() => RLEnvironment.restore(checkpointWithBuriedCoilPolicyMutation(
    revealedCheckpoint, (policy) => { policy.corpusFields.damage.authoritative = true; },
  )), /canonical session-card receipt/u,
  "the real RL restore route rejects a forged source-confidence receipt");
  const restored = RLEnvironment.restore(revealedCheckpoint);
  assert.equal(restored.serialize(), revealedCheckpoint);
  assert.deepEqual(restored.observe(), observation,
    "restore reproduces hidden state and the exact QUESTION receipts from the canonical profile");
  const reconcealed = env.step(0);
  assert.deepEqual(restored.step(0), reconcealed,
    "restored and original branches cross the same visibility boundary");
  observation = reconcealed.observation;
  structure = observation.structures.find(({ id }) => id === structure.id);
  assert.equal(structure.hidden, true,
    "when the eligible target leaves, the live building reports its reconcealed state");
  assert.equal(structure.targetable, false);
  assert.equal(structure.attackState.targetId, null);
  assert.deepEqual(structure.hiddenPolicyQuestions, buriedCoilHiddenQuestions());

  const session = GameSession.restore(JSON.parse(env.serialize()).session);
  assert.deepEqual(session.replay.filter(({ buildingId, type }) =>
    buildingId === structure.id && ["building-hidden", "building-revealed"].includes(type)
  ).map(({ type }) => type), ["building-revealed", "building-hidden"],
  "the reported state changes correspond to the canonical causal visibility events");
});

test("RL keeps Buried Coil's lifetime QUESTION through restore and its expiry boundary", () => {
  const deck = ["buried-coil", ...EDITABLE_DECK_CARD_IDS.slice(0, 7)];
  const env = createRLEnvironment({ deck, seed: 2, strideTicks: 300, horizonTicks: 1_801 });
  const initial = env.observe();
  const slot = initial.hand.indexOf("buried-coil");
  assert.notEqual(slot, -1);
  const deployment = env.actionSpace().actions.find(({ point, slot: actionSlot }) =>
    actionSlot === slot && point.x === 3_500 && point.y === 500);
  assert.ok(deployment && initial.actionMask[deployment.id]);

  let observation = env.step(deployment.id).observation;
  let structure = observation.structures.find(({ cardId, owner }) =>
    cardId === "buried-coil" && owner === "south");
  assert.equal(structure.hidden, true);
  while (observation.tick < 1_800) observation = env.step(0).observation;
  structure = observation.structures.find(({ id }) => id === structure.id);
  assert.equal(observation.tick, 1_800);
  assert.equal(structure.alive, true);
  assert.equal(structure.hidden, true);
  assert.deepEqual(structure.lifetime, {
    elapsedTicks: 1_800,
    remainingTicks: 0,
    totalTicks: 1_800,
    question: createDefensiveBuildingQuestionRecords().lifetimeTicks,
  }, "the live value and separate lifetime behavior remain explicit QUESTIONS");
  assert.deepEqual(structure.hiddenPolicyQuestions, buriedCoilHiddenQuestions());

  const checkpoint = env.serialize();
  const restored = RLEnvironment.restore(checkpoint);
  assert.equal(restored.serialize(), checkpoint);
  assert.deepEqual(restored.observe(), observation);
  assert.deepEqual(restored.step(0), env.step(0));
  observation = restored.observe();
  structure = observation.structures.find(({ id }) => id === structure.id);
  assert.equal(observation.tick, 1_801);
  assert.equal(structure.alive, false);
  assert.equal(structure.deathCause, "expiry");
  assert.equal(structure.hidden, true,
    "the observation retains the last canonical hidden state after expiry");
  const session = GameSession.restore(JSON.parse(restored.serialize()).session);
  assert.ok(session.replay.some(({ buildingId, reason, type }) =>
    buildingId === structure.id && type === "structure-destroyed" && reason === "lifetime"));
});

test("horizon clipping truncates exactly and rejects later steps", () => {
  const env = createRLEnvironment({ seed: 4, strideTicks: 7, horizonTicks: 10 });
  const first = env.step(0);
  assert.equal(first.observation.tick, 7);
  assert.equal(first.terminated, false);
  assert.equal(first.truncated, false);

  const second = env.step(0);
  assert.equal(second.observation.tick, 10);
  assert.equal(second.terminated, false);
  assert.equal(second.truncated, true);
  assert.equal(second.observation.status, "truncated");
  assert.ok(second.observation.actionMask.every((legal) => legal === false));
  const checkpoint = env.serialize();
  const restored = RLEnvironment.restore(checkpoint);
  assert.deepEqual(restored.observe(), second.observation);
  assert.throws(() => env.step(0), /finished RL environment/);
  assert.throws(() => restored.step(0), /finished RL environment/);
  assert.equal(env.serialize(), checkpoint);
});

test("restore rejects paused or pending GameSession checkpoints", () => {
  const env = createRLEnvironment({ seed: 22, strideTicks: 4, horizonTicks: 20 });
  for (const state of [
    { pause: true, pending: false },
    { pause: false, pending: true },
    { pause: true, pending: true },
  ]) {
    const checkpoint = checkpointWithEngineOperation(env, state);
    assert.throws(() => RLEnvironment.restore(checkpoint),
      /cannot contain a paused session or pending player commands/);
  }
});

test("masked and out-of-range actions are atomic", () => {
  const env = createRLEnvironment({ seed: 5, strideTicks: 4, horizonTicks: 20 });
  const observation = env.observe();
  const masked = observation.actionMask.findIndex((legal, id) => id > 0 && !legal);
  const checkpoint = env.serialize();

  assert.notEqual(masked, -1);
  assert.throws(() => env.step(masked), /masked/);
  assert.throws(() => env.step(RL_ACTION_COUNT), /actionId/);
  assert.throws(() => env.step(1.5), /actionId/);
  assert.equal(env.serialize(), checkpoint);
  assert.equal(env.observe().tick, observation.tick);
});

test("observations are allowlisted, JSON-safe, and detached", () => {
  const env = createRLEnvironment({ seed: "private-policy-seed", strideTicks: 2, horizonTicks: 10 });
  const observation = env.observe();
  const allowed = [
    "actionMask", "crowns", "elixir", "hand", "next", "phase", "status",
    "structures", "tick", "towers", "units", "version",
  ];
  assert.deepEqual(Object.keys(observation).sort(), [...allowed].sort());
  assert.deepEqual(JSON.parse(JSON.stringify(observation)), observation);
  const serialized = JSON.stringify(observation);
  for (const forbidden of ["private-policy-seed", "opponent", "rng", "transcript", "pending", "queue"]) {
    assert.equal(serialized.includes(forbidden), false, `policy output leaked ${forbidden}`);
  }

  const original = structuredClone(observation);
  observation.actionMask[0] = false;
  observation.hand[0] = "changed";
  observation.towers[0].hitpoints = -1;
  observation.towers[0].position.x = -1;
  assert.deepEqual(env.observe(), original);

  const space = env.actionSpace();
  space.actions[0].id = 99;
  space.actions[1].point.x = -1;
  assert.deepEqual(env.actionSpace().actions[0], { id: 0, type: "wait" });
  assert.equal(env.actionSpace().actions[1].point.x, 500);
});

test("natural engine completion reports one sparse reward and seals the episode", () => {
  const env = createRLEnvironment({
    seed: 2,
    strideTicks: 600,
    horizonTicks: 18_000,
  });
  let observation = env.observe();
  let result;
  let steps = 0;
  let deployments = 0;
  let totalReward = 0;
  while (observation.status === "running") {
    let actionId = 0;
    for (let slot = 0; slot < 4; slot += 1) {
      const nearBridge = 1 + slot * 576 + 14 * 18 + 3;
      if (observation.actionMask[nearBridge]) {
        actionId = nearBridge;
        break;
      }
    }
    result = env.step(actionId);
    if (actionId !== 0) deployments += 1;
    totalReward += result.reward;
    steps += 1;
    observation = result.observation;
  }

  assert.equal(result.terminated, true);
  assert.equal(result.truncated, false);
  assert.ok(deployments > 0);
  assert.ok(steps <= 30, "each match step is bounded to 600 ticks");
  assert.ok(observation.tick < 18_000, "natural battle result precedes the external horizon");
  assert.ok([-1, 0, 1].includes(result.reward));
  assert.equal(totalReward, result.reward, "only the terminal transition receives a reward");
  assert.equal(result.observation.status, "terminated");
  assert.ok(result.observation.actionMask.every((legal) => legal === false));
  const checkpoint = env.serialize();
  const restored = RLEnvironment.restore(checkpoint);
  assert.deepEqual(restored.observe(), result.observation);
  assert.throws(() => restored.step(0), /finished RL environment/);
  assert.throws(() => env.step(0), /finished RL environment/);
  assert.equal(env.serialize(), checkpoint);
});

test("wait-only seed 2 reaches its pinned natural engine terminal after checkpoint restore", () => {
  const config = { seed: 2, strideTicks: 600, horizonTicks: 18_000 };
  const expected = {
    crowns: { north: 3, south: 0 },
    endedAtTick: 4_837,
    kind: "win",
    reason: "central_destroyed",
    reward: -1,
    tick: 4_838,
    winner: "north",
  };
  const env = createRLEnvironment(config);
  let observation = env.observe();
  let transitions = 0;
  let totalReward = 0;
  while (observation.tick < 2_400) {
    const result = env.step(0);
    observation = result.observation;
    totalReward += result.reward;
    transitions += 1;
  }

  const checkpoint = env.serialize();
  const restored = RLEnvironment.restore(checkpoint);
  assert.deepEqual(restored.observe(), observation);

  let result;
  while (observation.status === "running") {
    result = env.step(0);
    const restoredResult = restored.step(0);
    assert.deepEqual(restoredResult, result,
      "the restored wait-only episode follows the original transition exactly");
    observation = result.observation;
    totalReward += result.reward;
    transitions += 1;
  }

  assert.equal(transitions, 9);
  assert.equal(observation.tick, expected.tick);
  assert.equal(result.info.ticksAdvanced, 38,
    "the final engine step stops at its natural terminal inside the 600-tick stride");
  assert.equal(result.terminated, true);
  assert.equal(result.truncated, false,
    "the distant external horizon cannot relabel natural engine completion");
  assert.equal(result.reward, expected.reward);
  assert.equal(totalReward, expected.reward, "only natural termination pays the sparse reward");
  assert.equal(observation.status, "terminated");
  assert.deepEqual(observation.crowns, expected.crowns);
  assert.ok(observation.tick < config.horizonTicks);
  assert.deepEqual(restored.observe(), observation);
  assert.equal(restored.serialize(), env.serialize(),
    "checkpoint-restored continuation reproduces the exact terminal wrapper snapshot");

  const terminalSnapshot = JSON.parse(env.serialize());
  const engine = GameSession.restore(terminalSnapshot.session);
  assert.equal(engine.state.terminal, true);
  assert.equal(engine.state.tick, expected.tick);
  assert.deepEqual(engine.state.clock.result, {
    crowns: expected.crowns,
    endedAtTick: expected.endedAtTick,
    kind: expected.kind,
    reason: expected.reason,
    winner: expected.winner,
  }, "the restored real GameSession supplies the pinned natural match result");
  assert.equal(totalReward, expected.reward);
  assert.throws(() => env.step(0), /finished RL environment/);
  assert.throws(() => restored.step(0), /finished RL environment/);
});
