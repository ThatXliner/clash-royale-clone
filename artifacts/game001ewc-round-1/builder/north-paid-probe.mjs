import assert from "node:assert/strict";

import { exactEnduranceSetupBytes } from "../../../tests/helpers/endurance-workload.js";
import { GameSession } from "../../../src/sim/game-session.js";

const session = new GameSession(exactEnduranceSetupBytes());
let deployment = null;
while (session.state.tick < 1_800 && deployment === null) {
  session.stepMany(300);
  deployment = session.replay.find(({ side, spend, type }) =>
    type === "session-deployed" && side === "north" &&
    Number.isSafeInteger(spend?.cost) && spend.cost > 0) ?? null;
}
assert.ok(deployment,
  "the exact seed-zero endurance setup produces a real North session deployment with positive paid spend");
console.log(JSON.stringify({
  cardId: deployment.deployment.cardId,
  cost: deployment.spend.cost,
  deploymentTick: deployment.tick,
  side: deployment.side,
  observedThroughTick: session.state.tick,
}));
