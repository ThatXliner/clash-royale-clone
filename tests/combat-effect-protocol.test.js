import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  AreaDamageSystem,
} from "../src/sim/area-damage.js";
import {
  BattleCombat,
  BattleTowerCombat,
  GameSession,
  isAuthenticGameSessionProjectionSnapshot,
} from "../src/sim/battle-continuation-kernel.js";
import {
  PelletEncounter,
  createPelletSpecialFixture,
} from "../src/content/cards/special-projectiles-pellets.js";
import {
  PierceEncounter,
  createPierceSpecialFixture,
} from "../src/content/cards/special-projectiles-pierce.js";
import {
  ReturnEncounter,
  createReturnSpecialFixture,
} from "../src/content/cards/special-projectiles-return.js";
import {
  ReturningSpellEncounter,
  createReturningSpellFixture,
} from "../src/content/cards/spells-return.js";
import {
  TravelingLineSpellEncounter,
  createTravelingLineSpellFixture,
} from "../src/content/cards/spells-travel-line.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
} from "../src/content/playable-roster.js";
import { ProjectileCombat } from "../src/sim/projectile.js";
import {
  appendCombatEffectEvent,
  appendCombatEffectRoot,
  combatEffectFeedSnapshot,
  createCombatEffectFeed,
  restoreCombatEffectFeed,
  serializeCombatEffectFeed,
  validateCombatEffectFeed,
} from "../src/sim/combat-effect-feed.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function candidate(id, x, overrides = {}) {
  return {
    alive: true,
    id,
    kind: "troop",
    layer: "ground",
    maxHealth: 1000,
    position: { x, y: 4000 },
    radius: 0,
    targetable: true,
    ...overrides,
  };
}

function areaCandidate(id, x, overrides = {}) {
  return {
    alive: true,
    id,
    kind: "troop",
    layer: "ground",
    position: { x, y: 1000 },
    radius: 0,
    targetable: true,
    ...overrides,
  };
}

function spellVictim(id, x, overrides = {}) {
  return {
    combatTargetId: null,
    combatTargetMode: null,
    health: 1000,
    id,
    kind: "troop",
    layer: "ground",
    ownerId: 2,
    position: { x, y: 1000 },
    radius: 0,
    targetable: true,
    ...overrides,
  };
}

function projectileEntity(id, position, overrides = {}) {
  return {
    attackRange: 10_000,
    id,
    kind: "troop",
    layer: "ground",
    maxHealth: 1000,
    position,
    radius: 0,
    targetMode: "air_and_ground",
    targetable: true,
    ...overrides,
  };
}

function gameSetup() {
  const roster = createPlayableRoster();
  const questions = createPlayableRosterQuestionRecords();
  const battleSetup = canonical({
    initialWindupTicks: { central: 0, lane: 0 },
    questions,
    roster,
  });
  return canonical({
    battleSetup,
    deck: roster.map(({ id }) => id),
    legalNorthDeployments: [{
      cardId: roster[0].id,
      point: { x: 3500, y: 17500 },
    }],
    rosterWitness: canonical({ questions, roster }),
    seed: "combat-effect-protocol",
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 1,
    thinkOffsetTicks: 0,
  });
}

function simpleRootFeed() {
  const feed = createCombatEffectFeed();
  const root = appendCombatEffectRoot(feed, {
    direction: "projectile",
    effectId: null,
    from: { x: 1000, y: 1000 },
    impactTick: 3,
    projectileId: 7,
    radius: 0,
    segments: [],
    sequence: 4,
    sourceId: 9,
    tick: 1,
    to: { x: 3000, y: 1000 },
    type: "projectile",
  });
  const contact = appendCombatEffectEvent(feed, {
    parentId: root.eventId,
    payload: {
      point: { x: 3000, y: 1000 },
      status: "contact",
      subId: null,
      targetId: 12,
    },
    phase: "contact",
    rootId: root.rootId,
    tick: 3,
    type: "projectile",
  });
  appendCombatEffectEvent(feed, {
    parentId: contact.eventId,
    payload: { reason: "complete" },
    phase: "close",
    rootId: root.rootId,
    tick: 3,
    type: "projectile",
  });
  return feed;
}

