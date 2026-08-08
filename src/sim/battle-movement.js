import {
  ARENA_LENGTH_MILLITILES,
  ARENA_WIDTH_MILLITILES,
  isPointInArena,
  validateArenaPoint,
} from "./arena-geometry.js";
import { MOVEMENT_TICKS_PER_SECOND } from "./movement.js";
import {
  findGroundPath,
  isGroundNavigationNode,
} from "./pathfinding.js";

export const BATTLE_MOVEMENT_MODES = Object.freeze({
  air: "air",
  ground: "ground",
});

export const MAX_BATTLE_MOVEMENT_STEP_TICKS = 18_000;
const MAX_SNAPSHOT_BYTES = 262_144;
const MAX_ROUTE_POINTS = 1_024;
const MAX_COMMANDS = 1_024;
const MAX_TICK = 18_000;
const MAX_SPEED = 1_000_000;
const STATE_KEYS = [
  "anchor",
  "bodyRadius",
  "commands",
  "edgeStart",
  "initialPosition",
  "mode",
  "position",
  "remainder",
  "route",
  "routeIndex",
  "routeOrigin",
  "segmentLength",
  "segmentProgress",
  "segmentStart",
  "speed",
  "target",
  "tick",
];
const TARGET_KEYS = ["position", "radius", "range"];
const STOP_COMMAND_KEYS = ["kind", "tick"];
const TARGET_COMMAND_KEYS = ["kind", "target", "tick"];

function assertPlainObject(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw new TypeError(`${label} must be a plain string-keyed data object`);
  }
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
  }
}

function assertExactKeys(value, keys, label) {
  assertPlainObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`${label} has an invalid shape`);
  }
}

function integer(value, minimum, maximum, label) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(
      `${label} must be a safe integer from ${minimum} through ${maximum}`,
    );
  }
  return value;
}

function point(value, label) {
  const checked = validateArenaPoint(value, label);
  if (!isPointInArena(checked)) {
    throw new RangeError(`${label} must be inside the arena`);
  }
  return { x: checked.x, y: checked.y };
}

function assertBodyFits(position, radius, label) {
  if (
    position.x < radius ||
    position.x > ARENA_WIDTH_MILLITILES - radius ||
    position.y < radius ||
    position.y > ARENA_LENGTH_MILLITILES - radius
  ) {
    throw new RangeError(`${label} must fit inside the radius-inset arena`);
  }
}

function target(value, label = "battle movement target") {
  if (value === null) return null;
  assertExactKeys(value, TARGET_KEYS, label);
  return {
    position: point(value.position, `${label}.position`),
    radius: integer(value.radius, 0, ARENA_WIDTH_MILLITILES, `${label}.radius`),
    range: integer(value.range, 0, ARENA_LENGTH_MILLITILES, `${label}.range`),
  };
}

function clonePoint(value) {
  return { x: value.x, y: value.y };
}

function samePoint(left, right) {
  return left.x === right.x && left.y === right.y;
}

function pointsEqual(left, right) {
  return left.length === right.length && left.every((entry, index) =>
    samePoint(entry, right[index]));
}

function isPointOnAxisSegment(candidate, from, to) {
  if (samePoint(from, to)) return samePoint(candidate, from);
  if (from.x === to.x && candidate.x === from.x) {
    return candidate.y >= Math.min(from.y, to.y) &&
      candidate.y <= Math.max(from.y, to.y);
  }
  if (from.y === to.y && candidate.y === from.y) {
    return candidate.x >= Math.min(from.x, to.x) &&
      candidate.x <= Math.max(from.x, to.x);
  }
  return false;
}

function cloneTarget(value) {
  return value === null
    ? null
    : {
        position: clonePoint(value.position),
        radius: value.radius,
        range: value.range,
      };
}

function frozenTarget(value) {
  const copy = cloneTarget(value);
  return Object.freeze({
    position: Object.freeze(copy.position),
    radius: copy.radius,
    range: copy.range,
  });
}

function cloneCommand(value) {
  return value.kind === "stop"
    ? { kind: "stop", tick: value.tick }
    : { kind: "target", target: cloneTarget(value.target), tick: value.tick };
}

