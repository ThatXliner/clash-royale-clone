// This module deliberately knows no content imports, deck, elixir, clock,
// RNG, units, towers, or movement state. Its one receipt is copied verbatim
// from the content-side receipt producer and must be supplied by a canonical
// LiveBattle setup. LiveBattle owns every actual state mutation.

const MAX_ACTIONS = 1_024;
const MAX_EFFECT_ID = Number.MAX_SAFE_INTEGER - 1;
const PROFILE_ID = "isolated-sourced-instant-v1";

const CANONICAL_RECEIPTS = Object.freeze({
  exclusions: Object.freeze([
    Object.freeze({ id: "squall-orb-radius-target-knockback-travel-return",
      reason: "all radius, target-policy, knockback, travel, return, and four-facade composition fields remain QUESTION" }),
    Object.freeze({ id: "squall-orb-crown-tower-damage-modifier",
      reason: "crown-tower damage ratio and rounding remain QUESTION, so crown-tower targets are disabled" }),
    Object.freeze({ id: "periodic", reason: "cadence, duration, damage, radius, and target composition remain QUESTION" }),
    Object.freeze({ id: "spawn", reason: "spawn identities lack sourced kind/cost/deploy admission and all spawn mechanics remain QUESTION" }),
    Object.freeze({ id: "status", reason: "status duration, multiplier, target, refresh, and expiry mechanics remain QUESTION" }),
    Object.freeze({ id: "traveling", reason: "travel timing, geometry, damage, target, and return mechanics remain QUESTION" }),
  ]),
  profiles: Object.freeze([
    Object.freeze({
      claims: Object.freeze(["cardId", "kind", "cost", "count", "damage"]),
      fact: Object.freeze({
        cardId: "squall-orb",
        count: 1,
        cost: 4,
        damage: 689,
        kind: "effect",
        sourceExport: "createInstantSpellCatalog",
      }),
      mode: "isolated-direct-command-target-damage-not-card-composition",
      profileId: PROFILE_ID,
    }),
  ]),
  version: 1,
});

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function clone(value) {
  return structuredClone(value);
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
      Object.getPrototypeOf(value) !== Object.prototype ||
      Object.getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError(`${label} must be a plain string-keyed data object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has an invalid shape`);
  }
  for (const key of keys) {
    if (!descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value")) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
  }
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function checkedPoint(value, label) {
  const point = exact(value, ["x", "y"], label);
  if (!Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y)) {
    throw new TypeError(`${label} must contain safe integer coordinates`);
  }
  return { x: point.x, y: point.y };
}

function checkedTarget(value, label) {
  const target = exact(value, ["id", "kind"], label);
  if (target.kind === "unit" && Number.isSafeInteger(target.id) && target.id > 0) {
    return { id: target.id, kind: target.kind };
  }
  throw new TypeError(`${label} must name one shared unit; crown-tower modifiers are QUESTION`);
}

function checkedCommand(value, currentTick) {
  const command = exact(value, ["cardId", "point", "sequence", "side", "target", "tick"],
    "live spell command");
  if (command.cardId !== "squall-orb" || !["north", "south"].includes(command.side) ||
      !Number.isSafeInteger(command.sequence) || command.sequence < 0 ||
      !Number.isSafeInteger(command.tick) || command.tick !== currentTick) {
    throw new TypeError("live spell command is invalid");
  }
  return {
    cardId: command.cardId,
    point: checkedPoint(command.point, "live spell command.point"),
    sequence: command.sequence,
    side: command.side,
    target: checkedTarget(command.target, "live spell command.target"),
    tick: command.tick,
  };
}

export function serializeSpellIntentProfileReceipts(...args) {
  if (args.length !== 0) throw new TypeError("spell intent profile receipt serialization takes no arguments");
  return canonical(CANONICAL_RECEIPTS);
}

