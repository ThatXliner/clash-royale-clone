import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import {
  createSessionTroopProjectileProfileManifest,
  serializeSessionTroopProjectileProfileManifest,
} from "../src/content/session-troop-projectile-profiles.js";
import { createSessionTroopWitness } from "../src/content/session-troop-roster.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession, getGameSessionAudioReplay } from "../src/sim/game-session.js";
import { LiveBattle } from "../src/sim/live-battle.js";
import { SessionTroopProjectileRuntime } from "../src/sim/session-troop-projectile-runtime.js";

const MANIFEST = createSessionTroopProjectileProfileManifest();
const RECEIPT = serializeSessionTroopProjectileProfileManifest();
const SOUTH = Object.freeze({ x: 3_500, y: 14_500 });
const PROFILE_BY_ID = new Map(MANIFEST.profiles.map((profile) => [profile.id, profile]));

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

function witnessSetup(id, { receipt = RECEIPT } = {}) {
  const witness = createSessionTroopWitness(id);
  const deck = witness.roster.map(({ id: cardId }) => cardId);
  let seed = 0;
  for (; seed < 10_000; seed += 1) {
    if (new DeckCycle({ deck, seed: `${seed}:south` }).state.hand.includes(id)) break;
  }
  assert.ok(seed < 10_000, `${id} has a legal eight-card opening hand`);
  return {
    battleSetup: canonical(witness),
    deck,
    legalNorthDeployments: [],
    projectileRuntimeProfiles: receipt,
    rosterWitness: canonical({ questions: witness.questions, roster: witness.roster }),
    seed,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 3_600,
    thinkOffsetTicks: 0,
  };
}

function sessionFor(id) {
  return new GameSession(canonical(witnessSetup(id)));
}

function deploy(session, id, commandId = 0) {
  const slot = session.state.decks.south.hand.indexOf(id);
  assert.notEqual(slot, -1, `${id} is in the authentic south opening hand`);
  return session.submitPlayerCommand(canonical({
    cardId: id,
    commandId,
    point: SOUTH,
    slot,
    tick: session.state.tick,
    type: "deploy",
  }));
}

test("public GameSession preserves its checkpoint across two authentic deployments", () => {
  const setup = witnessSetup("stormkite");
  const seed = Array.from({ length: 10_000 }, (_, value) => value).find((value) =>
    ["stormkite", "mossguard"].every((id) => new DeckCycle({ deck: setup.deck,
      seed: `${value}:south` }).state.hand.includes(id)));
  assert.notEqual(seed, undefined, "Stormkite and Mossguard share a legal opening hand");
  setup.seed = seed;
  const session = new GameSession(canonical(setup));

  const first = deploy(session, "stormkite", 0);
  assert.equal(first.accepted, true);
  assert.equal(first.tick, 0);
  session.step();
  const checkpoint = session.state;
  assert.deepEqual(checkpoint.battle.units.map(({ id }) => id), [1]);
  assert.ok(Object.isFrozen(checkpoint) && Object.isFrozen(checkpoint.battle.units));
  const checkpointBytes = canonical(checkpoint);

  const second = deploy(session, "mossguard", 1);
  assert.equal(second.accepted, true);
  assert.equal(second.tick, 1);
  session.step();
  assert.equal(session.state.tick, 2);
  assert.deepEqual(session.state.battle.units.map(({ id }) => id), [1, 2]);
  assert.equal(canonical(checkpoint), checkpointBytes);
  assert.deepEqual(checkpoint.battle.units.map(({ id }) => id), [1]);
});

function eventIdentity(event) {
  return event.projectileIdentity ?? event.projectile?.projectileIdentity ?? null;
}

function sameIdentity(left, right) {
  return canonical(left) === canonical(right);
}

function firstSourceEvent(events, type, sourceId = 1) {
  return events.find((event) => event.type === type &&
    eventIdentity(event)?.sourceId === sourceId);
}

function firstRuntimeEvent(events, type, sourceId = 1) {
  return events.find((event) => event.type === type &&
    event.identity?.sourceId === sourceId);
}

function sourceContacts(events, sourceId = 1) {
  return events.filter((event) => event.type === "external-structure-contact" &&
    eventIdentity(event)?.sourceId === sourceId);
}

function mechanicCommand(id, sourceId, targetId = null, tick = 0) {
  return canonical({ cardId: id, sourceId, targetId, tick, type: "projectile-mechanic" });
}

function projectileSourceFromSession(session, cardId) {
  const unit = session.state.battle.units.find((candidate) => candidate.cardId === cardId);
  assert.ok(unit, `${cardId} live host source`);
  return {
    cardId,
    damage: unit.damage,
    delivery: unit.delivery,
    layer: unit.layer,
    maxHealth: unit.maxHealth,
    projectileSpeed: unit.projectileSpeed,
    rangeMillitiles: unit.reach,
    sightRangeMillitiles: unit.sightRange,
    side: unit.side,
    sourceId: unit.id,
    targetMode: unit.targetMode,
  };
}

