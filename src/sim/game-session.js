import { DeckCycle } from "./deck.js";
import { ElixirMatch } from "./elixir.js";
import { evaluateDeployment } from "./deployment.js";
import { stageSideDeployment } from "./game-side-deploy.js";
import { LiveBattle } from "./live-battle.js";
import { MATCH_MAX_TICKS, MatchClock } from "./match.js";
import { OpponentController } from "./opponent-controller.js";
import { SessionCardRuntime } from "./session-card-runtime.js";
import { mapBattleTowerIdToMatchTowerId,
  mapLiveBattleTowerStateToMatchEvidence } from "./tower-evidence.js";
import { TOWER_COMBAT_CONFIG } from "./towers.js";

export const GAME_SESSION_MAX_BATCH_TICKS = 18_000;
export const GAME_SESSION_MAX_SETUP_BYTES = 2 * 1_024 * 1_024;
export const GAME_SESSION_MAX_SNAPSHOT_BYTES = 32 * 1_024 * 1_024;
export const GAME_SESSION_MAX_TRANSCRIPT = 20_000;
export const GAME_SESSION_SETUP_GRAPH_LIMITS = Object.freeze({ arrayLength: 4_096,
  containers: 4_096, depth: 64, keys: 128, nodes: 12_000, stringLength: 1_048_576 });
export const GAME_SESSION_SNAPSHOT_GRAPH_LIMITS = Object.freeze({ arrayLength: 20_000,
  containers: 100_000, depth: 128, keys: 1_024, nodes: 200_000,
  stringLength: 8_388_608 });
const COMMAND_GRAPH_LIMITS = Object.freeze({ arrayLength: 32, containers: 32, depth: 8,
  keys: 16, nodes: 64, stringLength: 8_192 });
const SETUP_KEYS = ["battleSetup", "deck", "legalNorthDeployments", "rosterWitness",
  "seed", "startingElixir", "thinkIntervalTicks", "thinkOffsetTicks"];
const authenticGameSessions = new WeakSet();
const authenticGameSessionProjectionSnapshots = new WeakSet();

export function isAuthenticGameSession(value) {
  return authenticGameSessions.has(value);
}

