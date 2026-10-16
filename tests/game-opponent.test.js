import assert from "node:assert/strict";
import test from "node:test";

import { DeckCycle } from "../src/sim/deck.js";
import {
  GAME_OPPONENT_MAX_BATCH_TICKS,
  GAME_OPPONENT_MAX_SETUP_BYTES,
  GAME_OPPONENT_SETUP_GRAPH_LIMITS,
  GAME_OPPONENT_SNAPSHOT_GRAPH_LIMITS,
  OpponentBattleRuntime,
} from "../src/sim/game-opponent.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
} from "../src/content/playable-roster.js";

const ROSTER = createPlayableRoster();
const DECK = ROSTER.map(({ id }) => id);
const COSTS = ROSTER.map(({ cost, id: cardId }) => ({ cardId, cost }))
  .sort((left, right) => left.cardId < right.cardId ? -1 : 1);
const COUNTS = new Map(ROSTER.map(({ count, id }) => [id, count]));
const WEST = Object.freeze({ x: 3_500, y: 17_500 });
const EAST = Object.freeze({ x: 14_500, y: 17_500 });

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function battleSetup() {
  return canonical({
    initialWindupTicks: { central: 0, lane: 0 },
    questions: createPlayableRosterQuestionRecords(),
    roster: createPlayableRoster(),
  });
}

function rosterWitness() {
  return canonical({ questions: createPlayableRosterQuestionRecords(),
    roster: createPlayableRoster() });
}

function setup({ candidates, seed = "north-runtime", startingNorth = 10,
  thinkIntervalTicks = 1, thinkOffsetTicks = 0 } = {}) {
  const legalNorthDeployments = candidates ?? DECK.flatMap((cardId) => [
    { cardId, point: { ...WEST } }, { cardId, point: { ...EAST } },
  ]).sort((left, right) => left.cardId < right.cardId ? -1 :
    left.cardId > right.cardId ? 1 : left.point.x - right.point.x);
  return canonical({ battleSetup: battleSetup(), deck: DECK,
    legalNorthDeployments, rosterWitness: rosterWitness(), seed,
    startingElixir: { north: startingNorth, south: 5 },
    thinkIntervalTicks, thinkOffsetTicks });
}

function seedWithInitialCard(cardId) {
  for (let seed = 0; seed < 10_000; seed += 1) {
    if (new DeckCycle({ deck: DECK, seed }).state.hand.includes(cardId)) return seed;
  }
  throw new Error(`no bounded seed found for ${cardId}`);
}

function mutateSetup(mutate) {
  const outer = JSON.parse(setup());
  mutate(outer);
  return canonical(outer);
}

function mutateBattleSetup(outer, mutate) {
  const battle = JSON.parse(outer.battleSetup);
  mutate(battle);
  outer.battleSetup = canonical(battle);
}

function nestedArrays(count) {
  let value = 0;
  for (let index = 0; index < count; index += 1) value = [value];
  return value;
}

function exactByteJson(bytes) {
  const keys = ["p0", "p1", "p2", "p3"];
  const empty = canonical(Object.fromEntries(keys.map((key) => [key, ""])));
  let remaining = bytes - empty.length;
  const value = {};
  keys.forEach((key, index) => {
    const share = Math.floor(remaining / (keys.length - index));
    value[key] = "x".repeat(share);
    remaining -= share;
  });
  const serialized = canonical(value);
  assert.equal(serialized.length, bytes);
  return serialized;
}

function nodeGraph(totalNodes) {
  const containers = 4_001;
  let primitives = totalNodes - containers;
  return Array.from({ length: containers - 1 }, () => {
    const count = Math.min(2, primitives);
    primitives -= count;
    return Array.from({ length: count }, () => 0);
  });
}

function briarRuntime(point) {
  return new OpponentBattleRuntime(setup({
    candidates: [{ cardId: "briar-band", point: { ...point } }],
    seed: seedWithInitialCard("briar-band"),
  }));
}

