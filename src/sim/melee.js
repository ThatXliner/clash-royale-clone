import { AttackCycle } from "./attack-cycle.js";
import { DamageSystem } from "./damage.js";
import {
  MOVEMENT_SPEEDS,
  advanceMovement,
  createMovementState,
} from "./movement.js";
import { MAX_SPATIAL_MILLITILES, spatialEntity } from "./spatial.js";
import { retainOrAcquireTarget } from "./targeting.js";

export const MELEE_TICKS_PER_SECOND = 60;

const COMBATANT_KEYS = [
  "damage",
  "deployTicks",
  "firstHitTicks",
  "hitSpeedTicks",
  "hitpoints",
  "id",
  "position",
  "radius",
  "reach",
  "sightRange",
  "speed",
];
const SETUP_KEYS = ["combatants"];
const SPEEDS = new Set(Object.values(MOVEMENT_SPEEDS));

function exactObject(value, keys, label) {
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
    throw new TypeError(`${label} must contain only string-keyed data`);
  }
  if (
    actual.length !== keys.length ||
    [...actual].sort().some((key, index) => key !== [...keys].sort()[index])
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

function safeInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${label} must be a safe integer of at least ${minimum}`);
  }
}

function checkedCombatant(value, index) {
  const label = `combatant ${index}`;
  const unit = exactObject(value, COMBATANT_KEYS, label);
  safeInteger(unit.id, `${label}.id`, 1);
  safeInteger(unit.hitpoints, `${label}.hitpoints`, 1);
  safeInteger(unit.damage, `${label}.damage`);
  safeInteger(unit.deployTicks, `${label}.deployTicks`);
  safeInteger(unit.firstHitTicks, `${label}.firstHitTicks`);
  safeInteger(unit.hitSpeedTicks, `${label}.hitSpeedTicks`, 1);
  safeInteger(unit.radius, `${label}.radius`);
  safeInteger(unit.reach, `${label}.reach`);
  safeInteger(unit.sightRange, `${label}.sightRange`);
  if (
    !Number.isSafeInteger(unit.position) ||
    Math.abs(unit.position) > MAX_SPATIAL_MILLITILES
  ) {
    throw new TypeError(`${label}.position is outside the spatial bounds`);
  }
  if (!SPEEDS.has(unit.speed) || unit.speed === MOVEMENT_SPEEDS.stationary) {
    throw new TypeError(`${label}.speed must be a moving reference speed`);
  }
  spatialEntity({
    id: unit.id,
    layer: "ground",
    position: { x: unit.position, y: 0 },
    radius: unit.radius,
  }, label);
  return { ...unit };
}

function checkedSetup(value) {
  const setup = exactObject(value, SETUP_KEYS, "melee setup");
  if (!Array.isArray(setup.combatants) || setup.combatants.length !== 2) {
    throw new TypeError("melee setup.combatants must contain exactly two units");
  }
  const descriptors = Object.getOwnPropertyDescriptors(setup.combatants);
  if (
    Reflect.ownKeys(descriptors).some((key) =>
      key !== "length" &&
      (typeof key !== "string" ||
        !/^(0|1)$/.test(key) ||
        !descriptors[key].enumerable ||
        !Object.hasOwn(descriptors[key], "value"))
    ) ||
    descriptors[0] === undefined ||
    descriptors[1] === undefined
  ) {
    throw new TypeError("melee setup.combatants must contain only indexed data");
  }
  const combatants = setup.combatants.map(checkedCombatant);
  if (combatants[0].id === combatants[1].id) {
    throw new TypeError("melee combatant IDs must be unique");
  }
  if (combatants[0].position === combatants[1].position) {
    throw new RangeError("melee combatants must start at different positions");
  }
  combatants.sort((left, right) => left.id - right.id);
  return { combatants };
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function inReach(attacker, defender) {
  const distance = Math.abs(attacker.position - defender.position);
  return distance <= attacker.config.radius +
    attacker.config.reach +
    defender.config.radius;
}

function candidate(unit) {
  return {
    alive: unit.alive,
    id: unit.config.id,
    kind: "troop",
    layer: "ground",
    position: { x: unit.position, y: 0 },
    radius: unit.config.radius,
    targetable: true,
  };
}

/**
 * Deterministic two-combatant, instant-contact melee integration.
 *
 * Boundary T has this fixed phase order:
 * 1. live units retain/acquire their sole opponent inside sight;
 * 2. deployed, out-of-reach units move simultaneously toward that opponent;
 * 3. circle-edge attack reach is evaluated at the resulting positions;
 * 4. both attack cycles process boundary T;
 * 5. every ready hit lands in one simultaneous damage batch, then deaths commit.
 *
 * A unit therefore may enter reach and begin its first-hit windup on the same
 * boundary. A unit killed at T still lands a hit that was ready at T. Movement
 * cannot cross physical circle contact; if both proposals overfill the final
 * gap, unused distance is assigned in ascending entity-ID order.
 */
export class MeleeDuel {
  #cycles = new Map();
  #damage = new DamageSystem();
  #initial;
  #replay = [];
  #tick = 0;
  #units = [];

  constructor(setup) {
    this.#initial = checkedSetup(setup);
    this.#units = this.#initial.combatants.map((config) => ({
      alive: true,
      config,
      currentTargetId: null,
      position: config.position,
      remainder: 0,
    }));
    for (const unit of this.#units) {
      this.#damage.add(unit.config.id, unit.config.hitpoints);
      this.#cycles.set(unit.config.id, new AttackCycle({
        deployTicks: unit.config.deployTicks,
        firstHitTicks: unit.config.firstHitTicks,
        hitSpeedTicks: unit.config.hitSpeedTicks,
      }));
    }
  }

  get replay() {
    return clone(this.#replay);
  }

  get outcome() {
    const alive = this.#units.filter((unit) => unit.alive);
    if (alive.length === 2) return null;
    return {
      deathTick: this.#replay.findLast((event) => event.type === "death")?.tick ??
        null,
      draw: alive.length === 0,
      winnerId: alive.length === 1 ? alive[0].config.id : null,
    };
  }

  get state() {
    return clone({
      combatants: this.#units.map((unit) => ({
        alive: unit.alive,
        attack: this.#cycles.get(unit.config.id).state,
        currentTargetId: unit.currentTargetId,
        hitpoints: this.#damage.get(unit.config.id).currentHealth,
        id: unit.config.id,
        position: unit.position,
        remainder: unit.remainder,
      })),
      outcome: this.outcome,
      tick: this.#tick,
    });
  }

  step() {
    return this.stepMany(1);
  }

  /**
   * Advances up to the requested count of boundaries, stopping at resolution.
   * The command is validated before mutation. A later call on a resolved duel
   * is rejected rather than padded with inert ticks.
   */
  stepMany(ticks) {
    safeInteger(ticks, "melee step count");
    if (this.outcome !== null && ticks > 0) {
      throw new RangeError("melee duel is already resolved");
    }
    if (ticks > Number.MAX_SAFE_INTEGER - this.#tick) {
      throw new RangeError("melee tick exceeds the safe integer range");
    }
    const events = [];
    for (let index = 0; index < ticks; index += 1) {
      if (this.outcome !== null) break;
      events.push(...this.#stepBoundary());
    }
    return clone(events);
  }

  run(maxTicks) {
    safeInteger(maxTicks, "melee run limit");
    if (maxTicks > Number.MAX_SAFE_INTEGER - this.#tick) {
      throw new RangeError("melee run limit exceeds the safe tick range");
    }
    const events = [];
    for (let index = 0; index < maxTicks && this.outcome === null; index += 1) {
      events.push(...this.#stepBoundary());
    }
    return clone({
      events,
      outcome: this.outcome,
      state: this.state,
    });
  }

  serialize() {
    return canonicalJson({
      setup: this.#initial,
      tick: this.#tick,
      version: 1,
    });
  }

  static restore(serialized) {
    if (typeof serialized !== "string") {
      throw new TypeError("serialized melee duel must be a string");
    }
    let snapshot;
    try {
      snapshot = JSON.parse(serialized);
    } catch {
      throw new TypeError("serialized melee duel must be valid JSON");
    }
    const checked = exactObject(
      snapshot,
      ["setup", "tick", "version"],
      "melee snapshot",
    );
    if (checked.version !== 1) {
      throw new TypeError("melee snapshot has an unsupported version");
    }
    safeInteger(checked.tick, "melee snapshot.tick");
    const duel = new MeleeDuel(checked.setup);
    duel.stepMany(checked.tick);
    if (duel.#tick !== checked.tick) {
      throw new TypeError("melee snapshot.tick extends beyond duel resolution");
    }
    return duel;
  }

  #stepBoundary() {
    const tick = this.#tick;
    const events = [];
    const byId = new Map(this.#units.map((unit) => [unit.config.id, unit]));

    for (const unit of this.#units) {
      if (!unit.alive) continue;
      const opponent = this.#units.find((other) => other !== unit);
      const target = retainOrAcquireTarget(
        {
          position: { x: unit.position, y: 0 },
          radius: unit.config.radius,
        },
        [candidate(opponent)],
        {
          currentTargetId: unit.currentTargetId,
          mode: "ground",
          sightRange: unit.config.sightRange,
        },
      );
      const nextTargetId = target?.id ?? null;
      if (nextTargetId !== unit.currentTargetId) {
        events.push({
          attackerId: unit.config.id,
          targetId: nextTargetId,
          tick,
          type: "target",
        });
      }
      unit.currentTargetId = nextTargetId;
    }

    const proposals = new Map();
    for (const unit of this.#units) {
      const cycle = this.#cycles.get(unit.config.id);
      const target = byId.get(unit.currentTargetId);
      if (
        !unit.alive ||
        target === undefined ||
        !target.alive ||
        cycle.state.nextTick < unit.config.deployTicks ||
        inReach(unit, target)
      ) {
        proposals.set(unit.config.id, unit.position);
        continue;
      }
      const direction = Math.sign(target.position - unit.position);
      const moved = advanceMovement(createMovementState({
        direction,
        position: unit.position,
        remainder: unit.remainder,
        speed: unit.config.speed,
      }));
      proposals.set(unit.config.id, moved.position);
      unit.remainder = moved.remainder;
    }

    const [left, right] = [...this.#units].sort(
      (a, b) => a.position - b.position || a.config.id - b.config.id,
    );
    const physicalGap = Math.max(
      0,
      right.position - left.position -
        left.config.radius - right.config.radius,
    );
    const leftAdvance = Math.max(0, proposals.get(left.config.id) - left.position);
    const rightAdvance = Math.max(0, right.position - proposals.get(right.config.id));
    if (leftAdvance + rightAdvance > physicalGap) {
      const byStableId = [...this.#units].sort(
        (a, b) => a.config.id - b.config.id,
      );
      let remaining = physicalGap;
      for (const unit of byStableId) {
        const proposedAdvance = unit === left ? leftAdvance : rightAdvance;
        const applied = Math.min(proposedAdvance, remaining);
        proposals.set(
          unit.config.id,
          unit.position + Math.sign(
            byId.get(unit.currentTargetId).position - unit.position,
          ) * applied,
        );
        remaining -= applied;
      }
    }
    for (const unit of this.#units) {
      const next = proposals.get(unit.config.id);
      if (next !== unit.position) {
        events.push({
          from: unit.position,
          id: unit.config.id,
          tick,
          to: next,
          type: "move",
        });
        unit.position = next;
      }
    }

    const ready = [];
    for (const unit of this.#units) {
      const target = byId.get(unit.currentTargetId);
      const eligible =
        unit.alive &&
        target !== undefined &&
        target.alive &&
        inReach(unit, target);
      const attacks = this.#cycles.get(unit.config.id).step({
        targetEligible: eligible,
        targetId: eligible ? target.config.id : null,
      });
      for (const attack of attacks) {
        ready.push({
          amount: unit.config.damage,
          attackerId: unit.config.id,
          sequence: attack.sequence,
          targetId: attack.targetId,
          tick,
          type: "attack",
        });
      }
    }
    events.push(...ready);

    const batch = this.#damage.damageSimultaneously(
      ready.map((attack) => ({
        amount: attack.amount,
        targetId: attack.targetId,
      })),
    );
    let damageIndex = 0;
    for (const event of batch.events) {
      if (event.type === "damage") {
        events.push({
          ...event,
          attackerId: ready[damageIndex].attackerId,
          tick,
        });
        damageIndex += 1;
      } else {
        events.push({ ...event, tick });
        byId.get(event.targetId).alive = false;
      }
    }

    this.#replay.push(...events);
    this.#tick += 1;
    return events;
  }
}
