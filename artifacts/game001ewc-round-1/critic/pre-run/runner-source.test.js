import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { GameSession } from "../src/sim/game-session.js";
import {
  assertEnduranceWorkloadCanContinue,
  createEnduranceWorkloadPolicy,
  ENDURANCE_BASELINE_INTERVAL_TICKS,
  ENDURANCE_REACTION_INTERVAL_TICKS,
  ENDURANCE_REQUIRED_TICK,
  exactEnduranceSetupBytes,
  normalizedWorkloadCommand,
  plannedSouthAttempt,
} from "./helpers/endurance-workload.js";

const SEGMENT_TICKS = ENDURANCE_BASELINE_INTERVAL_TICKS;
const TERMINAL_TICK = ENDURANCE_REQUIRED_TICK;
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }

function irregularChunks(unused, ticks) {
  if (ticks <= 18) return ticks === 1 ? [1] : [1, ticks - 1];
  return [1, 17, ticks - 18];
}

function continueWithSharedPolicy(session, commandId, chunker, snapshots, metrics,
  workloadPolicy = createEnduranceWorkloadPolicy()) {
  const initialTick = session.state.tick;
  const decisions = [];
  let baselineBoundaryChecks = 0;
  let segmentCount = 0;

  while (session.state.tick < TERMINAL_TICK) {
    const segmentStart = session.state.tick;
    const segmentEnd = segmentStart + SEGMENT_TICKS;
    assert.equal(segmentStart % SEGMENT_TICKS, 0,
      "the endurance workload keeps each measured segment on a 300-tick boundary");
    const started = performance.now();
    const submittedCommands = [];
    let segmentTick = segmentStart;

    while (segmentTick < segmentEnd) {
      const state = session.state;
      if (state.terminal) assertEnduranceWorkloadCanContinue(session, TERMINAL_TICK);
      assert.equal(state.tick, segmentTick,
        "the shared policy observes the live simulation tick after each bounded step");
      assert.equal(state.tick % ENDURANCE_REACTION_INTERVAL_TICKS, 0,
        "the shared policy is consulted on a 15-tick reaction boundary");
      if (state.tick > 0 && state.tick % SEGMENT_TICKS === 0) baselineBoundaryChecks += 1;

      const plan = workloadPolicy.plan(session);
      if (state.tick === SEGMENT_TICKS) {
        const baseline = plannedSouthAttempt(session);
        assert.ok(baseline, "the original 300-tick defensive planner has an eligible decision");
        assert.deepEqual(plan, { ...baseline, decision: "frozen-GH-baseline" },
          "the shared workload preserves the exact original 300-tick card, slot, point, and tick");
      }

      let submittedCommand = null;
      if (plan !== null) {
        assert.equal(plan.tick, state.tick, "workload plans target the live simulation tick");
        decisions.push({ decision: plan.decision,
          policyEvidence: plan.policyEvidence ?? null,
          suppressedBaseline: plan.suppressedBaseline ?? null,
          tick: plan.tick,
          command: normalizedWorkloadCommand(plan) });
        assert.equal(state.decks.south.hand[plan.slot], plan.cardId,
          "the planned card occupies the selected live hand slot");
        submittedCommand = { cardId: plan.cardId, commandId: commandId++,
          point: plan.point, slot: plan.slot, tick: plan.tick, type: "deploy" };
        const admission = session.submitPlayerCommand(canonical(submittedCommand));
        assert.equal(admission.accepted, true,
          `legal paid south command ${submittedCommand.commandId} is accepted at tick ${plan.tick}`);
        assert.equal(admission.tick, plan.tick);
        assert.equal(admission.commandId, submittedCommand.commandId);
        submittedCommands.push(submittedCommand);
      }

      const maxDriveTicks = segmentEnd - state.tick;
      const driveTicks = Math.min(ENDURANCE_REACTION_INTERVAL_TICKS, maxDriveTicks);
      assert.ok(Number.isSafeInteger(driveTicks) && driveTicks > 0 && driveTicks <= maxDriveTicks,
        "the shared policy advances only through the next reaction boundary");
      const chunks = chunker(commandId, driveTicks);
      assert.ok(chunks.length > 0 && chunks.every((ticks) => Number.isSafeInteger(ticks) && ticks > 0),
        "every simulation chunk is a positive whole-tick step");
      assert.equal(chunks.reduce((total, ticks) => total + ticks, 0), driveTicks,
        "chunking preserves the exact reaction-boundary span");
      for (const ticks of chunks) {
        session.stepMany(ticks);
        segmentTick += ticks;
      }
    }

    if (submittedCommands.length > 0) {
      const replay = session.replay;
      for (const submittedCommand of submittedCommands) {
        const deployment = replay.find((entry) => entry.type === "session-deployed" &&
          entry.side === "south" && entry.tick === submittedCommand.tick &&
          entry.deployment.cardId === submittedCommand.cardId);
        assert.ok(deployment,
          `accepted command ${submittedCommand.commandId} materializes as a south deployment`);
        assert.ok(Number.isSafeInteger(deployment.spend.cost) && deployment.spend.cost > 0,
          "every successful endurance deployment is paid");
      }
    }

    const bytes = session.serialize(), elapsedMs = Math.round(performance.now() - started);
    const finalState = session.state;
    assert.equal(finalState.tick, segmentEnd,
      `each bounded segment advances exactly ${SEGMENT_TICKS} ticks`);
    assert.equal(finalState.terminal, finalState.tick === TERMINAL_TICK,
      `match ended before tick ${TERMINAL_TICK}: ${canonical({ result: finalState.clock.result,
        towers: finalState.clock.towers })}`);
    assert.equal(canonical(JSON.parse(bytes)), bytes);
    assert.ok(Buffer.byteLength(bytes) < 1_048_576, "session transcript snapshot remains practical");
    const lastSuccessfulTick = finalState.cardRuntime.history
      .filter(({ side }) => side === "south").at(-1)?.tick ?? initialTick;
    assert.ok(session.state.tick - lastSuccessfulTick <= 900,
      "one successful legal paid south deployment occurs in every 900-tick window");
    snapshots?.set(session.state.tick, { policy: workloadPolicy.snapshot(),
      sessionBytes: bytes, commandId });
    const metric = { elapsedMs, snapshotBytes: Buffer.byteLength(bytes), tick: session.state.tick };
    metrics?.push(metric);
    if (metrics) console.log(`# endurance-segment ${canonical(metric)}`);
    if (metrics) assert.ok(elapsedMs < 30_000,
      `300-tick segment at ${metric.tick} stayed bounded`);
    segmentCount += 1;
  }

  const finalState = session.state;
  assert.equal(finalState.tick, TERMINAL_TICK);
  assert.equal(finalState.terminal, true);
  assert.equal(segmentCount, (TERMINAL_TICK - initialTick) / SEGMENT_TICKS,
    "the workload completes every required 300-tick segment");
  return { baselineBoundaryChecks, commandId, decisions, segmentCount, session };
}

