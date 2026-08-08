import { DeckCycle } from "./deck.js";
import { ELIXIR_MATCH_TICKS, ElixirMatch } from "./elixir.js";
import { LiveBattle } from "./live-battle.js";
import { OpponentController } from "./opponent-controller.js";

export const GAME_OPPONENT_ALGORITHM = "north-opponent-battle-transaction-v1";
export const GAME_OPPONENT_MAX_BATCH_TICKS = 4_096;

export const GAME_OPPONENT_SETUP_GRAPH_LIMITS = Object.freeze({
  arrayLength: 4_096,
  containers: 4_096,
  depth: 64,
  keys: 128,
  nodes: 12_000,
  stringLength: 1_048_576,
});
export const GAME_OPPONENT_SNAPSHOT_GRAPH_LIMITS = Object.freeze({
  arrayLength: 100_000,
  containers: 100_000,
  depth: 128,
  keys: 1_024,
  nodes: 200_000,
  stringLength: 8_388_608,
});

export const GAME_OPPONENT_MAX_SETUP_BYTES = 2 * 1_024 * 1_024;
export const GAME_OPPONENT_MAX_SNAPSHOT_BYTES = 16 * 1_024 * 1_024;
const CARD_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const PROTOTYPE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ROOT_OPAQUE_SETUP_KEYS = new Set(["battleSetup", "rosterWitness"]);
const SETUP_KEYS = [
  "battleSetup", "deck", "legalNorthDeployments", "rosterWitness", "seed",
  "startingElixir", "thinkIntervalTicks", "thinkOffsetTicks",
];

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
      Object.getPrototypeOf(value) !== Object.prototype ||
      Object.getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError(`${label} must be a plain data object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Object.keys(descriptors).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length ||
      actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has an invalid shape`);
  }
  for (const key of actual) {
    if (!descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value")) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
  }
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function dense(value, maximum, label) {
  if (!Array.isArray(value) || value.length > maximum ||
      Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError(`${label} must be a bounded plain array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) {
    throw new TypeError(`${label} must be dense`);
  }
  return Array.from({ length: value.length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
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

function cardId(value, label) {
  if (typeof value !== "string" || !CARD_ID.test(value)) {
    throw new TypeError(`${label} must be a canonical card id`);
  }
  return value;
}

function scalarByteLength(value, label) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) {
        throw new TypeError(`${label} must contain only Unicode scalar values`);
      }
      bytes += 4;
      index += 1;
    } else if (code >= 0xDC00 && code <= 0xDFFF) {
      throw new TypeError(`${label} must contain only Unicode scalar values`);
    } else if (code <= 0x7F) bytes += 1;
    else if (code <= 0x7FF) bytes += 2;
    else bytes += 3;
  }
  return bytes;
}

function preflightParsedGraph(root, limits, label, options = {}) {
  const pending = [{ depth: 0, stringLength: limits.stringLength, value: root }];
  let containers = 0;
  let nodes = 0;
  while (pending.length > 0) {
    const { depth, stringLength, value } = pending.pop();
    nodes += 1;
    if (nodes > limits.nodes) throw new RangeError(`${label} node bound exceeded`);
    if (depth > limits.depth) throw new RangeError(`${label} depth bound exceeded`);
    if (typeof value === "string") {
      if (value.length > stringLength) {
        throw new RangeError(`${label} string length bound exceeded`);
      }
      scalarByteLength(value, label);
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
    if (containers > limits.containers) {
      throw new RangeError(`${label} container bound exceeded`);
    }
    if (Array.isArray(value)) {
      if (value.length > limits.arrayLength) {
        throw new RangeError(`${label} array length bound exceeded`);
      }
      for (let index = value.length - 1; index >= 0; index -= 1) {
        pending.push({ depth: depth + 1, stringLength: limits.stringLength,
          value: value[index] });
      }
      continue;
    }
    const keys = Object.keys(value);
    if (keys.length > limits.keys) throw new RangeError(`${label} key bound exceeded`);
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (key.length > limits.stringLength) {
        throw new RangeError(`${label} key string length bound exceeded`);
      }
      scalarByteLength(key, `${label} key`);
      if (PROTOTYPE_KEYS.has(key)) {
        throw new TypeError(`${label} contains a forbidden prototype-like key`);
      }
      const childStringLength = depth === 0 &&
          options.rootOpaqueStringKeys?.has(key)
        ? options.rootOpaqueStringLength
        : limits.stringLength;
      pending.push({ depth: depth + 1, stringLength: childStringLength,
        value: value[key] });
    }
  }
}

function parseCanonicalJson(serialized, maximum, limits, label, preflightOptions) {
  if (typeof serialized !== "string") throw new TypeError(`${label} must be canonical JSON text`);
  if (scalarByteLength(serialized, label) > maximum) {
    throw new RangeError(`${label} exceeds its byte bound`);
  }
  let parsed;
  try { parsed = JSON.parse(serialized); }
  catch { throw new TypeError(`${label} must be valid JSON`); }
  preflightParsedGraph(parsed, limits, label, preflightOptions);
  if (canonical(parsed) !== serialized) throw new TypeError(`${label} must be canonical JSON`);
  return parsed;
}

function compareDeployment(left, right) {
  return (left.cardId < right.cardId ? -1 : left.cardId > right.cardId ? 1 : 0) ||
    left.point.x - right.point.x || left.point.y - right.point.y;
}

function validateSetup(serialized) {
  const raw = exact(parseCanonicalJson(serialized, GAME_OPPONENT_MAX_SETUP_BYTES,
    GAME_OPPONENT_SETUP_GRAPH_LIMITS,
    "opponent battle setup", {
      rootOpaqueStringKeys: ROOT_OPAQUE_SETUP_KEYS,
      rootOpaqueStringLength: GAME_OPPONENT_MAX_SETUP_BYTES,
    }), SETUP_KEYS, "opponent battle setup");
  if (typeof raw.battleSetup !== "string") {
    throw new TypeError("battleSetup must be canonical LiveBattle setup text");
  }
  if (typeof raw.rosterWitness !== "string") {
    throw new TypeError("rosterWitness must be canonical JSON text");
  }
  const admittedBattleSetup = parseCanonicalJson(raw.battleSetup, GAME_OPPONENT_MAX_SETUP_BYTES,
    GAME_OPPONENT_SETUP_GRAPH_LIMITS,
    "setup.battleSetup");
  const battleFields = exact(admittedBattleSetup,
    ["initialWindupTicks", "questions", "roster"], "setup.battleSetup");
  const roster = dense(battleFields.roster, 8, "setup.battleSetup.roster");
  const closureWitness = { questions: battleFields.questions, roster };
  const witnessedClosure = exact(parseCanonicalJson(raw.rosterWitness,
    GAME_OPPONENT_MAX_SETUP_BYTES, GAME_OPPONENT_SETUP_GRAPH_LIMITS,
    "setup.rosterWitness"),
  ["questions", "roster"],
  "setup.rosterWitness");
  const witnessedRoster = dense(witnessedClosure.roster, 8,
    "setup.rosterWitness.roster");
  if (roster.length !== 8 || witnessedRoster.length !== 8 ||
      raw.rosterWitness !== canonical(closureWitness)) {
    throw new TypeError("rosterWitness must exactly match the admitted eight-card roster and questions");
  }
  const rosterAuthority = roster.map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError(`admitted roster[${index}] must be a card record`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(entry);
    if (!descriptors.id || !Object.hasOwn(descriptors.id, "value") ||
        !descriptors.cost || !Object.hasOwn(descriptors.cost, "value")) {
      throw new TypeError(`admitted roster[${index}] must expose id and cost data`);
    }
    return { cardId: cardId(descriptors.id.value, `admitted roster[${index}].id`),
      cost: integer(descriptors.cost.value, 1, 10, `admitted roster[${index}].cost`) };
  });
  if (new Set(rosterAuthority.map(({ cardId: id }) => id)).size !== 8) {
    throw new TypeError("admitted roster card ids must be unique");
  }
  const deck = dense(raw.deck, 8, "setup.deck").map((id, index) =>
    cardId(id, `setup.deck[${index}]`));
  if (deck.length !== 8 || new Set(deck).size !== 8 ||
      deck.some((id, index) => id !== rosterAuthority[index].cardId)) {
    throw new TypeError("setup.deck must exactly match the admitted roster order");
  }
  const candidates = dense(raw.legalNorthDeployments, 1_024,
    "setup.legalNorthDeployments").map((entry, index) => {
    const checked = exact(entry, ["cardId", "point"],
      `setup.legalNorthDeployments[${index}]`);
    const point = exact(checked.point, ["x", "y"],
      `setup.legalNorthDeployments[${index}].point`);
    return { cardId: cardId(checked.cardId,
      `setup.legalNorthDeployments[${index}].cardId`), point: {
      x: integer(point.x, 0, 1_000_000, `candidate[${index}].point.x`),
      y: integer(point.y, 0, 1_000_000, `candidate[${index}].point.y`),
    } };
  });
  if (candidates.some(({ cardId: id }) => !deck.includes(id)) ||
      candidates.some((entry, index) => index > 0 &&
        compareDeployment(candidates[index - 1], entry) >= 0)) {
    throw new TypeError("legal north deployments must be unique, canonical, and in the deck");
  }
  const startingElixir = exact(raw.startingElixir, ["north", "south"],
    "setup.startingElixir");
  integer(startingElixir.north, 0, 10, "setup.startingElixir.north");
  integer(startingElixir.south, 0, 10, "setup.startingElixir.south");
  if (!((typeof raw.seed === "string" && scalarByteLength(raw.seed,
      "setup.seed") <= 256) ||
      Number.isSafeInteger(raw.seed))) throw new TypeError("setup.seed is invalid");
  integer(raw.thinkIntervalTicks, 1, 3_600, "setup.thinkIntervalTicks");
  integer(raw.thinkOffsetTicks, 0, raw.thinkIntervalTicks - 1,
    "setup.thinkOffsetTicks");

  const probe = new LiveBattle(raw.battleSetup);
  candidates.forEach((entry, sequence) => probe.scheduleDeploy(canonical({
    cardId: entry.cardId, point: entry.point, sequence, side: "north", tick: 0,
  })));
  return { costs: freeze(clone(rosterAuthority)), setup: freeze(clone({ ...raw,
    deck, legalNorthDeployments: candidates, startingElixir })) };
}

export class OpponentBattleRuntime {
  #battle;
  #controller;
  #costs;
  #deck;
  #elixir;
  #events = [];
  #history = [];
  #legal;
  #setup;

  constructor(canonicalSetup) {
    const admitted = validateSetup(canonicalSetup);
    this.#setup = admitted.setup;
    this.#costs = new Map(admitted.costs.map(({ cardId: id, cost }) => [id, cost]));
    this.#legal = this.#setup.legalNorthDeployments;
    this.#deck = new DeckCycle({ deck: this.#setup.deck, seed: this.#setup.seed });
    this.#elixir = new ElixirMatch({ startingElixir: this.#setup.startingElixir });
    this.#controller = new OpponentController({ seed: this.#setup.seed,
      thinkIntervalTicks: this.#setup.thinkIntervalTicks,
      thinkOffsetTicks: this.#setup.thinkOffsetTicks });
    this.#battle = new LiveBattle(this.#setup.battleSetup);
  }

  get state() {
    return freeze({ battle: clone(this.#battle.state), controller: clone(this.#controller.state),
      deck: clone(this.#deck.state), elixir: clone(this.#elixir.state),
      tick: this.#battle.state.tick });
  }

  get events() { return freeze(clone(this.#events)); }
  get replay() { return this.events; }
  replayBytes() { return canonical(this.#events); }

  step(tick = this.#battle.state.tick) {
    integer(tick, 0, ELIXIR_MATCH_TICKS - 1, "opponent battle step tick");
    if (tick !== this.#battle.state.tick) throw new RangeError("opponent battle step tick is not current");
    return this.stepMany(1);
  }

  stepMany(count) {
    integer(count, 0, GAME_OPPONENT_MAX_BATCH_TICKS, "opponent battle step count");
    if (this.#battle.state.tick + count > ELIXIR_MATCH_TICKS) {
      throw new RangeError("opponent battle tick bound exceeded");
    }
    const candidate = this.#runtimeClone();
    const events = candidate.#advanceMany(count);
    candidate.serialize();
    this.#adopt(candidate);
    return freeze(clone(events));
  }

  serialize() {
    const serialized = canonical({ algorithm: GAME_OPPONENT_ALGORITHM,
      battle: this.#battle.serialize(), controller: this.#controller.serialize(),
      deck: this.#deck.serializeJson(), elixir: this.#elixir.serialize(),
      history: this.#history, setup: this.#setup, version: 1 });
    if (scalarByteLength(serialized, "opponent battle snapshot") >
        GAME_OPPONENT_MAX_SNAPSHOT_BYTES) {
      throw new RangeError("opponent battle snapshot exceeds its byte bound");
    }
    return serialized;
  }

  static restore(serialized) {
    const snapshot = exact(parseCanonicalJson(serialized,
      GAME_OPPONENT_MAX_SNAPSHOT_BYTES,
      GAME_OPPONENT_SNAPSHOT_GRAPH_LIMITS,
      "opponent battle snapshot"), ["algorithm", "battle", "controller", "deck",
      "elixir", "history", "setup", "version"], "opponent battle snapshot");
    if (snapshot.algorithm !== GAME_OPPONENT_ALGORITHM || snapshot.version !== 1) {
      throw new TypeError("unsupported opponent battle snapshot version");
    }
    const history = dense(snapshot.history, ELIXIR_MATCH_TICKS, "snapshot.history");
    const runtime = new OpponentBattleRuntime(canonical(snapshot.setup));
    history.forEach((entry, index) => {
      const checked = exact(entry, ["tick", "type"], `snapshot.history[${index}]`);
      if (checked.type !== "step" || checked.tick !== index) {
        throw new TypeError("opponent battle history is not causal");
      }
    });
    runtime.#advanceMany(history.length);
    if (runtime.#battle.serialize() !== snapshot.battle ||
        runtime.#controller.serialize() !== snapshot.controller ||
        runtime.#deck.serializeJson() !== snapshot.deck ||
        runtime.#elixir.serialize() !== snapshot.elixir ||
        runtime.serialize() !== serialized) {
      throw new TypeError("opponent battle snapshot witnesses are not causal");
    }
    return runtime;
  }

  #advanceMany(count) {
    const firstTick = this.#battle.state.tick;
    if (this.#controller.state.nextTick !== firstTick || this.#elixir.tick !== firstTick) {
      throw new Error("opponent battle subsystem ticks diverged");
    }
    const staged = [];
    const battleEvents = [];
    for (let offset = 0; offset < count; offset += 1) {
      const tick = firstTick + offset;
      const hand = this.#deck.state.hand;
      const observation = {
        legalNorthDeployments: this.#legal.filter(({ cardId: id }) => hand.includes(id)),
        northCardCosts: hand.map((id) => ({ cardId: id, cost: this.#costs.get(id) }))
          .sort((left, right) => left.cardId < right.cardId ? -1 : 1),
        northElixir: this.#elixir.state.sides.north.amount,
        northHand: hand,
        tick,
      };
      const proposals = this.#controller.step(observation);
      if (proposals.length > 1) throw new Error("controller emitted multiple proposals for one tick");
      const proposal = proposals[0] ?? null;
      let commit = null;
      let spendSequence = null;
      if (proposal !== null) {
        const legal = observation.legalNorthDeployments.some((entry) =>
          entry.cardId === proposal.cardId && entry.point.x === proposal.point.x &&
          entry.point.y === proposal.point.y);
        const slot = hand.indexOf(proposal.cardId);
        const cost = this.#costs.get(proposal.cardId);
        if (!legal || slot < 0 || !Number.isInteger(cost) || cost > observation.northElixir ||
            proposal.tick !== tick || proposal.side !== "north" || proposal.type !== "deploy") {
          throw new Error("controller proposal diverged from its current observation");
        }
        spendSequence = this.#elixir.scheduleSpend(tick, "north", cost);
      }
      const elixirEvents = this.#elixir.step();
      if (proposal !== null) {
        const spend = elixirEvents.find((event) => event.type === "spend" &&
          event.sequence === spendSequence);
        if (!spend?.accepted) throw new Error("proposed deployment spend was rejected");
        const cycle = this.#deck.play(proposal.cardId);
        if (!cycle.accepted) throw new Error("proposed deployment deck cycle was rejected");
        battleEvents.push(...this.#battle.stepMany(tick - this.#battle.state.tick));
        this.#battle.scheduleDeploy(canonical({ cardId: proposal.cardId,
          point: proposal.point, sequence: proposal.sequence, side: proposal.side,
          tick: proposal.tick }));
        commit = { cardId: proposal.cardId, commandId: `north:${proposal.sequence}`,
          cycle: { drawnCard: cycle.drawnCard, sequence: cycle.sequence, slot: cycle.slot },
          point: proposal.point, proposalSequence: proposal.sequence,
          spendSequence, tick, type: "opponent-deployment-committed" };
      }
      staged.push({ commit, decision: { observation, proposal, tick,
        type: "opponent-decision" } });
    }
    battleEvents.push(...this.#battle.stepMany(firstTick + count - this.#battle.state.tick));
    const events = [];
    for (const { commit, decision } of staged) {
      events.push(decision);
      if (commit !== null) {
        const deployed = battleEvents.find((event) => event.type === "deployed" &&
          event.tick === commit.tick && event.sequence === commit.proposalSequence &&
          event.cardId === commit.cardId);
        if (!deployed) throw new Error("proposed deployment was not materialized");
        events.push({ ...commit, deployment: { entityIds: deployed.entityIds,
          sequence: commit.proposalSequence } });
      }
      events.push(...battleEvents.filter(({ tick }) => tick === decision.tick));
      this.#history.push({ tick: decision.tick, type: "step" });
    }
    this.#events.push(...clone(events));
    return events;
  }

  #runtimeClone() {
    const runtime = new OpponentBattleRuntime(canonical(this.#setup));
    runtime.#battle = LiveBattle.restore(this.#battle.serialize());
    runtime.#controller = OpponentController.restore(this.#controller.serialize());
    runtime.#deck = DeckCycle.restore(this.#deck.serializeJson());
    runtime.#elixir = ElixirMatch.restore(this.#elixir.serialize());
    runtime.#events = clone(this.#events);
    runtime.#history = clone(this.#history);
    return runtime;
  }

  #adopt(candidate) {
    this.#battle = candidate.#battle;
    this.#controller = candidate.#controller;
    this.#deck = candidate.#deck;
    this.#elixir = candidate.#elixir;
    this.#events = candidate.#events;
    this.#history = candidate.#history;
  }
}
