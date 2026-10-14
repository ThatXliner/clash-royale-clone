import { performance } from 'node:perf_hooks';
import { GameSession } from '../../../src/sim/game-session.js';
import { serializeCombatEffectFeed } from '../../../src/sim/combat-effect-feed.js';
import {
  createEnduranceWorkloadPolicy,
  ENDURANCE_BASELINE_INTERVAL_TICKS,
  ENDURANCE_REACTION_INTERVAL_TICKS,
  ENDURANCE_REQUIRED_TICK,
  exactEnduranceSetupBytes,
  normalizedWorkloadCommand,
} from '../../../tests/helpers/endurance-workload.js';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const session = new GameSession(exactEnduranceSetupBytes());
const policy = createEnduranceWorkloadPolicy();
let commandId = 1;
const started = performance.now();
let latest = null;
while (session.state.tick < ENDURANCE_REQUIRED_TICK) {
  const fromTick = session.state.tick;
  if (fromTick % ENDURANCE_REACTION_INTERVAL_TICKS !== 0) {
    throw new Error(`policy boundary lost at ${fromTick}`);
  }
  let plan = null;
  let next = null;
  let driveTicks = 0;
  let maxTicks = 0;
  try {
    plan = policy.plan(session);
    if (plan !== null) {
      const command = { ...normalizedWorkloadCommand(plan), commandId, type: 'deploy' };
      const accepted = session.submitPlayerCommand(canonical(command));
      if (!accepted.accepted) throw new Error(`command rejected at ${fromTick}`);
      policy.recordAcceptedPhysicalDelivery(command);
      commandId += 1;
    }
    const ticksToNextBaseline = ENDURANCE_BASELINE_INTERVAL_TICKS -
      (fromTick % ENDURANCE_BASELINE_INTERVAL_TICKS);
    maxTicks = Math.min(fromTick >= 17_700 ? ENDURANCE_REACTION_INTERVAL_TICKS
      : ENDURANCE_BASELINE_INTERVAL_TICKS, ENDURANCE_REQUIRED_TICK - fromTick,
    ticksToNextBaseline);
    next = policy.nextPlannedAttempt(session, maxTicks);
    driveTicks = next?.ticksAhead ?? maxTicks;
    for (let count = 0; count < driveTicks; count += 1) {
      const stepFromTick = session.state.tick;
      try {
        session.stepMany(fromTick >= 17_700 ? 1 : driveTicks);
      } catch (error) {
        const feed = session.projectionSnapshot().combatEffectFeed;
        const bytes = serializeCombatEffectFeed(feed);
        console.log(JSON.stringify({
          error: { message: error.message, stack: error.stack },
          eventCount: feed.records.length,
          feedBytes: Buffer.byteLength(bytes),
          feedLastRecord: feed.records.at(-1),
          nextPlan: next?.plan ?? null,
          requestedTicks: fromTick >= 17_700 ? 1 : driveTicks,
          failedStepFromTick: stepFromTick,
          sessionTickBeforeFailedChunk: fromTick,
          elapsedMilliseconds: Math.round(performance.now() - started),
        }, null, 2));
        process.exitCode = 1;
        count = driveTicks;
      }
      if (process.exitCode === 1) break;
      if (fromTick < 17_700) break;
    }
    if (process.exitCode === 1) break;
  } catch (error) {
    const feed = session.projectionSnapshot().combatEffectFeed;
    const bytes = serializeCombatEffectFeed(feed);
    console.log(JSON.stringify({
      error: { message: error.message, stack: error.stack },
      eventCount: feed.records.length,
      feedBytes: Buffer.byteLength(bytes),
      feedLastRecord: feed.records.at(-1),
      nextPlan: next?.plan ?? null,
      requestedTicks: driveTicks,
      sessionTickBeforeFailedChunk: fromTick,
      elapsedMilliseconds: Math.round(performance.now() - started),
    }, null, 2));
    process.exitCode = 1;
    break;
  }
  const feed = session.projectionSnapshot().combatEffectFeed;
  const bytes = serializeCombatEffectFeed(feed);
  latest = { tick: session.state.tick, eventCount: feed.records.length,
    feedBytes: Buffer.byteLength(bytes), sessionBytes: Buffer.byteLength(session.serialize()) };
  if (session.state.tick % 900 === 0 || driveTicks !== maxTicks) {
    console.log(JSON.stringify({ ...latest, driveTicks, nextDecisionTick: next?.plan.tick ?? null }));
  }
}
if (session.state.tick === ENDURANCE_REQUIRED_TICK) {
  console.log(JSON.stringify({
    eventCount: session.projectionSnapshot().combatEffectFeed.records.length,
    feedBytes: Buffer.byteLength(serializeCombatEffectFeed(session.projectionSnapshot().combatEffectFeed)),
    sessionTick: session.state.tick,
    sessionBytes: Buffer.byteLength(session.serialize()),
    terminal: session.state.terminal,
    elapsedMilliseconds: Math.round(performance.now() - started),
  }, null, 2));
}
