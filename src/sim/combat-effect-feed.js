/*
 * Closed, source-owned visual transcript for projectile and area effects.
 *
 * This module deliberately keeps the append authority out of the returned
 * feed object. Source runtimes retain that object privately and use the
 * module-owned append helper at their authoritative event boundary. Consumers
 * receive only an immutable snapshot or canonical bytes.
 */

const COMBAT_EFFECT_FEED_VERSION = 1;
const COMBAT_EFFECT_FEED_MAX_RECORDS = 16_384;
const COMBAT_EFFECT_FEED_MAX_BYTES = 1_048_576;
const COMBAT_EFFECT_FEED_MAX_DEPTH = 16;
const COMBAT_EFFECT_FEED_MAX_STRING_LENGTH = 256;
const COMBAT_EFFECT_FEED_MAX_COORDINATE = 65_536;
const COMBAT_EFFECT_FEED_MAX_DENOMINATOR = 1_000_000;
const FEED_SNAPSHOT_PREFIX = "{\"records\":[";
const FEED_SNAPSHOT_SUFFIX = "],\"version\":1}";
const UTF8 = new TextEncoder();

const RECORD_KEYS = [
  "eventId", "parentId", "payload", "phase", "rootId", "tick", "type",
];
const SNAPSHOT_KEYS = ["records", "version"];
const PAYLOAD_OPEN_KEYS = [
  "direction", "effectId", "from", "impactTick", "projectileId", "radius",
  "segments", "sequence", "sourceId", "to",
];
const PAYLOAD_TURN_KEYS = ["point"];
const PAYLOAD_CONTACT_KEYS = ["point", "status", "subId", "targetId"];
const PAYLOAD_IMPACT_KEYS = ["center", "radius", "targetIds"];
const PAYLOAD_DAMAGE_KEYS = [
  "amount", "currentHealthAfter", "currentHealthBefore", "targetId",
];
const PAYLOAD_DEATH_KEYS = ["targetId"];
const PAYLOAD_CLOSE_KEYS = ["reason"];

const TYPES = new Set(["area", "projectile"]);
const PROJECTILE_DIRECTIONS = new Set([
  "pierce", "pellet", "projectile", "return", "tower-to-unit", "travel",
  "unit-to-tower", "unit-to-unit",
]);
const PROJECTILE_PHASES = new Set([
  "close", "contact", "damage", "death", "impact", "open", "turn",
]);
const AREA_PHASES = new Set(["close", "damage", "death", "impact", "open"]);
const CONTACT_STATUSES = new Set([
  "contact", "target-dead", "target-missing", "observed",
]);
const CLOSE_REASONS = new Set([
  "complete", "impact-resolved", "launch-cancelled", "source-dead",
  "explicit-cancel", "target-missing", "cancelled",
]);
const ROOT_ID_TOKEN = /^[a-z][A-Za-z0-9.%_~!\-]*(?:\.[A-Za-z0-9.%_~!\-]+){5}$/u;

const FEED_STATES = new WeakMap();

function clone(value) {
  return JSON.parse(canonicalJson(value));
}

function freeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freeze(child, seen);
  return Object.freeze(value);
}

function exact(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain data object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain data object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  const expected = [...keys].sort();
  if (actual.some((key) => typeof key !== "string")) {
    throw new TypeError(`${label} must contain only string keys`);
  }
  const sortedActual = [...actual].sort();
  if (sortedActual.length !== expected.length ||
      sortedActual.some((key, index) => key !== expected[index])) {
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

function dense(value, maximum, label) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > maximum) {
    throw new TypeError(`${label} must be a bounded plain array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.some((key) => key !== "length" &&
      (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) ||
        Number(key) >= value.length))) {
    throw new TypeError(`${label} must contain only indexed data`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[index];
    if (descriptor === undefined || !descriptor.enumerable ||
        !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label}[${index}] must be an enumerable data property`);
    }
  }
  return Array.from({ length: value.length }, (_, index) => descriptors[index].value);
}

