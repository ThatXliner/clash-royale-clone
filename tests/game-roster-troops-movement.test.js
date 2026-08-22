import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createSessionTroopMovementRuntimeProfiles,
  serializeSessionTroopMovementRuntimeProfiles,
} from "../src/content/session-troop-movement-runtime-profiles.js";
import {
  createSessionTroopWitness,
  serializeSessionTroopWitness,
} from "../src/content/session-troop-roster.js";
import { serializeSessionTroopProjectileProfileManifest } from
  "../src/content/session-troop-projectile-profiles.js";
import { serializeSessionTroopStatusRuntimeProfiles } from
  "../src/content/session-troop-status-runtime-profiles.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";
import { LiveBattle, parseLiveBattleSetup } from "../src/sim/live-battle.js";
import {
  SESSION_TROOP_RUNTIME_MOVEMENT_VERSION,
  SessionTroopRuntime,
} from "../src/sim/session-troop-runtime.js";

const SOUTH = Object.freeze({ x: 3_500, y: 14_500 });
const NORTH = Object.freeze({ x: 3_500, y: 17_500 });
const DIAGONAL_NORTH = Object.freeze({ x: 4_500, y: 17_500 });
const PROFILE_IDS = Object.freeze([
  "cinderback", "copperskiff", "emberlance", "railward", "skymaul",
  "stonevault", "veilrunner", "wayfinder",
]);
const FLIGHT_IDS = Object.freeze(["copperskiff", "skymaul"]);
const NON_FLIGHT_HTMP_IDS = Object.freeze([
  "cinderback", "emberlance", "railward", "stonevault", "veilrunner", "wayfinder",
]);
const ORDINARY_GROUND_IDS = Object.freeze([
  "coilblade", "mossguard", "brassbolt", "reedsting", "briar-band", "cinderlings",
]);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function liveBattle(id, movementReceipt) {
  return new LiveBattle(
    parseLiveBattleSetup(serializeSessionTroopWitness(id)),
    arguments.length < 2 ? serializeSessionTroopMovementRuntimeProfiles() : movementReceipt,
  );
}

function ordinaryLiveBattle(id) {
  return new LiveBattle(parseLiveBattleSetup(serializeSessionTroopWitness(id)));
}

function deploy(battle, { cardId, point, sequence, side, tick = 0 }) {
  return battle.scheduleDeploy(canonical({ cardId, point, sequence, side, tick }));
}

function deployDiagonalPair(battle, sourceCardId, targetCardId = "coilblade") {
  deploy(battle, { cardId: sourceCardId, point: SOUTH, sequence: 0, side: "south" });
  deploy(battle, {
    cardId: targetCardId,
    point: DIAGONAL_NORTH,
    sequence: 1,
    side: "north",
  });
}

function sharedOrdinarySnapshotBytes(battle) {
  const snapshot = JSON.parse(battle.serialize());
  if (Object.hasOwn(snapshot, "runtime")) {
    delete snapshot.runtime;
    delete snapshot.troopStatuses;
    snapshot.version = 2;
  }
  return canonical(snapshot);
}

function sharedOrdinaryStateBytes(battle) {
  const { troopRuntime: ignored, ...state } = battle.state;
  void ignored;
  return canonical(state);
}

function sessionSetup(id) {
  const witness = createSessionTroopWitness(id);
  return canonical({
    battleSetup: canonical(witness),
    deck: witness.roster.map(({ id: cardId }) => cardId),
    legalNorthDeployments: [{ cardId: witness.roster[0].id, point: NORTH }],
    rosterWitness: canonical({ questions: witness.questions, roster: witness.roster }),
    seed: 1,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 3_600,
    thinkOffsetTicks: 0,
    troopRuntimeProfiles: createSessionTroopMovementRuntimeProfiles(),
  });
}

function submitTarget(session, id) {
  const slot = session.state.decks.south.hand.indexOf(id);
  assert.notEqual(slot, -1, `${id} must be in the deterministic south hand`);
  session.submitPlayerCommand(canonical({
    cardId: id,
    commandId: 0,
    point: SOUTH,
    slot,
    tick: 0,
    type: "deploy",
  }));
}