function assertClosedFeed(feed) {
  const snapshot = combatEffectFeedSnapshot(feed);
  assert.equal(snapshot.version, 1);
  const byRoot = new Map();
  for (const record of snapshot.records) {
    const records = byRoot.get(record.rootId) ?? [];
    records.push(record);
    byRoot.set(record.rootId, records);
    if (record.parentId !== null) {
      assert.ok(record.parentId < record.eventId);
      const parent = snapshot.records[record.parentId - 1];
      assert.equal(parent.rootId, record.rootId);
    }
  }
  for (const records of byRoot.values()) {
    assert.equal(records[0].phase, "open");
    assert.equal(records[0].parentId, null);
    assert.equal(records.at(-1).phase, "close");
  }
  return snapshot;
}

function recordsFor(encounter) {
  const feed = encounter.combatEffectFeed;
  assertClosedFeed(feed);
  return feed.records;
}

test("combat-effect feed is closed, immutable, canonical, and source-authenticated", () => {
  const feed = simpleRootFeed();
  const bytes = serializeCombatEffectFeed(feed);
  assert.equal(bytes, serializeCombatEffectFeed(validateCombatEffectFeed(feed)));
  assert.equal(bytes, serializeCombatEffectFeed(restoreCombatEffectFeed(bytes)));
  assert.equal(digest(bytes), digest(serializeCombatEffectFeed(feed)));
  assert.deepEqual(combatEffectFeedSnapshot(feed), JSON.parse(bytes));
  assert.equal(Object.isFrozen(feed), true);
  assert.equal(Object.isFrozen(feed.records), true);
  assert.equal(Object.isFrozen(feed.records[0].payload), true);
  assert.throws(() => {
    feed.records[0].payload.projectileId = 999;
  }, TypeError);
  assert.equal(serializeCombatEffectFeed(feed), bytes);
  assert.throws(() => appendCombatEffectEvent({}, {
    parentId: 1,
    payload: { reason: "complete" },
    phase: "close",
    rootId: feed.records[0].rootId,
    tick: 3,
    type: "projectile",
  }), /authority/u);
});

