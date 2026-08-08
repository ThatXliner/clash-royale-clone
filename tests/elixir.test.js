import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ELIXIR_ACCUMULATOR_DENOMINATOR,
  ELIXIR_CAPACITY,
  ELIXIR_MATCH_TICKS,
  ELIXIR_MAX_EVENT_ENTRIES,
  ELIXIR_MAX_GENERATED_EVENTS,
  ELIXIR_MAX_HISTORY_ENTRIES,
  ELIXIR_MAX_PENDING_SPENDS,
  ElixirMatch,
  getElixirPhase,
  getElixirRules,
} from "../src/sim/elixir.js";

const reference = JSON.parse(readFileSync(
  new URL("../reference/stats/arena.json", import.meta.url),
  "utf8",
)).elixir;

test("elixir: reference values expose confidence and exact normalization", () => {
  const rules = getElixirRules();
  assert.equal(rules.capacity, reference.capacity);
  assert.deepEqual(
    rules.phases.map((phase) => phase.ticksPerElixir),
    [168, 84, 56],
  );
  assert.equal(rules.startingElixir.value, reference.starting_elixir);
  assert.equal(rules.startingElixir.confidence, "estimate");
  assert.equal(rules.phases[2].confidence, "normalized_exact_third");
  console.log(JSON.stringify({
    highConfidence: {
      capacity: [rules.capacity, reference.capacity],
      singleSeconds: [
        rules.phases[0].ticksPerElixir / rules.tickRateHz,
        reference.tick_seconds.single,
      ],
      doubleSeconds: [
        rules.phases[1].ticksPerElixir / rules.tickRateHz,
        reference.tick_seconds.double,
      ],
    },
    estimate: { startingElixir: rules.startingElixir.value },
    normalized: {
      tripleTicks: rules.phases[2].ticksPerElixir,
      referenceRoundedSeconds: reference.tick_seconds.triple,
    },
  }));
});

test("elixir: starts both neutral sides at the isolated estimate and caps at ten", () => {
  const match = new ElixirMatch();
  assert.deepEqual(match.state.sides, {
    north: { accumulator: 0, amount: 5 },
    south: { accumulator: 0, amount: 5 },
  });
  match.advanceTicks(168 * 5);
  assert.deepEqual(match.state.sides, {
    north: { accumulator: 0, amount: ELIXIR_CAPACITY },
    south: { accumulator: 0, amount: ELIXIR_CAPACITY },
  });
  match.advanceTicks(500);
  assert.deepEqual(match.state.sides, {
    north: { accumulator: 0, amount: ELIXIR_CAPACITY },
    south: { accumulator: 0, amount: ELIXIR_CAPACITY },
  });
});

test("elixir: exact single, double, and triple schedules use integer ticks", () => {
  const single = new ElixirMatch({ startingElixir: 0 });
  single.advanceTicks(167);
  assert.equal(single.state.sides.south.amount, 0);
  single.step();
  assert.equal(single.state.sides.south.amount, 1);

  const double = new ElixirMatch({ startingElixir: 0 });
  double.runToTick(7_200);
  double.scheduleSpend(7_200, "south", 10);
  double.step();
  assert.equal(double.state.sides.south.accumulator, 2);
  double.advanceTicks(83);
  assert.equal(double.state.sides.south.amount, 1);

  const triple = new ElixirMatch({ startingElixir: 0 });
  triple.runToTick(14_400);
  triple.scheduleSpend(14_400, "south", 10);
  triple.step();
  assert.equal(triple.state.sides.south.accumulator, 3);
  triple.advanceTicks(55);
  assert.equal(triple.state.sides.south.amount, 1);
});

