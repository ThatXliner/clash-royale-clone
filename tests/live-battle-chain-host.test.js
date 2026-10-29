import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createSessionTroopProjectileProfileManifest,
  serializeSessionTroopProjectileProfileManifest } from
  "../src/content/session-troop-projectile-profiles.js";
import { createSessionTroopWitness, projectSessionTroopBattleCard } from
  "../src/content/session-troop-roster.js";
import { projectSessionNonUnitBattleCard } from "../src/content/session-card-catalog.js";
import { createSessionSpellProfileReceipts } from "../src/content/session-spell-profile-receipts.js";
import { createEditableGameSessionSetup } from "../src/content/editable-deck.js";
import { PLAYABLE_CARD_IDS } from "../src/content/playable-roster.js";
import {
  createChainQuestionFixture,
  createChainSpecialFixture,
} from "../src/content/cards/special-projectiles-chain.js";
import { DeckCycle } from "../src/sim/deck.js";
import {
  GameSession,
  getGameSessionAudioReplay,
  isAuthenticGameSession,
} from "../src/sim/game-session.js";
import { LiveBattle } from "../src/sim/live-battle.js";
import { getArenaGeometry } from "../src/sim/arena-geometry.js";
import {
  LiveBattleChainContinuation,
  createStormkiteChainQuestionPolicy,
} from "../src/sim/live-battle-chain.js";

const ACCEPTED_HEAD = "65cbb60cbef54ebc34e65aa50a16e2d78643c786";
const ACCEPTED_65_BASE_ROOT_ENV = "ACCEPTED_65_BASE_ROOT";
const FORK_BASE_ROOT_ENV = "GAME_SESSION_FORK_BASE_ROOT";
const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const SOURCE_ROOT = join(REPOSITORY_ROOT, "src");
const KERNEL_PATH = join(SOURCE_ROOT, "sim", "battle-continuation-kernel.js");
const PROJECTILE_MANIFEST = createSessionTroopProjectileProfileManifest();
const PROJECTILE_RECEIPT = serializeSessionTroopProjectileProfileManifest();
const SOUTH = Object.freeze({ x: 3_500, y: 14_500 });
const SOUTH_NEAR = Object.freeze({ x: 3_500, y: 14_900 });
const NORTH_NEAR = Object.freeze({ x: 3_500, y: 17_500 });
const NORTH_CROWN_APPROACH = Object.freeze({ x: 3_500, y: 22_500 });
const NORTH_BEHIND_TOWER = Object.freeze({ x: 3_500, y: 28_000 });
const NORTH_SECONDARY = Object.freeze({ x: 3_500, y: 20_500 });

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function questionKeys(roster) {
  return new Set(roster.flatMap(({ entities }) => entities.flatMap((entity) => [
    ...[entity.bodyRadiusPolicy, entity.projectileSpeedPolicy, entity.deliveryPolicy,
      entity.layerPolicy, entity.damagePolicy]
      .filter((policy) => policy?.kind === "question").map(({ questionKey }) => questionKey),
    ...(entity.sourceConfidencePolicy?.fields ?? []).map(({ questionKey }) => questionKey),
  ])));
}

function battleWitness({ chain = true, buildingCardId = null, buildingSlotId = "coilblade",
  initialWindupTicks = 9_999 } = {}) {
  const witness = structuredClone(createSessionTroopWitness("stormkite"));
  if (buildingCardId !== null) {
    const slot = witness.roster.findIndex(({ id }) => id === buildingSlotId);
    assert.notEqual(slot, -1, "the Stormkite witness carries the selected replaceable card");
    witness.roster.splice(slot, 1, structuredClone(projectSessionNonUnitBattleCard(buildingCardId)));
    const referenced = questionKeys(witness.roster);
    witness.questions = witness.questions.filter(({ key }) => referenced.has(key));
  }
  witness.initialWindupTicks = { central: initialWindupTicks, lane: initialWindupTicks };
  return {
    ...witness,
    ...(chain ? { chainQuestionPolicy: createStormkiteChainQuestionPolicy() } : {}),
  };
}

function createBattle(options = {}) {
  return new LiveBattle(canonical(battleWitness(options)), undefined, undefined,
    options.receipt === false ? undefined : PROJECTILE_RECEIPT);
}

function crossKindTieBattleWitness() {
  const witness = structuredClone(battleWitness({ buildingCardId: "aether-well",
    buildingSlotId: "briar-band" }));
  const prismWitness = createSessionTroopWitness("prism-warden");
  const unitSlot = witness.roster.findIndex(({ id }) => id === "coilblade");
  assert.notEqual(unitSlot, -1, "the admitted Stormkite witness carries the replaceable Coilblade slot");
  witness.roster[unitSlot] = structuredClone(prismWitness.roster.find(({ id }) =>
    id === "prism-warden"));
  const records = new Map([...witness.questions, ...prismWitness.questions]
    .map((record) => [record.key, record]));
  const referenced = questionKeys(witness.roster);
  witness.questions = [...records.values()].filter(({ key }) => referenced.has(key));
  return witness;
}

function createCrossKindTieBattle() {
  return new LiveBattle(canonical(crossKindTieBattleWitness()), undefined, undefined,
    PROJECTILE_RECEIPT);
}

function chainSpellBattleWitness() {
  const witness = structuredClone(battleWitness());
  const swarmSlot = witness.roster.findIndex(({ id }) => id === "briar-band");
  const spellSlot = witness.roster.findIndex(({ id }) => id === "skymaul");
  assert.notEqual(swarmSlot, -1, "the exact Stormkite witness carries the replaceable Briar Band slot");
  assert.notEqual(spellSlot, -1, "the exact Stormkite witness carries the replaceable Skymaul slot");
  const swarmWitness = createSessionTroopWitness("cinderlings");
  witness.roster[swarmSlot] = structuredClone(swarmWitness.roster[0]);
  witness.roster[spellSlot] = structuredClone(projectSessionNonUnitBattleCard("squall-orb"));
  const referenced = questionKeys(witness.roster);
  const questions = new Map([...witness.questions, ...swarmWitness.questions]
    .map((record) => [record.key, record]));
  witness.questions = [...questions.values()].filter(({ key }) => referenced.has(key));
  witness.spellProfileReceipts = createSessionSpellProfileReceipts();
  return witness;
}

function createChainSpellBattle() {
  return new LiveBattle(canonical(chainSpellBattleWitness()), undefined, undefined,
    PROJECTILE_RECEIPT);
}

function deployBattle(battle, { cardId, point, sequence, side }) {
  return battle.scheduleDeploy(canonical({ cardId, point, sequence, side, tick: 0 }));
}

function deployStructure(battle, { cardId, point, sequence, side }) {
  return battle.scheduleStructure(canonical({ cardId, destination: null, point,
    sequence, side, tick: 0 }));
}

function stepToEvent(host, predicate, maximum = 720) {
  const events = [];
  for (let count = 0; count < maximum; count += 1) {
    const boundary = host.step();
    events.push(...boundary);
    if (boundary.some(predicate)) return events;
  }
  throw new Error(`live battle chain event was not reached within ${maximum} ticks`);
}

function towerById(battle, id) {
  const tower = battle.state.towers.find((entry) => entry.id === id);
  assert.ok(tower, `canonical tower ${id} exists`);
  return tower;
}

function towerRadiusFromArenaGeometry(id) {
  const [side, role, lane] = id.split(":");
  const geometry = getArenaGeometry().towers.find((tower) => tower.side === side &&
    tower.role === role && (role !== "lane" || tower.lane === lane));
  assert.ok(geometry, `arena geometry contains canonical tower ${id}`);
  const width = geometry.bounds.maxX - geometry.bounds.minX;
  const height = geometry.bounds.maxY - geometry.bounds.minY;
  return Math.ceil(Math.hypot(width, height) / 2);
}