function assertBriarTimeline(runtime, events, commit) {
  const briar = ROSTER.find(({ id }) => id === "briar-band");
  const interval = briar.entities[0].sourceConfidencePolicy.deploymentInterval;
  assert.deepEqual(interval, {
    milliseconds: 100,
    sourceId: "supercell-2020-06-02-multi-unit-deployment",
    ticks: 6,
  });
  assert.deepEqual(briar.entities.map(({ sourceConfidencePolicy }) =>
    sourceConfidencePolicy.deploymentInterval), [interval, interval]);
  const archetypes = briar.entities.flatMap(({ archetypeId, count }) =>
    Array.from({ length: count }, () => archetypeId));
  const expectedCount = COUNTS.get("briar-band");
  assert.equal(archetypes.length, expectedCount,
    "the current roster count, including its unresolved QUESTION claims, defines this fixture");
  const deployment = events.find(({ type }) => type === "deployed");
  assert.deepEqual(deployment.entityIds, commit.deployment.entityIds);
  assert.equal(deployment.sequence, commit.proposalSequence);
  assert.deepEqual(deployment.point, commit.point);
  assert.equal(new Set(deployment.entityIds).size, expectedCount);

  const initialSpawns = events.filter(({ type }) => type === "spawn");
  assert.deepEqual(initialSpawns.map(({ id, tick }) => ({ id, tick })), [
    { id: deployment.entityIds[0], tick: 0 },
  ]);
  const initialElixir = runtime.state.elixir.sides.north.amount;
  const assertVisiblePrefix = (memberCount) => {
    const units = runtime.state.battle.units;
    assert.equal(units.length, memberCount);
    assert.deepEqual(units.map(({ id, archetypeId, cardId, side }) =>
      ({ id, archetypeId, cardId, side })),
    deployment.entityIds.slice(0, memberCount).map((id, index) => ({
      id,
      archetypeId: archetypes[index],
      cardId: "briar-band",
      side: "north",
    })));
  };
  assertVisiblePrefix(1);

  for (let memberIndex = 1; memberIndex < expectedCount; memberIndex += 1) {
    const sourceTick = memberIndex * interval.ticks;
    const boundaryEvents = runtime.stepMany(interval.ticks);
    const spawned = boundaryEvents.filter(({ type }) => type === "spawn");
    assert.deepEqual(spawned.map(({ id, tick }) => ({ id, tick })), [{
      id: deployment.entityIds[memberIndex],
      tick: sourceTick,
    }]);
    assertVisiblePrefix(memberIndex + 1);
    assert.equal(runtime.state.tick, sourceTick + 1);
    assert.equal(runtime.replay.filter(({ type }) =>
      type === "opponent-deployment-committed").length, 1,
    "scheduled members do not issue additional AI deployment commits");
    assert.equal(runtime.replay.filter(({ type, proposal }) =>
      type === "opponent-decision" && proposal !== null).length, 1,
    "scheduled members do not issue additional AI proposals");
    assert.equal(runtime.state.deck.sequence, commit.cycle.sequence + 1,
      "scheduled members do not advance the deck cycle");
    assert.equal(runtime.state.elixir.sides.north.amount, initialElixir,
      "scheduled members do not spend more elixir");
  }

  assertVisiblePrefix(expectedCount);
  assert.equal(runtime.state.tick, (expectedCount - 1) * interval.ticks + 1);
}

