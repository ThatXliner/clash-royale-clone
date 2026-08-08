import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createSessionTroopRuntimeProfiles } from "../src/content/session-card-catalog.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
} from "../src/content/playable-roster.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";
import { LiveBattle, parseLiveBattleSetup } from "../src/sim/live-battle.js";
import { SessionTroopRuntime } from "../src/sim/session-troop-runtime.js";

const SOUTH = Object.freeze({ x: 3_500, y: 14_500 });
const NORTH = Object.freeze({ x: 3_500, y: 17_500 });
const MOSS = "mossguard";
const COIL = "coilblade";
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

function currentProfiles() {
  return createSessionTroopRuntimeProfiles();
}

function currentProfileBytes() {
  return canonical(currentProfiles());
}

function legacyV1Profiles() {
  return canonical({
    profiles: [{
      action: { abilityCost: null, id: "seam-target-receipt", target: "unit" },
      cardId: COIL,
      claim: "unclaimed",
      deploy: "receipt-only",
      passes: ["pre-move", "pre-combat", "post-combat"],
    }],
    version: 1,
  });
}

function legacyV2Profiles() {
  return canonical({
    profiles: [{
      action: {
        abilityCost: null,
        effect: "source-melee-contact",
        id: "historical-melee-contact",
        target: "unit",
      },
      cardId: MOSS,
      claim: "representative-mechanic",
      deploy: "receipt-only",
      passes: ["pre-move", "pre-combat", "post-combat"],
    }],
    version: 2,
  });
}

function liveBattle(profileBytes = currentProfileBytes()) {
  return new LiveBattle(parseLiveBattleSetup(canonical(battleSetup())), profileBytes);
}

function deploy(battle, { cardId, point, sequence, side, tick = 0 }) {
  return battle.scheduleDeploy(canonical({ cardId, point, sequence, side, tick }));
}

function legacyAction({ commandId, sourceId, targetId, tick, side = "south",
  actionId = "historical-melee-contact" }) {
  return canonical({
    actionId,
    commandId,
    point: null,
    side,
    sourceId,
    targetId,
    tick,
    type: "ability",
  });
}

function unit(state, id) {
  const found = state.units.find((candidate) => candidate.id === id);
  assert.ok(found, `missing shared unit ${id}`);
  return found;
}

function allKeys(value) {
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(allKeys);
  return Object.keys(value).flatMap((key) => [key, ...allKeys(value[key])]);
}

function inHostMeleeRange(state, sourceId, targetId) {
  const source = unit(state, sourceId);
  const target = unit(state, targetId);
  if (!source.alive || !target.alive || source.side === target.side || source.delivery !== "melee") {
    return false;
  }
  const dx = BigInt(source.position.x) - BigInt(target.position.x);
  const dy = BigInt(source.position.y) - BigInt(target.position.y);
  const range = BigInt(source.radius + source.reach + target.radius);
  return dx * dx + dy * dy <= range * range;
}

function legacyContactBattle(targetCardId = COIL, profileBytes = legacyV2Profiles()) {
  const battle = liveBattle(profileBytes);
  deploy(battle, { cardId: MOSS, point: SOUTH, sequence: 0, side: "south" });
  deploy(battle, { cardId: targetCardId, point: NORTH, sequence: 1, side: "north" });
  battle.step();
  for (let count = 0; count < 140; count += 1) {
    if (inHostMeleeRange(battle.state, 1, 2)) return { battle, sourceId: 1, targetId: 2 };
    battle.step();
  }
  throw new Error("legacy contact endpoints never reached host range");
}

function currentPendingContactBattle() {
  const battle = liveBattle();
  deploy(battle, { cardId: MOSS, point: SOUTH, sequence: 0, side: "south" });
  deploy(battle, { cardId: COIL, point: NORTH, sequence: 1, side: "north" });
  // Processes T=0 through T=101. At the returned T=102 boundary Mossguard
  // has cleared its 60-tick deployment lock and is at its source 42-tick
  // first-hit deadline, but it has not yet attacked.
  battle.stepMany(102);
  return { battle, sourceId: 1, targetId: 2 };
}

function currentStatus(profile, { sourceId, targetId, tick }) {
  const attackSequence = 1;
  return {
    attackSequence,
    cardId: MOSS,
    contactId: `live-contact:south:${sourceId}:${attackSequence}:${targetId}:${tick}`,
    damage: profile.sourceProfile.combat.damage,
    delivery: "melee",
    effect: "ordinary-live-contact",
    hostSourceIdentity: `live-battle-unit:south:${sourceId}`,
    key: `${MOSS}:${sourceId}:contact:combat`,
    kind: "contact",
    phase: "combat",
    provenance: clone(profile.contact.provenance),
    side: "south",
    sourceId,
    sourceProfile: clone(profile.sourceProfile),
    targetId,
    tick,
  };
}