function brassboltLaunchBoundary(source, tick = 1) {
  return {
    events: [{
      projectileIdentity: {
        attackSequence: 1,
        direction: "unit-to-tower",
        projectileId: 1,
        sourceId: source.sourceId,
      },
      targetId: 2,
      tick,
      type: "projectile-launch",
    }],
    sources: [source],
    tick,
  };
}

function questionRecords(dependency) {
  return Object.entries(dependency.questions).map(([key, record]) => ({
    ...clone(record),
    key,
  }));
}

test("projectile support is the exact HTP/HTO/HTJP receipt join", () => {
  const sourcedIds = MANIFEST.profiles.map(({ id }) => id);
  const sourcedClaims = MANIFEST.profiles.flatMap(({ claims }) => claims);
  const questionIds = MANIFEST.unresolvedDeliveryDependencies.map(({ id }) => id);
  const questionRecords = MANIFEST.unresolvedDeliveryDependencies.flatMap(({ questions }) =>
    Object.values(questions));
  const excludedQuestionIds = MANIFEST.excludedOccurrences
    .filter(({ status }) => status === "question").map(({ id }) => id);

  assert.equal(sourcedClaims.length, MANIFEST.counts.claimedOccurrencePairs);
  assert.equal(new Set(sourcedIds).size, MANIFEST.counts.uniqueCardIds);
  assert.equal(sourcedIds.length, sourcedClaims.length);
  for (const profile of MANIFEST.profiles) {
    assert.equal(profile.claims.length, 1, profile.id);
    assert.equal(profile.claims[0].delivery.classification, "sourced", profile.id);
    assert.equal(profile.claims[0].delivery.delivery, "projectile", profile.id);
    assert.equal(profile.sourceIdentity.id, profile.id, profile.id);
    assert.equal(profile.identityRequirements.authority, "GAME-001TH", profile.id);
    assert.equal(profile.sharedHostIntegration.authority, "LiveBattle", profile.id);
  }
  assert.equal(questionIds.length, MANIFEST.counts.unresolvedDeliveryDependencies);
  assert.equal(new Set(questionIds).size, questionIds.length);
  assert.equal(new Set([...sourcedIds, ...questionIds]).size,
    sourcedIds.length + questionIds.length);
  assert.ok(questionRecords.length > 0);
  assert.ok(questionRecords.every((record) =>
    record.authoritative === false && record.disposition === "question"));
  assert.ok(excludedQuestionIds.every((id) => !sourcedIds.includes(id)));

  for (const id of sourcedIds) {
    const battle = new LiveBattle(
      JSON.stringify(JSON.parse(witnessSetup(id).battleSetup)), undefined, undefined, RECEIPT,
    );
    assert.equal(battle.supportsProjectileRuntime(id), true, id);
    assert.equal(battle.supportsProjectileRuntime(questionIds[0]), false, id);
  }
  assert.ok(questionIds.every((id) => !PROFILE_BY_ID.has(id)));
});

test("unresolved projectile launch emits the admitted QUESTION record unchanged", () => {
  const dependency = MANIFEST.unresolvedDeliveryDependencies.find(({ id }) => id === "brassbolt");
  assert.ok(dependency, "Brassbolt unresolved receipt dependency");
  const session = sessionFor("brassbolt");
  assert.equal(deploy(session, "brassbolt").accepted, true);
  session.step();

  const runtime = SessionTroopProjectileRuntime.fromReceipt(RECEIPT);
  const source = projectileSourceFromSession(session, "brassbolt");
  const boundary = brassboltLaunchBoundary(source, 7);
  const [question] = runtime.step(boundary);
  const identity = boundary.events[0].projectileIdentity;

  assert.deepEqual(question, {
    cardId: "brassbolt",
    claimFamily: dependency.claimFamily,
    disposition: "question",
    identity,
    questions: questionRecords(dependency),
    reason: "projectile delivery remains an explicit QUESTION",
    sourceId: source.sourceId,
    targetId: boundary.events[0].targetId,
    tick: boundary.tick,
    type: "projectile-runtime-question",
  });
  assert.equal(question.questions.length, Object.keys(dependency.questions).length);
  for (const record of question.questions) {
    assert.equal(record.authoritative, false);
    assert.equal(record.disposition, "question");
  }
  assert.deepEqual(runtime.state.history, [{
    cardId: "brassbolt",
    claimFamily: dependency.claimFamily,
    disposition: "question",
    identity,
    reason: question.reason,
    status: "question",
    targetId: question.targetId,
    tick: question.tick,
    type: "projectile-runtime-question",
  }]);
});

