import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { createPlayableRoster, createPlayableRosterQuestionRecords } from "../src/content/playable-roster.js";
import {
  getSessionCardAdmissionRecord,
  projectSessionNonUnitBattleCard,
} from "../src/content/session-card-catalog.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";
import * as liveBattleModule from "../src/sim/live-battle.js";
import { LiveBattle, parseLiveBattleSetup } from "../src/sim/live-battle.js";
import {
  SESSION_BUILDING_ADMITTED_IDS,
  SESSION_BUILDING_QUESTION_IDS,
  createSessionBuildingRuntime,
  createSessionBuildingCatalog,
} from "../src/sim/session-building-runtime.js";

const SOUTH = Object.freeze({ x: 3_500, y: 14_500 });
const TRAVEL_DESTINATION = Object.freeze({ x: 3_500, y: 12_500 });

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function buildingRoster(cardId) {
  const roster = structuredClone(createPlayableRoster());
  // The catalog’s public projection is frozen. Test fixtures must make a
  // detached copy so they can model hostile caller-supplied canonical bytes.
  roster.splice(0, 1, structuredClone(projectSessionNonUnitBattleCard(cardId)));
  const referenced = new Set(roster.flatMap(({ entities }) => entities.flatMap((entity) =>
    [entity.bodyRadiusPolicy, entity.projectileSpeedPolicy]
      .filter((policy) => policy.kind === "question").map(({ questionKey }) => questionKey))));
  const questions = createPlayableRosterQuestionRecords().filter(({ key }) => referenced.has(key));
  return { questions, roster };
}

function seedFor(deck, cardId) {
  for (let seed = 0; seed < 10_000; seed += 1) {
    if (new DeckCycle({ deck, seed: `${seed}:south` }).state.hand.includes(cardId)) return seed;
  }
  throw new Error(`missing deterministic south hand witness for ${cardId}`);
}

function sessionSetup(cardId) {
  const { questions, roster } = buildingRoster(cardId);
  const deck = roster.map(({ id }) => id);
  return canonical({ battleSetup: canonical({ initialWindupTicks: { central: 0, lane: 0 },
    questions, roster }), deck, legalNorthDeployments: [], rosterWitness: canonical({ questions, roster }),
  seed: seedFor(deck, cardId), startingElixir: { north: 10, south: 10 },
  thinkIntervalTicks: 3_600, thinkOffsetTicks: 0 });
}

/**
 * Fresh-entry witnesses deliberately carry mutable copies.  They model the
 * only caller-controlled route to a building profile: canonical setup text
 * passed directly to parseLiveBattleSetup, LiveBattle, or GameSession.
 */
function freshProfileFixtures(cardId, mutate = () => {}) {
  const { questions, roster } = buildingRoster(cardId);
  const battle = { initialWindupTicks: { central: 0, lane: 0 }, questions, roster };
  const card = battle.roster.find(({ id }) => id === cardId);
  assert.ok(card?.buildingRuntime, `${cardId} must have a catalog runtime receipt`);
  mutate(card.buildingRuntime, card, battle);
  const deck = battle.roster.map(({ id }) => id);
  const battleSetup = canonical(battle);
  const setup = canonical({ battleSetup, deck, legalNorthDeployments: [],
    rosterWitness: canonical({ questions: battle.questions, roster: battle.roster }),
    seed: seedFor(deck, cardId), startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 3_600, thinkOffsetTicks: 0 });
  return { battleSetup, setup };
}

function profileFromFixture(fixture, cardId) {
  const battle = JSON.parse(fixture.battleSetup);
  const card = battle.roster.find(({ id }) => id === cardId);
  assert.ok(card?.buildingRuntime, `${cardId} profile must be present`);
  return card.buildingRuntime;
}

function primitiveProfilePaths(value, prefix = []) {
  if (Array.isArray(value)) return value.flatMap((entry, index) =>
    primitiveProfilePaths(entry, [...prefix, index]));
  if (value !== null && typeof value === "object") return Object.keys(value).flatMap((key) =>
    primitiveProfilePaths(value[key], [...prefix, key]));
  return [prefix];
}

