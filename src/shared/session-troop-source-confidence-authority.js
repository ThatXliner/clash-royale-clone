const SOURCE_CONFIDENCE_FIELDS = Object.freeze([
  Object.freeze({ field: "count", questionKeySuffix: "count", valueEncoding: "positive-integer" }),
  Object.freeze({ field: "damage", questionKeySuffix: "damage", valueEncoding: "positive-integer" }),
  Object.freeze({ field: "deployTimeTicks", questionKeySuffix: "deploy-time-ticks", valueEncoding: "positive-integer" }),
  Object.freeze({ field: "firstHitTicks", questionKeySuffix: "first-hit-ticks", valueEncoding: "positive-integer" }),
  Object.freeze({ field: "hitSpeedTicks", questionKeySuffix: "hit-speed-ticks", valueEncoding: "positive-integer" }),
  Object.freeze({ field: "hitpoints", questionKeySuffix: "hitpoints", valueEncoding: "positive-integer" }),
  Object.freeze({ field: "movementMillitilesPerSecond", questionKeySuffix: "movement-millitiles-per-second", valueEncoding: "positive-integer" }),
  Object.freeze({ field: "rangeMillitiles", questionKeySuffix: "range-millitiles", valueEncoding: "positive-integer" }),
  Object.freeze({ field: "sightRangeMillitiles", questionKeySuffix: "sight-range-millitiles", valueEncoding: "positive-integer" }),
  Object.freeze({ field: "targetMode", questionKeySuffix: "target-mode", valueEncoding: "target-mode-code" }),
]);

const SOURCE_CONFIDENCE_CLAIMS = Object.freeze([
  Object.freeze({ cardId: "gloamwing-cluster", archetypeId: "gloamwing" }),
  Object.freeze({ cardId: "coppershade-flock", archetypeId: "coppershade" }),
]);

const TARGET_MODE_CODES = Object.freeze({
  buildings: 1,
  ground: 2,
  "ground-and-air": 3,
  structures: 4,
});

function exact(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length ||
      actual.some((key, index) => key !== expected[index]) ||
      Object.values(descriptors).some((descriptor) =>
        !descriptor.enumerable || !Object.hasOwn(descriptor, "value"))) {
    throw new TypeError(`${label} has an invalid shape`);
  }
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function expectedPolicy(archetypeId) {
  return {
    fields: SOURCE_CONFIDENCE_FIELDS.map(({ field, questionKeySuffix, valueEncoding }) => ({
      field,
      questionKey: `${archetypeId}.${questionKeySuffix}`,
      valueEncoding,
    })),
  };
}

export function getSessionTroopSourceConfidencePolicy(cardId, archetypeId) {
  if (typeof cardId !== "string" || typeof archetypeId !== "string") {
    throw new TypeError("session troop confidence identities must be strings");
  }
  const claim = SOURCE_CONFIDENCE_CLAIMS.find((candidate) => candidate.cardId === cardId);
  if (claim === undefined) return null;
  if (claim.archetypeId !== archetypeId) {
    throw new TypeError("session troop source confidence archetype diverges from its card identity");
  }
  return expectedPolicy(archetypeId);
}

export function assertSessionTroopSourceConfidencePolicy(value, cardId, archetypeId) {
  const policy = exact(value, ["fields"], "session troop source confidence policy");
  const expected = getSessionTroopSourceConfidencePolicy(cardId, archetypeId);
  if (expected === null) {
    throw new RangeError("session troop source confidence identity is not admitted");
  }
  if (!Array.isArray(policy.fields) || policy.fields.length !== expected.fields.length) {
    throw new TypeError("session troop source confidence field inventory is incomplete");
  }
  const fields = policy.fields.map((raw, index) => {
    const record = exact(raw, ["field", "questionKey", "valueEncoding"],
      `session troop source confidence policy.fields[${index}]`);
    const reference = expected.fields[index];
    if (record.field !== reference.field || record.questionKey !== reference.questionKey ||
        record.valueEncoding !== reference.valueEncoding) {
      throw new TypeError("session troop source confidence field inventory diverges");
    }
    return { field: record.field, questionKey: record.questionKey,
      valueEncoding: record.valueEncoding };
  });
  return { fields };
}

export function encodeSessionTroopSourceConfidenceValue(valueEncoding, value) {
  if (valueEncoding === "positive-integer") {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new TypeError("session troop source confidence value must be a positive integer");
    }
    return value;
  }
  if (valueEncoding === "target-mode-code") {
    if (typeof value !== "string" || !Object.hasOwn(TARGET_MODE_CODES, value)) {
      throw new TypeError("session troop source confidence target mode is invalid");
    }
    return TARGET_MODE_CODES[value];
  }
  throw new TypeError("session troop source confidence value encoding is not admitted");
}

export function assertSessionTroopSourceConfidenceQuestions({
  present, value, cardId, archetypeId, entity, questionKeys, questionValues,
  referencedQuestionKeys, label,
}) {
  const expected = getSessionTroopSourceConfidencePolicy(cardId, archetypeId);
  if ((expected !== null) !== present) {
    throw new TypeError(`${label} source confidence policy is missing or unexpected`);
  }
  if (!present) return null;
  const policy = assertSessionTroopSourceConfidencePolicy(value, cardId, archetypeId);
  for (const field of policy.fields) {
    if (!questionKeys.has(field.questionKey)) {
      throw new TypeError(`${label} source confidence field lacks a QUESTION record`);
    }
    const expectedValue = encodeSessionTroopSourceConfidenceValue(
      field.valueEncoding, entity[field.field],
    );
    if (questionValues.get(field.questionKey) !== expectedValue) {
      throw new TypeError(`${label} source confidence QUESTION diverges from its estimate`);
    }
    referencedQuestionKeys.add(field.questionKey);
  }
  return policy;
}
