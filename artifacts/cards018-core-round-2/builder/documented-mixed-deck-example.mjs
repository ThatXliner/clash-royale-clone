import { createRLEnvironment, RLEnvironment } from "../../../src/rl/environment.js";

const deck = [
  "ember-basin", "squall-orb", "coilblade", "mossguard",
  "copperskiff", "skymaul", "brassbolt", "reedsting",
];
const env = createRLEnvironment({ deck, seed: 1, strideTicks: 1, horizonTicks: 120 });
const initial = env.reset();
const space = env.actionSpace();
if (initial.version !== 2 || space.version !== 2 || space.actionCount !== 2_305 ||
    initial.actionMask.length !== space.actionCount) {
  throw new Error("unexpected RL schema or action space");
}
const slot = initial.hand.indexOf("ember-basin");
const action = space.actions.find((candidate) =>
  candidate.slot === slot && candidate.point.x === 3_500 && candidate.point.y === 14_500);
if (slot < 0 || !action || !initial.actionMask[action.id]) {
  throw new Error("Ember Basin is not currently deployable");
}

const transition = env.step(action.id);
if (transition.reward !== 0 || transition.terminated || transition.truncated) {
  throw new Error("unexpected nonterminal transition result");
}
const basin = transition.observation.structures.find((structure) =>
  structure.cardId === "ember-basin");
console.log({
  hitpoints: basin.hitpoints,
  lifetime: basin.lifetime,
  attackState: basin.attackState,
  policy: basin.policy,
});

const checkpoint = env.serialize();
const restored = RLEnvironment.restore(checkpoint);
const next = env.step(0);
const replay = restored.step(0);
if (JSON.stringify(next) !== JSON.stringify(replay)) {
  throw new Error("restored continuation diverged");
}

const versionOne = JSON.stringify({ ...JSON.parse(checkpoint), version: 1 });
try {
  RLEnvironment.restore(versionOne);
  throw new Error("version-1 checkpoint unexpectedly restored");
} catch (error) {
  if (error.message !== "serialized environment has an invalid shape or version") throw error;
}
