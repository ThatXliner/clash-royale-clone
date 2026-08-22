export const SESSION_TROOP_STATUS_RUNTIME_VERSION = 1;
export const SESSION_TROOP_STATUS_RUNTIME_MAX_COMMANDS = 1_024;
export const SESSION_TROOP_STATUS_RUNTIME_MAX_SOURCES = 1_024;
export const SESSION_TROOP_STATUS_RUNTIME_MAX_RECEIPT_BYTES = 1_048_576;

const PROFILE_IDS = Object.freeze([
  "aegis-sage",
  "bloom-wisp",
  "dawnmender",
  "pulse-sentry",
  "railward",
  "rime-adept",
  "tether-rider",
  "veil-prowler",
]);
const PHASES = new Set(["pre-move"]);
const FAMILIES = new Set([
  "heal",
  "invisibility",
  "reflection",
  "shield-form",
  "slow",
  "snare",
  "stun",
]);
const SOURCE_KEYS = ["cardId", "side", "sourceId"];
const COMMAND_KEYS = [
  "actionId", "commandId", "side", "sourceId", "targetId", "tick", "type",
];
const OBSERVATION_KEYS = ["commands", "phase", "sources", "tick"];
const INTENT_KEYS = [
  "actionId", "cardId", "commandId", "effect", "parameters", "phase", "side",
  "sourceId", "targetId", "tick", "type",
];

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

function exact(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
       Object.getPrototypeOf(value) !== null) ||
      Object.getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError(`${label} must be a plain string-keyed object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has an invalid shape`);
  }
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
  }
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function boundedArray(value, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new TypeError(`${label} must be a bounded array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) ||
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

function text(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 ||
      value.normalize("NFC") !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${label} must be bounded normalized text`);
  }
  return value;
}

// The content-side receipt builder supplies the exact manifest and question
// records. Keeping the admission witness here as a digest lets the shared
// kernel validate that receipt without importing content back through the
// public content index (which would create an ESM initialization cycle).
// This value is filled from the pinned content receipt and is intentionally
// checked over the complete canonical receipt, not just the executable fields.
const RECEIPT_FINGERPRINT = "5ce7a9c35c0be1b9";
const PROFILE_ID_SET = new Set(PROFILE_IDS);
const RECEIPT_MAX_DEPTH = 64;
const RECEIPT_MAX_NODES = 50_000;

function fingerprint(serialized) {
  const bytes = new TextEncoder().encode(serialized);
  let left = 2_166_136_261;
  let right = 2_166_136_261;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    left = Math.imul(left ^ byte, 16_777_619) >>> 0;
    right = Math.imul(right ^ (byte + ((index * 31) & 255)), 16_777_619) >>> 0;
  }
  return `${left.toString(16).padStart(8, "0")}${right.toString(16).padStart(8, "0")}`;
}

function dataTree(value, label, state = { depth: 0, nodes: 0 }, depth = 0) {
  state.nodes += 1;
  if (state.nodes > RECEIPT_MAX_NODES || depth > RECEIPT_MAX_DEPTH) {
    throw new RangeError(`${label} exceeds the receipt graph bound`);
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    if (typeof value === "string" && value.length > SESSION_TROOP_STATUS_RUNTIME_MAX_RECEIPT_BYTES) {
      throw new RangeError(`${label} exceeds the receipt text bound`);
    }
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
      throw new TypeError(`${label} must contain only finite bounded numbers`);
    }
    return value;
  }
  if (typeof value !== "object") throw new TypeError(`${label} contains an invalid value`);

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null && !Array.isArray(value)) {
    throw new TypeError(`${label} must contain only plain data objects`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError(`${label} must not contain symbols`);
  }
  if (Array.isArray(value)) {
    const keys = Reflect.ownKeys(descriptors);
    const lengthDescriptor = descriptors.length;
    if (lengthDescriptor === undefined || !Object.hasOwn(lengthDescriptor, "value") ||
        !Number.isSafeInteger(lengthDescriptor.value)) {
      throw new TypeError(`${label} has an invalid array length`);
    }
    const length = lengthDescriptor.value;
    if (keys.some((key) => key !== "length" &&
        (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= length))) {
      throw new TypeError(`${label} must contain only indexed data`);
    }
    return Array.from({ length }, (_, index) => {
      const descriptor = descriptors[index];
      if (descriptor === undefined || !descriptor.enumerable ||
          !Object.hasOwn(descriptor, "value")) {
        throw new TypeError(`${label}[${index}] must be an enumerable data property`);
      }
      return dataTree(descriptor.value, `${label}[${index}]`, state, depth + 1);
    });
  }
  const keys = Reflect.ownKeys(descriptors).sort();
  if (keys.some((key) => typeof key !== "string")) {
    throw new TypeError(`${label} must contain only string keys`);
  }
  return Object.fromEntries(keys.map((key) => {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
    return [key, dataTree(descriptor.value, `${label}.${key}`, state, depth + 1)];
  }));
}