function integer(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be a safe integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function boundedText(value, label, maximum = COMBAT_EFFECT_FEED_MAX_STRING_LENGTH) {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum ||
      value.normalize("NFC") !== value || /[\u0000-\u001f\u007f\ud800-\udfff]/u.test(value)) {
    throw new TypeError(`${label} must be bounded normalized text`);
  }
  return value;
}

function decimal(value, label, signed = false) {
  const pattern = signed ? /^(?:0|-?[1-9]\d*)$/u : /^(?:0|[1-9]\d*)$/u;
  if (typeof value !== "string" || value.length > 32 || !pattern.test(value)) {
    throw new TypeError(`${label} must be a canonical decimal string`);
  }
  return BigInt(value);
}

function canonicalPoint(value, label, allowOutside = true) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a point`);
  }
  const keys = Object.keys(value);
  if (keys.length === 2 && Object.hasOwn(value, "x") && Object.hasOwn(value, "y")) {
    const raw = exact(value, ["x", "y"], label);
    const margin = allowOutside ? COMBAT_EFFECT_FEED_MAX_COORDINATE : 0;
    integer(raw.x, -margin, 18_000 + margin, `${label}.x`);
    integer(raw.y, -margin, 32_000 + margin, `${label}.y`);
    return {
      denominator: "1",
      xNumerator: String(raw.x),
      yNumerator: String(raw.y),
    };
  }
  const raw = exact(value, ["denominator", "xNumerator", "yNumerator"], label);
  const denominator = decimal(raw.denominator, `${label}.denominator`);
  if (denominator < 1n || denominator > BigInt(COMBAT_EFFECT_FEED_MAX_DENOMINATOR)) {
    throw new RangeError(`${label}.denominator is outside the feed bound`);
  }
  const x = decimal(raw.xNumerator, `${label}.xNumerator`, true);
  const y = decimal(raw.yNumerator, `${label}.yNumerator`, true);
  const margin = BigInt(allowOutside ? COMBAT_EFFECT_FEED_MAX_COORDINATE : 0);
  if (x < -margin * denominator || x > (18_000n + margin) * denominator ||
      y < -margin * denominator || y > (32_000n + margin) * denominator) {
    throw new RangeError(`${label} lies outside the feed coordinate bound`);
  }
  return {
    denominator: denominator.toString(),
    xNumerator: x.toString(),
    yNumerator: y.toString(),
  };
}

function checkedIdentity(value, label, nullable = true) {
  if (nullable && value === null) return null;
  if (Number.isSafeInteger(value) && value >= 1) return value;
  if (typeof value === "string" && value.length > 0 && value.length <= 256 &&
      value.normalize("NFC") === value && !/[\u0000-\u001f\u007f\ud800-\udfff]/u.test(value)) return value;
  throw new TypeError(`${label} must be a positive bounded identity`);
}

function identityPart(value) {
  if (value === null) return "none";
  if (typeof value === "number") return String(value);
  let encoded = null;
  try {
    encoded = encodeURIComponent(value);
  } catch {
    // Lone UTF-16 surrogates are rejected by encodeURIComponent. The stable
    // fallback below still gives the source an identity-bearing root token.
  }
  if (encoded !== null && encoded.length <= 48 && /^[A-Za-z0-9%_~!\-]+$/u.test(encoded)) {
    return `s${encoded}`;
  }
  let hash = 1469598103934665603n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * 1099511628211n) & 0xffffffffffffffffn;
  }
  return `h${hash.toString(16).padStart(16, "0")}`;
}

function combatEffectRootId(value) {
  const raw = exact(value, [
    "direction", "effectId", "projectileId", "sequence", "sourceId", "type",
  ], "combat effect root identity");
  const { direction, type } = raw;
  if (!TYPES.has(type)) throw new TypeError("combat effect root type is invalid");
  if ((type === "area" && direction !== "area") ||
      (type === "projectile" && !PROJECTILE_DIRECTIONS.has(direction))) {
    throw new TypeError("combat effect root direction is unsupported");
  }
  boundedText(direction, "combat effect root direction");
  const sourceId = checkedIdentity(raw.sourceId, "combat effect root sourceId");
  const effectId = checkedIdentity(raw.effectId, "combat effect root effectId");
  const projectileId = checkedIdentity(raw.projectileId, "combat effect root projectileId");
  const sequence = checkedIdentity(raw.sequence, "combat effect root sequence");
  if (type === "area" &&
      (sourceId !== null || effectId === null || projectileId !== null || sequence !== null)) {
    throw new TypeError("combat effect area root identity is not canonical");
  }
  if (type === "projectile" && sourceId === null) {
    throw new TypeError("combat effect projectile root identity is not canonical");
  }
  return `${type}.${direction}.${identityPart(sourceId)}.${identityPart(effectId)}.${identityPart(projectileId)}.${identityPart(sequence)}`;
}

function rootIdentity(type, payload) {
  return combatEffectRootId({
    direction: payload.direction,
    effectId: payload.effectId,
    projectileId: payload.projectileId,
    sequence: payload.sequence,
    sourceId: payload.sourceId,
    type,
  });
}

function checkedSegments(value, label) {
  const segments = dense(value, 64, label).map((entry, index) => {
    const raw = exact(entry, ["id", "to"], `${label}[${index}]`);
    return {
      id: integer(raw.id, 1, Number.MAX_SAFE_INTEGER, `${label}[${index}].id`),
      to: canonicalPoint(raw.to, `${label}[${index}].to`),
    };
  });
  segments.sort((left, right) => left.id - right.id);
  for (let index = 1; index < segments.length; index += 1) {
    if (segments[index - 1].id === segments[index].id) {
      throw new TypeError(`${label} IDs must be unique`);
    }
  }
  return segments;
}

function checkedOpenPayload(value, label, type, tick) {
  const raw = exact(value, PAYLOAD_OPEN_KEYS, label);
  if (!PROJECTILE_DIRECTIONS.has(raw.direction) &&
      !(type === "area" && raw.direction === "area")) {
    throw new TypeError(`${label}.direction is unsupported`);
  }
  const sourceId = checkedIdentity(raw.sourceId, `${label}.sourceId`);
  const effectId = checkedIdentity(raw.effectId, `${label}.effectId`);
  const projectileId = checkedIdentity(raw.projectileId, `${label}.projectileId`);
  const sequence = checkedIdentity(raw.sequence, `${label}.sequence`);
  integer(raw.impactTick, tick, Number.MAX_SAFE_INTEGER, `${label}.impactTick`);
  integer(raw.radius, 0, COMBAT_EFFECT_FEED_MAX_COORDINATE, `${label}.radius`);
  const from = canonicalPoint(raw.from, `${label}.from`);
  const to = raw.to === null ? null : canonicalPoint(raw.to, `${label}.to`);
  const segments = checkedSegments(raw.segments, `${label}.segments`);
  if (type === "area") {
    if (raw.direction !== "area" || sourceId !== null || effectId === null ||
        projectileId !== null || sequence !== null || to !== null || segments.length !== 0) {
      throw new TypeError(`${label} is not a canonical area root`);
    }
  } else {
    if (sourceId === null || to === null && segments.length === 0 ||
        to !== null && segments.length !== 0) {
      throw new TypeError(`${label} is not a canonical projectile root`);
    }
    if (raw.direction === "area") throw new TypeError(`${label}.direction is invalid`);
  }
  return {
    direction: raw.direction,
    effectId,
    from,
    impactTick: raw.impactTick,
    projectileId,
    radius: raw.radius,
    segments,
    sequence,
    sourceId,
    to,
  };
}

function checkedPayload(value, type, phase, tick, label) {
  if (phase === "open") return checkedOpenPayload(value, label, type, tick);
  if (phase === "turn") {
    return { point: canonicalPoint(exact(value, PAYLOAD_TURN_KEYS, label).point, `${label}.point`) };
  }
  if (phase === "contact") {
    const raw = exact(value, PAYLOAD_CONTACT_KEYS, label);
    if (!CONTACT_STATUSES.has(raw.status)) throw new TypeError(`${label}.status is invalid`);
    const subId = checkedIdentity(raw.subId, `${label}.subId`);
    return {
      point: canonicalPoint(raw.point, `${label}.point`),
      status: raw.status,
      subId,
      targetId: integer(raw.targetId, 1, Number.MAX_SAFE_INTEGER, `${label}.targetId`),
    };
  }
  if (phase === "impact") {
    const raw = exact(value, PAYLOAD_IMPACT_KEYS, label);
    const targetIds = dense(raw.targetIds, COMBAT_EFFECT_FEED_MAX_RECORDS, `${label}.targetIds`)
      .map((targetId, index) => integer(targetId, 1, Number.MAX_SAFE_INTEGER, `${label}.targetIds[${index}]`));
    for (let index = 1; index < targetIds.length; index += 1) {
      if (targetIds[index - 1] >= targetIds[index]) throw new TypeError(`${label}.targetIds must be strictly ascending`);
    }
    return {
      center: canonicalPoint(raw.center, `${label}.center`),
      radius: integer(raw.radius, 0, COMBAT_EFFECT_FEED_MAX_COORDINATE, `${label}.radius`),
      targetIds,
    };
  }
  if (phase === "damage") {
    const raw = exact(value, PAYLOAD_DAMAGE_KEYS, label);
    const amount = integer(raw.amount, 0, Number.MAX_SAFE_INTEGER, label + ".amount");
    const currentHealthAfter = integer(
      raw.currentHealthAfter,
      0,
      Number.MAX_SAFE_INTEGER,
      label + ".currentHealthAfter",
    );
    const currentHealthBefore = integer(
      raw.currentHealthBefore,
      0,
      Number.MAX_SAFE_INTEGER,
      label + ".currentHealthBefore",
    );
    if (currentHealthAfter > currentHealthBefore ||
        currentHealthBefore - currentHealthAfter > amount) {
      throw new TypeError(label + " is not a canonical damage transition");
    }
    return {
      amount,
      currentHealthAfter,
      currentHealthBefore,
      targetId: integer(raw.targetId, 1, Number.MAX_SAFE_INTEGER, `${label}.targetId`),
    };
  }
  if (phase === "death") {
    const raw = exact(value, PAYLOAD_DEATH_KEYS, label);
    return { targetId: integer(raw.targetId, 1, Number.MAX_SAFE_INTEGER, `${label}.targetId`) };
  }
  if (phase === "close") {
    const raw = exact(value, PAYLOAD_CLOSE_KEYS, label);
    boundedText(raw.reason, `${label}.reason`, 64);
    if (!CLOSE_REASONS.has(raw.reason)) throw new TypeError(`${label}.reason is unsupported`);
    return { reason: raw.reason };
  }
  throw new TypeError(`${label}.phase is unsupported`);
}

function checkedRecord(value, label) {
  const raw = exact(value, RECORD_KEYS, label);
  const eventId = integer(raw.eventId, 1, Number.MAX_SAFE_INTEGER, `${label}.eventId`);
  const parentId = raw.parentId === null
    ? null
    : integer(raw.parentId, 1, Number.MAX_SAFE_INTEGER, `${label}.parentId`);
  const rootId = boundedText(raw.rootId, `${label}.rootId`, 256);
  if (!ROOT_ID_TOKEN.test(rootId)) throw new TypeError(`${label}.rootId is not canonical`);
  const tick = integer(raw.tick, 0, Number.MAX_SAFE_INTEGER, `${label}.tick`);
  if (!TYPES.has(raw.type)) throw new TypeError(`${label}.type is unsupported`);
  const phases = raw.type === "area" ? AREA_PHASES : PROJECTILE_PHASES;
  if (!phases.has(raw.phase)) throw new TypeError(`${label}.phase is unsupported`);
  const payload = checkedPayload(raw.payload, raw.type, raw.phase, tick, `${label}.payload`);
  return { eventId, parentId, payload, phase: raw.phase, rootId, tick, type: raw.type };
}

function appendChecked(state, record) {
  const checked = checkedRecord(record, "combat effect record");
  if (checked.eventId !== state.nextEventId) {
    throw new TypeError("combat effect event IDs must be contiguous and monotonic");
  }
  if (state.records.length >= COMBAT_EFFECT_FEED_MAX_RECORDS) {
    throw new RangeError("combat effect feed record bound exceeded");
  }
  const nextRecordBytes = state.recordBytes +
    (state.records.length === 0 ? 0 : 1) +
    UTF8.encode(canonicalJson(checked)).byteLength;
  const nextSnapshotBytes = UTF8.encode(FEED_SNAPSHOT_PREFIX).byteLength +
    nextRecordBytes + UTF8.encode(FEED_SNAPSHOT_SUFFIX).byteLength;
  if (nextSnapshotBytes > COMBAT_EFFECT_FEED_MAX_BYTES) {
    throw new RangeError("combat effect feed exceeds its byte bound");
  }

  const root = state.roots.get(checked.rootId);
  if (checked.parentId === null) {
    if (checked.phase !== "open") throw new TypeError("combat effect roots must open with phase open");
    if (root !== undefined) throw new TypeError("combat effect root is duplicated");
    if (rootIdentity(checked.type, checked.payload) !== checked.rootId) {
      throw new TypeError("combat effect root identity does not match its source identity");
    }
    state.roots.set(checked.rootId, {
      closed: false,
      contactTargets: new Map(),
      damagedTargets: new Set(),
      deathTargets: new Set(),
      impactTargets: new Set(),
      impactSeen: false,
      lastEventId: checked.eventId,
      lastTick: checked.tick,
      turnSeen: false,
      type: checked.type,
      payload: checked.payload,
    });
  } else {
    if (root === undefined) throw new TypeError("combat effect child names a missing root");
    if (root.closed) throw new TypeError("combat effect records after close are forbidden");
    if (checked.phase === "open") {
      throw new TypeError("combat effect roots may only open at the root boundary");
    }
    if (checked.tick < root.lastTick) throw new TypeError("combat effect child tick cannot precede its root");
    if (checked.parentId >= checked.eventId) throw new TypeError("combat effect parent must be earlier");
    const parent = state.records[checked.parentId - 1];
    if (parent === undefined || parent.rootId !== checked.rootId) {
      throw new TypeError("combat effect parent must belong to the same root");
    }
    if (checked.type !== root.type) throw new TypeError("combat effect child type diverges from its root");
    const allowedParents = checked.type === "area"
      ? {
        damage: new Set(["damage", "impact"]),
        death: new Set(["damage", "death"]),
        impact: new Set(["open"]),
        close: new Set(["damage", "death", "impact", "open"]),
      }
      : {
        contact: new Set(["contact", "damage", "death", "impact", "open", "turn"]),
        damage: new Set(["contact", "damage", "impact"]),
        death: new Set(["damage", "death"]),
        impact: new Set(["contact", "open", "turn"]),
        turn: new Set(["contact", "damage", "death", "open", "turn"]),
        close: new Set(["contact", "damage", "death", "impact", "open", "turn"]),
      };
    if (!allowedParents[checked.phase]?.has(parent.phase)) {
      throw new TypeError(`combat effect ${checked.phase} has an invalid parent phase`);
    }
    if (checked.phase === "damage") {
      const targetId = checked.payload.targetId;
      if (root.deathTargets.has(targetId)) {
        throw new TypeError("combat effect damage follows target death");
      }
      if (!root.damagedTargets.has(targetId) &&
          !root.contactTargets.has(targetId) && !root.impactTargets.has(targetId)) {
        throw new TypeError("combat effect damage target has no causal contact or impact");
      }
      if (root.contactTargets.get(targetId) === "target-dead" ||
          root.contactTargets.get(targetId) === "target-missing") {
        throw new TypeError("combat effect damage target was not contactable");
      }
      root.damagedTargets.add(targetId);
    } else if (checked.phase === "death") {
      if (!root.damagedTargets.has(checked.payload.targetId)) {
        throw new TypeError("combat effect death target has no causal damage");
      }
      if (root.deathTargets.has(checked.payload.targetId)) {
        throw new TypeError("combat effect death target is duplicated");
      }
      root.deathTargets.add(checked.payload.targetId);
    } else if (checked.phase === "contact") {
      const previousStatus = root.contactTargets.get(checked.payload.targetId);
      if (previousStatus !== undefined &&
          previousStatus !== "contact" &&
          previousStatus !== "observed") {
        throw new TypeError("combat effect contact follows an uncontactable target");
      }
      root.contactTargets.set(checked.payload.targetId, checked.payload.status);
    } else if (checked.phase === "impact") {
      if (root.impactSeen) throw new TypeError("combat effect impact is duplicated");
      root.impactSeen = true;
      for (const targetId of checked.payload.targetIds) root.impactTargets.add(targetId);
    } else if (checked.phase === "turn") {
      if (root.turnSeen) throw new TypeError("combat effect turn is duplicated");
      if (root.impactSeen) throw new TypeError("combat effect turn follows terminal impact");
      root.turnSeen = true;
    }
    root.lastEventId = checked.eventId;
    root.lastTick = checked.tick;
    if (checked.phase === "close") root.closed = true;
  }
  state.records.push(checked);
  state.recordBytes = nextRecordBytes;
  state.nextEventId += 1;
  state.lastTick = checked.tick;
  return checked;
}

function snapshotState(value) {
  const snapshot = exact(value, SNAPSHOT_KEYS, "combat effect feed snapshot");
  if (snapshot.version !== COMBAT_EFFECT_FEED_VERSION) {
    throw new TypeError("combat effect feed version is unsupported");
  }
  const records = dense(snapshot.records, COMBAT_EFFECT_FEED_MAX_RECORDS, "combat effect feed records");
  const state = {
    lastTick: -1,
    nextEventId: 1,
    recordBytes: 0,
    records: [],
    roots: new Map(),
  };
  for (let index = 0; index < records.length; index += 1) {
    const checked = checkedRecord(records[index], `combat effect feed records[${index}]`);
    appendChecked(state, checked);
  }
  return state;
}

function snapshotFromState(state) {
  return freeze({ version: COMBAT_EFFECT_FEED_VERSION, records: clone(state.records) });
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("combat effect feed numbers must be safe integers");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new TypeError("combat effect feed contains unsupported data");
}

function apiForState(state) {
  const api = Object.create(null);
  Object.defineProperties(api, {
    bytes: { enumerable: false, get: () => serializeState(state) },
    fork: { enumerable: false, value: () => apiForState(forkState(state)) },
    records: { enumerable: false, get: () => snapshotFromState(state).records },
    serialize: { enumerable: false, value: () => serializeState(state) },
    snapshot: { enumerable: false, value: () => snapshotFromState(state) },
    version: { enumerable: false, get: () => COMBAT_EFFECT_FEED_VERSION },
  });
  Object.freeze(api);
  FEED_STATES.set(api, state);
  return api;
}

function forkState(state) {
  // This is only reachable through an authenticated feed API. Its records and
  // normalized payloads are module-owned and never exposed by reference, so a
  // structural copy avoids revalidating the complete transcript on every
  // transactional source fork while preserving independent append state.
  return {
    lastTick: state.lastTick,
    nextEventId: state.nextEventId,
    recordBytes: state.recordBytes,
    records: [...state.records],
    roots: new Map([...state.roots].map(([rootId, root]) => [rootId, {
      ...root,
      contactTargets: new Map(root.contactTargets),
      damagedTargets: new Set(root.damagedTargets),
      deathTargets: new Set(root.deathTargets),
      impactTargets: new Set(root.impactTargets),
    }])),
  };
}

function serializeState(state) {
  const serialized = canonicalJson(snapshotFromState(state));
  if (new TextEncoder().encode(serialized).byteLength > COMBAT_EFFECT_FEED_MAX_BYTES) {
    throw new RangeError("combat effect feed exceeds its byte bound");
  }
  return serialized;
}

function createCombatEffectFeed() {
  return apiForState({
    lastTick: -1,
    nextEventId: 1,
    recordBytes: 0,
    records: [],
    roots: new Map(),
  });
}

function appendCombatEffectEvent(feed, value) {
  const state = FEED_STATES.get(feed);
  if (state === undefined) throw new TypeError("combat effect feed authority is invalid");
  const raw = exact(value, ["parentId", "payload", "phase", "rootId", "tick", "type"],
    "combat effect append");
  const candidate = { eventId: state.nextEventId, ...raw };
  const checked = appendChecked(state, candidate);
  return freeze(clone(checked));
}

function appendCombatEffectRoot(feed, value) {
  const raw = exact(value, [
    "direction", "effectId", "from", "impactTick", "projectileId", "radius",
    "segments", "sequence", "sourceId", "to", "tick", "type",
  ], "combat effect root");
  const type = raw.type;
  const payload = {
    direction: raw.direction,
    effectId: raw.effectId,
    from: raw.from,
    impactTick: raw.impactTick,
    projectileId: raw.projectileId,
    radius: raw.radius,
    segments: raw.segments,
    sequence: raw.sequence,
    sourceId: raw.sourceId,
    to: raw.to,
  };
  const checkedPayload = checkedOpenPayload(
    payload,
    "combat effect root.payload",
    type,
    raw.tick,
  );
  return appendCombatEffectEvent(feed, {
    parentId: null,
    payload: checkedPayload,
    phase: "open",
    rootId: rootIdentity(type, checkedPayload),
    tick: raw.tick,
    type,
  });
}

function validateCombatEffectFeed(value) {
  const trusted = FEED_STATES.get(value);
  if (trusted !== undefined) return snapshotFromState(snapshotState(snapshotFromState(trusted)));
  return snapshotFromState(snapshotState(value));
}

function serializeCombatEffectFeed(value) {
  const state = FEED_STATES.get(value);
  if (state !== undefined) return serializeState(state);
  return serializeState(snapshotState(value));
}

function restoreCombatEffectFeed(serialized) {
  if (typeof serialized !== "string") throw new TypeError("combat effect feed bytes must be a string");
  if (new TextEncoder().encode(serialized).byteLength > COMBAT_EFFECT_FEED_MAX_BYTES) {
    throw new RangeError("combat effect feed bytes exceed their bound");
  }
  let raw;
  try { raw = JSON.parse(serialized); }
  catch { throw new TypeError("combat effect feed bytes must be valid JSON"); }
  const state = snapshotState(raw);
  if (serializeState(state) !== serialized) throw new TypeError("combat effect feed bytes must be canonical JSON");
  return apiForState(state);
}

function combatEffectFeedSnapshot(value) {
  const state = FEED_STATES.get(value);
  if (state !== undefined) return snapshotFromState(state);
  return validateCombatEffectFeed(value);
}

export {
  COMBAT_EFFECT_FEED_VERSION,
  COMBAT_EFFECT_FEED_MAX_RECORDS,
  COMBAT_EFFECT_FEED_MAX_BYTES,
  COMBAT_EFFECT_FEED_MAX_DEPTH,
  COMBAT_EFFECT_FEED_MAX_STRING_LENGTH,
  COMBAT_EFFECT_FEED_MAX_COORDINATE,
  COMBAT_EFFECT_FEED_MAX_DENOMINATOR,
  appendCombatEffectEvent,
  appendCombatEffectRoot,
  combatEffectFeedSnapshot,
  combatEffectRootId,
  createCombatEffectFeed,
  restoreCombatEffectFeed,
  serializeCombatEffectFeed,
  validateCombatEffectFeed,
};