function sharedBattle(state) {
  const { troopRuntime: ignored, pendingTroopActions: ignoredPending, ...shared } = state.battle;
  void ignored;
  void ignoredPending;
  return canonical({
    battle: shared,
    cardRuntime: state.cardRuntime,
    clock: state.clock,
    decks: state.decks,
    elixir: state.elixir,
    opponent: state.opponent,
    pendingPlayerCommands: state.pendingPlayerCommands,
    terminal: state.terminal,
    tick: state.tick,
  });
}

function sessionSetup({ profile, seed }) {
  const battle = battleSetup();
  const setup = {
    battleSetup: canonical(battle),
    deck: battle.roster.map(({ id }) => id),
    legalNorthDeployments: [{ cardId: COIL, point: NORTH }
    ],
    rosterWitness: canonical({ questions: battle.questions, roster: battle.roster }),
    seed,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 3_600,
    thinkOffsetTicks: 0,
  };
  if (profile) setup.troopRuntimeProfiles = currentProfiles();
  return canonical(setup);
}

function pairedSeed(deck) {
  for (let seed = 0; seed < 10_000; seed += 1) {
    const south = new DeckCycle({ deck, seed: `${seed}:south` }).state.hand;
    const north = new DeckCycle({ deck, seed: `${seed}:north` }).state.hand;
    if (south.includes(MOSS) && north.includes(COIL)) return seed;
  }
  throw new Error("no deterministic paired deck witness");
}

function submitMossguard(session) {
  const slot = session.state.decks.south.hand.indexOf(MOSS);
  assert.notEqual(slot, -1, "deterministic south hand contains Mossguard");
  session.submitPlayerCommand(canonical({
    cardId: MOSS,
    commandId: 0,
    point: SOUTH,
    slot,
    tick: 0,
    type: "deploy",
  }));
}

test("game troop runtime: current v3 is exactly one structural CONTENT-002 live-contact profile and a pure reducer", () => {
  const profiles = currentProfiles();
  assert.deepEqual(Object.keys(profiles).sort(), ["profiles", "version"]);
  assert.equal(profiles.version, 3);
  assert.equal(profiles.profiles.length, 1);
  const [profile] = profiles.profiles;
  assert.deepEqual(Object.keys(profile).sort(), ["cardId", "claim", "contact", "sourceProfile"]);
  assert.equal(profile.cardId, MOSS);
  assert.equal(profile.claim, "representative-live-contact");
  assert.equal(profile.contact.effect, "ordinary-live-contact");
  assert.equal(profile.contact.delivery, "melee");
  assert.deepEqual(profile.contact.provenance, {
    confidence: "medium-high-unverified-per-value",
    contentPiece: "CONTENT-002",
    verification: "cards-basic-melee",
  });

  const source = createPlayableRoster().find(({ id }) => id === MOSS).entities[0];
  assert.deepEqual(profile.sourceProfile.combat, {
    damage: source.damage,
    delivery: source.delivery,
    deployTimeTicks: source.deployTimeTicks,
    firstHitTicks: source.firstHitTicks,
    hitSpeedTicks: source.hitSpeedTicks,
    layer: source.layer,
    rangeMillitiles: source.rangeMillitiles,
    sightRangeMillitiles: source.sightRangeMillitiles,
    targetMode: source.targetMode,
  }, "source profile is generated from the existing Mossguard production projection");
  assert.equal(allKeys(profile.sourceProfile).includes("bodyRadius"), false,
    "QUESTION body-radius policy is not structural v3 provenance");
  const text = canonical(profiles);
  for (const forbidden of ["fixture", "sentinel", "unclaimed", "receipt-only", "abilityCost",
    "action", "actionId", "commandId"]) {
    assert.equal(text.includes(forbidden), false, `v3 has no ${forbidden} placeholder semantic`);
  }

  const runtime = new SessionTroopRuntime(text);
  assert.equal(runtime.serialize(), text);
  const stateKeys = allKeys(runtime.state);
  for (const forbidden of ["tick", "health", "status", "history", "queue", "deck", "elixir",
    "clock", "action", "actionId", "commandId"]) {
    assert.equal(stateKeys.includes(forbidden), false, `reducer snapshot contains no ${forbidden}`);
  }
  const sources = [{ cardId: MOSS, side: "south", sourceId: 7 }];
  for (const phase of ["deploy", "pre-move", "pre-combat", "post-combat"]) {
    assert.deepEqual(runtime.reduce({ contacts: [], phase, sources, tick: 20 }), [],
      `v3 ${phase} has no placeholder receipt`);
  }
  assert.deepEqual(runtime.reduce({
    contacts: [{ attackSequence: 3, sourceId: 7, targetId: 8 }],
    phase: "combat",
    sources,
    tick: 20,
  }), [{
    attackSequence: 3,
    cardId: MOSS,
    kind: "contact",
    phase: "combat",
    side: "south",
    sourceId: 7,
    targetId: 8,
    tick: 20,
    type: "troop-runtime-intent",
  }]);
});

