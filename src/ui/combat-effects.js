import {
  ARENA_LENGTH_MILLITILES,
  ARENA_WIDTH_MILLITILES,
} from "../sim/arena-geometry.js";

export const COMBAT_EFFECT_EVENT_LIMIT = 4_096;
export const COMBAT_EFFECT_PRIMITIVE_LIMIT = 2_048;
export const COMBAT_EFFECT_VIEW_VERSION = 2;

const VIEWS = new WeakSet();
const TOKEN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const IGNORED_TYPES = new Set([
  "damage", "death", "external-damage", "external-death", "hit",
  "pierce-command", "pierce-damage", "pierce-death", "pierce-hit",
  "return-command", "return-contact", "return-damage", "return-death",
  "return-hit", "return-launch-cancelled", "return-source-died",
  "return-spell-damage", "return-spell-death", "return-target-died",
  "pellet-command", "pellet-aggregate-damage", "pellet-contact",
  "pellet-damage", "pellet-death", "travel-cancel-requested",
  "travel-contact", "travel-launch-cancelled", "travel-source-died",
  "travel-spell-damage", "travel-spell-death", "travel-spell-hit",
  "travel-spell-impact", "travel-target-died",
]);

const STYLE_TEXT = `.combat-effects{position:absolute;z-index:35;inset:0;overflow:hidden;pointer-events:none}.combat-effects__frame{position:absolute;inset:0}.combat-effect-path{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.combat-effect-path line{stroke:#d9f4d5aa;stroke-width:100;stroke-linecap:round;stroke-dasharray:210 130}.combat-effect-projectile,.combat-effect-impact,.combat-effect-area{position:absolute;left:calc(var(--effect-x-num)*100%/(18000*var(--effect-den)));top:calc(var(--effect-y-num)*100%/(32000*var(--effect-den)));translate:-50% -50%;border-radius:50%}.combat-effect-projectile{width:12px;height:12px;background:#fff0a5;border:2px solid #603d28;box-shadow:0 0 8px #ffcd65}.combat-effect-projectile[data-kind="return"]{border-radius:35% 65%;background:#8ce7dd}.combat-effect-projectile[data-kind="pellet"]{width:7px;height:7px}.combat-effect-impact{width:24px;height:24px;border:4px double #ffe6a0;background:#e8703655}.combat-effect-area{width:calc(var(--effect-radius)*200%/18000);aspect-ratio:1;border:3px solid #f2c66e;background:#d96f3933}`;

export function getCombatEffectsStyleText() {
  return STYLE_TEXT;
}

function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new TypeError(`${label} must be an integer from ${min} through ${max}`);
  }
  return value;
}

function ownData(value, label) {
  if (
    value === null || typeof value !== "object" ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) throw new TypeError(`${label} must be a plain data object`);
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError(`${label} must not have symbol properties`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result = {};
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key !== "string" || !descriptor.enumerable ||
      !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label}.${String(key)} must be an enumerable data property`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function array(value, limit, label) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > limit || Object.getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError(`${label} must be a plain array of at most ${limit} items`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) ||
      Number(key) >= value.length) throw new TypeError(`${label} contains non-index data`);
  }
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label}[${index}] must be an enumerable data property`);
    }
    return descriptor.value;
  });
}

function validateTree(value, label, depth = 0, budget = { nodes: 0 }) {
  budget.nodes += 1;
  if (budget.nodes > 32_768 || depth > 12) throw new RangeError(`${label} exceeds its data bound`);
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError(`${label} numbers must be safe integers`);
    return;
  }
  if (typeof value === "string") {
    if (value.length > 4_096) throw new TypeError(`${label} strings must be bounded`);
    return;
  }
  if (Array.isArray(value)) {
    const children = array(value, COMBAT_EFFECT_EVENT_LIMIT, label);
    children.forEach((child, index) => validateTree(child, `${label}[${index}]`, depth + 1, budget));
    return;
  }
  if (value && typeof value === "object") {
    const record = ownData(value, label);
    if (Reflect.ownKeys(record).length > 128) throw new RangeError(`${label} has too many properties`);
    for (const [key, child] of Object.entries(record)) validateTree(child, `${label}.${key}`, depth + 1, budget);
    return;
  }
  throw new TypeError(`${label} contains unsupported data`);
}

function field(record, name, label) {
  if (!Object.hasOwn(record, name)) throw new TypeError(`${label}.${name} is required`);
  return record[name];
}

function id(value, label) {
  if (Number.isSafeInteger(value) && value >= 1) return String(value);
  if (typeof value === "string" && value.length <= 96 && TOKEN.test(value)) return value;
  throw new TypeError(`${label} must be a bounded ID`);
}

function decimal(value, label, { positive = false, signed = false } = {}) {
  const pattern = signed ? /^(?:0|-?[1-9]\d*)$/u : /^(?:0|[1-9]\d*)$/u;
  if (typeof value !== "string" || value.length > 32 || !pattern.test(value)) {
    throw new TypeError(`${label} must be a bounded canonical decimal`);
  }
  const parsed = BigInt(value);
  if (positive && parsed === 0n) throw new TypeError(`${label} must be positive`);
  return parsed;
}

