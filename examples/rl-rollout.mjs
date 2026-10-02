import { performance } from "node:perf_hooks";
import { createRLEnvironment } from "../src/rl/environment.js";

const env = createRLEnvironment({
  seed: "repeatable-example-v1",
  strideTicks: 30,
  horizonTicks: 120,
});
const started = performance.now();
const trace = [];
let observation = env.reset();
let steps = 0;
let reward = 0;

while (observation.status === "running") {
  const deploy = observation.actionMask.findIndex((legal, id) => id > 0 && legal);
  const actionId = steps === 0 && deploy !== -1 ? deploy : 0;
  const transition = env.step(actionId);
  observation = transition.observation;
  reward += transition.reward;
  trace.push({ actionId, status: observation.status, tick: observation.tick });
  steps += 1;
}

const elapsedSeconds = (performance.now() - started) / 1_000;
const ticksAdvanced = trace.at(-1)?.tick ?? 0;
process.stdout.write(`${JSON.stringify({
  benchmark: {
    elapsedSeconds,
    stepsPerSecond: steps / elapsedSeconds,
    ticksPerSecond: ticksAdvanced / elapsedSeconds,
  },
  reward,
  status: observation.status,
  trace,
})}\n`);
