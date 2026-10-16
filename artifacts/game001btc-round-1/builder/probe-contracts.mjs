import { LiveBattle, getLiveBattlePlayableCardIds, parseLiveBattleSetup } from "../../../src/sim/live-battle.js";
import { createPlayableRoster, createPlayableRosterQuestionRecords } from "../../../src/content/playable-roster.js";

const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const rawSetup = () => ({ initialWindupTicks: { central: 0, lane: 0 }, questions: structuredClone(createPlayableRosterQuestionRecords()), roster: structuredClone(createPlayableRoster()) });
const setup = () => parseLiveBattleSetup(canonicalJson(rawSetup()));
const outcome = (mutate, mode = "parse") => {
  const value = rawSetup();
  const note = mutate(value);
  try {
    if (mode === "restore") {
      const battle = new LiveBattle(setup());
      const parsed = JSON.parse(battle.serialize());
      const restoreValue = structuredClone(parsed);
      mutate(restoreValue.setup, { snapshot: true });
      const restored = LiveBattle.restore(canonicalJson(restoreValue));
      return { accepted: true, restoredSource: restoreValue.setup.questions.find((q) => q.key === note?.key)?.source ?? null, restoredSnapshotEqual: restored.serialize() === canonicalJson(restoreValue) };
    }
    parseLiveBattleSetup(canonicalJson(value));
    return { accepted: true, note: note ?? null };
  } catch (error) {
    return { accepted: false, errorName: error.name, message: error.message, note: note ?? null };
  }
};

const mutations = [];
mutations.push(["missing-tail-question", (value) => { const record = value.questions.pop(); return { removedKey: record.key, removedSource: record.source }; }]);
mutations.push(["added-unreferenced-question", (value) => { value.questions.push({ ...value.questions[0], key: "unused.body-radius-millitiles" }); return { addedKey: value.questions.at(-1).key }; }]);
mutations.push(["duplicate-question", (value) => { value.questions.push(structuredClone(value.questions[0])); return { duplicatedKey: value.questions.at(-1).key }; }]);
mutations.push(["stale-first-question-key", (value) => { const old = value.questions[0].key; value.questions[0].key = "stale.body-radius-millitiles"; return { old, current: value.questions[0].key }; }]);
mutations.push(["stale-first-question-confidence", (value) => { const key = value.questions[0].key; value.questions[0].confidence = "stale"; return { key }; }]);
mutations.push(["different-generic-question-source", (value) => { const record = value.questions[0]; const old = record.source; record.source = "different-source"; return { key: record.key, old, current: record.source }; }]);
mutations.push(["different-source-confidence-source", (value) => { const record = value.questions.find(({ key }) => key === "briar-runner.count"); const old = record.source; record.source = "different-source"; return { key: record.key, old, current: record.source }; }]);
mutations.push(["empty-generic-question-source", (value) => { const record = value.questions[0]; const key = record.key; record.source = ""; return { key }; }]);
for (const bad of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) mutations.push([`bad-question-value-${String(bad)}`, (value) => { const record = value.questions[0]; const key = record.key; record.value = bad; return { key, value: bad }; }]);
const questionMatrix = Object.fromEntries(mutations.map(([name, mutate]) => [name, outcome(mutate)]));
const firstKey = rawSetup().questions[0].key;
questionMatrix.restoreGenericPairedSource = outcome((setupValue, context = {}) => {
  const record = setupValue.questions.find(({ key }) => key === firstKey);
  record.source = "paired-\uD83D\uDE00";
  return { key: record.key };
}, "restore");
questionMatrix.restoreSourceClaimPairedSource = outcome((setupValue) => {
  const record = setupValue.questions.find(({ key }) => key === "briar-runner.count");
  record.source = "paired-\uD83D\uDE00";
  return { key: record.key };
}, "restore");
questionMatrix.restoreLoneSurrogateSource = outcome((setupValue) => {
  const record = setupValue.questions.find(({ key }) => key === firstKey);
  record.source = "\uD800";
  return { key: record.key };
}, "restore");

const configured = setup();
const cardIds = getLiveBattlePlayableCardIds(configured);
const battle = new LiveBattle(configured);
const south = { x: 3500, y: 14500 };
const north = { x: 3500, y: 17500 };
let scheduledCount = 0;
cardIds.forEach((cardId, index) => {
  battle.scheduleDeploy(canonicalJson({ cardId, point: south, sequence: index * 2, side: "south", tick: 0 }));
  battle.scheduleDeploy(canonicalJson({ cardId, point: north, sequence: index * 2 + 1, side: "north", tick: 0 }));
  scheduledCount += 2;
});
const cardDetails = configured.roster.map((card) => ({ cardId: card.id, count: card.count, entities: card.entities.map((entity) => ({ archetypeId: entity.archetypeId, count: entity.count, deploymentInterval: entity.sourceConfidencePolicy?.deploymentInterval ?? null })) }));
const compactState = () => ({ tick: battle.state.tick, unitCount: battle.state.units.length, units: battle.state.units.map(({ id, cardId, archetypeId, side, memberIndex }) => ({ id, cardId, archetypeId, side, memberIndex })), pendingDeployments: battle.state.pendingDeployments });
const boundaryHistory = [{ sourceBoundaryTick: 0, returnedEvents: battle.step(0), state: compactState() }];
for (const boundary of [6, 12, 18, 24, 30]) {
  const returnedEvents = [];
  for (let index = 0; index < 6; index += 1) returnedEvents.push(...battle.stepMany(1));
  boundaryHistory.push({ sourceBoundaryTick: boundary, returnedEvents, state: compactState() });
}
const report = {
  node: process.version,
  sourceConfidenceClaimQuestion: rawSetup().questions.find(({ key }) => key === "briar-runner.count"),
  firstQuestion: rawSetup().questions[0],
  questionMatrix,
  deploymentProbe: { cardIds, cardDetails, scheduledCommandCount: scheduledCount, boundaryHistory },
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
