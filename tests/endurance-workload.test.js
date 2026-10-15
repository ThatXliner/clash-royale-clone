import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createEditableGameSessionSetup } from "../src/content/editable-deck.js";
import { GameSession } from "../src/sim/game-session.js";
import {
  createSelectedEnduranceWorkloadPolicy,
  createEnduranceWorkloadPolicy,
  ENDURANCE_BASELINE_INTERVAL_TICKS,
  ENDURANCE_REQUIRED_TICK,
  assertEnduranceWorkloadCanContinue,
  exactBrackenwheelEnduranceSetupBytes,
  exactEnduranceSetupBytes,
  exactKilnkeeperEnduranceSetupBytes,
  BRACKENWHEEL_ENDURANCE_DECK,
  KILNKEEPER_ENDURANCE_DECK,
  normalizedWorkloadCommand,
  plannedSouthAttempt,
} from "./helpers/endurance-workload.js";

const TERMINAL_REPLAY = new URL(
  "../artifacts/game001gpr5-round-2/builder/derived-checkpoint-manifest.json",
  import.meta.url,
);
const AGGREGATE_SETUP_SHA256 = "306bb30da40ce7c43d6cccce8728449da90fc0e9ca7d13c81f0116ba710aec8c";
const KILNKEEPER_SETUP_SHA256 = "9b2a1c5a86c2d5c0c2d623389b69c465409e65d5d84988591630b980ee7b3ba9";
const DEFAULT_DECISION_BASELINE = new URL(
  "../artifacts/game001gpx-round-1/builder/default-decision-baseline.json",
  import.meta.url,
);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

test("the integrated workload keeps the exact setup and frozen 300-tick baseline", () => {
  const setupBytes = exactEnduranceSetupBytes();
  assert.equal(setupBytes.length, 39_641);
  assert.equal(createHash("sha256").update(setupBytes).digest("hex"), AGGREGATE_SETUP_SHA256);

  const session = new GameSession(setupBytes);
  const policy = createEnduranceWorkloadPolicy();
  assert.equal(policy.plan(session), null,
    "the reaction scheduler does not invent an opening action outside the baseline boundary");
  session.stepMany(ENDURANCE_BASELINE_INTERVAL_TICKS);

  const baseline = plannedSouthAttempt(session);
  assert.ok(baseline, "the original defensive planner has an eligible 300-tick decision");
  assert.deepEqual(policy.plan(session), { ...baseline, decision: "frozen-GH-baseline" },
    "the integrated policy preserves the original baseline card, slot, point, and tick");
  assert.deepEqual(policy.snapshot(), { emergencyDecisionTicks: [] },
    "baseline decisions do not consume the overtime emergency cooldown");
});

test("selected-source profiles preserve pre-adaptation default snapshots and commands", () => {
  const baseline = JSON.parse(readFileSync(DEFAULT_DECISION_BASELINE, "utf8"));
  const setupBytes = exactEnduranceSetupBytes();
  assert.equal(createHash("sha256").update(setupBytes).digest("hex"), baseline.setupSha256);
  assert.equal(baseline.baselineSource.capturedBeforeGPXChanges, true);

  const legacy = new GameSession(setupBytes);
  const selected = new GameSession(setupBytes);
  const legacyPolicy = createEnduranceWorkloadPolicy();
  const selectedPolicy = createSelectedEnduranceWorkloadPolicy({ setupBytes });
  for (const expected of baseline.snapshots) {
    while (legacy.state.tick < expected.tick) legacy.stepMany(15);
    while (selected.state.tick < expected.tick) selected.stepMany(15);
    const legacyBytes = legacy.serialize();
    const selectedBytes = selected.serialize();
    assert.equal(legacyBytes, selectedBytes,
      `legacy and selected-source sessions have identical bytes at tick ${expected.tick}`);
    assert.equal(createHash("sha256").update(legacyBytes).digest("hex"),
      expected.snapshotSha256, `pre-adaptation snapshot hash matches at tick ${expected.tick}`);
    assert.equal(legacyBytes.length, expected.snapshotBytes);

    const legacyPlan = legacyPolicy.plan(legacy);
    const selectedPlan = selectedPolicy.plan(selected);
    assert.deepEqual(legacyPlan === null ? null : normalizedWorkloadCommand(legacyPlan),
      expected.normalizedCommand,
      `frozen default command matches its saved source baseline at tick ${expected.tick}`);
    assert.deepEqual(selectedPlan === null ? null : normalizedWorkloadCommand(selectedPlan),
      expected.normalizedCommand,
      `setup-derived profile command matches the same baseline at tick ${expected.tick}`);
    assert.deepEqual(selectedPlan, legacyPlan,
      `selected-source policy preserves the exact policy decision at tick ${expected.tick}`);
  }
});

