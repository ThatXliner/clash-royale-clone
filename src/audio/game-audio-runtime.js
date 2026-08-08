import { isAuthenticGameSession } from "../sim/game-session.js";
import { AudioEventProjection } from "./audio-events.js";
import {
  AUDIO_RENDERER_MAX_BATCH,
  AudioRenderer,
  InMemoryPcmAudioBackend,
} from "./audio-renderer.js";

const VERSION = 1;
const MAX_SNAPSHOT_BYTES = 8 * 1_024 * 1_024;
const authenticGameAudioRuntimes = new WeakSet();
const runtimeSinkCapabilities = new WeakMap();
const consumedRuntimeSinkCapabilities = new WeakSet();
const SNAPSHOT_GRAPH_LIMITS = Object.freeze({
  arrayLength: 20_000,
  containers: 100_000,
  depth: 128,
  keys: 1_024,
  nodes: 200_000,
  stringLength: 4 * 1_024 * 1_024,
});

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isolated(value) {
  const cloned = JSON.parse(canonical(value));
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
  if (value.type === "session-deployed") {
    return { ...value.deployment, tick: value.tick, type: "deployed" };
  }
  return value;
}

function preflightSnapshotGraph(root) {
  const pending = [{ depth: 0, value: root }];
  let containers = 0;
  let nodes = 0;
  while (pending.length > 0) {
    const { depth, value } = pending.pop();
    nodes += 1;
    if (nodes > SNAPSHOT_GRAPH_LIMITS.nodes || depth > SNAPSHOT_GRAPH_LIMITS.depth) {
      throw new TypeError("game audio runtime snapshot graph exceeds its bound");
    }
    if (typeof value === "string") {
      if (value.length > SNAPSHOT_GRAPH_LIMITS.stringLength) {
        throw new TypeError("game audio runtime snapshot string exceeds its bound");
      }
      continue;
    }
    if (value === null || typeof value === "boolean" ||
        (typeof value === "number" && Number.isSafeInteger(value))) continue;
    if (typeof value !== "object") {
      throw new TypeError("game audio runtime snapshot contains an invalid value");
    }
    containers += 1;
    if (containers > SNAPSHOT_GRAPH_LIMITS.containers) {
      throw new TypeError("game audio runtime snapshot graph exceeds its bound");
    }
    if (Array.isArray(value)) {
      if (value.length > SNAPSHOT_GRAPH_LIMITS.arrayLength) {
        throw new TypeError("game audio runtime snapshot array exceeds its bound");
      }
      for (let index = value.length - 1; index >= 0; index -= 1) {
        pending.push({ depth: depth + 1, value: value[index] });
      }
      continue;
    }
    const keys = Object.keys(value);
    if (keys.length > SNAPSHOT_GRAPH_LIMITS.keys) {
      throw new TypeError("game audio runtime snapshot object exceeds its bound");
    }
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (key.length > SNAPSHOT_GRAPH_LIMITS.stringLength ||
          ["__proto__", "constructor", "prototype"].includes(key)) {
        throw new TypeError("game audio runtime snapshot key is invalid");
      }
      pending.push({ depth: depth + 1, value: value[key] });
    }
  }
}