export function isAuthenticGameSessionProjectionSnapshot(value) {
  return authenticGameSessionProjectionSnapshots.has(value);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const clone = (value) => JSON.parse(JSON.stringify(value));
function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) {
  for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
function exact(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${label} must be a plain object`);
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has an invalid shape`);
  }
  return value;
}
function scalarByteLength(text, label) {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = text.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) throw new TypeError(`${label} contains a lone surrogate`);
      bytes += 4; index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError(`${label} contains a lone surrogate`);
    } else bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : 3;
  }
  return bytes;
}
function preflight(value, limits, label) {
  const stack = [{ depth: 0, value }]; let containers = 0, nodes = 0;
  while (stack.length) {
    const current = stack.pop(); nodes += 1;
    if (nodes > limits.nodes) throw new RangeError(`${label} exceeds its node bound`);
    if (current.depth > limits.depth) throw new RangeError(`${label} exceeds its depth bound`);
    const entry = current.value;
    if (typeof entry === "string") {
      if (entry.length > limits.stringLength) throw new RangeError(`${label} exceeds its string bound`);
      scalarByteLength(entry, label); continue;
    }
    if (typeof entry === "number" && (!Number.isSafeInteger(entry) || !Number.isFinite(entry))) {
      throw new TypeError(`${label} contains a non-safe integer`);
    }
    if (entry === null || typeof entry === "boolean" || typeof entry === "number") continue;
    if (!entry || typeof entry !== "object") throw new TypeError(`${label} contains an invalid value`);
    containers += 1;
    if (containers > limits.containers) throw new RangeError(`${label} exceeds its container bound`);
    if (Array.isArray(entry)) {
      if (entry.length > limits.arrayLength) throw new RangeError(`${label} exceeds its array bound`);
      for (let index = entry.length - 1; index >= 0; index -= 1) {
        stack.push({ depth: current.depth + 1, value: entry[index] });
      }
      continue;
    }
    if (Object.getPrototypeOf(entry) !== Object.prototype) throw new TypeError(`${label} contains a non-plain object`);
    const keys = Object.keys(entry);
    if (keys.length > limits.keys) throw new RangeError(`${label} exceeds its key bound`);
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (key.length > limits.stringLength) throw new RangeError(`${label} exceeds its string bound`);
      scalarByteLength(key, label);
      if (["__proto__", "constructor", "prototype"].includes(key)) {
        throw new TypeError(`${label} contains a forbidden key`);
      }
      stack.push({ depth: current.depth + 1, value: entry[key] });
    }
  }
  return value;
}
function parsed(serialized, label, maximum = GAME_SESSION_MAX_SNAPSHOT_BYTES,
  limits = GAME_SESSION_SNAPSHOT_GRAPH_LIMITS) {
  if (typeof serialized !== "string") throw new TypeError(`${label} must be canonical JSON text`);
  if (scalarByteLength(serialized, label) > maximum) throw new RangeError(`${label} exceeds its byte bound`);
  let value; try { value = JSON.parse(serialized); } catch { throw new TypeError(`${label} must be valid JSON`); }
  preflight(value, limits, label);
  if (canonical(value) !== serialized) throw new TypeError(`${label} must be canonical JSON`);
  return value;
}
function validateSetup(bytes) {
  const setup = exact(parsed(bytes, "game session setup", GAME_SESSION_MAX_SETUP_BYTES,
    GAME_SESSION_SETUP_GRAPH_LIMITS),
    SETUP_KEYS, "game session setup");
  parsed(setup.battleSetup, "game session battle setup", GAME_SESSION_MAX_SETUP_BYTES,
    GAME_SESSION_SETUP_GRAPH_LIMITS);
  parsed(setup.rosterWitness, "game session roster witness", GAME_SESSION_MAX_SETUP_BYTES,
    GAME_SESSION_SETUP_GRAPH_LIMITS);
  const battle = new LiveBattle(setup.battleSetup);
  const battleSetup = JSON.parse(setup.battleSetup);
  if (setup.rosterWitness !== canonical({ questions: battleSetup.questions,
    roster: battleSetup.roster })) throw new TypeError("session roster witness diverges");
  const cards = battleSetup.roster.map(({ cost, id }) => ({ cost, id }));
  if (cards.length !== 8 || canonical(setup.deck) !== canonical(cards.map(({ id }) => id))) {
    throw new TypeError("session deck must exactly equal the admitted roster");
  }
  const costs = new Map(cards.map(({ cost, id }) => [id, cost]));
  const cardRuntime = new SessionCardRuntime(canonical(battleSetup.roster.map(({ cost, id, kind }) => ({
    cost, id, kind, placementClass: kind === "effect" ? "global_effect" : "ground_entity",
  }))));
  for (const card of battleSetup.roster) {
    const admitted = cardRuntime.card(card.id);
    if (admitted.cost !== card.cost || admitted.kind !== card.kind) {
      throw new TypeError("session card admission diverges from battle roster");
    }
  }
  const legal = setup.legalNorthDeployments;
  if (!Array.isArray(legal) || legal.length > 1_024) throw new TypeError("north deployments are invalid");
  legal.forEach((raw, sequence) => {
    const entry = exact(raw, ["cardId", "point"], `north deployment ${sequence}`);
    const admitted = cardRuntime.card(entry.cardId);
    const decision = evaluateDeployment({ destroyedOpposingLaneTowers: [],
      placementClass: admitted.placementClass, point: entry.point, side: "north" });
    if (!decision.legal) throw new RangeError(`north deployment is illegal: ${decision.reason}`);
    if (admitted.kind === "unit") battle.scheduleDeploy({ ...entry, sequence,
      side: "north", tick: 0 });
  });
  return { cardRuntime, cards, costs, setup: freeze(clone(setup)) };
}
function initialMatchTowers(battle) {
  const order = ["north:central", "north:lane:left", "north:lane:right",
    "south:central", "south:lane:left", "south:lane:right"];
  return battle.state.towers.map(({ hitpoints, id }) => ({ hitpoints,
    id: mapBattleTowerIdToMatchTowerId(id) })).sort((left, right) =>
    order.indexOf(left.id) - order.indexOf(right.id));
}
function commandText(value) {
  const command = exact(parsed(value, "player session command", 16_384, COMMAND_GRAPH_LIMITS),
    ["cardId", "commandId", "point", "slot", "tick", "type"], "player session command");
  if (command.type !== "deploy" || typeof command.cardId !== "string" ||
      !Number.isSafeInteger(command.commandId) || command.commandId < 0 ||
      !Number.isSafeInteger(command.slot) || command.slot < 0 || command.slot > 3 ||
      !Number.isSafeInteger(command.tick) || command.tick < 0 || command.tick >= MATCH_MAX_TICKS) {
    throw new TypeError("player session command is invalid");
  }
  exact(command.point, ["x", "y"], "player session command.point");
  if (!Number.isSafeInteger(command.point.x) || !Number.isSafeInteger(command.point.y)) {
    throw new TypeError("player session command point is invalid");
  }
  return clone(command);
}

