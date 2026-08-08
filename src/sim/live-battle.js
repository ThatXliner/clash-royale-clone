import { BattleMovement } from "./battle-movement.js";
import { BattleTowerCombat } from "./battle-towers.js";
import { evaluateDeployment } from "./deployment.js";
import { layoutFormation } from "./formations.js";
import { isGroundNavigationNode } from "./pathfinding.js";
import { validateArenaPoint } from "./arena-geometry.js";

export const MAX_LIVE_BATTLE_STEP_TICKS = 18_000;
export const MAX_LIVE_BATTLE_DEPLOYMENTS = 1_024;
export const MAX_LIVE_BATTLE_UNITS = 1_024;

const MAX_HISTORY = 100_000;
const EXPLICIT_HISTORY_TAIL = 256;
const MAX_SNAPSHOT_BYTES = 8_388_608;
const MAX_SETUP_BYTES = 1_048_576;
const MAX_SETUP_DEPTH = 32;
const MAX_SETUP_NODES = 10_000;
const ADMITTED_SETUPS = new WeakSet();
const SETUP_GRAPH_LIMITS = Object.freeze({
  arrayLength: 1_024,
  containers: 2_048,
  depth: MAX_SETUP_DEPTH,
  keys: 64,
  nodes: MAX_SETUP_NODES,
  stringLength: 256,
});
const SNAPSHOT_GRAPH_LIMITS = Object.freeze({
  arrayLength: 200_000,
  containers: 100_000,
  depth: 128,
  keys: 1_024,
  nodes: 200_000,
  stringLength: 4_194_304,
});
const SIDES = new Set(["north", "south"]);
const DEPLOY_KEYS = ["cardId", "point", "sequence", "side", "tick"];
const SETUP_KEYS = ["initialWindupTicks", "questions", "roster"];
const CARD_KEYS = [
  "areaDamageRadiusMillitiles", "cost", "count", "damage", "deployTimeTicks",
  "displayName", "entities", "firstHitTicks", "formation", "hitSpeedTicks",
  "hitpoints", "id", "kind", "movementMillitilesPerSecond", "rangeMillitiles",
  "rarity", "sightRangeMillitiles", "targetMode",
];
const ENTITY_KEYS = [
  "archetypeId", "areaDamageRadiusMillitiles", "bodyRadiusPolicy", "count",
  "damage", "delivery", "deployTimeTicks", "displayName", "firstHitTicks",
  "hitSpeedTicks", "hitpoints", "kind", "layer",
  "movementMillitilesPerSecond", "projectileSpeedPolicy", "rangeMillitiles",
  "role", "sightRangeMillitiles", "targetMode",
];
const QUESTION_KEYS = [
  "authoritative", "confidence", "disposition", "key", "source", "value",
];
const POLICY_KEYS = ["kind", "questionKey"];
const FORMATION_KEYS = ["componentOrder", "expansionOrder", "totalCount"];
const GROUND_NODES = Object.freeze(Array.from({ length: 32 }, (_, row) =>
  Array.from({ length: 18 }, (_, column) => ({
    x: column * 1_000 + 500,
    y: row * 1_000 + 500,
  }))).flat().filter((point) => isGroundNavigationNode(point))
  .map((point) => Object.freeze(point)));