test("troop movement runtime: the closed HTMP receipt admits all eight profiles and only flight reduces", () => {
  const bytes = serializeSessionTroopMovementRuntimeProfiles();
  assert.equal(Buffer.byteLength(bytes), 78_025);
  assert.equal(createHash("sha256").update(bytes).digest("hex"),
    "57a423d4e07a433c9ba677e0dc8a518176da45b2d1d986a02d68cf2c7bb4c57e");
  const runtime = new SessionTroopRuntime(bytes);
  assert.equal(runtime.version, SESSION_TROOP_RUNTIME_MOVEMENT_VERSION);
  assert.deepEqual(runtime.state.profiles.map(({ id }) => id), PROFILE_IDS);
  assert.equal(PROFILE_IDS.reduce((total, id) => total + runtime.movementProfile(id).claims.length, 0), 9);
  assert.equal(runtime.movementProfile("emberlance").claims.length, 2);
  assert.equal(runtime.movementProfile("railward").claims[0].unresolvedOnly, true);
  assert.deepEqual(runtime.flightProfile("copperskiff"), {
    cardId: "copperskiff",
    claimFamily: "flight",
    layer: "air",
    pathScope: "axis-aligned-only",
    sourceRecordCanonical: runtime.flightProfile("copperskiff").sourceRecordCanonical,
    speed: 1_500,
  });
  assert.deepEqual(runtime.reduce({
    phase: "pre-move",
    sources: [
      { cardId: "skymaul", side: "north", sourceId: 1 },
      { cardId: "copperskiff", side: "south", sourceId: 2 },
      { cardId: "emberlance", side: "south", sourceId: 3 },
    ],
    tick: 7,
  }), [
    {
      cardId: "skymaul", claimFamily: "flight", kind: "flight", layer: "air",
      pathScope: "axis-aligned-only", phase: "pre-move", side: "north", sourceId: 1,
      tick: 7, type: "troop-runtime-intent",
    },
    {
      cardId: "copperskiff", claimFamily: "flight", kind: "flight", layer: "air",
      pathScope: "axis-aligned-only", phase: "pre-move", side: "south", sourceId: 2,
      tick: 7, type: "troop-runtime-intent",
    },
  ]);
  const question = runtime.inspectMovement({
    cardId: "emberlance",
    claimFamily: "charge-knockback-membership",
    phase: "pre-move",
    side: "south",
    sourceId: 3,
    tick: 7,
    type: "troop-movement",
  });
  assert.equal(Object.isFrozen(question), true);
  assert.equal(question.disposition, "question");
  assert.equal(question.type, "troop-movement-question");
  assert.equal(question.questionKeys.includes("chargeKnockbackInteraction"), false);
  assert.match(question.reason, /composition/u);
});

test("troop movement runtime: the exact Mossguard/Coilblade diagonal regression is ordinary-host byte-identical", () => {
  const profiled = liveBattle("mossguard");
  const control = ordinaryLiveBattle("mossguard");
  deployDiagonalPair(profiled, "mossguard");
  deployDiagonalPair(control, "mossguard");

  assert.equal(sharedOrdinarySnapshotBytes(profiled), control.serialize(),
    "v4 receipt is inert before the ordinary tick");
  const expectedEvents = control.step();
  const actualEvents = profiled.step();
  assert.deepEqual(actualEvents, expectedEvents,
    "ordinary diagonal movement emits the exact pre-v4 host events");
  assert.equal(profiled.state.tick, 1);
  assert.equal(sharedOrdinaryStateBytes(profiled), sharedOrdinaryStateBytes(control));
  assert.equal(sharedOrdinarySnapshotBytes(profiled), control.serialize(),
    "v4 ordinary snapshot differs only by its closed receipt witness");
  assert.equal(actualEvents.filter(({ type }) => type === "troop-runtime-receipt" ||
    type === "troop-movement-question").length, 0);
  assert.deepEqual(profiled.state.units.map(({ id, cardId, hitpoints, movement, position }) => ({
    cardId, hitpoints, id, movement, position,
  })), control.state.units.map(({ id, cardId, hitpoints, movement, position }) => ({
    cardId, hitpoints, id, movement, position,
  })));
});