test("game opponent: all eight cards and squad counts transact on both legal north lanes", () => {
  for (const cardId of DECK) {
    for (const point of [WEST, EAST]) {
      const runtime = new OpponentBattleRuntime(setup({
        candidates: [{ cardId, point: { ...point } }],
        seed: seedWithInitialCard(cardId),
      }));
      const events = runtime.step(0);
      const commit = events.find(({ type }) => type === "opponent-deployment-committed");
      assert.equal(commit.cardId, cardId);
      assert.equal(commit.commandId, "north:0");
      assert.equal(commit.proposalSequence, 0);
      assert.equal(commit.spendSequence, 0);
      assert.equal(commit.cycle.sequence, 0);
      assert.equal(commit.deployment.entityIds.length, COUNTS.get(cardId));
      assert.deepEqual(commit.point, point);
      assert.equal(runtime.state.elixir.sides.north.amount,
        10 - COSTS.find(({ cardId: id }) => id === cardId).cost);

      if (cardId === "briar-band") {
        assertBriarTimeline(runtime, events, commit);
      } else {
        assert.equal(runtime.state.battle.units.length, COUNTS.get(cardId));
        assert.ok(runtime.state.battle.units.every(({ cardId: unitCardId, side }) =>
          unitCardId === cardId && side === "north"));
      }
    }
  }
});

test("game opponent: pending Briar members preserve chunks and every restore cut", () => {
  const point = WEST;
  const expectedCount = COUNTS.get("briar-band");
  const interval = ROSTER.find(({ id }) => id === "briar-band")
    .entities[0].sourceConfidencePolicy.deploymentInterval;
  const ticks = (expectedCount - 1) * interval.ticks + 1;
  const makeRuntime = () => briarRuntime(point);

  const direct = makeRuntime();
  const directEvents = direct.stepMany(ticks);
  const expectedBytes = direct.serialize();
  const expectedState = direct.state;
  const expectedReplay = direct.replay;
  const commit = directEvents.find(({ type }) =>
    type === "opponent-deployment-committed");
  assert.equal(commit.deployment.entityIds.length, expectedCount);
  assert.deepEqual(directEvents.filter(({ type }) => type === "spawn")
    .map(({ id, tick }) => ({ id, tick })),
  commit.deployment.entityIds.map((id, index) => ({
    id,
    tick: index * interval.ticks,
  })));

  const chunked = makeRuntime();
  const chunkedEvents = [];
  for (const count of [1, 5, 1, 5, 1, 5, 1, 5, 1, 5, 1]) {
    chunkedEvents.push(...chunked.stepMany(count));
  }
  assert.deepEqual(chunkedEvents, directEvents);
  assert.equal(chunked.serialize(), expectedBytes);
  assert.deepEqual(chunked.state, expectedState);
  assert.deepEqual(chunked.replay, expectedReplay);

  for (const cut of [1, 6, 7, 12, 13, 18, 19, 24, 25, 30]) {
    const partial = makeRuntime();
    partial.stepMany(cut);
    const spawnedCount = Math.min(expectedCount,
      1 + Math.floor((cut - 1) / interval.ticks));
    assert.equal(partial.state.battle.units.length, spawnedCount, `active members at cut ${cut}`);
    assert.equal(partial.state.deck.sequence, 1, `deck cycle at cut ${cut}`);
    assert.equal(partial.replay.filter(({ type }) =>
      type === "opponent-deployment-committed").length, 1, `commits at cut ${cut}`);

    const cutBytes = partial.serialize();
    const restored = OpponentBattleRuntime.restore(cutBytes);
    assert.equal(restored.serialize(), cutBytes, `restore bytes at cut ${cut}`);
    assert.equal(restored.state.battle.units.length, spawnedCount,
      `restored active members at cut ${cut}`);
    restored.stepMany(ticks - cut);
    assert.equal(restored.serialize(), expectedBytes, `final bytes at cut ${cut}`);
    assert.deepEqual(restored.state, expectedState, `final state at cut ${cut}`);
    assert.deepEqual(restored.replay, expectedReplay, `final replay at cut ${cut}`);
    assert.equal(restored.replayBytes(), canonical(expectedReplay),
      `final replay bytes at cut ${cut}`);
  }
});

