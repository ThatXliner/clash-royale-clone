/**
 * Profile-only troop reducer used by LiveBattle's shared-world host seam.
 *
 * It owns no dynamic match state: no tick, entity IDs, health, statuses,
 * action queue, receipt/history, deck, elixir, clock, or random source.
 * LiveBattle supplies one bounded host observation and is the only component
 * that can validate or apply the immutable intent returned here.
 */

export const SESSION_TROOP_RUNTIME_VERSION = 3;
export const SESSION_TROOP_RUNTIME_LEGACY_VERSION = 1;
export const SESSION_TROOP_RUNTIME_ACTION_PROFILE_VERSION = 2;
export const SESSION_TROOP_RUNTIME_MAX_PROFILES = 8;
export const SESSION_TROOP_RUNTIME_MAX_SOURCES = 1_024;

const MAX_BYTES = 16_384;
const MAX_GRAPH_DEPTH = 16;
const MAX_GRAPH_NODES = 512;
const MAX_STRING_LENGTH = 128;
const LEGACY_ACTION_KEYS = ["abilityCost", "id", "target"];
const PRIOR_ACTION_KEYS = ["abilityCost", "effect", "id", "target"];
const ACTION_TARGETS = new Set(["unit"]);
const PRIOR_ACTION_EFFECTS = new Set(["source-melee-contact"]);
const LEGACY_INTENT_PHASES = new Set(["deploy", "pre-move", "pre-combat", "post-combat"]);
const CURRENT_INTENT_PHASES = new Set([...LEGACY_INTENT_PHASES, "combat"]);
const PASS_PHASES = Object.freeze(["pre-move", "pre-combat", "post-combat"]);
const LEGACY_PROFILE_KEYS = ["action", "cardId", "claim", "deploy", "passes"];
const CURRENT_PROFILE_KEYS = ["cardId", "claim", "contact", "sourceProfile"];
const PROFILE_SET_KEYS = ["profiles", "version"];
const SOURCE_KEYS = ["cardId", "side", "sourceId"];
const ACTION_COMMAND_KEYS = [
  "actionId", "commandId", "point", "side", "sourceId", "targetId", "tick", "type",
];
const POINT_KEYS = ["x", "y"];
const CONTACT_KEYS = ["attackSequence", "sourceId", "targetId"];
const CONTACT_PROVENANCE_KEYS = ["confidence", "contentPiece", "verification"];
const CONTACT_KEYS_PROFILE = ["delivery", "effect", "provenance"];
const SOURCE_PROFILE_KEYS = ["combat", "entity"];
const SOURCE_PROFILE_COMBAT_KEYS = [
  "damage", "delivery", "deployTimeTicks", "firstHitTicks", "hitSpeedTicks", "layer",
  "rangeMillitiles", "sightRangeMillitiles", "targetMode",
];
const SOURCE_PROFILE_ENTITY_KEYS = ["archetypeId", "memberIndex", "role"];
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

function checkedLegacyActionProfile(value, label, version) {
  if (value === null) return null;
  const action = exact(value, version === SESSION_TROOP_RUNTIME_LEGACY_VERSION
    ? LEGACY_ACTION_KEYS : PRIOR_ACTION_KEYS, label);
  if (action.abilityCost !== null) {
    throw new TypeError(`${label}.abilityCost must remain explicit null until sourced`);
  }
  const target = text(action.target, `${label}.target`);
  if (!ACTION_TARGETS.has(target)) throw new TypeError(`${label}.target is unsupported`);
  const checked = { abilityCost: null, id: text(action.id, `${label}.id`), target };
  if (version === SESSION_TROOP_RUNTIME_LEGACY_VERSION) return checked;
  const effect = text(action.effect, `${label}.effect`);
  if (!PRIOR_ACTION_EFFECTS.has(effect)) throw new TypeError(`${label}.effect is unsupported`);
  return { abilityCost: null, effect, id: checked.id, target };
}

