import { createEditableGameSessionSetup } from "../../src/content/editable-deck.js";
import { createPlayableRoster, createPlayableRosterQuestionRecords, PLAYABLE_CARD_IDS } from "../../src/content/playable-roster.js";
import { projectSessionNonUnitBattleCard } from "../../src/content/session-card-catalog.js";
import { GameSession } from "../../src/sim/game-session.js";
import { RLEnvironment } from "../../src/rl/environment.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function setupFor(seed) {
  const roster = structuredClone(createPlayableRoster());
  roster.splice(0, 1, structuredClone(projectSessionNonUnitBattleCard("aether-well")));
  const refs = new Set(roster.flatMap(({ entities = [] }) => entities.flatMap((entity) => [
    ...[entity.bodyRadiusPolicy, entity.projectileSpeedPolicy, entity.deliveryPolicy,
      entity.layerPolicy, entity.damagePolicy]
      .filter((policy) => policy?.kind === "question").map(({ questionKey }) => questionKey),
    ...(entity.sourceConfidencePolicy?.fields ?? []).map(({ questionKey }) => questionKey),
  ])));
  const questions = createPlayableRosterQuestionRecords().filter(({ key }) => refs.has(key));
  const deck = roster.map(({ id }) => id);
  const battleSetup = canonical({ initialWindupTicks: { central: 0, lane: 0 }, questions, roster });
  return canonical({
    battleSetup,
    deck,
    legalNorthDeployments: deck.map((cardId) => ({ cardId, point: { x: 3_500, y: 17_500 } }))
      .sort((left, right) => left.cardId < right.cardId ? -1 : 1),
    rosterWitness: canonical({ questions, roster }),
    seed,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 60,
    thinkOffsetTicks: 0,
  });
}

const deck = ["aether-well", ...PLAYABLE_CARD_IDS.slice(1)];
let editError = null;
try { createEditableGameSessionSetup(deck, 0); }
catch (error) { editError = { name: error.name, message: error.message }; }
let rlError = null;
try { new RLEnvironment({ deck, horizonTicks: 1_200, strideTicks: 60, seed: 0 }); }
catch (error) { rlError = { name: error.name, message: error.message }; }
const search = [];
let found = null;
for (let seed = 0; seed <= 15; seed += 1) {
  const session = new GameSession(setupFor(seed));
  const initial = {
    deck: session.state.decks.north.deck,
    hand: [...session.state.decks.north.hand],
    next: session.state.decks.north.next,
    elixir: session.state.elixir.sides.north.amount,
    southHand: [...session.state.decks.south.hand],
    southNext: session.state.decks.south.next,
    southElixir: session.state.elixir.sides.south.amount,
  };
  let hit = null;
  while (session.state.tick < 1_200 && !session.state.terminal) {
    const count = Math.min(60, 1_200 - session.state.tick);
    session.stepMany(count);
    hit = session.replay.find((event) => event.type === "session-structure-deployed" &&
      event.side === "north" && event.materialization?.cardId === "aether-well") ?? null;
    if (hit !== null) break;
  }
  const decision = session.replay.find((event) => event.type === "opponent-decision" &&
    event.proposal?.cardId === "aether-well") ?? null;
  const committed = session.replay.find((event) => event.type === "session-structure-deployed" &&
    event.side === "north" && event.route?.cardId === "aether-well") ?? hit;
  const record = {
    seed,
    initial,
    tick: session.state.tick,
    terminal: session.state.terminal,
    naturalDecision: decision,
    naturalDeployment: committed,
    replayTailTypes: session.replay.slice(-8).map(({ type }) => type),
  };
  search.push(record);
  if (committed !== null) {
    found = record;
    break;
  }
}
console.log(JSON.stringify({ deck, editError, rlError, search, found }, null, 2));
