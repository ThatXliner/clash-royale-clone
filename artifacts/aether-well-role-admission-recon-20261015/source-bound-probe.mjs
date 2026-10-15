import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  EDITABLE_MIXED_DECK_CARD_IDS,
  createEditableGameSessionSetup,
} from "../../src/content/editable-deck.js";
import { PLAYABLE_CARD_IDS, createPlayableRoster, createPlayableRosterQuestionRecords } from "../../src/content/playable-roster.js";
import { projectSessionNonUnitBattleCard } from "../../src/content/session-card-catalog.js";
import { RLEnvironment } from "../../src/rl/environment.js";
import { GameSession } from "../../src/sim/game-session.js";

const OUT = new URL("./", import.meta.url);
const DECK = ["aether-well", ...PLAYABLE_CARD_IDS.slice(1)];
const MAX_TICK = 3_901;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function makeSetup(seed) {
  const roster = structuredClone(createPlayableRoster());
  roster.splice(0, 1, structuredClone(projectSessionNonUnitBattleCard("aether-well")));
  const questionKeys = new Set(roster.flatMap(({ entities = [] }) => entities.flatMap((entity) => [
    ...[entity.bodyRadiusPolicy, entity.projectileSpeedPolicy, entity.deliveryPolicy,
      entity.layerPolicy, entity.damagePolicy]
      .filter((policy) => policy?.kind === "question").map(({ questionKey }) => questionKey),
    ...(entity.sourceConfidencePolicy?.fields ?? []).map(({ questionKey }) => questionKey),
  ])));
  const questions = createPlayableRosterQuestionRecords()
    .filter(({ key }) => questionKeys.has(key));
  const deck = roster.map(({ id }) => id);
  const battleSetup = canonical({ initialWindupTicks: { central: 0, lane: 0 }, questions, roster });
  const legalNorthDeployments = deck.map((cardId) => ({
    cardId,
    point: { x: 3_500, y: 17_500 },
  })).sort((left, right) => left.cardId < right.cardId ? -1 : 1);
  return canonical({
    battleSetup,
    deck,
    legalNorthDeployments,
    rosterWitness: canonical({ questions, roster }),
    seed,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 60,
    thinkOffsetTicks: 0,
  });
}

function sideState(state, side) {
  const deck = state.decks[side];
  return {
    deckHand: [...deck.hand],
    deckNext: deck.next,
    deckQueue: [...deck.queue],
    deckSequence: deck.sequence,
    elixir: state.elixir.sides[side].amount,
    pendingElixirGrants: structuredClone(state.elixir.sides[side].grants),
  };
}

function compactState(session) {
  const state = session.state;
  return {
    tick: state.tick,
    terminal: state.terminal,
    phase: state.clock.phase,
    towers: state.battle.towers.map(({ hitpoints, id, side }) => ({ hitpoints, id, side })),
    structures: state.battle.structures.map(({ alive, cardId, deathCause, deathTriggered,
      hitpoints, id, placedTick, side }) => ({ alive, cardId, deathCause, deathTriggered,
      hitpoints, id, placedTick, side })),
    north: sideState(state, "north"),
    south: sideState(state, "south"),
    opponent: structuredClone(state.opponent),
  };
}

function caught(fn) {
  try { return { accepted: true, value: fn() }; }
  catch (error) { return { accepted: false, name: error.name, message: error.message }; }
}

const currentMixedMembers = DECK.map((cardId) => ({
  cardId,
  currentlyAdmitted: EDITABLE_MIXED_DECK_CARD_IDS.includes(cardId),
}));
const unsupportedMembers = currentMixedMembers.filter(({ currentlyAdmitted }) => !currentlyAdmitted)
  .map(({ cardId }) => cardId);
const editableDeckProbe = caught(() => createEditableGameSessionSetup(DECK, 2));
const rlAetherProbe = caught(() => {
  const environment = new RLEnvironment({ deck: DECK, horizonTicks: 1_200, strideTicks: 60, seed: 2 });
  return environment.observe();
});
const controlDeck = ["ember-basin", ...PLAYABLE_CARD_IDS.slice(1)];
const editableControlProbe = caught(() => {
  const value = JSON.parse(createEditableGameSessionSetup(controlDeck, 2));
  return { deck: value.deck, seed: value.seed };
});
const rlControlProbe = caught(() => {
  const environment = new RLEnvironment({ deck: controlDeck, horizonTicks: 1_200, strideTicks: 60, seed: 2 });
  const observation = environment.observe();
  return { actionCount: observation.actionMask.length,
    legalActionCount: observation.actionMask.filter(Boolean).length,
    hand: observation.hand, status: observation.status, tick: observation.tick };
});

const setup = makeSetup(2);
const session = new GameSession(setup);
const initial = compactState(session);
const southSlot = session.state.decks.south.hand.indexOf("aether-well");
if (southSlot < 0) throw new Error("seed 2 no longer places AetherWell in the south opening hand");
const playerCommand = {
  cardId: "aether-well",
  commandId: 0,
  point: { x: 3_500, y: 14_500 },
  slot: southSlot,
  tick: session.state.tick,
  type: "deploy",
};
const playerAdmission = session.submitPlayerCommand(canonical(playerCommand));
const acceptedCommandSnapshot = session.serialize();
const tickZeroDirectExit = session.stepMany(1);
const afterTickZero = compactState(session);
const northAiAetherDeployment = session.replay.find((event) =>
  event.type === "session-structure-deployed" && event.side === "north" &&
  event.route?.cardId === "aether-well") ?? null;
const southAetherDeployment = session.replay.find((event) =>
  event.type === "session-structure-deployed" && event.side === "south" &&
  event.route?.cardId === "aether-well") ?? null;
