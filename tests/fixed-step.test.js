import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  FixedStepWorld,
  canonicalJson,
} from "../src/sim/fixed-step.js";

function reducer(state, command, context) {
  state.total += command.amount;
  state.applied.push(`${command.name}@${context.tick}`);
  context.emit({ name: command.name, total: state.total });
  return state;
}

function createRun() {
  const world = new FixedStepWorld({
    initialState: { applied: [], total: 0 },
    reducer,
  });
  world.schedule(4, { amount: 5, name: "late" });
  world.schedule(1, { amount: 2, name: "first" });
  world.schedule(1, { amount: 3, name: "second" });
  return world;
}

test("fixed-step: commands resolve only at their exact integer ticks", () => {
  const world = createRun();

  assert.deepEqual(world.step(), []);
  assert.deepEqual(world.state, { applied: [], total: 0 });

  const atOne = world.step();
  assert.deepEqual(
    atOne.map(({ sequence, tick }) => ({ sequence, tick })),
    [
      { sequence: 1, tick: 1 },
      { sequence: 2, tick: 1 },
    ],
  );
  assert.deepEqual(world.state, {
    applied: ["first@1", "second@1"],
    total: 5,
  });

  assert.deepEqual(world.step(), []);
  assert.deepEqual(world.step(), []);
  assert.equal(world.state.total, 5);

  const atFour = world.step();
  assert.equal(atFour.length, 1);
  assert.equal(atFour[0].tick, 4);
  assert.deepEqual(world.state, {
    applied: ["first@1", "second@1", "late@4"],
    total: 10,
  });
});

test("fixed-step: fresh runs produce byte-identical replay and snapshots", () => {
  const left = createRun();
  const right = createRun();

  left.runThrough(6);
  right.runThrough(6);

  assert.equal(left.replayBytes(), right.replayBytes());
  assert.equal(left.serialize(), right.serialize());
  assert.deepEqual(JSON.parse(left.replayBytes()), [
    {
      command: { amount: 2, name: "first" },
      events: [{ name: "first", total: 2 }],
      sequence: 1,
      tick: 1,
    },
    {
      command: { amount: 3, name: "second" },
      events: [{ name: "second", total: 5 }],
      sequence: 2,
      tick: 1,
    },
    {
      command: { amount: 5, name: "late" },
      events: [{ name: "late", total: 10 }],
      sequence: 0,
      tick: 4,
    },
  ]);
});

test("fixed-step: serialize and restore is byte-identical to uninterrupted run", () => {
  const uninterrupted = createRun();
  uninterrupted.runThrough(6);

  const interrupted = createRun();
  interrupted.runThrough(2);
  const restored = FixedStepWorld.restore(interrupted.serialize(), {
    reducer,
  });
  restored.runThrough(6);

  assert.equal(restored.replayBytes(), uninterrupted.replayBytes());
  assert.equal(restored.serialize(), uninterrupted.serialize());
});

test("fixed-step: inputs and observable state are isolated JSON values", () => {
  const initialState = { applied: [], total: 0 };
  const command = { amount: 1, name: "isolated" };
  const world = new FixedStepWorld({ initialState, reducer });
  world.schedule(0, command);

  initialState.total = 99;
  command.amount = 99;
  world.runThrough(0);

  const observed = world.state;
  observed.total = 77;
  assert.equal(world.state.total, 1);
  assert.throws(
    () => world.schedule(1.5, { amount: 1, name: "bad" }),
    /safe integer/,
  );
  assert.throws(
    () => world.schedule(1, { amount: Number.NaN, name: "bad" }),
    /finite numbers/,
  );
});

const nondeterministicSyntax = [
  /\bDate\b/,
  /\bperformance\b/,
  /\bTemporal\s*\.\s*Now\b/,
  /\bprocess\s*\.\s*(?:hrtime|uptime)\b/,
  /\b(?:hrtime|uptime)\b\s*(?::|,|\})/,
  /\bsetTimeout\b/,
  /\bsetInterval\b/,
  /\bsetImmediate\b/,
  /\brequestAnimationFrame\b/,
  /\bMath\s*(?:\.\s*random\b|\[\s*["']random["']\s*\])/,
  /\bglobalThis\s*(?:\.\s*Math\b|\[\s*["']Math["']\s*\])\s*(?:\.\s*random\b|\[\s*["']random["']\s*\])/,
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:Math\b|globalThis\s*(?:\.\s*Math\b|\[\s*["']Math["']\s*\]))\s*;?[\s\S]*?\b\1\s*(?:\.\s*random\b|\[\s*["']random["']\s*\])/,
  /\b(?:const|let|var)\s*\{[^}]*\brandom\b(?:\s*:\s*[A-Za-z_$][\w$]*)?[^}]*\}\s*=\s*(?:Math\b|globalThis\s*(?:\.\s*Math\b|\[\s*["']Math["']\s*\]))/,
  /\bcrypto\s*(?:\.\s*(?:getRandomValues|randomUUID|randomBytes)\b|\[\s*["'](?:getRandomValues|randomUUID|randomBytes)["']\s*\])/,
  /\b(?:from\s+|require\s*\()\s*["'](?:node:)?crypto["']/,
  /\b(?:from\s+|require\s*\()\s*["'](?:node:)?perf_hooks["']/,
  /\b(?:from\s+|require\s*\()\s*["'](?:node:)?timers(?:\/promises)?["']/,
];

function deterministicSourceViolations(source) {
  return nondeterministicSyntax
    .filter((pattern) => pattern.test(source))
    .map((pattern) => pattern.source);
}

test("fixed-step: simulation source rejects ambient time and randomness", async () => {
  const simDirectory = new URL("../src/sim/", import.meta.url);
  const entries = await readdir(simDirectory, { recursive: true });
  const sourceFiles = entries.filter((entry) => entry.endsWith(".js"));

  assert.ok(sourceFiles.length > 0, "expected simulation source files");
  for (const relativePath of sourceFiles) {
    const source = readFileSync(join(simDirectory.pathname, relativePath), "utf8");
    assert.deepEqual(
      deterministicSourceViolations(source),
      [],
      `${relativePath} contains a nondeterministic API`,
    );
  }

  const rejectedSamples = [
    "Date.now()",
    "new Date()",
    "performance.now()",
    "const clock = performance; clock.now()",
    "Temporal.Now.instant()",
    "process.hrtime.bigint()",
    "const { hrtime: clock } = process; clock.bigint()",
    "import { performance as clock } from 'node:perf_hooks'; clock.now()",
    "const { performance: clock } = require('perf_hooks'); clock.now()",
    "import { setTimeout as delay } from 'node:timers/promises'",
    "setTimeout(run, 0)",
    "setInterval(run, 1)",
    "setImmediate(run)",
    "requestAnimationFrame(run)",
    "Math.random()",
    "const roll = Math.random",
    "Math['random']()",
    "const rng = Math; rng.random()",
    "const { random } = Math; random()",
    "globalThis[\"Math\"][\"random\"]()",
    "crypto.getRandomValues(buffer)",
    "crypto.randomUUID()",
    "crypto['randomUUID']()",
    "import { randomBytes } from 'node:crypto'",
    "require('crypto')",
  ];
  for (const sample of rejectedSamples) {
    assert.notDeepEqual(
      deterministicSourceViolations(sample),
      [],
      `gate did not reject ${canonicalJson(sample)}`,
    );
  }
});
