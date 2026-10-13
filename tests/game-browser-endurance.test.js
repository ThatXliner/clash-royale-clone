import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import test from "node:test";

import {
  GameSession,
  getGameSessionAudioReplay,
} from "../src/sim/game-session.js";
import {
  GAME_BROWSER_ENDURANCE_MAX_CHUNK_TICKS,
  GAME_BROWSER_ENDURANCE_MAX_SEGMENT_TICKS,
  GAME_BROWSER_ENDURANCE_PRESENTATION_TICKS,
  createShippedGameSessionSetup,
} from "../src/ui/game-browser-entry.js";
import {
  assertEnduranceWorkloadCanContinue,
  ENDURANCE_BASELINE_INTERVAL_TICKS,
  ENDURANCE_REACTION_INTERVAL_TICKS,
  createEnduranceWorkloadPolicy,
  exactEnduranceSetupBytes,
} from "./helpers/endurance-workload.js";

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = new URL("../artifacts/game-001gp-browser-endurance/", import.meta.url).pathname;

const SEGMENT_TICKS = ENDURANCE_BASELINE_INTERVAL_TICKS;
const TERMINAL_TICK = 18_000;
const EXPECTED_SETUP_SHA256 = "306bb30da40ce7c43d6cccce8728449da90fc0e9ca7d13c81f0116ba710aec8c";
const TEST_END_TICK = process.env.GAME_BROWSER_ENDURANCE_TICKS === undefined
  ? TERMINAL_TICK : Number(process.env.GAME_BROWSER_ENDURANCE_TICKS);
const MAX_BROWSER_LONG_TASK_MS = 50;
const MAX_EXPLICIT_SLICE_MS = 40;
// Module parse plus the first real shell mount are intentionally measured
// separately from scheduler work. This Chrome-specific budget is grounded in
// the complete 720x1280 initialization transaction, rather than hiding it.
const MAX_INITIALIZATION_LONG_TASK_MS = 300;
// A slice overrun is only blamed on the shipped scheduler when the identical
// deterministic work reproduces it in a quiescent re-measurement. This delay
// lets a transient GC pause or externally stolen CPU window drain first.
const SLICE_AUDIT_QUIESCENCE_DELAY_MS = 2_000;
const SLICE_AUDIT_ATTEMPTS = 2;
const MAX_SEGMENT_WALL_CLOCK_MS = 30_000;
const MAX_ENDURANCE_WALL_CLOCK_MS = 1_200_000;
const FULL_RUN = TEST_END_TICK === TERMINAL_TICK;

if (!Number.isSafeInteger(TEST_END_TICK) || TEST_END_TICK < 900 ||
    TEST_END_TICK > TERMINAL_TICK || TEST_END_TICK % SEGMENT_TICKS !== 0) {
  throw new TypeError("GAME_BROWSER_ENDURANCE_TICKS must be a 300-tick multiple from 900 to 18000");
}
if (GAME_BROWSER_ENDURANCE_MAX_SEGMENT_TICKS !== SEGMENT_TICKS) {
  throw new Error("browser endurance segment no longer matches the GH 300-tick cadence");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizedCommand(command) {
  return { cardId: command.cardId, point: command.point, slot: command.slot,
    tick: command.tick };
}

function stateDigest(state) {
  return {
    crowns: state.clock.crowns,
    deck: state.decks.south,
    elixir: state.elixir.sides,
    terminal: state.terminal,
    tick: state.tick,
    towers: state.battle.towers.map(({ hitpoints, id }) => ({ hitpoints, id })),
  };
}

function classifyLongTaskEntries(entries, intervals, firstDriveStartedAt) {
  const byInterval = new Map(intervals.map((interval) => [interval.id,
    entries.filter(({ duration, startTime }) =>
      startTime < interval.finishedAt && startTime + duration > interval.startedAt)]));
  const measured = new Set([...byInterval.values()].flat());
  const initializationEnd = firstDriveStartedAt ?? Infinity;
  const initialization = entries.filter((entry) => !measured.has(entry) &&
    entry.startTime + entry.duration <= initializationEnd);
  const outOfSegment = entries.filter((entry) => !measured.has(entry) &&
    !initialization.includes(entry));
  const tasksFor = (kind) => [...new Set(intervals.filter((interval) =>
    interval.kind === kind).flatMap(({ id }) => byInterval.get(id)))];
  return {
    byInterval,
    driven: tasksFor("drive"),
    finalObserverDrain: tasksFor("final-observer-drain"),
    initialization,
    outOfSegment,
    restart: tasksFor("restart"),
    restore: tasksFor("restore"),
    screenshots: tasksFor("screenshot"),
    terminalObservation: tasksFor("terminal-observation"),
  };
}

function assertLongTaskCaps(classification, intervals) {
  assert.equal(classification.initialization.every(({ duration }) =>
    duration <= MAX_INITIALIZATION_LONG_TASK_MS), true,
  `initial browser setup stays inside the ${MAX_INITIALIZATION_LONG_TASK_MS}ms cap`);
  assert.equal(classification.outOfSegment.every(({ duration }) =>
    duration <= MAX_BROWSER_LONG_TASK_MS), true,
  `no out-of-interval browser long task exceeds ${MAX_BROWSER_LONG_TASK_MS}ms`);
  for (const interval of intervals) {
    const entries = classification.byInterval.get(interval.id) ?? [];
    assert.equal(entries.every(({ duration }) => duration <= MAX_BROWSER_LONG_TASK_MS), true,
      interval.kind === "drive"
        ? `no browser long task exceeds ${MAX_BROWSER_LONG_TASK_MS}ms`
        : `${interval.kind} stays inside the ${MAX_BROWSER_LONG_TASK_MS}ms long-task cap`);
  }
}

test("game browser endurance: delayed long-task entries retain their measured interval", () => {
  const intervals = [
    { finishedAt: 170, id: "drive-0", kind: "drive", startedAt: 100 },
    { finishedAt: 245, id: "restore-0", kind: "restore", startedAt: 180 },
    { finishedAt: 300, id: "drive-1", kind: "drive", startedAt: 250 },
    { finishedAt: 350, id: "terminal-observation", kind: "terminal-observation",
      startedAt: 310 },
    { finishedAt: 400, id: "restart", kind: "restart", startedAt: 350 },
    { finishedAt: 450, id: "final-observer-drain", kind: "final-observer-drain",
      startedAt: 400 },
    { finishedAt: 500, id: "screenshot-0", kind: "screenshot", startedAt: 450 },
  ];
  const initialization = { duration: 60, name: "self", startTime: 10 };
  const lateDriveEntry = { duration: 51, name: "self", startTime: 110 };
  const laterDriveEntry = { duration: 10, name: "self", startTime: 260 };
  const lateRestoreEntry = { duration: 52, name: "self", startTime: 190 };
  const betweenIntervals = { duration: 5, name: "self", startTime: 172 };
  const terminalObservationEntry = { duration: 29, name: "self", startTime: 320 };
  const restartEntry = { duration: 29, name: "self", startTime: 360 };
  const drainEntry = { duration: 29, name: "self", startTime: 410 };
  const screenshotEntry = { duration: 29, name: "self", startTime: 460 };
  const deliveredBatches = [[initialization], [laterDriveEntry],
    [betweenIntervals, lateDriveEntry, lateRestoreEntry],
    [terminalObservationEntry, restartEntry, drainEntry, screenshotEntry]];
  let observed = [];
  for (const batch of deliveredBatches) observed = [...observed, ...batch];
  const classification = classifyLongTaskEntries(observed, intervals, 100);

  assert.deepEqual(classification.initialization, [initialization]);
  assert.deepEqual(classification.byInterval.get("drive-0"), [lateDriveEntry]);
  assert.deepEqual(classification.byInterval.get("restore-0"), [lateRestoreEntry]);
  assert.deepEqual(classification.byInterval.get("drive-1"), [laterDriveEntry]);
  assert.deepEqual(classification.terminalObservation, [terminalObservationEntry]);
  assert.deepEqual(classification.restart, [restartEntry]);
  assert.deepEqual(classification.finalObserverDrain, [drainEntry]);
  assert.deepEqual(classification.screenshots, [screenshotEntry]);
  assert.deepEqual(classification.outOfSegment, [betweenIntervals]);
  assert.throws(() => assertLongTaskCaps(classification, [intervals[0]]),
    /no browser long task exceeds 50ms/u);
  assert.throws(() => assertLongTaskCaps(classification, [intervals[1]]),
    /restore stays inside the 50ms long-task cap/u);

  const lifecycleIntervals = intervals.filter(({ kind }) =>
    ["terminal-observation", "restart", "final-observer-drain", "screenshot"].includes(kind));
  const lifecycleClassification = classifyLongTaskEntries([
    terminalObservationEntry, restartEntry, drainEntry, screenshotEntry,
  ], lifecycleIntervals, 100);
  assertLongTaskCaps(lifecycleClassification, lifecycleIntervals);
  for (const interval of lifecycleIntervals) {
    const overCapEntry = { duration: 51, name: "self", startTime: interval.startedAt + 1 };
    const overCapClassification = classifyLongTaskEntries([overCapEntry], [interval], 100);
    assert.throws(() => assertLongTaskCaps(overCapClassification, [interval]),
      new RegExp(`${interval.kind} stays inside the 50ms long-task cap`));
  }

  const outOfSegmentTail = { duration: 76, name: "self", startTime: 510 };
  const withUnmeasuredTail = classifyLongTaskEntries(
    [...observed, outOfSegmentTail], intervals, 100);
  assert.deepEqual(withUnmeasuredTail.outOfSegment, [betweenIntervals, outOfSegmentTail]);
  assert.throws(() => assertLongTaskCaps(withUnmeasuredTail, intervals),
    /no out-of-interval browser long task exceeds 50ms/u,
    "a late tail cannot leave the phase summaries clean while escaping the cap");
});

async function firstLine(stream) {
  let text = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    text += chunk;
    const end = text.indexOf("\n");
    if (end >= 0) return text.slice(0, end);
  }
  throw new Error("browser endurance server exited before readiness");
}

