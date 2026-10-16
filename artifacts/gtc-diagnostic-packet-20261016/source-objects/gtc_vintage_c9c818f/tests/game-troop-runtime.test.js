import assert from "node:assert/strict";
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
const ACTION_CARD_ID = "coilblade";
const DEPLOY_CARD_ID = "briar-band";

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

function profiles() {
  return createSessionTroopRuntimeProfiles({
    actionCardId: ACTION_CARD_ID,
    deployCardId: DEPLOY_CARD_ID,
  });
}

function liveBattle() {
  return new LiveBattle(parseLiveBattleSetup(canonical(battleSetup())), canonical(profiles()));
}

function deploy(battle, { cardId, point, sequence, side, tick = 0 }) {
  return battle.scheduleDeploy({ cardId, point, sequence, side, tick });
}

function action({ commandId, sourceId, targetId, tick }) {
  return {
    actionId: "seam-target-receipt",
    commandId,
    point: null,
    side: "south",
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
    thinkIntervalTicks: 1,
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

function allKeys(value) {
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(allKeys);
  return Object.keys(value).flatMap((key) => [key, ...allKeys(value[key])]);
}

test("game troop runtime: profiles are configuration-only, unclaimed, and exclude QUESTION identities", () => {
  const configuration = profiles();
  assert.equal(configuration.version, 1);
  assert.equal(configuration.profiles.length, 2);
  assert.ok(configuration.profiles.every(({ claim, deploy, passes }) =>
    claim === "unclaimed" && deploy === "receipt-only" &&
    canonical(passes) === canonical(["pre-move", "pre-combat", "post-combat"])));
  const actionProfile = configuration.profiles.find(({ cardId }) => cardId === ACTION_CARD_ID);
  assert.deepEqual(actionProfile.action, {
    abilityCost: null,
    id: "seam-target-receipt",
    target: "unit",
  });
  assert.equal(configuration.profiles.find(({ cardId }) => cardId === DEPLOY_CARD_ID).action, null);

  const runtime = new SessionTroopRuntime(canonical(configuration));
  const bytes = runtime.serialize();
  const snapshot = JSON.parse(bytes);
  assert.deepEqual(Object.keys(snapshot).sort(), ["profiles", "version"]);
  assert.deepEqual(allKeys(snapshot).filter((key) => [
    "tick", "entity", "entityId", "health", "status", "history", "actionQueue",
    "pendingTroopActions",
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

test("game troop runtime: an unprofiled basic stays in the existing LiveBattle authority", () => {
  const battle = liveBattle();
  deploy(battle, { cardId: "mossguard", point: SOUTH, sequence: 0, side: "south" });
  const events = battle.step(0);
  assert.deepEqual(events.filter(({ type }) => type === "deployed").map(({ cardId, entityIds }) =>
    ({ cardId, entityIds })), [{ cardId: "mossguard", entityIds: [1] }]);
  assert.equal(battle.state.units.length, 1);
  assert.equal(battle.state.units[0].cardId, "mossguard");
  assert.equal(events.filter(({ type }) => type === "troop-runtime-receipt").length, 0,
    "the seam does not create a placeholder or claim for an unprofiled unit");
});

test("game troop runtime: LiveBattle hosts deploy, all later phases, action order, and a formation above eight sources", () => {
  const battle = liveBattle();
  // Two six-member formations prove the profile cap does not cap live sources.
  deploy(battle, { cardId: DEPLOY_CARD_ID, point: SOUTH, sequence: 0, side: "south" });
  deploy(battle, { cardId: DEPLOY_CARD_ID, point: NORTH, sequence: 1, side: "north" });
  deploy(battle, { cardId: ACTION_CARD_ID, point: SOUTH, sequence: 2, side: "south" });
  const first = battle.step(0);
  const firstDeploy = first.filter((event) => event.type === "troop-runtime-receipt" &&
    event.kind === "deploy");
  assert.equal(firstDeploy.length, 13);
  assert.ok(firstDeploy.length > 8 && firstDeploy.length <= SESSION_TROOP_RUNTIME_MAX_SOURCES);
  assert.deepEqual(firstDeploy.map(({ sourceId }) => sourceId),
    Array.from({ length: 13 }, (_, index) => index + 1));
  assert.equal(first.filter((event) => event.type === "troop-runtime-receipt" &&
    event.kind === "pass" && event.phase === "pre-move").length, 13);

  // The action is scheduled together with a new deploy. LiveBattle's one
  // boundary resolves deployment first, then regular pre-combat passes, then
  // the targeted receipt, then shared combat, then survivor post-combat.
  deploy(battle, { cardId: DEPLOY_CARD_ID, point: NORTH, sequence: 3, side: "north", tick: 1 });
  battle.scheduleTroopAction(action({ commandId: 41, sourceId: 13, targetId: 7, tick: 1 }));
  const pendingBytes = battle.serialize();
  const restoredPending = LiveBattle.restore(pendingBytes);
  assert.equal(restoredPending.serialize(), pendingBytes);

  const second = battle.step(1);
  const restoredSecond = restoredPending.step(1);
  assert.deepEqual(restoredSecond, second);
  const deployed = receipt(second, (event) => event.kind === "deploy" && event.sourceId === 14);
  const normalPreCombat = receipt(second, (event) => event.kind === "pass" &&
    event.phase === "pre-combat" && event.sourceId === 13);
  const actionReceipt = receipt(second, (event) => event.kind === "action" &&
    event.commandId === 41);
  const postCombat = receipt(second, (event) => event.kind === "pass" &&
    event.phase === "post-combat" && event.sourceId === 13);
  assert.ok(second.indexOf(deployed) < second.indexOf(normalPreCombat));
  assert.ok(second.indexOf(normalPreCombat) < second.indexOf(actionReceipt));
  assert.ok(second.indexOf(actionReceipt) < second.indexOf(postCombat));
  assert.deepEqual(actionReceipt, {
    actionId: "seam-target-receipt",
    cardId: ACTION_CARD_ID,
    commandId: 41,
    key: `${ACTION_CARD_ID}:13:action:pre-combat`,
    kind: "action",
    phase: "pre-combat",
    point: null,
    side: "south",
    sourceId: 13,
    targetId: 7,
    tick: 1,
    type: "troop-runtime-receipt",
  });

  const third = battle.step(2);
  assert.equal(third.filter((event) => event.type === "troop-runtime-receipt" &&
    event.kind === "deploy").length, 0);
  for (const phase of ["pre-move", "pre-combat", "post-combat"]) {
    assert.ok(third.some((event) => event.type === "troop-runtime-receipt" &&
      event.kind === "pass" && event.phase === phase && event.sourceId === 13),
    `existing source receives ${phase} on the following tick`);
  }
  assert.equal(LiveBattle.restore(battle.serialize()).serialize(), battle.serialize());
  assert.equal(battle.fork().serialize(), battle.serialize());
});

test("game troop runtime: failed action admission is atomic and LiveBattle snapshots reject hostile action witnesses", () => {
  const battle = liveBattle();
  deploy(battle, { cardId: ACTION_CARD_ID, point: SOUTH, sequence: 0, side: "south" });
  deploy(battle, { cardId: DEPLOY_CARD_ID, point: NORTH, sequence: 1, side: "north" });
  battle.step(0);
  const before = battle.serialize();
  assert.throws(() => battle.scheduleTroopAction(action({
    commandId: 7, sourceId: 1, targetId: 2, tick: 2,
  })), /current tick/u);
  assert.equal(battle.serialize(), before);
  assert.throws(() => battle.scheduleTroopAction({ ...action({
    commandId: 7, sourceId: 1, targetId: 2, tick: 1,
  }), side: "north" }), /source side/u);
  assert.equal(battle.serialize(), before);

  battle.scheduleTroopAction(action({ commandId: 7, sourceId: 1, targetId: 2, tick: 1 }));
  const pending = JSON.parse(battle.serialize());
  pending.pendingTroopActions[0].targetId = 3;
  assert.throws(() => LiveBattle.restore(canonical(pending)), /causal|witness|diverge/u);
  const committed = battle.step(1);
  assert.equal(committed.filter((event) => event.type === "troop-runtime-receipt" &&
    event.kind === "action" && event.commandId === 7).length, 1);
  const after = battle.serialize();
  assert.throws(() => battle.scheduleTroopAction(action({
    commandId: 7, sourceId: 1, targetId: 2, tick: 2,
  })), /duplicate/u);
  assert.equal(battle.serialize(), after);
});

test("game troop runtime: configuration and v3 snapshots reject hostile canonical text without observing proxies", () => {
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
  assert.equal(original.version, 3);
  const v3Attacks = [
    (value) => { value.runtime = canonical(deep); },
    (value) => { value.runtime = `"${"a".repeat(16_384)}"`; },
    (value) => { value.pendingTroopActions = Array.from({ length: 1_025 }, () => null); },
    (value) => { value.troopStatuses = Array.from({ length: 5_121 }, () => null); },
  ];
  for (const mutate of v3Attacks) {
    const forged = clone(original);
    mutate(forged);
    assert.throws(() => LiveBattle.restore(canonical(forged)),
      /graph bound|byte bound|bounded array/u);
    assert.equal(battle.serialize(), before, "v3 hostile admission is atomic");
  }
});

test("game troop runtime: real GameSession admits one costless canonical action without touching card/deck/elixir authorities", () => {
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
  const source = session.state.battle.units.find((unit) =>
    unit.cardId === ACTION_CARD_ID && unit.side === "south" && unit.alive);
  const target = session.state.battle.units.find((unit) =>
    unit.cardId === DEPLOY_CARD_ID && unit.side === "north" && unit.alive);
  assert.ok(source && target, "the real GameSession materialized shared action endpoints");

  const command = action({ commandId: 1, sourceId: source.id, targetId: target.id,
    tick: session.state.tick });
  const beforeSubmitResources = resourceWitness(session);
  const beforeSubmit = session.serialize();
  assert.throws(() => session.submitPlayerCommand(canonical({ ...command, commandId: 2,
    tick: command.tick + 1 })), /current/u);
  assert.equal(session.serialize(), beforeSubmit, "future actions cannot mutate a session");
  session.submitPlayerCommand(canonical(command));
  assert.equal(resourceWitness(session), beforeSubmitResources,
    "action admission leaves deploy/cardRuntime/deck/elixir bytes untouched");

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
    "post-submit pending action is chunk-exact through GameSession");
  assert.deepEqual(forkedEvents, directEvents,
    "independent restores are forks without a public continuation API");
  for (const candidate of [chunked, forked]) {
    assert.equal(candidate.serialize(), direct.serialize());
    assert.equal(candidate.replayBytes(), direct.replayBytes());
    assert.deepEqual(candidate.state, direct.state);
  }

  const control = GameSession.restore(beforeSubmit);
  const events = session.step();
  control.step();
  assert.equal(resourceWitness(session), resourceWitness(control),
    "the receipt-only action has no independent resource ledger effect");
  const commits = events.filter(({ type }) => type === "session-ability");
  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0].ability, {
    actionId: "seam-target-receipt",
    cardId: ACTION_CARD_ID,
    commandId: 1,
    key: `${ACTION_CARD_ID}:${source.id}:action:pre-combat`,
    kind: "action",
    phase: "pre-combat",
    point: null,
    side: "south",
    sourceId: source.id,
    targetId: target.id,
    tick: command.tick,
    type: "troop-runtime-receipt",
  });
  assert.equal(events.filter((event) => event.type === "troop-runtime-receipt").length, 0,
    "phase receipts remain in LiveBattle; GameSession publishes one action commit");

  const bytes = session.serialize();
  const replay = session.replayBytes();
  const restored = GameSession.restore(bytes);
  assert.equal(restored.serialize(), bytes);
  assert.equal(restored.replayBytes(), replay);
  assert.equal(restored.replay.filter(({ type }) => type === "session-ability").length, 1);
  assert.equal(restored.replay.filter(({ type }) => type === "troop-runtime-receipt").length, 0);
  assert.throws(() => restored.submitPlayerCommand(canonical(command)), /duplicate/u);
  assert.equal(restored.serialize(), bytes, "once-only identity survives restore without a reducer history");
});
