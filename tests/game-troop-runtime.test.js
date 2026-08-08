import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createSessionTroopRuntimeProfiles,
} from "../src/content/session-card-catalog.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
} from "../src/content/playable-roster.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";
import { LiveBattle, parseLiveBattleSetup } from "../src/sim/live-battle.js";
import {
  SESSION_TROOP_RUNTIME_MAX_SOURCES,
  SessionTroopRuntime,
} from "../src/sim/session-troop-runtime.js";

const SOUTH = Object.freeze({ x: 3_500, y: 14_500 });
const NORTH = Object.freeze({ x: 3_500, y: 17_500 });
const ACTION_CARD_ID = "mossguard";
const DEPLOY_CARD_ID = "coilblade";
const SWARM_CARD_ID = "briar-band";
const ACTION_ID = "basic-melee-contact-fixture";
const EMPTY_V2_BYTES = 11_618;
const EMPTY_V2_SHA256 = "874c2b8e8642447e627e850e8511b58009e57c22e3d9d2cc42ab447b4af8429a";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const clone = (value) => JSON.parse(JSON.stringify(value));

function battleSetup() {
  return {
    initialWindupTicks: { central: 0, lane: 0 },
    questions: clone(createPlayableRosterQuestionRecords()),
    roster: clone(createPlayableRoster()),
  };
}

function profiles(deployCardId = DEPLOY_CARD_ID) {
  return createSessionTroopRuntimeProfiles({
    actionCardId: ACTION_CARD_ID,
    deployCardId,
  });
}

// Literal v1 configuration accepted by c9c818f. It deliberately remains
// receipt-only, proving that v2's actual host effect does not rewrite a prior
// causal snapshot format.
function legacyProfiles() {
  return {
    profiles: [
      {
        action: null,
        cardId: SWARM_CARD_ID,
        claim: "unclaimed",
        deploy: "receipt-only",
        passes: ["pre-move", "pre-combat", "post-combat"],
      },
      {
        action: { abilityCost: null, id: "seam-target-receipt", target: "unit" },
        cardId: DEPLOY_CARD_ID,
        claim: "unclaimed",
        deploy: "receipt-only",
        passes: ["pre-move", "pre-combat", "post-combat"],
      },
    ],
    version: 1,
  };
}

function liveBattle({ deployCardId = DEPLOY_CARD_ID, legacy = false } = {}) {
  return new LiveBattle(
    parseLiveBattleSetup(canonical(battleSetup())),
    canonical(legacy ? legacyProfiles() : profiles(deployCardId)),
  );
}

function deploy(battle, { cardId, point, sequence, side, tick = 0 }) {
  return battle.scheduleDeploy({ cardId, point, sequence, side, tick });
}

function action({ commandId, sourceId, targetId, tick, side = "south", actionId = ACTION_ID }) {
  return {
    actionId,
    commandId,
    point: null,
    side,
    sourceId,
    targetId,
    tick,
    type: "ability",
  };
}

function receipt(events, predicate) {
  const found = events.find((event) => event.type === "troop-runtime-receipt" && predicate(event));
  assert.ok(found, "expected a troop runtime host receipt");
  return found;
}

function resourceWitness(session) {
  const { battle, cardRuntime, decks, elixir } = session.state;
  return canonical({
    cardRuntime,
    decks,
    elixir,
    pendingDeployments: battle.pendingDeployments,
  });
}

function unit(state, id) {
  const found = state.units.find((candidate) => candidate.id === id);
  assert.ok(found, `missing shared unit ${id}`);
  return found;
}

function hostMeleeContact(state, sourceId, targetId) {
  const source = state.units.find((candidate) => candidate.id === sourceId);
  const target = state.units.find((candidate) => candidate.id === targetId);
  if (source === undefined || target === undefined || !source.alive || !target.alive ||
      source.side === target.side || source.delivery !== "melee" ||
      !(source.targetMode === "air_and_ground" || source.targetMode === target.layer)) {
    return false;
  }
  const dx = BigInt(source.position.x) - BigInt(target.position.x);
  const dy = BigInt(source.position.y) - BigInt(target.position.y);
  const radius = BigInt(source.radius + source.reach + target.radius);
  return dx * dx + dy * dy <= radius * radius;
}

