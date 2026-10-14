import { t as __esmMin } from "../../../../../../rolldown-runtime-Cl99QfTQ.js";
import { B as createCardCatalog, V as init_schema } from "./arena-shell-entry-C8NHd_jT.js";
//#region src/content/cards/special-combat-ramp.js
function deepFreeze$4(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze$4(child);
		Object.freeze(value);
	}
	return value;
}
function clone$4(value) {
	return JSON.parse(JSON.stringify(value));
}
function canonicalJson$4(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$4).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$4(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
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
function exactRecord$4(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
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
function safeInteger$4(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
}
function checkedTargetId(value, label, nullable = false) {
	if (nullable && value === null) return;
	safeInteger$4(value, label, 1);
}
function checkedCommands$4(value) {
	const commands = denseArray$4(value, "ramp commands", MAX_COMMANDS$4).map((entry, index) => {
		const command = exactRecord$4(entry, COMMAND_KEYS$4, `ramp command ${index}`);
		safeInteger$4(command.tick, `ramp command ${index}.tick`, 0, 4095);
		if (!COMMAND_TYPES$4.has(command.type)) throw new TypeError(`ramp command ${index}.type is invalid`);
		if (command.type === "target-acquired") checkedTargetId(command.targetId, `ramp command ${index}.targetId`);
		else if (command.type === "target-died" && command.targetId !== null) checkedTargetId(command.targetId, `ramp command ${index}.targetId`);
		else if (command.type !== "target-died" && command.targetId !== null) throw new TypeError(`ramp command ${index}.targetId must be null for ${command.type}`);
		return {
			targetId: command.targetId,
			tick: command.tick,
			type: command.type
		};
	});
	let priorTick = -1;
	for (const command of commands) {
		if (command.tick <= priorTick) throw new TypeError("ramp commands must have unique increasing ticks");
		priorTick = command.tick;
	}
	return commands;
}
function checkedSetup$4(value) {
	return { commands: checkedCommands$4(exactRecord$4(value, SETUP_KEYS$4, "ramp setup").commands) };
}
function checkedPending(value, label) {
	if (value === null) return null;
	const pending = exactRecord$4(value, PENDING_KEYS$1, label);
	safeInteger$4(pending.amount, `${label}.amount`, 1);
	safeInteger$4(pending.contactTick, `${label}.contactTick`, 0, MAX_TICK$4);
	safeInteger$4(pending.sequence, `${label}.sequence`, 1, MAX_REPLAY_EVENTS);
	safeInteger$4(pending.stageIndex, `${label}.stageIndex`, 0, QUESTION_VALUES$4.stageCount - 1);
	checkedTargetId(pending.targetId, `${label}.targetId`);
	if (pending.amount !== QUESTION_VALUES$4.damageProgression[pending.stageIndex]) throw new TypeError(`${label} damage does not match its launch stage`);
	return { ...pending };
}
function checkedEvent$4(value, index) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`ramp history event ${index} has an invalid shape`);
	const descriptor = Object.getOwnPropertyDescriptor(value, "type");
	if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`ramp history event ${index}.type must be data`);
	const keys = EVENT_KEYS$4[descriptor.value];
	if (keys === void 0) throw new TypeError(`ramp history event ${index}.type is invalid`);
	const event = exactRecord$4(value, keys, `ramp history event ${index}`);
	safeInteger$4(event.tick, `ramp history event ${index}.tick`, 0, 4095);
	if (Object.hasOwn(event, "targetId")) checkedTargetId(event.targetId, `ramp history event ${index}.targetId`, true);
	for (const key of [
		"amount",
		"contactTick",
		"consecutiveContacts",
		"healthAfter",
		"healthBefore",
		"sequence",
		"stageIndex"
	]) if (Object.hasOwn(event, key)) safeInteger$4(event[key], `ramp history event ${index}.${key}`);
	if (Object.hasOwn(event, "stageIndex") && event.stageIndex >= QUESTION_VALUES$4.stageCount) throw new TypeError(`ramp history event ${index}.stageIndex is invalid`);
	if (Object.hasOwn(event, "contactTick") && event.contactTick > MAX_TICK$4) throw new TypeError(`ramp history event ${index}.contactTick is invalid`);
	if (Object.hasOwn(event, "sequence") && event.sequence > MAX_REPLAY_EVENTS) throw new TypeError(`ramp history event ${index}.sequence is invalid`);
	if (Object.hasOwn(event, "consecutiveContacts") && event.consecutiveContacts > MAX_TICK$4) throw new TypeError(`ramp history event ${index}.consecutiveContacts is invalid`);
	for (const key of ["healthAfter", "healthBefore"]) if (Object.hasOwn(event, key) && event[key] > TARGET_HEALTH$1) throw new TypeError(`ramp history event ${index}.${key} is invalid`);
	if (Object.hasOwn(event, "reason") && ![
		"explicit",
		"interruption",
		"target-change",
		"target-death",
		"target-loss"
	].includes(event.reason)) throw new TypeError(`ramp history event ${index}.reason is invalid`);
	return event;
}
function stageForContacts(contacts) {
	let stageIndex = 0;
	for (let index = 1; index < QUESTION_VALUES$4.stageThresholds.length; index += 1) if (contacts >= QUESTION_VALUES$4.stageThresholds[index]) stageIndex = index;
	return stageIndex;
}
function initialState$4() {
	return {
		attackSequence: 0,
		commandIndex: 0,
		consecutiveContacts: 0,
		history: [],
		nextLaunchTick: null,
		pending: null,
		stageIndex: 0,
		targetAlive: false,
		targetEligible: false,
		targetHealth: null,
		targetId: null,
		tick: 0
	};
}
function checkedState$1(value, commands, label = "ramp state") {
	const state = exactRecord$4(value, STATE_KEYS$4, label);
	safeInteger$4(state.tick, `${label}.tick`, 0, MAX_TICK$4);
	safeInteger$4(state.commandIndex, `${label}.commandIndex`, 0, commands.length);
	safeInteger$4(state.attackSequence, `${label}.attackSequence`, 0, MAX_TICK$4);
	safeInteger$4(state.consecutiveContacts, `${label}.consecutiveContacts`, 0, MAX_TICK$4);
	safeInteger$4(state.stageIndex, `${label}.stageIndex`, 0, QUESTION_VALUES$4.stageCount - 1);
	if (typeof state.targetAlive !== "boolean" || typeof state.targetEligible !== "boolean") throw new TypeError(`${label} target flags must be booleans`);
	checkedTargetId(state.targetId, `${label}.targetId`, true);
	if (state.targetHealth !== null) safeInteger$4(state.targetHealth, `${label}.targetHealth`, 0, TARGET_HEALTH$1);
	if (state.nextLaunchTick !== null) safeInteger$4(state.nextLaunchTick, `${label}.nextLaunchTick`, state.tick, MAX_TICK$4);
	const pending = checkedPending(state.pending, `${label}.pending`);
	const history = denseArray$4(state.history, `${label}.history`, MAX_REPLAY_EVENTS).map(checkedEvent$4);
	let priorEventTick = -1;
	for (const event of history) {
		if (event.tick < priorEventTick || event.tick >= state.tick) throw new TypeError(`${label} history is noncausal`);
		priorEventTick = event.tick;
	}
	if (state.consecutiveContacts > state.attackSequence) throw new TypeError(`${label} has more contacts than launches`);
	if (state.stageIndex !== stageForContacts(state.consecutiveContacts)) throw new TypeError(`${label} stage does not match consecutive contacts`);
	const hasTarget = state.targetId !== null;
	if (hasTarget !== state.targetAlive || hasTarget !== state.targetEligible || hasTarget !== (state.targetHealth !== null && state.targetHealth > 0)) throw new TypeError(`${label} target fields are inconsistent`);
	if (!hasTarget && (state.nextLaunchTick !== null || pending !== null || state.consecutiveContacts !== 0 || state.stageIndex !== 0)) throw new TypeError(`${label} inactive target retains attack state`);
	if (pending !== null && (pending.targetId !== state.targetId || pending.sequence > state.attackSequence || pending.contactTick < state.tick || pending.contactTick > state.tick + QUESTION_VALUES$4.contactDelayTicks)) throw new TypeError(`${label} pending launch is inconsistent`);
	const expectedCommandIndex = commands.filter((command) => command.tick < state.tick).length;
	if (state.commandIndex !== expectedCommandIndex) throw new TypeError(`${label} command cursor is noncausal`);
	return {
		attackSequence: state.attackSequence,
		commandIndex: state.commandIndex,
		consecutiveContacts: state.consecutiveContacts,
		history,
		nextLaunchTick: state.nextLaunchTick,
		pending,
		stageIndex: state.stageIndex,
		targetAlive: state.targetAlive,
		targetEligible: state.targetEligible,
		targetHealth: state.targetHealth,
		targetId: state.targetId,
		tick: state.tick
	};
}
function resetRamp(state, reason, events, blockBoundary) {
	const changed = state.consecutiveContacts !== 0 || state.stageIndex !== 0 || state.pending !== null;
	state.consecutiveContacts = 0;
	state.stageIndex = 0;
	state.pending = null;
	if (state.targetId !== null) state.nextLaunchTick = blockBoundary ? state.tick + QUESTION_VALUES$4.commonHitCadenceTicks : state.tick + QUESTION_VALUES$4.firstLaunchTicks;
	else state.nextLaunchTick = null;
	if (changed || reason === "explicit" || reason === "interruption") events.push({
		reason,
		targetId: state.targetId,
		tick: state.tick,
		type: "ramp-reset"
	});
}
function applyCommand$4(state, command, events) {
	if (command.type === "target-acquired") {
		if (state.targetId !== command.targetId) {
			if (state.targetId !== null) resetRamp(state, "target-change", events, false);
			state.targetId = command.targetId;
			state.targetAlive = true;
			state.targetEligible = true;
			state.targetHealth = TARGET_HEALTH$1;
			state.nextLaunchTick = state.tick + QUESTION_VALUES$4.firstLaunchTicks;
			events.push({
				targetId: state.targetId,
				tick: state.tick,
				type: "target-acquired"
			});
		}
		return false;
	}
	if (command.type === "target-lost") {
		const priorId = state.targetId;
		if (priorId !== null) resetRamp(state, "target-loss", events, false);
		state.targetId = null;
		state.targetAlive = false;
		state.targetEligible = false;
		state.targetHealth = null;
		state.nextLaunchTick = null;
		events.push({
			targetId: priorId,
			tick: state.tick,
			type: "target-lost"
		});
		return true;
	}
	if (command.type === "target-died") {
		if (state.targetId !== null && (command.targetId === null || command.targetId === state.targetId)) {
			const priorId = state.targetId;
			resetRamp(state, "target-death", events, false);
			state.targetId = null;
			state.targetAlive = false;
			state.targetEligible = false;
			state.targetHealth = null;
			state.nextLaunchTick = null;
			events.push({
				targetId: priorId,
				tick: state.tick,
				type: "target-died"
			});
		}
		return true;
	}
	resetRamp(state, command.type === "reset" ? "explicit" : "interruption", events, true);
	return true;
}
function advanceOne$1(state, commands) {
	if (state.tick >= MAX_TICK$4) return [];
	const events = [];
	let blockLaunch = false;
	const command = commands[state.commandIndex];
	if (command?.tick === state.tick) {
		state.commandIndex += 1;
		blockLaunch = applyCommand$4(state, command, events);
	}
	if (state.pending?.contactTick === state.tick) {
		const pending = state.pending;
		state.pending = null;
		if (state.targetId === pending.targetId && state.targetAlive && state.targetEligible) {
			const before = state.targetHealth;
			state.targetHealth = Math.max(0, before - pending.amount);
			events.push({
				amount: pending.amount,
				healthAfter: state.targetHealth,
				healthBefore: before,
				sequence: pending.sequence,
				stageIndex: pending.stageIndex,
				targetId: pending.targetId,
				tick: state.tick,
				type: "damage"
			});
			state.consecutiveContacts += 1;
			const nextStage = stageForContacts(state.consecutiveContacts);
			if (nextStage !== state.stageIndex) {
				state.stageIndex = nextStage;
				events.push({
					consecutiveContacts: state.consecutiveContacts,
					stageIndex: nextStage,
					targetId: state.targetId,
					tick: state.tick,
					type: "stage-changed"
				});
			}
		}
	}
	if (!blockLaunch && state.targetId !== null && state.targetAlive && state.targetEligible && state.pending === null && state.nextLaunchTick === state.tick) {
		state.attackSequence += 1;
		const amount = QUESTION_VALUES$4.damageProgression[state.stageIndex];
		const contactTick = state.tick + QUESTION_VALUES$4.contactDelayTicks;
		state.pending = {
			amount,
			contactTick,
			sequence: state.attackSequence,
			stageIndex: state.stageIndex,
			targetId: state.targetId
		};
		state.nextLaunchTick = state.tick + QUESTION_VALUES$4.commonHitCadenceTicks;
		events.push({
			amount,
			contactTick,
			sequence: state.attackSequence,
			stageIndex: state.stageIndex,
			targetId: state.targetId,
			tick: state.tick,
			type: "attack-launched"
		});
	}
	if (state.nextLaunchTick !== null && state.nextLaunchTick > MAX_TICK$4) state.nextLaunchTick = null;
	if (state.history.length + events.length > MAX_REPLAY_EVENTS) throw new RangeError("ramp replay exceeds its event bound");
	state.history.push(...clone$4(events));
	state.tick += 1;
	return events;
}
/**
* Returns the original shipped runtime definition. Numeric combat fields are
* question-backed reconstruction inputs; only identity, cost, kind, and rarity
* are supported by the common roster corpus.
*/
function createRampSpecialCatalog() {
	return createCardCatalog(CARD_DEFINITIONS$4);
}
/**
* Returns fresh, recursively frozen records. Each absent number or policy has
* its own record so later evidence can replace one assumption without silently
* promoting any other assumption.
*/
function createRampQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("ramp question records do not accept overrides");
	const records = {};
	for (const [key, value] of Object.entries(QUESTION_VALUES$4)) records[key] = questionRecord$4(key, value);
	return deepFreeze$4(records);
}
function createRampFixture(commands = []) {
	return clone$4(checkedSetup$4({ commands }));
}
var CARD_DEFINITIONS$4, SOURCE$4, MAX_COMMANDS$4, MAX_REPLAY_EVENTS, MAX_SNAPSHOT_BYTES$4, MAX_STEP_CHUNK$4, MAX_TICK$4, TARGET_HEALTH$1, COMMAND_TYPES$4, COMMAND_KEYS$4, SETUP_KEYS$4, SNAPSHOT_KEYS$4, IDENTITY_KEYS$4, STATE_KEYS$4, PENDING_KEYS$1, EVENT_KEYS$4, QUESTION_VALUES$4, ConsecutiveTargetRampEncounter;
function init_special_combat_ramp() {
	return (init_special_combat_ramp = __esmMin((() => {
		init_schema();
		CARD_DEFINITIONS$4 = [{
			areaDamageRadiusMillitiles: null,
			components: [],
			cost: 4,
			count: 1,
			damage: 36,
			deployTimeTicks: 60,
			displayName: "Cinder Ray",
			firstHitTicks: 72,
			hitSpeedTicks: 24,
			hitpoints: 1294,
			id: "cinder-ray",
			kind: "unit",
			movementMillitilesPerSecond: 1e3,
			rangeMillitiles: 3500,
			rarity: "mythic",
			sightRangeMillitiles: 5500,
			targetMode: "ground-and-air"
		}];
		SOURCE$4 = "unsourced-consecutive-target-ramp-fixture";
		MAX_COMMANDS$4 = 64;
		MAX_REPLAY_EVENTS = 4096;
		MAX_SNAPSHOT_BYTES$4 = 131072;
		MAX_STEP_CHUNK$4 = 4096;
		MAX_TICK$4 = 4096;
		TARGET_HEALTH$1 = 1e6;
		COMMAND_TYPES$4 = /* @__PURE__ */ new Set([
			"interrupt",
			"reset",
			"target-acquired",
			"target-died",
			"target-lost"
		]);
		COMMAND_KEYS$4 = [
			"targetId",
			"tick",
			"type"
		];
		SETUP_KEYS$4 = ["commands"];
		SNAPSHOT_KEYS$4 = [
			"identity",
			"state",
			"version"
		];
		IDENTITY_KEYS$4 = ["commands", "fixture"];
		STATE_KEYS$4 = [
			"attackSequence",
			"commandIndex",
			"consecutiveContacts",
			"history",
			"nextLaunchTick",
			"pending",
			"stageIndex",
			"targetAlive",
			"targetEligible",
			"targetHealth",
			"targetId",
			"tick"
		];
		PENDING_KEYS$1 = [
			"amount",
			"contactTick",
			"sequence",
			"stageIndex",
			"targetId"
		];
		EVENT_KEYS$4 = {
			"attack-launched": [
				"amount",
				"contactTick",
				"sequence",
				"stageIndex",
				"targetId",
				"tick",
				"type"
			],
			damage: [
				"amount",
				"healthAfter",
				"healthBefore",
				"sequence",
				"stageIndex",
				"targetId",
				"tick",
				"type"
			],
			"ramp-reset": [
				"reason",
				"targetId",
				"tick",
				"type"
			],
			"stage-changed": [
				"consecutiveContacts",
				"stageIndex",
				"targetId",
				"tick",
				"type"
			],
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
		QUESTION_VALUES$4 = Object.freeze({
			commonAreaDamageRadius: null,
			commonBaseDamage: 36,
			commonCount: 1,
			commonDeployTicks: 60,
			commonFirstHitTicks: 72,
			commonHitCadenceTicks: 24,
			commonHitpoints: 1294,
			commonMovementMillitilesPerSecond: 1e3,
			commonRangeMillitiles: 3500,
			commonSightRangeMillitiles: 5500,
			commonTargetMode: "ground-and-air",
			contactDelayTicks: 2,
			damageProgression: Object.freeze([
				10,
				20,
				40
			]),
			decay: "none",
			eligibility: "explicit-eligible-living-target",
			explicitReset: "clear-stage-and-pending-retain-target-block-boundary",
			firstLaunchTicks: 0,
			interruption: "clear-stage-and-pending-retain-target-block-boundary",
			launchSnapshot: "copy-target-stage-and-damage-at-launch",
			lossChangeDeathReset: "clear-stage-and-pending",
			retainedTargetIdentity: "same-positive-safe-integer-id",
			sameBoundaryOrdering: "command-first-then-contact-then-launch",
			stageAdvancement: "after-successful-contact",
			stageCount: 3,
			stageThresholds: Object.freeze([
				0,
				2,
				4
			])
		});
		ConsecutiveTargetRampEncounter = class ConsecutiveTargetRampEncounter {
			#commands;
			#state;
			constructor(setup = createRampFixture()) {
				const checked = checkedSetup$4(setup);
				this.#commands = checked.commands;
				this.#state = initialState$4();
			}
			get replay() {
				return clone$4(this.#state.history);
			}
			get state() {
				return clone$4(this.#state);
			}
			step() {
				return clone$4(advanceOne$1(this.#state, this.#commands));
			}
			stepMany(count) {
				safeInteger$4(count, "ramp step count", 0, MAX_STEP_CHUNK$4);
				if (count > MAX_TICK$4 - this.#state.tick) throw new RangeError("ramp step count exceeds the encounter bound");
				const candidate = checkedState$1(this.#state, this.#commands);
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...advanceOne$1(candidate, this.#commands));
				this.#state = candidate;
				return clone$4(events);
			}
			run() {
				return this.stepMany(MAX_TICK$4 - this.#state.tick);
			}
			serialize() {
				return canonicalJson$4({
					identity: {
						commands: this.#commands,
						fixture: "consecutive-target-ramp-question-v1"
					},
					state: checkedState$1(this.#state, this.#commands),
					version: 1
				});
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("ramp snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$4) throw new RangeError("ramp snapshot exceeds its byte bound");
				let value;
				try {
					value = JSON.parse(serialized);
				} catch {
					throw new TypeError("ramp snapshot must be valid JSON");
				}
				const snapshot = exactRecord$4(value, SNAPSHOT_KEYS$4, "ramp snapshot");
				if (snapshot.version !== 1) throw new TypeError("ramp snapshot version is unsupported");
				const identity = exactRecord$4(snapshot.identity, IDENTITY_KEYS$4, "ramp snapshot.identity");
				if (identity.fixture !== "consecutive-target-ramp-question-v1") throw new TypeError("ramp snapshot fixture identity is invalid");
				const commands = checkedCommands$4(identity.commands);
				const state = checkedState$1(snapshot.state, commands, "ramp snapshot.state");
				const encounter = new ConsecutiveTargetRampEncounter({ commands });
				encounter.stepMany(state.tick);
				if (canonicalJson$4(encounter.#state) !== canonicalJson$4(state)) throw new TypeError("ramp snapshot state is not a causal execution");
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/special-combat-slow.js
function deepFreeze$3(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze$3(child);
		Object.freeze(value);
	}
	return value;
}
function clone$3(value) {
	return JSON.parse(JSON.stringify(value));
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
function denseArray$3(value, label, maximum) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function safeInteger$3(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
}
function checkedId$3(value, label, nullable = false) {
	if (nullable && value === null) return;
	safeInteger$3(value, label, 1);
}
function checkedCommands$3(value) {
	const commands = denseArray$3(value, "slow commands", MAX_COMMANDS$3).map((entry, index) => {
		const command = exactRecord$3(entry, COMMAND_KEYS$3, `slow command ${index}`);
		safeInteger$3(command.tick, `slow command ${index}.tick`, 0, 4095);
		if (!COMMAND_TYPES$3.has(command.type)) throw new TypeError(`slow command ${index}.type is invalid`);
		if (command.type === "slow") {
			checkedId$3(command.sourceId, `slow command ${index}.sourceId`);
			if (command.targetId !== null) throw new TypeError(`slow command ${index}.targetId must be null`);
			if (command.tick > 4036) throw new TypeError(`slow command ${index}.tick cannot fit duration`);
		} else if (command.type === "acquire-target") {
			checkedId$3(command.targetId, `slow command ${index}.targetId`);
			if (command.sourceId !== null) throw new TypeError(`slow command ${index}.sourceId must be null`);
		} else if (command.type === "target-died") {
			checkedId$3(command.targetId, `slow command ${index}.targetId`, true);
			if (command.sourceId !== null) throw new TypeError(`slow command ${index}.sourceId must be null`);
		} else if (command.sourceId !== null || command.targetId !== null) throw new TypeError(`slow command ${index} has inapplicable IDs`);
		return {
			sourceId: command.sourceId,
			targetId: command.targetId,
			tick: command.tick,
			type: command.type
		};
	});
	let prior = -1;
	for (const command of commands) {
		if (command.tick < prior) throw new TypeError("slow commands must have nondecreasing ticks");
		prior = command.tick;
	}
	return commands;
}
function checkedSlowProgress(value) {
	const progress = exactRecord$3(value, SLOW_PROGRESS_KEYS, "slow progress");
	for (const key of SLOW_PROGRESS_KEYS) safeInteger$3(progress[key], `slow progress.${key}`, 1, PROGRESS_TWENTIETHS);
	return {
		attackWorkTwentieths: progress.attackWorkTwentieths,
		movementTwentieths: progress.movementTwentieths
	};
}
function checkedSetup$3(value) {
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const profiled = Object.hasOwn(descriptors, "slowProgress");
	const setup = exactRecord$3(value, profiled ? PROFILE_SETUP_KEYS : SETUP_KEYS$3, "slow setup");
	if (setup.direction !== -1 && setup.direction !== 1) throw new TypeError("slow setup.direction must be -1 or 1");
	return {
		commands: checkedCommands$3(setup.commands),
		direction: setup.direction,
		profiled,
		slowProgress: profiled ? checkedSlowProgress(setup.slowProgress) : { ...DEFAULT_SLOW_PROGRESS }
	};
}
function initialState$3() {
	return {
		alive: true,
		attackPhase: "idle",
		attackSequence: 0,
		attackWork: null,
		commandIndex: 0,
		history: [],
		movementRemainder: 0,
		position: 0,
		slowSourceId: null,
		slowUntilTick: null,
		targetId: null,
		tick: 0
	};
}
function clearTarget$2(state) {
	state.attackPhase = "idle";
	state.attackWork = null;
	state.targetId = null;
}
function applyCommand$3(state, command, events) {
	if (command.type === "slow") {
		if (!state.alive) return;
		state.slowSourceId = command.sourceId;
		state.slowUntilTick = state.tick + DURATION_TICKS;
		events.push({
			sourceId: command.sourceId,
			tick: state.tick,
			type: "slow-applied",
			untilTick: state.slowUntilTick
		});
		return;
	}
	if (command.type === "acquire-target") {
		if (!state.alive || state.targetId === command.targetId) return;
		clearTarget$2(state);
		state.targetId = command.targetId;
		state.attackPhase = "windup";
		state.attackWork = WINDUP_WORK$1;
		events.push({
			targetId: command.targetId,
			tick: state.tick,
			type: "target-acquired"
		});
		return;
	}
	if (command.type === "lose-target") {
		if (state.targetId === null) return;
		const targetId = state.targetId;
		clearTarget$2(state);
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
			clearTarget$2(state);
			events.push({
				targetId,
				tick: state.tick,
				type: "target-died"
			});
		}
		return;
	}
	if (state.alive) {
		state.alive = false;
		state.slowSourceId = null;
		state.slowUntilTick = null;
		clearTarget$2(state);
		events.push({
			tick: state.tick,
			type: "died"
		});
	}
}
function uncheckedAdvance$2(state, commands, direction, slowProgress) {
	if (state.tick >= MAX_TICK$3) throw new RangeError("slow encounter has reached its tick bound");
	const tick = state.tick;
	const events = [];
	if (state.slowUntilTick !== null && tick >= state.slowUntilTick) {
		events.push({
			sourceId: state.slowSourceId,
			tick,
			type: "slow-expired"
		});
		state.slowSourceId = null;
		state.slowUntilTick = null;
	}
	while (commands[state.commandIndex]?.tick === tick) {
		const command = commands[state.commandIndex];
		state.commandIndex += 1;
		applyCommand$3(state, command, events);
	}
	if (state.alive && state.targetId !== null && state.attackWork === 0) {
		state.attackSequence += 1;
		events.push({
			sequence: state.attackSequence,
			targetId: state.targetId,
			tick,
			type: "attack"
		});
		state.attackPhase = "cadence";
		state.attackWork = CADENCE_WORK$1;
	}
	if (state.alive) {
		const movementProgress = state.slowUntilTick === null ? NORMAL_PROGRESS : BigInt(slowProgress.movementTwentieths);
		const attackProgress = state.slowUntilTick === null ? NORMAL_PROGRESS : BigInt(slowProgress.attackWorkTwentieths);
		const accumulated = BigInt(state.movementRemainder) + BigInt(CARD_DEFINITIONS$3[0].movementMillitilesPerSecond) * movementProgress;
		const magnitude = accumulated / MOVEMENT_DENOMINATOR$1;
		const remainder = accumulated % MOVEMENT_DENOMINATOR$1;
		const deltaBig = BigInt(direction) * magnitude;
		const next = BigInt(state.position) + deltaBig;
		if (next < -BigInt(MAX_POSITION$2) || next > BigInt(MAX_POSITION$2)) throw new RangeError("slow movement exceeds its position bound");
		const delta = Number(deltaBig);
		const from = state.position;
		state.position = Number(next);
		state.movementRemainder = Number(remainder);
		events.push({
			delta,
			from,
			remainder: state.movementRemainder,
			tick,
			to: state.position,
			type: "moved"
		});
		if (state.targetId !== null && state.attackWork > 0) state.attackWork = Number(BigInt(state.attackWork) > attackProgress ? BigInt(state.attackWork) - attackProgress : 0n);
	}
	if (state.history.length + events.length > MAX_EVENTS$3) throw new RangeError("slow replay exceeds its event bound");
	state.history.push(...clone$3(events));
	state.tick += 1;
	return events;
}
function checkedEvent$3(value, index) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`slow history event ${index} has an invalid shape`);
	const descriptor = Object.getOwnPropertyDescriptor(value, "type");
	if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`slow history event ${index}.type must be data`);
	const keys = EVENT_KEYS$3[descriptor.value];
	if (keys === void 0) throw new TypeError(`slow history event ${index}.type is invalid`);
	const event = exactRecord$3(value, keys, `slow history event ${index}`);
	safeInteger$3(event.tick, `slow history event ${index}.tick`, 0, 4095);
	for (const key of [
		"sequence",
		"sourceId",
		"targetId",
		"untilTick",
		"remainder"
	]) if (Object.hasOwn(event, key)) {
		const minimum = key === "remainder" ? 0 : 1;
		safeInteger$3(event[key], `slow history event ${index}.${key}`, minimum);
	}
	for (const key of [
		"delta",
		"from",
		"to"
	]) if (Object.hasOwn(event, key)) safeInteger$3(event[key] + MAX_POSITION$2, `slow history event ${index}.${key}`, 0, MAX_POSITION$2 * 2);
	return event;
}
function checkedStateShape$2(value, commands, label) {
	const state = exactRecord$3(value, STATE_KEYS$3, label);
	if (typeof state.alive !== "boolean") throw new TypeError(`${label}.alive must be boolean`);
	safeInteger$3(state.tick, `${label}.tick`, 0, MAX_TICK$3);
	safeInteger$3(state.commandIndex, `${label}.commandIndex`, 0, commands.length);
	safeInteger$3(state.attackSequence, `${label}.attackSequence`, 0, MAX_EVENTS$3);
	safeInteger$3(state.position + MAX_POSITION$2, `${label}.position`, 0, MAX_POSITION$2 * 2);
	safeInteger$3(state.movementRemainder, `${label}.movementRemainder`, 0, Number(MOVEMENT_DENOMINATOR$1 - 1n));
	checkedId$3(state.targetId, `${label}.targetId`, true);
	checkedId$3(state.slowSourceId, `${label}.slowSourceId`, true);
	if (![
		"idle",
		"windup",
		"cadence"
	].includes(state.attackPhase)) throw new TypeError(`${label}.attackPhase is invalid`);
	if (state.attackWork !== null) safeInteger$3(state.attackWork, `${label}.attackWork`, 0, CADENCE_WORK$1);
	if (state.slowUntilTick !== null) safeInteger$3(state.slowUntilTick, `${label}.slowUntilTick`, 1, MAX_TICK$3);
	const history = denseArray$3(state.history, `${label}.history`, MAX_EVENTS$3).map(checkedEvent$3);
	if (state.slowSourceId === null !== (state.slowUntilTick === null)) throw new TypeError(`${label} slow status is inconsistent`);
	if (state.slowUntilTick !== null && (state.slowUntilTick < state.tick || state.slowUntilTick > state.tick + DURATION_TICKS)) throw new TypeError(`${label} slow expiry is noncausal`);
	if (state.targetId === null !== (state.attackPhase === "idle" && state.attackWork === null)) throw new TypeError(`${label} target and attack state are inconsistent`);
	if (!state.alive && (state.targetId !== null || state.slowSourceId !== null || state.attackPhase !== "idle")) throw new TypeError(`${label} dead state retains combat status`);
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
		attackSequence: state.attackSequence,
		attackWork: state.attackWork,
		commandIndex: state.commandIndex,
		history,
		movementRemainder: state.movementRemainder,
		position: state.position,
		slowSourceId: state.slowSourceId,
		slowUntilTick: state.slowUntilTick,
		targetId: state.targetId,
		tick: state.tick
	};
}
function replayState$2(commands, direction, ticks, slowProgress) {
	const state = initialState$3();
	for (let index = 0; index < ticks; index += 1) uncheckedAdvance$2(state, commands, direction, slowProgress);
	return state;
}
function checkedCausalState$2(value, commands, direction, slowProgress, label = "slow state") {
	const checked = checkedStateShape$2(value, commands, label);
	const expected = replayState$2(commands, direction, checked.tick, slowProgress);
	if (canonicalJson$3(checked) !== canonicalJson$3(expected)) throw new TypeError(`${label} is forged or noncausal`);
	return checked;
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
function createSlowSpecialCatalog() {
	return createCardCatalog(CARD_DEFINITIONS$3);
}
function createSlowQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("slow question records do not accept overrides");
	return deepFreeze$3(Object.fromEntries(Object.entries(QUESTION_VALUES$3).map(([key, value]) => [key, questionRecord$3(key, value)])));
}
function createSlowFixture(commands = [], direction = 1, slowProgress) {
	const checked = checkedSetup$3(slowProgress === void 0 ? {
		commands,
		direction
	} : {
		commands,
		direction,
		slowProgress
	});
	return clone$3(checked.profiled ? {
		commands: checked.commands,
		direction: checked.direction,
		slowProgress: checked.slowProgress
	} : {
		commands: checked.commands,
		direction: checked.direction
	});
}
var CARD_DEFINITIONS$3, SOURCE$3, FIXTURE_ID$1, PROFILE_FIXTURE_ID, MAX_COMMANDS$3, MAX_EVENTS$3, MAX_POSITION$2, MAX_SNAPSHOT_BYTES$3, MAX_STEP_CHUNK$3, MAX_TICK$3, MOVEMENT_DENOMINATOR$1, NORMAL_PROGRESS, PROGRESS_TWENTIETHS, DEFAULT_SLOW_PROGRESS, WINDUP_WORK$1, CADENCE_WORK$1, DURATION_TICKS, COMMAND_KEYS$3, COMMAND_TYPES$3, SETUP_KEYS$3, PROFILE_SETUP_KEYS, SLOW_PROGRESS_KEYS, SNAPSHOT_KEYS$3, IDENTITY_KEYS$3, PROFILE_IDENTITY_KEYS, STATE_KEYS$3, EVENT_KEYS$3, QUESTION_VALUES$3, TimedMovementAttackSlowEncounter;
function init_special_combat_slow() {
	return (init_special_combat_slow = __esmMin((() => {
		init_schema();
		CARD_DEFINITIONS$3 = [{
			areaDamageRadiusMillitiles: null,
			components: [],
			cost: 3,
			count: 1,
			damage: 90,
			deployTimeTicks: 60,
			displayName: "Rime Adept",
			firstHitTicks: 72,
			hitSpeedTicks: 102,
			hitpoints: 688,
			id: "rime-adept",
			kind: "unit",
			movementMillitilesPerSecond: 1e3,
			rangeMillitiles: 5500,
			rarity: "mythic",
			sightRangeMillitiles: 5500,
			targetMode: "ground-and-air"
		}];
		SOURCE$3 = "unsourced-timed-movement-and-attack-slow-fixture";
		FIXTURE_ID$1 = "timed-movement-and-attack-slow-question-v1";
		PROFILE_FIXTURE_ID = "timed-movement-and-attack-slow-profile-question-v1";
		MAX_COMMANDS$3 = 64;
		MAX_EVENTS$3 = 8192;
		MAX_POSITION$2 = 1e6;
		MAX_SNAPSHOT_BYTES$3 = 1048576;
		MAX_STEP_CHUNK$3 = 4096;
		MAX_TICK$3 = 4096;
		MOVEMENT_DENOMINATOR$1 = 1200n;
		NORMAL_PROGRESS = 20n;
		PROGRESS_TWENTIETHS = 20;
		DEFAULT_SLOW_PROGRESS = Object.freeze({
			attackWorkTwentieths: 13,
			movementTwentieths: 13
		});
		WINDUP_WORK$1 = 1440;
		CADENCE_WORK$1 = 2040;
		DURATION_TICKS = 60;
		COMMAND_KEYS$3 = [
			"sourceId",
			"targetId",
			"tick",
			"type"
		];
		COMMAND_TYPES$3 = /* @__PURE__ */ new Set([
			"acquire-target",
			"die",
			"lose-target",
			"slow",
			"target-died"
		]);
		SETUP_KEYS$3 = ["commands", "direction"];
		PROFILE_SETUP_KEYS = [...SETUP_KEYS$3, "slowProgress"];
		SLOW_PROGRESS_KEYS = ["attackWorkTwentieths", "movementTwentieths"];
		SNAPSHOT_KEYS$3 = [
			"identity",
			"state",
			"version"
		];
		IDENTITY_KEYS$3 = [
			"commands",
			"direction",
			"fixture"
		];
		PROFILE_IDENTITY_KEYS = [...IDENTITY_KEYS$3, "slowProgress"];
		STATE_KEYS$3 = [
			"alive",
			"attackPhase",
			"attackSequence",
			"attackWork",
			"commandIndex",
			"history",
			"movementRemainder",
			"position",
			"slowSourceId",
			"slowUntilTick",
			"targetId",
			"tick"
		];
		EVENT_KEYS$3 = {
			attack: [
				"sequence",
				"targetId",
				"tick",
				"type"
			],
			died: ["tick", "type"],
			moved: [
				"delta",
				"from",
				"remainder",
				"tick",
				"to",
				"type"
			],
			"slow-applied": [
				"sourceId",
				"tick",
				"type",
				"untilTick"
			],
			"slow-expired": [
				"sourceId",
				"tick",
				"type"
			],
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
		QUESTION_VALUES$3 = Object.freeze({
			alreadyEarnedReadiness: "ready-at-boundary-start-fires-after-application",
			attackProgressRate: {
				denominator: 20,
				numerator: 13
			},
			boundaryOrdering: "expire-then-commands-then-loss-death-change-cancellation-then-ready-then-movement-then-attack-work-then-events-then-tick",
			cadenceWorkTwentieths: CADENCE_WORK$1,
			commonAreaDamageRadius: null,
			commonBaseDamage: 90,
			commonCount: 1,
			commonDeployTicks: 60,
			commonFirstHitTicks: 72,
			commonHitCadenceTicks: 102,
			commonHitpoints: 688,
			commonMovementMillitilesPerSecond: 1e3,
			commonRangeMillitiles: 5500,
			commonSightRangeMillitiles: 5500,
			commonTargetMode: "ground-and-air",
			deadlineRescaling: "none-progress-is-work-not-a-rescaled-deadline",
			deathPolicy: "unit-death-clears-target-attack-and-slow",
			delivery: "explicit-boundary-command-no-projectile-or-area-claim",
			deployment: "fixture-starts-deployed-deploy-delay-is-not-simulated",
			differentSourceReapply: "refresh-expiry-from-current-tick-and-replace-source",
			durationTicks: DURATION_TICKS,
			eligibility: "living-unit-explicit-command-positive-safe-source-id",
			expiryWindow: "application-tick-through-application-plus-59",
			fidelity: "test-only-question-fixture-not-a-general-slow-system",
			immunity: "none-in-this-fixture",
			movementProgressRate: {
				denominator: 20,
				numerator: 13
			},
			movementRemainder: "retained-across-application-refresh-and-expiry",
			nonStacking: "single-status-slot",
			rageComposition: "deferred-no-composition-claim",
			reciprocalAttackInterval: {
				denominator: 13,
				numerator: 20
			},
			refresh: "expiry-is-current-application-tick-plus-60",
			resetComposition: "deferred-no-reset-claim",
			sameSourceReapply: "refresh-expiry-from-current-tick-and-retain-remainders",
			snareComposition: "deferred-no-composition-claim",
			sourceDeath: "existing-slow-persists-source-liveness-is-not-tracked",
			stack: "double-application-on-one-boundary-equals-one-latest-source-slot",
			stunComposition: "deferred-no-composition-claim",
			targetChange: "fresh-windup-and-cancel-earned-readiness-before-ready",
			targetDeath: "cancel-attack-before-ready-slow-on-unit-persists",
			targetLoss: "cancel-attack-before-ready-slow-on-unit-persists",
			windupWorkTwentieths: WINDUP_WORK$1,
			workRemainder: "attack-work-is-exact-integer-twentieths-and-retained",
			workUnderSlow: "windup-and-cadence-consume-13-twentieths-per-boundary"
		});
		TimedMovementAttackSlowEncounter = class TimedMovementAttackSlowEncounter {
			#commands;
			#direction;
			#profiled;
			#slowProgress;
			#state;
			constructor(setup = createSlowFixture()) {
				const checked = checkedSetup$3(setup);
				this.#commands = checked.commands;
				this.#direction = checked.direction;
				this.#profiled = checked.profiled;
				this.#slowProgress = checked.slowProgress;
				this.#state = initialState$3();
			}
			get replay() {
				return clone$3(this.#state.history);
			}
			get state() {
				return clone$3(this.#state);
			}
			step() {
				const candidate = checkedCausalState$2(this.#state, this.#commands, this.#direction, this.#slowProgress);
				const events = uncheckedAdvance$2(candidate, this.#commands, this.#direction, this.#slowProgress);
				this.#state = candidate;
				return clone$3(events);
			}
			stepMany(count) {
				safeInteger$3(count, "slow step count", 0, MAX_STEP_CHUNK$3);
				if (count > MAX_TICK$3 - this.#state.tick) throw new RangeError("slow step count exceeds the encounter bound");
				const candidate = checkedCausalState$2(this.#state, this.#commands, this.#direction, this.#slowProgress);
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...uncheckedAdvance$2(candidate, this.#commands, this.#direction, this.#slowProgress));
				this.#state = candidate;
				return clone$3(events);
			}
			run() {
				return this.stepMany(MAX_TICK$3 - this.#state.tick);
			}
			serialize() {
				const identity = {
					commands: this.#commands,
					direction: this.#direction,
					fixture: this.#profiled ? PROFILE_FIXTURE_ID : FIXTURE_ID$1
				};
				if (this.#profiled) identity.slowProgress = this.#slowProgress;
				const serialized = canonicalJson$3({
					identity,
					state: checkedCausalState$2(this.#state, this.#commands, this.#direction, this.#slowProgress),
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$3) throw new RangeError("slow snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("slow snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$3) throw new RangeError("slow snapshot exceeds its byte bound");
				let value;
				try {
					value = JSON.parse(serialized);
				} catch {
					throw new TypeError("slow snapshot must be valid JSON");
				}
				if (serialized !== canonicalJson$3(value)) throw new TypeError("slow snapshot must be canonical duplicate-free JSON");
				const snapshot = exactRecord$3(value, SNAPSHOT_KEYS$3, "slow snapshot");
				if (snapshot.version !== 1) throw new TypeError("slow snapshot version is unsupported");
				const fixture = Object.getOwnPropertyDescriptor(snapshot.identity, "fixture")?.value;
				if (fixture !== FIXTURE_ID$1 && fixture !== PROFILE_FIXTURE_ID) throw new TypeError("slow snapshot fixture identity is invalid");
				const identity = exactRecord$3(snapshot.identity, fixture === FIXTURE_ID$1 ? IDENTITY_KEYS$3 : PROFILE_IDENTITY_KEYS, "slow snapshot.identity");
				const setupInput = {
					commands: identity.commands,
					direction: identity.direction
				};
				if (fixture === PROFILE_FIXTURE_ID) setupInput.slowProgress = identity.slowProgress;
				const setup = checkedSetup$3(setupInput);
				const state = checkedCausalState$2(snapshot.state, setup.commands, setup.direction, setup.slowProgress, "slow snapshot.state");
				const encounter = new TimedMovementAttackSlowEncounter(setupInput);
				encounter.#state = state;
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/special-combat-snare.js
function deepFreeze$2(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze$2(child);
		Object.freeze(value);
	}
	return value;
}
function clone$2(value) {
	return JSON.parse(JSON.stringify(value));
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
function denseArray$2(value, label, maximum) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function safeInteger$2(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
}
function checkedId$2(value, label, nullable = false) {
	if (nullable && value === null) return;
	safeInteger$2(value, label, 1);
}
function checkedCommands$2(value) {
	const commands = denseArray$2(value, "snare commands", MAX_COMMANDS$2).map((entry, index) => {
		const command = exactRecord$2(entry, COMMAND_KEYS$2, `snare command ${index}`);
		safeInteger$2(command.tick, `snare command ${index}.tick`, 0, 4095);
		if (!COMMAND_TYPES$2.has(command.type)) throw new TypeError(`snare command ${index}.type is invalid`);
		if (command.type === "snare") {
			checkedId$2(command.sourceId, `snare command ${index}.sourceId`);
			if (command.targetId !== null) throw new TypeError(`snare command ${index}.targetId must be null`);
			if (command.tick > MAX_TICK$2 - QUESTION_VALUES$2.durationTicks) throw new TypeError(`snare command ${index}.tick cannot fit its duration`);
		} else if (command.type === "acquire-target") {
			checkedId$2(command.targetId, `snare command ${index}.targetId`);
			if (command.sourceId !== null) throw new TypeError(`snare command ${index}.sourceId must be null`);
		} else if (command.type === "target-died") {
			checkedId$2(command.targetId, `snare command ${index}.targetId`, true);
			if (command.sourceId !== null) throw new TypeError(`snare command ${index}.sourceId must be null`);
		} else if (command.sourceId !== null || command.targetId !== null) throw new TypeError(`snare command ${index} has inapplicable IDs`);
		return {
			sourceId: command.sourceId,
			targetId: command.targetId,
			tick: command.tick,
			type: command.type
		};
	});
	let prior = -1;
	for (const command of commands) {
		if (command.tick <= prior) throw new TypeError("snare commands must have unique increasing ticks");
		prior = command.tick;
	}
	return commands;
}
function checkedDirection(value, label = "snare direction") {
	if (value !== -1 && value !== 1) throw new TypeError(`${label} must be -1 or 1`);
	return value;
}
function checkedSetup$2(value) {
	const setup = exactRecord$2(value, SETUP_KEYS$2, "snare setup");
	return {
		commands: checkedCommands$2(setup.commands),
		direction: checkedDirection(setup.direction)
	};
}
function checkedContact$1(value, label) {
	const contact = exactRecord$2(value, CONTACT_KEYS$1, label);
	safeInteger$2(contact.remaining, `${label}.remaining`, 1, QUESTION_VALUES$2.contactDelayTicks);
	safeInteger$2(contact.sequence, `${label}.sequence`, 1, MAX_EVENTS$2);
	checkedId$2(contact.targetId, `${label}.targetId`);
	return contact;
}
function checkedEvent$2(value, index) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`snare history event ${index} has an invalid shape`);
	const descriptor = Object.getOwnPropertyDescriptor(value, "type");
	if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`snare history event ${index}.type must be data`);
	const keys = EVENT_KEYS$2[descriptor.value];
	if (keys === void 0) throw new TypeError(`snare history event ${index}.type is invalid`);
	const event = exactRecord$2(value, keys, `snare history event ${index}`);
	safeInteger$2(event.tick, `snare history event ${index}.tick`, 0, 4095);
	for (const key of [
		"contactDelayTicks",
		"sequence",
		"snaredThroughTick",
		"sourceId",
		"targetId"
	]) if (Object.hasOwn(event, key)) {
		const minimum = [
			"sequence",
			"sourceId",
			"targetId"
		].includes(key) ? 1 : 0;
		safeInteger$2(event[key], `snare history event ${index}.${key}`, minimum);
	}
	for (const key of ["from", "to"]) if (Object.hasOwn(event, key)) safeInteger$2(event[key], `snare history event ${index}.${key}`, -1e6, MAX_POSITION$1);
	return event;
}
function initialState$2() {
	return {
		alive: true,
		attackPhase: "idle",
		attackRemaining: null,
		attackSequence: 0,
		commandIndex: 0,
		health: STARTING_HEALTH,
		history: [],
		movementRemainder: 0,
		pendingContacts: [],
		position: 0,
		snaredThroughTick: null,
		snareSourceId: null,
		targetAlive: false,
		targetId: null,
		tick: 0
	};
}
function clearTarget$1(state) {
	state.targetAlive = false;
	state.targetId = null;
	state.attackPhase = "idle";
	state.attackRemaining = null;
	state.pendingContacts = [];
}
function applyCommand$2(state, command, events) {
	if (command.type === "snare") {
		if (!state.alive) return;
		state.snaredThroughTick = state.tick + QUESTION_VALUES$2.durationTicks - 1;
		state.snareSourceId = command.sourceId;
		events.push({
			snaredThroughTick: state.snaredThroughTick,
			sourceId: command.sourceId,
			tick: state.tick,
			type: "snare-applied"
		});
		return;
	}
	if (command.type === "acquire-target") {
		if (!state.alive || state.targetId === command.targetId) return;
		state.targetAlive = true;
		state.targetId = command.targetId;
		state.attackPhase = "windup";
		state.attackRemaining = QUESTION_VALUES$2.commonFirstHitTicks;
		state.pendingContacts = [];
		events.push({
			targetId: command.targetId,
			tick: state.tick,
			type: "target-acquired"
		});
		return;
	}
	if (command.type === "lose-target") {
		if (state.targetId === null) return;
		const targetId = state.targetId;
		clearTarget$1(state);
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
			clearTarget$1(state);
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
			state.pendingContacts = [];
			if (state.targetAlive) {
				state.attackPhase = "windup";
				state.attackRemaining = QUESTION_VALUES$2.commonFirstHitTicks;
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
		state.snaredThroughTick = null;
		state.snareSourceId = null;
		clearTarget$1(state);
		events.push({
			tick: state.tick,
			type: "died"
		});
	}
}
function uncheckedAdvance$1(state, commands, direction) {
	const tick = state.tick;
	if (tick >= MAX_TICK$2) return [];
	const events = [];
	const command = commands[state.commandIndex];
	if (command?.tick === tick) {
		state.commandIndex += 1;
		applyCommand$2(state, command, events);
	}
	if (state.alive) {
		for (const pending of state.pendingContacts) pending.remaining -= 1;
		const contacting = state.pendingContacts.filter(({ remaining }) => remaining === 0);
		state.pendingContacts = state.pendingContacts.filter(({ remaining }) => remaining > 0);
		for (const pending of contacting) if (state.targetAlive && state.targetId === pending.targetId) events.push({
			sequence: pending.sequence,
			targetId: pending.targetId,
			tick,
			type: "attack-contact"
		});
		if (state.targetAlive) {
			state.attackRemaining -= 1;
			if (state.attackRemaining === 0) {
				state.attackSequence += 1;
				state.pendingContacts.push({
					remaining: QUESTION_VALUES$2.contactDelayTicks,
					sequence: state.attackSequence,
					targetId: state.targetId
				});
				events.push({
					contactDelayTicks: QUESTION_VALUES$2.contactDelayTicks,
					sequence: state.attackSequence,
					targetId: state.targetId,
					tick,
					type: "attack-launched"
				});
				state.attackPhase = "cadence";
				state.attackRemaining = QUESTION_VALUES$2.commonHitSpeedTicks;
			}
		}
		const snared = state.snaredThroughTick !== null && tick <= state.snaredThroughTick;
		if (!snared) {
			const accumulated = state.movementRemainder + QUESTION_VALUES$2.commonMovementMillitilesPerSecond;
			const magnitude = Math.floor(accumulated / QUESTION_VALUES$2.ticksPerSecond);
			state.movementRemainder = accumulated % QUESTION_VALUES$2.ticksPerSecond;
			const next = state.position + direction * magnitude;
			if (!Number.isSafeInteger(next) || Math.abs(next) > MAX_POSITION$1) throw new RangeError("snare movement exceeds its position bound");
			if (next !== state.position) events.push({
				from: state.position,
				tick,
				to: next,
				type: "moved"
			});
			state.position = next;
		}
		if (snared && tick === state.snaredThroughTick) {
			events.push({
				sourceId: state.snareSourceId,
				tick,
				type: "snare-expired"
			});
			state.snaredThroughTick = null;
			state.snareSourceId = null;
		}
	}
	if (state.history.length + events.length > MAX_EVENTS$2) throw new RangeError("snare replay exceeds its event bound");
	state.history.push(...clone$2(events));
	state.tick += 1;
	return events;
}
function checkedStateShape$1(value, commands, label) {
	const state = exactRecord$2(value, STATE_KEYS$2, label);
	if (typeof state.alive !== "boolean" || typeof state.targetAlive !== "boolean") throw new TypeError(`${label} alive flags must be booleans`);
	safeInteger$2(state.tick, `${label}.tick`, 0, MAX_TICK$2);
	safeInteger$2(state.commandIndex, `${label}.commandIndex`, 0, commands.length);
	safeInteger$2(state.attackSequence, `${label}.attackSequence`, 0, MAX_EVENTS$2);
	safeInteger$2(state.health, `${label}.health`, 0, STARTING_HEALTH);
	safeInteger$2(state.position, `${label}.position`, -1e6, MAX_POSITION$1);
	safeInteger$2(state.movementRemainder, `${label}.movementRemainder`, 0, 59);
	checkedId$2(state.targetId, `${label}.targetId`, true);
	checkedId$2(state.snareSourceId, `${label}.snareSourceId`, true);
	if (state.snaredThroughTick !== null) safeInteger$2(state.snaredThroughTick, `${label}.snaredThroughTick`, 0, 4095);
	if (![
		"idle",
		"windup",
		"cadence"
	].includes(state.attackPhase)) throw new TypeError(`${label}.attackPhase is invalid`);
	if (state.attackRemaining !== null) safeInteger$2(state.attackRemaining, `${label}.attackRemaining`, 1, QUESTION_VALUES$2.commonHitSpeedTicks);
	const pendingContacts = denseArray$2(state.pendingContacts, `${label}.pendingContacts`, MAX_COMMANDS$2).map((contact, index) => checkedContact$1(contact, `${label}.pendingContacts[${index}]`));
	const history = denseArray$2(state.history, `${label}.history`, MAX_EVENTS$2).map(checkedEvent$2);
	if (state.alive !== state.health > 0) throw new TypeError(`${label} health and life state disagree`);
	if (state.snaredThroughTick === null !== (state.snareSourceId === null)) throw new TypeError(`${label} snare state is inconsistent`);
	if (state.targetAlive !== (state.targetId !== null)) throw new TypeError(`${label} target state is inconsistent`);
	if (!state.targetAlive && (state.attackPhase !== "idle" || state.attackRemaining !== null || pendingContacts.length !== 0)) throw new TypeError(`${label} inactive target retains attack state`);
	if (state.targetAlive && (state.attackPhase === "idle" || state.attackRemaining === null || pendingContacts.some(({ targetId }) => targetId !== state.targetId))) throw new TypeError(`${label} active target attack state is inconsistent`);
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
		health: state.health,
		history,
		movementRemainder: state.movementRemainder,
		pendingContacts,
		position: state.position,
		snaredThroughTick: state.snaredThroughTick,
		snareSourceId: state.snareSourceId,
		targetAlive: state.targetAlive,
		targetId: state.targetId,
		tick: state.tick
	};
}
function replayState$1(commands, direction, ticks) {
	const state = initialState$2();
	for (let index = 0; index < ticks; index += 1) uncheckedAdvance$1(state, commands, direction);
	return state;
}
function checkedCausalState$1(value, commands, direction, label = "snare state") {
	const checked = checkedStateShape$1(value, commands, label);
	const expected = replayState$1(commands, direction, checked.tick);
	if (canonicalJson$2(checked) !== canonicalJson$2(expected)) throw new TypeError(`${label} is forged or noncausal`);
	return checked;
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
function createSnareSpecialCatalog() {
	return createCardCatalog(CARD_DEFINITIONS$2);
}
function createSnareQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("snare question records do not accept overrides");
	return deepFreeze$2(Object.fromEntries(Object.entries(QUESTION_VALUES$2).map(([key, value]) => [key, questionRecord$2(key, value)])));
}
function createSnareFixture(commands = [], direction = 1) {
	return clone$2(checkedSetup$2({
		commands,
		direction
	}));
}
var CARD_DEFINITIONS$2, SOURCE$2, MAX_COMMANDS$2, MAX_EVENTS$2, MAX_POSITION$1, MAX_SNAPSHOT_BYTES$2, MAX_STEP_CHUNK$2, MAX_TICK$2, STARTING_HEALTH, COMMAND_KEYS$2, COMMAND_TYPES$2, SETUP_KEYS$2, SNAPSHOT_KEYS$2, IDENTITY_KEYS$2, STATE_KEYS$2, CONTACT_KEYS$1, EVENT_KEYS$2, QUESTION_VALUES$2, TimedMovementOnlySnareEncounter;
function init_special_combat_snare() {
	return (init_special_combat_snare = __esmMin((() => {
		init_schema();
		CARD_DEFINITIONS$2 = [{
			areaDamageRadiusMillitiles: null,
			components: [],
			cost: 5,
			count: 1,
			damage: 266,
			deployTimeTicks: 60,
			displayName: "Tether Rider",
			firstHitTicks: 72,
			hitSpeedTicks: 108,
			hitpoints: 1767,
			id: "tether-rider",
			kind: "unit",
			movementMillitilesPerSecond: 1e3,
			rangeMillitiles: 800,
			rarity: "mythic",
			sightRangeMillitiles: 7500,
			targetMode: "structures"
		}];
		SOURCE$2 = "unsourced-timed-movement-only-snare-fixture";
		MAX_COMMANDS$2 = 64;
		MAX_EVENTS$2 = 8192;
		MAX_POSITION$1 = 1e6;
		MAX_SNAPSHOT_BYTES$2 = 262144;
		MAX_STEP_CHUNK$2 = 4096;
		MAX_TICK$2 = 4096;
		STARTING_HEALTH = 1767;
		COMMAND_KEYS$2 = [
			"sourceId",
			"targetId",
			"tick",
			"type"
		];
		COMMAND_TYPES$2 = /* @__PURE__ */ new Set([
			"acquire-target",
			"die",
			"interrupt",
			"lose-target",
			"snare",
			"target-died"
		]);
		SETUP_KEYS$2 = ["commands", "direction"];
		SNAPSHOT_KEYS$2 = [
			"identity",
			"state",
			"version"
		];
		IDENTITY_KEYS$2 = [
			"commands",
			"direction",
			"fixture"
		];
		STATE_KEYS$2 = [
			"alive",
			"attackPhase",
			"attackRemaining",
			"attackSequence",
			"commandIndex",
			"health",
			"history",
			"movementRemainder",
			"pendingContacts",
			"position",
			"snaredThroughTick",
			"snareSourceId",
			"targetAlive",
			"targetId",
			"tick"
		];
		CONTACT_KEYS$1 = [
			"remaining",
			"sequence",
			"targetId"
		];
		EVENT_KEYS$2 = {
			"attack-contact": [
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
			"snare-applied": [
				"snaredThroughTick",
				"sourceId",
				"tick",
				"type"
			],
			"snare-expired": [
				"sourceId",
				"tick",
				"type"
			],
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
		QUESTION_VALUES$2 = {
			applyBoundary: "command-first-immediate-at-integer-tick-boundary",
			attackAcquisitionBehavior: "unaffected",
			attackCadenceBehavior: "unaffected-original-integer-countdown",
			attackContactBehavior: "unaffected-original-integer-countdown",
			attackWindupBehavior: "unaffected-original-integer-countdown",
			cleansePolicy: "deferred-no-cleanse-claim",
			commonAreaDamageRadiusMillitiles: null,
			commonCount: 1,
			commonDamage: 266,
			commonDeployTimeTicks: 60,
			commonFirstHitTicks: 72,
			commonHitSpeedTicks: 108,
			commonHitpoints: 1767,
			commonMovementMillitilesPerSecond: 1e3,
			commonRangeMillitiles: 800,
			commonSightRangeMillitiles: 7500,
			commonTargetMode: "structures",
			contactDelayTicks: 2,
			deathPolicy: "death-clears-snare-target-and-attack-state",
			delivery: "explicit-command-no-projectile-delivery-claim",
			durationTicks: 90,
			eligibility: "living-explicit-target-fixture-only",
			expiry: "inclusive-through-application-plus-duration-minus-one",
			expiryBoundaryOrder: "commands-then-attacks-then-snare-gated-movement-then-expiry-event",
			fullFidelity: "deferred",
			immunityPolicy: "deferred-no-immunity-claim",
			interruptionPolicy: "clear-contacts-and-restart-windup-retain-snare-and-target",
			movementRateWhileSnared: 0,
			movementRemainder: "preserve-exactly-with-no-accumulation-while-snared",
			rageComposition: "deferred-no-composition-claim",
			reapplyDifferentSource: "refresh-inclusive-expiry-and-replace-source",
			reapplySameSource: "refresh-inclusive-expiry",
			resetComposition: "deferred-no-reset-claim",
			sameBoundaryPriority: "stable-command-first-before-attack-and-movement",
			slowComposition: "deferred-no-composition-claim",
			source: "positive-safe-integer-command-source-id",
			sourceCadence: "explicit-command-only-no-cadence-claim",
			sourceReplacement: "most-recent-successful-application",
			stack: "single-status-nonstacking",
			stunComposition: "deferred-no-composition-claim",
			targetClasses: "deferred-no-class-eligibility-claim",
			targetRetention: "retain-current-stable-target",
			ticksPerSecond: 60
		};
		TimedMovementOnlySnareEncounter = class TimedMovementOnlySnareEncounter {
			#commands;
			#direction;
			#state;
			constructor(setup = createSnareFixture()) {
				const checked = checkedSetup$2(setup);
				this.#commands = checked.commands;
				this.#direction = checked.direction;
				this.#state = initialState$2();
			}
			get replay() {
				return clone$2(this.#state.history);
			}
			get state() {
				return clone$2(this.#state);
			}
			step() {
				return this.stepMany(1);
			}
			stepMany(count) {
				safeInteger$2(count, "snare step count", 0, MAX_STEP_CHUNK$2);
				if (count > MAX_TICK$2 - this.#state.tick) throw new RangeError("snare step count exceeds the encounter bound");
				const candidate = checkedCausalState$1(this.#state, this.#commands, this.#direction);
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...uncheckedAdvance$1(candidate, this.#commands, this.#direction));
				this.#state = candidate;
				return clone$2(events);
			}
			run() {
				return this.stepMany(MAX_TICK$2 - this.#state.tick);
			}
			serialize() {
				const serialized = canonicalJson$2({
					identity: {
						commands: this.#commands,
						direction: this.#direction,
						fixture: "timed-movement-only-snare-question-v1"
					},
					state: checkedCausalState$1(this.#state, this.#commands, this.#direction),
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$2) throw new RangeError("snare snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("snare snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$2) throw new RangeError("snare snapshot exceeds its byte bound");
				let value;
				try {
					value = JSON.parse(serialized);
				} catch {
					throw new TypeError("snare snapshot must be valid JSON");
				}
				if (serialized !== canonicalJson$2(value)) throw new TypeError("snare snapshot must be canonical duplicate-free JSON");
				const snapshot = exactRecord$2(value, SNAPSHOT_KEYS$2, "snare snapshot");
				if (snapshot.version !== 1) throw new TypeError("snare snapshot version is unsupported");
				const identity = exactRecord$2(snapshot.identity, IDENTITY_KEYS$2, "snare snapshot.identity");
				if (identity.fixture !== "timed-movement-only-snare-question-v1") throw new TypeError("snare snapshot fixture identity is invalid");
				const commands = checkedCommands$2(identity.commands);
				const direction = checkedDirection(identity.direction, "snare snapshot.identity.direction");
				const state = checkedCausalState$1(snapshot.state, commands, direction, "snare snapshot.state");
				const encounter = new TimedMovementOnlySnareEncounter({
					commands,
					direction
				});
				encounter.#state = state;
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/special-combat-reset.js
function deepFreeze$1(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze$1(child);
		Object.freeze(value);
	}
	return value;
}
function clone$1(value) {
	return JSON.parse(JSON.stringify(value));
}
function canonicalJson$1(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$1).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$1(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
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
function exactRecord$1(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
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
function safeInteger$1(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
}
function checkedId$1(value, label, nullable = false) {
	if (nullable && value === null) return;
	safeInteger$1(value, label, 1);
}
function checkedCommands$1(value) {
	const commands = denseArray$1(value, "reset commands", MAX_COMMANDS$1).map((entry, index) => {
		const command = exactRecord$1(entry, COMMAND_KEYS$1, `reset command ${index}`);
		safeInteger$1(command.tick, `reset command ${index}.tick`, 0, 511);
		if (!COMMAND_TYPES$1.has(command.type)) throw new TypeError(`reset command ${index}.type is invalid`);
		if (command.type === "acquire-target") {
			checkedId$1(command.targetId, `reset command ${index}.targetId`);
			if (command.sourceId !== null) throw new TypeError(`reset command ${index}.sourceId is inapplicable`);
		} else if (RESET_TYPES.has(command.type)) {
			checkedId$1(command.sourceId, `reset command ${index}.sourceId`);
			checkedId$1(command.targetId, `reset command ${index}.targetId`);
		} else if (command.type === "target-died") {
			checkedId$1(command.targetId, `reset command ${index}.targetId`, true);
			if (command.sourceId !== null) throw new TypeError(`reset command ${index}.sourceId is inapplicable`);
		} else if (command.sourceId !== null || command.targetId !== null) throw new TypeError(`reset command ${index} has inapplicable IDs`);
		return {
			sourceId: command.sourceId,
			targetId: command.targetId,
			tick: command.tick,
			type: command.type
		};
	});
	let priorTick = -1;
	for (const command of commands) {
		if (command.tick <= priorTick) throw new TypeError("reset commands must have unique increasing ticks");
		priorTick = command.tick;
	}
	return commands;
}
function checkedSetup$1(value) {
	return { commands: checkedCommands$1(exactRecord$1(value, SETUP_KEYS$1, "reset setup").commands) };
}
function stageForHits(hits) {
	let stageIndex = 0;
	for (let index = 1; index < QUESTION_VALUES$1.rampStageThresholds.length; index += 1) if (hits >= QUESTION_VALUES$1.rampStageThresholds[index]) stageIndex = index;
	return stageIndex;
}
function checkedContact(value, label) {
	if (value === null) return null;
	const contact = exactRecord$1(value, CONTACT_KEYS, label);
	safeInteger$1(contact.amount, `${label}.amount`, 1);
	safeInteger$1(contact.contactTick, `${label}.contactTick`, 0, MAX_TICK$1);
	safeInteger$1(contact.sequence, `${label}.sequence`, 1, MAX_EVENTS$1);
	safeInteger$1(contact.stageIndex, `${label}.stageIndex`, 0, QUESTION_VALUES$1.rampDamageStages.length - 1);
	checkedId$1(contact.targetId, `${label}.targetId`);
	if (contact.amount !== QUESTION_VALUES$1.rampDamageStages[contact.stageIndex]) throw new TypeError(`${label}.amount does not match its stage`);
	return { ...contact };
}
function checkedEvent$1(value, index) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`reset history event ${index} has an invalid shape`);
	const descriptor = Object.getOwnPropertyDescriptor(value, "type");
	if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`reset history event ${index}.type must be data`);
	const keys = EVENT_KEYS$1[descriptor.value];
	if (keys === void 0) throw new TypeError(`reset history event ${index}.type is invalid`);
	const event = exactRecord$1(value, keys, `reset history event ${index}`);
	safeInteger$1(event.tick, `reset history event ${index}.tick`, 0, 1023);
	if (Object.hasOwn(event, "sourceId")) checkedId$1(event.sourceId, `reset history event ${index}.sourceId`);
	if (Object.hasOwn(event, "targetId")) checkedId$1(event.targetId, `reset history event ${index}.targetId`, true);
	for (const key of [
		"amount",
		"consecutiveHits",
		"contactTick",
		"healthAfter",
		"healthBefore",
		"sequence",
		"stageIndex"
	]) if (Object.hasOwn(event, key)) safeInteger$1(event[key], `reset history event ${index}.${key}`);
	if (Object.hasOwn(event, "stageIndex") && event.stageIndex >= QUESTION_VALUES$1.rampDamageStages.length) throw new TypeError(`reset history event ${index}.stageIndex is invalid`);
	if (Object.hasOwn(event, "contactTick") && event.contactTick > MAX_TICK$1) throw new TypeError(`reset history event ${index}.contactTick is invalid`);
	if (Object.hasOwn(event, "applied") && typeof event.applied !== "boolean") throw new TypeError(`reset history event ${index}.applied must be boolean`);
	if (Object.hasOwn(event, "reason") && !RESET_REASONS.has(event.reason)) throw new TypeError(`reset history event ${index}.reason is invalid`);
	return event;
}
function initialState$1() {
	return {
		alive: true,
		attackSequence: 0,
		commandIndex: 0,
		consecutiveHits: 0,
		history: [],
		nextLaunchTick: null,
		pendingContact: null,
		phase: "idle",
		stageIndex: 0,
		targetAlive: false,
		targetHealth: null,
		targetId: null,
		tick: 0
	};
}
function checkedState(value, commands, label = "reset state") {
	const state = exactRecord$1(value, STATE_KEYS$1, label);
	if (typeof state.alive !== "boolean" || typeof state.targetAlive !== "boolean") throw new TypeError(`${label} liveness fields must be booleans`);
	safeInteger$1(state.tick, `${label}.tick`, 0, MAX_TICK$1);
	safeInteger$1(state.commandIndex, `${label}.commandIndex`, 0, commands.length);
	safeInteger$1(state.attackSequence, `${label}.attackSequence`, 0, MAX_EVENTS$1);
	safeInteger$1(state.consecutiveHits, `${label}.consecutiveHits`, 0, MAX_TICK$1);
	safeInteger$1(state.stageIndex, `${label}.stageIndex`, 0, QUESTION_VALUES$1.rampDamageStages.length - 1);
	if (!PHASES.has(state.phase)) throw new TypeError(`${label}.phase is invalid`);
	checkedId$1(state.targetId, `${label}.targetId`, true);
	if (state.targetHealth !== null) safeInteger$1(state.targetHealth, `${label}.targetHealth`, 1, TARGET_HEALTH);
	if (state.nextLaunchTick !== null) safeInteger$1(state.nextLaunchTick, `${label}.nextLaunchTick`, state.tick, MAX_TICK$1);
	const pendingContact = checkedContact(state.pendingContact, `${label}.pendingContact`);
	const history = denseArray$1(state.history, `${label}.history`, MAX_EVENTS$1).map(checkedEvent$1);
	let priorEventTick = -1;
	for (const event of history) {
		if (event.tick < priorEventTick || event.tick >= state.tick) throw new TypeError(`${label}.history is noncausal`);
		priorEventTick = event.tick;
	}
	const expectedCommandIndex = commands.filter((command) => command.tick < state.tick).length;
	if (state.commandIndex !== expectedCommandIndex) throw new TypeError(`${label}.commandIndex is noncausal`);
	if (state.consecutiveHits > state.attackSequence) throw new TypeError(`${label} has more hits than launches`);
	if (state.stageIndex !== stageForHits(state.consecutiveHits)) throw new TypeError(`${label}.stageIndex does not match hit counter`);
	const hasTarget = state.targetId !== null;
	if (hasTarget !== state.targetAlive || hasTarget !== (state.targetHealth !== null)) throw new TypeError(`${label} target fields are inconsistent`);
	if (!state.alive && (state.phase !== "dead" || hasTarget || state.nextLaunchTick !== null || pendingContact !== null || state.consecutiveHits !== 0 || state.stageIndex !== 0)) throw new TypeError(`${label} dead state is inconsistent`);
	if (state.alive && !hasTarget && (state.phase !== "idle" || state.nextLaunchTick !== null || pendingContact !== null || state.consecutiveHits !== 0 || state.stageIndex !== 0)) throw new TypeError(`${label} idle state is inconsistent`);
	if (state.phase === "contact" && (pendingContact === null || state.nextLaunchTick === null)) throw new TypeError(`${label} contact phase is inconsistent`);
	if ((state.phase === "windup" || state.phase === "cadence") && (pendingContact !== null || state.nextLaunchTick === null)) throw new TypeError(`${label} attack countdown phase is inconsistent`);
	if (pendingContact !== null && (pendingContact.targetId !== state.targetId || pendingContact.sequence > state.attackSequence || pendingContact.contactTick < state.tick || pendingContact.contactTick > state.tick + QUESTION_VALUES$1.contactDelayTicks)) throw new TypeError(`${label}.pendingContact is inconsistent`);
	return {
		alive: state.alive,
		attackSequence: state.attackSequence,
		commandIndex: state.commandIndex,
		consecutiveHits: state.consecutiveHits,
		history,
		nextLaunchTick: state.nextLaunchTick,
		pendingContact,
		phase: state.phase,
		stageIndex: state.stageIndex,
		targetAlive: state.targetAlive,
		targetHealth: state.targetHealth,
		targetId: state.targetId,
		tick: state.tick
	};
}
function clearCombatProgress(state) {
	state.consecutiveHits = 0;
	state.stageIndex = 0;
	state.pendingContact = null;
}
function restartRetainedTarget(state) {
	clearCombatProgress(state);
	if (state.alive && state.targetId !== null) {
		state.nextLaunchTick = state.tick + QUESTION_VALUES$1.firstHitWindupTicks;
		state.phase = "windup";
	} else {
		state.nextLaunchTick = null;
		state.phase = state.alive ? "idle" : "dead";
	}
}
function resetReason(state, command) {
	if (!state.alive) return "dead";
	if (state.targetId === null) return "idle";
	if (command.targetId !== state.targetId) return "target-mismatch";
	if (command.type === "reset-ineligible-source") return "source-ineligible";
	if (command.type === "reset-ineligible-target") return "target-ineligible";
	if (command.type === "reset-immune-target") return "target-immune";
	return "applied";
}
function applyCommand$1(state, command, events) {
	if (command.type === "acquire-target") {
		if (!state.alive) return false;
		if (state.targetId !== command.targetId) {
			clearCombatProgress(state);
			state.targetId = command.targetId;
			state.targetAlive = true;
			state.targetHealth = TARGET_HEALTH;
			state.nextLaunchTick = state.tick + QUESTION_VALUES$1.firstHitWindupTicks;
			state.phase = "windup";
			events.push({
				targetId: command.targetId,
				tick: state.tick,
				type: "target-acquired"
			});
		}
		return false;
	}
	if (RESET_TYPES.has(command.type)) {
		const reason = resetReason(state, command);
		const applied = reason === "applied";
		if (applied) restartRetainedTarget(state);
		events.push({
			applied,
			reason,
			sourceId: command.sourceId,
			targetId: command.targetId,
			tick: state.tick,
			type: "combat-reset"
		});
		return applied;
	}
	if (command.type === "target-died") {
		if (state.targetId !== null && (command.targetId === null || command.targetId === state.targetId)) {
			const targetId = state.targetId;
			clearCombatProgress(state);
			state.targetId = null;
			state.targetAlive = false;
			state.targetHealth = null;
			state.nextLaunchTick = null;
			state.phase = state.alive ? "idle" : "dead";
			events.push({
				targetId,
				tick: state.tick,
				type: "target-died"
			});
			return true;
		}
		return false;
	}
	if (command.type === "interrupt") {
		if (state.alive) restartRetainedTarget(state);
		events.push({
			targetId: state.targetId,
			tick: state.tick,
			type: "interrupted"
		});
		return true;
	}
	state.alive = false;
	clearCombatProgress(state);
	state.targetId = null;
	state.targetAlive = false;
	state.targetHealth = null;
	state.nextLaunchTick = null;
	state.phase = "dead";
	events.push({
		tick: state.tick,
		type: "died"
	});
	return true;
}
function advanceOne(state, commands) {
	if (state.tick >= MAX_TICK$1) return [];
	const events = [];
	let blockAttack = false;
	const command = commands[state.commandIndex];
	if (command?.tick === state.tick) {
		state.commandIndex += 1;
		blockAttack = applyCommand$1(state, command, events);
	}
	if (!blockAttack && state.pendingContact?.contactTick === state.tick) {
		const contact = state.pendingContact;
		state.pendingContact = null;
		if (state.alive && state.targetAlive && state.targetId === contact.targetId) {
			const healthBefore = state.targetHealth;
			state.targetHealth = Math.max(1, healthBefore - contact.amount);
			events.push({
				amount: contact.amount,
				healthAfter: state.targetHealth,
				healthBefore,
				sequence: contact.sequence,
				stageIndex: contact.stageIndex,
				targetId: contact.targetId,
				tick: state.tick,
				type: "attack-contact"
			});
			state.consecutiveHits += 1;
			const stageIndex = stageForHits(state.consecutiveHits);
			if (stageIndex !== state.stageIndex) {
				state.stageIndex = stageIndex;
				events.push({
					consecutiveHits: state.consecutiveHits,
					stageIndex,
					targetId: state.targetId,
					tick: state.tick,
					type: "stage-changed"
				});
			}
			state.phase = "cadence";
		}
	}
	if (!blockAttack && state.alive && state.targetAlive && state.pendingContact === null && state.nextLaunchTick === state.tick && state.tick < MAX_TICK$1 - QUESTION_VALUES$1.contactDelayTicks) {
		state.attackSequence += 1;
		const amount = QUESTION_VALUES$1.rampDamageStages[state.stageIndex];
		const contactTick = state.tick + QUESTION_VALUES$1.contactDelayTicks;
		state.pendingContact = {
			amount,
			contactTick,
			sequence: state.attackSequence,
			stageIndex: state.stageIndex,
			targetId: state.targetId
		};
		state.nextLaunchTick = Math.min(MAX_TICK$1, state.tick + QUESTION_VALUES$1.attackCadenceTicks);
		state.phase = "contact";
		events.push({
			amount,
			contactTick,
			sequence: state.attackSequence,
			stageIndex: state.stageIndex,
			targetId: state.targetId,
			tick: state.tick,
			type: "attack-launched"
		});
	} else if (!blockAttack && state.alive && state.targetAlive && state.pendingContact === null && state.nextLaunchTick === state.tick) {
		state.nextLaunchTick = MAX_TICK$1;
		state.phase = "cadence";
	}
	if (state.history.length + events.length > MAX_EVENTS$1) throw new RangeError("reset replay exceeds its event bound");
	state.history.push(...clone$1(events));
	state.tick += 1;
	return events;
}
function createResetSpecialCatalog() {
	return createCardCatalog(CARD_DEFINITIONS$1);
}
function createResetQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("reset question records do not accept overrides");
	const records = {};
	for (const [key, value] of Object.entries(QUESTION_VALUES$1)) records[key] = questionRecord$1(key, value);
	return deepFreeze$1(records);
}
function createResetFixture(commands = []) {
	return clone$1(checkedSetup$1({ commands }));
}
var CARD_DEFINITIONS$1, SOURCE$1, MAX_COMMANDS$1, MAX_EVENTS$1, MAX_SNAPSHOT_BYTES$1, MAX_STEP_CHUNK$1, MAX_TICK$1, TARGET_HEALTH, COMMAND_KEYS$1, COMMAND_TYPES$1, RESET_TYPES, SETUP_KEYS$1, SNAPSHOT_KEYS$1, IDENTITY_KEYS$1, STATE_KEYS$1, CONTACT_KEYS, EVENT_KEYS$1, PHASES, RESET_REASONS, QUESTION_VALUES$1, InstantaneousCombatResetEncounter;
function init_special_combat_reset() {
	return (init_special_combat_reset = __esmMin((() => {
		init_schema();
		CARD_DEFINITIONS$1 = [{
			areaDamageRadiusMillitiles: 2500,
			components: [],
			cost: 2,
			count: 1,
			damage: 192,
			deployTimeTicks: null,
			displayName: "Static Burst",
			firstHitTicks: null,
			hitSpeedTicks: null,
			hitpoints: null,
			id: "static-burst",
			kind: "effect",
			movementMillitilesPerSecond: null,
			rangeMillitiles: null,
			rarity: "standard",
			sightRangeMillitiles: null,
			targetMode: "ground-and-air"
		}];
		SOURCE$1 = "unsourced-instantaneous-combat-reset-composition";
		MAX_COMMANDS$1 = 64;
		MAX_EVENTS$1 = 4096;
		MAX_SNAPSHOT_BYTES$1 = 262144;
		MAX_STEP_CHUNK$1 = 1024;
		MAX_TICK$1 = 1024;
		TARGET_HEALTH = 1e6;
		COMMAND_KEYS$1 = [
			"sourceId",
			"targetId",
			"tick",
			"type"
		];
		COMMAND_TYPES$1 = /* @__PURE__ */ new Set([
			"acquire-target",
			"die",
			"interrupt",
			"reset",
			"reset-immune-target",
			"reset-ineligible-source",
			"reset-ineligible-target",
			"target-died"
		]);
		RESET_TYPES = /* @__PURE__ */ new Set([
			"reset",
			"reset-immune-target",
			"reset-ineligible-source",
			"reset-ineligible-target"
		]);
		SETUP_KEYS$1 = ["commands"];
		SNAPSHOT_KEYS$1 = [
			"identity",
			"state",
			"version"
		];
		IDENTITY_KEYS$1 = ["commands", "fixture"];
		STATE_KEYS$1 = [
			"alive",
			"attackSequence",
			"commandIndex",
			"consecutiveHits",
			"history",
			"nextLaunchTick",
			"pendingContact",
			"phase",
			"stageIndex",
			"targetAlive",
			"targetHealth",
			"targetId",
			"tick"
		];
		CONTACT_KEYS = [
			"amount",
			"contactTick",
			"sequence",
			"stageIndex",
			"targetId"
		];
		EVENT_KEYS$1 = {
			"attack-contact": [
				"amount",
				"healthAfter",
				"healthBefore",
				"sequence",
				"stageIndex",
				"targetId",
				"tick",
				"type"
			],
			"attack-launched": [
				"amount",
				"contactTick",
				"sequence",
				"stageIndex",
				"targetId",
				"tick",
				"type"
			],
			"combat-reset": [
				"applied",
				"reason",
				"sourceId",
				"targetId",
				"tick",
				"type"
			],
			died: ["tick", "type"],
			interrupted: [
				"targetId",
				"tick",
				"type"
			],
			"stage-changed": [
				"consecutiveHits",
				"stageIndex",
				"targetId",
				"tick",
				"type"
			],
			"target-acquired": [
				"targetId",
				"tick",
				"type"
			],
			"target-died": [
				"targetId",
				"tick",
				"type"
			]
		};
		PHASES = /* @__PURE__ */ new Set([
			"cadence",
			"contact",
			"dead",
			"idle",
			"windup"
		]);
		RESET_REASONS = /* @__PURE__ */ new Set([
			"applied",
			"dead",
			"idle",
			"source-ineligible",
			"target-immune",
			"target-ineligible",
			"target-mismatch"
		]);
		QUESTION_VALUES$1 = {
			attackCadenceTicks: 8,
			attackReadyBoundary: "reset-command-wins-before-launch",
			buffCoupling: "deferred-no-buff-coupling-claim",
			cadenceRestart: "restart-full-first-hit-windup-from-reset-tick",
			chargeCoupling: "deferred-no-charge-coupling-claim",
			commandFirstPriority: "commands-before-contact-before-launch",
			commonAreaDamageRadiusMillitiles: 2500,
			commonCount: 1,
			commonDamage: 192,
			commonDeployTimeTicks: null,
			commonFirstHitTicks: null,
			commonHitSpeedTicks: null,
			commonHitpoints: null,
			commonMovementMillitilesPerSecond: null,
			commonRangeMillitiles: null,
			commonSightRangeMillitiles: null,
			commonTargetMode: "ground-and-air",
			contactDelayTicks: 2,
			deathPolicy: "source-combatant-death-clears-target-and-all-attack-state",
			delivery: "explicit-command-only-no-radius-projectile-or-spell-delivery-claim",
			firstHitWindupTicks: 6,
			hitCounterClearing: "set-consecutive-hits-to-zero",
			idleBehavior: "valid-reset-is-recorded-no-op-with-idle-reason",
			immunity: "explicit-immune-target-rejects-reset-without-state-change",
			instantaneousTick: "integer-command-boundary-no-duration",
			interruption: "clear-pending-ramp-and-restart-windup-retaining-target",
			pendingContactCancellation: "discard-launched-unresolved-contact",
			pendingLaunchCancellation: "discard-current-windup-or-cadence-deadline",
			rampDamageStages: [
				10,
				20,
				40
			],
			rampStageClearing: "set-stage-zero",
			rampStageThresholds: [
				0,
				2,
				4
			],
			repeatedResets: "latest-applied-reset-restarts-full-windup",
			sameBoundaryOrdering: "stable-command-first-then-contact-then-launch",
			slowCoupling: "deferred-no-slow-coupling-claim",
			snareCoupling: "deferred-no-snare-coupling-claim",
			sourceEligibility: "positive-safe-integer-explicitly-eligible-source",
			stunCoupling: "deferred-no-stun-coupling-claim",
			syntheticTargetHealth: TARGET_HEALTH,
			targetEligibility: "retained-living-explicitly-eligible-target",
			targetReacquisition: "none-reset-does-not-search-or-switch-target",
			targetRetention: "retain-same-stable-positive-safe-integer-target-id",
			ticksPerSecond: 60,
			windupRestart: "next-launch-at-reset-tick-plus-six"
		};
		InstantaneousCombatResetEncounter = class InstantaneousCombatResetEncounter {
			#commands;
			#state;
			constructor(setup = createResetFixture()) {
				const checked = checkedSetup$1(setup);
				this.#commands = checked.commands;
				this.#state = initialState$1();
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
				safeInteger$1(count, "reset step count", 0, MAX_STEP_CHUNK$1);
				if (count > MAX_TICK$1 - this.#state.tick) throw new RangeError("reset step count exceeds the encounter bound");
				const candidate = checkedState(this.#state, this.#commands);
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...advanceOne(candidate, this.#commands));
				this.#state = candidate;
				return clone$1(events);
			}
			run() {
				return this.stepMany(MAX_TICK$1 - this.#state.tick);
			}
			serialize() {
				const serialized = canonicalJson$1({
					identity: {
						commands: this.#commands,
						fixture: "instantaneous-combat-reset-question-v1"
					},
					state: checkedState(this.#state, this.#commands),
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$1) throw new RangeError("reset snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("reset snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$1) throw new RangeError("reset snapshot exceeds its byte bound");
				let value;
				try {
					value = JSON.parse(serialized);
				} catch {
					throw new TypeError("reset snapshot must be valid JSON");
				}
				if (serialized !== canonicalJson$1(value)) throw new TypeError("reset snapshot must be canonical duplicate-free JSON");
				const snapshot = exactRecord$1(value, SNAPSHOT_KEYS$1, "reset snapshot");
				if (snapshot.version !== 1) throw new TypeError("reset snapshot version is unsupported");
				const identity = exactRecord$1(snapshot.identity, IDENTITY_KEYS$1, "reset snapshot.identity");
				if (identity.fixture !== "instantaneous-combat-reset-question-v1") throw new TypeError("reset snapshot fixture identity is invalid");
				const commands = checkedCommands$1(identity.commands);
				const state = checkedState(snapshot.state, commands, "reset snapshot.state");
				const encounter = new InstantaneousCombatResetEncounter({ commands });
				encounter.stepMany(state.tick);
				if (canonicalJson$1(encounter.#state) !== canonicalJson$1(state)) throw new TypeError("reset snapshot state is not a causal execution");
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/special-combat-rage.js
function deepFreeze(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze(child);
		Object.freeze(value);
	}
	return value;
}
function clone(value) {
	return JSON.parse(JSON.stringify(value));
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
function denseArray(value, label, maximum) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function safeInteger(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
}
function checkedId(value, label, nullable = false) {
	if (nullable && value === null) return;
	safeInteger(value, label, 1);
}
function checkedCommands(value) {
	const commands = denseArray(value, "rage commands", MAX_COMMANDS).map((entry, index) => {
		const label = `rage command ${index}`;
		const command = exactRecord(entry, COMMAND_KEYS, label);
		safeInteger(command.tick, `${label}.tick`, 0, 4095);
		if (!COMMAND_TYPES.has(command.type)) throw new TypeError(`${label}.type is invalid`);
		if (command.type === "accelerate" || command.type === "slow") {
			checkedId(command.sourceId, `${label}.sourceId`);
			if (command.targetId !== null) throw new TypeError(`${label}.targetId must be null`);
			const duration = command.type === "accelerate" ? RAGE_DURATION_TICKS : SLOW_DURATION_TICKS;
			if (command.tick > MAX_TICK - duration) throw new TypeError(`${label}.tick cannot fit duration`);
		} else if (command.type === "acquire-target") {
			checkedId(command.targetId, `${label}.targetId`);
			if (command.sourceId !== null) throw new TypeError(`${label}.sourceId must be null`);
		} else if (command.type === "target-died") {
			checkedId(command.targetId, `${label}.targetId`, true);
			if (command.sourceId !== null) throw new TypeError(`${label}.sourceId must be null`);
		} else if (command.sourceId !== null || command.targetId !== null) throw new TypeError(`${label} has inapplicable IDs`);
		return {
			sourceId: command.sourceId,
			targetId: command.targetId,
			tick: command.tick,
			type: command.type
		};
	});
	let prior = -1;
	for (const command of commands) {
		if (command.tick < prior) throw new TypeError("rage commands must have nondecreasing ticks");
		prior = command.tick;
	}
	return commands;
}
function checkedSetup(value) {
	const setup = exactRecord(value, SETUP_KEYS, "rage setup");
	if (setup.direction !== -1 && setup.direction !== 1) throw new TypeError("rage setup.direction must be -1 or 1");
	return {
		commands: checkedCommands(setup.commands),
		direction: setup.direction
	};
}
function initialState() {
	return {
		alive: true,
		attackPhase: "idle",
		attackSequence: 0,
		attackWork: null,
		commandIndex: 0,
		history: [],
		movementRemainder: 0,
		pendingAttack: null,
		position: 0,
		boostSourceId: null,
		boostUntilTick: null,
		slowSourceId: null,
		slowUntilTick: null,
		targetId: null,
		tick: 0
	};
}
function clearTarget(state) {
	state.attackPhase = "idle";
	state.attackWork = null;
	state.pendingAttack = null;
	state.targetId = null;
}
function applyCommand(state, command, events) {
	if (command.type === "accelerate" || command.type === "slow") {
		if (!state.alive) return;
		const duration = command.type === "accelerate" ? RAGE_DURATION_TICKS : SLOW_DURATION_TICKS;
		const status = command.type === "accelerate" ? "boost" : "slow";
		state[`${status}SourceId`] = command.sourceId;
		state[`${status}UntilTick`] = state.tick + duration;
		events.push({
			sourceId: command.sourceId,
			tick: state.tick,
			type: command.type === "accelerate" ? "rage-applied" : "slow-applied",
			untilTick: state.tick + duration
		});
		return;
	}
	if (command.type === "acquire-target") {
		if (!state.alive || state.targetId === command.targetId) return;
		clearTarget(state);
		state.targetId = command.targetId;
		state.attackPhase = "windup";
		state.attackWork = WINDUP_WORK;
		events.push({
			targetId: command.targetId,
			tick: state.tick,
			type: "target-acquired"
		});
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
		if (!state.alive || state.targetId === null) return;
		const targetId = state.targetId;
		state.attackPhase = "windup";
		state.attackWork = WINDUP_WORK;
		state.pendingAttack = null;
		events.push({
			targetId,
			tick: state.tick,
			type: "interrupted"
		});
		return;
	}
	if (state.alive) {
		state.alive = false;
		state.boostSourceId = null;
		state.boostUntilTick = null;
		state.slowSourceId = null;
		state.slowUntilTick = null;
		clearTarget(state);
		events.push({
			tick: state.tick,
			type: "died"
		});
	}
}
function activeRate(state) {
	if (state.boostUntilTick !== null && state.slowUntilTick !== null) return COMPOSED_RATE;
	if (state.boostUntilTick !== null) return RAGE_RATE;
	if (state.slowUntilTick !== null) return SLOW_RATE;
	return BASE_RATE;
}
function expire(state, status, eventType, events) {
	const untilKey = `${status}UntilTick`;
	const sourceKey = `${status}SourceId`;
	if (state[untilKey] !== null && state.tick >= state[untilKey]) {
		events.push({
			sourceId: state[sourceKey],
			tick: state.tick,
			type: eventType
		});
		state[sourceKey] = null;
		state[untilKey] = null;
	}
}
function uncheckedAdvance(state, commands, direction) {
	if (state.tick >= MAX_TICK) throw new RangeError("rage encounter has reached its tick bound");
	const tick = state.tick;
	const events = [];
	expire(state, "boost", "rage-expired", events);
	expire(state, "slow", "slow-expired", events);
	while (commands[state.commandIndex]?.tick === tick) {
		const command = commands[state.commandIndex];
		state.commandIndex += 1;
		applyCommand(state, command, events);
	}
	if (state.alive && state.targetId !== null && state.attackWork === 0) {
		if (state.attackPhase === "contact") {
			events.push({
				sequence: state.pendingAttack.sequence,
				targetId: state.pendingAttack.targetId,
				tick,
				type: "attack-contact"
			});
			state.pendingAttack = null;
			state.attackPhase = "cadence";
			state.attackWork = CADENCE_WORK;
		} else {
			state.attackSequence += 1;
			state.pendingAttack = {
				sequence: state.attackSequence,
				targetId: state.targetId
			};
			events.push({
				sequence: state.attackSequence,
				targetId: state.targetId,
				tick,
				type: "attack-launched"
			});
			state.attackPhase = "contact";
			state.attackWork = CONTACT_WORK;
		}
	}
	if (state.alive) {
		const rate = activeRate(state);
		const accumulated = BigInt(state.movementRemainder) + MOVEMENT_SPEED * rate;
		const magnitude = accumulated / MOVEMENT_DENOMINATOR;
		const remainder = accumulated % MOVEMENT_DENOMINATOR;
		const deltaBig = BigInt(direction) * magnitude;
		const next = BigInt(state.position) + deltaBig;
		if (next < -BigInt(MAX_POSITION) || next > BigInt(MAX_POSITION)) throw new RangeError("rage movement exceeds its position bound");
		const from = state.position;
		state.position = Number(next);
		state.movementRemainder = Number(remainder);
		events.push({
			delta: Number(deltaBig),
			from,
			rate: Number(rate),
			remainder: state.movementRemainder,
			tick,
			to: state.position,
			type: "moved"
		});
		if (state.targetId !== null && state.attackWork > 0) state.attackWork = Number(BigInt(state.attackWork) > rate ? BigInt(state.attackWork) - rate : 0n);
	}
	if (state.history.length + events.length > MAX_EVENTS) throw new RangeError("rage replay exceeds its event bound");
	state.history.push(...clone(events));
	state.tick += 1;
	return events;
}
function checkedEvent(value, index) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`rage history event ${index} has an invalid shape`);
	const descriptor = Object.getOwnPropertyDescriptor(value, "type");
	if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`rage history event ${index}.type must be data`);
	const keys = EVENT_KEYS[descriptor.value];
	if (keys === void 0) throw new TypeError(`rage history event ${index}.type is invalid`);
	const event = exactRecord(value, keys, `rage history event ${index}`);
	safeInteger(event.tick, `rage history event ${index}.tick`, 0, 4095);
	for (const key of [
		"rate",
		"remainder",
		"sequence",
		"sourceId",
		"targetId",
		"untilTick"
	]) if (Object.hasOwn(event, key)) safeInteger(event[key], `rage history event ${index}.${key}`, key === "remainder" ? 0 : 1);
	for (const key of [
		"delta",
		"from",
		"to"
	]) if (Object.hasOwn(event, key)) safeInteger(event[key] + MAX_POSITION, `rage history event ${index}.${key}`, 0, MAX_POSITION * 2);
	return event;
}
function checkedStateShape(value, commands, label) {
	const state = exactRecord(value, STATE_KEYS, label);
	if (typeof state.alive !== "boolean") throw new TypeError(`${label}.alive must be boolean`);
	safeInteger(state.tick, `${label}.tick`, 0, MAX_TICK);
	safeInteger(state.commandIndex, `${label}.commandIndex`, 0, commands.length);
	safeInteger(state.attackSequence, `${label}.attackSequence`, 0, MAX_EVENTS);
	safeInteger(state.position + MAX_POSITION, `${label}.position`, 0, MAX_POSITION * 2);
	safeInteger(state.movementRemainder, `${label}.movementRemainder`, 0, Number(MOVEMENT_DENOMINATOR - 1n));
	checkedId(state.targetId, `${label}.targetId`, true);
	checkedId(state.boostSourceId, `${label}.boostSourceId`, true);
	checkedId(state.slowSourceId, `${label}.slowSourceId`, true);
	if (![
		"idle",
		"windup",
		"contact",
		"cadence"
	].includes(state.attackPhase)) throw new TypeError(`${label}.attackPhase is invalid`);
	if (state.attackWork !== null) safeInteger(state.attackWork, `${label}.attackWork`, 0, CADENCE_WORK);
	for (const [status, duration] of [["boost", RAGE_DURATION_TICKS], ["slow", SLOW_DURATION_TICKS]]) {
		const until = state[`${status}UntilTick`];
		const source = state[`${status}SourceId`];
		if (until !== null) safeInteger(until, `${label}.${status}UntilTick`, 1, MAX_TICK);
		if (source === null !== (until === null)) throw new TypeError(`${label} ${status} status is inconsistent`);
		if (until !== null && (until < state.tick || until > state.tick + duration)) throw new TypeError(`${label} ${status} expiry is noncausal`);
	}
	let pendingAttack = null;
	if (state.pendingAttack !== null) {
		const pending = exactRecord(state.pendingAttack, PENDING_KEYS, `${label}.pendingAttack`);
		checkedId(pending.targetId, `${label}.pendingAttack.targetId`);
		safeInteger(pending.sequence, `${label}.pendingAttack.sequence`, 1, MAX_EVENTS);
		pendingAttack = pending;
	}
	const history = denseArray(state.history, `${label}.history`, MAX_EVENTS).map(checkedEvent);
	if (state.targetId === null !== (state.attackPhase === "idle" && state.attackWork === null)) throw new TypeError(`${label} target and attack state are inconsistent`);
	if (state.attackPhase === "contact" !== (pendingAttack !== null)) throw new TypeError(`${label} pending contact is inconsistent`);
	if (!state.alive && (state.targetId !== null || state.boostSourceId !== null || state.slowSourceId !== null || state.pendingAttack !== null)) throw new TypeError(`${label} dead state retains combat status`);
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
		attackSequence: state.attackSequence,
		attackWork: state.attackWork,
		commandIndex: state.commandIndex,
		history,
		movementRemainder: state.movementRemainder,
		pendingAttack,
		position: state.position,
		boostSourceId: state.boostSourceId,
		boostUntilTick: state.boostUntilTick,
		slowSourceId: state.slowSourceId,
		slowUntilTick: state.slowUntilTick,
		targetId: state.targetId,
		tick: state.tick
	};
}
function replayState(commands, direction, ticks) {
	const state = initialState();
	for (let index = 0; index < ticks; index += 1) uncheckedAdvance(state, commands, direction);
	return state;
}
function checkedCausalState(value, commands, direction, label = "rage state") {
	const checked = checkedStateShape(value, commands, label);
	const expected = replayState(commands, direction, checked.tick);
	if (canonicalJson(checked) !== canonicalJson(expected)) throw new TypeError(`${label} is forged or noncausal`);
	return checked;
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
function createRageSpecialCatalog() {
	return createCardCatalog(CARD_DEFINITIONS);
}
function createRageQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("rage question records do not accept overrides");
	return deepFreeze(Object.fromEntries(Object.entries(QUESTION_VALUES).map(([key, value]) => [key, questionRecord(key, value)])));
}
function createRageFixture(commands = [], direction = 1) {
	return clone(checkedSetup({
		commands,
		direction
	}));
}
var CARD_DEFINITIONS, SOURCE, FIXTURE_ID, MAX_COMMANDS, MAX_EVENTS, MAX_POSITION, MAX_SNAPSHOT_BYTES, MAX_STEP_CHUNK, MAX_TICK, BASE_RATE, RAGE_RATE, SLOW_RATE, COMPOSED_RATE, MOVEMENT_DENOMINATOR, MOVEMENT_SPEED, WINDUP_WORK, CONTACT_WORK, CADENCE_WORK, RAGE_DURATION_TICKS, SLOW_DURATION_TICKS, COMMAND_KEYS, COMMAND_TYPES, SETUP_KEYS, SNAPSHOT_KEYS, IDENTITY_KEYS, STATE_KEYS, PENDING_KEYS, EVENT_KEYS, QUESTION_VALUES, TimedMovementAttackRageEncounter;
function init_special_combat_rage() {
	return (init_special_combat_rage = __esmMin((() => {
		init_schema();
		CARD_DEFINITIONS = [{
			areaDamageRadiusMillitiles: 3e3,
			components: [],
			cost: 2,
			count: 1,
			damage: 192,
			deployTimeTicks: 0,
			displayName: "Tempo Field",
			firstHitTicks: null,
			hitSpeedTicks: null,
			hitpoints: null,
			id: "tempo-field",
			kind: "effect",
			movementMillitilesPerSecond: null,
			rangeMillitiles: null,
			rarity: "mythic",
			sightRangeMillitiles: null,
			targetMode: "ground-and-air"
		}];
		SOURCE = "unsourced-timed-movement-and-attack-rage-fixture";
		FIXTURE_ID = "timed-movement-and-attack-rage-question-v1";
		MAX_COMMANDS = 96;
		MAX_EVENTS = 16384;
		MAX_POSITION = 1e5;
		MAX_SNAPSHOT_BYTES = 1048576;
		MAX_STEP_CHUNK = 4096;
		MAX_TICK = 4096;
		BASE_RATE = 80n;
		RAGE_RATE = 140n;
		SLOW_RATE = 52n;
		COMPOSED_RATE = 91n;
		MOVEMENT_DENOMINATOR = 4800n;
		MOVEMENT_SPEED = 1000n;
		WINDUP_WORK = 5760;
		CONTACT_WORK = 160;
		CADENCE_WORK = 8160;
		RAGE_DURATION_TICKS = 90;
		SLOW_DURATION_TICKS = 60;
		COMMAND_KEYS = [
			"sourceId",
			"targetId",
			"tick",
			"type"
		];
		COMMAND_TYPES = /* @__PURE__ */ new Set([
			"acquire-target",
			"die",
			"interrupt",
			"lose-target",
			"accelerate",
			"slow",
			"target-died"
		]);
		SETUP_KEYS = ["commands", "direction"];
		SNAPSHOT_KEYS = [
			"identity",
			"state",
			"version"
		];
		IDENTITY_KEYS = [
			"commands",
			"direction",
			"fixture"
		];
		STATE_KEYS = [
			"alive",
			"attackPhase",
			"attackSequence",
			"attackWork",
			"commandIndex",
			"history",
			"movementRemainder",
			"pendingAttack",
			"position",
			"boostSourceId",
			"boostUntilTick",
			"slowSourceId",
			"slowUntilTick",
			"targetId",
			"tick"
		];
		PENDING_KEYS = ["sequence", "targetId"];
		EVENT_KEYS = {
			"attack-contact": [
				"sequence",
				"targetId",
				"tick",
				"type"
			],
			"attack-launched": [
				"sequence",
				"targetId",
				"tick",
				"type"
			],
			died: ["tick", "type"],
			interrupted: [
				"targetId",
				"tick",
				"type"
			],
			moved: [
				"delta",
				"from",
				"rate",
				"remainder",
				"tick",
				"to",
				"type"
			],
			"rage-applied": [
				"sourceId",
				"tick",
				"type",
				"untilTick"
			],
			"rage-expired": [
				"sourceId",
				"tick",
				"type"
			],
			"slow-applied": [
				"sourceId",
				"tick",
				"type",
				"untilTick"
			],
			"slow-expired": [
				"sourceId",
				"tick",
				"type"
			],
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
		QUESTION_VALUES = Object.freeze({
			applyBoundary: "command-boundary-immediate-before-ready-contact-and-work",
			attackMultiplier: {
				denominator: 4,
				numerator: 7
			},
			attackWorkRate: "same-exact-rational-rate-as-movement",
			boundaryOrdering: "expire-rage-then-expire-slow-then-commands-in-input-order-then-ready-or-contact-then-movement-and-attack-work-then-tick",
			cadenceWorkUnits: CADENCE_WORK,
			commonAreaDamageRadius: 3e3,
			commonBaseDamage: 192,
			commonCount: 1,
			commonDeployTicks: 0,
			commonFirstHitTicks: null,
			commonHitCadenceTicks: null,
			commonHitpoints: null,
			commonMovementMillitilesPerSecond: null,
			commonRangeMillitiles: null,
			commonSightRangeMillitiles: null,
			commonTargetMode: "ground-and-air",
			contactDelayTicks: 2,
			contactRageApplication: "application-before-contact-advances-retained-contact-work",
			deathPolicy: "unit-death-clears-target-attack-pending-contact-rage-and-slow",
			delivery: "explicit-boundary-command-no-area-delivery-claim",
			differentSourceRefresh: "latest-command-replaces-source-and-refreshes-full-duration",
			durationTicks: RAGE_DURATION_TICKS,
			eligibility: "living-unit-explicit-command-positive-safe-source-id",
			expiryBoundaryReapply: "expiry-event-precedes-same-boundary-new-application",
			expiryWindow: "application-tick-through-application-plus-89-inclusive",
			fidelity: "isolated-question-fixture-not-a-general-buff-or-spell-system",
			idleApplication: "status-runs-and-movement-accelerates-with-no-target",
			interruptionPolicy: "command-first-interruption-cancels-pending-contact-and-restarts-full-windup-for-retained-target",
			movementMultiplier: {
				denominator: 4,
				numerator: 7
			},
			movementRemainder: "retained-across-application-refresh-composition-and-expiry",
			nonStacking: "one-rage-slot-regardless-of-source",
			normalRateUnits: Number(BASE_RATE),
			rageRateUnits: Number(RAGE_RATE),
			readyApplication: "command-first-rage-does-not-cancel-already-earned-readiness",
			retainedAttackRemainder: "integer-work-retained-across-application-refresh-composition-and-expiry",
			sameSourceRefresh: "refresh-full-duration-and-retain-all-remainders",
			slowComposition: "multiplicative-rage-seven-fourths-times-slow-thirteen-twentieths-equals-ninety-one-eightieths",
			slowDurationTicks: SLOW_DURATION_TICKS,
			slowEligibility: "living-unit-explicit-command-positive-safe-source-id",
			slowMultiplier: {
				denominator: 20,
				numerator: 13
			},
			slowNonStacking: "one-isolated-slow-slot-regardless-of-source",
			slowRefresh: "latest-command-replaces-source-and-refreshes-full-duration",
			sourceDeath: "active-status-persists-because-source-liveness-is-not-modeled",
			stack: "multiple-rage-commands-never-multiply-and-latest-command-wins",
			targetChange: "command-first-change-cancels-ready-or-contact-and-starts-full-windup",
			targetDeath: "command-first-matching-target-death-cancels-ready-or-contact",
			targetLoss: "command-first-loss-cancels-ready-or-contact",
			windupWorkUnits: WINDUP_WORK
		});
		TimedMovementAttackRageEncounter = class TimedMovementAttackRageEncounter {
			#commands;
			#direction;
			#state;
			constructor(setup = createRageFixture()) {
				const checked = checkedSetup(setup);
				this.#commands = checked.commands;
				this.#direction = checked.direction;
				this.#state = initialState();
			}
			get replay() {
				return clone(this.#state.history);
			}
			get state() {
				return clone(this.#state);
			}
			step() {
				const candidate = checkedCausalState(this.#state, this.#commands, this.#direction);
				const events = uncheckedAdvance(candidate, this.#commands, this.#direction);
				this.#state = candidate;
				return clone(events);
			}
			stepMany(count) {
				safeInteger(count, "rage step count", 0, MAX_STEP_CHUNK);
				if (count > MAX_TICK - this.#state.tick) throw new RangeError("rage step count exceeds the encounter bound");
				const candidate = checkedCausalState(this.#state, this.#commands, this.#direction);
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...uncheckedAdvance(candidate, this.#commands, this.#direction));
				this.#state = candidate;
				return clone(events);
			}
			run() {
				return this.stepMany(MAX_TICK - this.#state.tick);
			}
			serialize() {
				const serialized = canonicalJson({
					identity: {
						commands: this.#commands,
						direction: this.#direction,
						fixture: FIXTURE_ID
					},
					state: checkedCausalState(this.#state, this.#commands, this.#direction),
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES) throw new RangeError("rage snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("rage snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES) throw new RangeError("rage snapshot exceeds its byte bound");
				let value;
				try {
					value = JSON.parse(serialized);
				} catch {
					throw new TypeError("rage snapshot must be valid JSON");
				}
				if (serialized !== canonicalJson(value)) throw new TypeError("rage snapshot must be canonical duplicate-free JSON");
				const snapshot = exactRecord(value, SNAPSHOT_KEYS, "rage snapshot");
				if (snapshot.version !== 1) throw new TypeError("rage snapshot version is unsupported");
				const identity = exactRecord(snapshot.identity, IDENTITY_KEYS, "rage snapshot.identity");
				if (identity.fixture !== FIXTURE_ID) throw new TypeError("rage snapshot fixture identity is invalid");
				const setup = checkedSetup({
					commands: identity.commands,
					direction: identity.direction
				});
				const state = checkedCausalState(snapshot.state, setup.commands, setup.direction, "rage snapshot.state");
				const encounter = new TimedMovementAttackRageEncounter(setup);
				encounter.#state = state;
				return encounter;
			}
		};
	})))();
}
//#endregion
export { createRampQuestionRecords as C, createRampFixture as S, init_special_combat_ramp as T, createSlowFixture as _, init_special_combat_rage as a, init_special_combat_slow as b, createResetQuestionRecords as c, TimedMovementOnlySnareEncounter as d, createSnareFixture as f, TimedMovementAttackSlowEncounter as g, init_special_combat_snare as h, createRageSpecialCatalog as i, createResetSpecialCatalog as l, createSnareSpecialCatalog as m, createRageFixture as n, InstantaneousCombatResetEncounter as o, createSnareQuestionRecords as p, createRageQuestionRecords as r, createResetFixture as s, TimedMovementAttackRageEncounter as t, init_special_combat_reset as u, createSlowQuestionRecords as v, createRampSpecialCatalog as w, ConsecutiveTargetRampEncounter as x, createSlowSpecialCatalog as y };
