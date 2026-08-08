export const ELIXIR_TICKS_PER_SECOND = 60;
export const ELIXIR_ACCUMULATOR_DENOMINATOR = 168;
export const ELIXIR_CAPACITY = 10;
export const ESTIMATED_STARTING_ELIXIR = 5;
export const ELIXIR_MATCH_TICKS = 18_000;
export const ELIXIR_MAX_PENDING_SPENDS = 10_000;
export const ELIXIR_MAX_HISTORY_ENTRIES = 100_000;

const SIDES = Object.freeze(["south", "north"]);
const SIDE_SET = new Set(SIDES);
const PHASES = Object.freeze([
  Object.freeze({
    name: "single",
    fromTick: 0,
    toTick: 7_200,
    numeratorPerTick: 1,
    ticksPerElixir: 168,
    confidence: "high",
  }),
  Object.freeze({
    name: "double",
    fromTick: 7_200,
    toTick: 14_400,
    numeratorPerTick: 2,
    ticksPerElixir: 84,
    confidence: "high",
  }),
  Object.freeze({
    name: "triple",
    fromTick: 14_400,
    toTick: 18_000,
    numeratorPerTick: 3,
    ticksPerElixir: 56,
    confidence: "normalized_exact_third",
  }),
]);
export const ELIXIR_MAX_GENERATED_EVENTS =
  SIDES.length *
  Math.floor(
    PHASES.reduce(
      (total, phase) =>
        total +
        (phase.toTick - phase.fromTick) * phase.numeratorPerTick,
      0,
    ) / ELIXIR_ACCUMULATOR_DENOMINATOR,
  );
export const ELIXIR_MAX_EVENT_ENTRIES =
  ELIXIR_MAX_HISTORY_ENTRIES + ELIXIR_MAX_GENERATED_EVENTS;

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null) &&
    Object.getOwnPropertySymbols(value).length === 0
  );
}

function assertExactKeys(value, expected, label) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new TypeError(`${label} has an invalid shape`);
  }
}

function assertSafeTick(value, label = "tick") {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalize(value[key]);
    }
    return result;
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function validateSideState(value, label) {
  assertExactKeys(value, ["accumulator", "amount"], label);
  if (
    !Number.isInteger(value.amount) ||
    value.amount < 0 ||
    value.amount > ELIXIR_CAPACITY
  ) {
    throw new TypeError(`${label}.amount must be an integer from 0 to 10`);
  }
  if (
    !Number.isInteger(value.accumulator) ||
    value.accumulator < 0 ||
    value.accumulator >= ELIXIR_ACCUMULATOR_DENOMINATOR
  ) {
    throw new TypeError(
      `${label}.accumulator must be an integer from 0 to 167`,
    );
  }
  if (value.amount === ELIXIR_CAPACITY && value.accumulator !== 0) {
    throw new TypeError(`${label} cannot retain progress at capacity`);
  }
}

function validateHistoryEntry(entry, index) {
  assertExactKeys(entry, ["command", "events", "sequence", "tick"], `history[${index}]`);
  assertSafeTick(entry.tick, `history[${index}].tick`);
  if (!Number.isSafeInteger(entry.sequence) || entry.sequence < 0) {
    throw new TypeError(`history[${index}].sequence must be a safe integer`);
  }
  validateCommand(entry.command, `history[${index}].command`);
  if (!Array.isArray(entry.events) || entry.events.length !== 1) {
    throw new TypeError(`history[${index}].events must contain one spend event`);
  }
  validateEvent(entry.events[0], `history[${index}].events[0]`);
  if (
    entry.events[0].type !== "spend" ||
    entry.events[0].tick !== entry.tick ||
    entry.events[0].sequence !== entry.sequence ||
    entry.events[0].side !== entry.command.side ||
    entry.events[0].cost !== entry.command.cost
  ) {
    throw new TypeError(`history[${index}] command and event must correspond`);
  }
}