function advanceBattleToContact(battle, sourceId, targetId) {
  for (let count = 0; count < 80; count += 1) {
    if (hostMeleeContact(battle.state, sourceId, targetId)) return;
    battle.step();
  }
  throw new Error("representative melee endpoints never reached host contact");
}

function contactBattle() {
  const battle = liveBattle();
  deploy(battle, { cardId: ACTION_CARD_ID, point: SOUTH, sequence: 0, side: "south" });
  deploy(battle, { cardId: DEPLOY_CARD_ID, point: NORTH, sequence: 1, side: "north" });
  battle.step(0);
  advanceBattleToContact(battle, 1, 2);
  return { battle, sourceId: 1, targetId: 2 };
}

function sessionSetup(seed) {
  const battle = battleSetup();
  const deck = battle.roster.map(({ id }) => id);
  return canonical({
    battleSetup: canonical(battle),
    deck,
    legalNorthDeployments: [{ cardId: DEPLOY_CARD_ID, point: NORTH }],
    rosterWitness: canonical({ questions: battle.questions, roster: battle.roster }),
    seed,
    startingElixir: { north: 10, south: 10 },
    // One north materialization at tick zero keeps the real session fixture
    // focused while leaving the production controller authority intact.
    thinkIntervalTicks: 3_600,
    thinkOffsetTicks: 0,
    troopRuntimeProfiles: profiles(),
  });
}

function pairedSeed(deck) {
  for (let seed = 0; seed < 10_000; seed += 1) {
    const south = new DeckCycle({ deck, seed: `${seed}:south` }).state.hand;
    const north = new DeckCycle({ deck, seed: `${seed}:north` }).state.hand;
    if (south.includes(ACTION_CARD_ID) && north.includes(DEPLOY_CARD_ID)) return seed;
  }
  throw new Error("no deterministic paired deck witness");
}

function sessionAtContact() {
  const deck = createPlayableRoster().map(({ id }) => id);
  const session = new GameSession(sessionSetup(pairedSeed(deck)));
  const slot = session.state.decks.south.hand.indexOf(ACTION_CARD_ID);
  assert.notEqual(slot, -1);
  session.submitPlayerCommand(canonical({
    cardId: ACTION_CARD_ID,
    commandId: 0,
    point: SOUTH,
    slot,
    tick: 0,
    type: "deploy",
  }));
  session.step();
  const source = session.state.battle.units.find((candidate) =>
    candidate.cardId === ACTION_CARD_ID && candidate.side === "south");
  const target = session.state.battle.units.find((candidate) =>
    candidate.cardId === DEPLOY_CARD_ID && candidate.side === "north");
  assert.ok(source && target, "the real GameSession materialized shared action endpoints");
  for (let count = 0; count < 80; count += 1) {
    if (hostMeleeContact(session.state.battle, source.id, target.id)) {
      return { session, sourceId: source.id, targetId: target.id };
    }
    session.step();
  }
  throw new Error("real GameSession endpoints never reached host contact");
}

function allKeys(value) {
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(allKeys);
  return Object.keys(value).flatMap((key) => [key, ...allKeys(value[key])]);
}

