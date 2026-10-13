import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { GameSession } from "../../../src/sim/game-session.js";
import {
  createEnduranceWorkloadPolicy,
  ENDURANCE_BASELINE_INTERVAL_TICKS,
  ENDURANCE_REQUIRED_TICK,
  assertEnduranceWorkloadCanContinue,
  exactEnduranceSetupBytes,
} from "../../../tests/helpers/endurance-workload.js";

const directory = new URL("./", import.meta.url);
const aggregateResultUrl = new URL(
  "../../game001gpr5-aggregate-defense/aggregate-defense-result.json", import.meta.url,
);
const aggregateSourceUrl = new URL(
  "../../game001gpr5-aggregate-defense/aggregate-defense.mjs", import.meta.url,
);
const setupSha256Expected = "306bb30da40ce7c43d6cccce8728449da90fc0e9ca7d13c81f0116ba710aec8c";
const originalResult = JSON.parse(readFileSync(aggregateResultUrl, "utf8"));

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function stateDigest(session) {
  return {
    crowns: session.state.clock.crowns,
    deck: session.state.decks.south,
    elixir: session.state.elixir.sides,
    result: session.state.clock.result,
    terminal: session.state.terminal,
    tick: session.state.tick,
    towers: session.state.battle.towers
      .map(({ hitpoints, id }) => ({ hitpoints, id }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    sessionSha256: createHash("sha256").update(session.serialize()).digest("hex"),
  };
}

function runPreflight() {
  const setupBytes = exactEnduranceSetupBytes();
  const setupSha256 = createHash("sha256").update(setupBytes).digest("hex");
  assert.equal(setupSha256, setupSha256Expected,
    "the workload uses the exact reviewed seed-zero/default-eight setup");
  const session = new GameSession(setupBytes);
  const policy = createEnduranceWorkloadPolicy();
  const decisions = [];
  let lastProgressTick = 0;

  while (session.state.tick < ENDURANCE_REQUIRED_TICK) {
    assertEnduranceWorkloadCanContinue(session, ENDURANCE_REQUIRED_TICK);
    const fromTick = session.state.tick;
    const plan = policy.plan(session);
    if (plan !== null) {
      const command = { cardId: plan.cardId, point: plan.point, slot: plan.slot,
        tick: plan.tick, commandId: decisions.length + 1, type: "deploy" };
      const admitted = session.submitPlayerCommand(canonical(command));
      assert.equal(admitted.accepted, true,
        `${plan.decision} at tick ${fromTick} is admitted by the unchanged GameSession`);
      policy.recordAcceptedPhysicalDelivery(command);
      decisions.push({ cardId: plan.cardId, decision: plan.decision,
        point: plan.point, slot: plan.slot, tick: plan.tick });
    }

    const ticksToBaseline = ENDURANCE_BASELINE_INTERVAL_TICKS -
      (fromTick % ENDURANCE_BASELINE_INTERVAL_TICKS);
    const horizon = Math.min(ENDURANCE_BASELINE_INTERVAL_TICKS,
      ENDURANCE_REQUIRED_TICK - fromTick, ticksToBaseline);
    const beforeLookAhead = session.serialize();
    const nextPlan = policy.nextPlannedAttempt(session, horizon);
    assert.equal(session.serialize(), beforeLookAhead,
      "policy look-ahead leaves the actual session bytes unchanged");
    const driveTicks = nextPlan?.ticksAhead ?? horizon;
    assert.ok(driveTicks > 0 && driveTicks <= ENDURANCE_BASELINE_INTERVAL_TICKS);
    assert.equal(driveTicks % 15, 0,
      "adaptive scheduler stops at a real 15-tick reaction boundary");
    session.stepMany(driveTicks);

    if (session.state.tick >= lastProgressTick + ENDURANCE_BASELINE_INTERVAL_TICKS) {
      lastProgressTick = Math.floor(session.state.tick / ENDURANCE_BASELINE_INTERVAL_TICKS) *
        ENDURANCE_BASELINE_INTERVAL_TICKS;
      const latest = decisions.at(-1);
      console.error(JSON.stringify({ tick: session.state.tick,
        decisionCount: decisions.length,
        emergencyCount: decisions.filter(({ decision }) =>
          decision === "overtime-last-lane-aggregate-air-intercept").length,
        lastDecision: latest?.tick ?? null }));
    }
  }

  assert.equal(session.state.tick, ENDURANCE_REQUIRED_TICK,
    "the complete, unchanged 18,000-tick requirement is reached");
  const emergencyCount = decisions.filter(({ decision }) =>
    decision === "overtime-last-lane-aggregate-air-intercept").length;
  assert.ok(emergencyCount > 0, "the state-aware overtime counter policy was exercised");
  return { decisions, emergencyCount, setupSha256, state: stateDigest(session) };
}

const final = runPreflight();
const actualAttempts = final.decisions;
const expectedAttempts = originalResult.attempts.map(({ cardId, decision, point, slot, tick }) =>
  ({ cardId, decision, point, slot, tick }));
assert.deepEqual(actualAttempts, expectedAttempts,
  "the integrated scheduler reproduces the committed aggregate policy's dynamic decisions");
assert.equal(final.state.tick, originalResult.outcome.tick);
assert.equal(final.state.terminal, originalResult.outcome.terminal);
assert.deepEqual(final.state.result, originalResult.outcome.clock.result);
assert.deepEqual(final.state.towers, [...originalResult.outcome.towers]
  .sort((left, right) => left.id.localeCompare(right.id)));

const source = readFileSync(aggregateSourceUrl);
const resultBytes = readFileSync(aggregateResultUrl);
const helperBytes = readFileSync(fileURLToPath(new URL(
  "../../../tests/helpers/endurance-workload.js", import.meta.url,
)));
const runnerBytes = readFileSync(fileURLToPath(import.meta.url));
const summary = {
  decisionCount: final.decisions.length,
  decisionsSha256: createHash("sha256").update(canonical(final.decisions)).digest("hex"),
  deterministicPolicyMatch: true,
  emergencyCount: final.emergencyCount,
  helperSha256: createHash("sha256").update(helperBytes).digest("hex"),
  outcome: final.state,
  originalAggregateResultSha256: createHash("sha256").update(resultBytes).digest("hex"),
  originalAggregateSourceSha256: createHash("sha256").update(source).digest("hex"),
  runnerSha256: createHash("sha256").update(runnerBytes).digest("hex"),
  setupBytes: exactEnduranceSetupBytes().length,
  setupSha256: final.setupSha256,
};
mkdirSync(directory, { recursive: true });
writeFileSync(new URL("offline-preflight.json", directory), `${JSON.stringify(summary, null, 2)}\n`);
writeFileSync(new URL("offline-preflight-decisions.json", directory),
  `${JSON.stringify(final.decisions, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