function checkedReceiptObject(value, label) {
  const normalized = dataTree(value, label);
  const receipt = exact(normalized, ["manifest", "profiles", "version"], label);
  if (receipt.version !== SESSION_TROOP_STATUS_RUNTIME_VERSION ||
      typeof receipt.manifest !== "string" || receipt.manifest.length === 0) {
    throw new TypeError(`${label} is not the exact passed status profile receipt`);
  }
  const profiles = boundedArray(receipt.profiles, `${label}.profiles`, PROFILE_IDS.length);
  if (profiles.length !== PROFILE_IDS.length ||
      profiles.some((profile, index) =>
        profile === null || typeof profile !== "object" ||
        profile.id !== PROFILE_IDS[index])) {
    throw new TypeError(`${label} diverges from the exact passed status profile identities`);
  }
  let manifestValue;
  try {
    manifestValue = JSON.parse(receipt.manifest);
  } catch {
    throw new TypeError(`${label} has an invalid canonical source manifest`);
  }
  if (canonical(manifestValue) !== receipt.manifest ||
      !Array.isArray(manifestValue.profiles) ||
      manifestValue.profiles.length !== PROFILE_IDS.length ||
      manifestValue.profiles.some((profile, index) => profile.id !== PROFILE_IDS[index])) {
    throw new TypeError(`${label} has an invalid canonical source manifest`);
  }
  const serialized = canonical(receipt);
  if (fingerprint(serialized) !== RECEIPT_FINGERPRINT) {
    throw new TypeError(`${label} diverges from the exact passed status profile manifest`);
  }
  return clone(receipt);
}

export function parseSessionTroopStatusRuntimeProfiles(serialized) {
  if (typeof serialized !== "string") {
    throw new TypeError("session troop status runtime profiles must be canonical JSON text");
  }
  if (new TextEncoder().encode(serialized).byteLength > SESSION_TROOP_STATUS_RUNTIME_MAX_RECEIPT_BYTES) {
    throw new RangeError("session troop status runtime profiles exceed their byte bound");
  }
  let value;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new TypeError("session troop status runtime profiles must be valid JSON");
  }
  if (canonical(value) !== serialized) {
    throw new TypeError("session troop status runtime profiles must be canonical JSON");
  }
  return checkedReceiptObject(value, "session troop status runtime profiles");
}

export function serializeSessionTroopStatusRuntimeProfiles(value) {
  const receipt = checkedReceiptObject(value, "session troop status runtime profiles");
  return canonical(receipt);
}

function checkedSource(value, index) {
  const source = exact(value, SOURCE_KEYS, `status runtime source ${index}`);
  const sourceId = integer(source.sourceId, 1, Number.MAX_SAFE_INTEGER,
    `status runtime source ${index}.sourceId`);
  if (typeof source.cardId !== "string" || !PROFILE_ID_SET.has(source.cardId) ||
      !["north", "south"].includes(source.side)) {
    throw new TypeError(`status runtime source ${index} is invalid`);
  }
  return { cardId: source.cardId, side: source.side, sourceId };
}

