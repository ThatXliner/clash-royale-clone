import assert from "node:assert/strict";
import { GameSession } from "../../../src/sim/game-session.js";
import { evaluateDeployment } from "../../../src/sim/deployment.js";
import {
  BRACKENWHEEL_ENDURANCE_DECK,
  createSelectedEnduranceWorkloadPolicy,
  exactBrackenwheelEnduranceSetupBytes,
} from "../../../tests/helpers/endurance-workload.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const setupBytes = exactBrackenwheelEnduranceSetupBytes();
const setup = JSON.parse(setupBytes);
const roster = JSON.parse(setup.battleSetup).roster;
const byId = new Map(roster.map((card) => [card.id, card]));
assert.deepEqual(setup.deck, [...BRACKENWHEEL_ENDURANCE_DECK]);
assert.equal(setup.seed, 2);

let session = new GameSession(setupBytes);
let policy = createSelectedEnduranceWorkloadPolicy({ setupBytes });
let commandId = 1;
let lastSuccessfulTick = 0;
const decisions = [];
const cuts = new Map();

const openingState = session.state;
assert.equal(policy.plan(session), null);
const brackenwheelSlot = openingState.decks.south.hand.indexOf("brackenwheel");
assert.ok(brackenwheelSlot >= 0);
const initialCommand = { cardId: "brackenwheel", commandId: commandId++,
  point: { x: 3_500, y: 14_500 }, slot: brackenwheelSlot, tick: 0, type: "deploy" };
assert.equal(session.submitPlayerCommand(canonical(initialCommand)).accepted, true);

function stateAtGate() {
  const state = session.state;
  const lastSouthDeploymentTick = state.cardRuntime.history
    .filter(({ side }) => side === "south").at(-1)?.tick ?? 0;
  const incoming = state.battle.units.filter(({ alive, position, side }) =>
    alive && side === "north" && position.y < 15_000);
  const candidates = state.decks.south.hand.map((cardId, slot) => {
    const card = byId.get(cardId);
    const entities = card.entities;
    return {
      cardId,
      slot,
      cost: card.cost,
      durability: entities.reduce((sum, entity) => sum + entity.count * entity.hitpoints, 0),
      speed: entities.reduce((sum, entity) =>
        sum + entity.count * entity.movementMillitilesPerSecond, 0),
      affordable: card.cost <= state.elixir.sides.south.amount,
    };
  }).sort((a, b) => b.durability - a.durability || a.speed - b.speed ||
    a.cost - b.cost || a.cardId.localeCompare(b.cardId));
  const lanes = state.battle.towers.filter(({ id, role, side }) =>
    side === "south" && role === "lane" && id.startsWith("south:lane:"));
  const selectedLane = [...lanes].sort((a, b) => a.hitpoints - b.hitpoints ||
    a.id.localeCompare(b.id))[0];
  const refreshPoint = selectedLane === undefined ? null : {
    x: selectedLane.position.x,
    y: selectedLane.position.y - 2_000,
  };
  return {
    tick: state.tick,
    terminal: state.terminal,
    clock: state.clock,
    lastSuccessfulTick,
    lastSouthDeploymentTick,
    guardRefreshDue: state.tick - lastSouthDeploymentTick >= 900,
    incomingNorthCount: incoming.length,
    northAliveCount: state.battle.units.filter(({ alive, side }) => alive && side === "north").length,
    northAliveTargetingSouthLane: state.battle.units.filter(({ alive, side, targetId }) =>
      alive && side === "north" && lanes.some((lane) => lane.id.endsWith("west")
        ? targetId === Number.MAX_SAFE_INTEGER - 4
        : targetId === Number.MAX_SAFE_INTEGER - 3)).map(({ id, cardId, targetId, position }) =>
        ({ id, cardId, targetId, position })),
    southElixir: state.elixir.sides.south,
    southHand: [...state.decks.south.hand],
    southLanes: lanes.map(({ id, hitpoints, position }) => ({ id, hitpoints, position })),
    refreshPoint,
    legalAffordableAtRefreshPoint: refreshPoint === null ? [] : candidates.filter(({ affordable }) => affordable)
      .map(({ cardId, slot, cost }) => ({ cardId, slot, cost,
        placement: evaluateDeployment({ side: "south", placementClass: "ground_entity",
          point: refreshPoint, destroyedOpposingLaneTowers: [] }) })),
    candidates,
  };
}

