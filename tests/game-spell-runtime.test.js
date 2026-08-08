import assert from "node:assert/strict";
import test from "node:test";

import { createPlayableRoster,
  createPlayableRosterQuestionRecords } from "../src/content/playable-roster.js";
import { createSessionSpellProfileReceipts } from "../src/content/session-spell-profile-receipts.js";
import { projectSessionNonUnitBattleCard } from "../src/content/session-card-catalog.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";
import { LiveBattle } from "../src/sim/live-battle.js";

const NORTH_CARD = "mossguard";
const NORTH_POINT = Object.freeze({ x: 3_500, y: 17_500 });
const POINT = Object.freeze({ x: 3_500, y: 14_500 });

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function profiledBattle({ profile = true, unprofiledEffect = false } = {}) {
  const roster = structuredClone(createPlayableRoster());
  roster[0] = structuredClone(projectSessionNonUnitBattleCard("squall-orb"));
  if (unprofiledEffect) {
    roster[roster.length - 1] = structuredClone(projectSessionNonUnitBattleCard("static-burst"));
  }
  const referenced = new Set(roster.flatMap(({ entities }) => entities.flatMap((entity) =>
    [entity.bodyRadiusPolicy, entity.projectileSpeedPolicy]
      .filter((policy) => policy.kind === "question")
      .map(({ questionKey }) => questionKey))));
  const questions = createPlayableRosterQuestionRecords()
    .filter(({ key }) => referenced.has(key));
  const battle = { initialWindupTicks: { central: 0, lane: 0 }, questions, roster };
  if (profile) battle.spellProfileReceipts = createSessionSpellProfileReceipts();
  return battle;
}

function seedWithWitness(deck, { unprofiledEffect = false } = {}) {
  for (let seed = 0; seed < 10_000; seed += 1) {
    const south = new DeckCycle({ deck, seed: `${seed}:south` }).state.hand;
    const north = new DeckCycle({ deck, seed: `${seed}:north` }).state.hand;
    if (south.includes("squall-orb") && north.includes(NORTH_CARD) &&
        (!unprofiledEffect || south.includes("static-burst"))) {
      return seed;
    }
  }
  throw new Error("missing deterministic spell/unit hand witness");
}

function setup({ profile = true, north = false, seed = undefined, unprofiledEffect = false } = {}) {
  const battle = profiledBattle({ profile, unprofiledEffect });
  const deck = battle.roster.map(({ id }) => id);
  const selectedSeed = seed ?? seedWithWitness(deck, { unprofiledEffect });
  return canonical({ battleSetup: canonical(battle), deck, legalNorthDeployments: north
    ? [{ cardId: NORTH_CARD, point: { ...NORTH_POINT } }] : [],
    rosterWitness: canonical({ questions: battle.questions, roster: battle.roster }),
    seed: selectedSeed, startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 3_600, thinkOffsetTicks: 0 });
}

function spellCommand(session, { commandId = 7, point = POINT, target,
  tick = session.state.tick } = {}) {
  const slot = session.state.decks.south.hand.indexOf("squall-orb");
  assert.notEqual(slot, -1, "the deterministic witness must put Squall Orb in hand");
  assert.ok(target, "a shared-unit seam target is required");
  return canonical({ cardId: "squall-orb", commandId, point: { ...point }, side: "south", slot,
    target: { ...target }, tick, type: "spell" });
}

function deployedNorthTarget(session) {
  const state = session.state.battle ?? session.state;
  const unit = state.units.find(({ cardId, side }) =>
    cardId === NORTH_CARD && side === "north");
  assert.ok(unit, "the deterministic north unit must materialize before the spell command");
  return { id: unit.id, kind: "unit" };
}

function unitHitpoints(session, target) {
  const unit = session.state.battle.units.find(({ id }) => id === target.id);
  assert.ok(unit, "the shared target unit must remain in the battle state");
  return unit.hitpoints;
}

function liveProfileBattle() {
  return new LiveBattle(canonical(profiledBattle()));
}

function stageLiveNorthUnit(battle) {
  battle.scheduleDeploy(canonical({ cardId: NORTH_CARD, point: { ...NORTH_POINT }, sequence: 0,
    side: "north", tick: 0 }));
  battle.step();
  return deployedNorthTarget(battle);
}