test("game troop runtime: v2 profile is a pure representative basic-melee contact fixture, not roster or manual-ability support", () => {
  const configuration = profiles();
  assert.equal(configuration.version, 2);
  assert.equal(configuration.profiles.length, 2);
  assert.deepEqual(configuration.profiles.find(({ cardId }) => cardId === ACTION_CARD_ID), {
    action: {
      abilityCost: null,
      effect: "source-melee-contact",
      id: ACTION_ID,
      target: "unit",
    },
    cardId: ACTION_CARD_ID,
    claim: "representative-mechanic",
    deploy: "receipt-only",
    passes: ["pre-move", "pre-combat", "post-combat"],
  });
  assert.deepEqual(configuration.profiles.find(({ cardId }) => cardId === DEPLOY_CARD_ID), {
    action: null,
    cardId: DEPLOY_CARD_ID,
    claim: "receipt-witness",
    deploy: "receipt-only",
    passes: ["pre-move", "pre-combat", "post-combat"],
  });
  assert.ok(configuration.profiles.every((profile) =>
    canonical(Object.keys(profile).sort()) ===
      canonical(["action", "cardId", "claim", "deploy", "passes"]) &&
    profile.deploy === "receipt-only" && profile.action?.abilityCost !== 0),
  "the narrow fixture does not assert a player-facing ability cost or a roster claim");

  const runtime = new SessionTroopRuntime(canonical(configuration));
  const bytes = runtime.serialize();
  const snapshot = JSON.parse(bytes);
  assert.deepEqual(Object.keys(snapshot).sort(), ["profiles", "version"]);
  assert.deepEqual(allKeys(snapshot).filter((key) => [
    "tick", "entity", "entityId", "health", "status", "history", "actionQueue",
    "pendingTroopActions", "deck", "elixir", "clock",
  ].includes(key)), []);
  assert.equal(SessionTroopRuntime.restore(bytes).serialize(), bytes);
  assert.equal(runtime.fork().serialize(), bytes);

  const before = runtime.serialize();
  const intents = runtime.reduce({
    action: null,
    phase: "pre-move",
    sources: [{ cardId: DEPLOY_CARD_ID, side: "south", sourceId: 3 }],
    tick: 9,
  });
  assert.deepEqual(intents, [{
    actionId: null,
    cardId: DEPLOY_CARD_ID,
    commandId: null,
    kind: "pass",
    phase: "pre-move",
    point: null,
    side: "south",
    sourceId: 3,
    targetId: null,
    tick: 9,
    type: "troop-runtime-intent",
  }]);
  assert.equal(runtime.serialize(), before, "the reducer retains no boundary state");
  assert.throws(() => createSessionTroopRuntimeProfiles({
    actionCardId: "ashen-nest", deployCardId: DEPLOY_CARD_ID,
  }), /QUESTION/u);
  assert.throws(() => createSessionTroopRuntimeProfiles({
    actionCardId: "gloam-shepherd", deployCardId: DEPLOY_CARD_ID,
  }), /QUESTION/u);
});

test("game troop runtime: LiveBattle keeps unprofiled units and more than eight profiled sources in the shared authority", () => {
  const unprofiled = liveBattle();
  deploy(unprofiled, { cardId: "brassbolt", point: SOUTH, sequence: 0, side: "south" });
  const unprofiledEvents = unprofiled.step(0);
  assert.equal(unprofiled.state.units[0].cardId, "brassbolt");
  assert.equal(unprofiledEvents.filter(({ type }) => type === "troop-runtime-receipt").length, 0,
    "the host seam creates neither a placeholder nor an all-roster claim");

  const battle = liveBattle({ deployCardId: SWARM_CARD_ID });
  // Two six-member profiles plus the representative source prove the eight
  // configuration-profile cap never caps LiveBattle's shared source graph.
  deploy(battle, { cardId: SWARM_CARD_ID, point: SOUTH, sequence: 0, side: "south" });
  deploy(battle, { cardId: SWARM_CARD_ID, point: NORTH, sequence: 1, side: "north" });
  deploy(battle, { cardId: ACTION_CARD_ID, point: SOUTH, sequence: 2, side: "south" });
  const first = battle.step(0);
  const firstDeploy = first.filter((event) => event.type === "troop-runtime-receipt" &&
    event.kind === "deploy");
  assert.equal(firstDeploy.length, 13);
  assert.ok(firstDeploy.length > 8 && firstDeploy.length <= SESSION_TROOP_RUNTIME_MAX_SOURCES);
  assert.deepEqual(firstDeploy.map(({ sourceId }) => sourceId),
    Array.from({ length: 13 }, (_, index) => index + 1));
  for (const phase of ["pre-move", "pre-combat", "post-combat"]) {
    assert.equal(first.filter((event) => event.type === "troop-runtime-receipt" &&
      event.kind === "pass" && event.phase === phase).length, 13);
  }
  assert.equal(battle.state.troopRuntime.statuses.length, 52,
    "current keyed markers cover four phase keys per live source, not a receipt tail");
  assert.ok(battle.state.troopRuntime.statuses.every((status) =>
    status.effect === null && status.delivery === null && status.damage === null &&
    status.externalSourceId === null));

  const second = battle.step(1);
  assert.equal(second.filter((event) => event.type === "troop-runtime-receipt" &&
    event.kind === "deploy").length, 0);
  for (const phase of ["pre-move", "pre-combat", "post-combat"]) {
    assert.ok(second.some((event) => event.type === "troop-runtime-receipt" &&
      event.kind === "pass" && event.phase === phase && event.sourceId === 13),
    `existing source receives ${phase} on the next shared tick without redeploy`);
  }
});

