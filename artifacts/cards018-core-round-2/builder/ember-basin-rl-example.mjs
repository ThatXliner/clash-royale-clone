import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRLEnvironment, RLEnvironment } from "../../../src/rl/environment.js";

const deck = [
  "ember-basin", "squall-orb", "coilblade", "mossguard",
  "copperskiff", "skymaul", "brassbolt", "reedsting",
];
const env = createRLEnvironment({ deck, seed: 1, strideTicks: 1, horizonTicks: 120 });
const initial = env.reset();
const actionSpace = env.actionSpace();
const checks = [];

function check(condition, label) {
  if (!condition) throw new Error(label);
  checks.push(label);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

check(initial.version === 2 && actionSpace.version === 2,
  "observation and action space use schema version 2");
check(actionSpace.actionCount === 2_305 && actionSpace.actions.length === 2_305 &&
  initial.actionMask.length === 2_305,
  "the existing finite action catalogue and mask size are unchanged");

const slot = initial.hand.indexOf("ember-basin");
const action = actionSpace.actions.find((candidate) =>
  candidate.slot === slot && candidate.point.x === 3_500 && candidate.point.y === 14_500);
check(slot >= 0 && action !== undefined && initial.actionMask[action.id] === true,
  "the mixed deck exposes a legal Ember Basin deployment");

const transition = env.step(action.id);
const observation = transition.observation;
const basin = observation.structures.find((structure) =>
  structure.cardId === "ember-basin");
check(transition.reward === 0 && !transition.terminated && !transition.truncated,
  "a nonterminal deployment receives zero sparse reward");
check(basin !== undefined && basin.alive && basin.owner === "south" &&
  Number.isSafeInteger(basin.hitpoints) && basin.hitpoints > 0 &&
  basin.hitpoints <= basin.maxHitpoints,
  "the public structure record reports its live owner and hitpoints");
check(basin.layer === "ground" && basin.lifetime.elapsedTicks === 1 &&
  basin.lifetime.remainingTicks + basin.lifetime.elapsedTicks === basin.lifetime.totalTicks,
  "the structure record reports its layer and lifetime counters");
check(basin.lifetime.question.disposition === "question" &&
  basin.lifetime.question.authoritative === false &&
  basin.policy.disposition === "question" && basin.policy.confidence === "unverified",
  "the unverified lifetime and profile receipts remain explicit questions");
check(basin.attackState !== null && typeof basin.attackState.phase === "string" &&
  Number.isSafeInteger(basin.attackState.sequence),
  "the public structure record includes current attack-cycle state");
check(sameJson(JSON.parse(JSON.stringify(observation)), observation),
  "the observation is detached JSON data");

const pristineObservation = env.observe();
observation.structures[0].position.x = -1;
check(env.observe().structures[0].position.x === pristineObservation.structures[0].position.x,
  "mutating an observation does not mutate the live session");

const checkpoint = env.serialize();
check(JSON.parse(checkpoint).version === 2,
  "serialized checkpoints carry version 2");
const restored = RLEnvironment.restore(checkpoint);
check(restored.serialize() === checkpoint && sameJson(restored.observe(), pristineObservation),
  "restore reproduces the exact checkpoint and structure observation");
const next = env.step(0);
const replay = restored.step(0);
check(sameJson(replay, next) && restored.serialize() === env.serialize(),
  "restore continues with identical future observation, reward, and bytes");

const oldCheckpoint = JSON.stringify({ ...JSON.parse(checkpoint), version: 1 });
let rejectedVersionOne = false;
try {
  RLEnvironment.restore(oldCheckpoint);
} catch (error) {
  rejectedVersionOne = error instanceof TypeError &&
    error.message === "serialized environment has an invalid shape or version";
}
check(rejectedVersionOne, "version-1 checkpoints are rejected without migration");

const result = {
  candidateCommit: "d20938fad64bfcf93fce48c08de54c2d5ba854bf",
  deck,
  checks,
  actionId: action.id,
  observationVersion: initial.version,
  actionSpaceVersion: actionSpace.version,
  actionCount: actionSpace.actionCount,
  openingHand: initial.hand,
  structure: {
    id: pristineObservation.structures[0].id,
    cardId: pristineObservation.structures[0].cardId,
    alive: pristineObservation.structures[0].alive,
    hitpoints: pristineObservation.structures[0].hitpoints,
    maxHitpoints: pristineObservation.structures[0].maxHitpoints,
    owner: pristineObservation.structures[0].owner,
    layer: pristineObservation.structures[0].layer,
    lifetime: pristineObservation.structures[0].lifetime,
    attackState: pristineObservation.structures[0].attackState,
    policyDisposition: pristineObservation.structures[0].policy.disposition,
  },
  checkpointVersion: JSON.parse(checkpoint).version,
  firstReward: transition.reward,
  restoredContinuationReward: replay.reward,
  versionOneCheckpointRejected: rejectedVersionOne,
};
writeFileSync(fileURLToPath(new URL("./example-result.json", import.meta.url)),
  `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`TAP version 13\n${checks.map((label, index) =>
  `ok ${index + 1} - ${label}`).join("\n")}\n1..${checks.length}\n# tests ${checks.length}\n# pass ${checks.length}\n# fail 0\n`);