function scheduleLiveSpell(battle, target, sequence, point = POINT) {
  return battle.scheduleSpell({ cardId: "squall-orb", point: { ...point }, sequence,
    side: "south", target: { ...target }, tick: battle.state.tick });
}

test("game spell runtime: isolated sourced receipt changes one shared GameSession unit, not a placeholder", () => {
  const configured = setup({ north: true });
  const control = new GameSession(configured);
  const spell = new GameSession(configured);
  control.step();
  spell.step();
  const target = deployedNorthTarget(spell);
  assert.deepEqual(target, deployedNorthTarget(control));
  const before = spell.state;

  assert.deepEqual(spell.submitPlayerCommand(spellCommand(spell, { target })), {
    accepted: true, commandId: 7, tick: 1, type: "player-command-admitted",
  });
  const controlEvents = control.step();
  const spellEvents = spell.step();

  assert.deepEqual(controlEvents, []);
  assert.equal(unitHitpoints(control, target), 1_766);
  assert.equal(unitHitpoints(spell, target), 1_077);
  assert.equal(unitHitpoints(control, target) - unitHitpoints(spell, target), 689);
  assert.equal(control.state.battle.units.length, 1);
  assert.equal(spell.state.battle.units.length, 1);
  assert.equal(spell.state.battle.units.filter(({ cardId }) => cardId === "squall-orb").length, 0);
  assert.deepEqual(spell.state.battle.pendingSpellIntents, []);
  assert.equal(spell.state.decks.south.sequence, before.decks.south.sequence + 1);
  assert.equal(spell.state.elixir.sides.south.amount, before.elixir.sides.south.amount - 4);
  assert.deepEqual(spell.state.cardRuntime.history.filter(({ cardId }) => cardId === "squall-orb"), [{
    cardId: "squall-orb", commandId: 7, kind: "effect", placementClass: "global_effect",
    point: { ...POINT }, sequence: 1, side: "south", target, tick: 1,
    type: "session-card-routed",
  }]);
  assert.deepEqual(spellEvents.map(({ type }) => type), ["session-spell-played", "damage"]);
  const played = spell.replay.find(({ type }) => type === "session-spell-played");
  assert.deepEqual(played, {
    intent: {
      cardId: "squall-orb", effectId: 1, point: { ...POINT },
      profileId: "isolated-sourced-instant-v1", sequence: 1, side: "south",
      target, tick: 1, type: "spell-intent-scheduled",
    },
    resolution: {
      actionIndex: 0, cardId: "squall-orb", damage: 689, effectId: 1,
      kind: "isolated-direct-target-damage", point: { ...POINT },
      profileId: "isolated-sourced-instant-v1", sequence: 1, side: "south",
      sourceId: "spell-intent:0000000000000001", target, tick: 1,
      type: "spell-intent-resolved",
    },
    side: "south",
    spend: {
      accepted: true, amountAfter: 6, cost: 4, reason: "accepted", sequence: 1,
      side: "south", tick: 1, type: "spend",
    },
    tick: 1,
    type: "session-spell-played",
  });
  assert.equal(spell.replay.filter(({ deployment, type }) => type === "session-deployed" &&
    deployment.cardId === "squall-orb").length, 0);
});

test("game spell runtime: receipt is non-roster/non-fidelity and visibly excludes QUESTION mechanics", () => {
  const receipt = createSessionSpellProfileReceipts();
  assert.deepEqual(receipt.profiles, [{
    claims: ["cardId", "kind", "cost", "count", "damage"],
    fact: { cardId: "squall-orb", count: 1, cost: 4, damage: 689, kind: "effect",
      sourceExport: "createInstantSpellCatalog" },
    mode: "isolated-direct-command-target-damage-not-card-composition",
    profileId: "isolated-sourced-instant-v1",
  }]);
  assert.deepEqual(receipt.exclusions.map(({ id }) => id), [
    "squall-orb-radius-target-knockback-travel-return",
    "squall-orb-crown-tower-damage-modifier", "periodic", "spawn", "status", "traveling",
  ]);
  const text = canonical(receipt);
  assert.match(text, /not-card-composition/u);
  assert.match(text, /four-facade composition fields remain QUESTION/u);
  assert.match(text, /crown-tower damage ratio and rounding remain QUESTION/u);
  assert.doesNotMatch(text, /areaDamageRadiusMillitiles|targetMode|impactDelay|knockbackDistance/u);
});

