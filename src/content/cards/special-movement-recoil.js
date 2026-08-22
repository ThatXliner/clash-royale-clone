import {
  ARENA_LENGTH_MILLITILES,
  ARENA_WIDTH_MILLITILES,
  isPointInArena,
} from "../../sim/arena-geometry.js";
import { ProjectileCombat } from "../../sim/projectile.js";
import { validateCircle, validatePosition } from "../../sim/spatial.js";
import { createCardCatalog } from "../schema.js";

const DEFINITIONS = [{
  id: "cinderback",
  displayName: "Cinderback",
  cost: 3,
  kind: "unit",
  rarity: "standard",
  hitpoints: 304,
  damage: null,
  hitSpeedTicks: 180,
  firstHitTicks: 144,
  deployTimeTicks: 60,
  rangeMillitiles: 6000,
  sightRangeMillitiles: 8500,
  movementMillitilesPerSecond: 1500,
  targetMode: "ground-and-air",
  count: 1,
  areaDamageRadiusMillitiles: null,
  components: [],
}];

const QUESTION_PROVENANCE = Object.freeze({
  confidence: "unverified",
  disposition: "question",
  source: "unsourced-attack-recoil-fixture",
});
const QUESTION_FIXTURE_VALUES = Object.freeze({
  authoritative: false,
  boundsRule: "clamp-center-to-radius-inset-closed-arena",
  commandsResolveBeforeLaunch: true,
  confidence: "unverified",
  directionRule: "opposite-snapshotted-target-vector",
  displacementProjectionRule:
    "euclidean-components-divide-by-exact-integer-vector-length",
  disposition: "question",
  interruptionRule:
    "interrupt-at-or-before-launch-boundary-suppresses-projectile-and-recoil",
  launchBoundaryTick: 144,
  projectileDamage: 1,
  projectileRadiusMillitiles: 0,
  projectileSpeedMillitilesPerTick: 100,
  provenance: Object.freeze({
    boundsRule: QUESTION_PROVENANCE,
    commandsResolveBeforeLaunch: QUESTION_PROVENANCE,
    directionRule: QUESTION_PROVENANCE,
    displacementProjectionRule: QUESTION_PROVENANCE,
    interruptionRule: QUESTION_PROVENANCE,
    launchBoundaryTick: QUESTION_PROVENANCE,
    projectileDamage: QUESTION_PROVENANCE,
    projectileRadiusMillitiles: QUESTION_PROVENANCE,
    projectileSpeedMillitilesPerTick: QUESTION_PROVENANCE,
    recoilDistanceMillitiles: QUESTION_PROVENANCE,
    targetDeathRule: QUESTION_PROVENANCE,
    timingRule: QUESTION_PROVENANCE,
    zeroVectorRule: QUESTION_PROVENANCE,
  }),
  recoilDistanceMillitiles: 2000,
  source: "unsourced-attack-recoil-fixture",
  targetDeathRule:
    "death-after-launch-does-not-undo-recoil-or-remove-in-flight-projectile",
  timingRule: "same-boundary-immediately-after-projectile-launch",
  zeroVectorRule: "reject-undefined-direction",
});

const ACTOR_ID = 101;
const TARGET_ID = 202;
const KILL_SOURCE_ID = 303;
const ACTOR_RADIUS = 400;
const TARGET_HEALTH = 1000;
const SCENARIOS = Object.freeze({
  edge: Object.freeze({
    encounter: "edge-clamped-attack-recoil-v1",
    actorPosition: Object.freeze({ x: 500, y: 500 }),
    targetPosition: Object.freeze({ x: 3500, y: 4500 }),
  }),
  open: Object.freeze({
    encounter: "open-attack-recoil-v1",
    actorPosition: Object.freeze({ x: 5000, y: 6000 }),
    targetPosition: Object.freeze({ x: 8000, y: 10000 }),
  }),
});
const SETUP_KEYS = ["commands", "scenario"];
const COMMAND_KEYS = ["tick", "type"];
const COMMAND_TYPES = new Set(["interrupt", "target-killed"]);
const SNAPSHOT_KEYS = ["identity", "tick", "version"];
const SNAPSHOT_IDENTITY_KEYS = ["commands", "encounter", "scenario"];
const MAX_COMMANDS = 1;
const MAX_SNAPSHOT_BYTES = 4096;
const MIN_SAFE_INTEGER_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const IMPACT_TICK =
  QUESTION_FIXTURE_VALUES.launchBoundaryTick +
  50;
