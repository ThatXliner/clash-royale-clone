import { t as __esmMin } from "../../../rolldown-runtime-Cl99QfTQ.js";
import { d as validateArenaPoint, s as init_arena_geometry } from "../../index~public/ui-arena-shell~src/rl/environment~src/ui/arena-shell-entry-BC9aY_Zk.js";
import { $ as DeckCycle, M as admitSessionTroopProjectileRuntimeProfiles, N as init_session_troop_projectile_runtime, et as init_deck, it as init_deployment, k as admitSessionTroopProjectileRuntimeFromBattleSnapshot, rt as evaluateDeployment, t as init_elixir } from "../../index~public/ui-arena-shell~src/rl/environment~src/ui/arena-shell-entry-D5weJ7hm.js";
import { c as LiveBattle$1, g as isAuthenticGameSession, h as init_battle_continuation_kernel, m as getGameSessionAudioReplay, r as ElixirMatch } from "../../index~public/ui-arena-shell~src/rl/environment~src/ui/arena-shell-entry-0OqWVvCI.js";
import { n as init_game_session } from "../rl/environment~src/ui/arena-shell-entry-B1ekJK2B.js";
//#region src/audio/audio-events.js
function deepFreeze$1(value) {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) deepFreeze$1(child);
		Object.freeze(value);
	}
	return value;
}
function isPlainObject(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return (prototype === Object.prototype || prototype === null) && Object.getOwnPropertySymbols(value).length === 0;
}
function exactObject(value, keys, label) {
	if (!isPlainObject(value)) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	const wanted = [...keys].sort();
	if (actual.some((key) => typeof key !== "string") || actual.length !== wanted.length || [...actual].sort().some((key, index) => key !== wanted[index])) throw new TypeError(`${label} has an invalid shape`);
	const result = {};
	for (const key of keys) {
		const descriptor = descriptors[key];
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
		result[key] = descriptor.value;
	}
	return result;
}
function exactArray(value, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError(`${label} must be an array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	for (const key of Reflect.ownKeys(descriptors)) {
		if (key === "length") continue;
		if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) throw new TypeError(`${label} must contain only indexed data properties`);
		const descriptor = descriptors[key];
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}[${key}] must be an enumerable data property`);
	}
	for (let index = 0; index < value.length; index += 1) if (!Object.hasOwn(value, index)) throw new TypeError(`${label} must not be sparse`);
	return Array.from(value);
}
function canonicalize$1(value) {
	if (Array.isArray(value)) return value.map(canonicalize$1);
	if (value !== null && typeof value === "object") {
		const result = {};
		for (const key of Object.keys(value).sort()) result[key] = canonicalize$1(value[key]);
		return result;
	}
	return value;
}
function canonicalJson$1(value) {
	return JSON.stringify(canonicalize$1(value));
}
function checkedJson(value, label, budget = { nodes: 0 }, depth = 0) {
	budget.nodes += 1;
	if (budget.nodes > 2048) throw new RangeError(`${label} exceeds the node bound`);
	if (depth > 16) throw new RangeError(`${label} exceeds the depth bound`);
	if (value === null || typeof value === "boolean") return value;
	if (typeof value === "number") {
		if (!Number.isSafeInteger(value)) throw new TypeError(`${label} numbers must be safe integers`);
		return value;
	}
	if (typeof value === "string") {
		if ([...value].length > 512) throw new RangeError(`${label} strings exceed the length bound`);
		return value;
	}
	if (Array.isArray(value)) {
		const values = exactArray(value, label);
		if (values.length > 256) throw new RangeError(`${label} exceeds the array bound`);
		return values.map((child, index) => checkedJson(child, `${label}[${index}]`, budget, depth + 1));
	}
	if (isPlainObject(value)) {
		const descriptors = Object.getOwnPropertyDescriptors(value);
		const keys = Reflect.ownKeys(descriptors);
		if (keys.length > 128) throw new RangeError(`${label} exceeds the key bound`);
		const result = {};
		for (const key of [...keys].sort()) {
			if (typeof key !== "string" || [...key].length > 128) throw new TypeError(`${label} contains an invalid key`);
			if (key === "__proto__" || key === "constructor" || key === "prototype") throw new TypeError(`${label} contains an unsafe key`);
			const descriptor = descriptors[key];
			if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
			result[key] = checkedJson(descriptor.value, `${label}.${key}`, budget, depth + 1);
		}
		return result;
	}
	throw new TypeError(`${label} must contain only canonical data`);
}
function checkedEntry(value, label) {
	const entry = exactObject(value, [
		"event",
		"sequence",
		"tick"
	], label);
	if (!Number.isSafeInteger(entry.sequence) || entry.sequence < 0) throw new TypeError(`${label}.sequence must be a non-negative safe integer`);
	if (!Number.isSafeInteger(entry.tick) || entry.tick < 0 || entry.tick > 18e3) throw new TypeError(`${label}.tick must be an in-range non-negative safe integer`);
	const event = checkedJson(entry.event, `${label}.event`);
	if (!isPlainObject(event) || typeof event.type !== "string" || !/^[a-z0-9_-]{1,128}$/.test(event.type)) throw new TypeError(`${label}.event.type must be a canonical event type`);
	if (Object.hasOwn(event, "tick") && event.tick !== entry.tick) throw new TypeError(`${label}.event.tick must match ${label}.tick`);
	if (event.type === "tower_evidence") checkedTowerEvidenceEvent(event, `${label}.event`);
	return {
		event,
		sequence: entry.sequence,
		tick: entry.tick
	};
}
function checkedTowerEvidenceEvent(event, label) {
	if (event.accepted === true) {
		const checked = exactObject(event, [
			"accepted",
			"destroyedTowerIds",
			"sequence",
			"tick",
			"type"
		], label);
		if (!Number.isSafeInteger(checked.sequence) || checked.sequence < 0) throw new TypeError(`${label}.sequence must be a non-negative safe integer`);
		const ids = exactArray(checked.destroyedTowerIds, `${label}.destroyedTowerIds`);
		if (ids.length > MATCH_TOWER_IDS.length) throw new RangeError(`${label}.destroyedTowerIds exceeds the tower bound`);
		let previousIndex = -1;
		for (let index = 0; index < ids.length; index += 1) {
			const towerIndex = MATCH_TOWER_IDS.indexOf(ids[index]);
			if (!MATCH_TOWER_ID_SET.has(ids[index]) || towerIndex <= previousIndex) throw new TypeError(`${label}.destroyedTowerIds must contain unique canonical match tower IDs`);
			previousIndex = towerIndex;
		}
		return;
	}
	if (event.accepted === false) {
		const checked = exactObject(event, [
			"accepted",
			"reason",
			"sequence",
			"tick",
			"type"
		], label);
		if (checked.reason !== "match_ended" || !Number.isSafeInteger(checked.sequence) || checked.sequence < 0) throw new TypeError(`${label} is not a canonical rejected tower evidence event`);
		return;
	}
	throw new TypeError(`${label}.accepted must be a boolean`);
}
function cue(family, reason = "mapped") {
	return {
		cueId: AUDIO_PRODUCTION_CUE_TAXONOMY[family],
		family,
		reason
	};
}
function movementSourceKey(event) {
	for (const key of [
		"entityId",
		"sourceId",
		"unitId",
		"id"
	]) {
		const value = event[key];
		if (typeof value === "string" && /^[a-zA-Z0-9:_-]{1,128}$/.test(value)) return `${key}:${value}`;
		if (Number.isSafeInteger(value) && value >= 0) return `${key}:${value}`;
	}
	return null;
}
function isMovementStart(event) {
	if (MOVEMENT_TYPES.has(event.type)) return true;
	return (event.type === "move" || event.type === "moved") && (event.phase === "start" || event.state === "start");
}
function classify(event, creditedTowerIds, movementLastTicks, sequence) {
	const type = event.type;
	if (DEPLOY_TYPES.has(type) && event.accepted === false) return {
		cueId: null,
		family: null,
		reason: "rejected"
	};
	if ((type === "impact" || type === "projectile-impact") && event.status !== "contact") return {
		cueId: null,
		family: null,
		reason: "no-contact"
	};
	if (type === "tower_evidence") {
		if (!event.accepted) return {
			cueId: null,
			family: null,
			reason: "rejected-evidence"
		};
		const newlyCredited = event.destroyedTowerIds.filter((towerId) => !creditedTowerIds.has(towerId));
		for (const towerId of newlyCredited) creditedTowerIds.add(towerId);
		return newlyCredited.length > 0 ? cue("crown") : {
			cueId: null,
			family: null,
			reason: "no-new-destruction"
		};
	}
	if (type === "overtime_started") return cue("overtime");
	if (type === "tiebreak") return cue("tiebreak");
	if (type === "match_end") return cue("matchEnd");
	if (TOWER_TYPES.has(type)) return cue("tower");
	if (DEPLOY_TYPES.has(type)) return cue("deploy");
	if (ATTACK_TYPES.has(type)) return cue("attack");
	if (LAUNCH_TYPES.has(type)) return cue("launch");
	if (IMPACT_TYPES.has(type)) return cue("impact");
	if (DAMAGE_TYPES.has(type)) return cue("damage");
	if (DEATH_TYPES.has(type)) return cue("death");
	if (isMovementStart(event)) {
		const sourceKey = movementSourceKey(event) ?? `sequence:${sequence}`;
		const previousTick = movementLastTicks.get(sourceKey);
		if (previousTick !== void 0 && event.tick - previousTick < MOVEMENT_MIN_INTERVAL_TICKS) return {
			cueId: null,
			family: null,
			reason: "rate-limited"
		};
		movementLastTicks.set(sourceKey, event.tick);
		return cue("movement");
	}
	return {
		cueId: null,
		family: null,
		reason: IRRELEVANT_TYPES.has(type) ? "irrelevant" : "unknown"
	};
}
function recordFor(entry, creditedTowerIds, movementLastTicks) {
	return deepFreeze$1({
		...classify(entry.event, creditedTowerIds, movementLastTicks, entry.sequence),
		sequence: entry.sequence,
		tick: entry.tick,
		type: entry.event.type
	});
}
function isolated$2(value) {
	return deepFreeze$1(JSON.parse(canonicalJson$1(value)));
}
function utf8Length(value) {
	return new TextEncoder().encode(value).byteLength;
}
var AUDIO_EVENT_MAX_RECORDS, AUDIO_EVENT_MAX_TICK, AUDIO_CUE_TAXONOMY, AUDIO_PRODUCTION_CUE_TAXONOMY, DEPLOY_TYPES, ATTACK_TYPES, LAUNCH_TYPES, IMPACT_TYPES, DAMAGE_TYPES, DEATH_TYPES, TOWER_TYPES, MOVEMENT_TYPES, MOVEMENT_MIN_INTERVAL_TICKS, MATCH_TOWER_IDS, MATCH_TOWER_ID_SET, IRRELEVANT_TYPES, EMPTY_SNAPSHOT_BYTES, AudioEventProjection;
function init_audio_events() {
	return (init_audio_events = __esmMin((() => {
		AUDIO_EVENT_MAX_RECORDS = 16384;
		AUDIO_EVENT_MAX_TICK = 18e3;
		AUDIO_CUE_TAXONOMY = deepFreeze$1({
			attack: "strike-release",
			crown: "crown-award",
			damage: "vital-damage",
			death: "unit-fall",
			deploy: "field-deploy",
			impact: "contact-impact",
			launch: "bolt-flight",
			matchEnd: "match-complete",
			overtime: "phase-overtime",
			tiebreak: "phase-tiebreak",
			tower: "tower-fall"
		});
		AUDIO_PRODUCTION_CUE_TAXONOMY = deepFreeze$1({
			...AUDIO_CUE_TAXONOMY,
			movement: "soft-locomotion",
			cardSelect: "card-select",
			cardPlay: "card-play",
			uiConfirm: "ui-confirm",
			uiReject: "ui-reject",
			uiToggle: "ui-toggle"
		});
		DEPLOY_TYPES = /* @__PURE__ */ new Set([
			"building-deployed",
			"card-play",
			"clone-cast",
			"deployed",
			"play",
			"spawn",
			"spawn-batch",
			"spawn-spell-batch",
			"spawn-spell-cast",
			"spawn-spell-child",
			"unit-cloned"
		]);
		ATTACK_TYPES = /* @__PURE__ */ new Set([
			"attack",
			"attack-launched",
			"attack-ready",
			"shot-ready"
		]);
		LAUNCH_TYPES = /* @__PURE__ */ new Set([
			"attack-projectile-launched",
			"chain-start",
			"dash-launched",
			"jump-takeoff",
			"launch",
			"pellet-volley-launch",
			"periodic-cast",
			"pierce-launch",
			"projectile-launch",
			"projectile-launched",
			"return-launch",
			"roll-launch",
			"spell-cast",
			"target-kill-projectile-launched",
			"three-wave-cast",
			"three-wave-launch",
			"travel-launch"
		]);
		IMPACT_TYPES = /* @__PURE__ */ new Set([
			"attack-contact",
			"chain-hit",
			"hit",
			"impact",
			"pellet-contact",
			"pierce-hit",
			"projectile-contact",
			"projectile-impact",
			"return-contact",
			"return-hit",
			"roll-contact",
			"roll-hit",
			"spawn-spell-impact",
			"spell-hit",
			"spell-impact",
			"three-wave-contact",
			"three-wave-hit",
			"three-wave-impact",
			"travel-contact",
			"travel-impact"
		]);
		DAMAGE_TYPES = /* @__PURE__ */ new Set([
			"body-damage",
			"building-damaged",
			"chain-damage",
			"damage",
			"damage-applied",
			"dash-damage",
			"pellet-aggregate-damage",
			"pellet-damage",
			"projectile-damage",
			"roll-damage",
			"shield-damage",
			"spell-damage",
			"three-wave-damage",
			"travel-building-damaged"
		]);
		DEATH_TYPES = /* @__PURE__ */ new Set([
			"building-destroyed",
			"chain-death",
			"death",
			"died",
			"pellet-death",
			"projectile-death",
			"roll-death",
			"shield-break",
			"source-killed",
			"spell-death",
			"target-destroyed",
			"target-died",
			"three-wave-death",
			"travel-building-destroyed",
			"travel-source-died",
			"travel-target-died"
		]);
		TOWER_TYPES = /* @__PURE__ */ new Set(["tower-destroyed"]);
		MOVEMENT_TYPES = /* @__PURE__ */ new Set([
			"locomotion-start",
			"movement-begin",
			"movement-start",
			"unit-move-start",
			"unit-moved-start",
			"walk-start"
		]);
		MOVEMENT_MIN_INTERVAL_TICKS = 12;
		MATCH_TOWER_IDS = Object.freeze([
			"north:central",
			"north:lane:left",
			"north:lane:right",
			"south:central",
			"south:lane:left",
			"south:lane:right"
		]);
		MATCH_TOWER_ID_SET = new Set(MATCH_TOWER_IDS);
		IRRELEVANT_TYPES = /* @__PURE__ */ new Set([
			"acquire-target",
			"advance",
			"cast",
			"charge-armed",
			"charge-consumed",
			"charge-reset",
			"combat-reset",
			"cooldown-ended",
			"death-triggered",
			"deploy",
			"effect",
			"encounter-complete",
			"form-transition",
			"generated",
			"grant",
			"heal",
			"hide-applied",
			"interrupted",
			"lethal",
			"move",
			"moved",
			"pierce-command",
			"pierce-complete",
			"projectile-fizzle",
			"reveal-applied",
			"return-command",
			"return-complete",
			"return-turn",
			"roll-expired",
			"roll-stopped",
			"slow-applied",
			"slow-expired",
			"source-expired",
			"spend",
			"stage-changed",
			"stun-applied",
			"stun-expired",
			"target",
			"target-acquired",
			"target-lost",
			"targetability-changed",
			"time-advanced",
			"tower-activated",
			"travel-building-emerged",
			"underground-travel-moved",
			"underground-travel-started"
		]);
		EMPTY_SNAPSHOT_BYTES = utf8Length(canonicalJson$1({
			entries: [],
			version: 1
		}));
		AudioEventProjection = class AudioEventProjection {
			#creditedTowerIds = /* @__PURE__ */ new Set();
			#entryBytes = 0;
			#entries = [];
			#movementLastTicks = /* @__PURE__ */ new Map();
			#records = [];
			#lastTick = null;
			get state() {
				return isolated$2({
					lastTick: this.#lastTick,
					nextSequence: this.#entries.length,
					recordCount: this.#records.length,
					creditedTowerIds: MATCH_TOWER_IDS.filter((towerId) => this.#creditedTowerIds.has(towerId))
				});
			}
			get records() {
				return isolated$2(this.#records);
			}
			get cues() {
				return isolated$2(this.#records.filter((record) => record.cueId !== null));
			}
			project(entry) {
				return this.projectBatch([entry])[0];
			}
			projectBatch(entries) {
				const values = exactArray(entries, "audio event batch");
				if (values.length > 16384 - this.#entries.length) throw new RangeError(`audio event records cannot exceed ${AUDIO_EVENT_MAX_RECORDS}`);
				const checked = [];
				let expectedSequence = this.#entries.length;
				let lastTick = this.#lastTick;
				for (let index = 0; index < values.length; index += 1) {
					const entry = checkedEntry(values[index], `audio event batch[${index}]`);
					if (entry.sequence !== expectedSequence) throw new RangeError(`audio event batch[${index}].sequence must be ${expectedSequence}`);
					if (lastTick !== null && entry.tick < lastTick) throw new RangeError(`audio event batch[${index}].tick must not move backwards`);
					checked.push(entry);
					expectedSequence += 1;
					lastTick = entry.tick;
				}
				let entryBytes = this.#entryBytes;
				for (let index = 0; index < checked.length; index += 1) {
					if (this.#entries.length + index > 0) entryBytes += 1;
					entryBytes += utf8Length(canonicalJson$1(checked[index]));
				}
				if (EMPTY_SNAPSHOT_BYTES + entryBytes > 4194304) throw new RangeError("audio event history exceeds the snapshot byte bound");
				const creditedTowerIds = new Set(this.#creditedTowerIds);
				const movementLastTicks = new Map(this.#movementLastTicks);
				const records = checked.map((entry) => recordFor(entry, creditedTowerIds, movementLastTicks));
				this.#entries.push(...checked);
				this.#records.push(...records);
				this.#creditedTowerIds = creditedTowerIds;
				this.#movementLastTicks = movementLastTicks;
				this.#entryBytes = entryBytes;
				if (checked.length > 0) this.#lastTick = checked.at(-1).tick;
				return isolated$2(records);
			}
			serialize() {
				return canonicalJson$1({
					entries: this.#entries,
					version: 1
				});
			}
			static restore(serialized) {
				if (typeof serialized !== "string") throw new TypeError("audio snapshot must be a string");
				if (utf8Length(serialized) > 4194304) throw new RangeError("audio snapshot exceeds the byte bound");
				let parsed;
				try {
					parsed = JSON.parse(serialized);
				} catch {
					throw new TypeError("audio snapshot must be valid JSON");
				}
				const snapshot = exactObject(parsed, ["entries", "version"], "audio snapshot");
				if (snapshot.version !== 1) throw new TypeError("audio snapshot version is unsupported");
				if (canonicalJson$1(parsed) !== serialized) throw new TypeError("audio snapshot must use canonical encoding");
				const projection = new AudioEventProjection();
				projection.projectBatch(snapshot.entries);
				return projection;
			}
		};
	})))();
}
//#endregion
//#region src/audio/audio-provenance.json
var assets$1, author$1, license$1, recipes$1, schema$1, audio_provenance_default;
function init_audio_provenance() {
	return (init_audio_provenance = __esmMin((() => {
		assets$1 = [];
		author$1 = {
			"id": "repository-contributors",
			"statement": "Created from scratch for this repository without third-party or comparison audio."
		};
		license$1 = {
			"id": "CC0-1.0",
			"statement": "The authors dedicate these procedural recipes and their generated waveforms to the public domain under CC0-1.0."
		};
		recipes$1 = [
			{
				"authorId": "repository-contributors",
				"cueId": "strike-release",
				"family": "attack",
				"licenseId": "CC0-1.0",
				"recipe": {
					"attackTicks": 0,
					"decayTicks": 2,
					"durationTicks": 8,
					"endFrequencyHz": 220,
					"gainBasisPoints": 3200,
					"oscillator": "square",
					"releaseTicks": 4,
					"startFrequencyHz": 440
				},
				"sha256": "fc55493e915b05a2b1bb182e2ffa0ce93aea93994443271abe673b4694a63f4e",
				"waveform": {
					"channels": 1,
					"format": "pcm-s16le",
					"sampleCount": 1600,
					"sampleRateHz": 12e3,
					"sha256": "4383bd90cb28333a73fd3413bfa44bc9d8120f1e95f18bc555297fd726b9ee10"
				}
			},
			{
				"authorId": "repository-contributors",
				"cueId": "crown-award",
				"family": "crown",
				"licenseId": "CC0-1.0",
				"recipe": {
					"attackTicks": 2,
					"decayTicks": 4,
					"durationTicks": 32,
					"endFrequencyHz": 990,
					"gainBasisPoints": 4200,
					"oscillator": "triangle",
					"releaseTicks": 10,
					"startFrequencyHz": 660
				},
				"sha256": "1a49aa681850f356c74736ef1bc28da23547d7b590e8a3d5b941a1ef8cd83b76",
				"waveform": {
					"channels": 1,
					"format": "pcm-s16le",
					"sampleCount": 6400,
					"sampleRateHz": 12e3,
					"sha256": "f3f47e3faf9cac46f5484ae80bc0f692b586d9039c55c7b3bc0e75a2352fe936"
				}
			},
			{
				"authorId": "repository-contributors",
				"cueId": "vital-damage",
				"family": "damage",
				"licenseId": "CC0-1.0",
				"recipe": {
					"attackTicks": 0,
					"decayTicks": 2,
					"durationTicks": 10,
					"endFrequencyHz": 90,
					"gainBasisPoints": 3500,
					"oscillator": "sawtooth",
					"releaseTicks": 5,
					"startFrequencyHz": 180
				},
				"sha256": "4ecf886fbb32adb2774f70270a62b1b170d5de658bf23c67cd2657e9e4ee5056",
				"waveform": {
					"channels": 1,
					"format": "pcm-s16le",
					"sampleCount": 2e3,
					"sampleRateHz": 12e3,
					"sha256": "36c4e19b5db288b7190c6bd4dd80f68916ca8fb6cb1352a16779a9cdd39ab218"
				}
			},
			{
				"authorId": "repository-contributors",
				"cueId": "unit-fall",
				"family": "death",
				"licenseId": "CC0-1.0",
				"recipe": {
					"attackTicks": 1,
					"decayTicks": 5,
					"durationTicks": 24,
					"endFrequencyHz": 65,
					"gainBasisPoints": 3800,
					"oscillator": "triangle",
					"releaseTicks": 12,
					"startFrequencyHz": 260
				},
				"sha256": "f1347e01936f1a91055b90933b33486aad27f6719f7c787f0116c3598d29acf6",
				"waveform": {
					"channels": 1,
					"format": "pcm-s16le",
					"sampleCount": 4800,
					"sampleRateHz": 12e3,
					"sha256": "dc3a0365ac8d94bebedfb821c771640f4c756de442cf224abbc7a78ff4cc1d18"
				}
			},
			{
				"authorId": "repository-contributors",
				"cueId": "field-deploy",
				"family": "deploy",
				"licenseId": "CC0-1.0",
				"recipe": {
					"attackTicks": 2,
					"decayTicks": 4,
					"durationTicks": 18,
					"endFrequencyHz": 330,
					"gainBasisPoints": 2800,
					"oscillator": "sine",
					"releaseTicks": 8,
					"startFrequencyHz": 220
				},
				"sha256": "7933a0ad4a6b085c1f28ebe17c1fb6dbac82d69639d771bd0c8c44ee5a57704c",
				"waveform": {
					"channels": 1,
					"format": "pcm-s16le",
					"sampleCount": 3600,
					"sampleRateHz": 12e3,
					"sha256": "38458522375ca3784a931188371e2b95e7494a49ad11288c9b4647c27d52305d"
				}
			},
			{
				"authorId": "repository-contributors",
				"cueId": "contact-impact",
				"family": "impact",
				"licenseId": "CC0-1.0",
				"recipe": {
					"attackTicks": 0,
					"decayTicks": 2,
					"durationTicks": 8,
					"endFrequencyHz": 60,
					"gainBasisPoints": 4e3,
					"oscillator": "square",
					"releaseTicks": 4,
					"startFrequencyHz": 120
				},
				"sha256": "6f05f92bc957ec04f1828a30bb3cc8df28cc1f9b7df47d16878c4d42e205fdb9",
				"waveform": {
					"channels": 1,
					"format": "pcm-s16le",
					"sampleCount": 1600,
					"sampleRateHz": 12e3,
					"sha256": "c393a7b60fdfd0c5ecbe028de2fa87d19a7e1efc5a7366d6a6df69f4cf251e29"
				}
			},
			{
				"authorId": "repository-contributors",
				"cueId": "bolt-flight",
				"family": "launch",
				"licenseId": "CC0-1.0",
				"recipe": {
					"attackTicks": 1,
					"decayTicks": 4,
					"durationTicks": 16,
					"endFrequencyHz": 1080,
					"gainBasisPoints": 2200,
					"oscillator": "sine",
					"releaseTicks": 6,
					"startFrequencyHz": 720
				},
				"sha256": "769e4f166c6728104108323e6bb0bf45fd16f7f1c95f5862d43321c2c7982139",
				"waveform": {
					"channels": 1,
					"format": "pcm-s16le",
					"sampleCount": 3200,
					"sampleRateHz": 12e3,
					"sha256": "6fac17bd91a61f445ee67d7f1a2c87a3692917743d844f67d75c0951ea0d2ccb"
				}
			},
			{
				"authorId": "repository-contributors",
				"cueId": "match-complete",
				"family": "matchEnd",
				"licenseId": "CC0-1.0",
				"recipe": {
					"attackTicks": 2,
					"decayTicks": 8,
					"durationTicks": 48,
					"endFrequencyHz": 220,
					"gainBasisPoints": 4500,
					"oscillator": "triangle",
					"releaseTicks": 16,
					"startFrequencyHz": 440
				},
				"sha256": "e4bfc4706b99c8b8cf4fdc853c8bd3bfb6403a48f7ad3f2cf32728e2027e7f95",
				"waveform": {
					"channels": 1,
					"format": "pcm-s16le",
					"sampleCount": 9600,
					"sampleRateHz": 12e3,
					"sha256": "d2ccdf386eac92898404f7549d9aae39f022171c628cca1c21e05bfcf75ee70b"
				}
			},
			{
				"authorId": "repository-contributors",
				"cueId": "phase-overtime",
				"family": "overtime",
				"licenseId": "CC0-1.0",
				"recipe": {
					"attackTicks": 1,
					"decayTicks": 5,
					"durationTicks": 24,
					"endFrequencyHz": 495,
					"gainBasisPoints": 3500,
					"oscillator": "square",
					"releaseTicks": 10,
					"startFrequencyHz": 330
				},
				"sha256": "12ffaa76d362efb61350dac576e04caed05cace07346b8f75a0f920bc976814f",
				"waveform": {
					"channels": 1,
					"format": "pcm-s16le",
					"sampleCount": 4800,
					"sampleRateHz": 12e3,
					"sha256": "54d616b11f3e03add8b989a17a4f6c8d67382c6e3b3f32db5096a8b9f4854280"
				}
			},
			{
				"authorId": "repository-contributors",
				"cueId": "phase-tiebreak",
				"family": "tiebreak",
				"licenseId": "CC0-1.0",
				"recipe": {
					"attackTicks": 1,
					"decayTicks": 4,
					"durationTicks": 20,
					"endFrequencyHz": 600,
					"gainBasisPoints": 3600,
					"oscillator": "sawtooth",
					"releaseTicks": 8,
					"startFrequencyHz": 300
				},
				"sha256": "11d636f26e051d25fd8d63a2a11b03f059594ed2587b367d83c62a8ac95d0c57",
				"waveform": {
					"channels": 1,
					"format": "pcm-s16le",
					"sampleCount": 4e3,
					"sampleRateHz": 12e3,
					"sha256": "6686f3b465c72d8f8025ff84b49aa5819f006fa5ca19cff804157fe30da6e5ad"
				}
			},
			{
				"authorId": "repository-contributors",
				"cueId": "tower-fall",
				"family": "tower",
				"licenseId": "CC0-1.0",
				"recipe": {
					"attackTicks": 1,
					"decayTicks": 8,
					"durationTicks": 40,
					"endFrequencyHz": 40,
					"gainBasisPoints": 5e3,
					"oscillator": "sawtooth",
					"releaseTicks": 18,
					"startFrequencyHz": 140
				},
				"sha256": "4fa95fc7c87e49baa09e85952bceaa45820d2414be83abc03f3428a8cbfd8a2a",
				"waveform": {
					"channels": 1,
					"format": "pcm-s16le",
					"sampleCount": 8e3,
					"sampleRateHz": 12e3,
					"sha256": "f17f7c2985f462b32cfaf839c2b923dcae66171eff4c5f7d7bae21ae7ff64834"
				}
			}
		];
		schema$1 = "original-audio-provenance";
		audio_provenance_default = {
			assets: assets$1,
			author: author$1,
			license: license$1,
			recipes: recipes$1,
			schema: schema$1,
			version: 1
		};
	})))();
}
//#endregion
//#region src/audio/audio-production-provenance.json
var assets, author, license, mix, recipes, schema, audio_production_provenance_default;
function init_audio_production_provenance() {
	return (init_audio_production_provenance = __esmMin((() => {
		assets = [];
		author = {
			"id": "repository-contributors",
			"statement": "Created from scratch for this repository without third-party or comparison audio."
		};
		license = {
			"id": "CC0-1.0",
			"statement": "The authors dedicate these procedural recipes and their generated waveforms to the public domain under CC0-1.0."
		};
		mix = {
			"ceiling": 29491,
			"headroomBasisPoints": 900,
			"maxPolyphony": 64,
			"voiceGainBasisPoints": 275
		};
		recipes = [
			{
				"authorId": "repository-contributors",
				"cueId": "soft-locomotion",
				"family": "movement",
				"licenseId": "CC0-1.0",
				"recipe": {
					"attackTicks": 1,
					"decayTicks": 3,
					"durationTicks": 12,
					"endFrequencyHz": 180,
					"gainBasisPoints": 2600,
					"oscillator": "sine",
					"releaseTicks": 5,
					"startFrequencyHz": 240,
					"layers": [{
						"frequencyRatioBasisPoints": 2e4,
						"gainBasisPoints": 2600,
						"oscillator": "triangle",
						"phaseOffset": 0
					}, {
						"frequencyRatioBasisPoints": 5e3,
						"gainBasisPoints": 1600,
						"oscillator": "sine",
						"phaseOffset": 16384
					}]
				},
				"sha256": "5c2748c7fceda5cf6b57efb004ca5ba1fc330267531941e6f42c8a268dc8abc0",
				"waveform": {
					"channels": 1,
					"format": "pcm-s16le",
					"sampleCount": 2400,
					"sampleRateHz": 12e3,
					"sha256": "3b45bb6d87dc782610502cc1217d64a1fe438fe40b6a974108032de51e8a2ce5"
				}
			},
			{
				"authorId": "repository-contributors",
				"cueId": "card-select",
				"family": "cardSelect",
				"licenseId": "CC0-1.0",
				"recipe": {
					"attackTicks": 0,
					"decayTicks": 1,
					"durationTicks": 6,
					"endFrequencyHz": 1320,
					"gainBasisPoints": 2200,
					"oscillator": "square",
					"releaseTicks": 3,
					"startFrequencyHz": 880,
					"layers": [{
						"frequencyRatioBasisPoints": 2e4,
						"gainBasisPoints": 2200,
						"oscillator": "sine",
						"phaseOffset": 0
					}, {
						"frequencyRatioBasisPoints": 5e3,
						"gainBasisPoints": 1400,
						"oscillator": "triangle",
						"phaseOffset": 16384
					}]
				},
				"sha256": "f2a3acde14d6d3f82ea6282cff05213e97c216c74647aa48ad6f86dd44dcf62e",
				"waveform": {
					"channels": 1,
					"format": "pcm-s16le",
					"sampleCount": 1200,
					"sampleRateHz": 12e3,
					"sha256": "e16561583ea875d348b6e1fd5c43ad474b0da7b28fd01ea601bf53d5a295796e"
				}
			},
			{
				"authorId": "repository-contributors",
				"cueId": "card-play",
				"family": "cardPlay",
				"licenseId": "CC0-1.0",
				"recipe": {
					"attackTicks": 1,
					"decayTicks": 2,
					"durationTicks": 10,
					"endFrequencyHz": 520,
					"gainBasisPoints": 2800,
					"oscillator": "triangle",
					"releaseTicks": 5,
					"startFrequencyHz": 260,
					"layers": [{
						"frequencyRatioBasisPoints": 2e4,
						"gainBasisPoints": 2400,
						"oscillator": "sine",
						"phaseOffset": 0
					}, {
						"frequencyRatioBasisPoints": 5e3,
						"gainBasisPoints": 1200,
						"oscillator": "sine",
						"phaseOffset": 16384
					}]
				},
				"sha256": "7866f9a972be3e7f057aec0bd9b7baf493df80e5105229a1492d805f1e929a24",
				"waveform": {
					"channels": 1,
					"format": "pcm-s16le",
					"sampleCount": 2e3,
					"sampleRateHz": 12e3,
					"sha256": "98abc939fecabb67dc0ad9536e6828a1516b4d51dcf0d323a8d5aaf7037c29f8"
				}
			},
			{
				"authorId": "repository-contributors",
				"cueId": "ui-confirm",
				"family": "uiConfirm",
				"licenseId": "CC0-1.0",
				"recipe": {
					"attackTicks": 1,
					"decayTicks": 2,
					"durationTicks": 8,
					"endFrequencyHz": 780,
					"gainBasisPoints": 2400,
					"oscillator": "sine",
					"releaseTicks": 4,
					"startFrequencyHz": 540,
					"layers": [{
						"frequencyRatioBasisPoints": 2e4,
						"gainBasisPoints": 1800,
						"oscillator": "triangle",
						"phaseOffset": 0
					}, {
						"frequencyRatioBasisPoints": 3e4,
						"gainBasisPoints": 1200,
						"oscillator": "sine",
						"phaseOffset": 8192
					}]
				},
				"sha256": "15d4c4781f6f53a90d03ee18c12895c1f10b2406a6d6c484109243faf03421d1",
				"waveform": {
					"channels": 1,
					"format": "pcm-s16le",
					"sampleCount": 1600,
					"sampleRateHz": 12e3,
					"sha256": "08d30556501eeed516d3caca42f64350804993fc61891da40236b0d605d98b99"
				}
			},
			{
				"authorId": "repository-contributors",
				"cueId": "ui-reject",
				"family": "uiReject",
				"licenseId": "CC0-1.0",
				"recipe": {
					"attackTicks": 0,
					"decayTicks": 2,
					"durationTicks": 8,
					"endFrequencyHz": 110,
					"gainBasisPoints": 2400,
					"oscillator": "sawtooth",
					"releaseTicks": 4,
					"startFrequencyHz": 190,
					"layers": [{
						"frequencyRatioBasisPoints": 2e4,
						"gainBasisPoints": 1800,
						"oscillator": "square",
						"phaseOffset": 0
					}, {
						"frequencyRatioBasisPoints": 5e3,
						"gainBasisPoints": 1200,
						"oscillator": "triangle",
						"phaseOffset": 32768
					}]
				},
				"sha256": "b13c85f3dfed5c886f0c26b9840e8f7375b12f5475628810d59b020bb9292e80",
				"waveform": {
					"channels": 1,
					"format": "pcm-s16le",
					"sampleCount": 1600,
					"sampleRateHz": 12e3,
					"sha256": "2287f818f919f13cd15239e1fb219a072d81a396c6ce64f9210dad2b2aab47a8"
				}
			},
			{
				"authorId": "repository-contributors",
				"cueId": "ui-toggle",
				"family": "uiToggle",
				"licenseId": "CC0-1.0",
				"recipe": {
					"attackTicks": 1,
					"decayTicks": 2,
					"durationTicks": 7,
					"endFrequencyHz": 440,
					"gainBasisPoints": 2100,
					"oscillator": "triangle",
					"releaseTicks": 3,
					"startFrequencyHz": 320,
					"layers": [{
						"frequencyRatioBasisPoints": 2e4,
						"gainBasisPoints": 1600,
						"oscillator": "sine",
						"phaseOffset": 0
					}, {
						"frequencyRatioBasisPoints": 5e3,
						"gainBasisPoints": 1e3,
						"oscillator": "sine",
						"phaseOffset": 16384
					}]
				},
				"sha256": "2a1bdd96f81fa41a4cf64714123c95df81d1faab69226f075016038b7feeb371",
				"waveform": {
					"channels": 1,
					"format": "pcm-s16le",
					"sampleCount": 1400,
					"sampleRateHz": 12e3,
					"sha256": "0a3976c969ca03f9b6406d89847b69420e7c6e88a4048ebf04569b9e3ae3da45"
				}
			}
		];
		schema = "original-audio-provenance";
		audio_production_provenance_default = {
			assets,
			author,
			license,
			mix,
			recipes,
			schema,
			version: 2
		};
	})))();
}
//#endregion
//#region src/audio/audio-renderer.js
function deepFreeze(value) {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) deepFreeze(child);
		Object.freeze(value);
	}
	return value;
}
function plainObject(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return (prototype === Object.prototype || prototype === null) && Object.getOwnPropertySymbols(value).length === 0;
}
function exactRecord(value, keys, label) {
	if (!plainObject(value)) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	const wanted = [...keys].sort();
	if (actual.some((key) => typeof key !== "string") || actual.length !== wanted.length || [...actual].sort().some((key, index) => key !== wanted[index])) throw new TypeError(`${label} has an invalid shape`);
	const result = {};
	for (const key of keys) {
		const descriptor = descriptors[key];
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
		result[key] = descriptor.value;
	}
	return result;
}
function optionRecord(value) {
	if (!plainObject(value)) throw new TypeError("audio renderer options must be a plain object");
	const allowed = /* @__PURE__ */ new Set([
		"backend",
		"gainBasisPoints",
		"manifest",
		"muted",
		"shippedAudioFiles"
	]);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const result = {};
	for (const key of Reflect.ownKeys(descriptors)) {
		if (typeof key !== "string" || !allowed.has(key)) throw new TypeError("audio renderer options have an invalid shape");
		const descriptor = descriptors[key];
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`audio renderer options.${key} must be an enumerable data property`);
		result[key] = descriptor.value;
	}
	if (!Object.hasOwn(result, "backend")) throw new TypeError("audio renderer options.backend is required");
	return result;
}
function denseArray(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError(`${label} must be an array`);
	if (value.length > maximum) throw new RangeError(`${label} exceeds ${maximum}`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	for (const key of Reflect.ownKeys(descriptors)) {
		if (key === "length") continue;
		if (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length) throw new TypeError(`${label} must contain only indexed data properties`);
		const descriptor = descriptors[key];
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}[${key}] must be an enumerable data property`);
	}
	for (let index = 0; index < value.length; index += 1) if (!Object.hasOwn(value, index)) throw new TypeError(`${label} must not be sparse`);
	return Array.from(value);
}
function canonicalize(value) {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value !== null && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
	return value;
}
function canonicalJson(value) {
	return JSON.stringify(canonicalize(value));
}
function isolated$1(value) {
	return deepFreeze(JSON.parse(canonicalJson(value)));
}
function rotateRight(value, bits) {
	return value >>> bits | value << 32 - bits;
}
function sha256Bytes(inputValue) {
	const input = inputValue instanceof Uint8Array ? inputValue : new Uint8Array(inputValue);
	const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
	const bytes = new Uint8Array(paddedLength);
	bytes.set(input);
	bytes[input.length] = 128;
	const bitLength = BigInt(input.length) * 8n;
	for (let index = 0; index < 8; index += 1) bytes[paddedLength - 1 - index] = Number(bitLength >> BigInt(index * 8) & 255n);
	const hash = new Uint32Array([
		1779033703,
		3144134277,
		1013904242,
		2773480762,
		1359893119,
		2600822924,
		528734635,
		1541459225
	]);
	const words = /* @__PURE__ */ new Uint32Array(64);
	for (let offset = 0; offset < bytes.length; offset += 64) {
		for (let index = 0; index < 16; index += 1) {
			const start = offset + index * 4;
			words[index] = (bytes[start] << 24 | bytes[start + 1] << 16 | bytes[start + 2] << 8 | bytes[start + 3]) >>> 0;
		}
		for (let index = 16; index < 64; index += 1) {
			const left = words[index - 15];
			const right = words[index - 2];
			const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ left >>> 3;
			const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ right >>> 10;
			words[index] = words[index - 16] + sigma0 + words[index - 7] + sigma1 >>> 0;
		}
		let [a, b, c, d, e, f, g, h] = hash;
		for (let index = 0; index < 64; index += 1) {
			const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
			const choose = e & f ^ ~e & g;
			const temporary1 = h + sum1 + choose + SHA256_K[index] + words[index] >>> 0;
			const temporary2 = (rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)) + (a & b ^ a & c ^ b & c) >>> 0;
			h = g;
			g = f;
			f = e;
			e = d + temporary1 >>> 0;
			d = c;
			c = b;
			b = a;
			a = temporary1 + temporary2 >>> 0;
		}
		hash[0] = hash[0] + a >>> 0;
		hash[1] = hash[1] + b >>> 0;
		hash[2] = hash[2] + c >>> 0;
		hash[3] = hash[3] + d >>> 0;
		hash[4] = hash[4] + e >>> 0;
		hash[5] = hash[5] + f >>> 0;
		hash[6] = hash[6] + g >>> 0;
		hash[7] = hash[7] + h >>> 0;
	}
	return [...hash].map((value) => value.toString(16).padStart(8, "0")).join("");
}
function sha256Text(text) {
	return sha256Bytes(new TextEncoder().encode(text));
}
function integer$1(value, minimum, maximum, label) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be an integer from ${minimum} through ${maximum}`);
	return value;
}
function checkedRecipe(value, label) {
	if (!plainObject(value)) throw new TypeError(`${label} must be a plain object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const hasLayers = Object.hasOwn(descriptors, "layers");
	const recipe = exactRecord(value, [
		"attackTicks",
		"decayTicks",
		"durationTicks",
		"endFrequencyHz",
		"gainBasisPoints",
		"oscillator",
		"releaseTicks",
		"startFrequencyHz",
		...hasLayers ? ["layers"] : []
	], label);
	integer$1(recipe.attackTicks, 0, 120, `${label}.attackTicks`);
	integer$1(recipe.decayTicks, 0, 120, `${label}.decayTicks`);
	integer$1(recipe.durationTicks, 1, 120, `${label}.durationTicks`);
	integer$1(recipe.releaseTicks, 0, 120, `${label}.releaseTicks`);
	integer$1(recipe.startFrequencyHz, 20, 8e3, `${label}.startFrequencyHz`);
	integer$1(recipe.endFrequencyHz, 20, 8e3, `${label}.endFrequencyHz`);
	integer$1(recipe.gainBasisPoints, 1, 1e4, `${label}.gainBasisPoints`);
	if (!OSCILLATORS.has(recipe.oscillator)) throw new TypeError(`${label}.oscillator is unsupported`);
	if (recipe.attackTicks + recipe.decayTicks + recipe.releaseTicks > recipe.durationTicks) throw new RangeError(`${label} envelope phases exceed durationTicks`);
	if (hasLayers) {
		const layers = denseArray(recipe.layers, 4, `${label}.layers`).map((value, index) => {
			const layer = exactRecord(value, [
				"frequencyRatioBasisPoints",
				"gainBasisPoints",
				"oscillator",
				"phaseOffset"
			], `${label}.layers[${index}]`);
			integer$1(layer.frequencyRatioBasisPoints, 1e3, 4e4, `${label}.layers[${index}].frequencyRatioBasisPoints`);
			integer$1(layer.gainBasisPoints, 1, 1e4, `${label}.layers[${index}].gainBasisPoints`);
			integer$1(layer.phaseOffset, 0, 65535, `${label}.layers[${index}].phaseOffset`);
			if (!OSCILLATORS.has(layer.oscillator)) throw new TypeError(`${label}.layers[${index}].oscillator is unsupported`);
			return { ...layer };
		});
		if (layers.reduce((total, layer) => total + layer.gainBasisPoints, 0) > 1e4) throw new RangeError(`${label}.layers gain exceeds 10000`);
		recipe.layers = layers;
	}
	return { ...recipe };
}
function oscillatorSample(oscillator, phase) {
	if (oscillator === "square") return phase < 32768 ? 32767 : -32767;
	if (oscillator === "sawtooth") return phase - 32768;
	if (oscillator === "triangle") return phase < 32768 ? phase * 2 - 32767 : 98303 - phase * 2;
	const octant = phase >>> 8;
	const quadrant = octant >>> 6;
	const offset = octant & 63;
	const magnitude = SINE_QUARTER[(quadrant & 1) === 0 ? offset : 64 - offset];
	return quadrant < 2 ? magnitude : -magnitude;
}
function envelopeGain(recipe, sampleIndex, sampleCount) {
	const attack = recipe.attackTicks * 200;
	const decay = recipe.decayTicks * 200;
	const release = recipe.releaseTicks * 200;
	const sustain = Number(BigInt(recipe.gainBasisPoints) * 3n / 4n);
	if (attack > 0 && sampleIndex < attack) return Number(BigInt(recipe.gainBasisPoints) * BigInt(sampleIndex + 1) / BigInt(attack));
	if (decay > 0 && sampleIndex < attack + decay) {
		const progress = sampleIndex - attack + 1;
		return recipe.gainBasisPoints - Number(BigInt(recipe.gainBasisPoints - sustain) * BigInt(progress) / BigInt(decay));
	}
	const releaseStart = sampleCount - release;
	if (release > 0 && sampleIndex >= releaseStart) return Number(BigInt(sustain) * BigInt(sampleCount - sampleIndex - 1) / BigInt(release));
	return sustain;
}
function synthesizeCheckedProceduralPcm(recipe) {
	const sampleCount = recipe.durationTicks * 200;
	const bytes = new Uint8Array(sampleCount * 2);
	let phase = 0;
	const layers = recipe.layers ?? [];
	const layerPhases = layers.map(({ phaseOffset }) => phaseOffset);
	const layerWeight = layers.reduce((total, layer) => total + layer.gainBasisPoints, 0);
	for (let index = 0; index < sampleCount; index += 1) {
		const frequency = sampleCount === 1 ? recipe.startFrequencyHz : recipe.startFrequencyHz + Number(BigInt(recipe.endFrequencyHz - recipe.startFrequencyHz) * BigInt(index) / BigInt(sampleCount - 1));
		phase = phase + Number(BigInt(frequency) * 65536n / BigInt(AUDIO_PCM_SAMPLE_RATE_HZ)) & 65535;
		let amplitude = oscillatorSample(recipe.oscillator, phase);
		if (layers.length > 0) {
			let layered = amplitude * 1e4;
			for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
				const layer = layers[layerIndex];
				const layerFrequency = Math.max(20, Math.min(8e3, Number(BigInt(frequency) * BigInt(layer.frequencyRatioBasisPoints) / 10000n)));
				layerPhases[layerIndex] = layerPhases[layerIndex] + Number(BigInt(layerFrequency) * 65536n / BigInt(AUDIO_PCM_SAMPLE_RATE_HZ)) & 65535;
				layered += oscillatorSample(layer.oscillator, layerPhases[layerIndex]) * layer.gainBasisPoints;
			}
			amplitude = Number(BigInt(layered) / BigInt(1e4 + layerWeight));
		}
		const gain = envelopeGain(recipe, index, sampleCount);
		const sample = Number(BigInt(amplitude) * BigInt(gain) / 10000n);
		const encoded = sample < 0 ? sample + 65536 : sample;
		bytes[index * 2] = encoded & 255;
		bytes[index * 2 + 1] = encoded >>> 8 & 255;
	}
	return Object.freeze({
		bytes,
		channels: 1,
		format: AUDIO_PCM_FORMAT,
		sampleCount,
		sampleRateHz: AUDIO_PCM_SAMPLE_RATE_HZ
	});
}
function cachedProductionPcm(recipe, waveform) {
	const key = `${canonicalJson(recipe)}:${waveform.sha256}`;
	const cached = productionPcmCache.get(key);
	if (cached !== void 0) return {
		key,
		pcm: cached
	};
	const pcm = synthesizeCheckedProceduralPcm(recipe);
	if (sha256Bytes(pcm.bytes) !== waveform.sha256) throw new TypeError("production mix source waveform has an invalid generated waveform hash");
	if (productionPcmCache.size < PRODUCTION_PCM_CACHE_LIMIT) productionPcmCache.set(key, pcm);
	return {
		key,
		pcm
	};
}
function scaledPcmBytes(bytes, gainBasisPoints) {
	if (gainBasisPoints === 1e4) return new Uint8Array(bytes);
	const scaled = new Uint8Array(bytes.length);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	for (let index = 0; index < bytes.length / 2; index += 1) {
		const sample = Number(BigInt(view.getInt16(index * 2, true)) * BigInt(gainBasisPoints) / 10000n);
		const encoded = sample < 0 ? sample + 65536 : sample;
		scaled[index * 2] = encoded & 255;
		scaled[index * 2 + 1] = encoded >>> 8 & 255;
	}
	return scaled;
}
/**
* Reconstruct the deterministic integer mix that the browser sink receives.
* This is intentionally an offline schedule audit: it proves source bytes,
* voice gain, overlap, and the signed PCM ceiling, without claiming to model
* browser acoustics or device output.
*/
function auditProductionMix(voicesValue, policyValue = AUDIO_PRODUCTION_MIX_POLICY) {
	const voices = denseArray(voicesValue, AUDIO_RENDERER_MAX_ACTIVE_VOICES, "production mix voices");
	const policy = exactRecord(policyValue, [
		"ceiling",
		"headroomBasisPoints",
		"maxPolyphony",
		"voiceGainBasisPoints"
	], "production mix policy");
	integer$1(policy.ceiling, 1, 32767, "production mix policy.ceiling");
	integer$1(policy.headroomBasisPoints, 1, 5e3, "production mix policy.headroomBasisPoints");
	integer$1(policy.maxPolyphony, 1, AUDIO_RENDERER_MAX_ACTIVE_VOICES, "production mix policy.maxPolyphony");
	integer$1(policy.voiceGainBasisPoints, 1, 1e4, "production mix policy.voiceGainBasisPoints");
	if (voices.length > policy.maxPolyphony) throw new RangeError("production mix polyphony bound exceeded");
	if (voices.length === 0) return isolated$1({
		ceiling: policy.ceiling,
		energy: 0,
		headroomBasisPoints: policy.headroomBasisPoints,
		peak: 0,
		rmsBasisPoints: 0,
		voiceCount: 0
	});
	const checked = voices.map((voice, index) => {
		if (!plainObject(voice)) throw new TypeError(`production mix voice ${index} is invalid`);
		const source = exactRecord(voice.source, [
			"durationTicks",
			"kind",
			"recipe",
			"sha256",
			"waveform"
		], `production mix voice ${index}.source`);
		if (source.kind !== "procedural") throw new TypeError(`production mix voice ${index} source is not procedural`);
		const recipe = checkedRecipe(source.recipe, `production mix voice ${index}.recipe`);
		const waveform = checkedWaveformMetadata(source.waveform, recipe, `production mix voice ${index}.waveform`);
		if (source.durationTicks !== recipe.durationTicks || !SHA256_PATTERN.test(source.sha256)) throw new TypeError(`production mix voice ${index} source metadata diverges`);
		integer$1(voice.startTick, 0, AUDIO_EVENT_MAX_TICK, `production mix voice ${index}.startTick`);
		const mixGainBasisPoints = integer$1(voice.mixGainBasisPoints ?? policy.voiceGainBasisPoints, 1, policy.voiceGainBasisPoints, `production mix voice ${index}.mixGainBasisPoints`);
		const { key, pcm } = cachedProductionPcm(recipe, waveform);
		if (pcm.sampleCount !== waveform.sampleCount) throw new TypeError(`production mix voice ${index} sample count diverges`);
		const scaledKey = `${key}:${mixGainBasisPoints}`;
		let bytes = productionScaledPcmCache.get(scaledKey);
		if (bytes === void 0) {
			bytes = scaledPcmBytes(pcm.bytes, mixGainBasisPoints);
			if (productionScaledPcmCache.size < PRODUCTION_PCM_CACHE_LIMIT) productionScaledPcmCache.set(scaledKey, bytes);
		}
		return {
			bytes,
			startTick: voice.startTick
		};
	});
	const startTick = Math.min(...checked.map(({ startTick: tick }) => tick));
	const endTick = Math.max(...checked.map(({ bytes, startTick: tick }) => tick + bytes.length / 2 / 200));
	const mixed = new Int32Array((endTick - startTick) * 200);
	for (const voice of checked) {
		const offset = (voice.startTick - startTick) * 200;
		const view = new DataView(voice.bytes.buffer, voice.bytes.byteOffset, voice.bytes.byteLength);
		for (let index = 0; index < voice.bytes.length / 2; index += 1) mixed[offset + index] += view.getInt16(index * 2, true);
	}
	let peak = 0;
	let energy = 0;
	for (const sample of mixed) {
		const magnitude = Math.abs(sample);
		if (magnitude > peak) peak = magnitude;
		energy += sample * sample;
	}
	if (peak > policy.ceiling) throw new RangeError(`production mix clipping budget exceeded (${peak} > ${policy.ceiling})`);
	const rms = mixed.length === 0 ? 0 : Math.sqrt(energy / mixed.length);
	return isolated$1({
		ceiling: policy.ceiling,
		energy,
		headroomBasisPoints: policy.headroomBasisPoints,
		peak,
		rmsBasisPoints: Math.floor(rms * 1e4 / 32767),
		voiceCount: voices.length
	});
}
function checkedWaveformMetadata(value, recipe, label) {
	const waveform = exactRecord(value, [
		"channels",
		"format",
		"sampleCount",
		"sampleRateHz",
		"sha256"
	], label);
	if (waveform.channels !== 1 || waveform.format !== "pcm-s16le" || waveform.sampleRateHz !== 12e3 || waveform.sampleCount !== recipe.durationTicks * 200 || !SHA256_PATTERN.test(waveform.sha256)) throw new TypeError(`${label} has invalid PCM metadata`);
	return { ...waveform };
}
function checkedWaveform(value, recipe, label) {
	const waveform = checkedWaveformMetadata(value, recipe, label);
	if (sha256Bytes(synthesizeCheckedProceduralPcm(recipe).bytes) !== waveform.sha256) throw new TypeError(`${label} has an invalid generated waveform hash`);
	return waveform;
}
function audioRecipeSha256(family, cueId, recipe) {
	if (AUDIO_PRODUCTION_CUE_TAXONOMY[family] !== cueId) throw new TypeError("recipe family and cueId do not match the audio taxonomy");
	return sha256Text(canonicalJson({
		cueId,
		family,
		recipe: checkedRecipe(recipe, "recipe"),
		schema: "procedural-cue-v1"
	}));
}
function safeAssetPath(value, label) {
	if (typeof value !== "string" || !AUDIO_ASSET_PATTERN.test(value) || value.includes("..") || value.includes("\\") || value.includes(":") || value.includes("?") || value.includes("#")) throw new TypeError(`${label} must be a repository-local audio asset path`);
	return value;
}
function linkage(record, label) {
	if (record.authorId !== AUTHOR_ID || record.licenseId !== LICENSE_ID) throw new TypeError(`${label} has invalid authorship or license linkage`);
	if (AUDIO_CUE_TAXONOMY[record.family] !== record.cueId) throw new TypeError(`${label} does not match the audio cue taxonomy`);
}
function auditAudioProvenance(manifestValue, shippedAudioFilesValue = []) {
	if (plainObject(manifestValue)) {
		const version = Object.getOwnPropertyDescriptors(manifestValue).version;
		if (version?.enumerable && Object.hasOwn(version, "value") && version.value === 2) return auditProductionAudioProvenance(manifestValue, shippedAudioFilesValue);
	}
	const manifest = exactRecord(manifestValue, [
		"assets",
		"author",
		"license",
		"recipes",
		"schema",
		"version"
	], "audio provenance manifest");
	if (manifest.schema !== "original-audio-provenance" || manifest.version !== 1) throw new TypeError("audio provenance schema or version is unsupported");
	const author = exactRecord(manifest.author, ["id", "statement"], "audio provenance author");
	const license = exactRecord(manifest.license, ["id", "statement"], "audio provenance license");
	if (author.id !== AUTHOR_ID || author.statement !== AUTHOR_STATEMENT || license.id !== LICENSE_ID || license.statement !== LICENSE_STATEMENT) throw new TypeError("audio provenance authorship or license assertion is invalid");
	const shippedAudioFiles = denseArray(shippedAudioFilesValue, 64, "shipped audio files").map((value, index) => {
		const record = exactRecord(value, ["path", "sha256"], `shipped audio files[${index}]`);
		const path = safeAssetPath(record.path, `shipped audio files[${index}].path`);
		if (!SHA256_PATTERN.test(record.sha256)) throw new TypeError(`shipped audio files[${index}].sha256 is invalid`);
		return {
			path,
			sha256: record.sha256
		};
	});
	if (shippedAudioFiles.some(({ path }, index) => index > 0 && path <= shippedAudioFiles[index - 1].path)) throw new TypeError("shipped audio files must be unique and canonically ordered");
	const seenCueIds = /* @__PURE__ */ new Set();
	let previousRecipeFamily = -1;
	const recipes = denseArray(manifest.recipes, FAMILY_ENTRIES.length, "audio provenance recipes").map((value, index) => {
		const record = exactRecord(value, [
			"authorId",
			"cueId",
			"family",
			"licenseId",
			"recipe",
			"sha256",
			"waveform"
		], `audio provenance recipes[${index}]`);
		linkage(record, `audio provenance recipes[${index}]`);
		if (seenCueIds.has(record.cueId)) throw new TypeError(`duplicate audio cue ${record.cueId}`);
		const familyIndex = FAMILY_ENTRIES.findIndex(([family]) => family === record.family);
		if (familyIndex <= previousRecipeFamily) throw new TypeError("audio provenance recipes must be canonically ordered");
		previousRecipeFamily = familyIndex;
		seenCueIds.add(record.cueId);
		const recipe = checkedRecipe(record.recipe, `audio provenance recipes[${index}].recipe`);
		const expectedHash = audioRecipeSha256(record.family, record.cueId, recipe);
		if (record.sha256 !== expectedHash) throw new TypeError(`audio provenance recipes[${index}] has an invalid canonical hash`);
		const waveform = checkedWaveform(record.waveform, recipe, `audio provenance recipes[${index}].waveform`);
		return {
			...record,
			recipe,
			waveform
		};
	});
	const seenPaths = /* @__PURE__ */ new Set();
	let previousAssetFamily = -1;
	const assets = denseArray(manifest.assets, FAMILY_ENTRIES.length, "audio provenance assets").map((value, index) => {
		const record = exactRecord(value, [
			"authorId",
			"cueId",
			"durationTicks",
			"family",
			"licenseId",
			"path",
			"sha256"
		], `audio provenance assets[${index}]`);
		linkage(record, `audio provenance assets[${index}]`);
		if (seenCueIds.has(record.cueId)) throw new TypeError(`duplicate audio cue ${record.cueId}`);
		const familyIndex = FAMILY_ENTRIES.findIndex(([family]) => family === record.family);
		if (familyIndex <= previousAssetFamily) throw new TypeError("audio provenance assets must be canonically ordered");
		previousAssetFamily = familyIndex;
		seenCueIds.add(record.cueId);
		const path = safeAssetPath(record.path, `audio provenance assets[${index}].path`);
		integer$1(record.durationTicks, 1, 120, `audio provenance assets[${index}].durationTicks`);
		if (seenPaths.has(path)) throw new TypeError(`duplicate audio asset path ${path}`);
		seenPaths.add(path);
		if (!SHA256_PATTERN.test(record.sha256)) throw new TypeError(`audio provenance assets[${index}].sha256 is invalid`);
		return {
			...record,
			path
		};
	});
	for (const [, cueId] of FAMILY_ENTRIES) if (!seenCueIds.has(cueId)) throw new TypeError(`missing audio source for cue ${cueId}`);
	const listedPaths = [...seenPaths].sort();
	for (const path of listedPaths) {
		const shipped = shippedAudioFiles.find((file) => file.path === path);
		if (shipped === void 0) throw new TypeError(`missing shipped audio asset ${path}`);
		const listed = assets.find((asset) => asset.path === path);
		if (shipped.sha256 !== listed.sha256) throw new TypeError(`shipped audio asset hash mismatch ${path}`);
	}
	for (const { path } of shippedAudioFiles) if (!seenPaths.has(path)) throw new TypeError(`unlisted shipped audio asset ${path}`);
	return isolated$1({
		assets,
		author,
		license,
		recipes,
		schema: manifest.schema,
		version: manifest.version
	});
}
/**
* Validate the version-two production manifest.  The legacy version-one
* manifest intentionally remains unchanged for replay consumers; production
* adds the authored UI/movement cues and a pinned integer mix policy.
*/
function auditProductionAudioProvenance(manifestValue, shippedAudioFilesValue = []) {
	const manifest = exactRecord(manifestValue, [
		"assets",
		"author",
		"license",
		"mix",
		"recipes",
		"schema",
		"version"
	], "production audio provenance manifest");
	if (manifest.schema !== "original-audio-provenance" || manifest.version !== 2) throw new TypeError("production audio provenance schema or version is unsupported");
	const author = exactRecord(manifest.author, ["id", "statement"], "production audio provenance author");
	const license = exactRecord(manifest.license, ["id", "statement"], "production audio provenance license");
	if (author.id !== AUTHOR_ID || author.statement !== AUTHOR_STATEMENT || license.id !== LICENSE_ID || license.statement !== LICENSE_STATEMENT) throw new TypeError("production audio provenance authorship or license assertion is invalid");
	const mix = exactRecord(manifest.mix, [
		"ceiling",
		"headroomBasisPoints",
		"maxPolyphony",
		"voiceGainBasisPoints"
	], "production audio mix policy");
	integer$1(mix.ceiling, 1, 32767, "production audio mix policy.ceiling");
	integer$1(mix.headroomBasisPoints, 1, 5e3, "production audio mix policy.headroomBasisPoints");
	integer$1(mix.maxPolyphony, 1, AUDIO_RENDERER_MAX_ACTIVE_VOICES, "production audio mix policy.maxPolyphony");
	integer$1(mix.voiceGainBasisPoints, 1, 1e4, "production audio mix policy.voiceGainBasisPoints");
	for (const key of Object.keys(AUDIO_PRODUCTION_MIX_POLICY)) if (mix[key] !== AUDIO_PRODUCTION_MIX_POLICY[key]) throw new TypeError("production audio mix policy does not match the pinned policy");
	const shippedAudioFiles = denseArray(shippedAudioFilesValue, 64, "shipped audio files").map((value, index) => {
		const record = exactRecord(value, ["path", "sha256"], `shipped audio files[${index}]`);
		const path = safeAssetPath(record.path, `shipped audio files[${index}].path`);
		if (!SHA256_PATTERN.test(record.sha256)) throw new TypeError(`shipped audio files[${index}].sha256 is invalid`);
		return {
			path,
			sha256: record.sha256
		};
	});
	if (shippedAudioFiles.some(({ path }, index) => index > 0 && path <= shippedAudioFiles[index - 1].path)) throw new TypeError("shipped audio files must be unique and canonically ordered");
	const seenCueIds = /* @__PURE__ */ new Set();
	let previousRecipeFamily = -1;
	const recipes = denseArray(manifest.recipes, PRODUCTION_FAMILY_ENTRIES.length, "production audio provenance recipes").map((value, index) => {
		const record = exactRecord(value, [
			"authorId",
			"cueId",
			"family",
			"licenseId",
			"recipe",
			"sha256",
			"waveform"
		], `production audio provenance recipes[${index}]`);
		if (record.authorId !== AUTHOR_ID || record.licenseId !== LICENSE_ID) throw new TypeError(`production audio provenance recipes[${index}] has invalid authorship or license linkage`);
		if (seenCueIds.has(record.cueId)) throw new TypeError(`duplicate audio cue ${record.cueId}`);
		const familyIndex = PRODUCTION_FAMILY_ENTRIES.findIndex(([family]) => family === record.family);
		if (familyIndex <= previousRecipeFamily) throw new TypeError("production audio provenance recipes must be canonically ordered");
		if (AUDIO_PRODUCTION_CUE_TAXONOMY[record.family] !== record.cueId) throw new TypeError(`production audio provenance recipes[${index}] does not match the audio cue taxonomy`);
		previousRecipeFamily = familyIndex;
		seenCueIds.add(record.cueId);
		const recipe = checkedRecipe(record.recipe, `production audio provenance recipes[${index}].recipe`);
		const expectedHash = audioRecipeSha256(record.family, record.cueId, recipe);
		if (record.sha256 !== expectedHash) throw new TypeError(`production audio provenance recipes[${index}] has an invalid canonical hash`);
		const waveform = checkedWaveform(record.waveform, recipe, `production audio provenance recipes[${index}].waveform`);
		return {
			...record,
			recipe,
			waveform
		};
	});
	const seenPaths = /* @__PURE__ */ new Set();
	let previousAssetFamily = -1;
	const assets = denseArray(manifest.assets, PRODUCTION_FAMILY_ENTRIES.length, "production audio provenance assets").map((value, index) => {
		const record = exactRecord(value, [
			"authorId",
			"cueId",
			"durationTicks",
			"family",
			"licenseId",
			"path",
			"sha256"
		], `production audio provenance assets[${index}]`);
		if (record.authorId !== AUTHOR_ID || record.licenseId !== LICENSE_ID) throw new TypeError(`production audio provenance assets[${index}] has invalid authorship or license linkage`);
		if (seenCueIds.has(record.cueId)) throw new TypeError(`duplicate audio cue ${record.cueId}`);
		const familyIndex = PRODUCTION_FAMILY_ENTRIES.findIndex(([family]) => family === record.family);
		if (familyIndex <= previousAssetFamily) throw new TypeError("production audio provenance assets must be canonically ordered");
		if (AUDIO_PRODUCTION_CUE_TAXONOMY[record.family] !== record.cueId) throw new TypeError(`production audio provenance assets[${index}] does not match the audio cue taxonomy`);
		previousAssetFamily = familyIndex;
		seenCueIds.add(record.cueId);
		const path = safeAssetPath(record.path, `production audio provenance assets[${index}].path`);
		integer$1(record.durationTicks, 1, 120, `production audio provenance assets[${index}].durationTicks`);
		if (seenPaths.has(path)) throw new TypeError(`duplicate audio asset path ${path}`);
		seenPaths.add(path);
		if (!SHA256_PATTERN.test(record.sha256)) throw new TypeError(`production audio provenance assets[${index}].sha256 is invalid`);
		return {
			...record,
			path
		};
	});
	for (const cueId of CUE_TO_FAMILY.keys()) if (!seenCueIds.has(cueId)) throw new TypeError(`missing audio source for cue ${cueId}`);
	const listedPaths = [...seenPaths].sort();
	for (const path of listedPaths) {
		const shipped = shippedAudioFiles.find((file) => file.path === path);
		if (shipped === void 0) throw new TypeError(`missing shipped audio asset ${path}`);
		const listed = assets.find((asset) => asset.path === path);
		if (shipped.sha256 !== listed.sha256) throw new TypeError(`shipped audio asset hash mismatch ${path}`);
	}
	for (const { path } of shippedAudioFiles) if (!seenPaths.has(path)) throw new TypeError(`unlisted shipped audio asset ${path}`);
	return isolated$1({
		assets,
		author,
		license,
		mix,
		recipes,
		schema: manifest.schema,
		version: manifest.version
	});
}
function checkedBackend(value) {
	if (value instanceof InMemoryPcmAudioBackend) return { apply: value.apply };
	const backend = exactRecord(value, ["apply"], "audio backend");
	if (typeof backend.apply !== "function") throw new TypeError("audio backend.apply must be a function");
	return backend;
}
function checkedTransaction(value) {
	const transaction = exactRecord(value, ["commands", "transactionId"], "audio transaction");
	integer$1(transaction.transactionId, 1, Number.MAX_SAFE_INTEGER, "audio transaction.transactionId");
	return {
		commands: denseArray(transaction.commands, AUDIO_RENDERER_MAX_ACTIVE_VOICES, "audio transaction.commands").map((command, index) => {
			if (!plainObject(command)) throw new TypeError(`audio transaction.commands[${index}] must be a plain object`);
			return structuredClone(command);
		}),
		transactionId: transaction.transactionId
	};
}
function checkedCue(value, label) {
	const cue = exactRecord(value, [
		"cueId",
		"family",
		"reason",
		"sequence",
		"tick",
		"type"
	], label);
	if (AUDIO_PRODUCTION_CUE_TAXONOMY[cue.family] !== cue.cueId || cue.reason !== "mapped") throw new TypeError(`${label} is not a mapped audio cue`);
	integer$1(cue.sequence, 0, Number.MAX_SAFE_INTEGER, `${label}.sequence`);
	integer$1(cue.tick, 0, AUDIO_EVENT_MAX_TICK, `${label}.tick`);
	if (typeof cue.type !== "string" || !/^[a-z0-9_-]{1,128}$/u.test(cue.type)) throw new TypeError(`${label}.type must be a canonical event type`);
	return { ...cue };
}
function effectiveGain(recipeGain, masterGain, muted) {
	if (muted) return 0;
	return Number(BigInt(recipeGain) * BigInt(masterGain) / 10000n);
}
function effectiveMixedGain(recipeGain, masterGain, mixGain, muted) {
	if (muted) return 0;
	return Number(BigInt(recipeGain) * BigInt(masterGain) * BigInt(mixGain) / 100000000n);
}
function createProductionAudioRenderer(optionsValue) {
	const options = optionRecord(optionsValue);
	if (Object.hasOwn(options, "manifest") || Object.hasOwn(options, "shippedAudioFiles")) throw new TypeError("production audio renderer does not accept custom provenance");
	const trustedOptions = Object.freeze(options);
	productionRendererOptions.add(trustedOptions);
	return new AudioRenderer(trustedOptions);
}
var AUDIO_RENDERER_MAX_ACTIVE_VOICES, AUDIO_RENDERER_MAX_CLEANUP_TICK, AUDIO_PCM_SAMPLE_RATE_HZ, AUDIO_PCM_FORMAT, AUDIO_PRODUCTION_MIX_POLICY, AUTHOR_ID, AUTHOR_STATEMENT, LICENSE_ID, LICENSE_STATEMENT, FAMILY_ENTRIES, PRODUCTION_FAMILY_ENTRIES, MAX_PROCEDURAL_PCM_CACHE_ENTRIES, CUE_TO_FAMILY, OSCILLATORS, AUDIO_ASSET_PATTERN, SHA256_PATTERN, SHA256_K, SINE_QUARTER, PRODUCTION_PCM_CACHE_LIMIT, productionPcmCache, productionScaledPcmCache, DEFAULT_PROVENANCE, DEFAULT_PRODUCTION_PROVENANCE, productionRendererOptions, InMemoryPcmAudioBackend, AudioRenderer;
function init_audio_renderer() {
	return (init_audio_renderer = __esmMin((() => {
		init_audio_provenance();
		init_audio_events();
		init_audio_production_provenance();
		AUDIO_RENDERER_MAX_ACTIVE_VOICES = 4096;
		AUDIO_RENDERER_MAX_CLEANUP_TICK = AUDIO_EVENT_MAX_TICK + 120;
		AUDIO_PCM_SAMPLE_RATE_HZ = 12e3;
		AUDIO_PCM_FORMAT = "pcm-s16le";
		AUDIO_PRODUCTION_MIX_POLICY = Object.freeze({
			ceiling: 29491,
			headroomBasisPoints: 900,
			maxPolyphony: 64,
			voiceGainBasisPoints: 275
		});
		AUTHOR_ID = "repository-contributors";
		AUTHOR_STATEMENT = "Created from scratch for this repository without third-party or comparison audio.";
		LICENSE_ID = "CC0-1.0";
		LICENSE_STATEMENT = "The authors dedicate these procedural recipes and their generated waveforms to the public domain under CC0-1.0.";
		FAMILY_ENTRIES = Object.freeze(Object.entries(AUDIO_CUE_TAXONOMY));
		PRODUCTION_FAMILY_ENTRIES = Object.freeze(Object.entries(AUDIO_PRODUCTION_CUE_TAXONOMY));
		MAX_PROCEDURAL_PCM_CACHE_ENTRIES = PRODUCTION_FAMILY_ENTRIES.length;
		CUE_TO_FAMILY = new Map(PRODUCTION_FAMILY_ENTRIES.map(([family, cueId]) => [cueId, family]));
		OSCILLATORS = /* @__PURE__ */ new Set([
			"sawtooth",
			"sine",
			"square",
			"triangle"
		]);
		AUDIO_ASSET_PATTERN = /^src\/audio\/assets\/[a-z0-9][a-z0-9/_-]*\.(?:ogg|wav)$/u;
		SHA256_PATTERN = /^[0-9a-f]{64}$/u;
		SHA256_K = Object.freeze([
			1116352408,
			1899447441,
			3049323471,
			3921009573,
			961987163,
			1508970993,
			2453635748,
			2870763221,
			3624381080,
			310598401,
			607225278,
			1426881987,
			1925078388,
			2162078206,
			2614888103,
			3248222580,
			3835390401,
			4022224774,
			264347078,
			604807628,
			770255983,
			1249150122,
			1555081692,
			1996064986,
			2554220882,
			2821834349,
			2952996808,
			3210313671,
			3336571891,
			3584528711,
			113926993,
			338241895,
			666307205,
			773529912,
			1294757372,
			1396182291,
			1695183700,
			1986661051,
			2177026350,
			2456956037,
			2730485921,
			2820302411,
			3259730800,
			3345764771,
			3516065817,
			3600352804,
			4094571909,
			275423344,
			430227734,
			506948616,
			659060556,
			883997877,
			958139571,
			1322822218,
			1537002063,
			1747873779,
			1955562222,
			2024104815,
			2227730452,
			2361852424,
			2428436474,
			2756734187,
			3204031479,
			3329325298
		]);
		SINE_QUARTER = Object.freeze([
			0,
			804,
			1608,
			2410,
			3212,
			4011,
			4808,
			5602,
			6393,
			7179,
			7962,
			8739,
			9512,
			10278,
			11039,
			11793,
			12539,
			13279,
			14010,
			14732,
			15446,
			16151,
			16846,
			17530,
			18204,
			18868,
			19519,
			20159,
			20787,
			21403,
			22005,
			22594,
			23170,
			23731,
			24279,
			24811,
			25329,
			25832,
			26319,
			26790,
			27245,
			27683,
			28105,
			28510,
			28898,
			29268,
			29621,
			29956,
			30273,
			30571,
			30852,
			31113,
			31356,
			31580,
			31785,
			31971,
			32137,
			32285,
			32412,
			32521,
			32609,
			32678,
			32728,
			32757,
			32767
		]);
		PRODUCTION_PCM_CACHE_LIMIT = 64;
		productionPcmCache = /* @__PURE__ */ new Map();
		productionScaledPcmCache = /* @__PURE__ */ new Map();
		DEFAULT_PROVENANCE = auditAudioProvenance(audio_provenance_default, []);
		DEFAULT_PRODUCTION_PROVENANCE = auditProductionAudioProvenance({
			assets: [...audio_provenance_default.assets, ...audio_production_provenance_default.assets],
			author: audio_production_provenance_default.author,
			license: audio_production_provenance_default.license,
			mix: audio_production_provenance_default.mix,
			recipes: [...audio_provenance_default.recipes, ...audio_production_provenance_default.recipes],
			schema: audio_production_provenance_default.schema,
			version: audio_production_provenance_default.version
		}, []);
		productionRendererOptions = /* @__PURE__ */ new WeakSet();
		InMemoryPcmAudioBackend = class {
			#faultTransactionId = null;
			#gainBasisPoints = 1e4;
			#muted = false;
			#proceduralPcm = /* @__PURE__ */ new Map();
			#sink;
			#transactions = [];
			#voices = /* @__PURE__ */ new Map();
			constructor(options = {}) {
				if (!plainObject(options)) throw new TypeError("PCM backend options must be a plain object");
				const descriptors = Object.getOwnPropertyDescriptors(options);
				if (Reflect.ownKeys(descriptors).some((key) => key !== "sink")) throw new TypeError("PCM backend options have an invalid shape");
				if (Object.hasOwn(descriptors, "sink")) {
					if (!descriptors.sink.enumerable || !Object.hasOwn(descriptors.sink, "value") || typeof descriptors.sink.value !== "function") throw new TypeError("PCM backend sink must be an enumerable function data property");
					this.#sink = descriptors.sink.value;
				}
				Object.defineProperty(this, "apply", {
					enumerable: true,
					value: this.#applyTransaction.bind(this)
				});
			}
			get state() {
				return isolated$1({
					activeVoiceCount: this.#voices.size,
					faultTransactionId: this.#faultTransactionId,
					faulted: this.#faultTransactionId !== null,
					gainBasisPoints: this.#gainBasisPoints,
					muted: this.#muted,
					transactionCount: this.#transactions.length
				});
			}
			get activeVoices() {
				return Object.freeze([...this.#voices.values()].sort((left, right) => left.voiceId - right.voiceId).map((voice) => Object.freeze({
					...voice,
					bytes: new Uint8Array(voice.bytes)
				})));
			}
			get transactions() {
				return isolated$1(this.#transactions);
			}
			#checkedProceduralPcm(recipeValue, waveformValue) {
				const recipe = checkedRecipe(recipeValue, "procedural audio recipe");
				const waveform = checkedWaveformMetadata(waveformValue, recipe, "start source waveform");
				const key = `${waveform.sha256}:${canonicalJson(recipe)}`;
				let pcm = this.#proceduralPcm.get(key);
				if (pcm === void 0) {
					pcm = synthesizeCheckedProceduralPcm(recipe);
					if (sha256Bytes(pcm.bytes) !== waveform.sha256) throw new TypeError("start source waveform has an invalid generated waveform hash");
					if (this.#proceduralPcm.size < MAX_PROCEDURAL_PCM_CACHE_ENTRIES) this.#proceduralPcm.set(key, pcm);
				}
				return {
					pcm,
					waveform
				};
			}
			#applyTransaction(transactionValue) {
				if (this.#faultTransactionId !== null) throw new Error("PCM backend is permanently faulted");
				const transaction = checkedTransaction(transactionValue);
				const signature = sha256Text(canonicalJson(transaction.commands));
				const prior = this.#transactions.find(({ transactionId }) => transactionId === transaction.transactionId);
				if (prior !== void 0) {
					if (prior.signature !== signature) throw new Error("divergent duplicate audio transaction");
					return;
				}
				const expectedId = this.#transactions.length + 1;
				if (transaction.transactionId !== expectedId) throw new RangeError(`audio transaction ID must be ${expectedId}`);
				const voices = new Map(this.#voices);
				let gainBasisPoints = this.#gainBasisPoints;
				let muted = this.#muted;
				for (const command of transaction.commands) if (command.kind === "output") {
					gainBasisPoints = integer$1(command.gainBasisPoints, 0, 1e4, "output gainBasisPoints");
					if (command.muted !== true && command.muted !== false) throw new TypeError("output muted must be a boolean");
					muted = command.muted;
				} else if (command.kind === "stop") {
					integer$1(command.voiceId, 1, Number.MAX_SAFE_INTEGER, "stop voiceId");
					voices.delete(command.voiceId);
				} else if (command.kind === "start") {
					integer$1(command.voiceId, 1, Number.MAX_SAFE_INTEGER, "start voiceId");
					const mixGainBasisPoints = integer$1(command.mixGainBasisPoints ?? 1e4, 0, 1e4, "start mixGainBasisPoints");
					if (voices.has(command.voiceId)) throw new Error("duplicate active audio voice");
					if (command.source?.kind !== "procedural") throw new TypeError("PCM backend supports procedural sources only");
					const { pcm, waveform } = this.#checkedProceduralPcm(command.source.recipe, command.source.waveform);
					voices.set(command.voiceId, {
						bytes: scaledPcmBytes(pcm.bytes, mixGainBasisPoints),
						cueId: command.cueId,
						effectiveGainBasisPoints: command.effectiveGainBasisPoints,
						endTick: command.endTick,
						family: command.family,
						mixGainBasisPoints,
						sampleCount: pcm.sampleCount,
						sampleRateHz: pcm.sampleRateHz,
						sequence: command.sequence,
						startTick: command.startTick,
						sourceType: command.sourceType,
						voiceId: command.voiceId,
						waveformSha256: waveform.sha256
					});
				} else throw new TypeError("unknown PCM backend command");
				if (this.#sink !== void 0) try {
					const pcmVoices = Object.freeze(transaction.commands.filter(({ kind }) => kind === "start").map(({ voiceId }) => {
						const voice = voices.get(voiceId);
						return Object.freeze({
							...voice,
							bytes: new Uint8Array(voice.bytes)
						});
					}));
					if (this.#sink(isolated$1(transaction), pcmVoices) !== void 0) throw new TypeError("PCM backend sink must complete synchronously without a return value");
				} catch (error) {
					this.#faultTransactionId = transaction.transactionId;
					throw error;
				}
				this.#voices = voices;
				this.#gainBasisPoints = gainBasisPoints;
				this.#muted = muted;
				this.#transactions.push({
					signature,
					transactionId: transaction.transactionId
				});
			}
		};
		AudioRenderer = class {
			#active = [];
			#backend;
			#cleanupTick = 0;
			#disposed = false;
			#fault = null;
			#gainBasisPoints;
			#lastSequence = null;
			#lastTick = null;
			#lastUiSequence = null;
			#lastUiTick = null;
			#muted;
			#nextVoiceId = 1;
			#nextTransactionId = 1;
			#mixPolicy = null;
			#scheduledCount = 0;
			#sources = /* @__PURE__ */ new Map();
			constructor(optionsValue) {
				const hasTrustedProductionProvenance = productionRendererOptions.has(optionsValue);
				const options = optionRecord(optionsValue);
				this.#backend = checkedBackend(options.backend);
				this.#gainBasisPoints = integer$1(options.gainBasisPoints ?? 1e4, 0, 1e4, "audio renderer gainBasisPoints");
				if ((options.muted ?? false) !== true && (options.muted ?? false) !== false) throw new TypeError("audio renderer muted must be a boolean");
				this.#muted = options.muted ?? false;
				const provenance = hasTrustedProductionProvenance ? DEFAULT_PRODUCTION_PROVENANCE : auditAudioProvenance(options.manifest ?? DEFAULT_PROVENANCE, options.shippedAudioFiles ?? []);
				if (provenance.version === 2) this.#mixPolicy = provenance.mix;
				for (const entry of provenance.recipes) this.#sources.set(entry.cueId, {
					durationTicks: entry.recipe.durationTicks,
					kind: "procedural",
					recipe: entry.recipe,
					sha256: entry.sha256,
					waveform: entry.waveform
				});
				for (const entry of provenance.assets) this.#sources.set(entry.cueId, {
					durationTicks: entry.durationTicks,
					kind: "asset",
					path: entry.path,
					sha256: entry.sha256
				});
				this.#apply([{
					gainBasisPoints: this.#gainBasisPoints,
					kind: "output",
					muted: this.#muted
				}]);
			}
			get state() {
				return isolated$1({
					activeVoiceCount: this.#active.length,
					cleanupTick: this.#cleanupTick,
					disposed: this.#disposed,
					faultTransactionId: this.#fault?.transactionId ?? null,
					faulted: this.#fault !== null,
					gainBasisPoints: this.#gainBasisPoints,
					lastSequence: this.#lastSequence,
					lastTick: this.#lastTick,
					muted: this.#muted,
					nextVoiceId: this.#nextVoiceId,
					nextTransactionId: this.#nextTransactionId,
					scheduledCount: this.#scheduledCount
				});
			}
			get activeVoices() {
				return isolated$1(this.#active);
			}
			get mixAudit() {
				return this.#mixPolicy === null ? null : auditProductionMix(this.#active, this.#mixPolicy);
			}
			renderBatch(cuesValue) {
				return this.#renderBatch(cuesValue, "simulation");
			}
			/** Render authenticated UI cues on a sequence domain independent of replay. */
			renderUiBatch(cuesValue) {
				return this.#renderBatch(cuesValue, "ui");
			}
			#renderBatch(cuesValue, domain) {
				this.#assertLive();
				const values = denseArray(cuesValue, 256, "audio cue batch");
				if (values.length > 4096 - this.#active.length) throw new RangeError("audio renderer active voice bound exceeded");
				if (values.length > 16384 - this.#scheduledCount) throw new RangeError("audio renderer scheduled voice bound exceeded");
				if (this.#mixPolicy !== null && this.#active.length + values.length > this.#mixPolicy.maxPolyphony) throw new RangeError("production mix polyphony bound exceeded");
				const cues = [];
				let lastSequence = domain === "ui" ? this.#lastUiSequence : this.#lastSequence;
				let lastTick = domain === "ui" ? this.#lastUiTick : this.#lastTick;
				for (let index = 0; index < values.length; index += 1) {
					const cue = checkedCue(values[index], `audio cue batch[${index}]`);
					if (lastSequence !== null && cue.sequence <= lastSequence) throw new RangeError(`audio cue batch[${index}].sequence must increase`);
					if (lastTick !== null && cue.tick < lastTick) throw new RangeError(`audio cue batch[${index}].tick must not move backwards`);
					if (cue.tick < this.#cleanupTick) throw new RangeError(`audio cue batch[${index}].tick precedes cleanup`);
					cues.push(cue);
					lastSequence = cue.sequence;
					lastTick = cue.tick;
				}
				let voices = cues.map((cue, index) => {
					const source = this.#sources.get(cue.cueId);
					const durationTicks = source.durationTicks;
					const voiceId = this.#nextVoiceId + index;
					return {
						cueId: cue.cueId,
						effectiveGainBasisPoints: source.kind === "procedural" ? this.#mixPolicy === null ? effectiveGain(source.recipe.gainBasisPoints, this.#gainBasisPoints, this.#muted) : effectiveMixedGain(source.recipe.gainBasisPoints, this.#gainBasisPoints, this.#mixPolicy.voiceGainBasisPoints, this.#muted) : this.#muted ? 0 : this.#gainBasisPoints,
						endTick: cue.tick + durationTicks,
						family: cue.family,
						kind: "start",
						sequence: cue.sequence,
						source,
						sourceType: cue.type,
						startTick: cue.tick,
						voiceGainBasisPoints: source.kind === "procedural" ? source.recipe.gainBasisPoints : 1e4,
						mixGainBasisPoints: this.#mixPolicy?.voiceGainBasisPoints ?? 1e4,
						voiceId
					};
				});
				if (this.#mixPolicy !== null && voices.length > 0) {
					const mixGainBasisPoints = this.#mixPolicy.voiceGainBasisPoints;
					voices = voices.map((voice) => ({
						...voice,
						effectiveGainBasisPoints: voice.source.kind === "procedural" ? effectiveMixedGain(voice.source.recipe.gainBasisPoints, this.#gainBasisPoints, mixGainBasisPoints, this.#muted) : voice.effectiveGainBasisPoints,
						mixGainBasisPoints
					}));
					auditProductionMix([...this.#active, ...voices], this.#mixPolicy);
				}
				const commands = isolated$1(voices);
				if (commands.length > 0) this.#apply(commands);
				this.#active.push(...voices.map((voice) => isolated$1(voice)));
				this.#nextVoiceId += voices.length;
				this.#scheduledCount += voices.length;
				if (cues.length > 0) {
					if (domain === "ui") {
						this.#lastUiSequence = cues.at(-1).sequence;
						this.#lastUiTick = cues.at(-1).tick;
					} else {
						this.#lastSequence = cues.at(-1).sequence;
						this.#lastTick = cues.at(-1).tick;
					}
				}
				return commands;
			}
			setGainBasisPoints(value) {
				this.#assertLive();
				const gain = integer$1(value, 0, 1e4, "audio renderer gainBasisPoints");
				if (gain === this.#gainBasisPoints) return this.state;
				this.#apply([{
					gainBasisPoints: gain,
					kind: "output",
					muted: this.#muted
				}]);
				this.#gainBasisPoints = gain;
				return this.state;
			}
			setMuted(value) {
				this.#assertLive();
				if (value !== true && value !== false) throw new TypeError("audio renderer muted must be a boolean");
				if (value === this.#muted) return this.state;
				this.#apply([{
					gainBasisPoints: this.#gainBasisPoints,
					kind: "output",
					muted: value
				}]);
				this.#muted = value;
				return this.state;
			}
			cleanupThroughTick(value) {
				this.#assertLive();
				const tick = integer$1(value, 0, AUDIO_RENDERER_MAX_CLEANUP_TICK, "audio cleanup tick");
				if (tick < this.#cleanupTick) throw new RangeError("audio cleanup tick must not move backwards");
				const completed = this.#active.filter((voice) => voice.endTick <= tick).sort((left, right) => left.endTick - right.endTick || left.voiceId - right.voiceId);
				const commands = isolated$1(completed.map(({ voiceId }) => ({
					kind: "stop",
					voiceId
				})));
				if (commands.length > 0) this.#apply(commands);
				const completedIds = new Set(completed.map(({ voiceId }) => voiceId));
				this.#active = this.#active.filter(({ voiceId }) => !completedIds.has(voiceId));
				this.#cleanupTick = tick;
				return commands;
			}
			dispose() {
				this.#assertNotFaulted();
				if (this.#disposed) return isolated$1([]);
				const commands = isolated$1([...this.#active].sort((left, right) => left.voiceId - right.voiceId).map(({ voiceId }) => ({
					kind: "stop",
					voiceId
				})));
				if (commands.length > 0) this.#apply(commands);
				this.#active = [];
				this.#disposed = true;
				return commands;
			}
			#apply(commandsValue) {
				const transaction = isolated$1({
					commands: isolated$1(commandsValue),
					transactionId: this.#nextTransactionId
				});
				try {
					if (this.#backend.apply(transaction) !== void 0) throw new TypeError("audio backend.apply must complete synchronously without a return value");
				} catch (error) {
					this.#fault = { transactionId: transaction.transactionId };
					throw error;
				}
				this.#nextTransactionId += 1;
			}
			#assertLive() {
				this.#assertNotFaulted();
				if (this.#disposed) throw new Error("audio renderer is disposed");
			}
			#assertNotFaulted() {
				if (this.#fault !== null) throw new Error("audio renderer is permanently faulted");
			}
		};
	})))();
}
//#endregion
//#region src/audio/game-audio-runtime.js
function canonical$1(value) {
	if (Array.isArray(value)) return `[${value.map(canonical$1).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical$1(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function isolated(value) {
	const cloned = JSON.parse(canonical$1(value));
	const freeze = (current) => {
		if (current !== null && typeof current === "object") {
			for (const child of Object.values(current)) freeze(child);
			Object.freeze(current);
		}
		return current;
	};
	return freeze(cloned);
}
function normalizeSessionEvent(value) {
	if (value.type === "session-deployed") return {
		...value.deployment,
		tick: value.tick,
		type: "deployed"
	};
	return value;
}
function preflightSnapshotGraph(root) {
	const pending = [{
		depth: 0,
		value: root
	}];
	let containers = 0;
	let nodes = 0;
	while (pending.length > 0) {
		const { depth, value } = pending.pop();
		nodes += 1;
		if (nodes > SNAPSHOT_GRAPH_LIMITS.nodes || depth > SNAPSHOT_GRAPH_LIMITS.depth) throw new TypeError("game audio runtime snapshot graph exceeds its bound");
		if (typeof value === "string") {
			if (value.length > SNAPSHOT_GRAPH_LIMITS.stringLength) throw new TypeError("game audio runtime snapshot string exceeds its bound");
			continue;
		}
		if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isSafeInteger(value)) continue;
		if (typeof value !== "object") throw new TypeError("game audio runtime snapshot contains an invalid value");
		containers += 1;
		if (containers > SNAPSHOT_GRAPH_LIMITS.containers) throw new TypeError("game audio runtime snapshot graph exceeds its bound");
		if (Array.isArray(value)) {
			if (value.length > SNAPSHOT_GRAPH_LIMITS.arrayLength) throw new TypeError("game audio runtime snapshot array exceeds its bound");
			for (let index = value.length - 1; index >= 0; index -= 1) pending.push({
				depth: depth + 1,
				value: value[index]
			});
			continue;
		}
		const keys = Object.keys(value);
		if (keys.length > SNAPSHOT_GRAPH_LIMITS.keys) throw new TypeError("game audio runtime snapshot object exceeds its bound");
		for (let index = keys.length - 1; index >= 0; index -= 1) {
			const key = keys[index];
			if (key.length > SNAPSHOT_GRAPH_LIMITS.stringLength || [
				"__proto__",
				"constructor",
				"prototype"
			].includes(key)) throw new TypeError("game audio runtime snapshot key is invalid");
			pending.push({
				depth: depth + 1,
				value: value[key]
			});
		}
	}
}
function checkedSnapshot(bytes) {
	if (typeof bytes !== "string" || new TextEncoder().encode(bytes).byteLength > MAX_SNAPSHOT_BYTES$1) throw new TypeError("game audio runtime snapshot must be bounded canonical text");
	let parsed;
	try {
		parsed = JSON.parse(bytes);
	} catch {
		throw new TypeError("game audio runtime snapshot must be valid JSON");
	}
	preflightSnapshotGraph(parsed);
	if (canonical$1(parsed) !== bytes || parsed === null || Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Object.prototype || !Number.isSafeInteger(parsed.cursor) || parsed.cursor < 0 || parsed.version === 2 && (!Number.isSafeInteger(parsed.projectionOffset) || parsed.projectionOffset < 0 || parsed.projectionOffset > parsed.cursor) || !Number.isSafeInteger(parsed.generation) || parsed.generation < 0 || !Array.isArray(parsed.eventBytes) || parsed.version === 1 && parsed.eventBytes.length !== parsed.cursor || parsed.version === 2 && parsed.eventBytes.length !== parsed.cursor - parsed.projectionOffset || parsed.eventBytes.some((entry) => typeof entry !== "string") || typeof parsed.projection !== "string" || typeof parsed.sessionBytes !== "string" || parsed.disposed !== true && parsed.disposed !== false || !Number.isSafeInteger(parsed.gainBasisPoints) || parsed.gainBasisPoints < 0 || parsed.gainBasisPoints > 1e4 || parsed.muted !== true && parsed.muted !== false) throw new TypeError("game audio runtime snapshot is invalid");
	const legacyKeys = "cursor,disposed,eventBytes,gainBasisPoints,generation,muted,projection,sessionBytes,version";
	const currentKeys = "cursor,disposed,eventBytes,gainBasisPoints,generation,muted,projection,projectionOffset,sessionBytes,suppressedAcceleratedCueCount,version";
	if (parsed.version === 1 && Object.keys(parsed).sort().join(",") === legacyKeys) return {
		...parsed,
		projectionOffset: 0,
		suppressedAcceleratedCueCount: 0
	};
	if (parsed.version !== VERSION || Object.keys(parsed).sort().join(",") !== currentKeys || !Number.isSafeInteger(parsed.suppressedAcceleratedCueCount) || parsed.suppressedAcceleratedCueCount < 0) throw new TypeError("game audio runtime snapshot is invalid");
	return parsed;
}
function absoluteRecords(records, offset) {
	return records.map((record) => ({
		...record,
		sequence: record.sequence + offset
	}));
}
function acceleratedCues(candidates) {
	if (candidates.length <= 32) return candidates;
	const chosen = /* @__PURE__ */ new Set();
	for (let index = candidates.length - 1; index >= 0 && chosen.size < 32; index -= 1) if (ACCELERATED_PRIORITY_FAMILIES.has(candidates[index].family)) chosen.add(candidates[index]);
	for (let index = candidates.length - 1; index >= 0 && chosen.size < 32; index -= 1) chosen.add(candidates[index]);
	return candidates.filter((cue) => chosen.has(cue));
}
function exactUiCommand(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError("game audio UI command must be a plain object");
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const keys = Reflect.ownKeys(descriptors);
	const allowed = /* @__PURE__ */ new Set([
		"cardId",
		"kind",
		"sequence",
		"tick"
	]);
	if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) throw new TypeError("game audio UI command has an invalid shape");
	for (const key of keys) {
		const descriptor = descriptors[key];
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`game audio UI command.${key} must be an enumerable data property`);
	}
	if (!Object.hasOwn(value, "kind") || !Object.hasOwn(value, "sequence") || !Object.hasOwn(value, "tick")) throw new TypeError("game audio UI command is missing required fields");
	const command = {
		kind: value.kind,
		sequence: value.sequence,
		tick: value.tick
	};
	if (!GAME_AUDIO_UI_COMMAND_KINDS.includes(command.kind)) throw new TypeError("game audio UI command kind is unsupported");
	if (!Number.isSafeInteger(command.sequence) || command.sequence < 0 || command.sequence >= 8192) throw new TypeError("game audio UI command sequence is out of bounds");
	if (!Number.isSafeInteger(command.tick) || command.tick < 0 || command.tick > 18e3) throw new TypeError("game audio UI command tick is out of bounds");
	if (Object.hasOwn(value, "cardId")) {
		if (typeof value.cardId !== "string" || !/^[a-z0-9_-]{1,128}$/u.test(value.cardId)) throw new TypeError("game audio UI command cardId is invalid");
		command.cardId = value.cardId;
	}
	if ((command.kind === "card-select" || command.kind === "card-play") && !Object.hasOwn(command, "cardId")) throw new TypeError("card audio UI commands require cardId");
	return command;
}
function isAuthenticGameAudioRuntime(value) {
	return authenticGameAudioRuntimes.has(value);
}
/** Capture one browser sink without exposing it on the runtime surface. */
function createGameAudioRuntimeSinkCapability(sink) {
	if (arguments.length !== 1 || typeof sink !== "function") throw new TypeError("game audio runtime sink must be one function");
	const capability = Object.freeze(Object.create(null));
	runtimeSinkCapabilities.set(capability, sink);
	return capability;
}
/** Mint one fieldless capability for the authenticated browser/UI seam. */
function createGameAudioRuntimeUiCapability(runtime) {
	if (!isAuthenticGameAudioRuntime(runtime)) throw new TypeError("game audio UI capability requires an authentic runtime");
	const capability = Object.freeze(Object.create(null));
	runtimeUiCapabilities.set(capability, runtime);
	return capability;
}
var VERSION, MAX_SNAPSHOT_BYTES$1, GAME_AUDIO_UI_COMMAND_KINDS, ACCELERATED_PRIORITY_FAMILIES, authenticGameAudioRuntimes, runtimeSinkCapabilities, consumedRuntimeSinkCapabilities, runtimeUiCapabilities, consumedRuntimeUiCapabilities, SNAPSHOT_GRAPH_LIMITS, UI_KIND_TO_AUDIO, GameAudioRuntime;
function init_game_audio_runtime() {
	return (init_game_audio_runtime = __esmMin((() => {
		init_game_session();
		init_audio_events();
		init_audio_renderer();
		VERSION = 2;
		MAX_SNAPSHOT_BYTES$1 = 8388608;
		GAME_AUDIO_UI_COMMAND_KINDS = Object.freeze([
			"card-select",
			"card-play",
			"ui-confirm",
			"ui-reject",
			"ui-toggle"
		]);
		ACCELERATED_PRIORITY_FAMILIES = /* @__PURE__ */ new Set([
			"matchEnd",
			"crown",
			"tower",
			"overtime",
			"tiebreak"
		]);
		authenticGameAudioRuntimes = /* @__PURE__ */ new WeakSet();
		runtimeSinkCapabilities = /* @__PURE__ */ new WeakMap();
		consumedRuntimeSinkCapabilities = /* @__PURE__ */ new WeakSet();
		runtimeUiCapabilities = /* @__PURE__ */ new WeakMap();
		consumedRuntimeUiCapabilities = /* @__PURE__ */ new WeakSet();
		SNAPSHOT_GRAPH_LIMITS = Object.freeze({
			arrayLength: 2e4,
			containers: 1e5,
			depth: 128,
			keys: 1024,
			nodes: 2e5,
			stringLength: 4194304
		});
		UI_KIND_TO_AUDIO = Object.freeze({
			"card-play": Object.freeze({
				cueId: "card-play",
				family: "cardPlay"
			}),
			"card-select": Object.freeze({
				cueId: "card-select",
				family: "cardSelect"
			}),
			"ui-confirm": Object.freeze({
				cueId: "ui-confirm",
				family: "uiConfirm"
			}),
			"ui-reject": Object.freeze({
				cueId: "ui-reject",
				family: "uiReject"
			}),
			"ui-toggle": Object.freeze({
				cueId: "ui-toggle",
				family: "uiToggle"
			})
		});
		GameAudioRuntime = class GameAudioRuntime {
			#backend;
			#cursor = 0;
			#disposed = false;
			#eventBytes = [];
			#generation = 0;
			#observedTick;
			#projection;
			#projectionOffset = 0;
			#renderer;
			#session;
			#sink = null;
			#suppressedAcceleratedCueCount = 0;
			#uiCommandBytes = [];
			#uiLastTick = null;
			constructor(session, sinkCapability) {
				if (arguments.length !== 1 && arguments.length !== 2 || !isAuthenticGameSession(session)) throw new TypeError("game audio runtime requires one authentic GameSession");
				if (arguments.length === 2) {
					const sink = runtimeSinkCapabilities.get(sinkCapability);
					if (sink === void 0) {
						if (consumedRuntimeSinkCapabilities.has(sinkCapability)) throw new TypeError("game audio runtime sink capability is consumed");
						throw new TypeError("game audio runtime sink capability is invalid");
					}
					runtimeSinkCapabilities.delete(sinkCapability);
					consumedRuntimeSinkCapabilities.add(sinkCapability);
					this.#sink = sink;
				}
				this.#session = session;
				this.#resetAudioGraph();
				this.#observedTick = session.state.tick;
				authenticGameAudioRuntimes.add(this);
				Object.freeze(this);
			}
			#resetAudioGraph(gainBasisPoints = 1e4, muted = false, suppressedAcceleratedCueCount = 0) {
				this.#backend = new InMemoryPcmAudioBackend(this.#sink === null ? {} : { sink: this.#sink });
				this.#renderer = createProductionAudioRenderer({
					backend: this.#backend,
					gainBasisPoints,
					muted
				});
				this.#projection = new AudioEventProjection();
				this.#cursor = 0;
				this.#eventBytes = [];
				this.#projectionOffset = 0;
				this.#suppressedAcceleratedCueCount = suppressedAcceleratedCueCount;
				this.#disposed = false;
			}
			#isPrefix(replay) {
				return this.#cursor <= replay.length && this.#cursor === this.#projectionOffset + this.#eventBytes.length && this.#eventBytes.every((bytes, index) => canonical$1(replay[this.#projectionOffset + index]) === bytes);
			}
			#assertLive() {
				if (this.#disposed) throw new Error("game audio runtime is disposed");
				if (this.#renderer.state.faulted) throw new Error("game audio runtime is permanently faulted");
			}
			#assertRebaseable(session) {
				if (!isAuthenticGameSession(session)) throw new TypeError("game audio runtime rebase requires an authentic GameSession");
				const restoredReplay = getGameSessionAudioReplay(session);
				const knownReplay = getGameSessionAudioReplay(this.#session);
				if (restoredReplay.length > this.#cursor || restoredReplay.length > knownReplay.length) throw new RangeError("game audio runtime restore contains unseen authority records");
				for (let index = 0; index < restoredReplay.length; index += 1) if (canonical$1(restoredReplay[index]) !== canonical$1(knownReplay[index])) throw new RangeError("game audio runtime restore diverges from consumed authority");
				return true;
			}
			#renderFrame(accelerated) {
				if (this.#renderer.state.faulted) throw new Error("game audio runtime is permanently faulted");
				const replay = getGameSessionAudioReplay(this.#session);
				const sessionTick = this.#session.state.tick;
				if (sessionTick < this.#observedTick || !this.#isPrefix(replay)) {
					const controls = this.#renderer.state;
					if (!this.#disposed) this.#renderer.dispose();
					this.#generation += 1;
					this.#resetAudioGraph(controls.gainBasisPoints, controls.muted);
				}
				this.#observedTick = sessionTick;
				if (this.#disposed) return isolated({
					accelerated,
					candidateCueCount: 0,
					cues: [],
					skippedCueCount: 0,
					starts: [],
					stops: [],
					state: this.state
				});
				const cursor = this.#cursor;
				const entries = replay.slice(cursor).map((event, offset) => ({
					event: normalizeSessionEvent(event),
					sequence: cursor + offset - this.#projectionOffset,
					tick: event.tick ?? this.#session.state.tick
				}));
				const candidates = (entries.length === 0 ? [] : absoluteRecords(this.#projection.projectBatch(entries), this.#projectionOffset)).filter(({ cueId }) => cueId !== null);
				const cues = accelerated ? acceleratedCues(candidates) : candidates;
				const skippedCueCount = candidates.length - cues.length;
				this.#suppressedAcceleratedCueCount += skippedCueCount;
				const starts = [];
				const stops = [];
				for (let index = 0; index < cues.length;) {
					const tick = cues[index].tick;
					stops.push(...this.#renderer.cleanupThroughTick(tick));
					let end = index;
					while (end < cues.length && cues[end].tick === tick) end += 1;
					for (let offset = index; offset < end; offset += 256) starts.push(...this.#renderer.renderBatch(cues.slice(offset, Math.min(offset + 256, end))));
					index = end;
				}
				this.#eventBytes.push(...replay.slice(cursor).map(canonical$1));
				this.#cursor = replay.length;
				const tick = sessionTick;
				stops.push(...this.#renderer.cleanupThroughTick(tick));
				if (this.#session.state.terminal) {
					stops.push(...this.#renderer.dispose());
					this.#disposed = true;
				}
				return isolated({
					accelerated,
					candidateCueCount: candidates.length,
					cues,
					skippedCueCount,
					starts,
					stops,
					state: this.state
				});
			}
			/** Render every newly observed cue; normal RAF presentation uses this policy. */
			renderFrame() {
				return this.#renderFrame(false);
			}
			/**
			* Consume every newly observed replay record exactly once while audibly
			* coalescing a fast-forward batch to a fixed latest/critical cue budget.
			*/
			renderAcceleratedFrame() {
				return this.#renderFrame(true);
			}
			/**
			* Submit one authenticated UI-only cue. UI commands are deliberately kept
			* outside the simulation replay; they have their own bounded sequence
			* domain, so a card gesture can never mutate or impersonate GameSession
			* authority. Exact duplicate delivery is idempotent, while divergent stale
			* or skipped sequences fail before any renderer transaction.
			*/
			submitUiCommand(capability, commandValue) {
				this.#assertLive();
				if (runtimeUiCapabilities.get(capability) !== this) {
					if (consumedRuntimeUiCapabilities.has(capability)) throw new TypeError("game audio UI capability is consumed or belongs to another runtime");
					throw new TypeError("game audio UI capability is invalid");
				}
				const command = exactUiCommand(commandValue);
				const bytes = canonical$1(command);
				const expectedSequence = this.#uiCommandBytes.length;
				if (command.sequence < expectedSequence) {
					if (this.#uiCommandBytes[command.sequence] !== bytes) throw new RangeError("game audio UI command is a divergent duplicate");
					return isolated({
						accepted: false,
						command,
						cue: null,
						duplicate: true
					});
				}
				if (command.sequence !== expectedSequence) throw new RangeError(`game audio UI command sequence must be ${expectedSequence}`);
				if (this.#uiLastTick !== null && command.tick < this.#uiLastTick) throw new RangeError("game audio UI command tick must not move backwards");
				const audio = UI_KIND_TO_AUDIO[command.kind];
				const cue = {
					cueId: audio.cueId,
					family: audio.family,
					reason: "mapped",
					sequence: command.sequence,
					tick: command.tick,
					type: command.kind
				};
				const starts = this.#renderer.renderUiBatch([cue]);
				this.#uiCommandBytes.push(bytes);
				this.#uiLastTick = command.tick;
				return isolated({
					accepted: true,
					command,
					cue,
					duplicate: false,
					starts
				});
			}
			restart(session) {
				if (!isAuthenticGameSession(session)) throw new TypeError("game audio runtime restart requires an authentic GameSession");
				const controls = this.#renderer.state;
				if (!this.#disposed) this.#renderer.dispose();
				this.#session = session;
				this.#generation += 1;
				this.#uiCommandBytes = [];
				this.#uiLastTick = null;
				this.#resetAudioGraph(controls.gainBasisPoints, controls.muted);
				this.#observedTick = session.state.tick;
				return this.state;
			}
			/** Verify that a restore cannot make unseen authority records look heard. */
			assertRebaseable(session) {
				return this.#assertRebaseable(session);
			}
			/**
			* Attach to a restored session without synthesizing its already-heard cue
			* history.  The source cursor is rebased at the restored replay boundary;
			* only later authority records are projected and can become audible.
			*/
			rebase(session) {
				this.#assertRebaseable(session);
				const controls = this.#renderer.state;
				if (!this.#disposed) this.#renderer.dispose();
				const replayLength = getGameSessionAudioReplay(session).length;
				this.#session = session;
				this.#generation += 1;
				this.#resetAudioGraph(controls.gainBasisPoints, controls.muted, this.#suppressedAcceleratedCueCount);
				this.#cursor = replayLength;
				this.#projectionOffset = replayLength;
				this.#observedTick = session.state.tick;
				if (session.state.terminal) {
					this.#renderer.dispose();
					this.#disposed = true;
				}
				return this.state;
			}
			/**
			* Consume an otherwise-unseen restored replay through the projection only.
			* This is intentionally distinct from rebase(): callers must choose the
			* explicit silent policy instead of claiming unseen authority was already
			* heard. Batching bounds the work and emits no renderer starts.
			*/
			rebaseSilently(session) {
				if (!isAuthenticGameSession(session)) throw new TypeError("game audio runtime silent rebase requires an authentic GameSession");
				const controls = this.#renderer.state;
				if (!this.#disposed) this.#renderer.dispose();
				this.#session = session;
				this.#generation += 1;
				this.#resetAudioGraph(controls.gainBasisPoints, controls.muted, this.#suppressedAcceleratedCueCount);
				const replay = getGameSessionAudioReplay(session);
				const batchSize = 256;
				for (let from = 0; from < replay.length; from += batchSize) {
					const values = replay.slice(from, from + batchSize);
					const entries = values.map((event, offset) => ({
						event: normalizeSessionEvent(event),
						sequence: from + offset,
						tick: event.tick ?? session.state.tick
					}));
					this.#projection.projectBatch(entries);
					this.#eventBytes.push(...values.map(canonical$1));
					this.#cursor += values.length;
				}
				this.#observedTick = session.state.tick;
				if (session.state.terminal) {
					this.#renderer.dispose();
					this.#disposed = true;
				}
				return this.state;
			}
			setGainBasisPoints(value) {
				if (this.#disposed) throw new Error("game audio runtime is disposed");
				return this.#renderer.setGainBasisPoints(value);
			}
			setMuted(value) {
				if (this.#disposed) throw new Error("game audio runtime is disposed");
				return this.#renderer.setMuted(value);
			}
			dispose() {
				if (this.#disposed) return isolated([]);
				const stopped = this.#renderer.dispose();
				this.#disposed = true;
				return stopped;
			}
			get cues() {
				return isolated(absoluteRecords(this.#projection.cues, this.#projectionOffset));
			}
			get mixAudit() {
				return this.#renderer.mixAudit;
			}
			get state() {
				return isolated({
					cursor: this.#cursor,
					cueCount: this.#projection.cues.length,
					disposed: this.#disposed,
					eventCount: this.#projectionOffset + this.#projection.records.length,
					faulted: this.#renderer.state.faulted,
					gainBasisPoints: this.#renderer.state.gainBasisPoints,
					generation: this.#generation,
					muted: this.#renderer.state.muted,
					projectionOffset: this.#projectionOffset,
					renderer: this.#renderer.state,
					sessionTick: this.#session.state.tick,
					suppressedAcceleratedCueCount: this.#suppressedAcceleratedCueCount,
					terminal: this.#session.state.terminal,
					transactionCount: this.#backend.state.transactionCount,
					uiCommandCount: this.#uiCommandBytes.length,
					uiSequence: this.#uiCommandBytes.length,
					uiLastTick: this.#uiLastTick
				});
			}
			get transactions() {
				return this.#backend.transactions;
			}
			serialize() {
				return canonical$1({
					cursor: this.#cursor,
					disposed: this.#disposed,
					eventBytes: this.#eventBytes,
					gainBasisPoints: this.#renderer.state.gainBasisPoints,
					generation: this.#generation,
					muted: this.#renderer.state.muted,
					projection: this.#projection.serialize(),
					projectionOffset: this.#projectionOffset,
					sessionBytes: this.#session.serialize(),
					suppressedAcceleratedCueCount: this.#suppressedAcceleratedCueCount,
					version: VERSION
				});
			}
			static restore(bytes, session, sinkCapability) {
				if (arguments.length !== 2 && arguments.length !== 3) throw new TypeError("game audio runtime restore arguments are invalid");
				const snapshot = checkedSnapshot(bytes);
				if (!isAuthenticGameSession(session)) throw new TypeError("game audio runtime restore requires an authentic GameSession");
				if (session.serialize() !== snapshot.sessionBytes) throw new TypeError("game audio runtime snapshot diverges from session");
				const projection = AudioEventProjection.restore(snapshot.projection);
				if (projection.state.nextSequence !== snapshot.cursor - snapshot.projectionOffset) throw new TypeError("game audio runtime projection cursor diverges");
				const replay = getGameSessionAudioReplay(session);
				if (replay.length !== snapshot.cursor || snapshot.eventBytes.some((event, index) => event !== canonical$1(replay[snapshot.projectionOffset + index]))) throw new TypeError("game audio runtime event prefix diverges");
				const runtime = arguments.length === 3 ? new GameAudioRuntime(session, sinkCapability) : new GameAudioRuntime(session);
				runtime.#projection = projection;
				runtime.#cursor = snapshot.cursor;
				runtime.#eventBytes = [...snapshot.eventBytes];
				runtime.#projectionOffset = snapshot.projectionOffset;
				runtime.#generation = snapshot.generation;
				runtime.#suppressedAcceleratedCueCount = snapshot.suppressedAcceleratedCueCount;
				if (snapshot.gainBasisPoints !== 1e4) runtime.#renderer.setGainBasisPoints(snapshot.gainBasisPoints);
				if (snapshot.muted) runtime.#renderer.setMuted(true);
				if (snapshot.disposed) {
					runtime.#renderer.dispose();
					runtime.#disposed = true;
				}
				return runtime;
			}
		};
	})))();
}
//#endregion
//#region src/audio/browser-audio.js
function frozen(value) {
	if (value !== null && typeof value === "object") {
		for (const child of Object.values(value)) frozen(child);
		Object.freeze(value);
	}
	return value;
}
function checkedContext(value) {
	if (value === null || typeof value !== "object" || typeof value.createBuffer !== "function" || typeof value.createBufferSource !== "function" || typeof value.createGain !== "function" || typeof value.resume !== "function" || value.destination === null || typeof value.destination !== "object" || typeof value.currentTime !== "number" || !Number.isFinite(value.currentTime)) throw new TypeError("browser audio context factory returned an invalid context");
	return value;
}
function primitiveSamples(bytes) {
	if (!(bytes instanceof Uint8Array) || bytes.byteLength % 2 !== 0) throw new TypeError("browser audio PCM bytes are invalid");
	const samples = new Float32Array(bytes.byteLength / 2);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	for (let index = 0; index < samples.length; index += 1) samples[index] = view.getInt16(index * 2, true) / 32768;
	return samples;
}
function primitivePcmMetrics(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let peak = 0;
	let energy = 0;
	for (let index = 0; index < bytes.byteLength / 2; index += 1) {
		const sample = view.getInt16(index * 2, true);
		const magnitude = Math.abs(sample);
		if (magnitude > peak) peak = magnitude;
		energy += sample * sample;
	}
	const sampleCount = bytes.byteLength / 2;
	const rms = sampleCount === 0 ? 0 : Math.sqrt(energy / sampleCount);
	return {
		energy,
		peak,
		rmsBasisPoints: Math.floor(rms * 1e4 / 32767)
	};
}
function observePromise(result) {
	if (result !== null && (typeof result === "object" || typeof result === "function") && typeof result.then === "function") Promise.resolve(result).catch(() => {});
}
function cleanupContext(context) {
	if (context === null || typeof context !== "object" && typeof context !== "function") return;
	for (const method of ["suspend", "close"]) try {
		if (typeof context[method] === "function") observePromise(context[method]());
	} catch {}
}
function createBrowserAudioContextFactoryCapability(factory) {
	if (arguments.length !== 1 || typeof factory !== "function") throw new TypeError("browser audio context factory must be one function");
	const capability = Object.freeze(Object.create(null));
	contextFactoryCapabilities.set(capability, factory);
	return capability;
}
function isAuthenticBrowserPcmAudioSink(value) {
	return authenticBrowserAudioSinks.has(value);
}
var contextFactoryCapabilities, consumedContextFactoryCapabilities, authenticBrowserAudioSinks, BrowserPcmAudioSink;
function init_browser_audio() {
	return (init_browser_audio = __esmMin((() => {
		init_game_audio_runtime();
		contextFactoryCapabilities = /* @__PURE__ */ new WeakMap();
		consumedContextFactoryCapabilities = /* @__PURE__ */ new WeakSet();
		authenticBrowserAudioSinks = /* @__PURE__ */ new WeakSet();
		BrowserPcmAudioSink = class {
			#active = /* @__PURE__ */ new Map();
			#context = null;
			#disposed = false;
			#factory;
			#fault = null;
			#gainBasisPoints = 1e4;
			#gainNode = null;
			#muted = false;
			#resumeCount = 0;
			#runtimeBound = false;
			#scheduledPcm = [];
			#startCount = 0;
			#transactionCount = 0;
			#unlockCount = 0;
			#unlockPromise = null;
			constructor(factoryCapability) {
				const factory = contextFactoryCapabilities.get(factoryCapability);
				if (factory === void 0) {
					if (consumedContextFactoryCapabilities.has(factoryCapability)) throw new TypeError("browser audio context capability is consumed");
					throw new TypeError("browser audio context capability is invalid");
				}
				contextFactoryCapabilities.delete(factoryCapability);
				consumedContextFactoryCapabilities.add(factoryCapability);
				this.#factory = factory;
				authenticBrowserAudioSinks.add(this);
				Object.freeze(this);
			}
			createRuntimeSinkCapability() {
				this.#assertUsable();
				if (this.#runtimeBound) throw new RangeError("browser audio sink is already bound");
				this.#runtimeBound = true;
				return createGameAudioRuntimeSinkCapability((transaction, voices) => this.#apply(transaction, voices));
			}
			unlock(event) {
				this.#assertUsable();
				if (event === null || typeof event !== "object" || event.isTrusted !== true) return Promise.resolve(false);
				if (this.#unlockPromise !== null) return this.#unlockPromise.then(() => false);
				let context;
				let gainNode;
				try {
					context = checkedContext(this.#factory());
					gainNode = context.createGain();
					if (gainNode === null || typeof gainNode !== "object" || typeof gainNode.connect !== "function" || typeof gainNode.disconnect !== "function" || gainNode.gain === null || typeof gainNode.gain !== "object" || typeof gainNode.gain.setValueAtTime !== "function") throw new TypeError("browser audio context returned an invalid gain node");
					gainNode.connect(context.destination);
					this.#context = context;
					this.#gainNode = gainNode;
					this.#setNodeGain();
					this.#unlockCount = 1;
					const result = context.resume();
					this.#resumeCount = 1;
					if (result === null || typeof result !== "object" || typeof result.then !== "function") throw new TypeError("browser audio context resume must return a promise");
					this.#unlockPromise = Promise.resolve(result).then(() => true, (error) => {
						this.#fault = error ?? /* @__PURE__ */ new Error("browser audio resume rejected");
						this.#disposeGraph();
						throw error;
					});
					return this.#unlockPromise;
				} catch (error) {
					this.#fault = error ?? /* @__PURE__ */ new Error("browser audio unlock failed");
					if (this.#context === context) this.#disposeGraph();
					else {
						try {
							gainNode?.disconnect();
						} catch {}
						cleanupContext(context);
					}
					return Promise.reject(error);
				}
			}
			#apply(transaction, voices) {
				this.#assertUsable();
				this.#transactionCount += 1;
				const byVoiceId = new Map(voices.map((voice) => [voice.voiceId, voice]));
				let gainBasisPoints = this.#gainBasisPoints;
				let muted = this.#muted;
				try {
					for (const command of transaction.commands) if (command.kind === "output") {
						gainBasisPoints = command.gainBasisPoints;
						muted = command.muted;
						this.#setNodeGain(gainBasisPoints, muted);
					} else if (command.kind === "stop") this.#stop(command.voiceId);
					else if (command.kind === "start" && this.#gainNode !== null) this.#start(command, byVoiceId.get(command.voiceId), gainBasisPoints, muted);
					this.#gainBasisPoints = gainBasisPoints;
					this.#muted = muted;
				} catch (error) {
					this.#fault = error ?? /* @__PURE__ */ new Error("browser audio transaction failed");
					this.#disposeGraph();
					throw error;
				}
			}
			#start(command, voice, outputGainBasisPoints = this.#gainBasisPoints, outputMuted = this.#muted) {
				if (voice === void 0 || this.#active.has(command.voiceId)) throw new TypeError("browser audio start voice is invalid or duplicate");
				const context = this.#context;
				const samples = primitiveSamples(voice.bytes);
				const buffer = context.createBuffer(1, samples.length, voice.sampleRateHz ?? 48e3);
				if (buffer === null || typeof buffer !== "object") throw new TypeError("browser audio context returned an invalid buffer");
				if (typeof buffer.copyToChannel === "function") buffer.copyToChannel(samples, 0);
				else if (typeof buffer.getChannelData === "function") buffer.getChannelData(0).set(samples);
				else throw new TypeError("browser audio buffer cannot receive PCM data");
				const source = context.createBufferSource();
				if (source === null || typeof source !== "object" || typeof source.connect !== "function" || typeof source.disconnect !== "function" || typeof source.start !== "function" || typeof source.stop !== "function") throw new TypeError("browser audio context returned an invalid source");
				try {
					source.buffer = buffer;
					source.connect(this.#gainNode);
					source.onended = () => {
						if (this.#active.get(command.voiceId) !== source) return;
						this.#active.delete(command.voiceId);
						try {
							source.disconnect();
						} catch {}
					};
					this.#active.set(command.voiceId, source);
					source.start(context.currentTime);
					const metrics = primitivePcmMetrics(voice.bytes);
					this.#scheduledPcm.push(Object.freeze({
						...metrics,
						cueId: voice.cueId,
						effectiveGainBasisPoints: voice.effectiveGainBasisPoints,
						family: voice.family,
						mixGainBasisPoints: voice.mixGainBasisPoints ?? 1e4,
						outputGainBasisPoints,
						outputMuted,
						sampleCount: voice.sampleCount,
						sampleRateHz: voice.sampleRateHz,
						sequence: voice.sequence,
						sourceType: voice.sourceType,
						startTick: voice.startTick,
						voiceId: command.voiceId,
						waveformSha256: voice.waveformSha256
					}));
					this.#startCount += 1;
				} catch (error) {
					this.#active.delete(command.voiceId);
					try {
						source.stop(context.currentTime);
					} catch {}
					try {
						source.disconnect();
					} catch {}
					throw error;
				}
			}
			#stop(voiceId) {
				const source = this.#active.get(voiceId);
				if (source === void 0) return;
				this.#active.delete(voiceId);
				try {
					source.stop(this.#context.currentTime);
				} catch {}
				try {
					source.disconnect();
				} catch {}
			}
			#setNodeGain(gainBasisPoints = this.#gainBasisPoints, muted = this.#muted) {
				if (this.#gainNode === null) return;
				const value = muted ? 0 : gainBasisPoints / 1e4;
				this.#gainNode.gain.setValueAtTime(value, this.#context.currentTime);
			}
			#disposeGraph() {
				for (const voiceId of [...this.#active.keys()].sort((left, right) => left - right)) this.#stop(voiceId);
				try {
					this.#gainNode?.disconnect();
				} catch {}
				cleanupContext(this.#context);
				this.#gainNode = null;
				this.#context = null;
			}
			dispose() {
				if (this.#disposed) return false;
				this.#disposed = true;
				this.#disposeGraph();
				return true;
			}
			get state() {
				return frozen({
					activeVoiceCount: this.#active.size,
					audibleStartCount: this.#startCount,
					contextCreated: this.#context !== null,
					disposed: this.#disposed,
					faulted: this.#fault !== null,
					gainBasisPoints: this.#gainBasisPoints,
					muted: this.#muted,
					resumeCount: this.#resumeCount,
					scheduledBufferCount: this.#scheduledPcm.length,
					transactionCount: this.#transactionCount,
					unlockCount: this.#unlockCount,
					unlocked: this.#unlockPromise !== null && this.#fault === null
				});
			}
			/** Deterministic receipts for PCM buffers actually handed to Web Audio. */
			get scheduledPcmObservations() {
				return frozen(this.#scheduledPcm.map((observation) => ({ ...observation })));
			}
			get scheduledBuffers() {
				return this.scheduledPcmObservations;
			}
			#assertUsable() {
				if (this.#disposed) throw new Error("browser audio sink is disposed");
				if (this.#fault !== null) throw new Error("browser audio sink is permanently faulted");
			}
		};
	})))();
}
//#endregion
//#region src/sim/live-battle.js
function projectilePlan(value) {
	return value === void 0 ? void 0 : admitSessionTroopProjectileRuntimeProfiles(value);
}
var LiveBattle;
function init_live_battle() {
	return (init_live_battle = __esmMin((() => {
		init_battle_continuation_kernel();
		init_session_troop_projectile_runtime();
		LiveBattle = class LiveBattle extends LiveBattle$1 {
			constructor(value, troopRuntimeProfiles = void 0, statusRuntimeProfiles = void 0, projectileRuntimeProfiles = void 0) {
				super(value, troopRuntimeProfiles, statusRuntimeProfiles, projectilePlan(projectileRuntimeProfiles));
			}
			static restore(serialized) {
				const plan = admitSessionTroopProjectileRuntimeFromBattleSnapshot(serialized);
				const restored = LiveBattle$1.restore(serialized, plan);
				Object.setPrototypeOf(restored, LiveBattle.prototype);
				return restored;
			}
		};
	})))();
}
//#endregion
//#region src/sim/game-player-deploy.js
function plain(value, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain string-keyed data object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	for (const [key, descriptor] of Object.entries(descriptors)) if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
	return descriptors;
}
function exact(value, keys, label) {
	const descriptors = plain(value, label);
	const actual = Reflect.ownKeys(descriptors).sort();
	const expected = [...keys].sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}
function dense(value, label, maximum) {
	if (!Array.isArray(value) || value.length > maximum) throw new TypeError(`${label} must be a bounded array`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	for (const key of Reflect.ownKeys(descriptors)) {
		if (key === "length") continue;
		if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) throw new TypeError(`${label} must contain only indexed data`);
	}
	return Array.from({ length: value.length }, (_, index) => {
		const descriptor = descriptors[index];
		if (descriptor === void 0 || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}[${index}] must be an enumerable data property`);
		return descriptor.value;
	});
}
function integer(value, minimum, maximum, label) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a safe integer from ${minimum} through ${maximum}`);
	return value;
}
function string(value, label) {
	if (typeof value !== "string" || value.length === 0 || value.length > 128) throw new TypeError(`${label} must be a bounded non-empty string`);
	return value;
}
function clone(value) {
	return JSON.parse(JSON.stringify(value));
}
function freeze(value) {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) freeze(child);
		Object.freeze(value);
	}
	return value;
}
function canonical(value) {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function assertUnicodeScalars(value, label) {
	if (typeof value !== "string") return;
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code >= 55296 && code <= 56319) {
			const next = value.charCodeAt(index + 1);
			if (!(next >= 56320 && next <= 57343)) throw new TypeError(`${label} contains an unpaired Unicode surrogate`);
			index += 1;
		} else if (code >= 56320 && code <= 57343) throw new TypeError(`${label} contains an unpaired Unicode surrogate`);
	}
}
function preflightGraph(root, label) {
	const pending = [{
		depth: 0,
		value: root
	}];
	let nodes = 0;
	while (pending.length > 0) {
		const { depth, value } = pending.pop();
		nodes += 1;
		if (nodes > MAX_PARSED_NODES) throw new RangeError(`${label} node bound exceeded`);
		if (depth > MAX_PARSED_DEPTH) throw new RangeError(`${label} depth bound exceeded`);
		if (typeof value === "string") assertUnicodeScalars(value, label);
		if (value === null || typeof value !== "object") continue;
		for (const [key, child] of Object.entries(value)) {
			assertUnicodeScalars(key, label);
			pending.push({
				depth: depth + 1,
				value: child
			});
		}
	}
}
function parseBoundedCanonical(text, label, maximumBytes = MAX_SNAPSHOT_BYTES) {
	if (typeof text !== "string") throw new TypeError(`${label} must be primitive JSON text`);
	if (new TextEncoder().encode(text).byteLength > maximumBytes) throw new RangeError(`${label} exceeds its byte bound`);
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new TypeError(`${label} must be valid JSON`);
	}
	preflightGraph(parsed, label);
	if (canonical(parsed) !== text) throw new TypeError(`${label} must be canonical JSON`);
	return parsed;
}
function checkedCards(value) {
	const cards = dense(value, "player deploy cards", 8).map((raw, index) => {
		const card = exact(raw, ["cost", "id"], `player deploy card ${index}`);
		return {
			cost: integer(card.cost, 1, 10, `player deploy card ${index}.cost`),
			id: string(card.id, `player deploy card ${index}.id`)
		};
	});
	if (cards.length !== 8 || new Set(cards.map(({ id }) => id)).size !== 8) throw new TypeError("player deploy cards must contain eight unique identities");
	return cards;
}
function checkedReceipt(value) {
	const receipt = exact(value, RECEIPT_KEYS, "player deploy receipt");
	if (receipt.accepted !== true || !["deploy", "spell"].includes(receipt.type)) throw new TypeError("player deploy receipt must be accepted deploy or spell intent");
	const point = validateArenaPoint(receipt.point, "player deploy receipt.point");
	if (receipt.side !== "south") throw new TypeError("player deploy receipt.side must be south");
	return {
		accepted: true,
		cardId: string(receipt.cardId, "player deploy receipt.cardId"),
		commandId: integer(receipt.commandId, 1, MAX_PLAYER_DEPLOY_COMMANDS, "player deploy receipt.commandId"),
		cost: integer(receipt.cost, 1, 10, "player deploy receipt.cost"),
		point: { ...point },
		side: "south",
		slot: integer(receipt.slot, 0, 3, "player deploy receipt.slot"),
		spendSequence: integer(receipt.spendSequence, 0, Number.MAX_SAFE_INTEGER, "player deploy receipt.spendSequence"),
		tick: integer(receipt.tick, 0, 18e3, "player deploy receipt.tick"),
		type: receipt.type
	};
}
/** Create the browser-portable opaque pre-commit intent authority. */
function createPlayerDeployIntent(value) {
	const checked = checkedReceipt(value);
	const intent = Object.freeze(Object.create(null));
	INTENTS.set(intent, checked);
	return intent;
}
function receiptFromAuthority(value) {
	if (typeof value === "string") return checkedReceipt(parseBoundedCanonical(value, "player deploy intent", 16384));
	if (value !== null && typeof value === "object" && INTENTS.has(value)) return clone(INTENTS.get(value));
	throw new TypeError("player deploy intent must be canonical JSON text or a private branded intent");
}
function derivedRoster(battleBytes) {
	return JSON.parse(battleBytes).setup.roster.map(({ cost, id }) => ({
		cost,
		id
	}));
}
function derivedHudRoster(battleBytes) {
	return JSON.parse(battleBytes).setup.roster;
}
/** Trap-free authenticity check owned by the bridge module itself. */
function isPlayerDeployBridge(value) {
	return PLAYER_DEPLOY_BRIDGES.has(value);
}
var MAX_PLAYER_DEPLOY_COMMANDS, MAX_SNAPSHOT_BYTES, MAX_PARSED_DEPTH, MAX_PARSED_NODES, INTENTS, PREPARED, PLAYER_DEPLOY_BRIDGES, RECEIPT_KEYS, PlayerDeployBridge;
function init_game_player_deploy() {
	return (init_game_player_deploy = __esmMin((() => {
		init_deck();
		init_deployment();
		init_elixir();
		init_live_battle();
		init_arena_geometry();
		MAX_PLAYER_DEPLOY_COMMANDS = 1e4;
		MAX_SNAPSHOT_BYTES = 16777216;
		MAX_PARSED_DEPTH = 256;
		MAX_PARSED_NODES = 1e5;
		INTENTS = /* @__PURE__ */ new WeakMap();
		PREPARED = /* @__PURE__ */ new WeakMap();
		PLAYER_DEPLOY_BRIDGES = /* @__PURE__ */ new WeakSet();
		RECEIPT_KEYS = [
			"accepted",
			"cardId",
			"commandId",
			"cost",
			"point",
			"side",
			"slot",
			"spendSequence",
			"tick",
			"type"
		];
		PlayerDeployBridge = class PlayerDeployBridge {
			#battle;
			#cards;
			#deck;
			#elixir;
			#events = [];
			#epoch = 0;
			#history = [];
			#initial;
			#results = /* @__PURE__ */ new Map();
			#outstanding = null;
			constructor(options) {
				if (new.target !== PlayerDeployBridge) throw new TypeError("player deploy bridge subclass construction is forbidden");
				const checked = exact(options, [
					"battle",
					"cards",
					"deck",
					"elixir"
				], "player deploy options");
				if (Object.getPrototypeOf(checked.battle) !== LiveBattle.prototype || Object.getPrototypeOf(checked.deck) !== DeckCycle.prototype || Object.getPrototypeOf(checked.elixir) !== ElixirMatch.prototype) throw new TypeError("player deploy systems must be exact canonical system instances");
				this.#cards = checkedCards(checked.cards);
				const battleBytes = checked.battle.serialize();
				const deckBytes = checked.deck.serializeJson();
				const elixirBytes = checked.elixir.serialize();
				if (canonical(derivedRoster(battleBytes)) !== canonical(this.#cards)) throw new TypeError("player deploy cards must exactly match the live battle roster");
				if (canonical(JSON.parse(deckBytes).deck) !== canonical(this.#cards.map(({ id }) => id))) throw new TypeError("player deploy deck must exactly match the live battle roster order");
				this.#battle = LiveBattle.restore(battleBytes);
				this.#deck = DeckCycle.restore(deckBytes);
				this.#elixir = ElixirMatch.restore(elixirBytes);
				if (this.#battle.state.tick !== this.#elixir.tick) throw new RangeError("player deploy battle and elixir ticks must agree");
				this.#initial = {
					battle: battleBytes,
					deck: deckBytes,
					elixir: elixirBytes
				};
				Object.freeze(this);
				PLAYER_DEPLOY_BRIDGES.add(this);
			}
			get state() {
				return freeze({
					battle: clone(this.#battle.state),
					deck: clone(this.#deck.state),
					elixir: clone(this.#elixir.state),
					processedCommandIds: [...this.#results.keys()].sort((a, b) => a - b),
					tick: this.#battle.state.tick
				});
			}
			get replay() {
				return freeze(clone(this.#events));
			}
			get deckBytes() {
				return this.#deck.serializeJson();
			}
			get elixirBytes() {
				return this.#elixir.serialize();
			}
			get rosterBytes() {
				return canonical(derivedHudRoster(this.#battle.serialize()));
			}
			play(receiptValue) {
				const prepared = this.prepare(receiptValue);
				return this.commitPrepared(prepared);
			}
			prepare(receiptValue) {
				if (this.#outstanding !== null) throw new RangeError("player deploy already has an outstanding prepared transaction");
				const receipt = receiptFromAuthority(receiptValue);
				const baseBytes = this.serialize();
				const prior = this.#results.get(receipt.commandId);
				if (prior !== void 0) {
					if (prior.receiptBytes !== canonical(receipt)) throw new RangeError("player deploy command identity has divergent payload");
					const token = Object.freeze(Object.create(null));
					PREPARED.set(token, {
						baseBytes,
						candidate: null,
						epoch: this.#epoch,
						owner: this,
						result: clone(prior.result)
					});
					this.#outstanding = token;
					return token;
				}
				if (this.#history.length >= 1e4) throw new RangeError("player deploy command history bound exceeded");
				const candidate = this.#runtimeClone();
				const result = candidate.#apply(receipt);
				const token = Object.freeze(Object.create(null));
				PREPARED.set(token, {
					baseBytes,
					candidate,
					epoch: this.#epoch,
					owner: this,
					result: clone(result)
				});
				this.#outstanding = token;
				return token;
			}
			preparedResult(token) {
				const prepared = PREPARED.get(token);
				if (prepared === void 0 || prepared.owner !== this || this.#outstanding !== token || prepared.epoch !== this.#epoch || prepared.baseBytes !== this.serialize()) throw new TypeError("player deploy prepared transaction is invalid or consumed");
				const systems = prepared.candidate ?? this;
				return freeze({
					deckBytes: systems.#deck.serializeJson(),
					elixirBytes: systems.#elixir.serialize(),
					result: clone(prepared.result)
				});
			}
			commitPrepared(token) {
				const prepared = PREPARED.get(token);
				if (prepared === void 0 || prepared.owner !== this || this.#outstanding !== token || prepared.epoch !== this.#epoch || prepared.baseBytes !== this.serialize()) throw new TypeError("player deploy prepared transaction is invalid or consumed");
				PREPARED.delete(token);
				this.#outstanding = null;
				if (prepared.candidate !== null) this.#adopt(prepared.candidate);
				this.#epoch += 1;
				return freeze(clone(prepared.result));
			}
			step() {
				return this.stepMany(1);
			}
			stepMany(ticks) {
				integer(ticks, 0, 18e3, "player deploy step ticks");
				if (this.state.tick + ticks > 18e3 || this.#history.length + ticks > 1e4) throw new RangeError("player deploy step/history bound exceeded");
				const candidate = this.#runtimeClone();
				const results = [];
				for (let count = 0; count < ticks; count += 1) {
					const tick = candidate.#battle.state.tick;
					const elixirEvents = candidate.#elixir.step();
					const event = {
						battleEventCount: candidate.#battle.step(tick).length,
						elixirEventCount: elixirEvents.length,
						tick,
						type: "step"
					};
					candidate.#events.push(event);
					candidate.#history.push({
						tick,
						type: "step"
					});
					results.push(event);
				}
				this.#adopt(candidate);
				this.#outstanding = null;
				this.#epoch += 1;
				return freeze(clone(results));
			}
			serialize() {
				const bytes = canonical({
					cards: this.#cards,
					history: this.#history,
					initial: this.#initial,
					version: 1
				});
				if (new TextEncoder().encode(bytes).byteLength > MAX_SNAPSHOT_BYTES) throw new RangeError("serialized player deploy bridge exceeds byte bound");
				return bytes;
			}
			static restore(serialized) {
				const checked = exact(parseBoundedCanonical(serialized, "serialized player deploy bridge"), [
					"cards",
					"history",
					"initial",
					"version"
				], "player deploy snapshot");
				if (checked.version !== 1) throw new TypeError("unsupported player deploy snapshot version");
				const initial = exact(checked.initial, [
					"battle",
					"deck",
					"elixir"
				], "player deploy snapshot.initial");
				for (const key of [
					"battle",
					"deck",
					"elixir"
				]) if (typeof initial[key] !== "string") throw new TypeError(`snapshot.initial.${key} is invalid`);
				const bridge = new PlayerDeployBridge({
					battle: LiveBattle.restore(initial.battle),
					cards: checked.cards,
					deck: DeckCycle.restore(initial.deck),
					elixir: ElixirMatch.restore(initial.elixir)
				});
				const history = dense(checked.history, "player deploy snapshot.history", MAX_PLAYER_DEPLOY_COMMANDS);
				for (let index = 0; index < history.length; index += 1) {
					const operation = history[index];
					plain(operation, `player deploy snapshot.history[${index}]`);
					if (operation.type === "play") {
						const entry = exact(operation, ["receipt", "type"], `history[${index}]`);
						bridge.play(canonical(entry.receipt));
					} else if (operation.type === "step") {
						if (exact(operation, ["tick", "type"], `history[${index}]`).tick !== bridge.state.tick) throw new TypeError("noncausal player deploy step");
						bridge.step();
					} else throw new TypeError(`player deploy snapshot.history[${index}] is invalid`);
				}
				if (bridge.serialize() !== serialized) throw new TypeError("player deploy snapshot is not canonical or causal");
				return bridge;
			}
			#apply(receipt) {
				if (receipt.tick !== this.#battle.state.tick || receipt.tick !== this.#elixir.tick) throw new RangeError("player deploy receipt tick is stale or future");
				const card = this.#cards.find(({ id }) => id === receipt.cardId);
				if (card === void 0 || card.cost !== receipt.cost) throw new TypeError("player deploy receipt card/cost does not match the catalog");
				if (this.#deck.state.hand[receipt.slot] !== receipt.cardId) throw new RangeError("player deploy receipt card does not match its explicit hand slot");
				const hasRadiusProfile = this.#battle.hasRadiusSpellProfile(receipt.cardId);
				const spell = receipt.type === "spell";
				if (spell !== hasRadiusProfile) throw new RangeError("player spell receipt does not match an admitted radius profile");
				const decision = evaluateDeployment({
					destroyedOpposingLaneTowers: [],
					placementClass: spell ? "global_effect" : "ground_entity",
					point: receipt.point,
					side: receipt.side
				});
				if (!decision.legal) throw new RangeError(`player deploy placement is illegal: ${decision.reason}`);
				const spendSequence = this.#elixir.scheduleSpend(receipt.tick, receipt.side, receipt.cost);
				if (spendSequence !== receipt.spendSequence) throw new RangeError("player deploy receipt spend sequence is noncanonical");
				const deckEvent = this.#deck.play(receipt.cardId);
				if (!deckEvent.accepted || deckEvent.slot !== receipt.slot) throw new Error("player deploy deck rejected a prevalidated receipt");
				const intent = spell ? this.#battle.scheduleSpell({
					cardId: receipt.cardId,
					point: receipt.point,
					sequence: receipt.commandId,
					side: receipt.side,
					tick: receipt.tick
				}) : null;
				if (!spell) this.#battle.scheduleDeploy(canonical({
					cardId: receipt.cardId,
					point: receipt.point,
					sequence: receipt.commandId,
					side: receipt.side,
					tick: receipt.tick
				}));
				const spend = this.#elixir.step().find((event) => event.type === "spend" && event.sequence === spendSequence);
				if (spend === void 0 || !spend.accepted) throw new RangeError("player deploy has insufficient elixir");
				const battleEvents = this.#battle.step(receipt.tick);
				const deployment = spell ? null : battleEvents.find((event) => event.type === "deployed" && event.sequence === receipt.commandId);
				if (!spell && (deployment === void 0 || deployment.cardId !== receipt.cardId)) throw new Error("player deploy battle did not materialize the receipt exactly once");
				const event = spell ? {
					cardId: receipt.cardId,
					commandId: receipt.commandId,
					deck: clone(deckEvent),
					intent: clone(intent),
					point: { ...receipt.point },
					receipt: clone(receipt),
					spend: clone(spend),
					tick: receipt.tick,
					type: "player-spell-cast"
				} : {
					cardId: receipt.cardId,
					commandId: receipt.commandId,
					deck: clone(deckEvent),
					deployment: clone(deployment),
					point: { ...receipt.point },
					receipt: clone(receipt),
					spend: clone(spend),
					tick: receipt.tick,
					type: "player-deployed"
				};
				const result = spell ? {
					accepted: true,
					cardId: receipt.cardId,
					commandId: receipt.commandId,
					effectId: intent.effectId,
					point: { ...receipt.point },
					tick: receipt.tick,
					type: "player-spell-result"
				} : {
					accepted: true,
					cardId: receipt.cardId,
					commandId: receipt.commandId,
					entityIds: clone(deployment.entityIds),
					point: { ...receipt.point },
					tick: receipt.tick,
					type: "player-deploy-result"
				};
				this.#events.push(event);
				this.#history.push({
					receipt: clone(receipt),
					type: "play"
				});
				this.#results.set(receipt.commandId, {
					receiptBytes: canonical(receipt),
					result: clone(result)
				});
				return result;
			}
			#runtimeClone() {
				const candidate = new PlayerDeployBridge({
					battle: LiveBattle.restore(this.#battle.serialize()),
					cards: this.#cards,
					deck: DeckCycle.restore(this.#deck.serializeJson()),
					elixir: ElixirMatch.restore(this.#elixir.serialize())
				});
				candidate.#events = clone(this.#events);
				candidate.#epoch = this.#epoch;
				candidate.#history = clone(this.#history);
				candidate.#initial = clone(this.#initial);
				candidate.#results = new Map([...this.#results].map(([id, value]) => [id, clone(value)]));
				candidate.#outstanding = null;
				return candidate;
			}
			#adopt(candidate) {
				this.#battle = candidate.#battle;
				this.#cards = candidate.#cards;
				this.#deck = candidate.#deck;
				this.#elixir = candidate.#elixir;
				this.#events = candidate.#events;
				this.#history = candidate.#history;
				this.#initial = candidate.#initial;
				this.#results = candidate.#results;
			}
		};
		Object.freeze(PlayerDeployBridge.prototype);
	})))();
}
//#endregion
//#region src/sim/match.js
function init_match() {
	return (init_match = __esmMin((() => {
		init_battle_continuation_kernel();
	})))();
}
//#endregion
//#region src/sim/towers.js
function init_towers() {
	return (init_towers = __esmMin((() => {
		init_battle_continuation_kernel();
	})))();
}
//#endregion
export { init_game_player_deploy as a, init_live_battle as c, init_browser_audio as d, isAuthenticBrowserPcmAudioSink as f, isAuthenticGameAudioRuntime as g, init_game_audio_runtime as h, createPlayerDeployIntent as i, BrowserPcmAudioSink as l, createGameAudioRuntimeUiCapability as m, init_match as n, isPlayerDeployBridge as o, GameAudioRuntime as p, PlayerDeployBridge as r, LiveBattle as s, init_towers as t, createBrowserAudioContextFactoryCapability as u };
