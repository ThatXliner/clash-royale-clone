#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { GameSession, getGameSessionAudioReplay } from "../../../src/sim/game-session.js";

const artifactPath = process.argv[2];
if (artifactPath === undefined) {
  throw new Error("usage: node bounded-host-mirror-tick600.mjs <continuation-result.json>");
}

const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const checkpointBytes = artifact.restore?.before?.sessionBytes;
if (typeof checkpointBytes !== "string") {
  throw new TypeError("input does not contain the saved pre-restore GameSession bytes");
}

const restoreStarted = performance.now();
const session = GameSession.restore(checkpointBytes);
const restoreMilliseconds = performance.now() - restoreStarted;
if (session.state.tick !== 600) {
  throw new Error(`expected saved tick 600 checkpoint, got ${session.state.tick}`);
}

const measurements = [];
for (let segment = 0; segment < 4; segment += 1) {
  const startTick = session.state.tick;
  const serializeBeforeStarted = performance.now();
  const beforeBytes = session.serialize();
  const serializeBeforeMilliseconds = performance.now() - serializeBeforeStarted;

  const stepStarted = performance.now();
  session.stepMany(300);
  const step300Milliseconds = performance.now() - stepStarted;

  const stateStarted = performance.now();
  const state = session.state;
  const stateReadMilliseconds = performance.now() - stateStarted;

  const serializeAfterStarted = performance.now();
  const afterBytes = session.serialize();
  const serializeAfterMilliseconds = performance.now() - serializeAfterStarted;
  measurements.push({
    startTick,
    endTick: state.tick,
    step300Milliseconds: +step300Milliseconds.toFixed(3),
    stateReadMilliseconds: +stateReadMilliseconds.toFixed(3),
    serializeBeforeMilliseconds: +serializeBeforeMilliseconds.toFixed(3),
    serializeAfterMilliseconds: +serializeAfterMilliseconds.toFixed(3),
    beforeBytes: beforeBytes.length,
    afterBytes: afterBytes.length,
    audioReplayCount: getGameSessionAudioReplay(session).length,
  });
}

console.log(JSON.stringify({
  status: "diagnostic-only-not-pass",
  source: "authentic archived GameSession checkpoint at tick 600; no synthesized state",
  checkpointBytes: checkpointBytes.length,
  restoreMilliseconds: +restoreMilliseconds.toFixed(3),
  measurements,
  environmentAuditCount: artifact.environmentAudits?.length ?? 0,
  limitation: "Node host mirror only; no Playwright, RAF, input DOM, or browser audio backend",
}, null, 2));