const MAX_TICK = IMPACT_TICK + 2;

const QUESTION_GRAPH_NODES = new WeakSet();
const QUESTION_GRAPH_PROTOTYPES = new WeakMap();
const MAX_QUESTION_GRAPH_NODES = 4096;

function questionGraphError(label, message) {
  throw new TypeError(`${label} ${message}`);
}

function copyQuestionGraph(source, label) {
  const active = new Set();
  const nodes = [];
  function copy(value, path) {
    if (value === null) return null;
    const type = typeof value;
    if (type === "string" || type === "boolean") return value;
    if (type === "number") {
      if (!Number.isFinite(value) || Object.is(value, -0)) {
        questionGraphError(path, "must contain finite JSON numbers");
      }
      return value;
    }
    if (type !== "object") questionGraphError(path, "must contain JSON data");
    if (active.has(value)) questionGraphError(path, "must not contain cycles");
    if (nodes.length >= MAX_QUESTION_GRAPH_NODES) {
      questionGraphError(path, "exceeds the graph node bound");
    }
    let isArray;
    let prototype;
    let descriptors;
    try {
      isArray = Array.isArray(value);
      prototype = Object.getPrototypeOf(value);
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      questionGraphError(path, "must contain inspectable data");
    }
    const ownKeys = Reflect.ownKeys(descriptors);
    let keys;
    if (isArray) {
      const lengthDescriptor = descriptors.length;
      const length = lengthDescriptor?.value;
      if (
        prototype !== Array.prototype ||
        !lengthDescriptor ||
        !Object.hasOwn(lengthDescriptor, "value") ||
        lengthDescriptor.enumerable ||
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > 128 ||
        ownKeys.length !== length + 1
      ) {
        questionGraphError(path, "must be a dense bounded data array");
      }
      keys = Array.from({ length }, (_, index) => String(index));
      if (ownKeys.some((key) => key !== "length" && !keys.includes(key))) {
        questionGraphError(path, "must contain only indexed data");
      }
    } else {
      if (prototype !== Object.prototype && prototype !== null) {
        questionGraphError(path, "must use a plain object prototype");
      }
      keys = ownKeys;
      if (keys.some((key) => typeof key !== "string")) {
        questionGraphError(path, "must contain only string data keys");
      }
    }
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !Object.hasOwn(descriptor, "value")
      ) {
        questionGraphError(path, "must contain enumerable data properties");
      }
    }
    const target = isArray
      ? []
      : prototype === null ? Object.create(null) : {};
    nodes.push({ prototype: isArray ? Array.prototype : prototype, target });
    active.add(value);
    try {
      for (const key of keys) {
        Object.defineProperty(target, key, {
          configurable: true,
          enumerable: true,
          value: copy(descriptors[key].value, `${path}.${key}`),
          writable: true,
        });
      }
    } finally {
      active.delete(value);
    }
    return target;
  }
  const result = copy(source, label);
  for (const { prototype, target } of nodes) {
    QUESTION_GRAPH_NODES.add(target);
    QUESTION_GRAPH_PROTOTYPES.set(target, prototype);
  }
  return result;
}

function inspectQuestionNode(value, label, requireFrozen) {
  if (!QUESTION_GRAPH_NODES.has(value)) {
    questionGraphError(label, "must be source-admitted data");
  }
  if (requireFrozen && !Object.isFrozen(value)) {
    questionGraphError(label, "must be deeply frozen source data");
  }
  const expectedPrototype = QUESTION_GRAPH_PROTOTYPES.get(value);
  let actualPrototype;
  let descriptors;
  try {
    actualPrototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    questionGraphError(label, "must contain inspectable data");
  }
  if (actualPrototype !== expectedPrototype) {
    questionGraphError(label, "must retain its source-admitted prototype");
  }
  const ownKeys = Reflect.ownKeys(descriptors);
  if (expectedPrototype === Array.prototype) {
    const lengthDescriptor = descriptors.length;
    const length = lengthDescriptor?.value;
    if (
      !lengthDescriptor ||
      !Object.hasOwn(lengthDescriptor, "value") ||
      lengthDescriptor.enumerable ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > 128 ||
      ownKeys.length !== length + 1
    ) {
      questionGraphError(label, "must be a dense bounded data array");
    }
    const keys = Array.from({ length }, (_, index) => String(index));
    if (ownKeys.some((key) => key !== "length" && !keys.includes(key))) {
      questionGraphError(label, "must contain only indexed data");
    }
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
        questionGraphError(label, "must contain dense data properties");
      }
    }
    return keys;
  }
  if (ownKeys.some((key) => typeof key !== "string")) {
    questionGraphError(label, "must contain only string data keys");
  }
  for (const key of ownKeys) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      questionGraphError(label, "must contain enumerable data properties");
    }
  }
  return ownKeys;
}

