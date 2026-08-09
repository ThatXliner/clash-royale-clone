import assert from "node:assert/strict";
import test from "node:test";

import {
  createSessionTroopRuntimeProfiles,
  getSessionCardAdmissionRecord,
  projectSessionNonUnitBattleCard,
} from "../src/content/session-card-catalog.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
} from "../src/content/playable-roster.js";
import { createSessionSpellProfileReceipts } from "../src/content/session-spell-profile-receipts.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";

const SOUTH = Object.freeze({ x: 3_500, y: 14_500 });
const NORTH = Object.freeze({ x: 3_500, y: 17_500 });
const DECK = Object.freeze([
  "coilblade", "mossguard", "bulwark-needle", "cinder-reliquary",
  "squall-orb", "static-burst", "briar-band", "cinderlings",
]);
const FINAL_TICK = 360;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function integratedBattleSetup() {
  const roster = structuredClone(createPlayableRoster());
  for (const [index, id] of [[2, "bulwark-needle"], [3, "cinder-reliquary"],
    [4, "squall-orb"], [5, "static-burst"]]) {
    roster[index] = structuredClone(projectSessionNonUnitBattleCard(id));
  }
  assert.deepEqual(roster.map(({ id }) => id), DECK);
  const referenced = new Set(roster.flatMap(({ entities }) => entities.flatMap((entity) =>
    [entity.bodyRadiusPolicy, entity.projectileSpeedPolicy].filter((policy) =>
      policy?.kind === "question").map(({ questionKey }) => questionKey))));
  const questions = createPlayableRosterQuestionRecords().filter(({ key }) => referenced.has(key));
  return {
    initialWindupTicks: { central: 0, lane: 0 },
    questions,
    roster,
    spellProfileReceipts: createSessionSpellProfileReceipts(),
  };
}

function witnessSeed() {
  for (let seed = 0; seed < 10_000; seed += 1) {
    const south = new DeckCycle({ deck: DECK, seed: `${seed}:south` }).state.hand;
    const north = new DeckCycle({ deck: DECK, seed: `${seed}:north` }).state.hand;
    if (["mossguard", "bulwark-needle", "squall-orb", "static-burst"]
      .every((id) => south.includes(id)) &&
      ["coilblade", "cinder-reliquary"].every((id) => north.includes(id))) return seed;
  }
  throw new Error("integrated graph has no deterministic deck witness");
}

function setupBytes() {
  const battle = integratedBattleSetup();
  const seed = witnessSeed();
  assert.equal(seed, 444, "the mixed-runtime deck witness is deliberately fixed");
  return canonical({
    battleSetup: canonical(battle),
    deck: [...DECK],
    legalNorthDeployments: [
      { cardId: "cinder-reliquary", point: { ...NORTH } },
      { cardId: "coilblade", point: { ...NORTH } },
    ],
    rosterWitness: canonical({ questions: battle.questions, roster: battle.roster }),
    seed,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 1,
    thinkOffsetTicks: 0,
    troopRuntimeProfiles: createSessionTroopRuntimeProfiles(),
  });
}

const SETUP = setupBytes();

function byteViews(session) {
  const serialized = session.serialize();
  const snapshot = JSON.parse(serialized);
  return {
    history: canonical(snapshot.transcript),
    replay: session.replayBytes(),
    serialize: serialized,
    state: canonical(session.state),
  };
}

function assertSameBytes(actual, expected, label) {
  assert.deepEqual(byteViews(actual), byteViews(expected), label);
}

function playerCommand(session, cardId, commandId, { target = undefined, type = "deploy" } = {}) {
  const slot = session.state.decks.south.hand.indexOf(cardId);
  assert.notEqual(slot, -1, `${cardId} is in the deterministic south hand`);
  const command = { cardId, commandId, point: { ...SOUTH }, slot,
    tick: session.state.tick, type };
  if (type === "spell") Object.assign(command, { side: "south", target });
  return canonical(command);
}