function distanceSquared(left, right) {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function battleOwnerHealth(state) {
  return canonical({
    structures: state.structures.map(({ alive, hitpoints, id }) => ({ alive, hitpoints, id })),
    towers: state.towers.map(({ hitpoints, id }) => ({ hitpoints, id })),
    units: state.units.map(({ alive, hitpoints, id }) => ({ alive, hitpoints, id })),
  });
}

function battleOwnerFromState(state, owner) {
  const owners = owner.kind === "unit" ? state.units :
    owner.kind === "building" ? state.structures : state.towers;
  return owners.find(({ id }) => id === owner.id);
}

function chainRootsFromBattleBytes(bytes) {
  const snapshot = JSON.parse(bytes);
  assert.equal(typeof snapshot.chainContinuation, "string",
    "an opt-in live battle serializes its pending continuation witness");
  return JSON.parse(snapshot.chainContinuation).pending;
}

function independentNearestChainTarget(candidates, root) {
  // Consume the captured host frame, never post-step alive flags or pre-step positions.
  const visited = new Set(root.visited.map(canonical));
  const range = BigInt(createChainQuestionFixture().hopRangeMillitiles.value);
  const eligible = candidates.filter((target) => target.alive && target.targetable &&
    target.side !== root.sourceSide &&
    (target.owner.kind !== "unit" || target.layer === "ground" || target.layer === "air") &&
    !visited.has(canonical(target.owner))).map((target) => {
    const dx = BigInt(target.position.x - root.anchor.position.x);
    const dy = BigInt(target.position.y - root.anchor.position.y);
    const reach = BigInt(root.anchor.radius) + range + BigInt(target.radius);
    return { distance: dx * dx + dy * dy, owner: target.owner,
      hostId: target.hostId, inRange: dx * dx + dy * dy <= reach * reach };
  }).filter(({ inRange }) => inRange).sort((left, right) => {
    if (left.distance < right.distance) return -1;
    if (left.distance > right.distance) return 1;
    assert.ok(Number.isSafeInteger(left.hostId) && Number.isSafeInteger(right.hostId),
      "an equal-distance fixture tie has canonical numeric host IDs");
    return left.hostId - right.hostId;
  });
  assert.ok(eligible.length > 0, "the dead-source boundary has an eligible hostile owner");
  return eligible[0].owner;
}

function assertCapturedCandidateFrameMatchesStates(frame, beforeState, afterState, label) {
  const stateOwners = [
    ...afterState.units.map((owner) => ({ id: owner.id, kind: "unit" })),
    ...afterState.towers.map((owner) => ({ id: owner.id, kind: "crown-tower" })),
    ...afterState.structures.map((owner) => ({ id: owner.id, kind: "building" })),
  ].map(canonical).sort();
  const frameOwners = frame.map(({ owner }) => canonical(owner)).sort();
  assert.deepEqual(frameOwners, stateOwners,
    `${label} captures every canonical owner present after the actual host boundary`);
  for (const candidate of frame) {
    const beforeOwner = battleOwnerFromState(beforeState, candidate.owner);
    const afterOwner = battleOwnerFromState(afterState, candidate.owner);
    assert.ok(afterOwner, `${label} candidate ${canonical(candidate.owner)} remains in canonical state`);
    assert.deepEqual(candidate.owner, { id: afterOwner.id, kind: candidate.owner.kind });
    assert.equal(candidate.side, afterOwner.side);
    assert.deepEqual(candidate.position, afterOwner.position,
      `${label} candidate geometry is the canonical resolved post-movement owner position`);
    assert.ok(Number.isSafeInteger(candidate.hostId),
      `${label} exposes the host's canonical numeric ID for each candidate`);
    if (beforeOwner !== undefined) {
      const ownerAlive = candidate.owner.kind === "crown-tower"
        ? beforeOwner.hitpoints > 0 : beforeOwner.alive;
      assert.equal(candidate.alive, ownerAlive,
        `${label} uses pre-combat eligibility rather than post-contact HP`);
    }
    if (candidate.owner.kind === "unit") {
      assert.equal(candidate.layer, afterOwner.layer);
      assert.equal(candidate.radius, afterOwner.radius);
      assert.equal(candidate.hostId, afterOwner.id);
    } else if (candidate.owner.kind === "building") {
      assert.equal(candidate.layer, "ground");
      assert.equal(candidate.radius, 0,
        `${label} uses the existing radius-zero building-point geometry`);
      assert.equal(candidate.hostId, afterOwner.id);
    } else {
      assert.equal(candidate.layer, "ground");
      assert.equal(candidate.radius, towerRadiusFromArenaGeometry(afterOwner.id),
        `${label} crown radius matches canonical arena geometry`);
    }
    assert.equal(typeof candidate.targetable, "boolean",
      `${label} uses the captured pre-combat targetability control`);
  }
}

function isStormkiteProjectileLaunch(event, sourceId) {
  return event.type === "projectile-launch" && event.direction === "unit-to-unit" &&
    eventProjectileIdentity(event)?.sourceId === sourceId;
}

function createChainHostSession() {
  const session = new GameSession(canonical(setupSession({ legalNorthDeployments: [
    { cardId: "coilblade", point: NORTH_SECONDARY },
    { cardId: "mossguard", point: NORTH_CROWN_APPROACH },
  ], northOpeningCards: ["mossguard", "coilblade"], thinkIntervalTicks: 1 })));
  deployStormkite(session);
  return session;
}

function captureLiveBattleFaultBoundary(phase) {
  const battle = createBattle();
  deployBattle(battle, { cardId: "stormkite", point: SOUTH, sequence: 0, side: "south" });
  deployBattle(battle, { cardId: "mossguard", point: NORTH_CROWN_APPROACH,
    sequence: 1, side: "north" });
  battle.step();
  const stormkite = battle.state.units.find(({ cardId, side }) =>
    cardId === "stormkite" && side === "south");
  assert.ok(stormkite, "the authentic south Stormkite materialized for the fault control");
  const launchEvents = stepToEvent(battle,
    (event) => isStormkiteProjectileLaunch(event, stormkite.id));
  const launch = launchEvents.find((event) => isStormkiteProjectileLaunch(event, stormkite.id));
  const identity = eventProjectileIdentity(launch);
  assert.ok(identity, "the flight snapshot is bound to the host-minted primary identity");
  if (phase === "hop-pending") {
    const primaryEvents = stepToEvent(battle, (event) =>
      event.type === "chain-primary-settled" && event.status === "pending" &&
      canonical(event.lineage?.primaryProjectileIdentity) === canonical(identity));
    assert.ok(primaryEvents.some((event) => event.type === "chain-primary-settled" &&
      canonical(event.lineage?.primaryProjectileIdentity) === canonical(identity)));
    const bytes = battle.serialize();
    const roots = chainRootsFromBattleBytes(bytes);
    assert.equal(roots.length, 1);
    assert.equal(roots[0].phase, "hop-pending");
    assert.deepEqual(roots[0].identity, identity);
    const stateBefore = battle.state;
    const eventsBefore = battle.events;
    const boundaryEvents = battle.step();
    assert.ok(boundaryEvents.some((event) => event.type === "chain-hop-settled" &&
      canonical(event.lineage?.primaryProjectileIdentity) === canonical(identity)),
    "the next authentic boundary settles the due hop");
    return { afterBytes: battle.serialize(), beforeBytes: bytes, boundaryEvents,
      eventsBefore, identity, phase, roots, stateBefore };
  }

  assert.equal(phase, "primary-flight");
  for (let count = 0; count < 64; count += 1) {
    const beforeBytes = battle.serialize();
    const roots = chainRootsFromBattleBytes(beforeBytes);
    assert.equal(roots.length, 1);
    assert.equal(roots[0].phase, "primary-flight");
    assert.deepEqual(roots[0].identity, identity);
    const stateBefore = battle.state;
    const eventsBefore = battle.events;
    const boundaryEvents = battle.step();
    if (!boundaryEvents.some((event) => event.type === "projectile-impact" &&
        canonical(eventProjectileIdentity(event)) === canonical(identity))) continue;
    assert.ok(boundaryEvents.some((event) => event.type === "chain-primary-settled" &&
      canonical(event.lineage?.primaryProjectileIdentity) === canonical(identity)),
    "the captured flight boundary is the actual owner-confirmed primary impact");
    return { afterBytes: battle.serialize(), beforeBytes, boundaryEvents, eventsBefore,
      identity, phase, roots, stateBefore };
  }
  throw new Error("Stormkite primary projectile did not impact within the bounded flight window");
}

function captureGameSessionFaultBoundary(phase) {
  const session = createChainHostSession();
  const stormkite = () => session.state.battle.units.find(({ cardId, side }) =>
    cardId === "stormkite" && side === "south");
  stepToEvent(session, (event) => isStormkiteProjectileLaunch(event, stormkite()?.id));
  const launch = session.replay.find((event) => isStormkiteProjectileLaunch(event, stormkite()?.id));
  const identity = eventProjectileIdentity(launch);
  assert.ok(identity, "the session flight snapshot is bound to an authentic primary identity");
  if (phase === "hop-pending") {
    stepToEvent(session, (event) => event.type === "chain-primary-settled" &&
      event.status === "pending" &&
      canonical(event.lineage?.primaryProjectileIdentity) === canonical(identity));
    const bytes = session.serialize();
    const replayBefore = session.replay;
    assert.ok(replayBefore.some((event) => event.type === "chain-primary-settled" &&
      event.status === "pending" &&
      canonical(event.lineage?.primaryProjectileIdentity) === canonical(identity)),
    "the session transcript contains the exact pending primary lineage");
    const stateBefore = session.state;
    const audioBefore = getGameSessionAudioReplay(session);
    const boundaryEvents = session.step();
    assert.ok(boundaryEvents.some((event) => event.type === "chain-hop-settled" &&
      canonical(event.lineage?.primaryProjectileIdentity) === canonical(identity)),
    "the next authenticated session boundary settles the due hop");
    return { afterBytes: session.serialize(), audioBefore, beforeBytes: bytes, boundaryEvents,
      identity, phase, replayBefore, stateBefore };
  }

  assert.equal(phase, "primary-flight");
  for (let count = 0; count < 64; count += 1) {
    const beforeBytes = session.serialize();
    const replayBefore = session.replay;
    assert.ok(replayBefore.some((event) => isStormkiteProjectileLaunch(event, stormkite()?.id)));
    assert.equal(replayBefore.some((event) => event.type === "chain-primary-settled" &&
      canonical(event.lineage?.primaryProjectileIdentity) === canonical(identity)), false,
    "the captured transcript still has a real flight root, before owner impact settlement");
    const stateBefore = session.state;
    const audioBefore = getGameSessionAudioReplay(session);
    const boundaryEvents = session.step();
    if (!boundaryEvents.some((event) => event.type === "projectile-impact" &&
        canonical(eventProjectileIdentity(event)) === canonical(identity))) continue;
    assert.ok(boundaryEvents.some((event) => event.type === "chain-primary-settled" &&
      canonical(event.lineage?.primaryProjectileIdentity) === canonical(identity)),
    "the captured session boundary settles the actual primary impact");
    return { afterBytes: session.serialize(), audioBefore, beforeBytes, boundaryEvents,
      identity, phase, replayBefore, stateBefore };
  }
  throw new Error("GameSession Stormkite primary did not impact within the bounded flight window");
}

function eventProjectileIdentity(event) {
  return event.projectileIdentity ?? event.projectile?.projectileIdentity ?? null;
}

function capturePrimaryLaunchCheckpoint(host, { session = false, sourceId, minimumAttackSequence = 1 }) {
  for (let count = 0; count < 720; count += 1) {
    const boundaryEvents = host.step();
    const launch = boundaryEvents.find((event) => event.type === "projectile-launch" &&
      eventProjectileIdentity(event)?.sourceId === sourceId &&
      eventProjectileIdentity(event)?.attackSequence >= minimumAttackSequence);
    if (launch === undefined) continue;
    const identity = eventProjectileIdentity(launch);
    const beforeBytes = host.serialize();
    const state = session ? host.state.battle : host.state;
    const source = state.units.find(({ id }) => id === sourceId);
    assert.ok(source?.alive, "the real flight checkpoint retains the live authenticated source");
    return { beforeBytes, boundaryEvents, identity, launch, source };
  }
  throw new Error("the Stormkite primary did not reach the bounded real flight checkpoint");
}

function advanceToPrimaryImpact(host, identity) {
  const boundaries = [];
  for (let count = 0; count < 64; count += 1) {
    const boundaryEvents = host.step();
    boundaries.push(boundaryEvents);
    const impact = boundaryEvents.find((event) => event.type === "projectile-impact" &&
      canonical(eventProjectileIdentity(event)) === canonical(identity));
    if (impact === undefined) continue;
    const primary = boundaryEvents.find((event) => event.type === "chain-primary-settled" &&
      canonical(event.lineage?.primaryProjectileIdentity) === canonical(identity));
    assert.ok(primary, "the real projectile owner contact reaches canonical chain settlement");
    return { boundaries, boundaryEvents, impact, primary };
  }
  throw new Error("the in-flight Stormkite primary did not impact in the bounded flight window");
}

function setupSession({ chain = true, legalNorthDeployments = [], receipt = true,
  northOpeningCards = [], southOpeningCards = [], thinkIntervalTicks = 3_600 } = {}) {
  const battle = battleWitness({ chain });
  const deck = battle.roster.map(({ id }) => id);
  const base = {
    battleSetup: canonical(battle),
    deck,
    legalNorthDeployments,
    rosterWitness: canonical({ questions: battle.questions, roster: battle.roster }),
    seed: 0,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks,
    thinkOffsetTicks: 0,
  };
  if (receipt) base.projectileRuntimeProfiles = PROJECTILE_RECEIPT;
  let seed = 0;
  for (; seed < 10_000; seed += 1) {
    const southHand = new DeckCycle({ deck, seed: `${seed}:south` }).state.hand;
    const northHand = new DeckCycle({ deck, seed: `${seed}:north` }).state.hand;
    if (["stormkite", ...southOpeningCards].every((cardId) => southHand.includes(cardId)) &&
        northOpeningCards.every((cardId) => northHand.includes(cardId))) break;
  }
  assert.ok(seed < 10_000, "Stormkite has an authentic opening hand witness");
  base.seed = seed;
  return base;
}

function chainSpellSessionSetup() {
  const battle = chainSpellBattleWitness();
  const deck = battle.roster.map(({ id }) => id);
  const legalNorthDeployments = [{ cardId: "stormkite", point: NORTH_NEAR }];
  const southOpeningCards = ["mossguard", "cinderlings", "squall-orb"];
  let seed = 0;
  for (; seed < 10_000; seed += 1) {
    const southHand = new DeckCycle({ deck, seed: `${seed}:south` }).state.hand;
    const northHand = new DeckCycle({ deck, seed: `${seed}:north` }).state.hand;
    if (southOpeningCards.every((cardId) => southHand.includes(cardId)) &&
        northHand.includes("stormkite")) break;
  }
  assert.ok(seed < 10_000, "the authenticated Stormkite, troop, and spell cards have opening hands");
  return {
    battleSetup: canonical(battle),
    deck,
    legalNorthDeployments,
    projectileRuntimeProfiles: PROJECTILE_RECEIPT,
    rosterWitness: canonical({ questions: battle.questions, roster: battle.roster }),
    seed,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 3_600,
    thinkOffsetTicks: 0,
  };
}

function submitSessionDeploy(session, { cardId, commandId, point }) {
  const slot = session.state.decks.south.hand.indexOf(cardId);
  assert.notEqual(slot, -1, `${cardId} is in the south hand when deployed`);
  return session.submitPlayerCommand(canonical({ cardId, commandId, point, slot,
    tick: session.state.tick, type: "deploy" }));
}

function deployStormkite(session) {
  const slot = session.state.decks.south.hand.indexOf("stormkite");
  assert.notEqual(slot, -1, "Stormkite is in the opening south hand");
  const result = session.submitPlayerCommand(canonical({ cardId: "stormkite", commandId: 0,
    point: SOUTH, slot, tick: session.state.tick, type: "deploy" }));
  assert.equal(result.accepted, true);
}

function chainIdentity(sourceId = 1) {
  return { attackSequence: 0, direction: "unit-to-unit", projectileId: 1, sourceId };
}

function armContinuation(policy = createStormkiteChainQuestionPolicy()) {
  const continuation = new LiveBattleChainContinuation(policy);
  const identity = chainIdentity();
  continuation.launch({ identity, primaryTargetId: 2, sourceSide: "south", tick: 0 });
  continuation.settlePrimary(identity, {
    ownerConfirmed: true,
    sourceAlive: true,
    target: { owner: { id: 2, kind: "unit" }, position: { x: 5_000, y: 5_000 }, radius: 500 },
    tick: 4,
  });
  return { continuation, identity };
}

test("chain opt-in retains all eleven source QUESTION records and labels owner attribution separately", () => {
  const fixture = createChainQuestionFixture();
  const policy = createStormkiteChainQuestionPolicy();
  const questions = policy.questions;
  assert.equal(PROJECTILE_MANIFEST.profiles.find(({ id }) => id === "stormkite")?.claims[0]
    ?.claimFamily, "chain", "Stormkite has an authentic chain-family profile binding");
  for (const [key, record] of Object.entries(fixture)) {
    assert.deepEqual(questions[key], record, `${key} remains the original QUESTION record`);
  }
  assert.equal(Object.keys(fixture).length, 11);
  assert.deepEqual(questions.simultaneousContactAttributionRule, {
    authoritative: false,
    confidence: "unverified",
    disposition: "question",
    source: "unsourced-live-battle-chain-owner-attribution-question",
    value: "positive-same-target-contacts-share-any-positive-canonical-owner-loss-on-the-boundary",
  });

  const receiptOnly = createBattle({ chain: false });
  assert.equal(JSON.parse(receiptOnly.serialize()).version, 2,
    "a projectile receipt by itself does not opt into a chain continuation");
  assert.equal(Object.hasOwn(JSON.parse(receiptOnly.serialize()), "chainContinuation"), false);
  assert.throws(() => createBattle({ receipt: false }), /requires its admitted chain projectile profile/u,
    "the explicit model cannot run without the matching authenticated profile");

  const missingStormkite = structuredClone(battleWitness());
  missingStormkite.roster = missingStormkite.roster.filter(({ id }) => id !== "stormkite");
  const replacementWitness = createSessionTroopWitness("brassbolt");
  missingStormkite.roster.push(structuredClone(replacementWitness.roster.find(({ id }) =>
    id === "cinderlings")));
  const questionRecords = new Map();
  for (const record of [...missingStormkite.questions, ...replacementWitness.questions]) {
    if (!questionRecords.has(record.key)) questionRecords.set(record.key, record);
  }
  const retainedQuestionKeys = questionKeys(missingStormkite.roster);
  missingStormkite.questions = [...questionRecords.values()].filter(({ key }) =>
    retainedQuestionKeys.has(key));
  assert.throws(() => new LiveBattle(canonical(missingStormkite), undefined, undefined,
    PROJECTILE_RECEIPT), /requires its admitted chain projectile profile/u,
  "a receipt whose Stormkite source is absent from the admitted battle cannot run the model");

  const wrongBinding = structuredClone(policy);
  wrongBinding.claimFamily = "pierce";
  assert.throws(() => new LiveBattle(canonical({ ...battleWitness({ chain: false }),
    chainQuestionPolicy: wrongBinding }), undefined, undefined, PROJECTILE_RECEIPT),
  /must name the Stormkite chain question model/u,
  "the explicit model rejects a matched projectile claim that is not Stormkite/chain");

  const rawPlanSetup = battleWitness();
  const rawPlanSetupBytes = canonical(rawPlanSetup);
  const rawManifestBytes = canonical(PROJECTILE_MANIFEST);
  const unaffectedBattle = createBattle();
  const unaffectedBattleBytes = unaffectedBattle.serialize();
  assert.throws(() => new LiveBattle(rawPlanSetupBytes, undefined, undefined,
    PROJECTILE_MANIFEST), (error) => {
    assert.ok(error instanceof TypeError);
    assert.match(error.message, /session troop projectile authority receipt must be primitive text/u);
    return true;
  }, "a raw unbranded projectile manifest is rejected at primitive receipt admission");
  assert.equal(canonical(rawPlanSetup), rawPlanSetupBytes,
    "rejecting the raw plan preserves the setup witness bytes");
  assert.equal(canonical(PROJECTILE_MANIFEST), rawManifestBytes,
    "rejecting the raw plan preserves the caller's manifest bytes");
  assert.equal(unaffectedBattle.serialize(), unaffectedBattleBytes,
    "rejecting the raw plan leaves an existing host session byte-identical");

  const forged = structuredClone(policy);
  delete forged.questions.targetCap;
  assert.throws(() => new LiveBattle(canonical({ ...battleWitness({ chain: false }),
    chainQuestionPolicy: forged }), undefined, undefined, PROJECTILE_RECEIPT),
  /every exact QUESTION record/u);
});

test("mixed building admission keeps exact Stormkite unit receipt and building policy binding", () => {
  const validWitness = battleWitness({ buildingCardId: "aether-well" });
  assert.doesNotThrow(() => new LiveBattle(canonical(validWitness), undefined, undefined,
    PROJECTILE_RECEIPT), "the authenticated projectile receipt composes with an admitted building");

  const changedUnitWitness = structuredClone(validWitness);
  const stormkite = changedUnitWitness.roster.find(({ id }) => id === "stormkite");
  stormkite.damage += 1;
  assert.throws(() => new LiveBattle(canonical(changedUnitWitness), undefined, undefined,
    PROJECTILE_RECEIPT), /projectile source roster stormkite diverges/u,
  "the mixed-roster projection still validates the complete canonical projectile unit source");

  const changedBuildingWitness = structuredClone(validWitness);
  const building = changedBuildingWitness.roster.find(({ id }) => id === "aether-well");
  building.buildingRuntime.generationAmount += 1;
  assert.throws(() => new LiveBattle(canonical(changedBuildingWitness), undefined, undefined,
    PROJECTILE_RECEIPT), /building profile|building.*receipt|policy/u,
  "the projectile unit subset does not bypass full admitted building receipt validation");

  const missingBuildingReceipt = structuredClone(validWitness);
  delete missingBuildingReceipt.roster.find(({ id }) => id === "aether-well").buildingRuntime;
  assert.throws(() => new LiveBattle(canonical(missingBuildingReceipt), undefined, undefined,
    PROJECTILE_RECEIPT), /lacks a canonical buildingRuntime receipt/u,
  "full setup admission rejects a structure without its exact building owner receipt");

  const malformedBuildingReceipt = structuredClone(validWitness);
  malformedBuildingReceipt.roster.find(({ id }) => id === "aether-well").buildingRuntime = null;
  assert.throws(() => new LiveBattle(canonical(malformedBuildingReceipt), undefined, undefined,
    PROJECTILE_RECEIPT), /buildingRuntime|building profile|building.*receipt/u,
  "full setup admission rejects a malformed building owner receipt");

  const unknownBuildingReceiptField = structuredClone(validWitness);
  unknownBuildingReceiptField.roster.find(({ id }) => id === "aether-well")
    .buildingRuntime.unreviewedFlag = true;
  assert.throws(() => new LiveBattle(canonical(unknownBuildingReceiptField), undefined, undefined,
    PROJECTILE_RECEIPT), /buildingRuntime|building profile|building.*receipt/u,
  "the chain's canonical unit projection cannot conceal unknown building receipt fields");

  const unknownCardField = structuredClone(validWitness);
  unknownCardField.roster.find(({ id }) => id === "stormkite").unreviewedField = true;
  assert.throws(() => new LiveBattle(canonical(unknownCardField), undefined, undefined,
    PROJECTILE_RECEIPT), /invalid shape/u,
  "strict full setup admission rejects unknown unit card fields before source projection");
});

test("continuation rejects a nearer friendly before choosing the eligible hostile", () => {
  const { continuation, identity } = armContinuation();
  const plans = continuation.planDue(5, [
    { alive: true, hostId: 1, layer: "ground", owner: { id: 1, kind: "unit" },
      position: { x: 5_000, y: 5_400 }, radius: 500, side: "south", targetable: true },
    { alive: true, hostId: 3, layer: "ground", owner: { id: 3, kind: "unit" },
      position: { x: 5_000, y: 7_500 }, radius: 500, side: "north", targetable: true },
  ]);
  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0].target.owner, { id: 3, kind: "unit" });
  assert.deepEqual(plans[0].lineage, { hopOrdinal: 1, primaryProjectileIdentity: identity });
  assert.equal(plans[0].ingressSourceId, "chain:1:0:1:unit-to-unit:1");
});

