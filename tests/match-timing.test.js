import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MATCH_MAX_EVIDENCE_COMMANDS,
  MATCH_MAX_TICKS,
  MATCH_REGULATION_TICKS,
  MATCH_TRIPLE_ELIXIR_TICK,
  MatchClock,
  getMatchPhase,
  getMatchRules,
} from "../src/sim/match.js";

const arena = JSON.parse(
  readFileSync(
    new URL("../reference/stats/arena.json", import.meta.url),
    "utf8",
  ),
);
const towerReference = JSON.parse(
  readFileSync(
    new URL("../reference/stats/towers.json", import.meta.url),
    "utf8",
  ),
);
const centralHp = towerReference.towers.find(
  (tower) => tower.key === "king_tower",
).hitpoints;
const laneHp = towerReference.towers.find(
  (tower) => tower.key === "princess_tower",
).hitpoints;
const IDS = [
  "north:central",
  "north:lane:left",
  "north:lane:right",
  "south:central",
  "south:lane:left",
  "south:lane:right",
];

function initialTowers() {
  return IDS.map((id) => ({
    hitpoints: id.endsWith(":central") ? centralHp : laneHp,
    id,
  }));
}

function evidence(changes = {}) {
  const towers = initialTowers().map((tower) => ({
    ...tower,
    hitpoints: Object.hasOwn(changes, tower.id)
      ? changes[tower.id]
      : tower.hitpoints,
  }));
  return {
    destroyedTowerIds: towers
      .filter((tower) => tower.hitpoints === 0)
      .map((tower) => tower.id),
    towers,
  };
}

function cumulativeEvidence(previous, changes = {}) {
  const towers = previous.towers.map((tower) => ({
    ...tower,
    hitpoints: Object.hasOwn(changes, tower.id)
      ? changes[tower.id]
      : tower.hitpoints,
  }));
  return {
    destroyedTowerIds: towers
      .filter((tower) => tower.hitpoints === 0)
      .map((tower) => tower.id),
    towers,
  };
}

function match() {
  return new MatchClock({ initialTowers: initialTowers() });
}

test("match timing: high-confidence reference seconds map exactly to 60 Hz ticks", () => {
  const rules = getMatchRules();
  assert.equal(
    rules.timings.regulationTicks,
    arena.timing.regulation_seconds * 60,
  );
  assert.equal(
    rules.timings.overtimeTicks,
    arena.timing.overtime_seconds * 60,
  );
  assert.equal(
    rules.timings.maximumTicks,
    arena.timing.maximum_match_seconds * 60,
  );
  assert.equal(MATCH_REGULATION_TICKS, 10_800);
  assert.equal(MATCH_TRIPLE_ELIXIR_TICK, 14_400);
  assert.equal(MATCH_MAX_TICKS, 18_000);
  console.log(JSON.stringify({
    ours: rules.timings,
    referenceSeconds: arena.timing,
  }));
});

test("match timing: regulation, overtime, and triple phase boundaries are half-open", () => {
  assert.deepEqual(
    [
      getMatchPhase(10_799).clock,
      getMatchPhase(10_800).clock,
      getMatchPhase(14_399).elixirRate,
      getMatchPhase(14_400).elixirRate,
      getMatchPhase(17_999).clock,
      getMatchPhase(18_000).clock,
    ],
    ["regulation", "overtime", "double", "triple", "overtime", "ended"],
  );
  const game = match();
  game.runToTick(10_800);
  assert.equal(game.state.phase, "overtime");
  assert.equal(game.eventLog.at(-1).type, "overtime_started");
  game.runToTick(14_400);
  assert.equal(game.phase().elixirRate, "triple");
});

test("match timing: destruction at 10799 counts before regulation boundary", () => {
  const game = match();
  game.scheduleTowerEvidence(
    10_799,
    evidence({ "north:lane:left": 0 }),
  );
  game.runToTick(10_800);
  assert.deepEqual(game.state.crowns, { north: 0, south: 1 });
  assert.equal(game.state.result.winner, "south");
  assert.equal(game.state.result.reason, "regulation_crowns");
  assert.equal(game.state.result.endedAtTick, 10_800);
});

test("match timing: destruction at 10800 is overtime sudden death after tied regulation", () => {
  const game = match();
  game.scheduleTowerEvidence(
    10_800,
    evidence({ "north:lane:left": 0 }),
  );
  game.runToTick(10_800);
  assert.equal(game.state.phase, "overtime");
  game.step();
  assert.equal(game.state.result.winner, "south");
  assert.equal(game.state.result.reason, "overtime_sudden_death");
  assert.equal(game.state.result.endedAtTick, 10_800);
});

