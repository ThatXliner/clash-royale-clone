import { DeckCycle } from "./deck.js";
import { ElixirMatch } from "./elixir.js";
import { evaluateDeployment } from "./deployment.js";
import { createStageSideDeployment } from "./game-side-deploy-core.js";
import { LiveBattle } from "./live-battle.js";
import { SessionCardRuntime, isAuthenticSessionCardRuntime } from "./session-card-runtime.js";

/**
 * Public deployment helper retaining its exact class/prototype admission
 * contract while sharing its implementation with the session kernel.
 */
export const stageSideDeployment = createStageSideDeployment({
  DeckCycle,
  ElixirMatch,
  LiveBattle,
  SessionCardRuntime,
  evaluateDeployment,
  isAuthenticSessionCardRuntime,
});
