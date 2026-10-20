import assert from "node:assert/strict";
import test from "node:test";

import { createPlayableRoster,
  createPlayableRosterQuestionRecords } from "../src/content/playable-roster.js";
import { createSessionSpellProfileReceipts,
  createSessionRadiusSpellProfileReceipts,
  createUnprofiledAdmittedEffectProfileQuestion,
  serializeSessionSpellProfileReceipts } from "../src/content/session-spell-profile-receipts.js";
import { createSessionCardManifest,
  projectSessionNonUnitBattleCard } from "../src/content/session-card-catalog.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";
import { LiveBattle } from "../src/sim/live-battle.js";
import { createCombatEffectsViewModel } from "../src/ui/combat-effects.js";

const NORTH_CARD = "mossguard";
const NORTH_POINT = Object.freeze({ x: 3_500, y: 17_500 });
const POINT = Object.freeze({ x: 3_500, y: 14_500 });
const ROUND_ONE_RECEIPT = Object.freeze({
  exclusions: Object.freeze([
    Object.freeze({ id: "squall-orb-radius-target-knockback-travel-return",
      reason: "all radius, target-policy, knockback, travel, return, and four-facade composition fields remain QUESTION" }),
    Object.freeze({ id: "squall-orb-crown-tower-damage-modifier",
      reason: "crown-tower damage ratio and rounding remain QUESTION, so crown-tower targets are disabled" }),
    Object.freeze({ id: "periodic", reason: "cadence, duration, damage, radius, and target composition remain QUESTION" }),
    Object.freeze({ id: "spawn", reason: "spawn identities lack sourced kind/cost/deploy admission and all spawn mechanics remain QUESTION" }),
    Object.freeze({ id: "status", reason: "status duration, multiplier, target, refresh, and expiry mechanics remain QUESTION" }),
    Object.freeze({ id: "traveling", reason: "travel timing, geometry, damage, target, and return mechanics remain QUESTION" }),
  ]),
  profiles: Object.freeze([Object.freeze({
    claims: Object.freeze(["cardId", "kind", "cost", "count", "damage"]),
    fact: Object.freeze({ cardId: "squall-orb", count: 1, cost: 4, damage: 689,
      kind: "effect", sourceExport: "createInstantSpellCatalog" }),
    mode: "isolated-direct-command-target-damage-not-card-composition",
    profileId: "isolated-sourced-instant-v1",
  })]),
  version: 1,
});

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function profiledBattle({ profile = true, radius = false, unprofiledEffectId = null } = {}) {
  const roster = structuredClone(createPlayableRoster());
  roster[0] = structuredClone(projectSessionNonUnitBattleCard("squall-orb"));
  if (unprofiledEffectId !== null) {
    roster[roster.length - 1] = structuredClone(projectSessionNonUnitBattleCard(unprofiledEffectId));
  }
  const referenced = new Set(roster.flatMap(({ entities }) => entities.flatMap((entity) =>
    [entity.bodyRadiusPolicy, entity.projectileSpeedPolicy]
      .filter((policy) => policy.kind === "question")
      .map(({ questionKey }) => questionKey)
      .concat((entity.sourceConfidencePolicy?.fields ?? []).map(({ questionKey }) => questionKey)))));
  const questions = createPlayableRosterQuestionRecords()
    .filter(({ key }) => referenced.has(key));
  const battle = { initialWindupTicks: { central: 0, lane: 0 }, questions, roster };
  if (profile) battle.spellProfileReceipts = radius
    ? createSessionRadiusSpellProfileReceipts() : createSessionSpellProfileReceipts();
  return battle;
}

function seedWithWitness(deck, { unprofiledEffectId = null } = {}) {
  for (let seed = 0; seed < 10_000; seed += 1) {
    const south = new DeckCycle({ deck, seed: `${seed}:south` }).state.hand;
    const north = new DeckCycle({ deck, seed: `${seed}:north` }).state.hand;
    if (south.includes("squall-orb") && north.includes(NORTH_CARD) &&
        (unprofiledEffectId === null || south.includes(unprofiledEffectId))) {
      return seed;
    }
  }
  throw new Error("missing deterministic spell/unit hand witness");
}

