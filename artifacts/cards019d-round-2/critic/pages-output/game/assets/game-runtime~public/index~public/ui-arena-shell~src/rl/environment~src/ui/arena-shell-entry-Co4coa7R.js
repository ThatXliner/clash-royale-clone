import { t as __esmMin } from "../../../../../../rolldown-runtime-Cl99QfTQ.js";
import { B as createCardCatalog, V as init_schema } from "./arena-shell-entry-C8NHd_jT.js";
import { ct as TimedFullDisableStunEncounter, ft as init_combat_status_stun, ht as init_shields_forms, lt as createStunFixture, n as createPeriodicSpawnFixture, pt as ShieldFormEncounter, r as init_periodic_spawns, t as PeriodicSpawnEncounter } from "./arena-shell-entry-CCDvE3H7.js";
import { a as ARENA_WIDTH_MILLITILES, n as init_area_damage, r as ARENA_LENGTH_MILLITILES, s as init_arena_geometry, t as AreaDamageSystem } from "./arena-shell-entry-BC9aY_Zk.js";
import { $ as DeckCycle, Q as DECK_MAX_PLAY_COMMANDS, et as init_deck, ft as ProjectileCombat, it as init_deployment, nt as init_rng, pt as init_projectile, rt as evaluateDeployment, t as init_elixir, tt as SeededRandom } from "./arena-shell-entry-D5weJ7hm.js";
import { a as createCombatEffectFeed, n as appendCombatEffectRoot, o as init_combat_effect_feed, r as combatEffectFeedSnapshot, s as serializeCombatEffectFeed, t as appendCombatEffectEvent } from "./arena-shell-entry-CNVraBnB.js";
import { at as ReturnEncounter, ct as createReturnSpecialFixture, g as createKnockbackSpecialCatalog, lt as init_special_projectiles_return, ot as createReturnQuestionFixture, v as evaluateForcedKnockbackQuestionBoundary, y as init_special_movement_knockback } from "./arena-shell-entry-CEfYVuAM.js";
import { _ as createSlowFixture, b as init_special_combat_slow, g as TimedMovementAttackSlowEncounter, o as InstantaneousCombatResetEncounter, s as createResetFixture, u as init_special_combat_reset } from "./arena-shell-entry-BQhEU8w9.js";
import { r as init_spawn_placement, t as SpawnBatchMaterializer } from "./arena-shell-entry-Ch9grTTJ.js";
import { n as ELIXIR_CAPACITY } from "./arena-shell-entry-0OqWVvCI.js";
//#region src/content/cards/spells-instant.js
function clone$8(value) {
	return structuredClone(value);
}
function deepFreeze$8(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze$8(child);
		Object.freeze(value);
	}
	return value;
}
function canonicalJson$8(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$8).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$8(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord$8(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$6(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value")).some(Boolean)) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function safeInteger$5(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
	return value;
}
function checkedId$2(value, label, nullable = false) {
	if (nullable && value === null) return null;
	return safeInteger$5(value, label, 1);
}
function checkedPosition$4(value, label) {
	const position = exactRecord$8(value, ["x", "y"], label);
	return {
		x: safeInteger$5(position.x, `${label}.x`, 0, ARENA_WIDTH_MILLITILES),
		y: safeInteger$5(position.y, `${label}.y`, 0, ARENA_LENGTH_MILLITILES)
	};
}
function checkedSources$4(value) {
	const sources = denseArray$6(value, MAX_SOURCES$4, "spell sources").map((entry, index) => {
		const source = exactRecord$8(entry, SOURCE_KEYS$4, `spell source ${index}`);
		return {
			id: checkedId$2(source.id, `spell source ${index}.id`),
			ownerId: safeInteger$5(source.ownerId, `spell source ${index}.ownerId`, 1, MAX_OWNER_ID$4)
		};
	});
	if (sources.length < 1) throw new RangeError("spell sources must not be empty");
	const ids = /* @__PURE__ */ new Set();
	for (const source of sources) {
		if (ids.has(source.id)) throw new TypeError("spell source IDs must be unique");
		ids.add(source.id);
	}
	return sources;
}
function checkedVictims$2(value) {
	const victims = denseArray$6(value, MAX_VICTIMS$2, "spell victims").map((entry, index) => {
		const victim = exactRecord$8(entry, VICTIM_KEYS$2, `spell victim ${index}`);
		if (!VICTIM_KINDS$2.has(victim.kind)) throw new TypeError(`spell victim ${index}.kind is invalid`);
		if (!VICTIM_LAYERS$2.has(victim.layer)) throw new TypeError(`spell victim ${index}.layer is invalid`);
		if (victim.combatTargetMode !== null && !COMBAT_TARGET_MODES$2.has(victim.combatTargetMode)) throw new TypeError(`spell victim ${index}.combatTargetMode is invalid`);
		if (typeof victim.targetable !== "boolean") throw new TypeError(`spell victim ${index}.targetable must be boolean`);
		const position = checkedPosition$4(victim.position, `spell victim ${index}.position`);
		const radius = safeInteger$5(victim.radius, `spell victim ${index}.radius`, 0, MAX_RADIUS$3);
		if (position.x < radius || position.x > 18e3 - radius || position.y < radius || position.y > 32e3 - radius) throw new RangeError(`spell victim ${index} must fit in the radius-inset arena`);
		const combatTargetId = checkedId$2(victim.combatTargetId, `spell victim ${index}.combatTargetId`, true);
		if (combatTargetId === null !== (victim.combatTargetMode === null)) throw new TypeError(`spell victim ${index} combat target ID and mode must both be null or non-null`);
		return {
			combatTargetMode: victim.combatTargetMode,
			combatTargetId,
			health: safeInteger$5(victim.health, `spell victim ${index}.health`, 1, MAX_HEALTH$3),
			id: checkedId$2(victim.id, `spell victim ${index}.id`),
			kind: victim.kind,
			layer: victim.layer,
			ownerId: safeInteger$5(victim.ownerId, `spell victim ${index}.ownerId`, 1, MAX_OWNER_ID$4),
			position,
			radius,
			targetable: victim.targetable
		};
	});
	const ids = /* @__PURE__ */ new Set();
	for (const victim of victims) {
		if (ids.has(victim.id)) throw new TypeError("spell victim IDs must be unique");
		ids.add(victim.id);
	}
	return victims;
}
function checkedCommands$4(value, sources, victims) {
	const sourceIds = new Set(sources.map(({ id }) => id));
	const victimIds = new Set(victims.map(({ id }) => id));
	const commands = denseArray$6(value, MAX_COMMANDS$5, "spell commands").map((entry, index) => {
		const command = exactRecord$8(entry, COMMAND_KEYS$5, `spell command ${index}`);
		if (!COMMAND_TYPES$3.has(command.type)) throw new TypeError(`spell command ${index}.type is invalid`);
		const id = checkedId$2(command.id, `spell command ${index}.id`);
		const maximumTick = command.type === "cast" ? 125 : 127;
		const tick = safeInteger$5(command.tick, `spell command ${index}.tick`, 0, maximumTick);
		if (command.type === "cast") {
			const sourceId = checkedId$2(command.sourceId, `spell command ${index}.sourceId`);
			if (!sourceIds.has(sourceId)) throw new TypeError(`spell command ${index}.sourceId is unknown`);
			if (command.targetId !== null || !VARIANTS$1.has(command.variant)) throw new TypeError(`spell command ${index} has invalid cast fields`);
			return {
				center: checkedPosition$4(command.center, `spell command ${index}.center`),
				id,
				sourceId,
				targetId: null,
				tick,
				type: command.type,
				variant: command.variant
			};
		}
		if (command.type === "source-died") {
			const sourceId = checkedId$2(command.sourceId, `spell command ${index}.sourceId`);
			if (!sourceIds.has(sourceId) || command.center !== null || command.targetId !== null || command.variant !== null) throw new TypeError(`spell command ${index} has invalid source death fields`);
			return {
				center: null,
				id,
				sourceId,
				targetId: null,
				tick,
				type: command.type,
				variant: null
			};
		}
		const targetId = checkedId$2(command.targetId, `spell command ${index}.targetId`);
		if (!victimIds.has(targetId) || command.center !== null || command.sourceId !== null || command.variant !== null) throw new TypeError(`spell command ${index} has invalid target death fields`);
		return {
			center: null,
			id,
			sourceId: null,
			targetId,
			tick,
			type: command.type,
			variant: null
		};
	});
	const ids = /* @__PURE__ */ new Set();
	let priorTick = -1;
	let priorId = -1;
	for (const command of commands) {
		if (ids.has(command.id)) throw new TypeError("spell command IDs must be unique");
		ids.add(command.id);
		if (command.tick < priorTick || command.tick === priorTick && command.id <= priorId) throw new TypeError("spell commands must use increasing tick and command-ID order");
		priorTick = command.tick;
		priorId = command.id;
	}
	return commands;
}
function checkedSetup$7(value) {
	const setup = exactRecord$8(value, SETUP_KEYS$6, "instant spell setup");
	const sources = checkedSources$4(setup.sources);
	const victims = checkedVictims$2(setup.victims);
	const allIds = new Set(sources.map(({ id }) => id));
	for (const victim of victims) {
		if (allIds.has(victim.id)) throw new TypeError("spell source and victim IDs must be disjoint");
		allIds.add(victim.id);
	}
	return {
		commands: checkedCommands$4(setup.commands, sources, victims),
		sources,
		victims
	};
}
function initialState$5(setup) {
	return {
		commandIndex: 0,
		history: [],
		nextEffectId: 1,
		pending: [],
		sources: setup.sources.map((source) => ({
			...source,
			alive: true
		})),
		tick: 0,
		victims: setup.victims.map((victim) => ({
			...clone$8(victim),
			alive: true,
			disabledThroughTick: null,
			resetCount: 0
		}))
	};
}
function overlaps(center, victim) {
	const dx = BigInt(victim.position.x) - BigInt(center.x);
	const dy = BigInt(victim.position.y) - BigInt(center.y);
	const totalRadius = BigInt(SPELL.areaDamageRadiusMillitiles + victim.radius);
	return dx * dx + dy * dy <= totalRadius * totalRadius;
}
function crownDamage() {
	const scaled = BigInt(SPELL.damage) * BigInt(CROWN_DAMAGE_NUMERATOR);
	return Number((scaled + BigInt(CROWN_DAMAGE_ROUNDING_OFFSET)) / BigInt(CROWN_DAMAGE_DENOMINATOR));
}
function hitAmount(victim) {
	return victim.kind === "crown" ? crownDamage() : SPELL.damage;
}
function targetEligible$2(source, victim, center) {
	return victim.alive && victim.targetable && victim.ownerId !== source.ownerId && VICTIM_KINDS$2.has(victim.kind) && VICTIM_LAYERS$2.has(victim.layer) && overlaps(center, victim);
}
function applyKnockback(state, impact, targets, events) {
	const eligible = targets.filter((victim) => victim.alive && victim.kind === "troop");
	if (eligible.length === 0) return;
	const results = evaluateForcedKnockbackQuestionBoundary(impact.center, eligible.map((victim) => ({
		eligible: true,
		id: victim.id,
		position: { ...victim.position },
		radius: victim.radius
	})));
	for (const result of results) {
		const victim = state.victims.find(({ id }) => id === result.id);
		victim.position = { ...result.position };
		events.push({
			applied: { ...result.applied },
			blocked: { ...result.blocked },
			clamped: result.clamped,
			effectId: impact.effectId,
			origin: { ...result.origin },
			position: { ...result.position },
			requested: { ...result.requested },
			targetId: result.id,
			tick: state.tick,
			type: "spell-knockback"
		});
	}
}
function retainedTargetEligible(victim, retainedTarget) {
	if (!retainedTarget.targetable || victim.combatTargetMode === "none") return false;
	if (victim.combatTargetMode === "buildings") return retainedTarget.kind === "structure" || retainedTarget.kind === "crown";
	if (victim.combatTargetMode === "air_and_ground") return true;
	return retainedTarget.layer === victim.combatTargetMode;
}
function resetCommandsFor(state, victim, source) {
	const retainedTarget = state.victims.find(({ id }) => id === victim.combatTargetId);
	const commands = [{
		sourceId: null,
		targetId: victim.combatTargetId,
		tick: 0,
		type: "acquire-target"
	}];
	if (retainedTarget === void 0 || !retainedTarget.alive) {
		commands.push({
			sourceId: null,
			targetId: victim.combatTargetId,
			tick: 1,
			type: "target-died"
		}, {
			sourceId: source.id,
			targetId: victim.combatTargetId,
			tick: 2,
			type: "reset"
		});
		return commands;
	}
	commands.push({
		sourceId: source.id,
		targetId: victim.combatTargetId,
		tick: 1,
		type: retainedTargetEligible(victim, retainedTarget) ? "reset" : "reset-ineligible-target"
	});
	return commands;
}
function applyStunAndReset(state, impact, targets, source, events) {
	for (const victim of targets) {
		if (!victim.alive || victim.kind !== "troop") continue;
		const stunEvent = new TimedFullDisableStunEncounter(createStunFixture([{
			sourceId: source.id,
			targetId: null,
			tick: 0,
			type: "stun"
		}])).step().find(({ type }) => type === "stun-applied");
		victim.disabledThroughTick = state.tick + stunEvent.disabledThroughTick;
		events.push({
			disabledThroughTick: victim.disabledThroughTick,
			effectId: impact.effectId,
			sourceId: source.id,
			targetId: victim.id,
			tick: state.tick,
			type: "spell-stun"
		});
		if (victim.combatTargetId === null) continue;
		const resetCommands = resetCommandsFor(state, victim, source);
		const resetEvent = new InstantaneousCombatResetEncounter(createResetFixture(resetCommands)).stepMany(resetCommands.length).find(({ type }) => type === "combat-reset");
		if (resetEvent.applied) victim.resetCount += 1;
		events.push({
			applied: resetEvent.applied,
			effectId: impact.effectId,
			primitiveEvent: clone$8(resetEvent),
			reason: resetEvent.reason,
			retainedTargetId: resetEvent.targetId,
			sourceId: source.id,
			targetId: victim.id,
			tick: state.tick,
			type: "spell-combat-reset"
		});
	}
}
function resolveImpact$1(state, impact, events) {
	const source = state.sources.find(({ id }) => id === impact.sourceId);
	if (!source.alive) {
		events.push({
			effectId: impact.effectId,
			reason: "source-dead",
			sourceId: source.id,
			tick: state.tick,
			type: "spell-cancelled"
		});
		return;
	}
	const targets = state.victims.filter((victim) => targetEligible$2(source, victim, impact.center)).sort((left, right) => left.id - right.id);
	events.push({
		center: { ...impact.center },
		crownDamage: crownDamage(),
		damage: SPELL.damage,
		effectId: impact.effectId,
		radius: SPELL.areaDamageRadiusMillitiles,
		sourceId: source.id,
		tick: state.tick,
		type: "spell-impact",
		variant: impact.variant
	});
	const batch = targets.map((victim) => {
		const amount = hitAmount(victim);
		return {
			amount,
			healthAfter: Math.max(0, victim.health - amount),
			healthBefore: victim.health,
			victim
		};
	});
	for (const { amount, victim } of batch) events.push({
		amount,
		effectId: impact.effectId,
		targetId: victim.id,
		tick: state.tick,
		type: "spell-hit"
	});
	for (const { amount, healthAfter, healthBefore, victim } of batch) {
		victim.health = healthAfter;
		events.push({
			amount,
			effectId: impact.effectId,
			healthAfter,
			healthBefore,
			targetId: victim.id,
			tick: state.tick,
			type: "spell-damage"
		});
	}
	for (const { healthAfter, victim } of batch) {
		if (healthAfter !== 0) continue;
		victim.alive = false;
		events.push({
			effectId: impact.effectId,
			targetId: victim.id,
			tick: state.tick,
			type: "spell-death"
		});
	}
	if (impact.variant === "knockback") applyKnockback(state, impact, targets, events);
	else if (impact.variant === "stun-reset") applyStunAndReset(state, impact, targets, source, events);
}
function applyCommand$5(state, command, events) {
	if (command.type === "cast") {
		if (state.nextEffectId === Number.MAX_SAFE_INTEGER) throw new RangeError("instant spell effect ID space is exhausted");
		const effectId = state.nextEffectId;
		state.nextEffectId += 1;
		const impactTick = state.tick + IMPACT_DELAY_TICKS$2;
		state.pending.push({
			center: { ...command.center },
			effectId,
			impactTick,
			sourceId: command.sourceId,
			variant: command.variant
		});
		events.push({
			effectId,
			impactTick,
			sourceId: command.sourceId,
			tick: state.tick,
			type: "spell-cast",
			variant: command.variant
		});
		return;
	}
	if (command.type === "source-died") {
		const source = state.sources.find(({ id }) => id === command.sourceId);
		if (source.alive) {
			source.alive = false;
			events.push({
				sourceId: source.id,
				tick: state.tick,
				type: "spell-source-died"
			});
		}
		return;
	}
	const victim = state.victims.find(({ id }) => id === command.targetId);
	if (victim.alive) {
		victim.alive = false;
		victim.health = 0;
		events.push({
			targetId: victim.id,
			tick: state.tick,
			type: "spell-target-died"
		});
	}
}
function advance$6(state, commands) {
	if (state.tick >= MAX_TICK$7) return [];
	const events = [];
	while (commands[state.commandIndex]?.tick === state.tick) {
		const command = commands[state.commandIndex];
		state.commandIndex += 1;
		applyCommand$5(state, command, events);
	}
	const due = state.pending.filter(({ impactTick }) => impactTick === state.tick).sort((left, right) => left.effectId - right.effectId);
	state.pending = state.pending.filter(({ impactTick }) => impactTick !== state.tick);
	for (const impact of due) resolveImpact$1(state, impact, events);
	if (state.history.length + events.length > MAX_EVENTS$6) throw new RangeError("instant spell replay exceeds its event bound");
	state.history.push(...clone$8(events));
	state.tick += 1;
	return events;
}
function questionRecord$6(key, value) {
	return deepFreeze$8({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		key,
		source: SOURCE$6,
		value: clone$8(value)
	});
}
function createInstantSpellCatalog(...args) {
	if (args.length !== 0) throw new TypeError("instant spell catalog does not accept overrides");
	return createKnockbackSpecialCatalog();
}
function createInstantSpellQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("instant spell questions do not accept overrides");
	return deepFreeze$8(Object.fromEntries(Object.entries(QUESTION_VALUES$6).map(([key, value]) => [key, questionRecord$6(key, value)])));
}
function createInstantSpellFixture(value) {
	return clone$8(checkedSetup$7(value));
}
var SPELL, SOURCE$6, IMPACT_DELAY_TICKS$2, CROWN_DAMAGE_NUMERATOR, CROWN_DAMAGE_DENOMINATOR, CROWN_DAMAGE_ROUNDING_OFFSET, MAX_COMMANDS$5, MAX_EVENTS$6, MAX_HEALTH$3, MAX_OWNER_ID$4, MAX_RADIUS$3, MAX_SNAPSHOT_BYTES$8, MAX_SOURCES$4, MAX_STEP_CHUNK$6, MAX_TICK$7, MAX_VICTIMS$2, COMMAND_KEYS$5, SETUP_KEYS$6, SOURCE_KEYS$4, VICTIM_KEYS$2, SNAPSHOT_KEYS$8, IDENTITY_KEYS$6, COMMAND_TYPES$3, VARIANTS$1, VICTIM_KINDS$2, VICTIM_LAYERS$2, COMBAT_TARGET_MODES$2, QUESTION_VALUES$6, InstantRadiusSpellEncounter;
function init_spells_instant() {
	return (init_spells_instant = __esmMin((() => {
		init_arena_geometry();
		init_special_movement_knockback();
		init_combat_status_stun();
		init_special_combat_reset();
		SPELL = createKnockbackSpecialCatalog()[0];
		SOURCE$6 = "unsourced-instant-radius-spell-composition";
		IMPACT_DELAY_TICKS$2 = 2;
		CROWN_DAMAGE_NUMERATOR = 3;
		CROWN_DAMAGE_DENOMINATOR = 10;
		CROWN_DAMAGE_ROUNDING_OFFSET = 5;
		MAX_COMMANDS$5 = 96;
		MAX_EVENTS$6 = 8192;
		MAX_HEALTH$3 = 1e6;
		MAX_OWNER_ID$4 = 1024;
		MAX_RADIUS$3 = 9e3;
		MAX_SNAPSHOT_BYTES$8 = 262144;
		MAX_SOURCES$4 = 16;
		MAX_STEP_CHUNK$6 = 128;
		MAX_TICK$7 = 128;
		MAX_VICTIMS$2 = 64;
		COMMAND_KEYS$5 = [
			"center",
			"id",
			"sourceId",
			"targetId",
			"tick",
			"type",
			"variant"
		];
		SETUP_KEYS$6 = [
			"commands",
			"sources",
			"victims"
		];
		SOURCE_KEYS$4 = ["id", "ownerId"];
		VICTIM_KEYS$2 = [
			"combatTargetMode",
			"combatTargetId",
			"health",
			"id",
			"kind",
			"layer",
			"ownerId",
			"position",
			"radius",
			"targetable"
		];
		SNAPSHOT_KEYS$8 = [
			"identity",
			"tick",
			"version"
		];
		IDENTITY_KEYS$6 = ["fixture", "setup"];
		COMMAND_TYPES$3 = /* @__PURE__ */ new Set([
			"cast",
			"source-died",
			"target-died"
		]);
		VARIANTS$1 = /* @__PURE__ */ new Set([
			"knockback",
			"plain",
			"stun-reset"
		]);
		VICTIM_KINDS$2 = /* @__PURE__ */ new Set([
			"crown",
			"structure",
			"troop"
		]);
		VICTIM_LAYERS$2 = /* @__PURE__ */ new Set(["air", "ground"]);
		COMBAT_TARGET_MODES$2 = /* @__PURE__ */ new Set([
			"air",
			"air_and_ground",
			"buildings",
			"ground",
			"none"
		]);
		QUESTION_VALUES$6 = Object.freeze({
			crownTowerDamageRatio: Object.freeze({
				denominator: CROWN_DAMAGE_DENOMINATOR,
				numerator: CROWN_DAMAGE_NUMERATOR
			}),
			crownTowerDamageRounding: "nearest-integer-half-up",
			effectIdPolicy: "assign-monotonic-id-at-cast-in-command-order",
			impactCancellationOnSourceDeath: "cancel-pending-impact",
			impactDelayTicks: IMPACT_DELAY_TICKS$2,
			knockbackAdapterTiming: "same-impact-boundary-after-damage-and-deaths",
			knockbackCoupling: "surviving-troops-use-passed-exact-forced-knockback-boundary",
			mappedAreaDamageRadiusMillitiles: SPELL.areaDamageRadiusMillitiles,
			mappedTargetMode: SPELL.targetMode,
			multiSpellSameTickOrder: "ascending-command-id-then-effect-id",
			ownershipFilter: "hostile-owner-only",
			placementPolicy: "closed-arena-center-without-side-or-cell-mask",
			radiusBoundary: "inclusive-center-distance-plus-victim-radius",
			resetCoupling: "surviving-troops-with-retained-target-use-passed-instant-reset",
			resetAdapterTiming: "primitive-acquire-zero-reset-one-evaluated-at-impact-boundary",
			sameBoundaryOrdering: "commands-first-then-pending-impacts-then-damage-death-status",
			statusDeathEligibility: "status-only-on-survivors",
			statusKindFilter: "troops-only",
			stunCoupling: "surviving-troops-use-passed-full-disable-duration",
			stunAdapterTiming: "primitive-application-zero-translated-to-impact-boundary",
			targetKindFilter: "troop-structure-and-crown",
			targetLayerFilter: "ground-and-air",
			targetLivenessFilter: "living-at-impact-boundary",
			targetTargetableFilter: "explicit-targetable-flag",
			targetDeathAtImpact: "command-first-death-excludes-only-that-victim"
		});
		InstantRadiusSpellEncounter = class InstantRadiusSpellEncounter {
			#setup;
			#state;
			constructor(setup) {
				this.#setup = checkedSetup$7(setup);
				this.#state = initialState$5(this.#setup);
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
				safeInteger$5(count, "instant spell step count", 0, MAX_STEP_CHUNK$6);
				if (count > MAX_TICK$7 - this.#state.tick) throw new RangeError("instant spell step count exceeds encounter bound");
				const candidate = clone$8(this.#state);
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...advance$6(candidate, this.#setup.commands));
				this.#state = candidate;
				return clone$8(events);
			}
			run() {
				return this.stepMany(MAX_TICK$7 - this.#state.tick);
			}
			serialize() {
				const serialized = canonicalJson$8({
					identity: {
						fixture: "instant-radius-spell-question-v1",
						setup: this.#setup
					},
					tick: this.#state.tick,
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$8) throw new RangeError("instant spell snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("instant spell snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$8) throw new RangeError("instant spell snapshot exceeds its byte bound");
				let value;
				try {
					value = JSON.parse(serialized);
				} catch {
					throw new TypeError("instant spell snapshot must be valid JSON");
				}
				if (canonicalJson$8(value) !== serialized) throw new TypeError("instant spell snapshot must be canonical duplicate-free JSON");
				const snapshot = exactRecord$8(value, SNAPSHOT_KEYS$8, "instant spell snapshot");
				if (snapshot.version !== 1) throw new TypeError("instant spell snapshot version is unsupported");
				const identity = exactRecord$8(snapshot.identity, IDENTITY_KEYS$6, "instant spell snapshot.identity");
				if (identity.fixture !== "instant-radius-spell-question-v1") throw new TypeError("instant spell snapshot fixture is unsupported");
				safeInteger$5(snapshot.tick, "instant spell snapshot.tick", 0, MAX_TICK$7);
				const encounter = new InstantRadiusSpellEncounter(checkedSetup$7(identity.setup));
				encounter.stepMany(snapshot.tick);
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/spells-copy-card.js
function deepFreeze$7(value) {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value)) deepFreeze$7(child);
	}
	return value;
}
function clone$7(value) {
	return JSON.parse(JSON.stringify(value));
}
function canonicalJson$7(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$7).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$7(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function utf8ByteLength(value) {
	return UTF8_ENCODER.encode(value).byteLength;
}
function exactRecord$7(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain data object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$5(value, maximum, label) {
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
function runtimeId$1(value, label) {
	if (!(typeof value === "string" && value.length > 0 || Number.isSafeInteger(value) && value > 0)) throw new TypeError(`${label} must be a runtime card id`);
	return value;
}
function safeInteger$4(value, minimum, maximum, label) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a safe integer from ${minimum} through ${maximum}`);
	return value;
}
function validateCard(value, index) {
	const card = exactRecord$7(value, CARD_KEYS, `cards[${index}]`);
	runtimeId$1(card.id, `cards[${index}].id`);
	safeInteger$4(card.cost, 1, ELIXIR_CAPACITY, `cards[${index}].cost`);
	safeInteger$4(card.level, 1, MAX_LEVEL, `cards[${index}].level`);
	if (typeof card.excludedFromCopy !== "boolean") throw new TypeError(`cards[${index}].excludedFromCopy must be boolean`);
	return {
		cost: card.cost,
		excludedFromCopy: card.excludedFromCopy,
		id: card.id,
		level: card.level
	};
}
function validateSetup(value) {
	const setup = exactRecord$7(value, SETUP_KEYS$5, "copy setup");
	const cards = denseArray$5(setup.cards, 256, "copy setup.cards").map(validateCard);
	if (cards.length < 8) throw new TypeError("copy setup.cards must describe the entire deck");
	const ids = cards.map(({ id }) => id);
	if (new Set(ids).size !== ids.length) throw new TypeError("copy setup.cards ids must be unique");
	const deck = denseArray$5(setup.deck, 8, "copy setup.deck").map((id, index) => runtimeId$1(id, `copy setup.deck[${index}]`));
	if (deck.length !== 8 || new Set(deck).size !== 8) throw new TypeError("copy setup.deck must contain eight unique cards");
	if (deck.some((id) => !ids.includes(id))) throw new TypeError("copy setup.deck contains an undescribed card");
	runtimeId$1(setup.copyCardId, "copy setup.copyCardId");
	const copyCard = cards.find(({ id }) => id === setup.copyCardId);
	if (!copyCard || !deck.includes(setup.copyCardId)) throw new TypeError("copy card must be described and present in the deck");
	if (!copyCard.excludedFromCopy) throw new TypeError("copy card must be excluded from copying itself");
	if (typeof setup.seed !== "string" && !Number.isSafeInteger(setup.seed)) throw new TypeError("copy setup.seed must be a string or safe integer");
	return {
		cards,
		copyCardId: setup.copyCardId,
		deck,
		seed: setup.seed
	};
}
function validateCommand(value, index = null) {
	const label = index === null ? "copy command" : `commands[${index}]`;
	const command = exactRecord$7(value, COMMAND_KEYS$4, label);
	runtimeId$1(command.cardId, `${label}.cardId`);
	safeInteger$4(command.tick, 0, 999999, `${label}.tick`);
	return {
		cardId: command.cardId,
		tick: command.tick
	};
}
function parseSnapshot(serialized) {
	if (typeof serialized !== "string") throw new TypeError("copy snapshot must be a string");
	if (utf8ByteLength(serialized) > MAX_SNAPSHOT_BYTES$7) throw new RangeError("copy snapshot exceeds its size bound");
	try {
		return JSON.parse(serialized);
	} catch {
		throw new TypeError("copy snapshot must be valid JSON");
	}
}
function getPreviousCardCopyQuestions() {
	return clone$7(PREVIOUS_CARD_COPY_QUESTIONS);
}
var COPY_CARD_MAX_TICK, FIXTURE, MAX_LEVEL, MAX_SNAPSHOT_BYTES$7, UTF8_ENCODER, SETUP_KEYS$5, CARD_KEYS, COMMAND_KEYS$4, SNAPSHOT_KEYS$7, PREVIOUS_CARD_COPY_QUESTIONS, PreviousCardCopyMatch;
function init_spells_copy_card() {
	return (init_spells_copy_card = __esmMin((() => {
		init_deck();
		init_elixir();
		COPY_CARD_MAX_TICK = 1e6;
		FIXTURE = "previous-card-copy-v1";
		MAX_LEVEL = 15;
		MAX_SNAPSHOT_BYTES$7 = 2e6;
		UTF8_ENCODER = new TextEncoder();
		SETUP_KEYS$5 = [
			"cards",
			"copyCardId",
			"deck",
			"seed"
		];
		CARD_KEYS = [
			"cost",
			"excludedFromCopy",
			"id",
			"level"
		];
		COMMAND_KEYS$4 = ["cardId", "tick"];
		SNAPSHOT_KEYS$7 = [
			"commands",
			"fixture",
			"setup",
			"tick",
			"version"
		];
		PREVIOUS_CARD_COPY_QUESTIONS = deepFreeze$7([
			{
				confidence: "absent",
				id: "copy-cost-increment",
				policy: "copied effective cost is the copied card cost plus one",
				status: "QUESTION"
			},
			{
				confidence: "absent",
				id: "copy-cost-cap",
				policy: `copied effective cost is capped at ${ELIXIR_CAPACITY}`,
				status: "QUESTION"
			},
			{
				confidence: "absent",
				id: "copy-level-increment",
				policy: "copied effective level is the previous effective level plus one",
				status: "QUESTION"
			},
			{
				confidence: "absent",
				id: "copy-level-cap",
				policy: `copied effective level is capped at ${MAX_LEVEL}`,
				status: "QUESTION"
			},
			{
				confidence: "absent",
				id: "copy-history-selection",
				policy: "previous means the latest accepted non-copy card",
				status: "QUESTION"
			},
			{
				confidence: "absent",
				id: "copy-history-after-copy",
				policy: "an accepted copy does not replace the previous eligible card",
				status: "QUESTION"
			},
			{
				confidence: "absent",
				id: "copy-rejection-cycle",
				policy: "empty or excluded history rejects atomically without cycling",
				status: "QUESTION"
			},
			{
				confidence: "absent",
				id: "copy-exclusions",
				policy: "copy identity and caller-declared excluded cards are ineligible",
				status: "QUESTION"
			},
			{
				confidence: "absent",
				id: "copy-same-tick-order",
				policy: "same-tick plays resolve in scheduling sequence order",
				status: "QUESTION"
			},
			{
				confidence: "absent",
				id: "copy-form-semantics",
				policy: "copying selects card data, not a deployed shield or form state",
				status: "QUESTION"
			}
		]);
		PreviousCardCopyMatch = class PreviousCardCopyMatch {
			#cards;
			#commands = [];
			#copyCardId;
			#cycle;
			#events = [];
			#pending = [];
			#previous = null;
			#setup;
			#tick = 0;
			constructor(options) {
				this.#setup = validateSetup(options);
				this.#cards = new Map(this.#setup.cards.map((card) => [card.id, card]));
				this.#copyCardId = this.#setup.copyCardId;
				this.#cycle = new DeckCycle({
					deck: this.#setup.deck,
					seed: this.#setup.seed
				});
			}
			get state() {
				return clone$7({
					deck: this.#cycle.state,
					previous: this.#previous,
					tick: this.#tick
				});
			}
			get replay() {
				return clone$7(this.#events);
			}
			schedulePlay(value) {
				const command = validateCommand(value);
				if (this.#commands.length >= 1e4) throw new RangeError("copy command limit exceeded");
				if (command.tick < this.#tick) throw new RangeError("cannot schedule a copy command in a resolved tick");
				const recorded = {
					...command,
					sequence: this.#commands.length
				};
				this.#commands.push(recorded);
				this.#pending.push(recorded);
				this.#pending.sort((left, right) => left.tick - right.tick || left.sequence - right.sequence);
				return recorded.sequence;
			}
			advanceTicks(count) {
				safeInteger$4(count, 0, COPY_CARD_MAX_TICK - this.#tick, "copy advance count");
				const targetTick = this.#tick + count;
				let dueCount = 0;
				while (dueCount < this.#pending.length && this.#pending[dueCount].tick < targetTick) dueCount += 1;
				const emitted = this.#pending.splice(0, dueCount).map((command) => this.#resolve(command));
				this.#tick = targetTick;
				return clone$7(emitted);
			}
			runToTick(targetTick) {
				safeInteger$4(targetTick, 0, COPY_CARD_MAX_TICK, "copy target tick");
				if (targetTick < this.#tick) throw new RangeError("copy target tick is already resolved");
				return this.advanceTicks(targetTick - this.#tick);
			}
			serialize() {
				const serialized = canonicalJson$7({
					commands: this.#commands.map(({ cardId, tick }) => ({
						cardId,
						tick
					})),
					fixture: FIXTURE,
					setup: this.#setup,
					tick: this.#tick,
					version: 1
				});
				if (utf8ByteLength(serialized) > MAX_SNAPSHOT_BYTES$7) throw new RangeError("copy snapshot exceeds its size bound");
				return serialized;
			}
			static restore(serialized) {
				const snapshot = exactRecord$7(parseSnapshot(serialized), SNAPSHOT_KEYS$7, "copy snapshot");
				if (snapshot.fixture !== FIXTURE || snapshot.version !== 1) throw new TypeError("copy snapshot uses an unsupported rule");
				safeInteger$4(snapshot.tick, 0, COPY_CARD_MAX_TICK, "copy snapshot.tick");
				const commands = denseArray$5(snapshot.commands, DECK_MAX_PLAY_COMMANDS, "copy snapshot.commands").map(validateCommand);
				const match = new PreviousCardCopyMatch(snapshot.setup);
				for (const command of commands) match.schedulePlay(command);
				match.runToTick(snapshot.tick);
				if (match.serialize() !== serialized) throw new TypeError("copy snapshot must use canonical serialization");
				return match;
			}
			#reject(command, reason) {
				const event = {
					accepted: false,
					copiedCardId: null,
					drawnCard: null,
					effectiveCost: null,
					effectiveLevel: null,
					reason,
					requestedCardId: command.cardId,
					sequence: command.sequence,
					slot: null,
					tick: command.tick,
					type: "card-play"
				};
				this.#events.push(event);
				return event;
			}
			#resolve(command) {
				const card = this.#cards.get(command.cardId);
				if (!card) return this.#reject(command, "unknown_card");
				if (command.cardId === this.#copyCardId) {
					if (!this.#cycle.state.hand.includes(command.cardId)) {
						const deckEvent = this.#cycle.play(command.cardId);
						return this.#reject(command, deckEvent.reason);
					}
					if (this.#previous === null) return this.#reject(command, "empty_history");
					const previousCard = this.#cards.get(this.#previous.cardId);
					if (!previousCard || previousCard.excludedFromCopy) return this.#reject(command, "excluded_previous_card");
					const deckEvent = this.#cycle.play(command.cardId);
					if (!deckEvent.accepted) return this.#reject(command, deckEvent.reason);
					const event = {
						accepted: true,
						copiedCardId: previousCard.id,
						drawnCard: deckEvent.drawnCard,
						effectiveCost: Math.min(ELIXIR_CAPACITY, this.#previous.effectiveCost + 1),
						effectiveLevel: Math.min(MAX_LEVEL, this.#previous.effectiveLevel + 1),
						reason: "accepted_copy",
						requestedCardId: command.cardId,
						sequence: command.sequence,
						slot: deckEvent.slot,
						tick: command.tick,
						type: "card-play"
					};
					this.#events.push(event);
					return event;
				}
				const deckEvent = this.#cycle.play(command.cardId);
				if (!deckEvent.accepted) return this.#reject(command, deckEvent.reason);
				const event = {
					accepted: true,
					copiedCardId: null,
					drawnCard: deckEvent.drawnCard,
					effectiveCost: card.cost,
					effectiveLevel: card.level,
					reason: "accepted",
					requestedCardId: command.cardId,
					sequence: command.sequence,
					slot: deckEvent.slot,
					tick: command.tick,
					type: "card-play"
				};
				this.#previous = {
					cardId: card.id,
					effectiveCost: event.effectiveCost,
					effectiveLevel: event.effectiveLevel
				};
				this.#events.push(event);
				return event;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/spells-clone-unit.js
function deepFreeze$6(value) {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value)) deepFreeze$6(child);
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
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain data object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$4(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function integer$1(value, minimum, maximum, label) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a safe integer from ${minimum} through ${maximum}`);
	return value;
}
function runtimeId(value, label) {
	if (!(typeof value === "string" && value.length > 0 || Number.isSafeInteger(value) && value > 0)) throw new TypeError(`${label} must be a runtime card id`);
	return value;
}
function checkedPosition$3(value, label) {
	const position = exactRecord$6(value, POSITION_KEYS, label);
	return {
		x: integer$1(position.x, -1e6, MAX_COORDINATE, `${label}.x`),
		y: integer$1(position.y, -1e6, MAX_COORDINATE, `${label}.y`)
	};
}
function checkedEntity(value, index) {
	const label = `entities[${index}]`;
	const entity = exactRecord$6(value, ENTITY_KEYS, label);
	const kind = entity.kind;
	if (![
		"structure",
		"tower",
		"unit"
	].includes(kind)) throw new TypeError(`${label}.kind is unsupported`);
	if (typeof entity.dead !== "boolean" || typeof entity.deployed !== "boolean") throw new TypeError(`${label} lifecycle flags must be booleans`);
	const maxHealth = integer$1(entity.maxHealth, 1, 1e9, `${label}.maxHealth`);
	const health = integer$1(entity.health, 0, maxHealth, `${label}.health`);
	if (entity.dead !== (health === 0)) throw new TypeError(`${label}.dead must agree with health`);
	const sourceEntityId = entity.sourceEntityId === null ? null : integer$1(entity.sourceEntityId, 1, Number.MAX_SAFE_INTEGER, `${label}.sourceEntityId`);
	return {
		damage: integer$1(entity.damage, 0, 1e9, `${label}.damage`),
		dead: entity.dead,
		deployed: entity.deployed,
		health,
		id: integer$1(entity.id, 1, Number.MAX_SAFE_INTEGER, `${label}.id`),
		kind,
		maxHealth,
		ownerId: integer$1(entity.ownerId, 1, Number.MAX_SAFE_INTEGER, `${label}.ownerId`),
		position: checkedPosition$3(entity.position, `${label}.position`),
		sourceEntityId
	};
}
function checkedDeck(value, index) {
	const label = `decks[${index}]`;
	const record = exactRecord$6(value, DECK_KEYS, label);
	return {
		deck: denseArray$4(record.deck, 8, `${label}.deck`).map((cardId, cardIndex) => runtimeId(cardId, `${label}.deck[${cardIndex}]`)),
		ownerId: integer$1(record.ownerId, 1, Number.MAX_SAFE_INTEGER, `${label}.ownerId`),
		seed: record.seed
	};
}
function checkedSetup$6(value) {
	const setup = exactRecord$6(value, SETUP_KEYS$4, "clone-unit setup");
	const decks = denseArray$4(setup.decks, MAX_DECKS, "decks").map(checkedDeck);
	if (decks.length === 0 || new Set(decks.map(({ ownerId }) => ownerId)).size !== decks.length) throw new TypeError("decks must contain unique owners");
	const entities = denseArray$4(setup.entities, MAX_INITIAL_ENTITIES, "entities").map(checkedEntity);
	if (new Set(entities.map(({ id }) => id)).size !== entities.length) throw new TypeError("entities must have unique ids");
	const owners = new Set(decks.map(({ ownerId }) => ownerId));
	if (entities.some(({ ownerId }) => !owners.has(ownerId))) throw new TypeError("every entity owner must have a deck");
	const cardId = runtimeId(setup.cardId, "clone-unit setup.cardId");
	for (const [index, entry] of decks.entries()) {
		new DeckCycle({
			deck: entry.deck,
			seed: entry.seed
		});
		if (!entry.deck.includes(cardId)) throw new TypeError(`decks[${index}] must contain the effect card`);
	}
	return clone$6({
		cardId,
		decks,
		entities
	});
}
function checkedCast(value) {
	const command = exactRecord$6(value, CAST_KEYS, "cast command");
	if (command.type !== "cast") throw new TypeError("cast command.type is unsupported");
	return {
		cardId: runtimeId(command.cardId, "cast command.cardId"),
		center: checkedPosition$3(command.center, "cast command.center"),
		ownerId: integer$1(command.ownerId, 1, Number.MAX_SAFE_INTEGER, "cast command.ownerId"),
		tick: integer$1(command.tick, 0, MAX_TICK$6, "cast command.tick"),
		type: "cast"
	};
}
function checkedAdvance(value) {
	const command = exactRecord$6(value, ADVANCE_KEYS, "advance command");
	if (command.type !== "advance") throw new TypeError("advance command.type is unsupported");
	return {
		ticks: integer$1(command.ticks, 1, MAX_TICK$6, "advance command.ticks"),
		type: "advance"
	};
}
function checkedAction(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("clone-unit action must be a plain data object");
	const descriptor = Object.getOwnPropertyDescriptor(value, "type");
	if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError("clone-unit action.type must be a data property");
	return descriptor.value === "cast" ? checkedCast(value) : descriptor.value === "advance" ? checkedAdvance(value) : (() => {
		throw new TypeError("clone-unit action.type is unsupported");
	})();
}
function inRadius(entity, center) {
	const dx = BigInt(entity.position.x) - BigInt(center.x);
	const dy = BigInt(entity.position.y) - BigInt(center.y);
	return dx * dx + dy * dy <= BigInt(RADIUS_MILLITILES) ** 2n;
}
function eligible$1(entity, command) {
	return entity.ownerId === command.ownerId && entity.kind === "unit" && entity.deployed && !entity.dead && entity.health > 0 && entity.sourceEntityId === null && inRadius(entity, command.center);
}
function cloneDecks(decks) {
	return new Map([...decks.entries()].map(([ownerId, deck]) => [ownerId, DeckCycle.restore(deck.serialize())]));
}
function makeInitial(setup) {
	return {
		decks: new Map(setup.decks.map((entry) => [entry.ownerId, new DeckCycle({
			deck: entry.deck,
			seed: entry.seed
		})])),
		entities: clone$6(setup.entities).sort((left, right) => left.id - right.id),
		events: [],
		pending: [],
		tick: 0
	};
}
function snapshotMutable(mutable) {
	return {
		decks: cloneDecks(mutable.decks),
		entities: clone$6(mutable.entities),
		events: clone$6(mutable.events),
		pending: clone$6(mutable.pending),
		tick: mutable.tick
	};
}
function resolveBoundary(mutable, setup, tick) {
	const commands = mutable.pending.filter((entry) => entry.command.tick === tick).sort((left, right) => left.sequence - right.sequence);
	if (commands.length === 0) return [];
	const baseline = clone$6(mutable.entities).sort((left, right) => left.id - right.id);
	const outcomes = [];
	for (const entry of commands) {
		const deck = mutable.decks.get(entry.command.ownerId);
		if (!deck) {
			outcomes.push({ event: {
				accepted: false,
				cardId: entry.command.cardId,
				commandSequence: entry.sequence,
				ownerId: entry.command.ownerId,
				reason: "unknown_owner",
				tick,
				type: "clone-cast"
			} });
			continue;
		}
		const play = deck.play(entry.command.cardId);
		if (!play.accepted || entry.command.cardId !== setup.cardId) {
			outcomes.push({ event: {
				accepted: false,
				cardId: entry.command.cardId,
				commandSequence: entry.sequence,
				deckEvent: play,
				ownerId: entry.command.ownerId,
				reason: play.accepted ? "not_effect_card" : play.reason,
				tick,
				type: "clone-cast"
			} });
			continue;
		}
		const sources = baseline.filter((entity) => eligible$1(entity, entry.command));
		outcomes.push({ plan: {
			command: entry.command,
			sequence: entry.sequence,
			sources
		} });
	}
	const cloneCount = outcomes.reduce((total, outcome) => total + (outcome.plan?.sources.length ?? 0), 0);
	if (mutable.entities.length + cloneCount > MAX_ENTITIES) throw new RangeError("clone-unit entity limit exceeded");
	const maximumId = mutable.entities.reduce((maximum, entity) => Math.max(maximum, entity.id), 0);
	if (cloneCount > Number.MAX_SAFE_INTEGER - maximumId) throw new RangeError("clone-unit entity id space exhausted");
	let nextId = maximumId + 1;
	const events = [];
	for (const outcome of outcomes) {
		if (outcome.event) {
			events.push(outcome.event);
			continue;
		}
		const { plan } = outcome;
		const createdIds = [];
		const sourceIds = [];
		for (const source of plan.sources) {
			const created = {
				damage: source.damage,
				dead: false,
				deployed: true,
				health: CLONED_HEALTH,
				id: nextId,
				kind: "unit",
				maxHealth: CLONED_HEALTH,
				ownerId: source.ownerId,
				position: clone$6(source.position),
				sourceEntityId: source.id
			};
			nextId += 1;
			mutable.entities.push(created);
			createdIds.push(created.id);
			sourceIds.push(source.id);
			events.push({
				damage: created.damage,
				entityId: created.id,
				health: created.health,
				ownerId: created.ownerId,
				sourceEntityId: source.id,
				tick,
				type: "unit-cloned"
			});
		}
		events.push({
			accepted: true,
			cardId: plan.command.cardId,
			commandSequence: plan.sequence,
			createdIds,
			ownerId: plan.command.ownerId,
			reason: "accepted",
			sourceIds,
			tick,
			type: "clone-cast"
		});
	}
	mutable.entities.sort((left, right) => left.id - right.id);
	mutable.pending = mutable.pending.filter((entry) => entry.command.tick !== tick);
	return events;
}
function applyAdvance(mutable, setup, ticks) {
	if (ticks > MAX_TICK$6 - mutable.tick) throw new RangeError("clone-unit tick limit exceeded");
	const target = mutable.tick + ticks;
	const boundaryTicks = [...new Set(mutable.pending.map(({ command }) => command.tick).filter((tick) => tick > mutable.tick && tick <= target))].sort((left, right) => left - right);
	const emitted = [];
	for (const tick of boundaryTicks) emitted.push(...resolveBoundary(mutable, setup, tick));
	mutable.tick = target;
	mutable.events.push(...clone$6(emitted));
	return emitted;
}
/**
* Adapts the already-resolved CONTENT-007 fixture state into this effect's
* deployed-entity input. Shield damage and form transitions remain owned by
* ShieldFormEncounter; this module consumes only its current public state.
*/
function createCloneUnitEntityFromShieldForm(encounter, identity) {
	const checkedIdentity = exactRecord$6(identity, ADAPTER_KEYS, "shield-form identity");
	const resolved = typeof encounter === "string" ? ShieldFormEncounter.restore(encounter) : encounter;
	if (!(resolved instanceof ShieldFormEncounter)) throw new TypeError("encounter must be a ShieldFormEncounter or snapshot");
	const state = resolved.state;
	const currentHealth = state.form === "mobile" ? state.shield.currentHealth : state.body.currentHealth;
	const maxHealth = state.form === "mobile" ? state.shield.maxHealth : state.body.maxHealth;
	return checkedEntity({
		damage: state.combat.damage,
		dead: state.dead,
		deployed: true,
		health: currentHealth,
		id: checkedIdentity.id,
		kind: state.kind,
		maxHealth,
		ownerId: checkedIdentity.ownerId,
		position: checkedIdentity.position,
		sourceEntityId: null
	}, 0);
}
function getCloneUnitQuestionRecords() {
	return deepFreeze$6(clone$6(QUESTION_RECORDS));
}
function getCloneUnitRules() {
	return deepFreeze$6({
		cloneHealth: CLONED_HEALTH,
		effectRadiusMillitiles: RADIUS_MILLITILES,
		fidelity: "question_fixture_pending_calibration",
		rule: RULE,
		version: VERSION
	});
}
var RULE, VERSION, RADIUS_MILLITILES, CLONED_HEALTH, MAX_ACTIONS, MAX_COMMANDS$4, MAX_DECKS, MAX_ENTITIES, MAX_INITIAL_ENTITIES, MAX_SNAPSHOT_BYTES$6, MAX_TICK$6, MAX_COORDINATE, SETUP_KEYS$4, DECK_KEYS, ENTITY_KEYS, POSITION_KEYS, CAST_KEYS, ADVANCE_KEYS, SNAPSHOT_KEYS$6, ADAPTER_KEYS, QUESTION_RECORDS, DeployedUnitCloneEncounter;
function init_spells_clone_unit() {
	return (init_spells_clone_unit = __esmMin((() => {
		init_deck();
		init_shields_forms();
		RULE = "deployed-unit-echo-v1";
		VERSION = 1;
		RADIUS_MILLITILES = 3e3;
		CLONED_HEALTH = 1;
		MAX_ACTIONS = 1e3;
		MAX_COMMANDS$4 = 512;
		MAX_DECKS = 2;
		MAX_ENTITIES = 2048;
		MAX_INITIAL_ENTITIES = 256;
		MAX_SNAPSHOT_BYTES$6 = 1e6;
		MAX_TICK$6 = 1e6;
		MAX_COORDINATE = 1e6;
		SETUP_KEYS$4 = [
			"cardId",
			"decks",
			"entities"
		];
		DECK_KEYS = [
			"deck",
			"ownerId",
			"seed"
		];
		ENTITY_KEYS = [
			"damage",
			"dead",
			"deployed",
			"health",
			"id",
			"kind",
			"maxHealth",
			"ownerId",
			"position",
			"sourceEntityId"
		];
		POSITION_KEYS = ["x", "y"];
		CAST_KEYS = [
			"cardId",
			"center",
			"ownerId",
			"tick",
			"type"
		];
		ADVANCE_KEYS = ["ticks", "type"];
		SNAPSHOT_KEYS$6 = [
			"actions",
			"rule",
			"setup",
			"version"
		];
		ADAPTER_KEYS = [
			"id",
			"ownerId",
			"position"
		];
		QUESTION_RECORDS = [
			[
				"effect.radius",
				"low_confidence",
				RADIUS_MILLITILES,
				"the common row's radius is unverified"
			],
			[
				"clone.health",
				"corpus_absent",
				CLONED_HEALTH,
				"effect-dependent health is absent from the common schema"
			],
			[
				"clone.maximum_health",
				"corpus_absent",
				CLONED_HEALTH,
				"effect-dependent maximum health is absent from the common schema"
			],
			[
				"clone.damage",
				"corpus_absent",
				"retain_source_damage",
				"effect-dependent damage is absent from the common schema"
			],
			[
				"clone.owner",
				"corpus_absent",
				"retain_source_owner",
				"materialized clone ownership is absent"
			],
			[
				"clone.kind",
				"corpus_absent",
				"unit",
				"materialized clone kind is absent"
			],
			[
				"clone.deployed",
				"corpus_absent",
				true,
				"materialized clone deployment state is absent"
			],
			[
				"clone.dead",
				"corpus_absent",
				false,
				"materialized clone lifecycle state is absent"
			],
			[
				"clone.attribution",
				"corpus_absent",
				"source_entity_id",
				"materialized clone attribution is absent"
			],
			[
				"eligibility.owner",
				"corpus_absent",
				"caster_owned_only",
				"effect ownership policy is absent"
			],
			[
				"eligibility.kind",
				"corpus_absent",
				"deployed_units_only",
				"unit and structure eligibility policy is absent"
			],
			[
				"eligibility.dead",
				"corpus_absent",
				"exclude_dead",
				"dead-entity eligibility is absent"
			],
			[
				"eligibility.undeployed",
				"corpus_absent",
				"exclude_undeployed",
				"pre-deployment eligibility is absent"
			],
			[
				"eligibility.existing_clone",
				"corpus_absent",
				"exclude_clones",
				"recursive clone eligibility is absent"
			],
			[
				"geometry.edge",
				"corpus_absent",
				"inclusive_radius",
				"radius-edge inclusion is absent"
			],
			[
				"geometry.position",
				"corpus_absent",
				"copy_source_position",
				"clone placement policy is absent"
			],
			[
				"identity",
				"corpus_absent",
				"monotonic_id_after_existing_max",
				"clone entity identity allocation is absent"
			],
			[
				"ordering.targets",
				"corpus_absent",
				"ascending_source_entity_id",
				"target materialization ordering is absent"
			],
			[
				"ordering.casts",
				"corpus_absent",
				"command_insertion_order",
				"same-boundary cast ordering is absent"
			],
			[
				"boundary.batch",
				"corpus_absent",
				"pre_boundary_snapshot",
				"simultaneous cast visibility is absent"
			],
			[
				"shield_form.mobile",
				"corpus_absent",
				"clone_current_mobile_unit",
				"shield and form clone interaction is absent"
			],
			[
				"shield_form.stationary",
				"corpus_absent",
				"exclude_structure_form",
				"stationary form clone interaction is absent"
			],
			[
				"cycle.rejection",
				"corpus_absent",
				"shared_deck_cycle_result",
				"effect behavior after rejected card play is absent"
			],
			[
				"cast.empty",
				"corpus_absent",
				"accepted_no_op",
				"accepted cast behavior with no eligible units is absent"
			],
			[
				"replay",
				"corpus_absent",
				"canonical_action_replay",
				"clone-effect replay representation is absent"
			]
		].map(([key, confidence, value, reason]) => ({
			confidence,
			key,
			reason,
			status: "QUESTION",
			value
		}));
		deepFreeze$6(QUESTION_RECORDS);
		DeployedUnitCloneEncounter = class DeployedUnitCloneEncounter {
			#actions = [];
			#mutable;
			#setup;
			constructor(setup) {
				this.#setup = checkedSetup$6(setup);
				this.#mutable = makeInitial(this.#setup);
			}
			get replay() {
				return clone$6(this.#mutable.events);
			}
			get state() {
				return clone$6({
					decks: [...this.#mutable.decks.entries()].sort(([left], [right]) => left - right).map(([ownerId, deck]) => ({
						ownerId,
						state: deck.state
					})),
					entities: this.#mutable.entities,
					pending: this.#mutable.pending.map(({ command }) => command),
					tick: this.#mutable.tick
				});
			}
			scheduleCast(value) {
				const command = checkedCast(value);
				if (this.#actions.length >= MAX_ACTIONS) throw new RangeError("clone-unit action limit exceeded");
				if (this.#mutable.pending.length >= MAX_COMMANDS$4) throw new RangeError("clone-unit pending command limit exceeded");
				if (command.tick <= this.#mutable.tick) throw new RangeError("cast command.tick must be a future boundary");
				const sequence = this.#actions.filter(({ type }) => type === "cast").length;
				this.#mutable.pending.push({
					command,
					sequence
				});
				this.#actions.push(command);
				return clone$6(command);
			}
			advanceTicks(ticks) {
				const command = checkedAdvance({
					ticks,
					type: "advance"
				});
				if (this.#actions.length >= MAX_ACTIONS) throw new RangeError("clone-unit action limit exceeded");
				const staged = snapshotMutable(this.#mutable);
				const events = applyAdvance(staged, this.#setup, command.ticks);
				this.#mutable = staged;
				this.#actions.push(command);
				return clone$6(events);
			}
			serialize() {
				const serialized = canonicalJson$6({
					actions: this.#actions,
					rule: RULE,
					setup: this.#setup,
					version: VERSION
				});
				if (serialized.length > MAX_SNAPSHOT_BYTES$6) throw new RangeError("clone-unit snapshot exceeds its size bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("clone-unit snapshot must be a string");
				if (serialized.length > MAX_SNAPSHOT_BYTES$6) throw new RangeError("clone-unit snapshot exceeds its size bound");
				let parsed;
				try {
					parsed = JSON.parse(serialized);
				} catch {
					throw new TypeError("clone-unit snapshot must be valid JSON");
				}
				const snapshot = exactRecord$6(parsed, SNAPSHOT_KEYS$6, "clone-unit snapshot");
				if (snapshot.rule !== RULE || snapshot.version !== VERSION) throw new TypeError("clone-unit snapshot identity is unsupported");
				const actions = denseArray$4(snapshot.actions, MAX_ACTIONS, "clone-unit snapshot.actions").map(checkedAction);
				const encounter = new DeployedUnitCloneEncounter(snapshot.setup);
				for (const action of actions) if (action.type === "cast") encounter.scheduleCast(action);
				else encounter.advanceTicks(action.ticks);
				if (encounter.serialize() !== serialized) throw new TypeError("clone-unit snapshot is not canonical");
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/spells-spawn.js
function deepFreeze$5(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze$5(child);
		Object.freeze(value);
	}
	return value;
}
function clone$5(value) {
	return structuredClone(value);
}
function canonicalJson$5(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$5).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$5(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord$5(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	if (Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must contain only string-keyed data`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$3(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value")).some(Boolean)) throw new TypeError(`${label} must contain only dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function safeInteger$3(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
	return value;
}
function checkedPosition$2(value, label) {
	const position = exactRecord$5(value, ["x", "y"], label);
	const inset = 4100;
	const checked = {
		x: safeInteger$3(position.x, `${label}.x`, inset, ARENA_WIDTH_MILLITILES - inset),
		y: safeInteger$3(position.y, `${label}.y`, inset, ARENA_LENGTH_MILLITILES - inset)
	};
	if (!evaluateDeployment({
		destroyedOpposingLaneTowers: [],
		placementClass: "global_effect",
		point: checked,
		side: "south"
	}).legal) throw new RangeError(`${label} must be legal global-effect placement`);
	return checked;
}
function checkedSources$3(value) {
	const sources = denseArray$3(value, MAX_SOURCES$3, "spawn spell sources").map((entry, index) => {
		const source = exactRecord$5(entry, SOURCE_KEYS$3, `spawn spell source ${index}`);
		return {
			id: safeInteger$3(source.id, `spawn spell source ${index}.id`, 1),
			ownerId: safeInteger$3(source.ownerId, `spawn spell source ${index}.ownerId`, 1, MAX_OWNER_ID$3)
		};
	});
	if (sources.length < 1) throw new RangeError("spawn spell sources must not be empty");
	if (new Set(sources.map(({ id }) => id)).size !== sources.length) throw new TypeError("spawn spell source IDs must be unique");
	return sources;
}
function checkedCommands$3(value, sources) {
	const sourceIds = new Set(sources.map(({ id }) => id));
	const commands = denseArray$3(value, MAX_COMMANDS$3, "spawn spell commands").map((entry, index) => {
		const command = exactRecord$5(entry, COMMAND_KEYS$3, `spawn spell command ${index}`);
		const common = {
			id: safeInteger$3(command.id, `spawn spell command ${index}.id`, 1),
			tick: safeInteger$3(command.tick, `spawn spell command ${index}.tick`, 0, 125)
		};
		if (!sourceIds.has(command.sourceId)) throw new TypeError(`spawn spell command ${index}.sourceId is unknown`);
		if (command.type === "cast") {
			if (!VARIANTS.has(command.variant)) throw new TypeError(`spawn spell command ${index}.variant is invalid`);
			return {
				center: checkedPosition$2(command.center, `spawn spell command ${index}.center`),
				...common,
				sourceId: command.sourceId,
				type: "cast",
				variant: command.variant
			};
		}
		if (command.type !== "cancel-source" || command.center !== null || command.variant !== null) throw new TypeError(`spawn spell command ${index} fields are invalid`);
		return {
			center: null,
			...common,
			sourceId: command.sourceId,
			type: "cancel-source",
			variant: null
		};
	});
	const ids = /* @__PURE__ */ new Set();
	let priorTick = -1;
	let priorId = -1;
	for (const command of commands) {
		if (ids.has(command.id)) throw new TypeError("spawn spell command IDs must be unique");
		ids.add(command.id);
		if (command.tick < priorTick || command.tick === priorTick && command.id <= priorId) throw new TypeError("spawn spell commands must use increasing tick and command-ID order");
		priorTick = command.tick;
		priorId = command.id;
	}
	return commands;
}
function checkedSeed(value) {
	new SeededRandom(value);
	return value;
}
function checkedSetup$5(value) {
	const setup = exactRecord$5(value, SETUP_KEYS$3, "spawn spell setup");
	const sources = checkedSources$3(setup.sources);
	return {
		commands: checkedCommands$3(setup.commands, sources),
		seed: checkedSeed(setup.seed),
		sources
	};
}
function instantSetup(setup) {
	return createInstantSpellFixture({
		commands: setup.commands.map((command) => ({
			center: command.center,
			id: command.id,
			sourceId: command.sourceId,
			targetId: null,
			tick: command.tick,
			type: command.type === "cast" ? "cast" : "source-died",
			variant: command.type === "cast" ? "plain" : null
		})),
		sources: setup.sources,
		victims: []
	});
}
function cancellationTick(setup, sourceId, impactTick) {
	const cancellation = setup.commands.find((command) => command.type === "cancel-source" && command.sourceId === sourceId && command.tick > impactTick);
	return cancellation === void 0 ? null : cancellation.tick - impactTick;
}
function randomAnchor(rng, center) {
	const diameter = 8001;
	for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt += 1) {
		const x = rng.int(diameter) - AREA_RADIUS;
		const y = rng.int(diameter) - AREA_RADIUS;
		if (BigInt(x) * BigInt(x) + BigInt(y) * BigInt(y) <= BigInt(AREA_RADIUS) * BigInt(AREA_RADIUS)) return {
			x: center.x + x,
			y: center.y + y
		};
	}
	throw new RangeError("spawn spell random placement exhausted its bound");
}
function materializeChildren(runtime, effect, count, archetypeId, tick, kind) {
	const source = runtime.setup.sources.find(({ id }) => id === effect.sourceId);
	const anchors = Array.from({ length: count }, () => randomAnchor(effect.rng, effect.center));
	const spawned = runtime.materializer.materialize({
		anchor: anchors[0],
		children: Array.from({ length: count }, () => ({
			archetypeId,
			radius: CHILD_RADIUS,
			role: "primary"
		})),
		ownerId: source.ownerId,
		sourceId: source.id
	});
	for (const child of spawned) runtime.history.push({
		childId: child.id,
		effectId: effect.effectId,
		ownerId: source.ownerId,
		position: clone$5(child.data.position),
		sourceId: source.id,
		tick,
		type: "spawn-spell-child",
		variant: effect.variant
	});
	runtime.history.push({
		childIds: spawned.map(({ id }) => id),
		effectId: effect.effectId,
		kind,
		tick,
		type: "spawn-spell-batch",
		variant: effect.variant
	});
}
function startEffect(runtime, instantEvent) {
	const cast = runtime.effectCasts.get(instantEvent.effectId);
	const effect = {
		center: clone$5(cast.center),
		effectId: instantEvent.effectId,
		impactTick: instantEvent.tick,
		oracle: null,
		rng: new SeededRandom(runtime.setup.seed).fork(`spawn-spell-effect-${instantEvent.effectId}`),
		sourceId: instantEvent.sourceId,
		variant: cast.variant
	};
	runtime.history.push({
		center: clone$5(effect.center),
		effectId: effect.effectId,
		sourceId: effect.sourceId,
		tick: instantEvent.tick,
		type: "spawn-spell-impact",
		variant: effect.variant
	});
	if (effect.variant === "burst") {
		materializeChildren(runtime, effect, SPAWN_SPELL_COUNTS.burst.count, "spriglet", instantEvent.tick, "burst");
		return;
	}
	const relativeCancellation = cancellationTick(runtime.setup, effect.sourceId, effect.impactTick);
	effect.oracle = new PeriodicSpawnEncounter(createPeriodicSpawnFixture(relativeCancellation === null ? [] : [{
		tick: relativeCancellation,
		type: "lethal"
	}]));
	runtime.periodic.push(effect);
}
function initialRuntime(setup) {
	return {
		effectCasts: /* @__PURE__ */ new Map(),
		history: [],
		instant: new InstantRadiusSpellEncounter(instantSetup(setup)),
		materializer: new SpawnBatchMaterializer(),
		periodic: [],
		setup,
		tick: 0
	};
}
function advance$5(runtime) {
	const tick = runtime.tick;
	const beforeInstantLength = runtime.instant.replay.length;
	runtime.instant.step();
	const instantEvents = runtime.instant.replay.slice(beforeInstantLength);
	for (const event of instantEvents) if (event.type === "spell-cast") {
		const cast = runtime.setup.commands.find((command) => command.type === "cast" && command.sourceId === event.sourceId && command.tick === event.tick && ![...runtime.effectCasts.values()].includes(command));
		runtime.effectCasts.set(event.effectId, cast);
		runtime.history.push({
			effectId: event.effectId,
			impactTick: event.impactTick,
			sourceId: event.sourceId,
			tick,
			type: "spawn-spell-cast",
			variant: cast.variant
		});
	} else if (event.type === "spell-source-died") runtime.history.push({
		sourceId: event.sourceId,
		tick,
		type: "spawn-spell-source-cancelled"
	});
	else if (event.type === "spell-impact") startEffect(runtime, event);
	for (const effect of runtime.periodic) {
		const relativeEvents = effect.oracle.step();
		for (const event of relativeEvents) if (event.type === "spawn-batch") materializeChildren(runtime, effect, SPAWN_SPELL_COUNTS.periodic.count / 3, "wispbone", tick, `periodic-${event.batchIndex}`);
		else if (event.type === "source-killed") runtime.history.push({
			effectId: effect.effectId,
			sourceId: effect.sourceId,
			tick,
			type: "spawn-spell-periodic-cancelled"
		});
		else if (event.type === "source-expired") runtime.history.push({
			effectId: effect.effectId,
			sourceId: effect.sourceId,
			tick,
			type: "spawn-spell-periodic-expired"
		});
	}
	if (runtime.history.length > MAX_EVENTS$5) throw new RangeError("spawn spell replay exceeds its event bound");
	runtime.tick += 1;
}
function replayTo(setup, tick) {
	const runtime = initialRuntime(setup);
	for (let index = 0; index < tick; index += 1) advance$5(runtime);
	return runtime;
}
function questionRecord$5(key, value) {
	return deepFreeze$5({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		key,
		source: SOURCE$5,
		value: clone$5(value)
	});
}
function createSpawnSpellQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("spawn spell questions do not accept overrides");
	return deepFreeze$5(Object.fromEntries(Object.entries(QUESTION_VALUES$5).map(([key, value]) => [key, questionRecord$5(key, value)])));
}
function createSpawnSpellFixture(value) {
	return clone$5(checkedSetup$5(value));
}
var SOURCE$5, FIXTURE_ID$1, IMPACT_DELAY_TICKS$1, AREA_RADIUS, CHILD_RADIUS, MAX_COMMANDS$3, MAX_EVENTS$5, MAX_OWNER_ID$3, MAX_SNAPSHOT_BYTES$5, MAX_SOURCES$3, MAX_STEP_CHUNK$5, MAX_TICK$5, MAX_RANDOM_ATTEMPTS, COMMAND_KEYS$3, SOURCE_KEYS$3, SETUP_KEYS$3, SNAPSHOT_KEYS$5, IDENTITY_KEYS$5, VARIANTS, SPAWN_SPELL_IDENTITIES, SPAWN_SPELL_COUNTS, QUESTION_VALUES$5, SpawnSpellEncounter;
function init_spells_spawn() {
	return (init_spells_spawn = __esmMin((() => {
		init_arena_geometry();
		init_deployment();
		init_rng();
		init_periodic_spawns();
		init_spawn_placement();
		init_spells_instant();
		SOURCE$5 = "spawn-spell-comparison-question-fixture";
		FIXTURE_ID$1 = "original-spawn-spell-encounter-v1";
		IMPACT_DELAY_TICKS$1 = 2;
		AREA_RADIUS = 4e3;
		CHILD_RADIUS = 100;
		MAX_COMMANDS$3 = 64;
		MAX_EVENTS$5 = 4096;
		MAX_OWNER_ID$3 = 1024;
		MAX_SNAPSHOT_BYTES$5 = 262144;
		MAX_SOURCES$3 = 16;
		MAX_STEP_CHUNK$5 = 128;
		MAX_TICK$5 = 128;
		MAX_RANDOM_ATTEMPTS = 128;
		COMMAND_KEYS$3 = [
			"center",
			"id",
			"sourceId",
			"tick",
			"type",
			"variant"
		];
		SOURCE_KEYS$3 = ["id", "ownerId"];
		SETUP_KEYS$3 = [
			"commands",
			"seed",
			"sources"
		];
		SNAPSHOT_KEYS$5 = [
			"identity",
			"placementSnapshotBytes",
			"tick",
			"version"
		];
		IDENTITY_KEYS$5 = ["fixture", "setup"];
		VARIANTS = /* @__PURE__ */ new Set(["burst", "periodic"]);
		SPAWN_SPELL_IDENTITIES = deepFreeze$5([{
			displayName: "Cloudseed Flask",
			id: "cloudseed-flask",
			variant: "burst"
		}, {
			displayName: "Hollowgarden",
			id: "hollowgarden",
			variant: "periodic"
		}]);
		SPAWN_SPELL_COUNTS = deepFreeze$5({
			burst: {
				confidence: "medium",
				count: 3,
				disposition: "comparison-value"
			},
			periodic: {
				confidence: "medium",
				count: 15,
				disposition: "comparison-value"
			}
		});
		QUESTION_VALUES$5 = deepFreeze$5({
			areaRadiusMillitiles: AREA_RADIUS,
			boundaryOrdering: "commands-then-travel-impacts-in-effect-id-order-then-periodic-batches",
			burstPlacement: "one-seeded-integer-area-draw-per-child-in-child-index-order-with-first-draw-anchoring-one-boundary-formation",
			cancellation: "source-cancel-before-impact-cancels-impact-after-impact-cancels-future-periodic-batches",
			childArchetype: "original-spriglet-for-burst-and-original-wispbone-for-periodic",
			childRadiusMillitiles: CHILD_RADIUS,
			impactDelayTicks: IMPACT_DELAY_TICKS$1,
			ownership: "spawned-child-inherits-casting-source-owner-and-casting-source-id",
			periodicBatching: "three-periodic-boundaries-of-five-children-each",
			periodicCadence: "delegate-to-content-011p-question-timeline-relative-to-impact",
			placementBounds: "cast-center-must-inset-the-question-radius-and-child-radius-inside-arena",
			randomAlgorithm: "pcg32-named-effect-fork-square-rejection-with-inclusive-circle",
			randomExhaustion: "reject-atomically-after-128-outside-circle-candidates",
			restorePolicy: "canonical-identity-plus-causal-tick-replay"
		});
		SpawnSpellEncounter = class SpawnSpellEncounter {
			#runtime;
			#setup;
			constructor(setup) {
				this.#setup = checkedSetup$5(setup);
				this.#runtime = initialRuntime(this.#setup);
			}
			get children() {
				return this.#runtime.materializer.list();
			}
			get replay() {
				return clone$5(this.#runtime.history);
			}
			get placementSnapshotBytes() {
				return this.#runtime.materializer.serialize();
			}
			get state() {
				return {
					childCount: this.#runtime.materializer.list().length,
					placementSnapshotBytes: this.#runtime.materializer.serialize(),
					replay: clone$5(this.#runtime.history),
					tick: this.#runtime.tick
				};
			}
			step() {
				return this.stepMany(1);
			}
			stepMany(count) {
				safeInteger$3(count, "spawn spell step count", 0, MAX_STEP_CHUNK$5);
				if (count > MAX_TICK$5 - this.#runtime.tick) throw new RangeError("spawn spell step count exceeds encounter bound");
				const candidate = replayTo(this.#setup, this.#runtime.tick);
				const start = candidate.history.length;
				for (let index = 0; index < count; index += 1) advance$5(candidate);
				const events = candidate.history.slice(start);
				this.#runtime = candidate;
				return clone$5(events);
			}
			run() {
				return this.stepMany(MAX_TICK$5 - this.#runtime.tick);
			}
			serialize() {
				const serialized = canonicalJson$5({
					identity: {
						fixture: FIXTURE_ID$1,
						setup: this.#setup
					},
					placementSnapshotBytes: this.#runtime.materializer.serialize(),
					tick: this.#runtime.tick,
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$5) throw new RangeError("spawn spell snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("spawn spell snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$5) throw new RangeError("spawn spell snapshot exceeds its byte bound");
				let value;
				try {
					value = JSON.parse(serialized);
				} catch {
					throw new TypeError("spawn spell snapshot must be valid JSON");
				}
				if (canonicalJson$5(value) !== serialized) throw new TypeError("spawn spell snapshot must be canonical duplicate-free JSON");
				const snapshot = exactRecord$5(value, SNAPSHOT_KEYS$5, "spawn spell snapshot");
				if (snapshot.version !== 1) throw new TypeError("spawn spell snapshot version is unsupported");
				const identity = exactRecord$5(snapshot.identity, IDENTITY_KEYS$5, "spawn spell snapshot.identity");
				if (identity.fixture !== FIXTURE_ID$1) throw new TypeError("spawn spell snapshot fixture is unsupported");
				safeInteger$3(snapshot.tick, "spawn spell snapshot.tick", 0, MAX_TICK$5);
				const encounter = new SpawnSpellEncounter(identity.setup);
				const expected = replayTo(encounter.#setup, snapshot.tick);
				const placement = SpawnBatchMaterializer.restore(snapshot.placementSnapshotBytes);
				if (placement.serialize() !== expected.materializer.serialize()) throw new TypeError("spawn spell nested placement snapshot is forged or noncausal");
				expected.materializer = placement;
				encounter.#runtime = expected;
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/spells-periodic.js
function clone$4(value) {
	return structuredClone(value);
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
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$2(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value")).some(Boolean)) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function integer(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
	return value;
}
function id(value, label, nullable = false) {
	if (nullable && value === null) return null;
	return integer(value, label, 1);
}
function position(value, label) {
	const checked = exactRecord$4(value, ["x", "y"], label);
	return {
		x: integer(checked.x, `${label}.x`, 0, ARENA_WIDTH_MILLITILES),
		y: integer(checked.y, `${label}.y`, 0, ARENA_LENGTH_MILLITILES)
	};
}
function checkedSources$2(value) {
	const sources = denseArray$2(value, MAX_SOURCES$2, "periodic spell sources").map((entry, index) => {
		const source = exactRecord$4(entry, SOURCE_KEYS$2, `source ${index}`);
		return {
			id: id(source.id, `source ${index}.id`),
			ownerId: integer(source.ownerId, `source ${index}.ownerId`, 1, MAX_OWNER_ID$2)
		};
	});
	if (sources.length === 0) throw new RangeError("sources must not be empty");
	if (new Set(sources.map(({ id: value }) => value)).size !== sources.length) throw new TypeError("source IDs must be unique");
	return sources;
}
function checkedTargets(value) {
	const targets = denseArray$2(value, MAX_TARGETS, "periodic spell targets").map((entry, index) => {
		const target = exactRecord$4(entry, TARGET_KEYS, `target ${index}`);
		if (!TARGET_KINDS.has(target.kind)) throw new TypeError(`target ${index}.kind is invalid`);
		if (!TARGET_LAYERS.has(target.layer)) throw new TypeError(`target ${index}.layer is invalid`);
		if (typeof target.targetable !== "boolean") throw new TypeError(`target ${index}.targetable must be boolean`);
		const radius = integer(target.radius, `target ${index}.radius`, 0, MAX_RADIUS$2);
		const where = position(target.position, `target ${index}.position`);
		if (where.x < radius || where.x > 18e3 - radius || where.y < radius || where.y > 32e3 - radius) throw new RangeError(`target ${index} circle must fit in arena`);
		return {
			health: integer(target.health, `target ${index}.health`, 1, MAX_HEALTH$2),
			id: id(target.id, `target ${index}.id`),
			kind: target.kind,
			layer: target.layer,
			ownerId: integer(target.ownerId, `target ${index}.ownerId`, 1, MAX_OWNER_ID$2),
			position: where,
			radius,
			targetable: target.targetable
		};
	});
	if (new Set(targets.map(({ id: value }) => value)).size !== targets.length) throw new TypeError("target IDs must be unique");
	return targets.sort((left, right) => left.id - right.id);
}
function checkedCommands$2(value, sources, targets) {
	const sourceIds = new Set(sources.map(({ id: value }) => value));
	const targetIds = new Set(targets.map(({ id: value }) => value));
	const commands = denseArray$2(value, MAX_COMMANDS$2, "periodic spell commands").map((entry, index) => {
		const command = exactRecord$4(entry, COMMAND_KEYS$2, `command ${index}`);
		const checked = {
			center: command.center,
			id: id(command.id, `command ${index}.id`),
			sourceId: command.sourceId,
			targetId: command.targetId,
			tick: integer(command.tick, `command ${index}.tick`, 0, 511),
			type: command.type,
			variant: command.variant
		};
		if (!COMMAND_TYPES$2.has(checked.type)) throw new TypeError(`command ${index}.type is invalid`);
		if (checked.type === "cast") {
			checked.center = position(checked.center, `command ${index}.center`);
			checked.sourceId = id(checked.sourceId, `command ${index}.sourceId`);
			if (!sourceIds.has(checked.sourceId)) throw new TypeError(`command ${index}.sourceId is missing`);
			if (!Object.hasOwn(ARCHETYPES, checked.variant)) throw new TypeError(`command ${index}.variant is invalid`);
			if (checked.targetId !== null) throw new TypeError(`command ${index}.targetId must be null`);
			if (checked.tick + ARCHETYPES[checked.variant].firstOffsetTicks + (ARCHETYPES[checked.variant].tickCount - 1) * ARCHETYPES[checked.variant].cadenceTicks >= MAX_TICK$4) throw new RangeError(`command ${index} cannot fit all periodic ticks`);
		} else {
			checked.center = null;
			checked.variant = null;
			if (command.center !== null || command.variant !== null) throw new TypeError(`command ${index} has inapplicable cast fields`);
			if (checked.type === "source-died") {
				checked.sourceId = id(checked.sourceId, `command ${index}.sourceId`);
				if (!sourceIds.has(checked.sourceId) || checked.targetId !== null) throw new TypeError(`command ${index} source death is invalid`);
			} else {
				checked.targetId = id(checked.targetId, `command ${index}.targetId`);
				if (!targetIds.has(checked.targetId) || checked.sourceId !== null) throw new TypeError(`command ${index} target death is invalid`);
			}
		}
		return checked;
	});
	if (new Set(commands.map(({ id: value }) => value)).size !== commands.length) throw new TypeError("command IDs must be unique");
	let priorTick = -1;
	for (const command of commands) {
		if (command.tick < priorTick) throw new TypeError("commands must have nondecreasing ticks");
		priorTick = command.tick;
	}
	return commands;
}
function checkedSetup$4(value) {
	const setup = exactRecord$4(value, SETUP_KEYS$2, "periodic spell setup");
	const sources = checkedSources$2(setup.sources);
	const targets = checkedTargets(setup.targets);
	return {
		commands: checkedCommands$2(setup.commands, sources, targets),
		sources,
		targets
	};
}
function initialState$4(setup) {
	const area = new AreaDamageSystem();
	for (const target of setup.targets) area.add(target.id, target.health);
	return {
		areaSerialized: area.serialize(),
		effects: [],
		history: [],
		nextEffectId: 1,
		sources: setup.sources.map((source) => ({
			...source,
			alive: true
		})),
		targets: setup.targets.map((target) => ({
			...clone$4(target),
			alive: true,
			slowSourceId: null,
			slowUntilTick: null
		})),
		tick: 0
	};
}
function scaledDamage(value, numerator, denominator) {
	const product = BigInt(value) * BigInt(numerator);
	return Number((product + BigInt(Math.floor(denominator / 2))) / BigInt(denominator));
}
function candidate(target) {
	return {
		alive: target.alive,
		id: target.id,
		kind: target.kind === "crown" ? "structure" : target.kind,
		layer: target.layer,
		position: clone$4(target.position),
		radius: target.radius,
		targetable: target.targetable
	};
}
function applyDamageBatch(area, state, effect, targets, amount, events) {
	if (targets.length === 0) return [];
	const archetype = ARCHETYPES[effect.variant];
	const result = area.resolve({
		center: effect.center,
		damage: amount,
		mode: targets[0].kind === "troop" ? archetype.targetMode : "buildings",
		radius: archetype.radius,
		tick: state.tick
	}, targets.map(candidate));
	const hitIds = new Set(result.hitTargetIds);
	for (const primitiveEvent of result.events) events.push({
		effectId: effect.id,
		primitiveEffectId: result.effectId,
		primitiveEvent,
		tick: state.tick,
		type: "periodic-damage-primitive"
	});
	for (const target of targets) {
		const health = area.get(target.id);
		target.health = health.currentHealth;
		target.alive = !health.dead;
	}
	return targets.filter((target) => hitIds.has(target.id));
}
function applySlow(state, effect, source, target, events) {
	const slowProgress = SLOW_PROGRESS_TWENTIETHS[effect.variant];
	const primitiveEvent = new TimedMovementAttackSlowEncounter(createSlowFixture([{
		sourceId: source.id,
		targetId: null,
		tick: 0,
		type: "slow"
	}], 1, slowProgress)).step().find(({ type }) => type === "slow-applied");
	target.slowSourceId = source.id;
	target.slowUntilTick = state.tick + primitiveEvent.untilTick;
	events.push({
		effectId: effect.id,
		primitiveEvent,
		sourceId: source.id,
		slowProgress: clone$4(slowProgress),
		targetId: target.id,
		tick: state.tick,
		type: "periodic-slow",
		untilTick: target.slowUntilTick
	});
}
function exactPullComponent(component, distance, lengthSquared) {
	if (component === 0n || lengthSquared === 0n) return 0n;
	const magnitude = component < 0n ? -component : component;
	const scaledSquared = magnitude * distance * magnitude * distance;
	let lower = 0n;
	let upper = distance;
	while (lower < upper) {
		const candidate = lower + upper + 1n >> 1n;
		if (candidate * candidate * lengthSquared <= scaledSquared) lower = candidate;
		else upper = candidate - 1n;
	}
	return component < 0n ? -lower : lower;
}
function applyPull(state, effect, target, events) {
	const dx = BigInt(effect.center.x - target.position.x);
	const dy = BigInt(effect.center.y - target.position.y);
	const lengthSquared = dx * dx + dy * dy;
	let requestedX = 0n;
	let requestedY = 0n;
	if (lengthSquared !== 0n) {
		const distance = BigInt(QUESTION_VALUES$4.pullDistanceMillitiles);
		requestedX = exactPullComponent(dx, distance, lengthSquared);
		requestedY = exactPullComponent(dy, distance, lengthSquared);
	}
	const rawX = BigInt(target.position.x) + requestedX;
	const rawY = BigInt(target.position.y) + requestedY;
	const minX = BigInt(target.radius);
	const maxX = BigInt(ARENA_WIDTH_MILLITILES - target.radius);
	const minY = BigInt(target.radius);
	const maxY = BigInt(ARENA_LENGTH_MILLITILES - target.radius);
	const finalX = rawX < minX ? minX : rawX > maxX ? maxX : rawX;
	const finalY = rawY < minY ? minY : rawY > maxY ? maxY : rawY;
	const origin = clone$4(target.position);
	target.position = {
		x: Number(finalX),
		y: Number(finalY)
	};
	events.push({
		applied: {
			x: target.position.x - origin.x,
			y: target.position.y - origin.y
		},
		effectId: effect.id,
		origin,
		position: clone$4(target.position),
		requested: {
			x: Number(requestedX),
			y: Number(requestedY)
		},
		targetId: target.id,
		tick: state.tick,
		type: "periodic-pull"
	});
}
function resolveEffectTick(area, state, effect, events) {
	const source = state.sources.find(({ id: value }) => value === effect.sourceId);
	if (!source.alive) return;
	const archetype = ARCHETYPES[effect.variant];
	events.push({
		center: clone$4(effect.center),
		effectId: effect.id,
		ordinal: effect.resolvedTicks,
		sourceId: source.id,
		tick: state.tick,
		type: "periodic-tick",
		variant: effect.variant
	});
	const eligible = state.targets.filter((target) => target.alive && target.targetable && target.ownerId !== source.ownerId && (archetype.targetMode === "air_and_ground" || target.layer === "ground"));
	const troops = eligible.filter(({ kind }) => kind === "troop");
	const structures = eligible.filter(({ kind }) => kind === "structure");
	const crowns = eligible.filter(({ kind }) => kind === "crown");
	const hit = [
		...applyDamageBatch(area, state, effect, troops, archetype.damage, events),
		...applyDamageBatch(area, state, effect, structures, scaledDamage(archetype.damage, archetype.structureNumerator, archetype.structureDenominator), events),
		...applyDamageBatch(area, state, effect, crowns, scaledDamage(archetype.damage, archetype.towerNumerator, archetype.towerDenominator), events)
	].sort((left, right) => left.id - right.id);
	for (const target of hit) {
		if (!target.alive || target.kind !== "troop") continue;
		if (archetype.variant === "pull") applyPull(state, effect, target, events);
		else applySlow(state, effect, source, target, events);
	}
	effect.resolvedTicks += 1;
	effect.nextTick += archetype.cadenceTicks;
}
function applyCommand$4(state, command, events) {
	if (command.type === "cast") {
		if (state.effects.length >= MAX_EFFECTS) throw new RangeError("periodic spell active-effect bound exceeded");
		if (state.nextEffectId === Number.MAX_SAFE_INTEGER) throw new RangeError("periodic spell effect ID space is exhausted");
		const effectId = state.nextEffectId;
		state.nextEffectId += 1;
		const source = state.sources.find(({ id: value }) => value === command.sourceId);
		if (!source.alive) {
			events.push({
				effectId,
				reason: "source-dead",
				sourceId: source.id,
				tick: state.tick,
				type: "periodic-cast-cancelled",
				variant: command.variant
			});
			return;
		}
		const effect = {
			center: clone$4(command.center),
			id: effectId,
			nextTick: state.tick + ARCHETYPES[command.variant].firstOffsetTicks,
			resolvedTicks: 0,
			sourceId: command.sourceId,
			variant: command.variant
		};
		state.effects.push(effect);
		events.push({
			effectId: effect.id,
			firstTick: effect.nextTick,
			sourceId: effect.sourceId,
			tick: state.tick,
			type: "periodic-cast",
			variant: effect.variant
		});
		return;
	}
	if (command.type === "source-died") {
		const source = state.sources.find(({ id: value }) => value === command.sourceId);
		if (source.alive) {
			source.alive = false;
			const cancelled = state.effects.filter(({ sourceId }) => sourceId === source.id).map(({ id: value }) => value).sort((left, right) => left - right);
			state.effects = state.effects.filter(({ sourceId }) => sourceId !== source.id);
			events.push({
				cancelledEffectIds: cancelled,
				sourceId: source.id,
				tick: state.tick,
				type: "periodic-source-died"
			});
		}
		return;
	}
	const target = state.targets.find(({ id: value }) => value === command.targetId);
	if (target.alive) {
		target.alive = false;
		target.health = 0;
		events.push({
			targetId: target.id,
			tick: state.tick,
			type: "periodic-target-died"
		});
	}
}
function advance$4(state, setup) {
	const area = AreaDamageSystem.restore(state.areaSerialized);
	const events = [];
	const dueCommands = setup.commands.filter(({ tick }) => tick === state.tick).sort((left, right) => left.id - right.id);
	for (const command of dueCommands) applyCommand$4(state, command, events);
	const dueEffects = state.effects.filter(({ nextTick, resolvedTicks, variant }) => nextTick === state.tick && resolvedTicks < ARCHETYPES[variant].tickCount).sort((left, right) => left.id - right.id);
	for (const effect of dueEffects) resolveEffectTick(area, state, effect, events);
	state.effects = state.effects.filter((effect) => effect.resolvedTicks < ARCHETYPES[effect.variant].tickCount);
	if (state.history.length + events.length > MAX_EVENTS$4) throw new RangeError("periodic spell replay exceeds its event bound");
	state.areaSerialized = area.serialize();
	state.history.push(...clone$4(events));
	state.tick += 1;
	return events;
}
function questionRecord$4(key, value) {
	return deepFreeze$4({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		key,
		source: SOURCE$4,
		value: clone$4(value)
	});
}
function createPeriodicSpellCatalog(...args) {
	if (args.length !== 0) throw new TypeError("periodic spell catalog does not accept overrides");
	return createCardCatalog(CARD_DEFINITIONS);
}
function createPeriodicSpellQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("periodic spell questions do not accept overrides");
	return deepFreeze$4(Object.fromEntries(Object.entries(QUESTION_VALUES$4).map(([key, value]) => [key, questionRecord$4(key, value)])));
}
function createPeriodicSpellFixture(value) {
	return clone$4(checkedSetup$4(value));
}
var SOURCE$4, FIXTURE_ID, MAX_COMMANDS$2, MAX_EFFECTS, MAX_EVENTS$4, MAX_HEALTH$2, MAX_OWNER_ID$2, MAX_RADIUS$2, MAX_SNAPSHOT_BYTES$4, MAX_SOURCES$2, MAX_STEP_CHUNK$4, MAX_TARGETS, MAX_TICK$4, IMPACT_DELAY_TICKS, SLOW_PROGRESS_TWENTIETHS, ARCHETYPES, CARD_DEFINITIONS, QUESTION_VALUES$4, SETUP_KEYS$2, SOURCE_KEYS$2, TARGET_KEYS, COMMAND_KEYS$2, SNAPSHOT_KEYS$4, IDENTITY_KEYS$4, COMMAND_TYPES$2, TARGET_KINDS, TARGET_LAYERS, PeriodicAreaSpellEncounter;
function init_spells_periodic() {
	return (init_spells_periodic = __esmMin((() => {
		init_arena_geometry();
		init_area_damage();
		init_schema();
		init_special_combat_slow();
		SOURCE$4 = "unsourced-periodic-area-spell-composition";
		FIXTURE_ID = "periodic-area-spell-question-v1";
		MAX_COMMANDS$2 = 96;
		MAX_EFFECTS = 32;
		MAX_EVENTS$4 = 32768;
		MAX_HEALTH$2 = 1e6;
		MAX_OWNER_ID$2 = 1024;
		MAX_RADIUS$2 = 9e3;
		MAX_SNAPSHOT_BYTES$4 = 262144;
		MAX_SOURCES$2 = 16;
		MAX_STEP_CHUNK$4 = 512;
		MAX_TARGETS = 64;
		MAX_TICK$4 = 512;
		IMPACT_DELAY_TICKS = 2;
		SLOW_PROGRESS_TWENTIETHS = Object.freeze({
			"blight-ring": Object.freeze({
				attackWorkTwentieths: 20,
				movementTwentieths: 17
			}),
			"fault-pulse": Object.freeze({
				attackWorkTwentieths: 20,
				movementTwentieths: 10
			})
		});
		ARCHETYPES = Object.freeze({
			"blight-ring": Object.freeze({
				cadenceTicks: 60,
				cost: 4,
				damage: 91,
				durationTicks: 421,
				firstOffsetTicks: 2,
				radius: 3500,
				targetMode: "air_and_ground",
				tickCount: 8,
				towerDenominator: 10,
				towerNumerator: 3,
				structureDenominator: 1,
				structureNumerator: 1,
				variant: "slow"
			}),
			"fault-pulse": Object.freeze({
				cadenceTicks: 60,
				cost: 3,
				damage: 81,
				durationTicks: 121,
				firstOffsetTicks: 2,
				radius: 3500,
				targetMode: "ground",
				tickCount: 3,
				towerDenominator: 10,
				towerNumerator: 3,
				structureDenominator: 1,
				structureNumerator: 3,
				variant: "slow"
			}),
			"gravity-well": Object.freeze({
				cadenceTicks: 30,
				cost: 3,
				damage: 84,
				durationTicks: 31,
				firstOffsetTicks: 2,
				radius: 5500,
				targetMode: "air_and_ground",
				tickCount: 2,
				towerDenominator: 10,
				towerNumerator: 3,
				structureDenominator: 1,
				structureNumerator: 1,
				variant: "pull"
			})
		});
		CARD_DEFINITIONS = [
			{
				areaDamageRadiusMillitiles: 3500,
				components: [],
				cost: 4,
				count: 1,
				damage: 91,
				deployTimeTicks: null,
				displayName: "Blight Ring",
				firstHitTicks: null,
				hitSpeedTicks: null,
				hitpoints: null,
				id: "blight-ring",
				kind: "effect",
				movementMillitilesPerSecond: null,
				rangeMillitiles: null,
				rarity: "mythic",
				sightRangeMillitiles: null,
				targetMode: "ground-and-air"
			},
			{
				areaDamageRadiusMillitiles: 5500,
				components: [],
				cost: 3,
				count: 1,
				damage: 84,
				deployTimeTicks: null,
				displayName: "Gravity Well",
				firstHitTicks: null,
				hitSpeedTicks: null,
				hitpoints: null,
				id: "gravity-well",
				kind: "effect",
				movementMillitilesPerSecond: null,
				rangeMillitiles: null,
				rarity: "mythic",
				sightRangeMillitiles: null,
				targetMode: "ground-and-air"
			},
			{
				areaDamageRadiusMillitiles: 3500,
				components: [],
				cost: 3,
				count: 1,
				damage: 81,
				deployTimeTicks: null,
				displayName: "Fault Pulse",
				firstHitTicks: null,
				hitSpeedTicks: null,
				hitpoints: null,
				id: "fault-pulse",
				kind: "effect",
				movementMillitilesPerSecond: null,
				rangeMillitiles: null,
				rarity: "uncommon",
				sightRangeMillitiles: null,
				targetMode: "ground"
			}
		];
		QUESTION_VALUES$4 = Object.freeze({
			boundaryOrdering: "commands-by-ascending-id-then-effects-by-ascending-id-then-target-class-batches-then-status",
			cadenceTicks: Object.freeze({
				"blight-ring": 60,
				"fault-pulse": 60,
				"gravity-well": 30
			}),
			castIdentity: "monotonic-effect-id-in-cast-command-order",
			crownTowerDamageRatio: Object.freeze({
				denominator: 10,
				numerator: 3
			}),
			crownTowerRounding: "nearest-integer-half-up",
			durationTicks: Object.freeze({
				"blight-ring": 421,
				"fault-pulse": 121,
				"gravity-well": 31
			}),
			effectExpiry: "final-tick-resolves-then-effect-is-complete",
			firstTickOffset: IMPACT_DELAY_TICKS,
			geometryAndDamageComposition: "each-target-class-batch-delegates-to-shared-area-damage-system",
			hostileOwnership: "only-targets-with-owner-different-from-source",
			mappedDamageConfidence: "reference-corpus-unverified-question",
			mappedRadiusConfidence: "reference-corpus-unverified-question",
			mappedTargetClassConfidence: "reference-corpus-unverified-question",
			pullArenaClamp: "radius-inset-closed-arena",
			pullDistanceMillitiles: 1e3,
			pullEligibility: "surviving-hostile-troops-only",
			pullComponentRounding: "largest-magnitude-integer-satisfying-q-squared-times-length-squared-not-greater-than-scaled-component-squared-then-restore-sign",
			pullProjection: "toward-center-exact-integer-euclidean-components-truncated-toward-zero",
			pullZeroVector: "coincident-target-does-not-move",
			slowComposition: "movement-rate-is-source-backed; activation-and-refresh-remain-question",
			slowEligibility: "surviving-hostile-troops-only",
			slowRefresh: "each-damaging-tick-refreshes-one-nonstacking-status-slot",
			sourceDeathPolicy: "cancel-all-remaining-ticks-before-same-boundary-effects",
			stableTargetOrdering: "ascending-target-id-within-each-effect",
			structureDamageRatio: Object.freeze({
				"blight-ring": Object.freeze({
					denominator: 1,
					numerator: 1
				}),
				"fault-pulse": Object.freeze({
					denominator: 1,
					numerator: 3
				}),
				"gravity-well": Object.freeze({
					denominator: 1,
					numerator: 1
				})
			}),
			targetDeathPolicy: "command-first-death-excludes-target-from-that-boundary",
			tickCount: Object.freeze({
				"blight-ring": 8,
				"fault-pulse": 3,
				"gravity-well": 2
			}),
			towerModifierScope: "crown-kind-only"
		});
		SETUP_KEYS$2 = [
			"commands",
			"sources",
			"targets"
		];
		SOURCE_KEYS$2 = ["id", "ownerId"];
		TARGET_KEYS = [
			"health",
			"id",
			"kind",
			"layer",
			"ownerId",
			"position",
			"radius",
			"targetable"
		];
		COMMAND_KEYS$2 = [
			"center",
			"id",
			"sourceId",
			"targetId",
			"tick",
			"type",
			"variant"
		];
		SNAPSHOT_KEYS$4 = [
			"identity",
			"tick",
			"version"
		];
		IDENTITY_KEYS$4 = ["fixture", "setup"];
		COMMAND_TYPES$2 = /* @__PURE__ */ new Set([
			"cast",
			"source-died",
			"target-died"
		]);
		TARGET_KINDS = /* @__PURE__ */ new Set([
			"crown",
			"structure",
			"troop"
		]);
		TARGET_LAYERS = /* @__PURE__ */ new Set(["air", "ground"]);
		PeriodicAreaSpellEncounter = class PeriodicAreaSpellEncounter {
			#setup;
			#state;
			constructor(setup) {
				this.#setup = checkedSetup$4(setup);
				this.#state = initialState$4(this.#setup);
			}
			get replay() {
				return clone$4(this.#state.history);
			}
			get state() {
				return clone$4(this.#state);
			}
			step() {
				return this.stepMany(1);
			}
			stepMany(count) {
				integer(count, "periodic spell step count", 0, MAX_STEP_CHUNK$4);
				if (count > MAX_TICK$4 - this.#state.tick) throw new RangeError("periodic spell step count exceeds encounter bound");
				const candidate = clone$4(this.#state);
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...advance$4(candidate, this.#setup));
				this.#state = candidate;
				return clone$4(events);
			}
			run() {
				return this.stepMany(MAX_TICK$4 - this.#state.tick);
			}
			serialize() {
				const serialized = canonicalJson$4({
					identity: {
						fixture: FIXTURE_ID,
						setup: this.#setup
					},
					tick: this.#state.tick,
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$4) throw new RangeError("periodic spell snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("periodic spell snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$4) throw new RangeError("periodic spell snapshot exceeds its byte bound");
				let value;
				try {
					value = JSON.parse(serialized);
				} catch {
					throw new TypeError("periodic spell snapshot must be valid JSON");
				}
				if (canonicalJson$4(value) !== serialized) throw new TypeError("periodic spell snapshot must be canonical duplicate-free JSON");
				const snapshot = exactRecord$4(value, SNAPSHOT_KEYS$4, "periodic spell snapshot");
				if (snapshot.version !== 1) throw new TypeError("periodic spell snapshot version is unsupported");
				const identity = exactRecord$4(snapshot.identity, IDENTITY_KEYS$4, "periodic spell snapshot.identity");
				if (identity.fixture !== FIXTURE_ID) throw new TypeError("periodic spell snapshot fixture is unsupported");
				integer(snapshot.tick, "periodic spell snapshot.tick", 0, MAX_TICK$4);
				const encounter = new PeriodicAreaSpellEncounter(identity.setup);
				encounter.stepMany(snapshot.tick);
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/spells-travel-line.js
function clone$3(value) {
	return structuredClone(value);
}
function deepFreeze$3(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze$3(child);
		Object.freeze(value);
	}
	return value;
}
function canonicalJson$3(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$3).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$3(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord$3(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$1(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value")).some(Boolean)) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function safeInteger$2(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
	return value;
}
function checkedId$1(value, label, nullable = false) {
	if (nullable && value === null) return null;
	return safeInteger$2(value, label, 1);
}
function checkedPosition$1(value, label) {
	const position = exactRecord$3(value, ["x", "y"], label);
	return {
		x: safeInteger$2(position.x, `${label}.x`, 0, ARENA_WIDTH_MILLITILES),
		y: safeInteger$2(position.y, `${label}.y`, 0, ARENA_LENGTH_MILLITILES)
	};
}
function checkedSources$1(value) {
	const sources = denseArray$1(value, MAX_SOURCES$1, "travel spell sources").map((entry, index) => {
		const source = exactRecord$3(entry, SOURCE_KEYS$1, `travel spell source ${index}`);
		return {
			id: checkedId$1(source.id, `travel spell source ${index}.id`),
			ownerId: safeInteger$2(source.ownerId, `travel spell source ${index}.ownerId`, 1, MAX_OWNER_ID$1),
			position: checkedPosition$1(source.position, `travel spell source ${index}.position`)
		};
	});
	if (sources.length < 1) throw new RangeError("travel spell sources must not be empty");
	const ids = /* @__PURE__ */ new Set();
	for (const source of sources) {
		if (ids.has(source.id)) throw new TypeError("travel spell source IDs must be unique");
		ids.add(source.id);
	}
	return sources;
}
function checkedVictims$1(value) {
	const victims = denseArray$1(value, MAX_VICTIMS$1, "travel spell victims").map((entry, index) => {
		const label = `travel spell victim ${index}`;
		const victim = exactRecord$3(entry, VICTIM_KEYS$1, label);
		if (!VICTIM_KINDS$1.has(victim.kind)) throw new TypeError(`${label}.kind is invalid`);
		if (!VICTIM_LAYERS$1.has(victim.layer)) throw new TypeError(`${label}.layer is invalid`);
		if (victim.combatTargetMode !== null && !COMBAT_TARGET_MODES$1.has(victim.combatTargetMode)) throw new TypeError(`${label}.combatTargetMode is invalid`);
		if (typeof victim.targetable !== "boolean") throw new TypeError(`${label}.targetable must be boolean`);
		const combatTargetId = checkedId$1(victim.combatTargetId, `${label}.combatTargetId`, true);
		if (combatTargetId === null !== (victim.combatTargetMode === null)) throw new TypeError(`${label} combat target ID and mode must both be null or non-null`);
		const position = checkedPosition$1(victim.position, `${label}.position`);
		const radius = safeInteger$2(victim.radius, `${label}.radius`, 0, MAX_RADIUS$1);
		if (position.x < radius || position.x > 18e3 - radius || position.y < radius || position.y > 32e3 - radius) throw new RangeError(`${label} must fit in the radius-inset arena`);
		return {
			combatTargetId,
			combatTargetMode: victim.combatTargetMode,
			health: safeInteger$2(victim.health, `${label}.health`, 1, MAX_HEALTH$1),
			id: checkedId$1(victim.id, `${label}.id`),
			kind: victim.kind,
			layer: victim.layer,
			ownerId: safeInteger$2(victim.ownerId, `${label}.ownerId`, 1, MAX_OWNER_ID$1),
			position,
			radius,
			targetable: victim.targetable
		};
	});
	const ids = /* @__PURE__ */ new Set();
	for (const victim of victims) {
		if (ids.has(victim.id)) throw new TypeError("travel spell victim IDs must be unique");
		ids.add(victim.id);
	}
	return victims;
}
function checkedCommands$1(value, sources, victims) {
	const sourceIds = new Set(sources.map(({ id }) => id));
	const victimIds = new Set(victims.map(({ id }) => id));
	const commands = denseArray$1(value, MAX_COMMANDS$1, "travel spell commands").map((entry, index) => {
		const label = `travel spell command ${index}`;
		const command = exactRecord$3(entry, COMMAND_KEYS$1, label);
		if (!COMMAND_TYPES$1.has(command.type)) throw new TypeError(`${label}.type is invalid`);
		const base = {
			center: null,
			effectId: null,
			id: checkedId$1(command.id, `${label}.id`),
			sourceId: null,
			targetId: null,
			tick: safeInteger$2(command.tick, `${label}.tick`, 0, 127),
			type: command.type
		};
		if (command.type === "cast") {
			base.center = checkedPosition$1(command.center, `${label}.center`);
			base.sourceId = checkedId$1(command.sourceId, `${label}.sourceId`);
			if (!sourceIds.has(base.sourceId) || command.effectId !== null || command.targetId !== null) throw new TypeError(`${label} has invalid cast fields`);
		} else if (command.type === "source-died") {
			base.sourceId = checkedId$1(command.sourceId, `${label}.sourceId`);
			if (!sourceIds.has(base.sourceId) || command.center !== null || command.effectId !== null || command.targetId !== null) throw new TypeError(`${label} has invalid source death fields`);
		} else if (command.type === "target-died") {
			base.targetId = checkedId$1(command.targetId, `${label}.targetId`);
			if (!victimIds.has(base.targetId) || command.center !== null || command.effectId !== null || command.sourceId !== null) throw new TypeError(`${label} has invalid target death fields`);
		} else {
			base.effectId = checkedId$1(command.effectId, `${label}.effectId`);
			if (command.center !== null || command.sourceId !== null || command.targetId !== null) throw new TypeError(`${label} has invalid cancellation fields`);
		}
		return base;
	});
	const ids = /* @__PURE__ */ new Set();
	let priorTick = -1;
	let priorId = -1;
	for (const command of commands) {
		if (ids.has(command.id)) throw new TypeError("travel spell command IDs must be unique");
		ids.add(command.id);
		if (command.tick < priorTick || command.tick === priorTick && command.id <= priorId) throw new TypeError("travel spell commands must use increasing tick and command-ID order");
		priorTick = command.tick;
		priorId = command.id;
	}
	return commands;
}
function checkedSetup$3(value) {
	const setup = exactRecord$3(value, SETUP_KEYS$1, "travel spell setup");
	const sources = checkedSources$1(setup.sources);
	const victims = checkedVictims$1(setup.victims);
	const allIds = new Set(sources.map(({ id }) => id));
	for (const victim of victims) {
		if (allIds.has(victim.id)) throw new TypeError("travel spell source and victim IDs must be disjoint");
		allIds.add(victim.id);
	}
	return {
		commands: checkedCommands$1(setup.commands, sources, victims),
		sources,
		victims
	};
}
function projectileCarrier(origin, center) {
	const combat = new ProjectileCombat({ entities: [{
		attackRange: 4e4,
		id: 1,
		kind: "troop",
		layer: "ground",
		maxHealth: 1,
		position: { ...origin },
		radius: 0,
		targetMode: "air_and_ground",
		targetable: true
	}, {
		attackRange: 0,
		id: 2,
		kind: "troop",
		layer: "ground",
		maxHealth: 1,
		position: { ...center },
		radius: 0,
		targetMode: "none",
		targetable: true
	}] });
	return {
		combat,
		projectile: combat.launch({
			attackerId: 1,
			damage: 0,
			radius: PROJECTILE_RADIUS,
			speed: SPEED,
			targetId: 2,
			tick: 0
		})
	};
}
function initialState$3(setup) {
	return {
		commandIndex: 0,
		history: [],
		nextEffectId: 1,
		pending: [],
		sources: setup.sources.map((source) => ({
			...clone$3(source),
			alive: true
		})),
		tick: 0,
		victims: setup.victims.map((victim) => ({
			...clone$3(victim),
			alive: true
		}))
	};
}
function targetEligible$1(source, victim) {
	return victim.alive && victim.targetable && victim.ownerId !== source.ownerId && VICTIM_KINDS$1.has(victim.kind) && VICTIM_LAYERS$1.has(victim.layer);
}
function collisionKey(origin, center, victim) {
	const dx = BigInt(center.x) - BigInt(origin.x);
	const dy = BigInt(center.y) - BigInt(origin.y);
	const px = BigInt(victim.position.x) - BigInt(origin.x);
	const py = BigInt(victim.position.y) - BigInt(origin.y);
	const lengthSquared = dx * dx + dy * dy;
	const radius = BigInt(PROJECTILE_RADIUS + victim.radius);
	if (lengthSquared === 0n) return px * px + py * py <= radius * radius ? 0n : null;
	const dot = px * dx + py * dy;
	if (dot <= 0n) return px * px + py * py <= radius * radius ? 0n : null;
	if (dot >= lengthSquared) {
		const ex = BigInt(victim.position.x) - BigInt(center.x);
		const ey = BigInt(victim.position.y) - BigInt(center.y);
		return ex * ex + ey * ey <= radius * radius ? lengthSquared : null;
	}
	const cross = px * dy - py * dx;
	return cross * cross <= radius * radius * lengthSquared ? dot : null;
}
function prefixCapsuleContains(origin, center, victim, elapsedTicks, duration) {
	const dx = BigInt(center.x) - BigInt(origin.x);
	const dy = BigInt(center.y) - BigInt(origin.y);
	const px = BigInt(victim.position.x) - BigInt(origin.x);
	const py = BigInt(victim.position.y) - BigInt(origin.y);
	const lengthSquared = dx * dx + dy * dy;
	const radius = BigInt(PROJECTILE_RADIUS + victim.radius);
	const radiusSquared = radius * radius;
	const pointSquared = px * px + py * py;
	if (lengthSquared === 0n || pointSquared <= radiusSquared) return pointSquared <= radiusSquared;
	if (elapsedTicks >= duration) return collisionKey(origin, center, victim) !== null;
	const reach = BigInt(SPEED) * BigInt(elapsedTicks);
	const dot = px * dx + py * dy;
	if (reach === 0n || dot <= 0n) return false;
	const reachSquared = reach * reach;
	if (dot * dot <= reachSquared * lengthSquared) {
		const cross = px * dy - py * dx;
		return cross * cross <= radiusSquared * lengthSquared;
	}
	const left = (pointSquared + reachSquared - radiusSquared) * lengthSquared;
	if (left <= 0n) return true;
	return left * left <= 4n * dot * dot * reachSquared * lengthSquared;
}
function lineContacts(state, source, impact, elapsedTicks) {
	const contacted = new Set(impact.contactedTargetIds);
	return state.victims.filter((victim) => !contacted.has(victim.id) && targetEligible$1(source, victim)).map((victim) => ({
		key: collisionKey(impact.origin, impact.center, victim),
		victim
	})).filter(({ key, victim }) => key !== null && prefixCapsuleContains(impact.origin, impact.center, victim, elapsedTicks, impact.duration)).sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : left.victim.id - right.victim.id);
}
function emitContacts(state, source, impact, events) {
	const contacts = lineContacts(state, source, impact, state.tick - impact.launchTick);
	for (const { key, victim } of contacts) {
		impact.contactedTargetIds.push(victim.id);
		events.push({
			effectId: impact.effectId,
			orderNumerator: key.toString(),
			targetId: victim.id,
			tick: state.tick,
			type: "travel-contact"
		});
	}
}
function instantImpact(state, source, impact) {
	const setup = createInstantSpellFixture({
		commands: [{
			center: { ...impact.center },
			id: 1,
			sourceId: source.id,
			targetId: null,
			tick: 0,
			type: "cast",
			variant: "plain"
		}],
		sources: [{
			id: source.id,
			ownerId: source.ownerId
		}],
		victims: state.victims.map((victim) => ({
			combatTargetId: victim.combatTargetId,
			combatTargetMode: victim.combatTargetMode,
			health: Math.max(1, victim.health),
			id: victim.id,
			kind: victim.kind,
			layer: victim.layer,
			ownerId: victim.ownerId,
			position: { ...victim.position },
			radius: victim.radius,
			targetable: victim.alive && victim.targetable
		}))
	});
	const encounter = new InstantRadiusSpellEncounter(setup);
	const primitiveEvents = encounter.stepMany(3);
	const primitiveState = encounter.state;
	for (const victim of state.victims) {
		const result = primitiveState.victims.find(({ id }) => id === victim.id);
		if (victim.alive && !result.alive) {
			victim.alive = false;
			victim.health = 0;
		} else if (victim.alive) victim.health = result.health;
	}
	return primitiveEvents;
}
function translatedImpactEvents(state, source, impact) {
	const events = [];
	const primitiveEvents = instantImpact(state, source, impact);
	for (const event of primitiveEvents) {
		if (!event.type.startsWith("spell-") || event.type === "spell-cast") continue;
		events.push({
			...clone$3(event),
			effectId: impact.effectId,
			primitiveEffectId: event.effectId,
			tick: state.tick,
			type: `travel-${event.type}`
		});
	}
	return events;
}
function resolveImpact(state, impact, events) {
	const source = state.sources.find(({ id }) => id === impact.sourceId);
	if (impact.cancelled || !source.alive) {
		events.push({
			effectId: impact.effectId,
			reason: impact.cancelled ? "explicit-cancel" : "source-dead",
			sourceId: impact.sourceId,
			tick: state.tick,
			type: "travel-cancelled"
		});
		return;
	}
	const { combat } = projectileCarrier(impact.origin, impact.center);
	let primitiveEvents = [];
	for (let tick = 0; tick <= impact.duration; tick += 1) primitiveEvents = combat.step(tick);
	const carrierImpact = primitiveEvents.find(({ type }) => type === "impact");
	if (carrierImpact?.status !== "contact") throw new TypeError("travel spell carrier failed to contact its endpoint");
	events.push({
		center: { ...impact.center },
		duration: impact.duration,
		effectId: impact.effectId,
		primitiveProjectileId: carrierImpact.projectileId,
		sourceId: source.id,
		tick: state.tick,
		type: "travel-impact"
	});
	emitContacts(state, source, impact, events);
	events.push(...translatedImpactEvents(state, source, impact));
}
function applyCommand$3(state, command, events) {
	if (command.type === "cast") {
		const source = state.sources.find(({ id }) => id === command.sourceId);
		if (!source.alive) {
			events.push({
				commandId: command.id,
				reason: "source-dead",
				sourceId: source.id,
				tick: state.tick,
				type: "travel-launch-cancelled"
			});
			return;
		}
		if (state.nextEffectId === Number.MAX_SAFE_INTEGER) throw new RangeError("travel spell effect ID space is exhausted");
		const { projectile } = projectileCarrier(source.position, command.center);
		if (projectile.impactTick > 127 - state.tick) throw new RangeError("travel spell impact exceeds encounter tick bound");
		const effectId = state.nextEffectId;
		state.nextEffectId += 1;
		state.pending.push({
			cancelled: false,
			center: { ...command.center },
			contactedTargetIds: [],
			duration: projectile.impactTick,
			effectId,
			impactTick: state.tick + projectile.impactTick,
			launchTick: state.tick,
			origin: { ...source.position },
			sourceId: source.id
		});
		events.push({
			center: { ...command.center },
			duration: projectile.impactTick,
			effectId,
			impactTick: state.tick + projectile.impactTick,
			origin: { ...source.position },
			primitiveProjectileId: projectile.id,
			sourceId: source.id,
			tick: state.tick,
			type: "travel-launch"
		});
		return;
	}
	if (command.type === "source-died") {
		const source = state.sources.find(({ id }) => id === command.sourceId);
		if (source.alive) {
			source.alive = false;
			events.push({
				sourceId: source.id,
				tick: state.tick,
				type: "travel-source-died"
			});
		}
		return;
	}
	if (command.type === "target-died") {
		const victim = state.victims.find(({ id }) => id === command.targetId);
		if (victim.alive) {
			victim.alive = false;
			victim.health = 0;
			events.push({
				targetId: victim.id,
				tick: state.tick,
				type: "travel-target-died"
			});
		}
		return;
	}
	const pending = state.pending.find(({ effectId }) => effectId === command.effectId);
	if (pending !== void 0 && pending.impactTick >= state.tick) {
		pending.cancelled = true;
		events.push({
			effectId: pending.effectId,
			tick: state.tick,
			type: "travel-cancel-requested"
		});
	}
}
function advance$3(state, commands) {
	if (state.tick >= MAX_TICK$3) return [];
	const events = [];
	while (commands[state.commandIndex]?.tick === state.tick) {
		const command = commands[state.commandIndex];
		state.commandIndex += 1;
		applyCommand$3(state, command, events);
	}
	const traveling = state.pending.filter(({ impactTick }) => impactTick > state.tick).sort((left, right) => left.effectId - right.effectId);
	for (const impact of traveling) {
		const source = state.sources.find(({ id }) => id === impact.sourceId);
		if (!impact.cancelled && source.alive) emitContacts(state, source, impact, events);
	}
	const due = state.pending.filter(({ impactTick }) => impactTick === state.tick).sort((left, right) => left.effectId - right.effectId);
	state.pending = state.pending.filter(({ impactTick }) => impactTick !== state.tick);
	for (const impact of due) resolveImpact(state, impact, events);
	if (state.history.length + events.length > MAX_EVENTS$3) throw new RangeError("travel spell replay exceeds its event bound");
	state.history.push(...clone$3(events));
	state.tick += 1;
	return events;
}
function questionRecord$3(key, value) {
	return deepFreeze$3({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		key,
		source: SOURCE$3,
		value: clone$3(value)
	});
}
function createTravelingLineSpellCatalog(...args) {
	if (args.length !== 0) throw new TypeError("travel spell catalog does not accept overrides");
	return createInstantSpellCatalog();
}
function createTravelingLineSpellQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("travel spell questions do not accept overrides");
	return deepFreeze$3(Object.fromEntries(Object.entries(QUESTION_VALUES$3).map(([key, value]) => [key, questionRecord$3(key, value)])));
}
function createTravelingLineSpellFixture(value) {
	return clone$3(checkedSetup$3(value));
}
var SOURCE$3, SPEED, PROJECTILE_RADIUS, TERMINAL_RADIUS, MAX_COMMANDS$1, MAX_EVENTS$3, MAX_HEALTH$1, MAX_OWNER_ID$1, MAX_RADIUS$1, MAX_SNAPSHOT_BYTES$3, MAX_SOURCES$1, MAX_STEP_CHUNK$3, MAX_TICK$3, MAX_VICTIMS$1, COMMAND_KEYS$1, SETUP_KEYS$1, SOURCE_KEYS$1, VICTIM_KEYS$1, SNAPSHOT_KEYS$3, IDENTITY_KEYS$3, COMMAND_TYPES$1, VICTIM_KINDS$1, VICTIM_LAYERS$1, COMBAT_TARGET_MODES$1, QUESTION_VALUES$3, TravelingLineSpellEncounter;
function init_spells_travel_line() {
	return (init_spells_travel_line = __esmMin((() => {
		init_projectile();
		init_arena_geometry();
		init_spells_instant();
		init_combat_effect_feed();
		SOURCE$3 = "unsourced-traveling-line-spell-composition";
		SPEED = 1e3;
		PROJECTILE_RADIUS = 0;
		TERMINAL_RADIUS = createInstantSpellCatalog()[0].areaDamageRadiusMillitiles;
		MAX_COMMANDS$1 = 96;
		MAX_EVENTS$3 = 8192;
		MAX_HEALTH$1 = 1e6;
		MAX_OWNER_ID$1 = 1024;
		MAX_RADIUS$1 = 9e3;
		MAX_SNAPSHOT_BYTES$3 = 262144;
		MAX_SOURCES$1 = 16;
		MAX_STEP_CHUNK$3 = 128;
		MAX_TICK$3 = 128;
		MAX_VICTIMS$1 = 64;
		COMMAND_KEYS$1 = [
			"center",
			"effectId",
			"id",
			"sourceId",
			"targetId",
			"tick",
			"type"
		];
		SETUP_KEYS$1 = [
			"commands",
			"sources",
			"victims"
		];
		SOURCE_KEYS$1 = [
			"id",
			"ownerId",
			"position"
		];
		VICTIM_KEYS$1 = [
			"combatTargetId",
			"combatTargetMode",
			"health",
			"id",
			"kind",
			"layer",
			"ownerId",
			"position",
			"radius",
			"targetable"
		];
		SNAPSHOT_KEYS$3 = [
			"identity",
			"tick",
			"version"
		];
		IDENTITY_KEYS$3 = ["fixture", "setup"];
		COMMAND_TYPES$1 = /* @__PURE__ */ new Set([
			"cancel-effect",
			"cast",
			"source-died",
			"target-died"
		]);
		VICTIM_KINDS$1 = /* @__PURE__ */ new Set([
			"crown",
			"structure",
			"troop"
		]);
		VICTIM_LAYERS$1 = /* @__PURE__ */ new Set(["air", "ground"]);
		COMBAT_TARGET_MODES$1 = /* @__PURE__ */ new Set([
			"air",
			"air_and_ground",
			"buildings",
			"ground",
			"none"
		]);
		QUESTION_VALUES$3 = Object.freeze({
			cancellationBoundary: "commands-first;cancel-or-source-death-stops-future-contact-and-impact",
			collisionDamage: "travel-contacts-are-observations;damage-occurs-at-impact-only",
			collisionGeometry: "static-launch-snapshot-finite-capsule-with-inclusive-end-caps",
			collisionOrder: "forward-clamped-segment-dot-then-stable-target-id",
			impactComposition: "delegate-terminal-center-to-passed-instant-radius-plain-variant",
			movingTargetPolicy: "launch-time-position-snapshot-for-line-contacts",
			projectileRadiusMillitiles: PROJECTILE_RADIUS,
			sameBoundaryOrder: "commands-then-cancellations-then-effect-id-ordered-impact-contact-and-damage",
			sourceDeathAfterImpact: "no-retroactive-cancellation",
			speedMillitilesPerTick: SPEED,
			targetFilter: "living-targetable-hostile-ground-or-air-troop-structure-or-crown",
			targetDeathAtImpact: "command-first-death-excludes-new-contact-and-impact;prior-latch-retained",
			travelComposition: "delegate-zero-damage-carrier-timing-to-passed-static-projectile",
			travelContactTiming: "first-inclusive-swept-capsule-boundary-from-launch-through-impact"
		});
		TravelingLineSpellEncounter = class TravelingLineSpellEncounter {
			#setup;
			#state;
			#feed = createCombatEffectFeed();
			#feedRoots = /* @__PURE__ */ new Map();
			constructor(setup) {
				this.#setup = checkedSetup$3(setup);
				this.#state = initialState$3(this.#setup);
			}
			get replay() {
				return clone$3(this.#state.history);
			}
			get combatEffectFeed() {
				return combatEffectFeedSnapshot(this.#feed);
			}
			get effectFeed() {
				return this.combatEffectFeed;
			}
			get visualFeed() {
				return this.combatEffectFeed;
			}
			combatEffectFeedBytes() {
				return serializeCombatEffectFeed(this.#feed);
			}
			fork() {
				return TravelingLineSpellEncounter.restore(this.serialize());
			}
			get state() {
				return clone$3(this.#state);
			}
			step() {
				return this.stepMany(1);
			}
			stepMany(count) {
				safeInteger$2(count, "travel spell step count", 0, MAX_STEP_CHUNK$3);
				if (count > MAX_TICK$3 - this.#state.tick) throw new RangeError("travel spell step count exceeds encounter bound");
				const candidate = clone$3(this.#state);
				const candidateFeed = this.#feed.fork();
				const candidateRoots = new Map([...this.#feedRoots].map(([effectId, root]) => [effectId, { ...root }]));
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...advance$3(candidate, this.#setup.commands));
				this.#observeVisualEvents(candidate, candidateFeed, candidateRoots, events);
				this.#state = candidate;
				this.#feed = candidateFeed;
				this.#feedRoots = candidateRoots;
				return clone$3(events);
			}
			run() {
				return this.stepMany(MAX_TICK$3 - this.#state.tick);
			}
			serialize() {
				const serialized = canonicalJson$3({
					identity: {
						fixture: "traveling-line-spell-question-v1",
						setup: this.#setup
					},
					tick: this.#state.tick,
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$3) throw new RangeError("travel spell snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("travel spell snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$3) throw new RangeError("travel spell snapshot exceeds its byte bound");
				let value;
				try {
					value = JSON.parse(serialized);
				} catch {
					throw new TypeError("travel spell snapshot must be valid JSON");
				}
				if (canonicalJson$3(value) !== serialized) throw new TypeError("travel spell snapshot must be canonical duplicate-free JSON");
				const snapshot = exactRecord$3(value, SNAPSHOT_KEYS$3, "travel spell snapshot");
				if (snapshot.version !== 1) throw new TypeError("travel spell snapshot version is unsupported");
				const identity = exactRecord$3(snapshot.identity, IDENTITY_KEYS$3, "travel spell snapshot.identity");
				if (identity.fixture !== "traveling-line-spell-question-v1") throw new TypeError("travel spell snapshot fixture is unsupported");
				safeInteger$2(snapshot.tick, "travel spell snapshot.tick", 0, MAX_TICK$3);
				const encounter = new TravelingLineSpellEncounter(checkedSetup$3(identity.setup));
				encounter.stepMany(snapshot.tick);
				return encounter;
			}
			#observeVisualEvents(state, feed, roots, events) {
				const impactTargets = /* @__PURE__ */ new Map();
				const completed = [];
				for (const event of events) {
					if (event.type !== "travel-spell-damage") continue;
					const targets = impactTargets.get(event.effectId) ?? [];
					targets.push(event.targetId);
					impactTargets.set(event.effectId, targets);
				}
				for (const targets of impactTargets.values()) targets.sort((left, right) => left - right);
				for (const event of events) {
					if (event.type === "travel-launch") {
						const root = appendCombatEffectRoot(feed, {
							direction: "travel",
							effectId: event.effectId,
							from: event.origin,
							impactTick: event.impactTick,
							projectileId: event.primitiveProjectileId,
							radius: PROJECTILE_RADIUS,
							segments: [],
							sequence: event.effectId,
							sourceId: event.sourceId,
							tick: event.tick,
							to: event.center,
							type: "projectile"
						});
						roots.set(event.effectId, {
							lastEventId: root.eventId,
							rootId: root.rootId
						});
						continue;
					}
					const root = event.effectId === void 0 ? null : roots.get(event.effectId);
					if (root === null || root === void 0) continue;
					if (event.type === "travel-contact") {
						const victim = state.victims.find(({ id }) => id === event.targetId);
						root.lastEventId = appendCombatEffectEvent(feed, {
							parentId: root.lastEventId,
							payload: {
								point: victim?.position ?? event.point ?? state.sources[0].position,
								status: "contact",
								subId: null,
								targetId: event.targetId
							},
							phase: "contact",
							rootId: root.rootId,
							tick: event.tick,
							type: "projectile"
						}).eventId;
					} else if (event.type === "travel-impact") {
						completed.push(event.effectId);
						root.lastEventId = appendCombatEffectEvent(feed, {
							parentId: root.lastEventId,
							payload: {
								center: event.center,
								radius: TERMINAL_RADIUS,
								targetIds: impactTargets.get(event.effectId) ?? []
							},
							phase: "impact",
							rootId: root.rootId,
							tick: event.tick,
							type: "projectile"
						}).eventId;
					} else if (event.type === "travel-spell-damage") root.lastEventId = appendCombatEffectEvent(feed, {
						parentId: root.lastEventId,
						payload: {
							amount: event.amount,
							currentHealthAfter: event.healthAfter,
							currentHealthBefore: event.healthBefore,
							targetId: event.targetId
						},
						phase: "damage",
						rootId: root.rootId,
						tick: event.tick,
						type: "projectile"
					}).eventId;
					else if (event.type === "travel-spell-death") root.lastEventId = appendCombatEffectEvent(feed, {
						parentId: root.lastEventId,
						payload: { targetId: event.targetId },
						phase: "death",
						rootId: root.rootId,
						tick: event.tick,
						type: "projectile"
					}).eventId;
					else if (event.type === "travel-cancelled") root.lastEventId = appendCombatEffectEvent(feed, {
						parentId: root.lastEventId,
						payload: { reason: event.reason === "source-dead" ? "source-dead" : "explicit-cancel" },
						phase: "close",
						rootId: root.rootId,
						tick: event.tick,
						type: "projectile"
					}).eventId;
				}
				for (const effectId of [...new Set(completed)]) {
					const root = roots.get(effectId);
					if (root === void 0) continue;
					root.lastEventId = appendCombatEffectEvent(feed, {
						parentId: root.lastEventId,
						payload: { reason: "impact-resolved" },
						phase: "close",
						rootId: root.rootId,
						tick: events.find(({ effectId: id, type }) => id === effectId && type === "travel-impact").tick,
						type: "projectile"
					}).eventId;
				}
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/spells-return.js
function clone$2(value) {
	return structuredClone(value);
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
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function safeCount(value, label, maximum) {
	if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new TypeError(`${label} must be a bounded non-negative safe integer`);
	return value;
}
function checkedSetup$2(value) {
	const setup = createTravelingLineSpellFixture(value);
	for (const command of setup.commands) {
		if (command.type !== "cast") continue;
		const source = setup.sources.find(({ id }) => id === command.sourceId);
		if (source.position.x === command.center.x && source.position.y === command.center.y) throw new RangeError("return spell requires a non-zero leg");
		const aim = {
			x: command.center.x - source.position.x,
			y: command.center.y - source.position.y
		};
		createReturnSpecialFixture([], aim, []);
		if (command.tick + primitiveContract().terminalTick > MAX_TICK$2) throw new RangeError("return spell completion exceeds encounter bound");
	}
	return setup;
}
function initialState$2(setup) {
	return {
		commandIndex: 0,
		history: [],
		nextEffectId: 1,
		pending: [],
		sources: setup.sources.map((source) => ({
			...clone$2(source),
			alive: true
		})),
		tick: 0,
		victims: setup.victims.map((victim) => ({
			...clone$2(victim),
			alive: true
		}))
	};
}
function eligible(source, victim) {
	return source.ownerId !== victim.ownerId && victim.alive && victim.targetable && (victim.kind === "troop" || victim.kind === "structure");
}
function primitiveHealth(health) {
	if (health <= INSTANT_DAMAGE) return RETURN_DAMAGE;
	if (health <= INSTANT_DAMAGE * 2) return RETURN_DAMAGE * 2;
	return RETURN_DAMAGE * 3;
}
function primitiveContract() {
	if (returnContractCache !== void 0) return clone$2(returnContractCache);
	const encounter = new ReturnEncounter(createReturnSpecialFixture([], {
		x: 1,
		y: 0
	}, []));
	encounter.run();
	const launch = encounter.replay.find(({ type }) => type === "return-launch");
	if (launch === void 0) throw new TypeError("passed return primitive did not launch");
	returnContractCache = {
		completeTick: encounter.replay.find(({ type }) => type === "return-complete").tick,
		launchTick: launch.tick,
		origin: launch.origin,
		turnPoint: launch.turnPoint,
		turnTick: launch.turnTick,
		terminalTick: encounter.state.tick
	};
	return clone$2(returnContractCache);
}
function translatedPosition(position, sourcePosition, primitiveOrigin) {
	return {
		x: primitiveOrigin.x + position.x - sourcePosition.x,
		y: primitiveOrigin.y + position.y - sourcePosition.y
	};
}
function worldPosition(position, sourcePosition, primitiveOrigin) {
	return {
		x: sourcePosition.x + position.x - primitiveOrigin.x,
		y: sourcePosition.y + position.y - primitiveOrigin.y
	};
}
function primitiveCommands(setup, effectId, cast, idMap, completeTick) {
	const commands = [];
	for (const command of setup.commands) {
		const tick = command.tick - cast.tick;
		if (tick < 0 || tick > completeTick) continue;
		if (command.type === "source-died" && command.sourceId === cast.sourceId) commands.push({
			targetId: null,
			tick,
			type: "kill-attacker"
		});
		else if (command.type === "cancel-effect" && command.effectId === effectId) commands.push({
			targetId: null,
			tick,
			type: "interrupt-attacker"
		});
		else if (command.type === "target-died" && idMap.has(command.targetId)) commands.push({
			targetId: idMap.get(command.targetId),
			tick,
			type: "kill-target"
		});
	}
	return commands.filter((command, index) => commands.findIndex((candidate) => candidate.tick === command.tick && candidate.type === command.type && candidate.targetId === command.targetId) === index);
}
function createPrimitive(setup, state, cast, effectId) {
	const source = state.sources.find(({ id }) => id === cast.sourceId);
	const aim = {
		x: cast.center.x - source.position.x,
		y: cast.center.y - source.position.y
	};
	const contract = primitiveContract();
	const victims = state.victims.filter((victim) => eligible(source, victim)).sort((left, right) => left.id - right.id);
	const idMap = new Map(victims.map((victim, index) => [victim.id, 201 + index]));
	const reverseIdMap = Object.fromEntries([...idMap].map(([spellId, primitiveId]) => [primitiveId, spellId]));
	const candidates = victims.map((victim) => ({
		alive: victim.alive,
		id: idMap.get(victim.id),
		kind: victim.kind,
		layer: victim.layer,
		maxHealth: primitiveHealth(victim.health),
		position: translatedPosition(victim.position, source.position, contract.origin),
		radius: victim.radius,
		targetable: victim.targetable
	}));
	const primitiveSetup = createReturnSpecialFixture(candidates, aim, primitiveCommands(setup, effectId, cast, idMap, contract.completeTick));
	return {
		contract,
		effectId,
		primitiveSnapshot: new ReturnEncounter(primitiveSetup).serialize(),
		reverseIdMap,
		sourceId: source.id,
		sourcePosition: clone$2(source.position)
	};
}
function instantDamage(state, sourceId, victim) {
	const source = state.sources.find(({ id }) => id === sourceId);
	const encounter = new InstantRadiusSpellEncounter(createInstantSpellFixture({
		commands: [{
			center: clone$2(victim.position),
			id: 1,
			sourceId,
			targetId: null,
			tick: 0,
			type: "cast",
			variant: "plain"
		}],
		sources: [{
			id: sourceId,
			ownerId: source.ownerId
		}],
		victims: [{
			combatTargetId: victim.combatTargetId,
			combatTargetMode: victim.combatTargetMode,
			health: victim.health,
			id: victim.id,
			kind: victim.kind,
			layer: victim.layer,
			ownerId: victim.ownerId,
			position: clone$2(victim.position),
			radius: victim.radius,
			targetable: true
		}]
	}));
	const primitiveEvents = encounter.stepMany(3);
	const result = encounter.state.victims[0];
	victim.health = result.health;
	victim.alive = result.alive;
	return primitiveEvents.filter(({ type }) => type === "spell-damage" || type === "spell-death");
}
function applyCommand$2(state, setup, command, events) {
	if (command.type === "cast") {
		const source = state.sources.find(({ id }) => id === command.sourceId);
		if (!source.alive) {
			events.push({
				commandId: command.id,
				reason: "source-dead",
				sourceId: source.id,
				tick: state.tick,
				type: "return-launch-cancelled"
			});
			return;
		}
		if (state.nextEffectId === Number.MAX_SAFE_INTEGER) throw new RangeError("return spell effect ID space is exhausted");
		const effectId = state.nextEffectId;
		state.nextEffectId += 1;
		state.pending.push(createPrimitive(setup, state, command, effectId));
		return;
	}
	if (command.type === "source-died") {
		const source = state.sources.find(({ id }) => id === command.sourceId);
		if (source.alive) {
			source.alive = false;
			events.push({
				sourceId: source.id,
				tick: state.tick,
				type: "return-source-died"
			});
		}
		return;
	}
	if (command.type === "target-died") {
		const victim = state.victims.find(({ id }) => id === command.targetId);
		if (victim.alive) {
			victim.alive = false;
			victim.health = 0;
			events.push({
				targetId: victim.id,
				tick: state.tick,
				type: "return-target-died"
			});
		}
		return;
	}
}
function mappedTargetId(effect, primitiveId) {
	return effect.reverseIdMap[primitiveId];
}
function translatePrimitiveEvent(state, effect, event, events) {
	const tick = state.tick;
	if (event.type === "return-hit") {
		const targetId = mappedTargetId(effect, event.targetId);
		const victim = state.victims.find(({ id }) => id === targetId);
		events.push({
			effectId: effect.effectId,
			leg: event.leg,
			orderNumerator: event.parameterNumerator,
			pass: event.pass,
			targetId,
			tick,
			type: "return-contact"
		});
		if (victim?.alive) for (const damageEvent of instantDamage(state, effect.sourceId, victim)) events.push({
			...clone$2(damageEvent),
			effectId: effect.effectId,
			leg: event.leg,
			pass: event.pass,
			primitiveEffectId: damageEvent.effectId,
			tick,
			type: `return-${damageEvent.type}`
		});
		return;
	}
	if (event.type === "return-damage" || event.type === "return-death") return;
	if (event.type === "return-launch") {
		events.push({
			completeTick: tick + event.completeTick - event.tick,
			effectId: effect.effectId,
			origin: clone$2(effect.sourcePosition),
			sourceId: effect.sourceId,
			tick,
			turn: worldPosition(event.turnPoint, effect.sourcePosition, event.origin),
			turnTick: tick + event.turnTick - event.tick,
			type: "return-launch"
		});
		return;
	}
	if (event.type === "return-turn") {
		events.push({
			effectId: effect.effectId,
			tick,
			turn: worldPosition(event.turnPoint, effect.sourcePosition, effect.contract.origin),
			type: "return-turn"
		});
		return;
	}
	if (event.type === "return-complete") {
		events.push({
			effectId: effect.effectId,
			inboundHitIds: event.inboundHitIds.map((id) => mappedTargetId(effect, id)),
			outboundHitIds: event.outboundHitIds.map((id) => mappedTargetId(effect, id)),
			reason: event.reason,
			tick,
			type: "return-complete"
		});
		return;
	}
	events.push({
		...clone$2(event),
		effectId: effect.effectId,
		primitiveTargetId: event.targetId,
		targetId: event.targetId === 101 ? effect.sourceId : mappedTargetId(effect, event.targetId),
		tick,
		type: `return-primitive-${event.type}`
	});
}
function advance$2(state, setup) {
	if (state.tick >= MAX_TICK$2) return [];
	const events = [];
	while (setup.commands[state.commandIndex]?.tick === state.tick) {
		applyCommand$2(state, setup, setup.commands[state.commandIndex], events);
		state.commandIndex += 1;
	}
	for (const effect of state.pending.sort((a, b) => a.effectId - b.effectId)) {
		const primitive = ReturnEncounter.restore(effect.primitiveSnapshot);
		const primitiveEvents = primitive.step();
		effect.primitiveSnapshot = primitive.serialize();
		for (const event of primitiveEvents) translatePrimitiveEvent(state, effect, event, events);
	}
	if (state.history.length + events.length > MAX_EVENTS$2) throw new RangeError("return spell replay exceeds its event bound");
	state.history.push(...clone$2(events));
	state.tick += 1;
	return events;
}
function questionRecord$2(key, value) {
	return deepFreeze$2({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		key,
		source: SOURCE$2,
		value: clone$2(value)
	});
}
function createReturningSpellCatalog(...args) {
	if (args.length !== 0) throw new TypeError("return spell catalog does not accept overrides");
	return createTravelingLineSpellCatalog();
}
function createReturningSpellQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("return spell questions do not accept overrides");
	const primitive = createReturnQuestionFixture();
	const values = {
		...QUESTION_VALUES$2,
		contactOrder: {
			composition: QUESTION_VALUES$2.contactOrder,
			primitive: primitive.eventOrderRule.value
		},
		repeatHitPolicy: {
			composition: QUESTION_VALUES$2.repeatHitPolicy,
			primitive: primitive.oneHitPerLegRule.value
		},
		turnPolicy: {
			composition: QUESTION_VALUES$2.turnPolicy,
			primitive: primitive.turnaroundTimingRule.value
		}
	};
	return deepFreeze$2(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, questionRecord$2(key, value)])));
}
function createReturningSpellFixture(value) {
	return clone$2(checkedSetup$2(value));
}
var SOURCE$2, MAX_EVENTS$2, MAX_SNAPSHOT_BYTES$2, MAX_STEP_CHUNK$2, MAX_TICK$2, SNAPSHOT_KEYS$2, IDENTITY_KEYS$2, INSTANT_DAMAGE, RETURN_DAMAGE, returnContractCache, QUESTION_VALUES$2, ReturningSpellEncounter;
function init_spells_return() {
	return (init_spells_return = __esmMin((() => {
		init_spells_instant();
		init_spells_travel_line();
		init_special_projectiles_return();
		init_combat_effect_feed();
		SOURCE$2 = "unsourced-returning-traveling-spell-composition";
		MAX_EVENTS$2 = 16384;
		MAX_SNAPSHOT_BYTES$2 = 262144;
		MAX_STEP_CHUNK$2 = 128;
		MAX_TICK$2 = 128;
		SNAPSHOT_KEYS$2 = [
			"identity",
			"primitives",
			"tick",
			"version"
		];
		IDENTITY_KEYS$2 = ["fixture", "setup"];
		INSTANT_DAMAGE = createInstantSpellCatalog()[0].damage;
		RETURN_DAMAGE = createReturnQuestionFixture().damagePerPass.value;
		QUESTION_VALUES$2 = Object.freeze({
			cancellationBoundary: "passed-return-primitive;death-or-interruption-through-launch-cancels;post-launch-projectile-continues",
			contactDamage: "each-new-leg-contact-delegates-one plain passed instant-damage application",
			contactGeometry: "passed-return-primitive-static-launch-snapshot-inclusive-finite-capsule",
			contactOrder: "forward-on-outbound;reverse-on-inbound;stable-target-id-ties",
			inboundStart: "first-inbound-contact-boundary-is-one-tick-after-turn",
			movingTargetPolicy: "cast-time-position-snapshot",
			repeatHitPolicy: "at-most-once-per-target-per-leg;repeat-on-return-allowed",
			sameBoundaryOrder: "commands;effect-id;contact;damage;death;turn-or-complete",
			sourceDeathAfterCompletion: "no-retroactive-cancellation",
			sourceDeathAfterLaunch: "passed-return-primitive-launched-projectile-continues",
			targetDeathBoundary: "command-first-death-excludes-current-and-future-contact;earlier-damage-retained",
			timingComposition: "launch-leg-turn-and-completion-boundaries-are-the-passed-return-primitive",
			turnPolicy: "outbound-contacts-through-endpoint;turn-after-outbound;inbound-next-boundary",
			zeroDistancePolicy: "reject-cast-without-two-positive-duration-legs"
		});
		ReturningSpellEncounter = class ReturningSpellEncounter {
			#setup;
			#state;
			#feed = createCombatEffectFeed();
			#feedRoots = /* @__PURE__ */ new Map();
			constructor(setup) {
				this.#setup = checkedSetup$2(setup);
				this.#state = initialState$2(this.#setup);
			}
			get replay() {
				return clone$2(this.#state.history);
			}
			get combatEffectFeed() {
				return combatEffectFeedSnapshot(this.#feed);
			}
			get effectFeed() {
				return this.combatEffectFeed;
			}
			get visualFeed() {
				return this.combatEffectFeed;
			}
			combatEffectFeedBytes() {
				return serializeCombatEffectFeed(this.#feed);
			}
			fork() {
				return ReturningSpellEncounter.restore(this.serialize());
			}
			get state() {
				return clone$2(this.#state);
			}
			step() {
				return this.stepMany(1);
			}
			stepMany(count) {
				safeCount(count, "return spell step count", MAX_STEP_CHUNK$2);
				if (count > MAX_TICK$2 - this.#state.tick) throw new RangeError("return spell step count exceeds encounter bound");
				const candidate = clone$2(this.#state);
				const candidateFeed = this.#feed.fork();
				const candidateRoots = new Map([...this.#feedRoots].map(([effectId, root]) => [effectId, { ...root }]));
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...advance$2(candidate, this.#setup));
				this.#observeVisualEvents(candidateFeed, candidateRoots, events);
				this.#state = candidate;
				this.#feed = candidateFeed;
				this.#feedRoots = candidateRoots;
				return clone$2(events);
			}
			run() {
				return this.stepMany(MAX_TICK$2 - this.#state.tick);
			}
			serialize() {
				const serialized = canonicalJson$2({
					identity: {
						fixture: "returning-traveling-spell-question-v1",
						setup: this.#setup
					},
					primitives: this.#state.pending.map(({ effectId, primitiveSnapshot }) => ({
						effectId,
						snapshot: primitiveSnapshot
					})),
					tick: this.#state.tick,
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$2) throw new RangeError("return spell snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("return spell snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$2) throw new RangeError("return spell snapshot exceeds its byte bound");
				let value;
				try {
					value = JSON.parse(serialized);
				} catch {
					throw new TypeError("return spell snapshot must be valid JSON");
				}
				if (canonicalJson$2(value) !== serialized) throw new TypeError("return spell snapshot must be canonical duplicate-free JSON");
				const snapshot = exactRecord$2(value, SNAPSHOT_KEYS$2, "return spell snapshot");
				if (snapshot.version !== 1) throw new TypeError("return spell snapshot version is unsupported");
				const identity = exactRecord$2(snapshot.identity, IDENTITY_KEYS$2, "return spell snapshot.identity");
				if (identity.fixture !== "returning-traveling-spell-question-v1") throw new TypeError("return spell snapshot fixture is unsupported");
				safeCount(snapshot.tick, "return spell snapshot.tick", MAX_TICK$2);
				if (!Array.isArray(snapshot.primitives) || Object.getPrototypeOf(snapshot.primitives) !== Array.prototype) throw new TypeError("return spell snapshot.primitives must be an array");
				for (const [index, entry] of snapshot.primitives.entries()) {
					const primitive = exactRecord$2(entry, ["effectId", "snapshot"], `return spell snapshot primitive ${index}`);
					safeCount(primitive.effectId, `return spell snapshot primitive ${index}.effectId`, Number.MAX_SAFE_INTEGER);
					ReturnEncounter.restore(primitive.snapshot);
				}
				const encounter = new ReturningSpellEncounter(identity.setup);
				encounter.stepMany(snapshot.tick);
				const expected = encounter.#state.pending.map(({ effectId, primitiveSnapshot }) => ({
					effectId,
					snapshot: primitiveSnapshot
				}));
				if (canonicalJson$2(snapshot.primitives) !== canonicalJson$2(expected)) throw new TypeError("return spell snapshot primitive state is non-causal");
				return encounter;
			}
			#observeVisualEvents(feed, roots, events) {
				for (const event of events) {
					if (event.type === "return-launch") {
						const root = appendCombatEffectRoot(feed, {
							direction: "return",
							effectId: event.effectId,
							from: event.origin,
							impactTick: event.completeTick,
							projectileId: null,
							radius: createReturnQuestionFixture().collisionWidthMillitiles.value,
							segments: [],
							sequence: event.effectId,
							sourceId: event.sourceId,
							tick: event.tick,
							to: event.turn,
							type: "projectile"
						});
						roots.set(event.effectId, {
							lastEventId: root.eventId,
							rootId: root.rootId
						});
						continue;
					}
					const root = event.effectId === void 0 ? null : roots.get(event.effectId);
					if (root === null || root === void 0) continue;
					if (event.type === "return-turn") root.lastEventId = appendCombatEffectEvent(feed, {
						parentId: root.lastEventId,
						payload: { point: event.turn },
						phase: "turn",
						rootId: root.rootId,
						tick: event.tick,
						type: "projectile"
					}).eventId;
					else if (event.type === "return-contact") {
						const victim = this.#state.victims.find(({ id }) => id === event.targetId);
						root.lastEventId = appendCombatEffectEvent(feed, {
							parentId: root.lastEventId,
							payload: {
								point: victim?.position ?? {
									x: 0,
									y: 0
								},
								status: "contact",
								subId: null,
								targetId: event.targetId
							},
							phase: "contact",
							rootId: root.rootId,
							tick: event.tick,
							type: "projectile"
						}).eventId;
					} else if (event.type === "return-spell-damage") root.lastEventId = appendCombatEffectEvent(feed, {
						parentId: root.lastEventId,
						payload: {
							amount: event.amount,
							currentHealthAfter: event.healthAfter,
							currentHealthBefore: event.healthBefore,
							targetId: event.targetId
						},
						phase: "damage",
						rootId: root.rootId,
						tick: event.tick,
						type: "projectile"
					}).eventId;
					else if (event.type === "return-spell-death") root.lastEventId = appendCombatEffectEvent(feed, {
						parentId: root.lastEventId,
						payload: { targetId: event.targetId },
						phase: "death",
						rootId: root.rootId,
						tick: event.tick,
						type: "projectile"
					}).eventId;
					else if (event.type === "return-complete") {
						const reason = event.reason === "returned-to-origin" ? "complete" : event.reason;
						root.lastEventId = appendCombatEffectEvent(feed, {
							parentId: root.lastEventId,
							payload: { reason },
							phase: "close",
							rootId: root.rootId,
							tick: event.tick,
							type: "projectile"
						}).eventId;
					}
				}
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/spells-three-wave.js
function clone$1(value) {
	return structuredClone(value);
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
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function safeInteger$1(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
	return value;
}
function checkedSetup$1(value) {
	return createTravelingLineSpellFixture(value);
}
function sourceFor(state, sourceId) {
	return state.sources.find(({ id }) => id === sourceId);
}
function initialState$1(setup) {
	return {
		commandIndex: 0,
		history: [],
		nextEffectId: 1,
		pending: [],
		sources: setup.sources.map((source) => ({
			...clone$1(source),
			alive: true
		})),
		tick: 0,
		victims: setup.victims.map((victim) => ({
			...clone$1(victim),
			alive: true
		}))
	};
}
function primitiveVictim(victim, targetable = victim.targetable) {
	return {
		combatTargetId: victim.combatTargetId,
		combatTargetMode: victim.combatTargetMode,
		health: Math.max(1, victim.health),
		id: victim.id,
		kind: victim.kind,
		layer: victim.layer,
		ownerId: victim.ownerId,
		position: { ...victim.position },
		radius: victim.radius,
		targetable: victim.alive && targetable
	};
}
function lineFixture(state, effect, wave) {
	const source = sourceFor(state, effect.sourceId);
	return createTravelingLineSpellFixture({
		commands: [{
			center: { ...effect.center },
			effectId: null,
			id: 1,
			sourceId: source.id,
			targetId: null,
			tick: 0,
			type: "cast"
		}],
		sources: [{
			id: source.id,
			ownerId: source.ownerId,
			position: { ...effect.origin }
		}],
		victims: state.victims.map((victim) => primitiveVictim(victim))
	});
}
function lineDuration(state, effect) {
	const launch = new TravelingLineSpellEncounter(lineFixture(state, effect)).step().find(({ type }) => type === "travel-launch");
	if (launch === void 0) throw new TypeError("three-wave carrier failed to launch");
	return launch.duration;
}
function lineEventsAt(state, effect, wave) {
	const elapsed = state.tick - wave.launchTick;
	const primitive = new TravelingLineSpellEncounter(lineFixture(state, effect, wave));
	primitive.stepMany(elapsed + 1);
	return primitive.replay.filter(({ tick }) => tick === elapsed);
}
function withinWaveRadius(center, victim) {
	const dx = BigInt(victim.position.x) - BigInt(center.x);
	const dy = BigInt(victim.position.y) - BigInt(center.y);
	const radius = BigInt(WAVE_RADIUS + victim.radius);
	return dx * dx + dy * dy <= radius * radius;
}
function ordinaryDamage(victim) {
	return victim.kind === "crown" ? CROWN_DAMAGE$1 : WAVE_DAMAGE;
}
function adaptedHealth(victim) {
	const damage = ordinaryDamage(victim);
	const primitiveDamage = victim.kind === "crown" ? 207 : 689;
	if (victim.health <= primitiveDamage) return {
		input: victim.health + primitiveDamage - damage,
		outputOffset: 0
	};
	return {
		input: victim.health,
		outputOffset: primitiveDamage - damage
	};
}
function resolveWaveDamage(state, effect, wave, events) {
	const source = sourceFor(state, effect.sourceId);
	const adapters = /* @__PURE__ */ new Map();
	const victims = state.victims.map((victim) => {
		const adapter = adaptedHealth(victim);
		adapters.set(victim.id, adapter);
		return {
			...primitiveVictim(victim, victim.targetable && withinWaveRadius(effect.center, victim)),
			health: adapter.input
		};
	});
	const primitive = new InstantRadiusSpellEncounter(createInstantSpellFixture({
		commands: [{
			center: { ...effect.center },
			id: 1,
			sourceId: source.id,
			targetId: null,
			tick: 0,
			type: "cast",
			variant: "plain"
		}],
		sources: [{
			id: source.id,
			ownerId: source.ownerId
		}],
		victims
	}));
	primitive.stepMany(3);
	const hitIds = primitive.replay.filter(({ type }) => type === "spell-hit").map(({ targetId }) => targetId);
	const primitiveState = primitive.state;
	for (const targetId of hitIds) {
		const victim = state.victims.find(({ id }) => id === targetId);
		const result = primitiveState.victims.find(({ id }) => id === targetId);
		const healthBefore = victim.health;
		const healthAfter = result.alive ? result.health + adapters.get(targetId).outputOffset : 0;
		const amount = ordinaryDamage(victim);
		events.push({
			amount,
			effectId: effect.effectId,
			primitiveEffectId: 1,
			targetId,
			tick: state.tick,
			type: "three-wave-hit",
			waveIndex: wave.waveIndex
		});
		victim.health = healthAfter;
		victim.alive = healthAfter > 0;
		events.push({
			amount,
			effectId: effect.effectId,
			healthAfter,
			healthBefore,
			primitiveEffectId: 1,
			targetId,
			tick: state.tick,
			type: "three-wave-damage",
			waveIndex: wave.waveIndex
		});
		if (!victim.alive) events.push({
			effectId: effect.effectId,
			primitiveEffectId: 1,
			targetId,
			tick: state.tick,
			type: "three-wave-death",
			waveIndex: wave.waveIndex
		});
	}
}
function emitWaveEvents(state, effect, wave, events) {
	if (state.tick === wave.launchTick) events.push({
		center: { ...effect.center },
		duration: wave.duration,
		effectId: effect.effectId,
		impactTick: wave.impactTick,
		origin: { ...effect.origin },
		primitiveProjectileId: 1,
		sourceId: effect.sourceId,
		tick: state.tick,
		type: "three-wave-launch",
		waveIndex: wave.waveIndex
	});
	const primitiveEvents = lineEventsAt(state, effect, wave);
	const contacted = new Set(wave.contactedTargetIds);
	for (const contact of primitiveEvents.filter(({ type }) => type === "travel-contact")) {
		if (contacted.has(contact.targetId)) continue;
		contacted.add(contact.targetId);
		wave.contactedTargetIds.push(contact.targetId);
		events.push({
			effectId: effect.effectId,
			orderNumerator: contact.orderNumerator,
			targetId: contact.targetId,
			tick: state.tick,
			type: "three-wave-contact",
			waveIndex: wave.waveIndex
		});
	}
	if (state.tick === wave.impactTick) {
		const impact = primitiveEvents.find(({ type }) => type === "travel-impact");
		if (impact === void 0) throw new TypeError("three-wave carrier failed to contact its endpoint");
		events.push({
			center: { ...effect.center },
			duration: wave.duration,
			effectId: effect.effectId,
			primitiveProjectileId: impact.primitiveProjectileId,
			sourceId: effect.sourceId,
			tick: state.tick,
			type: "three-wave-impact",
			waveIndex: wave.waveIndex
		});
		resolveWaveDamage(state, effect, wave, events);
		wave.resolved = true;
	}
}
function createEffect(state, command, source) {
	if (state.nextEffectId === Number.MAX_SAFE_INTEGER) throw new RangeError("three-wave effect ID space is exhausted");
	const effect = {
		cancelled: false,
		center: { ...command.center },
		effectId: state.nextEffectId,
		origin: { ...source.position },
		sourceId: source.id,
		waves: []
	};
	state.nextEffectId += 1;
	const duration = lineDuration(state, effect);
	for (let waveIndex = 0; waveIndex < WAVE_COUNT; waveIndex += 1) {
		const launchTick = state.tick + WAVE_LAUNCH_OFFSETS[waveIndex];
		const impactTick = launchTick + duration;
		if (impactTick > 127) throw new RangeError("three-wave impact exceeds encounter tick bound");
		effect.waves.push({
			contactedTargetIds: [],
			duration,
			impactTick,
			launchTick,
			resolved: false,
			waveIndex
		});
	}
	return effect;
}
function cancelEffect(state, effect, reason, events) {
	if (effect === void 0 || effect.cancelled) return;
	effect.cancelled = true;
	events.push({
		effectId: effect.effectId,
		reason,
		sourceId: effect.sourceId,
		tick: state.tick,
		type: "three-wave-cancelled"
	});
}
function applyCommand$1(state, command, events) {
	if (command.type === "cast") {
		const source = sourceFor(state, command.sourceId);
		if (!source.alive) {
			events.push({
				commandId: command.id,
				reason: "source-dead",
				sourceId: source.id,
				tick: state.tick,
				type: "three-wave-cast-cancelled"
			});
			return;
		}
		const effect = createEffect(state, command, source);
		state.pending.push(effect);
		events.push({
			center: { ...effect.center },
			effectId: effect.effectId,
			sourceId: source.id,
			tick: state.tick,
			type: "three-wave-cast",
			waveCount: WAVE_COUNT
		});
		return;
	}
	if (command.type === "source-died") {
		const source = sourceFor(state, command.sourceId);
		if (source.alive) {
			source.alive = false;
			events.push({
				sourceId: source.id,
				tick: state.tick,
				type: "three-wave-source-died"
			});
			for (const effect of state.pending.filter(({ sourceId }) => sourceId === source.id)) cancelEffect(state, effect, "source-dead", events);
		}
		return;
	}
	if (command.type === "target-died") {
		const victim = state.victims.find(({ id }) => id === command.targetId);
		if (victim.alive) {
			victim.alive = false;
			victim.health = 0;
			events.push({
				targetId: victim.id,
				tick: state.tick,
				type: "three-wave-target-died"
			});
		}
		return;
	}
	cancelEffect(state, state.pending.find(({ effectId }) => effectId === command.effectId), "explicit-cancel", events);
}
function advance$1(state, commands) {
	if (state.tick >= MAX_TICK$1) return [];
	const events = [];
	while (commands[state.commandIndex]?.tick === state.tick) {
		const command = commands[state.commandIndex];
		state.commandIndex += 1;
		applyCommand$1(state, command, events);
	}
	const effects = state.pending.filter(({ cancelled }) => !cancelled).sort((left, right) => left.effectId - right.effectId);
	for (const effect of effects) {
		if (!sourceFor(state, effect.sourceId).alive) {
			cancelEffect(state, effect, "source-dead", events);
			continue;
		}
		for (const wave of effect.waves) if (!wave.resolved && wave.launchTick <= state.tick && state.tick <= wave.impactTick) emitWaveEvents(state, effect, wave, events);
	}
	state.pending = state.pending.filter((effect) => !effect.cancelled && effect.waves.some(({ resolved }) => !resolved));
	if (state.history.length + events.length > MAX_EVENTS$1) throw new RangeError("three-wave replay exceeds its event bound");
	state.history.push(...clone$1(events));
	state.tick += 1;
	return events;
}
function questionRecord$1(key, value) {
	return deepFreeze$1({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		key,
		source: SOURCE$1,
		value: clone$1(value)
	});
}
function createThreeWaveTravelingSpellCatalog(...args) {
	if (args.length !== 0) throw new TypeError("three-wave spell catalog does not accept overrides");
	return deepFreeze$1([{
		areaDamageRadiusMillitiles: WAVE_RADIUS,
		components: [],
		cost: 3,
		count: 1,
		damage: WAVE_DAMAGE,
		deployTimeTicks: null,
		displayName: "Skyshard Volley",
		firstHitTicks: null,
		hitSpeedTicks: null,
		hitpoints: null,
		id: "skyshard-volley",
		kind: "effect",
		movementMillitilesPerSecond: null,
		rangeMillitiles: null,
		rarity: "common",
		sightRangeMillitiles: null,
		targetMode: "ground-and-air"
	}]);
}
function createThreeWaveTravelingSpellQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("three-wave spell questions do not accept overrides");
	return deepFreeze$1(Object.fromEntries(Object.entries(QUESTION_VALUES$1).map(([key, value]) => [key, questionRecord$1(key, value)])));
}
function createThreeWaveTravelingSpellFixture(value) {
	return clone$1(checkedSetup$1(value));
}
var SOURCE$1, WAVE_COUNT, WAVE_LAUNCH_OFFSETS, WAVE_DAMAGE, CROWN_DAMAGE$1, WAVE_RADIUS, MAX_EVENTS$1, MAX_SNAPSHOT_BYTES$1, MAX_STEP_CHUNK$1, MAX_TICK$1, SNAPSHOT_KEYS$1, IDENTITY_KEYS$1, QUESTION_VALUES$1, ThreeWaveTravelingSpellEncounter;
function init_spells_three_wave() {
	return (init_spells_three_wave = __esmMin((() => {
		init_spells_instant();
		init_spells_travel_line();
		SOURCE$1 = "unsourced-three-wave-traveling-spell-composition";
		WAVE_COUNT = 3;
		WAVE_LAUNCH_OFFSETS = Object.freeze([
			0,
			1,
			2
		]);
		WAVE_DAMAGE = 122;
		CROWN_DAMAGE$1 = 37;
		WAVE_RADIUS = 1400;
		MAX_EVENTS$1 = 32768;
		MAX_SNAPSHOT_BYTES$1 = 262144;
		MAX_STEP_CHUNK$1 = 128;
		MAX_TICK$1 = 128;
		SNAPSHOT_KEYS$1 = [
			"identity",
			"tick",
			"version"
		];
		IDENTITY_KEYS$1 = ["fixture", "setup"];
		QUESTION_VALUES$1 = Object.freeze({
			cancellationBoundary: "commands-first;explicit-cancel-stops-unlaunched-and-traveling-waves",
			crownTowerDamage: "per-wave-nearest-integer-three-tenths-of-ordinary-damage",
			movingTargetPolicy: "each-wave-launch-uses-the-cast-time-static-position-snapshot",
			overlapOrder: "commands-then-ascending-effect-id-then-wave-index-then-line-contact-order",
			repeatHitPolicy: "an-eligible-target-may-be-hit-once-by-each-of-three-waves",
			sourceDeathBoundary: "commands-first;source-death-stops-unlaunched-and-traveling-waves",
			targetDeathBoundary: "commands-first;dead-target-excluded-from-new-contact-and-damage",
			waveDamageComposition: "passed-instant-radius-damage-transition-with-content-damage-adapter",
			waveGeometryComposition: "passed-traveling-line-static-capsule-contact-and-carrier-timing",
			waveLaunchOffsetsTicks: WAVE_LAUNCH_OFFSETS,
			waveRadiusBoundary: "inclusive-center-distance-plus-victim-radius-at-wave-impact"
		});
		ThreeWaveTravelingSpellEncounter = class ThreeWaveTravelingSpellEncounter {
			#setup;
			#state;
			constructor(setup) {
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
				safeInteger$1(count, "three-wave spell step count", 0, MAX_STEP_CHUNK$1);
				if (count > MAX_TICK$1 - this.#state.tick) throw new RangeError("three-wave spell step count exceeds encounter bound");
				const candidate = clone$1(this.#state);
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...advance$1(candidate, this.#setup.commands));
				this.#state = candidate;
				return clone$1(events);
			}
			run() {
				return this.stepMany(MAX_TICK$1 - this.#state.tick);
			}
			serialize() {
				const serialized = canonicalJson$1({
					identity: {
						fixture: "three-wave-traveling-spell-question-v1",
						setup: this.#setup
					},
					tick: this.#state.tick,
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$1) throw new RangeError("three-wave spell snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("three-wave spell snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$1) throw new RangeError("three-wave spell snapshot exceeds its byte bound");
				let value;
				try {
					value = JSON.parse(serialized);
				} catch {
					throw new TypeError("three-wave spell snapshot must be valid JSON");
				}
				if (canonicalJson$1(value) !== serialized) throw new TypeError("three-wave spell snapshot must be canonical duplicate-free JSON");
				const snapshot = exactRecord$1(value, SNAPSHOT_KEYS$1, "three-wave spell snapshot");
				if (snapshot.version !== 1) throw new TypeError("three-wave spell snapshot version is unsupported");
				const identity = exactRecord$1(snapshot.identity, IDENTITY_KEYS$1, "three-wave spell snapshot.identity");
				if (identity.fixture !== "three-wave-traveling-spell-question-v1") throw new TypeError("three-wave spell snapshot fixture is unsupported");
				safeInteger$1(snapshot.tick, "three-wave spell snapshot.tick", 0, MAX_TICK$1);
				const encounter = new ThreeWaveTravelingSpellEncounter(checkedSetup$1(identity.setup));
				encounter.stepMany(snapshot.tick);
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/spells-roll.js
function clone(value) {
	return structuredClone(value);
}
function deepFreeze(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze(child);
		Object.freeze(value);
	}
	return value;
}
function canonicalJson(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value")).some(Boolean)) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function safeInteger(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
	return value;
}
function checkedId(value, label, nullable = false) {
	if (nullable && value === null) return null;
	return safeInteger(value, label, 1);
}
function checkedPosition(value, label) {
	const position = exactRecord(value, ["x", "y"], label);
	return {
		x: safeInteger(position.x, `${label}.x`, 0, ARENA_WIDTH_MILLITILES),
		y: safeInteger(position.y, `${label}.y`, 0, ARENA_LENGTH_MILLITILES)
	};
}
function checkedSources(value) {
	const sources = denseArray(value, MAX_SOURCES, "rolling spell sources").map((entry, index) => {
		const label = `rolling spell source ${index}`;
		const source = exactRecord(entry, SOURCE_KEYS, label);
		return {
			id: checkedId(source.id, `${label}.id`),
			ownerId: safeInteger(source.ownerId, `${label}.ownerId`, 1, MAX_OWNER_ID),
			position: checkedPosition(source.position, `${label}.position`)
		};
	});
	if (sources.length === 0) throw new RangeError("rolling spell sources must not be empty");
	uniqueIds(sources, "rolling spell source");
	return sources;
}
function checkedVictims(value) {
	const victims = denseArray(value, MAX_VICTIMS, "rolling spell victims").map((entry, index) => {
		const label = `rolling spell victim ${index}`;
		const victim = exactRecord(entry, VICTIM_KEYS, label);
		if (!VICTIM_KINDS.has(victim.kind)) throw new TypeError(`${label}.kind is invalid`);
		if (!VICTIM_LAYERS.has(victim.layer)) throw new TypeError(`${label}.layer is invalid`);
		if (victim.combatTargetMode !== null && !COMBAT_TARGET_MODES.has(victim.combatTargetMode)) throw new TypeError(`${label}.combatTargetMode is invalid`);
		if (typeof victim.targetable !== "boolean") throw new TypeError(`${label}.targetable must be boolean`);
		const combatTargetId = checkedId(victim.combatTargetId, `${label}.combatTargetId`, true);
		if (combatTargetId === null !== (victim.combatTargetMode === null)) throw new TypeError(`${label} combat target fields must both be null or non-null`);
		const position = checkedPosition(victim.position, `${label}.position`);
		const radius = safeInteger(victim.radius, `${label}.radius`, 0, MAX_RADIUS);
		if (position.x < radius || position.x > 18e3 - radius || position.y < radius || position.y > 32e3 - radius) throw new RangeError(`${label} must fit in the radius-inset arena`);
		return {
			combatTargetId,
			combatTargetMode: victim.combatTargetMode,
			health: safeInteger(victim.health, `${label}.health`, 1, MAX_HEALTH),
			id: checkedId(victim.id, `${label}.id`),
			kind: victim.kind,
			layer: victim.layer,
			ownerId: safeInteger(victim.ownerId, `${label}.ownerId`, 1, MAX_OWNER_ID),
			position,
			radius,
			targetable: victim.targetable
		};
	});
	uniqueIds(victims, "rolling spell victim");
	return victims;
}
function checkedObstacles(value) {
	const obstacles = denseArray(value, MAX_OBSTACLES, "rolling spell obstacles").map((entry, index) => {
		const label = `rolling spell obstacle ${index}`;
		const obstacle = exactRecord(entry, OBSTACLE_KEYS, label);
		if (typeof obstacle.blocking !== "boolean") throw new TypeError(`${label}.blocking must be boolean`);
		const position = checkedPosition(obstacle.position, `${label}.position`);
		const radius = safeInteger(obstacle.radius, `${label}.radius`, 0, MAX_RADIUS);
		return {
			blocking: obstacle.blocking,
			id: checkedId(obstacle.id, `${label}.id`),
			position,
			radius
		};
	});
	uniqueIds(obstacles, "rolling spell obstacle");
	return obstacles;
}
function uniqueIds(records, label) {
	const ids = /* @__PURE__ */ new Set();
	for (const record of records) {
		if (ids.has(record.id)) throw new TypeError(`${label} IDs must be unique`);
		ids.add(record.id);
	}
}
function checkedCommands(value, sources, victims, obstacles) {
	const sourceIds = new Set(sources.map(({ id }) => id));
	const victimIds = new Set(victims.map(({ id }) => id));
	const obstacleIds = new Set(obstacles.map(({ id }) => id));
	const commands = denseArray(value, MAX_COMMANDS, "rolling spell commands").map((entry, index) => {
		const label = `rolling spell command ${index}`;
		const command = exactRecord(entry, COMMAND_KEYS, label);
		if (!COMMAND_TYPES.has(command.type)) throw new TypeError(`${label}.type is invalid`);
		const result = {
			center: null,
			effectId: null,
			id: checkedId(command.id, `${label}.id`),
			obstacleId: null,
			sourceId: null,
			targetId: null,
			tick: safeInteger(command.tick, `${label}.tick`, 0, 127),
			type: command.type
		};
		if (command.type === "cast") {
			result.center = checkedPosition(command.center, `${label}.center`);
			result.sourceId = checkedId(command.sourceId, `${label}.sourceId`);
			if (!sourceIds.has(result.sourceId) || command.effectId !== null || command.obstacleId !== null || command.targetId !== null) throw new TypeError(`${label} has invalid cast fields`);
		} else if (command.type === "source-died") {
			result.sourceId = checkedId(command.sourceId, `${label}.sourceId`);
			if (!sourceIds.has(result.sourceId) || command.center !== null || command.effectId !== null || command.obstacleId !== null || command.targetId !== null) throw new TypeError(`${label} has invalid source death fields`);
		} else if (command.type === "target-died") {
			result.targetId = checkedId(command.targetId, `${label}.targetId`);
			if (!victimIds.has(result.targetId) || command.center !== null || command.effectId !== null || command.obstacleId !== null || command.sourceId !== null) throw new TypeError(`${label} has invalid target death fields`);
		} else if (command.type === "obstacle-died") {
			result.obstacleId = checkedId(command.obstacleId, `${label}.obstacleId`);
			if (!obstacleIds.has(result.obstacleId) || command.center !== null || command.effectId !== null || command.sourceId !== null || command.targetId !== null) throw new TypeError(`${label} has invalid obstacle death fields`);
		} else {
			result.effectId = checkedId(command.effectId, `${label}.effectId`);
			if (command.center !== null || command.obstacleId !== null || command.sourceId !== null || command.targetId !== null) throw new TypeError(`${label} has invalid cancellation fields`);
		}
		return result;
	});
	uniqueIds(commands, "rolling spell command");
	let priorTick = -1;
	let priorId = -1;
	for (const command of commands) {
		if (command.tick < priorTick || command.tick === priorTick && command.id <= priorId) throw new TypeError("rolling spell commands must use increasing tick and command-ID order");
		priorTick = command.tick;
		priorId = command.id;
	}
	return commands;
}
function checkedSetup(value) {
	const setup = exactRecord(value, SETUP_KEYS, "rolling spell setup");
	const sources = checkedSources(setup.sources);
	const victims = checkedVictims(setup.victims);
	const obstacles = checkedObstacles(setup.obstacles);
	const all = [
		...sources,
		...victims,
		...obstacles
	];
	const ids = /* @__PURE__ */ new Set();
	for (const record of all) {
		if (ids.has(record.id)) throw new TypeError("rolling spell entity IDs must be disjoint");
		ids.add(record.id);
	}
	return {
		commands: checkedCommands(setup.commands, sources, victims, obstacles),
		obstacles,
		sources,
		victims
	};
}
function initialState(setup) {
	return {
		commandIndex: 0,
		history: [],
		nextEffectId: 1,
		obstacles: setup.obstacles.map((entry) => ({
			...clone(entry),
			alive: true
		})),
		pending: [],
		sources: setup.sources.map((entry) => ({
			...clone(entry),
			alive: true
		})),
		tick: 0,
		victims: setup.victims.map((entry) => ({
			...clone(entry),
			alive: true
		}))
	};
}
function lineCarrier(origin, center) {
	const setup = createTravelingLineSpellFixture({
		commands: [{
			center: { ...center },
			effectId: null,
			id: 1,
			sourceId: 1,
			targetId: null,
			tick: 0,
			type: "cast"
		}],
		sources: [{
			id: 1,
			ownerId: 1,
			position: { ...origin }
		}],
		victims: []
	});
	const launch = new TravelingLineSpellEncounter(setup).step().find(({ type }) => type === "travel-launch");
	return {
		duration: launch.duration,
		primitiveEffectId: launch.effectId
	};
}
function targetEligible(source, victim) {
	return victim.alive && victim.targetable && victim.ownerId !== source.ownerId && victim.layer === "ground" && VICTIM_KINDS.has(victim.kind);
}
function contactKey(origin, center, position, radius) {
	const dx = BigInt(center.x) - BigInt(origin.x);
	const dy = BigInt(center.y) - BigInt(origin.y);
	const px = BigInt(position.x) - BigInt(origin.x);
	const py = BigInt(position.y) - BigInt(origin.y);
	const lengthSquared = dx * dx + dy * dy;
	const combined = BigInt(ROLL_RADIUS + radius);
	const radiusSquared = combined * combined;
	if (px * px + py * py <= radiusSquared) return {
		radical: 0n,
		whole: 0n
	};
	if (lengthSquared === 0n) return null;
	const dot = px * dx + py * dy;
	const cross = px * dy - py * dx;
	const radical = radiusSquared * lengthSquared - cross * cross;
	if (radical < 0n) return null;
	if (dot < 0n && dot * dot > radical) return null;
	const beyondEnd = dot - lengthSquared;
	if (beyondEnd > 0n && beyondEnd * beyondEnd > radical) return null;
	return {
		radical,
		whole: dot
	};
}
function compareContactKeys(left, right) {
	const wholeDifference = left.whole - right.whole;
	if (wholeDifference < 0n) return -compareContactKeys(right, left);
	if (wholeDifference === 0n) return left.radical > right.radical ? -1 : left.radical < right.radical ? 1 : 0;
	const remainder = left.radical - wholeDifference * wholeDifference - right.radical;
	if (remainder < 0n) return 1;
	if (remainder === 0n) return right.radical === 0n ? 0 : 1;
	const squaredRemainder = remainder * remainder;
	const squaredRadical = 4n * wholeDifference * wholeDifference * right.radical;
	return squaredRemainder > squaredRadical ? -1 : squaredRemainder < squaredRadical ? 1 : 0;
}
function contactOrderNumerator(key) {
	return key.whole.toString();
}
function prefixContains(effect, position, radius, elapsed) {
	const { origin, center, duration } = effect;
	const dx = BigInt(center.x) - BigInt(origin.x);
	const dy = BigInt(center.y) - BigInt(origin.y);
	const px = BigInt(position.x) - BigInt(origin.x);
	const py = BigInt(position.y) - BigInt(origin.y);
	const lengthSquared = dx * dx + dy * dy;
	const combined = BigInt(ROLL_RADIUS + radius);
	const radiusSquared = combined * combined;
	const pointSquared = px * px + py * py;
	if (lengthSquared === 0n || pointSquared <= radiusSquared) return pointSquared <= radiusSquared;
	if (elapsed >= duration) return contactKey(origin, center, position, radius) !== null;
	const reach = 1000n * BigInt(elapsed);
	const dot = px * dx + py * dy;
	if (reach === 0n || dot <= 0n) return false;
	const reachSquared = reach * reach;
	if (dot * dot <= reachSquared * lengthSquared) {
		const cross = px * dy - py * dx;
		return cross * cross <= radiusSquared * lengthSquared;
	}
	const left = (pointSquared + reachSquared - radiusSquared) * lengthSquared;
	if (left <= 0n) return true;
	return left * left <= 4n * dot * dot * reachSquared * lengthSquared;
}
function contactCandidates(state, source, effect) {
	const elapsed = state.tick - effect.launchTick;
	const hit = new Set(effect.contactedTargetIds);
	const targets = state.victims.filter((victim) => targetEligible(source, victim) && !hit.has(victim.id)).map((victim) => ({
		id: victim.id,
		key: contactKey(effect.origin, effect.center, victim.position, victim.radius),
		record: victim,
		type: "target"
	}));
	const obstacles = state.obstacles.filter((obstacle) => obstacle.alive && obstacle.blocking).map((obstacle) => ({
		id: obstacle.id,
		key: contactKey(effect.origin, effect.center, obstacle.position, obstacle.radius),
		record: obstacle,
		type: "obstacle"
	}));
	return [...targets, ...obstacles].filter(({ key, record }) => key !== null && prefixContains(effect, record.position, record.radius, elapsed)).sort((left, right) => compareContactKeys(left.key, right.key) || left.id - right.id);
}
function instantDamagePhases(source, victim) {
	const fixture = createInstantSpellFixture({
		commands: [{
			center: { ...victim.position },
			id: 1,
			sourceId: source.id,
			targetId: null,
			tick: 0,
			type: "cast",
			variant: "plain"
		}],
		sources: [{
			id: source.id,
			ownerId: source.ownerId
		}],
		victims: [{
			combatTargetId: victim.combatTargetId,
			combatTargetMode: victim.combatTargetMode,
			health: Math.max(1, victim.health),
			id: victim.id,
			kind: victim.kind,
			layer: victim.layer,
			ownerId: victim.ownerId,
			position: { ...victim.position },
			radius: victim.radius,
			targetable: true
		}]
	});
	return new InstantRadiusSpellEncounter(fixture).run().filter(({ type }) => type === "spell-hit" || type === "spell-damage" || type === "spell-death");
}
function damageTarget(state, source, effect, victim, key, events) {
	const phases = instantDamagePhases(source, victim);
	if (!phases.some(({ type }) => type === "spell-hit")) throw new TypeError("rolling spell instant damage composition failed");
	const amount = victim.kind === "crown" ? CROWN_DAMAGE : DAMAGE;
	const healthBefore = victim.health;
	const healthAfter = Math.max(0, healthBefore - amount);
	effect.contactedTargetIds.push(victim.id);
	events.push({
		effectId: effect.effectId,
		orderNumerator: contactOrderNumerator(key),
		targetId: victim.id,
		tick: state.tick,
		type: "roll-contact"
	}, {
		amount,
		effectId: effect.effectId,
		primitiveEffectId: phases[0].effectId,
		targetId: victim.id,
		tick: state.tick,
		type: "roll-hit"
	}, {
		amount,
		effectId: effect.effectId,
		healthAfter,
		healthBefore,
		primitiveEffectId: phases[0].effectId,
		targetId: victim.id,
		tick: state.tick,
		type: "roll-damage"
	});
	victim.health = healthAfter;
	if (healthAfter === 0) {
		victim.alive = false;
		events.push({
			effectId: effect.effectId,
			primitiveEffectId: phases.at(-1).effectId,
			targetId: victim.id,
			tick: state.tick,
			type: "roll-death"
		});
	}
}
function resolveEffectBoundary(state, effect, events) {
	const source = state.sources.find(({ id }) => id === effect.sourceId);
	if (effect.cancelled || !source.alive) {
		events.push({
			effectId: effect.effectId,
			reason: effect.cancelled ? "explicit-cancel" : "source-dead",
			sourceId: effect.sourceId,
			tick: state.tick,
			type: "roll-cancelled"
		});
		return true;
	}
	const candidates = contactCandidates(state, source, effect);
	const blocker = candidates.find(({ type }) => type === "obstacle");
	for (const candidate of candidates) {
		if (blocker !== void 0 && compareContactKeys(candidate.key, blocker.key) >= 0) {
			events.push({
				effectId: effect.effectId,
				obstacleId: blocker.id,
				orderNumerator: contactOrderNumerator(blocker.key),
				tick: state.tick,
				type: "roll-stopped"
			});
			return true;
		}
		if (candidate.record.alive) damageTarget(state, source, effect, candidate.record, candidate.key, events);
	}
	if (state.tick === effect.expiryTick) {
		events.push({
			center: { ...effect.center },
			duration: effect.duration,
			effectId: effect.effectId,
			sourceId: effect.sourceId,
			tick: state.tick,
			type: "roll-expired"
		});
		return true;
	}
	return false;
}
function applyCommand(state, command, events) {
	if (command.type === "cast") {
		const source = state.sources.find(({ id }) => id === command.sourceId);
		if (!source.alive) {
			events.push({
				commandId: command.id,
				reason: "source-dead",
				sourceId: source.id,
				tick: state.tick,
				type: "roll-launch-cancelled"
			});
			return;
		}
		if (state.nextEffectId === Number.MAX_SAFE_INTEGER) throw new RangeError("rolling spell effect ID space is exhausted");
		const carrier = lineCarrier(source.position, command.center);
		if (carrier.duration > 127 - state.tick) throw new RangeError("rolling spell expiry exceeds encounter tick bound");
		const effectId = state.nextEffectId;
		state.nextEffectId += 1;
		state.pending.push({
			cancelled: false,
			center: { ...command.center },
			contactedTargetIds: [],
			duration: carrier.duration,
			effectId,
			expiryTick: state.tick + carrier.duration,
			launchTick: state.tick,
			origin: { ...source.position },
			primitiveEffectId: carrier.primitiveEffectId,
			sourceId: source.id
		});
		events.push({
			center: { ...command.center },
			duration: carrier.duration,
			effectId,
			expiryTick: state.tick + carrier.duration,
			origin: { ...source.position },
			primitiveEffectId: carrier.primitiveEffectId,
			radius: ROLL_RADIUS,
			sourceId: source.id,
			tick: state.tick,
			type: "roll-launch"
		});
		return;
	}
	if (command.type === "source-died") {
		const source = state.sources.find(({ id }) => id === command.sourceId);
		if (source.alive) {
			source.alive = false;
			events.push({
				sourceId: source.id,
				tick: state.tick,
				type: "roll-source-died"
			});
		}
		return;
	}
	if (command.type === "target-died") {
		const victim = state.victims.find(({ id }) => id === command.targetId);
		if (victim.alive) {
			victim.alive = false;
			victim.health = 0;
			events.push({
				targetId: victim.id,
				tick: state.tick,
				type: "roll-target-died"
			});
		}
		return;
	}
	if (command.type === "obstacle-died") {
		const obstacle = state.obstacles.find(({ id }) => id === command.obstacleId);
		if (obstacle.alive) {
			obstacle.alive = false;
			events.push({
				obstacleId: obstacle.id,
				tick: state.tick,
				type: "roll-obstacle-died"
			});
		}
		return;
	}
	const effect = state.pending.find(({ effectId }) => effectId === command.effectId);
	if (effect !== void 0 && effect.expiryTick >= state.tick) {
		effect.cancelled = true;
		events.push({
			effectId: effect.effectId,
			tick: state.tick,
			type: "roll-cancel-requested"
		});
	}
}
function advance(state, commands) {
	if (state.tick >= MAX_TICK) return [];
	const events = [];
	while (commands[state.commandIndex]?.tick === state.tick) {
		applyCommand(state, commands[state.commandIndex], events);
		state.commandIndex += 1;
	}
	const completed = /* @__PURE__ */ new Set();
	for (const effect of [...state.pending].sort((a, b) => a.effectId - b.effectId)) if (resolveEffectBoundary(state, effect, events)) completed.add(effect.effectId);
	state.pending = state.pending.filter(({ effectId }) => !completed.has(effectId));
	if (state.history.length + events.length > MAX_EVENTS) throw new RangeError("rolling spell replay exceeds its event bound");
	state.history.push(...clone(events));
	state.tick += 1;
	return events;
}
function questionRecord(key, value) {
	return deepFreeze({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		key,
		source: SOURCE,
		value: clone(value)
	});
}
function createRollingSpellCatalog(...args) {
	if (args.length !== 0) throw new TypeError("rolling spell catalog does not accept overrides");
	return deepFreeze([{
		areaDamageRadiusMillitiles: ROLL_RADIUS,
		components: [],
		cost: 2,
		count: 1,
		damage: DAMAGE,
		deployTimeTicks: null,
		displayName: "Ironbark Roller",
		firstHitTicks: null,
		hitSpeedTicks: null,
		hitpoints: null,
		id: "ironbark-roller",
		kind: "effect",
		movementMillitilesPerSecond: null,
		rangeMillitiles: null,
		rarity: "mythic",
		sightRangeMillitiles: null,
		targetMode: "ground"
	}]);
}
function createRollingSpellQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("rolling spell questions do not accept overrides");
	return deepFreeze(Object.fromEntries(Object.entries(QUESTION_VALUES).map(([key, value]) => [key, questionRecord(key, value)])));
}
function createRollingSpellFixture(value) {
	return clone(checkedSetup(value));
}
var SOURCE, DAMAGE, CROWN_DAMAGE, ROLL_RADIUS, MAX_COMMANDS, MAX_EVENTS, MAX_HEALTH, MAX_OWNER_ID, MAX_RADIUS, MAX_SNAPSHOT_BYTES, MAX_SOURCES, MAX_STEP_CHUNK, MAX_TICK, MAX_VICTIMS, MAX_OBSTACLES, COMMAND_KEYS, SETUP_KEYS, SOURCE_KEYS, VICTIM_KEYS, OBSTACLE_KEYS, SNAPSHOT_KEYS, IDENTITY_KEYS, COMMAND_TYPES, VICTIM_KINDS, VICTIM_LAYERS, COMBAT_TARGET_MODES, QUESTION_VALUES, RollingSpellEncounter;
function init_spells_roll() {
	return (init_spells_roll = __esmMin((() => {
		init_arena_geometry();
		init_spells_instant();
		init_spells_travel_line();
		SOURCE = "unsourced-rolling-collision-spell-composition";
		DAMAGE = 290;
		CROWN_DAMAGE = 87;
		ROLL_RADIUS = 1950;
		MAX_COMMANDS = 96;
		MAX_EVENTS = 8192;
		MAX_HEALTH = 1e6;
		MAX_OWNER_ID = 1024;
		MAX_RADIUS = 9e3;
		MAX_SNAPSHOT_BYTES = 262144;
		MAX_SOURCES = 16;
		MAX_STEP_CHUNK = 128;
		MAX_TICK = 128;
		MAX_VICTIMS = 64;
		MAX_OBSTACLES = 64;
		COMMAND_KEYS = [
			"center",
			"effectId",
			"id",
			"obstacleId",
			"sourceId",
			"targetId",
			"tick",
			"type"
		];
		SETUP_KEYS = [
			"commands",
			"obstacles",
			"sources",
			"victims"
		];
		SOURCE_KEYS = [
			"id",
			"ownerId",
			"position"
		];
		VICTIM_KEYS = [
			"combatTargetId",
			"combatTargetMode",
			"health",
			"id",
			"kind",
			"layer",
			"ownerId",
			"position",
			"radius",
			"targetable"
		];
		OBSTACLE_KEYS = [
			"blocking",
			"id",
			"position",
			"radius"
		];
		SNAPSHOT_KEYS = [
			"identity",
			"tick",
			"version"
		];
		IDENTITY_KEYS = ["fixture", "setup"];
		COMMAND_TYPES = /* @__PURE__ */ new Set([
			"cancel-effect",
			"cast",
			"obstacle-died",
			"source-died",
			"target-died"
		]);
		VICTIM_KINDS = /* @__PURE__ */ new Set([
			"crown",
			"structure",
			"troop"
		]);
		VICTIM_LAYERS = /* @__PURE__ */ new Set(["air", "ground"]);
		COMBAT_TARGET_MODES = /* @__PURE__ */ new Set([
			"air",
			"air_and_ground",
			"buildings",
			"ground",
			"none"
		]);
		QUESTION_VALUES = Object.freeze({
			cancellationBoundary: "commands-first; cancellation or source death prevents same-tick new contacts",
			collisionDamage: "unverified-corpus-value-290; crown damage uses nearest-half-up three-tenths",
			collisionGeometry: "static-cast-snapshot swept closed capsule; radius 1950 plus target radius",
			collisionOrder: "exact swept-capsule entry then stable numeric ID",
			damageComposition: "passed instant plain damage event phases adapted to one contacted target",
			expiryBoundary: "expire after inclusive endpoint contacts at carrier impact tick",
			movingTargetPolicy: "cast-time position snapshot",
			obstaclePolicy: "first living blocking obstacle stops roll before equal-or-later contacts",
			repeatHitPolicy: "at-most-once per target per rolling effect",
			rollingRadiusMillitiles: ROLL_RADIUS,
			sameBoundaryOrder: "commands then effects by ID then contacts by path key; each damage is atomic",
			sourceDeathAfterContact: "does not undo prior contact damage",
			stopBoundary: "obstacle contact emits stop and suppresses terminal expiry",
			targetDeathBoundary: "command-first death excludes contact; earlier effect death excludes later effect",
			targetFilter: "living targetable hostile ground troop structure or crown",
			travelComposition: "passed traveling-line carrier determines exact duration",
			travelSpeedMillitilesPerTick: 1e3
		});
		RollingSpellEncounter = class RollingSpellEncounter {
			#setup;
			#state;
			constructor(setup) {
				this.#setup = checkedSetup(setup);
				this.#state = initialState(this.#setup);
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
				safeInteger(count, "rolling spell step count", 0, MAX_STEP_CHUNK);
				if (count > MAX_TICK - this.#state.tick) throw new RangeError("rolling spell step count exceeds encounter bound");
				const candidate = clone(this.#state);
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...advance(candidate, this.#setup.commands));
				this.#state = candidate;
				return clone(events);
			}
			run() {
				return this.stepMany(MAX_TICK - this.#state.tick);
			}
			serialize() {
				const serialized = canonicalJson({
					identity: {
						fixture: "rolling-spell-question-v1",
						setup: this.#setup
					},
					tick: this.#state.tick,
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES) throw new RangeError("rolling spell snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("rolling spell snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES) throw new RangeError("rolling spell snapshot exceeds its byte bound");
				let value;
				try {
					value = JSON.parse(serialized);
				} catch {
					throw new TypeError("rolling spell snapshot must be valid JSON");
				}
				if (canonicalJson(value) !== serialized) throw new TypeError("rolling spell snapshot must be canonical duplicate-free JSON");
				const snapshot = exactRecord(value, SNAPSHOT_KEYS, "rolling spell snapshot");
				if (snapshot.version !== 1) throw new TypeError("rolling spell snapshot version is unsupported");
				const identity = exactRecord(snapshot.identity, IDENTITY_KEYS, "rolling spell snapshot.identity");
				if (identity.fixture !== "rolling-spell-question-v1") throw new TypeError("rolling spell snapshot fixture is unsupported");
				safeInteger(snapshot.tick, "rolling spell snapshot.tick", 0, MAX_TICK);
				const encounter = new RollingSpellEncounter(checkedSetup(identity.setup));
				encounter.stepMany(snapshot.tick);
				return encounter;
			}
		};
	})))();
}
//#endregion
export { createSpawnSpellQuestionRecords as A, getPreviousCardCopyQuestions as B, createPeriodicSpellFixture as C, SPAWN_SPELL_IDENTITIES as D, SPAWN_SPELL_COUNTS as E, getCloneUnitRules as F, createInstantSpellQuestionRecords as G, InstantRadiusSpellEncounter as H, init_spells_clone_unit as I, init_spells_instant as K, COPY_CARD_MAX_TICK as L, DeployedUnitCloneEncounter as M, createCloneUnitEntityFromShieldForm as N, SpawnSpellEncounter as O, getCloneUnitQuestionRecords as P, PREVIOUS_CARD_COPY_QUESTIONS as R, createPeriodicSpellCatalog as S, init_spells_periodic as T, createInstantSpellCatalog as U, init_spells_copy_card as V, createInstantSpellFixture as W, createTravelingLineSpellCatalog as _, init_spells_roll as a, init_spells_travel_line as b, createThreeWaveTravelingSpellFixture as c, ReturningSpellEncounter as d, createReturningSpellCatalog as f, TravelingLineSpellEncounter as g, init_spells_return as h, createRollingSpellQuestionRecords as i, init_spells_spawn as j, createSpawnSpellFixture as k, createThreeWaveTravelingSpellQuestionRecords as l, createReturningSpellQuestionRecords as m, createRollingSpellCatalog as n, ThreeWaveTravelingSpellEncounter as o, createReturningSpellFixture as p, createRollingSpellFixture as r, createThreeWaveTravelingSpellCatalog as s, RollingSpellEncounter as t, init_spells_three_wave as u, createTravelingLineSpellFixture as v, createPeriodicSpellQuestionRecords as w, PeriodicAreaSpellEncounter as x, createTravelingLineSpellQuestionRecords as y, PreviousCardCopyMatch as z };