async function stopServer(server) {
  if (server === undefined || server.exitCode !== null) return true;
  const exited = once(server, "exit").then(() => true, () => false);
  server.kill("SIGTERM");
  let didExit = await Promise.race([
    exited, new Promise((resolve) => setTimeout(() => resolve(false), 2_000)),
  ]);
  if (!didExit && server.exitCode === null) {
    server.kill("SIGKILL");
    didExit = await Promise.race([
      exited, new Promise((resolve) => setTimeout(() => resolve(false), 2_000)),
    ]);
  }
  return didExit && (server.exitCode !== null || server.signalCode !== null);
}

async function browserView(page, options = {}) {
  const checked = { audioContinuation: false, bridge: false, bytes: false, digest: false,
    loop: false, ...options };
  return page.evaluate((requested) => {
    const controller = globalThis.__gameBrowserEnduranceController;
    const diagnostics = controller.audioDiagnostics;
    const state = requested.digest ? controller.session.state : null;
    const loopSnapshot = requested.bridge ? JSON.parse(controller.serialize()) : null;
    const layers = Object.fromEntries([...document.querySelectorAll(".game-browser-layer")]
      .map((layer) => [layer.dataset.gameBrowserLayer,
        layer.firstElementChild?.dataset.tick ?? null]));
    const overlay = document.querySelector(".match-feedback__overlay");
    const overlayBox = overlay?.getBoundingClientRect();
    return {
      audio: controller.audio,
      audioContinuationBytes: requested.audioContinuation
        ? controller.audioContinuationBytes : null,
      audioDiagnostics: diagnostics,
      bridge: loopSnapshot === null ? null : JSON.parse(loopSnapshot.bridge),
      layers,
      pendingResources: performance.getEntriesByType("resource")
        .filter(({ duration, responseEnd }) => duration === 0 && responseEnd === 0)
        .map(({ name }) => name),
      audioReplayLength: diagnostics.cursor,
      restartHidden: document.querySelector('[data-ui="restart"]').hidden,
      sessionBytes: requested.bytes ? controller.session.serialize() : null,
      state: requested.loop ? controller.state : null,
      stateDigest: state === null ? null : {
        crowns: state.clock.crowns,
        deck: state.decks.south,
        elixir: state.elixir.sides,
        terminal: state.terminal,
        tick: state.tick,
        towers: state.battle.towers.map(({ hitpoints, id }) => ({ hitpoints, id })),
      },
      terminalOverlay: overlayBox === undefined ? null : {
        height: Math.round(overlayBox.height), width: Math.round(overlayBox.width),
      },
    };
  }, checked);
}

async function deliverPhysicalPlan(page, plan) {
  const before = await browserView(page, { bridge: true });
  const card = page.locator(`[data-ui="card-slot"][data-card-id="${plan.cardId}"]`).first();
  await card.click();
  const clientPoint = await page.evaluate((point) => {
    const arena = document.querySelector('[data-ui="arena"]');
    const rect = arena.getBoundingClientRect();
    return {
      x: rect.left + arena.clientLeft + point.x * arena.clientWidth / 18_000,
      y: rect.top + arena.clientTop + arena.clientHeight - point.y * arena.clientHeight / 32_000,
    };
  }, plan.point);
  await page.mouse.click(clientPoint.x, clientPoint.y);
  const after = await browserView(page, { bridge: true });
  assert.equal(after.bridge.deliveries.length, before.bridge.deliveries.length + 1,
    "one physical card/arena gesture produces exactly one E2 delivery");
  return after.bridge.deliveries.at(-1);
}

async function driveBrowserSegment(page, count) {
  const driven = await page.evaluate(async (ticks) => {
    const controller = globalThis.__gameBrowserEnduranceController;
    const timing = globalThis.__gameBrowserEndurancePerformance;
    const started = performance.now();
    timing.timingContext = { kind: "drive", nextTick: controller.state.sessionTick };
    try {
      const result = await controller.driveEnduranceSegment(ticks);
      const finished = performance.now();
      return { elapsedMilliseconds: Math.round(finished - started), finishedAt: finished,
        result, startedAt: started };
    } finally {
      timing.timingContext = null;
    }
  }, count);
  await page.waitForTimeout(0);
  return driven;
}

async function restoreBrowserSnapshot(page, snapshot) {
  const restored = await page.evaluate(async (bytes) => {
    const controller = globalThis.__gameBrowserEnduranceController;
    const telemetry = globalThis.__gameBrowserEndurancePerformance;
    const before = { audio: controller.audio, audioContinuationBytes: controller.audioContinuationBytes,
      diagnostics: controller.audioDiagnostics, bridge: JSON.parse(controller.serialize()).bridge,
      sessionBytes: controller.session.serialize() };
    const startedAt = performance.now();
    telemetry.timingContext = { kind: "restore", nextTick: 0 };
    try {
      // An async function executes through its first yield before returning its
      // promise. This is the real continuation envelope/setup preflight task.
      const pending = controller.restoreEndurance(bytes);
      const dispatchedAt = performance.now();
      telemetry.recordTiming("restorePreflightDispatch", startedAt,
        { bytes: bytes.length, elapsedMilliseconds: dispatchedAt - startedAt });
      const state = await pending;
      const finishedAt = performance.now();
      return { after: { audio: controller.audio,
        audioContinuationBytes: controller.audioContinuationBytes,
        diagnostics: controller.audioDiagnostics,
        bridge: JSON.parse(controller.serialize()).bridge, state,
        sessionBytes: controller.session.serialize() }, before,
        elapsedMilliseconds: Math.round(finishedAt - startedAt), finishedAt, startedAt };
    } finally {
      telemetry.timingContext = null;
    }
  }, snapshot);
  // Allow the observer delivery task to run before its cursor is sampled.
  await page.waitForTimeout(0);
  return restored;
}

async function readNewLongTasks(page, cursor) {
  return page.evaluate((index) => {
    const telemetry = globalThis.__gameBrowserEndurancePerformance;
    const pending = telemetry.observer?.takeRecords() ?? [];
    for (const entry of pending) {
      telemetry.longTasks.push({ duration: entry.duration, name: entry.name,
        startTime: entry.startTime });
    }
    return {
      capturedAt: performance.now(),
      cursor: telemetry.longTasks.length,
      drainedPendingCount: pending.length,
      supported: telemetry.supported,
      tasks: telemetry.longTasks.slice(index),
    };
  }, cursor);
}

async function captureScreenshotWithInterval(page, path, id, intervals) {
  const interval = { finishedAt: Infinity, id, kind: "screenshot",
    startedAt: await page.evaluate(() => performance.now()) };
  intervals.push(interval);
  await page.screenshot({ path });
  interval.finishedAt = await page.evaluate(() => performance.now());
  return interval;
}

async function readAndResetTiming(page) {
  return page.evaluate(() => {
    const performance = globalThis.__gameBrowserEndurancePerformance;
    const timing = JSON.parse(JSON.stringify(performance.timing));
    performance.timing = Object.create(null);
    return timing;
  });
}

function recordHostPhase(telemetry, phase, fromTick, startedAt, details = {}) {
  const finishedAt = performance.now();
  const durationMs = finishedAt - startedAt;
  telemetry.hostPhaseTimings.push({ durationMs, finishedAt, fromTick, phase, startedAt, ...details });
  return durationMs;
}