function rationalPoint(value, label, allowOutside = false) {
  const raw = ownData(value, label);
  let denominator;
  let xNumerator;
  let yNumerator;
  if (Object.hasOwn(raw, "x") || Object.hasOwn(raw, "y")) {
    if (Reflect.ownKeys(raw).length !== 2) throw new TypeError(`${label} has an invalid shape`);
    const margin = allowOutside ? ARENA_LENGTH_MILLITILES : 0;
    const x = integer(field(raw, "x", label), -margin, ARENA_WIDTH_MILLITILES + margin, `${label}.x`);
    const y = integer(field(raw, "y", label), -margin, ARENA_LENGTH_MILLITILES + margin, `${label}.y`);
    denominator = 1n;
    xNumerator = BigInt(x);
    yNumerator = BigInt(y);
  } else {
    if (Reflect.ownKeys(raw).length !== 3) throw new TypeError(`${label} has an invalid shape`);
    denominator = decimal(field(raw, "denominator", label), `${label}.denominator`, { positive: true });
    xNumerator = decimal(field(raw, "xNumerator", label), `${label}.xNumerator`, { signed: allowOutside });
    yNumerator = decimal(field(raw, "yNumerator", label), `${label}.yNumerator`, { signed: allowOutside });
    const margin = BigInt(allowOutside ? ARENA_LENGTH_MILLITILES : 0) * denominator;
    if (xNumerator < -margin || xNumerator > BigInt(ARENA_WIDTH_MILLITILES) * denominator + margin ||
      yNumerator < -margin || yNumerator > BigInt(ARENA_LENGTH_MILLITILES) * denominator + margin) {
      throw new TypeError(`${label} lies outside the arena`);
    }
  }
  return {
    denominator: denominator.toString(),
    xNumerator: xNumerator.toString(),
    yNumerator: yNumerator.toString(),
  };
}

function interpolate(from, to, elapsed, duration) {
  const a = BigInt(from.denominator);
  const b = BigInt(to.denominator);
  const d = BigInt(duration);
  const e = BigInt(elapsed);
  const denominator = a * b * d;
  const remaining = d - e;
  return {
    denominator: denominator.toString(),
    xNumerator: (BigInt(from.xNumerator) * b * remaining +
      BigInt(to.xNumerator) * a * e).toString(),
    yNumerator: (BigInt(from.yNumerator) * b * remaining +
      BigInt(to.yNumerator) * a * e).toString(),
  };
}

function eventTick(event, viewTick, label) {
  return integer(field(event, "tick", label), 0, viewTick, `${label}.tick`);
}

function eventType(event, label) {
  const value = field(event, "type", label);
  if (typeof value !== "string" || value.length > 64 || !TOKEN.test(value)) {
    throw new TypeError(`${label}.type must be a bounded event token`);
  }
  return value;
}

function path(key, kind, from, to, launchTick, impactTick, sourceSequence) {
  if (impactTick < launchTick) throw new TypeError("effect impact tick precedes launch");
  return { from, impactTick, key, kind, launchTick, sourceSequence, to };
}

