import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const archiveRoot = resolve(process.argv[2]);
const outputPath = process.argv[3] ? resolve(process.argv[3]) : null;
const importFromArchive = (path) => import(pathToFileURL(join(archiveRoot, path)).href);
const api = await importFromArchive("src/rl/environment.js");
const decks = await importFromArchive("src/content/editable-deck.js");
const troopIds = await importFromArchive("src/content/session-troop-roster.js");

const deck = [
  "ember-basin", "squall-orb", "coilblade", "mossguard",
  "copperskiff", "skymaul", "brassbolt", "reedsting",
];
const results = [];
let failures = 0;

function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    failures += 1;
    results.push({ name, ok: false, error: error.message });
  }
}

assert.equal(troopIds.EDITABLE_DECK_CARD_IDS.length, 17);
assert.equal(decks.EDITABLE_MIXED_DECK_CARD_IDS.length, 19);
const admitted = new Set(decks.EDITABLE_MIXED_DECK_CARD_IDS);
assert.ok(admitted.has("squall-orb"));
assert.ok(admitted.has("ember-basin"));
assert.ok(deck.every((id) => admitted.has(id)));
assert.equal(deck.length, 8);
assert.equal(new Set(deck).size, 8);

const env = api.createRLEnvironment({
  deck,
  seed: 1,
  strideTicks: 1,
  horizonTicks: 120,
});
const initial = env.reset();
const space = env.actionSpace();
const slot = initial.hand.indexOf("ember-basin");
const action = space.actions.find((candidate) =>
  candidate.slot === slot && candidate.point.x === 3_500 && candidate.point.y === 14_500);

check("editable roster is 17 troops plus Squall Orb and Ember Basin (19 IDs)", () => {
  assert.equal(troopIds.EDITABLE_DECK_CARD_IDS.length, 17);
  assert.equal(decks.EDITABLE_MIXED_DECK_CARD_IDS.length, 19);
});
check("documented custom mixed deck has eight distinct admitted IDs", () => {
  assert.equal(deck.length, 8);
  assert.equal(new Set(deck).size, 8);
  assert.ok(deck.every((id) => admitted.has(id)));
});
check("reset after custom configuration retains the mixed deck and exposes Ember", () => {
  assert.equal(initial.version, 2);
  assert.equal(initial.hand[slot], "ember-basin");
  assert.equal(initial.status, "running");
});
check("version-2 action space keeps the finite 2,305-action catalogue", () => {
  assert.equal(api.RL_ENVIRONMENT_VERSION, 2);
  assert.equal(api.RL_ACTION_COUNT, 2_305);
  assert.equal(space.version, 2);
  assert.equal(space.actionCount, 2_305);
  assert.equal(space.actions.length, 2_305);
  assert.deepEqual(space.actions[0], { id: 0, type: "wait" });
  assert.equal(space.actions.every((candidate, id) => candidate.id === id), true);
  assert.equal(initial.actionMask.length, 2_305);
});
check("documented tile and slot produce a legal Ember deployment action", () => {
  assert.equal(slot, 0);
  assert.equal(action.id, 256);
  assert.equal(action.type, "deploy");
  assert.deepEqual(action.point, { x: 3_500, y: 14_500 });
  assert.equal(initial.actionMask[action.id], true);
});

const transition = env.step(action.id);
const after = transition.observation;
const structure = after.structures.find((record) => record.cardId === "ember-basin");
check("one-tick deployment spends cost and advances the shared card cycle", () => {
  assert.equal(initial.tick, 0);
  assert.equal(after.tick, 1);
  assert.equal(initial.elixir, 10);
  assert.equal(after.elixir, 6);
  assert.deepEqual(initial.hand, ["ember-basin", "copperskiff", "skymaul", "coilblade"]);
  assert.deepEqual(after.hand, ["squall-orb", "copperskiff", "skymaul", "coilblade"]);
  assert.equal(initial.next, "squall-orb");
  assert.equal(after.next, "mossguard");
  assert.equal(transition.reward, 0);
  assert.equal(transition.terminated, false);
  assert.equal(transition.truncated, false);
});
check("v2 structure observation matches documented public fields and values", () => {
  assert.equal(after.version, 2);
  assert.deepEqual(Object.keys(structure).sort(), [
    "alive", "attackState", "cardId", "deathCause", "hitpoints", "id", "layer",
    "lifetime", "maxHitpoints", "owner", "policy", "position", "targetKey",
    "targetMode", "targetable",
  ]);
  assert.equal(structure.id, 2);
  assert.equal(structure.cardId, "ember-basin");
  assert.equal(structure.owner, "south");
  assert.deepEqual(structure.position, { x: 3_500, y: 14_500 });
  assert.equal(structure.layer, "ground");
  assert.equal(structure.alive, true);
  assert.equal(structure.deathCause, null);
  assert.equal(structure.hitpoints, 1_356);
  assert.equal(structure.maxHitpoints, 1_356);
  assert.equal(structure.targetable, true);
  assert.equal(structure.targetKey, "unit:1");
  assert.equal(structure.targetMode, "ground");
  assert.deepEqual(Object.keys(structure.lifetime).sort(), [
    "elapsedTicks", "question", "remainingTicks", "totalTicks",
  ]);
  assert.deepEqual(structure.lifetime, {
    elapsedTicks: 1,
    remainingTicks: 1_799,
    totalTicks: 1_800,
    question: {
      authoritative: false,
      confidence: "unverified",
      disposition: "question",
      key: "lifetimeTicks",
      source: "pre-evolutions-building-corpus-and-unsourced-policy-fixture",
      value: 1_800,
    },
  });
  assert.deepEqual(Object.keys(structure.attackState).sort(), [
    "nextAttackTick", "phase", "sequence", "targetId",
  ]);
  assert.deepEqual(structure.attackState, {
    nextAttackTick: null,
    phase: "deploying",
    sequence: 0,
    targetId: null,
  });
  assert.equal(structure.policy.disposition, "question");
  assert.equal(structure.policy.confidence, "unverified");
});
check("structure data is detached with the observation", () => {
  const original = env.observe();
  const expected = structuredClone(original);
  const changed = env.observe();
  changed.structures[0].position.x = -1;
  changed.structures[0].lifetime.question.disposition = "authoritative";
  changed.structures[0].policy.source = "mutated";
  assert.deepEqual(env.observe(), expected);
});