test("Kilnkeeper selected setup drives source-derived planning and real seeded contact", () => {
  const setupBytes = exactKilnkeeperEnduranceSetupBytes();
  assert.equal(createHash("sha256").update(setupBytes).digest("hex"), KILNKEEPER_SETUP_SHA256);
  assert.equal(createEditableGameSessionSetup(KILNKEEPER_ENDURANCE_DECK, 0), setupBytes,
    "the scenario uses the canonical editable-deck setup, not a private profile patch");
  const setup = JSON.parse(setupBytes);
  const battleSetup = JSON.parse(setup.battleSetup);
  const card = battleSetup.roster.find(({ id }) => id === "kilnkeeper");
  assert.ok(card, "the selected authenticated roster contains Kilnkeeper");
  assert.equal(setup.thinkIntervalTicks, 60,
    "the seeded AI uses the actual selected-deck cadence");

  const session = new GameSession(setupBytes);
  const policy = createSelectedEnduranceWorkloadPolicy({ setupBytes });
  assert.equal(policy.plan(session), null);
  const initial = session.state;
  const slot = initial.decks.south.hand.indexOf(card.id);
  assert.ok(slot >= 0, "Kilnkeeper is in the seed-zero player opening hand");
  const command = { cardId: card.id, commandId: 1,
    point: { x: 9_000, y: 10_000 }, slot, tick: 0, type: "deploy" };
  const admission = session.submitPlayerCommand(canonical(command));
  assert.equal(admission.accepted, true);
  session.stepMany(1);

  const southDeployment = session.replay.find((entry) => entry.type === "session-deployed" &&
    entry.side === "south" && entry.deployment.cardId === card.id);
  assert.ok(southDeployment, "the actual player deployment enters the canonical transcript");
  assert.equal(southDeployment.spend.cost, card.cost,
    "the spend uses the admitted selected-roster cost");
  assert.equal(session.state.decks.south.sequence, initial.decks.south.sequence + 1,
    "the initial card play advances the canonical deck cycle once");
  assert.equal(session.state.decks.south.hand.includes(card.id), false,
    "the played Kilnkeeper leaves the active hand after the cycle");

  let aiDeployment = null;
  let aiEntityId = null;
  let positionAfterPursuit = null;
  let aiImpact = null;
  while (session.state.tick < 600 && !session.state.terminal) {
    session.stepMany(1);
    if (aiDeployment === null) {
      aiDeployment = session.replay.find((entry) => entry.type === "session-deployed" &&
        entry.side === "north" && entry.deployment.cardId === card.id) ?? null;
      aiEntityId = aiDeployment?.deployment.entityIds?.[0] ?? null;
    }
    if (aiEntityId !== null && session.state.tick === 300) {
      const unit = session.state.battle.units.find(({ id }) => id === aiEntityId);
      assert.ok(unit?.alive, "the AI Kilnkeeper remains alive while following its target");
      positionAfterPursuit = unit.position;
      assert.notDeepEqual(positionAfterPursuit, aiDeployment.deployment.point,
        "the launched unit follows its live path from the legal deployment point");
    }
    if (aiEntityId !== null) {
      aiImpact = session.replay.find((entry) => entry.type === "projectile-impact" &&
        entry.sourceId === aiEntityId && entry.status === "contact") ?? aiImpact;
    }
  }
  assert.ok(aiDeployment, "the seeded north AI launches Kilnkeeper from its selected hand");
  assert.equal(aiDeployment.deployment.tick, 60,
    "the AI launch occurs on the configured 60-tick decision boundary");
  assert.ok(aiEntityId !== null);
  assert.ok(positionAfterPursuit, "the actual AI Kilnkeeper moved before projectile contact");
  assert.ok(aiImpact, "the actual shared battle records Kilnkeeper projectile contact");
  assert.equal(aiImpact.projectileIdentity.sourceId, aiEntityId);
  assert.equal(aiImpact.projectileIdentity.projectileId, aiImpact.projectileId);
  assert.ok(aiImpact.tick >= aiDeployment.deployment.tick);
});

