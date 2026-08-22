import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createSessionTroopWitness } from "../src/content/session-troop-roster.js";
import {
  createSessionTroopStatusRuntimeProfiles,
} from "../src/content/session-troop-status-runtime-profiles.js";
import { projectSessionNonUnitBattleCard } from "../src/content/session-card-catalog.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";
import { LiveBattle, parseLiveBattleSetup } from "../src/sim/live-battle.js";
import {
  assertSessionTroopStatusSourceRoster,
  parseSessionTroopStatusRuntimeProfiles,
  serializeSessionTroopStatusRuntimeProfiles,
  SessionTroopStatusRuntime,
} from "../src/sim/session-troop-status-runtime.js";

const STATUS_IDS = Object.freeze([
  "aegis-sage",
  "bloom-wisp",
  "dawnmender",
  "pulse-sentry",
  "railward",
  "rime-adept",
  "tether-rider",
  "veil-prowler",
]);
const EXECUTABLE = Object.freeze([
  Object.freeze({ actionId: "heal", id: "bloom-wisp", target: "source" }),
  Object.freeze({ actionId: "heal", id: "dawnmender", target: "source" }),
  Object.freeze({ actionId: "stun", id: "pulse-sentry", target: "enemy" }),
  Object.freeze({ actionId: "slow", id: "rime-adept", target: "enemy" }),
  Object.freeze({ actionId: "snare", id: "tether-rider", target: "enemy" }),
  Object.freeze({ actionId: "hide", id: "veil-prowler", target: null }),
]);
const SOUTH_POINT = Object.freeze({ x: 3_500, y: 14_500 });
const NORTH_POINT = Object.freeze({ x: 3_500, y: 17_500 });

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function clone(value) {
  return structuredClone(value);
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function findWitnessSeed(id, roster) {
  const deck = roster.map(({ id: cardId }) => cardId);
  const cards = new Map(roster.map((card) => [card.id, card]));
  for (let seed = 0; seed < 10_000; seed += 1) {
    const south = new DeckCycle({ deck, seed: `${seed}:south` }).state.hand;
    const north = new DeckCycle({ deck, seed: `${seed}:north` }).state.hand;
    if (!south.includes(id)) continue;
    const targetCard = north.find((cardId) => cardId !== id && cards.get(cardId)?.kind === "unit");
    if (targetCard !== undefined) return { deck, seed, targetCard };
  }
  throw new Error(`could not find a bounded deterministic deck witness for ${id}`);
}

function setupObject(id, { legalNorthDeployments = null, seed = null } = {}) {
  const witness = createSessionTroopWitness(id);
  const selected = findWitnessSeed(id, witness.roster);
  const chosenSeed = seed ?? selected.seed;
  const northCard = legalNorthDeployments === null
    ? new DeckCycle({ deck: selected.deck, seed: `${chosenSeed}:north` }).state.hand
      .find((cardId) => cardId !== id && witness.roster.some((card) =>
        card.id === cardId && card.kind === "unit"))
    : null;
  const legal = legalNorthDeployments ?? [{ cardId: northCard, point: NORTH_POINT }];
  return {
    battleSetup: canonical(witness),
    deck: selected.deck,
    legalNorthDeployments: legal,
    rosterWitness: canonical({ questions: witness.questions, roster: witness.roster }),
    seed: chosenSeed,
    startingElixir: { north: 10, south: 10 },
    statusRuntimeProfiles: createSessionTroopStatusRuntimeProfiles(),
    thinkIntervalTicks: 1_000,
    thinkOffsetTicks: 0,
  };
}

function mutatedStatusSetup(id, mutate) {
  const setup = setupObject(id);
  const witness = JSON.parse(setup.battleSetup);
  const card = witness.roster.find(({ id: cardId }) => cardId === id);
  assert.ok(card, `${id} mutation witness must contain the source card`);
  mutate(card, card.entities?.[0] ?? null, witness);
  setup.battleSetup = canonical(witness);
  setup.rosterWitness = canonical({ questions: witness.questions, roster: witness.roster });
  return canonical(setup);
}

function makeSession(id) {
  const setup = setupObject(id);
  const session = new GameSession(canonical(setup));
  const slot = session.state.decks.south.hand.indexOf(id);
  assert.notEqual(slot, -1, `${id} must be in the admitted hand`);
  return { session, setup, slot };
}

function deployWitness(session, id, slot) {
  session.submitPlayerCommand(canonical({
    cardId: id,
    commandId: 0,
    point: SOUTH_POINT,
    slot,
    tick: session.state.tick,
    type: "deploy",
  }));
  session.step();
  const units = session.state.battle.units;
  const source = units.find((unit) => unit.side === "south" && unit.cardId === id);
  const target = units.find((unit) => unit.side === "north" && unit.alive);
  assert.ok(source, `${id} source must materialize through GameSession`);
  assert.ok(target, `${id} witness must have a materialized opposing target`);
  return { source, target };
}

function statusCommand({ actionId, commandId, sourceId, targetId, tick }) {
  return canonical({
    actionId,
    commandId,
    point: null,
    side: "south",
    sourceId,
    targetId,
    tick,
    type: "status",
  });
}

function statusReceipts(session) {
  return session.replay.filter((event) => event.type === "session-status");
}

function statusEffects(session) {
  return session.state.battle.statusRuntime.effects;
}

function statusActionId(id) {
  return id === "bloom-wisp" || id === "dawnmender" ? "heal" :
    id === "pulse-sentry" ? "stun" : id === "rime-adept" ? "slow" : "snare";
}

function statusAtomicWitness(session) {
  const state = session.state;
  return {
    bytes: session.serialize(),
    battle: clone(state.battle),
    decks: clone(state.decks),
    elixir: clone(state.elixir),
    pending: clone(state.pendingPlayerCommands),
    replay: session.replayBytes(),
    events: clone(session.replay),
    statusPending: clone(state.battle.statusRuntime?.pending ?? []),
    entityIds: state.battle.units.map(({ id }) => id).concat(
      state.battle.structures.map(({ id }) => id),
    ),
  };
}

function liveStatusCommand({ actionId, commandId, sourceId, targetId, tick }) {
  return canonical({
    actionId,
    commandId,
    point: null,
    side: "south",
    sourceId,
    targetId,
    tick,
    type: "status",
  });
}

function makeDeadTargetLiveBattle(id) {
  const witness = createSessionTroopWitness(id);
  const battle = new LiveBattle(
    parseLiveBattleSetup(canonical(witness)),
    undefined,
    canonical(createSessionTroopStatusRuntimeProfiles()),
  );
  battle.scheduleDeploy(canonical({
    cardId: id,
    point: { x: 500, y: 14_500 },
    sequence: 0,
    side: "south",
    tick: 0,
  }));
  battle.scheduleDeploy(canonical({
    cardId: "coilblade",
    point: { x: 14_500, y: 14_500 },
    sequence: 1,
    side: "south",
    tick: 0,
  }));
  battle.scheduleDeploy(canonical({
    cardId: "briar-band",
    point: { x: 14_500, y: 17_500 },
    sequence: 2,
    side: "north",
    tick: 0,
  }));
  battle.step();
  const source = battle.state.units.find(({ cardId, side }) => cardId === id && side === "south");
  const target = battle.state.units.find(({ cardId, side }) =>
    cardId === "briar-band" && side === "north");
  assert.ok(source);
  assert.ok(target);
  for (let count = 0; count < 240 && target.alive; count += 1) battle.step();
  assert.equal(battle.state.units.find(({ id: unitId }) => unitId === target.id).alive, false,
    `${id} dead-target witness must remove the target at the scheduling boundary`);
  assert.equal(battle.state.units.find(({ id: unitId }) => unitId === source.id).alive, true,
    `${id} dead-target witness must retain its live source`);
  return { battle, source, target };
}

function makeStructureTargetLiveBattle(id) {
  const witness = structuredClone(createSessionTroopWitness(id));
  const replacementIndex = witness.roster.findIndex(({ id: cardId }) => cardId === "briar-band");
  assert.notEqual(replacementIndex, -1);
  const removedArchetypes = new Set(witness.roster[replacementIndex].entities.map(({ archetypeId }) =>
    archetypeId));
  witness.roster[replacementIndex] = structuredClone(
    projectSessionNonUnitBattleCard("bulwark-needle"),
  );
  witness.questions = witness.questions.filter(({ key }) =>
    ![...removedArchetypes].some((archetypeId) => key.startsWith(`${archetypeId}.`)));
  const battle = new LiveBattle(
    parseLiveBattleSetup(canonical(witness)),
    undefined,
    canonical(createSessionTroopStatusRuntimeProfiles()),
  );
  battle.scheduleDeploy(canonical({
    cardId: id,
    point: { x: 3_500, y: 14_500 },
    sequence: 0,
    side: "south",
    tick: 0,
  }));
  battle.scheduleStructure(canonical({
    cardId: "bulwark-needle",
    destination: null,
    point: { x: 3_500, y: 17_500 },
    sequence: 1,
    side: "north",
    tick: 0,
  }));
  battle.step();
  const source = battle.state.units.find(({ cardId, side }) =>
    cardId === id && side === "south");
  const target = battle.state.structures.find(({ cardId, side }) =>
    cardId === "bulwark-needle" && side === "north");
  assert.ok(source);
  assert.ok(target);
  return { battle, source, target };
}

test("game roster troop status: the exact eight identities and sourced executable facts are admitted", () => {
  const receipt = createSessionTroopStatusRuntimeProfiles();
  assert.deepEqual(receipt.profiles.map(({ id }) => id), STATUS_IDS);
  assert.equal(receipt.profiles.find(({ id }) => id === "railward").questionReceipt, null);
  assert.equal(receipt.profiles.find(({ id }) => id === "aegis-sage").composition.mode,
    "membership-only");

  const serialized = serializeSessionTroopStatusRuntimeProfiles(receipt);
  assert.equal(serialized, canonical(receipt));
  assert.deepEqual(parseSessionTroopStatusRuntimeProfiles(serialized), receipt);
  const runtime = new SessionTroopStatusRuntime(serialized);
  assert.deepEqual(runtime.inspect({
    actionId: "heal", cardId: "bloom-wisp", sourceId: 1, targetId: 2,
  }), { effect: "heal", parameters: { amount: 240 } });
  assert.deepEqual(runtime.inspect({
    actionId: "slow", cardId: "rime-adept", sourceId: 1, targetId: 2,
  }), { effect: "slow", parameters: {
    attackRate: { denominator: 20, numerator: 13 },
    durationTicks: 60,
    movementRate: { denominator: 20, numerator: 13 },
  } });
  assert.deepEqual(runtime.inspect({
    actionId: "hide", cardId: "veil-prowler", sourceId: 1, targetId: null,
  }), { effect: "hide", parameters: { durationTicks: 12 } });
  assert.throws(() => runtime.inspect({
    actionId: "shield", cardId: "railward", sourceId: 1, targetId: null,
  }), /QUESTION/u);
  assert.throws(() => runtime.inspect({
    actionId: "reflection", cardId: "aegis-sage", sourceId: 1, targetId: 2,
  }), /QUESTION/u);
});

test("game roster troop status: setup receipt mutations reject atomically before a session is exposed", () => {
  const base = setupObject("bloom-wisp");
  const mutations = [
    (value) => { value.statusRuntimeProfiles.profiles[1].sourceRecord.cost += 1; },
    (value) => { value.statusRuntimeProfiles.profiles.pop(); },
    (value) => { value.statusRuntimeProfiles.profiles.reverse(); },
    (value) => { value.statusRuntimeProfiles.profiles[1].metadata = "forged"; },
    (value) => { value.statusRuntimeProfiles.manifest = value.statusRuntimeProfiles.manifest.replace("version", "versioN"); },
  ];
  for (const mutate of mutations) {
    const hostile = clone(base);
    mutate(hostile);
    assert.throws(() => new GameSession(canonical(hostile)), /status|canonical|diverge|manifest/u);
  }

  let getterReads = 0;
  const accessor = Object.create(Object.prototype, {
    manifest: { enumerable: true, get() { getterReads += 1; return base.statusRuntimeProfiles.manifest; } },
    profiles: { enumerable: true, value: base.statusRuntimeProfiles.profiles },
    version: { enumerable: true, value: 1 },
  });
  assert.throws(() => serializeSessionTroopStatusRuntimeProfiles(accessor), /data property|shape/u);
  assert.equal(getterReads, 0);
});

test("game roster troop status: pinned live source fields reject before setup exposure", () => {
  const ids = EXECUTABLE.map(({ id }) => id);
  const mutations = [
    ["card.areaDamageRadiusMillitiles", (card) => {
      card.areaDamageRadiusMillitiles = card.areaDamageRadiusMillitiles === null ? 1 : null;
    }],
    ["card.cost", (card) => { card.cost += 1; }],
    ["card.count", (card) => { card.count += 1; }],
    ["card.damage", (card) => { card.damage += 1; }],
    ["card.deployTimeTicks", (card) => { card.deployTimeTicks += 1; }],
    ["card.displayName", (card) => { card.displayName += " X"; }],
    ["card.firstHitTicks", (card) => { card.firstHitTicks += 1; }],
    ["card.hitSpeedTicks", (card) => { card.hitSpeedTicks += 1; }],
    ["card.hitpoints", (card) => { card.hitpoints += 1; }],
    ["card.kind", (card) => { card.kind = "effect"; }],
    ["card.movementMillitilesPerSecond", (card) => {
      card.movementMillitilesPerSecond += 1;
    }],
    ["card.rangeMillitiles", (card) => { card.rangeMillitiles += 1; }],
    ["card.rarity", (card) => { card.rarity = card.rarity === "uncommon" ? "special" : "uncommon"; }],
    ["card.sightRangeMillitiles", (card) => { card.sightRangeMillitiles += 1; }],
    ["card.targetMode", (card) => {
      card.targetMode = card.targetMode === "ground" ? "ground-and-air" : "ground";
    }],
    ["entity.areaDamageRadiusMillitiles", (_card, entity) => {
      entity.areaDamageRadiusMillitiles = entity.areaDamageRadiusMillitiles === null ? 1 : null;
    }],
    ["entity.archetypeId", (_card, entity) => {
      entity.archetypeId = entity.archetypeId === "dawnmender" ? "pulse-sentry" : "dawnmender";
    }],
    ["entity.count", (_card, entity) => { entity.count += 1; }],
    ["entity.damage", (_card, entity) => { entity.damage += 1; }],
    ["entity.deployTimeTicks", (_card, entity) => { entity.deployTimeTicks += 1; }],
    ["entity.displayName", (_card, entity) => { entity.displayName += " X"; }],
    ["entity.firstHitTicks", (_card, entity) => { entity.firstHitTicks += 1; }],
    ["entity.hitSpeedTicks", (_card, entity) => { entity.hitSpeedTicks += 1; }],
    ["entity.hitpoints", (_card, entity) => { entity.hitpoints += 1; }],
    ["entity.kind", (_card, entity) => { entity.kind = "effect"; }],
    ["entity.layer", (_card, entity) => { entity.layer = "air"; }],
    ["entity.movementMillitilesPerSecond", (_card, entity) => {
      entity.movementMillitilesPerSecond += 1;
    }],
    ["entity.rangeMillitiles", (_card, entity) => { entity.rangeMillitiles += 1; }],
    ["entity.role", (_card, entity) => { entity.role = "secondary"; }],
    ["entity.sightRangeMillitiles", (_card, entity) => { entity.sightRangeMillitiles += 1; }],
    ["entity.targetMode", (_card, entity) => {
      entity.targetMode = entity.targetMode === "ground" ? "ground-and-air" : "ground";
    }],
    ["entity.delivery", (_card, entity) => { entity.delivery = "projectile"; }],
    ["entity.bodyRadiusPolicy", (_card, entity) => {
      entity.bodyRadiusPolicy.questionKey = "foreign.body-radius-millitiles";
    }],
    ["entity.projectileSpeedPolicy", (_card, entity) => {
      entity.projectileSpeedPolicy = { kind: "question", questionKey: `${entity.archetypeId}.projectile-speed-millitiles-per-tick` };
    }],
    ["entity.deliveryPolicy", (_card, entity) => {
      entity.deliveryPolicy.questionKey = "foreign.delivery";
    }],
    ["entity.layerPolicy", (_card, entity) => {
      entity.layerPolicy.questionKey = "foreign.layer";
    }],
    ["formation.componentOrder", (card) => {
      card.formation.componentOrder[0] = card.id === "dawnmender" ? "pulse-sentry" : "dawnmender";
    }],
    ["entities.duplicate", (card) => {
      card.entities.push(structuredClone(card.entities[0]));
      card.formation.componentOrder.push(card.entities[0].archetypeId);
      card.formation.totalCount += 1;
    }],
  ];
  let attempts = 0;
  for (const id of ids) {
    for (const [label, mutate] of mutations) {
      attempts += 1;
      assert.throws(() => new GameSession(mutatedStatusSetup(id, mutate)),
        /status|source|pinned|profile|roster|canonical|identity|policy|component|target/u,
      `${id} ${label} must fail closed at setup`);
    }
  }
  assert.equal(attempts, ids.length * mutations.length);
});

test("game roster troop status: coupled QUESTION projection mutations fail closed", () => {
  const projectionCases = [
    {
      label: "rime-layer-1-to-2",
      mutate(card, entity, questions) {
        if (card.id === "rime-adept") assert.equal(entity.layer, "ground");
        entity.layer = "air";
        const record = questions.get(entity.layerPolicy.questionKey);
        if (card.id === "rime-adept") assert.equal(record.value, 1);
        record.value = 2;
      },
    },
    {
      label: "delivery-melee-to-projectile",
      mutate(_card, entity, questions, witness) {
        const nextDelivery = entity.delivery === "melee" ? "projectile" : "melee";
        entity.delivery = nextDelivery;
        const delivery = questions.get(entity.deliveryPolicy.questionKey);
        delivery.value = nextDelivery === "projectile" ? 2 : 1;
        const key = `${entity.archetypeId}.projectile-speed-millitiles-per-tick`;
        if (nextDelivery === "projectile") {
          entity.projectileSpeedPolicy = { kind: "question", questionKey: key };
          witness.questions.push({
            authoritative: false,
            confidence: "unverified",
            disposition: "question",
            key,
            source: "runtime-playability-estimate-not-comparison-corpus",
            value: 500,
          });
        } else {
          entity.projectileSpeedPolicy = { kind: "not-applicable", questionKey: null };
          witness.questions = witness.questions.filter((record) => record.key !== key);
        }
      },
    },
    {
      label: "target-mode-ground-and-air-to-ground",
      mutate(card, entity) {
        const nextTargetMode = card.targetMode === "ground-and-air" ? "ground" : "ground-and-air";
        card.targetMode = nextTargetMode;
        entity.targetMode = nextTargetMode;
      },
    },
  ];
  let attempts = 0;
  for (const id of STATUS_IDS) {
    for (const { label, mutate } of projectionCases) {
      const setup = setupObject(id);
      const witness = JSON.parse(setup.battleSetup);
      const card = witness.roster.find(({ id: cardId }) => cardId === id);
      assert.ok(card, `${id} coupled witness must contain its source card`);
      const entity = card.entities[0];
      const questions = new Map(witness.questions.map((record) => [record.key, record]));
      mutate(card, entity, questions, witness);
      setup.battleSetup = canonical(witness);
      setup.rosterWitness = canonical({ questions: witness.questions, roster: witness.roster });
      attempts += 1;
      assert.throws(() => new GameSession(canonical(setup)),
        /QUESTION|delivery|layer|targetMode|pinned|receipt|source|status/u,
      `${id} ${label} must reject before GameSession exposure`);
    }
  }
  assert.equal(attempts, STATUS_IDS.length * projectionCases.length);
});

test("game roster troop status: source binding fails closed for omissions, mixed modes, identity claims, and command preflight", () => {
  const base = setupObject("rime-adept");

  const noReceipt = clone(base);
  delete noReceipt.statusRuntimeProfiles;
  const legacy = new GameSession(canonical(noReceipt));
  const legacySlot = legacy.state.decks.south.hand.indexOf("rime-adept");
  legacy.submitPlayerCommand(canonical({
    cardId: "rime-adept",
    commandId: 0,
    point: SOUTH_POINT,
    slot: legacySlot,
    tick: legacy.state.tick,
    type: "deploy",
  }));
  legacy.step();
  const legacySource = legacy.state.battle.units.find(({ cardId, side }) =>
    cardId === "rime-adept" && side === "south");
  const legacyBytes = legacy.serialize();
  assert.throws(() => legacy.submitPlayerCommand(statusCommand({
    actionId: "slow",
    commandId: 1,
    sourceId: legacySource.id,
    targetId: legacySource.id,
    tick: legacy.state.tick,
  })), /no admitted status profile|status/u);
  assert.equal(legacy.serialize(), legacyBytes);

  const noCard = clone(base);
  const noCardWitness = JSON.parse(noCard.battleSetup);
  noCardWitness.roster = noCardWitness.roster.filter(({ id }) => id !== "rime-adept");
  noCard.battleSetup = canonical(noCardWitness);
  noCard.rosterWitness = canonical({
    questions: noCardWitness.questions,
    roster: noCardWitness.roster,
  });
  assert.throws(() => new GameSession(canonical(noCard)), /no live status source|status/u);

  const omittedProfile = clone(base);
  omittedProfile.statusRuntimeProfiles.profiles.pop();
  assert.throws(() => new GameSession(canonical(omittedProfile)), /status|profile|identity/u);

  const staleReceipt = clone(base);
  staleReceipt.statusRuntimeProfiles.profiles.find(({ id }) => id === "rime-adept")
    .sourceWitness = "stale";
  assert.throws(() => new GameSession(canonical(staleReceipt)), /status|canonical|manifest|receipt/u);

  const claimedEntity = clone(base);
  const claimedWitness = JSON.parse(claimedEntity.battleSetup);
  claimedWitness.roster.find(({ id }) => id === "rime-adept").entities[0].archetypeId = "dawnmender";
  claimedEntity.battleSetup = canonical(claimedWitness);
  claimedEntity.rosterWitness = canonical({
    questions: claimedWitness.questions,
    roster: claimedWitness.roster,
  });
  assert.throws(() => new GameSession(canonical(claimedEntity)), /claim|identity|status|source/u);

  const runtime = new SessionTroopStatusRuntime(canonical(createSessionTroopStatusRuntimeProfiles()));
  const staleRoster = structuredClone(JSON.parse(base.battleSetup).roster);
  staleRoster.find(({ id }) => id === "rime-adept").targetMode = "ground";
  assert.throws(() => runtime.assertSourceRoster(staleRoster), /targetMode|pinned|source/u);
  assert.throws(() => assertSessionTroopStatusSourceRoster(
    staleRoster,
    canonical(createSessionTroopStatusRuntimeProfiles()),
  ), /targetMode|pinned|source/u);
});

test("game roster troop status: source binding reads hostile wrappers once and never invokes accessors", () => {
  const receipt = canonical(createSessionTroopStatusRuntimeProfiles());
  const roster = structuredClone(createSessionTroopWitness("rime-adept").roster);
  let getterReads = 0;
  Object.defineProperty(roster[0], "targetMode", {
    configurable: true,
    enumerable: true,
    get() {
      getterReads += 1;
      return "ground-and-air";
    },
  });
  assert.throws(() => assertSessionTroopStatusSourceRoster(roster, receipt), /data property|source/u);
  assert.equal(getterReads, 0);

  const hostile = structuredClone(createSessionTroopWitness("rime-adept").roster);
  Object.setPrototypeOf(hostile[0], { hostile: true });
  assert.throws(() => assertSessionTroopStatusSourceRoster(hostile, receipt), /plain|source/u);

  let getTraps = 0;
  const proxied = new Proxy(structuredClone(createSessionTroopWitness("rime-adept").roster), {
    get(target, key, receiver) {
      getTraps += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.doesNotThrow(() => assertSessionTroopStatusSourceRoster(proxied, receipt));
  assert.equal(getTraps, 0);

  const driftRoster = structuredClone(createSessionTroopWitness("rime-adept").roster);
  const driftCard = driftRoster[0];
  const driftCardBefore = structuredClone(driftCard);
  let targetModeReads = 0;
  let ownKeysTraps = 0;
  let descriptorTraps = 0;
  const driftProxy = new Proxy(driftCard, {
    ownKeys(target) {
      ownKeysTraps += 1;
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, key) {
      descriptorTraps += 1;
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (key === "targetMode") {
        targetModeReads += 1;
        return { ...descriptor, value: targetModeReads === 1 ? descriptor.value : "ground" };
      }
      return descriptor;
    },
    get(target, key, receiver) {
      getTraps += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  driftRoster[0] = driftProxy;
  assert.doesNotThrow(() => assertSessionTroopStatusSourceRoster(driftRoster, receipt));
  assert.equal(targetModeReads, 1);
  assert.throws(() => assertSessionTroopStatusSourceRoster(driftRoster, receipt), /targetMode|pinned|source/u);
  assert.equal(targetModeReads, 2);
  assert.ok(ownKeysTraps >= 2);
  assert.ok(descriptorTraps >= ownKeysTraps);
  assert.equal(getTraps, 0);
  assert.deepEqual(driftCard, driftCardBefore);
});

test("game roster troop status: heal changes shared authoritative health once, caps, and restores exactly", () => {
  const { session, slot } = makeSession("bloom-wisp");
  const { source } = deployWitness(session, "bloom-wisp", slot);
  let damaged = session.state.battle.units.find(({ id }) => id === source.id);
  for (let count = 0; count < 300 && damaged.alive && damaged.hitpoints === damaged.maxHealth; count += 1) {
    session.step();
    damaged = session.state.battle.units.find(({ id }) => id === source.id);
  }
  assert.ok(damaged.alive);
  assert.ok(damaged.hitpoints < damaged.maxHealth);
  const beforeHealth = damaged.hitpoints;
  const beforeElixir = session.state.elixir.sides.south.amount;
  const beforeHand = clone(session.state.decks.south.hand);
  session.submitPlayerCommand(statusCommand({
    actionId: "heal", commandId: 1, sourceId: source.id, targetId: source.id,
    tick: session.state.tick,
  }));
  const events = session.step();
  const heals = events.filter(({ type }) => type === "heal");
  assert.equal(heals.length, 1);
  assert.equal(heals[0].appliedAmount, damaged.maxHealth - beforeHealth);
  assert.equal(session.state.battle.units.find(({ id }) => id === source.id).hitpoints,
    damaged.maxHealth);
  assert.equal(session.state.elixir.sides.south.amount, beforeElixir);
  assert.deepEqual(session.state.decks.south.hand, beforeHand);
  assert.equal(statusReceipts(session).length, 1);
  assert.equal(statusReceipts(session)[0].status.status, "applied");

  const snapshot = session.serialize();
  const restored = GameSession.restore(snapshot);
  assert.equal(restored.serialize(), snapshot);
  session.stepMany(12);
  restored.stepMany(12);
  assert.equal(restored.serialize(), session.serialize());
  assert.equal(restored.replayBytes(), session.replayBytes());
});

for (const spec of EXECUTABLE.filter(({ id }) => id !== "bloom-wisp")) {
  test(`game roster troop status: ${spec.id} applies its shared ${spec.actionId} boundary`, () => {
    const { session, slot } = makeSession(spec.id);
    const { source, target } = deployWitness(session, spec.id, slot);
    const beforeElixir = clone(session.state.elixir);
    const beforeDeck = clone(session.state.decks.south);
    session.submitPlayerCommand(statusCommand({
      actionId: spec.actionId,
      commandId: 1,
      sourceId: source.id,
      targetId: spec.target === "enemy" ? target.id : spec.target === null ? null : source.id,
      tick: session.state.tick,
    }));
    const applied = session.step();
    const receipts = statusReceipts(session);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].status.effect, spec.actionId);
    assert.ok(["applied", "capped"].includes(receipts[0].status.status));
    assert.equal(applied.filter(({ type }) => type === "troop-status-receipt").length, 1,
      "the shared battle emits one causal status receipt");
    assert.equal(session.state.elixir.sides.north.amount, beforeElixir.sides.north.amount);
    assert.equal(session.state.elixir.sides.south.amount, beforeElixir.sides.south.amount);
    assert.deepEqual(session.state.decks.south, beforeDeck);

    const effects = statusEffects(session);
    const effect = effects.find(({ targetId }) => targetId ===
      (spec.target === "enemy" ? target.id : source.id));
    if (spec.actionId === "heal") {
      assert.equal(effect, undefined, "instant heal leaves no active status slot");
    } else if (spec.actionId === "hide") {
      assert.ok(effect);
      assert.deepEqual(effect.hides, [{ applyTick: 1, expiryTick: 12, sourceId: source.id }]);
    } else {
      assert.ok(effect);
      assert.equal(effect[spec.actionId].applyTick, 1);
      assert.equal(effect[spec.actionId].expiryTick,
        spec.actionId === "stun" ? 30 : spec.actionId === "slow" ? 60 : 90);
    }

    const snapshot = session.serialize();
    const restored = GameSession.restore(snapshot);
    assert.equal(restored.serialize(), snapshot);
    session.stepMany(8);
    restored.stepMany(8);
    assert.equal(restored.serialize(), session.serialize());
    assert.equal(restored.replayBytes(), session.replayBytes());
  });
}

test("game roster troop status: invisibility reveal is command-first and preserves the hide receipt", () => {
  const { session, slot } = makeSession("veil-prowler");
  const { source } = deployWitness(session, "veil-prowler", slot);
  session.submitPlayerCommand(statusCommand({
    actionId: "hide", commandId: 1, sourceId: source.id, targetId: null,
    tick: session.state.tick,
  }));
  session.step();
  session.submitPlayerCommand(statusCommand({
    actionId: "reveal", commandId: 2, sourceId: source.id, targetId: null,
    tick: session.state.tick,
  }));
  session.step();
  const effect = statusEffects(session).find(({ targetId }) => targetId === source.id);
  assert.ok(effect);
  assert.equal(effect.hides.length, 1);
  assert.equal(effect.revealUntil, 5);
  assert.deepEqual(statusReceipts(session).map(({ status }) => status.effect), ["hide", "reveal"]);
});

for (const unresolved of [
  Object.freeze({ actionId: "reflection", id: "aegis-sage" }),
  Object.freeze({ actionId: "shield", id: "railward" }),
]) {
  test(`game roster troop status: ${unresolved.id} rejects its visible QUESTION with zero mutation`, () => {
    const { session, slot } = makeSession(unresolved.id);
    const { source } = deployWitness(session, unresolved.id, slot);
    const beforeBytes = session.serialize();
    const beforeState = session.state;
    assert.throws(() => session.submitPlayerCommand(statusCommand({
      actionId: unresolved.actionId,
      commandId: 1,
      sourceId: source.id,
      targetId: null,
      tick: session.state.tick,
    })), /QUESTION/u);
    assert.equal(session.serialize(), beforeBytes);
    assert.deepEqual(session.state, beforeState);
  });
}

for (const spec of EXECUTABLE.filter(({ id }) => id !== "veil-prowler")) {
  test(`game roster troop status: ${spec.id} rejects missing and wrong-side targets atomically`, () => {
    const cases = [
      { label: "missing", targetId: 999_999 },
      { label: "targetless", targetId: null },
      {
        label: "wrong-side",
        targetId: spec.target === "enemy" ? "source" : "enemy",
      },
    ];
    for (const invalid of cases) {
      const { session, slot } = makeSession(spec.id);
      const { source, target } = deployWitness(session, spec.id, slot);
      const targetId = invalid.targetId === "source" ? source.id :
        invalid.targetId === "enemy" ? target.id : invalid.targetId;
      const before = statusAtomicWitness(session);
      assert.throws(() => session.submitPlayerCommand(statusCommand({
        actionId: spec.actionId,
        commandId: 1,
        sourceId: source.id,
        targetId,
        tick: session.state.tick,
      })), /target|eligible|unknown/u, `${spec.id} ${invalid.label}`);
      assert.deepEqual(statusAtomicWitness(session), before,
        `${spec.id} ${invalid.label} admission must be byte and state atomic`);
      assert.doesNotThrow(() => session.stepMany(4),
        `${spec.id} ${invalid.label} rejection must not remain pending`);
      assert.equal(session.state.battle.statusRuntime.pending.length, 0,
        `${spec.id} ${invalid.label} rejection must not leave reducer pending state`);
      assert.equal(session.replay.filter(({ type, commandId }) =>
        type === "session-status" && commandId === 1).length, 0,
      `${spec.id} ${invalid.label} rejection must not emit a delayed session status`);
    }
  });
}

for (const spec of EXECUTABLE.filter(({ id }) => id !== "veil-prowler")) {
  test(`game roster troop status: ${spec.id} rejects a structure target atomically`, () => {
    const { battle, source, target } = makeStructureTargetLiveBattle(spec.id);
    const before = {
      bytes: battle.serialize(),
      state: clone(battle.state),
      replay: clone(battle.replay),
      events: clone(battle.events),
      pending: clone(battle.state.statusRuntime.pending),
      entityIds: battle.state.units.map(({ id }) => id).concat(
        battle.state.structures.map(({ id }) => id),
      ),
    };
    assert.throws(() => battle.scheduleTroopStatus(liveStatusCommand({
      actionId: spec.actionId,
      commandId: 1,
      sourceId: source.id,
      targetId: target.id,
      tick: battle.state.tick,
    })), /kind|eligible|target|live/u, `${spec.id} structure target`);
    assert.deepEqual({
      bytes: battle.serialize(),
      state: clone(battle.state),
      replay: clone(battle.replay),
      events: clone(battle.events),
      pending: clone(battle.state.statusRuntime.pending),
      entityIds: battle.state.units.map(({ id }) => id).concat(
        battle.state.structures.map(({ id }) => id),
      ),
    }, before, `${spec.id} structure-target admission must be atomic`);
    assert.doesNotThrow(() => battle.stepMany(4));
    assert.equal(battle.state.statusRuntime.pending.length, 0);
    assert.equal(battle.events.filter(({ type, commandId }) =>
      type === "troop-status-receipt" && commandId === 1).length, 0);
  });
}

for (const spec of EXECUTABLE.filter(({ id }) => id !== "veil-prowler")) {
  test(`game roster troop status: ${spec.id} rejects a dead target at the scheduling boundary`, () => {
    const { battle, source, target } = makeDeadTargetLiveBattle(spec.id);
    const before = {
      bytes: battle.serialize(),
      state: clone(battle.state),
      replay: clone(battle.replay),
      events: clone(battle.events),
      pending: clone(battle.state.statusRuntime.pending),
      entityIds: battle.state.units.map(({ id }) => id),
    };
    assert.throws(() => battle.scheduleTroopStatus(liveStatusCommand({
      actionId: statusActionId(spec.id),
      commandId: 1,
      sourceId: source.id,
      targetId: target.id,
      tick: battle.state.tick,
    })), /live|target|eligible/u, `${spec.id} dead target`);
    assert.deepEqual({
      bytes: battle.serialize(),
      state: clone(battle.state),
      replay: clone(battle.replay),
      events: clone(battle.events),
      pending: clone(battle.state.statusRuntime.pending),
      entityIds: battle.state.units.map(({ id }) => id),
    }, before, `${spec.id} dead-target admission must be atomic`);
    assert.doesNotThrow(() => battle.stepMany(4),
      `${spec.id} dead-target rejection must not crash later steps`);
    assert.equal(battle.state.statusRuntime.pending.length, 0);
    assert.equal(battle.events.filter(({ type, commandId }) =>
      type === "troop-status-receipt" && commandId === 1).length, 0);
  });
}

test("game roster troop status: status admission receipts are frozen and carry resolved host facts", () => {
  // GameSession admission is intentionally the authoritative public route;
  // the nested LiveBattle inspection receipt is checked directly below.
  const live = new LiveBattle(
    parseLiveBattleSetup(canonical(createSessionTroopWitness("pulse-sentry"))),
    undefined,
    canonical(createSessionTroopStatusRuntimeProfiles()),
  );
  live.scheduleDeploy(canonical({ cardId: "pulse-sentry", point: SOUTH_POINT,
    sequence: 0, side: "south", tick: 0 }));
  live.scheduleDeploy(canonical({ cardId: "coilblade", point: NORTH_POINT,
    sequence: 1, side: "north", tick: 0 }));
  live.step();
  const liveSource = live.state.units.find(({ cardId, side }) =>
    cardId === "pulse-sentry" && side === "south");
  const liveTarget = live.state.units.find(({ cardId, side }) =>
    cardId === "coilblade" && side === "north");
  const inspection = live.inspectTroopStatus(liveStatusCommand({
    actionId: "stun",
    commandId: 1,
    sourceId: liveSource.id,
    targetId: liveTarget.id,
    tick: live.state.tick,
  }));
  assert.equal(inspection.type, "troop-status-inspection");
  assert.equal(inspection.source.sourceId, liveSource.id);
  assert.equal(inspection.target.id, liveTarget.id);
  assert.equal(inspection.target.kind, "unit");
  assert.equal(Object.isFrozen(inspection), true);
  assert.equal(Object.isFrozen(inspection.source), true);
  assert.equal(Object.isFrozen(inspection.target), true);
});

test("game roster troop status: deterministic session continuation hashes stay stable", () => {
  const expectedHashes = Object.freeze({
    "bloom-wisp": Object.freeze({
      replay: "c910889cfedec9476105f42111dc2528cd508164ef3bb6a015712b24a0604b86",
      snapshot: "552625d664701401763e78aeb1b3b8ce79b2abaa41142b71eb45c98046d4dfd9",
    }),
    dawnmender: Object.freeze({
      replay: "32ca31c6a29c77928845992163841293862c8c9ee458c53530ea7d367d541be7",
      snapshot: "c7ee4536c9ca885fde04ef99b149fca31e8c138cc9cf9fc96c5ec03b4ff75a2e",
    }),
    "pulse-sentry": Object.freeze({
      replay: "b21f4742b539a0ebfdc6d0a90444901f3b754a032684391fc2d6186e4ef04138",
      snapshot: "711028fb73a858df0546bb847b038b40238823fa71d2bf3ad9b1f4bad279b3e0",
    }),
    "rime-adept": Object.freeze({
      replay: "b7743ef309caefcac631e0b51881df9082ac38b3cf9fc027338612bddd7eef1a",
      snapshot: "96ea0ac365b8fb70a65c19eaeb940812a385fc05a580a2aa5621bda2e9502d92",
    }),
    "tether-rider": Object.freeze({
      replay: "42195da81ea1add834995f2d16d807d2160794ca5c82d3e961abd18813b4562b",
      snapshot: "67221b82e6885ae4417dd7019d41c5e778c34038dac4cccd010eed166224c0b5",
    }),
    "veil-prowler": Object.freeze({
      replay: "53039869e13dc2e1be0d01d114b7a365f8329ed6d568ed19b865200d3cfab75b",
      snapshot: "e184782f3d14d389ef97dea893f9db469095e7f4e0326024b238233419c312e3",
    }),
  });
  const hashes = [];
  for (const id of ["bloom-wisp", "dawnmender", "pulse-sentry", "rime-adept", "tether-rider", "veil-prowler"]) {
    const { session, slot } = makeSession(id);
    const { source, target } = deployWitness(session, id, slot);
    session.submitPlayerCommand(statusCommand({
      actionId: id === "bloom-wisp" || id === "dawnmender" ? "heal" : id === "pulse-sentry" ? "stun" :
        id === "rime-adept" ? "slow" : id === "tether-rider" ? "snare" : "hide",
      commandId: 1,
      sourceId: source.id,
      targetId: id === "veil-prowler" ? null : id === "bloom-wisp" || id === "dawnmender" ? source.id : target.id,
      tick: session.state.tick,
    }));
    session.stepMany(10);
    hashes.push({ id, replay: hash(session.replayBytes()), snapshot: hash(session.serialize()) });
  }
  assert.deepEqual(hashes, Object.entries(expectedHashes).map(([id, values]) => ({
    id,
    replay: values.replay,
    snapshot: values.snapshot,
  })));
  assert.equal(new Set(hashes.map(({ replay, snapshot }) => `${replay}:${snapshot}`)).size, hashes.length);
  assert.equal(hashes.length, 6);
});

test("game roster troop status: all six valid witnesses restore at cuts 0/1/2/4/8/12", () => {
  const cuts = [0, 1, 2, 4, 8, 12];
  let witnesses = 0;
  for (const spec of EXECUTABLE) {
    for (const cut of cuts) {
      const { session, slot } = makeSession(spec.id);
      const { source, target } = deployWitness(session, spec.id, slot);
      session.submitPlayerCommand(statusCommand({
        actionId: spec.actionId,
        commandId: 1,
        sourceId: source.id,
        targetId: spec.target === "enemy" ? target.id : spec.target === null ? null : source.id,
        tick: session.state.tick,
      }));
      session.stepMany(cut);
      const restored = GameSession.restore(session.serialize());
      session.stepMany(12 - cut);
      restored.stepMany(12 - cut);
      assert.equal(restored.serialize(), session.serialize(), `${spec.id} cut ${cut} bytes`);
      assert.equal(restored.replayBytes(), session.replayBytes(), `${spec.id} cut ${cut} replay`);
      witnesses += 1;
    }
  }
  assert.equal(witnesses, 36);
});
