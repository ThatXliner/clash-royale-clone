import {
  GameSession,
  isAuthenticGameSession,
  isAuthenticGameSessionProjectionSnapshot,
} from "../sim/game-session.js";
import { MatchClock } from "../sim/match.js";
import {
  bindCombatEffectsViewModel,
  createCombatEffectsViewModel,
  serializeCombatEffectsViewModel,
} from "./combat-effects.js";
import {
  bindCombatViewModel,
  createCombatViewModel,
  serializeCombatViewModel,
} from "./combat-state.js";
import {
  createHudViewModel,
  getHudMarkup,
  serializeHudViewModel,
} from "./hud-state.js";
import {
  bindMatchFeedback,
  MatchFeedbackProjector,
  serializeMatchFeedbackViewModel,
} from "./match-feedback.js";

export const GAME_UI_FRAME_VERSION = 1;

const FRAMES = new WeakSet();
const FRAME_PARTS = new WeakSet();
const OPTIONS = new WeakSet();
const STRUCTURE_IDS = new Map([
  [Number.MAX_SAFE_INTEGER - 5, "south:central"],
  [Number.MAX_SAFE_INTEGER - 4, "south:lane:west"],
  [Number.MAX_SAFE_INTEGER - 3, "south:lane:east"],
  [Number.MAX_SAFE_INTEGER - 2, "north:central"],
  [Number.MAX_SAFE_INTEGER - 1, "north:lane:west"],
  [Number.MAX_SAFE_INTEGER, "north:lane:east"],
]);
const MATCH_FEEDBACK_TOWER_IDS = Object.freeze([
  "north:central",
  "north:lane:left",
  "north:lane:right",
  "south:central",
  "south:lane:left",
  "south:lane:right",
]);