function driveUntil(endTick) {
  while (session.state.tick < endTick && !session.state.terminal) {
    const fromTick = session.state.tick;
    const plan = policy.plan(session);
    if ([6_300, 6_600, 6_900].includes(fromTick)) {
      gateStates.push({ ...stateAtGate(), policyPlan: plan });
    }
    if (plan !== null) {
      const command = { cardId: plan.cardId, commandId: commandId++, point: plan.point,
        slot: plan.slot, tick: plan.tick, type: "deploy" };
      const receipt = session.submitPlayerCommand(canonical(command));
      assert.equal(receipt.accepted, true, `canonical E2 command at ${fromTick} is accepted`);
      policy.recordAcceptedPhysicalDelivery(command);
      lastSuccessfulTick = fromTick;
      decisions.push({ tick: fromTick, cardId: plan.cardId, slot: plan.slot,
        point: plan.point, decision: plan.decision });
    }
    const toNextBaseline = 300 - (fromTick % 300);
    const maxDriveTicks = Math.min(300, endTick - fromTick, toNextBaseline);
    const next = policy.nextPlannedAttempt(session, maxDriveTicks);
    const driveTicks = next?.ticksAhead ?? maxDriveTicks;
    assert.ok(driveTicks > 0 && driveTicks <= maxDriveTicks);
    session.stepMany(driveTicks);
    if ([300, 600].includes(session.state.tick) && !cuts.has(session.state.tick)) {
      cuts.set(session.state.tick, {
        sessionBytes: session.serialize(),
        policy: policy.snapshot(),
        commandId,
        lastSuccessfulTick,
      });
    }
  }
}

const gateStates = [];
driveUntil(300);
const cut300 = cuts.get(300);
assert.ok(cut300, "canonical session and workload cut captured at tick 300");
driveUntil(600);
const branch600 = cuts.get(600);
assert.ok(branch600, "canonical session and workload branch captured at tick 600");

session = GameSession.restore(cut300.sessionBytes);
policy = createSelectedEnduranceWorkloadPolicy({ setupBytes });
policy.restore(cut300.policy);
commandId = cut300.commandId;
lastSuccessfulTick = cut300.lastSuccessfulTick;
cuts.delete(600);
driveUntil(600);
const replay600 = cuts.get(600);
assert.equal(replay600.sessionBytes, branch600.sessionBytes,
  "600→300→600 restore/replay reproduces canonical session bytes");
assert.deepEqual(replay600.policy, branch600.policy,
  "600→300→600 restore/replay reproduces the policy cooldown snapshot");

// Continue the same selected setup, canonical commands, and forecast driver to the reported failure gate.
driveUntil(7_200);
const southDeployments = session.replay.filter((entry) => entry.type === "session-deployed" &&
  entry.side === "south").map((entry) => ({ tick: entry.tick,
    cardId: entry.deployment.cardId, cost: entry.spend.cost }));
const failureWindow = {
  tick: session.state.tick,
  lastSuccessfulTick,
  ticksSinceLastPaidSouthDeployment: session.state.tick - lastSuccessfulTick,
};
const report = {
  sourceScenario: { seed: setup.seed, deck: setup.deck },
  setupSha256: (await import("node:crypto")).createHash("sha256").update(setupBytes).digest("hex"),
  replay: { restore600Rewind300Replay600Exact: true,
    cut300SessionBytes: cut300.sessionBytes.length, branch600SessionBytes: branch600.sessionBytes.length,
    replay600SessionBytes: replay600.sessionBytes.length },
  decisions,
  southDeployments,
  gateStates,
  failureWindow,
  endState: { terminal: session.state.terminal, clock: session.state.clock,
    southElixir: session.state.elixir.sides.south,
    southHand: session.state.decks.south.hand,
    aliveNorthCount: session.state.battle.units.filter(({ alive, side }) => alive && side === "north").length },
};
console.log(JSON.stringify(report, null, 2));
assert.equal(session.state.tick, 7_200);
assert.ok(failureWindow.ticksSinceLastPaidSouthDeployment <= 900,
  `paid south deployment cadence holds through tick ${session.state.tick}; last paid at ${lastSuccessfulTick}`);
