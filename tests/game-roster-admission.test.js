import assert from "node:assert/strict";
import test from "node:test";

import * as content from "../src/content/index.js";
import {
  createSessionCardDeckWitnesses,
  createSessionCardManifest,
  getSessionCardAdmissionRecord,
  projectSessionNonUnitBattleCard,
  serializeSessionCardManifest,
} from "../src/content/session-card-catalog.js";
import { createPlayableRoster,
  createPlayableRosterQuestionRecords } from "../src/content/playable-roster.js";
import { probeDirectOccurrenceAdapters } from "../scripts/integration-audit.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";
import { LiveBattle } from "../src/sim/live-battle.js";
import { SessionCardRuntime,
  isAuthenticSessionCardRuntime } from "../src/sim/session-card-runtime.js";

const SOUTH = Object.freeze({ x: 3_500, y: 14_500 });
const NORTH = Object.freeze({ x: 3_500, y: 17_500 });
const QUESTION_IDS = Object.freeze([
  "ashen-nest", "bramble-cage", "cloudseed-flask", "ember-roost",
  "gloam-shepherd", "hollowgarden",
]);
const QUESTION_EXPORTS = Object.freeze([
  "DashKnockbackRetargetEncounter", "DeployedUnitCloneEncounter",
  "LeapKnockbackRetargetEncounter", "PreviousCardCopyMatch", "SpawnBatchMaterializer",
]);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const clone = (value) => JSON.parse(JSON.stringify(value));

function mixedBattleSetup() {
  const roster = clone(createPlayableRoster());
  roster.splice(0, 2, clone(projectSessionNonUnitBattleCard("squall-orb")),
    clone(projectSessionNonUnitBattleCard("bulwark-needle")));
  const referenced = new Set(roster.flatMap(({ entities }) => entities.flatMap((entity) => [
    ...[entity.bodyRadiusPolicy, entity.projectileSpeedPolicy, entity.deliveryPolicy,
      entity.layerPolicy, entity.damagePolicy]
      .filter((policy) => policy?.kind === "question")
      .map(({ questionKey }) => questionKey),
    ...(entity.sourceConfidencePolicy?.fields ?? []).map(({ questionKey }) => questionKey),
  ])));
  const questions = createPlayableRosterQuestionRecords()
    .filter(({ key }) => referenced.has(key));
  return { initialWindupTicks: { central: 0, lane: 0 }, questions, roster };
}

function sessionSetup(seed = 0) {
  const battle = mixedBattleSetup();
  const battleSetup = canonical(battle);
  return canonical({ battleSetup, deck: battle.roster.map(({ id }) => id),
    legalNorthDeployments: [], rosterWitness: canonical({ questions: battle.questions,
      roster: battle.roster }), seed, startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 3_600, thinkOffsetTicks: 0 });
}

function seedWithCard(cardId) {
  const deck = mixedBattleSetup().roster.map(({ id }) => id);
  for (let seed = 0; seed < 10_000; seed += 1) {
    if (new DeckCycle({ deck, seed: `${seed}:south` }).state.hand.includes(cardId)) return seed;
  }
  throw new Error(`no deterministic hand witness for ${cardId}`);
}

function command(session, cardId, commandId = 0) {
  const slot = session.state.decks.south.hand.indexOf(cardId);
  assert.notEqual(slot, -1);
  return canonical({ cardId, commandId, point: cardId === "squall-orb" ? NORTH : SOUTH,
    slot, tick: session.state.tick, type: "deploy" });
}

function runtimeDeck() {
  const manifest = createSessionCardManifest();
  const ids = ["squall-orb", "bulwark-needle", "coilblade",
    ...manifest.cards.map(({ id }) => id).filter((id) =>
      !["squall-orb", "bulwark-needle", "coilblade"].includes(id)).slice(0, 5)];
  return canonical(ids.map((id) => {
    const { cost, kind, placementClass } = getSessionCardAdmissionRecord(id);
    return { cost, id, kind, placementClass };
  }));
}