function ownRecord(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) ||
      Object.getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError(`${label} must be a plain data object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length ||
      actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has an invalid shape`);
  }
  return Object.fromEntries(keys.map((key) => {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
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
  if (!Number.isSafeInteger(value) || value < 0 || value > 18_000) {
    throw new TypeError(`${label} must be a canonical match tick`);
  }
  return value;
}

function targetId(value) {
  return STRUCTURE_IDS.get(value) ?? value;
}

function combatState(state, effectEvents) {
  const aliveIds = new Set([
    ...state.battle.units.filter((unit) => unit.hitpoints > 0).map((unit) => unit.id),
    ...state.battle.towers.filter((tower) => tower.hitpoints > 0).map((tower) => tower.id),
  ]);
  const liveTargetId = (value) => {
    const mapped = targetId(value);
    return aliveIds.has(mapped) ? mapped : null;
  };
  const entities = state.battle.units.map((unit) => ({
    hitpoints: unit.hitpoints,
    id: unit.id,
    kind: unit.archetypeId,
    layer: unit.layer,
    maxHitpoints: unit.maxHealth,
    position: unit.position,
    side: unit.side,
    targetId: liveTargetId(unit.targetId),
  }));
  const towers = state.battle.towers.map((tower) => ({
    hitpoints: tower.hitpoints,
    id: tower.id,
    maxHitpoints: tower.maxHitpoints,
    position: tower.position,
    role: tower.role,
    side: tower.side,
    targetId: liveTargetId(tower.attack.targetId),
  }));
  const roots = new Map(effectEvents
    .filter(({ parentId, phase }) => parentId === null && phase === "open")
    .map((event) => [event.rootId, event]));
  const relevant = effectEvents.filter(({ phase }) =>
    ["contact", "damage", "death"].includes(phase));
  const tail = relevant.slice(-2_048);
  const events = tail.map((event, sequence) => ({
    entityId: event.phase === "contact"
      ? roots.get(event.rootId)?.payload.sourceId ?? event.payload.targetId
      : event.payload.targetId,
    sequence,
    tick: event.tick,
    type: event.phase === "contact" ? "target" : event.phase,
  }));
  return { entities, events, tick: state.tick, towers };
}

function feedbackTowerId(value) {
  if (value.endsWith(":west")) return `${value.slice(0, -4)}left`;
  if (value.endsWith(":east")) return `${value.slice(0, -4)}right`;
  return value;
}

function feedbackTowerOrder(left, right) {
  return MATCH_FEEDBACK_TOWER_IDS.indexOf(left.id) -
    MATCH_FEEDBACK_TOWER_IDS.indexOf(right.id);
}

function initialFeedbackTowers(snapshot) {
  return snapshot.state.battle.towers.map(({ id, maxHitpoints }) => ({
    hitpoints: maxHitpoints,
    id: feedbackTowerId(id),
  })).sort(feedbackTowerOrder);
}

function feedbackEvents(session, snapshot, initialTowers) {
  const clock = snapshot.state.clock;
  const initial = new Map(initialTowers.map(({ hitpoints, id }) => [id, hitpoints]));
  const hasTowerDelta = clock.towers.some(({ hitpoints, id }) => hitpoints !== initial.get(id));
  const hasDestruction = clock.destroyedTowerIds.length > 0;
  const hasResult = clock.result !== null;
  if (!hasDestruction && !hasResult) {
    if (!hasTowerDelta) {
      return clock.phase === "overtime"
        ? [{ tick: 10_800, type: "overtime_started" }]
        : [];
    }
    // Tower health without a destruction has no visible feedback effect. A
    // single canonical evidence record keeps the causal match projector in
    // sync while avoiding the session's private event stream entirely.
    const evidence = {
      accepted: true,
      destroyedTowerIds: [],
      sequence: 0,
      tick: clock.tick - 1,
      type: "tower_evidence",
    };
    const overtime = { tick: 10_800, type: "overtime_started" };
    return clock.phase === "overtime"
      ? evidence.tick < overtime.tick ? [evidence, overtime] : [overtime, evidence]
      : [evidence];
  }
  // Match feedback is the separate non-combat consumer that still needs its
  // event stream for destruction timing and terminal results. Combat/effects
  // presentation receives only the closed feed view.
  return session.replay.filter(({ type }) => [
    "tower_evidence", "overtime_started", "match_end", "tiebreak",
  ].includes(type));
}

function feedbackEvidenceTowers(initialTowers, currentTowers, previousTowers, event,
  tiebreak, isLastAcceptedBeforeTiebreak) {
  const destroyed = new Set(event.accepted === false ? [] : event.destroyedTowerIds);
  const current = new Map(currentTowers.map(({ hitpoints, id }) => [id, hitpoints]));
  return initialTowers.map(({ hitpoints: initialHitpoints, id }) => {
    if (destroyed.has(id)) return { hitpoints: 0, id };
    let desired = current.get(id);
    if (!Number.isSafeInteger(desired) || desired <= 0) desired = initialHitpoints;
    if (isLastAcceptedBeforeTiebreak && tiebreak?.drainedTowerIds.includes(id)) {
      const side = id.startsWith("north:") ? "north" : "south";
      desired = tiebreak.minima[side];
    }
    const prior = previousTowers.find((tower) => tower.id === id);
    return { hitpoints: Math.min(prior?.hitpoints ?? initialHitpoints, desired), id };
  });
}

function createSessionMatchFeedbackViewModelWithoutSnapshotReplay(session, snapshot) {
  const state = snapshot.state.clock;
  const initialTowers = initialFeedbackTowers(snapshot);
  const events = feedbackEvents(session, snapshot, initialTowers);
  const evidenceEvents = events.filter(({ type }) => type === "tower_evidence");
  const tiebreak = events.findLast(({ type }) => type === "tiebreak") ?? null;
  const acceptedEvidence = evidenceEvents
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.accepted !== false);
  const lastAcceptedBeforeTiebreak = tiebreak === null
    ? -1
    : (acceptedEvidence.findLast(({ event }) => event.tick < 18_000)?.index ?? -1);
  const currentTowers = state.towers;
  const match = new MatchClock({ initialTowers });
  let previousTowers = initialTowers;
  for (const [index, event] of evidenceEvents.entries()) {
    const accepted = event.accepted !== false;
    const towers = accepted
      ? feedbackEvidenceTowers(initialTowers, currentTowers, previousTowers, event,
        tiebreak, index === lastAcceptedBeforeTiebreak)
      : previousTowers;
    const destroyedTowerIds = towers.filter(({ hitpoints }) => hitpoints === 0)
      .map(({ id }) => id);
    match.scheduleTowerEvidence(event.tick, {
      destroyedTowerIds,
      towers,
    });
    previousTowers = towers;
  }
  match.runToTick(state.tick);
  const projector = new MatchFeedbackProjector();
  return projector.project(state, events, {
    replayBytes: match.replayBytes(),
    snapshot: match.serialize(),
  });
}

function mintFrameParts(snapshot, combat, effects, feedback, hud) {
  if (!isAuthenticGameSessionProjectionSnapshot(snapshot)) {
    throw new TypeError("game UI frame parts require an authentic projection snapshot");
  }
  const parts = Object.freeze({ combat, effects, feedback, hud,
    sequence: snapshot.sequence, source: snapshot.source, tick: snapshot.state.tick,
    version: GAME_UI_FRAME_VERSION });
  FRAME_PARTS.add(parts);
  return parts;
}

export function composeGameUiFrame(value) {
  // WeakSet membership is deliberately the first and only operation on an
  // untrusted value. It rejects object, callable, cross-realm and revoked
  // proxies without invoking any proxy trap or accessor.
  if (!FRAME_PARTS.has(value)) {
    throw new TypeError("game UI frame parts must be minted by this module");
  }
  const frame = value;
  if (frame.version !== GAME_UI_FRAME_VERSION) {
    throw new TypeError("game UI frame version is unsupported");
  }
  const tick = checkedTick(frame.tick, "game UI frame.tick");
  // Serializers are capability checks: each view must have been admitted by
  // its own projector, not merely resemble one structurally.
  serializeHudViewModel(frame.hud);
  serializeCombatViewModel(frame.combat);
  serializeCombatEffectsViewModel(frame.effects);
  serializeMatchFeedbackViewModel(frame.feedback);
  if ([frame.hud.tick, frame.combat.tick, frame.effects.tick, frame.feedback.tick]
    .some((candidate) => candidate !== tick)) {
    throw new TypeError("all game UI projections must use the same tick");
  }
  if (!Number.isSafeInteger(frame.sequence) || frame.sequence < 0 ||
      !frame.source || typeof frame.source !== "object") {
    throw new TypeError("game UI frame identity is invalid");
  }
  const admitted = freeze({ ...frame, tick });
  FRAMES.add(admitted);
  return admitted;
}

export function createGameUiOptions(localSide = "south", selectedCardId = null) {
  if ((localSide !== "north" && localSide !== "south") ||
      (selectedCardId !== null && typeof selectedCardId !== "string")) {
    throw new TypeError("game UI options are invalid");
  }
  const options = Object.freeze({ localSide, selectedCardId });
  OPTIONS.add(options);
  return options;
}

const DEFAULT_GAME_UI_OPTIONS = createGameUiOptions();

export function createGameUiFrame(session, options = DEFAULT_GAME_UI_OPTIONS) {
  if (!isAuthenticGameSession(session)) {
    throw new TypeError("game UI frame requires an authentic GameSession");
  }
  // As with composed frames, membership is the only operation on untrusted
  // options. Proxies and accessors cannot participate in admission.
  if (!OPTIONS.has(options)) {
    throw new TypeError("game UI options must be minted by this module");
  }
  const snapshot = GameSession.prototype.projectionSnapshot.call(session);
  const state = snapshot.state;
  if (state.tick !== state.battle.tick || state.tick !== state.clock.tick ||
      state.tick !== state.elixir.tick) {
    throw new TypeError("game session projection ticks diverge");
  }
  const setup = snapshot.setup;
  const battleSetup = JSON.parse(setup.battleSetup);
  const cards = battleSetup.roster.map(({ cost, displayName, id }) => ({ cost, displayName, id }));
  const hud = createHudViewModel({
    cards,
    deck: state.decks[options.localSide],
    elixir: state.elixir,
    localSide: options.localSide,
    match: state.clock,
    selectedCardId: options.selectedCardId,
  });
  // Validate and normalize the closed producer feed before deriving any
  // combat presentation. The combat state and effects view share this one
  // admitted source; neither consumes the session replay dialect.
  const effects = createCombatEffectsViewModel(snapshot.combatEffectFeed, state.tick);
  const feedback = createSessionMatchFeedbackViewModelWithoutSnapshotReplay(session, snapshot);
  return composeGameUiFrame(mintFrameParts(
    snapshot,
    createCombatViewModel(combatState(state, effects.events)),
    effects,
    feedback,
    hud,
  ));
}

function checkedLayer(value, label) {
  if (!value || typeof value !== "object" || typeof value.replaceChildren !== "function" ||
      !value.ownerDocument || typeof value.ownerDocument.createElement !== "function") {
    throw new TypeError(`${label} must be a DOM layer`);
  }
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

export function mountGameUiProjection(value) {
  const layers = ownRecord(value, ["combat", "effects", "feedback", "hud"],
    "game UI projection layers");
  for (const name of ["combat", "effects", "feedback", "hud"]) {
    layers[name] = checkedLayer(layers[name], `game UI ${name} layer`);
  }
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
      for (const name of ["hud", "feedback", "effects", "combat"]) {
        layers[name].replaceChildren();
      }
      active = false;
      return true;
    },
    project(frame) {
      if (!active) throw new RangeError("game UI projection is cleaned up");
      if (poisoned) throw new Error("game UI projection is poisoned");
      if (!frame || typeof frame !== "object" || !FRAMES.has(frame)) {
        throw new TypeError("game UI projection requires a canonical session frame");
      }
      if (frame.tick < lastTick) throw new RangeError("game UI frame tick cannot move backward");
      if (source !== null && frame.source !== source) {
        throw new RangeError("game UI frame belongs to a different session");
      }
      if (frame.sequence <= lastSequence) {
        throw new RangeError("game UI frame sequence must advance strictly");
      }

      const prior = Object.fromEntries(Object.entries(layers)
        .map(([name, layer]) => [name, children(layer)]));

      // Complete every projection against detached layers before the first
      // write to live DOM. A hostile document therefore cannot partially
      // advance any visible subsystem.
      const staged = {
        combat: stage(layers.combat),
        effects: stage(layers.effects),
        feedback: stage(layers.feedback),
        hud: stage(layers.hud),
      };
      bindCombatViewModel(staged.combat, frame.combat);
      bindCombatEffectsViewModel(staged.effects, frame.effects);
      bindMatchFeedback(staged.feedback, frame.feedback);
      const hudFrame = layers.hud.ownerDocument.createElement("div");
      hudFrame.className = "game-ui-hud-frame";
      hudFrame.dataset.tick = String(frame.tick);
      hudFrame.innerHTML = getHudMarkup(frame.hud);
      staged.hud.replaceChildren(hudFrame);

      const committed = [];
      try {
        for (const name of ["combat", "effects", "feedback", "hud"]) {
          // Register the layer before invoking hostile DOM. A conforming or
          // adversarial replaceChildren may mutate and then throw.
          committed.push(name);
          const candidate = children(staged[name]);
          layers[name].replaceChildren(...candidate);
          if (!sameChildren(children(layers[name]), candidate)) {
            throw new Error(`game UI ${name} layer did not commit its candidate`);
          }
        }
      } catch (error) {
        const rollbackErrors = [];
        for (let index = committed.length - 1; index >= 0; index -= 1) {
          const name = committed[index];
          try {
            layers[name].replaceChildren(...prior[name]);
            if (!sameChildren(children(layers[name]), prior[name])) {
              throw new Error(`game UI ${name} layer did not restore its prior children`);
            }
          } catch (caught) {
            rollbackErrors.push(caught);
          }
        }
        if (rollbackErrors.length > 0) {
          poisoned = true;
          throw new AggregateError([error, ...rollbackErrors],
            "game UI projection is poisoned after rollback failure");
        }
        throw error;
      }
      lastTick = frame.tick;
      lastSequence = frame.sequence;
      source = frame.source;
      return frame;
    },
  });
}