test("game spell runtime: LiveBattle profile snapshots, forks, restores, and legacy no-profile bytes are causal", () => {
  const battle = liveProfileBattle();
  const target = stageLiveNorthUnit(battle);
  scheduleLiveSpell(battle, target, 1);
  const pending = battle.serialize();
  assert.equal(JSON.parse(pending).version, 3);
  assert.equal(JSON.parse(JSON.parse(pending).battle).version, 2);
  assert.equal(LiveBattle.restore(pending).serialize(), pending);
  assert.equal(battle.continuationFork, undefined);

  const fork = battle.fork();
  const directEvents = battle.step();
  const forkEvents = fork.step();
  assert.deepEqual(forkEvents, directEvents);
  const resolved = battle.serialize();
  assert.equal(JSON.parse(resolved).version, 3);
  assert.equal(JSON.parse(JSON.parse(resolved).battle).version, 4);
  assert.equal(LiveBattle.restore(resolved).serialize(), resolved);
  assert.equal(fork.serialize(), resolved);

  const legacy = new LiveBattle(canonical(profiledBattle({ profile: false })));
  const legacyBytes = legacy.serialize();
  assert.equal(JSON.parse(legacyBytes).version, 2);
  assert.equal(LiveBattle.restore(legacyBytes).serialize(), legacyBytes);
});

test("game spell runtime: same-tick reducer order is sequence then effect ID, and dead shared targets reject atomically", () => {
  const battle = liveProfileBattle();
  const target = stageLiveNorthUnit(battle);
  const illegalBytes = battle.serialize();
  assert.throws(() => scheduleLiveSpell(battle, target, 1, { x: -1, y: 0 }), /illegal/u);
  assert.equal(battle.serialize(), illegalBytes);
  scheduleLiveSpell(battle, target, 3);
  scheduleLiveSpell(battle, target, 1);
  scheduleLiveSpell(battle, target, 2);
  assert.deepEqual(battle.state.pendingSpellIntents.map(({ effectId, sequence }) =>
    ({ effectId, sequence })), [
    { effectId: 2, sequence: 1 }, { effectId: 3, sequence: 2 }, { effectId: 1, sequence: 3 },
  ]);
  const events = battle.step();
  assert.deepEqual(events.filter(({ type }) => type === "spell-intent-resolved")
    .map(({ effectId, sequence, sourceId }) => ({ effectId, sequence, sourceId })), [
      { effectId: 2, sequence: 1, sourceId: "spell-intent:0000000000000002" },
      { effectId: 3, sequence: 2, sourceId: "spell-intent:0000000000000003" },
      { effectId: 1, sequence: 3, sourceId: "spell-intent:0000000000000001" },
    ]);
  assert.equal(battle.state.units.find(({ id }) => id === target.id).alive, false);
  const deadBytes = battle.serialize();
  assert.throws(() => scheduleLiveSpell(battle, target, 4), /live shared entity/u);
  assert.equal(battle.serialize(), deadBytes);
});

test("game spell runtime: spell and unit scheduling cannot share a same-tick sequence", () => {
  const deploymentFirst = liveProfileBattle();
  const firstTarget = stageLiveNorthUnit(deploymentFirst);
  deploymentFirst.scheduleDeploy(canonical({ cardId: "copperskiff", point: { ...NORTH_POINT }, sequence: 1,
    side: "north", tick: 1 }));
  const deploymentBytes = deploymentFirst.serialize();
  assert.throws(() => scheduleLiveSpell(deploymentFirst, firstTarget, 1), /tick\/sequence/u);
  assert.equal(deploymentFirst.serialize(), deploymentBytes);

  const spellFirst = liveProfileBattle();
  const secondTarget = stageLiveNorthUnit(spellFirst);
  scheduleLiveSpell(spellFirst, secondTarget, 1);
  const spellBytes = spellFirst.serialize();
  assert.throws(() => spellFirst.scheduleDeploy(canonical({ cardId: "copperskiff", point: { ...NORTH_POINT },
    sequence: 1, side: "north", tick: 1 })), /tick\/sequence/u);
  assert.equal(spellFirst.serialize(), spellBytes);
});