test("live host filters a nearer friendly before the in-range hostile crown hop", () => {
  const battle = createBattle();
  deployBattle(battle, { cardId: "stormkite", point: SOUTH, sequence: 0, side: "south" });
  deployBattle(battle, { cardId: "mossguard", point: NORTH_CROWN_APPROACH,
    sequence: 1, side: "north" });
  battle.step();
  const source = battle.state.units.find(({ cardId, side }) => cardId === "stormkite" && side === "south");
  const primary = battle.state.units.find(({ cardId, side }) =>
    cardId === "mossguard" && side === "north");
  assert.ok(source && primary, "the Stormkite source and Mossguard primary materialized");
  const sourceId = source.id;
  const primaryId = primary.id;

  const events = stepToEvent(battle, (event) => event.type === "chain-primary-settled" &&
    event.status === "pending");
  const pending = JSON.parse(JSON.parse(battle.serialize()).chainContinuation).pending[0];
  assert.deepEqual(pending.visited[0], { id: primaryId, kind: "unit" });
  const currentUnits = battle.state.units;
  const currentSource = currentUnits.find(({ id }) => id === sourceId);
  const hostileTower = towerById(battle, "north:lane:west");
  assert.ok(currentSource && hostileTower.hitpoints > 0,
    "the nearer friendly source and hostile crown owner remain live");
  const distanceSquared = (left, right) => (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
  const anchor = pending.anchor.position;
  const friendlyDistance = distanceSquared(currentSource.position, anchor);
  const hostileDistance = distanceSquared(hostileTower.position, anchor);
  assert.ok(friendlyDistance < hostileDistance,
  "the same-side Stormkite is nearer to the primary impact anchor than the hostile candidate");
  assert.ok(friendlyDistance <=
    (pending.anchor.radius + 3_000 + currentSource.radius) ** 2,
  "the nearer same-side source would be in range without the side filter");
  assert.ok(hostileDistance <=
    (pending.anchor.radius + 3_000 + towerRadiusFromArenaGeometry(hostileTower.id)) ** 2,
  "the farther hostile crown owner remains inside the explicit QUESTION range");

  const beforeTower = hostileTower.hitpoints;
  const hopEvents = battle.step();
  const hop = hopEvents.find((event) => event.type === "chain-hop-settled");
  assert.deepEqual(hop?.owner, { id: hostileTower.id, kind: "crown-tower" });
  assert.equal(hop?.status, "pending");
  const towerContact = hopEvents.find((event) => event.type === "external-structure-contact" &&
    event.sourceId?.startsWith("chain:") && event.structureId === hostileTower.id);
  assert.equal(towerContact?.damage, 192);
  assert.equal(beforeTower - towerById(battle, hostileTower.id).hitpoints, 192);
  assert.equal(events.some((event) => event.type === "chain-hop-settled"), false,
    "the hop is planned only on the following canonical boundary");
});

test("a real Stormkite primary tower contact damages a nearby building through its canonical owner", () => {
  const battle = createBattle({ buildingCardId: "aether-well" });
  deployBattle(battle, { cardId: "stormkite", point: SOUTH, sequence: 0, side: "south" });
  deployStructure(battle, { cardId: "aether-well", point: NORTH_BEHIND_TOWER,
    sequence: 1, side: "north" });
  battle.step();
  const beforeTower = towerById(battle, "north:lane:west").hitpoints;
  const beforeBuilding = battle.state.structures.find(({ cardId }) => cardId === "aether-well");
  assert.ok(beforeBuilding, "the admitted building owner is present in the live host");

  const events = stepToEvent(battle, (event) => event.type === "chain-hop-settled" &&
    event.status === "complete");
  const primary = events.find((event) => event.type === "chain-primary-settled" &&
    event.status === "pending");
  const hop = events.find((event) => event.type === "chain-hop-settled" &&
    event.owner?.kind === "building");
  assert.equal(primary?.owner?.kind, "crown-tower",
    "the real host projectile first contacts the canonical crown owner");
  assert.equal(hop?.status, "pending",
    "the building owner takes the first hop while another in-range hostile crown remains");
  const afterTower = towerById(battle, "north:lane:west").hitpoints;
  const afterBuilding = battle.state.structures.find(({ id }) => id === beforeBuilding.id);
  assert.ok(beforeTower > afterTower, "the crown owner lost primary-contact health");
  assert.ok(afterBuilding.hitpoints < beforeBuilding.hitpoints,
    "the chain hop changed the existing building owner's health");
  assert.equal(beforeBuilding.hitpoints - afterBuilding.hitpoints, 192,
    "one QUESTION-model hop amount was applied once by the owner");
  assert.equal(events.find((event) => event.type === "structure-damaged" &&
    event.origin === "stormkite-chain-contact")?.amountApplied, 192);
});

test("a real unit primary contact can chain into crown-tower health", () => {
  const battle = createBattle();
  deployBattle(battle, { cardId: "stormkite", point: SOUTH, sequence: 0, side: "south" });
  deployBattle(battle, { cardId: "mossguard", point: NORTH_CROWN_APPROACH,
    sequence: 1, side: "north" });
  const before = towerById(battle, "north:lane:west").hitpoints;
  const events = stepToEvent(battle, (event) => event.type === "chain-hop-settled" &&
    event.status === "complete");
  const primary = events.find((event) => event.type === "chain-primary-settled" &&
    event.status === "pending");
  const hop = events.find((event) => event.type === "chain-hop-settled" &&
    event.owner?.kind === "crown-tower");
  assert.equal(primary?.owner?.kind, "unit");
  assert.equal(hop?.status, "pending",
    "the unit's first crown hop leaves the adjacent central crown eligible for the next hop");
  assert.equal(before - towerById(battle, "north:lane:west").hitpoints, 192,
    "the selected canonical crown owner loses exactly one hop through BattleCombat");
});

test("a real GameSession opt-in sends unit hops through shared unit health and replay", () => {
  const setup = setupSession({ legalNorthDeployments: [
    { cardId: "coilblade", point: NORTH_SECONDARY },
    { cardId: "mossguard", point: NORTH_CROWN_APPROACH },
  ], northOpeningCards: ["mossguard", "coilblade"], thinkIntervalTicks: 1 });
  const session = new GameSession(canonical(setup));
  const before = session.state;
  deployStormkite(session);
  const events = session.stepMany(360);
  const northDeployments = events.filter((event) => event.type === "session-deployed" &&
    event.side === "north");
  assert.equal(northDeployments.length, 2,
    "both authentic hostile unit deployments materialized before the chain contact");
  const chainDamage = events.filter((event) => event.type === "damage" &&
    event.externalSourceId?.startsWith("chain:"));
  const primaryBoundaries = events.filter((event) => event.type === "chain-primary-settled" &&
    event.status === "pending");
  const hopBoundaries = events.filter((event) => event.type === "chain-hop-settled");
  assert.ok(primaryBoundaries.length > 0,
    "GameSession replay publishes an owner-confirmed primary lineage boundary");
  assert.ok(hopBoundaries.length > 0,
    "GameSession replay publishes the settled delayed-contact boundary");
  const firstPrimaryIdentity = primaryBoundaries[0].lineage.primaryProjectileIdentity;
  assert.ok(events.some((event) => event.type === "projectile-launch" &&
    eventProjectileIdentity(event) && canonical(eventProjectileIdentity(event)) ===
      canonical(firstPrimaryIdentity)),
  "the published primary lineage is the exact host-minted projectile identity");
  const primaryLineageKeys = new Set(primaryBoundaries.map(({ lineage }) =>
    canonical(lineage.primaryProjectileIdentity)));
  assert.ok(hopBoundaries.every(({ lineage }) =>
    primaryLineageKeys.has(canonical(lineage.primaryProjectileIdentity))),
  "every published hop boundary retains the identity of its own host primary");
  assert.ok(chainDamage.length > 0,
    "GameSession routed an owner-confirmed chain hop through BattleCombat's normal damage owner");
  for (const damage of chainDamage) {
    assert.ok(damage.currentHealthAfter < damage.currentHealthBefore,
      "every settled unit hop has a positive canonical health decrease");
  }
  assert.equal(session.state.tick, 360);
  assert.equal(session.state.battle.tick, session.state.tick);
  const restored = GameSession.restore(session.serialize());
  assert.equal(restored.serialize(), session.serialize());
  assert.equal(restored.replayBytes(), session.replayBytes());
  const audio = getGameSessionAudioReplay(session);
  assert.equal(audio.some(({ type }) => type === "chain-primary-settled" ||
    type === "chain-hop-settled"), false,
  "the lifecycle records are excluded from audio as non-sound diagnostics");
  assert.ok(audio.some((event) => event.type === "projectile-impact" &&
    eventProjectileIdentity(event)?.sourceId ===
      events.find((candidate) => candidate.type === "projectile-launch" &&
        candidate.direction === "unit-to-unit")?.sourceId),
  "the host projectile impact remains in the audio projection");
  assert.ok(audio.some((event) => event.type === "damage" &&
    event.externalSourceId?.startsWith("chain:")),
  "the canonical chain owner damage remains in the audio projection");
  assert.ok(before.battle.units.length === 0, "the retained setup checkpoint remains immutable");
});

test("canonical editable Stormkite setup restores, forks, chunks, and keeps the same deck", () => {
  const deck = ["stormkite", ...PLAYABLE_CARD_IDS.slice(1)];
  const setupText = createEditableGameSessionSetup(deck, 1);
  const setup = JSON.parse(setupText);
  const session = new GameSession(setupText);
  assert.ok(session.state.decks.south.hand.includes("stormkite"),
    "the canonical custom seed gives the real player Stormkite in hand");
  deployStormkite(session);

  const beforePending = stepToEvent(session, (event) =>
    event.type === "chain-primary-settled" && event.status === "pending");
  const source = session.state.battle.units.find(({ cardId, side }) =>
    cardId === "stormkite" && side === "south");
  assert.ok(source, "the canonical editable setup materializes the player Stormkite");
  assert.ok(beforePending.some((event) => event.type === "session-deployed" &&
    event.side === "north" && event.deployment?.cardId !== undefined),
  "the unforced opponent controller deployed a real target from the same custom deck");
  assert.ok(beforePending.some((event) => event.type === "projectile-launch" &&
    eventProjectileIdentity(event)?.sourceId === source.id),
  "the player contact carries a host-minted Stormkite projectile identity");

  const pendingBytes = session.serialize();
  const direct = GameSession.restore(pendingBytes);
  const fork = direct.fork();
  const directEvents = direct.stepMany(4);
  const chunkedEvents = [...fork.stepMany(1), ...fork.stepMany(3)];
  assert.deepEqual(chunkedEvents, directEvents,
    "the restored host settles the same pending chain across chunk sizes");
  assert.ok(directEvents.some((event) => event.type === "chain-hop-settled"),
    "a real editable GameSession resolves the delayed chain contact");
  assert.ok(directEvents.some((event) => event.type === "damage" &&
    event.externalSourceId?.startsWith("chain:")),
  "the next contact passes through canonical battle owner damage");
  assert.equal(fork.serialize(), direct.serialize());
  assert.deepEqual(getGameSessionAudioReplay(fork), getGameSessionAudioReplay(direct));
  assert.ok(getGameSessionAudioReplay(direct).some((event) => event.type === "damage" &&
    event.externalSourceId?.startsWith("chain:")),
  "audio replay retains the actual chain damage");

  session.restart();
  const restarted = JSON.parse(session.serialize()).setup;
  assert.deepEqual(restarted.deck, deck,
    "restart carries the same selected editable deck");
  assert.equal(restarted.projectileRuntimeProfiles, setup.projectileRuntimeProfiles,
    "restart retains the authentic projectile profile receipt");
  assert.deepEqual(JSON.parse(restarted.battleSetup).chainQuestionPolicy,
    JSON.parse(setup.battleSetup).chainQuestionPolicy,
    "restart retains the explicit Stormkite QUESTION policy");
});

test("an admitted Stormkite chain coexists with an unresolved Brassbolt QUESTION launch", () => {
  const setup = setupSession({ southOpeningCards: ["brassbolt"], legalNorthDeployments: [
    { cardId: "coilblade", point: NORTH_SECONDARY },
    { cardId: "mossguard", point: NORTH_CROWN_APPROACH },
  ], northOpeningCards: ["mossguard", "coilblade"], thinkIntervalTicks: 1 });
  const session = new GameSession(canonical(setup));
  assert.ok(setup.deck.includes("stormkite") && setup.deck.includes("brassbolt"),
    "both chain-bound Stormkite and unresolved Brassbolt use the same admitted roster");
  deployStormkite(session);
  const chainEvents = session.stepMany(360);
  assert.ok(chainEvents.some((event) => event.type === "chain-primary-settled" &&
    event.status === "pending"), "the opt-in Stormkite profile settles a real primary contact");
  assert.ok(chainEvents.some((event) => event.type === "chain-hop-settled"),
    "the same host executes a canonical delayed chain hop");
  assert.ok(chainEvents.some((event) => event.type === "damage" &&
    event.externalSourceId?.startsWith("chain:")),
  "the chain continues through canonical owner damage");

  assert.equal(submitSessionDeploy(session, { cardId: "brassbolt", commandId: 1,
    point: { x: 5_500, y: SOUTH.y } }).accepted, true,
  "the admitted unresolved card can coexist in the chain-enabled session");
  const brassboltEvents = session.stepMany(450);
  const question = brassboltEvents.find((event) => event.type ===
    "projectile-runtime-question" && event.cardId === "brassbolt");
  assert.ok(question, "a genuine Brassbolt host launch retains its unresolved QUESTION");
  const launch = brassboltEvents.find((event) => event.type === "projectile-launch" &&
    canonical(eventProjectileIdentity(event)) === canonical(question.identity));
  assert.ok(launch, "the QUESTION remains bound to Brassbolt's canonical projectile identity");
  assert.equal(question.disposition, "question");
  assert.equal(question.identity.sourceId, question.sourceId);
  const dependency = createSessionTroopProjectileProfileManifest()
    .unresolvedDeliveryDependencies.find(({ id }) => id === "brassbolt");
  assert.ok(dependency, "Brassbolt's unresolved delivery stays an admitted QUESTION");
  assert.deepEqual(question.questions, Object.entries(dependency.questions).map(([key, record]) => ({
    ...structuredClone(record), key,
  })), "chain opt-in does not rewrite or promote the Brassbolt QUESTION records");
  assert.ok(question.questions.every(({ authoritative, disposition }) =>
    authoritative === false && disposition === "question"),
  "no unresolved Brassbolt value gains execution authority");

  const restored = GameSession.restore(session.serialize());
  assert.equal(restored.serialize(), session.serialize());
  assert.equal(restored.replayBytes(), session.replayBytes());
  assert.deepEqual(getGameSessionAudioReplay(restored), getGameSessionAudioReplay(session));
});

test("continuation helper retains its launch-side policy after source death", () => {
  const identity = chainIdentity(17);
  const cancelledAtPrimary = new LiveBattleChainContinuation(createStormkiteChainQuestionPolicy());
  cancelledAtPrimary.launch({ identity, primaryTargetId: 44, sourceSide: "south", tick: 8 });
  const launchWitness = JSON.parse(cancelledAtPrimary.serialize());
  assert.equal(launchWitness.pending[0].sourceSide, "south");
  const cancelled = cancelledAtPrimary.settlePrimary(identity, {
    ownerConfirmed: true,
    sourceAlive: false,
    target: { owner: { id: 44, kind: "unit" }, position: { x: 2_000, y: 2_000 }, radius: 500 },
    tick: 9,
  });
  assert.equal(cancelled.status, "cancelled",
    "the current QUESTION boundary cancels when the source dies through primary contact");
  assert.equal(cancelledAtPrimary.pendingCount, 0);

  const afterPrimary = new LiveBattleChainContinuation(createStormkiteChainQuestionPolicy());
  afterPrimary.launch({ identity, primaryTargetId: 44, sourceSide: "south", tick: 8 });
  afterPrimary.settlePrimary(identity, {
    ownerConfirmed: true,
    sourceAlive: true,
    target: { owner: { id: 44, kind: "unit" }, position: { x: 2_000, y: 2_000 }, radius: 500 },
    tick: 9,
  });
  const snapshot = JSON.parse(afterPrimary.serialize());
  assert.equal(snapshot.pending[0].sourceSide, "south");
  const plans = afterPrimary.planDue(10, [
    { alive: true, hostId: 45, layer: "ground", owner: { id: 45, kind: "unit" },
      position: { x: 2_000, y: 2_500 }, radius: 500, side: "north", targetable: true },
  ]);
  assert.equal(plans[0].sourceSide, "south");
  assert.deepEqual(plans[0].target.owner, { id: 45, kind: "unit" },
    "the snapshotted source side routes the hop even after its source is absent/dead");
  assert.equal(afterPrimary.settleHop(plans[0], { ownerConfirmed: true, tick: 10 }), "pending");
});

test("actual LiveBattle death at the due boundary precedes and does not cancel the host hop", async (context) => {
  const battle = createChainSpellBattle();
  deployBattle(battle, { cardId: "stormkite", point: NORTH_NEAR, sequence: 0, side: "north" });
  deployBattle(battle, { cardId: "mossguard", point: SOUTH_NEAR, sequence: 1, side: "south" });
  deployBattle(battle, { cardId: "cinderlings", point: { x: 4_500, y: SOUTH_NEAR.y },
    sequence: 2, side: "south" });
  battle.step();

  const primaryEvents = stepToEvent(battle, (event) => event.type === "chain-primary-settled" &&
    event.status === "pending");
  const primary = primaryEvents.find((event) => event.type === "chain-primary-settled" &&
    event.status === "pending");
  const identity = primary.lineage.primaryProjectileIdentity;
  const source = battle.state.units.find(({ side, cardId }) =>
    side === "north" && cardId === "stormkite");
  const mossguard = battle.state.units.find(({ side, cardId }) =>
    side === "south" && cardId === "mossguard");
  const cinderling = battle.state.units.find(({ side, cardId }) =>
    side === "south" && cardId === "cinderlings");
  assert.ok(source?.alive && mossguard?.alive && cinderling?.alive,
    "the real source and both opposing unit owners survive the primary contact");
  assert.equal(primary.owner.kind, "unit",
    "the authentic Stormkite projectile owner-confirmed a real unit primary");
  assert.ok(source.hitpoints > 0 && source.hitpoints <= 689,
    `real prior combat leaves a live, spell-lethal source (${source.hitpoints} HP)`);

  const pendingBytes = battle.serialize();
  const pendingRoot = chainRootsFromBattleBytes(pendingBytes)[0];
  assert.equal(pendingRoot.phase, "hop-pending");
  assert.equal(pendingRoot.sourceSide, "north");
  assert.deepEqual(pendingRoot.identity, identity);
  assert.deepEqual(pendingRoot.visited, [primary.owner]);
  assert.equal(pendingRoot.dueTick, battle.state.tick,
    "the next host boundary is exactly the one-tick due boundary");
  const pendingHitpoints = new Map(battle.state.units.map(({ hitpoints, id }) => [id, hitpoints]));

  const restored = LiveBattle.restore(pendingBytes);
  for (const host of [battle, restored]) {
    host.scheduleSpell({ cardId: "squall-orb", point: SOUTH, sequence: 17,
      side: "south", target: { id: source.id, kind: "unit" }, tick: host.state.tick });
  }
  const copiedHosts = await capturedChainHost(context);
  const beforeFirstState = battle.state;
  const copiedFirst = advanceCapturedChainHost(copiedHosts, "LiveBattle", battle.serialize());
  const boundary = battle.step();
  const restoredBoundary = restored.step();
  assert.deepEqual(copiedFirst.events, boundary,
    "the candidate-capture copy reaches the same authentic primary-death/first-hop boundary");
  assert.equal(copiedFirst.host.serialize(), battle.serialize());
  assertCapturedCandidateFrameMatchesStates(copiedFirst.candidateFrame, beforeFirstState,
    battle.state, "first-hop LiveBattle");
  assert.deepEqual(restoredBoundary, boundary,
    "the serialized primary state replays the same authentic spell death and delayed hop");
  assert.equal(restored.serialize(), battle.serialize());

  const afterSource = battle.state.units.find(({ id }) => id === source.id);
  const hop = boundary.find((event) => event.type === "chain-hop-settled" &&
    canonical(event.lineage?.primaryProjectileIdentity) === canonical(identity));
  const afterHopOwner = battle.state.units.find(({ id }) => id === hop?.owner?.id);
  assert.equal(afterSource.alive, false,
    "the admitted 689-damage Squall Orb kills the already-damaged source on the due boundary");
  assert.equal(afterSource.hitpoints, 0);
  const deathIndex = boundary.findIndex((event) => event.type === "damage" &&
    event.targetId === source.id && event.currentHealthAfter === 0);
  const hopDamageIndex = boundary.findIndex((event) => event.type === "damage" &&
    event.targetId === hop?.owner?.id && event.externalSourceId?.startsWith("chain:"));
  const settledIndex = boundary.findIndex((event) => event.type === "chain-hop-settled" &&
    canonical(event.lineage?.primaryProjectileIdentity) === canonical(identity));
  assert.ok(deathIndex >= 0 && hopDamageIndex > deathIndex && settledIndex > hopDamageIndex,
    "canonical source death occurs before the hop owner decrease and its settlement receipt");
  const spellResolution = boundary.find((event) => event.type === "spell-intent-resolved" &&
    event.cardId === "squall-orb");
  assert.equal(spellResolution?.damage, 689,
    "the exact admitted spell intent requests its receipt-bound 689 damage");
  assert.equal(boundary[deathIndex].amount, 689,
    "the canonical owner receives the spell's full requested amount before health clamping");
  assert.equal(boundary[deathIndex].currentHealthBefore - boundary[deathIndex].currentHealthAfter,
    boundary[deathIndex].currentHealthBefore,
    "the owner applies only the remaining health while setting the source to zero");
  assert.equal(boundary[hopDamageIndex].amount, 192,
    "the hop still applies the model's exact contact damage through the owner");
  const hopBefore = pendingHitpoints.get(hop?.owner?.id);
  assert.equal(hopBefore - afterHopOwner?.hitpoints, Math.min(192, hopBefore),
    "the selected unvisited owner applies one canonical hop, clamped by its remaining health");
  assert.ok(boundary.some((event) => event.type === "chain-hop-settled" &&
    canonical(event.lineage?.primaryProjectileIdentity) === canonical(identity) &&
    event.owner?.kind === "unit" && event.owner.id !== primary.owner.id),
  "the dead source's cached side, anchor, visited owner, and lineage select another real unit");
  const rootBeforeSecond = chainRootsFromBattleBytes(battle.serialize()).find((root) =>
    canonical(root.identity) === canonical(identity));
  assert.ok(rootBeforeSecond, "the first hop leaves the second ordinal pending");
  assert.equal(rootBeforeSecond.phase, "hop-pending");
  assert.equal(rootBeforeSecond.ordinal, 2);
  assert.equal(rootBeforeSecond.dueTick, battle.state.tick);
  assert.equal(rootBeforeSecond.sourceSide, "north");
  assert.deepEqual(rootBeforeSecond.identity, identity);
  assert.equal(rootBeforeSecond.launchTick, pendingRoot.launchTick);
  assert.equal(rootBeforeSecond.launchTargetId, null);
  assert.deepEqual(rootBeforeSecond.visited, [primary.owner, hop.owner]);
  assert.equal(rootBeforeSecond.visited.length,
    createChainQuestionFixture().targetCap.value - 1);
  const firstHopOwner = battleOwnerFromState(battle.state, hop.owner);
  assert.ok(firstHopOwner, "the first hop anchor remains a canonical host owner");
  const firstHopCandidate = copiedFirst.candidateFrame.find((candidate) =>
    canonical(candidate.owner) === canonical(hop.owner));
  assert.ok(firstHopCandidate?.alive && firstHopCandidate.targetable,
    "the captured pre-combat frame contains the first hop's actual eligible owner");
  assert.deepEqual(rootBeforeSecond.anchor, {
    owner: firstHopCandidate.owner,
    position: firstHopCandidate.position,
    radius: firstHopCandidate.radius,
  }, "the second ordinal anchor matches the captured post-movement/pre-combat candidate frame");
  const sourceBeforeSecond = battle.state.units.find(({ id }) => id === source.id);
  assert.equal(sourceBeforeSecond?.alive, false,
    "the Stormkite source is already dead before ordinal-2 target selection");
  assert.equal(sourceBeforeSecond?.hitpoints, 0);
  const beforeSecondBytes = battle.serialize();
  const beforeSecondState = battle.state;
  const copiedSecond = advanceCapturedChainHost(copiedHosts, "LiveBattle", beforeSecondBytes);
  const expectedSecondOwner = independentNearestChainTarget(copiedSecond.candidateFrame,
    rootBeforeSecond);
  const expectedSecondOwnerBefore = battleOwnerFromState(battle.state, expectedSecondOwner);
  assert.ok(expectedSecondOwnerBefore?.hitpoints > 0,
    "the independent frame oracle finds a living unvisited hostile before contact");
  const secondBoundary = battle.step();
  const restoredSecondBoundary = restored.step();
  assert.deepEqual(copiedSecond.events, secondBoundary,
    "the captured candidate frame copy produces the same ordinal-2 boundary events");
  assert.equal(copiedSecond.host.serialize(), battle.serialize());
  assertCapturedCandidateFrameMatchesStates(copiedSecond.candidateFrame, beforeSecondState,
    battle.state, "ordinal-2 LiveBattle");
  assert.deepEqual(restoredSecondBoundary, secondBoundary,
    "a restored source-dead ordinal-2 host boundary repeats the same owner events");
  assert.equal(restored.serialize(), battle.serialize());
  const secondHop = secondBoundary.find((event) => event.type === "chain-hop-settled" &&
    canonical(event.lineage?.primaryProjectileIdentity) === canonical(identity));
  assert.deepEqual(secondHop?.owner, expectedSecondOwner,
    "the host selects the independently computed nearest eligible hostile from the cached anchor");
  assert.equal(secondHop?.lineage?.hopOrdinal, 2);
  assert.equal(secondHop?.status, "complete",
    "the third distinct contact reaches the model's target cap");
  assert.ok(!rootBeforeSecond.visited.some((owner) =>
    canonical(owner) === canonical(secondHop?.owner)),
  "ordinal 2 selects an owner not already contacted by the primary or ordinal 1");
  const secondDamage = secondBoundary.find((event) => event.type === "damage" &&
    event.targetId === expectedSecondOwner.id && event.externalSourceId?.startsWith("chain:"));
  const expectedSecondOwnerAfter = battleOwnerFromState(battle.state, expectedSecondOwner);
  assert.ok(secondDamage, "ordinal 2 applies damage through the canonical owner path");
  assert.equal(secondDamage.amount, 192);
  assert.equal(secondDamage.currentHealthBefore, expectedSecondOwnerBefore.hitpoints);
  assert.equal(secondDamage.currentHealthAfter, expectedSecondOwnerAfter.hitpoints);
  assert.equal(expectedSecondOwnerBefore.hitpoints - expectedSecondOwnerAfter.hitpoints,
    Math.min(192, expectedSecondOwnerBefore.hitpoints));
  assert.equal(chainRootsFromBattleBytes(battle.serialize()).some((root) =>
    canonical(root.identity) === canonical(identity)), false,
  "the root is removed after its third distinct owner contact");
  assert.equal(LiveBattle.restore(beforeSecondBytes).serialize(), beforeSecondBytes,
    "the pending source-dead ordinal-2 checkpoint restores without changing its anchor or identity");
  assert.equal(LiveBattle.restore(battle.serialize()).serialize(), battle.serialize(),
    "the resulting dead-source continuation round-trips canonically");
});

test("actual source death during primary flight cancels its root and preserves contact", () => {
  const battle = createChainSpellBattle();
  deployBattle(battle, { cardId: "stormkite", point: NORTH_NEAR, sequence: 0, side: "north" });
  deployBattle(battle, { cardId: "mossguard", point: SOUTH_NEAR, sequence: 1, side: "south" });
  battle.step();
  const source = battle.state.units.find(({ cardId, side }) =>
    cardId === "stormkite" && side === "north");
  assert.ok(source, "the authentic north Stormkite is admitted before the cancellation flight");
  const flight = capturePrimaryLaunchCheckpoint(battle, { sourceId: source.id,
    minimumAttackSequence: 2 });
  assert.ok(flight.source.hitpoints > 0 && flight.source.hitpoints <= 689,
    `real prior Mossguard hits leave the source spell-lethal while the primary is in flight (${flight.source.hitpoints} HP)`);
  const flightRoot = chainRootsFromBattleBytes(flight.beforeBytes).find((root) =>
    canonical(root.identity) === canonical(flight.identity));
  assert.equal(flightRoot?.phase, "primary-flight",
    "the exact host-minted second primary is in flight at the captured boundary");
  assert.equal(flightRoot.sourceSide, "north");

  const normal = LiveBattle.restore(flight.beforeBytes);
  const normalContact = advanceToPrimaryImpact(normal, flight.identity);
  const normalSource = normal.state.units.find(({ id }) => id === source.id);
  assert.ok(normalSource?.alive,
    "without the spell, ordinary combat leaves the source alive through its in-flight primary impact");
  assert.equal(normalContact.primary.status, "pending");

  const cancelled = LiveBattle.restore(flight.beforeBytes);
  cancelled.scheduleSpell({ cardId: "squall-orb", point: SOUTH,
    sequence: 17, side: "south", target: { id: source.id, kind: "unit" },
    tick: cancelled.state.tick });
  const liveDeathBoundary = cancelled.step();
  const afterSource = cancelled.state.units.find(({ id }) => id === source.id);
  assert.equal(afterSource?.alive, false,
    "the admitted spell kills the already-damaged source while its primary remains in flight");
  assert.equal(afterSource?.hitpoints, 0);
  const death = liveDeathBoundary.find((event) => event.type === "damage" &&
    event.targetId === source.id && event.currentHealthAfter === 0);
  assert.equal(death?.amount, 689,
    "the exact authenticated spell request is preserved before canonical HP clamping");
  assert.equal(death.currentHealthBefore, flight.source.hitpoints);
  assert.equal(liveDeathBoundary.some((event) => event.type === "projectile-impact" &&
    canonical(eventProjectileIdentity(event)) === canonical(flight.identity)), false,
  "the exact primary is still in flight after the source's canonical HP reaches zero");
  assert.equal(liveDeathBoundary.some((event) => event.type === "chain-primary-settled" &&
    canonical(event.lineage?.primaryProjectileIdentity) === canonical(flight.identity)), false,
  "no primary owner contact is fabricated at the source-death boundary");
  const deadFlightRoot = chainRootsFromBattleBytes(cancelled.serialize()).find((root) =>
    canonical(root.identity) === canonical(flight.identity));
  assert.equal(deadFlightRoot?.phase, "primary-flight",
    "the launch-side and lineage remain pending until the real projectile contact arrives");
  const cancelledContact = advanceToPrimaryImpact(cancelled, flight.identity);
  const cancelledPrimary = cancelledContact.primary;
  assert.equal(cancelledPrimary.status, "cancelled",
    "owner-confirmed primary settlement records cancellation from the dead source");
  assert.equal(cancelledContact.boundaryEvents.some((event) => event.type === "chain-hop-settled" &&
    canonical(event.lineage?.primaryProjectileIdentity) === canonical(flight.identity)), false,
  "a cancelled primary cannot emit a delayed hop");
  const ordinaryDamage = (events) => events.find((event) => event.type === "damage" &&
    canonical(eventProjectileIdentity(event)) === canonical(flight.identity));
  assert.deepEqual(ordinaryDamage(cancelledContact.boundaryEvents),
    ordinaryDamage(normalContact.boundaryEvents),
  "the dead source's already-launched primary still applies its exact ordinary canonical owner hit");
  assert.equal(chainRootsFromBattleBytes(cancelled.serialize()).some((root) =>
    canonical(root.identity) === canonical(flight.identity)), false,
  "the cancelled launch root is removed from pending continuation state");

  const setup = chainSpellSessionSetup();
  const session = new GameSession(canonical(setup));
  assert.equal(submitSessionDeploy(session, { cardId: "mossguard", commandId: 0,
    point: SOUTH_NEAR }).accepted, true);
  session.step();
  const sessionSource = session.state.battle.units.find(({ cardId, side }) =>
    cardId === "stormkite" && side === "north");
  assert.ok(sessionSource, "the authenticated session deploys its admitted north Stormkite");
  const sessionFlight = capturePrimaryLaunchCheckpoint(session, { session: true,
    sourceId: sessionSource.id, minimumAttackSequence: 2 });
  assert.ok(sessionFlight.source.hitpoints > 0 && sessionFlight.source.hitpoints <= 689,
    `real prior combat leaves the session source spell-lethal during its second primary flight (${sessionFlight.source.hitpoints} HP)`);
  const pendingReplay = session.replay;
  assert.ok(pendingReplay.some((event) => event.type === "projectile-launch" &&
    canonical(eventProjectileIdentity(event)) === canonical(sessionFlight.identity)),
  "the in-flight session transcript contains the exact authentic flight identity");
  assert.equal(pendingReplay.some((event) => event.type === "chain-primary-settled" &&
    canonical(event.lineage?.primaryProjectileIdentity) === canonical(sessionFlight.identity)), false,
  "the current flight root has not contacted an owner before the captured boundary");

  const normalSession = GameSession.restore(sessionFlight.beforeBytes);
  const normalSessionContact = advanceToPrimaryImpact(normalSession, sessionFlight.identity);
  const normalSessionSource = normalSession.state.battle.units.find(({ id }) =>
    id === sessionSource.id);
  assert.ok(normalSessionSource?.alive,
    "without the spell, session combat leaves the source alive through its primary impact");
  assert.equal(normalSessionContact.primary.status, "pending");

  const castAtFlight = (host) => {
    const slot = host.state.decks.south.hand.indexOf("squall-orb");
    assert.notEqual(slot, -1, "Squall Orb remains in the authenticated south hand");
    const admission = host.submitPlayerCommand(canonical({ cardId: "squall-orb",
      commandId: 1, point: SOUTH, side: "south", slot, tick: host.state.tick,
      target: { id: sessionSource.id, kind: "unit" }, type: "spell" }));
    assert.deepEqual(admission, { accepted: true, commandId: 1, tick: host.state.tick,
      type: "player-command-admitted" },
    "normal GameSession admission accepts the available spell without overriding elixir or receipts");
    return host.step();
  };
  const cancelledSession = GameSession.restore(sessionFlight.beforeBytes);
  const restoredCancelledSession = GameSession.restore(sessionFlight.beforeBytes);
  const sessionDeathBoundary = castAtFlight(cancelledSession);
  const restoredSessionDeathBoundary = castAtFlight(restoredCancelledSession);
  assert.deepEqual(restoredSessionDeathBoundary, sessionDeathBoundary,
    "restoring the in-flight session checkpoint reproduces the same source-death boundary");
  assert.equal(sessionDeathBoundary.some((event) => event.type === "projectile-impact" &&
    canonical(eventProjectileIdentity(event)) === canonical(sessionFlight.identity)), false,
  "the session source dies before its in-flight primary reaches the owner");
  assert.equal(sessionDeathBoundary.some((event) => event.type === "chain-primary-settled" &&
    canonical(event.lineage?.primaryProjectileIdentity) === canonical(sessionFlight.identity)), false);
  const sessionAfterDeath = cancelledSession.state.battle.units.find(({ id }) =>
    id === sessionSource.id);
  assert.equal(sessionAfterDeath?.alive, false);
  assert.equal(sessionAfterDeath?.hitpoints, 0);
  const sessionDeath = sessionDeathBoundary.find((event) => event.type === "damage" &&
    event.targetId === sessionSource.id && event.currentHealthAfter === 0);
  assert.equal(sessionDeath?.amount, 689,
    "the session source receives the exact authenticated spell amount before owner clamping");
  assert.equal(sessionDeath?.currentHealthBefore, sessionFlight.source.hitpoints);

  const sessionCancelledContact = advanceToPrimaryImpact(cancelledSession, sessionFlight.identity);
  const restoredContact = advanceToPrimaryImpact(restoredCancelledSession, sessionFlight.identity);
  assert.deepEqual(restoredContact.boundaries, sessionCancelledContact.boundaries,
    "transcript restore reproduces every post-death flight boundary through owner contact");
  assert.equal(restoredCancelledSession.serialize(), cancelledSession.serialize());
  assert.equal(restoredCancelledSession.replayBytes(), cancelledSession.replayBytes());
  assert.deepEqual(getGameSessionAudioReplay(restoredCancelledSession),
    getGameSessionAudioReplay(cancelledSession));

  const sessionAfterSource = cancelledSession.state.battle.units.find(({ id }) =>
    id === sessionSource.id);
  assert.equal(sessionAfterSource?.alive, false);
  assert.equal(sessionAfterSource?.hitpoints, 0);
  const sessionCancelledPrimary = sessionCancelledContact.primary;
  assert.equal(sessionCancelledPrimary?.status, "cancelled");
  assert.equal(sessionCancelledContact.boundaryEvents.some((event) => event.type === "chain-hop-settled" &&
    canonical(event.lineage?.primaryProjectileIdentity) === canonical(sessionFlight.identity)), false,
  "the pre-impact session death emits no delayed hop for its cancelled root");
  const sessionOrdinaryDamage = (events) => events.find((event) => event.type === "damage" &&
    canonical(eventProjectileIdentity(event)) === canonical(sessionFlight.identity));
  assert.deepEqual(sessionOrdinaryDamage(sessionCancelledContact.boundaryEvents),
    sessionOrdinaryDamage(normalSessionContact.boundaryEvents),
  "the pre-impact session cancellation preserves the exact ordinary projectile owner hit");
  const sessionAudio = getGameSessionAudioReplay(cancelledSession);
  assert.ok(sessionAudio.some((event) => event.type === "damage" &&
    canonical(eventProjectileIdentity(event)) === canonical(sessionFlight.identity)),
  "audio replay retains ordinary damage from the cancelled chain's actual primary projectile");
  assert.equal(cancelledSession.replay.some((event) => event.type === "chain-hop-settled" &&
    canonical(event.lineage?.primaryProjectileIdentity) === canonical(sessionFlight.identity)), false,
  "the session transcript has no later hop for the cancelled launch root");
});

test("GameSession restores an owner-confirmed primary, spell-kills its source, then publishes the hop", async (context) => {
  const session = new GameSession(canonical(chainSpellSessionSetup()));
  assert.equal(submitSessionDeploy(session, { cardId: "mossguard", commandId: 0,
    point: SOUTH_NEAR }).accepted, true);
  session.step();
  assert.equal(submitSessionDeploy(session, { cardId: "cinderlings", commandId: 1,
    point: { x: 4_500, y: SOUTH_NEAR.y } }).accepted, true);
  session.step();

  const primaryEvents = stepToEvent(session, (event) => event.type === "chain-primary-settled" &&
    event.status === "pending");
  const primary = primaryEvents.find((event) => event.type === "chain-primary-settled" &&
    event.status === "pending");
  const identity = primary.lineage.primaryProjectileIdentity;
  const source = session.state.battle.units.find(({ side, cardId }) =>
    side === "north" && cardId === "stormkite");
  const mossguard = session.state.battle.units.find(({ side, cardId }) =>
    side === "south" && cardId === "mossguard");
  const cinderling = session.state.battle.units.find(({ side, cardId }) =>
    side === "south" && cardId === "cinderlings");
  assert.ok(source?.alive && mossguard?.alive && cinderling?.alive,
    "both real sides and the next hostile owner remain alive after the primary");
  assert.equal(primary.owner.kind, "unit");
  assert.ok(source.hitpoints > 0 && source.hitpoints <= 689,
    `real combat leaves a live, spell-lethal source (${source.hitpoints} HP)`);
  assert.ok(primaryEvents.some((event) => event.type === "projectile-impact" &&
    canonical(eventProjectileIdentity(event)) === canonical(identity)),
  "the session transcript carries the authentic Stormkite primary impact");

  const pendingBytes = session.serialize();
  const pendingHitpoints = new Map(session.state.battle.units.map(({ hitpoints, id }) => [id, hitpoints]));
  const pendingReplay = session.replayBytes();
  const pendingAudio = getGameSessionAudioReplay(session);
  const restored = GameSession.restore(pendingBytes);
  assert.equal(restored.serialize(), pendingBytes);
  assert.deepEqual(restored.state, session.state);
  assert.equal(restored.replayBytes(), pendingReplay);
  assert.deepEqual(getGameSessionAudioReplay(restored), pendingAudio);

  const cast = (host) => {
    const slot = host.state.decks.south.hand.indexOf("squall-orb");
    assert.notEqual(slot, -1, "the authenticated direct-target spell remains in the south hand");
    assert.deepEqual(host.submitPlayerCommand(canonical({ cardId: "squall-orb", commandId: 2,
      point: SOUTH, side: "south", slot, target: { id: source.id, kind: "unit" },
      tick: host.state.tick, type: "spell" })), {
      accepted: true, commandId: 2, tick: host.state.tick, type: "player-command-admitted",
    }, "the south player can only target the opposing north Stormkite through normal admission");
  };
  cast(session);
  cast(restored);
  const copiedHosts = await capturedChainHost(context);
  const beforeFirstState = session.state.battle;
  const copiedFirst = advanceCapturedChainHost(copiedHosts, "GameSession", session.serialize());
  const boundary = session.step();
  const restoredBoundary = restored.step();
  assert.deepEqual(copiedFirst.events, boundary,
    "the candidate-capture copy reproduces the authenticated spell/first-hop boundary");
  assert.equal(copiedFirst.host.serialize(), session.serialize());
  assert.equal(copiedFirst.host.replayBytes(), session.replayBytes());
  assert.deepEqual(copiedHosts.gameSession.getGameSessionAudioReplay(copiedFirst.host),
    getGameSessionAudioReplay(session));
  assertCapturedCandidateFrameMatchesStates(copiedFirst.candidateFrame, beforeFirstState,
    session.state.battle, "first-hop GameSession");
  assert.deepEqual(restoredBoundary, boundary,
    "transcript restore replays the same real spell death and lineage-bound hop");
  assert.equal(restored.serialize(), session.serialize());
  assert.equal(restored.replayBytes(), session.replayBytes());
  assert.deepEqual(getGameSessionAudioReplay(restored), getGameSessionAudioReplay(session));

  const afterSource = session.state.battle.units.find(({ id }) => id === source.id);
  const hop = boundary.find((event) => event.type === "chain-hop-settled" &&
    canonical(event.lineage?.primaryProjectileIdentity) === canonical(identity));
  const afterHopOwner = session.state.battle.units.find(({ id }) => id === hop?.owner?.id);
  const deathIndex = boundary.findIndex((event) => event.type === "damage" &&
    event.targetId === source.id && event.currentHealthAfter === 0);
  const hopDamageIndex = boundary.findIndex((event) => event.type === "damage" &&
    event.targetId === hop?.owner?.id && event.externalSourceId?.startsWith("chain:"));
  const settledIndex = boundary.findIndex((event) => event.type === "chain-hop-settled" &&
    canonical(event.lineage?.primaryProjectileIdentity) === canonical(identity));
  assert.equal(afterSource.alive, false,
    "the authenticated opposing player spell kills Stormkite at the next host boundary");
  assert.equal(afterSource.hitpoints, 0);
  assert.ok(deathIndex >= 0 && hopDamageIndex > deathIndex && settledIndex > hopDamageIndex,
    "the source's canonical HP reaches zero before the unvisited unit takes hop damage");
  const spellPlayed = boundary.find((event) => event.type === "session-spell-played" &&
    event.side === "south" && event.intent?.cardId === "squall-orb");
  assert.equal(spellPlayed?.resolution?.damage, 689,
    "the session receipt publishes the exact 689-damage spell resolution");
  assert.equal(boundary[deathIndex].amount, 689);
  assert.equal(boundary[deathIndex].currentHealthBefore - boundary[deathIndex].currentHealthAfter,
    boundary[deathIndex].currentHealthBefore);
  assert.equal(boundary[hopDamageIndex].amount, 192);
  assert.equal(hop?.owner?.kind, "unit");
  assert.notEqual(hop?.owner?.id, primary.owner.id,
    "the saved primary anchor and visited owner select another real hostile unit");
  assert.equal(hop?.lineage.hopOrdinal, 1);
  const hopBefore = pendingHitpoints.get(hop?.owner?.id);
  assert.equal(boundary[hopDamageIndex].currentHealthBefore -
    boundary[hopDamageIndex].currentHealthAfter, Math.min(192, hopBefore));
  assert.equal(hopBefore - afterHopOwner?.hitpoints, Math.min(192, hopBefore),
    "the restored GameSession routes one canonical hop, clamped by owner health");
  const firstHopOwner = battleOwnerFromState(session.state.battle, hop.owner);
  assert.ok(firstHopOwner, "the first session hop remains a canonical host owner");
  const firstHopCandidate = copiedFirst.candidateFrame.find((candidate) =>
    canonical(candidate.owner) === canonical(hop.owner));
  assert.ok(firstHopCandidate?.alive && firstHopCandidate.targetable,
    "the captured pre-combat frame contains the first hop's actual eligible owner");
  assert.deepEqual(firstHopCandidate.position, firstHopOwner.position,
    "the stored session owner position matches the resolved candidate frame after movement");
  assert.equal(firstHopCandidate.radius, firstHopOwner.radius,
    "the session candidate frame carries the canonical owner's radius");
  const secondAnchor = {
    owner: firstHopCandidate.owner,
    position: firstHopCandidate.position,
    radius: firstHopCandidate.radius,
  };
  assert.equal(source.side, "north",
    "the authenticated primary's launch side supplies the session continuation route");
  const sourceBeforeSecond = session.state.battle.units.find(({ id }) => id === source.id);
  assert.equal(sourceBeforeSecond?.alive, false,
    "the session caster is already dead before ordinal-2 target selection");
  assert.equal(sourceBeforeSecond?.hitpoints, 0);
  const secondSelectionModel = { anchor: secondAnchor, sourceSide: source.side,
    visited: [primary.owner, hop.owner] };
  const beforeSecondBytes = session.serialize();
  const beforeSecondState = session.state.battle;
  const copiedSecond = advanceCapturedChainHost(copiedHosts, "GameSession", beforeSecondBytes);
  const expectedSecondOwner = independentNearestChainTarget(copiedSecond.candidateFrame,
    secondSelectionModel);
  const expectedSecondOwnerBefore = battleOwnerFromState(beforeSecondState, expectedSecondOwner);
  assert.ok(expectedSecondOwnerBefore?.hitpoints > 0,
    "the independent session oracle finds a living unvisited hostile owner");
  assert.equal(secondSelectionModel.visited.length,
    createChainQuestionFixture().targetCap.value - 1);
  const secondBoundary = session.step();
  const restoredSecondBoundary = restored.step();
  assert.deepEqual(copiedSecond.events, secondBoundary,
    "captured pre-combat candidates reproduce the actual ordinal-2 session boundary");
  assert.equal(copiedSecond.host.serialize(), session.serialize());
  assert.equal(copiedSecond.host.replayBytes(), session.replayBytes());
  assert.deepEqual(copiedHosts.gameSession.getGameSessionAudioReplay(copiedSecond.host),
    getGameSessionAudioReplay(session));
  assertCapturedCandidateFrameMatchesStates(copiedSecond.candidateFrame, beforeSecondState,
    session.state.battle, "ordinal-2 GameSession");
  assert.deepEqual(restoredSecondBoundary, secondBoundary,
    "restored GameSession repeats the source-dead ordinal-2 owner events");
  assert.equal(restored.serialize(), session.serialize());
  assert.equal(restored.replayBytes(), session.replayBytes());
  assert.deepEqual(getGameSessionAudioReplay(restored), getGameSessionAudioReplay(session));
  const secondHop = secondBoundary.find((event) => event.type === "chain-hop-settled" &&
    canonical(event.lineage?.primaryProjectileIdentity) === canonical(identity));
  assert.deepEqual(secondHop?.owner, expectedSecondOwner,
    "the session selects the independently computed nearest hostile using its cached anchor");
  assert.equal(secondHop?.lineage?.hopOrdinal, 2);
  assert.equal(secondHop?.status, "complete",
    "the third distinct session contact reaches the model's target cap");
  assert.ok(!secondSelectionModel.visited.some((owner) =>
    canonical(owner) === canonical(secondHop?.owner)),
  "session ordinal 2 avoids both previously contacted owners");
  const secondDamage = secondBoundary.find((event) => event.type === "damage" &&
    event.targetId === expectedSecondOwner.id && event.externalSourceId?.startsWith("chain:"));
  const expectedSecondOwnerAfter = battleOwnerFromState(session.state.battle, expectedSecondOwner);
  assert.ok(secondDamage, "session ordinal 2 uses the canonical owner damage path");
  assert.equal(secondDamage.amount, 192);
  assert.equal(secondDamage.currentHealthBefore, expectedSecondOwnerBefore.hitpoints);
  assert.equal(secondDamage.currentHealthAfter, expectedSecondOwnerAfter.hitpoints);
  assert.equal(expectedSecondOwnerBefore.hitpoints - expectedSecondOwnerAfter.hitpoints,
    Math.min(192, expectedSecondOwnerBefore.hitpoints));
  assert.ok(session.replay.some((event) => event.type === "chain-hop-settled" &&
    canonical(event.lineage?.primaryProjectileIdentity) === canonical(identity) &&
    event.lineage?.hopOrdinal === 2),
  "the session transcript publishes the lineage-equal ordinal-2 lifecycle boundary");
  assert.ok(getGameSessionAudioReplay(session).some((event) => event.type === "damage" &&
    event.targetId === expectedSecondOwner.id && event.externalSourceId?.startsWith("chain:")),
  "audio replay retains the canonical second-hop owner damage");
  const audio = getGameSessionAudioReplay(session);
  assert.equal(audio.some((event) => event.type === "chain-primary-settled" ||
    event.type === "chain-hop-settled"), false,
  "canonical chain lifecycle receipts remain excluded from sound cues");
  assert.ok(audio.some((event) => event.type === "damage" && event.targetId === source.id &&
    event.currentHealthAfter === 0), "audio replay keeps the canonical source death");
  assert.ok(audio.some((event) => event.type === "damage" &&
    event.targetId === hop?.owner?.id && event.externalSourceId?.startsWith("chain:")),
  "audio replay keeps the canonical owner damage from the hop");
  const afterRestore = GameSession.restore(session.serialize());
  assert.equal(afterRestore.serialize(), session.serialize());
  assert.equal(afterRestore.replayBytes(), session.replayBytes());
});

test("pending host continuation restores, forks, and advances identically across chunks", () => {
  const battle = createBattle();
  deployBattle(battle, { cardId: "stormkite", point: SOUTH, sequence: 0, side: "south" });
  deployBattle(battle, { cardId: "mossguard", point: NORTH_CROWN_APPROACH,
    sequence: 1, side: "north" });
  stepToEvent(battle, (event) => event.type === "chain-primary-settled" &&
    event.status === "pending");
  const pendingBytes = battle.serialize();
  const snapshot = JSON.parse(pendingBytes);
  assert.equal(JSON.parse(snapshot.chainContinuation).pending[0].phase, "hop-pending");
  const restored = LiveBattle.restore(pendingBytes);
  const fork = restored.fork();
  assert.equal(restored.serialize(), pendingBytes);
  assert.equal(fork.serialize(), pendingBytes);

  const directEvents = restored.stepMany(4);
  const chunkedEvents = [...fork.stepMany(1), ...fork.stepMany(3)];
  assert.deepEqual(chunkedEvents, directEvents);
  assert.equal(fork.serialize(), restored.serialize());
  const restoredAgain = LiveBattle.restore(pendingBytes);
  restoredAgain.stepMany(4);
  assert.equal(restoredAgain.serialize(), restored.serialize());
});

test("pending Stormkite chain roots remain independent across the public GameSession fork", () => {
  const setup = setupSession({ legalNorthDeployments: [
    { cardId: "coilblade", point: NORTH_SECONDARY },
    { cardId: "mossguard", point: NORTH_CROWN_APPROACH },
  ], northOpeningCards: ["mossguard", "coilblade"], thinkIntervalTicks: 1 });
  const source = new GameSession(canonical(setup));
  deployStormkite(source);
  const stormkite = () => source.state.battle.units.find(({ cardId }) => cardId === "stormkite");
  const launchEvents = stepToEvent(source, (event) => event.type === "chain-primary-settled" &&
    event.status === "pending");
  const launch = launchEvents.find((event) => event.type === "projectile-launch" &&
    eventProjectileIdentity(event)?.sourceId === stormkite()?.id);
  const primary = launchEvents.find((event) => event.type === "chain-primary-settled" &&
    event.status === "pending");
  const northDeployments = launchEvents.filter((event) => event.type === "session-deployed" &&
    event.side === "north");
  assert.equal(northDeployments.length, 2,
    "both authentic north unit deployments materialized before the primary contact");
  assert.ok(launch, "the chain-bound Stormkite registered an authentic host projectile root");
  assert.equal(eventProjectileIdentity(launch)?.direction, "unit-to-unit");
  assert.equal(primary?.owner?.kind, "unit");
  const primaryIdentity = primary.lineage.primaryProjectileIdentity;
  assert.deepEqual(primaryIdentity, eventProjectileIdentity(launch),
    "the published pending boundary preserves the actual launch identity");

  const pendingBytes = source.serialize();
  const pendingState = source.state;
  const pendingReplay = source.replayBytes();
  const pendingAudio = getGameSessionAudioReplay(source);
  const sourceProjection = source.projectionSnapshot();
  const fork = source.fork();
  assert.ok(fork instanceof GameSession);
  assert.equal(isAuthenticGameSession(fork), true);
  assert.equal(fork.serialize(), pendingBytes);
  assert.deepEqual(fork.state, pendingState);
  assert.equal(fork.replayBytes(), pendingReplay);
  assert.deepEqual(getGameSessionAudioReplay(fork), pendingAudio);

  const forkProjection = fork.projectionSnapshot();
  const sourceNextProjection = source.projectionSnapshot();
  assert.equal(forkProjection.sequence, sourceProjection.sequence + 1);
  assert.equal(sourceNextProjection.sequence, forkProjection.sequence);
  assert.notEqual(forkProjection.source, sourceProjection.source,
    "the pending-chain fork owns a fresh projection source identity");

  const isChainDamage = (event) => event.type === "damage" &&
    event.externalSourceId?.startsWith("chain:");
  const sourceProgress = stepToEvent(source, isChainDamage);
  assert.ok(sourceProgress.some(isChainDamage),
    "advancing the source confirms and routes its delayed chain contact to the next unit owner");
  const settledHop = sourceProgress.find((event) => event.type === "chain-hop-settled");
  assert.ok(settledHop, "the pending Session publishes the next owner-confirmed hop boundary");
  assert.deepEqual(settledHop.lineage.primaryProjectileIdentity, primaryIdentity,
  "the resumed hop preserves the exact primary identity captured before the fork");
  assert.equal(fork.serialize(), pendingBytes,
    "the source contact does not advance or consume the fork's pending continuation");
  const forkProgress = stepToEvent(fork, isChainDamage);
  assert.deepEqual(forkProgress, sourceProgress);
  assert.equal(fork.serialize(), source.serialize(),
    "the pending-chain fork owns an independent continuation with matching deterministic output");
});

function acceptedBaselineSource(relativePath) {
  return execFileSync("git", ["show", `${ACCEPTED_HEAD}:${relativePath}`], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function configuredHistoricalBaseline() {
  const configuredRoot = process.env[ACCEPTED_65_BASE_ROOT_ENV];
  if (typeof configuredRoot === "string" && configuredRoot.trim() !== "") {
    const baselineRoot = resolve(configuredRoot);
    assert.notEqual(baselineRoot, resolve(REPOSITORY_ROOT),
      `${ACCEPTED_65_BASE_ROOT_ENV} must identify a separate historical source tree`);
    for (const relativePath of [
      "src/sim/battle-continuation-kernel.js",
      "src/sim/live-battle.js",
      "src/sim/game-session.js",
    ]) {
      assert.ok(existsSync(join(baselineRoot, relativePath)),
        `${ACCEPTED_65_BASE_ROOT_ENV} has ${relativePath}`);
    }
    return {
      baselineRoot,
      kernelSource: readFileSync(join(baselineRoot,
        "src/sim/battle-continuation-kernel.js"), "utf8"),
    };
  }

  try {
    execFileSync("git", ["cat-file", "-e", `${ACCEPTED_HEAD}^{commit}`], {
      cwd: REPOSITORY_ROOT,
      stdio: "ignore",
    });
  } catch {
    return null;
  }
  return {
    baselineRoot: null,
    kernelSource: acceptedBaselineSource("src/sim/battle-continuation-kernel.js"),
  };
}

function stageKernel(context, kernelSource, { baseline = false, baselineRoot = null } = {}) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "live-battle-chain-host-"));
  context.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
  const stagedSource = join(temporaryRoot, "src");
  const sourceTreeRoot = baseline && baselineRoot !== null
    ? join(baselineRoot, "src") : SOURCE_ROOT;
  mkdirSync(stagedSource);
  for (const entry of readdirSync(sourceTreeRoot)) {
    const original = join(sourceTreeRoot, entry);
    const staged = join(stagedSource, entry);
    if (entry !== "sim") {
      symlinkSync(original, staged, statSync(original).isDirectory() ? "dir" : "file");
      continue;
    }
    mkdirSync(staged);
    for (const simEntry of readdirSync(original)) {
      const originalModule = join(original, simEntry);
      const stagedModule = join(staged, simEntry);
      if (simEntry === "battle-continuation-kernel.js") {
        writeFileSync(stagedModule, kernelSource);
      } else if (baseline && ["live-battle.js", "game-session.js"].includes(simEntry)) {
        const baselineSource = baselineRoot === null
          ? acceptedBaselineSource(`src/sim/${simEntry}`)
          : readFileSync(join(baselineRoot, "src/sim", simEntry), "utf8");
        writeFileSync(stagedModule, baselineSource);
      } else if (["live-battle.js", "game-session.js"].includes(simEntry)) {
        writeFileSync(stagedModule, readFileSync(originalModule, "utf8"));
      } else {
        symlinkSync(originalModule, stagedModule,
          statSync(originalModule).isDirectory() ? "dir" : "file");
      }
    }
  }
  writeFileSync(join(temporaryRoot, "package.json"), '{"type":"module"}\n');
  return temporaryRoot;
}