test("game opponent: exact tick order waits for generated elixir then autonomously spends once", () => {
  const cardId = "cinderlings";
  const runtime = new OpponentBattleRuntime(setup({
    candidates: [{ cardId, point: { ...WEST } }],
    seed: seedWithInitialCard(cardId), startingNorth: 0,
  }));
  assert.equal(runtime.stepMany(168).filter(({ type }) =>
    type === "opponent-deployment-committed").length, 0);
  assert.equal(runtime.state.elixir.sides.north.amount, 1);
  const boundary = runtime.step(168);
  assert.equal(boundary[0].observation.northElixir, 1);
  assert.equal(boundary[1].cardId, cardId);
  assert.equal(runtime.state.elixir.sides.north.amount, 0);
  assert.equal(runtime.state.battle.units.length, 3);
});

test("game opponent: repeated autonomous plays produce combat and south tower damage", () => {
  const runtime = new OpponentBattleRuntime(setup({ seed: "autonomous-combat" }));
  runtime.stepMany(400);
  const commits = runtime.replay.filter(({ type }) =>
    type === "opponent-deployment-committed");
  assert.ok(commits.length >= 4, `expected multiple plays, got ${commits.length}`);
  assert.deepEqual(commits.map(({ commandId }) => commandId),
    commits.map((_, sequence) => `north:${sequence}`));
  assert.ok(runtime.state.battle.towers.some(({ hitpoints, side }) =>
    side === "south" && hitpoints < 3_052));
  assert.ok(runtime.replay.some(({ type }) => type === "damage"));
  assert.ok(runtime.replay.some(({ type }) => type === "death"));
  assert.ok(runtime.state.battle.units.some(({ position, side }) =>
    side === "north" && position.y < 16_000));
  assert.ok(runtime.state.battle.units.some(({ side }) => side === "north"));
  for (const commit of commits) {
    assert.ok(commit.deployment.entityIds.length > 0);
    assert.equal(commit.proposalSequence, commit.deployment.sequence);
  }
});

test("game opponent: alternate chunks and restore cuts preserve bytes, events, replay, and state", () => {
  const ticks = 180;
  const direct = new OpponentBattleRuntime(setup({ seed: "restore-cuts",
    thinkIntervalTicks: 7, thinkOffsetTicks: 2 }));
  const expectedEvents = direct.stepMany(ticks);
  const expectedBytes = direct.serialize();
  const expectedState = direct.state;
  const expectedReplay = direct.replay;

  const chunked = new OpponentBattleRuntime(setup({ seed: "restore-cuts",
    thinkIntervalTicks: 7, thinkOffsetTicks: 2 }));
  const chunkedEvents = [];
  for (const count of [0, 1, 17, 3, 41, 29, 89]) {
    chunkedEvents.push(...chunked.stepMany(count));
  }
  assert.deepEqual(chunkedEvents, expectedEvents);
  assert.equal(chunked.serialize(), expectedBytes);
  assert.deepEqual(chunked.state, expectedState);
  assert.deepEqual(chunked.replay, expectedReplay);

  for (const cut of [0, 1, 17, 60, 119, 180]) {
    const partial = new OpponentBattleRuntime(setup({ seed: "restore-cuts",
      thinkIntervalTicks: 7, thinkOffsetTicks: 2 }));
    partial.stepMany(cut);
    const cutBytes = partial.serialize();
    const restored = OpponentBattleRuntime.restore(cutBytes);
    assert.equal(restored.serialize(), cutBytes, `cut bytes ${cut}`);
    restored.stepMany(ticks - cut);
    assert.equal(restored.serialize(), expectedBytes, `final bytes ${cut}`);
    assert.deepEqual(restored.state, expectedState, `state ${cut}`);
    assert.deepEqual(restored.replay, expectedReplay, `replay ${cut}`);
    assert.equal(restored.replayBytes(), canonical(expectedReplay), `replay bytes ${cut}`);
  }
});

