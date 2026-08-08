const CARD_KEYS = [
  "id",
  "key",
  "name",
  "elixir_cost",
  "rarity",
  "type",
  "tournament_level",
  "hitpoints",
  "damage",
  "hit_speed_seconds",
  "first_hit_seconds",
  "deploy_time_seconds",
  "range_tiles",
  "sight_range_tiles",
  "movement_speed_tiles_per_second",
  "movement_speed",
  "targets",
  "count",
  "area_damage_radius_tiles",
  "components",
  "unverified_fields",
  "notes",
];

const CARD_KEY_SET = new Set(CARD_KEYS);

function ownDataDescriptors(value, label) {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (
      typeof key !== "string" ||
      !Object.hasOwn(descriptor, "value") ||
      !descriptor.enumerable
    ) {
      throw new TypeError(`${label} must contain enumerable string data properties`);
    }
  }
  return descriptors;
}

function clonePlainData(value, label) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      throw new TypeError(`${label} contains an invalid number`);
    }
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`${label} contains unsupported data`);
  }

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new TypeError(`${label} must have the standard array prototype`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.some((key) => (
        key !== "length" &&
        (
          typeof key !== "string" ||
          !/^(0|[1-9]\d*)$/u.test(key) ||
          Number(key) >= value.length ||
          !Object.hasOwn(descriptors[key], "value") ||
          !descriptors[key].enumerable
        )
      )) ||
      keys.length !== value.length + 1
    ) {
      throw new TypeError(`${label} must be a dense data-only array`);
    }
    return Array.from(
      { length: value.length },
      (_, index) => clonePlainData(descriptors[index].value, `${label}[${index}]`),
    );
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const descriptors = ownDataDescriptors(value, label);
  const copy = {};
  for (const key of Object.keys(descriptors)) {
    copy[key] = clonePlainData(descriptors[key].value, `${label}.${key}`);
  }
  return copy;
}