const checkpoint = env.serialize();
const checkpointValue = JSON.parse(checkpoint);
const restored = api.RLEnvironment.restore(checkpoint);
const restoredAtCheckpoint = restored.observe();
const next = env.step(0);
const replay = restored.step(0);
check("version-2 checkpoints restore the structure observation and continuation", () => {
  assert.equal(checkpointValue.version, 2);
  assert.deepEqual(restoredAtCheckpoint, after);
  assert.deepEqual(replay, next);
  assert.equal(restored.serialize(), env.serialize());
});
check("version-1 checkpoints are rejected without migration", () => {
  const versionOne = JSON.stringify({ ...checkpointValue, version: 1 });
  assert.throws(() => api.RLEnvironment.restore(versionOne), {
    name: "TypeError",
    message: "serialized environment has an invalid shape or version",
  });
});

const deadEnv = api.createRLEnvironment({
  deck,
  seed: 1,
  strideTicks: 1_800,
  horizonTicks: 1_801,
});
const deadInitial = deadEnv.reset();
const deadSlot = deadInitial.hand.indexOf("ember-basin");
const deadAction = deadEnv.actionSpace().actions.find((candidate) =>
  candidate.slot === deadSlot && candidate.point.x === 3_500 && candidate.point.y === 14_500);
const deadObservation = deadEnv.step(deadAction.id).observation;
const deadStructure = deadObservation.structures.find((record) => record.id === 2);
check("dead structure remains observable with its death cause", () => {
  assert.ok(deadStructure);
  assert.equal(deadStructure.alive, false);
  assert.equal(deadStructure.hitpoints, 0);
  assert.equal(typeof deadStructure.deathCause, "string");
});
check("structure list is sorted by numeric entity ID", () => {
  const ids = deadObservation.structures.map(({ id }) => id);
  assert.deepEqual(ids, [...ids].sort((left, right) => left - right));
});

const values = {
  archiveCommit: "5b26c1dee75cf931cef7d9c93aad834115e7507f",
  cardIds: {
    editableTroops: troopIds.EDITABLE_DECK_CARD_IDS.length,
    mixedAllowed: decks.EDITABLE_MIXED_DECK_CARD_IDS.length,
  },
  deck,
  actionSpace: {
    observationVersion: initial.version,
    actionSpaceVersion: space.version,
    actionCount: space.actionCount,
    legalActionId: action.id,
  },
  costCycle: {
    before: { tick: initial.tick, elixir: initial.elixir, hand: initial.hand, next: initial.next },
    after: { tick: after.tick, elixir: after.elixir, hand: after.hand, next: after.next },
    reward: transition.reward,
  },
  liveStructure: structure,
  checkpointVersion: checkpointValue.version,
  futureContinuationExact: JSON.stringify(next) === JSON.stringify(replay),
  versionOneRejected: (() => {
    try {
      api.RLEnvironment.restore(JSON.stringify({ ...checkpointValue, version: 1 }));
      return false;
    } catch (error) {
      return error instanceof TypeError &&
        error.message === "serialized environment has an invalid shape or version";
    }
  })(),
  deadStructure: deadStructure ?? null,
  sortedStructureIds: deadObservation.structures.map(({ id }) => id),
};

console.log("TAP version 13");
for (let index = 0; index < results.length; index += 1) {
  const result = results[index];
  console.log(`${result.ok ? "ok" : "not ok"} ${index + 1} - ${result.name}`);
  if (!result.ok) console.log(`# ${result.error}`);
}
console.log(`1..${results.length}`);
console.log(`# tests ${results.length}`);
console.log(`# pass ${results.length - failures}`);
console.log(`# fail ${failures}`);
if (outputPath) writeFileSync(outputPath, `${JSON.stringify(values, null, 2)}\n`);
if (failures) process.exitCode = 1;