test("game troop runtime: CONTENT-002 basic-melee contact is host-derived and visibly changes shared unit health", () => {
  const { battle, sourceId, targetId } = contactBattle();
  const sourceBefore = unit(battle.state, sourceId);
  const targetBefore = unit(battle.state, targetId);
  assert.equal(sourceBefore.damage, 202,
    "CONTENT-002's existing mossguard basic-melee runtime supplies 202; troop values are medium-high datamine data and this per-value remains unverified, not authoritative");
  assert.ok(hostMeleeContact(battle.state, sourceId, targetId));

  // The same-tick deploy is intentionally ordered ahead of normal phase passes
  // and the targeted action. Both the action and control receive it.
  deploy(battle, {
    cardId: DEPLOY_CARD_ID,
    point: NORTH,
    sequence: 2,
    side: "north",
    tick: battle.state.tick,
  });
  const control = LiveBattle.restore(battle.serialize());
  const command = action({ commandId: 41, sourceId, targetId, tick: battle.state.tick });
  battle.scheduleTroopAction(command);
  const pendingBytes = battle.serialize();
  assert.equal(JSON.parse(pendingBytes).version, 4);
  const restored = LiveBattle.restore(pendingBytes);

  const events = battle.step();
  assert.deepEqual(restored.step(), events, "pending action restore is byte-causal before commit");
  const controlEvents = control.step();
  assert.equal(controlEvents.filter(({ type }) => type === "external-unit-contact").length, 0);

  const deployed = events.find(({ sequence, type }) => type === "deployed" && sequence === 2);
  const normalPreCombat = receipt(events, (event) => event.kind === "pass" &&
    event.phase === "pre-combat" && event.sourceId === sourceId);
  const actionReceipt = receipt(events, (event) => event.kind === "action" &&
    event.commandId === command.commandId);
  const contact = events.filter(({ type, sourceId: eventSource }) =>
    type === "external-unit-contact" && eventSource === actionReceipt.externalSourceId);
  const damage = events.filter(({ type, externalSourceId }) =>
    type === "damage" && externalSourceId === actionReceipt.externalSourceId);
  const postCombat = receipt(events, (event) => event.kind === "pass" &&
    event.phase === "post-combat" && event.sourceId === sourceId);
  assert.ok(events.indexOf(deployed) < events.indexOf(normalPreCombat));
  assert.ok(events.indexOf(normalPreCombat) < events.indexOf(actionReceipt));
  assert.ok(events.indexOf(actionReceipt) < events.indexOf(contact[0]));
  assert.ok(events.indexOf(contact[0]) < events.indexOf(damage[0]));
  assert.ok(events.indexOf(damage[0]) < events.indexOf(postCombat));
  assert.deepEqual(actionReceipt, {
    actionId: ACTION_ID,
    cardId: ACTION_CARD_ID,
    commandId: 41,
    damage: 202,
    delivery: "melee",
    effect: "source-melee-contact",
    externalSourceId: `troop-runtime:south:41:${sourceId}:${ACTION_ID}`,
    key: `${ACTION_CARD_ID}:${sourceId}:action:pre-combat`,
    kind: "action",
    phase: "pre-combat",
    point: null,
    side: "south",
    sourceId,
    targetId,
    tick: command.tick,
    type: "troop-runtime-receipt",
  });
  assert.deepEqual(contact, [{
    contactTick: command.tick,
    damage: 202,
    delivery: "melee",
    sourceId: actionReceipt.externalSourceId,
    targetUnitId: targetId,
    tick: command.tick,
    type: "external-unit-contact",
  }]);
  assert.equal(damage.length, 1, "one receipt has one external-source damage event");
  assert.deepEqual({
    amount: damage[0].amount,
    delivery: damage[0].delivery,
    externalSourceId: damage[0].externalSourceId,
    targetId: damage[0].targetId,
  }, {
    amount: 202,
    delivery: "melee",
    externalSourceId: actionReceipt.externalSourceId,
    targetId,
  });

  const changedTarget = unit(battle.state, targetId);
  const controlTarget = unit(control.state, targetId);
  assert.equal(targetBefore.hitpoints - changedTarget.hitpoints, 202);
  assert.equal(controlTarget.hitpoints, targetBefore.hitpoints,
    "the no-action control has the same deploy/movement/combat boundary but no ingress");
  assert.notEqual(canonical(battle.state.units), canonical(control.state.units));
  assert.equal(LiveBattle.restore(battle.serialize()).serialize(), battle.serialize());
  assert.equal(battle.fork().serialize(), battle.serialize());
});