function profileContainerPaths(value, prefix = []) {
  if (Array.isArray(value)) return [{ kind: "array", path: prefix }, ...value.flatMap((entry, index) =>
    profileContainerPaths(entry, [...prefix, index]))];
  if (value !== null && typeof value === "object") {
    return [{ kind: "object", path: prefix }, ...Object.keys(value).flatMap((key) =>
      profileContainerPaths(value[key], [...prefix, key]))];
  }
  return [];
}

function atPath(value, path) {
  return path.reduce((current, key) => current[key], value);
}

function replaceAtPath(value, path, replacement) {
  const parent = atPath(value, path.slice(0, -1));
  parent[path.at(-1)] = replacement;
}

function forgedLeafValue(value) {
  if (value === null) return 0;
  if (typeof value === "boolean") return !value;
  if (typeof value === "number") return value + 1;
  if (typeof value === "string") return `${value}-forged`;
  throw new TypeError("profile leaves must be scalar data");
}

function assertFreshProfileRejected(fixture, label) {
  const beforeBattle = fixture.battleSetup;
  const beforeSession = fixture.setup;
  assert.throws(() => parseLiveBattleSetup(fixture.battleSetup), /canonical session-card receipt/u,
    `${label}: parseLiveBattleSetup`);
  assert.throws(() => new LiveBattle(fixture.battleSetup), /canonical session-card receipt/u,
    `${label}: LiveBattle`);
  assert.throws(() => new GameSession(fixture.setup), /canonical session-card receipt/u,
    `${label}: GameSession`);
  assert.equal(fixture.battleSetup, beforeBattle, `${label}: battle input remained byte-exact`);
  assert.equal(fixture.setup, beforeSession, `${label}: session input remained byte-exact`);
}

function legacyStructureSessionSetup(cardId) {
  const { questions, roster } = buildingRoster(cardId);
  const index = roster.findIndex(({ id }) => id === cardId);
  const legacyCard = { ...roster[index] };
  delete legacyCard.buildingRuntime;
  roster.splice(index, 1, legacyCard);
  const deck = roster.map(({ id }) => id);
  return canonical({ battleSetup: canonical({ initialWindupTicks: { central: 0, lane: 0 },
    questions, roster }), deck, legalNorthDeployments: [], rosterWitness: canonical({ questions, roster }),
  seed: seedFor(deck, cardId), startingElixir: { north: 10, south: 10 },
  thinkIntervalTicks: 3_600, thinkOffsetTicks: 0 });
}

/** A fixed pre-HBA v2 envelope: its structure route had no runtime receipt. */
function legacyStructureSessionSnapshot(cardId) {
  const setup = JSON.parse(legacyStructureSessionSetup(cardId));
  const slot = new DeckCycle({ deck: setup.deck, seed: `${setup.seed}:south` }).state.hand.indexOf(cardId);
  assert.notEqual(slot, -1, "legacy snapshot must retain its deterministic deck slot");
  return canonical({ setup, transcript: [
    { command: { cardId, commandId: 0, point: SOUTH, slot, tick: 0, type: "deploy" }, type: "submit" },
    { type: "step" },
  ], version: 2 });
}

/** The old LiveBattle v2 schema did not include a building witness. */
function legacyLiveBattleSnapshot(cardId) {
  const currentSetup = JSON.parse(sessionSetup(cardId));
  const current = new LiveBattle(parseLiveBattleSetup(currentSetup.battleSetup));
  const snapshot = JSON.parse(current.serialize());
  // A real LiveBattle v2 witness already contains its canonicalized (sorted)
  // setup.  Remove only HBA's new receipt; do not manufacture a differently
  // ordered fresh setup and call it a legacy snapshot.
  const legacySetup = structuredClone(snapshot.setup);
  delete legacySetup.roster.find(({ id }) => id === cardId).buildingRuntime;
  snapshot.setup = legacySetup;
  return canonical(snapshot);
}

