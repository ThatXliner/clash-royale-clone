import { AreaDamageSystem } from "../../sim/area-damage.js";
import { acquireTarget } from "../../sim/targeting.js";
import { validatePosition } from "../../sim/spatial.js";
import { createCardCatalog } from "../schema.js";

const DEFINITIONS = [
  {
    id: "stonevault",
    displayName: "Stonevault",
    cost: 7,
    kind: "unit",
    rarity: "mythic",
    hitpoints: 3993,
    damage: 268,
    hitSpeedTicks: 102,
    firstHitTicks: 72,
    deployTimeTicks: 60,
    rangeMillitiles: 1200,
    sightRangeMillitiles: 5500,
    movementMillitilesPerSecond: 1000,
    targetMode: "ground",
    count: 1,
    areaDamageRadiusMillitiles: 1300,
    components: [],
  },
];

const QUESTION_PROVENANCE = Object.freeze({
  confidence: "unverified",
  disposition: "question",
  source: "unsourced-targeted-jump-fixture",
});
const QUESTION_FIXTURE_VALUES = Object.freeze({
  authoritative: false,
  commandsResolveBeforeMovement: true,
  confidence: "unverified",
  destinationRule: "snapshot-at-takeoff",
  disposition: "question",
  inclusiveTriggerBoundary: true,
  interpolationRule: "integer-truncate-toward-zero",
  interruptionRule: "cancel-at-last-completed-position-without-impact",
  landingDamage: 536,
  landingMode: "ground",
  landingRadiusMillitiles: 1300,
  provenance: Object.freeze({
    commandsResolveBeforeMovement: QUESTION_PROVENANCE,
    destinationRule: QUESTION_PROVENANCE,
    inclusiveTriggerBoundary: QUESTION_PROVENANCE,
    interpolationRule: QUESTION_PROVENANCE,
    interruptionRule: QUESTION_PROVENANCE,
    landingDamage: QUESTION_PROVENANCE,
    landingMode: QUESTION_PROVENANCE,
    landingRadiusMillitiles: QUESTION_PROVENANCE,
    targetDeathRule: QUESTION_PROVENANCE,
    transitTicks: QUESTION_PROVENANCE,
    triggerMaximumMillitiles: QUESTION_PROVENANCE,
    triggerMinimumMillitiles: QUESTION_PROVENANCE,
    untargetableDuringTransit: QUESTION_PROVENANCE,
  }),
  source: "unsourced-targeted-jump-fixture",
  targetDeathRule:
    "cancel-before-takeoff; continue-to-snapshot-after-takeoff-and-exclude-dead-target",
  transitTicks: 36,
  triggerMaximumMillitiles: 5000,
  triggerMinimumMillitiles: 3500,
  untargetableDuringTransit: true,
});

const IDENTITY = Object.freeze({
  encounter: "northbound-landing-jump-v1",
  target: Object.freeze({
    hitpoints: 1000,
    id: 202,
    kind: "troop",
    layer: "ground",
    position: Object.freeze({ x: 3500, y: 15500 }),
    radius: 0,
  }),
  unit: Object.freeze({
    id: 101,
    position: Object.freeze({ x: 3500, y: 11500 }),
    radius: 0,
  }),
});

const LANDING_CANDIDATES = Object.freeze([
  IDENTITY.target,
  Object.freeze({
    hitpoints: 536,
    id: 203,
    kind: "troop",
    layer: "ground",
    position: Object.freeze({ x: 4800, y: 15500 }),
    radius: 0,
  }),
  Object.freeze({
    hitpoints: 1000,
    id: 204,
    kind: "troop",
    layer: "ground",
    position: Object.freeze({ x: 4801, y: 15500 }),
    radius: 0,
  }),
  Object.freeze({
    hitpoints: 1000,
    id: 205,
    kind: "troop",
    layer: "air",
    position: Object.freeze({ x: 3500, y: 15500 }),
    radius: 0,
  }),
  Object.freeze({
    hitpoints: 1000,
    id: 206,
    kind: "troop",
    layer: "ground",
    position: Object.freeze({ x: 3500, y: 15500 }),
    radius: 0,
    targetable: false,
  }),
  Object.freeze({
    hitpoints: 536,
    id: 207,
    kind: "structure",
    layer: "ground",
    position: Object.freeze({ x: 4800, y: 15500 }),
    radius: 0,
  }),
]);

