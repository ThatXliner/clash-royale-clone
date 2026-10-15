import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { GameSession } from "file:///tmp/cards022qh-critic-0cf6e9d33b1247bc/src/sim/game-session.js";
import {
  createEnduranceWorkloadPolicy as createOldDefaultPolicy,
  createSelectedEnduranceWorkloadPolicy as createOldSelectedPolicy,
  exactEnduranceSetupBytes as oldDefaultSetup,
  exactKilnkeeperEnduranceSetupBytes as oldKilnSetup,
  normalizedWorkloadCommand as oldNormalizeCommand,
} from "file:///tmp/cards022qh-old-ac224/tests/helpers/endurance-workload.js";
import {
  createEnduranceWorkloadPolicy as createFinalDefaultPolicy,
  createSelectedEnduranceWorkloadPolicy as createFinalSelectedPolicy,
  exactEnduranceSetupBytes as finalDefaultSetup,
  exactKilnkeeperEnduranceSetupBytes as finalKilnSetup,
  normalizedWorkloadCommand as finalNormalizeCommand,
} from "file:///tmp/cards022qh-critic-0cf6e9d33b1247bc/tests/helpers/endurance-workload.js";

function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function planRecord(plan, normalize) {
  return plan === null ? null : {
    command: normalize(plan),
    decision: plan.decision ?? null,
    policyEvidence: plan.policyEvidence ?? null,
    suppressedBaseline: plan.suppressedBaseline ?? null,
  };
}

