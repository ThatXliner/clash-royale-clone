export const MATCH_TICKS_PER_SECOND = 60;
export const MATCH_REGULATION_TICKS = 10_800;
export const MATCH_TRIPLE_ELIXIR_TICK = 14_400;
export const MATCH_MAX_TICKS = 18_000;
export const MATCH_MAX_EVIDENCE_COMMANDS = 10_000;

const SIDES = Object.freeze(["north", "south"]);
const TOWER_IDS = Object.freeze([
  "north:central",
  "north:lane:left",
  "north:lane:right",
  "south:central",
  "south:lane:left",
  "south:lane:right",
]);
const TOWER_ID_SET = new Set(TOWER_IDS);

function otherSide(side) {
  return side === "north" ? "south" : "north";
}

function towerSide(id) {
  return id.startsWith("north:") ? "north" : "south";
}

function towerRole(id) {
  return id.endsWith(":central") ? "central" : "lane";
}

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

function exactObject(value, keys, label) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.some((key) => typeof key !== "string")) {
    throw new TypeError(`${label} must contain only string keys`);
  }
  const wanted = [...keys].sort();
  const sorted = [...actual].sort();
  if (
    sorted.length !== wanted.length ||
    sorted.some((key, index) => key !== wanted[index])
  ) {
    throw new TypeError(`${label} has an invalid shape`);
  }
  const result = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function exactArray(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new TypeError(`${label} must be an array of length ${length}`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === "length") continue;
    if (
      typeof key !== "string" ||
      !/^(0|[1-9]\d*)$/.test(key) ||
      Number(key) >= length
    ) {
      throw new TypeError(`${label} must contain only indexed data`);
    }
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label}[${key}] must be an enumerable data property`);
    }
  }
  return Array.from(value);
}

function safeTick(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value;
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

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function checkedTowerArray(value, label, { allowZero }) {
  const towers = exactArray(value, TOWER_IDS.length, label).map(
    (raw, index) => {
      const tower = exactObject(
        raw,
        ["hitpoints", "id"],
        `${label}[${index}]`,
      );
      if (tower.id !== TOWER_IDS[index]) {
        throw new TypeError(
          `${label}[${index}].id must be ${TOWER_IDS[index]}`,
        );
      }
      if (
        !Number.isSafeInteger(tower.hitpoints) ||
        tower.hitpoints < (allowZero ? 0 : 1)
      ) {
        throw new TypeError(
          `${label}[${index}].hitpoints must be a ${allowZero ? "non-negative" : "positive"} safe integer`,
        );
      }
      return { hitpoints: tower.hitpoints, id: tower.id };
    },
  );
  return towers;
}

function checkedEvidence(value, label = "evidence") {
  const evidence = exactObject(
    value,
    ["destroyedTowerIds", "towers"],
    label,
  );
  const towers = checkedTowerArray(evidence.towers, `${label}.towers`, {
    allowZero: true,
  });
  const destroyedTowerIds = exactArray(
    evidence.destroyedTowerIds,
    towers.filter((tower) => tower.hitpoints === 0).length,
    `${label}.destroyedTowerIds`,
  );
  const expected = towers
    .filter((tower) => tower.hitpoints === 0)
    .map((tower) => tower.id);
  if (
    destroyedTowerIds.some(
      (id, index) =>
        typeof id !== "string" ||
        !TOWER_ID_SET.has(id) ||
        id !== expected[index],
    )
  ) {
    throw new TypeError(
      `${label}.destroyedTowerIds must exactly match zero-HP towers`,
    );
  }
  return { destroyedTowerIds: [...destroyedTowerIds], towers };
}

function towerMap(towers) {
  return Object.fromEntries(
    towers.map((tower) => [tower.id, tower.hitpoints]),
  );
}

function validateEvidenceTransition(previousTowers, nextTowers) {
  const previous = towerMap(previousTowers);
  for (const tower of nextTowers) {
    if (tower.hitpoints > previous[tower.id]) {
      throw new TypeError(
        `tower evidence cannot increase hitpoints for ${tower.id}`,
      );
    }
    if (previous[tower.id] === 0 && tower.hitpoints !== 0) {
      throw new TypeError(
        `tower evidence cannot revive destroyed tower ${tower.id}`,
      );
    }
  }
}

function commandOrder(left, right) {
  return left.tick - right.tick || left.sequence - right.sequence;
}

function insertionIndex(ordered, entry) {
  let low = 0;
  let high = ordered.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (commandOrder(ordered[middle], entry) <= 0) low = middle + 1;
    else high = middle;
  }
  return low;
}

function resultObject({ crowns, endedAtTick, kind, reason, winner }) {
  return {
    crowns: { north: crowns.north, south: crowns.south },
    endedAtTick,
    kind,
    reason,
    winner,
  };
}

/**
 * Return the neutral match clock phase. Boundaries are half-open:
 * regulation=[0,10800), overtime=[10800,18000), ended={18000}.
 */
export function getMatchPhase(tick) {
  safeTick(tick, "tick");
  if (tick > MATCH_MAX_TICKS) {
    throw new RangeError(`tick must not exceed ${MATCH_MAX_TICKS}`);
  }
  if (tick === MATCH_MAX_TICKS) {
    return {
      clock: "ended",
      elixirRate: null,
      fromTick: MATCH_MAX_TICKS,
      toTick: MATCH_MAX_TICKS,
    };
  }
  return {
    clock: tick < MATCH_REGULATION_TICKS ? "regulation" : "overtime",
    elixirRate:
      tick < 7_200 ? "single" : tick < MATCH_TRIPLE_ELIXIR_TICK ? "double" : "triple",
    fromTick:
      tick < 7_200
        ? 0
        : tick < MATCH_REGULATION_TICKS
          ? 7_200
          : tick < MATCH_TRIPLE_ELIXIR_TICK
            ? MATCH_REGULATION_TICKS
            : MATCH_TRIPLE_ELIXIR_TICK,
    toTick:
      tick < 7_200
        ? 7_200
        : tick < MATCH_REGULATION_TICKS
          ? MATCH_REGULATION_TICKS
          : tick < MATCH_TRIPLE_ELIXIR_TICK
            ? MATCH_TRIPLE_ELIXIR_TICK
            : MATCH_MAX_TICKS,
  };
}

export function getMatchRules() {
  return {
    simultaneousOvertimeDestruction: {
      confidence: "corpus_silent_deterministic_policy",
      policy: "opposing destructions on the first overtime destruction tick draw",
    },
    tickRateHz: MATCH_TICKS_PER_SECOND,
    tickSemantics: {
      interval: "[fromTick,toTick)",
      orderAtRegulationBoundary: [
        "regulation_result_or_enter_overtime",
        "tick_10800_evidence",
      ],
      orderAtMaximumBoundary: [
        "tiebreak_from_last_completed_evidence",
        "reject_tick_18000_evidence",
      ],
      sameTickEvidence: "sequence_order_then_one_combined_destruction_result",
    },
    resourceLimits: {
      evidenceCommands: MATCH_MAX_EVIDENCE_COMMANDS,
    },
    tiebreak: {
      model:
        "instant comparison is the mathematical result of equal-rate HP drain",
      tiePolicy:
        "all towers at each side's equal minimum drain simultaneously; exact inter-side tie is a draw",
    },
    timings: {
      maximumTicks: MATCH_MAX_TICKS,
      overtimeTicks: MATCH_MAX_TICKS - MATCH_REGULATION_TICKS,
      regulationTicks: MATCH_REGULATION_TICKS,
      tripleElixirFromTick: MATCH_TRIPLE_ELIXIR_TICK,
    },
    towerIds: [...TOWER_IDS],
  };
}

export class MatchClock {
  #initialTowers;
  #tick;
  #commands;
  #orderedCommands;
  #pending;
  #nextSequence;
  #towers;
  #crowns;
  #destroyed;
  #overtime;
  #result;
  #events;
  #replay;

  constructor({ initialTowers } = {}) {
    this.#initialTowers = checkedTowerArray(
      initialTowers,
      "initialTowers",
      { allowZero: false },
    );
    this.#tick = 0;
    this.#commands = [];
    this.#orderedCommands = [];
    this.#pending = [];
    this.#nextSequence = 0;
    this.#resetDerived();
  }

  #resetDerived() {
    this.#towers = towerMap(this.#initialTowers);
    this.#crowns = { north: 0, south: 0 };
    this.#destroyed = new Set();
    this.#overtime = false;
    this.#result = null;
    this.#events = [];
    this.#replay = [];
  }

  get tick() {
    return this.#tick;
  }

  get state() {
    return cloneJson({
      crowns: this.#crowns,
      destroyedTowerIds: TOWER_IDS.filter((id) => this.#destroyed.has(id)),
      phase: this.#result
        ? "ended"
        : this.#overtime
          ? "overtime"
          : "regulation",
      result: this.#result,
      tick: this.#tick,
      towers: TOWER_IDS.map((id) => ({ hitpoints: this.#towers[id], id })),
    });
  }

  get eventLog() {
    return cloneJson(this.#events);
  }

  get replayLog() {
    return cloneJson(this.#replay);
  }

  phase() {
    if (this.#result) {
      return {
        clock: "ended",
        elixirRate:
          this.#tick < MATCH_MAX_TICKS
            ? getMatchPhase(this.#tick).elixirRate
            : null,
        result: cloneJson(this.#result),
      };
    }
    return getMatchPhase(this.#tick);
  }

  scheduleTowerEvidence(tick, evidence) {
    safeTick(tick, "scheduled tick");
    if (this.#tick === MATCH_MAX_TICKS) {
      throw new RangeError("maximum match tick is already resolved");
    }
    if (tick < this.#tick) {
      throw new RangeError("cannot schedule evidence in a resolved tick");
    }
    if (tick > MATCH_MAX_TICKS) {
      throw new RangeError(`scheduled tick must not exceed ${MATCH_MAX_TICKS}`);
    }
    if (this.#commands.length >= MATCH_MAX_EVIDENCE_COMMANDS) {
      throw new RangeError("tower evidence command limit exceeded");
    }
    if (this.#nextSequence >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError("tower evidence sequence limit exceeded");
    }
    const entry = {
      evidence: checkedEvidence(evidence),
      sequence: this.#nextSequence,
      tick,
    };
    const orderedIndex = insertionIndex(this.#orderedCommands, entry);
    const previousTowers =
      orderedIndex === 0
        ? this.#initialTowers
        : this.#orderedCommands[orderedIndex - 1].evidence.towers;
    const nextTowers =
      this.#orderedCommands[orderedIndex]?.evidence.towers ?? null;
    validateEvidenceTransition(previousTowers, entry.evidence.towers);
    if (nextTowers) {
      validateEvidenceTransition(entry.evidence.towers, nextTowers);
    }
    this.#nextSequence += 1;
    this.#commands.push(entry);
    this.#orderedCommands.splice(orderedIndex, 0, entry);
    const pendingIndex = insertionIndex(this.#pending, entry);
    this.#pending.splice(pendingIndex, 0, entry);
    return entry.sequence;
  }

  step() {
    if (this.#tick >= MATCH_MAX_TICKS) {
      throw new RangeError("maximum match tick is already resolved");
    }
    const tickEvents = [];
    tickEvents.push(...this.#resolveEvidenceAtCurrentTick());
    this.#tick += 1;
    if (this.#tick === MATCH_REGULATION_TICKS) {
      tickEvents.push(...this.#resolveRegulationBoundary());
    } else if (this.#tick === MATCH_MAX_TICKS) {
      // A successful step resolves every automatic boundary at the tick it
      // reaches. Evidence for tick 17999 has already been applied above, so
      // the tiebreak uses the latest complete tower state. Evidence stamped
      // 18000 is outside [0,18000) and is rejected only after that result is
      // permanent.
      tickEvents.push(...this.#resolveTiebreak());
      tickEvents.push(...this.#rejectMaximumTickEvidence());
    }
    this.#events.push(...tickEvents);
    return cloneJson(tickEvents);
  }

  advanceTicks(count) {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new TypeError("count must be a non-negative safe integer");
    }
    if (count > MATCH_MAX_TICKS - this.#tick) {
      throw new RangeError("advance exceeds maximum match time");
    }
    const events = [];
    for (let index = 0; index < count; index += 1) {
      events.push(...this.step());
    }
    return cloneJson(events);
  }

  runToTick(targetTick) {
    safeTick(targetTick, "target tick");
    if (targetTick < this.#tick) {
      throw new RangeError("target tick is already resolved");
    }
    return this.advanceTicks(targetTick - this.#tick);
  }

  serialize() {
    return canonicalJson({
      commands: [...this.#commands]
        .sort((left, right) => left.sequence - right.sequence)
        .map(({ evidence, tick }) => ({ evidence, tick })),
      initialTowers: this.#initialTowers,
      tick: this.#tick,
      version: 1,
    });
  }

  replayBytes() {
    return canonicalJson(this.#replay);
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
    const checked = exactObject(
      snapshot,
      ["commands", "initialTowers", "tick", "version"],
      "snapshot",
    );
    if (checked.version !== 1) {
      throw new TypeError("snapshot.version must be 1");
    }
    safeTick(checked.tick, "snapshot.tick");
    if (checked.tick > MATCH_MAX_TICKS) {
      throw new TypeError("snapshot.tick exceeds maximum match time");
    }
    const initialTowers = checkedTowerArray(
      checked.initialTowers,
      "snapshot.initialTowers",
      { allowZero: false },
    );
    if (
      !Array.isArray(checked.commands) ||
      checked.commands.length > MATCH_MAX_EVIDENCE_COMMANDS
    ) {
      throw new TypeError("snapshot.commands has an invalid length");
    }
    exactArray(
      checked.commands,
      checked.commands.length,
      "snapshot.commands",
    );
    const match = new MatchClock({ initialTowers });
    for (let index = 0; index < checked.commands.length; index += 1) {
      const command = exactObject(
        checked.commands[index],
        ["evidence", "tick"],
        `snapshot.commands[${index}]`,
      );
      safeTick(command.tick, `snapshot.commands[${index}].tick`);
      if (command.tick > MATCH_MAX_TICKS) {
        throw new TypeError(
          `snapshot.commands[${index}].tick exceeds maximum match time`,
        );
      }
      match.scheduleTowerEvidence(command.tick, command.evidence);
    }
    match.runToTick(checked.tick);
    return match;
  }

  #resolveRegulationBoundary() {
    if (this.#result) return [];
    if (this.#crowns.north !== this.#crowns.south) {
      const winner =
        this.#crowns.north > this.#crowns.south ? "north" : "south";
      this.#end("win", "regulation_crowns", winner, this.#tick);
      return [{ result: cloneJson(this.#result), tick: this.#tick, type: "match_end" }];
    }
    this.#overtime = true;
    return [{ tick: this.#tick, type: "overtime_started" }];
  }

  #resolveEvidenceAtCurrentTick() {
    let dueCount = 0;
    while (this.#pending[dueCount]?.tick === this.#tick) dueCount += 1;
    if (dueCount === 0) return [];
    const due = this.#pending.splice(0, dueCount);
    if (this.#result) {
      return due.map((entry) => this.#rejectedEntry(entry));
    }
    const events = [];
    const newlyDestroyed = [];
    for (const entry of due) {
      const before = { ...this.#towers };
      for (const tower of entry.evidence.towers) {
        this.#towers[tower.id] = tower.hitpoints;
        if (
          tower.hitpoints === 0 &&
          before[tower.id] > 0 &&
          !this.#destroyed.has(tower.id)
        ) {
          this.#destroyed.add(tower.id);
          newlyDestroyed.push(tower.id);
        }
      }
      const event = {
        accepted: true,
        destroyedTowerIds: entry.evidence.destroyedTowerIds,
        sequence: entry.sequence,
        tick: this.#tick,
        type: "tower_evidence",
      };
      events.push(event);
      this.#replay.push({
        command: { evidence: entry.evidence, tick: entry.tick },
        event,
        sequence: entry.sequence,
      });
    }
    if (newlyDestroyed.length > 0) {
      this.#awardCrowns(newlyDestroyed);
      events.push(...this.#resolveDestructionResult(newlyDestroyed));
    }
    return events;
  }

  #awardCrowns(ids) {
    for (const id of ids) {
      const scorer = otherSide(towerSide(id));
      if (towerRole(id) === "central") {
        this.#crowns[scorer] = 3;
      } else if (this.#crowns[scorer] < 3) {
        this.#crowns[scorer] += 1;
      }
    }
  }

  #resolveDestructionResult(ids) {
    const losingSides = new Set(ids.map(towerSide));
    const centralLosingSides = new Set(
      ids.filter((id) => towerRole(id) === "central").map(towerSide),
    );
    let reason = null;
    if (centralLosingSides.size > 0) reason = "central_destroyed";
    else if (this.#overtime) reason = "overtime_sudden_death";
    if (!reason) return [];

    let kind;
    let winner;
    if (losingSides.size === 2) {
      if (this.#crowns.north === this.#crowns.south) {
        kind = "draw";
        winner = null;
      } else {
        kind = "win";
        winner =
          this.#crowns.north > this.#crowns.south ? "north" : "south";
      }
    } else {
      kind = "win";
      winner = otherSide([...losingSides][0]);
    }
    this.#end(kind, reason, winner, this.#tick);
    return [{ result: cloneJson(this.#result), tick: this.#tick, type: "match_end" }];
  }

  #resolveTiebreak() {
    if (this.#result) return [];
    const minima = {};
    for (const side of SIDES) {
      minima[side] = Math.min(
        ...TOWER_IDS.filter(
          (id) => towerSide(id) === side && this.#towers[id] > 0,
        ).map((id) => this.#towers[id]),
      );
    }
    const losingSides =
      minima.north === minima.south
        ? ["north", "south"]
        : [minima.north < minima.south ? "north" : "south"];
    const drained = TOWER_IDS.filter(
      (id) =>
        losingSides.includes(towerSide(id)) &&
        this.#towers[id] === minima[towerSide(id)],
    );
    for (const id of drained) {
      this.#towers[id] = 0;
      this.#destroyed.add(id);
    }
    this.#awardCrowns(drained);
    const winner =
      losingSides.length === 2 ? null : otherSide(losingSides[0]);
    this.#end(
      winner === null ? "draw" : "win",
      winner === null ? "tiebreak_exact_tie" : "tiebreak_lowest_hp",
      winner,
      MATCH_MAX_TICKS,
    );
    return [{
      drainedTowerIds: drained,
      minima,
      result: cloneJson(this.#result),
      tick: MATCH_MAX_TICKS,
      type: "tiebreak",
    }];
  }

  #rejectMaximumTickEvidence() {
    const due = this.#pending.filter((entry) => entry.tick === MATCH_MAX_TICKS);
    this.#pending = this.#pending.filter(
      (entry) => entry.tick !== MATCH_MAX_TICKS,
    );
    return due.map((entry) => this.#rejectedEntry(entry));
  }

  #rejectedEntry(entry) {
    const event = {
      accepted: false,
      reason: "match_ended",
      sequence: entry.sequence,
      tick: this.#tick,
      type: "tower_evidence",
    };
    this.#replay.push({
      command: { evidence: entry.evidence, tick: entry.tick },
      event,
      sequence: entry.sequence,
    });
    return event;
  }

  #end(kind, reason, winner, endedAtTick) {
    if (this.#result) return;
    this.#result = resultObject({
      crowns: this.#crowns,
      endedAtTick,
      kind,
      reason,
      winner,
    });
  }
}