test("unresolved projectile launch ignores an overridden public QUESTION lookup", () => {
  const dependency = MANIFEST.unresolvedDeliveryDependencies.find(({ id }) => id === "brassbolt");
  const session = sessionFor("brassbolt");
  assert.equal(deploy(session, "brassbolt").accepted, true);
  session.step();
  const source = projectileSourceFromSession(session, "brassbolt");
  const boundary = brassboltLaunchBoundary(source, 7);
  const original = Object.getOwnPropertyDescriptor(SessionTroopProjectileRuntime.prototype, "question");
  let overrideCalls = 0;

  Object.defineProperty(SessionTroopProjectileRuntime.prototype, "question", {
    configurable: true,
    value(cardId) {
      overrideCalls += 1;
      return {
        cardId,
        claimFamily: "forged-authority",
        questions: {
          "brassbolt.delivery": {
            authoritative: true,
            confidence: "verified",
            disposition: "sourced",
            source: "forged override",
            value: 999,
          },
        },
      };
    },
    writable: true,
  });

  try {
    const runtime = SessionTroopProjectileRuntime.fromReceipt(RECEIPT);
    const [question] = runtime.step(boundary);
    assert.equal(overrideCalls, 0);
    assert.equal(question.claimFamily, dependency.claimFamily);
    assert.deepEqual(question.questions, questionRecords(dependency));
    assert.ok(question.questions.every(({ authoritative, disposition }) =>
      authoritative === false && disposition === "question"));
  } finally {
    Object.defineProperty(SessionTroopProjectileRuntime.prototype, "question", original);
  }
});

test("Brassbolt host launch keeps authority and audio equal to the profile-disabled control", () => {
  const enabled = sessionFor("brassbolt");
  const controlSetup = witnessSetup("brassbolt");
  delete controlSetup.projectileRuntimeProfiles;
  const control = new GameSession(canonical(controlSetup));
  assert.equal(deploy(enabled, "brassbolt").accepted, true);
  assert.equal(deploy(control, "brassbolt").accepted, true);

  const enabledEvents = enabled.stepMany(450);
  const controlEvents = control.stepMany(450);
  const dependency = MANIFEST.unresolvedDeliveryDependencies.find(({ id }) => id === "brassbolt");
  const questionEvents = enabledEvents.filter(({ type }) => type === "projectile-runtime-question");
  assert.ok(questionEvents.length > 0, "actual host launch emits a QUESTION diagnostic");
  for (const question of questionEvents) {
    assert.deepEqual(Object.keys(question).sort(), [
      "cardId", "claimFamily", "disposition", "identity", "questions", "reason",
      "sourceId", "targetId", "tick", "type",
    ]);
    assert.equal(question.cardId, "brassbolt");
    assert.equal(question.claimFamily, dependency.claimFamily);
    assert.equal(question.disposition, "question");
    assert.equal(question.reason, "projectile delivery remains an explicit QUESTION");
    assert.equal(question.type, "projectile-runtime-question");
    assert.ok(Number.isSafeInteger(question.sourceId));
    assert.ok(Number.isSafeInteger(question.targetId));
    assert.ok(Number.isSafeInteger(question.tick));
    assert.equal(question.identity.sourceId, question.sourceId);
    const launch = enabledEvents.find((event) => event.type === "projectile-launch" &&
      sameIdentity(eventIdentity(event), question.identity));
    assert.ok(launch, "QUESTION is tied to its actual host launch");
    assert.deepEqual(question.identity, eventIdentity(launch));
    assert.equal(question.targetId, launch.targetId ?? launch.projectile?.targetId);
    assert.deepEqual(question.questions, questionRecords(dependency));
  }
  assert.ok(enabledEvents.some((event) => event.type === "projectile-launch" &&
    eventIdentity(event)?.sourceId === questionEvents[0].sourceId), "genuine Brassbolt host launch");
  assert.deepEqual(enabledEvents.filter(({ type }) => type !== "projectile-runtime-question"),
    controlEvents, "only QUESTION diagnostics extend the host event stream");
  const enabledState = clone(enabled.state);
  delete enabledState.battle.projectileRuntime;
  assert.deepEqual(enabledState, control.state, "host authority state matches control");
  const directAudio = getGameSessionAudioReplay(enabled);
  assert.deepEqual(directAudio.filter(({ type }) => type !== "projectile-runtime-question"),
    getGameSessionAudioReplay(control),
    "normal audio replay events excluding QUESTION diagnostics match the control");

  const directBytes = enabled.serialize();
  const directReplay = enabled.replayBytes();
  const chunked = sessionFor("brassbolt");
  assert.equal(deploy(chunked, "brassbolt").accepted, true);
  const chunkedEvents = [
    ...chunked.stepMany(1),
    ...chunked.stepMany(17),
    ...chunked.stepMany(63),
    ...chunked.stepMany(369),
  ];
  assert.deepEqual(chunkedEvents, enabledEvents);
  assert.equal(chunked.serialize(), directBytes);
  assert.equal(chunked.replayBytes(), directReplay);
  assert.deepEqual(getGameSessionAudioReplay(chunked), directAudio);

  const prefix = sessionFor("brassbolt");
  assert.equal(deploy(prefix, "brassbolt").accepted, true);
  prefix.stepMany(317);
  const prefixBytes = prefix.serialize();
  const restored = GameSession.restore(prefixBytes);
  assert.equal(restored.serialize(), prefixBytes);
  const fork = restored.fork();
  restored.stepMany(133);
  fork.stepMany(133);
  assert.equal(restored.serialize(), directBytes);
  assert.equal(restored.replayBytes(), directReplay);
  assert.equal(fork.serialize(), directBytes);
  assert.equal(fork.replayBytes(), directReplay);
  assert.deepEqual(getGameSessionAudioReplay(restored), directAudio);
  assert.deepEqual(getGameSessionAudioReplay(fork), directAudio);
});