async function stagedHosts(context, kernelSource, options = {}) {
  const root = stageKernel(context, kernelSource, options);
  const kernel = await import(pathToFileURL(join(root,
    "src/sim/battle-continuation-kernel.js")).href);
  const liveBattle = await import(pathToFileURL(join(root, "src/sim/live-battle.js")).href);
  const gameSession = await import(pathToFileURL(join(root, "src/sim/game-session.js")).href);
  return { gameSession, kernel, liveBattle };
}

function compareNoPolicyPaths(baseline) {
  const witness = battleWitness({ chain: false });
  const battleSetup = canonical(witness);
  const deploy = canonical({ cardId: "stormkite", point: SOUTH, sequence: 0,
    side: "south", tick: 0 });

  const expectedBattle = new baseline.liveBattle.LiveBattle(battleSetup);
  const actualBattle = new LiveBattle(battleSetup);
  expectedBattle.scheduleDeploy(deploy);
  actualBattle.scheduleDeploy(deploy);
  const expectedBattleEvents = expectedBattle.stepMany(148);
  const actualBattleEvents = actualBattle.stepMany(148);
  assert.deepEqual(actualBattleEvents, expectedBattleEvents);
  assert.equal(actualBattle.serialize(), expectedBattle.serialize(),
    "absent-policy snapshots and the no-receipt primary path retain baseline bytes");

  const expectedReceiptBattle = new baseline.liveBattle.LiveBattle(
    battleSetup, undefined, undefined, PROJECTILE_RECEIPT,
  );
  const actualReceiptBattle = new LiveBattle(battleSetup, undefined, undefined, PROJECTILE_RECEIPT);
  expectedReceiptBattle.scheduleDeploy(deploy);
  actualReceiptBattle.scheduleDeploy(deploy);
  assert.deepEqual(actualReceiptBattle.stepMany(148), expectedReceiptBattle.stepMany(148));
  assert.equal(actualReceiptBattle.serialize(), expectedReceiptBattle.serialize(),
    "an authenticated projectile receipt without the separate QUESTION model retains baseline bytes");

  const sessionSetup = setupSession({ chain: false, receipt: false });
  const expectedSession = new baseline.gameSession.GameSession(canonical(sessionSetup));
  const actualSession = new GameSession(canonical(sessionSetup));
  deployStormkite(expectedSession);
  deployStormkite(actualSession);
  assert.deepEqual(actualSession.stepMany(148), expectedSession.stepMany(148));
  assert.equal(actualSession.serialize(), expectedSession.serialize(),
    "default-eight GameSession serialization remains byte-identical with chain policy absent");
  assert.equal(actualSession.replayBytes(), expectedSession.replayBytes());

  const receiptSessionSetup = canonical(setupSession({ chain: false, receipt: true }));
  const expectedReceiptSession = new baseline.gameSession.GameSession(receiptSessionSetup);
  const actualReceiptSession = new GameSession(receiptSessionSetup);
  deployStormkite(expectedReceiptSession);
  deployStormkite(actualReceiptSession);
  assert.deepEqual(actualReceiptSession.stepMany(148), expectedReceiptSession.stepMany(148));
  assert.equal(actualReceiptSession.serialize(), expectedReceiptSession.serialize(),
    "a receipt-only GameSession does not opt into a chain continuation or change bytes");
  assert.equal(actualReceiptSession.replayBytes(), expectedReceiptSession.replayBytes());
}