test("elixir: phase boundary ticks are half-open and preserve progress", () => {
  assert.equal(getElixirPhase(7_199).name, "single");
  assert.equal(getElixirPhase(7_200).name, "double");
  assert.equal(getElixirPhase(14_399).name, "double");
  assert.equal(getElixirPhase(14_400).name, "triple");

  const first = new ElixirMatch({ startingElixir: 10 });
  first.runToTick(7_033);
  first.scheduleSpend(7_033, "south", 10);
  first.advanceTicks(167);
  assert.equal(first.state.sides.south.accumulator, 167);
  first.step();
  assert.deepEqual(first.state.sides.south, { accumulator: 1, amount: 1 });

  const second = new ElixirMatch({ startingElixir: 10 });
  second.runToTick(14_317);
  second.scheduleSpend(14_317, "north", 10);
  second.advanceTicks(83);
  assert.equal(second.state.sides.north.accumulator, 166);
  second.step();
  assert.deepEqual(second.state.sides.north, { accumulator: 1, amount: 1 });
});

test("elixir: accepted, insufficient, and invalid spends are atomic", () => {
  const match = new ElixirMatch();
  match.scheduleSpend(0, "south", 3);
  match.scheduleSpend(0, "north", 6);
  match.scheduleSpend(0, "south", 0);
  match.scheduleSpend(0, "south", 11);
  match.scheduleSpend(0, "east", 2);
  const events = match.step().filter((event) => event.type === "spend");
  assert.deepEqual(events.map((event) => [event.sequence, event.accepted, event.reason]), [
    [0, true, "accepted"],
    [1, false, "insufficient_elixir"],
    [2, false, "invalid_cost"],
    [3, false, "invalid_cost"],
    [4, false, "invalid_side"],
  ]);
  assert.equal(match.state.sides.south.amount, 2);
  assert.equal(match.state.sides.north.amount, 5);
});

test("elixir: simultaneous side-specific spends preserve input order", () => {
  const match = new ElixirMatch({ startingElixir: 5 });
  match.scheduleSpend(20, "south", 4);
  match.scheduleSpend(20, "south", 2);
  match.scheduleSpend(20, "north", 5);
  match.runToTick(20);
  const events = match.step().filter((event) => event.type === "spend");
  assert.deepEqual(events.map((event) => [event.sequence, event.accepted]), [
    [0, true],
    [1, false],
    [2, true],
  ]);
  assert.equal(match.state.sides.south.amount, 1);
  assert.equal(match.state.sides.north.amount, 0);
});

test("elixir: cap resets and freezes progress; spend-after-cap starts at zero", () => {
  const match = new ElixirMatch({ startingElixir: 9 });
  match.advanceTicks(168);
  assert.deepEqual(match.state.sides.south, { accumulator: 0, amount: 10 });
  match.advanceTicks(200);
  match.scheduleSpend(match.tick, "south", 1);
  match.step();
  assert.deepEqual(match.state.sides.south, { accumulator: 1, amount: 9 });
  match.advanceTicks(166);
  assert.equal(match.state.sides.south.amount, 9);
  match.step();
  assert.equal(match.state.sides.south.amount, 10);
});

test("elixir: chunked and single-step execution are byte-identical", () => {
  const chunked = new ElixirMatch({ startingElixir: 2 });
  const stepped = new ElixirMatch({ startingElixir: 2 });
  for (const match of [chunked, stepped]) {
    match.scheduleSpend(50, "south", 2);
    match.scheduleSpend(7_200, "north", 6);
    match.scheduleSpend(14_400, "south", 8);
  }
  chunked.advanceTicks(14_500);
  for (let tick = 0; tick < 14_500; tick += 1) stepped.step();
  assert.equal(chunked.serialize(), stepped.serialize());
  assert.equal(chunked.replayBytes(), stepped.replayBytes());
});

test("elixir: continuation forks copy present authority without changing public logs", () => {
  const source = new ElixirMatch({ startingElixir: { north: 7, south: 6 } });
  source.scheduleSpend(1, "south", 2);
  source.scheduleSpend(4, "north", 3);
  source.step({ grants: [{ amount: 1, side: "south", sourceId: 9 }] });
  const bytes = source.serialize();
  const replay = source.replayBytes();
  const fork = source.continuationFork();

  assert.equal(source.serialize(), bytes);
  assert.equal(fork.serialize(), bytes);
  assert.equal(fork.replayBytes(), replay);
  assert.deepEqual(fork.state, source.state);
  source.advanceTicks(5);
  fork.advanceTicks(5);
  assert.equal(fork.serialize(), source.serialize());
  assert.equal(fork.replayBytes(), source.replayBytes());
  assert.deepEqual(fork.eventLog, source.eventLog);
});