function checkedSnapshot(bytes) {
  if (typeof bytes !== "string" || new TextEncoder().encode(bytes).byteLength >
      MAX_SNAPSHOT_BYTES) {
    throw new TypeError("game audio runtime snapshot must be bounded canonical text");
  }
  let parsed;
  try { parsed = JSON.parse(bytes); }
  catch { throw new TypeError("game audio runtime snapshot must be valid JSON"); }
  preflightSnapshotGraph(parsed);
  if (canonical(parsed) !== bytes || parsed === null || Array.isArray(parsed) ||
      Object.getPrototypeOf(parsed) !== Object.prototype ||
      Object.keys(parsed).sort().join(",") !==
        "cursor,disposed,eventBytes,gainBasisPoints,generation,muted,projection,sessionBytes,version" ||
      parsed.version !== VERSION || !Number.isSafeInteger(parsed.cursor) ||
      parsed.cursor < 0 || !Number.isSafeInteger(parsed.generation) ||
      parsed.generation < 0 || !Array.isArray(parsed.eventBytes) ||
      parsed.eventBytes.length !== parsed.cursor ||
      parsed.eventBytes.some((entry) => typeof entry !== "string") ||
      typeof parsed.projection !== "string" || typeof parsed.sessionBytes !== "string" ||
      (parsed.disposed !== true && parsed.disposed !== false) ||
      !Number.isSafeInteger(parsed.gainBasisPoints) || parsed.gainBasisPoints < 0 ||
      parsed.gainBasisPoints > 10_000 ||
      (parsed.muted !== true && parsed.muted !== false)) {
    throw new TypeError("game audio runtime snapshot is invalid");
  }
  return parsed;
}

export function isAuthenticGameAudioRuntime(value) {
  return authenticGameAudioRuntimes.has(value);
}

/** Capture one browser sink without exposing it on the runtime surface. */
export function createGameAudioRuntimeSinkCapability(sink) {
  if (arguments.length !== 1 || typeof sink !== "function") {
    throw new TypeError("game audio runtime sink must be one function");
  }
  const capability = Object.freeze(Object.create(null));
  runtimeSinkCapabilities.set(capability, sink);
  return capability;
}

export class GameAudioRuntime {
  #backend;
  #cursor = 0;
  #disposed = false;
  #eventBytes = [];
  #generation = 0;
  #observedTick;
  #projection;
  #renderer;
  #session;
  #sink = null;

