import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertEnduranceWorkloadCanContinue,
  plannedSouthAttempt,
} from "./helpers/endurance-workload.js";

const TERMINAL_REPLAY = new URL(
  "../artifacts/game001gpr5-round-2/builder/derived-checkpoint-manifest.json",
  import.meta.url,
);
const REQUIRED_END_TICK = 18_000;

test("the replay-derived natural terminal stops planning and keeps the 18,000-tick gate red", () => {
  const evidence = JSON.parse(readFileSync(TERMINAL_REPLAY, "utf8"));
  assert.equal(evidence.evidence.transcriptSha256,
    "bd06ef21ccd243f48667a1ffdcb5d522613fcf03f3f3b311852dc9c8e4e90594",
    "the failure record belongs to the captured deterministic Chrome transcript");
  assert.equal(evidence.terminal.firstTerminalTick, 13_352);
  assert.equal(evidence.terminal.isTerminal, true);
  assert.deepEqual(evidence.terminal.result, {
    crowns: { north: 2, south: 1 },
    endedAtTick: 13_351,
    kind: "win",
    reason: "overtime_sudden_death",
    winner: "north",
  });

  const terminalSession = { state: {
    terminal: evidence.terminal.isTerminal,
    tick: evidence.terminal.firstTerminalTick,
    clock: { result: evidence.terminal.result },
  } };
  assert.equal(plannedSouthAttempt(terminalSession), null,
    "terminal state produces no stale or post-match deployment command");
  assert.throws(() => assertEnduranceWorkloadCanContinue(terminalSession, REQUIRED_END_TICK),
    /ended naturally at tick 13351 before required tick 18000 \(overtime_sudden_death; north won\)/,
    "the unchanged full-duration requirement still rejects the old workload");
});
