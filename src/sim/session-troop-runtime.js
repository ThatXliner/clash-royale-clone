/**
 * Profile-only troop reducer used by LiveBattle's shared-world host seam.
 *
 * This module deliberately owns no dynamic match state. In particular, it
 * owns no tick, entity IDs, health, statuses, action queue, receipt history,
 * deck, elixir, clock, or random source. LiveBattle supplies host facts for
 * one phase and remains the only authority that can validate and apply the
 * immutable intents returned here.
 */

export const SESSION_TROOP_RUNTIME_VERSION = 1;
export const SESSION_TROOP_RUNTIME_MAX_PROFILES = 8;
export const SESSION_TROOP_RUNTIME_MAX_SOURCES = 1_024;

const MAX_BYTES = 16_384;
const MAX_GRAPH_DEPTH = 16;
const MAX_GRAPH_NODES = 512;
const MAX_STRING_LENGTH = 128;
const ACTION_KEYS = ["abilityCost", "id", "target"];
const ACTION_TARGETS = new Set(["unit"]);
const INTENT_PHASES = new Set(["deploy", "pre-move", "pre-combat", "post-combat"]);
const PASS_PHASES = Object.freeze(["pre-move", "pre-combat", "post-combat"]);
const PROFILE_KEYS = ["action", "cardId", "claim", "deploy", "passes"];
const PROFILE_SET_KEYS = ["profiles", "version"];
const SOURCE_KEYS = ["cardId", "side", "sourceId"];
const ACTION_COMMAND_KEYS = [
  "actionId", "commandId", "point", "side", "sourceId", "targetId", "tick", "type",
];
const POINT_KEYS = ["x", "y"];
const EMPTY_PROFILE_BYTES = '{"profiles":[],"version":1}';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
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

function exact(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has an invalid shape`);
  }
  return value;
}

function denseArray(value, maximum, label) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) {
    throw new TypeError(`${label} must be a bounded dense array`);
  }
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label} must contain only data entries`);
    }
    return descriptor.value;
  });
}

function text(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_STRING_LENGTH ||
      value.normalize("NFC") !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${label} must be bounded normalized text`);
  }
  return value;
}

function integer(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} must be a bounded safe integer`);
  }
  return value;
}

function checkedPoint(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const point = exact(value, POINT_KEYS, label);
  return {
    x: integer(point.x, 0, Number.MAX_SAFE_INTEGER, `${label}.x`),
    y: integer(point.y, 0, Number.MAX_SAFE_INTEGER, `${label}.y`),
  };
}

function parse(textValue, label) {
  if (typeof textValue !== "string") throw new TypeError(`${label} must be canonical JSON text`);
  if (new TextEncoder().encode(textValue).byteLength > MAX_BYTES) {
    throw new RangeError(`${label} exceeds its byte bound`);
  }
  let value;
  try { value = JSON.parse(textValue); }
  catch { throw new TypeError(`${label} must be valid JSON`); }
  const stack = [{ depth: 0, value }];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    nodes += 1;
    if (nodes > MAX_GRAPH_NODES || current.depth > MAX_GRAPH_DEPTH) {
      throw new RangeError(`${label} exceeds its graph bound`);
    }
    const entry = current.value;
    if (typeof entry === "string") {
      text(entry, label);
      continue;
    }
    if (typeof entry === "number" && !Number.isSafeInteger(entry)) {
      throw new TypeError(`${label} contains a non-safe integer`);
    }
    if (entry === null || typeof entry === "boolean" || typeof entry === "number") continue;
    if (!entry || typeof entry !== "object") throw new TypeError(`${label} contains invalid data`);
    const children = Array.isArray(entry) ? entry : Object.values(entry);
    if (children.length > MAX_GRAPH_NODES) throw new RangeError(`${label} exceeds its member bound`);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ depth: current.depth + 1, value: children[index] });
    }
  }
  if (canonical(value) !== textValue) throw new TypeError(`${label} must be canonical JSON`);
  return value;
}

function checkedActionProfile(value, label) {
  if (value === null) return null;
  const action = exact(value, ACTION_KEYS, label);
  if (action.abilityCost !== null) {
    throw new TypeError(`${label}.abilityCost must remain explicit null until sourced`);
  }
  const target = text(action.target, `${label}.target`);
  if (!ACTION_TARGETS.has(target)) throw new TypeError(`${label}.target is unsupported`);
  return { abilityCost: null, id: text(action.id, `${label}.id`), target };
}