function assertQuestionGraph(value, label = "QUESTION graph", requireFrozen = false) {
  if (value === null || typeof value !== "object") {
    questionGraphError(label, "must be a source-admitted graph");
  }
  const active = new Set();
  let count = 0;
  function visit(candidate, path) {
    if (candidate === null) return;
    const type = typeof candidate;
    if (type === "string" || type === "boolean") return;
    if (type === "number") {
      if (!Number.isFinite(candidate) || Object.is(candidate, -0)) {
        questionGraphError(path, "must contain finite JSON numbers");
      }
      return;
    }
    if (type !== "object") questionGraphError(path, "must contain JSON data");
    const keys = inspectQuestionNode(candidate, path, requireFrozen);
    if (active.has(candidate)) questionGraphError(path, "must not contain cycles");
    count += 1;
    if (count > MAX_QUESTION_GRAPH_NODES) {
      questionGraphError(path, "exceeds the graph node bound");
    }
    active.add(candidate);
    try {
      for (const key of keys) {
        visit(
          Object.getOwnPropertyDescriptor(candidate, key).value,
          `${path}.${key}`,
        );
      }
    } finally {
      active.delete(candidate);
    }
  }
  visit(value, label);
  return value;
}

function recursivelyFreezeQuestionGraph(value, label) {
  assertQuestionGraph(value, label);
  const active = new Set();
  function freezeNode(candidate) {
    if (candidate === null || typeof candidate !== "object" || active.has(candidate)) return;
    active.add(candidate);
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (key !== "length") freezeNode(descriptors[key].value);
    }
    Object.freeze(candidate);
    active.delete(candidate);
  }
  freezeNode(value);
  return value;
}

function createQuestionFixtureDraft() {
  return copyQuestionGraph(QUESTION_FIXTURE_VALUES, "QUESTION fixture");
}

export function assertRecoilQuestionGraph(value, label = "recoil question graph") {
  return assertQuestionGraph(value, label, true);
}


function clone(value) {
  if (value === QUESTION_FIXTURE_VALUES) {
    return createQuestionFixtureDraft();
  }
  return JSON.parse(JSON.stringify(value));
}

function questionFixtureDraft() {
  return clone(QUESTION_FIXTURE_VALUES);
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactRecord(value, keys, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
  ) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== keys.length ||
    actual.some((key) => (
      typeof key !== "string" ||
      !keys.includes(key) ||
      !descriptors[key].enumerable ||
      !Object.hasOwn(descriptors[key], "value")
    ))
  ) {
    throw new TypeError(`${label} has an invalid shape`);
  }
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function denseCommands(value) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > MAX_COMMANDS
  ) {
    throw new TypeError("recoil commands must be a bounded plain array");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).length !== value.length + 1 ||
    Array.from({ length: value.length }, (_, index) => index).some(
      (index) => (
        !descriptors[index]?.enumerable ||
        !Object.hasOwn(descriptors[index], "value")
      ),
    )
  ) {
    throw new TypeError("recoil commands must contain dense data properties");
  }
  return Array.from(
    { length: value.length },
    (_, index) => descriptors[index].value,
  );
}

function checkedCommands(value) {
  return denseCommands(value).map((entry, index) => {
    const command = exactRecord(entry, COMMAND_KEYS, `recoil command ${index}`);
    if (!COMMAND_TYPES.has(command.type)) {
      throw new TypeError(`recoil command ${index}.type is invalid`);
    }
    if (!Number.isSafeInteger(command.tick) || command.tick < 0) {
      throw new TypeError(`recoil command ${index}.tick is invalid`);
    }
    if (
      command.type === "interrupt" &&
      command.tick > QUESTION_FIXTURE_VALUES.launchBoundaryTick
    ) {
      throw new TypeError("recoil interruption must not follow attack launch");
    }
    if (
      command.type === "target-killed" &&
      (
        command.tick <= QUESTION_FIXTURE_VALUES.launchBoundaryTick ||
        command.tick >= IMPACT_TICK
      )
    ) {
      throw new TypeError(
        "recoil target death must occur after launch and before impact",
      );
    }
    return { tick: command.tick, type: command.type };
  });
}