function setup({ profile = true, radius = false, north = false, seed = undefined,
  unprofiledEffectId = null } = {}) {
  const battle = profiledBattle({ profile, radius, unprofiledEffectId });
  const deck = battle.roster.map(({ id }) => id);
  const selectedSeed = seed ?? seedWithWitness(deck, { unprofiledEffectId });
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

function unprofiledEffectCommand(session, cardId, type, commandId) {
  const slot = session.state.decks.south.hand.indexOf(cardId);
  assert.notEqual(slot, -1, `the deterministic witness must put ${cardId} in hand`);
  const command = { cardId, commandId, point: { ...POINT }, slot,
    tick: session.state.tick, type };
  return canonical(type === "spell"
    ? { ...command, side: "south", target: { id: 1, kind: "unit" } }
    : command);
}

function admittedEffectIds() {
  return createSessionCardManifest().cards.filter(({ kind }) => kind === "effect")
    .map(({ id }) => id);
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

function liveProfileBattle({ radius = false, unprofiledEffectId = null } = {}) {
  return new LiveBattle(canonical(profiledBattle({ radius, unprofiledEffectId })));
}

function radiusBuildingSetup() {
  const roster = structuredClone(createPlayableRoster());
  roster[0] = structuredClone(projectSessionNonUnitBattleCard("squall-orb"));
  roster[1] = structuredClone(projectSessionNonUnitBattleCard("bulwark-needle"));
  const referenced = new Set(roster.flatMap(({ entities }) => entities.flatMap((entity) =>
    [entity.bodyRadiusPolicy, entity.projectileSpeedPolicy]
      .filter((policy) => policy.kind === "question").map(({ questionKey }) => questionKey)
      .concat((entity.sourceConfidencePolicy?.fields ?? []).map(({ questionKey }) => questionKey)))));
  const questions = createPlayableRosterQuestionRecords()
    .filter(({ key }) => referenced.has(key));
  return { initialWindupTicks: { central: 0, lane: 0 }, questions, roster,
    spellProfileReceipts: createSessionRadiusSpellProfileReceipts() };
}

function stageLiveNorthUnit(battle) {
  battle.scheduleDeploy(canonical({ cardId: NORTH_CARD, point: { ...NORTH_POINT }, sequence: 0,
    side: "north", tick: 0 }));
  battle.step();
  return deployedNorthTarget(battle);
}

function scheduleLiveSpell(battle, target, sequence, { cardId = "squall-orb", point = POINT } = {}) {
  return battle.scheduleSpell({ cardId, point: { ...point }, sequence,
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

test("game spell runtime: v2 center cast damages enemy ground and air units after its explicit estimated delay", () => {
  const setup = structuredClone(profiledBattle({ radius: true }));
  const battle = new LiveBattle(canonical(setup));
  battle.scheduleDeploy(canonical({ cardId: "mossguard", point: { x: 5_000, y: 18_000 },
    sequence: 0, side: "north", tick: 0 }));
  battle.scheduleDeploy(canonical({ cardId: "copperskiff", point: { x: 7_000, y: 18_000 },
    sequence: 1, side: "north", tick: 0 }));
  battle.scheduleDeploy(canonical({ cardId: "mossguard", point: { x: 10_000, y: 18_000 },
    sequence: 2, side: "north", tick: 0 }));
  battle.step();
  const before = battle.state;
  const ground = before.units.find(({ cardId, side, id }) => cardId === "mossguard" &&
    side === "north" && id === 1);
  const air = before.units.find(({ cardId, side }) => cardId === "copperskiff" && side === "north");
  const outside = before.units.find(({ cardId, side, id }) => cardId === "mossguard" &&
    side === "north" && id === 3);
  assert.ok(ground && air && outside);
  assert.equal(air.layer, "air");
  battle.scheduleSpell({ cardId: "squall-orb", point: { x: 5_750, y: 17_750 },
    sequence: 3, side: "south", tick: battle.state.tick });
  battle.scheduleSpell({ cardId: "squall-orb", point: { x: 5_750, y: 17_750 },
    sequence: 4, side: "north", tick: battle.state.tick });

  assert.deepEqual(battle.state.pendingSpellIntents, [{
    cardId: "squall-orb", effectId: 1, impactTick: 3, point: { x: 5_750, y: 17_750 },
    profileId: "squall-orb-radius-v2", sequence: 3, side: "south", tick: 1,
  }, {
    cardId: "squall-orb", effectId: 2, impactTick: 3, point: { x: 5_750, y: 17_750 },
    profileId: "squall-orb-radius-v2", sequence: 4, side: "north", tick: 1,
  }]);
  assert.equal(battle.state.units.find(({ id }) => id === ground.id).hitpoints, ground.hitpoints,
    "impact remains pending through the estimated two-tick delay");
  battle.stepMany(3);

  const after = battle.state.units;
  assert.equal(after.find(({ id }) => id === ground.id).hitpoints, ground.hitpoints - 689);
  assert.equal(after.find(({ id }) => id === air.id).hitpoints, Math.max(0, air.hitpoints - 689));
  assert.equal(after.find(({ id }) => id === outside.id).hitpoints, outside.hitpoints,
    "a unit outside the profile radius receives no spell damage");
  const resolved = battle.events.find(({ type }) => type === "spell-intent-resolved");
  assert.equal(resolved.kind, "bounded-radius-center-damage");
  assert.equal(resolved.areaDamageRadiusMillitiles, 2_500);
  assert.equal(resolved.profileId, "squall-orb-radius-v2");
  assert.equal(battle.events.filter(({ type }) => type === "spell-intent-resolved").length, 2);
  const areaView = createCombatEffectsViewModel(battle.combatEffectFeed, battle.state.tick);
  assert.deepEqual(areaView.areas.map(({ point, radius }) => ({ point, radius })), [{
    point: { denominator: "1", xNumerator: "5750", yNumerator: "17750" },
    radius: 2_500,
  }, {
    point: { denominator: "1", xNumerator: "5750", yNumerator: "17750" },
    radius: 2_500,
  }], "resolved radius spells publish one visible deterministic impact ring each");
  const resolvedBytes = battle.serialize();
  const restored = LiveBattle.restore(resolvedBytes);
  assert.equal(restored.serialize(), resolvedBytes,
    "area visuals are included in the exact pending-effect restore transcript");
  assert.equal(restored.combatEffectFeedBytes(), battle.combatEffectFeedBytes());
});

test("game spell runtime: editable GameSession center cast spends, cycles, and restores its pending impact", () => {
  const configured = setup({ radius: true, north: true });
  const session = new GameSession(configured);
  session.step();
  const target = deployedNorthTarget(session);
  const unit = session.state.battle.units.find(({ id }) => id === target.id);
  const slot = session.state.decks.south.hand.indexOf("squall-orb");
  assert.notEqual(slot, -1);
  const before = session.state;
  assert.deepEqual(session.submitPlayerCommand(canonical({
    cardId: "squall-orb", commandId: 90, point: { ...unit.position }, side: "south",
    slot, tick: session.state.tick, type: "spell",
  })), { accepted: true, commandId: 90, tick: 1, type: "player-command-admitted" });
  session.step();

  const pending = session.state;
  assert.deepEqual(pending.battle.pendingSpellIntents.map(({ cardId, impactTick, profileId }) =>
    ({ cardId, impactTick, profileId })), [{ cardId: "squall-orb", impactTick: 3,
      profileId: "squall-orb-radius-v2" }]);
  assert.equal(pending.decks.south.sequence, before.decks.south.sequence + 1);
  assert.equal(pending.elixir.sides.south.amount, before.elixir.sides.south.amount - 4);
  assert.deepEqual(pending.battle.pendingSpellIntents[0].target, undefined,
    "center casts do not accept or persist a caller-selected target");
  assert.ok(session.replay.some(({ type, resolution }) =>
    type === "session-spell-played" && resolution === null));
  const checkpoint = session.serialize();
  const restored = GameSession.restore(checkpoint);
  assert.equal(restored.serialize(), checkpoint);

  session.stepMany(2);
  restored.stepMany(2);
  assert.equal(restored.serialize(), session.serialize());
  assert.equal(restored.state.battle.units.find(({ id }) => id === target.id).hitpoints,
    Math.max(0, unit.hitpoints - 689));
  assert.ok(restored.replay.some(({ type, profileId }) =>
    type === "spell-intent-resolved" && profileId === "squall-orb-radius-v2"));
  assert.equal(restored.replayBytes(), session.replayBytes());
});

test("game spell runtime: crown tower radius hit uses the versioned estimated 30 percent modifier", () => {
  const battle = liveProfileBattle({ radius: true });
  const before = battle.state.towers;
  const enemyCrown = before.find(({ side, role }) => side === "south" && role === "central");
  const friendlyCrown = before.find(({ side, role }) => side === "north" && role === "central");
  assert.ok(enemyCrown && friendlyCrown);
  battle.scheduleSpell({ cardId: "squall-orb", point: { ...enemyCrown.position },
    sequence: 0, side: "north", tick: 0 });
  battle.stepMany(3);

  const after = battle.state.towers;
  assert.equal(after.find(({ id }) => id === enemyCrown.id).hitpoints, enemyCrown.hitpoints - 207,
    "689 damage × estimated 30% crown modifier rounds half-up to 207");
  assert.equal(after.find(({ id }) => id === friendlyCrown.id).hitpoints, friendlyCrown.hitpoints,
    "the center cast does not damage a friendly tower");
  const hit = battle.events.find(({ type, targetId }) =>
    type === "spell-area-hit" && targetId === enemyCrown.id);
  assert.equal(hit.damage, 207);
  assert.equal(hit.targetKind, "crown-tower");
});

test("game spell runtime: circle tangency is included and one millitile beyond is excluded", () => {
  const exact = liveProfileBattle({ radius: true });
  const justOutside = liveProfileBattle({ radius: true });
  const crown = exact.state.towers.find(({ side, role }) => side === "south" && role === "central");
  assert.ok(crown);
  // The bounded profile radius is 2,500 millitiles and the south central
  // tower's collision footprint is 2,829 millitiles in the shared kernel.
  const exactBoundary = { x: crown.position.x, y: crown.position.y + 5_329 };
  exact.scheduleSpell({ cardId: "squall-orb", point: exactBoundary,
    sequence: 0, side: "north", tick: 0 });
  justOutside.scheduleSpell({ cardId: "squall-orb", point: { ...exactBoundary, y: exactBoundary.y + 1 },
    sequence: 0, side: "north", tick: 0 });
  exact.stepMany(3);
  justOutside.stepMany(3);

  const exactCrown = exact.state.towers.find(({ id }) => id === crown.id);
  const outsideCrown = justOutside.state.towers.find(({ id }) => id === crown.id);
  assert.equal(exactCrown.hitpoints, crown.hitpoints - 207,
    "a center exactly tangent to the tower footprint receives the crown-modified hit");
  assert.equal(outsideCrown.hitpoints, crown.hitpoints,
    "moving the center one millitile farther leaves the tower untouched");
});

test("game spell runtime: radius center cast damages an enemy building through shared structure health", () => {
  const battle = new LiveBattle(canonical(radiusBuildingSetup()));
  battle.scheduleStructure({ cardId: "bulwark-needle", destination: null,
    point: { x: 3_500, y: 17_500 }, sequence: 0, side: "north", tick: 0 });
  battle.step();
  const building = battle.state.structures.find(({ cardId, side }) =>
    cardId === "bulwark-needle" && side === "north");
  assert.ok(building);
  battle.scheduleSpell({ cardId: "squall-orb", point: { ...building.position },
    sequence: 1, side: "south", tick: battle.state.tick });
  battle.stepMany(3);

  assert.equal(battle.state.structures.find(({ id }) => id === building.id).hitpoints,
    building.hitpoints - 689);
  assert.ok(battle.events.some(({ targetId, targetKind, type }) =>
    type === "spell-area-hit" && targetId === building.id && targetKind === "building"));
});

test("game spell runtime: receipt is non-roster/non-fidelity and visibly excludes QUESTION mechanics", () => {
  const receipt = createSessionSpellProfileReceipts();
  assert.deepEqual(receipt, ROUND_ONE_RECEIPT,
    "round-two refusal must not change the round-one exact v1 receipt");
  assert.equal(receipt.version, 1);
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
  assert.equal(serializeSessionSpellProfileReceipts(), canonical(ROUND_ONE_RECEIPT),
    "the round-one v1 receipt bytes remain the exact profile witness");
  assert.doesNotMatch(text, /admitted-effect-without-exact-executable-profile/u,
    "the new admission refusal remains outside persisted v1 receipt bytes");
  assert.deepEqual(createUnprofiledAdmittedEffectProfileQuestion(), {
    disposition: "question",
    id: "admitted-effect-without-exact-executable-profile",
    profileId: "isolated-sourced-instant-v1",
    reason: "an admitted effect without an exact sourced executable profile remains QUESTION and cannot be staged",
    status: "question",
  });
});

test("game spell runtime: every admitted effect without the exact profile rejects before routing", () => {
  const effects = admittedEffectIds();
  assert.deepEqual(effects, [
    "blight-ring", "fault-pulse", "gravity-well", "ironbark-roller", "skyshard-volley",
    "squall-orb", "static-burst", "tempo-field",
  ]);
  const unsupported = effects.map((cardId) => ({
    cardId,
    profile: cardId === "squall-orb" ? false : true,
    unprofiledEffectId: cardId === "squall-orb" ? null : cardId,
  }));
  for (const [cardIndex, { cardId, profile, unprofiledEffectId }] of unsupported.entries()) {
    for (const [offset, type] of ["deploy", "spell"].entries()) {
      const session = new GameSession(setup({ profile, unprofiledEffectId }));
      const before = {
        replay: session.replayBytes(),
        serialize: session.serialize(),
        state: session.state,
      };
      const command = unprofiledEffectCommand(session, cardId, type, 88 + cardIndex * 2 + offset);
      assert.throws(() => session.submitPlayerCommand(command), (error) =>
        error instanceof RangeError &&
        error.message.includes("explicit QUESTION") &&
        error.message.includes("admitted-effect-without-exact-executable-profile") &&
        error.message.includes(cardId));
      assert.equal(session.serialize(), before.serialize, `${cardId}/${type} serialize`);
      assert.deepEqual(session.state, before.state, `${cardId}/${type} state`);
      assert.equal(session.replayBytes(), before.replay, `${cardId}/${type} replay`);
      assert.deepEqual(session.state.cardRuntime.history, [], `${cardId}/${type} card route`);
      assert.equal(session.state.decks.south.sequence, before.state.decks.south.sequence,
        `${cardId}/${type} deck`);
      assert.equal(session.state.elixir.sides.south.amount,
        before.state.elixir.sides.south.amount, `${cardId}/${type} elixir`);
    }
  }
});

test("game spell runtime: LiveBattle rejects unprofiled and no-profile effects atomically", () => {
  const battle = liveProfileBattle({ unprofiledEffectId: "static-burst" });
  const target = stageLiveNorthUnit(battle);
  assert.deepEqual(battle.getSpellProfileQuestion("static-burst"), {
    cardId: "static-burst",
    ...createUnprofiledAdmittedEffectProfileQuestion(),
  });
  assert.equal(battle.getSpellProfileQuestion("squall-orb"), null);
  const before = battle.serialize();
  assert.throws(() => scheduleLiveSpell(battle, target, 1, { cardId: "static-burst" }),
    /explicit QUESTION/u);
  assert.equal(battle.serialize(), before);

  const noProfile = new LiveBattle(canonical(profiledBattle({ profile: false,
    unprofiledEffectId: "static-burst" })));
  assert.deepEqual(noProfile.getSpellProfileQuestion("static-burst"), {
    cardId: "static-burst",
    ...createUnprofiledAdmittedEffectProfileQuestion(),
  });
  const noProfileBytes = noProfile.serialize();
  assert.throws(() => noProfile.scheduleSpell({ cardId: "static-burst", point: { ...POINT },
    sequence: 0, side: "south", target: { id: 1, kind: "unit" }, tick: 0 }),
  /no sourced spell profile/u);
  assert.equal(noProfile.serialize(), noProfileBytes);
});

test("game spell runtime: LiveBattle profile snapshots, forks, restores, and legacy no-profile bytes are causal", () => {
  const battle = liveProfileBattle();
  const target = stageLiveNorthUnit(battle);
  scheduleLiveSpell(battle, target, 1);
  const pending = battle.serialize();
  assert.equal(JSON.parse(pending).version, 3);
  assert.equal(JSON.parse(JSON.parse(pending).battle).version, 2);
  assert.equal(canonical(JSON.parse(pending).setup.spellProfileReceipts),
    serializeSessionSpellProfileReceipts(), "round-one v1 receipt remains the v3 witness");
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
  assert.throws(() => scheduleLiveSpell(battle, target, 1, { point: { x: -1, y: 0 } }), /illegal/u);
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
  const session = new GameSession(setup({ north: true, unprofiledEffectId: "static-burst" }));
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
    type: "spell" })), /explicit QUESTION/u);
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
  const legacyBytes = canonical({ setup: JSON.parse(legacySetup), transcript: [], version: 2 });
  assert.equal(legacy.serialize(), legacyBytes);
  const slot = legacy.state.decks.south.hand.indexOf("squall-orb");
  assert.throws(() => legacy.submitPlayerCommand(canonical({ cardId: "squall-orb", commandId: 3,
    point: { ...POINT }, slot, tick: 0, type: "deploy" })), /explicit QUESTION/u);
  assert.equal(legacy.serialize(), legacyBytes);
  assert.equal(GameSession.restore(legacyBytes).serialize(), legacyBytes);
});
