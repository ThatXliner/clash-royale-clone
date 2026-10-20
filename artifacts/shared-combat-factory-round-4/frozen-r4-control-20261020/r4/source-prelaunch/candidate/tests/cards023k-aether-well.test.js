import assert from "node:assert/strict";
import test from "node:test";
import { createEditableGameSessionSetup } from "../src/content/editable-deck.js";
import { projectSessionNonUnitBattleCard } from "../src/content/session-card-catalog.js";
import { GAME_SESSION_MAX_BATCH_TICKS, GameSession } from "../src/sim/game-session.js";

const DECK = Object.freeze([
  "aether-well",
  "mossguard",
  "copperskiff",
  "skymaul",
  "brassbolt",
  "reedsting",
  "briar-band",
  "cinderlings",
]);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sessionWithOpeningAether() {
  const session = new GameSession(createEditableGameSessionSetup(DECK, 2));
  const state = session.state;
  const slot = state.decks.south.hand.indexOf("aether-well");
  assert.notEqual(slot, -1, "seed 2 gives the player Aether Well in the opening hand");
  assert.ok(state.decks.north.hand.includes("aether-well"),
    "seed 2 gives the seeded controller a natural Aether Well candidate");
  session.submitPlayerCommand(canonical({
    cardId: "aether-well",
    commandId: 0,
    point: { x: 3_500, y: 14_500 },
    slot,
    tick: 0,
    type: "deploy",
  }));
  return session;
}

function stepWithPattern(session, tickCount, pattern) {
  const events = [];
  let remaining = tickCount;
  let index = 0;
  while (remaining > 0) {
    const count = Math.min(remaining, GAME_SESSION_MAX_BATCH_TICKS,
      pattern[index % pattern.length]);
    events.push(...session.stepMany(count));
    remaining -= count;
    index += 1;
  }
  return events;
}

