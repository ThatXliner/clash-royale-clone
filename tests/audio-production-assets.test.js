import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

import {
  AUDIO_PRODUCTION_CUE_TAXONOMY,
  AudioEventProjection,
} from "../src/audio/audio-events.js";
import {
  AUDIO_PRODUCTION_MIX_POLICY,
  auditProductionMix,
  audioRecipeSha256,
  createProductionAudioProvenanceManifest,
  synthesizeProceduralPcm,
} from "../src/audio/audio-renderer.js";
import {
  createGameAudioRuntimeUiCapability,
  GameAudioRuntime,
} from "../src/audio/game-audio-runtime.js";
import { GameSession } from "../src/sim/game-session.js";
import { createShippedGameSessionSetup } from "../src/ui/game-browser-entry.js";

const ARTIFACTS = new URL("../artifacts/audio-002-round-1/", import.meta.url).pathname;
const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function pcmMetrics(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let peak = 0;
  let energy = 0;
  for (let index = 0; index < bytes.length / 2; index += 1) {
    const sample = view.getInt16(index * 2, true);
    peak = Math.max(peak, Math.abs(sample));
    energy += sample * sample;
  }
  const sampleCount = bytes.length / 2;
  const rms = sampleCount === 0 ? 0 : Math.sqrt(energy / sampleCount);
  return {
    energy,
    peak,
    rmsBasisPoints: Math.floor(rms * 10_000 / 32_767),
  };
}

function relativePcmObservations(observations, tickOrigin) {
  return observations.map((observation) => ({
    ...observation,
    startTick: observation.startTick - tickOrigin,
  }));
}

function line(stream) {
  return new Promise((resolve, reject) => {
    let text = "";
    stream.setEncoding("utf8");
    const onData = (chunk) => {
      text += chunk;
      const end = text.indexOf("\n");
      if (end >= 0) {
        stream.off("data", onData);
        resolve(text.slice(0, end));
      }
    };
    stream.on("data", onData);
    stream.once("error", reject);
  });
}