test("game troop runtime: source deployment gate rejects an early v5 witness and mints one host contact at the real tick", () => {
  const { battle, sourceId, targetId } = currentPendingContactBattle();
  const source = unit(battle.state, sourceId);
  const target = unit(battle.state, targetId);
  assert.equal(battle.state.tick, 102);
  assert.equal(source.attack.phase, "winding");
  assert.equal(source.attack.config.deployTicks, 60);
  assert.equal(source.attack.config.firstHitTicks, 42);
  assert.equal(source.attack.nextAttackTick, 102);
  assert.deepEqual(battle.state.troopRuntime.statuses, [], "T=101 minted no contact");

  // The shared host range is measured edge-to-edge. Its 792-millitile
  // clearance is 408 inside Mossguard's own 1200 reach, so the encounter is
  // comfortably in range without importing a QUESTION radius into v3 source
  // provenance; the host alone retains/uses geometry.
  assert.equal(source.position.x, target.position.x);
  const clearance = Math.abs(source.position.y - target.position.y) - source.radius - target.radius;
  assert.ok(clearance + 400 <= source.reach,
    "ordinary contact has a 400+ millitile source-reach margin after shared body geometry");

  const earlyBytes = battle.serialize();
  const early = JSON.parse(earlyBytes);
  const profile = currentProfiles().profiles[0];
  early.troopStatuses = [currentStatus(profile, { sourceId, targetId, tick: 101 })];
  assert.throws(() => LiveBattle.restore(canonical(early)), /causal|witness|noncanonical/u,
    "T=101 forged contact has no matching AttackCycle deadline/normal attack/damage evidence");
  assert.equal(battle.serialize(), earlyBytes, "early witness rejection is byte-atomic");

  const events = battle.step();
  const attackIndex = events.findIndex(({ type, attackerId, sequence, targetId: target }) =>
    type === "attack" && attackerId === sourceId && sequence === 1 && target === targetId);
  const damageIndex = events.findIndex(({ type, attackerId, amount, targetId: target }) =>
    type === "damage" && attackerId === sourceId && amount === 202 && target === targetId);
  const receiptIndex = events.findIndex(({ type, kind, sourceId: id }) =>
    type === "troop-runtime-receipt" && kind === "contact" && id === sourceId);
  const postIndex = events.findIndex(({ type, phase, sourceId: id }) =>
    type === "troop-runtime-receipt" && phase === "post-combat" && id === sourceId);
  assert.ok(attackIndex >= 0 && damageIndex > attackIndex && receiptIndex > damageIndex,
    "real boundary order is attack -> ordinary damage -> host receipt");
  assert.equal(postIndex, -1, "v3 has no post-combat placeholder receipt");
  assert.equal(events.filter(({ type }) => type === "external-unit-contact").length, 0,
    "current host contact never uses external ingress");
  assert.equal(events.filter(({ type, attackerId }) => type === "attack" && attackerId === sourceId).length, 1);
  assert.equal(events.filter(({ type, attackerId }) => type === "damage" && attackerId === sourceId).length, 1);
  assert.equal(unit(battle.state, targetId).hitpoints, 1_159);
  const [marker] = battle.state.troopRuntime.statuses;
  assert.deepEqual({
    attackSequence: marker.attackSequence,
    damage: marker.damage,
    delivery: marker.delivery,
    effect: marker.effect,
    hostSourceIdentity: marker.hostSourceIdentity,
    side: marker.side,
    sourceId: marker.sourceId,
    targetId: marker.targetId,
    tick: marker.tick,
  }, {
    attackSequence: 1,
    damage: 202,
    delivery: "melee",
    effect: "ordinary-live-contact",
    hostSourceIdentity: `live-battle-unit:south:${sourceId}`,
    side: "south",
    sourceId,
    targetId,
    tick: 102,
  });
});