  constructor(session, sinkCapability) {
    if ((arguments.length !== 1 && arguments.length !== 2) ||
        !isAuthenticGameSession(session)) {
      throw new TypeError("game audio runtime requires one authentic GameSession");
    }
    if (arguments.length === 2) {
      const sink = runtimeSinkCapabilities.get(sinkCapability);
      if (sink === undefined) {
        if (consumedRuntimeSinkCapabilities.has(sinkCapability)) {
          throw new TypeError("game audio runtime sink capability is consumed");
        }
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

  #resetAudioGraph(gainBasisPoints = 10_000, muted = false) {
    this.#backend = new InMemoryPcmAudioBackend(
      this.#sink === null ? {} : { sink: this.#sink },
    );
    this.#renderer = new AudioRenderer({
      backend: this.#backend,
      gainBasisPoints,
      muted,
    });
    this.#projection = new AudioEventProjection();
    this.#cursor = 0;
    this.#eventBytes = [];
    this.#disposed = false;
  }

  #isPrefix(replay) {
    return this.#cursor <= replay.length && this.#eventBytes.every(
      (bytes, index) => canonical(replay[index]) === bytes,
    );
  }

  renderFrame() {
    if (this.#renderer.state.faulted) {
      throw new Error("game audio runtime is permanently faulted");
    }
    const replay = this.#session.replay;
    const sessionTick = this.#session.state.tick;
    if (sessionTick < this.#observedTick || !this.#isPrefix(replay)) {
      const controls = this.#renderer.state;
      if (!this.#disposed) this.#renderer.dispose();
      this.#generation += 1;
      this.#resetAudioGraph(controls.gainBasisPoints, controls.muted);
    }
    this.#observedTick = sessionTick;
    if (this.#disposed) {
      return isolated({ cues: [], starts: [], stops: [], state: this.state });
    }
    const entries = replay.slice(this.#cursor).map((event, offset) => ({
      event: normalizeSessionEvent(event),
      sequence: this.#cursor + offset,
      tick: event.tick ?? this.#session.state.tick,
    }));
    const records = entries.length === 0 ? [] : this.#projection.projectBatch(entries);
    const cues = records.filter(({ cueId }) => cueId !== null);
    const starts = [];
    const stops = [];
    for (let index = 0; index < cues.length;) {
      const tick = cues[index].tick;
      stops.push(...this.#renderer.cleanupThroughTick(tick));
      let end = index;
      while (end < cues.length && cues[end].tick === tick) end += 1;
      for (let offset = index; offset < end; offset += AUDIO_RENDERER_MAX_BATCH) {
        starts.push(...this.#renderer.renderBatch(
          cues.slice(offset, Math.min(offset + AUDIO_RENDERER_MAX_BATCH, end)),
        ));
      }
      index = end;
    }
    this.#eventBytes.push(...replay.slice(this.#cursor).map(canonical));
    this.#cursor = replay.length;
    const tick = sessionTick;
    stops.push(...this.#renderer.cleanupThroughTick(tick));
    if (this.#session.state.terminal) {
      stops.push(...this.#renderer.dispose());
      this.#disposed = true;
    }
    return isolated({ cues, starts, stops, state: this.state });
  }

  restart(session) {
    if (!isAuthenticGameSession(session)) {
      throw new TypeError("game audio runtime restart requires an authentic GameSession");
    }
    const controls = this.#renderer.state;
    if (!this.#disposed) this.#renderer.dispose();
    this.#session = session;
    this.#generation += 1;
    this.#resetAudioGraph(controls.gainBasisPoints, controls.muted);
    this.#observedTick = session.state.tick;
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

  get cues() { return this.#projection.cues; }

  get state() {
    return isolated({
      cursor: this.#cursor,
      cueCount: this.#projection.cues.length,
      disposed: this.#disposed,
      eventCount: this.#projection.records.length,
      faulted: this.#renderer.state.faulted,
      gainBasisPoints: this.#renderer.state.gainBasisPoints,
      generation: this.#generation,
      muted: this.#renderer.state.muted,
      renderer: this.#renderer.state,
      sessionTick: this.#session.state.tick,
      terminal: this.#session.state.terminal,
      transactionCount: this.#backend.state.transactionCount,
    });
  }

  get transactions() { return this.#backend.transactions; }

  serialize() {
    return canonical({
      cursor: this.#cursor,
      disposed: this.#disposed,
      eventBytes: this.#eventBytes,
      gainBasisPoints: this.#renderer.state.gainBasisPoints,
      generation: this.#generation,
      muted: this.#renderer.state.muted,
      projection: this.#projection.serialize(),
      sessionBytes: this.#session.serialize(),
      version: VERSION,
    });
  }

  static restore(bytes, session, sinkCapability) {
    if (arguments.length !== 2 && arguments.length !== 3) {
      throw new TypeError("game audio runtime restore arguments are invalid");
    }
    const snapshot = checkedSnapshot(bytes);
    if (!isAuthenticGameSession(session)) {
      throw new TypeError("game audio runtime restore requires an authentic GameSession");
    }
    if (session.serialize() !== snapshot.sessionBytes) {
      throw new TypeError("game audio runtime snapshot diverges from session");
    }
    const projection = AudioEventProjection.restore(snapshot.projection);
    if (projection.state.nextSequence !== snapshot.cursor) {
      throw new TypeError("game audio runtime projection cursor diverges");
    }
    const replay = session.replay;
    if (replay.length !== snapshot.cursor || snapshot.eventBytes.some(
      (event, index) => event !== canonical(replay[index]),
    )) {
      throw new TypeError("game audio runtime event prefix diverges");
    }
    const runtime = arguments.length === 3
      ? new GameAudioRuntime(session, sinkCapability)
      : new GameAudioRuntime(session);
    runtime.#projection = projection;
    runtime.#cursor = snapshot.cursor;
    runtime.#eventBytes = [...snapshot.eventBytes];
    runtime.#generation = snapshot.generation;
    if (snapshot.gainBasisPoints !== 10_000) {
      runtime.#renderer.setGainBasisPoints(snapshot.gainBasisPoints);
    }
    if (snapshot.muted) runtime.#renderer.setMuted(true);
    if (snapshot.disposed) {
      runtime.#renderer.dispose();
      runtime.#disposed = true;
    }
    return runtime;
  }
}
