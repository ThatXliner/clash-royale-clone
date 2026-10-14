import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { GameSession } from '../../../src/sim/game-session.js';
import {
  COMBAT_EFFECT_FEED_MAX_BYTES,
  restoreCombatEffectFeed,
  serializeCombatEffectFeed,
  validateCombatEffectFeed,
} from '../../../src/sim/combat-effect-feed.js';
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
const utf8Bytes = (value) => new TextEncoder().encode(value).byteLength;
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
  console.log(JSON.stringify({
    commandCount: rows.length,
    restoreReplayMatches: true,
    tick: 600,
    transcriptBytes: utf8Bytes(primary600),
    transcriptSha256: createHash('sha256').update(primary600).digest('hex'),
  }));
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
  const state = session.state;
  const snapshotBytes = session.serialize();
  const projection = session.projectionSnapshot();
  const feed = projection.combatEffectFeed;
  const wire = serializeCombatEffectFeed(feed);
  const wireSnapshot = JSON.parse(wire);
  const restoredFeed = restoreCombatEffectFeed(wire);
  const graphBytes = canonical(feed.records);
  const logicalBytes = canonical(feed);
  const roundtripMatches = canonical(restoredFeed) === canonical(feed);
  const restoredSerializationMatches = serializeCombatEffectFeed(restoredFeed) === wire;
  const validatedSerializationMatches =
    serializeCombatEffectFeed(validateCombatEffectFeed(restoredFeed)) === wire;
  const plainExpandedSerializationMatches =
    serializeCombatEffectFeed(JSON.parse(JSON.stringify(feed))) === wire;
  if (!state.terminal || state.tick !== 18_000 || wireSnapshot.version !== 2 ||
      utf8Bytes(wire) > COMBAT_EFFECT_FEED_MAX_BYTES || !roundtripMatches ||
      !restoredSerializationMatches || !validatedSerializationMatches ||
      !plainExpandedSerializationMatches) {
    throw new Error('full recorded replay feed receipt failed a compact-wire parity check');
  }
  console.log(JSON.stringify({
    acceptedCommands: rows.map(({ acceptedBrowserCommandId, normalized }) => ({
      commandId: acceptedBrowserCommandId,
      normalized,
    })),
    acceptedCommandCount: rows.length,
    feed: {
      expandedGraphBytes: utf8Bytes(graphBytes),
      expandedGraphSha256: createHash('sha256').update(graphBytes).digest('hex'),
      expandedLogicalSnapshotBytes: utf8Bytes(logicalBytes),
      logicalRecordCount: feed.records.length,
      rootCount: new Set(feed.records.filter(({ parentId }) => parentId === null)
        .map(({ rootId }) => rootId)).size,
      serializedWireBytes: utf8Bytes(wire),
      wireVersion: wireSnapshot.version,
      wireRoundtripMatches: roundtripMatches,
      restoredSerializationMatches,
      validatedSerializationMatches,
      plainExpandedSerializationMatches,
    },
    pauseResumeAt300: true,
    restoreCutAt300: {
      snapshotBytes: utf8Bytes(restoreCut),
      snapshotSha256: createHash('sha256').update(restoreCut).digest('hex'),
    },
    restoreReplayMatchesAt600: true,
    sessionSnapshotBytes: utf8Bytes(snapshotBytes),
    terminal: state.terminal,
    tick: state.tick,
  }));
} catch (error) {
  console.error(JSON.stringify({ tick: session?.state?.tick ?? null,
    message: error.message, stack: error.stack }, null, 2));
  process.exitCode = 1;
}
