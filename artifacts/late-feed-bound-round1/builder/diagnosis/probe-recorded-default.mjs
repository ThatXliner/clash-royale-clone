import fs from 'node:fs';
import { GameSession } from '../../../src/sim/game-session.js';
import { exactEnduranceSetupBytes } from '../../../tests/helpers/endurance-workload.js';

const telemetryPath = '/private/tmp/gpr7a-accepted-ff1025/artifacts/game001gpr7a-round1/critic/default-full/endurance-result.json';
const telemetry = JSON.parse(fs.readFileSync(telemetryPath, 'utf8'));
const commandsByTick = new Map();
for (const row of telemetry.transportIdNormalization) {
  if (row.acceptedBrowserCommandId === null || row.normalized === null) continue;
  const prior = commandsByTick.get(row.tick);
  if (prior && (JSON.stringify(prior.normalized) !== JSON.stringify(row.normalized) ||
      prior.acceptedBrowserCommandId !== row.acceptedBrowserCommandId)) {
    throw new Error(`conflicting recorded decisions at tick ${row.tick}`);
  }
  commandsByTick.set(row.tick, row);
}
const rows = [...commandsByTick.values()].sort((a, b) => a.tick - b.tick);
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
let session = new GameSession(exactEnduranceSetupBytes());
function stepTo(tick) {
  while (session.state.tick < tick) session.stepMany(Math.min(100, tick - session.state.tick));
}
function submit(row) {
  const { acceptedBrowserCommandId: commandId, normalized } = row;
  const command = { cardId: normalized.cardId, commandId, point: normalized.point,
    slot: normalized.slot, tick: normalized.tick, type: 'deploy' };
  const result = session.submitPlayerCommand(canonical(command));
  if (!result.accepted) throw new Error(`recorded command at ${normalized.tick} rejected`);
}
try {
  stepTo(300);
  session.pause();
  session.resume();
  const restoreCut = session.serialize();
  const tick300Command = rows.find(({ tick }) => tick === 300);
  if (!tick300Command) throw new Error('recorded workload has no tick-300 input');
  submit(tick300Command);
  stepTo(600);
  const primary600 = session.serialize();
  session = GameSession.restore(restoreCut);
  submit(tick300Command);
  stepTo(600);
  if (session.serialize() !== primary600) throw new Error('restore replay differs at tick 600');
  console.log(JSON.stringify({ tick: 600, commandCount: rows.length, restoreReplayMatches: true }));
  for (const row of rows.filter(({ tick }) => tick > 300)) {
    stepTo(row.tick);
    submit(row);
  }
  while (session.state.tick < 18_000) {
    const next = Math.min(18_000, session.state.tick + 100);
    stepTo(next);
    if (next % 900 === 0) console.log(JSON.stringify({ tick: next,
      transcriptBytes: session.serialize().length }));
  }
  console.log(JSON.stringify({ tick: session.state.tick,
    terminal: session.state.terminal, transcriptBytes: session.serialize().length }));
} catch (error) {
  console.error(JSON.stringify({ tick: session?.state?.tick ?? null,
    message: error.message, stack: error.stack }, null, 2));
  process.exitCode = 1;
}
