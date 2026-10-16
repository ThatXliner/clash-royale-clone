import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { createSessionTroopWitness } from "../src/content/session-troop-roster.js";
import {
  createSessionTroopStatusRuntimeProfiles,
} from "../src/content/session-troop-status-runtime-profiles.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";
import {
  parseSessionTroopStatusRuntimeProfiles,
  serializeSessionTroopStatusRuntimeProfiles,
  SessionTroopStatusRuntime,
} from "../src/sim/session-troop-status-runtime.js";

const STATUS_IDS = Object.freeze([
  "aegis-sage",
  "bloom-wisp",
  "dawnmender",
  "pulse-sentry",
  "railward",
  "rime-adept",
  "tether-rider",
  "veil-prowler",
]);
const EXECUTABLE = Object.freeze([
  Object.freeze({ actionId: "heal", id: "bloom-wisp", target: "source" }),
  Object.freeze({ actionId: "heal", id: "dawnmender", target: "source" }),
  Object.freeze({ actionId: "stun", id: "pulse-sentry", target: "enemy" }),
  Object.freeze({ actionId: "slow", id: "rime-adept", target: "enemy" }),
  Object.freeze({ actionId: "snare", id: "tether-rider", target: "enemy" }),
  Object.freeze({ actionId: "hide", id: "veil-prowler", target: null }),
]);
const SOUTH_POINT = Object.freeze({ x: 3_500, y: 14_500 });
const NORTH_POINT = Object.freeze({ x: 3_500, y: 17_500 });

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function clone(value) {
  return structuredClone(value);
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function findWitnessSeed(id, roster) {
  const deck = roster.map(({ id: cardId }) => cardId);
  const cards = new Map(roster.map((card) => [card.id, card]));
  for (let seed = 0; seed < 10_000; seed += 1) {
    const south = new DeckCycle({ deck, seed: `${seed}:south` }).state.hand;
    const north = new DeckCycle({ deck, seed: `${seed}:north` }).state.hand;
    if (!south.includes(id)) continue;
    const targetCard = north.find((cardId) => cardId !== id && cards.get(cardId)?.kind === "unit");
    if (targetCard !== undefined) return { deck, seed, targetCard };
  }
  throw new Error(`could not find a bounded deterministic deck witness for ${id}`);
}

function setupObject(id, { legalNorthDeployments = null, seed = null } = {}) {
  const witness = createSessionTroopWitness(id);
  const selected = findWitnessSeed(id, witness.roster);
  const chosenSeed = seed ?? selected.seed;
  const northCard = legalNorthDeployments === null
    ? new DeckCycle({ deck: selected.deck, seed: `${chosenSeed}:north` }).state.hand
      .find((cardId) => cardId !== id && witness.roster.some((card) =>
        card.id === cardId && card.kind === "unit"))
    : null;
  const legal = legalNorthDeployments ?? [{ cardId: northCard, point: NORTH_POINT }];
  return {
    battleSetup: canonical(witness),
    deck: selected.deck,
    legalNorthDeployments: legal,
    rosterWitness: canonical({ questions: witness.questions, roster: witness.roster }),
    seed: chosenSeed,
    startingElixir: { north: 10, south: 10 },
    statusRuntimeProfiles: createSessionTroopStatusRuntimeProfiles(),
    thinkIntervalTicks: 1_000,
    thinkOffsetTicks: 0,
  };
}

function makeSession(id) {
  const setup = setupObject(id);
  const session = new GameSession(canonical(setup));
  const slot = session.state.decks.south.hand.indexOf(id);
  assert.notEqual(slot, -1, `${id} must be in the admitted hand`);
  return { session, setup, slot };
}

function deployWitness(session, id, slot) {
  session.submitPlayerCommand(canonical({
    cardId: id,
    commandId: 0,
    point: SOUTH_POINT,
    slot,
    tick: session.state.tick,
    type: "deploy",
  }));
  session.step();
  const units = session.state.battle.units;
  const source = units.find((unit) => unit.side === "south" && unit.cardId === id);
  const target = units.find((unit) => unit.side === "north" && unit.alive);
  assert.ok(source, `${id} source must materialize through GameSession`);
  assert.ok(target, `${id} witness must have a materialized opposing target`);
  return { source, target };
}

function statusCommand({ actionId, commandId, sourceId, targetId, tick }) {
  return canonical({
    actionId,
    commandId,
    point: null,
    side: "south",
    sourceId,
    targetId,
    tick,
    type: "status",
  });
}

function statusReceipts(session) {
  return session.replay.filter((event) => event.type === "session-status");
}

function statusEffects(session) {
  return session.state.battle.statusRuntime.effects;
}

test("game roster troop status: the exact eight identities and sourced executable facts are admitted", () => {
  const receipt = createSessionTroopStatusRuntimeProfiles();
  assert.deepEqual(receipt.profiles.map(({ id }) => id), STATUS_IDS);
  assert.equal(receipt.profiles.find(({ id }) => id === "railward").questionReceipt, null);
  assert.equal(receipt.profiles.find(({ id }) => id === "aegis-sage").composition.mode,
    "membership-only");

  const serialized = serializeSessionTroopStatusRuntimeProfiles(receipt);
  assert.equal(serialized, canonical(receipt));
  assert.deepEqual(parseSessionTroopStatusRuntimeProfiles(serialized), receipt);
  const runtime = new SessionTroopStatusRuntime(serialized);
  assert.deepEqual(runtime.inspect({
    actionId: "heal", cardId: "bloom-wisp", sourceId: 1, targetId: 2,
  }), { effect: "heal", parameters: { amount: 240 } });
  assert.deepEqual(runtime.inspect({
    actionId: "slow", cardId: "rime-adept", sourceId: 1, targetId: 2,
  }), { effect: "slow", parameters: {
    attackRate: { denominator: 20, numerator: 13 },
    durationTicks: 60,
    movementRate: { denominator: 20, numerator: 13 },
  } });
  assert.deepEqual(runtime.inspect({
    actionId: "hide", cardId: "veil-prowler", sourceId: 1, targetId: null,
  }), { effect: "hide", parameters: { durationTicks: 12 } });
  assert.throws(() => runtime.inspect({
    actionId: "shield", cardId: "railward", sourceId: 1, targetId: null,
  }), /QUESTION/u);
  assert.throws(() => runtime.inspect({
    actionId: "reflection", cardId: "aegis-sage", sourceId: 1, targetId: 2,
  }), /QUESTION/u);
});

test("game roster troop status: setup receipt mutations reject atomically before a session is exposed", () => {
  const base = setupObject("bloom-wisp");
  const mutations = [
    (value) => { value.statusRuntimeProfiles.profiles[1].sourceRecord.cost += 1; },
    (value) => { value.statusRuntimeProfiles.profiles.pop(); },
    (value) => { value.statusRuntimeProfiles.profiles.reverse(); },
    (value) => { value.statusRuntimeProfiles.profiles[1].metadata = "forged"; },
    (value) => { value.statusRuntimeProfiles.manifest = value.statusRuntimeProfiles.manifest.replace("version", "versioN"); },
  ];
  for (const mutate of mutations) {
    const hostile = clone(base);
    mutate(hostile);
    assert.throws(() => new GameSession(canonical(hostile)), /status|canonical|diverge|manifest/u);
  }

  let getterReads = 0;
  const accessor = Object.create(Object.prototype, {
    manifest: { enumerable: true, get() { getterReads += 1; return base.statusRuntimeProfiles.manifest; } },
    profiles: { enumerable: true, value: base.statusRuntimeProfiles.profiles },
    version: { enumerable: true, value: 1 },
  });
  assert.throws(() => serializeSessionTroopStatusRuntimeProfiles(accessor), /data property|shape/u);
  assert.equal(getterReads, 0);
});

test("game roster troop status: heal changes shared authoritative health once, caps, and restores exactly", () => {
  const { session, slot } = makeSession("bloom-wisp");
  const { source } = deployWitness(session, "bloom-wisp", slot);
  let damaged = session.state.battle.units.find(({ id }) => id === source.id);
  for (let count = 0; count < 300 && damaged.alive && damaged.hitpoints === damaged.maxHealth; count += 1) {
    session.step();
    damaged = session.state.battle.units.find(({ id }) => id === source.id);
  }
  assert.ok(damaged.alive);
  assert.ok(damaged.hitpoints < damaged.maxHealth);
  const beforeHealth = damaged.hitpoints;
  const beforeElixir = session.state.elixir.sides.south.amount;
  const beforeHand = clone(session.state.decks.south.hand);
  session.submitPlayerCommand(statusCommand({
    actionId: "heal", commandId: 1, sourceId: source.id, targetId: source.id,
    tick: session.state.tick,
  }));
  const events = session.step();
  const heals = events.filter(({ type }) => type === "heal");
  assert.equal(heals.length, 1);
  assert.equal(heals[0].appliedAmount, damaged.maxHealth - beforeHealth);
  assert.equal(session.state.battle.units.find(({ id }) => id === source.id).hitpoints,
    damaged.maxHealth);
  assert.equal(session.state.elixir.sides.south.amount, beforeElixir);
  assert.deepEqual(session.state.decks.south.hand, beforeHand);
  assert.equal(statusReceipts(session).length, 1);
  assert.equal(statusReceipts(session)[0].status.status, "applied");

  const snapshot = session.serialize();
  const restored = GameSession.restore(snapshot);
  assert.equal(restored.serialize(), snapshot);
  session.stepMany(12);
  restored.stepMany(12);
  assert.equal(restored.serialize(), session.serialize());
  assert.equal(restored.replayBytes(), session.replayBytes());
});

for (const spec of EXECUTABLE.filter(({ id }) => id !== "bloom-wisp")) {
  test(`game roster troop status: ${spec.id} applies its shared ${spec.actionId} boundary`, () => {
    const { session, slot } = makeSession(spec.id);
    const { source, target } = deployWitness(session, spec.id, slot);
    const beforeElixir = clone(session.state.elixir);
    const beforeDeck = clone(session.state.decks.south);
    session.submitPlayerCommand(statusCommand({
      actionId: spec.actionId,
      commandId: 1,
      sourceId: source.id,
      targetId: spec.target === "enemy" ? target.id : spec.target === null ? null : source.id,
      tick: session.state.tick,
    }));
    const applied = session.step();
    const receipts = statusReceipts(session);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].status.effect, spec.actionId);
    assert.ok(["applied", "capped"].includes(receipts[0].status.status));
    assert.equal(applied.filter(({ type }) => type === "troop-status-receipt").length, 1,
      "the shared battle emits one causal status receipt");
    assert.equal(session.state.elixir.sides.north.amount, beforeElixir.sides.north.amount);
    assert.equal(session.state.elixir.sides.south.amount, beforeElixir.sides.south.amount);
    assert.deepEqual(session.state.decks.south, beforeDeck);

    const effects = statusEffects(session);
    const effect = effects.find(({ targetId }) => targetId ===
      (spec.target === "enemy" ? target.id : source.id));
    if (spec.actionId === "heal") {
      assert.equal(effect, undefined, "instant heal leaves no active status slot");
    } else if (spec.actionId === "hide") {
      assert.ok(effect);
      assert.deepEqual(effect.hides, [{ applyTick: 1, expiryTick: 12, sourceId: source.id }]);
    } else {
      assert.ok(effect);
      assert.equal(effect[spec.actionId].applyTick, 1);
      assert.equal(effect[spec.actionId].expiryTick,
        spec.actionId === "stun" ? 30 : spec.actionId === "slow" ? 60 : 90);
    }

    const snapshot = session.serialize();
    const restored = GameSession.restore(snapshot);
    assert.equal(restored.serialize(), snapshot);
    session.stepMany(8);
    restored.stepMany(8);
    assert.equal(restored.serialize(), session.serialize());
    assert.equal(restored.replayBytes(), session.replayBytes());
  });
}