test("troop movement runtime: every non-flight HTMP and ordinary HTO ground witness stays off the v4 flight path", () => {
  const ids = [...new Set([...NON_FLIGHT_HTMP_IDS, ...ORDINARY_GROUND_IDS])];
  for (const id of ids) {
    const targetCardId = id === "coilblade" ? "mossguard" : "coilblade";
    const profiled = liveBattle(id);
    const control = ordinaryLiveBattle(id);
    deployDiagonalPair(profiled, id, targetCardId);
    deployDiagonalPair(control, id, targetCardId);

    const actualEvents = profiled.step();
    const expectedEvents = control.step();
    assert.deepEqual(actualEvents, expectedEvents, `${id} ordinary events`);
    assert.equal(sharedOrdinaryStateBytes(profiled), sharedOrdinaryStateBytes(control),
      `${id} ordinary state`);
    assert.equal(sharedOrdinarySnapshotBytes(profiled), control.serialize(),
      `${id} ordinary snapshot`);
    assert.equal(actualEvents.filter(({ type }) => type === "troop-runtime-receipt" ||
      type === "troop-movement-question").length, 0, `${id} has no v4 movement receipt`);
    assert.ok(profiled.state.units.every(({ movement }) => movement.mode === "ground"),
      `${id} remains on the ordinary ground movement mode`);
  }
});

test("troop movement runtime: ordinary-only v4/control differential preserves 320 ticks, target changes, death, redeploy, restores, forks, and chunks", () => {
  const makePair = () => ({
    control: ordinaryLiveBattle("mossguard"),
    profiled: liveBattle("mossguard"),
  });
  const seedPair = () => {
    const pair = makePair();
    deployDiagonalPair(pair.profiled, "mossguard");
    deployDiagonalPair(pair.control, "mossguard");
    return pair;
  };
  const maybeRedeploy = (battle) => {
    if (battle.state.tick === 319 && battle.state.units.some(({ id, alive }) => id === 1 && !alive)) {
      return deploy(battle, {
        cardId: "mossguard",
        point: { x: 5_500, y: 14_500 },
        sequence: 2,
        side: "south",
        tick: battle.state.tick,
      });
    }
    return null;
  };
  const direct = seedPair();
  const checkpoints = new Set([1, 120, 300, 318, 319, 320]);
  for (let count = 0; count < 320; count += 1) {
    const expectedEvents = direct.control.step();
    const actualEvents = direct.profiled.step();
    assert.deepEqual(actualEvents, expectedEvents,
      `ordinary event at tick ${direct.control.state.tick}`);
    const controlRedeploy = maybeRedeploy(direct.control);
    const profiledRedeploy = maybeRedeploy(direct.profiled);
    assert.deepEqual(profiledRedeploy, controlRedeploy,
      `ordinary redeploy at tick ${direct.control.state.tick}`);
    if (checkpoints.has(direct.control.state.tick)) {
      assert.equal(sharedOrdinaryStateBytes(direct.profiled),
        sharedOrdinaryStateBytes(direct.control), `ordinary state at ${direct.control.state.tick}`);
      assert.equal(sharedOrdinarySnapshotBytes(direct.profiled), direct.control.serialize(),
        `ordinary bytes at ${direct.control.state.tick}`);
    }
  }
  assert.equal(direct.control.state.tick, 320);
  assert.equal(direct.profiled.state.tick, 320);
  assert.deepEqual(direct.profiled.events, direct.control.events,
    "ordinary v4 emits no additional events");
  assert.deepEqual(direct.profiled.replay, direct.control.replay,
    "ordinary v4 replay is unchanged");
  assert.ok(direct.profiled.events.some(({ type, targetId }) => type === "death" && targetId === 1));
  assert.ok(direct.profiled.events.some(({ type, sequence }) => type === "deploy-scheduled" && sequence === 2));
  assert.ok(direct.profiled.events.some(({ type, attackerId }) => type === "attack" && attackerId === 1));
  assert.ok(direct.profiled.events.some(({ type, targetId }) => type === "damage" && targetId === 2));
  assert.equal(sharedOrdinarySnapshotBytes(direct.profiled), direct.control.serialize());

  const advanceTo = (battle, targetTick, chunked = false) => {
    while (battle.state.tick < targetTick) {
      const nextBoundary = battle.state.tick < 319 ? 319 : targetTick;
      const amount = chunked
        ? Math.min(17, targetTick - battle.state.tick, nextBoundary - battle.state.tick)
        : 1;
      if (amount === 1) battle.step();
      else battle.stepMany(amount);
      maybeRedeploy(battle);
    }
  };
  for (const cut of [0, 319]) {
    const pair = seedPair();
    advanceTo(pair.profiled, cut);
    advanceTo(pair.control, cut);
    const restoredProfiled = LiveBattle.restore(pair.profiled.serialize());
    const restoredControl = LiveBattle.restore(pair.control.serialize());
    assert.equal(sharedOrdinarySnapshotBytes(restoredProfiled), restoredControl.serialize(),
      `restore cut ${cut} preserves ordinary bytes`);
    advanceTo(restoredProfiled, 320);
    advanceTo(restoredControl, 320);
    assert.equal(sharedOrdinarySnapshotBytes(restoredProfiled), restoredControl.serialize(),
      `restore cut ${cut} preserves final ordinary bytes`);
    assert.deepEqual(restoredProfiled.events, restoredControl.events,
      `restore cut ${cut} preserves ordinary events`);
  }

  const chunked = seedPair();
  advanceTo(chunked.profiled, 150, true);
  advanceTo(chunked.control, 150, true);
  const forkedProfiled = chunked.profiled.fork();
  const forkedControl = chunked.control.fork();
  advanceTo(forkedProfiled, 320, true);
  advanceTo(forkedControl, 320, true);
  assert.equal(sharedOrdinarySnapshotBytes(forkedProfiled), forkedControl.serialize(),
    "forked chunked ordinary bytes remain identical");
  assert.deepEqual(forkedProfiled.events, forkedControl.events,
    "forked chunked ordinary events remain identical");
  assert.equal(sharedOrdinaryStateBytes(forkedProfiled), sharedOrdinaryStateBytes(direct.control),
    "fork/chunk result matches the direct ordinary state");
});