function oldestActive(active, kind, predicate = () => true) {
  return [...active.values()]
    .filter((record) => record.kind === kind && predicate(record))
    .sort((left, right) => left.sourceSequence - right.sourceSequence)[0] ?? null;
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("combat effect numbers must be safe integers");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  throw new TypeError("combat effect view contains an unsupported value");
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function createCombatEffectsViewModel(state) {
  const source = ownData(state, "combat effects state");
  if (Reflect.ownKeys(source).length !== 2 || !Object.hasOwn(source, "events") ||
    !Object.hasOwn(source, "tick")) throw new TypeError("combat effects state has an invalid shape");
  const tick = integer(source.tick, 0, Number.MAX_SAFE_INTEGER, "combat effects state.tick");
  const events = array(source.events, COMBAT_EFFECT_EVENT_LIMIT, "combat effects events");
  const active = new Map();
  const areas = [];
  const impacts = [];
  let priorTick = -1;

  for (let sequence = 0; sequence < events.length; sequence += 1) {
    const label = `combat effects events[${sequence}]`;
    validateTree(events[sequence], label);
    const event = ownData(events[sequence], label);
    const type = eventType(event, label);
    const at = eventTick(event, tick, label);
    validateCanonicalEvent(event, type, label);
    if (at < priorTick) throw new TypeError("combat effects event ticks must be nondecreasing");
    priorTick = at;

    if (type === "launch") {
      const projectile = ownData(field(event, "projectile", label), `${label}.projectile`);
      const projectileId = id(field(projectile, "id", `${label}.projectile`), `${label}.projectile.id`);
      const launchTick = integer(field(projectile, "launchTick", label), 0, at, `${label}.projectile.launchTick`);
      if (launchTick !== at) throw new TypeError(`${label} launch ticks disagree`);
      const impactTick = integer(field(projectile, "impactTick", label), at, Number.MAX_SAFE_INTEGER, `${label}.projectile.impactTick`);
      const key = `projectile:${projectileId}`;
      if (active.has(key)) throw new TypeError("combat effect path IDs must be unique while active");
      active.set(key, path(key, "projectile",
        rationalPoint(field(projectile, "origin", label), `${label}.projectile.origin`),
        rationalPoint(field(projectile, "targetPosition", label), `${label}.projectile.targetPosition`),
        at, impactTick, sequence));
    } else if (type === "impact") {
      const key = `projectile:${id(field(event, "projectileId", label), `${label}.projectileId`)}`;
      const current = active.get(key);
      if (!current || current.impactTick !== at) throw new TypeError(`${label} has no matching launch`);
      active.delete(key);
      if (at === tick) impacts.push({ key, kind: "projectile", point: current.to, sourceSequence: sequence });
    } else if (type === "pierce-launch") {
      const key = `pierce:${sequence}`;
      const impactTick = integer(field(event, "impactTick", label), at, Number.MAX_SAFE_INTEGER, `${label}.impactTick`);
      active.set(key, path(key, "pierce",
        rationalPoint(field(event, "origin", label), `${label}.origin`),
        rationalPoint(field(event, "endpoint", label), `${label}.endpoint`, true), at, impactTick, sequence));
    } else if (type === "pierce-complete") {
      const cancelled = event.reason === "launch-cancelled";
      const current = cancelled ? null : oldestActive(active, "pierce", (record) => record.impactTick === at);
      if (current) {
        active.delete(current.key);
        if (at === tick) impacts.push({ key: current.key, kind: "pierce", point: current.to, sourceSequence: sequence });
      }
    } else if (type === "return-launch") {
      const effectId = Object.hasOwn(event, "effectId")
        ? id(event.effectId, `${label}.effectId`)
        : null;
      const key = effectId === null ? `return:${sequence}` : `return:effect:${effectId}`;
      if (active.has(key)) throw new TypeError(`${label} duplicates an active return effect`);
      const turnTick = integer(field(event, "turnTick", label), at, Number.MAX_SAFE_INTEGER, `${label}.turnTick`);
      const completeTick = integer(field(event, "completeTick", label), turnTick, Number.MAX_SAFE_INTEGER, `${label}.completeTick`);
      const from = rationalPoint(field(event, "origin", label), `${label}.origin`);
      const turnField = Object.hasOwn(event, "turnPoint") ? "turnPoint" : "turn";
      const turn = rationalPoint(field(event, turnField, label), `${label}.${turnField}`, true);
      active.set(key, { ...path(key, "return", from, turn, at, turnTick, sequence), completeTick, origin: from, turn });
    } else if (type === "return-turn") {
      const turnField = Object.hasOwn(event, "turnPoint") ? "turnPoint" : "turn";
      const turnPoint = rationalPoint(field(event, turnField, label), `${label}.${turnField}`, true);
      const effectId = Object.hasOwn(event, "effectId") ? id(event.effectId, `${label}.effectId`) : null;
      const current = oldestActive(active, "return", (record) =>
        record.impactTick === at && canonicalJson(record.turn) === canonicalJson(turnPoint) &&
        (effectId === null || record.key === `return:effect:${effectId}`));
      if (!current || current.impactTick !== at) throw new TypeError(`${label} has no matching return launch`);
      active.set(current.key, { ...current, from: current.turn, impactTick: current.completeTick, launchTick: at, to: current.origin });
    } else if (type === "return-complete") {
      const effectId = Object.hasOwn(event, "effectId") ? id(event.effectId, `${label}.effectId`) : null;
      const current = event.reason === "launch-cancelled" ? null : oldestActive(active, "return", (record) =>
        record.completeTick === at && (effectId === null || record.key === `return:effect:${effectId}`));
      if (current) {
        active.delete(current.key);
        if (at === tick) impacts.push({ key: current.key, kind: "return", point: current.to, sourceSequence: sequence });
      }
    } else if (type === "pellet-volley-launch") {
      const origin = rationalPoint(field(event, "origin", label), `${label}.origin`);
      const impactTick = integer(field(event, "impactTick", label), at, Number.MAX_SAFE_INTEGER, `${label}.impactTick`);
      const pellets = array(field(event, "pellets", label), 64, `${label}.pellets`);
      const seen = new Set();
      for (let index = 0; index < pellets.length; index += 1) {
        const pellet = ownData(pellets[index], `${label}.pellets[${index}]`);
        const pelletId = id(field(pellet, "pelletId", label), `${label}.pellets[${index}].pelletId`);
        if (seen.has(pelletId)) throw new TypeError(`${label} pellet IDs must be unique`);
        seen.add(pelletId);
        const key = `pellet:${sequence}:${pelletId}`;
        active.set(key, path(key, "pellet", origin,
          rationalPoint(field(pellet, "endpoint", label), `${label}.pellets[${index}].endpoint`, true),
          at, impactTick, sequence));
      }
    } else if (type === "pellet-contact") {
      id(field(event, "pelletId", label), `${label}.pelletId`);
      id(field(event, "targetId", label), `${label}.targetId`);
    } else if (type === "pellet-volley-complete") {
      const volley = event.reason === "launch-cancelled" ? null :
        oldestActive(active, "pellet", (record) => record.impactTick === at);
      for (const current of volley === null ? [] : [...active.values()].filter(
        (record) => record.kind === "pellet" && record.sourceSequence === volley.sourceSequence)) {
        active.delete(current.key);
        if (at === tick) impacts.push({ key: current.key, kind: "pellet", point: current.to, sourceSequence: sequence });
      }
    } else if (type === "effect") {
      const effectId = id(field(event, "effectId", label), `${label}.effectId`);
      const radius = integer(field(event, "radius", label), 0, ARENA_WIDTH_MILLITILES, `${label}.radius`);
      if (at === tick) areas.push({
        key: `area:${effectId}`, point: rationalPoint(field(event, "center", label), `${label}.center`),
        radius, sourceSequence: sequence,
      });
    } else if (type === "travel-launch") {
      const effectId = Object.hasOwn(event, "effectId") ? id(event.effectId, `${label}.effectId`) : String(sequence);
      const key = `travel:${effectId}`;
      if (active.has(key)) throw new TypeError(`${label} duplicates an active travel effect`);
      const impactTick = integer(field(event, "impactTick", label), at, Number.MAX_SAFE_INTEGER, `${label}.impactTick`);
      const endpointField = Object.hasOwn(event, "endpoint") ? "endpoint" : "center";
      active.set(key, path(key, "travel",
        rationalPoint(field(event, "origin", label), `${label}.origin`),
        rationalPoint(field(event, endpointField, label), `${label}.${endpointField}`, true), at, impactTick, sequence));
    } else if (type === "travel-impact" || type === "travel-cancelled") {
      const effectId = Object.hasOwn(event, "effectId") ? id(event.effectId, `${label}.effectId`) : null;
      const current = oldestActive(active, "travel", (record) =>
        (effectId === null || record.key === `travel:${effectId}`) &&
        (type === "travel-cancelled" || record.impactTick === at));
      if (current) {
        active.delete(current.key);
        if (type === "travel-impact" && at === tick) impacts.push({ key: current.key, kind: "travel", point: current.to, sourceSequence: sequence });
      }
    } else if (IGNORED_TYPES.has(type)) {
      // Valid replay companions do not add independent geometry.
    } else {
      throw new TypeError(`${label}.type is unsupported`);
    }
    if (active.size + areas.length + impacts.length > COMBAT_EFFECT_PRIMITIVE_LIMIT) {
      throw new RangeError("combat effect primitive count exceeds its bound");
    }
  }

  const activePaths = [...active.values()].filter(({ launchTick, impactTick }) => tick >= launchTick && tick <= impactTick)
    .sort((a, b) => a.sourceSequence - b.sourceSequence || a.key.localeCompare(b.key));
  const paths = activePaths.map(({ from, impactTick, key, kind, launchTick, sourceSequence, to }) =>
    ({ from, impactTick, key, kind, launchTick, sourceSequence, to }));
  const projectiles = activePaths.map((record) => ({
    key: record.key,
    kind: record.kind,
    point: record.impactTick === record.launchTick ? record.to :
      interpolate(record.from, record.to, tick - record.launchTick, record.impactTick - record.launchTick),
    sourceSequence: record.sourceSequence,
  }));
  const canonicalEvents = JSON.parse(canonicalJson(events));
  const view = { areas, events: canonicalEvents, impacts, paths, projectiles, tick, version: COMBAT_EFFECT_VIEW_VERSION };
  freeze(view);
  VIEWS.add(view);
  return view;
}

export function serializeCombatEffectsViewModel(view) {
  if (!VIEWS.has(view)) throw new TypeError("combat effects view is not canonical");
  return canonicalJson(view);
}

function exactKeys(record, keys, label) {
  if (Reflect.ownKeys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key))) {
    throw new TypeError(`${label} has an invalid shape`);
  }
}