function writeEvidence(value) {
  mkdirSync(ARTIFACTS, { recursive: true });
  const bytes = `${canonical(value)}\n`;
  const temporary = `${ARTIFACTS}audio-production-evidence.json.tmp`;
  const output = `${ARTIFACTS}audio-production-evidence.json`;
  writeFileSync(temporary, bytes);
  renameSync(temporary, output);
  const second = readFileSync(output, "utf8");
  assert.equal(second, bytes, "evidence serialization must be byte-stable");
  return {
    path: output,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function writeOfflineRender(manifest) {
  const silenceSamples = 200;
  const pcmParts = [];
  let sampleCount = 0;
  for (const entry of manifest.recipes) {
    if (pcmParts.length > 0) {
      pcmParts.push(new Uint8Array(silenceSamples * 2));
      sampleCount += silenceSamples;
    }
    const pcm = synthesizeProceduralPcm(entry.recipe).bytes;
    pcmParts.push(pcm);
    sampleCount += pcm.length / 2;
  }
  const pcmBytes = new Uint8Array(sampleCount * 2);
  let offset = 0;
  for (const part of pcmParts) {
    pcmBytes.set(part, offset);
    offset += part.length;
  }
  const bytes = new Uint8Array(44 + pcmBytes.length);
  const view = new DataView(bytes.buffer);
  const text = (at, value) => {
    for (let index = 0; index < value.length; index += 1) {
      bytes[at + index] = value.charCodeAt(index);
    }
  };
  text(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 12_000, true);
  view.setUint32(28, 24_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, pcmBytes.length, true);
  bytes.set(pcmBytes, 44);
  const output = `${ARTIFACTS}audio-production-offline.wav`;
  const temporary = `${output}.tmp`;
  mkdirSync(ARTIFACTS, { recursive: true });
  writeFileSync(temporary, bytes);
  renameSync(temporary, output);
  const written = readFileSync(output);
  assert.deepEqual([...written], [...bytes], "offline PCM render must be byte-stable");
  return {
    authorId: "repository-contributors",
    channels: 1,
    format: "pcm-s16le-wav",
    licenseId: "CC0-1.0",
    path: "artifacts/audio-002-round-1/audio-production-offline.wav",
    sampleCount,
    sampleRateHz: 12_000,
    sha256: createHash("sha256").update(written).digest("hex"),
    waveform: pcmMetrics(pcmBytes),
  };
}

test("audio production assets: complete original inventory has pinned layered PCM provenance", () => {
  const manifest = createProductionAudioProvenanceManifest();
  const families = Object.entries(AUDIO_PRODUCTION_CUE_TAXONOMY);
  assert.equal(manifest.version, 2);
  assert.deepEqual(manifest.recipes.map(({ family, cueId }) => [family, cueId]), families);
  assert.deepEqual(manifest.mix, AUDIO_PRODUCTION_MIX_POLICY);
  assert.equal(manifest.assets.length, 0);
  const hashes = new Set();
  for (const entry of manifest.recipes) {
    assert.equal(audioRecipeSha256(entry.family, entry.cueId, entry.recipe), entry.sha256);
    const pcm = synthesizeProceduralPcm(entry.recipe);
    assert.equal(createHash("sha256").update(pcm.bytes).digest("hex"), entry.waveform.sha256);
    assert.equal(pcm.sampleCount, entry.waveform.sampleCount);
    assert.equal(pcm.sampleRateHz, 12_000);
    const metrics = pcmMetrics(pcm.bytes);
    assert.ok(metrics.peak > 0, entry.family);
    assert.ok(metrics.peak < 32_768, entry.family);
    assert.ok(metrics.energy > 0, entry.family);
    assert.ok(metrics.rmsBasisPoints > 0, entry.family);
    assert.equal(hashes.has(entry.waveform.sha256), false, entry.family);
    hashes.add(entry.waveform.sha256);
    if (entry.recipe.layers !== undefined) assert.ok(entry.recipe.layers.length >= 2);
  }
  assert.equal(hashes.size, families.length);
});

test("audio production assets: fresh processes reproduce the production waveform receipt", () => {
  const moduleUrl = new URL("../src/audio/audio-renderer.js", import.meta.url).href;
  const program = `
    import { createHash } from "node:crypto";
    import { createProductionAudioProvenanceManifest, synthesizeProceduralPcm } from ${JSON.stringify(moduleUrl)};
    const rows = createProductionAudioProvenanceManifest().recipes.map((entry) => {
      const pcm = synthesizeProceduralPcm(entry.recipe);
      return [entry.cueId, pcm.sampleCount,
        createHash("sha256").update(pcm.bytes).digest("hex")];
    });
    process.stdout.write(JSON.stringify(rows));
  `;
  const run = () => spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
    encoding: "utf8",
    timeout: 10_000,
  });
  const first = run();
  const second = run();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  const rows = JSON.parse(first.stdout);
  assert.deepEqual(rows.map(([cueId]) => cueId),
    Object.values(AUDIO_PRODUCTION_CUE_TAXONOMY));
  assert.ok(rows.every(([, sampleCount, hash]) =>
    sampleCount > 0 && /^[0-9a-f]{64}$/u.test(hash)));
});

test("audio production assets: movement rate limiting and dense integer mix stay deterministic", () => {
  const projection = new AudioEventProjection();
  const records = projection.projectBatch([
    { event: { entityId: "unit-1", tick: 2, type: "locomotion-start" }, sequence: 0, tick: 2 },
    { event: { entityId: "unit-1", tick: 3, type: "locomotion-start" }, sequence: 1, tick: 3 },
    { event: { entityId: "unit-1", tick: 14, type: "locomotion-start" }, sequence: 2, tick: 14 },
  ]);
  assert.deepEqual(records.map(({ family, reason }) => [family, reason]), [
    ["movement", "mapped"], [null, "rate-limited"], ["movement", "mapped"],
  ]);
  const manifest = createProductionAudioProvenanceManifest();
  const tower = manifest.recipes.find(({ family }) => family === "tower");
  const voices = Array.from({ length: manifest.mix.maxPolyphony }, (_, index) => ({
    source: {
      durationTicks: tower.recipe.durationTicks,
      kind: "procedural",
      recipe: tower.recipe,
      sha256: tower.sha256,
      waveform: tower.waveform,
    },
    startTick: index % 2,
    mixGainBasisPoints: manifest.mix.voiceGainBasisPoints,
  }));
  const mix = auditProductionMix(voices, manifest.mix);
  assert.ok(mix.peak > 0);
  assert.ok(mix.peak <= manifest.mix.ceiling);
  assert.ok(mix.rmsBasisPoints > 0);
  assert.throws(() => auditProductionMix([
    ...voices,
    voices[0],
  ], manifest.mix), /polyphony bound/);
  assert.deepEqual(auditProductionMix(voices, manifest.mix), mix);
});