function route(cardId, sequence, point = SOUTH, side = "south") {
  return canonical({ cardId, commandId: sequence, point, sequence, side, tick: 0 });
}

test("game roster admission: manifest is the exact integration occurrence surface with explicit exclusions", () => {
  const manifest = createSessionCardManifest();
  const integration = probeDirectOccurrenceAdapters().map(({ exportName, id }) =>
    ({ exportName, id })).sort((left, right) => left.id.localeCompare(right.id) ||
      left.exportName.localeCompare(right.exportName));
  assert.deepEqual(manifest.occurrences.map(({ exportName, id }) => ({ exportName, id })), integration);
  assert.deepEqual(manifest.counts, { admittedIds: 56, admittedOccurrences: 61,
    claimedIds: 62, claimedOccurrences: 67, excludedClaimedIds: 6,
    excludedClaimedOccurrences: 6, questionOnlyExports: 5 });
  assert.deepEqual(manifest.excludedClaims.map(({ id }) => id), QUESTION_IDS);
  assert.ok(manifest.excludedClaims.every(({ reason, status }) => status === "question" &&
    reason === "identity-only claim lacks sourced kind/cost/deploy admission fields"));
  assert.deepEqual(manifest.questionOnly.map(({ exportName }) => exportName), QUESTION_EXPORTS);
  assert.ok(manifest.questionOnly.every(({ exportName, status }) =>
    status === "question-only" && Object.hasOwn(content, exportName)));
  assert.equal(manifest.cards.find(({ id }) => id === "squall-orb").kind, "effect");
  assert.deepEqual(manifest.cards.find(({ id }) => id === "squall-orb").occurrenceExports,
    ["createInstantSpellCatalog", "createKnockbackSpecialCatalog",
      "createReturningSpellCatalog", "createTravelingLineSpellCatalog"]);
  assert.deepEqual(manifest.cards.find(({ id }) => id === "kilnkeeper").occurrenceExports,
    ["createOrdinaryProjectileSplashCatalog"]);
  assert.deepEqual(manifest.occurrences.filter(({ id }) => id === "kilnkeeper"), [
    { exportName: "createOrdinaryProjectileSplashCatalog", id: "kilnkeeper", status: "admitted" },
  ]);
  assert.equal(serializeSessionCardManifest(), canonical(manifest));
  assert.deepEqual(createSessionCardManifest(), manifest);
  assert.notEqual(createSessionCardManifest(), manifest);
  assert.ok(Object.isFrozen(manifest) && Object.isFrozen(manifest.cards));
});

test("game roster admission: every admitted ID has one exact legal eight-card witness", () => {
  const manifest = createSessionCardManifest();
  const admitted = new Set(manifest.cards.map(({ id }) => id));
  const witnesses = createSessionCardDeckWitnesses();
  assert.equal(witnesses.length, 56);
  assert.deepEqual(new Set(witnesses.map(({ cardId }) => cardId)), admitted);
  for (const { cardId, deck } of witnesses) {
    assert.equal(deck.length, 8);
    assert.equal(new Set(deck).size, 8);
    assert.ok(deck.includes(cardId));
    assert.ok(deck.every((id) => admitted.has(id)));
    const admissions = deck.map((id) => {
      const { cost, kind, placementClass } = getSessionCardAdmissionRecord(id);
      return { cost, id, kind, placementClass };
    });
    assert.ok(isAuthenticSessionCardRuntime(new SessionCardRuntime(canonical(admissions))));
  }
  for (const id of QUESTION_IDS) {
    assert.throws(() => getSessionCardAdmissionRecord(id), /explicit QUESTION/u);
  }
  for (const exportName of QUESTION_EXPORTS) {
    assert.throws(() => getSessionCardAdmissionRecord(exportName), /not claimed/u);
  }
});