test("game opponent: rejected calls and hostile snapshot witnesses are byte-atomic", () => {
  const runtime = new OpponentBattleRuntime(setup());
  const bytes = runtime.serialize();
  for (const operation of [
    () => runtime.step(1),
    () => runtime.step(-1),
    () => runtime.stepMany(GAME_OPPONENT_MAX_BATCH_TICKS + 1),
  ]) {
    assert.throws(operation);
    assert.equal(runtime.serialize(), bytes);
  }
  assert.throws(() => new OpponentBattleRuntime({}), /canonical JSON text/u);
  assert.throws(() => new OpponentBattleRuntime(` ${setup()}`), /canonical JSON/u);
  const forged = JSON.parse(bytes);
  forged.deck = JSON.stringify({ ...JSON.parse(forged.deck), plays: ["coilblade"] });
  assert.throws(() => OpponentBattleRuntime.restore(canonical(forged)), /witness/u);
  const noncausal = JSON.parse(bytes);
  noncausal.history.push({ tick: 2, type: "step" });
  assert.throws(() => OpponentBattleRuntime.restore(canonical(noncausal)), /causal/u);
  assert.throws(() => OpponentBattleRuntime.restore(` ${bytes}`), /canonical JSON/u);
  assert.equal(OpponentBattleRuntime.restore(bytes).serialize(), bytes);
});

test("game opponent: legal and batch bounds fail atomically", () => {
  assert.throws(() => new OpponentBattleRuntime(setup({
    candidates: [{ cardId: "coilblade", point: { x: 0, y: 0 } }],
  })), /deploy|arena|placement|side/u);
  const runtime = new OpponentBattleRuntime(setup({ candidates: [],
    thinkIntervalTicks: 3_600 }));
  const bytes = runtime.serialize();
  assert.throws(() => runtime.stepMany(GAME_OPPONENT_MAX_BATCH_TICKS + 1), /count/u);
  assert.equal(runtime.serialize(), bytes);
});

test("game opponent: resolved shared history supports a full terminal match", {
  skip: process.env.GAME_001HC_RESOLVED === "1" ? false :
    "GAME-001HC owns the open tick-874 shared transcript cap; set GAME_001HC_RESOLVED=1 after its fix",
}, () => {
  const runtime = new OpponentBattleRuntime(setup({ candidates: [],
    thinkIntervalTicks: 3_600 }));
  for (const count of [4_096, 4_096, 4_096, 4_096, 1_616]) runtime.stepMany(count);
  assert.equal(runtime.state.tick, 18_000);
  const terminal = runtime.serialize();
  assert.equal(OpponentBattleRuntime.restore(terminal).serialize(), terminal);
  assert.throws(() => runtime.stepMany(1), /tick bound/u);
  assert.equal(runtime.serialize(), terminal);
});

test("game opponent: canonical text admission invokes no caller callbacks", () => {
  let callbacks = 0;
  const hostile = {};
  Object.defineProperty(hostile, "toJSON", { value() { callbacks += 1; } });
  Object.defineProperty(hostile, "battleSetup", { get() { callbacks += 1; } });
  assert.throws(() => new OpponentBattleRuntime(hostile), /canonical JSON text/u);
  assert.equal(callbacks, 0);
  assert.ok(Object.isFrozen(new OpponentBattleRuntime(setup()).state));
});