test("audio production assets: authenticated UI commands are ordered, idempotent, and restart-scoped", () => {
  const session = new GameSession(createShippedGameSessionSetup());
  const runtime = new GameAudioRuntime(session);
  const capability = createGameAudioRuntimeUiCapability(runtime);
  const first = runtime.submitUiCommand(capability, {
    cardId: "coilblade", kind: "card-select", sequence: 0, tick: 0,
  });
  assert.equal(first.accepted, true);
  assert.equal(first.cue.family, "cardSelect");
  const duplicate = runtime.submitUiCommand(capability, {
    cardId: "coilblade", kind: "card-select", sequence: 0, tick: 0,
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(runtime.state.transactionCount, 2);
  assert.throws(() => runtime.submitUiCommand(capability, {
    cardId: "coilblade", kind: "card-select", sequence: 0, tick: 0,
    extra: true,
  }), /invalid shape/);
  assert.throws(() => runtime.submitUiCommand(capability, {
    kind: "ui-toggle", sequence: 2, tick: 1,
  }), /sequence must be 1/);
  const toggle = runtime.submitUiCommand(capability, {
    kind: "ui-toggle", sequence: 1, tick: 1,
  });
  assert.equal(toggle.cue.family, "uiToggle");
  assert.equal(runtime.state.uiSequence, 2);
  const replacement = new GameSession(createShippedGameSessionSetup());
  runtime.restart(replacement);
  assert.equal(runtime.state.uiSequence, 0);
  assert.equal(runtime.submitUiCommand(capability, {
    kind: "ui-confirm", sequence: 0, tick: 0,
  }).cue.family, "uiConfirm");
});

test("audio production assets: real Chrome unlocks and schedules captured PCM through the shipped sink", {
  timeout: 600_000,
}, async () => {
  assert.ok(existsSync(PLAYWRIGHT), "installed Playwright equivalent is required");
  assert.ok(existsSync(CHROME), "installed Chrome is required");
  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let browser;
  const consoleErrors = [];
  const pageErrors = [];
  try {
    const ready = JSON.parse(await line(server.stdout));
    const { chromium } = await import(PLAYWRIGHT);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const context = await browser.newContext({ deviceScaleFactor: 1,
      viewport: { height: 1_280, width: 720 } });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    const response = await page.goto(
      `http://${ready.host}:${ready.port}/public/ui-arena-shell.html?session-profile=live-seed-2-terminal`,
      { waitUntil: "domcontentloaded" },
    );
    assert.equal(response.status(), 200);
    await page.waitForSelector('[data-ui="arena"]');
    await page.evaluate(async () => {
      const controller = (await import("/src/ui/arena-shell-entry.js")).arenaHudController;
      globalThis.__audioProductionController = controller;
    });
    const captureStart = await page.evaluate((targetTick) => {
      const controller = globalThis.__audioProductionController;
      controller.enterManualStepMode();
      const startTick = controller.state.sessionTick;
      if (startTick > targetTick) throw new Error("audio capture started after its fixed tick");
      controller.fastForwardSegment(targetTick - startTick);
      return controller.state.sessionTick;
    }, 300);
    assert.equal(captureStart, 300);
    const toggle = page.locator('[data-ui="audio-toggle"]');
    await toggle.click();
    const firstToggle = await page.evaluate(() => {
      const controller = globalThis.__audioProductionController;
      return { audio: controller.audio, pcm: controller.audioPcmObservations };
    });
    await toggle.click();
    const secondToggle = await page.evaluate(() => {
      const controller = globalThis.__audioProductionController;
      return { audio: controller.audio, pcm: controller.audioPcmObservations };
    });
    assert.equal(firstToggle.pcm[0].outputMuted, false);
    assert.ok(firstToggle.pcm[0].effectiveGainBasisPoints > 0);
    assert.equal(secondToggle.pcm.at(-1).outputMuted, true);
    assert.equal(secondToggle.pcm.at(-1).effectiveGainBasisPoints, 0);
    await page.locator('[data-ui="card-slot"]').first().click();
    await page.locator('[data-ui="arena"]').click({ position: { x: 439, y: 529 } });
    await page.evaluate(() => {
      const controller = globalThis.__audioProductionController;
      for (let index = 0; index < 16 && !controller.state.terminal; index += 1) {
        controller.fastForwardSegment(1_200);
      }
    });
    const capture = await page.evaluate(() => {
      const controller = globalThis.__audioProductionController;
      return {
        audio: controller.audio,
        diagnostics: controller.audioDiagnostics,
        mix: controller.audioMixAudit,
        pcm: controller.audioPcmObservations,
        terminal: controller.state.terminal,
      };
    });
    assert.equal(capture.terminal, true);
    assert.equal(capture.audio.audio.unlockCount, 1);
    assert.ok(capture.pcm.length > 0, "real Web Audio must receive scheduled PCM buffers");
    const families = new Set(capture.pcm.map(({ family }) => family));
    for (const family of ["uiToggle", "cardSelect", "cardPlay", "attack", "launch",
      "impact", "tower", "crown", "matchEnd"]) {
      assert.equal(families.has(family), true, `${family}: ${JSON.stringify(capture.pcm)}`);
    }
    assert.equal(capture.pcm.every(({ peak, energy, sampleCount, sampleRateHz, waveformSha256 }) =>
      peak > 0 && energy > 0 && sampleCount > 0 && sampleRateHz === 12_000 &&
      /^[0-9a-f]{64}$/u.test(waveformSha256)), true);
    assert.equal(consoleErrors.length, 0, consoleErrors.join("\n"));
    assert.equal(pageErrors.length, 0, pageErrors.join("\n"));
    await page.locator('[data-ui="restart"]').click();
    const restartBeforeUnlock = await page.evaluate(() => {
      const controller = globalThis.__audioProductionController;
      return { audio: controller.audio, pcm: controller.audioPcmObservations,
        state: controller.state };
    });
    assert.equal(restartBeforeUnlock.state.restartCount, 1);
    assert.equal(restartBeforeUnlock.audio.audio.unlockCount, 0);
    assert.equal(restartBeforeUnlock.pcm.length, 0);
    await toggle.click();
    const restartAfterUnlock = await page.evaluate(() => {
      const controller = globalThis.__audioProductionController;
      return { audio: controller.audio, pcm: controller.audioPcmObservations,
        state: controller.state };
    });
    assert.equal(restartAfterUnlock.audio.audio.unlockCount, 1);
    assert.ok(restartAfterUnlock.pcm.length > 0);
    assert.equal(restartAfterUnlock.state.restartCount, 1);
    assert.equal(consoleErrors.length, 0, consoleErrors.join("\n"));
    assert.equal(pageErrors.length, 0, pageErrors.join("\n"));
    const movementPage = await context.newPage();
    await movementPage.addInitScript(() => {
      let nextAnimationFrame = 1;
      const animationFrames = new Map();
      globalThis.requestAnimationFrame = (callback) => {
        const handle = nextAnimationFrame;
        nextAnimationFrame += 1;
        animationFrames.set(handle, callback);
        return handle;
      };
      globalThis.cancelAnimationFrame = (handle) => animationFrames.delete(handle);
    });
    const standardResponse = await movementPage.goto(
      `http://${ready.host}:${ready.port}/public/ui-arena-shell.html`,
      { waitUntil: "domcontentloaded" },
    );
    assert.equal(standardResponse.status(), 200);
    await movementPage.waitForSelector('[data-ui="arena"]');
    const standardStart = await movementPage.evaluate(async () => {
      const controller = (await import("/src/ui/arena-shell-entry.js")).arenaHudController;
      globalThis.__audioProductionController = controller;
      controller.enterManualStepMode();
      return controller.state.sessionTick;
    });
    assert.equal(standardStart, 0);
    await movementPage.locator('[data-ui="audio-toggle"]').click();
    await movementPage.evaluate(() => {
      const controller = globalThis.__audioProductionController;
      controller.fastForwardSegment(600);
    });
    const movementCapture = await movementPage.evaluate(() => {
      const controller = globalThis.__audioProductionController;
      return { audio: controller.audio, pcm: controller.audioPcmObservations,
        state: controller.state };
    });
    assert.equal(movementCapture.pcm.some(({ family }) => family === "movement"), true,
      JSON.stringify(movementCapture.pcm));
    assert.equal(consoleErrors.length, 0, consoleErrors.join("\n"));
    assert.equal(pageErrors.length, 0, pageErrors.join("\n"));
    await movementPage.close();
    const tickOrigin = Math.min(...capture.pcm.map(({ startTick }) => startTick));
    const restartTickOrigin = Math.min(...restartAfterUnlock.pcm.map(
      ({ startTick }) => startTick));
    const movementTickOrigin = Math.min(...movementCapture.pcm.map(
      ({ startTick }) => startTick));
    const manifest = createProductionAudioProvenanceManifest();
    const tower = manifest.recipes.find(({ family }) => family === "tower");
    const representativeVoices = Array.from({ length: 4 }, (_, index) => ({
      source: {
        durationTicks: tower.recipe.durationTicks,
        kind: "procedural",
        recipe: tower.recipe,
        sha256: tower.sha256,
        waveform: tower.waveform,
      },
      startTick: index,
      mixGainBasisPoints: manifest.mix.voiceGainBasisPoints,
    }));
    const offlineRender = writeOfflineRender(manifest);
    const evidence = {
      browser: {
        gainBasisPoints: capture.audio.gainBasisPoints,
        mute: capture.audio.muted,
        scheduledBufferCount: capture.pcm.length,
        scheduledPcm: relativePcmObservations(capture.pcm, tickOrigin),
        terminal: capture.terminal,
        unlockCount: capture.audio.audio.unlockCount,
      },
      movementBrowser: {
        pcm: relativePcmObservations(movementCapture.pcm, movementTickOrigin),
        sessionTick: movementCapture.state.sessionTick,
        tickOrigin: movementTickOrigin,
        unlockCount: movementCapture.audio.audio.unlockCount,
      },
      muteGain: {
        firstToggle: { ...firstToggle,
          pcm: relativePcmObservations(firstToggle.pcm, tickOrigin) },
        secondToggle: { ...secondToggle,
          pcm: relativePcmObservations(secondToggle.pcm, tickOrigin) },
      },
      restart: {
        afterUnlock: { ...restartAfterUnlock,
          pcm: relativePcmObservations(restartAfterUnlock.pcm, restartTickOrigin) },
        beforeUnlock: restartBeforeUnlock,
        tickOrigin: restartTickOrigin,
      },
      concurrentMix: auditProductionMix(representativeVoices, manifest.mix),
      eventCueSequence: capture.pcm.map(({ cueId, family, sequence, sourceType, startTick }) =>
        ({ cueId, family, sequence, sourceType, startTick: startTick - tickOrigin })),
      mixPolicy: manifest.mix,
      offlineRender,
      rendererDiagnostics: {
        cueCount: capture.diagnostics.cueCount,
        eventCount: capture.diagnostics.eventCount,
        generation: capture.diagnostics.generation,
        uiSequence: capture.diagnostics.uiSequence,
      },
      tickOrigin,
      version: 1,
      waveforms: manifest.recipes.map((entry) => {
        const pcm = synthesizeProceduralPcm(entry.recipe);
        return {
          cueId: entry.cueId,
          family: entry.family,
          metrics: pcmMetrics(pcm.bytes),
          sampleCount: entry.waveform.sampleCount,
          sampleRateHz: entry.waveform.sampleRateHz,
          sha256: entry.waveform.sha256,
        };
      }),
    };
    const artifact = writeEvidence(evidence);
    assert.match(artifact.sha256, /^[0-9a-f]{64}$/u);
  } finally {
    await browser?.close();
    server.kill("SIGTERM");
  }
});