test("CARDS-023K admits a real Aether Well player and seeded AI lifecycle", () => {
  const direct = sessionWithOpeningAether();
  const chunked = sessionWithOpeningAether();
  const openingEvents = direct.stepMany(1);
  assert.deepEqual(chunked.stepMany(1), openingEvents);
  const deployments = direct.replay.filter(({ materialization, type }) =>
    materialization?.cardId === "aether-well" && type === "session-structure-deployed");
  assert.deepEqual(deployments.map(({ side, spend }) => ({
    amountAfter: spend.amountAfter,
    cost: spend.cost,
    side,
  })).sort((left, right) => left.side.localeCompare(right.side)), [
    { amountAfter: 4, cost: 6, side: "north" },
    { amountAfter: 4, cost: 6, side: "south" },
  ], "the player command and unforced seed-2 controller both spend six once");
  assert.equal(direct.state.decks.south.sequence, 1);
  assert.equal(direct.state.decks.north.sequence, 1);
  assert.equal(direct.state.elixir.sides.south.amount, 4);
  assert.equal(direct.state.elixir.sides.north.amount, 4);

  const profile = projectSessionNonUnitBattleCard("aether-well").buildingRuntime;
  assert.equal(profile.class, "resource");
  assert.equal(profile.policy.version, 2);
  for (const [field, value] of [["generationCadenceTicks", 540],
    ["lifetimeTicks", 3_900], ["destructionAmount", 1]]) {
    assert.equal(profile.policy[field].authoritative, true);
    assert.equal(profile.policy[field].confidence, "high");
    assert.equal(profile.policy[field].disposition, "source-aligned");
    assert.equal(profile.policy[field].value, value);
  }
  for (const field of ["generationAmount", "deployTicks", "hitpoints",
    "recipientPolicy", "resourceCapacity", "cadenceAnchorPolicy",
    "cadenceResetPolicy", "expiryOrderingPolicy", "sameTickOrderingPolicy",
    "simultaneousGenerationOrder", "placementPolicy"]) {
    assert.equal(profile.policy[field].authoritative, false,
      `${field} stays closed as non-authoritative profile metadata`);
    assert.equal(profile.policy[field].disposition, "question",
      `${field} stays a QUESTION in the runtime receipt`);
  }
  assert.equal(profile.policy.generationAmount.confidence, "datamine-only");
  assert.equal(profile.policy.deployTicks.confidence, "unverified");
  assert.equal(profile.policy.hitpoints.confidence, "unverified");

  const directEvents = stepWithPattern(direct, 3_897, [GAME_SESSION_MAX_BATCH_TICKS]);
  const chunkedEvents = stepWithPattern(chunked, 3_897, [13, 37, 113, 397, 777, 1_001]);
  assert.deepEqual(chunkedEvents, directEvents,
    "arbitrary deterministic session chunks produce the same events");
  assert.equal(direct.state.tick, 3_898);
  assert.equal(chunked.serialize(), direct.serialize());
  assert.equal(chunked.replayBytes(), direct.replayBytes());

  const checkpoint = direct.serialize();
  const restored = GameSession.restore(checkpoint);
  assert.equal(restored.serialize(), checkpoint);
  assert.deepEqual(restored.stepMany(3), direct.stepMany(3),
    "the tick-3898 fork crosses expiry identically on both branches");
  assert.equal(restored.serialize(), direct.serialize());
  assert.equal(restored.replayBytes(), direct.replayBytes());
  assert.equal(direct.state.tick, 3_901,
    "the tick-3900 expiry transition is observed after advancing from tick 3898 by three steps");

  const replay = direct.replay;
  const materialized = replay.filter(({ cardId, type }) =>
    cardId === "aether-well" && type === "structure-materialized");
  const southId = materialized.find(({ side }) => side === "south").structureId;
  const northId = materialized.find(({ side }) => side === "north").structureId;
  const southDeath = replay.filter(({ buildingId, cause, type }) =>
    buildingId === southId && cause === "combat-damage" && type === "structure-destroyed");
  assert.equal(southDeath.length, 1,
    "the real opponent combat path destroys the south resource structure once");
  const southPayout = replay.filter(({ buildingId, cause, type }) =>
    buildingId === southId && cause === "combat-damage" &&
    type === "building-resource-payout-triggered");
  const southGrant = replay.filter(({ sourceId, side, type }) =>
    sourceId === southId && side === "south" && type === "building-resource-grant");
  const southGranted = replay.filter(({ buildingId, type }) =>
    buildingId === southId && type === "building-resource-granted");
  assert.equal(southPayout.length, 1);
  assert.equal(southGrant.length, 1);
  assert.equal(southGranted.length, 1,
    "the combat death creates one owner-routed grant through shared Elixir");
  assert.equal(southPayout[0].amount, 1);
  assert.equal(southPayout[0].recipientSide, "south");
  assert.equal(southGranted[0].amountRequested, 1);

  const cadenceTicks = replay.filter(({ buildingId, type }) =>
    buildingId === northId && type === "building-resource-cadence-triggered")
    .map(({ tick }) => tick);
  assert.deepEqual(cadenceTicks, [540, 1_080, 1_620, 2_160, 2_700, 3_240, 3_780]);
  const northExpiry = replay.filter(({ buildingId, cause, tick, type }) =>
    buildingId === northId && cause === "expiry" && tick === 3_900 &&
    type === "structure-destroyed");
  const northPayout = replay.filter(({ buildingId, cause, type }) =>
    buildingId === northId && cause === "expiry" &&
    type === "building-resource-payout-triggered");
  const northGrants = replay.filter(({ buildingId, type }) =>
    buildingId === northId && type === "building-resource-granted");
  assert.equal(northExpiry.length, 1,
    "the north resource structure expires once at its source-aligned lifetime");
  assert.equal(northPayout.length, 1);
  assert.equal(northPayout[0].amount, 1);
  assert.equal(northPayout[0].recipientSide, "north");
  assert.equal(northGrants.length, cadenceTicks.length + 1,
    "each observed cadence and the one expiry transition pass through shared Elixir");
  assert.ok([...southGranted, ...northGrants].every(({ amountAfter }) =>
    amountAfter <= profile.policy.resourceCapacity.value),
  "all shared resource grants remain within the QUESTION capacity receipt");
  assert.ok([...southGranted, ...northGrants].every(({ amountGranted, amountRequested }) =>
    amountGranted >= 0 && amountGranted <= amountRequested));

  assert.deepEqual(restored.state, direct.state,
    "the restored branch reproduces the complete final GameSession state");
});