test("game roster troop status: invisibility reveal is command-first and preserves the hide receipt", () => {
  const { session, slot } = makeSession("veil-prowler");
  const { source } = deployWitness(session, "veil-prowler", slot);
  session.submitPlayerCommand(statusCommand({
    actionId: "hide", commandId: 1, sourceId: source.id, targetId: null,
    tick: session.state.tick,
  }));
  session.step();
  session.submitPlayerCommand(statusCommand({
    actionId: "reveal", commandId: 2, sourceId: source.id, targetId: null,
    tick: session.state.tick,
  }));
  session.step();
  const effect = statusEffects(session).find(({ targetId }) => targetId === source.id);
  assert.ok(effect);
  assert.equal(effect.hides.length, 1);
  assert.equal(effect.revealUntil, 5);
  assert.deepEqual(statusReceipts(session).map(({ status }) => status.effect), ["hide", "reveal"]);
});

for (const unresolved of [
  Object.freeze({ actionId: "reflection", id: "aegis-sage" }),
  Object.freeze({ actionId: "shield", id: "railward" }),
]) {
  test(`game roster troop status: ${unresolved.id} rejects its visible QUESTION with zero mutation`, () => {
    const { session, slot } = makeSession(unresolved.id);
    const { source } = deployWitness(session, unresolved.id, slot);
    const beforeBytes = session.serialize();
    const beforeState = session.state;
    assert.throws(() => session.submitPlayerCommand(statusCommand({
      actionId: unresolved.actionId,
      commandId: 1,
      sourceId: source.id,
      targetId: null,
      tick: session.state.tick,
    })), /QUESTION/u);
    assert.equal(session.serialize(), beforeBytes);
    assert.deepEqual(session.state, beforeState);
  });
}

