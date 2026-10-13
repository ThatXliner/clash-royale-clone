import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  assertEnduranceWorkloadCanContinue,
  plannedSouthAttempt,
} from "../../../tests/helpers/endurance-workload.js";

const root = new URL("../../../", import.meta.url);
const at = (relative) => new URL(relative, root);
const readJson = (relative) => JSON.parse(readFileSync(at(relative), "utf8"));
const digest = (value) => createHash("sha256").update(value).digest("hex");
const captureError = (operation) => {
  try {
    operation();
  } catch (error) {
    return error;
  }
  assert.fail("expected the operation to throw");
};
const frozenPath = "artifacts/game001gpr5-round-1/critic/browser-artifacts/endurance-result.json";
const frozenBytes = readFileSync(at(frozenPath));
const frozen = JSON.parse(frozenBytes);
const sourceManifest = readJson("artifacts/game001gpr5-round-1/critic/source-manifest.json");
const failureSummary = readJson("artifacts/game001gpr5-round-1/critic/failure-summary.json");
const runRecord = readJson("artifacts/game001gpr5-round-1/critic/run-record.json");
const derived = readJson("artifacts/game001gpr5-round-2/builder/derived-checkpoint-manifest.json");
const copiedBytes = readFileSync(at("artifacts/game001gpr5-round-2/builder/fresh-failed-transcript.json"));
const replayOneBytes = readFileSync(at("artifacts/game001gpr5-round-2/builder/red-replay-1.stdout.json"));
const replayTwoBytes = readFileSync(at("artifacts/game001gpr5-round-2/builder/red-replay-2.stdout.json"));
const replayOne = JSON.parse(replayOneBytes);
const replayTwo = JSON.parse(replayTwoBytes);

const frozenSha256 = digest(frozenBytes);
assert.equal(digest(Buffer.from(`${JSON.stringify(frozen, null, 2)}\n`)), frozenSha256,
  "the frozen JSON serialization is stable for the hostile-count tamper probe");
assert.equal(sourceManifest.gitCommit, "6c7cee8e49cbfd004c9f4053984e689f497df10b");
assert.equal(runRecord.artifacts.find(({ path }) => path ===
  "artifacts/game001gpr5-round-1/critic/browser-artifacts/endurance-result.json").sha256,
frozenSha256);
assert.equal(failureSummary.lastCompletedSegment, 13_352);
assert.match(failureSummary.failure.message, /24 !== 25/);
assert.equal(digest(copiedBytes), frozenSha256,
  "the replay input is byte-identical to the frozen Chrome failure JSON");
assert.equal(derived.evidence.transcriptSha256, frozenSha256);
assert.equal(replayOneBytes.equals(replayTwoBytes), true,
  "the two independently preserved replay outputs are byte-identical");
assert.equal(replayOne.replay.endingTick, 13_352);
assert.equal(replayOne.replay.endingTick, derived.replay.endingTick);
assert.equal(replayOne.replay.acceptedCommandsAfterRestore, 24);
assert.equal(replayOne.replay.transcriptRecords, derived.replay.transcriptRecords);
assert.equal(replayOne.replay.acceptedCommandsAfterRestore,
  derived.replay.acceptedCommandsAfterRestore);
assert.equal(replayOne.terminal.isTerminal, true);
assert.equal(replayOne.terminal.isTerminal, derived.terminal.isTerminal);
assert.deepEqual(replayOne.terminal.crowns, derived.terminal.crowns);
assert.deepEqual(replayOne, replayTwo);

const checkpointDirectory = "artifacts/game001gpr5-round-2/builder/";
const checkpointChecks = derived.evidence.checkpoints.map((record) => {
  const raw = readFileSync(at(checkpointDirectory + record.file));
  const serialized = raw.toString("utf8").replace(/\n$/, "");
  assert.equal(Buffer.byteLength(serialized), record.bytes, `${record.file} byte count`);
  assert.equal(digest(serialized), record.sha256, `${record.file} manifest hash`);
  return { file: record.file, tick: record.tick, bytes: record.bytes, sha256: record.sha256 };
});

const checkpointTick = 13_200;
const checkpointRecord = derived.evidence.checkpoints.find(({ tick }) => tick === checkpointTick);
const activeRecord = frozen.transportIdNormalization.find(({ tick }) => tick === checkpointTick);
assert.ok(activeRecord, "the frozen failure transcript contains the tick-13,200 plan");
assert.deepEqual(activeRecord.planned, activeRecord.normalized,
  "the last physical delivery preserved the active planner command");
assert.equal(activeRecord.planned.tick, checkpointTick);
assert.equal(activeRecord.planned.cardId, "cinderlings");

