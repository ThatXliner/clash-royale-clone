import { SeededRandom } from "./rng.js";

export const OPPONENT_CONTROLLER_ALGORITHM =
  "bounded-seeded-opponent-controller-v1";
export const OPPONENT_CONTROLLER_MAX_BATCH_TICKS = 4_096;
export const OPPONENT_CONTROLLER_MAX_CANDIDATES = 1_024;
export const OPPONENT_CONTROLLER_MAX_DECISIONS = 10_000;
export const OPPONENT_CONTROLLER_MAX_REPLAY_BYTES = 3 * 1_024 * 1_024;
export const OPPONENT_CONTROLLER_MAX_TICKS = 1_000_000;

const SNAPSHOT_MAX_BYTES = 4 * 1_024 * 1_024;
const CARD_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const SNAPSHOT_KEYS = Object.freeze([
  "algorithm",
  "nextSequence",
  "nextTick",
  "replay",
  "rng",
  "seed",
  "thinkIntervalTicks",
  "thinkOffsetTicks",
  "version",
]);

const hasOwn = (value, key) =>
  Object.prototype.hasOwnProperty.call(value, key);

function assertPlainRecord(value, label, expectedKeys) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort();
  if (keys.join(",") !== [...expectedKeys].sort().join(",")) {
    throw new TypeError(`${label} has an invalid shape`);
  }
  for (const key of keys) {
    if (!("value" in descriptors[key])) {
      throw new TypeError(`${label}.${key} must be a data property`);
    }
  }
  return descriptors;
}

function assertSafeInteger(value, label, minimum, maximum) {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new TypeError(
      `${label} must be a safe integer from ${minimum} through ${maximum}`,
    );
  }
  return value;
}

function assertCardId(value, label) {
  if (typeof value !== "string" || !CARD_ID_PATTERN.test(value)) {
    throw new TypeError(`${label} must be a canonical card id`);
  }
  return value;
}

function assertSeed(value) {
  if (
    (typeof value === "string" &&
      new TextEncoder().encode(value).length <= 256) ||
    Number.isSafeInteger(value)
  ) return value;
  throw new TypeError("seed must be a string or safe integer");
}