/** The exact nested v1 shape used before compact v2 LiveBattle witnesses. */
function legacyLiveBattleV1Snapshot(cardId) {
  const current = JSON.parse(legacyLiveBattleSnapshot(cardId));
  const tower = JSON.parse(current.battle);
  const combat = JSON.parse(tower.combat);
  assert.equal(current.version, 2);
  assert.equal(tower.version, 2);
  assert.equal(combat.version, 2);
  const legacyCombat = { history: combat.history, setup: combat.setup, version: 1 };
  const legacyTower = { combat: canonical(legacyCombat), history: tower.history, setup: tower.setup,
    towers: tower.towers, version: 1 };
  return canonical({ battle: canonical(legacyTower), history: current.history,
    movements: current.movements, setup: current.setup, version: 1 });
}

function sessionFor(cardId) { return new GameSession(sessionSetup(cardId)); }

function runtimeFor(...cardIds) {
  return createSessionBuildingRuntime(canonical({ profiles: cardIds.map((cardId) => {
    const { buildingRuntime } = projectSessionNonUnitBattleCard(cardId);
    return { cardId, profile: buildingRuntime };
  }), version: 1 }));
}

function deploy(session, cardId, commandId = 0, options = {}) {
  const slot = session.state.decks.south.hand.indexOf(cardId);
  assert.notEqual(slot, -1, `${cardId} must have a deterministic deck witness`);
  const command = { cardId, commandId, point: options.point ?? SOUTH, slot,
    tick: session.state.tick, type: "deploy" };
  if (Object.hasOwn(options, "destination")) command.destination = options.destination;
  return session.submitPlayerCommand(canonical(command));
}

function liveFor(cardId, windup = { central: 999, lane: 999 }) {
  const { questions, roster } = buildingRoster(cardId);
  return new LiveBattle(parseLiveBattleSetup(canonical({ initialWindupTicks: windup, questions, roster })));
}

test("game building runtime: pure reducer has no independent session authority and QUESTION identities remain excluded", () => {
  const catalog = createSessionBuildingCatalog();
  const emptyRuntime = runtimeFor();
  const bulwarkRuntime = runtimeFor("bulwark-needle");
  assert.deepEqual(catalog.admitted.map(({ id }) => id), SESSION_BUILDING_ADMITTED_IDS);
  assert.deepEqual(catalog.question.map(({ id }) => id), SESSION_BUILDING_QUESTION_IDS);
  assert.ok(catalog.admitted.every(({ kind }) => kind === "structure"));
  assert.ok(catalog.admitted.filter(({ mechanics }) => mechanics === "defensive")
    .every(({ policyDisposition }) => policyDisposition === "question"),
  "defensive identities stay admitted while their unverified combat policy remains explicit");
  assert.ok(catalog.question.every(({ reason, status }) => status === "question" &&
    reason === "identity-only admission missing kind/cost/deploy fields"));
  assert.deepEqual(emptyRuntime.reduceBoundary(canonical({ structures: [], tick: 0,
    towers: [], units: [] })), { intents: [], tick: 0, version: 1 });

  for (const id of SESSION_BUILDING_QUESTION_IDS) {
    assert.throws(() => getSessionCardAdmissionRecord(id), /explicit QUESTION/u);
    assert.throws(() => bulwarkRuntime.materializePlacement(canonical({ cardId: id,
      destination: null, id: 1, point: SOUTH, side: "south", tick: 0 })), /unknown identity/u);
  }
  let traps = 0;
  const hostile = new Proxy({}, {
    get() { traps += 1; throw new Error("observed"); },
    getPrototypeOf() { traps += 1; throw new Error("observed"); },
    ownKeys() { traps += 1; throw new Error("observed"); },
  });
  assert.throws(() => emptyRuntime.reduceBoundary(hostile), /canonical JSON text/u);
  assert.throws(() => bulwarkRuntime.materializePlacement(hostile), /canonical JSON text/u);
  assert.equal(traps, 0);

  const materialized = bulwarkRuntime.materializePlacement(canonical({ cardId: "bulwark-needle",
    destination: null, id: 1, point: SOUTH, side: "south", tick: 0 }));
  assert.throws(() => bulwarkRuntime.reduceBoundary(canonical({ structures: [{ ...materialized,
    untrusted: true }], tick: 0, towers: [], units: [] })), /invalid shape/u);
  assert.throws(() => bulwarkRuntime.reduceBoundary(canonical({ structures: Array.from({ length: 129 },
    (_, id) => ({ ...materialized, id: id + 1 })), tick: 0, towers: [], units: [] })), /bound/u);
});