test("game spell runtime: hostile profile/command shapes and the action/event ceiling are bounded and atomic", () => {
  const battle = liveProfileBattle();
  const target = stageLiveNorthUnit(battle);
  const before = battle.serialize();
  let getterReads = 0;
  const accessorCommand = {
    point: { ...POINT }, sequence: 1, side: "south", target: { ...target }, tick: 1,
  };
  Object.defineProperty(accessorCommand, "cardId", {
    enumerable: true,
    get() { getterReads += 1; throw new Error("accessor must not run"); },
  });
  assert.throws(() => battle.scheduleSpell(accessorCommand), /enumerable data property/u);
  assert.equal(getterReads, 0);
  assert.equal(battle.serialize(), before);

  let proxyTraps = 0;
  const proxyCommand = new Proxy({}, {
    ownKeys() { proxyTraps += 1; throw new Error("proxy boundary"); },
  });
  assert.throws(() => battle.scheduleSpell(proxyCommand), /proxy boundary/u);
  assert.equal(proxyTraps, 1);
  assert.equal(battle.serialize(), before);

  const tamperedProfile = profiledBattle();
  tamperedProfile.spellProfileReceipts = structuredClone(tamperedProfile.spellProfileReceipts);
  tamperedProfile.spellProfileReceipts.profiles[0].fact.damage = 690;
  assert.throws(() => new LiveBattle(canonical(tamperedProfile)), /exact sourced receipt/u);
  const deepProfile = profiledBattle();
  let nested = 0;
  for (let depth = 0; depth < 34; depth += 1) nested = { nested };
  deepProfile.spellProfileReceipts = nested;
  assert.throws(() => new LiveBattle(canonical(deepProfile)), /depth bound/u);
  const wideProfile = profiledBattle();
  wideProfile.spellProfileReceipts = structuredClone(wideProfile.spellProfileReceipts);
  wideProfile.spellProfileReceipts.profiles = Array.from({ length: 1_025 }, () => 0);
  assert.throws(() => new LiveBattle(canonical(wideProfile)), /array length bound/u);

  let setupProxyReads = 0;
  const setupProxy = new Proxy({}, {
    get() { setupProxyReads += 1; throw new Error("setup proxy observed"); },
    ownKeys() { setupProxyReads += 1; throw new Error("setup proxy observed"); },
  });
  assert.throws(() => new LiveBattle(setupProxy), /must come from parseLiveBattleSetup/u);
  assert.equal(setupProxyReads, 0);

  const session = new GameSession(setup());
  let commandProxyReads = 0;
  const commandProxy = new Proxy({}, {
    get() { commandProxyReads += 1; throw new Error("command proxy observed"); },
    ownKeys() { commandProxyReads += 1; throw new Error("command proxy observed"); },
  });
  assert.throws(() => session.submitPlayerCommand(commandProxy), /canonical JSON text/u);
  assert.equal(commandProxyReads, 0);

  const actions = liveProfileBattle();
  const actionTarget = stageLiveNorthUnit(actions);
  for (let sequence = 1; sequence <= 1_024; sequence += 1) {
    scheduleLiveSpell(actions, actionTarget, sequence);
  }
  assert.equal(actions.state.pendingSpellIntents.length, 1_024);
  assert.equal(actions.events.filter(({ type }) => type === "spell-intent-scheduled").length, 1_024);
  const resolvedCeiling = actions.fork();
  const ceilingEvents = resolvedCeiling.step();
  assert.deepEqual(ceilingEvents.filter(({ type }) => type === "spell-intent-resolved")
    .map(({ effectId, sequence }) => ({ effectId, sequence })),
  Array.from({ length: 1_024 }, (_, index) => ({ effectId: index + 1, sequence: index + 1 })));
  assert.equal(resolvedCeiling.state.pendingSpellIntents.length, 0);
  assert.equal(resolvedCeiling.state.tick, 2);
  assert.ok(ceilingEvents.length <= 3_100, "the shared boundary completes within its bounded action fanout");
  const actionBytes = actions.serialize();
  assert.throws(() => scheduleLiveSpell(actions, actionTarget, 1_025), /action bound/u);
  assert.equal(actions.serialize(), actionBytes);
});