test("game troop runtime: stale, wrong-side, duplicate, and dead contact actions reject atomically", () => {
  const { battle, sourceId, targetId } = contactBattle();
  const before = battle.serialize();
  assert.throws(() => battle.scheduleTroopAction(action({
    commandId: 7, sourceId, targetId, tick: battle.state.tick + 1,
  })), /current tick/u);
  assert.equal(battle.serialize(), before);
  assert.throws(() => battle.scheduleTroopAction(action({
    commandId: 7, sourceId, targetId, side: "north", tick: battle.state.tick,
  })), /source side/u);
  assert.equal(battle.serialize(), before);

  battle.scheduleTroopAction(action({ commandId: 7, sourceId, targetId, tick: battle.state.tick }));
  const pending = battle.serialize();
  assert.throws(() => battle.scheduleTroopAction(action({
    commandId: 7, sourceId, targetId, tick: battle.state.tick,
  })), /duplicate/u);
  assert.equal(battle.serialize(), pending);
  const committed = battle.step();
  assert.equal(committed.filter((event) => event.type === "troop-runtime-receipt" &&
    event.kind === "action" && event.commandId === 7).length, 1);
  const afterFirst = battle.serialize();
  assert.throws(() => battle.scheduleTroopAction(action({
    commandId: 7, sourceId, targetId, tick: battle.state.tick,
  })), /duplicate/u);
  assert.equal(battle.serialize(), afterFirst);

  let commandId = 8;
  while (unit(battle.state, targetId).alive) {
    battle.scheduleTroopAction(action({ commandId, sourceId, targetId, tick: battle.state.tick }));
    battle.step();
    commandId += 1;
  }
  const actionMarkers = battle.state.troopRuntime.statuses.filter(({ kind }) => kind === "action");
  assert.equal(actionMarkers.length, 1, "the current marker overwrites by source/profile/phase key");
  assert.equal(actionMarkers[0].commandId, commandId - 1);
  const deadBefore = battle.serialize();
  assert.throws(() => battle.scheduleTroopAction(action({
    commandId, sourceId, targetId, tick: battle.state.tick,
  })), /not live|endpoints/u);
  assert.equal(battle.serialize(), deadBefore);

  // A normal existing shared-combat exchange kills the mossguard first while
  // its opposing coilblade remains live. The host must reject a dead source
  // before it can allocate a new action marker or ingress.
  const deadSource = contactBattle();
  for (let count = 0; count < 400 && unit(deadSource.battle.state, deadSource.sourceId).alive;
    count += 1) {
    deadSource.battle.step();
  }
  assert.equal(unit(deadSource.battle.state, deadSource.sourceId).alive, false);
  assert.equal(unit(deadSource.battle.state, deadSource.targetId).alive, true);
  const deadSourceBefore = deadSource.battle.serialize();
  assert.throws(() => deadSource.battle.scheduleTroopAction(action({
    commandId: 99,
    sourceId: deadSource.sourceId,
    targetId: deadSource.targetId,
    tick: deadSource.battle.state.tick,
  })), /not live/u);
  assert.equal(deadSource.battle.serialize(), deadSourceBefore);
});

