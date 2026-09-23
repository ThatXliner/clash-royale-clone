import { performance } from 'node:perf_hooks';
import { BattleMovement } from '../../src/sim/battle-movement.js';

const mover = new BattleMovement({ mode: 'air', position: { x: 8_000, y: 12_000 }, speed: 100 });
const targets = [
  { position: { x: 15_000, y: 25_000 }, radius: 0, range: 0 },
  { position: { x: 2_000, y: 2_000 }, radius: 0, range: 0 },
];
for (let index = 0; index < 1_024; index += 1) {
  mover.setTarget(targets[index % targets.length]);
  if (index + 1 < 1_024) mover.stepMany(17);
}
const start = performance.now();
const snapshot = mover.serialize();
const serializeMs = performance.now() - start;
const restoreStart = performance.now();
const restored = BattleMovement.restore(snapshot);
const restoreMs = performance.now() - restoreStart;
process.stdout.write(JSON.stringify({ serializeMs, restoreMs, bytes: snapshot.length, commands: mover.state.commands.length, byteStable: restored.serialize() === snapshot }) + '\n');
