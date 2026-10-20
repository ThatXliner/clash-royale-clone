const hasOwn = (value, key) =>
  Object.prototype.hasOwnProperty.call(value, key);

function assertTick(tick, label = "tick") {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
}

function assertJsonValue(value, path = "$", seen = new Set()) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} must contain only finite numbers`);
    }
    return;
  }

  if (typeof value !== "object") {
    throw new TypeError(`${path} must be plain JSON data`);
  }

  if (seen.has(value)) {
    throw new TypeError(`${path} must not contain cycles`);
  }
  seen.add(value);

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!hasOwn(value, index)) {
        throw new TypeError(`${path} must not contain sparse arrays`);
      }
      assertJsonValue(value[index], `${path}[${index}]`, seen);
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain only plain objects`);
    }
    for (const key of Object.keys(value)) {
      assertJsonValue(value[key], `${path}.${key}`, seen);
    }
  }

  seen.delete(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalize(value[key]);
    }
    return result;
  }
  return value;
}

function cloneJson(value, label = "value") {
  assertJsonValue(value, label);
  return canonicalize(value);
}

export function canonicalJson(value) {
  return JSON.stringify(cloneJson(value));
}

export class FixedStepWorld {
  #tick;
  #state;
  #pending;
  #replay;
  #nextSequence;
  #reducer;

  constructor({ initialState = {}, reducer, tick = 0 } = {}) {
    assertTick(tick);
    if (typeof reducer !== "function") {
      throw new TypeError("reducer must be a function");
    }

    this.#tick = tick;
    this.#state = cloneJson(initialState, "initialState");
    this.#pending = [];
    this.#replay = [];
    this.#nextSequence = 0;
    this.#reducer = reducer;
  }

  get tick() {
    return this.#tick;
  }

  get state() {
    return cloneJson(this.#state, "state");
  }

  get replayLog() {
    return cloneJson(this.#replay, "replayLog");
  }

  schedule(tick, command) {
    assertTick(tick, "scheduled tick");
    if (tick < this.#tick) {
      throw new RangeError(
        `cannot schedule tick ${tick}; next unresolved tick is ${this.#tick}`,
      );
    }

    const entry = {
      command: cloneJson(command, "command"),
      sequence: this.#nextSequence,
      tick,
    };
    this.#nextSequence += 1;
    this.#pending.push(entry);
    this.#pending.sort(
      (left, right) =>
        left.tick - right.tick || left.sequence - right.sequence,
    );
    return entry.sequence;
  }

  step() {
    const resolvingTick = this.#tick;
    const due = [];
    while (
      this.#pending.length > 0 &&
      this.#pending[0].tick === resolvingTick
    ) {
      due.push(this.#pending.shift());
    }

    const resolved = [];
    for (const scheduled of due) {
      const draft = cloneJson(this.#state, "state");
      const emitted = [];
      const context = Object.freeze({
        emit(event) {
          emitted.push(cloneJson(event, "event"));
        },
        sequence: scheduled.sequence,
        tick: resolvingTick,
      });
      const returned = this.#reducer(
        draft,
        cloneJson(scheduled.command, "command"),
        context,
      );
      this.#state = cloneJson(
        returned === undefined ? draft : returned,
        "reducer result",
      );

      const replayEntry = {
        command: scheduled.command,
        events: emitted,
        sequence: scheduled.sequence,
        tick: resolvingTick,
      };
      this.#replay.push(replayEntry);
      resolved.push(cloneJson(replayEntry));
    }

    this.#tick += 1;
    return resolved;
  }

  runThrough(targetTick) {
    assertTick(targetTick, "target tick");
    if (targetTick < this.#tick) {
      throw new RangeError(
        `target tick ${targetTick} is before next unresolved tick ${this.#tick}`,
      );
    }
    const resolved = [];
    while (this.#tick <= targetTick) {
      resolved.push(...this.step());
    }
    return resolved;
  }

  replayBytes() {
    return canonicalJson(this.#replay);
  }

  serialize() {
    return canonicalJson({
      nextSequence: this.#nextSequence,
      pending: this.#pending,
      replay: this.#replay,
      state: this.#state,
      tick: this.#tick,
      version: 1,
    });
  }

  static restore(serialized, { reducer } = {}) {
    if (typeof serialized !== "string") {
      throw new TypeError("serialized snapshot must be a string");
    }

    let snapshot;
    try {
      snapshot = JSON.parse(serialized);
    } catch {
      throw new TypeError("serialized snapshot must be valid JSON");
    }
    assertJsonValue(snapshot, "snapshot");
    if (
      snapshot.version !== 1 ||
      !Number.isSafeInteger(snapshot.nextSequence) ||
      snapshot.nextSequence < 0 ||
      !Array.isArray(snapshot.pending) ||
      !Array.isArray(snapshot.replay)
    ) {
      throw new TypeError("serialized snapshot has an invalid shape");
    }
    assertTick(snapshot.tick);

    const world = new FixedStepWorld({
      initialState: snapshot.state,
      reducer,
      tick: snapshot.tick,
    });
    world.#pending = cloneJson(snapshot.pending, "snapshot.pending");
    world.#replay = cloneJson(snapshot.replay, "snapshot.replay");
    world.#nextSequence = snapshot.nextSequence;
    world.#validateRestoredSchedule();
    return world;
  }

  #validateRestoredSchedule() {
    let previousTick = -1;
    let previousSequence = -1;
    const sequences = new Set();

    for (const entry of this.#pending) {
      if (
        entry === null ||
        typeof entry !== "object" ||
        !hasOwn(entry, "command")
      ) {
        throw new TypeError("snapshot contains an invalid pending command");
      }
      assertTick(entry.tick, "pending tick");
      if (
        entry.tick < this.#tick ||
        !Number.isSafeInteger(entry.sequence) ||
        entry.sequence < 0 ||
        entry.sequence >= this.#nextSequence ||
        sequences.has(entry.sequence)
      ) {
        throw new TypeError("snapshot contains an invalid pending command");
      }
      if (
        entry.tick < previousTick ||
        (entry.tick === previousTick && entry.sequence <= previousSequence)
      ) {
        throw new TypeError("snapshot pending commands are not ordered");
      }
      sequences.add(entry.sequence);
      previousTick = entry.tick;
      previousSequence = entry.sequence;
    }
  }
}