function checkedSetup(value) {
  const setup = exactRecord(value, SETUP_KEYS, "recoil setup");
  if (typeof setup.scenario !== "string" || !Object.hasOwn(SCENARIOS, setup.scenario)) {
    throw new TypeError("recoil setup.scenario is invalid");
  }
  return {
    commands: checkedCommands(setup.commands),
    scenario: setup.scenario,
  };
}

function integerSquareRoot(value) {
  if (value < 0n) throw new RangeError("square root input must be non-negative");
  if (value < 2n) return value;
  let current = value;
  let next = (current + value / current) / 2n;
  while (next < current) {
    current = next;
    next = (current + value / current) / 2n;
  }
  return current;
}

function checkedDistance(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(
      "recoil distance must be one positive safe integer millitile value",
    );
  }
  return value;
}

function assertSafeIntegerBigInts(entries) {
  for (const [label, value] of entries) {
    if (
      value < MIN_SAFE_INTEGER_BIGINT ||
      value > MAX_SAFE_INTEGER_BIGINT
    ) {
      throw new RangeError(`${label} exceeds the safe integer range`);
    }
  }
}

/**
 * Returns the isolated original Cinderback definition. The common corpus does
 * not encode its recoil mechanic; test-only comparison owns benchmark mapping.
 */
export function createRecoilSpecialCatalog() {
  return createCardCatalog(DEFINITIONS);
}

/**
 * Creates the only caller-controlled encounter inputs: one fixed scenario and
 * at most one bounded causal event.
 */
export function createRecoilSpecialFixture(
  commands = [],
  scenario = "open",
) {
  return clone(checkedSetup({ commands, scenario }));
}

/** Returns every unsourced recoil/composition assumption as a QUESTION value. */
export function createRecoilQuestionFixture(...args) {
  if (args.length !== 0) {
    throw new TypeError("recoil question fixture does not accept overrides");
  }
  return recursivelyFreezeQuestionGraph(
    questionFixtureDraft(),
    "recoil question fixture",
  );
}

/**
 * Pure recoil projection and arena-boundary evaluator.
 *
 * Direction snapshots the target vector and negates it. Integer component
 * projection divides by the exact integer vector length; non-integral vector
 * lengths are rejected instead of implying an unrecorded rounding policy.
 * The unit center is clamped to the radius-inset closed arena.
 */
export function evaluateRecoilQuestionBoundary(
  originValue,
  targetValue,
  radiusValue,
  distanceValue = QUESTION_FIXTURE_VALUES.recoilDistanceMillitiles,
  ...extra
) {
  if (extra.length !== 0) {
    throw new TypeError("recoil boundary evaluator received extra arguments");
  }
  const origin = validatePosition(originValue, "recoil origin");
  const target = validatePosition(targetValue, "recoil target");
  const circle = validateCircle(
    { position: origin, radius: radiusValue },
    "recoil actor circle",
  );
  const distance = checkedDistance(distanceValue);
  if (
    circle.radius > ARENA_WIDTH_MILLITILES / 2 ||
    circle.radius > ARENA_LENGTH_MILLITILES / 2 ||
    !isPointInArena(origin) ||
    !isPointInArena(target) ||
    origin.x < circle.radius ||
    origin.x > ARENA_WIDTH_MILLITILES - circle.radius ||
    origin.y < circle.radius ||
    origin.y > ARENA_LENGTH_MILLITILES - circle.radius
  ) {
    throw new RangeError(
      "recoil actor circle and target must fit in the arena",
    );
  }
  const dx = BigInt(target.x) - BigInt(origin.x);
  const dy = BigInt(target.y) - BigInt(origin.y);
  const squared = dx * dx + dy * dy;
  if (squared === 0n) {
    throw new RangeError("recoil direction is undefined for a zero target vector");
  }
  const vectorLength = integerSquareRoot(squared);
  if (vectorLength * vectorLength !== squared) {
    throw new RangeError(
      "recoil target vector length must be an exact integer millitile value",
    );
  }
  const scale = BigInt(distance);
  if ((dx * scale) % vectorLength !== 0n || (dy * scale) % vectorLength !== 0n) {
    throw new RangeError(
      "recoil projection must produce exact integer millitile components",
    );
  }
  const displacementX = (-dx * scale) / vectorLength;
  const displacementY = (-dy * scale) / vectorLength;
  const unclampedX = BigInt(origin.x) + displacementX;
  const unclampedY = BigInt(origin.y) + displacementY;
  assertSafeIntegerBigInts([
    ["recoil displacement.x", displacementX],
    ["recoil displacement.y", displacementY],
    ["recoil unclamped.x", unclampedX],
    ["recoil unclamped.y", unclampedY],
  ]);
  const displacement = {
    x: Number(displacementX),
    y: Number(displacementY),
  };
  const unclamped = {
    x: Number(unclampedX),
    y: Number(unclampedY),
  };
  const position = {
    x: Math.max(
      circle.radius,
      Math.min(ARENA_WIDTH_MILLITILES - circle.radius, unclamped.x),
    ),
    y: Math.max(
      circle.radius,
      Math.min(ARENA_LENGTH_MILLITILES - circle.radius, unclamped.y),
    ),
  };
  return {
    clamped: position.x !== unclamped.x || position.y !== unclamped.y,
    displacement,
    origin,
    position,
    radius: circle.radius,
    snapshottedTargetPosition: target,
    unclamped,
  };
}

