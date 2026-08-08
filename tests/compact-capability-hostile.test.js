import assert from "node:assert/strict";
import test from "node:test";

import * as battleCombatModule from "../src/sim/battle-combat.js";
import * as battleMovementModule from "../src/sim/battle-movement.js";
import * as battleTowersModule from "../src/sim/battle-towers.js";
import { DeckCycle } from "../src/sim/deck.js";
import * as elixirModule from "../src/sim/elixir.js";
import * as gameSessionModule from "../src/sim/game-session.js";
import * as liveBattleModule from "../src/sim/live-battle.js";
import * as matchModule from "../src/sim/match.js";
import * as opponentModule from "../src/sim/opponent-controller.js";
import * as towersModule from "../src/sim/towers.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
} from "../src/content/playable-roster.js";

const {
  BattleCombat,
  DynamicBattleCombat,
} = battleCombatModule;
const { BattleMovement } = battleMovementModule;
const {
  BattleTowerCombat,
  IntegratedBattleTowers,
} = battleTowersModule;
const { ElixirMatch } = elixirModule;
const { GameSession } = gameSessionModule;
const { LiveBattle, parseLiveBattleSetup } = liveBattleModule;
const { MatchClock } = matchModule;
const { OpponentController } = opponentModule;
const { CrownTowerBattle, TOWER_COMBAT_CONFIG } = towersModule;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function rosterFixtures() {
  return {
    questions: structuredClone(createPlayableRosterQuestionRecords()),
    roster: structuredClone(createPlayableRoster()),
  };
}

function liveSetup() {
  const { questions, roster } = rosterFixtures();
  return parseLiveBattleSetup(canonical({
    initialWindupTicks: { central: 0, lane: 0 },
    questions,
    roster,
  }));
}

function initialMatchTowers() {
  return [
    "north:central",
    "north:lane:left",
    "north:lane:right",
    "south:central",
    "south:lane:left",
    "south:lane:right",
  ].map((id) => ({
    hitpoints: TOWER_COMBAT_CONFIG[id.endsWith(":central") ? "central" : "lane"].hitpoints,
    id,
  }));
}

function sessionSetup({ candidates = [], seed = 0, think = 1 } = {}) {
  const { questions, roster } = rosterFixtures();
  const battleSetup = canonical({
    initialWindupTicks: { central: 0, lane: 0 },
    questions,
    roster,
  });
  const deck = roster.map(({ id }) => id);
  return canonical({
    battleSetup,
    deck,
    legalNorthDeployments: candidates,
    rosterWitness: canonical({ questions, roster }),
    seed,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: think,
    thinkOffsetTicks: 0,
  });
}

function snapshot(instance) {
  return instance.serialize();
}

function authorityEntries() {
  return [
    {
      Class: BattleMovement,
      args: [{ mode: "air", position: { x: 1_000, y: 1_000 }, speed: 1_000 }],
      name: "BattleMovement",
    },
    { Class: BattleCombat, args: [], name: "BattleCombat" },
    { Class: DynamicBattleCombat, args: [], name: "DynamicBattleCombat" },
    {
      Class: CrownTowerBattle,
      args: [{ initialWindupTicks: { central: 0, lane: 0 } }],
      name: "CrownTowerBattle",
    },
    {
      Class: BattleTowerCombat,
      args: [{ initialWindupTicks: { central: 0, lane: 0 }, units: [] }],
      name: "BattleTowerCombat",
    },
    {
      Class: IntegratedBattleTowers,
      args: [{ initialWindupTicks: { central: 0, lane: 0 }, units: [] }],
      name: "IntegratedBattleTowers",
    },
    { Class: LiveBattle, args: [liveSetup()], name: "LiveBattle" },
    { Class: ElixirMatch, args: [], name: "ElixirMatch" },
    {
      Class: MatchClock,
      args: [{ initialTowers: initialMatchTowers() }],
      name: "MatchClock",
    },
    {
      Class: OpponentController,
      args: [{ seed: "compact-hostile", thinkIntervalTicks: 3 }],
      name: "OpponentController",
    },
    { Class: GameSession, args: [sessionSetup()], name: "GameSession" },
  ];
}