function checkedLegacyProfile(value, index, version) {
  const profile = exact(value, LEGACY_PROFILE_KEYS, `session troop profile[${index}]`);
  const action = checkedLegacyActionProfile(profile.action, `session troop profile[${index}].action`, version);
  const claim = text(profile.claim, `session troop profile[${index}].claim`);
  if (version === SESSION_TROOP_RUNTIME_LEGACY_VERSION && claim !== "unclaimed") {
    throw new TypeError(`session troop profile[${index}].claim must remain unclaimed`);
  }
  if (version === SESSION_TROOP_RUNTIME_ACTION_PROFILE_VERSION &&
      !["receipt-witness", "representative-mechanic"].includes(claim)) {
    throw new TypeError(`session troop profile[${index}].claim is unsupported`);
  }
  if (version === SESSION_TROOP_RUNTIME_ACTION_PROFILE_VERSION &&
      ((claim === "representative-mechanic") !== (action !== null))) {
    throw new TypeError(`session troop profile[${index}].claim/action must agree`);
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
    action,
    cardId: text(profile.cardId, `session troop profile[${index}].cardId`),
    claim,
    deploy: "receipt-only",
    passes,
  };
}

function checkedContactProvenance(value, label) {
  const provenance = exact(value, CONTACT_PROVENANCE_KEYS, label);
  return {
    confidence: text(provenance.confidence, `${label}.confidence`),
    contentPiece: text(provenance.contentPiece, `${label}.contentPiece`),
    verification: text(provenance.verification, `${label}.verification`),
  };
}

function checkedCurrentContact(value, label) {
  const contact = exact(value, CONTACT_KEYS_PROFILE, label);
  if (contact.delivery !== "melee" || contact.effect !== "ordinary-live-contact") {
    throw new TypeError(`${label} must identify the ordinary melee host contact`);
  }
  return {
    delivery: "melee",
    effect: "ordinary-live-contact",
    provenance: checkedContactProvenance(contact.provenance, `${label}.provenance`),
  };
}

function checkedSourceProfile(value, label) {
  const source = exact(value, SOURCE_PROFILE_KEYS, label);
  const combat = exact(source.combat, SOURCE_PROFILE_COMBAT_KEYS, `${label}.combat`);
  if (combat.delivery !== "melee" || !["air", "ground"].includes(combat.layer) ||
      !["air", "air_and_ground", "buildings", "ground", "none"].includes(combat.targetMode)) {
    throw new TypeError(`${label}.combat is not an ordinary melee source`);
  }
  const entity = exact(source.entity, SOURCE_PROFILE_ENTITY_KEYS, `${label}.entity`);
  if (entity.memberIndex !== 0) {
    throw new TypeError(`${label} source projection is inconsistent`);
  }
  return {
    combat: {
      damage: integer(combat.damage, 1, 1_000_000_000, `${label}.combat.damage`),
      delivery: "melee",
      deployTimeTicks: integer(combat.deployTimeTicks, 0, 1_000_000_000,
        `${label}.combat.deployTimeTicks`),
      firstHitTicks: integer(combat.firstHitTicks, 0, 1_000_000_000,
        `${label}.combat.firstHitTicks`),
      hitSpeedTicks: integer(combat.hitSpeedTicks, 1, 1_000_000_000,
        `${label}.combat.hitSpeedTicks`),
      layer: combat.layer,
      rangeMillitiles: integer(combat.rangeMillitiles, 0, 1_000_000_000,
        `${label}.combat.rangeMillitiles`),
      sightRangeMillitiles: integer(combat.sightRangeMillitiles, 0, 1_000_000_000,
        `${label}.combat.sightRangeMillitiles`),
      targetMode: combat.targetMode,
    },
    entity: {
      archetypeId: text(entity.archetypeId, `${label}.entity.archetypeId`),
      memberIndex: 0,
      role: text(entity.role, `${label}.entity.role`),
    },
  };
}

function checkedCurrentProfile(value, index) {
  const profile = exact(value, CURRENT_PROFILE_KEYS, `session troop profile[${index}]`);
  const cardId = text(profile.cardId, `session troop profile[${index}].cardId`);
  if (cardId !== "mossguard" || profile.claim !== "representative-live-contact") {
    throw new TypeError(`session troop profile[${index}] is not the current Mossguard contact profile`);
  }
  const contact = checkedCurrentContact(profile.contact, `session troop profile[${index}].contact`);
  const sourceProfile = checkedSourceProfile(profile.sourceProfile,
    `session troop profile[${index}].sourceProfile`);
  if (contact.delivery !== sourceProfile.combat.delivery ||
      sourceProfile.entity.archetypeId !== cardId || sourceProfile.entity.role !== "primary") {
    throw new TypeError(`session troop profile[${index}] contact/source profile diverges`);
  }
  return { cardId, claim: "representative-live-contact", contact, sourceProfile };
}