function checkedCommand(value, currentTick, index) {
  const command = exact(value, COMMAND_KEYS, `status runtime command ${index}`);
  if (command.type !== "status") throw new TypeError("status runtime command.type is invalid");
  const actionId = text(command.actionId, `status runtime command ${index}.actionId`);
  const commandId = integer(command.commandId, 0, Number.MAX_SAFE_INTEGER,
    `status runtime command ${index}.commandId`);
  const sourceId = integer(command.sourceId, 1, Number.MAX_SAFE_INTEGER,
    `status runtime command ${index}.sourceId`);
  const targetId = command.targetId === null ? null : integer(command.targetId, 1,
    Number.MAX_SAFE_INTEGER, `status runtime command ${index}.targetId`);
  const tick = integer(command.tick, currentTick, currentTick,
    `status runtime command ${index}.tick`);
  if (!["north", "south"].includes(command.side)) {
    throw new TypeError(`status runtime command ${index}.side is invalid`);
  }
  return { actionId, commandId, side: command.side, sourceId, targetId, tick, type: "status" };
}

function checkedPhase(value) {
  if (typeof value !== "string" || !PHASES.has(value)) {
    throw new TypeError("status runtime phase is not an admitted canonical phase");
  }
  return value;
}

function checkedFamily(profile, label) {
  if (!FAMILIES.has(profile.claimFamily)) throw new TypeError(`${label}.claimFamily is invalid`);
  return profile.claimFamily;
}

function question(profile, key, label) {
  const record = profile.questions?.[key];
  if (record === undefined || record === null || !Object.hasOwn(record, "value")) {
    throw new RangeError(`${label} remains an explicit QUESTION (${key})`);
  }
  return record.value;
}

function checkedRate(value, label) {
  const rate = exact(value, ["denominator", "numerator"], label);
  return {
    denominator: integer(rate.denominator, 1, Number.MAX_SAFE_INTEGER, `${label}.denominator`),
    numerator: integer(rate.numerator, 1, rate.denominator - 1, `${label}.numerator`),
  };
}

function resolveAction(profile, actionId) {
  const family = checkedFamily(profile, `status profile ${profile.id}`);
  if (profile.resolution !== "question-bearing" || profile.questionReceipt === null ||
      profile.questions === null) {
    throw new RangeError(`status ${profile.id} remains an explicit QUESTION (${family})`);
  }
  if (family === "heal" && actionId === "heal") {
    const amountKey = profile.id === "bloom-wisp" ? "bloomWispHealAmount" : "dawnmenderHealAmount";
    return {
      effect: "heal",
      parameters: { amount: integer(question(profile, amountKey, `status ${profile.id}`), 0,
        Number.MAX_SAFE_INTEGER, `status ${profile.id}.${amountKey}`) },
    };
  }
  if (family === "stun" && actionId === "stun") {
    return {
      effect: "stun",
      parameters: { durationTicks: integer(question(profile, "durationTicks", `status ${profile.id}`),
        1, Number.MAX_SAFE_INTEGER, `status ${profile.id}.durationTicks`) },
    };
  }
  if (family === "slow" && actionId === "slow") {
    return {
      effect: "slow",
      parameters: {
        attackRate: checkedRate(question(profile, "attackProgressRate", `status ${profile.id}`),
          `status ${profile.id}.attackProgressRate`),
        durationTicks: integer(question(profile, "durationTicks", `status ${profile.id}`),
          1, Number.MAX_SAFE_INTEGER, `status ${profile.id}.durationTicks`),
        movementRate: checkedRate(question(profile, "movementProgressRate", `status ${profile.id}`),
          `status ${profile.id}.movementProgressRate`),
      },
    };
  }
  if (family === "snare" && actionId === "snare") {
    return {
      effect: "snare",
      parameters: { durationTicks: integer(question(profile, "durationTicks", `status ${profile.id}`),
        1, Number.MAX_SAFE_INTEGER, `status ${profile.id}.durationTicks`) },
    };
  }
  if (family === "invisibility" && (actionId === "hide" || actionId === "reveal")) {
    const key = actionId === "hide" ? "hideDurationTicks" : "revealDurationTicks";
    return {
      effect: actionId,
      parameters: { durationTicks: integer(question(profile, key, `status ${profile.id}`),
        1, Number.MAX_SAFE_INTEGER, `status ${profile.id}.${key}`) },
    };
  }
  throw new RangeError(`status ${profile.id} ${actionId} remains an explicit QUESTION (${family})`);
}