test("historical accepted-65 no-policy bytes remain a separate comparison", async (context) => {
  const historical = configuredHistoricalBaseline();
  if (historical === null) {
    context.skip(`historical accepted-65 source ${ACCEPTED_HEAD} is unavailable; set ` +
      `${ACCEPTED_65_BASE_ROOT_ENV} to its source tree to run this separate comparison`);
    return;
  }
  const baseline = await stagedHosts(context, historical.kernelSource, {
    baseline: true,
    baselineRoot: historical.baselineRoot,
  });
  compareNoPolicyPaths(baseline);
});

test("chain QUESTION fixture stays exact to the fork base with independent frozen copies", async (context) => {
  const configuredRoot = process.env[FORK_BASE_ROOT_ENV];
  if (typeof configuredRoot !== "string" || configuredRoot.trim() === "") {
    context.skip(`${FORK_BASE_ROOT_ENV} is unset; the original QUESTION fixture comparison needs ` +
      "its exact fork-qualified source tree");
    return;
  }
  const baselineRoot = resolve(configuredRoot);
  const original = await import(pathToFileURL(join(baselineRoot,
    "src/content/cards/special-projectiles-chain.js")).href);
  const originalFixture = original.createChainQuestionFixture();
  const currentFixture = createChainQuestionFixture();
  const secondCurrentFixture = createChainQuestionFixture();
  assert.deepEqual(currentFixture, originalFixture,
    "all eleven source QUESTION records retain their original flags, source, and value");
  assert.deepEqual(Object.keys(currentFixture).sort(), Object.keys(originalFixture).sort());
  assert.equal(Object.keys(currentFixture).length, 11);
  assert.equal(Object.isFrozen(currentFixture), Object.isFrozen(originalFixture));
  assert.equal(Object.isFrozen(currentFixture), true,
    "the public fixture remains a frozen record map");
  for (const [key, record] of Object.entries(originalFixture)) {
    const current = currentFixture[key];
    assert.deepEqual(Object.keys(current).sort(), Object.keys(record).sort(),
      `${key} keeps the same exact source-record fields`);
    assert.deepEqual(current, record,
      `${key} keeps its exact authoritative/confidence/disposition/source/value fields`);
    assert.equal(Object.isFrozen(current), Object.isFrozen(record));
    assert.equal(Object.isFrozen(current), true, `${key} remains independently frozen`);
    assert.notEqual(secondCurrentFixture[key], current,
      `${key} is a fresh record copy on each fixture call`);
  }
  assert.notEqual(secondCurrentFixture, currentFixture,
    "each factory call returns an independent frozen record map");
  assert.throws(() => createChainQuestionFixture("changed"),
    /does not accept overrides/u,
  "the shared fixture API continues to reject caller-supplied policy changes");
  assert.deepEqual(createChainSpecialFixture(), original.createChainSpecialFixture(),
    "the existing bounded chain encounter fixture still behaves byte-for-byte as before");
});