function checkedProfiles(value) {
  const set = exact(value, PROFILE_SET_KEYS, "session troop profiles");
  if (![SESSION_TROOP_RUNTIME_LEGACY_VERSION, SESSION_TROOP_RUNTIME_ACTION_PROFILE_VERSION,
    SESSION_TROOP_RUNTIME_VERSION].includes(set.version)) {
    throw new TypeError("session troop profiles version is unsupported");
  }
  const version = set.version;
  const rawProfiles = denseArray(set.profiles, SESSION_TROOP_RUNTIME_MAX_PROFILES,
    "session troop profiles.profiles");
  if (version === SESSION_TROOP_RUNTIME_VERSION) {
    if (rawProfiles.length !== 1) {
      throw new TypeError("current session troop runtime requires exactly one source profile");
    }
    return freeze({ profiles: [checkedCurrentProfile(rawProfiles[0], 0)], version });
  }
  const profiles = rawProfiles.map((profile, index) => checkedLegacyProfile(profile, index, version))
    .sort((left, right) => left.cardId.localeCompare(right.cardId));
  if (new Set(profiles.map(({ cardId }) => cardId)).size !== profiles.length) {
    throw new TypeError("session troop profiles must have unique card IDs");
  }
  return freeze({ profiles, version });
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

function checkedSources(value) {
  const sources = denseArray(value, SESSION_TROOP_RUNTIME_MAX_SOURCES,
    "session troop runtime boundary.sources").map(checkedSource)
    .sort((left, right) => left.sourceId - right.sourceId);
  if (new Set(sources.map(({ sourceId }) => sourceId)).size !== sources.length) {
    throw new TypeError("session troop runtime boundary sources must be unique");
  }
  return sources;
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

function checkedContact(value, index) {
  const contact = exact(value, CONTACT_KEYS, `session troop runtime contact[${index}]`);
  const sourceId = integer(contact.sourceId, 1, Number.MAX_SAFE_INTEGER,
    `session troop runtime contact[${index}].sourceId`);
  const targetId = integer(contact.targetId, 1, Number.MAX_SAFE_INTEGER,
    `session troop runtime contact[${index}].targetId`);
  if (targetId === sourceId) {
    throw new TypeError(`session troop runtime contact[${index}] self-targets`);
  }
  return {
    attackSequence: integer(contact.attackSequence, 1, Number.MAX_SAFE_INTEGER,
      `session troop runtime contact[${index}].attackSequence`),
    sourceId,
    targetId,
  };
}

function checkedLegacyBoundary(value) {
  const boundary = exact(value, ["action", "phase", "sources", "tick"],
    "session troop runtime boundary");
  const phase = text(boundary.phase, "session troop runtime boundary.phase");
  if (!LEGACY_INTENT_PHASES.has(phase)) {
    throw new TypeError("session troop runtime boundary.phase is invalid");
  }
  const action = boundary.action === null ? null : checkedActionCommand(boundary.action,
    "session troop runtime boundary.action");
  if (action !== null && phase !== "pre-combat") {
    throw new TypeError("session troop runtime actions are pre-combat only");
  }
  return {
    action,
    phase,
    sources: checkedSources(boundary.sources),
    tick: integer(boundary.tick, 0, Number.MAX_SAFE_INTEGER,
      "session troop runtime boundary.tick"),
  };
}

function checkedCurrentBoundary(value) {
  const boundary = exact(value, ["contacts", "phase", "sources", "tick"],
    "session troop runtime boundary");
  const phase = text(boundary.phase, "session troop runtime boundary.phase");
  if (!CURRENT_INTENT_PHASES.has(phase)) {
    throw new TypeError("session troop runtime boundary.phase is invalid");
  }
  const contacts = denseArray(boundary.contacts, SESSION_TROOP_RUNTIME_MAX_SOURCES,
    "session troop runtime boundary.contacts").map(checkedContact)
    .sort((left, right) => left.sourceId - right.sourceId || left.targetId - right.targetId ||
      left.attackSequence - right.attackSequence);
  if (canonical(contacts) !== canonical(boundary.contacts) ||
      new Set(contacts.map(({ attackSequence, sourceId, targetId }) =>
        `${sourceId}:${targetId}:${attackSequence}`)).size !== contacts.length) {
    throw new TypeError("session troop runtime contacts must be unique and canonically ordered");
  }
  if (phase !== "combat" && contacts.length !== 0) {
    throw new TypeError("session troop runtime contacts belong only to combat");
  }
  return {
    contacts,
    phase,
    sources: checkedSources(boundary.sources),
    tick: integer(boundary.tick, 0, Number.MAX_SAFE_INTEGER,
      "session troop runtime boundary.tick"),
  };
}

function legacyIntent({ action = null, cardId, phase, side, sourceId, tick, type }) {
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

function contactIntent({ attackSequence, cardId, side, sourceId, targetId, tick }) {
  return freeze({
    attackSequence,
    cardId,
    kind: "contact",
    phase: "combat",
    side,
    sourceId,
    targetId,
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

/** A deterministic, configuration-only reducer. */
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

  get version() {
    return this.#profiles.version;
  }

  get allowsLegacyActions() {
    return this.#profiles.version === SESSION_TROOP_RUNTIME_LEGACY_VERSION ||
      this.#profiles.version === SESSION_TROOP_RUNTIME_ACTION_PROFILE_VERSION;
  }

  profile(cardId) {
    if (typeof cardId !== "string") throw new TypeError("session troop profile card ID must be primitive");
    const profile = this.#byCard.get(cardId);
    return profile === undefined ? null : freeze(clone(profile));
  }

  inspectAction({ action, source }) {
    if (!this.allowsLegacyActions) {
      throw new RangeError("current session troop runtime does not admit player actions");
    }
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
    const inspected = {
      abilityCost: null,
      actionId: checkedAction.actionId,
      cardId: checkedSourceFact.cardId,
      sourceId: checkedSourceFact.sourceId,
      target: profile.action.target,
    };
    if (this.#profiles.version === SESSION_TROOP_RUNTIME_ACTION_PROFILE_VERSION) {
      inspected.effect = profile.action.effect;
    }
    return freeze(inspected);
  }

  reduce(boundary) {
    if (this.#profiles.version === SESSION_TROOP_RUNTIME_VERSION) {
      const checked = checkedCurrentBoundary(boundary);
      if (checked.phase !== "combat") return freeze([]);
      const intents = [];
      for (const contact of checked.contacts) {
        const source = checked.sources.find(({ sourceId }) => sourceId === contact.sourceId);
        if (source === undefined) {
          throw new RangeError("session troop contact source is absent from its host boundary");
        }
        const profile = this.#byCard.get(source.cardId);
        if (profile === undefined || profile.contact === undefined) {
          throw new RangeError("session troop contact source is not profiled");
        }
        intents.push(contactIntent({ ...contact, cardId: source.cardId, side: source.side,
          sourceId: source.sourceId, tick: checked.tick }));
      }
      return freeze(intents);
    }

    const checked = checkedLegacyBoundary(boundary);
    const intents = [];
    if (checked.action !== null) {
      const source = checked.sources.find(({ sourceId }) => sourceId === checked.action.sourceId);
      if (source === undefined) throw new RangeError("session troop action source is absent from its host boundary");
      this.inspectAction({ action: checked.action, source });
      intents.push(legacyIntent({ action: checked.action, cardId: source.cardId,
        phase: checked.phase, side: source.side, sourceId: source.sourceId,
        tick: checked.tick, type: "action" }));
      return freeze(intents);
    }
    for (const source of checked.sources) {
      const profile = this.#byCard.get(source.cardId);
      if (profile === undefined) continue;
      if (checked.phase === "deploy" && profile.deploy === "receipt-only") {
        intents.push(legacyIntent({ cardId: source.cardId, phase: checked.phase,
          side: source.side, sourceId: source.sourceId, tick: checked.tick, type: "deploy" }));
      } else if (checked.phase !== "deploy" && profile.passes.includes(checked.phase)) {
        intents.push(legacyIntent({ cardId: source.cardId, phase: checked.phase,
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