/**
 * Accept only an exact content-produced receipt. This is intentionally not a
 * broad profile language: admitting arbitrary action values would turn a
 * source-honest authority seam into an unsupported spell roster.
 */
export function parseSpellIntentProfileReceipts(value) {
  exact(value, ["exclusions", "profiles", "version"], "live spell profile receipts");
  if (canonical(value) !== canonical(CANONICAL_RECEIPTS)) {
    throw new TypeError("live spell profile receipts are not the exact sourced receipt");
  }
  return freeze(clone(CANONICAL_RECEIPTS));
}

export function getSpellIntentQuestionExclusions(...args) {
  if (args.length !== 0) throw new TypeError("spell intent question exclusions take no arguments");
  return freeze(clone(CANONICAL_RECEIPTS.exclusions));
}

class SpellIntentRuntime {
  #nextEffectId = 1;
  #pending = [];
  #receipts;

  constructor(receipts) {
    this.#receipts = parseSpellIntentProfileReceipts(receipts);
  }

  get state() {
    return freeze({ nextEffectId: this.#nextEffectId, pending: clone(this.#pending), version: 1 });
  }

  hasCard(cardId) {
    return cardId === this.#receipts.profiles[0].fact.cardId;
  }

  hasPendingSequence(tick, sequence) {
    return this.#pending.some((entry) => entry.tick === tick && entry.sequence === sequence);
  }

  validate(command, currentTick) {
    const checked = checkedCommand(command, currentTick);
    if (!this.hasCard(checked.cardId)) throw new RangeError("spell card has no sourced profile");
    return freeze(clone(checked));
  }

  schedule(command, currentTick, admit) {
    const checked = this.validate(command, currentTick);
    if (typeof admit !== "function" || !admit(freeze(clone(checked)))) {
      throw new RangeError("live spell command is not admitted by the shared battle");
    }
    if (this.#pending.length >= MAX_ACTIONS) throw new RangeError("live spell action bound exceeded");
    if (this.#nextEffectId > MAX_EFFECT_ID) throw new RangeError("live spell effect ID space is exhausted");
    if (this.hasPendingSequence(checked.tick, checked.sequence)) {
      throw new RangeError("live spell tick/sequence is duplicate");
    }
    const effectId = this.#nextEffectId;
    this.#nextEffectId += 1;
    this.#pending.push({ ...checked, effectId, profileId: PROFILE_ID });
    this.#pending.sort((left, right) => left.tick - right.tick ||
      left.sequence - right.sequence || left.effectId - right.effectId);
    return freeze({ cardId: checked.cardId, effectId, point: clone(checked.point),
      profileId: PROFILE_ID, sequence: checked.sequence, side: checked.side,
      target: clone(checked.target), tick: checked.tick, type: "spell-intent-scheduled" });
  }

  resolve(tick) {
    if (!Number.isSafeInteger(tick) || tick < 0) throw new TypeError("live spell resolve tick is invalid");
    const due = this.#pending.filter((entry) => entry.tick === tick);
    this.#pending = this.#pending.filter((entry) => entry.tick !== tick);
    const damage = this.#receipts.profiles[0].fact.damage;
    return freeze(due.map((entry) => ({
      actionIndex: 0,
      cardId: entry.cardId,
      damage,
      effectId: entry.effectId,
      kind: "isolated-direct-target-damage",
      point: clone(entry.point),
      profileId: entry.profileId,
      sequence: entry.sequence,
      side: entry.side,
      target: clone(entry.target),
      tick,
    })));
  }

  fork() {
    const copy = new SpellIntentRuntime(this.#receipts);
    copy.#nextEffectId = this.#nextEffectId;
    copy.#pending = clone(this.#pending);
    return copy;
  }
}

// The reducer is intentionally not exported as a public runtime capability.
// LiveBattle holds the only instance and owns its history, serialization, and
// application to shared authorities.
export function createSpellIntentRuntime(receipts) {
  return new SpellIntentRuntime(receipts);
}