function runScenario(name, oldSetupBytes, finalSetupBytes) {
  assert.equal(oldSetupBytes, finalSetupBytes, name + " old/final setup bytes");
  const setupBytes = finalSetupBytes;
  const setup = JSON.parse(setupBytes);
  const roster = JSON.parse(setup.battleSetup).roster;
  const costs = new Map(roster.map((card) => [card.id, card.cost]));
  const session = new GameSession(setupBytes);
  const oldPolicy = name === "default-eight" ? createOldDefaultPolicy()
    : createOldSelectedPolicy({ setupBytes });
  const finalPolicy = name === "default-eight" ? createFinalDefaultPolicy()
    : createFinalSelectedPolicy({ setupBytes });
  const planComparisons = [];
  const forecastComparisons = [];
  const acceptedInputs = [];
  const spans = [];
  let firstDifference = null;
  let commandId = 1;

  function admit(command, source) {
    const admission = session.submitPlayerCommand(canonical(command));
    assert.equal(admission.accepted, true, name + " actual command accepted at tick " +
      command.tick);
    oldPolicy.recordAcceptedPhysicalDelivery(command);
    finalPolicy.recordAcceptedPhysicalDelivery(command);
    acceptedInputs.push({ source, cardId: command.cardId, commandId: command.commandId,
      slot: command.slot, point: command.point, tick: command.tick });
  }

  if (name === "kilnkeeper") {
    const opening = session.state;
    const slot = opening.decks.south.hand.indexOf("kilnkeeper");
    assert.ok(slot >= 0, "natural Kilnkeeper scenario has its authored opening card");
    admit({ cardId: "kilnkeeper", commandId: commandId++,
      point: { x: 9_000, y: 10_000 }, slot, tick: 0, type: "deploy" },
    "initial-player");
  }

  let iterations = 0;
  const endTick = 18_000;
  while (session.state.tick < endTick && !session.state.terminal) {
    assert.ok(iterations++ < 2_000, name + " loop remains bounded");
    const fromTick = session.state.tick;
    const oldPlan = oldPolicy.plan(session);
    const finalPlan = finalPolicy.plan(session);
    const oldDecision = planRecord(oldPlan, oldNormalizeCommand);
    const finalDecision = planRecord(finalPlan, finalNormalizeCommand);
    const sameDecision = canonical(oldDecision) === canonical(finalDecision);
    if (fromTick % 300 === 0 || oldPlan !== null || finalPlan !== null) {
      planComparisons.push({ tick: fromTick, phase: session.state.clock.phase,
        old: oldDecision, final: finalDecision, equal: sameDecision });
    }
    if (!sameDecision) {
      firstDifference = { kind: "plan", tick: fromTick, phase: session.state.clock.phase,
        stateSha256: sha256(session.serialize()), old: oldDecision, final: finalDecision };
      break;
    }

    if (oldPlan !== null) {
      const command = { cardId: oldPlan.cardId, commandId: commandId++,
        point: oldPlan.point, slot: oldPlan.slot, tick: oldPlan.tick, type: "deploy" };
      admit(command, "workload-policy");
    }

    const untilBaseline = 300 - (fromTick % 300);
    const maxDriveTicks = Math.min(300, endTick - fromTick, untilBaseline);
    const oldForecast = oldPolicy.nextPlannedAttempt(session, maxDriveTicks);
    const finalForecast = finalPolicy.nextPlannedAttempt(session, maxDriveTicks);
    const oldForecastRecord = oldForecast === null ? null : {
      plan: planRecord(oldForecast.plan, oldNormalizeCommand),
      ticksAhead: oldForecast.ticksAhead,
    };
    const finalForecastRecord = finalForecast === null ? null : {
      plan: planRecord(finalForecast.plan, finalNormalizeCommand),
      ticksAhead: finalForecast.ticksAhead,
    };
    const sameForecast = canonical(oldForecastRecord) === canonical(finalForecastRecord);
    forecastComparisons.push({ fromTick, maxDriveTicks, old: oldForecastRecord,
      final: finalForecastRecord, equal: sameForecast });
    if (!sameForecast) {
      firstDifference = { kind: "forecast", tick: fromTick, phase: session.state.clock.phase,
        stateSha256: sha256(session.serialize()), old: oldForecastRecord,
        final: finalForecastRecord };
      break;
    }

    const ticksAhead = oldForecast?.ticksAhead ?? maxDriveTicks;
    assert.ok(Number.isSafeInteger(ticksAhead) && ticksAhead > 0 &&
      ticksAhead <= maxDriveTicks, name + " matched forecast stays inside its drive span");
    session.stepMany(ticksAhead);
    spans.push({ fromTick, ticksAhead, terminal: session.state.terminal,
      resultingTick: session.state.tick });
  }

  const finalBytes = session.serialize();
  const paidDeployments = session.replay.filter((entry) =>
    entry.type === "session-deployed" && entry.side === "south").map((entry) => ({
      cardId: entry.deployment.cardId, cost: entry.spend.cost,
      acceptedSpend: entry.spend.accepted, amountAfter: entry.spend.amountAfter,
      point: entry.deployment.point, tick: entry.tick,
    }));
  const deliveryMatches = acceptedInputs.map((input) => {
    const matches = session.replay.filter((entry) => entry.type === "session-deployed" &&
      entry.side === "south" && entry.tick === input.tick &&
      entry.deployment.cardId === input.cardId &&
      canonical(entry.deployment.point) === canonical(input.point));
    return { source: input.source, commandId: input.commandId, tick: input.tick,
      cardId: input.cardId, expectedCost: costs.get(input.cardId), eventCount: matches.length,
      events: matches.map((entry) => ({ tick: entry.tick,
        cardId: entry.deployment.cardId, point: entry.deployment.point,
        cost: entry.spend.cost, acceptedSpend: entry.spend.accepted,
        amountAfter: entry.spend.amountAfter })) };
  });
  const exactlyOncePaid = deliveryMatches.length === acceptedInputs.length &&
    deliveryMatches.every((match) => match.eventCount === 1 &&
      match.events[0].acceptedSpend === true &&
      match.events[0].cost === match.expectedCost &&
      match.expectedCost !== undefined);
  const terminal = session.state.terminal;
  const naturalTerminal = name !== "kilnkeeper" || terminal;
  const reachedRequiredTick = name !== "default-eight" || session.state.tick === endTick;
  const allPlanChecksEqual = planComparisons.every((entry) => entry.equal);
  const allForecastChecksEqual = forecastComparisons.every((entry) => entry.equal);
  const scenarioPass = firstDifference === null && allPlanChecksEqual &&
    allForecastChecksEqual && exactlyOncePaid && naturalTerminal && reachedRequiredTick;
  return {
    scenario: name,
    setupSha256: sha256(setupBytes),
    setupBytes: setupBytes.length,
    endTick: session.state.tick,
    terminal,
    result: session.state.clock.result,
    iterations,
    planComparisonCount: planComparisons.length,
    planComparisons,
    forecastComparisonCount: forecastComparisons.length,
    forecastComparisons,
    acceptedInputs,
    paidDeployments,
    deliveryMatches,
    exactlyOncePaid,
    naturalTerminal,
    reachedRequiredTick,
    finalSessionBytes: finalBytes.length,
    finalSessionSha256: sha256(finalBytes),
    finalSessionByteParity: "inductive: same source runtime, same actual accepted commands, and no plan or forecast divergence at any observed boundary",
    firstDifference,
    pass: scenarioPass,
  };
}

const defaultOld = oldDefaultSetup();
const defaultFinal = finalDefaultSetup();
const kilnOld = oldKilnSetup();
const kilnFinal = finalKilnSetup();
const result = {
  candidate: "4420cd8fbde8d5771e161ef267ab6319898e2338",
  immutableOldHelperSource: "ac224e9d8fa3e2797ea04c3e27b941abf18239c3",
  candidateHelperSource: "4420cd8fbde8d5771e161ef267ab6319898e2338",
  comparisonMode: "both authentic helper policies query one deterministic live GameSession; after every equal plan they receive the same accepted input and forecast the same session bytes; stop at first plan/forecast difference",
  sourceRuntimeEquivalenceFence: "external git diff ac224..4420 -- src must be empty for byte-parity induction",
  scenarios: [
    runScenario("default-eight", defaultOld, defaultFinal),
    runScenario("kilnkeeper", kilnOld, kilnFinal),
  ],
};
console.log(JSON.stringify(result, null, 2));
if (result.scenarios.some((scenario) => !scenario.pass)) process.exitCode = 1;
