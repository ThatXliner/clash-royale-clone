import { t as __esmMin } from "../../../../../../rolldown-runtime-Cl99QfTQ.js";
import { Mt as init_spatial, Nt as validateCircle, gt as init_targeting, jt as circlesOverlap, mt as ATTACK_TARGET_MODES, vt as targetCandidate } from "./arena-shell-entry-D5weJ7hm.js";
import { a as createCombatEffectFeed, l as DamageSystem, n as appendCombatEffectRoot, o as init_combat_effect_feed, r as combatEffectFeedSnapshot, s as serializeCombatEffectFeed, t as appendCombatEffectEvent, u as init_damage } from "./arena-shell-entry-CNVraBnB.js";
//#region src/sim/arena-geometry.js
function assertPlainDataObject(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain string-keyed data object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Object.keys(descriptors).sort();
	const expected = [...keys].sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} has an invalid shape`);
	for (const key of actual) {
		const descriptor = descriptors[key];
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
	}
	return descriptors;
}
function safeCoordinate(descriptor, label) {
	const value = descriptor.value;
	if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be a safe integer millitile coordinate`);
	return value;
}
function pointIsInArena(point) {
	return point.x >= 0 && point.x <= 18e3 && point.y >= 0 && point.y <= 32e3;
}
function rectangleIsInArena(rectangle) {
	return rectangle.minX >= 0 && rectangle.maxX <= 18e3 && rectangle.minY >= 0 && rectangle.maxY <= 32e3;
}
function trustedRectangleContainsPoint(rectangle, point) {
	return point.x >= rectangle.minX && point.x < rectangle.maxX && point.y >= rectangle.minY && point.y < rectangle.maxY;
}
function validateArenaPoint(value, label = "arena point") {
	const descriptors = assertPlainDataObject(value, ["x", "y"], label);
	return {
		x: safeCoordinate(descriptors.x, `${label}.x`),
		y: safeCoordinate(descriptors.y, `${label}.y`)
	};
}
function validateArenaRectangle(value, label = "arena rectangle") {
	const descriptors = assertPlainDataObject(value, [
		"maxX",
		"maxY",
		"minX",
		"minY"
	], label);
	const rectangle = {
		minX: safeCoordinate(descriptors.minX, `${label}.minX`),
		maxX: safeCoordinate(descriptors.maxX, `${label}.maxX`),
		minY: safeCoordinate(descriptors.minY, `${label}.minY`),
		maxY: safeCoordinate(descriptors.maxY, `${label}.maxY`)
	};
	if (rectangle.minX >= rectangle.maxX || rectangle.minY >= rectangle.maxY) throw new RangeError(`${label} must have positive width and height`);
	return rectangle;
}
/**
* Arena coordinate bounds are closed: outer tile edges (0 and width/length)
* are valid coordinates.
*/
function isPointInArena(value) {
	return pointIsInArena(validateArenaPoint(value));
}
function rotateArenaPoint180(value) {
	const point = validateArenaPoint(value);
	if (!pointIsInArena(point)) throw new RangeError("arena point must be within the closed arena bounds");
	return {
		x: ARENA_WIDTH_MILLITILES - point.x,
		y: ARENA_LENGTH_MILLITILES - point.y
	};
}
/**
* Static point query for ground movement. Outside points, the river away from
* bridge footprints, and tower footprints are blocked. Rectangle containment
* is min-inclusive/max-exclusive, including on bridge and tower edges.
*/
function isGroundStaticallyBlocked(value) {
	const point = validateArenaPoint(value);
	if (!pointIsInArena(point)) return true;
	for (const tower of CANONICAL_STATIC_OBSTACLES.towers) if (trustedRectangleContainsPoint(tower, point)) return true;
	if (!trustedRectangleContainsPoint(CANONICAL_STATIC_OBSTACLES.river, point)) return false;
	return !CANONICAL_STATIC_OBSTACLES.bridges.some((bridge) => trustedRectangleContainsPoint(bridge, point));
}
function cloneRectangle(rectangle) {
	return {
		minX: rectangle.minX,
		maxX: rectangle.maxX,
		minY: rectangle.minY,
		maxY: rectangle.maxY
	};
}
function clonePoint(point) {
	return {
		x: point.x,
		y: point.y
	};
}
/**
* Returns fresh JSON data on every call. Bridge and tower geometry is marked
* as an estimate because its source is screenshot-derived.
*/
function getArenaGeometry() {
	return {
		units: "millitiles",
		bounds: {
			minX: 0,
			maxX: ARENA_WIDTH_MILLITILES,
			minY: 0,
			maxY: ARENA_LENGTH_MILLITILES
		},
		river: cloneRectangle(ESTIMATED_LAYOUT.river),
		bridges: ESTIMATED_LAYOUT.bridges.map((bridge) => ({
			lane: bridge.lane,
			confidence: "estimate",
			center: clonePoint(bridge.center),
			bounds: cloneRectangle(bridge.bounds)
		})),
		towers: ESTIMATED_LAYOUT.towers.map((tower) => ({
			side: tower.side,
			role: tower.role,
			...tower.lane === void 0 ? {} : { lane: tower.lane },
			confidence: "estimate",
			center: clonePoint(tower.center),
			bounds: cloneRectangle(tower.bounds)
		}))
	};
}
var ARENA_MILLITILES_PER_TILE, ARENA_WIDTH_MILLITILES, ARENA_LENGTH_MILLITILES, ESTIMATED_LAYOUT, CANONICAL_STATIC_OBSTACLES;
function init_arena_geometry() {
	return (init_arena_geometry = __esmMin((() => {
		ARENA_MILLITILES_PER_TILE = 1e3;
		ARENA_WIDTH_MILLITILES = 18e3;
		ARENA_LENGTH_MILLITILES = 32e3;
		ESTIMATED_LAYOUT = Object.freeze({
			river: Object.freeze({
				minX: 0,
				maxX: 18e3,
				minY: 15e3,
				maxY: 17e3
			}),
			bridges: Object.freeze([Object.freeze({
				lane: "west",
				center: Object.freeze({
					x: 3500,
					y: 16e3
				}),
				bounds: Object.freeze({
					minX: 2500,
					maxX: 4500,
					minY: 15e3,
					maxY: 17e3
				})
			}), Object.freeze({
				lane: "east",
				center: Object.freeze({
					x: 14500,
					y: 16e3
				}),
				bounds: Object.freeze({
					minX: 13500,
					maxX: 15500,
					minY: 15e3,
					maxY: 17e3
				})
			})]),
			towers: Object.freeze([
				Object.freeze({
					side: "south",
					role: "central",
					center: Object.freeze({
						x: 9e3,
						y: 3e3
					}),
					bounds: Object.freeze({
						minX: 7e3,
						maxX: 11e3,
						minY: 1e3,
						maxY: 5e3
					})
				}),
				Object.freeze({
					side: "south",
					role: "lane",
					lane: "west",
					center: Object.freeze({
						x: 3500,
						y: 7500
					}),
					bounds: Object.freeze({
						minX: 2e3,
						maxX: 5e3,
						minY: 6e3,
						maxY: 9e3
					})
				}),
				Object.freeze({
					side: "south",
					role: "lane",
					lane: "east",
					center: Object.freeze({
						x: 14500,
						y: 7500
					}),
					bounds: Object.freeze({
						minX: 13e3,
						maxX: 16e3,
						minY: 6e3,
						maxY: 9e3
					})
				}),
				Object.freeze({
					side: "north",
					role: "central",
					center: Object.freeze({
						x: 9e3,
						y: 29e3
					}),
					bounds: Object.freeze({
						minX: 7e3,
						maxX: 11e3,
						minY: 27e3,
						maxY: 31e3
					})
				}),
				Object.freeze({
					side: "north",
					role: "lane",
					lane: "west",
					center: Object.freeze({
						x: 3500,
						y: 24500
					}),
					bounds: Object.freeze({
						minX: 2e3,
						maxX: 5e3,
						minY: 23e3,
						maxY: 26e3
					})
				}),
				Object.freeze({
					side: "north",
					role: "lane",
					lane: "east",
					center: Object.freeze({
						x: 14500,
						y: 24500
					}),
					bounds: Object.freeze({
						minX: 13e3,
						maxX: 16e3,
						minY: 23e3,
						maxY: 26e3
					})
				})
			])
		});
		CANONICAL_STATIC_OBSTACLES = (() => {
			const admitted = (rectangle, label) => {
				const checked = validateArenaRectangle(rectangle, label);
				if (!rectangleIsInArena(checked)) throw new RangeError(`${label} must be within the arena`);
				return Object.freeze(checked);
			};
			return Object.freeze({
				bridges: Object.freeze(ESTIMATED_LAYOUT.bridges.map(({ bounds }, index) => admitted(bounds, `canonical bridge ${index}`))),
				river: admitted(ESTIMATED_LAYOUT.river, "canonical river"),
				towers: Object.freeze(ESTIMATED_LAYOUT.towers.map(({ bounds }, index) => admitted(bounds, `canonical tower ${index}`)))
			});
		})();
	})))();
}
//#endregion
//#region src/sim/area-damage.js
function assertExactDataObject(value, expectedKeys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.some((key) => typeof key !== "string")) throw new TypeError(`${label} must contain only string-keyed data`);
	const sorted = actual.sort();
	const expected = [...expectedKeys].sort();
	if (sorted.length !== expected.length || sorted.some((key, index) => key !== expected[index])) throw new TypeError(`${label} has an invalid shape`);
	const result = {};
	for (const key of expectedKeys) {
		const descriptor = descriptors[key];
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
		result[key] = descriptor.value;
	}
	return result;
}
function assertPositiveId(value, label) {
	if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be a positive safe integer`);
}
function assertTick(value, label = "effect.tick") {
	if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer`);
}
function assertDamage(value, label = "effect.damage") {
	if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer`);
}
function clone(value) {
	return JSON.parse(JSON.stringify(value));
}
function canonicalJson(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function checkedEffect(value) {
	const effect = assertExactDataObject(value, [
		"center",
		"damage",
		"mode",
		"radius",
		"tick"
	], "area effect");
	const center = assertExactDataObject(effect.center, ["x", "y"], "area effect.center");
	const circle = validateCircle({
		position: {
			x: center.x,
			y: center.y
		},
		radius: effect.radius
	}, "area effect");
	assertDamage(effect.damage);
	assertTick(effect.tick);
	if (!TARGET_MODES.has(effect.mode)) throw new TypeError("effect.mode must be ground, air, air_and_ground, buildings, or none");
	return {
		center: circle.position,
		damage: effect.damage,
		mode: effect.mode,
		radius: circle.radius,
		tick: effect.tick
	};
}
function checkedCandidates(values) {
	if (!Array.isArray(values)) throw new TypeError("area candidates must be an array");
	const descriptors = Object.getOwnPropertyDescriptors(values);
	for (const key of Reflect.ownKeys(descriptors)) {
		if (key === "length") continue;
		if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= values.length) throw new TypeError("area candidates must contain only indexed data");
	}
	const checked = [];
	const ids = /* @__PURE__ */ new Set();
	for (let index = 0; index < values.length; index += 1) {
		const descriptor = descriptors[index];
		if (descriptor === void 0 || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`area candidates[${index}] must be an enumerable data property`);
		const candidate = targetCandidate(descriptor.value, `area candidate ${index}`);
		if (ids.has(candidate.id)) throw new TypeError("area candidates must have unique entity IDs");
		ids.add(candidate.id);
		checked.push(candidate);
	}
	return checked;
}
function modeEligible(candidate, mode) {
	if (!candidate.alive || !candidate.targetable || mode === "none") return false;
	if (mode === "buildings") return candidate.kind === "structure";
	if (mode === "air_and_ground") return true;
	return candidate.layer === mode;
}
var TARGET_MODES, EXHAUSTED_EFFECT_ID, AreaDamageSystem;
function init_area_damage() {
	return (init_area_damage = __esmMin((() => {
		init_damage();
		init_spatial();
		init_targeting();
		init_combat_effect_feed();
		TARGET_MODES = new Set(ATTACK_TARGET_MODES);
		EXHAUSTED_EFFECT_ID = Number.MAX_SAFE_INTEGER;
		AreaDamageSystem = class AreaDamageSystem {
			#damage;
			#feed = createCombatEffectFeed();
			#history = [];
			#initialDamage;
			#nextEffectId;
			constructor() {
				this.#damage = new DamageSystem();
				this.#initialDamage = new DamageSystem();
				this.#nextEffectId = 1;
			}
			get nextEffectId() {
				return this.#nextEffectId;
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
				return AreaDamageSystem.restore(this.serialize(), this.combatEffectFeedBytes());
			}
			add(id, maxHealth, currentHealth = maxHealth) {
				const result = this.#damage.add(id, maxHealth, currentHealth);
				this.#initialDamage.add(id, maxHealth, currentHealth);
				return result;
			}
			get(id) {
				return this.#damage.get(id);
			}
			list() {
				return this.#damage.list();
			}
			/**
			* Resolves an effect at its explicit simulation tick.
			*
			* Boundary contact counts as a hit. Candidate circles, rather than only
			* their centers, overlap the effect. Replay is grouped as effect, hits,
			* damage, then deaths; every target-bearing group is ascending by target ID.
			*/
			resolve(effect, candidates) {
				const checked = checkedEffect(effect);
				const checkedCandidatesValue = checkedCandidates(candidates);
				if (this.#nextEffectId === EXHAUSTED_EFFECT_ID) throw new RangeError("area effect id space is exhausted");
				const effectId = this.#nextEffectId;
				const candidateDamage = DamageSystem.restore(this.#damage.serialize());
				const candidateFeed = this.#feed.fork();
				const effectCircle = {
					position: checked.center,
					radius: checked.radius
				};
				const hitTargetIds = checkedCandidatesValue.filter((candidate) => {
					const health = candidateDamage.get(candidate.id);
					return modeEligible(candidate, checked.mode) && health !== null && !health.dead && circlesOverlap(effectCircle, {
						position: candidate.position,
						radius: candidate.radius
					});
				}).map((candidate) => candidate.id).sort((left, right) => left - right);
				const batch = candidateDamage.damageSimultaneously(hitTargetIds.map((targetId) => ({
					amount: checked.damage,
					targetId
				})));
				const root = appendCombatEffectRoot(candidateFeed, {
					direction: "area",
					effectId,
					from: checked.center,
					impactTick: checked.tick,
					projectileId: null,
					radius: checked.radius,
					segments: [],
					sequence: null,
					sourceId: null,
					tick: checked.tick,
					to: null,
					type: "area"
				});
				let parentId = root.eventId;
				parentId = appendCombatEffectEvent(candidateFeed, {
					parentId,
					payload: {
						center: checked.center,
						radius: checked.radius,
						targetIds: hitTargetIds
					},
					phase: "impact",
					rootId: root.rootId,
					tick: checked.tick,
					type: "area"
				}).eventId;
				for (const event of batch.events) if (event.type === "damage") parentId = appendCombatEffectEvent(candidateFeed, {
					parentId,
					payload: {
						amount: event.amount,
						currentHealthAfter: event.currentHealthAfter,
						currentHealthBefore: event.currentHealthBefore,
						targetId: event.targetId
					},
					phase: "damage",
					rootId: root.rootId,
					tick: checked.tick,
					type: "area"
				}).eventId;
				else parentId = appendCombatEffectEvent(candidateFeed, {
					parentId,
					payload: { targetId: event.targetId },
					phase: "death",
					rootId: root.rootId,
					tick: checked.tick,
					type: "area"
				}).eventId;
				appendCombatEffectEvent(candidateFeed, {
					parentId,
					payload: { reason: "complete" },
					phase: "close",
					rootId: root.rootId,
					tick: checked.tick,
					type: "area"
				});
				this.#damage = candidateDamage;
				this.#feed = candidateFeed;
				this.#history = [...this.#history, {
					candidates: clone([...checkedCandidatesValue].sort((left, right) => left.id - right.id)),
					effect: clone(checked),
					effectId
				}];
				this.#nextEffectId += 1;
				const effectEvent = {
					center: { ...checked.center },
					damage: checked.damage,
					effectId,
					mode: checked.mode,
					radius: checked.radius,
					tick: checked.tick,
					type: "effect"
				};
				const hitEvents = hitTargetIds.map((targetId) => ({
					amount: checked.damage,
					effectId,
					targetId,
					tick: checked.tick,
					type: "hit"
				}));
				const damageEvents = batch.events.filter((event) => event.type === "damage").map((event) => ({
					...event,
					effectId,
					tick: checked.tick
				}));
				const deathEvents = batch.events.filter((event) => event.type === "death").map((event) => ({
					...event,
					effectId,
					tick: checked.tick
				}));
				return clone({
					effectId,
					events: [
						effectEvent,
						...hitEvents,
						...damageEvents,
						...deathEvents
					],
					hitTargetIds,
					tick: checked.tick
				});
			}
			serialize() {
				return canonicalJson({
					combatEffectFeed: combatEffectFeedSnapshot(this.#feed),
					damage: JSON.parse(this.#damage.serialize()),
					history: this.#history,
					initialDamage: JSON.parse(this.#initialDamage.serialize()),
					nextEffectId: this.#nextEffectId,
					version: 3
				});
			}
			/**
			* Restores mechanics and visual history as one canonical snapshot. Version
			* 1 is retained only for an unplayed empty system: a played legacy snapshot
			* cannot prove which visual records belonged to it and is rejected rather
			* than accepting an independently forgeable feed argument.
			*/
			static restore(serialized, feedSerialized = void 0) {
				if (typeof serialized !== "string") throw new TypeError("serialized area-damage snapshot must be a string");
				let raw;
				try {
					raw = JSON.parse(serialized);
				} catch {
					throw new TypeError("serialized area-damage snapshot must be valid JSON");
				}
				if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("area-damage snapshot must be a plain object");
				if (canonicalJson(raw) !== serialized) throw new TypeError("serialized area-damage snapshot must be canonical duplicate-free JSON");
				const version = raw.version;
				if (version === 1) {
					const legacy = assertExactDataObject(raw, [
						"damage",
						"nextEffectId",
						"version"
					], "area-damage legacy snapshot");
					assertPositiveId(legacy.nextEffectId, "snapshot nextEffectId");
					if (legacy.nextEffectId !== 1 || feedSerialized !== void 0) throw new TypeError("played area-damage legacy snapshots require a bound visual transcript");
					const system = new AreaDamageSystem();
					system.#damage = DamageSystem.restore(canonicalJson(legacy.damage));
					system.#initialDamage = DamageSystem.restore(canonicalJson(legacy.damage));
					system.#nextEffectId = legacy.nextEffectId;
					return system;
				}
				if (version !== 3) throw new TypeError("area-damage snapshot has an invalid version");
				const snapshot = assertExactDataObject(raw, [
					"combatEffectFeed",
					"damage",
					"history",
					"initialDamage",
					"nextEffectId",
					"version"
				], "area-damage snapshot");
				assertPositiveId(snapshot.nextEffectId, "snapshot nextEffectId");
				if (!Array.isArray(snapshot.history)) throw new TypeError("area-damage snapshot.history must be an array");
				const expectedFeedBytes = serializeCombatEffectFeed(snapshot.combatEffectFeed);
				if (feedSerialized !== void 0 && (typeof feedSerialized !== "string" || feedSerialized !== expectedFeedBytes)) throw new TypeError("area-damage supplied feed does not match its canonical snapshot");
				const system = new AreaDamageSystem();
				system.#initialDamage = DamageSystem.restore(canonicalJson(snapshot.initialDamage));
				system.#damage = DamageSystem.restore(canonicalJson(snapshot.initialDamage));
				if (snapshot.nextEffectId !== snapshot.history.length + 1) throw new TypeError("area-damage snapshot effect lineage is not contiguous");
				if (snapshot.history.length === 0) system.#nextEffectId = 1;
				else {
					if (snapshot.history[0]?.effectId !== 1) throw new TypeError("area-damage snapshot history effect identities are not causal");
					system.#nextEffectId = 1;
				}
				for (let index = 0; index < snapshot.history.length; index += 1) {
					const entry = assertExactDataObject(snapshot.history[index], [
						"candidates",
						"effect",
						"effectId"
					], `area-damage snapshot.history[${index}]`);
					if (!Array.isArray(entry.candidates)) throw new TypeError(`area-damage snapshot.history[${index}].candidates must be an array`);
					if (system.resolve(entry.effect, entry.candidates).effectId !== entry.effectId) throw new TypeError(`area-damage snapshot.history[${index}] effect identity diverges`);
				}
				if (snapshot.history.length > 0 && system.#nextEffectId !== snapshot.nextEffectId || canonicalJson(system.#history) !== canonicalJson(snapshot.history) || canonicalJson(JSON.parse(system.#damage.serialize())) !== canonicalJson(snapshot.damage) || system.combatEffectFeedBytes() !== expectedFeedBytes) throw new TypeError("area-damage snapshot mechanics and visual history diverge");
				return system;
			}
		};
	})))();
}
//#endregion
export { ARENA_WIDTH_MILLITILES as a, isGroundStaticallyBlocked as c, validateArenaPoint as d, ARENA_MILLITILES_PER_TILE as i, isPointInArena as l, init_area_damage as n, getArenaGeometry as o, ARENA_LENGTH_MILLITILES as r, init_arena_geometry as s, AreaDamageSystem as t, rotateArenaPoint180 as u };