test("no-policy bytes match the exact fork-qualified base when supplied", async (context) => {
  const configuredRoot = process.env[FORK_BASE_ROOT_ENV];
  if (typeof configuredRoot !== "string" || configuredRoot.trim() === "") {
    context.skip(`${FORK_BASE_ROOT_ENV} is unset; the fork-base differential needs its qualified source tree`);
    return;
  }
  const baselineRoot = resolve(configuredRoot);
  assert.notEqual(baselineRoot, resolve(REPOSITORY_ROOT),
    `${FORK_BASE_ROOT_ENV} must identify the exact separate fork-qualified source tree`);
  const baselineKernelPath = join(baselineRoot, "src/sim/battle-continuation-kernel.js");
  assert.ok(existsSync(baselineKernelPath), `${FORK_BASE_ROOT_ENV} has the kernel source`);
  assert.ok(existsSync(join(baselineRoot, "src/sim/live-battle.js")),
    `${FORK_BASE_ROOT_ENV} has the LiveBattle facade`);
  assert.ok(existsSync(join(baselineRoot, "src/sim/game-session.js")),
    `${FORK_BASE_ROOT_ENV} has the GameSession facade`);
  const baselineKernel = readFileSync(baselineKernelPath, "utf8");
  const baseline = await stagedHosts(context, baselineKernel, { baseline: true, baselineRoot });
  compareNoPolicyPaths(baseline);
});