test("game building runtime: every fresh entry point accepts only exact catalog profile receipts", () => {
  for (const cardId of SESSION_BUILDING_ADMITTED_IDS) {
    const fixture = freshProfileFixtures(cardId);
    const parsed = parseLiveBattleSetup(fixture.battleSetup);
    assert.deepEqual(profileFromFixture(fixture, cardId),
      projectSessionNonUnitBattleCard(cardId).buildingRuntime, `${cardId}: catalog receipt bytes`);
    if (profileFromFixture(fixture, cardId).class === "defensive") {
      const policy = profileFromFixture(fixture, cardId).policy;
      assert.deepEqual(Object.keys(policy.corpusFields).sort(), [
        "cost", "damage", "deployTicks", "firstHitTicks", "hitSpeedTicks",
        "hitpoints", "maxRange", "mode", "sightRange",
      ].sort(), `${cardId}: source field provenance is carried`);
      assert.equal(policy.disposition, "question", `${cardId}: provisional combat stays QUESTION`);
      assert.equal(policy.confidence, "unverified", `${cardId}: estimates are not promoted`);
    }
    assert.doesNotThrow(() => new LiveBattle(fixture.battleSetup), `${cardId}: direct LiveBattle`);
    assert.doesNotThrow(() => new LiveBattle(parsed), `${cardId}: admitted LiveBattle`);
    assert.doesNotThrow(() => new GameSession(fixture.setup), `${cardId}: GameSession`);
  }
});

test("game building runtime: Bulwark provenance reaches the live structure and cannot be stripped", () => {
  const fixture = freshProfileFixtures("bulwark-needle");
  const projected = profileFromFixture(fixture, "bulwark-needle");
  assert.equal(projected.firstHitTicks, 0, "runtime estimate remains explicit in the profile");
  assert.deepEqual(projected.policy.corpusFields.firstHitTicks, {
    authoritative: false,
    confidence: "unverified",
    source: "pinned-pre-march-2023-building-constants",
    value: null,
  }, "the source's missing first-hit value remains distinguishable from the estimate");
  assert.deepEqual(projected.policy.corpusFields.hitSpeedTicks, {
    authoritative: true,
    confidence: "high",
    source: "pinned-pre-march-2023-building-constants",
    value: 54,
  });
  assert.deepEqual(projected.policy.corpusFields.cost, {
    authoritative: true,
    confidence: "high",
    source: "pinned-pre-march-2023-card-roster-identity",
    value: 3,
  });

  assertFreshProfileRejected(freshProfileFixtures("bulwark-needle", (profile) => {
    delete profile.policy;
  }), "bulwark QUESTION policy stripped");
  assertFreshProfileRejected(freshProfileFixtures("bulwark-needle", (profile) => {
    profile.policy.corpusFields.firstHitTicks.value = 0;
  }), "bulwark source null forged as first-hit zero");
  assertFreshProfileRejected(freshProfileFixtures("bulwark-needle", (profile) => {
    profile.policy.corpusFields.damage.authoritative = true;
  }), "bulwark estimate promoted to authoritative");

  const session = new GameSession(fixture.setup);
  const setupProfile = JSON.parse(JSON.parse(session.serialize()).setup.battleSetup)
    .roster.find(({ id }) => id === "bulwark-needle").buildingRuntime;
  assert.deepEqual(setupProfile.policy, projected.policy,
    "GameSession setup preserves the exact catalog provenance receipt");
  deploy(session, "bulwark-needle");
  session.step();
  const structure = session.state.battle.structures.find(({ cardId }) =>
    cardId === "bulwark-needle");
  assert.deepEqual(structure.policy, projected.policy,
    "the live structure keeps QUESTION provenance beside its provisional combat state");
});

