import { t as __esmMin } from "../../../../../../rolldown-runtime-Cl99QfTQ.js";
import { A as init_ordinary_projectile_delivery_authority, D as assertOrdinaryProjectileSplashProfile, F as assertSessionTroopSourceConfidencePolicy, L as encodeSessionTroopSourceConfidenceValue, O as getOrdinaryProjectileSplashProfile, R as init_session_troop_source_confidence_authority, f as assertSessionTroopProjectileAuthorityReceipt, k as getOrdinaryProjectileSplashSourceFacts, p as init_session_troop_projectile_authority } from "./arena-shell-entry-BIpBpF5T.js";
import { a as ARENA_WIDTH_MILLITILES, c as isGroundStaticallyBlocked, d as validateArenaPoint, i as ARENA_MILLITILES_PER_TILE, l as isPointInArena, o as getArenaGeometry, r as ARENA_LENGTH_MILLITILES, s as init_arena_geometry, u as rotateArenaPoint180 } from "./arena-shell-entry-DE4DQgyW.js";
import { a as createCombatEffectFeed, l as DamageSystem, n as appendCombatEffectRoot, o as init_combat_effect_feed, r as combatEffectFeedSnapshot, s as serializeCombatEffectFeed, t as appendCombatEffectEvent, u as init_damage } from "./arena-shell-entry-CNVraBnB.js";
import { r as init_attack_cycle, t as AttackCycle } from "./arena-shell-entry-iYK_h2t5.js";
import { h as init_battle_continuation_kernel } from "./arena-shell-entry-DoWZ9JV1.js";
//#region src/sim/spatial.js
function assertPlainObject$2(value, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	if (Object.getOwnPropertySymbols(value).length > 0) throw new TypeError(`${label} must contain only string-keyed JSON data`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	for (const [key, descriptor] of Object.entries(descriptors)) if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
}
function assertExactKeys$3(value, keys, label) {
	assertPlainObject$2(value, label);
	const actual = Object.keys(value).sort();
	const expected = [...keys].sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} has an invalid shape`);
}
function assertSafeMillitiles(value, label, { nonNegative = false } = {}) {
	if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_SPATIAL_MILLITILES || nonNegative && value < 0) throw new TypeError(`${label} must be a ${nonNegative ? "non-negative " : ""}safe integer millitile value within spatial bounds`);
}
function assertEntityId$1(value, label = "entity id") {
	if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be a positive safe integer`);
}
function validatePosition(value, label = "position") {
	assertExactKeys$3(value, ["x", "y"], label);
	assertSafeMillitiles(value.x, `${label}.x`);
	assertSafeMillitiles(value.y, `${label}.y`);
	return {
		x: value.x,
		y: value.y
	};
}
function validateCircle(value, label = "circle") {
	assertExactKeys$3(value, ["position", "radius"], label);
	const checkedPosition = validatePosition(value.position, `${label}.position`);
	assertSafeMillitiles(value.radius, `${label}.radius`, { nonNegative: true });
	return {
		position: checkedPosition,
		radius: value.radius
	};
}
function spatialEntity(value, label = "spatial entity") {
	assertExactKeys$3(value, [
		"id",
		"layer",
		"position",
		"radius"
	], label);
	assertEntityId$1(value.id, `${label}.id`);
	if (!LAYERS$2.has(value.layer)) throw new TypeError(`${label}.layer must be "ground" or "air"`);
	return {
		id: value.id,
		layer: value.layer,
		position: validatePosition(value.position, `${label}.position`),
		radius: validateRadius(value.radius, `${label}.radius`)
	};
}
function validateRadius(value, label) {
	assertSafeMillitiles(value, label, { nonNegative: true });
	return value;
}
function distanceSquaredBigInt(left, right) {
	const dx = BigInt(left.x) - BigInt(right.x);
	const dy = BigInt(left.y) - BigInt(right.y);
	return dx * dx + dy * dy;
}
/**
* Tests circle intersection. Tangency counts as overlap by default.
* Pass { includeBoundary: false } to require a positive-area intersection.
*/
function circlesOverlap(left, right, options = {}) {
	assertPlainObject$2(options, "overlap options");
	assertExactKeys$3(options, Object.hasOwn(options, "includeBoundary") ? ["includeBoundary"] : [], "overlap options");
	const includeBoundary = options.includeBoundary ?? true;
	if (typeof includeBoundary !== "boolean") throw new TypeError("includeBoundary must be a boolean");
	const checkedLeft = validateCircle(left, "left circle");
	const checkedRight = validateCircle(right, "right circle");
	const sum = BigInt(checkedLeft.radius) + BigInt(checkedRight.radius);
	const distance = distanceSquaredBigInt(checkedLeft.position, checkedRight.position);
	const threshold = sum * sum;
	return includeBoundary ? distance <= threshold : distance < threshold;
}
function validateOptions(options) {
	assertPlainObject$2(options, "nearest options");
	const allowed = /* @__PURE__ */ new Set([
		"includeRangeBoundary",
		"layer",
		"range"
	]);
	for (const key of Object.keys(options)) if (!allowed.has(key)) throw new TypeError("nearest options has an invalid shape");
	const layer = options.layer ?? "both";
	if (!QUERY_LAYERS.has(layer)) throw new TypeError("nearest options.layer must be \"ground\", \"air\", or \"both\"");
	const includeRangeBoundary = options.includeRangeBoundary ?? true;
	if (typeof includeRangeBoundary !== "boolean") throw new TypeError("nearest options.includeRangeBoundary must be a boolean");
	const range = options.range ?? null;
	if (range !== null) validateRadius(range, "nearest options.range");
	return {
		includeRangeBoundary,
		layer,
		range
	};
}
/**
* Finds the nearest eligible circle by center distance.
*
* Candidate order is irrelevant: equal distances resolve to the lowest entity
* ID. `range`, when supplied, is edge-to-edge reach in millitiles; the origin
* and candidate radii extend it. Exact boundary contact is included by default.
* Inputs are validated completely before querying and the result is an isolated
* JSON object.
*/
function nearestSpatialEntity(origin, candidates, options = {}) {
	const checkedOrigin = validateCircle(origin, "origin");
	if (!Array.isArray(candidates)) throw new TypeError("candidates must be an array");
	for (let index = 0; index < candidates.length; index += 1) {
		if (!Object.hasOwn(candidates, index)) throw new TypeError("candidates must not be a sparse array");
		const descriptor = Object.getOwnPropertyDescriptor(candidates, `${index}`);
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`candidates[${index}] must be an enumerable data property`);
	}
	if (Reflect.ownKeys(candidates).filter((key) => key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= candidates.length)).length > 0) throw new TypeError("candidates must contain only indexed JSON data");
	const checkedCandidates = candidates.map((candidate, index) => spatialEntity(candidate, `candidate ${index}`));
	const ids = /* @__PURE__ */ new Set();
	for (const candidate of checkedCandidates) {
		if (ids.has(candidate.id)) throw new TypeError("candidates must have unique entity IDs");
		ids.add(candidate.id);
	}
	const { includeRangeBoundary, layer, range } = validateOptions(options);
	let best = null;
	let bestDistance = null;
	for (const candidate of checkedCandidates) {
		if (layer !== "both" && candidate.layer !== layer) continue;
		const distance = distanceSquaredBigInt(checkedOrigin.position, candidate.position);
		if (range !== null) {
			const reach = BigInt(checkedOrigin.radius) + BigInt(range) + BigInt(candidate.radius);
			const threshold = reach * reach;
			if (includeRangeBoundary ? distance > threshold : distance >= threshold) continue;
		}
		if (best === null || distance < bestDistance || distance === bestDistance && candidate.id < best.id) {
			best = candidate;
			bestDistance = distance;
		}
	}
	return best === null ? null : {
		id: best.id,
		layer: best.layer,
		position: { ...best.position },
		radius: best.radius
	};
}
var MAX_SPATIAL_MILLITILES, LAYERS$2, QUERY_LAYERS;
function init_spatial() {
	return (init_spatial = __esmMin((() => {
		MAX_SPATIAL_MILLITILES = Math.floor(Math.sqrt(Number.MAX_SAFE_INTEGER / 8));
		LAYERS$2 = /* @__PURE__ */ new Set(["air", "ground"]);
		QUERY_LAYERS = /* @__PURE__ */ new Set([
			"air",
			"both",
			"ground"
		]);
	})))();
}
//#endregion
//#region src/sim/movement.js
function assertPlainObject$1(value, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	if (Object.getOwnPropertySymbols(value).length > 0) throw new TypeError(`${label} must contain only string-keyed data`);
	for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
}
function assertExactKeys$2(value, keys, label) {
	assertPlainObject$1(value, label);
	const actual = Object.keys(value).sort();
	const expected = [...keys].sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} has an invalid shape`);
}
function assertPosition(value, label = "movement position") {
	if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_SPATIAL_MILLITILES) throw new TypeError(`${label} must be a safe integer millitile value within spatial bounds`);
}
function validateState$1(value, label = "movement state") {
	assertExactKeys$2(value, STATE_KEYS$1, label);
	assertPosition(value.position, `${label}.position`);
	if (!ALLOWED_SPEEDS$1.has(value.speed)) throw new TypeError(`${label}.speed must be a reference speed in millitiles per second`);
	if (!Number.isSafeInteger(value.direction) || ![
		-1,
		0,
		1
	].includes(value.direction)) throw new TypeError(`${label}.direction must be -1, 0, or 1`);
	if (!Number.isSafeInteger(value.remainder) || value.remainder < 0 || value.remainder >= 60) throw new TypeError(`${label}.remainder must be an integer from 0 through 59`);
	if (value.speed === MOVEMENT_SPEEDS.stationary !== (value.direction === 0) || value.speed === MOVEMENT_SPEEDS.stationary && value.remainder !== 0) throw new TypeError(`${label} must pair stopped speed, direction, and remainder`);
	return {
		direction: value.direction,
		position: value.position,
		remainder: value.remainder,
		speed: value.speed
	};
}
/**
* Creates one-dimensional movement state in integer millitiles.
*
* A moving state uses one of the four reference speeds and direction -1 or 1.
* The explicit stopped state is speed 0, direction 0, and remainder 0.
*/
function createMovementState({ direction = 0, position = 0, remainder = 0, speed = MOVEMENT_SPEEDS.stationary } = {}) {
	return validateState$1({
		direction,
		position,
		remainder,
		speed
	});
}
/**
* Advances an axis by an integer number of 60 Hz simulation ticks.
*
* `remainder` is a numerator over 60, not a floating-point distance. Movement
* is distributed by flooring cumulative ideal distance: slow alternates
* 12/13 millitiles, medium repeats 16/17/17, fast is always 25, and very-fast
* repeats 33/33/34. Negative movement applies the exact opposite displacement
* while retaining the same non-negative phase. Thus chunked and single-tick
* advancement produce identical state.
*/
function advanceMovement(state, ticks = 1) {
	const checked = validateState$1(state);
	if (!Number.isSafeInteger(ticks) || ticks < 0) throw new TypeError("movement ticks must be a non-negative safe integer");
	if (checked.direction === 0 || ticks === 0) return checked;
	const accumulated = BigInt(checked.remainder) + BigInt(checked.speed) * BigInt(ticks);
	const divisor = BigInt(60);
	const distance = accumulated / divisor;
	const remainder = Number(accumulated % divisor);
	const position = BigInt(checked.position) + BigInt(checked.direction) * distance;
	if (position < -BigInt(MAX_SPATIAL_MILLITILES) || position > BigInt(MAX_SPATIAL_MILLITILES)) throw new RangeError("movement result is outside the supported spatial bounds");
	return {
		direction: checked.direction,
		position: Number(position),
		remainder,
		speed: checked.speed
	};
}
function serializeMovementState(state) {
	const checked = validateState$1(state);
	return JSON.stringify({
		state: checked,
		version: 1
	});
}
function restoreMovementState(serialized) {
	if (typeof serialized !== "string") throw new TypeError("serialized movement state must be a string");
	let snapshot;
	try {
		snapshot = JSON.parse(serialized);
	} catch {
		throw new TypeError("serialized movement state must be valid JSON");
	}
	assertExactKeys$2(snapshot, ["state", "version"], "movement snapshot");
	if (snapshot.version !== 1) throw new TypeError("movement snapshot has an unsupported version");
	return validateState$1(snapshot.state, "movement snapshot.state");
}
var MOVEMENT_SPEEDS, ALLOWED_SPEEDS$1, STATE_KEYS$1;
function init_movement() {
	return (init_movement = __esmMin((() => {
		init_spatial();
		MOVEMENT_SPEEDS = Object.freeze({
			stationary: 0,
			slow: 750,
			medium: 1e3,
			fast: 1500,
			very_fast: 2e3
		});
		ALLOWED_SPEEDS$1 = new Set(Object.values(MOVEMENT_SPEEDS));
		STATE_KEYS$1 = [
			"direction",
			"position",
			"remainder",
			"speed"
		];
	})))();
}
//#endregion
//#region src/sim/flying.js
function assertPlainObject(value, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain string-keyed data object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	for (const [key, descriptor] of Object.entries(descriptors)) if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
}
function assertExactKeys$1(value, keys, label) {
	assertPlainObject(value, label);
	const actual = Object.keys(value).sort();
	const expected = [...keys].sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} has an invalid shape`);
}
function nonNegativeInteger(value, label) {
	if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer`);
	return value;
}
function clonePoint(value, label) {
	const point = validateArenaPoint(value, label);
	if (!isPointInArena(point)) throw new RangeError(`${label} must be inside the arena`);
	return point;
}
function validateTarget(value, label = "flying target") {
	if (value === null) return null;
	assertExactKeys$1(value, TARGET_KEYS$1, label);
	return {
		position: clonePoint(value.position, `${label}.position`),
		radius: nonNegativeInteger(value.radius, `${label}.radius`),
		range: nonNegativeInteger(value.range, `${label}.range`)
	};
}
function assertFlyerFits(position, collisionRadius, label) {
	if (position.x < collisionRadius || position.x > 18e3 - collisionRadius || position.y < collisionRadius || position.y > 32e3 - collisionRadius) throw new RangeError(`${label} must fit inside the arena bounds`);
}
function validateAxisTarget(position, target, label) {
	if (target !== null && position.x !== target.position.x && position.y !== target.position.y) throw new RangeError(`${label} must be axis-aligned; arbitrary-angle normalization is not yet supported`);
}
function validateState(value, label = "flying state") {
	assertExactKeys$1(value, STATE_KEYS, label);
	const position = clonePoint(value.position, `${label}.position`);
	const collisionRadius = nonNegativeInteger(value.collisionRadius, `${label}.collisionRadius`);
	assertFlyerFits(position, collisionRadius, `${label}.position`);
	if (!ALLOWED_SPEEDS.has(value.speed)) throw new TypeError(`${label}.speed must be a supported reference speed in millitiles per second`);
	const remainder = nonNegativeInteger(value.remainder, `${label}.remainder`);
	if (remainder >= 60) throw new RangeError(`${label}.remainder must be less than 60`);
	const target = validateTarget(value.target, `${label}.target`);
	validateAxisTarget(position, target, `${label}.target.position`);
	if ((target === null || value.speed === 0) && remainder !== 0) throw new RangeError(`${label}.remainder must be zero while the flyer cannot move`);
	return {
		collisionRadius,
		position,
		remainder,
		speed: value.speed,
		target
	};
}
function directionAndGap(state) {
	if (state.target === null) return {
		axis: null,
		direction: 0,
		gap: 0
	};
	const dx = state.target.position.x - state.position.x;
	const dy = state.target.position.y - state.position.y;
	const axis = dx === 0 ? "y" : "x";
	const delta = axis === "x" ? dx : dy;
	const edgeDistance = state.collisionRadius + state.target.radius + state.target.range;
	return {
		axis,
		direction: Math.sign(delta),
		gap: Math.max(0, Math.abs(delta) - edgeDistance)
	};
}
function distanceToBound(state, axis, direction) {
	if (axis === "x") return direction < 0 ? state.position.x - state.collisionRadius : ARENA_WIDTH_MILLITILES - state.collisionRadius - state.position.x;
	return direction < 0 ? state.position.y - state.collisionRadius : ARENA_LENGTH_MILLITILES - state.collisionRadius - state.position.y;
}
/**
* Creates a deterministic flying-unit movement state in integer millitiles.
*
* This first primitive deliberately accepts axis-aligned targets only. Flyers
* use no ground navigation or obstacle query: river, bridges, and tower
* footprints do not participate in movement. The scalar phase is a numerator
* over 60 and is serialized as part of the state.
*/
function createFlyingState({ collisionRadius = 0, position = {
	x: 0,
	y: 0
}, remainder = 0, speed = MOVEMENT_SPEEDS.stationary, target = null } = {}) {
	return validateState({
		collisionRadius,
		position,
		remainder,
		speed,
		target
	});
}
/**
* Advances an axis-aligned flyer by an exact number of 60 Hz ticks.
*
* Scalar movement uses the same cumulative rational method as the passed
* movement primitive. Reaching either the configured circle-edge range or the
* radius-adjusted arena boundary consumes the command and clears fractional
* phase, making a chunk identical to repeated single-tick advancement.
*/
function advanceFlying(state, ticks = 1) {
	const checked = validateState(state);
	if (!Number.isSafeInteger(ticks) || ticks < 0) throw new TypeError("flying ticks must be a non-negative safe integer");
	if (ticks === 0 || checked.target === null || checked.speed === 0) return checked;
	const route = directionAndGap(checked);
	if (route.direction === 0 || route.gap === 0) return {
		...checked,
		remainder: 0
	};
	const boundGap = distanceToBound(checked, route.axis, route.direction);
	const limit = Math.min(route.gap, boundGap);
	if (limit === 0) return {
		...checked,
		remainder: 0
	};
	const accumulated = BigInt(checked.remainder) + BigInt(checked.speed) * BigInt(ticks);
	const divisor = BigInt(60);
	const availableDistance = accumulated / divisor;
	const travel = availableDistance > BigInt(limit) ? BigInt(limit) : availableDistance;
	const reachedLimit = travel === BigInt(limit);
	const position = { ...checked.position };
	position[route.axis] += route.direction * Number(travel);
	return {
		...checked,
		position,
		remainder: reachedLimit ? 0 : Number(accumulated % divisor)
	};
}
function serializeFlyingState(state) {
	const checked = validateState(state);
	return JSON.stringify({
		state: checked,
		version: 1
	});
}
function restoreFlyingState(serialized) {
	if (typeof serialized !== "string") throw new TypeError("serialized flying state must be a string");
	let snapshot;
	try {
		snapshot = JSON.parse(serialized);
	} catch {
		throw new TypeError("serialized flying state must be valid JSON");
	}
	assertExactKeys$1(snapshot, ["state", "version"], "flying snapshot");
	if (snapshot.version !== 1) throw new TypeError("flying snapshot has an unsupported version");
	return validateState(snapshot.state, "flying snapshot.state");
}
var ALLOWED_SPEEDS, STATE_KEYS, TARGET_KEYS$1;
function init_flying() {
	return (init_flying = __esmMin((() => {
		init_arena_geometry();
		init_movement();
		ALLOWED_SPEEDS = new Set(Object.values(MOVEMENT_SPEEDS));
		STATE_KEYS = [
			"collisionRadius",
			"position",
			"remainder",
			"speed",
			"target"
		];
		TARGET_KEYS$1 = [
			"position",
			"radius",
			"range"
		];
	})))();
}
//#endregion
//#region src/sim/targeting.js
function assertExactDataObject(value, expectedKeys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actualKeys = Reflect.ownKeys(descriptors);
	if (actualKeys.some((key) => typeof key !== "string")) throw new TypeError(`${label} must contain only string-keyed data`);
	const actual = actualKeys.sort();
	const expected = [...expectedKeys].sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} has an invalid shape`);
	const result = {};
	for (const key of expected) {
		const descriptor = descriptors[key];
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
		result[key] = descriptor.value;
	}
	return result;
}
function checkedCircle(value, label) {
	const circle = assertExactDataObject(value, ["position", "radius"], label);
	const position = assertExactDataObject(circle.position, ["x", "y"], `${label}.position`);
	return validateCircle({
		position: {
			x: position.x,
			y: position.y
		},
		radius: circle.radius
	}, label);
}
function checkedCandidate(value, label) {
	const candidate = assertExactDataObject(value, [
		"alive",
		"id",
		"kind",
		"layer",
		"position",
		"radius",
		"targetable"
	], label);
	const position = assertExactDataObject(candidate.position, ["x", "y"], `${label}.position`);
	const spatial = spatialEntity({
		id: candidate.id,
		layer: candidate.layer,
		position: {
			x: position.x,
			y: position.y
		},
		radius: candidate.radius
	}, label);
	if (!TARGET_KINDS.has(candidate.kind)) throw new TypeError(`${label}.kind must be "troop" or "structure"`);
	if (typeof candidate.alive !== "boolean") throw new TypeError(`${label}.alive must be a boolean`);
	if (typeof candidate.targetable !== "boolean") throw new TypeError(`${label}.targetable must be a boolean`);
	return {
		alive: candidate.alive,
		id: spatial.id,
		kind: candidate.kind,
		layer: spatial.layer,
		position: spatial.position,
		radius: spatial.radius,
		targetable: candidate.targetable
	};
}
function checkedCandidateArray(candidates) {
	if (!Array.isArray(candidates)) throw new TypeError("target candidates must be an array");
	const descriptors = Object.getOwnPropertyDescriptors(candidates);
	const ownKeys = Reflect.ownKeys(descriptors);
	for (const key of ownKeys) {
		if (key === "length") continue;
		if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= candidates.length) throw new TypeError("target candidates must contain only indexed data");
	}
	const checked = [];
	const ids = /* @__PURE__ */ new Set();
	for (let index = 0; index < candidates.length; index += 1) {
		const descriptor = descriptors[index];
		if (descriptor === void 0 || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`target candidates[${index}] must be an enumerable data property`);
		const candidate = checkedCandidate(descriptor.value, `target candidate ${index}`);
		if (ids.has(candidate.id)) throw new TypeError("target candidates must have unique entity IDs");
		ids.add(candidate.id);
		checked.push(candidate);
	}
	return checked;
}
function checkedModeAndSight(options, expectedKeys, label) {
	const checked = assertExactDataObject(options, expectedKeys, label);
	if (!TARGET_MODES$1.has(checked.mode)) throw new TypeError(`${label}.mode must be ground, air, air_and_ground, buildings, or none`);
	return {
		checked,
		sightRange: checkedCircle({
			position: {
				x: 0,
				y: 0
			},
			radius: checked.sightRange
		}, `${label} sight`).radius
	};
}
function isModeEligible(candidate, mode) {
	if (!candidate.alive || !candidate.targetable || mode === "none") return false;
	if (mode === "buildings") return candidate.kind === "structure";
	if (mode === "air_and_ground") return true;
	return candidate.layer === mode;
}
function cloneCandidate(candidate) {
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
function toSpatialCandidate(candidate) {
	return {
		id: candidate.id,
		layer: candidate.layer,
		position: candidate.position,
		radius: candidate.radius
	};
}
function acquireChecked(origin, candidates, mode, sightRange) {
	const eligible = candidates.filter((candidate) => isModeEligible(candidate, mode));
	const nearest = nearestSpatialEntity(origin, eligible.map(toSpatialCandidate), {
		includeRangeBoundary: true,
		layer: "both",
		range: sightRange
	});
	if (nearest === null) return null;
	return cloneCandidate(eligible.find((candidate) => candidate.id === nearest.id));
}
/**
* Validates and isolates one targeting candidate.
*
* Structures include all modeled buildings and towers. This module makes no
* card-specific distinctions within either "troop" or "structure".
*/
function targetCandidate(value, label = "target candidate") {
	return checkedCandidate(value, label);
}
/**
* Acquires the nearest eligible target in sight.
*
* Sight range is edge-to-edge millitile reach: origin radius + sightRange +
* candidate radius. Exact boundary contact is in sight. Equal center distances
* resolve to the lowest candidate ID, independent of input order.
*/
function acquireTarget(origin, candidates, options) {
	const checkedOrigin = checkedCircle(origin, "targeting origin");
	const checkedCandidates = checkedCandidateArray(candidates);
	const { checked, sightRange } = checkedModeAndSight(options, ["mode", "sightRange"], "acquire options");
	return acquireChecked(checkedOrigin, checkedCandidates, checked.mode, sightRange);
}
/**
* Retains a current target while it remains alive, targetable, mode-eligible,
* and in sight. Only an invalid or out-of-sight current target causes a fresh,
* deterministic acquisition. A missing current target is represented by null.
*/
function retainOrAcquireTarget(origin, candidates, options) {
	const checkedOrigin = checkedCircle(origin, "targeting origin");
	const checkedCandidates = checkedCandidateArray(candidates);
	const { checked, sightRange } = checkedModeAndSight(options, [
		"currentTargetId",
		"mode",
		"sightRange"
	], "retarget options");
	if (checked.currentTargetId !== null && (!Number.isSafeInteger(checked.currentTargetId) || checked.currentTargetId < 1)) throw new TypeError("retarget options.currentTargetId must be null or a positive safe integer");
	const current = checkedCandidates.find((candidate) => candidate.id === checked.currentTargetId);
	if (current !== void 0 && isModeEligible(current, checked.mode)) {
		if (nearestSpatialEntity(checkedOrigin, [toSpatialCandidate(current)], {
			includeRangeBoundary: true,
			layer: "both",
			range: sightRange
		}) !== null) return cloneCandidate(current);
	}
	return acquireChecked(checkedOrigin, checkedCandidates, checked.mode, sightRange);
}
var ATTACK_TARGET_MODES, TARGET_MODES$1, TARGET_KINDS;
function init_targeting() {
	return (init_targeting = __esmMin((() => {
		init_spatial();
		ATTACK_TARGET_MODES = Object.freeze([
			"ground",
			"air",
			"air_and_ground",
			"buildings",
			"none"
		]);
		TARGET_MODES$1 = new Set(ATTACK_TARGET_MODES);
		TARGET_KINDS = /* @__PURE__ */ new Set(["structure", "troop"]);
	})))();
}
//#endregion
//#region src/sim/projectile.js
function exactObject$1(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.some((key) => typeof key !== "string")) throw new TypeError(`${label} must contain only string-keyed data`);
	const expected = [...keys].sort();
	if (actual.length !== expected.length || [...actual].sort().some((key, index) => key !== expected[index])) throw new TypeError(`${label} has an invalid shape`);
	const result = {};
	for (const key of keys) {
		const descriptor = descriptors[key];
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
		result[key] = descriptor.value;
	}
	return result;
}
function safeInteger(value, label, minimum = 0) {
	if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError(`${label} must be a safe integer of at least ${minimum}`);
}
function checkedEntity(value, index) {
	const label = `projectile entity ${index}`;
	const entity = exactObject$1(value, ENTITY_KEYS, label);
	safeInteger(entity.id, `${label}.id`, 1);
	safeInteger(entity.maxHealth, `${label}.maxHealth`, 1);
	safeInteger(entity.attackRange, `${label}.attackRange`);
	if (entity.attackRange > MAX_SPATIAL_MILLITILES) throw new RangeError(`${label}.attackRange is outside the spatial bounds`);
	if (!MODES.has(entity.targetMode)) throw new TypeError(`${label}.targetMode is invalid`);
	if (typeof entity.targetable !== "boolean") throw new TypeError(`${label}.targetable must be a boolean`);
	const spatial = spatialEntity({
		id: entity.id,
		layer: entity.layer,
		position: entity.position,
		radius: entity.radius
	}, label);
	const candidate = targetCandidate({
		alive: true,
		id: entity.id,
		kind: entity.kind,
		layer: spatial.layer,
		position: spatial.position,
		radius: spatial.radius,
		targetable: entity.targetable
	}, label);
	return {
		attackRange: entity.attackRange,
		id: candidate.id,
		kind: candidate.kind,
		layer: candidate.layer,
		maxHealth: entity.maxHealth,
		position: candidate.position,
		radius: candidate.radius,
		targetMode: entity.targetMode,
		targetable: candidate.targetable
	};
}
function checkedArray(value, label) {
	if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	for (const key of Reflect.ownKeys(descriptors)) {
		if (key === "length") continue;
		if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) throw new TypeError(`${label} must contain only indexed data`);
	}
	for (let index = 0; index < value.length; index += 1) {
		const descriptor = descriptors[index];
		if (descriptor === void 0 || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}[${index}] must be an enumerable data property`);
	}
	return value;
}
function checkedSetup(value) {
	const entities = checkedArray(exactObject$1(value, SETUP_KEYS, "projectile setup").entities, "projectile setup.entities").map(checkedEntity).sort((left, right) => left.id - right.id);
	for (let index = 1; index < entities.length; index += 1) if (entities[index - 1].id === entities[index].id) throw new TypeError("projectile entities must have unique IDs");
	return { entities };
}
function clone$6(value) {
	return JSON.parse(JSON.stringify(value));
}
function canonicalJson$1(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$1).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$1(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function travelTicks(origin, target, contactRadius, speed) {
	const dx = BigInt(target.x) - BigInt(origin.x);
	const dy = BigInt(target.y) - BigInt(origin.y);
	const distanceSquared = dx * dx + dy * dy;
	const contact = BigInt(contactRadius);
	if (distanceSquared <= contact * contact) return 0;
	const speedBig = BigInt(speed);
	const reached = (ticks) => {
		const reach = contact + speedBig * ticks;
		return reach * reach >= distanceSquared;
	};
	let low = 0n;
	let high = 1n;
	while (!reached(high)) high *= 2n;
	while (low + 1n < high) {
		const middle = (low + high) / 2n;
		if (reached(middle)) high = middle;
		else low = middle;
	}
	if (high > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("projectile flight exceeds the safe tick range");
	return Number(high);
}
var ENTITY_KEYS, SETUP_KEYS, LAUNCH_KEYS, MODES, ProjectileCombat;
function init_projectile() {
	return (init_projectile = __esmMin((() => {
		init_damage();
		init_spatial();
		init_targeting();
		init_combat_effect_feed();
		ENTITY_KEYS = [
			"attackRange",
			"id",
			"kind",
			"layer",
			"maxHealth",
			"position",
			"radius",
			"targetMode",
			"targetable"
		];
		SETUP_KEYS = ["entities"];
		LAUNCH_KEYS = [
			"attackerId",
			"damage",
			"radius",
			"speed",
			"targetId",
			"tick"
		];
		MODES = new Set(ATTACK_TARGET_MODES);
		ProjectileCombat = class ProjectileCombat {
			#damage = new DamageSystem();
			#entities = [];
			#feed = createCombatEffectFeed();
			#feedRoots = /* @__PURE__ */ new Map();
			#history = [];
			#initial;
			#nextProjectileId = 1;
			#projectiles = [];
			#replay = [];
			#tick = 0;
			constructor(setup) {
				this.#initial = checkedSetup(setup);
				this.#entities = clone$6(this.#initial.entities);
				for (const entity of this.#entities) this.#damage.add(entity.id, entity.maxHealth);
			}
			get replay() {
				return clone$6(this.#replay);
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
				return ProjectileCombat.restore(this.serialize());
			}
			get state() {
				return clone$6({
					entities: this.#entities.map((entity) => ({
						alive: !this.#damage.get(entity.id).dead,
						hitpoints: this.#damage.get(entity.id).currentHealth,
						id: entity.id
					})),
					nextProjectileId: this.#nextProjectileId,
					projectiles: this.#projectiles,
					tick: this.#tick
				});
			}
			/**
			* Launches at the current explicit boundary. Range and eligibility are
			* delegated to the targeting module, including inclusive circle-edge reach.
			*/
			launch(command) {
				const checked = exactObject$1(command, LAUNCH_KEYS, "projectile launch");
				safeInteger(checked.attackerId, "projectile launch.attackerId", 1);
				safeInteger(checked.targetId, "projectile launch.targetId", 1);
				safeInteger(checked.tick, "projectile launch.tick");
				safeInteger(checked.damage, "projectile launch.damage");
				safeInteger(checked.speed, "projectile launch.speed", 1);
				safeInteger(checked.radius, "projectile launch.radius");
				validateCircle({
					position: {
						x: 0,
						y: 0
					},
					radius: checked.radius
				}, "projectile launch circle");
				if (checked.tick !== this.#tick) throw new RangeError("projectile launch.tick must equal the current tick");
				if (this.#nextProjectileId >= Number.MAX_SAFE_INTEGER) throw new RangeError("projectile ID space is exhausted");
				const attacker = this.#entity(checked.attackerId);
				const target = this.#entity(checked.targetId);
				if (attacker === null || target === null) throw new RangeError("projectile launch entities must exist");
				if (this.#damage.get(attacker.id).dead) throw new RangeError("projectile attacker must be alive");
				const candidate = {
					alive: !this.#damage.get(target.id).dead,
					id: target.id,
					kind: target.kind,
					layer: target.layer,
					position: target.position,
					radius: target.radius,
					targetable: target.targetable
				};
				if (acquireTarget({
					position: attacker.position,
					radius: attacker.radius
				}, [candidate], {
					mode: attacker.targetMode,
					sightRange: attacker.attackRange
				}) === null) throw new RangeError("projectile target is not eligible or in attack range");
				const duration = travelTicks(attacker.position, target.position, checked.radius + target.radius, checked.speed);
				if (duration > Number.MAX_SAFE_INTEGER - checked.tick) throw new RangeError("projectile impact tick exceeds the safe integer range");
				const projectile = {
					attackerId: attacker.id,
					damage: checked.damage,
					id: this.#nextProjectileId,
					impactTick: checked.tick + duration,
					launchTick: checked.tick,
					origin: { ...attacker.position },
					radius: checked.radius,
					speed: checked.speed,
					targetId: target.id,
					targetPosition: { ...target.position },
					targetRadius: target.radius
				};
				const root = appendCombatEffectRoot(this.#feed, {
					direction: "projectile",
					effectId: null,
					from: projectile.origin,
					impactTick: projectile.impactTick,
					projectileId: projectile.id,
					radius: projectile.radius,
					segments: [],
					sequence: projectile.id,
					sourceId: projectile.attackerId,
					tick: checked.tick,
					to: projectile.targetPosition,
					type: "projectile"
				});
				this.#nextProjectileId += 1;
				this.#projectiles.push(projectile);
				this.#feedRoots.set(projectile.id, {
					lastEventId: root.eventId,
					rootId: root.rootId
				});
				const event = {
					projectile: clone$6(projectile),
					tick: checked.tick,
					type: "launch"
				};
				this.#replay.push(event);
				this.#history.push({
					command: clone$6(checked),
					type: "launch"
				});
				return clone$6(projectile);
			}
			/**
			* Resolves one explicit simulation boundary. Launches scheduled for this
			* boundary must be made before calling step(boundary).
			*/
			step(tick) {
				safeInteger(tick, "projectile step tick");
				if (tick !== this.#tick) throw new RangeError("projectile step tick must equal the current tick");
				if (this.#tick === Number.MAX_SAFE_INTEGER) throw new RangeError("projectile tick space is exhausted");
				const due = this.#projectiles.filter((projectile) => projectile.impactTick === tick).sort((left, right) => left.id - right.id);
				if (due.length === 0) {
					this.#tick += 1;
					this.#history.push({
						tick,
						type: "step"
					});
					return [];
				}
				const candidateDamage = DamageSystem.restore(this.#damage.serialize());
				const candidateFeed = this.#feed.fork();
				const candidateFeedRoots = new Map([...this.#feedRoots].map(([projectileId, root]) => [projectileId, { ...root }]));
				const live = [];
				const events = [];
				const feedTargets = /* @__PURE__ */ new Map();
				const dueRoots = [];
				for (const projectile of due) {
					const health = candidateDamage.get(projectile.targetId);
					const status = health === null ? "target_missing" : health.dead ? "target_dead" : "contact";
					events.push({
						projectileId: projectile.id,
						status,
						targetId: projectile.targetId,
						tick,
						type: "impact"
					});
					const root = candidateFeedRoots.get(projectile.id);
					if (root === void 0) throw new Error("projectile visual root is missing");
					root.lastEventId = appendCombatEffectEvent(candidateFeed, {
						parentId: root.lastEventId,
						payload: {
							point: projectile.targetPosition,
							status: status === "contact" ? "contact" : status === "target_dead" ? "target-dead" : "target-missing",
							subId: null,
							targetId: projectile.targetId
						},
						phase: "contact",
						rootId: root.rootId,
						tick,
						type: "projectile"
					}).eventId;
					dueRoots.push(root);
					if (status === "contact") live.push(projectile);
				}
				const batch = candidateDamage.damageSimultaneously(live.map((projectile) => ({
					amount: projectile.damage,
					targetId: projectile.targetId
				})));
				let damageIndex = 0;
				for (const event of batch.events) if (event.type === "damage") {
					const projectile = live[damageIndex];
					const root = candidateFeedRoots.get(projectile.id);
					root.lastEventId = appendCombatEffectEvent(candidateFeed, {
						parentId: root.lastEventId,
						payload: {
							amount: event.amount,
							currentHealthAfter: event.currentHealthAfter,
							currentHealthBefore: event.currentHealthBefore,
							targetId: event.targetId
						},
						phase: "damage",
						rootId: root.rootId,
						tick,
						type: "projectile"
					}).eventId;
					feedTargets.set(event.targetId, root);
					events.push({
						...event,
						projectileId: projectile.id,
						tick
					});
					damageIndex += 1;
				} else {
					events.push({
						...event,
						tick
					});
					const root = feedTargets.get(event.targetId);
					if (root !== void 0) root.lastEventId = appendCombatEffectEvent(candidateFeed, {
						parentId: root.lastEventId,
						payload: { targetId: event.targetId },
						phase: "death",
						rootId: root.rootId,
						tick,
						type: "projectile"
					}).eventId;
				}
				for (const root of dueRoots) root.lastEventId = appendCombatEffectEvent(candidateFeed, {
					parentId: root.lastEventId,
					payload: { reason: "complete" },
					phase: "close",
					rootId: root.rootId,
					tick,
					type: "projectile"
				}).eventId;
				this.#damage = candidateDamage;
				this.#feed = candidateFeed;
				this.#feedRoots = candidateFeedRoots;
				const dueIds = new Set(due.map(({ id }) => id));
				this.#projectiles = this.#projectiles.filter((projectile) => !dueIds.has(projectile.id));
				this.#tick += 1;
				this.#replay.push(...events);
				this.#history.push({
					tick,
					type: "step"
				});
				return clone$6(events);
			}
			serialize() {
				return canonicalJson$1({
					history: this.#history,
					setup: this.#initial,
					version: 1
				});
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("serialized projectile combat must be a string");
				let snapshot;
				try {
					snapshot = JSON.parse(serialized);
				} catch {
					throw new TypeError("serialized projectile combat must be valid JSON");
				}
				const checked = exactObject$1(snapshot, [
					"history",
					"setup",
					"version"
				], "projectile snapshot");
				if (checked.version !== 1) throw new TypeError("projectile snapshot has an unsupported version");
				checkedArray(checked.history, "projectile snapshot.history");
				const combat = new ProjectileCombat(checked.setup);
				for (let index = 0; index < checked.history.length; index += 1) {
					const operation = checked.history[index];
					if (operation !== null && typeof operation === "object" && !Array.isArray(operation) && operation.type === "launch") {
						const entry = exactObject$1(operation, ["command", "type"], `projectile snapshot.history[${index}]`);
						combat.launch(entry.command);
					} else if (operation !== null && typeof operation === "object" && !Array.isArray(operation) && operation.type === "step") {
						const entry = exactObject$1(operation, ["tick", "type"], `projectile snapshot.history[${index}]`);
						combat.step(entry.tick);
					} else throw new TypeError(`projectile snapshot.history[${index}] has an invalid operation`);
				}
				return combat;
			}
			#entity(id) {
				return this.#entities.find((entity) => entity.id === id) ?? null;
			}
		};
	})))();
}
//#endregion
//#region src/sim/formations.js
function assertPlainDataObject$1(value, label, expectedKeys) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	if (Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must contain only string-keyed JSON data`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actualKeys = Object.keys(descriptors).sort();
	const wantedKeys = [...expectedKeys].sort();
	if (actualKeys.length !== wantedKeys.length || actualKeys.some((key, index) => key !== wantedKeys[index])) throw new TypeError(`${label} has an invalid shape`);
	for (const key of wantedKeys) {
		const descriptor = descriptors[key];
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
	}
	return descriptors;
}
function arrayDataDescriptors(value, label) {
	if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const length = descriptors.length.value;
	const ownKeys = Reflect.ownKeys(descriptors);
	for (const key of ownKeys) {
		if (key === "length") continue;
		if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length) throw new TypeError(`${label} must contain only indexed JSON data`);
	}
	for (let index = 0; index < length; index += 1) {
		const descriptor = descriptors[index];
		if (descriptor === void 0) throw new TypeError(`${label} must not be a sparse array`);
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}[${index}] must be an enumerable data property`);
	}
	return {
		descriptors,
		length
	};
}
function validateMemberDescriptors(member, index) {
	return assertPlainDataObject$1(member, `formation member ${index}`, [
		"id",
		"radius",
		"role"
	]);
}
function checkedMember(descriptors, index) {
	const id = descriptors.id.value;
	const role = descriptors.role.value;
	const radius = descriptors.radius.value;
	if (!Number.isSafeInteger(id) || id < 1) throw new TypeError(`formation member ${index}.id must be a positive safe integer`);
	if (!ROLES.has(role)) throw new TypeError(`formation member ${index}.role must be "primary" or "secondary"`);
	if (!Number.isSafeInteger(radius) || radius < 0 || radius > MAX_SPATIAL_MILLITILES) throw new TypeError(`formation member ${index}.radius must be a non-negative safe integer millitile value within spatial bounds`);
	return {
		id,
		radius,
		role
	};
}
function templateSlots(count) {
	const slots = [];
	for (const row of TEMPLATE_ROWS[count]) for (let column = 0; column < row.length; column += 1) slots.push({
		x: -(row.length - 1) + column * 2,
		y: row.y
	});
	return slots;
}
function checkedCoordinate(anchorValue, slotValue, cellSize, label) {
	const result = BigInt(anchorValue) + BigInt(slotValue) * BigInt(cellSize);
	const bound = BigInt(MAX_SPATIAL_MILLITILES);
	if (result < -bound || result > bound) throw new RangeError(`${label} is outside the supported spatial bounds`);
	return Number(result);
}
/**
* Lays an ordered member list onto a deterministic symmetric formation.
*
* Input and output coordinates are integer millitiles. The returned array and
* all nested objects are newly allocated. Member order, IDs, and roles are
* preserved; only their row-major slot assignment depends on input order.
*/
function layoutFormation(anchor, members) {
	const anchorDescriptors = assertPlainDataObject$1(anchor, "formation anchor", ["x", "y"]);
	const memberArray = arrayDataDescriptors(members, "formation members");
	if (memberArray.length < 1 || memberArray.length > 15) throw new RangeError("formation members must contain between 1 and 15 members");
	const descriptorSets = [];
	for (let index = 0; index < memberArray.length; index += 1) descriptorSets.push(validateMemberDescriptors(memberArray.descriptors[index].value, index));
	const checkedAnchor = validatePosition({
		x: anchorDescriptors.x.value,
		y: anchorDescriptors.y.value
	}, "formation anchor");
	const checkedMembers = descriptorSets.map(checkedMember);
	const ids = /* @__PURE__ */ new Set();
	let maxRadius = 0;
	for (const member of checkedMembers) {
		if (ids.has(member.id)) throw new TypeError("formation members must have unique IDs");
		ids.add(member.id);
		maxRadius = Math.max(maxRadius, member.radius);
	}
	const cellSize = Math.floor(maxRadius) + 1;
	const slots = templateSlots(checkedMembers.length);
	return checkedMembers.map((member, index) => {
		const slot = slots[index];
		const offset = {
			x: slot.x * cellSize,
			y: slot.y * cellSize
		};
		return {
			id: member.id,
			role: member.role,
			radius: member.radius,
			offset,
			position: {
				x: checkedCoordinate(checkedAnchor.x, slot.x, cellSize, `formation member ${index}.position.x`),
				y: checkedCoordinate(checkedAnchor.y, slot.y, cellSize, `formation member ${index}.position.y`)
			}
		};
	});
}
var ROLES, TEMPLATE_ROWS;
function init_formations() {
	return (init_formations = __esmMin((() => {
		init_spatial();
		ROLES = /* @__PURE__ */ new Set(["primary", "secondary"]);
		TEMPLATE_ROWS = Object.freeze({
			1: Object.freeze([{
				length: 1,
				y: 0
			}]),
			2: Object.freeze([{
				length: 2,
				y: 0
			}]),
			3: Object.freeze([{
				length: 1,
				y: -2
			}, {
				length: 2,
				y: 1
			}]),
			4: Object.freeze([{
				length: 2,
				y: -1
			}, {
				length: 2,
				y: 1
			}]),
			5: Object.freeze([{
				length: 2,
				y: -3
			}, {
				length: 3,
				y: 2
			}]),
			6: Object.freeze([{
				length: 3,
				y: -1
			}, {
				length: 3,
				y: 1
			}]),
			7: Object.freeze([
				{
					length: 2,
					y: -2
				},
				{
					length: 3,
					y: 0
				},
				{
					length: 2,
					y: 2
				}
			]),
			8: Object.freeze([
				{
					length: 3,
					y: -2
				},
				{
					length: 2,
					y: 0
				},
				{
					length: 3,
					y: 2
				}
			]),
			9: Object.freeze([
				{
					length: 3,
					y: -2
				},
				{
					length: 3,
					y: 0
				},
				{
					length: 3,
					y: 2
				}
			]),
			10: Object.freeze([
				{
					length: 3,
					y: -2
				},
				{
					length: 4,
					y: 0
				},
				{
					length: 3,
					y: 2
				}
			]),
			11: Object.freeze([
				{
					length: 4,
					y: -2
				},
				{
					length: 3,
					y: 0
				},
				{
					length: 4,
					y: 2
				}
			]),
			12: Object.freeze([
				{
					length: 4,
					y: -2
				},
				{
					length: 4,
					y: 0
				},
				{
					length: 4,
					y: 2
				}
			]),
			13: Object.freeze([
				{
					length: 4,
					y: -2
				},
				{
					length: 5,
					y: 0
				},
				{
					length: 4,
					y: 2
				}
			]),
			14: Object.freeze([
				{
					length: 5,
					y: -2
				},
				{
					length: 4,
					y: 0
				},
				{
					length: 5,
					y: 2
				}
			]),
			15: Object.freeze([
				{
					length: 5,
					y: -2
				},
				{
					length: 5,
					y: 0
				},
				{
					length: 5,
					y: 2
				}
			])
		});
	})))();
}
//#endregion
//#region src/sim/pathfinding.js
function isOnNavigationLattice(point) {
	return (point.x - GROUND_PATH_GRID_ORIGIN_MILLITILES) % GROUND_PATH_GRID_STEP_MILLITILES === 0 && (point.y - GROUND_PATH_GRID_ORIGIN_MILLITILES) % GROUND_PATH_GRID_STEP_MILLITILES === 0;
}
function hasSymmetricStaticClearance(point) {
	return !isGroundStaticallyBlocked(point) && !isGroundStaticallyBlocked(rotateArenaPoint180(point));
}
/**
* Reports whether a point is a legal node in the coarse ground graph.
* Malformed point data is rejected by the arena-geometry validator.
*/
function isGroundNavigationNode(value) {
	const point = validateArenaPoint(value, "ground navigation point");
	return isPointInArena(point) && isOnNavigationLattice(point) && hasSymmetricStaticClearance(point);
}
function assertEndpoint(value, label) {
	const point = validateArenaPoint(value, label);
	if (!isPointInArena(point)) throw new RangeError(`${label} must be inside the arena`);
	if (!isOnNavigationLattice(point)) throw new RangeError(`${label} must be on the ${GROUND_PATH_GRID_STEP_MILLITILES}-millitile navigation lattice`);
	if (!hasSymmetricStaticClearance(point)) throw new RangeError(`${label} is blocked in the coarse ground graph`);
	return point;
}
function pointToIndex(point) {
	return (point.y - GROUND_PATH_GRID_ORIGIN_MILLITILES) / GROUND_PATH_GRID_STEP_MILLITILES * COLUMN_COUNT + (point.x - GROUND_PATH_GRID_ORIGIN_MILLITILES) / GROUND_PATH_GRID_STEP_MILLITILES;
}
function indexToPoint(index) {
	return {
		x: GROUND_PATH_GRID_ORIGIN_MILLITILES + index % COLUMN_COUNT * GROUND_PATH_GRID_STEP_MILLITILES,
		y: GROUND_PATH_GRID_ORIGIN_MILLITILES + Math.floor(index / COLUMN_COUNT) * GROUND_PATH_GRID_STEP_MILLITILES
	};
}
function isClearSegment(from, to) {
	return hasSymmetricStaticClearance({
		x: (from.x + to.x) / 2,
		y: (from.y + to.y) / 2
	});
}
function reconstructPath(predecessor, endIndex) {
	const reversed = [];
	let index = endIndex;
	while (index !== -1) {
		reversed.push(indexToPoint(index));
		index = predecessor[index];
	}
	reversed.reverse();
	return reversed;
}
/**
* Finds a shortest coarse ground route.
*
* Returns a fresh JSON array of millitile waypoints, or null if the legal
* graph contains no route. Invalid, off-grid, outside, and blocked endpoints
* throw explicit errors instead of being silently snapped. Breadth-first
* search plus NEIGHBOR_OFFSETS gives stable byte-identical tie breaking.
*/
function findGroundPath(startValue, endValue) {
	const start = assertEndpoint(startValue, "ground path start");
	const end = assertEndpoint(endValue, "ground path end");
	const startIndex = pointToIndex(start);
	const endIndex = pointToIndex(end);
	const predecessor = new Int32Array(NODE_COUNT);
	predecessor.fill(-2);
	predecessor[startIndex] = -1;
	const queue = new Int32Array(NODE_COUNT);
	let queueRead = 0;
	let queueWrite = 0;
	queue[queueWrite] = startIndex;
	queueWrite += 1;
	while (queueRead < queueWrite) {
		const currentIndex = queue[queueRead];
		queueRead += 1;
		if (currentIndex === endIndex) return reconstructPath(predecessor, endIndex);
		const current = indexToPoint(currentIndex);
		for (let offsetIndex = 0; offsetIndex < NEIGHBOR_OFFSETS.length; offsetIndex += 1) {
			const offset = NEIGHBOR_OFFSETS[offsetIndex];
			const candidate = {
				x: current.x + offset.dx,
				y: current.y + offset.dy
			};
			if (!isPointInArena(candidate) || !isOnNavigationLattice(candidate)) continue;
			const candidateIndex = pointToIndex(candidate);
			if (predecessor[candidateIndex] !== -2 || !hasSymmetricStaticClearance(candidate) || !isClearSegment(current, candidate)) continue;
			predecessor[candidateIndex] = currentIndex;
			queue[queueWrite] = candidateIndex;
			queueWrite += 1;
		}
	}
	return null;
}
var GROUND_PATH_GRID_STEP_MILLITILES, GROUND_PATH_GRID_ORIGIN_MILLITILES, NEIGHBOR_OFFSETS, COLUMN_COUNT, NODE_COUNT;
function init_pathfinding() {
	return (init_pathfinding = __esmMin((() => {
		init_arena_geometry();
		GROUND_PATH_GRID_STEP_MILLITILES = ARENA_MILLITILES_PER_TILE;
		GROUND_PATH_GRID_ORIGIN_MILLITILES = GROUND_PATH_GRID_STEP_MILLITILES / 2;
		NEIGHBOR_OFFSETS = Object.freeze([
			Object.freeze({
				dx: -GROUND_PATH_GRID_STEP_MILLITILES,
				dy: 0
			}),
			Object.freeze({
				dx: 0,
				dy: GROUND_PATH_GRID_STEP_MILLITILES
			}),
			Object.freeze({
				dx: GROUND_PATH_GRID_STEP_MILLITILES,
				dy: 0
			}),
			Object.freeze({
				dx: 0,
				dy: -GROUND_PATH_GRID_STEP_MILLITILES
			})
		]);
		COLUMN_COUNT = ARENA_WIDTH_MILLITILES / GROUND_PATH_GRID_STEP_MILLITILES;
		NODE_COUNT = COLUMN_COUNT * (ARENA_LENGTH_MILLITILES / GROUND_PATH_GRID_STEP_MILLITILES);
	})))();
}
//#endregion
//#region src/sim/entities.js
function assertEntityId(id, label = "entity id") {
	if (!Number.isSafeInteger(id) || id < 1) throw new TypeError(`${label} must be a positive safe integer`);
}
function cloneJson(value, path = "$", ancestors = /* @__PURE__ */ new Set()) {
	if (value === null || typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new TypeError(`${path} must contain only finite numbers`);
		return Object.is(value, -0) ? 0 : value;
	}
	if (typeof value !== "object") throw new TypeError(`${path} must be plain JSON data`);
	if (ancestors.has(value)) throw new TypeError(`${path} must not contain cycles`);
	const prototype = Object.getPrototypeOf(value);
	if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new TypeError(`${path} must contain only plain objects`);
	if (Object.getOwnPropertySymbols(value).length > 0) throw new TypeError(`${path} must not contain symbol properties`);
	ancestors.add(value);
	let result;
	if (Array.isArray(value)) {
		result = [];
		for (let index = 0; index < value.length; index += 1) {
			if (!hasOwn(value, index)) throw new TypeError(`${path} must not contain sparse arrays`);
			result.push(cloneJson(value[index], `${path}[${index}]`, ancestors));
		}
		if (Object.keys(value).filter((key) => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length).length > 0) throw new TypeError(`${path} must not contain non-index properties`);
	} else {
		result = {};
		const descriptors = Object.getOwnPropertyDescriptors(value);
		for (const key of Object.keys(descriptors).sort()) {
			const descriptor = descriptors[key];
			if (!descriptor.enumerable || !hasOwn(descriptor, "value")) throw new TypeError(`${path}.${key} must be an enumerable data property`);
			Object.defineProperty(result, key, {
				configurable: true,
				enumerable: true,
				value: cloneJson(descriptor.value, `${path}.${key}`, ancestors),
				writable: true
			});
		}
	}
	ancestors.delete(value);
	return result;
}
function canonicalJson(value) {
	return JSON.stringify(cloneJson(value));
}
function assertExactKeys(value, expected, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} has an invalid shape`);
	const actual = Object.keys(value).sort();
	const wanted = [...expected].sort();
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new TypeError(`${label} has an invalid shape`);
}
var hasOwn, EntityStore;
function init_entities() {
	return (init_entities = __esmMin((() => {
		hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
		EntityStore = class EntityStore {
			#entities;
			#nextId;
			constructor() {
				this.#entities = [];
				this.#nextId = 1;
			}
			get size() {
				return this.#entities.length;
			}
			get nextId() {
				return this.#nextId;
			}
			spawn(data) {
				if (this.#nextId >= Number.MAX_SAFE_INTEGER) throw new RangeError("entity id space is exhausted");
				const entity = {
					data: cloneJson(data, "spawn data"),
					id: this.#nextId
				};
				this.#nextId += 1;
				this.#entities.push(entity);
				return cloneJson(entity);
			}
			/**
			* Returns true exactly once for a live ID. Missing and already-despawned IDs
			* return false and do not otherwise mutate the store.
			*/
			despawn(id) {
				assertEntityId(id);
				const index = this.#findIndex(id);
				if (index === -1) return false;
				this.#entities.splice(index, 1);
				return true;
			}
			has(id) {
				assertEntityId(id);
				return this.#findIndex(id) !== -1;
			}
			get(id) {
				assertEntityId(id);
				const index = this.#findIndex(id);
				return index === -1 ? null : cloneJson(this.#entities[index]);
			}
			list() {
				return cloneJson(this.#entities);
			}
			/**
			* Applies a same-tick lifecycle batch in array order.
			*
			* Each result is an isolated spawned entity or the boolean result of despawn.
			* A malformed operation aborts before that operation, while prior operations
			* remain applied; callers that need validation without mutation can validate
			* their command schema before handing the batch to the lifecycle layer.
			*/
			apply(operations) {
				if (!Array.isArray(operations)) throw new TypeError("lifecycle operations must be an array");
				const results = [];
				for (let index = 0; index < operations.length; index += 1) {
					const operation = operations[index];
					if (operation === null || typeof operation !== "object" || Array.isArray(operation)) throw new TypeError(`lifecycle operation ${index} has an invalid shape`);
					if (operation.type === "spawn") {
						assertExactKeys(operation, ["data", "type"], `lifecycle operation ${index}`);
						results.push(this.spawn(operation.data));
					} else if (operation.type === "despawn") {
						assertExactKeys(operation, ["id", "type"], `lifecycle operation ${index}`);
						results.push(this.despawn(operation.id));
					} else throw new TypeError(`lifecycle operation ${index} has an unknown type`);
				}
				return cloneJson(results);
			}
			serialize() {
				return canonicalJson({
					entities: this.#entities,
					nextId: this.#nextId,
					version: 1
				});
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("serialized entity snapshot must be a string");
				let raw;
				try {
					raw = JSON.parse(serialized);
				} catch {
					throw new TypeError("serialized entity snapshot must be valid JSON");
				}
				const snapshot = cloneJson(raw, "entity snapshot");
				assertExactKeys(snapshot, [
					"entities",
					"nextId",
					"version"
				], "entity snapshot");
				if (snapshot.version !== 1 || !Array.isArray(snapshot.entities)) throw new TypeError("entity snapshot has an invalid shape");
				assertEntityId(snapshot.nextId, "snapshot nextId");
				if (snapshot.nextId >= Number.MAX_SAFE_INTEGER) throw new TypeError("snapshot nextId is outside the supported ID space");
				let previousId = 0;
				for (let index = 0; index < snapshot.entities.length; index += 1) {
					const entity = snapshot.entities[index];
					assertExactKeys(entity, ["data", "id"], `snapshot entity ${index}`);
					assertEntityId(entity.id, `snapshot entity ${index} id`);
					if (entity.id <= previousId || entity.id >= snapshot.nextId) throw new TypeError("snapshot entities must have unique ascending issued IDs");
					previousId = entity.id;
				}
				const store = new EntityStore();
				store.#entities = cloneJson(snapshot.entities);
				store.#nextId = snapshot.nextId;
				return store;
			}
			#findIndex(id) {
				let low = 0;
				let high = this.#entities.length - 1;
				while (low <= high) {
					const middle = Math.floor((low + high) / 2);
					const candidate = this.#entities[middle].id;
					if (candidate === id) return middle;
					if (candidate < id) low = middle + 1;
					else high = middle - 1;
				}
				return -1;
			}
		};
	})))();
}
//#endregion
//#region src/sim/deployment.js
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
function validateDestroyedLanes(value) {
	if (!Array.isArray(value) || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError("destroyedOpposingLaneTowers must be an array");
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const length = descriptors.length;
	if (!length || !Object.hasOwn(length, "value") || !Number.isSafeInteger(length.value) || length.value < 0 || length.value > 2) throw new TypeError("destroyedOpposingLaneTowers must contain at most two lanes");
	const lanes = [];
	for (let index = 0; index < length.value; index += 1) {
		const descriptor = descriptors[String(index)];
		if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value") || !LANES.has(descriptor.value)) throw new TypeError("destroyedOpposingLaneTowers entries must be west or east data values");
		lanes.push(descriptor.value);
	}
	const allowedKeys = /* @__PURE__ */ new Set(["length", ...lanes.map((unused, index) => String(index))]);
	if (Object.keys(descriptors).some((key) => !allowedKeys.has(key))) throw new TypeError("destroyedOpposingLaneTowers has an invalid shape");
	if (new Set(lanes).size !== lanes.length) throw new TypeError("destroyedOpposingLaneTowers must not contain duplicates");
	return lanes;
}
function decision(legal, reason, confidence) {
	return {
		legal,
		reason,
		confidence
	};
}
/**
* Deployment masks use closed rectangle edges.
*
* The arena geometry module's general-purpose [min, max) convention is useful
* for partitioning cells, but it cannot commute at raw edge coordinates with
* rotateArenaPoint180: rotation exchanges each rectangle's min and max edges.
* Deployment decisions instead treat both estimated outer edges as belonging
* to the mask. A rectangle and its 180-degree rotation therefore contain
* exactly the same rotated points, including corners and edges.
*/
function deploymentRectangleContainsPoint(rectangle, point) {
	return point.x >= rectangle.minX && point.x <= rectangle.maxX && point.y >= rectangle.minY && point.y <= rectangle.maxY;
}
function isEstimatedEdgeExcluded(point) {
	const inset = ESTIMATED_DEPLOYMENT_MASK.edgeInset;
	return point.x < inset || point.x > 18e3 - inset || point.y < inset || point.y > 32e3 - inset;
}
function isInOwnHalf(side, point) {
	return side === "south" ? point.y < 15e3 : point.y >= 17e3;
}
function towerAt(point) {
	return getArenaGeometry().towers.find((tower) => deploymentRectangleContainsPoint(tower.bounds, point));
}
/**
* Evaluate one placement without mutating or retaining caller data.
*
* The accepted request is exactly:
* { side, placementClass, point, destroyedOpposingLaneTowers }.
* Special card placement behavior belongs in a future card policy layer.
*/
function evaluateDeployment(value) {
	const descriptors = assertPlainDataObject(value, [
		"destroyedOpposingLaneTowers",
		"placementClass",
		"point",
		"side"
	], "deployment request");
	const side = descriptors.side.value;
	const placementClass = descriptors.placementClass.value;
	if (!SIDES$2.has(side)) throw new TypeError("deployment request.side must be south or north");
	if (!PLACEMENT_CLASSES.has(placementClass)) throw new TypeError("deployment request.placementClass must be ground_entity or global_effect");
	const point = validateArenaPoint(descriptors.point.value, "deployment request.point");
	const destroyedLanes = validateDestroyedLanes(descriptors.destroyedOpposingLaneTowers.value);
	if (!isPointInArena(point)) return decision(false, "outside_playfield", "high");
	if (placementClass === "global_effect") return decision(true, "full_playfield_effect", "high");
	if (deploymentRectangleContainsPoint(getArenaGeometry().river, point)) return decision(false, "river_excluded", "high");
	if (towerAt(point)) return decision(false, "tower_footprint", "estimate");
	if (isEstimatedEdgeExcluded(point) || deploymentRectangleContainsPoint(ESTIMATED_DEPLOYMENT_MASK.kingBehindStrips[side], point)) return decision(false, "estimated_edge_exclusion", "estimate");
	if (isInOwnHalf(side, point)) return decision(true, "own_side_ground", "estimate");
	for (const lane of destroyedLanes) if (deploymentRectangleContainsPoint(ESTIMATED_DEPLOYMENT_MASK.forwardPockets[side][lane], point)) return decision(true, "destroyed_lane_pocket", "estimate");
	return decision(false, "opposing_side_locked", "estimate");
}
var SIDES$2, PLACEMENT_CLASSES, LANES, ESTIMATED_DEPLOYMENT_MASK;
function init_deployment() {
	return (init_deployment = __esmMin((() => {
		init_arena_geometry();
		SIDES$2 = /* @__PURE__ */ new Set(["south", "north"]);
		PLACEMENT_CLASSES = /* @__PURE__ */ new Set(["ground_entity", "global_effect"]);
		LANES = /* @__PURE__ */ new Set(["west", "east"]);
		ESTIMATED_DEPLOYMENT_MASK = Object.freeze({
			edgeInset: 500,
			kingBehindStrips: Object.freeze({
				south: Object.freeze({
					minX: 7e3,
					maxX: 11e3,
					minY: 0,
					maxY: 1e3
				}),
				north: Object.freeze({
					minX: 7e3,
					maxX: 11e3,
					minY: 31e3,
					maxY: 32e3
				})
			}),
			forwardPockets: Object.freeze({
				south: Object.freeze({
					west: Object.freeze({
						minX: 500,
						maxX: 9e3,
						minY: 17e3,
						maxY: 23e3
					}),
					east: Object.freeze({
						minX: 9e3,
						maxX: 17500,
						minY: 17e3,
						maxY: 23e3
					})
				}),
				north: Object.freeze({
					west: Object.freeze({
						minX: 500,
						maxX: 9e3,
						minY: 9e3,
						maxY: 15e3
					}),
					east: Object.freeze({
						minX: 9e3,
						maxX: 17500,
						minY: 9e3,
						maxY: 15e3
					})
				})
			})
		});
	})))();
}
//#endregion
//#region src/sim/rng.js
function assertSeed$1(seed) {
	if (typeof seed === "string") return `string:${seed.length}:${seed}`;
	if (Number.isSafeInteger(seed)) return `integer:${seed}`;
	throw new TypeError("seed must be a string or safe integer");
}
function assertForkName(name) {
	if (typeof name !== "string" || name.length === 0) throw new TypeError("fork name must be a non-empty string");
	return name;
}
function hash64(text) {
	let hash = FNV_OFFSET;
	for (const byte of new TextEncoder().encode(text)) {
		hash ^= BigInt(byte);
		hash = hash * FNV_PRIME & UINT64_MASK;
	}
	hash ^= hash >> 30n;
	hash = hash * 13785878976378269325n & UINT64_MASK;
	hash ^= hash >> 27n;
	hash = hash * 10766465646473572057n & UINT64_MASK;
	hash ^= hash >> 31n;
	return hash & UINT64_MASK;
}
function toHex64(value) {
	return value.toString(16).padStart(16, "0");
}
function parseHex64(value, label) {
	if (typeof value !== "string" || !/^[0-9a-f]{16}$/.test(value)) throw new TypeError(`${label} must be a 16-character lowercase hex string`);
	return BigInt(`0x${value}`);
}
function deriveKey(material) {
	return toHex64(hash64(`key\0${material}`));
}
function initializeState(key) {
	const initialState = hash64(`state\0${key}`);
	const increment = (hash64(`stream\0${key}`) << 1n | 1n) & UINT64_MASK;
	let state = 0n;
	state = state * PCG_MULTIPLIER + increment & UINT64_MASK;
	state = state + initialState & UINT64_MASK;
	state = state * PCG_MULTIPLIER + increment & UINT64_MASK;
	return {
		increment,
		state
	};
}
var UINT32_RANGE, UINT64_MASK, PCG_MULTIPLIER, FNV_OFFSET, FNV_PRIME, RNG_ALGORITHM, SeededRandom;
function init_rng() {
	return (init_rng = __esmMin((() => {
		UINT32_RANGE = 4294967296;
		UINT64_MASK = 18446744073709551615n;
		PCG_MULTIPLIER = 6364136223846793005n;
		FNV_OFFSET = 14695981039346656037n;
		FNV_PRIME = 1099511628211n;
		RNG_ALGORITHM = "pcg32-xsh-rr-v1";
		SeededRandom = class SeededRandom {
			#forkKey;
			#increment;
			#state;
			constructor(seed) {
				this.#forkKey = deriveKey(assertSeed$1(seed));
				const initialized = initializeState(this.#forkKey);
				this.#increment = initialized.increment;
				this.#state = initialized.state;
			}
			/**
			* Returns an unsigned 32-bit integer and advances the stream once.
			*/
			nextUint32() {
				const oldState = this.#state;
				this.#state = oldState * PCG_MULTIPLIER + this.#increment & UINT64_MASK;
				const shifted = Number((oldState >> 18n ^ oldState) >> 27n & 4294967295n);
				const rotation = Number(oldState >> 59n);
				return (shifted >>> rotation | shifted << (-rotation & 31)) >>> 0;
			}
			/**
			* Returns an integer in [0, maxExclusive). Rejection sampling avoids the
			* modulo bias that would otherwise occur when the bound does not divide 2^32.
			*/
			int(maxExclusive) {
				if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) throw new RangeError("maxExclusive must be an integer from 1 through 4294967296");
				const rejectionLimit = UINT32_RANGE - UINT32_RANGE % maxExclusive;
				let value;
				do
					value = this.nextUint32();
				while (value >= rejectionLimit);
				return value % maxExclusive;
			}
			/**
			* Creates a named child stream. Derivation uses only the parent's immutable
			* fork key and the exact name, so parent draws and sibling fork call order
			* cannot affect the child sequence.
			*/
			fork(name) {
				const checkedName = assertForkName(name);
				return SeededRandom.#fromKey(deriveKey(`fork\0${this.#forkKey}\0${checkedName.length}:${checkedName}`));
			}
			/**
			* Returns a plain JSON-safe snapshot containing every replay-relevant field.
			*/
			serialize() {
				return {
					algorithm: RNG_ALGORITHM,
					forkKey: this.#forkKey,
					increment: toHex64(this.#increment),
					state: toHex64(this.#state),
					version: 1
				};
			}
			static restore(serialized) {
				let snapshot = serialized;
				if (typeof serialized === "string") try {
					snapshot = JSON.parse(serialized);
				} catch {
					throw new TypeError("serialized RNG snapshot must be valid JSON");
				}
				if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot) || snapshot.algorithm !== "pcg32-xsh-rr-v1" || snapshot.version !== 1) throw new TypeError("serialized RNG snapshot has an invalid shape");
				if (Object.keys(snapshot).sort().join(",") !== "algorithm,forkKey,increment,state,version") throw new TypeError("serialized RNG snapshot has an invalid shape");
				const rng = SeededRandom.#fromKey(snapshot.forkKey);
				rng.#state = parseHex64(snapshot.state, "snapshot state");
				const increment = parseHex64(snapshot.increment, "snapshot increment");
				if ((increment & 1n) !== 1n) throw new TypeError("snapshot increment must be odd");
				rng.#increment = increment;
				return rng;
			}
			static #fromKey(forkKey) {
				parseHex64(forkKey, "fork key");
				const rng = new SeededRandom(0);
				rng.#forkKey = forkKey;
				const initialized = initializeState(forkKey);
				rng.#increment = initialized.increment;
				rng.#state = initialized.state;
				return rng;
			}
		};
	})))();
}
//#endregion
//#region src/sim/deck.js
function ownDataRecord(value, expectedKeys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain data object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actualKeys = Object.keys(descriptors).sort();
	const wantedKeys = [...expectedKeys].sort();
	if (actualKeys.length !== wantedKeys.length || actualKeys.some((key, index) => key !== wantedKeys[index])) throw new TypeError(`${label} has an invalid shape`);
	for (const key of actualKeys) if (!Object.hasOwn(descriptors[key], "value")) throw new TypeError(`${label}.${key} must be a data property`);
	return Object.fromEntries(actualKeys.map((key) => [key, descriptors[key].value]));
}
function ownArrayValues(value, label, maximumLength = void 0) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError(`${label} must be a plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const lengthDescriptor = descriptors.length;
	if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, "value") || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0 || maximumLength !== void 0 && lengthDescriptor.value > maximumLength) throw new TypeError(`${label} has an invalid length`);
	const result = [];
	for (let index = 0; index < lengthDescriptor.value; index += 1) {
		const descriptor = descriptors[String(index)];
		if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}[${index}] must be a data property`);
		result.push(descriptor.value);
	}
	const allowed = /* @__PURE__ */ new Set(["length", ...Array.from({ length: lengthDescriptor.value }, (_, index) => String(index))]);
	if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !allowed.has(key))) throw new TypeError(`${label} has unexpected properties`);
	return result;
}
function isRuntimeCardId(value) {
	return typeof value === "string" && value.length > 0 || Number.isSafeInteger(value) && value > 0;
}
function assertSeed(seed) {
	if (typeof seed !== "string" && !Number.isSafeInteger(seed)) throw new TypeError("seed must be a string or safe integer");
	return seed;
}
function validateDeck(deck) {
	const cards = ownArrayValues(deck, "deck");
	if (cards.length !== 8) throw new TypeError("deck must contain exactly eight cards");
	if (cards.some((card) => !isRuntimeCardId(card))) throw new TypeError("deck cards must be non-empty strings or positive safe integers");
	if (new Set(cards).size !== 8) throw new TypeError("deck cards must be unique");
	return cards;
}
function shuffledDeck(deck, seed) {
	const cards = [...deck];
	const random = new SeededRandom(seed).fork(SHUFFLE_STREAM_NAME);
	for (let index = cards.length - 1; index > 0; index -= 1) {
		const selected = random.int(index + 1);
		[cards[index], cards[selected]] = [cards[selected], cards[index]];
	}
	return cards;
}
function makeEvent(sequence, requestedCard, accepted, reason, slot, drawnCard) {
	return Object.freeze({
		accepted,
		cardId: isRuntimeCardId(requestedCard) ? requestedCard : null,
		drawnCard,
		reason,
		sequence,
		slot,
		type: "play"
	});
}
var DECK_CYCLE_ALGORITHM, DECK_MAX_PLAY_COMMANDS, SHUFFLE_STREAM_NAME, DeckCycle;
function init_deck() {
	return (init_deck = __esmMin((() => {
		init_rng();
		DECK_CYCLE_ALGORITHM = "fisher-yates-pcg32-deck-cycle-v1";
		DECK_MAX_PLAY_COMMANDS = 1e4;
		SHUFFLE_STREAM_NAME = "deck-cycle-v1";
		DeckCycle = class DeckCycle {
			#deck;
			#events = [];
			#hand;
			#plays = [];
			#queue;
			#seed;
			constructor(options) {
				const record = ownDataRecord(options, ["deck", "seed"], "options");
				this.#seed = assertSeed(record.seed);
				this.#deck = validateDeck(record.deck);
				const order = shuffledDeck(this.#deck, this.#seed);
				this.#hand = order.slice(0, 4);
				this.#queue = order.slice(4);
			}
			get state() {
				return {
					hand: [...this.#hand],
					next: this.#queue[0],
					queue: [...this.#queue],
					sequence: this.#plays.length
				};
			}
			get events() {
				return this.#events.map((event) => ({ ...event }));
			}
			play(cardId) {
				if (this.#plays.length >= 1e4) throw new RangeError(`deck play history cannot exceed ${DECK_MAX_PLAY_COMMANDS} commands`);
				const sequence = this.#plays.length;
				const recordedCard = isRuntimeCardId(cardId) ? cardId : null;
				let event;
				if (recordedCard === null) event = makeEvent(sequence, recordedCard, false, "invalid_card", null, null);
				else {
					const slot = this.#hand.indexOf(recordedCard);
					if (slot === -1) event = makeEvent(sequence, recordedCard, false, "not_in_hand", null, null);
					else {
						const drawnCard = this.#queue.shift();
						this.#hand[slot] = drawnCard;
						this.#queue.push(recordedCard);
						event = makeEvent(sequence, recordedCard, true, "accepted", slot, drawnCard);
					}
				}
				this.#plays.push(recordedCard);
				this.#events.push(event);
				return { ...event };
			}
			serialize() {
				return {
					algorithm: DECK_CYCLE_ALGORITHM,
					deck: [...this.#deck],
					plays: [...this.#plays],
					ruleVersion: 1,
					seed: this.#seed
				};
			}
			serializeJson() {
				return JSON.stringify(this.serialize());
			}
			static restore(serialized) {
				let snapshot = serialized;
				if (typeof serialized === "string") try {
					snapshot = JSON.parse(serialized);
				} catch {
					throw new TypeError("deck snapshot must be valid JSON");
				}
				const record = ownDataRecord(snapshot, [
					"algorithm",
					"deck",
					"plays",
					"ruleVersion",
					"seed"
				], "deck snapshot");
				if (record.algorithm !== "fisher-yates-pcg32-deck-cycle-v1" || record.ruleVersion !== 1) throw new TypeError("deck snapshot uses an unsupported rule");
				const commands = ownArrayValues(record.plays, "deck snapshot plays", DECK_MAX_PLAY_COMMANDS);
				if (commands.some((cardId) => cardId !== null && !isRuntimeCardId(cardId))) throw new TypeError("deck snapshot contains an invalid play command");
				const cycle = new DeckCycle({
					deck: record.deck,
					seed: record.seed
				});
				for (const cardId of commands) cycle.play(cardId);
				return cycle;
			}
		};
	})))();
}
//#endregion
//#region src/sim/session-card-runtime.js
function canonical$6(value) {
	if (Array.isArray(value)) return `[${value.map(canonical$6).join(",")}]`;
	if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical$6(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function freeze$5(value) {
	if (value && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) freeze$5(child);
		Object.freeze(value);
	}
	return value;
}
function exact$6(value, keys, label) {
	if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${label} must be a plain object`);
	const actual = Object.keys(value).sort(), expected = [...keys].sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} has an invalid shape`);
	return value;
}
function parse$1(text, label, maximum = 2e6) {
	if (typeof text !== "string") throw new TypeError(`${label} must be canonical JSON text`);
	let bytes = 0;
	for (let index = 0; index < text.length; index += 1) {
		const code = text.charCodeAt(index);
		if (code >= 55296 && code <= 56319) {
			const low = text.charCodeAt(index + 1);
			if (!(low >= 56320 && low <= 57343)) throw new TypeError(`${label} contains a lone surrogate`);
			bytes += 4;
			index += 1;
		} else if (code >= 56320 && code <= 57343) throw new TypeError(`${label} contains a lone surrogate`);
		else bytes += code <= 127 ? 1 : code <= 2047 ? 2 : 3;
	}
	if (bytes > maximum) throw new RangeError(`${label} exceeds its byte bound`);
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw new TypeError(`${label} must be valid JSON`);
	}
	const stack = [{
		depth: 0,
		value
	}];
	let nodes = 0;
	while (stack.length) {
		const current = stack.pop();
		nodes += 1;
		if (nodes > 1e4 || current.depth > 64) throw new RangeError(`${label} exceeds its graph bound`);
		const item = current.value;
		if (item === null || [
			"boolean",
			"number",
			"string"
		].includes(typeof item)) continue;
		if (!item || typeof item !== "object") throw new TypeError(`${label} contains invalid data`);
		const values = Array.isArray(item) ? item : Object.values(item);
		if (values.length > 2e4) throw new RangeError(`${label} exceeds its array/property bound`);
		for (let index = values.length - 1; index >= 0; index -= 1) stack.push({
			depth: current.depth + 1,
			value: values[index]
		});
	}
	if (canonical$6(value) !== text) throw new TypeError(`${label} must be canonical JSON`);
	return value;
}
function checkedDeck(value) {
	if (!Array.isArray(value) || value.length !== 8 || Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError("session card runtime deck must contain eight admission records");
	const cards = value.map((raw, index) => {
		const card = exact$6(raw, [
			"cost",
			"id",
			"kind",
			"placementClass"
		], `session card runtime deck[${index}]`);
		if (!Number.isSafeInteger(card.cost) || card.cost < 1 || card.cost > 10 || typeof card.id !== "string" || card.id.length === 0 || ![
			"effect",
			"structure",
			"unit"
		].includes(card.kind) || card.placementClass !== (card.kind === "effect" ? "global_effect" : "ground_entity")) throw new TypeError(`session card runtime deck[${index}] is invalid`);
		return clone$5(card);
	});
	if (new Set(cards.map(({ id }) => id)).size !== 8) throw new TypeError("session card runtime deck IDs must be unique");
	return cards;
}
function checkedRoute(value) {
	const hasTarget = Object.hasOwn(value, "target");
	const route = exact$6(value, hasTarget ? [
		"cardId",
		"commandId",
		"point",
		"sequence",
		"side",
		"target",
		"tick"
	] : [
		"cardId",
		"commandId",
		"point",
		"sequence",
		"side",
		"tick"
	], "session card route");
	exact$6(route.point, ["x", "y"], "session card route.point");
	if (typeof route.cardId !== "string" || !["north", "south"].includes(route.side) || !Number.isSafeInteger(route.commandId) || route.commandId < 0 || !Number.isSafeInteger(route.sequence) || route.sequence < 0 || !Number.isSafeInteger(route.tick) || route.tick < 0 || !Number.isSafeInteger(route.point.x) || !Number.isSafeInteger(route.point.y)) throw new TypeError("session card route is invalid");
	if (!hasTarget) return clone$5(route);
	const target = exact$6(route.target, ["id", "kind"], "session card route.target");
	if (target.kind === "unit" && Number.isSafeInteger(target.id) && target.id > 0) return {
		...clone$5(route),
		target: {
			id: target.id,
			kind: target.kind
		}
	};
	throw new TypeError("session card route.target must name one shared unit");
}
function isAuthenticSessionCardRuntime(value) {
	return authenticRuntimes.has(value);
}
var authenticRuntimes, clone$5, SessionCardRuntime;
function init_session_card_runtime() {
	return (init_session_card_runtime = __esmMin((() => {
		init_deployment();
		authenticRuntimes = /* @__PURE__ */ new WeakSet();
		clone$5 = (value) => JSON.parse(JSON.stringify(value));
		SessionCardRuntime = class SessionCardRuntime {
			#cards;
			#admissions;
			#deck;
			#history = [];
			constructor(canonicalDeck) {
				const cards = checkedDeck(parse$1(canonicalDeck, "session card runtime deck", 16384));
				this.#admissions = clone$5(cards);
				this.#deck = cards.map(({ id }) => id);
				this.#cards = new Map(cards.map((card) => [card.id, card]));
				if (new.target === SessionCardRuntime) authenticRuntimes.add(this);
			}
			get state() {
				const counts = {
					effect: 0,
					structure: 0,
					unit: 0
				};
				for (const route of this.#history) counts[route.kind] += 1;
				return freeze$5({
					cards: clone$5(this.#admissions),
					counts,
					deck: [...this.#deck],
					history: clone$5(this.#history)
				});
			}
			card(cardId) {
				if (typeof cardId !== "string") throw new TypeError("session runtime card ID must be primitive");
				const card = this.#cards.get(cardId);
				if (!card) throw new RangeError("session runtime card is not in the admitted deck");
				return freeze$5(clone$5(card));
			}
			route(canonicalRoute) {
				if (this.#history.length >= 2e4) throw new RangeError("session card route history exceeds its bound");
				const route = checkedRoute(parse$1(canonicalRoute, "session card route", 16384));
				const card = this.card(route.cardId);
				if (this.#history.some((entry) => entry.sequence === route.sequence || entry.side === route.side && entry.commandId === route.commandId)) throw new RangeError("session card route identity is duplicate");
				const placement = evaluateDeployment({
					destroyedOpposingLaneTowers: [],
					placementClass: card.placementClass,
					point: route.point,
					side: route.side
				});
				if (!placement.legal) throw new RangeError(`session card route is illegal: ${placement.reason}`);
				if (Object.hasOwn(route, "target") && card.kind !== "effect") throw new TypeError("session card route target requires an effect card");
				const event = {
					cardId: route.cardId,
					commandId: route.commandId,
					kind: card.kind,
					placementClass: card.placementClass,
					point: route.point,
					sequence: route.sequence,
					side: route.side,
					tick: route.tick,
					type: "session-card-routed"
				};
				if (Object.hasOwn(route, "target")) event.target = route.target;
				freeze$5(event);
				this.#history.push(clone$5(event));
				return event;
			}
			serialize() {
				return canonical$6({
					cards: this.#admissions,
					history: this.#history,
					version: 1
				});
			}
			fork() {
				return SessionCardRuntime.restore(this.serialize());
			}
			static restore(serialized) {
				const value = exact$6(parse$1(serialized, "session card runtime snapshot"), [
					"cards",
					"history",
					"version"
				], "session card runtime snapshot");
				if (value.version !== 1 || !Array.isArray(value.history) || value.history.length > 2e4) throw new TypeError("session card runtime snapshot is unsupported or oversized");
				const runtime = new SessionCardRuntime(canonical$6(value.cards));
				for (const route of value.history) {
					const input = exact$6(route, Object.hasOwn(route, "target") ? [
						"cardId",
						"commandId",
						"kind",
						"placementClass",
						"point",
						"sequence",
						"side",
						"target",
						"tick",
						"type"
					] : [
						"cardId",
						"commandId",
						"kind",
						"placementClass",
						"point",
						"sequence",
						"side",
						"tick",
						"type"
					], "session card history route");
					const card = runtime.card(input.cardId);
					if (input.type !== "session-card-routed" || input.kind !== card.kind || input.placementClass !== card.placementClass) throw new TypeError("session card history route diverges from its admitted card");
					if (canonical$6(runtime.route(canonical$6({
						cardId: input.cardId,
						commandId: input.commandId,
						point: input.point,
						sequence: input.sequence,
						side: input.side,
						...Object.hasOwn(input, "target") ? { target: input.target } : {},
						tick: input.tick
					}))) !== canonical$6(input)) throw new TypeError("session card history route is noncanonical");
				}
				if (runtime.serialize() !== serialized) throw new TypeError("session card runtime snapshot is noncanonical");
				return runtime;
			}
		};
	})))();
}
//#endregion
//#region src/sim/session-building-profile-receipts.js
function canonical$5(value) {
	if (Array.isArray(value)) return `[${value.map(canonical$5).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical$5(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function defensivePolicy(cardId) {
	const values = CORPUS_VALUES[cardId];
	return {
		confidence: "unverified",
		corpusFields: Object.fromEntries(CORPUS_FIELDS.map((field, index) => {
			const authoritative = field === "cost" || cardId === "bulwark-needle" && field === "hitSpeedTicks";
			return [field, {
				authoritative,
				confidence: authoritative ? "high" : "unverified",
				source: field === "cost" ? CARD_IDENTITY_SOURCE : BUILDING_CORPUS_SOURCE,
				value: values[index]
			}];
		})),
		disposition: "question",
		source: BUILDING_POLICY_SOURCE
	};
}
/**
* Accepts only the exact canonical JSON receipt associated with `cardId`.
* The receipt is always derived by a safe local serializer after the caller's
* outer boundary has accepted canonical JSON text.  Taking text rather than a
* caller object makes this assertion itself non-observing for hostile object
* values: it never reflects, enumerates, or reads a profile supplied here.
*/
function assertSessionBuildingProfileReceipt(cardId, receipt, label = "building runtime profile") {
	if (typeof cardId !== "string" || typeof receipt !== "string" || !Object.hasOwn(RECEIPTS, cardId)) throw new TypeError(`${label} diverges from its canonical session-card receipt`);
	if (DEFENSIVE_CARD_IDS.has(cardId)) {
		let profile;
		try {
			profile = JSON.parse(receipt);
		} catch {
			throw new TypeError(`${label} diverges from its canonical session-card receipt`);
		}
		const policy = profile?.policy;
		if (profile === null || Array.isArray(profile) || typeof profile !== "object" || !Object.hasOwn(profile, "policy") || canonical$5(profile) !== receipt) throw new TypeError(`${label} diverges from its canonical session-card receipt`);
		delete profile.policy;
		if (canonical$5(profile) !== RECEIPTS[cardId] || canonical$5(policy) !== canonical$5(defensivePolicy(cardId))) throw new TypeError(`${label} diverges from its canonical session-card receipt`);
		return;
	}
	if (Object.hasOwn(NONDEFENSIVE_POLICIES, cardId)) {
		let profile;
		try {
			profile = JSON.parse(receipt);
		} catch {
			throw new TypeError(`${label} diverges from its canonical session-card receipt`);
		}
		if (profile === null || Array.isArray(profile) || typeof profile !== "object" || !Object.hasOwn(profile, "policy") || canonical$5(profile) !== receipt) throw new TypeError(`${label} diverges from its canonical session-card receipt`);
		const policy = profile.policy;
		delete profile.policy;
		if (canonical$5(profile) !== RECEIPTS[cardId] || canonical$5(policy) !== canonical$5(NONDEFENSIVE_POLICIES[cardId])) throw new TypeError(`${label} diverges from its canonical session-card receipt`);
		return;
	}
	if (receipt !== RECEIPTS[cardId]) throw new TypeError(`${label} diverges from its canonical session-card receipt`);
}
var RECEIPTS, NONDEFENSIVE_POLICIES, DEFENSIVE_CARD_IDS, CORPUS_FIELDS, CORPUS_VALUES, BUILDING_POLICY_SOURCE, BUILDING_CORPUS_SOURCE, CARD_IDENTITY_SOURCE;
function init_session_building_profile_receipts() {
	return (init_session_building_profile_receipts = __esmMin((() => {
		RECEIPTS = Object.freeze({
			"aether-well": "{\"class\":\"resource\",\"deployTicks\":60,\"generationAmount\":1,\"generationCadenceTicks\":510,\"hitpoints\":1070,\"lifetimeTicks\":4200}",
			"bulwark-needle": "{\"areaDamageRadiusMillitiles\":null,\"class\":\"defensive\",\"damage\":212,\"deployTicks\":60,\"firstHitTicks\":0,\"hitSpeedTicks\":54,\"hitpoints\":824,\"lifetimeTicks\":1800,\"maxRangeMillitiles\":5500,\"minRangeMillitiles\":0,\"rampStages\":[212],\"rampThresholds\":[0],\"targetMode\":\"ground\",\"variant\":\"plain\"}",
			"buried-coil": "{\"areaDamageRadiusMillitiles\":null,\"class\":\"defensive\",\"damage\":230,\"deployTicks\":60,\"firstHitTicks\":42,\"hitSpeedTicks\":72,\"hitpoints\":1152,\"lifetimeTicks\":1800,\"maxRangeMillitiles\":5500,\"minRangeMillitiles\":0,\"rampStages\":[230],\"rampThresholds\":[0],\"targetMode\":\"air_and_ground\",\"variant\":\"hidden\"}",
			"burrow-rig": "{\"class\":\"travel\",\"deployTicks\":60,\"emergenceSpawnDelayTicks\":12,\"hitpoints\":1440,\"lifetimeTicks\":1800,\"travelSpeedMillitilesPerSecond\":1500}",
			"cinder-reliquary": "{\"class\":\"death-effect\",\"damage\":160,\"deathDamage\":200,\"deployTicks\":60,\"firstHitTicks\":60,\"hitSpeedTicks\":120,\"hitpoints\":1200,\"radius\":2000,\"rangeMillitiles\":4500,\"targetMode\":\"ground\",\"towerModifier\":{\"denominator\":100,\"numerator\":35}}",
			"ember-basin": "{\"areaDamageRadiusMillitiles\":1000,\"class\":\"defensive\",\"damage\":222,\"deployTicks\":60,\"firstHitTicks\":66,\"hitSpeedTicks\":96,\"hitpoints\":1356,\"lifetimeTicks\":1800,\"maxRangeMillitiles\":6000,\"minRangeMillitiles\":0,\"rampStages\":[222],\"rampThresholds\":[0],\"targetMode\":\"ground\",\"variant\":\"splash\"}",
			"horizon-caster": "{\"areaDamageRadiusMillitiles\":null,\"class\":\"defensive\",\"damage\":266,\"deployTicks\":210,\"firstHitTicks\":240,\"hitSpeedTicks\":300,\"hitpoints\":1369,\"lifetimeTicks\":1800,\"maxRangeMillitiles\":11500,\"minRangeMillitiles\":3000,\"rampStages\":[266],\"rampThresholds\":[0],\"targetMode\":\"ground\",\"variant\":\"siege\"}",
			"prism-furnace": "{\"areaDamageRadiusMillitiles\":null,\"class\":\"defensive\",\"damage\":42,\"deployTicks\":60,\"firstHitTicks\":72,\"hitSpeedTicks\":24,\"hitpoints\":1749,\"lifetimeTicks\":1800,\"maxRangeMillitiles\":6000,\"minRangeMillitiles\":0,\"rampStages\":[42,84,168],\"rampThresholds\":[0,2,4],\"targetMode\":\"air_and_ground\",\"variant\":\"ramp\"}"
		});
		NONDEFENSIVE_POLICIES = Object.freeze({
			"aether-well": Object.freeze({
				generationAmount: Object.freeze({
					authoritative: false,
					confidence: "absent",
					disposition: "question",
					key: "generationAmount",
					source: "pre-evolutions-building-corpus-and-absent-resource-policy",
					value: 1
				}),
				generationCadenceTicks: Object.freeze({
					authoritative: false,
					confidence: "absent",
					disposition: "question",
					key: "generationCadenceTicks",
					source: "pre-evolutions-building-corpus-and-absent-resource-policy",
					value: 510
				}),
				lifetimeTicks: Object.freeze({
					authoritative: false,
					confidence: "absent",
					disposition: "question",
					key: "lifetimeTicks",
					source: "pre-evolutions-building-corpus-and-absent-resource-policy",
					value: 4200
				})
			}),
			"burrow-rig": Object.freeze({
				emergenceSpawnDelayTicks: Object.freeze({
					authoritative: false,
					confidence: "unverified",
					disposition: "question",
					key: "emergenceSpawnDelayTicks",
					source: "pre-evolutions-building-corpus-and-unsourced-travel-policy",
					value: 12
				}),
				lifetimeTicks: Object.freeze({
					authoritative: false,
					confidence: "unverified",
					disposition: "question",
					key: "lifetimeTicks",
					source: "pre-evolutions-building-corpus-and-unsourced-travel-policy",
					value: 1800
				}),
				travelSpeedMillitilesPerSecond: Object.freeze({
					authoritative: false,
					confidence: "unverified",
					disposition: "question",
					key: "travelSpeedMillitilesPerSecond",
					source: "pre-evolutions-building-corpus-and-unsourced-travel-policy",
					value: 1500
				})
			}),
			"cinder-reliquary": Object.freeze({
				deathDamage: Object.freeze({
					authoritative: false,
					confidence: "unverified",
					disposition: "question",
					key: "damage",
					provenance: Object.freeze({
						accessed: "2026-07-30",
						document: "SOURCES.md",
						location: "Known limitations",
						statement: "Card abilities, including death damage and crown-tower damage multipliers, are outside the common schema."
					}),
					value: 200
				}),
				radius: Object.freeze({
					authoritative: false,
					confidence: "unverified",
					disposition: "question",
					key: "radius",
					provenance: Object.freeze({
						accessed: "2026-07-30",
						document: "SOURCES.md",
						location: "Known limitations",
						statement: "Card abilities, including death damage and crown-tower damage multipliers, are outside the common schema."
					}),
					value: 2e3
				}),
				towerModifier: Object.freeze({
					authoritative: false,
					confidence: "unverified",
					disposition: "question",
					key: "towerModifier",
					provenance: Object.freeze({
						accessed: "2026-07-30",
						document: "SOURCES.md",
						location: "Known limitations",
						statement: "Card abilities, including death damage and crown-tower damage multipliers, are outside the common schema."
					}),
					value: Object.freeze({
						denominator: 100,
						numerator: 35
					})
				})
			})
		});
		DEFENSIVE_CARD_IDS = /* @__PURE__ */ new Set([
			"bulwark-needle",
			"buried-coil",
			"ember-basin",
			"horizon-caster",
			"prism-furnace"
		]);
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
		CORPUS_VALUES = Object.freeze({
			"bulwark-needle": Object.freeze([
				3,
				212,
				60,
				null,
				54,
				824,
				5500,
				"ground",
				5500
			]),
			"buried-coil": Object.freeze([
				4,
				230,
				60,
				42,
				72,
				1152,
				5500,
				"air_and_ground",
				5500
			]),
			"ember-basin": Object.freeze([
				4,
				222,
				60,
				66,
				96,
				1356,
				6e3,
				"ground",
				6e3
			]),
			"horizon-caster": Object.freeze([
				4,
				266,
				210,
				240,
				300,
				1369,
				11500,
				"ground",
				11500
			]),
			"prism-furnace": Object.freeze([
				5,
				42,
				60,
				72,
				24,
				1749,
				6e3,
				"air_and_ground",
				6e3
			])
		});
		BUILDING_POLICY_SOURCE = "pre-evolutions-building-corpus-and-unsourced-policy-fixture";
		BUILDING_CORPUS_SOURCE = "pinned-pre-march-2023-building-constants";
		CARD_IDENTITY_SOURCE = "pinned-pre-march-2023-card-roster-identity";
	})))();
}
//#endregion
//#region src/sim/session-building-runtime.js
function canonical$4(value) {
	if (Array.isArray(value)) return `[${value.map(canonical$4).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical$4(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function freeze$4(value) {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) freeze$4(child);
		Object.freeze(value);
	}
	return value;
}
function exact$5(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain data object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Object.keys(descriptors).sort();
	const expected = [...keys].sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]) || actual.some((key) => !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function dense$1(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).length !== value.length + 1) throw new TypeError(`${label} must be dense`);
	return Array.from({ length: value.length }, (_, index) => {
		const descriptor = descriptors[index];
		if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label} must be dense`);
		return descriptor.value;
	});
}
function integer$4(value, minimum, maximum, label) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
	return value;
}
function point(value, label) {
	const item = exact$5(value, ["x", "y"], label);
	return {
		x: integer$4(item.x, -1e6, MAX_POSITION, `${label}.x`),
		y: integer$4(item.y, -1e6, MAX_POSITION, `${label}.y`)
	};
}
function scalarBytes(text, label) {
	let bytes = 0;
	for (let index = 0; index < text.length; index += 1) {
		const code = text.charCodeAt(index);
		if (code >= 55296 && code <= 56319) {
			const low = text.charCodeAt(index + 1);
			if (!(low >= 56320 && low <= 57343)) throw new TypeError(`${label} contains a lone surrogate`);
			bytes += 4;
			index += 1;
		} else if (code >= 56320 && code <= 57343) throw new TypeError(`${label} contains a lone surrogate`);
		else bytes += code <= 127 ? 1 : code <= 2047 ? 2 : 3;
	}
	return bytes;
}
function parsed(text, label) {
	if (typeof text !== "string") throw new TypeError(`${label} must be canonical JSON text`);
	if (scalarBytes(text, label) > MAX_BOUNDARY_BYTES) throw new RangeError(`${label} exceeds its byte bound`);
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw new TypeError(`${label} must be valid JSON`);
	}
	const pending = [{
		depth: 0,
		value
	}];
	let nodes = 0;
	while (pending.length > 0) {
		const current = pending.pop();
		nodes += 1;
		if (nodes > MAX_BOUNDARY_NODES || current.depth > MAX_BOUNDARY_DEPTH) throw new RangeError(`${label} exceeds its graph bound`);
		const entry = current.value;
		if (entry === null || typeof entry === "boolean") continue;
		if (typeof entry === "number") {
			if (!Number.isSafeInteger(entry)) throw new TypeError(`${label} contains a non-safe integer`);
			continue;
		}
		if (typeof entry === "string") {
			scalarBytes(entry, label);
			continue;
		}
		if (!entry || typeof entry !== "object") throw new TypeError(`${label} contains an invalid value`);
		if (Array.isArray(entry)) {
			if (entry.length > MAX_BOUNDARY_NODES) throw new RangeError(`${label} exceeds its array bound`);
			for (let index = entry.length - 1; index >= 0; index -= 1) pending.push({
				depth: current.depth + 1,
				value: entry[index]
			});
			continue;
		}
		if (Object.getPrototypeOf(entry) !== Object.prototype) throw new TypeError(`${label} contains a non-plain object`);
		const keys = Object.keys(entry);
		if (keys.length > 128) throw new RangeError(`${label} exceeds its key bound`);
		for (let index = keys.length - 1; index >= 0; index -= 1) {
			const key = keys[index];
			if ([
				"__proto__",
				"constructor",
				"prototype"
			].includes(key)) throw new TypeError(`${label} contains a forbidden key`);
			scalarBytes(key, label);
			pending.push({
				depth: current.depth + 1,
				value: entry[key]
			});
		}
	}
	if (canonical$4(value) !== text) throw new TypeError(`${label} must be canonical JSON`);
	return value;
}
function opposite(side) {
	return side === "north" ? "south" : "north";
}
function distanceSquared(left, right) {
	const dx = BigInt(left.x) - BigInt(right.x);
	const dy = BigInt(left.y) - BigInt(right.y);
	return dx * dx + dy * dy;
}
function withinDistance(left, right, distance) {
	const reach = BigInt(distance);
	return distanceSquared(left, right) <= reach * reach;
}
function isSessionBuildingCardId(value) {
	return typeof value === "string" && ADMITTED.has(value);
}
function profileInteger(value, key, label, minimum = 0, maximum = MAX_DAMAGE) {
	return integer$4(value[key], minimum, maximum, `${label}.${key}`);
}
function checkedQuestionPolicy(value, fields, label, expectedSource) {
	const policy = exact$5(value, fields.map(([field]) => field), label);
	const confidence = expectedSource === "pre-evolutions-building-corpus-and-absent-resource-policy" ? "absent" : "unverified";
	const checked = {};
	for (const [field, sourceKey, expectedValue] of fields) {
		const recordKeys = expectedSource === null ? [
			"authoritative",
			"confidence",
			"disposition",
			"key",
			"provenance",
			"value"
		] : [
			"authoritative",
			"confidence",
			"disposition",
			"key",
			"source",
			"value"
		];
		const record = exact$5(policy[field], recordKeys, `${label}.${field}`);
		if (record.authoritative !== false || record.confidence !== confidence || record.disposition !== "question" || record.key !== sourceKey || canonical$4(record.value) !== canonical$4(expectedValue)) throw new TypeError(`${label}.${field} must retain its exact QUESTION record`);
		if (expectedSource !== null) {
			if (record.source !== expectedSource) throw new TypeError(`${label}.${field} has invalid QUESTION provenance`);
		} else {
			const provenance = exact$5(record.provenance, [
				"accessed",
				"document",
				"location",
				"statement"
			], `${label}.${field}.provenance`);
			if (provenance.accessed !== "2026-07-30" || provenance.document !== "SOURCES.md" || provenance.location !== "Known limitations" || provenance.statement !== "Card abilities, including death damage and crown-tower damage multipliers, are outside the common schema.") throw new TypeError(`${label}.${field} has invalid QUESTION provenance`);
		}
		checked[field] = clone$4(record);
	}
	return checked;
}
function checkedDefensiveQuestionPolicy(value, cardId, label) {
	const policy = exact$5(value, [
		"confidence",
		"corpusFields",
		"disposition",
		"source"
	], label);
	if (policy.confidence !== "unverified" || policy.disposition !== "question" || policy.source !== "pre-evolutions-building-corpus-and-unsourced-policy-fixture") throw new TypeError(`${label} must retain its QUESTION disposition`);
	const corpus = exact$5(policy.corpusFields, DEFENSIVE_CORPUS_FIELDS, `${label}.corpusFields`);
	const corpusFields = {};
	for (const key of DEFENSIVE_CORPUS_FIELDS) {
		const record = exact$5(corpus[key], [
			"authoritative",
			"confidence",
			"source",
			"value"
		], `${label}.corpusFields.${key}`);
		const authoritative = key === "cost" || cardId === "bulwark-needle" && key === "hitSpeedTicks";
		const source = key === "cost" ? "pinned-pre-march-2023-card-roster-identity" : "pinned-pre-march-2023-building-constants";
		if (record.authoritative !== authoritative || record.confidence !== (authoritative ? "high" : "unverified") || record.source !== source || !(record.value === null || typeof record.value === "string" || Number.isSafeInteger(record.value))) throw new TypeError(`${label}.corpusFields.${key} has invalid provenance`);
		corpusFields[key] = {
			authoritative,
			confidence: authoritative ? "high" : "unverified",
			source,
			value: record.value
		};
	}
	return {
		confidence: "unverified",
		corpusFields,
		disposition: "question",
		source: policy.source
	};
}
function checkedProfile$1(value, cardId) {
	const expectedClass = CLASS_BY_ID[cardId];
	const label = `session building profile ${cardId}`;
	if (expectedClass === "defensive") {
		const profile = exact$5(value, [
			"areaDamageRadiusMillitiles",
			"class",
			"damage",
			"deployTicks",
			"firstHitTicks",
			"hitSpeedTicks",
			"hitpoints",
			"lifetimeTicks",
			"maxRangeMillitiles",
			"minRangeMillitiles",
			"policy",
			"rampStages",
			"rampThresholds",
			"targetMode",
			"variant"
		], label);
		if (profile.class !== expectedClass || !["air_and_ground", "ground"].includes(profile.targetMode) || ![
			"hidden",
			"plain",
			"ramp",
			"siege",
			"splash"
		].includes(profile.variant) || profile.areaDamageRadiusMillitiles !== null && (!Number.isSafeInteger(profile.areaDamageRadiusMillitiles) || profile.areaDamageRadiusMillitiles < 0 || profile.areaDamageRadiusMillitiles > MAX_POSITION)) throw new TypeError(`${label} is invalid`);
		const result = {
			areaDamageRadiusMillitiles: profile.areaDamageRadiusMillitiles,
			class: expectedClass,
			damage: profileInteger(profile, "damage", label, 1),
			deployTicks: profileInteger(profile, "deployTicks", label, 0, MAX_TICK$1),
			firstHitTicks: profileInteger(profile, "firstHitTicks", label, 0, MAX_TICK$1),
			hitSpeedTicks: profileInteger(profile, "hitSpeedTicks", label, 1, MAX_TICK$1),
			hitpoints: profileInteger(profile, "hitpoints", label, 1),
			lifetimeTicks: profileInteger(profile, "lifetimeTicks", label, 1, MAX_TICK$1),
			maxRangeMillitiles: profileInteger(profile, "maxRangeMillitiles", label, 0, MAX_POSITION),
			minRangeMillitiles: profileInteger(profile, "minRangeMillitiles", label, 0, MAX_POSITION),
			policy: checkedDefensiveQuestionPolicy(profile.policy, cardId, `${label}.policy`),
			rampStages: dense$1(profile.rampStages, 8, `${label}.rampStages`).map((stage, index) => integer$4(stage, 1, MAX_DAMAGE, `${label}.rampStages[${index}]`)),
			rampThresholds: dense$1(profile.rampThresholds, 8, `${label}.rampThresholds`).map((threshold, index) => integer$4(threshold, 0, MAX_DAMAGE, `${label}.rampThresholds[${index}]`)),
			targetMode: profile.targetMode,
			variant: profile.variant
		};
		if (result.minRangeMillitiles > result.maxRangeMillitiles || result.rampStages.length === 0 || result.rampStages.length !== result.rampThresholds.length || result.rampThresholds.some((threshold, index) => index > 0 && threshold <= result.rampThresholds[index - 1]) || result.variant === "splash" && result.areaDamageRadiusMillitiles === null || result.variant !== "splash" && result.areaDamageRadiusMillitiles !== null) throw new TypeError(`${label} has inconsistent defensive policy`);
		return result;
	}
	if (expectedClass === "resource") {
		const profile = exact$5(value, [
			"class",
			"deployTicks",
			"generationAmount",
			"generationCadenceTicks",
			"hitpoints",
			"lifetimeTicks",
			"policy"
		], label);
		if (profile.class !== expectedClass) throw new TypeError(`${label} is invalid`);
		const result = {
			class: expectedClass,
			deployTicks: profileInteger(profile, "deployTicks", label, 0, MAX_TICK$1),
			generationAmount: profileInteger(profile, "generationAmount", label, 1, 10),
			generationCadenceTicks: profileInteger(profile, "generationCadenceTicks", label, 1, MAX_TICK$1),
			hitpoints: profileInteger(profile, "hitpoints", label, 1),
			lifetimeTicks: profileInteger(profile, "lifetimeTicks", label, 1, MAX_TICK$1)
		};
		result.policy = checkedQuestionPolicy(profile.policy, [
			[
				"generationAmount",
				"generationAmount",
				result.generationAmount
			],
			[
				"generationCadenceTicks",
				"generationCadenceTicks",
				result.generationCadenceTicks
			],
			[
				"lifetimeTicks",
				"lifetimeTicks",
				result.lifetimeTicks
			]
		], `${label}.policy`, "pre-evolutions-building-corpus-and-absent-resource-policy");
		return result;
	}
	if (expectedClass === "travel") {
		const profile = exact$5(value, [
			"class",
			"deployTicks",
			"emergenceSpawnDelayTicks",
			"hitpoints",
			"lifetimeTicks",
			"travelSpeedMillitilesPerSecond",
			"policy"
		], label);
		if (profile.class !== expectedClass || profile.travelSpeedMillitilesPerSecond === MOVEMENT_SPEEDS.stationary || !Object.values(MOVEMENT_SPEEDS).includes(profile.travelSpeedMillitilesPerSecond)) throw new TypeError(`${label} is invalid`);
		const result = {
			class: expectedClass,
			deployTicks: profileInteger(profile, "deployTicks", label, 0, MAX_TICK$1),
			emergenceSpawnDelayTicks: profileInteger(profile, "emergenceSpawnDelayTicks", label, 0, MAX_TICK$1),
			hitpoints: profileInteger(profile, "hitpoints", label, 1),
			lifetimeTicks: profileInteger(profile, "lifetimeTicks", label, 1, MAX_TICK$1),
			travelSpeedMillitilesPerSecond: profile.travelSpeedMillitilesPerSecond
		};
		result.policy = checkedQuestionPolicy(profile.policy, [
			[
				"emergenceSpawnDelayTicks",
				"emergenceSpawnDelayTicks",
				result.emergenceSpawnDelayTicks
			],
			[
				"lifetimeTicks",
				"lifetimeTicks",
				result.lifetimeTicks
			],
			[
				"travelSpeedMillitilesPerSecond",
				"travelSpeedMillitilesPerSecond",
				result.travelSpeedMillitilesPerSecond
			]
		], `${label}.policy`, "pre-evolutions-building-corpus-and-unsourced-travel-policy");
		return result;
	}
	const profile = exact$5(value, [
		"class",
		"damage",
		"deathDamage",
		"deployTicks",
		"firstHitTicks",
		"hitSpeedTicks",
		"hitpoints",
		"policy",
		"radius",
		"rangeMillitiles",
		"targetMode",
		"towerModifier"
	], label);
	const modifier = exact$5(profile.towerModifier, ["denominator", "numerator"], `${label}.towerModifier`);
	if (profile.class !== expectedClass || profile.targetMode !== "ground") throw new TypeError(`${label} is invalid`);
	const result = {
		class: expectedClass,
		damage: profileInteger(profile, "damage", label, 1),
		deathDamage: profileInteger(profile, "deathDamage", label, 1),
		deployTicks: profileInteger(profile, "deployTicks", label, 0, MAX_TICK$1),
		firstHitTicks: profileInteger(profile, "firstHitTicks", label, 0, MAX_TICK$1),
		hitSpeedTicks: profileInteger(profile, "hitSpeedTicks", label, 1, MAX_TICK$1),
		hitpoints: profileInteger(profile, "hitpoints", label, 1),
		radius: profileInteger(profile, "radius", label, 0, MAX_POSITION),
		rangeMillitiles: profileInteger(profile, "rangeMillitiles", label, 0, MAX_POSITION),
		targetMode: profile.targetMode,
		towerModifier: {
			denominator: integer$4(modifier.denominator, 1, MAX_DAMAGE, `${label}.towerModifier.denominator`),
			numerator: integer$4(modifier.numerator, 0, MAX_DAMAGE, `${label}.towerModifier.numerator`)
		}
	};
	result.policy = checkedQuestionPolicy(profile.policy, [
		[
			"deathDamage",
			"damage",
			result.deathDamage
		],
		[
			"radius",
			"radius",
			result.radius
		],
		[
			"towerModifier",
			"towerModifier",
			result.towerModifier
		]
	], `${label}.policy`, null);
	return result;
}
function checkedProfileReceipt(value) {
	const receipt = exact$5(value, ["profiles", "version"], "session building profile receipt");
	if (receipt.version !== 1) throw new TypeError("session building profile receipt version is unsupported");
	const profiles = /* @__PURE__ */ new Map();
	for (const [index, raw] of dense$1(receipt.profiles, SESSION_BUILDING_ADMITTED_IDS.length, "session building profile receipt.profiles").entries()) {
		const entry = exact$5(raw, ["cardId", "profile"], `session building profile receipt.profiles[${index}]`);
		if (!ADMITTED.has(entry.cardId) || profiles.has(entry.cardId)) throw new TypeError("session building profile receipt identities are invalid");
		assertSessionBuildingProfileReceipt(entry.cardId, canonical$4(entry.profile), `session building profile receipt.profiles[${index}].profile`);
		profiles.set(entry.cardId, freeze$4(checkedProfile$1(entry.profile, entry.cardId)));
	}
	return profiles;
}
function checkedPlacement(value, profiles) {
	const route = exact$5(value, [
		"cardId",
		"destination",
		"id",
		"point",
		"side",
		"tick"
	], "session building placement receipt");
	if (!ADMITTED.has(route.cardId) || !profiles.has(route.cardId) || !SIDES$1.has(route.side)) throw new TypeError("session building placement receipt has an unknown identity");
	const id = integer$4(route.id, 1, Number.MAX_SAFE_INTEGER, "session building placement receipt.id");
	const tick = integer$4(route.tick, 0, 17999, "session building placement receipt.tick");
	const placement = point(route.point, "session building placement receipt.point");
	const destination = route.destination === null ? null : point(route.destination, "session building placement receipt.destination");
	if (route.cardId === "burrow-rig" !== (destination !== null)) throw new TypeError("underground travel receipt must carry exactly one destination");
	const legality = evaluateDeployment({
		destroyedOpposingLaneTowers: [],
		placementClass: "ground_entity",
		point: placement,
		side: route.side
	});
	if (!legality.legal) throw new RangeError(`session building placement is illegal: ${legality.reason}`);
	return {
		cardId: route.cardId,
		destination,
		id,
		point: placement,
		side: route.side,
		tick
	};
}
function travelMovement(path, index, profile) {
	if (index >= path.length - 1) return serializeMovementState(createMovementState());
	return serializeMovementState(createMovementState({
		direction: 1,
		speed: profile.travelSpeedMillitilesPerSecond
	}));
}
/**
* Pure placement materializer.  `id` and `tick` are host receipts, never
* allocated or advanced here.
*/
function materializeSessionBuildingStructure(receiptText, profiles) {
	const receipt = checkedPlacement(parsed(receiptText, "session building placement receipt"), profiles);
	const profile = profiles.get(receipt.cardId);
	const structure = {
		alive: true,
		cardId: receipt.cardId,
		class: profile.class,
		deathCause: null,
		deathTriggered: false,
		hitpoints: profile.hitpoints,
		id: receipt.id,
		maxHitpoints: profile.hitpoints,
		policy: clone$4(profile.policy),
		placedTick: receipt.tick,
		position: clone$4(receipt.point),
		side: receipt.side,
		targetable: true
	};
	if (profile.class === "defensive") {
		structure.attackCycle = new AttackCycle({
			deployTicks: profile.deployTicks,
			firstHitTicks: profile.firstHitTicks,
			hitSpeedTicks: profile.hitSpeedTicks
		}).serialize();
		structure.consecutiveHits = 0;
		structure.hidden = profile.variant === "hidden";
		structure.policy = clone$4(profile.policy);
		structure.targetKey = null;
		structure.targetable = !structure.hidden;
	} else if (profile.class === "resource") structure.deployed = false;
	else if (profile.class === "travel") {
		const path = findGroundPath(receipt.point, receipt.destination);
		if (path === null) throw new RangeError("underground travel destination has no ground path");
		structure.destination = clone$4(receipt.destination);
		structure.emergedTick = null;
		structure.movementPrimitive = travelMovement(path, 0, profile);
		structure.path = clone$4(path);
		structure.pathIndex = 0;
		structure.phase = "deploying";
		structure.spawnQuestionPublished = false;
		structure.targetable = false;
	} else if (profile.class === "death-effect") {
		structure.attackCycle = new AttackCycle({
			deployTicks: profile.deployTicks,
			firstHitTicks: profile.firstHitTicks,
			hitSpeedTicks: profile.hitSpeedTicks
		}).serialize();
		structure.targetKey = null;
	} else throw new Error("unsupported building profile class");
	return freeze$4(clone$4(structure));
}
function checkedUnit(value, index) {
	const item = exact$5(value, [
		"alive",
		"id",
		"layer",
		"position",
		"radius",
		"side",
		"targetable"
	], `session building boundary.units[${index}]`);
	if (!SIDES$1.has(item.side) || !LAYERS$1.has(item.layer) || typeof item.alive !== "boolean" || typeof item.targetable !== "boolean") throw new TypeError(`session building boundary.units[${index}] is invalid`);
	return {
		alive: item.alive,
		id: integer$4(item.id, 1, Number.MAX_SAFE_INTEGER, `session building boundary.units[${index}].id`),
		layer: item.layer,
		position: point(item.position, `session building boundary.units[${index}].position`),
		radius: integer$4(item.radius, 0, MAX_POSITION, `session building boundary.units[${index}].radius`),
		side: item.side,
		targetable: item.targetable
	};
}
function checkedTower(value, index) {
	const item = exact$5(value, [
		"hitpoints",
		"id",
		"position",
		"side"
	], `session building boundary.towers[${index}]`);
	if (typeof item.id !== "string" || item.id.length === 0 || !SIDES$1.has(item.side)) throw new TypeError(`session building boundary.towers[${index}] is invalid`);
	return {
		hitpoints: integer$4(item.hitpoints, 0, MAX_DAMAGE, `session building boundary.towers[${index}].hitpoints`),
		id: item.id,
		position: point(item.position, `session building boundary.towers[${index}].position`),
		side: item.side
	};
}
function checkedStructure(value, index, profiles) {
	const label = `session building boundary.structures[${index}]`;
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || !Object.hasOwn(value, "cardId") || !Object.hasOwn(value, "class") || !ADMITTED.has(value.cardId) || typeof value.class !== "string") throw new TypeError(`session building boundary.structures[${index}] is invalid`);
	const profile = profiles.get(value.cardId);
	if (profile === void 0) throw new TypeError("session building structure profile is not admitted by this host");
	if (profile.class !== value.class) throw new TypeError("session building structure profile diverges");
	const common = [
		"alive",
		"cardId",
		"class",
		"deathCause",
		"deathTriggered",
		"hitpoints",
		"id",
		"maxHitpoints",
		"policy",
		"placedTick",
		"position",
		"side",
		"targetable"
	];
	const extra = profile.class === "defensive" ? [
		"attackCycle",
		"consecutiveHits",
		"hidden",
		"targetKey"
	] : profile.class === "resource" ? ["deployed"] : profile.class === "travel" ? [
		"destination",
		"emergedTick",
		"movementPrimitive",
		"path",
		"pathIndex",
		"phase",
		"spawnQuestionPublished"
	] : ["attackCycle", "targetKey"];
	const raw = exact$5(value, [...common, ...extra], label);
	if (!SIDES$1.has(raw.side) || typeof raw.alive !== "boolean" || typeof raw.targetable !== "boolean" || typeof raw.deathTriggered !== "boolean" || ![
		null,
		"combat-damage",
		"expiry"
	].includes(raw.deathCause)) throw new TypeError(`${label} is invalid`);
	integer$4(raw.id, 1, Number.MAX_SAFE_INTEGER, `session building boundary.structures[${index}].id`);
	integer$4(raw.hitpoints, 0, MAX_DAMAGE, `session building boundary.structures[${index}].hitpoints`);
	integer$4(raw.maxHitpoints, 1, MAX_DAMAGE, `session building boundary.structures[${index}].maxHitpoints`);
	integer$4(raw.placedTick, 0, 17999, `session building boundary.structures[${index}].placedTick`);
	point(raw.position, `session building boundary.structures[${index}].position`);
	if (raw.maxHitpoints !== profile.hitpoints || raw.hitpoints > raw.maxHitpoints || raw.alive && (raw.hitpoints === 0 || raw.deathCause !== null) || !raw.alive && (raw.hitpoints !== 0 || raw.targetable) || profile.class !== "death-effect" && raw.deathTriggered) throw new TypeError("session building structure hitpoints or life state diverges");
	if (canonical$4(raw.policy) !== canonical$4(profile.policy)) throw new TypeError(`${label} building policy provenance diverges`);
	if (profile.class === "defensive") {
		if (typeof raw.attackCycle !== "string" || !Number.isSafeInteger(raw.consecutiveHits) || raw.consecutiveHits < 0 || typeof raw.hidden !== "boolean" || raw.targetKey !== null && typeof raw.targetKey !== "string" || raw.targetable !== (raw.alive && !raw.hidden)) throw new TypeError(`${label} defensive state is invalid`);
		if (AttackCycle.restore(raw.attackCycle).serialize() !== raw.attackCycle) throw new TypeError(`${label} attack cycle must be canonical`);
	} else if (profile.class === "resource") {
		if (typeof raw.deployed !== "boolean" || raw.targetable !== raw.alive) throw new TypeError(`${label} resource state is invalid`);
	} else if (profile.class === "travel") {
		if (typeof raw.emergedTick !== "number" && raw.emergedTick !== null || raw.emergedTick !== null && (!Number.isSafeInteger(raw.emergedTick) || raw.emergedTick < 0 || raw.emergedTick >= MAX_TICK$1) || typeof raw.movementPrimitive !== "string" || ![
			"dead",
			"deploying",
			"emerged",
			"underground"
		].includes(raw.phase) || !Number.isSafeInteger(raw.pathIndex) || raw.pathIndex < 0 || typeof raw.spawnQuestionPublished !== "boolean") throw new TypeError(`${label} travel state is invalid`);
		point(raw.destination, `${label}.destination`);
		const path = dense$1(raw.path, 1024, `${label}.path`).map((entry, pathIndex) => point(entry, `${label}.path[${pathIndex}]`));
		if (path.length < 1 || raw.pathIndex >= path.length || canonical$4(path[path.length - 1]) !== canonical$4(raw.destination)) throw new TypeError(`${label} travel path is invalid`);
		if (serializeMovementState(restoreMovementState(raw.movementPrimitive)) !== raw.movementPrimitive) throw new TypeError(`${label} movement state must be canonical`);
		if (raw.phase === "emerged" !== raw.targetable || raw.phase === "dead" !== !raw.alive || (raw.phase === "deploying" || raw.phase === "underground") && raw.targetable) throw new TypeError(`${label} travel life state is invalid`);
	} else if (typeof raw.attackCycle !== "string" || raw.targetKey !== null && typeof raw.targetKey !== "string" || AttackCycle.restore(raw.attackCycle).serialize() !== raw.attackCycle || raw.targetable !== raw.alive || raw.deathTriggered && (raw.alive || raw.deathCause !== "combat-damage")) throw new TypeError(`${label} death-effect state is invalid`);
	return clone$4(raw);
}
/**
* Bounded data-only normalization used by the host before it adopts a
* reducer replacement intent.  This is intentionally not a second runtime:
* it allocates nothing and advances no state; it simply applies the same
* closed snapshot contract that the reducer accepts at its boundary.
*/
function validateSessionBuildingStructure(structureText, profiles) {
	return freeze$4(checkedStructure(parsed(structureText, "session building structure receipt"), 0, profiles));
}
function checkedBoundary(value, profiles) {
	const item = exact$5(value, [
		"structures",
		"tick",
		"towers",
		"units"
	], "session building boundary");
	const tick = integer$4(item.tick, 0, 17999, "session building boundary.tick");
	const structures = dense$1(item.structures, 128, "session building boundary.structures").map((structure, index) => checkedStructure(structure, index, profiles)).sort((left, right) => left.id - right.id);
	const units = dense$1(item.units, 1024, "session building boundary.units").map(checkedUnit).sort((left, right) => left.id - right.id);
	const towers = dense$1(item.towers, 6, "session building boundary.towers").map(checkedTower).sort((left, right) => left.id.localeCompare(right.id));
	const ids = /* @__PURE__ */ new Set();
	for (const structure of structures) {
		if (ids.has(structure.id)) throw new TypeError("session building structure IDs must be unique");
		ids.add(structure.id);
	}
	for (const unit of units) {
		if (ids.has(unit.id)) throw new TypeError("session building unit IDs collide with structures");
		ids.add(unit.id);
	}
	if (new Set(towers.map(({ id }) => id)).size !== towers.length) throw new TypeError("session building tower IDs must be unique");
	return {
		structures,
		tick,
		towers,
		units
	};
}
function candidateKey(kind, id) {
	return `${kind}:${id}`;
}
function candidateList(structure, boundary, profile) {
	const side = opposite(structure.side);
	const candidates = [];
	for (const unit of boundary.units) {
		if (!unit.alive || !unit.targetable || unit.side !== side || profile.targetMode === "ground" && unit.layer !== "ground") continue;
		candidates.push({
			cycleId: unit.id,
			id: unit.id,
			key: candidateKey("unit", unit.id),
			kind: "unit",
			layer: unit.layer,
			position: unit.position,
			radius: unit.radius
		});
	}
	for (const entry of boundary.structures) {
		if (!entry.alive || !entry.targetable || entry.side !== side) continue;
		candidates.push({
			cycleId: entry.id,
			id: entry.id,
			key: candidateKey("structure", entry.id),
			kind: "structure",
			layer: "ground",
			position: entry.position,
			radius: 0
		});
	}
	for (const tower of boundary.towers) {
		if (tower.hitpoints <= 0 || tower.side !== side) continue;
		const cycleId = TOWER_CYCLE_IDS.get(tower.id);
		if (cycleId === void 0) throw new TypeError("session building boundary tower identity is unknown");
		candidates.push({
			cycleId,
			id: tower.id,
			key: candidateKey("tower", tower.id),
			kind: "tower",
			layer: "ground",
			position: tower.position,
			radius: 0
		});
	}
	const maximum = profile.maxRangeMillitiles ?? profile.rangeMillitiles;
	const minimum = profile.minRangeMillitiles ?? 0;
	return candidates.filter((candidate) => {
		const reach = maximum + candidate.radius;
		if (!withinDistance(structure.position, candidate.position, reach)) return false;
		return minimum === 0 || !withinDistance(structure.position, candidate.position, Math.max(0, minimum - 1));
	}).sort((left, right) => {
		const leftDistance = distanceSquared(structure.position, left.position);
		const rightDistance = distanceSquared(structure.position, right.position);
		if (leftDistance !== rightDistance) return leftDistance < rightDistance ? -1 : 1;
		return left.key.localeCompare(right.key);
	});
}
function selectTarget(structure, boundary, profile) {
	const candidates = candidateList(structure, boundary, profile);
	return candidates.find(({ key }) => key === structure.targetKey) ?? candidates[0] ?? null;
}
function event(intents, value) {
	intents.push({
		type: "event",
		value
	});
}
function replace(intents, structure) {
	intents.push({
		structure,
		type: "replace-structure"
	});
}
function queueHit(intents, boundary, structure, target, amount, origin) {
	intents.push({
		amount,
		applyTick: boundary.tick + 1,
		origin,
		sourceId: structure.id,
		targetId: target.id,
		targetKind: target.kind,
		type: "queue-hit"
	});
}
function destroy(next, cause) {
	next.alive = false;
	next.deathCause = cause;
	next.hitpoints = 0;
	next.targetable = false;
	if (next.class === "travel") next.phase = "dead";
}
function buildDefensiveIntents(intents, boundary, structure, profile) {
	const next = clone$4(structure);
	if (boundary.tick - next.placedTick >= profile.lifetimeTicks) {
		destroy(next, "expiry");
		replace(intents, next);
		event(intents, {
			buildingId: next.id,
			cause: "expiry",
			reason: "lifetime",
			tick: boundary.tick,
			type: "structure-destroyed"
		});
		return;
	}
	const target = selectTarget(next, boundary, profile);
	const prior = next.targetKey;
	next.targetKey = target?.key ?? null;
	if (profile.variant === "hidden") {
		const hidden = target === null;
		if (next.hidden !== hidden) {
			next.hidden = hidden;
			next.targetable = !hidden;
			event(intents, {
				buildingId: next.id,
				tick: boundary.tick,
				type: hidden ? "building-hidden" : "building-revealed"
			});
		}
	}
	if (profile.variant === "ramp" && prior !== null && prior !== next.targetKey) {
		next.consecutiveHits = 0;
		event(intents, {
			buildingId: next.id,
			reason: "target-change-or-loss",
			tick: boundary.tick,
			type: "ramp-reset"
		});
	}
	const cycle = AttackCycle.restore(next.attackCycle);
	const ready = cycle.step({
		targetEligible: target !== null,
		targetId: target?.cycleId ?? null
	});
	next.attackCycle = cycle.serialize();
	for (const readyEvent of ready) {
		const stageIndex = profile.variant === "ramp" ? Math.max(0, profile.rampThresholds.findLastIndex((threshold) => next.consecutiveHits >= threshold)) : 0;
		const amount = profile.variant === "ramp" ? profile.rampStages[stageIndex] : profile.damage;
		event(intents, {
			amount,
			buildingId: next.id,
			targetId: target.id,
			tick: boundary.tick,
			type: "structure-attack"
		});
		if (profile.variant === "splash") {
			const targets = candidateList(next, boundary, {
				...profile,
				minRangeMillitiles: 0,
				maxRangeMillitiles: MAX_POSITION,
				targetMode: "air_and_ground"
			}).filter((candidate) => withinDistance(target.position, candidate.position, profile.areaDamageRadiusMillitiles));
			for (const candidate of targets) queueHit(intents, boundary, next, candidate, amount, "defensive-splash");
		} else queueHit(intents, boundary, next, target, amount, "defensive-attack");
		if (profile.variant === "ramp") {
			next.consecutiveHits += 1;
			event(intents, {
				buildingId: next.id,
				consecutiveHits: next.consecutiveHits,
				stageIndex,
				targetId: target.id,
				tick: boundary.tick,
				type: "ramp-contact"
			});
		}
	}
	replace(intents, next);
}
function buildResourceIntents(intents, boundary, structure, profile) {
	const next = clone$4(structure);
	const age = boundary.tick - next.placedTick;
	if (age >= profile.lifetimeTicks) {
		destroy(next, "expiry");
		replace(intents, next);
		event(intents, {
			buildingId: next.id,
			cause: "expiry",
			reason: "lifetime",
			tick: boundary.tick,
			type: "structure-destroyed"
		});
		return;
	}
	if (!next.deployed && age === profile.deployTicks) {
		next.deployed = true;
		event(intents, {
			buildingId: next.id,
			side: next.side,
			tick: boundary.tick,
			type: "building-deployed"
		});
	}
	if (next.deployed && age > 0 && age % profile.generationCadenceTicks === 0) intents.push({
		amount: profile.generationAmount,
		side: next.side,
		sourceId: next.id,
		tick: boundary.tick,
		type: "resource-grant"
	});
	replace(intents, next);
}
function emerge(intents, boundary, next) {
	next.emergedTick = boundary.tick;
	next.movementPrimitive = serializeMovementState(createMovementState());
	next.phase = "emerged";
	next.position = clone$4(next.destination);
	next.targetable = true;
	event(intents, {
		buildingId: next.id,
		position: clone$4(next.position),
		tick: boundary.tick,
		type: "travel-building-emerged"
	});
}
function buildTravelIntents(intents, boundary, structure, profile) {
	const next = clone$4(structure);
	const age = boundary.tick - next.placedTick;
	if (next.phase === "deploying" && age === profile.deployTicks) {
		next.phase = "underground";
		event(intents, {
			buildingId: next.id,
			destination: clone$4(next.destination),
			path: clone$4(next.path),
			tick: boundary.tick,
			type: "underground-travel-started"
		});
		if (next.path.length === 1) emerge(intents, boundary, next);
	} else if (next.phase === "underground") {
		const from = next.path[next.pathIndex];
		const to = next.path[next.pathIndex + 1];
		const segment = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
		const movement = advanceMovement(restoreMovementState(next.movementPrimitive), 1);
		const progress = Math.min(segment, movement.position);
		next.position = {
			x: from.x + Math.sign(to.x - from.x) * progress,
			y: from.y + Math.sign(to.y - from.y) * progress
		};
		event(intents, {
			buildingId: next.id,
			pathIndex: next.pathIndex,
			position: clone$4(next.position),
			tick: boundary.tick,
			type: "underground-travel-moved"
		});
		if (movement.position < segment) next.movementPrimitive = serializeMovementState(movement);
		else {
			next.pathIndex += 1;
			next.movementPrimitive = travelMovement(next.path, next.pathIndex, profile);
			if (next.pathIndex === next.path.length - 1) emerge(intents, boundary, next);
		}
	}
	if (next.phase === "emerged" && !next.spawnQuestionPublished && boundary.tick === next.emergedTick + profile.emergenceSpawnDelayTicks) {
		next.spawnQuestionPublished = true;
		event(intents, {
			buildingId: next.id,
			reason: "spawn identity and combat fields are unsourced",
			tick: boundary.tick,
			type: "travel-emergence-spawn-question"
		});
	}
	if (next.phase === "emerged" && boundary.tick === next.emergedTick + profile.lifetimeTicks) {
		destroy(next, "expiry");
		event(intents, {
			buildingId: next.id,
			cause: "expiry",
			reason: "lifetime",
			tick: boundary.tick,
			type: "travel-building-destroyed"
		});
	}
	replace(intents, next);
}
function buildDeathEffectIntents(intents, boundary, structure, profile) {
	const next = clone$4(structure);
	if (!next.alive) {
		if (next.deathCause === "combat-damage" && !next.deathTriggered) {
			next.deathTriggered = true;
			event(intents, {
				sourceId: next.id,
				tick: boundary.tick,
				type: "death-effect-triggered"
			});
			const targets = candidateList(next, boundary, {
				maxRangeMillitiles: profile.radius,
				minRangeMillitiles: 0,
				targetMode: "ground"
			}).filter((target) => withinDistance(next.position, target.position, profile.radius));
			for (const target of targets) {
				const amount = target.kind === "tower" ? Number(BigInt(profile.deathDamage) * BigInt(profile.towerModifier.numerator) / BigInt(profile.towerModifier.denominator)) : profile.deathDamage;
				event(intents, {
					amount,
					origin: "death-effect",
					sourceId: next.id,
					targetId: target.id,
					tick: boundary.tick,
					type: "death-effect-hit"
				});
				queueHit(intents, boundary, next, target, amount, "death-effect");
			}
			replace(intents, next);
		}
		return;
	}
	const target = selectTarget(next, boundary, profile);
	next.targetKey = target?.key ?? null;
	const cycle = AttackCycle.restore(next.attackCycle);
	const ready = cycle.step({
		targetEligible: target !== null,
		targetId: target?.cycleId ?? null
	});
	next.attackCycle = cycle.serialize();
	for (const readyEvent of ready) {
		event(intents, {
			amount: profile.damage,
			buildingId: next.id,
			targetId: target.id,
			tick: boundary.tick,
			type: "structure-attack"
		});
		queueHit(intents, boundary, next, target, profile.damage, "defensive-attack");
	}
	replace(intents, next);
}
/**
* Reduce exactly one host-owned shared tick.  The return value is data only;
* LiveBattle validates every replacement/contact/grant before mutating its
* own battle state.  No intent can advance a clock or allocate an identity.
*/
function reduceSessionBuildingBoundary(boundaryText, profiles) {
	const boundary = checkedBoundary(parsed(boundaryText, "session building boundary"), profiles);
	const intents = [];
	for (const structure of boundary.structures) {
		if (structure.class === "defensive" && structure.alive) buildDefensiveIntents(intents, boundary, structure, profiles.get(structure.cardId));
		else if (structure.class === "resource" && structure.alive) buildResourceIntents(intents, boundary, structure, profiles.get(structure.cardId));
		else if (structure.class === "travel" && structure.alive) buildTravelIntents(intents, boundary, structure, profiles.get(structure.cardId));
		else if (structure.class === "death-effect") buildDeathEffectIntents(intents, boundary, structure, profiles.get(structure.cardId));
		if (intents.length > 2048) throw new RangeError("session building runtime intent bound exceeded");
	}
	return freeze$4({
		intents: intents.map((intent, order) => freeze$4({
			...clone$4(intent),
			order
		})),
		tick: boundary.tick,
		version: 1
	});
}
/**
* Creates the pure reducer capability for one host-admitted roster. The
* profile receipt is canonical data from LiveBattle's already-validated
* roster; this module never imports a content catalog or retains mutable
* battle state. Its three methods all consume canonical receipts and have no
* independently advancing clock.
*/
function createSessionBuildingRuntime(profileReceiptText) {
	const profiles = checkedProfileReceipt(parsed(profileReceiptText, "session building profile receipt"));
	return freeze$4({
		materializePlacement(receiptText) {
			return materializeSessionBuildingStructure(receiptText, profiles);
		},
		reduceBoundary(boundaryText) {
			return reduceSessionBuildingBoundary(boundaryText, profiles);
		},
		validateStructureReceipt(structureText) {
			return validateSessionBuildingStructure(structureText, profiles);
		}
	});
}
var SESSION_BUILDING_ADMITTED_IDS, SESSION_BUILDING_QUESTION_IDS, SESSION_BUILDING_MAX_INTENTS, ADMITTED, CLASS_BY_ID, SIDES$1, LAYERS$1, MAX_TICK$1, MAX_POSITION, MAX_DAMAGE, MAX_BOUNDARY_BYTES, MAX_BOUNDARY_NODES, MAX_BOUNDARY_DEPTH, TOWER_CYCLE_IDS, clone$4, DEFENSIVE_CORPUS_FIELDS;
function init_session_building_runtime() {
	return (init_session_building_runtime = __esmMin((() => {
		init_attack_cycle();
		init_deployment();
		init_movement();
		init_pathfinding();
		init_session_building_profile_receipts();
		SESSION_BUILDING_ADMITTED_IDS = Object.freeze([
			"aether-well",
			"bulwark-needle",
			"buried-coil",
			"burrow-rig",
			"cinder-reliquary",
			"ember-basin",
			"horizon-caster",
			"prism-furnace"
		]);
		SESSION_BUILDING_QUESTION_IDS = Object.freeze(["bramble-cage", "ember-roost"]);
		SESSION_BUILDING_MAX_INTENTS = 2048;
		ADMITTED = new Set(SESSION_BUILDING_ADMITTED_IDS);
		new Set(SESSION_BUILDING_QUESTION_IDS);
		CLASS_BY_ID = Object.freeze({
			"aether-well": "resource",
			"bulwark-needle": "defensive",
			"buried-coil": "defensive",
			"burrow-rig": "travel",
			"cinder-reliquary": "death-effect",
			"ember-basin": "defensive",
			"horizon-caster": "defensive",
			"prism-furnace": "defensive"
		});
		SIDES$1 = /* @__PURE__ */ new Set(["north", "south"]);
		LAYERS$1 = /* @__PURE__ */ new Set(["air", "ground"]);
		MAX_TICK$1 = 18e3;
		MAX_POSITION = 1e6;
		MAX_DAMAGE = 1e6;
		MAX_BOUNDARY_BYTES = 1048576;
		MAX_BOUNDARY_NODES = 2e4;
		MAX_BOUNDARY_DEPTH = 64;
		TOWER_CYCLE_IDS = /* @__PURE__ */ new Map([
			["north:central", 9000000001],
			["north:lane:west", 9000000002],
			["north:lane:east", 9000000003],
			["south:central", 9000000004],
			["south:lane:west", 9000000005],
			["south:lane:east", 9000000006]
		]);
		clone$4 = (value) => JSON.parse(JSON.stringify(value));
		DEFENSIVE_CORPUS_FIELDS = Object.freeze([
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
	})))();
}
//#endregion
//#region src/sim/session-troop-runtime.js
function assertSessionTroopMovementAuthorityReceipt(serialized) {
	if (typeof serialized !== "string") throw new TypeError("session troop movement receipt must be canonical JSON text");
	const bytes = new TextEncoder().encode(serialized);
	let left = 2166136261;
	let right = 2166136261;
	for (let index = 0; index < bytes.length; index += 1) {
		const byte = bytes[index];
		left = Math.imul(left ^ byte, 16777619) >>> 0;
		right = Math.imul(right ^ byte + (index * 31 & 255), 16777619) >>> 0;
	}
	if (`${left.toString(16).padStart(8, "0")}${right.toString(16).padStart(8, "0")}` !== SESSION_TROOP_MOVEMENT_RUNTIME_RECEIPT_FINGERPRINT) throw new TypeError("session troop movement receipt diverges from the exact passed HTMP receipt");
}
function canonical$3(value) {
	if (Array.isArray(value)) return `[${value.map(canonical$3).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical$3(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function clone$3(value) {
	return JSON.parse(JSON.stringify(value));
}
function freeze$3(value) {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) freeze$3(child);
		Object.freeze(value);
	}
	return value;
}
function exact$4(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${label} must be a plain object`);
	const actual = Object.keys(value).sort();
	const expected = [...keys].sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} has an invalid shape`);
	return value;
}
function denseArray(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) throw new TypeError(`${label} must be a bounded dense array`);
	return Array.from({ length: value.length }, (_, index) => {
		const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
		if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label} must contain only data entries`);
		return descriptor.value;
	});
}
function text$2(value, label, maximum = MAX_STRING_LENGTH) {
	if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.normalize("NFC") !== value || /[\u0000-\u001f\u007f]/u.test(value)) throw new TypeError(`${label} must be bounded normalized text`);
	return value;
}
function integer$3(value, minimum, maximum, label) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a bounded safe integer`);
	return value;
}
function checkedPoint$1(value, label, { nullable = false } = {}) {
	if (nullable && value === null) return null;
	const point = exact$4(value, POINT_KEYS, label);
	return {
		x: integer$3(point.x, 0, Number.MAX_SAFE_INTEGER, `${label}.x`),
		y: integer$3(point.y, 0, Number.MAX_SAFE_INTEGER, `${label}.y`)
	};
}
function parse(textValue, label, { maximum = MAX_BYTES, graphDepth = MAX_GRAPH_DEPTH, graphNodes = MAX_GRAPH_NODES, stringLength = MAX_STRING_LENGTH } = {}) {
	if (typeof textValue !== "string") throw new TypeError(`${label} must be canonical JSON text`);
	if (new TextEncoder().encode(textValue).byteLength > maximum) throw new RangeError(`${label} exceeds its byte bound`);
	let value;
	try {
		value = JSON.parse(textValue);
	} catch {
		throw new TypeError(`${label} must be valid JSON`);
	}
	const stack = [{
		depth: 0,
		value
	}];
	let nodes = 0;
	while (stack.length > 0) {
		const current = stack.pop();
		nodes += 1;
		if (nodes > graphNodes || current.depth > graphDepth) throw new RangeError(`${label} exceeds its graph bound`);
		const entry = current.value;
		if (typeof entry === "string") {
			text$2(entry, label, stringLength);
			continue;
		}
		if (typeof entry === "number" && !Number.isSafeInteger(entry)) throw new TypeError(`${label} contains a non-safe integer`);
		if (entry === null || typeof entry === "boolean" || typeof entry === "number") continue;
		if (!entry || typeof entry !== "object") throw new TypeError(`${label} contains invalid data`);
		const children = Array.isArray(entry) ? entry : Object.values(entry);
		if (children.length > MAX_GRAPH_NODES) throw new RangeError(`${label} exceeds its member bound`);
		for (let index = children.length - 1; index >= 0; index -= 1) stack.push({
			depth: current.depth + 1,
			value: children[index]
		});
	}
	if (canonical$3(value) !== textValue) throw new TypeError(`${label} must be canonical JSON`);
	return value;
}
function checkedLegacyActionProfile(value, label, version) {
	if (value === null) return null;
	const action = exact$4(value, version === 1 ? LEGACY_ACTION_KEYS : PRIOR_ACTION_KEYS, label);
	if (action.abilityCost !== null) throw new TypeError(`${label}.abilityCost must remain explicit null until sourced`);
	const target = text$2(action.target, `${label}.target`);
	if (!ACTION_TARGETS.has(target)) throw new TypeError(`${label}.target is unsupported`);
	const checked = {
		abilityCost: null,
		id: text$2(action.id, `${label}.id`),
		target
	};
	if (version === 1) return checked;
	const effect = text$2(action.effect, `${label}.effect`);
	if (!PRIOR_ACTION_EFFECTS.has(effect)) throw new TypeError(`${label}.effect is unsupported`);
	return {
		abilityCost: null,
		effect,
		id: checked.id,
		target
	};
}
function checkedLegacyProfile(value, index, version) {
	const profile = exact$4(value, LEGACY_PROFILE_KEYS, `session troop profile[${index}]`);
	const action = checkedLegacyActionProfile(profile.action, `session troop profile[${index}].action`, version);
	const claim = text$2(profile.claim, `session troop profile[${index}].claim`);
	if (version === 1 && claim !== "unclaimed") throw new TypeError(`session troop profile[${index}].claim must remain unclaimed`);
	if (version === 2 && !["receipt-witness", "representative-mechanic"].includes(claim)) throw new TypeError(`session troop profile[${index}].claim is unsupported`);
	if (version === 2 && claim === "representative-mechanic" !== (action !== null)) throw new TypeError(`session troop profile[${index}].claim/action must agree`);
	if (profile.deploy !== "receipt-only") throw new TypeError(`session troop profile[${index}].deploy must be receipt-only`);
	const passes = denseArray(profile.passes, PASS_PHASES.length, `session troop profile[${index}].passes`).map((phase, phaseIndex) => {
		const checked = text$2(phase, `session troop profile[${index}].passes[${phaseIndex}]`);
		if (checked !== PASS_PHASES[phaseIndex]) throw new TypeError(`session troop profile[${index}].passes must use canonical phase order`);
		return checked;
	});
	if (passes.length !== PASS_PHASES.length) throw new TypeError(`session troop profile[${index}].passes must cover every host phase`);
	return {
		action,
		cardId: text$2(profile.cardId, `session troop profile[${index}].cardId`),
		claim,
		deploy: "receipt-only",
		passes
	};
}
function checkedContactProvenance(value, label) {
	const provenance = exact$4(value, CONTACT_PROVENANCE_KEYS, label);
	return {
		confidence: text$2(provenance.confidence, `${label}.confidence`),
		contentPiece: text$2(provenance.contentPiece, `${label}.contentPiece`),
		verification: text$2(provenance.verification, `${label}.verification`)
	};
}
function checkedCurrentContact(value, label) {
	const contact = exact$4(value, CONTACT_KEYS_PROFILE, label);
	if (contact.delivery !== "melee" || contact.effect !== "ordinary-live-contact") throw new TypeError(`${label} must identify the ordinary melee host contact`);
	return {
		delivery: "melee",
		effect: "ordinary-live-contact",
		provenance: checkedContactProvenance(contact.provenance, `${label}.provenance`)
	};
}
function checkedSourceProfile(value, label) {
	const source = exact$4(value, SOURCE_PROFILE_KEYS, label);
	const combat = exact$4(source.combat, SOURCE_PROFILE_COMBAT_KEYS, `${label}.combat`);
	if (combat.delivery !== "melee" || !["air", "ground"].includes(combat.layer) || ![
		"air",
		"air_and_ground",
		"buildings",
		"ground",
		"none"
	].includes(combat.targetMode)) throw new TypeError(`${label}.combat is not an ordinary melee source`);
	const entity = exact$4(source.entity, SOURCE_PROFILE_ENTITY_KEYS, `${label}.entity`);
	if (entity.memberIndex !== 0) throw new TypeError(`${label} source projection is inconsistent`);
	return {
		combat: {
			damage: integer$3(combat.damage, 1, 1e9, `${label}.combat.damage`),
			delivery: "melee",
			deployTimeTicks: integer$3(combat.deployTimeTicks, 0, 1e9, `${label}.combat.deployTimeTicks`),
			firstHitTicks: integer$3(combat.firstHitTicks, 0, 1e9, `${label}.combat.firstHitTicks`),
			hitSpeedTicks: integer$3(combat.hitSpeedTicks, 1, 1e9, `${label}.combat.hitSpeedTicks`),
			layer: combat.layer,
			rangeMillitiles: integer$3(combat.rangeMillitiles, 0, 1e9, `${label}.combat.rangeMillitiles`),
			sightRangeMillitiles: integer$3(combat.sightRangeMillitiles, 0, 1e9, `${label}.combat.sightRangeMillitiles`),
			targetMode: combat.targetMode
		},
		entity: {
			archetypeId: text$2(entity.archetypeId, `${label}.entity.archetypeId`),
			memberIndex: 0,
			role: text$2(entity.role, `${label}.entity.role`)
		}
	};
}
function checkedCurrentProfile(value, index) {
	const profile = exact$4(value, CURRENT_PROFILE_KEYS, `session troop profile[${index}]`);
	const cardId = text$2(profile.cardId, `session troop profile[${index}].cardId`);
	if (cardId !== "mossguard" || profile.claim !== "representative-live-contact") throw new TypeError(`session troop profile[${index}] is not the current Mossguard contact profile`);
	const contact = checkedCurrentContact(profile.contact, `session troop profile[${index}].contact`);
	const sourceProfile = checkedSourceProfile(profile.sourceProfile, `session troop profile[${index}].sourceProfile`);
	if (contact.delivery !== sourceProfile.combat.delivery || sourceProfile.entity.archetypeId !== cardId || sourceProfile.entity.role !== "primary") throw new TypeError(`session troop profile[${index}] contact/source profile diverges`);
	return {
		cardId,
		claim: "representative-live-contact",
		contact,
		sourceProfile
	};
}
function movementManifestFromReceipt(receipt) {
	const checkedManifest = exact$4(parse(receipt.manifest, "session troop movement source manifest", {
		graphDepth: MOVEMENT_MAX_GRAPH_DEPTH,
		graphNodes: MOVEMENT_MAX_GRAPH_NODES,
		maximum: SESSION_TROOP_MOVEMENT_RUNTIME_MAX_RECEIPT_BYTES,
		stringLength: MOVEMENT_MAX_STRING_LENGTH
	}), [
		"counts",
		"occurrences",
		"profiles",
		"version"
	], "session troop movement source manifest");
	if (checkedManifest.version !== 1 || canonical$3(checkedManifest.counts) !== canonical$3(MOVEMENT_COUNTS)) throw new TypeError("session troop movement source manifest counts are not the HTMP receipt");
	if (canonical$3(denseArray(checkedManifest.occurrences, MOVEMENT_OCCURRENCES.length, "session troop movement source manifest.occurrences")) !== canonical$3(MOVEMENT_OCCURRENCES)) throw new TypeError("session troop movement source manifest occurrences diverge");
	const profiles = denseArray(checkedManifest.profiles, MOVEMENT_PROFILE_IDS.length, "session troop movement source manifest.profiles");
	if (profiles.length !== MOVEMENT_PROFILE_IDS.length) throw new TypeError("session troop movement source manifest profile count diverges");
	for (let index = 0; index < profiles.length; index += 1) {
		const expected = MOVEMENT_PROFILE_CLAIMS[index];
		const profile = exact$4(profiles[index], [
			"claims",
			...expected.id === "emberlance" ? ["composition"] : [],
			"cost",
			"deployTimeTicks",
			"displayName",
			"id",
			"kind",
			"occurrenceExports",
			"placementClass",
			"sourceRecords"
		], `session troop movement source manifest.profiles[${index}]`);
		if (profile.id !== expected.id || profile.kind !== "unit" || profile.placementClass !== "ground_entity" || canonical$3(profile.occurrenceExports) !== canonical$3(expected.claims.map(({ exportName }) => exportName))) throw new TypeError("session troop movement source manifest profile identity diverges");
		const claims = denseArray(profile.claims, expected.claims.length, `session troop movement source manifest.profiles[${index}].claims`);
		if (claims.length !== expected.claims.length) throw new TypeError("session troop movement source manifest claim count diverges");
		for (let claimIndex = 0; claimIndex < claims.length; claimIndex += 1) {
			const claim = claims[claimIndex];
			const expectedClaim = expected.claims[claimIndex];
			if (claim === null || typeof claim !== "object" || claim.claimFamily !== expectedClaim.claimFamily || claim.exportName !== expectedClaim.exportName || typeof claim.sourceRecordCanonical !== "string") throw new TypeError("session troop movement source manifest claim diverges");
			if (claim.claimFamily === "flight") {
				const behavior = exact$4(claim.flightBehavior, [
					"excludedMechanics",
					"exportedFunctions",
					"pathScope",
					"roundTrip",
					"sourceTest",
					"speedField"
				], `session troop movement flight claim ${profile.id}.flightBehavior`);
				if (behavior.pathScope !== "axis-aligned-only" || behavior.speedField !== "movementMillitilesPerSecond" || behavior.roundTrip !== "serialize-restore-byte-stable") throw new TypeError("session troop movement flight behavior is not source-authoritative");
			} else if (claim.claimFamily === "shield-form") {
				if (claim.unresolvedOnly !== true || !Array.isArray(claim.unresolvedFields) || claim.unresolvedFields.length !== 5 || typeof claim.unresolvedReason !== "string") throw new TypeError("session troop movement shield/form claim is not unresolved-only");
			} else if (claim.questionPolicy === null || !Array.isArray(claim.questionPolicy.records)) throw new TypeError("session troop movement QUESTION claim lacks its receipt records");
			movementSourceRecord(claim, `session troop movement claim ${profile.id}`);
		}
	}
	return {
		manifest: checkedManifest,
		profiles
	};
}
function movementSourceRecord(claim, label) {
	const source = parse(claim.sourceRecordCanonical, `${label}.sourceRecordCanonical`, {
		graphDepth: MOVEMENT_MAX_GRAPH_DEPTH,
		graphNodes: MOVEMENT_MAX_GRAPH_NODES,
		maximum: SESSION_TROOP_MOVEMENT_RUNTIME_MAX_RECEIPT_BYTES,
		stringLength: MOVEMENT_MAX_STRING_LENGTH
	});
	exact$4(source, [
		"areaDamageRadiusMillitiles",
		"components",
		"cost",
		"count",
		"damage",
		"deployTimeTicks",
		"displayName",
		"firstHitTicks",
		"hitSpeedTicks",
		"hitpoints",
		"id",
		"kind",
		"movementMillitilesPerSecond",
		"rangeMillitiles",
		"rarity",
		"sightRangeMillitiles",
		"targetMode"
	], `${label}.sourceRecord`);
	if (source.kind !== "unit" || !Array.isArray(source.components) || source.components.length > 16) throw new TypeError(`${label}.sourceRecord is not a bounded unit record`);
	return source;
}
function movementProfilePublic(profile) {
	return {
		claims: profile.claims.map((claim) => {
			const publicClaim = {
				claimFamily: claim.claimFamily,
				exportName: claim.exportName,
				sourceRecordCanonical: claim.sourceRecordCanonical
			};
			if (claim.flightBehavior !== void 0) publicClaim.flightBehavior = clone$3(claim.flightBehavior);
			if (claim.questionPolicy !== null && claim.questionPolicy !== void 0) publicClaim.questionKeys = denseArray(claim.questionPolicy.records, MOVEMENT_MAX_GRAPH_NODES, "session troop movement QUESTION records").map((record, index) => exact$4(record, [
				"authoritative",
				"confidence",
				"disposition",
				"key",
				"source",
				"value"
			], `session troop movement QUESTION record ${index}`).key).sort();
			if (claim.unresolvedOnly === true) {
				publicClaim.unresolvedFields = clone$3(claim.unresolvedFields);
				publicClaim.unresolvedOnly = true;
				publicClaim.unresolvedReason = claim.unresolvedReason;
			}
			return publicClaim;
		}),
		id: profile.id
	};
}
function movementFlightProfile(profile) {
	const claim = profile.claims.find(({ claimFamily }) => claimFamily === "flight");
	if (claim === void 0) return null;
	const source = movementSourceRecord(claim, `session troop movement flight ${profile.id}`);
	if (!Number.isSafeInteger(source.movementMillitilesPerSecond) || source.movementMillitilesPerSecond < 0) throw new TypeError(`session troop movement flight ${profile.id} has no sourced speed`);
	return {
		cardId: profile.id,
		claimFamily: "flight",
		layer: "air",
		pathScope: claim.flightBehavior.pathScope,
		sourceRecordCanonical: claim.sourceRecordCanonical,
		speed: source.movementMillitilesPerSecond
	};
}
function movementQuestionKeys(claim) {
	if (claim.unresolvedOnly === true) return [...claim.unresolvedFields].sort();
	if (claim.questionPolicy === null || claim.questionPolicy === void 0) return [];
	return denseArray(claim.questionPolicy.records, MOVEMENT_MAX_GRAPH_NODES, "session troop movement QUESTION records").map((record, index) => exact$4(record, [
		"authoritative",
		"confidence",
		"disposition",
		"key",
		"source",
		"value"
	], `session troop movement QUESTION record ${index}`).key).sort();
}
function movementClaim(profile, claimFamily) {
	const claim = profile.claims.find(({ claimFamily: candidate }) => candidate === claimFamily);
	if (claim === void 0) throw new RangeError("session troop movement claim family is not admitted for this card");
	return claim;
}
function checkedMovementCommand(value) {
	const command = exact$4(value, [
		"cardId",
		"claimFamily",
		"phase",
		"side",
		"sourceId",
		"tick",
		"type"
	], "session troop movement command");
	if (command.type !== "troop-movement") throw new TypeError("session troop movement command.type is invalid");
	const phase = text$2(command.phase, "session troop movement command.phase");
	if (!CURRENT_INTENT_PHASES.has(phase)) throw new TypeError("session troop movement command.phase is invalid");
	const side = text$2(command.side, "session troop movement command.side");
	if (side !== "north" && side !== "south") throw new TypeError("session troop movement command.side is invalid");
	return {
		cardId: text$2(command.cardId, "session troop movement command.cardId"),
		claimFamily: text$2(command.claimFamily, "session troop movement command.claimFamily"),
		phase,
		side,
		sourceId: integer$3(command.sourceId, 1, Number.MAX_SAFE_INTEGER, "session troop movement command.sourceId"),
		tick: integer$3(command.tick, 0, Number.MAX_SAFE_INTEGER, "session troop movement command.tick"),
		type: "troop-movement"
	};
}
function movementQuestion({ cardId, claim, phase, side, sourceId, tick }) {
	return freeze$3({
		cardId,
		claimFamily: claim.claimFamily,
		disposition: "question",
		phase,
		questionKeys: movementQuestionKeys(claim),
		reason: claim.unresolvedOnly === true ? claim.unresolvedReason : MOVEMENT_QUESTION_REASONS[claim.claimFamily],
		side,
		sourceId,
		tick,
		type: "troop-movement-question"
	});
}
function movementAdmission({ cardId, claim, flight, phase, side, sourceId, tick }) {
	return freeze$3({
		cardId,
		claimFamily: claim.claimFamily,
		disposition: "admitted",
		layer: flight.layer,
		pathScope: flight.pathScope,
		phase,
		side,
		sourceId,
		tick,
		type: "troop-movement-admission"
	});
}
function assertMovementSourceRoster(roster, profiles) {
	if (!Array.isArray(roster) || roster.length > 8) throw new TypeError("session troop movement source roster must be a bounded array");
	const cards = new Map(roster.map((card) => [card.id, card]));
	for (const profile of profiles) {
		const card = cards.get(profile.id);
		if (card === void 0) continue;
		if (card.kind !== "unit") throw new TypeError(`session troop movement source ${profile.id} is not a unit`);
		const source = movementSourceRecord(profile.claims[0], `session troop movement source ${profile.id}`);
		for (const field of MOVEMENT_SOURCE_CARD_FIELDS) if (canonical$3(card[field]) !== canonical$3(source[field])) throw new TypeError(`session troop movement source ${profile.id}.${field} diverges from HTMP`);
		const expectedEntities = source.components.length === 0 ? [{
			...source,
			id: source.id,
			role: "primary"
		}] : source.components;
		if (!Array.isArray(card.entities) || card.entities.length !== expectedEntities.length) throw new TypeError(`session troop movement source ${profile.id} entity join diverges`);
		for (let index = 0; index < expectedEntities.length; index += 1) {
			const expected = expectedEntities[index];
			const entity = card.entities[index];
			if (entity.archetypeId !== expected.id || entity.role !== expected.role) throw new TypeError(`session troop movement source ${profile.id} entity identity diverges`);
			for (const field of MOVEMENT_SOURCE_ENTITY_FIELDS) if (canonical$3(entity[field]) !== canonical$3(expected[field])) throw new TypeError(`session troop movement source ${profile.id} entity field diverges`);
		}
		if (movementFlightProfile(profile) !== null && card.entities.some(({ layer }) => layer !== "air")) throw new TypeError(`session troop movement flight source ${profile.id} is not in the air layer`);
	}
	return true;
}
function checkedMovementBoundary(value) {
	const boundary = exact$4(value, [
		"phase",
		"sources",
		"tick"
	], "session troop movement boundary");
	const phase = text$2(boundary.phase, "session troop movement boundary.phase");
	if (!CURRENT_INTENT_PHASES.has(phase)) throw new TypeError("session troop movement boundary.phase is invalid");
	const sources = checkedSources(boundary.sources);
	if (canonical$3(sources) !== canonical$3(boundary.sources)) throw new TypeError("session troop movement boundary sources must use canonical source order");
	return {
		phase,
		sources,
		tick: integer$3(boundary.tick, 0, Number.MAX_SAFE_INTEGER, "session troop movement boundary.tick")
	};
}
function movementIntent({ cardId, claim, flight, side, sourceId, tick }) {
	return freeze$3({
		cardId,
		claimFamily: claim.claimFamily,
		kind: "flight",
		layer: flight.layer,
		pathScope: flight.pathScope,
		phase: "pre-move",
		side,
		sourceId,
		tick,
		type: "troop-runtime-intent"
	});
}
function checkedMovementReceipt(value) {
	const receipt = exact$4(value, [
		"manifest",
		"profiles",
		"version"
	], "session troop movement runtime receipt");
	if (receipt.version !== 4 || typeof receipt.manifest !== "string") throw new TypeError("session troop movement runtime receipt version is unsupported");
	const { profiles: manifestProfiles } = movementManifestFromReceipt(receipt);
	const profiles = denseArray(receipt.profiles, MOVEMENT_PROFILE_IDS.length, "session troop movement runtime receipt.profiles").map((profile, index) => {
		const expected = MOVEMENT_PROFILE_CLAIMS[index];
		const checked = exact$4(profile, ["claims", "id"], `session troop movement runtime receipt.profiles[${index}]`);
		const claims = denseArray(checked.claims, expected.claims.length, `session troop movement runtime receipt.profiles[${index}].claims`).map((claim, claimIndex) => {
			const expectedClaim = expected.claims[claimIndex];
			const value = exact$4(claim, ["claimFamily", "exportName"], `session troop movement runtime receipt claim ${index}/${claimIndex}`);
			if (value.claimFamily !== expectedClaim.claimFamily || value.exportName !== expectedClaim.exportName) throw new TypeError("session troop movement runtime receipt claim diverges");
			return {
				claimFamily: value.claimFamily,
				exportName: value.exportName
			};
		});
		if (checked.id !== expected.id || canonical$3(claims) !== canonical$3(expected.claims) || manifestProfiles[index].id !== expected.id) throw new TypeError("session troop movement runtime receipt profile diverges");
		return {
			claims,
			id: checked.id
		};
	});
	const normalized = {
		manifest: receipt.manifest,
		profiles,
		version: 4
	};
	if (canonical$3(normalized) !== canonical$3(receipt)) throw new TypeError("session troop movement runtime receipt is not canonical");
	assertSessionTroopMovementAuthorityReceipt(canonical$3(normalized));
	return freeze$3(normalized);
}
function checkedProfiles(value) {
	if (value !== null && typeof value === "object" && value.version === 4) return checkedMovementReceipt(value);
	const set = exact$4(value, PROFILE_SET_KEYS, "session troop profiles");
	if (![
		1,
		2,
		3
	].includes(set.version)) throw new TypeError("session troop profiles version is unsupported");
	const version = set.version;
	const rawProfiles = denseArray(set.profiles, 8, "session troop profiles.profiles");
	if (version === 3) {
		if (rawProfiles.length !== 1) throw new TypeError("current session troop runtime requires exactly one source profile");
		return freeze$3({
			profiles: [checkedCurrentProfile(rawProfiles[0], 0)],
			version
		});
	}
	const profiles = rawProfiles.map((profile, index) => checkedLegacyProfile(profile, index, version)).sort((left, right) => left.cardId.localeCompare(right.cardId));
	if (new Set(profiles.map(({ cardId }) => cardId)).size !== profiles.length) throw new TypeError("session troop profiles must have unique card IDs");
	return freeze$3({
		profiles,
		version
	});
}
function checkedSource$2(value, index) {
	const source = exact$4(value, SOURCE_KEYS$1, `session troop runtime source[${index}]`);
	const side = text$2(source.side, `session troop runtime source[${index}].side`);
	if (side !== "north" && side !== "south") throw new TypeError(`session troop runtime source[${index}].side is invalid`);
	return {
		cardId: text$2(source.cardId, `session troop runtime source[${index}].cardId`),
		side,
		sourceId: integer$3(source.sourceId, 1, Number.MAX_SAFE_INTEGER, `session troop runtime source[${index}].sourceId`)
	};
}
function checkedSources(value) {
	const sources = denseArray(value, SESSION_TROOP_RUNTIME_MAX_SOURCES, "session troop runtime boundary.sources").map(checkedSource$2).sort((left, right) => left.sourceId - right.sourceId);
	if (new Set(sources.map(({ sourceId }) => sourceId)).size !== sources.length) throw new TypeError("session troop runtime boundary sources must be unique");
	return sources;
}
function checkedActionCommand(value, label = "session troop action") {
	const action = exact$4(value, ACTION_COMMAND_KEYS, label);
	if (action.type !== "ability") throw new TypeError(`${label}.type is invalid`);
	const side = text$2(action.side, `${label}.side`);
	if (side !== "north" && side !== "south") throw new TypeError(`${label}.side is invalid`);
	const targetId = action.targetId === null ? null : integer$3(action.targetId, 1, Number.MAX_SAFE_INTEGER, `${label}.targetId`);
	return {
		actionId: text$2(action.actionId, `${label}.actionId`),
		commandId: integer$3(action.commandId, 0, Number.MAX_SAFE_INTEGER, `${label}.commandId`),
		point: checkedPoint$1(action.point, `${label}.point`, { nullable: true }),
		side,
		sourceId: integer$3(action.sourceId, 1, Number.MAX_SAFE_INTEGER, `${label}.sourceId`),
		targetId,
		tick: integer$3(action.tick, 0, Number.MAX_SAFE_INTEGER, `${label}.tick`),
		type: "ability"
	};
}
function checkedContact(value, index) {
	const contact = exact$4(value, CONTACT_KEYS, `session troop runtime contact[${index}]`);
	const sourceId = integer$3(contact.sourceId, 1, Number.MAX_SAFE_INTEGER, `session troop runtime contact[${index}].sourceId`);
	const targetId = integer$3(contact.targetId, 1, Number.MAX_SAFE_INTEGER, `session troop runtime contact[${index}].targetId`);
	if (targetId === sourceId) throw new TypeError(`session troop runtime contact[${index}] self-targets`);
	return {
		attackSequence: integer$3(contact.attackSequence, 1, Number.MAX_SAFE_INTEGER, `session troop runtime contact[${index}].attackSequence`),
		sourceId,
		targetId
	};
}
function checkedLegacyBoundary(value) {
	const boundary = exact$4(value, [
		"action",
		"phase",
		"sources",
		"tick"
	], "session troop runtime boundary");
	const phase = text$2(boundary.phase, "session troop runtime boundary.phase");
	if (!LEGACY_INTENT_PHASES.has(phase)) throw new TypeError("session troop runtime boundary.phase is invalid");
	const action = boundary.action === null ? null : checkedActionCommand(boundary.action, "session troop runtime boundary.action");
	if (action !== null && phase !== "pre-combat") throw new TypeError("session troop runtime actions are pre-combat only");
	return {
		action,
		phase,
		sources: checkedSources(boundary.sources),
		tick: integer$3(boundary.tick, 0, Number.MAX_SAFE_INTEGER, "session troop runtime boundary.tick")
	};
}
function checkedCurrentBoundary(value) {
	const boundary = exact$4(value, [
		"contacts",
		"phase",
		"sources",
		"tick"
	], "session troop runtime boundary");
	const phase = text$2(boundary.phase, "session troop runtime boundary.phase");
	if (!CURRENT_INTENT_PHASES.has(phase)) throw new TypeError("session troop runtime boundary.phase is invalid");
	const contacts = denseArray(boundary.contacts, SESSION_TROOP_RUNTIME_MAX_SOURCES, "session troop runtime boundary.contacts").map(checkedContact).sort((left, right) => left.sourceId - right.sourceId || left.targetId - right.targetId || left.attackSequence - right.attackSequence);
	if (canonical$3(contacts) !== canonical$3(boundary.contacts) || new Set(contacts.map(({ attackSequence, sourceId, targetId }) => `${sourceId}:${targetId}:${attackSequence}`)).size !== contacts.length) throw new TypeError("session troop runtime contacts must be unique and canonically ordered");
	if (phase !== "combat" && contacts.length !== 0) throw new TypeError("session troop runtime contacts belong only to combat");
	return {
		contacts,
		phase,
		sources: checkedSources(boundary.sources),
		tick: integer$3(boundary.tick, 0, Number.MAX_SAFE_INTEGER, "session troop runtime boundary.tick")
	};
}
function legacyIntent({ action = null, cardId, phase, side, sourceId, tick, type }) {
	return freeze$3({
		actionId: action?.actionId ?? null,
		cardId,
		commandId: action?.commandId ?? null,
		kind: type,
		phase,
		point: action?.point ?? null,
		side,
		sourceId,
		targetId: action?.targetId ?? null,
		tick,
		type: "troop-runtime-intent"
	});
}
function contactIntent({ attackSequence, cardId, side, sourceId, targetId, tick }) {
	return freeze$3({
		attackSequence,
		cardId,
		kind: "contact",
		phase: "combat",
		side,
		sourceId,
		targetId,
		tick,
		type: "troop-runtime-intent"
	});
}
function parseSessionTroopRuntimeProfiles(serialized) {
	if (typeof serialized !== "string") throw new TypeError("session troop profiles must be canonical JSON text");
	const bytes = new TextEncoder().encode(serialized).byteLength;
	const parsed = parse(serialized, "session troop profiles", bytes > MAX_BYTES ? {
		graphDepth: MOVEMENT_MAX_GRAPH_DEPTH,
		graphNodes: MOVEMENT_MAX_GRAPH_NODES,
		maximum: SESSION_TROOP_MOVEMENT_RUNTIME_MAX_RECEIPT_BYTES,
		stringLength: MOVEMENT_MAX_STRING_LENGTH
	} : void 0);
	if (parsed.version === 4) {
		const receipt = checkedMovementReceipt(parsed);
		if (canonical$3(receipt) !== serialized) throw new TypeError("session troop movement runtime receipt must be canonical JSON");
		return receipt;
	}
	if (bytes > MAX_BYTES) throw new RangeError("session troop profiles exceeds its byte bound");
	const checked = checkedProfiles(parsed);
	if (canonical$3(checked) !== serialized) throw new TypeError("session troop profiles must use canonical profile ordering");
	return checked;
}
var SESSION_TROOP_RUNTIME_MAX_SOURCES, MAX_BYTES, MAX_GRAPH_DEPTH, MAX_GRAPH_NODES, MAX_STRING_LENGTH, MOVEMENT_MAX_GRAPH_DEPTH, MOVEMENT_MAX_GRAPH_NODES, SESSION_TROOP_MOVEMENT_RUNTIME_RECEIPT_FINGERPRINT, SESSION_TROOP_MOVEMENT_RUNTIME_MAX_RECEIPT_BYTES, MOVEMENT_MAX_STRING_LENGTH, LEGACY_ACTION_KEYS, PRIOR_ACTION_KEYS, ACTION_TARGETS, PRIOR_ACTION_EFFECTS, LEGACY_INTENT_PHASES, CURRENT_INTENT_PHASES, PASS_PHASES, LEGACY_PROFILE_KEYS, CURRENT_PROFILE_KEYS, PROFILE_SET_KEYS, SOURCE_KEYS$1, ACTION_COMMAND_KEYS, POINT_KEYS, CONTACT_KEYS, CONTACT_PROVENANCE_KEYS, CONTACT_KEYS_PROFILE, SOURCE_PROFILE_KEYS, SOURCE_PROFILE_COMBAT_KEYS, SOURCE_PROFILE_ENTITY_KEYS, EMPTY_PROFILE_BYTES, MOVEMENT_PROFILE_IDS, MOVEMENT_PROFILE_CLAIMS, MOVEMENT_OCCURRENCES, MOVEMENT_COUNTS, MOVEMENT_SOURCE_CARD_FIELDS, MOVEMENT_SOURCE_ENTITY_FIELDS, MOVEMENT_QUESTION_REASONS, SessionTroopRuntime;
function init_session_troop_runtime() {
	return (init_session_troop_runtime = __esmMin((() => {
		SESSION_TROOP_RUNTIME_MAX_SOURCES = 1024;
		MAX_BYTES = 16384;
		MAX_GRAPH_DEPTH = 16;
		MAX_GRAPH_NODES = 512;
		MAX_STRING_LENGTH = 128;
		MOVEMENT_MAX_GRAPH_DEPTH = 64;
		MOVEMENT_MAX_GRAPH_NODES = 5e4;
		SESSION_TROOP_MOVEMENT_RUNTIME_RECEIPT_FINGERPRINT = "d3ae59740b427e22";
		SESSION_TROOP_MOVEMENT_RUNTIME_MAX_RECEIPT_BYTES = 1048576;
		MOVEMENT_MAX_STRING_LENGTH = SESSION_TROOP_MOVEMENT_RUNTIME_MAX_RECEIPT_BYTES;
		LEGACY_ACTION_KEYS = [
			"abilityCost",
			"id",
			"target"
		];
		PRIOR_ACTION_KEYS = [
			"abilityCost",
			"effect",
			"id",
			"target"
		];
		ACTION_TARGETS = /* @__PURE__ */ new Set(["unit"]);
		PRIOR_ACTION_EFFECTS = /* @__PURE__ */ new Set(["source-melee-contact"]);
		LEGACY_INTENT_PHASES = /* @__PURE__ */ new Set([
			"deploy",
			"pre-move",
			"pre-combat",
			"post-combat"
		]);
		CURRENT_INTENT_PHASES = /* @__PURE__ */ new Set([...LEGACY_INTENT_PHASES, "combat"]);
		PASS_PHASES = Object.freeze([
			"pre-move",
			"pre-combat",
			"post-combat"
		]);
		LEGACY_PROFILE_KEYS = [
			"action",
			"cardId",
			"claim",
			"deploy",
			"passes"
		];
		CURRENT_PROFILE_KEYS = [
			"cardId",
			"claim",
			"contact",
			"sourceProfile"
		];
		PROFILE_SET_KEYS = ["profiles", "version"];
		SOURCE_KEYS$1 = [
			"cardId",
			"side",
			"sourceId"
		];
		ACTION_COMMAND_KEYS = [
			"actionId",
			"commandId",
			"point",
			"side",
			"sourceId",
			"targetId",
			"tick",
			"type"
		];
		POINT_KEYS = ["x", "y"];
		CONTACT_KEYS = [
			"attackSequence",
			"sourceId",
			"targetId"
		];
		CONTACT_PROVENANCE_KEYS = [
			"confidence",
			"contentPiece",
			"verification"
		];
		CONTACT_KEYS_PROFILE = [
			"delivery",
			"effect",
			"provenance"
		];
		SOURCE_PROFILE_KEYS = ["combat", "entity"];
		SOURCE_PROFILE_COMBAT_KEYS = [
			"damage",
			"delivery",
			"deployTimeTicks",
			"firstHitTicks",
			"hitSpeedTicks",
			"layer",
			"rangeMillitiles",
			"sightRangeMillitiles",
			"targetMode"
		];
		SOURCE_PROFILE_ENTITY_KEYS = [
			"archetypeId",
			"memberIndex",
			"role"
		];
		EMPTY_PROFILE_BYTES = "{\"profiles\":[],\"version\":1}";
		MOVEMENT_PROFILE_IDS = Object.freeze([
			"cinderback",
			"copperskiff",
			"emberlance",
			"railward",
			"skymaul",
			"stonevault",
			"veilrunner",
			"wayfinder"
		]);
		MOVEMENT_PROFILE_CLAIMS = Object.freeze([
			Object.freeze({
				id: "cinderback",
				claims: Object.freeze([Object.freeze({
					claimFamily: "recoil",
					exportName: "createRecoilSpecialCatalog"
				})])
			}),
			Object.freeze({
				id: "copperskiff",
				claims: Object.freeze([Object.freeze({
					claimFamily: "flight",
					exportName: "createBasicFlyingCatalog"
				})])
			}),
			Object.freeze({
				id: "emberlance",
				claims: Object.freeze([Object.freeze({
					claimFamily: "charge-knockback-membership",
					exportName: "createChargeKnockbackCatalog"
				}), Object.freeze({
					claimFamily: "charge",
					exportName: "createChargeSpecialCatalog"
				})])
			}),
			Object.freeze({
				id: "railward",
				claims: Object.freeze([Object.freeze({
					claimFamily: "shield-form",
					exportName: "createShieldFormCatalog"
				})])
			}),
			Object.freeze({
				id: "skymaul",
				claims: Object.freeze([Object.freeze({
					claimFamily: "flight",
					exportName: "createBasicFlyingCatalog"
				})])
			}),
			Object.freeze({
				id: "stonevault",
				claims: Object.freeze([Object.freeze({
					claimFamily: "jump",
					exportName: "createJumpSpecialCatalog"
				})])
			}),
			Object.freeze({
				id: "veilrunner",
				claims: Object.freeze([Object.freeze({
					claimFamily: "dash",
					exportName: "createDashSpecialCatalog"
				})])
			}),
			Object.freeze({
				id: "wayfinder",
				claims: Object.freeze([Object.freeze({
					claimFamily: "retarget",
					exportName: "createRetargetSpecialCatalog"
				})])
			})
		]);
		MOVEMENT_OCCURRENCES = Object.freeze([
			Object.freeze({
				exportName: "createRecoilSpecialCatalog",
				id: "cinderback",
				status: "admitted"
			}),
			Object.freeze({
				exportName: "createBasicFlyingCatalog",
				id: "copperskiff",
				status: "admitted"
			}),
			Object.freeze({
				exportName: "createChargeKnockbackCatalog",
				id: "emberlance",
				status: "admitted"
			}),
			Object.freeze({
				exportName: "createChargeSpecialCatalog",
				id: "emberlance",
				status: "admitted"
			}),
			Object.freeze({
				exportName: "createShieldFormCatalog",
				id: "railward",
				status: "admitted"
			}),
			Object.freeze({
				exportName: "createBasicFlyingCatalog",
				id: "skymaul",
				status: "admitted"
			}),
			Object.freeze({
				exportName: "createJumpSpecialCatalog",
				id: "stonevault",
				status: "admitted"
			}),
			Object.freeze({
				exportName: "createDashSpecialCatalog",
				id: "veilrunner",
				status: "admitted"
			}),
			Object.freeze({
				exportName: "createRetargetSpecialCatalog",
				id: "wayfinder",
				status: "admitted"
			})
		]);
		MOVEMENT_COUNTS = Object.freeze({
			duplicatedIds: 1,
			ids: 8,
			occurrences: 9,
			profiles: 8,
			questionBearingClaims: 6,
			unresolvedOnlyClaims: 1
		});
		MOVEMENT_SOURCE_CARD_FIELDS = Object.freeze([
			"areaDamageRadiusMillitiles",
			"cost",
			"count",
			"damage",
			"deployTimeTicks",
			"displayName",
			"firstHitTicks",
			"hitSpeedTicks",
			"hitpoints",
			"id",
			"kind",
			"movementMillitilesPerSecond",
			"rangeMillitiles",
			"rarity",
			"sightRangeMillitiles",
			"targetMode"
		]);
		MOVEMENT_SOURCE_ENTITY_FIELDS = Object.freeze([
			"areaDamageRadiusMillitiles",
			"count",
			"damage",
			"deployTimeTicks",
			"displayName",
			"firstHitTicks",
			"hitSpeedTicks",
			"hitpoints",
			"kind",
			"movementMillitilesPerSecond",
			"rangeMillitiles",
			"sightRangeMillitiles",
			"targetMode"
		]);
		MOVEMENT_QUESTION_REASONS = Object.freeze({
			charge: "charge stage fields remain explicit QUESTION values",
			"charge-knockback-membership": "charge and knockback composition remains an explicit QUESTION",
			dash: "dash stage fields remain explicit QUESTION values",
			jump: "jump stage fields remain explicit QUESTION values",
			recoil: "recoil stage fields remain explicit QUESTION values",
			retarget: "retarget stage fields remain explicit QUESTION values",
			"shield-form": "shield/form fields remain unresolved QUESTION values"
		});
		SessionTroopRuntime = class SessionTroopRuntime {
			#profiles;
			#byCard;
			#movementProfiles = null;
			constructor(canonicalProfiles = EMPTY_PROFILE_BYTES) {
				this.#profiles = parseSessionTroopRuntimeProfiles(canonicalProfiles);
				if (this.#profiles.version === 4) {
					const manifest = movementManifestFromReceipt(this.#profiles);
					this.#movementProfiles = manifest.profiles;
					this.#byCard = new Map(this.#movementProfiles.map((profile) => [profile.id, profile]));
					return;
				}
				this.#byCard = new Map(this.#profiles.profiles.map((profile) => [profile.cardId, profile]));
			}
			get state() {
				return freeze$3(clone$3(this.#profiles));
			}
			get configuration() {
				return this.state;
			}
			get hasProfiles() {
				return this.#profiles.profiles.length > 0;
			}
			get version() {
				return this.#profiles.version;
			}
			get allowsLegacyActions() {
				return this.#profiles.version === 1 || this.#profiles.version === 2;
			}
			profile(cardId) {
				if (typeof cardId !== "string") throw new TypeError("session troop profile card ID must be primitive");
				const profile = this.#byCard.get(cardId);
				if (profile === void 0) return null;
				return this.#movementProfiles === null ? freeze$3(clone$3(profile)) : freeze$3(clone$3(movementProfilePublic(profile)));
			}
			movementProfile(cardId) {
				if (this.#movementProfiles === null) return null;
				if (typeof cardId !== "string") throw new TypeError("session troop movement profile card ID must be primitive");
				const profile = this.#byCard.get(cardId);
				return profile === void 0 ? null : freeze$3(clone$3(movementProfilePublic(profile)));
			}
			flightProfile(cardId) {
				if (this.#movementProfiles === null) return null;
				if (typeof cardId !== "string") throw new TypeError("session troop flight profile card ID must be primitive");
				const profile = this.#byCard.get(cardId);
				return profile === void 0 ? null : freeze$3(clone$3(movementFlightProfile(profile)));
			}
			assertSourceRoster(roster) {
				if (this.#movementProfiles === null) return true;
				return assertMovementSourceRoster(roster, this.#movementProfiles);
			}
			inspectMovement(value) {
				if (this.#movementProfiles === null) throw new RangeError("session troop runtime has no movement receipt");
				const command = checkedMovementCommand(value);
				if (command.phase !== "pre-move") throw new RangeError("session troop movement invocation must be pre-move");
				const profile = this.#byCard.get(command.cardId);
				if (profile === void 0) throw new RangeError("session troop movement card is not admitted by the HTMP receipt");
				const claim = movementClaim(profile, command.claimFamily);
				const flight = command.claimFamily === "flight" ? movementFlightProfile(profile) : null;
				if (flight !== null) return movementAdmission({
					...command,
					claim,
					flight
				});
				return movementQuestion({
					...command,
					claim
				});
			}
			inspectAction({ action, source }) {
				if (!this.allowsLegacyActions) throw new RangeError("current session troop runtime does not admit player actions");
				const checkedAction = checkedActionCommand(action, "session troop action inspection.action");
				const checkedSourceFact = checkedSource$2(source, 0);
				if (checkedSourceFact.sourceId !== checkedAction.sourceId || checkedSourceFact.side !== checkedAction.side) throw new RangeError("session troop action source is not causal");
				const profile = this.#byCard.get(checkedSourceFact.cardId);
				if (profile?.action === null || profile === void 0 || profile.action.id !== checkedAction.actionId) throw new RangeError("session troop action is not admitted for its source card");
				if (profile.action.abilityCost !== null) throw new TypeError("session troop action cost is not sourced");
				if (profile.action.target === "unit" && (checkedAction.targetId === null || checkedAction.point !== null)) throw new RangeError("session troop action requires exactly one unit target");
				const inspected = {
					abilityCost: null,
					actionId: checkedAction.actionId,
					cardId: checkedSourceFact.cardId,
					sourceId: checkedSourceFact.sourceId,
					target: profile.action.target
				};
				if (this.#profiles.version === 2) inspected.effect = profile.action.effect;
				return freeze$3(inspected);
			}
			reduce(boundary) {
				if (this.#profiles.version === 4) {
					const checked = checkedMovementBoundary(boundary);
					if (checked.phase !== "pre-move") return freeze$3([]);
					const intents = [];
					for (const source of checked.sources) {
						const profile = this.#byCard.get(source.cardId);
						if (profile === void 0) continue;
						const claim = profile.claims.find(({ claimFamily }) => claimFamily === "flight");
						if (claim === void 0) continue;
						intents.push(movementIntent({
							...source,
							claim,
							flight: movementFlightProfile(profile),
							tick: checked.tick
						}));
					}
					return freeze$3(intents);
				}
				if (this.#profiles.version === 3) {
					const checked = checkedCurrentBoundary(boundary);
					if (checked.phase !== "combat") return freeze$3([]);
					const intents = [];
					for (const contact of checked.contacts) {
						const source = checked.sources.find(({ sourceId }) => sourceId === contact.sourceId);
						if (source === void 0) throw new RangeError("session troop contact source is absent from its host boundary");
						const profile = this.#byCard.get(source.cardId);
						if (profile === void 0 || profile.contact === void 0) throw new RangeError("session troop contact source is not profiled");
						intents.push(contactIntent({
							...contact,
							cardId: source.cardId,
							side: source.side,
							sourceId: source.sourceId,
							tick: checked.tick
						}));
					}
					return freeze$3(intents);
				}
				const checked = checkedLegacyBoundary(boundary);
				const intents = [];
				if (checked.action !== null) {
					const source = checked.sources.find(({ sourceId }) => sourceId === checked.action.sourceId);
					if (source === void 0) throw new RangeError("session troop action source is absent from its host boundary");
					this.inspectAction({
						action: checked.action,
						source
					});
					intents.push(legacyIntent({
						action: checked.action,
						cardId: source.cardId,
						phase: checked.phase,
						side: source.side,
						sourceId: source.sourceId,
						tick: checked.tick,
						type: "action"
					}));
					return freeze$3(intents);
				}
				for (const source of checked.sources) {
					const profile = this.#byCard.get(source.cardId);
					if (profile === void 0) continue;
					if (checked.phase === "deploy" && profile.deploy === "receipt-only") intents.push(legacyIntent({
						cardId: source.cardId,
						phase: checked.phase,
						side: source.side,
						sourceId: source.sourceId,
						tick: checked.tick,
						type: "deploy"
					}));
					else if (checked.phase !== "deploy" && profile.passes.includes(checked.phase)) intents.push(legacyIntent({
						cardId: source.cardId,
						phase: checked.phase,
						side: source.side,
						sourceId: source.sourceId,
						tick: checked.tick,
						type: "pass"
					}));
				}
				return freeze$3(intents);
			}
			serialize() {
				return canonical$3(this.#profiles);
			}
			fork() {
				return SessionTroopRuntime.restore(this.serialize());
			}
			static restore(serialized) {
				return new SessionTroopRuntime(serialized);
			}
		};
	})))();
}
//#endregion
//#region src/sim/session-troop-status-runtime.js
function clone$2(value) {
	return JSON.parse(JSON.stringify(value));
}
function freeze$2(value) {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) freeze$2(child);
		Object.freeze(value);
	}
	return value;
}
function canonical$2(value) {
	if (Array.isArray(value)) return `[${value.map(canonical$2).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical$2(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exact$3(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain string-keyed object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors).sort();
	const expected = [...keys].sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} has an invalid shape`);
	for (const key of expected) {
		const descriptor = descriptors[key];
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
	}
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function boundedArray(value, label, maximum) {
	if (!Array.isArray(value) || value.length > maximum) throw new TypeError(`${label} must be a bounded array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	for (const key of Reflect.ownKeys(descriptors)) {
		if (key === "length") continue;
		if (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length) throw new TypeError(`${label} must contain only indexed data`);
	}
	return Array.from({ length: value.length }, (_, index) => {
		const descriptor = descriptors[index];
		if (descriptor === void 0 || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}[${index}] must be an enumerable data property`);
		return descriptor.value;
	});
}
function integer$2(value, minimum, maximum, label) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a safe integer from ${minimum} through ${maximum}`);
	return value;
}
function text$1(value, label) {
	if (typeof value !== "string" || value.length === 0 || value.length > 256 || value.normalize("NFC") !== value || /[\u0000-\u001f\u007f]/u.test(value)) throw new TypeError(`${label} must be bounded normalized text`);
	return value;
}
function fingerprint(serialized) {
	const bytes = new TextEncoder().encode(serialized);
	let left = 2166136261;
	let right = 2166136261;
	for (let index = 0; index < bytes.length; index += 1) {
		const byte = bytes[index];
		left = Math.imul(left ^ byte, 16777619) >>> 0;
		right = Math.imul(right ^ byte + (index * 31 & 255), 16777619) >>> 0;
	}
	return `${left.toString(16).padStart(8, "0")}${right.toString(16).padStart(8, "0")}`;
}
function dataTree(value, label, state = {
	depth: 0,
	nodes: 0
}, depth = 0) {
	state.nodes += 1;
	if (state.nodes > RECEIPT_MAX_NODES || depth > RECEIPT_MAX_DEPTH) throw new RangeError(`${label} exceeds the receipt graph bound`);
	if (value === null || typeof value === "string" || typeof value === "boolean") {
		if (typeof value === "string" && value.length > 1048576) throw new RangeError(`${label} exceeds the receipt text bound`);
		return value;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new TypeError(`${label} must contain only finite bounded numbers`);
		return value;
	}
	if (typeof value !== "object") throw new TypeError(`${label} contains an invalid value`);
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null && !Array.isArray(value)) throw new TypeError(`${label} must contain only plain data objects`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must not contain symbols`);
	if (Array.isArray(value)) {
		const keys = Reflect.ownKeys(descriptors);
		const lengthDescriptor = descriptors.length;
		if (lengthDescriptor === void 0 || !Object.hasOwn(lengthDescriptor, "value") || !Number.isSafeInteger(lengthDescriptor.value)) throw new TypeError(`${label} has an invalid array length`);
		const length = lengthDescriptor.value;
		if (keys.some((key) => key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= length))) throw new TypeError(`${label} must contain only indexed data`);
		return Array.from({ length }, (_, index) => {
			const descriptor = descriptors[index];
			if (descriptor === void 0 || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}[${index}] must be an enumerable data property`);
			return dataTree(descriptor.value, `${label}[${index}]`, state, depth + 1);
		});
	}
	const keys = Reflect.ownKeys(descriptors).sort();
	if (keys.some((key) => typeof key !== "string")) throw new TypeError(`${label} must contain only string keys`);
	return Object.fromEntries(keys.map((key) => {
		const descriptor = descriptors[key];
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
		return [key, dataTree(descriptor.value, `${label}.${key}`, state, depth + 1)];
	}));
}
function checkedReceiptObject(value, label) {
	const receipt = exact$3(dataTree(value, label), [
		"manifest",
		"profiles",
		"version"
	], label);
	if (receipt.version !== 1 || typeof receipt.manifest !== "string" || receipt.manifest.length === 0) throw new TypeError(`${label} is not the exact passed status profile receipt`);
	const profiles = boundedArray(receipt.profiles, `${label}.profiles`, PROFILE_IDS$1.length);
	if (profiles.length !== PROFILE_IDS$1.length || profiles.some((profile, index) => profile === null || typeof profile !== "object" || profile.id !== PROFILE_IDS$1[index])) throw new TypeError(`${label} diverges from the exact passed status profile identities`);
	let manifestValue;
	try {
		manifestValue = JSON.parse(receipt.manifest);
	} catch {
		throw new TypeError(`${label} has an invalid canonical source manifest`);
	}
	if (canonical$2(manifestValue) !== receipt.manifest || !Array.isArray(manifestValue.profiles) || manifestValue.profiles.length !== PROFILE_IDS$1.length || manifestValue.profiles.some((profile, index) => profile.id !== PROFILE_IDS$1[index])) throw new TypeError(`${label} has an invalid canonical source manifest`);
	if (fingerprint(canonical$2(receipt)) !== RECEIPT_FINGERPRINT) throw new TypeError(`${label} diverges from the exact passed status profile manifest`);
	return clone$2(receipt);
}
function statusRosterData(value) {
	const normalized = dataTree(value, "status runtime source roster");
	if (!Array.isArray(normalized) || normalized.length > 8) throw new TypeError("status runtime source roster must be a bounded array");
	return normalized;
}
function assertKilnkeeperAreaRadiusClosure(record, roster) {
	if (record.source !== KILNKEEPER_AREA_RADIUS_SOURCE || record.value !== 0) throw new TypeError("kilnkeeper area radius QUESTION diverges from its pinned source receipt");
	const matches = roster.flatMap((card) => card.id === "kilnkeeper" ? card.entities.filter(({ archetypeId }) => archetypeId === "kilnkeeper").map((entity) => ({
		card,
		entity
	})) : []);
	if (matches.length !== 1) throw new TypeError("kilnkeeper area radius QUESTION has no unique source confidence closure");
	const [{ card, entity }] = matches;
	const confidenceField = assertSessionTroopSourceConfidencePolicy(entity.sourceConfidencePolicy, card.id, entity.archetypeId).fields.find(({ questionKey }) => questionKey === KILNKEEPER_AREA_RADIUS_KEY);
	const sourceProfile = getOrdinaryProjectileSplashProfile(card.id, entity.archetypeId);
	const sourceFacts = getOrdinaryProjectileSplashSourceFacts(card.id, entity.archetypeId);
	if (confidenceField === void 0 || confidenceField.field !== "projectileSplashSourceFacts.characterAreaDamageRadiusMillitiles" || confidenceField.valueEncoding !== "nonnegative-integer" || confidenceField.source !== KILNKEEPER_AREA_RADIUS_SOURCE || sourceProfile === null || canonical$2(assertOrdinaryProjectileSplashProfile(entity.projectileSplashPolicy, card.id, entity.archetypeId)) !== canonical$2(sourceProfile) || canonical$2(entity.projectileSplashSourceFacts) !== canonical$2(sourceFacts) || encodeSessionTroopSourceConfidenceValue(confidenceField.valueEncoding, entity.projectileSplashSourceFacts.characterAreaDamageRadiusMillitiles) !== record.value) throw new TypeError("kilnkeeper area radius QUESTION has an invalid source confidence closure");
}
function statusQuestionData(value, roster) {
	const normalized = dataTree(value, "status runtime question inventory");
	if (!Array.isArray(normalized) || normalized.length > STATUS_MAX_QUESTIONS) throw new TypeError("status runtime question inventory must be a bounded array");
	const records = normalized.map((raw, index) => {
		const record = exact$3(raw, STATUS_QUESTION_KEYS, `status runtime question inventory[${index}]`);
		if (record.authoritative !== false || record.confidence !== "unverified" || record.disposition !== "question" || typeof record.key !== "string" || record.key.length === 0 || typeof record.source !== "string" || record.source.length === 0) throw new TypeError(`status runtime question inventory[${index}] is not an unresolved QUESTION`);
		if (record.key === KILNKEEPER_AREA_RADIUS_KEY) assertKilnkeeperAreaRadiusClosure(record, roster);
		return {
			authoritative: false,
			confidence: "unverified",
			disposition: "question",
			key: record.key,
			source: record.source,
			value: integer$2(record.value, record.key === KILNKEEPER_AREA_RADIUS_KEY ? 0 : 1, Number.MAX_SAFE_INTEGER, `status runtime question inventory[${index}].value`)
		};
	});
	if (new Set(records.map(({ key }) => key)).size !== records.length) throw new TypeError("status runtime question inventory keys must be unique");
	return new Map(records.map((record) => [record.key, record]));
}
function policy(value, label) {
	const checked = exact$3(value, ["kind", "questionKey"], label);
	return {
		kind: checked.kind,
		questionKey: checked.questionKey
	};
}
function assertQuestionPolicy(value, expectedKey, label) {
	const checked = policy(value, label);
	if (checked.kind !== "question" || checked.questionKey !== expectedKey) throw new TypeError(`${label} diverges from its pinned QUESTION path`);
}
function assertProjectilePolicy(value, entity, label) {
	const checked = policy(value, label);
	if (entity.delivery === "projectile") {
		if (checked.kind !== "question" || checked.questionKey !== `${entity.archetypeId}.projectile-speed-millitiles-per-tick`) throw new TypeError(`${label} diverges from its pinned projectile QUESTION path`);
		return;
	}
	if (entity.delivery !== "melee" || checked.kind !== "not-applicable" || checked.questionKey !== null) throw new TypeError(`${label} diverges from its pinned delivery policy`);
}
function statusDeliveryResolution(profile, label) {
	if (profile.claimFamily === "reflection" && profile.sourceExport === "createReflectionSpecialCatalog") return "projectile";
	if ([
		"heal",
		"invisibility",
		"shield-form",
		"slow",
		"snare",
		"stun"
	].includes(profile.claimFamily)) return "melee";
	throw new RangeError(`${label} has no receipt-authorized delivery resolution`);
}
function statusQuestionResolution(profile, source, suffix, label) {
	if (suffix === "body-radius-millitiles") return source.count === 1 ? 500 : 300;
	if (suffix === "delivery") return statusDeliveryResolution(profile, label) === "projectile" ? 2 : 1;
	if (suffix === "layer") {
		if (profile.sourceRecord.targetMode === "air") return 2;
		if ([
			"ground",
			"ground-and-air",
			"structures"
		].includes(profile.sourceRecord.targetMode)) return STATUS_LAYER_RESOLUTION;
		throw new RangeError(`${label} has no receipt-authorized layer resolution`);
	}
	if (suffix === "projectile-speed-millitiles-per-tick") {
		if (statusDeliveryResolution(profile, label) !== "projectile") throw new TypeError(`${label} has a projectile QUESTION without a delivery claim`);
		return STATUS_PROJECTILE_SPEED_RESOLUTION;
	}
	throw new TypeError(`${label} has an unsupported status projection QUESTION`);
}
function assertPinnedProjectionQuestion(questionMap, key, value, label) {
	if (questionMap === null) return;
	const actual = questionMap.get(key);
	const expected = {
		authoritative: false,
		confidence: "unverified",
		disposition: "question",
		key,
		source: STATUS_QUESTION_SOURCE,
		value
	};
	if (actual === void 0 || canonical$2(actual) !== canonical$2(expected)) throw new TypeError(`${label} diverges from its pinned QUESTION resolution`);
}
function assertReceiptStatusEntityPolicies(entity, profile, source, questionMap, label) {
	if (typeof entity.archetypeId !== "string" || entity.archetypeId.length === 0) throw new TypeError(`${label}.archetypeId is invalid`);
	exact$3(entity, STATUS_ENTITY_KEYS, label);
	const delivery = statusDeliveryResolution(profile, label);
	if (entity.delivery !== delivery || entity.layer !== "ground") throw new TypeError(`${label} diverges from the receipt-derived delivery/layer tuple`);
	assertQuestionPolicy(entity.bodyRadiusPolicy, `${entity.archetypeId}.body-radius-millitiles`, `${label}.bodyRadiusPolicy`);
	assertProjectilePolicy(entity.projectileSpeedPolicy, entity, `${label}.projectileSpeedPolicy`);
	assertQuestionPolicy(entity.deliveryPolicy, `${entity.archetypeId}.delivery`, `${label}.deliveryPolicy`);
	assertQuestionPolicy(entity.layerPolicy, `${entity.archetypeId}.layer`, `${label}.layerPolicy`);
	for (const suffix of [
		"body-radius-millitiles",
		"delivery",
		"layer",
		...delivery === "projectile" ? ["projectile-speed-millitiles-per-tick"] : []
	]) assertPinnedProjectionQuestion(questionMap, `${entity.archetypeId}.${suffix}`, statusQuestionResolution(profile, source, suffix, label), `${label}.${suffix}`);
}
function comparePinnedFields(live, pinned, fields, label) {
	for (const field of fields) if (canonical$2(live[field]) !== canonical$2(pinned[field])) throw new TypeError(`${label}.${field} diverges from the pinned status source`);
}
function assertPinnedStatusCard(card, profile, questionMap = null) {
	const label = `status runtime source ${profile.id}`;
	if (card === null || typeof card !== "object" || Array.isArray(card) || card.id !== profile.id || card.kind !== "unit") throw new TypeError(`${label} card identity is not admitted`);
	exact$3(card, STATUS_CARD_KEYS, label);
	const source = exact$3(profile.sourceRecord, SOURCE_RECORD_KEYS, `${label}.sourceRecord`);
	if (source.id !== profile.id || source.kind !== "unit" || typeof profile.sourceWitness !== "string" || profile.sourceWitness !== canonical$2(source)) throw new TypeError(`${label} source provenance is not the pinned record`);
	comparePinnedFields(card, source, SOURCE_CARD_FIELDS, label);
	const sourceComponents = boundedArray(source.components, `${label}.components`, 16);
	const entities = boundedArray(card.entities, `${label}.entities`, 16);
	const expectedComponents = sourceComponents.length === 0 ? [{
		...source,
		id: source.id,
		role: "primary"
	}] : sourceComponents.map((component) => exact$3(component, SOURCE_COMPONENT_KEYS$1, `${label}.components`));
	if (entities.length !== expectedComponents.length) throw new TypeError(`${label}.entity/component inventory diverges from the pinned source`);
	const expectedOrder = expectedComponents.map(({ id }) => id);
	const formation = exact$3(card.formation, [
		"componentOrder",
		"expansionOrder",
		"totalCount"
	], `${label}.formation`);
	const componentOrder = boundedArray(formation.componentOrder, `${label}.formation.componentOrder`, 16);
	if (formation.expansionOrder !== "component-order-then-member-index" || canonical$2(componentOrder) !== canonical$2(expectedOrder)) throw new TypeError(`${label}.component order diverges from the pinned source`);
	let totalCount = 0;
	for (let index = 0; index < expectedComponents.length; index += 1) {
		const expected = expectedComponents[index];
		const entity = entities[index];
		if (entity === null || typeof entity !== "object" || Array.isArray(entity) || entity.archetypeId !== expected.id || entity.role !== expected.role) throw new TypeError(`${label}.entities[${index}] identity/order diverges from the pinned source`);
		comparePinnedFields(entity, expected, SOURCE_ENTITY_FIELDS, `${label}.entities[${index}]`);
		assertReceiptStatusEntityPolicies(entity, profile, expected, questionMap, `${label}.entities[${index}]`);
		totalCount += entity.count;
	}
	if (formation.totalCount !== totalCount || card.count !== totalCount) throw new TypeError(`${label}.formation count diverges from the pinned source`);
}
function statusSignals(roster) {
	const cards = roster.filter((card) => card !== null && typeof card === "object" && !Array.isArray(card));
	const cardIds = /* @__PURE__ */ new Set();
	const entityClaims = [];
	for (const card of cards) {
		if (typeof card.id === "string" && PROFILE_ID_SET.has(card.id)) cardIds.add(card.id);
		if (!Array.isArray(card.entities)) continue;
		for (const entity of card.entities) if (entity !== null && typeof entity === "object" && !Array.isArray(entity) && typeof entity.archetypeId === "string" && PROFILE_ID_SET.has(entity.archetypeId)) entityClaims.push({
			cardId: card.id,
			entityId: entity.archetypeId
		});
	}
	return {
		cardIds,
		cards,
		entityClaims
	};
}
function validateSourceRoster(roster, receipt, questions = void 0) {
	const normalized = statusRosterData(roster);
	const questionMap = questions === void 0 ? null : statusQuestionData(questions, normalized);
	const { cardIds, cards, entityClaims } = statusSignals(normalized);
	if (receipt === void 0) return;
	const profiles = new Map(receipt.profiles.map((profile) => [profile.id, profile]));
	if (cardIds.size === 0) throw new RangeError("status profile receipt has no live status source card");
	for (const claim of entityClaims) if (claim.cardId !== claim.entityId) throw new TypeError("live status entity claims another supported status identity");
	for (const cardId of cardIds) {
		const profile = profiles.get(cardId);
		const matchingCards = cards.filter((candidate) => candidate.id === cardId);
		if (profile === void 0 || matchingCards.length !== 1) throw new TypeError(`status source ${cardId} has no pinned profile`);
		assertPinnedStatusCard(matchingCards[0], profile, questionMap);
	}
}
function parseSessionTroopStatusRuntimeProfiles(serialized) {
	if (typeof serialized !== "string") throw new TypeError("session troop status runtime profiles must be canonical JSON text");
	if (new TextEncoder().encode(serialized).byteLength > 1048576) throw new RangeError("session troop status runtime profiles exceed their byte bound");
	let value;
	try {
		value = JSON.parse(serialized);
	} catch {
		throw new TypeError("session troop status runtime profiles must be valid JSON");
	}
	if (canonical$2(value) !== serialized) throw new TypeError("session troop status runtime profiles must be canonical JSON");
	return checkedReceiptObject(value, "session troop status runtime profiles");
}
function assertSessionTroopStatusSourceRoster(roster, serialized = void 0, questions = void 0) {
	if (serialized === void 0) {
		validateSourceRoster(roster, void 0, questions);
		return;
	}
	if (typeof serialized !== "string") throw new TypeError("session troop status source receipt must be canonical JSON text");
	validateSourceRoster(roster, parseSessionTroopStatusRuntimeProfiles(serialized), questions);
}
function checkedSource$1(value, index) {
	const source = exact$3(value, SOURCE_KEYS, `status runtime source ${index}`);
	const sourceId = integer$2(source.sourceId, 1, Number.MAX_SAFE_INTEGER, `status runtime source ${index}.sourceId`);
	if (typeof source.cardId !== "string" || !PROFILE_ID_SET.has(source.cardId) || !["north", "south"].includes(source.side)) throw new TypeError(`status runtime source ${index} is invalid`);
	return {
		cardId: source.cardId,
		side: source.side,
		sourceId
	};
}
function checkedTarget$1(value, index) {
	if (value === null) return null;
	const target = exact$3(value, TARGET_KEYS, `status runtime target ${index}`);
	const id = integer$2(target.id, 1, Number.MAX_SAFE_INTEGER, `status runtime target ${index}.id`);
	if (target.kind !== "unit" || !["air", "ground"].includes(target.layer) || !["north", "south"].includes(target.side) || typeof target.alive !== "boolean" || typeof target.targetable !== "boolean") throw new TypeError(`status runtime target ${index} is invalid`);
	if (!target.alive) throw new RangeError(`status runtime target ${index} is not an admitted live host fact`);
	return {
		alive: true,
		id,
		kind: "unit",
		layer: target.layer,
		side: target.side,
		targetable: target.targetable
	};
}
function checkedCommand$1(value, currentTick, index) {
	const command = exact$3(value, COMMAND_KEYS, `status runtime command ${index}`);
	if (command.type !== "status") throw new TypeError("status runtime command.type is invalid");
	const actionId = text$1(command.actionId, `status runtime command ${index}.actionId`);
	const commandId = integer$2(command.commandId, 0, Number.MAX_SAFE_INTEGER, `status runtime command ${index}.commandId`);
	const sourceId = integer$2(command.sourceId, 1, Number.MAX_SAFE_INTEGER, `status runtime command ${index}.sourceId`);
	const targetId = command.targetId === null ? null : integer$2(command.targetId, 1, Number.MAX_SAFE_INTEGER, `status runtime command ${index}.targetId`);
	const tick = integer$2(command.tick, currentTick, currentTick, `status runtime command ${index}.tick`);
	if (!["north", "south"].includes(command.side)) throw new TypeError(`status runtime command ${index}.side is invalid`);
	return {
		actionId,
		commandId,
		side: command.side,
		sourceId,
		targetId,
		tick,
		type: "status"
	};
}
function checkedPhase(value) {
	if (typeof value !== "string" || !PHASES.has(value)) throw new TypeError("status runtime phase is not an admitted canonical phase");
	return value;
}
function checkedFamily(profile, label) {
	if (!FAMILIES.has(profile.claimFamily)) throw new TypeError(`${label}.claimFamily is invalid`);
	return profile.claimFamily;
}
function question(profile, key, label) {
	const record = profile.questions?.[key];
	if (record === void 0 || record === null || !Object.hasOwn(record, "value")) throw new RangeError(`${label} remains an explicit QUESTION (${key})`);
	return record.value;
}
function checkedRate(value, label) {
	const rate = exact$3(value, ["denominator", "numerator"], label);
	return {
		denominator: integer$2(rate.denominator, 1, Number.MAX_SAFE_INTEGER, `${label}.denominator`),
		numerator: integer$2(rate.numerator, 1, rate.denominator - 1, `${label}.numerator`)
	};
}
function resolveAction(profile, actionId) {
	const family = checkedFamily(profile, `status profile ${profile.id}`);
	if (profile.resolution !== "question-bearing" || profile.questionReceipt === null || profile.questions === null) throw new RangeError(`status ${profile.id} remains an explicit QUESTION (${family})`);
	if (family === "heal" && actionId === "heal") {
		const amountKey = profile.id === "bloom-wisp" ? "bloomWispHealAmount" : "dawnmenderHealAmount";
		return {
			effect: "heal",
			parameters: { amount: integer$2(question(profile, amountKey, `status ${profile.id}`), 0, Number.MAX_SAFE_INTEGER, `status ${profile.id}.${amountKey}`) }
		};
	}
	if (family === "stun" && actionId === "stun") return {
		effect: "stun",
		parameters: { durationTicks: integer$2(question(profile, "durationTicks", `status ${profile.id}`), 1, Number.MAX_SAFE_INTEGER, `status ${profile.id}.durationTicks`) }
	};
	if (family === "slow" && actionId === "slow") return {
		effect: "slow",
		parameters: {
			attackRate: checkedRate(question(profile, "attackProgressRate", `status ${profile.id}`), `status ${profile.id}.attackProgressRate`),
			durationTicks: integer$2(question(profile, "durationTicks", `status ${profile.id}`), 1, Number.MAX_SAFE_INTEGER, `status ${profile.id}.durationTicks`),
			movementRate: checkedRate(question(profile, "movementProgressRate", `status ${profile.id}`), `status ${profile.id}.movementProgressRate`)
		}
	};
	if (family === "snare" && actionId === "snare") return {
		effect: "snare",
		parameters: { durationTicks: integer$2(question(profile, "durationTicks", `status ${profile.id}`), 1, Number.MAX_SAFE_INTEGER, `status ${profile.id}.durationTicks`) }
	};
	if (family === "invisibility" && (actionId === "hide" || actionId === "reveal")) {
		const key = actionId === "hide" ? "hideDurationTicks" : "revealDurationTicks";
		return {
			effect: actionId,
			parameters: { durationTicks: integer$2(question(profile, key, `status ${profile.id}`), 1, Number.MAX_SAFE_INTEGER, `status ${profile.id}.${key}`) }
		};
	}
	throw new RangeError(`status ${profile.id} ${actionId} remains an explicit QUESTION (${family})`);
}
var SESSION_TROOP_STATUS_RUNTIME_MAX_COMMANDS, SESSION_TROOP_STATUS_RUNTIME_MAX_SOURCES, PROFILE_IDS$1, PHASES, FAMILIES, SOURCE_KEYS, TARGET_KEYS, COMMAND_KEYS, OBSERVATION_KEYS, RECEIPT_FINGERPRINT, PROFILE_ID_SET, RECEIPT_MAX_DEPTH, RECEIPT_MAX_NODES, SOURCE_RECORD_KEYS, SOURCE_COMPONENT_KEYS$1, SOURCE_CARD_FIELDS, SOURCE_ENTITY_FIELDS, STATUS_CARD_KEYS, STATUS_ENTITY_KEYS, STATUS_QUESTION_KEYS, STATUS_QUESTION_SOURCE, KILNKEEPER_AREA_RADIUS_KEY, KILNKEEPER_AREA_RADIUS_SOURCE, STATUS_LAYER_RESOLUTION, STATUS_PROJECTILE_SPEED_RESOLUTION, STATUS_MAX_QUESTIONS, SessionTroopStatusRuntime;
function init_session_troop_status_runtime() {
	return (init_session_troop_status_runtime = __esmMin((() => {
		init_session_troop_source_confidence_authority();
		init_ordinary_projectile_delivery_authority();
		SESSION_TROOP_STATUS_RUNTIME_MAX_COMMANDS = 1024;
		SESSION_TROOP_STATUS_RUNTIME_MAX_SOURCES = 1024;
		PROFILE_IDS$1 = Object.freeze([
			"aegis-sage",
			"bloom-wisp",
			"dawnmender",
			"pulse-sentry",
			"railward",
			"rime-adept",
			"tether-rider",
			"veil-prowler"
		]);
		PHASES = /* @__PURE__ */ new Set(["pre-move"]);
		FAMILIES = /* @__PURE__ */ new Set([
			"heal",
			"invisibility",
			"reflection",
			"shield-form",
			"slow",
			"snare",
			"stun"
		]);
		SOURCE_KEYS = [
			"cardId",
			"side",
			"sourceId"
		];
		TARGET_KEYS = [
			"alive",
			"id",
			"kind",
			"layer",
			"side",
			"targetable"
		];
		COMMAND_KEYS = [
			"actionId",
			"commandId",
			"side",
			"sourceId",
			"targetId",
			"tick",
			"type"
		];
		OBSERVATION_KEYS = [
			"commands",
			"phase",
			"sources",
			"targets",
			"tick"
		];
		RECEIPT_FINGERPRINT = "5ce7a9c35c0be1b9";
		PROFILE_ID_SET = new Set(PROFILE_IDS$1);
		RECEIPT_MAX_DEPTH = 64;
		RECEIPT_MAX_NODES = 5e4;
		SOURCE_RECORD_KEYS = Object.freeze([
			"areaDamageRadiusMillitiles",
			"components",
			"cost",
			"count",
			"damage",
			"deployTimeTicks",
			"displayName",
			"firstHitTicks",
			"hitSpeedTicks",
			"hitpoints",
			"id",
			"kind",
			"movementMillitilesPerSecond",
			"rangeMillitiles",
			"rarity",
			"sightRangeMillitiles",
			"targetMode"
		]);
		SOURCE_COMPONENT_KEYS$1 = Object.freeze([
			"areaDamageRadiusMillitiles",
			"count",
			"damage",
			"deployTimeTicks",
			"displayName",
			"firstHitTicks",
			"hitSpeedTicks",
			"hitpoints",
			"id",
			"kind",
			"movementMillitilesPerSecond",
			"rangeMillitiles",
			"role",
			"sightRangeMillitiles",
			"targetMode"
		]);
		SOURCE_CARD_FIELDS = Object.freeze(SOURCE_RECORD_KEYS.filter((key) => key !== "components"));
		SOURCE_ENTITY_FIELDS = Object.freeze(SOURCE_COMPONENT_KEYS$1.filter((key) => key !== "id" && key !== "role"));
		STATUS_CARD_KEYS = Object.freeze([
			...SOURCE_RECORD_KEYS.filter((key) => key !== "components"),
			"entities",
			"formation"
		]);
		STATUS_ENTITY_KEYS = Object.freeze([
			"archetypeId",
			"areaDamageRadiusMillitiles",
			"bodyRadiusPolicy",
			"count",
			"damage",
			"delivery",
			"deployTimeTicks",
			"displayName",
			"firstHitTicks",
			"hitSpeedTicks",
			"hitpoints",
			"kind",
			"layer",
			"movementMillitilesPerSecond",
			"projectileSpeedPolicy",
			"rangeMillitiles",
			"role",
			"sightRangeMillitiles",
			"targetMode",
			"deliveryPolicy",
			"layerPolicy"
		]);
		STATUS_QUESTION_KEYS = Object.freeze([
			"authoritative",
			"confidence",
			"disposition",
			"key",
			"source",
			"value"
		]);
		STATUS_QUESTION_SOURCE = "runtime-playability-estimate-not-comparison-corpus";
		KILNKEEPER_AREA_RADIUS_KEY = "kilnkeeper.character-area-damage-radius-millitiles";
		KILNKEEPER_AREA_RADIUS_SOURCE = "pinned-royaleapi-54fdef52:cards_stats_characters#wizard";
		STATUS_LAYER_RESOLUTION = 1;
		STATUS_PROJECTILE_SPEED_RESOLUTION = 500;
		STATUS_MAX_QUESTIONS = 256;
		SessionTroopStatusRuntime = class SessionTroopStatusRuntime {
			#receipt;
			constructor(serialized) {
				this.#receipt = parseSessionTroopStatusRuntimeProfiles(serialized);
			}
			get hasProfiles() {
				return true;
			}
			get state() {
				return clone$2(this.#receipt);
			}
			serialize() {
				return canonical$2(this.#receipt);
			}
			fork() {
				return new SessionTroopStatusRuntime(this.serialize());
			}
			assertSourceRoster(roster, questions = void 0) {
				validateSourceRoster(roster, this.#receipt, questions);
			}
			profile(cardId) {
				if (typeof cardId !== "string") throw new TypeError("status runtime card ID must be a primitive string");
				const profile = this.#receipt.profiles.find((entry) => entry.id === cardId);
				return profile === void 0 ? null : clone$2(profile);
			}
			inspect({ actionId, cardId, sourceId, targetId }) {
				const profile = this.profile(cardId);
				if (profile === null) throw new RangeError(`status ${cardId} remains an explicit QUESTION (unadmitted)`);
				const resolved = resolveAction(profile, actionId);
				const needsTarget = resolved.effect !== "hide" && resolved.effect !== "reveal";
				if (needsTarget && targetId === null) throw new RangeError(`status ${cardId} remains an explicit QUESTION (targeting)`);
				if (!needsTarget && targetId !== null) throw new RangeError(`status ${cardId} remains an explicit QUESTION (targeting)`);
				integer$2(sourceId, 1, Number.MAX_SAFE_INTEGER, "status runtime sourceId");
				return clone$2(resolved);
			}
			reduce(observation) {
				const checked = exact$3(observation, OBSERVATION_KEYS, "status runtime observation");
				const tick = integer$2(checked.tick, 0, Number.MAX_SAFE_INTEGER, "status runtime observation.tick");
				const phase = checkedPhase(checked.phase);
				const sources = boundedArray(checked.sources, "status runtime observation.sources", SESSION_TROOP_STATUS_RUNTIME_MAX_SOURCES).map(checkedSource$1);
				if (new Set(sources.map(({ sourceId }) => sourceId)).size !== sources.length) throw new TypeError("status runtime observation source IDs must be unique");
				const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
				const commands = boundedArray(checked.commands, "status runtime observation.commands", SESSION_TROOP_STATUS_RUNTIME_MAX_COMMANDS).map((command, index) => checkedCommand$1(command, tick, index));
				const targets = boundedArray(checked.targets, "status runtime observation.targets", SESSION_TROOP_STATUS_RUNTIME_MAX_COMMANDS).map(checkedTarget$1);
				if (targets.length !== commands.length) throw new TypeError("status runtime observation targets must align with commands");
				if (new Set(commands.map(({ commandId, side }) => `${side}:${commandId}`)).size !== commands.length) throw new TypeError("status runtime observation command identities must be unique");
				return freeze$2(commands.map((command, index) => {
					const source = sourceById.get(command.sourceId);
					if (source === void 0 || source.cardId === void 0 || source.side !== command.side) throw new RangeError("status runtime command source is not admitted");
					if (source.cardId === "aegis-sage" || source.cardId === "railward") throw new RangeError(`status ${source.cardId} remains an explicit QUESTION (${source.cardId === "aegis-sage" ? "reflection composition" : "shield/form"})`);
					if (checked.phase !== "pre-move") throw new TypeError("status runtime command phase is not canonical");
					const resolved = this.inspect({
						actionId: command.actionId,
						cardId: source.cardId,
						sourceId: command.sourceId,
						targetId: command.targetId
					});
					if (command.actionId !== "hide" && command.actionId !== "reveal" && command.targetId === null) throw new RangeError("status runtime command target is an explicit QUESTION");
					const target = targets[index];
					if (command.targetId === null) {
						if (target !== null) throw new TypeError("status runtime command target witness is noncanonical");
					} else if (target === null || target.id !== command.targetId) throw new RangeError("status runtime command target witness is stale");
					return {
						actionId: command.actionId,
						cardId: source.cardId,
						commandId: command.commandId,
						effect: resolved.effect,
						parameters: resolved.parameters,
						phase,
						side: command.side,
						sourceId: command.sourceId,
						targetId: command.targetId,
						tick,
						type: "troop-status-intent"
					};
				}).sort((left, right) => left.commandId - right.commandId || left.sourceId - right.sourceId));
			}
		};
	})))();
}
//#endregion
//#region src/sim/session-troop-projectile-runtime.js
function clone$1(value) {
	return structuredClone(value);
}
function freeze$1(value, seen = /* @__PURE__ */ new WeakSet()) {
	if (value === null || typeof value !== "object" || seen.has(value)) return value;
	seen.add(value);
	for (const child of Object.values(value)) freeze$1(child, seen);
	return Object.freeze(value);
}
function canonical$1(value) {
	if (Array.isArray(value)) return `[${value.map(canonical$1).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical$1(value[key])}`).join(",")}}`;
	const encoded = JSON.stringify(value);
	if (encoded === void 0) throw new TypeError("projectile runtime data cannot contain undefined");
	return encoded;
}
function exact$2(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors).sort();
	const expected = [...keys].sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} has an invalid shape`);
	for (const [key, descriptor] of Object.entries(descriptors)) if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function dense(value, maximum, label) {
	if (!Array.isArray(value) || value.length > maximum) throw new TypeError(`${label} must be a bounded array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	for (const key of Reflect.ownKeys(descriptors)) {
		if (key === "length") continue;
		if (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length) throw new TypeError(`${label} must contain only indexed data`);
	}
	return Array.from({ length: value.length }, (_, index) => {
		const descriptor = descriptors[index];
		if (descriptor === void 0 || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}[${index}] must be an enumerable data property`);
		return descriptor.value;
	});
}
function integer$1(value, minimum, maximum, label) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a safe integer from ${minimum} through ${maximum}`);
	return value;
}
function text(value, label, maximum = 256) {
	if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.normalize("NFC") !== value || /[\u0000-\u001f\u007f]/u.test(value)) throw new TypeError(`${label} must be bounded normalized text`);
	return value;
}
function safeGraph(value, label) {
	const pending = [{
		depth: 0,
		value
	}];
	let nodes = 0;
	while (pending.length > 0) {
		const { depth, value: entry } = pending.pop();
		nodes += 1;
		if (nodes > 2e4 || depth > 32) throw new RangeError(`${label} graph bound exceeded`);
		if (typeof entry === "string") {
			text(entry, label, 1048576);
			continue;
		}
		if (typeof entry === "number") {
			if (!Number.isFinite(entry)) throw new TypeError(`${label} numbers must be finite`);
			continue;
		}
		if (entry === null || typeof entry === "boolean") continue;
		if (typeof entry !== "object") throw new TypeError(`${label} contains invalid data`);
		if ((Array.isArray(entry) ? Object.keys(entry) : Object.keys(entry)).length > 1024) throw new RangeError(`${label} member bound exceeded`);
		for (const child of Array.isArray(entry) ? entry : Object.values(entry)) pending.push({
			depth: depth + 1,
			value: child
		});
	}
}
function parseCanonical(serialized, label, maximum = SESSION_TROOP_PROJECTILE_RUNTIME_MAX_BYTES) {
	if (typeof serialized !== "string") throw new TypeError(`${label} must be canonical JSON text`);
	if (new TextEncoder().encode(serialized).byteLength > maximum) throw new RangeError(`${label} exceeds its byte bound`);
	let value;
	try {
		value = JSON.parse(serialized);
	} catch {
		throw new TypeError(`${label} must be valid JSON`);
	}
	safeGraph(value, label);
	if (canonical$1(value) !== serialized) throw new TypeError(`${label} must be canonical JSON`);
	return value;
}
function sourceComponentFromEntity(entity) {
	return Object.fromEntries(SOURCE_COMPONENT_KEYS.map((key) => [key, key === "id" ? entity.archetypeId : entity[key]]));
}
function rosterSourceCard(card, label) {
	const checked = exact$2(card, ROSTER_CARD_KEYS, label);
	if (checked.kind !== "unit") throw new TypeError(`${label} must be a unit card`);
	const components = checked.formation.totalCount === 0 ? [] : checked.entities.length === 1 && checked.entities[0].archetypeId === checked.id && checked.entities[0].count === checked.count ? [] : checked.entities.map(sourceComponentFromEntity);
	return {
		areaDamageRadiusMillitiles: checked.areaDamageRadiusMillitiles,
		components,
		cost: checked.cost,
		count: checked.count,
		damage: checked.damage,
		deployTimeTicks: checked.deployTimeTicks,
		displayName: checked.displayName,
		firstHitTicks: checked.firstHitTicks,
		hitSpeedTicks: checked.hitSpeedTicks,
		hitpoints: checked.hitpoints,
		id: checked.id,
		kind: checked.kind,
		movementMillitilesPerSecond: checked.movementMillitilesPerSecond,
		rangeMillitiles: checked.rangeMillitiles,
		rarity: checked.rarity,
		sightRangeMillitiles: checked.sightRangeMillitiles,
		targetMode: checked.targetMode
	};
}
function checkedIdentity(value, label) {
	const identity = exact$2(value, PROJECTILE_IDENTITY_KEYS, label);
	const direction = text(identity.direction, `${label}.direction`);
	if (!PROJECTILE_DIRECTIONS.has(direction)) throw new TypeError(`${label}.direction is invalid`);
	return {
		attackSequence: integer$1(identity.attackSequence, 1, Number.MAX_SAFE_INTEGER, `${label}.attackSequence`),
		direction,
		projectileId: integer$1(identity.projectileId, 1, Number.MAX_SAFE_INTEGER, `${label}.projectileId`),
		sourceId: integer$1(identity.sourceId, 1, Number.MAX_SAFE_INTEGER, `${label}.sourceId`)
	};
}
function identityKey(identity) {
	return canonical$1(identity);
}
function checkedQuestionRecord(value, key, label) {
	const record = exact$2(value, [
		"authoritative",
		"confidence",
		"disposition",
		"source",
		"value"
	], label);
	if (record.authoritative !== false || record.disposition !== "question") throw new TypeError(`${label} must remain an explicit QUESTION`);
	return {
		authoritative: false,
		confidence: text(record.confidence, `${label}.confidence`),
		disposition: "question",
		key: text(key, `${label}.key`),
		source: text(record.source, `${label}.source`),
		value: clone$1(record.value)
	};
}
function checkedPlan(value) {
	if (!internalProjectilePlans.has(value)) throw new TypeError("projectile runtime requires a private admitted host plan");
	const plan = exact$2(value, [
		"configuration",
		"profiles",
		"questions"
	], "projectile runtime host plan");
	const configuration = parseCanonical(plan.configuration, "projectile runtime host configuration");
	const profiles = dense(plan.profiles, 8, "projectile runtime host profiles").map((profile, index) => {
		const checked = exact$2(profile, [
			"claimFamily",
			"id",
			"questions",
			"sourceCard"
		], `projectile runtime host profile[${index}]`);
		if (!PROFILE_IDS.has(checked.id) || !CLAIM_FAMILIES.has(checked.claimFamily)) throw new TypeError(`projectile runtime host profile[${index}] identity is invalid`);
		const questions = exact$2(checked.questions, Object.keys(checked.questions), `projectile runtime host profile[${index}].questions`);
		const checkedQuestions = Object.fromEntries(Object.entries(questions).map(([key, record]) => [key, checkedQuestionRecord(record, key, `projectile runtime host profile[${index}].questions.${key}`)]));
		checkedSourceCard(checked.sourceCard, `projectile runtime host profile[${index}].sourceCard`);
		return {
			claimFamily: checked.claimFamily,
			id: checked.id,
			questions: checkedQuestions,
			sourceCard: clone$1(checked.sourceCard)
		};
	}).sort((left, right) => left.id.localeCompare(right.id));
	const questions = dense(plan.questions, 32, "projectile runtime host questions").map((dependency, index) => {
		const checked = exact$2(dependency, [
			"cardId",
			"claimFamily",
			"questions"
		], `projectile runtime host question[${index}]`);
		if (!CLAIM_FAMILIES.has(checked.claimFamily)) throw new TypeError(`projectile runtime host question[${index}] claim family is invalid`);
		const questionRecords = exact$2(checked.questions, Object.keys(checked.questions), `projectile runtime host question[${index}].questions`);
		return {
			cardId: text(checked.cardId, `projectile runtime host question[${index}].cardId`),
			claimFamily: checked.claimFamily,
			questions: Object.fromEntries(Object.entries(questionRecords).map(([key, record]) => [key, checkedQuestionRecord(record, key, `projectile runtime host question[${index}].questions.${key}`)]))
		};
	}).sort((left, right) => left.cardId.localeCompare(right.cardId));
	if (profiles.length !== 5 || new Set(profiles.map(({ id }) => id)).size !== profiles.length || canonical$1(profiles.map(({ id }) => id)) !== canonical$1([...PROFILE_IDS].sort()) || new Set(questions.map(({ cardId }) => cardId)).size !== questions.length) throw new TypeError("projectile runtime host plan is incomplete or duplicated");
	return freeze$1({
		bytes: plan.configuration,
		configuration,
		profiles,
		questions
	});
}
function checkedSourceCard(value, label) {
	const card = exact$2(value, SOURCE_CARD_KEYS, label);
	text(card.id, `${label}.id`);
	text(card.displayName, `${label}.displayName`);
	for (const field of [
		"cost",
		"count",
		"damage",
		"deployTimeTicks",
		"firstHitTicks",
		"hitSpeedTicks",
		"hitpoints",
		"movementMillitilesPerSecond",
		"rangeMillitiles",
		"sightRangeMillitiles"
	]) integer$1(card[field], 0, Number.MAX_SAFE_INTEGER, `${label}.${field}`);
	if (card.kind !== "unit") throw new TypeError(`${label}.kind must be unit`);
	text(card.rarity, `${label}.rarity`);
	text(card.targetMode, `${label}.targetMode`);
	if (card.areaDamageRadiusMillitiles !== null) integer$1(card.areaDamageRadiusMillitiles, 0, Number.MAX_SAFE_INTEGER, `${label}.areaDamageRadiusMillitiles`);
	dense(card.components, 16, `${label}.components`).forEach((component, index) => {
		const checked = exact$2(component, SOURCE_COMPONENT_KEYS, `${label}.components[${index}]`);
		text(checked.id, `${label}.components[${index}].id`);
		text(checked.displayName, `${label}.components[${index}].displayName`);
		for (const field of [
			"count",
			"damage",
			"deployTimeTicks",
			"firstHitTicks",
			"hitSpeedTicks",
			"hitpoints",
			"movementMillitilesPerSecond",
			"rangeMillitiles",
			"sightRangeMillitiles"
		]) integer$1(checked[field], 0, Number.MAX_SAFE_INTEGER, `${label}.components[${index}].${field}`);
		if (checked.kind !== "unit") throw new TypeError(`${label}.components[${index}].kind must be unit`);
		text(checked.role, `${label}.components[${index}].role`);
		text(checked.targetMode, `${label}.components[${index}].targetMode`);
		if (checked.areaDamageRadiusMillitiles !== null) integer$1(checked.areaDamageRadiusMillitiles, 0, Number.MAX_SAFE_INTEGER, `${label}.components[${index}].areaDamageRadiusMillitiles`);
	});
	return card;
}
function privatePlanFromReceipt(serialized) {
	assertSessionTroopProjectileAuthorityReceipt(serialized);
	let manifest;
	try {
		manifest = JSON.parse(serialized);
	} catch {
		throw new TypeError("projectile runtime authority receipt is invalid");
	}
	return {
		configuration: serialized,
		profiles: manifest.profiles.map((profile) => ({
			claimFamily: profile.claims[0].claimFamily,
			id: profile.id,
			questions: clone$1(profile.claims[0].questions),
			sourceCard: clone$1(profile.sourceCard)
		})),
		questions: manifest.unresolvedDeliveryDependencies.flatMap((dependency) => {
			const dependencyQuestions = Object.fromEntries(Object.entries(dependency.questions).map(([key, record]) => {
				const { key: _questionKey, ...withoutKey } = record;
				return [key, withoutKey];
			}));
			const base = {
				claimFamily: dependency.claimFamily,
				questions: dependencyQuestions
			};
			return [{
				cardId: dependency.id,
				...base
			}, ...dependency.component === null || dependency.component === void 0 ? [] : [{
				cardId: dependency.component.id,
				...base
			}]];
		})
	};
}
function admitPlanFromReceipt(serialized) {
	const plan = freeze$1(clone$1(exact$2(privatePlanFromReceipt(serialized), [
		"configuration",
		"profiles",
		"questions"
	], "projectile runtime admitted plan")));
	internalProjectilePlans.add(plan);
	checkedPlan(plan);
	return plan;
}
function checkedSource(value, index) {
	const source = exact$2(value, HOST_SOURCE_KEYS, `projectile runtime source[${index}]`);
	if (!(source.delivery === "projectile" || source.projectileSpeed === null)) throw new TypeError(`projectile runtime source[${index}] delivery is invalid`);
	return {
		cardId: text(source.cardId, `projectile runtime source[${index}].cardId`),
		damage: integer$1(source.damage, 0, Number.MAX_SAFE_INTEGER, `projectile runtime source[${index}].damage`),
		delivery: text(source.delivery, `projectile runtime source[${index}].delivery`),
		layer: text(source.layer, `projectile runtime source[${index}].layer`),
		maxHealth: integer$1(source.maxHealth, 1, Number.MAX_SAFE_INTEGER, `projectile runtime source[${index}].maxHealth`),
		projectileSpeed: source.projectileSpeed === null ? null : integer$1(source.projectileSpeed, 1, Number.MAX_SAFE_INTEGER, `projectile runtime source[${index}].projectileSpeed`),
		rangeMillitiles: integer$1(source.rangeMillitiles, 0, Number.MAX_SAFE_INTEGER, `projectile runtime source[${index}].rangeMillitiles`),
		sightRangeMillitiles: integer$1(source.sightRangeMillitiles, 0, Number.MAX_SAFE_INTEGER, `projectile runtime source[${index}].sightRangeMillitiles`),
		side: text(source.side, `projectile runtime source[${index}].side`),
		sourceId: integer$1(source.sourceId, 1, Number.MAX_SAFE_INTEGER, `projectile runtime source[${index}].sourceId`),
		targetMode: text(source.targetMode, `projectile runtime source[${index}].targetMode`)
	};
}
function eventPriority(event) {
	return EVENT_ORDER.get(event.type) ?? 99;
}
function eventIdentity(event, label) {
	if (event.projectileIdentity !== void 0) {
		if (event.projectileIdentity?.direction === "tower-to-unit") return null;
		return checkedIdentity(event.projectileIdentity, `${label}.projectileIdentity`);
	}
	if (event.projectile !== void 0 && event.projectile?.projectileIdentity !== void 0) {
		if (event.projectile.projectileIdentity?.direction === "tower-to-unit") return null;
		return checkedIdentity(event.projectile.projectileIdentity, `${label}.projectile.projectileIdentity`);
	}
	return null;
}
function checkedEvent(value, index) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`projectile runtime event[${index}] must be an object`);
	const type = value.type;
	if (!EVENT_TYPES.has(type)) return null;
	if (!Number.isSafeInteger(value.tick) || value.tick < 0) throw new TypeError(`projectile runtime event[${index}].tick is invalid`);
	const identity = eventIdentity(value, `projectile runtime event[${index}]`);
	if (identity === null) return null;
	const nestedTargetId = value.projectile !== void 0 && value.projectile !== null && Number.isSafeInteger(value.projectile.targetId) ? value.projectile.targetId : null;
	return {
		identity,
		status: typeof value.status === "string" ? value.status : null,
		targetId: Number.isSafeInteger(value.targetId) ? value.targetId : nestedTargetId,
		tick: value.tick,
		type
	};
}
function questionKeys(profile) {
	return Object.keys(profile.questions).sort();
}
function questionWitness(profile, sourceId, targetId, tick, reason) {
	return {
		cardId: profile.id,
		claimFamily: profile.claimFamily,
		disposition: "question",
		questions: questionKeys(profile).map((key) => ({
			...clone$1(profile.questions[key]),
			key
		})),
		reason,
		sourceId,
		targetId,
		tick,
		type: "projectile-runtime-question"
	};
}
function checkedMechanicCommand(value) {
	const command = exact$2(value, MECHANIC_COMMAND_KEYS, "projectile mechanic command");
	if (command.type !== "projectile-mechanic") throw new TypeError("projectile mechanic command.type is invalid");
	return {
		cardId: text(command.cardId, "projectile mechanic command.cardId"),
		sourceId: integer$1(command.sourceId, 1, Number.MAX_SAFE_INTEGER, "projectile mechanic command.sourceId"),
		targetId: command.targetId === null ? null : integer$1(command.targetId, 1, Number.MAX_SAFE_INTEGER, "projectile mechanic command.targetId"),
		tick: integer$1(command.tick, 0, Number.MAX_SAFE_INTEGER, "projectile mechanic command.tick"),
		type: "projectile-mechanic"
	};
}
function checkedPending(value, index) {
	const pending = exact$2(value, [
		"cardId",
		"claimFamily",
		"identity",
		"launchTick",
		"targetId"
	], `projectile runtime pending[${index}]`);
	const identity = checkedIdentity(pending.identity, `projectile runtime pending[${index}].identity`);
	return {
		cardId: text(pending.cardId, `projectile runtime pending[${index}].cardId`),
		claimFamily: text(pending.claimFamily, `projectile runtime pending[${index}].claimFamily`),
		identity,
		launchTick: integer$1(pending.launchTick, 0, Number.MAX_SAFE_INTEGER, `projectile runtime pending[${index}].launchTick`),
		targetId: integer$1(pending.targetId, 1, Number.MAX_SAFE_INTEGER, `projectile runtime pending[${index}].targetId`)
	};
}
function checkedHistory(value, index) {
	const entry = exact$2(value, [
		"cardId",
		"claimFamily",
		"disposition",
		"identity",
		"reason",
		"status",
		"targetId",
		"tick",
		"type"
	], `projectile runtime history[${index}]`);
	const identity = checkedIdentity(entry.identity, `projectile runtime history[${index}].identity`);
	if (![
		"projectile-runtime-contact",
		"projectile-runtime-launch",
		"projectile-runtime-question"
	].includes(entry.type)) throw new TypeError(`projectile runtime history[${index}].type is invalid`);
	if (![
		"contact",
		"launched",
		"question",
		"target_dead",
		"target_missing"
	].includes(entry.status)) throw new TypeError(`projectile runtime history[${index}].status is invalid`);
	if (entry.type === "projectile-runtime-launch" && entry.status !== "launched" || entry.type === "projectile-runtime-contact" && ![
		"contact",
		"target_dead",
		"target_missing"
	].includes(entry.status) || entry.type === "projectile-runtime-question" && entry.status !== "question") throw new TypeError(`projectile runtime history[${index}] type and status diverge`);
	if (!["sourced", "question"].includes(entry.disposition)) throw new TypeError(`projectile runtime history[${index}].disposition is invalid`);
	return {
		cardId: text(entry.cardId, `projectile runtime history[${index}].cardId`),
		claimFamily: text(entry.claimFamily, `projectile runtime history[${index}].claimFamily`),
		disposition: text(entry.disposition, `projectile runtime history[${index}].disposition`),
		identity,
		reason: entry.reason === null ? null : text(entry.reason, `projectile runtime history[${index}].reason`),
		status: entry.status,
		targetId: integer$1(entry.targetId, 1, Number.MAX_SAFE_INTEGER, `projectile runtime history[${index}].targetId`),
		tick: integer$1(entry.tick, 0, Number.MAX_SAFE_INTEGER, `projectile runtime history[${index}].tick`),
		type: entry.type
	};
}
function checkedSnapshot(value) {
	const snapshot = exact$2(value, RUNTIME_SNAPSHOT_KEYS, "projectile runtime snapshot");
	if (snapshot.version !== 1) throw new TypeError("projectile runtime snapshot version is unsupported");
	parseCanonical(snapshot.configuration, "projectile runtime snapshot.configuration");
	const pending = dense(snapshot.pending, SESSION_TROOP_PROJECTILE_RUNTIME_MAX_PENDING, "projectile runtime snapshot.pending").map(checkedPending);
	const history = dense(snapshot.history, SESSION_TROOP_PROJECTILE_RUNTIME_MAX_HISTORY, "projectile runtime snapshot.history").map(checkedHistory);
	const launches = /* @__PURE__ */ new Map();
	const contacts = /* @__PURE__ */ new Map();
	const questions = /* @__PURE__ */ new Map();
	const pendingIdentities = /* @__PURE__ */ new Set();
	for (const entry of history) {
		const key = identityKey(entry.identity);
		const records = entry.type === "projectile-runtime-launch" ? launches : entry.type === "projectile-runtime-contact" ? contacts : questions;
		if (records.has(key)) throw new TypeError("projectile runtime snapshot contains a duplicate projectile identity");
		records.set(key, entry);
		if (entry.type === "projectile-runtime-question" && launches.has(key) && !contacts.has(key)) throw new TypeError("projectile runtime snapshot question repeats a sourced identity");
	}
	for (const entry of pending) {
		const key = identityKey(entry.identity);
		if (pendingIdentities.has(key)) throw new TypeError("projectile runtime snapshot contains a duplicate pending identity");
		pendingIdentities.add(key);
		const launch = launches.get(key);
		if (launch === void 0 || contacts.has(key) || questions.has(key) || launch.cardId !== entry.cardId || launch.claimFamily !== entry.claimFamily || launch.targetId !== entry.targetId || launch.tick !== entry.launchTick) throw new TypeError("projectile runtime snapshot pending identity is not causally open");
	}
	for (const [key, entry] of contacts) {
		const launch = launches.get(key);
		if (launch === void 0 || entry.tick < launch.tick) throw new TypeError("projectile runtime snapshot contact has no causal launch");
	}
	for (const [key, entry] of questions) {
		if (entry.type !== "projectile-runtime-question") throw new TypeError("projectile runtime snapshot question type is invalid");
		const launch = launches.get(key);
		const contact = contacts.get(key);
		if (launch !== void 0 && contact === void 0) throw new TypeError("projectile runtime snapshot sourced question has no contact");
		if (launch !== void 0 && entry.tick < launch.tick || contact !== void 0 && entry.tick < contact.tick) throw new TypeError("projectile runtime snapshot question precedes its launch");
	}
	for (let index = 1; index < history.length; index += 1) if (history[index - 1].tick > history[index].tick) throw new TypeError("projectile runtime snapshot history is not causally ordered");
	return {
		configuration: { bytes: snapshot.configuration },
		history,
		pending
	};
}
function assertSnapshotPlan(configuration, snapshot) {
	const profiles = new Map(configuration.profiles.map((profile) => [profile.id, profile]));
	const questions = new Map(configuration.questions.map((question) => [question.cardId, question]));
	const byIdentity = /* @__PURE__ */ new Map();
	for (const entry of snapshot.history) {
		const key = identityKey(entry.identity);
		const records = byIdentity.get(key) ?? [];
		records.push(entry);
		byIdentity.set(key, records);
		const profile = profiles.get(entry.cardId);
		const dependency = questions.get(entry.cardId);
		if (entry.disposition === "sourced") {
			if (profile === void 0 || entry.claimFamily !== profile.claimFamily) throw new TypeError("projectile runtime snapshot sourced history is not in its host plan");
		} else if (dependency === void 0 && profile === void 0) throw new TypeError("projectile runtime snapshot QUESTION is not in its host plan");
		else if (profile !== void 0 && entry.claimFamily !== profile.claimFamily || dependency !== void 0 && entry.claimFamily !== dependency.claimFamily) throw new TypeError("projectile runtime snapshot history claim diverges from its host plan");
		if (entry.type === "projectile-runtime-question") {
			const expectedReason = profile === void 0 ? "projectile delivery remains an explicit QUESTION" : "projectile continuation requires unresolved authoritative facts";
			if (entry.disposition !== "question" || entry.reason !== expectedReason) throw new TypeError("projectile runtime snapshot QUESTION witness is invalid");
		} else if (entry.reason !== null || entry.disposition !== "sourced") throw new TypeError("projectile runtime snapshot sourced witness is invalid");
	}
	for (const [key, records] of byIdentity) {
		const cardIds = new Set(records.map(({ cardId }) => cardId));
		const claimFamilies = new Set(records.map(({ claimFamily }) => claimFamily));
		const targetIds = new Set(records.map(({ targetId }) => targetId));
		if (cardIds.size !== 1 || claimFamilies.size !== 1 || targetIds.size !== 1) throw new TypeError("projectile runtime snapshot identity lineage diverges");
		const launch = records.find(({ type }) => type === "projectile-runtime-launch");
		const contact = records.find(({ type }) => type === "projectile-runtime-contact");
		const question = records.find(({ type }) => type === "projectile-runtime-question");
		if (records.length > 1 && launch === void 0 && records.some(({ disposition }) => disposition === "sourced")) throw new TypeError("projectile runtime snapshot sourced lineage has no launch");
		if (question !== void 0 && profiles.has(question.cardId) && contact === void 0) throw new TypeError("projectile runtime snapshot sourced QUESTION has no contact");
		if (launch !== void 0 && contact !== void 0 && contact.tick < launch.tick || contact !== void 0 && question !== void 0 && question.tick < contact.tick) throw new TypeError("projectile runtime snapshot lineage ticks are not causal");
		if (launch !== void 0 && launch.identity.projectileId !== records[0].identity.projectileId) throw new TypeError("projectile runtime snapshot identity lineage is malformed");
	}
	for (const pending of snapshot.pending) {
		const profile = profiles.get(pending.cardId);
		if (profile === void 0 || pending.claimFamily !== profile.claimFamily) throw new TypeError("projectile runtime snapshot pending source is not in its host plan");
	}
}
function checkedRoster(value) {
	const roster = dense(value, 8, "projectile runtime roster");
	const ids = /* @__PURE__ */ new Set();
	return roster.map((card, index) => {
		const checked = exact$2(card, ROSTER_CARD_KEYS, `projectile runtime roster[${index}]`);
		if (ids.has(checked.id)) throw new TypeError("projectile runtime roster IDs must be unique");
		ids.add(checked.id);
		return checked;
	});
}
function assertLiveSource(profile, source, label) {
	const expected = profile.sourceCard;
	if (source.cardId !== profile.id || source.delivery !== "projectile" || source.damage !== expected.damage || source.maxHealth !== expected.hitpoints || source.rangeMillitiles !== expected.rangeMillitiles || source.sightRangeMillitiles !== expected.sightRangeMillitiles || source.targetMode !== (expected.targetMode === "ground-and-air" ? "air_and_ground" : expected.targetMode)) throw new TypeError(`${label} diverges from the admitted projectile source receipt`);
}
function cloneQuestionResult(value) {
	return freeze$1(clone$1(value));
}
function parseAuthorityEnvelope(serialized) {
	if (typeof serialized !== "string") return void 0;
	try {
		return JSON.parse(serialized);
	} catch {
		return;
	}
}
function admitSessionTroopProjectileRuntimeProfiles(serialized) {
	assertSessionTroopProjectileAuthorityReceipt(serialized);
	return serialized;
}
function admitSessionTroopProjectileRuntimeFromSetup(serializedSetup) {
	const setup = parseAuthorityEnvelope(serializedSetup);
	if (setup === null || typeof setup !== "object" || Array.isArray(setup) || !Object.hasOwn(setup, "projectileRuntimeProfiles")) return void 0;
	return admitSessionTroopProjectileRuntimeProfiles(setup.projectileRuntimeProfiles);
}
function admitSessionTroopProjectileRuntimeFromGameSnapshot(serializedSnapshot) {
	const snapshot = parseAuthorityEnvelope(serializedSnapshot);
	if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot) || !Object.hasOwn(snapshot, "setup")) return void 0;
	return admitSessionTroopProjectileRuntimeFromSetup(canonical$1(snapshot.setup));
}
function admitSessionTroopProjectileRuntimeFromBattleSnapshot(serializedSnapshot) {
	const snapshot = parseAuthorityEnvelope(serializedSnapshot);
	if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot) || !Object.hasOwn(snapshot, "projectileRuntime")) return void 0;
	let runtime;
	try {
		runtime = JSON.parse(snapshot.projectileRuntime);
	} catch {
		throw new TypeError("live battle projectile runtime witness is invalid");
	}
	if (runtime === null || typeof runtime !== "object" || Array.isArray(runtime)) throw new TypeError("live battle projectile runtime witness is invalid");
	return admitSessionTroopProjectileRuntimeProfiles(runtime.configuration);
}
var SESSION_TROOP_PROJECTILE_RUNTIME_MAX_PENDING, SESSION_TROOP_PROJECTILE_RUNTIME_MAX_HISTORY, SESSION_TROOP_PROJECTILE_RUNTIME_MAX_BYTES, PROFILE_IDS, CLAIM_FAMILIES, SOURCE_CARD_KEYS, SOURCE_COMPONENT_KEYS, ROSTER_CARD_KEYS, RUNTIME_SNAPSHOT_KEYS, MECHANIC_COMMAND_KEYS, HOST_SOURCE_KEYS, PROJECTILE_IDENTITY_KEYS, PROJECTILE_DIRECTIONS, EVENT_TYPES, EVENT_ORDER, internalProjectilePlans, SessionTroopProjectileRuntime;
function init_session_troop_projectile_runtime() {
	return (init_session_troop_projectile_runtime = __esmMin((() => {
		init_session_troop_projectile_authority();
		SESSION_TROOP_PROJECTILE_RUNTIME_MAX_PENDING = 1024;
		SESSION_TROOP_PROJECTILE_RUNTIME_MAX_HISTORY = 4096;
		SESSION_TROOP_PROJECTILE_RUNTIME_MAX_BYTES = 262144;
		PROFILE_IDS = /* @__PURE__ */ new Set([
			"aegis-sage",
			"prism-warden",
			"rune-reaver",
			"scatterguard",
			"stormkite"
		]);
		CLAIM_FAMILIES = /* @__PURE__ */ new Set([
			"chain",
			"ordinary-component-projectile",
			"ordinary-single-projectile",
			"pierce",
			"return",
			"pellets",
			"reflection"
		]);
		SOURCE_CARD_KEYS = [
			"areaDamageRadiusMillitiles",
			"components",
			"cost",
			"count",
			"damage",
			"deployTimeTicks",
			"displayName",
			"firstHitTicks",
			"hitSpeedTicks",
			"hitpoints",
			"id",
			"kind",
			"movementMillitilesPerSecond",
			"rangeMillitiles",
			"rarity",
			"sightRangeMillitiles",
			"targetMode"
		];
		SOURCE_COMPONENT_KEYS = [
			"areaDamageRadiusMillitiles",
			"count",
			"damage",
			"deployTimeTicks",
			"displayName",
			"firstHitTicks",
			"hitSpeedTicks",
			"hitpoints",
			"id",
			"kind",
			"movementMillitilesPerSecond",
			"rangeMillitiles",
			"role",
			"sightRangeMillitiles",
			"targetMode"
		];
		ROSTER_CARD_KEYS = [
			"areaDamageRadiusMillitiles",
			"cost",
			"count",
			"damage",
			"deployTimeTicks",
			"displayName",
			"entities",
			"firstHitTicks",
			"formation",
			"hitSpeedTicks",
			"hitpoints",
			"id",
			"kind",
			"movementMillitilesPerSecond",
			"rangeMillitiles",
			"rarity",
			"sightRangeMillitiles",
			"targetMode"
		];
		RUNTIME_SNAPSHOT_KEYS = [
			"configuration",
			"history",
			"pending",
			"version"
		];
		MECHANIC_COMMAND_KEYS = [
			"cardId",
			"sourceId",
			"targetId",
			"tick",
			"type"
		];
		HOST_SOURCE_KEYS = [
			"cardId",
			"damage",
			"delivery",
			"layer",
			"maxHealth",
			"projectileSpeed",
			"rangeMillitiles",
			"sightRangeMillitiles",
			"side",
			"sourceId",
			"targetMode"
		];
		PROJECTILE_IDENTITY_KEYS = [
			"attackSequence",
			"direction",
			"projectileId",
			"sourceId"
		];
		PROJECTILE_DIRECTIONS = /* @__PURE__ */ new Set(["unit-to-tower", "unit-to-unit"]);
		EVENT_TYPES = /* @__PURE__ */ new Set([
			"projectile-impact",
			"projectile-launch",
			"damage",
			"death"
		]);
		EVENT_ORDER = /* @__PURE__ */ new Map([
			["projectile-launch", 0],
			["projectile-impact", 1],
			["damage", 2],
			["death", 3]
		]);
		internalProjectilePlans = /* @__PURE__ */ new WeakSet();
		SessionTroopProjectileRuntime = class SessionTroopProjectileRuntime {
			#plan;
			#configuration;
			#history = [];
			#pending = [];
			constructor(configuration) {
				this.#plan = configuration;
				this.#configuration = checkedPlan(configuration);
			}
			static fromReceipt(serialized) {
				return new SessionTroopProjectileRuntime(admitPlanFromReceipt(serialized));
			}
			get configuration() {
				return this.#configuration.bytes;
			}
			get hasProfiles() {
				return this.#configuration.profiles.length > 0;
			}
			get state() {
				return freeze$1({
					configuration: this.configuration,
					history: clone$1(this.#history),
					pending: clone$1(this.#pending),
					version: 1
				});
			}
			profile(cardId) {
				if (typeof cardId !== "string") throw new TypeError("projectile profile card ID must be primitive");
				const profile = this.#configuration.profiles.find((candidate) => candidate.id === cardId);
				return profile === void 0 ? null : freeze$1(clone$1(profile));
			}
			question(cardId) {
				if (typeof cardId !== "string") throw new TypeError("projectile question card ID must be primitive");
				const dependency = this.#configuration.questions.find(({ cardId: dependencyCardId }) => dependencyCardId === cardId);
				return dependency === void 0 ? null : freeze$1(clone$1(dependency));
			}
			assertSourceRoster(value) {
				const roster = checkedRoster(value);
				const byId = new Map(roster.map((card) => [card.id, card]));
				for (const profile of this.#configuration.profiles) {
					const card = byId.get(profile.id);
					if (card === void 0) continue;
					if (canonical$1(rosterSourceCard(card, `projectile roster ${profile.id}`)) !== canonical$1(profile.sourceCard)) throw new TypeError(`projectile source roster ${profile.id} diverges from its receipt`);
				}
				return true;
			}
			inspectMechanic(value, sources = []) {
				const command = checkedMechanicCommand(value);
				const profile = this.profile(command.cardId);
				if (profile === null) {
					const question = this.question(command.cardId);
					if (question !== null) return cloneQuestionResult({
						cardId: command.cardId,
						claimFamily: question.claimFamily,
						disposition: "question",
						questions: Object.entries(question.questions).map(([key, record]) => ({
							...clone$1(record),
							key
						})),
						reason: "projectile delivery remains an explicit QUESTION",
						sourceId: command.sourceId,
						targetId: command.targetId,
						tick: command.tick,
						type: "projectile-runtime-question"
					});
					throw new RangeError("projectile mechanic card is not admitted by the profile receipt");
				}
				const source = dense(sources, 8, "projectile mechanic sources").map(checkedSource).find(({ sourceId }) => sourceId === command.sourceId);
				if (source === void 0) throw new RangeError("projectile mechanic source is not live");
				assertLiveSource(profile, source, "projectile mechanic source");
				return cloneQuestionResult(questionWitness(profile, command.sourceId, command.targetId, command.tick, "projectile continuation requires unresolved authoritative facts"));
			}
			scheduleMechanic(value, sources = []) {
				const result = this.inspectMechanic(value, sources);
				if (result.disposition === "question") throw new RangeError(`${result.cardId} projectile ${result.claimFamily} remains an explicit QUESTION`);
				return result;
			}
			step(value) {
				const candidate = this.fork();
				const events = candidate.#reduce(value);
				this.#history = candidate.#history;
				this.#pending = candidate.#pending;
				return freeze$1(clone$1(events));
			}
			#reduce(value) {
				const input = exact$2(value, [
					"events",
					"sources",
					"tick"
				], "projectile runtime boundary");
				const tick = integer$1(input.tick, 0, Number.MAX_SAFE_INTEGER, "projectile runtime boundary.tick");
				const sources = dense(input.sources, 8, "projectile runtime boundary.sources").map(checkedSource);
				const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
				const events = dense(input.events, 4096, "projectile runtime boundary.events").map(checkedEvent).filter((event) => event !== null).sort((left, right) => eventPriority(left) - eventPriority(right) || left.identity.projectileId - right.identity.projectileId || left.identity.sourceId - right.identity.sourceId);
				if (this.#history.at(-1)?.tick > tick) throw new RangeError("projectile runtime boundary tick is stale");
				const profiles = new Map(this.#configuration.profiles.map((profile) => [profile.id, profile]));
				const seen = /* @__PURE__ */ new Set([...this.#pending.map(({ identity }) => identityKey(identity)), ...this.#history.map(({ identity }) => identityKey(identity))]);
				const output = [];
				for (const event of events) {
					const source = sourceById.get(event.identity.sourceId);
					if (source === void 0) continue;
					const profile = profiles.get(source.cardId);
					if (profile === void 0) {
						const unresolved = this.question(source.cardId);
						if (unresolved !== null && event.type === "projectile-launch") {
							const receipt = {
								...questionWitness({
									claimFamily: unresolved.claimFamily,
									id: source.cardId,
									questions: Object.fromEntries(Object.entries(unresolved.questions).map(([key, record]) => [key, checkedQuestionRecord(record, key, `projectile ${source.cardId}.${key}`)]))
								}, source.sourceId, event.targetId, tick, "projectile delivery remains an explicit QUESTION"),
								identity: clone$1(event.identity)
							};
							output.push(receipt);
							seen.add(identityKey(event.identity));
							this.#appendHistory({
								cardId: source.cardId,
								claimFamily: receipt.claimFamily,
								disposition: "question",
								identity: clone$1(event.identity),
								reason: receipt.reason,
								status: "question",
								targetId: event.targetId ?? 1,
								tick,
								type: "projectile-runtime-question"
							});
						}
						continue;
					}
					assertLiveSource(profile, source, `projectile runtime source ${source.sourceId}`);
					const key = identityKey(event.identity);
					if (event.type === "projectile-launch") {
						if (seen.has(key)) throw new RangeError("projectile runtime launch identity is duplicate");
						seen.add(key);
						const targetId = event.targetId;
						if (targetId === null || targetId < 1) throw new RangeError("projectile runtime launch target is not causal");
						this.#pending.push({
							cardId: profile.id,
							claimFamily: profile.claimFamily,
							identity: clone$1(event.identity),
							launchTick: tick,
							targetId
						});
						this.#appendHistory({
							cardId: profile.id,
							claimFamily: profile.claimFamily,
							disposition: "sourced",
							identity: clone$1(event.identity),
							reason: null,
							status: "launched",
							targetId,
							tick,
							type: "projectile-runtime-launch"
						});
						output.push({
							cardId: profile.id,
							claimFamily: profile.claimFamily,
							disposition: "sourced",
							identity: clone$1(event.identity),
							sourceId: event.identity.sourceId,
							targetId,
							tick,
							type: "projectile-runtime-receipt"
						});
					} else if (event.type === "projectile-impact") {
						const pendingIndex = this.#pending.findIndex(({ identity }) => identityKey(identity) === key);
						if (pendingIndex === -1) {
							if (seen.has(key)) throw new RangeError("projectile runtime contact identity is duplicate or terminal");
							throw new RangeError("projectile runtime contact has no causal launch");
						}
						const pending = this.#pending[pendingIndex];
						this.#pending.splice(pendingIndex, 1);
						const status = [
							"contact",
							"target_dead",
							"target_missing"
						].includes(event.status ?? "") ? event.status : "target_missing";
						this.#appendHistory({
							cardId: profile.id,
							claimFamily: profile.claimFamily,
							disposition: "sourced",
							identity: clone$1(event.identity),
							reason: null,
							status: status === "contact" ? "contact" : status,
							targetId: event.targetId ?? pending.targetId,
							tick,
							type: "projectile-runtime-contact"
						});
						output.push({
							cardId: profile.id,
							claimFamily: profile.claimFamily,
							disposition: "sourced",
							identity: clone$1(event.identity),
							sourceId: event.identity.sourceId,
							status,
							targetId: event.targetId ?? pending.targetId,
							tick,
							type: "projectile-runtime-receipt"
						});
						output.push({
							...questionWitness(profile, event.identity.sourceId, event.targetId ?? pending.targetId, tick, "projectile continuation requires unresolved authoritative facts"),
							identity: clone$1(event.identity)
						});
						this.#appendHistory({
							cardId: profile.id,
							claimFamily: profile.claimFamily,
							disposition: "question",
							identity: clone$1(event.identity),
							reason: "projectile continuation requires unresolved authoritative facts",
							status: "question",
							targetId: event.targetId ?? pending.targetId,
							tick,
							type: "projectile-runtime-question"
						});
					}
				}
				if (this.#pending.length > 1024) throw new RangeError("projectile runtime pending bound exceeded");
				return output;
			}
			#appendHistory(entry) {
				if (this.#history.length >= 4096) throw new RangeError("projectile runtime history bound exceeded");
				this.#history.push(entry);
			}
			serialize() {
				const serialized = canonical$1({
					configuration: this.configuration,
					history: this.#history,
					pending: this.#pending,
					version: 1
				});
				if (new TextEncoder().encode(serialized).byteLength > 262144) throw new RangeError("serialized projectile runtime exceeds its byte bound");
				return serialized;
			}
			static restore(serialized, configuration) {
				const checked = checkedSnapshot(parseCanonical(serialized, "serialized projectile runtime"));
				const plan = typeof configuration === "string" ? admitPlanFromReceipt(configuration) : configuration;
				const restored = new SessionTroopProjectileRuntime(plan);
				assertSnapshotPlan(restored.#configuration, checked);
				if (restored.configuration !== checked.configuration.bytes) throw new TypeError("projectile runtime snapshot configuration diverges from its host plan");
				restored.#history = checked.history.map(clone$1);
				restored.#pending = checked.pending.map(clone$1);
				if (restored.serialize() !== serialized) throw new TypeError("projectile runtime snapshot is not canonical or causal");
				return restored;
			}
			fork() {
				const candidate = new SessionTroopProjectileRuntime(this.#plan);
				candidate.#history = clone$1(this.#history);
				candidate.#pending = clone$1(this.#pending);
				return candidate;
			}
		};
	})))();
}
//#endregion
//#region src/sim/spell-intent-runtime.js
function canonical(value) {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function clone(value) {
	return structuredClone(value);
}
function freeze(value) {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) freeze(child);
		Object.freeze(value);
	}
	return value;
}
function exact$1(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain string-keyed data object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors).sort();
	const expected = [...keys].sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} has an invalid shape`);
	for (const key of keys) if (!descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function checkedPoint(value, label) {
	const point = exact$1(value, ["x", "y"], label);
	if (!Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y)) throw new TypeError(`${label} must contain safe integer coordinates`);
	return {
		x: point.x,
		y: point.y
	};
}
function checkedTarget(value, label) {
	const target = exact$1(value, ["id", "kind"], label);
	if (target.kind === "unit" && Number.isSafeInteger(target.id) && target.id > 0) return {
		id: target.id,
		kind: target.kind
	};
	throw new TypeError(`${label} must name one shared unit; crown-tower modifiers are QUESTION`);
}
function checkedCommand(value, currentTick, version) {
	const command = exact$1(value, version === 1 ? [
		"cardId",
		"point",
		"sequence",
		"side",
		"target",
		"tick"
	] : [
		"cardId",
		"point",
		"sequence",
		"side",
		"tick"
	], "live spell command");
	if (command.cardId !== "squall-orb" || !["north", "south"].includes(command.side) || !Number.isSafeInteger(command.sequence) || command.sequence < 0 || !Number.isSafeInteger(command.tick) || command.tick !== currentTick) throw new TypeError("live spell command is invalid");
	const checked = {
		cardId: command.cardId,
		point: checkedPoint(command.point, "live spell command.point"),
		sequence: command.sequence,
		side: command.side,
		tick: command.tick
	};
	if (version === 1) checked.target = checkedTarget(command.target, "live spell command.target");
	return checked;
}
/**
* Accept only an exact content-produced receipt. This is intentionally not a
* broad profile language: admitting arbitrary action values would turn a
* source-honest authority seam into an unsupported spell roster.
*/
function parseSpellIntentProfileReceipts(value) {
	exact$1(value, [
		"exclusions",
		"profiles",
		"version"
	], "live spell profile receipts");
	const expected = value.version === 1 ? CANONICAL_RECEIPTS : value.version === 2 ? CANONICAL_RADIUS_RECEIPTS : null;
	if (expected === null || canonical(value) !== canonical(expected)) throw new TypeError("live spell profile receipts are not the exact sourced receipt");
	return freeze(clone(expected));
}
/**
* A profile-boundary refusal record, not a zero-effect fallback. LiveBattle
* attaches this only after its own admitted roster identifies the card as an
* effect and finds no exact executable profile for that identity.
*/
function getUnprofiledAdmittedEffectProfileQuestion(cardId) {
	if (typeof cardId !== "string" || cardId.length === 0 || cardId.length > 128) throw new TypeError("unprofiled admitted effect card ID must be a bounded primitive string");
	return freeze({
		cardId,
		...clone(UNPROFILED_ADMITTED_EFFECT_QUESTION)
	});
}
function createSpellIntentRuntime(receipts) {
	return new SpellIntentRuntime(receipts);
}
var MAX_ACTIONS, MAX_EFFECT_ID, PROFILE_ID, RADIUS_PROFILE_ID, UNPROFILED_ADMITTED_EFFECT_QUESTION, CANONICAL_RECEIPTS, CANONICAL_RADIUS_RECEIPTS, SpellIntentRuntime;
function init_spell_intent_runtime() {
	return (init_spell_intent_runtime = __esmMin((() => {
		MAX_ACTIONS = 1024;
		MAX_EFFECT_ID = Number.MAX_SAFE_INTEGER - 1;
		PROFILE_ID = "isolated-sourced-instant-v1";
		RADIUS_PROFILE_ID = "squall-orb-radius-v2";
		UNPROFILED_ADMITTED_EFFECT_QUESTION = Object.freeze({
			disposition: "question",
			id: "admitted-effect-without-exact-executable-profile",
			profileId: PROFILE_ID,
			reason: "an admitted effect without an exact sourced executable profile remains QUESTION and cannot be staged",
			status: "question"
		});
		CANONICAL_RECEIPTS = Object.freeze({
			exclusions: Object.freeze([
				Object.freeze({
					id: "squall-orb-radius-target-knockback-travel-return",
					reason: "all radius, target-policy, knockback, travel, return, and four-facade composition fields remain QUESTION"
				}),
				Object.freeze({
					id: "squall-orb-crown-tower-damage-modifier",
					reason: "crown-tower damage ratio and rounding remain QUESTION, so crown-tower targets are disabled"
				}),
				Object.freeze({
					id: "periodic",
					reason: "cadence, duration, damage, radius, and target composition remain QUESTION"
				}),
				Object.freeze({
					id: "spawn",
					reason: "spawn identities lack sourced kind/cost/deploy admission and all spawn mechanics remain QUESTION"
				}),
				Object.freeze({
					id: "status",
					reason: "status duration, multiplier, target, refresh, and expiry mechanics remain QUESTION"
				}),
				Object.freeze({
					id: "traveling",
					reason: "travel timing, geometry, damage, target, and return mechanics remain QUESTION"
				})
			]),
			profiles: Object.freeze([Object.freeze({
				claims: Object.freeze([
					"cardId",
					"kind",
					"cost",
					"count",
					"damage"
				]),
				fact: Object.freeze({
					cardId: "squall-orb",
					count: 1,
					cost: 4,
					damage: 689,
					kind: "effect",
					sourceExport: "createInstantSpellCatalog"
				}),
				mode: "isolated-direct-command-target-damage-not-card-composition",
				profileId: PROFILE_ID
			})]),
			version: 1
		});
		CANONICAL_RADIUS_RECEIPTS = Object.freeze({
			exclusions: Object.freeze([
				Object.freeze({
					id: "squall-orb-travel-and-knockback",
					reason: "one-tile Fireball pushback is publisher-corroborated; target eligibility and event ordering remain QUESTION, while activation and travel remain unresolved"
				}),
				Object.freeze({
					id: "periodic",
					reason: "cadence, duration, damage, radius, and target composition remain QUESTION"
				}),
				Object.freeze({
					id: "spawn",
					reason: "spawn identities lack sourced kind/cost/deploy admission and all spawn mechanics remain QUESTION"
				}),
				Object.freeze({
					id: "status",
					reason: "status duration, multiplier, target, refresh, and expiry mechanics remain QUESTION"
				}),
				Object.freeze({
					id: "other-traveling",
					reason: "travel timing, geometry, damage, target, and return mechanics remain QUESTION"
				})
			]),
			profiles: Object.freeze([Object.freeze({
				claims: Object.freeze([
					"cardId",
					"kind",
					"cost",
					"count",
					"damage",
					"areaDamageRadiusMillitiles",
					"targetMode",
					"crownTowerDamagePercent",
					"impactDelayTicks"
				]),
				fact: Object.freeze({
					cardId: "squall-orb",
					count: 1,
					cost: 4,
					damage: 689,
					kind: "effect",
					sourceExport: "createInstantSpellCatalog",
					areaDamageRadiusMillitiles: 2500,
					crownTowerDamagePercent: -70,
					crownTowerRounding: "nearest-integer-half-up",
					impactDelayTicks: 2,
					targetMode: "ground-and-air"
				}),
				mode: "bounded-radius-center-cast-with-question-estimates",
				policies: Object.freeze({
					areaDamageRadiusMillitiles: Object.freeze({
						authoritative: false,
						confidence: "medium",
						disposition: "question",
						source: "pinned-historical-spell-datamine-estimate",
						value: 2500
					}),
					crownTowerDamagePercent: Object.freeze({
						authoritative: false,
						confidence: "medium",
						disposition: "question",
						source: "pinned-historical-projectile-datamine-estimate",
						value: -70
					}),
					crownTowerRounding: Object.freeze({
						authoritative: false,
						confidence: "unverified",
						disposition: "question",
						source: "runtime-damage-rounding-estimate",
						value: "nearest-integer-half-up"
					}),
					impactDelayTicks: Object.freeze({
						authoritative: false,
						confidence: "unverified",
						disposition: "question",
						source: "runtime-impact-delay-estimate",
						value: 2
					}),
					targetMode: Object.freeze({
						authoritative: false,
						confidence: "medium",
						disposition: "question",
						source: "pinned-historical-spell-datamine-estimate",
						value: "ground-and-air"
					})
				}),
				profileId: RADIUS_PROFILE_ID
			})]),
			version: 2
		});
		SpellIntentRuntime = class SpellIntentRuntime {
			#nextEffectId = 1;
			#pending = [];
			#receipts;
			constructor(receipts) {
				this.#receipts = parseSpellIntentProfileReceipts(receipts);
			}
			get state() {
				return freeze({
					nextEffectId: this.#nextEffectId,
					pending: clone(this.#pending),
					version: this.#receipts.version
				});
			}
			hasCard(cardId) {
				return cardId === this.#receipts.profiles[0].fact.cardId;
			}
			get profileVersion() {
				return this.#receipts.version;
			}
			hasPendingSequence(tick, sequence) {
				return this.#pending.some((entry) => entry.tick === tick && entry.sequence === sequence);
			}
			validate(command, currentTick) {
				const checked = checkedCommand(command, currentTick, this.#receipts.version);
				if (!this.hasCard(checked.cardId)) throw new RangeError("spell card has no sourced profile");
				return freeze(clone(checked));
			}
			schedule(command, currentTick, admit) {
				const checked = this.validate(command, currentTick);
				if (typeof admit !== "function" || !admit(freeze(clone(checked)))) throw new RangeError("live spell command is not admitted by the shared battle");
				if (this.#pending.length >= MAX_ACTIONS) throw new RangeError("live spell action bound exceeded");
				if (this.#nextEffectId > MAX_EFFECT_ID) throw new RangeError("live spell effect ID space is exhausted");
				if (this.hasPendingSequence(checked.tick, checked.sequence)) throw new RangeError("live spell tick/sequence is duplicate");
				const effectId = this.#nextEffectId;
				this.#nextEffectId += 1;
				const radiusProfile = this.#receipts.version === 2;
				const profileId = radiusProfile ? RADIUS_PROFILE_ID : PROFILE_ID;
				this.#pending.push(radiusProfile ? {
					...checked,
					effectId,
					impactTick: checked.tick + this.#receipts.profiles[0].fact.impactDelayTicks,
					profileId
				} : {
					...checked,
					effectId,
					profileId
				});
				this.#pending.sort((left, right) => left.tick - right.tick || left.sequence - right.sequence || left.effectId - right.effectId);
				return freeze({
					cardId: checked.cardId,
					effectId,
					point: clone(checked.point),
					profileId,
					sequence: checked.sequence,
					side: checked.side,
					...radiusProfile ? {} : { target: clone(checked.target) },
					tick: checked.tick,
					type: "spell-intent-scheduled"
				});
			}
			resolve(tick) {
				if (!Number.isSafeInteger(tick) || tick < 0) throw new TypeError("live spell resolve tick is invalid");
				const radiusProfile = this.#receipts.version === 2;
				const due = this.#pending.filter((entry) => (radiusProfile ? entry.impactTick : entry.tick) === tick);
				this.#pending = this.#pending.filter((entry) => (radiusProfile ? entry.impactTick : entry.tick) !== tick);
				const fact = this.#receipts.profiles[0].fact;
				return freeze(due.map((entry) => ({
					actionIndex: 0,
					cardId: entry.cardId,
					damage: fact.damage,
					effectId: entry.effectId,
					kind: radiusProfile ? "bounded-radius-center-damage" : "isolated-direct-target-damage",
					point: clone(entry.point),
					profileId: entry.profileId,
					sequence: entry.sequence,
					side: entry.side,
					...radiusProfile ? {
						areaDamageRadiusMillitiles: fact.areaDamageRadiusMillitiles,
						crownTowerDamagePercent: fact.crownTowerDamagePercent,
						crownTowerRounding: fact.crownTowerRounding,
						targetMode: fact.targetMode
					} : { target: clone(entry.target) },
					tick
				})));
			}
			fork() {
				const copy = new SpellIntentRuntime(this.#receipts);
				copy.#nextEffectId = this.#nextEffectId;
				copy.#pending = clone(this.#pending);
				return copy;
			}
		};
	})))();
}
//#endregion
//#region src/sim/game-side-deploy-core.js
/**
* Dependency-injected deployment seam shared by the public helper facade and
* the session ownership kernel. Keeping the authority identities as lexical
* inputs avoids an import cycle while preserving the exact prototype checks.
*/
function createStageSideDeployment({ DeckCycle, ElixirMatch, LiveBattle, SessionCardRuntime, evaluateDeployment, isAuthenticSessionCardRuntime }) {
	return function stageSideDeployment({ battle, cardCosts, command, deck, elixir, deploymentSequence, sessionCards }) {
		const hasSessionCards = isAuthenticSessionCardRuntime(sessionCards) && Object.getPrototypeOf(sessionCards) === SessionCardRuntime.prototype;
		if (Object.getPrototypeOf(battle) !== LiveBattle.prototype || Object.getPrototypeOf(deck) !== DeckCycle.prototype || Object.getPrototypeOf(elixir) !== ElixirMatch.prototype || !(cardCosts instanceof Map) || sessionCards !== void 0 && !hasSessionCards) throw new TypeError("side deployment requires exact session systems");
		const { cardId, commandId, destination = null, point, side, slot, target, tick } = command;
		if (!Number.isSafeInteger(commandId) || commandId < 0 || !Number.isSafeInteger(slot) || slot < 0 || slot > 3 || !Number.isSafeInteger(tick) || tick !== battle.state.tick || !["north", "south"].includes(side) || typeof cardId !== "string" || point === null || typeof point !== "object" || !Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y) || !Number.isSafeInteger(deploymentSequence) || deploymentSequence < 0) throw new TypeError("side deployment command is invalid or stale");
		if (destination !== null && (!destination || typeof destination !== "object" || !Number.isSafeInteger(destination.x) || !Number.isSafeInteger(destination.y))) throw new TypeError("side deployment destination is invalid");
		const cost = cardCosts.get(cardId);
		if (!Number.isSafeInteger(cost) || cost < 1 || cost > 10) throw new TypeError("side deployment card is not in the admitted roster");
		if (deck.state.hand[slot] !== cardId) throw new RangeError("side deployment card does not match its hand slot");
		const admittedCard = hasSessionCards ? sessionCards.card(cardId) : {
			kind: "unit",
			placementClass: "ground_entity"
		};
		const hasSourcedSpellProfile = admittedCard.kind === "effect" && battle.hasSpellProfile(cardId);
		const hasRadiusSpellProfile = hasSourcedSpellProfile && battle.hasRadiusSpellProfile(cardId);
		const effectQuestion = admittedCard.kind === "effect" ? battle.getSpellProfileQuestion(cardId) : null;
		if (effectQuestion !== null) throw new RangeError(`side deployment effect ${effectQuestion.cardId} remains an explicit QUESTION (${effectQuestion.id}): ${effectQuestion.reason}`);
		if (!hasSourcedSpellProfile && target !== void 0 || hasSourcedSpellProfile && (hasRadiusSpellProfile ? target !== void 0 : target === void 0)) throw new TypeError(hasRadiusSpellProfile ? "radius spell placement accepts a trusted center without a target" : "direct-target spell placement requires one sourced shared unit target");
		const placement = evaluateDeployment({
			destroyedOpposingLaneTowers: [],
			placementClass: admittedCard.placementClass,
			point,
			side
		});
		if (!placement.legal) throw new RangeError("side deployment is illegal: " + placement.reason);
		const spendSequence = elixir.scheduleSpend(tick, side, cost);
		const cycle = deck.play(cardId);
		if (!cycle.accepted || cycle.slot !== slot) throw new Error("prevalidated side deployment failed to cycle its deck");
		const route = hasSessionCards ? sessionCards.route(JSON.stringify(hasSourcedSpellProfile && !hasRadiusSpellProfile ? {
			cardId,
			commandId,
			point,
			sequence: deploymentSequence,
			side,
			target,
			tick
		} : {
			cardId,
			commandId,
			point,
			sequence: deploymentSequence,
			side,
			tick
		})) : null;
		const structureMaterializes = admittedCard.kind === "structure" && battle.supportsStructureRuntime(cardId);
		if (admittedCard.kind === "unit") battle.scheduleDeploy(JSON.stringify({
			cardId,
			point: {
				x: point.x,
				y: point.y
			},
			sequence: deploymentSequence,
			side,
			tick
		}));
		else if (structureMaterializes) battle.scheduleStructure(JSON.stringify({
			cardId,
			destination: destination === null ? null : {
				x: destination.x,
				y: destination.y
			},
			point: {
				x: point.x,
				y: point.y
			},
			sequence: deploymentSequence,
			side,
			tick
		}));
		else if (hasSourcedSpellProfile) {
			const spellIntent = battle.scheduleSpell({
				cardId,
				point: {
					x: point.x,
					y: point.y
				},
				sequence: deploymentSequence,
				side,
				...target === void 0 ? {} : { target: { ...target } },
				tick
			});
			const staged = {
				cardId,
				commandId,
				cost,
				cycle: Object.freeze(cycle),
				deploymentSequence,
				destination: null,
				kind: admittedCard.kind,
				point: Object.freeze({ ...point }),
				route,
				side,
				spendSequence,
				spellIntent,
				structureMaterializes,
				tick,
				type: "side-deployment-staged"
			};
			return Object.freeze(staged);
		}
		const legacy = {
			cardId,
			commandId,
			cost,
			cycle: Object.freeze(cycle),
			deploymentSequence,
			point: Object.freeze({ ...point }),
			side,
			spendSequence,
			tick,
			type: "side-deployment-staged"
		};
		if (!hasSessionCards) return Object.freeze(legacy);
		return Object.freeze({
			cardId,
			commandId,
			cost,
			cycle: Object.freeze(cycle),
			deploymentSequence,
			destination: destination === null ? null : Object.freeze({ ...destination }),
			kind: admittedCard.kind,
			point: Object.freeze({ ...point }),
			route,
			side,
			spendSequence,
			structureMaterializes,
			tick,
			type: "side-deployment-staged"
		});
	};
}
function init_game_side_deploy_core() {
	return (init_game_side_deploy_core = __esmMin((() => {})))();
}
//#endregion
//#region src/sim/tower-evidence-map.js
function exactObject(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(label + " must be a plain object");
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.some((key) => typeof key !== "string")) throw new TypeError(label + " must contain only string keys");
	const sorted = [...actual].sort();
	const wanted = [...keys].sort();
	if (sorted.length !== wanted.length || sorted.some((key, index) => key !== wanted[index])) throw new TypeError(label + " has an invalid shape");
	const result = {};
	for (const key of keys) {
		const descriptor = descriptors[key];
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(label + "." + key + " must be an enumerable data property");
		result[key] = descriptor.value;
	}
	return result;
}
function exactArray(value, label) {
	if (!Array.isArray(value)) throw new TypeError(label + " must be an array");
	const descriptors = Object.getOwnPropertyDescriptors(value);
	for (const key of Reflect.ownKeys(descriptors)) {
		if (key === "length") continue;
		if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) throw new TypeError(label + " must contain only indexed data");
		const descriptor = descriptors[key];
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(label + "[" + key + "] must be an enumerable data property");
	}
	return Array.from(value);
}
function deepFreeze(value) {
	if (value && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value)) deepFreeze(child);
	}
	return value;
}
function evidenceFromHitpoints(hitpoints) {
	const towers = MATCH_IDS.map((id) => {
		return {
			hitpoints: hitpoints[BATTLE_IDS.find((candidate) => ID_MAP[candidate] === id)],
			id
		};
	});
	return {
		destroyedTowerIds: towers.filter((tower) => tower.hitpoints === 0).map((tower) => tower.id),
		towers
	};
}
/** Pure live-battle-to-match mapping shared without importing either ownership kernel. */
function mapLiveBattleTowerStateToMatchEvidence(towers) {
	const values = exactArray(towers, "live battle towers");
	if (values.length !== BATTLE_IDS.length) throw new TypeError("live battle towers must contain all six towers");
	const hitpoints = {};
	for (const [index, value] of values.entries()) {
		const tower = exactObject(value, [
			"active",
			"attack",
			"hitpoints",
			"id",
			"lane",
			"position",
			"role",
			"side"
		], "live battle towers[" + index + "]");
		if (!BATTLE_IDS.includes(tower.id) || Object.hasOwn(hitpoints, tower.id) || !Number.isSafeInteger(tower.hitpoints) || tower.hitpoints < 0) throw new TypeError("live battle towers[" + index + "] is invalid");
		hitpoints[tower.id] = tower.hitpoints;
	}
	return deepFreeze(evidenceFromHitpoints(hitpoints));
}
function mapBattleTowerIdToMatchTowerId(id) {
	if (typeof id !== "string" || !Object.hasOwn(ID_MAP, id)) throw new TypeError("battle tower ID is unknown");
	return ID_MAP[id];
}
var BATTLE_IDS, MATCH_IDS, ID_MAP;
function init_tower_evidence_map() {
	return (init_tower_evidence_map = __esmMin((() => {
		BATTLE_IDS = Object.freeze([
			"south:central",
			"south:lane:west",
			"south:lane:east",
			"north:central",
			"north:lane:west",
			"north:lane:east"
		]);
		MATCH_IDS = Object.freeze([
			"north:central",
			"north:lane:left",
			"north:lane:right",
			"south:central",
			"south:lane:left",
			"south:lane:right"
		]);
		ID_MAP = Object.freeze({
			"north:central": "north:central",
			"north:lane:east": "north:lane:right",
			"north:lane:west": "north:lane:left",
			"south:central": "south:central",
			"south:lane:east": "south:lane:right",
			"south:lane:west": "south:lane:left"
		});
	})))();
}
//#endregion
//#region src/sim/spell-area-impact.js
function checkedAreaImpact(value, currentTick, maxTick) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError("spell area impact must be a plain string-keyed data object");
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const expected = [
		"center",
		"effectId",
		"radius",
		"targetIds",
		"tick"
	].sort();
	const actual = Reflect.ownKeys(descriptors).sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError("spell area impact has an invalid shape");
	for (const key of expected) if (!descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value")) throw new TypeError(`spell area impact.${key} must be an enumerable data property`);
	const raw = Object.fromEntries(expected.map((key) => [key, descriptors[key].value]));
	const tick = raw.tick;
	if (!Number.isSafeInteger(tick) || tick < 0 || tick > maxTick) throw new TypeError("spell area impact.tick is outside the safe tick range");
	if (tick !== currentTick) throw new RangeError("spell area impact tick must equal the current combat tick");
	const centerPoint = validateArenaPoint(raw.center, "spell area impact.center");
	if (!isPointInArena(centerPoint)) throw new RangeError("spell area impact.center must be inside the arena");
	if (!Number.isSafeInteger(raw.effectId) || raw.effectId < 1) throw new TypeError("spell area impact.effectId must be a positive safe integer");
	if (!Number.isSafeInteger(raw.radius) || raw.radius < 1 || raw.radius > MAX_SPATIAL_MILLITILES) throw new TypeError("spell area impact.radius is outside spatial bounds");
	if (!Array.isArray(raw.targetIds) || raw.targetIds.length > 1024) throw new TypeError("spell area impact.targetIds must be a bounded array");
	const idDescriptors = Object.getOwnPropertyDescriptors(raw.targetIds);
	for (const key of Reflect.ownKeys(idDescriptors)) {
		if (key === "length") continue;
		if (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= raw.targetIds.length) throw new TypeError("spell area impact.targetIds must contain only indexed data");
	}
	const targetIds = Array.from({ length: raw.targetIds.length }, (_, index) => {
		const descriptor = idDescriptors[index];
		if (descriptor === void 0 || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`spell area impact.targetIds[${index}] must be an enumerable data property`);
		const id = descriptor.value;
		if (!Number.isSafeInteger(id) || id < 1) throw new TypeError(`spell area impact.targetIds[${index}] must be a positive safe integer`);
		return id;
	});
	if (new Set(targetIds).size !== targetIds.length) throw new TypeError("spell area impact target IDs must be unique");
	targetIds.sort((left, right) => left - right);
	return {
		center: {
			x: centerPoint.x,
			y: centerPoint.y
		},
		effectId: raw.effectId,
		radius: raw.radius,
		targetIds,
		tick
	};
}
function appendSpellAreaImpact(feed, impact) {
	const root = appendCombatEffectRoot(feed, {
		direction: "area",
		effectId: impact.effectId,
		from: impact.center,
		impactTick: impact.tick,
		projectileId: null,
		radius: impact.radius,
		segments: [],
		sequence: null,
		sourceId: null,
		tick: impact.tick,
		to: null,
		type: "area"
	});
	const applied = appendCombatEffectEvent(feed, {
		parentId: root.eventId,
		payload: {
			center: impact.center,
			radius: impact.radius,
			targetIds: impact.targetIds
		},
		phase: "impact",
		rootId: root.rootId,
		tick: impact.tick,
		type: "area"
	});
	appendCombatEffectEvent(feed, {
		parentId: applied.eventId,
		payload: { reason: "complete" },
		phase: "close",
		rootId: root.rootId,
		tick: impact.tick,
		type: "area"
	});
}
function init_spell_area_impact() {
	return (init_spell_area_impact = __esmMin((() => {
		init_arena_geometry();
		init_combat_effect_feed();
		init_spatial();
	})))();
}
//#endregion
//#region src/sim/ordinary-projectile-splash.js
function exact(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors).sort();
	const expected = [...keys].sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]) || Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !Object.hasOwn(descriptor, "value"))) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function ownDataObject(value, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain string-keyed data object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	for (const [key, descriptor] of Object.entries(descriptors)) if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
	return descriptors;
}
function integer(value, minimum, maximum, label) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a safe integer from ${minimum} through ${maximum}`);
	return value;
}
function checkedProfile(value, label) {
	const profile = exact(value, UNIT_PROFILE_KEYS, label);
	return assertOrdinaryProjectileSplashProfile(profile, profile.cardId, profile.archetypeId);
}
function checkedUnitSplashShape(value, label, keys) {
	const descriptors = ownDataObject(value, label);
	const hasProfile = Object.hasOwn(descriptors, "splashProfile");
	const unit = exact(value, hasProfile ? [...keys, "splashProfile"] : keys, label);
	return {
		profile: hasProfile ? checkedProfile(unit.splashProfile, `${label}.splashProfile`) : null,
		unit
	};
}
function checkedSpawnSplashShape(value, label, keys) {
	const descriptors = ownDataObject(value, label);
	const hasProfile = Object.hasOwn(descriptors, "splashProfile");
	const record = exact(value, hasProfile ? [...keys, "splashProfile"] : keys, label);
	return {
		profile: hasProfile ? checkedProfile(record.splashProfile, `${label}.splashProfile`) : null,
		record
	};
}
function checkedCombatUnit(value, label = "battle combat unit") {
	const { profile, unit } = checkedUnitSplashShape(value, label, COMBAT_UNIT_KEYS);
	integer(unit.id, 1, Number.MAX_SAFE_INTEGER, `${label}.id`);
	if (!SIDES.has(unit.side)) throw new TypeError(`${label}.side is invalid`);
	if (!LAYERS.has(unit.layer)) throw new TypeError(`${label}.layer is invalid`);
	if (!TARGET_MODES.has(unit.targetMode)) throw new TypeError(`${label}.targetMode is invalid`);
	if (!DELIVERIES.has(unit.delivery)) throw new TypeError(`${label}.delivery is invalid`);
	const position = validatePosition(unit.position, `${label}.position`);
	validateCircle({
		position,
		radius: unit.radius
	}, `${label} circle`);
	integer(unit.sightRange, 0, MAX_SPATIAL_MILLITILES, `${label}.sightRange`);
	integer(unit.reach, 0, MAX_SPATIAL_MILLITILES, `${label}.reach`);
	integer(unit.maxHealth, 1, MAX_STAT, `${label}.maxHealth`);
	integer(unit.damage, 0, MAX_STAT, `${label}.damage`);
	integer(unit.deployTicks, 0, MAX_TICK, `${label}.deployTicks`);
	integer(unit.firstHitTicks, 0, MAX_TICK, `${label}.firstHitTicks`);
	integer(unit.cadenceTicks, 1, MAX_TICK, `${label}.cadenceTicks`);
	if (unit.delivery === "melee") {
		if (unit.projectileSpeed !== null) throw new TypeError(`${label}.projectileSpeed must be null for melee delivery`);
	} else integer(unit.projectileSpeed, 1, MAX_STAT, `${label}.projectileSpeed`);
	return {
		...unit,
		position: { ...position },
		...profile === null ? {} : { splashProfile: profile }
	};
}
function copyCombatUnitFields(unit, cloneValue) {
	const fields = Object.fromEntries(COMBAT_UNIT_KEYS.map((key) => [key, cloneValue(unit[key])]));
	if (Object.hasOwn(unit, "splashProfile")) fields.splashProfile = cloneValue(unit.splashProfile);
	return fields;
}
function checkedCombatSpawn(value, label = "battle combat spawn") {
	const { profile, record: command } = checkedSpawnSplashShape(value, label, [...COMBAT_UNIT_KEYS, "tick"]);
	const tick = integer(command.tick, 0, MAX_TICK, `${label}.tick`);
	return {
		...checkedCombatUnit(Object.fromEntries([...COMBAT_UNIT_KEYS, ...profile === null ? [] : ["splashProfile"]].map((key) => [key, command[key]])), `${label}.unit`),
		tick
	};
}
function ordinaryProjectileSplashEntityShape(raw, keys) {
	const hasProfile = raw !== null && typeof raw === "object" && !Array.isArray(raw) && (Object.hasOwn(raw, "projectileSplashPolicy") || Object.hasOwn(raw, "projectileSplashSourceFacts"));
	return {
		hasProfile,
		keys: hasProfile ? [...keys, ...SETUP_FIELDS] : keys
	};
}
function assertOrdinaryProjectileSplashReceipt(entity, cardId, archetypeId, label) {
	const profile = assertOrdinaryProjectileSplashProfile(exact(entity.projectileSplashPolicy, UNIT_PROFILE_KEYS, `${label}.projectileSplashPolicy`), cardId, archetypeId);
	const sourceFacts = exact(entity.projectileSplashSourceFacts, SOURCE_FACT_KEYS, `${label}.projectileSplashSourceFacts`);
	const expected = getOrdinaryProjectileSplashSourceFacts(cardId, archetypeId);
	if (expected === null || SOURCE_FACT_KEYS.some((key) => sourceFacts[key] !== expected[key]) || entity.damage !== expected.projectileDamage) throw new TypeError(`${label} splash source facts diverge from their pinned receipt`);
	return {
		profile,
		sourceFacts
	};
}
function ordinaryProjectileSplashEntityFields(entity, cardId, archetypeId, label) {
	const { profile, sourceFacts } = assertOrdinaryProjectileSplashReceipt(entity, cardId, archetypeId, label);
	return {
		projectileSplashPolicy: profile,
		projectileSplashSourceFacts: sourceFacts
	};
}
function ordinaryProjectileSplashCombatFields(component) {
	return component.projectileSplashPolicy === void 0 ? {} : { splashProfile: component.projectileSplashPolicy };
}
function selectTargets({ center, enemySide, primaryTargetId, profile, structures, units }) {
	const targets = [];
	const overlaps = (target) => circlesOverlap({
		position: center,
		radius: profile.radiusMillitiles
	}, {
		position: target.position,
		radius: target.radius
	});
	for (const unit of units) {
		if (!unit.alive || !unit.targetable || unit.side !== enemySide || unit.id === primaryTargetId || !profile.targetLayers.includes(unit.layer) || !overlaps(unit)) continue;
		targets.push({
			...unit,
			targetKind: "unit"
		});
	}
	for (const structure of structures) {
		if (!structure.alive || !structure.targetable || structure.side !== enemySide || structure.id === primaryTargetId || !profile.targetLayers.includes(structure.layer) || !overlaps(structure)) continue;
		targets.push({
			...structure,
			targetKind: "structure"
		});
	}
	targets.sort((left, right) => left.id - right.id);
	return targets;
}
function planOrdinaryProjectileSplashImpact({ attackerId, attackSequence, center, damage, enemySide, primaryKind, primaryStatus, primaryTarget, primaryTargetId, primaryTargetable, profile, projectileId, structures, tick, units }) {
	const primaryWithinSplash = profile === null || primaryStatus !== "contact" || primaryTarget !== null && circlesOverlap({
		position: center,
		radius: profile.radiusMillitiles
	}, {
		position: primaryTarget.position,
		radius: primaryTarget.radius ?? 0
	});
	const impactStatus = profile === null || primaryStatus !== "contact" || primaryTarget !== null && primaryTarget.side === enemySide && profile.targetLayers.includes(primaryTarget.layer) && primaryTargetable && primaryWithinSplash ? primaryStatus : "target_missing";
	const splashTargets = profile === null ? [] : selectTargets({
		center,
		enemySide,
		primaryTargetId,
		profile,
		structures,
		units
	});
	const unitHits = [];
	const hitSources = [];
	const structureContacts = [];
	const visualContacts = [{
		id: primaryTargetId,
		position: center,
		status: impactStatus
	}];
	const addContact = (target, kind) => {
		visualContacts.push({
			id: target.id,
			position: target.position,
			status: "contact"
		});
		if (kind === "unit") {
			unitHits.push({
				amount: damage,
				targetId: target.id
			});
			hitSources.push({
				attackerId,
				delivery: "projectile",
				projectileId
			});
		} else structureContacts.push({
			contactTick: tick,
			attackSequence,
			damage,
			delivery: "projectile",
			projectileId,
			sourceUnitId: attackerId,
			structureId: target.structureId,
			tick,
			type: "external-structure-contact"
		});
	};
	if (impactStatus === "contact") addContact(primaryKind === "structure" ? {
		...primaryTarget,
		structureId: primaryTarget.structureId
	} : {
		id: primaryTargetId,
		position: center
	}, primaryKind);
	for (const target of splashTargets) addContact(target, target.targetKind);
	return {
		hitSources,
		impactStatus,
		structureContacts,
		unitHits,
		visualContacts
	};
}
var COMBAT_UNIT_KEYS, SIDES, LAYERS, TARGET_MODES, DELIVERIES, MAX_TICK, MAX_STAT, UNIT_PROFILE_KEYS, SOURCE_FACT_KEYS, SETUP_FIELDS;
function init_ordinary_projectile_splash() {
	return (init_ordinary_projectile_splash = __esmMin((() => {
		init_ordinary_projectile_delivery_authority();
		init_spatial();
		COMBAT_UNIT_KEYS = Object.freeze([
			"cadenceTicks",
			"damage",
			"delivery",
			"deployTicks",
			"firstHitTicks",
			"id",
			"layer",
			"maxHealth",
			"position",
			"projectileSpeed",
			"radius",
			"reach",
			"side",
			"sightRange",
			"targetMode"
		]);
		SIDES = /* @__PURE__ */ new Set(["north", "south"]);
		LAYERS = /* @__PURE__ */ new Set(["air", "ground"]);
		TARGET_MODES = /* @__PURE__ */ new Set([
			"air",
			"air_and_ground",
			"buildings",
			"ground",
			"none"
		]);
		DELIVERIES = /* @__PURE__ */ new Set(["melee", "projectile"]);
		MAX_TICK = 1e9;
		MAX_STAT = 1e9;
		UNIT_PROFILE_KEYS = Object.freeze([
			"archetypeId",
			"cardId",
			"catalogId",
			"enemiesOnly",
			"radiusMillitiles",
			"sourceExport",
			"targetLayers"
		]);
		SOURCE_FACT_KEYS = Object.freeze([
			"aoeToAir",
			"aoeToGround",
			"characterAreaDamageRadiusMillitiles",
			"homing",
			"onlyEnemies",
			"projectileDamage",
			"projectileDamageLinkedProjectileId",
			"projectileDamagePerLevelIndex",
			"projectileDamageRarity",
			"projectileDamageSourceCommit",
			"projectileDamageSourceFile",
			"projectileDamageSourceFileSha256",
			"projectileDamageSourceUri",
			"projectileDamageTournamentLevel",
			"radiusMillitiles",
			"speedRaw"
		]);
		SETUP_FIELDS = Object.freeze(["projectileSplashPolicy", "projectileSplashSourceFacts"]);
	})))();
}
//#endregion
//#region src/sim/elixir.js
function init_elixir() {
	return (init_elixir = __esmMin((() => {
		init_battle_continuation_kernel();
	})))();
}
//#endregion
export { EntityStore as $, assertSessionTroopStatusSourceRoster as A, isSessionBuildingCardId as B, admitSessionTroopProjectileRuntimeFromBattleSnapshot as C, serializeMovementState as Ct, init_session_troop_projectile_runtime as D, validateCircle as Dt, admitSessionTroopProjectileRuntimeProfiles as E, init_spatial as Et, init_session_troop_runtime as F, isAuthenticSessionCardRuntime as G, init_session_building_profile_receipts as H, parseSessionTroopRuntimeProfiles as I, init_deck as J, DECK_MAX_PLAY_COMMANDS as K, SESSION_BUILDING_MAX_INTENTS as L, parseSessionTroopStatusRuntimeProfiles as M, SESSION_TROOP_RUNTIME_MAX_SOURCES as N, SESSION_TROOP_STATUS_RUNTIME_MAX_COMMANDS as O, validatePosition as Ot, SessionTroopRuntime as P, init_deployment as Q, createSessionBuildingRuntime as R, SessionTroopProjectileRuntime as S, restoreMovementState as St, admitSessionTroopProjectileRuntimeFromSetup as T, circlesOverlap as Tt, SessionCardRuntime as U, assertSessionBuildingProfileReceipt as V, init_session_card_runtime as W, init_rng as X, SeededRandom as Y, evaluateDeployment as Z, init_game_side_deploy_core as _, serializeFlyingState as _t, init_ordinary_projectile_splash as a, layoutFormation as at, init_spell_intent_runtime as b, createMovementState as bt, ordinaryProjectileSplashEntityShape as c, ATTACK_TARGET_MODES as ct, checkedAreaImpact as d, retainOrAcquireTarget as dt, init_entities as et, init_spell_area_impact as f, targetCandidate as ft, createStageSideDeployment as g, restoreFlyingState as gt, mapLiveBattleTowerStateToMatchEvidence as h, init_flying as ht, copyCombatUnitFields as i, init_formations as it, init_session_troop_status_runtime as j, SessionTroopStatusRuntime as k, planOrdinaryProjectileSplashImpact as l, acquireTarget as lt, mapBattleTowerIdToMatchTowerId as m, createFlyingState as mt, checkedCombatSpawn as n, init_pathfinding as nt, ordinaryProjectileSplashCombatFields as o, ProjectileCombat as ot, init_tower_evidence_map as p, advanceFlying as pt, DeckCycle as q, checkedCombatUnit as r, isGroundNavigationNode as rt, ordinaryProjectileSplashEntityFields as s, init_projectile as st, init_elixir as t, findGroundPath as tt, appendSpellAreaImpact as u, init_targeting as ut, createSpellIntentRuntime as v, MOVEMENT_SPEEDS as vt, admitSessionTroopProjectileRuntimeFromGameSnapshot as w, MAX_SPATIAL_MILLITILES as wt, parseSpellIntentProfileReceipts as x, init_movement as xt, getUnprofiledAdmittedEffectProfileQuestion as y, advanceMovement as yt, init_session_building_runtime as z };