test("elixir: serialize/restore derives accumulator, pending, history, and bytes", () => {
  const original = new ElixirMatch({ startingElixir: 3 });
  original.scheduleSpend(4, "south", 2);
  original.scheduleSpend(200, "north", 3);
  original.advanceTicks(100);
  assert.notEqual(original.state.sides.south.accumulator, 0);
  const bytes = original.serialize();
  const restored = ElixirMatch.restore(bytes);
  assert.equal(restored.serialize(), bytes);
  original.advanceTicks(200);
  restored.advanceTicks(200);
  assert.equal(restored.serialize(), original.serialize());

  const granted = new ElixirMatch({
    startingElixir: { north: 9, south: 0 },
  });
  granted.scheduleSpend(0, "north", 1);
  const boundary = granted.step({
    grants: [
      { amount: 1, side: "south", sourceId: 7 },
      { amount: 2, side: "north", sourceId: 9 },
    ],
  });
  assert.deepEqual(boundary.map(({ type }) => type), [
    "spend", "grant", "grant",
  ]);
  assert.deepEqual(granted.state.sides, {
    north: { accumulator: 0, amount: 10 },
    south: { accumulator: 1, amount: 1 },
  });
  assert.deepEqual(
    granted.replayLog.map(({ command }) => command),
    [
      { cost: 1, side: "north" },
      { amount: 1, side: "south", sourceId: 7, type: "grant" },
      { amount: 2, side: "north", sourceId: 9, type: "grant" },
    ],
  );
  const grantedBytes = granted.serialize();
  assert.equal(JSON.parse(grantedBytes).version, 3);
  const grantedRestored = ElixirMatch.restore(grantedBytes);
  assert.equal(grantedRestored.serialize(), grantedBytes);
  assert.deepEqual(grantedRestored.state, granted.state);
  assert.deepEqual(grantedRestored.eventLog, granted.eventLog);
  assert.deepEqual(grantedRestored.replayLog, granted.replayLog);
});

test("elixir: version 3 preserves one spend/grant sequence after later scheduling", () => {
  const original = new ElixirMatch({
    startingElixir: { north: 4, south: 4 },
  });
  original.scheduleSpend(510, "south", 2);
  original.step({
    grants: [{ amount: 1, side: "north", sourceId: 7 }],
  });
  original.scheduleSpend(510, "north", 3);

  const boundary = original.serialize();
  assert.deepEqual(JSON.parse(boundary), {
    commands: [
      { cost: 2, sequence: 0, side: "south", tick: 510 },
      { cost: 3, sequence: 2, side: "north", tick: 510 },
    ],
    grants: [
      { amount: 1, sequence: 1, side: "north", sourceId: 7, tick: 0 },
    ],
    startingElixir: { north: 4, south: 4 },
    tick: 1,
    version: 3,
  });

  const restored = ElixirMatch.restore(boundary);
  assert.equal(restored.serialize(), boundary);
  original.runToTick(510);
  restored.runToTick(510);
  const originalEvents = original.step({
    grants: [{ amount: 1, side: "south", sourceId: 8 }],
  });
  const restoredEvents = restored.step({
    grants: [{ amount: 1, side: "south", sourceId: 8 }],
  });
  assert.deepEqual(restoredEvents, originalEvents);
  assert.equal(restored.serialize(), original.serialize());
  assert.equal(restored.replayBytes(), original.replayBytes());
  assert.deepEqual(
    restored.replayLog.map(({ sequence }) => sequence),
    [1, 0, 2, 3],
  );
});

