import {
  GAME_SESSION_MAX_BATCH_TICKS,
  GameSession,
  isAuthenticGameSession,
} from "../sim/game-session.js";
import { GameInputBridge } from "./game-input-bridge.js";
import { createGameUiFrame, mountGameUiProjection } from "./game-ui-projection.js";
import {
  consumeGameBrowserRestoreCapability,
  createGameBrowserRestoreCapability,
} from "./game-session-restore-continuation.js";

export const GAME_BROWSER_TICKS_PER_SECOND = 60;
export const GAME_BROWSER_MAX_TICKS_PER_FRAME = 120;
export const GAME_BROWSER_MAX_BACKLOG_TICKS = 240;
export const GAME_BROWSER_SNAPSHOT_VERSION = 1;

const ACTIVE_ROOTS = new WeakMap();
const LAYER_NAMES = Object.freeze(["combat", "effects", "feedback", "hud"]);

export function assertGameBrowserRootAvailable(root) {
  if (!root || (typeof root !== "object" && typeof root !== "function")) {
    throw new TypeError("game browser root is invalid");
  }
  if (ACTIVE_ROOTS.has(root)) throw new RangeError("game browser root is already mounted");
  return true;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function exact(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  if (actual.length !== expected.length ||
      actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has an invalid shape`);
  }
  return value;
}

function checkedSnapshot(bytes) {
  if (typeof bytes !== "string" || bytes.length > 64 * 1_024 * 1_024) {
    throw new TypeError("game browser snapshot must be bounded canonical JSON");
  }
  let value;
  try { value = JSON.parse(bytes); } catch {
    throw new TypeError("game browser snapshot must be valid JSON");
  }
  exact(value, ["bridge", "running", "session", "version"], "game browser snapshot");
  if (value.version !== GAME_BROWSER_SNAPSHOT_VERSION ||
      typeof value.bridge !== "string" || typeof value.session !== "string" ||
      typeof value.running !== "boolean" || canonical(value) !== bytes) {
    throw new TypeError("game browser snapshot is invalid");
  }
  return value;
}

function checkedLayers(value) {
  const layers = exact(value, LAYER_NAMES, "game browser layers");
  for (const name of LAYER_NAMES) {
    if (!layers[name] || typeof layers[name] !== "object" ||
        typeof layers[name].replaceChildren !== "function") {
      throw new TypeError(`game browser ${name} layer is invalid`);
    }
  }
  return layers;
}

function checkedScheduler(value) {
  const scheduler = exact(value, ["cancelAnimationFrame", "requestAnimationFrame"],
    "game browser scheduler");
  if (typeof scheduler.cancelAnimationFrame !== "function" ||
      typeof scheduler.requestAnimationFrame !== "function") {
    throw new TypeError("game browser scheduler methods are invalid");
  }
  return scheduler;
}

function cleanupGraph(graph) {
  const errors = [];
  if (graph === null) return errors;
  try { graph.bridge.unsubscribe(); } catch (error) { errors.push(error); }
  try { graph.input?.cleanup(); } catch (error) { errors.push(error); }
  try { graph.projection.cleanup(); } catch (error) { errors.push(error); }
  return errors;
}

/**
 * Own one browser-facing session graph. RAF timestamps decide only how many
 * explicit simulation ticks to request; they never enter simulation state.
 */
export function mountGameBrowserLoop(options) {
  const checked = exact(options, ["createInput", "layers", "root", "scheduler", "session"],
    "game browser options");
  assertGameBrowserRootAvailable(checked.root);
  if (!isAuthenticGameSession(checked.session)) {
    throw new TypeError("game browser loop requires one authentic GameSession");
  }
  if (typeof checked.createInput !== "function") {
    throw new TypeError("game browser input factory is invalid");
  }
  const layers = checkedLayers(checked.layers);
  const scheduler = checkedScheduler(checked.scheduler);
  let session = checked.session;
  let graph = null;
  let active = true;
  let running = !session.state.paused && !session.state.terminal;
  let handle = null;
  let lastTimestamp = null;
  let fractionalTicks = 0;
  let backlogTicks = 0;
  let domTick = -1;
  // An endurance transaction deliberately holds pointer input detached while
  // simulation yields back to the browser.  That prevents a stale controller
  // from observing a half-presented session; finishEnduranceSegment() mounts
  // exactly one fresh controller against the committed session state.
  let endurance = null;
  let inOperation = false;
  let selectedCardId = null;
  // This never leaves the loop closure. A prepared restore capability minted
  // for one loop cannot be consumed by any other mounted loop.
  const preparedRestoreOwner = Object.freeze({});

  const assertActive = () => {
    if (!active) throw new RangeError("game browser loop is disposed");
    if (inOperation) throw new Error("game browser loop reentrant operation rejected");
    if (endurance !== null) throw new Error("game browser endurance transaction is active");
  };
  const render = () => {
    const frame = createGameUiFrame(session);
    graph.projection.project(frame);
    domTick = frame.tick;
    if (domTick !== session.state.tick) throw new Error("game browser DOM tick diverged");
    return frame;
  };
  const nextCommandId = (bridgeBytes) => bridgeBytes === null ? 1 :
    JSON.parse(bridgeBytes).deliveries.length + 1;
  const buildGraph = (candidateSession, bridgeBytes = null) => {
    const input = checked.createInput(candidateSession, nextCommandId(bridgeBytes),
      selectedCardId);
    let bridge = null, projection = null;
    try {
      bridge = bridgeBytes === null
        ? new GameInputBridge(input, candidateSession)
        : GameInputBridge.restore(bridgeBytes, input, candidateSession);
      projection = mountGameUiProjection(layers);
      const candidate = { bridge, input, projection };
      graph = candidate;
      return candidate;
    } catch (error) {
      try { bridge?.unsubscribe(); } catch {}
      try { input?.cleanup(); } catch {}
      try { projection?.cleanup(); } catch {}
      throw error;
    }
  };
  const synchronizeInput = () => {
    const bridgeBytes = graph.bridge.serialize();
    selectedCardId = typeof graph.input?.selectedCardId === "string"
      ? graph.input.selectedCardId : null;
    graph.bridge.unsubscribe(); graph.input.cleanup();
    graph = { ...graph, input: null };
    let input = null, bridge = null;
    try {
      input = checked.createInput(session, nextCommandId(bridgeBytes), selectedCardId);
      bridge = GameInputBridge.restore(bridgeBytes, input, session);
      graph = { ...graph, bridge, input };
    } catch (error) {
      try { bridge?.unsubscribe(); } catch {}
      try { input?.cleanup(); } catch {}
      running = false; cancel();
      throw error;
    }
  };
  const suspendInput = () => {
    if (graph.input === null) return false;
    selectedCardId = typeof graph.input.selectedCardId === "string"
      ? graph.input.selectedCardId : null;
    graph.bridge.unsubscribe(); graph.input.cleanup();
    graph = { ...graph, input: null }; return true;
  };
  const resumeInput = () => {
    if (graph.input !== null) return false;
    const bridgeBytes = graph.bridge.serialize();
    const input = checked.createInput(session, nextCommandId(bridgeBytes), selectedCardId);
    let bridge;
    try { bridge = GameInputBridge.restore(bridgeBytes, input, session); }
    catch (error) { try { input.cleanup(); } catch {} throw error; }
    graph = { ...graph, bridge, input }; return true;
  };
  const cancel = () => {
    if (handle === null) return false;
    scheduler.cancelAnimationFrame(handle); handle = null; return true;
  };
  const stopAtTerminal = () => {
    if (!session.state.terminal) return false;
    running = false; cancel(); lastTimestamp = null; fractionalTicks = 0; backlogTicks = 0;
    suspendInput();
    return true;
  };
  const checkedRestoreCandidate = (snapshot, candidate) => {
    if (!isAuthenticGameSession(candidate) || candidate.serialize() !== snapshot.session) {
      throw new TypeError("game browser restore candidate is not the supplied session snapshot");
    }
    if (snapshot.running && (candidate.state.paused || candidate.state.terminal)) {
      throw new TypeError("game browser running snapshot is incoherent");
    }
    return candidate;
  };
  const restoreCandidate = (snapshot, candidate) => {
    inOperation = true;
    try {
      cancel();
      const cleanupErrors = cleanupGraph(graph); graph = null;
      if (cleanupErrors.length) {
        active = false; ACTIVE_ROOTS.delete(checked.root);
        throw new AggregateError(cleanupErrors, "game browser restore cleanup failed");
      }
      session = candidate; selectedCardId = null;
      buildGraph(session, snapshot.bridge);
      running = snapshot.running; lastTimestamp = null; fractionalTicks = 0; backlogTicks = 0;
      render();
      if (session.state.paused || session.state.terminal) suspendInput();
      if (running) schedule();
      return api.state;
    } catch (error) {
      cancel(); running = false;
      if (graph === null) {
        active = false; ACTIVE_ROOTS.delete(checked.root);
      }
      throw error;
    } finally { inOperation = false; }
  };
  const assertEndurance = () => {
    if (endurance === null) throw new Error("game browser endurance transaction is inactive");
  };
  const finishEndurance = (aborted) => {
    assertEndurance();
    inOperation = true;
    try {
      // A caller may end a segment early only on failure.  Keep the DOM
      // transactional even then, so cleanup or a later caller never observes
      // a simulation tick that was not projected.
      if (domTick !== session.state.tick) render();
      if (session.state.terminal) stopAtTerminal(); else resumeInput();
      endurance = null;
      return Object.freeze({ aborted, state: api.state });
    } catch (error) {
      running = false; cancel();
      // The graph remains safely input-suspended if rehydration failed.
      endurance = null;
      throw error;
    } finally { inOperation = false; }
  };
  const schedule = () => {
    if (!active || !running || handle !== null || session.state.terminal) return false;
    handle = scheduler.requestAnimationFrame(onFrame);
    return true;
  };
  const onFrame = (timestamp) => {
    if (!active || !running) return;
    handle = null;
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
      running = false; throw new TypeError("game browser frame timestamp is invalid");
    }
    if (lastTimestamp === null) lastTimestamp = timestamp;
    else {
      const elapsed = Math.max(0, timestamp - lastTimestamp);
      lastTimestamp = timestamp;
      fractionalTicks += elapsed * GAME_BROWSER_TICKS_PER_SECOND;
      const presentedTicks = Math.floor(fractionalTicks / 1_000);
      fractionalTicks -= presentedTicks * 1_000;
      backlogTicks = Math.min(GAME_BROWSER_MAX_BACKLOG_TICKS,
        backlogTicks + presentedTicks);
    }
    const count = Math.min(GAME_BROWSER_MAX_TICKS_PER_FRAME, backlogTicks);
    if (count > 0) {
      const before = session.state.tick;
      session.stepMany(count);
      const advanced = session.state.tick - before;
      backlogTicks = Math.max(0, backlogTicks - advanced);
      if (session.state.terminal) suspendInput(); else synchronizeInput();
      render();
    }
    if (!stopAtTerminal()) schedule();
  };

  buildGraph(session);
  try { render(); } catch (error) { cleanupGraph(graph); graph = null; throw error; }
  if (session.state.paused || session.state.terminal) suspendInput();
  const api = Object.freeze({
    dispose() {
      if (!active) return false;
      assertActive(); inOperation = true;
      cancel(); running = false;
      const errors = cleanupGraph(graph); graph = null; active = false;
      ACTIVE_ROOTS.delete(checked.root); inOperation = false;
      if (errors.length) throw new AggregateError(errors, "game browser cleanup failed");
      return true;
    },
    enterManualStepMode() {
      assertActive();
      if (!running || session.state.terminal) return false;
      running = false; cancel(); lastTimestamp = null; fractionalTicks = 0; backlogTicks = 0;
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
      if (running || state.paused || state.terminal) {
        throw new Error("game browser endurance requires an active manual session");
      }
      inOperation = true;
      try {
        suspendInput();
        endurance = Object.freeze({ fromTick: state.tick, sessionTick: state.tick });
        return Object.freeze({ fromTick: state.tick, domTick });
      } finally { inOperation = false; }
    },
    /** Advance simulation only; presentation is committed separately. */
    advanceEnduranceSlice(count) {
      if (!active) throw new RangeError("game browser loop is disposed");
      if (inOperation) throw new Error("game browser loop reentrant operation rejected");
      assertEndurance();
      if (!Number.isSafeInteger(count) || count < 1 || count > GAME_SESSION_MAX_BATCH_TICKS) {
        throw new TypeError("game browser endurance slice count is invalid");
      }
      inOperation = true;
      try {
        const fromTick = endurance.sessionTick;
        const events = session.stepMany(count);
        const state = session.state;
        endurance = Object.freeze({ fromTick: endurance.fromTick, sessionTick: state.tick });
        return Object.freeze({ events, fromTick, sessionTick: state.tick, terminal: state.terminal });
      } finally { inOperation = false; }
    },
    /** Commit one complete DOM projection for all prior endurance slices. */
    presentEnduranceFrame() {
      if (!active) throw new RangeError("game browser loop is disposed");
      if (inOperation) throw new Error("game browser loop reentrant operation rejected");
      assertEndurance();
      inOperation = true;
      try { render(); if (session.state.terminal) stopAtTerminal(); return api.state; }
      finally { inOperation = false; }
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
    get session() { return session; },
    get state() { const state = session.state; return Object.freeze({ active, backlogTicks, domTick,
      enduranceActive: endurance !== null,
      paused: state.paused, running, scheduled: handle !== null,
      selectedCardId: typeof graph?.input?.selectedCardId === "string"
        ? graph.input.selectedCardId : selectedCardId,
      sessionTick: state.tick, terminal: state.terminal }); },
    pause() {
      assertActive();
      if (session.state.paused || session.state.terminal) return false;
      inOperation = true;
      try { session.pause(); running = false; cancel(); suspendInput(); lastTimestamp = null;
        fractionalTicks = 0; backlogTicks = 0; render(); return true; }
      finally { inOperation = false; }
    },
    resume() {
      assertActive();
      if (!session.state.paused || session.state.terminal) return false;
      inOperation = true;
      try { resumeInput(); session.resume(); running = true; render(); schedule(); return true; }
      finally { inOperation = false; }
    },
    serialize() {
      assertActive();
      return canonical({ bridge: graph.bridge.serialize(), running,
        session: session.serialize(), version: GAME_BROWSER_SNAPSHOT_VERSION });
    },
    start() { assertActive(); if (session.state.paused || session.state.terminal) return false;
      if (running && handle !== null) return false;
      running = true; lastTimestamp = null; schedule(); return true; },
    stepMany(count = 1) {
      assertActive();
      if (!Number.isSafeInteger(count) || count < 0 || count > GAME_SESSION_MAX_BATCH_TICKS) {
        throw new TypeError("game browser manual step count is invalid");
      }
      inOperation = true;
      try { const before = session.state.tick; const events = session.stepMany(count);
        if (session.state.tick !== before) {
          if (session.state.terminal) suspendInput(); else synchronizeInput();
        }
        render(); stopAtTerminal(); return events; }
      finally { inOperation = false; }
    },
    restore(bytes) {
      assertActive();
      const snapshot = checkedSnapshot(bytes);
      const candidate = checkedRestoreCandidate(snapshot, GameSession.restore(snapshot.session));
      return restoreCandidate(snapshot, candidate);
    },
    /** Mint an opaque, exact-browser-byte restore handle while input is suspended. */
    prepareEnduranceRestore(bytes, continuation) {
      if (!active) throw new RangeError("game browser loop is disposed");
      if (inOperation) throw new Error("game browser loop reentrant operation rejected");
      assertEndurance();
      const snapshot = checkedSnapshot(bytes);
      return createGameBrowserRestoreCapability(continuation, bytes, snapshot.session,
        preparedRestoreOwner);
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
      const snapshot = checkedSnapshot(bytes);
      const candidate = consumeGameBrowserRestoreCapability(capability, bytes,
        preparedRestoreOwner);
      checkedRestoreCandidate(snapshot, candidate);
      endurance = null;
      return restoreCandidate(snapshot, candidate);
    },
  });
  ACTIVE_ROOTS.set(checked.root, api);
  if (running) schedule();
  return api;
}