const COMMAND_KEYS = ["tick", "type"];
const COMMAND_TYPES = new Set(["interrupt", "target-killed", "target-lost"]);
const SETUP_KEYS = ["commands"];
const SNAPSHOT_KEYS = ["identity", "tick", "version"];
const SNAPSHOT_IDENTITY_KEYS = ["commands", "encounter"];
const MAX_COMMANDS = 1;
const MAX_SNAPSHOT_BYTES = 4096;
const MAX_TICK = 120;
const TAKEOFF_TICK = 60;
const LANDING_TICK = TAKEOFF_TICK + QUESTION_FIXTURE_VALUES.transitTicks;

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

export function assertJumpQuestionGraph(value, label = "jump question graph") {
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
    throw new TypeError("jump commands must be a bounded plain array");
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
    throw new TypeError("jump commands must contain dense data properties");
  }
  return Array.from(
    { length: value.length },
    (_, index) => descriptors[index].value,
  );
}

function checkedCommands(value) {
  return denseCommands(value).map((entry, index) => {
    const command = exactRecord(entry, COMMAND_KEYS, `jump command ${index}`);
    if (
      !Number.isSafeInteger(command.tick) ||
      command.tick < 0 ||
      command.tick > LANDING_TICK
    ) {
      throw new TypeError(`jump command ${index}.tick is outside the encounter`);
    }
    if (!COMMAND_TYPES.has(command.type)) {
      throw new TypeError(`jump command ${index}.type is invalid`);
    }
    if (command.type === "target-lost" && command.tick > TAKEOFF_TICK) {
      throw new TypeError("target-lost must causally precede jump takeoff");
    }
    if (command.type === "interrupt" && command.tick < TAKEOFF_TICK) {
      throw new TypeError(
        "interrupt must causally occur at takeoff or during jump transit",
      );
    }
    return { tick: command.tick, type: command.type };
  });
}

function checkedSetup(value) {
  const setup = exactRecord(value, SETUP_KEYS, "jump setup");
  return { commands: checkedCommands(setup.commands) };
}

function fixedIdentity(commands) {
  return {
    commands: commands.map((command) => ({ ...command })),
    encounter: IDENTITY.encounter,
  };
}

function interpolatePosition(from, to, elapsed, total) {
  const checkedFrom = validatePosition(from, "jump interpolation start");
  const checkedTo = validatePosition(to, "jump interpolation end");
  return {
    x: checkedFrom.x + Number(
      (BigInt(checkedTo.x - checkedFrom.x) * BigInt(elapsed)) / BigInt(total),
    ),
    y: checkedFrom.y + Number(
      (BigInt(checkedTo.y - checkedFrom.y) * BigInt(elapsed)) / BigInt(total),
    ),
  };
}

function candidateState(candidate, targetAlive) {
  return {
    alive: candidate.id === IDENTITY.target.id ? targetAlive : true,
    id: candidate.id,
    kind: candidate.kind,
    layer: candidate.layer,
    position: { ...candidate.position },
    radius: candidate.radius,
    targetable: candidate.targetable ?? true,
  };
}

/**
 * Returns the isolated original Stonevault definition. Its benchmark-backed
 * numbers are comparison questions wherever the research corpus marks them
 * unverified.
 */
export function createJumpSpecialCatalog() {
  return createCardCatalog(DEFINITIONS);
}

/**
 * Creates the only caller-controlled input: at most one bounded causal event.
 * Mechanics, identities, geometry, health, and timing cannot be overridden.
 */
export function createJumpSpecialFixture(commands = []) {
  return clone(checkedSetup({ commands }));
}

/**
 * Returns every unsourced jump-only assumption as an isolated QUESTION value.
 */
function createJumpQuestionFixtureUnwrapped(...args) {
  if (args.length !== 0) {
    throw new TypeError("jump question fixture does not accept overrides");
  }
  return recursivelyFreezeQuestionGraph(
    questionFixtureDraft(),
    "jump question fixture",
  );
}

const createJumpQuestionFixture = createJumpQuestionFixtureUnwrapped;
export { createJumpQuestionFixture };
export const MOVEMENT_QUESTION_FACTORY_AUTHORITY = Object.freeze({
  assertGraph: assertJumpQuestionGraph,
  factory: createJumpQuestionFixtureUnwrapped,
});

/**
 * Pure exact evaluator for the inclusive QUESTION trigger interval.
 */
