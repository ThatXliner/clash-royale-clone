import { MATCH_MAX_EVIDENCE_COMMANDS, MATCH_MAX_TICKS } from "./match.js";
import { CrownTowerBattle, TOWER_COMBAT_CONFIG } from "./towers.js";

export const TOWER_EVIDENCE_MAX_STEPS = 100_000;
export const TOWER_EVIDENCE_MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;

const BATTLE_IDS = Object.freeze([
  "south:central",
  "south:lane:west",
  "south:lane:east",
  "north:central",
  "north:lane:west",
  "north:lane:east",
]);
const MATCH_IDS = Object.freeze([
  "north:central",
  "north:lane:left",
  "north:lane:right",
  "south:central",
  "south:lane:left",
  "south:lane:right",
]);
const MATCH_INDEX = new Map(MATCH_IDS.map((id, index) => [id, index]));
const ID_MAP = Object.freeze({
  "north:central": "north:central",
  "north:lane:east": "north:lane:right",
  "north:lane:west": "north:lane:left",
  "south:central": "south:central",
  "south:lane:east": "south:lane:right",
  "south:lane:west": "south:lane:left",
});

function exactObject(value, keys, label) {
  if (
    value === null || typeof value !== "object" || Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) throw new TypeError(`${label} must be a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.some((key) => typeof key !== "string")) throw new TypeError(`${label} must contain only string keys`);
  const sorted = [...actual].sort();
  const wanted = [...keys].sort();
  if (sorted.length !== wanted.length || sorted.some((key, index) => key !== wanted[index])) {
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

function exactArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
      throw new TypeError(`${label} must contain only indexed data`);
    }
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label}[${key}] must be an enumerable data property`);
    }
  }
  return Array.from(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function checkedSnapshot(serialized, label = "CrownTowerBattle snapshot") {
  if (typeof serialized !== "string") throw new TypeError(`${label} must be a string`);
  if (serialized.length > TOWER_EVIDENCE_MAX_SNAPSHOT_BYTES) throw new RangeError(`${label} exceeds byte limit`);
  let parsed;
  try { parsed = JSON.parse(serialized); } catch { throw new TypeError(`${label} must be valid JSON`); }
  const snapshot = exactObject(parsed, ["initialWindupTicks", "steps", "version"], label);
  const steps = exactArray(snapshot.steps, `${label}.steps`);
  if (steps.length > TOWER_EVIDENCE_MAX_STEPS) throw new RangeError(`${label}.steps exceeds bridge limit`);
  // CrownTowerBattle.restore is the sole authority for step shapes, replay
  // bounds, tower state, activation causes, event order, and attack events.
  const battle = CrownTowerBattle.restore(serialized);
  if (battle.serialize() !== serialized) throw new TypeError(`${label} must use canonical bytes`);
  return {
    battle,
    initialWindupTicks: clone(snapshot.initialWindupTicks),
    serialized,
    steps: clone(steps),
  };
}

function initialHitpoints() {
  return Object.fromEntries(BATTLE_IDS.map((id) => [
    id,
    TOWER_COMBAT_CONFIG[id.endsWith(":central") ? "central" : "lane"].hitpoints,
  ]));
}

function stateHitpoints(state) {
  return Object.fromEntries(state.towers.map((tower) => [tower.id, tower.hitpoints]));
}

function evidenceFromHitpoints(hitpoints) {
  const towers = MATCH_IDS.map((id) => {
    const sourceId = BATTLE_IDS.find((candidate) => ID_MAP[candidate] === id);
    return { hitpoints: hitpoints[sourceId], id };
  });
  return {
    destroyedTowerIds: towers.filter((tower) => tower.hitpoints === 0).map((tower) => tower.id),
    towers,
  };
}

/** Pure mapping for callers that already own an authoritative live battle. */
export function mapLiveBattleTowerStateToMatchEvidence(towers) {
  const values = exactArray(towers, "live battle towers");
  if (values.length !== BATTLE_IDS.length) {
    throw new TypeError("live battle towers must contain all six towers");
  }
  const hitpoints = {};
  for (const [index, value] of values.entries()) {
    const tower = exactObject(value, ["active", "attack", "hitpoints", "id", "lane",
      "position", "role", "side"], `live battle towers[${index}]`);
    if (!BATTLE_IDS.includes(tower.id) || Object.hasOwn(hitpoints, tower.id) ||
        !Number.isSafeInteger(tower.hitpoints) || tower.hitpoints < 0) {
      throw new TypeError(`live battle towers[${index}] is invalid`);
    }
    hitpoints[tower.id] = tower.hitpoints;
  }
  return deepFreeze(evidenceFromHitpoints(hitpoints));
}

function stepsArePrefix(previous, next) {
  return previous.length <= next.length && previous.every(
    (step, index) => canonicalJson(step) === canonicalJson(next[index]),
  );
}

function causeRecords(before, after, events, tick) {
  const destructionOrdinal = new Map();
  events.forEach((event, ordinal) => {
    if (event.type === "tower-destroyed") destructionOrdinal.set(event.towerId, ordinal);
  });
  return BATTLE_IDS.filter((id) => after[id] < before[id]).map((sourceTowerId) => {
    const lethal = after[sourceTowerId] === 0;
    if (lethal && !destructionOrdinal.has(sourceTowerId)) {
      throw new TypeError("authoritative replay omitted a lethal destruction event");
    }
    return {
      eventOrdinal: lethal ? destructionOrdinal.get(sourceTowerId) : null,
      kind: lethal ? "tower-destroyed" : "nonlethal-damage",
      source: lethal ? "CrownTowerBattle:tower-destroyed" : "CrownTowerBattle:causal-step",
      sourceTowerId,
      tick,
      towerId: ID_MAP[sourceTowerId],
    };
  }).sort((left, right) => MATCH_INDEX.get(left.towerId) - MATCH_INDEX.get(right.towerId));
}

function replaySuffix(current, incoming, provenance, commandCount) {
  if (current !== null) {
    if (canonicalJson(current.initialWindupTicks) !== canonicalJson(incoming.initialWindupTicks)) {
      throw new TypeError("CrownTowerBattle windups cannot change between snapshots");
    }
    if (!stepsArePrefix(current.steps, incoming.steps)) {
      throw new TypeError("CrownTowerBattle snapshot must append to the exact prior replay");
    }
  }
  const startIndex = current?.steps.length ?? 0;
  const battle = current === null
    ? new CrownTowerBattle({ initialWindupTicks: incoming.initialWindupTicks })
    : CrownTowerBattle.restore(current.serialized);
  let hitpoints = stateHitpoints(battle.state);
  const nextProvenance = provenance.map(clone);
  const commands = [];
  for (let index = startIndex; index < incoming.steps.length; index += 1) {
    const before = hitpoints;
    const events = battle.step(incoming.steps[index]);
    hitpoints = stateHitpoints(battle.state);
    const tick = index;
    nextProvenance.push({ events: clone(events), stepIndex: index, tick });
    if (canonicalJson(before) === canonicalJson(hitpoints)) continue;
    if (tick > MATCH_MAX_TICKS) throw new RangeError(`tower evidence tick must not exceed ${MATCH_MAX_TICKS}`);
    if (commandCount + commands.length >= MATCH_MAX_EVIDENCE_COMMANDS) {
      throw new RangeError("tower evidence command limit exceeded");
    }
    commands.push({
      causes: causeRecords(before, hitpoints, events, tick),
      evidence: evidenceFromHitpoints(hitpoints),
      provenance: { events: clone(events), stepIndex: index, tick },
      tick,
    });
  }
  if (battle.serialize() !== incoming.serialized) {
    throw new TypeError("CrownTowerBattle replay continuation is noncanonical");
  }
  return { commands, hitpoints, provenance: nextProvenance };
}

/**
 * Converts authoritative CrownTowerBattle replay bytes into cumulative
 * MatchClock evidence. Callers schedule each returned record with
 * `match.scheduleTowerEvidence(record.tick, record.evidence)`.
 */
export class TowerEvidenceBridge {
  #commandCount = 0;
  #current = null;
  #hitpoints = initialHitpoints();
  #provenance = [];

  get state() {
    return deepFreeze({
      commandCount: this.#commandCount,
      evidence: evidenceFromHitpoints(this.#hitpoints),
      provenance: clone(this.#provenance),
      stepCount: this.#current?.steps.length ?? 0,
    });
  }

  observe(serializedBattle) {
    const incoming = checkedSnapshot(serializedBattle);
    if (incoming.serialized === this.#current?.serialized) return deepFreeze([]);
    const replayed = replaySuffix(this.#current, incoming, this.#provenance, this.#commandCount);
    this.#current = incoming;
    this.#hitpoints = replayed.hitpoints;
    this.#provenance = replayed.provenance;
    this.#commandCount += replayed.commands.length;
    return deepFreeze(replayed.commands);
  }

  serialize() {
    return canonicalJson({
      battleSnapshot: this.#current?.serialized ?? null,
      version: 2,
    });
  }

  static restore(serialized) {
    if (typeof serialized !== "string") throw new TypeError("serialized tower evidence must be a string");
    if (serialized.length > TOWER_EVIDENCE_MAX_SNAPSHOT_BYTES) throw new RangeError("tower evidence snapshot exceeds byte limit");
    let parsed;
    try { parsed = JSON.parse(serialized); } catch { throw new TypeError("serialized tower evidence must be valid JSON"); }
    const snapshot = exactObject(parsed, ["battleSnapshot", "version"], "tower evidence snapshot");
    if (snapshot.version !== 2) throw new TypeError("tower evidence snapshot.version must be 2");
    if (snapshot.battleSnapshot !== null && typeof snapshot.battleSnapshot !== "string") {
      throw new TypeError("tower evidence snapshot.battleSnapshot must be a string or null");
    }
    const bridge = new TowerEvidenceBridge();
    if (snapshot.battleSnapshot !== null) bridge.observe(snapshot.battleSnapshot);
    if (bridge.serialize() !== serialized) throw new TypeError("tower evidence snapshot must use canonical bytes");
    return bridge;
  }
}

export function mapBattleTowerIdToMatchTowerId(id) {
  if (typeof id !== "string" || !Object.hasOwn(ID_MAP, id)) throw new TypeError("battle tower ID is unknown");
  return ID_MAP[id];
}
