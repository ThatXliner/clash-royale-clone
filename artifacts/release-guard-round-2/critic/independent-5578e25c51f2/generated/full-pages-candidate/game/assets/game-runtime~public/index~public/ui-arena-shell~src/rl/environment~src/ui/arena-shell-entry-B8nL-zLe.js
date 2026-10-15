import { t as __esmMin } from "../../../../../../rolldown-runtime-Cl99QfTQ.js";
import { B as createCardCatalog, C as createRetargetQuestionRecords$1, S as createRecoilQuestionFixture$1, V as init_schema, _ as RECOIL_QUESTION_VALUES, b as createDashQuestionFixture$1, g as JUMP_QUESTION_VALUES, h as DASH_QUESTION_VALUES, m as CHARGE_QUESTION_VALUES, v as createChargeKnockbackQuestionRecords$1, w as init_session_troop_movement_question_authority, x as createJumpQuestionFixture$1, y as createChargeQuestionFixture$1 } from "./arena-shell-entry-7HYgJsNr.js";
import { c as init_area_damage, d as ARENA_WIDTH_MILLITILES, h as isPointInArena, l as ARENA_LENGTH_MILLITILES, p as init_arena_geometry, s as AreaDamageSystem } from "./arena-shell-entry-yR8a61kO.js";
import { At as MAX_SPATIAL_MILLITILES, Dt as init_movement, Et as createMovementState, Mt as init_spatial, Nt as validateCircle, Pt as validatePosition, Tt as advanceMovement, _t as retainOrAcquireTarget, ct as init_pathfinding, ft as ProjectileCombat, gt as init_targeting, ht as acquireTarget, pt as init_projectile, st as findGroundPath, vt as targetCandidate } from "./arena-shell-entry-DHGDlboh.js";
import { c as createCombatEffectFeed, f as DamageSystem, i as appendCombatEffectRoot, l as init_combat_effect_feed, n as appendCombatEffectEvent, o as combatEffectFeedSnapshot, p as init_damage, u as serializeCombatEffectFeed } from "./arena-shell-entry-CVKh5POa.js";
import { r as init_attack_cycle, t as AttackCycle } from "./arena-shell-entry-iYK_h2t5.js";
//#region src/content/cards/special-projectiles-chain.js
function question$5(value) {
	return Object.freeze({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		source: QUESTION_SOURCE$5,
		value
	});
}
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
function denseArray$9(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function checkedCandidate$5(value, index) {
	const label = `chain candidate ${index}`;
	const raw = exactRecord$12(value, CANDIDATE_KEYS$5, label);
	if (!Number.isSafeInteger(raw.maxHealth) || raw.maxHealth < 1) throw new TypeError(`${label}.maxHealth must be a positive safe integer`);
	const candidate = targetCandidate({
		alive: raw.alive,
		id: raw.id,
		kind: raw.kind,
		layer: raw.layer,
		position: raw.position,
		radius: raw.radius,
		targetable: raw.targetable
	}, label);
	if (candidate.id === ATTACKER_ID$3) throw new TypeError("chain candidate ID collides with the attacker");
	return {
		...candidate,
		maxHealth: raw.maxHealth
	};
}
function checkedCandidates$5(value) {
	const candidates = denseArray$9(value, MAX_CANDIDATES$5, "chain candidates").map(checkedCandidate$5).sort((left, right) => left.id - right.id);
	if (candidates.length === 0) throw new TypeError("chain candidates must not be empty");
	for (let index = 1; index < candidates.length; index += 1) if (candidates[index - 1].id === candidates[index].id) throw new TypeError("chain candidates must have unique IDs");
	return candidates;
}
function checkedCommands$12(value, candidateIds) {
	const commands = denseArray$9(value, MAX_COMMANDS$13, "chain commands").map((entry, index) => {
		const command = exactRecord$12(entry, COMMAND_KEYS$13, `chain command ${index}`);
		if (!COMMAND_TYPES$11.has(command.type)) throw new TypeError(`chain command ${index}.type is invalid`);
		if (!Number.isSafeInteger(command.tick) || command.tick < 0 || command.tick >= MAX_TICK$13) throw new TypeError(`chain command ${index}.tick is invalid`);
		if (command.type === "kill-attacker") {
			if (command.targetId !== null) throw new TypeError("kill-attacker targetId must be null");
		} else if (!Number.isSafeInteger(command.targetId) || !candidateIds.has(command.targetId)) throw new TypeError("kill-target targetId must name a candidate");
		return {
			targetId: command.targetId,
			tick: command.tick,
			type: command.type
		};
	}).sort((left, right) => left.tick - right.tick || (left.type < right.type ? -1 : left.type > right.type ? 1 : 0) || (left.targetId ?? 0) - (right.targetId ?? 0));
	for (let index = 1; index < commands.length; index += 1) if (commands[index - 1].tick === commands[index].tick && commands[index - 1].type === commands[index].type && commands[index - 1].targetId === commands[index].targetId) throw new TypeError("chain commands must be unique");
	return commands;
}
function checkedSetup$12(value) {
	const setup = exactRecord$12(value, SETUP_KEYS$12, "chain setup");
	const candidates = checkedCandidates$5(setup.candidates);
	const candidateIds = new Set(candidates.map(({ id }) => id));
	if (!Number.isSafeInteger(setup.primaryTargetId) || !candidateIds.has(setup.primaryTargetId)) throw new TypeError("chain primaryTargetId must name a candidate");
	return {
		candidates,
		commands: checkedCommands$12(setup.commands, candidateIds),
		primaryTargetId: setup.primaryTargetId
	};
}
function defaultCandidates$3() {
	return [
		{
			alive: true,
			id: 201,
			kind: "troop",
			layer: "ground",
			maxHealth: 500,
			position: {
				x: 4e3,
				y: 4e3
			},
			radius: 0,
			targetable: true
		},
		{
			alive: true,
			id: 202,
			kind: "troop",
			layer: "air",
			maxHealth: 500,
			position: {
				x: 7e3,
				y: 4e3
			},
			radius: 0,
			targetable: true
		},
		{
			alive: true,
			id: 203,
			kind: "structure",
			layer: "ground",
			maxHealth: 500,
			position: {
				x: 1e4,
				y: 4e3
			},
			radius: 0,
			targetable: true
		},
		{
			alive: true,
			id: 204,
			kind: "troop",
			layer: "ground",
			maxHealth: 500,
			position: {
				x: 12e3,
				y: 4e3
			},
			radius: 0,
			targetable: true
		}
	];
}
function deepFrozenQuestionCopy$4() {
	return Object.freeze(Object.fromEntries(Object.entries(QUESTION_FIXTURES$4).map(([key, record]) => [key, Object.freeze({ ...record })])));
}
function distanceSquared(left, right) {
	const dx = BigInt(left.x) - BigInt(right.x);
	const dy = BigInt(left.y) - BigInt(right.y);
	return dx * dx + dy * dy;
}
function inRange(origin, candidate, range) {
	const reach = BigInt(origin.radius + range + candidate.radius);
	return distanceSquared(origin.position, candidate.position) <= reach * reach;
}
/**
* Returns the original Stormkite runtime definition. Chained behavior is not
* part of the common card schema; benchmark mapping is owned by tests only.
*/
function createChainSpecialCatalog() {
	return createCardCatalog(DEFINITIONS$9);
}
/**
* Returns independently frozen QUESTION records for every chained-target
* number or policy absent from the common corpus.
*/
function createChainQuestionFixture(...args) {
	if (args.length !== 0) throw new TypeError("chain question fixture does not accept overrides");
	return deepFrozenQuestionCopy$4();
}
/** Creates a validated, isolated, bounded encounter fixture. */
function createChainSpecialFixture(candidates = defaultCandidates$3(), primaryTargetId = 201, commands = [], ...extra) {
	if (extra.length !== 0) throw new TypeError("chain fixture received extra arguments");
	return clone$13(checkedSetup$12({
		candidates,
		commands,
		primaryTargetId
	}));
}
var DEFINITIONS$9, QUESTION_SOURCE$5, QUESTION_FIXTURES$4, ATTACKER_ID$3, ATTACKER_POSITION, ATTACKER_RADIUS, ATTACKER_MAX_HEALTH$2, PRIMARY_TICK, MAX_CANDIDATES$5, MAX_COMMANDS$13, MAX_SNAPSHOT_BYTES$13, MAX_TICK$13, SETUP_KEYS$12, CANDIDATE_KEYS$5, COMMAND_KEYS$13, SNAPSHOT_KEYS$10, COMMAND_TYPES$11, ChainEncounter;
function init_special_projectiles_chain() {
	return (init_special_projectiles_chain = __esmMin((() => {
		init_damage();
		init_targeting();
		init_schema();
		DEFINITIONS$9 = [{
			id: "stormkite",
			displayName: "Stormkite",
			cost: 5,
			kind: "unit",
			rarity: "special",
			hitpoints: 950,
			damage: 192,
			hitSpeedTicks: 126,
			firstHitTicks: 84,
			deployTimeTicks: 60,
			rangeMillitiles: 3500,
			sightRangeMillitiles: 5500,
			movementMillitilesPerSecond: 1e3,
			targetMode: "ground-and-air",
			count: 1,
			areaDamageRadiusMillitiles: null,
			components: []
		}];
		QUESTION_SOURCE$5 = "unsourced-chained-target-attack-fixture";
		QUESTION_FIXTURES$4 = Object.freeze({
			attackerCancellationRule: question$5("death-through-primary-boundary-cancels;death-after-primary-does-not-cancel"),
			candidateDeathRule: question$5("dead-before-selection-is-ineligible"),
			damagePerHop: question$5(192),
			eventOrderRule: question$5("commands-then-start-hit-damage-death-then-pending-or-complete"),
			hopDelayTicks: question$5(1),
			hopRangeMillitiles: question$5(3e3),
			lethalHopRule: question$5("lethal-current-hit-keeps-snapshotted-origin-and-does-not-cancel-continuation"),
			rangeRule: question$5("circle-edge-to-circle-edge-inclusive"),
			selectionRule: question$5("explicit-primary-then-nearest-eligible-unhit-center-distance-stable-id"),
			targetCap: question$5(3),
			targetEligibilityRule: question$5("alive-targetable-ground-or-air-troops-and-structures")
		});
		ATTACKER_ID$3 = 101;
		ATTACKER_POSITION = Object.freeze({
			x: 1e3,
			y: 4e3
		});
		ATTACKER_RADIUS = 0;
		ATTACKER_MAX_HEALTH$2 = 950;
		PRIMARY_TICK = DEFINITIONS$9[0].firstHitTicks;
		MAX_CANDIDATES$5 = 16;
		MAX_COMMANDS$13 = 8;
		MAX_SNAPSHOT_BYTES$13 = 32768;
		MAX_TICK$13 = PRIMARY_TICK + QUESTION_FIXTURES$4.hopDelayTicks.value * QUESTION_FIXTURES$4.targetCap.value + 1;
		SETUP_KEYS$12 = [
			"candidates",
			"commands",
			"primaryTargetId"
		];
		CANDIDATE_KEYS$5 = [
			"alive",
			"id",
			"kind",
			"layer",
			"maxHealth",
			"position",
			"radius",
			"targetable"
		];
		COMMAND_KEYS$13 = [
			"targetId",
			"tick",
			"type"
		];
		SNAPSHOT_KEYS$10 = [
			"identity",
			"tick",
			"version"
		];
		COMMAND_TYPES$11 = /* @__PURE__ */ new Set(["kill-attacker", "kill-target"]);
		ChainEncounter = class ChainEncounter {
			#candidates;
			#commands;
			#commandIndex = 0;
			#currentOrigin = null;
			#damage = new DamageSystem();
			#history = [];
			#hitIds = [];
			#primaryTargetId;
			#setup;
			#started = false;
			#terminal = false;
			#tick = 0;
			constructor(setup = createChainSpecialFixture()) {
				this.#setup = checkedSetup$12(setup);
				this.#candidates = this.#setup.candidates;
				this.#commands = this.#setup.commands;
				this.#primaryTargetId = this.#setup.primaryTargetId;
				this.#damage.add(ATTACKER_ID$3, ATTACKER_MAX_HEALTH$2);
				for (const candidate of this.#candidates) {
					this.#damage.add(candidate.id, candidate.maxHealth);
					if (!candidate.alive) this.#damage.damage(candidate.id, candidate.maxHealth);
				}
			}
			get replay() {
				return clone$13(this.#history);
			}
			get state() {
				return clone$13({
					attackerAlive: !this.#damage.get(ATTACKER_ID$3).dead,
					candidates: this.#candidates.map((candidate) => {
						const health = this.#damage.get(candidate.id);
						return {
							alive: !health.dead,
							hitpoints: health.currentHealth,
							id: candidate.id
						};
					}),
					currentOriginId: this.#currentOrigin?.id ?? null,
					hitTargetIds: this.#hitIds,
					phase: this.#terminal ? "terminal" : this.#started ? "chaining" : "winding-up",
					terminal: this.#terminal,
					tick: this.#tick
				});
			}
			step() {
				if (this.#terminal || this.#tick >= MAX_TICK$13) return [];
				const boundary = this.#tick;
				const events = [];
				while (this.#commands[this.#commandIndex]?.tick === boundary) {
					const command = this.#commands[this.#commandIndex];
					this.#commandIndex += 1;
					const targetId = command.type === "kill-attacker" ? ATTACKER_ID$3 : command.targetId;
					events.push({
						targetId,
						tick: boundary,
						type: "chain-command",
						value: command.type
					});
					const result = this.#damage.damage(targetId, this.#damage.get(targetId).maxHealth);
					events.push(...result.events.map((event) => ({
						...event,
						tick: boundary,
						type: `external-${event.type}`
					})));
				}
				if (boundary === PRIMARY_TICK && !this.#started) {
					if (this.#damage.get(ATTACKER_ID$3).dead) this.#complete(events, boundary, "attacker-dead-before-primary");
					else {
						const primary = this.#candidate(this.#primaryTargetId);
						if (!this.#eligible(primary) || !inRange({
							position: ATTACKER_POSITION,
							radius: ATTACKER_RADIUS
						}, primary, DEFINITIONS$9[0].rangeMillitiles)) this.#complete(events, boundary, "primary-ineligible");
						else {
							this.#started = true;
							events.push({
								attackerId: ATTACKER_ID$3,
								targetId: primary.id,
								tick: boundary,
								type: "chain-start"
							});
							this.#hit(primary, events, boundary);
						}
					}
				} else if (this.#started && !this.#terminal && boundary === PRIMARY_TICK + this.#hitIds.length * QUESTION_FIXTURES$4.hopDelayTicks.value) {
					const next = this.#nearestEligibleUnhit();
					if (next === null) this.#complete(events, boundary, "no-eligible-target");
					else this.#hit(next, events, boundary);
				}
				this.#tick += 1;
				this.#history.push(...events);
				return clone$13(events);
			}
			stepMany(ticks) {
				if (!Number.isSafeInteger(ticks) || ticks < 0) throw new TypeError("chain ticks must be a non-negative safe integer");
				const events = [];
				for (let index = 0; index < ticks && !this.#terminal && this.#tick < MAX_TICK$13; index += 1) events.push(...this.step());
				return events;
			}
			run(tickLimit = MAX_TICK$13) {
				if (!Number.isSafeInteger(tickLimit) || tickLimit < 0) throw new TypeError("chain tick limit must be a non-negative safe integer");
				if (tickLimit > MAX_TICK$13) throw new RangeError("chain tick limit exceeds its bound");
				while (!this.#terminal && this.#tick < tickLimit) this.step();
				return this.state;
			}
			serialize() {
				const serialized = canonicalJson$13({
					identity: this.#setup,
					tick: this.#tick,
					version: 1
				});
				if (serialized.length > MAX_SNAPSHOT_BYTES$13) throw new RangeError("chain snapshot exceeds its size bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("chain snapshot must be a string");
				if (serialized.length > MAX_SNAPSHOT_BYTES$13) throw new RangeError("chain snapshot exceeds its size bound");
				let raw;
				try {
					raw = JSON.parse(serialized);
				} catch {
					throw new TypeError("chain snapshot must be valid JSON");
				}
				const snapshot = exactRecord$12(raw, SNAPSHOT_KEYS$10, "chain snapshot");
				if (snapshot.version !== 1) throw new TypeError("chain snapshot version is unsupported");
				if (!Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0 || snapshot.tick > MAX_TICK$13) throw new TypeError("chain snapshot.tick is invalid");
				const encounter = new ChainEncounter(snapshot.identity);
				encounter.stepMany(snapshot.tick);
				if (encounter.#tick !== snapshot.tick) throw new TypeError("chain snapshot contains post-terminal time");
				return encounter;
			}
			#candidate(id) {
				return this.#candidates.find((candidate) => candidate.id === id) ?? null;
			}
			#complete(events, tick, reason) {
				this.#terminal = true;
				events.push({
					hitTargetIds: [...this.#hitIds],
					reason,
					tick,
					type: "chain-complete"
				});
			}
			#eligible(candidate) {
				if (candidate === null || !candidate.targetable || this.#hitIds.includes(candidate.id)) return false;
				return !this.#damage.get(candidate.id).dead;
			}
			#hit(candidate, events, tick) {
				this.#hitIds.push(candidate.id);
				this.#currentOrigin = {
					id: candidate.id,
					position: { ...candidate.position },
					radius: candidate.radius
				};
				events.push({
					amount: QUESTION_FIXTURES$4.damagePerHop.value,
					hop: this.#hitIds.length,
					targetId: candidate.id,
					tick,
					type: "chain-hit"
				});
				const result = this.#damage.damage(candidate.id, QUESTION_FIXTURES$4.damagePerHop.value);
				events.push(...result.events.map((event) => ({
					...event,
					hop: this.#hitIds.length,
					tick,
					type: `chain-${event.type}`
				})));
				if (this.#hitIds.length === QUESTION_FIXTURES$4.targetCap.value) this.#complete(events, tick, "target-cap");
				else events.push({
					fromTargetId: candidate.id,
					nextTick: tick + QUESTION_FIXTURES$4.hopDelayTicks.value,
					tick,
					type: "chain-hop-pending"
				});
			}
			#nearestEligibleUnhit() {
				const candidates = this.#candidates.filter((candidate) => this.#eligible(candidate) && inRange(this.#currentOrigin, candidate, QUESTION_FIXTURES$4.hopRangeMillitiles.value));
				candidates.sort((left, right) => {
					const leftDistance = distanceSquared(this.#currentOrigin.position, left.position);
					const rightDistance = distanceSquared(this.#currentOrigin.position, right.position);
					return leftDistance < rightDistance ? -1 : leftDistance > rightDistance ? 1 : left.id - right.id;
				});
				return candidates[0] ?? null;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/special-projectiles-pierce.js
function question$4(value) {
	return Object.freeze({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		source: QUESTION_SOURCE$4,
		value
	});
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
function denseArray$8(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function checkedAim$2(value) {
	const aim = exactRecord$11(value, AIM_KEYS$2, "pierce aim");
	for (const key of AIM_KEYS$2) if (!Number.isSafeInteger(aim[key]) || Math.abs(aim[key]) > MAX_SPATIAL_MILLITILES) throw new TypeError(`pierce aim.${key} must be a safe integer within spatial bounds`);
	if (aim.x === 0 && aim.y === 0) throw new TypeError("pierce aim must not be a zero vector");
	return {
		x: aim.x,
		y: aim.y
	};
}
function integerSquareRoot$5(value) {
	if (value < 0n) throw new RangeError("square root input must be non-negative");
	if (value < 2n) return value;
	let low = 1n;
	let high = value;
	while (low + 1n < high) {
		const middle = (low + high) / 2n;
		if (middle * middle <= value) low = middle;
		else high = middle;
	}
	return low;
}
function projectedSegment(aim) {
	const x = BigInt(aim.x);
	const y = BigInt(aim.y);
	const magnitudeSquared = x * x + y * y;
	const magnitude = integerSquareRoot$5(magnitudeSquared);
	if (magnitude * magnitude !== magnitudeSquared) throw new TypeError("pierce aim magnitude must be an exact integer");
	const length = BigInt(QUESTION_FIXTURES$3.pierceLengthMillitiles.value);
	const scaledX = x * length;
	const scaledY = y * length;
	if (scaledX % magnitude !== 0n || scaledY % magnitude !== 0n) throw new TypeError("pierce aim projection must produce an integer endpoint");
	const dx = scaledX / magnitude;
	const dy = scaledY / magnitude;
	const endX = BigInt(ORIGIN$2.x) + dx;
	const endY = BigInt(ORIGIN$2.y) + dy;
	const bound = BigInt(MAX_SPATIAL_MILLITILES);
	if (endX < -bound || endX > bound || endY < -bound || endY > bound) throw new RangeError("pierce endpoint exceeds spatial bounds");
	return {
		direction: {
			x: Number(dx),
			y: Number(dy)
		},
		endpoint: {
			x: Number(endX),
			y: Number(endY)
		}
	};
}
function checkedCandidate$4(value, index) {
	const label = `pierce candidate ${index}`;
	const raw = exactRecord$11(value, CANDIDATE_KEYS$4, label);
	if (!Number.isSafeInteger(raw.maxHealth) || raw.maxHealth < 1) throw new TypeError(`${label}.maxHealth must be a positive safe integer`);
	const candidate = targetCandidate({
		alive: raw.alive,
		id: raw.id,
		kind: raw.kind,
		layer: raw.layer,
		position: raw.position,
		radius: raw.radius,
		targetable: raw.targetable
	}, label);
	if (candidate.id === ATTACKER_ID$2) throw new TypeError("pierce candidate ID collides with the attacker");
	return {
		...candidate,
		maxHealth: raw.maxHealth
	};
}
function checkedCandidates$4(value) {
	const candidates = denseArray$8(value, MAX_CANDIDATES$4, "pierce candidates").map(checkedCandidate$4).sort((left, right) => left.id - right.id);
	for (let index = 1; index < candidates.length; index += 1) if (candidates[index - 1].id === candidates[index].id) throw new TypeError("pierce candidates must have unique IDs");
	return candidates;
}
function checkedCommands$11(value, candidateIds) {
	const commands = denseArray$8(value, MAX_COMMANDS$12, "pierce commands").map((entry, index) => {
		const command = exactRecord$11(entry, COMMAND_KEYS$12, `pierce command ${index}`);
		if (!COMMAND_TYPES$10.has(command.type)) throw new TypeError(`pierce command ${index}.type is invalid`);
		if (!Number.isSafeInteger(command.tick) || command.tick < 0 || command.tick > IMPACT_TICK$2) throw new TypeError(`pierce command ${index}.tick is invalid`);
		if (command.type === "kill-target") {
			if (!Number.isSafeInteger(command.targetId) || !candidateIds.has(command.targetId)) throw new TypeError("kill-target targetId must name a candidate");
		} else if (command.targetId !== null) throw new TypeError(`${command.type} targetId must be null`);
		return {
			targetId: command.targetId,
			tick: command.tick,
			type: command.type
		};
	}).sort((left, right) => left.tick - right.tick || (left.type < right.type ? -1 : left.type > right.type ? 1 : 0) || (left.targetId ?? 0) - (right.targetId ?? 0));
	for (let index = 1; index < commands.length; index += 1) if (commands[index - 1].tick === commands[index].tick && commands[index - 1].type === commands[index].type && commands[index - 1].targetId === commands[index].targetId) throw new TypeError("pierce commands must be unique");
	return commands;
}
function checkedSetup$11(value) {
	const setup = exactRecord$11(value, SETUP_KEYS$11, "pierce setup");
	const aim = checkedAim$2(setup.aim);
	projectedSegment(aim);
	const candidates = checkedCandidates$4(setup.candidates);
	return {
		aim,
		candidates,
		commands: checkedCommands$11(setup.commands, new Set(candidates.map(({ id }) => id)))
	};
}
function defaultCandidates$2() {
	return [
		{
			alive: true,
			id: 201,
			kind: "troop",
			layer: "ground",
			maxHealth: 500,
			position: {
				x: 3e3,
				y: 4e3
			},
			radius: 0,
			targetable: true
		},
		{
			alive: true,
			id: 202,
			kind: "troop",
			layer: "air",
			maxHealth: 500,
			position: {
				x: 7e3,
				y: 4e3
			},
			radius: 0,
			targetable: true
		},
		{
			alive: true,
			id: 203,
			kind: "structure",
			layer: "ground",
			maxHealth: 500,
			position: {
				x: 12e3,
				y: 4e3
			},
			radius: 0,
			targetable: true
		}
	];
}
function deepFrozenQuestionCopy$3() {
	return Object.freeze(Object.fromEntries(Object.entries(QUESTION_FIXTURES$3).map(([key, record]) => [key, Object.freeze({ ...record })])));
}
function collisionOrder(candidate, segment) {
	const px = BigInt(candidate.position.x) - BigInt(ORIGIN$2.x);
	const py = BigInt(candidate.position.y) - BigInt(ORIGIN$2.y);
	const dx = BigInt(segment.direction.x);
	const dy = BigInt(segment.direction.y);
	const lengthSquared = dx * dx + dy * dy;
	const dot = px * dx + py * dy;
	const reach = BigInt(QUESTION_FIXTURES$3.corridorHalfWidthMillitiles.value) + BigInt(candidate.radius);
	if (dot < 0n) {
		if (px * px + py * py > reach * reach) return null;
	} else if (dot <= lengthSquared) {
		const cross = px * dy - py * dx;
		if (cross * cross > reach * reach * lengthSquared) return null;
	} else {
		const ex = BigInt(candidate.position.x) - BigInt(segment.endpoint.x);
		const ey = BigInt(candidate.position.y) - BigInt(segment.endpoint.y);
		if (ex * ex + ey * ey > reach * reach) return null;
	}
	return dot;
}
/**
* Returns the original Prism Warden runtime definition. External comparison
* mappings belong to tests and are never part of shipped content.
*/
function createPierceSpecialCatalog() {
	return createCardCatalog(DEFINITIONS$8);
}
/**
* Returns independently frozen QUESTION records for every through-shot number
* and policy absent from the common content corpus.
*/
function createPierceQuestionFixture(...args) {
	if (args.length !== 0) throw new TypeError("pierce question fixture does not accept overrides");
	return deepFrozenQuestionCopy$3();
}
/** Creates a validated, isolated, bounded encounter fixture. */
function createPierceSpecialFixture(candidates = defaultCandidates$2(), aim = {
	x: 1,
	y: 0
}, commands = [], ...extra) {
	if (extra.length !== 0) throw new TypeError("pierce fixture received extra arguments");
	return clone$12(checkedSetup$11({
		aim,
		candidates,
		commands
	}));
}
var DEFINITIONS$8, QUESTION_SOURCE$4, QUESTION_FIXTURES$3, ATTACKER_ID$2, ATTACKER_MAX_HEALTH$1, ORIGIN$2, LAUNCH_TICK$3, IMPACT_TICK$2, MAX_TICK$12, MAX_CANDIDATES$4, MAX_COMMANDS$12, MAX_REPLAY_EVENTS$3, MAX_SNAPSHOT_BYTES$12, SETUP_KEYS$11, AIM_KEYS$2, CANDIDATE_KEYS$4, COMMAND_KEYS$12, SNAPSHOT_KEYS$9, COMMAND_TYPES$10, PierceEncounter;
function init_special_projectiles_pierce() {
	return (init_special_projectiles_pierce = __esmMin((() => {
		init_damage();
		init_spatial();
		init_targeting();
		init_combat_effect_feed();
		init_schema();
		DEFINITIONS$8 = [{
			id: "prism-warden",
			displayName: "Prism Warden",
			cost: 4,
			kind: "unit",
			rarity: "mythic",
			hitpoints: 532,
			damage: 134,
			hitSpeedTicks: 66,
			firstHitTicks: 36,
			deployTimeTicks: 60,
			rangeMillitiles: 7e3,
			sightRangeMillitiles: 7500,
			movementMillitilesPerSecond: 1e3,
			targetMode: "ground-and-air",
			count: 1,
			areaDamageRadiusMillitiles: null,
			components: []
		}];
		QUESTION_SOURCE$4 = "unsourced-linear-through-shot-fixture";
		QUESTION_FIXTURES$3 = Object.freeze({
			attackerDeathAfterLaunchRule: question$4("launched-shot-continues"),
			attackerDeathThroughLaunchRule: question$4("cancels-launch"),
			collisionGeometryRule: question$4("static-directed-finite-segment-with-inclusive-start-cap-corridor-and-end-cap"),
			corridorHalfWidthMillitiles: question$4(250),
			damageApplicationRule: question$4("one-full-base-damage-hit-per-eligible-intersection"),
			eventOrderRule: question$4("commands-then-launch-or-cancel;impact-hit-order-then-damage-order-then-id-sorted-deaths-then-complete"),
			hitOrderRule: question$4("forward-segment-parameter-then-stable-id"),
			interruptionAfterLaunchRule: question$4("launched-shot-continues"),
			interruptionThroughLaunchRule: question$4("cancels-launch"),
			movingCollisionRule: question$4("launch-time-position-snapshot"),
			oneHitRule: question$4("at-most-once-per-target"),
			pierceLengthMillitiles: question$4(11e3),
			projectionRule: question$4("integer-endpoint-from-exact-integer-direction-magnitude"),
			projectileSpeedMillitilesPerTick: question$4(1e3),
			sameBoundaryRule: question$4("commands-resolve-before-launch-and-impact"),
			targetDeathRule: question$4("dead-before-impact-is-ineligible"),
			targetEligibilityRule: question$4("alive-targetable-ground-or-air-troops-and-structures")
		});
		ATTACKER_ID$2 = 101;
		ATTACKER_MAX_HEALTH$1 = DEFINITIONS$8[0].hitpoints;
		ORIGIN$2 = Object.freeze({
			x: 1e3,
			y: 4e3
		});
		LAUNCH_TICK$3 = DEFINITIONS$8[0].firstHitTicks;
		IMPACT_TICK$2 = LAUNCH_TICK$3 + Math.ceil(QUESTION_FIXTURES$3.pierceLengthMillitiles.value / QUESTION_FIXTURES$3.projectileSpeedMillitilesPerTick.value);
		MAX_TICK$12 = IMPACT_TICK$2 + 1;
		MAX_CANDIDATES$4 = 32;
		MAX_COMMANDS$12 = 16;
		MAX_REPLAY_EVENTS$3 = 128;
		MAX_SNAPSHOT_BYTES$12 = 65536;
		SETUP_KEYS$11 = [
			"aim",
			"candidates",
			"commands"
		];
		AIM_KEYS$2 = ["x", "y"];
		CANDIDATE_KEYS$4 = [
			"alive",
			"id",
			"kind",
			"layer",
			"maxHealth",
			"position",
			"radius",
			"targetable"
		];
		COMMAND_KEYS$12 = [
			"targetId",
			"tick",
			"type"
		];
		SNAPSHOT_KEYS$9 = [
			"identity",
			"tick",
			"version"
		];
		COMMAND_TYPES$10 = /* @__PURE__ */ new Set([
			"interrupt-attacker",
			"kill-attacker",
			"kill-target"
		]);
		PierceEncounter = class PierceEncounter {
			#candidates;
			#commands;
			#commandIndex = 0;
			#damage = new DamageSystem();
			#feed = createCombatEffectFeed();
			#feedRoot = null;
			#history = [];
			#interrupted = false;
			#launched = false;
			#setup;
			#terminal = false;
			#tick = 0;
			constructor(setup = createPierceSpecialFixture()) {
				this.#setup = checkedSetup$11(setup);
				this.#candidates = this.#setup.candidates;
				this.#commands = this.#setup.commands;
				this.#damage.add(ATTACKER_ID$2, ATTACKER_MAX_HEALTH$1);
				for (const candidate of this.#candidates) {
					this.#damage.add(candidate.id, candidate.maxHealth);
					if (!candidate.alive) this.#damage.damage(candidate.id, candidate.maxHealth);
				}
			}
			get replay() {
				return clone$12(this.#history);
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
				return PierceEncounter.restore(this.serialize());
			}
			get state() {
				return clone$12({
					attackerAlive: !this.#damage.get(ATTACKER_ID$2).dead,
					candidates: this.#candidates.map((candidate) => {
						const health = this.#damage.get(candidate.id);
						return {
							alive: !health.dead,
							hitpoints: health.currentHealth,
							id: candidate.id
						};
					}),
					hitTargetIds: this.#history.filter(({ type }) => type === "pierce-hit").map(({ targetId }) => targetId),
					interrupted: this.#interrupted,
					launched: this.#launched,
					phase: this.#terminal ? "terminal" : this.#launched ? "in-flight" : "winding-up",
					terminal: this.#terminal,
					tick: this.#tick
				});
			}
			step() {
				if (this.#terminal || this.#tick >= MAX_TICK$12) return [];
				const boundary = this.#tick;
				const events = [];
				this.#resolveCommands(boundary, events);
				if (boundary === LAUNCH_TICK$3) {
					if (this.#damage.get(ATTACKER_ID$2).dead || this.#interrupted) this.#complete(events, boundary, "launch-cancelled");
					else {
						this.#launched = true;
						const segment = projectedSegment(this.#setup.aim);
						events.push({
							endpoint: segment.endpoint,
							impactTick: IMPACT_TICK$2,
							origin: { ...ORIGIN$2 },
							tick: boundary,
							type: "pierce-launch"
						});
					}
				} else if (boundary === IMPACT_TICK$2 && this.#launched) this.#impact(boundary, events);
				this.#tick += 1;
				this.#observeVisualEvents(events);
				if (this.#history.length + events.length > MAX_REPLAY_EVENTS$3) throw new RangeError("pierce replay exceeds its event bound");
				this.#history.push(...events);
				return clone$12(events);
			}
			stepMany(ticks) {
				if (!Number.isSafeInteger(ticks) || ticks < 0) throw new TypeError("pierce ticks must be a non-negative safe integer");
				const events = [];
				for (let index = 0; index < ticks && !this.#terminal && this.#tick < MAX_TICK$12; index += 1) events.push(...this.step());
				return events;
			}
			run(tickLimit = MAX_TICK$12) {
				if (!Number.isSafeInteger(tickLimit) || tickLimit < 0) throw new TypeError("pierce tick limit must be a non-negative safe integer");
				if (tickLimit > MAX_TICK$12) throw new RangeError("pierce tick limit exceeds its bound");
				while (!this.#terminal && this.#tick < tickLimit) this.step();
				return this.state;
			}
			serialize() {
				const serialized = canonicalJson$12({
					identity: this.#setup,
					tick: this.#tick,
					version: 1
				});
				if (serialized.length > MAX_SNAPSHOT_BYTES$12) throw new RangeError("pierce snapshot exceeds its size bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("pierce snapshot must be a string");
				if (serialized.length > MAX_SNAPSHOT_BYTES$12) throw new RangeError("pierce snapshot exceeds its size bound");
				let raw;
				try {
					raw = JSON.parse(serialized);
				} catch {
					throw new TypeError("pierce snapshot must be valid JSON");
				}
				const snapshot = exactRecord$11(raw, SNAPSHOT_KEYS$9, "pierce snapshot");
				if (snapshot.version !== 1) throw new TypeError("pierce snapshot version is unsupported");
				if (!Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0 || snapshot.tick > MAX_TICK$12) throw new TypeError("pierce snapshot.tick is invalid");
				const encounter = new PierceEncounter(snapshot.identity);
				encounter.stepMany(snapshot.tick);
				if (encounter.#tick !== snapshot.tick) throw new TypeError("pierce snapshot contains post-terminal time");
				return encounter;
			}
			#complete(events, tick, reason) {
				this.#terminal = true;
				events.push({
					hitTargetIds: [...this.#history, ...events].filter(({ type }) => type === "pierce-hit").map(({ targetId }) => targetId),
					reason,
					tick,
					type: "pierce-complete"
				});
			}
			#observeVisualEvents(events) {
				for (const event of events) {
					if (event.type === "pierce-launch") {
						const root = appendCombatEffectRoot(this.#feed, {
							direction: "pierce",
							effectId: null,
							from: event.origin,
							impactTick: event.impactTick,
							projectileId: null,
							radius: QUESTION_FIXTURES$3.corridorHalfWidthMillitiles.value,
							segments: [],
							sequence: 1,
							sourceId: ATTACKER_ID$2,
							tick: event.tick,
							to: event.endpoint,
							type: "projectile"
						});
						this.#feedRoot = {
							lastEventId: root.eventId,
							rootId: root.rootId
						};
						continue;
					}
					if (this.#feedRoot === null) continue;
					if (event.type === "pierce-hit") {
						const candidate = this.#candidates.find(({ id }) => id === event.targetId);
						const child = appendCombatEffectEvent(this.#feed, {
							parentId: this.#feedRoot.lastEventId,
							payload: {
								point: candidate?.position ?? ORIGIN$2,
								status: "contact",
								subId: null,
								targetId: event.targetId
							},
							phase: "contact",
							rootId: this.#feedRoot.rootId,
							tick: event.tick,
							type: "projectile"
						});
						this.#feedRoot.lastEventId = child.eventId;
					} else if (event.type === "pierce-damage") {
						const child = appendCombatEffectEvent(this.#feed, {
							parentId: this.#feedRoot.lastEventId,
							payload: {
								amount: event.amount,
								currentHealthAfter: event.currentHealthAfter,
								currentHealthBefore: event.currentHealthBefore,
								targetId: event.targetId
							},
							phase: "damage",
							rootId: this.#feedRoot.rootId,
							tick: event.tick,
							type: "projectile"
						});
						this.#feedRoot.lastEventId = child.eventId;
					} else if (event.type === "pierce-death") {
						const child = appendCombatEffectEvent(this.#feed, {
							parentId: this.#feedRoot.lastEventId,
							payload: { targetId: event.targetId },
							phase: "death",
							rootId: this.#feedRoot.rootId,
							tick: event.tick,
							type: "projectile"
						});
						this.#feedRoot.lastEventId = child.eventId;
					} else if (event.type === "pierce-complete") {
						const reason = event.reason === "impact-resolved" ? "complete" : event.reason;
						const child = appendCombatEffectEvent(this.#feed, {
							parentId: this.#feedRoot.lastEventId,
							payload: { reason },
							phase: "close",
							rootId: this.#feedRoot.rootId,
							tick: event.tick,
							type: "projectile"
						});
						this.#feedRoot.lastEventId = child.eventId;
					}
				}
			}
			#impact(tick, events) {
				const segment = projectedSegment(this.#setup.aim);
				const hits = this.#candidates.map((candidate) => ({
					candidate,
					parameter: collisionOrder(candidate, segment)
				})).filter(({ candidate, parameter }) => parameter !== null && candidate.targetable && !this.#damage.get(candidate.id).dead).sort((left, right) => left.parameter < right.parameter ? -1 : left.parameter > right.parameter ? 1 : left.candidate.id - right.candidate.id);
				for (const { candidate, parameter } of hits) events.push({
					parameterNumerator: parameter.toString(),
					targetId: candidate.id,
					tick,
					type: "pierce-hit"
				});
				const batch = this.#damage.damageSimultaneously(hits.map(({ candidate }) => ({
					amount: DEFINITIONS$8[0].damage,
					targetId: candidate.id
				})));
				events.push(...batch.events.map((event) => ({
					...event,
					tick,
					type: `pierce-${event.type}`
				})));
				this.#complete(events, tick, "impact-resolved");
			}
			#resolveCommands(tick, events) {
				while (this.#commands[this.#commandIndex]?.tick === tick) {
					const command = this.#commands[this.#commandIndex];
					this.#commandIndex += 1;
					events.push({
						targetId: command.type === "kill-target" ? command.targetId : ATTACKER_ID$2,
						tick,
						type: "pierce-command",
						value: command.type
					});
					if (command.type === "interrupt-attacker") this.#interrupted = true;
					else {
						const targetId = command.type === "kill-attacker" ? ATTACKER_ID$2 : command.targetId;
						const result = this.#damage.damage(targetId, this.#damage.get(targetId).maxHealth);
						events.push(...result.events.map((event) => ({
							...event,
							tick,
							type: `external-${event.type}`
						})));
					}
				}
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/special-projectiles-return.js
function question$3(value) {
	return Object.freeze({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		source: QUESTION_SOURCE$3,
		value
	});
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
function denseArray$7(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function checkedAim$1(value) {
	const aim = exactRecord$10(value, AIM_KEYS$1, "return aim");
	for (const key of AIM_KEYS$1) if (!Number.isSafeInteger(aim[key]) || Math.abs(aim[key]) > MAX_SPATIAL_MILLITILES) throw new TypeError(`return aim.${key} must be a safe integer within spatial bounds`);
	if (aim.x === 0 && aim.y === 0) throw new TypeError("return aim must not be a zero vector");
	return {
		x: aim.x,
		y: aim.y
	};
}
function integerSquareRoot$4(value) {
	if (value < 0n) throw new RangeError("square root input must be non-negative");
	if (value < 2n) return value;
	let low = 1n;
	let high = value;
	while (low + 1n < high) {
		const middle = (low + high) / 2n;
		if (middle * middle <= value) low = middle;
		else high = middle;
	}
	return low;
}
function projectedTurn(aim) {
	const x = BigInt(aim.x);
	const y = BigInt(aim.y);
	const magnitudeSquared = x * x + y * y;
	const magnitude = integerSquareRoot$4(magnitudeSquared);
	if (magnitude * magnitude !== magnitudeSquared) throw new TypeError("return aim magnitude must be an exact integer");
	const distance = BigInt(QUESTION_FIXTURES$2.turnDistanceMillitiles.value);
	const scaledX = x * distance;
	const scaledY = y * distance;
	if (scaledX % magnitude !== 0n || scaledY % magnitude !== 0n) throw new TypeError("return aim projection must produce an integer turn point");
	const dx = scaledX / magnitude;
	const dy = scaledY / magnitude;
	const turnX = BigInt(ORIGIN$1.x) + dx;
	const turnY = BigInt(ORIGIN$1.y) + dy;
	const bound = BigInt(MAX_SPATIAL_MILLITILES);
	if (turnX < -bound || turnX > bound || turnY < -bound || turnY > bound) throw new RangeError("return turn point exceeds spatial bounds");
	return {
		direction: {
			x: Number(dx),
			y: Number(dy)
		},
		turnPoint: {
			x: Number(turnX),
			y: Number(turnY)
		}
	};
}
function checkedCandidate$3(value, index) {
	const label = `return candidate ${index}`;
	const raw = exactRecord$10(value, CANDIDATE_KEYS$3, label);
	if (!Number.isSafeInteger(raw.maxHealth) || raw.maxHealth < 1) throw new TypeError(`${label}.maxHealth must be a positive safe integer`);
	const candidate = targetCandidate({
		alive: raw.alive,
		id: raw.id,
		kind: raw.kind,
		layer: raw.layer,
		position: raw.position,
		radius: raw.radius,
		targetable: raw.targetable
	}, label);
	if (candidate.id === ATTACKER_ID$1) throw new TypeError("return candidate ID collides with the attacker");
	return {
		...candidate,
		maxHealth: raw.maxHealth
	};
}
function checkedCandidates$3(value) {
	const candidates = denseArray$7(value, MAX_CANDIDATES$3, "return candidates").map(checkedCandidate$3).sort((left, right) => left.id - right.id);
	for (let index = 1; index < candidates.length; index += 1) if (candidates[index - 1].id === candidates[index].id) throw new TypeError("return candidates must have unique IDs");
	return candidates;
}
function checkedCommands$10(value, candidateIds) {
	const commands = denseArray$7(value, MAX_COMMANDS$11, "return commands").map((entry, index) => {
		const command = exactRecord$10(entry, COMMAND_KEYS$11, `return command ${index}`);
		if (!COMMAND_TYPES$9.has(command.type)) throw new TypeError(`return command ${index}.type is invalid`);
		if (!Number.isSafeInteger(command.tick) || command.tick < 0 || command.tick > COMPLETE_TICK) throw new TypeError(`return command ${index}.tick is invalid`);
		if (command.type === "kill-target") {
			if (!Number.isSafeInteger(command.targetId) || !candidateIds.has(command.targetId)) throw new TypeError("kill-target targetId must name a candidate");
		} else if (command.targetId !== null) throw new TypeError(`${command.type} targetId must be null`);
		return {
			targetId: command.targetId,
			tick: command.tick,
			type: command.type
		};
	}).sort((left, right) => left.tick - right.tick || (left.type < right.type ? -1 : left.type > right.type ? 1 : 0) || (left.targetId ?? 0) - (right.targetId ?? 0));
	for (let index = 1; index < commands.length; index += 1) {
		const left = commands[index - 1];
		const right = commands[index];
		if (left.tick === right.tick && left.type === right.type && left.targetId === right.targetId) throw new TypeError("return commands must be unique");
	}
	return commands;
}
function checkedSetup$10(value) {
	const setup = exactRecord$10(value, SETUP_KEYS$10, "return setup");
	const aim = checkedAim$1(setup.aim);
	projectedTurn(aim);
	const candidates = checkedCandidates$3(setup.candidates);
	return {
		aim,
		candidates,
		commands: checkedCommands$10(setup.commands, new Set(candidates.map(({ id }) => id)))
	};
}
function defaultCandidates$1() {
	return [{
		alive: true,
		id: 201,
		kind: "troop",
		layer: "ground",
		maxHealth: 500,
		position: {
			x: 3e3,
			y: 4e3
		},
		radius: 0,
		targetable: true
	}, {
		alive: true,
		id: 202,
		kind: "troop",
		layer: "air",
		maxHealth: 500,
		position: {
			x: 6e3,
			y: 4e3
		},
		radius: 0,
		targetable: true
	}];
}
function deepFrozenQuestionCopy$2() {
	return Object.freeze(Object.fromEntries(Object.entries(QUESTION_FIXTURES$2).map(([key, record]) => [key, Object.freeze({ ...record })])));
}
function pointAlong(start, direction, travelled) {
	const distance = BigInt(QUESTION_FIXTURES$2.turnDistanceMillitiles.value);
	const amount = BigInt(travelled);
	const x = BigInt(start.x) + BigInt(direction.x) * amount / distance;
	const y = BigInt(start.y) + BigInt(direction.y) * amount / distance;
	return {
		x: Number(x),
		y: Number(y)
	};
}
function segmentParameter(candidate, start, end) {
	const px = BigInt(candidate.position.x) - BigInt(start.x);
	const py = BigInt(candidate.position.y) - BigInt(start.y);
	const dx = BigInt(end.x) - BigInt(start.x);
	const dy = BigInt(end.y) - BigInt(start.y);
	return px * dx + py * dy;
}
function capsuleIntersects(candidate, start, end) {
	const px = BigInt(candidate.position.x) - BigInt(start.x);
	const py = BigInt(candidate.position.y) - BigInt(start.y);
	const dx = BigInt(end.x) - BigInt(start.x);
	const dy = BigInt(end.y) - BigInt(start.y);
	const lengthSquared = dx * dx + dy * dy;
	const reach = BigInt(QUESTION_FIXTURES$2.collisionWidthMillitiles.value) + BigInt(candidate.radius);
	if (lengthSquared === 0n) return px * px + py * py <= reach * reach;
	const dot = px * dx + py * dy;
	if (dot <= 0n) return px * px + py * py <= reach * reach;
	if (dot >= lengthSquared) {
		const ex = BigInt(candidate.position.x) - BigInt(end.x);
		const ey = BigInt(candidate.position.y) - BigInt(end.y);
		return ex * ex + ey * ey <= reach * reach;
	}
	const cross = px * dy - py * dx;
	return cross * cross <= reach * reach * lengthSquared;
}
function createReturnSpecialCatalog() {
	return createCardCatalog(DEFINITIONS$7);
}
function createReturnQuestionFixture(...args) {
	if (args.length !== 0) throw new TypeError("return question fixture does not accept overrides");
	return deepFrozenQuestionCopy$2();
}
function createReturnSpecialFixture(candidates = defaultCandidates$1(), aim = {
	x: 1,
	y: 0
}, commands = [], ...extra) {
	if (extra.length !== 0) throw new TypeError("return fixture received extra arguments");
	return clone$11(checkedSetup$10({
		aim,
		candidates,
		commands
	}));
}
var DEFINITIONS$7, QUESTION_SOURCE$3, QUESTION_FIXTURES$2, ATTACKER_ID$1, ATTACKER_MAX_HEALTH, ORIGIN$1, LAUNCH_TICK$2, LEG_TICKS, TURN_TICK, COMPLETE_TICK, MAX_TICK$11, MAX_CANDIDATES$3, MAX_COMMANDS$11, MAX_REPLAY_EVENTS$2, MAX_SNAPSHOT_BYTES$11, SETUP_KEYS$10, AIM_KEYS$1, CANDIDATE_KEYS$3, COMMAND_KEYS$11, SNAPSHOT_KEYS$8, COMMAND_TYPES$9, ReturnEncounter;
function init_special_projectiles_return() {
	return (init_special_projectiles_return = __esmMin((() => {
		init_damage();
		init_spatial();
		init_targeting();
		init_combat_effect_feed();
		init_schema();
		DEFINITIONS$7 = [{
			id: "rune-reaver",
			displayName: "Rune Reaver",
			cost: 5,
			kind: "unit",
			rarity: "special",
			hitpoints: 1280,
			damage: 169,
			hitSpeedTicks: 54,
			firstHitTicks: 24,
			deployTimeTicks: 60,
			rangeMillitiles: 4500,
			sightRangeMillitiles: 5500,
			movementMillitilesPerSecond: 1e3,
			targetMode: "ground-and-air",
			count: 1,
			areaDamageRadiusMillitiles: null,
			components: []
		}];
		QUESTION_SOURCE$3 = "unsourced-outbound-returning-projectile-fixture";
		QUESTION_FIXTURES$2 = Object.freeze({
			attackerDeathAfterLaunchRule: question$3("launched-projectile-continues"),
			attackerDeathThroughLaunchRule: question$3("cancels-launch"),
			collisionGeometryRule: question$3("static-directed-finite-segment-with-inclusive-start-cap-corridor-and-end-cap"),
			collisionWidthMillitiles: question$3(250),
			damagePerPass: question$3(169),
			damagePerPassRule: question$3("full-base-damage-on-each-leg"),
			eventOrderRule: question$3("commands;launch;outbound-hits-near-to-far;turn;inbound-hits-far-to-near;complete"),
			inboundTimingRule: question$3("first-inbound-travel-boundary-is-after-turn"),
			interruptionAfterLaunchRule: question$3("launched-projectile-continues"),
			interruptionThroughLaunchRule: question$3("cancels-launch"),
			launchTimingTicks: question$3(24),
			movingTargetRule: question$3("launch-time-position-snapshot"),
			obstacleRule: question$3("obstacles-not-modeled-static-segment-unblocked"),
			oneHitPerLegRule: question$3("at-most-once-per-target-per-leg"),
			projectileSpeedMillitilesPerTick: question$3(1e3),
			sameBoundaryRule: question$3("commands-resolve-before-projectile-events"),
			targetDeathRule: question$3("dead-before-pass-contact-is-ineligible"),
			targetEligibilityRule: question$3("alive-targetable-ground-or-air-troops-and-structures"),
			turnDistanceMillitiles: question$3(7e3),
			turnaroundTimingRule: question$3("turn-after-outbound-contacts-at-end-boundary")
		});
		ATTACKER_ID$1 = 101;
		ATTACKER_MAX_HEALTH = DEFINITIONS$7[0].hitpoints;
		ORIGIN$1 = Object.freeze({
			x: 1e3,
			y: 4e3
		});
		LAUNCH_TICK$2 = QUESTION_FIXTURES$2.launchTimingTicks.value;
		LEG_TICKS = Math.ceil(QUESTION_FIXTURES$2.turnDistanceMillitiles.value / QUESTION_FIXTURES$2.projectileSpeedMillitilesPerTick.value);
		TURN_TICK = LAUNCH_TICK$2 + LEG_TICKS;
		COMPLETE_TICK = TURN_TICK + LEG_TICKS;
		MAX_TICK$11 = COMPLETE_TICK + 1;
		MAX_CANDIDATES$3 = 32;
		MAX_COMMANDS$11 = 24;
		MAX_REPLAY_EVENTS$2 = 256;
		MAX_SNAPSHOT_BYTES$11 = 65536;
		SETUP_KEYS$10 = [
			"aim",
			"candidates",
			"commands"
		];
		AIM_KEYS$1 = ["x", "y"];
		CANDIDATE_KEYS$3 = [
			"alive",
			"id",
			"kind",
			"layer",
			"maxHealth",
			"position",
			"radius",
			"targetable"
		];
		COMMAND_KEYS$11 = [
			"targetId",
			"tick",
			"type"
		];
		SNAPSHOT_KEYS$8 = [
			"identity",
			"tick",
			"version"
		];
		COMMAND_TYPES$9 = /* @__PURE__ */ new Set([
			"interrupt-attacker",
			"kill-attacker",
			"kill-target"
		]);
		ReturnEncounter = class ReturnEncounter {
			#candidates;
			#commands;
			#commandIndex = 0;
			#damage = new DamageSystem();
			#feed = createCombatEffectFeed();
			#feedRoot = null;
			#history = [];
			#interrupted = false;
			#launched = false;
			#outboundHitIds = [];
			#inboundHitIds = [];
			#setup;
			#terminal = false;
			#tick = 0;
			constructor(setup = createReturnSpecialFixture()) {
				this.#setup = checkedSetup$10(setup);
				this.#candidates = this.#setup.candidates;
				this.#commands = this.#setup.commands;
				this.#damage.add(ATTACKER_ID$1, ATTACKER_MAX_HEALTH);
				for (const candidate of this.#candidates) {
					this.#damage.add(candidate.id, candidate.maxHealth);
					if (!candidate.alive) this.#damage.damage(candidate.id, candidate.maxHealth);
				}
			}
			get replay() {
				return clone$11(this.#history);
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
				return ReturnEncounter.restore(this.serialize());
			}
			get state() {
				return clone$11({
					attackerAlive: !this.#damage.get(ATTACKER_ID$1).dead,
					candidates: this.#candidates.map((candidate) => {
						const health = this.#damage.get(candidate.id);
						return {
							alive: !health.dead,
							hitpoints: health.currentHealth,
							id: candidate.id
						};
					}),
					inboundHitIds: this.#inboundHitIds,
					interrupted: this.#interrupted,
					launched: this.#launched,
					outboundHitIds: this.#outboundHitIds,
					phase: this.#phase(),
					terminal: this.#terminal,
					tick: this.#tick
				});
			}
			step() {
				if (this.#terminal || this.#tick >= MAX_TICK$11) return [];
				const boundary = this.#tick;
				const events = [];
				this.#resolveCommands(boundary, events);
				if (boundary === LAUNCH_TICK$2) {
					if (this.#damage.get(ATTACKER_ID$1).dead || this.#interrupted) this.#complete(events, boundary, "launch-cancelled");
					else {
						this.#launched = true;
						const { turnPoint } = projectedTurn(this.#setup.aim);
						events.push({
							attackerId: ATTACKER_ID$1,
							completeTick: COMPLETE_TICK,
							origin: { ...ORIGIN$1 },
							tick: boundary,
							turnPoint,
							turnTick: TURN_TICK,
							type: "return-launch"
						});
						this.#resolveLeg("outbound", boundary, events);
					}
				} else if (this.#launched && boundary <= TURN_TICK) {
					this.#resolveLeg("outbound", boundary, events);
					if (boundary === TURN_TICK) events.push({
						tick: boundary,
						turnPoint: projectedTurn(this.#setup.aim).turnPoint,
						type: "return-turn"
					});
				} else if (this.#launched && boundary <= COMPLETE_TICK) {
					this.#resolveLeg("inbound", boundary, events);
					if (boundary === COMPLETE_TICK) this.#complete(events, boundary, "returned-to-origin");
				}
				this.#tick += 1;
				this.#observeVisualEvents(events);
				if (this.#history.length + events.length > MAX_REPLAY_EVENTS$2) throw new RangeError("return replay exceeds its event bound");
				this.#history.push(...events);
				return clone$11(events);
			}
			stepMany(ticks) {
				if (!Number.isSafeInteger(ticks) || ticks < 0) throw new TypeError("return ticks must be a non-negative safe integer");
				const events = [];
				for (let index = 0; index < ticks && !this.#terminal && this.#tick < MAX_TICK$11; index += 1) events.push(...this.step());
				return events;
			}
			run(tickLimit = MAX_TICK$11) {
				if (!Number.isSafeInteger(tickLimit) || tickLimit < 0) throw new TypeError("return tick limit must be a non-negative safe integer");
				if (tickLimit > MAX_TICK$11) throw new RangeError("return tick limit exceeds its bound");
				while (!this.#terminal && this.#tick < tickLimit) this.step();
				return this.state;
			}
			serialize() {
				const serialized = canonicalJson$11({
					identity: this.#setup,
					tick: this.#tick,
					version: 1
				});
				if (serialized.length > MAX_SNAPSHOT_BYTES$11) throw new RangeError("return snapshot exceeds its size bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("return snapshot must be a string");
				if (serialized.length > MAX_SNAPSHOT_BYTES$11) throw new RangeError("return snapshot exceeds its size bound");
				let raw;
				try {
					raw = JSON.parse(serialized);
				} catch {
					throw new TypeError("return snapshot must be valid JSON");
				}
				const snapshot = exactRecord$10(raw, SNAPSHOT_KEYS$8, "return snapshot");
				if (snapshot.version !== 1) throw new TypeError("return snapshot version is unsupported");
				if (!Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0 || snapshot.tick > MAX_TICK$11) throw new TypeError("return snapshot.tick is invalid");
				const encounter = new ReturnEncounter(snapshot.identity);
				encounter.stepMany(snapshot.tick);
				if (encounter.#tick !== snapshot.tick) throw new TypeError("return snapshot contains post-terminal time");
				return encounter;
			}
			#complete(events, tick, reason) {
				this.#terminal = true;
				events.push({
					inboundHitIds: [...this.#inboundHitIds],
					outboundHitIds: [...this.#outboundHitIds],
					reason,
					tick,
					type: "return-complete"
				});
			}
			#observeVisualEvents(events) {
				for (const event of events) {
					if (event.type === "return-launch") {
						const root = appendCombatEffectRoot(this.#feed, {
							direction: "return",
							effectId: null,
							from: event.origin,
							impactTick: event.completeTick,
							projectileId: null,
							radius: QUESTION_FIXTURES$2.collisionWidthMillitiles.value,
							segments: [],
							sequence: 1,
							sourceId: ATTACKER_ID$1,
							tick: event.tick,
							to: event.turnPoint,
							type: "projectile"
						});
						this.#feedRoot = {
							lastEventId: root.eventId,
							rootId: root.rootId
						};
						continue;
					}
					if (this.#feedRoot === null) continue;
					if (event.type === "return-turn") {
						const child = appendCombatEffectEvent(this.#feed, {
							parentId: this.#feedRoot.lastEventId,
							payload: { point: event.turnPoint },
							phase: "turn",
							rootId: this.#feedRoot.rootId,
							tick: event.tick,
							type: "projectile"
						});
						this.#feedRoot.lastEventId = child.eventId;
					} else if (event.type === "return-hit") {
						const candidate = this.#candidates.find(({ id }) => id === event.targetId);
						const child = appendCombatEffectEvent(this.#feed, {
							parentId: this.#feedRoot.lastEventId,
							payload: {
								point: candidate?.position ?? ORIGIN$1,
								status: "contact",
								subId: null,
								targetId: event.targetId
							},
							phase: "contact",
							rootId: this.#feedRoot.rootId,
							tick: event.tick,
							type: "projectile"
						});
						this.#feedRoot.lastEventId = child.eventId;
					} else if (event.type === "return-damage") {
						const child = appendCombatEffectEvent(this.#feed, {
							parentId: this.#feedRoot.lastEventId,
							payload: {
								amount: event.amount,
								currentHealthAfter: event.currentHealthAfter,
								currentHealthBefore: event.currentHealthBefore,
								targetId: event.targetId
							},
							phase: "damage",
							rootId: this.#feedRoot.rootId,
							tick: event.tick,
							type: "projectile"
						});
						this.#feedRoot.lastEventId = child.eventId;
					} else if (event.type === "return-death") {
						const child = appendCombatEffectEvent(this.#feed, {
							parentId: this.#feedRoot.lastEventId,
							payload: { targetId: event.targetId },
							phase: "death",
							rootId: this.#feedRoot.rootId,
							tick: event.tick,
							type: "projectile"
						});
						this.#feedRoot.lastEventId = child.eventId;
					} else if (event.type === "return-complete") {
						const reason = event.reason === "returned-to-origin" ? "complete" : event.reason;
						const child = appendCombatEffectEvent(this.#feed, {
							parentId: this.#feedRoot.lastEventId,
							payload: { reason },
							phase: "close",
							rootId: this.#feedRoot.rootId,
							tick: event.tick,
							type: "projectile"
						});
						this.#feedRoot.lastEventId = child.eventId;
					}
				}
			}
			#phase() {
				if (this.#terminal) return "terminal";
				if (!this.#launched) return "prelaunch";
				if (this.#tick < TURN_TICK) return "outbound";
				if (this.#tick === TURN_TICK) return "turn";
				return "inbound";
			}
			#resolveCommands(tick, events) {
				while (this.#commands[this.#commandIndex]?.tick === tick) {
					const command = this.#commands[this.#commandIndex];
					this.#commandIndex += 1;
					const targetId = command.type === "kill-target" ? command.targetId : ATTACKER_ID$1;
					events.push({
						targetId,
						tick,
						type: "return-command",
						value: command.type
					});
					if (command.type === "interrupt-attacker") this.#interrupted = true;
					else {
						const result = this.#damage.damage(targetId, this.#damage.get(targetId).maxHealth);
						events.push(...result.events.map((event) => ({
							...event,
							tick,
							type: `external-${event.type}`
						})));
					}
				}
			}
			#resolveLeg(leg, tick, events) {
				const projected = projectedTurn(this.#setup.aim);
				const outbound = leg === "outbound";
				const elapsed = outbound ? tick - LAUNCH_TICK$2 : tick - TURN_TICK;
				if (elapsed < 0 || !outbound && elapsed === 0) return;
				const travelled = Math.min(QUESTION_FIXTURES$2.turnDistanceMillitiles.value, elapsed * QUESTION_FIXTURES$2.projectileSpeedMillitilesPerTick.value);
				const start = outbound ? ORIGIN$1 : projected.turnPoint;
				const end = pointAlong(start, outbound ? projected.direction : {
					x: -projected.direction.x,
					y: -projected.direction.y
				}, travelled);
				const legEnd = outbound ? projected.turnPoint : ORIGIN$1;
				const hitIds = outbound ? this.#outboundHitIds : this.#inboundHitIds;
				const hits = this.#candidates.filter((candidate) => !hitIds.includes(candidate.id) && candidate.targetable && !this.#damage.get(candidate.id).dead && capsuleIntersects(candidate, start, end)).map((candidate) => ({
					candidate,
					parameter: segmentParameter(candidate, start, legEnd)
				})).sort((left, right) => left.parameter < right.parameter ? -1 : left.parameter > right.parameter ? 1 : left.candidate.id - right.candidate.id);
				for (const { candidate, parameter } of hits) {
					hitIds.push(candidate.id);
					events.push({
						leg,
						parameterNumerator: parameter.toString(),
						pass: outbound ? 1 : 2,
						targetId: candidate.id,
						tick,
						type: "return-hit"
					});
					const result = this.#damage.damage(candidate.id, QUESTION_FIXTURES$2.damagePerPass.value);
					events.push(...result.events.map((event) => ({
						...event,
						leg,
						pass: outbound ? 1 : 2,
						tick,
						type: `return-${event.type}`
					})));
				}
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/special-projectiles-pellets.js
function deepFreeze$1(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze$1(child);
		Object.freeze(value);
	}
	return value;
}
function question$2(value) {
	return deepFreeze$1({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		source: QUESTION_SOURCE$2,
		value
	});
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
function denseArray$6(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function integerSquareRoot$3(value) {
	if (value < 0n) throw new RangeError("square root input must be non-negative");
	if (value < 2n) return value;
	let low = 1n;
	let high = value;
	while (low + 1n < high) {
		const middle = (low + high) / 2n;
		if (middle * middle <= value) low = middle;
		else high = middle;
	}
	return low;
}
function checkedAim(value) {
	const aim = exactRecord$9(value, AIM_KEYS, "pellet aim");
	for (const key of AIM_KEYS) if (!Number.isSafeInteger(aim[key]) || Math.abs(aim[key]) > MAX_SPATIAL_MILLITILES) throw new TypeError(`pellet aim.${key} must be a safe integer within spatial bounds`);
	if (aim.x === 0 && aim.y === 0) throw new TypeError("pellet aim must not be a zero vector");
	return {
		x: aim.x,
		y: aim.y
	};
}
function projectedRays(aim) {
	const ax = BigInt(aim.x);
	const ay = BigInt(aim.y);
	const magnitudeSquared = ax * ax + ay * ay;
	const magnitude = integerSquareRoot$3(magnitudeSquared);
	if (magnitude * magnitude !== magnitudeSquared) throw new TypeError("pellet aim magnitude must be an exact integer");
	const range = BigInt(QUESTION_FIXTURES$1.pelletRangeMillitiles.value);
	const norm = BigInt(QUESTION_FIXTURES$1.rayPatternNorm.value);
	if (range % norm !== 0n) throw new RangeError("pellet range must be an integer ray-norm multiple");
	const scale = range / norm;
	const bound = BigInt(MAX_SPATIAL_MILLITILES);
	return QUESTION_FIXTURES$1.rayPattern.value.map((local, index) => {
		const rotatedX = ax * BigInt(local.x) - ay * BigInt(local.y);
		const rotatedY = ay * BigInt(local.x) + ax * BigInt(local.y);
		const xNumerator = rotatedX * scale;
		const yNumerator = rotatedY * scale;
		if (xNumerator < -bound * magnitude || xNumerator > bound * magnitude || yNumerator < -bound * magnitude || yNumerator > bound * magnitude) throw new RangeError("pellet endpoint exceeds spatial bounds");
		return {
			endpoint: {
				denominator: magnitude.toString(),
				xNumerator: xNumerator.toString(),
				yNumerator: yNumerator.toString()
			},
			pelletId: index + 1
		};
	});
}
function checkedCandidate$2(value, index) {
	const label = `pellet candidate ${index}`;
	const raw = exactRecord$9(value, CANDIDATE_KEYS$2, label);
	if (!Number.isSafeInteger(raw.maxHealth) || raw.maxHealth < 1) throw new TypeError(`${label}.maxHealth must be a positive safe integer`);
	const candidate = targetCandidate({
		alive: raw.alive,
		id: raw.id,
		kind: raw.kind,
		layer: raw.layer,
		position: raw.position,
		radius: raw.radius,
		targetable: raw.targetable
	}, label);
	if (candidate.id === ATTACKER_ID) throw new TypeError("pellet candidate ID collides with the attacker");
	return {
		...candidate,
		maxHealth: raw.maxHealth
	};
}
function checkedCandidates$2(value) {
	const candidates = denseArray$6(value, MAX_CANDIDATES$2, "pellet candidates").map(checkedCandidate$2).sort((left, right) => left.id - right.id);
	for (let index = 1; index < candidates.length; index += 1) if (candidates[index - 1].id === candidates[index].id) throw new TypeError("pellet candidates must have unique IDs");
	return candidates;
}
function checkedCommands$9(value, candidateIds) {
	const commands = denseArray$6(value, MAX_COMMANDS$10, "pellet commands").map((entry, index) => {
		const command = exactRecord$9(entry, COMMAND_KEYS$10, `pellet command ${index}`);
		if (!COMMAND_TYPES$8.has(command.type)) throw new TypeError(`pellet command ${index}.type is invalid`);
		if (!Number.isSafeInteger(command.tick) || command.tick < 0 || command.tick > IMPACT_TICK$1) throw new TypeError(`pellet command ${index}.tick is invalid`);
		if (command.type === "kill-target") {
			if (!Number.isSafeInteger(command.targetId) || !candidateIds.has(command.targetId)) throw new TypeError("kill-target targetId must name a candidate");
		} else if (command.targetId !== null) throw new TypeError(`${command.type} targetId must be null`);
		return {
			targetId: command.targetId,
			tick: command.tick,
			type: command.type
		};
	}).sort((left, right) => left.tick - right.tick || (left.type < right.type ? -1 : left.type > right.type ? 1 : 0) || (left.targetId ?? 0) - (right.targetId ?? 0));
	for (let index = 1; index < commands.length; index += 1) {
		const left = commands[index - 1];
		const right = commands[index];
		if (left.tick === right.tick && left.type === right.type && left.targetId === right.targetId) throw new TypeError("pellet commands must be unique");
	}
	return commands;
}
function checkedSetup$9(value) {
	const setup = exactRecord$9(value, SETUP_KEYS$9, "pellet setup");
	const aim = checkedAim(setup.aim);
	projectedRays(aim);
	const candidates = checkedCandidates$2(setup.candidates);
	return {
		aim,
		candidates,
		commands: checkedCommands$9(setup.commands, new Set(candidates.map(({ id }) => id)))
	};
}
function defaultCandidates() {
	return [{
		alive: true,
		id: 201,
		kind: "troop",
		layer: "ground",
		maxHealth: 2e3,
		position: {
			x: 1e3,
			y: 0
		},
		radius: 600,
		targetable: true
	}];
}
function deepFrozenQuestionCopy$1() {
	return deepFreeze$1(clone$10(QUESTION_FIXTURES$1));
}
function capsuleParameter(candidate, endpoint) {
	const denominator = BigInt(endpoint.denominator);
	const px = BigInt(candidate.position.x) - BigInt(ORIGIN.x);
	const py = BigInt(candidate.position.y) - BigInt(ORIGIN.y);
	const nx = BigInt(endpoint.xNumerator);
	const ny = BigInt(endpoint.yNumerator);
	const numeratorLengthSquared = nx * nx + ny * ny;
	const dotNumerator = px * nx + py * ny;
	const reach = BigInt(QUESTION_FIXTURES$1.collisionWidthMillitiles.value) + BigInt(candidate.radius);
	if (dotNumerator <= 0n) {
		if (px * px + py * py > reach * reach) return null;
		return 0n;
	}
	if (dotNumerator * denominator >= numeratorLengthSquared) {
		const ex = px * denominator - nx;
		const ey = py * denominator - ny;
		if (ex * ex + ey * ey > reach * reach * denominator * denominator) return null;
		return numeratorLengthSquared;
	}
	const crossNumerator = px * ny - py * nx;
	if (crossNumerator * crossNumerator > reach * reach * numeratorLengthSquared) return null;
	return dotNumerator * denominator;
}
/**
* Returns the original Scatterguard runtime definition. Any external
* comparison identity belongs only in tests and never in shipped content.
*/
function createPelletSpecialCatalog() {
	return createCardCatalog(DEFINITIONS$6);
}
/**
* Returns an independently copied, recursively frozen QUESTION record for
* every combat value and every fixed-fan policy absent from the common corpus.
*/
function createPelletQuestionFixture(...args) {
	if (args.length !== 0) throw new TypeError("pellet question fixture does not accept overrides");
	return deepFrozenQuestionCopy$1();
}
/** Creates one validated, isolated, bounded pellet-volley fixture. */
function createPelletSpecialFixture(candidates = defaultCandidates(), aim = {
	x: 1,
	y: 0
}, commands = [], ...extra) {
	if (extra.length !== 0) throw new TypeError("pellet fixture received extra arguments");
	return clone$10(checkedSetup$9({
		aim,
		candidates,
		commands
	}));
}
var DEFINITIONS$6, QUESTION_SOURCE$2, QUESTION_FIXTURES$1, ATTACKER_ID, ORIGIN, LAUNCH_TICK$1, IMPACT_TICK$1, MAX_TICK$10, MAX_CANDIDATES$2, MAX_COMMANDS$10, MAX_REPLAY_EVENTS$1, MAX_SNAPSHOT_BYTES$10, SETUP_KEYS$9, AIM_KEYS, CANDIDATE_KEYS$2, COMMAND_KEYS$10, SNAPSHOT_KEYS$7, COMMAND_TYPES$8, PelletEncounter;
function init_special_projectiles_pellets() {
	return (init_special_projectiles_pellets = __esmMin((() => {
		init_damage();
		init_spatial();
		init_targeting();
		init_combat_effect_feed();
		init_schema();
		DEFINITIONS$6 = [{
			id: "scatterguard",
			displayName: "Scatterguard",
			cost: 4,
			kind: "unit",
			rarity: "special",
			hitpoints: 838,
			damage: 84,
			hitSpeedTicks: 132,
			firstHitTicks: 84,
			deployTimeTicks: 60,
			rangeMillitiles: 4e3,
			sightRangeMillitiles: 5500,
			movementMillitilesPerSecond: 1e3,
			targetMode: "ground-and-air",
			count: 1,
			areaDamageRadiusMillitiles: 70,
			components: []
		}];
		QUESTION_SOURCE$2 = "unsourced-fixed-fan-pellet-volley-fixture";
		QUESTION_FIXTURES$1 = deepFreeze$1({
			aggregateDamageOrderRule: question$2("pellet-id-order;targets-first-contact-pellet-id-order"),
			areaDamageRadiusMillitiles: question$2(70),
			attackerDeathAfterLaunchRule: question$2("launched-volley-continues"),
			attackerDeathThroughLaunchRule: question$2("cancels-volley"),
			collisionWidthMillitiles: question$2(40),
			count: question$2(1),
			damage: question$2(84),
			damagePerPellet: question$2(84),
			deployTimeTicks: question$2(60),
			firstContactObstructionRule: question$2("each-ray-stops-at-first-alive-eligible-launch-snapshot-contact"),
			firstHitTicks: question$2(84),
			hitSpeedTicks: question$2(132),
			hitpoints: question$2(838),
			interruptionAfterLaunchRule: question$2("launched-volley-continues"),
			interruptionThroughLaunchRule: question$2("cancels-volley"),
			launchSnapshotRule: question$2("positions-radii-kinds-layers-and-targetable-state-snapshot-at-launch"),
			movementMillitilesPerSecond: question$2(1e3),
			pelletCount: question$2(10),
			pelletIdRule: question$2("one-through-ten-in-ray-pattern-order"),
			pelletRangeMillitiles: question$2(4250),
			pelletSpeedMillitilesPerTick: question$2(425),
			rangeMillitiles: question$2(4e3),
			rayPattern: question$2([
				{
					x: 375,
					y: -200
				},
				{
					x: 385,
					y: -180
				},
				{
					x: 408,
					y: -119
				},
				{
					x: 416,
					y: -87
				},
				{
					x: 420,
					y: -65
				},
				{
					x: 420,
					y: 65
				},
				{
					x: 416,
					y: 87
				},
				{
					x: 408,
					y: 119
				},
				{
					x: 385,
					y: 180
				},
				{
					x: 375,
					y: 200
				}
			]),
			rayPatternNorm: question$2(425),
			sameBoundaryRule: question$2("commands-before-launch-or-impact;pellets-then-aggregate-damage-then-complete"),
			sightRangeMillitiles: question$2(5500),
			targetDeathRule: question$2("dead-before-impact-is-ineligible-and-does-not-obstruct"),
			targetEligibilityRule: question$2("alive-targetable-ground-or-air-troops-and-structures"),
			targetMode: question$2("ground-and-air"),
			volleyDamageRule: question$2("same-target-may-take-one-damage-per-contacting-pellet")
		});
		ATTACKER_ID = 101;
		ORIGIN = Object.freeze({
			x: 0,
			y: 0
		});
		LAUNCH_TICK$1 = QUESTION_FIXTURES$1.firstHitTicks.value;
		IMPACT_TICK$1 = LAUNCH_TICK$1 + Math.ceil(QUESTION_FIXTURES$1.pelletRangeMillitiles.value / QUESTION_FIXTURES$1.pelletSpeedMillitilesPerTick.value);
		MAX_TICK$10 = IMPACT_TICK$1 + 1;
		MAX_CANDIDATES$2 = 32;
		MAX_COMMANDS$10 = 24;
		MAX_REPLAY_EVENTS$1 = 256;
		MAX_SNAPSHOT_BYTES$10 = 65536;
		SETUP_KEYS$9 = [
			"aim",
			"candidates",
			"commands"
		];
		AIM_KEYS = ["x", "y"];
		CANDIDATE_KEYS$2 = [
			"alive",
			"id",
			"kind",
			"layer",
			"maxHealth",
			"position",
			"radius",
			"targetable"
		];
		COMMAND_KEYS$10 = [
			"targetId",
			"tick",
			"type"
		];
		SNAPSHOT_KEYS$7 = [
			"identity",
			"tick",
			"version"
		];
		COMMAND_TYPES$8 = /* @__PURE__ */ new Set([
			"interrupt-attacker",
			"kill-attacker",
			"kill-target"
		]);
		PelletEncounter = class PelletEncounter {
			#candidates;
			#commands;
			#commandIndex = 0;
			#damage = new DamageSystem();
			#feed = createCombatEffectFeed();
			#feedRoot = null;
			#history = [];
			#interrupted = false;
			#launched = false;
			#rays = [];
			#setup;
			#terminal = false;
			#tick = 0;
			constructor(setup = createPelletSpecialFixture()) {
				this.#setup = checkedSetup$9(setup);
				this.#candidates = this.#setup.candidates;
				this.#commands = this.#setup.commands;
				this.#damage.add(ATTACKER_ID, QUESTION_FIXTURES$1.hitpoints.value);
				for (const candidate of this.#candidates) {
					this.#damage.add(candidate.id, candidate.maxHealth);
					if (!candidate.alive) this.#damage.damage(candidate.id, candidate.maxHealth);
				}
			}
			get replay() {
				return clone$10(this.#history);
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
				return PelletEncounter.restore(this.serialize());
			}
			get state() {
				return clone$10({
					attackerAlive: !this.#damage.get(ATTACKER_ID).dead,
					candidates: this.#candidates.map((candidate) => {
						const health = this.#damage.get(candidate.id);
						return {
							alive: !health.dead,
							hitpoints: health.currentHealth,
							id: candidate.id
						};
					}),
					contacts: this.#history.filter(({ type }) => type === "pellet-contact").map(({ pelletId, targetId }) => ({
						pelletId,
						targetId
					})),
					interrupted: this.#interrupted,
					launched: this.#launched,
					phase: this.#terminal ? "terminal" : this.#launched ? "in-flight" : "winding-up",
					terminal: this.#terminal,
					tick: this.#tick
				});
			}
			step() {
				if (this.#terminal || this.#tick >= MAX_TICK$10) return [];
				const boundary = this.#tick;
				const events = [];
				this.#resolveCommands(boundary, events);
				if (boundary === LAUNCH_TICK$1) {
					if (this.#damage.get(ATTACKER_ID).dead || this.#interrupted) this.#complete(events, boundary, "launch-cancelled");
					else {
						this.#launched = true;
						this.#rays = projectedRays(this.#setup.aim);
						events.push({
							impactTick: IMPACT_TICK$1,
							origin: { ...ORIGIN },
							pellets: this.#rays.map(({ endpoint, pelletId }) => ({
								endpoint: { ...endpoint },
								pelletId
							})),
							tick: boundary,
							type: "pellet-volley-launch"
						});
					}
				} else if (boundary === IMPACT_TICK$1 && this.#launched) this.#impact(boundary, events);
				this.#tick += 1;
				this.#observeVisualEvents(events);
				if (this.#history.length + events.length > MAX_REPLAY_EVENTS$1) throw new RangeError("pellet replay exceeds its event bound");
				this.#history.push(...events);
				return clone$10(events);
			}
			stepMany(ticks) {
				if (!Number.isSafeInteger(ticks) || ticks < 0) throw new TypeError("pellet ticks must be a non-negative safe integer");
				const events = [];
				for (let index = 0; index < ticks && !this.#terminal && this.#tick < MAX_TICK$10; index += 1) events.push(...this.step());
				return events;
			}
			run(tickLimit = MAX_TICK$10) {
				if (!Number.isSafeInteger(tickLimit) || tickLimit < 0) throw new TypeError("pellet tick limit must be a non-negative safe integer");
				if (tickLimit > MAX_TICK$10) throw new RangeError("pellet tick limit exceeds its bound");
				while (!this.#terminal && this.#tick < tickLimit) this.step();
				return this.state;
			}
			serialize() {
				const serialized = canonicalJson$10({
					identity: this.#setup,
					tick: this.#tick,
					version: 1
				});
				if (serialized.length > MAX_SNAPSHOT_BYTES$10) throw new RangeError("pellet snapshot exceeds its size bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("pellet snapshot must be a string");
				if (serialized.length > MAX_SNAPSHOT_BYTES$10) throw new RangeError("pellet snapshot exceeds its size bound");
				let raw;
				try {
					raw = JSON.parse(serialized);
				} catch {
					throw new TypeError("pellet snapshot must be valid JSON");
				}
				const snapshot = exactRecord$9(raw, SNAPSHOT_KEYS$7, "pellet snapshot");
				if (snapshot.version !== 1) throw new TypeError("pellet snapshot version is unsupported");
				if (!Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0 || snapshot.tick > MAX_TICK$10) throw new TypeError("pellet snapshot.tick is invalid");
				const encounter = new PelletEncounter(snapshot.identity);
				encounter.stepMany(snapshot.tick);
				if (encounter.#tick !== snapshot.tick) throw new TypeError("pellet snapshot contains post-terminal time");
				return encounter;
			}
			#complete(events, tick, reason) {
				this.#terminal = true;
				events.push({
					contacts: [...this.#history, ...events].filter(({ type }) => type === "pellet-contact").map(({ pelletId, targetId }) => ({
						pelletId,
						targetId
					})),
					reason,
					tick,
					type: "pellet-volley-complete"
				});
			}
			#observeVisualEvents(events) {
				for (const event of events) {
					if (event.type === "pellet-volley-launch") {
						const root = appendCombatEffectRoot(this.#feed, {
							direction: "pellet",
							effectId: null,
							from: event.origin,
							impactTick: event.impactTick,
							projectileId: null,
							radius: QUESTION_FIXTURES$1.collisionWidthMillitiles.value,
							segments: event.pellets.map(({ endpoint, pelletId }) => ({
								id: pelletId,
								to: endpoint
							})),
							sequence: 1,
							sourceId: ATTACKER_ID,
							tick: event.tick,
							to: null,
							type: "projectile"
						});
						this.#feedRoot = {
							lastEventId: root.eventId,
							rootId: root.rootId
						};
						continue;
					}
					if (this.#feedRoot === null) continue;
					if (event.type === "pellet-contact") {
						const ray = this.#rays.find(({ pelletId }) => pelletId === event.pelletId);
						const child = appendCombatEffectEvent(this.#feed, {
							parentId: this.#feedRoot.lastEventId,
							payload: {
								point: ray?.endpoint ?? ORIGIN,
								status: "contact",
								subId: event.pelletId,
								targetId: event.targetId
							},
							phase: "contact",
							rootId: this.#feedRoot.rootId,
							tick: event.tick,
							type: "projectile"
						});
						this.#feedRoot.lastEventId = child.eventId;
					} else if (event.type === "pellet-damage" || event.type === "pellet-aggregate-damage") {
						if (event.type === "pellet-aggregate-damage") continue;
						const child = appendCombatEffectEvent(this.#feed, {
							parentId: this.#feedRoot.lastEventId,
							payload: {
								amount: event.amount,
								currentHealthAfter: event.currentHealthAfter,
								currentHealthBefore: event.currentHealthBefore,
								targetId: event.targetId
							},
							phase: "damage",
							rootId: this.#feedRoot.rootId,
							tick: event.tick,
							type: "projectile"
						});
						this.#feedRoot.lastEventId = child.eventId;
					} else if (event.type === "pellet-death") {
						const child = appendCombatEffectEvent(this.#feed, {
							parentId: this.#feedRoot.lastEventId,
							payload: { targetId: event.targetId },
							phase: "death",
							rootId: this.#feedRoot.rootId,
							tick: event.tick,
							type: "projectile"
						});
						this.#feedRoot.lastEventId = child.eventId;
					} else if (event.type === "pellet-volley-complete") {
						const reason = event.reason === "impact-resolved" ? "complete" : event.reason;
						const child = appendCombatEffectEvent(this.#feed, {
							parentId: this.#feedRoot.lastEventId,
							payload: { reason },
							phase: "close",
							rootId: this.#feedRoot.rootId,
							tick: event.tick,
							type: "projectile"
						});
						this.#feedRoot.lastEventId = child.eventId;
					}
				}
			}
			#impact(tick, events) {
				const contacts = [];
				for (const ray of this.#rays) {
					const contact = this.#candidates.filter((candidate) => candidate.targetable && !this.#damage.get(candidate.id).dead).map((candidate) => ({
						candidate,
						parameter: capsuleParameter(candidate, ray.endpoint)
					})).filter(({ parameter }) => parameter !== null).sort((left, right) => left.parameter < right.parameter ? -1 : left.parameter > right.parameter ? 1 : left.candidate.id - right.candidate.id)[0];
					if (contact !== void 0) {
						contacts.push({
							pelletId: ray.pelletId,
							targetId: contact.candidate.id
						});
						events.push({
							parameterNumerator: contact.parameter.toString(),
							pelletId: ray.pelletId,
							targetId: contact.candidate.id,
							tick,
							type: "pellet-contact"
						});
					}
				}
				const aggregates = [];
				for (const contact of contacts) {
					let aggregate = aggregates.find(({ targetId }) => targetId === contact.targetId);
					if (aggregate === void 0) {
						aggregate = {
							amount: 0,
							pelletIds: [],
							targetId: contact.targetId
						};
						aggregates.push(aggregate);
					}
					aggregate.amount += QUESTION_FIXTURES$1.damagePerPellet.value;
					aggregate.pelletIds.push(contact.pelletId);
				}
				for (const aggregate of aggregates) {
					events.push({
						amount: aggregate.amount,
						pelletIds: [...aggregate.pelletIds],
						targetId: aggregate.targetId,
						tick,
						type: "pellet-aggregate-damage"
					});
					const result = this.#damage.damage(aggregate.targetId, aggregate.amount);
					events.push(...result.events.map((event) => ({
						...event,
						pelletIds: [...aggregate.pelletIds],
						tick,
						type: `pellet-${event.type}`
					})));
				}
				this.#complete(events, tick, "impact-resolved");
			}
			#resolveCommands(tick, events) {
				while (this.#commands[this.#commandIndex]?.tick === tick) {
					const command = this.#commands[this.#commandIndex];
					this.#commandIndex += 1;
					const targetId = command.type === "kill-target" ? command.targetId : ATTACKER_ID;
					events.push({
						targetId,
						tick,
						type: "pellet-command",
						value: command.type
					});
					if (command.type === "interrupt-attacker") this.#interrupted = true;
					else {
						const result = this.#damage.damage(targetId, this.#damage.get(targetId).maxHealth);
						events.push(...result.events.map((event) => ({
							...event,
							tick,
							type: `external-${event.type}`
						})));
					}
				}
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/special-projectiles-reflection.js
function question$1(value) {
	return Object.freeze({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		source: QUESTION_SOURCE$1,
		value
	});
}
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
function denseArray$5(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function safeInteger(value, label, minimum = -Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError(`${label} must be a safe integer`);
	return value;
}
function checkedPosition$1(value, label) {
	const position = exactRecord$8(value, POSITION_KEYS, label);
	for (const key of POSITION_KEYS) {
		safeInteger(position[key], `${label}.${key}`);
		if (Math.abs(position[key]) > MAX_SPATIAL_MILLITILES) throw new RangeError(`${label}.${key} exceeds spatial bounds`);
	}
	return { ...position };
}
function checkedEntity(value, index) {
	const label = `reflection entity ${index}`;
	const raw = exactRecord$8(value, ENTITY_KEYS, label);
	safeInteger(raw.id, `${label}.id`, 1);
	safeInteger(raw.maxHealth, `${label}.maxHealth`, 1);
	safeInteger(raw.ownerId, `${label}.ownerId`, 1);
	safeInteger(raw.radius, `${label}.radius`, 0);
	if (raw.radius > MAX_SPATIAL_MILLITILES) throw new RangeError(`${label}.radius exceeds spatial bounds`);
	if (typeof raw.alive !== "boolean" || typeof raw.reflector !== "boolean" || typeof raw.targetable !== "boolean") throw new TypeError(`${label} flags must be booleans`);
	if (!["troop", "structure"].includes(raw.kind) || !["air", "ground"].includes(raw.layer)) throw new TypeError(`${label} kind or layer is invalid`);
	return {
		...raw,
		position: checkedPosition$1(raw.position, `${label}.position`)
	};
}
function checkedProjectile(value, index, entityById) {
	const label = `reflection projectile ${index}`;
	const raw = exactRecord$8(value, PROJECTILE_KEYS, label);
	for (const key of [
		"ownerId",
		"sourceId",
		"targetId"
	]) safeInteger(raw[key], `${label}.${key}`, 1);
	safeInteger(raw.damage, `${label}.damage`, 0);
	safeInteger(raw.radius, `${label}.radius`, 0);
	safeInteger(raw.speed, `${label}.speed`, 1);
	if (raw.radius > MAX_SPATIAL_MILLITILES || raw.speed > MAX_SPATIAL_MILLITILES) throw new RangeError(`${label} geometry exceeds bounds`);
	if (!entityById.has(raw.sourceId) || !entityById.has(raw.targetId) || raw.sourceId === raw.targetId) throw new TypeError(`${label} endpoints must name distinct entities`);
	if (entityById.get(raw.sourceId).ownerId !== raw.ownerId) throw new TypeError(`${label}.ownerId must match its source`);
	return { ...raw };
}
function checkedSetup$8(value) {
	const raw = exactRecord$8(value, SETUP_KEYS$8, "reflection setup");
	const entities = denseArray$5(raw.entities, MAX_ENTITIES, "reflection entities").map(checkedEntity).sort((a, b) => a.id - b.id);
	const entityById = new Map(entities.map((entity) => [entity.id, entity]));
	if (entityById.size !== entities.length) throw new TypeError("reflection entities must have unique IDs");
	const projectiles = denseArray$5(raw.projectiles, MAX_PROJECTILES, "reflection projectiles").map((entry, index) => checkedProjectile(entry, index, entityById)).sort((a, b) => a.sourceId - b.sourceId || a.targetId - b.targetId || a.ownerId - b.ownerId || a.damage - b.damage || a.speed - b.speed || a.radius - b.radius);
	if (new Set(projectiles.map((entry) => canonicalJson$9(entry))).size !== projectiles.length) throw new TypeError("reflection projectiles must be unique");
	const commands = denseArray$5(raw.commands, MAX_COMMANDS$9, "reflection commands").map((entry, index) => {
		const command = exactRecord$8(entry, COMMAND_KEYS$9, `reflection command ${index}`);
		if (command.type !== "kill-entity") throw new TypeError(`reflection command ${index}.type is invalid`);
		safeInteger(command.tick, `reflection command ${index}.tick`, 0);
		safeInteger(command.targetId, `reflection command ${index}.targetId`, 1);
		if (command.tick > MAX_TICK$9 || !entityById.has(command.targetId)) throw new TypeError(`reflection command ${index} is out of bounds`);
		return { ...command };
	}).sort((a, b) => a.tick - b.tick || a.targetId - b.targetId);
	for (let index = 1; index < commands.length; index += 1) if (commands[index - 1].tick === commands[index].tick && commands[index - 1].targetId === commands[index].targetId) throw new TypeError("reflection commands must be unique");
	validateProjectilePaths(entities, projectiles);
	return {
		commands,
		entities,
		projectiles
	};
}
function defaultSetup() {
	return {
		commands: [],
		entities: [
			entity(101, -4e3, 0, 1),
			entity(201, 0, 0, 2, { reflector: true }),
			entity(301, 4e3, 0, 2)
		],
		projectiles: [{
			damage: 140,
			ownerId: 1,
			radius: 0,
			sourceId: 101,
			speed: 1e3,
			targetId: 301
		}]
	};
}
function entity(id, x, y, ownerId, { alive = true, kind = "troop", layer = "ground", maxHealth = 1e3, radius = 0, reflector = false, targetable = true } = {}) {
	return {
		alive,
		id,
		kind,
		layer,
		maxHealth,
		ownerId,
		position: {
			x,
			y
		},
		radius,
		reflector,
		targetable
	};
}
function segmentCircleIntersects(start, end, center, radius) {
	const dx = BigInt(end.x) - BigInt(start.x);
	const dy = BigInt(end.y) - BigInt(start.y);
	const px = BigInt(center.x) - BigInt(start.x);
	const py = BigInt(center.y) - BigInt(start.y);
	const lengthSquared = dx * dx + dy * dy;
	const reach = BigInt(radius);
	if (lengthSquared === 0n) return px * px + py * py <= reach * reach;
	const dot = px * dx + py * dy;
	if (dot <= 0n) return px * px + py * py <= reach * reach;
	if (dot >= lengthSquared) {
		const ex = BigInt(center.x) - BigInt(end.x);
		const ey = BigInt(center.y) - BigInt(end.y);
		return ex * ex + ey * ey <= reach * reach;
	}
	const cross = px * dy - py * dx;
	return cross * cross <= reach * reach * lengthSquared;
}
function integerSquareRoot$2(value) {
	if (value < 2n) return value;
	let low = 1n;
	let high = value;
	while (low + 1n < high) {
		const middle = (low + high) / 2n;
		if (middle * middle <= value) low = middle;
		else high = middle;
	}
	return low;
}
function advance(position, target, speed) {
	const dx = BigInt(target.x) - BigInt(position.x);
	const dy = BigInt(target.y) - BigInt(position.y);
	const distanceSquared = dx * dx + dy * dy;
	const speedBig = BigInt(speed);
	if (distanceSquared <= speedBig * speedBig) return { ...target };
	const distance = integerSquareRoot$2(distanceSquared);
	if (distance * distance !== distanceSquared) throw new RangeError("projectile path length must have an exact integer magnitude");
	const nextX = BigInt(position.x) + dx * speedBig / distance;
	const nextY = BigInt(position.y) + dy * speedBig / distance;
	if (dx * speedBig % distance !== 0n || dy * speedBig % distance !== 0n) throw new RangeError("projectile step must remain on integer coordinates");
	return {
		x: Number(nextX),
		y: Number(nextY)
	};
}
function assertIntegralStepPath(start, target, speed, label) {
	const dx = BigInt(target.x) - BigInt(start.x);
	const dy = BigInt(target.y) - BigInt(start.y);
	const distanceSquared = dx * dx + dy * dy;
	const speedBig = BigInt(speed);
	if (distanceSquared <= speedBig * speedBig) return;
	const distance = integerSquareRoot$2(distanceSquared);
	if (distance * distance !== distanceSquared) throw new RangeError(`${label} must have an exact integer magnitude`);
	if (dx * speedBig % distance !== 0n || dy * speedBig % distance !== 0n) throw new RangeError(`${label} must remain on integer coordinates`);
}
function validateProjectilePaths(entities, projectiles) {
	const entityById = new Map(entities.map((entry) => [entry.id, entry]));
	for (let index = 0; index < projectiles.length; index += 1) {
		const projectile = projectiles[index];
		const source = entityById.get(projectile.sourceId);
		const target = entityById.get(projectile.targetId);
		assertIntegralStepPath(source.position, target.position, projectile.speed, `reflection projectile ${index} original path`);
		for (const reflector of entities) {
			if (!reflector.alive || !reflector.reflector || !reflector.targetable || reflector.ownerId === projectile.ownerId || reflector.id === projectile.sourceId || reflector.id === projectile.targetId || !segmentCircleIntersects(source.position, target.position, reflector.position, projectile.radius + QUESTION_FIXTURES.reflectionRadiusMillitiles.value)) continue;
			assertIntegralStepPath(reflector.position, source.position, projectile.speed, `reflection projectile ${index} reflected path via entity ${reflector.id}`);
		}
	}
}
function deepFrozenQuestionCopy() {
	return Object.freeze(Object.fromEntries(Object.entries(QUESTION_FIXTURES).map(([key, record]) => [key, Object.freeze({ ...record })])));
}
function createReflectionQuestionFixture(...args) {
	if (args.length !== 0) throw new TypeError("createReflectionQuestionFixture does not accept overrides");
	return deepFrozenQuestionCopy();
}
function createReflectionSpecialCatalog() {
	return createCardCatalog(DEFINITIONS$5);
}
function createReflectionSpecialFixture(entities = defaultSetup().entities, projectiles = defaultSetup().projectiles, commands = [], ...extra) {
	if (extra.length !== 0) throw new TypeError("createReflectionSpecialFixture received extra arguments");
	return clone$9(checkedSetup$8({
		commands,
		entities,
		projectiles
	}));
}
var DEFINITIONS$5, QUESTION_SOURCE$1, QUESTION_FIXTURES, ENTITY_KEYS, POSITION_KEYS, PROJECTILE_KEYS, COMMAND_KEYS$9, SETUP_KEYS$8, SNAPSHOT_KEYS$6, MAX_ENTITIES, MAX_PROJECTILES, MAX_COMMANDS$9, MAX_TICK$9, MAX_REPLAY_EVENTS, MAX_SNAPSHOT_BYTES$9, ReflectionEncounter;
function init_special_projectiles_reflection() {
	return (init_special_projectiles_reflection = __esmMin((() => {
		init_damage();
		init_spatial();
		init_schema();
		DEFINITIONS$5 = [{
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
		}];
		QUESTION_SOURCE$1 = "unsourced-projectile-reflection-fixture";
		QUESTION_FIXTURES = Object.freeze({
			benchmarkHitpoints: question$1(2e3),
			benchmarkDamage: question$1(140),
			benchmarkHitSpeedSeconds: question$1(.8),
			benchmarkFirstHitSeconds: question$1(.6),
			benchmarkDeployTimeSeconds: question$1(1),
			benchmarkRangeTiles: question$1(1.2),
			benchmarkSightRangeTiles: question$1(5.5),
			benchmarkMovementSpeedTilesPerSecond: question$1(1),
			benchmarkMovementSpeed: question$1("medium"),
			benchmarkTargets: question$1("ground"),
			benchmarkCount: question$1(1),
			reflectionEligibilityRule: question$1("alive-targetable-enemy-reflector-intersecting-flight-segment"),
			reflectionRadiusMillitiles: question$1(500),
			reflectionTimingRule: question$1("commands-then-reflection-before-contact-damage"),
			reflectedOwnershipRule: question$1("reflector-owner"),
			reflectedTargetRule: question$1("original-source"),
			reflectedSpeedRule: question$1("carry-parent-speed"),
			reflectedDamageRule: question$1("carry-parent-damage"),
			selfReflectionRule: question$1("source-and-current-target-ineligible"),
			loopPolicy: question$1("one-reflection-maximum"),
			maximumReflections: question$1(1),
			lifecycleRule: question$1("replace-parent-atomically"),
			eventOrderRule: question$1("commands;projectiles-by-id;reflector-by-id;contact;damage;death"),
			sourceProvenanceRule: question$1("replacement-source-is-reflector"),
			sourceDeathRule: question$1("launched-projectile-continues"),
			targetDeathRule: question$1("dead-before-contact-fizzles"),
			geometryRule: question$1("inclusive-integer-segment-circle"),
			movingTargetRule: question$1("launch-time-position-snapshots"),
			simultaneousReflectionRule: question$1("parent-projectile-id-order"),
			invalidReflectorRule: question$1("dead-friendly-untargetable-and-nonreflector-ignore"),
			integerPathDomainRule: question$1("reject-at-setup-unless-every-required-straight-leg-has-integer-tick-positions")
		});
		ENTITY_KEYS = [
			"alive",
			"id",
			"kind",
			"layer",
			"maxHealth",
			"ownerId",
			"position",
			"radius",
			"reflector",
			"targetable"
		];
		POSITION_KEYS = ["x", "y"];
		PROJECTILE_KEYS = [
			"damage",
			"ownerId",
			"radius",
			"sourceId",
			"speed",
			"targetId"
		];
		COMMAND_KEYS$9 = [
			"targetId",
			"tick",
			"type"
		];
		SETUP_KEYS$8 = [
			"commands",
			"entities",
			"projectiles"
		];
		SNAPSHOT_KEYS$6 = [
			"identity",
			"tick",
			"version"
		];
		MAX_ENTITIES = 32;
		MAX_PROJECTILES = 32;
		MAX_COMMANDS$9 = 64;
		MAX_TICK$9 = 128;
		MAX_REPLAY_EVENTS = 1024;
		MAX_SNAPSHOT_BYTES$9 = 131072;
		ReflectionEncounter = class ReflectionEncounter {
			#identity;
			#tick = 0;
			#damage;
			#entities;
			#projectiles;
			#commands;
			#commandIndex = 0;
			#nextProjectileId = 1;
			#replay = [];
			constructor(setup = defaultSetup()) {
				this.#identity = checkedSetup$8(setup);
				this.#initialize();
			}
			#initialize() {
				this.#tick = 0;
				this.#commandIndex = 0;
				this.#nextProjectileId = 1;
				this.#replay = [];
				this.#commands = clone$9(this.#identity.commands);
				this.#entities = clone$9(this.#identity.entities);
				this.#damage = new DamageSystem();
				for (const entry of this.#entities) {
					this.#damage.add(entry.id, entry.maxHealth);
					if (!entry.alive) this.#damage.damage(entry.id, entry.maxHealth);
				}
				this.#projectiles = this.#identity.projectiles.map((raw) => {
					const source = this.#entity(raw.sourceId);
					const target = this.#entity(raw.targetId);
					const projectile = {
						...raw,
						id: this.#nextProjectileId++,
						launchTick: 0,
						origin: { ...source.position },
						position: { ...source.position },
						provenance: {
							parentProjectileId: null,
							reflectionCount: 0,
							rootProjectileId: this.#nextProjectileId - 1
						},
						targetPosition: { ...target.position }
					};
					this.#replay.push({
						projectile: clone$9(projectile),
						tick: 0,
						type: "projectile-launch"
					});
					return projectile;
				});
			}
			#entity(id) {
				return this.#entities.find((entry) => entry.id === id);
			}
			get replay() {
				return clone$9(this.#replay);
			}
			get state() {
				return clone$9({
					entities: this.#entities.map((entry) => ({
						...entry,
						hitpoints: this.#damage.get(entry.id).currentHealth
					})),
					nextProjectileId: this.#nextProjectileId,
					projectiles: this.#projectiles,
					tick: this.#tick
				});
			}
			serialize() {
				const serialized = canonicalJson$9({
					identity: this.#identity,
					tick: this.#tick,
					version: 1
				});
				if (serialized.length > MAX_SNAPSHOT_BYTES$9) throw new RangeError("reflection snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("serialized reflection encounter must be a string");
				if (serialized.length > MAX_SNAPSHOT_BYTES$9) throw new RangeError("serialized reflection encounter is oversized");
				let raw;
				try {
					raw = JSON.parse(serialized);
				} catch {
					throw new TypeError("serialized reflection encounter must be valid JSON");
				}
				const snapshot = exactRecord$8(raw, SNAPSHOT_KEYS$6, "reflection snapshot");
				if (snapshot.version !== 1) throw new TypeError("reflection snapshot has an unsupported version");
				safeInteger(snapshot.tick, "reflection snapshot.tick", 0);
				if (snapshot.tick > MAX_TICK$9) throw new RangeError("reflection snapshot tick exceeds its bound");
				const encounter = new ReflectionEncounter(checkedSetup$8(snapshot.identity));
				encounter.stepMany(snapshot.tick);
				if (encounter.serialize() !== serialized) throw new TypeError("reflection snapshot is not canonical");
				return encounter;
			}
			#stagedCopy() {
				const staged = new ReflectionEncounter(this.#identity);
				staged.#identity = clone$9(this.#identity);
				staged.#tick = this.#tick;
				staged.#damage = DamageSystem.restore(this.#damage.serialize());
				staged.#entities = clone$9(this.#entities);
				staged.#projectiles = clone$9(this.#projectiles);
				staged.#commands = clone$9(this.#commands);
				staged.#commandIndex = this.#commandIndex;
				staged.#nextProjectileId = this.#nextProjectileId;
				staged.#replay = clone$9(this.#replay);
				return staged;
			}
			#commit(staged) {
				this.#identity = staged.#identity;
				this.#tick = staged.#tick;
				this.#damage = staged.#damage;
				this.#entities = staged.#entities;
				this.#projectiles = staged.#projectiles;
				this.#commands = staged.#commands;
				this.#commandIndex = staged.#commandIndex;
				this.#nextProjectileId = staged.#nextProjectileId;
				this.#replay = staged.#replay;
			}
			stepMany(count) {
				safeInteger(count, "reflection step count", 0);
				if (this.#tick + count > MAX_TICK$9) throw new RangeError("reflection execution exceeds its bound");
				const staged = this.#stagedCopy();
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...staged.#stepUnchecked());
				this.#commit(staged);
				return clone$9(events);
			}
			run(limit = MAX_TICK$9) {
				safeInteger(limit, "reflection run limit", 0);
				if (limit > MAX_TICK$9) throw new RangeError("reflection run exceeds its bound");
				const staged = this.#stagedCopy();
				while (staged.#projectiles.length > 0 && staged.#tick < limit) staged.#stepUnchecked();
				this.#commit(staged);
				return this.replay;
			}
			step() {
				const staged = this.#stagedCopy();
				const events = staged.#stepUnchecked();
				this.#commit(staged);
				return clone$9(events);
			}
			#stepUnchecked() {
				if (this.#tick >= MAX_TICK$9) throw new RangeError("reflection tick space is exhausted");
				const tick = this.#tick + 1;
				const events = [];
				while (this.#commands[this.#commandIndex]?.tick === tick) {
					const command = this.#commands[this.#commandIndex++];
					events.push({
						targetId: command.targetId,
						tick,
						type: "reflection-command"
					});
					const health = this.#damage.get(command.targetId);
					const result = this.#damage.damage(command.targetId, health.maxHealth);
					events.push(...result.events.map((event) => ({
						...event,
						tick,
						type: `external-${event.type}`
					})));
				}
				const survivors = [];
				const replacements = [];
				for (const projectile of [...this.#projectiles].sort((a, b) => a.id - b.id)) {
					if (this.#damage.get(projectile.targetId).currentHealth === 0) {
						events.push({
							projectileId: projectile.id,
							status: "target-dead",
							tick,
							type: "projectile-fizzle"
						});
						continue;
					}
					const next = advance(projectile.position, projectile.targetPosition, projectile.speed);
					const reflector = projectile.provenance.reflectionCount < QUESTION_FIXTURES.maximumReflections.value ? this.#entities.filter((candidate) => {
						const health = this.#damage.get(candidate.id);
						return candidate.reflector && candidate.targetable && health.currentHealth > 0 && candidate.ownerId !== projectile.ownerId && candidate.id !== projectile.sourceId && candidate.id !== projectile.targetId && segmentCircleIntersects(projectile.position, next, candidate.position, projectile.radius + QUESTION_FIXTURES.reflectionRadiusMillitiles.value);
					}).sort((a, b) => a.id - b.id)[0] : void 0;
					if (reflector !== void 0) {
						const reflectedTarget = this.#entity(projectile.sourceId);
						const replacement = {
							damage: projectile.damage,
							id: this.#nextProjectileId++,
							launchTick: tick,
							origin: { ...reflector.position },
							ownerId: reflector.ownerId,
							position: { ...reflector.position },
							provenance: {
								parentProjectileId: projectile.id,
								reflectionCount: projectile.provenance.reflectionCount + 1,
								rootProjectileId: projectile.provenance.rootProjectileId
							},
							radius: projectile.radius,
							sourceId: reflector.id,
							speed: projectile.speed,
							targetId: reflectedTarget.id,
							targetPosition: { ...reflectedTarget.position }
						};
						replacements.push(replacement);
						events.push({
							parentProjectileId: projectile.id,
							projectile: clone$9(replacement),
							reflectorId: reflector.id,
							tick,
							type: "projectile-reflection"
						});
						continue;
					}
					if (segmentCircleIntersects(projectile.position, next, projectile.targetPosition, projectile.radius + this.#entity(projectile.targetId).radius)) {
						events.push({
							projectileId: projectile.id,
							targetId: projectile.targetId,
							tick,
							type: "projectile-contact"
						});
						const result = this.#damage.damage(projectile.targetId, projectile.damage);
						events.push(...result.events.map((event) => ({
							...event,
							projectileId: projectile.id,
							tick,
							type: `projectile-${event.type}`
						})));
						continue;
					}
					projectile.position = next;
					survivors.push(projectile);
				}
				this.#projectiles = [...survivors, ...replacements].sort((a, b) => a.id - b.id);
				this.#tick = tick;
				this.#replay.push(...events);
				if (this.#replay.length > MAX_REPLAY_EVENTS) throw new RangeError("reflection replay exceeds its bound");
				return clone$9(events);
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/special-movement-charge.js
function exactRecord$7(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$4(value, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX_COMMANDS$8) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function safeTick(value, label) {
	if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer`);
	if (value >= MAX_TICK$8) throw new RangeError(`${label} exceeds the encounter bound`);
}
function checkedCommands$8(value) {
	const commands = denseArray$4(value, "charge commands").map((entry, index) => {
		const command = exactRecord$7(entry, COMMAND_KEYS$8, `charge command ${index}`);
		safeTick(command.tick, `charge command ${index}.tick`);
		if (!COMMAND_TYPES$7.has(command.type)) throw new TypeError(`charge command ${index}.type is invalid`);
		return {
			tick: command.tick,
			type: command.type
		};
	});
	let available = true;
	let priorTick = -1;
	for (const command of commands) {
		if (command.tick <= priorTick) throw new TypeError("charge commands must have unique increasing ticks");
		const expected = available ? "target-lost" : "target-acquired";
		if (command.type !== expected) throw new TypeError("charge commands must causally alternate target state");
		available = !available;
		priorTick = command.tick;
	}
	return commands;
}
function checkedSetup$7(value) {
	return { commands: checkedCommands$8(exactRecord$7(value, SETUP_KEYS$7, "charge setup").commands) };
}
function canonicalJson$8(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$8).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$8(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function clone$8(value) {
	return JSON.parse(JSON.stringify(value));
}
function fixedIdentity$4(commands) {
	return {
		commands: commands.map((command) => ({ ...command })),
		encounter: IDENTITY$2.encounter
	};
}
function positionAtDistance$1(route, distance) {
	let remaining = distance;
	for (let index = 1; index < route.length; index += 1) {
		const from = route[index - 1];
		const to = route[index];
		const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
		if (remaining <= length) return {
			x: from.x + Math.sign(to.x - from.x) * remaining,
			y: from.y + Math.sign(to.y - from.y) * remaining
		};
		remaining -= length;
	}
	return { ...route.at(-1) };
}
function reached$1(position, range) {
	const dx = BigInt(position.x - IDENTITY$2.target.position.x);
	const dy = BigInt(position.y - IDENTITY$2.target.position.y);
	const limit = BigInt(range + IDENTITY$2.unit.radius + IDENTITY$2.target.radius);
	return dx * dx + dy * dy <= limit * limit;
}
/**
* Returns the original Emberlance definition. Its combat numbers are
* question-backed research fixtures, not authoritative special-mechanic
* claims.
*/
function createChargeSpecialCatalog() {
	return createCardCatalog(DEFINITIONS$4);
}
/**
* Creates a bounded causal target-availability schedule for the fixed
* west-bridge encounter.
*/
function createChargeSpecialFixture(commands = []) {
	return clone$8(checkedSetup$7({ commands }));
}
/**
* Evaluates the exact arm boundary without allowing callers to replace any
* QUESTION_FIXTURE value. This is a narrow executable description of the
* unsourced special-mechanic assumption, not an authoritative game claim.
*/
function evaluateChargeQuestionBoundary(distanceMillitiles, ...extra) {
	if (extra.length !== 0 || !Number.isSafeInteger(distanceMillitiles) || distanceMillitiles < 0) throw new TypeError("charge boundary distance must be one non-negative safe integer");
	const armed = distanceMillitiles >= QUESTION_RUNTIME$3.armDistanceMillitiles;
	const bonusAmount = armed ? QUESTION_RUNTIME$3.bonusDamage : 0;
	return {
		armed,
		movementMillitilesPerSecond: armed ? QUESTION_RUNTIME$3.chargedMovementMillitilesPerSecond : DEFINITIONS$4[0].movementMillitilesPerSecond,
		strike: {
			amount: DEFINITIONS$4[0].damage + bonusAmount,
			baseAmount: DEFINITIONS$4[0].damage,
			bonusAmount
		}
	};
}
var createChargeQuestionFixture, DEFINITIONS$4, WEST_LANE_X, IDENTITY$2, COMMAND_KEYS$8, COMMAND_TYPES$7, SETUP_KEYS$7, SNAPSHOT_KEYS$5, IDENTITY_KEYS$1, MAX_COMMANDS$8, MAX_SNAPSHOT_BYTES$8, MAX_TICK$8, QUESTION_RUNTIME$3, ChargeSpecialEncounter;
function init_special_movement_charge() {
	return (init_special_movement_charge = __esmMin((() => {
		init_attack_cycle();
		init_damage();
		init_movement();
		init_pathfinding();
		init_schema();
		init_session_troop_movement_question_authority();
		createChargeQuestionFixture = createChargeQuestionFixture$1;
		DEFINITIONS$4 = [{
			id: "emberlance",
			displayName: "Emberlance",
			cost: 5,
			kind: "unit",
			rarity: "special",
			hitpoints: 1920,
			damage: 392,
			hitSpeedTicks: 84,
			firstHitTicks: 54,
			deployTimeTicks: 60,
			rangeMillitiles: 1600,
			sightRangeMillitiles: 5500,
			movementMillitilesPerSecond: 1e3,
			targetMode: "ground",
			count: 1,
			areaDamageRadiusMillitiles: null,
			components: []
		}];
		WEST_LANE_X = 3500;
		IDENTITY$2 = Object.freeze({
			encounter: "west-bridge-charge-v1",
			target: Object.freeze({
				hitpoints: 5e3,
				id: 202,
				position: Object.freeze({
					x: WEST_LANE_X,
					y: 18500
				}),
				radius: 0
			}),
			unit: Object.freeze({
				cardId: "emberlance",
				id: 101,
				position: Object.freeze({
					x: WEST_LANE_X,
					y: 11500
				}),
				radius: 0
			})
		});
		COMMAND_KEYS$8 = ["tick", "type"];
		COMMAND_TYPES$7 = /* @__PURE__ */ new Set(["target-acquired", "target-lost"]);
		SETUP_KEYS$7 = ["commands"];
		SNAPSHOT_KEYS$5 = [
			"identity",
			"tick",
			"version"
		];
		IDENTITY_KEYS$1 = ["commands", "encounter"];
		MAX_COMMANDS$8 = 32;
		MAX_SNAPSHOT_BYTES$8 = 8192;
		MAX_TICK$8 = 1e3;
		QUESTION_RUNTIME$3 = CHARGE_QUESTION_VALUES;
		ChargeSpecialEncounter = class ChargeSpecialEncounter {
			#attack;
			#card;
			#chargeProgress = 0;
			#charged = false;
			#commands;
			#commandIndex = 0;
			#damage;
			#history = [];
			#movement;
			#position = { ...IDENTITY$2.unit.position };
			#route;
			#targetAvailable = true;
			#targetId = null;
			#terminal = false;
			#tick = 0;
			constructor(setup = createChargeSpecialFixture()) {
				const checked = checkedSetup$7(setup);
				this.#commands = checked.commands;
				this.#card = createChargeSpecialCatalog()[0];
				this.#route = findGroundPath(IDENTITY$2.unit.position, IDENTITY$2.target.position);
				if (this.#route === null) throw new RangeError("charge encounter route is unavailable");
				this.#movement = createMovementState({
					direction: 1,
					position: 0,
					remainder: 0,
					speed: this.#card.movementMillitilesPerSecond
				});
				this.#attack = new AttackCycle({
					deployTicks: this.#card.deployTimeTicks,
					firstHitTicks: this.#card.firstHitTicks,
					hitSpeedTicks: this.#card.hitSpeedTicks
				});
				this.#damage = new DamageSystem();
				this.#damage.add(IDENTITY$2.target.id, IDENTITY$2.target.hitpoints);
			}
			get replay() {
				return clone$8(this.#history);
			}
			get route() {
				return clone$8(this.#route);
			}
			get state() {
				let phase;
				if (this.#terminal) phase = "terminal";
				else if (this.#attack.state.phase === "deploying") phase = "deploying";
				else if (!this.#targetAvailable) phase = "inert";
				else if (reached$1(this.#position, this.#card.rangeMillitiles)) phase = this.#attack.state.phase;
				else phase = this.#charged ? "charged-moving" : "moving";
				return clone$8({
					attack: this.#attack.state,
					chargeProgressMillitiles: this.#chargeProgress,
					charged: this.#charged,
					movement: this.#movement,
					phase,
					position: this.#position,
					targetHealth: this.#damage.get(IDENTITY$2.target.id),
					targetId: this.#targetId,
					terminal: this.#terminal,
					tick: this.#tick
				});
			}
			step() {
				if (this.#terminal || this.#tick >= MAX_TICK$8) return [];
				const boundary = this.#tick;
				const events = [];
				let interrupted = false;
				const command = this.#commands[this.#commandIndex];
				if (command?.tick === boundary) {
					this.#commandIndex += 1;
					this.#targetAvailable = command.type === "target-acquired";
					interrupted = !this.#targetAvailable;
				}
				const selectedId = this.#targetAvailable ? IDENTITY$2.target.id : null;
				if (selectedId !== this.#targetId) {
					this.#targetId = selectedId;
					events.push({
						targetId: selectedId,
						tick: boundary,
						type: selectedId === null ? "target-lost" : "target-acquired"
					});
				}
				if (interrupted) {
					const hadCharge = this.#charged || this.#chargeProgress > 0;
					this.#chargeProgress = 0;
					this.#charged = false;
					this.#movement = createMovementState({
						direction: 0,
						position: this.#movement.position,
						remainder: 0,
						speed: 0
					});
					if (hadCharge) events.push({
						tick: boundary,
						type: "charge-reset"
					});
				} else if (this.#targetAvailable && this.#movement.direction === 0 && !reached$1(this.#position, this.#card.rangeMillitiles)) this.#movement = createMovementState({
					direction: 1,
					position: this.#movement.position,
					remainder: 0,
					speed: this.#card.movementMillitilesPerSecond
				});
				let isReached = this.#targetAvailable && reached$1(this.#position, this.#card.rangeMillitiles);
				if (!interrupted && boundary >= this.#card.deployTimeTicks && this.#targetAvailable && !isReached) {
					const priorDistance = this.#movement.position;
					this.#movement = advanceMovement(this.#movement);
					const travelled = this.#movement.position - priorDistance;
					this.#chargeProgress += travelled;
					this.#position = positionAtDistance$1(this.#route, this.#movement.position);
					isReached = reached$1(this.#position, this.#card.rangeMillitiles);
					events.push({
						position: { ...this.#position },
						tick: boundary,
						type: "move"
					});
					if (!this.#charged && this.#chargeProgress >= QUESTION_RUNTIME$3.armDistanceMillitiles) {
						this.#charged = true;
						this.#movement = createMovementState({
							direction: 1,
							position: this.#movement.position,
							remainder: this.#movement.remainder,
							speed: QUESTION_RUNTIME$3.chargedMovementMillitilesPerSecond
						});
						events.push({
							distanceMillitiles: QUESTION_RUNTIME$3.armDistanceMillitiles,
							tick: boundary,
							type: "charge-armed"
						});
					}
					if (isReached) events.push({
						position: { ...this.#position },
						targetId: IDENTITY$2.target.id,
						tick: boundary,
						type: "reached"
					});
				}
				const ready = this.#attack.step({
					targetEligible: isReached && this.#targetAvailable,
					targetId: isReached && this.#targetAvailable ? IDENTITY$2.target.id : null
				});
				for (const event of ready) {
					const chargedStrike = this.#charged;
					const bonus = chargedStrike ? QUESTION_RUNTIME$3.bonusDamage : 0;
					const amount = this.#card.damage + bonus;
					const result = this.#damage.damage(event.targetId, amount);
					events.push({
						amount,
						baseAmount: this.#card.damage,
						bonusAmount: bonus,
						charged: chargedStrike,
						currentHealth: result.currentHealth,
						sequence: event.sequence,
						targetId: event.targetId,
						tick: event.tick,
						type: "attack"
					});
					if (chargedStrike) {
						this.#charged = false;
						this.#chargeProgress = 0;
						this.#movement = createMovementState({
							direction: 1,
							position: this.#movement.position,
							remainder: this.#movement.remainder,
							speed: this.#card.movementMillitilesPerSecond
						});
						events.push({
							tick: event.tick,
							type: "charge-consumed"
						});
					}
					this.#terminal = true;
					events.push({
						tick: event.tick,
						type: "encounter-complete"
					});
				}
				this.#tick += 1;
				this.#history.push(...events);
				return clone$8(events);
			}
			stepMany(ticks) {
				if (!Number.isSafeInteger(ticks) || ticks < 0) throw new TypeError("charge ticks must be a non-negative safe integer");
				const events = [];
				for (let index = 0; index < ticks && !this.#terminal && this.#tick < MAX_TICK$8; index += 1) events.push(...this.step());
				return events;
			}
			run(tickLimit = MAX_TICK$8) {
				if (!Number.isSafeInteger(tickLimit) || tickLimit < 0) throw new TypeError("charge tick limit must be a non-negative safe integer");
				if (tickLimit > MAX_TICK$8) throw new RangeError("charge tick limit exceeds its bound");
				while (!this.#terminal && this.#tick < tickLimit) this.step();
				return this.state;
			}
			serialize() {
				const serialized = canonicalJson$8({
					identity: fixedIdentity$4(this.#commands),
					tick: this.#tick,
					version: 1
				});
				if (serialized.length > MAX_SNAPSHOT_BYTES$8) throw new RangeError("charge snapshot exceeds its size bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("charge snapshot must be a string");
				if (serialized.length > MAX_SNAPSHOT_BYTES$8) throw new RangeError("charge snapshot exceeds its size bound");
				let snapshot;
				try {
					snapshot = JSON.parse(serialized);
				} catch {
					throw new TypeError("charge snapshot must be valid JSON");
				}
				const checked = exactRecord$7(snapshot, SNAPSHOT_KEYS$5, "charge snapshot");
				if (checked.version !== 1) throw new TypeError("charge snapshot version is unsupported");
				if (!Number.isSafeInteger(checked.tick) || checked.tick < 0) throw new TypeError("charge snapshot.tick is invalid");
				if (checked.tick > MAX_TICK$8) throw new RangeError("charge snapshot exceeds its causal bound");
				const identity = exactRecord$7(checked.identity, IDENTITY_KEYS$1, "charge snapshot.identity");
				if (identity.encounter !== IDENTITY$2.encounter) throw new TypeError("charge snapshot identity is unsupported");
				const encounter = new ChargeSpecialEncounter({ commands: checkedCommands$8(identity.commands) });
				encounter.stepMany(checked.tick);
				if (encounter.#tick !== checked.tick) throw new TypeError("charge snapshot contains post-terminal time");
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/special-movement-dash.js
function clone$7(value) {
	return JSON.parse(JSON.stringify(value));
}
function canonicalJson$7(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$7).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$7(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord$6(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseCommands$2(value) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX_COMMANDS$7) throw new TypeError("dash commands must be a bounded plain array");
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError("dash commands must contain dense data properties");
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function checkedCommands$7(value) {
	return denseCommands$2(value).map((entry, index) => {
		const command = exactRecord$6(entry, COMMAND_KEYS$7, `dash command ${index}`);
		if (!Number.isSafeInteger(command.tick) || command.tick < 0 || command.tick >= MAX_TICK$7) throw new TypeError(`dash command ${index}.tick is outside the encounter`);
		if (!COMMAND_TYPES$6.has(command.type)) throw new TypeError(`dash command ${index}.type is invalid`);
		if (command.type === "target-lost" && command.tick >= 60) throw new TypeError("target-lost must causally precede dash launch");
		if (command.type === "interrupt" && (command.tick < 60 || command.tick >= 90)) throw new TypeError("interrupt must causally occur at launch or during dash transit");
		if (command.type === "target-killed" && command.tick >= 90) throw new TypeError("target-killed must causally occur while the target is alive");
		return {
			tick: command.tick,
			type: command.type
		};
	});
}
function checkedSetup$6(value) {
	return { commands: checkedCommands$7(exactRecord$6(value, SETUP_KEYS$6, "dash setup").commands) };
}
function fixedIdentity$3(commands) {
	return {
		commands: commands.map((command) => ({ ...command })),
		encounter: IDENTITY$1.encounter
	};
}
function interpolatePosition$1(from, to, elapsed, total) {
	const checkedFrom = validatePosition(from, "dash interpolation start");
	const checkedTo = validatePosition(to, "dash interpolation end");
	const fraction = BigInt(elapsed);
	const divisor = BigInt(total);
	return {
		x: checkedFrom.x + Number(BigInt(checkedTo.x - checkedFrom.x) * fraction / divisor),
		y: checkedFrom.y + Number(BigInt(checkedTo.y - checkedFrom.y) * fraction / divisor)
	};
}
/**
* Returns the isolated original Veilrunner definition. The benchmark-backed
* combat fields are comparison questions where their research source marks
* them unverified.
*/
function createDashSpecialCatalog() {
	return createCardCatalog(DEFINITIONS$3);
}
/**
* Creates the only caller-controlled input: at most one bounded causal event.
* Mechanics, entities, positions, and timing cannot be overridden.
*/
function createDashSpecialFixture(commands = []) {
	return clone$7(checkedSetup$6({ commands }));
}
/**
* Pure inclusive launch-boundary evaluator for the QUESTION fixture.
*/
function evaluateDashQuestionBoundary(distanceMillitiles, ...extra) {
	if (extra.length !== 0 || !Number.isSafeInteger(distanceMillitiles) || distanceMillitiles < 0) throw new TypeError("dash boundary distance must be one non-negative safe integer");
	return {
		eligible: distanceMillitiles >= QUESTION_RUNTIME$2.launchMinimumMillitiles && distanceMillitiles <= QUESTION_RUNTIME$2.launchMaximumMillitiles,
		launchMaximumMillitiles: QUESTION_RUNTIME$2.launchMaximumMillitiles,
		launchMinimumMillitiles: QUESTION_RUNTIME$2.launchMinimumMillitiles
	};
}
var createDashQuestionFixture, DEFINITIONS$3, IDENTITY$1, COMMAND_KEYS$7, COMMAND_TYPES$6, SETUP_KEYS$6, SNAPSHOT_KEYS$4, SNAPSHOT_IDENTITY_KEYS$2, MAX_COMMANDS$7, MAX_SNAPSHOT_BYTES$7, MAX_TICK$7, QUESTION_RUNTIME$2, DashEncounter;
function init_special_movement_dash() {
	return (init_special_movement_dash = __esmMin((() => {
		init_damage();
		init_targeting();
		init_spatial();
		init_schema();
		init_session_troop_movement_question_authority();
		createDashQuestionFixture = createDashQuestionFixture$1;
		DEFINITIONS$3 = [{
			id: "veilrunner",
			displayName: "Veilrunner",
			cost: 3,
			kind: "unit",
			rarity: "mythic",
			hitpoints: 907,
			damage: 193,
			hitSpeedTicks: 60,
			firstHitTicks: 36,
			deployTimeTicks: 60,
			rangeMillitiles: 750,
			sightRangeMillitiles: 6e3,
			movementMillitilesPerSecond: 1500,
			targetMode: "ground",
			count: 1,
			areaDamageRadiusMillitiles: null,
			components: []
		}];
		IDENTITY$1 = Object.freeze({
			encounter: "northbound-targeted-dash-v1",
			target: Object.freeze({
				hitpoints: 1e3,
				id: 202,
				kind: "troop",
				layer: "ground",
				position: Object.freeze({
					x: 3500,
					y: 16500
				}),
				radius: 0
			}),
			unit: Object.freeze({
				id: 101,
				position: Object.freeze({
					x: 3500,
					y: 11500
				}),
				radius: 0
			})
		});
		COMMAND_KEYS$7 = ["tick", "type"];
		COMMAND_TYPES$6 = /* @__PURE__ */ new Set([
			"interrupt",
			"target-killed",
			"target-lost"
		]);
		SETUP_KEYS$6 = ["commands"];
		SNAPSHOT_KEYS$4 = [
			"identity",
			"tick",
			"version"
		];
		SNAPSHOT_IDENTITY_KEYS$2 = ["commands", "encounter"];
		MAX_COMMANDS$7 = 1;
		MAX_SNAPSHOT_BYTES$7 = 4096;
		MAX_TICK$7 = 100;
		QUESTION_RUNTIME$2 = DASH_QUESTION_VALUES;
		DashEncounter = class DashEncounter {
			#card;
			#commands;
			#commandIndex = 0;
			#damage;
			#history = [];
			#launch = null;
			#position = { ...IDENTITY$1.unit.position };
			#targetAlive = true;
			#targetId = null;
			#targetable = true;
			#terminal = false;
			#tick = 0;
			constructor(setup = createDashSpecialFixture()) {
				const checked = checkedSetup$6(setup);
				this.#commands = checked.commands;
				this.#card = createDashSpecialCatalog()[0];
				this.#damage = new DamageSystem();
				this.#damage.add(IDENTITY$1.target.id, IDENTITY$1.target.hitpoints);
			}
			get replay() {
				return clone$7(this.#history);
			}
			get state() {
				return clone$7({
					inTransit: this.#launch !== null,
					launch: this.#launch,
					phase: this.#terminal ? "terminal" : this.#launch !== null ? "transit" : this.#tick < this.#card.deployTimeTicks ? "deploying" : "ready",
					position: this.#position,
					targetAlive: this.#targetAlive,
					targetHealth: this.#damage.get(IDENTITY$1.target.id).currentHealth,
					targetId: this.#targetId,
					targetable: this.#targetable,
					terminal: this.#terminal,
					tick: this.#tick
				});
			}
			step() {
				if (this.#terminal || this.#tick >= MAX_TICK$7) return [];
				const boundary = this.#tick;
				const events = [];
				const command = this.#commands[this.#commandIndex];
				if (command?.tick === boundary) {
					this.#commandIndex += 1;
					if (command.type === "target-lost") {
						this.#targetId = null;
						this.#terminal = true;
						events.push({
							reason: "target-lost-before-launch",
							targetId: IDENTITY$1.target.id,
							tick: boundary,
							type: "dash-cancelled"
						});
					} else if (command.type === "interrupt") {
						this.#launch = null;
						this.#targetable = true;
						this.#terminal = true;
						if (boundary === this.#card.deployTimeTicks) events.push({
							phase: "prelaunch",
							position: { ...this.#position },
							targetId: this.#targetId,
							tick: boundary,
							type: "dash-interrupted"
						});
						else {
							events.push({
								position: { ...this.#position },
								tick: boundary,
								type: "dash-interrupted"
							});
							events.push({
								targetable: true,
								tick: boundary,
								type: "targetability-changed"
							});
						}
					} else {
						const result = this.#damage.damage(IDENTITY$1.target.id, IDENTITY$1.target.hitpoints);
						this.#targetAlive = false;
						events.push({
							currentHealth: result.currentHealth,
							targetId: IDENTITY$1.target.id,
							tick: boundary,
							type: "target-died"
						});
						if (boundary <= this.#card.deployTimeTicks) {
							this.#terminal = true;
							events.push({
								reason: "target-killed-before-launch",
								targetId: IDENTITY$1.target.id,
								tick: boundary,
								type: "dash-cancelled"
							});
						}
					}
				}
				if (!this.#terminal && boundary === 0) {
					const selected = acquireTarget({
						position: this.#position,
						radius: IDENTITY$1.unit.radius
					}, [{
						alive: this.#targetAlive,
						id: IDENTITY$1.target.id,
						kind: IDENTITY$1.target.kind,
						layer: IDENTITY$1.target.layer,
						position: IDENTITY$1.target.position,
						radius: IDENTITY$1.target.radius,
						targetable: true
					}], {
						mode: "ground",
						sightRange: this.#card.sightRangeMillitiles
					});
					this.#targetId = selected?.id ?? null;
					if (selected !== null) events.push({
						targetId: selected.id,
						tick: boundary,
						type: "target-acquired"
					});
				}
				if (!this.#terminal && boundary === this.#card.deployTimeTicks) {
					const distance = Math.abs(IDENTITY$1.target.position.x - this.#position.x) + Math.abs(IDENTITY$1.target.position.y - this.#position.y);
					if (this.#targetId === null || !evaluateDashQuestionBoundary(distance).eligible) {
						this.#terminal = true;
						events.push({
							reason: "no-eligible-target",
							tick: boundary,
							type: "dash-cancelled"
						});
					} else {
						this.#launch = {
							elapsedTicks: 0,
							from: { ...this.#position },
							targetId: this.#targetId,
							to: { ...IDENTITY$1.target.position }
						};
						this.#targetable = false;
						events.push({
							from: { ...this.#launch.from },
							targetId: this.#launch.targetId,
							tick: boundary,
							to: { ...this.#launch.to },
							type: "dash-launched"
						});
						events.push({
							targetable: false,
							tick: boundary,
							type: "targetability-changed"
						});
					}
				}
				if (!this.#terminal && this.#launch !== null) {
					this.#launch.elapsedTicks += 1;
					this.#position = interpolatePosition$1(this.#launch.from, this.#launch.to, this.#launch.elapsedTicks, QUESTION_RUNTIME$2.transitTicks);
					events.push({
						elapsedTicks: this.#launch.elapsedTicks,
						position: { ...this.#position },
						tick: boundary,
						type: "dash-move"
					});
					if (this.#launch.elapsedTicks === QUESTION_RUNTIME$2.transitTicks) {
						const targetId = this.#launch.targetId;
						this.#launch = null;
						this.#targetable = true;
						events.push({
							targetable: true,
							tick: boundary,
							type: "targetability-changed"
						});
						events.push({
							position: { ...this.#position },
							targetId,
							tick: boundary,
							type: "dash-arrived"
						});
						if (this.#targetAlive) {
							const amount = this.#card.damage + QUESTION_RUNTIME$2.bonusDamage;
							const result = this.#damage.damage(targetId, amount);
							events.push({
								amount,
								baseAmount: this.#card.damage,
								bonusAmount: QUESTION_RUNTIME$2.bonusDamage,
								currentHealth: result.currentHealth,
								targetId,
								tick: boundary,
								type: "dash-damage"
							});
						} else events.push({
							reason: "snapshotted-target-dead",
							targetId,
							tick: boundary,
							type: "dash-damage-skipped"
						});
						this.#terminal = true;
						events.push({
							tick: boundary,
							type: "encounter-complete"
						});
					}
				}
				this.#tick += 1;
				this.#history.push(...events);
				return clone$7(events);
			}
			stepMany(ticks) {
				if (!Number.isSafeInteger(ticks) || ticks < 0) throw new TypeError("dash ticks must be a non-negative safe integer");
				const events = [];
				for (let index = 0; index < ticks && !this.#terminal && this.#tick < MAX_TICK$7; index += 1) events.push(...this.step());
				return events;
			}
			run(tickLimit = MAX_TICK$7) {
				if (!Number.isSafeInteger(tickLimit) || tickLimit < 0) throw new TypeError("dash tick limit must be a non-negative safe integer");
				if (tickLimit > MAX_TICK$7) throw new RangeError("dash tick limit exceeds its bound");
				while (!this.#terminal && this.#tick < tickLimit) this.step();
				return this.state;
			}
			serialize() {
				const serialized = canonicalJson$7({
					identity: fixedIdentity$3(this.#commands),
					tick: this.#tick,
					version: 1
				});
				if (serialized.length > MAX_SNAPSHOT_BYTES$7) throw new RangeError("dash snapshot exceeds its size bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("dash snapshot must be a string");
				if (serialized.length > MAX_SNAPSHOT_BYTES$7) throw new RangeError("dash snapshot exceeds its size bound");
				let snapshot;
				try {
					snapshot = JSON.parse(serialized);
				} catch {
					throw new TypeError("dash snapshot must be valid JSON");
				}
				const checked = exactRecord$6(snapshot, SNAPSHOT_KEYS$4, "dash snapshot");
				if (checked.version !== 1) throw new TypeError("dash snapshot version is unsupported");
				if (!Number.isSafeInteger(checked.tick) || checked.tick < 0 || checked.tick > MAX_TICK$7) throw new TypeError("dash snapshot.tick is invalid");
				const identity = exactRecord$6(checked.identity, SNAPSHOT_IDENTITY_KEYS$2, "dash snapshot.identity");
				if (identity.encounter !== IDENTITY$1.encounter) throw new TypeError("dash snapshot identity is unsupported");
				const encounter = new DashEncounter({ commands: checkedCommands$7(identity.commands) });
				encounter.stepMany(checked.tick);
				if (encounter.#tick !== checked.tick) throw new TypeError("dash snapshot contains post-terminal time");
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/special-movement-jump.js
function clone$6(value) {
	return JSON.parse(JSON.stringify(value));
}
function canonicalJson$6(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$6).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$6(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord$5(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseCommands$1(value) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX_COMMANDS$6) throw new TypeError("jump commands must be a bounded plain array");
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError("jump commands must contain dense data properties");
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function checkedCommands$6(value) {
	return denseCommands$1(value).map((entry, index) => {
		const command = exactRecord$5(entry, COMMAND_KEYS$6, `jump command ${index}`);
		if (!Number.isSafeInteger(command.tick) || command.tick < 0 || command.tick > LANDING_TICK$1) throw new TypeError(`jump command ${index}.tick is outside the encounter`);
		if (!COMMAND_TYPES$5.has(command.type)) throw new TypeError(`jump command ${index}.type is invalid`);
		if (command.type === "target-lost" && command.tick > TAKEOFF_TICK$1) throw new TypeError("target-lost must causally precede jump takeoff");
		if (command.type === "interrupt" && command.tick < TAKEOFF_TICK$1) throw new TypeError("interrupt must causally occur at takeoff or during jump transit");
		return {
			tick: command.tick,
			type: command.type
		};
	});
}
function checkedSetup$5(value) {
	return { commands: checkedCommands$6(exactRecord$5(value, SETUP_KEYS$5, "jump setup").commands) };
}
function fixedIdentity$2(commands) {
	return {
		commands: commands.map((command) => ({ ...command })),
		encounter: IDENTITY.encounter
	};
}
function interpolatePosition(from, to, elapsed, total) {
	const checkedFrom = validatePosition(from, "jump interpolation start");
	const checkedTo = validatePosition(to, "jump interpolation end");
	return {
		x: checkedFrom.x + Number(BigInt(checkedTo.x - checkedFrom.x) * BigInt(elapsed) / BigInt(total)),
		y: checkedFrom.y + Number(BigInt(checkedTo.y - checkedFrom.y) * BigInt(elapsed) / BigInt(total))
	};
}
function candidateState(candidate, targetAlive) {
	return {
		alive: candidate.id === IDENTITY.target.id ? targetAlive : true,
		id: candidate.id,
		kind: candidate.kind,
		layer: candidate.layer,
		position: { ...candidate.position },
		radius: candidate.radius,
		targetable: candidate.targetable ?? true
	};
}
/**
* Returns the isolated original Stonevault definition. Its benchmark-backed
* numbers are comparison questions wherever the research corpus marks them
* unverified.
*/
function createJumpSpecialCatalog() {
	return createCardCatalog(DEFINITIONS$2);
}
/**
* Creates the only caller-controlled input: at most one bounded causal event.
* Mechanics, identities, geometry, health, and timing cannot be overridden.
*/
function createJumpSpecialFixture(commands = []) {
	return clone$6(checkedSetup$5({ commands }));
}
/**
* Pure exact evaluator for the inclusive QUESTION trigger interval.
*/
function evaluateJumpQuestionBoundary(distanceMillitiles, ...extra) {
	if (extra.length !== 0 || !Number.isSafeInteger(distanceMillitiles) || distanceMillitiles < 0) throw new TypeError("jump boundary distance must be one non-negative safe integer");
	return {
		eligible: distanceMillitiles >= QUESTION_RUNTIME$1.triggerMinimumMillitiles && distanceMillitiles <= QUESTION_RUNTIME$1.triggerMaximumMillitiles,
		triggerMaximumMillitiles: QUESTION_RUNTIME$1.triggerMaximumMillitiles,
		triggerMinimumMillitiles: QUESTION_RUNTIME$1.triggerMinimumMillitiles
	};
}
var createJumpQuestionFixture, QUESTION_RUNTIME$1, DEFINITIONS$2, IDENTITY, LANDING_CANDIDATES, COMMAND_KEYS$6, COMMAND_TYPES$5, SETUP_KEYS$5, SNAPSHOT_KEYS$3, SNAPSHOT_IDENTITY_KEYS$1, MAX_COMMANDS$6, MAX_SNAPSHOT_BYTES$6, MAX_TICK$6, TAKEOFF_TICK$1, LANDING_TICK$1, JumpEncounter;
function init_special_movement_jump() {
	return (init_special_movement_jump = __esmMin((() => {
		init_area_damage();
		init_targeting();
		init_spatial();
		init_schema();
		init_session_troop_movement_question_authority();
		createJumpQuestionFixture = createJumpQuestionFixture$1;
		QUESTION_RUNTIME$1 = JUMP_QUESTION_VALUES;
		DEFINITIONS$2 = [{
			id: "stonevault",
			displayName: "Stonevault",
			cost: 7,
			kind: "unit",
			rarity: "mythic",
			hitpoints: 3993,
			damage: 268,
			hitSpeedTicks: 102,
			firstHitTicks: 72,
			deployTimeTicks: 60,
			rangeMillitiles: 1200,
			sightRangeMillitiles: 5500,
			movementMillitilesPerSecond: 1e3,
			targetMode: "ground",
			count: 1,
			areaDamageRadiusMillitiles: 1300,
			components: []
		}];
		IDENTITY = Object.freeze({
			encounter: "northbound-landing-jump-v1",
			target: Object.freeze({
				hitpoints: 1e3,
				id: 202,
				kind: "troop",
				layer: "ground",
				position: Object.freeze({
					x: 3500,
					y: 15500
				}),
				radius: 0
			}),
			unit: Object.freeze({
				id: 101,
				position: Object.freeze({
					x: 3500,
					y: 11500
				}),
				radius: 0
			})
		});
		LANDING_CANDIDATES = Object.freeze([
			IDENTITY.target,
			Object.freeze({
				hitpoints: 536,
				id: 203,
				kind: "troop",
				layer: "ground",
				position: Object.freeze({
					x: 4800,
					y: 15500
				}),
				radius: 0
			}),
			Object.freeze({
				hitpoints: 1e3,
				id: 204,
				kind: "troop",
				layer: "ground",
				position: Object.freeze({
					x: 4801,
					y: 15500
				}),
				radius: 0
			}),
			Object.freeze({
				hitpoints: 1e3,
				id: 205,
				kind: "troop",
				layer: "air",
				position: Object.freeze({
					x: 3500,
					y: 15500
				}),
				radius: 0
			}),
			Object.freeze({
				hitpoints: 1e3,
				id: 206,
				kind: "troop",
				layer: "ground",
				position: Object.freeze({
					x: 3500,
					y: 15500
				}),
				radius: 0,
				targetable: false
			}),
			Object.freeze({
				hitpoints: 536,
				id: 207,
				kind: "structure",
				layer: "ground",
				position: Object.freeze({
					x: 4800,
					y: 15500
				}),
				radius: 0
			})
		]);
		COMMAND_KEYS$6 = ["tick", "type"];
		COMMAND_TYPES$5 = /* @__PURE__ */ new Set([
			"interrupt",
			"target-killed",
			"target-lost"
		]);
		SETUP_KEYS$5 = ["commands"];
		SNAPSHOT_KEYS$3 = [
			"identity",
			"tick",
			"version"
		];
		SNAPSHOT_IDENTITY_KEYS$1 = ["commands", "encounter"];
		MAX_COMMANDS$6 = 1;
		MAX_SNAPSHOT_BYTES$6 = 4096;
		MAX_TICK$6 = 120;
		TAKEOFF_TICK$1 = 60;
		LANDING_TICK$1 = TAKEOFF_TICK$1 + QUESTION_RUNTIME$1.transitTicks;
		JumpEncounter = class JumpEncounter {
			#area;
			#card;
			#commands;
			#commandIndex = 0;
			#history = [];
			#jump = null;
			#position = { ...IDENTITY.unit.position };
			#targetAlive = true;
			#targetId = null;
			#targetable = true;
			#terminal = false;
			#tick = 0;
			constructor(setup = createJumpSpecialFixture()) {
				const checked = checkedSetup$5(setup);
				this.#commands = checked.commands;
				this.#card = createJumpSpecialCatalog()[0];
				this.#area = new AreaDamageSystem();
				for (const candidate of LANDING_CANDIDATES) this.#area.add(candidate.id, candidate.hitpoints);
			}
			get replay() {
				return clone$6(this.#history);
			}
			get state() {
				return clone$6({
					airborne: this.#jump !== null,
					candidateHealth: Object.fromEntries(LANDING_CANDIDATES.map((candidate) => [candidate.id, candidate.id === IDENTITY.target.id && !this.#targetAlive ? 0 : this.#area.get(candidate.id).currentHealth])),
					jump: this.#jump,
					phase: this.#terminal ? "terminal" : this.#jump !== null ? "transit" : this.#tick < this.#card.deployTimeTicks ? "deploying" : "ready",
					position: this.#position,
					targetAlive: this.#targetAlive,
					targetId: this.#targetId,
					targetable: this.#targetable,
					terminal: this.#terminal,
					tick: this.#tick
				});
			}
			step() {
				if (this.#terminal || this.#tick >= MAX_TICK$6) return [];
				const boundary = this.#tick;
				const events = [];
				const command = this.#commands[this.#commandIndex];
				if (command?.tick === boundary) {
					this.#commandIndex += 1;
					if (command.type === "target-lost") {
						this.#targetId = null;
						this.#terminal = true;
						events.push({
							reason: "target-lost-before-takeoff",
							targetId: IDENTITY.target.id,
							tick: boundary,
							type: "jump-cancelled"
						});
					} else if (command.type === "target-killed") {
						this.#targetAlive = false;
						events.push({
							targetId: IDENTITY.target.id,
							tick: boundary,
							type: "target-died"
						});
						if (boundary <= TAKEOFF_TICK$1) {
							this.#terminal = true;
							events.push({
								reason: "target-killed-before-takeoff",
								targetId: IDENTITY.target.id,
								tick: boundary,
								type: "jump-cancelled"
							});
						}
					} else {
						const phase = this.#jump === null ? "pretakeoff" : "transit";
						this.#jump = null;
						this.#targetable = true;
						this.#terminal = true;
						events.push({
							phase,
							position: { ...this.#position },
							tick: boundary,
							type: "jump-interrupted"
						});
						if (phase === "transit") events.push({
							targetable: true,
							tick: boundary,
							type: "targetability-changed"
						});
					}
				}
				if (!this.#terminal && boundary === 0) {
					const selected = acquireTarget({
						position: this.#position,
						radius: IDENTITY.unit.radius
					}, [candidateState(IDENTITY.target, this.#targetAlive)], {
						mode: "ground",
						sightRange: this.#card.sightRangeMillitiles
					});
					this.#targetId = selected?.id ?? null;
					if (selected !== null) events.push({
						targetId: selected.id,
						tick: boundary,
						type: "target-acquired"
					});
				}
				if (!this.#terminal && boundary === TAKEOFF_TICK$1) {
					const distance = Math.abs(IDENTITY.target.position.x - this.#position.x) + Math.abs(IDENTITY.target.position.y - this.#position.y);
					if (this.#targetId === null || !this.#targetAlive || !evaluateJumpQuestionBoundary(distance).eligible) {
						this.#terminal = true;
						events.push({
							reason: "no-eligible-target",
							tick: boundary,
							type: "jump-cancelled"
						});
					} else {
						this.#jump = {
							elapsedTicks: 0,
							from: { ...this.#position },
							targetId: this.#targetId,
							to: { ...IDENTITY.target.position }
						};
						this.#targetable = false;
						events.push({
							from: { ...this.#jump.from },
							targetId: this.#jump.targetId,
							tick: boundary,
							to: { ...this.#jump.to },
							type: "jump-takeoff"
						});
						events.push({
							targetable: false,
							tick: boundary,
							type: "targetability-changed"
						});
					}
				}
				if (!this.#terminal && this.#jump !== null && boundary > TAKEOFF_TICK$1) {
					this.#jump.elapsedTicks += 1;
					this.#position = interpolatePosition(this.#jump.from, this.#jump.to, this.#jump.elapsedTicks, QUESTION_RUNTIME$1.transitTicks);
					events.push({
						elapsedTicks: this.#jump.elapsedTicks,
						position: { ...this.#position },
						tick: boundary,
						type: "jump-move"
					});
					if (this.#jump.elapsedTicks === QUESTION_RUNTIME$1.transitTicks) {
						const targetId = this.#jump.targetId;
						this.#jump = null;
						this.#targetable = true;
						events.push({
							targetable: true,
							tick: boundary,
							type: "targetability-changed"
						});
						events.push({
							position: { ...this.#position },
							targetId,
							tick: boundary,
							type: "jump-landed"
						});
						const result = this.#area.resolve({
							center: { ...this.#position },
							damage: QUESTION_RUNTIME$1.landingDamage,
							mode: QUESTION_RUNTIME$1.landingMode,
							radius: QUESTION_RUNTIME$1.landingRadiusMillitiles,
							tick: boundary
						}, LANDING_CANDIDATES.map((candidate) => candidateState(candidate, this.#targetAlive)));
						events.push(...result.events);
						this.#terminal = true;
						events.push({
							tick: boundary,
							type: "encounter-complete"
						});
					}
				}
				this.#tick += 1;
				this.#history.push(...events);
				return clone$6(events);
			}
			stepMany(ticks) {
				if (!Number.isSafeInteger(ticks) || ticks < 0) throw new TypeError("jump ticks must be a non-negative safe integer");
				const events = [];
				for (let index = 0; index < ticks && !this.#terminal && this.#tick < MAX_TICK$6; index += 1) events.push(...this.step());
				return events;
			}
			run(tickLimit = MAX_TICK$6) {
				if (!Number.isSafeInteger(tickLimit) || tickLimit < 0) throw new TypeError("jump tick limit must be a non-negative safe integer");
				if (tickLimit > MAX_TICK$6) throw new RangeError("jump tick limit exceeds its bound");
				while (!this.#terminal && this.#tick < tickLimit) this.step();
				return this.state;
			}
			serialize() {
				const serialized = canonicalJson$6({
					identity: fixedIdentity$2(this.#commands),
					tick: this.#tick,
					version: 1
				});
				if (serialized.length > MAX_SNAPSHOT_BYTES$6) throw new RangeError("jump snapshot exceeds its size bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("jump snapshot must be a string");
				if (serialized.length > MAX_SNAPSHOT_BYTES$6) throw new RangeError("jump snapshot exceeds its size bound");
				let snapshot;
				try {
					snapshot = JSON.parse(serialized);
				} catch {
					throw new TypeError("jump snapshot must be valid JSON");
				}
				const checked = exactRecord$5(snapshot, SNAPSHOT_KEYS$3, "jump snapshot");
				if (checked.version !== 1) throw new TypeError("jump snapshot version is unsupported");
				if (!Number.isSafeInteger(checked.tick) || checked.tick < 0 || checked.tick > MAX_TICK$6) throw new TypeError("jump snapshot.tick is invalid");
				const identity = exactRecord$5(checked.identity, SNAPSHOT_IDENTITY_KEYS$1, "jump snapshot.identity");
				if (identity.encounter !== IDENTITY.encounter) throw new TypeError("jump snapshot identity is unsupported");
				const encounter = new JumpEncounter({ commands: checkedCommands$6(identity.commands) });
				encounter.stepMany(checked.tick);
				if (encounter.#tick !== checked.tick) throw new TypeError("jump snapshot contains post-terminal time");
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/special-movement-recoil.js
function clone$5(value) {
	return JSON.parse(JSON.stringify(value));
}
function canonicalJson$5(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$5).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$5(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exactRecord$4(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseCommands(value) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX_COMMANDS$5) throw new TypeError("recoil commands must be a bounded plain array");
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError("recoil commands must contain dense data properties");
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function checkedCommands$5(value) {
	return denseCommands(value).map((entry, index) => {
		const command = exactRecord$4(entry, COMMAND_KEYS$5, `recoil command ${index}`);
		if (!COMMAND_TYPES$4.has(command.type)) throw new TypeError(`recoil command ${index}.type is invalid`);
		if (!Number.isSafeInteger(command.tick) || command.tick < 0) throw new TypeError(`recoil command ${index}.tick is invalid`);
		if (command.type === "interrupt" && command.tick > QUESTION_RUNTIME.launchBoundaryTick) throw new TypeError("recoil interruption must not follow attack launch");
		if (command.type === "target-killed" && (command.tick <= QUESTION_RUNTIME.launchBoundaryTick || command.tick >= IMPACT_TICK)) throw new TypeError("recoil target death must occur after launch and before impact");
		return {
			tick: command.tick,
			type: command.type
		};
	});
}
function checkedSetup$4(value) {
	const setup = exactRecord$4(value, SETUP_KEYS$4, "recoil setup");
	if (typeof setup.scenario !== "string" || !Object.hasOwn(SCENARIOS$2, setup.scenario)) throw new TypeError("recoil setup.scenario is invalid");
	return {
		commands: checkedCommands$5(setup.commands),
		scenario: setup.scenario
	};
}
function integerSquareRoot$1(value) {
	if (value < 0n) throw new RangeError("square root input must be non-negative");
	if (value < 2n) return value;
	let current = value;
	let next = (current + value / current) / 2n;
	while (next < current) {
		current = next;
		next = (current + value / current) / 2n;
	}
	return current;
}
function checkedDistance$1(value) {
	if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("recoil distance must be one positive safe integer millitile value");
	return value;
}
function assertSafeIntegerBigInts(entries) {
	for (const [label, value] of entries) if (value < MIN_SAFE_INTEGER_BIGINT || value > MAX_SAFE_INTEGER_BIGINT) throw new RangeError(`${label} exceeds the safe integer range`);
}
/**
* Returns the isolated original Cinderback definition. The common corpus does
* not encode its recoil mechanic; test-only comparison owns benchmark mapping.
*/
function createRecoilSpecialCatalog() {
	return createCardCatalog(DEFINITIONS$1);
}
/**
* Creates the only caller-controlled encounter inputs: one fixed scenario and
* at most one bounded causal event.
*/
function createRecoilSpecialFixture(commands = [], scenario = "open") {
	return clone$5(checkedSetup$4({
		commands,
		scenario
	}));
}
/**
* Pure recoil projection and arena-boundary evaluator.
*
* Direction snapshots the target vector and negates it. Integer component
* projection divides by the exact integer vector length; non-integral vector
* lengths are rejected instead of implying an unrecorded rounding policy.
* The unit center is clamped to the radius-inset closed arena.
*/
function evaluateRecoilQuestionBoundary(originValue, targetValue, radiusValue, distanceValue = QUESTION_RUNTIME.recoilDistanceMillitiles, ...extra) {
	if (extra.length !== 0) throw new TypeError("recoil boundary evaluator received extra arguments");
	const origin = validatePosition(originValue, "recoil origin");
	const target = validatePosition(targetValue, "recoil target");
	const circle = validateCircle({
		position: origin,
		radius: radiusValue
	}, "recoil actor circle");
	const distance = checkedDistance$1(distanceValue);
	if (circle.radius > 9e3 || circle.radius > 16e3 || !isPointInArena(origin) || !isPointInArena(target) || origin.x < circle.radius || origin.x > 18e3 - circle.radius || origin.y < circle.radius || origin.y > 32e3 - circle.radius) throw new RangeError("recoil actor circle and target must fit in the arena");
	const dx = BigInt(target.x) - BigInt(origin.x);
	const dy = BigInt(target.y) - BigInt(origin.y);
	const squared = dx * dx + dy * dy;
	if (squared === 0n) throw new RangeError("recoil direction is undefined for a zero target vector");
	const vectorLength = integerSquareRoot$1(squared);
	if (vectorLength * vectorLength !== squared) throw new RangeError("recoil target vector length must be an exact integer millitile value");
	const scale = BigInt(distance);
	if (dx * scale % vectorLength !== 0n || dy * scale % vectorLength !== 0n) throw new RangeError("recoil projection must produce exact integer millitile components");
	const displacementX = -dx * scale / vectorLength;
	const displacementY = -dy * scale / vectorLength;
	const unclampedX = BigInt(origin.x) + displacementX;
	const unclampedY = BigInt(origin.y) + displacementY;
	assertSafeIntegerBigInts([
		["recoil displacement.x", displacementX],
		["recoil displacement.y", displacementY],
		["recoil unclamped.x", unclampedX],
		["recoil unclamped.y", unclampedY]
	]);
	const displacement = {
		x: Number(displacementX),
		y: Number(displacementY)
	};
	const unclamped = {
		x: Number(unclampedX),
		y: Number(unclampedY)
	};
	const position = {
		x: Math.max(circle.radius, Math.min(ARENA_WIDTH_MILLITILES - circle.radius, unclamped.x)),
		y: Math.max(circle.radius, Math.min(ARENA_LENGTH_MILLITILES - circle.radius, unclamped.y))
	};
	return {
		clamped: position.x !== unclamped.x || position.y !== unclamped.y,
		displacement,
		origin,
		position,
		radius: circle.radius,
		snapshottedTargetPosition: target,
		unclamped
	};
}
function projectileSetup(scenario) {
	const identity = SCENARIOS$2[scenario];
	const common = {
		attackRange: 6e3,
		kind: "troop",
		layer: "ground",
		radius: 0,
		targetMode: "air_and_ground",
		targetable: true
	};
	return { entities: [
		{
			...common,
			id: ACTOR_ID,
			maxHealth: 304,
			position: { ...identity.actorPosition },
			radius: ACTOR_RADIUS
		},
		{
			...common,
			attackRange: 0,
			id: TARGET_ID,
			maxHealth: TARGET_HEALTH,
			position: { ...identity.targetPosition }
		},
		{
			...common,
			attackRange: 1,
			id: KILL_SOURCE_ID,
			maxHealth: 1,
			position: { ...identity.targetPosition }
		}
	] };
}
function fixedIdentity$1(commands, scenario) {
	return {
		commands: commands.map((command) => ({ ...command })),
		encounter: SCENARIOS$2[scenario].encounter,
		scenario
	};
}
var createRecoilQuestionFixture, QUESTION_RUNTIME, DEFINITIONS$1, ACTOR_ID, TARGET_ID, KILL_SOURCE_ID, ACTOR_RADIUS, TARGET_HEALTH, SCENARIOS$2, SETUP_KEYS$4, COMMAND_KEYS$5, COMMAND_TYPES$4, SNAPSHOT_KEYS$2, SNAPSHOT_IDENTITY_KEYS, MAX_COMMANDS$5, MAX_SNAPSHOT_BYTES$5, MIN_SAFE_INTEGER_BIGINT, MAX_SAFE_INTEGER_BIGINT, IMPACT_TICK, MAX_TICK$5, RecoilEncounter;
function init_special_movement_recoil() {
	return (init_special_movement_recoil = __esmMin((() => {
		init_arena_geometry();
		init_projectile();
		init_spatial();
		init_schema();
		init_session_troop_movement_question_authority();
		createRecoilQuestionFixture = createRecoilQuestionFixture$1;
		QUESTION_RUNTIME = RECOIL_QUESTION_VALUES;
		DEFINITIONS$1 = [{
			id: "cinderback",
			displayName: "Cinderback",
			cost: 3,
			kind: "unit",
			rarity: "standard",
			hitpoints: 304,
			damage: null,
			hitSpeedTicks: 180,
			firstHitTicks: 144,
			deployTimeTicks: 60,
			rangeMillitiles: 6e3,
			sightRangeMillitiles: 8500,
			movementMillitilesPerSecond: 1500,
			targetMode: "ground-and-air",
			count: 1,
			areaDamageRadiusMillitiles: null,
			components: []
		}];
		ACTOR_ID = 101;
		TARGET_ID = 202;
		KILL_SOURCE_ID = 303;
		ACTOR_RADIUS = 400;
		TARGET_HEALTH = 1e3;
		SCENARIOS$2 = Object.freeze({
			edge: Object.freeze({
				encounter: "edge-clamped-attack-recoil-v1",
				actorPosition: Object.freeze({
					x: 500,
					y: 500
				}),
				targetPosition: Object.freeze({
					x: 3500,
					y: 4500
				})
			}),
			open: Object.freeze({
				encounter: "open-attack-recoil-v1",
				actorPosition: Object.freeze({
					x: 5e3,
					y: 6e3
				}),
				targetPosition: Object.freeze({
					x: 8e3,
					y: 1e4
				})
			})
		});
		SETUP_KEYS$4 = ["commands", "scenario"];
		COMMAND_KEYS$5 = ["tick", "type"];
		COMMAND_TYPES$4 = /* @__PURE__ */ new Set(["interrupt", "target-killed"]);
		SNAPSHOT_KEYS$2 = [
			"identity",
			"tick",
			"version"
		];
		SNAPSHOT_IDENTITY_KEYS = [
			"commands",
			"encounter",
			"scenario"
		];
		MAX_COMMANDS$5 = 1;
		MAX_SNAPSHOT_BYTES$5 = 4096;
		MIN_SAFE_INTEGER_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
		MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
		IMPACT_TICK = QUESTION_RUNTIME.launchBoundaryTick + 50;
		MAX_TICK$5 = IMPACT_TICK + 2;
		RecoilEncounter = class RecoilEncounter {
			#combat;
			#commands;
			#commandIndex = 0;
			#history = [];
			#position;
			#scenario;
			#terminal = false;
			#tick = 0;
			constructor(setup = createRecoilSpecialFixture()) {
				const checked = checkedSetup$4(setup);
				this.#commands = checked.commands;
				this.#scenario = checked.scenario;
				this.#position = { ...SCENARIOS$2[this.#scenario].actorPosition };
				this.#combat = new ProjectileCombat(projectileSetup(this.#scenario));
			}
			get replay() {
				return clone$5(this.#history);
			}
			get state() {
				return clone$5({
					phase: this.#terminal ? "terminal" : this.#tick <= QUESTION_RUNTIME.launchBoundaryTick ? "winding-up" : "projectile-in-flight",
					position: this.#position,
					projectileState: this.#combat.state,
					scenario: this.#scenario,
					terminal: this.#terminal,
					tick: this.#tick
				});
			}
			step() {
				if (this.#terminal || this.#tick >= MAX_TICK$5) return [];
				const boundary = this.#tick;
				const events = [];
				const command = this.#commands[this.#commandIndex];
				if (command?.tick === boundary) {
					this.#commandIndex += 1;
					if (command.type === "interrupt") {
						this.#terminal = true;
						events.push({
							position: { ...this.#position },
							tick: boundary,
							type: "attack-interrupted"
						});
					} else {
						const projectile = this.#combat.launch({
							attackerId: KILL_SOURCE_ID,
							damage: TARGET_HEALTH,
							radius: 0,
							speed: 1,
							targetId: TARGET_ID,
							tick: boundary
						});
						events.push({
							projectile: { ...projectile },
							tick: boundary,
							type: "target-kill-projectile-launched"
						});
					}
				}
				if (!this.#terminal && boundary === QUESTION_RUNTIME.launchBoundaryTick) {
					const targetPosition = SCENARIOS$2[this.#scenario].targetPosition;
					const projectile = this.#combat.launch({
						attackerId: ACTOR_ID,
						damage: QUESTION_RUNTIME.projectileDamage,
						radius: QUESTION_RUNTIME.projectileRadiusMillitiles,
						speed: QUESTION_RUNTIME.projectileSpeedMillitilesPerTick,
						targetId: TARGET_ID,
						tick: boundary
					});
					events.push({
						projectile: { ...projectile },
						tick: boundary,
						type: "attack-projectile-launched"
					});
					const recoil = evaluateRecoilQuestionBoundary(this.#position, targetPosition, ACTOR_RADIUS);
					this.#position = { ...recoil.position };
					events.push({
						clamped: recoil.clamped,
						displacement: { ...recoil.displacement },
						from: { ...recoil.origin },
						snapshottedTargetPosition: { ...recoil.snapshottedTargetPosition },
						tick: boundary,
						to: { ...recoil.position },
						type: "attack-recoil",
						unclamped: { ...recoil.unclamped }
					});
				}
				const projectileEvents = this.#combat.step(boundary);
				events.push(...projectileEvents.map((event) => ({
					...event,
					type: `projectile-${event.type}`
				})));
				if (projectileEvents.some((event) => event.type === "impact" && event.projectileId === 1)) {
					this.#terminal = true;
					events.push({
						tick: boundary,
						type: "encounter-complete"
					});
				}
				this.#tick += 1;
				this.#history.push(...events);
				return clone$5(events);
			}
			stepMany(ticks) {
				if (!Number.isSafeInteger(ticks) || ticks < 0) throw new TypeError("recoil ticks must be a non-negative safe integer");
				const events = [];
				for (let index = 0; index < ticks && !this.#terminal && this.#tick < MAX_TICK$5; index += 1) events.push(...this.step());
				return events;
			}
			run(tickLimit = MAX_TICK$5) {
				if (!Number.isSafeInteger(tickLimit) || tickLimit < 0) throw new TypeError("recoil tick limit must be a non-negative safe integer");
				if (tickLimit > MAX_TICK$5) throw new RangeError("recoil tick limit exceeds its bound");
				while (!this.#terminal && this.#tick < tickLimit) this.step();
				return this.state;
			}
			serialize() {
				const serialized = canonicalJson$5({
					identity: fixedIdentity$1(this.#commands, this.#scenario),
					tick: this.#tick,
					version: 1
				});
				if (serialized.length > MAX_SNAPSHOT_BYTES$5) throw new RangeError("recoil snapshot exceeds its size bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("recoil snapshot must be a string");
				if (serialized.length > MAX_SNAPSHOT_BYTES$5) throw new RangeError("recoil snapshot exceeds its size bound");
				let snapshot;
				try {
					snapshot = JSON.parse(serialized);
				} catch {
					throw new TypeError("recoil snapshot must be valid JSON");
				}
				const checked = exactRecord$4(snapshot, SNAPSHOT_KEYS$2, "recoil snapshot");
				if (checked.version !== 1) throw new TypeError("recoil snapshot version is unsupported");
				if (!Number.isSafeInteger(checked.tick) || checked.tick < 0 || checked.tick > MAX_TICK$5) throw new TypeError("recoil snapshot.tick is invalid");
				const identity = exactRecord$4(checked.identity, SNAPSHOT_IDENTITY_KEYS, "recoil snapshot.identity");
				if (typeof identity.scenario !== "string" || !Object.hasOwn(SCENARIOS$2, identity.scenario) || identity.encounter !== SCENARIOS$2[identity.scenario].encounter) throw new TypeError("recoil snapshot identity is unsupported");
				const encounter = new RecoilEncounter({
					commands: checkedCommands$5(identity.commands),
					scenario: identity.scenario
				});
				encounter.stepMany(checked.tick);
				if (encounter.#tick !== checked.tick) throw new TypeError("recoil snapshot contains post-terminal time");
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/special-movement-retarget.js
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
function integer$2(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
}
function checkedCandidate$1(value, label) {
	const candidate = exactRecord$3(value, CANDIDATE_KEYS$1, label);
	integer$2(candidate.id, `${label}.id`, 1);
	integer$2(candidate.health, `${label}.health`, 0);
	integer$2(candidate.radius, `${label}.radius`, 0, 1e4);
	const position = exactRecord$3(candidate.position, ["x", "y"], `${label}.position`);
	integer$2(position.x, `${label}.position.x`, -1e5, 1e5);
	integer$2(position.y, `${label}.position.y`, -1e5, 1e5);
	if (!["troop", "structure"].includes(candidate.kind)) throw new TypeError(`${label}.kind is invalid`);
	if (!["air", "ground"].includes(candidate.layer)) throw new TypeError(`${label}.layer is invalid`);
	if (typeof candidate.alive !== "boolean" || typeof candidate.targetable !== "boolean") throw new TypeError(`${label} flags must be booleans`);
	if (candidate.alive !== candidate.health > 0) throw new TypeError(`${label}.alive must agree with health`);
	return {
		alive: candidate.alive,
		health: candidate.health,
		id: candidate.id,
		kind: candidate.kind,
		layer: candidate.layer,
		position: {
			x: position.x,
			y: position.y
		},
		radius: candidate.radius,
		targetable: candidate.targetable
	};
}
function checkedCandidates$1(value) {
	const candidates = denseArray$3(value, "retarget candidates", MAX_CANDIDATES$1).map((candidate, index) => checkedCandidate$1(candidate, `retarget candidate ${index}`));
	const ids = /* @__PURE__ */ new Set();
	for (const candidate of candidates) {
		if (ids.has(candidate.id)) throw new TypeError("retarget candidates must have unique IDs");
		ids.add(candidate.id);
	}
	return candidates.sort((left, right) => left.id - right.id);
}
function checkedCommands$4(value) {
	const commands = denseArray$3(value, "retarget commands", MAX_COMMANDS$4).map((entry, index) => {
		const command = exactRecord$3(entry, COMMAND_KEYS$4, `retarget command ${index}`);
		integer$2(command.tick, `retarget command ${index}.tick`, 0, 999);
		if (!COMMAND_TYPES$3.has(command.type)) throw new TypeError(`retarget command ${index}.type is invalid`);
		integer$2(command.targetId, `retarget command ${index}.targetId`, 1);
		if (command.type === "set-candidate") {
			const candidate = checkedCandidate$1(command.candidate, `retarget command ${index}.candidate`);
			if (candidate.id !== command.targetId) throw new TypeError(`retarget command ${index} IDs must agree`);
			return {
				candidate,
				targetId: command.targetId,
				tick: command.tick,
				type: command.type
			};
		}
		if (command.candidate !== null) throw new TypeError(`retarget command ${index}.candidate is inapplicable`);
		return {
			candidate: null,
			targetId: command.targetId,
			tick: command.tick,
			type: command.type
		};
	});
	let priorTick = -1;
	for (const command of commands) {
		if (command.tick < priorTick) throw new TypeError("retarget commands must be ordered by tick");
		priorTick = command.tick;
	}
	return commands;
}
function checkedSetup$3(value) {
	const setup = exactRecord$3(value, SETUP_KEYS$3, "retarget setup");
	const candidates = checkedCandidates$1(setup.candidates);
	const commands = checkedCommands$4(setup.commands);
	const liveIds = new Set(candidates.map(({ id }) => id));
	for (const command of commands) if (command.type === "remove-candidate") liveIds.delete(command.targetId);
	else {
		liveIds.add(command.targetId);
		if (liveIds.size > MAX_CANDIDATES$1) throw new RangeError("retarget commands exceed the live candidate bound");
	}
	return {
		candidates,
		commands
	};
}
function canonicalJson$4(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$4).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$4(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function clone$4(value) {
	return JSON.parse(JSON.stringify(value));
}
function targetView$2(candidate) {
	return {
		alive: candidate.alive,
		id: candidate.id,
		kind: candidate.kind,
		layer: candidate.layer,
		position: { ...candidate.position },
		radius: candidate.radius,
		targetable: candidate.targetable
	};
}
function inAttackReach$1(candidate) {
	const dx = BigInt(candidate.position.x - ATTACKER.position.x);
	const dy = BigInt(candidate.position.y - ATTACKER.position.y);
	const reach = BigInt(ATTACKER.radius + DEFINITION$1.rangeMillitiles + candidate.radius);
	return dx * dx + dy * dy <= reach * reach;
}
function event$1(type, tick, fields = {}) {
	return {
		...fields,
		tick,
		type
	};
}
function createRetargetSpecialCatalog() {
	return createCardCatalog([DEFINITION$1]);
}
function createRetargetFixture(candidates = [], commands = []) {
	return clone$4(checkedSetup$3({
		candidates,
		commands
	}));
}
var createRetargetQuestionRecords, DEFINITION$1, ATTACKER, MAX_CANDIDATES$1, MAX_COMMANDS$4, MAX_EVENTS$2, MAX_SNAPSHOT_BYTES$4, MAX_TICK$4, CANDIDATE_KEYS$1, COMMAND_KEYS$4, SETUP_KEYS$3, COMMAND_TYPES$3, RetargetAttackEncounter;
function init_special_movement_retarget() {
	return (init_special_movement_retarget = __esmMin((() => {
		init_attack_cycle();
		init_targeting();
		init_schema();
		init_session_troop_movement_question_authority();
		createRetargetQuestionRecords = createRetargetQuestionRecords$1;
		DEFINITION$1 = Object.freeze({
			areaDamageRadiusMillitiles: null,
			components: [],
			cost: 3,
			count: 1,
			damage: 202,
			deployTimeTicks: 60,
			displayName: "Wayfinder",
			firstHitTicks: 42,
			hitSpeedTicks: 72,
			hitpoints: 1766,
			id: "wayfinder",
			kind: "unit",
			movementMillitilesPerSecond: 1e3,
			rangeMillitiles: 1200,
			rarity: "standard",
			sightRangeMillitiles: 5500,
			targetMode: "ground"
		});
		ATTACKER = Object.freeze({
			position: Object.freeze({
				x: 0,
				y: 0
			}),
			radius: 300
		});
		MAX_CANDIDATES$1 = 16;
		MAX_COMMANDS$4 = 64;
		MAX_EVENTS$2 = 512;
		MAX_SNAPSHOT_BYTES$4 = 262144;
		MAX_TICK$4 = 1e3;
		CANDIDATE_KEYS$1 = [
			"alive",
			"health",
			"id",
			"kind",
			"layer",
			"position",
			"radius",
			"targetable"
		];
		COMMAND_KEYS$4 = [
			"candidate",
			"targetId",
			"tick",
			"type"
		];
		SETUP_KEYS$3 = ["candidates", "commands"];
		COMMAND_TYPES$3 = /* @__PURE__ */ new Set(["remove-candidate", "set-candidate"]);
		RetargetAttackEncounter = class RetargetAttackEncounter {
			#attack;
			#candidates;
			#commandIndex = 0;
			#commands;
			#history = [];
			#selectedTargetId = null;
			#setup;
			#tick = 0;
			constructor(setup = createRetargetFixture()) {
				this.#setup = checkedSetup$3(setup);
				this.#candidates = clone$4(this.#setup.candidates);
				this.#commands = clone$4(this.#setup.commands);
				this.#attack = new AttackCycle({
					deployTicks: DEFINITION$1.deployTimeTicks,
					firstHitTicks: DEFINITION$1.firstHitTicks,
					hitSpeedTicks: DEFINITION$1.hitSpeedTicks
				});
			}
			get replay() {
				return clone$4(this.#history);
			}
			get state() {
				return clone$4({
					attack: this.#attack.state,
					candidates: this.#candidates,
					selectedTargetId: this.#selectedTargetId,
					tick: this.#tick
				});
			}
			#applyCommands(boundary) {
				while (this.#commands[this.#commandIndex]?.tick === boundary) {
					const command = this.#commands[this.#commandIndex];
					this.#commandIndex += 1;
					const index = this.#candidates.findIndex(({ id }) => id === command.targetId);
					if (command.type === "remove-candidate") {
						if (index !== -1) this.#candidates.splice(index, 1);
					} else if (index === -1) {
						if (this.#candidates.length >= MAX_CANDIDATES$1) throw new RangeError("retarget candidate bound exceeded");
						this.#candidates.push(clone$4(command.candidate));
					} else this.#candidates[index] = clone$4(command.candidate);
					this.#candidates.sort((left, right) => left.id - right.id);
				}
			}
			step() {
				return this.stepMany(1);
			}
			stepMany(count) {
				integer$2(count, "retarget step count", 0, MAX_TICK$4);
				if (this.#tick + count > MAX_TICK$4) throw new RangeError("retarget encounter exceeds its tick bound");
				const emitted = [];
				for (let offset = 0; offset < count; offset += 1) {
					const boundary = this.#tick;
					this.#applyCommands(boundary);
					const nextId = retainOrAcquireTarget(ATTACKER, this.#candidates.map(targetView$2), {
						currentTargetId: this.#selectedTargetId,
						mode: DEFINITION$1.targetMode,
						sightRange: DEFINITION$1.sightRangeMillitiles
					})?.id ?? null;
					if (nextId !== this.#selectedTargetId) {
						if (this.#selectedTargetId !== null) emitted.push(event$1("target-lost", boundary, { targetId: this.#selectedTargetId }));
						this.#selectedTargetId = nextId;
						if (nextId !== null) emitted.push(event$1("target-acquired", boundary, { targetId: nextId }));
					}
					const candidate = this.#candidates.find(({ id }) => id === nextId);
					const ready = this.#attack.step({
						targetEligible: candidate !== void 0 && inAttackReach$1(candidate),
						targetId: nextId
					});
					for (const readyEvent of ready) {
						emitted.push({ ...readyEvent });
						const target = this.#candidates.find(({ id }) => id === readyEvent.targetId);
						if (target === void 0 || !target.alive || !inAttackReach$1(target)) continue;
						const healthBefore = target.health;
						target.health = Math.max(0, target.health - DEFINITION$1.damage);
						target.alive = target.health > 0;
						emitted.push(event$1("damage", boundary, {
							amount: DEFINITION$1.damage,
							healthAfter: target.health,
							healthBefore,
							targetId: target.id
						}));
						if (!target.alive) emitted.push(event$1("death", boundary, { targetId: target.id }));
					}
					this.#tick += 1;
				}
				if (this.#history.length + emitted.length > MAX_EVENTS$2) throw new RangeError("retarget event bound exceeded");
				this.#history.push(...clone$4(emitted));
				return clone$4(emitted);
			}
			serialize() {
				return canonicalJson$4({
					setup: this.#setup,
					tick: this.#tick,
					version: 1
				});
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("retarget snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$4) throw new RangeError("retarget snapshot exceeds its byte bound");
				let snapshot;
				try {
					snapshot = JSON.parse(serialized);
				} catch {
					throw new TypeError("retarget snapshot must be valid JSON");
				}
				const checked = exactRecord$3(snapshot, [
					"setup",
					"tick",
					"version"
				], "retarget snapshot");
				if (checked.version !== 1 || serialized !== canonicalJson$4(snapshot)) throw new TypeError("retarget snapshot must be canonical version 1 data");
				integer$2(checked.tick, "retarget snapshot.tick", 0, MAX_TICK$4);
				const restored = new RetargetAttackEncounter(checked.setup);
				restored.stepMany(checked.tick);
				if (restored.serialize() !== serialized) throw new TypeError("retarget snapshot is not reproducible");
				return restored;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/special-movement-knockback.js
function deepFreeze(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze(child);
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
function byteLength(value) {
	return new TextEncoder().encode(value).length;
}
function exactDataObject(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key) || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function denseArray$2(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain only dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function checkedDistance(value) {
	if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("knockback distance must be a positive safe integer millitile value");
	return value;
}
function checkedRadiusInset(position, radius, label) {
	if (radius > MAX_ARENA_RADIUS || !isPointInArena(position) || position.x < radius || position.x > 18e3 - radius || position.y < radius || position.y > 32e3 - radius) throw new RangeError(`${label} must fit in the radius-inset arena`);
}
function checkedVictim(value, index) {
	const victim = exactDataObject(value, VICTIM_KEYS, `knockback victim ${index}`);
	if (!Number.isSafeInteger(victim.id) || victim.id < 1) throw new TypeError(`knockback victim ${index}.id is invalid`);
	if (typeof victim.eligible !== "boolean") throw new TypeError(`knockback victim ${index}.eligible is invalid`);
	const position = validatePosition(victim.position, `knockback victim ${index}.position`);
	const circle = validateCircle({
		position,
		radius: victim.radius
	}, `knockback victim ${index}.circle`);
	checkedRadiusInset(position, circle.radius, `knockback victim ${index}`);
	return {
		eligible: victim.eligible,
		id: victim.id,
		position,
		radius: circle.radius
	};
}
function integerSquareRoot(value) {
	if (value < 0n) throw new RangeError("square root input must be non-negative");
	if (value < 2n) return value;
	let current = value;
	let next = (current + value / current) / 2n;
	while (next < current) {
		current = next;
		next = (current + value / current) / 2n;
	}
	return current;
}
function safeNumber(value, label) {
	if (value < MIN_SAFE_BIGINT || value > MAX_SAFE_BIGINT) throw new RangeError(`${label} exceeds the safe integer range`);
	return Number(value);
}
function zeroVector() {
	return {
		x: 0,
		y: 0
	};
}
function projectVictim(source, victim, distance) {
	if (!victim.eligible) return {
		applied: zeroVector(),
		blocked: zeroVector(),
		clamped: false,
		eligible: false,
		id: victim.id,
		origin: { ...victim.position },
		position: { ...victim.position },
		requested: zeroVector()
	};
	const dx = BigInt(victim.position.x) - BigInt(source.x);
	const dy = BigInt(victim.position.y) - BigInt(source.y);
	const squared = dx * dx + dy * dy;
	if (squared === 0n) throw new RangeError("knockback direction is undefined for a zero vector");
	const length = integerSquareRoot(squared);
	if (length * length !== squared) throw new RangeError("knockback source vector length must be an exact integer millitile value");
	const scale = BigInt(distance);
	if (dx * scale % length !== 0n || dy * scale % length !== 0n) throw new RangeError("knockback projection must produce exact integer components");
	const requestedX = dx * scale / length;
	const requestedY = dy * scale / length;
	const rawX = BigInt(victim.position.x) + requestedX;
	const rawY = BigInt(victim.position.y) + requestedY;
	safeNumber(requestedX, "knockback requested.x");
	safeNumber(requestedY, "knockback requested.y");
	safeNumber(rawX, "knockback raw position.x");
	safeNumber(rawY, "knockback raw position.y");
	const minX = BigInt(victim.radius);
	const maxX = BigInt(ARENA_WIDTH_MILLITILES - victim.radius);
	const minY = BigInt(victim.radius);
	const maxY = BigInt(ARENA_LENGTH_MILLITILES - victim.radius);
	const finalX = rawX < minX ? minX : rawX > maxX ? maxX : rawX;
	const finalY = rawY < minY ? minY : rawY > maxY ? maxY : rawY;
	const appliedX = finalX - BigInt(victim.position.x);
	const appliedY = finalY - BigInt(victim.position.y);
	const blockedX = requestedX - appliedX;
	const blockedY = requestedY - appliedY;
	return {
		applied: {
			x: safeNumber(appliedX, "knockback applied.x"),
			y: safeNumber(appliedY, "knockback applied.y")
		},
		blocked: {
			x: safeNumber(blockedX, "knockback blocked.x"),
			y: safeNumber(blockedY, "knockback blocked.y")
		},
		clamped: finalX !== rawX || finalY !== rawY,
		eligible: true,
		id: victim.id,
		origin: { ...victim.position },
		position: {
			x: safeNumber(finalX, "knockback position.x"),
			y: safeNumber(finalY, "knockback position.y")
		},
		requested: {
			x: safeNumber(requestedX, "knockback requested.x"),
			y: safeNumber(requestedY, "knockback requested.y")
		}
	};
}
/**
* Applies one external forced-displacement pulse to a bounded victim batch.
* This is not attack-triggered recoil and has no charge, leap, dash, retarget,
* damage, pathfinding, or ordinary movement state.
*/
function evaluateForcedKnockbackQuestionBoundary(sourceValue, victimsValue, distanceValue = QUESTION_RECORDS.distance.value, ...extra) {
	if (extra.length !== 0) throw new TypeError("knockback evaluator received extra arguments");
	const source = validatePosition(sourceValue, "knockback source");
	if (!isPointInArena(source)) throw new RangeError("knockback source must be in the closed arena");
	const distance = checkedDistance(distanceValue);
	const victims = denseArray$2(victimsValue, MAX_VICTIMS, "knockback victims").map(checkedVictim);
	if (victims.length < 1) throw new RangeError("knockback victims must not be empty");
	const ids = /* @__PURE__ */ new Set();
	for (const victim of victims) {
		if (ids.has(victim.id)) throw new TypeError("knockback victim IDs must be unique");
		ids.add(victim.id);
	}
	return victims.map((victim) => projectVictim(source, victim, distance)).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}
function createKnockbackSpecialCatalog() {
	return createCardCatalog(DEFINITIONS);
}
function createKnockbackQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("knockback question records take no arguments");
	return deepFreeze(Object.fromEntries(Object.entries(QUESTION_RECORDS).map(([name, record]) => [name, {
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		source: QUESTION_SOURCE,
		...record
	}])));
}
function checkedCommands$3(value) {
	return denseArray$2(value, MAX_COMMANDS$3, "knockback commands").map((entry, index) => {
		const command = exactDataObject(entry, COMMAND_KEYS$3, `knockback command ${index}`);
		if (command.type !== "interrupt") throw new TypeError(`knockback command ${index}.type is invalid`);
		if (!Number.isSafeInteger(command.tick) || command.tick < 0 || command.tick > PULSE_TICK) throw new TypeError(`knockback command ${index}.tick is invalid`);
		return {
			tick: command.tick,
			type: command.type
		};
	});
}
function checkedSetup$2(value) {
	const setup = exactDataObject(value, SETUP_KEYS$2, "knockback setup");
	if (typeof setup.scenario !== "string" || !Object.hasOwn(SCENARIOS$1, setup.scenario)) throw new TypeError("knockback setup.scenario is invalid");
	return {
		commands: checkedCommands$3(setup.commands),
		scenario: setup.scenario
	};
}
function createKnockbackSpecialFixture(commands = [], scenario = "open") {
	return clone$3(checkedSetup$2({
		commands,
		scenario
	}));
}
function fixedIdentity(commands, scenario) {
	return {
		commands: clone$3(commands),
		encounter: SCENARIOS$1[scenario].encounter,
		scenario
	};
}
var DEFINITIONS, QUESTION_SOURCE, QUESTION_RECORDS, SOURCE_ID, PULSE_TICK, MAX_TICK$3, MAX_VICTIMS, MAX_COMMANDS$3, MAX_SNAPSHOT_BYTES$3, MAX_ARENA_RADIUS, MIN_SAFE_BIGINT, MAX_SAFE_BIGINT, VICTIM_KEYS, SETUP_KEYS$2, COMMAND_KEYS$3, SNAPSHOT_KEYS$1, IDENTITY_KEYS, SCENARIOS$1, ForcedKnockbackEncounter;
function init_special_movement_knockback() {
	return (init_special_movement_knockback = __esmMin((() => {
		init_arena_geometry();
		init_spatial();
		init_schema();
		DEFINITIONS = [{
			id: "squall-orb",
			displayName: "Squall Orb",
			cost: 4,
			kind: "effect",
			rarity: "uncommon",
			hitpoints: null,
			damage: 689,
			hitSpeedTicks: null,
			firstHitTicks: null,
			deployTimeTicks: null,
			rangeMillitiles: null,
			sightRangeMillitiles: null,
			movementMillitilesPerSecond: null,
			targetMode: "ground-and-air",
			count: 1,
			areaDamageRadiusMillitiles: 2500,
			components: []
		}];
		QUESTION_SOURCE = "unsourced-external-knockback-fixture";
		QUESTION_RECORDS = {
			arenaClamp: {
				key: "knockback-arena-clamp",
				value: "clamp-victim-center-to-radius-inset-closed-arena"
			},
			collision: {
				key: "knockback-collision-policy",
				value: "arena-boundary-only-with-no-unit-or-static-obstacle-resolution"
			},
			distance: {
				key: "knockback-distance",
				value: 2e3,
				units: "millitiles"
			},
			eligibility: {
				key: "knockback-eligibility",
				value: "caller-frozen-eligible-boolean-gates-living-victims"
			},
			interruption: {
				key: "knockback-interruption",
				value: "interrupt-at-or-before-pulse-boundary-suppresses-entire-pulse"
			},
			mappedAreaDamageRadius: {
				key: "mapped-unverified-field-area-damage-radius",
				value: 2500,
				units: "millitiles"
			},
			mappedTargets: {
				key: "mapped-unverified-field-targets",
				value: "ground-and-air"
			},
			order: {
				key: "knockback-victim-order",
				value: "ascending-stable-victim-id-after-whole-batch-validation"
			},
			timing: {
				key: "knockback-pulse-timing",
				value: "instantaneous-at-simulation-boundary-2-after-commands"
			},
			vector: {
				key: "knockback-vector-projection",
				value: "away-from-source-by-exact-integer-euclidean-components"
			},
			zeroVector: {
				key: "knockback-zero-vector",
				value: "reject-eligible-victim-coincident-with-source"
			}
		};
		SOURCE_ID = 700;
		PULSE_TICK = 2;
		MAX_TICK$3 = 4;
		MAX_VICTIMS = 16;
		MAX_COMMANDS$3 = 1;
		MAX_SNAPSHOT_BYTES$3 = 4096;
		MAX_ARENA_RADIUS = 9e3;
		MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
		MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
		VICTIM_KEYS = [
			"eligible",
			"id",
			"position",
			"radius"
		];
		SETUP_KEYS$2 = ["commands", "scenario"];
		COMMAND_KEYS$3 = ["tick", "type"];
		SNAPSHOT_KEYS$1 = [
			"identity",
			"tick",
			"version"
		];
		IDENTITY_KEYS = [
			"commands",
			"encounter",
			"scenario"
		];
		SCENARIOS$1 = Object.freeze({
			edge: Object.freeze({
				encounter: "edge-external-pulse-v1",
				source: Object.freeze({
					x: 3500,
					y: 4500
				}),
				victims: Object.freeze([Object.freeze({
					eligible: true,
					id: 31,
					position: Object.freeze({
						x: 500,
						y: 500
					}),
					radius: 400
				}), Object.freeze({
					eligible: false,
					id: 12,
					position: Object.freeze({
						x: 6500,
						y: 8500
					}),
					radius: 400
				})])
			}),
			open: Object.freeze({
				encounter: "open-external-pulse-v1",
				source: Object.freeze({
					x: 9e3,
					y: 16e3
				}),
				victims: Object.freeze([
					Object.freeze({
						eligible: true,
						id: 31,
						position: Object.freeze({
							x: 12e3,
							y: 2e4
						}),
						radius: 400
					}),
					Object.freeze({
						eligible: false,
						id: 20,
						position: Object.freeze({
							x: 9e3,
							y: 2e4
						}),
						radius: 400
					}),
					Object.freeze({
						eligible: true,
						id: 12,
						position: Object.freeze({
							x: 6e3,
							y: 12e3
						}),
						radius: 400
					})
				])
			})
		});
		ForcedKnockbackEncounter = class ForcedKnockbackEncounter {
			#commands;
			#events;
			#interrupted;
			#scenario;
			#tick;
			#victims;
			constructor(setup = createKnockbackSpecialFixture()) {
				const checked = checkedSetup$2(setup);
				this.#commands = checked.commands;
				this.#events = [];
				this.#interrupted = false;
				this.#scenario = checked.scenario;
				this.#tick = 0;
				this.#victims = clone$3(SCENARIOS$1[this.#scenario].victims);
			}
			get state() {
				return clone$3({
					events: this.#events,
					interrupted: this.#interrupted,
					sourceId: SOURCE_ID,
					terminal: this.#tick >= MAX_TICK$3,
					tick: this.#tick,
					victims: this.#victims
				});
			}
			step() {
				if (this.#tick >= MAX_TICK$3) return [];
				const boundary = this.#tick;
				const events = [];
				for (const command of this.#commands) if (command.tick === boundary) {
					this.#interrupted = true;
					events.push({
						tick: boundary,
						type: "external-pulse-interrupted"
					});
				}
				if (boundary === PULSE_TICK && !this.#interrupted) {
					const results = evaluateForcedKnockbackQuestionBoundary(SCENARIOS$1[this.#scenario].source, this.#victims);
					const positions = new Map(results.map(({ id, position }) => [id, position]));
					this.#victims = this.#victims.map((victim) => ({
						...victim,
						position: { ...positions.get(victim.id) }
					}));
					events.push({
						results,
						sourceId: SOURCE_ID,
						tick: boundary,
						type: "external-forced-knockback"
					});
				}
				this.#events.push(...clone$3(events));
				this.#tick += 1;
				return clone$3(events);
			}
			stepMany(ticks) {
				if (!Number.isSafeInteger(ticks) || ticks < 0) throw new TypeError("knockback ticks must be a non-negative safe integer");
				const events = [];
				for (let index = 0; index < ticks && this.#tick < MAX_TICK$3; index += 1) events.push(...this.step());
				return events;
			}
			run(tickLimit = MAX_TICK$3) {
				if (!Number.isSafeInteger(tickLimit) || tickLimit < 0) throw new TypeError("knockback tick limit must be a non-negative safe integer");
				if (tickLimit > MAX_TICK$3) throw new RangeError("knockback tick limit exceeds its bound");
				while (this.#tick < tickLimit) this.step();
				return this.state;
			}
			serialize() {
				const serialized = canonicalJson$3({
					identity: fixedIdentity(this.#commands, this.#scenario),
					tick: this.#tick,
					version: 1
				});
				if (byteLength(serialized) > MAX_SNAPSHOT_BYTES$3) throw new RangeError("knockback snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("knockback snapshot must be a string");
				if (byteLength(serialized) > MAX_SNAPSHOT_BYTES$3) throw new RangeError("knockback snapshot exceeds its byte bound");
				let parsed;
				try {
					parsed = JSON.parse(serialized);
				} catch {
					throw new TypeError("knockback snapshot must be valid JSON");
				}
				if (canonicalJson$3(parsed) !== serialized) throw new TypeError("knockback snapshot must use canonical JSON");
				const snapshot = exactDataObject(parsed, SNAPSHOT_KEYS$1, "knockback snapshot");
				if (snapshot.version !== 1) throw new TypeError("knockback snapshot version is unsupported");
				if (!Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0 || snapshot.tick > MAX_TICK$3) throw new TypeError("knockback snapshot.tick is invalid");
				const identity = exactDataObject(snapshot.identity, IDENTITY_KEYS, "knockback snapshot.identity");
				if (typeof identity.scenario !== "string" || !Object.hasOwn(SCENARIOS$1, identity.scenario) || identity.encounter !== SCENARIOS$1[identity.scenario].encounter) throw new TypeError("knockback snapshot identity is unsupported");
				const encounter = new ForcedKnockbackEncounter({
					commands: checkedCommands$3(identity.commands),
					scenario: identity.scenario
				});
				encounter.stepMany(snapshot.tick);
				return encounter;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/special-movement-charge-knockback.js
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
function denseArray$1(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function integer$1(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
}
function checkedPosition(value, label) {
	const position = exactRecord$2(value, ["x", "y"], label);
	integer$1(position.x, `${label}.x`, 0, 18e3);
	integer$1(position.y, `${label}.y`, 0, 32e3);
	return {
		x: position.x,
		y: position.y
	};
}
function checkedCandidate(value, label) {
	const candidate = exactRecord$2(value, CANDIDATE_KEYS, label);
	integer$1(candidate.id, `${label}.id`, 1);
	integer$1(candidate.health, `${label}.health`, 0, 1e6);
	integer$1(candidate.radius, `${label}.radius`, 0, 9e3);
	const position = checkedPosition(candidate.position, `${label}.position`);
	if (!["troop", "structure"].includes(candidate.kind)) throw new TypeError(`${label}.kind is invalid`);
	if (!["air", "ground"].includes(candidate.layer)) throw new TypeError(`${label}.layer is invalid`);
	if (typeof candidate.alive !== "boolean" || typeof candidate.targetable !== "boolean" || candidate.alive !== candidate.health > 0) throw new TypeError(`${label} lifecycle flags are invalid`);
	return {
		alive: candidate.alive,
		health: candidate.health,
		id: candidate.id,
		kind: candidate.kind,
		layer: candidate.layer,
		position,
		radius: candidate.radius,
		targetable: candidate.targetable
	};
}
function checkedCandidates(value) {
	const candidates = denseArray$1(value, MAX_CANDIDATES, "composition candidates").map((entry, index) => checkedCandidate(entry, `composition candidate ${index}`));
	const ids = /* @__PURE__ */ new Set();
	for (const candidate of candidates) {
		if (ids.has(candidate.id)) throw new TypeError("composition candidate IDs must be unique");
		ids.add(candidate.id);
	}
	return candidates.sort((left, right) => left.id - right.id);
}
function checkedCommand(value, index) {
	const command = exactRecord$2(value, COMMAND_KEYS$2, `composition command ${index}`);
	integer$1(command.tick, `composition command ${index}.tick`, 0, 999);
	if (!COMMAND_TYPES$2.has(command.type)) throw new TypeError(`composition command ${index}.type is invalid`);
	integer$1(command.targetId, `composition command ${index}.targetId`, 1);
	if (command.type === "set-candidate") {
		const candidate = checkedCandidate(command.candidate, `composition command ${index}.candidate`);
		if (candidate.id !== command.targetId || command.distance !== null || command.source !== null) throw new TypeError(`composition command ${index} fields disagree`);
		return {
			candidate,
			distance: null,
			source: null,
			targetId: command.targetId,
			tick: command.tick,
			type: command.type
		};
	}
	if (command.type === "remove-candidate") {
		if (command.candidate !== null || command.distance !== null || command.source !== null) throw new TypeError(`composition command ${index} fields are inapplicable`);
		return {
			candidate: null,
			distance: null,
			source: null,
			targetId: command.targetId,
			tick: command.tick,
			type: command.type
		};
	}
	if (command.candidate !== null || command.targetId !== UNIT.id) throw new TypeError(`composition command ${index} victim is unsupported`);
	integer$1(command.distance, `composition command ${index}.distance`, 1);
	const source = checkedPosition(command.source, `composition command ${index}.source`);
	return {
		candidate: null,
		distance: command.distance,
		source,
		targetId: command.targetId,
		tick: command.tick,
		type: command.type
	};
}
function checkedCommands$2(value) {
	const commands = denseArray$1(value, MAX_COMMANDS$2, "composition commands").map(checkedCommand);
	let priorTick = -1;
	const semanticKeys = /* @__PURE__ */ new Set();
	for (const command of commands) {
		if (command.tick < priorTick) throw new TypeError("composition commands must be ordered by tick");
		const semanticKey = canonicalJson$2({
			targetId: command.targetId,
			tick: command.tick,
			type: command.type
		});
		if (semanticKeys.has(semanticKey)) throw new TypeError("composition commands must not contain semantic duplicates");
		semanticKeys.add(semanticKey);
		priorTick = command.tick;
	}
	return commands;
}
function checkedSetup$1(value, preflight = true) {
	const setup = exactRecord$2(value, SETUP_KEYS$1, "composition setup");
	const candidates = checkedCandidates(setup.candidates);
	const commands = checkedCommands$2(setup.commands);
	const liveIds = new Set(candidates.map(({ id }) => id));
	for (const command of commands) if (command.type === "remove-candidate") liveIds.delete(command.targetId);
	else if (command.type === "set-candidate") {
		liveIds.add(command.targetId);
		if (liveIds.size > MAX_CANDIDATES) throw new RangeError("composition commands exceed candidate bound");
	}
	const checked = {
		candidates,
		commands
	};
	if (preflight && commands.length > 0) {
		const cacheKey = canonicalJson$2(checked);
		if (!PREFLIGHTED_SETUPS.has(cacheKey)) {
			new ChargeKnockbackRetargetEncounter(checked, INTERNAL_PREFLIGHT).stepMany(commands.at(-1).tick + 1, INTERNAL_PREFLIGHT);
			if (PREFLIGHTED_SETUPS.size >= MAX_PREFLIGHT_CACHE) PREFLIGHTED_SETUPS.clear();
			PREFLIGHTED_SETUPS.add(cacheKey);
		}
	}
	return checked;
}
function targetView$1(candidate) {
	return {
		alive: candidate.alive,
		id: candidate.id,
		kind: candidate.kind,
		layer: candidate.layer,
		position: { ...candidate.position },
		radius: candidate.radius,
		targetable: candidate.targetable
	};
}
function positionAtDistance(route, distance) {
	let remaining = distance;
	for (let index = 1; index < route.length; index += 1) {
		const from = route[index - 1];
		const to = route[index];
		const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
		if (remaining <= length) return {
			x: from.x + Math.sign(to.x - from.x) * remaining,
			y: from.y + Math.sign(to.y - from.y) * remaining
		};
		remaining -= length;
	}
	return { ...route.at(-1) };
}
function reached(position, candidate) {
	if (candidate === void 0) return false;
	const dx = BigInt(position.x - candidate.position.x);
	const dy = BigInt(position.y - candidate.position.y);
	const reach = BigInt(UNIT.radius + DEFINITION.rangeMillitiles + candidate.radius);
	return dx * dx + dy * dy <= reach * reach;
}
function event(type, tick, fields = {}) {
	return {
		...fields,
		tick,
		type
	};
}
function createChargeKnockbackCatalog() {
	return createCardCatalog([DEFINITION]);
}
function createChargeKnockbackFixture(candidates = clone$2(DEFAULT_CANDIDATES), commands = []) {
	return clone$2(checkedSetup$1({
		candidates,
		commands
	}));
}
var createChargeKnockbackQuestionRecords, DEFINITION, UNIT, DEFAULT_CANDIDATES, ARM_DISTANCE, BONUS_DAMAGE, CHARGED_SPEED, COMPOSITION_SIGHT, MAX_CANDIDATES, MAX_COMMANDS$2, MAX_EVENTS$1, MAX_PREFLIGHT_CACHE, MAX_TICK$2, MAX_SNAPSHOT_BYTES$2, INTERNAL_PREFLIGHT, PREFLIGHTED_SETUPS, CANDIDATE_KEYS, COMMAND_KEYS$2, SETUP_KEYS$1, COMMAND_TYPES$2, ChargeKnockbackRetargetEncounter;
function init_special_movement_charge_knockback() {
	return (init_special_movement_charge_knockback = __esmMin((() => {
		init_attack_cycle();
		init_movement();
		init_pathfinding();
		init_targeting();
		init_schema();
		init_session_troop_movement_question_authority();
		init_special_movement_knockback();
		createChargeKnockbackQuestionRecords = createChargeKnockbackQuestionRecords$1;
		DEFINITION = Object.freeze({
			areaDamageRadiusMillitiles: null,
			components: [],
			cost: 5,
			count: 1,
			damage: 392,
			deployTimeTicks: 60,
			displayName: "Emberlance",
			firstHitTicks: 54,
			hitSpeedTicks: 84,
			hitpoints: 1920,
			id: "emberlance",
			kind: "unit",
			movementMillitilesPerSecond: 1e3,
			rangeMillitiles: 1600,
			rarity: "special",
			sightRangeMillitiles: 5500,
			targetMode: "ground"
		});
		UNIT = Object.freeze({
			id: 101,
			position: Object.freeze({
				x: 3500,
				y: 11500
			}),
			radius: 0
		});
		DEFAULT_CANDIDATES = Object.freeze([Object.freeze({
			alive: true,
			health: 5e3,
			id: 202,
			kind: "troop",
			layer: "ground",
			position: Object.freeze({
				x: 3500,
				y: 18500
			}),
			radius: 0,
			targetable: true
		})]);
		ARM_DISTANCE = 3500;
		BONUS_DAMAGE = 392;
		CHARGED_SPEED = 2e3;
		COMPOSITION_SIGHT = 7e3;
		MAX_CANDIDATES = 16;
		MAX_COMMANDS$2 = 64;
		MAX_EVENTS$1 = 4096;
		MAX_PREFLIGHT_CACHE = 128;
		MAX_TICK$2 = 1e3;
		MAX_SNAPSHOT_BYTES$2 = 262144;
		INTERNAL_PREFLIGHT = Symbol("charge-knockback-preflight");
		PREFLIGHTED_SETUPS = /* @__PURE__ */ new Set();
		CANDIDATE_KEYS = [
			"alive",
			"health",
			"id",
			"kind",
			"layer",
			"position",
			"radius",
			"targetable"
		];
		COMMAND_KEYS$2 = [
			"candidate",
			"distance",
			"source",
			"targetId",
			"tick",
			"type"
		];
		SETUP_KEYS$1 = ["candidates", "commands"];
		COMMAND_TYPES$2 = /* @__PURE__ */ new Set([
			"knockback-attacker",
			"remove-candidate",
			"set-candidate"
		]);
		ChargeKnockbackRetargetEncounter = class ChargeKnockbackRetargetEncounter {
			#attack;
			#candidates;
			#chargeProgress = 0;
			#charged = false;
			#commandIndex = 0;
			#commands;
			#history = [];
			#movement;
			#position = { ...UNIT.position };
			#route;
			#selectedTargetId = null;
			#setup;
			#tick = 0;
			constructor(setup = createChargeKnockbackFixture(), internal = null) {
				this.#setup = checkedSetup$1(setup, internal !== INTERNAL_PREFLIGHT);
				this.#candidates = clone$2(this.#setup.candidates);
				this.#commands = clone$2(this.#setup.commands);
				this.#attack = new AttackCycle({
					deployTicks: DEFINITION.deployTimeTicks,
					firstHitTicks: DEFINITION.firstHitTicks,
					hitSpeedTicks: DEFINITION.hitSpeedTicks
				});
				this.#movement = createMovementState({
					direction: 1,
					position: 0,
					remainder: 0,
					speed: DEFINITION.movementMillitilesPerSecond
				});
				this.#route = findGroundPath(UNIT.position, DEFAULT_CANDIDATES[0].position);
				if (this.#route === null) throw new RangeError("composition route is unavailable");
			}
			get replay() {
				return clone$2(this.#history);
			}
			get route() {
				return clone$2(this.#route);
			}
			get state() {
				const selected = this.#candidates.find(({ id }) => id === this.#selectedTargetId);
				return clone$2({
					attack: this.#attack.state,
					candidates: this.#candidates,
					chargeProgressMillitiles: this.#chargeProgress,
					charged: this.#charged,
					movement: this.#movement,
					phase: this.#attack.state.phase === "deploying" ? "deploying" : selected === void 0 ? "inert" : reached(this.#position, selected) ? this.#attack.state.phase : this.#charged ? "charged-moving" : "moving",
					position: this.#position,
					selectedTargetId: this.#selectedTargetId,
					tick: this.#tick
				});
			}
			#resetCharge(boundary, emitted) {
				const hadProgress = this.#charged || this.#chargeProgress > 0;
				this.#chargeProgress = 0;
				this.#charged = false;
				this.#movement = createMovementState({
					direction: this.#selectedTargetId === null ? 0 : 1,
					position: 0,
					remainder: 0,
					speed: this.#selectedTargetId === null ? 0 : DEFINITION.movementMillitilesPerSecond
				});
				if (hadProgress) emitted.push(event("charge-reset", boundary));
			}
			#reroute(candidate) {
				if (candidate === void 0) return;
				const corner = {
					x: candidate.position.x,
					y: this.#position.y
				};
				this.#route = [
					{ ...this.#position },
					...corner.x === this.#position.x && corner.y === this.#position.y ? [] : [corner],
					...corner.x === candidate.position.x && corner.y === candidate.position.y ? [] : [{ ...candidate.position }]
				];
				if (this.#route.length === 1) this.#route.push({ ...candidate.position });
				this.#movement = createMovementState({
					direction: 1,
					position: 0,
					remainder: 0,
					speed: this.#charged ? CHARGED_SPEED : DEFINITION.movementMillitilesPerSecond
				});
			}
			#applyCommands(boundary, emitted) {
				const candidates = clone$2(this.#candidates);
				const commandEvents = [];
				let commandIndex = this.#commandIndex;
				let displaced = false;
				let position = { ...this.#position };
				while (this.#commands[commandIndex]?.tick === boundary) {
					const command = this.#commands[commandIndex];
					if (command.type === "knockback-attacker") {
						const result = evaluateForcedKnockbackQuestionBoundary(command.source, [{
							eligible: true,
							id: UNIT.id,
							position,
							radius: UNIT.radius
						}], command.distance)[0];
						position = { ...result.position };
						displaced ||= result.applied.x !== 0 || result.applied.y !== 0;
						commandEvents.push(event("forced-knockback", boundary, {
							result,
							source: { ...command.source },
							targetId: UNIT.id
						}));
					} else {
						const index = candidates.findIndex(({ id }) => id === command.targetId);
						if (command.type === "remove-candidate") {
							if (index !== -1) candidates.splice(index, 1);
						} else if (index === -1) candidates.push(clone$2(command.candidate));
						else candidates[index] = clone$2(command.candidate);
						candidates.sort((left, right) => left.id - right.id);
					}
					commandIndex += 1;
				}
				this.#candidates = candidates;
				this.#commandIndex = commandIndex;
				this.#position = position;
				emitted.push(...commandEvents);
				if (displaced) this.#resetCharge(boundary, emitted);
				return displaced;
			}
			step(...extra) {
				if (extra.length !== 0) throw new TypeError("composition step does not accept arguments");
				return this.stepMany(1);
			}
			stepMany(count, internal = null) {
				integer$1(count, "composition step count", 0, MAX_TICK$2);
				if (this.#tick + count > MAX_TICK$2) throw new RangeError("composition encounter exceeds its tick bound");
				if (internal === INTERNAL_PREFLIGHT) return this.#stepManyUnchecked(count);
				const priorTick = this.#tick;
				try {
					return this.#stepManyUnchecked(count);
				} catch (error) {
					const restored = new ChargeKnockbackRetargetEncounter(this.#setup, INTERNAL_PREFLIGHT);
					restored.#stepManyUnchecked(priorTick);
					this.#attack = restored.#attack;
					this.#candidates = restored.#candidates;
					this.#chargeProgress = restored.#chargeProgress;
					this.#charged = restored.#charged;
					this.#commandIndex = restored.#commandIndex;
					this.#commands = restored.#commands;
					this.#history = restored.#history;
					this.#movement = restored.#movement;
					this.#position = restored.#position;
					this.#route = restored.#route;
					this.#selectedTargetId = restored.#selectedTargetId;
					this.#tick = restored.#tick;
					throw error;
				}
			}
			#stepManyUnchecked(count) {
				const emitted = [];
				for (let offset = 0; offset < count; offset += 1) {
					const boundary = this.#tick;
					const priorTargetId = this.#selectedTargetId;
					const displaced = this.#applyCommands(boundary, emitted);
					const nextId = retainOrAcquireTarget({
						position: this.#position,
						radius: UNIT.radius
					}, this.#candidates.map(targetView$1), {
						currentTargetId: this.#selectedTargetId,
						mode: DEFINITION.targetMode,
						sightRange: COMPOSITION_SIGHT
					})?.id ?? null;
					if (nextId !== this.#selectedTargetId) {
						if (this.#selectedTargetId !== null) emitted.push(event("target-lost", boundary, { targetId: this.#selectedTargetId }));
						this.#selectedTargetId = nextId;
						if (nextId !== null) emitted.push(event("target-acquired", boundary, { targetId: nextId }));
						if (!displaced) this.#resetCharge(boundary, emitted);
					}
					const candidate = this.#candidates.find(({ id }) => id === nextId);
					if (candidate !== void 0 && (displaced || nextId !== priorTargetId)) this.#reroute(candidate);
					let isReached = reached(this.#position, candidate);
					if (boundary >= DEFINITION.deployTimeTicks && candidate !== void 0 && !isReached) {
						const priorDistance = this.#movement.position;
						this.#movement = advanceMovement(this.#movement);
						const travelled = this.#movement.position - priorDistance;
						this.#chargeProgress += travelled;
						this.#position = positionAtDistance(this.#route, this.#movement.position);
						isReached = reached(this.#position, candidate);
						emitted.push(event("move", boundary, { position: { ...this.#position } }));
						if (!this.#charged && this.#chargeProgress >= ARM_DISTANCE) {
							this.#charged = true;
							this.#movement = createMovementState({
								direction: 1,
								position: this.#movement.position,
								remainder: this.#movement.remainder,
								speed: CHARGED_SPEED
							});
							emitted.push(event("charge-armed", boundary, { distanceMillitiles: ARM_DISTANCE }));
						}
						if (isReached) emitted.push(event("reached", boundary, {
							position: { ...this.#position },
							targetId: candidate.id
						}));
					}
					const ready = this.#attack.step({
						targetEligible: candidate !== void 0 && isReached,
						targetId: candidate !== void 0 && isReached ? candidate.id : null
					});
					for (const readyEvent of ready) {
						const target = this.#candidates.find(({ id }) => id === readyEvent.targetId);
						if (target === void 0 || !target.alive || !reached(this.#position, target)) continue;
						const chargedStrike = this.#charged;
						const bonusAmount = chargedStrike ? BONUS_DAMAGE : 0;
						const amount = DEFINITION.damage + bonusAmount;
						const healthBefore = target.health;
						target.health = Math.max(0, target.health - amount);
						target.alive = target.health > 0;
						emitted.push(event("attack", boundary, {
							amount,
							baseAmount: DEFINITION.damage,
							bonusAmount,
							charged: chargedStrike,
							currentHealth: target.health,
							healthBefore,
							sequence: readyEvent.sequence,
							targetId: target.id
						}));
						if (!target.alive) emitted.push(event("death", boundary, { targetId: target.id }));
						if (chargedStrike) {
							this.#charged = false;
							this.#chargeProgress = 0;
							this.#movement = createMovementState({
								direction: 1,
								position: this.#movement.position,
								remainder: this.#movement.remainder,
								speed: DEFINITION.movementMillitilesPerSecond
							});
							emitted.push(event("charge-consumed", boundary));
						}
					}
					this.#tick += 1;
				}
				if (this.#history.length + emitted.length > MAX_EVENTS$1) throw new RangeError("composition event bound exceeded");
				this.#history.push(...clone$2(emitted));
				return clone$2(emitted);
			}
			serialize() {
				const serialized = canonicalJson$2({
					setup: this.#setup,
					tick: this.#tick,
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$2) throw new RangeError("composition snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("composition snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$2) throw new RangeError("composition snapshot exceeds its byte bound");
				let parsed;
				try {
					parsed = JSON.parse(serialized);
				} catch {
					throw new TypeError("composition snapshot must be valid JSON");
				}
				if (canonicalJson$2(parsed) !== serialized) throw new TypeError("composition snapshot must be canonical");
				const snapshot = exactRecord$2(parsed, [
					"setup",
					"tick",
					"version"
				], "composition snapshot");
				if (snapshot.version !== 1) throw new TypeError("composition snapshot version is unsupported");
				integer$1(snapshot.tick, "composition snapshot.tick", 0, MAX_TICK$2);
				const restored = new ChargeKnockbackRetargetEncounter(snapshot.setup);
				restored.stepMany(snapshot.tick);
				if (restored.serialize() !== serialized) throw new TypeError("composition snapshot is not reproducible");
				return restored;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/special-movement-leap-knockback.js
function clone$1(value) {
	return structuredClone(value);
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
function integer(value, label, minimum, maximum) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
}
function checkedPoint(value, label) {
	const point = exactRecord$1(value, ["x", "y"], label);
	integer(point.x, `${label}.x`, 0, 18e3);
	integer(point.y, `${label}.y`, 0, 32e3);
	return {
		x: point.x,
		y: point.y
	};
}
function checkedCommands$1(value) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX_COMMANDS$1) throw new TypeError("leap composition commands must be a bounded plain array");
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError("leap composition commands must be dense data");
	let previousTick = -1;
	let landingPostStageSeen = false;
	return Array.from({ length: value.length }, (_, index) => {
		const command = exactRecord$1(descriptors[index].value, COMMAND_KEYS$1, `leap composition command ${index}`);
		integer(command.tick, `leap composition command ${index}.tick`, 0, 199);
		if (command.tick < previousTick) throw new TypeError("leap composition commands must be tick ordered");
		if (command.tick !== previousTick) landingPostStageSeen = false;
		previousTick = command.tick;
		if (!COMMAND_TYPES$1.has(command.type)) throw new TypeError(`leap composition command ${index}.type is invalid`);
		if (command.type !== "displace-jumper" && command.type !== "interrupt") {
			integer(command.targetId, `leap composition command ${index}.targetId`, 202, 207);
			if (!CANDIDATES.some(({ id }) => id === command.targetId)) throw new TypeError("leap composition target ID is unsupported");
		} else if (command.targetId !== null) throw new TypeError("leap composition target ID must be null");
		const displacement = command.type.startsWith("displace-");
		const landingPostStage = command.tick === LANDING_TICK && command.type === "displace-jumper";
		if (!landingPostStage && landingPostStageSeen) throw new TypeError("landing-boundary pre-impact commands must precede jumper displacement");
		landingPostStageSeen ||= landingPostStage;
		const source = displacement ? checkedPoint(command.source, `leap composition command ${index}.source`) : null;
		if (displacement) integer(command.distance, `leap composition command ${index}.distance`, 1, 32e3);
		else if (command.distance !== null || command.source !== null) throw new TypeError("non-displacement command geometry must be null");
		return {
			distance: command.distance,
			source,
			targetId: command.targetId,
			tick: command.tick,
			type: command.type
		};
	});
}
function recursivelyFreeze(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) recursivelyFreeze(child);
		Object.freeze(value);
	}
	return value;
}
function question(key, value) {
	return recursivelyFreeze({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		key,
		source: "unsourced-leap-knockback-retarget-composition",
		value: clone$1(value)
	});
}
function interpolate$1(from, to, elapsed) {
	return {
		x: from.x + Number(BigInt(to.x - from.x) * BigInt(elapsed) / 36n),
		y: from.y + Number(BigInt(to.y - from.y) * BigInt(elapsed) / 36n)
	};
}
function targetView(candidate) {
	return {
		alive: candidate.health > 0,
		id: candidate.id,
		kind: candidate.kind,
		layer: candidate.layer,
		position: { ...candidate.position },
		radius: candidate.radius,
		targetable: candidate.targetable
	};
}
function inAttackReach(position, candidate) {
	const dx = BigInt(candidate.position.x - position.x);
	const dy = BigInt(candidate.position.y - position.y);
	const reach = BigInt(1500 + candidate.radius);
	return dx * dx + dy * dy <= reach * reach;
}
function knockback(source, entity, distance) {
	return evaluateForcedKnockbackQuestionBoundary(source, [{
		eligible: true,
		id: entity.id,
		position: entity.position,
		radius: entity.radius
	}], distance)[0];
}
function createLeapKnockbackFixture(commands = []) {
	return { commands: clone$1(checkedCommands$1(commands)) };
}
function createLeapKnockbackQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("leap composition questions do not accept overrides");
	return recursivelyFreeze(Object.fromEntries(Object.entries(QUESTION_VALUES$1).map(([key, value]) => [key, question(key, value)])));
}
var TAKEOFF_TICK, LANDING_TICK, MAX_TICK$1, MAX_COMMANDS$1, MAX_SNAPSHOT_BYTES$1, JUMPER_ID, INITIAL_POSITION, LANDING_DAMAGE, LANDING_RADIUS, FIRST_HIT_TICKS, HIT_SPEED_TICKS, SIGHT_RANGE, CANDIDATES, QUESTION_VALUES$1, COMMAND_KEYS$1, COMMAND_TYPES$1, LeapKnockbackRetargetEncounter;
function init_special_movement_leap_knockback() {
	return (init_special_movement_leap_knockback = __esmMin((() => {
		init_area_damage();
		init_attack_cycle();
		init_targeting();
		init_special_movement_knockback();
		TAKEOFF_TICK = 60;
		LANDING_TICK = 96;
		MAX_TICK$1 = 200;
		MAX_COMMANDS$1 = 32;
		MAX_SNAPSHOT_BYTES$1 = 65536;
		JUMPER_ID = 101;
		INITIAL_POSITION = Object.freeze({
			x: 3500,
			y: 11500
		});
		LANDING_DAMAGE = 536;
		LANDING_RADIUS = 1300;
		FIRST_HIT_TICKS = 42;
		HIT_SPEED_TICKS = 102;
		SIGHT_RANGE = 5500;
		CANDIDATES = Object.freeze([
			Object.freeze({
				health: 1e3,
				id: 202,
				kind: "troop",
				layer: "ground",
				position: Object.freeze({
					x: 3500,
					y: 15500
				}),
				radius: 0,
				targetable: true
			}),
			Object.freeze({
				health: 536,
				id: 203,
				kind: "troop",
				layer: "ground",
				position: Object.freeze({
					x: 4800,
					y: 15500
				}),
				radius: 0,
				targetable: true
			}),
			Object.freeze({
				health: 1e3,
				id: 204,
				kind: "troop",
				layer: "ground",
				position: Object.freeze({
					x: 4801,
					y: 15500
				}),
				radius: 0,
				targetable: true
			}),
			Object.freeze({
				health: 1e3,
				id: 205,
				kind: "troop",
				layer: "air",
				position: Object.freeze({
					x: 3500,
					y: 15500
				}),
				radius: 0,
				targetable: true
			}),
			Object.freeze({
				health: 1e3,
				id: 206,
				kind: "troop",
				layer: "ground",
				position: Object.freeze({
					x: 3500,
					y: 15500
				}),
				radius: 0,
				targetable: false
			}),
			Object.freeze({
				health: 536,
				id: 207,
				kind: "structure",
				layer: "ground",
				position: Object.freeze({
					x: 4800,
					y: 15500
				}),
				radius: 0,
				targetable: true
			})
		]);
		QUESTION_VALUES$1 = Object.freeze({
			airborneAttackEligibility: "airborne-jumper-cannot-acquire-or-wind-attacks",
			airborneTargetability: "jumper-is-untargetable-from-takeoff-through-transit",
			commandPriority: "commands-before-leap-boundary-actions",
			displacementAtLanding: "jumper-displacement-on-landing-boundary-resolves-after-impact",
			displacementPrelaunch: "grounded-displacement-changes-takeoff-origin",
			displacementTransit: "forced-displacement-interrupts-at-last-completed-transit-position",
			interruptionImpact: "interrupted-leap-deals-no-landing-damage",
			landingDamage: LANDING_DAMAGE,
			landingDeathOrder: "area-hit-damage-death-before-leap-complete",
			landingRadiusMillitiles: LANDING_RADIUS,
			landingTargetEligibility: "living-targetable-ground-candidates-at-impact-boundary",
			postLandingRetention: "dead-snapshot-target-is-invalidated",
			reacquisitionBoundary: "first-boundary-after-landing-or-interruption",
			reacquisitionTieBreak: "nearest-then-ascending-stable-id",
			restoredTargetEligibility: "restoration-before-impact-reincludes-a-living-ground-candidate",
			snapshotDestination: "target-position-at-takeoff",
			targetInvalidationTransit: "destination-remains-snapshotted-but-ineligible-target-is-not-damaged",
			targetRestorationTransit: "same-id-restoration-does-not-change-snapshotted-destination",
			targetabilityRestoreOrder: "restore-jumper-targetability-before-landing-or-interruption-event",
			windupAfterReacquisition: "full-fresh-42-tick-first-hit-windup"
		});
		COMMAND_KEYS$1 = [
			"distance",
			"source",
			"targetId",
			"tick",
			"type"
		];
		COMMAND_TYPES$1 = /* @__PURE__ */ new Set([
			"displace-jumper",
			"displace-target",
			"interrupt",
			"invalidate-target",
			"restore-target"
		]);
		LeapKnockbackRetargetEncounter = class LeapKnockbackRetargetEncounter {
			#area = new AreaDamageSystem();
			#attack = new AttackCycle({
				deployTicks: 0,
				firstHitTicks: FIRST_HIT_TICKS,
				hitSpeedTicks: HIT_SPEED_TICKS
			});
			#candidates = clone$1(CANDIDATES);
			#commandIndex = 0;
			#commands;
			#history = [];
			#jump = null;
			#jumpFinished = false;
			#position = { ...INITIAL_POSITION };
			#retargetAfterTick = null;
			#selectedTargetId = null;
			#targetable = true;
			#tick = 0;
			constructor(setup = createLeapKnockbackFixture()) {
				const checked = exactRecord$1(setup, ["commands"], "leap composition setup");
				this.#commands = checkedCommands$1(checked.commands);
				for (const candidate of this.#candidates) this.#area.add(candidate.id, candidate.health);
			}
			get replay() {
				return clone$1(this.#history);
			}
			get state() {
				return clone$1({
					airborne: this.#jump !== null,
					attack: this.#attack.state,
					candidates: this.#candidates,
					jump: this.#jump,
					jumpFinished: this.#jumpFinished,
					position: this.#position,
					selectedTargetId: this.#selectedTargetId,
					targetable: this.#targetable,
					tick: this.#tick
				});
			}
			#interrupt(boundary, events, reason) {
				if (this.#jumpFinished) return;
				const phase = this.#jump === null ? "pretakeoff" : "transit";
				this.#jump = null;
				if (!this.#targetable) {
					this.#targetable = true;
					events.push({
						targetable: true,
						tick: boundary,
						type: "targetability-changed"
					});
				}
				this.#jumpFinished = true;
				this.#retargetAfterTick = boundary;
				events.push({
					phase,
					position: { ...this.#position },
					reason,
					tick: boundary,
					type: "jump-interrupted"
				});
			}
			#applyDisplacement(command, boundary, events) {
				const jumper = command.type === "displace-jumper";
				const entity = jumper ? {
					id: JUMPER_ID,
					position: this.#position,
					radius: 0
				} : this.#candidates.find(({ id }) => id === command.targetId);
				const result = knockback(command.source, entity, command.distance);
				if (jumper) {
					if (this.#jump !== null && boundary < LANDING_TICK) this.#interrupt(boundary, events, "forced-displacement");
					this.#position = { ...result.position };
				} else entity.position = { ...result.position };
				events.push({
					result,
					targetId: entity.id,
					tick: boundary,
					type: "external-forced-knockback"
				});
			}
			#applyCommands(boundary, events, postLanding) {
				const candidatePositions = new Map(this.#candidates.map(({ id, position }) => [id, { ...position }]));
				let jumperPosition = { ...this.#position };
				let validationIndex = this.#commandIndex;
				while (this.#commands[validationIndex]?.tick === boundary) {
					const command = this.#commands[validationIndex];
					if ((boundary === LANDING_TICK && command.type === "displace-jumper") !== postLanding) break;
					if (command.type.startsWith("displace-")) {
						const jumper = command.type === "displace-jumper";
						const entity = jumper ? {
							id: JUMPER_ID,
							position: jumperPosition,
							radius: 0
						} : {
							id: command.targetId,
							position: candidatePositions.get(command.targetId),
							radius: this.#candidates.find(({ id }) => id === command.targetId).radius
						};
						const result = knockback(command.source, entity, command.distance);
						if (jumper) jumperPosition = result.position;
						else candidatePositions.set(command.targetId, result.position);
					}
					validationIndex += 1;
				}
				while (this.#commands[this.#commandIndex]?.tick === boundary) {
					const command = this.#commands[this.#commandIndex];
					if ((boundary === LANDING_TICK && command.type === "displace-jumper") !== postLanding) break;
					this.#commandIndex += 1;
					if (command.type.startsWith("displace-")) this.#applyDisplacement(command, boundary, events);
					else if (command.type === "interrupt") this.#interrupt(boundary, events, "explicit-interruption");
					else {
						const target = this.#candidates.find(({ id }) => id === command.targetId);
						target.targetable = command.type === "restore-target";
						events.push({
							targetId: target.id,
							targetable: target.targetable,
							tick: boundary,
							type: "candidate-targetability-changed"
						});
					}
				}
			}
			#landing(boundary, events) {
				const targetId = this.#jump.targetId;
				this.#jump = null;
				this.#targetable = true;
				events.push({
					targetable: true,
					tick: boundary,
					type: "targetability-changed"
				});
				events.push({
					position: { ...this.#position },
					targetId,
					tick: boundary,
					type: "jump-landed"
				});
				const result = this.#area.resolve({
					center: { ...this.#position },
					damage: LANDING_DAMAGE,
					mode: "ground",
					radius: LANDING_RADIUS,
					tick: boundary
				}, this.#candidates.map(targetView));
				events.push(...result.events);
				for (const candidate of this.#candidates) candidate.health = this.#area.get(candidate.id).currentHealth;
				this.#jumpFinished = true;
				this.#retargetAfterTick = boundary;
				this.#selectedTargetId = targetId;
				events.push({
					tick: boundary,
					type: "encounter-complete"
				});
			}
			#retarget(boundary, events) {
				if (!this.#jumpFinished || !this.#targetable) return;
				const nextId = retainOrAcquireTarget({
					position: this.#position,
					radius: 0
				}, this.#candidates.map(targetView), {
					currentTargetId: this.#selectedTargetId,
					mode: "ground",
					sightRange: SIGHT_RANGE
				})?.id ?? null;
				if (nextId !== this.#selectedTargetId) {
					if (this.#selectedTargetId !== null) events.push({
						targetId: this.#selectedTargetId,
						tick: boundary,
						type: "target-lost"
					});
					this.#selectedTargetId = nextId;
					if (nextId !== null) events.push({
						targetId: nextId,
						tick: boundary,
						type: "target-acquired"
					});
				}
				const candidate = this.#candidates.find(({ id }) => id === nextId);
				const ready = this.#attack.step({
					targetEligible: candidate !== void 0 && inAttackReach(this.#position, candidate),
					targetId: nextId
				});
				events.push(...ready.map((readyEvent) => ({
					...readyEvent,
					tick: boundary
				})));
			}
			step() {
				if (this.#tick >= MAX_TICK$1) return [];
				const boundary = this.#tick;
				const events = [];
				this.#applyCommands(boundary, events, false);
				if (boundary === 0 && !this.#jumpFinished) {
					const selected = acquireTarget({
						position: this.#position,
						radius: 0
					}, this.#candidates.map(targetView), {
						mode: "ground",
						sightRange: SIGHT_RANGE
					});
					this.#selectedTargetId = selected?.id ?? null;
					if (selected !== null) events.push({
						targetId: selected.id,
						tick: boundary,
						type: "target-acquired"
					});
				}
				if (boundary === TAKEOFF_TICK && !this.#jumpFinished) {
					const target = this.#candidates.find(({ id }) => id === this.#selectedTargetId);
					if (target === void 0 || !target.targetable || target.health === 0) this.#interrupt(boundary, events, "no-eligible-target");
					else {
						this.#jump = {
							elapsedTicks: 0,
							from: { ...this.#position },
							targetId: target.id,
							to: { ...target.position }
						};
						this.#targetable = false;
						events.push({
							from: { ...this.#jump.from },
							targetId: target.id,
							tick: boundary,
							to: { ...this.#jump.to },
							type: "jump-takeoff"
						});
						events.push({
							targetable: false,
							tick: boundary,
							type: "targetability-changed"
						});
					}
				}
				if (this.#jump !== null && boundary > TAKEOFF_TICK) {
					this.#jump.elapsedTicks += 1;
					this.#position = interpolate$1(this.#jump.from, this.#jump.to, this.#jump.elapsedTicks);
					events.push({
						elapsedTicks: this.#jump.elapsedTicks,
						position: { ...this.#position },
						tick: boundary,
						type: "jump-move"
					});
					if (this.#jump.elapsedTicks === 36) this.#landing(boundary, events);
				}
				this.#applyCommands(boundary, events, true);
				if (this.#retargetAfterTick !== null && boundary > this.#retargetAfterTick) this.#retarget(boundary, events);
				this.#tick += 1;
				this.#history.push(...clone$1(events));
				return clone$1(events);
			}
			stepMany(count) {
				integer(count, "leap composition step count", 0, MAX_TICK$1);
				if (this.#tick + count > MAX_TICK$1) throw new RangeError("leap composition exceeds its tick bound");
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...this.step());
				return events;
			}
			run() {
				return this.stepMany(MAX_TICK$1 - this.#tick);
			}
			serialize() {
				const serialized = canonicalJson$1({
					setup: { commands: this.#commands },
					tick: this.#tick,
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$1) throw new RangeError("leap composition snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("leap composition snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES$1) throw new RangeError("leap composition snapshot exceeds its byte bound");
				let parsed;
				try {
					parsed = JSON.parse(serialized);
				} catch {
					throw new TypeError("leap composition snapshot must be valid JSON");
				}
				if (canonicalJson$1(parsed) !== serialized) throw new TypeError("leap composition snapshot must be canonical JSON");
				const snapshot = exactRecord$1(parsed, [
					"setup",
					"tick",
					"version"
				], "leap composition snapshot");
				if (snapshot.version !== 1) throw new TypeError("leap composition snapshot version is unsupported");
				integer(snapshot.tick, "leap composition snapshot.tick", 0, MAX_TICK$1);
				const restored = new LeapKnockbackRetargetEncounter(snapshot.setup);
				restored.stepMany(snapshot.tick);
				if (restored.serialize() !== serialized) throw new TypeError("leap composition snapshot is not reproducible");
				return restored;
			}
		};
	})))();
}
//#endregion
//#region src/content/cards/special-movement-dash-knockback.js
function clone(value) {
	return structuredClone(value);
}
function freeze(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) freeze(child);
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
function denseArray(value, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX_COMMANDS) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1 || Array.from({ length: value.length }, (_, index) => index).some((index) => !descriptors[index]?.enumerable || !Object.hasOwn(descriptors[index], "value"))) throw new TypeError(`${label} must contain dense data properties`);
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function checkedCommands(value) {
	const commands = denseArray(value, "dash-knockback commands").map((entry, index) => {
		const command = exactRecord(entry, COMMAND_KEYS, `dash-knockback command ${index}`);
		if (!Number.isSafeInteger(command.tick) || command.tick < 0 || command.tick >= MAX_TICK) throw new TypeError(`dash-knockback command ${index}.tick is invalid`);
		if (!COMMAND_TYPES.has(command.type)) throw new TypeError(`dash-knockback command ${index}.type is invalid`);
		if (command.type === "interrupt" && (command.tick < LAUNCH_TICK || command.tick > ARRIVAL_TICK)) throw new TypeError("dash interruption must occur from launch through arrival");
		if (command.type === "target-killed" && command.tick > ARRIVAL_TICK) throw new TypeError("target death must occur no later than arrival");
		return {
			tick: command.tick,
			type: command.type
		};
	});
	let prior = -1;
	const seen = /* @__PURE__ */ new Set();
	let pulseCount = 0;
	for (const command of commands) {
		if (command.tick < prior) throw new TypeError("dash-knockback commands must be tick ordered");
		const identity = `${command.tick}:${command.type}`;
		if (seen.has(identity)) throw new TypeError("dash-knockback commands must be unique");
		seen.add(identity);
		if (command.type === "knockback") pulseCount += 1;
		prior = command.tick;
	}
	if (pulseCount > 1) throw new TypeError("dash-knockback fixture supports only one external pulse");
	return commands;
}
function checkedSetup(value) {
	const setup = exactRecord(value, SETUP_KEYS, "dash-knockback setup");
	if (typeof setup.scenario !== "string" || !Object.hasOwn(SCENARIOS, setup.scenario)) throw new TypeError("dash-knockback setup.scenario is invalid");
	return {
		commands: checkedCommands(setup.commands),
		scenario: setup.scenario
	};
}
function interpolate(from, to, elapsed) {
	return {
		x: from.x + Number(BigInt(to.x - from.x) * BigInt(elapsed) / BigInt(TRANSIT_TICKS)),
		y: from.y + Number(BigInt(to.y - from.y) * BigInt(elapsed) / BigInt(TRANSIT_TICKS))
	};
}
function candidate(id, position, alive = true) {
	return {
		alive,
		id,
		kind: "troop",
		layer: "ground",
		position: { ...position },
		radius: 0,
		targetable: true
	};
}
function questionRecord(key, value) {
	return freeze({
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		key,
		source: "unsourced-dash-knockback-retarget-composition",
		value: clone(value)
	});
}
function createDashKnockbackQuestionRecords(...args) {
	if (args.length !== 0) throw new TypeError("dash-knockback question records do not accept overrides");
	return freeze(Object.fromEntries(Object.entries(QUESTION_VALUES).map(([key, value]) => [key, questionRecord(key, value)])));
}
function createDashKnockbackFixture(commands = [], scenario = "baseline") {
	return clone(checkedSetup({
		commands,
		scenario
	}));
}
var MAX_TICK, MAX_COMMANDS, MAX_EVENTS, MAX_SNAPSHOT_BYTES, LAUNCH_TICK, TRANSIT_TICKS, ARRIVAL_TICK, DASH_DAMAGE, KNOCKBACK_DISTANCE, COMMAND_KEYS, SETUP_KEYS, SNAPSHOT_KEYS, COMMAND_TYPES, SCENARIOS, QUESTION_VALUES, DashKnockbackRetargetEncounter;
function init_special_movement_dash_knockback() {
	return (init_special_movement_dash_knockback = __esmMin((() => {
		init_attack_cycle();
		init_targeting();
		init_special_movement_knockback();
		MAX_TICK = 140;
		MAX_COMMANDS = 8;
		MAX_EVENTS = 512;
		MAX_SNAPSHOT_BYTES = 32768;
		LAUNCH_TICK = 60;
		TRANSIT_TICKS = 30;
		ARRIVAL_TICK = 89;
		DASH_DAMAGE = 386;
		KNOCKBACK_DISTANCE = 2e3;
		COMMAND_KEYS = ["tick", "type"];
		SETUP_KEYS = ["commands", "scenario"];
		SNAPSHOT_KEYS = [
			"setup",
			"tick",
			"version"
		];
		COMMAND_TYPES = /* @__PURE__ */ new Set([
			"interrupt",
			"knockback",
			"target-killed"
		]);
		SCENARIOS = Object.freeze({
			baseline: Object.freeze({
				attacker: Object.freeze({
					position: Object.freeze({
						x: 3500,
						y: 11500
					}),
					radius: 300
				}),
				backup: Object.freeze({
					id: 303,
					position: Object.freeze({
						x: 4500,
						y: 16500
					})
				}),
				encounter: "veilrunner-dash-knockback-baseline-v1",
				knockbackSource: Object.freeze({
					x: 5500,
					y: 16500
				}),
				target: Object.freeze({
					health: 1e3,
					id: 202,
					position: Object.freeze({
						x: 3500,
						y: 16500
					})
				})
			}),
			clamp: Object.freeze({
				attacker: Object.freeze({
					position: Object.freeze({
						x: 1500,
						y: 11500
					}),
					radius: 300
				}),
				backup: Object.freeze({
					id: 303,
					position: Object.freeze({
						x: 2500,
						y: 16500
					})
				}),
				encounter: "veilrunner-dash-knockback-clamp-v1",
				knockbackSource: Object.freeze({
					x: 3500,
					y: 16500
				}),
				target: Object.freeze({
					health: 1e3,
					id: 202,
					position: Object.freeze({
						x: 1500,
						y: 16500
					})
				})
			}),
			diagonal: Object.freeze({
				attacker: Object.freeze({
					position: Object.freeze({
						x: 3500,
						y: 11500
					}),
					radius: 300
				}),
				backup: Object.freeze({
					id: 303,
					position: Object.freeze({
						x: 7500,
						y: 15500
					})
				}),
				encounter: "veilrunner-dash-knockback-diagonal-v1",
				knockbackSource: Object.freeze({
					x: 8500,
					y: 15500
				}),
				target: Object.freeze({
					health: 1e3,
					id: 202,
					position: Object.freeze({
						x: 6500,
						y: 15500
					})
				})
			}),
			fragile: Object.freeze({
				attacker: Object.freeze({
					position: Object.freeze({
						x: 3500,
						y: 11500
					}),
					radius: 300
				}),
				backup: Object.freeze({
					id: 303,
					position: Object.freeze({
						x: 4500,
						y: 16500
					})
				}),
				encounter: "veilrunner-dash-knockback-fragile-v1",
				knockbackSource: Object.freeze({
					x: 5500,
					y: 16500
				}),
				target: Object.freeze({
					health: 386,
					id: 202,
					position: Object.freeze({
						x: 3500,
						y: 16500
					})
				})
			})
		});
		QUESTION_VALUES = Object.freeze({
			arrivalBoundaryOrder: [
				"dash-move",
				"targetability-restored",
				"dash-arrived",
				"dash-damage-or-skip",
				"forced-knockback"
			],
			arrivalDamage: "snapshotted-living-target-takes-base-plus-bonus-before-retarget",
			arrivalKnockbackEligibility: "eligible-after-targetability-restoration",
			attackAfterDash: "ordinary-attack-cycle-starts-only-on-next-boundary",
			attackDamage: "composition-observes-readiness-without-applying-ordinary-damage",
			collisionPolicy: "arena-boundary-only-no-unit-or-obstacle-resolution",
			commandPriority: "commands-before-dash-transition-before-arrival-knockback",
			diagonalInterpolation: "integer-truncate-toward-zero-from-launch-snapshot",
			fullFreshWindup: 36,
			interruption: "stop-at-last-completed-position-and-restore-targetability",
			interruptionKnockbackEligibility: "interrupt-restoration-makes-same-boundary-pulse-eligible",
			knockbackDistanceMillitiles: KNOCKBACK_DISTANCE,
			knockbackDirection: "horizontal-away-from-scenario-source-x-aligned-to-current-y",
			nextBoundaryReacquisition: true,
			prelaunchDisplacement: "displacement-updates-launch-origin-with-target-snapshot-unchanged",
			prelaunchKnockbackEligibility: "eligible-while-targetable",
			retargetOrigin: "current-post-dash-or-post-knockback-position",
			stableIdReacquisition: "shared-nearest-selection-with-ascending-id-tie-break",
			targetDeathDuringTransit: "continue-to-snapshot-skip-arrival-damage-then-reacquire",
			targetabilityDuringTransit: false,
			targetabilityRestoration: "arrival-or-interruption-boundary-before-next-boundary-selection",
			transitKnockbackEligibility: "ineligible-while-untargetable-and-pulse-is-skipped"
		});
		DashKnockbackRetargetEncounter = class DashKnockbackRetargetEncounter {
			#attack = null;
			#commands;
			#commandIndex = 0;
			#history = [];
			#launch = null;
			#phase = "deploying";
			#position;
			#scenario;
			#selectedTargetId = 202;
			#setup;
			#targetAlive = true;
			#targetHealth;
			#targetable = true;
			#tick = 0;
			constructor(setup = createDashKnockbackFixture()) {
				this.#setup = checkedSetup(setup);
				this.#commands = clone(this.#setup.commands);
				this.#scenario = SCENARIOS[this.#setup.scenario];
				this.#position = { ...this.#scenario.attacker.position };
				this.#targetHealth = this.#scenario.target.health;
			}
			get replay() {
				return clone(this.#history);
			}
			get state() {
				return clone({
					attack: this.#attack?.state ?? null,
					inTransit: this.#launch !== null,
					phase: this.#phase,
					position: this.#position,
					selectedTargetId: this.#selectedTargetId,
					targetAlive: this.#targetAlive,
					targetHealth: this.#targetHealth,
					targetable: this.#targetable,
					terminal: this.#tick >= MAX_TICK,
					tick: this.#tick
				});
			}
			#pulse(boundary, events) {
				if (!this.#targetable) {
					events.push({
						eligible: false,
						reason: "dash-unit-untargetable",
						tick: boundary,
						type: "forced-knockback-skipped"
					});
					return;
				}
				const [result] = evaluateForcedKnockbackQuestionBoundary({
					x: this.#scenario.knockbackSource.x,
					y: this.#position.y
				}, [{
					eligible: true,
					id: 101,
					position: this.#position,
					radius: this.#scenario.attacker.radius
				}], KNOCKBACK_DISTANCE);
				this.#position = { ...result.position };
				events.push({
					result,
					tick: boundary,
					type: "forced-knockback"
				});
			}
			#startRetarget() {
				this.#phase = "retargeting";
				this.#selectedTargetId = null;
				this.#attack = new AttackCycle({
					deployTicks: 0,
					firstHitTicks: QUESTION_VALUES.fullFreshWindup,
					hitSpeedTicks: 60
				});
			}
			#retarget(boundary, events) {
				const candidates = [candidate(this.#scenario.target.id, this.#scenario.target.position, this.#targetAlive), candidate(this.#scenario.backup.id, this.#scenario.backup.position, true)];
				const nextId = retainOrAcquireTarget({
					position: this.#position,
					radius: this.#scenario.attacker.radius
				}, candidates, {
					currentTargetId: this.#selectedTargetId,
					mode: "ground",
					sightRange: 6e3
				})?.id ?? null;
				if (nextId !== this.#selectedTargetId) {
					if (this.#selectedTargetId !== null) events.push({
						targetId: this.#selectedTargetId,
						tick: boundary,
						type: "target-lost"
					});
					this.#selectedTargetId = nextId;
					if (nextId !== null) events.push({
						targetId: nextId,
						tick: boundary,
						type: "target-acquired"
					});
				}
				for (const ready of this.#attack.step({
					targetEligible: nextId !== null,
					targetId: nextId
				})) events.push({
					...ready,
					tick: boundary
				});
			}
			step() {
				if (this.#tick >= MAX_TICK) return [];
				const boundary = this.#tick;
				const events = [];
				const pulseCommands = [];
				while (this.#commands[this.#commandIndex]?.tick === boundary) {
					const command = this.#commands[this.#commandIndex];
					this.#commandIndex += 1;
					if (command.type === "target-killed" && this.#targetAlive) {
						this.#targetAlive = false;
						this.#targetHealth = 0;
						events.push({
							currentHealth: this.#targetHealth,
							targetId: 202,
							tick: boundary,
							type: "target-died"
						});
						if (boundary <= LAUNCH_TICK && this.#launch === null) {
							this.#phase = "retarget-pending";
							events.push({
								reason: "target-killed-before-launch",
								targetId: 202,
								tick: boundary,
								type: "dash-cancelled"
							});
						}
					} else if (command.type === "interrupt" && this.#phase !== "retargeting") {
						const wasTransit = this.#launch !== null;
						this.#launch = null;
						this.#targetable = true;
						this.#phase = "retarget-pending";
						events.push({
							...wasTransit ? {} : { phase: "prelaunch" },
							position: { ...this.#position },
							...wasTransit ? {} : { targetId: this.#selectedTargetId },
							tick: boundary,
							type: "dash-interrupted"
						});
						if (wasTransit) events.push({
							targetable: true,
							tick: boundary,
							type: "targetability-changed"
						});
					} else if (command.type === "knockback") pulseCommands.push(command);
				}
				if (boundary === 0 && this.#phase === "deploying") events.push({
					targetId: 202,
					tick: boundary,
					type: "target-acquired"
				});
				if (boundary === LAUNCH_TICK && this.#phase === "deploying") {
					this.#phase = "transit";
					this.#launch = {
						elapsedTicks: 0,
						from: { ...this.#position },
						targetId: 202,
						to: { ...this.#scenario.target.position }
					};
					this.#targetable = false;
					events.push({
						from: { ...this.#launch.from },
						targetId: 202,
						tick: boundary,
						to: { ...this.#launch.to },
						type: "dash-launched"
					});
					events.push({
						targetable: false,
						tick: boundary,
						type: "targetability-changed"
					});
				}
				if (this.#launch !== null) {
					this.#launch.elapsedTicks += 1;
					this.#position = interpolate(this.#launch.from, this.#launch.to, this.#launch.elapsedTicks);
					events.push({
						elapsedTicks: this.#launch.elapsedTicks,
						position: { ...this.#position },
						tick: boundary,
						type: "dash-move"
					});
					if (this.#launch.elapsedTicks === TRANSIT_TICKS) {
						this.#launch = null;
						this.#targetable = true;
						this.#phase = "retarget-pending";
						events.push({
							targetable: true,
							tick: boundary,
							type: "targetability-changed"
						});
						events.push({
							position: { ...this.#position },
							targetId: 202,
							tick: boundary,
							type: "dash-arrived"
						});
						if (this.#targetAlive) {
							const before = this.#targetHealth;
							this.#targetHealth = Math.max(0, before - DASH_DAMAGE);
							this.#targetAlive = this.#targetHealth > 0;
							events.push({
								amount: DASH_DAMAGE,
								baseAmount: 193,
								bonusAmount: 193,
								currentHealth: this.#targetHealth,
								targetId: 202,
								tick: boundary,
								type: "dash-damage"
							});
							if (!this.#targetAlive) events.push({
								targetId: 202,
								tick: boundary,
								type: "target-died"
							});
						} else events.push({
							reason: "snapshotted-target-dead",
							targetId: 202,
							tick: boundary,
							type: "dash-damage-skipped"
						});
					}
				}
				for (const ignored of pulseCommands) this.#pulse(boundary, events);
				if (this.#phase === "retargeting") this.#retarget(boundary, events);
				else if (this.#phase === "retarget-pending") this.#startRetarget();
				this.#tick += 1;
				if (this.#history.length + events.length > MAX_EVENTS) throw new RangeError("dash-knockback event bound exceeded");
				this.#history.push(...clone(events));
				return clone(events);
			}
			stepMany(count) {
				if (!Number.isSafeInteger(count) || count < 0) throw new TypeError("dash-knockback ticks must be a non-negative safe integer");
				if (this.#tick + count > MAX_TICK) throw new RangeError("dash-knockback encounter exceeds its tick bound");
				const events = [];
				for (let index = 0; index < count; index += 1) events.push(...this.step());
				return events;
			}
			run(tickLimit = MAX_TICK) {
				if (!Number.isSafeInteger(tickLimit) || tickLimit < 0) throw new TypeError("dash-knockback tick limit must be a non-negative safe integer");
				if (tickLimit > MAX_TICK) throw new RangeError("dash-knockback tick limit exceeds its bound");
				while (this.#tick < tickLimit) this.step();
				return this.state;
			}
			serialize() {
				const serialized = canonicalJson({
					setup: this.#setup,
					tick: this.#tick,
					version: 1
				});
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES) throw new RangeError("dash-knockback snapshot exceeds its byte bound");
				return serialized;
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("dash-knockback snapshot must be a string");
				if (Buffer.byteLength(serialized, "utf8") > MAX_SNAPSHOT_BYTES) throw new RangeError("dash-knockback snapshot exceeds its byte bound");
				let parsed;
				try {
					parsed = JSON.parse(serialized);
				} catch {
					throw new TypeError("dash-knockback snapshot must be valid JSON");
				}
				if (canonicalJson(parsed) !== serialized) throw new TypeError("dash-knockback snapshot must use canonical JSON");
				const snapshot = exactRecord(parsed, SNAPSHOT_KEYS, "dash-knockback snapshot");
				if (snapshot.version !== 1 || !Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0 || snapshot.tick > MAX_TICK) throw new TypeError("dash-knockback snapshot metadata is invalid");
				const restored = new DashKnockbackRetargetEncounter(checkedSetup(snapshot.setup));
				restored.stepMany(snapshot.tick);
				if (restored.serialize() !== serialized) throw new TypeError("dash-knockback snapshot is not reproducible");
				return restored;
			}
		};
	})))();
}
//#endregion
export { init_special_projectiles_reflection as $, init_special_movement_recoil as A, createDashSpecialFixture as B, createRetargetSpecialCatalog as C, createRecoilSpecialCatalog as D, createRecoilQuestionFixture as E, evaluateJumpQuestionBoundary as F, createChargeSpecialCatalog as G, init_special_movement_dash as H, init_special_movement_jump as I, init_special_movement_charge as J, createChargeSpecialFixture as K, DashEncounter as L, createJumpQuestionFixture as M, createJumpSpecialCatalog as N, createRecoilSpecialFixture as O, createJumpSpecialFixture as P, createReflectionSpecialFixture as Q, createDashQuestionFixture as R, createRetargetQuestionRecords as S, RecoilEncounter as T, ChargeSpecialEncounter as U, evaluateDashQuestionBoundary as V, createChargeQuestionFixture as W, createReflectionQuestionFixture as X, ReflectionEncounter as Y, createReflectionSpecialCatalog as Z, createKnockbackSpecialFixture as _, createChainSpecialCatalog as _t, LeapKnockbackRetargetEncounter as a, ReturnEncounter as at, RetargetAttackEncounter as b, init_special_movement_leap_knockback as c, createReturnSpecialFixture as ct, createChargeKnockbackFixture as d, createPierceQuestionFixture as dt, PelletEncounter as et, createChargeKnockbackQuestionRecords as f, createPierceSpecialCatalog as ft, createKnockbackSpecialCatalog as g, createChainQuestionFixture as gt, createKnockbackQuestionRecords as h, ChainEncounter as ht, init_special_movement_dash_knockback as i, init_special_projectiles_pellets as it, JumpEncounter as j, evaluateRecoilQuestionBoundary as k, ChargeKnockbackRetargetEncounter as l, init_special_projectiles_return as lt, ForcedKnockbackEncounter as m, init_special_projectiles_pierce as mt, createDashKnockbackFixture as n, createPelletSpecialCatalog as nt, createLeapKnockbackFixture as o, createReturnQuestionFixture as ot, init_special_movement_charge_knockback as p, createPierceSpecialFixture as pt, evaluateChargeQuestionBoundary as q, createDashKnockbackQuestionRecords as r, createPelletSpecialFixture as rt, createLeapKnockbackQuestionRecords as s, createReturnSpecialCatalog as st, DashKnockbackRetargetEncounter as t, createPelletQuestionFixture as tt, createChargeKnockbackCatalog as u, PierceEncounter as ut, evaluateForcedKnockbackQuestionBoundary as v, createChainSpecialFixture as vt, init_special_movement_retarget as w, createRetargetFixture as x, init_special_movement_knockback as y, init_special_projectiles_chain as yt, createDashSpecialCatalog as z };