function sharedCoil(session) {
  const unit = session.state.battle.units.find(({ cardId, side }) =>
    cardId === "coilblade" && side === "north");
  assert.ok(unit?.alive, "the north Coilblade must be a live shared target");
  return { id: unit.id, kind: "unit" };
}

function assertAtomicQuestion(session, command, pattern, label) {
  const before = byteViews(session);
  assert.throws(() => session.submitPlayerCommand(command), pattern, label);
  assert.deepEqual(byteViews(session), before, `${label} preserves all canonical bytes`);
}

function assertQuestionBoundaries(session, target) {
  assertAtomicQuestion(session, playerCommand(session, "static-burst", 90),
    /explicit QUESTION.*admitted-effect-without-exact-executable-profile/u,
    "unprofiled effect deploy");
  assertAtomicQuestion(session, playerCommand(session, "static-burst", 91,
    { target, type: "spell" }), /explicit QUESTION.*admitted-effect-without-exact-executable-profile/u,
  "unprofiled effect spell");
  for (const [index, cardId] of ["bramble-cage", "ember-roost"].entries()) {
    assert.throws(() => getSessionCardAdmissionRecord(cardId), /explicit QUESTION/u,
      `${cardId} remains a content QUESTION`);
    const command = canonical({ cardId, commandId: 92 + index, point: { ...SOUTH }, slot: 0,
      tick: session.state.tick, type: "deploy" });
    assertAtomicQuestion(session, command, /unknown/u, `${cardId} excluded session command`);
  }
}

function stageGraph(session, { probeQuestions = false } = {}) {
  assert.equal(session.state.tick, 0);
  assert.deepEqual(session.submitPlayerCommand(playerCommand(session, "mossguard", 0)), {
    accepted: true, commandId: 0, tick: 0, type: "player-command-admitted",
  });
  session.step();
  assert.deepEqual(session.submitPlayerCommand(playerCommand(session, "bulwark-needle", 1)), {
    accepted: true, commandId: 1, tick: 1, type: "player-command-admitted",
  });
  session.step();
  const target = sharedCoil(session);
  if (probeQuestions) assertQuestionBoundaries(session, target);
  assert.deepEqual(session.submitPlayerCommand(playerCommand(session, "squall-orb", 3,
    { target, type: "spell" })), {
    accepted: true, commandId: 3, tick: 2, type: "player-command-admitted",
  });
  session.step();
  return session;
}

function runCounts(session, counts) {
  for (const count of counts) session.stepMany(count);
  return session;
}

function advanceOneAtATime(session, count) {
  for (let index = 0; index < count; index += 1) session.step();
  return session;
}

function causalReceipts(session) {
  const state = session.state;
  const contact = state.battle.troopRuntime.statuses.filter(({ cardId, kind }) =>
    cardId === "mossguard" && kind === "contact");
  const replay = session.replay;
  return {
    bulwarkAttack: replay.filter(({ buildingId, type }) =>
      type === "structure-attack" && buildingId === 3),
    bulwarkDamage: replay.filter(({ externalSourceId, type }) =>
      type === "damage" && externalSourceId === "building:3"),
    cinderEvents: replay.filter(({ type }) => /death-effect|structure-destroyed/u.test(type)),
    contact,
    mossDamage: replay.filter(({ amount, attackerId, tick, type }) =>
      type === "damage" && attackerId === 1 && amount === 202 && tick === 102),
    spell: replay.filter(({ type }) => type === "session-spell-played"),
  };
}