test("game roster troop status: deterministic session continuation hashes stay stable", () => {
  const expectedHashes = Object.freeze({
    "bloom-wisp": Object.freeze({
      replay: "c910889cfedec9476105f42111dc2528cd508164ef3bb6a015712b24a0604b86",
      snapshot: "552625d664701401763e78aeb1b3b8ce79b2abaa41142b71eb45c98046d4dfd9",
    }),
    dawnmender: Object.freeze({
      replay: "32ca31c6a29c77928845992163841293862c8c9ee458c53530ea7d367d541be7",
      snapshot: "c7ee4536c9ca885fde04ef99b149fca31e8c138cc9cf9fc96c5ec03b4ff75a2e",
    }),
    "pulse-sentry": Object.freeze({
      replay: "b21f4742b539a0ebfdc6d0a90444901f3b754a032684391fc2d6186e4ef04138",
      snapshot: "711028fb73a858df0546bb847b038b40238823fa71d2bf3ad9b1f4bad279b3e0",
    }),
    "rime-adept": Object.freeze({
      replay: "b7743ef309caefcac631e0b51881df9082ac38b3cf9fc027338612bddd7eef1a",
      snapshot: "96ea0ac365b8fb70a65c19eaeb940812a385fc05a580a2aa5621bda2e9502d92",
    }),
    "tether-rider": Object.freeze({
      replay: "42195da81ea1add834995f2d16d807d2160794ca5c82d3e961abd18813b4562b",
      snapshot: "67221b82e6885ae4417dd7019d41c5e778c34038dac4cccd010eed166224c0b5",
    }),
    "veil-prowler": Object.freeze({
      replay: "53039869e13dc2e1be0d01d114b7a365f8329ed6d568ed19b865200d3cfab75b",
      snapshot: "e184782f3d14d389ef97dea893f9db469095e7f4e0326024b238233419c312e3",
    }),
  });
  const hashes = [];
  for (const id of ["bloom-wisp", "dawnmender", "pulse-sentry", "rime-adept", "tether-rider", "veil-prowler"]) {
    const { session, setup, slot } = makeSession(id);
    const { source, target } = deployWitness(session, id, slot);
    session.submitPlayerCommand(statusCommand({
      actionId: id === "bloom-wisp" || id === "dawnmender" ? "heal" : id === "pulse-sentry" ? "stun" :
        id === "rime-adept" ? "slow" : id === "tether-rider" ? "snare" : "hide",
      commandId: 1,
      sourceId: source.id,
      targetId: id === "veil-prowler" ? null : id === "bloom-wisp" || id === "dawnmender" ? source.id : target.id,
      tick: session.state.tick,
    }));
    session.stepMany(10);
    const replayBytes = session.replayBytes();
    const snapshotBytes = session.serialize();
    const replayEvents = session.replay;
    const state = session.state;
    const record = {
      id,
      setup,
      battleSetup: JSON.parse(setup.battleSetup),
      rosterWitness: JSON.parse(setup.rosterWitness),
      replayBytes,
      replayObject: JSON.parse(replayBytes),
      replayEvents,
      state,
      snapshotBytes,
      snapshot: JSON.parse(snapshotBytes),
    };
    writeFileSync(join(process.env.GTC_STATUS_VIEW_DIR, `${id}.json`),
      `${JSON.stringify(record, null, 2)}\n`);
    hashes.push({ id, replay: hash(replayBytes), snapshot: hash(snapshotBytes) });
  }
  assert.deepEqual(hashes, Object.entries(expectedHashes).map(([id, values]) => ({
    id,
    replay: values.replay,
    snapshot: values.snapshot,
  })));
  assert.equal(new Set(hashes.map(({ replay, snapshot }) => `${replay}:${snapshot}`)).size, hashes.length);
  assert.equal(hashes.length, 6);
});