test("match timing: unequal regulation crowns end; tied crowns enter overtime", () => {
  const tied = match();
  const first = evidence({
    "north:lane:left": 0,
    "south:lane:right": 0,
  });
  tied.scheduleTowerEvidence(100, first);
  tied.runToTick(10_800);
  assert.equal(tied.state.result, null);
  assert.equal(tied.state.phase, "overtime");
  assert.deepEqual(tied.state.crowns, { north: 1, south: 1 });

  const unequal = match();
  unequal.scheduleTowerEvidence(
    100,
    evidence({ "north:lane:left": 0 }),
  );
  unequal.runToTick(10_800);
  assert.equal(unequal.state.phase, "ended");
  assert.equal(unequal.state.result.winner, "south");
});

test("match timing: lane crowns award once and central destruction yields three", () => {
  const laneGame = match();
  const destroyed = evidence({ "north:lane:left": 0 });
  laneGame.scheduleTowerEvidence(1, destroyed);
  laneGame.scheduleTowerEvidence(2, destroyed);
  laneGame.runToTick(3);
  assert.deepEqual(laneGame.state.crowns, { north: 0, south: 1 });

  const centralGame = match();
  centralGame.scheduleTowerEvidence(
    42,
    evidence({ "north:central": 0 }),
  );
  centralGame.runToTick(43);
  assert.deepEqual(centralGame.state.crowns, { north: 0, south: 3 });
  assert.equal(centralGame.state.result.winner, "south");
  assert.equal(centralGame.state.result.reason, "central_destroyed");
});

test("match timing: opposing first overtime destructions on one tick deterministically draw", () => {
  const game = match();
  game.scheduleTowerEvidence(
    10_800,
    evidence({
      "north:lane:left": 0,
      "south:lane:right": 0,
    }),
  );
  game.runToTick(10_801);
  assert.equal(game.state.result.kind, "draw");
  assert.equal(game.state.result.winner, null);
  assert.equal(
    getMatchRules().simultaneousOvertimeDestruction.confidence,
    "corpus_silent_deterministic_policy",
  );
});

test("match timing: same-tick evidence sequence has stable combined destruction resolution", () => {
  const game = match();
  const northLost = evidence({ "north:lane:left": 0 });
  const bothLost = cumulativeEvidence(northLost, {
    "south:lane:right": 0,
  });
  game.scheduleTowerEvidence(10_800, northLost);
  game.scheduleTowerEvidence(10_800, bothLost);
  game.runToTick(10_801);
  assert.equal(game.state.result.kind, "draw");
  assert.deepEqual(
    game.replayLog.map((entry) => entry.sequence),
    [0, 1],
  );
});

test("match timing: continuation forks copy present authority without replaying commands", () => {
  const source = match();
  source.scheduleTowerEvidence(2, evidence({ "north:lane:left": laneHp - 50 }));
  source.scheduleTowerEvidence(4, evidence({ "north:lane:left": laneHp - 75 }));
  source.runToTick(1);
  const bytes = source.serialize();
  const replay = source.replayBytes();
  const fork = source.continuationFork();

  assert.equal(source.serialize(), bytes);
  assert.equal(fork.serialize(), bytes);
  assert.equal(fork.replayBytes(), replay);
  assert.deepEqual(fork.state, source.state);
  source.runToTick(5);
  fork.runToTick(5);
  assert.equal(fork.serialize(), source.serialize());
  assert.equal(fork.replayBytes(), source.replayBytes());
  assert.deepEqual(fork.eventLog, source.eventLog);
});

test("match timing: tick 17999 evidence participates in tiebreak", () => {
  const game = match();
  game.scheduleTowerEvidence(
    17_999,
    evidence({
      "north:lane:left": 500,
      "south:lane:left": 501,
    }),
  );
  game.runToTick(18_000);
  assert.equal(game.state.result.winner, "south");
  assert.equal(game.state.result.reason, "tiebreak_lowest_hp");
  assert.equal(game.state.result.endedAtTick, 18_000);
  assert.equal(game.state.towers.find((tower) => tower.id === "north:lane:left").hitpoints, 0);
  assert.deepEqual(game.state.crowns, { north: 0, south: 1 });
});

test("match timing: tick 18000 evidence is rejected after tiebreak", () => {
  const game = match();
  game.scheduleTowerEvidence(
    18_000,
    evidence({ "north:lane:left": 0 }),
  );
  game.runToTick(18_000);
  assert.equal(game.state.result.reason, "tiebreak_exact_tie");
  assert.deepEqual(game.state.crowns, { north: 2, south: 2 });
  assert.deepEqual(game.replayLog.at(-1).event, {
    accepted: false,
    reason: "match_ended",
    sequence: 0,
    tick: 18_000,
    type: "tower_evidence",
  });
});