function frozenCommand(value) {
  const copy = cloneCommand(value);
  if (copy.kind === "target") copy.target = frozenTarget(copy.target);
  return Object.freeze(copy);
}

function validateCommands(value, snapshotTick, label) {
  if (!Array.isArray(value) || value.length > MAX_COMMANDS) {
    throw new TypeError(`${label} must be a bounded command array`);
  }
  let priorTick = 0;
  return value.map((entry, index) => {
    const commandLabel = `${label}[${index}]`;
    assertPlainObject(entry, commandLabel);
    if (entry.kind === "stop") {
      assertExactKeys(entry, STOP_COMMAND_KEYS, commandLabel);
      const tick = integer(entry.tick, priorTick, snapshotTick, `${commandLabel}.tick`);
      priorTick = tick;
      return { kind: "stop", tick };
    }
    if (entry.kind === "target") {
      assertExactKeys(entry, TARGET_COMMAND_KEYS, commandLabel);
      const tick = integer(entry.tick, priorTick, snapshotTick, `${commandLabel}.tick`);
      priorTick = tick;
      return {
        kind: "target",
        target: target(entry.target, `${commandLabel}.target`),
        tick,
      };
    }
    throw new TypeError(`${commandLabel}.kind must be target or stop`);
  });
}

function squaredDistance(left, right) {
  const dx = BigInt(left.x) - BigInt(right.x);
  const dy = BigInt(left.y) - BigInt(right.y);
  return dx * dx + dy * dy;
}

function isInBar(position, bodyRadius, destination) {
  const bar = BigInt(bodyRadius + destination.radius + destination.range);
  return squaredDistance(position, destination.position) <= bar * bar;
}

function integerSquareRoot(value) {
  if (value < 0n) throw new RangeError("square root input must be non-negative");
  if (value < 2n) return value;
  let low = 1n;
  let high = value;
  while (low <= high) {
    const middle = (low + high) >> 1n;
    const square = middle * middle;
    if (square === value) return middle;
    if (square < value) low = middle + 1n;
    else high = middle - 1n;
  }
  return high;
}

function segmentLength(from, to) {
  const square = squaredDistance(from, to);
  const floor = integerSquareRoot(square);
  return Number(floor * floor === square ? floor : floor + 1n);
}

function interpolate(from, to, progress, length) {
  if (progress === length) return clonePoint(to);
  const result = {};
  for (const axis of ["x", "y"]) {
    const delta = BigInt(to[axis]) - BigInt(from[axis]);
    const magnitude = delta < 0n ? -delta : delta;
    const offset = (magnitude * BigInt(progress)) / BigInt(length);
    result[axis] = from[axis] + (delta < 0n ? -Number(offset) : Number(offset));
  }
  return result;
}

function firstProgressInBar(from, to, length, bodyRadius, destination) {
  if (isInBar(from, bodyRadius, destination)) return 0;
  if (!isInBar(to, bodyRadius, destination)) return length;
  let low = 1;
  let high = length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (isInBar(interpolate(from, to, middle, length), bodyRadius, destination)) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
}

function event(kind, tick, position, extra = {}) {
  return Object.freeze({
    kind,
    position: Object.freeze(clonePoint(position)),
    tick,
    ...extra,
  });
}

function frozenEvents(events) {
  return Object.freeze(events);
}

function deepFrozenState(state) {
  const copy = {
    anchor: state.anchor === null ? null : Object.freeze(clonePoint(state.anchor)),
    bodyRadius: state.bodyRadius,
    commands: Object.freeze(state.commands.map(frozenCommand)),
    edgeStart: state.edgeStart === null
      ? null
      : Object.freeze(clonePoint(state.edgeStart)),
    initialPosition: Object.freeze(clonePoint(state.initialPosition)),
    mode: state.mode,
    position: Object.freeze(clonePoint(state.position)),
    remainder: state.remainder,
    route: Object.freeze(state.route.map((entry) => Object.freeze(clonePoint(entry)))),
    routeIndex: state.routeIndex,
    routeOrigin: state.routeOrigin === null
      ? null
      : Object.freeze(clonePoint(state.routeOrigin)),
    segmentLength: state.segmentLength,
    segmentProgress: state.segmentProgress,
    segmentStart: Object.freeze(clonePoint(state.segmentStart)),
    speed: state.speed,
    target: state.target === null
      ? null
      : Object.freeze({
          position: Object.freeze(clonePoint(state.target.position)),
          radius: state.target.radius,
          range: state.target.range,
        }),
    tick: state.tick,
  };
  return Object.freeze(copy);
}