test("game troop runtime: current raw deploy/action boundaries reject Proxy and accessor input before observation", () => {
  const battle = liveBattle();
  const before = battle.serialize();
  let traps = 0;
  const proxy = new Proxy({}, {
    get() { traps += 1; throw new Error("must not read"); },
    getPrototypeOf() { traps += 1; throw new Error("must not read"); },
    ownKeys() { traps += 1; throw new Error("must not read"); },
    getOwnPropertyDescriptor() { traps += 1; throw new Error("must not read"); },
  });
  let getters = 0;
  const accessor = {};
  Object.defineProperty(accessor, "cardId", {
    enumerable: true,
    get() { getters += 1; throw new Error("must not read"); },
  });
  for (const call of [
    () => battle.scheduleDeploy(proxy),
    () => battle.scheduleDeploy(accessor),
    () => battle.inspectTroopAction(proxy),
    () => battle.inspectTroopAction(accessor),
    () => battle.scheduleTroopAction(proxy),
    () => battle.scheduleTroopAction(accessor),
  ]) {
    assert.throws(call, /canonical JSON text/u);
    assert.equal(battle.serialize(), before, "raw admission failures are byte-atomic");
  }
  assert.equal(traps, 0, "raw Proxy admission ran zero traps");
  assert.equal(getters, 0, "raw accessor admission ran zero getters");
});

test("game troop runtime: current v5 hostile witnesses, chunks, forks, and empty v2 bytes remain causal", () => {
  const empty = new LiveBattle(parseLiveBattleSetup(canonical(battleSetup())));
  const emptyBytes = empty.serialize();
  assert.equal(JSON.parse(emptyBytes).version, 2);
  assert.equal(Buffer.byteLength(emptyBytes), EMPTY_V2_BYTES);
  assert.equal(createHash("sha256").update(emptyBytes).digest("hex"), EMPTY_V2_SHA256);

  const { battle, sourceId, targetId } = currentPendingContactBattle();
  const pending = battle.serialize();
  const direct = LiveBattle.restore(pending);
  const chunked = LiveBattle.restore(pending);
  const forked = LiveBattle.restore(pending).fork();
  const directEvents = direct.stepMany(3);
  assert.deepEqual([...chunked.step(), ...chunked.stepMany(2)], directEvents);
  assert.deepEqual(forked.stepMany(3), directEvents);
  for (const candidate of [chunked, forked]) {
    assert.equal(candidate.serialize(), direct.serialize());
    assert.deepEqual(candidate.state, direct.state);
    assert.deepEqual(candidate.replay, direct.replay);
  }

  const bytes = direct.serialize();
  const original = JSON.parse(bytes);
  assert.equal(original.version, 5);
  const sourceProfile = currentProfiles().profiles[0].sourceProfile;
  assert.equal(JSON.stringify(sourceProfile).includes("bodyRadius"), false);
  const mutations = [
    (value) => { value.runtime = canonical(Array.from({ length: 17 }, (_, index) => index)); },
    (value) => { value.troopStatuses = Array.from({ length: 5_121 }, () => null); },
    (value) => { value.pendingTroopActions = []; },
    (value) => { value.troopStatuses[0].targetId = targetId + 1; },
    (value) => { value.troopStatuses[0].effect = "forged"; },
    (value) => { value.troopStatuses[0].damage = 203; },
    (value) => { value.troopStatuses[0].hostSourceIdentity = "forged"; },
    (value) => { value.troopStatuses[0].contactId = "forged"; },
    (value) => { value.troopStatuses[0].sourceProfile.combat.damage = 203; },
  ];
  for (const mutate of mutations) {
    const forged = clone(original);
    mutate(forged);
    assert.throws(() => LiveBattle.restore(canonical(forged)),
      /graph bound|bounded|causal|witness|noncanonical|shape|plain object|profile diverges/u);
    assert.equal(direct.serialize(), bytes, "hostile v5 restore cannot mutate its live owner");
  }

  const beforeCurrentAction = direct.serialize();
  assert.throws(() => direct.scheduleTroopAction(legacyAction({ commandId: 99, sourceId, targetId,
    tick: direct.state.tick })), /does not admit player actions/u);
  assert.equal(direct.serialize(), beforeCurrentAction,
    "current v3 action input rejects atomically after the ordinary contact too");
});