test("game troop runtime: empty v2 bytes and v1-profile/v3 causal snapshots remain exact", () => {
  const empty = new LiveBattle(parseLiveBattleSetup(canonical(battleSetup())));
  const emptyBytes = empty.serialize();
  assert.equal(JSON.parse(emptyBytes).version, 2);
  assert.equal(Buffer.byteLength(emptyBytes), EMPTY_V2_BYTES,
    "literal byte length captured from c9c818f");
  assert.equal(createHash("sha256").update(emptyBytes).digest("hex"), EMPTY_V2_SHA256,
    "literal SHA-256 captured from c9c818f");
  assert.equal(LiveBattle.restore(emptyBytes).serialize(), emptyBytes);

  const legacy = liveBattle({ legacy: true });
  deploy(legacy, { cardId: DEPLOY_CARD_ID, point: SOUTH, sequence: 0, side: "south" });
  deploy(legacy, { cardId: SWARM_CARD_ID, point: NORTH, sequence: 1, side: "north" });
  legacy.step(0);
  legacy.scheduleTroopAction(action({
    actionId: "seam-target-receipt",
    commandId: 9,
    sourceId: 1,
    targetId: 2,
    tick: 1,
  }));
  const pendingBytes = legacy.serialize();
  assert.equal(JSON.parse(pendingBytes).version, 3);
  const restored = LiveBattle.restore(pendingBytes);
  const events = legacy.step(1);
  assert.deepEqual(restored.step(1), events);
  const legacyReceipt = receipt(events, ({ kind, commandId }) => kind === "action" && commandId === 9);
  assert.equal(Object.hasOwn(legacyReceipt, "effect"), false);
  assert.equal(Object.hasOwn(legacyReceipt, "damage"), false);
  assert.equal(LiveBattle.restore(legacy.serialize()).serialize(), legacy.serialize());
});