test("game opponent: admitted roster is the only deck and cost authority", () => {
  const hostileSetups = [
    ["legacy cost four to one", (outer) => {
      outer.cardCosts = COSTS.map((entry) => ({ ...entry }));
      outer.cardCosts.find(({ cardId }) => cardId === "coilblade").cost = 1;
    }],
    ["legacy zero cost", (outer) => {
      outer.cardCosts = COSTS.map((entry) => ({ ...entry }));
      outer.cardCosts[0].cost = 0;
    }],
    ["missing deck card", (outer) => { outer.deck.pop(); }],
    ["extra deck card", (outer) => { outer.deck.push("stale-card"); }],
    ["stale deck card", (outer) => { outer.deck[0] = "stale-card"; }],
    ["duplicate deck card", (outer) => { outer.deck[1] = outer.deck[0]; }],
    ["reversed deck", (outer) => { outer.deck.reverse(); }],
    ["wrong deck slot", (outer) => {
      [outer.deck[0], outer.deck[1]] = [outer.deck[1], outer.deck[0]];
    }],
    ["admitted cost four to one", (outer) => mutateBattleSetup(outer,
      (battle) => { battle.roster.find(({ id }) => id === "coilblade").cost = 1; })],
    ["admitted zero cost", (outer) => mutateBattleSetup(outer,
      (battle) => { battle.roster[0].cost = 0; })],
    ["card identity alias", (outer) => mutateBattleSetup(outer,
      (battle) => { battle.roster[1].id = battle.roster[0].id; })],
    ["formation component alias", (outer) => mutateBattleSetup(outer,
      (battle) => {
        const formation = battle.roster.find(({ id }) => id === "briar-band").formation;
        formation.componentOrder[1] = formation.componentOrder[0];
      })],
    ["question value mutation", (outer) => mutateBattleSetup(outer,
      (battle) => { battle.questions[0].value += 1; })],
    ["witness cost mutation", (outer) => {
      const witness = JSON.parse(outer.rosterWitness);
      witness.roster[0].cost -= 1;
      outer.rosterWitness = canonical(witness);
    }],
    ["witness question mutation", (outer) => {
      const witness = JSON.parse(outer.rosterWitness);
      witness.questions[0].value += 1;
      outer.rosterWitness = canonical(witness);
    }],
  ];
  for (const [name, mutate] of hostileSetups) {
    assert.throws(() => new OpponentBattleRuntime(mutateSetup(mutate)),
      /shape|deck|roster|witness|cost|identity|formation|component|question|unique|eight/u,
      name);
  }

  const runtime = new OpponentBattleRuntime(setup({
    candidates: [{ cardId: "coilblade", point: { ...WEST } }],
    seed: seedWithInitialCard("coilblade"), startingNorth: 4,
  }));
  const commit = runtime.step(0).find(({ type }) =>
    type === "opponent-deployment-committed");
  assert.equal(commit.cardId, "coilblade");
  assert.equal(runtime.state.elixir.sides.north.amount, 0,
    "runtime spent the admitted roster's exact cost four");
});

test("game opponent: setup graph byte/depth/node/container/array/key/string/integer bounds are exact", () => {
  const limits = GAME_OPPONENT_SETUP_GRAPH_LIMITS;
  const expectPreflightPass = (serialized, bound) => {
    assert.throws(() => new OpponentBattleRuntime(serialized), (error) => {
      assert.doesNotMatch(error.message, bound);
      return true;
    });
  };

  expectPreflightPass(exactByteJson(GAME_OPPONENT_MAX_SETUP_BYTES - 1), /byte/u);
  expectPreflightPass(exactByteJson(GAME_OPPONENT_MAX_SETUP_BYTES), /byte/u);
  assert.throws(() => new OpponentBattleRuntime(
    exactByteJson(GAME_OPPONENT_MAX_SETUP_BYTES + 1)), /byte bound/u);

  expectPreflightPass(canonical(nestedArrays(limits.depth - 1)), /depth/u);
  expectPreflightPass(canonical(nestedArrays(limits.depth)), /depth/u);
  assert.throws(() => new OpponentBattleRuntime(
    canonical(nestedArrays(limits.depth + 1))), /depth bound/u);

  expectPreflightPass(canonical(nodeGraph(limits.nodes - 1)), /node/u);
  expectPreflightPass(canonical(nodeGraph(limits.nodes)), /node/u);
  assert.throws(() => new OpponentBattleRuntime(
    canonical(nodeGraph(limits.nodes + 1))), /node bound/u);

  const containers = (count) => Array.from({ length: count - 1 }, () => []);
  expectPreflightPass(canonical(containers(limits.containers - 1)), /container/u);
  expectPreflightPass(canonical(containers(limits.containers)), /container/u);
  assert.throws(() => new OpponentBattleRuntime(
    canonical(containers(limits.containers + 1))), /container bound/u);

  expectPreflightPass(canonical(Array(limits.arrayLength - 1).fill(0)), /array/u);
  expectPreflightPass(canonical(Array(limits.arrayLength).fill(0)), /array/u);
  assert.throws(() => new OpponentBattleRuntime(
    canonical(Array(limits.arrayLength + 1).fill(0))), /array length bound/u);

  const keyed = (count) => Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`p${String(index).padStart(3, "0")}`, 0]));
  expectPreflightPass(canonical(keyed(limits.keys - 1)), /key bound/u);
  expectPreflightPass(canonical(keyed(limits.keys)), /key bound/u);
  assert.throws(() => new OpponentBattleRuntime(
    canonical(keyed(limits.keys + 1))), /key bound/u);

  expectPreflightPass(canonical("x".repeat(limits.stringLength - 1)), /string length/u);
  expectPreflightPass(canonical("x".repeat(limits.stringLength)), /string length/u);
  assert.throws(() => new OpponentBattleRuntime(
    canonical("x".repeat(limits.stringLength + 1))), /string length bound/u);

  assert.doesNotThrow(() => new OpponentBattleRuntime(setup({
    seed: Number.MAX_SAFE_INTEGER - 1,
  })));
  assert.doesNotThrow(() => new OpponentBattleRuntime(setup({
    seed: Number.MAX_SAFE_INTEGER,
  })));
  assert.throws(() => new OpponentBattleRuntime(mutateSetup((outer) => {
    outer.seed = Number.MAX_SAFE_INTEGER + 1;
  })), /safe integer/u);
});

