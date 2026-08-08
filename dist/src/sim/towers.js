import { getArenaGeometry } from "./arena-geometry.js";
import { AttackCycle, attackSecondsToTicks } from "./attack-cycle.js";
import { retainOrAcquireTarget, targetCandidate } from "./targeting.js";

export const TOWER_TICKS_PER_SECOND = 60;

// Combat values are the level-11, pre-Evolutions comparison values. Tower
// positions remain the centralized screenshot-derived arena estimate.
export const TOWER_COMBAT_CONFIG = Object.freeze({
  central: Object.freeze({
    countPerSide: 1,
    damage: 109,
    hitSpeedTicks: 60,
    hitpoints: 4824,
    rangeMillitiles: 7000,
    targets: "air_and_ground",
  }),
  lane: Object.freeze({
    countPerSide: 2,
    damage: 109,
    hitSpeedTicks: 48,
    hitpoints: 3052,
    rangeMillitiles: 7500,
    targets: "air_and_ground",
  }),
});

// Windup is deliberately not part of TOWER_COMBAT_CONFIG. The comparison
// corpus marks central 3.3 s as unverified and supplies no lane first-hit
// value, so callers must choose explicit, non-authoritative simulation values.
export const TOWER_WINDUP_ESTIMATE = Object.freeze({
  central: Object.freeze({
    confidence: "unverified_estimate",
    ticks: 198,
  }),
  lane: Object.freeze({
    confidence: "unspecified_estimate",
    ticks: 0,
  }),
});

const SIDES = new Set(["north", "south"]);
const ROLES = new Set(["central", "lane"]);
const ACTIVATION_CAUSES = new Set(["damaged", "friendly-lane-destroyed"]);
const MAX_REPLAY_TICKS = 100_000;
const MAX_CANDIDATES_PER_TICK = 256;
const MAX_DAMAGE_ENTRIES_PER_TICK = 256;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function plainObject(value, keys, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.some((key) => typeof key !== "string")) {
    throw new TypeError(`${label} must contain only string keys`);
  }
  const sortedActual = [...actual].sort();
  const sortedExpected = [...keys].sort();
  if (
    sortedActual.length !== sortedExpected.length ||
    sortedActual.some((key, index) => key !== sortedExpected[index])
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

function safeNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function checkedWindups(value) {
  const windups = plainObject(
    value,
    ["central", "lane"],
    "tower initial windups",
  );
  return {
    central: safeNonNegativeInteger(
      windups.central,
      "tower initial windups.central",
    ),
    lane: safeNonNegativeInteger(
      windups.lane,
      "tower initial windups.lane",
    ),
  };
}

function checkedActivationHistory(value, nextTick) {
  const history = plainObject(
    value,
    ["north", "south"],
    "tower activation history",
  );
  const result = {};
  for (const side of ["north", "south"]) {
    const entry = history[side];
    if (entry === null) {
      result[side] = null;
      continue;
    }
    const activation = plainObject(
      entry,
      ["cause", "tick"],
      `tower activation history.${side}`,
    );
    if (
      typeof activation.cause !== "string" ||
      !ACTIVATION_CAUSES.has(activation.cause)
    ) {
      throw new TypeError(
        `tower activation history.${side}.cause is invalid`,
      );
    }
    safeNonNegativeInteger(
      activation.tick,
      `tower activation history.${side}.tick`,
    );
    if (activation.tick >= nextTick) {
      throw new TypeError(
        `tower activation history.${side}.tick must precede nextTick`,
      );
    }
    result[side] = { cause: activation.cause, tick: activation.tick };
  }
  return result;
}

function towerId(side, role, lane) {
  return role === "central"
    ? `${side}:central`
    : `${side}:lane:${lane}`;
}

function createInitialTowers(windups) {
  return getArenaGeometry().towers.map((layout) => {
    const config = TOWER_COMBAT_CONFIG[layout.role];
    return {
      active: layout.role === "lane",
      attackCycle: new AttackCycle({
        deployTicks: 0,
        firstHitTicks: windups[layout.role],
        hitSpeedTicks: config.hitSpeedTicks,
      }),
      hitpoints: config.hitpoints,
      id: towerId(layout.side, layout.role, layout.lane),
      lane: layout.lane ?? null,
      position: { ...layout.center },
      role: layout.role,
      side: layout.side,
    };
  });
}

function cloneTower(tower) {
  return {
    active: tower.active,
    attack: tower.attackCycle.state,
    hitpoints: tower.hitpoints,
    id: tower.id,
    lane: tower.lane,
    position: { ...tower.position },
    role: tower.role,
    side: tower.side,
  };
}

function checkedDamage(value, index, validIds) {
  const damage = plainObject(
    value,
    ["amount", "towerId"],
    `tower damage ${index}`,
  );
  if (typeof damage.towerId !== "string" || !validIds.has(damage.towerId)) {
    throw new TypeError(`tower damage ${index}.towerId is unknown`);
  }
  safeNonNegativeInteger(damage.amount, `tower damage ${index}.amount`);
  return { amount: damage.amount, towerId: damage.towerId };
}

function checkedArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === "length") continue;
    if (
      typeof key !== "string" ||
      !/^(0|[1-9]\d*)$/.test(key) ||
      Number(key) >= value.length
    ) {
      throw new TypeError(`${label} must contain only indexed data`);
    }
  }
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[index];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, "value")
    ) {
      throw new TypeError(`${label}[${index}] must be an enumerable data property`);
    }
    result.push(descriptor.value);
  }
  return result;
}