test("game troop runtime: v4 and legacy v3 hostile canonical-text admission is bounded and atomic", () => {
  let traps = 0;
  const hostile = new Proxy({}, {
    get() { traps += 1; throw new Error("observed"); },
    getPrototypeOf() { traps += 1; throw new Error("observed"); },
    ownKeys() { traps += 1; throw new Error("observed"); },
  });
  const setup = parseLiveBattleSetup(canonical(battleSetup()));
  assert.throws(() => new SessionTroopRuntime(hostile), /canonical JSON text/u);
  assert.throws(() => SessionTroopRuntime.restore(hostile), /canonical JSON text/u);
  assert.throws(() => new LiveBattle(setup, hostile), /canonical JSON text/u);
  assert.throws(() => LiveBattle.restore(hostile), /serialized live battle/u);
  assert.equal(traps, 0, "canonical-text boundaries do not observe proxy traps");

  let deep = 0;
  for (let index = 0; index < 17; index += 1) deep = [deep];
  assert.throws(() => SessionTroopRuntime.restore(canonical(deep)), /graph bound/u);
  assert.throws(() => SessionTroopRuntime.restore(`"${"a".repeat(16_384)}"`), /byte bound/u);
  const tooManyProfiles = clone(profiles());
  tooManyProfiles.profiles = Array.from({ length: 9 }, () => clone(tooManyProfiles.profiles[0]));
  assert.throws(() => new SessionTroopRuntime(canonical(tooManyProfiles)), /bounded dense array/u);

  const battle = liveBattle();
  const before = battle.serialize();
  const original = JSON.parse(before);
  assert.equal(original.version, 4);
  for (const mutate of [
    (value) => { value.runtime = canonical(deep); },
    (value) => { value.runtime = `"${"a".repeat(16_384)}"`; },
    (value) => { value.pendingTroopActions = Array.from({ length: 1_025 }, () => null); },
    (value) => { value.troopStatuses = Array.from({ length: 5_121 }, () => null); },
  ]) {
    const forged = clone(original);
    mutate(forged);
    assert.throws(() => LiveBattle.restore(canonical(forged)),
      /graph bound|byte bound|bounded array/u);
    assert.equal(battle.serialize(), before, "v4 hostile admission is atomic");
  }

  const pendingAction = contactBattle();
  pendingAction.battle.scheduleTroopAction(action({
    commandId: 55,
    sourceId: pendingAction.sourceId,
    targetId: pendingAction.targetId,
    tick: pendingAction.battle.state.tick,
  }));
  const pendingActionBytes = pendingAction.battle.serialize();
  const forgedPending = JSON.parse(pendingActionBytes);
  forgedPending.pendingTroopActions[0].targetId = pendingAction.targetId + 1;
  assert.throws(() => LiveBattle.restore(canonical(forgedPending)), /causal|witness|diverge/u);
  assert.equal(pendingAction.battle.serialize(), pendingActionBytes,
    "forged pending action witness cannot mutate its live owner");

  const committedAction = contactBattle();
  committedAction.battle.scheduleTroopAction(action({
    commandId: 56,
    sourceId: committedAction.sourceId,
    targetId: committedAction.targetId,
    tick: committedAction.battle.state.tick,
  }));
  committedAction.battle.step();
  const committedActionBytes = committedAction.battle.serialize();
  for (const mutate of [
    (value) => { value.troopStatuses.find(({ kind }) => kind === "action").effect = "forged"; },
    (value) => { value.troopStatuses.find(({ kind }) => kind === "action").damage = 203; },
    (value) => { value.troopStatuses.find(({ kind }) => kind === "action").externalSourceId = "forged"; },
  ]) {
    const forged = JSON.parse(committedActionBytes);
    mutate(forged);
    assert.throws(() => LiveBattle.restore(canonical(forged)), /noncanonical|causal|witness/u);
    assert.equal(committedAction.battle.serialize(), committedActionBytes,
      "forged representative receipt fields cannot mutate their live owner");
  }

  const legacy = liveBattle({ legacy: true });
  const legacyBytes = legacy.serialize();
  assert.equal(JSON.parse(legacyBytes).version, 3);
  const forgedLegacy = JSON.parse(legacyBytes);
  forgedLegacy.runtime = canonical(deep);
  assert.throws(() => LiveBattle.restore(canonical(forgedLegacy)), /graph bound/u);
  assert.equal(legacy.serialize(), legacyBytes, "v3 hostile admission is atomic");
  assert.equal(LiveBattle.restore(legacyBytes).serialize(), legacyBytes);
});