function assertSegmentTransactions(driven, fromTick, seenCueSequences, seenStartSequences) {
  const chunks = driven.result.chunks;
  assert.ok(chunks.length > 0, "endurance segment contains yielding transactions");
  let expectedTick = fromTick;
  for (const chunk of chunks) {
    assert.equal(chunk.fromTick, expectedTick);
    assert.ok(chunk.sessionTick > chunk.fromTick);
    assert.ok(chunk.simulationTickCount >= 1 &&
      chunk.simulationTickCount <= GAME_BROWSER_ENDURANCE_PRESENTATION_TICKS,
      "each transactional browser presentation stays inside the documented cadence");
    assert.equal(chunk.sessionTick - chunk.fromTick, chunk.simulationTickCount,
      "presentation telemetry names the exact simulated tick range");
    assert.ok(chunk.simulationSliceCount >= Math.ceil(
      chunk.simulationTickCount / GAME_BROWSER_ENDURANCE_MAX_CHUNK_TICKS,
    ) && chunk.simulationSliceCount <= chunk.simulationTickCount,
    "each presentation records its true count of bounded yielding simulation calls");
    assert.equal(chunk.simulationChunkTicks, GAME_BROWSER_ENDURANCE_MAX_CHUNK_TICKS,
      "each yielding simulation call uses the documented fixed batch size");
    assert.equal(chunk.domTick, chunk.sessionTick,
      "projection commits the same tick as the session transaction");
    assert.equal(chunk.audio.authorityRecordCount, chunk.audio.cursor,
      "audio authority cursor consumes every replay record through this transaction");
    assert.equal(chunk.audio.candidateCueCount,
      chunk.audio.cueSequences.length + chunk.audio.skippedCueCount,
      "accelerated audio explicitly accounts for every candidate cue");
    assert.ok(chunk.audio.cueSequences.length <= chunk.audio.audibleCueCap,
      "accelerated audio stays within its audible cue cap");
    assert.deepEqual(chunk.audio.startSequences, chunk.audio.cueSequences,
      "each selected live/accelerated cue starts once");
    for (const sequence of chunk.audio.cueSequences) {
      assert.equal(seenCueSequences.has(sequence), false,
        `audio cue authority record ${sequence} was not duplicated`);
      seenCueSequences.add(sequence);
    }
    for (const sequence of chunk.audio.startSequences) {
      assert.equal(seenStartSequences.has(sequence), false,
        `audible start authority record ${sequence} was not duplicated`);
      seenStartSequences.add(sequence);
    }
    expectedTick = chunk.sessionTick;
  }
  assert.equal(driven.result.state.sessionTick, expectedTick);
  assert.equal(driven.result.state.domTick, expectedTick);
  return expectedTick;
}

