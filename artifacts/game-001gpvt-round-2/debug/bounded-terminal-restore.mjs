#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { isMainThread, parentPort, workerData, Worker } from "node:worker_threads";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../..");

if (!isMainThread) {
  const { GameSession, getGameSessionAudioReplay } = await import(
    pathToFileURL(resolve(repositoryRoot, "src/sim/game-session.js")).href);
  const artifact = JSON.parse(readFileSync(workerData.artifactPath, "utf8"));
  const sessionBytes = artifact.terminal?.finalView?.sessionBytes;
  if (typeof sessionBytes !== "string") {
    throw new TypeError("input does not contain terminal GameSession bytes");
  }
  const restoreStarted = performance.now();
  const session = GameSession.restore(sessionBytes);
  const restoreMilliseconds = performance.now() - restoreStarted;
  const stateStarted = performance.now();
  const state = session.state;
  const stateReadMilliseconds = performance.now() - stateStarted;
  const serializeStarted = performance.now();
  const serialized = session.serialize();
  const serializeMilliseconds = performance.now() - serializeStarted;
  parentPort.postMessage({
    status: "complete",
    checkpointBytes: sessionBytes.length,
    tick: state.tick,
    terminal: state.terminal,
    restoreMilliseconds: +restoreMilliseconds.toFixed(3),
    stateReadMilliseconds: +stateReadMilliseconds.toFixed(3),
    serializeMilliseconds: +serializeMilliseconds.toFixed(3),
    serializedBytes: serialized.length,
    audioReplayCount: getGameSessionAudioReplay(session).length,
    limitation: "Terminal snapshot cannot be advanced by stepMany; no state was fabricated",
  });
} else {
  const artifactPath = process.argv[2];
  const timeBudgetMilliseconds = Number(process.argv[3] ?? 8_000);
  if (artifactPath === undefined) {
    throw new Error("usage: node bounded-terminal-restore.mjs <endurance-result.json> [budget-ms]");
  }
  if (!Number.isSafeInteger(timeBudgetMilliseconds) || timeBudgetMilliseconds < 1 ||
      timeBudgetMilliseconds > 9_000) {
    throw new RangeError("budget must be an integer from 1 through 9000 milliseconds");
  }
  const started = performance.now();
  const worker = new Worker(new URL(import.meta.url), { workerData: { artifactPath } });
  let finished = false;
  const finish = (result) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    console.log(JSON.stringify({
      ...result,
      wallMilliseconds: +(performance.now() - started).toFixed(3),
      timeBudgetMilliseconds,
      status: result.status === "complete" ? result.status : "diagnostic-timeout-not-pass",
    }, null, 2));
  };
  const timer = setTimeout(() => {
    finish({ limitation: "worker was terminated at the measurement budget; no raw checkpoint bytes emitted" });
    void worker.terminate();
  }, timeBudgetMilliseconds);
  worker.once("message", finish);
  worker.once("error", (error) => finish({ status: "error", message: error.message }));
  worker.once("exit", (code) => {
    if (!finished && code !== 0) finish({ status: "error", message: `worker exited ${code}` });
  });
}