function assertNoContinuationSurface(value, label) {
  assert.notEqual(value, null, `${label} must be a value`);
  assert.equal(typeof value.continuationFork, "undefined", `${label} lookup is absent`);
  assert.equal(Object.getOwnPropertyDescriptor(value, "continuationFork"), undefined,
    `${label} has no own compact factory`);
  let current = value;
  const visited = new Set();
  while (current !== null) {
    assert.equal(visited.has(current), false, `${label} prototype walk is acyclic`);
    visited.add(current);
    assert.equal(Reflect.ownKeys(current).includes("continuationFork"), false,
      `${label} reflective enumeration has no compact factory`);
    assert.equal(Object.getOwnPropertyDescriptor(current, "continuationFork"), undefined,
      `${label} prototype descriptor has no compact factory`);
    current = Reflect.getPrototypeOf(current);
  }
}

function assertResultIsNotCompactAuthority(value, label) {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return;
  let continuationFork;
  let prototype;
  let frozen;
  let ownKeys;
  try {
    continuationFork = Reflect.get(value, "continuationFork");
    prototype = Reflect.getPrototypeOf(value);
    frozen = Object.isFrozen(value);
    ownKeys = Reflect.ownKeys(value);
  } catch {
    assert.fail(`${label} returned an uninspectable object`);
  }
  assert.equal(continuationFork, undefined, `${label} did not return a compact authority`);
  assert.equal(prototype === null && frozen && ownKeys.length === 0, false,
    `${label} did not return a fieldless opaque compact handle`);
}

function ownPrototypeMethod(Class, name) {
  const descriptor = Object.getOwnPropertyDescriptor(Class.prototype, name);
  return typeof descriptor?.value === "function" ? descriptor.value : null;
}

test("compact capability: every exported authority has no compact prototype or instance surface", () => {
  assert.equal(BattleCombat, DynamicBattleCombat, "combat alias retains exact identity");
  assert.equal(BattleTowerCombat, IntegratedBattleTowers, "tower alias retains exact identity");

  for (const entry of authorityEntries()) {
    const instance = Reflect.construct(entry.Class, entry.args);
    assert.equal(Object.getPrototypeOf(instance), entry.Class.prototype,
      `${entry.name} instance keeps its public facade prototype`);
    assertNoContinuationSurface(entry.Class, `${entry.name} constructor`);
    assertNoContinuationSurface(entry.Class.prototype, `${entry.name} prototype`);
    assertNoContinuationSurface(instance, `${entry.name} instance`);

    const Subclass = class extends entry.Class {};
    assertNoContinuationSurface(Subclass, `${entry.name} subclass constructor`);
    assertNoContinuationSurface(Subclass.prototype, `${entry.name} subclass prototype`);
    let subinstance;
    try {
      subinstance = Reflect.construct(Subclass, entry.args);
    } catch (error) {
      assert.ok(error instanceof Error, `${entry.name} subclass rejection is controlled`);
    }
    if (subinstance !== undefined) {
      assert.equal(Object.getPrototypeOf(subinstance), Subclass.prototype,
        `${entry.name} subclass retains its own public prototype`);
      assertNoContinuationSurface(subinstance, `${entry.name} subclass instance`);
    }
  }
});

