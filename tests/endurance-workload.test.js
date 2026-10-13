import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { GameSession } from "../src/sim/game-session.js";
import {
  createEnduranceWorkloadPolicy,
  ENDURANCE_BASELINE_INTERVAL_TICKS,
  ENDURANCE_REQUIRED_TICK,
  assertEnduranceWorkloadCanContinue,
  exactEnduranceSetupBytes,
  plannedSouthAttempt,
} from "./helpers/endurance-workload.js";

const TERMINAL_REPLAY = new URL(
  "../artifacts/game001gpr5-round-2/builder/derived-checkpoint-manifest.json",
  import.meta.url,
);
const AGGREGATE_SETUP_SHA256 = "306bb30da40ce7c43d6cccce8728449da90fc0e9ca7d13c81f0116ba710aec8c";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

test("the integrated workload keeps the exact setup and frozen 300-tick baseline", () => {
  const setupBytes = exactEnduranceSetupBytes();
  assert.equal(setupBytes.length, 39_641);
  assert.equal(createHash("sha256").update(setupBytes).digest("hex"), AGGREGATE_SETUP_SHA256);

  const session = new GameSession(setupBytes);
  const policy = createEnduranceWorkloadPolicy();
  assert.equal(policy.plan(session), null,
    "the reaction scheduler does not invent an opening action outside the baseline boundary");
  session.stepMany(ENDURANCE_BASELINE_INTERVAL_TICKS);

  const baseline = plannedSouthAttempt(session);
  assert.ok(baseline, "the original defensive planner has an eligible 300-tick decision");
  assert.deepEqual(policy.plan(session), { ...baseline, decision: "frozen-GH-baseline" },
    "the integrated policy preserves the original baseline card, slot, point, and tick");
  assert.deepEqual(policy.snapshot(), { emergencyDecisionTicks: [] },
    "baseline decisions do not consume the overtime emergency cooldown");
});

test("incremental preview matches accepted commands and resets cleanly at a rewind", () => {
  const session = new GameSession(exactEnduranceSetupBytes());
  const policy = createEnduranceWorkloadPolicy();
  assert.equal(policy.plan(session), null);
  session.stepMany(15);

  const beforePreview = session.serialize();
  const forecast = policy.nextPlannedAttempt(session, 300);
  assert.equal(session.serialize(), beforePreview,
    "the 15-tick reaction look-ahead advances a detached GameSession clone");
  assert.equal(forecast.ticksAhead, 285);
  assert.equal(forecast.plan.tick, 300);
  session.stepMany(forecast.ticksAhead);

  const acceptedPlan = policy.plan(session);
  assert.deepEqual(acceptedPlan, forecast.plan,
    "the live baseline decision equals the forecast at the exact boundary");
  const command = { cardId: acceptedPlan.cardId, point: acceptedPlan.point,
    slot: acceptedPlan.slot, tick: acceptedPlan.tick, commandId: 1, type: "deploy" };
  assert.equal(session.submitPlayerCommand(canonical(command)).accepted, true);
  assert.equal(policy.recordAcceptedPhysicalDelivery(command), true,
    "an accepted input is copied into the private forecast branch");

  const beforeReaction = session.serialize();
  assert.equal(policy.nextPlannedAttempt(session, 15), null);
  assert.equal(session.serialize(), beforeReaction,
    "forecast stepping never advances the live session");
  session.stepMany(15);
  assert.equal(policy.plan(session), null,
    "the live state matches the forecast after its accepted command and reaction span");

  const cutBytes = session.serialize();
  assert.equal(policy.nextPlannedAttempt(session, 15), null);
  policy.restore({ emergencyDecisionTicks: [] });
  const restored = GameSession.restore(cutBytes);
  assert.equal(policy.plan(restored), null,
    "restore clears forecast expectations from the branch that was rewound");
  assert.equal(restored.serialize(), cutBytes);
});

test("cooldown history can rewind to a prior prefix and rejects unordered history", () => {
  const policy = createEnduranceWorkloadPolicy({ emergencyDecisionTicks: [900] });
  const prefix = policy.snapshot();
  const branch = { emergencyDecisionTicks: [900, 1_200] };
  assert.equal(policy.restore(branch), true);
  branch.emergencyDecisionTicks.push(1_500);
  assert.deepEqual(policy.snapshot(), { emergencyDecisionTicks: [900, 1_200] },
    "policy state owns a copy of the restored branch history");
  assert.equal(policy.restore(prefix), true);
  assert.deepEqual(policy.snapshot(), prefix,
    "restoring the canonical cut removes cooldown state from an abandoned branch");
  assert.throws(() => policy.restore({ emergencyDecisionTicks: [900, 600] }),
    /snapshot is invalid/u, "unordered decision history cannot become cooldown authority");
});

test("the replay-derived natural terminal stops planning and keeps the 18,000-tick gate red", () => {
  const evidence = JSON.parse(readFileSync(TERMINAL_REPLAY, "utf8"));
  assert.equal(evidence.evidence.transcriptSha256,
    "bd06ef21ccd243f48667a1ffdcb5d522613fcf03f3f3b311852dc9c8e4e90594",
    "the failure record belongs to the captured deterministic Chrome transcript");
  assert.equal(evidence.terminal.firstTerminalTick, 13_352);
  assert.equal(evidence.terminal.isTerminal, true);
  assert.deepEqual(evidence.terminal.result, {
    crowns: { north: 2, south: 1 },
    endedAtTick: 13_351,
    kind: "win",
    reason: "overtime_sudden_death",
    winner: "north",
  });

  const terminalSession = { state: {
    terminal: evidence.terminal.isTerminal,
    tick: evidence.terminal.firstTerminalTick,
    clock: { result: evidence.terminal.result },
  } };
  assert.equal(plannedSouthAttempt(terminalSession), null,
    "terminal state produces no stale or post-match deployment command");
  assert.throws(() => assertEnduranceWorkloadCanContinue(terminalSession, ENDURANCE_REQUIRED_TICK),
    /ended naturally at tick 13351 before required tick 18000 \(overtime_sudden_death; north won\)/,
    "the unchanged full-duration requirement still rejects the old workload");
});