test("game troop runtime: legacy v1/v3 and v2/v4 action snapshots remain causal and preserve atomic rejections", () => {
  const v1 = liveBattle(legacyV1Profiles());
  deploy(v1, { cardId: COIL, point: SOUTH, sequence: 0, side: "south" });
  deploy(v1, { cardId: MOSS, point: NORTH, sequence: 1, side: "north" });
  v1.stepMany(2);
  v1.scheduleTroopAction(legacyAction({ actionId: "seam-target-receipt", commandId: 3,
    sourceId: 1, targetId: 2, tick: v1.state.tick }));
  const v1Bytes = v1.serialize();
  assert.equal(JSON.parse(v1Bytes).version, 3);
  const restoredV1 = LiveBattle.restore(v1Bytes);
  assert.deepEqual(restoredV1.step(), v1.step());
  assert.equal(restoredV1.serialize(), v1.serialize());

  const pending = legacyContactBattle();
  pending.battle.scheduleTroopAction(legacyAction({ commandId: 4,
    sourceId: pending.sourceId, targetId: pending.targetId, tick: pending.battle.state.tick }));
  const v2Bytes = pending.battle.serialize();
  assert.equal(JSON.parse(v2Bytes).version, 4);
  const restoredV2 = LiveBattle.restore(v2Bytes);
  assert.deepEqual(restoredV2.step(), pending.battle.step());
  assert.equal(restoredV2.serialize(), pending.battle.serialize());

  const matrix = legacyContactBattle();
  const matrixBefore = matrix.battle.serialize();
  assert.throws(() => matrix.battle.scheduleTroopAction(legacyAction({ commandId: 10,
    sourceId: matrix.sourceId, targetId: matrix.targetId, tick: matrix.battle.state.tick + 1 })), /current/u);
  assert.equal(matrix.battle.serialize(), matrixBefore, "legacy future action rejects atomically");
  assert.throws(() => matrix.battle.scheduleTroopAction(legacyAction({ commandId: 11, side: "north",
    sourceId: matrix.sourceId, targetId: matrix.targetId, tick: matrix.battle.state.tick })), /side/u);
  assert.equal(matrix.battle.serialize(), matrixBefore, "legacy wrong-side action rejects atomically");
  matrix.battle.scheduleTroopAction(legacyAction({ commandId: 12,
    sourceId: matrix.sourceId, targetId: matrix.targetId, tick: matrix.battle.state.tick }));
  const duplicateBefore = matrix.battle.serialize();
  assert.throws(() => matrix.battle.scheduleTroopAction(legacyAction({ commandId: 12,
    sourceId: matrix.sourceId, targetId: matrix.targetId, tick: matrix.battle.state.tick })), /duplicate/u);
  assert.equal(matrix.battle.serialize(), duplicateBefore, "legacy duplicate action rejects atomically");

  const deadTarget = legacyContactBattle("cinderlings");
  deadTarget.battle.stepMany(103 - deadTarget.battle.state.tick);
  assert.equal(unit(deadTarget.battle.state, deadTarget.targetId).alive, false);
  const deadTargetBefore = deadTarget.battle.serialize();
  assert.throws(() => deadTarget.battle.scheduleTroopAction(legacyAction({ commandId: 13,
    sourceId: deadTarget.sourceId, targetId: deadTarget.targetId, tick: deadTarget.battle.state.tick })), /not live/u);
  assert.equal(deadTarget.battle.serialize(), deadTargetBefore, "dead target action rejects atomically");

  const deadSource = legacyContactBattle();
  deadSource.battle.stepMany(319 - deadSource.battle.state.tick);
  assert.equal(unit(deadSource.battle.state, deadSource.sourceId).alive, false);
  const deadSourceBefore = deadSource.battle.serialize();
  assert.throws(() => deadSource.battle.scheduleTroopAction(legacyAction({ commandId: 14,
    sourceId: deadSource.sourceId, targetId: deadSource.targetId, tick: deadSource.battle.state.tick })), /not live/u);
  assert.equal(deadSource.battle.serialize(), deadSourceBefore, "dead source action rejects atomically");
});

test("game troop runtime: thirteen profiled live Mossguards use one v3 profile with no source cap or dummy profile", () => {
  const battle = liveBattle();
  for (let index = 0; index < 13; index += 1) {
    deploy(battle, {
      cardId: MOSS,
      point: { x: 500 + index * 1_000, y: 14_500 },
      sequence: index,
      side: "south",
    });
  }
  battle.step();
  const mossguards = battle.state.units.filter(({ cardId, alive }) => cardId === MOSS && alive);
  assert.equal(mossguards.length, 13);
  assert.equal(battle.state.troopRuntime.configuration.profiles.length, 1);
  assert.equal(battle.state.troopRuntime.statuses.length, 0,
    "no deploy/pass receipt is stored for repeated current sources");
  assert.doesNotThrow(() => battle.stepMany(3));
});