test("compact capability: forged, extracted, proxy, and revoked receivers cannot issue a handle", () => {
  const entries = authorityEntries().map((entry) => ({
    ...entry,
    instance: Reflect.construct(entry.Class, entry.args),
  }));

  for (const [index, entry] of entries.entries()) {
    const before = snapshot(entry.instance);
    const forged = Object.create(entry.Class.prototype);
    assertNoContinuationSurface(forged, `${entry.name} forged instance`);

    let traps = 0;
    const proxy = new Proxy(forged, {
      get() {
        traps += 1;
        throw new Error("forged receiver get trap");
      },
    });
    assert.equal(Reflect.get(entry.Class.prototype, "continuationFork", proxy), undefined,
      `${entry.name} absent property does not touch a Proxy receiver`);
    assert.equal(traps, 0, `${entry.name} absent property admission is trap-zero`);
    assert.throws(() => Reflect.get(proxy, "continuationFork"), /forged receiver get trap/u);
    traps = 0;

    const revocable = Proxy.revocable(forged, {});
    revocable.revoke();
    assert.equal(Reflect.get(entry.Class.prototype, "continuationFork", revocable.proxy), undefined,
      `${entry.name} absent property does not touch a revoked Proxy receiver`);
    assert.throws(() => Reflect.get(revocable.proxy, "continuationFork"), TypeError);

    const foreign = entries.find((candidate) => candidate.Class !== entry.Class).instance;
    for (const methodName of ["fork", "replayBytes", "serialize"]) {
      const method = ownPrototypeMethod(entry.Class, methodName);
      if (method === null) continue;
      assert.throws(() => method.call(forged), TypeError,
        `${entry.name}.${methodName}.call rejects a forged receiver`);
      assert.throws(() => method.apply(forged, []), TypeError,
        `${entry.name}.${methodName}.apply rejects a forged receiver`);
      assert.throws(() => Reflect.apply(method, forged, []), TypeError,
        `${entry.name}.${methodName} Reflect.apply rejects a forged receiver`);
      assert.throws(() => Reflect.apply(method, proxy, []),
        `${entry.name}.${methodName} Proxy receiver cannot cross the capability boundary`);
      assert.throws(() => method.call(revocable.proxy), TypeError,
        `${entry.name}.${methodName}.call rejects a revoked Proxy receiver`);
      assert.throws(() => method.apply(revocable.proxy, []), TypeError,
        `${entry.name}.${methodName}.apply rejects a revoked Proxy receiver`);
      assert.throws(() => Reflect.apply(method, revocable.proxy, []), TypeError,
        `${entry.name}.${methodName} Reflect.apply rejects a revoked Proxy receiver`);
      let foreignResult;
      try {
        foreignResult = Reflect.apply(method, foreign, []);
      } catch {
        // Private-brand checks normally reject a foreign authority. A legacy
        // public formatter may instead return ordinary data; neither route can
        // turn a foreign instance into a compact continuation capability.
      }
      assertResultIsNotCompactAuthority(foreignResult,
        `${entry.name}.${methodName} foreign authority receiver`);
    }
    assert.equal(snapshot(entry.instance), before,
      `${entry.name} hostile admission attempts are byte-atomic`);
  }
});

test("compact capability: deep-imported kernel exports no issuer and callable exports cannot mint authority", async () => {
  const kernel = await import(new URL("../src/sim/battle-continuation-kernel.js", import.meta.url));
  const facadeModules = [
    battleCombatModule,
    battleMovementModule,
    battleTowersModule,
    elixirModule,
    gameSessionModule,
    liveBattleModule,
    matchModule,
    opponentModule,
    towersModule,
  ];
  const documented = [...new Set(facadeModules.flatMap((module) => Object.keys(module)))].sort();
  assert.deepEqual(Object.keys(kernel).sort(), documented,
    "direct kernel import exposes exactly the documented public facade exports");
  assert.equal(Object.keys(kernel).some((name) =>
    /capability|compact|continuation|handle|issue|register|resolve|scope/u.test(name)), false,
  "direct kernel import has no continuation issuer, resolver, scope, or handle export");

  const sentinel = new GameSession(sessionSetup());
  const sentinelBytes = sentinel.serialize();
  const forged = Object.create(null);
  const proxy = new Proxy(Object.create(null), {
    get() {
      throw new Error("dynamic-import Proxy trap");
    },
  });
  const revocable = Proxy.revocable(Object.create(null), {});
  revocable.revoke();
  for (const [name, value] of Object.entries(kernel)) {
    if (typeof value !== "function") continue;
    for (const [receiver, argument] of [
      [forged, forged],
      [proxy, proxy],
      [revocable.proxy, revocable.proxy],
    ]) {
      let result;
      try {
        result = Reflect.apply(value, receiver, [argument]);
      } catch {
        // Public validation may reject forged inputs; a rejection is not a
        // compact capability and must not mutate unrelated public authority.
      }
      assertResultIsNotCompactAuthority(result, `${name} direct-import call`);
      assert.equal(sentinel.serialize(), sentinelBytes,
        `${name} direct-import call leaves public state byte-identical`);
    }
    let constructed;
    try {
      constructed = Reflect.construct(value, [forged]);
    } catch {
      // Non-constructable helpers and checked public constructors reject.
    }
    assertResultIsNotCompactAuthority(constructed, `${name} direct-import construction`);
    assert.equal(sentinel.serialize(), sentinelBytes,
      `${name} direct-import construction leaves public state byte-identical`);
  }
});

