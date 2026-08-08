import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { AUDIO_CUE_TAXONOMY } from "../src/audio/audio-events.js";
import {
  AUDIO_RENDERER_MAX_ACTIVE_VOICES,
  AUDIO_RENDERER_MAX_BATCH,
  AUDIO_RENDERER_MAX_CLEANUP_TICK,
  AUDIO_RENDERER_MAX_SCHEDULED_VOICES,
  AUDIO_PCM_CHANNELS,
  AUDIO_PCM_FORMAT,
  AUDIO_PCM_SAMPLE_RATE_HZ,
  AudioRenderer,
  InMemoryPcmAudioBackend,
  audioRecipeSha256,
  auditAudioProvenance,
  createAudioProvenanceManifest,
  synthesizeProceduralPcm,
} from "../src/audio/audio-renderer.js";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function fakeBackend() {
  const state = { transactions: [], fail: false, thenable: false };
  return {
    adapter: {
      apply(transaction) {
        assert.ok(Object.isFrozen(transaction));
        assert.ok(Object.isFrozen(transaction.commands));
        assert.ok(transaction.commands.every(Object.isFrozen));
        state.transactions.push(structuredClone(transaction));
        if (state.fail) throw new Error("backend-failure");
        if (state.thenable) return Promise.resolve();
      },
    },
    state,
  };
}

function allCues() {
  return Object.entries(AUDIO_CUE_TAXONOMY).map(
    ([family, cueId], sequence) => ({
      cueId,
      family,
      reason: "mapped",
      sequence,
      tick: 2 + Math.floor(sequence / 3),
      type: "attack",
    }),
  );
}

function cue(family, sequence, tick) {
  return {
    cueId: AUDIO_CUE_TAXONOMY[family],
    family,
    reason: "mapped",
    sequence,
    tick,
    type: "attack",
  };
}

function renderer(backend, overrides = {}) {
  return new AudioRenderer({ backend, ...overrides });
}

