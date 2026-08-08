import {
  BattleCombat,
  MAX_BATTLE_COMBAT_STEP_TICKS,
} from "./battle-combat.js";
import { CrownTowerBattle } from "./towers.js";

export const MAX_BATTLE_TOWER_STEP_TICKS = MAX_BATTLE_COMBAT_STEP_TICKS;

const MAX_HISTORY = 100_000;
const MAX_SNAPSHOT_BYTES = 4_194_304;
const EXPLICIT_HISTORY_TAIL = 256;
const MAX_TICK = 1_000_000_000;
const TOWER_IDS = new Map([
  ["south:central", Number.MAX_SAFE_INTEGER - 5],
  ["south:lane:west", Number.MAX_SAFE_INTEGER - 4],
  ["south:lane:east", Number.MAX_SAFE_INTEGER - 3],
  ["north:central", Number.MAX_SAFE_INTEGER - 2],
  ["north:lane:west", Number.MAX_SAFE_INTEGER - 1],
  ["north:lane:east", Number.MAX_SAFE_INTEGER],
]);
const TOWER_NUMERIC_IDS = new Set(TOWER_IDS.values());
// Ceiling of the center-to-corner distance for the existing estimated arena
// footprints: sqrt(1,500^2 + 1,500^2) and sqrt(2,000^2 + 2,000^2).
// The combat kernel is circular, so the circumscribed radius represents the
// whole authoritative square footprint without a side-dependent correction.
const TOWER_FOOTPRINT_RADII = Object.freeze({ central: 2_829, lane: 2_122 });

function plain(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
       Object.getPrototypeOf(value) !== null) ||
      Object.getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError(`${label} must be a plain string-keyed data object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
  }
  return descriptors;
}

function exact(value, keys, label) {
  const descriptors = plain(value, label);
  const actual = Reflect.ownKeys(descriptors).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length ||
      actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has an invalid shape`);
  }
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function denseArray(value, label, maximum = MAX_HISTORY) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new TypeError(`${label} must be a bounded array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) ||
        Number(key) >= value.length) {
      throw new TypeError(`${label} must contain only indexed data`);
    }
  }
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[index];
    if (descriptor === undefined || !descriptor.enumerable ||
        !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label}[${index}] must be an enumerable data property`);
    }
    return descriptor.value;
  });
}