function exactOneOf(record, variants, label) {
  const match = variants.find((keys) =>
    Reflect.ownKeys(record).length === keys.length && keys.every((key) => Object.hasOwn(record, key)));
  if (!match) throw new TypeError(`${label} has an invalid shape`);
  return match;
}

function numericId(value, label) {
  return integer(value, 1, Number.MAX_SAFE_INTEGER, label);
}

function nonnegative(value, label) {
  return integer(value, 0, Number.MAX_SAFE_INTEGER, label);
}

function enumValue(value, values, label) {
  if (!values.includes(value)) throw new TypeError(`${label} is invalid`);
  return value;
}

function numericIds(value, label, unique = true) {
  const result = array(value, COMBAT_EFFECT_PRIMITIVE_LIMIT, label).map((item, index) =>
    numericId(item, `${label}[${index}]`));
  if (unique && new Set(result).size !== result.length) throw new TypeError(`${label} must contain unique IDs`);
  return result;
}

function validateDamageFields(event, label, healthNames = ["currentHealthAfter", "currentHealthBefore"]) {
  nonnegative(event.amount, `${label}.amount`);
  nonnegative(event[healthNames[0]], `${label}.${healthNames[0]}`);
  nonnegative(event[healthNames[1]], `${label}.${healthNames[1]}`);
  numericId(event.targetId, `${label}.targetId`);
  if (event[healthNames[0]] !== Math.max(0, event[healthNames[1]] - event.amount)) {
    throw new TypeError(`${label} health transition is invalid`);
  }
}