test("troop movement runtime: mixed diagonal ground paths coexist with exactly one v4 intent per flyer", () => {
  const profiled = liveBattle("mossguard");
  const control = ordinaryLiveBattle("mossguard");
  const deployments = [
    { cardId: "mossguard", point: SOUTH, sequence: 0, side: "south" },
    { cardId: "coilblade", point: DIAGONAL_NORTH, sequence: 1, side: "north" },
    { cardId: "skymaul", point: { x: 1_500, y: 14_500 }, sequence: 2, side: "south" },
    { cardId: "copperskiff", point: { x: 1_500, y: 17_500 }, sequence: 3, side: "north" },
  ];
  for (const battle of [profiled, control]) {
    for (const command of deployments) deploy(battle, command);
  }
  const actualEvents = profiled.step();
  const expectedEvents = control.step();
  const receipts = actualEvents.filter(({ type }) => type === "troop-runtime-receipt");
  assert.deepEqual(receipts.map(({ cardId, kind, sourceId }) => ({ cardId, kind, sourceId })), [
    { cardId: "skymaul", kind: "flight", sourceId: 3 },
    { cardId: "copperskiff", kind: "flight", sourceId: 4 },
  ]);
  assert.equal(actualEvents.filter(({ type }) => type === "troop-runtime-receipt" ||
    type === "troop-movement-question").length, FLIGHT_IDS.length);
  assert.equal(expectedEvents.filter(({ type }) => type === "troop-runtime-receipt").length, 0);
  assert.deepEqual(actualEvents.filter(({ type }) => type !== "troop-runtime-receipt"), expectedEvents,
    "ordinary diagonal events remain the control path");
  for (const id of [1, 2]) {
    const actual = profiled.state.units.find(({ id: candidate }) => candidate === id);
    const expected = control.state.units.find(({ id: candidate }) => candidate === id);
    assert.deepEqual(actual, expected, `ordinary unit ${id} remains unchanged`);
  }
  assert.ok(profiled.state.units.filter(({ cardId }) => FLIGHT_IDS.includes(cardId))
    .every(({ movement }) => movement.mode === "air"));
});

