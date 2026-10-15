import { createHash } from "node:crypto";
import { GameSession } from "../../../src/sim/game-session.js";
import {
  BRACKENWHEEL_ENDURANCE_DECK,
  KILNKEEPER_ENDURANCE_DECK,
  createEnduranceWorkloadPolicy,
  createSelectedEnduranceWorkloadPolicy,
  exactEnduranceSetupBytes,
  exactKilnkeeperEnduranceSetupBytes,
  normalizedWorkloadCommand,
} from "../../../tests/helpers/endurance-workload.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function affordableIdleRefreshPlan(session, setup, existingPlan) {
  const state = session.state;
  if (state.terminal || state.tick % 300 !== 0) return existingPlan;
  const incoming = state.battle.units.filter(({ alive, position, side }) =>
    alive && side === "north" && position.y < 15_000);
  const lastSouthDeploymentTick = state.cardRuntime.history
    .filter(({ side }) => side === "south").at(-1)?.tick ?? 0;
  if (incoming.length > 0 || state.tick - lastSouthDeploymentTick < 900) return existingPlan;
  const roster = JSON.parse(setup.battleSetup).roster;
  const cards = new Map(roster.map((card) => [card.id, card]));
  const candidates = state.decks.south.hand.map((cardId, slot) => {
    const card = cards.get(cardId);
    const entities = card.entities;
    return { cardId, slot, cost: card.cost,
      durability: entities.reduce((sum, entity) => sum + entity.count * entity.hitpoints, 0),
      speed: entities.reduce((sum, entity) => sum + entity.count * entity.movementMillitilesPerSecond, 0) };
  }).sort((a, b) => b.durability - a.durability || a.speed - b.speed ||
    a.cost - b.cost || a.cardId.localeCompare(b.cardId));
  const chosen = candidates.find(({ cost }) => cost <= state.elixir.sides.south.amount);
  if (chosen === undefined) return null;
  const lanes = state.battle.towers.filter(({ id }) => id.startsWith("south:lane:"));
  const lane = [...lanes].sort((a, b) => a.hitpoints - b.hitpoints ||
    a.id.localeCompare(b.id))[0];
  if (lane === undefined) return null;
  return { cardId: chosen.cardId, point: { x: lane.position.x, y: lane.position.y - 2_000 },
    slot: chosen.slot, tick: state.tick, decision: "frozen-GH-baseline" };
}

function runScenario(name, setupBytes, selectedPolicy, requiresInitialPlayerCard, endTick = 18_000) {
  const setup = JSON.parse(setupBytes);
  const setupSha256 = createHash("sha256").update(setupBytes).digest("hex");
  let session = new GameSession(setupBytes);
  let policy = selectedPolicy
    ? createSelectedEnduranceWorkloadPolicy({ setupBytes }) : createEnduranceWorkloadPolicy();
  let commandId = 1;
  if (requiresInitialPlayerCard !== null) {
    const opening = session.state;
    const slot = opening.decks.south.hand.indexOf(requiresInitialPlayerCard);
    const command = { cardId: requiresInitialPlayerCard, commandId: commandId++,
      point: name === "kilnkeeper" ? { x: 9_000, y: 10_000 } : { x: 3_500, y: 14_500 },
      slot, tick: 0, type: "deploy" };
    const receipt = session.submitPlayerCommand(canonical(command));
    if (!receipt.accepted) throw new Error(`${name} initial physical command rejected`);
  }
  const trace = [];
  let firstDifference = null;
  while (session.state.tick < endTick && !(name !== "default-eight" && session.state.terminal)) {
    const fromTick = session.state.tick;
    const existingPlan = policy.plan(session);
    const proposedPlan = affordableIdleRefreshPlan(session, setup, existingPlan);
    const normalize = (plan) => plan === null ? null : {
      ...normalizedWorkloadCommand(plan), decision: plan.decision,
    };
    if (canonical(normalize(existingPlan)) !== canonical(normalize(proposedPlan))) {
      firstDifference = {
        tick: fromTick,
        phase: session.state.clock.phase,
        lastSouthDeploymentTick: session.state.cardRuntime.history
          .filter(({ side }) => side === "south").at(-1)?.tick ?? 0,
        southElixir: session.state.elixir.sides.south,
        southHand: session.state.decks.south.hand,
        existingPlan: normalize(existingPlan),
        proposedPlan: normalize(proposedPlan),
      };
      break;
    }
    if (existingPlan !== null) {
      const command = { ...normalizedWorkloadCommand(existingPlan),
        commandId: commandId++, type: "deploy" };
      const receipt = session.submitPlayerCommand(canonical(command));
      if (!receipt.accepted) throw new Error(`${name} command at ${fromTick} was rejected`);
      policy.recordAcceptedPhysicalDelivery(command);
      trace.push({ command: normalizedWorkloadCommand(existingPlan), cost:
        JSON.parse(setup.battleSetup).roster.find(({ id }) => id === existingPlan.cardId).cost });
    }
    const ticksToNextBaseline = 300 - (fromTick % 300);
    const maxDriveTicks = Math.min(300, endTick - fromTick, ticksToNextBaseline);
    const forecast = policy.nextPlannedAttempt(session, maxDriveTicks);
    session.stepMany(forecast?.ticksAhead ?? maxDriveTicks);
  }
  const terminal = session.state.terminal;
  return {
    scenario: name,
    setupSha256,
    setupDeck: setup.deck,
    seed: setup.seed,
    endTick: session.state.tick,
    terminal,
    result: session.state.clock.result,
    firstDifference,
    traceCount: trace.length,
    traceSha256: createHash("sha256").update(canonical(trace)).digest("hex"),
    trace,
    finalSessionSha256: createHash("sha256").update(session.serialize()).digest("hex"),
  };
}

const results = [
  runScenario("default-eight", exactEnduranceSetupBytes(), false, null),
  runScenario("kilnkeeper", exactKilnkeeperEnduranceSetupBytes(), true, "kilnkeeper"),
];
console.log(JSON.stringify(results, null, 2));
