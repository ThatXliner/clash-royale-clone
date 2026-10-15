import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";

const [parentRoot, candidateRoot] = process.argv.slice(2);
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const digest = (text) => createHash("sha256").update(text).digest("hex");
async function loadRoot(root) {
  const imp = (file) => import(pathToFileURL(path.join(root, file)).href);
  const [game, rosterModule, cards, catalog, shipped] = await Promise.all([
    imp("src/sim/game-session.js"),
    imp("src/content/playable-roster.js"),
    imp("src/content/cards/buildings-resource.js"),
    imp("src/content/session-card-catalog.js"),
    imp("src/ui/game-browser-entry.js"),
  ]);
  return { GameSession: game.GameSession, createPlayableRoster: rosterModule.createPlayableRoster,
    createPlayableRosterQuestionRecords: rosterModule.createPlayableRosterQuestionRecords,
    createResourceBuildingQuestionRecords: cards.createResourceBuildingQuestionRecords,
    projectSessionNonUnitBattleCard: catalog.projectSessionNonUnitBattleCard,
    createShippedGameSessionSetup: shipped.createShippedGameSessionSetup };
}
const roots = { parent: await loadRoot(parentRoot), candidate: await loadRoot(candidateRoot) };
function oldV1Profile(api) {
  const q = api.createResourceBuildingQuestionRecords();
  return { class: "resource", deployTicks: 60,
    generationAmount: q.generationAmount.value,
    generationCadenceTicks: q.generationCadenceTicks.value,
    hitpoints: 1070, lifetimeTicks: q.lifetimeTicks.value,
    policy: Object.fromEntries(["generationAmount", "generationCadenceTicks", "lifetimeTicks"]
      .map((key) => [key, q[key]])) };
}
function rosterFor(api, northCardId = null) {
  const roster = structuredClone(api.createPlayableRoster());
  const card = structuredClone(api.projectSessionNonUnitBattleCard("aether-well"));
  card.buildingRuntime = oldV1Profile(api);
  roster.splice(0, 1, card);
  const referenced = new Set(roster.flatMap(({ entities }) => entities.flatMap((entity) => [
    ...[entity.bodyRadiusPolicy, entity.projectileSpeedPolicy]
      .filter((policy) => policy.kind === "question").map(({ questionKey }) => questionKey),
    ...(entity.sourceConfidencePolicy?.fields ?? []).map(({ questionKey }) => questionKey),
  ])));
  const questions = api.createPlayableRosterQuestionRecords().filter(({ key }) => referenced.has(key));
  const deck = roster.map(({ id }) => id);
  const legalNorthDeployments = northCardId === null ? [] : [{
    cardId: northCardId, point: { x: 3500, y: 17500 },
  }];
  const common = { battleSetup: canonical({ initialWindupTicks: { central: 0, lane: 0 },
    questions, roster }), deck, legalNorthDeployments,
    rosterWitness: canonical({ questions, roster }) };
  let seed = 0;
  for (; seed < 10000; seed += 1) {
    const setup = canonical({ ...common, seed, startingElixir: { north: 8, south: 8 },
      thinkIntervalTicks: legalNorthDeployments.length ? 1 : 3600, thinkOffsetTicks: 0 });
    const candidate = new api.GameSession(setup);
    if (candidate.state.decks.south.hand.includes("aether-well") &&
        (northCardId === null || candidate.state.decks.north.hand.includes(northCardId))) break;
  }
  if (seed === 10000) throw new Error("could not find deterministic hand witness");
  const setup = canonical({ ...common, seed, startingElixir: { north: 8, south: 8 },
    thinkIntervalTicks: legalNorthDeployments.length ? 1 : 3600, thinkOffsetTicks: 0 });
  return { setup, seed };
}
function makeLegacy(api, northCardId = null) {
  const { setup } = rosterFor(api, northCardId);
  return new api.GameSession(setup);
}
function deployAether(session) {
  const slot = session.state.decks.south.hand.indexOf("aether-well");
  const command = { cardId: "aether-well", commandId: 0, point: { x: 3500, y: 14500 },
    slot, tick: session.state.tick, type: "deploy" };
  return session.submitPlayerCommand(canonical(command));
}
function capture(session) {
  const snapshot = session.serialize();
  const replay = session.replayBytes();
  const state = canonical(session.state);
  return { stateHash: digest(state), snapshotHash: digest(snapshot), replayHash: digest(replay),
    tick: session.state.tick, structure: session.state.battle.structures.find(
      ({ cardId }) => cardId === "aether-well") ?? null,
    eventTail: session.replay.slice(-5) };
}
function compareCaptures(before, after) {
  return canonical(before) === canonical(after);
}
function v1Lifecycle(api) {
  const session = makeLegacy(api);
  const samples = { initial: capture(session) };
  deployAether(session);
  samples.deployed = capture(session);
  session.stepMany(510);
  samples.beforeFirstPulseBoundary = capture(session);
  session.stepMany(1);
  samples.firstPulseBoundary = capture(session);
  session.stepMany(3689);
  samples.beforeExpiry = capture(session);
  session.stepMany(1);
  samples.expiryBoundary = capture(session);
  const restored = api.GameSession.restore(session.serialize());
  samples.expiryRestore = capture(restored);
  return samples;
}
function v1Combat(api) {
  const session = makeLegacy(api, "mossguard");
  deployAether(session);
  session.stepMany(481);
  const structure = session.state.battle.structures.find(({ cardId }) => cardId === "aether-well");
  if (structure === undefined || structure.alive !== false || structure.deathCause !== "combat-damage") {
    throw new Error("the legal opposing Mossguard did not destroy legacy v1 Aether through combat");
  }
  const death = capture(session);
  session.stepMany(20);
  const destroyEvents = session.replay.filter(({ type, buildingId }) =>
    type === "structure-destroyed" && buildingId === structure.id);
  const payoutEvents = session.replay.filter(({ type, buildingId }) =>
    type === "building-resource-payout-triggered" && buildingId === structure.id);
  if (destroyEvents.length !== 1 || payoutEvents.length !== 0) {
    throw new Error("legacy v1 combat death must publish one destruction and no v2 payout");
  }
  return { death, afterLaterTicks: capture(session), destroyEvents, payoutEvents };
}
function shippedEight(api) {
  const session = new api.GameSession(api.createShippedGameSessionSetup(0));
  const samples = { initial: capture(session) };
  for (const [label, steps] of [["oneTick", 1], ["openingChunk", 510], ["longRun", 3689]]) {
    session.stepMany(steps);
    samples[label] = capture(session);
  }
  return samples;
}
const results = {};
for (const [label, api] of Object.entries(roots)) {
  results[label] = { legacyV1: v1Lifecycle(api), legacyV1Combat: v1Combat(api), shippedEight: shippedEight(api) };
}
const comparisons = {};
for (const scenario of Object.keys(results.parent)) {
  comparisons[scenario] = {};
  for (const label of Object.keys(results.parent[scenario])) {
    comparisons[scenario][label] = {
      equal: compareCaptures(results.parent[scenario][label], results.candidate[scenario][label]),
      parent: results.parent[scenario][label],
      candidate: results.candidate[scenario][label],
    };
  }
}
const allEqual = Object.values(comparisons).every((sampleSet) =>
  Object.values(sampleSet).every(({ equal }) => equal));
const report = { candidateCommit: process.env.HBR_CANDIDATE_COMMIT,
  parentCommit: process.env.HBR_PARENT_COMMIT, allEqual, comparisons };
console.log(JSON.stringify(report, null, 2));
if (!allEqual) process.exitCode = 2;