test("Brackenwheel selected setup preserves seed-two native-deck evidence and natural area contact", () => {
  const setupBytes = exactBrackenwheelEnduranceSetupBytes();
  const setupSha256 = createHash("sha256").update(setupBytes).digest("hex");
  assert.equal(setupSha256,
    "2207fce9a5a9c64ebca77acd12bae175bfcc0e05ddb94886b7354ccc50f1a15b");
  assert.equal(createEditableGameSessionSetup(BRACKENWHEEL_ENDURANCE_DECK, 2), setupBytes,
    "the scenario uses the canonical accepted editable-deck setup");
  const acceptedSession = new GameSession(setupBytes);
  assert.equal(canonical(JSON.parse(acceptedSession.serialize()).setup), setupBytes,
    "GameSession accepts and retains the exact canonical scenario setup");
  const setup = JSON.parse(setupBytes);
  const roster = JSON.parse(setup.battleSetup).roster;
  const brackenwheel = roster.find(({ id }) => id === "brackenwheel");
  assert.deepEqual(setup.deck, [
    "brackenwheel", "briar-band", "coilblade", "mossguard",
    "ironroot", "copperskiff", "brassbolt", "reedsting",
  ]);
  assert.equal(setup.seed, 2);
  assert.equal(setup.thinkIntervalTicks, 60);
  assert.equal(setup.legalNorthDeployments.length, 8,
    "the ordinary setup retains every seeded AI legal card instead of forcing its choice");
  assert.deepEqual(setup.legalNorthDeployments.map(({ cardId }) => cardId).sort(),
    [...BRACKENWHEEL_ENDURANCE_DECK].sort());
  assert.equal(brackenwheel.cost, 4);
  const wrongSeed = createEditableGameSessionSetup(BRACKENWHEEL_ENDURANCE_DECK, 3);
  assert.notEqual(createHash("sha256").update(wrongSeed).digest("hex"), setupSha256,
    "a valid but wrong-seed setup cannot pass the browser scenario's frozen SHA gate");

  const session = new GameSession(setupBytes);
  const policy = createSelectedEnduranceWorkloadPolicy({ setupBytes });
  assert.equal(policy.plan(session), null);
  const opening = session.state;
  const slot = opening.decks.south.hand.indexOf(brackenwheel.id);
  assert.ok(slot >= 0, "the actual seed-two player hand offers Brackenwheel");
  assert.ok(opening.decks.north.hand.includes(brackenwheel.id),
    "the same seeded AI opening hand can select Brackenwheel without a forced card");
  const command = { cardId: brackenwheel.id, commandId: 1,
    point: { x: 3_500, y: 14_500 }, slot, tick: 0, type: "deploy" };
  assert.equal(session.submitPlayerCommand(canonical(command)).accepted, true);
  session.stepMany(1);

  const southDeployment = session.replay.find((entry) => entry.type === "session-deployed" &&
    entry.side === "south" && entry.deployment.cardId === brackenwheel.id);
  assert.ok(southDeployment, "the player deployment enters the canonical session transcript");
  assert.equal(southDeployment.spend.cost, brackenwheel.cost);
  assert.equal(southDeployment.spend.amountAfter, opening.elixir.sides.south.amount - 4);
  assert.equal(session.state.decks.south.sequence, opening.decks.south.sequence + 1,
    "the paid four-cost deployment advances the player cycle once");
  assert.equal(session.state.decks.south.hand.includes(brackenwheel.id), false,
    "the paid Brackenwheel leaves the player hand through normal cycling");

  const northDeployment = session.replay.find((entry) => entry.type === "session-deployed" &&
    entry.side === "north" && entry.deployment.cardId === brackenwheel.id);
  assert.ok(northDeployment, "the seeded AI selects through its unforced legal setup");
  assert.equal(northDeployment.deployment.tick, 0);
  assert.equal(northDeployment.spend.cost, brackenwheel.cost);
  assert.equal(session.state.decks.north.sequence, 1,
    "the natural AI deployment advances its own card cycle once");

  while (session.state.tick < 235 && !session.state.terminal) session.stepMany(1);
  assert.equal(session.state.tick, 235,
    "the natural selected-deck continuation reaches the public RL contact boundary");
  const southEntityId = southDeployment.deployment.entityIds[0];
  const northEntityId = northDeployment.deployment.entityIds[0];
  const primary = session.replay.find((entry) => entry.type === "damage" &&
    entry.attackerId === southEntityId && entry.targetId === northEntityId &&
    entry.tick === 234);
  assert.ok(primary, "the player's Brackenwheel records its primary contact at tick 234");
  assert.equal(primary.amount, brackenwheel.damage);
  const secondaries = session.replay.filter((entry) => entry.type === "damage" &&
    entry.attackerId === southEntityId && entry.tick === 234 &&
    entry.meleeAreaPolicyVersion === "melee-area-question-v1");
  assert.deepEqual(secondaries.map(({ targetId }) => targetId), [4, 5, 6],
    "the same natural contact resolves each eligible secondary once in entity order");
  assert.ok(secondaries.every(({ amount }) => amount === brackenwheel.damage));
  session.stepMany(65);
  assert.equal(session.state.tick, 300);
  assert.doesNotThrow(() => policy.plan(session),
    "the selected-source policy remains usable at the unchanged 300-tick boundary");
});