function injectAfterAdvance(kernelSource, owner) {
  if (owner === "LiveBattle") {
    const marker = "    const events = candidate.#advance();\n    this.#adopt(candidate);";
    assert.equal(kernelSource.split(marker).length - 1, 1,
      "the LiveBattle candidate-adopt seam is unique in the source copy");
    return kernelSource.replace(marker,
      "    const events = candidate.#advance();\n    throw new Error(\"test-only LiveBattle post-advance fault\");\n    this.#adopt(candidate);");
  }
  const marker = "    candidate.#assertSnapshotBound(); this.#adopt(candidate); return freeze(clone(events));";
  assert.equal(kernelSource.split(marker).length - 1, 1,
    "the GameSession candidate-adopt seam is unique in the source copy");
  return kernelSource.replace(marker,
    "    candidate.#assertSnapshotBound(); throw new Error(\"test-only GameSession post-advance fault\"); this.#adopt(candidate); return freeze(clone(events));");
}

test("fault-copy post-advance/pre-adopt rollback holds for LiveBattle and GameSession", async (context) => {
  const currentKernel = readFileSync(KERNEL_PATH, "utf8");
  const injected = injectAfterAdvance(currentKernel, "LiveBattle");
  const injectedForSession = injectAfterAdvance(injected, "GameSession");
  const faultHosts = await stagedHosts(context, injectedForSession);

  const battleSetup = canonical(battleWitness({ chain: false }));
  const beforeBattle = new LiveBattle(battleSetup);
  beforeBattle.scheduleDeploy(canonical({ cardId: "stormkite", point: SOUTH,
    sequence: 0, side: "south", tick: 0 }));
  const battleBytes = beforeBattle.serialize();
  const faultBattle = faultHosts.liveBattle.LiveBattle.restore(battleBytes);
  assert.throws(() => faultBattle.step(), /test-only LiveBattle post-advance fault/u);
  assert.equal(faultBattle.serialize(), battleBytes,
    "the real boundary candidate mutated, then was discarded before adoption");
  const battleControl = LiveBattle.restore(battleBytes);
  battleControl.step();
  assert.notEqual(battleControl.serialize(), battleBytes,
    "the same unmodified boundary advances as the positive mutation control");

  const sessionSetup = canonical(setupSession({ chain: false, receipt: false }));
  const beforeSession = new GameSession(sessionSetup);
  deployStormkite(beforeSession);
  const sessionBytes = beforeSession.serialize();
  const faultSession = faultHosts.gameSession.GameSession.restore(sessionBytes);
  assert.throws(() => faultSession.step(), /test-only GameSession post-advance fault/u);
  assert.equal(faultSession.serialize(), sessionBytes,
    "the enclosing session keeps setup, transcript, and owner snapshot unchanged");
  const sessionControl = GameSession.restore(sessionBytes);
  sessionControl.step();
  assert.notEqual(sessionControl.serialize(), sessionBytes,
    "the corresponding unmodified GameSession boundary advances as the control");
});

test("real shared-host hops honor stable owner ties, visited contacts, and the target cap", () => {
  const battle = createBattle({ buildingCardId: "aether-well" });
  const points = [
    { x: 2_500, y: 28_000 },
    { x: 4_500, y: 28_000 },
    { x: 3_000, y: 29_500 },
  ];
  deployBattle(battle, { cardId: "stormkite", point: SOUTH, sequence: 0, side: "south" });
  points.forEach((point, index) => deployStructure(battle, { cardId: "aether-well", point,
    sequence: index + 1, side: "north" }));
  const primaryEvents = stepToEvent(battle, (event) => event.type === "chain-primary-settled" &&
    event.status === "pending");
  const primary = primaryEvents.find((event) => event.type === "chain-primary-settled" &&
    event.status === "pending");
  assert.deepEqual(primary?.owner, { id: "north:lane:west", kind: "crown-tower" },
    "an actual Stormkite projectile first settles on the canonical lane crown");

  const anchorTower = towerById(battle, primary.owner.id);
  const anchorPosition = anchorTower.position;
  const anchorRadius = towerRadiusFromArenaGeometry(anchorTower.id);
  assert.deepEqual(anchorPosition, { x: 3_500, y: 24_500 });
  const range = createStormkiteChainQuestionPolicy().questions.hopRangeMillitiles.value;
  const buildings = points.map((point) => {
    const owner = battle.state.structures.find((entry) => entry.alive && entry.side === "north" &&
      canonical(entry.position) === canonical(point));
    assert.ok(owner, `the admitted stationary owner materialized at ${canonical(point)}`);
    return owner;
  });
  const squared = buildings.map(({ position }) => distanceSquared(anchorPosition, position));
  assert.equal(squared[0], squared[1],
    "the first two stationary owners are exactly equidistant from the real crown anchor");
  assert.ok(squared.every((value) => value <= (anchorRadius + range) ** 2),
    "the independent radius-zero building-point oracle places all three owners in model range");
  const centralCrown = towerById(battle, "north:central");
  assert.ok(distanceSquared(anchorPosition, centralCrown.position) > squared[0],
    "the tied buildings are nearer than the independently located remaining crown candidate");
  assert.ok(distanceSquared(anchorPosition, centralCrown.position) <=
    (anchorRadius + range + towerRadiusFromArenaGeometry(centralCrown.id)) ** 2,
  "the independent oracle retains the other crown as a legal candidate");

  const stableTieWinner = buildings.slice(0, 2).sort((left, right) => left.id - right.id)[0];
  const firstBoundary = battle.step();
  const firstHop = firstBoundary.find((event) => event.type === "chain-hop-settled" &&
    canonical(event.lineage?.primaryProjectileIdentity) ===
      canonical(primary.lineage.primaryProjectileIdentity));
  assert.equal(firstHop?.owner?.kind, "building");
  assert.equal(firstHop?.owner?.id, stableTieWinner.id,
    "equal-distance real owners use ascending canonical host ID");
  assert.equal(firstHop?.lineage.hopOrdinal, 1);
  assert.equal(firstHop?.status, "pending");

  const firstAnchor = stableTieWinner.position;
  const remainingBuildings = buildings.filter(({ id }) => id !== stableTieWinner.id);
  const nextWinner = remainingBuildings.slice().sort((left, right) =>
    distanceSquared(firstAnchor, left.position) - distanceSquared(firstAnchor, right.position) ||
      left.id - right.id)[0];
  assert.equal(nextWinner.position.x, 3_000);
  assert.equal(distanceSquared(firstAnchor, nextWinner.position), 2_500_000,
    "the next canonical owner is closer than the prior visited owner at distance zero");
  assert.ok(remainingBuildings.every(({ position }) =>
    distanceSquared(firstAnchor, position) <= range ** 2),
  "another remaining stationary owner is still in range after the first hop");

  const secondBoundary = battle.step();
  const secondHop = secondBoundary.find((event) => event.type === "chain-hop-settled" &&
    canonical(event.lineage?.primaryProjectileIdentity) ===
      canonical(primary.lineage.primaryProjectileIdentity));
  assert.equal(secondHop?.owner?.kind, "building");
  assert.equal(secondHop?.owner?.id, nextWinner.id,
    "the visited owner is not contacted again even though it is now the nearest point");
  assert.equal(secondHop?.lineage.hopOrdinal, 2);
  assert.equal(secondHop?.status, "complete",
    "the actual root completes at the explicit three-owner target cap");
  const afterTwoHops = battle.state.structures;
  assert.equal(afterTwoHops.find(({ id }) => id === stableTieWinner.id).hitpoints,
    buildings.find(({ id }) => id === stableTieWinner.id).hitpoints - 192);
  assert.equal(afterTwoHops.find(({ id }) => id === nextWinner.id).hitpoints,
    buildings.find(({ id }) => id === nextWinner.id).hitpoints - 192);
  const uncontacted = buildings.find(({ id }) => id !== stableTieWinner.id &&
    id !== nextWinner.id);
  assert.ok(uncontacted, "a third canonical hostile owner remains available after the cap");
  assert.equal(afterTwoHops.find(({ id }) => id === uncontacted.id).hitpoints,
    uncontacted.hitpoints,
    "the still-eligible owner is not damaged after primary plus two hops exhaust the cap");
  const laterEvents = battle.stepMany(2);
  assert.equal(laterEvents.some((event) => event.type === "chain-hop-settled" &&
    canonical(event.lineage?.primaryProjectileIdentity) ===
      canonical(primary.lineage.primaryProjectileIdentity)), false,
  "a completed root cannot replay a duplicate owner contact on later host boundaries");
});

test("real shared-host cross-kind ties use canonical numeric IDs independent of candidate order", async (context) => {
  const battle = createCrossKindTieBattle();
  deployBattle(battle, { cardId: "stormkite", point: SOUTH, sequence: 0, side: "south" });
  deployBattle(battle, { cardId: "prism-warden", point: { x: 2_500, y: 27_500 },
    sequence: 1, side: "north" });
  const primaryEvents = stepToEvent(battle, (event) => event.type === "chain-primary-settled" &&
    event.status === "pending" && event.lineage?.primaryProjectileIdentity?.sourceId === 1);
  const primary = primaryEvents.find((event) => event.type === "chain-primary-settled" &&
    event.status === "pending" && event.lineage?.primaryProjectileIdentity?.sourceId === 1);
  assert.deepEqual(primary?.owner, { id: "north:lane:west", kind: "crown-tower" },
    "the actual source-profile-authenticated primary first settles on the north lane crown");
  const identity = primary.lineage.primaryProjectileIdentity;
  const anchor = towerById(battle, primary.owner.id);
  const prism = battle.state.units.find(({ cardId, side }) =>
    cardId === "prism-warden" && side === "north");
  assert.ok(prism?.alive, "the separately admitted, profile-bound north ranged unit is a live candidate");
  assert.equal(prism.side, "north");
  assert.equal(prism.layer, "ground");

  const beforeBytes = battle.serialize();
  const beforeRoot = JSON.parse(beforeBytes);
  const pendingChainBytes = beforeRoot.chainContinuation;
  const pending = JSON.parse(pendingChainBytes).pending.find((root) =>
    canonical(root.identity) === canonical(identity));
  assert.ok(pending, "the real owner-confirmed primary retains its chain root");
  assert.equal(pending.sourceSide, "south");
  assert.equal(pending.dueTick, battle.state.tick,
    "the host's next canonical tick is the primary root's due boundary");

  // The chain planner evaluates shared-host entities before combat/movement at
  // this due boundary. Mirror the stationary building across that captured
  // pre-combat unit position, without consulting the chain chooser.
  const structurePoint = {
    x: 2 * anchor.position.x - prism.position.x,
    y: prism.position.y,
  };
  const scheduled = battle.scheduleStructure(canonical({ cardId: "aether-well",
    destination: null, point: structurePoint, sequence: 0, side: "north", tick: pending.dueTick }));
  assert.equal(scheduled.type, "structure-deploy-scheduled",
    "the mirrored structure enters through the public authenticated host deployment path");

  const sourceSide = pending.sourceSide;
  const range = createStormkiteChainQuestionPolicy().questions.hopRangeMillitiles.value;
  const anchorRadius = towerRadiusFromArenaGeometry(anchor.id);
  const beforePrismHitpoints = prism.hitpoints;
  const beforePrismPosition = prism.position;
  const beforeBytesWithStructure = battle.serialize();
  const reversedKernel = reverseChainCandidateEnumeration(readFileSync(KERNEL_PATH, "utf8"));
  const reversedHosts = await stagedHosts(context, reversedKernel);
  const reversedBattle = reversedHosts.liveBattle.LiveBattle.restore(beforeBytesWithStructure);
  const dueEvents = battle.step();
  const reversedEvents = reversedBattle.step();
  const candidateFrame = reversedHosts.kernel.takeTestChainCandidateFrame();
  const actualPrism = battle.state.units.find(({ id }) => id === prism.id);
  const structure = battle.state.structures.find(({ position }) =>
    canonical(position) === canonical(structurePoint));
  assert.ok(structure?.alive, "the authentic structure owner materialized at the scheduled point");
  assert.deepEqual(reversedEvents, dueEvents,
    "the same authenticated pending snapshot has identical events with reversed host candidate enumeration");
  assert.equal(reversedBattle.serialize(), battle.serialize(),
    "candidate enumeration reversal preserves the exact canonical post-boundary snapshot");
  assert.equal(battleOwnerHealth(reversedBattle.state), battleOwnerHealth(battle.state),
    "candidate enumeration reversal preserves every canonical unit/building/crown HP value");
  const framePrism = candidateFrame.find((candidate) => candidate.owner.kind === "unit" &&
    candidate.owner.id === prism.id);
  const frameStructure = candidateFrame.find((candidate) => candidate.owner.kind === "building" &&
    candidate.owner.id === structure.id);
  assert.ok(framePrism?.alive && framePrism.targetable,
    "the reversed-kernel capture contains the actual eligible pre-combat unit candidate");
  assert.ok(frameStructure?.alive && frameStructure.targetable,
    "the reversed-kernel capture contains the actual materialized building candidate");
  assert.deepEqual(framePrism.position, beforePrismPosition,
    "the candidate frame uses the real host position before this boundary's combat/movement");
  assert.deepEqual(frameStructure.position, structurePoint);
  assert.deepEqual(framePrism.owner, { id: prism.id, kind: "unit" });
  assert.deepEqual(frameStructure.owner, { id: structure.id, kind: "building" });
  const unitDistance = distanceSquared(anchor.position, framePrism.position);
  const buildingDistance = distanceSquared(anchor.position, frameStructure.position);
  assert.equal(unitDistance, buildingDistance,
    "the two actual pre-combat host candidates are exactly equidistant from the primary anchor");
  assert.ok(unitDistance <= (anchorRadius + range + framePrism.radius) ** 2,
    "the independent pre-combat unit center is inside its admitted QUESTION reach");
  assert.ok(buildingDistance <= (anchorRadius + range) ** 2,
    "the independent pre-combat radius-zero building point is inside QUESTION reach");
  assert.ok(framePrism.hostId < frameStructure.hostId,
    "the authentic unit host ID is lower than the later-materialized building ID");

  const hop = dueEvents.find((event) => event.type === "chain-hop-settled" &&
    canonical(event.lineage?.primaryProjectileIdentity) === canonical(identity));
  assert.deepEqual(hop?.owner, { id: framePrism.owner.id, kind: "unit" },
    "the actual host chooses lower numeric hostId even though ownerKey orders building first");
  assert.deepEqual(hop?.lineage, { primaryProjectileIdentity: identity, hopOrdinal: 1 });
  const unitDamage = dueEvents.find((event) => event.type === "damage" &&
    event.targetId === actualPrism.id && event.externalSourceId?.startsWith("chain:"));
  assert.equal(unitDamage?.amount, 192,
    "the selected unit receives the exact QUESTION-model hop through the canonical owner");
  assert.equal(beforePrismHitpoints - actualPrism.hitpoints,
    Math.min(192, beforePrismHitpoints), "canonical unit HP decreases once, with owner clamping");
  assert.equal(structure.hitpoints,
    projectSessionNonUnitBattleCard("aether-well").buildingRuntime.hitpoints,
    "the tied but nonselected building keeps its full canonical owner health");

  const candidates = [framePrism, frameStructure];
  const forward = LiveBattleChainContinuation.restore(pendingChainBytes,
    createStormkiteChainQuestionPolicy()).planDue(pending.dueTick, candidates)
    .find((plan) => canonical(plan.identity) === canonical(identity));
  const reversed = LiveBattleChainContinuation.restore(pendingChainBytes,
    createStormkiteChainQuestionPolicy()).planDue(pending.dueTick, [...candidates].reverse())
    .find((plan) => canonical(plan.identity) === canonical(identity));
  assert.deepEqual(forward?.target?.owner, { id: actualPrism.id, kind: "unit" });
  assert.deepEqual(reversed?.target?.owner, forward?.target?.owner,
    "reversing equal-distance candidate enumeration preserves the canonical numeric-ID winner");
  assert.equal(sourceSide, "south", "the primary launch side remains the saved hostile-selection policy");
});