function checkedCorpus(cards, mappings) {
  if (
    !Array.isArray(cards) ||
    Object.getPrototypeOf(cards) !== Array.prototype
  ) {
    throw new TypeError("reference cards must be a standard array");
  }
  const arrayDescriptors = Object.getOwnPropertyDescriptors(cards);
  if (
    Reflect.ownKeys(arrayDescriptors).length !== cards.length + 1 ||
    Array.from({ length: cards.length }, (_, index) => index).some(
      (index) => (
        !arrayDescriptors[index]?.enumerable ||
        !Object.hasOwn(arrayDescriptors[index], "value")
      ),
    )
  ) {
    throw new TypeError("reference cards must be a dense data-only array");
  }
  const byKey = new Map();
  for (let index = 0; index < cards.length; index += 1) {
    const source = arrayDescriptors[index].value;
    if (
      source === null ||
      typeof source !== "object" ||
      Array.isArray(source) ||
      Object.getPrototypeOf(source) !== Object.prototype
    ) {
      throw new TypeError(`reference card ${index} must be a plain object`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(source);
    const requiredFields = ["key", "unverified_fields", ...mappings.map(
      ({ benchmarkField }) => benchmarkField,
    )];
    for (const field of requiredFields) {
      if (
        !descriptors[field]?.enumerable ||
        !Object.hasOwn(descriptors[field], "value")
      ) {
        throw new TypeError(`reference card ${index}.${field} must be a data property`);
      }
    }
    const card = {};
    for (const field of new Set(requiredFields)) {
      card[field] = clonePlainData(
        descriptors[field].value,
        `reference card ${index}.${field}`,
      );
    }
    if (typeof card.key !== "string" || card.key.length === 0) {
      throw new TypeError(`reference card ${index} must have a non-empty key`);
    }
    if (byKey.has(card.key)) {
      throw new TypeError(`duplicate reference card key: ${card.key}`);
    }
    if (!Array.isArray(card.unverified_fields)) {
      throw new TypeError(`reference card ${card.key} must declare unverified_fields`);
    }
    const unverified = new Set();
    for (const field of card.unverified_fields) {
      if (
        typeof field !== "string" ||
        !CARD_KEY_SET.has(field) ||
        unverified.has(field)
      ) {
        throw new TypeError(`reference card ${card.key} has invalid unverified_fields`);
      }
      unverified.add(field);
    }
    byKey.set(card.key, { card, unverified });
  }
  return byKey;
}

function checkedCardKeys(cardKeys, corpus) {
  const copy = clonePlainData(cardKeys, "reference card keys");
  if (!Array.isArray(copy) || copy.length === 0) {
    throw new TypeError("reference card keys must be a non-empty array");
  }
  const selected = new Map();
  for (const cardKey of copy) {
    if (
      typeof cardKey !== "string" ||
      !corpus.has(cardKey) ||
      selected.has(cardKey)
    ) {
      throw new TypeError("reference card keys must be unique known strings");
    }
    selected.set(cardKey, corpus.get(cardKey));
  }
  return selected;
}

function checkedFieldSpecs(fieldSpecs) {
  if (!Array.isArray(fieldSpecs) || fieldSpecs.length === 0) {
    throw new TypeError("field mappings must be a non-empty array");
  }
  const descriptors = Object.getOwnPropertyDescriptors(fieldSpecs);
  if (
    Object.getPrototypeOf(fieldSpecs) !== Array.prototype ||
    Reflect.ownKeys(descriptors).length !== fieldSpecs.length + 1
  ) {
    throw new TypeError("field mappings must be a dense standard array");
  }

  const runtimeFields = new Set();
  const benchmarkFields = new Set();
  return Array.from({ length: fieldSpecs.length }, (_, index) => {
    const entryDescriptor = descriptors[index];
    if (!entryDescriptor?.enumerable || !Object.hasOwn(entryDescriptor, "value")) {
      throw new TypeError(`field mapping ${index} must be a data property`);
    }
    const entry = entryDescriptor.value;
    if (
      !Array.isArray(entry) ||
      Object.getPrototypeOf(entry) !== Array.prototype ||
      entry.length !== 3
    ) {
      throw new TypeError(`field mapping ${index} must be a three-item array`);
    }
    const entryDescriptors = Object.getOwnPropertyDescriptors(entry);
    if (
      Reflect.ownKeys(entryDescriptors).length !== 4 ||
      [0, 1, 2].some((entryIndex) => (
        !entryDescriptors[entryIndex]?.enumerable ||
        !Object.hasOwn(entryDescriptors[entryIndex], "value")
      ))
    ) {
      throw new TypeError(`field mapping ${index} must be dense and data-only`);
    }
    const runtimeField = entryDescriptors[0].value;
    const benchmarkField = entryDescriptors[1].value;
    const convert = entryDescriptors[2].value;
    if (typeof runtimeField !== "string" || runtimeField.length === 0) {
      throw new TypeError(`field mapping ${index} has an invalid runtime field`);
    }
    if (
      typeof benchmarkField !== "string" ||
      !CARD_KEY_SET.has(benchmarkField)
    ) {
      throw new TypeError(`field mapping ${index} has an unknown benchmark field`);
    }
    if (typeof convert !== "function") {
      throw new TypeError(`field mapping ${index} must have a converter`);
    }
    if (runtimeFields.has(runtimeField) || benchmarkFields.has(benchmarkField)) {
      throw new TypeError(`field mapping ${index} is duplicated`);
    }
    runtimeFields.add(runtimeField);
    benchmarkFields.add(benchmarkField);

    return { benchmarkField, convert, runtimeField };
  });
}

function snapshotExpected(mappings, corpus) {
  return mappings.map(({ benchmarkField, convert, runtimeField }, index) => {
    const expectedByCard = new Map();
    const unverifiedByCard = new Map();
    for (const [cardKey, { card, unverified }] of corpus) {
      const expected = convert(card[benchmarkField]);
      if (
        !(
          expected === null ||
          typeof expected === "string" ||
          typeof expected === "boolean" ||
          (
            typeof expected === "number" &&
            Number.isFinite(expected) &&
            (!Number.isInteger(expected) || Number.isSafeInteger(expected))
          )
        )
      ) {
        throw new TypeError(
          `field mapping ${index} produced invalid data for ${cardKey}`,
        );
      }
      expectedByCard.set(cardKey, expected);
      unverifiedByCard.set(cardKey, unverified.has(benchmarkField));
    }
    return { benchmarkField, expectedByCard, runtimeField, unverifiedByCard };
  });
}

function checkedRuntimeValue(runtimeCard, field, label) {
  const descriptor = Object.getOwnPropertyDescriptor(runtimeCard, field);
  if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
    throw new TypeError(`runtime card ${label} must be an enumerable data property`);
  }
  const value = descriptor.value;
  if (
    !(
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      (
        typeof value === "number" &&
        Number.isFinite(value) &&
        (!Number.isInteger(value) || Number.isSafeInteger(value))
      )
    )
  ) {
    throw new TypeError(`runtime card ${label} has invalid comparison data`);
  }
  return value;
}

/**
 * Validates and snapshots the test-only reference corpus and field mapping once.
 * The returned evaluator never consults caller-owned provenance or converters.
 */
export function createReferenceParityEvaluator(
  referenceCards,
  fieldSpecs,
  referenceCardKeys,
) {
  const checkedMappings = checkedFieldSpecs(fieldSpecs);
  const completeCorpus = checkedCorpus(referenceCards, checkedMappings);
  const corpus = checkedCardKeys(referenceCardKeys, completeCorpus);
  const mappings = snapshotExpected(checkedMappings, corpus);

  return function evaluateReferenceParity(runtimeCard, benchmarkKey) {
    if (
      runtimeCard === null ||
      typeof runtimeCard !== "object" ||
      Array.isArray(runtimeCard) ||
      Object.getPrototypeOf(runtimeCard) !== Object.prototype
    ) {
      throw new TypeError("runtime card must be a plain object");
    }
    if (typeof benchmarkKey !== "string" || !corpus.has(benchmarkKey)) {
      throw new RangeError(`unknown reference card key: ${String(benchmarkKey)}`);
    }
    const runtimeId = checkedRuntimeValue(runtimeCard, "id", "id");
    if (typeof runtimeId !== "string" || runtimeId.length === 0) {
      throw new TypeError("runtime card id must be a non-empty string");
    }

    const fields = mappings.map(
      ({ benchmarkField, expectedByCard, runtimeField, unverifiedByCard }) => {
        const expected = expectedByCard.get(benchmarkKey);
        const actual = checkedRuntimeValue(runtimeCard, runtimeField, runtimeField);
        const unverified = unverifiedByCard.get(benchmarkKey);
        const provenance = unverified
          ? {
            confidence: "unverified",
            source: `cards.json unverified_fields contains ${benchmarkField}`,
          }
          : {
            confidence: "authoritative",
            source: `cards.json corroborated field ${benchmarkField}`,
          };
        const matches = Object.is(actual, expected);
        const disposition = unverified
          ? matches ? "question-backed-match" : "question"
          : matches ? "match" : "authoritative-failure";
        return {
          actual,
          benchmarkField,
          disposition,
          expected,
          provenance,
          runtimeCard: runtimeId,
          runtimeField,
        };
      },
    );

    return {
      authoritativeFailures: fields.filter(
        ({ disposition }) => disposition === "authoritative-failure",
      ),
      fields,
      questions: fields.filter(
        ({ disposition }) => (
          disposition === "question" ||
          disposition === "question-backed-match"
        ),
      ),
    };
  };
}