test("compact capability: session-owned opaque hops preserve exact continuation and projectile provenance", () => {
  const { roster } = rosterFixtures();
  const deck = roster.map(({ id }) => id);
  const cardId = "brassbolt";
  let seed = null;
  for (let candidate = 0; candidate < 10_000; candidate += 1) {
    const north = new DeckCycle({ deck, seed: `${candidate}:north` }).state.hand;
    const south = new DeckCycle({ deck, seed: `${candidate}:south` }).state.hand;
    if (north.includes(cardId) && south.includes(cardId)) {
      seed = candidate;
      break;
    }
  }
  assert.notEqual(seed, null, "fixture finds a deterministic dual projectile hand");
  const setup = sessionSetup({
    candidates: [{ cardId, point: { x: 3_500, y: 17_500 } }],
    seed,
    think: 1,
  });
  const commandFor = (session) => canonical({
    cardId,
    commandId: 0,
    point: { x: 3_500, y: 14_500 },
    slot: session.state.decks.south.hand.indexOf(cardId),
    tick: 0,
    type: "deploy",
  });
  const chunked = new GameSession(setup);
  const stepped = new GameSession(setup);
  chunked.submitPlayerCommand(commandFor(chunked));
  stepped.submitPlayerCommand(commandFor(stepped));
  chunked.stepMany(240);
  for (let tick = 0; tick < 240; tick += 1) stepped.step();
  assert.equal(chunked.serialize(), stepped.serialize(), "session transcripts remain byte-identical");
  assert.deepEqual(chunked.state, stepped.state, "all child continuation state remains exact");
  assert.deepEqual(chunked.replay, stepped.replay, "operation history remains exact");
  assert.ok(chunked.replay.some(({ type }) => type === "projectile-launch"),
    "projectile origins survive session-owned compact hops");
  assert.ok(chunked.replay.some(({ type }) => type === "projectile-impact"),
    "pending projectile origins resolve at the same deterministic boundary");

  const restored = GameSession.restore(chunked.serialize());
  restored.stepMany(60);
  stepped.stepMany(60);
  assert.equal(restored.serialize(), stepped.serialize(),
    "serialize/restore cut continues through compact-backed state exactly");
  assert.deepEqual(restored.state, stepped.state,
    "restored compact-backed state remains exact after the cut");
  assert.deepEqual(restored.replay, stepped.replay,
    "restored compact-backed operation history remains exact after the cut");

  const before = chunked.serialize();
  assert.throws(() => chunked.stepMany(-1), /session step count/u);
  assert.throws(() => chunked.submitPlayerCommand(new Proxy({}, {
    get() { throw new Error("hostile command trap"); },
  })), /player session command/u);
  assert.equal(chunked.serialize(), before,
    "failed public admissions leave compact-backed session bytes unchanged");
});