test("game browser endurance: exact GH seed-zero workload yields through Chrome to terminal", {
  timeout: MAX_ENDURANCE_WALL_CLOCK_MS + 60_000,
}, async () => {
  assert.ok(existsSync(PLAYWRIGHT), "installed Playwright equivalent is required");
  assert.ok(existsSync(CHROME), "installed Chrome is required");
  mkdirSync(ARTIFACTS, { recursive: true });

  const telemetry = {
    architecture: {
      audioPolicy: "Each 100-tick-or-terminal presentation consumes all authority records; accelerated rendering selects newest critical then newest remaining cues up to a fixed cap.",
      browserApi: "mountShippedGameBrowser().enterManualStepMode().driveEnduranceSegment(1..300)",
      chunkTicks: GAME_BROWSER_ENDURANCE_MAX_CHUNK_TICKS,
      initializationLongTaskCapMilliseconds: MAX_INITIALIZATION_LONG_TASK_MS,
      lifecycleLongTaskPolicy: "Drive, restore, terminal observation, restart, screenshots, final observer drain, and out-of-interval tasks are separately attributed and capped at 50ms; entries are classified by start time even when delivery is delayed.",
      longTaskCapMilliseconds: MAX_BROWSER_LONG_TASK_MS,
      sliceGuardPolicy: "An explicit slice overrun is re-measured deterministically in a quiescent Node audit (bounded retries); only a reproduced overrun fails, while an unreproduced one is recorded as environment noise.",
      presentationPolicy: "Input is suspended for each adaptive policy span, at most 300 ticks. Every fixed one-tick simulation slice yields through real RAF; every 100 ticks (or segment/terminal boundary) one complete DOM/audio transaction commits, then exactly one E2 input controller remounts at segment finish. A 15-tick look-ahead stops at each planned reaction without splitting spans that have no action.",
      presentationTicks: GAME_BROWSER_ENDURANCE_PRESENTATION_TICKS,
      restorePolicy: "Only a consumed replay prefix may rebase; restored history is not rendered into the audio sink.",
      segmentTicks: GAME_BROWSER_ENDURANCE_MAX_SEGMENT_TICKS,
      transportNormalization: "Policy decisions occur on 15-tick boundaries, with the frozen baseline checked every 300 ticks; browser E2 uses contiguous accepted command IDs. Byte parity is browser-vs-direct-E2, while attempt records compare normalized semantic commands.",
      yieldPolicy: "Each fixed simulation slice awaits RAF, then Chrome scheduler.yield() when available, then a second cancellable RAF; unsupported schedulers use the two-RAF policy.",
      hostPhaseTiming: "Diagnostic-only Node performance.now() spans are recorded separately from Chrome page.performance.now() drive timestamps; these measurements do not change the workload or any cap.",
      hostPhaseTimingClock: "startedAt and durationMs use the Node perf_hooks performance.now clock; browserStartedAt and browserFinishedAt use the Chrome page performance.now clock and are never compared as absolute timestamps.",
    },
    consoleErrors: [],
    durationMilliseconds: null,
    environmentAudits: [],
    explicitTimings: [],
    longTasks: [],
    outOfSegmentLongTasks: [],
    restoreLongTasks: [],
    terminalObservationLongTasks: [],
    restartLongTasks: [],
    finalObserverDrainLongTasks: [],
    screenshotLongTasks: [],
    longTaskIntervals: [],
    finalObserverDrain: null,
    hostPhaseTimings: [],
    pendingResources: [],
    resourceErrors: [],
    segments: [],
    terminal: null,
    transportIdNormalization: [],
    unhandled: [],
  };
  let browser;
  let page;
  let server;
  let serverStderr = "";
  let testFailure = null;
  let drainFinalObserver = null;
  const started = performance.now();
  let previousHostSegmentFinishedAt = null;
  let activeHostSegment = null;
  const finishHostSegmentTiming = () => {
    if (activeHostSegment === null) return;
    const finishedAt = performance.now();
    telemetry.hostPhaseTimings.push({ durationMs: finishedAt - activeHostSegment.startedAt,
      finishedAt, fromTick: activeHostSegment.fromTick, phase: "host-segment-body",
      startedAt: activeHostSegment.startedAt });
    previousHostSegmentFinishedAt = finishedAt;
    activeHostSegment = null;
  };
  try {
    server = spawn(process.execPath, [
      new URL("./game-browser-endurance-server.js", import.meta.url).pathname,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    server.stderr.setEncoding("utf8");
    server.stderr.on("data", (chunk) => { serverStderr += chunk; });
    const ready = JSON.parse(await firstLine(server.stdout));
    const { chromium } = await import(PLAYWRIGHT);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const context = await browser.newContext({ deviceScaleFactor: 1,
      viewport: { height: 1_280, width: 720 } });
    page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") telemetry.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => telemetry.unhandled.push(String(error)));
    page.on("requestfailed", (request) => telemetry.resourceErrors.push({
      failure: request.failure()?.errorText ?? "request failed", url: request.url(),
    }));
    page.on("response", (response) => {
      if (response.status() >= 400) telemetry.resourceErrors.push({
        status: response.status(), url: response.url(),
      });
    });
    await page.addInitScript(() => {
      const longTasks = [];
      const supported = typeof PerformanceObserver === "function" &&
        PerformanceObserver.supportedEntryTypes?.includes("longtask") === true;
      const appendEntries = (entries) => {
        for (const entry of entries) {
          longTasks.push({ duration: entry.duration, name: entry.name,
            startTime: entry.startTime });
        }
      };
      globalThis.__gameBrowserEndurancePerformance = {
        longTasks,
        observer: null,
        supported,
        timing: Object.create(null),
      };
      if (supported) {
        const observer = new PerformanceObserver((list) => appendEntries(list.getEntries()));
        observer.observe({ buffered: true, type: "longtask" });
        globalThis.__gameBrowserEndurancePerformance.observer = observer;
      }
    });
    const response = await page.goto(
      `http://${ready.host}:${ready.port}/tests/game-browser-endurance.html`,
      { waitUntil: "domcontentloaded" },
    );
    assert.equal(response.status(), 200);
    await page.waitForSelector("[data-arena-shell-root]", { state: "attached" });

    const setup = exactEnduranceSetupBytes();
    const setupSha256 = createHash("sha256").update(setup).digest("hex");
    assert.equal(setupSha256, EXPECTED_SETUP_SHA256,
      "the browser receives the reviewed exact seed-zero/default-eight setup");
    telemetry.setupSha256 = setupSha256;
    const mounted = await page.evaluate(async (setupBytes) => {
      const [
        { GameSession },
        { mountShippedGameBrowser },
        { GameAudioRuntime },
        { DeckCycle },
        { ElixirMatch },
      ] = await Promise.all([
        import("/src/sim/game-session.js"), import("/src/ui/game-browser-entry.js"),
        import("/src/audio/game-audio-runtime.js"), import("/src/sim/deck.js"),
        import("/src/sim/elixir.js"),
      ]);
      const recordTiming = (label, startedAt, detail = null) => {
        const telemetry = globalThis.__gameBrowserEndurancePerformance;
        const duration = performance.now() - startedAt;
        const bucket = telemetry.timing[label] ?? {
          count: 0,
          maxMilliseconds: 0,
          totalMilliseconds: 0,
          slowest: [],
        };
        bucket.count += 1;
        bucket.maxMilliseconds = Math.max(bucket.maxMilliseconds, duration);
        bucket.totalMilliseconds += duration;
        bucket.slowest.push({ detail, duration });
        bucket.slowest.sort((left, right) => right.duration - left.duration);
        bucket.slowest.length = Math.min(bucket.slowest.length, 12);
        telemetry.timing[label] = bucket;
      };
      globalThis.__gameBrowserEndurancePerformance.recordTiming = recordTiming;
      const wrap = (target, key, label, detail = () => null) => {
        const original = target[key];
        target[key] = function wrappedEnduranceProbe(...argumentsList) {
          const startedAt = performance.now();
          try { return original.apply(this, argumentsList); }
          finally { recordTiming(label, startedAt, detail(argumentsList)); }
        };
      };
      const sessionRestore = GameSession.restore;
      GameSession.restore = function wrappedSessionRestore(...argumentsList) {
        const startedAt = performance.now();
        try { return sessionRestore.apply(this, argumentsList); }
        finally { recordTiming("sessionRestore", startedAt); }
      };
      const sessionStepMany = GameSession.prototype.stepMany;
      GameSession.prototype.stepMany = function wrappedSessionStepMany(...argumentsList) {
        const startedAt = performance.now();
        const telemetry = globalThis.__gameBrowserEndurancePerformance;
        const context = telemetry.timingContext;
        const label = context?.kind === "drive" ? "sessionStepSlice"
          : context?.kind === "restore" ? "restoreStepSlice" : "unscopedSessionStepMany";
        const fromTick = context?.kind === "drive" || context?.kind === "restore"
          ? context.nextTick : null;
        try { return sessionStepMany.apply(this, argumentsList); }
        finally {
          const count = argumentsList[0];
          if (fromTick !== null) context.nextTick += count;
          recordTiming(label, startedAt, fromTick === null ? { count } : {
            count,
            fromTick,
            sessionTick: fromTick + count,
          });
        }
      };
      const sessionSerialize = GameSession.prototype.serialize;
      GameSession.prototype.serialize = function wrappedSessionSerialize(...argumentsList) {
        const startedAt = performance.now();
        const context = globalThis.__gameBrowserEndurancePerformance.timingContext;
        const label = context?.kind === "restore"
          ? "restoreSessionSerialize" : "sessionSerialize";
        try { return sessionSerialize.apply(this, argumentsList); }
        finally { recordTiming(label, startedAt); }
      };
      wrap(GameAudioRuntime.prototype, "renderAcceleratedFrame", "audioPresentation");
      wrap(GameAudioRuntime.prototype, "renderFrame", "audioFrame");
      wrap(GameAudioRuntime.prototype, "assertRebaseable", "audioRestorePreflight");
      wrap(GameAudioRuntime.prototype, "rebase", "audioRebase");
      wrap(GameAudioRuntime.prototype, "rebaseSilently", "audioSilentRebase");
      wrap(DeckCycle, "restore", "deckRestore");
      wrap(ElixirMatch, "restore", "elixirRestore");
      const requestAnimationFrame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => requestAnimationFrame((timestamp) => {
        const startedAt = performance.now();
        try { return callback(timestamp); }
        finally { recordTiming("rafCallback", startedAt); }
      });
      const replaceChildren = Element.prototype.replaceChildren;
      Element.prototype.replaceChildren = function wrappedReplaceChildren(...children) {
        const startedAt = performance.now();
        const context = globalThis.__gameBrowserEndurancePerformance.timingContext;
        try { return replaceChildren.apply(this, children); }
        finally { recordTiming(context?.kind === "restore" ? "restoreDomCommit" : "domCommit",
          startedAt, { childCount: children.length }); }
      };
      const root = document.querySelector("[data-arena-shell-root]");
      // Exercise cancellation while driveEnduranceSegment() is awaiting its
      // first real RAF. The same root then remounts a fresh exact setup,
      // proving the loop did not retain ACTIVE_ROOTS or stale listeners.
      const cancelled = mountShippedGameBrowser(root, window, new GameSession(setupBytes));
      if (!cancelled.enterManualStepMode()) {
        throw new Error("cancellation browser mount did not enter manual mode");
      }
      const pending = cancelled.driveEnduranceSegment(300);
      const disposed = cancelled.dispose();
      let rejected = null;
      try { await pending; } catch (error) { rejected = String(error?.message ?? error); }
      if (!disposed || !rejected?.includes("cancelled")) {
        throw new Error("endurance cancellation did not dispose its suspended transaction");
      }
      const session = new GameSession(setupBytes);
      const controller = mountShippedGameBrowser(root, window, session);
      if (!controller.enterManualStepMode()) {
        throw new Error("exact GH browser mount did not enter manual endurance mode");
      }
      globalThis.__gameBrowserEnduranceController = controller;
      return { cancellation: { disposed, rejected }, initialBytes: controller.session.serialize(),
        manual: controller.state.running === false, tick: controller.state.sessionTick };
    }, setup);
    assert.equal(mounted.initialBytes, new GameSession(setup).serialize(),
      "browser harness constructs a fresh exact GH GameSession through public mount API");
    assert.deepEqual({ manual: mounted.manual, tick: mounted.tick }, { manual: true, tick: 0 });
    assert.equal(mounted.cancellation.disposed, true);
    assert.match(mounted.cancellation.rejected, /cancelled/u);
    telemetry.cancellation = mounted.cancellation;
    telemetry.schedulerYieldSupported = await page.evaluate(() =>
      typeof globalThis.scheduler?.yield === "function");

    // A real physical gesture at a verified non-control point unlocks audio
    // without toggling mute or placing a card.
    const shellBox = await page.locator('[data-ui="arena-shell"]').boundingBox();
    assert.ok(shellBox, "mounted shell has a physical browser box");
    await page.mouse.click(shellBox.x + 20, shellBox.y + 60);
    await page.waitForFunction(() =>
      globalThis.__gameBrowserEnduranceController.audio.audio.unlocked === true,
    );
    const interactive = await browserView(page);
    assert.equal(interactive.audio.muted, false);
    assert.equal(interactive.audio.audio.unlocked, true);
    const initializationTasks = await readNewLongTasks(page, 0);
    telemetry.initializationLongTasks = initializationTasks.tasks;
    telemetry.maxInitializationLongTaskMilliseconds = Math.max(0,
      ...initializationTasks.tasks.map(({ duration }) => duration));
    assert.equal(initializationTasks.tasks.every(({ duration }) =>
      duration <= MAX_INITIALIZATION_LONG_TASK_MS), true,
    `initial browser mount stays inside the ${MAX_INITIALIZATION_LONG_TASK_MS}ms cap`);
    await page.evaluate(async () => {
      globalThis.__gameBrowserEndurancePerformance.timing = Object.create(null);
    });
    assert.equal(initializationTasks.supported, true,
      "Chrome PerformanceObserver longtask evidence is available");

    let direct = new GameSession(setup);
    const workloadPolicy = createEnduranceWorkloadPolicy();
    let longTaskCursor = initializationTasks.cursor;
    let firstDriveStartedAt = null;
    const observedLongTaskEntries = [...initializationTasks.tasks];
    const longTaskIntervals = [];
    let terminalObservationInterval = null;
    let restartInterval = null;
    let restored = false;
    let restoreCut = null;
    let restoreBranch = null;
    let replayParityProven = false;
    let postRestoreDelivery = false;
    let lastSuccessfulTick = 0;
    const seenCueSequences = new Set();
    const seenStartSequences = new Set();
    const pauseTick = 300;
    const restoreTick = 300;
    const acceptedEmergencyTicksThrough = (tick) => telemetry.transportIdNormalization
      .filter((entry) => entry.timeline === "primary" && entry.tick < tick &&
        entry.decision === "overtime-last-lane-aggregate-air-intercept" &&
        entry.acceptedBrowserCommandId !== null)
      .map(({ tick: decisionTick }) => decisionTick);
    const refreshLongTaskAttribution = () => {
      const classification = classifyLongTaskEntries(observedLongTaskEntries,
        longTaskIntervals, firstDriveStartedAt);
      telemetry.initializationLongTasks = classification.initialization;
      telemetry.longTasks = classification.driven;
      telemetry.restoreLongTasks = classification.restore;
      telemetry.terminalObservationLongTasks = classification.terminalObservation;
      telemetry.restartLongTasks = classification.restart;
      telemetry.finalObserverDrainLongTasks = classification.finalObserverDrain;
      telemetry.screenshotLongTasks = classification.screenshots;
      telemetry.outOfSegmentLongTasks = classification.outOfSegment;
      telemetry.longTaskIntervals = longTaskIntervals.map(({ finishedAt, id, kind, startedAt }) =>
        ({ finishedAt, id, kind, startedAt }));
      telemetry.maxInitializationLongTaskMilliseconds = Math.max(0,
        ...classification.initialization.map(({ duration }) => duration));
      telemetry.maxRestoreLongTaskMilliseconds = Math.max(0,
        ...classification.restore.map(({ duration }) => duration));
      telemetry.maxTerminalObservationLongTaskMilliseconds = Math.max(0,
        ...classification.terminalObservation.map(({ duration }) => duration));
      telemetry.maxRestartLongTaskMilliseconds = Math.max(0,
        ...classification.restart.map(({ duration }) => duration));
      telemetry.maxFinalObserverDrainLongTaskMilliseconds = Math.max(0,
        ...classification.finalObserverDrain.map(({ duration }) => duration));
      telemetry.maxScreenshotLongTaskMilliseconds = Math.max(0,
        ...classification.screenshots.map(({ duration }) => duration));
      for (const interval of longTaskIntervals) {
        const entries = classification.byInterval.get(interval.id) ?? [];
        if (interval.kind === "drive") {
          const segment = telemetry.segments[interval.segmentIndex];
          if (segment !== undefined) segment.longTasks = entries;
        } else if (interval.kind === "restore" && telemetry.restore !== undefined) {
          telemetry.restore.longTasks = entries;
        }
      }
      return classification;
    };
    const captureLongTaskBatch = (batch) => {
      observedLongTaskEntries.push(...batch.tasks);
      return refreshLongTaskAttribution();
    };
    drainFinalObserver = async () => {
      const hostDrainStartedAt = performance.now();
      const drainFromTick = direct.state.tick;
      const lifecycleCutoff = await page.evaluate(() => performance.now());
      for (const interval of longTaskIntervals) {
        if (interval.finishedAt === Infinity) {
          interval.finishedAt = lifecycleCutoff;
        }
      }
      const drainInterval = { finishedAt: Infinity, id: "final-observer-drain",
        kind: "final-observer-drain", startedAt: lifecycleCutoff };
      longTaskIntervals.push(drainInterval);
      const firstDeliveryTurnStartedAt = performance.now();
      await page.waitForTimeout(0);
      recordHostPhase(telemetry, "final-drain-first-delivery-turn", drainFromTick,
        firstDeliveryTurnStartedAt);
      const firstDrainReadStartedAt = performance.now();
      const firstTaskUpdate = await readNewLongTasks(page, longTaskCursor);
      recordHostPhase(telemetry, "final-drain-first-observer-read", drainFromTick,
        firstDrainReadStartedAt, { newlyObserved: firstTaskUpdate.tasks.length,
          drainedPendingCount: firstTaskUpdate.drainedPendingCount });
      longTaskCursor = firstTaskUpdate.cursor;
      // The first observer read can itself create a long-task entry. Give it
      // one more delivery turn before closing the accountable span.
      const secondDeliveryTurnStartedAt = performance.now();
      await page.waitForTimeout(0);
      recordHostPhase(telemetry, "final-drain-second-delivery-turn", drainFromTick,
        secondDeliveryTurnStartedAt);
      const finalDrainReadStartedAt = performance.now();
      const finalTaskUpdate = await readNewLongTasks(page, longTaskCursor);
      recordHostPhase(telemetry, "final-drain-final-observer-read", drainFromTick,
        finalDrainReadStartedAt, { newlyObserved: finalTaskUpdate.tasks.length,
          drainedPendingCount: finalTaskUpdate.drainedPendingCount });
      longTaskCursor = finalTaskUpdate.cursor;
      drainInterval.finishedAt = finalTaskUpdate.capturedAt;
      const finalClassification = captureLongTaskBatch({ tasks: [
        ...firstTaskUpdate.tasks, ...finalTaskUpdate.tasks,
      ] });
      telemetry.finalObserverDrain = { capturedAt: finalTaskUpdate.capturedAt,
        drainedPendingCount: firstTaskUpdate.drainedPendingCount +
          finalTaskUpdate.drainedPendingCount,
        newlyObservedTaskCount: firstTaskUpdate.tasks.length + finalTaskUpdate.tasks.length,
        observedTaskCount: observedLongTaskEntries.length };
      telemetry.finalObserverDrain.longTasks = finalClassification.finalObserverDrain;
      assertLongTaskCaps(finalClassification, longTaskIntervals);
      recordHostPhase(telemetry, "final-observer-drain-host-wall", drainFromTick,
        hostDrainStartedAt, { observedTaskCount: observedLongTaskEntries.length });
    };
    while (direct.state.tick < TEST_END_TICK) {
      assertEnduranceWorkloadCanContinue(direct, TEST_END_TICK);
      const fromTick = direct.state.tick;
      const hostSegmentStartedAt = performance.now();
      if (previousHostSegmentFinishedAt !== null) {
        recordHostPhase(telemetry, "host-intersegment-gap", fromTick,
          previousHostSegmentFinishedAt, { previousSegmentFinishedAt: previousHostSegmentFinishedAt });
      }
      activeHostSegment = { fromTick, startedAt: hostSegmentStartedAt };
      const reactionBoundaryIndex = fromTick / ENDURANCE_REACTION_INTERVAL_TICKS;
      const planStartedAt = performance.now();
      const plan = workloadPolicy.plan(direct);
      recordHostPhase(telemetry, "endurance-policy-planning", fromTick, planStartedAt);
      let delivery = null;
      if (plan !== null) {
        const physicalDeliveryStartedAt = performance.now();
        delivery = await deliverPhysicalPlan(page, plan);
        recordHostPhase(telemetry, "physical-delivery-roundtrip", fromTick,
          physicalDeliveryStartedAt, { commandId: delivery.command.commandId });
        const commandSubmissionStartedAt = performance.now();
        assert.deepEqual(normalizedCommand(delivery.command), normalizedCommand(plan),
          "physical E2 gesture preserves the policy semantic card, slot, point, and tick");
        const accepted = direct.submitPlayerCommand(canonical(delivery.command));
        assert.equal(accepted.accepted, true,
          "the physical browser delivery is accepted by the direct E2 mirror");
        workloadPolicy.recordAcceptedPhysicalDelivery(delivery.command);
        recordHostPhase(telemetry, "direct-command-submit-and-normalization", fromTick,
          commandSubmissionStartedAt, { commandId: delivery.command.commandId });
        lastSuccessfulTick = fromTick;
        if (restored) postRestoreDelivery = true;
      }
      telemetry.transportIdNormalization.push({
        acceptedBrowserCommandId: delivery?.command.commandId ?? null,
        decision: plan?.decision ?? null,
        reactionBoundaryIndex,
        normalized: delivery === null ? null : normalizedCommand(delivery.command),
        planned: plan,
        tick: fromTick,
        timeline: restored ? "replayed" : "primary",
      });

      const segmentSerializeStartedAt = performance.now();
      const segmentStartBytes = direct.serialize();
      recordHostPhase(telemetry, "direct-segment-start-serialize", fromTick,
        segmentSerializeStartedAt, { bytes: segmentStartBytes.length });
      const ticksToNextBaseline = SEGMENT_TICKS - (fromTick % SEGMENT_TICKS);
      const maxDriveTicks = Math.min(SEGMENT_TICKS, TEST_END_TICK - fromTick,
        ticksToNextBaseline);
      const lookAheadStartedAt = performance.now();
      const nextPlannedAttempt = workloadPolicy.nextPlannedAttempt(direct, maxDriveTicks);
      const driveTicks = nextPlannedAttempt?.ticksAhead ?? maxDriveTicks;
      recordHostPhase(telemetry, "endurance-policy-lookahead", fromTick, lookAheadStartedAt,
        { driveTicks, nextDecisionTick: nextPlannedAttempt?.plan.tick ?? null });
      const browserDriveHostStartedAt = performance.now();
      const driven = await driveBrowserSegment(page, driveTicks);
      const browserDriveRoundtripMs = recordHostPhase(telemetry, "browser-drive-roundtrip",
        fromTick, browserDriveHostStartedAt, {
          browserDurationMs: driven.elapsedMilliseconds,
          browserStartedAt: driven.startedAt,
          browserFinishedAt: driven.finishedAt,
          reportedOverheadMs: performance.now() - browserDriveHostStartedAt -
            driven.elapsedMilliseconds,
        });
      const timingReadStartedAt = performance.now();
      const explicitTiming = await readAndResetTiming(page);
      recordHostPhase(telemetry, "read-and-reset-browser-timing-roundtrip", fromTick,
        timingReadStartedAt);
      telemetry.explicitTimings.push({
        fromTick,
        tick: driven.result.state.sessionTick,
        timing: explicitTiming,
      });
      const browserTimingGuardStartedAt = performance.now();
      const sliceTiming = explicitTiming.sessionStepSlice;
      assert.ok(sliceTiming && sliceTiming.count > 0,
        "each endurance transaction records public GameSession slice timings");
      if (sliceTiming.maxMilliseconds > MAX_EXPLICIT_SLICE_MS) {
        // Each explicit slice is one synchronous single-tick GameSession step
        // measured with wall-clock deltas inside the page, so a GC pause or an
        // externally stolen CPU window lands inside the measurement without
        // being scheduler work. The exact same deterministic slices are
        // therefore re-measured in a quiet Node context after a quiescence
        // delay; only a reproduced overrun fails the guard.
        let audits = 0;
        let auditWorstMilliseconds = Infinity;
        while (audits < SLICE_AUDIT_ATTEMPTS &&
            !(auditWorstMilliseconds <= MAX_EXPLICIT_SLICE_MS)) {
          await new Promise((resolve) => {
            setTimeout(resolve, SLICE_AUDIT_QUIESCENCE_DELAY_MS);
          });
          auditWorstMilliseconds = 0;
          const scratch = GameSession.restore(segmentStartBytes);
          while (scratch.state.tick < driven.result.state.sessionTick &&
              !scratch.state.terminal) {
            const sliceStartedAt = performance.now();
            scratch.stepMany(1);
            auditWorstMilliseconds = Math.max(auditWorstMilliseconds,
              performance.now() - sliceStartedAt);
          }
          audits += 1;
        }
        telemetry.environmentAudits.push({
          auditWorstMilliseconds: Math.round(auditWorstMilliseconds * 1000) / 1000,
          audits,
          measuredMilliseconds: sliceTiming.maxMilliseconds,
          slowest: sliceTiming.slowest.filter(({ duration }) =>
            duration > MAX_EXPLICIT_SLICE_MS),
          tick: fromTick,
        });
        assert.ok(auditWorstMilliseconds <= MAX_EXPLICIT_SLICE_MS,
          `explicit simulation slice at tick ${fromTick} reproduced ` +
          `${Math.round(auditWorstMilliseconds)}ms in quiescent audit beyond the ` +
          `${MAX_EXPLICIT_SLICE_MS}ms target`);
      }
      assert.ok(driven.elapsedMilliseconds <= MAX_SEGMENT_WALL_CLOCK_MS,
        `browser segment at ${fromTick} stayed within its wall-clock cap`);
      recordHostPhase(telemetry, "browser-slice-timing-guards-and-audit", fromTick,
        browserTimingGuardStartedAt, { browserDriveRoundtripMs });
      const transactionAssertionsStartedAt = performance.now();
      const browserTick = assertSegmentTransactions(driven, fromTick,
        seenCueSequences, seenStartSequences);
      recordHostPhase(telemetry, "browser-transaction-assertions", fromTick,
        transactionAssertionsStartedAt, { chunkCount: driven.result.chunks.length });
      const directStepChunkDurations = [];
      for (const chunk of driven.result.chunks) {
        const directStepStartedAt = performance.now();
        direct.stepMany(chunk.sessionTick - chunk.fromTick);
        directStepChunkDurations.push(recordHostPhase(telemetry, "direct-step-chunk",
          fromTick, directStepStartedAt, { chunkFromTick: chunk.fromTick,
            chunkToTick: chunk.sessionTick, tickCount: chunk.sessionTick - chunk.fromTick }));
      }
      const directMirrorAssertionsStartedAt = performance.now();
      assert.equal(direct.state.tick, browserTick);
      assert.equal(direct.state.tick - lastSuccessfulTick <= 900, true,
        "the endurance policy makes one paid south deployment in every 900-tick window");
      recordHostPhase(telemetry, "direct-mirror-state-assertions", fromTick,
        directMirrorAssertionsStartedAt, { directStepChunkDurations });

      if (direct.state.tick === TEST_END_TICK) {
        terminalObservationInterval = { finishedAt: Infinity,
          id: "terminal-observation", kind: "terminal-observation",
          startedAt: driven.finishedAt };
        longTaskIntervals.push(terminalObservationInterval);
      }
      const browserViewStartedAt = performance.now();
      const browserState = await browserView(page);
      recordHostPhase(telemetry, "browser-view-roundtrip", fromTick, browserViewStartedAt,
        { sessionTick: driven.result.state.sessionTick });
      const browserStateAssertionsStartedAt = performance.now();
      assert.equal(driven.result.state.sessionTick, direct.state.tick);
      assert.equal(driven.result.state.domTick, direct.state.tick);
      assert.equal(browserState.audioReplayLength, getGameSessionAudioReplay(direct).length);
      assert.equal(browserState.audioDiagnostics.cursor, browserState.audioReplayLength);
      assert.equal(browserState.audioDiagnostics.eventCount, browserState.audioReplayLength);
      assert.equal(browserState.pendingResources.length, 0);
      assert.equal(Object.values(browserState.layers).every((tick) => tick === String(direct.state.tick)),
      true, "every projection layer commits the current session tick");
      recordHostPhase(telemetry, "browser-view-and-audio-assertions", fromTick,
        browserStateAssertionsStartedAt);
      if (direct.state.tick === SEGMENT_TICKS) {
        const activeScreenshotStartedAt = performance.now();
        await captureScreenshotWithInterval(page, `${ARTIFACTS}active.png`,
          "active-screenshot", longTaskIntervals);
        recordHostPhase(telemetry, "active-screenshot-roundtrip", fromTick,
          activeScreenshotStartedAt);
      }
      const observerReadStartedAt = performance.now();
      const taskUpdate = await readNewLongTasks(page, longTaskCursor);
      recordHostPhase(telemetry, "read-long-task-observer-roundtrip", fromTick,
        observerReadStartedAt, { newlyObserved: taskUpdate.tasks.length,
          drainedPendingCount: taskUpdate.drainedPendingCount });
      longTaskCursor = taskUpdate.cursor;
      firstDriveStartedAt ??= driven.startedAt;
      const longTaskWindow = { finishedAt: driven.finishedAt,
        id: `drive-${longTaskIntervals.length}`, kind: "drive",
        segmentIndex: telemetry.segments.length, startedAt: driven.startedAt };
      longTaskIntervals.push(longTaskWindow);
      const observerAttributionStartedAt = performance.now();
      const classification = captureLongTaskBatch(taskUpdate);
      const inDrivenSegment = classification.byInterval.get(longTaskWindow.id) ?? [];
      telemetry.segments.push({
        audioEpoch: restored ? 1 : 0,
        chunks: driven.result.chunks,
        elapsedMilliseconds: driven.elapsedMilliseconds,
        finishedAt: driven.finishedAt,
        longTasks: inDrivenSegment,
        startedAt: driven.startedAt,
        tick: direct.state.tick,
        timing: explicitTiming,
        yieldPolicy: driven.result.yieldPolicy,
      });
      telemetry.yieldPolicy = driven.result.yieldPolicy;
      assert.ok(["raf-raf", "raf-scheduler-yield-raf"].includes(driven.result.yieldPolicy),
        "the shipped endurance driver reports its real browser yield policy");
      assertLongTaskCaps(classification, longTaskIntervals);
      assert.ok(performance.now() - started <= MAX_ENDURANCE_WALL_CLOCK_MS,
        "browser endurance run stayed inside the documented overall cap");
      recordHostPhase(telemetry, "observer-attribution-and-cap-assertions", fromTick,
        observerAttributionStartedAt, { newlyObserved: taskUpdate.tasks.length,
          cumulativeLongTasks: observedLongTaskEntries.length,
          intervalCount: longTaskIntervals.length });

      if (direct.state.tick === pauseTick) {
        const lifecyclePauseStartedAt = performance.now();
        const beforePause = await browserView(page, { bytes: true });
        assert.equal(beforePause.sessionBytes, direct.serialize());
        const lifecycle = await page.evaluate(() => {
          const controller = globalThis.__gameBrowserEnduranceController;
          const paused = controller.pause();
          const resumed = controller.resume();
          const manual = controller.enterManualStepMode();
          return { manual, paused, resumed, state: controller.state,
            sessionBytes: controller.session.serialize() };
        });
        direct.pause(); direct.resume();
        assert.deepEqual({ manual: lifecycle.manual, paused: lifecycle.paused,
          resumed: lifecycle.resumed }, { manual: true, paused: true, resumed: true });
        assert.equal(lifecycle.sessionBytes, direct.serialize(),
          "pause/resume cannot change canonical simulation bytes");
        recordHostPhase(telemetry, "pause-resume-manual-mode-lifecycle", fromTick,
          lifecyclePauseStartedAt);
      }

      if (direct.state.tick === restoreTick && restoreCut === null) {
        const restoreCutStartedAt = performance.now();
        const cutView = await browserView(page, { bytes: true, bridge: true });
        const browserSnapshot = await page.evaluate(() =>
          globalThis.__gameBrowserEnduranceController.serialize());
        assert.equal(cutView.sessionBytes, direct.serialize());
        const policyState = workloadPolicy.snapshot();
        const recordedEmergencyTicks = acceptedEmergencyTicksThrough(restoreTick);
        assert.deepEqual(policyState.emergencyDecisionTicks, recordedEmergencyTicks,
          "restore-cut cooldown history matches accepted primary-branch physical inputs");
        restoreCut = {
          bridge: JSON.parse(browserSnapshot).bridge,
          browserSnapshot,
          directBytes: direct.serialize(),
          policyState: { emergencyDecisionTicks: recordedEmergencyTicks },
          tick: restoreTick,
        };
        telemetry.restoreCut = { snapshotBytes: browserSnapshot.length, tick: restoreTick };
        recordHostPhase(telemetry, "restore-cut-snapshot-and-serialize", fromTick,
          restoreCutStartedAt, { snapshotBytes: browserSnapshot.length });
      }

      if (restoreCut !== null && !restored &&
          direct.state.tick === restoreTick + SEGMENT_TICKS) {
        const restoreBranchStartedAt = performance.now();
        const branchView = await browserView(page, { audioContinuation: true, bridge: true,
          bytes: true });
        const branchSnapshot = await page.evaluate(() =>
          globalThis.__gameBrowserEnduranceController.serialize());
        restoreBranch = {
          audioContinuationBytes: branchView.audioContinuationBytes,
          audioDiagnostics: branchView.audioDiagnostics,
          browserSnapshot: branchSnapshot,
          bridge: branchView.bridge,
          directBytes: direct.serialize(),
          layers: branchView.layers,
          audioReplayLength: branchView.audioReplayLength,
          policyState: workloadPolicy.snapshot(),
          tick: direct.state.tick,
        };
        const restoredView = await restoreBrowserSnapshot(page, restoreCut.browserSnapshot);
        const restoreWindow = { finishedAt: restoredView.finishedAt,
          id: `restore-${longTaskIntervals.length}`, kind: "restore",
          startedAt: restoredView.startedAt };
        longTaskIntervals.push(restoreWindow);
        const restoreTiming = await readAndResetTiming(page);
        telemetry.explicitTimings.push({ kind: "restore", fromTick: restoreBranch.tick,
          tick: restoreCut.tick, timing: restoreTiming });
        const restoreSteps = restoreTiming.restoreStepSlice;
        assert.ok(restoreTiming.restorePreflightDispatch?.count === 1,
          "one shipped restore preflight is measured before its first browser yield");
        assert.ok(restoreTiming.restorePreflightDispatch.maxMilliseconds <= MAX_EXPLICIT_SLICE_MS,
          `restore envelope/setup preflight stays inside ${MAX_EXPLICIT_SLICE_MS}ms`);
        assert.ok(restoreSteps && restoreSteps.count > 0,
          "every replayed restore simulation tick is explicitly timed");
        assert.equal(restoreSteps.slowest.every(({ detail }) => detail.count === 1), true,
          "restore continuation never batches transcript simulation ticks");
        assert.ok(restoreSteps.maxMilliseconds <= MAX_EXPLICIT_SLICE_MS,
          `restore simulation slices stay inside ${MAX_EXPLICIT_SLICE_MS}ms`);
        assert.ok(restoreTiming.restoreSessionSerialize?.count >= 1,
          "restore final canonical byte witness/install serialization is measured");
        assert.ok(restoreTiming.restoreSessionSerialize.maxMilliseconds <= MAX_EXPLICIT_SLICE_MS,
          `restore canonical byte witness/install serialization stays inside ${MAX_EXPLICIT_SLICE_MS}ms`);
        assert.ok(restoreTiming.restoreDomCommit?.count >= 1,
          "restore atomic remount projection is measured");
        assert.ok(restoreTiming.restoreDomCommit.maxMilliseconds <= MAX_EXPLICIT_SLICE_MS,
          `restore atomic remount projection stays inside ${MAX_EXPLICIT_SLICE_MS}ms`);
        assert.equal(restoreTiming.sessionRestore?.count ?? 0, 0,
          "endurance restore never calls synchronous GameSession.restore");
        direct = GameSession.restore(restoreCut.directBytes);
        const cooldownHistoryAtCut = acceptedEmergencyTicksThrough(restoreCut.tick);
        assert.deepEqual(cooldownHistoryAtCut, restoreCut.policyState.emergencyDecisionTicks,
          "restored cooldown comes from accepted canonical workload history through the cut");
        workloadPolicy.restore({ emergencyDecisionTicks: cooldownHistoryAtCut });
        assert.equal(restoredView.after.sessionBytes, direct.serialize(),
          "yielded browser restore bytes equal a direct public GameSession restore");
        assert.equal(restoredView.after.bridge, restoreCut.bridge,
          "restore rewinds to its canonical E2 delivery history");
        assert.equal(restoredView.after.diagnostics.cursor, getGameSessionAudioReplay(direct).length);
        assert.equal(restoredView.after.diagnostics.eventCount, getGameSessionAudioReplay(direct).length);
        assert.equal(restoredView.after.diagnostics.projectionOffset, getGameSessionAudioReplay(direct).length);
        assert.equal(restoredView.after.diagnostics.cueCount, 0,
          "restore rebases rather than rendering the restored cue history");
        assert.equal(restoredView.after.audio.audio.audibleStartCount,
          restoredView.before.audio.audio.audibleStartCount,
          "restore creates zero duplicate audible browser starts");
        await page.waitForTimeout(0);
        const restoreTasks = await readNewLongTasks(page, longTaskCursor);
        longTaskCursor = restoreTasks.cursor;
        const classification = captureLongTaskBatch(restoreTasks);
        telemetry.restore = { ...restoredView,
          longTasks: classification.byInterval.get(restoreWindow.id) ?? [], timing: restoreTiming,
          rewindFromTick: restoreBranch.tick, rewindToTick: restoreCut.tick };
        assertLongTaskCaps(classification, longTaskIntervals);
        lastSuccessfulTick = direct.state.cardRuntime.history
          .filter(({ side }) => side === "south").at(-1)?.tick ?? 0;
        seenCueSequences.clear(); seenStartSequences.clear();
        restored = true;
        recordHostPhase(telemetry, "restore-branch-roundtrip-and-assertions", fromTick,
          restoreBranchStartedAt, { restoreElapsedMilliseconds: restoredView.elapsedMilliseconds });
        finishHostSegmentTiming();
        continue;
      }

      if (restored && restoreBranch !== null && !replayParityProven &&
          direct.state.tick === restoreBranch.tick) {
        const replayParityStartedAt = performance.now();
        const replayedSnapshot = await page.evaluate(() =>
          globalThis.__gameBrowserEnduranceController.serialize());
        const replayed = await browserView(page, { audioContinuation: true, bridge: true,
          bytes: true });
        assert.equal(replayedSnapshot, restoreBranch.browserSnapshot,
          "600→300→600 browser replay reproduces its exact loop/input continuation bytes");
        assert.equal(replayed.sessionBytes, restoreBranch.directBytes,
          "600→300→600 browser replay reproduces direct canonical session bytes");
        assert.deepEqual(workloadPolicy.snapshot(), restoreBranch.policyState,
          "600→300→600 workload replay reproduces the same emergency cooldown history");
        assert.deepEqual(replayed.layers, restoreBranch.layers,
          "600→300→600 browser replay reproduces every projected view layer");
        assert.deepEqual(replayed.bridge, restoreBranch.bridge,
          "600→300→600 browser replay reproduces its exact E2 bridge bytes");
        assert.equal(replayed.audioContinuationBytes, restoreBranch.audioContinuationBytes,
          "600→300→600 browser replay reproduces exact future-audio continuation bytes");
        assert.equal(replayed.audioReplayLength, restoreBranch.audioReplayLength,
          "replayed audio authority cursor returns to the same branch boundary");
        assert.deepEqual({ cursor: replayed.audioDiagnostics.cursor,
          eventCount: replayed.audioDiagnostics.eventCount,
          sessionTick: replayed.audioDiagnostics.sessionTick,
          suppressedAcceleratedCueCount: replayed.audioDiagnostics.suppressedAcceleratedCueCount },
        { cursor: restoreBranch.audioDiagnostics.cursor,
          eventCount: restoreBranch.audioDiagnostics.eventCount,
          sessionTick: restoreBranch.audioDiagnostics.sessionTick,
          suppressedAcceleratedCueCount:
            restoreBranch.audioDiagnostics.suppressedAcceleratedCueCount },
        "replayed audio authority/continuation diagnostics return to the branch boundary");
        replayParityProven = true;
        recordHostPhase(telemetry, "replayed-branch-parity-roundtrip-and-assertions", fromTick,
          replayParityStartedAt);
      }
      finishHostSegmentTiming();
    }

    const finalViewStartedAt = performance.now();
    const finalView = await browserView(page, { bytes: true, digest: true, loop: true });
    recordHostPhase(telemetry, "terminal-final-browser-view-roundtrip", direct.state.tick,
      finalViewStartedAt);
    const finalAssertionsStartedAt = performance.now();
    assert.equal(finalView.sessionBytes, direct.serialize(),
      "terminal browser bytes equal direct GameSession E2 mirror bytes");
    assert.deepEqual(finalView.stateDigest, stateDigest(direct.state),
      "terminal browser state equals the direct E2 mirror state");
    assert.equal(direct.state.tick, TEST_END_TICK);
    assert.equal(direct.state.terminal, FULL_RUN);
    assert.equal(finalView.state.terminal, FULL_RUN);
    const activeSides = new Set(direct.state.cardRuntime.history.map(({ side }) => side));
    assert.equal(activeSides.has("north") && activeSides.has("south"), true,
      "exact GH workload retains paid active play for both sides");
    assert.equal(FULL_RUN ? postRestoreDelivery : true, true,
      "a post-restore physical E2 delivery proves no stale input callback remains");
    assert.equal(replayParityProven, true,
      "a divergent restore cut replays through the same browser bytes and input history");
    recordHostPhase(telemetry, "terminal-final-state-assertions", direct.state.tick,
      finalAssertionsStartedAt);
    if (FULL_RUN) {
      assert.equal(finalView.audioDiagnostics.disposed, true,
        "terminal audio renderer cleans up its graph");
      assert.equal(finalView.audio.audio.activeVoiceCount, 0,
        "terminal browser audio leaves no active voice");
      assert.equal(finalView.restartHidden, false);
      assert.ok(finalView.terminalOverlay?.width > 0 && finalView.terminalOverlay?.height > 0,
        "terminal feedback remains visible in the real 720x1280 shell");
      const terminalScreenshotStartedAt = performance.now();
      await captureScreenshotWithInterval(page, `${ARTIFACTS}terminal.png`,
        "terminal-screenshot", longTaskIntervals);
      recordHostPhase(telemetry, "terminal-screenshot-roundtrip", direct.state.tick,
        terminalScreenshotStartedAt);
      const terminalRestartBoundaryStartedAt = performance.now();
      const restartStartedAt = await page.evaluate(() => performance.now());
      recordHostPhase(telemetry, "terminal-to-restart-page-clock-mark-roundtrip", direct.state.tick,
        terminalRestartBoundaryStartedAt, { browserBoundaryAt: restartStartedAt });
      terminalObservationInterval.finishedAt = restartStartedAt;
      restartInterval = { finishedAt: Infinity, id: "restart", kind: "restart",
        startedAt: restartStartedAt };
      longTaskIntervals.push(restartInterval);
      const restartClickStartedAt = performance.now();
      await page.locator('[data-ui="restart"]').click();
      recordHostPhase(telemetry, "restart-click-roundtrip", direct.state.tick,
        restartClickStartedAt);
      const restartedViewStartedAt = performance.now();
      const restarted = await browserView(page, { bytes: true, loop: true });
      recordHostPhase(telemetry, "restart-browser-view-roundtrip", direct.state.tick,
        restartedViewStartedAt);
      const restartAssertionsStartedAt = performance.now();
      assert.equal(restarted.sessionBytes,
        new GameSession(createShippedGameSessionSetup(0)).serialize(),
        "terminal restart creates the exact shipped seed-zero session");
      assert.equal(restarted.state.sessionTick, 0);
      assert.equal(restarted.restartHidden, true);
      assert.equal(restarted.terminalOverlay, null);
      recordHostPhase(telemetry, "restart-state-assertions", direct.state.tick,
        restartAssertionsStartedAt);
      const restartScreenshotStartedAt = performance.now();
      await captureScreenshotWithInterval(page, `${ARTIFACTS}restart.png`,
        "restart-screenshot", longTaskIntervals);
      recordHostPhase(telemetry, "restart-screenshot-roundtrip", direct.state.tick,
        restartScreenshotStartedAt);
      const restartFinishMarkStartedAt = performance.now();
      restartInterval.finishedAt = await page.evaluate(() => performance.now());
      recordHostPhase(telemetry, "restart-finish-page-clock-roundtrip", 0,
        restartFinishMarkStartedAt, { browserFinishedAt: restartInterval.finishedAt });
      telemetry.terminal = { finalView, restarted };
    } else {
      telemetry.terminal = { smoke: true, finalView };
      const terminalFinishMarkStartedAt = performance.now();
      terminalObservationInterval.finishedAt = await page.evaluate(() => performance.now());
      recordHostPhase(telemetry, "terminal-observation-finish-page-clock-roundtrip",
        direct.state.tick, terminalFinishMarkStartedAt,
        { browserFinishedAt: terminalObservationInterval.finishedAt });
    }
    telemetry.pendingResources = finalView.pendingResources;
    assert.deepEqual(telemetry.consoleErrors, []);
    assert.deepEqual(telemetry.unhandled, []);
    assert.deepEqual(telemetry.resourceErrors, []);
  } catch (error) {
    telemetry.failure = { message: String(error?.message ?? error), stack: error?.stack ?? null };
    testFailure = error;
  } finally {
    finishHostSegmentTiming();
    const finalDrainHostStartedAt = performance.now();
    try { await drainFinalObserver?.(); }
    catch (error) {
      if (testFailure === null) {
        telemetry.failure = { message: String(error?.message ?? error), stack: error?.stack ?? null };
        testFailure = error;
      }
    }
    recordHostPhase(telemetry, "final-observer-drain-finally-roundtrip",
      null, finalDrainHostStartedAt);
    telemetry.durationMilliseconds = Math.round(performance.now() - started);
    telemetry.serverStderr = serverStderr;
    const browserCloseStartedAt = performance.now();
    try { await browser?.close(); } catch (error) { telemetry.browserCloseError = String(error); }
    recordHostPhase(telemetry, "browser-close-roundtrip", null, browserCloseStartedAt);
    const serverStopStartedAt = performance.now();
    telemetry.serverExited = await stopServer(server);
    recordHostPhase(telemetry, "server-stop-roundtrip", null, serverStopStartedAt);
    telemetry.maxDrivenLongTaskMilliseconds = Math.max(0,
      ...telemetry.longTasks.map(({ duration }) => duration));
    telemetry.maxInitializationLongTaskMilliseconds = Math.max(0,
      ...(telemetry.initializationLongTasks ?? []).map(({ duration }) => duration));
    telemetry.maxRestoreLongTaskMilliseconds = Math.max(0,
      ...telemetry.restoreLongTasks.map(({ duration }) => duration));
    telemetry.maxTerminalObservationLongTaskMilliseconds = Math.max(0,
      ...telemetry.terminalObservationLongTasks.map(({ duration }) => duration));
    telemetry.maxRestartLongTaskMilliseconds = Math.max(0,
      ...telemetry.restartLongTasks.map(({ duration }) => duration));
    telemetry.maxFinalObserverDrainLongTaskMilliseconds = Math.max(0,
      ...telemetry.finalObserverDrainLongTasks.map(({ duration }) => duration));
    telemetry.maxScreenshotLongTaskMilliseconds = Math.max(0,
      ...telemetry.screenshotLongTasks.map(({ duration }) => duration));
    telemetry.maxLongTaskMilliseconds = Math.max(telemetry.maxDrivenLongTaskMilliseconds,
      telemetry.maxInitializationLongTaskMilliseconds,
      telemetry.maxRestoreLongTaskMilliseconds,
      telemetry.maxTerminalObservationLongTaskMilliseconds,
      telemetry.maxRestartLongTaskMilliseconds,
      telemetry.maxFinalObserverDrainLongTaskMilliseconds,
      telemetry.maxScreenshotLongTaskMilliseconds,
      ...telemetry.outOfSegmentLongTasks.map(({ duration }) => duration));
    writeFileSync(`${ARTIFACTS}endurance-result.json`,
      `${JSON.stringify(telemetry, null, 2)}\n`);
  }
  assert.equal(telemetry.serverExited, true, "browser endurance server exits without an orphan");
  if (testFailure !== null) throw testFailure;
});