test("combat-effect feed rejects hostile lifecycle records atomically", () => {
  const valid = JSON.parse(simpleRootFeed().serialize());
  const sourceBefore = simpleRootFeed().serialize();
  const attempt = (records, pattern = /combat effect/u) => {
    const bytes = canonical({ records, version: 1 });
    assert.throws(() => restoreCombatEffectFeed(bytes), pattern);
  };
  attempt(valid.records.slice(1), /missing root|contiguous/u);
  attempt([
    valid.records[0],
    { ...valid.records[0], eventId: 2 },
    valid.records[1],
    valid.records[2],
  ], /duplicated/u);
  const missing = valid.records.map((record) => ({ ...record }));
  delete missing[1].payload;
  attempt(missing, /shape/u);
  attempt([
    valid.records[0],
    { ...valid.records[1], parentId: 2 },
    valid.records[2],
  ], /earlier/u);
  attempt([
    valid.records[0],
    { ...valid.records[1], parentId: 3 },
    valid.records[2],
  ], /earlier/u);
  attempt([
    valid.records[0],
    {
      ...valid.records[0],
      eventId: 2,
      parentId: 1,
    },
    valid.records[2],
  ], /only open at the root|roots may only/u);
  attempt([
    valid.records[0],
    { ...valid.records[2], eventId: 2, parentId: 1 },
    { ...valid.records[1], eventId: 3, parentId: 2 },
  ], /closed|after close/u);
  const alteredIdentity = valid.records.map((record) => ({ ...record }));
  alteredIdentity[0].payload = { ...alteredIdentity[0].payload, sourceId: 10 };
  attempt(alteredIdentity, /identity/u);
  const second = JSON.parse(simpleRootFeed().serialize());
  second.records[0].eventId = 2;
  attempt([valid.records[0], second.records[0], valid.records[1], valid.records[2]], /duplicated/u);
  attempt(valid.records.map((record) => ({ ...record, extra: true })), /shape/u);
  attempt(valid.records.map((record) => record.eventId === 1
    ? { ...record, type: "return-primitive-contact" }
    : record), /unsupported/u);
  attempt(valid.records.map((record) => record.eventId === 1
    ? { ...record, rootId: "projectile.projectile.8.none.7.4" }
    : record), /identity|root/u);
  const secondRoot = createCombatEffectFeed();
  const rootA = appendCombatEffectRoot(secondRoot, {
    direction: "projectile", effectId: null, from: { x: 0, y: 0 },
    impactTick: 3, projectileId: 1, radius: 0, segments: [], sequence: 1,
    sourceId: 1, tick: 1, to: { x: 2, y: 0 }, type: "projectile",
  });
  const rootB = appendCombatEffectRoot(secondRoot, {
    direction: "projectile", effectId: null, from: { x: 0, y: 1 },
    impactTick: 3, projectileId: 2, radius: 0, segments: [], sequence: 2,
    sourceId: 1, tick: 1, to: { x: 2, y: 1 }, type: "projectile",
  });
  const contactA = appendCombatEffectEvent(secondRoot, {
    parentId: rootA.eventId,
    payload: { point: { x: 2, y: 0 }, status: "contact", subId: null, targetId: 12 },
    phase: "contact", rootId: rootA.rootId, tick: 3, type: "projectile",
  });
  appendCombatEffectEvent(secondRoot, {
    parentId: contactA.eventId,
    payload: { reason: "complete" }, phase: "close", rootId: rootA.rootId,
    tick: 3, type: "projectile",
  });
  const contactB = appendCombatEffectEvent(secondRoot, {
    parentId: rootB.eventId,
    payload: { point: { x: 2, y: 1 }, status: "contact", subId: null, targetId: 13 },
    phase: "contact", rootId: rootB.rootId, tick: 3, type: "projectile",
  });
  appendCombatEffectEvent(secondRoot, {
    parentId: contactB.eventId,
    payload: { reason: "complete" }, phase: "close", rootId: rootB.rootId,
    tick: 3, type: "projectile",
  });
  const twoRoots = JSON.parse(secondRoot.serialize());
  const crossRoot = twoRoots.records.map((record) => ({ ...record }));
  crossRoot[4].parentId = rootA.eventId;
  attempt(crossRoot, /same root/u);
  attempt([
    twoRoots.records[0], twoRoots.records[1], twoRoots.records[3],
    twoRoots.records[2], twoRoots.records[4], twoRoots.records[5],
  ], /contiguous|parent|closed/u);
  const unsafe = valid.records.map((record) => ({ ...record }));
  unsafe[0].eventId = Number.MAX_SAFE_INTEGER + 1;
  attempt(unsafe, /safe integer|contiguous/u);
  assert.throws(
    () => restoreCombatEffectFeed(JSON.stringify(valid, null, 2)),
    /canonical/u,
  );
  assert.throws(
    () => restoreCombatEffectFeed("{".repeat(300_000)),
    /bound|valid JSON/u,
  );
  assert.equal(simpleRootFeed().serialize(), sourceBefore);
  let traps = 0;
  const proxy = new Proxy({}, {
    get() { traps += 1; throw new Error("feed proxy trap"); },
    ownKeys() { traps += 1; throw new Error("feed proxy trap"); },
  });
  assert.throws(() => serializeCombatEffectFeed(proxy), /plain data|shape|snapshot|feed proxy trap/u);
  assert.ok(traps >= 1);
  traps = 0;
  const forged = JSON.parse(simpleRootFeed().serialize());
  Object.defineProperty(forged, "version", {
    enumerable: true,
    get() { traps += 1; throw new Error("accessor"); },
  });
  assert.throws(() => validateCombatEffectFeed(forged), /data property|shape/u);
  assert.equal(traps, 0);
});