test("elixir: legacy version 3 restores and hostile unified sequences reject", () => {
  const legacy = {
    commands: [{ cost: 1, side: "south", tick: 1 }],
    grants: [{ amount: 1, side: "north", sourceId: 3, tick: 0 }],
    startingElixir: 2,
    tick: 1,
    version: 3,
  };
  const legacyRestored = ElixirMatch.restore(JSON.stringify(legacy));
  assert.deepEqual(legacyRestored.state.sides, {
    north: { accumulator: 1, amount: 3 },
    south: { accumulator: 1, amount: 2 },
  });
  assert.deepEqual(
    legacyRestored.replayLog.map(({ sequence }) => sequence),
    [1],
  );

  const canonical = JSON.parse(legacyRestored.serialize());
  for (const mutate of [
    (value) => { delete value.commands[0].sequence; },
    (value) => { value.commands[0].sequence = value.grants[0].sequence; },
    (value) => { value.commands[0].sequence = 3; },
    (value) => {
      value.commands[0].sequence = 1;
      value.commands[0].tick = 0;
      value.grants[0].sequence = 0;
      value.tick = 1;
    },
  ]) {
    const hostile = structuredClone(canonical);
    mutate(hostile);
    assert.throws(() => ElixirMatch.restore(JSON.stringify(hostile)), TypeError);
  }
  assert.equal(legacyRestored.serialize(), JSON.stringify(canonical));
});

test("elixir: snapshot contains only canonical causal inputs", () => {
  const match = new ElixirMatch({ startingElixir: 4 });
  match.scheduleSpend(0, "south", 3);
  match.scheduleSpend(0, "north", 8);
  match.scheduleSpend(200, "south", 1);
  match.advanceTicks(100);

  assert.deepEqual(JSON.parse(match.serialize()), {
    commands: [
      { cost: 3, side: "south", tick: 0 },
      { cost: 8, side: "north", tick: 0 },
      { cost: 1, side: "south", tick: 200 },
    ],
    startingElixir: 4,
    tick: 100,
    version: 2,
  });
  const restored = ElixirMatch.restore(match.serialize());
  assert.equal(restored.serialize(), match.serialize());
  assert.deepEqual(restored.state, match.state);
  assert.deepEqual(restored.eventLog, match.eventLog);
  assert.deepEqual(restored.replayLog, match.replayLog);
});

test("elixir: asserted spend outcomes and generated events cannot be restored", () => {
  const match = new ElixirMatch({ startingElixir: 5 });
  match.scheduleSpend(0, "south", 3);
  match.advanceTicks(168);
  const canonical = JSON.parse(match.serialize());

  for (const asserted of [
    {
      ...canonical,
      history: [{
        command: { cost: 3, side: "south" },
        events: [{
          accepted: true,
          amountAfter: 2,
          cost: 3,
          reason: "insufficient_elixir",
          sequence: 0,
          side: "south",
          tick: 0,
          type: "spend",
        }],
        sequence: 0,
        tick: 0,
      }],
    },
    {
      ...canonical,
      events: [{
        accepted: true,
        amountAfter: 9,
        cost: 3,
        reason: "accepted",
        sequence: 0,
        side: "south",
        tick: 0,
        type: "spend",
      }],
    },
    {
      ...canonical,
      events: [{
        amountAfter: 10,
        side: "south",
        tick: 1,
        type: "generated",
      }],
    },
  ]) {
    assert.throws(
      () => ElixirMatch.restore(JSON.stringify(asserted)),
      /invalid shape/,
    );
  }
});

