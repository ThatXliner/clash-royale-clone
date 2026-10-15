import { t as __esmMin } from "../../../../../../rolldown-runtime-Cl99QfTQ.js";
//#region src/sim/damage.js
function assertExactKeys(value, expected, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} has an invalid shape`);
	const actual = Object.keys(value).sort();
	const wanted = [...expected].sort();
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new TypeError(`${label} has an invalid shape`);
}
function assertId(id, label = "entity id") {
	if (!Number.isSafeInteger(id) || id < 1) throw new TypeError(`${label} must be a positive safe integer`);
}
function assertHealth(value, label) {
	if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be a positive safe integer`);
}
function assertDamage(value, label = "damage") {
	if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer`);
}
function clone$1(value) {
	return JSON.parse(JSON.stringify(value));
}
function canonicalJson$1(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$1).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$1(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
var DamageSystem;
function init_damage() {
	return (init_damage = __esmMin((() => {
		DamageSystem = class DamageSystem {
			#combatants = [];
			get size() {
				return this.#combatants.length;
			}
			add(id, maxHealth, currentHealth = maxHealth) {
				assertId(id);
				assertHealth(maxHealth, "maxHealth");
				assertHealth(currentHealth, "currentHealth");
				if (currentHealth > maxHealth) throw new RangeError("currentHealth must not exceed maxHealth");
				if (this.#findIndex(id) !== -1) throw new RangeError(`entity ${id} already has health`);
				const combatant = {
					currentHealth,
					dead: false,
					id,
					maxHealth
				};
				const insertion = this.#combatants.findIndex((entry) => entry.id > id);
				if (insertion === -1) this.#combatants.push(combatant);
				else this.#combatants.splice(insertion, 0, combatant);
				return clone$1(combatant);
			}
			get(id) {
				assertId(id);
				const index = this.#findIndex(id);
				return index === -1 ? null : clone$1(this.#combatants[index]);
			}
			list() {
				return clone$1(this.#combatants);
			}
			/**
			* Resolves one hit immediately.
			*
			* Missing and dead targets are valid no-op results. A lethal hit emits its
			* one death event here; all later hits return "dead" without another event.
			*/
			damage(targetId, amount) {
				const batch = this.damageSimultaneously([{
					amount,
					targetId
				}]);
				return {
					events: batch.events,
					...batch.results[0]
				};
			}
			/**
			* Resolves one health restoration without ever reviving a dead combatant.
			* Missing and dead targets are valid no-op results, matching damage's
			* deterministic admission behavior.
			*/
			heal(targetId, amount) {
				assertId(targetId, "heal targetId");
				assertDamage(amount, "heal amount");
				const index = this.#findIndex(targetId);
				if (index === -1) return {
					amount,
					currentHealth: null,
					events: [],
					status: "missing",
					targetId
				};
				const combatant = this.#combatants[index];
				if (combatant.dead) return {
					amount,
					currentHealth: 0,
					events: [],
					status: "dead",
					targetId
				};
				const before = combatant.currentHealth;
				const room = combatant.maxHealth - before;
				const applied = Math.min(room, amount);
				combatant.currentHealth += applied;
				const event = {
					amount: applied,
					currentHealthAfter: combatant.currentHealth,
					currentHealthBefore: before,
					requestedAmount: amount,
					targetId,
					type: "heal"
				};
				return {
					amount,
					appliedAmount: applied,
					currentHealth: combatant.currentHealth,
					events: [event],
					status: "applied",
					targetId
				};
			}
			/**
			* Resolves hits from one simultaneous timing window.
			*
			* All input is validated before mutation. Every target that was alive before
			* the batch accepts every hit aimed at it, even if an earlier input is
			* lethal. Multiple hits are accumulated per ID with safe-integer arithmetic.
			*/
			damageSimultaneously(hits) {
				if (!Array.isArray(hits)) throw new TypeError("simultaneous hits must be an array");
				const checked = hits.map((hit, index) => {
					assertExactKeys(hit, ["amount", "targetId"], `hit ${index}`);
					assertId(hit.targetId, `hit ${index} targetId`);
					assertDamage(hit.amount, `hit ${index} amount`);
					return {
						amount: hit.amount,
						targetId: hit.targetId
					};
				});
				const totals = /* @__PURE__ */ new Map();
				const preBatch = new Map(this.#combatants.map((combatant) => [combatant.id, { ...combatant }]));
				for (const hit of checked) {
					const target = preBatch.get(hit.targetId);
					if (target !== void 0 && !target.dead) {
						const total = totals.get(hit.targetId) ?? 0;
						if (hit.amount > Number.MAX_SAFE_INTEGER - total) throw new RangeError(`total damage for entity ${hit.targetId} exceeds safe integer range`);
						totals.set(hit.targetId, total + hit.amount);
					}
				}
				const cumulative = /* @__PURE__ */ new Map();
				const damageEvents = [];
				const results = checked.map((hit) => {
					const target = preBatch.get(hit.targetId);
					if (target === void 0) return {
						amount: hit.amount,
						currentHealth: null,
						status: "missing",
						targetId: hit.targetId
					};
					if (target.dead) return {
						amount: hit.amount,
						currentHealth: 0,
						status: "dead",
						targetId: hit.targetId
					};
					const priorDamage = cumulative.get(hit.targetId) ?? 0;
					const before = Math.max(0, target.currentHealth - priorDamage);
					const nextDamage = priorDamage + hit.amount;
					cumulative.set(hit.targetId, nextDamage);
					const after = Math.max(0, target.currentHealth - nextDamage);
					damageEvents.push({
						amount: hit.amount,
						currentHealthAfter: after,
						currentHealthBefore: before,
						targetId: hit.targetId,
						type: "damage"
					});
					return {
						amount: hit.amount,
						currentHealth: after,
						status: "applied",
						targetId: hit.targetId
					};
				});
				const deaths = [];
				for (const [id, total] of [...totals].sort(([left], [right]) => left - right)) {
					const index = this.#findIndex(id);
					const combatant = this.#combatants[index];
					combatant.currentHealth = Math.max(0, combatant.currentHealth - total);
					if (combatant.currentHealth === 0) {
						combatant.dead = true;
						deaths.push({
							targetId: id,
							type: "death"
						});
					}
				}
				return clone$1({
					events: [...damageEvents, ...deaths],
					results
				});
			}
			serialize() {
				return canonicalJson$1({
					combatants: this.#combatants,
					version: 1
				});
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("serialized damage snapshot must be a string");
				let snapshot;
				try {
					snapshot = JSON.parse(serialized);
				} catch {
					throw new TypeError("serialized damage snapshot must be valid JSON");
				}
				assertExactKeys(snapshot, ["combatants", "version"], "damage snapshot");
				if (snapshot.version !== 1 || !Array.isArray(snapshot.combatants)) throw new TypeError("damage snapshot has an invalid shape");
				const system = new DamageSystem();
				let previousId = 0;
				for (let index = 0; index < snapshot.combatants.length; index += 1) {
					const combatant = snapshot.combatants[index];
					assertExactKeys(combatant, [
						"currentHealth",
						"dead",
						"id",
						"maxHealth"
					], `snapshot combatant ${index}`);
					assertId(combatant.id, `snapshot combatant ${index} id`);
					assertHealth(combatant.maxHealth, `snapshot combatant ${index} maxHealth`);
					if (combatant.id <= previousId) throw new TypeError("snapshot combatants must have unique ascending IDs");
					if (typeof combatant.dead !== "boolean") throw new TypeError(`snapshot combatant ${index} dead must be boolean`);
					if (combatant.dead) {
						if (combatant.currentHealth !== 0) throw new TypeError("dead snapshot combatants must have zero health");
					} else assertHealth(combatant.currentHealth, `snapshot combatant ${index} currentHealth`);
					if (combatant.currentHealth > combatant.maxHealth) throw new TypeError("snapshot currentHealth must not exceed maxHealth");
					system.#combatants.push({ ...combatant });
					previousId = combatant.id;
				}
				return system;
			}
			#findIndex(id) {
				let low = 0;
				let high = this.#combatants.length - 1;
				while (low <= high) {
					const middle = Math.floor((low + high) / 2);
					const candidate = this.#combatants[middle].id;
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
//#region src/sim/combat-effect-feed.js
function clone(value) {
	return JSON.parse(canonicalJson(value));
}
function freeze(value, seen = /* @__PURE__ */ new WeakSet()) {
	if (value === null || typeof value !== "object" || seen.has(value)) return value;
	seen.add(value);
	for (const child of Object.values(value)) freeze(child, seen);
	return Object.freeze(value);
}
function exact(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be a plain data object`);
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain data object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	const expected = [...keys].sort();
	if (actual.some((key) => typeof key !== "string")) throw new TypeError(`${label} must contain only string keys`);
	const sortedActual = [...actual].sort();
	if (sortedActual.length !== expected.length || sortedActual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} has an invalid shape`);
	const result = {};
	for (const key of keys) {
		const descriptor = descriptors[key];
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
		result[key] = descriptor.value;
	}
	return result;
}
function dense(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) throw new TypeError(`${label} must be a bounded plain array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Reflect.ownKeys(descriptors).some((key) => key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length))) throw new TypeError(`${label} must contain only indexed data`);
	for (let index = 0; index < value.length; index += 1) {
		const descriptor = descriptors[index];
		if (descriptor === void 0 || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}[${index}] must be an enumerable data property`);
	}
	return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}
function integer(value, minimum, maximum, label) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a safe integer from ${minimum} through ${maximum}`);
	return value;
}
function boundedText(value, label, maximum = 256) {
	if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.normalize("NFC") !== value || /[\u0000-\u001f\u007f\ud800-\udfff]/u.test(value)) throw new TypeError(`${label} must be bounded normalized text`);
	return value;
}
function decimal(value, label, signed = false) {
	const pattern = signed ? /^(?:0|-?[1-9]\d*)$/u : /^(?:0|[1-9]\d*)$/u;
	if (typeof value !== "string" || value.length > 32 || !pattern.test(value)) throw new TypeError(`${label} must be a canonical decimal string`);
	return BigInt(value);
}
function canonicalPoint(value, label, allowOutside = true) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be a point`);
	if (Object.keys(value).length === 2 && Object.hasOwn(value, "x") && Object.hasOwn(value, "y")) {
		const raw = exact(value, ["x", "y"], label);
		const margin = allowOutside ? COMBAT_EFFECT_FEED_MAX_COORDINATE : 0;
		integer(raw.x, -margin, 18e3 + margin, `${label}.x`);
		integer(raw.y, -margin, 32e3 + margin, `${label}.y`);
		return {
			denominator: "1",
			xNumerator: String(raw.x),
			yNumerator: String(raw.y)
		};
	}
	const raw = exact(value, [
		"denominator",
		"xNumerator",
		"yNumerator"
	], label);
	const denominator = decimal(raw.denominator, `${label}.denominator`);
	if (denominator < 1n || denominator > BigInt(1e6)) throw new RangeError(`${label}.denominator is outside the feed bound`);
	const x = decimal(raw.xNumerator, `${label}.xNumerator`, true);
	const y = decimal(raw.yNumerator, `${label}.yNumerator`, true);
	const margin = BigInt(allowOutside ? COMBAT_EFFECT_FEED_MAX_COORDINATE : 0);
	if (x < -margin * denominator || x > (18000n + margin) * denominator || y < -margin * denominator || y > (32000n + margin) * denominator) throw new RangeError(`${label} lies outside the feed coordinate bound`);
	return {
		denominator: denominator.toString(),
		xNumerator: x.toString(),
		yNumerator: y.toString()
	};
}
function checkedIdentity(value, label, nullable = true) {
	if (nullable && value === null) return null;
	if (Number.isSafeInteger(value) && value >= 1) return value;
	if (typeof value === "string" && value.length > 0 && value.length <= 256 && value.normalize("NFC") === value && !/[\u0000-\u001f\u007f\ud800-\udfff]/u.test(value)) return value;
	throw new TypeError(`${label} must be a positive bounded identity`);
}
function identityPart(value) {
	if (value === null) return "none";
	if (typeof value === "number") return String(value);
	const bytes = UTF8.encode(value);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	const base64 = btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
	const uriPart = `s${encodeURIComponent(value).replaceAll(".", "%2E").replaceAll("'", "%27").replaceAll("(", "%28").replaceAll(")", "%29").replaceAll("*", "%2A")}`;
	const base64Part = `b${base64}`;
	return uriPart.length <= base64Part.length ? uriPart : base64Part;
}
function combatEffectRootId(value) {
	const raw = exact(value, [
		"direction",
		"effectId",
		"projectileId",
		"sequence",
		"sourceId",
		"type"
	], "combat effect root identity");
	const { direction, type } = raw;
	if (!TYPES.has(type)) throw new TypeError("combat effect root type is invalid");
	if (type === "area" && direction !== "area" || type === "projectile" && !PROJECTILE_DIRECTIONS.has(direction) || type === "contact" && direction !== "contact") throw new TypeError("combat effect root direction is unsupported");
	boundedText(direction, "combat effect root direction");
	const sourceId = checkedIdentity(raw.sourceId, "combat effect root sourceId");
	const effectId = checkedIdentity(raw.effectId, "combat effect root effectId");
	const projectileId = checkedIdentity(raw.projectileId, "combat effect root projectileId");
	const sequence = checkedIdentity(raw.sequence, "combat effect root sequence");
	if (type === "area" && (sourceId !== null || effectId === null || projectileId !== null || sequence !== null)) throw new TypeError("combat effect area root identity is not canonical");
	if (type === "projectile" && sourceId === null) throw new TypeError("combat effect projectile root identity is not canonical");
	if (type === "contact" && (sourceId === null || effectId === null || projectileId !== null || sequence === null)) throw new TypeError("combat effect direct contact root identity is not canonical");
	return `${type}.${direction}.${identityPart(sourceId)}.${identityPart(effectId)}.${identityPart(projectileId)}.${identityPart(sequence)}`;
}
function rootIdentity(type, payload) {
	if (type === "contact") return combatEffectRootId({
		direction: "contact",
		effectId: payload.targetId,
		projectileId: null,
		sequence: payload.sequence,
		sourceId: payload.sourceId,
		type
	});
	return combatEffectRootId({
		direction: payload.direction,
		effectId: payload.effectId,
		projectileId: payload.projectileId,
		sequence: payload.sequence,
		sourceId: payload.sourceId,
		type
	});
}
function checkedSegments(value, label) {
	const segments = dense(value, 64, label).map((entry, index) => {
		const raw = exact(entry, ["id", "to"], `${label}[${index}]`);
		return {
			id: integer(raw.id, 1, Number.MAX_SAFE_INTEGER, `${label}[${index}].id`),
			to: canonicalPoint(raw.to, `${label}[${index}].to`)
		};
	});
	segments.sort((left, right) => left.id - right.id);
	for (let index = 1; index < segments.length; index += 1) if (segments[index - 1].id === segments[index].id) throw new TypeError(`${label} IDs must be unique`);
	return segments;
}
function checkedOpenPayload(value, label, type, tick) {
	if (type === "contact") {
		const raw = exact(value, PAYLOAD_DIRECT_CONTACT_OPEN_KEYS, label);
		boundedText(raw.sequence, `${label}.sequence`);
		const sequence = /^(0|[1-9][0-9]*):(0|[1-9][0-9]*)$/u.exec(raw.sequence);
		if (sequence === null || sequence[1] !== String(tick) || !Number.isSafeInteger(Number(sequence[2])) || String(Number(sequence[2])) !== sequence[2]) throw new TypeError(`${label}.sequence must identify its contact tick and ordinal`);
		return {
			point: canonicalPoint(raw.point, `${label}.point`),
			sequence: raw.sequence,
			sourceId: integer(raw.sourceId, 1, Number.MAX_SAFE_INTEGER, `${label}.sourceId`),
			targetId: integer(raw.targetId, 1, Number.MAX_SAFE_INTEGER, `${label}.targetId`)
		};
	}
	const raw = exact(value, PAYLOAD_OPEN_KEYS, label);
	if (!PROJECTILE_DIRECTIONS.has(raw.direction) && !(type === "area" && raw.direction === "area")) throw new TypeError(`${label}.direction is unsupported`);
	const sourceId = checkedIdentity(raw.sourceId, `${label}.sourceId`);
	const effectId = checkedIdentity(raw.effectId, `${label}.effectId`);
	const projectileId = checkedIdentity(raw.projectileId, `${label}.projectileId`);
	const sequence = checkedIdentity(raw.sequence, `${label}.sequence`);
	integer(raw.impactTick, tick, Number.MAX_SAFE_INTEGER, `${label}.impactTick`);
	integer(raw.radius, 0, COMBAT_EFFECT_FEED_MAX_COORDINATE, `${label}.radius`);
	const from = canonicalPoint(raw.from, `${label}.from`);
	const to = raw.to === null ? null : canonicalPoint(raw.to, `${label}.to`);
	const segments = checkedSegments(raw.segments, `${label}.segments`);
	if (type === "area") {
		if (raw.direction !== "area" || sourceId !== null || effectId === null || projectileId !== null || sequence !== null || to !== null || segments.length !== 0) throw new TypeError(`${label} is not a canonical area root`);
	} else {
		if (sourceId === null || to === null && segments.length === 0 || to !== null && segments.length !== 0) throw new TypeError(`${label} is not a canonical projectile root`);
		if (raw.direction === "area") throw new TypeError(`${label}.direction is invalid`);
	}
	return {
		direction: raw.direction,
		effectId,
		from,
		impactTick: raw.impactTick,
		projectileId,
		radius: raw.radius,
		segments,
		sequence,
		sourceId,
		to
	};
}
function checkedPayload(value, type, phase, tick, label) {
	if (phase === "open") return checkedOpenPayload(value, label, type, tick);
	if (phase === "turn") return { point: canonicalPoint(exact(value, PAYLOAD_TURN_KEYS, label).point, `${label}.point`) };
	if (phase === "contact") {
		const raw = exact(value, PAYLOAD_CONTACT_KEYS, label);
		if (!CONTACT_STATUSES.has(raw.status)) throw new TypeError(`${label}.status is invalid`);
		const subId = checkedIdentity(raw.subId, `${label}.subId`);
		return {
			point: canonicalPoint(raw.point, `${label}.point`),
			status: raw.status,
			subId,
			targetId: integer(raw.targetId, 1, Number.MAX_SAFE_INTEGER, `${label}.targetId`)
		};
	}
	if (phase === "impact") {
		const raw = exact(value, PAYLOAD_IMPACT_KEYS, label);
		const targetIds = dense(raw.targetIds, COMBAT_EFFECT_FEED_MAX_RECORDS, `${label}.targetIds`).map((targetId, index) => integer(targetId, 1, Number.MAX_SAFE_INTEGER, `${label}.targetIds[${index}]`));
		for (let index = 1; index < targetIds.length; index += 1) if (targetIds[index - 1] >= targetIds[index]) throw new TypeError(`${label}.targetIds must be strictly ascending`);
		return {
			center: canonicalPoint(raw.center, `${label}.center`),
			radius: integer(raw.radius, 0, COMBAT_EFFECT_FEED_MAX_COORDINATE, `${label}.radius`),
			targetIds
		};
	}
	if (phase === "damage") {
		const raw = exact(value, PAYLOAD_DAMAGE_KEYS, label);
		const amount = integer(raw.amount, 0, Number.MAX_SAFE_INTEGER, label + ".amount");
		const currentHealthAfter = integer(raw.currentHealthAfter, 0, Number.MAX_SAFE_INTEGER, label + ".currentHealthAfter");
		const currentHealthBefore = integer(raw.currentHealthBefore, 0, Number.MAX_SAFE_INTEGER, label + ".currentHealthBefore");
		if (currentHealthAfter > currentHealthBefore || currentHealthBefore - currentHealthAfter > amount) throw new TypeError(label + " is not a canonical damage transition");
		return {
			amount,
			currentHealthAfter,
			currentHealthBefore,
			targetId: integer(raw.targetId, 1, Number.MAX_SAFE_INTEGER, `${label}.targetId`)
		};
	}
	if (phase === "death") return { targetId: integer(exact(value, PAYLOAD_DEATH_KEYS, label).targetId, 1, Number.MAX_SAFE_INTEGER, `${label}.targetId`) };
	if (phase === "close") {
		const raw = exact(value, PAYLOAD_CLOSE_KEYS, label);
		boundedText(raw.reason, `${label}.reason`, 64);
		if (!CLOSE_REASONS.has(raw.reason)) throw new TypeError(`${label}.reason is unsupported`);
		return { reason: raw.reason };
	}
	throw new TypeError(`${label}.phase is unsupported`);
}
function checkedRecord(value, label) {
	const raw = exact(value, RECORD_KEYS, label);
	const eventId = integer(raw.eventId, 1, Number.MAX_SAFE_INTEGER, `${label}.eventId`);
	const parentId = raw.parentId === null ? null : integer(raw.parentId, 1, Number.MAX_SAFE_INTEGER, `${label}.parentId`);
	const rootId = boundedText(raw.rootId, `${label}.rootId`, COMBAT_EFFECT_FEED_MAX_ROOT_ID_LENGTH);
	if (!ROOT_ID_TOKEN.test(rootId)) throw new TypeError(`${label}.rootId is not canonical`);
	const tick = integer(raw.tick, 0, Number.MAX_SAFE_INTEGER, `${label}.tick`);
	if (!TYPES.has(raw.type)) throw new TypeError(`${label}.type is unsupported`);
	if (!(raw.type === "area" ? AREA_PHASES : raw.type === "contact" ? DIRECT_CONTACT_PHASES : PROJECTILE_PHASES).has(raw.phase)) throw new TypeError(`${label}.phase is unsupported`);
	return {
		eventId,
		parentId,
		payload: checkedPayload(raw.payload, raw.type, raw.phase, tick, `${label}.payload`),
		phase: raw.phase,
		rootId,
		tick,
		type: raw.type
	};
}
function appendChecked(state, record) {
	const checked = checkedRecord(record, "combat effect record");
	if (checked.eventId !== state.nextEventId) throw new TypeError("combat effect event IDs must be contiguous and monotonic");
	if (checked.type === "area" && checked.tick < state.lastAreaTick) throw new TypeError("combat effect event ticks must be monotonic");
	if (state.records.length >= 16384) throw new RangeError("combat effect feed record bound exceeded");
	const nextRecordBytes = state.recordBytes + (state.records.length === 0 ? 0 : 1) + UTF8.encode(canonicalJson(checked)).byteLength;
	const nextSnapshotBytes = UTF8.encode(FEED_SNAPSHOT_PREFIX).byteLength + nextRecordBytes + UTF8.encode(FEED_SNAPSHOT_SUFFIX).byteLength;
	const compactRecord = compactRecordFor(checked);
	const nextCompactRecordBytes = state.compactRecordBytes + (state.records.length === 0 ? 0 : 1) + UTF8.encode(canonicalJson(compactRecord)).byteLength;
	const nextCompactSnapshotBytes = UTF8.encode(FEED_SNAPSHOT_PREFIX).byteLength + nextCompactRecordBytes + UTF8.encode(FEED_COMPACT_SNAPSHOT_SUFFIX).byteLength;
	let nextWireVersion = state.wireVersion;
	if (nextWireVersion === 1 && nextSnapshotBytes > 1048576) {
		if (nextCompactSnapshotBytes > 1048576) throw new RangeError("combat effect feed exceeds its byte bound");
		nextWireVersion = COMBAT_EFFECT_FEED_COMPACT_VERSION;
	} else if (nextWireVersion === COMBAT_EFFECT_FEED_COMPACT_VERSION && nextCompactSnapshotBytes > 1048576) throw new RangeError("combat effect feed exceeds its byte bound");
	const root = state.roots.get(checked.rootId);
	if (checked.parentId === null) {
		if (checked.phase !== "open") throw new TypeError("combat effect roots must open with phase open");
		if (root !== void 0) throw new TypeError("combat effect root is duplicated");
		if (rootIdentity(checked.type, checked.payload) !== checked.rootId) throw new TypeError("combat effect root identity does not match its source identity");
		state.roots.set(checked.rootId, {
			closed: false,
			contactTargets: /* @__PURE__ */ new Map(),
			damagedTargets: /* @__PURE__ */ new Set(),
			deathTargets: /* @__PURE__ */ new Set(),
			impactTargets: /* @__PURE__ */ new Set(),
			impactSeen: false,
			lastEventId: checked.eventId,
			lastTick: checked.tick,
			phase: "open",
			turnSeen: false,
			type: checked.type,
			payload: checked.payload
		});
	} else {
		if (root === void 0) throw new TypeError("combat effect child names a missing root");
		if (root.closed) throw new TypeError("combat effect records after close are forbidden");
		if (checked.phase === "open") throw new TypeError("combat effect roots may only open at the root boundary");
		if (checked.tick < root.lastTick) throw new TypeError("combat effect child tick cannot precede its root");
		if (checked.parentId >= checked.eventId) throw new TypeError("combat effect parent must be earlier");
		const parent = state.records[checked.parentId - 1];
		if (parent === void 0 || parent.rootId !== checked.rootId) throw new TypeError("combat effect parent must belong to the same root");
		if (checked.parentId !== root.lastEventId) throw new TypeError("combat effect child must extend the active lineage");
		if (checked.type !== root.type) throw new TypeError("combat effect child type diverges from its root");
		if (!(checked.type === "area" ? {
			damage: /* @__PURE__ */ new Set(["damage", "impact"]),
			death: /* @__PURE__ */ new Set(["damage", "death"]),
			impact: /* @__PURE__ */ new Set(["open"]),
			close: /* @__PURE__ */ new Set([
				"damage",
				"death",
				"impact"
			])
		} : checked.type === "contact" ? {
			contact: /* @__PURE__ */ new Set(["open"]),
			damage: /* @__PURE__ */ new Set(["contact"]),
			death: /* @__PURE__ */ new Set(["damage"]),
			close: /* @__PURE__ */ new Set(["damage", "death"])
		} : {
			contact: /* @__PURE__ */ new Set([
				"contact",
				"damage",
				"death",
				"impact",
				"open",
				"turn"
			]),
			damage: /* @__PURE__ */ new Set([
				"contact",
				"damage",
				"impact"
			]),
			death: /* @__PURE__ */ new Set(["damage", "death"]),
			impact: /* @__PURE__ */ new Set([
				"contact",
				"open",
				"turn"
			]),
			turn: /* @__PURE__ */ new Set([
				"contact",
				"damage",
				"death",
				"open"
			]),
			close: /* @__PURE__ */ new Set([
				"contact",
				"damage",
				"death",
				"impact",
				"open",
				"turn"
			])
		})[checked.phase]?.has(parent.phase)) throw new TypeError(`combat effect ${checked.phase} has an invalid parent phase or closed lineage (parent ${parent.phase})`);
		if (checked.phase === "turn" && !(/* @__PURE__ */ new Set(["return", "travel"])).has(root.payload.direction)) throw new TypeError("combat effect turn is unsupported for this source direction");
		if (checked.phase === "damage") {
			const targetId = checked.payload.targetId;
			if (checked.type === "contact" && targetId !== root.payload.targetId) throw new TypeError("combat effect direct contact damage target diverges from its root");
			if (root.deathTargets.has(targetId)) throw new TypeError("combat effect damage follows target death");
			if (!root.damagedTargets.has(targetId) && !root.contactTargets.has(targetId) && !root.impactTargets.has(targetId)) throw new TypeError("combat effect damage target has no causal contact or impact");
			if (root.contactTargets.get(targetId) === "target-dead" || root.contactTargets.get(targetId) === "target-missing") throw new TypeError("combat effect damage target was not contactable");
			root.damagedTargets.add(targetId);
		} else if (checked.phase === "death") {
			if (checked.type === "contact" && checked.payload.targetId !== root.payload.targetId) throw new TypeError("combat effect direct contact death target diverges from its root");
			if (!root.damagedTargets.has(checked.payload.targetId)) throw new TypeError("combat effect death target has no causal damage");
			if (root.deathTargets.has(checked.payload.targetId)) throw new TypeError("combat effect death target is duplicated");
			root.deathTargets.add(checked.payload.targetId);
		} else if (checked.phase === "contact") {
			if (checked.type === "contact" && (root.contactTargets.size !== 0 || checked.payload.targetId !== root.payload.targetId || checked.payload.status !== "contact" || canonicalJson(checked.payload.point) !== canonicalJson(root.payload.point))) throw new TypeError("combat effect direct contact child diverges from its root");
			const previousStatus = root.contactTargets.get(checked.payload.targetId);
			if (previousStatus !== void 0 && previousStatus !== "contact" && previousStatus !== "observed") throw new TypeError("combat effect contact follows an uncontactable target");
			root.contactTargets.set(checked.payload.targetId, checked.payload.status);
		} else if (checked.phase === "impact") {
			if (root.impactSeen) throw new TypeError("combat effect impact is duplicated");
			root.impactSeen = true;
			for (const targetId of checked.payload.targetIds) root.impactTargets.add(targetId);
		} else if (checked.phase === "turn") {
			if (root.turnSeen) throw new TypeError("combat effect turn is duplicated");
			if (root.impactSeen) throw new TypeError("combat effect turn follows terminal impact");
			root.turnSeen = true;
		}
		if (checked.phase === "close") {
			if (checked.type === "area" && !root.impactSeen) throw new TypeError("combat effect area close requires a preceding impact");
			if (checked.type === "contact" && !root.damagedTargets.has(root.payload.targetId)) throw new TypeError("combat effect direct contact close requires a preceding damage");
			if (checked.type === "projectile" && !root.contactTargets.size && !root.impactSeen && !root.turnSeen) {
				const cancellation = /* @__PURE__ */ new Set([
					"cancelled",
					"explicit-cancel",
					"launch-cancelled",
					"source-dead",
					"target-missing"
				]);
				if (root.phase !== "open" || !cancellation.has(checked.payload.reason)) throw new TypeError("combat effect projectile close requires a preceding contact, impact, turn, or authentic cancellation");
			}
			root.closed = true;
		}
		root.phase = checked.phase;
		root.lastEventId = checked.eventId;
		root.lastTick = checked.tick;
	}
	state.records.push(freeze(checked));
	state.recordBytes = nextRecordBytes;
	state.compactRecordBytes = nextCompactRecordBytes;
	state.wireVersion = nextWireVersion;
	state.nextEventId += 1;
	if (checked.type === "area") state.lastAreaTick = checked.tick;
	return checked;
}
function emptyState(wireVersion = 1) {
	return {
		compactRecordBytes: 0,
		lastAreaTick: -1,
		nextEventId: 1,
		recordBytes: 0,
		records: [],
		roots: /* @__PURE__ */ new Map(),
		wireVersion
	};
}
function snapshotState(value, wireVersion = 1) {
	const snapshot = exact(value, SNAPSHOT_KEYS, "combat effect feed snapshot");
	if (snapshot.version !== 1) throw new TypeError("combat effect feed version is unsupported");
	const records = dense(snapshot.records, COMBAT_EFFECT_FEED_MAX_RECORDS, "combat effect feed records");
	const state = emptyState(wireVersion);
	for (let index = 0; index < records.length; index += 1) appendChecked(state, checkedRecord(records[index], `combat effect feed records[${index}]`));
	return state;
}
function compactRecordFor(record) {
	if (record.parentId === null) return [
		record.tick,
		COMPACT_TYPES.indexOf(record.type),
		record.payload
	];
	return [
		record.parentId,
		record.tick,
		COMPACT_PHASES.indexOf(record.phase),
		record.payload
	];
}
function snapshotFromState(state) {
	const snapshot = Object.freeze({
		version: 1,
		records: Object.freeze([...state.records])
	});
	NORMALIZED_SNAPSHOT_ROOTS.add(snapshot);
	NORMALIZED_SNAPSHOT_WIRE_VERSIONS.set(snapshot, state.wireVersion);
	return snapshot;
}
function canonicalJson(value) {
	if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number") {
		if (!Number.isSafeInteger(value)) throw new TypeError("combat effect feed numbers must be safe integers");
		return String(value);
	}
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
	throw new TypeError("combat effect feed contains unsupported data");
}
function apiForState(state) {
	const api = Object.create(null);
	Object.defineProperties(api, {
		bytes: {
			enumerable: false,
			get: () => serializeState(state)
		},
		fork: {
			enumerable: false,
			value: () => apiForState(forkState(state))
		},
		records: {
			enumerable: false,
			get: () => snapshotFromState(state).records
		},
		serialize: {
			enumerable: false,
			value: () => serializeState(state)
		},
		snapshot: {
			enumerable: false,
			value: () => snapshotFromState(state)
		},
		version: {
			enumerable: false,
			get: () => 1
		}
	});
	Object.freeze(api);
	FEED_STATES.set(api, state);
	return api;
}
function forkState(state) {
	return {
		compactRecordBytes: state.compactRecordBytes,
		lastAreaTick: state.lastAreaTick,
		nextEventId: state.nextEventId,
		recordBytes: state.recordBytes,
		records: [...state.records],
		roots: new Map([...state.roots].map(([rootId, root]) => [rootId, {
			...root,
			contactTargets: new Map(root.contactTargets),
			damagedTargets: new Set(root.damagedTargets),
			deathTargets: new Set(root.deathTargets),
			impactTargets: new Set(root.impactTargets)
		}])),
		wireVersion: state.wireVersion
	};
}
function serializeState(state) {
	const serialized = state.wireVersion === 1 ? canonicalJson(snapshotFromState(state)) : canonicalJson({
		records: state.records.map(compactRecordFor),
		version: COMBAT_EFFECT_FEED_COMPACT_VERSION
	});
	if (new TextEncoder().encode(serialized).byteLength > 1048576) throw new RangeError("combat effect feed exceeds its byte bound");
	return serialized;
}
function createCombatEffectFeed() {
	return apiForState(emptyState());
}
function appendCombatEffectEvent(feed, value) {
	const state = FEED_STATES.get(feed);
	if (state === void 0) throw new TypeError("combat effect feed authority is invalid");
	const raw = exact(value, [
		"parentId",
		"payload",
		"phase",
		"rootId",
		"tick",
		"type"
	], "combat effect append");
	const root = state.roots.get(raw.rootId);
	if (raw.phase === "close" && raw.type === "projectile" && raw.parentId !== null && root !== void 0 && !root.closed && root.phase === "open" && raw.parentId === root.lastEventId && raw.payload !== null && typeof raw.payload === "object" && !Array.isArray(raw.payload) && raw.payload.reason === "complete" && (root.payload.direction === "pierce" || root.payload.direction === "pellet")) {
		const center = root.payload.to ?? root.payload.segments.at(-1)?.to;
		if (center === void 0 || center === null) throw new TypeError("combat effect no-contact close has no terminal point");
		const impact = {
			eventId: state.nextEventId,
			parentId: raw.parentId,
			payload: {
				center,
				radius: root.payload.radius,
				targetIds: []
			},
			phase: "impact",
			rootId: raw.rootId,
			tick: raw.tick,
			type: raw.type
		};
		const close = {
			eventId: state.nextEventId + 1,
			parentId: impact.eventId,
			payload: raw.payload,
			phase: raw.phase,
			rootId: raw.rootId,
			tick: raw.tick,
			type: raw.type
		};
		const preview = forkState(state);
		appendChecked(preview, impact);
		appendChecked(preview, close);
		appendChecked(state, impact);
		return freeze(clone(appendChecked(state, close)));
	}
	return freeze(clone(appendChecked(state, {
		eventId: state.nextEventId,
		...raw
	})));
}
function appendCombatEffectRoot(feed, value) {
	const raw = exact(value, value !== null && typeof value === "object" && Object.getOwnPropertyDescriptor(value, "type")?.value === "contact" ? [
		"point",
		"sequence",
		"sourceId",
		"targetId",
		"tick",
		"type"
	] : [
		"direction",
		"effectId",
		"from",
		"impactTick",
		"projectileId",
		"radius",
		"segments",
		"sequence",
		"sourceId",
		"to",
		"tick",
		"type"
	], "combat effect root");
	const type = raw.type;
	const checkedPayload = checkedOpenPayload(type === "contact" ? {
		point: raw.point,
		sequence: raw.sequence,
		sourceId: raw.sourceId,
		targetId: raw.targetId
	} : {
		direction: raw.direction,
		effectId: raw.effectId,
		from: raw.from,
		impactTick: raw.impactTick,
		projectileId: raw.projectileId,
		radius: raw.radius,
		segments: raw.segments,
		sequence: raw.sequence,
		sourceId: raw.sourceId,
		to: raw.to
	}, "combat effect root.payload", type, raw.tick);
	return appendCombatEffectEvent(feed, {
		parentId: null,
		payload: checkedPayload,
		phase: "open",
		rootId: rootIdentity(type, checkedPayload),
		tick: raw.tick,
		type
	});
}
function appendCombatEffectChild(feed, root, phase, payload, tick, type = "projectile") {
	const child = appendCombatEffectEvent(feed, {
		parentId: root.lastEventId,
		payload,
		phase,
		rootId: root.rootId,
		tick,
		type
	});
	root.lastEventId = child.eventId;
	return child;
}
function appendCombatEffectProjectileRoot(feed, projectile, from, to, tick, impactTick, radius = 0) {
	const identity = projectile.projectileIdentity;
	const root = appendCombatEffectRoot(feed, {
		direction: identity.direction,
		effectId: null,
		from,
		impactTick,
		projectileId: identity.projectileId,
		radius,
		segments: [],
		sequence: identity.attackSequence,
		sourceId: identity.sourceId,
		tick,
		to,
		type: "projectile"
	});
	return {
		lastEventId: root.eventId,
		rootId: root.rootId
	};
}
function appendCombatEffectDirectContact(feed, value) {
	const state = FEED_STATES.get(feed);
	if (state === void 0) throw new TypeError("combat effect feed authority is invalid");
	const raw = exact(value, [
		"amount",
		"currentHealthAfter",
		"currentHealthBefore",
		"death",
		"ordinal",
		"point",
		"sourceId",
		"targetId",
		"tick"
	], "combat effect direct contact");
	const tick = integer(raw.tick, 0, Number.MAX_SAFE_INTEGER, "direct contact.tick");
	const ordinal = integer(raw.ordinal, 0, Number.MAX_SAFE_INTEGER, "direct contact.ordinal");
	if (typeof raw.death !== "boolean") throw new TypeError("direct contact.death must be boolean");
	const point = canonicalPoint(raw.point, "direct contact.point");
	const sourceId = integer(raw.sourceId, 1, Number.MAX_SAFE_INTEGER, "direct contact.sourceId");
	const targetId = integer(raw.targetId, 1, Number.MAX_SAFE_INTEGER, "direct contact.targetId");
	const amount = integer(raw.amount, 0, Number.MAX_SAFE_INTEGER, "direct contact.amount");
	const currentHealthBefore = integer(raw.currentHealthBefore, 0, Number.MAX_SAFE_INTEGER, "direct contact.currentHealthBefore");
	const currentHealthAfter = integer(raw.currentHealthAfter, 0, Number.MAX_SAFE_INTEGER, "direct contact.currentHealthAfter");
	if (currentHealthAfter > currentHealthBefore || currentHealthBefore - currentHealthAfter > amount || raw.death && (currentHealthBefore === 0 || currentHealthAfter !== 0)) throw new TypeError("direct contact is not a canonical damage transition");
	const previewFeed = apiForState(forkState(state));
	const rootRecord = appendCombatEffectRoot(previewFeed, {
		point,
		sequence: `${tick}:${ordinal}`,
		sourceId,
		targetId,
		tick,
		type: "contact"
	});
	const root = {
		lastEventId: rootRecord.eventId,
		rootId: rootRecord.rootId
	};
	appendCombatEffectChild(previewFeed, root, "contact", {
		point,
		status: "contact",
		subId: null,
		targetId
	}, tick, "contact");
	appendCombatEffectChild(previewFeed, root, "damage", {
		amount,
		currentHealthAfter,
		currentHealthBefore,
		targetId
	}, tick, "contact");
	if (raw.death) appendCombatEffectChild(previewFeed, root, "death", { targetId }, tick, "contact");
	appendCombatEffectChild(previewFeed, root, "close", { reason: "complete" }, tick, "contact");
	const staged = FEED_STATES.get(previewFeed);
	if (staged === void 0) throw new TypeError("combat effect preview authority is invalid");
	Object.assign(state, staged);
	return Object.freeze(state.records.slice(-(raw.death ? 5 : 4)));
}
function appendCombatEffectStructureContacts(feed, value) {
	const state = FEED_STATES.get(feed);
	if (state === void 0) throw new TypeError("combat effect feed authority is invalid");
	const raw = exact(value, [
		"acceptedHits",
		"events",
		"hits",
		"knownStructures",
		"tick",
		"units"
	], "direct structure contacts");
	const tick = integer(raw.tick, 0, Number.MAX_SAFE_INTEGER, "direct structure contacts.tick");
	const contacts = raw.events.filter((event) => event.tick === tick && event.type === "external-unit-contact");
	const damages = raw.events.filter((event) => event.tick === tick && event.type === "damage");
	const usedContacts = /* @__PURE__ */ new Set();
	const usedDamages = /* @__PURE__ */ new Set();
	const usedAcceptedHits = /* @__PURE__ */ new Set();
	const resolved = [];
	for (const [ordinal, hit] of raw.hits.entries()) {
		if (hit.targetKind !== "unit") continue;
		const sourceId = `building:${hit.sourceId}`;
		const source = raw.knownStructures.find(({ id }) => id === hit.sourceId);
		if (source === void 0 || source.structureId !== sourceId || source.kind !== "structure" || source.layer !== "ground") throw new TypeError("direct structure contact source is not admitted");
		const contactIndex = contacts.findIndex((event, index) => !usedContacts.has(index) && event.contactTick === tick && event.damage === hit.amount && event.delivery === "melee" && event.sourceId === sourceId && event.targetUnitId === hit.targetId);
		if (contactIndex === -1) {
			if (raw.events.some((event) => event.tick === tick && event.type === "building-contact-missed" && event.amount === hit.amount && event.origin === hit.origin && event.sourceId === hit.sourceId && event.targetId === hit.targetId && event.targetKind === "unit")) continue;
			throw new TypeError("direct structure contact has no resolved contact event");
		}
		const acceptedIndex = raw.acceptedHits.findIndex((entry, index) => !usedAcceptedHits.has(index) && entry.damage === hit.amount && entry.delivery === "melee" && entry.sourceId === sourceId && entry.targetUnitId === hit.targetId);
		if (acceptedIndex === -1) throw new TypeError("direct structure contact source is not admitted");
		const damageIndex = damages.findIndex((event, index) => !usedDamages.has(index) && event.externalSourceId === sourceId && event.amount === hit.amount && event.targetId === hit.targetId);
		const target = raw.units.find(({ id }) => id === hit.targetId);
		if (damageIndex === -1 || target === void 0) throw new TypeError("direct structure contact has no resolved damage event");
		usedContacts.add(contactIndex);
		usedDamages.add(damageIndex);
		usedAcceptedHits.add(acceptedIndex);
		const damage = damages[damageIndex];
		const death = damage.currentHealthBefore > 0 && damage.currentHealthAfter === 0;
		if (death && !raw.events.some((event) => event.tick === tick && event.type === "death" && event.targetId === hit.targetId)) throw new TypeError("lethal structure contact has no resolved death event");
		resolved.push({
			amount: damage.amount,
			currentHealthAfter: damage.currentHealthAfter,
			currentHealthBefore: damage.currentHealthBefore,
			death,
			ordinal,
			point: target.position,
			sourceId: hit.sourceId,
			targetId: hit.targetId,
			tick
		});
	}
	const preview = apiForState(forkState(state));
	for (const contact of resolved) appendCombatEffectDirectContact(preview, contact);
	Object.assign(state, FEED_STATES.get(preview));
}
function validateCombatEffectFeed(value) {
	if (NORMALIZED_SNAPSHOT_ROOTS.has(value)) return value;
	const trusted = FEED_STATES.get(value);
	if (trusted !== void 0) return snapshotFromState(snapshotState(snapshotFromState(trusted), trusted.wireVersion));
	return snapshotFromState(snapshotState(value));
}
function serializeCombatEffectFeed(value) {
	const state = FEED_STATES.get(value);
	if (state !== void 0) return serializeState(state);
	return serializeState(snapshotState(value, NORMALIZED_SNAPSHOT_WIRE_VERSIONS.get(value) ?? 1));
}
function combatEffectFeedSnapshot(value) {
	const state = FEED_STATES.get(value);
	if (state !== void 0) return snapshotFromState(state);
	return validateCombatEffectFeed(value);
}
var COMBAT_EFFECT_FEED_COMPACT_VERSION, COMBAT_EFFECT_FEED_MAX_RECORDS, COMBAT_EFFECT_FEED_MAX_ROOT_ID_LENGTH, COMBAT_EFFECT_FEED_MAX_COORDINATE, FEED_SNAPSHOT_PREFIX, FEED_SNAPSHOT_SUFFIX, FEED_COMPACT_SNAPSHOT_SUFFIX, UTF8, RECORD_KEYS, SNAPSHOT_KEYS, PAYLOAD_OPEN_KEYS, PAYLOAD_DIRECT_CONTACT_OPEN_KEYS, PAYLOAD_TURN_KEYS, PAYLOAD_CONTACT_KEYS, PAYLOAD_IMPACT_KEYS, PAYLOAD_DAMAGE_KEYS, PAYLOAD_DEATH_KEYS, PAYLOAD_CLOSE_KEYS, TYPES, PROJECTILE_DIRECTIONS, PROJECTILE_PHASES, AREA_PHASES, DIRECT_CONTACT_PHASES, CONTACT_STATUSES, CLOSE_REASONS, ROOT_ID_TOKEN, FEED_STATES, NORMALIZED_SNAPSHOT_ROOTS, NORMALIZED_SNAPSHOT_WIRE_VERSIONS, COMPACT_TYPES, COMPACT_PHASES;
function init_combat_effect_feed() {
	return (init_combat_effect_feed = __esmMin((() => {
		COMBAT_EFFECT_FEED_COMPACT_VERSION = 2;
		COMBAT_EFFECT_FEED_MAX_RECORDS = 16384;
		COMBAT_EFFECT_FEED_MAX_ROOT_ID_LENGTH = 8192;
		COMBAT_EFFECT_FEED_MAX_COORDINATE = 65536;
		FEED_SNAPSHOT_PREFIX = "{\"records\":[";
		FEED_SNAPSHOT_SUFFIX = "],\"version\":1}";
		FEED_COMPACT_SNAPSHOT_SUFFIX = "],\"version\":2}";
		UTF8 = new TextEncoder();
		RECORD_KEYS = [
			"eventId",
			"parentId",
			"payload",
			"phase",
			"rootId",
			"tick",
			"type"
		];
		SNAPSHOT_KEYS = ["records", "version"];
		PAYLOAD_OPEN_KEYS = [
			"direction",
			"effectId",
			"from",
			"impactTick",
			"projectileId",
			"radius",
			"segments",
			"sequence",
			"sourceId",
			"to"
		];
		PAYLOAD_DIRECT_CONTACT_OPEN_KEYS = [
			"point",
			"sequence",
			"sourceId",
			"targetId"
		];
		PAYLOAD_TURN_KEYS = ["point"];
		PAYLOAD_CONTACT_KEYS = [
			"point",
			"status",
			"subId",
			"targetId"
		];
		PAYLOAD_IMPACT_KEYS = [
			"center",
			"radius",
			"targetIds"
		];
		PAYLOAD_DAMAGE_KEYS = [
			"amount",
			"currentHealthAfter",
			"currentHealthBefore",
			"targetId"
		];
		PAYLOAD_DEATH_KEYS = ["targetId"];
		PAYLOAD_CLOSE_KEYS = ["reason"];
		TYPES = /* @__PURE__ */ new Set([
			"area",
			"projectile",
			"contact"
		]);
		PROJECTILE_DIRECTIONS = /* @__PURE__ */ new Set([
			"pierce",
			"pellet",
			"projectile",
			"return",
			"tower-to-unit",
			"travel",
			"unit-to-tower",
			"unit-to-unit"
		]);
		PROJECTILE_PHASES = /* @__PURE__ */ new Set([
			"close",
			"contact",
			"damage",
			"death",
			"impact",
			"open",
			"turn"
		]);
		AREA_PHASES = /* @__PURE__ */ new Set([
			"close",
			"damage",
			"death",
			"impact",
			"open"
		]);
		DIRECT_CONTACT_PHASES = /* @__PURE__ */ new Set([
			"close",
			"contact",
			"damage",
			"death",
			"open"
		]);
		CONTACT_STATUSES = /* @__PURE__ */ new Set([
			"contact",
			"target-dead",
			"target-missing",
			"observed"
		]);
		CLOSE_REASONS = /* @__PURE__ */ new Set([
			"complete",
			"impact-resolved",
			"launch-cancelled",
			"source-dead",
			"explicit-cancel",
			"target-missing",
			"cancelled"
		]);
		ROOT_ID_TOKEN = /^[a-z][A-Za-z0-9.%_~!\-]*(?:\.[A-Za-z0-9.%_~!\-]+){5}$/u;
		FEED_STATES = /* @__PURE__ */ new WeakMap();
		NORMALIZED_SNAPSHOT_ROOTS = /* @__PURE__ */ new WeakSet();
		NORMALIZED_SNAPSHOT_WIRE_VERSIONS = /* @__PURE__ */ new WeakMap();
		COMPACT_TYPES = [
			"area",
			"projectile",
			"contact"
		];
		COMPACT_PHASES = [
			"open",
			"contact",
			"damage",
			"death",
			"impact",
			"turn",
			"close"
		];
	})))();
}
//#endregion
export { appendCombatEffectStructureContacts as a, createCombatEffectFeed as c, validateCombatEffectFeed as d, DamageSystem as f, appendCombatEffectRoot as i, init_combat_effect_feed as l, appendCombatEffectEvent as n, combatEffectFeedSnapshot as o, init_damage as p, appendCombatEffectProjectileRoot as r, combatEffectRootId as s, appendCombatEffectChild as t, serializeCombatEffectFeed as u };