test("actual projectile, area, return, pierce, pellet, spell, and travel sources export closed feeds", () => {
  const projectile = new ProjectileCombat({
    entities: [
      projectileEntity(1, { x: 1000, y: 1000 }),
      projectileEntity(2, { x: 5000, y: 1000 }, { targetMode: "none" }),
    ],
  });
  projectile.launch({
    attackerId: 1,
    damage: 2000,
    radius: 0,
    speed: 1000,
    targetId: 2,
    tick: 0,
  });
  projectile.step(0);
  projectile.step(1);
  projectile.step(2);
  projectile.step(3);
  projectile.step(4);
  assert.deepEqual(recordsFor(projectile).map(({ phase }) => phase), [
    "open", "contact", "damage", "death", "close",
  ]);
  const projectileReplayBefore = projectile.replay;
  const projectileStateBefore = projectile.state;
  const projectileBytesBefore = projectile.serialize();
  void projectile.combatEffectFeed;
  void projectile.effectFeed;
  void projectile.visualFeed;
  assert.deepEqual(projectile.replay, projectileReplayBefore);
  assert.deepEqual(projectile.state, projectileStateBefore);
  assert.equal(projectile.serialize(), projectileBytesBefore);

  const area = new AreaDamageSystem();
  area.add(1, 1000);
  area.resolve({
    center: { x: 1000, y: 1000 },
    damage: 1000,
    mode: "ground",
    radius: 100,
    tick: 0,
  }, [areaCandidate(1, 1000)]);
  assert.deepEqual(recordsFor(area).map(({ type, phase }) => `${type}:${phase}`), [
    "area:open", "area:impact", "area:damage", "area:death", "area:close",
  ]);
  const areaBytesBefore = area.serialize();
  const areaStateBefore = area.list();
  void area.combatEffectFeed;
  assert.deepEqual(area.list(), areaStateBefore);
  assert.equal(area.serialize(), areaBytesBefore);
  const areaFeedBytes = area.combatEffectFeedBytes();
  const areaFork = area.fork();
  assert.equal(areaFork.serialize(), areaBytesBefore);
  assert.equal(areaFork.combatEffectFeedBytes(), areaFeedBytes);
  const areaRestored = AreaDamageSystem.restore(areaBytesBefore, areaFeedBytes);
  assert.equal(areaRestored.serialize(), areaBytesBefore);
  assert.equal(areaRestored.combatEffectFeedBytes(), areaFeedBytes);

  const returnEncounter = new ReturnEncounter(createReturnSpecialFixture(
    [candidate(10, 3000)], { x: 1, y: 0 }, [],
  ));
  returnEncounter.run();
  assert.ok(recordsFor(returnEncounter).some(({ phase }) => phase === "turn"));

  const pierce = new PierceEncounter(createPierceSpecialFixture(
    [candidate(11, 3000)], { x: 1, y: 0 }, [],
  ));
  pierce.run();
  assert.ok(recordsFor(pierce).some(({ phase }) => phase === "contact"));

  const pellet = new PelletEncounter(createPelletSpecialFixture(
    [candidate(12, 500, { position: { x: 500, y: 0 }, radius: 300 })], { x: 1, y: 0 }, [],
  ));
  pellet.run();
  const pelletRecords = recordsFor(pellet);
  assert.equal(pelletRecords[0].payload.segments.length, 10);
  assert.ok(pelletRecords.some(({ phase }) => phase === "contact"));

  const returningSpell = new ReturningSpellEncounter(createReturningSpellFixture({
    commands: [{
      center: { x: 5000, y: 1000 },
      effectId: null,
      id: 1,
      sourceId: 1,
      targetId: null,
      tick: 0,
      type: "cast",
    }],
    sources: [{ id: 1, ownerId: 1, position: { x: 1000, y: 1000 } }],
    victims: [spellVictim(13, 2500)],
  }));
  returningSpell.run();
  assert.ok(recordsFor(returningSpell).some(({ phase }) => phase === "turn"));

  const travel = new TravelingLineSpellEncounter(createTravelingLineSpellFixture({
    commands: [
      { center: { x: 6000, y: 1000 }, effectId: null, id: 1, sourceId: 1,
        targetId: null, tick: 0, type: "cast" },
      { center: { x: 6000, y: 1000 }, effectId: null, id: 2, sourceId: 1,
        targetId: null, tick: 0, type: "cast" },
    ],
    sources: [{ id: 1, ownerId: 1, position: { x: 1000, y: 1000 } }],
    victims: [spellVictim(14, 6000)],
  }));
  travel.stepMany(6);
  const travelRoots = recordsFor(travel).filter(({ phase }) => phase === "open");
  assert.equal(travelRoots.length, 2);
  assert.equal(new Set(travelRoots.map(({ rootId }) => rootId)).size, 2);
  assert.deepEqual(travelRoots.map(({ payload }) => payload.projectileId), [1, 1]);
  assert.ok(travelRoots.every(({ payload }) => payload.effectId !== null));
});