function validateCommand(command, label = "command") {
  assertExactKeys(command, ["cost", "side"], label);
  if (typeof command.side !== "string") {
    throw new TypeError(`${label}.side must be a string`);
  }
  if (typeof command.cost !== "number" || !Number.isFinite(command.cost)) {
    throw new TypeError(`${label}.cost must be a finite number`);
  }
}

function validateEvent(event, label) {
  if (!isPlainObject(event)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  if (event.type === "generated") {
    assertExactKeys(event, ["amountAfter", "side", "tick", "type"], label);
    if (
      !SIDE_SET.has(event.side) ||
      !Number.isInteger(event.amountAfter) ||
      event.amountAfter < 1 ||
      event.amountAfter > ELIXIR_CAPACITY
    ) {
      throw new TypeError(`${label} has invalid generation values`);
    }
    assertSafeTick(event.tick, `${label}.tick`);
    return;
  }
  if (event.type === "spend") {
    assertExactKeys(
      event,
      [
        "accepted",
        "amountAfter",
        "cost",
        "reason",
        "sequence",
        "side",
        "tick",
        "type",
      ],
      label,
    );
    if (
      typeof event.accepted !== "boolean" ||
      !Number.isSafeInteger(event.sequence) ||
      event.sequence < 0 ||
      typeof event.side !== "string" ||
      typeof event.cost !== "number" ||
      !Number.isFinite(event.cost) ||
      ![
        "accepted",
        "insufficient_elixir",
        "invalid_cost",
        "invalid_side",
      ].includes(event.reason) ||
      (event.amountAfter !== null &&
        (!Number.isInteger(event.amountAfter) ||
          event.amountAfter < 0 ||
          event.amountAfter > ELIXIR_CAPACITY))
    ) {
      throw new TypeError(`${label} has invalid spend values`);
    }
    assertSafeTick(event.tick, `${label}.tick`);
    return;
  }
  throw new TypeError(`${label}.type is invalid`);
}

function phaseForTick(tick) {
  return PHASES.find((phase) => tick >= phase.fromTick && tick < phase.toTick);
}

function maximumGeneratedEventsThroughTick(tick) {
  let numerator = 0;
  for (const phase of PHASES) {
    const phaseTicks = Math.max(
      0,
      Math.min(tick, phase.toTick) - phase.fromTick,
    );
    numerator += phaseTicks * phase.numeratorPerTick;
  }
  return (
    SIDES.length *
    Math.floor(numerator / ELIXIR_ACCUMULATOR_DENOMINATOR)
  );
}

/** Return the generation phase for a match-start tick. */
export function getElixirPhase(tick) {
  assertSafeTick(tick);
  const phase = phaseForTick(tick);
  if (!phase) {
    throw new RangeError(`tick must be before ${ELIXIR_MATCH_TICKS}`);
  }
  return cloneJson(phase);
}

/** Fresh JSON calibration data. Starting elixir is deliberately an estimate. */
export function getElixirRules() {
  return {
    tickRateHz: ELIXIR_TICKS_PER_SECOND,
    capacity: ELIXIR_CAPACITY,
    startingElixir: {
      value: ESTIMATED_STARTING_ELIXIR,
      confidence: "estimate",
      note: "not independently corroborated in the reference corpus",
    },
    accumulator: {
      denominator: ELIXIR_ACCUMULATOR_DENOMINATOR,
      phaseChangePolicy: "preserve_fractional_progress",
      capacityPolicy: "reset_and_freeze",
    },
    tickSemantics: {
      interval: "[fromTick,toTick)",
      orderWithinTick: ["scheduled_spends_in_sequence_order", "generation"],
      firstDoubleTick: 7_200,
      firstTripleTick: 14_400,
    },
    resourceLimits: {
      resolvedCommands: ELIXIR_MAX_HISTORY_ENTRIES,
      pendingCommands: ELIXIR_MAX_PENDING_SPENDS,
      generatedEvents: ELIXIR_MAX_GENERATED_EVENTS,
      derivedEventLogEntries: ELIXIR_MAX_EVENT_ENTRIES,
    },
    phases: cloneJson(PHASES),
  };
}

export class ElixirMatch {
  #startingElixir;
  #tick;
  #sides;
  #pending;
  #history;
  #events;
  #nextSequence;
  #grants;

  constructor({ startingElixir = ESTIMATED_STARTING_ELIXIR } = {}) {
    const startingSides = Number.isInteger(startingElixir)
      ? { north: startingElixir, south: startingElixir }
      : startingElixir;
    assertExactKeys(startingSides, SIDES, "startingElixir");
    for (const side of SIDES) {
      if (
        !Number.isInteger(startingSides[side]) ||
        startingSides[side] < 0 ||
        startingSides[side] > ELIXIR_CAPACITY
      ) {
        throw new TypeError(
          `startingElixir.${side} must be an integer from 0 to 10`,
        );
      }
    }
    this.#startingElixir = Number.isInteger(startingElixir)
      ? startingElixir
      : cloneJson(startingSides);
    this.#tick = 0;
    this.#sides = {
      north: { accumulator: 0, amount: startingSides.north },
      south: { accumulator: 0, amount: startingSides.south },
    };
    this.#pending = [];
    this.#history = [];
    this.#events = [];
    this.#nextSequence = 0;
    this.#grants = [];
  }

  get tick() {
    return this.#tick;
  }

  get state() {
    return cloneJson({ tick: this.#tick, sides: this.#sides });
  }

  get eventLog() {
    return cloneJson(this.#events);
  }

  get replayLog() {
    return cloneJson([...this.#history, ...this.#grants].sort(
      (left, right) =>
        left.tick - right.tick ||
        left.order - right.order ||
        left.sequence - right.sequence,
    ).map(({ order: _order, ...entry }) => entry));
  }

  phase() {
    return getElixirPhase(this.#tick);
  }

  scheduleSpend(tick, side, cost) {
    assertSafeTick(tick, "scheduled tick");
    if (tick < this.#tick) {
      throw new RangeError("cannot schedule a spend in a resolved tick");
    }
    if (tick >= ELIXIR_MATCH_TICKS) {
      throw new RangeError(`scheduled tick must be before ${ELIXIR_MATCH_TICKS}`);
    }
    if (this.#pending.length >= ELIXIR_MAX_PENDING_SPENDS) {
      throw new RangeError("pending spend limit exceeded");
    }
    if (this.#nextSequence >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError("spend sequence limit exceeded");
    }
    if (typeof side !== "string") {
      throw new TypeError("side must be a string");
    }
    if (typeof cost !== "number" || !Number.isFinite(cost)) {
      throw new TypeError("cost must be a finite number");
    }
    const entry = {
      command: { cost, side },
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

  step({ grants = [] } = {}) {
    return this.#stepWithGrantSequences(grants);
  }

  #stepWithGrantSequences(grants, restoredGrantSequences = null) {
    if (this.#tick >= ELIXIR_MATCH_TICKS) {
      throw new RangeError("all configured elixir phase ticks are resolved");
    }
    if (!Array.isArray(grants) || grants.length > ELIXIR_MAX_PENDING_SPENDS) {
      throw new TypeError("grants must be a bounded array");
    }
    if (
      restoredGrantSequences !== null &&
      (!Array.isArray(restoredGrantSequences) ||
        restoredGrantSequences.length !== grants.length)
    ) {
      throw new TypeError("restored grant sequences must correspond to grants");
    }
    const checkedGrants = grants.map((grant, index) => {
      assertExactKeys(
        grant, ["amount", "side", "sourceId"], `grants[${index}]`,
      );
      if (!SIDE_SET.has(grant.side)) {
        throw new TypeError(`grants[${index}].side is invalid`);
      }
      if (!Number.isSafeInteger(grant.amount) || grant.amount < 1) {
        throw new TypeError(`grants[${index}].amount must be a positive integer`);
      }
      if (
        grant.sourceId !== null &&
        (!Number.isSafeInteger(grant.sourceId) || grant.sourceId < 1)
      ) {
        throw new TypeError(`grants[${index}].sourceId is invalid`);
      }
      return cloneJson(grant);
    });
    let dueCount = 0;
    while (this.#pending[dueCount]?.tick === this.#tick) dueCount += 1;
    const due = this.#pending.slice(0, dueCount);
    if (
      this.#history.length + this.#grants.length +
        due.length + checkedGrants.length >
        ELIXIR_MAX_HISTORY_ENTRIES
    ) {
      throw new RangeError("resolved elixir command history limit exceeded");
    }
    if (
      restoredGrantSequences === null &&
      this.#nextSequence >
      Number.MAX_SAFE_INTEGER - checkedGrants.length
    ) {
      throw new RangeError("elixir command sequence limit exceeded");
    }
    this.#pending.splice(0, dueCount);

    const tickEvents = [];
    for (const entry of due) {
      const events = [this.#resolveSpend(entry)];
      this.#history.push({ ...entry, events });
      tickEvents.push(...events);
    }

    const phase = phaseForTick(this.#tick);
    for (const side of SIDES) {
      const generated = this.#generate(side, phase.numeratorPerTick);
      if (generated) tickEvents.push(generated);
    }
    for (const [order, grant] of checkedGrants.entries()) {
      const sequence = restoredGrantSequences === null
        ? this.#nextSequence++
        : restoredGrantSequences[order];
      const sideState = this.#sides[grant.side];
      const amountGranted = Math.min(
        grant.amount,
        ELIXIR_CAPACITY - sideState.amount,
      );
      sideState.amount += amountGranted;
      if (sideState.amount === ELIXIR_CAPACITY) sideState.accumulator = 0;
      const event = {
        amountAfter: sideState.amount,
        amountGranted,
        amountRequested: grant.amount,
        side: grant.side,
        sourceId: grant.sourceId,
        tick: this.#tick,
        type: "grant",
      };
      this.#grants.push({
        command: { ...grant, type: "grant" },
        events: [event],
        order: due.length + order,
        sequence,
        tick: this.#tick,
      });
      tickEvents.push(event);
    }
    this.#events.push(...tickEvents);
    if (this.#events.length > ELIXIR_MAX_EVENT_ENTRIES) {
      throw new Error("derived elixir event log invariant exceeded");
    }
    this.#tick += 1;
    return cloneJson(tickEvents);
  }

  advanceTicks(count) {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new TypeError("count must be a non-negative safe integer");
    }
    if (count > ELIXIR_MATCH_TICKS - this.#tick) {
      throw new RangeError("advance exceeds configured elixir phases");
    }
    const events = [];
    for (let index = 0; index < count; index += 1) {
      events.push(...this.step());
    }
    return events;
  }

  runToTick(targetTick) {
    assertSafeTick(targetTick, "target tick");
    if (targetTick < this.#tick) {
      throw new RangeError("target tick is already resolved");
    }
    return this.advanceTicks(targetTick - this.#tick);
  }

  replayBytes() {
    return canonicalJson(this.replayLog);
  }

  serialize() {
    const commands = [...this.#history, ...this.#pending]
      .sort((left, right) => left.sequence - right.sequence)
      .map(({ command, sequence, tick }) => ({ ...command, sequence, tick }));
    if (this.#grants.length === 0) return canonicalJson({
      commands: commands.map(({ sequence: _sequence, ...command }) => command),
      startingElixir: this.#startingElixir,
      tick: this.#tick,
      version: 2,
    });
    return canonicalJson({
      commands,
      grants: this.#grants.map(({ command, sequence, tick }) => ({
        amount: command.amount,
        sequence,
        side: command.side,
        sourceId: command.sourceId,
        tick,
      })),
      startingElixir: this.#startingElixir,
      tick: this.#tick,
      version: 3,
    });
  }

  static restore(serialized) {
    if (typeof serialized !== "string") {
      throw new TypeError("serialized snapshot must be a string");
    }
    let snapshot;
    try {
      snapshot = JSON.parse(serialized);
    } catch {
      throw new TypeError("serialized snapshot must be valid JSON");
    }
    if (snapshot?.version === 2) {
      assertExactKeys(
        snapshot,
        ["commands", "startingElixir", "tick", "version"],
        "snapshot",
      );
    } else if (snapshot?.version === 3) {
      assertExactKeys(
        snapshot,
        ["commands", "grants", "startingElixir", "tick", "version"],
        "snapshot",
      );
    } else {
      throw new TypeError("snapshot version must be 2 or 3");
    }
    assertSafeTick(snapshot.tick, "snapshot.tick");
    if (snapshot.tick > ELIXIR_MATCH_TICKS) {
      throw new TypeError("snapshot.tick exceeds configured phases");
    }
    const startingSides = Number.isInteger(snapshot.startingElixir)
      ? { north: snapshot.startingElixir, south: snapshot.startingElixir }
      : snapshot.startingElixir;
    assertExactKeys(startingSides, SIDES, "snapshot.startingElixir");
    for (const side of SIDES) {
      if (
        !Number.isInteger(startingSides[side]) ||
        startingSides[side] < 0 ||
        startingSides[side] > ELIXIR_CAPACITY
      ) {
        throw new TypeError(
          `snapshot.startingElixir.${side} must be an integer from 0 to 10`,
        );
      }
    }
    if (
      !Array.isArray(snapshot.commands) ||
      snapshot.commands.length >
        ELIXIR_MAX_HISTORY_ENTRIES + ELIXIR_MAX_PENDING_SPENDS
    ) {
      throw new TypeError("snapshot.commands has an invalid length");
    }
    const versionThreeEntries = snapshot.version === 3
      ? [...snapshot.commands, ...snapshot.grants]
      : [];
    const hasEncodedSequences = versionThreeEntries.some((value) =>
      isPlainObject(value) &&
      Object.prototype.hasOwnProperty.call(value, "sequence")
    );
    if (
      hasEncodedSequences &&
      versionThreeEntries.some((value) =>
        !isPlainObject(value) ||
        !Object.prototype.hasOwnProperty.call(value, "sequence")
      )
    ) {
      throw new TypeError("version 3 command sequences must be encoded uniformly");
    }
    const entries = snapshot.commands.map((value, index) => {
      assertExactKeys(
        value,
        hasEncodedSequences
          ? ["cost", "sequence", "side", "tick"]
          : ["cost", "side", "tick"],
        `commands[${index}]`,
      );
      const command = { cost: value.cost, side: value.side };
      validateCommand(command, `commands[${index}]`);
      const sequence = hasEncodedSequences ? value.sequence : index;
      if (!Number.isSafeInteger(sequence) || sequence < 0) {
        throw new TypeError(`commands[${index}].sequence must be a safe integer`);
      }
      assertSafeTick(value.tick, `commands[${index}].tick`);
      if (value.tick >= ELIXIR_MATCH_TICKS) {
        throw new TypeError(
          `commands[${index}].tick exceeds configured phases`,
        );
      }
      return { command, sequence, tick: value.tick };
    });
    const resolvedCount = entries.reduce(
      (count, entry) => count + Number(entry.tick < snapshot.tick),
      0,
    );
    const pendingCount = entries.length - resolvedCount;
    if (resolvedCount > ELIXIR_MAX_HISTORY_ENTRIES) {
      throw new TypeError("snapshot resolved command history is too long");
    }
    if (pendingCount > ELIXIR_MAX_PENDING_SPENDS) {
      throw new TypeError("snapshot pending command history is too long");
    }
    if (
      resolvedCount + maximumGeneratedEventsThroughTick(snapshot.tick) >
      ELIXIR_MAX_EVENT_ENTRIES
    ) {
      throw new TypeError(
        "snapshot exceeds the derived elixir event log limit",
      );
    }

    if (
      snapshot.version === 3 &&
      (!Array.isArray(snapshot.grants) ||
        snapshot.grants.length > ELIXIR_MAX_HISTORY_ENTRIES)
    ) {
      throw new TypeError("snapshot.grants has an invalid length");
    }
    const grants = snapshot.version === 3
      ? snapshot.grants.map((grant, index) => {
        assertExactKeys(
          grant,
          hasEncodedSequences
            ? ["amount", "sequence", "side", "sourceId", "tick"]
            : ["amount", "side", "sourceId", "tick"],
          `grants[${index}]`,
        );
        const sequence = hasEncodedSequences
          ? grant.sequence
          : entries.length + index;
        if (!Number.isSafeInteger(sequence) || sequence < 0) {
          throw new TypeError(`grants[${index}].sequence must be a safe integer`);
        }
        assertSafeTick(grant.tick, `grants[${index}].tick`);
        if (grant.tick >= snapshot.tick) {
          throw new TypeError(`grants[${index}].tick is not resolved`);
        }
        return {
          amount: grant.amount,
          sequence,
          side: grant.side,
          sourceId: grant.sourceId,
          tick: grant.tick,
        };
      })
      : [];
    if (resolvedCount + grants.length > ELIXIR_MAX_HISTORY_ENTRIES) {
      throw new TypeError("snapshot resolved elixir command history is too long");
    }
    const unifiedSequences = [...entries, ...grants]
      .map(({ sequence }) => sequence)
      .sort((left, right) => left - right);
    if (
      unifiedSequences.some((sequence, index) => sequence !== index)
    ) {
      throw new TypeError(
        "snapshot elixir command sequences must be unique and contiguous",
      );
    }
    if (hasEncodedSequences) {
      let lastGrantTick = -1;
      for (const entry of [...entries, ...grants]
        .sort((left, right) => left.sequence - right.sequence)) {
        if ("amount" in entry) {
          if (entry.tick < lastGrantTick) {
            throw new TypeError(
              "snapshot grant sequences are not causally ordered",
            );
          }
          lastGrantTick = entry.tick;
        } else if (entry.tick <= lastGrantTick) {
          throw new TypeError(
            "snapshot spend sequence is not causally schedulable",
          );
        }
      }
    }
    const match = new ElixirMatch({
      startingElixir: snapshot.startingElixir,
    });
    // Commands are the sole causal authority. Cached balances, accumulators,
    // results, sequence numbers, and generated events have no snapshot
    // representation and are rebuilt by the normal deterministic transition.
    match.#pending = entries.sort(
      (left, right) =>
        left.tick - right.tick || left.sequence - right.sequence,
    );
    match.#nextSequence = unifiedSequences.length;
    while (match.tick < snapshot.tick) {
      const tickGrants = grants.filter(({ tick }) => tick === match.tick);
      match.#stepWithGrantSequences(
        tickGrants.map(({
          sequence: _sequence,
          tick: _tick,
          ...grant
        }) => grant),
        tickGrants.map(({ sequence }) => sequence),
      );
    }
    return match;
  }

  #resolveSpend(entry) {
    const { side, cost } = entry.command;
    let reason = "accepted";
    let accepted = true;
    if (!SIDE_SET.has(side)) {
      accepted = false;
      reason = "invalid_side";
    } else if (!Number.isInteger(cost) || cost < 1 || cost > ELIXIR_CAPACITY) {
      accepted = false;
      reason = "invalid_cost";
    } else if (this.#sides[side].amount < cost) {
      accepted = false;
      reason = "insufficient_elixir";
    } else {
      this.#sides[side].amount -= cost;
    }
    return {
      accepted,
      amountAfter: SIDE_SET.has(side) ? this.#sides[side].amount : null,
      cost,
      reason,
      sequence: entry.sequence,
      side,
      tick: this.#tick,
      type: "spend",
    };
  }

  #generate(side, numerator) {
    const state = this.#sides[side];
    if (state.amount === ELIXIR_CAPACITY) {
      state.accumulator = 0;
      return null;
    }
    state.accumulator += numerator;
    if (state.accumulator < ELIXIR_ACCUMULATOR_DENOMINATOR) {
      return null;
    }
    state.accumulator -= ELIXIR_ACCUMULATOR_DENOMINATOR;
    state.amount += 1;
    if (state.amount === ELIXIR_CAPACITY) state.accumulator = 0;
    return {
      amountAfter: state.amount,
      side,
      tick: this.#tick,
      type: "generated",
    };
  }
}