test("game roster admission: runtime routes each admitted kind once and restores canonical history", () => {
  const runtime = new SessionCardRuntime(runtimeDeck());
  const events = [runtime.route(route("squall-orb", 0, NORTH)),
    runtime.route(route("bulwark-needle", 1)), runtime.route(route("coilblade", 2))];
  assert.deepEqual(events.map(({ kind, placementClass }) => ({ kind, placementClass })), [
    { kind: "effect", placementClass: "global_effect" },
    { kind: "structure", placementClass: "ground_entity" },
    { kind: "unit", placementClass: "ground_entity" },
  ]);
  assert.deepEqual(runtime.state.counts, { effect: 1, structure: 1, unit: 1 });
  assert.equal(runtime.state.history.length, 3);
  assert.ok(runtime.state.history.every(({ type }) => type === "session-card-routed"));
  const bytes = runtime.serialize();
  assert.equal(SessionCardRuntime.restore(bytes).serialize(), bytes);
  assert.deepEqual(SessionCardRuntime.restore(bytes).state, runtime.state);
  assert.equal(runtime.fork().serialize(), bytes);

  const copy = runtime.card("squall-orb");
  assert.throws(() => { copy.cost = 10; }, TypeError);
  assert.equal(runtime.card("squall-orb").cost, 4);
});

test("game roster admission: non-unit battle cards admit but can never materialize placeholders", () => {
  const battleSetup = mixedBattleSetup();
  const battle = new LiveBattle(canonical(battleSetup));
  const before = battle.serialize();
  assert.throws(() => battle.scheduleDeploy(canonical({ cardId: "squall-orb", point: NORTH,
    sequence: 0, side: "south", tick: 0 })), /not a materializable unit/u);
  assert.throws(() => battle.scheduleDeploy(canonical({ cardId: "bulwark-needle", point: SOUTH,
    sequence: 0, side: "south", tick: 0 })), /not a materializable unit/u);
  assert.equal(battle.serialize(), before);
  assert.equal(battle.state.units.length, 0);
  assert.equal(battle.state.pendingDeployments.length, 0);

  battle.scheduleDeploy(canonical({ cardId: "copperskiff", point: SOUTH,
    sequence: 0, side: "south", tick: 0 }));
  battle.step();
  assert.ok(battle.state.units.some(({ cardId }) => cardId === "copperskiff"));
  assert.equal(LiveBattle.restore(battle.serialize()).serialize(), battle.serialize());

  const effectWithEntity = clone(battleSetup);
  effectWithEntity.roster[0].entities = clone(effectWithEntity.roster[2].entities);
  effectWithEntity.roster[0].formation = clone(effectWithEntity.roster[2].formation);
  assert.throws(() => new LiveBattle(canonical(effectWithEntity)), /inconsistent with its kind/u);
  const unitWithoutEntity = clone(battleSetup); unitWithoutEntity.roster[2].entities = [];
  unitWithoutEntity.roster[2].formation.componentOrder = [];
  unitWithoutEntity.roster[2].formation.totalCount = 0;
  assert.throws(() => new LiveBattle(canonical(unitWithoutEntity)), /inconsistent with its kind/u);
});

