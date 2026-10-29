import assert from "node:assert/strict";
import { createRLEnvironment, RLEnvironment } from "../src/rl/environment.js";

const CONFIG = {
  seed: "rl-training-loop-v1",
  strideTicks: 30,
  horizonTicks: 120,
};
const CHECKPOINT_AFTER_STEPS = 2;
const MAX_EPISODE_STEPS = 8;

function chooseAction(observation) {
  const legalDeployments = [];
  for (let actionId = 1; actionId < observation.actionMask.length; actionId += 1) {
    if (observation.actionMask[actionId]) legalDeployments.push(actionId);
  }
  if (legalDeployments.length === 0) return 0;
  const index = Math.floor(observation.tick / CONFIG.strideTicks) % legalDeployments.length;
  return legalDeployments[index];
}

function collect(env, observation, limit) {
  const samples = [];
  while (observation.status === "running" && samples.length < limit) {
    const actionId = chooseAction(observation);
    const result = env.step(actionId);
    samples.push({
      actionId,
      observation,
      reward: result.reward,
      nextObservation: result.observation,
      terminated: result.terminated,
      truncated: result.truncated,
    });
    observation = result.observation;
  }
  return { observation, samples };
}

const env = createRLEnvironment(CONFIG);
const prefix = collect(env, env.reset(), CHECKPOINT_AFTER_STEPS);
if (prefix.observation.status !== "running") {
  throw new Error("the configured checkpoint point must be inside the episode");
}

const checkpoint = env.serialize();
const restored = RLEnvironment.restore(checkpoint);
assert.deepEqual(restored.observe(), env.observe(), "restore must match the checkpoint observation");

const remainingSteps = MAX_EPISODE_STEPS - prefix.samples.length;
const continuation = collect(env, env.observe(), remainingSteps);
const replay = collect(restored, restored.observe(), remainingSteps);
assert.deepEqual(replay, continuation, "restored continuation must match every transition");
assert.equal(env.serialize(), restored.serialize(), "both branches must end at the same checkpoint");

const samples = [...prefix.samples, ...continuation.samples];
const finalObservation = continuation.observation;
if (finalObservation.status === "running") {
  throw new Error("the episode step limit must allow the configured horizon to finish");
}
const totalReward = samples.reduce((sum, sample) => sum + sample.reward, 0);
const finalSample = samples.at(-1);
const transitionTrace = samples.map((sample) => ({
  actionId: sample.actionId,
  nextTick: sample.nextObservation.tick,
  reward: sample.reward,
  terminated: sample.terminated,
  tick: sample.observation.tick,
  truncated: sample.truncated,
}));

process.stdout.write(`${JSON.stringify({
  checkpointContinuationMatched: true,
  episode: {
    reward: totalReward,
    seed: CONFIG.seed,
    steps: samples.length,
    status: finalObservation.status,
    terminated: finalSample.terminated,
    truncated: finalSample.truncated,
  },
  trainingSamples: samples.length,
  transitionTrace,
})}\n`);
