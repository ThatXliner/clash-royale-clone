import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function buriedPolicyQuestions(records) {
  return Object.fromEntries([
    "hiddenInitialPolicy",
    "hiddenReconcealPolicy",
    "hiddenRevealAttackBoundary",
  ].map((key) => [key, records[key]]));
}
function changeCheckpointPolicy(checkpoint, change) {
  const wrapper = JSON.parse(checkpoint);
  const session = JSON.parse(wrapper.session);
  for (const key of ["battleSetup", "rosterWitness"]) {
    const witness = JSON.parse(session.setup[key]);
    const card = witness.roster.find(({ id }) => id === "buried-coil");
    assert.ok(card?.buildingRuntime?.policy);
    change(card.buildingRuntime.policy);
    session.setup[key] = canonical(witness);
  }
  wrapper.session = canonical(session);
  return canonical(wrapper);
}
function changeAdmissionSetup(setupBytes, change) {
  const setup = JSON.parse(setupBytes);
  const battle = JSON.parse(setup.battleSetup);
  const card = battle.roster.find(({ id }) => id === "buried-coil");
  assert.ok(card?.buildingRuntime?.policy);
  change(card.buildingRuntime.policy);
  setup.battleSetup = canonical(battle);
  const witness = JSON.parse(setup.rosterWitness);
  change(witness.roster.find(({ id }) => id === "buried-coil").buildingRuntime.policy);
  setup.rosterWitness = canonical(witness);
  return canonical(setup);
}

const cwd = process.cwd();
const { createRLEnvironment, RLEnvironment } = await import(pathToFileURL(`${cwd}/src/rl/environment.js`));
const { createDefensiveBuildingQuestionRecords } = await import(pathToFileURL(`${cwd}/src/content/cards/buildings-defensive.js`));
const { EDITABLE_DECK_CARD_IDS } = await import(pathToFileURL(`${cwd}/src/content/session-troop-roster.js`));
const { createEditableGameSessionSetup } = await import(pathToFileURL(`${cwd}/src/content/editable-deck.js`));
const { GameSession } = await import(pathToFileURL(`${cwd}/src/sim/game-session.js`));

const deck = ["buried-coil", "mossguard", "duskwing-trio", "coilblade",
  "copperskiff", "skymaul", "brassbolt", "reedsting"];
const records = createDefensiveBuildingQuestionRecords();
const expectedQuestions = buriedPolicyQuestions(records);
for (const question of Object.values(expectedQuestions)) {
  assert.deepEqual({ authoritative: question.authoritative, confidence: question.confidence,
    disposition: question.disposition }, {
    authoritative: false, confidence: "unverified", disposition: "question",
  });
}

const env = createRLEnvironment({ deck, seed: 1, strideTicks: 1, horizonTicks: 1_200 });
const initial = env.observe();
const slot = initial.hand.indexOf("buried-coil");
assert.notEqual(slot, -1);
const action = env.actionSpace().actions.find(({ point, slot: actionSlot }) =>
  actionSlot === slot && point.x === 3_500 && point.y === 9_500);
assert.ok(action && initial.actionMask[action.id]);
let observation = env.step(action.id).observation;
let structure = observation.structures.find(({ cardId, owner }) =>
  cardId === "buried-coil" && owner === "south");
assert.equal(structure.hidden, true);
assert.equal(structure.targetable, false);
assert.deepEqual(structure.hiddenPolicyQuestions, expectedQuestions);
const initialHiddenTick = observation.tick;
let reveal = null;
for (let count = 0; count < 300 && reveal === null; count += 1) {
  observation = env.step(0).observation;
  structure = observation.structures.find(({ id }) => id === structure.id);
  if (!structure.hidden) reveal = { tick: observation.tick, structure: structuredClone(structure) };
}
assert.ok(reveal, "seeded opposing runtime must trigger actual reveal");
assert.equal(reveal.structure.targetable, true);
assert.ok(Number.isSafeInteger(reveal.structure.attackState.targetId));
assert.deepEqual(reveal.structure.hiddenPolicyQuestions, expectedQuestions);

const revealCheckpoint = env.serialize();
const rejected = [];
for (const [label, mutate] of [
  ["missing receipt field", (policy) => { delete policy.corpusFields.mode; }],
  ["forged confidence", (policy) => { policy.corpusFields.damage.authoritative = true; }],
  ["unclosed receipt field", (policy) => { policy.extraHiddenClaim = true; }],
]) {
  assert.throws(() => RLEnvironment.restore(changeCheckpointPolicy(revealCheckpoint, mutate)),
    /canonical session-card receipt/u);
  rejected.push(label);
}
const restored = RLEnvironment.restore(revealCheckpoint);
const restoredCheckpointByteExact = restored.serialize() === revealCheckpoint;
assert.equal(restoredCheckpointByteExact, true);
assert.deepEqual(restored.observe(), observation);
let reconceal = null;
for (let count = 0; count < 180 && reconceal === null; count += 1) {
  const originalNext = env.step(0);
  const restoredNext = restored.step(0);
  assert.deepEqual(restoredNext, originalNext);
  observation = originalNext.observation;
  structure = observation.structures.find(({ id }) => id === structure.id);
  if (structure.hidden) reconceal = { tick: observation.tick, structure: structuredClone(structure) };
}
assert.ok(reconceal, "actual opposing target departure must cause reconcealment");
assert.equal(reconceal.structure.targetable, false);
assert.equal(reconceal.structure.attackState.targetId, null);
assert.deepEqual(reconceal.structure.hiddenPolicyQuestions, expectedQuestions);

const validSetup = createEditableGameSessionSetup(deck, 1);
const admissionRejected = [];
for (const [label, mutate] of [
  ["missing receipt field", (policy) => { delete policy.corpusFields.mode; }],
  ["forged confidence", (policy) => { policy.corpusFields.damage.authoritative = true; }],
  ["unclosed receipt field", (policy) => { policy.extraHiddenClaim = true; }],
]) {
  assert.throws(() => new GameSession(changeAdmissionSetup(validSetup, mutate)),
    /canonical session-card receipt/u);
  admissionRejected.push(label);
}

console.log(JSON.stringify({
  seed: 1,
  deck,
  initialHiddenTick,
  revealTick: reveal.tick,
  revealState: {
    hidden: reveal.structure.hidden,
    targetable: reveal.structure.targetable,
    attackPhase: reveal.structure.attackState.phase,
    nextAttackTick: reveal.structure.attackState.nextAttackTick,
    targetId: reveal.structure.attackState.targetId,
  },
  reconcealTick: reconceal.tick,
  restoredCheckpointByteExact,
  branchContinuationByteExact: env.serialize() === restored.serialize(),
  restoreContinuationComparedEveryTick: true,
  restoreRejected: rejected,
  admissionRejected,
  questionReceipts: Object.values(expectedQuestions),
  gameSessionForkCalled: false,
}));
