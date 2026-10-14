import { createHash } from 'node:crypto';
import { GameSession } from '../../../src/sim/game-session.js';
import { exactEnduranceSetupBytes } from '../../../tests/helpers/endurance-workload.js';

const session = new GameSession(exactEnduranceSetupBytes());
session.stepMany(300);
session.pause();
session.resume();
const serialized = session.serialize();
const receipt = {
  pausedAfterResume: session.state.paused,
  snapshotBytes: new TextEncoder().encode(serialized).byteLength,
  snapshotSha256: createHash('sha256').update(serialized).digest('hex'),
  tick: session.state.tick,
};
if (receipt.tick !== 300 || receipt.pausedAfterResume) {
  throw new Error('restore cut did not end resumed at tick 300');
}
console.log(JSON.stringify(receipt));