test("game building runtime: fresh admission pins every profile leaf, shape, and card identity", () => {
  // This is the blind-critic reproduction in its exact original form before
  // the exhaustive matrix below: a plausible bulwark number is not enough.
  assertFreshProfileRejected(freshProfileFixtures("bulwark-needle", (profile) => {
    profile.damage = 989;
  }), "bulwark 212-to-989 damage forge");

  const catalogProfiles = new Map(SESSION_BUILDING_ADMITTED_IDS.map((cardId) => {
    const fixture = freshProfileFixtures(cardId);
    return [cardId, profileFromFixture(fixture, cardId)];
  }));
  for (const cardId of SESSION_BUILDING_ADMITTED_IDS) {
    const profile = catalogProfiles.get(cardId);
    for (const path of primitiveProfilePaths(profile)) {
      assertFreshProfileRejected(freshProfileFixtures(cardId, (candidate) => {
        replaceAtPath(candidate, path, forgedLeafValue(atPath(candidate, path)));
      }), `${cardId}: forged ${path.join(".")}`);
    }
    for (const { kind, path } of profileContainerPaths(profile)) {
      if (kind === "object") {
        for (const key of Object.keys(atPath(profile, path))) {
          assertFreshProfileRejected(freshProfileFixtures(cardId, (candidate) => {
            delete atPath(candidate, path)[key];
          }), `${cardId}: missing ${[...path, key].join(".")}`);
        }
        assertFreshProfileRejected(freshProfileFixtures(cardId, (candidate) => {
          atPath(candidate, path).untrustedProfileField = 1;
        }), `${cardId}: extra ${path.length === 0 ? "root" : path.join(".")} key`);
      } else {
        const source = atPath(profile, path);
        for (let index = 0; index < source.length; index += 1) {
          assertFreshProfileRejected(freshProfileFixtures(cardId, (candidate) => {
            atPath(candidate, path).splice(index, 1);
          }), `${cardId}: missing ${[...path, index].join(".")}`);
        }
        assertFreshProfileRejected(freshProfileFixtures(cardId, (candidate) => {
          const target = atPath(candidate, path);
          target.push(forgedLeafValue(target.at(-1)));
        }), `${cardId}: extra ${path.join(".")} item`);
      }
    }
    for (const [otherCardId, otherProfile] of catalogProfiles) {
      if (otherCardId === cardId) continue;
      assertFreshProfileRejected(freshProfileFixtures(cardId, (_candidate, card) => {
        card.buildingRuntime = structuredClone(otherProfile);
      }), `${cardId}: swapped ${otherCardId} profile`);
    }
  }

  const forgedRuntimeReceipt = structuredClone(catalogProfiles.get("bulwark-needle"));
  forgedRuntimeReceipt.damage = 989;
  assert.throws(() => createSessionBuildingRuntime(canonical({ profiles: [{
    cardId: "bulwark-needle", profile: forgedRuntimeReceipt,
  }], version: 1 })), /canonical session-card receipt/u,
  "the public pure reducer cannot become a second profile-admission route");
});

test("game building runtime: hostile fresh inputs are non-observing at all three boundaries", () => {
  let observations = 0;
  const accessor = {};
  Object.defineProperty(accessor, "buildingRuntime", { enumerable: true,
    get() { observations += 1; throw new Error("accessor observed"); } });
  const symbol = {};
  Object.defineProperty(symbol, Symbol("building-runtime"), { enumerable: true,
    get() { observations += 1; throw new Error("symbol observed"); } });
  const proxy = new Proxy({}, {
    defineProperty() { observations += 1; throw new Error("proxy mutated"); },
    deleteProperty() { observations += 1; throw new Error("proxy mutated"); },
    get() { observations += 1; throw new Error("proxy observed"); },
    getOwnPropertyDescriptor() { observations += 1; throw new Error("proxy observed"); },
    getPrototypeOf() { observations += 1; throw new Error("proxy observed"); },
    ownKeys() { observations += 1; throw new Error("proxy observed"); },
    set() { observations += 1; throw new Error("proxy mutated"); },
  });
  class ProfileTextSubclass extends String {
    get buildingRuntime() { observations += 1; throw new Error("subclass observed"); }
  }
  const foreignContext = { observations: 0 };
  const crossRealm = runInNewContext(`({
    get buildingRuntime() { observations += 1; throw new Error("cross-realm observed"); }
  })`, foreignContext);
  const hostileInputs = [accessor, symbol, proxy, new ProfileTextSubclass("{}"), crossRealm];
  for (const input of hostileInputs) {
    assert.throws(() => parseLiveBattleSetup(input), /canonical JSON text or an admitted snapshot/u);
    assert.throws(() => new LiveBattle(input), /must come from parseLiveBattleSetup/u);
    assert.throws(() => new GameSession(input), /canonical JSON text/u);
  }
  assert.equal(observations, 0, "no local accessor, symbol, proxy, or subclass callback ran");
  assert.equal(foreignContext.observations, 0, "no cross-realm accessor callback ran");
});