test("elixir: command mutations derive legitimate distinct histories", () => {
  const original = new ElixirMatch({ startingElixir: 5 });
  original.scheduleSpend(0, "south", 3);
  original.scheduleSpend(0, "south", 2);
  original.scheduleSpend(300, "north", 4);
  original.advanceTicks(200);
  const bytes = original.serialize();
  const snapshot = JSON.parse(bytes);

  const changedAmount = structuredClone(snapshot);
  changedAmount.commands[0].cost = 4;
  const amountMatch = ElixirMatch.restore(JSON.stringify(changedAmount));
  assert.equal(amountMatch.state.sides.south.amount, 2);
  assert.notEqual(amountMatch.serialize(), bytes);
  assert.equal(amountMatch.replayLog[0].events[0].amountAfter, 1);

  const deleted = structuredClone(snapshot);
  deleted.commands.splice(0, 1);
  const deletedMatch = ElixirMatch.restore(JSON.stringify(deleted));
  assert.equal(deletedMatch.state.sides.south.amount, 4);
  assert.equal(deletedMatch.replayLog[0].sequence, 0);
  assert.notEqual(deletedMatch.serialize(), bytes);

  const reordered = structuredClone(snapshot);
  reordered.commands.reverse();
  const reorderedMatch = ElixirMatch.restore(JSON.stringify(reordered));
  assert.equal(reorderedMatch.replayLog[0].command.cost, 2);
  assert.equal(reorderedMatch.replayLog[1].command.cost, 3);
  assert.notEqual(reorderedMatch.serialize(), bytes);
});

test("elixir: restore replays cap, phase continuation, and the full match", () => {
  const capped = new ElixirMatch({ startingElixir: 9 });
  capped.advanceTicks(400);
  capped.scheduleSpend(400, "south", 2);
  capped.advanceTicks(77);
  const cappedRestored = ElixirMatch.restore(capped.serialize());
  assert.equal(cappedRestored.serialize(), capped.serialize());
  assert.deepEqual(cappedRestored.state, capped.state);

  const phased = new ElixirMatch({ startingElixir: 0 });
  phased.scheduleSpend(7_199, "south", 1);
  phased.scheduleSpend(14_399, "north", 2);
  phased.runToTick(14_450);
  const phasedRestored = ElixirMatch.restore(phased.serialize());
  assert.equal(phasedRestored.serialize(), phased.serialize());
  assert.deepEqual(phasedRestored.state, phased.state);
  assert.deepEqual(phasedRestored.eventLog, phased.eventLog);

  const full = new ElixirMatch({ startingElixir: 0 });
  full.scheduleSpend(17_999, "south", 10);
  full.runToTick(18_000);
  const fullRestored = ElixirMatch.restore(full.serialize());
  assert.equal(fullRestored.tick, 18_000);
  assert.equal(fullRestored.serialize(), full.serialize());
  assert.deepEqual(fullRestored.state, full.state);
  assert.deepEqual(fullRestored.eventLog, full.eventLog);
});

test("elixir: canonical command history is strictly shaped and bounded", () => {
  const base = JSON.parse(new ElixirMatch().serialize());
  for (const commands of [
    [{ cost: 1, side: "south", tick: 0, extra: true }],
    [{ cost: 1, side: "south" }],
    [{ cost: 1, side: "south", tick: 18_000 }],
  ]) {
    const malformed = structuredClone(base);
    malformed.commands = commands;
    assert.throws(() => ElixirMatch.restore(JSON.stringify(malformed)));
  }

  const excessivePending = structuredClone(base);
  excessivePending.commands = Array.from({ length: 10_001 }, () => ({
    cost: 1,
    side: "south",
    tick: 1,
  }));
  assert.throws(
    () => ElixirMatch.restore(JSON.stringify(excessivePending)),
    /pending command history is too long/,
  );

  const excessiveResolved = structuredClone(base);
  excessiveResolved.tick = 1;
  excessiveResolved.commands = Array.from({ length: 100_001 }, () => ({
    cost: 1,
    side: "south",
    tick: 0,
  }));
  assert.throws(
    () => ElixirMatch.restore(JSON.stringify(excessiveResolved)),
    /resolved command history is too long/,
  );
});