test("each sourced projectile occurrence uses shared host identity, health, tick, and history", () => {
  for (const profile of MANIFEST.profiles) {
    const session = sessionFor(profile.id);
    const before = session.state;
    const admission = deploy(session, profile.id);
    assert.equal(admission.accepted, true);
    const events = session.stepMany(450);
    const launch = firstSourceEvent(events, "projectile-launch");
    const impact = firstSourceEvent(events, "projectile-impact");
    const launchReceipt = firstRuntimeEvent(events, "projectile-runtime-receipt");
    const contactReceipt = events.find((event) =>
      event.type === "projectile-runtime-receipt" && event.status === "contact" &&
      event.identity?.sourceId === launch?.projectileIdentity?.sourceId);
    const question = firstRuntimeEvent(events, "projectile-runtime-question");
    const contacts = sourceContacts(events);
    const towerBefore = before.battle.towers.find(({ id }) => id === "north:lane:west");
    const towerAfter = session.state.battle.towers.find(({ id }) => id === "north:lane:west");
    const runtimeHistory = session.state.battle.projectileRuntime.history;

    assert.ok(launch, `${profile.id} host launch`);
    assert.ok(impact, `${profile.id} host impact`);
    assert.ok(launchReceipt, `${profile.id} shared launch receipt`);
    assert.ok(contactReceipt, `${profile.id} shared contact receipt`);
    assert.ok(question, `${profile.id} continuation QUESTION`);
    assert.ok(contacts.length > 0, `${profile.id} host health contact`);
    assert.equal(launch.projectileIdentity.direction, "unit-to-tower", profile.id);
    assert.equal(launch.projectileIdentity.sourceId,
      session.state.battle.units.find(({ cardId }) => cardId === profile.id)?.id ?? 1,
      profile.id);
    assert.ok(sameIdentity(launch.projectileIdentity, eventIdentity(impact)), profile.id);
    assert.ok(sameIdentity(launch.projectileIdentity, launchReceipt.identity), profile.id);
    assert.ok(sameIdentity(impact.projectileIdentity, contactReceipt.identity), profile.id);
    assert.ok(sameIdentity(impact.projectileIdentity, question.identity), profile.id);
    assert.equal(launchReceipt.claimFamily, profile.claims[0].claimFamily, profile.id);
    assert.equal(question.disposition, "question", profile.id);
    assert.equal(runtimeHistory.length, contacts.length * 3, profile.id);
    assert.deepEqual(runtimeHistory.map(({ status }) => status),
      contacts.flatMap(() => ["launched", "contact", "question"]), profile.id);
    assert.equal(towerBefore.hitpoints - towerAfter.hitpoints,
      contacts.length * profile.sourceCard.damage, `${profile.id} host tower health`);
    assert.equal(session.state.tick, 450, `${profile.id} shared tick`);
    assert.equal(session.state.battle.tick, session.state.tick, `${profile.id} battle tick`);
    const deployment = session.replay.find(({ type }) => type === "session-deployed");
    assert.equal(deployment.spend.accepted, true, `${profile.id} one spend accepted`);
    assert.equal(deployment.spend.cost, profile.sourceCard.cost, `${profile.id} sourced spend`);
    assert.equal(session.state.decks.south.sequence, 1, `${profile.id} one deck cycle`);
    assert.equal(session.replay.filter(({ type }) => type === "session-deployed").length, 1,
      `${profile.id} one session deployment`);
    assert.ok(session.state.battle.units.every(({ cardId }) => cardId !== "projectile"),
      `${profile.id} has no placeholder projectile unit`);
  }
});