test("game building runtime: versioned restore keeps any present profile pinned", () => {
  const fixture = freshProfileFixtures("bulwark-needle");
  const liveSnapshot = JSON.parse(new LiveBattle(fixture.battleSetup).serialize());
  assert.equal(liveSnapshot.version, 2, "a no-state current snapshot uses the v2 envelope");
  liveSnapshot.setup.roster.find(({ id }) => id === "bulwark-needle").buildingRuntime.damage = 989;
  assert.throws(() => LiveBattle.restore(canonical(liveSnapshot)), /canonical session-card receipt/u);

  const sessionSnapshot = JSON.parse(new GameSession(fixture.setup).serialize());
  const battleSetup = JSON.parse(sessionSnapshot.setup.battleSetup);
  battleSetup.roster.find(({ id }) => id === "bulwark-needle").buildingRuntime.damage = 989;
  sessionSnapshot.setup.battleSetup = canonical(battleSetup);
  sessionSnapshot.setup.rosterWitness = canonical({ questions: battleSetup.questions,
    roster: battleSetup.roster });
  assert.throws(() => GameSession.restore(canonical(sessionSnapshot)), /canonical session-card receipt/u);
});

test("game building runtime: real GameSession typed route materializes bulwark once under the shared global ID authority", () => {
  const session = sessionFor("bulwark-needle");
  const before = session.state;
  deploy(session, "bulwark-needle");
  const events = session.step();
  const after = session.state;
  const route = after.cardRuntime.history.find(({ cardId }) => cardId === "bulwark-needle");
  const committed = session.replay.find(({ type }) => type === "session-structure-deployed");
  assert.deepEqual(route.kind, "structure");
  assert.equal(after.decks.south.sequence, before.decks.south.sequence + 1);
  assert.equal(after.elixir.sides.south.amount,
    before.elixir.sides.south.amount - getSessionCardAdmissionRecord("bulwark-needle").cost);
  assert.ok(committed);
  assert.equal(committed.materialization.cardId, "bulwark-needle");
  assert.equal(committed.materialization.structureId, 1);
  assert.equal(committed.route.sequence, route.sequence);
  assert.deepEqual(after.battle.structures.map(({ cardId, id }) => ({ cardId, id })),
    [{ cardId: "bulwark-needle", id: committed.materialization.structureId }]);
  assert.equal(after.battle.units.some(({ cardId }) => cardId === "bulwark-needle"), false);
  assert.ok(events.some(({ type }) => type === "structure-materialized"));
});

