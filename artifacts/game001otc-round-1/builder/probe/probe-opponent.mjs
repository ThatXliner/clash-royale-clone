import { DeckCycle } from "../../../src/sim/deck.js";
import { createPlayableRoster, createPlayableRosterQuestionRecords } from "../../../src/content/playable-roster.js";
import { OpponentBattleRuntime } from "../../../src/sim/game-opponent.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const roster = createPlayableRoster();
const deck = roster.map(({ id }) => id);
const briar = roster.find(({ id }) => id === "briar-band");
let seed;
for (let candidate = 0; candidate < 10_000; candidate += 1) {
  if (new DeckCycle({ deck, seed: candidate }).state.hand.includes("briar-band")) {
    seed = candidate;
    break;
  }
}
if (seed === undefined) throw new Error("No bounded Briar Band opening-hand seed found");

function capture(point) {
  const battleSetup = canonical({ initialWindupTicks: { central: 0, lane: 0 },
    questions: createPlayableRosterQuestionRecords(), roster });
  const rosterWitness = canonical({ questions: createPlayableRosterQuestionRecords(), roster });
  const runtime = new OpponentBattleRuntime(canonical({
    battleSetup,
    deck,
    legalNorthDeployments: [{ cardId: "briar-band", point }],
    rosterWitness,
    seed,
    startingElixir: { north: 10, south: 5 },
    thinkIntervalTicks: 1,
    thinkOffsetTicks: 0,
  }));
  const state = () => {
    const snapshot = runtime.state;
    const pending = Object.fromEntries(Object.entries(snapshot.battle)
      .filter(([key]) => key.toLowerCase().includes("pending")));
    return {
      tick: snapshot.tick,
      briarUnits: snapshot.battle.units.filter(({ cardId }) => cardId === "briar-band")
        .map(({ id, archetypeId, memberIndex, side }) => ({ id, archetypeId, memberIndex, side })),
      pending,
      deck: snapshot.deck,
      northElixir: snapshot.elixir.sides.north.amount,
    };
  };
  const initialEvents = runtime.step(0);
  const commit = initialEvents.find(({ type }) => type === "opponent-deployment-committed");
  const deployment = initialEvents.find(({ type }) => type === "deployed");
  const boundaries = [];
  for (const sourceTick of [6, 12, 18, 24, 30]) {
    const events = [];
    for (let index = 0; index < 6; index += 1) events.push(...runtime.stepMany(1));
    boundaries.push({ sourceTick, state: state(), events });
  }
  return {
    point,
    briarContract: {
      count: briar.count,
      entities: briar.entities.map(({ archetypeId, count, sourceConfidencePolicy }) => ({
        archetypeId, count,
        deploymentInterval: sourceConfidencePolicy?.deploymentInterval ?? null,
      })),
    },
    seed,
    initialEvents,
    initialState: state(),
    committedDeployment: commit,
    reservedEntityIds: deployment.entityIds,
    boundaries,
    finalReplay: runtime.replay,
    finalState: state(),
  };
}

process.stdout.write(`${JSON.stringify({ node: process.version, cases: [
  capture({ x: 3_500, y: 17_500 }),
  capture({ x: 14_500, y: 17_500 }),
]}, null, 2)}\n`);