test("selected workload rejects unsupported, incomplete, and noncanonical setups", () => {
  const mixedDeck = [...KILNKEEPER_ENDURANCE_DECK];
  mixedDeck[0] = "squall-orb";
  const mixedSetup = createEditableGameSessionSetup(mixedDeck, 0);
  assert.throws(() => createSelectedEnduranceWorkloadPolicy({ setupBytes: mixedSetup }),
    /missing or unsupported unit profile/u,
    "an admitted mixed deck with a spell cannot silently receive a troop-only forecast");

  const validSetup = exactKilnkeeperEnduranceSetupBytes();
  assert.throws(() => createSelectedEnduranceWorkloadPolicy({ setupBytes: `${validSetup} ` }),
    /canonical JSON text/u,
    "noncanonical setup bytes are rejected rather than normalized into a guessed profile");
  assert.throws(() => createSelectedEnduranceWorkloadPolicy({ setupBytes: undefined }),
    /canonical JSON text/u,
    "missing authenticated setup bytes do not fall back to default profiles");
});

test("incremental preview matches accepted commands and resets cleanly at a rewind", () => {
  const session = new GameSession(exactEnduranceSetupBytes());
  const policy = createEnduranceWorkloadPolicy();
  assert.equal(policy.plan(session), null);
  session.stepMany(15);

  const beforePreview = session.serialize();
  const forecast = policy.nextPlannedAttempt(session, 300);
  assert.equal(session.serialize(), beforePreview,
    "the 15-tick reaction look-ahead advances a detached GameSession clone");
  assert.equal(forecast.ticksAhead, 285);
  assert.equal(forecast.plan.tick, 300);
  session.stepMany(forecast.ticksAhead);

  const acceptedPlan = policy.plan(session);
  assert.deepEqual(acceptedPlan, forecast.plan,
    "the live baseline decision equals the forecast at the exact boundary");
  const command = { cardId: acceptedPlan.cardId, point: acceptedPlan.point,
    slot: acceptedPlan.slot, tick: acceptedPlan.tick, commandId: 1, type: "deploy" };
  assert.equal(session.submitPlayerCommand(canonical(command)).accepted, true);
  assert.equal(policy.recordAcceptedPhysicalDelivery(command), true,
    "an accepted input is copied into the private forecast branch");

  const beforeReaction = session.serialize();
  assert.equal(policy.nextPlannedAttempt(session, 15), null);
  assert.equal(session.serialize(), beforeReaction,
    "forecast stepping never advances the live session");
  session.stepMany(15);
  assert.equal(policy.plan(session), null,
    "the live state matches the forecast after its accepted command and reaction span");

  const cutBytes = session.serialize();
  assert.equal(policy.nextPlannedAttempt(session, 15), null);
  policy.restore({ emergencyDecisionTicks: [] });
  const restored = GameSession.restore(cutBytes);
  assert.equal(policy.plan(restored), null,
    "restore clears forecast expectations from the branch that was rewound");
  assert.equal(restored.serialize(), cutBytes);
});

test("cooldown history can rewind to a prior prefix and rejects unordered history", () => {
  const policy = createEnduranceWorkloadPolicy({ emergencyDecisionTicks: [900] });
  const prefix = policy.snapshot();
  const branch = { emergencyDecisionTicks: [900, 1_200] };
  assert.equal(policy.restore(branch), true);
  branch.emergencyDecisionTicks.push(1_500);
  assert.deepEqual(policy.snapshot(), { emergencyDecisionTicks: [900, 1_200] },
    "policy state owns a copy of the restored branch history");
  assert.equal(policy.restore(prefix), true);
  assert.deepEqual(policy.snapshot(), prefix,
    "restoring the canonical cut removes cooldown state from an abandoned branch");
  assert.throws(() => policy.restore({ emergencyDecisionTicks: [900, 600] }),
    /snapshot is invalid/u, "unordered decision history cannot become cooldown authority");
});

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
  assert.throws(() => assertEnduranceWorkloadCanContinue(terminalSession, ENDURANCE_REQUIRED_TICK),
    /ended naturally at tick 13351 before required tick 18000 \(overtime_sudden_death; north won\)/,
    "the unchanged full-duration requirement still rejects the old workload");
});