test("QUESTION-only ranged identities and special continuations reject atomically", () => {
  const questionIds = MANIFEST.unresolvedDeliveryDependencies.map(({ id }) => id);
  for (const id of questionIds) {
    const session = sessionFor(id);
    const before = session.serialize();
    const sourceId = session.state.battle.units.length === 0 ? 1 :
      session.state.battle.units[0].id;
    const inspection = session.state.battle;
    assert.equal(inspection.projectileRuntime.history.length, 0, id);
    const battle = new LiveBattle(
      JSON.stringify(JSON.parse(witnessSetup(id).battleSetup)), undefined, undefined, RECEIPT,
    );
    assert.equal(battle.inspectProjectileMechanic(mechanicCommand(id, sourceId)).disposition,
      "question", id);
    assert.throws(() => battle.scheduleProjectileMechanic(
      mechanicCommand(id, sourceId, null, battle.state.tick),
    ), /QUESTION/u, id);
    assert.equal(battle.serialize(),
      new LiveBattle(JSON.stringify(JSON.parse(witnessSetup(id).battleSetup)), undefined, undefined,
        RECEIPT).serialize(), `${id} rejection is atomic`);
    assert.equal(session.serialize(), before, `${id} session has no mutation`);
  }

  for (const profile of MANIFEST.profiles) {
    const battle = new LiveBattle(
      JSON.stringify(JSON.parse(witnessSetup(profile.id).battleSetup)), undefined, undefined, RECEIPT,
    );
    const deployCommand = canonical({
      cardId: profile.id,
      point: SOUTH,
      sequence: 0,
      side: "south",
      tick: 0,
    });
    battle.scheduleDeploy(deployCommand);
    battle.step();
    const unitId = battle.state.units.find(({ cardId }) => cardId === profile.id).id;
    const before = battle.serialize();
    const result = battle.inspectProjectileMechanic(
      mechanicCommand(profile.id, unitId, null, battle.state.tick),
    );
    assert.equal(result.disposition, "question", profile.id);
    assert.equal(result.claimFamily, profile.claims[0].claimFamily, profile.id);
    assert.throws(() => battle.scheduleProjectileMechanic(
      mechanicCommand(profile.id, unitId, null, battle.state.tick),
    ), /QUESTION/u, profile.id);
    assert.equal(battle.serialize(), before, `${profile.id} question action is atomic`);
  }
});

test("projectile runtime restore, fork, replay, and terminal retention are byte-identical", () => {
  const direct = sessionFor("stormkite");
  deploy(direct, "stormkite");
  const directEvents = direct.stepMany(450);
  const directBytes = direct.serialize();
  const directReplay = direct.replayBytes();

  const chunked = sessionFor("stormkite");
  deploy(chunked, "stormkite");
  const chunkedEvents = [
    ...chunked.stepMany(1),
    ...chunked.stepMany(17),
    ...chunked.stepMany(63),
    ...chunked.stepMany(369),
  ];
  assert.deepEqual(chunkedEvents, directEvents);
  assert.equal(chunked.serialize(), directBytes);
  assert.equal(chunked.replayBytes(), directReplay);

  const prefix = sessionFor("stormkite");
  deploy(prefix, "stormkite");
  prefix.stepMany(317);
  const pendingBytes = prefix.serialize();
  const pendingRestore = GameSession.restore(pendingBytes);
  assert.equal(pendingRestore.serialize(), pendingBytes);
  const fork = pendingRestore.state.battle.projectileRuntime;
  assert.equal(fork.pending.length, 1);
  pendingRestore.stepMany(133);
  assert.equal(pendingRestore.serialize(), directBytes);
  assert.equal(pendingRestore.replayBytes(), directReplay);

  for (const cut of [0, 315, 317, 322, 450]) {
    const cutSession = sessionFor("stormkite");
    deploy(cutSession, "stormkite");
    cutSession.stepMany(cut);
    const restored = GameSession.restore(cutSession.serialize());
    restored.stepMany(450 - cut);
    assert.equal(restored.serialize(), directBytes, `restore cut ${cut}`);
    assert.equal(restored.replayBytes(), directReplay, `replay cut ${cut}`);
  }

  const lethal = sessionFor("prism-warden");
  deploy(lethal, "prism-warden");
  const lethalEvents = lethal.stepMany(312);
  assert.ok(lethalEvents.some((event) => event.type === "death" && event.targetId === 1));
  const prismExpected = sessionFor("prism-warden");
  deploy(prismExpected, "prism-warden");
  prismExpected.stepMany(450);
  const lethalRestore = GameSession.restore(lethal.serialize());
  lethalRestore.stepMany(138);
  assert.equal(lethalRestore.serialize(), prismExpected.serialize());
  assert.equal(lethalRestore.replayBytes(), prismExpected.replayBytes());

  const terminal = GameSession.restore(directBytes);
  const terminalBytes = terminal.serialize();
  const terminalHistory = terminal.state.battle.projectileRuntime.history;
  assert.deepEqual(terminal.stepMany(0), []);
  assert.equal(terminal.serialize(), terminalBytes);
  const oldIdentities = new Set(terminalHistory.map(({ identity }) => canonical(identity)));
  const retainedEvents = terminal.stepMany(200);
  assert.ok(retainedEvents.every((event) => {
    const identity = event.identity ?? eventIdentity(event);
    return identity === null || !oldIdentities.has(canonical(identity));
  }), "retained terminal projectiles do not re-emit after restore");
  assert.ok(terminal.state.battle.projectileRuntime.history.every((entry, index) =>
    index >= terminalHistory.length || canonical(entry) === canonical(terminalHistory[index])));

  const battle = new LiveBattle(
    JSON.stringify(JSON.parse(witnessSetup("stormkite").battleSetup)), undefined, undefined, RECEIPT,
  );
  battle.scheduleDeploy(canonical({ cardId: "stormkite", point: SOUTH,
    sequence: 0, side: "south", tick: 0 }));
  battle.stepMany(317);
  const battleFork = battle.fork();
  assert.equal(battleFork.serialize(), battle.serialize());
  battle.stepMany(1);
  battleFork.stepMany(1);
  assert.equal(battleFork.serialize(), battle.serialize());
});