function checkedProfile(value, index) {
  const profile = exact(value, PROFILE_KEYS, `session troop profile[${index}]`);
  if (profile.claim !== "unclaimed") {
    throw new TypeError(`session troop profile[${index}].claim must remain unclaimed`);
  }
  if (profile.deploy !== "receipt-only") {
    throw new TypeError(`session troop profile[${index}].deploy must be receipt-only`);
  }
  const passes = denseArray(profile.passes, PASS_PHASES.length,
    `session troop profile[${index}].passes`).map((phase, phaseIndex) => {
    const checked = text(phase, `session troop profile[${index}].passes[${phaseIndex}]`);
    if (checked !== PASS_PHASES[phaseIndex]) {
      throw new TypeError(`session troop profile[${index}].passes must use canonical phase order`);
    }
    return checked;
  });
  if (passes.length !== PASS_PHASES.length) {
    throw new TypeError(`session troop profile[${index}].passes must cover every host phase`);
  }
  return {
    action: checkedActionProfile(profile.action, `session troop profile[${index}].action`),
    cardId: text(profile.cardId, `session troop profile[${index}].cardId`),
    claim: "unclaimed",
    deploy: "receipt-only",
    passes,
  };
}

function checkedProfiles(value) {
  const set = exact(value, PROFILE_SET_KEYS, "session troop profiles");
  if (set.version !== SESSION_TROOP_RUNTIME_VERSION) {
    throw new TypeError("session troop profiles version is unsupported");
  }
  const profiles = denseArray(set.profiles, SESSION_TROOP_RUNTIME_MAX_PROFILES,
    "session troop profiles.profiles").map(checkedProfile)
    .sort((left, right) => left.cardId.localeCompare(right.cardId));
  if (new Set(profiles.map(({ cardId }) => cardId)).size !== profiles.length) {
    throw new TypeError("session troop profiles must have unique card IDs");
  }
  return freeze({ profiles, version: SESSION_TROOP_RUNTIME_VERSION });
}

function checkedSource(value, index) {
  const source = exact(value, SOURCE_KEYS, `session troop runtime source[${index}]`);
  const side = text(source.side, `session troop runtime source[${index}].side`);
  if (side !== "north" && side !== "south") {
    throw new TypeError(`session troop runtime source[${index}].side is invalid`);
  }
  return {
    cardId: text(source.cardId, `session troop runtime source[${index}].cardId`),
    side,
    sourceId: integer(source.sourceId, 1, Number.MAX_SAFE_INTEGER,
      `session troop runtime source[${index}].sourceId`),
  };
}

function checkedActionCommand(value, label = "session troop action") {
  const action = exact(value, ACTION_COMMAND_KEYS, label);
  if (action.type !== "ability") throw new TypeError(`${label}.type is invalid`);
  const side = text(action.side, `${label}.side`);
  if (side !== "north" && side !== "south") throw new TypeError(`${label}.side is invalid`);
  const targetId = action.targetId === null ? null : integer(action.targetId, 1,
    Number.MAX_SAFE_INTEGER, `${label}.targetId`);
  return {
    actionId: text(action.actionId, `${label}.actionId`),
    commandId: integer(action.commandId, 0, Number.MAX_SAFE_INTEGER, `${label}.commandId`),
    point: checkedPoint(action.point, `${label}.point`, { nullable: true }),
    side,
    sourceId: integer(action.sourceId, 1, Number.MAX_SAFE_INTEGER, `${label}.sourceId`),
    targetId,
    tick: integer(action.tick, 0, Number.MAX_SAFE_INTEGER, `${label}.tick`),
    type: "ability",
  };
}

function checkedBoundary(value) {
  const boundary = exact(value, ["action", "phase", "sources", "tick"],
    "session troop runtime boundary");
  const phase = text(boundary.phase, "session troop runtime boundary.phase");
  if (!INTENT_PHASES.has(phase)) {
    throw new TypeError("session troop runtime boundary.phase is invalid");
  }
  const sources = denseArray(boundary.sources, SESSION_TROOP_RUNTIME_MAX_SOURCES,
    "session troop runtime boundary.sources").map(checkedSource)
    .sort((left, right) => left.sourceId - right.sourceId);
  if (new Set(sources.map(({ sourceId }) => sourceId)).size !== sources.length) {
    throw new TypeError("session troop runtime boundary sources must be unique");
  }
  const action = boundary.action === null ? null : checkedActionCommand(boundary.action,
    "session troop runtime boundary.action");
  if (action !== null && phase !== "pre-combat") {
    throw new TypeError("session troop runtime actions are pre-combat only");
  }
  return {
    action,
    phase,
    sources,
    tick: integer(boundary.tick, 0, Number.MAX_SAFE_INTEGER,
      "session troop runtime boundary.tick"),
  };
}

