import { t as __esmMin } from "../../../../../../rolldown-runtime-Cl99QfTQ.js";
import { A as init_ordinary_projectile_delivery_authority, B as createCardCatalog, T as ORDINARY_PROJECTILE_SOURCE_CLAIMS, V as init_schema } from "./arena-shell-entry-C8NHd_jT.js";
import { n as init_area_damage, t as AreaDamageSystem } from "./arena-shell-entry-BC9aY_Zk.js";
import { Ct as serializeFlyingState, Dt as init_movement, Et as createMovementState, Ot as restoreMovementState, St as restoreFlyingState, Tt as advanceMovement, _t as retainOrAcquireTarget, bt as createFlyingState, ct as init_pathfinding, ft as ProjectileCombat, gt as init_targeting, ht as acquireTarget$1, it as init_deployment, kt as serializeMovementState, pt as init_projectile, rt as evaluateDeployment, st as findGroundPath, t as init_elixir, vt as targetCandidate, wt as MOVEMENT_SPEEDS, xt as init_flying, yt as advanceFlying } from "./arena-shell-entry-D5weJ7hm.js";
import { $ as init_special_projectiles_reflection, A as init_special_movement_recoil, B as createDashSpecialFixture, H as init_special_movement_dash, J as init_special_movement_charge, K as createChargeSpecialFixture, L as DashEncounter, O as createRecoilSpecialFixture, Q as createReflectionSpecialFixture, T as RecoilEncounter, U as ChargeSpecialEncounter, Y as ReflectionEncounter, a as LeapKnockbackRetargetEncounter, c as init_special_movement_leap_knockback, o as createLeapKnockbackFixture } from "./arena-shell-entry-CEfYVuAM.js";
import { r as init_attack_cycle, t as AttackCycle } from "./arena-shell-entry-iYK_h2t5.js";
import { S as createRampFixture, T as init_special_combat_ramp, o as InstantaneousCombatResetEncounter, s as createResetFixture, u as init_special_combat_reset, x as ConsecutiveTargetRampEncounter } from "./arena-shell-entry-BQhEU8w9.js";
import { r as init_spawn_placement, t as SpawnBatchMaterializer } from "./arena-shell-entry-Ch9grTTJ.js";
import { n as ELIXIR_CAPACITY, r as ElixirMatch } from "./arena-shell-entry-0OqWVvCI.js";
//#region src/content/cards/basic-melee.js
function checkedPlacement(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("basic melee placement must be a plain object");
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const keys = Reflect.ownKeys(descriptors);
	if (keys.length !== PLACEMENT_KEYS.length || keys.some((key) => typeof key !== "string" || !PLACEMENT_KEYS.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError("basic melee placement has an invalid shape");
	if (!Number.isSafeInteger(value.entityId) || value.entityId < 1) throw new TypeError("basic melee entityId must be a positive safe integer");
	if (!Number.isSafeInteger(value.position)) throw new TypeError("basic melee position must be a safe integer");
	if (!Number.isSafeInteger(value.radius) || value.radius < 0) throw new TypeError("basic melee radius must be a non-negative safe integer");
	return {
		entityId: value.entityId,
		position: value.position,
		radius: value.radius
	};
}
/**
* Returns a newly validated and isolated catalog of this slice's original
* single-unit ground-melee definitions.
*/
function createBasicMeleeCatalog() {
	return createCardCatalog(DEFINITIONS$7);
}
/**
* Projects one runtime card into the existing deterministic melee integration.
* Entity placement and body radius are battle state, not card statistics.
*/
function createBasicMeleeCombatant(cardId, placement) {
	if (typeof cardId !== "string") throw new TypeError("basic melee card id must be a string");
	const card = createBasicMeleeCatalog().find(({ id }) => id === cardId);
	if (card === void 0) throw new RangeError(`unknown basic melee card id: ${cardId}`);
	const checked = checkedPlacement(placement);
	return {
		damage: card.damage,
		deployTicks: card.deployTimeTicks,
		firstHitTicks: card.firstHitTicks,
		hitSpeedTicks: card.hitSpeedTicks,
		hitpoints: card.hitpoints,
		id: checked.entityId,
		position: checked.position,
		radius: checked.radius,
		reach: card.rangeMillitiles,
		sightRange: card.sightRangeMillitiles,
		speed: card.movementMillitilesPerSecond
	};
}
var DEFINITIONS$7, PLACEMENT_KEYS;
function init_basic_melee() {
	return (init_basic_melee = __esmMin((() => {
		init_schema();
		DEFINITIONS$7 = [
			{
				id: "mossguard",
				displayName: "Mossguard",
				cost: 3,
				kind: "unit",
				rarity: "standard",
				hitpoints: 1766,
				damage: 202,
				hitSpeedTicks: 72,
				firstHitTicks: 42,
				deployTimeTicks: 60,
				rangeMillitiles: 1200,
				sightRangeMillitiles: 5500,
				movementMillitilesPerSecond: 1e3,
				targetMode: "ground",
				count: 1,
				areaDamageRadiusMillitiles: null,
				components: []
			},
			{
				id: "coilblade",
				displayName: "Coilblade",
				cost: 4,
				kind: "unit",
				rarity: "uncommon",
				hitpoints: 1361,
				damage: 720,
				hitSpeedTicks: 96,
				firstHitTicks: 66,
				deployTimeTicks: 60,
				rangeMillitiles: 800,
				sightRangeMillitiles: 5500,
				movementMillitilesPerSecond: 1500,
				targetMode: "ground",
				count: 1,
				areaDamageRadiusMillitiles: null,
				components: []
			},
			{
				id: "ironroot",
				displayName: "Ironroot",
				cost: 7,
				kind: "unit",
				rarity: "special",
				hitpoints: 3760,
				damage: 816,
				hitSpeedTicks: 108,
				firstHitTicks: 78,
				deployTimeTicks: 60,
				rangeMillitiles: 1200,
				sightRangeMillitiles: 5e3,
				movementMillitilesPerSecond: 750,
				targetMode: "ground",
				count: 1,
				areaDamageRadiusMillitiles: null,
				components: []
			}
		];
		PLACEMENT_KEYS = [
			"entityId",
			"position",
			"radius"
		];
	})))();
}
//#endregion
//#region src/content/cards/basic-flying.js
function exactRecord$14(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function safeInteger$6(value, label, minimum) {
	if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError(`${label} must be a safe integer of at least ${minimum}`);
}
function clone$15(value) {
	return JSON.parse(JSON.stringify(value));
}
function canonicalJson$15(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$15).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$15(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function modeForTargeting(mode) {
	if (mode === "ground-and-air") return "air_and_ground";
	return mode;
}
function checkedCombatant$1(value, index) {
	const label = `basic flying combatant ${index}`;
	const combatant = exactRecord$14(value, COMBATANT_KEYS$1, label);
	if (typeof combatant.cardId !== "string" || combatant.cardId.length === 0) throw new TypeError(`${label}.cardId must be a non-empty string`);
	for (const field of [
		"damage",
		"deployTicks",
		"firstHitTicks",
		"hitSpeedTicks",
		"hitpoints",
		"id",
		"range"
	]) safeInteger$6(combatant[field], `${label}.${field}`, [
		"deployTicks",
		"firstHitTicks",
		"range"
	].includes(field) ? 0 : 1);
	if (combatant.targetMode !== "ground-and-air") throw new TypeError(`${label}.targetMode must be ground-and-air`);
	if (combatant.deployTicks > Number.MAX_SAFE_INTEGER - combatant.firstHitTicks) throw new RangeError(`${label} first attack exceeds the safe tick range`);
	return combatant;
}
function checkedSetup$13(value) {
	const setup = exactRecord$14(value, ["combatants"], "basic flying setup");
	if (!Array.isArray(setup.combatants) || Object.getPrototypeOf(setup.combatants) !== Array.prototype || setup.combatants.length !== 2) throw new TypeError("basic flying setup requires exactly two combatants");
	const descriptors = Object.getOwnPropertyDescriptors(setup.combatants);
	if (Reflect.ownKeys(descriptors).length !== 3 || [0, 1].some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError("basic flying combatants must be a dense data-only array");
	const combatants = setup.combatants.map(checkedCombatant$1).sort((left, right) => left.id - right.id);
	if (combatants[0].id === combatants[1].id) throw new TypeError("basic flying combatants must have unique IDs");
	for (const combatant of combatants) {
		let canonical;
		try {
			canonical = createBasicFlyingCombatant(combatant.cardId, combatant.id);
		} catch {
			throw new TypeError("basic flying combatants must select an original runtime card");
		}
		if (canonicalJson$15(combatant) !== canonicalJson$15(canonical)) throw new TypeError("basic flying combatants must match their runtime card definition");
	}
	return { combatants };
}
function projectileSetup$2(combatants) {
	return { entities: combatants.map((combatant) => ({
		attackRange: combatant.range,
		id: combatant.id,
		kind: "troop",
		layer: "air",
		maxHealth: combatant.hitpoints,
		position: {
			x: 0,
			y: 0
		},
		radius: 0,
		targetMode: modeForTargeting(combatant.targetMode),
		targetable: true
	})) };
}
function duelSnapshotLimits$1(combatants) {
	const firstAttackTick = (combatant) => combatant.deployTicks + combatant.firstHitTicks;
	const lethalTick = (attacker, target) => {
		const requiredHits = Math.ceil(target.hitpoints / attacker.damage);
		return firstAttackTick(attacker) + (requiredHits - 1) * attacker.hitSpeedTicks;
	};
	const resolutionBoundary = Math.min(lethalTick(combatants[0], combatants[1]), lethalTick(combatants[1], combatants[0]));
	const launchesThroughResolution = combatants.reduce((total, combatant) => {
		const first = firstAttackTick(combatant);
		if (first > resolutionBoundary) return total;
		return total + Math.floor((resolutionBoundary - first) / combatant.hitSpeedTicks) + 1;
	}, 0);
	const maximumTick = resolutionBoundary + 1;
	return {
		maximumHistoryEntries: maximumTick + launchesThroughResolution,
		maximumTick
	};
}
function createBasicFlyingCatalog() {
	return createCardCatalog(DEFINITIONS$6);
}
function createBasicFlyingCombatant(cardId, entityId) {
	if (typeof cardId !== "string") throw new TypeError("basic flying card id must be a string");
	safeInteger$6(entityId, "basic flying entityId", 1);
	const card = createBasicFlyingCatalog().find(({ id }) => id === cardId);
	if (card === void 0) throw new RangeError(`unknown basic flying card id: ${cardId}`);
	return {
		cardId: card.id,
		damage: card.damage,
		deployTicks: card.deployTimeTicks,
		firstHitTicks: card.firstHitTicks,
		hitSpeedTicks: card.hitSpeedTicks,
		hitpoints: card.hitpoints,
		id: entityId,
		range: card.rangeMillitiles,
		targetMode: card.targetMode
	};
}
/**
* Binds an original flying card's speed to the shared deterministic flying
* movement engine. Only axis-aligned paths are claimed by that engine.
*/
function createBasicFlyingMovement(cardId, options = {}) {
	const card = createBasicFlyingCatalog().find(({ id }) => id === cardId);
	if (card === void 0) throw new RangeError(`unknown basic flying card id: ${cardId}`);
	return createFlyingState({
		...options,
		speed: card.movementMillitilesPerSecond
	});
}
function advanceBasicFlyingMovement(state, ticks = 1) {
	return advanceFlying(state, ticks);
}
function serializeBasicFlyingMovement(state) {
	return serializeFlyingState(state);
}
function restoreBasicFlyingMovement(serialized) {
	return restoreFlyingState(serialized);
}
/**
* Delegates layer eligibility and deterministic tie-breaking to targeting.
*/
function acquireBasicFlyingTarget(cardId, origin, candidates) {
	const card = createBasicFlyingCatalog().find(({ id }) => id === cardId);
	if (card === void 0) throw new RangeError(`unknown basic flying card id: ${cardId}`);
	return acquireTarget$1(origin, candidates, {
		mode: modeForTargeting(card.targetMode),
		sightRange: card.sightRangeMillitiles
	});
}
var DEFINITIONS$6, COMBATANT_KEYS$1, IDENTITY_KEYS$7, BasicFlyingDuel;
function init_basic_flying() {
	return (init_basic_flying = __esmMin((() => {
		init_flying();
		init_projectile();
		init_targeting();
		init_schema();
		DEFINITIONS$6 = [{
			id: "skymaul",
			displayName: "Skymaul",
			cost: 3,
			kind: "unit",
			rarity: "uncommon",
			hitpoints: 837,
			damage: 311,
			hitSpeedTicks: 96,
			firstHitTicks: 72,
			deployTimeTicks: 60,
			rangeMillitiles: 1600,
			sightRangeMillitiles: 5500,
			movementMillitilesPerSecond: 1e3,
			targetMode: "ground-and-air",
			count: 1,
			areaDamageRadiusMillitiles: null,
			components: []
		}, {
			id: "copperskiff",
			displayName: "Copperskiff",
			cost: 4,
			kind: "unit",
			rarity: "uncommon",
			hitpoints: 614,
			damage: 171,
			hitSpeedTicks: 66,
			firstHitTicks: 36,
			deployTimeTicks: 60,
			rangeMillitiles: 6e3,
			sightRangeMillitiles: 6e3,
			movementMillitilesPerSecond: 1500,
			targetMode: "ground-and-air",
			count: 1,
			areaDamageRadiusMillitiles: null,
			components: []
		}];
		COMBATANT_KEYS$1 = [
			"cardId",
			"damage",
			"deployTicks",
			"firstHitTicks",
			"hitSpeedTicks",
			"hitpoints",
			"id",
			"range",
			"targetMode"
		];
		IDENTITY_KEYS$7 = ["cardId", "id"];
		BasicFlyingDuel = class BasicFlyingDuel {
			#combat;
			#initial;
			#nextAttacks = /* @__PURE__ */ new Map();
			#tick = 0;
			constructor(setup) {
				this.#initial = checkedSetup$13(setup);
				this.#combat = new ProjectileCombat(projectileSetup$2(this.#initial.combatants));
				for (const combatant of this.#initial.combatants) this.#nextAttacks.set(combatant.id, combatant.deployTicks + combatant.firstHitTicks);
			}
			get replay() {
				return this.#combat.replay;
			}
			get state() {
				return clone$15({
					combatants: this.#combat.state.entities,
					nextAttacks: this.#initial.combatants.map(({ id }) => ({
						id,
						tick: this.#nextAttacks.get(id)
					})),
					tick: this.#tick
				});
			}
			step() {
				if (this.#outcome() !== null) throw new RangeError("basic flying duel cannot step after its outcome");
				const health = new Map(this.#combat.state.entities.map((entity) => [entity.id, entity]));
				const launched = [];
				for (const combatant of this.#initial.combatants) {
					const target = this.#initial.combatants.find(({ id }) => id !== combatant.id);
					if (this.#nextAttacks.get(combatant.id) === this.#tick && health.get(combatant.id).alive && health.get(target.id).alive) {
						const next = this.#tick + combatant.hitSpeedTicks;
						if (!Number.isSafeInteger(next)) throw new RangeError("basic flying attack tick space is exhausted");
						this.#combat.launch({
							attackerId: combatant.id,
							damage: combatant.damage,
							radius: 0,
							speed: 1,
							targetId: target.id,
							tick: this.#tick
						});
						this.#nextAttacks.set(combatant.id, next);
						launched.push(combatant.id);
					}
				}
				const events = this.#combat.step(this.#tick);
				this.#tick += 1;
				return clone$15({
					events,
					launched,
					tick: this.#tick - 1
				});
			}
			stepMany(count) {
				safeInteger$6(count, "basic flying step count", 0);
				for (let index = 0; index < count; index += 1) this.step();
				return this.state;
			}
			run(maxTick) {
				safeInteger$6(maxTick, "basic flying maximum tick", 0);
				while (this.#tick <= maxTick && this.#outcome() === null) this.step();
				return clone$15({
					outcome: this.#outcome(),
					state: this.state
				});
			}
			serialize() {
				return canonicalJson$15({
					combat: JSON.parse(this.#combat.serialize()),
					identity: this.#initial.combatants.map(({ cardId, id }) => ({
						cardId,
						id
					})),
					nextAttacks: this.#initial.combatants.map(({ id }) => ({
						id,
						tick: this.#nextAttacks.get(id)
					})),
					tick: this.#tick,
					version: 1
				});
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("serialized basic flying duel must be a string");
				let snapshot;
				try {
					snapshot = JSON.parse(serialized);
				} catch {
					throw new TypeError("serialized basic flying duel must be valid JSON");
				}
				const checked = exactRecord$14(snapshot, [
					"combat",
					"identity",
					"nextAttacks",
					"tick",
					"version"
				], "basic flying snapshot");
				if (checked.version !== 1) throw new TypeError("basic flying snapshot has an unsupported version");
				safeInteger$6(checked.tick, "basic flying snapshot.tick", 0);
				if (!Array.isArray(checked.identity) || Object.getPrototypeOf(checked.identity) !== Array.prototype || checked.identity.length !== 2) throw new TypeError("basic flying snapshot identity is invalid");
				const identity = checked.identity.map((value, index) => {
					const entry = exactRecord$14(value, IDENTITY_KEYS$7, `basic flying snapshot identity[${index}]`);
					if (typeof entry.cardId !== "string" || entry.cardId.length === 0) throw new TypeError(`basic flying snapshot identity[${index}].cardId is invalid`);
					safeInteger$6(entry.id, `basic flying snapshot identity[${index}].id`, 1);
					return entry;
				});
				if (identity[0].id === identity[1].id) throw new TypeError("basic flying snapshot identity has duplicate IDs");
				const canonicalCombatants = identity.map(({ cardId, id }) => createBasicFlyingCombatant(cardId, id));
				const limits = duelSnapshotLimits$1(canonicalCombatants);
				if (checked.tick > limits.maximumTick) throw new RangeError("basic flying snapshot.tick exceeds its derived duel limit");
				const combat = exactRecord$14(checked.combat, [
					"history",
					"setup",
					"version"
				], "basic flying snapshot combat");
				if (combat.version !== 1) throw new TypeError("basic flying snapshot combat has an unsupported version");
				if (!Array.isArray(combat.history) || Object.getPrototypeOf(combat.history) !== Array.prototype) throw new TypeError("basic flying snapshot combat history is invalid");
				if (combat.history.length > limits.maximumHistoryEntries) throw new RangeError("basic flying snapshot combat history exceeds its derived duel limit");
				const duel = new BasicFlyingDuel({ combatants: canonicalCombatants });
				if (!Array.isArray(checked.nextAttacks) || Object.getPrototypeOf(checked.nextAttacks) !== Array.prototype || checked.nextAttacks.length !== 2) throw new TypeError("basic flying snapshot nextAttacks is invalid");
				const nextAttacks = /* @__PURE__ */ new Map();
				for (let index = 0; index < checked.nextAttacks.length; index += 1) {
					const entry = exactRecord$14(checked.nextAttacks[index], ["id", "tick"], `basic flying snapshot nextAttacks[${index}]`);
					safeInteger$6(entry.id, `basic flying snapshot nextAttacks[${index}].id`, 1);
					safeInteger$6(entry.tick, `basic flying snapshot nextAttacks[${index}].tick`, 0);
					if (nextAttacks.has(entry.id)) throw new TypeError("basic flying snapshot nextAttacks has duplicate IDs");
					nextAttacks.set(entry.id, entry.tick);
				}
				while (duel.#tick < checked.tick) {
					if (duel.#outcome() !== null) throw new TypeError("basic flying snapshot contains post-terminal history");
					duel.step();
				}
				const expected = JSON.parse(duel.serialize());
				if (canonicalJson$15(checked.combat) !== canonicalJson$15(expected.combat)) throw new TypeError("basic flying snapshot combat history is incoherent");
				if (canonicalJson$15(checked.identity) !== canonicalJson$15(expected.identity) || canonicalJson$15(checked.nextAttacks) !== canonicalJson$15(expected.nextAttacks)) throw new TypeError("basic flying snapshot cadence is incoherent");
				return duel;
			}
			#outcome() {
				const alive = this.#combat.state.entities.filter(({ alive }) => alive);
				if (alive.length === 2) return null;
				return {
					deathTick: this.#combat.replay.filter(({ type }) => type === "death").at(-1)?.tick ?? null,
					draw: alive.length === 0,
					winnerId: alive.length === 1 ? alive[0].id : null
				};
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/basic-ranged.js
function exactRecord$13(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function safeInteger$5(value, label, minimum) {
	if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError(`${label} must be a safe integer of at least ${minimum}`);
}
function checkedCombatant(value, index) {
	const label = `basic ranged combatant ${index}`;
	const combatant = exactRecord$13(value, COMBATANT_KEYS, label);
	if (typeof combatant.cardId !== "string" || combatant.cardId.length === 0) throw new TypeError(`${label}.cardId must be a non-empty string`);
	for (const field of [
		"damage",
		"deployTicks",
		"firstHitTicks",
		"hitSpeedTicks",
		"hitpoints",
		"id",
		"range"
	]) safeInteger$5(combatant[field], `${label}.${field}`, [
		"deployTicks",
		"firstHitTicks",
		"range"
	].includes(field) ? 0 : 1);
	if (combatant.targetMode !== "ground-and-air") throw new TypeError(`${label}.targetMode must be ground-and-air`);
	if (combatant.deployTicks > Number.MAX_SAFE_INTEGER - combatant.firstHitTicks) throw new RangeError(`${label} first attack exceeds the safe tick range`);
	return combatant;
}
function checkedSetup$12(value) {
	const setup = exactRecord$13(value, SETUP_KEYS$8, "basic ranged setup");
	if (!Array.isArray(setup.combatants) || Object.getPrototypeOf(setup.combatants) !== Array.prototype || setup.combatants.length !== 2) throw new TypeError("basic ranged setup requires exactly two combatants");
	const descriptors = Object.getOwnPropertyDescriptors(setup.combatants);
	if (Reflect.ownKeys(descriptors).length !== 3 || [0, 1].some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError("basic ranged combatants must be a dense data-only array");
	const combatants = setup.combatants.map(checkedCombatant).sort((left, right) => left.id - right.id);
	if (combatants[0].id === combatants[1].id) throw new TypeError("basic ranged combatants must have unique IDs");
	for (const combatant of combatants) {
		let canonical;
		try {
			canonical = createBasicRangedCombatant(combatant.cardId, combatant.id);
		} catch {
			throw new TypeError("basic ranged combatants must select an original runtime card");
		}
		if (canonicalJson$14(combatant) !== canonicalJson$14(canonical)) throw new TypeError("basic ranged combatants must match their runtime card definition");
	}
	return { combatants };
}
function clone$14(value) {
	return JSON.parse(JSON.stringify(value));
}
function canonicalJson$14(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$14).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$14(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function projectileSetup$1(combatants) {
	return { entities: combatants.map((combatant) => ({
		attackRange: combatant.range,
		id: combatant.id,
		kind: "troop",
		layer: "ground",
		maxHealth: combatant.hitpoints,
		position: {
			x: 0,
			y: 0
		},
		radius: 0,
		targetMode: "air_and_ground",
		targetable: true
	})) };
}
function duelSnapshotLimits(combatants) {
	const firstAttackTick = (combatant) => combatant.deployTicks + combatant.firstHitTicks;
	const lethalTick = (attacker, target) => {
		const requiredHits = Math.ceil(target.hitpoints / attacker.damage);
		return firstAttackTick(attacker) + (requiredHits - 1) * attacker.hitSpeedTicks;
	};
	const resolutionBoundary = Math.min(lethalTick(combatants[0], combatants[1]), lethalTick(combatants[1], combatants[0]));
	const launchesThroughResolution = combatants.reduce((total, combatant) => {
		const first = firstAttackTick(combatant);
		if (first > resolutionBoundary) return total;
		return total + Math.floor((resolutionBoundary - first) / combatant.hitSpeedTicks) + 1;
	}, 0);
	const maximumTick = resolutionBoundary + 1;
	return {
		maximumHistoryEntries: maximumTick + launchesThroughResolution,
		maximumTick
	};
}
/**
* Returns a newly validated and isolated catalog of this slice's two original
* single-projectile ground-troop definitions.
*/
function createBasicRangedCatalog() {
	return createCardCatalog(DEFINITIONS$5);
}
/**
* Projects one definition into the deterministic ranged-duel adapter.
* Projectile geometry is deliberately not part of the card definition.
*/
function createBasicRangedCombatant(cardId, entityId) {
	if (typeof cardId !== "string") throw new TypeError("basic ranged card id must be a string");
	safeInteger$5(entityId, "basic ranged entityId", 1);
	const card = createBasicRangedCatalog().find(({ id }) => id === cardId);
	if (card === void 0) throw new RangeError(`unknown basic ranged card id: ${cardId}`);
	return {
		cardId: card.id,
		damage: card.damage,
		deployTicks: card.deployTimeTicks,
		firstHitTicks: card.firstHitTicks,
		hitSpeedTicks: card.hitSpeedTicks,
		hitpoints: card.hitpoints,
		id: entityId,
		range: card.rangeMillitiles,
		targetMode: card.targetMode
	};
}
var DEFINITIONS$5, COMBATANT_KEYS, SETUP_KEYS$8, IDENTITY_KEYS$6, BasicRangedDuel;
function init_basic_ranged() {
	return (init_basic_ranged = __esmMin((() => {
		init_projectile();
		init_schema();
		DEFINITIONS$5 = [{
			id: "brassbolt",
			displayName: "Brassbolt",
			cost: 4,
			kind: "unit",
			rarity: "uncommon",
			hitpoints: 720,
			damage: 218,
			hitSpeedTicks: 60,
			firstHitTicks: 12,
			deployTimeTicks: 60,
			rangeMillitiles: 6e3,
			sightRangeMillitiles: 6e3,
			movementMillitilesPerSecond: 1e3,
			targetMode: "ground-and-air",
			count: 1,
			areaDamageRadiusMillitiles: null,
			components: []
		}, {
			id: "reedsting",
			displayName: "Reedsting",
			cost: 3,
			kind: "unit",
			rarity: "uncommon",
			hitpoints: 260,
			damage: 131,
			hitSpeedTicks: 42,
			firstHitTicks: 21,
			deployTimeTicks: 60,
			rangeMillitiles: 6500,
			sightRangeMillitiles: 7500,
			movementMillitilesPerSecond: 2e3,
			targetMode: "ground-and-air",
			count: 1,
			areaDamageRadiusMillitiles: null,
			components: []
		}];
		COMBATANT_KEYS = [
			"cardId",
			"damage",
			"deployTicks",
			"firstHitTicks",
			"hitSpeedTicks",
			"hitpoints",
			"id",
			"range",
			"targetMode"
		];
		SETUP_KEYS$8 = ["combatants"];
		IDENTITY_KEYS$6 = ["cardId", "id"];
		BasicRangedDuel = class BasicRangedDuel {
			#combat;
			#initial;
			#nextAttacks = /* @__PURE__ */ new Map();
			#tick = 0;
			constructor(setup) {
				this.#initial = checkedSetup$12(setup);
				this.#combat = new ProjectileCombat(projectileSetup$1(this.#initial.combatants));
				for (const combatant of this.#initial.combatants) this.#nextAttacks.set(combatant.id, combatant.deployTicks + combatant.firstHitTicks);
			}
			get replay() {
				return this.#combat.replay;
			}
			get state() {
				return clone$14({
					combatants: this.#combat.state.entities,
					nextAttacks: this.#initial.combatants.map(({ id }) => ({
						id,
						tick: this.#nextAttacks.get(id)
					})),
					tick: this.#tick
				});
			}
			step() {
				if (this.#outcome() !== null) throw new RangeError("basic ranged duel cannot step after its outcome");
				const health = new Map(this.#combat.state.entities.map((entity) => [entity.id, entity]));
				const launched = [];
				for (const combatant of this.#initial.combatants) {
					const target = this.#initial.combatants.find(({ id }) => id !== combatant.id);
					if (this.#nextAttacks.get(combatant.id) === this.#tick && health.get(combatant.id).alive && health.get(target.id).alive) {
						const next = this.#tick + combatant.hitSpeedTicks;
						if (!Number.isSafeInteger(next)) throw new RangeError("basic ranged attack tick space is exhausted");
						this.#combat.launch({
							attackerId: combatant.id,
							damage: combatant.damage,
							radius: 0,
							speed: 1,
							targetId: target.id,
							tick: this.#tick
						});
						this.#nextAttacks.set(combatant.id, next);
						launched.push(combatant.id);
					}
				}
				const events = this.#combat.step(this.#tick);
				this.#tick += 1;
				return clone$14({
					events,
					launched,
					tick: this.#tick - 1
				});
			}
			stepMany(count) {
				safeInteger$5(count, "basic ranged step count", 0);
				for (let index = 0; index < count; index += 1) this.step();
				return this.state;
			}
			run(maxTick) {
				safeInteger$5(maxTick, "basic ranged maximum tick", 0);
				while (this.#tick <= maxTick && this.#outcome() === null) this.step();
				return clone$14({
					outcome: this.#outcome(),
					state: this.state
				});
			}
			serialize() {
				return canonicalJson$14({
					combat: JSON.parse(this.#combat.serialize()),
					identity: this.#initial.combatants.map(({ cardId, id }) => ({
						cardId,
						id
					})),
					nextAttacks: this.#initial.combatants.map(({ id }) => ({
						id,
						tick: this.#nextAttacks.get(id)
					})),
					tick: this.#tick,
					version: 2
				});
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("serialized basic ranged duel must be a string");
				let snapshot;
				try {
					snapshot = JSON.parse(serialized);
				} catch {
					throw new TypeError("serialized basic ranged duel must be valid JSON");
				}
				const checked = exactRecord$13(snapshot, [
					"combat",
					"identity",
					"nextAttacks",
					"tick",
					"version"
				], "basic ranged snapshot");
				if (checked.version !== 2) throw new TypeError("basic ranged snapshot has an unsupported version");
				safeInteger$5(checked.tick, "basic ranged snapshot.tick", 0);
				if (!Array.isArray(checked.identity) || Object.getPrototypeOf(checked.identity) !== Array.prototype || checked.identity.length !== 2) throw new TypeError("basic ranged snapshot identity is invalid");
				const identity = checked.identity.map((value, index) => {
					const entry = exactRecord$13(value, IDENTITY_KEYS$6, `basic ranged snapshot identity[${index}]`);
					if (typeof entry.cardId !== "string" || entry.cardId.length === 0) throw new TypeError(`basic ranged snapshot identity[${index}].cardId is invalid`);
					safeInteger$5(entry.id, `basic ranged snapshot identity[${index}].id`, 1);
					return entry;
				});
				if (identity[0].id === identity[1].id) throw new TypeError("basic ranged snapshot identity has duplicate IDs");
				const canonicalCombatants = identity.map(({ cardId, id }) => createBasicRangedCombatant(cardId, id));
				const limits = duelSnapshotLimits(canonicalCombatants);
				if (checked.tick > limits.maximumTick) throw new RangeError("basic ranged snapshot.tick exceeds its derived duel limit");
				const combat = exactRecord$13(checked.combat, [
					"history",
					"setup",
					"version"
				], "basic ranged snapshot combat");
				if (combat.version !== 1) throw new TypeError("basic ranged snapshot combat has an unsupported version");
				if (!Array.isArray(combat.history) || Object.getPrototypeOf(combat.history) !== Array.prototype) throw new TypeError("basic ranged snapshot combat history is invalid");
				if (combat.history.length > limits.maximumHistoryEntries) throw new RangeError("basic ranged snapshot combat history exceeds its derived duel limit");
				const duel = new BasicRangedDuel({ combatants: canonicalCombatants });
				if (!Array.isArray(checked.nextAttacks) || Object.getPrototypeOf(checked.nextAttacks) !== Array.prototype || checked.nextAttacks.length !== 2) throw new TypeError("basic ranged snapshot nextAttacks is invalid");
				const nextAttacks = /* @__PURE__ */ new Map();
				for (let index = 0; index < checked.nextAttacks.length; index += 1) {
					const entry = exactRecord$13(checked.nextAttacks[index], ["id", "tick"], `basic ranged snapshot nextAttacks[${index}]`);
					safeInteger$5(entry.id, `basic ranged snapshot nextAttacks[${index}].id`, 1);
					safeInteger$5(entry.tick, `basic ranged snapshot nextAttacks[${index}].tick`, 0);
					if (nextAttacks.has(entry.id)) throw new TypeError("basic ranged snapshot nextAttacks has duplicate IDs");
					nextAttacks.set(entry.id, entry.tick);
				}
				while (duel.#tick < checked.tick) {
					if (duel.#outcome() !== null) throw new TypeError("basic ranged snapshot contains post-terminal history");
					duel.step();
				}
				const expected = JSON.parse(duel.serialize());
				if (canonicalJson$14(checked.combat) !== canonicalJson$14(expected.combat)) throw new TypeError("basic ranged snapshot combat history is incoherent");
				if (canonicalJson$14(checked.identity) !== canonicalJson$14(expected.identity) || canonicalJson$14(checked.nextAttacks) !== canonicalJson$14(expected.nextAttacks)) throw new TypeError("basic ranged snapshot cadence is incoherent");
				return duel;
			}
			#outcome() {
				const alive = this.#combat.state.entities.filter(({ alive: isAlive }) => isAlive);
				if (alive.length === 2) return null;
				return {
					deathTick: this.#combat.replay.filter(({ type }) => type === "death").at(-1)?.tick ?? null,
					draw: alive.length === 0,
					winnerId: alive.length === 1 ? alive[0].id : null
				};
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/ordinary-projectile-splash.js
/** Returns the original single-unit source row for the ordinary splash profile. */
function createOrdinaryProjectileSplashCatalog() {
	return createCardCatalog(DEFINITIONS$4);
}
var DEFINITIONS$4;
function init_ordinary_projectile_splash() {
	return (init_ordinary_projectile_splash = __esmMin((() => {
		init_schema();
		DEFINITIONS$4 = [{
			id: "kilnkeeper",
			displayName: "Kilnkeeper",
			cost: 5,
			kind: "unit",
			rarity: "uncommon",
			hitpoints: 720,
			damage: 281,
			hitSpeedTicks: 84,
			firstHitTicks: 60,
			deployTimeTicks: 60,
			rangeMillitiles: 5500,
			sightRangeMillitiles: 5500,
			movementMillitilesPerSecond: 1e3,
			targetMode: "ground-and-air",
			count: 1,
			areaDamageRadiusMillitiles: null,
			components: [{
				id: "kilnkeeper",
				displayName: "Kilnkeeper",
				kind: "unit",
				role: "primary",
				hitpoints: 720,
				damage: 281,
				hitSpeedTicks: 84,
				firstHitTicks: 60,
				deployTimeTicks: 60,
				rangeMillitiles: 5500,
				sightRangeMillitiles: 5500,
				movementMillitilesPerSecond: 1e3,
				targetMode: "ground-and-air",
				count: 1,
				areaDamageRadiusMillitiles: null
			}]
		}];
	})))();
}
//#endregion
//#region src/content/cards/ordinary-projectile-squads.js
/** Returns the source rows for the original paired and flying projectile squads. */
function createOrdinaryProjectileSquadCatalog() {
	return createCardCatalog(DEFINITIONS$3);
}
var SUNTHREAD_SOURCE, DUSKWING_SOURCE, COPPERSHADE_SOURCE, DEFINITIONS$3;
function init_ordinary_projectile_squads() {
	return (init_ordinary_projectile_squads = __esmMin((() => {
		init_schema();
		init_ordinary_projectile_delivery_authority();
		[SUNTHREAD_SOURCE, DUSKWING_SOURCE, COPPERSHADE_SOURCE] = ORDINARY_PROJECTILE_SOURCE_CLAIMS;
		DEFINITIONS$3 = [
			{
				id: SUNTHREAD_SOURCE.cardId,
				displayName: "Sunthread Pair",
				cost: 3,
				kind: "unit",
				rarity: "standard",
				hitpoints: 304,
				damage: 107,
				hitSpeedTicks: 54,
				firstHitTicks: 48,
				deployTimeTicks: 60,
				rangeMillitiles: 5e3,
				sightRangeMillitiles: 5500,
				movementMillitilesPerSecond: 1e3,
				targetMode: "ground-and-air",
				count: 2,
				areaDamageRadiusMillitiles: null,
				components: [{
					id: SUNTHREAD_SOURCE.archetypeId,
					displayName: "Sunthread Warden",
					kind: "unit",
					role: "primary",
					hitpoints: 304,
					damage: 107,
					hitSpeedTicks: 54,
					firstHitTicks: 48,
					deployTimeTicks: 60,
					rangeMillitiles: 5e3,
					sightRangeMillitiles: 5500,
					movementMillitilesPerSecond: 1e3,
					targetMode: "ground-and-air",
					count: 2,
					areaDamageRadiusMillitiles: null
				}]
			},
			{
				id: DUSKWING_SOURCE.cardId,
				displayName: "Duskwing Trio",
				cost: 3,
				kind: "unit",
				rarity: "standard",
				hitpoints: 230,
				damage: 117,
				hitSpeedTicks: 60,
				firstHitTicks: 30,
				deployTimeTicks: 60,
				rangeMillitiles: 1600,
				sightRangeMillitiles: 5500,
				movementMillitilesPerSecond: 1500,
				targetMode: "ground-and-air",
				count: 3,
				areaDamageRadiusMillitiles: null,
				components: [{
					id: DUSKWING_SOURCE.archetypeId,
					displayName: "Duskwing",
					kind: "unit",
					role: "primary",
					hitpoints: 230,
					damage: 117,
					hitSpeedTicks: 60,
					firstHitTicks: 30,
					deployTimeTicks: 60,
					rangeMillitiles: 1600,
					sightRangeMillitiles: 5500,
					movementMillitilesPerSecond: 1500,
					targetMode: "ground-and-air",
					count: 3,
					areaDamageRadiusMillitiles: null
				}]
			},
			{
				id: COPPERSHADE_SOURCE.cardId,
				displayName: "Coppershade Flock",
				cost: 5,
				kind: "unit",
				rarity: "standard",
				hitpoints: 230,
				damage: 117,
				hitSpeedTicks: 60,
				firstHitTicks: 30,
				deployTimeTicks: 60,
				rangeMillitiles: 1600,
				sightRangeMillitiles: 5500,
				movementMillitilesPerSecond: 1500,
				targetMode: "ground-and-air",
				count: 6,
				areaDamageRadiusMillitiles: null,
				components: [{
					id: COPPERSHADE_SOURCE.archetypeId,
					displayName: "Coppershade",
					kind: "unit",
					role: "primary",
					hitpoints: 230,
					damage: 117,
					hitSpeedTicks: 60,
					firstHitTicks: 30,
					deployTimeTicks: 60,
					rangeMillitiles: 1600,
					sightRangeMillitiles: 5500,
					movementMillitilesPerSecond: 1500,
					targetMode: "ground-and-air",
					count: 6,
					areaDamageRadiusMillitiles: null
				}]
			}
		];
	})))();
}
//#endregion
//#region src/content/cards/shields-forms.js
function clone$13(value) {
	return JSON.parse(JSON.stringify(value));
}
function canonicalJson$13(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$13).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$13(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord$12(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$12(value, maximumLength, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximumLength) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function boundedInteger(value, label, minimum, maximum) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a safe integer from ${minimum} through ${maximum}`);
}
function checkedCommand(value, index = null) {
	const label = index === null ? "shield-form command" : `shield-form command ${index}`;
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const typeDescriptor = Object.getOwnPropertyDescriptor(value, "type");
	if (typeDescriptor === void 0 || !typeDescriptor.enumerable || !Object.hasOwn(typeDescriptor, "value")) throw new TypeError(`${label}.type must be an enumerable data property`);
	if (typeDescriptor.value === "damage") {
		const command = exactRecord$12(value, DAMAGE_COMMAND_KEYS, label);
		boundedInteger(command.amount, `${label}.amount`, 1, MAX_DAMAGE);
		return {
			amount: command.amount,
			type: "damage"
		};
	}
	if (typeDescriptor.value === "advance") {
		const command = exactRecord$12(value, ADVANCE_COMMAND_KEYS, label);
		boundedInteger(command.ticks, `${label}.ticks`, 1, MAX_TICK$13);
		return {
			ticks: command.ticks,
			type: "advance"
		};
	}
	throw new TypeError(`${label}.type is unsupported`);
}
/**
* Returns the original common-schema definition used by this question
* fixture. The definition does not encode its shield or stationary form.
*/
function createShieldFormCatalog() {
	return createCardCatalog(DEFINITIONS$2);
}
var DEFINITIONS$2, FIXTURE_ID$2, ENTITY_ID, MAX_COMMANDS$12, MAX_DAMAGE, MAX_SNAPSHOT_BYTES$13, MAX_TICK$13, SNAPSHOT_KEYS$7, DAMAGE_COMMAND_KEYS, ADVANCE_COMMAND_KEYS, ShieldFormEncounter;
function init_shields_forms() {
	return (init_shields_forms = __esmMin((() => {
		init_schema();
		DEFINITIONS$2 = [{
			id: "railward",
			displayName: "Railward",
			cost: 5,
			kind: "unit",
			rarity: "special",
			hitpoints: 892,
			damage: 212,
			hitSpeedTicks: 60,
			firstHitTicks: 24,
			deployTimeTicks: 60,
			rangeMillitiles: 5500,
			sightRangeMillitiles: 6e3,
			movementMillitilesPerSecond: 1e3,
			targetMode: "ground",
			count: 1,
			areaDamageRadiusMillitiles: null,
			components: []
		}];
		FIXTURE_ID$2 = "railward-shield-form-v1";
		ENTITY_ID = 1;
		MAX_COMMANDS$12 = 64;
		MAX_DAMAGE = 1e6;
		MAX_SNAPSHOT_BYTES$13 = 8192;
		MAX_TICK$13 = 1e6;
		SNAPSHOT_KEYS$7 = [
			"commands",
			"fixture",
			"version"
		];
		DAMAGE_COMMAND_KEYS = ["amount", "type"];
		ADVANCE_COMMAND_KEYS = ["ticks", "type"];
		ShieldFormEncounter = class ShieldFormEncounter {
			#bodyCurrent = 892;
			#commands = [];
			#dead = false;
			#events = [];
			#form = "mobile";
			#shieldCurrent = 892;
			#tick = 0;
			constructor(...setup) {
				if (setup.length !== 0) throw new TypeError("shield-form encounter accepts no custom setup");
			}
			get replay() {
				return clone$13(this.#events);
			}
			get state() {
				const card = createShieldFormCatalog()[0];
				return clone$13({
					body: {
						currentHealth: this.#bodyCurrent,
						maxHealth: card.hitpoints
					},
					combat: {
						areaDamageRadiusMillitiles: card.areaDamageRadiusMillitiles,
						count: card.count,
						damage: card.damage,
						deployTimeTicks: card.deployTimeTicks,
						firstHitTicks: card.firstHitTicks,
						hitSpeedTicks: card.hitSpeedTicks,
						rangeMillitiles: card.rangeMillitiles,
						sightRangeMillitiles: card.sightRangeMillitiles,
						targetMode: card.targetMode
					},
					dead: this.#dead,
					entityId: ENTITY_ID,
					form: this.#form,
					kind: this.#form === "mobile" ? "unit" : "structure",
					movementMillitilesPerSecond: this.#form === "mobile" ? card.movementMillitilesPerSecond : 0,
					shield: {
						currentHealth: this.#shieldCurrent,
						maxHealth: card.hitpoints
					},
					tick: this.#tick
				});
			}
			command(value) {
				const command = checkedCommand(value);
				if (this.#commands.length >= MAX_COMMANDS$12) throw new RangeError("shield-form command limit exceeded");
				if (command.type === "advance" && command.ticks > MAX_TICK$13 - this.#tick) throw new RangeError("shield-form tick limit exceeded");
				const orderedEvents = (command.type === "damage" ? this.#applyDamage(command.amount) : this.#applyAdvance(command.ticks)).map((event, index) => ({
					...event,
					sequence: this.#events.length + index + 1
				}));
				this.#commands.push(command);
				this.#events.push(...orderedEvents);
				return clone$13(orderedEvents);
			}
			damage(amount) {
				return this.command({
					amount,
					type: "damage"
				});
			}
			advanceTicks(ticks) {
				return this.command({
					ticks,
					type: "advance"
				});
			}
			serialize() {
				const serialized = canonicalJson$13({
					commands: this.#commands,
					fixture: FIXTURE_ID$2,
					version: 1
				});
				if (serialized.length > MAX_SNAPSHOT_BYTES$13) throw new RangeError("shield-form snapshot exceeds its size bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("shield-form snapshot must be a string");
				if (serialized.length > MAX_SNAPSHOT_BYTES$13) throw new RangeError("shield-form snapshot exceeds its size bound");
				let parsed;
				try {
					parsed = JSON.parse(serialized);
				} catch {
					throw new TypeError("shield-form snapshot must be valid JSON");
				}
				const snapshot = exactRecord$12(parsed, SNAPSHOT_KEYS$7, "shield-form snapshot");
				if (snapshot.fixture !== FIXTURE_ID$2 || snapshot.version !== 1) throw new TypeError("shield-form snapshot identity is unsupported");
				const commands = denseArray$12(snapshot.commands, MAX_COMMANDS$12, "shield-form snapshot commands").map(checkedCommand);
				const encounter = new ShieldFormEncounter();
				for (const command of commands) encounter.command(command);
				if (encounter.serialize() !== canonicalJson$13({
					commands,
					fixture: FIXTURE_ID$2,
					version: 1
				})) throw new TypeError("shield-form snapshot is not canonical");
				return encounter;
			}
			#applyAdvance(ticks) {
				this.#tick += ticks;
				return [{
					tick: this.#tick,
					ticks,
					type: "time-advanced"
				}];
			}
			#applyDamage(amount) {
				if (this.#dead) return [{
					amount,
					reason: "dead",
					tick: this.#tick,
					type: "damage-no-op"
				}];
				if (this.#form === "mobile") {
					const before = this.#shieldCurrent;
					const applied = Math.min(before, amount);
					this.#shieldCurrent -= applied;
					const events = [{
						applied,
						currentHealth: this.#shieldCurrent,
						discardedOverflow: amount - applied,
						incoming: amount,
						tick: this.#tick,
						type: "shield-damage"
					}];
					if (this.#shieldCurrent === 0) {
						this.#form = "stationary";
						events.push({
							tick: this.#tick,
							type: "shield-break"
						}, {
							from: "mobile",
							tick: this.#tick,
							to: "stationary",
							type: "form-transition"
						});
					}
					return events;
				}
				const before = this.#bodyCurrent;
				this.#bodyCurrent = Math.max(0, before - amount);
				const events = [{
					amount,
					currentHealth: this.#bodyCurrent,
					previousHealth: before,
					tick: this.#tick,
					type: "body-damage"
				}];
				if (this.#bodyCurrent === 0) {
					this.#dead = true;
					events.push({
						entityId: ENTITY_ID,
						tick: this.#tick,
						type: "death"
					});
				}
				return events;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/combat-status-stun.js
function deepFreeze$10(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze$10(child);
		Object.freeze(value);
	}
	return value;
}
function clone$12(value) {
	return JSON.parse(JSON.stringify(value));
}
function canonicalJson$12(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$12).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$12(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord$11(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$11(value, label, maximum) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function safeInteger$4(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
}
function checkedId$1(value, label, nullable = false) {
	if (nullable && value === null) return;
	safeInteger$4(value, label, 1);
}
function checkedCommands$10(value) {
	const commands = denseArray$11(value, "stun commands", MAX_COMMANDS$11).map((entry, index) => {
		const command = exactRecord$11(entry, COMMAND_KEYS$8, `stun command ${index}`);
		safeInteger$4(command.tick, `stun command ${index}.tick`, 0, 4095);
		if (!COMMAND_TYPES$5.has(command.type)) throw new TypeError(`stun command ${index}.type is invalid`);
		if (command.type === "stun") {
			checkedId$1(command.sourceId, `stun command ${index}.sourceId`);
			if (command.tick > MAX_TICK$12 - QUESTION_VALUES$10.durationTicks) throw new TypeError(`stun command ${index}.tick cannot fit its duration`);
			if (command.targetId !== null) throw new TypeError(`stun command ${index}.targetId must be null`);
		} else if (command.type === "acquire-target") {
			checkedId$1(command.targetId, `stun command ${index}.targetId`);
			if (command.sourceId !== null) throw new TypeError(`stun command ${index}.sourceId must be null`);
		} else if (command.type === "target-died") {
			checkedId$1(command.targetId, `stun command ${index}.targetId`, true);
			if (command.sourceId !== null) throw new TypeError(`stun command ${index}.sourceId must be null`);
		} else if (command.sourceId !== null || command.targetId !== null) throw new TypeError(`stun command ${index} has inapplicable IDs`);
		return {
			sourceId: command.sourceId,
			targetId: command.targetId,
			tick: command.tick,
			type: command.type
		};
	});
	let prior = -1;
	for (const command of commands) {
		if (command.tick <= prior) throw new TypeError("stun commands must have unique increasing ticks");
		prior = command.tick;
	}
	return commands;
}
function checkedSetup$11(value) {
	return { commands: checkedCommands$10(exactRecord$11(value, SETUP_KEYS$7, "stun setup").commands) };
}
function checkedEvent$2(value, index) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`stun history event ${index} has an invalid shape`);
	const descriptor = Object.getOwnPropertyDescriptor(value, "type");
	if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`stun history event ${index}.type must be data`);
	const keys = EVENT_KEYS$2[descriptor.value];
	if (keys === void 0) throw new TypeError(`stun history event ${index}.type is invalid`);
	const event = exactRecord$11(value, keys, `stun history event ${index}`);
	safeInteger$4(event.tick, `stun history event ${index}.tick`, 0, 4095);
	for (const key of [
		"contactDelayTicks",
		"disabledThroughTick",
		"from",
		"healthAfter",
		"healthBefore",
		"sequence",
		"sourceId",
		"targetId",
		"to"
	]) if (Object.hasOwn(event, key)) {
		const minimum = [
			"sourceId",
			"targetId",
			"sequence"
		].includes(key) ? 1 : 0;
		safeInteger$4(event[key], `stun history event ${index}.${key}`, minimum);
	}
	return event;
}
function checkedPending(value, label) {
	if (value === null) return null;
	const pending = exactRecord$11(value, PENDING_KEYS, label);
	safeInteger$4(pending.remaining, `${label}.remaining`, 1, QUESTION_VALUES$10.contactDelayTicks);
	safeInteger$4(pending.sequence, `${label}.sequence`, 1, MAX_EVENTS$9);
	checkedId$1(pending.targetId, `${label}.targetId`);
	return pending;
}
function initialState$7() {
	return {
		alive: true,
		attackPhase: "idle",
		attackRemaining: null,
		attackSequence: 0,
		commandIndex: 0,
		disabledThroughTick: null,
		health: STARTING_HEALTH,
		history: [],
		movementRemainder: 0,
		pendingContact: null,
		position: 0,
		targetAlive: false,
		targetHealth: null,
		targetId: null,
		tick: 0
	};
}
function uncheckedAdvance$2(state, commands) {
	const tick = state.tick;
	if (tick >= MAX_TICK$12) return [];
	const events = [];
	const command = commands[state.commandIndex];
	if (command?.tick === tick) {
		state.commandIndex += 1;
		applyCommand$1(state, command, events);
	}
	const disabled = state.alive && state.disabledThroughTick !== null && tick <= state.disabledThroughTick;
	if (state.alive && !disabled) {
		if (state.pendingContact !== null) {
			state.pendingContact.remaining -= 1;
			if (state.pendingContact.remaining === 0) {
				const pending = state.pendingContact;
				state.pendingContact = null;
				if (state.targetAlive && state.targetId === pending.targetId) {
					const before = state.targetHealth;
					state.targetHealth = Math.max(0, before - QUESTION_VALUES$10.commonBaseDamage);
					events.push({
						healthAfter: state.targetHealth,
						healthBefore: before,
						sequence: pending.sequence,
						targetId: pending.targetId,
						tick,
						type: "attack-contact"
					});
					if (state.targetHealth === 0) clearTarget(state);
				}
			}
		}
		if (state.targetAlive && state.pendingContact === null) {
			if (state.attackRemaining > 0) state.attackRemaining -= 1;
			if (state.attackRemaining === 0) {
				state.attackSequence += 1;
				state.pendingContact = {
					remaining: QUESTION_VALUES$10.contactDelayTicks,
					sequence: state.attackSequence,
					targetId: state.targetId
				};
				events.push({
					contactDelayTicks: QUESTION_VALUES$10.contactDelayTicks,
					sequence: state.attackSequence,
					targetId: state.targetId,
					tick,
					type: "attack-launched"
				});
				state.attackPhase = "cadence";
				state.attackRemaining = QUESTION_VALUES$10.commonHitCadenceTicks;
			}
		}
		const accumulated = state.movementRemainder + QUESTION_VALUES$10.commonMovementMillitilesPerSecond;
		const displacement = Math.floor(accumulated / 60);
		state.movementRemainder = accumulated % 60;
		if (state.position + displacement > MAX_POSITION$3) throw new RangeError("stun movement exceeds its position bound");
		state.position += displacement;
	}
	if (disabled && tick === state.disabledThroughTick) events.push({
		tick,
		type: "stun-expired"
	});
	if (state.history.length + events.length > MAX_EVENTS$9) throw new RangeError("stun replay exceeds its event bound");
	state.history.push(...clone$12(events));
	state.tick += 1;
	return events;
}
function clearTarget(state) {
	state.targetAlive = false;
	state.targetHealth = null;
	state.targetId = null;
	state.attackPhase = "idle";
	state.attackRemaining = null;
	state.pendingContact = null;
}
function applyCommand$1(state, command, events) {
	if (command.type === "stun") {
		if (!state.alive) return;
		const expiry = state.tick + QUESTION_VALUES$10.durationTicks - 1;
		if (expiry >= MAX_TICK$12) throw new RangeError("stun expiry exceeds the encounter bound");
		state.disabledThroughTick = Math.max(state.disabledThroughTick ?? -1, expiry);
		events.push({
			disabledThroughTick: state.disabledThroughTick,
			sourceId: command.sourceId,
			tick: state.tick,
			type: "stun-applied"
		});
		return;
	}
	if (command.type === "acquire-target") {
		if (!state.alive) return;
		if (state.targetId !== command.targetId) {
			state.targetId = command.targetId;
			state.targetAlive = true;
			state.targetHealth = STARTING_HEALTH;
			state.attackPhase = "windup";
			state.attackRemaining = QUESTION_VALUES$10.commonFirstHitTicks;
			state.pendingContact = null;
			events.push({
				targetId: command.targetId,
				tick: state.tick,
				type: "target-acquired"
			});
		}
		return;
	}
	if (command.type === "lose-target") {
		if (state.targetId === null) return;
		const targetId = state.targetId;
		clearTarget(state);
		events.push({
			targetId,
			tick: state.tick,
			type: "target-lost"
		});
		return;
	}
	if (command.type === "target-died") {
		if (state.targetId !== null && (command.targetId === null || command.targetId === state.targetId)) {
			const targetId = state.targetId;
			clearTarget(state);
			events.push({
				targetId,
				tick: state.tick,
				type: "target-died"
			});
		}
		return;
	}
	if (command.type === "interrupt") {
		if (state.alive) {
			state.pendingContact = null;
			if (state.targetAlive) {
				state.attackPhase = "windup";
				state.attackRemaining = QUESTION_VALUES$10.commonFirstHitTicks;
			}
			events.push({
				tick: state.tick,
				type: "interrupted"
			});
		}
		return;
	}
	if (state.alive) {
		state.alive = false;
		state.health = 0;
		state.disabledThroughTick = null;
		clearTarget(state);
		events.push({
			tick: state.tick,
			type: "died"
		});
	}
}
function checkedStateShape$2(value, commands, label) {
	const state = exactRecord$11(value, STATE_KEYS$5, label);
	if (typeof state.alive !== "boolean" || typeof state.targetAlive !== "boolean") throw new TypeError(`${label} alive flags must be booleans`);
	safeInteger$4(state.tick, `${label}.tick`, 0, MAX_TICK$12);
	safeInteger$4(state.commandIndex, `${label}.commandIndex`, 0, commands.length);
	safeInteger$4(state.attackSequence, `${label}.attackSequence`, 0, MAX_EVENTS$9);
	safeInteger$4(state.health, `${label}.health`, 0, STARTING_HEALTH);
	safeInteger$4(state.position, `${label}.position`, 0, MAX_POSITION$3);
	safeInteger$4(state.movementRemainder, `${label}.movementRemainder`, 0, 59);
	checkedId$1(state.targetId, `${label}.targetId`, true);
	if (state.targetHealth !== null) safeInteger$4(state.targetHealth, `${label}.targetHealth`, 1, STARTING_HEALTH);
	if (state.disabledThroughTick !== null) safeInteger$4(state.disabledThroughTick, `${label}.disabledThroughTick`, 0, 4095);
	if (![
		"idle",
		"windup",
		"cadence"
	].includes(state.attackPhase)) throw new TypeError(`${label}.attackPhase is invalid`);
	if (state.attackRemaining !== null) safeInteger$4(state.attackRemaining, `${label}.attackRemaining`, 1, QUESTION_VALUES$10.commonHitCadenceTicks);
	const pendingContact = checkedPending(state.pendingContact, `${label}.pendingContact`);
	const history = denseArray$11(state.history, `${label}.history`, MAX_EVENTS$9).map(checkedEvent$2);
	if (state.alive !== state.health > 0) throw new TypeError(`${label} health and life state disagree`);
	if (state.targetAlive !== (state.targetId !== null) || state.targetAlive !== (state.targetHealth !== null)) throw new TypeError(`${label} target state is inconsistent`);
	if (!state.targetAlive && (state.attackPhase !== "idle" || state.attackRemaining !== null || pendingContact !== null)) throw new TypeError(`${label} inactive target retains attack state`);
	if (state.targetAlive && (state.attackPhase === "idle" || state.attackRemaining === null || pendingContact !== null && pendingContact.targetId !== state.targetId)) throw new TypeError(`${label} active target attack state is inconsistent`);
	const expectedCommandIndex = commands.filter(({ tick }) => tick < state.tick).length;
	if (state.commandIndex !== expectedCommandIndex) throw new TypeError(`${label} command cursor is noncausal`);
	let priorTick = -1;
	for (const event of history) {
		if (event.tick < priorTick || event.tick >= state.tick) throw new TypeError(`${label} history is noncausal`);
		priorTick = event.tick;
	}
	return {
		alive: state.alive,
		attackPhase: state.attackPhase,
		attackRemaining: state.attackRemaining,
		attackSequence: state.attackSequence,
		commandIndex: state.commandIndex,
		disabledThroughTick: state.disabledThroughTick,
		health: state.health,
		history,
		movementRemainder: state.movementRemainder,
		pendingContact,
		position: state.position,
		targetAlive: state.targetAlive,
		targetHealth: state.targetHealth,
		targetId: state.targetId,
		tick: state.tick
	};
}
function replayState$1(commands, ticks) {
	const state = initialState$7();
	for (let index = 0; index < ticks; index += 1) uncheckedAdvance$2(state, commands);
	return state;
}
function checkedCausalState$2(value, commands, label = "stun state") {
	const checked = checkedStateShape$2(value, commands, label);
	const expected = replayState$1(commands, checked.tick);
	if (canonicalJson$12(checked) !== canonicalJson$12(expected)) throw new TypeError(`${label} is forged or noncausal`);
	return checked;
}
function questionRecord$7(key, value) {
	return deepFreeze$10({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		key,
		source: SOURCE$8,
		value: clone$12(value)
	});
}
function createStunSpecialCatalog() {
	return createCardCatalog(CARD_DEFINITIONS$4);
}
function createStunQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("stun question records do not accept overrides");
	return deepFreeze$10(Object.fromEntries(Object.entries(QUESTION_VALUES$10).map(([key, value]) => [key, questionRecord$7(key, value)])));
}
function createStunFixture(commands = []) {
	return clone$12(checkedSetup$11({ commands }));
}
var CARD_DEFINITIONS$4, SOURCE$8, MAX_COMMANDS$11, MAX_EVENTS$9, MAX_SNAPSHOT_BYTES$12, MAX_STEP_CHUNK$10, MAX_TICK$12, MAX_POSITION$3, STARTING_HEALTH, COMMAND_KEYS$8, COMMAND_TYPES$5, SETUP_KEYS$7, SNAPSHOT_KEYS$6, IDENTITY_KEYS$5, STATE_KEYS$5, PENDING_KEYS, EVENT_KEYS$2, QUESTION_VALUES$10, TimedFullDisableStunEncounter;
function init_combat_status_stun() {
	return (init_combat_status_stun = __esmMin((() => {
		init_schema();
		CARD_DEFINITIONS$4 = [{
			areaDamageRadiusMillitiles: null,
			components: [],
			cost: 4,
			count: 1,
			damage: 110,
			deployTimeTicks: 60,
			displayName: "Pulse Sentry",
			firstHitTicks: 6,
			hitSpeedTicks: 8,
			hitpoints: 1e3,
			id: "pulse-sentry",
			kind: "unit",
			movementMillitilesPerSecond: 1e3,
			rangeMillitiles: 5e3,
			rarity: "uncommon",
			sightRangeMillitiles: 5500,
			targetMode: "ground-and-air"
		}];
		SOURCE$8 = "unsourced-timed-full-disable-stun-fixture";
		MAX_COMMANDS$11 = 64;
		MAX_EVENTS$9 = 4096;
		MAX_SNAPSHOT_BYTES$12 = 131072;
		MAX_STEP_CHUNK$10 = 4096;
		MAX_TICK$12 = 4096;
		MAX_POSITION$3 = 1e6;
		STARTING_HEALTH = 1e3;
		COMMAND_KEYS$8 = [
			"sourceId",
			"targetId",
			"tick",
			"type"
		];
		COMMAND_TYPES$5 = /* @__PURE__ */ new Set([
			"acquire-target",
			"die",
			"interrupt",
			"lose-target",
			"stun",
			"target-died"
		]);
		SETUP_KEYS$7 = ["commands"];
		SNAPSHOT_KEYS$6 = [
			"identity",
			"state",
			"version"
		];
		IDENTITY_KEYS$5 = ["commands", "fixture"];
		STATE_KEYS$5 = [
			"alive",
			"attackPhase",
			"attackRemaining",
			"attackSequence",
			"commandIndex",
			"disabledThroughTick",
			"health",
			"history",
			"movementRemainder",
			"pendingContact",
			"position",
			"targetAlive",
			"targetHealth",
			"targetId",
			"tick"
		];
		PENDING_KEYS = [
			"remaining",
			"sequence",
			"targetId"
		];
		EVENT_KEYS$2 = {
			"attack-contact": [
				"healthAfter",
				"healthBefore",
				"sequence",
				"targetId",
				"tick",
				"type"
			],
			"attack-launched": [
				"contactDelayTicks",
				"sequence",
				"targetId",
				"tick",
				"type"
			],
			died: ["tick", "type"],
			interrupted: ["tick", "type"],
			moved: [
				"from",
				"tick",
				"to",
				"type"
			],
			"stun-applied": [
				"disabledThroughTick",
				"sourceId",
				"tick",
				"type"
			],
			"stun-expired": ["tick", "type"],
			"target-acquired": [
				"targetId",
				"tick",
				"type"
			],
			"target-died": [
				"targetId",
				"tick",
				"type"
			],
			"target-lost": [
				"targetId",
				"tick",
				"type"
			]
		};
		QUESTION_VALUES$10 = Object.freeze({
			applyTick: "command-boundary-immediate",
			attackCadenceBehavior: "pause-exact-remaining-boundaries",
			attackReadinessBehavior: "pause-exact-remaining-boundaries",
			commonAreaDamageRadius: null,
			commonBaseDamage: 110,
			commonCount: 1,
			commonDeployTicks: 60,
			commonFirstHitTicks: 6,
			commonHitCadenceTicks: 8,
			commonHitpoints: STARTING_HEALTH,
			commonMovementMillitilesPerSecond: 1e3,
			commonRangeMillitiles: 5e3,
			commonSightRangeMillitiles: 5500,
			commonTargetMode: "ground-and-air",
			contactDelayTicks: 2,
			contactBehavior: "pause-pending-contact-exact-remaining-boundaries",
			deathPolicy: "death-clears-disable-target-attack-and-pending-contact",
			durationTicks: 30,
			eligibility: "living-source-and-living-target-explicit-command",
			expiry: "inclusive-through-application-plus-duration-minus-one",
			healthPreservation: "stun-does-not-change-health",
			interruptionPolicy: "clear-pending-contact-and-rewind-windup-retain-disable-and-target",
			launchSnapshot: "target-id-and-sequence-copied-at-launch-pending-contact-pauses",
			movementPerTickPattern: "integer-millitiles-with-remainder-over-60",
			movementSuppression: "zero-displacement-and-preserve-remainder",
			reapply: "refresh-to-later-inclusive-expiry",
			refresh: "replace-current-expiry-only-when-new-expiry-is-later",
			resetCoupling: "outside-piece-nonclaim",
			sameBoundaryOrdering: "command-first-then-disable-gate-then-contact-attack-movement",
			sourceEligibility: "positive-safe-integer-source-id",
			stack: "single-state-no-stacking",
			simulationTicksPerSecond: 60,
			targetEligibility: "positive-safe-integer-retained-living-target-id",
			targetRetention: "preserve-stable-target-and-target-health",
			windupBehavior: "pause-exact-remaining-boundaries"
		});
		TimedFullDisableStunEncounter = class TimedFullDisableStunEncounter {
			#commands;
			#state;
			constructor(setup = createStunFixture()) {
				const checked = checkedSetup$11(setup);
				this.#commands = checked.commands;
				this.#state = initialState$7();
			}
			get replay() {
				return clone$12(this.#state.history);
			}
			get state() {
				return clone$12(this.#state);
			}
			step() {
				return clone$12(uncheckedAdvance$2(this.#state, this.#commands));
			}
			stepMany(count) {
				safeInteger$4(count, "stun step count", 0, MAX_STEP_CHUNK$10);
				if (count > MAX_TICK$12 - this.#state.tick) throw new RangeError("stun step count exceeds the encounter bound");
				const candidate = checkedCausalState$2(this.#state, this.#commands);
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...uncheckedAdvance$2(candidate, this.#commands));
				this.#state = candidate;
				return clone$12(events);
			}
			run() {
				return this.stepMany(MAX_TICK$12 - this.#state.tick);
			}
			serialize() {
				const serialized = canonicalJson$12({
					identity: {
						commands: this.#commands,
						fixture: "timed-full-disable-stun-question-v1"
					},
					state: checkedCausalState$2(this.#state, this.#commands),
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$12) throw new RangeError("stun snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("stun snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$12) throw new RangeError("stun snapshot exceeds its byte bound");
				let value;
				try {
					value = JSON.parse(serialized);
				} catch {
					throw new TypeError("stun snapshot must be valid JSON");
				}
				if (serialized !== canonicalJson$12(value)) throw new TypeError("stun snapshot must be canonical duplicate-free JSON");
				const snapshot = exactRecord$11(value, SNAPSHOT_KEYS$6, "stun snapshot");
				if (snapshot.version !== 1) throw new TypeError("stun snapshot version is unsupported");
				const identity = exactRecord$11(snapshot.identity, IDENTITY_KEYS$5, "stun snapshot.identity");
				if (identity.fixture !== "timed-full-disable-stun-question-v1") throw new TypeError("stun snapshot fixture identity is invalid");
				const commands = checkedCommands$10(identity.commands);
				const state = checkedCausalState$2(snapshot.state, commands, "stun snapshot.state");
				const encounter = new TimedFullDisableStunEncounter({ commands });
				encounter.#state = state;
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/combat-status-heal.js
function deepFreeze$9(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze$9(child);
		Object.freeze(value);
	}
	return value;
}
function clone$11(value) {
	return JSON.parse(JSON.stringify(value));
}
function canonicalJson$11(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$11).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$11(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord$10(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$10(value, label, maximum) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function safeInteger$3(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
}
function checkedEntities$1(value, label = "heal entities") {
	const entities = denseArray$10(value, label, MAX_ENTITIES$4).map((entry, index) => {
		const entity = exactRecord$10(entry, ENTITY_KEYS$3, `${label}[${index}]`);
		safeInteger$3(entity.id, `${label}[${index}].id`, 1);
		safeInteger$3(entity.ownerId, `${label}[${index}].ownerId`, 1);
		safeInteger$3(entity.maxHealth, `${label}[${index}].maxHealth`, 1);
		safeInteger$3(entity.currentHealth, `${label}[${index}].currentHealth`, 0, entity.maxHealth);
		if (!ENTITY_KINDS.has(entity.kind)) throw new TypeError(`${label}[${index}].kind is invalid`);
		return { ...entity };
	});
	let previousId = 0;
	for (const entity of entities) {
		if (entity.id <= previousId) throw new TypeError(`${label} must have unique ascending IDs`);
		previousId = entity.id;
	}
	return entities;
}
function checkedCommands$9(value, label = "heal commands") {
	const commands = denseArray$10(value, label, MAX_COMMANDS$10).map((entry, index) => {
		const command = exactRecord$10(entry, COMMAND_KEYS$7, `${label}[${index}]`);
		safeInteger$3(command.tick, `${label}[${index}].tick`, 0, 4095);
		safeInteger$3(command.targetId, `${label}[${index}].targetId`, 1);
		safeInteger$3(command.amount, `${label}[${index}].amount`);
		if (!COMMAND_TYPES$4.has(command.type)) throw new TypeError(`${label}[${index}].type is invalid`);
		if (command.type === "damage") {
			if (command.sourceId !== null) throw new TypeError(`${label}[${index}].sourceId is inapplicable`);
		} else safeInteger$3(command.sourceId, `${label}[${index}].sourceId`, 1);
		return { ...command };
	});
	let previousTick = -1;
	for (const command of commands) {
		if (command.tick < previousTick) throw new TypeError(`${label} must have nondecreasing ticks`);
		previousTick = command.tick;
	}
	return commands;
}
function checkedSetup$10(value) {
	const setup = exactRecord$10(value, SETUP_KEYS$6, "heal setup");
	return {
		commands: checkedCommands$9(setup.commands),
		entities: checkedEntities$1(setup.entities)
	};
}
function checkedEvent$1(value, index) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`heal history[${index}] has an invalid shape`);
	const descriptor = Object.getOwnPropertyDescriptor(value, "type");
	if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`heal history[${index}].type must be data`);
	const keys = EVENT_KEYS$1[descriptor.value];
	if (keys === void 0) throw new TypeError(`heal history[${index}].type is invalid`);
	const event = exactRecord$10(value, keys, `heal history[${index}]`);
	safeInteger$3(event.tick, `heal history[${index}].tick`, 0, 4095);
	safeInteger$3(event.targetId, `heal history[${index}].targetId`, 1);
	if (event.type === "death") return event;
	if (event.type === "damage") safeInteger$3(event.amount, `heal history[${index}].amount`);
	else {
		safeInteger$3(event.sourceId, `heal history[${index}].sourceId`, 1);
		safeInteger$3(event.requested, `heal history[${index}].requested`);
		safeInteger$3(event.applied, `heal history[${index}].applied`);
		if (!HEAL_STATUSES.has(event.status)) throw new TypeError(`heal history[${index}].status is invalid`);
		if (event.status !== "applied" && event.applied !== 0) throw new TypeError(`heal history[${index}] no-op applied must be zero`);
	}
	if (event.currentHealthBefore !== null) safeInteger$3(event.currentHealthBefore, `heal history[${index}].currentHealthBefore`);
	if (event.currentHealthAfter !== null) safeInteger$3(event.currentHealthAfter, `heal history[${index}].currentHealthAfter`);
	return event;
}
function checkedState$1(value, commands, label = "heal state") {
	const state = exactRecord$10(value, STATE_KEYS$4, label);
	safeInteger$3(state.tick, `${label}.tick`, 0, MAX_TICK$11);
	safeInteger$3(state.commandIndex, `${label}.commandIndex`, 0, commands.length);
	const entities = checkedEntities$1(state.entities, `${label}.entities`);
	const history = denseArray$10(state.history, `${label}.history`, MAX_EVENTS$8).map(checkedEvent$1);
	if (state.commandIndex !== commands.findIndex((command) => command.tick >= state.tick) && !(state.commandIndex === commands.length && commands.every((command) => command.tick < state.tick))) throw new TypeError(`${label}.commandIndex is inconsistent with tick`);
	for (let index = 1; index < history.length; index += 1) if (history[index].tick < history[index - 1].tick) throw new TypeError(`${label}.history ticks must be nondecreasing`);
	return {
		commandIndex: state.commandIndex,
		entities,
		history,
		tick: state.tick
	};
}
function questionRecord$6(key, value) {
	return deepFreeze$9({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		key,
		source: ORDINARY_QUESTION_KEYS.has(key) ? ORDINARY_SOURCE : SOURCE$7,
		value: clone$11(value)
	});
}
function findEntity(entities, id) {
	let low = 0;
	let high = entities.length - 1;
	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		if (entities[middle].id === id) return entities[middle];
		if (entities[middle].id < id) low = middle + 1;
		else high = middle - 1;
	}
	return null;
}
function healNoOp(command, target, status, tick) {
	return {
		applied: 0,
		currentHealthAfter: target?.currentHealth ?? null,
		currentHealthBefore: target?.currentHealth ?? null,
		requested: command.amount,
		sourceId: command.sourceId,
		status,
		targetId: command.targetId,
		tick,
		type: "heal"
	};
}
function advanceOne$1(state, commands) {
	const tick = state.tick;
	const start = state.commandIndex;
	let end = start;
	while (commands[end]?.tick === tick) end += 1;
	const due = commands.slice(start, end);
	checkedCommands$9(due, `heal due commands at tick ${tick}`);
	const damageCommands = due.filter(({ type }) => type === "damage");
	const healCommands = due.filter(({ type }) => type === "heal");
	const preDamage = new Map(state.entities.map((entity) => [entity.id, { ...entity }]));
	const totals = /* @__PURE__ */ new Map();
	for (const command of damageCommands) {
		const target = preDamage.get(command.targetId);
		if (target !== void 0 && target.currentHealth > 0) {
			const total = totals.get(target.id) ?? 0;
			if (command.amount > Number.MAX_SAFE_INTEGER - total) throw new RangeError(`total damage for entity ${target.id} exceeds safe integer range`);
			totals.set(target.id, total + command.amount);
		}
	}
	const events = [];
	const cumulative = /* @__PURE__ */ new Map();
	for (const command of damageCommands) {
		const target = preDamage.get(command.targetId);
		if (target === void 0 || target.currentHealth === 0) continue;
		const prior = cumulative.get(target.id) ?? 0;
		const before = Math.max(0, target.currentHealth - prior);
		const after = Math.max(0, target.currentHealth - prior - command.amount);
		cumulative.set(target.id, prior + command.amount);
		events.push({
			amount: command.amount,
			currentHealthAfter: after,
			currentHealthBefore: before,
			targetId: target.id,
			tick,
			type: "damage"
		});
	}
	const deaths = [];
	for (const [id, amount] of [...totals].sort(([left], [right]) => left - right)) {
		const target = findEntity(state.entities, id);
		target.currentHealth = Math.max(0, target.currentHealth - amount);
		if (target.currentHealth === 0) deaths.push({
			targetId: id,
			tick,
			type: "death"
		});
	}
	events.push(...deaths);
	for (const command of healCommands) {
		const source = findEntity(state.entities, command.sourceId);
		const target = findEntity(state.entities, command.targetId);
		if (source === null) events.push(healNoOp(command, target, "source-missing", tick));
		else if (source.currentHealth === 0) events.push(healNoOp(command, target, "source-dead", tick));
		else if (target === null) events.push(healNoOp(command, target, "target-missing", tick));
		else if (target.currentHealth === 0) events.push(healNoOp(command, target, "target-dead", tick));
		else if (target.ownerId !== source.ownerId) events.push(healNoOp(command, target, "enemy", tick));
		else if (target.kind !== "troop") events.push(healNoOp(command, target, "target-ineligible", tick));
		else {
			const before = target.currentHealth;
			const applied = Math.min(command.amount, target.maxHealth - before);
			target.currentHealth += applied;
			events.push({
				applied,
				currentHealthAfter: target.currentHealth,
				currentHealthBefore: before,
				requested: command.amount,
				sourceId: command.sourceId,
				status: "applied",
				targetId: command.targetId,
				tick,
				type: "heal"
			});
		}
	}
	if (state.history.length + events.length > MAX_EVENTS$8) throw new RangeError("heal replay exceeds its event bound");
	state.commandIndex = end;
	state.history.push(...clone$11(events));
	state.tick += 1;
	return events;
}
function createHealCatalog() {
	return createCardCatalog(CARD_DEFINITIONS$3);
}
function createHealQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("heal question records do not accept overrides");
	const records = {};
	for (const [key, value] of Object.entries(QUESTION_VALUES$9)) records[key] = questionRecord$6(key, value);
	return deepFreeze$9(records);
}
function createHealFixture(entities = [], commands = []) {
	return clone$11(checkedSetup$10({
		commands,
		entities
	}));
}
var CARD_DEFINITIONS$3, SOURCE$7, ORDINARY_SOURCE, FIXTURE_ID$1, MAX_COMMANDS$10, MAX_ENTITIES$4, MAX_EVENTS$8, MAX_SNAPSHOT_BYTES$11, MAX_STEP_CHUNK$9, MAX_TICK$11, ENTITY_KINDS, COMMAND_TYPES$4, SETUP_KEYS$6, ENTITY_KEYS$3, COMMAND_KEYS$7, SNAPSHOT_KEYS$5, IDENTITY_KEYS$4, STATE_KEYS$4, EVENT_KEYS$1, HEAL_STATUSES, QUESTION_VALUES$9, ORDINARY_QUESTION_KEYS, InstantHealingEncounter;
function init_combat_status_heal() {
	return (init_combat_status_heal = __esmMin((() => {
		init_schema();
		CARD_DEFINITIONS$3 = [{
			areaDamageRadiusMillitiles: null,
			components: [],
			cost: 4,
			count: 1,
			damage: 148,
			deployTimeTicks: 60,
			displayName: "Dawnmender",
			firstHitTicks: 72,
			hitSpeedTicks: 90,
			hitpoints: 1717,
			id: "dawnmender",
			kind: "unit",
			movementMillitilesPerSecond: 1e3,
			rangeMillitiles: 1600,
			rarity: "uncommon",
			sightRangeMillitiles: 5500,
			targetMode: "ground"
		}, {
			areaDamageRadiusMillitiles: null,
			components: [],
			cost: 1,
			count: 1,
			damage: 110,
			deployTimeTicks: 60,
			displayName: "Bloom Wisp",
			firstHitTicks: 6,
			hitSpeedTicks: 18,
			hitpoints: 231,
			id: "bloom-wisp",
			kind: "unit",
			movementMillitilesPerSecond: 2e3,
			rangeMillitiles: 2500,
			rarity: "uncommon",
			sightRangeMillitiles: 5500,
			targetMode: "ground-and-air"
		}];
		SOURCE$7 = "unsourced-instant-healing-and-health-cap-composition";
		ORDINARY_SOURCE = "royaleapi-cr-api-data-54fdef5-character-and-troop-snapshot-unverified";
		FIXTURE_ID$1 = "instant-healing-and-health-cap-question-v1";
		MAX_COMMANDS$10 = 128;
		MAX_ENTITIES$4 = 64;
		MAX_EVENTS$8 = 8192;
		MAX_SNAPSHOT_BYTES$11 = 1048576;
		MAX_STEP_CHUNK$9 = 4096;
		MAX_TICK$11 = 4096;
		ENTITY_KINDS = /* @__PURE__ */ new Set([
			"structure",
			"tower",
			"troop"
		]);
		COMMAND_TYPES$4 = /* @__PURE__ */ new Set(["damage", "heal"]);
		SETUP_KEYS$6 = ["commands", "entities"];
		ENTITY_KEYS$3 = [
			"currentHealth",
			"id",
			"kind",
			"maxHealth",
			"ownerId"
		];
		COMMAND_KEYS$7 = [
			"amount",
			"sourceId",
			"targetId",
			"tick",
			"type"
		];
		SNAPSHOT_KEYS$5 = [
			"identity",
			"state",
			"version"
		];
		IDENTITY_KEYS$4 = [
			"commands",
			"entities",
			"fixture"
		];
		STATE_KEYS$4 = [
			"commandIndex",
			"entities",
			"history",
			"tick"
		];
		EVENT_KEYS$1 = {
			damage: [
				"amount",
				"currentHealthAfter",
				"currentHealthBefore",
				"targetId",
				"tick",
				"type"
			],
			death: [
				"targetId",
				"tick",
				"type"
			],
			heal: [
				"applied",
				"currentHealthAfter",
				"currentHealthBefore",
				"requested",
				"sourceId",
				"status",
				"targetId",
				"tick",
				"type"
			]
		};
		HEAL_STATUSES = /* @__PURE__ */ new Set([
			"applied",
			"enemy",
			"source-dead",
			"source-missing",
			"target-dead",
			"target-ineligible",
			"target-missing"
		]);
		QUESTION_VALUES$9 = {
			bloomWispCount: 1,
			bloomWispDamage: 110,
			bloomWispDeployTimeTicks: 60,
			bloomWispFirstHitTicks: 6,
			bloomWispHealAmount: 240,
			bloomWispHitSpeedTicks: 18,
			bloomWispHitpoints: 231,
			bloomWispMovementMillitilesPerSecond: 2e3,
			bloomWispMovementSpeedLabel: "very_fast",
			bloomWispRangeMillitiles: 2500,
			bloomWispSightRangeMillitiles: 5500,
			bloomWispTargetMode: "ground-and-air",
			bloomWispTrigger: "explicit-instant-heal-command",
			boundaryOrder: "validate-due-commands-then-simultaneous-damage-then-ascending-id-deaths-then-heals-in-command-order",
			conversionCoupling: "deferred-no-conversion-coupling-claim",
			damageCoupling: "same-boundary-damage-and-death-resolve-before-healing",
			dawnmenderCount: 1,
			dawnmenderDamage: 148,
			dawnmenderDeployTimeTicks: 60,
			dawnmenderFirstHitTicks: 72,
			dawnmenderHealAmount: 120,
			dawnmenderHitSpeedTicks: 90,
			dawnmenderHitpoints: 1717,
			dawnmenderMovementMillitilesPerSecond: 1e3,
			dawnmenderMovementSpeedLabel: "medium",
			dawnmenderRangeMillitiles: 1600,
			dawnmenderSightRangeMillitiles: 5500,
			dawnmenderTargetMode: "ground",
			dawnmenderTrigger: "explicit-instant-heal-command",
			deliveryRule: "explicit-source-target-command-no-radius-or-projectile-claim",
			duplicateHeals: "each-valid-command-resolves-in-stable-input-order",
			eligibleTargetClass: "living-troop-only",
			enemyTarget: "valid-no-op",
			invisibilityCoupling: "deferred-no-invisibility-coupling-claim",
			maximumHealthCap: "minimum-of-requested-and-max-health-minus-current-health",
			missingTarget: "valid-no-op",
			noRevivalRule: "zero-health-dead-targets-are-never-healed",
			ownershipRule: "source-and-target-owner-id-must-match",
			rageCoupling: "deferred-no-rage-coupling-claim",
			reflectionCoupling: "deferred-no-reflection-coupling-claim",
			selfHealRule: "living-troop-source-may-target-itself",
			sourceAliveRule: "source-must-exist-and-remain-alive-after-damage-phase",
			sourceDeathSameTick: "lethal-damage-cancels-all-later-source-heals",
			structureTarget: "valid-no-op",
			targetDeathSameTick: "lethal-damage-makes-later-heal-a-no-op",
			towerTarget: "valid-no-op",
			zeroAmount: "valid-command-that-applies-zero"
		};
		ORDINARY_QUESTION_KEYS = /* @__PURE__ */ new Set([
			"bloomWispCount",
			"bloomWispDamage",
			"bloomWispDeployTimeTicks",
			"bloomWispFirstHitTicks",
			"bloomWispHitSpeedTicks",
			"bloomWispHitpoints",
			"bloomWispMovementMillitilesPerSecond",
			"bloomWispMovementSpeedLabel",
			"bloomWispRangeMillitiles",
			"bloomWispSightRangeMillitiles",
			"bloomWispTargetMode",
			"dawnmenderCount",
			"dawnmenderDamage",
			"dawnmenderDeployTimeTicks",
			"dawnmenderFirstHitTicks",
			"dawnmenderHitSpeedTicks",
			"dawnmenderHitpoints",
			"dawnmenderMovementMillitilesPerSecond",
			"dawnmenderMovementSpeedLabel",
			"dawnmenderRangeMillitiles",
			"dawnmenderSightRangeMillitiles",
			"dawnmenderTargetMode"
		]);
		InstantHealingEncounter = class InstantHealingEncounter {
			#commands;
			#initialEntities;
			#state;
			constructor(setup = createHealFixture()) {
				const checked = checkedSetup$10(setup);
				this.#commands = checked.commands;
				this.#initialEntities = checked.entities;
				this.#state = {
					commandIndex: 0,
					entities: clone$11(checked.entities),
					history: [],
					tick: 0
				};
			}
			get replay() {
				return clone$11(this.#state.history);
			}
			get state() {
				return clone$11(this.#state);
			}
			step() {
				return this.stepMany(1);
			}
			stepMany(count) {
				safeInteger$3(count, "heal step count", 0, MAX_STEP_CHUNK$9);
				if (count > MAX_TICK$11 - this.#state.tick) throw new RangeError("heal step count exceeds the encounter bound");
				const candidate = checkedState$1(this.#state, this.#commands);
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...advanceOne$1(candidate, this.#commands));
				this.#state = candidate;
				return clone$11(events);
			}
			run() {
				const lastTick = this.#commands.at(-1)?.tick ?? -1;
				return this.stepMany(Math.max(0, lastTick + 1 - this.#state.tick));
			}
			serialize() {
				const serialized = canonicalJson$11({
					identity: {
						commands: this.#commands,
						entities: this.#initialEntities,
						fixture: FIXTURE_ID$1
					},
					state: checkedState$1(this.#state, this.#commands),
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$11) throw new RangeError("heal snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("heal snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$11) throw new RangeError("heal snapshot exceeds its byte bound");
				let value;
				try {
					value = JSON.parse(serialized);
				} catch {
					throw new TypeError("heal snapshot must be valid JSON");
				}
				if (serialized !== canonicalJson$11(value)) throw new TypeError("heal snapshot must be canonical duplicate-free JSON");
				const snapshot = exactRecord$10(value, SNAPSHOT_KEYS$5, "heal snapshot");
				if (snapshot.version !== 1) throw new TypeError("heal snapshot version is unsupported");
				const identity = exactRecord$10(snapshot.identity, IDENTITY_KEYS$4, "heal snapshot.identity");
				if (identity.fixture !== FIXTURE_ID$1) throw new TypeError("heal snapshot fixture identity is invalid");
				const setup = checkedSetup$10({
					commands: identity.commands,
					entities: identity.entities
				});
				const state = checkedState$1(snapshot.state, setup.commands, "heal snapshot.state");
				const encounter = new InstantHealingEncounter(setup);
				encounter.stepMany(state.tick);
				if (encounter.serialize() !== serialized) throw new TypeError("heal snapshot state is not a causal execution");
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/combat-status-invisibility.js
function deepFreeze$8(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze$8(child);
		Object.freeze(value);
	}
	return value;
}
function clone$10(value) {
	return JSON.parse(JSON.stringify(value));
}
function canonicalJson$10(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$10).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$10(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord$9(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$9(value, label, maximum) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function safeInteger$2(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
}
function checkedId(value, label, nullable = false) {
	if (nullable && value === null) return;
	safeInteger$2(value, label, 1);
}
function checkedPosition$2(value, label) {
	const position = exactRecord$9(value, POSITION_KEYS, label);
	safeInteger$2(position.x, `${label}.x`, -1e6, MAX_POSITION$2);
	safeInteger$2(position.y, `${label}.y`, -1e6, MAX_POSITION$2);
	return {
		x: position.x,
		y: position.y
	};
}
function checkedTargets$1(value, label = "invisibility targets") {
	const targets = denseArray$9(value, label, MAX_ENTITIES$3).map((entry, index) => {
		const target = exactRecord$9(entry, TARGET_KEYS, `${label}[${index}]`);
		checkedId(target.id, `${label}[${index}].id`);
		if (typeof target.alive !== "boolean") throw new TypeError(`${label}[${index}].alive must be a boolean`);
		safeInteger$2(target.health, `${label}[${index}].health`, 0, MAX_HEALTH$2);
		if (target.alive !== target.health > 0) throw new TypeError(`${label}[${index}] life and health disagree`);
		if (!KINDS$1.has(target.kind) || !LAYERS$1.has(target.layer)) throw new TypeError(`${label}[${index}] has an invalid kind or layer`);
		safeInteger$2(target.radius, `${label}[${index}].radius`, 0, MAX_RADIUS$1);
		return {
			alive: target.alive,
			health: target.health,
			id: target.id,
			kind: target.kind,
			layer: target.layer,
			position: checkedPosition$2(target.position, `${label}[${index}].position`),
			radius: target.radius
		};
	});
	const ids = /* @__PURE__ */ new Set();
	for (const target of targets) {
		if (ids.has(target.id)) throw new TypeError("invisibility targets must have unique IDs");
		ids.add(target.id);
	}
	return targets.sort((left, right) => left.id - right.id);
}
function checkedCommands$8(value, targetIds = null) {
	const commands = denseArray$9(value, "invisibility commands", MAX_COMMANDS$9).map((entry, index) => {
		const command = exactRecord$9(entry, COMMAND_KEYS$6, `invisibility command ${index}`);
		safeInteger$2(command.tick, `invisibility command ${index}.tick`, 0, 4095);
		if (!COMMAND_TYPES$3.has(command.type)) throw new TypeError(`invisibility command ${index}.type is invalid`);
		if (["hide", "reveal"].includes(command.type)) {
			checkedId(command.sourceId, `invisibility command ${index}.sourceId`);
			checkedId(command.targetId, `invisibility command ${index}.targetId`);
			if (targetIds !== null && !targetIds.has(command.targetId)) throw new TypeError(`invisibility command ${index} has unknown target`);
			const duration = command.type === "hide" ? QUESTION_VALUES$8.hideDurationTicks : QUESTION_VALUES$8.revealDurationTicks;
			if (command.tick > MAX_TICK$10 - duration) throw new TypeError(`invisibility command ${index}.tick cannot fit its duration`);
		} else if (command.type === "target-died") {
			if (command.sourceId !== null) throw new TypeError(`invisibility command ${index}.sourceId is inapplicable`);
			checkedId(command.targetId, `invisibility command ${index}.targetId`);
			if (targetIds !== null && !targetIds.has(command.targetId)) throw new TypeError(`invisibility command ${index} has unknown target`);
		} else if (command.sourceId !== null || command.targetId !== null) throw new TypeError(`invisibility command ${index} has inapplicable IDs`);
		return {
			sourceId: command.sourceId,
			targetId: command.targetId,
			tick: command.tick,
			type: command.type
		};
	});
	let prior = -1;
	for (const command of commands) {
		if (command.tick <= prior) throw new TypeError("invisibility commands must have unique increasing ticks");
		prior = command.tick;
	}
	return commands;
}
function checkedSetup$9(value) {
	const setup = exactRecord$9(value, SETUP_KEYS$5, "invisibility setup");
	const targets = checkedTargets$1(setup.targets);
	return {
		commands: checkedCommands$8(setup.commands, new Set(targets.map(({ id }) => id))),
		targets
	};
}
function initialState$6(targets) {
	return {
		alive: true,
		attackPhase: "idle",
		attackRemaining: null,
		attackSequence: 0,
		commandIndex: 0,
		history: [],
		pendingProjectiles: [],
		targetId: null,
		targets: targets.map((target) => ({
			...clone$10(target),
			hideSources: [],
			revealThroughTick: null,
			visible: target.alive
		})),
		tick: 0
	};
}
function edgeDistanceSquared(target) {
	return {
		centerSquared: BigInt(target.position.x) * BigInt(target.position.x) + BigInt(target.position.y) * BigInt(target.position.y),
		inset: target.radius
	};
}
function withinRange(target, range) {
	const reach = range + target.radius;
	return edgeDistanceSquared(target).centerSquared <= BigInt(reach) * BigInt(reach);
}
function compareDistance(left, right) {
	const l = edgeDistanceSquared(left);
	const r = edgeDistanceSquared(right);
	if (l.inset === r.inset) {
		if (l.centerSquared !== r.centerSquared) return l.centerSquared < r.centerSquared ? -1 : 1;
		return left.id - right.id;
	}
	const delta = BigInt(l.inset - r.inset);
	if (delta > 0n) {
		if (l.centerSquared <= r.centerSquared) return -1;
		const difference = l.centerSquared - r.centerSquared - delta * delta;
		if (difference <= 0n) return -1;
		const comparison = difference * difference - 4n * delta * delta * r.centerSquared;
		if (comparison !== 0n) return comparison < 0n ? -1 : 1;
	} else return -compareDistance(right, left);
	return left.id - right.id;
}
function acquireTarget(state) {
	const eligible = state.targets.filter((target) => target.alive && target.visible && withinRange(target, QUESTION_VALUES$8.sightRangeMillitiles));
	eligible.sort(compareDistance);
	return eligible[0] ?? null;
}
function event$1(state, events, value) {
	if (state.history.length + events.length >= MAX_EVENTS$7) throw new RangeError("invisibility replay exceeds its event bound");
	events.push(value);
}
function loseTarget(state, events, reason) {
	if (state.targetId === null) return;
	const targetId = state.targetId;
	state.targetId = null;
	state.attackPhase = "idle";
	state.attackRemaining = null;
	event$1(state, events, {
		reason,
		targetId,
		tick: state.tick,
		type: "target-lost"
	});
}
function targetById(state, id) {
	return state.targets.find((target) => target.id === id);
}
function applyCommand(state, command, events) {
	if (command.type === "die") {
		if (!state.alive) return;
		state.alive = false;
		loseTarget(state, events, "attacker-died");
		state.attackPhase = "dead";
		state.pendingProjectiles = [];
		event$1(state, events, {
			tick: state.tick,
			type: "died"
		});
		return;
	}
	if (command.type === "interrupt") {
		if (!state.alive) return;
		loseTarget(state, events, "interrupted");
		state.pendingProjectiles = [];
		event$1(state, events, {
			tick: state.tick,
			type: "interrupted"
		});
		return;
	}
	const target = targetById(state, command.targetId);
	if (command.type === "target-died") {
		if (!target.alive) return;
		target.alive = false;
		target.health = 0;
		target.visible = false;
		target.hideSources = [];
		target.revealThroughTick = null;
		event$1(state, events, {
			targetId: target.id,
			tick: state.tick,
			type: "target-died"
		});
		return;
	}
	if (!target.alive) return;
	if (command.type === "hide") {
		const hiddenThroughTick = state.tick + QUESTION_VALUES$8.hideDurationTicks - 1;
		const current = target.hideSources.find(({ sourceId }) => sourceId === command.sourceId);
		if (current === void 0) {
			target.hideSources.push({
				hiddenThroughTick,
				sourceId: command.sourceId
			});
			target.hideSources.sort((left, right) => left.sourceId - right.sourceId);
		} else current.hiddenThroughTick = Math.max(current.hiddenThroughTick, hiddenThroughTick);
		event$1(state, events, {
			hiddenThroughTick: target.hideSources.find(({ sourceId }) => sourceId === command.sourceId).hiddenThroughTick,
			sourceId: command.sourceId,
			targetId: target.id,
			tick: state.tick,
			type: "hide-applied"
		});
		return;
	}
	const revealThroughTick = state.tick + QUESTION_VALUES$8.revealDurationTicks - 1;
	target.revealThroughTick = Math.max(target.revealThroughTick ?? -1, revealThroughTick);
	event$1(state, events, {
		revealThroughTick: target.revealThroughTick,
		sourceId: command.sourceId,
		targetId: target.id,
		tick: state.tick,
		type: "reveal-applied"
	});
}
function resolveVisibility(state, events) {
	for (const target of state.targets) {
		if (!target.alive) continue;
		target.hideSources = target.hideSources.filter(({ hiddenThroughTick }) => hiddenThroughTick >= state.tick);
		if (target.revealThroughTick !== null && target.revealThroughTick < state.tick) target.revealThroughTick = null;
		const visible = target.revealThroughTick !== null || target.hideSources.length === 0;
		if (visible !== target.visible) {
			target.visible = visible;
			event$1(state, events, {
				targetId: target.id,
				tick: state.tick,
				type: visible ? "target-revealed" : "target-hidden"
			});
		}
	}
}
function reconcileTarget(state, events) {
	if (!state.alive) return;
	if (state.targetId !== null) {
		const retained = targetById(state, state.targetId);
		if (!retained.alive || !retained.visible || !withinRange(retained, QUESTION_VALUES$8.sightRangeMillitiles)) loseTarget(state, events, retained.alive ? "ineligible" : "target-dead");
	}
	if (state.targetId === null) {
		const acquired = acquireTarget(state);
		if (acquired !== null) {
			state.targetId = acquired.id;
			state.attackPhase = withinRange(acquired, QUESTION_VALUES$8.attackRangeMillitiles) ? "windup" : "tracking";
			state.attackRemaining = state.attackPhase === "windup" ? QUESTION_VALUES$8.commonFirstHitTicks : null;
			event$1(state, events, {
				targetId: acquired.id,
				tick: state.tick,
				type: "target-acquired"
			});
		}
	}
}
function resolveProjectiles$1(state, events) {
	const pending = [];
	for (const projectile of state.pendingProjectiles) {
		if (projectile.contactTick !== state.tick) {
			pending.push(projectile);
			continue;
		}
		const target = targetById(state, projectile.targetId);
		if (!target.alive) {
			event$1(state, events, {
				reason: "target-dead",
				sequence: projectile.sequence,
				targetId: projectile.targetId,
				tick: state.tick,
				type: "projectile-missed"
			});
			continue;
		}
		const healthBefore = target.health;
		target.health = Math.max(0, target.health - QUESTION_VALUES$8.commonDamage);
		target.alive = target.health > 0;
		if (!target.alive) target.visible = false;
		event$1(state, events, {
			healthAfter: target.health,
			healthBefore,
			sequence: projectile.sequence,
			targetId: target.id,
			targetVisible: target.visible,
			tick: state.tick,
			type: "projectile-contact"
		});
	}
	state.pendingProjectiles = pending;
}
function resolveAttack(state, events) {
	if (!state.alive || state.targetId === null) return;
	const target = targetById(state, state.targetId);
	if (!(target.alive && target.visible && withinRange(target, QUESTION_VALUES$8.attackRangeMillitiles))) {
		if (state.attackPhase !== "tracking") {
			state.attackPhase = "tracking";
			state.attackRemaining = null;
		}
		return;
	}
	if (state.attackPhase === "tracking") {
		state.attackPhase = "windup";
		state.attackRemaining = QUESTION_VALUES$8.commonFirstHitTicks;
	}
	state.attackRemaining -= 1;
	if (state.attackRemaining !== 0) return;
	if (state.attackSequence === MAX_EVENTS$7) throw new RangeError("invisibility attack sequence exceeds its bound");
	state.attackSequence += 1;
	const contactTick = state.tick + QUESTION_VALUES$8.projectileContactDelayTicks;
	if (contactTick >= MAX_TICK$10) throw new RangeError("invisibility projectile contact exceeds tick bound");
	state.pendingProjectiles.push({
		contactTick,
		sequence: state.attackSequence,
		targetId: target.id
	});
	event$1(state, events, {
		contactTick,
		sequence: state.attackSequence,
		targetId: target.id,
		tick: state.tick,
		type: "projectile-launched"
	});
	state.attackPhase = "cadence";
	state.attackRemaining = QUESTION_VALUES$8.attackCadenceTicks;
}
function uncheckedAdvance$1(state, commands) {
	if (state.tick >= MAX_TICK$10) return [];
	const events = [];
	const command = commands[state.commandIndex];
	let suppressAcquisition = false;
	if (command?.tick === state.tick) {
		state.commandIndex += 1;
		applyCommand(state, command, events);
		suppressAcquisition = ["die", "interrupt"].includes(command.type);
	}
	resolveVisibility(state, events);
	if (!suppressAcquisition) reconcileTarget(state, events);
	if (state.alive) resolveProjectiles$1(state, events);
	resolveAttack(state, events);
	state.history.push(...clone$10(events));
	state.tick += 1;
	return events;
}
function checkedHideSources(value, label) {
	const sources = denseArray$9(value, label, MAX_COMMANDS$9).map((entry, index) => {
		const source = exactRecord$9(entry, HIDE_SOURCE_KEYS, `${label}[${index}]`);
		checkedId(source.sourceId, `${label}[${index}].sourceId`);
		safeInteger$2(source.hiddenThroughTick, `${label}[${index}].hiddenThroughTick`, 0, 4095);
		return source;
	});
	let prior = 0;
	for (const source of sources) {
		if (source.sourceId <= prior) throw new TypeError(`${label} is not ordered`);
		prior = source.sourceId;
	}
	return sources;
}
function checkedStateShape$1(value, commands, targets, label) {
	const state = exactRecord$9(value, STATE_KEYS$3, label);
	if (typeof state.alive !== "boolean") throw new TypeError(`${label}.alive must be a boolean`);
	safeInteger$2(state.tick, `${label}.tick`, 0, MAX_TICK$10);
	safeInteger$2(state.commandIndex, `${label}.commandIndex`, 0, commands.length);
	safeInteger$2(state.attackSequence, `${label}.attackSequence`, 0, MAX_EVENTS$7);
	checkedId(state.targetId, `${label}.targetId`, true);
	if (!PHASES.has(state.attackPhase)) throw new TypeError(`${label}.attackPhase is invalid`);
	if (state.attackRemaining !== null) safeInteger$2(state.attackRemaining, `${label}.attackRemaining`, 1, QUESTION_VALUES$8.attackCadenceTicks);
	const checkedTargetStates = denseArray$9(state.targets, `${label}.targets`, MAX_ENTITIES$3).map((entry, index) => {
		const target = exactRecord$9(entry, TARGET_STATE_KEYS, `${label}.targets[${index}]`);
		const base = checkedTargets$1([{
			alive: target.alive,
			health: target.health,
			id: target.id,
			kind: target.kind,
			layer: target.layer,
			position: target.position,
			radius: target.radius
		}], `${label}.target-base`)[0];
		if (typeof target.visible !== "boolean") throw new TypeError(`${label}.targets[${index}].visible must be boolean`);
		if (target.revealThroughTick !== null) safeInteger$2(target.revealThroughTick, `${label}.targets[${index}].revealThroughTick`, 0, 4095);
		return {
			...base,
			hideSources: checkedHideSources(target.hideSources, `${label}.targets[${index}].hideSources`),
			revealThroughTick: target.revealThroughTick,
			visible: target.visible
		};
	});
	const pendingProjectiles = denseArray$9(state.pendingProjectiles, `${label}.pendingProjectiles`, MAX_EVENTS$7).map((entry, index) => {
		const projectile = exactRecord$9(entry, PROJECTILE_KEYS, `${label}.pendingProjectiles[${index}]`);
		safeInteger$2(projectile.contactTick, `${label}.pendingProjectiles[${index}].contactTick`, state.tick, 4095);
		safeInteger$2(projectile.sequence, `${label}.pendingProjectiles[${index}].sequence`, 1, MAX_EVENTS$7);
		checkedId(projectile.targetId, `${label}.pendingProjectiles[${index}].targetId`);
		return projectile;
	});
	const history = denseArray$9(state.history, `${label}.history`, MAX_EVENTS$7);
	for (let index = 0; index < history.length; index += 1) {
		if (history[index] === null || typeof history[index] !== "object" || Array.isArray(history[index])) throw new TypeError(`${label}.history[${index}] must be an event object`);
		const tick = Object.getOwnPropertyDescriptor(history[index], "tick");
		const type = Object.getOwnPropertyDescriptor(history[index], "type");
		if (!tick?.enumerable || !Object.hasOwn(tick, "value") || !type?.enumerable || !Object.hasOwn(type, "value") || typeof type.value !== "string") throw new TypeError(`${label}.history[${index}] has invalid event data`);
		safeInteger$2(tick.value, `${label}.history[${index}].tick`, 0, Math.max(0, state.tick - 1));
	}
	if (checkedTargetStates.length !== targets.length) throw new TypeError(`${label}.targets changed identity cardinality`);
	return {
		alive: state.alive,
		attackPhase: state.attackPhase,
		attackRemaining: state.attackRemaining,
		attackSequence: state.attackSequence,
		commandIndex: state.commandIndex,
		history: clone$10(history),
		pendingProjectiles,
		targetId: state.targetId,
		targets: checkedTargetStates,
		tick: state.tick
	};
}
function replayState(commands, targets, ticks) {
	const state = initialState$6(targets);
	for (let index = 0; index < ticks; index += 1) uncheckedAdvance$1(state, commands);
	return state;
}
function checkedCausalState$1(value, commands, targets, label = "invisibility state") {
	const checked = checkedStateShape$1(value, commands, targets, label);
	const expected = replayState(commands, targets, checked.tick);
	if (canonicalJson$10(checked) !== canonicalJson$10(expected)) throw new TypeError(`${label} is forged or noncausal`);
	return checked;
}
function questionRecord$5(key, value, source = SOURCE$6) {
	return deepFreeze$8({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		key,
		source,
		value: clone$10(value)
	});
}
function createInvisibilityMappedFieldQuestionRecords(fixtures) {
	const checkedFixtures = denseArray$9(fixtures, "invisibility mapped benchmark fixtures", MAX_ENTITIES$3);
	const records = [];
	const fixtureIdentities = /* @__PURE__ */ new Set();
	for (let fixtureIndex = 0; fixtureIndex < checkedFixtures.length; fixtureIndex += 1) {
		const fixture = exactRecord$9(checkedFixtures[fixtureIndex], ["fixtureIdentity", "unverifiedFields"], `invisibility mapped benchmark fixture ${fixtureIndex}`);
		if (typeof fixture.fixtureIdentity !== "string" || fixture.fixtureIdentity.length === 0 || fixture.fixtureIdentity.length > 128) throw new TypeError(`invisibility mapped benchmark fixture ${fixtureIndex} identity is invalid`);
		if (fixtureIdentities.has(fixture.fixtureIdentity)) throw new TypeError("invisibility mapped benchmark fixtures must have unique identities");
		fixtureIdentities.add(fixture.fixtureIdentity);
		const fields = denseArray$9(fixture.unverifiedFields, `invisibility mapped benchmark fixture ${fixtureIndex} fields`, MAX_COMMANDS$9);
		const fieldNames = /* @__PURE__ */ new Set();
		for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
			const mappedField = exactRecord$9(fields[fieldIndex], ["field", "value"], `invisibility mapped benchmark fixture ${fixtureIndex} field ${fieldIndex}`);
			if (typeof mappedField.field !== "string" || !/^[a-z][a-z0-9_]*$/u.test(mappedField.field)) throw new TypeError(`invisibility mapped benchmark fixture ${fixtureIndex} field name is invalid`);
			if (fieldNames.has(mappedField.field)) throw new TypeError(`invisibility mapped benchmark fixture ${fixtureIndex} fields must be unique`);
			fieldNames.add(mappedField.field);
			const key = `mappedField:${fixture.fixtureIdentity}:${mappedField.field}`;
			const source = `test-only benchmark fixture ${fixture.fixtureIdentity} unverified_fields contains ${mappedField.field}`;
			records.push([key, questionRecord$5(key, mappedField.value, source)]);
		}
	}
	return deepFreeze$8(Object.fromEntries(records));
}
function createInvisibilitySpecialCatalog() {
	return createCardCatalog(CARD_DEFINITIONS$2);
}
function createInvisibilityQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("invisibility question records do not accept overrides");
	return deepFreeze$8(Object.fromEntries(Object.entries(QUESTION_VALUES$8).map(([key, value]) => [key, questionRecord$5(key, value)])));
}
function createInvisibilityFixture(targets = [], commands = []) {
	return clone$10(checkedSetup$9({
		commands,
		targets
	}));
}
var CARD_DEFINITIONS$2, SOURCE$6, FIXTURE$6, MAX_COMMANDS$9, MAX_ENTITIES$3, MAX_EVENTS$7, MAX_HEALTH$2, MAX_POSITION$2, MAX_RADIUS$1, MAX_SNAPSHOT_BYTES$10, MAX_STEP_CHUNK$8, MAX_TICK$10, SETUP_KEYS$5, TARGET_KEYS, POSITION_KEYS, COMMAND_KEYS$6, COMMAND_TYPES$3, SNAPSHOT_KEYS$4, IDENTITY_KEYS$3, STATE_KEYS$3, TARGET_STATE_KEYS, HIDE_SOURCE_KEYS, PROJECTILE_KEYS, KINDS$1, LAYERS$1, PHASES, QUESTION_VALUES$8, InvisibilityRevealEncounter;
function init_combat_status_invisibility() {
	return (init_combat_status_invisibility = __esmMin((() => {
		init_schema();
		CARD_DEFINITIONS$2 = [{
			areaDamageRadiusMillitiles: null,
			components: [],
			cost: 3,
			count: 1,
			damage: 96,
			deployTimeTicks: 60,
			displayName: "Veil Prowler",
			firstHitTicks: 4,
			hitSpeedTicks: 6,
			hitpoints: 900,
			id: "veil-prowler",
			kind: "unit",
			movementMillitilesPerSecond: 1e3,
			rangeMillitiles: 2e3,
			rarity: "uncommon",
			sightRangeMillitiles: 5e3,
			targetMode: "ground-and-air"
		}];
		SOURCE$6 = "unsourced-invisibility-reveal-reacquisition-fixture";
		FIXTURE$6 = "invisibility-reveal-reacquisition-question-v1";
		MAX_COMMANDS$9 = 96;
		MAX_ENTITIES$3 = 32;
		MAX_EVENTS$7 = 8192;
		MAX_HEALTH$2 = 1e6;
		MAX_POSITION$2 = 1e6;
		MAX_RADIUS$1 = 1e5;
		MAX_SNAPSHOT_BYTES$10 = 524288;
		MAX_STEP_CHUNK$8 = 4096;
		MAX_TICK$10 = 4096;
		SETUP_KEYS$5 = ["commands", "targets"];
		TARGET_KEYS = [
			"alive",
			"health",
			"id",
			"kind",
			"layer",
			"position",
			"radius"
		];
		POSITION_KEYS = ["x", "y"];
		COMMAND_KEYS$6 = [
			"sourceId",
			"targetId",
			"tick",
			"type"
		];
		COMMAND_TYPES$3 = /* @__PURE__ */ new Set([
			"die",
			"hide",
			"interrupt",
			"reveal",
			"target-died"
		]);
		SNAPSHOT_KEYS$4 = [
			"identity",
			"state",
			"version"
		];
		IDENTITY_KEYS$3 = [
			"commands",
			"fixture",
			"targets"
		];
		STATE_KEYS$3 = [
			"alive",
			"attackPhase",
			"attackRemaining",
			"attackSequence",
			"commandIndex",
			"history",
			"pendingProjectiles",
			"targetId",
			"targets",
			"tick"
		];
		TARGET_STATE_KEYS = [
			"alive",
			"health",
			"hideSources",
			"id",
			"kind",
			"layer",
			"position",
			"radius",
			"revealThroughTick",
			"visible"
		];
		HIDE_SOURCE_KEYS = ["hiddenThroughTick", "sourceId"];
		PROJECTILE_KEYS = [
			"contactTick",
			"sequence",
			"targetId"
		];
		KINDS$1 = /* @__PURE__ */ new Set(["structure", "troop"]);
		LAYERS$1 = /* @__PURE__ */ new Set(["air", "ground"]);
		PHASES = /* @__PURE__ */ new Set([
			"cadence",
			"dead",
			"idle",
			"tracking",
			"windup"
		]);
		QUESTION_VALUES$8 = {
			attackCadenceTicks: 6,
			attackRangeBoundary: "inclusive-edge-to-edge-millitile-distance",
			attackRangeMillitiles: 2e3,
			attackReadyOrdering: "command-first-visibility-then-contact-then-launch",
			commonAreaDamageRadiusMillitiles: null,
			commonCount: 1,
			commonDamage: 96,
			commonDeployTimeTicks: 60,
			commonFirstHitTicks: 4,
			commonHitSpeedTicks: 6,
			commonHitpoints: 900,
			commonMovementMillitilesPerSecond: 1e3,
			commonRangeMillitiles: 2e3,
			commonSightRangeMillitiles: 5e3,
			commonTargetMode: "ground-and-air",
			contactBoundary: "contact-applies-after-command-and-visibility-resolution",
			deathPolicy: "attacker-death-clears-target-windup-and-in-flight-projectiles",
			eligibilityPolicy: "living-visible-ground-or-air-troops-and-structures-are-eligible",
			hideApplyBoundary: "hide-command-is-effective-on-its-integer-boundary",
			hideDurationTicks: 12,
			hideExpiryBoundary: "source-hide-is-inclusive-through-apply-plus-duration-minus-one",
			hideSourcePolicy: "independent-source-expiries-union-to-hidden",
			inFlightHiddenTargetPolicy: "launched-projectile-retains-stable-target-and-hits-while-hidden",
			interruptionPolicy: "attacker-interruption-clears-all-attack-work-and-reacquires-next-boundary",
			projectileContactDelayTicks: 2,
			reacquisitionPolicy: "nearest-edge-distance-then-lowest-stable-id-independent-of-input-order",
			reapplyPolicy: "same-source-hide-refreshes-only-to-the-later-expiry",
			rehideBoundary: "rehide-on-first-boundary-after-reveal-window",
			revealApplyBoundary: "reveal-command-suppresses-all-active-hide-sources-immediately",
			revealDurationTicks: 4,
			revealExpiryBoundary: "reveal-is-inclusive-through-apply-plus-duration-minus-one",
			sightRangeBoundary: "inclusive-edge-to-edge-millitile-distance",
			sightRangeMillitiles: 5e3,
			simulationTicksPerSecond: 60,
			sourceEligibility: "positive-safe-integer-source-id",
			targetDeathPolicy: "target-death-loses-lock-and-in-flight-projectile-misses-at-contact",
			targetMode: "ground-and-air",
			targetabilityPolicy: "invisibility-removes-targetability-without-moving",
			tiePolicy: "lowest-positive-stable-id",
			windupCancellation: "target-loss-discards-readiness-and-cadence-progress",
			windupRestart: "reacquisition-starts-a-full-four-boundary-windup"
		};
		InvisibilityRevealEncounter = class InvisibilityRevealEncounter {
			#commands;
			#state;
			#targets;
			constructor(setup = createInvisibilityFixture()) {
				const checked = checkedSetup$9(setup);
				this.#commands = checked.commands;
				this.#targets = checked.targets;
				this.#state = initialState$6(this.#targets);
			}
			get replay() {
				return clone$10(this.#state.history);
			}
			get state() {
				return clone$10(this.#state);
			}
			step() {
				return this.stepMany(1);
			}
			stepMany(count) {
				safeInteger$2(count, "invisibility step count", 0, MAX_STEP_CHUNK$8);
				if (count > MAX_TICK$10 - this.#state.tick) throw new RangeError("invisibility step count exceeds the encounter bound");
				const candidate = checkedCausalState$1(this.#state, this.#commands, this.#targets);
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...uncheckedAdvance$1(candidate, this.#commands));
				this.#state = candidate;
				return clone$10(events);
			}
			run() {
				return this.stepMany(MAX_TICK$10 - this.#state.tick);
			}
			serialize() {
				const serialized = canonicalJson$10({
					identity: {
						commands: this.#commands,
						fixture: FIXTURE$6,
						targets: this.#targets
					},
					state: checkedCausalState$1(this.#state, this.#commands, this.#targets),
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$10) throw new RangeError("invisibility snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("invisibility snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$10) throw new RangeError("invisibility snapshot exceeds its byte bound");
				let value;
				try {
					value = JSON.parse(serialized);
				} catch {
					throw new TypeError("invisibility snapshot must be valid JSON");
				}
				if (serialized !== canonicalJson$10(value)) throw new TypeError("invisibility snapshot must be canonical duplicate-free JSON");
				const snapshot = exactRecord$9(value, SNAPSHOT_KEYS$4, "invisibility snapshot");
				if (snapshot.version !== 1) throw new TypeError("invisibility snapshot version is unsupported");
				const identity = exactRecord$9(snapshot.identity, IDENTITY_KEYS$3, "invisibility snapshot.identity");
				if (identity.fixture !== FIXTURE$6) throw new TypeError("invisibility snapshot fixture identity is invalid");
				const targets = checkedTargets$1(identity.targets);
				const commands = checkedCommands$8(identity.commands, new Set(targets.map(({ id }) => id)));
				const state = checkedCausalState$1(snapshot.state, commands, targets, "invisibility snapshot.state");
				const encounter = new InvisibilityRevealEncounter({
					commands,
					targets
				});
				encounter.#state = state;
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/champion-abilities.js
function clone$9(value) {
	return JSON.parse(JSON.stringify(value));
}
function canonicalJson$9(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$9).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$9(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord$8(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$8(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function integer$7(value, label, minimum, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
	return value;
}
function checkedSetup$8(value) {
	const raw = exactRecord$8(value, SETUP_KEYS$4, "champion setup");
	const owners = denseArray$8(raw.owners, MAX_OWNERS, "champion owners").map((entry, index) => {
		const owner = exactRecord$8(entry, OWNER_KEYS, `champion owner ${index}`);
		return {
			elixir: integer$7(owner.elixir, `champion owner ${index}.elixir`, 0, 10),
			id: integer$7(owner.id, `champion owner ${index}.id`, 1)
		};
	}).sort((a, b) => a.id - b.id);
	if (new Set(owners.map(({ id }) => id)).size !== owners.length) throw new TypeError("champion owner IDs must be unique");
	const ownerIds = new Set(owners.map(({ id }) => id));
	const champions = denseArray$8(raw.champions, MAX_CHAMPIONS, "champions").map((entry, index) => {
		const champion = exactRecord$8(entry, CHAMPION_KEYS, `champion ${index}`);
		if (!Object.hasOwn(ARCHETYPES$2, champion.archetypeId)) throw new TypeError(`champion ${index}.archetypeId is unsupported`);
		const result = {
			archetypeId: champion.archetypeId,
			entityId: integer$7(champion.entityId, `champion ${index}.entityId`, 1),
			ownerId: integer$7(champion.ownerId, `champion ${index}.ownerId`, 1)
		};
		if (!ownerIds.has(result.ownerId)) throw new TypeError(`champion ${index}.ownerId is unknown`);
		return result;
	}).sort((a, b) => a.entityId - b.entityId);
	if (new Set(champions.map(({ entityId }) => entityId)).size !== champions.length) throw new TypeError("champion entity IDs must be unique");
	const championIds = new Set(champions.map(({ entityId }) => entityId));
	const commands = denseArray$8(raw.commands, MAX_COMMANDS$8, "champion commands").map((entry, index) => {
		const command = exactRecord$8(entry, COMMAND_KEYS$5, `champion command ${index}`);
		if (!COMMAND_TYPES$2.has(command.type)) throw new TypeError(`champion command ${index}.type is unsupported`);
		integer$7(command.tick, `champion command ${index}.tick`, 0, 4095);
		integer$7(command.entityId, `champion command ${index}.entityId`, 1);
		if (!championIds.has(command.entityId)) throw new TypeError(`champion command ${index}.entityId is unknown`);
		return { ...command };
	}).sort((a, b) => a.tick - b.tick || a.entityId - b.entityId || COMMAND_ORDER[a.type] - COMMAND_ORDER[b.type]);
	const signatures = commands.map(canonicalJson$9);
	if (new Set(signatures).size !== signatures.length) throw new TypeError("champion commands must be unique");
	return {
		champions,
		commands,
		owners
	};
}
function initialState$5(setup) {
	return {
		champions: setup.champions.map((entry) => ({
			activeUntilTick: null,
			archetypeId: entry.archetypeId,
			cooldownUntilTick: null,
			entityId: entry.entityId,
			life: "undeployed",
			ownerId: entry.ownerId,
			phase: "unavailable",
			primitives: []
		})),
		commandIndex: 0,
		history: [],
		owners: clone$9(setup.owners),
		tick: 0
	};
}
function event(state, value) {
	state.history.push({
		...value,
		sequence: state.history.length + 1,
		tick: state.tick
	});
}
function createPrimitive(name) {
	if (name === "shield-form") return new ShieldFormEncounter();
	if (name === "recoil") return new RecoilEncounter(createRecoilSpecialFixture());
	if (name === "charge") return new ChargeSpecialEncounter(createChargeSpecialFixture());
	if (name === "dash") return new DashEncounter(createDashSpecialFixture());
	if (name === "leap") return new LeapKnockbackRetargetEncounter(createLeapKnockbackFixture());
	if (name === "reset") return new InstantaneousCombatResetEncounter(createResetFixture());
	if (name === "invisibility") return new InvisibilityRevealEncounter(createInvisibilityFixture());
	if (name === "reflection") return new ReflectionEncounter(createReflectionSpecialFixture());
	throw new TypeError("champion primitive is unsupported");
}
function restorePrimitive(name, serialized) {
	if (name === "shield-form") return ShieldFormEncounter.restore(serialized);
	if (name === "recoil") return RecoilEncounter.restore(serialized);
	if (name === "charge") return ChargeSpecialEncounter.restore(serialized);
	if (name === "dash") return DashEncounter.restore(serialized);
	if (name === "leap") return LeapKnockbackRetargetEncounter.restore(serialized);
	if (name === "reset") return InstantaneousCombatResetEncounter.restore(serialized);
	if (name === "invisibility") return InvisibilityRevealEncounter.restore(serialized);
	if (name === "reflection") return ReflectionEncounter.restore(serialized);
	throw new TypeError("champion primitive is unsupported");
}
function invokePrimitive(name, encounter, first) {
	if (name === "shield-form") return first ? encounter.damage(892) : encounter.advanceTicks(1);
	return encounter.stepMany(1);
}
function appendPrimitiveEvents(state, champion, primitive, values) {
	for (const primitiveEvent of values) event(state, {
		archetypeId: champion.archetypeId,
		entityId: champion.entityId,
		ownerId: champion.ownerId,
		primitive: primitive.name,
		primitiveEvent,
		sourceActivationTick: primitive.source.activationTick,
		type: "primitive-event"
	});
}
function activatePrimitives(state, champion) {
	champion.primitives = PRIMITIVE_NAMES[champion.archetypeId].map((name) => {
		const encounter = createPrimitive(name);
		const events = invokePrimitive(name, encounter, true);
		const primitive = {
			events: clone$9(events),
			name,
			serialized: encounter.serialize(),
			source: {
				activationTick: state.tick,
				archetypeId: champion.archetypeId,
				entityId: champion.entityId,
				ownerId: champion.ownerId
			},
			state: encounter.state,
			status: "active"
		};
		appendPrimitiveEvents(state, champion, primitive, events);
		return primitive;
	});
}
function advancePrimitives(state, champion) {
	for (const primitive of champion.primitives) {
		if (primitive.status !== "active" || primitive.source.activationTick === state.tick) continue;
		const encounter = restorePrimitive(primitive.name, primitive.serialized);
		const events = invokePrimitive(primitive.name, encounter, false);
		primitive.events.push(...clone$9(events));
		primitive.serialized = encounter.serialize();
		primitive.state = encounter.state;
		appendPrimitiveEvents(state, champion, primitive, events);
	}
}
function setPrimitiveStatus(champion, status) {
	for (const primitive of champion.primitives) primitive.status = status;
}
function processCommand(state, command) {
	const champion = state.champions.find(({ entityId }) => entityId === command.entityId);
	const owner = state.owners.find(({ id }) => id === champion.ownerId);
	const config = ARCHETYPES$2[champion.archetypeId];
	if (command.type === "deploy") {
		const anotherLives = state.champions.some((entry) => entry.ownerId === champion.ownerId && entry.entityId !== champion.entityId && entry.life === "alive");
		if (champion.life === "alive" || anotherLives) {
			event(state, {
				entityId: champion.entityId,
				reason: champion.life === "alive" ? "already-alive" : "owner-has-champion",
				type: "deploy-rejected"
			});
			return;
		}
		Object.assign(champion, {
			activeUntilTick: null,
			cooldownUntilTick: null,
			life: "alive",
			phase: "idle",
			primitives: []
		});
		event(state, {
			entityId: champion.entityId,
			type: "deployed"
		});
		return;
	}
	if (command.type === "die") {
		if (champion.life !== "alive") {
			event(state, {
				entityId: champion.entityId,
				reason: "not-alive",
				type: "death-rejected"
			});
			return;
		}
		Object.assign(champion, {
			activeUntilTick: null,
			cooldownUntilTick: null,
			life: "dead",
			phase: "unavailable"
		});
		setPrimitiveStatus(champion, "cancelled");
		event(state, {
			entityId: champion.entityId,
			type: "died"
		});
		return;
	}
	let reason = null;
	if (champion.life !== "alive") reason = "not-alive";
	else if (champion.phase !== "idle") reason = champion.phase;
	else if (owner.elixir < config.abilityCost) reason = "insufficient-elixir";
	if (reason !== null) {
		event(state, {
			entityId: champion.entityId,
			reason,
			type: "activation-rejected"
		});
		return;
	}
	owner.elixir -= config.abilityCost;
	champion.phase = "active";
	champion.activeUntilTick = state.tick + config.activeTicks;
	champion.cooldownUntilTick = champion.activeUntilTick + config.cooldownTicks;
	event(state, {
		activeUntilTick: champion.activeUntilTick,
		adapter: config.adapter,
		cooldownUntilTick: champion.cooldownUntilTick,
		cost: config.abilityCost,
		elixirAfter: owner.elixir,
		entityId: champion.entityId,
		type: "activated"
	});
	activatePrimitives(state, champion);
}
function advanceOne(state, setup) {
	while (setup.commands[state.commandIndex]?.tick === state.tick) {
		processCommand(state, setup.commands[state.commandIndex]);
		state.commandIndex += 1;
	}
	for (const champion of state.champions) {
		if (champion.life === "alive" && champion.phase === "active") advancePrimitives(state, champion);
		if (champion.life === "alive" && champion.phase === "active" && champion.activeUntilTick === state.tick) {
			champion.phase = "cooldown";
			champion.activeUntilTick = null;
			setPrimitiveStatus(champion, "completed");
			event(state, {
				entityId: champion.entityId,
				type: "active-ended"
			});
		}
		if (champion.life === "alive" && champion.phase === "cooldown" && champion.cooldownUntilTick === state.tick) {
			champion.phase = "idle";
			champion.cooldownUntilTick = null;
			event(state, {
				entityId: champion.entityId,
				type: "cooldown-ended"
			});
		}
	}
	state.tick += 1;
}
function checkedCausalState(value, setup) {
	const raw = exactRecord$8(value, STATE_KEYS$2, "champion state");
	integer$7(raw.tick, "champion state.tick", 0, MAX_TICK$9);
	const rebuilt = initialState$5(setup);
	while (rebuilt.tick < raw.tick) advanceOne(rebuilt, setup);
	if (canonicalJson$9(raw) !== canonicalJson$9(rebuilt)) throw new TypeError("champion snapshot state is not the canonical causal state");
	return rebuilt;
}
function question(archetypeId, field, value) {
	return Object.freeze({
		archetypeId,
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		field,
		source: "absent-pre-cutoff-champion-ability-evidence",
		value
	});
}
function createChampionAbilityCatalog() {
	return createCardCatalog(DEFINITIONS$1);
}
function createChampionAbilityQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("champion question records do not accept overrides");
	const values = [];
	for (const [archetypeId, config] of Object.entries(ARCHETYPES$2)) {
		const byField = {
			abilityCost: config.abilityCost,
			activationDurationTicks: config.activeTicks,
			cooldownTicks: config.cooldownTicks,
			activationEligibility: "alive-deployed-idle-and-owner-can-pay",
			activationBoundaryOrder: "commands-before-active-and-cooldown-expiry",
			activeExpiryBoundary: "active-through-boundary-before-command-processing",
			cooldownExpiryBoundary: "idle-after-command-processing-on-expiry-boundary",
			deathCancellation: "death-clears-active-and-cooldown-without-refund",
			deployEligibility: "only-when-owner-has-no-other-living-champion",
			redeployState: "idle-with-no-carried-active-or-cooldown-state",
			oneLivingChampionPerOwner: "deploy-rejects-second-living-champion",
			simultaneousActivationOrder: "tick-then-stable-entity-id",
			abilitySpecificCoupling: config.adapter
		};
		for (const field of QUESTION_FIELDS) values.push(question(archetypeId, field, byField[field]));
	}
	return Object.freeze(values);
}
function createChampionMappedFieldQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("champion mapped-field question records do not accept overrides");
	const records = [];
	for (const definition of DEFINITIONS$1) {
		const fields = definition.id === "bone-regent" ? [...UNVERIFIED_COMMON_FIELDS, "areaDamageRadiusMillitiles"] : UNVERIFIED_COMMON_FIELDS;
		for (const field of fields) records.push(Object.freeze({
			archetypeId: definition.id,
			authoritative: false,
			confidence: "unverified",
			disposition: "question-backed-match",
			field,
			source: "cards.json unverified_fields",
			value: definition[field]
		}));
	}
	return Object.freeze(records);
}
function createChampionAbilityFixture(owners = [], champions = [], commands = []) {
	return clone$9(checkedSetup$8({
		champions,
		commands,
		owners
	}));
}
/**
* Compatibility view over the controller's real activation path. It cannot
* execute primitives independently of a deployed and paid-for activation.
*/
function probeChampionAbilityAdapters() {
	return Object.fromEntries(Object.keys(ARCHETYPES$2).map((archetypeId, index) => {
		const entityId = index + 1;
		const ownerId = index + 1;
		const controller = new ChampionAbilityController(createChampionAbilityFixture([{
			elixir: 10,
			id: ownerId
		}], [{
			archetypeId,
			entityId,
			ownerId
		}], [{
			entityId,
			tick: 0,
			type: "deploy"
		}, {
			entityId,
			tick: 1,
			type: "activate"
		}]));
		controller.stepMany(2);
		return [archetypeId, controller.state.champions[0].primitives];
	}));
}
var MAX_CHAMPIONS, MAX_OWNERS, MAX_COMMANDS$8, MAX_TICK$9, MAX_STEP_CHUNK$7, MAX_SNAPSHOT_BYTES$9, SETUP_KEYS$4, CHAMPION_KEYS, OWNER_KEYS, COMMAND_KEYS$5, SNAPSHOT_KEYS$3, IDENTITY_KEYS$2, STATE_KEYS$2, COMMAND_TYPES$2, COMMAND_ORDER, DEFINITIONS$1, ARCHETYPES$2, QUESTION_FIELDS, UNVERIFIED_COMMON_FIELDS, PRIMITIVE_NAMES, ChampionAbilityController;
function init_champion_abilities() {
	return (init_champion_abilities = __esmMin((() => {
		init_shields_forms();
		init_special_movement_recoil();
		init_special_movement_charge();
		init_special_movement_dash();
		init_special_movement_leap_knockback();
		init_special_combat_reset();
		init_combat_status_invisibility();
		init_special_projectiles_reflection();
		init_schema();
		MAX_CHAMPIONS = 16;
		MAX_OWNERS = 8;
		MAX_COMMANDS$8 = 256;
		MAX_TICK$9 = 4096;
		MAX_STEP_CHUNK$7 = 512;
		MAX_SNAPSHOT_BYTES$9 = 524288;
		SETUP_KEYS$4 = [
			"champions",
			"commands",
			"owners"
		];
		CHAMPION_KEYS = [
			"archetypeId",
			"entityId",
			"ownerId"
		];
		OWNER_KEYS = ["elixir", "id"];
		COMMAND_KEYS$5 = [
			"entityId",
			"tick",
			"type"
		];
		SNAPSHOT_KEYS$3 = [
			"identity",
			"state",
			"version"
		];
		IDENTITY_KEYS$2 = ["fixture", "setup"];
		STATE_KEYS$2 = [
			"champions",
			"commandIndex",
			"history",
			"owners",
			"tick"
		];
		COMMAND_TYPES$2 = /* @__PURE__ */ new Set([
			"activate",
			"deploy",
			"die"
		]);
		COMMAND_ORDER = Object.freeze({
			deploy: 0,
			activate: 1,
			die: 2
		});
		DEFINITIONS$1 = [
			{
				id: "iron-borer",
				displayName: "Iron Borer",
				cost: 4,
				kind: "unit",
				rarity: "heroic",
				hitpoints: 2300,
				damage: 40,
				hitSpeedTicks: 24,
				firstHitTicks: 42,
				deployTimeTicks: 60,
				rangeMillitiles: 1600,
				sightRangeMillitiles: 5500,
				movementMillitilesPerSecond: 1e3,
				targetMode: "ground",
				count: 1,
				areaDamageRadiusMillitiles: null,
				components: []
			},
			{
				id: "bone-regent",
				displayName: "Bone Regent",
				cost: 4,
				kind: "unit",
				rarity: "heroic",
				hitpoints: 2300,
				damage: 205,
				hitSpeedTicks: 96,
				firstHitTicks: 78,
				deployTimeTicks: 60,
				rangeMillitiles: 1200,
				sightRangeMillitiles: 5500,
				movementMillitilesPerSecond: 1e3,
				targetMode: "ground",
				count: 1,
				areaDamageRadiusMillitiles: 1300,
				components: []
			},
			{
				id: "dusk-ranger",
				displayName: "Dusk Ranger",
				cost: 5,
				kind: "unit",
				rarity: "heroic",
				hitpoints: 1e3,
				damage: 225,
				hitSpeedTicks: 72,
				firstHitTicks: 54,
				deployTimeTicks: 60,
				rangeMillitiles: 5e3,
				sightRangeMillitiles: 5500,
				movementMillitilesPerSecond: 1e3,
				targetMode: "ground-and-air",
				count: 1,
				areaDamageRadiusMillitiles: null,
				components: []
			},
			{
				id: "gilded-lancer",
				displayName: "Gilded Lancer",
				cost: 4,
				kind: "unit",
				rarity: "heroic",
				hitpoints: 1800,
				damage: 160,
				hitSpeedTicks: 54,
				firstHitTicks: 42,
				deployTimeTicks: 60,
				rangeMillitiles: 1200,
				sightRangeMillitiles: 5500,
				movementMillitilesPerSecond: 1e3,
				targetMode: "ground",
				count: 1,
				areaDamageRadiusMillitiles: null,
				components: []
			},
			{
				id: "aegis-sage",
				displayName: "Aegis Sage",
				cost: 5,
				kind: "unit",
				rarity: "heroic",
				hitpoints: 2e3,
				damage: 140,
				hitSpeedTicks: 48,
				firstHitTicks: 36,
				deployTimeTicks: 60,
				rangeMillitiles: 1200,
				sightRangeMillitiles: 5500,
				movementMillitilesPerSecond: 1e3,
				targetMode: "ground",
				count: 1,
				areaDamageRadiusMillitiles: null,
				components: []
			}
		];
		ARCHETYPES$2 = Object.freeze({
			"aegis-sage": Object.freeze({
				abilityCost: 1,
				activeTicks: 4,
				adapter: "reflection",
				cooldownTicks: 6
			}),
			"bone-regent": Object.freeze({
				abilityCost: 2,
				activeTicks: 3,
				adapter: "shield-form-reset",
				cooldownTicks: 7
			}),
			"dusk-ranger": Object.freeze({
				abilityCost: 1,
				activeTicks: 5,
				adapter: "invisibility",
				cooldownTicks: 8
			}),
			"gilded-lancer": Object.freeze({
				abilityCost: 1,
				activeTicks: 2,
				adapter: "charge-dash-leap",
				cooldownTicks: 5
			}),
			"iron-borer": Object.freeze({
				abilityCost: 1,
				activeTicks: 3,
				adapter: "recoil-reset",
				cooldownTicks: 6
			})
		});
		QUESTION_FIELDS = Object.freeze([
			"abilityCost",
			"activationDurationTicks",
			"cooldownTicks",
			"activationEligibility",
			"activationBoundaryOrder",
			"activeExpiryBoundary",
			"cooldownExpiryBoundary",
			"deathCancellation",
			"deployEligibility",
			"redeployState",
			"oneLivingChampionPerOwner",
			"simultaneousActivationOrder",
			"abilitySpecificCoupling"
		]);
		UNVERIFIED_COMMON_FIELDS = Object.freeze([
			"hitpoints",
			"damage",
			"hitSpeedTicks",
			"firstHitTicks",
			"deployTimeTicks",
			"rangeMillitiles",
			"sightRangeMillitiles",
			"movementMillitilesPerSecond",
			"targetMode",
			"count"
		]);
		PRIMITIVE_NAMES = Object.freeze({
			"aegis-sage": Object.freeze(["reflection"]),
			"bone-regent": Object.freeze(["shield-form", "reset"]),
			"dusk-ranger": Object.freeze(["invisibility"]),
			"gilded-lancer": Object.freeze([
				"charge",
				"dash",
				"leap"
			]),
			"iron-borer": Object.freeze(["recoil", "reset"])
		});
		ChampionAbilityController = class ChampionAbilityController {
			#setup;
			#state;
			constructor(setup = createChampionAbilityFixture()) {
				this.#setup = checkedSetup$8(setup);
				this.#state = initialState$5(this.#setup);
			}
			get replay() {
				return clone$9(this.#state.history);
			}
			get state() {
				return clone$9(this.#state);
			}
			step() {
				return this.stepMany(1);
			}
			stepMany(count) {
				integer$7(count, "champion step count", 0, MAX_STEP_CHUNK$7);
				if (count > MAX_TICK$9 - this.#state.tick) throw new RangeError("champion step count exceeds the encounter bound");
				const candidate = clone$9(this.#state);
				const historyStart = candidate.history.length;
				for (let index = 0; index < count; index += 1) advanceOne(candidate, this.#setup);
				this.#state = candidate;
				return clone$9(candidate.history.slice(historyStart));
			}
			serialize() {
				const serialized = canonicalJson$9({
					identity: {
						fixture: "champion-ability-controller-question-v1",
						setup: this.#setup
					},
					state: this.#state,
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$9) throw new RangeError("champion snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("champion snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$9) throw new RangeError("champion snapshot exceeds its byte bound");
				let parsed;
				try {
					parsed = JSON.parse(serialized);
				} catch {
					throw new TypeError("champion snapshot must be valid JSON");
				}
				if (serialized !== canonicalJson$9(parsed)) throw new TypeError("champion snapshot must be canonical duplicate-free JSON");
				const snapshot = exactRecord$8(parsed, SNAPSHOT_KEYS$3, "champion snapshot");
				if (snapshot.version !== 1) throw new TypeError("champion snapshot version is unsupported");
				const identity = exactRecord$8(snapshot.identity, IDENTITY_KEYS$2, "champion snapshot identity");
				if (identity.fixture !== "champion-ability-controller-question-v1") throw new TypeError("champion snapshot fixture is unsupported");
				const setup = checkedSetup$8(identity.setup);
				const state = checkedCausalState(snapshot.state, setup);
				const controller = new ChampionAbilityController(setup);
				controller.#state = state;
				return controller;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/death-spawns.js
function deepFreeze$7(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze$7(child);
		Object.freeze(value);
	}
	return value;
}
function clone$8(value) {
	return structuredClone(value);
}
function canonicalJson$8(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$8).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$8(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord$7(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain string-keyed object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$7(value, maximum, label, minimum = 0) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < minimum || value.length > maximum || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain only dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function integer$6(value, minimum, maximum, label) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
	return value;
}
function text$1(value, label) {
	let count = 0;
	if (typeof value === "string" && value.isWellFormed()) for (const _point of value) {
		count += 1;
		if (count > 128) break;
	}
	if (count < 1 || count > 128) throw new TypeError(`${label} must be 1 to 128 Unicode code points`);
	return value;
}
function checkedAnchor$2(value, label) {
	const anchor = exactRecord$7(value, ["x", "y"], label);
	return {
		x: integer$6(anchor.x, -1e6, 1e6, `${label}.x`),
		y: integer$6(anchor.y, -1e6, 1e6, `${label}.y`)
	};
}
function checkedPeriodic$1(value, tracker, label) {
	if (value === null) return null;
	if (tracker.seen.has(value)) throw new TypeError(`${label} graph must not contain aliases or cycles`);
	tracker.seen.add(value);
	const periodic = exactRecord$7(value, PERIODIC_KEYS$1, label);
	const initialDelayTicks = integer$6(periodic.initialDelayTicks, 1, 511, `${label}.initialDelayTicks`);
	const cadenceTicks = integer$6(periodic.cadenceTicks, 1, MAX_TICK$8, `${label}.cadenceTicks`);
	const lifetimeTicks = integer$6(periodic.lifetimeTicks, 1, MAX_TICK$8, `${label}.lifetimeTicks`);
	return {
		cadenceTicks,
		children: checkedChildren$1(periodic.children, tracker, `${label}.children`, 1),
		initialDelayTicks,
		lifetimeTicks
	};
}
function checkedChild$1(value, tracker, label) {
	if (tracker.seen.has(value)) throw new TypeError(`${label} graph must not contain aliases or cycles`);
	tracker.seen.add(value);
	tracker.count += 1;
	if (tracker.count > MAX_GRAPH_NODES$1) throw new RangeError(`death spawn graph exceeds ${MAX_GRAPH_NODES$1} nodes`);
	const child = exactRecord$7(value, CHILD_KEYS$2, label);
	const checked = {
		archetypeId: text$1(child.archetypeId, `${label}.archetypeId`),
		children: checkedChildren$1(child.children, tracker, `${label}.children`),
		health: integer$6(child.health, 1, Number.MAX_SAFE_INTEGER, `${label}.health`),
		periodic: checkedPeriodic$1(child.periodic, tracker, `${label}.periodic`),
		radius: integer$6(child.radius, 0, 1e6, `${label}.radius`),
		role: child.role
	};
	if (checked.role !== "primary" && checked.role !== "secondary") throw new TypeError(`${label}.role is invalid`);
	return checked;
}
function checkedChildren$1(value, tracker, label, minimum = 0) {
	return denseArray$7(value, 15, label, minimum).map((entry, index) => checkedChild$1(entry, tracker, `${label}[${index}]`));
}
function checkedEntity$2(value, index, tracker) {
	const label = `death spawn entity ${index}`;
	if (tracker.seen.has(value)) throw new TypeError(`${label} graph must not contain aliases or cycles`);
	tracker.seen.add(value);
	const entity = exactRecord$7(value, ENTITY_KEYS$2, label);
	return {
		anchor: checkedAnchor$2(entity.anchor, `${label}.anchor`),
		archetypeId: text$1(entity.archetypeId, `${label}.archetypeId`),
		children: checkedChildren$1(entity.children, tracker, `${label}.children`),
		health: integer$6(entity.health, 1, Number.MAX_SAFE_INTEGER, `${label}.health`),
		id: integer$6(entity.id, 1, Number.MAX_SAFE_INTEGER, `${label}.id`),
		ownerId: integer$6(entity.ownerId, 1, Number.MAX_SAFE_INTEGER, `${label}.ownerId`),
		periodic: checkedPeriodic$1(entity.periodic, tracker, `${label}.periodic`),
		sourceId: integer$6(entity.sourceId, 1, Number.MAX_SAFE_INTEGER, `${label}.sourceId`)
	};
}
function checkedCommands$7(value) {
	const commands = denseArray$7(value, MAX_COMMANDS$7, "death spawn commands").map((entry, sequence) => {
		const label = `death spawn command ${sequence}`;
		const command = exactRecord$7(entry, COMMAND_KEYS$4, label);
		if (!CAUSES$2.has(command.cause)) throw new TypeError(`${label}.cause is invalid`);
		return {
			amount: integer$6(command.amount, 0, Number.MAX_SAFE_INTEGER, `${label}.amount`),
			cause: command.cause,
			sequence,
			sourceId: command.sourceId === null ? null : integer$6(command.sourceId, 1, Number.MAX_SAFE_INTEGER, `${label}.sourceId`),
			targetId: integer$6(command.targetId, 1, Number.MAX_SAFE_INTEGER, `${label}.targetId`),
			tick: integer$6(command.tick, 0, 511, `${label}.tick`)
		};
	}).sort((left, right) => left.tick - right.tick || left.sequence - right.sequence).map(({ sequence: _sequence, ...command }) => command);
	const signatures = /* @__PURE__ */ new Set();
	for (const command of commands) {
		const signature = canonicalJson$8(command);
		if (signatures.has(signature)) throw new TypeError("death spawn commands must not contain duplicates");
		signatures.add(signature);
	}
	return commands;
}
function checkedSetup$7(value) {
	const setup = exactRecord$7(value, SETUP_KEYS$3, "death spawn setup");
	const tracker = {
		count: 0,
		seen: /* @__PURE__ */ new Set()
	};
	const entities = denseArray$7(setup.entities, MAX_ENTITIES$2, "death spawn entities", 1).map((entry, index) => checkedEntity$2(entry, index, tracker)).sort((left, right) => left.id - right.id);
	for (let index = 1; index < entities.length; index += 1) if (entities[index - 1].id === entities[index].id) throw new TypeError("death spawn entities must have unique IDs");
	if (entities.some(({ id }) => id <= MAX_ENTITIES$2)) throw new TypeError(`death spawn setup source IDs must exceed child namespace ${MAX_ENTITIES$2}`);
	return {
		commands: checkedCommands$7(setup.commands),
		entities
	};
}
function questionRecord$4(key, value) {
	return deepFreeze$7({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		key,
		source: SOURCE$5,
		value: clone$8(value)
	});
}
function runtimeEntity(spec, bornTick = 0) {
	return {
		alive: true,
		anchor: clone$8(spec.anchor),
		archetypeId: spec.archetypeId,
		bornTick,
		children: clone$8(spec.children),
		health: spec.health,
		id: spec.id,
		ownerId: spec.ownerId,
		periodic: clone$8(spec.periodic),
		periodicBatchCount: 0,
		sourceId: spec.sourceId
	};
}
function initialState$4(setup) {
	return {
		batchCount: 0,
		commandIndex: 0,
		entities: setup.entities.map((entity) => runtimeEntity(entity)),
		history: [],
		latches: [],
		tick: 0
	};
}
function childBatch(source, children) {
	return {
		anchor: clone$8(source.anchor),
		children: children.map(({ archetypeId, radius, role }) => ({
			archetypeId,
			radius,
			role
		})),
		ownerId: source.ownerId,
		sourceId: source.id
	};
}
function appendEvents(state, events) {
	if (state.history.length + events.length > MAX_EVENTS$6) throw new RangeError(`death spawn event bound ${MAX_EVENTS$6} exceeded`);
	state.history.push(...clone$8(events));
}
function materialize(state, materializer, source, children, kind, tick, events) {
	if (children.length === 0) return;
	if (state.entities.length + children.length > MAX_ENTITIES$2) throw new RangeError(`death spawn entity bound ${MAX_ENTITIES$2} exceeded`);
	const spawned = materializer.materialize(childBatch(source, children));
	const batchIndex = state.batchCount;
	state.batchCount += 1;
	events.push({
		anchor: clone$8(source.anchor),
		batchIndex,
		childIds: spawned.map(({ id }) => id),
		kind,
		ownerId: source.ownerId,
		sourceId: source.id,
		tick,
		type: "spawn-batch"
	});
	for (let index = 0; index < spawned.length; index += 1) {
		const placed = spawned[index];
		const spec = children[index];
		state.entities.push({
			alive: true,
			anchor: clone$8(placed.data.position),
			archetypeId: spec.archetypeId,
			bornTick: tick,
			children: clone$8(spec.children),
			health: spec.health,
			id: placed.id,
			ownerId: source.ownerId,
			periodic: clone$8(spec.periodic),
			periodicBatchCount: 0,
			sourceId: source.id
		});
	}
	state.entities.sort((left, right) => left.id - right.id);
}
function kill(entity, cause, sourceId, tick, events, queue) {
	if (!entity.alive) return;
	entity.alive = false;
	entity.health = 0;
	events.push({
		cause,
		sourceId,
		targetId: entity.id,
		tick,
		type: "death"
	});
	events.push({
		sourceId: entity.id,
		tick,
		type: "source-despawn"
	});
	if (cause === "combat-damage") queue.push(entity.id);
}
function applyCommands$2(state, commands, tick, events, queue) {
	const pendingDeaths = /* @__PURE__ */ new Map();
	const virtualHealth = new Map(state.entities.map((entity) => [entity.id, entity.alive ? entity.health : 0]));
	while (state.commandIndex < commands.length && commands[state.commandIndex].tick === tick) {
		const command = commands[state.commandIndex];
		state.commandIndex += 1;
		const target = state.entities.find(({ id }) => id === command.targetId);
		const before = virtualHealth.get(command.targetId) ?? 0;
		const applied = before > 0 ? Math.min(before, command.amount) : 0;
		const after = before - applied;
		events.push({
			amount: command.amount,
			applied,
			cause: command.cause,
			healthAfter: after,
			healthBefore: before,
			sourceId: command.sourceId,
			targetId: command.targetId,
			tick,
			type: "damage"
		});
		if (target?.alive) {
			virtualHealth.set(command.targetId, after);
			target.health = after;
		}
		if (target?.alive && before > 0 && after === 0 && !pendingDeaths.has(target.id)) pendingDeaths.set(target.id, {
			cause: command.cause,
			sourceId: command.sourceId,
			target
		});
	}
	for (const { cause, sourceId, target } of [...pendingDeaths.values()].sort((left, right) => left.target.id - right.target.id)) kill(target, cause, sourceId, tick, events, queue);
}
function drainDeaths(state, materializer, tick, events, queue) {
	queue.sort((left, right) => left - right);
	while (queue.length > 0) {
		const sourceId = queue.shift();
		if (state.latches.includes(sourceId)) continue;
		if (state.latches.length >= MAX_TRIGGERS) throw new RangeError(`death spawn recursion bound ${MAX_TRIGGERS} exceeded`);
		const source = state.entities.find(({ id }) => id === sourceId);
		if (source === void 0 || source.alive) continue;
		state.latches.push(sourceId);
		events.push({
			sourceId,
			tick,
			type: "death-triggered"
		});
		materialize(state, materializer, source, source.children, "death", tick, events);
	}
}
function resolveExpiry(state, tick, events) {
	for (const source of state.entities) if (source.alive && source.periodic !== null && tick === source.bornTick + source.periodic.lifetimeTicks) {
		source.alive = false;
		source.health = 0;
		events.push({
			cause: "expiry",
			sourceId: null,
			targetId: source.id,
			tick,
			type: "death"
		});
		events.push({
			sourceId: source.id,
			tick,
			type: "source-despawn"
		});
	}
}
function resolvePeriodic(state, materializer, tick, events) {
	for (const source of [...state.entities].sort((a, b) => a.id - b.id)) {
		if (!source.alive || source.periodic === null) continue;
		if (tick === source.bornTick + source.periodic.initialDelayTicks + source.periodicBatchCount * source.periodic.cadenceTicks) {
			materialize(state, materializer, source, source.periodic.children, "periodic", tick, events);
			source.periodicBatchCount += 1;
		}
	}
}
function advance$3(state, setup, materializer) {
	if (state.tick >= MAX_TICK$8) return [];
	const tick = state.tick;
	const events = [];
	const queue = [];
	resolveExpiry(state, tick, events);
	applyCommands$2(state, setup.commands, tick, events, queue);
	drainDeaths(state, materializer, tick, events, queue);
	resolvePeriodic(state, materializer, tick, events);
	appendEvents(state, events);
	state.tick += 1;
	return events;
}
function replay$1(setup, ticks) {
	const state = initialState$4(setup);
	const materializer = new SpawnBatchMaterializer();
	for (let index = 0; index < ticks; index += 1) advance$3(state, setup, materializer);
	return {
		materializer,
		state
	};
}
function checkedState(value) {
	const state = exactRecord$7(value, STATE_KEYS$1, "death spawn snapshot.state");
	integer$6(state.tick, 0, MAX_TICK$8, "death spawn snapshot.state.tick");
	integer$6(state.commandIndex, 0, MAX_COMMANDS$7, "death spawn snapshot.state.commandIndex");
	integer$6(state.batchCount, 0, 1024, "death spawn snapshot.state.batchCount");
	denseArray$7(state.entities, MAX_ENTITIES$2, "death spawn snapshot.state.entities", 1).forEach((entry, index) => {
		exactRecord$7(entry, RUNTIME_ENTITY_KEYS, `death spawn snapshot.state.entities[${index}]`);
	});
	denseArray$7(state.history, MAX_EVENTS$6, "death spawn snapshot.state.history");
	const latches = denseArray$7(state.latches, MAX_TRIGGERS, "death spawn snapshot.state.latches");
	for (let index = 0; index < latches.length; index += 1) {
		integer$6(latches[index], 1, Number.MAX_SAFE_INTEGER, `death spawn snapshot.state.latches[${index}]`);
		if (index > 0 && latches.slice(0, index).includes(latches[index])) throw new TypeError("death spawn snapshot latches must be unique");
	}
	return clone$8(state);
}
function causal(setup, stateValue, placementSnapshotBytes) {
	const checked = checkedState(stateValue);
	if (typeof placementSnapshotBytes !== "string") throw new TypeError("death spawn nested placement snapshot must be a string");
	const nested = SpawnBatchMaterializer.restore(placementSnapshotBytes);
	const expected = replay$1(setup, checked.tick);
	if (canonicalJson$8(checked) !== canonicalJson$8(expected.state) || nested.serialize() !== expected.materializer.serialize()) throw new TypeError("death spawn snapshot state, graph, history, latches, or placement is forged");
	return {
		materializer: nested,
		state: checked
	};
}
function createDeathSpawnQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("death spawn questions do not accept overrides");
	return deepFreeze$7(Object.fromEntries(Object.entries(QUESTION_VALUES$7).map(([key, value]) => [key, questionRecord$4(key, value)])));
}
function createDeathSpawnFixture(entities = DEFAULT_SETUP$1.entities, commands = DEFAULT_SETUP$1.commands, ...extra) {
	if (extra.length !== 0) throw new TypeError("death spawn fixture received extra arguments");
	return clone$8(checkedSetup$7({
		commands,
		entities
	}));
}
var SOURCE$5, FIXTURE$5, MAX_COMMANDS$7, MAX_ENTITIES$2, MAX_EVENTS$6, MAX_GRAPH_NODES$1, MAX_SNAPSHOT_BYTES$8, MAX_STEP_CHUNK$6, MAX_TICK$8, MAX_TRIGGERS, COMMAND_KEYS$4, SETUP_KEYS$3, ENTITY_KEYS$2, CHILD_KEYS$2, PERIODIC_KEYS$1, SNAPSHOT_KEYS$2, IDENTITY_KEYS$1, STATE_KEYS$1, RUNTIME_ENTITY_KEYS, CAUSES$2, DEATH_SPAWN_IDENTITY, DEFAULT_SETUP$1, QUESTION_VALUES$7, DeathSpawnEncounter;
function init_death_spawns() {
	return (init_death_spawns = __esmMin((() => {
		init_spawn_placement();
		SOURCE$5 = "unsourced-death-spawn-graph-policy-fixture";
		FIXTURE$5 = "ashen-nest-death-spawn-question-v1";
		MAX_COMMANDS$7 = 128;
		MAX_ENTITIES$2 = 64;
		MAX_EVENTS$6 = 4096;
		MAX_GRAPH_NODES$1 = 64;
		MAX_SNAPSHOT_BYTES$8 = 524288;
		MAX_STEP_CHUNK$6 = 512;
		MAX_TICK$8 = 512;
		MAX_TRIGGERS = 64;
		COMMAND_KEYS$4 = [
			"amount",
			"cause",
			"sourceId",
			"targetId",
			"tick"
		];
		SETUP_KEYS$3 = ["commands", "entities"];
		ENTITY_KEYS$2 = [
			"anchor",
			"archetypeId",
			"children",
			"health",
			"id",
			"ownerId",
			"periodic",
			"sourceId"
		];
		CHILD_KEYS$2 = [
			"archetypeId",
			"children",
			"health",
			"periodic",
			"radius",
			"role"
		];
		PERIODIC_KEYS$1 = [
			"cadenceTicks",
			"children",
			"initialDelayTicks",
			"lifetimeTicks"
		];
		SNAPSHOT_KEYS$2 = [
			"identity",
			"placementSnapshotBytes",
			"state",
			"version"
		];
		IDENTITY_KEYS$1 = ["fixture", "setup"];
		STATE_KEYS$1 = [
			"batchCount",
			"commandIndex",
			"entities",
			"history",
			"latches",
			"tick"
		];
		RUNTIME_ENTITY_KEYS = [
			"alive",
			"anchor",
			"archetypeId",
			"bornTick",
			"children",
			"health",
			"id",
			"ownerId",
			"periodic",
			"periodicBatchCount",
			"sourceId"
		];
		CAUSES$2 = /* @__PURE__ */ new Set([
			"combat-damage",
			"despawn",
			"expiry"
		]);
		DEATH_SPAWN_IDENTITY = deepFreeze$7({
			displayName: "Ashen Nest",
			id: "ashen-nest"
		});
		DEFAULT_SETUP$1 = deepFreeze$7({
			commands: [{
				amount: 120,
				cause: "combat-damage",
				sourceId: 900,
				targetId: 101,
				tick: 3
			}],
			entities: [{
				anchor: {
					x: -600,
					y: 1400
				},
				archetypeId: "ashen-nest",
				children: [{
					archetypeId: "coal-mite",
					children: [],
					health: 30,
					periodic: null,
					radius: 90,
					role: "primary"
				}, {
					archetypeId: "coal-mite",
					children: [],
					health: 30,
					periodic: null,
					radius: 90,
					role: "secondary"
				}],
				health: 120,
				id: 101,
				ownerId: 7,
				periodic: {
					cadenceTicks: 4,
					children: [{
						archetypeId: "soot-sprite",
						children: [],
						health: 20,
						periodic: null,
						radius: 60,
						role: "primary"
					}],
					initialDelayTicks: 3,
					lifetimeTicks: 11
				},
				sourceId: 101
			}]
		});
		QUESTION_VALUES$7 = deepFreeze$7({
			shippedIdentity: "ashen-nest-is-an-original-runtime-identity",
			benchmarkMapping: "historical-comparison-identities-exist-in-tests-only",
			parentHealth: 120,
			parentAnchor: {
				x: -600,
				y: 1400
			},
			deathSpawnGraph: "each-source-carries-a-finite-recursive-child-specification",
			deathChildCount: 2,
			deathChildSpecifications: "two-ordered-coal-mite-specifications-in-the-default-fixture",
			eligibleLethalCauses: ["combat-damage"],
			exactlyOnceLatch: "one-per-source-entity-id",
			sourceRemovalOrder: "death-then-source-despawn-then-death-triggered-then-child-batch",
			simultaneousParentOrder: "ascending-source-entity-id",
			periodicBoundaryOrder: "expiry-then-command-and-death-fifo-then-living-periodic-due-batches",
			periodicInitialDelayTicks: 3,
			periodicCadenceTicks: 4,
			periodicLifetimeTicks: 11,
			priorPeriodicChildSurvival: "materialized-periodic-children-survive-their-source-death",
			futurePeriodicCancellation: "source-death-cancels-the-same-boundary-and-all-future-due-batches",
			recursionPolicy: "later-child-deaths-append-eligible-sources-to-one-fifo-by-death-id",
			recursionBound: MAX_TRIGGERS,
			eventBound: MAX_EVENTS$6,
			entityBound: MAX_ENTITIES$2,
			graphBound: MAX_GRAPH_NODES$1,
			initialIdNamespace: "setup-source-ids-exceed-the-maximum-runtime-child-entity-count",
			ownerAttribution: "children-inherit-the-dead-source-owner-id",
			sourceAttribution: "each-batch-uses-the-immediate-dead-source-entity-id",
			childOrder: "source-child-array-order-is-materializer-formation-and-id-order",
			idPolicy: "placement-materializer-monotonic-ids",
			anchorPolicy: "children-use-the-immediate-source-death-anchor",
			commandOrder: "tick-then-input-sequence-before-due-periodic-batches",
			zeroDamagePolicy: "zero-never-kills-or-contributes-a-lethal-cause",
			overkillPolicy: "first-positive-request-reaching-zero-owns-cause-and-later-requests-no-op",
			alreadyDeadPolicy: "later-commands-targeting-dead-entities-are-no-ops",
			snapshotPolicy: "canonical-state-history-latches-graphs-and-placement-must-equal-replay"
		});
		DeathSpawnEncounter = class DeathSpawnEncounter {
			#materializer;
			#setup;
			#state;
			constructor(setup = createDeathSpawnFixture()) {
				this.#setup = checkedSetup$7(setup);
				this.#materializer = new SpawnBatchMaterializer();
				this.#state = initialState$4(this.#setup);
			}
			get children() {
				return this.#materializer.list();
			}
			get replay() {
				return clone$8(this.#state.history);
			}
			get state() {
				return clone$8(this.#state);
			}
			step() {
				return this.stepMany(1);
			}
			stepMany(count) {
				integer$6(count, 0, MAX_STEP_CHUNK$6, "death spawn step count");
				if (count > MAX_TICK$8 - this.#state.tick) throw new RangeError("death spawn step count exceeds encounter bound");
				const candidate = causal(this.#setup, this.#state, this.#materializer.serialize());
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...advance$3(candidate.state, this.#setup, candidate.materializer));
				const candidateBytes = canonicalJson$8({
					identity: {
						fixture: FIXTURE$5,
						setup: this.#setup
					},
					placementSnapshotBytes: candidate.materializer.serialize(),
					state: candidate.state,
					version: 1
				});
				if (Buffer.byteLength(candidateBytes, "utf8") > MAX_SNAPSHOT_BYTES$8) throw new RangeError("death spawn step would exceed snapshot byte bound");
				this.#state = candidate.state;
				this.#materializer = candidate.materializer;
				return clone$8(events);
			}
			run() {
				return this.stepMany(MAX_TICK$8 - this.#state.tick);
			}
			serialize() {
				const placementSnapshotBytes = this.#materializer.serialize();
				const checked = causal(this.#setup, this.#state, placementSnapshotBytes);
				const serialized = canonicalJson$8({
					identity: {
						fixture: FIXTURE$5,
						setup: this.#setup
					},
					placementSnapshotBytes: checked.materializer.serialize(),
					state: checked.state,
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$8) throw new RangeError("death spawn snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("death spawn snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$8) throw new RangeError("death spawn snapshot exceeds its byte bound");
				let raw;
				try {
					raw = JSON.parse(serialized);
				} catch {
					throw new TypeError("death spawn snapshot must be valid JSON");
				}
				if (canonicalJson$8(raw) !== serialized) throw new TypeError("death spawn snapshot must use canonical bytes");
				const snapshot = exactRecord$7(raw, SNAPSHOT_KEYS$2, "death spawn snapshot");
				if (snapshot.version !== 1) throw new TypeError("death spawn snapshot version is unsupported");
				const identity = exactRecord$7(snapshot.identity, IDENTITY_KEYS$1, "death spawn snapshot.identity");
				if (identity.fixture !== FIXTURE$5) throw new TypeError("death spawn snapshot fixture identity is invalid");
				const setup = checkedSetup$7(identity.setup);
				const checked = causal(setup, snapshot.state, snapshot.placementSnapshotBytes);
				const encounter = new DeathSpawnEncounter(setup);
				encounter.#state = checked.state;
				encounter.#materializer = checked.materializer;
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/death-conversion-delegated.js
function clone$7(value) {
	return structuredClone(value);
}
function canonicalJson$7(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$7).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$7(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function integer$5(value, minimum, maximum, label) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
	return value;
}
function ordinaryMeta(source) {
	return source.spec.ordinaryChildren.map((spec, index) => ({
		initial: false,
		key: `${source.key}/ordinary/${index}`,
		ownerId: source.ownerId,
		provenance: null,
		spec
	}));
}
function periodicMeta(source) {
	if (source.spec.periodic === null) return [];
	return source.spec.periodic.children.map((spec, index) => ({
		initial: false,
		key: `${source.key}/periodic/${index}`,
		ownerId: source.ownerId,
		provenance: null,
		spec
	}));
}
function conversionMeta(source, plans) {
	const plan = plans.get(source.key);
	if (plan === void 0) return [];
	return plan.children.map((spec, index) => ({
		initial: false,
		key: `${source.key}/conversion/${index}`,
		ownerId: plan.ownerId,
		provenance: {
			converterId: plan.converterId,
			fromOwnerId: source.ownerId,
			sourceId: null,
			toOwnerId: plan.ownerId
		},
		spec
	}));
}
function deathMeta(source, plans) {
	return [...ordinaryMeta(source), ...conversionMeta(source, plans)];
}
function spawnedMeta(event, source, plans) {
	if (event.kind === "periodic") return periodicMeta(source);
	if (event.kind === "death") return deathMeta(source, plans);
	throw new TypeError("shared death spawn emitted an unknown batch kind");
}
function sharedPeriodic(meta, plans) {
	if (meta.spec.periodic === null) return null;
	return {
		cadenceTicks: meta.spec.periodic.cadenceTicks,
		children: periodicMeta(meta).map((child) => sharedChild(child, plans)),
		initialDelayTicks: meta.spec.periodic.initialDelayTicks,
		lifetimeTicks: meta.spec.periodic.lifetimeTicks
	};
}
function sharedChild(meta, plans) {
	return {
		archetypeId: meta.spec.archetypeId,
		children: deathMeta(meta, plans).map((child) => sharedChild(child, plans)),
		health: meta.spec.health,
		periodic: sharedPeriodic(meta, plans),
		radius: meta.spec.radius,
		role: meta.spec.role
	};
}
function sharedSetup(setup, plans) {
	return createDeathSpawnFixture(setup.entities.map((spec) => {
		const meta = {
			initial: true,
			key: `entity/${spec.id}`,
			ownerId: spec.ownerId,
			provenance: null,
			spec
		};
		return {
			anchor: clone$7(spec.anchor),
			archetypeId: spec.archetypeId,
			children: deathMeta(meta, plans).map((child) => sharedChild(child, plans)),
			health: spec.health,
			id: spec.id,
			ownerId: spec.ownerId,
			periodic: sharedPeriodic(meta, plans),
			sourceId: spec.id
		};
	}), setup.commands.filter(({ kind }) => kind === "damage").map((command) => ({
		amount: command.amount,
		cause: command.cause,
		sourceId: command.sourceId,
		targetId: command.targetId,
		tick: command.tick
	})));
}
function initialMetadata(setup) {
	return new Map(setup.entities.map((spec) => [spec.id, {
		initial: true,
		key: `entity/${spec.id}`,
		ownerId: spec.ownerId,
		provenance: null,
		spec
	}]));
}
function mapSharedSpawn(event, metadata, plans) {
	const source = metadata.get(event.sourceId);
	if (source === void 0) throw new TypeError("shared death spawn emitted an unknown source");
	const children = spawnedMeta(event, source, plans);
	if (children.length !== event.childIds.length) throw new TypeError("shared death spawn child metadata diverged");
	event.childIds.forEach((id, index) => {
		const meta = clone$7(children[index]);
		if (meta.provenance !== null) meta.provenance.sourceId = event.sourceId;
		metadata.set(id, meta);
	});
	return children;
}
function livingById(state) {
	return new Map(state.entities.map((entity) => [entity.id, entity.alive]));
}
function activeCurse(curses, targetId) {
	return curses.find((curse) => curse.targetId === targetId) ?? null;
}
function applyCurse(curses, command, alive, metadata, tick) {
	const source = metadata.get(command.sourceId);
	const target = metadata.get(command.targetId);
	if (source === void 0 || target === void 0 || alive.get(command.sourceId) !== true || alive.get(command.targetId) !== true || !target.spec.eligible) return {
		accepted: false,
		event: {
			accepted: false,
			expiryTick: null,
			ownerId: source?.ownerId ?? null,
			sourceId: command.sourceId,
			targetId: command.targetId,
			tick,
			type: "curse-applied"
		}
	};
	const proposed = {
		appliedTick: tick,
		expiryTick: tick + command.durationTicks,
		ownerId: source.ownerId,
		sourceId: command.sourceId,
		targetId: command.targetId
	};
	const index = curses.findIndex(({ targetId }) => targetId === command.targetId);
	const existing = index === -1 ? null : curses[index];
	let accepted = false;
	let winner = existing;
	if (existing === null) {
		accepted = true;
		winner = proposed;
	} else if (existing.sourceId === proposed.sourceId) {
		if (proposed.expiryTick > existing.expiryTick) {
			accepted = true;
			winner = {
				...proposed,
				appliedTick: Math.max(existing.appliedTick, proposed.appliedTick)
			};
		}
	} else if (proposed.appliedTick > existing.appliedTick || proposed.appliedTick === existing.appliedTick && proposed.sourceId > existing.sourceId) {
		accepted = true;
		winner = proposed;
	}
	if (index === -1) curses.push(winner);
	else curses[index] = winner;
	curses.sort((left, right) => left.targetId - right.targetId);
	return {
		accepted,
		event: {
			accepted,
			expiryTick: winner.expiryTick,
			ownerId: winner.ownerId,
			sourceId: command.sourceId,
			targetId: command.targetId,
			tick,
			type: "curse-applied"
		}
	};
}
function expireCurses(curses, tick, events = null) {
	const expired = curses.filter(({ expiryTick }) => expiryTick === tick).sort((left, right) => left.targetId - right.targetId);
	if (events !== null) for (const curse of expired) events.push({
		sourceId: curse.sourceId,
		targetId: curse.targetId,
		tick,
		type: "curse-expired"
	});
	if (expired.length > 0) {
		const ids = new Set(expired.map(({ targetId }) => targetId));
		curses.splice(0, curses.length, ...curses.filter(({ targetId }) => !ids.has(targetId)));
	}
}
function observePlans(setup, plans) {
	const shared = new DeathSpawnEncounter(sharedSetup(setup, plans));
	const metadata = initialMetadata(setup);
	const curses = [];
	const observed = /* @__PURE__ */ new Map();
	const alive = new Map(setup.entities.map(({ id }) => [id, true]));
	const allEvents = shared.run();
	for (let tick = 0; tick < MAX_TICK$7; tick += 1) {
		for (const command of setup.commands) {
			if (command.tick !== tick || command.kind !== "curse") continue;
			applyCurse(curses, command, alive, metadata, tick);
		}
		const events = allEvents.filter((event) => event.tick === tick);
		for (const event of events) {
			if (event.type !== "death" || event.cause !== "combat-damage") continue;
			const target = metadata.get(event.targetId);
			const curse = activeCurse(curses, event.targetId);
			const converter = curse === null ? void 0 : metadata.get(curse.sourceId);
			if (target !== void 0 && target.spec.eligible && curse !== null && converter !== void 0 && converter.spec.replacementChildren.length > 0) observed.set(target.key, {
				children: clone$7(converter.spec.replacementChildren),
				converterId: curse.sourceId,
				ownerId: curse.ownerId
			});
		}
		for (const event of events) if (event.type === "spawn-batch") {
			mapSharedSpawn(event, metadata, plans);
			for (const id of event.childIds) alive.set(id, true);
		}
		const dead = new Set(events.filter(({ type }) => type === "death").map(({ targetId }) => targetId));
		for (const id of dead) alive.set(id, false);
		if (dead.size > 0) curses.splice(0, curses.length, ...curses.filter(({ targetId }) => !dead.has(targetId)));
		expireCurses(curses, tick);
	}
	return observed;
}
function planBytes(plans) {
	return canonicalJson$7([...plans].sort(([left], [right]) => left.localeCompare(right)));
}
function compilePlans(setup) {
	let plans = /* @__PURE__ */ new Map();
	for (let round = 0; round <= 64; round += 1) {
		const observed = observePlans(setup, plans);
		if (planBytes(observed) === planBytes(plans)) return plans;
		plans = observed;
	}
	throw new RangeError("death conversion delegation did not converge");
}
function publicEntity(entity, meta) {
	return {
		alive: entity.alive,
		anchor: clone$7(entity.anchor),
		archetypeId: entity.archetypeId,
		bornTick: entity.bornTick,
		eligible: meta.spec.eligible,
		health: entity.health,
		id: entity.id,
		ordinaryChildren: clone$7(meta.spec.ordinaryChildren),
		ownerId: meta.ownerId,
		periodic: clone$7(meta.spec.periodic),
		periodicBatchCount: entity.periodicBatchCount,
		replacementChildren: clone$7(meta.spec.replacementChildren),
		sourceId: meta.initial ? null : entity.sourceId
	};
}
function makeState(sharedState, metadata, values) {
	return {
		batchCount: sharedState.batchCount,
		commandIndex: values.commandIndex,
		curses: clone$7(values.curses),
		entities: sharedState.entities.map((entity) => {
			const meta = metadata.get(entity.id);
			if (meta === void 0) throw new TypeError("shared death state emitted an unknown entity");
			return publicEntity(entity, meta);
		}),
		history: clone$7(values.history),
		latches: clone$7(values.latches),
		tick: sharedState.tick
	};
}
function publicChildren(sharedChildren, metadata) {
	return sharedChildren.map((child) => {
		const meta = metadata.get(child.id);
		if (meta === void 0) throw new TypeError("shared placement emitted an unknown child");
		const projected = clone$7(child);
		projected.data.ownerId = meta.ownerId;
		return projected;
	});
}
function publicSpawn(event, metadata) {
	const overlays = event.childIds.flatMap((childId) => {
		const meta = metadata.get(childId);
		if (meta === void 0) throw new TypeError("shared batch emitted an unknown child");
		if (meta.provenance === null) return [];
		return [{
			childId,
			converterId: meta.provenance.converterId,
			fromOwnerId: meta.provenance.fromOwnerId,
			sourceId: meta.provenance.sourceId,
			toOwnerId: meta.provenance.toOwnerId
		}];
	});
	return {
		...clone$7(event),
		ownershipOverlays: overlays
	};
}
function snapshot(setup, shared, state) {
	return canonicalJson$7({
		identity: {
			fixture: FIXTURE$4,
			setup
		},
		placementSnapshotBytes: JSON.parse(shared.serialize()).placementSnapshotBytes,
		state,
		version: 1
	});
}
function restoreDelegatedEncounter(serialized, checkedSetup, EncounterClass) {
	if (typeof serialized !== "string") throw new TypeError("death conversion snapshot must be a string");
	if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$7) throw new RangeError("death conversion snapshot exceeds its byte bound");
	let raw;
	try {
		raw = JSON.parse(serialized);
	} catch {
		throw new TypeError("death conversion snapshot must be valid JSON");
	}
	if (canonicalJson$7(raw) !== serialized) throw new TypeError("death conversion snapshot must use canonical bytes");
	if (raw === null || typeof raw !== "object" || Array.isArray(raw) || canonicalJson$7(Object.keys(raw).sort()) !== canonicalJson$7([
		"identity",
		"placementSnapshotBytes",
		"state",
		"version"
	])) throw new TypeError("death conversion snapshot has an invalid shape");
	if (raw.version !== 1 || raw.identity === null || typeof raw.identity !== "object" || Array.isArray(raw.identity) || canonicalJson$7(Object.keys(raw.identity).sort()) !== canonicalJson$7(["fixture", "setup"]) || raw.identity.fixture !== FIXTURE$4) throw new TypeError("death conversion snapshot identity is invalid");
	const setup = checkedSetup(raw.identity.setup);
	const tick = integer$5(raw.state?.tick, 0, MAX_TICK$7, "death conversion snapshot tick");
	const encounter = new EncounterClass(setup);
	encounter.stepMany(tick);
	if (encounter.serialize() !== serialized) throw new TypeError("death conversion snapshot shared lifecycle, winner, expiry, latches, ownership, history, graph, or placement is forged");
	return encounter;
}
var FIXTURE$4, MAX_EVENTS$5, MAX_SNAPSHOT_BYTES$7, MAX_STEP_CHUNK$5, MAX_TICK$7, MAX_CONVERSIONS$1, DelegatedDeathConversionEncounter;
function init_death_conversion_delegated() {
	return (init_death_conversion_delegated = __esmMin((() => {
		init_death_spawns();
		FIXTURE$4 = "gloam-mark-death-conversion-question-v1";
		MAX_EVENTS$5 = 4096;
		MAX_SNAPSHOT_BYTES$7 = 524288;
		MAX_STEP_CHUNK$5 = 256;
		MAX_TICK$7 = 256;
		MAX_CONVERSIONS$1 = 16;
		DelegatedDeathConversionEncounter = class {
			#metadata;
			#plans;
			#setup;
			#shared;
			#values;
			constructor(setup) {
				this.#setup = clone$7(setup);
				this.#plans = compilePlans(this.#setup);
				this.#shared = new DeathSpawnEncounter(sharedSetup(this.#setup, this.#plans));
				this.#metadata = initialMetadata(this.#setup);
				this.#values = {
					commandIndex: 0,
					curses: [],
					history: [],
					latches: []
				};
			}
			get children() {
				return publicChildren(this.#shared.children, this.#metadata);
			}
			get replay() {
				return clone$7(this.#values.history);
			}
			get state() {
				return clone$7(makeState(this.#shared.state, this.#metadata, this.#values));
			}
			get sharedChildren() {
				return this.#shared.children;
			}
			get sharedReplay() {
				return this.#shared.replay;
			}
			get sharedState() {
				return this.#shared.state;
			}
			get deathSpawnSnapshotBytes() {
				return this.#shared.serialize();
			}
			step() {
				return this.stepMany(1);
			}
			stepMany(count) {
				integer$5(count, 0, MAX_STEP_CHUNK$5, "death conversion step count");
				const start = this.#shared.state.tick;
				const target = start + count;
				if (target > MAX_TICK$7) throw new RangeError("death conversion step count exceeds encounter bound");
				const candidate = {
					metadata: new Map([...this.#metadata].map(([id, meta]) => [id, clone$7(meta)])),
					shared: DeathSpawnEncounter.restore(this.#shared.serialize()),
					values: clone$7(this.#values)
				};
				const alive = livingById(candidate.shared.state);
				const sharedEvents = candidate.shared.stepMany(count);
				const returned = [];
				for (let tick = start; tick < target; tick += 1) {
					const events = [];
					const canonical = sharedEvents.filter((event) => event.tick === tick);
					const damages = canonical.filter(({ type }) => type === "damage");
					let damageIndex = 0;
					for (const command of this.#setup.commands) {
						if (command.tick !== tick) continue;
						candidate.values.commandIndex += 1;
						if (command.kind === "curse") events.push(applyCurse(candidate.values.curses, command, alive, candidate.metadata, tick).event);
						else {
							const damage = damages[damageIndex];
							damageIndex += 1;
							if (damage === void 0) throw new TypeError("shared death executor omitted canonical damage");
							events.push(clone$7(damage));
						}
					}
					const deaths = /* @__PURE__ */ new Set();
					for (const event of canonical) {
						if (event.type === "damage") continue;
						if (event.type === "death") {
							deaths.add(event.targetId);
							events.push(clone$7(event));
							continue;
						}
						if (event.type === "source-despawn") {
							events.push(clone$7(event));
							continue;
						}
						if (event.type === "death-triggered") {
							const source = candidate.metadata.get(event.sourceId);
							if (source === void 0) throw new TypeError("shared death trigger has no conversion metadata");
							const plan = this.#plans.get(source.key);
							if (plan !== void 0) {
								if (candidate.values.latches.length >= MAX_CONVERSIONS$1) throw new RangeError(`death conversion recursion bound ${MAX_CONVERSIONS$1} exceeded`);
								candidate.values.latches.push(event.sourceId);
								events.push({
									converterId: plan.converterId,
									ownerId: plan.ownerId,
									sourceId: event.sourceId,
									tick,
									type: "conversion-triggered"
								});
							}
							continue;
						}
						if (event.type === "spawn-batch") {
							mapSharedSpawn(event, candidate.metadata, this.#plans);
							for (const id of event.childIds) alive.set(id, true);
							events.push(publicSpawn(event, candidate.metadata));
							continue;
						}
						events.push(clone$7(event));
					}
					for (const id of deaths) alive.set(id, false);
					if (deaths.size > 0) candidate.values.curses.splice(0, candidate.values.curses.length, ...candidate.values.curses.filter(({ targetId }) => !deaths.has(targetId)));
					expireCurses(candidate.values.curses, tick, events);
					if (candidate.values.history.length + events.length > MAX_EVENTS$5) throw new RangeError(`death conversion event bound ${MAX_EVENTS$5} exceeded`);
					candidate.values.history.push(...clone$7(events));
					returned.push(...events);
				}
				const bytes = snapshot(this.#setup, candidate.shared, makeState(candidate.shared.state, candidate.metadata, candidate.values));
				if (Buffer.byteLength(bytes, "utf8") > MAX_SNAPSHOT_BYTES$7) throw new RangeError("death conversion step exceeds snapshot byte bound");
				this.#metadata = candidate.metadata;
				this.#shared = candidate.shared;
				this.#values = candidate.values;
				return clone$7(returned);
			}
			run() {
				return this.stepMany(MAX_TICK$7 - this.#shared.state.tick);
			}
			serialize() {
				const serialized = snapshot(this.#setup, this.#shared, makeState(this.#shared.state, this.#metadata, this.#values));
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$7) throw new RangeError("death conversion snapshot exceeds its byte bound");
				return serialized;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/death-conversion.js
function deepFreeze$6(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze$6(child);
		Object.freeze(value);
	}
	return value;
}
function clone$6(value) {
	return structuredClone(value);
}
function canonicalJson$6(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$6).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$6(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord$6(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain string-keyed object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$6(value, maximum, label, minimum = 0) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < minimum || value.length > maximum || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain only dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function integer$4(value, minimum, maximum, label) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
	return value;
}
function text(value, label) {
	let count = 0;
	if (typeof value === "string" && value.isWellFormed()) for (const _point of value) {
		count += 1;
		if (count > 128) break;
	}
	if (count < 1 || count > 128) throw new TypeError(`${label} must be 1 to 128 Unicode code points`);
	return value;
}
function checkedAnchor$1(value, label) {
	const anchor = exactRecord$6(value, ["x", "y"], label);
	return {
		x: integer$4(anchor.x, -1e6, 1e6, `${label}.x`),
		y: integer$4(anchor.y, -1e6, 1e6, `${label}.y`)
	};
}
function checkedChildren(value, tracker, label) {
	return denseArray$6(value, 15, label).map((entry, index) => checkedChild(entry, tracker, `${label}[${index}]`));
}
function checkedPeriodic(value, tracker, label) {
	if (value === null) return null;
	const periodic = exactRecord$6(value, PERIODIC_KEYS, label);
	return {
		cadenceTicks: integer$4(periodic.cadenceTicks, 1, MAX_TICK$6, `${label}.cadenceTicks`),
		children: checkedChildren(periodic.children, tracker, `${label}.children`),
		initialDelayTicks: integer$4(periodic.initialDelayTicks, 1, 255, `${label}.initialDelayTicks`),
		lifetimeTicks: integer$4(periodic.lifetimeTicks, 1, 255, `${label}.lifetimeTicks`)
	};
}
function checkedChild(value, tracker, label) {
	if (tracker.seen.has(value)) throw new TypeError(`${label} graph must not contain aliases or cycles`);
	tracker.seen.add(value);
	tracker.count += 1;
	if (tracker.count > MAX_GRAPH_NODES) throw new RangeError(`death conversion graph exceeds ${MAX_GRAPH_NODES} nodes`);
	const child = exactRecord$6(value, CHILD_KEYS$1, label);
	if (typeof child.eligible !== "boolean") throw new TypeError(`${label}.eligible must be boolean`);
	if (child.role !== "primary" && child.role !== "secondary") throw new TypeError(`${label}.role is invalid`);
	return {
		archetypeId: text(child.archetypeId, `${label}.archetypeId`),
		eligible: child.eligible,
		health: integer$4(child.health, 1, Number.MAX_SAFE_INTEGER, `${label}.health`),
		ordinaryChildren: checkedChildren(child.ordinaryChildren, tracker, `${label}.ordinaryChildren`),
		periodic: checkedPeriodic(child.periodic, tracker, `${label}.periodic`),
		radius: integer$4(child.radius, 0, 1e6, `${label}.radius`),
		replacementChildren: checkedChildren(child.replacementChildren, tracker, `${label}.replacementChildren`),
		role: child.role
	};
}
function checkedEntity$1(value, tracker, index) {
	if (tracker.seen.has(value)) throw new TypeError(`death conversion entity ${index} is aliased`);
	tracker.seen.add(value);
	const label = `death conversion entity ${index}`;
	const entity = exactRecord$6(value, ENTITY_KEYS$1, label);
	if (typeof entity.eligible !== "boolean") throw new TypeError(`${label}.eligible must be boolean`);
	return {
		anchor: checkedAnchor$1(entity.anchor, `${label}.anchor`),
		archetypeId: text(entity.archetypeId, `${label}.archetypeId`),
		eligible: entity.eligible,
		health: integer$4(entity.health, 1, Number.MAX_SAFE_INTEGER, `${label}.health`),
		id: integer$4(entity.id, 1, Number.MAX_SAFE_INTEGER, `${label}.id`),
		ordinaryChildren: checkedChildren(entity.ordinaryChildren, tracker, `${label}.ordinaryChildren`),
		ownerId: integer$4(entity.ownerId, 1, Number.MAX_SAFE_INTEGER, `${label}.ownerId`),
		periodic: checkedPeriodic(entity.periodic, tracker, `${label}.periodic`),
		replacementChildren: checkedChildren(entity.replacementChildren, tracker, `${label}.replacementChildren`)
	};
}
function checkedCommands$6(value) {
	const commands = denseArray$6(value, MAX_COMMANDS$6, "death conversion commands").map((entry, sequence) => {
		const label = `death conversion command ${sequence}`;
		const command = exactRecord$6(entry, COMMAND_KEYS$3, label);
		const common = {
			amount: integer$4(command.amount, 0, Number.MAX_SAFE_INTEGER, `${label}.amount`),
			cause: command.cause,
			durationTicks: integer$4(command.durationTicks, 0, MAX_TICK$6, `${label}.durationTicks`),
			kind: command.kind,
			sequence,
			sourceId: integer$4(command.sourceId, 1, Number.MAX_SAFE_INTEGER, `${label}.sourceId`),
			targetId: integer$4(command.targetId, 1, Number.MAX_SAFE_INTEGER, `${label}.targetId`),
			tick: integer$4(command.tick, 0, 255, `${label}.tick`)
		};
		if (common.kind === "curse") {
			if (common.amount !== 0 || common.cause !== null || common.durationTicks < 1 || common.tick > MAX_TICK$6 - common.durationTicks) throw new TypeError(`${label} curse fields are invalid`);
		} else if (common.kind === "damage") {
			if (common.durationTicks !== 0 || !CAUSES$1.has(common.cause)) throw new TypeError(`${label} damage fields are invalid`);
		} else throw new TypeError(`${label}.kind is invalid`);
		return common;
	}).sort((left, right) => left.tick - right.tick || left.sequence - right.sequence);
	const signatures = /* @__PURE__ */ new Set();
	for (const command of commands) {
		const { sequence: _sequence, ...record } = command;
		const signature = canonicalJson$6(record);
		if (signatures.has(signature)) throw new TypeError("death conversion commands must not contain duplicates");
		signatures.add(signature);
	}
	return commands.map(({ sequence: _sequence, ...command }) => command);
}
function checkedSetup$6(value) {
	const setup = exactRecord$6(value, SETUP_KEYS$2, "death conversion setup");
	const tracker = {
		count: 0,
		seen: /* @__PURE__ */ new Set()
	};
	const entities = denseArray$6(setup.entities, MAX_ENTITIES$1, "death conversion entities", 1).map((entry, index) => checkedEntity$1(entry, tracker, index)).sort((left, right) => left.id - right.id);
	for (let index = 0; index < entities.length; index += 1) {
		if (entities[index].id <= MAX_ENTITIES$1) throw new TypeError(`death conversion setup IDs must exceed child namespace ${MAX_ENTITIES$1}`);
		if (index > 0 && entities[index - 1].id === entities[index].id) throw new TypeError("death conversion entity IDs must be unique");
	}
	return {
		commands: checkedCommands$6(setup.commands),
		entities
	};
}
function questionRecord$3(key, value) {
	return deepFreeze$6({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		key,
		source: SOURCE$4,
		value: clone$6(value)
	});
}
function createDeathConversionQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("death conversion questions do not accept overrides");
	return deepFreeze$6(Object.fromEntries(Object.entries(QUESTION_VALUES$6).map(([key, value]) => [key, questionRecord$3(key, value)])));
}
function createDeathConversionFixture(entities = DEFAULT_SETUP.entities, commands = DEFAULT_SETUP.commands, ...extra) {
	if (extra.length !== 0) throw new TypeError("death conversion fixture received extra arguments");
	return clone$6(checkedSetup$6({
		commands,
		entities
	}));
}
var SOURCE$4, MAX_COMMANDS$6, MAX_ENTITIES$1, MAX_EVENTS$4, MAX_GRAPH_NODES, MAX_SNAPSHOT_BYTES$6, MAX_TICK$6, MAX_CONVERSIONS, SETUP_KEYS$2, ENTITY_KEYS$1, CHILD_KEYS$1, PERIODIC_KEYS, COMMAND_KEYS$3, CAUSES$1, DEATH_CONVERSION_IDENTITY, QUESTION_VALUES$6, DEFAULT_SETUP, DeathConversionEncounter;
function init_death_conversion() {
	return (init_death_conversion = __esmMin((() => {
		init_death_conversion_delegated();
		SOURCE$4 = "unsourced-death-conversion-policy-fixture";
		MAX_COMMANDS$6 = 128;
		MAX_ENTITIES$1 = 64;
		MAX_EVENTS$4 = 4096;
		MAX_GRAPH_NODES = 64;
		MAX_SNAPSHOT_BYTES$6 = 524288;
		MAX_TICK$6 = 256;
		MAX_CONVERSIONS = 16;
		SETUP_KEYS$2 = ["commands", "entities"];
		ENTITY_KEYS$1 = [
			"anchor",
			"archetypeId",
			"eligible",
			"health",
			"id",
			"ordinaryChildren",
			"ownerId",
			"periodic",
			"replacementChildren"
		];
		CHILD_KEYS$1 = [
			"archetypeId",
			"eligible",
			"health",
			"ordinaryChildren",
			"periodic",
			"radius",
			"replacementChildren",
			"role"
		];
		PERIODIC_KEYS = [
			"cadenceTicks",
			"children",
			"initialDelayTicks",
			"lifetimeTicks"
		];
		COMMAND_KEYS$3 = [
			"amount",
			"cause",
			"durationTicks",
			"kind",
			"sourceId",
			"targetId",
			"tick"
		];
		CAUSES$1 = /* @__PURE__ */ new Set([
			"combat-damage",
			"despawn",
			"expiry"
		]);
		DEATH_CONVERSION_IDENTITY = deepFreeze$6({
			displayName: "Gloam Shepherd",
			id: "gloam-shepherd",
			replacementDisplayName: "Umber Whelp",
			replacementId: "umber-whelp"
		});
		QUESTION_VALUES$6 = deepFreeze$6({
			shippedIdentity: "original-gloam-shepherd-and-umber-whelp-identities",
			benchmarkMapping: "historical-comparison-identity-is-test-only",
			durationTicks: 3,
			application: "living-source-to-living-eligible-target-command-applies-immediately",
			refresh: "same-source-reapplication-keeps-the-later-expiry",
			eligibility: "explicit-boolean-on-the-immediate-dead-target",
			lethalCause: "combat-damage-only",
			expiry: "command-first-at-expiry-tick-then-expire-after-death-resolution",
			competingSource: "latest-application-tick-wins-then-greater-source-id-breaks-ties",
			sourceCasterDeath: "an-applied-curse-survives-its-caster-death",
			targetDeath: "target-death-removes-its-curse-after-resolution",
			ownership: "replacement-batch-uses-winning-converter-owner",
			attribution: "replacement-batch-source-is-the-immediate-dead-target",
			childIdentity: "umber-whelp-in-the-default-original-identity-fixture",
			childCount: 1,
			childHealth: 35,
			childRadius: 70,
			childRole: "primary",
			sameBoundaryOrdering: "commands-in-input-order-then-deaths-by-id-then-expiry",
			simultaneousDeaths: "ascending-dead-entity-id",
			ordinaryDeathSpawnInteraction: "ordinary-death-batch-before-conversion-replacement-batch",
			exactlyOnceLatch: "one-conversion-latch-per-immediate-dead-target-id",
			recursion: "converted-replacements-can-later-cast-and-be-converted-through-explicit-commands",
			recursionCap: MAX_CONVERSIONS,
			entityCap: MAX_ENTITIES$1,
			eventCap: MAX_EVENTS$4,
			graphCap: MAX_GRAPH_NODES,
			commandCap: MAX_COMMANDS$6,
			tickCap: MAX_TICK$6,
			snapshotByteCap: MAX_SNAPSHOT_BYTES$6,
			zeroDamage: "zero-damage-never-causes-death",
			overkill: "damage-clamps-at-zero-and-the-first-lethal-command-owns-cause",
			alreadyDead: "later-damage-and-curse-commands-are-no-ops",
			idPolicy: "shared-placement-materializer-monotonic-id-order",
			anchorPolicy: "replacement-uses-immediate-dead-target-anchor",
			placementPolicy: "shared-placement-materializer-formation",
			commandBoundary: "all-commands-are-visible-before-stable-death-drain",
			snapshotPolicy: "canonical-causal-replay-validates-winner-expiry-latches-ownership-history-and-placement"
		});
		DEFAULT_SETUP = deepFreeze$6({
			commands: [{
				amount: 0,
				cause: null,
				durationTicks: 3,
				kind: "curse",
				sourceId: 101,
				targetId: 102,
				tick: 1
			}, {
				amount: 80,
				cause: "combat-damage",
				durationTicks: 0,
				kind: "damage",
				sourceId: 101,
				targetId: 102,
				tick: 3
			}],
			entities: [{
				anchor: {
					x: -500,
					y: 900
				},
				archetypeId: "gloam-shepherd",
				eligible: true,
				health: 90,
				id: 101,
				ordinaryChildren: [],
				ownerId: 7,
				periodic: null,
				replacementChildren: [deepFreeze$6({
					archetypeId: "umber-whelp",
					eligible: true,
					health: 35,
					ordinaryChildren: [],
					periodic: null,
					radius: 70,
					replacementChildren: [],
					role: "primary"
				})]
			}, {
				anchor: {
					x: 600,
					y: 1200
				},
				archetypeId: "reed-guard",
				eligible: true,
				health: 80,
				id: 102,
				ordinaryChildren: [],
				ownerId: 8,
				periodic: null,
				replacementChildren: []
			}]
		});
		DeathConversionEncounter = class DeathConversionEncounter extends DelegatedDeathConversionEncounter {
			constructor(setup = createDeathConversionFixture()) {
				super(checkedSetup$6(setup));
			}
			static restore(serialized) {
				return restoreDelegatedEncounter(serialized, checkedSetup$6, DeathConversionEncounter);
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/death-effects.js
function deepFreeze$5(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze$5(child);
		Object.freeze(value);
	}
	return value;
}
function clone$5(value) {
	return JSON.parse(JSON.stringify(value));
}
function canonicalJson$5(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$5).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$5(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord$5(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$5(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain only dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function safeInteger$1(value, minimum, label) {
	if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError(`${label} must be a safe integer >= ${minimum}`);
	return value;
}
function checkedPosition$1(value, label) {
	const position = exactRecord$5(value, ["x", "y"], label);
	return {
		x: safeInteger$1(position.x, -Number.MAX_SAFE_INTEGER, `${label}.x`),
		y: safeInteger$1(position.y, -Number.MAX_SAFE_INTEGER, `${label}.y`)
	};
}
function checkedEntity(value, index) {
	const label = `death entity ${index}`;
	const entity = exactRecord$5(value, ENTITY_KEYS, label);
	safeInteger$1(entity.id, 1, `${label}.id`);
	safeInteger$1(entity.maxHealth, 1, `${label}.maxHealth`);
	safeInteger$1(entity.radius, 0, `${label}.radius`);
	if (typeof entity.alive !== "boolean" || typeof entity.deathEffect !== "boolean" || typeof entity.targetable !== "boolean") throw new TypeError(`${label} flags must be booleans`);
	if (!KINDS.has(entity.kind) || !LAYERS.has(entity.layer) || !OWNERS.has(entity.owner)) throw new TypeError(`${label} classification is invalid`);
	if (entity.kind === "crown-tower" && entity.layer !== "ground") throw new TypeError(`${label} crown tower must be ground`);
	return {
		alive: entity.alive,
		deathEffect: entity.deathEffect,
		id: entity.id,
		kind: entity.kind,
		layer: entity.layer,
		maxHealth: entity.maxHealth,
		owner: entity.owner,
		position: checkedPosition$1(entity.position, `${label}.position`),
		radius: entity.radius,
		targetable: entity.targetable
	};
}
function checkedEntities(value) {
	const entities = denseArray$5(value, MAX_ENTITIES, "death entities").map(checkedEntity).sort((left, right) => left.id - right.id);
	if (entities.length === 0) throw new TypeError("death entities must not be empty");
	for (let index = 1; index < entities.length; index += 1) if (entities[index - 1].id === entities[index].id) throw new TypeError("death entities must have unique ids");
	return entities;
}
function checkedCommands$5(value, ids) {
	const commands = denseArray$5(value, MAX_COMMANDS$5, "death commands").map((entry, index) => {
		const label = `death command ${index}`;
		const command = exactRecord$5(entry, COMMAND_KEYS$2, label);
		safeInteger$1(command.amount, 0, `${label}.amount`);
		safeInteger$1(command.tick, 0, `${label}.tick`);
		if (command.tick >= MAX_TICK$5) throw new RangeError(`${label}.tick exceeds the encounter bound`);
		if (!CAUSES.has(command.cause)) throw new TypeError(`${label}.cause is invalid`);
		if (command.sourceId !== null) safeInteger$1(command.sourceId, 1, `${label}.sourceId`);
		safeInteger$1(command.targetId, 1, `${label}.targetId`);
		if (!ids.has(command.targetId)) throw new TypeError(`${label}.targetId is unknown`);
		return {
			amount: command.amount,
			cause: command.cause,
			sequence: index,
			sourceId: command.sourceId,
			targetId: command.targetId,
			tick: command.tick
		};
	}).sort((left, right) => left.tick - right.tick || left.sequence - right.sequence).map(({ sequence: _sequence, ...command }) => command);
	const signatures = /* @__PURE__ */ new Set();
	for (const command of commands) {
		const signature = canonicalJson$5(command);
		if (signatures.has(signature)) throw new TypeError("death commands must not contain duplicates");
		signatures.add(signature);
	}
	return commands;
}
function checkedSetup$5(value) {
	const setup = exactRecord$5(value, SETUP_KEYS$1, "death setup");
	const entities = checkedEntities(setup.entities);
	const ids = new Set(entities.map(({ id }) => id));
	return {
		commands: checkedCommands$5(setup.commands, ids),
		entities
	};
}
function questionRecord$2(key, value) {
	return deepFreeze$5({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		key,
		provenance: clone$5(PROVENANCE),
		value: clone$5(value)
	});
}
function defaultEntities() {
	return [{
		alive: true,
		deathEffect: true,
		id: 10,
		kind: "structure",
		layer: "ground",
		maxHealth: 100,
		owner: "south",
		position: {
			x: 0,
			y: 0
		},
		radius: 500,
		targetable: true
	}, {
		alive: true,
		deathEffect: false,
		id: 20,
		kind: "troop",
		layer: "ground",
		maxHealth: 500,
		owner: "north",
		position: {
			x: 2500,
			y: 0
		},
		radius: 0,
		targetable: true
	}];
}
function defaultCommands() {
	return [{
		amount: 100,
		cause: "combat-damage",
		sourceId: 20,
		targetId: 10,
		tick: 0
	}];
}
function squaredDistance(left, right) {
	const dx = BigInt(left.x) - BigInt(right.x);
	const dy = BigInt(left.y) - BigInt(right.y);
	return dx * dx + dy * dy;
}
function overlaps(source, target) {
	const reach = BigInt(QUESTION_VALUES$5.radius) + BigInt(source.radius) + BigInt(target.radius);
	return squaredDistance(source.position, target.position) <= reach * reach;
}
function effectDamage(target) {
	if (target.kind !== "crown-tower") return QUESTION_VALUES$5.damage;
	const modifier = QUESTION_VALUES$5.towerModifier;
	return Number(BigInt(QUESTION_VALUES$5.damage) * BigInt(modifier.numerator) / BigInt(modifier.denominator));
}
function createDeathEffectsCatalog() {
	return createCardCatalog(DEFINITIONS);
}
function createDeathEffectsQuestions(...args) {
	if (args.length !== 0) throw new TypeError("death questions do not accept overrides");
	return deepFreeze$5(Object.fromEntries(Object.entries(QUESTION_VALUES$5).map(([key, value]) => [key, questionRecord$2(key, value)])));
}
function createDeathEffectsFixture(entities = defaultEntities(), commands = defaultCommands(), ...extra) {
	if (extra.length !== 0) throw new TypeError("death fixture received extra arguments");
	return clone$5(checkedSetup$5({
		commands,
		entities
	}));
}
var DEFINITIONS, PROVENANCE, QUESTION_VALUES$5, MAX_COMMANDS$5, MAX_ENTITIES, MAX_EVENTS$3, MAX_SNAPSHOT_BYTES$5, MAX_TICK$5, MAX_QUEUE, ENTITY_KEYS, COMMAND_KEYS$2, SETUP_KEYS$1, SNAPSHOT_KEYS$1, KINDS, LAYERS, OWNERS, CAUSES, DeathEffectsEncounter;
function init_death_effects() {
	return (init_death_effects = __esmMin((() => {
		init_schema();
		DEFINITIONS = [{
			areaDamageRadiusMillitiles: null,
			components: [],
			cost: 4,
			count: 1,
			damage: 160,
			deployTimeTicks: 60,
			displayName: "Cinder Reliquary",
			firstHitTicks: 60,
			hitSpeedTicks: 120,
			hitpoints: 1200,
			id: "cinder-reliquary",
			kind: "structure",
			movementMillitilesPerSecond: 0,
			rangeMillitiles: 4500,
			rarity: "uncommon",
			sightRangeMillitiles: 5500,
			targetMode: "ground"
		}];
		PROVENANCE = Object.freeze({
			accessed: "2026-07-30",
			document: "SOURCES.md",
			location: "Known limitations",
			statement: "Card abilities, including death damage and crown-tower damage multipliers, are outside the common schema."
		});
		QUESTION_VALUES$5 = Object.freeze({
			trigger: "one instantaneous area-damage trigger for each effect-bearing death",
			radius: 2e3,
			damage: 200,
			eligibility: "living targetable enemy ground troops, structures, and crown towers",
			cause: "the FIFO request supplying the final positive applied damage owns the death; zero and post-lethal overkill requests do not contribute; only combat-damage deaths trigger",
			sameTickOrder: "commands by tick/input sequence; damage wave; deaths by id; FIFO triggers; hits by id",
			chain: "new effect-bearing deaths append to the same-tick FIFO trigger queue",
			selfSourceInclusion: "dead source and all friendly entities are excluded",
			towerModifier: Object.freeze({
				denominator: 100,
				numerator: 35
			}),
			recursion: "each entity may enqueue its death trigger exactly once",
			cap: Object.freeze({
				commands: 64,
				entities: 64,
				events: 16384,
				snapshotBytes: 262144,
				tick: 1024,
				triggerQueue: 64
			})
		});
		MAX_COMMANDS$5 = QUESTION_VALUES$5.cap.commands;
		MAX_ENTITIES = QUESTION_VALUES$5.cap.entities;
		MAX_EVENTS$3 = QUESTION_VALUES$5.cap.events;
		MAX_SNAPSHOT_BYTES$5 = QUESTION_VALUES$5.cap.snapshotBytes;
		MAX_TICK$5 = QUESTION_VALUES$5.cap.tick;
		MAX_QUEUE = QUESTION_VALUES$5.cap.triggerQueue;
		ENTITY_KEYS = [
			"alive",
			"deathEffect",
			"id",
			"kind",
			"layer",
			"maxHealth",
			"owner",
			"position",
			"radius",
			"targetable"
		];
		COMMAND_KEYS$2 = [
			"amount",
			"cause",
			"sourceId",
			"targetId",
			"tick"
		];
		SETUP_KEYS$1 = ["commands", "entities"];
		SNAPSHOT_KEYS$1 = [
			"identity",
			"tick",
			"version"
		];
		KINDS = /* @__PURE__ */ new Set([
			"crown-tower",
			"structure",
			"troop"
		]);
		LAYERS = /* @__PURE__ */ new Set(["air", "ground"]);
		OWNERS = /* @__PURE__ */ new Set(["north", "south"]);
		CAUSES = /* @__PURE__ */ new Set(["combat-damage", "expiry"]);
		DeathEffectsEncounter = class DeathEffectsEncounter {
			#commands;
			#commandIndex = 0;
			#entities;
			#health = /* @__PURE__ */ new Map();
			#history = [];
			#setup;
			#terminal = false;
			#tick = 0;
			#triggered = /* @__PURE__ */ new Set();
			constructor(setup = createDeathEffectsFixture()) {
				this.#setup = checkedSetup$5(setup);
				this.#commands = this.#setup.commands;
				this.#entities = this.#setup.entities;
				for (const entity of this.#entities) this.#health.set(entity.id, entity.alive ? entity.maxHealth : 0);
				if (this.#commands.length === 0) this.#terminal = true;
			}
			get replay() {
				return clone$5(this.#history);
			}
			get state() {
				return clone$5({
					entities: this.#entities.map((entity) => ({
						alive: this.#health.get(entity.id) > 0,
						hitpoints: this.#health.get(entity.id),
						id: entity.id
					})),
					terminal: this.#terminal,
					tick: this.#tick,
					triggeredIds: [...this.#triggered].sort((a, b) => a - b)
				});
			}
			step() {
				if (this.#terminal) return [];
				const tick = this.#tick;
				const commands = [];
				while (this.#commandIndex < this.#commands.length && this.#commands[this.#commandIndex].tick === tick) {
					commands.push(this.#commands[this.#commandIndex]);
					this.#commandIndex += 1;
				}
				const events = [];
				if (commands.length > 0) {
					const hits = commands.map((command) => ({
						amount: command.cause === "expiry" ? this.#health.get(command.targetId) : command.amount,
						cause: command.cause,
						sourceId: command.sourceId,
						targetId: command.targetId
					}));
					const queue = this.#applyWave(hits, tick, "command", null, events).filter(({ cause, entity }) => cause === "combat-damage" && entity.deathEffect && !this.#triggered.has(entity.id)).map(({ entity }) => entity.id);
					this.#drainTriggers(queue, tick, events);
				}
				if (this.#history.length + events.length > MAX_EVENTS$3) throw new RangeError("death encounter event bound exceeded");
				this.#history.push(...events);
				this.#tick += 1;
				if (this.#commandIndex === this.#commands.length) this.#terminal = true;
				return clone$5(events);
			}
			stepMany(count) {
				safeInteger$1(count, 0, "death step count");
				if (count > MAX_TICK$5) throw new RangeError("death step count exceeds bound");
				const events = [];
				for (let index = 0; index < count && !this.#terminal; index += 1) events.push(...this.step());
				return clone$5(events);
			}
			run() {
				while (!this.#terminal) this.step();
				return this.replay;
			}
			serialize() {
				return canonicalJson$5({
					identity: {
						commands: this.#setup.commands,
						entities: this.#setup.entities
					},
					tick: this.#tick,
					version: 1
				});
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("death snapshot must be a string");
				if (serialized.length > MAX_SNAPSHOT_BYTES$5) throw new RangeError("death snapshot exceeds its size bound");
				let raw;
				try {
					raw = JSON.parse(serialized);
				} catch {
					throw new TypeError("death snapshot must be valid JSON");
				}
				if (canonicalJson$5(raw) !== serialized) throw new TypeError("death snapshot must use canonical encoding");
				const snapshot = exactRecord$5(raw, SNAPSHOT_KEYS$1, "death snapshot");
				if (snapshot.version !== 1) throw new TypeError("death snapshot version is unsupported");
				safeInteger$1(snapshot.tick, 0, "death snapshot.tick");
				if (snapshot.tick > MAX_TICK$5) throw new RangeError("death snapshot.tick exceeds bound");
				const encounter = new DeathEffectsEncounter(snapshot.identity);
				encounter.stepMany(snapshot.tick);
				if (encounter.#tick !== snapshot.tick) throw new TypeError("death snapshot contains post-terminal time");
				return encounter;
			}
			#entity(id) {
				return this.#entities.find((entity) => entity.id === id);
			}
			#applyWave(hits, tick, origin, triggerId, events) {
				const totals = /* @__PURE__ */ new Map();
				const hitsByTarget = /* @__PURE__ */ new Map();
				for (const hit of hits) {
					if (this.#health.get(hit.targetId) === 0) continue;
					totals.set(hit.targetId, (totals.get(hit.targetId) ?? 0n) + BigInt(hit.amount));
					if (!hitsByTarget.has(hit.targetId)) hitsByTarget.set(hit.targetId, []);
					hitsByTarget.get(hit.targetId).push(hit);
					events.push({
						amount: hit.amount,
						cause: hit.cause,
						origin,
						sourceId: hit.sourceId,
						targetId: hit.targetId,
						tick,
						triggerId,
						type: "damage-requested"
					});
				}
				const deaths = [];
				for (const targetId of [...totals.keys()].sort((a, b) => a - b)) {
					const before = this.#health.get(targetId);
					const requested = totals.get(targetId);
					const applied = Number(requested > BigInt(before) ? BigInt(before) : requested);
					const after = before - applied;
					let remaining = BigInt(before);
					let cause = null;
					for (const hit of hitsByTarget.get(targetId)) {
						if (remaining === 0n || hit.amount === 0) continue;
						const contribution = BigInt(hit.amount) < remaining ? BigInt(hit.amount) : remaining;
						if (contribution === 0n) continue;
						remaining -= contribution;
						if (remaining === 0n) cause = hit.cause;
					}
					this.#health.set(targetId, after);
					events.push({
						applied,
						cause,
						healthAfter: after,
						healthBefore: before,
						origin,
						requested: requested.toString(),
						targetId,
						tick,
						triggerId,
						type: "damage-applied"
					});
					if (before > 0 && after === 0) {
						const entity = this.#entity(targetId);
						deaths.push({
							cause,
							entity
						});
						events.push({
							cause,
							targetId,
							tick,
							triggerId,
							type: "death"
						});
					}
				}
				return deaths;
			}
			#drainTriggers(queue, tick, events) {
				while (queue.length > 0) {
					if (queue.length > MAX_QUEUE) throw new RangeError("death trigger queue bound exceeded");
					const sourceId = queue.shift();
					if (this.#triggered.has(sourceId)) continue;
					this.#triggered.add(sourceId);
					const source = this.#entity(sourceId);
					events.push({
						queueIndex: this.#triggered.size,
						sourceId,
						tick,
						type: "death-triggered"
					});
					const targets = this.#entities.filter((target) => this.#health.get(target.id) > 0 && target.targetable && target.owner !== source.owner && target.layer === "ground" && overlaps(source, target)).sort((left, right) => left.id - right.id);
					const deaths = this.#applyWave(targets.map((target) => ({
						amount: effectDamage(target),
						cause: "combat-damage",
						sourceId,
						targetId: target.id
					})), tick, "death-effect", sourceId, events);
					for (const { cause, entity } of deaths) if (cause === "combat-damage" && entity.deathEffect && !this.#triggered.has(entity.id)) queue.push(entity.id);
				}
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/buildings-defensive.js
function clone$4(value) {
	return JSON.parse(JSON.stringify(value));
}
function deepFreeze$4(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze$4(child);
		Object.freeze(value);
	}
	return value;
}
function canonicalJson$4(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$4).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$4(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord$4(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$4(value, label, maximum) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function integer$3(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
}
function position(value, label) {
	const checked = exactRecord$4(value, ["x", "y"], label);
	integer$3(checked.x, `${label}.x`, -1e6, MAX_POSITION$1);
	integer$3(checked.y, `${label}.y`, -1e6, MAX_POSITION$1);
	return {
		x: checked.x,
		y: checked.y
	};
}
function checkedBuildings$3(value) {
	const result = denseArray$4(value, "defensive buildings", MAX_BUILDINGS$3).map((entry, index) => {
		const item = exactRecord$4(entry, [
			"archetypeId",
			"destroyedOpposingLaneTowers",
			"id",
			"position",
			"side"
		], `defensive building ${index}`);
		integer$3(item.id, `defensive building ${index}.id`, 1);
		if (!Object.hasOwn(ARCHETYPES$1, item.archetypeId)) throw new TypeError(`defensive building ${index}.archetypeId is invalid`);
		const placement = evaluateDeployment({
			destroyedOpposingLaneTowers: denseArray$4(item.destroyedOpposingLaneTowers, `defensive building ${index}.destroyedOpposingLaneTowers`, 2),
			placementClass: "ground_entity",
			point: position(item.position, `defensive building ${index}.position`),
			side: item.side
		});
		if (!placement.legal) throw new TypeError(`defensive building ${index} placement is illegal: ${placement.reason}`);
		return {
			archetypeId: item.archetypeId,
			destroyedOpposingLaneTowers: clone$4(item.destroyedOpposingLaneTowers),
			id: item.id,
			placement,
			position: clone$4(item.position),
			side: item.side
		};
	}).sort((a, b) => a.id - b.id);
	const ids = /* @__PURE__ */ new Set();
	for (const item of result) {
		if (ids.has(item.id)) throw new TypeError("defensive buildings must have unique IDs");
		ids.add(item.id);
	}
	return result;
}
function checkedTargets(value) {
	const result = denseArray$4(value, "defensive targets", MAX_TARGETS).map((entry, index) => {
		const item = exactRecord$4(entry, [
			"health",
			"id",
			"kind",
			"layer",
			"position",
			"radius",
			"targetable"
		], `defensive target ${index}`);
		integer$3(item.id, `defensive target ${index}.id`, 1);
		integer$3(item.health, `defensive target ${index}.health`, 1, MAX_HEALTH$1);
		integer$3(item.radius, `defensive target ${index}.radius`, 0, MAX_RADIUS);
		targetCandidate({
			alive: true,
			id: item.id,
			kind: item.kind,
			layer: item.layer,
			position: position(item.position, `defensive target ${index}.position`),
			radius: item.radius,
			targetable: item.targetable
		});
		return {
			alive: true,
			health: item.health,
			id: item.id,
			hidden: false,
			kind: item.kind,
			layer: item.layer,
			position: clone$4(item.position),
			radius: item.radius,
			targetable: item.targetable
		};
	}).sort((a, b) => a.id - b.id);
	const ids = /* @__PURE__ */ new Set();
	for (const item of result) {
		if (ids.has(item.id)) throw new TypeError("defensive targets must have unique IDs");
		ids.add(item.id);
	}
	return result;
}
function checkedCommands$4(value, buildingIds, targetIds) {
	const result = denseArray$4(value, "defensive commands", MAX_COMMANDS$4).map((entry, index) => {
		const item = exactRecord$4(entry, [
			"amount",
			"buildingId",
			"position",
			"targetId",
			"tick",
			"type"
		], `defensive command ${index}`);
		integer$3(item.tick, `defensive command ${index}.tick`, 0, 4095);
		if (!COMMAND_TYPES$1.has(item.type)) throw new TypeError(`defensive command ${index}.type is invalid`);
		if (item.type === "damage-building") {
			integer$3(item.amount, `defensive command ${index}.amount`, 1, MAX_HEALTH$1);
			integer$3(item.buildingId, `defensive command ${index}.buildingId`, 1);
			if (!buildingIds.has(item.buildingId)) throw new TypeError("unknown building ID");
			if (item.targetId !== null || item.position !== null) throw new TypeError("inapplicable command field");
		} else {
			integer$3(item.targetId, `defensive command ${index}.targetId`, 1);
			if (!targetIds.has(item.targetId)) throw new TypeError("unknown target ID");
			if (item.buildingId !== null) throw new TypeError("inapplicable command field");
			if (item.type === "damage-target") {
				integer$3(item.amount, `defensive command ${index}.amount`, 1, MAX_HEALTH$1);
				if (item.position !== null) throw new TypeError("inapplicable command field");
			} else if (item.type === "move-target") {
				if (item.amount !== null) throw new TypeError("inapplicable command field");
				position(item.position, `defensive command ${index}.position`);
			} else if (item.amount !== null || item.position !== null) throw new TypeError("inapplicable command field");
		}
		return clone$4(item);
	});
	let prior = -1;
	for (const item of result) {
		if (item.tick < prior) throw new TypeError("defensive commands must be ordered by tick");
		prior = item.tick;
	}
	return result;
}
function checkedSetup$4(value) {
	const setup = exactRecord$4(value, [
		"buildings",
		"commands",
		"targets"
	], "defensive setup");
	const buildings = checkedBuildings$3(setup.buildings);
	const targets = checkedTargets(setup.targets);
	return {
		buildings,
		commands: checkedCommands$4(setup.commands, new Set(buildings.map(({ id }) => id)), new Set(targets.map(({ id }) => id))),
		targets
	};
}
function initialState$3(setup) {
	const area = new AreaDamageSystem();
	for (const target of setup.targets) area.add(target.id, MAX_HEALTH$1, target.health);
	return {
		areaDamageEvents: [],
		areaDamagePrimitive: area.serialize(),
		buildings: setup.buildings.map((item) => {
			const archetype = ARCHETYPES$1[item.archetypeId];
			return {
				alive: true,
				archetypeId: item.archetypeId,
				attackSequence: 0,
				consecutiveHits: 0,
				deathReason: null,
				health: archetype.hitpoints,
				hidden: archetype.variant === "hidden",
				id: item.id,
				placement: clone$4(item.placement),
				position: clone$4(item.position),
				rampEvents: [],
				rampPrimitive: null,
				side: item.side,
				stageIndex: 0,
				targetable: archetype.variant !== "hidden",
				targetId: null,
				visibilityPrimitive: archetype.variant === "hidden" ? visibilitySnapshot() : null,
				visibilityEvents: []
			};
		}),
		commandIndex: 0,
		history: [],
		nextProjectileId: 1,
		projectiles: [],
		targets: clone$4(setup.targets),
		tick: 0
	};
}
function circleWithin(origin, target, range) {
	const dx = BigInt(origin.x) - BigInt(target.position.x);
	const dy = BigInt(origin.y) - BigInt(target.position.y);
	const reach = BigInt(range + target.radius);
	return dx * dx + dy * dy <= reach * reach;
}
function candidateOf(target) {
	return {
		alive: target.alive,
		id: target.id,
		kind: target.kind,
		layer: target.layer,
		position: target.position,
		radius: target.radius,
		targetable: target.targetable && !target.hidden
	};
}
function eligibleCandidates(building, targets, archetype) {
	return targets.filter((target) => target.alive && target.targetable && !target.hidden && circleWithin(building.position, target, archetype.maxRange) && !(archetype.minRange > 0 && circleWithin(building.position, target, archetype.minRange - 1)));
}
function destroyBuilding(state, building, reason) {
	if (!building.alive) return;
	if (building.rampPrimitive !== null) {
		if (ConsecutiveTargetRampEncounter.restore(building.rampPrimitive).state.targetId !== null) rebuildRampPrimitive(building, {
			targetId: null,
			tick: state.tick,
			type: "target-lost"
		}, state.tick);
	}
	building.alive = false;
	building.health = 0;
	building.hidden = false;
	building.targetable = false;
	building.targetId = null;
	building.stageIndex = 0;
	building.consecutiveHits = 0;
	building.deathReason = reason;
	state.history.push({
		buildingId: building.id,
		reason,
		tick: state.tick,
		type: "building-destroyed"
	});
}
function visibilitySnapshot(commands = [], tick = 0) {
	const primitive = new InvisibilityRevealEncounter(createInvisibilityFixture([{
		alive: true,
		health: MAX_HEALTH$1,
		id: 1,
		kind: "structure",
		layer: "ground",
		position: {
			x: 0,
			y: 0
		},
		radius: 0
	}], commands));
	primitive.stepMany(tick);
	return primitive.serialize();
}
function setBuildingVisibility(state, building, visible) {
	let primitive = InvisibilityRevealEncounter.restore(building.visibilityPrimitive);
	if (primitive.state.targets[0].visible !== visible) {
		const commands = JSON.parse(building.visibilityPrimitive).identity.commands.concat({
			sourceId: visible ? 2 : 1,
			targetId: 1,
			tick: state.tick,
			type: visible ? "reveal" : "hide"
		});
		primitive = InvisibilityRevealEncounter.restore(visibilitySnapshot(commands, state.tick));
	}
	if (primitive.state.tick !== state.tick) throw new TypeError("building visibility primitive tick is misaligned");
	primitive.step();
	const resolvedVisible = primitive.state.targets[0].visible;
	building.visibilityPrimitive = primitive.serialize();
	building.visibilityEvents = primitive.replay;
	const hidden = !resolvedVisible;
	if (hidden === building.hidden) return;
	building.hidden = hidden;
	building.targetable = resolvedVisible;
	state.history.push({
		buildingId: building.id,
		tick: state.tick,
		type: hidden ? "building-hidden" : "building-revealed"
	});
}
function areaCandidates(state) {
	return state.targets.map((target) => candidateOf(target));
}
function resolveAreaDamage(state, building, center, radius, amount, mode, candidates = areaCandidates(state), expose = true) {
	const area = AreaDamageSystem.restore(state.areaDamagePrimitive);
	const result = area.resolve({
		center,
		damage: amount,
		mode,
		radius,
		tick: state.tick
	}, candidates);
	state.areaDamagePrimitive = area.serialize();
	state.areaDamageEvents.push(...clone$4(result.events));
	for (const event of result.events) if (event.type === "damage") {
		const target = state.targets.find(({ id }) => id === event.targetId);
		target.health = event.currentHealthAfter;
		if (expose) state.history.push({
			amount: event.amount,
			buildingId: building.id,
			healthAfter: event.currentHealthAfter,
			healthBefore: event.currentHealthBefore,
			targetId: event.targetId,
			tick: state.tick,
			type: "damage"
		});
	} else if (event.type === "death") {
		const target = state.targets.find(({ id }) => id === event.targetId);
		target.alive = false;
		if (expose) state.history.push({
			targetId: event.targetId,
			tick: state.tick,
			type: "target-destroyed"
		});
	}
	return result;
}
function projectileSetup(building, target, archetype) {
	return { entities: [
		{
			attackRange: archetype.maxRange,
			id: 1,
			kind: "structure",
			layer: "ground",
			maxHealth: archetype.hitpoints,
			position: building.position,
			radius: 0,
			targetMode: archetype.mode,
			targetable: true
		},
		{
			attackRange: 0,
			id: 2,
			kind: target.kind,
			layer: target.layer,
			maxHealth: target.health,
			position: target.position,
			radius: target.radius,
			targetMode: "none",
			targetable: true
		},
		{
			attackRange: 0,
			id: 3,
			kind: "structure",
			layer: "ground",
			maxHealth: 1,
			position: target.position,
			radius: 0,
			targetMode: "air_and_ground",
			targetable: true
		}
	] };
}
function launchProjectile(state, building, target, archetype, amount, sequence, stageIndex) {
	const combat = new ProjectileCombat(projectileSetup(building, target, archetype));
	const canonical = combat.launch({
		attackerId: 1,
		damage: amount,
		radius: PROJECTILE_RADIUS,
		speed: PROJECTILE_SPEED,
		targetId: 2,
		tick: 0
	});
	const projectileId = state.nextProjectileId++;
	state.projectiles.push({
		amount,
		buildingId: building.id,
		combat: combat.serialize(),
		canonicalEvents: combat.replay,
		cancellationInjected: false,
		impactTick: state.tick + canonical.impactTick,
		launchTick: state.tick,
		launchHealth: target.health,
		projectileId,
		sequence,
		stageIndex,
		resolvedTick: null,
		status: "pending",
		targetId: target.id,
		targetPosition: canonical.targetPosition
	});
	state.history.push({
		amount,
		buildingId: building.id,
		impactTick: state.tick + canonical.impactTick,
		projectileId,
		sequence,
		stageIndex,
		targetId: target.id,
		tick: state.tick,
		type: "projectile-launched"
	});
}
function rebuildRampPrimitive(building, command, tick) {
	const commands = building.rampPrimitive === null ? [] : JSON.parse(building.rampPrimitive).identity.commands;
	const primitive = new ConsecutiveTargetRampEncounter(createRampFixture([...commands, command]));
	primitive.stepMany(tick);
	building.rampPrimitive = primitive.serialize();
	building.rampEvents = primitive.replay;
}
function advanceRampPrimitive(building, tick) {
	if (building.rampPrimitive === null) return [];
	const primitive = ConsecutiveTargetRampEncounter.restore(building.rampPrimitive);
	if (primitive.state.tick !== tick) throw new TypeError("building ramp primitive tick is misaligned");
	const events = primitive.step();
	building.rampPrimitive = primitive.serialize();
	building.rampEvents = primitive.replay;
	building.consecutiveHits = primitive.state.consecutiveContacts;
	building.stageIndex = primitive.state.stageIndex;
	return events;
}
function resolveProjectiles(state, commands, rampEvents) {
	for (const flight of state.projectiles) {
		if (flight.status !== "pending") continue;
		const target = state.targets.find(({ id }) => id === flight.targetId);
		const combat = ProjectileCombat.restore(flight.combat);
		const relativeTick = state.tick - flight.launchTick;
		const lethalNextCommand = commands.slice(state.commandIndex).find((command) => command.tick === state.tick + 1 && command.type === "damage-target" && command.targetId === flight.targetId && command.amount >= target.health);
		if (!flight.cancellationInjected && (!target?.alive && relativeTick < flight.impactTick - flight.launchTick || lethalNextCommand !== void 0 && state.tick < flight.impactTick)) {
			combat.launch({
				attackerId: 3,
				damage: flight.launchHealth,
				radius: 0,
				speed: 1,
				targetId: 2,
				tick: combat.state.tick
			});
			flight.cancellationInjected = true;
		}
		if (combat.state.tick !== relativeTick) throw new TypeError("building projectile primitive tick is misaligned");
		const boundaryEvents = combat.step(relativeTick);
		flight.combat = combat.serialize();
		flight.canonicalEvents = combat.replay;
		const canonicalImpact = boundaryEvents.find((event) => event.type === "impact" && event.projectileId === 1);
		if (canonicalImpact === void 0) continue;
		flight.resolvedTick = state.tick;
		flight.status = canonicalImpact.status;
		state.history.push({
			projectileId: flight.projectileId,
			status: canonicalImpact.status,
			targetId: flight.targetId,
			tick: state.tick,
			type: "projectile-impact"
		});
		if (canonicalImpact.status !== "contact") continue;
		const building = state.buildings.find(({ id }) => id === flight.buildingId);
		if (ARCHETYPES$1[building.archetypeId].variant === "splash") resolveAreaDamage(state, building, flight.targetPosition, ARCHETYPES$1[building.archetypeId].areaDamageRadiusMillitiles, flight.amount, ARCHETYPES$1[building.archetypeId].mode);
		else resolveAreaDamage(state, building, target.position, 0, flight.amount, ARCHETYPES$1[building.archetypeId].mode);
		if (ARCHETYPES$1[building.archetypeId].variant === "ramp" && building.targetId === flight.targetId) {
			const canonical = rampEvents.get(building.id)?.find((event) => event.type === "damage" && event.targetId === flight.targetId);
			if (canonical === void 0) throw new TypeError("building ramp primitive did not resolve causally");
			state.history.push({
				buildingId: building.id,
				consecutiveContacts: building.consecutiveHits,
				primitiveAmount: canonical.amount,
				stageIndex: building.stageIndex,
				targetId: flight.targetId,
				tick: state.tick,
				type: "ramp-contact"
			});
		}
	}
}
function applyCommands$1(state, commands) {
	while (state.commandIndex < commands.length && commands[state.commandIndex].tick === state.tick) {
		const command = commands[state.commandIndex++];
		if (command.type === "damage-building") {
			const building = state.buildings.find(({ id }) => id === command.buildingId);
			if (building.alive) {
				building.health = Math.max(0, building.health - command.amount);
				state.history.push({
					amount: command.amount,
					buildingId: building.id,
					tick: state.tick,
					type: "building-damaged"
				});
				if (building.health === 0) destroyBuilding(state, building, "damage");
			}
		} else {
			const target = state.targets.find(({ id }) => id === command.targetId);
			if (command.type === "damage-target" && target.alive) {
				const wasAlive = target.alive;
				resolveAreaDamage(state, { id: 0 }, target.position, 0, command.amount, "air_and_ground", [candidateOf(target)], false);
				if (wasAlive && !target.alive) state.history.push({
					targetId: target.id,
					tick: state.tick,
					type: "target-destroyed"
				});
			} else if (command.type === "move-target") target.position = clone$4(command.position);
			else if (command.type === "hide-target") target.hidden = true;
			else if (command.type === "reveal-target") target.hidden = false;
			state.history.push({
				command: command.type,
				targetId: target.id,
				tick: state.tick,
				type: "command"
			});
		}
	}
}
function advance$2(state, cycles, commands) {
	const historyStart = state.history.length;
	applyCommands$1(state, commands);
	for (const building of state.buildings) if (building.alive && state.tick >= ARCHETYPES$1[building.archetypeId].lifetimeTicks) destroyBuilding(state, building, "lifetime");
	for (const building of state.buildings) {
		if (!building.alive) {
			cycles.get(building.id).step({
				targetEligible: false,
				targetId: null
			});
			continue;
		}
		const archetype = ARCHETYPES$1[building.archetypeId];
		const candidates = eligibleCandidates(building, state.targets, archetype);
		const target = retainOrAcquireTarget({
			position: building.position,
			radius: 0
		}, candidates.map(candidateOf), {
			currentTargetId: building.targetId,
			mode: archetype.mode,
			sightRange: archetype.sightRange
		});
		const priorTarget = building.targetId;
		building.targetId = target?.id ?? null;
		if (archetype.variant === "hidden") setBuildingVisibility(state, building, target !== null);
		if (archetype.variant === "ramp" && priorTarget !== null && priorTarget !== building.targetId) {
			if (building.rampPrimitive !== null) rebuildRampPrimitive(building, {
				targetId: null,
				tick: state.tick,
				type: "target-lost"
			}, state.tick);
			state.history.push({
				buildingId: building.id,
				reason: "target-change-or-loss",
				tick: state.tick,
				type: "ramp-reset"
			});
		}
		const ready = cycles.get(building.id).step({
			targetEligible: target !== null,
			targetId: target?.id ?? null
		});
		for (const event of ready) {
			building.attackSequence = event.sequence;
			const primary = state.targets.find(({ id }) => id === event.targetId);
			if (!primary?.alive) continue;
			if (archetype.variant === "ramp") {
				if ((building.rampPrimitive === null ? null : ConsecutiveTargetRampEncounter.restore(building.rampPrimitive).state.targetId) !== primary.id) rebuildRampPrimitive(building, {
					targetId: primary.id,
					tick: state.tick,
					type: "target-acquired"
				}, state.tick);
			}
			const amount = archetype.stages[building.stageIndex];
			state.history.push({
				amount,
				buildingId: building.id,
				sequence: event.sequence,
				stageIndex: building.stageIndex,
				targetId: primary.id,
				tick: state.tick,
				type: "attack"
			});
			launchProjectile(state, building, primary, archetype, amount, event.sequence, building.stageIndex);
		}
	}
	const rampEvents = /* @__PURE__ */ new Map();
	for (const building of state.buildings) rampEvents.set(building.id, advanceRampPrimitive(building, state.tick));
	resolveProjectiles(state, commands, rampEvents);
	state.tick += 1;
	return clone$4(state.history.slice(historyStart));
}
function createCycles(buildings) {
	return new Map(buildings.map((building) => {
		const value = ARCHETYPES$1[building.archetypeId];
		return [building.id, new AttackCycle({
			deployTicks: value.deployTicks,
			firstHitTicks: value.firstHitTicks,
			hitSpeedTicks: value.hitSpeedTicks
		})];
	}));
}
function createDefensiveBuildingCatalog() {
	return createCardCatalog(CARD_DEFINITIONS$1);
}
/**
* Runtime-facing projection of the already verified defensive reducer data.
*
* This deliberately exposes no encounter state or private reducer. A unified
* session can share one clock, ID stream, target list, and event history while
* preserving the individual building policies that the isolated reducer
* established. Fields whose behaviour is corpus-absent remain labelled as a
* QUESTION policy by the caller; this projection only prevents a second copy
* of the card constants from becoming a competing source of truth.
*/
function createDefensiveBuildingRuntimeProfiles(...args) {
	if (args.length !== 0) throw new TypeError("defensive building runtime profiles do not accept overrides");
	const corpusRecords = createDefensiveBuildingCorpusRecords();
	return deepFreeze$4(Object.fromEntries(Object.entries(ARCHETYPES$1).map(([id, value]) => [id, {
		areaDamageRadiusMillitiles: value.areaDamageRadiusMillitiles,
		damage: value.damage,
		deployTicks: value.deployTicks,
		firstHitTicks: value.firstHitTicks,
		hitSpeedTicks: value.hitSpeedTicks,
		hitpoints: value.hitpoints,
		lifetimeTicks: value.lifetimeTicks,
		maxRangeMillitiles: value.maxRange,
		minRangeMillitiles: value.minRange,
		policy: {
			confidence: "unverified",
			corpusFields: clone$4(corpusRecords[id]),
			disposition: "question",
			source: SOURCE$3
		},
		rampStages: clone$4(value.stages),
		rampThresholds: clone$4(value.thresholds),
		targetMode: value.mode,
		variant: value.variant
	}])));
}
function createDefensiveBuildingCorpusRecords() {
	return Object.fromEntries(Object.entries(ARCHETYPES$1).map(([id, value]) => [id, deepFreeze$4(Object.fromEntries(CORPUS_FIELDS.map((field) => [field, {
		authoritative: field === "cost" || id === "bulwark-needle" && field === "hitSpeedTicks",
		confidence: field === "cost" || id === "bulwark-needle" && field === "hitSpeedTicks" ? "high" : "unverified",
		source: field === "cost" ? "pinned-pre-march-2023-card-roster-identity" : "pinned-pre-march-2023-building-constants",
		value: field === "firstHitTicks" && Object.hasOwn(value, "corpusFirstHitTicks") ? value.corpusFirstHitTicks : value[field]
	}])))]));
}
function createDefensiveBuildingQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("defensive QUESTION records do not accept overrides");
	return deepFreeze$4(Object.fromEntries(Object.entries(QUESTION_VALUES$4).map(([key, value]) => [key, {
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		key,
		source: SOURCE$3,
		value: clone$4(value)
	}])));
}
function createDefensiveBuildingFixture(buildings = [], targets = [], commands = []) {
	return clone$4({
		buildings,
		commands,
		targets
	});
}
var SOURCE$3, FIXTURE$3, MAX_BUILDINGS$3, MAX_TARGETS, MAX_COMMANDS$4, MAX_TICK$4, MAX_STEP_CHUNK$4, MAX_HEALTH$1, MAX_POSITION$1, MAX_RADIUS, MAX_SNAPSHOT_BYTES$4, PROJECTILE_SPEED, PROJECTILE_RADIUS, ARCHETYPES$1, CARD_DEFINITIONS$1, QUESTION_VALUES$4, CORPUS_FIELDS, COMMAND_TYPES$1, DefensiveBuildingEncounter;
function init_buildings_defensive() {
	return (init_buildings_defensive = __esmMin((() => {
		init_deployment();
		init_attack_cycle();
		init_area_damage();
		init_projectile();
		init_targeting();
		init_schema();
		init_special_combat_ramp();
		init_combat_status_invisibility();
		SOURCE$3 = "pre-evolutions-building-corpus-and-unsourced-policy-fixture";
		FIXTURE$3 = "defensive-building-encounter-v1";
		MAX_BUILDINGS$3 = 16;
		MAX_TARGETS = 64;
		MAX_COMMANDS$4 = 256;
		MAX_TICK$4 = 4096;
		MAX_STEP_CHUNK$4 = 4096;
		MAX_HEALTH$1 = 1e6;
		MAX_POSITION$1 = 1e6;
		MAX_RADIUS = 1e5;
		MAX_SNAPSHOT_BYTES$4 = 1048576;
		PROJECTILE_SPEED = 3e3;
		PROJECTILE_RADIUS = 0;
		ARCHETYPES$1 = Object.freeze({
			"bulwark-needle": Object.freeze({
				areaDamageRadiusMillitiles: null,
				corpusFirstHitTicks: null,
				cost: 3,
				damage: 212,
				deployTicks: 60,
				firstHitTicks: 0,
				hitSpeedTicks: 54,
				hitpoints: 824,
				lifetimeTicks: 1800,
				maxRange: 5500,
				minRange: 0,
				mode: "ground",
				rarity: "standard",
				sightRange: 5500,
				stages: Object.freeze([212]),
				thresholds: Object.freeze([0]),
				variant: "plain"
			}),
			"ember-basin": Object.freeze({
				areaDamageRadiusMillitiles: 1e3,
				cost: 4,
				damage: 222,
				deployTicks: 60,
				firstHitTicks: 66,
				hitSpeedTicks: 96,
				hitpoints: 1356,
				lifetimeTicks: 1800,
				maxRange: 6e3,
				minRange: 0,
				mode: "ground",
				rarity: "uncommon",
				sightRange: 6e3,
				stages: Object.freeze([222]),
				thresholds: Object.freeze([0]),
				variant: "splash"
			}),
			"prism-furnace": Object.freeze({
				areaDamageRadiusMillitiles: null,
				cost: 5,
				damage: 42,
				deployTicks: 60,
				firstHitTicks: 72,
				hitSpeedTicks: 24,
				hitpoints: 1749,
				lifetimeTicks: 1800,
				maxRange: 6e3,
				minRange: 0,
				mode: "air_and_ground",
				rarity: "uncommon",
				sightRange: 6e3,
				stages: Object.freeze([
					42,
					84,
					168
				]),
				thresholds: Object.freeze([
					0,
					2,
					4
				]),
				variant: "ramp"
			}),
			"buried-coil": Object.freeze({
				areaDamageRadiusMillitiles: null,
				cost: 4,
				damage: 230,
				deployTicks: 60,
				firstHitTicks: 42,
				hitSpeedTicks: 72,
				hitpoints: 1152,
				lifetimeTicks: 1800,
				maxRange: 5500,
				minRange: 0,
				mode: "air_and_ground",
				rarity: "standard",
				sightRange: 5500,
				stages: Object.freeze([230]),
				thresholds: Object.freeze([0]),
				variant: "hidden"
			}),
			"horizon-caster": Object.freeze({
				areaDamageRadiusMillitiles: null,
				cost: 4,
				damage: 266,
				deployTicks: 210,
				firstHitTicks: 240,
				hitSpeedTicks: 300,
				hitpoints: 1369,
				lifetimeTicks: 1800,
				maxRange: 11500,
				minRange: 3e3,
				mode: "ground",
				rarity: "standard",
				sightRange: 11500,
				stages: Object.freeze([266]),
				thresholds: Object.freeze([0]),
				variant: "siege"
			})
		});
		CARD_DEFINITIONS$1 = Object.entries(ARCHETYPES$1).map(([id, value]) => ({
			areaDamageRadiusMillitiles: null,
			components: [],
			cost: value.cost,
			count: 1,
			damage: value.damage,
			deployTimeTicks: value.deployTicks,
			displayName: {
				"bulwark-needle": "Bulwark Needle",
				"ember-basin": "Ember Basin",
				"prism-furnace": "Prism Furnace",
				"buried-coil": "Buried Coil",
				"horizon-caster": "Horizon Caster"
			}[id],
			firstHitTicks: Object.hasOwn(value, "corpusFirstHitTicks") ? value.corpusFirstHitTicks : value.firstHitTicks,
			hitSpeedTicks: value.hitSpeedTicks,
			hitpoints: value.hitpoints,
			id,
			kind: "structure",
			movementMillitilesPerSecond: 0,
			rangeMillitiles: value.maxRange,
			rarity: value.rarity,
			sightRangeMillitiles: value.sightRange,
			targetMode: value.mode === "air_and_ground" ? "ground-and-air" : value.mode
		}));
		QUESTION_VALUES$4 = Object.freeze({
			attackContactPolicy: "canonical-static-projectile-launch-then-contact",
			attackTimingPolicy: "deploy-then-first-windup-then-fixed-cadence",
			commandOrderingPolicy: "commands-then-lifetime-then-reveal-targeting-then-attack",
			hiddenInitialPolicy: "concealed-and-untargetable-until-an-eligible-target-is-in-sight",
			hiddenReconcealPolicy: "reconceal-on-first-boundary-with-no-eligible-target",
			hiddenRevealAttackBoundary: "reveal-and-begin-windup-on-the-same-integer-boundary",
			lifetimeDestructionBoundary: "alive-before-and-destroyed-at-placement-plus-1800-ticks",
			lifetimeTicks: 1800,
			placementPolicy: "ordinary-ground-entity-mask-at-the-building-center",
			plainFirstHitTicks: 0,
			rampDamageProgression: Object.freeze([
				42,
				84,
				168
			]),
			rampResetPolicy: "target-loss-change-or-death-resets-before-that-boundarys-attack",
			rampSplashCoupling: "ramp-is-single-target-and-splash-does-not-ramp",
			rampStageThresholds: Object.freeze([
				0,
				2,
				4
			]),
			siegeMaximumBoundary: "inclusive-edge-to-edge-11500-millitiles",
			siegeMinimumBoundary: "inclusive-at-3000-millitiles-with-smaller-distances-dead",
			siegeMinimumRangeMillitiles: 3e3,
			splashDamagePolicy: "full-damage-to-each-living-target-in-the-impact-circle",
			splashRadiusBoundary: "inclusive-circle-overlap-at-1000-millitiles",
			splashRadiusMillitiles: 1e3,
			stableDeathOrdering: "ascending-positive-entity-id-after-simultaneous-damage",
			targetModePolicy: "ground-air-and-structure-eligibility-follows-corpus-target-mode",
			targetRetentionPolicy: "retain-while-eligible-and-in-range-otherwise-nearest-then-lowest-id"
		});
		CORPUS_FIELDS = Object.freeze([
			"cost",
			"damage",
			"deployTicks",
			"firstHitTicks",
			"hitSpeedTicks",
			"hitpoints",
			"maxRange",
			"mode",
			"sightRange"
		]);
		COMMAND_TYPES$1 = /* @__PURE__ */ new Set([
			"damage-building",
			"damage-target",
			"hide-target",
			"move-target",
			"reveal-target"
		]);
		DefensiveBuildingEncounter = class DefensiveBuildingEncounter {
			#setup;
			#state;
			#cycles;
			constructor(setup = createDefensiveBuildingFixture()) {
				this.#setup = checkedSetup$4(setup);
				this.#state = initialState$3(this.#setup);
				this.#cycles = createCycles(this.#setup.buildings);
			}
			get state() {
				return clone$4(this.#state);
			}
			get replay() {
				return clone$4(this.#state.history);
			}
			step() {
				return this.stepMany(1);
			}
			stepMany(count) {
				integer$3(count, "defensive step count", 0, MAX_STEP_CHUNK$4);
				if (count > MAX_TICK$4 - this.#state.tick) throw new RangeError("defensive step count exceeds the encounter bound");
				const state = clone$4(this.#state);
				const cycles = new Map([...this.#cycles].map(([id, cycle]) => [id, AttackCycle.restore(cycle.serialize())]));
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...advance$2(state, cycles, this.#setup.commands));
				this.#state = state;
				this.#cycles = cycles;
				return clone$4(events);
			}
			run() {
				return this.stepMany(MAX_TICK$4 - this.#state.tick);
			}
			serialize() {
				const serialized = canonicalJson$4({
					identity: {
						buildings: this.#setup.buildings.map((item) => ({
							archetypeId: item.archetypeId,
							destroyedOpposingLaneTowers: item.destroyedOpposingLaneTowers,
							id: item.id,
							position: item.position,
							side: item.side
						})),
						commands: this.#setup.commands,
						fixture: FIXTURE$3,
						targets: this.#setup.targets.map((item) => ({
							health: item.health,
							id: item.id,
							kind: item.kind,
							layer: item.layer,
							position: item.position,
							radius: item.radius,
							targetable: item.targetable
						}))
					},
					state: this.#state,
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$4) throw new RangeError("defensive snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("defensive snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$4) throw new RangeError("defensive snapshot exceeds its byte bound");
				let value;
				try {
					value = JSON.parse(serialized);
				} catch {
					throw new TypeError("defensive snapshot must be valid JSON");
				}
				if (serialized !== canonicalJson$4(value)) throw new TypeError("defensive snapshot must be canonical JSON");
				const snapshot = exactRecord$4(value, [
					"identity",
					"state",
					"version"
				], "defensive snapshot");
				if (snapshot.version !== 1) throw new TypeError("defensive snapshot version is unsupported");
				const identity = exactRecord$4(snapshot.identity, [
					"buildings",
					"commands",
					"fixture",
					"targets"
				], "defensive snapshot.identity");
				if (identity.fixture !== FIXTURE$3) throw new TypeError("defensive snapshot fixture is invalid");
				const encounter = new DefensiveBuildingEncounter({
					buildings: identity.buildings,
					commands: identity.commands,
					targets: identity.targets
				});
				integer$3(snapshot.state?.tick, "defensive snapshot.state.tick", 0, MAX_TICK$4);
				encounter.stepMany(snapshot.state.tick);
				if (canonicalJson$4(encounter.#state) !== canonicalJson$4(snapshot.state)) throw new TypeError("defensive snapshot state is not a causal execution");
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/buildings-spawner.js
function deepFreeze$3(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze$3(child);
		Object.freeze(value);
	}
	return value;
}
function clone$3(value) {
	return structuredClone(value);
}
function canonicalJson$3(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$3).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$3(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord$3(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$3(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function integer$2(value, minimum, maximum, label) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
	return value;
}
function checkedPoint(value, label) {
	const point = exactRecord$3(value, ["x", "y"], label);
	return {
		x: integer$2(point.x, -1e6, 1e6, `${label}.x`),
		y: integer$2(point.y, -1e6, 1e6, `${label}.y`)
	};
}
function checkedBuildings$2(value) {
	const result = denseArray$3(value, MAX_BUILDINGS$2, "spawner buildings").map((entry, index) => {
		const label = `spawner building ${index}`;
		const item = exactRecord$3(entry, [
			"archetypeId",
			"destroyedOpposingLaneTowers",
			"id",
			"ownerId",
			"position",
			"side"
		], label);
		if (!Object.hasOwn(ARCHETYPES, item.archetypeId)) throw new TypeError(`${label}.archetypeId is invalid`);
		const destroyedOpposingLaneTowers = denseArray$3(item.destroyedOpposingLaneTowers, 2, `${label}.destroyedOpposingLaneTowers`);
		const position = checkedPoint(item.position, `${label}.position`);
		const placement = evaluateDeployment({
			destroyedOpposingLaneTowers,
			placementClass: "ground_entity",
			point: position,
			side: item.side
		});
		if (!placement.legal) throw new TypeError(`${label} placement is illegal: ${placement.reason}`);
		return {
			archetypeId: item.archetypeId,
			destroyedOpposingLaneTowers: clone$3(destroyedOpposingLaneTowers),
			id: integer$2(item.id, 65, Number.MAX_SAFE_INTEGER, `${label}.id`),
			ownerId: integer$2(item.ownerId, 1, Number.MAX_SAFE_INTEGER, `${label}.ownerId`),
			position,
			side: item.side
		};
	}).sort((left, right) => left.id - right.id);
	const ids = /* @__PURE__ */ new Set();
	for (const building of result) {
		if (ids.has(building.id)) throw new TypeError("spawner buildings must have unique IDs");
		ids.add(building.id);
	}
	return result;
}
function checkedCommands$3(value, buildingIds) {
	const result = denseArray$3(value, MAX_COMMANDS$3, "spawner building commands").map((entry, sequence) => {
		const label = `spawner building command ${sequence}`;
		const command = exactRecord$3(entry, [
			"amount",
			"buildingId",
			"sourceId",
			"tick",
			"type"
		], label);
		if (command.type !== "damage-building") throw new TypeError(`${label}.type is invalid`);
		const checked = {
			amount: integer$2(command.amount, 0, Number.MAX_SAFE_INTEGER, `${label}.amount`),
			buildingId: integer$2(command.buildingId, 65, Number.MAX_SAFE_INTEGER, `${label}.buildingId`),
			sequence,
			sourceId: integer$2(command.sourceId, 1, Number.MAX_SAFE_INTEGER, `${label}.sourceId`),
			tick: integer$2(command.tick, 0, 511, `${label}.tick`),
			type: command.type
		};
		if (!buildingIds.has(checked.buildingId)) throw new TypeError(`${label}.buildingId does not exist`);
		return checked;
	}).sort((left, right) => left.tick - right.tick || left.sequence - right.sequence);
	const signatures = /* @__PURE__ */ new Set();
	for (const command of result) {
		const signature = canonicalJson$3({
			amount: command.amount,
			buildingId: command.buildingId,
			sourceId: command.sourceId,
			tick: command.tick,
			type: command.type
		});
		if (signatures.has(signature)) throw new TypeError("spawner building commands must not contain duplicates");
		signatures.add(signature);
	}
	return result.map(({ sequence: _sequence, ...command }) => command);
}
function checkedSetup$3(value) {
	const setup = exactRecord$3(value, ["buildings", "commands"], "spawner setup");
	const buildings = checkedBuildings$2(setup.buildings);
	return {
		buildings,
		commands: checkedCommands$3(setup.commands, new Set(buildings.map(({ id }) => id)))
	};
}
function deathEntity(building) {
	const archetype = ARCHETYPES[building.archetypeId];
	return {
		anchor: clone$3(building.position),
		archetypeId: building.archetypeId,
		children: clone$3(archetype.deathChildren),
		health: archetype.health,
		id: building.id,
		ownerId: building.ownerId,
		periodic: archetype.periodic === null ? null : {
			...clone$3(archetype.periodic),
			lifetimeTicks: archetype.lifetimeTicks + 1
		},
		sourceId: building.id
	};
}
function primitiveCommands(setup) {
	const commands = setup.commands.map((command) => ({
		amount: command.amount,
		cause: "combat-damage",
		sourceId: command.sourceId,
		targetId: command.buildingId,
		tick: command.tick
	}));
	for (const building of setup.buildings) commands.push({
		amount: ARCHETYPES[building.archetypeId].health,
		cause: "combat-damage",
		sourceId: null,
		targetId: building.id,
		tick: ARCHETYPES[building.archetypeId].lifetimeTicks
	});
	return commands.sort((left, right) => left.tick - right.tick);
}
function primitiveSetup(setup) {
	return createDeathSpawnFixture(setup.buildings.map(deathEntity), primitiveCommands(setup));
}
function questionRecord$1(key, value) {
	return deepFreeze$3({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		key,
		source: SOURCE$2,
		value: clone$3(value)
	});
}
function createSpawnerBuildingCorpusRecords() {
	return deepFreeze$3(Object.fromEntries(Object.entries(ARCHETYPES).map(([id, archetype]) => [id, Object.fromEntries(Object.entries(archetype.corpus).map(([field, value]) => [field, {
		authoritative: false,
		confidence: "medium-high-datamine-unverified-value",
		source: "pinned-pre-march-2023-building-constants",
		value
	}]))])));
}
function createSpawnerBuildingQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("spawner building questions do not accept overrides");
	return deepFreeze$3(Object.fromEntries(Object.entries(QUESTION_VALUES$3).map(([key, value]) => [key, questionRecord$1(key, value)])));
}
function createSpawnerBuildingFixture(buildings = [], commands = []) {
	return clone$3(checkedSetup$3({
		buildings,
		commands
	}));
}
var FIXTURE$2, SOURCE$2, MAX_BUILDINGS$2, MAX_COMMANDS$3, MAX_STEP_CHUNK$3, MAX_TICK$3, MAX_SNAPSHOT_BYTES$3, SPAWNER_BUILDING_IDENTITIES, ARCHETYPES, QUESTION_VALUES$3, SpawnerBuildingEncounter;
function init_buildings_spawner() {
	return (init_buildings_spawner = __esmMin((() => {
		init_deployment();
		init_death_spawns();
		FIXTURE$2 = "spawner-building-encounter-v1";
		SOURCE$2 = "spawner-building-corpus-and-unsourced-policy-fixture";
		MAX_BUILDINGS$2 = 8;
		MAX_COMMANDS$3 = 64;
		MAX_STEP_CHUNK$3 = 512;
		MAX_TICK$3 = 512;
		MAX_SNAPSHOT_BYTES$3 = 1048576;
		SPAWNER_BUILDING_IDENTITIES = deepFreeze$3({
			"bramble-cage": {
				displayName: "Bramble Cage",
				id: "bramble-cage"
			},
			"ember-roost": {
				displayName: "Ember Roost",
				id: "ember-roost"
			}
		});
		ARCHETYPES = deepFreeze$3({
			"bramble-cage": {
				corpus: {
					cost: 4,
					deployTicks: 60,
					hitpoints: 742
				},
				deathChildren: [{
					archetypeId: "thorn-runner",
					children: [],
					health: 96,
					periodic: null,
					radius: 90,
					role: "primary"
				}],
				health: 150,
				lifetimeTicks: 18,
				periodic: null
			},
			"ember-roost": {
				corpus: {
					cost: 5,
					deployTicks: 60,
					hitpoints: 848
				},
				deathChildren: [
					{
						archetypeId: "ember-scout",
						children: [],
						health: 30,
						periodic: null,
						radius: 70,
						role: "primary"
					},
					{
						archetypeId: "ember-scout",
						children: [],
						health: 30,
						periodic: null,
						radius: 70,
						role: "secondary"
					},
					{
						archetypeId: "ember-scout",
						children: [],
						health: 30,
						periodic: null,
						radius: 70,
						role: "secondary"
					}
				],
				health: 120,
				lifetimeTicks: 15,
				periodic: {
					cadenceTicks: 4,
					children: [{
						archetypeId: "cinderling",
						children: [],
						health: 20,
						periodic: null,
						radius: 60,
						role: "primary"
					}, {
						archetypeId: "cinderling",
						children: [],
						health: 20,
						periodic: null,
						radius: 60,
						role: "secondary"
					}],
					initialDelayTicks: 3
				}
			}
		});
		QUESTION_VALUES$3 = deepFreeze$3({
			buildingHealthFixture: {
				"bramble-cage": 150,
				"ember-roost": 120
			},
			buildingLifetimeTicks: {
				"bramble-cage": 18,
				"ember-roost": 15
			},
			commandBoundaryOrder: "deployment-is-preflight-only-then-lifetime-command-joins-input-sequence",
			deathBatchCounts: {
				"bramble-cage": 1,
				"ember-roost": 3
			},
			deathBatchOrder: "declared-child-order-is-stable-id-and-formation-order",
			deathOnLifetime: "lifetime-destruction-is-lethal-and-triggers-the-same-death-batch-as-damage",
			destructionAttribution: "input-lethal-source-wins-otherwise-lifetime-has-null-source",
			lifetimePeriodicBoundary: "destruction-precedes-and-cancels-a-periodic-batch-due-at-the-same-boundary",
			periodicBatchCounts: { "ember-roost": 2 },
			periodicCadenceTicks: { "ember-roost": 4 },
			periodicFirstDelayTicks: { "ember-roost": 3 },
			periodicPlacement: "shared-materializer-uses-building-center-anchor-and-declared-child-order",
			stationaryPolicy: "ordinary-ground-deployment-with-no-post-placement-movement"
		});
		SpawnerBuildingEncounter = class SpawnerBuildingEncounter {
			#encounter;
			#setup;
			constructor(setup = createSpawnerBuildingFixture()) {
				this.#setup = checkedSetup$3(setup);
				if (this.#setup.buildings.length === 0) throw new TypeError("spawner setup must contain at least one building");
				this.#encounter = new DeathSpawnEncounter(primitiveSetup(this.#setup));
			}
			get children() {
				return this.#encounter.children;
			}
			get replay() {
				return this.#encounter.replay;
			}
			get state() {
				return {
					buildings: this.#encounter.state.entities.filter(({ id }) => this.#setup.buildings.some((building) => building.id === id)),
					commandIndex: this.#encounter.state.commandIndex,
					history: this.#encounter.replay,
					tick: this.#encounter.state.tick
				};
			}
			step() {
				return this.stepMany(1);
			}
			stepMany(count) {
				integer$2(count, 0, MAX_STEP_CHUNK$3, "spawner building step count");
				return this.#encounter.stepMany(count);
			}
			run() {
				return this.stepMany(MAX_TICK$3 - this.#encounter.state.tick);
			}
			serialize() {
				const serialized = canonicalJson$3({
					identity: {
						fixture: FIXTURE$2,
						setup: this.#setup
					},
					primitiveSnapshotBytes: this.#encounter.serialize(),
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$3) throw new RangeError("spawner building snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("spawner building snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$3) throw new RangeError("spawner building snapshot exceeds its byte bound");
				let raw;
				try {
					raw = JSON.parse(serialized);
				} catch {
					throw new TypeError("spawner building snapshot must be valid JSON");
				}
				if (canonicalJson$3(raw) !== serialized) throw new TypeError("spawner building snapshot must use canonical bytes");
				const snapshot = exactRecord$3(raw, [
					"identity",
					"primitiveSnapshotBytes",
					"version"
				], "spawner building snapshot");
				if (snapshot.version !== 1) throw new TypeError("spawner building snapshot version is unsupported");
				const identity = exactRecord$3(snapshot.identity, ["fixture", "setup"], "spawner building snapshot.identity");
				if (identity.fixture !== FIXTURE$2) throw new TypeError("spawner building snapshot fixture is invalid");
				const setup = checkedSetup$3(identity.setup);
				const restoredPrimitive = DeathSpawnEncounter.restore(snapshot.primitiveSnapshotBytes);
				const encounter = new SpawnerBuildingEncounter(setup);
				encounter.stepMany(restoredPrimitive.state.tick);
				if (encounter.#encounter.serialize() !== snapshot.primitiveSnapshotBytes) throw new TypeError("spawner building snapshot is not a causal primitive execution");
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/buildings-resource.js
function clone$2(value) {
	return JSON.parse(JSON.stringify(value));
}
function deepFreeze$2(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze$2(child);
		Object.freeze(value);
	}
	return value;
}
function canonicalJson$2(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$2).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$2(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord$2(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain data object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$2(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError(`${label} must be a plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const length = descriptors.length?.value;
	if (!Number.isSafeInteger(length) || length < 0 || length > maximum || Reflect.ownKeys(descriptors).length !== length + 1) throw new TypeError(`${label} has an invalid length or shape`);
	return Array.from({ length }, (_, index) => {
		const descriptor = descriptors[String(index)];
		if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}[${index}] must be a data property`);
		return descriptor.value;
	});
}
function integer$1(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
}
function checkedPosition(value, label) {
	const item = exactRecord$2(value, ["x", "y"], label);
	integer$1(item.x, `${label}.x`, -1e6, MAX_POSITION);
	integer$1(item.y, `${label}.y`, -1e6, MAX_POSITION);
	return {
		x: item.x,
		y: item.y
	};
}
function checkedDestroyedTowers(value, label) {
	const towers = denseArray$2(value, 2, label);
	for (const [index, tower] of towers.entries()) if (!["left", "right"].includes(tower)) throw new TypeError(`${label}[${index}] is invalid`);
	if (new Set(towers).size !== towers.length) throw new TypeError(`${label} must not contain duplicates`);
	return towers;
}
function checkedBuildings$1(value) {
	const buildings = denseArray$2(value, MAX_BUILDINGS$1, "resource buildings").map((entry, index) => {
		const item = exactRecord$2(entry, [
			"destroyedOpposingLaneTowers",
			"id",
			"position",
			"side"
		], `resource building ${index}`);
		integer$1(item.id, `resource building ${index}.id`, 1);
		const position = checkedPosition(item.position, `resource building ${index}.position`);
		const destroyedOpposingLaneTowers = checkedDestroyedTowers(item.destroyedOpposingLaneTowers, `resource building ${index}.destroyedOpposingLaneTowers`);
		const placement = evaluateDeployment({
			destroyedOpposingLaneTowers,
			placementClass: "ground_entity",
			point: position,
			side: item.side
		});
		if (!placement.legal) throw new TypeError(`resource building ${index} placement is illegal: ${placement.reason}`);
		return {
			destroyedOpposingLaneTowers,
			id: item.id,
			placement,
			position,
			side: item.side
		};
	}).sort((left, right) => left.id - right.id);
	if (new Set(buildings.map(({ id }) => id)).size !== buildings.length) throw new TypeError("resource buildings must have unique ids");
	return buildings;
}
function checkedStartingResource(value) {
	if (typeof value === "string") {
		const match = ElixirMatch.restore(value);
		if (match.serialize() !== value) throw new TypeError("startingResource must use canonical ElixirMatch bytes");
		if (match.tick > MAX_TICK$2) throw new TypeError("startingResource tick exceeds the encounter bound");
		return value;
	}
	const item = exactRecord$2(value, ["north", "south"], "startingResource");
	integer$1(item.north, "startingResource.north", 0, RESOURCE_RULE.capacity);
	integer$1(item.south, "startingResource.south", 0, RESOURCE_RULE.capacity);
	return new ElixirMatch({ startingElixir: {
		north: item.north,
		south: item.south
	} }).serialize();
}
function checkedCommands$2(value, buildingIds) {
	return denseArray$2(value, MAX_COMMANDS$2, "resource commands").map((entry, sequence) => {
		const item = exactRecord$2(entry, [
			"amount",
			"buildingId",
			"side",
			"tick",
			"type"
		], `resource command ${sequence}`);
		integer$1(item.tick, `resource command ${sequence}.tick`, 0, 17999);
		integer$1(item.amount, `resource command ${sequence}.amount`, 1, 1e6);
		if (!["damage-building", "spend-resource"].includes(item.type)) throw new TypeError(`resource command ${sequence}.type is invalid`);
		if (item.type === "damage-building") {
			integer$1(item.buildingId, `resource command ${sequence}.buildingId`, 1);
			if (!buildingIds.has(item.buildingId) || item.side !== null) throw new TypeError(`resource command ${sequence} has invalid damage fields`);
		} else if (item.buildingId !== null || !["north", "south"].includes(item.side) || item.amount > RESOURCE_RULE.capacity) throw new TypeError(`resource command ${sequence} has invalid spend fields`);
		return {
			amount: item.amount,
			buildingId: item.buildingId,
			sequence,
			side: item.side,
			tick: item.tick,
			type: item.type
		};
	}).sort((left, right) => left.tick - right.tick || left.sequence - right.sequence);
}
function checkedSetup$2(setup) {
	const item = exactRecord$2(setup, [
		"buildings",
		"commands",
		"startingResource"
	], "resource setup");
	const buildings = checkedBuildings$1(item.buildings);
	const startingElixirSnapshotBytes = checkedStartingResource(item.startingResource);
	const startingTick = ElixirMatch.restore(startingElixirSnapshotBytes).tick;
	const commands = checkedCommands$2(item.commands, new Set(buildings.map(({ id }) => id)));
	if (commands.some(({ tick }) => tick < startingTick)) throw new TypeError("resource commands cannot precede the starting ElixirMatch tick");
	return {
		buildings,
		commands,
		startingElixirSnapshotBytes
	};
}
function initialState$2(setup, tick) {
	return {
		buildings: setup.buildings.map((building) => ({
			alive: tick <= RESOURCE_RULE.lifetimeTicks,
			deployed: tick > RESOURCE_RULE.deployTicks,
			health: tick <= RESOURCE_RULE.lifetimeTicks ? RESOURCE_RULE.hitpoints : 0,
			id: building.id,
			placement: clone$2(building.placement),
			position: clone$2(building.position),
			side: building.side
		})),
		commandIndex: 0,
		history: [],
		tick
	};
}
function destroy$1(state, building, reason) {
	building.alive = false;
	building.health = 0;
	return {
		buildingId: building.id,
		reason,
		tick: state.tick,
		type: "building-destroyed"
	};
}
function applyDamageCommands(state, commands) {
	const eventsBySequence = /* @__PURE__ */ new Map();
	const spendCommands = [];
	while (state.commandIndex < commands.length && commands[state.commandIndex].tick === state.tick) {
		const command = commands[state.commandIndex++];
		if (command.type === "damage-building") {
			const building = state.buildings.find(({ id }) => id === command.buildingId);
			const applied = building.alive ? Math.min(building.health, command.amount) : 0;
			if (building.alive) building.health -= applied;
			const events = [{
				amountApplied: applied,
				amountRequested: command.amount,
				buildingId: command.buildingId,
				sequence: command.sequence,
				tick: state.tick,
				type: "building-damaged"
			}];
			if (building.alive && building.health === 0) events.push(destroy$1(state, building, "damage"));
			eventsBySequence.set(command.sequence, events);
		} else spendCommands.push(command);
	}
	return {
		eventsBySequence,
		spendCommands
	};
}
function advance$1(state, commands, elixir) {
	const historyStart = state.history.length;
	const { eventsBySequence, spendCommands } = applyDamageCommands(state, commands);
	const lifecycleEvents = [];
	for (const building of state.buildings) if (building.alive && state.tick >= RESOURCE_RULE.lifetimeTicks) lifecycleEvents.push(destroy$1(state, building, "lifetime"));
	for (const building of state.buildings) if (building.alive && !building.deployed && state.tick >= RESOURCE_RULE.deployTicks) {
		building.deployed = true;
		lifecycleEvents.push({
			buildingId: building.id,
			side: building.side,
			tick: state.tick,
			type: "building-deployed"
		});
	}
	const grants = [];
	for (const building of state.buildings) {
		if (!building.alive || !building.deployed || state.tick === 0 || state.tick % RESOURCE_RULE.cadenceTicks !== 0) continue;
		grants.push({
			amount: RESOURCE_RULE.amount,
			side: building.side,
			sourceId: building.id
		});
	}
	const elixirEvents = elixir.step({ grants });
	const spendEvents = elixirEvents.filter(({ type }) => type === "spend");
	if (spendEvents.length !== spendCommands.length) throw new Error("canonical elixir spend count diverged");
	for (const [index, command] of spendCommands.entries()) {
		const event = spendEvents[index];
		eventsBySequence.set(command.sequence, [{
			accepted: event.accepted,
			amountAfter: event.amountAfter,
			amountRequested: event.cost,
			reason: event.reason === "insufficient_elixir" ? "insufficient_resource" : event.reason,
			sequence: command.sequence,
			side: event.side,
			tick: event.tick,
			type: "resource-spent"
		}]);
	}
	const firstSequence = state.commandIndex - eventsBySequence.size;
	for (let sequence = firstSequence; sequence < state.commandIndex; sequence += 1) state.history.push(...eventsBySequence.get(sequence));
	state.history.push(...lifecycleEvents);
	for (const event of elixirEvents) if (event.type === "generated") state.history.push({
		amountAfter: event.amountAfter,
		side: event.side,
		tick: event.tick,
		type: "elixir-generated"
	});
	else if (event.type === "grant") state.history.push({
		amountAfter: event.amountAfter,
		amountGranted: event.amountGranted,
		amountRequested: event.amountRequested,
		buildingId: event.sourceId,
		side: event.side,
		tick: event.tick,
		type: "resource-generated"
	});
	state.tick = elixir.tick;
	if (state.history.length > MAX_EVENTS$2) throw new RangeError("resource event history exceeds its bound");
	return clone$2(state.history.slice(historyStart));
}
function createResourceBuildingCatalog() {
	return createCardCatalog([CARD]);
}
function createResourceBuildingCorpusRecords() {
	return deepFreeze$2({ "aether-well": {
		cost: {
			authoritative: true,
			confidence: "high",
			source: "pinned-pre-march-2023-roster",
			value: 6
		},
		deployTicks: {
			authoritative: false,
			confidence: "unverified",
			source: "pinned-pre-march-2023-building-constants",
			value: RESOURCE_RULE.deployTicks
		},
		hitpoints: {
			authoritative: false,
			confidence: "unverified",
			source: "pinned-pre-march-2023-building-constants",
			value: RESOURCE_RULE.hitpoints
		}
	} });
}
function createResourceBuildingQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("resource-building QUESTION records do not accept overrides");
	return deepFreeze$2(Object.fromEntries(Object.entries(QUESTION_VALUES$2).map(([key, value]) => [key, {
		authoritative: false,
		confidence: "absent",
		disposition: "question",
		key,
		source: SOURCE$1,
		value: clone$2(value)
	}])));
}
function createResourceBuildingFixture(buildings = [], commands = [], startingResource = {
	north: 0,
	south: 0
}) {
	return clone$2({
		buildings,
		commands,
		startingResource: startingResource instanceof ElixirMatch ? startingResource.serialize() : startingResource
	});
}
var FIXTURE$1, SOURCE$1, MAX_BUILDINGS$1, MAX_COMMANDS$2, MAX_EVENTS$2, MAX_TICK$2, MAX_STEP_CHUNK$2, MAX_POSITION, MAX_SNAPSHOT_BYTES$2, RESOURCE_RULE, QUESTION_VALUES$2, CARD, ResourceBuildingEncounter;
function init_buildings_resource() {
	return (init_buildings_resource = __esmMin((() => {
		init_deployment();
		init_elixir();
		init_schema();
		FIXTURE$1 = "resource-building-encounter-v1";
		SOURCE$1 = "pre-evolutions-building-corpus-and-absent-resource-policy";
		MAX_BUILDINGS$1 = 16;
		MAX_COMMANDS$2 = 2048;
		MAX_EVENTS$2 = 1e4;
		MAX_TICK$2 = 18e3;
		MAX_STEP_CHUNK$2 = 18e3;
		MAX_POSITION = 1e6;
		MAX_SNAPSHOT_BYTES$2 = 1048576;
		RESOURCE_RULE = Object.freeze({
			amount: 1,
			cadenceTicks: 510,
			capacity: ELIXIR_CAPACITY,
			deployTicks: 60,
			hitpoints: 1070,
			lifetimeTicks: 4200
		});
		QUESTION_VALUES$2 = Object.freeze({
			commandOrderingPolicy: "same-tick commands resolve in input order before lifetime, deployment, and generation",
			deploymentBoundary: "placed at tick zero, deployed at tick 60, and unable to generate before deployment",
			generationAmount: RESOURCE_RULE.amount,
			generationCadenceTicks: RESOURCE_RULE.cadenceTicks,
			generationFirstBoundary: "the first pulse is one cadence after placement, at tick 510",
			generationWhileCapped: "a pulse at capacity is retained in replay with zero granted resource",
			lifetimeDestructionBoundary: "alive before tick 4200 and destroyed before generation at tick 4200",
			lifetimeTicks: RESOURCE_RULE.lifetimeTicks,
			ownershipPolicy: "each living building grants only to the side that deployed that building",
			placementPolicy: "ordinary ground-entity deployment mask at the building center",
			resourceCapacity: RESOURCE_RULE.capacity,
			simultaneousGenerationOrder: "resource buildings resolve by ascending positive building id"
		});
		CARD = Object.freeze({
			areaDamageRadiusMillitiles: null,
			components: [],
			cost: 6,
			count: 1,
			damage: null,
			deployTimeTicks: RESOURCE_RULE.deployTicks,
			displayName: "Aether Well",
			firstHitTicks: null,
			hitSpeedTicks: null,
			hitpoints: RESOURCE_RULE.hitpoints,
			id: "aether-well",
			kind: "structure",
			movementMillitilesPerSecond: 0,
			rangeMillitiles: null,
			rarity: "uncommon",
			sightRangeMillitiles: null,
			targetMode: "none"
		});
		ResourceBuildingEncounter = class ResourceBuildingEncounter {
			#elixir;
			#setup;
			#state;
			constructor(setup = createResourceBuildingFixture()) {
				this.#setup = checkedSetup$2(setup);
				this.#elixir = ElixirMatch.restore(this.#setup.startingElixirSnapshotBytes);
				this.#state = initialState$2(this.#setup, this.#elixir.tick);
				for (const command of this.#setup.commands) if (command.type === "spend-resource") this.#elixir.scheduleSpend(command.tick, command.side, command.amount);
			}
			get state() {
				return clone$2({
					...this.#state,
					elixir: this.#elixir.state
				});
			}
			get replay() {
				return clone$2(this.#state.history);
			}
			replayBytes() {
				return canonicalJson$2(this.#state.history);
			}
			step() {
				return this.stepMany(1);
			}
			stepMany(count) {
				integer$1(count, "resource step count", 0, MAX_STEP_CHUNK$2);
				if (count > MAX_TICK$2 - this.#state.tick) throw new RangeError("resource step count exceeds the encounter bound");
				const state = clone$2(this.#state);
				const elixir = ElixirMatch.restore(this.#elixir.serialize());
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...advance$1(state, this.#setup.commands, elixir));
				this.#state = state;
				this.#elixir = elixir;
				return clone$2(events);
			}
			run() {
				return this.stepMany(MAX_TICK$2 - this.#state.tick);
			}
			serialize() {
				const serialized = canonicalJson$2({
					elixirSnapshotBytes: this.#elixir.serialize(),
					identity: {
						fixture: FIXTURE$1,
						setup: {
							buildings: this.#setup.buildings.map((building) => ({
								destroyedOpposingLaneTowers: clone$2(building.destroyedOpposingLaneTowers),
								id: building.id,
								position: clone$2(building.position),
								side: building.side
							})),
							commands: [...this.#setup.commands].sort((left, right) => left.sequence - right.sequence).map(({ sequence: _sequence, ...command }) => command),
							startingResource: this.#setup.startingElixirSnapshotBytes
						}
					},
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$2) throw new RangeError("resource snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("resource snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$2) throw new RangeError("resource snapshot exceeds its byte bound");
				let value;
				try {
					value = JSON.parse(serialized);
				} catch {
					throw new TypeError("resource snapshot must be valid JSON");
				}
				if (serialized !== canonicalJson$2(value)) throw new TypeError("resource snapshot must be canonical JSON");
				const snapshot = exactRecord$2(value, [
					"elixirSnapshotBytes",
					"identity",
					"version"
				], "resource snapshot");
				if (snapshot.version !== 1) throw new TypeError("resource snapshot identity or version is invalid");
				const identity = exactRecord$2(snapshot.identity, ["fixture", "setup"], "resource snapshot.identity");
				if (identity.fixture !== FIXTURE$1) throw new TypeError("resource snapshot identity or version is invalid");
				const canonicalElixir = ElixirMatch.restore(snapshot.elixirSnapshotBytes);
				integer$1(canonicalElixir.tick, "resource snapshot.tick", 0, MAX_TICK$2);
				const encounter = new ResourceBuildingEncounter(identity.setup);
				encounter.stepMany(canonicalElixir.tick - encounter.#state.tick);
				if (encounter.#elixir.serialize() !== snapshot.elixirSnapshotBytes) throw new TypeError("resource snapshot is not a causal canonical elixir execution");
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/buildings-travel.js
function clone$1(value) {
	return JSON.parse(JSON.stringify(value));
}
function deepFreeze$1(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze$1(child);
		Object.freeze(value);
	}
	return value;
}
function canonicalJson$1(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$1).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$1(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord$1(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$1(value, label, maximum) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function integer(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
	return value;
}
function point(value, label) {
	const checked = exactRecord$1(value, ["x", "y"], label);
	integer(checked.x, `${label}.x`, -1e6, 1e6);
	integer(checked.y, `${label}.y`, -1e6, 1e6);
	return {
		x: checked.x,
		y: checked.y
	};
}
function checkedBuildings(value) {
	const buildings = denseArray$1(value, "travel buildings", MAX_BUILDINGS).map((entry, index) => {
		const label = `travel building ${index}`;
		const item = exactRecord$1(entry, BUILDING_KEYS, label);
		const id = integer(item.id, `${label}.id`, 1);
		const ownerId = integer(item.ownerId, `${label}.ownerId`, 1, MAX_OWNER_ID);
		const origin = point(item.origin, `${label}.origin`);
		const destination = point(item.destination, `${label}.destination`);
		const lanes = denseArray$1(item.destroyedOpposingLaneTowers, `${label}.destroyedOpposingLaneTowers`, 2);
		const placement = evaluateDeployment({
			destroyedOpposingLaneTowers: lanes,
			placementClass: "ground_entity",
			point: origin,
			side: item.side
		});
		if (!placement.legal) throw new TypeError(`${label} origin is illegal: ${placement.reason}`);
		const path = findGroundPath(origin, destination);
		if (path === null) throw new TypeError(`${label} destination has no ground path`);
		return {
			destination,
			destroyedOpposingLaneTowers: clone$1(lanes),
			id,
			origin,
			ownerId,
			path,
			placement,
			side: item.side
		};
	}).sort((a, b) => a.id - b.id);
	const ids = /* @__PURE__ */ new Set();
	for (const building of buildings) {
		if (ids.has(building.id)) throw new TypeError("travel building IDs must be unique");
		ids.add(building.id);
	}
	return buildings;
}
function checkedCommands$1(value, buildings) {
	const buildingIds = new Set(buildings.map(({ id }) => id));
	const commands = denseArray$1(value, "travel building commands", MAX_COMMANDS$1).map((entry, index) => {
		const label = `travel building command ${index}`;
		const item = exactRecord$1(entry, COMMAND_KEYS$1, label);
		if (!COMMAND_TYPES.has(item.type)) throw new TypeError(`${label}.type is invalid`);
		const command = {
			amount: item.amount,
			buildingId: integer(item.buildingId, `${label}.buildingId`, 1),
			id: integer(item.id, `${label}.id`, 1),
			tick: integer(item.tick, `${label}.tick`, 0, 4095),
			type: item.type
		};
		if (!buildingIds.has(command.buildingId)) throw new TypeError(`${label}.buildingId is unknown`);
		if (command.type === "damage-building") command.amount = integer(item.amount, `${label}.amount`, 1, MAX_HEALTH);
		else if (item.amount !== null) throw new TypeError(`${label}.amount must be null`);
		return command;
	});
	const ids = /* @__PURE__ */ new Set();
	let priorTick = -1;
	let priorId = -1;
	for (const command of commands) {
		if (ids.has(command.id)) throw new TypeError("travel command IDs must be unique");
		ids.add(command.id);
		if (command.tick < priorTick || command.tick === priorTick && command.id <= priorId) throw new TypeError("travel commands must use increasing tick and command-ID order");
		priorTick = command.tick;
		priorId = command.id;
	}
	return commands;
}
function checkedSetup$1(value) {
	const setup = exactRecord$1(value, ["buildings", "commands"], "travel building setup");
	const buildings = checkedBuildings(setup.buildings);
	return {
		buildings,
		commands: checkedCommands$1(setup.commands, buildings)
	};
}
function segmentState(path, index) {
	if (index >= path.length - 1) return serializeMovementState(createMovementState());
	return serializeMovementState(createMovementState({
		direction: 1,
		speed: ARCHETYPE.speed
	}));
}
function initialState$1(setup) {
	return {
		buildings: setup.buildings.map((item) => ({
			alive: true,
			archetypeId: "burrow-rig",
			destination: clone$1(item.destination),
			emergedTick: null,
			health: ARCHETYPE.hitpoints,
			id: item.id,
			movementPrimitive: segmentState(item.path, 0),
			nextSpawnTick: null,
			ownerId: item.ownerId,
			path: clone$1(item.path),
			pathIndex: 0,
			phase: "deploying",
			placement: clone$1(item.placement),
			position: clone$1(item.origin),
			spawnCount: 0,
			targetable: false,
			travelStartedTick: null
		})),
		commandIndex: 0,
		history: [],
		tick: 0
	};
}
function destroy(state, building, reason, events) {
	if (!building.alive) return;
	building.alive = false;
	building.health = 0;
	building.phase = "dead";
	building.targetable = false;
	building.nextSpawnTick = null;
	events.push({
		buildingId: building.id,
		reason,
		tick: state.tick,
		type: "travel-building-destroyed"
	});
}
function applyCommands(state, commands, events) {
	while (commands[state.commandIndex]?.tick === state.tick) {
		const command = commands[state.commandIndex++];
		const building = state.buildings.find(({ id }) => id === command.buildingId);
		if (!building.alive) continue;
		if (command.type === "damage-building") {
			if (!building.targetable) {
				events.push({
					amount: command.amount,
					buildingId: building.id,
					reason: "untargetable",
					tick: state.tick,
					type: "travel-damage-ignored"
				});
				continue;
			}
			building.health = Math.max(0, building.health - command.amount);
			events.push({
				amount: command.amount,
				buildingId: building.id,
				healthAfter: building.health,
				tick: state.tick,
				type: "travel-building-damaged"
			});
			if (building.health === 0) destroy(state, building, "damage", events);
			continue;
		}
		if (command.type === "interrupt-travel") {
			if (building.phase === "deploying" || building.phase === "underground") destroy(state, building, "interrupted", events);
			continue;
		}
		destroy(state, building, "forced-death", events);
	}
}
function startTravel(state, building, events) {
	building.phase = "underground";
	building.travelStartedTick = state.tick;
	events.push({
		buildingId: building.id,
		destination: clone$1(building.destination),
		path: clone$1(building.path),
		tick: state.tick,
		type: "underground-travel-started"
	});
	if (building.path.length === 1) emerge(state, building, events);
}
function emerge(state, building, events) {
	building.phase = "emerged";
	building.position = clone$1(building.destination);
	building.targetable = true;
	building.emergedTick = state.tick;
	building.nextSpawnTick = state.tick + ARCHETYPE.firstSpawnDelayTicks;
	building.movementPrimitive = serializeMovementState(createMovementState());
	events.push({
		buildingId: building.id,
		position: clone$1(building.position),
		tick: state.tick,
		type: "travel-building-emerged"
	});
}
function moveUnderground(state, building, events) {
	const from = building.path[building.pathIndex];
	const to = building.path[building.pathIndex + 1];
	const segmentLength = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
	const primitive = advanceMovement(restoreMovementState(building.movementPrimitive), 1);
	const progress = Math.min(segmentLength, primitive.position);
	building.position = {
		x: from.x + Math.sign(to.x - from.x) * progress,
		y: from.y + Math.sign(to.y - from.y) * progress
	};
	events.push({
		buildingId: building.id,
		pathIndex: building.pathIndex,
		position: clone$1(building.position),
		tick: state.tick,
		type: "underground-travel-moved"
	});
	if (primitive.position < segmentLength) {
		building.movementPrimitive = serializeMovementState(primitive);
		return;
	}
	building.pathIndex += 1;
	building.movementPrimitive = segmentState(building.path, building.pathIndex);
	if (building.pathIndex === building.path.length - 1) emerge(state, building, events);
}
function advance(state, setup) {
	if (state.tick >= MAX_TICK$1) return [];
	const events = [];
	applyCommands(state, setup.commands, events);
	for (const building of state.buildings) {
		if (!building.alive) continue;
		if (building.phase === "deploying" && state.tick === ARCHETYPE.deployTicks) {
			startTravel(state, building, events);
			continue;
		}
		if (building.phase === "underground") {
			moveUnderground(state, building, events);
			continue;
		}
		if (building.phase !== "emerged") continue;
		if (state.tick === building.nextSpawnTick) {
			building.spawnCount += 1;
			building.nextSpawnTick = null;
			events.push({
				buildingId: building.id,
				ownerId: building.ownerId,
				position: clone$1(building.position),
				spawnId: `${building.id}:${building.spawnCount}`,
				tick: state.tick,
				type: "travel-emergence-spawn"
			});
		}
		if (state.tick === building.emergedTick + ARCHETYPE.lifetimeTicks) destroy(state, building, "lifetime", events);
	}
	if (state.history.length + events.length > MAX_EVENTS$1) throw new RangeError("travel building replay exceeds its event bound");
	state.history.push(...clone$1(events));
	state.tick += 1;
	return events;
}
function questionRecord(key, value) {
	return deepFreeze$1({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		key,
		source: SOURCE,
		value: clone$1(value)
	});
}
function createUndergroundTravelBuildingCatalog(...args) {
	if (args.length !== 0) throw new TypeError("travel building catalog does not accept overrides");
	return createCardCatalog(clone$1(CARD_DEFINITIONS));
}
function createUndergroundTravelBuildingCorpusRecords(...args) {
	if (args.length !== 0) throw new TypeError("travel building corpus does not accept overrides");
	return deepFreeze$1(Object.fromEntries(Object.entries(CORPUS_VALUES).map(([key, value]) => [key, {
		authoritative: false,
		confidence: "unverified",
		source: "pinned-pre-march-2023-building-constants",
		value
	}])));
}
function createUndergroundTravelBuildingQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("travel building questions do not accept overrides");
	return deepFreeze$1(Object.fromEntries(Object.entries(QUESTION_VALUES$1).map(([key, value]) => [key, questionRecord(key, value)])));
}
function createUndergroundTravelBuildingFixture(buildings = [], commands = []) {
	checkedSetup$1({
		buildings,
		commands
	});
	return clone$1({
		buildings,
		commands
	});
}
var SOURCE, FIXTURE, MAX_BUILDINGS, MAX_COMMANDS$1, MAX_EVENTS$1, MAX_HEALTH, MAX_OWNER_ID, MAX_SNAPSHOT_BYTES$1, MAX_STEP_CHUNK$1, MAX_TICK$1, ARCHETYPE, QUESTION_VALUES$1, CORPUS_VALUES, CARD_DEFINITIONS, BUILDING_KEYS, COMMAND_KEYS$1, COMMAND_TYPES, UndergroundTravelBuildingEncounter;
function init_buildings_travel() {
	return (init_buildings_travel = __esmMin((() => {
		init_deployment();
		init_movement();
		init_pathfinding();
		init_schema();
		SOURCE = "pre-evolutions-building-corpus-and-unsourced-travel-policy";
		FIXTURE = "underground-travel-building-encounter-v1";
		MAX_BUILDINGS = 16;
		MAX_COMMANDS$1 = 256;
		MAX_EVENTS$1 = 4096;
		MAX_HEALTH = 1e6;
		MAX_OWNER_ID = 1e6;
		MAX_SNAPSHOT_BYTES$1 = 1048576;
		MAX_STEP_CHUNK$1 = 4096;
		MAX_TICK$1 = 4096;
		ARCHETYPE = Object.freeze({
			cost: 4,
			deployTicks: 60,
			firstSpawnDelayTicks: 12,
			hitpoints: 1440,
			lifetimeTicks: 1800,
			speed: MOVEMENT_SPEEDS.fast
		});
		QUESTION_VALUES$1 = Object.freeze({
			commandBoundaryOrder: "commands-by-command-id-then-deployment-then-travel-then-emergence-then-spawn-then-lifetime",
			deploymentCompletionBoundary: "underground-travel-starts-at-placement-plus-60-ticks-without-distance-on-that-boundary",
			destinationPlacementPolicy: "any-clear-coarse-ground-navigation-node-in-the-playfield",
			emergenceBoundary: "emerge-on-the-first-boundary-that-completes-the-final-path-segment",
			emergenceSpawnDelayTicks: 12,
			emergenceSpawnPolicy: "one-owned-ground-unit-at-the-destination-12-ticks-after-emergence",
			interruptionPolicy: "explicit-interruption-destroys-deploying-or-traveling-building-without-emergence-or-spawn",
			lifetimeBoundary: "emerged-building-dies-at-emergence-plus-1800-ticks",
			lifetimeTicks: 1800,
			ordinaryDamageWhileUntargetable: "ordinary-damage-commands-are-ignored-before-emergence",
			pathPolicy: "passed-coarse-ground-shortest-path-with-its-stable-west-first-tie-break",
			sameBoundaryDeathPolicy: "command-phase-lethal-damage-or-death-prevents-that-boundarys-emergence-spawn-or-lifetime-work",
			travelSpeedMillitilesPerSecond: MOVEMENT_SPEEDS.fast,
			undergroundTargetabilityPolicy: "deploying-and-underground-buildings-are-untargetable-emerged-buildings-are-targetable"
		});
		CORPUS_VALUES = Object.freeze({
			cost: ARCHETYPE.cost,
			deployTicks: ARCHETYPE.deployTicks,
			firstSpawnDelayTicks: ARCHETYPE.firstSpawnDelayTicks,
			hitpoints: ARCHETYPE.hitpoints
		});
		CARD_DEFINITIONS = Object.freeze([Object.freeze({
			areaDamageRadiusMillitiles: null,
			components: [],
			cost: ARCHETYPE.cost,
			count: 1,
			damage: null,
			deployTimeTicks: ARCHETYPE.deployTicks,
			displayName: "Burrow Rig",
			firstHitTicks: ARCHETYPE.firstSpawnDelayTicks,
			hitSpeedTicks: 66,
			hitpoints: ARCHETYPE.hitpoints,
			id: "burrow-rig",
			kind: "structure",
			movementMillitilesPerSecond: 0,
			rangeMillitiles: 2e3,
			rarity: "mythic",
			sightRangeMillitiles: 2e3,
			targetMode: "ground"
		})]);
		BUILDING_KEYS = Object.freeze([
			"destination",
			"destroyedOpposingLaneTowers",
			"id",
			"origin",
			"ownerId",
			"side"
		]);
		COMMAND_KEYS$1 = Object.freeze([
			"amount",
			"buildingId",
			"id",
			"tick",
			"type"
		]);
		COMMAND_TYPES = /* @__PURE__ */ new Set([
			"damage-building",
			"interrupt-travel",
			"kill-building"
		]);
		UndergroundTravelBuildingEncounter = class UndergroundTravelBuildingEncounter {
			#setup;
			#state;
			constructor(setup = createUndergroundTravelBuildingFixture()) {
				this.#setup = checkedSetup$1(setup);
				this.#state = initialState$1(this.#setup);
			}
			get replay() {
				return clone$1(this.#state.history);
			}
			get state() {
				return clone$1(this.#state);
			}
			step() {
				return this.stepMany(1);
			}
			stepMany(count) {
				integer(count, "travel building step count", 0, MAX_STEP_CHUNK$1);
				if (count > MAX_TICK$1 - this.#state.tick) throw new RangeError("travel building step count exceeds encounter bound");
				const candidate = clone$1(this.#state);
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...advance(candidate, this.#setup));
				this.#state = candidate;
				return clone$1(events);
			}
			run() {
				return this.stepMany(MAX_TICK$1 - this.#state.tick);
			}
			serialize() {
				const serialized = canonicalJson$1({
					identity: {
						buildings: this.#setup.buildings.map((building) => ({
							destination: building.destination,
							destroyedOpposingLaneTowers: building.destroyedOpposingLaneTowers,
							id: building.id,
							origin: building.origin,
							ownerId: building.ownerId,
							side: building.side
						})),
						commands: this.#setup.commands,
						fixture: FIXTURE
					},
					state: this.#state,
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$1) throw new RangeError("travel building snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("travel building snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$1) throw new RangeError("travel building snapshot exceeds its byte bound");
				let value;
				try {
					value = JSON.parse(serialized);
				} catch {
					throw new TypeError("travel building snapshot must be valid JSON");
				}
				if (canonicalJson$1(value) !== serialized) throw new TypeError("travel building snapshot must be canonical duplicate-free JSON");
				const snapshot = exactRecord$1(value, [
					"identity",
					"state",
					"version"
				], "travel building snapshot");
				if (snapshot.version !== 1) throw new TypeError("travel building snapshot version is unsupported");
				const identity = exactRecord$1(snapshot.identity, [
					"buildings",
					"commands",
					"fixture"
				], "travel building snapshot.identity");
				if (identity.fixture !== FIXTURE) throw new TypeError("travel building snapshot fixture is invalid");
				integer(snapshot.state?.tick, "travel building snapshot.state.tick", 0, MAX_TICK$1);
				const encounter = new UndergroundTravelBuildingEncounter({
					buildings: identity.buildings,
					commands: identity.commands
				});
				encounter.stepMany(snapshot.state.tick);
				if (canonicalJson$1(encounter.#state) !== canonicalJson$1(snapshot.state)) throw new TypeError("travel building snapshot state is not a causal execution");
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/periodic-spawns.js
function deepFreeze(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze(child);
		Object.freeze(value);
	}
	return value;
}
function clone(value) {
	return structuredClone(value);
}
function canonicalJson(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	if (Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must contain only string-keyed data`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray(value, label, maximum) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain only dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function safeInteger(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
	return value;
}
function checkedCommands(value) {
	const commands = denseArray(value, "periodic spawn commands", MAX_COMMANDS).map((entry, index) => {
		const command = exactRecord(entry, COMMAND_KEYS, `periodic spawn command ${index}`);
		safeInteger(command.tick, `periodic spawn command ${index}.tick`, 0, 4095);
		if (command.type !== "lethal") throw new TypeError(`periodic spawn command ${index}.type is invalid`);
		return {
			tick: command.tick,
			type: command.type
		};
	});
	let previousTick = -1;
	for (const command of commands) {
		if (command.tick <= previousTick) throw new TypeError("periodic spawn commands must have unique increasing ticks");
		previousTick = command.tick;
	}
	return commands;
}
function checkedSetup(value) {
	return { commands: checkedCommands(exactRecord(value, SETUP_KEYS, "periodic spawn setup").commands) };
}
function checkedAnchor(value, label) {
	const anchor = exactRecord(value, ["x", "y"], label);
	safeInteger(anchor.x, `${label}.x`, -1e6, 1e6);
	safeInteger(anchor.y, `${label}.y`, -1e6, 1e6);
	return anchor;
}
function checkedSource(value, label) {
	const source = exactRecord(value, SOURCE_KEYS, label);
	const anchor = checkedAnchor(source.anchor, `${label}.anchor`);
	const children = denseArray(source.children, `${label}.children`, 15).map((entry, index) => {
		const child = exactRecord(entry, CHILD_KEYS, `${label}.children[${index}]`);
		if (typeof child.archetypeId !== "string" || child.archetypeId.length < 1 || child.archetypeId.length > 128 || !child.archetypeId.isWellFormed()) throw new TypeError(`${label}.children[${index}].archetypeId is invalid`);
		safeInteger(child.radius, `${label}.children[${index}].radius`, 0, 1e6);
		if (child.role !== "primary" && child.role !== "secondary") throw new TypeError(`${label}.children[${index}].role is invalid`);
		return child;
	});
	if (children.length !== QUESTION_VALUES.childCountPerBatch) throw new TypeError(`${label}.children disagrees with the fixture count`);
	safeInteger(source.ownerId, `${label}.ownerId`, 1);
	safeInteger(source.sourceId, `${label}.sourceId`, 1);
	return {
		anchor,
		children,
		ownerId: source.ownerId,
		sourceId: source.sourceId
	};
}
function checkedSchedule(value, label) {
	const schedule = exactRecord(value, SCHEDULE_KEYS, label);
	for (const key of SCHEDULE_KEYS) safeInteger(schedule[key], `${label}.${key}`, 1, MAX_TICK);
	return schedule;
}
function checkedEvent(value, index) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`periodic spawn history event ${index} is invalid`);
	const descriptor = Object.getOwnPropertyDescriptor(value, "type");
	if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`periodic spawn history event ${index}.type must be data`);
	const keys = EVENT_KEYS[descriptor.value];
	if (keys === void 0) throw new TypeError(`periodic spawn history event ${index}.type is invalid`);
	const event = exactRecord(value, keys, `periodic spawn history event ${index}`);
	safeInteger(event.tick, `periodic spawn history event ${index}.tick`, 0, 4095);
	safeInteger(event.sourceId, `periodic spawn history event ${index}.sourceId`, 1);
	if (event.type === "spawn-batch") {
		checkedAnchor(event.anchor, `periodic spawn history event ${index}.anchor`);
		safeInteger(event.batchIndex, `periodic spawn history event ${index}.batchIndex`, 0, MAX_EVENTS);
		safeInteger(event.ownerId, `periodic spawn history event ${index}.ownerId`, 1);
		const childIds = denseArray(event.childIds, `periodic spawn history event ${index}.childIds`, 15);
		if (childIds.length !== QUESTION_VALUES.childCountPerBatch) throw new TypeError(`periodic spawn history event ${index}.childIds has invalid count`);
		for (let childIndex = 0; childIndex < childIds.length; childIndex += 1) safeInteger(childIds[childIndex], `periodic spawn history event ${index}.childIds[${childIndex}]`, 1);
		return {
			...event,
			anchor: clone(event.anchor),
			childIds: [...childIds]
		};
	}
	return event;
}
function initialState() {
	return {
		alive: true,
		batchCount: 0,
		commandIndex: 0,
		endReason: null,
		history: [],
		nextDueTick: PERIODIC_SPAWN_TIMELINE.initialDelayTicks,
		tick: 0
	};
}
function uncheckedAdvance(state, commands, materializer) {
	if (state.tick >= MAX_TICK) return [];
	const tick = state.tick;
	const events = [];
	if (state.alive && tick === PERIODIC_SPAWN_TIMELINE.lifetimeTicks) {
		state.alive = false;
		state.endReason = "expired";
		state.nextDueTick = null;
		events.push({
			sourceId: PERIODIC_SOURCE.sourceId,
			tick,
			type: "source-expired"
		});
	}
	if (commands[state.commandIndex]?.tick === tick) {
		state.commandIndex += 1;
		if (state.alive) {
			state.alive = false;
			state.endReason = "lethal";
			state.nextDueTick = null;
			events.push({
				sourceId: PERIODIC_SOURCE.sourceId,
				tick,
				type: "source-killed"
			});
		}
	}
	if (state.alive && tick === state.nextDueTick) {
		const batchIndex = state.batchCount;
		const spawned = materializer.materialize(PERIODIC_SOURCE);
		events.push({
			anchor: clone(PERIODIC_SOURCE.anchor),
			batchIndex,
			childIds: spawned.map(({ id }) => id),
			ownerId: PERIODIC_SOURCE.ownerId,
			sourceId: PERIODIC_SOURCE.sourceId,
			tick,
			type: "spawn-batch"
		});
		state.batchCount += 1;
		const absoluteDue = PERIODIC_SPAWN_TIMELINE.initialDelayTicks + state.batchCount * PERIODIC_SPAWN_TIMELINE.cadenceTicks;
		if (!Number.isSafeInteger(absoluteDue) || absoluteDue >= MAX_TICK) throw new RangeError("periodic spawn schedule exceeds its tick bound");
		state.nextDueTick = absoluteDue;
	}
	if (state.history.length + events.length > MAX_EVENTS) throw new RangeError("periodic spawn history exceeds its event bound");
	state.history.push(...clone(events));
	state.tick += 1;
	return events;
}
function checkedStateShape(value, commands, label) {
	const state = exactRecord(value, STATE_KEYS, label);
	if (typeof state.alive !== "boolean") throw new TypeError(`${label}.alive must be boolean`);
	safeInteger(state.tick, `${label}.tick`, 0, MAX_TICK);
	safeInteger(state.batchCount, `${label}.batchCount`, 0, MAX_EVENTS);
	safeInteger(state.commandIndex, `${label}.commandIndex`, 0, commands.length);
	if (state.endReason !== null && state.endReason !== "expired" && state.endReason !== "lethal") throw new TypeError(`${label}.endReason is invalid`);
	if (state.nextDueTick !== null) safeInteger(state.nextDueTick, `${label}.nextDueTick`, 0, 4095);
	const history = denseArray(state.history, `${label}.history`, MAX_EVENTS).map(checkedEvent);
	if (state.alive !== (state.endReason === null)) throw new TypeError(`${label} life and end reason disagree`);
	if (state.alive !== (state.nextDueTick !== null)) throw new TypeError(`${label} life and schedule disagree`);
	const expectedCommandIndex = commands.filter(({ tick }) => tick < state.tick).length;
	if (state.commandIndex !== expectedCommandIndex) throw new TypeError(`${label}.commandIndex is noncausal`);
	let previousTick = -1;
	for (const event of history) {
		if (event.tick < previousTick || event.tick >= state.tick) throw new TypeError(`${label}.history is noncausal`);
		previousTick = event.tick;
	}
	return {
		alive: state.alive,
		batchCount: state.batchCount,
		commandIndex: state.commandIndex,
		endReason: state.endReason,
		history,
		nextDueTick: state.nextDueTick,
		tick: state.tick
	};
}
function replay(commands, ticks) {
	const state = initialState();
	const materializer = new SpawnBatchMaterializer();
	for (let index = 0; index < ticks; index += 1) uncheckedAdvance(state, commands, materializer);
	return {
		materializer,
		state
	};
}
function checkedCausal(value, placementSnapshotBytes, commands, label) {
	const checked = checkedStateShape(value, commands, label);
	if (typeof placementSnapshotBytes !== "string") throw new TypeError("periodic spawn placement snapshot must be a string");
	const nested = SpawnBatchMaterializer.restore(placementSnapshotBytes);
	const expected = replay(commands, checked.tick);
	if (canonicalJson(checked) !== canonicalJson(expected.state) || nested.serialize() !== expected.materializer.serialize()) throw new TypeError(`${label} or nested placement snapshot is forged or noncausal`);
	return {
		materializer: nested,
		state: checked
	};
}
function createPeriodicSpawnFixture(commands = []) {
	return clone(checkedSetup({ commands }));
}
var FIXTURE_ID, MAX_COMMANDS, MAX_EVENTS, MAX_SNAPSHOT_BYTES, MAX_STEP_CHUNK, MAX_TICK, COMMAND_KEYS, SETUP_KEYS, SNAPSHOT_KEYS, IDENTITY_KEYS, SCHEDULE_KEYS, SOURCE_KEYS, STATE_KEYS, CHILD_KEYS, EVENT_KEYS, PERIODIC_SPAWN_TIMELINE, PERIODIC_SOURCE, QUESTION_VALUES, PeriodicSpawnEncounter;
function init_periodic_spawns() {
	return (init_periodic_spawns = __esmMin((() => {
		init_spawn_placement();
		FIXTURE_ID = "emberwell-periodic-spawn-question-v1";
		MAX_COMMANDS = 64;
		MAX_EVENTS = 1024;
		MAX_SNAPSHOT_BYTES = 262144;
		MAX_STEP_CHUNK = 4096;
		MAX_TICK = 4096;
		COMMAND_KEYS = ["tick", "type"];
		SETUP_KEYS = ["commands"];
		SNAPSHOT_KEYS = [
			"identity",
			"placementSnapshotBytes",
			"state",
			"version"
		];
		IDENTITY_KEYS = [
			"commands",
			"fixture",
			"schedule",
			"source"
		];
		SCHEDULE_KEYS = [
			"cadenceTicks",
			"initialDelayTicks",
			"lifetimeTicks"
		];
		SOURCE_KEYS = [
			"anchor",
			"children",
			"ownerId",
			"sourceId"
		];
		STATE_KEYS = [
			"alive",
			"batchCount",
			"commandIndex",
			"endReason",
			"history",
			"nextDueTick",
			"tick"
		];
		CHILD_KEYS = [
			"archetypeId",
			"radius",
			"role"
		];
		EVENT_KEYS = {
			"source-expired": [
				"sourceId",
				"tick",
				"type"
			],
			"source-killed": [
				"sourceId",
				"tick",
				"type"
			],
			"spawn-batch": [
				"anchor",
				"batchIndex",
				"childIds",
				"ownerId",
				"sourceId",
				"tick",
				"type"
			]
		};
		deepFreeze({
			displayName: "Emberwell",
			id: "emberwell"
		});
		PERIODIC_SPAWN_TIMELINE = deepFreeze({
			cadenceTicks: 4,
			initialDelayTicks: 3,
			lifetimeTicks: 15
		});
		PERIODIC_SOURCE = deepFreeze({
			anchor: {
				x: 1200,
				y: -800
			},
			children: [{
				archetypeId: "cinderling",
				radius: 100,
				role: "primary"
			}, {
				archetypeId: "cinderling",
				radius: 100,
				role: "secondary"
			}],
			ownerId: 17,
			sourceId: 73
		});
		QUESTION_VALUES = deepFreeze({
			absoluteSchedule: "due-tick-equals-initial-delay-plus-zero-based-batch-index-times-cadence",
			childCountPerBatch: 2,
			childOrder: "source-child-array-order-determines-formation-slot-then-monotonic-id-order",
			deathTriggeredSpawns: "none-in-periodic-only-encounter",
			expiryBoundary: "source-expiry-is-resolved-before-a-same-tick-due-batch",
			initialDelayTicks: PERIODIC_SPAWN_TIMELINE.initialDelayTicks,
			lethalCancellation: "lethal-command-cancels-same-tick-and-all-later-due-batches",
			ownership: "each-child-inherits-literal-owner-id-17-and-source-id-73",
			placement: "every-batch-delegates-to-spawn-batch-materializer-at-anchor-1200,-800",
			repeatedCadenceTicks: PERIODIC_SPAWN_TIMELINE.cadenceTicks,
			sameTickOrder: "expiry-then-command-then-periodic-due-batch",
			sourceLifetimeTicks: PERIODIC_SPAWN_TIMELINE.lifetimeTicks,
			summonRelationship: "emberwell-periodically-materializes-the-two-cinderling-child-specifications"
		});
		PeriodicSpawnEncounter = class PeriodicSpawnEncounter {
			#commands;
			#materializer;
			#state;
			constructor(setup = createPeriodicSpawnFixture()) {
				const checked = checkedSetup(setup);
				this.#commands = checked.commands;
				this.#materializer = new SpawnBatchMaterializer();
				this.#state = initialState();
			}
			get children() {
				return this.#materializer.list();
			}
			get replay() {
				return clone(this.#state.history);
			}
			get state() {
				return clone(this.#state);
			}
			step() {
				return this.stepMany(1);
			}
			stepMany(count) {
				safeInteger(count, "periodic spawn step count", 0, MAX_STEP_CHUNK);
				if (count > MAX_TICK - this.#state.tick) throw new RangeError("periodic spawn step count exceeds the encounter bound");
				const candidate = checkedCausal(this.#state, this.#materializer.serialize(), this.#commands, "periodic spawn state");
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...uncheckedAdvance(candidate.state, this.#commands, candidate.materializer));
				this.#state = candidate.state;
				this.#materializer = candidate.materializer;
				return clone(events);
			}
			run() {
				return this.stepMany(MAX_TICK - this.#state.tick);
			}
			serialize() {
				const placementSnapshotBytes = this.#materializer.serialize();
				const causal = checkedCausal(this.#state, placementSnapshotBytes, this.#commands, "periodic spawn state");
				const serialized = canonicalJson({
					identity: {
						commands: this.#commands,
						fixture: FIXTURE_ID,
						schedule: PERIODIC_SPAWN_TIMELINE,
						source: PERIODIC_SOURCE
					},
					placementSnapshotBytes: causal.materializer.serialize(),
					state: causal.state,
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES) throw new RangeError("periodic spawn snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("periodic spawn snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES) throw new RangeError("periodic spawn snapshot exceeds its byte bound");
				let value;
				try {
					value = JSON.parse(serialized);
				} catch {
					throw new TypeError("periodic spawn snapshot must be valid JSON");
				}
				if (serialized !== canonicalJson(value)) throw new TypeError("periodic spawn snapshot must be canonical duplicate-free JSON");
				const snapshot = exactRecord(value, SNAPSHOT_KEYS, "periodic spawn snapshot");
				if (snapshot.version !== 1) throw new TypeError("periodic spawn snapshot version is unsupported");
				const identity = exactRecord(snapshot.identity, IDENTITY_KEYS, "periodic spawn snapshot.identity");
				if (identity.fixture !== FIXTURE_ID) throw new TypeError("periodic spawn snapshot fixture identity is invalid");
				const commands = checkedCommands(identity.commands);
				const schedule = checkedSchedule(identity.schedule, "periodic spawn snapshot.identity.schedule");
				const source = checkedSource(identity.source, "periodic spawn snapshot.identity.source");
				if (canonicalJson(schedule) !== canonicalJson(PERIODIC_SPAWN_TIMELINE) || canonicalJson(source) !== canonicalJson(PERIODIC_SOURCE)) throw new TypeError("periodic spawn snapshot identity disagrees with fixture policy");
				const causal = checkedCausal(snapshot.state, snapshot.placementSnapshotBytes, commands, "periodic spawn snapshot.state");
				const encounter = new PeriodicSpawnEncounter({ commands });
				encounter.#state = causal.state;
				encounter.#materializer = causal.materializer;
				return encounter;
			}
		};
	})))();
}
//#endregion
export { createInvisibilityMappedFieldQuestionRecords as $, createDeathEffectsCatalog as A, init_basic_flying as At, DeathSpawnEncounter as B, createDefensiveBuildingCatalog as C, init_basic_ranged as Ct, createDefensiveBuildingRuntimeProfiles as D, createBasicFlyingCatalog as Dt, createDefensiveBuildingQuestionRecords as E, advanceBasicFlyingMovement as Et, DeathConversionEncounter as F, init_basic_melee as Ft, createChampionAbilityCatalog as G, createDeathSpawnQuestionRecords as H, createDeathConversionFixture as I, createChampionMappedFieldQuestionRecords as J, createChampionAbilityFixture as K, createDeathConversionQuestionRecords as L, createDeathEffectsQuestions as M, serializeBasicFlyingMovement as Mt, init_death_effects as N, createBasicMeleeCatalog as Nt, init_buildings_defensive as O, createBasicFlyingCombatant as Ot, DEATH_CONVERSION_IDENTITY as P, createBasicMeleeCombatant as Pt, createInvisibilityFixture as Q, init_death_conversion as R, DefensiveBuildingEncounter as S, createBasicRangedCombatant as St, createDefensiveBuildingFixture as T, acquireBasicFlyingTarget as Tt, init_death_spawns as U, createDeathSpawnFixture as V, ChampionAbilityController as W, probeChampionAbilityAdapters as X, init_champion_abilities as Y, InvisibilityRevealEncounter as Z, SpawnerBuildingEncounter as _, init_ordinary_projectile_squads as _t, createUndergroundTravelBuildingCatalog as a, createHealFixture as at, createSpawnerBuildingQuestionRecords as b, BasicRangedDuel as bt, createUndergroundTravelBuildingQuestionRecords as c, TimedFullDisableStunEncounter as ct, createResourceBuildingCatalog as d, createStunSpecialCatalog as dt, createInvisibilityQuestionRecords as et, createResourceBuildingCorpusRecords as f, init_combat_status_stun as ft, SPAWNER_BUILDING_IDENTITIES as g, createOrdinaryProjectileSquadCatalog as gt, init_buildings_resource as h, init_shields_forms as ht, UndergroundTravelBuildingEncounter as i, createHealCatalog as it, createDeathEffectsFixture as j, restoreBasicFlyingMovement as jt, DeathEffectsEncounter as k, createBasicFlyingMovement as kt, init_buildings_travel as l, createStunFixture as lt, createResourceBuildingQuestionRecords as m, createShieldFormCatalog as mt, createPeriodicSpawnFixture as n, init_combat_status_invisibility as nt, createUndergroundTravelBuildingCorpusRecords as o, createHealQuestionRecords as ot, createResourceBuildingFixture as p, ShieldFormEncounter as pt, createChampionAbilityQuestionRecords as q, init_periodic_spawns as r, InstantHealingEncounter as rt, createUndergroundTravelBuildingFixture as s, init_combat_status_heal as st, PeriodicSpawnEncounter as t, createInvisibilitySpecialCatalog as tt, ResourceBuildingEncounter as u, createStunQuestionRecords as ut, createSpawnerBuildingCorpusRecords as v, createOrdinaryProjectileSplashCatalog as vt, createDefensiveBuildingCorpusRecords as w, BasicFlyingDuel as wt, init_buildings_spawner as x, createBasicRangedCatalog as xt, createSpawnerBuildingFixture as y, init_ordinary_projectile_splash as yt, DEATH_SPAWN_IDENTITY as z };