export function evaluateJumpQuestionBoundary(distanceMillitiles, ...extra) {
  if (
    extra.length !== 0 ||
    !Number.isSafeInteger(distanceMillitiles) ||
    distanceMillitiles < 0
  ) {
    throw new TypeError(
      "jump boundary distance must be one non-negative safe integer",
    );
  }
  return {
    eligible:
      distanceMillitiles >= QUESTION_FIXTURE_VALUES.triggerMinimumMillitiles &&
      distanceMillitiles <= QUESTION_FIXTURE_VALUES.triggerMaximumMillitiles,
    triggerMaximumMillitiles:
      QUESTION_FIXTURE_VALUES.triggerMaximumMillitiles,
    triggerMinimumMillitiles:
      QUESTION_FIXTURE_VALUES.triggerMinimumMillitiles,
  };
}

/**
 * A narrow fixed jump-transit and landing-area QUESTION fixture. Commands
 * resolve before takeoff, movement, and landing. The destination is captured
 * at takeoff; integer interpolation truncates toward zero; the jumper is
 * untargetable only in transit. Interruption stops at the last completed
 * position without impact. Target death before takeoff cancels; death after
 * takeoff preserves the destination and excludes that dead target from the
 * shared AreaDamageSystem landing batch.
 *
 * This is not an authoritative jump-value, charge, dash, recoil, collision,
 * arc/height, animation, footage, pathfinding, knockback, retargeting, deploy
 * impact, or ordinary-attack claim.
 */
export class JumpEncounter {
  #area;
  #card;
  #commands;
  #commandIndex = 0;
  #history = [];
  #jump = null;
  #position = { ...IDENTITY.unit.position };
  #targetAlive = true;
  #targetId = null;
  #targetable = true;
  #terminal = false;
  #tick = 0;

  constructor(setup = createJumpSpecialFixture()) {
    const checked = checkedSetup(setup);
    this.#commands = checked.commands;
    this.#card = createJumpSpecialCatalog()[0];
    this.#area = new AreaDamageSystem();
    for (const candidate of LANDING_CANDIDATES) {
      this.#area.add(candidate.id, candidate.hitpoints);
    }
  }