export class GameSession {
  #battle; #cardRuntime; #clock; #controller; #costs; #decks; #elixir; #events = [];
  #history = []; #legal; #nextDeploymentSequence = 0; #paused = false; #pending = [];
  #processed = new Map(); #projectionSequence = 0; #projectionSource = Object.freeze({}); #setup;
  #towerEvidence;

  constructor(canonicalSetup) {
    const checked = validateSetup(canonicalSetup); this.#setup = checked.setup;
    this.#cardRuntime = checked.cardRuntime;
    this.#costs = checked.costs; this.#legal = this.#setup.legalNorthDeployments;
    this.#battle = new LiveBattle(this.#setup.battleSetup);
    this.#elixir = new ElixirMatch({ startingElixir: this.#setup.startingElixir });
    this.#decks = { north: new DeckCycle({ deck: this.#setup.deck, seed: `${this.#setup.seed}:north` }),
      south: new DeckCycle({ deck: this.#setup.deck, seed: `${this.#setup.seed}:south` }) };
    this.#controller = new OpponentController({ seed: this.#setup.seed,
      thinkIntervalTicks: this.#setup.thinkIntervalTicks,
      thinkOffsetTicks: this.#setup.thinkOffsetTicks });
    this.#clock = new MatchClock({ initialTowers: initialMatchTowers(this.#battle) });
    this.#towerEvidence = mapLiveBattleTowerStateToMatchEvidence(this.#battle.state.towers);
    if (new.target === GameSession) authenticGameSessions.add(this);
  }

  get state() { return freeze({ battle: clone(this.#battle.state),
    cardRuntime: clone(this.#cardRuntime.state), clock: clone(this.#clock.state),
    decks: { north: clone(this.#decks.north.state), south: clone(this.#decks.south.state) },
    elixir: clone(this.#elixir.state), opponent: clone(this.#controller.state),
    paused: this.#paused, pendingPlayerCommands: clone(this.#pending),
    terminal: this.#clock.state.result !== null, tick: this.#clock.tick }); }
  get replay() { return freeze(clone(this.#events)); }
  replayBytes() { return canonical(this.#events); }

  /**
   * One immutable, module-branded read of every authority needed by browser
   * projections. It does not replay, restore, or expose live mutable state.
   */
  projectionSnapshot() {
    if (!Number.isSafeInteger(this.#projectionSequence) ||
        this.#projectionSequence === Number.MAX_SAFE_INTEGER) {
      throw new RangeError("game session projection sequence bound exceeded");
    }
    const battle = clone(this.#battle.state);
    battle.towers = battle.towers.map((tower) => ({
      ...tower,
      maxHitpoints: TOWER_COMBAT_CONFIG[tower.role].hitpoints,
    }));
    const state = { battle, cardRuntime: clone(this.#cardRuntime.state), clock: clone(this.#clock.state),
      decks: { north: clone(this.#decks.north.state), south: clone(this.#decks.south.state) },
      elixir: clone(this.#elixir.state), opponent: clone(this.#controller.state),
      paused: this.#paused, pendingPlayerCommands: clone(this.#pending),
      terminal: this.#clock.state.result !== null, tick: this.#clock.tick };
    const snapshot = freeze({
      replay: clone(this.#events),
      sequence: this.#projectionSequence,
      setup: clone(this.#setup),
      source: this.#projectionSource,
      state,
      version: 1,
    });
    this.#projectionSequence += 1;
    authenticGameSessionProjectionSnapshots.add(snapshot);
    return snapshot;
  }

  submitPlayerCommand(text) {
    const command = commandText(text), before = this.serialize();
    if (this.#history.length >= GAME_SESSION_MAX_TRANSCRIPT) {
      throw new RangeError("game session transcript exceeds its operation bound");
    }
    if (this.#paused || this.#clock.state.result !== null || command.tick < this.#clock.tick ||
        !this.#costs.has(command.cardId) || this.#processed.has(command.commandId) ||
        this.#pending.some((entry) => entry.commandId === command.commandId || entry.tick === command.tick)) {
      throw new RangeError("player session command is stale, duplicate, terminal, or unknown");
    }
    const placement = evaluateDeployment({ destroyedOpposingLaneTowers: [],
      placementClass: this.#cardRuntime.card(command.cardId).placementClass,
      point: command.point, side: "south" });
    if (!placement.legal) throw new RangeError(`player session command is illegal: ${placement.reason}`);
    if (command.tick === this.#clock.tick &&
        (this.#decks.south.state.hand[command.slot] !== command.cardId ||
         this.#costs.get(command.cardId) > this.#elixir.state.sides.south.amount)) {
      throw new RangeError("player session command is divergent or unaffordable");
    }
    this.#pending.push(command); this.#pending.sort((a, b) => a.tick - b.tick || a.commandId - b.commandId);
    this.#history.push({ command: clone(command), type: "submit" });
    if (before === this.serialize()) throw new Error("player command admission invariant failed");
    return freeze(clone({ accepted: true, commandId: command.commandId, tick: command.tick,
      type: "player-command-admitted" }));
  }
  pause() { if (!this.#paused) { if (this.#history.length >= GAME_SESSION_MAX_TRANSCRIPT) {
      throw new RangeError("game session transcript exceeds its operation bound");
    } this.#paused = true; this.#history.push({ type: "pause" }); } return this.state; }
  resume() { if (this.#paused) { if (this.#history.length >= GAME_SESSION_MAX_TRANSCRIPT) {
      throw new RangeError("game session transcript exceeds its operation bound");
    } this.#paused = false; this.#history.push({ type: "resume" }); } return this.state; }
  restart() { const freshSetup = clone(this.#setup); freshSetup.seed = 0;
    const fresh = new GameSession(canonical(freshSetup)); this.#adopt(fresh); return this.state; }
  step() { return this.stepMany(1); }
  stepMany(count) {
    if (!Number.isSafeInteger(count) || count < 0 || count > GAME_SESSION_MAX_BATCH_TICKS) {
      throw new TypeError("session step count is invalid");
    }
    if (this.#paused || this.#clock.state.result !== null) return freeze([]);
    if (this.#clock.tick + count > MATCH_MAX_TICKS) throw new RangeError("session step exceeds match bound");
    let candidate = this.#runtimeClone();
    let events = candidate.#advanceMany(count), committedCount = count;
    const discovered = candidate.#clock.state.result;
    if (discovered !== null) {
      const boundaryResult = discovered.reason === "regulation_crowns" ||
        discovered.reason === "tiebreak_exact_tie" || discovered.reason === "tiebreak_lowest_hp";
      const terminalTick = discovered.endedAtTick + (boundaryResult ? 0 : 1);
      if (terminalTick < candidate.#clock.tick) {
        committedCount = terminalTick - this.#clock.tick;
        if (committedCount <= 0) throw new Error("session terminal prefix is invalid");
        candidate = this.#runtimeClone();
        events = candidate.#advanceMany(committedCount);
        const rebuilt = candidate.#clock.state.result;
        if (rebuilt === null || canonical(rebuilt) !== canonical(discovered)) {
          throw new Error("session terminal prefix did not reproduce its result");
        }
      }
    }
    if (this.#history.length + committedCount > GAME_SESSION_MAX_TRANSCRIPT) {
      throw new RangeError("game session transcript exceeds its operation bound");
    }
    for (let index = 0; index < committedCount; index += 1) candidate.#history.push({ type: "step" });
    candidate.serialize(); this.#adopt(candidate); return freeze(clone(events));
  }

  serialize() {
    const bytes = canonical({ setup: this.#setup, transcript: this.#history, version: 2 });
    if (scalarByteLength(bytes, "game session snapshot") > GAME_SESSION_MAX_SNAPSHOT_BYTES) {
      throw new RangeError("game session snapshot exceeds byte bound");
    }
    return bytes;
  }
  static restore(serialized) {
    const value = exact(parsed(serialized, "game session snapshot"),
      ["setup", "transcript", "version"], "game session snapshot");
    if (value.version !== 2 || !Array.isArray(value.transcript) ||
        value.transcript.length > GAME_SESSION_MAX_TRANSCRIPT) {
      throw new TypeError("unsupported or oversized game session snapshot");
    }
    const session = new GameSession(canonical(value.setup));
    for (let index = 0; index < value.transcript.length;) {
      const operation = value.transcript[index];
      if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
        throw new TypeError("game session transcript operation is invalid");
      }
      if (operation.type === "step") {
        exact(operation, ["type"], "game session step operation");
        let count = 1;
        while (index + count < value.transcript.length &&
          canonical(value.transcript[index + count]) === '{"type":"step"}') count += 1;
        if (session.#paused || session.#clock.state.result !== null) {
          throw new TypeError("game session transcript contains an uncaused step");
        }
        session.stepMany(count); index += count; continue;
      }
      if (operation.type === "submit") {
        exact(operation, ["command", "type"], "game session submit operation");
        session.submitPlayerCommand(canonical(operation.command)); index += 1; continue;
      }
      if (operation.type === "pause") {
        exact(operation, ["type"], "game session pause operation");
        if (session.#paused) throw new TypeError("game session transcript contains an uncaused pause");
        session.pause(); index += 1; continue;
      }
      if (operation.type === "resume") {
        exact(operation, ["type"], "game session resume operation");
        if (!session.#paused) throw new TypeError("game session transcript contains an uncaused resume");
        session.resume(); index += 1; continue;
      }
      throw new TypeError("game session transcript operation type is invalid");
    }
    if (session.serialize() !== serialized) {
      throw new TypeError("game session transcript did not reproduce its snapshot");
    }
    return session;
  }

  #advanceMany(count) {
    const firstTick = this.#clock.tick, endTick = firstTick + count;
    const staged = [], battleEvents = [], towerRecords = clone(this.#battle.state.towers);
    const flushBattleTo = (tick) => {
      battleEvents.push(...this.#battle.stepMany(tick - this.#battle.state.tick));
    };
    for (let tick = firstTick; tick < endTick; tick += 1) {
      const player = this.#pending.find((entry) => entry.tick === tick) ?? null;
      if (player) {
        flushBattleTo(tick);
        staged.push({ ...stageSideDeployment({ battle: this.#battle,
          cardCosts: this.#costs, command: { ...player, side: "south" },
          deck: this.#decks.south, deploymentSequence: this.#nextDeploymentSequence++,
          elixir: this.#elixir, sessionCards: this.#cardRuntime }) });
      }
      const hand = this.#decks.north.state.hand;
      const observation = { legalNorthDeployments: this.#legal.filter(({ cardId }) => hand.includes(cardId)),
        northCardCosts: hand.map((cardId) => ({ cardId, cost: this.#costs.get(cardId) }))
          .sort((a, b) => a.cardId < b.cardId ? -1 : 1),
        northElixir: this.#elixir.state.sides.north.amount, northHand: hand, tick };
      const proposal = this.#controller.step(observation)[0] ?? null;
      if (proposal) {
        flushBattleTo(tick);
        staged.push({ ...stageSideDeployment({ battle: this.#battle,
          cardCosts: this.#costs, command: { ...proposal,
            commandId: proposal.sequence, slot: hand.indexOf(proposal.cardId) },
          deck: this.#decks.north, deploymentSequence: this.#nextDeploymentSequence++,
          elixir: this.#elixir, sessionCards: this.#cardRuntime }) });
      }
      const elixirEvents = this.#elixir.step();
      for (const stage of staged.filter((entry) => entry.tick === tick)) {
        const spend = elixirEvents.find((event) => event.type === "spend" &&
          event.sequence === stage.spendSequence);
        if (!spend?.accepted) throw new RangeError("session deployment spend failed");
        stage.resolvedSpend = spend;
      }
    }
    flushBattleTo(endTick);
    const sessionEvents = [];
    for (const stage of staged) {
      let committed = stage.route;
      if (stage.kind === "unit") {
        const deployment = battleEvents.find((event) => event.type === "deployed" &&
          event.sequence === stage.deploymentSequence);
        if (!deployment) throw new Error("session deployment did not materialize");
        committed = { deployment: clone(deployment), side: stage.side,
          spend: clone(stage.resolvedSpend), tick: stage.tick, type: "session-deployed" };
        sessionEvents.push(committed);
      }
      if (stage.side === "south") { this.#processed.set(stage.commandId, clone(committed));
        this.#pending = this.#pending.filter(({ commandId }) => commandId !== stage.commandId); }
    }
    const contactsByTick = new Map();
    for (const event of battleEvents) if (event.type === "external-structure-contact") {
      if (!contactsByTick.has(event.tick)) contactsByTick.set(event.tick, []);
      contactsByTick.get(event.tick).push(event);
    }
    for (const [tick, contacts] of [...contactsByTick].sort((a, b) => a[0] - b[0])) {
      for (const contact of contacts) {
        const tower = towerRecords.find(({ id }) => id === contact.structureId);
        tower.hitpoints = Math.max(0, tower.hitpoints - contact.damage);
      }
      const evidence = mapLiveBattleTowerStateToMatchEvidence(towerRecords);
      this.#clock.scheduleTowerEvidence(tick, evidence); this.#towerEvidence = evidence;
    }
    const finalEvidence = mapLiveBattleTowerStateToMatchEvidence(this.#battle.state.towers);
    if (canonical(finalEvidence) !== canonical(this.#towerEvidence)) {
      throw new Error("session tower evidence did not reproduce the authoritative battle");
    }
    const clockEvents = this.#clock.advanceTicks(count);
    // Publish the already-authoritative audible combat boundary in its original
    // LiveBattle order. This is projection only: stepping and authority remain
    // owned by LiveBattle above.
    const meaningfulBattle = battleEvents.filter(({ type }) => [
      "attack",
      "damage",
      "death",
      "projectile-impact",
      "projectile-launch",
      "tower-destroyed",
    ].includes(type));
    sessionEvents.push(...meaningfulBattle, ...clockEvents);
    sessionEvents.sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));
    this.#events.push(...clone(sessionEvents));
    return sessionEvents;
  }
  #runtimeClone() {
    const value = new GameSession(canonical(this.#setup));
    value.#battle = this.#battle.continuationFork();
    value.#cardRuntime = this.#cardRuntime.fork();
    value.#clock = this.#clock.continuationFork();
    value.#controller = this.#controller.continuationFork();
    value.#decks = { north: DeckCycle.restore(this.#decks.north.serializeJson()),
      south: DeckCycle.restore(this.#decks.south.serializeJson()) };
    value.#elixir = this.#elixir.continuationFork();
    value.#events = [...this.#events]; value.#history = [...this.#history];
    value.#nextDeploymentSequence = this.#nextDeploymentSequence;
    value.#projectionSequence = this.#projectionSequence;
    value.#projectionSource = this.#projectionSource;
    value.#paused = this.#paused; value.#pending = clone(this.#pending);
    value.#processed = new Map([...this.#processed.entries()].map(([key, entry]) => [key, clone(entry)]));
    value.#towerEvidence = mapLiveBattleTowerStateToMatchEvidence(value.#battle.state.towers);
    return value;
  }
  #adopt(other) { this.#battle = other.#battle; this.#cardRuntime = other.#cardRuntime;
    this.#clock = other.#clock;
    this.#controller = other.#controller; this.#costs = other.#costs; this.#decks = other.#decks;
    this.#elixir = other.#elixir; this.#events = other.#events; this.#history = other.#history;
    this.#legal = other.#legal; this.#nextDeploymentSequence = other.#nextDeploymentSequence;
    this.#projectionSequence = other.#projectionSequence;
    this.#projectionSource = other.#projectionSource;
    this.#paused = other.#paused; this.#pending = other.#pending; this.#processed = other.#processed;
    this.#setup = other.#setup; this.#towerEvidence = other.#towerEvidence; }
}