function shippedAudioFiles() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const files = [];
  const visit = (path) => {
    if (!existsSync(path)) return;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if ([".aac", ".flac", ".m4a", ".mp3", ".ogg", ".wav"].includes(extname(entry.name))) {
        const bytes = readFileSync(child);
        files.push({
          path: relative(root, child).split("\\").join("/"),
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      }
    }
  };
  for (const directory of ["build", "dist", "public", "src"]) visit(join(root, directory));
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

test("audio renderer: every taxonomy cue has one bounded original canonical recipe", () => {
  const manifest = createAudioProvenanceManifest();
  assert.equal(manifest.schema, "original-audio-provenance");
  assert.equal(manifest.version, 1);
  assert.equal(manifest.assets.length, 0);
  assert.equal(manifest.recipes.length, Object.keys(AUDIO_CUE_TAXONOMY).length);
  assert.deepEqual(
    manifest.recipes.map(({ cueId, family }) => [family, cueId]),
    Object.entries(AUDIO_CUE_TAXONOMY),
  );
  assert.equal(manifest.author.id, "repository-contributors");
  assert.equal(manifest.license.id, "CC0-1.0");
  assert.ok(Object.isFrozen(manifest));
  assert.ok(manifest.recipes.every(Object.isFrozen));
  for (const entry of manifest.recipes) {
    const payload = JSON.stringify(canonicalize({
      cueId: entry.cueId,
      family: entry.family,
      recipe: entry.recipe,
      schema: "procedural-cue-v1",
    }));
    const independent = createHash("sha256").update(payload).digest("hex");
    assert.equal(entry.sha256, independent);
    assert.equal(audioRecipeSha256(entry.family, entry.cueId, entry.recipe), independent);
    const pcm = synthesizeProceduralPcm(entry.recipe);
    assert.equal(pcm.channels, AUDIO_PCM_CHANNELS);
    assert.equal(pcm.format, AUDIO_PCM_FORMAT);
    assert.equal(pcm.sampleRateHz, AUDIO_PCM_SAMPLE_RATE_HZ);
    assert.equal(pcm.sampleCount, entry.waveform.sampleCount);
    assert.equal(pcm.bytes.length, pcm.sampleCount * 2);
    assert.ok(pcm.bytes.some((byte) => byte !== 0));
    assert.equal(createHash("sha256").update(pcm.bytes).digest("hex"), entry.waveform.sha256);
    assert.ok(entry.recipe.durationTicks >= 1 && entry.recipe.durationTicks <= 120);
    assert.ok(entry.recipe.gainBasisPoints >= 1 && entry.recipe.gainBasisPoints <= 10_000);
    assert.ok(entry.recipe.startFrequencyHz >= 20 && entry.recipe.startFrequencyHz <= 8_000);
    assert.ok(entry.recipe.endFrequencyHz >= 20 && entry.recipe.endFrequencyHz <= 8_000);
  }
  assert.deepEqual(new Set(manifest.recipes.map(({ recipe }) => recipe.oscillator)),
    new Set(["sawtooth", "sine", "square", "triangle"]));
  assert.deepEqual(auditAudioProvenance(manifest), manifest);
  assert.deepEqual(shippedAudioFiles(), []);
  assert.deepEqual(auditAudioProvenance(manifest, shippedAudioFiles()), manifest);
  assert.notEqual(createAudioProvenanceManifest(), manifest);
});

test("audio renderer: generated PCM bytes are identical across fresh processes", () => {
  const moduleUrl = new URL("../src/audio/audio-renderer.js", import.meta.url).href;
  const program = `
    import { createHash } from "node:crypto";
    import { createAudioProvenanceManifest, synthesizeProceduralPcm } from ${JSON.stringify(moduleUrl)};
    const rows = createAudioProvenanceManifest().recipes.map((entry) => {
      const pcm = synthesizeProceduralPcm(entry.recipe);
      return [entry.cueId, pcm.sampleCount, pcm.bytes.length,
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
  assert.deepEqual(rows.map(([cueId]) => cueId), Object.values(AUDIO_CUE_TAXONOMY));
  assert.ok(rows.every(([, sampleCount, byteCount, hash]) =>
    sampleCount > 0 && byteCount === sampleCount * 2 && /^[0-9a-f]{64}$/u.test(hash)));
});

test("audio renderer: provenance rejects omissions, tampering, duplication, and false authorship", () => {
  const original = createAudioProvenanceManifest();
  const missing = structuredClone(original);
  missing.recipes.pop();
  assert.throws(() => auditAudioProvenance(missing), /missing audio source/);

  const tampered = structuredClone(original);
  tampered.recipes[0].recipe.durationTicks += 1;
  assert.throws(() => auditAudioProvenance(tampered), /invalid canonical hash/);

  const waveformTampered = structuredClone(original);
  waveformTampered.recipes[0].waveform.sha256 = "0".repeat(64);
  assert.throws(() => auditAudioProvenance(waveformTampered), /generated waveform hash/);

  const duplicate = structuredClone(original);
  duplicate.recipes[1] = structuredClone(duplicate.recipes[0]);
  assert.throws(() => auditAudioProvenance(duplicate), /duplicate audio cue/);

  const reordered = structuredClone(original);
  [reordered.recipes[0], reordered.recipes[1]] = [reordered.recipes[1], reordered.recipes[0]];
  assert.throws(() => auditAudioProvenance(reordered), /canonically ordered/);

  const falseAuthor = structuredClone(original);
  falseAuthor.author.id = "someone-else";
  assert.throws(() => auditAudioProvenance(falseAuthor), /authorship or license assertion/);

  const wrongLink = structuredClone(original);
  wrongLink.recipes[0].authorId = "someone-else";
  assert.throws(() => auditAudioProvenance(wrongLink), /authorship or license linkage/);
});

test("audio renderer: provenance rejects external, escaping, missing, duplicate, and unlisted assets", () => {
  const assetManifest = (path) => {
    const manifest = structuredClone(createAudioProvenanceManifest());
    const recipe = manifest.recipes.shift();
    manifest.assets.push({
      authorId: recipe.authorId,
      cueId: recipe.cueId,
      durationTicks: 1,
      family: recipe.family,
      licenseId: recipe.licenseId,
      path,
      sha256: "a".repeat(64),
    });
    return manifest;
  };
  assert.throws(
    () => auditAudioProvenance(assetManifest("https://audio.invalid/a.wav")),
    /repository-local/,
  );
  assert.throws(
    () => auditAudioProvenance(assetManifest("src/audio/assets/../escape.wav")),
    /repository-local/,
  );
  const validPath = "src/audio/assets/original-tone.wav";
  assert.throws(
    () => auditAudioProvenance(assetManifest(validPath), []),
    /missing shipped audio asset/,
  );
  assert.throws(
    () => auditAudioProvenance(createAudioProvenanceManifest(), [{
      path: validPath,
      sha256: "a".repeat(64),
    }]),
    /unlisted shipped audio asset/,
  );
  assert.equal(auditAudioProvenance(assetManifest(validPath), [{
    path: validPath,
    sha256: "a".repeat(64),
  }]).assets.length, 1);
  assert.throws(
    () => auditAudioProvenance(assetManifest(validPath), [{
      path: validPath,
      sha256: "b".repeat(64),
    }]),
    /hash mismatch/,
  );

  const duplicatedPath = assetManifest(validPath);
  const second = duplicatedPath.recipes.shift();
  duplicatedPath.assets.push({
    authorId: second.authorId,
    cueId: second.cueId,
    durationTicks: 1,
    family: second.family,
    licenseId: second.licenseId,
    path: validPath,
    sha256: "b".repeat(64),
  });
  assert.throws(
    () => auditAudioProvenance(duplicatedPath, [{
      path: validPath,
      sha256: "a".repeat(64),
    }]),
    /duplicate audio asset path/,
  );
});

test("audio renderer: all cues schedule once in deterministic source order without speakers", () => {
  const firstBackend = fakeBackend();
  const first = renderer(firstBackend.adapter);
  const commands = first.renderBatch(allCues());
  assert.equal(commands.length, Object.keys(AUDIO_CUE_TAXONOMY).length);
  assert.deepEqual(commands.map(({ cueId }) => cueId), Object.values(AUDIO_CUE_TAXONOMY));
  assert.deepEqual(commands.map(({ voiceId }) => voiceId), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.ok(commands.every(({ kind, source }) =>
    kind === "start" && source.kind === "procedural"));
  assert.ok(commands.every(({ endTick, startTick }) =>
    endTick > startTick && endTick <= startTick + 120));
  assert.equal(firstBackend.state.transactions.length, 2);
  assert.deepEqual(firstBackend.state.transactions[0], { commands: [{
    gainBasisPoints: 10_000,
    kind: "output",
    muted: false,
  }], transactionId: 1 });
  assert.deepEqual(firstBackend.state.transactions[1], { commands, transactionId: 2 });

  const secondBackend = fakeBackend();
  const second = renderer(secondBackend.adapter);
  second.renderBatch(allCues());
  assert.equal(
    JSON.stringify(secondBackend.state.transactions),
    JSON.stringify(firstBackend.state.transactions),
  );
  assert.deepEqual(second.state, first.state);
});

test("audio renderer: gain, mute, cleanup, and dispose form an explicit deterministic lifecycle", () => {
  const backend = fakeBackend();
  const value = renderer(backend.adapter);
  assert.equal(value.setGainBasisPoints(5_000).gainBasisPoints, 5_000);
  const audible = value.renderBatch([cue("attack", 0, 2)])[0];
  assert.equal(audible.effectiveGainBasisPoints, 1_600);
  assert.equal(value.setMuted(true).muted, true);
  const muted = value.renderBatch([cue("impact", 1, 3)])[0];
  assert.equal(muted.effectiveGainBasisPoints, 0);
  assert.equal(muted.voiceGainBasisPoints, 4_000);
  assert.equal(value.setMuted(false).muted, false);
  assert.equal(value.activeVoices.length, 2);
  const stopped = value.cleanupThroughTick(11);
  assert.deepEqual(stopped, [
    { kind: "stop", voiceId: 1 },
    { kind: "stop", voiceId: 2 },
  ]);
  assert.equal(value.state.activeVoiceCount, 0);
  assert.deepEqual(value.dispose(), []);
  assert.equal(value.state.disposed, true);
  assert.deepEqual(value.dispose(), []);
  assert.throws(() => value.renderBatch([]), /disposed/);
});

test("audio renderer: concrete PCM backend synthesizes, isolates, deduplicates, and cleans voices", () => {
  const sinkTransactions = [];
  const sinkPcmBatches = [];
  const backend = new InMemoryPcmAudioBackend({
    sink(transaction, pcmVoices) {
      sinkTransactions.push(structuredClone(transaction));
      sinkPcmBatches.push(pcmVoices.map(({ bytes, voiceId }) => ({
        byteLength: bytes.length,
        voiceId,
      })));
    },
  });
  const value = renderer(backend);
  const commands = value.renderBatch(allCues());
  assert.equal(commands.length, 11);
  assert.equal(backend.state.activeVoiceCount, 11);
  assert.equal(backend.state.transactionCount, 2);
  assert.deepEqual(sinkTransactions.map(({ transactionId }) => transactionId), [1, 2]);
  assert.deepEqual(sinkPcmBatches.map((batch) => batch.length), [0, 11]);
  assert.ok(sinkPcmBatches[1].every(({ byteLength }) => byteLength > 0));
  const voices = backend.activeVoices;
  assert.equal(voices.length, 11);
  assert.ok(voices.every(({ bytes, sampleCount, waveformSha256 }) =>
    bytes instanceof Uint8Array && bytes.length === sampleCount * 2 &&
    createHash("sha256").update(bytes).digest("hex") === waveformSha256));
  const originalByte = backend.activeVoices[0].bytes[0];
  voices[0].bytes[0] ^= 0xff;
  assert.equal(backend.activeVoices[0].bytes[0], originalByte);

  value.setGainBasisPoints(4_000);
  value.setMuted(true);
  assert.deepEqual(backend.state, {
    activeVoiceCount: 11,
    faultTransactionId: null,
    faulted: false,
    gainBasisPoints: 4_000,
    muted: true,
    transactionCount: 4,
  });
  value.cleanupThroughTick(AUDIO_RENDERER_MAX_CLEANUP_TICK);
  assert.equal(backend.state.activeVoiceCount, 0);
  value.dispose();
  assert.equal(value.state.disposed, true);

  const direct = new InMemoryPcmAudioBackend();
  const transaction = Object.freeze({
    commands: Object.freeze([{ gainBasisPoints: 7_500, kind: "output", muted: false }]),
    transactionId: 1,
  });
  direct.apply(transaction);
  direct.apply(transaction);
  assert.equal(direct.state.transactionCount, 1);
  assert.throws(() => direct.apply({
    commands: [{ gainBasisPoints: 7_501, kind: "output", muted: false }],
    transactionId: 1,
  }), /divergent duplicate/);

  let sinkCalls = 0;
  const uncertain = new InMemoryPcmAudioBackend({
    sink() {
      sinkCalls += 1;
      throw new Error("sink-applied-then-threw");
    },
  });
  assert.throws(() => uncertain.apply(transaction), /sink-applied-then-threw/);
  assert.equal(uncertain.state.faulted, true);
  assert.throws(() => uncertain.apply(transaction), /permanently faulted/);
  assert.equal(sinkCalls, 1);
});

test("audio renderer: invalid batches are atomic and uncertain backend outcomes permanently fault", () => {
  const backend = fakeBackend();
  const value = renderer(backend.adapter);
  const before = value.state;
  assert.throws(() => value.renderBatch([
    cue("attack", 0, 2),
    { ...cue("impact", 1, 2), cueId: "missing-cue" },
  ]), /not a mapped audio cue/);
  assert.deepEqual(value.state, before);
  assert.equal(backend.state.transactions.length, 1);

  backend.state.fail = true;
  assert.throws(() => value.renderBatch([cue("attack", 0, 2)]), /backend-failure/);
  assert.equal(value.state.faulted, true);
  assert.equal(value.state.faultTransactionId, 2);
  assert.equal(value.state.activeVoiceCount, before.activeVoiceCount);
  const observed = backend.state.transactions.length;
  backend.state.fail = false;
  assert.throws(() => value.renderBatch([cue("attack", 0, 2)]), /permanently faulted/);
  assert.throws(() => value.cleanupThroughTick(10), /permanently faulted/);
  assert.throws(() => value.dispose(), /permanently faulted/);
  assert.equal(backend.state.transactions.length, observed);
});

test("audio renderer: hostile shapes, ordering, and bounds fail closed without observation", () => {
  let getterCalls = 0;
  const hostileBackend = {};
  Object.defineProperty(hostileBackend, "apply", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return () => {};
    },
  });
  assert.throws(() => renderer(hostileBackend), /data property/);
  assert.equal(getterCalls, 0);

  const backend = fakeBackend();
  const value = renderer(backend.adapter);
  const accessorCue = cue("attack", 0, 2);
  Object.defineProperty(accessorCue, "family", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "attack";
    },
  });
  assert.throws(() => value.renderBatch([accessorCue]), /data property/);
  assert.equal(getterCalls, 0);
  assert.throws(() => value.renderBatch([
    { ...cue("attack", 0, 2), [Symbol("extra")]: true },
  ]), /plain object/);
  assert.throws(() => value.renderBatch([
    Object.assign(Object.create({}), cue("attack", 0, 2)),
  ]), /plain object/);
  const sparse = new Array(1);
  assert.throws(() => value.renderBatch(sparse), /sparse/);
  assert.throws(
    () => value.renderBatch(Array.from(
      { length: AUDIO_RENDERER_MAX_BATCH + 1 },
      (_, sequence) => cue("attack", sequence, 2),
    )),
    /exceeds/,
  );
  value.renderBatch([cue("attack", 0, 2)]);
  assert.throws(() => value.renderBatch([cue("impact", 0, 2)]), /sequence must increase/);
  assert.throws(() => value.renderBatch([cue("impact", 1, 1)]), /tick must not move backwards/);
  value.cleanupThroughTick(2);
  assert.throws(() => value.cleanupThroughTick(1), /must not move backwards/);
  assert.throws(() => value.setGainBasisPoints(10_001), /0 through 10000/);
  assert.throws(() => value.setMuted(1), /boolean/);
});

test("audio renderer: active, lifetime, and cleanup limits are executable", () => {
  const backend = { apply() {} };
  const value = renderer(backend);
  let sequence = 0;
  for (let group = 0; group < AUDIO_RENDERER_MAX_ACTIVE_VOICES / AUDIO_RENDERER_MAX_BATCH; group += 1) {
    value.renderBatch(Array.from(
      { length: AUDIO_RENDERER_MAX_BATCH },
      () => cue("attack", sequence++, 2),
    ));
  }
  assert.equal(value.state.activeVoiceCount, AUDIO_RENDERER_MAX_ACTIVE_VOICES);
  assert.throws(
    () => value.renderBatch([cue("attack", sequence, 2)]),
    /active voice bound/,
  );
  value.cleanupThroughTick(10);
  assert.equal(value.state.activeVoiceCount, 0);

  const remainingGroups =
    (AUDIO_RENDERER_MAX_SCHEDULED_VOICES - AUDIO_RENDERER_MAX_ACTIVE_VOICES) /
    AUDIO_RENDERER_MAX_BATCH;
  let tick = 11;
  for (let group = 0; group < remainingGroups; group += 1) {
    value.renderBatch(Array.from(
      { length: AUDIO_RENDERER_MAX_BATCH },
      () => cue("attack", sequence++, tick),
    ));
    value.cleanupThroughTick(tick + 8);
    tick += 9;
  }
  assert.equal(value.state.scheduledCount, AUDIO_RENDERER_MAX_SCHEDULED_VOICES);
  assert.throws(
    () => value.renderBatch([cue("attack", sequence, tick)]),
    /scheduled voice bound/,
  );
  assert.throws(
    () => value.cleanupThroughTick(AUDIO_RENDERER_MAX_CLEANUP_TICK + 1),
    /integer from/,
  );
});

test("audio renderer: asynchronous or value-returning adapters are rejected", () => {
  assert.throws(
    () => renderer({ apply() { return Promise.resolve(); } }),
    /complete synchronously/,
  );
  assert.throws(
    () => renderer({ apply() { return true; } }),
    /complete synchronously/,
  );

  const backend = fakeBackend();
  const value = renderer(backend.adapter);
  backend.state.thenable = true;
  assert.throws(() => value.setMuted(true), /complete synchronously/);
  assert.equal(value.state.faulted, true);
  const count = backend.state.transactions.length;
  backend.state.thenable = false;
  assert.throws(() => value.setMuted(true), /permanently faulted/);
  assert.equal(backend.state.transactions.length, count);
});