function projectileSetup(scenario) {
  const identity = SCENARIOS[scenario];
  const common = {
    attackRange: 6000,
    kind: "troop",
    layer: "ground",
    radius: 0,
    targetMode: "air_and_ground",
    targetable: true,
  };
  return {
    entities: [
      {
        ...common,
        id: ACTOR_ID,
        maxHealth: 304,
        position: { ...identity.actorPosition },
        radius: ACTOR_RADIUS,
      },
      {
        ...common,
        attackRange: 0,
        id: TARGET_ID,
        maxHealth: TARGET_HEALTH,
        position: { ...identity.targetPosition },
      },
      {
        ...common,
        attackRange: 1,
        id: KILL_SOURCE_ID,
        maxHealth: 1,
        position: { ...identity.targetPosition },
      },
    ],
  };
}

function fixedIdentity(commands, scenario) {
  return {
    commands: commands.map((command) => ({ ...command })),
    encounter: SCENARIOS[scenario].encounter,
    scenario,
  };
}

/**
 * One original attack-triggered recoil slice. The shared ProjectileCombat
 * snapshots and launches first; recoil then evaluates against the same target
 * snapshot and never mutates the in-flight projectile. Commands resolve first.
 *
 * This is not an authoritative recoil-value, projectile travel/damage, moving
 * target, retargeting, collision/obstacle, animation, footage, knockback,
 * charge, dash, jump, repeated-attack, or general recoil claim.
 */
export class RecoilEncounter {
  #combat;
  #commands;
  #commandIndex = 0;
  #history = [];
  #position;
  #scenario;
  #terminal = false;
  #tick = 0;

  constructor(setup = createRecoilSpecialFixture()) {
    const checked = checkedSetup(setup);
    this.#commands = checked.commands;
    this.#scenario = checked.scenario;
    this.#position = { ...SCENARIOS[this.#scenario].actorPosition };
    this.#combat = new ProjectileCombat(projectileSetup(this.#scenario));
  }