test("troop movement runtime: both admitted flyers reject diagonal paths atomically", () => {
  for (const id of FLIGHT_IDS) {
    const battle = liveBattle(id);
    deploy(battle, { cardId: id, point: { x: 5_500, y: 14_500 }, sequence: 0, side: "south" });
    const before = battle.serialize();
    assert.throws(() => battle.step(), /axis-aligned/u, `${id} rejects a diagonal flight target`);
    assert.equal(battle.state.tick, 0, `${id} rejection is trap-zero`);
    assert.equal(battle.serialize(), before, `${id} rejection is byte-atomic`);
  }
});

test("troop movement runtime: wrong-card, layer, and source aliases cannot cross the flight boundary", () => {
  const setupMutations = [
    ["ordinary layer", "mossguard", (witness) => {
      witness.roster.find(({ id }) => id === "mossguard").entities[0].layer = "air";
    }],
    ["ordinary card alias", "mossguard", (witness) => {
      const card = witness.roster.find(({ id }) => id === "mossguard");
      card.id = "skymaul";
      card.displayName = "Skymaul";
    }],
    ["ordinary archetype alias", "mossguard", (witness) => {
      const entity = witness.roster.find(({ id }) => id === "mossguard").entities[0];
      entity.archetypeId = "skymaul";
      entity.displayName = "Skymaul";
    }],
    ["flyer layer alias", "skymaul", (witness) => {
      witness.roster.find(({ id }) => id === "skymaul").entities[0].layer = "ground";
    }],
    ["flyer card alias", "skymaul", (witness) => {
      const card = witness.roster.find(({ id }) => id === "skymaul");
      card.id = "mossguard";
      card.displayName = "Mossguard";
    }],
  ];
  for (const [label, id, mutate] of setupMutations) {
    const witness = clone(createSessionTroopWitness(id));
    mutate(witness);
    assert.throws(() => new LiveBattle(
      parseLiveBattleSetup(canonical(witness)),
      serializeSessionTroopMovementRuntimeProfiles(),
    ), /diverge|identity|ordinary|roster|policy/u, label);
  }

  for (const [id, point] of [["mossguard", { x: 5_500, y: 14_500 }], ["skymaul", SOUTH]]) {
    const battle = liveBattle(id);
    deploy(battle, { cardId: id, point, sequence: 0, side: "south" });
    battle.step();
    const before = battle.serialize();
    const snapshotMutations = [
      (snapshot) => {
        snapshot.history.find(({ type }) => type === "deploy").command.cardId =
          id === "mossguard" ? "skymaul" : "mossguard";
      },
      (snapshot) => { snapshot.history.find(({ type }) => type === "deploy").command.side = "north"; },
      (snapshot) => { snapshot.movements[0].id = 2; },
      (snapshot) => {
        const movement = JSON.parse(snapshot.movements[0].bytes);
        movement.state.mode = id === "mossguard" ? "air" : "ground";
        snapshot.movements[0].bytes = canonical(movement);
      },
    ];
    for (const mutate of snapshotMutations) {
      const forged = JSON.parse(before);
      mutate(forged);
      assert.throws(() => LiveBattle.restore(canonical(forged)),
        /causal|deployment|flight|witnesses/u, `${id} forged snapshot`);
      assert.equal(battle.serialize(), before, `${id} restore rejection is atomic`);
    }
  }

  const flyer = liveBattle("skymaul");
  deploy(flyer, { cardId: "skymaul", point: SOUTH, sequence: 0, side: "south" });
  flyer.step();
  for (const command of [
    { cardId: "mossguard", claimFamily: "flight", phase: "pre-move", side: "south",
      sourceId: 1, tick: flyer.state.tick, type: "troop-movement" },
    { cardId: "skymaul", claimFamily: "flight", phase: "pre-move", side: "north",
      sourceId: 1, tick: flyer.state.tick, type: "troop-movement" },
    { cardId: "skymaul", claimFamily: "flight", phase: "pre-move", side: "south",
      sourceId: 2, tick: flyer.state.tick, type: "troop-movement" },
  ]) {
    const before = flyer.serialize();
    assert.throws(() => flyer.scheduleTroopMovement(canonical(command)), /causal|source/u);
    assert.equal(flyer.serialize(), before, "forged flyer source admission is trap-zero");
  }
});