function validateCanonicalEvent(event, type, label) {
  const tickType = (keys) => exactKeys(event, [...keys, "tick", "type"], label);
  switch (type) {
    case "launch": {
      tickType(["projectile"]);
      const projectile = ownData(event.projectile, `${label}.projectile`);
      const shape = exactOneOf(projectile, [
        ["attackerId", "damage", "id", "impactTick", "launchTick", "origin", "radius", "speed", "targetId", "targetPosition", "targetRadius"],
        ["attackerId", "damage", "id", "impactTick", "launchTick", "origin", "speed", "targetId", "targetPosition"],
      ], `${label}.projectile`);
      for (const key of ["attackerId", "id", "targetId"]) numericId(projectile[key], `${label}.projectile.${key}`);
      for (const key of ["damage", "impactTick", "launchTick"]) nonnegative(projectile[key], `${label}.projectile.${key}`);
      for (const key of ["radius", "targetRadius"].filter((key) => shape.includes(key))) {
        nonnegative(projectile[key], `${label}.projectile.${key}`);
      }
      integer(projectile.speed, 1, Number.MAX_SAFE_INTEGER, `${label}.projectile.speed`);
      rationalPoint(projectile.origin, `${label}.projectile.origin`);
      rationalPoint(projectile.targetPosition, `${label}.projectile.targetPosition`);
      return;
    }
    case "impact":
      tickType(["projectileId", "status", "targetId"]);
      numericId(event.projectileId, `${label}.projectileId`);
      numericId(event.targetId, `${label}.targetId`);
      enumValue(event.status, ["contact", "target_dead", "target_missing"], `${label}.status`);
      return;
    case "effect":
      tickType(["center", "damage", "effectId", "mode", "radius"]);
      rationalPoint(event.center, `${label}.center`);
      nonnegative(event.damage, `${label}.damage`);
      numericId(event.effectId, `${label}.effectId`);
      enumValue(event.mode, ["air", "air_and_ground", "buildings", "ground", "none"], `${label}.mode`);
      nonnegative(event.radius, `${label}.radius`);
      return;
    case "hit":
      tickType(["amount", "effectId", "targetId"]);
      nonnegative(event.amount, `${label}.amount`);
      numericId(event.effectId, `${label}.effectId`);
      numericId(event.targetId, `${label}.targetId`);
      return;
    case "damage": {
      const shape = exactOneOf(event, [
        ["amount", "currentHealthAfter", "currentHealthBefore", "projectileId", "targetId", "tick", "type"],
        ["amount", "currentHealthAfter", "currentHealthBefore", "effectId", "targetId", "tick", "type"],
      ], label);
      validateDamageFields(event, label);
      numericId(event[shape.includes("projectileId") ? "projectileId" : "effectId"], `${label}.causalId`);
      return;
    }
    case "death":
      exactOneOf(event, [
        ["targetId", "tick", "type"],
        ["effectId", "targetId", "tick", "type"],
      ], label);
      numericId(event.targetId, `${label}.targetId`);
      if (Object.hasOwn(event, "effectId")) numericId(event.effectId, `${label}.effectId`);
      return;
    case "external-damage":
      tickType(["amount", "currentHealthAfter", "currentHealthBefore", "targetId"]);
      validateDamageFields(event, label);
      return;
    case "external-death":
      tickType(["targetId"]);
      numericId(event.targetId, `${label}.targetId`);
      return;
    case "pierce-launch":
      tickType(["endpoint", "impactTick", "origin"]);
      rationalPoint(event.origin, `${label}.origin`);
      rationalPoint(event.endpoint, `${label}.endpoint`, true);
      nonnegative(event.impactTick, `${label}.impactTick`);
      return;
    case "pierce-hit":
      tickType(["parameterNumerator", "targetId"]);
      decimal(event.parameterNumerator, `${label}.parameterNumerator`, { signed: true });
      numericId(event.targetId, `${label}.targetId`);
      return;
    case "pierce-damage":
      tickType(["amount", "currentHealthAfter", "currentHealthBefore", "targetId"]);
      validateDamageFields(event, label);
      return;
    case "pierce-death":
      tickType(["targetId"]);
      numericId(event.targetId, `${label}.targetId`);
      return;
    case "pierce-command":
      tickType(["targetId", "value"]);
      numericId(event.targetId, `${label}.targetId`);
      enumValue(event.value, ["interrupt-attacker", "kill-attacker", "kill-target"], `${label}.value`);
      return;
    case "pierce-complete":
      tickType(["hitTargetIds", "reason"]);
      numericIds(event.hitTargetIds, `${label}.hitTargetIds`);
      enumValue(event.reason, ["impact-resolved", "launch-cancelled"], `${label}.reason`);
      return;
    case "return-launch": {
      const shape = exactOneOf(event, [
        ["attackerId", "completeTick", "origin", "tick", "turnPoint", "turnTick", "type"],
        ["completeTick", "effectId", "origin", "sourceId", "tick", "turn", "turnTick", "type"],
      ], label);
      numericId(event[shape.includes("attackerId") ? "attackerId" : "effectId"], `${label}.identity`);
      if (shape.includes("sourceId")) numericId(event.sourceId, `${label}.sourceId`);
      nonnegative(event.completeTick, `${label}.completeTick`);
      nonnegative(event.turnTick, `${label}.turnTick`);
      rationalPoint(event.origin, `${label}.origin`);
      rationalPoint(event[shape.includes("turn") ? "turn" : "turnPoint"], `${label}.turn`, true);
      return;
    }
    case "return-turn": {
      const shape = exactOneOf(event, [
        ["tick", "turnPoint", "type"],
        ["effectId", "tick", "turn", "type"],
      ], label);
      if (shape.includes("effectId")) numericId(event.effectId, `${label}.effectId`);
      rationalPoint(event[shape.includes("turn") ? "turn" : "turnPoint"], `${label}.turn`, true);
      return;
    }
    case "return-hit":
      tickType(["leg", "parameterNumerator", "pass", "targetId"]);
      enumValue(event.leg, ["inbound", "outbound"], `${label}.leg`);
      decimal(event.parameterNumerator, `${label}.parameterNumerator`, { signed: true });
      integer(event.pass, 1, 2, `${label}.pass`);
      numericId(event.targetId, `${label}.targetId`);
      return;
    case "return-contact":
      tickType(["effectId", "leg", "orderNumerator", "pass", "targetId"]);
      numericId(event.effectId, `${label}.effectId`);
      enumValue(event.leg, ["inbound", "outbound"], `${label}.leg`);
      decimal(event.orderNumerator, `${label}.orderNumerator`, { signed: true });
      integer(event.pass, 1, 2, `${label}.pass`);
      numericId(event.targetId, `${label}.targetId`);
      return;
    case "return-damage":
      tickType(["amount", "currentHealthAfter", "currentHealthBefore", "leg", "pass", "targetId"]);
      validateDamageFields(event, label);
      enumValue(event.leg, ["inbound", "outbound"], `${label}.leg`);
      integer(event.pass, 1, 2, `${label}.pass`);
      return;
    case "return-death":
      tickType(["leg", "pass", "targetId"]);
      enumValue(event.leg, ["inbound", "outbound"], `${label}.leg`);
      integer(event.pass, 1, 2, `${label}.pass`);
      numericId(event.targetId, `${label}.targetId`);
      return;
    case "return-command":
      tickType(["targetId", "value"]);
      numericId(event.targetId, `${label}.targetId`);
      enumValue(event.value, ["interrupt-attacker", "kill-attacker", "kill-target"], `${label}.value`);
      return;
    case "return-complete":
      exactOneOf(event, [
        ["inboundHitIds", "outboundHitIds", "reason", "tick", "type"],
        ["effectId", "inboundHitIds", "outboundHitIds", "reason", "tick", "type"],
      ], label);
      if (Object.hasOwn(event, "effectId")) numericId(event.effectId, `${label}.effectId`);
      numericIds(event.inboundHitIds, `${label}.inboundHitIds`);
      numericIds(event.outboundHitIds, `${label}.outboundHitIds`);
      enumValue(event.reason, ["launch-cancelled", "returned-to-origin"], `${label}.reason`);
      return;
    case "return-spell-damage":
      tickType(["amount", "effectId", "healthAfter", "healthBefore", "leg", "pass", "primitiveEffectId", "targetId"]);
      validateDamageFields(event, label, ["healthAfter", "healthBefore"]);
      for (const key of ["effectId", "primitiveEffectId"]) numericId(event[key], `${label}.${key}`);
      enumValue(event.leg, ["inbound", "outbound"], `${label}.leg`);
      integer(event.pass, 1, 2, `${label}.pass`);
      return;
    case "return-spell-death":
      tickType(["effectId", "leg", "pass", "primitiveEffectId", "targetId"]);
      for (const key of ["effectId", "primitiveEffectId", "targetId"]) numericId(event[key], `${label}.${key}`);
      enumValue(event.leg, ["inbound", "outbound"], `${label}.leg`);
      integer(event.pass, 1, 2, `${label}.pass`);
      return;
    case "return-launch-cancelled":
      tickType(["commandId", "reason", "sourceId"]);
      numericId(event.commandId, `${label}.commandId`);
      numericId(event.sourceId, `${label}.sourceId`);
      enumValue(event.reason, ["source-dead"], `${label}.reason`);
      return;
    case "return-source-died":
      tickType(["sourceId"]);
      numericId(event.sourceId, `${label}.sourceId`);
      return;
    case "return-target-died":
      tickType(["targetId"]);
      numericId(event.targetId, `${label}.targetId`);
      return;
    case "pellet-volley-launch": {
      tickType(["impactTick", "origin", "pellets"]);
      nonnegative(event.impactTick, `${label}.impactTick`);
      rationalPoint(event.origin, `${label}.origin`);
      const pellets = array(event.pellets, 64, `${label}.pellets`);
      for (let index = 0; index < pellets.length; index += 1) {
        const pellet = ownData(pellets[index], `${label}.pellets[${index}]`);
        exactKeys(pellet, ["endpoint", "pelletId"], `${label}.pellets[${index}]`);
        numericId(pellet.pelletId, `${label}.pellets[${index}].pelletId`);
        rationalPoint(pellet.endpoint, `${label}.pellets[${index}].endpoint`, true);
      }
      return;
    }
    case "pellet-contact":
      tickType(["parameterNumerator", "pelletId", "targetId"]);
      decimal(event.parameterNumerator, `${label}.parameterNumerator`, { signed: true });
      numericId(event.pelletId, `${label}.pelletId`);
      numericId(event.targetId, `${label}.targetId`);
      return;
    case "pellet-aggregate-damage":
      tickType(["amount", "pelletIds", "targetId"]);
      nonnegative(event.amount, `${label}.amount`);
      numericIds(event.pelletIds, `${label}.pelletIds`);
      numericId(event.targetId, `${label}.targetId`);
      return;
    case "pellet-damage":
      tickType(["amount", "currentHealthAfter", "currentHealthBefore", "pelletIds", "targetId"]);
      validateDamageFields(event, label);
      numericIds(event.pelletIds, `${label}.pelletIds`);
      return;
    case "pellet-death":
      tickType(["pelletIds", "targetId"]);
      numericIds(event.pelletIds, `${label}.pelletIds`);
      numericId(event.targetId, `${label}.targetId`);
      return;
    case "pellet-command":
      tickType(["targetId", "value"]);
      numericId(event.targetId, `${label}.targetId`);
      enumValue(event.value, ["interrupt-attacker", "kill-attacker", "kill-target"], `${label}.value`);
      return;
    case "pellet-volley-complete": {
      tickType(["contacts", "reason"]);
      const contacts = array(event.contacts, COMBAT_EFFECT_PRIMITIVE_LIMIT, `${label}.contacts`);
      contacts.forEach((raw, index) => {
        const contact = ownData(raw, `${label}.contacts[${index}]`);
        exactKeys(contact, ["pelletId", "targetId"], `${label}.contacts[${index}]`);
        numericId(contact.pelletId, `${label}.contacts[${index}].pelletId`);
        numericId(contact.targetId, `${label}.contacts[${index}].targetId`);
      });
      enumValue(event.reason, ["impact-resolved", "launch-cancelled"], `${label}.reason`);
      return;
    }
    case "travel-launch":
      tickType(["center", "duration", "effectId", "impactTick", "origin", "primitiveProjectileId", "sourceId"]);
      rationalPoint(event.center, `${label}.center`);
      rationalPoint(event.origin, `${label}.origin`);
      for (const key of ["effectId", "primitiveProjectileId", "sourceId"]) numericId(event[key], `${label}.${key}`);
      nonnegative(event.duration, `${label}.duration`);
      nonnegative(event.impactTick, `${label}.impactTick`);
      return;
    case "travel-impact":
      tickType(["center", "duration", "effectId", "primitiveProjectileId", "sourceId"]);
      rationalPoint(event.center, `${label}.center`);
      for (const key of ["effectId", "primitiveProjectileId", "sourceId"]) numericId(event[key], `${label}.${key}`);
      nonnegative(event.duration, `${label}.duration`);
      return;
    case "travel-contact":
      tickType(["effectId", "orderNumerator", "targetId"]);
      numericId(event.effectId, `${label}.effectId`);
      decimal(event.orderNumerator, `${label}.orderNumerator`, { signed: true });
      numericId(event.targetId, `${label}.targetId`);
      return;
    case "travel-spell-impact":
      tickType(["center", "crownDamage", "damage", "effectId", "primitiveEffectId", "radius", "sourceId", "variant"]);
      rationalPoint(event.center, `${label}.center`);
      for (const key of ["crownDamage", "damage", "radius"]) nonnegative(event[key], `${label}.${key}`);
      for (const key of ["effectId", "primitiveEffectId", "sourceId"]) numericId(event[key], `${label}.${key}`);
      enumValue(event.variant, ["plain"], `${label}.variant`);
      return;
    case "travel-spell-hit":
      tickType(["amount", "effectId", "primitiveEffectId", "targetId"]);
      nonnegative(event.amount, `${label}.amount`);
      for (const key of ["effectId", "primitiveEffectId", "targetId"]) numericId(event[key], `${label}.${key}`);
      return;
    case "travel-spell-damage":
      tickType(["amount", "effectId", "healthAfter", "healthBefore", "primitiveEffectId", "targetId"]);
      validateDamageFields(event, label, ["healthAfter", "healthBefore"]);
      for (const key of ["effectId", "primitiveEffectId"]) numericId(event[key], `${label}.${key}`);
      return;
    case "travel-spell-death":
      tickType(["effectId", "primitiveEffectId", "targetId"]);
      for (const key of ["effectId", "primitiveEffectId", "targetId"]) numericId(event[key], `${label}.${key}`);
      return;
    case "travel-cancel-requested":
      tickType(["effectId"]);
      numericId(event.effectId, `${label}.effectId`);
      return;
    case "travel-cancelled":
      tickType(["effectId", "reason", "sourceId"]);
      numericId(event.effectId, `${label}.effectId`);
      numericId(event.sourceId, `${label}.sourceId`);
      enumValue(event.reason, ["explicit-cancel", "source-dead"], `${label}.reason`);
      return;
    case "travel-launch-cancelled":
      tickType(["commandId", "reason", "sourceId"]);
      numericId(event.commandId, `${label}.commandId`);
      numericId(event.sourceId, `${label}.sourceId`);
      enumValue(event.reason, ["source-dead"], `${label}.reason`);
      return;
    case "travel-source-died":
      tickType(["sourceId"]);
      numericId(event.sourceId, `${label}.sourceId`);
      return;
    case "travel-target-died":
      tickType(["targetId"]);
      numericId(event.targetId, `${label}.targetId`);
      return;
    default:
      throw new TypeError(`${label}.type is unsupported`);
  }
}