  get replay() {
    return clone(this.#history);
  }

  get state() {
    return clone({
      phase: this.#terminal
        ? "terminal"
        : this.#tick <= QUESTION_FIXTURE_VALUES.launchBoundaryTick
          ? "winding-up"
          : "projectile-in-flight",
      position: this.#position,
      projectileState: this.#combat.state,
      scenario: this.#scenario,
      terminal: this.#terminal,
      tick: this.#tick,
    });
  }

  step() {
    if (this.#terminal || this.#tick >= MAX_TICK) return [];
    const boundary = this.#tick;
    const events = [];
    const command = this.#commands[this.#commandIndex];

    if (command?.tick === boundary) {
      this.#commandIndex += 1;
      if (command.type === "interrupt") {
        this.#terminal = true;
        events.push({
          position: { ...this.#position },
          tick: boundary,
          type: "attack-interrupted",
        });
      } else {
        const projectile = this.#combat.launch({
          attackerId: KILL_SOURCE_ID,
          damage: TARGET_HEALTH,
          radius: 0,
          speed: 1,
          targetId: TARGET_ID,
          tick: boundary,
        });
        events.push({
          projectile: { ...projectile },
          tick: boundary,
          type: "target-kill-projectile-launched",
        });
      }
    }

    if (
      !this.#terminal &&
      boundary === QUESTION_FIXTURE_VALUES.launchBoundaryTick
    ) {
      const targetPosition = SCENARIOS[this.#scenario].targetPosition;
      const projectile = this.#combat.launch({
        attackerId: ACTOR_ID,
        damage: QUESTION_FIXTURE_VALUES.projectileDamage,
        radius: QUESTION_FIXTURE_VALUES.projectileRadiusMillitiles,
        speed: QUESTION_FIXTURE_VALUES.projectileSpeedMillitilesPerTick,
        targetId: TARGET_ID,
        tick: boundary,
      });
      events.push({
        projectile: { ...projectile },
        tick: boundary,
        type: "attack-projectile-launched",
      });
      const recoil = evaluateRecoilQuestionBoundary(
        this.#position,
        targetPosition,
        ACTOR_RADIUS,
      );
      this.#position = { ...recoil.position };
      events.push({
        clamped: recoil.clamped,
        displacement: { ...recoil.displacement },
        from: { ...recoil.origin },
        snapshottedTargetPosition: { ...recoil.snapshottedTargetPosition },
        tick: boundary,
        to: { ...recoil.position },
        type: "attack-recoil",
        unclamped: { ...recoil.unclamped },
      });
    }

    const projectileEvents = this.#combat.step(boundary);
    events.push(...projectileEvents.map((event) => ({
      ...event,
      type: `projectile-${event.type}`,
    })));
    if (
      projectileEvents.some(
        (event) => event.type === "impact" && event.projectileId === 1,
      )
    ) {
      this.#terminal = true;
      events.push({ tick: boundary, type: "encounter-complete" });
    }

    this.#tick += 1;
    this.#history.push(...events);
    return clone(events);
  }

  stepMany(ticks) {
    if (!Number.isSafeInteger(ticks) || ticks < 0) {
      throw new TypeError("recoil ticks must be a non-negative safe integer");
    }
    const events = [];
    for (
      let index = 0;
      index < ticks && !this.#terminal && this.#tick < MAX_TICK;
      index += 1
    ) {
      events.push(...this.step());
    }
    return events;
  }

  run(tickLimit = MAX_TICK) {
    if (!Number.isSafeInteger(tickLimit) || tickLimit < 0) {
      throw new TypeError("recoil tick limit must be a non-negative safe integer");
    }
    if (tickLimit > MAX_TICK) {
      throw new RangeError("recoil tick limit exceeds its bound");
    }
    while (!this.#terminal && this.#tick < tickLimit) this.step();
    return this.state;
  }

  serialize() {
    const serialized = canonicalJson({
      identity: fixedIdentity(this.#commands, this.#scenario),
      tick: this.#tick,
      version: 1,
    });
    if (serialized.length > MAX_SNAPSHOT_BYTES) {
      throw new RangeError("recoil snapshot exceeds its size bound");
    }
    return serialized;
  }

  static restore(serialized) {
    if (typeof serialized !== "string") {
      throw new TypeError("recoil snapshot must be a string");
    }
    if (serialized.length > MAX_SNAPSHOT_BYTES) {
      throw new RangeError("recoil snapshot exceeds its size bound");
    }
    let snapshot;
    try {
      snapshot = JSON.parse(serialized);
    } catch {
      throw new TypeError("recoil snapshot must be valid JSON");
    }
    const checked = exactRecord(snapshot, SNAPSHOT_KEYS, "recoil snapshot");
    if (checked.version !== 1) {
      throw new TypeError("recoil snapshot version is unsupported");
    }
    if (
      !Number.isSafeInteger(checked.tick) ||
      checked.tick < 0 ||
      checked.tick > MAX_TICK
    ) {
      throw new TypeError("recoil snapshot.tick is invalid");
    }
    const identity = exactRecord(
      checked.identity,
      SNAPSHOT_IDENTITY_KEYS,
      "recoil snapshot.identity",
    );
    if (
      typeof identity.scenario !== "string" ||
      !Object.hasOwn(SCENARIOS, identity.scenario) ||
      identity.encounter !== SCENARIOS[identity.scenario].encounter
    ) {
      throw new TypeError("recoil snapshot identity is unsupported");
    }
    const encounter = new RecoilEncounter({
      commands: checkedCommands(identity.commands),
      scenario: identity.scenario,
    });
    encounter.stepMany(checked.tick);
    if (encounter.#tick !== checked.tick) {
      throw new TypeError("recoil snapshot contains post-terminal time");
    }
    return encounter;
  }
}