test("match timing: exact tiebreak tie drains equal minima simultaneously and draws", () => {
  const game = match();
  game.scheduleTowerEvidence(
    17_999,
    evidence({
      "north:lane:left": 333,
      "south:lane:right": 333,
    }),
  );
  game.runToTick(18_000);
  assert.equal(game.state.result.kind, "draw");
  assert.equal(game.state.result.reason, "tiebreak_exact_tie");
  assert.deepEqual(game.state.crowns, { north: 1, south: 1 });
  assert.deepEqual(
    game.eventLog.at(-1).drainedTowerIds,
    ["north:lane:left", "south:lane:right"],
  );
});

test("match timing: match result is permanent and later evidence rejects atomically", () => {
  const game = match();
  const centralGone = evidence({ "north:central": 0 });
  const later = cumulativeEvidence(centralGone, { "north:lane:left": 0 });
  game.scheduleTowerEvidence(5, centralGone);
  game.scheduleTowerEvidence(6, later);
  game.runToTick(7);
  assert.deepEqual(game.state.crowns, { north: 0, south: 3 });
  assert.equal(game.state.result.endedAtTick, 5);
  assert.equal(game.replayLog.at(-1).event.accepted, false);
  assert.equal(
    game.state.towers.find((tower) => tower.id === "north:lane:left").hitpoints,
    laneHp,
  );

  const complete = match();
  complete.runToTick(MATCH_MAX_TICKS);
  const before = complete.serialize();
  assert.throws(
    () => complete.scheduleTowerEvidence(MATCH_MAX_TICKS, evidence()),
    /already resolved/,
  );
  assert.equal(complete.serialize(), before);
});

test("match timing: chunked, stepped, and restored replay are byte-identical", () => {
  const chunked = match();
  const stepped = match();
  for (const game of [chunked, stepped]) {
    const first = evidence({
      "north:lane:left": 0,
      "south:lane:right": 0,
    });
    game.scheduleTowerEvidence(100, first);
    game.scheduleTowerEvidence(
      12_000,
      cumulativeEvidence(first, { "north:lane:right": 0 }),
    );
  }
  chunked.advanceTicks(12_001);
  for (let tick = 0; tick < 12_001; tick += 1) stepped.step();
  assert.equal(chunked.serialize(), stepped.serialize());
  assert.equal(chunked.replayBytes(), stepped.replayBytes());
  assert.deepEqual(chunked.state, stepped.state);

  const restored = MatchClock.restore(chunked.serialize());
  assert.equal(restored.serialize(), chunked.serialize());
  assert.equal(restored.replayBytes(), chunked.replayBytes());
  assert.deepEqual(restored.eventLog, chunked.eventLog);
  assert.deepEqual(restored.state, chunked.state);
});

test("match timing: terminal step resolves tiebreak identically across every advancement path", () => {
  const configure = (game, terminalEvidence) => {
    const latest = evidence(terminalEvidence);
    game.scheduleTowerEvidence(
      17_999,
      latest,
    );
    game.scheduleTowerEvidence(
      18_000,
      cumulativeEvidence(latest, { "north:lane:right": 0 }),
    );
    return game;
  };

  for (const terminalEvidence of [
    { "north:lane:left": 500, "south:lane:left": 501 },
    { "north:lane:left": 333, "south:lane:right": 333 },
  ]) {
    const single = configure(match(), terminalEvidence);
    const chunked = configure(match(), terminalEvidence);
    const advancedTo = configure(match(), terminalEvidence);
    const restoredBeforeTerminal = configure(match(), terminalEvidence);

    for (let tick = 0; tick < MATCH_MAX_TICKS; tick += 1) single.step();
    for (const count of [1, 59, 7_139, 3_600, 3_600, 3_601]) {
      chunked.advanceTicks(count);
    }
    advancedTo.runToTick(MATCH_MAX_TICKS);
    restoredBeforeTerminal.runToTick(MATCH_MAX_TICKS - 1);
    const restored = MatchClock.restore(restoredBeforeTerminal.serialize());
    restored.step();

    for (const candidate of [chunked, advancedTo, restored]) {
      assert.equal(candidate.serialize(), single.serialize());
      assert.equal(candidate.replayBytes(), single.replayBytes());
      assert.deepEqual(candidate.eventLog, single.eventLog);
      assert.deepEqual(candidate.state, single.state);
    }
    assert.equal(single.tick, MATCH_MAX_TICKS);
    assert.equal(single.state.phase, "ended");
    assert.equal(single.eventLog.at(-2).type, "tiebreak");
    assert.deepEqual(single.eventLog.at(-1), {
      accepted: false,
      reason: "match_ended",
      sequence: 1,
      tick: MATCH_MAX_TICKS,
      type: "tower_evidence",
    });
    assert.throws(
      () => single.scheduleTowerEvidence(MATCH_MAX_TICKS, evidence()),
      /already resolved/,
    );
  }
});