test("closed receipt admission rejects forged plans and roster TOCTOU", () => {
  const id = MANIFEST.profiles[0].id;
  const setup = witnessSetup(id);
  const witness = JSON.parse(setup.battleSetup);
  const renamed = clone(witness);
  renamed.roster.find(({ id: cardId }) => cardId === id).displayName += "-public-rebrand";
  assert.throws(() => new LiveBattle(canonical(renamed), undefined, undefined, RECEIPT),
    /diverges|canonical identity/u);

  const damaged = clone(witness);
  damaged.roster.find(({ id: cardId }) => cardId === id).damage += 1;
  assert.throws(() => new LiveBattle(canonical(damaged), undefined, undefined, RECEIPT),
    /diverges/u);

  const forgedReceipt = JSON.parse(RECEIPT);
  forgedReceipt.profiles[0].sourceCard.damage += 1;
  const forgedBytes = canonical(forgedReceipt);
  assert.notEqual(forgedBytes, RECEIPT);
  assert.throws(() => new LiveBattle(setup.battleSetup, undefined, undefined, forgedBytes),
    /closed HTJP snapshot/u);
  assert.throws(() => new LiveBattle(setup.battleSetup, undefined, undefined,
    `${RECEIPT} `), /closed HTJP snapshot/u);

  assert.throws(() => new SessionTroopProjectileRuntime(RECEIPT),
    /private admitted host plan/u);
  const battle = new LiveBattle(setup.battleSetup, undefined, undefined, RECEIPT);
  const snapshot = JSON.parse(battle.serialize());
  snapshot.projectileRuntime = JSON.parse(snapshot.projectileRuntime);
  snapshot.projectileRuntime.configuration = forgedBytes;
  assert.throws(() => LiveBattle.restore(canonical(snapshot)),
    /closed HTJP snapshot|host-admitted capability|diverges|witness is invalid/u);
});

test("raw unresolved QUESTION records reject extra keys, malformed fields, and authority promotion", () => {
  const live = sessionFor("brassbolt");
  const before = live.serialize();
  const mutations = [
    (record) => { record.unexpected = "extra"; },
    (record) => { record.source = null; },
    (record) => { record.authoritative = true; },
  ];

  for (const mutate of mutations) {
    const forged = JSON.parse(RECEIPT);
    const dependency = forged.unresolvedDeliveryDependencies.find(({ id }) => id === "brassbolt");
    const record = Object.values(dependency.questions)[0];
    mutate(record);
    const forgedReceipt = canonical(forged);
    assert.throws(() => SessionTroopProjectileRuntime.fromReceipt(forgedReceipt));
    assert.throws(() => new GameSession(canonical(witnessSetup("brassbolt", {
      receipt: forgedReceipt,
    }))));
    assert.equal(live.serialize(), before, "rejected receipt leaves existing session unchanged");
  }
});

const AUTHORITY_RUNTIME_PATH = fileURLToPath(new URL(
  "../src/sim/session-troop-projectile-runtime.js", import.meta.url,
));
const AUTHORITY_SHARED_PATH = fileURLToPath(new URL(
  "../src/shared/session-troop-projectile-authority.js", import.meta.url,
));
const AUTHORITY_CONTENT_PATH = fileURLToPath(new URL(
  "../src/content/session-troop-projectile-profiles.js", import.meta.url,
));
const AUTHORITY_BATTLE_PATH = fileURLToPath(new URL(
  "../src/sim/live-battle.js", import.meta.url,
));
const AUTHORITY_SESSION_PATH = fileURLToPath(new URL(
  "../src/sim/game-session.js", import.meta.url,
));

