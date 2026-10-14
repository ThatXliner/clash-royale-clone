import { t as __esmMin } from "../../../../../rolldown-runtime-Cl99QfTQ.js";
import { D as init_session_troop_projectile_runtime, T as admitSessionTroopProjectileRuntimeFromSetup, w as admitSessionTroopProjectileRuntimeFromGameSnapshot } from "../../../../index~public/ui-arena-shell~src/rl/environment~src/ui/arena-shell-entry-RL6mb1Mf.js";
import { h as init_battle_continuation_kernel, s as GameSession$1 } from "../../../../index~public/ui-arena-shell~src/rl/environment~src/ui/arena-shell-entry-DoWZ9JV1.js";
//#region src/sim/game-session.js
var GameSession;
function init_game_session() {
	return (init_game_session = __esmMin((() => {
		init_battle_continuation_kernel();
		init_session_troop_projectile_runtime();
		GameSession = class GameSession extends GameSession$1 {
			constructor(canonicalSetup, restoreCapability = null) {
				super(canonicalSetup, restoreCapability, admitSessionTroopProjectileRuntimeFromSetup(canonicalSetup));
			}
			static restore(serialized) {
				const plan = admitSessionTroopProjectileRuntimeFromGameSnapshot(serialized);
				const restored = GameSession$1.restore(serialized, plan);
				Object.setPrototypeOf(restored, GameSession.prototype);
				return restored;
			}
		};
	})))();
}
//#endregion
export { init_game_session as n, GameSession as t };