function intent({ action = null, cardId, phase, side, sourceId, tick, type }) {
  return freeze({
    actionId: action?.actionId ?? null,
    cardId,
    commandId: action?.commandId ?? null,
    kind: type,
    phase,
    point: action?.point ?? null,
    side,
    sourceId,
    targetId: action?.targetId ?? null,
    tick,
    type: "troop-runtime-intent",
  });
}

export function parseSessionTroopRuntimeProfiles(serialized) {
  const checked = checkedProfiles(parse(serialized, "session troop profiles"));
  if (canonical(checked) !== serialized) {
    throw new TypeError("session troop profiles must use canonical profile ordering");
  }
  return checked;
}

export function serializeSessionTroopRuntimeProfiles(value) {
  return canonical(checkedProfiles(value));
}

/**
 * A deterministic, configuration-only reducer. Dynamic facts are supplied by
 * LiveBattle for a single boundary and cannot be retained here.
 */
export class SessionTroopRuntime {
  #profiles;
  #byCard;

  constructor(canonicalProfiles = EMPTY_PROFILE_BYTES) {
    this.#profiles = parseSessionTroopRuntimeProfiles(canonicalProfiles);
    this.#byCard = new Map(this.#profiles.profiles.map((profile) => [profile.cardId, profile]));
  }

  get state() {
    return freeze(clone(this.#profiles));
  }

  get configuration() {
    return this.state;
  }

  get hasProfiles() {
    return this.#profiles.profiles.length > 0;
  }

  profile(cardId) {
    if (typeof cardId !== "string") throw new TypeError("session troop profile card ID must be primitive");
    const profile = this.#byCard.get(cardId);
    return profile === undefined ? null : freeze(clone(profile));
  }

  inspectAction({ action, source }) {
    const checkedAction = checkedActionCommand(action, "session troop action inspection.action");
    const checkedSourceFact = checkedSource(source, 0);
    if (checkedSourceFact.sourceId !== checkedAction.sourceId ||
        checkedSourceFact.side !== checkedAction.side) {
      throw new RangeError("session troop action source is not causal");
    }
    const profile = this.#byCard.get(checkedSourceFact.cardId);
    if (profile?.action === null || profile === undefined || profile.action.id !== checkedAction.actionId) {
      throw new RangeError("session troop action is not admitted for its source card");
    }
    if (profile.action.abilityCost !== null) {
      throw new TypeError("session troop action cost is not sourced");
    }
    if (profile.action.target === "unit" && (checkedAction.targetId === null || checkedAction.point !== null)) {
      throw new RangeError("session troop action requires exactly one unit target");
    }
    return freeze({
      abilityCost: null,
      actionId: checkedAction.actionId,
      cardId: checkedSourceFact.cardId,
      sourceId: checkedSourceFact.sourceId,
      target: profile.action.target,
    });
  }

  reduce(boundary) {
    const checked = checkedBoundary(boundary);
    const intents = [];
    if (checked.action !== null) {
      const source = checked.sources.find(({ sourceId }) => sourceId === checked.action.sourceId);
      if (source === undefined) throw new RangeError("session troop action source is absent from its host boundary");
      this.inspectAction({ action: checked.action, source });
      intents.push(intent({ action: checked.action, cardId: source.cardId,
        phase: checked.phase, side: source.side, sourceId: source.sourceId,
        tick: checked.tick, type: "action" }));
      return freeze(intents);
    }
    for (const source of checked.sources) {
      const profile = this.#byCard.get(source.cardId);
      if (profile === undefined) continue;
      if (checked.phase === "deploy" && profile.deploy === "receipt-only") {
        intents.push(intent({ cardId: source.cardId, phase: checked.phase,
          side: source.side, sourceId: source.sourceId, tick: checked.tick, type: "deploy" }));
      } else if (checked.phase !== "deploy" && profile.passes.includes(checked.phase)) {
        intents.push(intent({ cardId: source.cardId, phase: checked.phase,
          side: source.side, sourceId: source.sourceId, tick: checked.tick, type: "pass" }));
      }
    }
    return freeze(intents);
  }

  serialize() {
    return canonical(this.#profiles);
  }

  fork() {
    return SessionTroopRuntime.restore(this.serialize());
  }

  static restore(serialized) {
    return new SessionTroopRuntime(serialized);
  }
}