test("game opponent: object key string-length bounds are exact at every admission layer", () => {
  const addDataKey = (record, key) => {
    Object.defineProperty(record, key, { enumerable: true, value: 0 });
  };
  const setupAt = (location, length, mixed = false) => {
    const outer = JSON.parse(setup());
    const key = mixed
      ? `${"k".repeat(length - 2)}🚀`
      : "k".repeat(length);
    if (location === "root") addDataKey(outer, key);
    else {
      const nested = JSON.parse(outer[location]);
      addDataKey(nested, key);
      outer[location] = canonical(nested);
    }
    return canonical(outer);
  };
  const runtime = new OpponentBattleRuntime(setup());
  runtime.step(0);
  const snapshotAt = (location, length) => {
    const snapshot = JSON.parse(runtime.serialize());
    const target = location === "root" ? snapshot : snapshot.history[0];
    addDataKey(target, "k".repeat(length));
    return canonical(snapshot);
  };
  const acceptedByKeyGate = (operation, label) => {
    assert.throws(operation, (error) => {
      assert.doesNotMatch(error.message, /key string length bound/u);
      return true;
    }, label);
  };

  const setupLimit = GAME_OPPONENT_SETUP_GRAPH_LIMITS.stringLength;
  for (const location of ["root", "battleSetup", "rosterWitness"]) {
    acceptedByKeyGate(() => new OpponentBattleRuntime(
      setupAt(location, setupLimit - 1)), `${location} N-1`);
    acceptedByKeyGate(() => new OpponentBattleRuntime(
      setupAt(location, setupLimit)), `${location} N`);
    assert.throws(() => new OpponentBattleRuntime(
      setupAt(location, setupLimit + 1)), /key string length bound/u,
    `${location} N+1`);
  }
  acceptedByKeyGate(() => new OpponentBattleRuntime(
    setupAt("root", setupLimit, true)), "mixed scalar key counts UTF-16 units");
  assert.throws(() => new OpponentBattleRuntime(
    setupAt("root", setupLimit + 1, true)), /key string length bound/u);

  const snapshotLimit = GAME_OPPONENT_SNAPSHOT_GRAPH_LIMITS.stringLength;
  for (const location of ["root", "history"]) {
    acceptedByKeyGate(() => OpponentBattleRuntime.restore(
      snapshotAt(location, snapshotLimit - 1)), `${location} snapshot N-1`);
    acceptedByKeyGate(() => OpponentBattleRuntime.restore(
      snapshotAt(location, snapshotLimit)), `${location} snapshot N`);
    assert.throws(() => OpponentBattleRuntime.restore(
      snapshotAt(location, snapshotLimit + 1)), /key string length bound/u,
    `${location} snapshot N+1`);
  }
});

