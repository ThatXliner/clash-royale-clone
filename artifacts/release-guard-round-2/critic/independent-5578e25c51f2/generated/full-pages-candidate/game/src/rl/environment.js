import { t as __esmMin } from "../../assets/rolldown-runtime-Cl99QfTQ.js";
import { P as init_playable_roster, c as init_session_card_catalog, i as EDITABLE_DECK_CARD_IDS, j as PLAYABLE_CARD_IDS, l as projectSessionNonUnitBattleCard, n as createEditableGameSessionSetup, o as init_session_troop_roster, r as init_editable_deck, t as EDITABLE_MIXED_DECK_CARD_IDS } from "../../assets/game-runtime~public/index~public/ui-arena-shell~src/rl/environment~src/ui/arena-shell-entry-7HYgJsNr.js";
import { E as createDefensiveBuildingQuestionRecords, O as init_buildings_defensive } from "../../assets/game-runtime~public/index~public/ui-arena-shell~src/rl/environment~src/ui/arena-shell-entry-DEU-_oia.js";
import { it as init_deployment, rt as evaluateDeployment } from "../../assets/game-runtime~public/index~public/ui-arena-shell~src/rl/environment~src/ui/arena-shell-entry-DHGDlboh.js";
import { r as init_attack_cycle, t as AttackCycle } from "../../assets/game-runtime~public/index~public/ui-arena-shell~src/rl/environment~src/ui/arena-shell-entry-iYK_h2t5.js";
import { i as GAME_SESSION_MAX_BATCH_TICKS } from "../../assets/game-runtime~public/index~public/ui-arena-shell~src/rl/environment~src/ui/arena-shell-entry-jbN8jSqD.js";
import { n as init_game_session, t as GameSession } from "../../assets/game-runtime~public/ui-arena-shell~src/rl/environment~src/ui/arena-shell-entry--RvRLFdN.js";
//#region src/rl/environment.js
function clone(value) {
	return structuredClone(value);
}
function canonical(value) {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function buildActionCatalog() {
	const actions = [{
		id: 0,
		type: "wait"
	}];
	for (let slot = 0; slot < 4; slot += 1) for (let row = 0; row < GRID_ROWS; row += 1) for (let column = 0; column < GRID_COLUMNS; column += 1) actions.push({
		id: 1 + slot * GRID_ROWS * GRID_COLUMNS + row * GRID_COLUMNS + column,
		point: {
			x: column * TILE_MILLITILES + TILE_MILLITILES / 2,
			y: row * TILE_MILLITILES + TILE_MILLITILES / 2
		},
		slot,
		type: "deploy"
	});
	return actions;
}
function assertOptions(value, label = "environment options") {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
	const allowed = /* @__PURE__ */ new Set([
		"deck",
		"horizonTicks",
		"seed",
		"strideTicks"
	]);
	for (const key of Object.keys(value)) if (!allowed.has(key)) throw new TypeError(`${label} contains an unknown field: ${key}`);
}
function checkedTickOption(value, fallback, label, maximum) {
	const result = value === void 0 ? fallback : value;
	if (!Number.isSafeInteger(result) || result < 1 || result > maximum) throw new RangeError(`${label} must be an integer from 1 through ${maximum}`);
	return result;
}
function checkedSeed(seed) {
	if (typeof seed !== "string" && !Number.isSafeInteger(seed)) throw new TypeError("seed must be a string or safe integer");
	return seed;
}
function checkedConfig(options) {
	assertOptions(options);
	const seed = checkedSeed(options.seed === void 0 ? 0 : options.seed);
	const strideTicks = checkedTickOption(options.strideTicks, 30, "strideTicks", GAME_SESSION_MAX_BATCH_TICKS);
	const horizonTicks = checkedTickOption(options.horizonTicks, RL_DEFAULT_HORIZON_TICKS, "horizonTicks", MAX_HORIZON_TICKS);
	const setup = createEditableGameSessionSetup(options.deck === void 0 ? PLAYABLE_CARD_IDS : options.deck, seed);
	return {
		deck: JSON.parse(setup).deck,
		horizonTicks,
		seed,
		strideTicks,
		setup
	};
}
function publicUnit(unit) {
	const result = {
		alive: unit.alive,
		cardId: unit.cardId,
		hitpoints: unit.hitpoints,
		id: unit.id,
		position: {
			x: unit.position.x,
			y: unit.position.y
		},
		side: unit.side
	};
	if (Number.isSafeInteger(unit.maxHealth)) result.maxHitpoints = unit.maxHealth;
	if (Number.isSafeInteger(unit.count)) result.count = unit.count;
	if (typeof unit.layer === "string") result.layer = unit.layer;
	return result;
}
function publicTower(tower) {
	return {
		active: tower.active,
		hitpoints: tower.hitpoints,
		id: tower.id,
		lane: tower.lane,
		position: {
			x: tower.position.x,
			y: tower.position.y
		},
		role: tower.role,
		side: tower.side
	};
}
function publicStructure(structure, tick) {
	const runtime = STRUCTURE_RUNTIMES.get(structure.cardId);
	if (!runtime) throw new TypeError(`RL observation has no admitted runtime for ${structure.cardId}`);
	const elapsedLifetimeTicks = Math.max(0, tick - structure.placedTick);
	const attackCycle = typeof structure.attackCycle === "string" ? AttackCycle.restore(structure.attackCycle).state : null;
	const result = {
		alive: structure.alive,
		attackState: attackCycle === null ? null : {
			nextAttackTick: attackCycle.nextAttackTick,
			phase: attackCycle.phase,
			sequence: attackCycle.attackSequence,
			targetId: attackCycle.targetId
		},
		cardId: structure.cardId,
		deathCause: structure.deathCause,
		hitpoints: structure.hitpoints,
		id: structure.id,
		layer: "ground",
		lifetime: {
			elapsedTicks: elapsedLifetimeTicks,
			remainingTicks: Math.max(0, runtime.lifetimeTicks - elapsedLifetimeTicks),
			totalTicks: runtime.lifetimeTicks,
			question: clone(DEFENSIVE_BUILDING_QUESTIONS.lifetimeTicks)
		},
		maxHitpoints: structure.maxHitpoints,
		owner: structure.side,
		position: {
			x: structure.position.x,
			y: structure.position.y
		},
		policy: clone(structure.policy),
		targetKey: structure.targetKey ?? null,
		targetMode: runtime.targetMode,
		targetable: structure.targetable
	};
	if (runtime.class === "defensive" && runtime.variant === "hidden") {
		result.hidden = structure.hidden;
		result.hiddenPolicyQuestions = Object.fromEntries([
			"hiddenInitialPolicy",
			"hiddenReconcealPolicy",
			"hiddenRevealAttackBoundary"
		].map((key) => [key, clone(DEFENSIVE_BUILDING_QUESTIONS[key])]));
	}
	return result;
}
function buildPlacementMask(placementClass) {
	return ACTIONS.slice(1, 577).map(({ point }) => evaluateDeployment({
		destroyedOpposingLaneTowers: [],
		placementClass,
		point,
		side: "south"
	}).legal);
}
function createRLEnvironment(options = {}) {
	return new RLEnvironment(options);
}
var RL_ENVIRONMENT_VERSION, RL_ACTION_COUNT, RL_DEFAULT_STRIDE_TICKS, RL_DEFAULT_HORIZON_TICKS, GRID_COLUMNS, GRID_ROWS, TILE_MILLITILES, MAX_HORIZON_TICKS, ACTIONS, STRUCTURE_RUNTIMES, DEFENSIVE_BUILDING_QUESTIONS, PLACEMENT_MASKS, RLEnvironment;
function init_environment() {
	return (init_environment = __esmMin((() => {
		init_editable_deck();
		init_session_card_catalog();
		init_buildings_defensive();
		init_attack_cycle();
		init_playable_roster();
		init_session_troop_roster();
		init_game_session();
		init_deployment();
		RL_ENVIRONMENT_VERSION = 2;
		RL_ACTION_COUNT = 2305;
		RL_DEFAULT_STRIDE_TICKS = 30;
		RL_DEFAULT_HORIZON_TICKS = 18e3;
		GRID_COLUMNS = 18;
		GRID_ROWS = 32;
		TILE_MILLITILES = 1e3;
		MAX_HORIZON_TICKS = 18e3;
		ACTIONS = buildActionCatalog();
		STRUCTURE_RUNTIMES = new Map(EDITABLE_MIXED_DECK_CARD_IDS.flatMap((id) => {
			if (EDITABLE_DECK_CARD_IDS.includes(id)) return [];
			const card = projectSessionNonUnitBattleCard(id);
			return card.kind === "structure" ? [[id, card.buildingRuntime]] : [];
		}));
		DEFENSIVE_BUILDING_QUESTIONS = createDefensiveBuildingQuestionRecords();
		PLACEMENT_MASKS = new Map(["global_effect", "ground_entity"].map((placementClass) => [placementClass, buildPlacementMask(placementClass)]));
		RLEnvironment = class RLEnvironment {
			#config;
			#session;
			#nextCommandId = 0;
			constructor(options = {}) {
				this.reset(options);
			}
			reset(options = {}) {
				assertOptions(options);
				const merged = { ...this.#config ?? {} };
				for (const [key, value] of Object.entries(options)) if (value !== void 0) merged[key] = value;
				const config = checkedConfig(merged);
				const session = new GameSession(config.setup);
				this.#config = {
					deck: config.deck,
					horizonTicks: config.horizonTicks,
					seed: config.seed,
					strideTicks: config.strideTicks
				};
				this.#session = session;
				this.#nextCommandId = 0;
				return this.observe();
			}
			actionSpace() {
				return {
					actionCount: RL_ACTION_COUNT,
					actions: clone(ACTIONS),
					grid: {
						columns: GRID_COLUMNS,
						rows: GRID_ROWS,
						tileSizeMillitiles: TILE_MILLITILES
					},
					idRule: "actionId = 1 + slot*576 + row*18 + column; action 0 waits",
					version: 2
				};
			}
			observe() {
				const state = this.#session.state;
				const status = state.terminal ? "terminated" : state.tick >= this.#config.horizonTicks ? "truncated" : "running";
				const cards = new Map(state.cardRuntime.cards.map((card) => [card.id, card]));
				const hand = [...state.decks.south.hand];
				const elixir = state.elixir.sides.south.amount;
				const actionMask = Array(RL_ACTION_COUNT).fill(false);
				if (status === "running") actionMask[0] = true;
				for (let slot = 0; status === "running" && slot < hand.length; slot += 1) {
					const card = cards.get(hand[slot]);
					if (!card || card.cost > elixir) continue;
					const legal = PLACEMENT_MASKS.get(card.placementClass);
					if (!legal) continue;
					const offset = 1 + slot * GRID_ROWS * GRID_COLUMNS;
					for (let index = 0; index < legal.length; index += 1) actionMask[offset + index] = legal[index];
				}
				return {
					actionMask,
					crowns: {
						north: state.clock.crowns.north,
						south: state.clock.crowns.south
					},
					elixir,
					hand,
					next: state.decks.south.next,
					phase: state.terminal ? "terminal" : state.clock.phase,
					status,
					tick: state.tick,
					towers: state.battle.towers.map(publicTower),
					units: state.battle.units.map(publicUnit),
					structures: [...state.battle.structures].sort((left, right) => left.id - right.id).map((structure) => publicStructure(structure, state.tick)),
					version: 2
				};
			}
			step(actionId) {
				if (this.#isDone()) throw new RangeError("cannot step a finished RL environment");
				if (!Number.isSafeInteger(actionId) || actionId < 0 || actionId >= 2305) throw new RangeError(`actionId must be an integer from 0 through 2304`);
				const before = this.observe();
				if (!before.actionMask[actionId]) throw new RangeError(`action ${actionId} is masked in the current observation`);
				const beforeBytes = actionId === 0 ? null : this.#session.serialize();
				try {
					if (actionId !== 0) {
						const action = ACTIONS[actionId];
						const card = before.hand[action.slot];
						const kind = this.#session.state.cardRuntime.cards.find((entry) => entry.id === card)?.kind;
						this.#session.submitPlayerCommand(canonical({
							cardId: card,
							commandId: this.#nextCommandId,
							point: action.point,
							slot: action.slot,
							tick: before.tick,
							...kind === "effect" ? { side: "south" } : {},
							type: kind === "effect" ? "spell" : "deploy"
						}));
					}
					const ticksToHorizon = this.#config.horizonTicks - this.#session.state.tick;
					const count = Math.min(this.#config.strideTicks, ticksToHorizon);
					this.#session.stepMany(count);
				} catch (error) {
					if (beforeBytes !== null) this.#session = GameSession.restore(beforeBytes);
					throw error;
				}
				if (actionId !== 0) this.#nextCommandId += 1;
				const state = this.#session.state;
				const terminated = state.terminal;
				const truncated = !terminated && state.tick >= this.#config.horizonTicks;
				const result = state.clock.result;
				const reward = !terminated ? 0 : result.winner === "south" ? 1 : result.winner === "north" ? -1 : 0;
				return {
					info: {
						actionId,
						ticksAdvanced: state.tick - before.tick
					},
					observation: this.observe(),
					reward,
					terminated,
					truncated
				};
			}
			serialize() {
				return canonical({
					config: this.#config,
					nextCommandId: this.#nextCommandId,
					session: this.#session.serialize(),
					version: 2
				});
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("serialized environment must be a string");
				let snapshot;
				try {
					snapshot = JSON.parse(serialized);
				} catch {
					throw new TypeError("serialized environment must be valid JSON");
				}
				if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot) || Object.keys(snapshot).sort().join(",") !== "config,nextCommandId,session,version" || snapshot.version !== 2 || typeof snapshot.session !== "string" || !Number.isSafeInteger(snapshot.nextCommandId) || snapshot.nextCommandId < 0) throw new TypeError("serialized environment has an invalid shape or version");
				const config = checkedConfig(snapshot.config);
				const session = GameSession.restore(snapshot.session);
				const sessionSnapshot = JSON.parse(snapshot.session);
				if (canonical(sessionSnapshot.setup) !== canonical(JSON.parse(config.setup))) throw new TypeError("serialized environment configuration does not match its GameSession");
				const state = session.state;
				if (state.tick > config.horizonTicks) throw new TypeError("serialized environment exceeds its configured horizon");
				if (state.paused || state.pendingPlayerCommands.length !== 0) throw new TypeError("RL environment checkpoint cannot contain a paused session or pending player commands");
				let commandCount = 0;
				for (const operation of sessionSnapshot.transcript) {
					if (operation.type !== "submit") continue;
					if (!["deploy", "spell"].includes(operation.command.type) || operation.command.commandId !== commandCount) throw new TypeError("serialized environment command counter is inconsistent");
					commandCount += 1;
				}
				if (commandCount !== snapshot.nextCommandId || serialized !== canonical(snapshot)) throw new TypeError("serialized environment is noncanonical or has an inconsistent counter");
				const environment = new RLEnvironment({
					deck: config.deck,
					horizonTicks: config.horizonTicks,
					seed: config.seed,
					strideTicks: config.strideTicks
				});
				environment.#config = {
					deck: config.deck,
					horizonTicks: config.horizonTicks,
					seed: config.seed,
					strideTicks: config.strideTicks
				};
				environment.#session = session;
				environment.#nextCommandId = snapshot.nextCommandId;
				return environment;
			}
			#isDone() {
				const state = this.#session.state;
				return state.terminal || state.tick >= this.#config.horizonTicks;
			}
		};
	})))();
}
//#endregion
init_environment();
export { RLEnvironment, RL_ACTION_COUNT, RL_DEFAULT_HORIZON_TICKS, RL_DEFAULT_STRIDE_TICKS, RL_ENVIRONMENT_VERSION, createRLEnvironment };
