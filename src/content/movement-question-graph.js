const MAX_ARRAY_LENGTH = 128;
const MAX_OBJECT_KEYS = 256;
const MAX_GRAPH_NODES = 4_096;

// The capability is deliberately private.  A caller can receive a fresh
// copy, but cannot mark a replacement object as source-admitted.
const ADMITTED_QUESTION_NODES = new WeakSet();
const QUESTION_NODE_PROTOTYPES = new WeakMap();

function isObject(value) {
  return value !== null && typeof value === "object";
}

function reject(label, message) {
  throw new TypeError(label + " " + message);
}

function readPlainKind(value, label) {
  const isArray = Array.isArray(value);
  let prototype;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    reject(label, "must be inspectable source data");
  }
  if (isArray) {
    if (prototype !== Array.prototype) {
      reject(label, "must use the ordinary array prototype");
    }
    return "array";
  }
  if (prototype === null) return "null-object";
  if (prototype !== Object.prototype) {
    reject(label, "must use a plain object prototype");
  }
  return "object";
}

function readDescriptors(value, kind, label) {
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    reject(label, "must contain inspectable data properties");
  }
  const keys = Reflect.ownKeys(descriptors);
  if (kind === "array") {
    const lengthDescriptor = descriptors.length;
    const length = lengthDescriptor?.value;
    if (
      !lengthDescriptor ||
      !Object.hasOwn(lengthDescriptor, "value") ||
      lengthDescriptor.enumerable ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > MAX_ARRAY_LENGTH ||
      keys.length !== length + 1
    ) {
      reject(label, "must be a dense bounded data array");
    }
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !Object.hasOwn(descriptor, "value")
      ) {
        reject(label, "must be a dense data array");
      }
    }
    if (keys.some((key) =>
      typeof key !== "string" ||
      (key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key))
    )) {
      reject(label, "must contain only indexed data");
    }
    return { descriptors, keys, length };
  }

  if (keys.length > MAX_OBJECT_KEYS || keys.some((key) =>
    typeof key !== "string"
  )) {
    reject(label, "must contain bounded string-keyed data");
  }
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, "value")
    ) {
      reject(label, "must contain enumerable data properties");
    }
  }
  return { descriptors, keys, length: null };
}

function copyGraph(value, label, requireAdmission) {
  const active = new Set();
  const nodes = [];

  function copy(candidate, path) {
    if (candidate === null) return null;
    const type = typeof candidate;
    if (type === "string" || type === "boolean") return candidate;
    if (type === "number") {
      if (!Number.isFinite(candidate) || Object.is(candidate, -0)) {
        reject(path, "must contain finite JSON numbers");
      }
      return candidate;
    }
    if (!isObject(candidate)) reject(path, "must contain JSON data");

    // This must remain the first operation on an admitted-mode object.  WeakSet
    // identity checks do not consult Proxy traps.
    if (requireAdmission && !ADMITTED_QUESTION_NODES.has(candidate)) {
      reject(path, "must be source-admitted data");
    }
    if (active.has(candidate)) reject(path, "must not contain cycles");
    if (nodes.length >= MAX_GRAPH_NODES) {
      reject(path, "exceeds the graph node bound");
    }

    const kind = readPlainKind(candidate, path);
    const { descriptors, keys, length } = readDescriptors(candidate, kind, path);
    const target = kind === "array"
      ? []
      : Object.create(kind === "null-object" ? null : Object.prototype);
    nodes.push({ kind, target });
    active.add(candidate);
    try {
      if (kind === "array") {
        for (let index = 0; index < length; index += 1) {
          Object.defineProperty(target, String(index), {
            configurable: true,
            enumerable: true,
            value: copy(
              descriptors[String(index)].value,
              path + "[" + index + "]",
            ),
            writable: true,
          });
        }
      } else {
        for (const key of keys) {
          Object.defineProperty(target, key, {
            configurable: true,
            enumerable: true,
            value: copy(descriptors[key].value, path + "." + key),
            writable: true,
          });
        }
      }
    } finally {
      active.delete(candidate);
    }
    return target;
  }

  const result = copy(value, label);
  for (const { kind, target } of nodes) {
    ADMITTED_QUESTION_NODES.add(target);
    QUESTION_NODE_PROTOTYPES.set(
      target,
      kind === "array"
        ? Array.prototype
        : kind === "null-object"
          ? null
          : Object.prototype,
    );
  }
  return result;
}

function assertAdmittedNode(candidate, path) {
  // Keep this before every other object operation, including cycle checks.
  if (!ADMITTED_QUESTION_NODES.has(candidate)) {
    reject(path, "must be source-admitted data");
  }
  const expectedPrototype = QUESTION_NODE_PROTOTYPES.get(candidate);
  let actualPrototype;
  try {
    actualPrototype = Object.getPrototypeOf(candidate);
  } catch {
    reject(path, "must have an ordinary prototype");
  }
  if (actualPrototype !== expectedPrototype) {
    reject(path, "must retain its source-admitted prototype");
  }
}

export function constructMovementQuestionGraph(value, label = "question data") {
  return copyGraph(value, label, false);
}

export function cloneMovementQuestionGraph(value, label = "question data") {
  return copyGraph(value, label, true);
}

function assertGraph(value, label, active, state) {
  if (value === null) reject(label, "must be a question graph");
  const type = typeof value;
  if (type === "string" || type === "boolean") return value;
  if (type === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      reject(label, "must contain finite JSON numbers");
    }
    return value;
  }
  if (!isObject(value)) reject(label, "must contain JSON data");

  // This is the identity admission boundary for transformed source output.
  // No prototype, descriptor, key, property, or iteration operation precedes
  // it, so an unadmitted Proxy is rejected without a callback.
  assertAdmittedNode(value, label);
  if (active.has(value)) reject(label, "must not contain cycles");
  state.count += 1;
  if (state.count > MAX_GRAPH_NODES) {
    reject(label, "exceeds the graph node bound");
  }

  const expectedPrototype = QUESTION_NODE_PROTOTYPES.get(value);
  const kind = expectedPrototype === Array.prototype
    ? "array"
    : "object";
  const { descriptors, keys, length } = readDescriptors(value, kind, label);
  active.add(value);
  try {
    if (kind === "array") {
      for (let index = 0; index < length; index += 1) {
        assertGraph(
          descriptors[String(index)].value,
          label + "[" + index + "]",
          active,
          state,
        );
      }
    } else {
      for (const key of keys) {
        assertGraph(
          descriptors[key].value,
          label + "." + key,
          active,
          state,
        );
      }
    }
  } finally {
    active.delete(value);
  }
  return value;
}

export function assertMovementQuestionGraph(value, label = "question data") {
  return assertGraph(value, label, new Set(), { count: 0 });
}

export function isMovementQuestionGraphNode(value) {
  return isObject(value) && ADMITTED_QUESTION_NODES.has(value);
}