const AUTHORITY_PROBE = String.raw`
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const config = JSON.parse(process.env.PROJECTILE_AUTHORITY_PROBE);
const callback = () => {
  globalThis.__projectileAuthorityCallbacks = (globalThis.__projectileAuthorityCallbacks ?? 0) + 1;
  throw new Error("hostile authority callback");
};
globalThis.__projectileAuthorityCallbacks = 0;
globalThis.__projectileAuthorityTraps = 0;

function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function url(path, query) {
  return pathToFileURL(path).href + (query ?? "");
}

async function loadModules() {
  const query = config.duplicate ? "?authority=" + config.order + "&route=" + config.route : "";
  const runtimeUrl = url(config.runtimePath, query);
  const sharedUrl = url(config.sharedPath, query);
  const contentUrl = url(config.contentPath, query);
  if (config.order === "runtime-first") {
    const runtime = await import(runtimeUrl);
    const shared = await import(sharedUrl);
    const content = await import(contentUrl);
    return { content, runtime, shared };
  }
  if (config.order === "content-first") {
    const content = await import(contentUrl);
    const shared = await import(sharedUrl);
    const runtime = await import(runtimeUrl);
    return { content, runtime, shared };
  }
  if (config.order === "parallel") {
    const [content, runtime, shared] = await Promise.all([
      import(contentUrl), import(runtimeUrl), import(sharedUrl),
    ]);
    return { content, runtime, shared };
  }
  const [runtime, runtimeDuplicate, shared, sharedDuplicate, content, contentDuplicate] =
    await Promise.all([
      import(url(config.runtimePath, "?authority=one&route=" + config.route)),
      import(url(config.runtimePath, "?authority=two&route=" + config.route)),
      import(url(config.sharedPath, "?authority=one&route=" + config.route)),
      import(url(config.sharedPath, "?authority=two&route=" + config.route)),
      import(url(config.contentPath, "?authority=one&route=" + config.route)),
      import(url(config.contentPath, "?authority=two&route=" + config.route)),
    ]);
  assert.deepEqual(runtimeDuplicate.SESSION_TROOP_PROJECTILE_RUNTIME_VERSION,
    runtime.SESSION_TROOP_PROJECTILE_RUNTIME_VERSION);
  assert.equal(sharedDuplicate.SESSION_TROOP_PROJECTILE_AUTHORITY_RECEIPT,
    shared.SESSION_TROOP_PROJECTILE_AUTHORITY_RECEIPT);
  assert.equal(contentDuplicate.serializeSessionTroopProjectileProfileManifest(),
    content.serializeSessionTroopProjectileProfileManifest());
  return { content, runtime, shared };
}

function attackRegistrationRoutes(runtime) {
  const candidate = runtime.registerSessionTroopProjectileRuntimeAuthority;
  if (candidate !== undefined) {
    throw new Error("removed projectile registrar remains publicly exported");
  }
  for (const route of ["direct", "bind", "proxy", "wrapper", "call", "apply", "reflect"]) {
    if (candidate === undefined) continue;
    const target = route === "proxy" ? new Proxy(candidate, {
      apply() { globalThis.__projectileAuthorityTraps += 1; return callback(); },
    }) : candidate;
    const invoke = route === "bind" ? target.bind(null, callback)
      : route === "wrapper" ? (...args) => target(...args)
        : target;
    try {
      if (route === "call") invoke.call(null, callback);
      else if (route === "apply") invoke.apply(null, [callback]);
      else if (route === "reflect") Reflect.apply(invoke, null, [callback]);
      else invoke(callback);
    } catch {
      // Rejection is expected for every legacy route.
    }
  }
}

function attackPublicInputs(modules) {
  const { content, runtime, shared } = modules;
  const inventories = [
    ["content", content],
    ["runtime", runtime],
    ["shared", shared],
  ];
  for (const [moduleName, module] of inventories) {
    const exportedNames = Object.keys(module).sort();
    if (exportedNames.some((name) => /register|provider|issuer|plan/u.test(name))) {
      throw new Error(moduleName + " authority exposes a generic authority export: " + exportedNames.join(","));
    }
  }
  const sharedNames = Object.keys(shared).sort();
  assert.deepEqual(sharedNames, [
    "SESSION_TROOP_PROJECTILE_AUTHORITY_RECEIPT",
    "assertSessionTroopProjectileAuthorityReceipt",
    "getSessionTroopProjectileAuthorityReceipt",
  ]);
  const runtimeNames = Object.keys(runtime).sort();
  assert.ok(runtimeNames.includes("SessionTroopProjectileRuntime"));
  assert.ok(runtimeNames.includes("admitSessionTroopProjectileRuntimeProfiles"));
  if (runtimeNames.some((name) => /register|provider|issuer|plan/u.test(name))) {
    throw new Error("runtime authority exposes a generic authority export: " + runtimeNames.join(","));
  }
  for (const [name, value] of Object.entries(shared)) {
    if (typeof value !== "function") continue;
    try { value(callback); } catch { /* hostile callback/object must be rejected or ignored */ }
  }
  attackRegistrationRoutes(runtime);
  const hostile = new Proxy({
    get() { globalThis.__projectileAuthorityTraps += 1; return callback(); },
    getPrototypeOf() { globalThis.__projectileAuthorityTraps += 1; return callback(); },
  }, {
    get() { globalThis.__projectileAuthorityTraps += 1; return callback(); },
    getPrototypeOf() { globalThis.__projectileAuthorityTraps += 1; return callback(); },
  });
  const accessor = Object.defineProperty({}, "value", {
    enumerable: true,
    get() { globalThis.__projectileAuthorityTraps += 1; return callback(); },
  });
  const hostileInputs = [hostile, accessor, new String(config.receipt), {}];
  for (const value of hostileInputs) {
    for (const admit of [
      runtime.admitSessionTroopProjectileRuntimeProfiles,
      shared.assertSessionTroopProjectileAuthorityReceipt,
    ]) {
      assert.equal(typeof admit, "function");
      assert.throws(() => admit(value));
    }
  }
  assert.throws(() => runtime.SessionTroopProjectileRuntime.fromReceipt("{}"));
  assert.throws(() => new runtime.SessionTroopProjectileRuntime({
    configuration: config.receipt,
    profiles: [],
    questions: [],
  }));
  assert.throws(() => new globalThis.LiveBattle(config.battleSetup,
    undefined, undefined, "{}"));
  assert.throws(() => new globalThis.GameSession("{}"));
  const forgedSetup = JSON.parse(config.setup);
  forgedSetup.projectileRuntimeProfiles = "{}";
  assert.throws(() => new globalThis.GameSession(canonical(forgedSetup)));
  assert.equal(shared.getSessionTroopProjectileAuthorityReceipt(), config.receipt);
  assert.equal(runtime.admitSessionTroopProjectileRuntimeProfiles(config.receipt), config.receipt);
  assert.equal(content.serializeSessionTroopProjectileProfileManifest(), config.receipt);
}

const modules = await loadModules();
const battleModule = await import(url(config.battlePath,
  config.duplicate ? "?authority=" + config.order : ""));
const sessionModule = await import(url(config.sessionPath,
  config.duplicate ? "?authority=" + config.order : ""));
globalThis.LiveBattle = battleModule.LiveBattle;
globalThis.GameSession = sessionModule.GameSession;
attackPublicInputs(modules);
console.log(JSON.stringify({
  accepted: true,
  callbacks: globalThis.__projectileAuthorityCallbacks,
  traps: globalThis.__projectileAuthorityTraps,
  runtimeExports: Object.keys(modules.runtime).sort(),
  sharedExports: Object.keys(modules.shared).sort(),
}));
`;

