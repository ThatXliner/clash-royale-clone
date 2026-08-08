import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  OPPONENT_CONTROLLER_MAX_BATCH_TICKS,
  OpponentController,
} from "../src/sim/opponent-controller.js";

const HAND = Object.freeze(["ash-guard", "bolt-wisp", "cinder-ram", "dune-mage"]);
const COSTS = Object.freeze([
  Object.freeze({ cardId: "ash-guard", cost: 3 }),
  Object.freeze({ cardId: "bolt-wisp", cost: 2 }),
  Object.freeze({ cardId: "cinder-ram", cost: 5 }),
  Object.freeze({ cardId: "dune-mage", cost: 4 }),
]);
const CANDIDATES = Object.freeze([
  Object.freeze({ cardId: "ash-guard", point: Object.freeze({ x: 100, y: 200 }) }),
  Object.freeze({ cardId: "ash-guard", point: Object.freeze({ x: 200, y: 200 }) }),
  Object.freeze({ cardId: "bolt-wisp", point: Object.freeze({ x: 300, y: 220 }) }),
  Object.freeze({ cardId: "cinder-ram", point: Object.freeze({ x: 400, y: 240 }) }),
  Object.freeze({ cardId: "dune-mage", point: Object.freeze({ x: 500, y: 260 }) }),
]);

function observation(tick, overrides = {}) {
  return {
    legalNorthDeployments: CANDIDATES.map((entry) => ({
      cardId: entry.cardId,
      point: { ...entry.point },
    })),
    northCardCosts: COSTS.map((entry) => ({ ...entry })),
    northElixir: 4,
    northHand: [...HAND],
    tick,
    ...overrides,
  };
}