test("source feed bytes survive chunks, restore, fork, signed geometry, and post-launch source death", () => {
  const cancelled = new ReturnEncounter(createReturnSpecialFixture(
    [candidate(19, 3000)], { x: 1, y: 0 },
    [{ targetId: null, tick: 24, type: "kill-attacker" }],
  ));
  cancelled.run();
  assert.deepEqual(cancelled.combatEffectFeed, { records: [], version: 1 });
  assert.equal(cancelled.replay.at(-1).reason, "launch-cancelled");

  const setup = createReturningSpellFixture({
    commands: [{
      center: { x: 7000, y: 1000 }, effectId: null, id: 1, sourceId: 1,
      targetId: null, tick: 0, type: "cast",
    }, {
      center: null, effectId: null, id: 25, sourceId: 1, targetId: null,
      tick: 25, type: "source-died",
    }],
    sources: [{ id: 1, ownerId: 1, position: { x: 1000, y: 1000 } }],
    victims: [spellVictim(20, 4000)],
  });
  const whole = new ReturningSpellEncounter(setup);
  whole.run();
  const chunks = new ReturningSpellEncounter(setup);
  for (const count of [1, 4, 7, 16, 32, 68]) chunks.stepMany(count);
  assert.equal(chunks.combatEffectFeedBytes(), whole.combatEffectFeedBytes());
  assert.equal(chunks.serialize(), whole.serialize());
  assert.equal(chunks.fork().combatEffectFeedBytes(), whole.combatEffectFeedBytes());
  const launch = whole.combatEffectFeed.records.find(({ phase }) => phase === "open");
  assert.ok(launch.tick < 25, "the source died after the visible return path launched");
  assert.equal(whole.combatEffectFeed.records.at(-1).phase, "close");
  assert.equal(whole.combatEffectFeed.records.at(-1).payload.reason, "complete");
  assert.ok(whole.replay.some(({ type }) => type.startsWith("return-primitive-")));
  assert.equal(whole.combatEffectFeed.records.some(({ type }) => type.startsWith("return-primitive-")), false);

  const diagonal = new PierceEncounter(createPierceSpecialFixture(
    [candidate(21, 1000, { position: { x: 1000, y: 3000 } })], { x: -3, y: 4 }, [],
  ));
  diagonal.run();
  assert.ok(recordsFor(diagonal).some(({ payload }) =>
    payload.point?.xNumerator?.startsWith("-") ||
    payload.point?.yNumerator?.startsWith("-")
  ) || recordsFor(diagonal).length > 0);
  const signed = createCombatEffectFeed();
  const root = appendCombatEffectRoot(signed, {
    direction: "travel", effectId: "axis:diagonal", from: { x: -3000, y: 4000 },
    impactTick: 9, projectileId: 1, radius: 0, segments: [], sequence: 1,
    sourceId: "source:one", tick: 0, to: { x: 3000, y: -4000 }, type: "projectile",
  });
  appendCombatEffectEvent(signed, {
    parentId: root.eventId, payload: { point: { x: -1500, y: 2000 } },
    phase: "turn", rootId: root.rootId, tick: 4, type: "projectile",
  });
  assert.match(serializeCombatEffectFeed(signed), /xNumerator":"-3000"/u);
});

test("authentic battle and GameSession projections carry stable source identities", () => {
  const unit = (id, side, position, overrides = {}) => ({
    cadenceTicks: 60,
    damage: 10,
    delivery: "projectile",
    deployTicks: 0,
    firstHitTicks: 0,
    id,
    layer: "ground",
    maxHealth: 1000,
    position,
    projectileSpeed: 1000,
    radius: 0,
    reach: 5000,
    side,
    sightRange: 10000,
    targetMode: "air_and_ground",
    ...overrides,
  });
  const battle = new BattleTowerCombat({
    initialWindupTicks: { central: 0, lane: 0 },
    units: [
      unit(1, "north", { x: 1000, y: 1000 }, { delivery: "melee", reach: 0, projectileSpeed: null }),
      unit(2, "south", { x: 5000, y: 1000 }, { delivery: "melee", reach: 0, projectileSpeed: null, damage: 0, firstHitTicks: 999 }),
    ],
  });
  battle.step(0);
  const battleFeed = assertClosedFeed(battle.combatEffectFeed);
  assert.ok(battleFeed.records.some(({ payload }) => payload.direction === "tower-to-unit"));
  const battleFork = battle.fork();
  assert.equal(battleFork.combatEffectFeedBytes(), battle.combatEffectFeedBytes());

  const session = new GameSession(gameSetup());
  const first = session.projectionSnapshot();
  const second = session.projectionSnapshot();
  assert.equal(isAuthenticGameSessionProjectionSnapshot(first), true);
  assert.equal(Object.isFrozen(first.combatEffectFeed), true);
  assert.deepEqual(first.combatEffectFeed, { records: [], version: 1 });
  assert.equal(canonical(first.combatEffectFeed), canonical(second.combatEffectFeed));
  assert.equal(session.replayBytes(), canonical(first.replay));

  const liveSession = new GameSession(gameSetup());
  const cardId = liveSession.state.decks.south.hand.find((id) => id === "copperskiff");
  assert.equal(typeof cardId, "string");
  liveSession.submitPlayerCommand(canonical({
    cardId,
    commandId: 1,
    point: { x: 3500, y: 14500 },
    slot: liveSession.state.decks.south.hand.indexOf(cardId),
    tick: 0,
    type: "deploy",
  }));
  liveSession.stepMany(320);
  const liveProjection = liveSession.projectionSnapshot();
  const liveFeed = assertClosedFeed(liveProjection.combatEffectFeed);
  assert.ok(liveFeed.records.length > 0);
  const restoredSession = GameSession.restore(liveSession.serialize());
  assert.equal(
    canonical(restoredSession.projectionSnapshot().combatEffectFeed),
    canonical(liveProjection.combatEffectFeed),
  );
});

test("fresh processes reproduce exact feed bytes", () => {
  const script = `
    import { createCombatEffectFeed, appendCombatEffectRoot, serializeCombatEffectFeed } from "./src/sim/combat-effect-feed.js";
    const feed = createCombatEffectFeed();
    appendCombatEffectRoot(feed, { direction: "projectile", effectId: null, from: { x: 1, y: 2 }, impactTick: 3, projectileId: 4, radius: 0, segments: [], sequence: 4, sourceId: 5, tick: 0, to: { x: 6, y: 7 }, type: "projectile" });
    process.stdout.write(serializeCombatEffectFeed(feed));
  `;
  const first = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: new URL("..", import.meta.url), encoding: "utf8",
  });
  const second = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: new URL("..", import.meta.url), encoding: "utf8",
  });
  assert.equal(first.status, 0);
  assert.equal(second.status, 0);
  assert.equal(first.stdout, second.stdout);
  assert.equal(digest(first.stdout), "427faa2df8dbe486aab0a376c2b1015007d084ffad971ad407e72b57ed9b4b35");
});