function canonicalState(state) {
  return {
    anchor: state.anchor === null ? null : clonePoint(state.anchor),
    bodyRadius: state.bodyRadius,
    commands: state.commands.map(cloneCommand),
    edgeStart: state.edgeStart === null ? null : clonePoint(state.edgeStart),
    initialPosition: clonePoint(state.initialPosition),
    mode: state.mode,
    position: clonePoint(state.position),
    remainder: state.remainder,
    route: state.route.map(clonePoint),
    routeIndex: state.routeIndex,
    routeOrigin: state.routeOrigin === null ? null : clonePoint(state.routeOrigin),
    segmentLength: state.segmentLength,
    segmentProgress: state.segmentProgress,
    segmentStart: clonePoint(state.segmentStart),
    speed: state.speed,
    target: cloneTarget(state.target),
    tick: state.tick,
  };
}

function validateState(value, label = "battle movement state") {
  assertExactKeys(value, STATE_KEYS, label);
  if (!Object.values(BATTLE_MOVEMENT_MODES).includes(value.mode)) {
    throw new TypeError(`${label}.mode must be ground or air`);
  }
  const bodyRadius = integer(
    value.bodyRadius,
    0,
    Math.floor(ARENA_WIDTH_MILLITILES / 2),
    `${label}.bodyRadius`,
  );
  const position = point(value.position, `${label}.position`);
  assertBodyFits(position, bodyRadius, `${label}.position`);
  const initialPosition = point(value.initialPosition, `${label}.initialPosition`);
  assertBodyFits(initialPosition, bodyRadius, `${label}.initialPosition`);
  if (value.mode === BATTLE_MOVEMENT_MODES.ground &&
      !isGroundNavigationNode(initialPosition)) {
    throw new RangeError(`${label}.initialPosition must be a ground navigation node`);
  }
  const speed = integer(value.speed, 0, MAX_SPEED, `${label}.speed`);
  const remainder = integer(
    value.remainder,
    0,
    MOVEMENT_TICKS_PER_SECOND - 1,
    `${label}.remainder`,
  );
  const tick = integer(value.tick, 0, MAX_TICK, `${label}.tick`);
  const commands = validateCommands(value.commands, tick, `${label}.commands`);
  const destination = target(value.target, `${label}.target`);
  const anchor = value.anchor === null
    ? null
    : point(value.anchor, `${label}.anchor`);
  if (value.mode === BATTLE_MOVEMENT_MODES.air && anchor !== null) {
    throw new RangeError(`${label}.anchor must be null for air movement`);
  }
  if (value.mode === BATTLE_MOVEMENT_MODES.ground &&
      (anchor === null || !isGroundNavigationNode(anchor))) {
    throw new RangeError(`${label}.anchor must be a ground navigation node`);
  }
  const edgeStart = value.edgeStart === null
    ? null
    : point(value.edgeStart, `${label}.edgeStart`);
  if (value.mode === BATTLE_MOVEMENT_MODES.air && edgeStart !== null) {
    throw new RangeError(`${label}.edgeStart must be null for air movement`);
  }
  if (value.mode === BATTLE_MOVEMENT_MODES.ground &&
      (edgeStart === null || !isGroundNavigationNode(edgeStart))) {
    throw new RangeError(`${label}.edgeStart must be a ground navigation node`);
  }
  if (anchor !== null) assertBodyFits(anchor, bodyRadius, `${label}.anchor`);
  if (edgeStart !== null) {
    assertBodyFits(edgeStart, bodyRadius, `${label}.edgeStart`);
    if (!samePoint(edgeStart, anchor)) {
      const edge = findGroundPath(edgeStart, anchor);
      if (edge === null || edge.length !== 2 ||
          !samePoint(edge[0], edgeStart) || !samePoint(edge[1], anchor)) {
        throw new RangeError(`${label} has a noncanonical active ground edge`);
      }
    }
  }
  const routeOrigin = value.routeOrigin === null
    ? null
    : point(value.routeOrigin, `${label}.routeOrigin`);
  const routeIndex = integer(
    value.routeIndex,
    0,
    MAX_ROUTE_POINTS,
    `${label}.routeIndex`,
  );
  if (value.mode === BATTLE_MOVEMENT_MODES.air &&
      (routeOrigin !== null || routeIndex !== 0)) {
    throw new RangeError(`${label} cannot use ground route provenance in air mode`);
  }
  if (value.mode === BATTLE_MOVEMENT_MODES.ground &&
      (routeOrigin === null || !isGroundNavigationNode(routeOrigin))) {
    throw new RangeError(`${label}.routeOrigin must be a ground navigation node`);
  }
  if (routeOrigin !== null) {
    assertBodyFits(routeOrigin, bodyRadius, `${label}.routeOrigin`);
  }
  if (!Array.isArray(value.route) || value.route.length > MAX_ROUTE_POINTS) {
    throw new TypeError(`${label}.route must be a bounded array`);
  }
  const route = value.route.map((entry, index) => {
    const checked = point(entry, `${label}.route[${index}]`);
    assertBodyFits(checked, bodyRadius, `${label}.route[${index}]`);
    if (value.mode === BATTLE_MOVEMENT_MODES.ground &&
        !isGroundNavigationNode(checked)) {
      throw new RangeError(`${label}.route[${index}] must be a ground navigation node`);
    }
    return checked;
  });
  const segmentStart = point(value.segmentStart, `${label}.segmentStart`);
  assertBodyFits(segmentStart, bodyRadius, `${label}.segmentStart`);
  if (value.mode === BATTLE_MOVEMENT_MODES.ground &&
      (!isPointOnAxisSegment(segmentStart, edgeStart, anchor) ||
       !isPointOnAxisSegment(position, edgeStart, anchor))) {
    throw new RangeError(`${label} is not on its canonical active ground edge`);
  }
  const checkedLength = integer(
    value.segmentLength,
    0,
    ARENA_WIDTH_MILLITILES + ARENA_LENGTH_MILLITILES,
    `${label}.segmentLength`,
  );
  const checkedProgress = integer(
    value.segmentProgress,
    0,
    checkedLength,
    `${label}.segmentProgress`,
  );
  if (route.length === 0) {
    if (checkedLength !== 0 || checkedProgress !== 0 || remainder !== 0 ||
        segmentStart.x !== position.x || segmentStart.y !== position.y) {
      throw new RangeError(`${label} has inconsistent idle segment state`);
    }
    if (value.mode === BATTLE_MOVEMENT_MODES.ground && destination !== null &&
        speed > 0 && !isInBar(position, bodyRadius, destination)) {
      throw new RangeError(`${label} stopped outside its target bar`);
    }
    if (value.mode === BATTLE_MOVEMENT_MODES.ground && destination === null &&
        (routeIndex !== 0 || !samePoint(routeOrigin, anchor))) {
      throw new RangeError(`${label} has noncanonical stopped route provenance`);
    }
  } else {
    const expectedLength = segmentLength(segmentStart, route[0]);
    if (expectedLength === 0 || checkedLength !== expectedLength ||
        checkedProgress >= checkedLength) {
      throw new RangeError(`${label} has inconsistent active segment state`);
    }
    const expectedPosition = interpolate(
      segmentStart,
      route[0],
      checkedProgress,
      checkedLength,
    );
    if (expectedPosition.x !== position.x || expectedPosition.y !== position.y) {
      throw new RangeError(`${label}.position does not match segment progress`);
    }
    if (destination === null || speed === 0) {
      throw new RangeError(`${label} cannot route without a moving command`);
    }
    if (value.mode === BATTLE_MOVEMENT_MODES.ground) {
      if (anchor.x !== route[0].x || anchor.y !== route[0].y) {
        throw new RangeError(`${label}.anchor must be the next ground waypoint`);
      }
      const canonical = findGroundPath(routeOrigin, destination.position);
      const expected = canonical?.slice(routeIndex);
      if (canonical === null || !pointsEqual(route, expected)) {
        throw new RangeError(
          `${label}.route must exactly match the canonical ground path`,
        );
      }
    } else if (route.length !== 1 ||
        route[0].x !== destination.position.x ||
        route[0].y !== destination.position.y) {
      throw new RangeError(`${label}.route must be the direct air segment`);
    }
  }
  if ((destination === null || speed === 0) && remainder !== 0) {
    throw new RangeError(`${label}.remainder must be zero while stopped`);
  }
  return {
    anchor,
    bodyRadius,
    commands,
    edgeStart,
    initialPosition,
    mode: value.mode,
    position,
    remainder,
    route,
    routeIndex,
    routeOrigin,
    segmentLength: checkedLength,
    segmentProgress: checkedProgress,
    segmentStart,
    speed,
    target: destination,
    tick,
  };
}

