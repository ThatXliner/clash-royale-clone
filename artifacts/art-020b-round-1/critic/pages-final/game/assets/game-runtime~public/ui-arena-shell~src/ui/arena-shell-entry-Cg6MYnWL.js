import { t as __esmMin } from "../../../rolldown-runtime-Cl99QfTQ.js";
import { M as createPlayableRoster, N as createPlayableRosterQuestionRecords, P as init_playable_roster, a as createSessionTroopWitness, c as init_session_card_catalog, l as projectSessionNonUnitBattleCard, n as createEditableGameSessionSetup, o as init_session_troop_roster, r as init_editable_deck, t as EDITABLE_MIXED_DECK_CARD_IDS } from "../../index~public/ui-arena-shell~src/rl/environment~src/ui/arena-shell-entry-BIpBpF5T.js";
import { a as ARENA_WIDTH_MILLITILES, d as validateArenaPoint, r as ARENA_LENGTH_MILLITILES, s as init_arena_geometry } from "../../index~public/ui-arena-shell~src/rl/environment~src/ui/arena-shell-entry-DE4DQgyW.js";
import { J as init_deck, K as DECK_MAX_PLAY_COMMANDS, Q as init_deployment, Z as evaluateDeployment, q as DeckCycle, t as init_elixir } from "../../index~public/ui-arena-shell~src/rl/environment~src/ui/arena-shell-entry-RL6mb1Mf.js";
import { c as validateCombatEffectFeed, o as init_combat_effect_feed } from "../../index~public/ui-arena-shell~src/rl/environment~src/ui/arena-shell-entry-CNVraBnB.js";
import { _ as isAuthenticGameSessionProjectionSnapshot, a as GAME_SESSION_MAX_SNAPSHOT_BYTES, d as MATCH_TICKS_PER_SECOND, f as MatchClock, g as isAuthenticGameSession, i as GAME_SESSION_MAX_BATCH_TICKS, l as MATCH_MAX_TICKS, n as ELIXIR_CAPACITY, o as GAME_SESSION_MAX_TRANSCRIPT, p as TOWER_COMBAT_CONFIG, r as ElixirMatch, t as ELIXIR_ACCUMULATOR_DENOMINATOR, u as MATCH_REGULATION_TICKS, v as parseLiveBattleSetup } from "../../index~public/ui-arena-shell~src/rl/environment~src/ui/arena-shell-entry-DoWZ9JV1.js";
import { n as init_game_session, t as GameSession } from "../rl/environment~src/ui/arena-shell-entry-DbZPdfEl.js";
import { a as init_game_player_deploy, c as init_live_battle, d as init_browser_audio, f as isAuthenticBrowserPcmAudioSink, g as isAuthenticGameAudioRuntime, h as init_game_audio_runtime, i as createPlayerDeployIntent, l as BrowserPcmAudioSink, m as createGameAudioRuntimeUiCapability, n as init_match, o as isPlayerDeployBridge, p as GameAudioRuntime, r as PlayerDeployBridge, s as LiveBattle, t as init_towers, u as createBrowserAudioContextFactoryCapability } from "./arena-shell-entry-CBgv4njj.js";
//#region src/ui/arena-shell.js
function mountArenaShell(target) {
	if (target === null || typeof target !== "object" || typeof target.replaceChildren !== "function" || target.ownerDocument === null || typeof target.ownerDocument !== "object" || typeof target.ownerDocument.createElement !== "function") throw new TypeError("arena shell target must be a DOM element");
	const template = target.ownerDocument.createElement("template");
	template.innerHTML = SHELL_MARKUP;
	target.replaceChildren(template.content.cloneNode(true));
	return target.firstElementChild;
}
var SHELL_MARKUP;
function init_arena_shell() {
	return (init_arena_shell = __esmMin((() => {
		Object.freeze({
			width: 720,
			height: 1280
		});
		Object.freeze({
			left: 90,
			top: 108,
			width: 540,
			height: 960,
			columns: 18,
			rows: 32,
			tileWidth: 30,
			tileHeight: 30
		});
		Object.freeze({
			kind: "original-authored-primitives",
			externalAssets: Object.freeze([]),
			calibration: "uncalibrated-no-licensed-reference-still"
		});
		SHELL_MARKUP = `<main class="battle-shell" data-ui="arena-shell" aria-label="Empty card battle arena">
  <button class="audio-toggle" type="button" data-ui="audio-toggle" aria-pressed="false" aria-label="Mute audio">Sound on</button>
  <button class="deck-choice-open" type="button" data-ui="deck-choice-open" aria-haspopup="dialog" aria-controls="deck-choice" aria-expanded="false" hidden>Choose deck</button>
  <section class="deck-choice" id="deck-choice" data-ui="deck-choice" role="dialog" aria-modal="true" aria-labelledby="deck-choice-title" hidden>
    <div class="deck-choice__panel">
      <p class="deck-choice__eyebrow">READY YOUR DECK</p>
      <h1 id="deck-choice-title">Choose an eight-card deck</h1>
      <div class="deck-choice__options" role="group" aria-label="Supported decks">
        <button class="deck-choice__option" type="button" data-deck-choice="standard" aria-pressed="true">
          <strong>Standard</strong><span>Eight supported cards</span>
        </button>
        <button class="deck-choice__option" type="button" data-deck-choice="stonehauler" aria-pressed="false">
          <strong>Stonehauler</strong><span>Replaces Cinderlings</span>
        </button>
        <button class="deck-choice__option" type="button" data-deck-choice="bulwark-needle" aria-pressed="false">
          <strong>Bulwark Needle</strong><span>Replaces Cinderlings · combat QUESTION</span>
        </button>
      </div>
      <button class="deck-choice__start" type="button" data-ui="deck-start">Start match</button>
    </div>
  </section>
  <aside class="combat-policy-question" data-ui="policy-question" role="status" aria-live="polite" hidden></aside>
  <button class="restart-control" type="button" data-ui="restart" hidden>Play again</button>
  <header class="match-rail match-rail--top" data-ui="opponent-hud">
    <span class="player-mark player-mark--ember" aria-hidden="true"></span>
    <span class="crown-track" aria-label="Opponent score"><i></i><i></i><i></i></span>
  </header>
  <section class="arena" data-ui="arena" aria-label="Arena">
    <div class="arena-half arena-half--north" aria-hidden="true"></div>
    <div class="arena-half arena-half--south" aria-hidden="true"></div>
    <div class="lane lane--west" data-lane="west" aria-hidden="true"></div>
    <div class="lane lane--east" data-lane="east" aria-hidden="true"></div>
    <div class="river" data-ui="river" aria-hidden="true"></div>
    <div class="bridge bridge--west" data-ui="bridge" data-lane="west" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="bridge bridge--east" data-ui="bridge" data-lane="east" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="tower-pad tower-pad--north-central" data-ui="tower-pad" data-side="north" data-role="central" aria-hidden="true"><i></i></div>
    <div class="tower-pad tower-pad--north-west" data-ui="tower-pad" data-side="north" data-role="lane" data-lane="west" aria-hidden="true"><i></i></div>
    <div class="tower-pad tower-pad--north-east" data-ui="tower-pad" data-side="north" data-role="lane" data-lane="east" aria-hidden="true"><i></i></div>
    <div class="tower-pad tower-pad--south-central" data-ui="tower-pad" data-side="south" data-role="central" aria-hidden="true"><i></i></div>
    <div class="tower-pad tower-pad--south-west" data-ui="tower-pad" data-side="south" data-role="lane" data-lane="west" aria-hidden="true"><i></i></div>
    <div class="tower-pad tower-pad--south-east" data-ui="tower-pad" data-side="south" data-role="lane" data-lane="east" aria-hidden="true"><i></i></div>
  </section>
  <aside class="timer" data-ui="timer" aria-label="Time remaining">3:00</aside>
  <footer class="match-rail match-rail--bottom" data-ui="player-hud">
    <span class="player-mark player-mark--aqua" aria-hidden="true"></span>
    <span class="crown-track" aria-label="Player score"><i></i><i></i><i></i></span>
  </footer>
  <section class="hand-tray" data-ui="hand-tray" aria-label="Card hand">
    <div class="next-card" data-ui="next-card" aria-label="Next card"></div>
    <div class="card-slot" data-ui="card-slot" aria-label="Card slot 1"></div>
    <div class="card-slot" data-ui="card-slot" aria-label="Card slot 2"></div>
    <div class="card-slot" data-ui="card-slot" aria-label="Card slot 3"></div>
    <div class="card-slot" data-ui="card-slot" aria-label="Card slot 4"></div>
  </section>
  <section class="elixir-rail" data-ui="elixir-rail" aria-label="Resource meter">
    <div class="elixir-fill" aria-hidden="true"></div>
    <div class="elixir-ticks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <output aria-label="Resource amount">5</output>
  </section>
</main>`;
	})))();
}
//#endregion
//#region src/ui/combat-effects.js
function getCombatEffectsStyleText() {
	return STYLE_TEXT$1;
}
function integer$3(value, minimum, maximum, label) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a safe integer from ${minimum} through ${maximum}`);
	return value;
}
function plainDataObject(value, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be a plain data object`);
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain data object`);
	if (Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must contain only string keys`);
	return value;
}
function canonicalJson$5(value) {
	if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number") {
		if (!Number.isSafeInteger(value)) throw new TypeError("combat effect view numbers must be safe integers");
		return String(value);
	}
	if (Array.isArray(value)) return `[${value.map(canonicalJson$5).join(",")}]`;
	if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$5(value[key])}`).join(",")}}`;
	throw new TypeError("combat effect view contains unsupported data");
}
function freeze$4(value, seen = /* @__PURE__ */ new WeakSet()) {
	if (value === null || typeof value !== "object" || seen.has(value)) return value;
	seen.add(value);
	for (const child of Object.values(value)) freeze$4(child, seen);
	return Object.freeze(value);
}
function projectionInput(value, suppliedTick) {
	if (suppliedTick !== void 0) return {
		feed: value,
		tick: suppliedTick
	};
	const object = plainDataObject(value, "combat effects projection input");
	const descriptors = Object.getOwnPropertyDescriptors(object);
	const actual = Reflect.ownKeys(descriptors);
	const matches = [["feed", "tick"], ["combatEffectFeed", "tick"]].find((keys) => {
		const expected = [...keys].sort();
		const sortedActual = [...actual].sort();
		return sortedActual.length === expected.length && sortedActual.every((key, index) => key === expected[index]);
	});
	if (matches === void 0) throw new TypeError("combat effects projection input has an invalid shape");
	const result = {};
	for (const key of matches) {
		const descriptor = descriptors[key];
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${key} must be an enumerable data property`);
		result[key === "combatEffectFeed" ? "feed" : key] = descriptor.value;
	}
	return result;
}
function visualKind(direction) {
	if (!PROJECTILE_DIRECTIONS.has(direction)) throw new TypeError("combat effect feed contains an unsupported projectile direction");
	return direction;
}
function pointInterpolation(from, to, elapsed, duration) {
	if (duration === 0) return to;
	const fromDenominator = BigInt(from.denominator);
	const toDenominator = BigInt(to.denominator);
	const total = BigInt(duration);
	const at = BigInt(elapsed);
	const denominator = fromDenominator * toDenominator * total;
	const remaining = total - at;
	return {
		denominator: denominator.toString(),
		xNumerator: (BigInt(from.xNumerator) * toDenominator * remaining + BigInt(to.xNumerator) * fromDenominator * at).toString(),
		yNumerator: (BigInt(from.yNumerator) * toDenominator * remaining + BigInt(to.yNumerator) * fromDenominator * at).toString()
	};
}
function carrierKey(rootId, segmentId = null) {
	return segmentId === null ? rootId : `${rootId}:segment:${segmentId}`;
}
function carrierEndpoints(root) {
	const payload = root.open.payload;
	if (payload.to !== null) return [{
		id: null,
		to: payload.to
	}];
	return payload.segments.map(({ id, to }) => ({
		id,
		to
	}));
}
function terminalTick(root) {
	let terminal = root.open.payload.impactTick;
	if (root.impact !== null && root.impact.tick < terminal) terminal = root.impact.tick;
	if (root.close !== null && root.close.tick < terminal) terminal = root.close.tick;
	return terminal;
}
function activeLeg(root, endpoint, tick) {
	const open = root.open;
	const plannedEnd = terminalTick(root);
	if (tick < open.tick || tick >= plannedEnd) return null;
	let from = open.payload.from;
	let launchTick = open.tick;
	let impactTick = plannedEnd;
	if (open.payload.direction === "return" && root.turn !== null) {
		if (tick >= root.turn.tick) {
			from = root.turn.payload.point;
			endpoint = {
				id: endpoint.id,
				to: open.payload.from
			};
			launchTick = root.turn.tick;
		} else {
			endpoint = {
				id: endpoint.id,
				to: open.payload.to
			};
			impactTick = root.turn.tick;
		}
	}
	if (impactTick <= launchTick || tick >= impactTick) return null;
	return {
		from,
		impactTick,
		key: carrierKey(open.rootId, endpoint.id),
		kind: visualKind(open.payload.direction),
		launchTick,
		sourceSequence: open.payload.sequence,
		to: endpoint.to
	};
}
function projectilePoint(record, tick) {
	if (tick <= record.launchTick) return record.from;
	if (tick >= record.impactTick) return record.to;
	return pointInterpolation(record.from, record.to, tick - record.launchTick, record.impactTick - record.launchTick);
}
function impactRecord(root, record, suffix = null) {
	return {
		key: suffix === null ? root.open.rootId : `${root.open.rootId}:${suffix}:${record.eventId}`,
		kind: visualKind(root.open.payload.direction),
		point: record.payload.point ?? record.payload.center,
		sourceSequence: root.open.payload.sequence
	};
}
function areaRecord(root, point, radius) {
	return {
		key: root.open.rootId,
		point,
		radius,
		sourceSequence: root.open.payload.sequence
	};
}
function buildView$1(input, suppliedTick) {
	const { feed, tick: rawTick } = projectionInput(input, suppliedTick);
	const tick = integer$3(rawTick, 0, Number.MAX_SAFE_INTEGER, "combat effects view.tick");
	const records = validateCombatEffectFeed(feed).records;
	const roots = /* @__PURE__ */ new Map();
	const impactVisuals = [];
	const areaVisuals = [];
	for (const record of records) {
		if (record.tick > tick) throw new TypeError("combat effect feed contains a record after the view tick");
		let root = roots.get(record.rootId);
		if (record.parentId === null) {
			root = {
				close: null,
				impact: null,
				open: record,
				turn: null
			};
			roots.set(record.rootId, root);
		} else if (root === void 0) throw new TypeError("combat effect child names an unknown root");
		if (record.phase === "turn") root.turn = record;
		else if (record.phase === "impact") {
			root.impact = record;
			if (record.tick === tick && record.type === "area") areaVisuals.push(areaRecord(root, record.payload.center, record.payload.radius));
			else if (record.tick === tick && record.type === "projectile") impactVisuals.push(impactRecord(root, record));
		} else if (record.phase === "contact" && record.tick === tick) impactVisuals.push(impactRecord(root, record, "contact"));
		else if (record.phase === "close") root.close = record;
	}
	for (const root of roots.values()) if (root.open.type === "area" && root.open.tick === tick && (root.impact === null || root.impact.tick !== tick)) areaVisuals.push(areaRecord(root, root.open.payload.from, root.open.payload.radius));
	const paths = [];
	const projectiles = [];
	for (const root of roots.values()) {
		if (root.open.type !== "projectile") continue;
		for (const endpoint of carrierEndpoints(root)) {
			const active = activeLeg(root, endpoint, tick);
			if (active === null) continue;
			paths.push({
				from: active.from,
				impactTick: active.impactTick,
				key: active.key,
				kind: active.kind,
				launchTick: active.launchTick,
				sourceSequence: active.sourceSequence,
				to: active.to
			});
			projectiles.push({
				key: active.key,
				kind: active.kind,
				point: projectilePoint(active, tick),
				sourceSequence: active.sourceSequence
			});
		}
	}
	if (paths.length + areaVisuals.length + impactVisuals.length > 2048) throw new RangeError("combat effect view primitive count exceeds its bound");
	const view = {
		areas: areaVisuals,
		events: records,
		impacts: impactVisuals,
		paths,
		projectiles,
		tick,
		version: 2
	};
	freeze$4(view);
	VIEWS$1.add(view);
	return view;
}
/**
* Project a canonical combat-effect feed at a match tick.
*
* The preferred form is `(feed, tick)`. The object form
* `{ feed, tick }` is accepted for callers that pass a named projection
* input. No legacy `{ events, tick }` input is admitted.
*/
function createCombatEffectsViewModel(feedOrInput, suppliedTick) {
	return buildView$1(feedOrInput, suppliedTick);
}
function isCanonicalCombatEffectsViewModel(view) {
	return VIEWS$1.has(view);
}
function canonicalViewJson(view) {
	return `{${Object.keys(view).sort().map((key) => {
		if (key !== "events") return `${JSON.stringify(key)}:${canonicalJson$5(view[key])}`;
		const records = view.events.map((record) => {
			const cached = CANONICAL_EVENT_BYTES.get(record);
			if (cached !== void 0) return cached;
			const bytes = canonicalJson$5(record);
			CANONICAL_EVENT_BYTES.set(record, bytes);
			return bytes;
		});
		return `${JSON.stringify(key)}:[${records.join(",")}]`;
	}).join(",")}}`;
}
function serializeCombatEffectsViewModel(view) {
	if (!VIEWS$1.has(view)) throw new TypeError("combat effects view is not canonical");
	const bytes = canonicalViewJson(view);
	if (UTF8.encode(bytes).byteLength > 4e6) throw new RangeError("combat effects view exceeds its byte bound");
	return bytes;
}
function setPoint(node, point) {
	node.style.setProperty("--effect-den", point.denominator);
	node.style.setProperty("--effect-x-num", point.xNumerator);
	const inverted = BigInt(ARENA_LENGTH_MILLITILES) * BigInt(point.denominator) - BigInt(point.yNumerator);
	node.style.setProperty("--effect-y-num", inverted.toString());
}
function checkedLayer$1(layer) {
	if (!layer || typeof layer !== "object" || typeof layer.replaceChildren !== "function" || typeof layer.ownerDocument?.createElement !== "function") throw new TypeError("combat effects layer must be a DOM element");
	return layer;
}
function bindCombatEffectsViewModel(layer, view) {
	if (!VIEWS$1.has(view)) throw new TypeError("combat effects view is not canonical");
	checkedLayer$1(layer);
	const document = layer.ownerDocument;
	const frame = document.createElement("div");
	frame.className = "combat-effects__frame";
	frame.dataset.tick = String(view.tick);
	const nodes = [];
	for (const record of view.paths) {
		const create = typeof document.createElementNS === "function" ? (name) => document.createElementNS("http://www.w3.org/2000/svg", name) : (name) => document.createElement(name);
		const svg = create("svg");
		svg.setAttribute("class", "combat-effect-path");
		svg.dataset.effectKey = record.key;
		svg.dataset.kind = record.kind;
		svg.setAttribute("aria-hidden", "true");
		svg.setAttribute("preserveAspectRatio", "none");
		const common = BigInt(record.from.denominator) * BigInt(record.to.denominator);
		svg.setAttribute("viewBox", `0 0 ${BigInt(ARENA_WIDTH_MILLITILES) * common} ${BigInt(ARENA_LENGTH_MILLITILES) * common}`);
		const line = create("line");
		line.setAttribute("x1", (BigInt(record.from.xNumerator) * BigInt(record.to.denominator)).toString());
		line.setAttribute("y1", ((BigInt(ARENA_LENGTH_MILLITILES) * BigInt(record.from.denominator) - BigInt(record.from.yNumerator)) * BigInt(record.to.denominator)).toString());
		line.setAttribute("x2", (BigInt(record.to.xNumerator) * BigInt(record.from.denominator)).toString());
		line.setAttribute("y2", ((BigInt(ARENA_LENGTH_MILLITILES) * BigInt(record.to.denominator) - BigInt(record.to.yNumerator)) * BigInt(record.from.denominator)).toString());
		svg.appendChild(line);
		nodes.push(svg);
	}
	for (const record of view.areas) {
		const node = document.createElement("span");
		node.className = "combat-effect-area";
		node.dataset.effectKey = record.key;
		node.style.setProperty("--effect-radius", String(record.radius));
		setPoint(node, record.point);
		nodes.push(node);
	}
	for (const record of view.impacts) {
		const node = document.createElement("span");
		node.className = "combat-effect-impact";
		node.dataset.effectKey = record.key;
		node.dataset.kind = record.kind;
		setPoint(node, record.point);
		nodes.push(node);
	}
	for (const record of view.projectiles) {
		const node = document.createElement("span");
		node.className = "combat-effect-projectile";
		node.dataset.effectKey = record.key;
		node.dataset.kind = record.kind;
		setPoint(node, record.point);
		nodes.push(node);
	}
	for (const node of nodes) frame.appendChild(node);
	layer.replaceChildren(frame);
	return view;
}
var VIEWS$1, CANONICAL_EVENT_BYTES, PROJECTILE_DIRECTIONS, UTF8, STYLE_TEXT$1;
function init_combat_effects() {
	return (init_combat_effects = __esmMin((() => {
		init_arena_geometry();
		init_combat_effect_feed();
		VIEWS$1 = /* @__PURE__ */ new WeakSet();
		CANONICAL_EVENT_BYTES = /* @__PURE__ */ new WeakMap();
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
		UTF8 = new TextEncoder();
		STYLE_TEXT$1 = `.combat-effects{position:absolute;z-index:35;inset:0;overflow:hidden;pointer-events:none}.combat-effects__frame{position:absolute;inset:0}.combat-effect-path{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.combat-effect-path line{stroke:#d9f4d5aa;stroke-width:100;stroke-linecap:round;stroke-dasharray:210 130}.combat-effect-projectile,.combat-effect-impact,.combat-effect-area{position:absolute;left:calc(var(--effect-x-num)*100%/(18000*var(--effect-den)));top:calc(var(--effect-y-num)*100%/(32000*var(--effect-den)));translate:-50% -50%;border-radius:50%}.combat-effect-projectile{width:12px;height:12px;background:#fff0a5;border:2px solid #603d28;box-shadow:0 0 8px #ffcd65}.combat-effect-projectile[data-kind="return"]{border-radius:35% 65%;background:#8ce7dd}.combat-effect-projectile[data-kind="pellet"]{width:7px;height:7px}.combat-effect-impact{width:24px;height:24px;border:4px double #ffe6a0;background:#e8703655}.combat-effect-area{width:calc(var(--effect-radius)*200%/18000);aspect-ratio:1;border:3px solid #f2c66e;background:#d96f3933}.combat-effect-path{display:none}.combat-effect-projectile{width:15px;height:7px;border:1px solid #191D22;border-radius:0;background:#F4EBD6;clip-path:polygon(0 0,70% 18%,100% 50%,70% 82%,0 100%,20% 50%);box-shadow:none}.combat-effect-projectile[data-kind="return"]{background:#DCEDE9;clip-path:polygon(0 0,100% 35%,40% 100%,55% 40%)}.combat-effect-projectile[data-kind="pellet"]{width:8px;height:8px;clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)}.combat-effect-impact{width:30px;height:30px;border:0;border-radius:0;background:#E9A83A;clip-path:polygon(50% 0,60% 30%,87% 12%,72% 42%,100% 50%,70% 60%,89% 88%,59% 72%,50% 100%,40% 72%,12% 88%,28% 59%,0 50%,29% 40%,13% 12%,41% 28%)}.combat-effect-impact[data-kind="contact"]{width:22px;height:22px;background:#F4EBD6}.combat-effect-area{border:2px solid #E9A83A;background:repeating-conic-gradient(from 0deg,#5B4B8A33 0deg 20deg,transparent 20deg 40deg);box-shadow:inset 0 0 0 5px #191D2233}.combat-effect-area::after{content:"";position:absolute;inset:12%;border:1px dashed #F4EBD6;border-radius:50%}`;
	})))();
}
//#endregion
//#region src/ui/combat-art.js
function getBriarRunnerPaintedFrameTransform({ action, direction, reducedMotion = false, tick } = {}) {
	if (!["walk", "attack"].includes(action)) throw new RangeError("Briar Runner action must be walk or attack");
	if (!SPRITE_DIRECTIONS.includes(direction)) throw new RangeError("Briar Runner direction must be cardinal");
	if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("Briar Runner tick must be a non-negative safe integer");
	if (typeof reducedMotion !== "boolean") throw new TypeError("Briar Runner reducedMotion must be a boolean");
	const frame = reducedMotion ? 0 : Math.floor(tick / (action === "walk" ? 5 : 3)) % 2;
	const row = SPRITE_DIRECTIONS.indexOf(direction);
	const column = (action === "walk" ? 0 : 2) + frame;
	const sourceX = column * BRIAR_PAINTED_ATLAS.cellSize + BRIAR_PAINTED_ATLAS.windowX;
	const sourceY = row * BRIAR_PAINTED_ATLAS.cellSize + BRIAR_PAINTED_ATLAS.windowYByDirection[direction];
	const positionDenominator = BRIAR_PAINTED_ATLAS.width - BRIAR_PAINTED_ATLAS.windowSize;
	const percent = (value) => `${value / positionDenominator * 100}%`;
	const backgroundSizePercent = BRIAR_PAINTED_ATLAS.width / BRIAR_PAINTED_ATLAS.windowSize * 100;
	return Object.freeze({
		action,
		backgroundPosition: `${percent(sourceX)} ${percent(sourceY)}`,
		backgroundSize: `${backgroundSizePercent}% ${backgroundSizePercent}%`,
		column,
		direction,
		frame,
		id: `briar-${action}-${direction}-${frame}`,
		row,
		source: Object.freeze({
			height: BRIAR_PAINTED_ATLAS.windowSize,
			width: BRIAR_PAINTED_ATLAS.windowSize,
			x: sourceX,
			y: sourceY
		})
	});
}
function createBriarRunnerPaintedArt(document, { action = "walk", direction, reducedMotion = false, side, tick } = {}) {
	if (!["walk", "attack"].includes(action)) throw new RangeError("Briar Runner action must be walk or attack");
	if (!SPRITE_DIRECTIONS.includes(direction)) throw new RangeError("Briar Runner direction must be cardinal");
	if (side !== "north" && side !== "south") throw new RangeError("Briar Runner side must be north or south");
	const transform = getBriarRunnerPaintedFrameTransform({
		action,
		direction,
		reducedMotion,
		tick
	});
	const { x: sourceX, y: sourceY } = transform.source;
	const create = typeof document?.createElementNS === "function" ? (tag) => document.createElementNS("http://www.w3.org/2000/svg", tag) : (tag) => document.createElement(tag);
	const svg = create("svg");
	svg.setAttribute("viewBox", `${sourceX} ${sourceY} ${BRIAR_PAINTED_ATLAS.windowSize} ${BRIAR_PAINTED_ATLAS.windowSize}`);
	svg.setAttribute("class", "combat-art");
	svg.setAttribute("aria-hidden", "true");
	svg.dataset.artId = "briar-runner";
	svg.dataset.spriteAction = action;
	svg.dataset.spriteDirection = direction;
	svg.dataset.spriteFrame = transform.id;
	svg.dataset.spriteSide = side;
	svg.dataset.simulationTick = String(tick);
	svg.dataset.reducedMotion = String(reducedMotion);
	const footShadow = create("ellipse");
	footShadow.setAttribute("cx", String(sourceX + 110));
	footShadow.setAttribute("cy", String(sourceY + 190));
	footShadow.setAttribute("rx", "87");
	footShadow.setAttribute("ry", "28");
	footShadow.setAttribute("fill", INK);
	footShadow.setAttribute("aria-hidden", "true");
	svg.appendChild(footShadow);
	const teamFootring = create("rect");
	teamFootring.dataset.teamColor = side;
	teamFootring.setAttribute("x", String(sourceX + 10));
	teamFootring.setAttribute("y", String(sourceY + 176));
	teamFootring.setAttribute("width", "200");
	teamFootring.setAttribute("height", "44");
	teamFootring.setAttribute("rx", "22");
	teamFootring.setAttribute("fill", side === "north" ? "#C6452E" : "#2E7F86");
	teamFootring.setAttribute("stroke", BONE);
	teamFootring.setAttribute("stroke-width", "5");
	teamFootring.setAttribute("aria-hidden", "true");
	const image = create("image");
	image.setAttribute("href", BRIAR_PAINTED_ATLAS.image);
	image.setAttribute("x", "0");
	image.setAttribute("y", "0");
	image.setAttribute("width", String(BRIAR_PAINTED_ATLAS.width));
	image.setAttribute("height", String(BRIAR_PAINTED_ATLAS.height));
	image.setAttribute("preserveAspectRatio", "none");
	svg.appendChild(image);
	svg.appendChild(teamFootring);
	return svg;
}
function createCombatArt(document, kind, side, layer) {
	const create = typeof document.createElementNS === "function" ? (tag) => document.createElementNS("http://www.w3.org/2000/svg", tag) : (tag) => document.createElement(tag);
	const svg = create("svg");
	svg.setAttribute("viewBox", "0 0 64 64");
	svg.setAttribute("class", "combat-art");
	svg.setAttribute("aria-hidden", "true");
	svg.dataset.artId = Object.hasOwn(shapes, kind) || kind === "ember-basin" ? kind : `witness-${layer}`;
	if (kind === "ember-basin") {
		svg.setAttribute("viewBox", "0 0 512 512");
		const teamRing = create("ellipse");
		teamRing.setAttribute("cx", "256");
		teamRing.setAttribute("cy", "486");
		teamRing.setAttribute("rx", "182");
		teamRing.setAttribute("ry", "12");
		teamRing.setAttribute("fill", "none");
		teamRing.setAttribute("stroke", side === "north" ? "#C6452E" : "#2E7F86");
		teamRing.setAttribute("stroke-width", "24");
		teamRing.setAttribute("aria-hidden", "true");
		svg.appendChild(teamRing);
		const image = create("image");
		image.setAttribute("href", EMBER_BASIN_BATTLE_IMAGE);
		image.setAttribute("x", "0");
		image.setAttribute("y", "0");
		image.setAttribute("width", "512");
		image.setAttribute("height", "512");
		image.setAttribute("preserveAspectRatio", "xMidYMid meet");
		svg.appendChild(image);
		return svg;
	}
	const paths = Object.hasOwn(shapes, kind) ? shapes[kind] : shapes[layer === "air" ? "copperskiff" : "coilblade"];
	for (const [d, fill] of paths) {
		const node = create("path");
		node.setAttribute("d", d);
		node.setAttribute("fill", fill === "team" ? side === "north" ? "#C6452E" : "#2E7F86" : fill);
		node.setAttribute("stroke", INK);
		node.setAttribute("stroke-width", "2");
		node.setAttribute("stroke-linejoin", "round");
		node.setAttribute("stroke-linecap", "round");
		svg.appendChild(node);
	}
	const crest = create("path");
	crest.setAttribute("d", side === "north" ? "M28 35 32 30 36 35Z" : "M27 33Q32 39 37 33");
	crest.setAttribute("fill", side === "north" ? COPPER : "none");
	crest.setAttribute("stroke", side === "north" ? COPPER : "#DCEDE9");
	crest.setAttribute("stroke-width", "2");
	svg.appendChild(crest);
	return svg;
}
var INK, BONE, COPPER, WOOD, LEAF, STONE, SHALE, BRIAR_PAINTED_ATLAS, EMBER_BASIN_BATTLE_IMAGE, SPRITE_DIRECTIONS, shapes, COMBAT_ART_ARCHETYPES, COMBAT_STRUCTURE_ART_IDS, COMBAT_ART_STYLE;
function init_combat_art() {
	return (init_combat_art = __esmMin((() => {
		INK = "#191D22";
		BONE = "#F4EBD6";
		COPPER = "#E9A83A";
		WOOD = "#4A332A";
		LEAF = "#5C8A46";
		STONE = "#9BA5A2";
		SHALE = "#65716F";
		BRIAR_PAINTED_ATLAS = Object.freeze({
			cellSize: 313.5,
			height: 1254,
			image: new URL(new URL("../../../../public/assets/briar-runner-painted-sheet.png", import.meta.url).href, "" + import.meta.url).href,
			windowSize: 220,
			windowX: 46.75,
			windowYByDirection: Object.freeze({
				north: 72,
				east: 62,
				south: 47,
				west: 14
			}),
			width: 1254
		});
		EMBER_BASIN_BATTLE_IMAGE = new URL(new URL("../../../../public/assets/ember-basin-battle-sprite.webp", import.meta.url).href, "" + import.meta.url).href;
		SPRITE_DIRECTIONS = Object.freeze([
			"north",
			"east",
			"south",
			"west"
		]);
		shapes = {
			coilblade: [
				["M20 43 18 57 27 57 31 43M36 43 38 57 47 57 44 42", WOOD],
				["M18 24 42 24 48 44 15 44Z", "team"],
				["M24 13 37 13 41 26 22 26Z", BONE],
				["M28 13 28 6 33 10 37 6 36 13", COPPER],
				["M45 39 48 17 58 8 55 29 49 40Z", BONE],
				["M41 39 53 42", COPPER],
				["M25 21 36 21", INK]
			],
			mossguard: [
				["M16 42 13 56 25 56 30 43M35 43 39 56 50 56 46 41", WOOD],
				["M14 24 40 19 49 43 19 48Z", LEAF],
				["M22 14 36 10 43 22 31 29 20 24Z", WOOD],
				["M21 16 15 8 27 12 32 4 35 13 45 9 40 20", LEAF],
				["M9 26 27 29 25 49 16 54 7 44Z", "team"],
				["M16 34 16 45M11 38 21 38", BONE],
				["M42 29 57 23 59 35 45 39Z", WOOD]
			],
			brassbolt: [
				["M24 42 20 57 29 57 34 43 37 57 45 57 40 41", WOOD],
				["M22 26 38 24 43 44 22 45Z", "team"],
				["M23 14 38 14 38 27 25 27Z", BONE],
				["M20 15 24 9 39 9 43 17Z", COPPER],
				["M37 29 53 27 53 9 60 9 60 38 38 40Z", COPPER],
				["M51 10 61 10M52 17 60 17M28 21 35 21", INK]
			],
			reedsting: [
				["M26 42 19 56 26 58 33 47 41 57 47 53 38 41", WOOD],
				["M22 26 35 22 43 44 19 45Z", "team"],
				["M21 21 28 9 39 21 35 30 25 29Z", LEAF],
				["M26 22 35 22", BONE],
				["M45 7Q65 29 44 53L48 29Z", COPPER],
				["M47 8 46 52M35 31 61 27M57 24 62 27 58 31", BONE]
			],
			"briar-runner": [
				["M23 41 15 54 24 57 31 45 42 55 49 50 37 38", WOOD],
				["M20 25 36 22 43 42 21 44Z", "team"],
				["M19 24 16 13 24 17 28 8 33 17 44 15 39 27Z", LEAF],
				["M26 22 34 22", BONE],
				["M44 38 53 14 57 24 49 41Z", BONE]
			],
			"briar-darter": [
				["M22 44 20 55 28 55 33 44 38 55 46 55 40 43", WOOD],
				["M20 28 35 23 43 43 20 45Z", "team"],
				["M22 26 18 16 26 18 34 8 37 18 44 21 35 29Z", LEAF],
				["M32 30 57 15 61 20 35 36Z", WOOD],
				["M52 18 56 23", COPPER],
				["M23 23 29 23", BONE]
			],
			cinderling: [
				["M20 43 16 52 26 54 33 45 39 54 49 50 43 40", WOOD],
				["M16 34 23 21 21 12 31 19 35 6 43 21 51 27 48 43 33 49 20 44Z", "#C6452E"],
				["M23 35 30 28 34 17 40 29 42 39 33 44Z", COPPER],
				["M18 39 47 39 44 46 23 48Z", "team"],
				["M26 31 29 31M37 31 40 31", INK]
			],
			thornscout: [
				["M21 42 17 56 27 57 32 45 39 56 49 53 43 41", WOOD],
				["M17 25 42 23 47 45 19 46Z", "team"],
				["M22 22 20 11 28 16 33 7 37 17 44 13 41 25 29 30Z", LEAF],
				["M21 29 43 28M25 37 34 37", BONE],
				["M45 38 53 21 59 14 56 31 48 43Z", COPPER],
				["M53 19 61 11", BONE]
			],
			forgeguard: [
				["M19 41 14 56 26 57 31 46 39 56 51 54 45 40", WOOD],
				["M12 25 21 18 30 21 35 15 45 20 52 28 49 46 18 47 10 38Z", COPPER],
				["M16 28 26 25 31 31 29 42 19 44 13 38Z", "team"],
				["M42 27 52 24 58 31 55 40 46 42 40 36Z", BONE],
				["M22 20 24 12 30 17 35 9 41 17 47 14 48 24", WOOD],
				["M25 31 28 31M47 32 50 32", INK],
				["M25 47 43 47 47 52 21 53Z", SHALE]
			],
			copperskiff: [
				["M17 31 46 31 41 47 30 53 20 45Z", COPPER],
				["M20 34 42 34 39 43 24 43Z", "team"],
				["M29 13 34 13 34 33 29 33Z", WOOD],
				["M4 18Q17 8 31 17Q47 6 60 16L36 23 26 23Z", BONE],
				["M27 43 35 43 35 58 27 58Z", WOOD],
				["M24 29 27 22 37 22 40 30Z", COPPER]
			],
			skymaul: [
				["M21 29 41 29 46 43 32 52 18 42Z", "team"],
				["M22 28 15 10 4 17 13 34ZM40 28 49 8 61 16 51 34Z", "#5B4B8A"],
				["M24 20 39 20 41 31 22 31Z", BONE],
				["M30 43 34 43 36 59 29 59Z", WOOD],
				["M19 51 46 51 49 61 17 61Z", COPPER],
				["M27 26 36 26", INK]
			],
			stonehauler: [
				["M18 43 14 56 26 57 32 48 39 57 51 55 46 41", SHALE],
				["M12 24 20 15 28 18 34 9 44 14 53 22 55 36 48 47 18 47 9 38Z", STONE],
				["M12 25 5 32 8 45 18 46 24 35 21 24Z", SHALE],
				["M44 23 52 18 60 23 59 38 51 44 45 37Z", SHALE],
				["M23 14 32 9 41 14 42 25 35 31 24 26Z", "#B9C0B6"],
				["M18 27 26 30 23 37 18 42 12 40 14 32Z", "team"],
				["M39 27 46 23 51 28 49 36 43 39 39 34Z", COPPER],
				["M27 22 30 22M36 21 39 21", INK],
				["M28 36 39 36 42 42 24 42Z", WOOD],
				["M28 56 39 56", BONE]
			],
			ironroot: [
				["M17 43 12 57 25 59 32 47 40 59 53 56 46 42", WOOD],
				["M10 24 19 17 27 20 33 10 40 18 49 18 56 27 53 45 14 46Z", SHALE],
				["M13 27 5 28 3 39 11 46 22 41 21 29Z", STONE],
				["M44 29 53 22 61 28 60 40 51 46 43 40Z", WOOD],
				["M19 18 17 9 25 14 31 5 37 14 47 10 46 22 33 27Z", LEAF],
				["M23 28 29 28M39 28 45 28", COPPER],
				["M20 34 31 38 43 33 41 43 22 44Z", "team"],
				["M27 48 38 48 41 53 24 54Z", BONE]
			],
			"bulwark-needle": [
				["M8 48Q31 39 56 48L53 54Q31 59 10 54Z", "#344B43"],
				["M12 40 20 33 44 33 52 40 49 51 15 51Z", SHALE],
				["M17 36 20 22 27 18 40 18 47 24 49 38 44 45 20 45Z", STONE],
				["M20 23 31 14 43 22 41 30 22 30Z", WOOD],
				["M29 34 32 5 35 34Z", COPPER],
				["M27 28 15 15 20 36 27 39Z", BONE],
				["M38 28 49 14 45 36 38 39Z", BONE],
				["M16 40 25 36 28 45 20 48ZM47 40 39 36 36 45 44 48Z", WOOD],
				["M25 39 39 39 41 47 23 47Z", "team"]
			]
		};
		for (const paths of Object.values(shapes)) {
			for (const path of paths) Object.freeze(path);
			Object.freeze(paths);
		}
		COMBAT_ART_ARCHETYPES = Object.freeze(Object.keys(shapes));
		COMBAT_STRUCTURE_ART_IDS = Object.freeze(["bulwark-needle", "ember-basin"]);
		Object.freeze(shapes);
		COMBAT_ART_STYLE = `.combat-target-link{display:none}.combat-target-link[data-from-structure="true"]{display:block}.combat-target-link[data-from-structure="true"] line{stroke:#E9A83A99;stroke-width:70;stroke-dasharray:190 125}.combat-marker[class]{border:0;background:none;border-radius:0;box-shadow:none;width:6.2%;height:auto;aspect-ratio:1}.combat-marker--entity-ground{filter:drop-shadow(0 2px 0 #191d2244)}.combat-marker--entity-air::before{content:"";position:absolute;left:18%;right:18%;height:13%;bottom:-15%;border-radius:50%;background:#191d2244}.combat-art{display:block;width:100%;height:100%;overflow:visible}.combat-marker[data-kind="mossguard"],.combat-marker[data-kind="skymaul"]{width:7.5%}.combat-marker[data-kind="stonehauler"]{width:8.2%}.combat-marker[data-kind="bulwark-needle"],.combat-marker[data-kind="ember-basin"]{width:8.4%;z-index:21}.combat-marker--structure[data-targeting="true"] .combat-art{filter:drop-shadow(0 0 7px #E9A83A)}.combat-marker[data-kind="briar-runner"],.combat-marker[data-kind="briar-darter"],.combat-marker[data-kind="cinderling"]{width:4.8%}.combat-marker--tower[class]{width:7%;height:0;aspect-ratio:auto}.combat-marker[class] .combat-health{width:80%;height:4px;bottom:105%;border-radius:1px;background:#DCEDE9;box-shadow:0 0 0 1px #191D22}.combat-marker--north[class] .combat-health{background:#E9A83A}.combat-marker--tower[class] .combat-health{bottom:28px;height:4px;box-shadow:0 0 0 1px #191D22}.combat-marker[data-reaction="damage"] .combat-art{filter:brightness(1.7)}.combat-marker[data-reaction="target"] .combat-art{transform:rotate(-7deg)}.combat-marker--north[data-reaction="target"] .combat-art{transform:rotate(7deg)}`;
	})))();
}
//#endregion
//#region src/ui/combat-motion.js
function createCombatMotionView(snapshot, effects) {
	if (!isAuthenticGameSessionProjectionSnapshot(snapshot)) throw new TypeError("combat motion requires an authentic projection snapshot");
	const { battle, tick } = snapshot.state;
	effects ??= createCombatEffectsViewModel(snapshot.combatEffectFeed, tick);
	if (!isCanonicalCombatEffectsViewModel(effects)) throw new TypeError("combat motion effects are not canonical");
	if (effects.tick !== tick) throw new TypeError("combat motion effect tick mismatch");
	const targets = new Map([...battle.towers, ...battle.units].map((record) => [record.id, record]));
	const recentHits = /* @__PURE__ */ new Map();
	for (const event of effects.events) if (event.phase === "damage" && tick >= event.tick && tick - event.tick < 6) recentHits.set(event.payload.targetId, event.tick);
	const poses = [];
	const contacts = [];
	for (const unit of battle.units) {
		if (!unit.alive || unit.hitpoints <= 0 || !KINDS.has(unit.archetypeId)) continue;
		const cycle = unit.attack;
		const target = targets.get(targetKey(cycle.targetId));
		const age = tick - unit.spawnedAt;
		const lastStrike = unit.spawnedAt + cycle.nextAttackTick - cycle.config.hitSpeedTicks;
		const strikeAge = tick - lastStrike;
		const direction = target ? Math.sign(target.position.x - unit.position.x) || (unit.side === "north" ? 1 : -1) : 0;
		let pose = "idle";
		let tilt = 0;
		let lift = 0;
		let scale = 100;
		if (cycle.phase === "deploying" && age >= 0 && age < cycle.config.deployTicks) {
			pose = "deploy";
			scale = 65 + Math.floor(35 * age / Math.max(1, cycle.config.deployTicks));
		} else if (!cycle.statusWork && cycle.phase === "cycling" && cycle.attackSequence > 0 && Number.isSafeInteger(cycle.nextAttackTick) && lastStrike >= unit.spawnedAt && strikeAge >= 0 && strikeAge < 8 && target) {
			pose = "attack";
			tilt = direction * (28 - strikeAge * 3);
			if (unit.delivery === "melee") contacts.push(Object.freeze({
				id: `${unit.id}:${cycle.attackSequence}`,
				targetId: target.id,
				tick: lastStrike,
				x: target.position.x,
				y: target.position.y,
				age: strikeAge
			}));
		} else if (!cycle.statusWork && cycle.phase === "winding" && target && cycle.nextAttackTick - cycle.nextTick >= 0 && cycle.nextAttackTick - cycle.nextTick < 10) {
			pose = "anticipate";
			tilt = -direction * 14;
		} else if (cycle.phase === "idle" && unit.movement.speed > 0 && unit.movement.segmentLength > 0 && unit.movement.segmentProgress > 0 && unit.movement.segmentProgress < unit.movement.segmentLength) {
			pose = "move";
			const stride = Math.floor(unit.movement.segmentProgress / 125) % 4;
			tilt = [
				0,
				-5,
				0,
				5
			][stride];
			lift = [
				0,
				-2,
				0,
				-2
			][stride];
		}
		if (pose === "attack" && strikeAge >= 4) {
			pose = "recoil";
			tilt = -direction * (8 - strikeAge) * 2;
		}
		const hitAge = tick - recentHits.get(unit.id);
		const hit = Number.isFinite(hitAge);
		if (hit && pose !== "deploy") lift -= (6 - hitAge) / 2;
		poses.push(Object.freeze({
			id: unit.id,
			pose,
			tilt,
			lift,
			scale,
			hit
		}));
	}
	const residualsByPoint = /* @__PURE__ */ new Map();
	const sourceEvents = new Map(snapshot.combatEffectFeed.records.map((event) => [event.eventId, event]));
	const roots = new Map(effects.events.filter((event) => event.phase === "open" && event.parentId === null).map((event) => [event.rootId, event]));
	for (const event of effects.events) {
		const age = tick - event.tick;
		if (age < 1 || age >= 8 || !["contact", "impact"].includes(event.phase)) continue;
		if (event.phase === "contact" && event.payload.status !== "contact") continue;
		const point = event.payload.point ?? event.payload.center;
		if (!point) continue;
		if (JSON.stringify(sourceEvents.get(event.eventId)) !== JSON.stringify(event)) throw new TypeError("combat motion impact source mismatch");
		const key = `${event.rootId}:${point.xNumerator}:${point.yNumerator}:${point.denominator}`;
		residualsByPoint.set(key, Object.freeze({
			key,
			tick: event.tick,
			point,
			kind: roots.get(event.rootId)?.payload.direction ?? event.type
		}));
	}
	const residuals = Object.freeze([...residualsByPoint.values()]);
	const deathsById = /* @__PURE__ */ new Map();
	for (const event of effects.events) {
		if (event.phase !== "death" || tick - event.tick < 0 || tick - event.tick >= 18) continue;
		const unit = targets.get(event.payload.targetId);
		if (!unit || unit.alive || unit.hitpoints !== 0 || !KINDS.has(unit.archetypeId)) continue;
		const source = sourceEvents.get(event.eventId);
		if (!source || JSON.stringify(source) !== JSON.stringify(event)) throw new TypeError("combat motion death source mismatch");
		if (deathsById.has(unit.id)) continue;
		deathsById.set(unit.id, Object.freeze({
			id: unit.id,
			kind: unit.archetypeId,
			side: unit.side,
			layer: unit.layer,
			x: unit.position.x,
			y: unit.position.y,
			tick: event.tick,
			age: tick - event.tick
		}));
	}
	const deaths = Object.freeze([...deathsById.values()].sort((a, b) => a.id - b.id));
	const view = Object.freeze({
		residuals,
		deaths,
		tick,
		poses: Object.freeze(poses),
		contacts: Object.freeze(contacts)
	});
	VIEWS.add(view);
	return view;
}
function bindCombatMotion(combat, effects, view) {
	if (!VIEWS.has(view)) throw new TypeError("combat motion view is not canonical");
	const children = (node) => Array.from(node.childNodes ?? node.children ?? []);
	const frame = children(combat)[0];
	const byId = new Map(view.poses.map((pose) => [String(pose.id), pose]));
	for (const node of children(frame)) {
		const pose = byId.get(node.dataset?.combatId);
		if (!pose) continue;
		node.dataset.pose = pose.pose;
		node.dataset.hit = String(pose.hit);
		node.style.setProperty("--pose-tilt", `${pose.tilt}deg`);
		node.style.setProperty("--pose-lift", `${pose.lift}px`);
		node.style.setProperty("--pose-scale", String(pose.scale / 100));
	}
	const effectFrame = children(effects)[0];
	for (const residual of view.residuals) {
		const node = effects.ownerDocument.createElement("span");
		node.className = "combat-effect-impact";
		node.dataset.residualImpact = residual.key;
		node.dataset.kind = residual.kind;
		node.dataset.impactTick = String(residual.tick);
		node.setAttribute("aria-hidden", "true");
		node.style.setProperty("--effect-den", residual.point.denominator);
		node.style.setProperty("--effect-x-num", residual.point.xNumerator);
		node.style.setProperty("--effect-y-num", (32000n * BigInt(residual.point.denominator) - BigInt(residual.point.yNumerator)).toString());
		effectFrame.appendChild(node);
	}
	for (const death of view.deaths) {
		const node = effects.ownerDocument.createElement("span");
		node.className = "combat-death-remnant";
		node.dataset.deathId = String(death.id);
		node.dataset.deathTick = String(death.tick);
		node.dataset.kind = death.kind;
		node.dataset.side = death.side;
		node.setAttribute("aria-hidden", "true");
		node.style.setProperty("--combat-x", String(death.x));
		node.style.setProperty("--combat-y", String(32e3 - death.y));
		node.style.setProperty("--death-opacity", String((18 - death.age) / 18));
		node.style.setProperty("--death-tilt", `${(death.side === "north" ? 1 : -1) * (65 + death.age)}deg`);
		node.style.setProperty("--death-drift", `${death.age / 2}px`);
		node.appendChild(createCombatArt(effects.ownerDocument, death.kind, death.side, death.layer));
		effectFrame.appendChild(node);
	}
	for (const contact of view.contacts) {
		const node = effects.ownerDocument.createElement("span");
		node.className = "combat-melee-contact";
		node.dataset.contactId = contact.id;
		node.dataset.contactTick = String(contact.tick);
		node.dataset.targetId = String(contact.targetId);
		node.style.setProperty("--combat-x", String(contact.x));
		node.style.setProperty("--combat-y", String(32e3 - contact.y));
		node.style.setProperty("--contact-scale", String((12 - contact.age) / 12));
		effectFrame.appendChild(node);
	}
}
var VIEWS, KINDS, TOWER_IDS$3, targetKey, COMBAT_MOTION_STYLE, DEATH_STYLE, COMBAT_DEATH_STYLE;
function init_combat_motion() {
	return (init_combat_motion = __esmMin((() => {
		init_game_session();
		init_combat_effects();
		init_combat_art();
		VIEWS = /* @__PURE__ */ new WeakSet();
		KINDS = new Set(COMBAT_ART_ARCHETYPES);
		TOWER_IDS$3 = [
			"south:central",
			"south:lane:west",
			"south:lane:east",
			"north:central",
			"north:lane:west",
			"north:lane:east"
		];
		targetKey = (id) => Number.isSafeInteger(id) && id >= Number.MAX_SAFE_INTEGER - 5 ? TOWER_IDS$3[id - (Number.MAX_SAFE_INTEGER - 5)] : id;
		COMBAT_MOTION_STYLE = `.combat-marker[data-hit="true"] .combat-art{filter:brightness(1.65)}.combat-marker[data-pose] .combat-art{transform:translateY(var(--pose-lift)) rotate(var(--pose-tilt)) scale(var(--pose-scale));transform-origin:50% 80%}.combat-marker[data-pose="deploy"]::after{content:"";position:absolute;inset:45% -10% -5%;border:2px solid #F4EBD6;border-radius:50%;opacity:.65}.combat-melee-contact{position:absolute;left:calc(var(--combat-x)*100%/18000);top:calc(var(--combat-y)*100%/32000);width:38px;height:38px;translate:-50% -50%;transform:scale(var(--contact-scale));background:#F4EBD6;filter:drop-shadow(0 0 3px #E9A83A);clip-path:polygon(50% 0,60% 32%,90% 10%,72% 43%,100% 50%,70% 60%,90% 90%,59% 72%,50% 100%,39% 70%,10% 90%,28% 58%,0 50%,29% 40%,10% 10%,40% 28%)}@media(prefers-reduced-motion:reduce){.combat-marker[data-pose] .combat-art{transform:none}.combat-melee-contact{transform:none}.combat-marker[data-pose="deploy"]::after{opacity:1}}`;
		DEATH_STYLE = `.combat-death-remnant{position:absolute;pointer-events:none;left:calc(var(--combat-x)*100%/18000);top:calc(var(--combat-y)*100%/32000);width:6.2%;aspect-ratio:1;translate:-50% -50%;opacity:var(--death-opacity)}.combat-death-remnant .combat-art{transform:rotate(var(--death-tilt)) scale(.8);filter:saturate(.65)}.combat-death-remnant::after{content:"";position:absolute;inset:-4px;transform:translateY(calc(-1 * var(--death-drift)));background:#E9A83A;clip-path:polygon(12% 25%,18% 15%,24% 25%,18% 35%,12% 25%,70% 5%,75% 0,80% 5%,75% 10%,70% 5%,85% 65%,92% 58%,98% 65%,92% 72%,85% 65%)}.combat-death-remnant[data-side="south"]::after{background:#DCEDE9}@media(prefers-reduced-motion:reduce){.combat-death-remnant .combat-art{transform:rotate(75deg) scale(.8)}.combat-death-remnant::after{transform:none}.combat-death-remnant{opacity:.8}}`;
		COMBAT_DEATH_STYLE = DEATH_STYLE;
	})))();
}
//#endregion
//#region src/ui/combat-state.js
function getCombatStyleText() {
	return COMBAT_STYLE_TEXT;
}
function dataObject$1(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain data object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key))) throw new TypeError(`${label} has an invalid shape`);
	const result = {};
	for (const key of keys) {
		const descriptor = descriptors[key];
		if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
		result[key] = descriptor.value;
	}
	return result;
}
function denseArray(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0 || value.length > maximum) throw new TypeError(`${label} must be a plain array of at most ${maximum} items`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	for (const key of Reflect.ownKeys(descriptors)) {
		if (key === "length") continue;
		if (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length) throw new TypeError(`${label} must contain only indexed data`);
	}
	return Array.from({ length: value.length }, (_, index) => {
		const descriptor = descriptors[String(index)];
		if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}[${index}] must be an enumerable data property`);
		return descriptor.value;
	});
}
function integer$2(value, minimum, maximum, label) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be an integer from ${minimum} through ${maximum}`);
	return value;
}
function token(value, label) {
	if (typeof value !== "string" || value.length > 96 || !TOKEN.test(value)) throw new TypeError(`${label} must be a bounded original identifier`);
	return value;
}
function checkedId(value, label) {
	if (Number.isSafeInteger(value) && value >= 1) return {
		key: `n:${value}`,
		value
	};
	const checked = token(value, label);
	return {
		key: `s:${checked}`,
		value: checked
	};
}
function checkedTargetId(value, label) {
	return value === null ? null : checkedId(value, label);
}
function point(value, label) {
	const checked = dataObject$1(value, ["x", "y"], label);
	return {
		x: integer$2(checked.x, 0, ARENA_WIDTH_MILLITILES, `${label}.x`),
		y: integer$2(checked.y, 0, ARENA_LENGTH_MILLITILES, `${label}.y`)
	};
}
function health(hitpoints, maxHitpoints, label) {
	const maximum = integer$2(maxHitpoints, 1, Number.MAX_SAFE_INTEGER, `${label}.maxHitpoints`);
	return {
		hitpoints: integer$2(hitpoints, 0, maximum, `${label}.hitpoints`),
		maxHitpoints: maximum
	};
}
function checkedSide(value, label) {
	if (!SIDES$1.has(value)) throw new TypeError(`${label} must be north or south`);
	return value;
}
function compareKey(left, right) {
	if (typeof left.id === "number" && typeof right.id === "number") return left.id - right.id;
	if (typeof left.id === "number") return -1;
	if (typeof right.id === "number") return 1;
	return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
}
function checkedEvents$1(value, tick) {
	const events = denseArray(value, COMBAT_EVENT_LIMIT, "combat events").map((raw, index) => {
		const label = `combat events[${index}]`;
		const event = dataObject$1(raw, [
			"entityId",
			"sequence",
			"tick",
			"type"
		], label);
		const entity = checkedId(event.entityId, `${label}.entityId`);
		if (!(/* @__PURE__ */ new Set([
			"damage",
			"death",
			"target"
		])).has(event.type)) throw new TypeError(`${label}.type is invalid`);
		const eventTick = integer$2(event.tick, 0, tick, `${label}.tick`);
		if (event.sequence !== index) throw new TypeError(`${label}.sequence must be contiguous`);
		return {
			entityId: entity.value,
			entityKey: entity.key,
			sequence: index,
			tick: eventTick,
			type: event.type
		};
	});
	for (let index = 1; index < events.length; index += 1) if (events[index].tick < events[index - 1].tick) throw new TypeError("combat event ticks must be nondecreasing");
	return events;
}
function checkedEntities(value) {
	const entities = denseArray(value, 512, "combat entities").map((raw, index) => {
		const label = `combat entities[${index}]`;
		const entity = dataObject$1(raw, [
			"hitpoints",
			"id",
			"kind",
			"layer",
			"maxHitpoints",
			"position",
			"side",
			"targetId"
		], label);
		const id = checkedId(entity.id, `${label}.id`);
		const target = checkedTargetId(entity.targetId, `${label}.targetId`);
		const checkedHealth = health(entity.hitpoints, entity.maxHitpoints, label);
		if (!LAYERS.has(entity.layer)) throw new TypeError(`${label}.layer must be air or ground`);
		return {
			...checkedHealth,
			id: id.value,
			key: id.key,
			kind: token(entity.kind, `${label}.kind`),
			layer: entity.layer,
			position: point(entity.position, `${label}.position`),
			side: checkedSide(entity.side, `${label}.side`),
			targetId: target?.value ?? null,
			targetKey: target?.key ?? null
		};
	}).sort(compareKey);
	for (let index = 1; index < entities.length; index += 1) if (entities[index - 1].key === entities[index].key) throw new TypeError("combat entity IDs must be unique");
	return entities;
}
function checkedTowers(value) {
	const towers = denseArray(value, 16, "combat towers").map((raw, index) => {
		const label = `combat towers[${index}]`;
		const tower = dataObject$1(raw, [
			"hitpoints",
			"id",
			"maxHitpoints",
			"position",
			"role",
			"side",
			"targetId"
		], label);
		const id = checkedId(tower.id, `${label}.id`);
		const target = checkedTargetId(tower.targetId, `${label}.targetId`);
		if (!ROLES.has(tower.role)) throw new TypeError(`${label}.role must be central or lane`);
		return {
			...health(tower.hitpoints, tower.maxHitpoints, label),
			id: id.value,
			key: id.key,
			position: point(tower.position, `${label}.position`),
			role: tower.role,
			side: checkedSide(tower.side, `${label}.side`),
			targetId: target?.value ?? null,
			targetKey: target?.key ?? null
		};
	}).sort(compareKey);
	for (let index = 1; index < towers.length; index += 1) if (towers[index - 1].key === towers[index].key) throw new TypeError("combat tower IDs must be unique");
	return towers;
}
function freeze$3(value) {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) freeze$3(child);
		Object.freeze(value);
	}
	return value;
}
function marker(record) {
	return {
		healthDenominator: record.maxHitpoints,
		healthNumerator: record.hitpoints,
		id: record.id,
		key: record.key,
		side: record.side,
		x: record.position.x,
		y: record.position.y
	};
}
function createCombatViewModel(state) {
	const source = dataObject$1(state, [
		"entities",
		"events",
		"tick",
		"towers"
	], "combat state");
	const entities = checkedEntities(source.entities);
	const towers = checkedTowers(source.towers);
	const tick = integer$2(source.tick, 0, Number.MAX_SAFE_INTEGER, "combat state.tick");
	const events = checkedEvents$1(source.events, tick);
	const all = /* @__PURE__ */ new Map();
	for (const record of [...entities, ...towers]) {
		if (all.has(record.key)) throw new TypeError("combat IDs must be globally unique");
		all.set(record.key, record);
	}
	const alive = new Map([...all].filter(([, record]) => record.hitpoints > 0));
	const links = [];
	for (const sourceRecord of [...entities, ...towers].sort(compareKey)) {
		if (sourceRecord.hitpoints === 0 || sourceRecord.targetKey === null) continue;
		const target = alive.get(sourceRecord.targetKey);
		if (!target) throw new TypeError(`live combat source ${sourceRecord.key} targets a missing or dead ID`);
		links.push({
			fromKey: sourceRecord.key,
			toKey: target.key,
			x1: sourceRecord.position.x,
			x2: target.position.x,
			y1: sourceRecord.position.y,
			y2: target.position.y
		});
	}
	if (links.length > 528) throw new RangeError("combat target link count exceeds its bound");
	const view = {
		entities: entities.filter(({ hitpoints }) => hitpoints > 0).map((entity) => ({
			...marker(entity),
			kind: entity.kind,
			layer: entity.layer
		})),
		events,
		links,
		tick,
		towers: towers.map((tower) => ({
			...marker(tower),
			destroyed: tower.hitpoints === 0,
			role: tower.role
		})),
		version: 1
	};
	freeze$3(view);
	CANONICAL_VIEWS$2.add(view);
	return view;
}
function canonicalJson$4(value) {
	if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number") {
		if (!Number.isSafeInteger(value)) throw new TypeError("combat view numbers must be safe integers");
		return String(value);
	}
	if (Array.isArray(value)) return `[${value.map(canonicalJson$4).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$4(value[key])}`).join(",")}}`;
	throw new TypeError("combat view contains an unsupported value");
}
function serializeCombatViewModel(view) {
	if (!CANONICAL_VIEWS$2.has(view)) throw new TypeError("combat view must come from createCombatViewModel or restoreCombatViewModel");
	return canonicalJson$4(view);
}
function setCommonNode(node, record, type) {
	node.className = `combat-marker combat-marker--${type} combat-marker--${record.side}`;
	node.dataset.combatId = String(record.id);
	node.dataset.combatKey = record.key;
	node.dataset.side = record.side;
	node.style.setProperty("--combat-health", String(record.healthNumerator));
	node.style.setProperty("--combat-health-max", String(record.healthDenominator));
	node.style.setProperty("--combat-x", String(record.x));
	node.style.setProperty("--combat-y", String(ARENA_LENGTH_MILLITILES - record.y));
	const healthNode = node.ownerDocument.createElement("i");
	healthNode.className = "combat-health";
	healthNode.setAttribute("aria-hidden", "true");
	node.appendChild(healthNode);
}
function briarFacingDirection(entity, link) {
	if (!link) return entity.side === "north" ? "south" : "north";
	const dx = link.x2 - link.x1;
	const dy = link.y2 - link.y1;
	if (Math.abs(dy) >= Math.abs(dx)) {
		if (dy > 0) return "north";
		if (dy < 0) return "south";
	}
	if (dx > 0) return "east";
	if (dx < 0) return "west";
	return entity.side === "north" ? "south" : "north";
}
function bindCombatViewModel(layer, view) {
	if (layer === null || typeof layer !== "object" || typeof layer.replaceChildren !== "function" || layer.ownerDocument === null || typeof layer.ownerDocument?.createElement !== "function") throw new TypeError("combat layer must be a DOM element");
	if (!CANONICAL_VIEWS$2.has(view)) throw new TypeError("combat view must come from createCombatViewModel or restoreCombatViewModel");
	const canonical = view;
	const frame = layer.ownerDocument.createElement("div");
	frame.className = "combat-frame";
	frame.dataset.tick = String(canonical.tick);
	const nodes = [];
	const structureKeys = new Set(canonical.entities.filter(({ kind }) => COMBAT_STRUCTURE_ART_IDS.includes(kind)).map(({ key }) => key));
	const targetingStructureKeys = new Set(canonical.links.filter(({ fromKey }) => structureKeys.has(fromKey)).map(({ fromKey }) => fromKey));
	const linksBySource = new Map(canonical.links.map((link) => [link.fromKey, link]));
	const reducedMotion = layer.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
	for (const link of canonical.links) {
		const createSvg = typeof layer.ownerDocument.createElementNS === "function" ? (name) => layer.ownerDocument.createElementNS("http://www.w3.org/2000/svg", name) : (name) => layer.ownerDocument.createElement(name);
		const node = createSvg("svg");
		node.setAttribute("class", "combat-target-link");
		node.dataset.from = link.fromKey;
		node.dataset.fromStructure = String(structureKeys.has(link.fromKey));
		node.dataset.to = link.toKey;
		node.setAttribute("aria-hidden", "true");
		node.setAttribute("preserveAspectRatio", "none");
		node.setAttribute("viewBox", `0 0 ${ARENA_WIDTH_MILLITILES} ${ARENA_LENGTH_MILLITILES}`);
		const line = createSvg("line");
		line.setAttribute("x1", String(link.x1));
		line.setAttribute("x2", String(link.x2));
		line.setAttribute("y1", String(ARENA_LENGTH_MILLITILES - link.y1));
		line.setAttribute("y2", String(ARENA_LENGTH_MILLITILES - link.y2));
		node.appendChild(line);
		nodes.push(node);
	}
	for (const tower of canonical.towers) {
		const node = layer.ownerDocument.createElement("span");
		setCommonNode(node, tower, "tower");
		node.dataset.destroyed = String(tower.destroyed);
		node.dataset.role = tower.role;
		nodes.push(node);
	}
	const reactions = /* @__PURE__ */ new Map();
	for (const event of canonical.events) if (canonical.tick - event.tick < 5) reactions.set(event.entityKey, event.type);
	for (const entity of canonical.entities) {
		const node = layer.ownerDocument.createElement("span");
		setCommonNode(node, entity, `entity-${entity.layer}`);
		node.dataset.kind = entity.kind;
		node.dataset.layer = entity.layer;
		const reaction = reactions.get(entity.key) ?? "idle";
		node.dataset.reaction = reaction;
		if (structureKeys.has(entity.key)) {
			node.className += " combat-marker--structure";
			node.dataset.structure = "true";
			node.dataset.targeting = String(targetingStructureKeys.has(entity.key));
		}
		const art = entity.kind === "briar-runner" ? createBriarRunnerPaintedArt(layer.ownerDocument, {
			action: reaction === "target" ? "attack" : "walk",
			direction: briarFacingDirection(entity, linksBySource.get(entity.key)),
			reducedMotion,
			side: entity.side,
			tick: canonical.tick
		}) : createCombatArt(layer.ownerDocument, entity.kind, entity.side, entity.layer);
		node.appendChild(art);
		nodes.push(node);
	}
	for (const node of nodes) frame.appendChild(node);
	layer.replaceChildren(frame);
	return canonical;
}
function mountCombatLayer(shell) {
	if (shell === null || typeof shell !== "object" || typeof shell.querySelector !== "function") throw new TypeError("combat shell must be a DOM element");
	const arena = shell.querySelector("[data-ui=\"arena\"]");
	if (!arena || typeof arena.appendChild !== "function" || typeof arena.ownerDocument?.createElement !== "function") throw new TypeError("combat shell must contain an arena element");
	const layer = arena.ownerDocument.createElement("div");
	const style = arena.ownerDocument.createElement("style");
	style.dataset.ui = "combat-style";
	style.textContent = COMBAT_STYLE_TEXT;
	layer.className = "combat-layer";
	layer.dataset.ui = "combat-layer";
	layer.setAttribute("aria-live", "off");
	arena.appendChild(style);
	arena.appendChild(layer);
	return layer;
}
var COMBAT_EVENT_LIMIT, CANONICAL_VIEWS$2, SIDES$1, LAYERS, ROLES, TOKEN, COMBAT_STYLE_TEXT;
function init_combat_state() {
	return (init_combat_state = __esmMin((() => {
		init_combat_motion();
		init_combat_art();
		init_arena_geometry();
		COMBAT_EVENT_LIMIT = 2048;
		CANONICAL_VIEWS$2 = /* @__PURE__ */ new WeakSet();
		SIDES$1 = /* @__PURE__ */ new Set(["north", "south"]);
		LAYERS = /* @__PURE__ */ new Set(["air", "ground"]);
		ROLES = /* @__PURE__ */ new Set(["central", "lane"]);
		TOKEN = /^[a-z][a-z0-9]*(?:[-:][a-z0-9]+)*$/u;
		COMBAT_STYLE_TEXT = `.combat-layer{position:absolute;z-index:7;inset:0;overflow:hidden;pointer-events:none}.combat-frame{position:absolute;inset:0}.combat-marker{position:absolute;left:calc(var(--combat-x)*100%/18000);top:calc(var(--combat-y)*100%/32000);width:28px;height:28px;translate:-50% -50%;border:3px solid #e4ead7;border-radius:50%;background:#42515a;box-shadow:0 3px 0 #0a1014aa}.combat-marker--tower{z-index:25;width:42px;height:42px;border-radius:9px}.combat-marker--entity-ground{z-index:20}.combat-marker--entity-air{z-index:30;border-style:double;box-shadow:0 8px 6px #0a101466}.combat-marker--north{background:#b95c4c}.combat-marker--south{background:#398ba4}.combat-marker[data-destroyed="true"]{opacity:.42;filter:grayscale(1)}.combat-health{position:absolute;left:50%;bottom:calc(100% + 6px);width:36px;height:5px;translate:-50% 0;transform:scaleX(calc(var(--combat-health)/var(--combat-health-max)));transform-origin:left center;border-radius:3px;background:#b7eb6c;box-shadow:0 0 0 2px #152018}.combat-target-link{position:absolute;z-index:10;inset:0;width:100%;height:100%;overflow:visible}.combat-target-link line{stroke:#f3f5d088;stroke-width:90;stroke-dasharray:180 150}` + COMBAT_ART_STYLE + COMBAT_MOTION_STYLE + COMBAT_DEATH_STYLE;
	})))();
}
//#endregion
//#region src/ui/input-controller.js
function clone$2(value) {
	return JSON.parse(JSON.stringify(value));
}
function freezeGraph(value) {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		for (const key of Object.keys(value)) freezeGraph(value[key]);
		Object.freeze(value);
	}
	return value;
}
function systemSnapshot(deck, elixir) {
	return freezeGraph({
		deck: {
			bytes: deck.serializeJson(),
			state: clone$2(deck.state)
		},
		elixir: {
			bytes: elixir.serialize(),
			state: clone$2(elixir.state)
		}
	});
}
function frozenAggregate(message, codes) {
	const errors = codes.map((code) => Object.freeze(new Error(code)));
	const aggregate = new AggregateError(errors, message);
	Object.freeze(aggregate.errors);
	return Object.freeze(aggregate);
}
function issueArenaInputFeedbackReceipt(input, result, selectedCardIdBefore) {
	const snapshot = feedbackReaders.get(input)();
	const receipt = Object.freeze(Object.create(null));
	feedbackReceipts.set(receipt, {
		commands: snapshot.commands,
		elixir: snapshot.elixir,
		result: clone$2(result),
		selectedCardIdBefore,
		source: feedbackSources.get(input),
		spendSequenceProvenance: result.accepted ? result.command.spendSequence : null
	});
	return receipt;
}
/**
* Consume a single-use placement receipt issued inside the canonical browser
* input seam. Plain objects and replayed receipts have no authority.
*/
function consumeArenaInputFeedbackReceipt(receipt) {
	if (receipt === null || typeof receipt !== "object" || !feedbackReceipts.has(receipt)) throw new TypeError("arena input feedback receipt is invalid or consumed");
	const payload = feedbackReceipts.get(receipt);
	feedbackReceipts.delete(receipt);
	return freezeGraph({
		commands: clone$2(payload.commands),
		elixir: payload.elixir,
		result: clone$2(payload.result),
		selectedCardIdBefore: payload.selectedCardIdBefore,
		source: payload.source,
		spendSequenceProvenance: payload.spendSequenceProvenance
	});
}
/** Create a fieldless single-use authority for one trusted commit sink. */
function createArenaInputCommitSinkCapability(sink) {
	if (arguments.length !== 1 || typeof sink !== "function") throw new TypeError("arena input commit sink must be one function");
	const capability = Object.freeze(Object.create(null));
	commitSinkCapabilities.set(capability, sink);
	return capability;
}
/** Bind exactly one command sink to one live mounted browser input. */
function subscribeArenaInputCommits(browserInput, capability) {
	const state = mountedCommitStates.get(browserInput);
	const sink = commitSinkCapabilities.get(capability);
	if (state === void 0 || !state.active) throw new TypeError("arena input commit subscription requires a live mount");
	if (sink === void 0) {
		if (consumedCommitSinkCapabilities.has(capability)) throw new TypeError("arena input commit sink capability is consumed");
		throw new TypeError("arena input commit sink capability is invalid");
	}
	commitSinkCapabilities.delete(capability);
	consumedCommitSinkCapabilities.add(capability);
	if (state.sink !== null) throw new RangeError("arena input commit sink is already subscribed");
	state.sink = sink;
	const subscription = Object.freeze(Object.create(null));
	commitSubscriptions.set(subscription, state);
	return subscription;
}
/** Remove a commit subscription without exposing its callback or mount. */
function unsubscribeArenaInputCommits(subscription) {
	const state = commitSubscriptions.get(subscription);
	if (state === void 0) return false;
	commitSubscriptions.delete(subscription);
	if (state.sink === null) return false;
	state.sink = null;
	return true;
}
/** Consume one commit receipt issued only to the registered command sink. */
function consumeArenaInputCommitReceipt(receipt) {
	const payload = commitReceipts.get(receipt);
	if (payload === void 0) throw new TypeError("arena input commit receipt is invalid or consumed");
	commitReceipts.delete(receipt);
	return freezeGraph(clone$2(payload));
}
function deliverArenaInputCommit(state, result, selectedCardIdBefore, slotBefore) {
	if (!result.accepted || state.sink === null) return;
	if (selectedCardIdBefore !== result.command.cardId || !Number.isSafeInteger(slotBefore) || slotBefore < 0 || slotBefore > 3) throw new Error("arena input commit provenance is inconsistent");
	const receipt = Object.freeze(Object.create(null));
	commitReceipts.set(receipt, {
		cardId: result.command.cardId,
		commandId: result.command.id,
		point: clone$2(result.command.point),
		slot: slotBefore,
		tick: result.command.tick,
		type: result.command.type
	});
	state.sink(receipt);
}
function canonicalJson$3(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson$3).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$3(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function parseBoundedCanonicalText(text, label, maxBytes = 65536, maxNodes = 4096, maxDepth = 32) {
	if (typeof text !== "string") throw new TypeError(`${label} must be canonical text`);
	if (new TextEncoder().encode(text).byteLength > maxBytes) throw new RangeError(`${label} exceeds its byte bound`);
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new TypeError(`${label} must be valid JSON`);
	}
	const stack = [{
		depth: 0,
		value: parsed
	}];
	let nodes = 0;
	while (stack.length > 0) {
		const { depth, value } = stack.pop();
		nodes += 1;
		if (nodes > maxNodes) throw new RangeError(`${label} exceeds its node bound`);
		if (depth > maxDepth) throw new RangeError(`${label} exceeds its depth bound`);
		if (typeof value === "string") for (let index = 0; index < value.length; index += 1) {
			const unit = value.charCodeAt(index);
			if (unit >= 55296 && unit <= 56319) {
				const next = value.charCodeAt(index + 1);
				if (!(next >= 56320 && next <= 57343)) throw new TypeError(`${label} contains an unpaired Unicode surrogate`);
				index += 1;
			} else if (unit >= 56320 && unit <= 57343) throw new TypeError(`${label} contains an unpaired Unicode surrogate`);
		}
		else if (value !== null && typeof value === "object") for (const child of Array.isArray(value) ? value : Object.values(value)) stack.push({
			depth: depth + 1,
			value: child
		});
	}
	if (canonicalJson$3(parsed) !== text) throw new TypeError(`${label} must be canonical JSON`);
	return parsed;
}
function exactRecord(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain data object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Object.keys(descriptors).sort();
	const expected = [...keys].sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} has an invalid shape`);
	for (const key of actual) if (!descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
	return Object.fromEntries(expected.map((key) => [key, descriptors[key].value]));
}
function safeInteger$1(value, label, minimum = 0) {
	if (!Number.isSafeInteger(value) || value < minimum) throw new TypeError(`${label} must be a safe integer of at least ${minimum}`);
	return value;
}
function checkedCards$1(cards) {
	if (!Array.isArray(cards) || Object.getPrototypeOf(cards) !== Array.prototype || cards.length !== 8) throw new TypeError("arena input cards must contain exactly eight cards");
	const checked = cards.map((value, index) => {
		const full = Object.keys(Object.getOwnPropertyDescriptors(value ?? {})).length === FULL_CARD_KEYS.length;
		const card = exactRecord(value, full ? FULL_CARD_KEYS : [
			"cost",
			"displayName",
			"id"
		], `arena input card ${index}`);
		safeInteger$1(card.cost, `arena input card ${index}.cost`, 1);
		for (const key of ["displayName", "id"]) if (typeof card[key] !== "string" || card[key].length === 0) throw new TypeError(`arena input card ${index}.${key} is invalid`);
		return full ? JSON.parse(canonicalJson$3(card)) : card;
	});
	if (new Set(checked.map(({ id }) => id)).size !== checked.length) throw new TypeError("arena input card IDs must be unique");
	return clone$2(checked);
}
function checkedRect(value) {
	const rect = exactRecord(value, [
		"height",
		"left",
		"top",
		"width"
	], "arena client rectangle");
	for (const key of [
		"height",
		"left",
		"top",
		"width"
	]) if (typeof rect[key] !== "number" || !Number.isFinite(rect[key])) throw new TypeError(`arena client rectangle.${key} must be finite`);
	if (rect.width <= 0 || rect.height <= 0) throw new TypeError("arena client rectangle dimensions must be positive");
	return rect;
}
function checkedClientPoint(value) {
	const point = exactRecord(value, ["clientX", "clientY"], "client point");
	for (const key of ["clientX", "clientY"]) if (typeof point[key] !== "number" || !Number.isFinite(point[key])) throw new TypeError(`client point.${key} must be finite`);
	return point;
}
/**
* Project one viewport point into the arena's integer millitile coordinate
* space. The DOM's top edge is canonical north (y=32000), while its bottom
* edge is canonical south (y=0). All four rectangle edges are inclusive.
*/
function clientPointToArenaPoint(rectValue, pointValue) {
	const rect = checkedRect(rectValue);
	const point = checkedClientPoint(pointValue);
	const right = rect.left + rect.width;
	const bottom = rect.top + rect.height;
	if (point.clientX < rect.left || point.clientX > right || point.clientY < rect.top || point.clientY > bottom) return null;
	return {
		x: Math.min(ARENA_WIDTH_MILLITILES, Math.floor((point.clientX - rect.left) * ARENA_WIDTH_MILLITILES / rect.width)),
		y: Math.min(ARENA_LENGTH_MILLITILES, Math.floor((bottom - point.clientY) * ARENA_LENGTH_MILLITILES / rect.height))
	};
}
function cardMap(cards) {
	return new Map(cards.map((card) => [card.id, card]));
}
function checkedDeckSystem(value) {
	if (value !== null && (typeof value === "object" || typeof value === "function") && Object.getPrototypeOf(value) === DeckCycle.prototype) return value;
	const snapshot = exactRecord(value, ["bytes", "state"], "arena input deck snapshot");
	if (typeof snapshot.bytes !== "string") throw new TypeError("arena input deck snapshot bytes must be a string");
	return DeckCycle.restore(snapshot.bytes);
}
function checkedElixirSystem(value) {
	if (value !== null && (typeof value === "object" || typeof value === "function") && Object.getPrototypeOf(value) === ElixirMatch.prototype) return value;
	const snapshot = exactRecord(value, ["bytes", "state"], "arena input elixir snapshot");
	if (typeof snapshot.bytes !== "string") throw new TypeError("arena input elixir snapshot bytes must be a string");
	return ElixirMatch.restore(snapshot.bytes);
}
function checkedSystems(options) {
	const optionDescriptors = Object.getOwnPropertyDescriptors(options);
	const authoritative = Object.hasOwn(optionDescriptors, "deployBridge");
	const continued = Object.hasOwn(optionDescriptors, "commandIdOffset");
	const checked = exactRecord(options, [
		"cards",
		"commitSystems",
		...continued ? ["commandIdOffset"] : [],
		"deck",
		...authoritative ? ["deployBridge"] : [],
		"elixir",
		"hudUpdate"
	], "arena input options");
	const cards = checkedCards$1(checked.cards);
	const deck = checkedDeckSystem(checked.deck);
	const elixir = checkedElixirSystem(checked.elixir);
	if (typeof checked.hudUpdate !== "function") throw new TypeError("arena input hudUpdate must be a function");
	if (typeof checked.commitSystems !== "function") throw new TypeError("arena input commitSystems must be a function");
	if (authoritative && !isPlayerDeployBridge(checked.deployBridge)) throw new TypeError("arena input deployBridge must be an exact PlayerDeployBridge");
	if (continued && (!Number.isSafeInteger(checked.commandIdOffset) || checked.commandIdOffset < 0 || checked.commandIdOffset > MAX_ACTIONS)) throw new TypeError("arena input command ID offset is invalid");
	return {
		cards,
		commitSystems: checked.commitSystems,
		commandIdOffset: continued ? checked.commandIdOffset : 0,
		deck,
		deployBridge: authoritative ? checked.deployBridge : null,
		elixir,
		hudUpdate: checked.hudUpdate
	};
}
/**
* Serialize a trusted card catalog for the primitive-only HUD boundary.
*/
function serializeArenaInputCards(cards) {
	return canonicalJson$3(checkedCards$1(cards));
}
/** Create an opaque witness for an already trusted live bridge. */
function createArenaInputBridgeWitness(bridge) {
	if (!isPlayerDeployBridge(bridge)) throw new TypeError("arena input bridge witness requires an exact bridge");
	const witness = Object.freeze(Object.create(null));
	bridgeWitnesses.set(witness, bridge);
	return witness;
}
/**
* Create a single-use browser-mount authority from canonical primitive state.
* A mount attempt consumes the token permanently, including failed attempts,
* so stale state can never be rewound by retrying it.
*/
function createArenaInputHudCapability(cardsText, deckBytes, elixirBytes, replaceInteractionSystems, update, bridgeWitness = null, commandIdOffset = 0) {
	if (typeof cardsText !== "string" || typeof deckBytes !== "string" || typeof elixirBytes !== "string") throw new TypeError("arena input HUD state witnesses must be canonical strings");
	if (typeof replaceInteractionSystems !== "function" || typeof update !== "function") throw new TypeError("arena input HUD callbacks must be functions");
	if (!Number.isSafeInteger(commandIdOffset) || commandIdOffset < 0 || commandIdOffset > MAX_ACTIONS) throw new TypeError("arena input command ID offset is invalid");
	let updateAuthorities = sinkAuthorities.get(replaceInteractionSystems);
	if (updateAuthorities === void 0) {
		updateAuthorities = /* @__PURE__ */ new WeakMap();
		sinkAuthorities.set(replaceInteractionSystems, updateAuthorities);
	}
	let sinkAuthority = updateAuthorities.get(update);
	if (sinkAuthority === void 0) {
		sinkAuthority = Object.freeze(Object.create(null));
		updateAuthorities.set(update, sinkAuthority);
	}
	const deployBridge = bridgeWitness === null ? null : bridgeWitnesses.get(bridgeWitness);
	if (bridgeWitness !== null && deployBridge === void 0) throw new TypeError("arena input bridge witness is invalid");
	if (bridgeWitness !== null) bridgeWitnesses.delete(bridgeWitness);
	const cards = checkedCards$1(parseBoundedCanonicalText(cardsText, "arena input cards witness"));
	parseBoundedCanonicalText(deckBytes, "arena input deck witness", 16777216, 1e5, 64);
	parseBoundedCanonicalText(elixirBytes, "arena input elixir witness", 16777216, 1e5, 64);
	const deck = DeckCycle.restore(deckBytes);
	const elixir = ElixirMatch.restore(elixirBytes);
	const checked = checkedSystems(deployBridge === null ? {
		cards,
		commitSystems: replaceInteractionSystems,
		commandIdOffset,
		deck,
		elixir,
		hudUpdate: update
	} : {
		cards,
		commitSystems: replaceInteractionSystems,
		commandIdOffset,
		deck,
		deployBridge,
		elixir,
		hudUpdate: update
	});
	const token = Object.freeze(Object.create(null));
	hudCapabilities.set(token, Object.freeze({
		...checked,
		cards: freezeGraph(clone$2(checked.cards)),
		cardsText,
		commandIdOffset,
		sinkAuthority
	}));
	return token;
}
/** Mint a single-use remount cursor whose next browser command ID is exact. */
function createArenaInputSessionContinuationCapability(cardsText, deckBytes, elixirBytes, nextCommandId, replaceInteractionSystems, update) {
	if (!Number.isSafeInteger(nextCommandId) || nextCommandId < 1 || nextCommandId > MAX_ACTIONS + 1) throw new TypeError("arena input next command ID is invalid");
	return createArenaInputHudCapability(cardsText, deckBytes, elixirBytes, replaceInteractionSystems, update, null, nextCommandId - 1);
}
function exactNodes(target, selector, count, label) {
	if (target === null || typeof target !== "object" && typeof target !== "function" || typeof target.querySelectorAll !== "function") throw new TypeError(`${label} target is invalid`);
	const values = Array.from(target.querySelectorAll(selector));
	if (values.length !== count || new Set(values).size !== count) throw new TypeError(`${label} must resolve to exactly ${count} unique nodes`);
	return values;
}
function eventClientPoint(event, touch) {
	if (event === null || typeof event !== "object") throw new TypeError("arena input event must be an object");
	if (!touch) return checkedClientPoint({
		clientX: event.clientX,
		clientY: event.clientY
	});
	const touches = event.changedTouches;
	if (touches === null || typeof touches !== "object" || touches.length !== 1) throw new TypeError("arena touch event must contain exactly one changed touch");
	return checkedClientPoint({
		clientX: touches[0].clientX,
		clientY: touches[0].clientY
	});
}
function arenaClientRect(arena) {
	const measured = arena.getBoundingClientRect();
	if (measured === null || typeof measured !== "object" && typeof measured !== "function") throw new TypeError("arena border rectangle must be an object");
	const border = checkedRect({
		height: measured.height,
		left: measured.left,
		top: measured.top,
		width: measured.width
	});
	const metrics = {
		height: arena.clientHeight,
		left: arena.clientLeft,
		top: arena.clientTop,
		width: arena.clientWidth
	};
	for (const [key, value] of Object.entries(metrics)) if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`arena client metric ${key} must be finite`);
	if (metrics.left < 0 || metrics.top < 0 || metrics.width <= 0 || metrics.height <= 0 || metrics.left + metrics.width > border.width || metrics.top + metrics.height > border.height) throw new TypeError("arena client metrics exceed the border box");
	return checkedRect({
		height: metrics.height,
		left: border.left + metrics.left,
		top: border.top + metrics.top,
		width: metrics.width
	});
}
function arenaEventFamily(arena) {
	const view = arena.ownerDocument?.defaultView;
	return view !== null && typeof view === "object" && typeof view.PointerEvent === "function" ? "pointer" : "legacy";
}
function sameClientPoint(left, right) {
	return left !== null && left.clientX === right.clientX && left.clientY === right.clientY;
}
/**
* Browser seam: bind the four hand slots and arena to one deterministic input
* controller. Returned direct handlers are also the browser smoke-test seam.
*/
function mountArenaInputController(shell, hudCapability) {
	const admitted = hudCapabilities.get(hudCapability);
	if (admitted === void 0) throw new TypeError("arena input HUD capability is invalid");
	if (consumedHudCapabilities.has(hudCapability)) throw new RangeError("arena input HUD capability is consumed");
	consumedHudCapabilities.add(hudCapability);
	if (activeSinkAuthorities.has(admitted.sinkAuthority) || admitted.deployBridge !== null && activeBridgeAuthorities.has(admitted.deployBridge)) throw new RangeError("arena input HUD authority is already mounted");
	activeSinkAuthorities.add(admitted.sinkAuthority);
	if (admitted.deployBridge !== null) activeBridgeAuthorities.add(admitted.deployBridge);
	activeHudCapabilities.add(hudCapability);
	const commitState = {
		active: true,
		sink: null
	};
	let authorityClaimed = true;
	const releaseMountAuthority = () => {
		if (!authorityClaimed) return;
		authorityClaimed = false;
		activeHudCapabilities.delete(hudCapability);
		activeSinkAuthorities.delete(admitted.sinkAuthority);
		if (admitted.deployBridge !== null) activeBridgeAuthorities.delete(admitted.deployBridge);
	};
	let arena;
	let hand;
	try {
		arena = exactNodes(shell, "[data-ui=\"arena\"]", 1, "arena input arena")[0];
		hand = exactNodes(shell, "[data-ui=\"card-slot\"]", 4, "arena input hand");
		if (typeof arena.getBoundingClientRect !== "function" || typeof arena.addEventListener !== "function" || hand.some((node) => typeof node.addEventListener !== "function")) throw new TypeError("arena input hooks must support browser events");
	} catch {
		releaseMountAuthority();
		throw frozenAggregate("arena input mount shell validation failed", ["shell validation failed"]);
	}
	let input;
	try {
		const inputOptions = {
			cards: admitted.cards,
			commitSystems: admitted.commitSystems,
			commandIdOffset: admitted.commandIdOffset,
			deck: admitted.deck,
			elixir: admitted.elixir,
			hudUpdate: admitted.hudUpdate
		};
		if (admitted.deployBridge !== null) inputOptions.deployBridge = admitted.deployBridge;
		input = new ArenaInputController(inputOptions);
		controllerDisposalHooks.set(input, () => {
			commitState.active = false;
			commitState.sink = null;
			releaseMountAuthority();
		});
	} catch {
		releaseMountAuthority();
		throw frozenAggregate("arena input mount controller construction failed", ["HUD controller registration failed"]);
	}
	const trustedReader = feedbackReaders.get(input);
	const placeClientPoint = input.placeClientPoint.bind(input);
	const selectCard = input.select.bind(input);
	let eventFamily;
	try {
		eventFamily = arenaEventFamily(arena);
	} catch {
		input.dispose();
		releaseMountAuthority();
		throw frozenAggregate("arena input mount initialization failed", ["event family detection failed"]);
	}
	let pendingTouchRelease = null;
	let feedback = null;
	let lastPreviewPoint = null;
	let spellPreview = null;
	if (arena.ownerDocument !== null && typeof arena.ownerDocument === "object" && typeof arena.ownerDocument.createElement === "function" && typeof arena.appendChild === "function") {
		spellPreview = arena.ownerDocument.createElement("div");
		spellPreview.className = "squall-orb-radius-preview";
		spellPreview.setAttribute("aria-hidden", "true");
		Object.assign(spellPreview.style, {
			background: "rgba(243, 117, 47, 0.19)",
			border: "2px solid rgba(255, 198, 117, 0.92)",
			borderRadius: "50%",
			display: "none",
			pointerEvents: "none",
			position: "absolute",
			transform: "translateZ(0)",
			zIndex: "18"
		});
		arena.appendChild(spellPreview);
	}
	const updateSpellPreview = (clientPoint = lastPreviewPoint) => {
		if (spellPreview === null) return;
		const selectedCardId = trustedReader().selectedCardId;
		const card = cardMap(admitted.cards).get(selectedCardId);
		const radius = card?.kind === "effect" ? card.areaDamageRadiusMillitiles : null;
		if (!Number.isSafeInteger(radius) || radius <= 0) {
			spellPreview.style.display = "none";
			return;
		}
		const rect = arenaClientRect(arena);
		const point = clientPoint ?? {
			clientX: rect.left + rect.width / 2,
			clientY: rect.top + rect.height / 2
		};
		if (point.clientX < rect.left || point.clientX > rect.left + rect.width || point.clientY < rect.top || point.clientY > rect.top + rect.height) {
			spellPreview.style.display = "none";
			return;
		}
		const radiusPixels = radius * rect.width / ARENA_WIDTH_MILLITILES;
		spellPreview.style.width = `${radiusPixels * 2}px`;
		spellPreview.style.height = `${radiusPixels * 2}px`;
		spellPreview.style.left = `${point.clientX - rect.left - radiusPixels}px`;
		spellPreview.style.top = `${point.clientY - rect.top - radiusPixels}px`;
		spellPreview.dataset.radiusMillitiles = String(radius);
		spellPreview.style.display = "block";
	};
	let teardownMounted;
	const assertSeamMutation = () => {
		if (deliveryControllers.has(input) || mutationControllers.has(input)) throw new Error("arena input reentrant browser mutation rejected");
	};
	const notify = (method, result, selectedCardIdBefore = null, slotBefore = -1) => {
		if (deliveryControllers.has(input)) throw new Error("arena input reentrant feedback delivery rejected");
		deliveryControllers.add(input);
		try {
			if (method === "onPlace") deliverArenaInputCommit(commitState, result, selectedCardIdBefore, slotBefore);
			if (feedback !== null) {
				if (method === "onPlace") feedback.onPlace(issueArenaInputFeedbackReceipt(input, result, selectedCardIdBefore));
				else feedback.onSelect(result, trustedReader().selectedCardId);
			}
			if (method === "onPlace" || method === "onSelect") updateSpellPreview();
			return result;
		} finally {
			deliveryControllers.delete(input);
		}
	};
	const onCard = (event) => {
		assertSeamMutation();
		return notify("onSelect", selectCard(event.currentTarget.dataset.cardId));
	};
	const onPointer = (event) => {
		assertSeamMutation();
		const before = trustedReader();
		const selectedCardIdBefore = before.selectedCardId;
		return notify("onPlace", placeClientPoint(arenaClientRect(arena), eventClientPoint(event, false)), selectedCardIdBefore, before.deck.hand.indexOf(selectedCardIdBefore));
	};
	const onPointerMove = (event) => {
		lastPreviewPoint = eventClientPoint(event, false);
		updateSpellPreview(lastPreviewPoint);
	};
	const onTouch = (event) => {
		assertSeamMutation();
		const before = trustedReader();
		const selectedCardIdBefore = before.selectedCardId;
		const point = eventClientPoint(event, true);
		pendingTouchRelease = point;
		return notify("onPlace", placeClientPoint(arenaClientRect(arena), point), selectedCardIdBefore, before.deck.hand.indexOf(selectedCardIdBefore));
	};
	const onTouchMove = (event) => {
		lastPreviewPoint = eventClientPoint(event, true);
		updateSpellPreview(lastPreviewPoint);
	};
	const onMouse = (event) => {
		assertSeamMutation();
		const point = eventClientPoint(event, false);
		if (event.sourceCapabilities?.firesTouchEvents === true || sameClientPoint(pendingTouchRelease, point)) {
			pendingTouchRelease = null;
			return Object.freeze({
				accepted: false,
				point: null,
				reason: "compatibility_mouse_suppressed",
				type: "place"
			});
		}
		pendingTouchRelease = null;
		const before = trustedReader();
		const selectedCardIdBefore = before.selectedCardId;
		return notify("onPlace", placeClientPoint(arenaClientRect(arena), point), selectedCardIdBefore, before.deck.hand.indexOf(selectedCardIdBefore));
	};
	const onMouseMove = (event) => {
		lastPreviewPoint = eventClientPoint(event, false);
		updateSpellPreview(lastPreviewPoint);
	};
	const setFeedback = (next) => {
		if (!mounted) throw new Error("arena input mount is disposed");
		assertSeamMutation();
		if (next === null) {
			feedback = null;
			return;
		}
		let checked;
		try {
			checked = exactRecord(next, ["onPlace", "onSelect"], "arena input feedback hook");
		} catch {
			throw frozenAggregate("arena input feedback registration failed: invalid hook", ["feedback hook is invalid", ...teardownMounted()]);
		}
		if (typeof checked.onPlace !== "function" || typeof checked.onSelect !== "function") throw frozenAggregate("arena input feedback registration failed: invalid hook", ["feedback hook is invalid", ...teardownMounted()]);
		feedback = Object.freeze(checked);
	};
	const getClientRect = () => arenaClientRect(arena);
	const registrations = [];
	const register = (node, type, listener) => {
		registrations.push({
			listener,
			node,
			type
		});
		node.addEventListener(type, listener);
	};
	const unregisterAll = () => {
		const errors = [];
		for (let index = registrations.length - 1; index >= 0; index -= 1) {
			const { listener, node, type } = registrations[index];
			try {
				node.removeEventListener?.(type, listener);
			} catch {
				errors.push("listener removal failed");
				try {
					node.removeEventListener?.(type, listener);
				} catch {
					errors.push("listener removal retry failed");
				}
			}
		}
		registrations.length = 0;
		try {
			spellPreview?.remove?.();
		} catch {
			errors.push("spell preview removal failed");
		}
		return errors;
	};
	try {
		for (const node of hand) register(node, "click", onCard);
		if (eventFamily === "pointer") {
			register(arena, "pointermove", onPointerMove);
			register(arena, "pointerup", onPointer);
		} else {
			register(arena, "touchmove", onTouchMove);
			register(arena, "mousemove", onMouseMove);
			register(arena, "touchend", onTouch);
			register(arena, "mouseup", onMouse);
		}
	} catch {
		const cleanupErrors = unregisterAll();
		try {
			input.dispose();
		} catch {
			cleanupErrors.push("controller disposal failed");
		}
		releaseMountAuthority();
		throw frozenAggregate("arena input mount registration failed", ["listener registration failed", ...cleanupErrors]);
	}
	let mounted = true;
	teardownMounted = () => {
		if (!mounted) return [];
		const cleanupErrors = [];
		try {
			input.dispose();
		} catch {
			cleanupErrors.push("controller disposal failed");
		}
		mounted = false;
		feedback = null;
		commitState.active = false;
		commitState.sink = null;
		releaseMountAuthority();
		cleanupErrors.push(...unregisterAll());
		return cleanupErrors;
	};
	const cleanup = () => {
		if (!mounted) return false;
		input.dispose();
		const cleanupErrors = teardownMounted();
		if (cleanupErrors.length > 0) throw frozenAggregate("arena input mount cleanup failed", cleanupErrors);
		return true;
	};
	const createContinuationCapability = () => {
		if (mounted) throw new Error("arena input continuation requires cleanup first");
		if (admitted.deployBridge === null) throw new Error("legacy arena input has no authoritative continuation cursor");
		return createArenaInputHudCapability(admitted.cardsText, admitted.deployBridge.deckBytes, admitted.deployBridge.elixirBytes, admitted.commitSystems, admitted.hudUpdate, createArenaInputBridgeWitness(admitted.deployBridge));
	};
	const browserInput = Object.freeze({
		cards: Object.freeze(trustedReader().cards.map(({ cost, displayName, id }) => Object.freeze({
			cost,
			displayName,
			id
		}))),
		cleanup,
		createContinuationCapability,
		eventFamily,
		getClientRect,
		input,
		onCard,
		onMouse,
		onPointer,
		onTouch,
		get selectedCardId() {
			return trustedReader().selectedCardId;
		},
		setFeedback
	});
	mountedCommitStates.set(browserInput, commitState);
	return browserInput;
}
var LOCAL_SIDE$2, MAX_ACTIONS, COMMIT_ROLLBACK_FAULT, AUTHORITATIVE_PROJECTION_FAULT, systemAuthorities, deliveryControllers, mutationControllers, feedbackReceipts, feedbackReaders, feedbackSources, commitReceipts, commitSinkCapabilities, consumedCommitSinkCapabilities, mountedCommitStates, commitSubscriptions, hudCapabilities, activeHudCapabilities, consumedHudCapabilities, bridgeWitnesses, sinkAuthorities, activeSinkAuthorities, activeBridgeAuthorities, controllerDisposalHooks, FULL_CARD_KEYS, ArenaInputController;
function init_input_controller() {
	return (init_input_controller = __esmMin((() => {
		init_arena_geometry();
		init_deployment();
		init_deck();
		init_elixir();
		init_game_player_deploy();
		LOCAL_SIDE$2 = "south";
		MAX_ACTIONS = DECK_MAX_PLAY_COMMANDS * 3;
		COMMIT_ROLLBACK_FAULT = "commit_rollback_failed";
		AUTHORITATIVE_PROJECTION_FAULT = "authoritative_projection_failed";
		systemAuthorities = /* @__PURE__ */ new WeakMap();
		deliveryControllers = /* @__PURE__ */ new WeakSet();
		mutationControllers = /* @__PURE__ */ new WeakSet();
		feedbackReceipts = /* @__PURE__ */ new WeakMap();
		feedbackReaders = /* @__PURE__ */ new WeakMap();
		feedbackSources = /* @__PURE__ */ new WeakMap();
		commitReceipts = /* @__PURE__ */ new WeakMap();
		commitSinkCapabilities = /* @__PURE__ */ new WeakMap();
		consumedCommitSinkCapabilities = /* @__PURE__ */ new WeakSet();
		mountedCommitStates = /* @__PURE__ */ new WeakMap();
		commitSubscriptions = /* @__PURE__ */ new WeakMap();
		hudCapabilities = /* @__PURE__ */ new WeakMap();
		activeHudCapabilities = /* @__PURE__ */ new WeakSet();
		consumedHudCapabilities = /* @__PURE__ */ new WeakSet();
		bridgeWitnesses = /* @__PURE__ */ new WeakMap();
		sinkAuthorities = /* @__PURE__ */ new WeakMap();
		activeSinkAuthorities = /* @__PURE__ */ new WeakSet();
		activeBridgeAuthorities = /* @__PURE__ */ new WeakSet();
		controllerDisposalHooks = /* @__PURE__ */ new WeakMap();
		FULL_CARD_KEYS = Object.freeze([
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
		]);
		ArenaInputController = class ArenaInputController {
			#actions = [];
			#cards;
			#claimedSystems;
			#commands = [];
			#commandIdOffset = 0;
			#commitSystems;
			#deck;
			#deployBridge;
			#disposed = false;
			#elixir;
			#faultCode = null;
			#hudUpdate;
			#initialDeck;
			#initialElixir;
			#selectedCardId = null;
			#operationActive = false;
			constructor(options) {
				const checked = checkedSystems(options);
				this.#cards = checked.cards;
				this.#claimedSystems = checked.deployBridge === null ? [checked.deck, checked.elixir] : [
					checked.deck,
					checked.elixir,
					checked.deployBridge
				];
				this.#commitSystems = checked.commitSystems;
				this.#commandIdOffset = checked.commandIdOffset;
				this.#deck = checked.deck;
				this.#deployBridge = checked.deployBridge;
				this.#elixir = checked.elixir;
				this.#hudUpdate = checked.hudUpdate;
				this.#initialDeck = JSON.parse(this.#deck.serializeJson());
				this.#initialElixir = JSON.parse(this.#elixir.serialize());
				if (this.#deployBridge !== null) this.#seedAuthoritativeHistory();
				feedbackSources.set(this, Object.freeze(Object.create(null)));
				feedbackReaders.set(this, () => ({
					cards: clone$2(this.#cards),
					commands: clone$2(this.#commands),
					deck: clone$2(this.#deck.state),
					elixir: this.#elixir.serialize(),
					selectedCardId: this.#selectedCardId
				}));
				for (const system of this.#claimedSystems) if (systemAuthorities.has(system)) throw new RangeError("arena input systems already have an input authority");
				const claimed = [];
				try {
					for (const system of this.#claimedSystems) {
						systemAuthorities.set(system, this);
						claimed.push(system);
					}
				} catch (error) {
					for (const system of claimed) if (systemAuthorities.get(system) === this) systemAuthorities.delete(system);
					throw error;
				}
			}
			get selectedCardId() {
				return this.#selectedCardId;
			}
			get commands() {
				return freezeGraph(clone$2(this.#commands));
			}
			get deck() {
				return systemSnapshot(this.#deck, this.#elixir).deck;
			}
			get elixir() {
				return systemSnapshot(this.#deck, this.#elixir).elixir;
			}
			get faultCode() {
				return this.#faultCode;
			}
			dispose() {
				if (deliveryControllers.has(this) || mutationControllers.has(this)) throw new Error("arena input reentrant disposal rejected");
				if (this.#disposed) return false;
				this.#disposed = true;
				for (const system of this.#claimedSystems) if (systemAuthorities.get(system) === this) systemAuthorities.delete(system);
				const disposalHook = controllerDisposalHooks.get(this);
				if (disposalHook !== void 0) {
					controllerDisposalHooks.delete(this);
					disposalHook();
				}
				return true;
			}
			get replay() {
				return freezeGraph(clone$2(this.#actions));
			}
			#seedAuthoritativeHistory() {
				if (this.#deck.serializeJson() !== this.#deployBridge.deckBytes || this.#elixir.serialize() !== this.#deployBridge.elixirBytes) throw new RangeError("arena input systems do not match the authoritative bridge");
				if (canonicalJson$3(this.#cards) !== this.#deployBridge.rosterBytes) throw new RangeError("arena input cards do not match the authoritative bridge");
				const deployments = this.#deployBridge.replay.filter(({ type }) => type === "player-deployed" || type === "player-spell-cast");
				for (const [index, deployment] of deployments.entries()) {
					const receipt = deployment.receipt;
					if (receipt.commandId !== index + 1) throw new RangeError("arena input bridge command history is noncontiguous");
					this.#actions.push({
						accepted: true,
						cardId: receipt.cardId,
						selectedCardId: receipt.cardId,
						sequence: this.#actions.length,
						type: "select"
					});
					this.#commands.push({
						cardId: receipt.cardId,
						cost: receipt.cost,
						id: receipt.commandId,
						point: clone$2(receipt.point),
						sequence: this.#commands.length,
						side: receipt.side,
						spendSequence: receipt.spendSequence,
						tick: receipt.tick,
						type: receipt.type
					});
					this.#actions.push({
						commandId: receipt.commandId,
						point: clone$2(receipt.point),
						sequence: this.#actions.length,
						type: "place"
					});
				}
			}
			select(cardId) {
				return this.#runMutation(() => this.#selectActive(cardId));
			}
			#selectActive(cardId) {
				if (typeof cardId !== "string" || cardId.length === 0) throw new TypeError("selected card ID must be a non-empty string");
				if (!this.#deck.state.hand.includes(cardId)) return freezeGraph({
					accepted: false,
					cardId,
					reason: "not_in_hand",
					selectedCardId: this.#selectedCardId,
					type: "select"
				});
				const card = cardMap(this.#cards).get(cardId);
				if (card === void 0) throw new TypeError("selected card is missing from the runtime catalog");
				if (this.#availableElixir() < card.cost) return freezeGraph({
					accepted: false,
					cardId,
					reason: "insufficient_elixir",
					selectedCardId: this.#selectedCardId,
					type: "select"
				});
				if (this.#selectedCardId === cardId) return this.#cancelActive();
				this.#assertActionCapacity();
				const previous = this.#selectedCardId;
				this.#selectedCardId = cardId;
				try {
					this.#hudUpdate(cardId);
				} catch (error) {
					this.#selectedCardId = previous;
					throw error;
				}
				const event = {
					accepted: true,
					cardId,
					sequence: this.#actions.length,
					selectedCardId: cardId,
					type: "select"
				};
				this.#actions.push(event);
				return freezeGraph(clone$2(event));
			}
			cancel() {
				return this.#runMutation(() => this.#cancelActive());
			}
			#cancelActive() {
				if (this.#selectedCardId === null) return freezeGraph({
					accepted: false,
					reason: "nothing_selected",
					selectedCardId: null,
					type: "cancel"
				});
				this.#assertActionCapacity();
				const cardId = this.#selectedCardId;
				this.#selectedCardId = null;
				try {
					this.#hudUpdate(null);
				} catch (error) {
					this.#selectedCardId = cardId;
					throw error;
				}
				const event = {
					accepted: true,
					cardId,
					sequence: this.#actions.length,
					selectedCardId: null,
					type: "cancel"
				};
				this.#actions.push(event);
				return freezeGraph(clone$2(event));
			}
			placeArenaPoint(pointValue) {
				return this.#runMutation(() => this.#placeArenaPointActive(pointValue));
			}
			#placeArenaPointActive(pointValue) {
				const point = validateArenaPoint(pointValue, "arena input point");
				const selected = this.#selectedCardId;
				if (selected === null) return freezeGraph({
					accepted: false,
					point,
					reason: "nothing_selected",
					type: "place"
				});
				const card = cardMap(this.#cards).get(selected);
				if (card === void 0 || !this.#deck.state.hand.includes(selected)) return freezeGraph({
					accepted: false,
					point,
					reason: "card_unavailable",
					type: "place"
				});
				if (this.#availableElixir() < card.cost) return freezeGraph({
					accepted: false,
					point,
					reason: "insufficient_elixir",
					type: "place"
				});
				const decision = evaluateDeployment({
					destroyedOpposingLaneTowers: [],
					placementClass: card.kind === "effect" ? "global_effect" : "ground_entity",
					point,
					side: LOCAL_SIDE$2
				});
				if (!decision.legal) return freezeGraph({
					accepted: false,
					confidence: decision.confidence,
					point,
					reason: decision.reason,
					type: "place"
				});
				this.#assertActionCapacity();
				if (this.#deck.state.sequence >= 1e4) throw new RangeError("arena input deck command limit reached");
				const tick = this.#elixir.tick;
				const slot = this.#deck.state.hand.indexOf(selected);
				if (this.#deployBridge !== null) {
					const parsedElixir = JSON.parse(this.#elixir.serialize());
					const spendSequence = parsedElixir.commands.length + (Array.isArray(parsedElixir.grants) ? parsedElixir.grants.length : 0);
					const commandId = this.#commandIdOffset + this.#commands.length + 1;
					const type = card.kind === "effect" ? "spell" : "deploy";
					const intent = createPlayerDeployIntent({
						accepted: true,
						cardId: selected,
						commandId,
						cost: card.cost,
						point,
						side: LOCAL_SIDE$2,
						slot,
						spendSequence,
						tick,
						type
					});
					const prepared = this.#deployBridge.prepare(intent);
					const projection = this.#deployBridge.preparedResult(prepared);
					const command = {
						cardId: selected,
						cost: card.cost,
						id: commandId,
						point,
						sequence: this.#commands.length,
						side: LOCAL_SIDE$2,
						spendSequence,
						tick,
						type
					};
					const action = {
						commandId,
						point,
						sequence: this.#actions.length,
						type: "place"
					};
					this.#deployBridge.commitPrepared(prepared);
					this.#deck = DeckCycle.restore(this.#deployBridge.deckBytes);
					this.#elixir = ElixirMatch.restore(this.#deployBridge.elixirBytes);
					this.#commands.push(command);
					this.#selectedCardId = null;
					this.#actions.push(action);
					const immutableProjection = systemSnapshot(DeckCycle.restore(projection.deckBytes), ElixirMatch.restore(projection.elixirBytes));
					try {
						const hudResult = this.#hudUpdate(null, immutableProjection);
						if (hudResult !== null && (typeof hudResult === "object" || typeof hudResult === "function") && typeof hudResult.then === "function") throw new TypeError("arena input authoritative HUD returned a thenable");
						const commitResult = this.#commitSystems(immutableProjection);
						if (commitResult !== null && (typeof commitResult === "object" || typeof commitResult === "function") && typeof commitResult.then === "function") throw new TypeError("arena input authoritative system publisher returned a thenable");
					} catch (error) {
						this.#faultCode = AUTHORITATIVE_PROJECTION_FAULT;
						throw frozenAggregate("arena input authoritative state committed but projection failed", ["authoritative projection callback failed"]);
					}
					return freezeGraph({
						accepted: true,
						command: clone$2(command),
						confidence: decision.confidence,
						reason: decision.reason,
						type: "place"
					});
				}
				const nextDeck = DeckCycle.restore(this.#deck.serializeJson());
				const nextElixir = ElixirMatch.restore(this.#elixir.serialize());
				const spendSequence = nextElixir.scheduleSpend(tick, LOCAL_SIDE$2, card.cost);
				if (!nextDeck.play(selected).accepted) throw new Error("canonical deck rejected a prevalidated arena play");
				const nextProjection = systemSnapshot(nextDeck, nextElixir);
				this.#hudUpdate(null, nextProjection);
				try {
					this.#commitSystems(nextProjection);
				} catch (error) {
					const rollbackErrors = [];
					const rollbackProjection = systemSnapshot(this.#deck, this.#elixir);
					try {
						this.#commitSystems(rollbackProjection);
					} catch (caught) {
						rollbackErrors.push(caught);
					}
					try {
						this.#hudUpdate(selected, rollbackProjection);
					} catch (caught) {
						rollbackErrors.push(caught);
					}
					if (rollbackErrors.length > 0) {
						this.#faultCode = COMMIT_ROLLBACK_FAULT;
						throw frozenAggregate("arena input commit failed and could not be fully rolled back", ["candidate publication failed", ...rollbackErrors.map(() => "rollback callback failed")]);
					}
					throw error;
				}
				const command = {
					cardId: selected,
					cost: card.cost,
					id: this.#commandIdOffset + this.#commands.length + 1,
					point,
					sequence: this.#commands.length,
					side: LOCAL_SIDE$2,
					spendSequence,
					tick,
					type: card.kind === "effect" ? "spell" : "deploy"
				};
				const action = {
					commandId: command.id,
					point,
					sequence: this.#actions.length,
					type: "place"
				};
				this.#deck = nextDeck;
				this.#elixir = nextElixir;
				this.#commands.push(command);
				this.#selectedCardId = null;
				this.#actions.push(action);
				return freezeGraph({
					accepted: true,
					command: clone$2(command),
					confidence: decision.confidence,
					reason: decision.reason,
					type: "place"
				});
			}
			placeClientPoint(rect, point) {
				return this.#runMutation(() => this.#placeClientPointActive(rect, point));
			}
			#placeClientPointActive(rect, point) {
				const arenaPoint = clientPointToArenaPoint(rect, point);
				if (arenaPoint === null) return freezeGraph({
					accepted: false,
					point: null,
					reason: "outside_client_bounds",
					type: "place"
				});
				return this.#placeArenaPointActive(arenaPoint);
			}
			serialize() {
				this.#assertHealthy();
				return canonicalJson$3({
					actions: this.#actions,
					commands: this.#commands,
					deck: JSON.parse(this.#deck.serializeJson()),
					elixir: JSON.parse(this.#elixir.serialize()),
					initialDeck: this.#initialDeck,
					initialElixir: this.#initialElixir,
					selectedCardId: this.#selectedCardId,
					version: 1
				});
			}
			static restore(serialized, options) {
				if (typeof serialized !== "string") throw new TypeError("serialized arena input must be a string");
				let snapshot;
				try {
					snapshot = JSON.parse(serialized);
				} catch {
					throw new TypeError("serialized arena input must be valid JSON");
				}
				const checked = exactRecord(snapshot, [
					"actions",
					"commands",
					"deck",
					"elixir",
					"initialDeck",
					"initialElixir",
					"selectedCardId",
					"version"
				], "arena input snapshot");
				if (checked.version !== 1) throw new TypeError("arena input snapshot has an unsupported version");
				if (!Array.isArray(checked.actions) || checked.actions.length > MAX_ACTIONS) throw new TypeError("arena input snapshot actions are invalid");
				const restoreOptions = exactRecord(options, ["cards", "hudUpdate"], "arena input restore options");
				const controller = new ArenaInputController({
					cards: restoreOptions.cards,
					commitSystems() {},
					deck: DeckCycle.restore(canonicalJson$3(checked.initialDeck)),
					elixir: ElixirMatch.restore(canonicalJson$3(checked.initialElixir)),
					hudUpdate() {}
				});
				for (let index = 0; index < checked.actions.length; index += 1) {
					const action = checked.actions[index];
					if (action?.type === "select") {
						const entry = exactRecord(action, [
							"accepted",
							"cardId",
							"selectedCardId",
							"sequence",
							"type"
						], `arena input action ${index}`);
						if (entry.accepted !== true || entry.sequence !== index || entry.selectedCardId !== entry.cardId) throw new TypeError(`arena input action ${index} is incoherent`);
						controller.select(entry.cardId);
					} else if (action?.type === "cancel") {
						const entry = exactRecord(action, [
							"accepted",
							"cardId",
							"selectedCardId",
							"sequence",
							"type"
						], `arena input action ${index}`);
						if (entry.accepted !== true || entry.sequence !== index || entry.selectedCardId !== null) throw new TypeError(`arena input action ${index} is incoherent`);
						controller.cancel();
					} else if (action?.type === "place") {
						const entry = exactRecord(action, [
							"commandId",
							"point",
							"sequence",
							"type"
						], `arena input action ${index}`);
						if (entry.sequence !== index || entry.commandId !== controller.#commands.length + 1) throw new TypeError(`arena input action ${index} is incoherent`);
						const result = controller.placeArenaPoint(entry.point);
						if (!result.accepted || result.command.id !== entry.commandId) throw new TypeError(`arena input action ${index} cannot be replayed`);
					} else throw new TypeError(`arena input action ${index} has an invalid type`);
				}
				if (controller.serialize() !== canonicalJson$3(checked)) throw new TypeError("arena input snapshot is not a canonical causal state");
				controller.#hudUpdate = restoreOptions.hudUpdate;
				controller.#hudUpdate(controller.#selectedCardId, systemSnapshot(controller.#deck, controller.#elixir));
				return controller;
			}
			#assertActionCapacity() {
				if (this.#actions.length >= MAX_ACTIONS) throw new RangeError("arena input action history limit reached");
			}
			#assertHealthy() {
				if (this.#disposed) throw new Error("arena input is disposed");
				if (this.#faultCode !== null) throw new Error(`arena input is poisoned: ${this.#faultCode}`);
			}
			#runMutation(operation) {
				if (deliveryControllers.has(this)) throw new Error("arena input reentrant feedback delivery rejected");
				if (this.#operationActive) throw new Error("arena input reentrant operation rejected");
				this.#assertHealthy();
				this.#operationActive = true;
				mutationControllers.add(this);
				try {
					return operation();
				} finally {
					mutationControllers.delete(this);
					this.#operationActive = false;
				}
			}
			#availableElixir() {
				const state = this.#elixir.state;
				return state.sides[LOCAL_SIDE$2].amount - this.#commands.filter(({ tick }) => tick === state.tick).reduce((total, { cost }) => total + cost, 0);
			}
		};
	})))();
}
//#endregion
//#region src/ui/game-input-bridge.js
function canonical$3(value) {
	if (Array.isArray(value)) return `[${value.map(canonical$3).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical$3(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function clone$1(value) {
	return JSON.parse(JSON.stringify(value));
}
function freeze$2(value) {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) freeze$2(child);
		Object.freeze(value);
	}
	return value;
}
function checkedSnapshot(bytes) {
	if (typeof bytes !== "string" || new TextEncoder().encode(bytes).byteLength > 1048576) throw new TypeError("game input bridge snapshot must be bounded canonical text");
	let value;
	try {
		value = JSON.parse(bytes);
	} catch {
		throw new TypeError("game input bridge snapshot must be valid JSON");
	}
	if (canonical$3(value) !== bytes || value === null || Array.isArray(value) || Object.keys(value).sort().join(",") !== "deliveries,version" || value.version !== 1 || !Array.isArray(value.deliveries) || value.deliveries.length > MAX_DELIVERIES) throw new TypeError("game input bridge snapshot is invalid");
	for (const [index, delivery] of value.deliveries.entries()) {
		const spell = delivery?.command?.type === "spell";
		const commandKeys = delivery?.command && typeof delivery.command === "object" ? Object.keys(delivery.command).sort().join(",") : "";
		if (delivery === null || Array.isArray(delivery) || Object.keys(delivery).sort().join(",") !== "admission,command" || delivery.command === null || Array.isArray(delivery.command) || commandKeys !== (spell ? "cardId,commandId,point,side,slot,tick,type" : "cardId,commandId,point,slot,tick,type") || delivery.admission === null || Array.isArray(delivery.admission) || delivery.admission.commandId !== delivery.command.commandId || delivery.command.commandId !== index + 1) throw new TypeError("game input bridge delivery history is invalid");
		if (!["deploy", "spell"].includes(delivery.command.type)) throw new TypeError("game input bridge delivery type is invalid");
		if (spell && delivery.command.side !== "south") throw new TypeError("game input bridge spell side is invalid");
	}
	return clone$1(value);
}
var MAX_DELIVERIES, GameInputBridge;
function init_game_input_bridge() {
	return (init_game_input_bridge = __esmMin((() => {
		init_game_session();
		init_input_controller();
		MAX_DELIVERIES = 1e4;
		GameInputBridge = class GameInputBridge {
			#active = true;
			#deliveries = [];
			#session;
			#subscription;
			constructor(browserInput, session) {
				if (!isAuthenticGameSession(session)) throw new TypeError("game input bridge requires one exact GameSession");
				this.#session = session;
				const capability = createArenaInputCommitSinkCapability((receipt) => this.#deliver(receipt));
				this.#subscription = subscribeArenaInputCommits(browserInput, capability);
				Object.freeze(this);
			}
			#deliver(receipt) {
				if (!this.#active) throw new Error("game input bridge is unsubscribed");
				if (this.#deliveries.length >= MAX_DELIVERIES) throw new RangeError("game input bridge delivery bound exceeded");
				const payload = consumeArenaInputCommitReceipt(receipt);
				const command = {
					cardId: payload.cardId,
					commandId: payload.commandId,
					point: clone$1(payload.point),
					slot: payload.slot,
					...payload.type === "spell" ? { side: "south" } : {},
					tick: payload.tick,
					type: payload.type
				};
				const before = this.#session.serialize();
				let admission;
				try {
					admission = this.#session.submitPlayerCommand(canonical$3(command));
				} catch (error) {
					if (this.#session.serialize() !== before) {
						this.#active = false;
						throw new AggregateError([error], "game input bridge session submission split authority");
					}
					throw error;
				}
				this.#deliveries.push(freeze$2({
					admission: clone$1(admission),
					command
				}));
				return admission;
			}
			get state() {
				return freeze$2({
					active: this.#active,
					deliveries: clone$1(this.#deliveries)
				});
			}
			serialize() {
				return canonical$3({
					deliveries: this.#deliveries,
					version: 1
				});
			}
			unsubscribe() {
				if (!this.#active) return false;
				this.#active = false;
				unsubscribeArenaInputCommits(this.#subscription);
				return true;
			}
			static restore(bytes, browserInput, session) {
				const snapshot = checkedSnapshot(bytes);
				if (!isAuthenticGameSession(session)) throw new TypeError("game input bridge restore requires one exact GameSession");
				const transcript = JSON.parse(session.serialize()).transcript;
				for (const delivery of snapshot.deliveries) if (!transcript.some((operation) => operation.type === "submit" && canonical$3(operation.command) === canonical$3(delivery.command))) throw new TypeError("game input bridge history diverges from session");
				const bridge = new GameInputBridge(browserInput, session);
				bridge.#deliveries = snapshot.deliveries.map((delivery) => freeze$2(delivery));
				if (bridge.serialize() !== bytes) {
					bridge.unsubscribe();
					throw new TypeError("game input bridge snapshot did not restore canonically");
				}
				return bridge;
			}
		};
	})))();
}
//#endregion
//#region src/ui/hud-motion.js
function bindHudMotion(node, hud, receipt) {
	const opening = Math.max(0, 1 - hud.tick / 24);
	const age = receipt ? hud.tick - receipt.tick : 24;
	const arrival = age >= 0 ? Math.max(0, 1 - age / 18) : 0;
	node.dataset.arrivalSlot = String(receipt?.slot ?? -1);
	node.style.setProperty("--opening-offset", `${opening * 14}px`);
	node.style.setProperty("--arrival-offset", `${arrival * 22}px`);
	node.style.setProperty("--arrival-tilt", `${arrival * -8}deg`);
	node.style.setProperty("--spend-scale", String(1 + arrival * .16));
	const progress = node.ownerDocument.createElement("span");
	progress.className = "hud-resource-progress";
	progress.setAttribute("aria-hidden", "true");
	progress.style.setProperty("--resource-percent", `${(hud.elixir.amount + hud.elixir.accumulator / ELIXIR_ACCUMULATOR_DENOMINATOR) * 10}%`);
	node.appendChild(progress);
}
var HUD_MOTION_STYLE;
function init_hud_motion() {
	return (init_hud_motion = __esmMin((() => {
		init_elixir();
		HUD_MOTION_STYLE = `
.game-ui-hud-frame [data-ui="hud-hand"]{transform:translateY(var(--opening-offset))}
${[
			0,
			1,
			2,
			3
		].map((slot) => `.game-ui-hud-frame[data-arrival-slot="${slot}"] .hud-card[data-slot="${slot}"]{transform:translateY(var(--arrival-offset)) rotate(var(--arrival-tilt));transform-origin:50% 100%}`).join("")}
.game-ui-hud-frame [data-ui="hud-elixir"]{transform:scale(var(--spend-scale))}
.hud-resource-progress{position:absolute;left:115px;top:1251px;width:496px;height:22px;pointer-events:none;z-index:17;border-radius:7px;background:#5B4B8A;clip-path:inset(0 calc(100% - var(--resource-percent)) 0 0 round 7px);box-shadow:inset 0 3px #DCEDE9}
@media(prefers-reduced-motion:reduce){.game-ui-hud-frame [data-ui="hud-hand"],.game-ui-hud-frame .hud-card[data-slot],.game-ui-hud-frame [data-ui="hud-elixir"]{transform:none!important}}
`;
	})))();
}
//#endregion
//#region src/ui/hud-state.js
function dataObject(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain data object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors);
	if (actual.length !== keys.length || actual.some((key) => typeof key !== "string" || !keys.includes(key))) throw new TypeError(`${label} has an invalid shape`);
	const copy = {};
	for (const key of keys) {
		const descriptor = descriptors[key];
		if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
		copy[key] = descriptor.value;
	}
	return copy;
}
function dataArray(value, length, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== length || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain array of length ${length}`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const allowed = /* @__PURE__ */ new Set(["length", ...Array.from({ length }, (_, index) => String(index))]);
	if (Reflect.ownKeys(descriptors).some((key) => !allowed.has(key))) throw new TypeError(`${label} must contain only indexed data`);
	return Array.from({ length }, (_, index) => {
		const descriptor = descriptors[String(index)];
		if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}[${index}] must be an enumerable data property`);
		return descriptor.value;
	});
}
function integer$1(value, minimum, maximum, label) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a safe integer from ${minimum} to ${maximum}`);
	return value;
}
function cardId(value, label) {
	if (typeof value !== "string" || !CARD_ID.test(value) || value.length > 80) throw new TypeError(`${label} must be an original kebab-case card id`);
	return value;
}
function displayName(value, label) {
	if (typeof value !== "string" || value.length < 1 || value.length > 80 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) throw new TypeError(`${label} must be a bounded display name`);
	return value;
}
function checkedCards(value) {
	const cards = dataArray(value, 8, "cards").map((raw, index) => {
		const card = dataObject(raw, [
			"cost",
			"displayName",
			"id"
		], `cards[${index}]`);
		return {
			cost: integer$1(card.cost, 1, ELIXIR_CAPACITY, `cards[${index}].cost`),
			displayName: displayName(card.displayName, `cards[${index}].displayName`),
			id: cardId(card.id, `cards[${index}].id`)
		};
	});
	if (new Set(cards.map(({ id }) => id)).size !== 8) throw new TypeError("cards must have eight unique ids");
	return cards;
}
function checkedDeck(value, catalogIds) {
	const deck = dataObject(value, [
		"hand",
		"next",
		"queue",
		"sequence"
	], "deck");
	const hand = dataArray(deck.hand, 4, "deck.hand").map((id, index) => cardId(id, `deck.hand[${index}]`));
	const queue = dataArray(deck.queue, 4, "deck.queue").map((id, index) => cardId(id, `deck.queue[${index}]`));
	const all = [...hand, ...queue];
	if (new Set(all).size !== 8 || all.some((id) => !catalogIds.has(id))) throw new TypeError("deck hand and queue must partition the card catalog");
	if (deck.next !== queue[0]) throw new TypeError("deck.next must equal deck.queue[0]");
	return {
		hand,
		next: deck.next,
		sequence: integer$1(deck.sequence, 0, DECK_MAX_PLAY_COMMANDS, "deck.sequence")
	};
}
function checkedElixir(value) {
	const elixir = dataObject(value, ["sides", "tick"], "elixir");
	const sides = dataObject(elixir.sides, SIDES, "elixir.sides");
	const checkedSides = {};
	for (const side of SIDES) {
		const state = dataObject(sides[side], ["accumulator", "amount"], `elixir.sides.${side}`);
		const amount = integer$1(state.amount, 0, ELIXIR_CAPACITY, `elixir.sides.${side}.amount`);
		const accumulator = integer$1(state.accumulator, 0, ELIXIR_ACCUMULATOR_DENOMINATOR - 1, `elixir.sides.${side}.accumulator`);
		if (amount === ELIXIR_CAPACITY && accumulator !== 0) throw new TypeError(`elixir.sides.${side} cannot progress at capacity`);
		checkedSides[side] = {
			accumulator,
			amount
		};
	}
	return {
		sides: checkedSides,
		tick: integer$1(elixir.tick, 0, MATCH_MAX_TICKS, "elixir.tick")
	};
}
function checkedCrowns(value) {
	const crowns = dataObject(value, SIDES, "match.crowns");
	return {
		north: integer$1(crowns.north, 0, 3, "match.crowns.north"),
		south: integer$1(crowns.south, 0, 3, "match.crowns.south")
	};
}
function checkedMatch(value) {
	const match = dataObject(value, MATCH_KEYS, "match");
	const tick = integer$1(match.tick, 0, MATCH_MAX_TICKS, "match.tick");
	const crowns = checkedCrowns(match.crowns);
	if (![
		"regulation",
		"overtime",
		"ended"
	].includes(match.phase)) throw new TypeError("match.phase is invalid");
	if (match.phase === "regulation" && tick >= MATCH_REGULATION_TICKS || match.phase === "overtime" && (tick < MATCH_REGULATION_TICKS || tick >= MATCH_MAX_TICKS)) throw new TypeError("match.phase is inconsistent with match.tick");
	if (match.phase === "ended" !== (match.result !== null)) throw new TypeError("match.result must exist exactly when the match ended");
	const towers = dataArray(match.towers, TOWER_IDS$2.length, "match.towers");
	const destroyed = [];
	towers.forEach((raw, index) => {
		const tower = dataObject(raw, ["hitpoints", "id"], `match.towers[${index}]`);
		if (tower.id !== TOWER_IDS$2[index]) throw new TypeError(`match.towers[${index}].id is out of order`);
		integer$1(tower.hitpoints, 0, Number.MAX_SAFE_INTEGER, `match.towers[${index}].hitpoints`);
		if (tower.hitpoints === 0) destroyed.push(tower.id);
	});
	if (dataArray(match.destroyedTowerIds, destroyed.length, "match.destroyedTowerIds").some((id, index) => id !== destroyed[index])) throw new TypeError("match.destroyedTowerIds must match zero-hitpoint towers");
	const derivedCrowns = {
		north: 0,
		south: 0
	};
	for (const id of destroyed) {
		const scorer = (id.startsWith("north:") ? "north" : "south") === "north" ? "south" : "north";
		if (id.endsWith(":central")) derivedCrowns[scorer] = 3;
		else if (derivedCrowns[scorer] < 3) derivedCrowns[scorer] += 1;
	}
	if (crowns.north !== derivedCrowns.north || crowns.south !== derivedCrowns.south) throw new TypeError("match.crowns must be derived from destroyed towers");
	if (match.result !== null) {
		const result = dataObject(match.result, [
			"crowns",
			"endedAtTick",
			"kind",
			"reason",
			"winner"
		], "match.result");
		const resultCrowns = checkedCrowns(result.crowns);
		if (resultCrowns.north !== crowns.north || resultCrowns.south !== crowns.south || !Number.isSafeInteger(result.endedAtTick) || result.endedAtTick < 0 || result.endedAtTick > tick || !["win", "draw"].includes(result.kind) || ![null, ...SIDES].includes(result.winner) || result.kind === "draw" !== (result.winner === null) || typeof result.reason !== "string" || result.reason.length < 1 || result.reason.length > 80) throw new TypeError("match.result is inconsistent");
	}
	return {
		crowns,
		phase: match.phase,
		tick
	};
}
function formatClock(remainingTicks) {
	const seconds = Math.ceil(remainingTicks / MATCH_TICKS_PER_SECOND);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function freezeView(value) {
	if (Array.isArray(value)) value.forEach(freezeView);
	else if (value !== null && typeof value === "object") Object.values(value).forEach(freezeView);
	return Object.freeze(value);
}
/**
* Pure, bounded projection from canonical match/deck/elixir JSON state.
* Selection is local UI state and never mutates any supplied snapshot.
*/
function createHudViewModel(input) {
	const options = dataObject(input, [
		"cards",
		"deck",
		"elixir",
		"localSide",
		"match",
		"selectedCardId"
	], "HUD input");
	if (!SIDE_SET.has(options.localSide)) throw new TypeError("localSide must be north or south");
	const cards = checkedCards(options.cards);
	const byId = new Map(cards.map((card) => [card.id, card]));
	const deck = checkedDeck(options.deck, new Set(byId.keys()));
	const elixir = checkedElixir(options.elixir);
	const match = checkedMatch(options.match);
	if (match.tick !== elixir.tick) throw new TypeError("match and elixir ticks must agree");
	if (options.selectedCardId !== null && (typeof options.selectedCardId !== "string" || !deck.hand.includes(options.selectedCardId))) throw new TypeError("selectedCardId must be null or a card in hand");
	const localElixir = elixir.sides[options.localSide];
	const clockEnd = match.phase === "regulation" ? MATCH_REGULATION_TICKS : MATCH_MAX_TICKS;
	const remainingTicks = match.phase === "ended" ? 0 : Math.max(0, clockEnd - match.tick);
	const hand = deck.hand.map((id, slot) => {
		const card = byId.get(id);
		const insufficient = card.cost > localElixir.amount;
		return {
			cost: card.cost,
			disabled: match.phase === "ended" || insufficient,
			displayName: card.displayName,
			id,
			insufficient,
			selected: options.selectedCardId === id,
			slot
		};
	});
	const next = byId.get(deck.next);
	const view = {
		crowns: match.crowns,
		deckSequence: deck.sequence,
		elixir: {
			accumulator: localElixir.accumulator,
			amount: localElixir.amount,
			capacity: ELIXIR_CAPACITY,
			side: options.localSide
		},
		hand,
		next: {
			cost: next.cost,
			displayName: next.displayName,
			id: next.id
		},
		phase: match.phase,
		tick: match.tick,
		timer: {
			remainingTicks,
			text: formatClock(remainingTicks)
		},
		version: 1
	};
	CANONICAL_VIEWS$1.add(view);
	return freezeView(view);
}
function serializeHudViewModel(viewModel) {
	return JSON.stringify(checkedViewModel(viewModel));
}
function escapeHtml(value) {
	let escaped = "";
	for (const character of value) {
		const code = character.codePointAt(0);
		if (code === 38) escaped += "&amp;";
		else if (code === 60) escaped += "&lt;";
		else if (code === 62) escaped += "&gt;";
		else if (code === 34) escaped += "&quot;";
		else if (code === 39) escaped += "&#39;";
		else escaped += character;
	}
	return escaped;
}
function cardMarkup(card, kind) {
	const flags = kind === "hand" ? ` data-disabled="${card.disabled}" data-insufficient="${card.insufficient}" data-selected="${card.selected}" data-slot="${card.slot}"` : "";
	return `<span class="hud-card" data-card-id="${escapeHtml(card.id)}" data-kind="${kind}"${flags}><b class="hud-card__cost">${card.cost}</b><span class="hud-card__name">${escapeHtml(card.displayName)}</span></span>`;
}
function getHudMarkup(viewModel) {
	const view = checkedViewModel(viewModel);
	return `<section data-ui="hud-projection" data-phase="${view.phase}" data-tick="${view.tick}"><time data-ui="hud-timer">${view.timer.text}</time><span data-ui="hud-crowns" data-north="${view.crowns.north}" data-south="${view.crowns.south}"></span><span data-ui="hud-elixir" data-accumulator="${view.elixir.accumulator}" data-amount="${view.elixir.amount}" data-side="${view.elixir.side}"></span><div data-ui="hud-next">${cardMarkup(view.next, "next")}</div><div data-ui="hud-hand">${view.hand.map((card) => cardMarkup(card, "hand")).join("")}</div></section>`;
}
function checkedViewModel(value) {
	if (value === null || typeof value !== "object" || !CANONICAL_VIEWS$1.has(value)) throw new TypeError("viewModel must come from createHudViewModel");
	return value;
}
function callable(value, key, label) {
	const method = value[key];
	if (typeof method !== "function") throw new TypeError(`${label}.${key} must be callable`);
	return method;
}
function exactNodeList(value, count, label) {
	if (value === null || typeof value !== "object" && typeof value !== "function") throw new TypeError(`${label} must be a node collection`);
	const length = value.length;
	if (!Number.isSafeInteger(length) || length !== count) throw new TypeError(`${label} is missing or duplicated; expected exactly ${count} targets`);
	const nodes = [];
	for (let index = 0; index < count; index += 1) {
		const node = value[index];
		if (node === null || typeof node !== "object" && typeof node !== "function") throw new TypeError(`${label}[${index}] must be a node`);
		nodes.push(node);
	}
	if (new Set(nodes).size !== count) throw new TypeError(`${label} targets must be unique`);
	return nodes;
}
function selectExact(target, querySelectorAll, selector, count, label) {
	return exactNodeList(querySelectorAll.call(target, selector), count, label);
}
function mutableRecord(value, label) {
	if (value === null || typeof value !== "object" && typeof value !== "function") throw new TypeError(`${label} must be mutable`);
	return value;
}
function requireMutableSlot(value, key, label) {
	if (!(key in value)) throw new TypeError(`${label}.${key} must be a mutable property`);
}
function checkedShell(target) {
	if (target === null || typeof target !== "object" && typeof target !== "function") throw new TypeError("HUD target must be a mounted arena shell");
	const querySelectorAll = callable(target, "querySelectorAll", "HUD target");
	const timer = selectExact(target, querySelectorAll, "[data-ui=\"timer\"]", 1, "HUD timer hooks")[0];
	const north = selectExact(target, querySelectorAll, "[data-ui=\"opponent-hud\"] .crown-track", 1, "HUD opponent crown hooks")[0];
	const south = selectExact(target, querySelectorAll, "[data-ui=\"player-hud\"] .crown-track", 1, "HUD player crown hooks")[0];
	const hand = selectExact(target, querySelectorAll, "[data-ui=\"card-slot\"]", 4, "HUD hand hooks");
	const next = selectExact(target, querySelectorAll, "[data-ui=\"next-card\"]", 1, "HUD next-card hooks")[0];
	const rail = selectExact(target, querySelectorAll, "[data-ui=\"elixir-rail\"]", 1, "HUD elixir hooks")[0];
	const railQuerySelectorAll = callable(rail, "querySelectorAll", "HUD elixir hook");
	const fill = selectExact(rail, railQuerySelectorAll, ".elixir-fill", 1, "HUD elixir fill hooks")[0];
	const output = selectExact(rail, railQuerySelectorAll, "output", 1, "HUD elixir output hooks")[0];
	const northQuerySelectorAll = callable(north, "querySelectorAll", "HUD opponent crown hook");
	const southQuerySelectorAll = callable(south, "querySelectorAll", "HUD player crown hook");
	const opponentCrowns = selectExact(north, northQuerySelectorAll, "i", 3, "HUD opponent crown markers");
	const playerCrowns = selectExact(south, southQuerySelectorAll, "i", 3, "HUD player crown markers");
	const allTargets = [
		timer,
		north,
		south,
		...hand,
		next,
		rail,
		fill,
		output,
		...opponentCrowns,
		...playerCrowns
	];
	if (new Set(allTargets).size !== allTargets.length) throw new TypeError("HUD hooks must resolve to distinct targets");
	const datasets = /* @__PURE__ */ new Map();
	for (const [label, node] of [
		["HUD timer dataset", timer],
		...opponentCrowns.map((node) => ["HUD opponent crown dataset", node]),
		...playerCrowns.map((node) => ["HUD player crown dataset", node]),
		...hand.map((node) => ["HUD hand dataset", node]),
		["HUD next-card dataset", next],
		["HUD elixir dataset", rail]
	]) datasets.set(node, mutableRecord(node.dataset, label));
	const fillStyle = mutableRecord(fill.style, "HUD elixir fill style");
	requireMutableSlot(timer, "textContent", "HUD timer hook");
	hand.forEach((node, index) => {
		requireMutableSlot(node, "innerHTML", `HUD hand hook ${index}`);
	});
	requireMutableSlot(next, "innerHTML", "HUD next-card hook");
	requireMutableSlot(fillStyle, "width", "HUD elixir fill style");
	requireMutableSlot(output, "value", "HUD elixir output hook");
	requireMutableSlot(output, "textContent", "HUD elixir output hook");
	return {
		datasets,
		fill,
		fillStyle,
		hand,
		next,
		opponentCrowns,
		output,
		playerCrowns,
		rail,
		timer
	};
}
function propertyMutation(target, key, value, deleteIfAbsent = false) {
	const hadOwnProperty = Object.hasOwn(target, key);
	const previous = target[key];
	return {
		apply() {
			target[key] = value;
		},
		rollback() {
			if (deleteIfAbsent && !hadOwnProperty) delete target[key];
			else target[key] = previous;
		}
	};
}
function applyTransaction(mutations) {
	const attempted = [];
	try {
		for (const mutation of mutations) {
			attempted.push(mutation);
			mutation.apply();
		}
	} catch (error) {
		let rollbackError = null;
		for (let index = attempted.length - 1; index >= 0; index -= 1) try {
			attempted[index].rollback();
		} catch (caught) {
			rollbackError ??= caught;
		}
		if (rollbackError !== null) throw new AggregateError([error, rollbackError], "HUD binding failed and could not be fully rolled back");
		throw error;
	}
}
/**
* Bind one already-validated projection. All target discovery and markup
* generation completes before the first DOM mutation.
*/
function bindHudViewModel(target, viewModel) {
	const view = checkedViewModel(viewModel);
	const nodes = checkedShell(target);
	const handMarkup = view.hand.map((card) => cardMarkup(card, "hand"));
	const nextMarkup = cardMarkup(view.next, "next");
	const fillUnits = view.elixir.amount * ELIXIR_ACCUMULATOR_DENOMINATOR + view.elixir.accumulator;
	const fillMaximum = ELIXIR_CAPACITY * ELIXIR_ACCUMULATOR_DENOMINATOR;
	const fillPercent = (fillUnits * 100 / fillMaximum).toFixed(6);
	const opponentSide = view.elixir.side === "south" ? "north" : "south";
	const mutations = [
		propertyMutation(nodes.timer, "textContent", view.timer.text),
		propertyMutation(nodes.datasets.get(nodes.timer), "phase", view.phase, true),
		propertyMutation(nodes.datasets.get(nodes.timer), "tick", String(view.tick), true)
	];
	nodes.opponentCrowns.forEach((node, index) => {
		mutations.push(propertyMutation(nodes.datasets.get(node), "earned", String(index < view.crowns[opponentSide]), true));
	});
	nodes.playerCrowns.forEach((node, index) => {
		mutations.push(propertyMutation(nodes.datasets.get(node), "earned", String(index < view.crowns[view.elixir.side]), true));
	});
	nodes.hand.forEach((node, index) => {
		const dataset = nodes.datasets.get(node);
		mutations.push(propertyMutation(node, "innerHTML", handMarkup[index]), propertyMutation(dataset, "cardId", view.hand[index].id, true), propertyMutation(dataset, "disabled", String(view.hand[index].disabled), true), propertyMutation(dataset, "insufficient", String(view.hand[index].insufficient), true), propertyMutation(dataset, "selected", String(view.hand[index].selected), true));
	});
	const nextDataset = nodes.datasets.get(nodes.next);
	const railDataset = nodes.datasets.get(nodes.rail);
	mutations.push(propertyMutation(nodes.next, "innerHTML", nextMarkup), propertyMutation(nextDataset, "cardId", view.next.id, true), propertyMutation(railDataset, "side", view.elixir.side, true), propertyMutation(railDataset, "amount", String(view.elixir.amount), true), propertyMutation(railDataset, "accumulator", String(view.elixir.accumulator), true), propertyMutation(nodes.fillStyle, "width", `${fillPercent}%`), propertyMutation(nodes.output, "value", String(view.elixir.amount)), propertyMutation(nodes.output, "textContent", String(view.elixir.amount)));
	applyTransaction(mutations);
	return target;
}
var SIDES, SIDE_SET, CARD_ID, MATCH_KEYS, TOWER_IDS$2, CANONICAL_VIEWS$1;
function init_hud_state() {
	return (init_hud_state = __esmMin((() => {
		init_match();
		init_elixir();
		init_deck();
		SIDES = Object.freeze(["north", "south"]);
		SIDE_SET = new Set(SIDES);
		CARD_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
		MATCH_KEYS = Object.freeze([
			"crowns",
			"destroyedTowerIds",
			"phase",
			"result",
			"tick",
			"towers"
		]);
		TOWER_IDS$2 = Object.freeze([
			"north:central",
			"north:lane:left",
			"north:lane:right",
			"south:central",
			"south:lane:left",
			"south:lane:right"
		]);
		CANONICAL_VIEWS$1 = /* @__PURE__ */ new WeakSet();
	})))();
}
//#endregion
//#region src/ui/match-feedback.js
function getMatchFeedbackStyleText() {
	return STYLE_TEXT + LIFECYCLE_STYLE + HUD_MOTION_STYLE;
}
function record(value, keys, label) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain data object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors).sort();
	const wanted = [...keys].sort();
	if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new TypeError(`${label} has an invalid shape`);
	const result = {};
	for (const key of keys) {
		const descriptor = descriptors[key];
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
		result[key] = descriptor.value;
	}
	return result;
}
function array(value, maximum, label) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0 || value.length > maximum) throw new TypeError(`${label} must be a plain array of at most ${maximum} items`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	for (const key of Reflect.ownKeys(descriptors)) {
		if (key === "length") continue;
		if (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length) throw new TypeError(`${label} must contain only indexed data`);
	}
	return Array.from({ length: value.length }, (_, index) => {
		const descriptor = descriptors[String(index)];
		if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}[${index}] must be an enumerable data property`);
		return descriptor.value;
	});
}
function integer(value, minimum, maximum, label) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a safe integer from ${minimum} through ${maximum}`);
	return value;
}
function side(value, nullable, label) {
	if (nullable && value === null || value === "north" || value === "south") return value;
	throw new TypeError(`${label} must be north${nullable ? ", south, or null" : " or south"}`);
}
function towerIds(value, label) {
	const ids = array(value, TOWER_IDS$1.length, label);
	let previous = -1;
	return ids.map((id, index) => {
		const order = TOWER_IDS$1.indexOf(id);
		if (typeof id !== "string" || order < 0 || order <= previous) throw new TypeError(`${label}[${index}] must use unique canonical tower order`);
		previous = order;
		return id;
	});
}
function crowns(value, label) {
	const checked = record(value, ["north", "south"], label);
	return {
		north: integer(checked.north, 0, 3, `${label}.north`),
		south: integer(checked.south, 0, 3, `${label}.south`)
	};
}
function result(value, label) {
	if (value === null) return null;
	const checked = record(value, [
		"crowns",
		"endedAtTick",
		"kind",
		"reason",
		"winner"
	], label);
	const checkedCrowns = crowns(checked.crowns, `${label}.crowns`);
	if (checked.kind !== "win" && checked.kind !== "draw") throw new TypeError(`${label}.kind is invalid`);
	if (!REASONS.has(checked.reason)) throw new TypeError(`${label}.reason is invalid`);
	const winner = side(checked.winner, true, `${label}.winner`);
	if (checked.kind === "draw" !== (winner === null)) throw new TypeError(`${label} kind and winner disagree`);
	return {
		crowns: checkedCrowns,
		endedAtTick: integer(checked.endedAtTick, 0, 18e3, `${label}.endedAtTick`),
		kind: checked.kind,
		reason: checked.reason,
		winner
	};
}
function checkedState(value) {
	const state = record(value, [
		"crowns",
		"destroyedTowerIds",
		"phase",
		"result",
		"tick",
		"towers"
	], "match state");
	const tick = integer(state.tick, 0, 18e3, "match state.tick");
	if (!PHASES.has(state.phase)) throw new TypeError("match state.phase is invalid");
	const checkedCrowns = crowns(state.crowns, "match state.crowns");
	const towers = array(state.towers, TOWER_IDS$1.length, "match state.towers").map((value, index) => {
		const tower = record(value, ["hitpoints", "id"], `match state.towers[${index}]`);
		if (tower.id !== TOWER_IDS$1[index]) throw new TypeError(`match state.towers[${index}].id is noncanonical`);
		return {
			hitpoints: integer(tower.hitpoints, 0, Number.MAX_SAFE_INTEGER, `match state.towers[${index}].hitpoints`),
			id: tower.id
		};
	});
	if (towers.length !== TOWER_IDS$1.length) throw new TypeError("match state must contain all six towers");
	const destroyedTowerIds = towerIds(state.destroyedTowerIds, "match state.destroyedTowerIds");
	const zeros = towers.filter(({ hitpoints }) => hitpoints === 0).map(({ id }) => id);
	if (canonicalJson$2(destroyedTowerIds) !== canonicalJson$2(zeros)) throw new TypeError("match state destroyed towers disagree with hitpoints");
	const scored = {
		north: 0,
		south: 0
	};
	for (const id of destroyedTowerIds) {
		const scorer = id.startsWith("north:") ? "south" : "north";
		scored[scorer] = id.endsWith(":central") ? 3 : Math.min(3, scored[scorer] + 1);
	}
	if (canonicalJson$2(scored) !== canonicalJson$2(checkedCrowns)) throw new TypeError("match state crowns disagree with destroyed towers");
	const checkedResult = result(state.result, "match state.result");
	if (state.phase === "ended" !== (checkedResult !== null)) throw new TypeError("match state phase and result disagree");
	if (checkedResult && (canonicalJson$2(checkedResult.crowns) !== canonicalJson$2(checkedCrowns) || checkedResult.endedAtTick > tick)) throw new TypeError("match state result disagrees with current state");
	return {
		crowns: checkedCrowns,
		destroyedTowerIds,
		phase: state.phase,
		result: checkedResult,
		tick,
		towers
	};
}
function checkedEvents(value, state) {
	const events = array(value, MATCH_FEEDBACK_EVENT_LIMIT, "match events");
	const sequences = /* @__PURE__ */ new Set();
	let priorTick = -1;
	let priorEvidenceSequence = -1;
	let priorEvidenceTick = -1;
	return events.map((raw, index) => {
		const base = record(raw, Object.keys(raw), `match events[${index}]`);
		if (typeof base.type !== "string") throw new TypeError(`match events[${index}].type is invalid`);
		let event;
		if (base.type === "tower_evidence" && base.accepted === true) {
			event = record(raw, [
				"accepted",
				"destroyedTowerIds",
				"sequence",
				"tick",
				"type"
			], `match events[${index}]`);
			event.destroyedTowerIds = towerIds(event.destroyedTowerIds, `match events[${index}].destroyedTowerIds`);
		} else if (base.type === "tower_evidence" && base.accepted === false) {
			event = record(raw, [
				"accepted",
				"reason",
				"sequence",
				"tick",
				"type"
			], `match events[${index}]`);
			if (event.reason !== "match_ended") throw new TypeError(`match events[${index}].reason is invalid`);
		} else if (base.type === "overtime_started") {
			event = record(raw, ["tick", "type"], `match events[${index}]`);
			if (event.tick !== 10800) throw new TypeError("overtime must start at tick 10800");
		} else if (base.type === "match_end") {
			event = record(raw, [
				"result",
				"tick",
				"type"
			], `match events[${index}]`);
			event.result = result(event.result, `match events[${index}].result`);
			if (event.result === null || event.result.endedAtTick !== event.tick) throw new TypeError("match end result is noncanonical");
		} else if (base.type === "tiebreak") {
			event = record(raw, [
				"drainedTowerIds",
				"minima",
				"result",
				"tick",
				"type"
			], `match events[${index}]`);
			event.drainedTowerIds = towerIds(event.drainedTowerIds, `match events[${index}].drainedTowerIds`);
			const minima = record(event.minima, ["north", "south"], `match events[${index}].minima`);
			event.minima = {
				north: integer(minima.north, 1, Number.MAX_SAFE_INTEGER, `match events[${index}].minima.north`),
				south: integer(minima.south, 1, Number.MAX_SAFE_INTEGER, `match events[${index}].minima.south`)
			};
			event.result = result(event.result, `match events[${index}].result`);
			if (event.tick !== 18e3 || event.result?.endedAtTick !== 18e3) throw new TypeError("tiebreak is noncanonical");
		} else throw new TypeError(`match events[${index}].type is invalid`);
		event.tick = integer(event.tick, 0, state.tick, `match events[${index}].tick`);
		if (event.tick < priorTick) throw new TypeError("match event ticks must be nondecreasing");
		if (event.type === "tower_evidence") {
			event.sequence = integer(event.sequence, 0, 9999, `match events[${index}].sequence`);
			if (sequences.has(event.sequence)) throw new TypeError("match evidence sequences must be unique");
			if (event.tick === priorEvidenceTick && event.sequence <= priorEvidenceSequence) throw new TypeError("same-tick match evidence must use sequence order");
			sequences.add(event.sequence);
			priorEvidenceTick = event.tick;
			priorEvidenceSequence = event.sequence;
		}
		priorTick = event.tick;
		return event;
	});
}
function freeze$1(value) {
	if (value && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) freeze$1(child);
		Object.freeze(value);
	}
	return value;
}
function canonicalJson$2(value) {
	if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number") {
		if (!Number.isSafeInteger(value)) throw new TypeError("match feedback numbers must be safe integers");
		return String(value);
	}
	if (Array.isArray(value)) return `[${value.map(canonicalJson$2).join(",")}]`;
	if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$2(value[key])}`).join(",")}}`;
	throw new TypeError("match feedback contains an unsupported value");
}
function checkedCausalSource(value, state, events) {
	const source = record(value, ["replayBytes", "snapshot"], "match causal source");
	if (typeof source.snapshot !== "string" || source.snapshot.length > 4e6) throw new TypeError("match causal snapshot must be a bounded string");
	if (typeof source.replayBytes !== "string" || source.replayBytes.length > 4e6) throw new TypeError("match causal replay bytes must be a bounded string");
	const restored = MatchClock.restore(source.snapshot);
	if (restored.serialize() !== source.snapshot) throw new TypeError("match causal snapshot must use canonical encoding");
	if (restored.replayBytes() !== source.replayBytes) throw new TypeError("match causal replay bytes disagree with the snapshot");
	if (!same(restored.state, state) || !same(restored.eventLog, events)) throw new TypeError("match causal source disagrees with projected state or events");
	let preTiebreakTowers = JSON.parse(source.snapshot).initialTowers;
	for (const entry of restored.replayLog) if (entry.event.accepted && entry.command.tick < 18e3) preTiebreakTowers = entry.command.evidence.towers;
	return {
		preTiebreakTowers,
		replayBytes: source.replayBytes,
		snapshot: source.snapshot
	};
}
function same(left, right) {
	return canonicalJson$2(left) === canonicalJson$2(right);
}
function resultFromLosses(crownsValue, losingSides, reason, tick) {
	let kind;
	let winner;
	if (losingSides.size === 2) {
		if (crownsValue.north === crownsValue.south) {
			kind = "draw";
			winner = null;
		} else {
			kind = "win";
			winner = crownsValue.north > crownsValue.south ? "north" : "south";
		}
	} else {
		kind = "win";
		winner = losingSides.has("north") ? "south" : "north";
	}
	return {
		crowns: { ...crownsValue },
		endedAtTick: tick,
		kind,
		reason,
		winner
	};
}
function awardCrowns(crownsValue, ids) {
	for (const id of ids) {
		const scorer = id.startsWith("north:") ? "south" : "north";
		crownsValue[scorer] = id.endsWith(":central") ? 3 : Math.min(3, crownsValue[scorer] + 1);
	}
}
function deriveTiebreak(event, state, destroyed, crownsValue, preTiebreakTowers) {
	const losingSides = event.minima.north === event.minima.south ? /* @__PURE__ */ new Set(["north", "south"]) : /* @__PURE__ */ new Set([event.minima.north < event.minima.south ? "north" : "south"]);
	const hitpoints = new Map(preTiebreakTowers.map((tower) => [tower.id, tower.hitpoints]));
	for (const id of event.drainedTowerIds) if (destroyed.has(id) || !losingSides.has(id.startsWith("north:") ? "north" : "south")) throw new TypeError("tiebreak drained towers are causally impossible");
	const expectedDrained = [];
	for (const sideName of ["north", "south"]) {
		const alive = TOWER_IDS$1.filter((id) => id.startsWith(`${sideName}:`) && !destroyed.has(id));
		if (alive.length === 0) throw new TypeError("tiebreak requires a surviving tower on each side");
		const values = alive.map((id) => hitpoints.get(id));
		if (values.some((value) => !Number.isSafeInteger(value) || value <= 0)) throw new TypeError("tiebreak tower hitpoints are causally impossible");
		if (Math.min(...values) !== event.minima[sideName]) throw new TypeError("tiebreak minima disagree with canonical tower hitpoints");
		if (losingSides.has(sideName)) expectedDrained.push(...alive.filter((id) => hitpoints.get(id) === event.minima[sideName]));
	}
	if (!same(expectedDrained, event.drainedTowerIds)) throw new TypeError("tiebreak drained towers disagree with minima");
	for (const tower of state.towers) {
		const expected = event.drainedTowerIds.includes(tower.id) ? 0 : hitpoints.get(tower.id);
		if (tower.hitpoints !== expected) throw new TypeError("terminal tower hitpoints disagree with the causal tiebreak drain");
	}
	awardCrowns(crownsValue, event.drainedTowerIds);
	const winner = losingSides.size === 2 ? null : losingSides.has("north") ? "south" : "north";
	return {
		crowns: { ...crownsValue },
		endedAtTick: 18e3,
		kind: winner === null ? "draw" : "win",
		reason: winner === null ? "tiebreak_exact_tie" : "tiebreak_lowest_hp",
		winner
	};
}
function deriveMatch(events, state, causal) {
	const destroyed = /* @__PURE__ */ new Set();
	const crownsValue = {
		north: 0,
		south: 0
	};
	const effects = [];
	let currentTick = -1;
	let newlyAtTick = [];
	let overtime = false;
	let derivedResult = null;
	for (let ordinal = 0; ordinal < events.length; ordinal += 1) {
		const event = events[ordinal];
		if (event.tick !== currentTick) {
			if (derivedResult === null && newlyAtTick.length > 0 && (overtime || newlyAtTick.some((id) => id.endsWith(":central")))) throw new TypeError("match events omit a required destruction result");
			currentTick = event.tick;
			newlyAtTick = [];
		}
		if (event.type === "tower_evidence") {
			if (event.accepted) {
				if (derivedResult !== null || event.tick === 18e3) throw new TypeError("accepted tower evidence occurs after the match ended");
				for (const id of destroyed) if (!event.destroyedTowerIds.includes(id)) throw new TypeError("tower evidence revives a previously destroyed tower");
				const newlyDestroyed = [];
				for (const towerId of event.destroyedTowerIds) if (!destroyed.has(towerId)) {
					destroyed.add(towerId);
					newlyAtTick.push(towerId);
					newlyDestroyed.push(towerId);
					effects.push({
						ordinal,
						tick: event.tick,
						towerId,
						type: "tower_destroyed"
					});
				}
				awardCrowns(crownsValue, newlyDestroyed);
			} else if (derivedResult === null) throw new TypeError("rejected tower evidence precedes the match result");
			continue;
		}
		if (event.type === "overtime_started") {
			if (derivedResult !== null || overtime || crownsValue.north !== crownsValue.south) throw new TypeError("overtime transition is causally impossible");
			overtime = true;
			continue;
		}
		if (event.type === "match_end") {
			if (derivedResult !== null) throw new TypeError("match events contain multiple results");
			const losingSides = new Set(newlyAtTick.map((id) => id.startsWith("north:") ? "north" : "south"));
			if (newlyAtTick.some((id) => id.endsWith(":central"))) {
				if (event.tick >= 10800 && !overtime) throw new TypeError("match events omit the regulation boundary before destruction");
				derivedResult = resultFromLosses(crownsValue, losingSides, "central_destroyed", event.tick);
			} else if (overtime && newlyAtTick.length > 0) derivedResult = resultFromLosses(crownsValue, losingSides, "overtime_sudden_death", event.tick);
			else if (event.tick === 10800 && !overtime && crownsValue.north !== crownsValue.south) {
				const winner = crownsValue.north > crownsValue.south ? "north" : "south";
				derivedResult = {
					crowns: { ...crownsValue },
					endedAtTick: 10800,
					kind: "win",
					reason: "regulation_crowns",
					winner
				};
			} else throw new TypeError("match end has no canonical causal trigger");
			if (!same(derivedResult, event.result)) throw new TypeError("match end result disagrees with causal history");
			newlyAtTick = [];
			continue;
		}
		if (event.type === "tiebreak") {
			if (derivedResult !== null || !overtime || newlyAtTick.length > 0) throw new TypeError("tiebreak transition is causally impossible");
			derivedResult = deriveTiebreak(event, state, destroyed, crownsValue, causal.preTiebreakTowers);
			if (!same(derivedResult, event.result)) throw new TypeError("tiebreak result disagrees with causal history");
			for (const towerId of event.drainedTowerIds) {
				destroyed.add(towerId);
				effects.push({
					ordinal,
					tick: event.tick,
					towerId,
					type: "tower_destroyed"
				});
			}
		}
	}
	if (derivedResult === null && newlyAtTick.length > 0 && (overtime || newlyAtTick.some((id) => id.endsWith(":central")))) throw new TypeError("match events omit a required destruction result");
	if (!same([...destroyed].sort((a, b) => TOWER_IDS$1.indexOf(a) - TOWER_IDS$1.indexOf(b)), state.destroyedTowerIds)) throw new TypeError("match events do not account for canonical destroyed towers");
	if (!same(crownsValue, state.crowns)) throw new TypeError("match events do not account for canonical crowns");
	if (!same(derivedResult, state.result)) throw new TypeError("match events do not account for canonical result");
	if (derivedResult === null) {
		const expectedPhase = overtime ? "overtime" : "regulation";
		if (state.phase !== expectedPhase) throw new TypeError("match events do not account for canonical phase");
		if (state.tick >= 10800 && !overtime) throw new TypeError("match events omit the regulation boundary result");
		if (state.tick === 18e3) throw new TypeError("match events omit the terminal tiebreak");
	} else if (state.phase !== "ended") throw new TypeError("match result requires ended phase");
	return { effects };
}
function buildView(state, events, causal) {
	const { effects } = deriveMatch(events, state, causal);
	const view = {
		crowns: state.crowns,
		effects,
		overlay: state.result === null ? null : {
			crowns: state.result.crowns,
			endedAtTick: state.result.endedAtTick,
			kind: state.result.kind,
			reason: state.result.reason,
			winner: state.result.winner
		},
		phase: state.phase,
		tick: state.tick,
		version: 1
	};
	freeze$1(view);
	CANONICAL_VIEWS.add(view);
	return view;
}
/**
* Project feedback from an authentic, causally restorable whole-game session.
* This adapter does not weaken the MatchClock snapshot path used by the
* standalone projector; it supplies the same pre-tiebreak tower evidence from
* the session's authoritative battle state.
*/
function createSessionMatchFeedbackViewModel(snapshot) {
	if (!isAuthenticGameSessionProjectionSnapshot(snapshot)) throw new TypeError("match feedback requires an authentic GameSession projection snapshot");
	const source = record(snapshot.matchFeedback, [
		"events",
		"replayBytes",
		"snapshot"
	], "session match feedback source");
	return new MatchFeedbackProjector().project(snapshot.state.clock, source.events, {
		replayBytes: source.replayBytes,
		snapshot: source.snapshot
	});
}
function serializeMatchFeedbackViewModel(view) {
	if (!CANONICAL_VIEWS.has(view)) throw new TypeError("match feedback view must come from a projector");
	return canonicalJson$2(view);
}
function bindMatchFeedback(layer, view) {
	if (!layer || typeof layer.replaceChildren !== "function" || typeof layer.ownerDocument?.createElement !== "function") throw new TypeError("match feedback layer must be a DOM element");
	if (!CANONICAL_VIEWS.has(view)) throw new TypeError("match feedback view must come from a projector");
	const document = layer.ownerDocument;
	const frame = document.createElement("div");
	frame.className = "match-feedback__frame";
	frame.dataset.phase = view.phase;
	frame.dataset.tick = String(view.tick);
	const score = document.createElement("div");
	score.className = "match-feedback__score";
	for (const name of ["north", "south"]) {
		const node = document.createElement("span");
		node.className = "match-feedback__crown";
		node.dataset.side = name;
		node.textContent = String(view.crowns[name]);
		score.appendChild(node);
	}
	frame.appendChild(score);
	const phase = document.createElement("div");
	phase.className = "match-feedback__phase";
	phase.textContent = view.phase;
	frame.appendChild(phase);
	const field = document.createElement("div");
	field.className = "match-feedback__field";
	frame.appendChild(field);
	for (const effect of view.effects) {
		const node = document.createElement("i");
		node.className = "match-feedback__destruction";
		node.dataset.ordinal = String(effect.ordinal);
		node.dataset.tick = String(effect.tick);
		node.dataset.towerId = effect.towerId;
		const age = view.tick - effect.tick;
		node.dataset.age = String(age);
		node.dataset.stage = age < 24 ? "collapse" : "rubble";
		node.style.setProperty("--collapse", String(Math.min(24, age) / 24));
		node.style.setProperty("--dust-opacity", String(Math.max(0, 1 - age / 36)));
		node.setAttribute("aria-hidden", "true");
		for (let index = 0; index < 5; index += 1) {
			const stone = document.createElement("b");
			stone.style.setProperty("--stone-index", String(index));
			node.appendChild(stone);
		}
		if (age < 60) {
			const crown = document.createElement("span");
			crown.className = "match-feedback__crown-flight";
			crown.dataset.scorer = effect.towerId.startsWith("north:") ? "south" : "north";
			crown.dataset.tick = String(effect.tick);
			crown.textContent = effect.towerId.endsWith(":central") ? "♛ 3" : "♛ +1";
			crown.style.setProperty("--crown-rise", `${Math.min(age, 48) * 1.5}px`);
			crown.style.setProperty("--crown-opacity", String(Math.min(1, (60 - age) / 12)));
			node.appendChild(crown);
		}
		const [x, y] = TOWER_POSITIONS[effect.towerId];
		node.style.setProperty("left", `${x * 100 / 18e3}%`);
		node.style.setProperty("top", `${(32e3 - y) * 100 / 32e3}%`);
		field.appendChild(node);
	}
	if (view.overlay) {
		const overlay = document.createElement("section");
		overlay.className = "match-feedback__overlay";
		overlay.dataset.kind = view.overlay.kind;
		overlay.dataset.reason = view.overlay.reason;
		overlay.dataset.winner = view.overlay.winner ?? "draw";
		const title = document.createElement("strong");
		title.textContent = view.overlay.winner === null ? "Draw" : `${view.overlay.winner} wins`;
		overlay.appendChild(title);
		const detail = document.createElement("span");
		detail.className = "match-feedback__result";
		detail.textContent = `${view.overlay.crowns.north} – ${view.overlay.crowns.south}`;
		overlay.appendChild(detail);
		frame.appendChild(overlay);
	}
	layer.replaceChildren(frame);
	return view;
}
var MATCH_FEEDBACK_EVENT_LIMIT, TOWER_IDS$1, CANONICAL_VIEWS, PHASES, REASONS, STYLE_TEXT, MatchFeedbackProjector, TOWER_POSITIONS, LIFECYCLE_STYLE;
function init_match_feedback() {
	return (init_match_feedback = __esmMin((() => {
		init_hud_motion();
		init_match();
		init_game_session();
		MATCH_FEEDBACK_EVENT_LIMIT = 10016;
		TOWER_IDS$1 = Object.freeze([
			"north:central",
			"north:lane:left",
			"north:lane:right",
			"south:central",
			"south:lane:left",
			"south:lane:right"
		]);
		new Set(TOWER_IDS$1);
		CANONICAL_VIEWS = /* @__PURE__ */ new WeakSet();
		PHASES = /* @__PURE__ */ new Set([
			"regulation",
			"overtime",
			"ended"
		]);
		REASONS = /* @__PURE__ */ new Set([
			"central_destroyed",
			"overtime_sudden_death",
			"regulation_crowns",
			"tiebreak_exact_tie",
			"tiebreak_lowest_hp"
		]);
		STYLE_TEXT = `.match-feedback{position:absolute;z-index:45;inset:0;overflow:hidden;pointer-events:none;color:#f7f2dc;font:800 18px/1 system-ui,sans-serif;text-shadow:0 2px 0 #172028}.match-feedback__score{position:absolute;top:12px;left:50%;display:flex;gap:12px;translate:-50% 0;padding:8px 12px;border:2px solid #e8dba9;border-radius:14px;background:#263843dd}.match-feedback__crown{min-width:2ch;text-align:center}.match-feedback__phase{position:absolute;top:58px;left:50%;translate:-50% 0;padding:5px 10px;border-radius:9px;background:#263843dd;text-transform:uppercase}.match-feedback__destruction{position:absolute;width:26px;height:26px;translate:-50% -50%;border:4px double #ffe68a;border-radius:50%;background:#e36b43aa;box-shadow:0 0 18px #fff3a8}.match-feedback__overlay{position:absolute;inset:31% 9%;display:grid;place-content:center;gap:12px;text-align:center;border:4px solid #e8dba9;border-radius:20px;background:#172832ed;font-size:34px}.match-feedback__result{font-size:18px;text-transform:uppercase}`;
		MatchFeedbackProjector = class MatchFeedbackProjector {
			#causal = null;
			#events = [];
			#state = null;
			#view = null;
			get view() {
				return this.#view;
			}
			get terminal() {
				return this.#state?.phase === "ended";
			}
			project(stateValue, eventChunk, causalValue) {
				if (this.terminal) throw new RangeError("terminal match feedback is immutable");
				const state = checkedState(stateValue);
				if (this.#state && state.tick < this.#state.tick) throw new RangeError("match feedback tick cannot move backward");
				const chunk = array(eventChunk, MATCH_FEEDBACK_EVENT_LIMIT, "match event chunk");
				if (this.#events.length + chunk.length > 10016) throw new RangeError("match feedback event limit exceeded");
				const events = checkedEvents([...this.#events, ...chunk], state);
				const causal = checkedCausalSource(causalValue, state, events);
				const view = buildView(state, events, causal);
				this.#causal = {
					replayBytes: causal.replayBytes,
					snapshot: causal.snapshot
				};
				this.#events = events;
				this.#state = state;
				this.#view = view;
				return view;
			}
			serialize() {
				if (this.#state === null) throw new TypeError("match feedback has no projected state");
				return canonicalJson$2({
					causal: this.#causal,
					events: this.#events,
					state: this.#state,
					version: 1
				});
			}
			static restore(bytes) {
				if (typeof bytes !== "string" || bytes.length > 4e6) throw new TypeError("match feedback bytes must be a bounded string");
				let raw;
				try {
					raw = JSON.parse(bytes);
				} catch {
					throw new TypeError("match feedback bytes must be valid JSON");
				}
				const snapshot = record(raw, [
					"causal",
					"events",
					"state",
					"version"
				], "match feedback snapshot");
				if (snapshot.version !== 1) throw new TypeError("match feedback snapshot version is unsupported");
				const projector = new MatchFeedbackProjector();
				projector.project(snapshot.state, snapshot.events, snapshot.causal);
				if (projector.serialize() !== bytes) throw new TypeError("match feedback bytes must use canonical encoding");
				return projector;
			}
		};
		TOWER_POSITIONS = Object.freeze({
			"north:central": [9e3, 29e3],
			"north:lane:left": [3500, 24500],
			"north:lane:right": [14500, 24500],
			"south:central": [9e3, 3e3],
			"south:lane:left": [3500, 7500],
			"south:lane:right": [14500, 7500]
		});
		LIFECYCLE_STYLE = TOWER_IDS$1.map((id) => {
			return `.battle-shell:has(.match-feedback__destruction[data-tower-id="${id}"]) :is(.tower-pad--${id.replaceAll(":", "-").replace("lane-left", "west").replace("lane-right", "east")},.combat-marker[data-combat-id="${id.replace(":left", ":west").replace(":right", ":east")}"]){visibility:hidden}`;
		}).join("") + `
.match-feedback__overlay[data-presentation-tick]{transform:translateY(var(--terminal-lift)) scale(var(--terminal-scale));opacity:var(--terminal-opacity);transform-origin:50% 65%}
@media(prefers-reduced-motion:reduce){.match-feedback__overlay[data-presentation-tick]{transform:none;opacity:1}}

.match-feedback__field{position:absolute;inset:0}
.game-browser-layer--feedback .match-feedback__field{inset:auto;left:var(--arena-left);top:var(--arena-top);width:var(--arena-width);height:var(--arena-height)}
.combat-marker--tower[data-destroyed="true"]{visibility:hidden}

.match-feedback__destruction{width:12%;height:7%;border:0;border-radius:50%;background:#4A332A55;box-shadow:none;isolation:isolate}
.match-feedback__destruction b{position:absolute;left:calc(8% + var(--stone-index)*17%);top:calc(15% + var(--collapse)*35%);width:25%;height:35%;border:2px solid #191D22;background:#8B8578;box-shadow:inset 0 4px #E3CD9E;transform:translateY(calc((1 - var(--collapse))*-18px)) rotate(calc(var(--stone-index)*31deg));clip-path:polygon(12% 0,80% 0,100% 25%,90% 100%,0 85%,0 20%)}
.match-feedback__destruction::after{content:"";position:absolute;inset:-15%;border:5px solid #E3CD9E;border-radius:50%;opacity:var(--dust-opacity);transform:scale(calc(.6 + var(--collapse)*.7));z-index:-1}
.match-feedback__crown-flight{position:absolute;bottom:85%;left:50%;white-space:nowrap;translate:-50% 0;transform:translateY(calc(-1 * var(--crown-rise)));opacity:var(--crown-opacity);color:#E9A83A;font:bold 25px Georgia,serif;text-shadow:0 2px #191D22,2px 0 #191D22,-2px 0 #191D22}
@media(prefers-reduced-motion:reduce){.match-feedback__destruction b{top:50%;transform:none}.match-feedback__destruction::after{transform:none}.match-feedback__crown-flight{transform:none;opacity:1}}
`;
	})))();
}
//#endregion
//#region src/ui/game-ui-projection.js
function ownRecord(value, keys, label) {
	if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain data object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const actual = Reflect.ownKeys(descriptors).sort();
	const expected = [...keys].sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} has an invalid shape`);
	return Object.fromEntries(keys.map((key) => {
		const descriptor = descriptors[key];
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
		return [key, descriptor.value];
	}));
}
function freeze(value) {
	if (value && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) freeze(child);
		Object.freeze(value);
	}
	return value;
}
function checkedTick(value, label) {
	if (!Number.isSafeInteger(value) || value < 0 || value > 18e3) throw new TypeError(`${label} must be a canonical match tick`);
	return value;
}
function targetId(value) {
	return STRUCTURE_IDS.get(value) ?? value;
}
function combatState(state, effectEvents) {
	const structures = state.battle.structures.filter(({ cardId }) => COMBAT_STRUCTURE_ART_IDS.includes(cardId));
	const aliveIds = /* @__PURE__ */ new Set([
		...state.battle.units.filter((unit) => unit.hitpoints > 0).map((unit) => unit.id),
		...state.battle.towers.filter((tower) => tower.hitpoints > 0).map((tower) => tower.id),
		...structures.filter((structure) => structure.alive && structure.hitpoints > 0).map((structure) => structure.id)
	]);
	const liveTargetId = (value) => {
		const mapped = targetId(value);
		return aliveIds.has(mapped) ? mapped : null;
	};
	const structureTargetId = (structure) => {
		if (typeof structure.targetKey !== "string") return null;
		const match = /^(?:unit|structure):([1-9][0-9]*)$/u.exec(structure.targetKey);
		if (match !== null) {
			const id = Number(match[1]);
			return Number.isSafeInteger(id) ? liveTargetId(id) : null;
		}
		if (structure.targetKey.startsWith("tower:")) return liveTargetId(structure.targetKey.slice(6));
		return null;
	};
	const entities = state.battle.units.map((unit) => ({
		hitpoints: unit.hitpoints,
		id: unit.id,
		kind: unit.archetypeId,
		layer: unit.layer,
		maxHitpoints: unit.maxHealth,
		position: unit.position,
		side: unit.side,
		targetId: liveTargetId(unit.targetId)
	})).concat(structures.map((structure) => ({
		hitpoints: structure.hitpoints,
		id: structure.id,
		kind: structure.cardId,
		layer: "ground",
		maxHitpoints: structure.maxHitpoints,
		position: structure.position,
		side: structure.side,
		targetId: structure.alive ? structureTargetId(structure) : null
	})));
	const towers = state.battle.towers.map((tower) => ({
		hitpoints: tower.hitpoints,
		id: tower.id,
		maxHitpoints: tower.maxHitpoints,
		position: tower.position,
		role: tower.role,
		side: tower.side,
		targetId: liveTargetId(tower.attack.targetId)
	}));
	const roots = new Map(effectEvents.filter(({ parentId, phase }) => parentId === null && phase === "open").map((event) => [event.rootId, event]));
	return {
		entities,
		events: effectEvents.filter(({ phase }) => [
			"contact",
			"damage",
			"death"
		].includes(phase)).slice(-2048).map((event, sequence) => ({
			entityId: event.phase === "contact" ? roots.get(event.rootId)?.payload.sourceId ?? event.payload.targetId : event.payload.targetId,
			sequence,
			tick: event.tick,
			type: event.phase === "contact" ? "target" : event.phase
		})),
		tick: state.tick,
		towers
	};
}
function mintFrameParts(snapshot, combat, effects, feedback, hud) {
	if (!isAuthenticGameSessionProjectionSnapshot(snapshot)) throw new TypeError("game UI frame parts require an authentic projection snapshot");
	const parts = Object.freeze({
		combat,
		effects,
		feedback,
		hud,
		sequence: snapshot.sequence,
		source: snapshot.source,
		tick: snapshot.state.tick,
		version: 1
	});
	FRAME_MOTION.set(parts, createCombatMotionView(snapshot, effects));
	FRAME_HUD_RECEIPT.set(parts, snapshot.hudFeedback.lastCardPlay[hud.elixir.side]);
	FRAME_PARTS.add(parts);
	return parts;
}
function composeGameUiFrame(value) {
	if (!FRAME_PARTS.has(value)) throw new TypeError("game UI frame parts must be minted by this module");
	const frame = value;
	if (frame.version !== 1) throw new TypeError("game UI frame version is unsupported");
	const tick = checkedTick(frame.tick, "game UI frame.tick");
	serializeHudViewModel(frame.hud);
	serializeCombatViewModel(frame.combat);
	serializeCombatEffectsViewModel(frame.effects);
	serializeMatchFeedbackViewModel(frame.feedback);
	if ([
		frame.hud.tick,
		frame.combat.tick,
		frame.effects.tick,
		frame.feedback.tick
	].some((candidate) => candidate !== tick)) throw new TypeError("all game UI projections must use the same tick");
	if (!Number.isSafeInteger(frame.sequence) || frame.sequence < 0 || !frame.source || typeof frame.source !== "object") throw new TypeError("game UI frame identity is invalid");
	const admitted = freeze({
		...frame,
		tick
	});
	FRAME_MOTION.set(admitted, FRAME_MOTION.get(frame));
	FRAME_HUD_RECEIPT.set(admitted, FRAME_HUD_RECEIPT.get(frame));
	FRAMES.add(admitted);
	return admitted;
}
function createGameUiOptions(localSide = "south", selectedCardId = null, terminalPresentationTick = 24) {
	if (localSide !== "north" && localSide !== "south" || selectedCardId !== null && typeof selectedCardId !== "string") throw new TypeError("game UI options are invalid");
	if (!Number.isSafeInteger(terminalPresentationTick) || terminalPresentationTick < 0 || terminalPresentationTick > 24) throw new TypeError("terminal presentation tick must be an integer from 0 to 24");
	const options = Object.freeze({
		localSide,
		selectedCardId,
		terminalPresentationTick
	});
	OPTIONS.add(options);
	return options;
}
function createGameUiFrame(session, options = DEFAULT_GAME_UI_OPTIONS) {
	if (!isAuthenticGameSession(session)) throw new TypeError("game UI frame requires an authentic GameSession");
	if (!OPTIONS.has(options)) throw new TypeError("game UI options must be minted by this module");
	const snapshot = GameSession.prototype.projectionSnapshot.call(session);
	const state = snapshot.state;
	if (state.tick !== state.battle.tick || state.tick !== state.clock.tick || state.tick !== state.elixir.tick) throw new TypeError("game session projection ticks diverge");
	const setup = snapshot.setup;
	const hud = createHudViewModel({
		cards: JSON.parse(setup.battleSetup).roster.map(({ cost, displayName, id }) => ({
			cost,
			displayName,
			id
		})),
		deck: state.decks[options.localSide],
		elixir: state.elixir,
		localSide: options.localSide,
		match: state.clock,
		selectedCardId: options.selectedCardId
	});
	const effects = createCombatEffectsViewModel(snapshot.combatEffectFeed, state.tick);
	const feedback = createSessionMatchFeedbackViewModel(snapshot);
	const frame = composeGameUiFrame(mintFrameParts(snapshot, createCombatViewModel(combatState(state, effects.events)), effects, feedback, hud));
	FRAME_TERMINAL_TICK.set(frame, options.terminalPresentationTick);
	return frame;
}
function checkedLayer(value, label) {
	if (!value || typeof value !== "object" || typeof value.replaceChildren !== "function" || !value.ownerDocument || typeof value.ownerDocument.createElement !== "function") throw new TypeError(`${label} must be a DOM layer`);
	return value;
}
function children(layer) {
	return Array.from(layer.childNodes ?? layer.children ?? []);
}
function sameChildren(left, right) {
	return left.length === right.length && left.every((child, index) => child === right[index]);
}
function stage(layer) {
	return layer.ownerDocument.createElement("div");
}
function mountGameUiProjection(value) {
	const layers = ownRecord(value, [
		"combat",
		"effects",
		"feedback",
		"hud"
	], "game UI projection layers");
	for (const name of [
		"combat",
		"effects",
		"feedback",
		"hud"
	]) layers[name] = checkedLayer(layers[name], `game UI ${name} layer`);
	let active = true;
	let poisoned = false;
	let lastTick = -1;
	let lastSequence = -1;
	let source = null;
	return Object.freeze({
		cleanup() {
			if (!active) return false;
			if (poisoned) {
				active = false;
				return true;
			}
			for (const name of [
				"hud",
				"feedback",
				"effects",
				"combat"
			]) layers[name].replaceChildren();
			active = false;
			return true;
		},
		project(frame) {
			if (!active) throw new RangeError("game UI projection is cleaned up");
			if (poisoned) throw new Error("game UI projection is poisoned");
			if (!frame || typeof frame !== "object" || !FRAMES.has(frame)) throw new TypeError("game UI projection requires a canonical session frame");
			if (frame.tick < lastTick) throw new RangeError("game UI frame tick cannot move backward");
			if (source !== null && frame.source !== source) throw new RangeError("game UI frame belongs to a different session");
			if (frame.sequence <= lastSequence) throw new RangeError("game UI frame sequence must advance strictly");
			const prior = Object.fromEntries(Object.entries(layers).map(([name, layer]) => [name, children(layer)]));
			const staged = {
				combat: stage(layers.combat),
				effects: stage(layers.effects),
				feedback: stage(layers.feedback),
				hud: stage(layers.hud)
			};
			bindCombatViewModel(staged.combat, frame.combat);
			bindCombatEffectsViewModel(staged.effects, frame.effects);
			bindCombatMotion(staged.combat, staged.effects, FRAME_MOTION.get(frame));
			bindMatchFeedback(staged.feedback, frame.feedback);
			if (frame.feedback.overlay) {
				const panel = children(children(staged.feedback)[0]).find((node) => node.className === "match-feedback__overlay");
				const age = FRAME_TERMINAL_TICK.get(frame) ?? 24;
				const remaining = (24 - age) / 24;
				panel.dataset.presentationTick = String(age);
				panel.style.setProperty("--terminal-scale", String(1 - remaining * .12));
				panel.style.setProperty("--terminal-lift", `${remaining * 28}px`);
				panel.style.setProperty("--terminal-opacity", String(1 - remaining * .55));
			}
			const hudFrame = layers.hud.ownerDocument.createElement("div");
			hudFrame.className = "game-ui-hud-frame";
			hudFrame.dataset.tick = String(frame.tick);
			hudFrame.innerHTML = getHudMarkup(frame.hud);
			bindHudMotion(hudFrame, frame.hud, FRAME_HUD_RECEIPT.get(frame));
			staged.hud.replaceChildren(hudFrame);
			const committed = [];
			try {
				for (const name of [
					"combat",
					"effects",
					"feedback",
					"hud"
				]) {
					committed.push(name);
					const candidate = children(staged[name]);
					layers[name].replaceChildren(...candidate);
					if (!sameChildren(children(layers[name]), candidate)) throw new Error(`game UI ${name} layer did not commit its candidate`);
				}
			} catch (error) {
				const rollbackErrors = [];
				for (let index = committed.length - 1; index >= 0; index -= 1) {
					const name = committed[index];
					try {
						layers[name].replaceChildren(...prior[name]);
						if (!sameChildren(children(layers[name]), prior[name])) throw new Error(`game UI ${name} layer did not restore its prior children`);
					} catch (caught) {
						rollbackErrors.push(caught);
					}
				}
				if (rollbackErrors.length > 0) {
					poisoned = true;
					throw new AggregateError([error, ...rollbackErrors], "game UI projection is poisoned after rollback failure");
				}
				throw error;
			}
			lastTick = frame.tick;
			lastSequence = frame.sequence;
			source = frame.source;
			return frame;
		}
	});
}
var FRAMES, FRAME_PARTS, FRAME_MOTION, FRAME_HUD_RECEIPT, FRAME_TERMINAL_TICK, OPTIONS, STRUCTURE_IDS, DEFAULT_GAME_UI_OPTIONS;
function init_game_ui_projection() {
	return (init_game_ui_projection = __esmMin((() => {
		init_hud_motion();
		init_combat_motion();
		init_game_session();
		init_combat_effects();
		init_combat_state();
		init_hud_state();
		init_combat_art();
		init_match_feedback();
		FRAMES = /* @__PURE__ */ new WeakSet();
		FRAME_PARTS = /* @__PURE__ */ new WeakSet();
		FRAME_MOTION = /* @__PURE__ */ new WeakMap();
		FRAME_HUD_RECEIPT = /* @__PURE__ */ new WeakMap();
		FRAME_TERMINAL_TICK = /* @__PURE__ */ new WeakMap();
		OPTIONS = /* @__PURE__ */ new WeakSet();
		STRUCTURE_IDS = /* @__PURE__ */ new Map([
			[Number.MAX_SAFE_INTEGER - 5, "south:central"],
			[Number.MAX_SAFE_INTEGER - 4, "south:lane:west"],
			[Number.MAX_SAFE_INTEGER - 3, "south:lane:east"],
			[Number.MAX_SAFE_INTEGER - 2, "north:central"],
			[Number.MAX_SAFE_INTEGER - 1, "north:lane:west"],
			[Number.MAX_SAFE_INTEGER, "north:lane:east"]
		]);
		DEFAULT_GAME_UI_OPTIONS = createGameUiOptions();
	})))();
}
//#endregion
//#region src/ui/game-session-restore-continuation.js
function canonical$2(value) {
	if (Array.isArray(value)) return `[${value.map(canonical$2).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical$2(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exact$1(value, keys, label) {
	if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${label} must be a plain object`);
	const actual = Object.keys(value).sort(), expected = [...keys].sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} has an invalid shape`);
	return value;
}
function scalarByteLength(text, label) {
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
function preflight(value, limits, label) {
	const stack = [{
		depth: 0,
		value
	}];
	let containers = 0, nodes = 0;
	while (stack.length) {
		const current = stack.pop();
		nodes += 1;
		if (nodes > limits.nodes) throw new RangeError(`${label} exceeds its node bound`);
		if (current.depth > limits.depth) throw new RangeError(`${label} exceeds its depth bound`);
		const entry = current.value;
		if (typeof entry === "string") {
			if (entry.length > limits.stringLength) throw new RangeError(`${label} exceeds its string bound`);
			scalarByteLength(entry, label);
			continue;
		}
		if (typeof entry === "number" && (!Number.isSafeInteger(entry) || !Number.isFinite(entry))) throw new TypeError(`${label} contains a non-safe integer`);
		if (entry === null || typeof entry === "boolean" || typeof entry === "number") continue;
		if (!entry || typeof entry !== "object") throw new TypeError(`${label} contains an invalid value`);
		containers += 1;
		if (containers > limits.containers) throw new RangeError(`${label} exceeds its container bound`);
		if (Array.isArray(entry)) {
			if (entry.length > limits.arrayLength) throw new RangeError(`${label} exceeds its array bound`);
			for (let index = entry.length - 1; index >= 0; index -= 1) stack.push({
				depth: current.depth + 1,
				value: entry[index]
			});
			continue;
		}
		if (Object.getPrototypeOf(entry) !== Object.prototype) throw new TypeError(`${label} contains a non-plain object`);
		const keys = Object.keys(entry);
		if (keys.length > limits.keys) throw new RangeError(`${label} exceeds its key bound`);
		for (let index = keys.length - 1; index >= 0; index -= 1) {
			const key = keys[index];
			if (key.length > limits.stringLength) throw new RangeError(`${label} exceeds its string bound`);
			scalarByteLength(key, label);
			if ([
				"__proto__",
				"constructor",
				"prototype"
			].includes(key)) throw new TypeError(`${label} contains a forbidden key`);
			stack.push({
				depth: current.depth + 1,
				value: entry[key]
			});
		}
	}
	return value;
}
function parsed(serialized, label) {
	if (typeof serialized !== "string") throw new TypeError(`${label} must be canonical JSON text`);
	if (scalarByteLength(serialized, label) > GAME_SESSION_MAX_SNAPSHOT_BYTES) throw new RangeError(`${label} exceeds its byte bound`);
	let value;
	try {
		value = JSON.parse(serialized);
	} catch {
		throw new TypeError(`${label} must be valid JSON`);
	}
	preflight(value, SNAPSHOT_GRAPH_LIMITS, label);
	if (canonical$2(value) !== serialized) throw new TypeError(`${label} must be canonical JSON`);
	return value;
}
function continuationState(continuation) {
	const state = CONTINUATIONS.get(continuation);
	if (state === void 0) throw new TypeError("game session restore continuation is invalid");
	return state;
}
function createGameSessionRestoreContinuation(serialized) {
	return new GameSessionRestoreContinuation(serialized);
}
/** Mint one opaque exact-byte handoff for a complete cursor and one loop owner. */
function createGameBrowserRestoreCapability(continuation, browserBytes, sessionBytes, owner) {
	const state = CONTINUATIONS.get(continuation);
	if (state === void 0 || !state.complete || state.issued || state.bytes !== sessionBytes || typeof browserBytes !== "string" || owner === null || typeof owner !== "object" && typeof owner !== "function") throw new TypeError("game session restore continuation cannot mint a capability");
	const capability = Object.freeze({});
	state.issued = true;
	PREPARED_RESTORES.set(capability, {
		bytes: browserBytes,
		owner,
		session: state.session
	});
	return capability;
}
/** Consume one matching opaque handoff without reading any attacker properties. */
function consumeGameBrowserRestoreCapability(capability, bytes, owner) {
	const state = PREPARED_RESTORES.get(capability);
	if (state === void 0 || state.bytes !== bytes || state.owner !== owner) throw new TypeError("game browser restore capability is invalid, reused, or cross-loop");
	PREPARED_RESTORES.delete(capability);
	return state.session;
}
var SNAPSHOT_GRAPH_LIMITS, CONTINUATIONS, PREPARED_RESTORES, GameSessionRestoreContinuation;
function init_game_session_restore_continuation() {
	return (init_game_session_restore_continuation = __esmMin((() => {
		init_game_session();
		SNAPSHOT_GRAPH_LIMITS = Object.freeze({
			arrayLength: 2e4,
			containers: 1e5,
			depth: 128,
			keys: 1024,
			nodes: 2e5,
			stringLength: 8388608
		});
		CONTINUATIONS = /* @__PURE__ */ new WeakMap();
		PREPARED_RESTORES = /* @__PURE__ */ new WeakMap();
		GameSessionRestoreContinuation = class {
			constructor(serialized) {
				const value = exact$1(parsed(serialized, "game session snapshot"), [
					"setup",
					"transcript",
					"version"
				], "game session snapshot");
				if (value.version !== 2 || !Array.isArray(value.transcript) || value.transcript.length > GAME_SESSION_MAX_TRANSCRIPT) throw new TypeError("unsupported or oversized game session snapshot");
				CONTINUATIONS.set(this, {
					bytes: serialized,
					complete: false,
					index: 0,
					issued: false,
					ready: value.transcript.length === 0,
					session: new GameSession(canonical$2(value.setup)),
					transcript: value.transcript
				});
				Object.freeze(this);
			}
			get complete() {
				return continuationState(this).complete;
			}
			get ready() {
				return continuationState(this).ready;
			}
			get session() {
				const state = continuationState(this);
				if (!state.complete) throw new Error("game session restore continuation is incomplete");
				return state.session;
			}
			/** Apply one canonical transcript operation, or exactly one public simulation tick. */
			advance() {
				const state = continuationState(this);
				if (state.complete) return Object.freeze({
					complete: true,
					index: state.index
				});
				if (state.ready) throw new Error("game session restore continuation requires finalization");
				const operation = state.transcript[state.index];
				if (!operation || typeof operation !== "object" || Array.isArray(operation)) throw new TypeError("game session transcript operation is invalid");
				if (operation.type === "step") {
					exact$1(operation, ["type"], "game session step operation");
					const sessionState = state.session.state;
					if (sessionState.paused || sessionState.terminal) throw new TypeError("game session transcript contains an uncaused step");
					state.session.stepMany(1);
				} else if (operation.type === "submit") {
					exact$1(operation, ["command", "type"], "game session submit operation");
					state.session.submitPlayerCommand(canonical$2(operation.command));
				} else if (operation.type === "pause") {
					exact$1(operation, ["type"], "game session pause operation");
					if (state.session.state.paused) throw new TypeError("game session transcript contains an uncaused pause");
					state.session.pause();
				} else if (operation.type === "resume") {
					exact$1(operation, ["type"], "game session resume operation");
					if (!state.session.state.paused) throw new TypeError("game session transcript contains an uncaused resume");
					state.session.resume();
				} else throw new TypeError("game session transcript operation type is invalid");
				state.index += 1;
				state.ready = state.index === state.transcript.length;
				return Object.freeze({
					complete: state.complete,
					index: state.index,
					ready: state.ready
				});
			}
			/** Perform the final exact canonical-byte witness in its own yielded task. */
			finalize() {
				const state = continuationState(this);
				if (!state.ready) throw new Error("game session restore continuation is incomplete");
				if (!state.complete) {
					if (state.session.serialize() !== state.bytes) throw new TypeError("game session transcript did not reproduce its snapshot");
					state.complete = true;
				}
				return Object.freeze({
					complete: state.complete,
					index: state.index
				});
			}
		};
	})))();
}
//#endregion
//#region src/ui/game-browser-loop.js
function assertGameBrowserRootAvailable(root) {
	if (!root || typeof root !== "object" && typeof root !== "function") throw new TypeError("game browser root is invalid");
	if (ACTIVE_ROOTS.has(root)) throw new RangeError("game browser root is already mounted");
	return true;
}
function canonical$1(value) {
	if (Array.isArray(value)) return `[${value.map(canonical$1).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical$1(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function exact(value, keys, label) {
	if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${label} must be a plain object`);
	const actual = Object.keys(value).sort(), expected = [...keys].sort();
	if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(`${label} has an invalid shape`);
	return value;
}
function checkedGameBrowserSnapshot(bytes) {
	if (typeof bytes !== "string" || bytes.length > 67108864) throw new TypeError("game browser snapshot must be bounded canonical JSON");
	let value;
	try {
		value = JSON.parse(bytes);
	} catch {
		throw new TypeError("game browser snapshot must be valid JSON");
	}
	exact(value, value.version === 1 ? [
		"bridge",
		"running",
		"session",
		"version"
	] : [
		"bridge",
		"running",
		"session",
		"terminalPresentation",
		"version"
	], "game browser snapshot");
	if (value.version !== 1) {
		exact(value.terminalPresentation, ["tick", "running"], "terminal presentation");
		if (!Number.isSafeInteger(value.terminalPresentation.tick) || value.terminalPresentation.tick < 0 || value.terminalPresentation.tick > 24 || typeof value.terminalPresentation.running !== "boolean" || value.terminalPresentation.running && value.terminalPresentation.tick === 24) throw new TypeError("terminal presentation is invalid");
	}
	if (![1, 2].includes(value.version) || typeof value.bridge !== "string" || typeof value.session !== "string" || typeof value.running !== "boolean" || canonical$1(value) !== bytes) throw new TypeError("game browser snapshot is invalid");
	return value;
}
function checkedLayers(value) {
	const layers = exact(value, LAYER_NAMES, "game browser layers");
	for (const name of LAYER_NAMES) if (!layers[name] || typeof layers[name] !== "object" || typeof layers[name].replaceChildren !== "function") throw new TypeError(`game browser ${name} layer is invalid`);
	return layers;
}
function checkedScheduler(value) {
	const scheduler = exact(value, ["cancelAnimationFrame", "requestAnimationFrame"], "game browser scheduler");
	if (typeof scheduler.cancelAnimationFrame !== "function" || typeof scheduler.requestAnimationFrame !== "function") throw new TypeError("game browser scheduler methods are invalid");
	return scheduler;
}
function cleanupGraph(graph) {
	const errors = [];
	if (graph === null) return errors;
	try {
		graph.bridge.unsubscribe();
	} catch (error) {
		errors.push(error);
	}
	try {
		graph.input?.cleanup();
	} catch (error) {
		errors.push(error);
	}
	try {
		graph.projection.cleanup();
	} catch (error) {
		errors.push(error);
	}
	return errors;
}
/**
* Own one browser-facing session graph. RAF timestamps decide only how many
* explicit simulation ticks to request; they never enter simulation state.
*/
function mountGameBrowserLoop(options) {
	const checked = exact(options, [
		"createInput",
		"layers",
		"root",
		"scheduler",
		"session"
	], "game browser options");
	assertGameBrowserRootAvailable(checked.root);
	if (!isAuthenticGameSession(checked.session)) throw new TypeError("game browser loop requires one authentic GameSession");
	if (typeof checked.createInput !== "function") throw new TypeError("game browser input factory is invalid");
	const layers = checkedLayers(checked.layers);
	const scheduler = checkedScheduler(checked.scheduler);
	let session = checked.session;
	let graph = null;
	let active = true;
	let running = !session.state.paused && !session.state.terminal;
	let terminalPresentationTick = 0;
	let terminalPresentationRunning = false;
	let handle = null;
	let lastTimestamp = null;
	let fractionalTicks = 0;
	let backlogTicks = 0;
	let domTick = -1;
	let endurance = null;
	let inOperation = false;
	let selectedCardId = null;
	let selectionProjectionFault = false;
	let selectionCleanupQueued = false;
	const preparedRestoreOwner = Object.freeze({});
	const assertActive = () => {
		if (!active) throw new RangeError("game browser loop is disposed");
		if (inOperation) throw new Error("game browser loop reentrant operation rejected");
		if (endurance !== null) throw new Error("game browser endurance transaction is active");
	};
	const render = (selectionOverride = void 0) => {
		const liveInput = graph?.input;
		const candidate = selectionOverride === void 0 ? liveInput === null || liveInput === void 0 ? selectedCardId : liveInput.selectedCardId : selectionOverride;
		const selection = typeof candidate === "string" && session.state.decks.south.hand.includes(candidate) ? candidate : null;
		selectedCardId = selection;
		const frame = createGameUiFrame(session, createGameUiOptions("south", selection, terminalPresentationTick));
		graph.projection.project(frame);
		domTick = frame.tick;
		if (domTick !== session.state.tick) throw new Error("game browser DOM tick diverged");
		return frame;
	};
	const nextCommandId = (bridgeBytes) => bridgeBytes === null ? 1 : JSON.parse(bridgeBytes).deliveries.length + 1;
	const failClosedAfterSelectionProjection = (source) => {
		selectionProjectionFault = true;
		active = false;
		running = false;
		cancel();
		selectedCardId = null;
		if (selectionCleanupQueued) return;
		selectionCleanupQueued = true;
		queueMicrotask(() => {
			if (graph === null || graph.input !== source) return;
			const candidate = graph;
			graph = null;
			try {
				cleanupGraph(candidate);
			} finally {
				ACTIVE_ROOTS.delete(checked.root);
			}
		});
	};
	const onInputSelection = (candidate, source, projected = null) => {
		if (!active || selectionProjectionFault || graph === null || graph.input === null || graph.input !== source) return false;
		if (candidate !== null && typeof candidate !== "string") throw new TypeError("game browser selected card ID is invalid");
		const clearsBeforeController = candidate === null && typeof source.selectedCardId === "string" && !projected?.deck?.state?.hand?.includes(source.selectedCardId);
		if (source.selectedCardId !== candidate && !clearsBeforeController) throw new Error("game browser input selection provenance is inconsistent");
		const controller = source.input;
		if (controller === null || typeof controller !== "object" && typeof controller !== "function") throw new TypeError("game browser input selection authority is invalid");
		const sourceDeck = controller.deck;
		if (sourceDeck === null || typeof sourceDeck !== "object" && typeof sourceDeck !== "function") throw new TypeError("game browser input selection authority is invalid");
		const sourceState = sourceDeck.state;
		if (sourceState === null || typeof sourceState !== "object") throw new TypeError("game browser input selection authority is invalid");
		const sourceHand = sourceState.hand;
		if (!Array.isArray(sourceHand)) throw new TypeError("game browser input selection authority is invalid");
		if (candidate !== null && (!sourceHand.includes(candidate) || !session.state.decks.south.hand.includes(candidate))) throw new Error("game browser input selection is not in the current hand");
		const previous = selectedCardId;
		selectedCardId = candidate;
		try {
			render(candidate);
		} catch (error) {
			selectedCardId = previous;
			failClosedAfterSelectionProjection(source);
			throw error;
		}
		return true;
	};
	const buildGraph = (candidateSession, bridgeBytes = null) => {
		const input = checked.createInput(candidateSession, nextCommandId(bridgeBytes), selectedCardId, onInputSelection);
		let bridge = null, projection = null;
		try {
			bridge = bridgeBytes === null ? new GameInputBridge(input, candidateSession) : GameInputBridge.restore(bridgeBytes, input, candidateSession);
			projection = mountGameUiProjection(layers);
			const candidate = {
				bridge,
				input,
				projection
			};
			graph = candidate;
			selectedCardId = typeof input.selectedCardId === "string" ? input.selectedCardId : null;
			return candidate;
		} catch (error) {
			try {
				bridge?.unsubscribe();
			} catch {}
			try {
				input?.cleanup();
			} catch {}
			try {
				projection?.cleanup();
			} catch {}
			throw error;
		}
	};
	const synchronizeInput = () => {
		const bridgeBytes = graph.bridge.serialize();
		selectedCardId = typeof graph.input?.selectedCardId === "string" ? graph.input.selectedCardId : null;
		graph.bridge.unsubscribe();
		graph.input.cleanup();
		graph = {
			...graph,
			input: null
		};
		let input = null, bridge = null;
		try {
			input = checked.createInput(session, nextCommandId(bridgeBytes), selectedCardId, onInputSelection);
			bridge = GameInputBridge.restore(bridgeBytes, input, session);
			graph = {
				...graph,
				bridge,
				input
			};
			selectedCardId = typeof input.selectedCardId === "string" ? input.selectedCardId : null;
		} catch (error) {
			try {
				bridge?.unsubscribe();
			} catch {}
			try {
				input?.cleanup();
			} catch {}
			running = false;
			cancel();
			throw error;
		}
	};
	const suspendInput = () => {
		if (graph.input === null) return false;
		selectedCardId = typeof graph.input.selectedCardId === "string" ? graph.input.selectedCardId : null;
		graph.bridge.unsubscribe();
		graph.input.cleanup();
		graph = {
			...graph,
			input: null
		};
		return true;
	};
	const resumeInput = () => {
		if (graph.input !== null) return false;
		const bridgeBytes = graph.bridge.serialize();
		const input = checked.createInput(session, nextCommandId(bridgeBytes), selectedCardId, onInputSelection);
		let bridge;
		try {
			bridge = GameInputBridge.restore(bridgeBytes, input, session);
		} catch (error) {
			try {
				input.cleanup();
			} catch {}
			throw error;
		}
		graph = {
			...graph,
			bridge,
			input
		};
		selectedCardId = typeof input.selectedCardId === "string" ? input.selectedCardId : null;
		return true;
	};
	const cancel = () => {
		if (handle === null) return false;
		scheduler.cancelAnimationFrame(handle);
		handle = null;
		return true;
	};
	const stopAtTerminal = () => {
		if (!session.state.terminal) return false;
		const wasRunning = running;
		running = false;
		cancel();
		lastTimestamp = null;
		fractionalTicks = 0;
		backlogTicks = 0;
		if (wasRunning && terminalPresentationTick < 24) terminalPresentationRunning = true;
		suspendInput();
		if (terminalPresentationRunning) schedule();
		return true;
	};
	const checkedRestoreCandidate = (snapshot, candidate) => {
		if (!isAuthenticGameSession(candidate) || candidate.serialize() !== snapshot.session) throw new TypeError("game browser restore candidate is not the supplied session snapshot");
		if (snapshot.running && (candidate.state.paused || candidate.state.terminal)) throw new TypeError("game browser running snapshot is incoherent");
		if (snapshot.terminalPresentation && !candidate.state.terminal && (snapshot.terminalPresentation.tick !== 0 || snapshot.terminalPresentation.running)) throw new TypeError("terminal presentation requires a terminal session");
		return candidate;
	};
	const restoreCandidate = (snapshot, candidate) => {
		inOperation = true;
		try {
			cancel();
			const cleanupErrors = cleanupGraph(graph);
			graph = null;
			if (cleanupErrors.length) {
				active = false;
				ACTIVE_ROOTS.delete(checked.root);
				throw new AggregateError(cleanupErrors, "game browser restore cleanup failed");
			}
			session = candidate;
			selectedCardId = null;
			terminalPresentationTick = snapshot.terminalPresentation?.tick ?? (session.state.terminal ? 24 : 0);
			terminalPresentationRunning = snapshot.terminalPresentation?.running ?? false;
			buildGraph(session, snapshot.bridge);
			running = snapshot.running;
			lastTimestamp = null;
			fractionalTicks = 0;
			backlogTicks = 0;
			render();
			if (session.state.paused || session.state.terminal) suspendInput();
			if (running || terminalPresentationRunning) schedule();
			return api.state;
		} catch (error) {
			cancel();
			running = false;
			if (graph === null) {
				active = false;
				ACTIVE_ROOTS.delete(checked.root);
			}
			throw error;
		} finally {
			inOperation = false;
		}
	};
	const assertEndurance = () => {
		if (endurance === null) throw new Error("game browser endurance transaction is inactive");
	};
	const finishEndurance = (aborted) => {
		assertEndurance();
		inOperation = true;
		try {
			if (domTick !== session.state.tick) render();
			if (session.state.terminal) stopAtTerminal();
			else resumeInput();
			endurance = null;
			return Object.freeze({
				aborted,
				state: api.state
			});
		} catch (error) {
			running = false;
			cancel();
			endurance = null;
			throw error;
		} finally {
			inOperation = false;
		}
	};
	const schedule = () => {
		if (!active || !running && !terminalPresentationRunning || handle !== null) return false;
		handle = scheduler.requestAnimationFrame(onFrame);
		return true;
	};
	const onFrame = (timestamp) => {
		if (!active || !running && !terminalPresentationRunning) return;
		handle = null;
		if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
			running = false;
			terminalPresentationRunning = false;
			throw new TypeError("game browser frame timestamp is invalid");
		}
		if (lastTimestamp === null) lastTimestamp = timestamp;
		else {
			const elapsed = Math.max(0, timestamp - lastTimestamp);
			lastTimestamp = timestamp;
			fractionalTicks += elapsed * 60;
			const presentedTicks = Math.floor(fractionalTicks / 1e3);
			fractionalTicks -= presentedTicks * 1e3;
			backlogTicks = Math.min(240, backlogTicks + presentedTicks);
		}
		const count = Math.min(120, backlogTicks);
		if (session.state.terminal) {
			if (count > 0) {
				const prior = terminalPresentationTick;
				terminalPresentationTick = Math.min(24, prior + count);
				try {
					render();
				} catch (error) {
					terminalPresentationTick = prior;
					terminalPresentationRunning = false;
					cancel();
					throw error;
				}
				backlogTicks = 0;
			}
			if (terminalPresentationTick === 24) {
				terminalPresentationRunning = false;
				lastTimestamp = null;
				fractionalTicks = 0;
			} else schedule();
			return;
		}
		if (count > 0) {
			const before = session.state.tick;
			session.stepMany(count);
			const advanced = session.state.tick - before;
			backlogTicks = Math.max(0, backlogTicks - advanced);
			if (session.state.terminal) suspendInput();
			else synchronizeInput();
			render();
		}
		if (!stopAtTerminal()) schedule();
	};
	buildGraph(session);
	try {
		render();
	} catch (error) {
		cleanupGraph(graph);
		graph = null;
		throw error;
	}
	if (session.state.paused || session.state.terminal) suspendInput();
	const api = Object.freeze({
		dispose() {
			if (!active) return false;
			assertActive();
			inOperation = true;
			cancel();
			running = false;
			terminalPresentationRunning = false;
			const errors = cleanupGraph(graph);
			graph = null;
			active = false;
			ACTIVE_ROOTS.delete(checked.root);
			inOperation = false;
			if (errors.length) throw new AggregateError(errors, "game browser cleanup failed");
			return true;
		},
		enterManualStepMode() {
			assertActive();
			if (!running && !terminalPresentationRunning) return false;
			terminalPresentationRunning = false;
			running = false;
			cancel();
			lastTimestamp = null;
			fractionalTicks = 0;
			backlogTicks = 0;
			return true;
		},
		/**
		* Begin a bounded asynchronous endurance segment.  RAF remains stopped
		* in manual mode; the entry layer supplies real RAF yields between the
		* explicit simulation slices.  Input is intentionally detached until the
		* final coherent DOM/audio presentation commits.
		*/
		beginEnduranceSegment() {
			assertActive();
			const state = session.state;
			if (running || state.paused || state.terminal) throw new Error("game browser endurance requires an active manual session");
			inOperation = true;
			try {
				suspendInput();
				endurance = Object.freeze({
					fromTick: state.tick,
					sessionTick: state.tick
				});
				return Object.freeze({
					fromTick: state.tick,
					domTick
				});
			} finally {
				inOperation = false;
			}
		},
		/** Advance simulation only; presentation is committed separately. */
		advanceEnduranceSlice(count) {
			if (!active) throw new RangeError("game browser loop is disposed");
			if (inOperation) throw new Error("game browser loop reentrant operation rejected");
			assertEndurance();
			if (!Number.isSafeInteger(count) || count < 1 || count > GAME_SESSION_MAX_BATCH_TICKS) throw new TypeError("game browser endurance slice count is invalid");
			inOperation = true;
			try {
				const fromTick = endurance.sessionTick;
				const events = session.stepMany(count);
				const state = session.state;
				endurance = Object.freeze({
					fromTick: endurance.fromTick,
					sessionTick: state.tick
				});
				return Object.freeze({
					events,
					fromTick,
					sessionTick: state.tick,
					terminal: state.terminal
				});
			} finally {
				inOperation = false;
			}
		},
		/** Commit one complete DOM projection for all prior endurance slices. */
		presentEnduranceFrame() {
			if (!active) throw new RangeError("game browser loop is disposed");
			if (inOperation) throw new Error("game browser loop reentrant operation rejected");
			assertEndurance();
			inOperation = true;
			try {
				render();
				if (session.state.terminal) stopAtTerminal();
				return api.state;
			} finally {
				inOperation = false;
			}
		},
		/** Commit a final frame and remount E2 input once for the next segment. */
		finishEnduranceSegment() {
			if (!active) throw new RangeError("game browser loop is disposed");
			if (inOperation) throw new Error("game browser loop reentrant operation rejected");
			return finishEndurance(false);
		},
		/** Failure-safe counterpart used by the shipped entry's async finally. */
		abortEnduranceSegment() {
			if (!active) return false;
			if (inOperation || endurance === null) return false;
			finishEndurance(true);
			return true;
		},
		get session() {
			return session;
		},
		get state() {
			const state = session.state;
			return Object.freeze({
				active,
				backlogTicks,
				domTick,
				enduranceActive: endurance !== null,
				terminalPresentationTick,
				terminalPresentationRunning,
				paused: state.paused,
				running,
				scheduled: handle !== null,
				selectedCardId: active && typeof graph?.input?.selectedCardId === "string" ? graph.input.selectedCardId : selectedCardId,
				sessionTick: state.tick,
				terminal: state.terminal
			});
		},
		pause() {
			assertActive();
			if (session.state.paused || session.state.terminal) return false;
			inOperation = true;
			try {
				session.pause();
				running = false;
				cancel();
				suspendInput();
				lastTimestamp = null;
				fractionalTicks = 0;
				backlogTicks = 0;
				render();
				return true;
			} finally {
				inOperation = false;
			}
		},
		resume() {
			assertActive();
			if (!session.state.paused || session.state.terminal) return false;
			inOperation = true;
			try {
				resumeInput();
				session.resume();
				running = true;
				render();
				schedule();
				return true;
			} finally {
				inOperation = false;
			}
		},
		serialize() {
			assertActive();
			return canonical$1({
				bridge: graph.bridge.serialize(),
				running,
				session: session.serialize(),
				terminalPresentation: {
					tick: terminalPresentationTick,
					running: terminalPresentationRunning
				},
				version: 2
			});
		},
		advanceTerminalPresentation(count = 1) {
			assertActive();
			if (!session.state.terminal || terminalPresentationRunning || !Number.isSafeInteger(count) || count < 0 || count > 24) throw new TypeError("terminal presentation requires a stopped terminal session and 0..24 ticks");
			const prior = terminalPresentationTick;
			terminalPresentationTick = Math.min(24, prior + count);
			try {
				render();
			} catch (error) {
				terminalPresentationTick = prior;
				throw error;
			}
			return api.state;
		},
		start() {
			assertActive();
			if (session.state.terminal) {
				if (terminalPresentationTick === 24 || terminalPresentationRunning) return false;
				terminalPresentationRunning = true;
				lastTimestamp = null;
				schedule();
				return true;
			}
			if (session.state.paused) return false;
			if (running && handle !== null) return false;
			running = true;
			lastTimestamp = null;
			schedule();
			return true;
		},
		stepMany(count = 1) {
			assertActive();
			if (!Number.isSafeInteger(count) || count < 0 || count > GAME_SESSION_MAX_BATCH_TICKS) throw new TypeError("game browser manual step count is invalid");
			inOperation = true;
			try {
				const before = session.state.tick;
				const events = session.stepMany(count);
				if (session.state.tick !== before) {
					if (session.state.terminal) suspendInput();
					else synchronizeInput();
				}
				render();
				stopAtTerminal();
				return events;
			} finally {
				inOperation = false;
			}
		},
		restore(bytes) {
			assertActive();
			const snapshot = checkedGameBrowserSnapshot(bytes);
			const candidate = checkedRestoreCandidate(snapshot, GameSession.restore(snapshot.session));
			return restoreCandidate(snapshot, candidate);
		},
		/** Mint an opaque, exact-browser-byte restore handle while input is suspended. */
		prepareEnduranceRestore(bytes, continuation) {
			if (!active) throw new RangeError("game browser loop is disposed");
			if (inOperation) throw new Error("game browser loop reentrant operation rejected");
			assertEndurance();
			return createGameBrowserRestoreCapability(continuation, bytes, checkedGameBrowserSnapshot(bytes).session, preparedRestoreOwner);
		},
		/**
		* Atomically install a session rebuilt by the bounded public restore cursor.
		* This is valid only inside the suspended transaction, and accepts only a
		* loop-owned opaque capability, never a raw session.
		*/
		commitEnduranceRestore(bytes, capability) {
			if (!active) throw new RangeError("game browser loop is disposed");
			if (inOperation) throw new Error("game browser loop reentrant operation rejected");
			assertEndurance();
			const snapshot = checkedGameBrowserSnapshot(bytes);
			const candidate = consumeGameBrowserRestoreCapability(capability, bytes, preparedRestoreOwner);
			checkedRestoreCandidate(snapshot, candidate);
			endurance = null;
			return restoreCandidate(snapshot, candidate);
		}
	});
	ACTIVE_ROOTS.set(checked.root, api);
	if (running) schedule();
	return api;
}
var ACTIVE_ROOTS, LAYER_NAMES;
function init_game_browser_loop() {
	return (init_game_browser_loop = __esmMin((() => {
		init_game_session();
		init_game_input_bridge();
		init_game_ui_projection();
		init_game_session_restore_continuation();
		ACTIVE_ROOTS = /* @__PURE__ */ new WeakMap();
		LAYER_NAMES = Object.freeze([
			"combat",
			"effects",
			"feedback",
			"hud"
		]);
	})))();
}
//#endregion
//#region src/ui/game-audio-bridge.js
function checkedRuntime(runtime) {
	if (!isAuthenticGameAudioRuntime(runtime)) throw new TypeError("game audio UI bridge requires an authentic runtime");
	return runtime;
}
function checkedResult(result, label) {
	if (result === null || typeof result !== "object" || typeof result.accepted !== "boolean") throw new TypeError(`${label} is not a canonical input result`);
	return result;
}
/**
* Bridge browser-only feedback receipts into the runtime's authenticated UI
* command seam. It owns one deterministic command sequence for the lifetime
* of a mounted browser graph; input remounts reuse that sequence rather than
* creating a second audio authority.
*/
function createGameAudioUiBridge(runtimeValue) {
	const runtime = checkedRuntime(runtimeValue);
	const capability = createGameAudioRuntimeUiCapability(runtime);
	let active = true;
	let nextSequence = 0;
	const dispatch = (kind, cardId = null) => {
		if (!active) throw new Error("game audio UI bridge is disposed");
		const command = {
			kind,
			sequence: nextSequence,
			tick: runtime.state.sessionTick
		};
		if (cardId !== null) command.cardId = cardId;
		const result = runtime.submitUiCommand(capability, command);
		if (result.accepted === true || result.duplicate === true) nextSequence += 1;
		return result;
	};
	const attach = (input) => {
		if (!active) throw new Error("game audio UI bridge is disposed");
		if (input === null || typeof input !== "object" && typeof input !== "function" || typeof input.setFeedback !== "function") throw new TypeError("game audio UI bridge requires a mounted arena input");
		if (attachedInputs.has(input)) throw new RangeError("game audio UI bridge is already attached");
		attachedInputs.add(input);
		try {
			input.setFeedback({
				onPlace(receipt) {
					const result = checkedResult(consumeArenaInputFeedbackReceipt(receipt).result, "arena placement feedback");
					if (result.accepted === true) {
						const cardId = result.command?.cardId;
						if (typeof cardId !== "string") throw new TypeError("accepted placement feedback is missing cardId");
						return dispatch("card-play", cardId);
					}
					return dispatch("ui-reject");
				},
				onSelect(result) {
					const checked = checkedResult(result, "arena selection feedback");
					if (checked.accepted === true) {
						if (typeof checked.cardId !== "string") throw new TypeError("accepted selection feedback is missing cardId");
						return dispatch("card-select", checked.cardId);
					}
					return dispatch("ui-reject", typeof checked.cardId === "string" ? checked.cardId : null);
				}
			});
		} catch (error) {
			attachedInputs.delete(input);
			throw error;
		}
		return true;
	};
	return Object.freeze({
		attach,
		confirm() {
			return dispatch("ui-confirm");
		},
		dispose() {
			if (!active) return false;
			active = false;
			return true;
		},
		get state() {
			return Object.freeze({
				active,
				sequence: nextSequence
			});
		},
		reject(cardId = null) {
			return dispatch("ui-reject", cardId);
		},
		toggle() {
			return dispatch("ui-toggle");
		}
	});
}
var attachedInputs;
function init_game_audio_bridge() {
	return (init_game_audio_bridge = __esmMin((() => {
		init_game_audio_runtime();
		init_input_controller();
		attachedInputs = /* @__PURE__ */ new WeakSet();
	})))();
}
//#endregion
//#region src/ui/game-audio-controls.js
function exactToggle(shell) {
	if (shell === null || typeof shell !== "object" || typeof shell.querySelectorAll !== "function" || typeof shell.addEventListener !== "function" || typeof shell.removeEventListener !== "function") throw new TypeError("game audio controls require a browser shell");
	const toggles = Array.from(shell.querySelectorAll("[data-ui=\"audio-toggle\"]"));
	if (toggles.length !== 1 || typeof toggles[0].addEventListener !== "function" || typeof toggles[0].removeEventListener !== "function" || typeof toggles[0].setAttribute !== "function") throw new TypeError("game audio controls require one audio toggle");
	return toggles[0];
}
function mountGameAudioControls(shell, browserAudio, runtime, uiBridge = null) {
	if (!isAuthenticBrowserPcmAudioSink(browserAudio) || !isAuthenticGameAudioRuntime(runtime)) throw new TypeError("game audio controls require authentic audio authorities");
	if (uiBridge !== null && (typeof uiBridge !== "object" || typeof uiBridge.toggle !== "function")) throw new TypeError("game audio controls UI bridge is invalid");
	if (activeShells.has(shell)) throw new RangeError("game audio controls are already mounted");
	const toggle = exactToggle(shell);
	let active = true;
	const render = () => {
		const muted = runtime.state.muted;
		toggle.setAttribute("aria-pressed", String(muted));
		toggle.setAttribute("aria-label", muted ? "Unmute audio" : "Mute audio");
		toggle.textContent = muted ? "Sound off" : "Sound on";
	};
	const unlock = (event) => {
		if (!active || event?.isTrusted !== true) return false;
		return browserAudio.unlock(event);
	};
	const onGesture = (event) => {
		const result = unlock(event);
		if (result !== false) result.catch(() => {});
		return result;
	};
	const onToggle = (event) => {
		if (!active || event?.isTrusted !== true) return false;
		browserAudio.unlock(event).catch(() => {});
		if (uiBridge !== null) uiBridge.toggle();
		runtime.setMuted(!runtime.state.muted);
		render();
		return true;
	};
	const gestureTypes = [
		"keydown",
		"mousedown",
		"pointerdown",
		"touchend"
	];
	const mountedGestureTypes = [];
	let toggleMounted = false;
	try {
		for (const type of gestureTypes) {
			mountedGestureTypes.push(type);
			shell.addEventListener(type, onGesture);
		}
		toggleMounted = true;
		toggle.addEventListener("click", onToggle);
		activeShells.add(shell);
		render();
	} catch (error) {
		active = false;
		for (const type of mountedGestureTypes) try {
			shell.removeEventListener(type, onGesture);
		} catch {}
		if (toggleMounted) try {
			toggle.removeEventListener("click", onToggle);
		} catch {}
		activeShells.delete(shell);
		throw error;
	}
	return Object.freeze({
		dispose() {
			if (!active) return false;
			active = false;
			const errors = [];
			for (const type of gestureTypes) try {
				shell.removeEventListener(type, onGesture);
			} catch (error) {
				errors.push(error);
			}
			try {
				toggle.removeEventListener("click", onToggle);
			} catch (error) {
				errors.push(error);
			}
			activeShells.delete(shell);
			try {
				runtime.dispose();
			} catch (error) {
				errors.push(error);
			}
			try {
				browserAudio.dispose();
			} catch (error) {
				errors.push(error);
			}
			if (errors.length > 0) throw new AggregateError(errors, "game audio controls cleanup failed");
			return true;
		},
		setGainBasisPoints(value) {
			if (!active) throw new Error("game audio controls are disposed");
			const state = runtime.setGainBasisPoints(value);
			render();
			return state;
		},
		get state() {
			const audio = browserAudio.state;
			const runtimeState = runtime.state;
			return Object.freeze({
				active,
				audio,
				gainBasisPoints: runtimeState.gainBasisPoints,
				muted: runtimeState.muted
			});
		},
		unlock
	});
}
var activeShells;
function init_game_audio_controls() {
	return (init_game_audio_controls = __esmMin((() => {
		init_game_audio_runtime();
		init_browser_audio();
		activeShells = /* @__PURE__ */ new WeakSet();
	})))();
}
//#endregion
//#region src/ui/game-browser-entry.js
function canonical(value) {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function enduranceRestoreSessionBytes(bytes) {
	return checkedGameBrowserSnapshot(bytes).session;
}
function createBulwarkNeedleSessionWitness() {
	const defaultRoster = createPlayableRoster();
	const roster = [projectSessionNonUnitBattleCard("bulwark-needle"), ...defaultRoster.filter(({ id }) => id !== "cinderlings")];
	if (roster.length !== 8 || new Set(roster.map(({ id }) => id)).size !== 8) throw new Error("Bulwark Needle witness must contain eight unique admitted cards");
	const questionKeys = [...new Set(roster.flatMap(({ entities }) => entities.flatMap((entity) => [
		entity.bodyRadiusPolicy,
		entity.projectileSpeedPolicy,
		entity.deliveryPolicy,
		entity.layerPolicy,
		entity.damagePolicy
	].filter((policy) => policy?.kind === "question").map(({ questionKey }) => questionKey))))].sort();
	const questionsByKey = new Map(createPlayableRosterQuestionRecords().map((question) => [question.key, question]));
	return {
		initialWindupTicks: {
			central: 0,
			lane: 0
		},
		questions: questionKeys.map((key) => {
			const question = questionsByKey.get(key);
			if (question === void 0) throw new Error(`Bulwark Needle witness question ${key} is missing`);
			return question;
		}),
		roster
	};
}
function createShippedGameSessionSetup(seed = 0, profile = "standard") {
	if (profile !== "standard" && profile !== "live-seed-2-terminal" && profile !== "stonehauler-witness" && profile !== "bulwark-needle-witness") throw new TypeError("shipped game session profile is invalid");
	const terminalProfile = profile === "live-seed-2-terminal";
	const witnessProfile = profile === "stonehauler-witness";
	const buildingWitnessProfile = profile === "bulwark-needle-witness";
	const witness = witnessProfile ? createSessionTroopWitness("stonehauler") : null;
	const buildingWitness = buildingWitnessProfile ? createBulwarkNeedleSessionWitness() : null;
	const selectedWitness = witness ?? buildingWitness;
	const roster = selectedWitness?.roster ?? createPlayableRoster();
	const questions = selectedWitness?.questions ?? createPlayableRosterQuestionRecords();
	return canonical({
		battleSetup: canonical({
			initialWindupTicks: terminalProfile ? {
				central: 1e4,
				lane: 1e4
			} : selectedWitness?.initialWindupTicks ?? {
				central: 0,
				lane: 0
			},
			questions,
			roster
		}),
		deck: roster.map(({ id }) => id),
		legalNorthDeployments: (terminalProfile ? [{ id: "coilblade" }] : roster).map(({ id: cardId }) => ({
			cardId,
			point: {
				x: 3500,
				y: 17500
			}
		})).sort((left, right) => left.cardId.localeCompare(right.cardId)),
		rosterWitness: canonical({
			questions,
			roster
		}),
		seed: terminalProfile ? 2 : seed,
		startingElixir: {
			north: 10,
			south: 10
		},
		thinkIntervalTicks: 60,
		thinkOffsetTicks: 0
	});
}
function sameValues(left, right) {
	return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}
/**
* Input owns a local deck/elixir mirror solely to make the next physical
* gesture legal before the session consumes it.  During a yielding segment
* that mirror can continue from its last trusted public state instead of
* repeatedly reconstructing an ever-longer session transcript.  The cache is
* owned by one input-factory closure and keyed by the exact live session.
* It is never command authority: GameInputBridge still validates/delivers to
* GameSession. Cache use is invalidated by (1) a restore or restart session
* identity change, (2) a rollback/non-monotonic mirror tick, and (3) any
* public deck or elixir mismatch after the permitted tick-only catch-up. Each
* invalidation falls back to canonical public session bytes; the WeakMap also
* releases unreachable prior sessions with its owning graph.
*/
function matchesInputSystems(systems, state) {
	const deck = systems.deck.state;
	const expectedDeck = state.decks.south;
	const elixir = systems.elixir.state;
	const expectedElixir = state.elixir.sides.south;
	return deck.sequence === expectedDeck.sequence && deck.next === expectedDeck.next && sameValues(deck.hand, expectedDeck.hand) && sameValues(deck.queue, expectedDeck.queue) && elixir.tick === state.tick && elixir.sides.south.amount === expectedElixir.amount && elixir.sides.south.accumulator === expectedElixir.accumulator;
}
function inputCardsForSession(session, cache) {
	const cached = cache.get(session);
	if (cached !== void 0) return cached;
	const setup = JSON.parse(session.serialize()).setup;
	const battleSetup = JSON.parse(setup.battleSetup);
	const profile = battleSetup.spellProfileReceipts?.profiles.find(({ profileId }) => profileId === "squall-orb-radius-v2");
	const cards = battleSetup.roster.map((card) => ({
		areaDamageRadiusMillitiles: card.id === profile?.fact.cardId ? profile.fact.areaDamageRadiusMillitiles : card.areaDamageRadiusMillitiles,
		cost: card.cost,
		count: card.count,
		damage: card.damage,
		deployTimeTicks: card.deployTimeTicks,
		displayName: card.displayName,
		entities: card.entities,
		firstHitTicks: card.firstHitTicks,
		formation: card.formation,
		hitSpeedTicks: card.hitSpeedTicks,
		hitpoints: card.hitpoints,
		id: card.id,
		kind: card.kind,
		movementMillitilesPerSecond: card.movementMillitilesPerSecond,
		rangeMillitiles: card.rangeMillitiles,
		rarity: card.rarity,
		sightRangeMillitiles: card.sightRangeMillitiles,
		targetMode: card.targetMode
	}));
	cache.set(session, cards);
	return cards;
}
function buildingPolicyQuestion(session) {
	const setup = JSON.parse(session.serialize()).setup;
	const card = JSON.parse(setup.battleSetup).roster.find(({ buildingRuntime }) => buildingRuntime?.class === "defensive" && buildingRuntime.policy?.disposition === "question");
	if (card === void 0) return null;
	const fields = card.buildingRuntime.policy.corpusFields;
	const unverifiedFields = Object.entries(fields).filter(([, record]) => record.authoritative !== true).map(([field]) => field);
	return {
		cardId: card.id,
		text: `${card.displayName} combat: QUESTION. First-hit timing is ${fields.firstHitTicks.value === null ? "absent" : "unverified"}; damage, HP, deploy, range and target fields are unverified.`,
		unverifiedFields
	};
}
function inputSystems(session, cards, cache) {
	const state = session.state;
	const continued = cache.get(session);
	if (continued !== void 0 && continued.elixir.tick <= state.tick) {
		continued.elixir.advanceTicks(state.tick - continued.elixir.tick);
		if (matchesInputSystems(continued, state)) return continued;
	}
	const snapshot = JSON.parse(session.serialize());
	const setup = snapshot.setup;
	const costs = new Map(cards.map(({ cost, id }) => [id, cost]));
	const deck = new DeckCycle({
		deck: setup.deck,
		seed: `${setup.seed}:${LOCAL_SIDE$1}`
	});
	const elixir = new ElixirMatch({ startingElixir: setup.startingElixir });
	const pending = new Set(state.pendingPlayerCommands.map(({ commandId }) => commandId));
	const commands = snapshot.transcript.filter(({ type }) => type === "submit").map(({ command }) => command).filter(({ commandId }) => !pending.has(commandId)).sort((left, right) => left.tick - right.tick || left.commandId - right.commandId);
	let commandIndex = 0;
	for (let tick = 0; tick < state.tick; tick += 1) {
		const command = commands[commandIndex];
		if (command?.tick === tick) {
			if (deck.state.hand[command.slot] !== command.cardId) throw new TypeError("shipped browser input deck diverges from session");
			elixir.scheduleSpend(tick, LOCAL_SIDE$1, costs.get(command.cardId));
			deck.play(command.cardId);
			commandIndex += 1;
		}
		elixir.step();
	}
	const systems = {
		deck,
		elixir
	};
	cache.set(session, systems);
	return systems;
}
function createProjectionLayers(shell) {
	const document = shell.ownerDocument;
	const styles = document.createElement("style");
	styles.dataset.gameBrowserStyles = "";
	styles.textContent = [
		getCombatStyleText(),
		getCombatEffectsStyleText(),
		getMatchFeedbackStyleText()
	].join("\n");
	shell.appendChild(styles);
	const layers = {};
	for (const name of [
		"combat",
		"effects",
		"feedback",
		"hud"
	]) {
		const layer = document.createElement("div");
		layer.className = `game-browser-layer game-browser-layer--${name}`;
		layer.dataset.gameBrowserLayer = name;
		(name === "combat" || name === "effects" ? shell.querySelector("[data-ui=\"arena\"]") : shell).appendChild(layer);
		layers[name] = layer;
	}
	return layers;
}
function createInputFactory(shell, audioUiBridge = null) {
	const inputSystemCache = /* @__PURE__ */ new WeakMap();
	const cardsCache = /* @__PURE__ */ new WeakMap();
	return (session, nextCommandId, selectedCardId = null, onSelection = null) => {
		const cards = inputCardsForSession(session, cardsCache);
		const cardsText = serializeArenaInputCards(cards);
		const systems = inputSystems(session, cards, inputSystemCache);
		let mounted = null;
		const updateHooks = (_selected = null, projected = systems) => {
			const slots = Array.from(shell.querySelectorAll("[data-ui=\"card-slot\"]"));
			for (let index = 0; index < slots.length; index += 1) slots[index].dataset.cardId = projected.deck.state.hand[index];
			if (mounted !== null && typeof onSelection === "function") onSelection(_selected, mounted, projected);
		};
		updateHooks();
		mounted = mountArenaInputController(shell, createArenaInputSessionContinuationCapability(cardsText, systems.deck.serializeJson(), systems.elixir.serialize(), nextCommandId, () => {}, updateHooks));
		if (selectedCardId !== null && systems.deck.state.hand.includes(selectedCardId)) {
			if (mounted.input.select(selectedCardId).accepted !== true && mounted.input.selectedCardId !== null) {
				try {
					mounted.cleanup();
				} catch {}
				throw new Error("shipped browser could not preserve selected card");
			}
		}
		if (audioUiBridge !== null) try {
			audioUiBridge.attach(mounted);
		} catch (error) {
			try {
				mounted.cleanup();
			} catch {}
			throw error;
		}
		return mounted;
	};
}
function createNativeAudioContext() {
	const Constructor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
	if (typeof Constructor !== "function") throw new TypeError("this browser does not provide Web Audio");
	return new Constructor();
}
function mountShippedGameBrowser(root, scheduler, session = null, audioContextFactory = createNativeAudioContext, deckChoiceEnabled = false) {
	if (!scheduler || typeof scheduler.requestAnimationFrame !== "function" || typeof scheduler.cancelAnimationFrame !== "function") throw new TypeError("shipped browser scheduler is invalid");
	if (typeof audioContextFactory !== "function") throw new TypeError("shipped browser audio context factory is invalid");
	if (typeof deckChoiceEnabled !== "boolean") throw new TypeError("shipped browser deck choice option is invalid");
	assertGameBrowserRootAvailable(root);
	let active = true;
	let graph = null;
	let manualStepMode = false;
	let replacing = false;
	let restartCount = 0;
	let deckChoiceOpen = false;
	let deckChoiceAvailable = deckChoiceEnabled;
	let selectedDeckProfile = "standard";
	let lastSession = session ?? new GameSession(createShippedGameSessionSetup());
	let enduranceDrive = null;
	let enduranceYield = null;
	let enduranceYieldPolicy = scheduler.scheduler !== null && (typeof scheduler.scheduler === "object" || typeof scheduler.scheduler === "function") && typeof scheduler.scheduler.yield === "function" ? "raf-scheduler-yield-raf" : "raf-raf";
	const cleanup = (candidate) => {
		const errors = [];
		if (candidate === null) return errors;
		try {
			candidate.restart.removeEventListener("click", candidate.onRestart);
		} catch (error) {
			errors.push(error);
		}
		for (const [node, event, listener] of candidate.deckChoiceListeners ?? []) try {
			node.removeEventListener(event, listener);
		} catch (error) {
			errors.push(error);
		}
		try {
			candidate.loop?.dispose();
		} catch (error) {
			errors.push(error);
		}
		try {
			candidate.audioUiBridge?.dispose();
		} catch (error) {
			errors.push(error);
		}
		try {
			candidate.controls?.dispose();
		} catch (error) {
			errors.push(error);
		}
		if (candidate.controls === null) {
			try {
				candidate.audioRuntime.dispose();
			} catch (error) {
				errors.push(error);
			}
			try {
				candidate.browserAudio.dispose();
			} catch (error) {
				errors.push(error);
			}
		}
		return errors;
	};
	const renderRestart = (candidate) => {
		if (candidate === null) return;
		const terminal = candidate.loop?.state.terminal === true;
		candidate.restart.hidden = !terminal;
		candidate.restart.setAttribute("aria-hidden", String(!terminal));
	};
	const assertActive = () => {
		if (!active || graph === null) throw new RangeError("shipped browser is disposed");
		if (replacing) throw new Error("shipped browser reentrant operation rejected");
	};
	const cancelEnduranceYield = () => {
		const pending = enduranceYield;
		if (pending === null) return false;
		enduranceYield = null;
		try {
			if (pending.frameHandle !== null) scheduler.cancelAnimationFrame(pending.frameHandle);
		} catch {}
		try {
			if (pending.secondFrameHandle !== null) scheduler.cancelAnimationFrame(pending.secondFrameHandle);
		} catch {}
		pending.reject(/* @__PURE__ */ new Error("shipped browser endurance drive was cancelled"));
		return true;
	};
	const yieldToBrowser = () => new Promise((resolve, reject) => {
		if (!active || graph === null) {
			reject(/* @__PURE__ */ new RangeError("shipped browser is disposed"));
			return;
		}
		const pending = {
			frameHandle: null,
			secondFrameHandle: null,
			reject
		};
		enduranceYield = pending;
		const complete = () => {
			if (enduranceYield !== pending) return;
			enduranceYield = null;
			resolve();
		};
		const completeOnSecondFrame = () => {
			if (enduranceYield !== pending) return;
			try {
				pending.secondFrameHandle = scheduler.requestAnimationFrame(() => {
					pending.secondFrameHandle = null;
					complete();
				});
			} catch (error) {
				if (enduranceYield === pending) enduranceYield = null;
				reject(error);
			}
		};
		try {
			pending.frameHandle = scheduler.requestAnimationFrame(() => {
				if (enduranceYield !== pending) return;
				pending.frameHandle = null;
				const taskScheduler = scheduler.scheduler;
				if (taskScheduler !== null && (typeof taskScheduler === "object" || typeof taskScheduler === "function") && typeof taskScheduler.yield === "function") {
					let yielded;
					try {
						yielded = taskScheduler.yield();
					} catch (error) {
						if (enduranceYield === pending) enduranceYield = null;
						reject(error);
						return;
					}
					if (yielded === null || typeof yielded !== "object" && typeof yielded !== "function" || typeof yielded.then !== "function") {
						if (enduranceYield === pending) enduranceYield = null;
						reject(/* @__PURE__ */ new TypeError("shipped browser scheduler yield is invalid"));
						return;
					}
					Promise.resolve(yielded).then(completeOnSecondFrame, (error) => {
						if (enduranceYield !== pending) return;
						enduranceYield = null;
						reject(error);
					});
					return;
				}
				enduranceYieldPolicy = "raf-raf";
				completeOnSecondFrame();
			});
		} catch (error) {
			if (enduranceYield === pending) enduranceYield = null;
			reject(error);
		}
	});
	const consumedRestoreCandidate = (bytes) => {
		if (typeof bytes !== "string") return null;
		try {
			const snapshot = JSON.parse(bytes);
			if (snapshot === null || Array.isArray(snapshot) || typeof snapshot.session !== "string") return null;
			return GameSession.restore(snapshot.session);
		} catch {
			return null;
		}
	};
	const buildGraph = (authenticSession, policy) => {
		const browserAudio = new BrowserPcmAudioSink(createBrowserAudioContextFactoryCapability(audioContextFactory));
		const audioRuntime = new GameAudioRuntime(authenticSession, browserAudio.createRuntimeSinkCapability());
		const audioUiBridge = createGameAudioUiBridge(audioRuntime);
		let controls = null;
		let loop = null;
		let restart = null;
		let candidate = null;
		try {
			if (policy !== null) {
				audioRuntime.setGainBasisPoints(policy.gainBasisPoints);
				audioRuntime.setMuted(policy.muted);
			}
			const shell = mountArenaShell(root);
			const questionNotice = shell.querySelector("[data-ui=\"policy-question\"]");
			const policyQuestion = buildingPolicyQuestion(authenticSession);
			if (policyQuestion !== null) {
				if (questionNotice === null) throw new TypeError("shipped browser lacks the defensive QUESTION notice");
				questionNotice.hidden = false;
				questionNotice.dataset.cardId = policyQuestion.cardId;
				questionNotice.dataset.disposition = "question";
				questionNotice.dataset.unverifiedFields = policyQuestion.unverifiedFields.join(",");
				questionNotice.textContent = policyQuestion.text;
			}
			const deckChoiceInertState = deckChoiceEnabled ? Array.from(shell.children, (node) => [node, node.inert]) : [];
			const deckChoiceOpenButton = deckChoiceEnabled ? shell.querySelector("[data-ui=\"deck-choice-open\"]") : null;
			const deckChoice = deckChoiceEnabled ? shell.querySelector("[data-ui=\"deck-choice\"]") : null;
			const deckChoiceButtons = deckChoiceEnabled ? Array.from(shell.querySelectorAll("[data-deck-choice]")) : [];
			const deckChoiceStart = deckChoiceEnabled ? shell.querySelector("[data-ui=\"deck-start\"]") : null;
			if (deckChoiceEnabled && (deckChoiceOpenButton === null || deckChoice === null || deckChoiceButtons.length !== 3 || deckChoiceStart === null)) throw new TypeError("shipped browser deck choice controls are incomplete");
			const deckChoiceListeners = [];
			const listenDeckChoice = (node, event, listener) => {
				if (node === null) return;
				node.addEventListener(event, listener);
				deckChoiceListeners.push([
					node,
					event,
					listener
				]);
			};
			const syncDeckChoice = () => {
				if (!deckChoiceEnabled) return;
				deckChoiceOpenButton.hidden = !deckChoiceAvailable || deckChoiceOpen;
				deckChoiceOpenButton.setAttribute("aria-expanded", String(deckChoiceOpen));
				deckChoice.hidden = !deckChoiceOpen;
				for (const [node, wasInert] of deckChoiceInertState) node.inert = wasInert || deckChoiceOpen && node !== deckChoice;
				for (const button of deckChoiceButtons) button.setAttribute("aria-pressed", String(button.dataset.deckChoice === selectedDeckProfile));
			};
			const onDeckChoiceOpen = (event) => {
				if (event?.isTrusted !== true || !active || graph !== candidate || replacing) return false;
				return api.openDeckChoice();
			};
			const onDeckChoiceSelect = (event) => {
				if (event?.isTrusted !== true || !active || graph !== candidate || replacing || !deckChoiceOpen) return false;
				const value = event.currentTarget?.dataset?.deckChoice;
				if (value !== "standard" && value !== "stonehauler" && value !== "bulwark-needle") return false;
				selectedDeckProfile = value;
				syncDeckChoice();
				return true;
			};
			const onDeckChoiceStart = (event) => {
				if (event?.isTrusted !== true || !active || graph !== candidate || replacing) return false;
				return api.startDeckChoice();
			};
			const onDeckChoiceKeydown = (event) => {
				if (event?.isTrusted !== true || !active || graph !== candidate || replacing || !deckChoiceOpen) return false;
				if (event.key === "Escape") {
					event.preventDefault();
					deckChoiceOpen = false;
					syncDeckChoice();
					deckChoiceOpenButton.focus({ preventScroll: true });
					return true;
				}
				if (event.key !== "Tab") return false;
				const focusable = [...deckChoiceButtons, deckChoiceStart].filter((node) => !node.disabled && !node.hidden && !node.inert);
				if (focusable.length === 0) return false;
				const currentIndex = focusable.indexOf(shell.ownerDocument.activeElement);
				const wrapsForward = !event.shiftKey && currentIndex === focusable.length - 1;
				const wrapsBackward = event.shiftKey && currentIndex === 0;
				if (!wrapsForward && !wrapsBackward && !(currentIndex === -1)) return false;
				event.preventDefault();
				focusable[event.shiftKey ? focusable.length - 1 : 0].focus({ preventScroll: true });
				return true;
			};
			const restarts = Array.from(shell.querySelectorAll("[data-ui=\"restart\"]"));
			if (restarts.length !== 1 || typeof restarts[0].addEventListener !== "function" || typeof restarts[0].removeEventListener !== "function" || typeof restarts[0].setAttribute !== "function") throw new TypeError("shipped browser requires one restart control");
			restart = restarts[0];
			syncDeckChoice();
			listenDeckChoice(deckChoiceOpenButton, "click", onDeckChoiceOpen);
			for (const button of deckChoiceButtons) listenDeckChoice(button, "click", onDeckChoiceSelect);
			listenDeckChoice(deckChoiceStart, "click", onDeckChoiceStart);
			if (deckChoiceEnabled) listenDeckChoice(shell.ownerDocument, "keydown", onDeckChoiceKeydown);
			controls = mountGameAudioControls(shell, browserAudio, audioRuntime, audioUiBridge);
			loop = mountGameBrowserLoop({
				createInput: createInputFactory(shell, audioUiBridge),
				layers: createProjectionLayers(shell),
				root,
				scheduler: {
					cancelAnimationFrame: scheduler.cancelAnimationFrame.bind(scheduler),
					requestAnimationFrame(callback) {
						return scheduler.requestAnimationFrame((timestamp) => {
							callback(timestamp);
							audioRuntime.renderFrame();
							renderRestart(candidate);
						});
					}
				},
				session: authenticSession
			});
			if (manualStepMode && !loop.state.terminal) loop.enterManualStepMode();
			const onRestart = (event) => {
				if (event?.isTrusted !== true || !active || graph !== candidate || replacing) return false;
				return api.restart();
			};
			candidate = {
				audioRuntime,
				audioToggle: shell.querySelector("[data-ui=\"audio-toggle\"]"),
				audioUiBridge,
				browserAudio,
				controls,
				deckChoice,
				deckChoiceButtons,
				deckChoiceListeners,
				deckChoiceOpenButton,
				deckChoiceStart,
				loop,
				onRestart,
				restart,
				syncDeckChoice
			};
			restart.addEventListener("click", onRestart);
			audioRuntime.renderFrame();
			renderRestart(candidate);
			if (deckChoiceOpen) deckChoiceButtons[0]?.focus({ preventScroll: true });
			return candidate;
		} catch (error) {
			const failed = candidate ?? {
				audioRuntime,
				audioUiBridge,
				browserAudio,
				controls,
				loop,
				deckChoiceListeners,
				onRestart() {},
				restart: restart ?? { removeEventListener() {} }
			};
			cleanup(failed);
			throw error;
		}
	};
	const advanceManualSegment = (count, accelerated) => {
		const events = graph.loop.stepMany(count);
		const audio = accelerated ? graph.audioRuntime.renderAcceleratedFrame() : graph.audioRuntime.renderFrame();
		renderRestart(graph);
		return {
			audio,
			events
		};
	};
	const replaceMountedSession = (freshSession, failureMessage) => {
		replacing = true;
		cancelEnduranceYield();
		graph.loop.abortEnduranceSegment();
		enduranceDrive = null;
		const previous = graph;
		const policy = {
			gainBasisPoints: previous.controls.state.gainBasisPoints,
			muted: previous.controls.state.muted
		};
		lastSession = previous.loop.session;
		graph = null;
		const cleanupErrors = cleanup(previous);
		if (cleanupErrors.length > 0) {
			active = false;
			replacing = false;
			throw new AggregateError(cleanupErrors, "shipped browser deck-choice cleanup failed");
		}
		try {
			graph = buildGraph(freshSession, policy);
			lastSession = freshSession;
			return api.state;
		} catch (error) {
			active = false;
			graph = null;
			throw new AggregateError([error], failureMessage);
		} finally {
			replacing = false;
		}
	};
	const api = Object.freeze({
		get audio() {
			assertActive();
			return graph.controls.state;
		},
		get audioDiagnostics() {
			assertActive();
			return graph.audioRuntime.state;
		},
		get audioMixAudit() {
			assertActive();
			return graph.audioRuntime.mixAudit;
		},
		get audioPcmObservations() {
			assertActive();
			return graph.browserAudio.scheduledPcmObservations;
		},
		get audioScheduledPcm() {
			assertActive();
			return graph.browserAudio.scheduledPcmObservations;
		},
		get audioContinuationBytes() {
			assertActive();
			const audio = graph.audioRuntime.state;
			return canonical({
				cursor: audio.cursor,
				disposed: audio.disposed,
				gainBasisPoints: audio.gainBasisPoints,
				muted: audio.muted,
				sessionBytes: graph.loop.session.serialize(),
				suppressedAcceleratedCueCount: audio.suppressedAcceleratedCueCount,
				terminal: audio.terminal,
				version: 1
			});
		},
		get enduranceYieldPolicy() {
			assertActive();
			return enduranceYieldPolicy;
		},
		dispose() {
			if (!active) return false;
			if (graph === null || replacing) throw new Error("shipped browser reentrant operation rejected");
			cancelEnduranceYield();
			graph.loop.abortEnduranceSegment();
			enduranceDrive = null;
			active = false;
			const current = graph;
			graph = null;
			const errors = cleanup(current);
			if (errors.length > 0) throw new AggregateError(errors, "shipped browser cleanup failed");
			return true;
		},
		/** Stop RAF advancement while retaining live pointer input for deterministic verification. */
		enterManualStepMode() {
			assertActive();
			const changed = graph.loop.enterManualStepMode();
			if (changed) manualStepMode = true;
			return changed;
		},
		/**
		* Advance one bounded manual segment.  This compatibility path is kept for
		* the short browser journey; sustained play uses driveEnduranceSegment().
		*/
		fastForwardSegment(count) {
			assertActive();
			if (!manualStepMode || !Number.isSafeInteger(count) || count < 0 || count > 1200) throw new TypeError("shipped browser fast-forward segment is invalid");
			const remaining = 18e3 - graph.loop.state.sessionTick;
			return advanceManualSegment(Math.min(count, remaining), true).events;
		},
		/**
		* Browser endurance driver: fixed one-tick simulation slices yield through real
		* RAF. Input is detached for that short segment; every 100 ticks (and the
		* terminal/final boundary) the loop atomically projects DOM and the audio runtime
		* consumes every new authority record with its bounded accelerated policy.
		* RAF is only an event-loop yield seam and never enters simulation state.
		*/
		async driveEnduranceSegment(count) {
			assertActive();
			if (!manualStepMode || !Number.isSafeInteger(count) || count < 1 || count > 300) throw new TypeError("shipped browser endurance segment is invalid");
			if (enduranceDrive !== null) throw new Error("shipped browser endurance drive is already active");
			const token = Object.freeze({});
			enduranceDrive = token;
			const candidate = graph;
			const chunks = [];
			const initialState = candidate.loop.state;
			let currentTick = initialState.sessionTick;
			let terminal = initialState.terminal;
			let remaining = Math.min(count, 18e3 - currentTick);
			let opened = false;
			try {
				candidate.loop.beginEnduranceSegment();
				opened = true;
				let simulationSliceCount = 0;
				let simulationTickCount = 0;
				let presentationEventCount = 0;
				while (remaining > 0 && !terminal) {
					const fromTick = currentTick;
					const slice = candidate.loop.advanceEnduranceSlice(Math.min(1, remaining, 100 - simulationTickCount));
					const advanced = slice.sessionTick - fromTick;
					if (advanced <= 0) throw new Error("shipped browser endurance segment did not advance");
					remaining -= advanced;
					currentTick = slice.sessionTick;
					terminal = slice.terminal;
					simulationSliceCount += 1;
					simulationTickCount += advanced;
					presentationEventCount += slice.events.length;
					if (simulationTickCount >= 100 || remaining === 0 || slice.terminal) {
						await yieldToBrowser();
						const state = candidate.loop.presentEnduranceFrame();
						await yieldToBrowser();
						const audio = candidate.audioRuntime.renderAcceleratedFrame();
						await yieldToBrowser();
						renderRestart(candidate);
						chunks.push(Object.freeze({
							audio: Object.freeze({
								authorityRecordCount: audio.state.eventCount,
								audibleCueCap: 32,
								candidateCueCount: audio.candidateCueCount,
								cursor: audio.state.cursor,
								cueSequences: Object.freeze(audio.cues.map(({ sequence }) => sequence)),
								skippedCueCount: audio.skippedCueCount,
								startSequences: Object.freeze(audio.starts.map(({ sequence }) => sequence)),
								transactionCount: audio.state.transactionCount
							}),
							domTick: state.domTick,
							eventCount: presentationEventCount,
							fromTick: state.sessionTick - simulationTickCount,
							sessionTick: state.sessionTick,
							simulationChunkTicks: 1,
							simulationSliceCount,
							simulationTickCount
						}));
						simulationSliceCount = 0;
						simulationTickCount = 0;
						presentationEventCount = 0;
					}
					if (remaining > 0 && !slice.terminal) await yieldToBrowser();
				}
				candidate.loop.finishEnduranceSegment();
				opened = false;
				return Object.freeze({
					chunks: Object.freeze(chunks),
					state: api.state,
					yieldPolicy: enduranceYieldPolicy
				});
			} finally {
				if (opened) candidate.loop.abortEnduranceSegment();
				if (enduranceDrive === token) enduranceDrive = null;
			}
		},
		pause() {
			assertActive();
			const changed = graph.loop.pause();
			graph.audioRuntime.renderFrame();
			renderRestart(graph);
			return changed;
		},
		openDeckChoice() {
			assertActive();
			if (!deckChoiceEnabled || !deckChoiceAvailable || deckChoiceOpen) return false;
			deckChoiceOpen = true;
			selectedDeckProfile = "standard";
			manualStepMode = true;
			replaceMountedSession(new GameSession(createShippedGameSessionSetup(0)), "shipped browser deck-choice reset failed");
			return true;
		},
		replaceDeck(deckIds) {
			assertActive();
			if (!graph.loop.state.paused) throw new Error("shipped browser deck replacement requires a paused match");
			const setup = createEditableGameSessionSetup(deckIds, 0);
			const currentIds = JSON.parse(graph.loop.session.serialize()).setup.deck;
			if (sameValues(currentIds, setup.deck)) return api.state;
			const state = replaceMountedSession(new GameSession(setup), "shipped browser custom deck mount failed");
			if (!graph.loop.state.paused) {
				graph.loop.pause();
				graph.audioRuntime.renderFrame();
				renderRestart(graph);
			}
			return state;
		},
		restart() {
			assertActive();
			if (!graph.loop.state.terminal) return false;
			replacing = true;
			cancelEnduranceYield();
			graph.loop.abortEnduranceSegment();
			enduranceDrive = null;
			const previous = graph;
			const audioState = previous.controls.state;
			const policy = {
				gainBasisPoints: audioState.gainBasisPoints,
				muted: audioState.muted
			};
			const currentSetup = JSON.parse(previous.loop.session.serialize()).setup;
			const defaultDeck = createPlayableRoster().map(({ id }) => id);
			const restartDefaultDeck = sameValues(currentSetup.deck, defaultDeck);
			lastSession = previous.loop.session;
			graph = null;
			const cleanupErrors = cleanup(previous);
			if (cleanupErrors.length > 0) {
				active = false;
				replacing = false;
				throw new AggregateError(cleanupErrors, "shipped browser restart cleanup failed");
			}
			try {
				const freshSession = restartDefaultDeck ? new GameSession(createShippedGameSessionSetup(0)) : new GameSession(canonical(currentSetup));
				graph = buildGraph(freshSession, policy);
				lastSession = freshSession;
				restartCount += 1;
				return api.state;
			} catch (error) {
				active = false;
				graph = null;
				throw new AggregateError([error], "shipped browser restart mount failed");
			} finally {
				replacing = false;
			}
		},
		restore(bytes) {
			assertActive();
			const candidate = consumedRestoreCandidate(bytes);
			let audioRestorePolicy = "prefix";
			if (candidate !== null) try {
				graph.audioRuntime.assertRebaseable(candidate);
			} catch (error) {
				if (!(error instanceof RangeError)) throw error;
				audioRestorePolicy = "silent-unseen";
			}
			const state = graph.loop.restore(bytes);
			if (audioRestorePolicy === "prefix") graph.audioRuntime.rebase(graph.loop.session);
			else graph.audioRuntime.rebaseSilently(graph.loop.session);
			lastSession = graph.loop.session;
			renderRestart(graph);
			return state;
		},
		/**
		* Restore a serialized browser snapshot without a synchronous transcript
		* reconstruction task. The existing session transcript remains the sole
		* authority: every replayed simulation advancement is one explicit tick,
		* and browser yields are only seams between those public operations.
		*/
		async restoreEndurance(bytes) {
			assertActive();
			if (!manualStepMode) throw new Error("shipped browser endurance restore requires manual step mode");
			if (enduranceDrive !== null) throw new Error("shipped browser endurance drive is already active");
			const token = Object.freeze({});
			enduranceDrive = token;
			const candidate = graph;
			let opened = false;
			try {
				candidate.loop.beginEnduranceSegment();
				opened = true;
				const continuation = createGameSessionRestoreContinuation(enduranceRestoreSessionBytes(bytes));
				await yieldToBrowser();
				while (!continuation.ready) {
					continuation.advance();
					await yieldToBrowser();
				}
				continuation.finalize();
				await yieldToBrowser();
				let audioRestorePolicy = "prefix";
				try {
					candidate.audioRuntime.assertRebaseable(continuation.session);
				} catch (error) {
					if (!(error instanceof RangeError)) throw error;
					audioRestorePolicy = "silent-unseen";
				}
				await yieldToBrowser();
				const capability = candidate.loop.prepareEnduranceRestore(bytes, continuation);
				const state = candidate.loop.commitEnduranceRestore(bytes, capability);
				opened = false;
				if (audioRestorePolicy === "prefix") candidate.audioRuntime.rebase(candidate.loop.session);
				else candidate.audioRuntime.rebaseSilently(candidate.loop.session);
				lastSession = candidate.loop.session;
				renderRestart(candidate);
				return state;
			} finally {
				if (opened) candidate.loop.abortEnduranceSegment();
				if (enduranceDrive === token) enduranceDrive = null;
			}
		},
		resume() {
			assertActive();
			const changed = graph.loop.resume();
			graph.audioRuntime.renderFrame();
			renderRestart(graph);
			return changed;
		},
		setAudioGainBasisPoints(value) {
			assertActive();
			return graph.controls.setGainBasisPoints(value);
		},
		startDeckChoice() {
			assertActive();
			if (!deckChoiceEnabled || !deckChoiceOpen) return false;
			deckChoiceOpen = false;
			deckChoiceAvailable = false;
			const focusMatchControl = () => {
				const control = graph?.audioToggle;
				if (control !== null && control !== void 0 && !control.hidden && !control.inert) control.focus({ preventScroll: true });
			};
			if (selectedDeckProfile === "standard") {
				manualStepMode = false;
				graph.syncDeckChoice();
				const started = graph.loop.start();
				focusMatchControl();
				return started;
			}
			const witnessProfile = selectedDeckProfile === "stonehauler" ? "stonehauler-witness" : "bulwark-needle-witness";
			manualStepMode = false;
			replaceMountedSession(new GameSession(createShippedGameSessionSetup(1, witnessProfile)), `shipped browser ${selectedDeckProfile} deck mount failed`);
			focusMatchControl();
			return true;
		},
		serialize() {
			assertActive();
			return graph.loop.serialize();
		},
		get session() {
			return graph?.loop.session ?? lastSession;
		},
		start() {
			assertActive();
			const changed = graph.loop.start();
			if (changed) manualStepMode = false;
			return changed;
		},
		get state() {
			if (graph === null) return Object.freeze({
				active: false,
				restartCount
			});
			return Object.freeze({
				...graph.loop.state,
				restartCount
			});
		},
		advanceTerminalPresentation(count = 1) {
			assertActive();
			return graph.loop.advanceTerminalPresentation(count);
		},
		stepMany(count = 1) {
			assertActive();
			return advanceManualSegment(count, false).events;
		}
	});
	try {
		graph = buildGraph(lastSession, null);
	} catch (error) {
		active = false;
		throw error;
	}
	return api;
}
var LOCAL_SIDE$1;
function init_game_browser_entry() {
	return (init_game_browser_entry = __esmMin((() => {
		init_playable_roster();
		init_session_troop_roster();
		init_editable_deck();
		init_session_card_catalog();
		init_browser_audio();
		init_game_audio_runtime();
		init_deck();
		init_elixir();
		init_game_session();
		init_arena_shell();
		init_combat_effects();
		init_combat_state();
		init_game_browser_loop();
		init_game_session_restore_continuation();
		init_input_controller();
		init_game_audio_bridge();
		init_game_audio_controls();
		init_match_feedback();
		LOCAL_SIDE$1 = "south";
	})))();
}
//#endregion
//#region src/ui/placement-feedback.js
function clone(value) {
	return JSON.parse(canonicalJson$1(value));
}
function canonicalJson$1(value) {
	if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new TypeError("canonical JSON numbers must be finite");
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError("canonical JSON arrays must be ordinary arrays");
		const descriptors = Object.getOwnPropertyDescriptors(value);
		const length = descriptors.length;
		if (!length || !Object.hasOwn(length, "value") || length.value !== value.length) throw new TypeError("canonical JSON array length is invalid");
		const parts = [];
		for (let index = 0; index < length.value; index += 1) {
			const descriptor = descriptors[String(index)];
			if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError("canonical JSON arrays must be dense data arrays");
			parts.push(canonicalJson$1(descriptor.value));
		}
		if (Object.keys(descriptors).some((key) => key !== "length" && (!/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= length.value))) throw new TypeError("canonical JSON arrays have an invalid shape");
		return `[${parts.join(",")}]`;
	}
	if (value !== null && typeof value === "object") {
		const record = dataRecord(value, "canonical JSON object");
		return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson$1(record[key])}`).join(",")}}`;
	}
	throw new TypeError("canonical JSON contains an unsupported value");
}
function dataRecord(value, label, expectedKeys = null) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null || Object.getOwnPropertySymbols(value).length !== 0) throw new TypeError(`${label} must be a plain data object`);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const keys = Object.keys(descriptors).sort();
	if (expectedKeys !== null && (keys.length !== expectedKeys.length || keys.some((key, index) => key !== [...expectedKeys].sort()[index]))) throw new TypeError(`${label} has an invalid shape`);
	for (const [key, descriptor] of Object.entries(descriptors)) if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError(`${label}.${key} must be an enumerable data property`);
	return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]));
}
function safeInteger(value, label, minimum, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be a safe integer from ${minimum} through ${maximum}`);
	return value;
}
function checkedCommand(value, expectedSequence) {
	const command = dataRecord(value, `deploy command ${expectedSequence}`, COMMAND_KEYS);
	if (typeof command.cardId !== "string" || command.cardId.length === 0 || command.cardId.length > 128 || command.side !== "south" || command.type !== "deploy") throw new TypeError(`deploy command ${expectedSequence} is invalid`);
	safeInteger(command.cost, `deploy command ${expectedSequence}.cost`, 1, 10);
	safeInteger(command.id, `deploy command ${expectedSequence}.id`, 1, DECK_MAX_PLAY_COMMANDS);
	safeInteger(command.sequence, `deploy command ${expectedSequence}.sequence`, 0, DECK_MAX_PLAY_COMMANDS - 1);
	safeInteger(command.spendSequence, `deploy command ${expectedSequence}.spendSequence`, 0);
	safeInteger(command.tick, `deploy command ${expectedSequence}.tick`, 0);
	if (command.sequence !== expectedSequence || command.id !== expectedSequence + 1) throw new TypeError(`deploy command ${expectedSequence} is noncanonical`);
	const point = validateArenaPoint(command.point, `deploy command ${expectedSequence}.point`);
	const decision = evaluateDeployment({
		destroyedOpposingLaneTowers: [],
		placementClass: "ground_entity",
		point,
		side: "south"
	});
	if (!decision.legal) throw new TypeError(`deploy command ${expectedSequence} is not legal`);
	return {
		command: clone(command),
		decision,
		point
	};
}
function checkedCommandHistory(value) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0 || value.length > 1e4) throw new TypeError("placement command history is invalid");
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const length = descriptors.length;
	if (!length || !Object.hasOwn(length, "value") || length.value !== value.length) throw new TypeError("placement command history length is invalid");
	const commands = [];
	for (let index = 0; index < length.value; index += 1) {
		const descriptor = descriptors[String(index)];
		if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError("placement command history must be dense data");
		commands.push(checkedCommand(descriptor.value, index).command);
	}
	if (Object.keys(descriptors).some((key) => key !== "length" && (!/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= length.value))) throw new TypeError("placement command history has an invalid shape");
	return commands;
}
function checkedCardId(value) {
	if (value !== null && (typeof value !== "string" || value.length === 0)) throw new TypeError("placement selected card ID is invalid");
	return value;
}
function checkedCatalog(value) {
	if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length !== 0 || value.length > 128) throw new TypeError("placement feedback card catalog is invalid");
	const catalog = /* @__PURE__ */ new Map();
	for (let index = 0; index < value.length; index += 1) {
		const card = dataRecord(value[index], `placement feedback card ${index}`, [
			"cost",
			"displayName",
			"id"
		]);
		if (typeof card.id !== "string" || card.id.length === 0 || card.id.length > 128 || typeof card.displayName !== "string" || card.displayName.length === 0 || card.displayName.length > 256) throw new TypeError(`placement feedback card ${index} is invalid`);
		safeInteger(card.cost, `placement feedback card ${index}.cost`, 1, 10);
		if (catalog.has(card.id)) throw new TypeError("placement feedback card IDs must be unique");
		catalog.set(card.id, Object.freeze(clone(card)));
	}
	return catalog;
}
function initialState() {
	return {
		command: null,
		legal: null,
		point: null,
		reason: "nothing_selected",
		selectedCardId: null,
		sequence: 0,
		status: "hidden"
	};
}
function checkedEventPoint(event, touch) {
	if (event === null || typeof event !== "object") throw new TypeError("placement pointer event must be an object");
	let clientX;
	let clientY;
	if (touch) {
		const touches = event.changedTouches;
		if (touches === null || typeof touches !== "object" || touches.length !== 1) throw new TypeError("placement touch event must contain exactly one changed touch");
		({clientX, clientY} = touches[0]);
	} else ({clientX, clientY} = event);
	if (typeof clientX !== "number" || !Number.isFinite(clientX) || typeof clientY !== "number" || !Number.isFinite(clientY)) throw new TypeError("placement pointer coordinates must be finite");
	return {
		clientX,
		clientY
	};
}
function exactNode(target, selector, label) {
	if (target === null || typeof target !== "object" || typeof target.querySelectorAll !== "function") throw new TypeError(`${label} target is invalid`);
	const nodes = Array.from(target.querySelectorAll(selector));
	if (nodes.length !== 1) throw new TypeError(`${label} must resolve to exactly one node`);
	return nodes[0];
}
function bindPlacementFeedback(node, viewValue) {
	const view = dataRecord(viewValue, "placement feedback view");
	if (node === null || typeof node !== "object" || node.dataset === null || typeof node.dataset !== "object" || node.style === null || typeof node.style !== "object" || typeof node.style.setProperty !== "function") throw new TypeError("placement feedback node is invalid");
	node.dataset.state = view.status;
	node.dataset.reason = view.reason;
	node.dataset.cardId = view.selectedCardId ?? "";
	node.dataset.commandId = view.command === null ? "" : String(view.command.id);
	const visible = view.point !== null && [
		"legal",
		"illegal",
		"accepted"
	].includes(view.status);
	const accepted = view.status === "accepted";
	const legal = view.status === "legal";
	node.style.setProperty("position", "absolute");
	node.style.setProperty("z-index", "10");
	node.style.setProperty("left", "calc(var(--placement-x) * 100% / 18000)");
	node.style.setProperty("top", "calc(var(--placement-y) * 100% / 32000)");
	node.style.setProperty("width", accepted ? "68px" : "52px");
	node.style.setProperty("height", accepted ? "68px" : "52px");
	node.style.setProperty("translate", "-50% -50%");
	node.style.setProperty("pointer-events", "none");
	node.style.setProperty("border", `4px solid ${accepted ? "#f7e6a0" : legal ? "#bfe77b" : "#ff9b7e"}`);
	node.style.setProperty("border-radius", "50%");
	node.style.setProperty("opacity", visible ? accepted ? "0.96" : "0.92" : "0");
	node.style.setProperty("background", accepted ? "#6ea35b99" : legal ? "#4b8b4ecc" : "#a9433dcc");
	node.style.setProperty("box-shadow", accepted ? "0 0 0 8px #e9cb6755, inset 0 0 0 4px #fff3b855" : legal ? "0 0 0 4px #1e4c2c99, inset 0 0 0 3px #eeffc844" : "0 0 0 4px #5d1d2499, inset 0 0 0 3px #ffe1d444");
	if (view.point === null) {
		node.style.setProperty("--placement-x", "0");
		node.style.setProperty("--placement-y", "0");
	} else {
		const point = validateArenaPoint(view.point, "placement feedback view point");
		node.style.setProperty("--placement-x", String(point.x));
		node.style.setProperty("--placement-y", String(ARENA_LENGTH_MILLITILES - point.y));
	}
	node.setAttribute?.("aria-label", view.status === "accepted" ? `Deployment accepted at ${view.point.x},${view.point.y}` : `Placement ${view.status}: ${view.reason}`);
	node.setAttribute?.("aria-hidden", visible ? "false" : "true");
	return node;
}
function mountPlacementFeedback(shell, browserInput) {
	const arena = exactNode(shell, "[data-ui=\"arena\"]", "placement feedback arena");
	if (arena.ownerDocument === null || typeof arena.ownerDocument !== "object" || typeof arena.ownerDocument.createElement !== "function" || typeof arena.appendChild !== "function" || typeof arena.addEventListener !== "function" || typeof arena.removeEventListener !== "function" || browserInput === null || typeof browserInput !== "object" || typeof browserInput.getClientRect !== "function" || typeof browserInput.setFeedback !== "function" || typeof browserInput.cleanup !== "function" || !["legacy", "pointer"].includes(browserInput.eventFamily)) throw new TypeError("placement feedback browser hooks are invalid");
	const node = arena.ownerDocument.createElement("div");
	node.className = "placement-feedback";
	node.dataset.ui = "placement-feedback";
	node.setAttribute("aria-hidden", "true");
	arena.appendChild(node);
	const controller = new PlacementFeedbackController(browserInput.cards, browserInput.input?.commands ?? []);
	const render = (view) => bindPlacementFeedback(node, view);
	const feedback = {
		onPlace(receipt) {
			render(controller.recordPlacement(receipt));
		},
		onSelect(unused, selectedCardId) {
			render(controller.select(selectedCardId));
		}
	};
	const onPointerMove = (event) => render(controller.previewClientPoint(browserInput.getClientRect(), checkedEventPoint(event, false)));
	const onTouchMove = (event) => render(controller.previewClientPoint(browserInput.getClientRect(), checkedEventPoint(event, true)));
	let pendingTouchMove = null;
	const onLegacyTouchMove = (event) => {
		const point = checkedEventPoint(event, true);
		pendingTouchMove = point;
		return render(controller.previewClientPoint(browserInput.getClientRect(), point));
	};
	const onMouseMove = (event) => {
		const point = checkedEventPoint(event, false);
		if (event.sourceCapabilities?.firesTouchEvents === true || pendingTouchMove !== null && pendingTouchMove.clientX === point.clientX && pendingTouchMove.clientY === point.clientY) {
			pendingTouchMove = null;
			return controller.view;
		}
		pendingTouchMove = null;
		return render(controller.previewClientPoint(browserInput.getClientRect(), point));
	};
	browserInput.setFeedback(feedback);
	if (browserInput.eventFamily === "pointer") arena.addEventListener("pointermove", onPointerMove);
	else {
		arena.addEventListener("touchmove", onLegacyTouchMove);
		arena.addEventListener("mousemove", onMouseMove);
	}
	render(controller.view);
	let mounted = true;
	const cleanup = () => {
		if (!mounted) return false;
		mounted = false;
		browserInput.setFeedback(null);
		if (browserInput.eventFamily === "pointer") arena.removeEventListener("pointermove", onPointerMove);
		else {
			arena.removeEventListener("touchmove", onLegacyTouchMove);
			arena.removeEventListener("mousemove", onMouseMove);
		}
		browserInput.cleanup();
		node.remove();
		return true;
	};
	return Object.freeze({
		cleanup,
		controller,
		node,
		onPointerMove,
		onMouseMove,
		onTouchMove
	});
}
var COMMAND_KEYS, ACCEPTED_RESULT_KEYS, REJECTED_RESULT_KEYS, DECIDED_REJECTION_KEYS, PREDECISION_REASONS, PlacementFeedbackController;
function init_placement_feedback() {
	return (init_placement_feedback = __esmMin((() => {
		init_arena_geometry();
		init_deployment();
		init_deck();
		init_elixir();
		init_input_controller();
		COMMAND_KEYS = Object.freeze([
			"cardId",
			"cost",
			"id",
			"point",
			"sequence",
			"side",
			"spendSequence",
			"tick",
			"type"
		]);
		ACCEPTED_RESULT_KEYS = Object.freeze([
			"accepted",
			"command",
			"confidence",
			"reason",
			"type"
		]);
		REJECTED_RESULT_KEYS = Object.freeze([
			"accepted",
			"point",
			"reason",
			"type"
		]);
		DECIDED_REJECTION_KEYS = Object.freeze([
			"accepted",
			"confidence",
			"point",
			"reason",
			"type"
		]);
		PREDECISION_REASONS = /* @__PURE__ */ new Set([
			"card_unavailable",
			"insufficient_elixir",
			"nothing_selected"
		]);
		PlacementFeedbackController = class {
			#acceptedCommands = [];
			#catalog;
			#history = [];
			#source = null;
			#state = initialState();
			constructor(cards = [], initialCommands = []) {
				this.#catalog = checkedCatalog(cards);
				this.#acceptedCommands = checkedCommandHistory(initialCommands).map((entry) => Object.freeze(clone(entry)));
			}
			get history() {
				return Object.freeze(clone(this.#history).map(Object.freeze));
			}
			get view() {
				return Object.freeze(clone(this.#state));
			}
			select(cardIdValue) {
				const cardId = checkedCardId(cardIdValue);
				return this.#commit({
					command: null,
					legal: null,
					point: null,
					reason: cardId === null ? "nothing_selected" : "awaiting_pointer",
					selectedCardId: cardId,
					status: "hidden"
				});
			}
			previewArenaPoint(pointValue) {
				if (this.#state.selectedCardId === null) return this.view;
				const point = validateArenaPoint(pointValue, "placement preview point");
				const decision = evaluateDeployment({
					destroyedOpposingLaneTowers: [],
					placementClass: "ground_entity",
					point,
					side: "south"
				});
				return this.#commit({
					command: null,
					legal: decision.legal,
					point,
					reason: decision.reason,
					selectedCardId: this.#state.selectedCardId,
					status: decision.legal ? "legal" : "illegal"
				});
			}
			previewClientPoint(rect, point) {
				const arenaPoint = clientPointToArenaPoint(rect, point);
				if (arenaPoint === null) {
					if (this.#state.selectedCardId === null) return this.view;
					return this.#commit({
						command: null,
						legal: false,
						point: null,
						reason: "outside_client_bounds",
						selectedCardId: this.#state.selectedCardId,
						status: "illegal"
					});
				}
				return this.previewArenaPoint(arenaPoint);
			}
			recordPlacement(receipt) {
				const payload = consumeArenaInputFeedbackReceipt(receipt);
				const selectedCardId = checkedCardId(payload.selectedCardIdBefore);
				const commands = checkedCommandHistory(payload.commands);
				if (this.#source !== null && payload.source !== this.#source) throw new TypeError("placement feedback source changed");
				if (commands.length < this.#acceptedCommands.length) throw new TypeError("placement command history was truncated");
				for (let index = 0; index < this.#acceptedCommands.length; index += 1) if (canonicalJson$1(commands[index]) !== canonicalJson$1(this.#acceptedCommands[index])) throw new TypeError("placement command history prefix changed");
				const resultValue = payload.result;
				const base = dataRecord(resultValue, "placement result");
				if (base.type !== "place" || typeof base.accepted !== "boolean") throw new TypeError("placement result is invalid");
				if (base.accepted) {
					const result = dataRecord(resultValue, "accepted placement result", ACCEPTED_RESULT_KEYS);
					if (selectedCardId === null || commands.length !== this.#acceptedCommands.length + 1) throw new TypeError("accepted placement result is causally stale");
					const checked = checkedCommand(result.command, commands.length - 1);
					const command = checked.command;
					const card = this.#catalog.get(command.cardId);
					if (command.cardId !== selectedCardId || card === void 0 || command.cost !== card.cost) throw new TypeError("accepted deploy command does not match selected catalog card");
					if (canonicalJson$1(command) !== canonicalJson$1(commands.at(-1))) throw new TypeError("accepted deploy command does not equal canonical input command");
					if (result.confidence !== checked.decision.confidence || result.reason !== checked.decision.reason || payload.spendSequenceProvenance !== command.spendSequence) throw new TypeError("accepted placement decision is noncanonical");
					if (typeof payload.elixir !== "string") throw new TypeError("accepted placement elixir proof is invalid");
					if (ElixirMatch.restore(payload.elixir).serialize() !== payload.elixir) throw new TypeError("accepted placement elixir proof is noncanonical");
					const spend = JSON.parse(payload.elixir).commands.at(-1);
					if (spend === void 0 || spend.cost !== command.cost || spend.side !== command.side || spend.tick !== command.tick) throw new TypeError("accepted deploy spend lacks canonical elixir provenance");
					this.#acceptedCommands = commands.map((entry) => Object.freeze(clone(entry)));
					this.#source = payload.source;
					return this.#commit({
						command,
						legal: true,
						point: checked.point,
						reason: result.reason,
						selectedCardId: null,
						status: "accepted"
					});
				}
				if (commands.length !== this.#acceptedCommands.length) throw new TypeError("rejected placement result has a causal command gap");
				const decided = Object.hasOwn(base, "confidence");
				const result = dataRecord(resultValue, "rejected placement result", decided ? DECIDED_REJECTION_KEYS : REJECTED_RESULT_KEYS);
				if (typeof result.reason !== "string" || result.reason.length === 0) throw new TypeError("rejected placement reason is invalid");
				const point = result.point === null ? null : validateArenaPoint(result.point, "rejected placement point");
				if (decided) {
					if (point === null || selectedCardId === null) throw new TypeError("decided rejection must contain an arena point");
					const decision = evaluateDeployment({
						destroyedOpposingLaneTowers: [],
						placementClass: "ground_entity",
						point,
						side: "south"
					});
					if (decision.legal || result.reason !== decision.reason || result.confidence !== decision.confidence) throw new TypeError("rejected placement decision is noncanonical");
				} else if (point === null && result.reason !== "outside_client_bounds" || point !== null && !PREDECISION_REASONS.has(result.reason) || result.reason === "nothing_selected" !== (selectedCardId === null)) throw new TypeError("predecision placement rejection is noncanonical");
				this.#source = payload.source;
				return this.#commit({
					command: null,
					legal: false,
					point,
					reason: result.reason,
					selectedCardId,
					status: "illegal"
				});
			}
			serialize() {
				return canonicalJson$1({
					history: this.#history,
					state: this.#state,
					version: 1
				});
			}
			#commit(next) {
				this.#state = {
					...next,
					sequence: this.#state.sequence + 1
				};
				this.#history.push(clone(this.#state));
				if (this.#history.length > 256) this.#history.shift();
				return this.view;
			}
		};
		Object.freeze({
			height: ARENA_LENGTH_MILLITILES,
			width: ARENA_WIDTH_MILLITILES
		});
	})))();
}
//#endregion
//#region src/ui/arena-shell-entry.js
function checkedAppBattleMessage(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
	const descriptors = Object.getOwnPropertyDescriptors(value);
	const keys = Reflect.ownKeys(descriptors);
	if (keys.length !== 3 || keys.some((key) => typeof key !== "string" || ![
		"active",
		"channel",
		"deckIds"
	].includes(key)) || Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !Object.hasOwn(descriptor, "value"))) return null;
	if (descriptors.channel.value !== "moss-and-ember-battle" || typeof descriptors.active.value !== "boolean") return null;
	const deckIds = descriptors.deckIds.value;
	if (!Array.isArray(deckIds) || Object.getPrototypeOf(deckIds) !== Array.prototype) return null;
	const deckDescriptors = Object.getOwnPropertyDescriptors(deckIds);
	const deckKeys = Reflect.ownKeys(deckDescriptors);
	if (deckKeys.length !== 9 || !Object.hasOwn(deckDescriptors.length, "value") || deckDescriptors.length.value !== 8 || deckDescriptors.length.enumerable || deckKeys.some((key) => typeof key !== "string" || key !== "length" && !/^[0-7]$/u.test(key))) return null;
	const checked = [];
	for (let index = 0; index < 8; index += 1) {
		const descriptor = deckDescriptors[String(index)];
		if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "string" || !EDITABLE_MIXED_DECK_CARD_IDS.includes(descriptor.value)) return null;
		checked.push(descriptor.value);
	}
	if (new Set(checked).size !== 8) return null;
	return {
		active: descriptors.active.value,
		deckIds: checked
	};
}
function sameDeckIds(left, right) {
	return Array.isArray(left) && left.length === right.length && left.every((id, index) => id === right[index]);
}
function canonicalJson(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
function immutableSnapshot(value) {
	const cloned = JSON.parse(canonicalJson(value));
	const freeze = (current) => {
		if (current !== null && typeof current === "object") {
			for (const child of Object.values(current)) freeze(child);
			Object.freeze(current);
		}
		return current;
	};
	return freeze(cloned);
}
function sessionAggregate(message, codes) {
	const errors = codes.map((code) => Object.freeze(new Error(code)));
	const aggregate = new AggregateError(errors, message);
	Object.freeze(aggregate.errors);
	return Object.freeze(aggregate);
}
function createInitialArenaHudSystems() {
	const cards = createPlayableRoster();
	const initialTowers = TOWER_IDS.map((id) => ({
		hitpoints: id.endsWith(":central") ? TOWER_COMBAT_CONFIG.central.hitpoints : TOWER_COMBAT_CONFIG.lane.hitpoints,
		id
	}));
	return {
		cards,
		deck: new DeckCycle({
			deck: cards.map(({ id }) => id),
			seed: INITIAL_DECK_SEED
		}),
		elixir: new ElixirMatch(),
		match: new MatchClock({ initialTowers })
	};
}
/** Capture one canonical bridge snapshot behind a fieldless single-use token. */
function createArenaSessionInjectionCapability(bridge) {
	if (arguments.length !== 1 || !isPlayerDeployBridge(bridge)) throw new TypeError("arena session injection requires one exact bridge");
	const bytes = bridge.serialize();
	const token = Object.freeze(Object.create(null));
	sessionInjectionCapabilities.set(token, bytes);
	return token;
}
function createArenaHudController(shell, systems = createInitialArenaHudSystems()) {
	function update(selectedCardId = null, projectedSystems = systems) {
		const projectedTick = projectedSystems.elixir.state.tick;
		if (projectedTick < systems.match.state.tick) throw new RangeError("arena HUD authoritative tick cannot rewind");
		systems.match.runToTick(projectedTick);
		const view = createHudViewModel({
			cards: systems.cards.map(({ cost, displayName, id }) => ({
				cost,
				displayName,
				id
			})),
			deck: projectedSystems.deck.state,
			elixir: projectedSystems.elixir.state,
			localSide: LOCAL_SIDE,
			match: systems.match.state,
			selectedCardId
		});
		bindHudViewModel(shell, view);
		return view;
	}
	function replaceInteractionSystems(next) {
		systems.deck = next.deck;
		systems.elixir = next.elixir;
	}
	const initialView = update();
	return Object.freeze({
		cards: systems.cards,
		get deck() {
			return systems.deck;
		},
		get elixir() {
			return systems.elixir;
		},
		initialView,
		match: systems.match,
		replaceInteractionSystems,
		update
	});
}
function mountArenaShellWithHud(root, injectionCapability) {
	let admittedBridgeBytes = null;
	if (arguments.length > 1) {
		admittedBridgeBytes = sessionInjectionCapabilities.get(injectionCapability);
		if (admittedBridgeBytes === void 0) {
			if (consumedSessionInjectionCapabilities.has(injectionCapability)) throw new TypeError("arena session injection capability is consumed");
			throw new TypeError("arena session injection capability is invalid");
		}
		sessionInjectionCapabilities.delete(injectionCapability);
		consumedSessionInjectionCapabilities.add(injectionCapability);
	}
	const shell = mountArenaShell(root);
	const systems = createInitialArenaHudSystems();
	const setup = parseLiveBattleSetup(canonicalJson({
		initialWindupTicks: {
			central: 0,
			lane: 0
		},
		questions: createPlayableRosterQuestionRecords(),
		roster: systems.cards
	}));
	let bridge = admittedBridgeBytes === null ? new PlayerDeployBridge({
		battle: new LiveBattle(setup),
		cards: systems.cards.map(({ cost, id }) => ({
			cost,
			id
		})),
		deck: systems.deck,
		elixir: systems.elixir
	}) : PlayerDeployBridge.restore(admittedBridgeBytes);
	if (bridge.rosterBytes !== serializeArenaInputCards(systems.cards)) throw new TypeError("arena session bridge roster does not match the shipped catalog");
	systems.deck = DeckCycle.restore(bridge.deckBytes);
	systems.elixir = ElixirMatch.restore(bridge.elixirBytes);
	const hud = createArenaHudController(shell, systems);
	let browserInput = null;
	let placementFeedback = null;
	let lifecycle = "clean";
	let operationActive = false;
	let callbackDepth = 0;
	const sessionCommit = (next) => {
		callbackDepth += 1;
		try {
			return hud.replaceInteractionSystems(next);
		} catch (error) {
			lifecycle = "faulted";
			throw error;
		} finally {
			callbackDepth -= 1;
		}
	};
	const sessionUpdate = (...args) => {
		callbackDepth += 1;
		try {
			return hud.update(...args);
		} catch (error) {
			lifecycle = "faulted";
			throw error;
		} finally {
			callbackDepth -= 1;
		}
	};
	const assertOperationAllowed = () => {
		if (callbackDepth !== 0 || operationActive) throw new Error("arena authoritative session reentrant operation rejected");
		if (lifecycle === "disposed") throw new Error("arena authoritative session is disposed");
		if (lifecycle === "faulted") throw new Error("arena authoritative session is terminally faulted");
	};
	const synchronizeHud = () => {
		hud.replaceInteractionSystems({
			deck: DeckCycle.restore(bridge.deckBytes),
			elixir: ElixirMatch.restore(bridge.elixirBytes)
		});
		hud.update();
	};
	const mountInput = () => {
		browserInput = mountArenaInputController(shell, createArenaInputHudCapability(serializeArenaInputCards(hud.cards), bridge.deckBytes, bridge.elixirBytes, sessionCommit, sessionUpdate, createArenaInputBridgeWitness(bridge)));
		try {
			placementFeedback = mountPlacementFeedback(shell, browserInput);
		} catch (error) {
			try {
				browserInput.cleanup();
			} catch {}
			browserInput = null;
			placementFeedback = null;
			throw error;
		}
		lifecycle = "active";
	};
	const cleanupInputInternal = () => {
		if (placementFeedback !== null) {
			const cleaned = placementFeedback.cleanup();
			placementFeedback = null;
			browserInput = null;
			lifecycle = "clean";
			return cleaned;
		}
		if (browserInput !== null) {
			const cleaned = browserInput.cleanup();
			browserInput = null;
			lifecycle = "clean";
			return cleaned;
		}
		return false;
	};
	const bridgeDiagnostic = () => {
		const state = bridge.state;
		return immutableSnapshot({
			battle: state.battle,
			bytes: bridge.serialize(),
			deck: {
				bytes: bridge.deckBytes,
				state: state.deck
			},
			elixir: {
				bytes: bridge.elixirBytes,
				state: state.elixir
			},
			processedCommandIds: state.processedCommandIds,
			replay: bridge.replay,
			rosterBytes: bridge.rosterBytes,
			tick: state.tick
		});
	};
	const inputDiagnostic = () => browserInput === null ? null : immutableSnapshot({
		commands: browserInput.input.commands,
		deck: browserInput.input.deck,
		elixir: browserInput.input.elixir,
		faultCode: browserInput.input.faultCode,
		replay: browserInput.input.replay,
		selectedCardId: browserInput.input.selectedCardId
	});
	const placementDiagnostic = () => placementFeedback === null ? null : immutableSnapshot({
		history: placementFeedback.controller.history,
		view: placementFeedback.controller.view
	});
	const failTerminally = () => {
		try {
			cleanupInputInternal();
		} catch {}
		lifecycle = "faulted";
	};
	const cleanupInput = () => {
		assertOperationAllowed();
		if (lifecycle === "clean") return false;
		operationActive = true;
		try {
			return cleanupInputInternal();
		} catch (error) {
			failTerminally();
			throw sessionAggregate("arena authoritative cleanup failed", ["input cleanup failed"]);
		} finally {
			operationActive = false;
		}
	};
	const remountInput = () => {
		assertOperationAllowed();
		if (lifecycle !== "clean") throw new Error("arena authoritative remount requires clean input");
		operationActive = true;
		try {
			synchronizeHud();
			mountInput();
			return inputDiagnostic();
		} catch (error) {
			failTerminally();
			throw sessionAggregate("arena authoritative remount failed", ["input remount failed"]);
		} finally {
			operationActive = false;
		}
	};
	const restoreBridge = (bytes) => {
		assertOperationAllowed();
		if (lifecycle !== "clean") throw new Error("arena authoritative bridge restore requires input cleanup");
		const candidate = PlayerDeployBridge.restore(bytes);
		if (candidate.rosterBytes !== serializeArenaInputCards(hud.cards) || candidate.state.tick < hud.match.state.tick) throw new RangeError("arena authoritative bridge restore is incompatible");
		const previousBytes = bridge.serialize();
		operationActive = true;
		try {
			bridge = candidate;
			synchronizeHud();
			lifecycle = "clean";
			return bridgeDiagnostic();
		} catch (error) {
			try {
				bridge = PlayerDeployBridge.restore(previousBytes);
				synchronizeHud();
				lifecycle = "clean";
			} catch {
				failTerminally();
			}
			throw sessionAggregate("arena authoritative bridge restore failed", [lifecycle === "faulted" ? "restore rollback failed" : "restore rejected"]);
		} finally {
			operationActive = false;
		}
	};
	const advance = (ticks) => {
		assertOperationAllowed();
		if (!Number.isSafeInteger(ticks) || ticks < 0 || ticks > 18e3) throw new TypeError("arena authoritative advance ticks are invalid");
		const wasActive = lifecycle === "active";
		const previousBytes = bridge.serialize();
		const candidate = PlayerDeployBridge.restore(previousBytes);
		candidate.stepMany(ticks);
		operationActive = true;
		try {
			if (wasActive) cleanupInputInternal();
			bridge = candidate;
			synchronizeHud();
			if (wasActive) mountInput();
			else lifecycle = "clean";
			return bridgeDiagnostic();
		} catch (error) {
			try {
				cleanupInputInternal();
				bridge = PlayerDeployBridge.restore(previousBytes);
				synchronizeHud();
				if (wasActive) mountInput();
				else lifecycle = "clean";
			} catch {
				failTerminally();
			}
			throw sessionAggregate("arena authoritative advance failed", [lifecycle === "faulted" ? "advance rollback failed" : "advance rejected"]);
		} finally {
			operationActive = false;
		}
	};
	const disposeSession = () => {
		if (lifecycle === "disposed") return false;
		if (callbackDepth !== 0 || operationActive) throw new Error("arena authoritative session reentrant operation rejected");
		operationActive = true;
		try {
			cleanupInputInternal();
		} catch {
			lifecycle = "faulted";
		} finally {
			operationActive = false;
		}
		lifecycle = "disposed";
		return true;
	};
	mountInput();
	mountCombatLayer(shell);
	return Object.freeze({
		advance,
		get battle() {
			return immutableSnapshot(bridge.state.battle);
		},
		get bridge() {
			return bridgeDiagnostic();
		},
		get deck() {
			return immutableSnapshot({
				bytes: bridge.deckBytes,
				state: bridge.state.deck
			});
		},
		get elixir() {
			return immutableSnapshot({
				bytes: bridge.elixirBytes,
				state: bridge.state.elixir
			});
		},
		get input() {
			return inputDiagnostic();
		},
		get placementFeedback() {
			return placementDiagnostic();
		},
		get status() {
			return lifecycle;
		},
		cards: immutableSnapshot(hud.cards),
		cleanupInput,
		disposeSession,
		initialView: immutableSnapshot(hud.initialView),
		get match() {
			return immutableSnapshot(hud.match.state);
		},
		remountInput,
		restoreBridge
	});
}
var INITIAL_DECK_SEED, LOCAL_SIDE, TOWER_IDS, sessionInjectionCapabilities, consumedSessionInjectionCapabilities, arenaHudController;
function init_arena_shell_entry() {
	return (init_arena_shell_entry = __esmMin((() => {
		init_arena_shell();
		init_game_browser_entry();
		init_game_session();
		init_editable_deck();
		init_playable_roster();
		init_deck();
		init_elixir();
		init_game_player_deploy();
		init_live_battle();
		init_match();
		init_towers();
		init_hud_state();
		init_input_controller();
		init_placement_feedback();
		init_combat_state();
		INITIAL_DECK_SEED = 0;
		LOCAL_SIDE = "south";
		TOWER_IDS = Object.freeze([
			"north:central",
			"north:lane:left",
			"north:lane:right",
			"south:central",
			"south:lane:left",
			"south:lane:right"
		]);
		sessionInjectionCapabilities = /* @__PURE__ */ new WeakMap();
		consumedSessionInjectionCapabilities = /* @__PURE__ */ new WeakSet();
		arenaHudController = typeof document === "object" && document !== null && typeof window === "object" && window !== null ? (() => {
			const parameters = new URLSearchParams(window.location.search);
			const profile = parameters.get("session-profile");
			const appFrameValue = parameters.get("app-frame");
			if (appFrameValue !== null && appFrameValue !== "1") throw new TypeError("public app frame option is invalid");
			const appFrame = appFrameValue === "1";
			if (appFrame) document.body.dataset.appFrame = "true";
			if (profile !== null && profile !== "live-seed-2-terminal" && profile !== "stonehauler-witness") throw new TypeError("public game session profile is invalid");
			const session = profile === null ? null : new GameSession(createShippedGameSessionSetup(profile === "live-seed-2-terminal" ? 2 : 1, profile));
			const controller = mountShippedGameBrowser(document.querySelector("[data-arena-shell-root]"), window, session, void 0, profile === null && !appFrame);
			if (appFrame) {
				controller.pause();
				window.addEventListener("message", (event) => {
					if (event.source !== window.parent || event.origin !== window.location.origin) return;
					const message = checkedAppBattleMessage(event.data);
					if (message === null) return;
					const currentDeck = JSON.parse(controller.session.serialize()).setup.deck;
					if (!sameDeckIds(currentDeck, message.deckIds)) controller.replaceDeck(message.deckIds);
					if (message.active) controller.resume();
					else controller.pause();
				});
			}
			return controller;
		})() : null;
	})))();
}
//#endregion
export { init_arena_shell_entry as a, createInitialArenaHudSystems as i, createArenaHudController as n, mountArenaShellWithHud as o, createArenaSessionInjectionCapability as r, arenaHudController as t };