test("troop movement runtime: every legal GameSession witness projects flight through shared IDs, layer, tick, and history", () => {
  for (const id of PROFILE_IDS) {
    const session = new GameSession(sessionSetup(id));
    submitTarget(session, id);
    const before = session.serialize();
    session.stepMany(1);
    const unit = session.state.battle.units.find(({ cardId }) => cardId === id);
    assert.ok(unit, `${id} materialized through the shared battle`);
    assert.equal(unit.id, 1);
    assert.equal(unit.layer, id === "copperskiff" || id === "skymaul" ? "air" :
      unit.layer);
    assert.equal(session.state.battle.tick, 1);
    assert.equal(session.state.battle.troopRuntime.configuration.version, 4);
    if (id === "copperskiff" || id === "skymaul") {
      assert.equal(unit.movement.mode, "air");
      assert.equal(unit.movement.speed, id === "copperskiff" ? 1_500 : 1_000);
      assert.ok(unit.movement.commands.length >= 1);
    }
    assert.notEqual(session.serialize(), before);
  }
});

test("troop movement runtime: GameSession restore cuts retain the v4 shared flying battle", () => {
  const direct = new GameSession(sessionSetup("skymaul"));
  submitTarget(direct, "skymaul");
  const expectedEvents = direct.stepMany(12);
  const expectedBytes = direct.serialize();
  const expectedState = direct.state;
  const chunked = new GameSession(sessionSetup("skymaul"));
  submitTarget(chunked, "skymaul");
  const actualEvents = [
    ...chunked.stepMany(1),
    ...chunked.stepMany(4),
    ...chunked.stepMany(7),
  ];
  assert.deepEqual(actualEvents, expectedEvents);
  assert.equal(chunked.serialize(), expectedBytes);
  for (const cut of [0, 1, 3, 8, 12]) {
    const partial = new GameSession(sessionSetup("skymaul"));
    submitTarget(partial, "skymaul");
    partial.stepMany(cut);
    const restored = GameSession.restore(partial.serialize());
    assert.equal(restored.serialize(), partial.serialize(), `GameSession bytes at cut ${cut}`);
    restored.stepMany(12 - cut);
    assert.equal(restored.serialize(), expectedBytes, `GameSession restore bytes at cut ${cut}`);
    assert.deepEqual(restored.state, expectedState, `GameSession restore state at cut ${cut}`);
  }
});

test("troop movement runtime: two flying IDs share host movement and restore byte identity", () => {
  const battle = liveBattle("skymaul");
  deploy(battle, { cardId: "skymaul", point: SOUTH, sequence: 0, side: "south" });
  deploy(battle, { cardId: "copperskiff", point: NORTH, sequence: 1, side: "north" });
  const one = battle.stepMany(1);
  assert.deepEqual(battle.state.units.map(({ id }) => id), [1, 2]);
  assert.deepEqual(battle.state.units.map(({ layer }) => layer), ["air", "air"]);
  assert.deepEqual(battle.state.units.map(({ movement }) => movement.mode), ["air", "air"]);
  assert.equal(one.filter(({ type }) => type === "troop-runtime-receipt").length, 2);
  const pending = battle.serialize();
  const direct = LiveBattle.restore(pending);
  const chunked = LiveBattle.restore(pending);
  const forked = LiveBattle.restore(pending).fork();
  const directEvents = direct.stepMany(8);
  assert.deepEqual([...chunked.step(), ...chunked.stepMany(7)], directEvents);
  assert.deepEqual(forked.stepMany(8), directEvents);
  assert.equal(direct.serialize(), chunked.serialize());
  assert.equal(direct.serialize(), forked.serialize());
  assert.deepEqual(direct.state, chunked.state);
  assert.deepEqual(direct.state, forked.state);
  assert.equal(JSON.parse(pending).version, 31);
  assert.equal(LiveBattle.restore(pending).state.tick, 1);
  assert.ok(direct.state.units.some(({ movement }) =>
    movement.position.x !== movement.initialPosition.x ||
    movement.position.y !== movement.initialPosition.y));
  assert.equal(direct.state.units[0].id, 1);
  assert.equal(direct.state.units[1].id, 2);
});