function observations(from, through, overrides = {}) {
  return Array.from({ length: through - from + 1 }, (_, offset) =>
    observation(from + offset, overrides),
  );
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

test("opponent controller: seeded cadence emits immutable legal affordable proposals", () => {
  const controller = new OpponentController({
    seed: "match-17",
    thinkIntervalTicks: 3,
    thinkOffsetTicks: 1,
  });
  const emitted = controller.stepMany(observations(0, 10));
  assert.deepEqual(
    emitted.map(({ cardId, sequence, tick }) => ({ cardId, sequence, tick })),
    [
      { cardId: "ash-guard", sequence: 0, tick: 1 },
      { cardId: "dune-mage", sequence: 1, tick: 4 },
      { cardId: "ash-guard", sequence: 2, tick: 7 },
      { cardId: "dune-mage", sequence: 3, tick: 10 },
    ],
  );
  for (const proposal of emitted) {
    assert.equal(proposal.type, "deploy");
    assert.equal(proposal.side, "north");
    assert.ok(CANDIDATES.some(
      (candidate) => candidate.cardId === proposal.cardId &&
        candidate.point.x === proposal.point.x &&
        candidate.point.y === proposal.point.y,
    ));
    assert.ok(COSTS.find(({ cardId }) => cardId === proposal.cardId).cost <= 4);
    assert.ok(Object.isFrozen(proposal));
    assert.ok(Object.isFrozen(proposal.point));
  }
  assert.ok(Object.isFrozen(emitted));
  assert.deepEqual(controller.state, {
    nextSequence: 4,
    nextTick: 11,
    thinkIntervalTicks: 3,
    thinkOffsetTicks: 1,
  });
});

test("opponent controller: no cadence, legality, or affordability bypass exists", () => {
  const controller = new OpponentController({ seed: 4, thinkIntervalTicks: 2 });
  const outputs = [];
  outputs.push(...controller.step(observation(0, { northElixir: 0 })));
  outputs.push(...controller.step(observation(1, { northElixir: 10 })));
  outputs.push(...controller.step(observation(2, {
    legalNorthDeployments: [
      { cardId: "cinder-ram", point: { x: 400, y: 240 } },
    ],
    northElixir: 4,
  })));
  outputs.push(...controller.step(observation(3, { northElixir: 10 })));
  assert.deepEqual(outputs, []);
  assert.deepEqual(controller.replayLog.map((entry) => ({
    choiceIndex: entry.choiceIndex,
    eligibleCount: entry.eligibleCount,
    proposal: entry.proposal,
    tick: entry.tick,
  })), [
    { choiceIndex: null, eligibleCount: 0, proposal: null, tick: 0 },
    { choiceIndex: null, eligibleCount: 0, proposal: null, tick: 2 },
  ]);
  assert.deepEqual(controller.replayLog[0].eligibleCandidates, []);
  assert.equal(controller.replayLog[0].observation.northElixir, 0);
  assert.deepEqual(
    controller.replayLog[1].observation.legalNorthDeployments,
    [{ cardId: "cinder-ram", point: { x: 400, y: 240 } }],
  );
});

test("opponent controller: chunking and every restore cut continue byte-identically", () => {
  const all = observations(0, 120);
  const straight = new OpponentController({
    seed: "restore-cuts",
    thinkIntervalTicks: 5,
    thinkOffsetTicks: 2,
  });
  const expectedEvents = straight.stepMany(all);
  const expectedBytes = straight.serialize();
  const expectedReplay = straight.replayBytes();

  const chunked = new OpponentController({
    seed: "restore-cuts",
    thinkIntervalTicks: 5,
    thinkOffsetTicks: 2,
  });
  const chunkedEvents = [];
  for (const count of [1, 0, 7, 13, 2, 31, 67]) {
    const start = chunked.state.nextTick;
    chunkedEvents.push(...chunked.stepMany(all.slice(start, start + count)));
  }
  assert.deepEqual(chunkedEvents, expectedEvents);
  assert.equal(chunked.serialize(), expectedBytes);
  assert.equal(chunked.replayBytes(), expectedReplay);

  for (let cut = 0; cut <= all.length; cut += 1) {
    const partial = new OpponentController({
      seed: "restore-cuts",
      thinkIntervalTicks: 5,
      thinkOffsetTicks: 2,
    });
    partial.stepMany(all.slice(0, cut));
    const bytesAtCut = partial.serialize();
    const restored = OpponentController.restore(bytesAtCut);
    assert.equal(restored.serialize(), bytesAtCut, `restore bytes at cut ${cut}`);
    restored.stepMany(all.slice(cut));
    assert.equal(restored.serialize(), expectedBytes, `final bytes at cut ${cut}`);
    assert.equal(restored.replayBytes(), expectedReplay, `replay at cut ${cut}`);
  }
});

test("opponent controller: outputs and retained state are isolated from callers", () => {
  const controller = new OpponentController({ seed: 9, thinkIntervalTicks: 1 });
  const input = observation(0);
  const output = controller.step(input);
  const before = controller.serialize();
  input.northHand[0] = "forged-card";
  input.northCardCosts[0].cost = 10;
  input.legalNorthDeployments[0].point.x = 999_999;
  assert.equal(controller.serialize(), before);
  assert.throws(() => { output[0].point.x = 7; }, TypeError);
  assert.throws(() => { controller.replayLog[0].eligibleCount = 99; }, TypeError);
  assert.equal(controller.serialize(), before);
});

test("opponent controller: hostile observations and batches reject atomically", () => {
  const controller = new OpponentController({ seed: "atomic", thinkIntervalTicks: 1 });
  const invalid = [
    null,
    observation(1),
    { ...observation(0), extra: true },
    observation(0, { northElixir: 11 }),
    observation(0, { northHand: [HAND[0], HAND[0]] }),
    observation(0, { northCardCosts: [...COSTS].reverse().map((value) => ({ ...value })) }),
    observation(0, { legalNorthDeployments: [...CANDIDATES].reverse().map((value) => ({ cardId: value.cardId, point: { ...value.point } })) }),
    observation(0, { legalNorthDeployments: [{ cardId: "not-in-hand", point: { x: 1, y: 2 } }] }),
    observation(0, { legalNorthDeployments: [{ cardId: HAND[0], point: { x: 0.5, y: 2 } }] }),
  ];
  for (const value of invalid) {
    const before = controller.serialize();
    assert.throws(() => controller.step(value));
    assert.equal(controller.serialize(), before);
  }

  const batch = [observation(0), observation(2)];
  const beforeBatch = controller.serialize();
  assert.throws(() => controller.stepMany(batch));
  assert.equal(controller.serialize(), beforeBatch);
  assert.throws(
    () => controller.stepMany(Array(OPPONENT_CONTROLLER_MAX_BATCH_TICKS + 1)),
    /at most 4096/u,
  );
  assert.equal(controller.serialize(), beforeBatch);

  let getterCalls = 0;
  const accessor = observation(0);
  Object.defineProperty(accessor, "northElixir", {
    enumerable: true,
    get() { getterCalls += 1; return 10; },
  });
  assert.throws(() => controller.step(accessor), /data property/u);
  assert.equal(getterCalls, 0);
  assert.equal(controller.serialize(), beforeBatch);
});

test("opponent controller: replay provenance byte bound rejects atomically", () => {
  const controller = new OpponentController({
    seed: "replay-byte-bound",
    thinkIntervalTicks: 1,
  });
  const legalNorthDeployments = Array.from({ length: 1_024 }, (_, x) => ({
    cardId: "ash-guard",
    point: { x, y: 200 },
  }));
  const batch = Array.from({ length: 48 }, (_, tick) => ({
    legalNorthDeployments: legalNorthDeployments.map(({ cardId, point }) => ({
      cardId,
      point: { ...point },
    })),
    northCardCosts: [{ cardId: "ash-guard", cost: 3 }],
    northElixir: 10,
    northHand: ["ash-guard"],
    tick,
  }));
  const before = controller.serialize();
  assert.throws(() => controller.stepMany(batch), /replay byte bound/u);
  assert.equal(controller.serialize(), before);
  assert.deepEqual(controller.state, {
    nextSequence: 0,
    nextTick: 0,
    thinkIntervalTicks: 1,
    thinkOffsetTicks: 0,
  });
});

test("opponent controller: canonical restore rejects forged snapshots atomically", () => {
  const source = new OpponentController({
    seed: "hostile-restore",
    thinkIntervalTicks: 2,
    thinkOffsetTicks: 1,
  });
  source.stepMany(observations(0, 8));
  const bytes = source.serialize();
  assert.equal(OpponentController.restore(bytes).serialize(), bytes);
  const raw = JSON.parse(bytes);
  const forged = [
    ` ${bytes}`,
    JSON.stringify({ ...raw, extra: true }),
    JSON.stringify({ ...raw, nextSequence: raw.nextSequence + 1 }),
    JSON.stringify({ ...raw, nextTick: raw.nextTick + 1 }),
    JSON.stringify({ ...raw, rng: { ...raw.rng, state: "0000000000000000" } }),
    JSON.stringify({ ...raw, replay: raw.replay.slice(1) }),
    JSON.stringify({
      ...raw,
      replay: raw.replay.map((entry, index) =>
        index === 0 ? { ...entry, choiceIndex: entry.choiceIndex === 0 ? 1 : 0 } : entry),
    }),
  ];
  for (const snapshot of forged) {
    assert.throws(() => OpponentController.restore(snapshot));
    assert.equal(source.serialize(), bytes);
  }
  assert.throws(() => OpponentController.restore("{"), /valid JSON/u);
  assert.throws(() => OpponentController.restore(null), /must be a string/u);
});

test("opponent controller: restore derives the exact affordable legal seeded proposal", () => {
  const source = new OpponentController({
    seed: 0,
    thinkIntervalTicks: 3,
    thinkOffsetTicks: 1,
  });
  source.stepMany(observations(0, 4));
  const bytes = source.serialize();
  const raw = JSON.parse(bytes);

  const forgeries = [];
  const substituteProposal = structuredClone(raw);
  substituteProposal.replay[0].proposal.cardId = "bolt-wisp";
  forgeries.push(substituteProposal);

  const substituteCandidate = structuredClone(raw);
  substituteCandidate.replay[0].eligibleCandidates[1] = {
    cardId: "bolt-wisp",
    cost: 2,
    point: { x: 300, y: 220 },
  };
  forgeries.push(substituteCandidate);

  const substituteCandidateAndProposal = structuredClone(raw);
  substituteCandidateAndProposal.replay[0].eligibleCandidates[1] = {
    cardId: "bolt-wisp",
    cost: 2,
    point: { x: 300, y: 220 },
  };
  substituteCandidateAndProposal.replay[0].proposal.cardId = "bolt-wisp";
  substituteCandidateAndProposal.replay[0].proposal.point = { x: 300, y: 220 };
  forgeries.push(substituteCandidateAndProposal);

  const reorderedCandidates = structuredClone(raw);
  [
    reorderedCandidates.replay[0].eligibleCandidates[0],
    reorderedCandidates.replay[0].eligibleCandidates[1],
  ] = [
    reorderedCandidates.replay[0].eligibleCandidates[1],
    reorderedCandidates.replay[0].eligibleCandidates[0],
  ];
  forgeries.push(reorderedCandidates);

  const unaffordableCandidate = structuredClone(raw);
  unaffordableCandidate.replay[0].eligibleCandidates[1].cost = 10;
  forgeries.push(unaffordableCandidate);

  const forgedProvenance = structuredClone(raw);
  forgedProvenance.replay[0].observation.northElixir = 2;
  forgeries.push(forgedProvenance);

  const reorderedLegalProvenance = structuredClone(raw);
  [
    reorderedLegalProvenance.replay[0].observation.legalNorthDeployments[0],
    reorderedLegalProvenance.replay[0].observation.legalNorthDeployments[1],
  ] = [
    reorderedLegalProvenance.replay[0].observation.legalNorthDeployments[1],
    reorderedLegalProvenance.replay[0].observation.legalNorthDeployments[0],
  ];
  forgeries.push(reorderedLegalProvenance);

  for (const forged of forgeries) {
    assert.throws(() => OpponentController.restore(canonicalJson(forged)));
    assert.equal(source.serialize(), bytes);
  }
});

test("opponent controller: canonical replay and snapshot vectors are stable", () => {
  const controller = new OpponentController({
    seed: 0,
    thinkIntervalTicks: 3,
    thinkOffsetTicks: 1,
  });
  controller.stepMany(observations(0, 4));
  assert.equal(
    createHash("sha256").update(controller.replayBytes()).digest("hex"),
    "a5a62aea5aa5a4c0ac54e498d1474a5da7f59fc6d19e132d911a81a391652f8a",
  );
  assert.equal(OpponentController.restore(controller.serialize()).serialize(), controller.serialize());
});

test("opponent controller: runtime source is isolated and deterministic", () => {
  const source = readFileSync(
    new URL("../src/sim/opponent-controller.js", import.meta.url),
    "utf8",
  );
  assert.equal(source.includes("reference/"), false);
  assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now|setTimeout/u);
});