test("match timing: terminal-step failure is atomic when canonical HP evidence is unavailable", () => {
  const game = match();
  game.runToTick(MATCH_MAX_TICKS - 1);
  const serialized = JSON.parse(game.serialize());
  serialized.initialTowers = serialized.initialTowers.slice(0, -1);
  const before = game.serialize();

  assert.throws(
    () => MatchClock.restore(JSON.stringify(serialized)),
    /array of length/,
  );
  assert.equal(game.serialize(), before);
  game.step();
  assert.equal(game.state.result.reason, "tiebreak_exact_tie");
});

test("match timing: snapshot contains only causal inputs and derives outcome", () => {
  const game = match();
  game.scheduleTowerEvidence(
    10,
    evidence({ "north:central": 0 }),
  );
  game.runToTick(11);
  const snapshot = JSON.parse(game.serialize());
  assert.deepEqual(Object.keys(snapshot).sort(), [
    "commands",
    "initialTowers",
    "tick",
    "version",
  ]);
  for (const asserted of [
    { ...snapshot, winner: "north" },
    { ...snapshot, crowns: { north: 3, south: 0 } },
    { ...snapshot, result: { winner: "north" } },
    { ...snapshot, destroyedTowerIds: ["south:central"] },
  ]) {
    assert.throws(
      () => MatchClock.restore(JSON.stringify(asserted)),
      /invalid shape/,
    );
  }
});

test("match timing: strict evidence shape binds destroyed IDs to zero HP", () => {
  const game = match();
  const missingDestroyed = evidence({ "north:lane:left": 0 });
  missingDestroyed.destroyedTowerIds = [];
  assert.throws(
    () => game.scheduleTowerEvidence(0, missingDestroyed),
    /must exactly match zero-HP towers|array of length/,
  );
  const resurrectionBase = evidence({ "north:lane:left": 0 });
  game.scheduleTowerEvidence(0, resurrectionBase);
  assert.throws(
    () => game.scheduleTowerEvidence(1, evidence()),
    /cannot increase hitpoints|cannot revive/,
  );
  assert.throws(
    () =>
      game.scheduleTowerEvidence(1, {
        destroyedTowerIds: ["north:lane:left"],
        towers: resurrectionBase.towers.map((tower) =>
          tower.id === "north:lane:left"
            ? { ...tower, unexpected: true }
            : tower
        ),
      }),
    /invalid shape/,
  );
});

test("match timing: malformed snapshots, accessors, and limits fail without partial mutation", () => {
  const game = match();
  const before = game.serialize();
  const poison = evidence();
  Object.defineProperty(poison.towers[0], "hitpoints", {
    enumerable: true,
    get() {
      throw new Error("getter must not run");
    },
  });
  assert.throws(
    () => game.scheduleTowerEvidence(0, poison),
    /enumerable data property/,
  );
  assert.equal(game.serialize(), before);

  assert.throws(() => MatchClock.restore("{"), /valid JSON/);
  assert.throws(
    () => MatchClock.restore(JSON.stringify({
      commands: [],
      initialTowers: initialTowers(),
      tick: MATCH_MAX_TICKS + 1,
      version: 1,
    })),
    /exceeds maximum/,
  );
  const oversized = {
    commands: Array.from(
      { length: MATCH_MAX_EVIDENCE_COMMANDS + 1 },
      () => ({ evidence: evidence(), tick: 0 }),
    ),
    initialTowers: initialTowers(),
    tick: 0,
    version: 1,
  };
  assert.throws(
    () => MatchClock.restore(JSON.stringify(oversized)),
    /invalid length/,
  );
});

test("match timing: returned JSON views cannot mutate internal state", () => {
  const game = match();
  const view = game.state;
  view.crowns.north = 99;
  view.towers[0].hitpoints = 0;
  assert.deepEqual(game.state.crowns, { north: 0, south: 0 });
  assert.equal(game.state.towers[0].hitpoints, centralHp);

  const rules = getMatchRules();
  rules.towerIds[0] = "poison";
  assert.equal(getMatchRules().towerIds[0], "north:central");
});

test("match timing: runtime has no reference imports or ambient nondeterminism", () => {
  const source = readFileSync(
    new URL("../src/sim/match.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /reference\/|Math\.random|Date\.now|new Date|performance\.now/);
});