test("elixir: advertised resolved-command boundary replays without a hidden event cap", () => {
  const base = JSON.parse(new ElixirMatch({ startingElixir: 0 }).serialize());
  const command = { cost: 1, side: "south", tick: 0 };

  const belowLimit = {
    ...base,
    commands: Array.from(
      { length: ELIXIR_MAX_HISTORY_ENTRIES - 1 },
      () => command,
    ),
    tick: 1,
  };
  const belowLimitRestored = ElixirMatch.restore(
    JSON.stringify(belowLimit),
  );
  assert.equal(
    belowLimitRestored.replayLog.length,
    ELIXIR_MAX_HISTORY_ENTRIES - 1,
  );
  assert.equal(
    belowLimitRestored.replayLog.at(-1).events[0].reason,
    "insufficient_elixir",
  );

  const excessive = {
    ...base,
    commands: Array.from(
      { length: ELIXIR_MAX_HISTORY_ENTRIES + 1 },
      () => command,
    ),
    tick: 1,
  };
  assert.throws(
    () => ElixirMatch.restore(JSON.stringify(excessive)),
    /resolved command history is too long/,
  );
});

test("elixir: command and derived-event resource limits are explicit and coherent", () => {
  const rules = getElixirRules();
  assert.deepEqual(rules.resourceLimits, {
    resolvedCommands: ELIXIR_MAX_HISTORY_ENTRIES,
    pendingCommands: ELIXIR_MAX_PENDING_SPENDS,
    generatedEvents: ELIXIR_MAX_GENERATED_EVENTS,
    derivedEventLogEntries: ELIXIR_MAX_EVENT_ENTRIES,
  });
  assert.equal(ELIXIR_MAX_GENERATED_EVENTS, 384);
  assert.equal(
    ELIXIR_MAX_EVENT_ENTRIES,
    ELIXIR_MAX_HISTORY_ENTRIES + ELIXIR_MAX_GENERATED_EVENTS,
  );

  const upkeepCommands = [];
  let accumulator = 0;
  let amount = 0;
  for (let tick = 0; tick < ELIXIR_MATCH_TICKS; tick += 1) {
    if (amount > 0) {
      upkeepCommands.push(
        { cost: 1, side: "south", tick },
        { cost: 1, side: "north", tick },
      );
      amount -= 1;
    }
    const phase = getElixirPhase(tick);
    accumulator += phase.numeratorPerTick;
    if (accumulator >= ELIXIR_ACCUMULATOR_DENOMINATOR) {
      accumulator -= ELIXIR_ACCUMULATOR_DENOMINATOR;
      amount += 1;
    }
  }
  const fillerCount =
    ELIXIR_MAX_HISTORY_ENTRIES - upkeepCommands.length;
  const generationHeavy = {
    commands: [
      ...Array.from({ length: fillerCount }, () => ({
        cost: 1,
        side: "east",
        tick: 0,
      })),
      ...upkeepCommands,
    ],
    startingElixir: 0,
    tick: ELIXIR_MATCH_TICKS,
    version: 2,
  };
  const restored = ElixirMatch.restore(JSON.stringify(generationHeavy));
  assert.equal(restored.replayLog.length, ELIXIR_MAX_HISTORY_ENTRIES);
  assert.equal(
    restored.eventLog.length,
    ELIXIR_MAX_EVENT_ENTRIES,
  );
});

test("elixir: malformed snapshots, unsafe timing, and invalid inputs reject", () => {
  assert.throws(() => new ElixirMatch({ startingElixir: 5.5 }), TypeError);
  assert.throws(() => getElixirPhase(18_000), RangeError);
  const match = new ElixirMatch();
  assert.throws(() => match.advanceTicks(-1), TypeError);
  assert.throws(() => match.advanceTicks(Number.MAX_SAFE_INTEGER), RangeError);
  assert.throws(() => match.scheduleSpend(-1, "south", 1), TypeError);
  assert.throws(() => match.scheduleSpend(0, "south", Number.NaN), TypeError);
  assert.throws(() => ElixirMatch.restore("{}"), TypeError);
  assert.throws(() => ElixirMatch.restore("{"), TypeError);

  const snapshot = JSON.parse(match.serialize());
  snapshot.sides = {
    north: { accumulator: 0, amount: 5 },
    south: { accumulator: 1, amount: 10 },
  };
  assert.throws(() => ElixirMatch.restore(JSON.stringify(snapshot)), TypeError);
  assert.equal(ELIXIR_ACCUMULATOR_DENOMINATOR, 168);
});