test("game opponent: Unicode scalar, canonical-key, and duplicate-key admission is collision-free", () => {
  const literalHigh = setup({ seed: "safe-high" }).replace("safe-high", "\uD800");
  const literalLow = setup({ seed: "safe-low" }).replace("safe-low", "\uDC00");
  const escapedHigh = setup({ seed: "safe-high" }).replace("safe-high", "\\ud800");
  const escapedLow = setup({ seed: "safe-low" }).replace("safe-low", "\\udc00");
  for (const hostile of [literalHigh, literalLow, escapedHigh, escapedLow]) {
    assert.throws(() => new OpponentBattleRuntime(hostile), /Unicode scalar/u);
  }
  const rocket = new OpponentBattleRuntime(setup({ seed: "🚀" }));
  const replacement = new OpponentBattleRuntime(setup({ seed: "�" }));
  assert.notEqual(rocket.serialize(), replacement.serialize());

  const invalidKey = JSON.parse(setup());
  Object.defineProperty(invalidKey, "\uD800", { enumerable: true, value: 0 });
  assert.throws(() => new OpponentBattleRuntime(canonical(invalidKey)), /Unicode scalar/u);
  for (const key of ["__proto__", "constructor", "prototype"]) {
    const hostile = JSON.parse(setup());
    Object.defineProperty(hostile, key, { enumerable: true, value: 0 });
    assert.throws(() => new OpponentBattleRuntime(canonical(hostile)),
      /prototype-like key/u);
  }

  const valid = setup();
  const parsed = JSON.parse(valid);
  const duplicate = `{"battleSetup":${JSON.stringify(parsed.battleSetup)},${valid.slice(1)}`;
  assert.throws(() => new OpponentBattleRuntime(duplicate), /canonical JSON/u);
  assert.throws(() => new OpponentBattleRuntime(` ${valid}`), /canonical JSON/u);
  assert.throws(() => new OpponentBattleRuntime(valid.replace(":0", ":0e0")),
    /canonical JSON/u);
});

test("game opponent: nested setup witnesses and restore history preflight before recursion", () => {
  for (const field of ["battleSetup", "rosterWitness"]) {
    for (const delta of [-1, 0, 1]) {
      const hostile = JSON.parse(setup());
      const nested = JSON.parse(hostile[field]);
      nested.padding = nestedArrays(
        GAME_OPPONENT_SETUP_GRAPH_LIMITS.depth - 1 + delta);
      hostile[field] = canonical(nested);
      if (delta < 1) {
        assert.throws(() => new OpponentBattleRuntime(canonical(hostile)),
          (error) => {
            assert.doesNotMatch(error.message, /depth bound/u);
            return true;
          }, `${field} depth ${delta}`);
      } else {
        assert.throws(() => new OpponentBattleRuntime(canonical(hostile)),
          /depth bound/u, `${field} depth N+1`);
      }
    }
  }

  const runtime = new OpponentBattleRuntime(setup());
  runtime.step(0);
  for (const delta of [-1, 0, 1]) {
    const hostileSnapshot = JSON.parse(runtime.serialize());
    hostileSnapshot.history[0].padding = nestedArrays(
      GAME_OPPONENT_SNAPSHOT_GRAPH_LIMITS.depth - 3 + delta);
    if (delta < 1) {
      assert.throws(() => OpponentBattleRuntime.restore(canonical(hostileSnapshot)),
        (error) => {
          assert.doesNotMatch(error.message, /depth bound|Maximum call stack/u);
          return true;
        }, `history depth ${delta}`);
    } else {
      assert.throws(() => OpponentBattleRuntime.restore(canonical(hostileSnapshot)),
        /depth bound/u, "history depth N+1");
    }
  }
});