function assertDenseArray(value, label, maximumLength) {
  if (!Array.isArray(value) || value.length > maximumLength) {
    throw new TypeError(`${label} must contain at most ${maximumLength} entries`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const enumerableKeys = Object.keys(descriptors)
    .filter((key) => descriptors[key].enumerable)
    .sort();
  const expectedKeys = Array.from({ length: value.length }, (_, index) =>
    String(index)).sort();
  if (enumerableKeys.join(",") !== expectedKeys.join(",")) {
    throw new TypeError(`${label} must be a dense data array`);
  }
  for (const key of expectedKeys) {
    if (!("value" in descriptors[key])) {
      throw new TypeError(`${label} must be a dense data array`);
    }
  }
  return descriptors;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalize(value[key]);
    }
    return result;
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function isolated(value) {
  return deepFreeze(canonicalize(value));
}

function compareCandidates(left, right) {
  return (
    (left.cardId < right.cardId ? -1 : left.cardId > right.cardId ? 1 : 0) ||
    left.point.x - right.point.x ||
    left.point.y - right.point.y
  );
}

function checkCanonicalOrder(values, compare, label) {
  for (let index = 1; index < values.length; index += 1) {
    if (compare(values[index - 1], values[index]) >= 0) {
      throw new TypeError(`${label} must be unique and canonically ordered`);
    }
  }
}

function validateObservation(value, expectedTick) {
  const fields = assertPlainRecord(value, "observation", [
    "legalNorthDeployments",
    "northCardCosts",
    "northElixir",
    "northHand",
    "tick",
  ]);
  const tick = assertSafeInteger(
    fields.tick.value,
    "observation.tick",
    0,
    OPPONENT_CONTROLLER_MAX_TICKS - 1,
  );
  if (tick !== expectedTick) {
    throw new RangeError(
      `observation.tick must equal next unresolved tick ${expectedTick}`,
    );
  }
  const northElixir = assertSafeInteger(
    fields.northElixir.value,
    "observation.northElixir",
    0,
    10,
  );

  const northHandRaw = fields.northHand.value;
  const handDescriptors = assertDenseArray(
    northHandRaw,
    "observation.northHand",
    8,
  );
  const northHand = [];
  const handSet = new Set();
  for (let index = 0; index < northHandRaw.length; index += 1) {
    const descriptor = handDescriptors[String(index)];
    const cardId = assertCardId(
      descriptor.value,
      `observation.northHand[${index}]`,
    );
    if (handSet.has(cardId)) {
      throw new TypeError("observation.northHand must not contain duplicates");
    }
    handSet.add(cardId);
    northHand.push(cardId);
  }

  const costsRaw = fields.northCardCosts.value;
  const costDescriptors = assertDenseArray(
    costsRaw,
    "observation.northCardCosts",
    8,
  );
  if (costsRaw.length !== northHand.length) {
    throw new TypeError(
      "observation.northCardCosts must contain exactly one cost per hand card",
    );
  }
  const northCardCosts = [];
  const costMap = new Map();
  for (let index = 0; index < costsRaw.length; index += 1) {
    const descriptor = costDescriptors[String(index)];
    const costFields = assertPlainRecord(
      descriptor.value,
      `observation.northCardCosts[${index}]`,
      ["cardId", "cost"],
    );
    const cardId = assertCardId(
      costFields.cardId.value,
      `observation.northCardCosts[${index}].cardId`,
    );
    const cost = assertSafeInteger(
      costFields.cost.value,
      `observation.northCardCosts[${index}].cost`,
      0,
      10,
    );
    if (!handSet.has(cardId) || costMap.has(cardId)) {
      throw new TypeError(
        "observation.northCardCosts must uniquely cover the north hand",
      );
    }
    costMap.set(cardId, cost);
    northCardCosts.push({ cardId, cost });
  }
  checkCanonicalOrder(
    northCardCosts,
    (left, right) =>
      left.cardId < right.cardId ? -1 : left.cardId > right.cardId ? 1 : 0,
    "observation.northCardCosts",
  );

  const candidatesRaw = fields.legalNorthDeployments.value;
  const candidateDescriptors = assertDenseArray(
    candidatesRaw,
    "observation.legalNorthDeployments",
    OPPONENT_CONTROLLER_MAX_CANDIDATES,
  );
  const legalNorthDeployments = [];
  for (let index = 0; index < candidatesRaw.length; index += 1) {
    const descriptor = candidateDescriptors[String(index)];
    const candidateFields = assertPlainRecord(
      descriptor.value,
      `observation.legalNorthDeployments[${index}]`,
      ["cardId", "point"],
    );
    const cardId = assertCardId(
      candidateFields.cardId.value,
      `observation.legalNorthDeployments[${index}].cardId`,
    );
    if (!handSet.has(cardId)) {
      throw new TypeError(
        "observation.legalNorthDeployments must reference only hand cards",
      );
    }
    const pointFields = assertPlainRecord(
      candidateFields.point.value,
      `observation.legalNorthDeployments[${index}].point`,
      ["x", "y"],
    );
    const point = {
      x: assertSafeInteger(
        pointFields.x.value,
        `observation.legalNorthDeployments[${index}].point.x`,
        0,
        1_000_000,
      ),
      y: assertSafeInteger(
        pointFields.y.value,
        `observation.legalNorthDeployments[${index}].point.y`,
        0,
        1_000_000,
      ),
    };
    legalNorthDeployments.push({ cardId, point });
  }
  checkCanonicalOrder(
    legalNorthDeployments,
    compareCandidates,
    "observation.legalNorthDeployments",
  );

  return { legalNorthDeployments, northCardCosts, northElixir, northHand, tick };
}

function validateProposal(value, expectedTick, expectedSequence) {
  const fields = assertPlainRecord(value, "replay proposal", [
    "cardId",
    "point",
    "sequence",
    "side",
    "tick",
    "type",
  ]);
  if (fields.type.value !== "deploy" || fields.side.value !== "north") {
    throw new TypeError("replay proposal has an invalid type or side");
  }
  const cardId = assertCardId(fields.cardId.value, "replay proposal.cardId");
  const tick = assertSafeInteger(
    fields.tick.value,
    "replay proposal.tick",
    0,
    OPPONENT_CONTROLLER_MAX_TICKS - 1,
  );
  const sequence = assertSafeInteger(
    fields.sequence.value,
    "replay proposal.sequence",
    0,
    OPPONENT_CONTROLLER_MAX_DECISIONS - 1,
  );
  if (tick !== expectedTick || sequence !== expectedSequence) {
    throw new TypeError("replay proposal is not causally contiguous");
  }
  const pointFields = assertPlainRecord(fields.point.value, "replay proposal.point", [
    "x",
    "y",
  ]);
  return {
    cardId,
    point: {
      x: assertSafeInteger(pointFields.x.value, "replay proposal.point.x", 0, 1_000_000),
      y: assertSafeInteger(pointFields.y.value, "replay proposal.point.y", 0, 1_000_000),
    },
    sequence,
    side: "north",
    tick,
    type: "deploy",
  };
}

export class OpponentController {
  #nextSequence = 0;
  #nextTick = 0;
  #replay = [];
  #rng;
  #seed;
  #thinkIntervalTicks;
  #thinkOffsetTicks;

  constructor(options = {}) {
    if (
      options === null ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      Object.getPrototypeOf(options) !== Object.prototype
    ) {
      throw new TypeError("controller options must be a plain object");
    }
    const descriptors = Object.getOwnPropertyDescriptors(options);
    const optionKeys = Object.keys(descriptors).sort();
    if (
      optionKeys.some((key) =>
        !["seed", "thinkIntervalTicks", "thinkOffsetTicks"].includes(key)) ||
      !hasOwn(descriptors, "seed")
    ) {
      throw new TypeError("controller options have an invalid shape");
    }
    for (const key of optionKeys) {
      if (!("value" in descriptors[key])) {
        throw new TypeError(`controller option ${key} must be a data property`);
      }
    }
    const seed = descriptors.seed.value;
    const thinkIntervalTicks = hasOwn(descriptors, "thinkIntervalTicks")
      ? descriptors.thinkIntervalTicks.value
      : 30;
    const thinkOffsetTicks = hasOwn(descriptors, "thinkOffsetTicks")
      ? descriptors.thinkOffsetTicks.value
      : 0;
    this.#seed = assertSeed(seed);
    this.#thinkIntervalTicks = assertSafeInteger(
      thinkIntervalTicks,
      "thinkIntervalTicks",
      1,
      3_600,
    );
    this.#thinkOffsetTicks = assertSafeInteger(
      thinkOffsetTicks,
      "thinkOffsetTicks",
      0,
      this.#thinkIntervalTicks - 1,
    );
    this.#rng = new SeededRandom(this.#seed).fork(
      OPPONENT_CONTROLLER_ALGORITHM,
    );
  }

  get state() {
    return isolated({
      nextSequence: this.#nextSequence,
      nextTick: this.#nextTick,
      thinkIntervalTicks: this.#thinkIntervalTicks,
      thinkOffsetTicks: this.#thinkOffsetTicks,
    });
  }

  get replayLog() {
    return isolated(this.#replay);
  }

  /** Composite-session checkpoint with exact continuation and no duplicate provenance. */
  continuationFork() {
    const candidate = new OpponentController({ seed: this.#seed,
      thinkIntervalTicks: this.#thinkIntervalTicks, thinkOffsetTicks: this.#thinkOffsetTicks });
    candidate.#nextSequence = this.#nextSequence;
    candidate.#nextTick = this.#nextTick;
    candidate.#rng = SeededRandom.restore(this.#rng.serialize());
    return candidate;
  }

  step(observation) {
    return this.stepMany([observation]);
  }

  stepMany(observations) {
    const observationDescriptors = assertDenseArray(
      observations,
      "observations",
      OPPONENT_CONTROLLER_MAX_BATCH_TICKS,
    );
    if (this.#nextTick + observations.length > OPPONENT_CONTROLLER_MAX_TICKS) {
      throw new RangeError("controller cannot exceed its total tick bound");
    }

    const checked = [];
    let expectedTick = this.#nextTick;
    let addedDecisions = 0;
    for (let index = 0; index < observations.length; index += 1) {
      const descriptor = observationDescriptors[String(index)];
      const observation = validateObservation(descriptor.value, expectedTick);
      checked.push(observation);
      if (this.#isThinkTick(expectedTick)) addedDecisions += 1;
      expectedTick += 1;
    }
    if (this.#replay.length + addedDecisions > OPPONENT_CONTROLLER_MAX_DECISIONS) {
      throw new RangeError("controller cannot exceed its decision history bound");
    }

    const stagedRng = SeededRandom.restore(this.#rng.serialize());
    let stagedSequence = this.#nextSequence;
    const additions = [];
    const proposals = [];
    for (const observation of checked) {
      if (this.#isThinkTick(observation.tick)) {
        const costs = new Map(
          observation.northCardCosts.map(({ cardId, cost }) => [cardId, cost]),
        );
        const eligible = observation.legalNorthDeployments.filter(
          ({ cardId }) => costs.get(cardId) <= observation.northElixir,
        ).map(({ cardId, point }) => ({
          cardId,
          cost: costs.get(cardId),
          point,
        }));
        let choiceIndex = null;
        let proposal = null;
        if (eligible.length > 0) {
          choiceIndex = stagedRng.int(eligible.length);
          const selected = eligible[choiceIndex];
          proposal = isolated({
            cardId: selected.cardId,
            point: selected.point,
            sequence: stagedSequence,
            side: "north",
            tick: observation.tick,
            type: "deploy",
          });
          stagedSequence += 1;
          proposals.push(proposal);
        }
        additions.push(
          isolated({
            choiceIndex,
            eligibleCandidates: eligible,
            eligibleCount: eligible.length,
            observation: {
              legalNorthDeployments: observation.legalNorthDeployments,
              northCardCosts: observation.northCardCosts,
              northElixir: observation.northElixir,
              northHand: observation.northHand,
            },
            proposal,
            tick: observation.tick,
          }),
        );
      }
    }
    const replay = [...this.#replay, ...additions];
    if (
      new TextEncoder().encode(canonicalJson(replay)).length >
      OPPONENT_CONTROLLER_MAX_REPLAY_BYTES
    ) {
      throw new RangeError("controller cannot exceed its replay byte bound");
    }
    this.#rng = stagedRng;
    this.#nextSequence = stagedSequence;
    this.#nextTick += checked.length;
    this.#replay = replay;
    return isolated(proposals);
  }

  replayBytes() {
    return canonicalJson(this.#replay);
  }

  serialize() {
    return canonicalJson({
      algorithm: OPPONENT_CONTROLLER_ALGORITHM,
      nextSequence: this.#nextSequence,
      nextTick: this.#nextTick,
      replay: this.#replay,
      rng: this.#rng.serialize(),
      seed: this.#seed,
      thinkIntervalTicks: this.#thinkIntervalTicks,
      thinkOffsetTicks: this.#thinkOffsetTicks,
      version: 1,
    });
  }

  static restore(serialized) {
    if (typeof serialized !== "string") {
      throw new TypeError("serialized controller snapshot must be a string");
    }
    if (new TextEncoder().encode(serialized).length > SNAPSHOT_MAX_BYTES) {
      throw new RangeError("serialized controller snapshot exceeds its byte bound");
    }
    let snapshot;
    try {
      snapshot = JSON.parse(serialized);
    } catch {
      throw new TypeError("serialized controller snapshot must be valid JSON");
    }
    const fields = assertPlainRecord(snapshot, "controller snapshot", SNAPSHOT_KEYS);
    if (canonicalJson(snapshot) !== serialized) {
      throw new TypeError("serialized controller snapshot must be canonical JSON");
    }
    if (
      fields.algorithm.value !== OPPONENT_CONTROLLER_ALGORITHM ||
      fields.version.value !== 1
    ) {
      throw new TypeError("controller snapshot has an unsupported algorithm");
    }
    const seed = assertSeed(fields.seed.value);
    const thinkIntervalTicks = assertSafeInteger(
      fields.thinkIntervalTicks.value,
      "snapshot.thinkIntervalTicks",
      1,
      3_600,
    );
    const thinkOffsetTicks = assertSafeInteger(
      fields.thinkOffsetTicks.value,
      "snapshot.thinkOffsetTicks",
      0,
      thinkIntervalTicks - 1,
    );
    const nextTick = assertSafeInteger(
      fields.nextTick.value,
      "snapshot.nextTick",
      0,
      OPPONENT_CONTROLLER_MAX_TICKS,
    );
    const nextSequence = assertSafeInteger(
      fields.nextSequence.value,
      "snapshot.nextSequence",
      0,
      OPPONENT_CONTROLLER_MAX_DECISIONS,
    );
    const replayRaw = fields.replay.value;
    if (
      !Array.isArray(replayRaw) ||
      replayRaw.length > OPPONENT_CONTROLLER_MAX_DECISIONS
    ) {
      throw new TypeError("snapshot.replay exceeds its decision history bound");
    }

    const controller = new OpponentController({
      seed,
      thinkIntervalTicks,
      thinkOffsetTicks,
    });
    const replay = [];
    let proposalSequence = 0;
    let expectedDecisionTick = thinkOffsetTicks;
    for (let index = 0; index < replayRaw.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(replayRaw, String(index));
      if (descriptor === undefined || !("value" in descriptor)) {
        throw new TypeError("snapshot.replay must be a dense data array");
      }
      const replayFields = assertPlainRecord(
        descriptor.value,
        `snapshot.replay[${index}]`,
        [
          "choiceIndex",
          "eligibleCandidates",
          "eligibleCount",
          "observation",
          "proposal",
          "tick",
        ],
      );
      const tick = assertSafeInteger(
        replayFields.tick.value,
        `snapshot.replay[${index}].tick`,
        0,
        OPPONENT_CONTROLLER_MAX_TICKS - 1,
      );
      if (tick !== expectedDecisionTick || tick >= nextTick) {
        throw new TypeError("snapshot.replay decision ticks are not causal");
      }
      const eligibleCount = assertSafeInteger(
        replayFields.eligibleCount.value,
        `snapshot.replay[${index}].eligibleCount`,
        0,
        OPPONENT_CONTROLLER_MAX_CANDIDATES,
      );
      const observationFields = assertPlainRecord(
        replayFields.observation.value,
        `snapshot.replay[${index}].observation`,
        [
          "legalNorthDeployments",
          "northCardCosts",
          "northElixir",
          "northHand",
        ],
      );
      const observation = validateObservation(
        {
          legalNorthDeployments:
            observationFields.legalNorthDeployments.value,
          northCardCosts: observationFields.northCardCosts.value,
          northElixir: observationFields.northElixir.value,
          northHand: observationFields.northHand.value,
          tick,
        },
        tick,
      );
      const costs = new Map(
        observation.northCardCosts.map(({ cardId, cost }) => [cardId, cost]),
      );
      const expectedEligible = observation.legalNorthDeployments
        .filter(({ cardId }) => costs.get(cardId) <= observation.northElixir)
        .map(({ cardId, point }) => ({
          cardId,
          cost: costs.get(cardId),
          point,
        }));
      if (
        eligibleCount !== expectedEligible.length ||
        canonicalJson(replayFields.eligibleCandidates.value) !==
          canonicalJson(expectedEligible)
      ) {
        throw new TypeError(
          "snapshot eligible candidates do not match their causal observation",
        );
      }
      let choiceIndex = replayFields.choiceIndex.value;
      let proposal = replayFields.proposal.value;
      if (eligibleCount === 0) {
        if (choiceIndex !== null || proposal !== null) {
          throw new TypeError("empty replay decisions cannot contain a choice");
        }
      } else {
        choiceIndex = assertSafeInteger(
          choiceIndex,
          `snapshot.replay[${index}].choiceIndex`,
          0,
          eligibleCount - 1,
        );
        const expectedChoice = controller.#rng.int(eligibleCount);
        if (choiceIndex !== expectedChoice) {
          throw new TypeError("snapshot replay does not match its seeded RNG");
        }
        proposal = validateProposal(proposal, tick, proposalSequence);
        const selected = expectedEligible[choiceIndex];
        if (
          proposal.cardId !== selected.cardId ||
          proposal.point.x !== selected.point.x ||
          proposal.point.y !== selected.point.y
        ) {
          throw new TypeError(
            "snapshot proposal does not match its seeded eligible candidate",
          );
        }
        proposalSequence += 1;
      }
      replay.push(isolated({
        choiceIndex,
        eligibleCandidates: expectedEligible,
        eligibleCount,
        observation: {
          legalNorthDeployments: observation.legalNorthDeployments,
          northCardCosts: observation.northCardCosts,
          northElixir: observation.northElixir,
          northHand: observation.northHand,
        },
        proposal,
        tick,
      }));
      expectedDecisionTick += thinkIntervalTicks;
    }
    const expectedDecisionCount =
      nextTick <= thinkOffsetTicks
        ? 0
        : Math.floor((nextTick - 1 - thinkOffsetTicks) / thinkIntervalTicks) + 1;
    if (
      replay.length !== expectedDecisionCount ||
      proposalSequence !== nextSequence ||
      new TextEncoder().encode(canonicalJson(replay)).length >
        OPPONENT_CONTROLLER_MAX_REPLAY_BYTES
    ) {
      throw new TypeError("snapshot replay is incomplete or noncontiguous");
    }
    const restoredRng = SeededRandom.restore(fields.rng.value);
    if (canonicalJson(restoredRng.serialize()) !== canonicalJson(controller.#rng.serialize())) {
      throw new TypeError("snapshot RNG state does not match its replay");
    }

    controller.#nextTick = nextTick;
    controller.#nextSequence = nextSequence;
    controller.#replay = replay;
    controller.#rng = restoredRng;
    return controller;
  }

  #isThinkTick(tick) {
    return (
      tick >= this.#thinkOffsetTicks &&
      (tick - this.#thinkOffsetTicks) % this.#thinkIntervalTicks === 0
    );
  }
}