test("game roster admission: GameSession spends, cycles, and records one typed route per play", () => {
  for (const [cardId, kind] of [["bulwark-needle", "structure"],
    ["copperskiff", "unit"]]) {
    const session = new GameSession(sessionSetup(seedWithCard(cardId)));
    const before = session.state;
    session.submitPlayerCommand(command(session, cardId));
    session.step();
    const after = session.state;
    const routes = after.cardRuntime.history.filter((entry) => entry.cardId === cardId);
    assert.equal(routes.length, 1, cardId);
    assert.equal(routes[0].kind, kind, cardId);
    assert.equal(after.cardRuntime.counts[kind], 1, cardId);
    assert.equal(after.decks.south.sequence, before.decks.south.sequence + 1, cardId);
    assert.equal(after.elixir.sides.south.amount,
      before.elixir.sides.south.amount - getSessionCardAdmissionRecord(cardId).cost, cardId);
    const materialized = after.battle.units.filter((unit) => unit.cardId === cardId);
    assert.equal(materialized.length > 0, kind === "unit", cardId);
    assert.equal(session.replay.filter(({ type }) => type === "session-deployed").length,
      kind === "unit" ? 1 : 0, cardId);
  }

  const structure = new GameSession(sessionSetup(seedWithCard("bulwark-needle")));
  const invalid = JSON.parse(command(structure, "bulwark-needle")); invalid.point = NORTH;
  const bytes = structure.serialize();
  assert.throws(() => structure.submitPlayerCommand(canonical(invalid)), /illegal/u);
  assert.equal(structure.serialize(), bytes);
  const effect = new GameSession(sessionSetup(seedWithCard("squall-orb")));
  const effectBytes = effect.serialize();
  assert.throws(() => effect.submitPlayerCommand(command(effect, "squall-orb")), /explicit QUESTION/u);
  assert.equal(effect.serialize(), effectBytes);
});

test("game roster admission: non-unit session history is chunk- and restore-exact", () => {
  const configured = sessionSetup(seedWithCard("bulwark-needle"));
  const run = (chunks) => {
    const session = new GameSession(configured);
    session.submitPlayerCommand(command(session, "bulwark-needle"));
    for (const ticks of chunks) session.stepMany(ticks);
    return session;
  };
  const direct = run([120]), chunked = run([1, 17, 3, 41, 58]);
  assert.equal(chunked.serialize(), direct.serialize());
  assert.deepEqual(chunked.state, direct.state);
  assert.equal(chunked.replayBytes(), direct.replayBytes());
  assert.equal(direct.state.cardRuntime.history.length, 1);

  const partial = run([1]);
  const restored = GameSession.restore(partial.serialize());
  restored.stepMany(119);
  assert.equal(restored.serialize(), direct.serialize());
  assert.deepEqual(restored.state.cardRuntime, direct.state.cardRuntime);
});

test("game roster admission: hostile runtime admission is bounded, trap-zero, and atomic", () => {
  const runtime = new SessionCardRuntime(runtimeDeck());
  const before = runtime.serialize();
  assert.throws(() => runtime.route(route("bulwark-needle", 0, NORTH)), /illegal/u);
  assert.equal(runtime.serialize(), before);
  runtime.route(route("squall-orb", 0, NORTH));
  const admitted = runtime.serialize();
  assert.throws(() => runtime.route(route("coilblade", 0)), /duplicate/u);
  assert.equal(runtime.serialize(), admitted);

  assert.throws(() => new SessionCardRuntime(` ${runtimeDeck()}`), /canonical JSON/u);
  assert.throws(() => SessionCardRuntime.restore(` ${admitted}`), /canonical JSON/u);
  assert.throws(() => SessionCardRuntime.restore(canonical({ cards: [], history: [],
    version: 2 })), /unsupported/u);
  const forged = JSON.parse(admitted); forged.history[0].kind = "unit";
  assert.throws(() => SessionCardRuntime.restore(canonical(forged)), /diverges/u);
  let nested = 0; for (let index = 0; index < 66; index += 1) nested = [nested];
  assert.throws(() => SessionCardRuntime.restore(canonical(nested)), /graph bound/u);
  assert.throws(() => SessionCardRuntime.restore(`"${"a".repeat(2_000_001)}"`), /byte bound/u);

  let traps = 0;
  const hostile = new Proxy({}, { get() { traps += 1; throw new Error("observed"); },
    getPrototypeOf() { traps += 1; throw new Error("observed"); },
    ownKeys() { traps += 1; throw new Error("observed"); } });
  assert.throws(() => new SessionCardRuntime(hostile), /canonical JSON text/u);
  assert.throws(() => runtime.route(hostile), /canonical JSON text/u);
  assert.throws(() => SessionCardRuntime.restore(hostile), /canonical JSON text/u);
  assert.throws(() => runtime.card(hostile), /primitive/u);
  assert.equal(traps, 0);
});