function plain(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
       Object.getPrototypeOf(value) !== null) ||
      Object.getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError(`${label} must be a plain string-keyed data object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
  }
  return descriptors;
}

function exact(value, keys, label) {
  const descriptors = plain(value, label);
  const actual = Reflect.ownKeys(descriptors).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length ||
      actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has an invalid shape`);
  }
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function denseArray(value, label, maximum = MAX_HISTORY) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new TypeError(`${label} must be a bounded array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) ||
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

function scalarString(value, maximum, label) {
  if (value.length > maximum) throw new RangeError(`${label} string length bound exceeded`);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) {
        throw new TypeError(`${label} strings must contain only Unicode scalar values`);
      }
      index += 1;
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      throw new TypeError(`${label} strings must contain only Unicode scalar values`);
    }
  }
}

function preflightParsedGraph(root, limits, label) {
  const pending = [{ depth: 0, value: root }];
  let nodes = 0;
  let containers = 0;
  while (pending.length > 0) {
    const { depth, value } = pending.pop();
    nodes += 1;
    if (nodes > limits.nodes) throw new RangeError(`${label} node bound exceeded`);
    if (depth > limits.depth) throw new RangeError(`${label} depth bound exceeded`);
    if (typeof value === "string") {
      scalarString(value, limits.stringLength, label);
      continue;
    }
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) {
        throw new TypeError(`${label} numbers must be safe integers`);
      }
      continue;
    }
    if (value === null || typeof value !== "object") continue;
    containers += 1;
    if (containers > limits.containers) throw new RangeError(`${label} container bound exceeded`);
    if (Array.isArray(value)) {
      if (value.length > limits.arrayLength) {
        throw new RangeError(`${label} array length bound exceeded`);
      }
    } else {
      const keys = Object.keys(value);
      if (keys.length > limits.keys) throw new RangeError(`${label} object key bound exceeded`);
      for (const key of keys) scalarString(key, limits.stringLength, `${label} key`);
    }
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      pending.push({ depth: depth + 1, value: child });
    }
  }
}

function parsedSetupBytes(serialized) {
  if (typeof serialized !== "string") {
    throw new TypeError("live battle setup must be canonical JSON text or an admitted snapshot");
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_SETUP_BYTES) {
    throw new RangeError("live battle setup byte bound exceeded");
  }
  let parsed;
  try { parsed = JSON.parse(serialized); }
  catch { throw new TypeError("live battle setup must be valid JSON text"); }
  preflightParsedGraph(parsed, SETUP_GRAPH_LIMITS, "live battle setup");
  if (canonical(parsed) !== serialized) {
    throw new TypeError("live battle setup must be canonical JSON text");
  }
  return parsed;
}

function string(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new TypeError(`${label} must be a bounded non-empty primitive string`);
  }
  return value;
}

function identity(value, displayName, label) {
  const checked = string(value, label);
  const display = string(displayName, `${label} display name`);
  if (!/^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/u.test(display)) {
    throw new TypeError(`${label} display name cannot form a canonical identity`);
  }
  const derived = display.toLowerCase().replaceAll(" ", "-");
  if (checked !== derived) {
    throw new TypeError(`${label} must be the canonical identity of its display name`);
  }
  return checked;
}

function nonnegative(value, label) {
  return integer(value, 0, Number.MAX_SAFE_INTEGER, label);
}

function nullableNonnegative(value, label) {
  return value === null ? null : nonnegative(value, label);
}

function checkedPolicy(value, label, { projectile = false } = {}) {
  const policy = exact(value, POLICY_KEYS, label);
  if (policy.kind === "not-applicable" && projectile && policy.questionKey === null) {
    return { kind: policy.kind, questionKey: null };
  }
  if (policy.kind !== "question") throw new TypeError(`${label}.kind is invalid`);
  return { kind: policy.kind, questionKey: string(policy.questionKey, `${label}.questionKey`) };
}

function checkedSetup(value) {
  const setup = exact(value, SETUP_KEYS, "live battle setup");
  const windups = exact(setup.initialWindupTicks, ["central", "lane"],
    "live battle setup.initialWindupTicks");
  const initialWindupTicks = {
    central: nonnegative(windups.central, "live battle setup.initialWindupTicks.central"),
    lane: nonnegative(windups.lane, "live battle setup.initialWindupTicks.lane"),
  };
  const questions = denseArray(setup.questions, "live battle setup.questions", 256)
    .map((value, index) => {
      const record = exact(value, QUESTION_KEYS, `live battle setup.questions[${index}]`);
      if (record.authoritative !== false || record.disposition !== "question") {
        throw new TypeError(`live battle setup.questions[${index}] must be non-authoritative`);
      }
      return {
        authoritative: false,
        confidence: string(record.confidence, `questions[${index}].confidence`),
        disposition: "question",
        key: string(record.key, `questions[${index}].key`),
        source: string(record.source, `questions[${index}].source`),
        value: integer(record.value, 1, Number.MAX_SAFE_INTEGER, `questions[${index}].value`),
      };
    });
  if (new Set(questions.map(({ key }) => key)).size !== questions.length) {
    throw new TypeError("live battle setup question keys must be unique");
  }
  const questionKeys = new Set(questions.map(({ key }) => key));
  const referencedQuestionKeys = new Set();
  const roster = denseArray(setup.roster, "live battle setup.roster", 8)
    .map((value, cardIndex) => {
      const card = exact(value, CARD_KEYS, `live battle setup.roster[${cardIndex}]`);
      const cardKind = string(card.kind, `roster[${cardIndex}].kind`);
      if (!["effect", "structure", "unit"].includes(cardKind)) {
        throw new TypeError(`roster[${cardIndex}].kind is invalid`);
      }
      const entities = denseArray(card.entities, `roster[${cardIndex}].entities`, 16)
        .map((raw, entityIndex) => {
          const label = `roster[${cardIndex}].entities[${entityIndex}]`;
          const entity = exact(raw, ENTITY_KEYS, label);
          const bodyRadiusPolicy = checkedPolicy(entity.bodyRadiusPolicy, `${label}.bodyRadiusPolicy`);
          const projectileSpeedPolicy = checkedPolicy(
            entity.projectileSpeedPolicy, `${label}.projectileSpeedPolicy`, { projectile: true },
          );
          for (const policy of [bodyRadiusPolicy, projectileSpeedPolicy]) {
            if (policy.kind === "question" && !questionKeys.has(policy.questionKey)) {
              throw new TypeError(`${label} has an unresolved question policy`);
            }
            if (policy.kind === "question") referencedQuestionKeys.add(policy.questionKey);
          }
          if (!["melee", "projectile"].includes(entity.delivery) ||
              !["air", "ground"].includes(entity.layer)) {
            throw new TypeError(`${label} has an invalid delivery or layer`);
          }
          if ((entity.delivery === "projectile") !==
              (projectileSpeedPolicy.kind === "question") || entity.kind !== "unit" ||
              !["buildings", "ground", "ground-and-air"].includes(entity.targetMode)) {
            throw new TypeError(`${label} has inconsistent combat metadata`);
          }
          const archetypeId = identity(entity.archetypeId, entity.displayName,
            `${label}.archetypeId`);
          const expectedBodyKey = `${archetypeId}.body-radius-millitiles`;
          const expectedProjectileKey = `${archetypeId}.projectile-speed-millitiles-per-tick`;
          if (bodyRadiusPolicy.questionKey !== expectedBodyKey ||
              (projectileSpeedPolicy.kind === "question" &&
                projectileSpeedPolicy.questionKey !== expectedProjectileKey)) {
            throw new TypeError(`${label} policy identities are inconsistent with its archetype`);
          }
          if (entity.role !== (entityIndex === 0 ? "primary" : "secondary")) {
            throw new TypeError(`${label}.role is inconsistent with component ownership`);
          }
          return {
            archetypeId,
            areaDamageRadiusMillitiles: nullableNonnegative(entity.areaDamageRadiusMillitiles,
              `${label}.areaDamageRadiusMillitiles`),
            bodyRadiusPolicy,
            count: integer(entity.count, 1, 64, `${label}.count`),
            damage: nonnegative(entity.damage, `${label}.damage`),
            delivery: entity.delivery,
            deployTimeTicks: nonnegative(entity.deployTimeTicks, `${label}.deployTimeTicks`),
            displayName: string(entity.displayName, `${label}.displayName`),
            firstHitTicks: nonnegative(entity.firstHitTicks, `${label}.firstHitTicks`),
            hitSpeedTicks: integer(entity.hitSpeedTicks, 1, Number.MAX_SAFE_INTEGER,
              `${label}.hitSpeedTicks`),
            hitpoints: integer(entity.hitpoints, 1, Number.MAX_SAFE_INTEGER, `${label}.hitpoints`),
            kind: string(entity.kind, `${label}.kind`),
            layer: entity.layer,
            movementMillitilesPerSecond: nonnegative(entity.movementMillitilesPerSecond,
              `${label}.movementMillitilesPerSecond`),
            projectileSpeedPolicy,
            rangeMillitiles: nonnegative(entity.rangeMillitiles, `${label}.rangeMillitiles`),
            role: string(entity.role, `${label}.role`),
            sightRangeMillitiles: nonnegative(entity.sightRangeMillitiles,
              `${label}.sightRangeMillitiles`),
            targetMode: string(entity.targetMode, `${label}.targetMode`),
          };
        });
      if ((cardKind === "unit") !== (entities.length > 0)) {
        throw new TypeError(`roster[${cardIndex}] entity inventory is inconsistent with its kind`);
      }
      const formation = exact(card.formation, FORMATION_KEYS, `roster[${cardIndex}].formation`);
      const componentOrder = denseArray(formation.componentOrder,
        `roster[${cardIndex}].formation.componentOrder`, 16)
        .map((id, index) => string(id, `formation.componentOrder[${index}]`));
      if (formation.expansionOrder !== "component-order-then-member-index" ||
          canonical(componentOrder) !== canonical(entities.map(({ archetypeId }) => archetypeId)) ||
          formation.totalCount !== entities.reduce((sum, entity) => sum + entity.count, 0) ||
          (cardKind === "unit" ? card.count !== formation.totalCount :
            formation.totalCount !== 0)) {
        throw new TypeError(`roster[${cardIndex}].formation is inconsistent`);
      }
      const label = `roster[${cardIndex}]`;
      return {
        areaDamageRadiusMillitiles: nullableNonnegative(card.areaDamageRadiusMillitiles,
          `${label}.areaDamageRadiusMillitiles`),
        cost: nonnegative(card.cost, `${label}.cost`),
        count: integer(card.count, 1, 64, `${label}.count`),
        damage: cardKind === "unit" ? nonnegative(card.damage, `${label}.damage`) :
          nullableNonnegative(card.damage, `${label}.damage`),
        deployTimeTicks: cardKind === "unit" ?
          nonnegative(card.deployTimeTicks, `${label}.deployTimeTicks`) :
          nullableNonnegative(card.deployTimeTicks, `${label}.deployTimeTicks`),
        displayName: string(card.displayName, `${label}.displayName`),
        entities,
        firstHitTicks: cardKind === "unit" ? nonnegative(card.firstHitTicks, `${label}.firstHitTicks`) :
          nullableNonnegative(card.firstHitTicks, `${label}.firstHitTicks`),
        formation: { componentOrder, expansionOrder: formation.expansionOrder,
          totalCount: formation.totalCount },
        hitSpeedTicks: cardKind === "unit" ? integer(card.hitSpeedTicks, 1,
          Number.MAX_SAFE_INTEGER, `${label}.hitSpeedTicks`) : card.hitSpeedTicks === null ? null :
          integer(card.hitSpeedTicks, 1, Number.MAX_SAFE_INTEGER, `${label}.hitSpeedTicks`),
        hitpoints: cardKind === "unit" ? integer(card.hitpoints, 1,
          Number.MAX_SAFE_INTEGER, `${label}.hitpoints`) : card.hitpoints === null ? null :
          integer(card.hitpoints, 1, Number.MAX_SAFE_INTEGER, `${label}.hitpoints`),
        id: identity(card.id, card.displayName, `${label}.id`),
        kind: cardKind,
        movementMillitilesPerSecond: cardKind === "unit" ?
          nonnegative(card.movementMillitilesPerSecond,
            `${label}.movementMillitilesPerSecond`) :
          nullableNonnegative(card.movementMillitilesPerSecond,
            `${label}.movementMillitilesPerSecond`),
        rangeMillitiles: cardKind === "unit" ?
          nonnegative(card.rangeMillitiles, `${label}.rangeMillitiles`) :
          nullableNonnegative(card.rangeMillitiles, `${label}.rangeMillitiles`),
        rarity: string(card.rarity, `${label}.rarity`),
        sightRangeMillitiles: cardKind === "unit" ?
          nonnegative(card.sightRangeMillitiles, `${label}.sightRangeMillitiles`) :
          nullableNonnegative(card.sightRangeMillitiles, `${label}.sightRangeMillitiles`),
        targetMode: string(card.targetMode, `${label}.targetMode`),
      };
    });
  if (roster.length !== 8 || new Set(roster.map(({ id }) => id)).size !== roster.length) {
    throw new TypeError("live battle setup roster must contain eight unique cards");
  }
  const archetypes = roster.flatMap(({ entities }) => entities.map(({ archetypeId }) => archetypeId));
  if (new Set(archetypes).size !== archetypes.length) {
    throw new TypeError("live battle setup archetype identities must be globally unique");
  }
  const cardOwners = new Set(roster.map(({ id }) => id));
  for (const card of roster) {
    if (card.entities.length === 1 && card.entities[0].count === 1 &&
        card.entities[0].archetypeId !== card.id) {
      throw new TypeError("live battle singleton card must own its matching archetype identity");
    }
    for (const entity of card.entities) {
      if (cardOwners.has(entity.archetypeId) && entity.archetypeId !== card.id) {
        throw new TypeError("live battle archetype cannot alias another card identity");
      }
    }
  }
  const expectedQuestions = [...referencedQuestionKeys].sort();
  const actualQuestions = questions.map(({ key }) => key).sort();
  if (canonical(actualQuestions) !== canonical(expectedQuestions)) {
    throw new TypeError("live battle questions must be the canonical exact referenced inventory");
  }
  if (new Set(questions.map(({ source }) => source)).size !== 1 ||
      questions.some(({ confidence }) => confidence !== "unverified")) {
    throw new TypeError("live battle questions must share canonical unverified provenance");
  }
  const canonicalQuestions = [...questions].sort((left, right) =>
    left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
  const normalized = freeze({ initialWindupTicks, questions: canonicalQuestions, roster });
  ADMITTED_SETUPS.add(normalized);
  return normalized;
}

function admittedSetup(value) {
  if (typeof value === "string") return checkedSetup(parsedSetupBytes(value));
  if (value !== null && typeof value === "object" && ADMITTED_SETUPS.has(value)) return value;
  throw new TypeError("live battle setup object must come from parseLiveBattleSetup");
}

export function parseLiveBattleSetup(serialized) {
  return checkedSetup(parsedSetupBytes(serialized));
}

function resolveQuestion(policy, questionValues) {
  if (policy.kind !== "question") return null;
  return questionValues.get(policy.questionKey);
}

function checkedDeploy(value, currentTick, rosterById) {
  const command = exact(value, DEPLOY_KEYS, "live battle deploy command");
  const tick = integer(command.tick, currentTick, MAX_LIVE_BATTLE_STEP_TICKS,
    "live battle deploy command.tick");
  const sequence = integer(command.sequence, 0, Number.MAX_SAFE_INTEGER,
    "live battle deploy command.sequence");
  if (!SIDES.has(command.side)) throw new TypeError("live battle deploy command.side is invalid");
  const card = rosterById.get(command.cardId);
  if (!card) {
    throw new TypeError("live battle deploy command.cardId is not playable");
  }
  if (card.kind !== "unit" || card.entities.length === 0) {
    throw new TypeError("live battle deploy command.cardId is not a materializable unit");
  }
  const point = validateArenaPoint(command.point, "live battle deploy command.point");
  const decision = evaluateDeployment({
    destroyedOpposingLaneTowers: [],
    placementClass: "ground_entity",
    point,
    side: command.side,
  });
  if (!decision.legal) throw new RangeError(`live battle deployment is illegal: ${decision.reason}`);
  return { cardId: command.cardId, point: { ...point }, sequence, side: command.side, tick };
}

function otherSide(side) {
  return side === "north" ? "south" : "north";
}

function squaredDistance(left, right) {
  const dx = BigInt(left.x) - BigInt(right.x);
  const dy = BigInt(left.y) - BigInt(right.y);
  return dx * dx + dy * dy;
}

function targetMode(value) {
  return value === "ground-and-air" ? "air_and_ground" : value;
}

function layerEligible(mode, layer) {
  return mode === "air_and_ground" || mode === layer;
}

function nearestGroundNode(point, occupied = new Set()) {
  let best = null;
  let bestDistance = null;
  for (const candidate of GROUND_NODES) {
    if (!occupied.has(`${candidate.x}:${candidate.y}`)) {
      const distance = squaredDistance(candidate, point);
      if (best === null || distance < bestDistance ||
          (distance === bestDistance && (candidate.y < best.y ||
            (candidate.y === best.y && candidate.x < best.x)))) {
        best = candidate;
        bestDistance = distance;
      }
    }
  }
  if (best === null) throw new RangeError("no ground navigation node is available");
  return best;
}

function expandedEntities(card, firstId, questionValues) {
  const entities = [];
  let id = firstId;
  for (const component of card.entities) {
    const radius = resolveQuestion(component.bodyRadiusPolicy, questionValues);
    const projectileSpeed = component.projectileSpeedPolicy.kind === "question"
      ? resolveQuestion(component.projectileSpeedPolicy, questionValues)
      : null;
    for (let memberIndex = 0; memberIndex < component.count; memberIndex += 1) {
      entities.push({ component, id, memberIndex, projectileSpeed, radius });
      id += 1;
    }
  }
  return entities;
}

function placedEntities(card, point, firstId, questionValues) {
  const expanded = expandedEntities(card, firstId, questionValues);
  const laidOut = layoutFormation(point, expanded.map(({ component, id, radius }) => ({
    id,
    radius,
    role: component.role,
  })));
  const occupied = new Set();
  return expanded.map((entry, index) => {
    const desired = laidOut[index].position;
    const position = entry.component.layer === "ground"
      ? nearestGroundNode(desired, occupied)
      : desired;
    if (entry.component.layer === "ground") occupied.add(`${position.x}:${position.y}`);
    return { ...entry, position };
  });
}

function combatSpec(entity, side) {
  const component = entity.component;
  return {
    cadenceTicks: component.hitSpeedTicks,
    damage: component.damage,
    delivery: component.delivery,
    deployTicks: component.deployTimeTicks,
    firstHitTicks: component.firstHitTicks,
    id: entity.id,
    layer: component.layer,
    maxHealth: component.hitpoints,
    position: { ...entity.position },
    projectileSpeed: entity.projectileSpeed,
    radius: entity.radius,
    reach: component.rangeMillitiles,
    side,
    sightRange: component.sightRangeMillitiles,
    targetMode: targetMode(component.targetMode),
  };
}

function movementWitnesses(movements, metadata) {
  return [...movements].sort(([left], [right]) => left - right).map(([id, movement]) => ({
    bytes: movement.serialize(),
    id,
    targetKey: metadata.get(id).targetKey,
  }));
}

function compactLiveHistory(history) {
  const transcript = [];
  for (let index = 0; index < history.length;) {
    const operation = history[index];
    if (operation.type !== "step") {
      transcript.push(clone(operation));
      index += 1;
      continue;
    }
    let ticks = 1;
    while (history[index + ticks]?.type === "step" &&
        history[index + ticks].tick === operation.tick + ticks) ticks += 1;
    transcript.push({ tick: operation.tick, ticks, type: "step-run" });
    index += ticks;
  }
  return transcript;
}

export class LiveBattle {
  #battle;
  #events;
  #history;
  #metadata;
  #movements;
  #nextEntityId;
  #pending;
  #questionValues;
  #rosterById;
  #setup;

  constructor(value) {
    const setup = admittedSetup(value);
    this.#battle = new BattleTowerCombat({
      initialWindupTicks: setup.initialWindupTicks,
      units: [],
    });
    this.#events = [];
    this.#history = [];
    this.#metadata = new Map();
    this.#movements = new Map();
    this.#nextEntityId = 1;
    this.#pending = [];
    this.#setup = setup;
    this.#questionValues = new Map(setup.questions.map(({ key, value: answer }) => [key, answer]));
    this.#rosterById = new Map(setup.roster.map((card) => [card.id, card]));
  }

  get state() {
    const state = this.#battle.state;
    return freeze({
      activationHistory: clone(state.activationHistory),
      pendingDeployments: clone(this.#pending),
      projectiles: clone(state.projectiles),
      tick: state.tick,
      towers: clone(state.towers),
      units: state.units.map((unit) => ({
        ...clone(unit),
        archetypeId: this.#metadata.get(unit.id).archetypeId,
        cardId: this.#metadata.get(unit.id).cardId,
        memberIndex: this.#metadata.get(unit.id).memberIndex,
        movement: unit.alive ? clone(this.#movements.get(unit.id).state) : null,
        role: this.#metadata.get(unit.id).role,
      })),
    });
  }

  get events() {
    return freeze(clone(this.#events));
  }

  get replay() {
    return this.events;
  }

  /** Returns an independent transactional continuation without history replay. */
  fork() {
    return this.#runtimeClone();
  }

  scheduleDeploy(command) {
    if (this.#history.length >= MAX_HISTORY || this.#pending.length >= MAX_LIVE_BATTLE_DEPLOYMENTS) {
      throw new RangeError("live battle deployment/history bound exceeded");
    }
    const checked = checkedDeploy(command, this.#battle.state.tick, this.#rosterById);
    if (this.#pending.some((entry) =>
      entry.tick === checked.tick && entry.sequence === checked.sequence)) {
      throw new RangeError("live battle deployment tick/sequence must be unique");
    }
    this.#pending.push(clone(checked));
    this.#pending.sort((left, right) => left.tick - right.tick ||
      left.sequence - right.sequence || left.side.localeCompare(right.side));
    this.#history.push({ command: clone(checked), type: "deploy" });
    const event = { ...clone(checked), scheduledAt: this.#battle.state.tick, type: "deploy-scheduled" };
    this.#events.push(event);
    return freeze(clone(event));
  }

  step(tick = this.#battle.state.tick) {
    integer(tick, 0, MAX_LIVE_BATTLE_STEP_TICKS, "live battle step tick");
    if (tick !== this.#battle.state.tick) throw new RangeError("live battle step tick is not current");
    if (this.#history.length >= MAX_HISTORY) throw new RangeError("live battle history bound exceeded");
    this.#preflightBoundary();
    const candidate = this.#runtimeClone();
    const events = candidate.#advance();
    this.#adopt(candidate);
    return freeze(clone(events));
  }

  stepMany(ticks) {
    integer(ticks, 0, MAX_LIVE_BATTLE_STEP_TICKS, "live battle step ticks");
    if (this.#battle.state.tick + ticks > MAX_LIVE_BATTLE_STEP_TICKS) {
      throw new RangeError("live battle tick bound exceeded");
    }
    if (this.#history.length + ticks > MAX_HISTORY) throw new RangeError("live battle history bound exceeded");
    const candidate = this.#runtimeClone();
    const events = [];
    for (let count = 0; count < ticks; count += 1) events.push(...candidate.#advance());
    this.#adopt(candidate);
    return freeze(clone(events));
  }

  serialize() {
    const tailStart = Math.max(0, this.#history.length - EXPLICIT_HISTORY_TAIL);
    const serialized = canonical({
      battle: this.#battle.serialize(),
      history: this.#history.slice(tailStart),
      movements: movementWitnesses(this.#movements, this.#metadata),
      setup: this.#setup,
      transcript: compactLiveHistory(this.#history.slice(0, tailStart)),
      version: 2,
    });
    if (new TextEncoder().encode(serialized).byteLength > MAX_SNAPSHOT_BYTES) {
      throw new RangeError("serialized live battle exceeds the byte bound");
    }
    return serialized;
  }

  static restore(serialized) {
    if (typeof serialized !== "string") throw new TypeError("serialized live battle must be a string");
    if (new TextEncoder().encode(serialized).byteLength > MAX_SNAPSHOT_BYTES) {
      throw new RangeError("serialized live battle exceeds the byte bound");
    }
    let snapshot;
    try { snapshot = JSON.parse(serialized); }
    catch { throw new TypeError("serialized live battle must be valid JSON"); }
    preflightParsedGraph(snapshot, SNAPSHOT_GRAPH_LIMITS, "live battle snapshot");
    if (canonical(snapshot) !== serialized) throw new TypeError("serialized live battle must be canonical JSON");
    const snapshotShape = plain(snapshot, "live battle snapshot");
    const version = snapshotShape.version?.value;
    const checked = version === 1
      ? exact(snapshot, ["battle", "history", "movements", "setup", "version"],
        "live battle snapshot")
      : version === 2
        ? exact(snapshot, ["battle", "history", "movements", "setup", "transcript", "version"],
          "live battle snapshot")
        : (() => { throw new TypeError("unsupported live battle snapshot version"); })();
    const history = denseArray(checked.history, "live battle snapshot.history", MAX_HISTORY);
    const transcript = version === 2
      ? denseArray(checked.transcript, "live battle snapshot.transcript", MAX_HISTORY)
      : [];
    let expandedOperations = history.length;
    for (let index = 0; index < transcript.length; index += 1) {
      const descriptors = plain(transcript[index], `live battle snapshot.transcript[${index}]`);
      let added = 1;
      if (descriptors.type?.value === "step-run") {
        const tick = integer(descriptors.tick?.value, 0, MAX_LIVE_BATTLE_STEP_TICKS,
          `transcript[${index}].tick`);
        added = integer(descriptors.ticks?.value, 1, MAX_HISTORY, `transcript[${index}].ticks`);
        if (added > MAX_LIVE_BATTLE_STEP_TICKS - tick) {
          throw new RangeError("live battle transcript tick bound exceeded");
        }
      }
      if (added > MAX_HISTORY - expandedOperations) {
        throw new RangeError("live battle transcript operation bound exceeded");
      }
      expandedOperations += added;
    }
    const restored = new LiveBattle(checkedSetup(checked.setup));
    const replayOperation = (operation, index, label) => {
      plain(operation, `live battle snapshot.history[${index}]`);
      if (operation.type === "deploy") {
        const entry = exact(operation, ["command", "type"], `history[${index}]`);
        restored.scheduleDeploy(entry.command);
      } else if (operation.type === "step") {
        const entry = exact(operation, ["tick", "type"], `history[${index}]`);
        integer(entry.tick, 0, MAX_LIVE_BATTLE_STEP_TICKS, `history[${index}].tick`);
        if (entry.tick !== restored.state.tick) throw new TypeError("noncausal live battle step history");
        restored.#advance();
      } else throw new TypeError(`live battle snapshot.${label}[${index}] is invalid`);
    };
    if (version === 2) {
      let operations = 0;
      for (const [index, record] of transcript.entries()) {
        plain(record, `live battle snapshot.transcript[${index}]`);
        if (record.type === "step-run") {
          const run = exact(record, ["tick", "ticks", "type"], `transcript[${index}]`);
          const ticks = integer(run.ticks, 1, MAX_HISTORY, `transcript[${index}].ticks`);
          for (let count = 0; count < ticks; count += 1) {
            replayOperation({ tick: run.tick + count, type: "step" }, index, "transcript");
          }
          operations += ticks;
        } else {
          replayOperation(record, index, "transcript");
          operations += 1;
        }
        if (operations > MAX_HISTORY) throw new RangeError("live battle transcript operation bound exceeded");
      }
      for (const [index, operation] of history.entries()) {
        replayOperation(operation, index, "history");
      }
    } else {
      for (const [index, operation] of history.entries()) {
        replayOperation(operation, index, "history");
      }
    }
    const battleWitnessMatches = version === 2
      ? restored.#battle.serialize() === checked.battle
      : (() => {
        const legacy = BattleTowerCombat.restore(checked.battle);
        if (JSON.parse(checked.battle).version !== 1) {
          throw new TypeError("live battle and battle tower snapshot versions are mixed");
        }
        return canonical(legacy.state) === canonical(restored.#battle.state) &&
          canonical(legacy.replay) === canonical(restored.#battle.replay);
      })();
    if (!battleWitnessMatches || canonical(movementWitnesses(restored.#movements, restored.#metadata)) !==
          canonical(checked.movements) || (version === 2 && restored.serialize() !== serialized)) {
      throw new TypeError("live battle snapshot witnesses are not causal");
    }
    return restored;
  }

  #advance() {
    this.#preflightBoundary();
    const tick = this.#battle.state.tick;
    const boundary = [];
    const due = this.#pending.filter((entry) => entry.tick === tick);
    this.#pending = this.#pending.filter((entry) => entry.tick !== tick);
    for (const deployment of due) boundary.push(...this.#materialize(deployment));

    const before = this.#battle.state;
    const positionCommands = [];
    for (const unit of before.units.filter(({ alive }) => alive).sort((a, b) => a.id - b.id)) {
      const movement = this.#movements.get(unit.id);
      const desired = this.#desiredTarget(unit, before);
      const metadata = this.#metadata.get(unit.id);
      if (desired.key !== metadata.targetKey) {
        if (desired.target === null) {
          if (movement.state.target !== null) movement.stop();
        } else movement.setTarget(desired.target);
        metadata.targetKey = desired.key;
      }
      const movementEvents = movement.step();
      if (movementEvents.length > 0) {
        boundary.push(...movementEvents.map((event) => ({
          event: clone(event), tick, type: "movement", unitId: unit.id,
        })));
      }
      if (movement.state.position.x !== unit.position.x || movement.state.position.y !== unit.position.y) {
        positionCommands.push({
          id: unit.id,
          position: movement.state.position,
        });
      }
    }
    if (positionCommands.length > 0) {
      boundary.push(...this.#battle.updatePositions({ positions: positionCommands, tick }));
    }
    boundary.push(...this.#battle.step(tick));
    this.#history.push({ tick, type: "step" });
    this.#events.push(...clone(boundary));
    return boundary;
  }

  #preflightBoundary() {
    const tick = this.#battle.state.tick;
    const due = this.#pending.filter((entry) => entry.tick === tick);
    const added = due.reduce((sum, deployment) => {
      const card = this.#rosterById.get(deployment.cardId);
      if (card === undefined) throw new TypeError("live battle pending card identity is unknown");
      return sum + card.formation.totalCount;
    }, 0);
    const existing = this.#battle.state.units.length;
    if (!Number.isSafeInteger(added) || existing + added > MAX_LIVE_BATTLE_UNITS) {
      throw new RangeError("live battle boundary unit capacity exceeded");
    }
    if (this.#nextEntityId + added > Number.MAX_SAFE_INTEGER) {
      throw new RangeError("live battle entity identity capacity exceeded");
    }
  }

  #materialize(deployment) {
    const card = this.#rosterById.get(deployment.cardId);
    const entities = placedEntities(card, deployment.point, this.#nextEntityId,
      this.#questionValues);
    const events = [];
    for (const entity of entities) {
      const spec = combatSpec(entity, deployment.side);
      events.push(this.#battle.spawn({ ...spec, tick: deployment.tick }));
      const movement = new BattleMovement({
        bodyRadius: entity.radius,
        mode: entity.component.layer,
        position: entity.position,
        speed: entity.component.movementMillitilesPerSecond,
      });
      movement.stepMany(deployment.tick);
      this.#movements.set(entity.id, movement);
      this.#metadata.set(entity.id, {
        archetypeId: entity.component.archetypeId,
        cardId: card.id,
        memberIndex: entity.memberIndex,
        role: entity.component.role,
        targetKey: null,
      });
    }
    this.#nextEntityId += entities.length;
    events.push({
      cardId: card.id,
      entityIds: entities.map(({ id }) => id),
      point: { ...deployment.point },
      sequence: deployment.sequence,
      side: deployment.side,
      tick: deployment.tick,
      type: "deployed",
    });
    return events;
  }

  #desiredTarget(unit, state) {
    const metadata = this.#metadata.get(unit.id);
    const enemies = state.units.filter((candidate) => candidate.alive && candidate.side !== unit.side &&
      layerEligible(unit.targetMode, candidate.layer));
    enemies.sort((left, right) => {
      const distance = squaredDistance(unit.position, left.position) -
        squaredDistance(unit.position, right.position);
      return distance < 0n ? -1 : distance > 0n ? 1 : left.id - right.id;
    });
    const sight = BigInt(unit.radius + unit.sightRange + (enemies[0]?.radius ?? 0));
    const enemy = enemies[0] !== undefined &&
      squaredDistance(unit.position, enemies[0].position) <= sight * sight ? enemies[0] : null;
    if (enemy !== null) {
      const inReach = BigInt(unit.radius + unit.reach + enemy.radius);
      if (squaredDistance(unit.position, enemy.position) <= inReach * inReach) {
        return { key: `hold-unit:${enemy.id}`, target: null };
      }
      const point = unit.layer === "ground" ? nearestGroundNode(enemy.position) : enemy.position;
      return {
        key: `unit:${enemy.id}:${point.x}:${point.y}`,
        target: { position: point, radius: enemy.radius, range: unit.reach },
      };
    }
    const towers = state.towers.filter((tower) => tower.hitpoints > 0 && tower.side === otherSide(unit.side));
    towers.sort((left, right) => {
      const distance = squaredDistance(unit.position, left.position) -
        squaredDistance(unit.position, right.position);
      return distance < 0n ? -1 : distance > 0n ? 1 : left.id.localeCompare(right.id);
    });
    if (towers.length === 0) return { key: "idle", target: null };
    const targetTower = towers[0];
    const towerKey = `tower:${targetTower.id}`;
    if (metadata.targetKey === towerKey) return { key: towerKey, target: null };
    const point = unit.layer === "ground" ? nearestGroundNode(targetTower.position) : targetTower.position;
    return {
      key: towerKey,
      target: { position: point, radius: 0, range: unit.reach },
    };
  }

  #runtimeClone() {
    const candidate = new LiveBattle(this.#setup);
    candidate.#battle = this.#battle.fork();
    candidate.#events = [...this.#events];
    candidate.#history = [...this.#history];
    candidate.#metadata = new Map([...this.#metadata].map(([id, data]) => [id, clone(data)]));
    candidate.#movements = new Map([...this.#movements].map(([id, movement]) =>
      [id, BattleMovement.restore(movement.serialize())]));
    candidate.#nextEntityId = this.#nextEntityId;
    candidate.#pending = clone(this.#pending);
    candidate.#questionValues = new Map(this.#questionValues);
    candidate.#setup = this.#setup;
    candidate.#rosterById = new Map(candidate.#setup.roster.map((card) => [card.id, card]));
    return candidate;
  }

  #adopt(candidate) {
    this.#battle = candidate.#battle;
    this.#events = candidate.#events;
    this.#history = candidate.#history;
    this.#metadata = candidate.#metadata;
    this.#movements = candidate.#movements;
    this.#nextEntityId = candidate.#nextEntityId;
    this.#pending = candidate.#pending;
    this.#questionValues = candidate.#questionValues;
    this.#rosterById = candidate.#rosterById;
    this.#setup = candidate.#setup;
  }
}

export function getLiveBattlePlayableCardIds(setup) {
  return freeze(admittedSetup(setup).roster.map(({ id }) => id));
}