export function restoreCombatEffectsViewModel(bytes) {
  if (typeof bytes !== "string" || bytes.length > 4_000_000) throw new TypeError("combat effects bytes must be a bounded string");
  let raw;
  try { raw = JSON.parse(bytes); } catch { throw new TypeError("combat effects bytes must be valid JSON"); }
  validateTree(raw, "combat effects view");
  const source = ownData(raw, "combat effects view");
  exactKeys(source, ["areas", "events", "impacts", "paths", "projectiles", "tick", "version"], "combat effects view");
  if (source.version !== COMBAT_EFFECT_VIEW_VERSION || canonicalJson(source) !== bytes) {
    throw new TypeError("combat effects bytes are noncanonical or unsupported");
  }
  const restored = createCombatEffectsViewModel({ events: source.events, tick: source.tick });
  if (serializeCombatEffectsViewModel(restored) !== bytes) {
    throw new TypeError("combat effects view is not causally derivable from its replay");
  }
  return restored;
}

function setPoint(node, point) {
  node.style.setProperty("--effect-den", point.denominator);
  node.style.setProperty("--effect-x-num", point.xNumerator);
  const inverted = BigInt(ARENA_LENGTH_MILLITILES) * BigInt(point.denominator) - BigInt(point.yNumerator);
  node.style.setProperty("--effect-y-num", inverted.toString());
}