test("real host range uses the inclusive QUESTION edge and excludes a building one millitile outside", () => {
  const policyRange = createStormkiteChainQuestionPolicy().questions.hopRangeMillitiles.value;
  const towerPosition = { x: 3_500, y: 24_500 };
  const towerRadius = towerRadiusFromArenaGeometry("north:lane:west");
  const edge = towerRadius + policyRange;
  const cases = [
    { name: "inclusive edge", y: towerPosition.y + edge, distance: edge,
      expectedOwner: { id: null, kind: "building" } },
    { name: "one millitile outside", y: towerPosition.y + edge + 1, distance: edge + 1,
      expectedOwner: { id: "north:central", kind: "crown-tower" } },
  ];
  for (const fixture of cases) {
    const battle = createBattle({ buildingCardId: "aether-well" });
    deployBattle(battle, { cardId: "stormkite", point: SOUTH, sequence: 0, side: "south" });
    deployStructure(battle, { cardId: "aether-well",
      point: { x: towerPosition.x, y: fixture.y }, sequence: 1, side: "north" });
    const primaryEvents = stepToEvent(battle, (event) => event.type === "chain-primary-settled" &&
      event.status === "pending");
    const primary = primaryEvents.find((event) => event.type === "chain-primary-settled" &&
      event.status === "pending");
    assert.deepEqual(primary?.owner, { id: "north:lane:west", kind: "crown-tower" },
      `${fixture.name} fixture retains the actual crown primary contact`);
    const primaryTower = towerById(battle, "north:lane:west");
    assert.deepEqual(primaryTower.position, towerPosition);
    const building = battle.state.structures.find(({ cardId }) => cardId === "aether-well");
    assert.ok(building, "the real admitted building owner is present at the planned point");
    const actualDistanceSquared = distanceSquared(primaryTower.position, building.position);
    const inclusiveReach = towerRadius + policyRange;
    assert.equal(building.position.y - primaryTower.position.y, fixture.distance);
    assert.equal(actualDistanceSquared, fixture.distance ** 2,
      "the expected distance comes from the canonical crown and building points");
    assert.equal(actualDistanceSquared <= inclusiveReach ** 2, fixture.name === "inclusive edge",
      "the independent QUESTION oracle distinguishes equality from one millitile outside");

    const central = towerById(battle, "north:central");
    const centralDistanceSquared = distanceSquared(primaryTower.position, central.position);
    const centralReach = towerRadius + policyRange + towerRadiusFromArenaGeometry(central.id);
    assert.ok(centralDistanceSquared <= centralReach ** 2,
      "the independent oracle confirms the other north crown remains in range");
    if (fixture.name === "one millitile outside") {
      assert.ok(actualDistanceSquared > inclusiveReach ** 2,
        "the just-outside structure is excluded at this due boundary");
      assert.ok(centralDistanceSquared > actualDistanceSquared,
        "the other in-range crown is farther than the excluded structure point");
    } else {
      assert.ok(actualDistanceSquared < centralDistanceSquared,
        "the inclusive-edge building is the nearest independently measured hostile owner");
    }

    const beforeBuilding = building.hitpoints;
    const beforeCentral = central.hitpoints;
    const dueBoundary = battle.step();
    const hop = dueBoundary.find((event) => event.type === "chain-hop-settled" &&
      canonical(event.lineage?.primaryProjectileIdentity) ===
        canonical(primary.lineage.primaryProjectileIdentity));
    const expectedOwner = fixture.expectedOwner.kind === "building"
      ? { id: building.id, kind: "building" }
      : fixture.expectedOwner;
    assert.deepEqual(hop?.owner, expectedOwner, `${fixture.name} selects the oracle's nearest eligible owner`);
    if (fixture.name === "inclusive edge") {
      assert.equal(beforeBuilding - battle.state.structures.find(({ id }) => id === building.id).hitpoints,
        192, "the exact inclusive edge receives one canonical owner damage application");
      assert.equal(beforeCentral, towerById(battle, central.id).hitpoints,
        "the farther crown does not replace the inclusive-edge owner");
    } else {
      assert.equal(beforeBuilding, battle.state.structures.find(({ id }) => id === building.id).hitpoints,
        "the one-millitile-outside building receives no contact on this due hop");
      assert.equal(beforeCentral - towerById(battle, central.id).hitpoints, 192,
        "the independently eligible north central crown receives the next real hop");
    }
  }
});

function injectAfterAdvanceAtTick(kernelSource, owner, targetTick) {
  assert.ok(Number.isSafeInteger(targetTick) && targetTick > 0);
  if (owner === "LiveBattle") {
    const marker = "    const events = candidate.#advance();\n    this.#adopt(candidate);";
    assert.equal(kernelSource.split(marker).length - 1, 1,
      "the targeted LiveBattle post-advance seam is unique in the source copy");
    const injected = kernelSource.replace(marker,
      "    const events = candidate.#advance();\n    const fault = chainHostTestFaults.get(this);\n    if (fault?.owner === \"LiveBattle\" && candidate.#battleRuntime().state.tick === fault.tick) { chainHostTestFaults.delete(this); throw new Error(\"test-only LiveBattle chain post-advance fault\"); }\n    this.#adopt(candidate);");
    return `${injected}\nconst chainHostTestFaults = new WeakMap();\nexport function armChainHostTestFault(instance, faultOwner, faultTick) {\n  if ((faultOwner !== \"LiveBattle\" && faultOwner !== \"GameSession\") ||\n      !Number.isSafeInteger(faultTick) || faultTick < 1) throw new TypeError(\"invalid copied-module fault instruction\");\n  chainHostTestFaults.set(instance, { owner: faultOwner, tick: faultTick });\n}\n`;
  }
  const marker = "    candidate.#assertSnapshotBound(); this.#adopt(candidate); return freeze(clone(events));";
  assert.equal(kernelSource.split(marker).length - 1, 1,
    "the targeted GameSession post-advance seam is unique in the source copy");
  const injected = kernelSource.replace(marker,
    "    candidate.#assertSnapshotBound(); const fault = chainHostTestFaults.get(this); if (fault?.owner === \"GameSession\" && candidate.#clockRuntime().tick === fault.tick) { chainHostTestFaults.delete(this); throw new Error(\"test-only GameSession chain post-advance fault\"); } this.#adopt(candidate); return freeze(clone(events));");
  return `${injected}\nconst chainHostTestFaults = new WeakMap();\nexport function armChainHostTestFault(instance, faultOwner, faultTick) {\n  if ((faultOwner !== \"LiveBattle\" && faultOwner !== \"GameSession\") ||\n      !Number.isSafeInteger(faultTick) || faultTick < 1) throw new TypeError(\"invalid copied-module fault instruction\");\n  chainHostTestFaults.set(instance, { owner: faultOwner, tick: faultTick });\n}\n`;
}

function reverseChainCandidateEnumeration(kernelSource) {
  const marker = "    const chainCandidates = this.#chainContinuation === null ? null :\n" +
    "      this.#chainCandidatesFromState(battle.state, statusControls);\n" +
    "    const chainHopPlans = this.#chainContinuation === null ? [] :\n" +
    "      this.#chainContinuation.planDue(tick, chainCandidates);";
  assert.equal(kernelSource.split(marker).length - 1, 1,
    "the host chain candidate frame has one exact test-copy seam");
  // The test copy captures the real post-movement/pre-combat candidate array before reversing it.
  const reversed = kernelSource.replace(marker,
    "    const chainCandidates = this.#chainContinuation === null ? null :\n" +
    "      this.#chainCandidatesFromState(battle.state, statusControls);\n" +
    "    if (chainCandidates !== null) {\n" +
    "      chainTestCandidateFrame = structuredClone(chainCandidates);\n" +
    "      chainCandidates.reverse();\n" +
    "    }\n" +
    "    const chainHopPlans = this.#chainContinuation === null ? [] :\n" +
    "      this.#chainContinuation.planDue(tick, chainCandidates);");
  return `${reversed}\nlet chainTestCandidateFrame = null;\n` +
    `export function takeTestChainCandidateFrame() {\n` +
    `  if (chainTestCandidateFrame === null) throw new Error("test-only chain candidate frame is unavailable");\n` +
    `  const frame = structuredClone(chainTestCandidateFrame);\n` +
    `  chainTestCandidateFrame = null;\n` +
    `  return frame;\n}\n`;
}

async function capturedChainHost(context) {
  const kernelSource = reverseChainCandidateEnumeration(readFileSync(KERNEL_PATH, "utf8"));
  return stagedHosts(context, kernelSource);
}

function advanceCapturedChainHost(hosts, hostKind, serialized) {
  const Host = hostKind === "LiveBattle"
    ? hosts.liveBattle.LiveBattle : hosts.gameSession.GameSession;
  const host = Host.restore(serialized);
  const events = host.step();
  const candidateFrame = hosts.kernel.takeTestChainCandidateFrame();
  return { candidateFrame, events, host };
}

function captureBattleOwnerHealth(battleState) {
  return battleOwnerHealth(battleState);
}

async function assertLiveBattleChainRollback(context, boundary, expectedFault) {
  const beforeTick = boundary.stateBefore.tick;
  const injectedKernel = injectAfterAdvanceAtTick(readFileSync(KERNEL_PATH, "utf8"),
    "LiveBattle", beforeTick + 1);
  const faultHosts = await stagedHosts(context, injectedKernel);
  const faultBattle = faultHosts.liveBattle.LiveBattle.restore(boundary.beforeBytes);
  faultHosts.kernel.armChainHostTestFault(faultBattle, "LiveBattle", beforeTick + 1);
  assert.equal(faultBattle.state.tick, beforeTick);
  assert.deepEqual(chainRootsFromBattleBytes(faultBattle.serialize()), boundary.roots,
    `${boundary.phase} identity and pending phase are present before the injected boundary`);
  const beforeEvents = faultBattle.events;
  const beforeState = faultBattle.state;
  const beforeHealth = captureBattleOwnerHealth(beforeState);
  assert.throws(() => faultBattle.step(), new RegExp(expectedFault, "u"));
  assert.equal(faultBattle.serialize(), boundary.beforeBytes,
    `${boundary.phase} rollback leaves every snapshot byte unchanged before adoption`);
  assert.equal(faultBattle.state.tick, beforeTick,
    `${boundary.phase} rollback leaves the canonical host tick unchanged`);
  assert.equal(captureBattleOwnerHealth(faultBattle.state), beforeHealth,
    `${boundary.phase} rollback leaves all unit, structure, and crown HP unchanged`);
  assert.deepEqual(faultBattle.events, beforeEvents,
    `${boundary.phase} rollback does not publish candidate history/replay events`);
  assert.deepEqual(chainRootsFromBattleBytes(faultBattle.serialize()), boundary.roots,
    `${boundary.phase} rollback preserves exact pending primary identity and ordinal`);

  const positiveControl = LiveBattle.restore(boundary.beforeBytes);
  assert.deepEqual(positiveControl.step(), boundary.boundaryEvents,
    `${boundary.phase} positive control reaches the naturally observed boundary`);
  assert.notEqual(positiveControl.serialize(), boundary.beforeBytes,
    `${boundary.phase} positive control proves the candidate boundary mutated`);
  assert.equal(positiveControl.serialize(), boundary.afterBytes,
    `${boundary.phase} positive control matches the authentic post-advance snapshot`);
  const recovered = LiveBattle.restore(boundary.beforeBytes);
  const resumedEvents = recovered.stepMany(4);
  const tail = LiveBattle.restore(boundary.afterBytes);
  const expectedEvents = [...boundary.boundaryEvents, ...tail.stepMany(3)];
  assert.deepEqual(resumedEvents, expectedEvents,
    `${boundary.phase} restored continuation reproduces the authentic owner boundary and next chunks`);
  assert.equal(recovered.serialize(), tail.serialize(),
    `${boundary.phase} subsequent valid continuation converges to the clean control snapshot`);
}

async function assertGameSessionChainRollback(context, boundary, expectedFault) {
  const beforeTick = boundary.stateBefore.tick;
  const injectedKernel = injectAfterAdvanceAtTick(readFileSync(KERNEL_PATH, "utf8"),
    "GameSession", beforeTick + 1);
  const faultHosts = await stagedHosts(context, injectedKernel);
  const faultSession = faultHosts.gameSession.GameSession.restore(boundary.beforeBytes);
  faultHosts.kernel.armChainHostTestFault(faultSession, "GameSession", beforeTick + 1);
  assert.equal(faultSession.state.tick, beforeTick);
  assert.deepEqual(faultSession.replay, boundary.replayBefore,
    `${boundary.phase} replay is reconstructed from the same canonical session transcript`);
  const beforeBytes = faultSession.serialize();
  const beforeState = faultSession.state;
  const beforeHealth = battleOwnerHealth(beforeState.battle);
  const beforeReplay = faultSession.replay;
  const beforeAudio = faultHosts.gameSession.getGameSessionAudioReplay(faultSession);
  const projectionBefore = faultSession.projectionSnapshot();
  assert.throws(() => faultSession.step(), new RegExp(expectedFault, "u"));
  assert.equal(faultSession.serialize(), beforeBytes,
    `${boundary.phase} rollback leaves the enclosing canonical transcript byte-identical`);
  assert.equal(faultSession.state.tick, beforeTick,
    `${boundary.phase} rollback leaves the GameSession clock unchanged`);
  assert.equal(battleOwnerHealth(faultSession.state.battle), beforeHealth,
    `${boundary.phase} rollback leaves every canonical unit, structure, and crown HP unchanged`);
  assert.deepEqual(faultSession.replay, beforeReplay,
    `${boundary.phase} rollback publishes no candidate history or chain lineage`);
  assert.deepEqual(faultHosts.gameSession.getGameSessionAudioReplay(faultSession), beforeAudio,
    `${boundary.phase} rollback publishes no candidate audio or damage cue`);
  const projectionAfter = faultSession.projectionSnapshot();
  assert.equal(projectionAfter.source, projectionBefore.source,
    `${boundary.phase} rollback retains the same projection source identity`);
  assert.equal(projectionAfter.sequence, projectionBefore.sequence + 1,
    `${boundary.phase} projection sequence advances only for the two explicit reads`);
  assert.deepEqual(projectionAfter.state, projectionBefore.state,
    `${boundary.phase} projected canonical owner state is unchanged by the discarded candidate`);
  assert.deepEqual(projectionAfter.replay, projectionBefore.replay,
    `${boundary.phase} projected replay retains exact primary/hop identity`);

  const positiveControl = GameSession.restore(boundary.beforeBytes);
  assert.deepEqual(positiveControl.step(), boundary.boundaryEvents,
    `${boundary.phase} session positive control reaches the authentic boundary`);
  assert.notEqual(positiveControl.serialize(), boundary.beforeBytes,
    `${boundary.phase} session positive control proves the candidate boundary mutated`);
  assert.equal(positiveControl.serialize(), boundary.afterBytes,
    `${boundary.phase} session positive control matches the authentic post-advance transcript`);
  const recovered = GameSession.restore(boundary.beforeBytes);
  const resumedEvents = recovered.stepMany(4);
  const tail = GameSession.restore(boundary.afterBytes);
  const expectedEvents = [...boundary.boundaryEvents, ...tail.stepMany(3)];
  assert.deepEqual(resumedEvents, expectedEvents,
    `${boundary.phase} restored session reproduces the authentic boundary and later chunks`);
  assert.equal(recovered.serialize(), tail.serialize(),
    `${boundary.phase} valid continuation converges to the clean GameSession snapshot`);
  assert.deepEqual(getGameSessionAudioReplay(recovered), getGameSessionAudioReplay(tail),
    `${boundary.phase} subsequent owner damage/audio remains deterministic after restore`);
}

test("chain pending-primary and pending-hop candidates roll back before adoption in both hosts", async (context) => {
  const cases = [
    { phase: "primary-flight", fault: "LiveBattle chain post-advance fault" },
    { phase: "hop-pending", fault: "LiveBattle chain post-advance fault" },
  ];
  for (const { phase, fault } of cases) {
    await assertLiveBattleChainRollback(context, captureLiveBattleFaultBoundary(phase), fault);
  }
  for (const { phase } of cases) {
    const fault = "GameSession chain post-advance fault";
    await assertGameSessionChainRollback(context, captureGameSessionFaultBoundary(phase), fault);
  }
});