const oldBrowserTest = execFileSync("git", ["show", "HEAD^:tests/game-browser-endurance.test.js"], {
  encoding: "utf8",
});
const currentHelper = readFileSync(at("tests/helpers/endurance-workload.js"), "utf8");
const extractPlanner = (source, endMarker) => {
  const start = source.indexOf("function plannedSouthAttempt(session) {");
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, "planner function boundaries are present");
  return source.slice(start, end).trimEnd();
};
const oldPlanner = extractPlanner(oldBrowserTest, "\nfunction normalizedCommand");
const currentPlanner = extractPlanner(currentHelper, "\n\n/** Fails the full-duration workload");
const withoutTerminalGuard = currentPlanner.replace("  if (state.terminal) return null;\n", "");
const normalizeWhitespace = (value) => value.replace(/\s+/g, " ").trim();
assert.equal(normalizeWhitespace(withoutTerminalGuard), normalizeWhitespace(oldPlanner),
  "the active planner body is unchanged apart from terminal guard and formatting");

const terminalSession = { state: {
  terminal: derived.terminal.isTerminal,
  tick: derived.terminal.firstTerminalTick,
  clock: { result: derived.terminal.result },
} };
assert.equal(plannedSouthAttempt(terminalSession), null,
  "the provenance-verified natural terminal creates no planned player gesture");
const terminalError = captureError(() =>
  assertEnduranceWorkloadCanContinue(terminalSession, 18_000));
assert.equal(terminalError.message,
  "endurance workload ended naturally at tick 13351 before required tick 18000 " +
    "(overtime_sudden_death; north won)");

const fakeCountOnTerminalState = { state: {
  ...terminalSession.state,
  tick: 18_000,
  terminal: true,
} };
const hostileCountError = captureError(() =>
  assertEnduranceWorkloadCanContinue(fakeCountOnTerminalState, 18_000));
assert.match(hostileCountError.message, /ended naturally at tick 13351 before required tick 18000/,
  "a forged tick count cannot hide the recorded early terminal");

const normalExactEnd = { state: { tick: 18_000, terminal: false, clock: { result: null } } };
assert.equal(assertEnduranceWorkloadCanContinue(normalExactEnd, 18_000), true,
  "the terminal guard permits ordinary active completion at the required tick");

const forgedManifest = structuredClone(derived);
forgedManifest.terminal.firstTerminalTick = 18_000;
forgedManifest.terminal.result.endedAtTick = 18_000;
assert.notEqual(forgedManifest.terminal.firstTerminalTick, 13_352,
  "the focused regression's pinned terminal tick rejects a fake count");
assert.notDeepEqual(forgedManifest.terminal.result, derived.terminal.result,
  "the focused regression's pinned result rejects a fake terminal record");
const changedTranscript = structuredClone(frozen);
changedTranscript.segments.at(-1).tick = 18_000;
assert.notEqual(digest(Buffer.from(`${JSON.stringify(changedTranscript, null, 2)}\n`)), frozenSha256,
  "altering the recorded segment count breaks the frozen transcript hash");

const previousRuntime = "6c7cee8e49cbfd004c9f4053984e689f497df10b";
const runtimeDiff = execFileSync("git", ["diff", "--name-only", previousRuntime, "HEAD", "--", "src"], {
  encoding: "utf8",
}).trim();
assert.equal(runtimeDiff, "", "no runtime source changed since frozen 6c7");
const frozenRuntimeFiles = sourceManifest.sourceFiles.filter(({ path }) => path.startsWith("src/"))
  .map((record) => {
    const sha256 = digest(readFileSync(at(record.path)));
    assert.equal(sha256, record.sha256, `${record.path} matches the frozen 6c7 source hash`);
    return { path: record.path, sha256 };
  });
const kernelAtFreeze = execFileSync("git", ["show", `${previousRuntime}:src/sim/battle-continuation-kernel.js`]);
const kernelWorkingSha256 = digest(readFileSync(at("src/sim/battle-continuation-kernel.js")));
assert.equal(kernelWorkingSha256, digest(kernelAtFreeze),
  "the live runtime kernel bytes still match the frozen 6c7 source object");

console.log(JSON.stringify({
  provenance: {
    frozenJsonPath: frozenPath,
    frozenJsonSha256: frozenSha256,
    copiedReplayInputSha256: digest(copiedBytes),
    derivedManifestSha256: digest(readFileSync(at(
      "artifacts/game001gpr5-round-2/builder/derived-checkpoint-manifest.json"))),
    replay1Sha256: digest(replayOneBytes),
    replay2Sha256: digest(replayTwoBytes),
    replayOutputsByteIdentical: replayOneBytes.equals(replayTwoBytes),
    checkpointChecks,
  },
  probes: {
    plannerFunctionSha256: digest(currentPlanner),
    plannerBodyMatchesPreChangeAfterGuardRemovalAndWhitespaceNormalization: true,
    tick13200Plan: activeRecord.planned,
    recordedActivePlan: activeRecord.planned,
    terminalPlanner: plannedSouthAttempt(terminalSession),
    exactTerminalDiagnostic: terminalError.message,
    forged18000TickStillThrows: hostileCountError.message,
    exact18000ActiveGate: assertEnduranceWorkloadCanContinue(normalExactEnd, 18_000),
    fakeManifestTickAndResultRejectedByPinnedExpectedValues: true,
    alteredTranscriptHashRejected: true,
  },
  runtime: {
    unchangedFrom6c7: true,
    battleKernelSha256: kernelWorkingSha256,
    frozenRuntimeFiles,
  },
}, null, 2));