export function bindCombatEffectsViewModel(layer, view) {
  if (!layer || typeof layer !== "object" || typeof layer.replaceChildren !== "function" ||
    typeof layer.ownerDocument?.createElement !== "function") throw new TypeError("combat effects layer must be a DOM element");
  if (!VIEWS.has(view)) throw new TypeError("combat effects view is not canonical");
  const document = layer.ownerDocument;
  const frame = document.createElement("div");
  frame.className = "combat-effects__frame";
  frame.dataset.tick = String(view.tick);
  const nodes = [];
  for (const record of view.paths) {
    const create = typeof document.createElementNS === "function"
      ? (name) => document.createElementNS("http://www.w3.org/2000/svg", name)
      : (name) => document.createElement(name);
    const svg = create("svg");
    svg.setAttribute("class", "combat-effect-path");
    svg.dataset.effectKey = record.key;
    svg.dataset.kind = record.kind;
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("preserveAspectRatio", "none");
    const common = BigInt(record.from.denominator) * BigInt(record.to.denominator);
    svg.setAttribute("viewBox", `0 0 ${BigInt(ARENA_WIDTH_MILLITILES) * common} ${BigInt(ARENA_LENGTH_MILLITILES) * common}`);
    const line = create("line");
    line.setAttribute("x1", (BigInt(record.from.xNumerator) * BigInt(record.to.denominator)).toString());
    line.setAttribute("y1", ((BigInt(ARENA_LENGTH_MILLITILES) * BigInt(record.from.denominator) - BigInt(record.from.yNumerator)) * BigInt(record.to.denominator)).toString());
    line.setAttribute("x2", (BigInt(record.to.xNumerator) * BigInt(record.from.denominator)).toString());
    line.setAttribute("y2", ((BigInt(ARENA_LENGTH_MILLITILES) * BigInt(record.to.denominator) - BigInt(record.to.yNumerator)) * BigInt(record.from.denominator)).toString());
    svg.appendChild(line);
    nodes.push(svg);
  }
  for (const record of view.areas) {
    const node = document.createElement("span");
    node.className = "combat-effect-area";
    node.dataset.effectKey = record.key;
    node.style.setProperty("--effect-radius", String(record.radius));
    setPoint(node, record.point);
    nodes.push(node);
  }
  for (const record of view.impacts) {
    const node = document.createElement("span");
    node.className = "combat-effect-impact";
    node.dataset.effectKey = record.key;
    node.dataset.kind = record.kind;
    setPoint(node, record.point);
    nodes.push(node);
  }
  for (const record of view.projectiles) {
    const node = document.createElement("span");
    node.className = "combat-effect-projectile";
    node.dataset.effectKey = record.key;
    node.dataset.kind = record.kind;
    setPoint(node, record.point);
    nodes.push(node);
  }
  for (const node of nodes) frame.appendChild(node);
  layer.replaceChildren(frame);
  return view;
}

export function mountCombatEffectsLayer(shell) {
  if (!shell || typeof shell.querySelector !== "function") throw new TypeError("combat effects shell must be a DOM element");
  const combat = shell.querySelector('[data-ui="combat-layer"]');
  if (!combat || typeof combat.appendChild !== "function" || typeof combat.ownerDocument?.createElement !== "function") {
    throw new TypeError("combat effects shell must contain the combat layer");
  }
  const style = combat.ownerDocument.createElement("style");
  style.dataset.ui = "combat-effects-style";
  style.textContent = STYLE_TEXT;
  const layer = combat.ownerDocument.createElement("div");
  layer.className = "combat-effects";
  layer.dataset.ui = "combat-effects";
  layer.setAttribute("aria-live", "off");
  combat.appendChild(style);
  combat.appendChild(layer);
  return layer;
}