test("game troop runtime: real GameSession profile/no-profile control has one sourced 202 hit and no duplicate seam effect", () => {
  const deck = createPlayableRoster().map(({ id }) => id);
  const seed = pairedSeed(deck);
  const profiled = new GameSession(sessionSetup({ profile: true, seed }));
  const control = new GameSession(sessionSetup({ profile: false, seed }));
  assert.equal(sharedBattle(profiled.state), sharedBattle(control.state),
    "initial shared GameSession bytes are equal before the host profile is used");
  submitMossguard(profiled);
  submitMossguard(control);
  assert.equal(sharedBattle(profiled.state), sharedBattle(control.state),
    "admitting the same ordinary deploy leaves shared authorities equal");

  const preEvents = profiled.stepMany(102);
  control.stepMany(102);
  assert.equal(preEvents.some(({ type }) => type === "attack"), false,
    "no ordinary host attack occurs through T=101");
  const source = profiled.state.battle.units.find(({ cardId, side }) => cardId === MOSS && side === "south");
  const target = profiled.state.battle.units.find(({ cardId, side }) => cardId === COIL && side === "north");
  assert.ok(source && target);
  const currentAbility = (commandId) => canonical({
    actionId: "historical-melee-contact",
    commandId,
    point: null,
    side: "south",
    sourceId: source.id,
    targetId: target.id,
    tick: profiled.state.tick,
    type: "ability",
  });
  const beforeEarlyAbility = profiled.serialize();
  assert.throws(() => profiled.submitPlayerCommand(currentAbility(7)), /does not admit player actions/u);
  assert.equal(profiled.serialize(), beforeEarlyAbility,
    "current ability admission remains byte-atomic before the real contact");

  const profileEvents = profiled.step();
  const controlEvents = control.step();
  assert.deepEqual(profileEvents, controlEvents,
    "profile observation does not add a second public GameSession combat event");
  for (const events of [profileEvents, controlEvents]) {
    assert.equal(events.filter(({ type, attackerId }) => type === "attack" && attackerId === source.id).length, 1);
    assert.equal(events.filter(({ type, attackerId, amount }) =>
      type === "damage" && attackerId === source.id && amount === 202).length, 1);
    assert.equal(events.filter(({ type }) => type === "external-unit-contact").length, 0);
  }
  const profileTarget = unit(profiled.state.battle, target.id);
  const controlTarget = unit(control.state.battle, target.id);
  assert.equal(profileTarget.hitpoints, 1_159,
    "CONTENT-002/basic-melee supplies this medium-high/unverified-per-value live Mossguard damage");
  assert.equal(controlTarget.hitpoints, 1_159);
  assert.equal(profileTarget.hitpoints - controlTarget.hitpoints, 0,
    "profile/control shared HP delta is zero: both branches have exactly the one ordinary 202 hit");
  assert.equal(sharedBattle(profiled.state), sharedBattle(control.state),
    "units/towers/projectiles/resources remain byte-identical after the host observation");
  assert.equal(profiled.replay.filter(({ type }) => type === "troop-runtime-receipt").length, 0);
  assert.equal(profiled.replay.filter(({ type }) => type === "session-ability").length, 0);
  assert.equal(profiled.state.battle.troopRuntime.statuses.length, 1);
  assert.equal(control.state.battle.troopRuntime, undefined);

  const afterContact = profiled.serialize();
  assert.throws(() => profiled.submitPlayerCommand(currentAbility(8)), /does not admit player actions/u);
  assert.equal(profiled.serialize(), afterContact,
    "current ability admission remains byte-atomic after the real contact");

  const pending = GameSession.restore(beforeEarlyAbility);
  const direct = GameSession.restore(pending.serialize());
  const chunked = GameSession.restore(pending.serialize());
  const directEvents = direct.stepMany(4);
  assert.deepEqual([...chunked.step(), ...chunked.stepMany(3)], directEvents,
    "configured real GameSession is exact across the pending natural contact boundary");
  assert.equal(chunked.serialize(), direct.serialize());
  assert.equal(chunked.replayBytes(), direct.replayBytes());
  assert.deepEqual(chunked.state, direct.state);
});