function initialState({ bodyRadius = 0, mode, position, speed = 0 }) {
  if (!Object.values(BATTLE_MOVEMENT_MODES).includes(mode)) {
    throw new TypeError("battle movement mode must be ground or air");
  }
  const checkedPosition = point(position, "battle movement position");
  const checkedRadius = integer(
    bodyRadius,
    0,
    Math.floor(ARENA_WIDTH_MILLITILES / 2),
    "battle movement bodyRadius",
  );
  assertBodyFits(checkedPosition, checkedRadius, "battle movement position");
  if (mode === BATTLE_MOVEMENT_MODES.ground &&
      !isGroundNavigationNode(checkedPosition)) {
    throw new RangeError("ground battle movement position must be a navigation node");
  }
  const checkedSpeed = integer(speed, 0, MAX_SPEED, "battle movement speed");
  return {
    anchor: mode === BATTLE_MOVEMENT_MODES.ground
      ? clonePoint(checkedPosition)
      : null,
    bodyRadius: checkedRadius,
    commands: [],
    edgeStart: mode === BATTLE_MOVEMENT_MODES.ground
      ? clonePoint(checkedPosition)
      : null,
    initialPosition: clonePoint(checkedPosition),
    mode,
    position: checkedPosition,
    remainder: 0,
    route: [],
    routeIndex: 0,
    routeOrigin: mode === BATTLE_MOVEMENT_MODES.ground
      ? clonePoint(checkedPosition)
      : null,
    segmentLength: 0,
    segmentProgress: 0,
    segmentStart: clonePoint(checkedPosition),
    speed: checkedSpeed,
    target: null,
    tick: 0,
  };
}