if (northAiAetherDeployment === null) {
  throw new Error("seed 2 failed to reproduce the natural north AetherWell deployment at tick 0");
}
if (southAetherDeployment === null) {
  throw new Error("the admitted south player AetherWell command did not materialize");
}
const aetherIds = new Set(session.state.battle.structures
  .filter(({ cardId }) => cardId === "aether-well").map(({ id }) => id));

let cadenceCheckpoint = null;
while (session.state.tick < 3_898 && !session.state.terminal) {
  const count = Math.min(60, 3_898 - session.state.tick);
  session.stepMany(count);
  if (cadenceCheckpoint === null && session.replay.some((event) =>
    event.type === "building-resource-cadence-triggered" && aetherIds.has(event.buildingId))) {
    cadenceCheckpoint = compactState(session);
  }
}

let expiryCheckpoint = null;
let restoreComparison = null;
let expiryDirectExit = null;
let restoredBranch = null;
if (!session.state.terminal && session.state.tick === 3_898) {
  expiryCheckpoint = session.serialize();
  const branch = GameSession.restore(expiryCheckpoint);
  expiryDirectExit = session.stepMany(3);
  const branchDirectExit = branch.stepMany(3);
  restoreComparison = {
    branchDirectExit,
    sessionBytesEqual: session.serialize() === branch.serialize(),
    replayBytesEqual: session.replayBytes() === branch.replayBytes(),
    stateEqual: canonical(session.state) === canonical(branch.state),
  };
  restoredBranch = branch;
}

const finalState = compactState(session);
const replay = session.replay;
const aetherLifecycleEvents = replay.filter((event) => {
  if (event.type === "session-structure-deployed" && event.route?.cardId === "aether-well") return true;
  if (event.type === "structure-materialized" && event.cardId === "aether-well") return true;
  const id = event.buildingId ?? event.sourceId;
  return aetherIds.has(id) && /^(building|structure|resource)-/u.test(event.type);
});
const aetherGrantEvents = aetherLifecycleEvents.filter(({ type }) => [
  "building-resource-cadence-triggered",
  "building-resource-grant",
  "building-resource-granted",
  "building-resource-payout-triggered",
  "structure-destroyed",
].includes(type));
const runtimeQuestions = projectSessionNonUnitBattleCard("aether-well").buildingRuntime.policy;
const policySummary = Object.fromEntries(Object.entries(runtimeQuestions).map(([key, record]) => [
  key,
  { authoritative: record.authoritative, confidence: record.confidence,
    disposition: record.disposition, source: record.source, value: record.value },
]));
const report = {
  candidate: "c1d17ec2a5591e9871659dfdea9a4e9f4688ea6d",
  runtime: process.version,
  deck: DECK,
  membershipProbe: { members: currentMixedMembers, unsupportedMembers },
  apiProbes: {
    editableAether: editableDeckProbe,
    rlAether: rlAetherProbe,
    editablePositiveControl: editableControlProbe,
    rlPositiveControl: rlControlProbe,
  },
  sessionAdmission: {
    path: "new GameSession(canonical setup composed from existing source projectors)",
    setupSHA256: createHash("sha256").update(setup).digest("hex"),
    accepted: true,
    initial,
    playerCommand,
    playerAdmission,
    acceptedCommandSnapshotSHA256: createHash("sha256").update(acceptedCommandSnapshot).digest("hex"),
    tickZeroDirectExit,
    afterTickZero,
    northAiAetherDeployment,
    southAetherDeployment,
    cadenceCheckpoint,
    expiryCheckpoint: expiryCheckpoint === null ? null : {
      tick: 3_898,
      sha256: createHash("sha256").update(expiryCheckpoint).digest("hex"),
    },
    expiryDirectExit,
    restoreComparison,
    finalState,
    aetherIds: [...aetherIds].sort((left, right) => left - right),
    lifecycleEvents: aetherLifecycleEvents,
    payoutAndGrantEvents: aetherGrantEvents,
    policySummary,
    snapshotSHA256: createHash("sha256").update(session.serialize()).digest("hex"),
    replaySHA256: createHash("sha256").update(session.replayBytes()).digest("hex"),
  },
};

const base = new URL("./", import.meta.url);
await writeFile(new URL("probe-report.json", base), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(new URL("accepted-player-command-snapshot.json", base), acceptedCommandSnapshot);
if (expiryCheckpoint !== null) {
  await writeFile(new URL("pre-expiry-checkpoint.json", base), expiryCheckpoint);
}
await writeFile(new URL("final-session-snapshot.json", base), session.serialize());
await writeFile(new URL("final-session-replay.json", base), session.replayBytes());
const finalProjection = session.projectionSnapshot();
await writeFile(new URL("final-public-projection.json", base), `${JSON.stringify(finalProjection, null, 2)}\n`);
console.log(JSON.stringify({
  apiProbes: report.apiProbes,
  membershipProbe: report.membershipProbe,
  sessionAdmission: {
    accepted: report.sessionAdmission.accepted,
    seed: 2,
    initialNorth: initial.north,
    initialSouth: initial.south,
    playerAdmission,
    northAiAetherDeployment,
    southAetherDeployment,
    cadenceCheckpoint: cadenceCheckpoint === null ? null : {
      tick: cadenceCheckpoint.tick,
      northElixir: cadenceCheckpoint.north.elixir,
      southElixir: cadenceCheckpoint.south.elixir,
    },
    expiryCheckpoint: report.sessionAdmission.expiryCheckpoint,
    restoreComparison,
    finalTick: finalState.tick,
    terminal: finalState.terminal,
    payoutAndGrantEvents: aetherGrantEvents,
    snapshotSHA256: report.sessionAdmission.snapshotSHA256,
    replaySHA256: report.sessionAdmission.replaySHA256,
  },
}, null, 2));