test("closed projectile authority has no public registrar and survives fresh-process preemption routes", () => {
  const orders = ["runtime-first", "content-first", "parallel", "duplicate-modules"];
  const routes = ["direct", "bind", "proxy", "wrapper", "call", "apply", "reflect"];
  const setup = canonical(witnessSetup("stormkite"));
  let probes = 0;
  for (const order of orders) {
    for (const route of routes) {
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", AUTHORITY_PROBE], {
        encoding: "utf8",
        env: {
          ...process.env,
          PROJECTILE_AUTHORITY_PROBE: JSON.stringify({
            battleSetup: JSON.parse(setup).battleSetup,
            battlePath: AUTHORITY_BATTLE_PATH,
            contentPath: AUTHORITY_CONTENT_PATH,
            duplicate: order === "duplicate-modules",
            order,
            receipt: RECEIPT,
            route,
            runtimePath: AUTHORITY_RUNTIME_PATH,
            sessionPath: AUTHORITY_SESSION_PATH,
            setup,
            sharedPath: AUTHORITY_SHARED_PATH,
          }),
        },
      });
      assert.equal(result.error, undefined, result.error?.message);
      assert.equal(result.status, 0, `${order}/${route}\n${result.stdout}\n${result.stderr}`);
      const output = JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1));
      assert.equal(output.accepted, true, `${order}/${route}`);
      assert.equal(output.callbacks, 0, `${order}/${route} callback count`);
      assert.equal(output.traps, 0, `${order}/${route} trap count`);
      probes += 1;
    }
  }
  assert.equal(probes, 28);
});