function idleAt(state, position = state.position) {
  state.position = clonePoint(position);
  state.remainder = 0;
  state.route = [];
  state.segmentLength = 0;
  state.segmentProgress = 0;
  state.segmentStart = clonePoint(position);
}

function startSegment(state) {
  state.segmentStart = clonePoint(state.position);
  state.segmentProgress = 0;
  state.segmentLength = state.route.length === 0
    ? 0
    : segmentLength(state.segmentStart, state.route[0]);
}

function routingAnchor(state) {
  if (state.mode !== BATTLE_MOVEMENT_MODES.ground) return null;
  if (isGroundNavigationNode(state.position)) return clonePoint(state.position);
  return clonePoint(state.anchor);
}

export class BattleMovement {
  #state;

  constructor(configuration) {
    assertPlainObject(configuration, "battle movement configuration");
    const keys = Object.keys(configuration).sort();
    const allowed = ["bodyRadius", "mode", "position", "speed"];
    if (keys.some((key) => !allowed.includes(key)) ||
        !keys.includes("mode") || !keys.includes("position")) {
      throw new TypeError("battle movement configuration has an invalid shape");
    }
    this.#state = initialState(configuration);
  }

  get state() {
    return deepFrozenState(this.#state);
  }

  setTarget(value) {
    const checked = target(value);
    if (checked === null) {
      throw new TypeError("battle movement target command requires a target");
    }
    if (this.#state.mode === BATTLE_MOVEMENT_MODES.ground &&
        !isGroundNavigationNode(checked.position)) {
      throw new RangeError("ground battle movement target must be a navigation node");
    }

    let route;
    let nextAnchor = this.#state.anchor;
    let nextEdgeStart = this.#state.edgeStart;
    let nextRouteIndex = this.#state.routeIndex;
    let nextRouteOrigin = this.#state.routeOrigin;
    if (isInBar(this.#state.position, this.#state.bodyRadius, checked) ||
        this.#state.speed === 0) {
      route = [];
    } else if (this.#state.mode === BATTLE_MOVEMENT_MODES.air) {
      assertBodyFits(checked.position, this.#state.bodyRadius, "air movement target");
      route = [clonePoint(checked.position)];
    } else {
      const anchor = routingAnchor(this.#state);
      const suffix = findGroundPath(anchor, checked.position);
      if (suffix === null) {
        throw new RangeError("ground battle movement target has no route");
      }
      route = [];
      nextRouteOrigin = clonePoint(anchor);
      if (this.#state.position.x !== anchor.x || this.#state.position.y !== anchor.y) {
        route.push(anchor);
        nextAnchor = clonePoint(anchor);
        nextRouteIndex = 0;
      }
      route.push(...suffix.slice(1).map(clonePoint));
      if (samePoint(this.#state.position, anchor) && route.length > 0) {
        nextEdgeStart = clonePoint(this.#state.position);
        nextAnchor = clonePoint(route[0]);
        nextRouteIndex = 1;
      }
      for (let index = 0; index < route.length; index += 1) {
        assertBodyFits(
          route[index],
          this.#state.bodyRadius,
          `ground movement route[${index}]`,
        );
      }
    }

    if (this.#state.commands.length >= MAX_COMMANDS) {
      throw new RangeError("battle movement command bound exceeded");
    }
    this.#state.target = checked;
    this.#state.remainder = 0;
    this.#state.route = route;
    if (this.#state.mode === BATTLE_MOVEMENT_MODES.ground && route.length > 0) {
      this.#state.anchor = nextAnchor;
      this.#state.edgeStart = nextEdgeStart;
      this.#state.routeIndex = nextRouteIndex;
      this.#state.routeOrigin = nextRouteOrigin;
    }
    if (route.length === 0) idleAt(this.#state);
    else startSegment(this.#state);
    this.#state.commands.push({
      kind: "target",
      target: cloneTarget(checked),
      tick: this.#state.tick,
    });
    return frozenEvents([
      event("target-set", this.#state.tick, this.#state.position, {
        target: frozenTarget(checked),
      }),
    ]);
  }

  stop() {
    if (this.#state.commands.length >= MAX_COMMANDS) {
      throw new RangeError("battle movement command bound exceeded");
    }
    if (this.#state.mode === BATTLE_MOVEMENT_MODES.ground) {
      const anchor = routingAnchor(this.#state);
      if (samePoint(this.#state.position, anchor)) {
        this.#state.edgeStart = clonePoint(anchor);
      }
      this.#state.anchor = clonePoint(anchor);
      this.#state.routeOrigin = clonePoint(anchor);
      this.#state.routeIndex = 0;
    }
    this.#state.target = null;
    idleAt(this.#state);
    this.#state.commands.push({ kind: "stop", tick: this.#state.tick });
    return frozenEvents([event("stopped", this.#state.tick, this.#state.position)]);
  }

  step() {
    return this.stepMany(1);
  }

  stepMany(ticks) {
    integer(
      ticks,
      0,
      MAX_BATTLE_MOVEMENT_STEP_TICKS,
      "battle movement step ticks",
    );
    if (this.#state.tick + ticks > MAX_TICK) {
      throw new RangeError("battle movement tick bound exceeded");
    }
    const events = [];
    for (let count = 0; count < ticks; count += 1) {
      this.#state.tick += 1;
      if (this.#state.route.length === 0 || this.#state.speed === 0) continue;
      const before = clonePoint(this.#state.position);
      const accumulated =
        BigInt(this.#state.remainder) + BigInt(this.#state.speed);
      let budget = Number(accumulated / BigInt(MOVEMENT_TICKS_PER_SECOND));
      this.#state.remainder = Number(
        accumulated % BigInt(MOVEMENT_TICKS_PER_SECOND),
      );

      while (budget > 0 && this.#state.route.length > 0) {
        const finalSegment = this.#state.route.length === 1;
        const limit = finalSegment
          ? firstProgressInBar(
              this.#state.segmentStart,
              this.#state.route[0],
              this.#state.segmentLength,
              this.#state.bodyRadius,
              this.#state.target,
            )
          : this.#state.segmentLength;
        const remaining = limit - this.#state.segmentProgress;
        const travel = Math.min(budget, Math.max(0, remaining));
        this.#state.segmentProgress += travel;
        budget -= travel;
        this.#state.position = interpolate(
          this.#state.segmentStart,
          this.#state.route[0],
          this.#state.segmentProgress,
          this.#state.segmentLength,
        );

        if (this.#state.segmentProgress === limit) {
          if (finalSegment) {
            if (this.#state.mode === BATTLE_MOVEMENT_MODES.ground) {
              this.#state.anchor = clonePoint(this.#state.target.position);
              this.#state.routeIndex += 1;
            }
            idleAt(this.#state);
            break;
          }
          this.#state.position = clonePoint(this.#state.route[0]);
          if (this.#state.mode === BATTLE_MOVEMENT_MODES.ground) {
            this.#state.edgeStart = clonePoint(this.#state.position);
            this.#state.routeIndex += 1;
          }
          this.#state.route.shift();
          if (this.#state.mode === BATTLE_MOVEMENT_MODES.ground) {
            this.#state.anchor = clonePoint(this.#state.route[0]);
          }
          startSegment(this.#state);
        }
      }

      if (before.x !== this.#state.position.x || before.y !== this.#state.position.y) {
        events.push(event("moved", this.#state.tick, this.#state.position, {
          from: Object.freeze(before),
        }));
      }
      if (this.#state.route.length === 0) {
        this.#state.remainder = 0;
        events.push(event("arrived", this.#state.tick, this.#state.position));
      }
    }
    return frozenEvents(events);
  }

  serialize() {
    return JSON.stringify({ state: canonicalState(this.#state), version: 1 });
  }

  static restore(serialized) {
    if (typeof serialized !== "string") {
      throw new TypeError("serialized battle movement must be a string");
    }
    if (new TextEncoder().encode(serialized).byteLength > MAX_SNAPSHOT_BYTES) {
      throw new RangeError("serialized battle movement exceeds the byte bound");
    }
    let snapshot;
    try {
      snapshot = JSON.parse(serialized);
    } catch {
      throw new TypeError("serialized battle movement must be valid JSON");
    }
    if (JSON.stringify(snapshot) !== serialized) {
      throw new TypeError("serialized battle movement must be canonical JSON");
    }
    assertExactKeys(snapshot, ["state", "version"], "battle movement snapshot");
    if (snapshot.version !== 1) {
      throw new TypeError("battle movement snapshot has an unsupported version");
    }
    const checked = validateState(snapshot.state, "battle movement snapshot.state");
    const replayed = new BattleMovement({
      bodyRadius: checked.bodyRadius,
      mode: checked.mode,
      position: checked.initialPosition,
      speed: checked.speed,
    });
    for (const command of checked.commands) {
      replayed.stepMany(command.tick - replayed.#state.tick);
      if (command.kind === "target") replayed.setTarget(command.target);
      else replayed.stop();
    }
    replayed.stepMany(checked.tick - replayed.#state.tick);
    if (JSON.stringify(canonicalState(replayed.#state)) !==
        JSON.stringify(canonicalState(checked))) {
      throw new RangeError(
        "battle movement snapshot state is not reachable from its command history",
      );
    }
    const restored = new BattleMovement({
      mode: BATTLE_MOVEMENT_MODES.air,
      position: { x: 0, y: 0 },
      speed: 0,
    });
    restored.#state = checked;
    if (restored.serialize() !== serialized) {
      throw new TypeError("battle movement snapshot is not canonical");
    }
    return restored;
  }
}