test("game spell runtime: invalid target, unprofiled card, stale, duplicate, and illegal commands are atomic", () => {
  const session = new GameSession(setup({ north: true, unprofiledEffect: true }));
  session.step();
  const target = deployedNorthTarget(session);
  const before = session.serialize();
  assert.throws(() => session.submitPlayerCommand(spellCommand(session, {
    target: { id: 99_999, kind: "unit" },
  })), /live shared entity/u);
  assert.equal(session.serialize(), before);

  assert.throws(() => session.submitPlayerCommand(spellCommand(session, {
    target: { id: "north:lane:west", kind: "tower" },
  })), /target is invalid/u);
  assert.equal(session.serialize(), before);

  const effectSlot = session.state.decks.south.hand.indexOf("static-burst");
  assert.notEqual(effectSlot, -1, "the deterministic witness must put the unprofiled effect in hand");
  assert.throws(() => session.submitPlayerCommand(canonical({ cardId: "static-burst", commandId: 8,
    point: { ...POINT }, side: "south", slot: effectSlot, target, tick: 1,
    type: "spell" })), /sourced spell profile/u);
  assert.equal(session.serialize(), before);

  assert.throws(() => session.submitPlayerCommand(spellCommand(session, {
    point: { x: -1, y: 0 }, target,
  })), /illegal/u);
  assert.equal(session.serialize(), before);

  assert.throws(() => session.submitPlayerCommand(spellCommand(session, {
    target, tick: session.state.tick + 1,
  })), /current shared tick/u);
  assert.equal(session.serialize(), before);

  const acceptedCommand = spellCommand(session, { target });
  const staleCommand = canonical({ ...JSON.parse(acceptedCommand), commandId: 9 });
  session.submitPlayerCommand(acceptedCommand);
  const admitted = session.serialize();
  assert.throws(() => session.submitPlayerCommand(spellCommand(session, { target })), /stale, duplicate/u);
  assert.equal(session.serialize(), admitted);
  session.step();
  const after = session.serialize();
  assert.throws(() => session.submitPlayerCommand(staleCommand),
    /stale, duplicate/u);
  assert.equal(session.serialize(), after);
});

test("game spell runtime: chunks and restore reproduce profile actions; empty-profile legacy bytes stay v2", () => {
  const configured = setup({ north: true });
  const run = (chunks) => {
    const session = new GameSession(configured);
    session.step();
    session.submitPlayerCommand(spellCommand(session, { target: deployedNorthTarget(session) }));
    for (const count of chunks) session.stepMany(count);
    return session;
  };
  const direct = run([5]);
  const chunked = run([1, 1, 3]);
  assert.equal(chunked.serialize(), direct.serialize());
  assert.deepEqual(chunked.state, direct.state);
  assert.equal(chunked.replayBytes(), direct.replayBytes());

  const partial = new GameSession(configured);
  partial.step();
  partial.submitPlayerCommand(spellCommand(partial, { target: deployedNorthTarget(partial) }));
  const restored = GameSession.restore(partial.serialize());
  restored.stepMany(5);
  assert.equal(restored.serialize(), direct.serialize());
  assert.deepEqual(restored.state, direct.state);

  const legacySetup = setup({ profile: false });
  const legacy = new GameSession(legacySetup);
  assert.equal(legacy.serialize(), canonical({ setup: JSON.parse(legacySetup), transcript: [], version: 2 }));
  const slot = legacy.state.decks.south.hand.indexOf("squall-orb");
  legacy.submitPlayerCommand(canonical({ cardId: "squall-orb", commandId: 3,
    point: { ...POINT }, slot, tick: 0, type: "deploy" }));
  legacy.step();
  assert.equal(legacy.state.battle.towers.find(({ id }) => id === "north:lane:west").hitpoints, 3_052);
  assert.equal(legacy.state.battle.units.length, 0);
  assert.equal(GameSession.restore(legacy.serialize()).serialize(), legacy.serialize());
});