test("game session endurance: shared policy preserves the active seed-zero match across chunks and restore cuts", (t) => {
  const setupBytes = exactEnduranceSetupBytes();
  assert.equal(canonical(JSON.parse(setupBytes)), setupBytes,
    "the scenario keeps the exact canonical seed-zero/default-eight setup bytes");
  const setup = JSON.parse(setupBytes);
  assert.equal(setup.seed, 0);
  assert.equal(setup.deck.length, 8,
    "the scenario retains the accepted default eight-card deck");
  const acceptedSetup = new GameSession(setupBytes).serialize();
  assert.equal(canonical(JSON.parse(acceptedSetup).setup), setupBytes,
    "GameSession accepts and preserves the exact setup bytes used by the prior fixture");

  const snapshots = new Map(), metrics = [];
  const directResult = continueWithSharedPolicy(new GameSession(setupBytes), 0,
    (unused, ticks) => [ticks], snapshots, metrics);
  const direct = directResult.session;
  t.diagnostic(`segments=${JSON.stringify(metrics)}`);
  const directBytes = direct.serialize(), directReplay = direct.replayBytes(), directState = direct.state;
  const activeSides = new Set(directState.cardRuntime.history.map(({ side }) => side));
  assert.ok(activeSides.has("north") && activeSides.has("south"),
    "the endurance workload retains paid active play for both sides");
  const directReplayEntries = direct.replay;
  assert.ok(directReplayEntries.some(({ side, spend, type }) => type === "session-deployed" &&
    side === "north" && Number.isSafeInteger(spend?.cost) && spend.cost > 0),
  "the seed-zero replay contains a successful North deployment with positive paid spend");
  const paidSouthDeploymentTicks = directReplayEntries
    .filter(({ side, spend, type }) => type === "session-deployed" && side === "south" &&
      Number.isSafeInteger(spend?.cost) && spend.cost > 0)
    .map(({ tick }) => tick)
    .sort((left, right) => left - right);
  assert.ok(paidSouthDeploymentTicks.length > 0 &&
    paidSouthDeploymentTicks.every(Number.isSafeInteger),
  "the replay contains paid South deployment receipts with integer ticks");
  const paidSouthGaps = [paidSouthDeploymentTicks[0],
    ...paidSouthDeploymentTicks.slice(1).map((tick, index) => tick - paidSouthDeploymentTicks[index]),
    TERMINAL_TICK - paidSouthDeploymentTicks.at(-1)];
  const maxPaidSouthGapTicks = Math.max(...paidSouthGaps);
  t.diagnostic(`max-paid-south-deployment-gap-ticks=${maxPaidSouthGapTicks}`);
  assert.ok(maxPaidSouthGapTicks <= 900,
    `paid South deployment receipts cover the full match in gaps <=900 ticks (max ${maxPaidSouthGapTicks})`);
  assert.equal(directResult.baselineBoundaryChecks, TERMINAL_TICK / SEGMENT_TICKS - 1,
    "the shared policy retains every baseline decision boundary through the full match");
  assert.ok(directResult.decisions.some(({ decision, tick }) =>
    tick === SEGMENT_TICKS && decision === "frozen-GH-baseline"),
  "the exact tick-300 baseline decision remains covered");
  assert.ok(directResult.decisions.some(({ decision, tick }) =>
    decision !== "frozen-GH-baseline" && tick % SEGMENT_TICKS !== 0),
  "the accepted adaptive policy produces a causal 15-tick reaction decision");

  const chunkMetrics = [];
  const chunkedResult = continueWithSharedPolicy(new GameSession(setupBytes), 0,
    irregularChunks, null, chunkMetrics);
  const chunked = chunkedResult.session;
  assert.equal(chunked.serialize(), directBytes);
  assert.equal(chunked.replayBytes(), directReplay);
  assert.deepEqual(chunked.state, directState);
  assert.deepEqual(chunkedResult.decisions, directResult.decisions,
    "irregular chunks preserve every baseline and adaptive decision");

  for (const cut of [2_100, 9_000, 17_700].filter((tick) => tick < TERMINAL_TICK)) {
    const snapshot = snapshots.get(cut);
    const restored = GameSession.restore(snapshot.sessionBytes);
    const restoredPolicy = createEnduranceWorkloadPolicy();
    restoredPolicy.restore(snapshot.policy);
    const restoredMetrics = [];
    const resumed = continueWithSharedPolicy(restored, snapshot.commandId,
      (unused, ticks) => [ticks], null, restoredMetrics, restoredPolicy);
    assert.equal(restored.serialize(), directBytes, `snapshot bytes from ${cut}`);
    assert.equal(restored.replayBytes(), directReplay, `replay bytes from ${cut}`);
    assert.deepEqual(restored.state, directState, `authority state from ${cut}`);
    assert.deepEqual(resumed.decisions,
      directResult.decisions.filter(({ tick }) => tick >= cut),
      `adaptive decisions from the serialized policy and session cut at ${cut}`);
  }
});