function assertIntegratedGraph(session) {
  const state = session.state;
  const receipts = causalReceipts(session);
  assert.deepEqual(receipts.contact.map(({ contactId, damage, sourceId, targetId, tick }) =>
    ({ contactId, damage, sourceId, targetId, tick })), [{
    contactId: "live-contact:south:1:1:2:102", damage: 202, sourceId: 1, targetId: 2, tick: 102,
  }], "one canonical tick-102 Mossguard receipt comes from the shared host contact");
  assert.equal(receipts.mossDamage.length, 1, "the ordinary host damage exists exactly once");
  assert.deepEqual(receipts.bulwarkAttack[0], {
    amount: 212, buildingId: 3, targetId: 2, tick: 61, type: "structure-attack",
  });
  assert.equal(receipts.bulwarkDamage.filter(({ amount, targetId, tick }) =>
    amount === 212 && targetId === 2 && tick === 62).length, 1,
  "Bulwark enters the same shared unit graph once");
  assert.equal(receipts.spell.length, 1, "Squall has exactly one session event");
  assert.equal(receipts.spell[0].resolution.damage, 689, "Squall keeps its exact profile damage");
  assert.equal(receipts.spell[0].resolution.target.id, 2, "Squall hits the shared Coilblade");
  assert.ok(receipts.cinderEvents.length >= 1, "Cinder reaches its shared death-effect structure path");
  const ids = [
    ...state.battle.units.map(({ id }) => id),
    ...state.battle.structures.map(({ id }) => id),
  ];
  assert.deepEqual(ids, [1, 2, 3, 4], "unit and structure materialization consume one global allocator");
  assert.equal(new Set(ids).size, ids.length, "global shared IDs are once-only");
  assert.deepEqual(state.battle.structures.map(({ cardId, id }) => ({ cardId, id })), [
    { cardId: "bulwark-needle", id: 3 }, { cardId: "cinder-reliquary", id: 4 },
  ]);
  assert.equal(state.battle.units.some(({ cardId }) =>
    ["bulwark-needle", "cinder-reliquary", "squall-orb", "static-burst"].includes(cardId)), false,
  "structures and effects are never fabricated as placeholder units");
  const routes = state.cardRuntime.history;
  assert.equal(routes.filter(({ cardId }) => cardId === "mossguard").length, 1);
  assert.equal(routes.filter(({ cardId }) => cardId === "bulwark-needle").length, 1);
  assert.equal(routes.filter(({ cardId }) => cardId === "cinder-reliquary").length, 1);
  assert.equal(routes.filter(({ cardId }) => cardId === "squall-orb").length, 1);
  assert.equal(state.decks.south.sequence, 3, "south deck cycles exactly once per accepted card");
  assert.equal(state.decks.north.sequence, 2, "north deck cycles exactly once per accepted card");
  assert.equal(state.elixir.sides.south.amount >= 0, true);
  assert.equal(state.elixir.sides.north.amount >= 0, true);
}

test("game shared runtime integration: one GameSession graph preserves unit, structure, and profiled-effect causality across continuations", () => {
  const rejectionSession = new GameSession(SETUP);
  stageGraph(rejectionSession, { probeQuestions: true });

  const direct = runCounts(stageGraph(new GameSession(SETUP)), [FINAL_TICK - 3]);
  const oneStep = advanceOneAtATime(stageGraph(new GameSession(SETUP)), FINAL_TICK - 3);
  const chunked = runCounts(stageGraph(new GameSession(SETUP)), [1, 17, 59, 83, FINAL_TICK - 163]);

  const restoreSource = stageGraph(new GameSession(SETUP));
  restoreSource.stepMany(43);
  const restored = runCounts(GameSession.restore(restoreSource.serialize()), [FINAL_TICK - 46]);

  const forkSource = stageGraph(new GameSession(SETUP));
  forkSource.stepMany(43);
  const fork = GameSession.restore(forkSource.serialize());
  assert.equal(fork.continuationFork, undefined, "no public compact continuation leaks from GameSession");
  runCounts(forkSource, [FINAL_TICK - 46]);
  advanceOneAtATime(fork, FINAL_TICK - 46);

  assertIntegratedGraph(direct);
  for (const [label, candidate] of [["one-step", oneStep], ["chunked", chunked],
    ["restored", restored], ["restored causal fork", fork], ["fork source", forkSource]]) {
    assertSameBytes(candidate, direct, `${label} preserves exact state/replay/history bytes`);
    assert.deepEqual(causalReceipts(candidate), causalReceipts(direct),
      `${label} preserves all causal receipts`);
  }
});
