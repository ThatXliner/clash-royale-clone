import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(process.argv[2] ?? "");
if (!root) throw new TypeError("provide the extracted candidate root");
const importFromRoot = (file) => import(pathToFileURL(join(root, file)));
const [deckModule, editableModule, sessionModule, deckCycleModule, rlModule] = await Promise.all([
  importFromRoot("src/content/session-troop-roster.js"),
  importFromRoot("src/content/editable-deck.js"),
  importFromRoot("src/sim/game-session.js"),
  importFromRoot("src/sim/deck.js"),
  importFromRoot("src/rl/environment.js"),
]);
const { EDITABLE_DECK_CARD_IDS, createSessionTroopWitnessQuestions } = deckModule;
const { createEditableGameSessionSetup } = editableModule;
const { GameSession } = sessionModule;
const { DeckCycle } = deckCycleModule;
const { createRLEnvironment, RL_ENVIRONMENT_VERSION } = rlModule;
const deck = ["ember-basin", ...EDITABLE_DECK_CARD_IDS.slice(0, 7)];

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function rejects(mutator) {
  const input = JSON.parse(createEditableGameSessionSetup(deck, 4));
  const battleSetup = JSON.parse(input.battleSetup);
  mutator(battleSetup);
  input.battleSetup = canonical(battleSetup);
  input.rosterWitness = canonical({ questions: battleSetup.questions, roster: battleSetup.roster });
  try {
    new GameSession(canonical(input));
    return { rejected: false, message: "accepted hostile editable setup" };
  } catch (error) {
    return { rejected: true, message: String(error.message) };
  }
}

const troopDeck = ["briar-band", ...EDITABLE_DECK_CARD_IDS
  .filter((id) => id !== "briar-band").slice(0, 7)];
const mixedSetup = JSON.parse(createEditableGameSessionSetup(["ember-basin", ...troopDeck.slice(0, 7)], 4));
const mixedBattle = JSON.parse(mixedSetup.battleSetup);
const briarConfidenceSuffixes = new Set([
  "count", "damage", "deploy-time-ticks", "first-hit-ticks", "hit-speed-ticks",
  "hitpoints", "movement-millitiles-per-second", "range-millitiles",
  "sight-range-millitiles", "target-mode",
]);
const isBriarConfidenceKey = ({ key }) =>
  (key.startsWith("briar-runner.") || key.startsWith("briar-darter.")) &&
  briarConfidenceSuffixes.has(key.slice(key.indexOf(".") + 1));
const briarReferences = createSessionTroopWitnessQuestions("briar-band")
  .filter(isBriarConfidenceKey);
const briarActual = mixedBattle.questions.filter(({ key }) =>
  isBriarConfidenceKey({ key }));
assert.equal(briarReferences.length, 20);
assert.deepEqual(briarActual, briarReferences);

const provenance = [
  rejects((battle) => {
    const ember = battle.roster.find(({ id }) => id === "ember-basin");
    ember.buildingRuntime.policy.corpusFields.damage.source = "invented-authoritative-source";
  }),
  rejects((battle) => {
    const ember = battle.roster.find(({ id }) => id === "ember-basin");
    ember.buildingRuntime.policy.corpusFields.damage.confidence = "high";
  }),
  rejects((battle) => {
    const ember = battle.roster.find(({ id }) => id === "ember-basin");
    ember.buildingRuntime.lifetimeTicks += 1;
  }),
  rejects((battle) => {
    battle.questions.pop();
  }),
];
assert.ok(provenance.every(({ rejected }) => rejected), JSON.stringify(provenance));

let seed = 0;
while (!new DeckCycle({ deck, seed: `${seed}:south` }).state.hand.includes("ember-basin")) seed += 1;
const splashEnv = createRLEnvironment({ deck, seed, strideTicks: 1, horizonTicks: 1_800 });
let splashObservation = splashEnv.observe();
const splashSlot = splashObservation.hand.indexOf("ember-basin");
const splashAction = splashEnv.actionSpace().actions.find(({ point, slot: actionSlot }) =>
  actionSlot === splashSlot && point.x === 3_500 && point.y === 14_500);
assert.ok(splashAction && splashObservation.actionMask[splashAction.id]);
splashObservation = splashEnv.step(splashAction.id).observation;
while (splashObservation.tick < 120) splashObservation = splashEnv.step(0).observation;
const damagedStructure = splashObservation.structures[0];
const damagedSession = GameSession.restore(JSON.parse(splashEnv.serialize()).session);
const damageEvent = damagedSession.replay.find(({ buildingId, type }) =>
  buildingId === damagedStructure.id && type === "structure-damaged");
const attacker = splashObservation.units.find(({ id }) => id === damageEvent?.sourceId);
while (splashObservation.tick < 127) splashObservation = splashEnv.step(0).observation;
const inFlightSession = GameSession.restore(JSON.parse(splashEnv.serialize()).session);
const splashContacts = inFlightSession.state.battle.pendingBuildingHits.map((hit) => ({
  applyTick: hit.applyTick,
  amount: hit.amount,
  origin: hit.origin,
  sourceId: hit.sourceId,
  targetId: hit.targetId,
}));
assert.deepEqual(splashContacts.map(({ targetId }) => targetId), [3, 4, 5]);
const env = createRLEnvironment({ deck, seed, strideTicks: 1_800, horizonTicks: 1_801 });
const initial = env.observe();
const slot = initial.hand.indexOf("ember-basin");
const action = env.actionSpace().actions.find(({ point, slot: actionSlot }) =>
  actionSlot === slot && point.x === 3_500 && point.y === 14_500);
assert.ok(action && initial.actionMask[action.id]);
const terminalLifetime = env.step(action.id).observation;
assert.equal(terminalLifetime.tick, 1_800);
assert.equal(terminalLifetime.structures.length, 1);
assert.equal(terminalLifetime.structures[0].alive, false);
assert.equal(terminalLifetime.structures[0].lifetime.remainingTicks, 0);
assert.equal(terminalLifetime.structures[0].id, 2);

const checkpoint = JSON.parse(env.serialize());
const output = {
  schema: {
    exportedVersion: RL_ENVIRONMENT_VERSION,
    observationVersion: terminalLifetime.version,
    hasStructuresField: Array.isArray(terminalLifetime.structures),
    checkpointVersion: checkpoint.version,
  },
  briarQuestionClosure: {
    sourceRecords: briarReferences.length,
    setupRecords: briarActual.length,
    allRecordsExact: true,
    keys: briarActual.map(({ key }) => key),
  },
  hostileProvenance: provenance,
  liveSplash: {
    damagedAtTick: 120,
    hp: damagedStructure.hitpoints,
    maxHitpoints: damagedStructure.maxHitpoints,
    damageEvent: damageEvent && {
      amountApplied: damageEvent.amountApplied,
      origin: damageEvent.origin,
      sourceId: damageEvent.sourceId,
    },
    attacker: attacker && { id: attacker.id, layer: attacker.layer, side: attacker.side },
    tick127AttackState: splashObservation.structures[0].attackState,
    selectedTarget: splashObservation.units.find(({ id }) =>
      id === splashObservation.structures[0].attackState.targetId),
    pendingContactsAtTick127: splashContacts,
  },
  deadStructureObservation: terminalLifetime.structures[0],
};
console.log(JSON.stringify(output, null, 2));