test("game troop runtime: real GameSession has one causal action commit and diverges from a no-action shared-combat control", () => {
  const { session, sourceId, targetId } = sessionAtContact();
  const source = unit(session.state.battle, sourceId);
  const target = unit(session.state.battle, targetId);
  assert.equal(source.damage, 202,
    "CONTENT-002/basic-melee supplies this medium-high datamine runtime value; its mossguard per-value is intentionally not upgraded to authoritative here");
  const command = action({ commandId: 1, sourceId, targetId, tick: session.state.tick });
  const resourceBeforeSubmit = resourceWitness(session);
  const beforeAction = session.serialize();
  assert.throws(() => session.submitPlayerCommand(canonical({
    ...command,
    commandId: 2,
    tick: command.tick + 1,
  })), /current/u);
  assert.equal(session.serialize(), beforeAction, "future action admission is atomic");
  assert.throws(() => session.submitPlayerCommand(canonical({
    ...command,
    commandId: 3,
    side: "north",
  })), /south-owned/u);
  assert.equal(session.serialize(), beforeAction,
    "GameSession wrong-side ability admission is atomic before LiveBattle staging");
  session.submitPlayerCommand(canonical(command));
  assert.equal(resourceWitness(session), resourceBeforeSubmit,
    "null profile cost leaves action/cardRuntime/deck/elixir bytes untouched at admission");

  const pendingBytes = session.serialize();
  const pendingReplay = session.replayBytes();
  const pendingState = session.state;
  const direct = GameSession.restore(pendingBytes);
  const chunked = GameSession.restore(pendingBytes);
  const forked = GameSession.restore(pendingBytes);
  assert.equal(direct.replayBytes(), pendingReplay);
  assert.deepEqual(direct.state, pendingState);
  const directEvents = direct.stepMany(3);
  const chunkedEvents = [...chunked.step(), ...chunked.stepMany(2)];
  const forkedEvents = forked.stepMany(3);
  assert.deepEqual(chunkedEvents, directEvents,
    "post-submit action is exact across one-step and chunked GameSession advancement");
  assert.deepEqual(forkedEvents, directEvents,
    "post-submit restore is an independent fork without a public continuation API");
  for (const candidate of [chunked, forked]) {
    assert.equal(candidate.serialize(), direct.serialize());
    assert.equal(candidate.replayBytes(), direct.replayBytes());
    assert.deepEqual(candidate.state, direct.state);
  }

  const control = GameSession.restore(beforeAction);
  const events = session.step();
  control.step();
  assert.equal(resourceWitness(session), resourceWitness(control),
    "the action adds no duplicate resource or deck ledger");
  const commits = events.filter(({ type }) => type === "session-ability");
  assert.equal(commits.length, 1);
  const ability = commits[0].ability;
  assert.deepEqual({
    actionId: ability.actionId,
    cardId: ability.cardId,
    commandId: ability.commandId,
    damage: ability.damage,
    delivery: ability.delivery,
    effect: ability.effect,
    externalSourceId: ability.externalSourceId,
    side: ability.side,
    sourceId: ability.sourceId,
    targetId: ability.targetId,
    tick: ability.tick,
  }, {
    actionId: ACTION_ID,
    cardId: ACTION_CARD_ID,
    commandId: 1,
    damage: 202,
    delivery: "melee",
    effect: "source-melee-contact",
    externalSourceId: `troop-runtime:south:1:${sourceId}:${ACTION_ID}`,
    side: "south",
    sourceId,
    targetId,
    tick: command.tick,
  });
  const damage = events.filter(({ externalSourceId, type }) =>
    type === "damage" && externalSourceId === ability.externalSourceId);
  assert.equal(damage.length, 1);
  assert.equal(damage[0].amount, 202);
  assert.ok(events.indexOf(commits[0]) < events.indexOf(damage[0]));
  assert.equal(events.filter(({ type }) => type === "troop-runtime-receipt").length, 0,
    "GameSession never duplicates LiveBattle's phase/action receipt stream");

  const actionBattle = session.state.battle;
  const controlBattle = control.state.battle;
  const actionTarget = unit(actionBattle, targetId);
  const controlTarget = unit(controlBattle, targetId);
  assert.equal(controlTarget.hitpoints - actionTarget.hitpoints, 202,
    "the real session's shared unit graph visibly diverges from the no-action control");
  assert.notEqual(canonical(actionBattle.units), canonical(controlBattle.units));
  assert.deepEqual(actionBattle.towers, controlBattle.towers);
  assert.deepEqual(actionBattle.projectiles, controlBattle.projectiles);
  assert.notEqual(canonical(actionBattle.troopRuntime.statuses),
    canonical(controlBattle.troopRuntime.statuses));

  const bytes = session.serialize();
  const replay = session.replayBytes();
  const restored = GameSession.restore(bytes);
  assert.equal(restored.serialize(), bytes);
  assert.equal(restored.replayBytes(), replay);
  assert.equal(restored.replay.filter(({ type }) => type === "session-ability").length, 1);
  assert.equal(restored.replay.filter(({ type }) => type === "troop-runtime-receipt").length, 0);
  assert.throws(() => restored.submitPlayerCommand(canonical(command)), /stale|duplicate/u);
  assert.equal(restored.serialize(), bytes, "once-only causal identity survives restore");
  assert.equal(target.hitpoints, controlTarget.hitpoints,
    "the pre-submit witness stays equal to the no-action boundary before ingress");
});