export class SessionTroopStatusRuntime {
  #receipt;

  constructor(serialized) {
    this.#receipt = parseSessionTroopStatusRuntimeProfiles(serialized);
  }

  get hasProfiles() {
    return true;
  }

  get state() {
    return clone(this.#receipt);
  }

  serialize() {
    return canonical(this.#receipt);
  }

  fork() {
    return new SessionTroopStatusRuntime(this.serialize());
  }

  profile(cardId) {
    if (typeof cardId !== "string") throw new TypeError("status runtime card ID must be a primitive string");
    const profile = this.#receipt.profiles.find((entry) => entry.id === cardId);
    return profile === undefined ? null : clone(profile);
  }

  inspect({ actionId, cardId, sourceId, targetId }) {
    const profile = this.profile(cardId);
    if (profile === null) throw new RangeError(`status ${cardId} remains an explicit QUESTION (unadmitted)`);
    const resolved = resolveAction(profile, actionId);
    const needsTarget = resolved.effect !== "hide" && resolved.effect !== "reveal";
    if (needsTarget && targetId === null) {
      throw new RangeError(`status ${cardId} remains an explicit QUESTION (targeting)`);
    }
    if (!needsTarget && targetId !== null) {
      throw new RangeError(`status ${cardId} remains an explicit QUESTION (targeting)`);
    }
    integer(sourceId, 1, Number.MAX_SAFE_INTEGER, "status runtime sourceId");
    return clone(resolved);
  }

  reduce(observation) {
    const checked = exact(observation, OBSERVATION_KEYS, "status runtime observation");
    const tick = integer(checked.tick, 0, Number.MAX_SAFE_INTEGER, "status runtime observation.tick");
    const phase = checkedPhase(checked.phase);
    const sources = boundedArray(checked.sources, "status runtime observation.sources",
      SESSION_TROOP_STATUS_RUNTIME_MAX_SOURCES).map(checkedSource);
    if (new Set(sources.map(({ sourceId }) => sourceId)).size !== sources.length) {
      throw new TypeError("status runtime observation source IDs must be unique");
    }
    const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
    const commands = boundedArray(checked.commands, "status runtime observation.commands",
      SESSION_TROOP_STATUS_RUNTIME_MAX_COMMANDS).map((command, index) =>
      checkedCommand(command, tick, index));
    const commandIdentities = new Set(commands.map(({ commandId, side }) =>
      `${side}:${commandId}`));
    if (commandIdentities.size !== commands.length) {
      throw new TypeError("status runtime observation command identities must be unique");
    }
    const intents = commands.map((command) => {
      const source = sourceById.get(command.sourceId);
      if (source === undefined || source.cardId === undefined || source.side !== command.side) {
        throw new RangeError("status runtime command source is not admitted");
      }
      if (source.cardId === "aegis-sage" || source.cardId === "railward") {
        throw new RangeError(`status ${source.cardId} remains an explicit QUESTION (${source.cardId === "aegis-sage" ? "reflection composition" : "shield/form"})`);
      }
      if (checked.phase !== "pre-move") throw new TypeError("status runtime command phase is not canonical");
      const resolved = this.inspect({
        actionId: command.actionId,
        cardId: source.cardId,
        sourceId: command.sourceId,
        targetId: command.targetId,
      });
      if (command.actionId !== "hide" && command.actionId !== "reveal" && command.targetId === null) {
        throw new RangeError("status runtime command target is an explicit QUESTION");
      }
      return {
        actionId: command.actionId,
        cardId: source.cardId,
        commandId: command.commandId,
        effect: resolved.effect,
        parameters: resolved.parameters,
        phase,
        side: command.side,
        sourceId: command.sourceId,
        targetId: command.targetId,
        tick,
        type: "troop-status-intent",
      };
    });
    return freeze(intents.sort((left, right) =>
      left.commandId - right.commandId || left.sourceId - right.sourceId));
  }
}