test("troop movement runtime: v4 movement coexists with status/projectile snapshots", () => {
  const projectileReceipt = serializeSessionTroopProjectileProfileManifest();
  const battle = new LiveBattle(
    parseLiveBattleSetup(serializeSessionTroopWitness("aegis-sage")),
    serializeSessionTroopMovementRuntimeProfiles(),
    serializeSessionTroopStatusRuntimeProfiles(),
    projectileReceipt,
  );
  deploy(battle, { cardId: "skymaul", point: SOUTH, sequence: 0, side: "south" });
  battle.stepMany(4);
  const pending = battle.serialize();
  assert.equal(JSON.parse(pending).version, 35);
  assert.ok(Object.hasOwn(JSON.parse(pending), "projectileRuntime"));
  const restored = LiveBattle.restore(pending, projectileReceipt);
  assert.equal(restored.serialize(), pending);
  assert.equal(restored.state.units.find(({ cardId }) => cardId === "skymaul").movement.mode, "air");
  assert.equal(battle.fork().serialize(), pending);
});

test("troop movement runtime: every unsourced movement/form family is a frozen QUESTION before host mutation", () => {
  const claims = {
    cinderback: ["recoil"],
    copperskiff: ["flight"],
    emberlance: ["charge-knockback-membership", "charge"],
    railward: ["shield-form"],
    skymaul: ["flight"],
    stonevault: ["jump"],
    veilrunner: ["dash"],
    wayfinder: ["retarget"],
  };
  for (const id of PROFILE_IDS) {
    const battle = liveBattle(id);
    deploy(battle, { cardId: id, point: SOUTH, sequence: 0, side: "south" });
    battle.step();
    for (const claimFamily of claims[id]) {
      const before = battle.serialize();
      const result = battle.inspectTroopMovement(canonical({
        cardId: id,
        claimFamily,
        phase: "pre-move",
        side: "south",
        sourceId: 1,
        tick: battle.state.tick,
        type: "troop-movement",
      }));
      if (claimFamily === "flight") {
        assert.equal(result.disposition, "admitted");
        assert.equal(result.type, "troop-movement-admission");
        assert.deepEqual(battle.scheduleTroopMovement(canonical({
          cardId: id,
          claimFamily,
          phase: "pre-move",
          side: "south",
          sourceId: 1,
          tick: battle.state.tick,
          type: "troop-movement",
        })), result);
      } else {
        assert.equal(result.disposition, "question");
        assert.equal(result.type, "troop-movement-question");
        assert.equal(Object.isFrozen(result), true);
        assert.ok(result.questionKeys.length > 0);
        assert.throws(() => battle.scheduleTroopMovement(canonical({
          cardId: id,
          claimFamily,
          phase: "pre-move",
          side: "south",
          sourceId: 1,
          tick: battle.state.tick,
          type: "troop-movement",
        })), /QUESTION/u);
      }
      assert.equal(battle.serialize(), before,
        `${id}/${claimFamily} inspection and rejection are mutation-free`);
    }
  }
});