function checkedStepInput(value, validIds, label = "tower step input") {
  const input = plainObject(value, ["candidates", "damage"], label);
  const candidateValues = checkedArray(input.candidates, `${label}.candidates`);
  if (candidateValues.length > MAX_CANDIDATES_PER_TICK) {
    throw new RangeError(
      `${label}.candidates exceeds ${MAX_CANDIDATES_PER_TICK} entries`,
    );
  }
  const candidates = candidateValues.map((candidate, index) =>
      targetCandidate(candidate, `${label}.candidates[${index}]`)
  );
  const candidateIds = new Set();
  for (const candidate of candidates) {
    if (candidateIds.has(candidate.id)) {
      throw new TypeError(`${label}.candidates must have unique IDs`);
    }
    candidateIds.add(candidate.id);
  }
  const damageValues = checkedArray(input.damage, `${label}.damage`);
  if (damageValues.length > MAX_DAMAGE_ENTRIES_PER_TICK) {
    throw new RangeError(
      `${label}.damage exceeds ${MAX_DAMAGE_ENTRIES_PER_TICK} entries`,
    );
  }
  const damage = damageValues.map(
    (entry, index) => checkedDamage(entry, index, validIds),
  );
  return { candidates, damage };
}

function cloneStepInput(input) {
  return {
    candidates: input.candidates.map((candidate) => ({
      alive: candidate.alive,
      id: candidate.id,
      kind: candidate.kind,
      layer: candidate.layer,
      position: { ...candidate.position },
      radius: candidate.radius,
      targetable: candidate.targetable,
    })),
    damage: input.damage.map((entry) => ({ ...entry })),
  };
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function applyDamage(state, input, events) {
  const totals = new Map();
  for (const damage of input.damage) {
    totals.set(
      damage.towerId,
      (totals.get(damage.towerId) ?? 0) + damage.amount,
    );
    if (!Number.isSafeInteger(totals.get(damage.towerId))) {
      throw new RangeError("tower damage total exceeds the safe integer range");
    }
  }

  const newlyDestroyed = [];
  const directlyDamagedCentral = [];
  for (const [id, amount] of [...totals].sort(([a], [b]) => compareText(a, b))) {
    if (amount === 0) continue;
    const tower = state.towers.find((candidate) => candidate.id === id);
    if (tower.hitpoints === 0) continue;
    const previousHitpoints = tower.hitpoints;
    tower.hitpoints = Math.max(0, tower.hitpoints - amount);
    if (tower.role === "central" && !tower.active) {
      directlyDamagedCentral.push(tower);
    }
    if (previousHitpoints > 0 && tower.hitpoints === 0) {
      newlyDestroyed.push(tower);
    }
  }

  const activationCauses = new Map();
  for (const tower of directlyDamagedCentral) {
    activationCauses.set(tower.id, "damaged");
  }
  for (const tower of newlyDestroyed) {
    if (tower.role !== "lane") continue;
    const centralId = `${tower.side}:central`;
    if (!activationCauses.has(centralId)) {
      activationCauses.set(centralId, "friendly-lane-destroyed");
    }
  }
  for (const [id, cause] of [...activationCauses].sort(([a], [b]) =>
    compareText(a, b)
  )) {
    const central = state.towers.find((tower) => tower.id === id);
    if (!central.active) {
      central.active = true;
      state.activationHistory[central.side] = {
        cause,
        tick: state.nextTick,
      };
      events.push({
        cause,
        tick: state.nextTick,
        towerId: central.id,
        type: "tower-activated",
      });
    }
  }
  for (const tower of newlyDestroyed.sort((a, b) => compareText(a.id, b.id))) {
    events.push({
      tick: state.nextTick,
      towerId: tower.id,
      type: "tower-destroyed",
    });
  }
}

function stepChecked(state, input) {
  const events = [];
  applyDamage(state, input, events);

  for (const tower of state.towers) {
    const standingAndActive = tower.hitpoints > 0 && tower.active;
    const currentTargetId = standingAndActive
      ? tower.attackCycle.state.targetId
      : null;
    const target = standingAndActive
      ? retainOrAcquireTarget(
        { position: tower.position, radius: 0 },
        input.candidates,
        {
          currentTargetId,
          mode: TOWER_COMBAT_CONFIG[tower.role].targets,
          sightRange: TOWER_COMBAT_CONFIG[tower.role].rangeMillitiles,
        },
      )
      : null;
    const attackEvents = tower.attackCycle.step({
      targetEligible: target !== null,
      targetId: target?.id ?? null,
    });
    for (const attack of attackEvents) {
      events.push({
        damage: TOWER_COMBAT_CONFIG[tower.role].damage,
        sequence: attack.sequence,
        targetId: attack.targetId,
        tick: attack.tick,
        towerId: tower.id,
        type: "shot-ready",
      });
    }
  }

  if (state.nextTick === Number.MAX_SAFE_INTEGER) {
    throw new RangeError("tower tick exceeds the safe integer range");
  }
  state.nextTick += 1;
  return events;
}

function snapshotState(state) {
  return {
    activationHistory: {
      north: state.activationHistory.north === null
        ? null
        : { ...state.activationHistory.north },
      south: state.activationHistory.south === null
        ? null
        : { ...state.activationHistory.south },
    },
    initialWindupTicks: { ...state.initialWindupTicks },
    nextTick: state.nextTick,
    towers: state.towers.map((tower) => ({
      active: tower.active,
      attackCycle: JSON.parse(tower.attackCycle.serialize()),
      hitpoints: tower.hitpoints,
      id: tower.id,
      lane: tower.lane,
      position: { ...tower.position },
      role: tower.role,
      side: tower.side,
    })),
  };
}

function restoreState(value) {
  const state = plainObject(
    value,
    ["activationHistory", "initialWindupTicks", "nextTick", "towers"],
    "tower snapshot state",
  );
  const windups = checkedWindups(state.initialWindupTicks);
  safeNonNegativeInteger(state.nextTick, "tower snapshot state.nextTick");
  const activationHistory = checkedActivationHistory(
    state.activationHistory,
    state.nextTick,
  );
  const initial = createInitialTowers(windups);
  const towerValues = checkedArray(state.towers, "tower snapshot state.towers");
  if (towerValues.length !== initial.length) {
    throw new TypeError("tower snapshot must contain exactly six towers");
  }
  const towers = towerValues.map((value, index) => {
    const tower = plainObject(
      value,
      [
        "active",
        "attackCycle",
        "hitpoints",
        "id",
        "lane",
        "position",
        "role",
        "side",
      ],
      `tower snapshot tower ${index}`,
    );
    const expected = initial[index];
    if (
      tower.id !== expected.id ||
      tower.lane !== expected.lane ||
      tower.role !== expected.role ||
      tower.side !== expected.side ||
      canonicalJson(tower.position) !== canonicalJson(expected.position)
    ) {
      throw new TypeError(`tower snapshot tower ${index} has invalid identity`);
    }
    if (typeof tower.active !== "boolean") {
      throw new TypeError(`tower snapshot tower ${index}.active must be boolean`);
    }
    safeNonNegativeInteger(
      tower.hitpoints,
      `tower snapshot tower ${index}.hitpoints`,
    );
    if (tower.hitpoints > TOWER_COMBAT_CONFIG[tower.role].hitpoints) {
      throw new TypeError(`tower snapshot tower ${index}.hitpoints is too high`);
    }
    const attackCycle = AttackCycle.restore(canonicalJson(tower.attackCycle));
    if (attackCycle.state.nextTick !== state.nextTick) {
      throw new TypeError(`tower snapshot tower ${index} tick is inconsistent`);
    }
    const expectedAttackConfig = {
      deployTicks: 0,
      firstHitTicks: windups[tower.role],
      hitSpeedTicks: TOWER_COMBAT_CONFIG[tower.role].hitSpeedTicks,
    };
    if (
      canonicalJson(attackCycle.state.config) !==
      canonicalJson(expectedAttackConfig)
    ) {
      throw new TypeError(
        `tower snapshot tower ${index} attack config is inconsistent`,
      );
    }
    if (
      (!tower.active || tower.hitpoints === 0) &&
      attackCycle.state.targetId !== null
    ) {
      throw new TypeError(
        `tower snapshot tower ${index} cannot retain a target`,
      );
    }
    return { ...expected, active: tower.active, attackCycle, hitpoints: tower.hitpoints };
  });
  for (const tower of towers) {
    if (tower.role === "lane" && !tower.active) {
      throw new TypeError("lane towers must remain active");
    }
    if (tower.role !== "central") continue;
    const activation = activationHistory[tower.side];
    const friendlyLaneDestroyed = towers.some(
      (candidate) =>
        candidate.side === tower.side &&
        candidate.role === "lane" &&
        candidate.hitpoints === 0,
    );
    if (!tower.active) {
      if (
        activation !== null ||
        tower.hitpoints !== TOWER_COMBAT_CONFIG.central.hitpoints ||
        friendlyLaneDestroyed
      ) {
        throw new TypeError("inactive central tower violates activation history");
      }
      continue;
    }
    if (activation === null) {
      throw new TypeError("active central tower requires activation history");
    }
    if (
      activation.cause === "damaged" &&
      tower.hitpoints === TOWER_COMBAT_CONFIG.central.hitpoints
    ) {
      throw new TypeError(
        "damaged central activation requires direct damage provenance",
      );
    }
    if (
      activation.cause === "friendly-lane-destroyed" &&
      !friendlyLaneDestroyed
    ) {
      throw new TypeError(
        "lane-destruction activation requires a destroyed friendly lane",
      );
    }
  }
  return {
    activationHistory,
    initialWindupTicks: windups,
    nextTick: state.nextTick,
    towers,
  };
}

/**
 * Deterministic six-tower state for one arena.
 *
 * Damage for a boundary is resolved as a simultaneous batch before activation,
 * target selection, and shot readiness. Events are stable by tower ID. This
 * model intentionally emits shot readiness only; projectile travel is external.
 * Central activation provenance is irreversible and written exactly when the
 * activation event is emitted. Direct damage wins when direct damage and a
 * friendly lane death occur on the same boundary.
 */
export class CrownTowerBattle {
  #state;
  #stepHistory;

  constructor({ initialWindupTicks }) {
    const windups = checkedWindups(initialWindupTicks);
    this.#state = {
      activationHistory: { north: null, south: null },
      initialWindupTicks: windups,
      nextTick: 0,
      towers: createInitialTowers(windups),
    };
    this.#stepHistory = [];
  }

  get state() {
    return {
      activationHistory: {
        north: this.#state.activationHistory.north === null
          ? null
          : { ...this.#state.activationHistory.north },
        south: this.#state.activationHistory.south === null
          ? null
          : { ...this.#state.activationHistory.south },
      },
      initialWindupTicks: { ...this.#state.initialWindupTicks },
      nextTick: this.#state.nextTick,
      towers: this.#state.towers.map(cloneTower),
    };
  }

  step(input) {
    return this.stepMany([input]);
  }

  stepMany(inputs) {
    const rawInputs = checkedArray(inputs, "tower step inputs");
    if (rawInputs.length > MAX_REPLAY_TICKS - this.#stepHistory.length) {
      throw new RangeError(
        `tower step history exceeds ${MAX_REPLAY_TICKS} ticks`,
      );
    }
    const validIds = new Set(this.#state.towers.map((tower) => tower.id));
    const checkedInputs = rawInputs.map((input, index) =>
      checkedStepInput(input, validIds, `tower step input ${index}`)
    );
    const candidate = restoreState(snapshotState(this.#state));
    const events = [];
    for (const input of checkedInputs) events.push(...stepChecked(candidate, input));
    this.#state = candidate;
    this.#stepHistory.push(...checkedInputs.map(cloneStepInput));
    return events;
  }

  serialize() {
    return canonicalJson({
      initialWindupTicks: { ...this.#state.initialWindupTicks },
      steps: this.#stepHistory.map(cloneStepInput),
      version: 3,
    });
  }

  static restore(serialized) {
    if (typeof serialized !== "string") {
      throw new TypeError("serialized tower state must be a string");
    }
    let value;
    try {
      value = JSON.parse(serialized);
    } catch {
      throw new TypeError("serialized tower state must be valid JSON");
    }
    const snapshot = plainObject(
      value,
      ["initialWindupTicks", "steps", "version"],
      "tower snapshot",
    );
    if (snapshot.version !== 3) {
      throw new TypeError("tower snapshot has an unsupported version");
    }
    const windups = checkedWindups(snapshot.initialWindupTicks);
    const steps = checkedArray(snapshot.steps, "tower snapshot.steps");
    if (steps.length > MAX_REPLAY_TICKS) {
      throw new RangeError(
        `tower snapshot.steps exceeds ${MAX_REPLAY_TICKS} ticks`,
      );
    }
    const battle = new CrownTowerBattle({
      initialWindupTicks: windups,
    });
    // HP, deaths, activation provenance, targets, and attack-cycle continuation
    // all derive from the immutable initial roster by the normal transition.
    // No serialized current-state field is trusted as an independent authority.
    battle.stepMany(steps);
    return battle;
  }
}

export function towerSecondsToTicks(seconds) {
  return attackSecondsToTicks(seconds);
}