test("game building runtime: v2 route-only structures restore through the legacy capability but fresh setup rejects", () => {
  const setup = legacyStructureSessionSetup("bulwark-needle");
  const setupObject = JSON.parse(setup);
  const legacyBattleSetup = JSON.parse(setupObject.battleSetup);
  assert.equal(Object.hasOwn(legacyBattleSetup.roster.find(({ id }) => id === "bulwark-needle"),
    "buildingRuntime"), false);
  assert.equal(Object.hasOwn(liveBattleModule, "parseLegacyLiveBattleSetupForRestore"), false,
    "no exported fresh parser may mint an admitted route-only setup");
  assert.throws(() => parseLiveBattleSetup(setupObject.battleSetup), /buildingRuntime/u);
  assert.throws(() => new GameSession(setup), /buildingRuntime/u);

  const battleBytes = legacyLiveBattleSnapshot("bulwark-needle");
  assert.equal(JSON.parse(battleBytes).version, 2, "the actual base-format battle envelope is v2");
  assert.equal(LiveBattle.restore(battleBytes).serialize(), battleBytes);

  const v1Bytes = legacyLiveBattleV1Snapshot("bulwark-needle");
  assert.equal(JSON.parse(v1Bytes).version, 1, "the earlier nested base-format battle envelope is v1");
  assert.equal(LiveBattle.restore(v1Bytes).serialize(), battleBytes,
    "only versioned restore upgrades the inert v1 route to its canonical v2 envelope");

  const bytes = legacyStructureSessionSnapshot("bulwark-needle");
  assert.equal(JSON.parse(bytes).version, 2, "the actual base-format session envelope is v2");
  const restored = GameSession.restore(bytes);
  assert.equal(restored.serialize(), bytes);
  assert.equal(restored.state.cardRuntime.history.filter(({ cardId }) => cardId === "bulwark-needle").length, 1);
  assert.deepEqual(restored.state.battle.structures, []);
  assert.equal(restored.replay.some(({ type }) => type === "session-structure-deployed"), false);
});

