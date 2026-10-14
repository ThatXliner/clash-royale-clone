import fs from 'node:fs';

const telemetry = JSON.parse(fs.readFileSync(
  '/private/tmp/gpr7a-accepted-ff1025/artifacts/game001gpr7a-round1/critic/default-full/endurance-result.json',
  'utf8',
));
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
const rows = [...commandsByTick.values()].sort((left, right) => left.tick - right.tick)
  .map(({ acceptedBrowserCommandId, normalized }) => ({
    commandId: acceptedBrowserCommandId,
    normalized,
  }));
if (rows.length !== 40) throw new Error(`expected 40 accepted commands, found ${rows.length}`);
fs.writeFileSync(new URL('./recorded-default-command-rows.json', import.meta.url),
  `${JSON.stringify(rows, null, 2)}\n`);
console.log(JSON.stringify({ acceptedCommandCount: rows.length,
  firstTick: rows[0].normalized.tick, lastTick: rows.at(-1).normalized.tick }));