  get replay() {
    return clone(this.#history);
  }

  get state() {
    return clone({
      airborne: this.#jump !== null,
      candidateHealth: Object.fromEntries(
        LANDING_CANDIDATES.map((candidate) => [
          candidate.id,
          candidate.id === IDENTITY.target.id && !this.#targetAlive
            ? 0
            : this.#area.get(candidate.id).currentHealth,
        ]),
      ),
      jump: this.#jump,
      phase: this.#terminal
        ? "terminal"
        : this.#jump !== null
          ? "transit"
          : this.#tick < this.#card.deployTimeTicks
            ? "deploying"
            : "ready",
      position: this.#position,
      targetAlive: this.#targetAlive,
      targetId: this.#targetId,
      targetable: this.#targetable,
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
      if (command.type === "target-lost") {
        this.#targetId = null;
        this.#terminal = true;
        events.push({
          reason: "target-lost-before-takeoff",
          targetId: IDENTITY.target.id,
          tick: boundary,
          type: "jump-cancelled",
        });
      } else if (command.type === "target-killed") {
        this.#targetAlive = false;
        events.push({
          targetId: IDENTITY.target.id,
          tick: boundary,
          type: "target-died",
        });
        if (boundary <= TAKEOFF_TICK) {
          this.#terminal = true;
          events.push({
            reason: "target-killed-before-takeoff",
            targetId: IDENTITY.target.id,
            tick: boundary,
            type: "jump-cancelled",
          });
        }
      } else {
        const phase = this.#jump === null ? "pretakeoff" : "transit";
        this.#jump = null;
        this.#targetable = true;
        this.#terminal = true;
        events.push({
          phase,
          position: { ...this.#position },
          tick: boundary,
          type: "jump-interrupted",
        });
        if (phase === "transit") {
          events.push({
            targetable: true,
            tick: boundary,
            type: "targetability-changed",
          });
        }
      }
    }

    if (!this.#terminal && boundary === 0) {
      const selected = acquireTarget(
        { position: this.#position, radius: IDENTITY.unit.radius },
        [candidateState(IDENTITY.target, this.#targetAlive)],
        {
          mode: "ground",
          sightRange: this.#card.sightRangeMillitiles,
        },
      );
      this.#targetId = selected?.id ?? null;
      if (selected !== null) {
        events.push({
          targetId: selected.id,
          tick: boundary,
          type: "target-acquired",
        });
      }
    }

    if (!this.#terminal && boundary === TAKEOFF_TICK) {
      const distance = Math.abs(
        IDENTITY.target.position.x - this.#position.x,
      ) + Math.abs(IDENTITY.target.position.y - this.#position.y);
      if (
        this.#targetId === null ||
        !this.#targetAlive ||
        !evaluateJumpQuestionBoundary(distance).eligible
      ) {
        this.#terminal = true;
        events.push({
          reason: "no-eligible-target",
          tick: boundary,
          type: "jump-cancelled",
        });
      } else {
        this.#jump = {
          elapsedTicks: 0,
          from: { ...this.#position },
          targetId: this.#targetId,
          to: { ...IDENTITY.target.position },
        };
        this.#targetable = false;
        events.push({
          from: { ...this.#jump.from },
          targetId: this.#jump.targetId,
          tick: boundary,
          to: { ...this.#jump.to },
          type: "jump-takeoff",
        });
        events.push({
          targetable: false,
          tick: boundary,
          type: "targetability-changed",
        });
      }
    }

    if (
      !this.#terminal &&
      this.#jump !== null &&
      boundary > TAKEOFF_TICK
    ) {
      this.#jump.elapsedTicks += 1;
      this.#position = interpolatePosition(
        this.#jump.from,
        this.#jump.to,
        this.#jump.elapsedTicks,
        QUESTION_FIXTURE_VALUES.transitTicks,
      );
      events.push({
        elapsedTicks: this.#jump.elapsedTicks,
        position: { ...this.#position },
        tick: boundary,
        type: "jump-move",
      });
      if (
        this.#jump.elapsedTicks === QUESTION_FIXTURE_VALUES.transitTicks
      ) {
        const targetId = this.#jump.targetId;
        this.#jump = null;
        this.#targetable = true;
        events.push({
          targetable: true,
          tick: boundary,
          type: "targetability-changed",
        });
        events.push({
          position: { ...this.#position },
          targetId,
          tick: boundary,
          type: "jump-landed",
        });
        const result = this.#area.resolve({
          center: { ...this.#position },
          damage: QUESTION_FIXTURE_VALUES.landingDamage,
          mode: QUESTION_FIXTURE_VALUES.landingMode,
          radius: QUESTION_FIXTURE_VALUES.landingRadiusMillitiles,
          tick: boundary,
        }, LANDING_CANDIDATES.map((candidate) =>
          candidateState(candidate, this.#targetAlive)
        ));
        events.push(...result.events);
        this.#terminal = true;
        events.push({ tick: boundary, type: "encounter-complete" });
      }
    }

    this.#tick += 1;
    this.#history.push(...events);
    return clone(events);
  }

  stepMany(ticks) {
    if (!Number.isSafeInteger(ticks) || ticks < 0) {
      throw new TypeError("jump ticks must be a non-negative safe integer");
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
      throw new TypeError("jump tick limit must be a non-negative safe integer");
    }
    if (tickLimit > MAX_TICK) {
      throw new RangeError("jump tick limit exceeds its bound");
    }
    while (!this.#terminal && this.#tick < tickLimit) this.step();
    return this.state;
  }

  serialize() {
    const serialized = canonicalJson({
      identity: fixedIdentity(this.#commands),
      tick: this.#tick,
      version: 1,
    });
    if (serialized.length > MAX_SNAPSHOT_BYTES) {
      throw new RangeError("jump snapshot exceeds its size bound");
    }
    return serialized;
  }

  static restore(serialized) {
    if (typeof serialized !== "string") {
      throw new TypeError("jump snapshot must be a string");
    }
    if (serialized.length > MAX_SNAPSHOT_BYTES) {
      throw new RangeError("jump snapshot exceeds its size bound");
    }
    let snapshot;
    try {
      snapshot = JSON.parse(serialized);
    } catch {
      throw new TypeError("jump snapshot must be valid JSON");
    }
    const checked = exactRecord(snapshot, SNAPSHOT_KEYS, "jump snapshot");
    if (checked.version !== 1) {
      throw new TypeError("jump snapshot version is unsupported");
    }
    if (
      !Number.isSafeInteger(checked.tick) ||
      checked.tick < 0 ||
      checked.tick > MAX_TICK
    ) {
      throw new TypeError("jump snapshot.tick is invalid");
    }
    const identity = exactRecord(
      checked.identity,
      SNAPSHOT_IDENTITY_KEYS,
      "jump snapshot.identity",
    );
    if (identity.encounter !== IDENTITY.encounter) {
      throw new TypeError("jump snapshot identity is unsupported");
    }
    const encounter = new JumpEncounter({
      commands: checkedCommands(identity.commands),
    });
    encounter.stepMany(checked.tick);
    if (encounter.#tick !== checked.tick) {
      throw new TypeError("jump snapshot contains post-terminal time");
    }
    return encounter;
  }
}