test("game building runtime: structures and ordinary units share one non-colliding host entity allocator", () => {
  const battle = liveFor("bulwark-needle");
  battle.scheduleDeploy(canonical({ cardId: "mossguard", point: SOUTH, sequence: 0, side: "south", tick: 0 }));
  battle.scheduleStructure({ cardId: "bulwark-needle", destination: null, point: SOUTH,
    sequence: 1, side: "south", tick: 0 });
  battle.step();
  const ids = [...battle.state.units.map(({ id }) => id), ...battle.state.structures.map(({ id }) => id)];
  assert.deepEqual(ids, [1, 2]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(battle.replay.find(({ type }) => type === "structure-materialized").structureId, 2);
});

test("game building runtime: a host-owned defensive lifetime expires on its shared boundary", () => {
  const battle = liveFor("bulwark-needle");
  battle.scheduleStructure({ cardId: "bulwark-needle", destination: null, point: SOUTH,
    sequence: 0, side: "south", tick: 0 });
  battle.stepMany(1_801);
  const structure = battle.state.structures[0];
  assert.deepEqual({ alive: structure.alive, deathCause: structure.deathCause,
    hitpoints: structure.hitpoints, targetable: structure.targetable },
  { alive: false, deathCause: "expiry", hitpoints: 0, targetable: false });
  assert.deepEqual(battle.replay.filter(({ type }) => type === "structure-destroyed").at(-1), {
    buildingId: 1, cause: "expiry", reason: "lifetime", tick: 1_800,
    type: "structure-destroyed",
  });
});

test("game building runtime: admitted building-origin tower contact changes authoritative GameSession tower HP in order", () => {
  const session = sessionFor("horizon-caster");
  const before = session.state.battle.towers.find(({ id }) => id === "north:lane:west").hitpoints;
  deploy(session, "horizon-caster");
  session.stepMany(600);
  const tower = session.state.battle.towers.find(({ id }) => id === "north:lane:west");
  const attack = session.replay.find(({ buildingId, type }) =>
    buildingId === 1 && type === "structure-attack");
  const contact = session.replay.find(({ sourceId, structureId, type }) =>
    sourceId === "building:1" && structureId === "north:lane:west" &&
    type === "external-structure-contact");
  assert.ok(attack, "a shared-tick structure attack was published");
  assert.ok(contact, "the real tower ingress was published");
  assert.equal(contact.tick, attack.tick + 1, "one bounded shared boundary carries the contact");
  assert.equal(tower.hitpoints, before - contact.damage);
  assert.equal(session.state.clock.towers.find(({ id }) => id === "north:lane:left").hitpoints,
    tower.hitpoints, "match evidence follows the authoritative LiveBattle tower");
});

test("game building runtime: resource proposals enter GameSession ElixirMatch and chunk/restore exactly", () => {
  const run = (chunks) => {
    const session = sessionFor("aether-well");
    deploy(session, "aether-well");
    for (const count of chunks) session.stepMany(count);
    return session;
  };
  const direct = run([511]);
  const chunked = run([1, 59, 451]);
  assert.equal(chunked.serialize(), direct.serialize());
  assert.equal(chunked.replayBytes(), direct.replayBytes());
  assert.deepEqual(chunked.state, direct.state);
  assert.deepEqual(direct.replay.filter(({ type }) => type === "building-resource-grant"), [
    { amount: 1, side: "south", sourceId: 1, tick: 510, type: "building-resource-grant" },
  ]);
  assert.deepEqual(direct.replay.filter(({ type }) => type === "building-resource-granted"), [
    { amountAfter: direct.state.elixir.sides.south.amount, amountGranted: 1, amountRequested: 1,
      buildingId: 1, side: "south", tick: 510, type: "building-resource-granted" },
  ]);
  const partial = run([180]);
  const restored = GameSession.restore(partial.serialize());
  restored.stepMany(331);
  assert.equal(restored.serialize(), direct.serialize());
  assert.equal(restored.replayBytes(), direct.replayBytes());
  assert.deepEqual(restored.state, direct.state);
});

test("game building runtime: travel state is host-serialized while its unsourced child remains visibly QUESTION", () => {
  const session = sessionFor("burrow-rig");
  deploy(session, "burrow-rig", 0, { destination: TRAVEL_DESTINATION });
  session.stepMany(160);
  const structure = session.state.battle.structures.find(({ cardId }) => cardId === "burrow-rig");
  assert.equal(structure.phase, "emerged");
  assert.deepEqual(structure.position, TRAVEL_DESTINATION);
  assert.ok(session.replay.some(({ type }) => type === "underground-travel-started"));
  assert.ok(session.replay.some(({ type }) => type === "travel-building-emerged"));
  assert.ok(session.replay.some(({ type }) => type === "travel-emergence-spawn-question"));
  assert.equal(session.state.battle.units.some(({ sourceId }) => sourceId === structure.id), false,
    "no un-sourced placeholder unit was fabricated");
  const restored = GameSession.restore(session.serialize());
  assert.equal(restored.serialize(), session.serialize());
  assert.deepEqual(restored.state, session.state);
});

test("game building runtime: live host applies unit contact, cinder death effect, and building state serialization in one authority graph", () => {
  const direct = liveFor("cinder-reliquary");
  direct.scheduleStructure({ cardId: "cinder-reliquary", destination: null, point: SOUTH,
    sequence: 0, side: "south", tick: 0 });
  for (let index = 0; index < 4; index += 1) {
    direct.scheduleDeploy(canonical({ cardId: "mossguard", point: { x: 3_500, y: 17_500 },
      sequence: index + 1, side: "north", tick: 0 }));
  }
  direct.stepMany(220);
  const structure = direct.state.structures[0];
  assert.equal(structure.alive, false);
  assert.equal(structure.deathTriggered, true);
  assert.ok(direct.replay.some(({ type }) => type === "death-effect-triggered"));
  assert.ok(direct.replay.some(({ origin, type }) => origin === "death-effect" && type === "death-effect-hit"));
  const bytes = direct.serialize();
  const restored = LiveBattle.restore(bytes);
  assert.equal(restored.serialize(), bytes);
  assert.deepEqual(restored.state, direct.state);
  assert.deepEqual(restored.replay, direct.replay);
});

test("game building runtime: hostile structure routes fail atomically before host authority commit", () => {
  const session = sessionFor("bulwark-needle");
  const before = session.serialize();
  const slot = session.state.decks.south.hand.indexOf("bulwark-needle");
  assert.throws(() => session.submitPlayerCommand(canonical({ cardId: "bulwark-needle", commandId: 0,
    destination: TRAVEL_DESTINATION, point: SOUTH, slot, tick: 0, type: "deploy" })), /destination/u);
  assert.equal(session.serialize(), before);

  const battle = liveFor("bulwark-needle");
  const battleBefore = battle.serialize();
  assert.throws(() => battle.scheduleStructure({ cardId: "bramble-cage", destination: null,
    point: SOUTH, sequence: 0, side: "south", tick: 0 }), /supported structure/u);
  assert.equal(battle.serialize(), battleBefore);
  assert.deepEqual(battle.state.structures, []);
});
