// Public facade. Compact continuation machinery is lexical to the ownership kernel.
export {
  GAME_SESSION_MAX_BATCH_TICKS,
  GAME_SESSION_MAX_SETUP_BYTES,
  GAME_SESSION_MAX_SNAPSHOT_BYTES,
  GAME_SESSION_MAX_TRANSCRIPT,
  GAME_SESSION_SETUP_GRAPH_LIMITS,
  GAME_SESSION_SNAPSHOT_GRAPH_LIMITS,
  GameSession,
  isAuthenticGameSession,
  isAuthenticGameSessionProjectionSnapshot,
} from "./battle-continuation-kernel.js";