function integer(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be a safe integer from ${minimum} through ${maximum}`);
  }
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
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function positionVelocity(left, right) {
  if (left.length !== right.length) return null;
  return left.map((entry, index) => entry.id === right[index].id ? {
    dx: right[index].position.x - entry.position.x,
    dy: right[index].position.y - entry.position.y,
    id: entry.id,
  } : null).includes(null) ? null : left.map((entry, index) => ({
    dx: right[index].position.x - entry.position.x,
    dy: right[index].position.y - entry.position.y,
    id: entry.id,
  }));
}

function applyVelocity(positions, velocity) {
  return positions.map((entry, index) => ({ id: entry.id, position: {
    x: entry.position.x + velocity[index].dx,
    y: entry.position.y + velocity[index].dy,
  } }));
}

function compactTowerHistory(history) {
  const transcript = [];
  for (let index = 0; index < history.length;) {
    const operation = history[index];
    if (operation.type === "positions" && history[index + 1]?.type === "step" &&
        operation.command.tick === history[index + 1].tick) {
      const positions = clone(operation.command.positions);
      let prior = positions, velocity = null, ticks = 1;
      while (history[index + ticks * 2]?.type === "positions" &&
          history[index + ticks * 2 + 1]?.type === "step") {
        const next = history[index + ticks * 2].command;
        if (next.tick !== operation.command.tick + ticks ||
            history[index + ticks * 2 + 1].tick !== next.tick) break;
        const delta = positionVelocity(prior, next.positions);
        if (delta === null || (velocity !== null && canonical(delta) !== canonical(velocity))) break;
        velocity ??= delta; prior = next.positions; ticks += 1;
      }
      transcript.push({ positions, tick: operation.command.tick, ticks,
        type: "position-step-run", velocity: velocity ?? positions.map(({ id }) =>
          ({ dx: 0, dy: 0, id })) });
      index += ticks * 2; continue;
    }
    if (operation.type === "step") {
      let ticks = 1;
      while (history[index + ticks]?.type === "step" &&
          history[index + ticks].tick === operation.tick + ticks) ticks += 1;
      transcript.push({ tick: operation.tick, ticks, type: "step-run" });
      index += ticks; continue;
    }
    transcript.push(clone(operation)); index += 1;
  }
  return transcript;
}

function preflightUnitIds(units, label = "battle tower setup.units") {
  for (const [index, unit] of denseArray(units, label, 1_024).entries()) {
    const descriptors = plain(unit, `${label}[${index}]`);
    const id = descriptors.id?.value;
    if (TOWER_NUMERIC_IDS.has(id)) {
      throw new RangeError(`${label}[${index}].id is reserved for a crown tower structure`);
    }
  }
}

function structuresFrom(towers) {
  return towers.map((tower) => ({
    alive: tower.hitpoints > 0,
    id: TOWER_IDS.get(tower.id),
    kind: "structure",
    layer: "ground",
    position: { ...tower.position },
    radius: TOWER_FOOTPRINT_RADII[tower.role],
    side: tower.side,
    structureId: tower.id,
    targetable: tower.hitpoints > 0,
  }));
}

function candidatesFrom(combat) {
  const state = combat.state;
  const candidates = state.units.filter(({ alive }) => alive).map((unit) => ({
    alive: true,
    id: unit.id,
    kind: "troop",
    layer: unit.layer,
    position: { ...unit.position },
    radius: unit.radius,
    side: unit.side,
    targetable: true,
  }));
  for (const pending of state.pendingSpawns) {
    if (pending.tick !== state.tick || candidates.some(({ id }) => id === pending.id)) continue;
    candidates.push({
      alive: true,
      id: pending.id,
      kind: "troop",
      layer: pending.layer,
      position: { ...pending.position },
      radius: pending.radius,
      side: pending.side,
      targetable: true,
    });
  }
  return candidates.sort((left, right) => left.id - right.id);
}

function towerDamageFrom(events) {
  return events.filter(({ type }) => type === "external-structure-contact")
    .map(({ damage, structureId }) => ({ amount: damage, towerId: structureId }));
}

function projectileFor(shot, projectileId) {
  return {
    attackSequence: shot.attackSequence,
    damage: shot.damage,
    direction: shot.projectileIdentity.direction,
    projectileId,
    sourceId: shot.sourceId,
    targetUnitId: shot.targetUnitId,
  };
}

function identity(direction, sourceId, attackSequence, projectileId) {
  return { attackSequence, direction, projectileId, sourceId };
}

function withIdentity(event, projectileIdentity) {
  if (Object.hasOwn(event, "projectileIdentity") &&
      canonical(event.projectileIdentity) !== canonical(projectileIdentity)) {
    throw new TypeError("projectile event contains divergent identity provenance");
  }
  for (const [key, expected] of [
    ["attackSequence", projectileIdentity.attackSequence],
    ["direction", projectileIdentity.direction],
    ["projectileId", projectileIdentity.projectileId],
    ["sourceId", projectileIdentity.sourceId],
  ]) {
    if (Object.hasOwn(event, key) && event[key] !== expected) {
      throw new TypeError(`projectile event contains divergent ${key} provenance`);
    }
  }
  return {
    ...event,
    attackSequence: projectileIdentity.attackSequence,
    projectileIdentity: clone(projectileIdentity),
    projectileId: projectileIdentity.projectileId,
    projectileScope: projectileIdentity.direction,
    sourceId: projectileIdentity.sourceId,
  };
}

function currentUnitOrigins(combatEvents) {
  return combatEvents.filter(({ type }) => type === "projectile-launch").map((event) => {
    const projectile = event.projectile;
    const sequence = projectile.attackSequence ?? combatEvents.find((candidate) =>
      candidate.type === "attack" && candidate.attackerId === projectile.attackerId &&
      candidate.targetId === projectile.targetId && candidate.tick === projectile.launchTick)?.sequence;
    if (!Number.isSafeInteger(sequence)) {
      throw new TypeError("unit projectile launch lacks exact attack-sequence provenance");
    }
    return {
      identity: identity(
        Object.hasOwn(projectile, "structureId") ? "unit-to-tower" : "unit-to-unit",
        projectile.attackerId,
        sequence,
        projectile.id,
      ),
      structureId: projectile.structureId ?? null,
      targetId: projectile.targetId,
    };
  });
}

function exactOne(values, label) {
  if (values.length !== 1) throw new TypeError(`${label} must resolve exactly once`);
  return values[0];
}

function pendingUnitOrigins(previous, current) {
  const origins = new Map(previous);
  for (const origin of current) {
    const projectileId = origin.identity.projectileId;
    if (origins.has(projectileId)) {
      throw new TypeError("unit projectile provenance was not retired before its ID was reused");
    }
    origins.set(projectileId, origin);
  }
  return origins;
}

function unitOriginFor(origins, projectileId, targetId, sourceId, label) {
  const origin = origins.get(projectileId);
  if (origin === undefined || origin.targetId !== targetId ||
      (sourceId !== undefined && origin.identity.sourceId !== sourceId)) {
    throw new TypeError(`${label} provenance is missing or divergent`);
  }
  return origin;
}

function towerIngressFor(event, ingresses) {
  const attackSequence = event.attackSequence ?? event.projectileIdentity?.attackSequence;
  const direction = event.direction ?? event.projectileIdentity?.direction;
  const sourceId = event.sourceId ?? event.externalSourceId;
  const projectileId = event.projectileId ?? event.externalProjectileId;
  const targetUnitId = event.targetUnitId ?? event.targetId;
  const damage = event.damage ?? event.amount;
  return exactOne(ingresses.filter((ingress) =>
    ingress.command.attackSequence === attackSequence &&
    ingress.command.damage === damage &&
    ingress.command.direction === direction &&
    ingress.command.projectileId === projectileId &&
    ingress.command.sourceId === sourceId &&
    ingress.command.targetUnitId === targetUnitId), "tower projectile ingress provenance");
}

function enrichCombatEvents(combatEvents, ingresses, currentOrigins, unitOrigins) {
  return combatEvents.map((event) => {
    if (event.type === "projectile-launch") {
      const origin = unitOriginFor(unitOrigins, event.projectile.id, event.projectile.targetId,
        event.projectile.attackerId, "unit projectile launch");
      return withIdentity(event, origin.identity);
    }
    if (event.type === "external-structure-attack" && event.delivery === "projectile") {
      const origin = exactOne(currentOrigins.filter(({ identity: candidate, structureId }) =>
        candidate.direction === "unit-to-tower" &&
        candidate.sourceId === event.sourceUnitId &&
        candidate.attackSequence === event.attackSequence &&
        structureId === event.structureId), "unit structure attack projectile provenance");
      return withIdentity(event, origin.identity);
    }
    if (event.type === "external-structure-contact" && event.delivery === "projectile") {
      return withIdentity(event, identity(
        "unit-to-tower", event.sourceUnitId, event.attackSequence, event.projectileId,
      ));
    }
    if (event.type === "external-unit-contact" && event.delivery === "projectile") {
      return withIdentity(event, towerIngressFor(event, ingresses).identity);
    }
    if (event.type === "damage" && event.externalProjectileId !== undefined) {
      return withIdentity(event, towerIngressFor(event, ingresses).identity);
    }
    if ((event.type === "projectile-impact" ||
         (event.type === "damage" && event.delivery === "projectile")) &&
        event.projectileId !== undefined) {
      const sourceId = event.attackerId;
      const origin = unitOriginFor(unitOrigins, event.projectileId, event.targetId,
        sourceId, "unit projectile event");
      return withIdentity(event, origin.identity);
    }
    return event;
  });
}

function unifiedEvents(combatEvents, towerEvents, shots, ingresses, currentOrigins, unitOrigins) {
  const enrichedCombat = enrichCombatEvents(combatEvents, ingresses, currentOrigins, unitOrigins);
  const nonShotTowerEvents = towerEvents.filter(({ type }) => type !== "shot-ready");
  const phase = (event) => {
    if (event.type === "tower-activated" || event.type === "tower-destroyed") return 1;
    if (event.type === "tower-projectile-launch") return 2;
    if (event.type === "external-unit-contact") return 3;
    if (event.type === "damage" || event.type === "death") return 4;
    return 0;
  };
  return [...enrichedCombat, ...nonShotTowerEvents, ...shots]
    .map((event, index) => ({ event, index, phase: phase(event) }))
    .sort((left, right) => left.phase - right.phase || left.index - right.index)
    .map(({ event }) => event);
}

/**
 * One deterministic authority boundary joining ordinary units and crown towers.
 * BattleCombat remains the sole unit-health authority; CrownTowerBattle remains
 * the sole tower-health authority. A preview is discarded and exists only to
 * discover same-boundary structure contacts before either authority commits.
 */
export class BattleTowerCombat {
  #combat;
  #events;
  #history;
  #historyCount;
  #isContinuation;
  #nextTowerProjectileId;
  #setup;
  #towers;
  #unitProjectileOrigins;

  constructor(value) {
    const setup = exact(
      value,
      ["initialWindupTicks", "units"],
      "battle tower setup",
    );
    preflightUnitIds(setup.units);
    this.#combat = new BattleCombat({ units: setup.units });
    this.#towers = new CrownTowerBattle({
      initialWindupTicks: setup.initialWindupTicks,
    });
    this.#setup = clone(setup);
    this.#history = [];
    this.#historyCount = 0;
    this.#isContinuation = false;
    this.#events = clone(this.#combat.replay);
    this.#nextTowerProjectileId = 1;
    this.#unitProjectileOrigins = new Map();
    this.#assertSynchronized();
  }

  get state() {
    this.#assertSynchronized();
    const combat = this.#combat.state;
    const towers = this.#towers.state;
    return freeze({
      activationHistory: clone(towers.activationHistory),
      pendingSpawns: clone(combat.pendingSpawns),
      projectiles: clone(combat.projectiles),
      tick: combat.tick,
      towers: clone(towers.towers),
      units: clone(combat.units),
    });
  }

  get replay() {
    this.#assertPublicTranscript();
    return freeze(clone(this.#events));
  }

  /** Returns an independent transactional continuation without history replay. */
  fork() {
    this.#assertPublicTranscript();
    return this.#runtimeClone();
  }

  /** Internal composite checkpoint. Public history remains owned by the caller. */
  continuationFork() {
    return this.#runtimeClone(false);
  }

  spawn(command) {
    this.#reserveHistory();
    this.#assertUnitId(command);
    const event = this.#combat.spawn(command);
    this.#appendHistory({ command: clone(command), type: "spawn" });
    this.#events.push(clone(event));
    return freeze(clone(event));
  }

  scheduleSpawn(command) {
    this.#reserveHistory();
    this.#assertUnitId(command);
    const scheduled = this.#combat.scheduleSpawn(command);
    this.#appendHistory({ command: clone(command), type: "schedule-spawn" });
    const event = { id: scheduled.id, tick: this.#combat.state.tick,
      toTick: scheduled.tick, type: "schedule-spawn" };
    this.#events.push(event);
    return freeze(clone(scheduled));
  }

  updatePosition(command) {
    this.#reserveHistory();
    const event = this.#combat.updatePosition(command);
    this.#appendHistory({ command: clone(command), type: "position" });
    this.#events.push(clone(event));
    return freeze(clone(event));
  }

  updatePositions(command) {
    this.#reserveHistory();
    const events = this.#combat.updatePositions(command);
    this.#appendHistory({ command: clone(command), type: "positions" });
    this.#events.push(...clone(events));
    return freeze(clone(events));
  }

  step(tick = this.state.tick) {
    integer(tick, 0, MAX_TICK, "battle tower step tick");
    if (tick !== this.state.tick) {
      throw new RangeError("battle tower step tick must equal the current tick");
    }
    if (this.#historyCount >= MAX_HISTORY) {
      throw new RangeError("battle tower history bound exceeded");
    }
    return freeze(clone(this.#advance()));
  }

  stepMany(ticks) {
    integer(ticks, 0, MAX_BATTLE_TOWER_STEP_TICKS, "battle tower step ticks");
    if (this.state.tick + ticks > MAX_TICK) {
      throw new RangeError("battle tower tick bound exceeded");
    }
    if (this.#historyCount + ticks > MAX_HISTORY) {
      throw new RangeError("battle tower history bound exceeded");
    }
    const candidate = this.#runtimeClone();
    const events = [];
    for (let count = 0; count < ticks; count += 1) {
      events.push(...candidate.#advance());
    }
    this.#adopt(candidate);
    return freeze(clone(events));
  }

  serialize() {
    this.#assertPublicTranscript();
    if (this.#history.length > EXPLICIT_HISTORY_TAIL) {
      const tailStart = this.#history.length - EXPLICIT_HISTORY_TAIL;
      const serialized = canonical({ history: this.#history.slice(tailStart), setup: this.#setup,
        transcript: compactTowerHistory(this.#history.slice(0, tailStart)), version: 3 });
      if (new TextEncoder().encode(serialized).byteLength > MAX_SNAPSHOT_BYTES) {
        throw new RangeError("serialized battle tower combat exceeds the byte bound");
      }
      return serialized;
    }
    const serialized = canonical({
      combat: this.#combat.serialize(),
      history: this.#history,
      setup: this.#setup,
      towers: this.#towers.serialize(),
      version: 2,
    });
    if (new TextEncoder().encode(serialized).byteLength > MAX_SNAPSHOT_BYTES) {
      throw new RangeError("serialized battle tower combat exceeds the byte bound");
    }
    return serialized;
  }

  static restore(serialized) {
    if (typeof serialized !== "string") {
      throw new TypeError("serialized battle tower combat must be a string");
    }
    if (new TextEncoder().encode(serialized).byteLength > MAX_SNAPSHOT_BYTES) {
      throw new RangeError("serialized battle tower combat exceeds the byte bound");
    }
    let snapshot;
    try { snapshot = JSON.parse(serialized); }
    catch { throw new TypeError("serialized battle tower combat must be valid JSON"); }
    if (canonical(snapshot) !== serialized) {
      throw new TypeError("serialized battle tower combat must be canonical JSON");
    }
    if (snapshot.version === 3) {
      const checked = exact(snapshot, ["history", "setup", "transcript", "version"],
        "battle tower snapshot");
      const history = denseArray(checked.history, "battle tower snapshot.history");
      const transcript = denseArray(checked.transcript, "battle tower snapshot.transcript");
      const restored = new BattleTowerCombat(
        exact(checked.setup, ["initialWindupTicks", "units"], "snapshot setup"));
      let operations = history.length;
      const replay = (operation, index, label) => {
        plain(operation, `${label}[${index}]`);
        if (operation.type === "spawn") restored.spawn(exact(operation,
          ["command", "type"], `${label}[${index}]`).command);
        else if (operation.type === "schedule-spawn") restored.scheduleSpawn(exact(operation,
          ["command", "type"], `${label}[${index}]`).command);
        else if (operation.type === "position") restored.updatePosition(exact(operation,
          ["command", "type"], `${label}[${index}]`).command);
        else if (operation.type === "positions") restored.updatePositions(exact(operation,
          ["command", "type"], `${label}[${index}]`).command);
        else if (operation.type === "step") {
          const entry = exact(operation, ["tick", "type"], `${label}[${index}]`);
          if (entry.tick !== restored.state.tick) throw new TypeError("noncausal battle tower step history");
          restored.#advance();
        } else throw new TypeError(`battle tower snapshot.${label}[${index}] is invalid`);
      };
      for (const [index, record] of transcript.entries()) {
        plain(record, `battle tower snapshot.transcript[${index}]`);
        if (record.type === "step-run") {
          const run = exact(record, ["tick", "ticks", "type"], `transcript[${index}]`);
          const ticks = integer(run.ticks, 1, MAX_HISTORY, `transcript[${index}].ticks`);
          if (run.tick !== restored.state.tick) throw new TypeError("noncausal battle tower step run");
          if (ticks > MAX_HISTORY - operations) throw new RangeError("battle tower history bound exceeded");
          for (let count = 0; count < ticks; count += 1) restored.#advance();
          operations += ticks;
        } else if (record.type === "position-step-run") {
          const run = exact(record, ["positions", "tick", "ticks", "type", "velocity"],
            `transcript[${index}]`);
          const ticks = integer(run.ticks, 1, MAX_HISTORY, `transcript[${index}].ticks`);
          const positions = denseArray(run.positions, `transcript[${index}].positions`, 1_024);
          const velocity = denseArray(run.velocity, `transcript[${index}].velocity`, 1_024)
            .map((entry, velocityIndex) => exact(entry, ["dx", "dy", "id"],
              `transcript[${index}].velocity[${velocityIndex}]`));
          if (positions.length !== velocity.length || velocity.some((entry, velocityIndex) =>
            entry.id !== positions[velocityIndex]?.id) || run.tick !== restored.state.tick) {
            throw new TypeError("battle tower position-step run identities diverge");
          }
          if (ticks * 2 > MAX_HISTORY - operations) throw new RangeError("battle tower history bound exceeded");
          let current = clone(positions);
          for (let count = 0; count < ticks; count += 1) {
            restored.updatePositions({ positions: current, tick: run.tick + count });
            restored.#advance(); current = applyVelocity(current, velocity);
          }
          operations += ticks * 2;
        } else { replay(record, index, "transcript"); operations += 1; }
      }
      for (const [index, operation] of history.entries()) replay(operation, index, "history");
      if (restored.serialize() !== serialized) {
        throw new TypeError("battle tower snapshot witnesses are not causal");
      }
      return restored;
    }
    const checked = exact(snapshot, ["combat", "history", "setup", "towers", "version"],
      "battle tower snapshot");
    if (checked.version !== 1 && checked.version !== 2) {
      throw new TypeError("unsupported battle tower snapshot version");
    }
    const combatWitness = BattleCombat.restore(checked.combat);
    const combatSnapshot = JSON.parse(checked.combat);
    if (combatSnapshot.version !== checked.version) {
      throw new TypeError("battle tower and combat snapshot versions are mixed");
    }
    const setup = exact(checked.setup, ["initialWindupTicks", "units"], "snapshot setup");
    const history = denseArray(checked.history, "battle tower snapshot.history");
    const restored = new BattleTowerCombat(setup);
    for (let index = 0; index < history.length; index += 1) {
      const operation = history[index];
      plain(operation, `battle tower snapshot.history[${index}]`);
      if (operation.type === "spawn") {
        const entry = exact(operation, ["command", "type"], `history[${index}]`);
        restored.spawn(entry.command);
      } else if (operation.type === "schedule-spawn") {
        const entry = exact(operation, ["command", "type"], `history[${index}]`);
        restored.scheduleSpawn(entry.command);
      } else if (operation.type === "position") {
        const entry = exact(operation, ["command", "type"], `history[${index}]`);
        restored.updatePosition(entry.command);
      } else if (operation.type === "positions") {
        const entry = exact(operation, ["command", "type"], `history[${index}]`);
        restored.updatePositions(entry.command);
      } else if (operation.type === "step") {
        const entry = exact(operation, ["tick", "type"], `history[${index}]`);
        if (entry.tick !== restored.state.tick) {
          throw new TypeError("noncausal battle tower step history");
        }
        restored.#advance();
      } else {
        throw new TypeError(`battle tower snapshot.history[${index}] is invalid`);
      }
    }
    const combatWitnessMatches = checked.version === 2
      ? restored.#combat.serialize() === checked.combat
      : BattleCombat.continuationEquivalent(combatWitness, restored.#combat);
    if (!combatWitnessMatches || restored.#towers.serialize() !== checked.towers ||
        (checked.version === 2 && restored.serialize() !== serialized)) {
      throw new TypeError("battle tower snapshot witnesses are not causal");
    }
    return restored;
  }

  #advance() {
    this.#assertSynchronized();
    const tick = this.#combat.state.tick;
    const structures = structuresFrom(this.#towers.state.towers);
    const candidates = candidatesFrom(this.#combat);

    const previewEvents = this.#combat.previewBoundary({
      externalHits: [], externalProjectiles: [], structures, tick,
    });
    const towerInput = {
      candidates,
      damage: towerDamageFrom(previewEvents),
    };
    const towerEvents = this.#towers.previewLive(towerInput);
    const ready = towerEvents.filter(({ type }) => type === "shot-ready");
    const shots = ready.map((shot, index) => ({
      attackSequence: shot.sequence,
      damage: shot.damage,
      delivery: shot.delivery,
      projectileId: this.#nextTowerProjectileId + index,
      sourceId: shot.sourceId,
      sourceSide: shot.sourceSide,
      targetSide: shot.targetSide,
      targetUnitId: shot.targetId,
      tick,
      towerId: shot.towerId,
      type: "tower-projectile-launch",
    }));
    for (const shot of shots) {
      shot.projectileIdentity = identity(
        "tower-to-unit", shot.sourceId, shot.attackSequence, shot.projectileId,
      );
      shot.projectileScope = shot.projectileIdentity.direction;
    }
    const ingresses = shots.map((shot) => ({
      command: projectileFor(shot, shot.projectileId),
      identity: clone(shot.projectileIdentity),
    }));
    const combatInput = {
      externalHits: [],
      externalProjectiles: ingresses.map(({ command }) => command),
      structures,
      tick,
    };
    const combatEvents = this.#combat.previewBoundary(combatInput);
    const actualDamage = towerDamageFrom(combatEvents);
    if (canonical(actualDamage) !== canonical(towerDamageFrom(previewEvents))) {
      throw new TypeError("battle tower preview diverged from committed structure contacts");
    }

    this.#towers.stepLive(towerInput);
    this.#combat.stepBoundaryAfterPreview(combatInput, combatEvents);
    this.#nextTowerProjectileId += shots.length;
    this.#appendHistory({ tick, type: "step" });
    const currentOrigins = currentUnitOrigins(combatEvents);
    const unitOrigins = pendingUnitOrigins(this.#unitProjectileOrigins, currentOrigins);
    const events = unifiedEvents(combatEvents, towerEvents, shots, ingresses,
      currentOrigins, unitOrigins);
    for (const event of combatEvents) {
      if (event.type === "projectile-impact" && !unitOrigins.delete(event.projectileId)) {
        throw new TypeError("unit projectile impact lacks retained provenance");
      }
    }
    this.#unitProjectileOrigins = unitOrigins;
    this.#events.push(...clone(events));
    this.#assertSynchronized();
    return events;
  }

  #assertSynchronized() {
    if (this.#combat.state.tick !== this.#towers.state.nextTick) {
      throw new TypeError("battle combat and crown towers are not tick-synchronized");
    }
  }

  #assertUnitId(command) {
    const descriptors = plain(command, "battle tower unit command");
    const id = descriptors.id?.value;
    if (TOWER_NUMERIC_IDS.has(id)) {
      throw new RangeError("unit ID is reserved for a crown tower structure");
    }
  }

  #reserveHistory() {
    if (this.#historyCount >= MAX_HISTORY) {
      throw new RangeError("battle tower history bound exceeded");
    }
  }

  #appendHistory(operation) {
    this.#history.push(operation);
    this.#historyCount += 1;
  }

  #assertPublicTranscript() {
    if (this.#isContinuation) {
      throw new TypeError("internal battle tower continuation cannot expose a public transcript");
    }
  }

  #runtimeClone(includeTranscript = true) {
    const candidate = new BattleTowerCombat(this.#setup);
    const retainTranscript = includeTranscript && !this.#isContinuation;
    const checkpointed = !retainTranscript || this.#history.length > EXPLICIT_HISTORY_TAIL;
    candidate.#combat = checkpointed ? this.#combat.continuationFork() : this.#combat.fork();
    candidate.#towers = checkpointed ? this.#towers.continuationFork() : this.#towers.fork();
    candidate.#events = retainTranscript ? [...this.#events] : [];
    candidate.#history = retainTranscript ? [...this.#history] : [];
    candidate.#historyCount = this.#historyCount;
    candidate.#isContinuation = !retainTranscript;
    candidate.#nextTowerProjectileId = this.#nextTowerProjectileId;
    candidate.#setup = clone(this.#setup);
    candidate.#unitProjectileOrigins = new Map([...this.#unitProjectileOrigins]
      .map(([projectileId, origin]) => [projectileId, clone(origin)]));
    return candidate;
  }

  #adopt(candidate) {
    this.#combat = candidate.#combat;
    this.#towers = candidate.#towers;
    this.#events = candidate.#events;
    this.#history = candidate.#history;
    this.#historyCount = candidate.#historyCount;
    this.#isContinuation = candidate.#isContinuation;
    this.#nextTowerProjectileId = candidate.#nextTowerProjectileId;
    this.#setup = candidate.#setup;
    this.#unitProjectileOrigins = candidate.#unitProjectileOrigins;
  }
}

export const IntegratedBattleTowers = BattleTowerCombat;