test("troop movement runtime: forged receipts, roster drift, stale commands, and hostile boundaries reject atomically", () => {
  const base = createSessionTroopMovementRuntimeProfiles();
  const hostile = [
    (value) => { value.profiles[0].id = "skymaul"; },
    (value) => { value.profiles.reverse(); },
    (value) => { value.profiles[0].claims.push({ claimFamily: "flight", exportName: "forged" }); },
    (value) => { value.manifest = value.manifest.replace("cinderback", "cinderback-x"); },
    (value) => { value.version = 1; },
  ];
  for (const mutate of hostile) {
    const forged = clone(base);
    mutate(forged);
    assert.throws(() => new SessionTroopRuntime(canonical(forged)),
      /HTMP|receipt|canonical|unsupported|profile|byte|diverge|occurrences/u);
  }
  const witness = createSessionTroopWitness("skymaul");
  const driftedWitness = clone(witness);
  driftedWitness.roster.find(({ id }) => id === "skymaul").damage += 1;
  assert.throws(() => new LiveBattle(
    parseLiveBattleSetup(canonical(driftedWitness)),
    serializeSessionTroopMovementRuntimeProfiles(),
  ), /diverges|HTMP/u);

  const battle = liveBattle("skymaul");
  deploy(battle, { cardId: "skymaul", point: SOUTH, sequence: 0, side: "south" });
  battle.step();
  const malformed = [
    { cardId: "skymaul", claimFamily: "flight", phase: "pre-move", side: "north",
      sourceId: 1, tick: battle.state.tick, type: "troop-movement" },
    { cardId: "skymaul", claimFamily: "flight", phase: "pre-move", side: "south",
      sourceId: 2, tick: battle.state.tick, type: "troop-movement" },
    { cardId: "skymaul", claimFamily: "flight", phase: "pre-move", side: "south",
      sourceId: 1, tick: battle.state.tick + 1, type: "troop-movement" },
    { cardId: "skymaul", claimFamily: "charge", phase: "pre-move", side: "south",
      sourceId: 1, tick: battle.state.tick, type: "troop-movement" },
    { cardId: "skymaul", claimFamily: "flight", phase: "combat", side: "south",
      sourceId: 1, tick: battle.state.tick, type: "troop-movement" },
  ];
  for (const command of malformed) {
    const before = battle.serialize();
    assert.throws(() => battle.inspectTroopMovement(canonical(command)),
      /causal|live|current|admitted|claim|pre-move/u);
    assert.equal(battle.serialize(), before, "hostile movement inspection is byte-atomic");
  }
  let traps = 0;
  const proxy = new Proxy({}, {
    get() { traps += 1; throw new Error("movement command proxy observed"); },
    getPrototypeOf() { traps += 1; throw new Error("movement command proxy observed"); },
    ownKeys() { traps += 1; throw new Error("movement command proxy observed"); },
  });
  const accessor = {};
  Object.defineProperty(accessor, "type", {
    enumerable: true,
    get() { traps += 1; throw new Error("movement command accessor observed"); },
  });
  assert.throws(() => battle.inspectTroopMovement(proxy), /canonical JSON text/u);
  assert.throws(() => battle.inspectTroopMovement(accessor), /canonical JSON text/u);
  assert.equal(traps, 0, "movement command objects are rejected before observation");
  const beforeZero = battle.serialize();
  assert.deepEqual(battle.stepMany(0), []);
  assert.equal(battle.serialize(), beforeZero);
  assert.throws(() => battle.stepMany(18_001), /tick|bound/u);
  assert.equal(battle.serialize(), beforeZero);
  const runtime = new SessionTroopRuntime(serializeSessionTroopMovementRuntimeProfiles());
  assert.throws(() => runtime.reduce({
    phase: "pre-move",
    sources: [
      { cardId: "skymaul", side: "south", sourceId: 1 },
      { cardId: "copperskiff", side: "north", sourceId: 1 },
    ],
    tick: 0,
  }), /unique/u);
  assert.throws(() => runtime.reduce({
    phase: "pre-move",
    sources: [
      { cardId: "copperskiff", side: "north", sourceId: 2 },
      { cardId: "skymaul", side: "south", sourceId: 1 },
    ],
    tick: 0,
  }), /canonical source order/u);
});

test("troop movement runtime: sourced flight shares ordinary combat/death and target retargeting without changing the control host", () => {
  const profiled = liveBattle("skymaul");
  const control = new LiveBattle(parseLiveBattleSetup(serializeSessionTroopWitness("skymaul")));
  for (const battle of [profiled, control]) {
    deploy(battle, { cardId: "skymaul", point: SOUTH, sequence: 0, side: "south" });
    deploy(battle, { cardId: "copperskiff", point: NORTH, sequence: 1, side: "north" });
  }
  const events = profiled.stepMany(300);
  control.stepMany(300);
  assert.deepEqual(profiled.state.units, control.state.units);
  assert.deepEqual(profiled.state.towers, control.state.towers);
  assert.deepEqual(profiled.state.projectiles, control.state.projectiles);
  assert.ok(events.some(({ type, targetId }) => type === "death" && targetId === 2));
  const survivor = profiled.state.units.find(({ id }) => id === 1);
  assert.ok(survivor?.alive);
  assert.ok(survivor.movement.commands.length >= 2,
    "the shared flying movement history records initial targeting and retargeting");
  assert.notDeepEqual(survivor.movement.target?.position, { x: 3_500, y: 17_500 });
  assert.equal(profiled.state.units.map(({ id }) => id).join(","), "1,2");
});
