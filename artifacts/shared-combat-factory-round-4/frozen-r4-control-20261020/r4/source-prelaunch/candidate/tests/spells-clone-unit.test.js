import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DeckCycle } from "../src/sim/deck.js";
import { ShieldFormEncounter } from "../src/content/cards/shields-forms.js";
import {
  DeployedUnitCloneEncounter,
  createCloneUnitEntityFromShieldForm,
  getCloneUnitQuestionRecords,
  getCloneUnitRules,
} from "../src/content/cards/spells-clone-unit.js";
import {
  protectedIdentityHits,
  referencePathHits,
} from "./helpers/protected-identity-scan.js";

const EFFECT_CARD = "echo-bloom";
const DECK = [EFFECT_CARD, "a", "b", "c", "d", "e", "f", "g"];

function entity({
  damage = 100,
  dead = false,
  deployed = true,
  health = dead ? 0 : 500,
  id,
  kind = "unit",
  maxHealth = 500,
  ownerId = 1,
  position = { x: 0, y: 0 },
  sourceEntityId = null,
}) {
  return {
    damage,
    dead,
    deployed,
    health,
    id,
    kind,
    maxHealth,
    ownerId,
    position,
    sourceEntityId,
  };
}

function setup(entities, decks = [{
  deck: [...DECK],
  ownerId: 1,
  seed: 16,
}]) {
  return { cardId: EFFECT_CARD, decks, entities };
}

function cast(ownerId = 1, tick = 10, center = { x: 0, y: 0 }) {
  return {
    cardId: EFFECT_CARD,
    center,
    ownerId,
    tick,
    type: "cast",
  };
}

function run(actions, fixture) {
  const encounter = new DeployedUnitCloneEncounter(fixture);
  const emitted = [];
  for (const action of actions) {
    if (action.type === "cast") encounter.scheduleCast(action);
    else emitted.push(...encounter.advanceTicks(action.ticks));
  }
  return { emitted, encounter };
}

test("clone unit: all unsupported or low-confidence choices are frozen questions", () => {
  const records = getCloneUnitQuestionRecords();
  assert.equal(records.length, 25);
  assert.equal(new Set(records.map(({ key }) => key)).size, records.length);
  assert.ok(records.every(({ status }) => status === "QUESTION"));
  assert.deepEqual(
    new Set(records.map(({ confidence }) => confidence)),
    new Set(["corpus_absent", "low_confidence"]),
  );
  assert.equal(Object.isFrozen(records), true);
  assert.ok(records.every(Object.isFrozen));
  assert.throws(() => records.push({}), TypeError);
  assert.throws(() => { records[0].value = 1; }, TypeError);
  assert.equal(getCloneUnitQuestionRecords()[0].value, 3_000);
  assert.deepEqual(getCloneUnitRules(), {
    cloneHealth: 1,
    effectRadiusMillitiles: 3_000,
    fidelity: "question_fixture_pending_calibration",
    rule: "deployed-unit-echo-v1",
    version: 1,
  });
});

test("clone unit: the comparison slice establishes no health or damage rule", () => {
  const corpus = JSON.parse(readFileSync(
    new URL("../reference/stats/cards.json", import.meta.url),
    "utf8",
  ));
  const row = corpus.cards.find(({ key }) => key === "clone");
  assert.ok(row);
  assert.equal(row.hitpoints, null);
  assert.equal(row.damage, null);
  assert.equal(row.area_damage_radius_tiles, 3);
  assert.ok(row.unverified_fields.includes("area_damage_radius_tiles"));
  assert.ok(row.notes.includes("damage and hitpoints are effect-dependent"));
});

test("clone unit: eligible units retain damage, receive one health, and order by id", () => {
  const fixture = setup([
    entity({ damage: 17, id: 9, position: { x: 0, y: 3_000 } }),
    entity({ damage: 91, id: 2, position: { x: 1, y: 1 } }),
  ]);
  const encounter = new DeployedUnitCloneEncounter(fixture);
  encounter.scheduleCast(cast());
  const events = encounter.advanceTicks(10);
  assert.deepEqual(
    events.filter(({ type }) => type === "unit-cloned"),
    [
      {
        damage: 91,
        entityId: 10,
        health: 1,
        ownerId: 1,
        sourceEntityId: 2,
        tick: 10,
        type: "unit-cloned",
      },
      {
        damage: 17,
        entityId: 11,
        health: 1,
        ownerId: 1,
        sourceEntityId: 9,
        tick: 10,
        type: "unit-cloned",
      },
    ],
  );
  assert.deepEqual(events.at(-1).sourceIds, [2, 9]);
  const clones = encounter.state.entities.filter(
    ({ sourceEntityId }) => sourceEntityId !== null,
  );
  assert.deepEqual(clones.map((value) => ({
    damage: value.damage,
    health: value.health,
    maxHealth: value.maxHealth,
    position: value.position,
    sourceEntityId: value.sourceEntityId,
  })), [
    {
      damage: 91,
      health: 1,
      maxHealth: 1,
      position: { x: 1, y: 1 },
      sourceEntityId: 2,
    },
    {
      damage: 17,
      health: 1,
      maxHealth: 1,
      position: { x: 0, y: 3_000 },
      sourceEntityId: 9,
    },
  ]);
});

test("clone unit: ownership and every lifecycle/kind exclusion are explicit", () => {
  const fixture = setup([
    entity({ id: 1 }),
    entity({ id: 2, ownerId: 2 }),
    entity({ dead: true, id: 3 }),
    entity({ deployed: false, id: 4 }),
    entity({ id: 5, kind: "structure" }),
    entity({ id: 6, kind: "tower" }),
    entity({ id: 7, sourceEntityId: 1 }),
    entity({ id: 8, position: { x: 3_001, y: 0 } }),
  ], [
    { deck: [...DECK], ownerId: 1, seed: 16 },
    { deck: [...DECK], ownerId: 2, seed: 16 },
  ]);
  const encounter = new DeployedUnitCloneEncounter(fixture);
  encounter.scheduleCast(cast());
  const event = encounter.advanceTicks(10).at(-1);
  assert.deepEqual(event.sourceIds, [1]);
  assert.deepEqual(event.createdIds, [9]);
});

test("clone unit: an accepted empty cast cycles once and materializes nothing", () => {
  const encounter = new DeployedUnitCloneEncounter(setup([
    entity({ id: 1, position: { x: 3_001, y: 0 } }),
  ]));
  encounter.scheduleCast(cast());
  assert.deepEqual(encounter.advanceTicks(10), [{
    accepted: true,
    cardId: EFFECT_CARD,
    commandSequence: 0,
    createdIds: [],
    ownerId: 1,
    reason: "accepted",
    sourceIds: [],
    tick: 10,
    type: "clone-cast",
  }]);
  assert.equal(encounter.state.entities.length, 1);
  assert.equal(encounter.state.decks[0].state.sequence, 1);
});

test("clone unit: same-boundary casts use one baseline and command ordering", () => {
  const fixture = setup([
    entity({ id: 10, ownerId: 1 }),
    entity({ id: 20, ownerId: 2 }),
  ], [
    { deck: [...DECK], ownerId: 1, seed: 16 },
    { deck: [...DECK], ownerId: 2, seed: 16 },
  ]);
  const encounter = new DeployedUnitCloneEncounter(fixture);
  encounter.scheduleCast(cast(2, 7));
  encounter.scheduleCast(cast(1, 7));
  const events = encounter.advanceTicks(7);
  assert.deepEqual(
    events.filter(({ type }) => type === "unit-cloned")
      .map(({ entityId, ownerId, sourceEntityId }) =>
        ({ entityId, ownerId, sourceEntityId })),
    [
      { entityId: 21, ownerId: 2, sourceEntityId: 20 },
      { entityId: 22, ownerId: 1, sourceEntityId: 10 },
    ],
  );
  assert.deepEqual(
    events.filter(({ type }) => type === "clone-cast")
      .map(({ commandSequence, sourceIds }) => ({ commandSequence, sourceIds })),
    [
      { commandSequence: 0, sourceIds: [20] },
      { commandSequence: 1, sourceIds: [10] },
    ],
  );
});

test("clone unit: DeckCycle owns card acceptance and cycle state", () => {
  const fixture = setup([entity({ id: 1 })]);
  const expected = new DeckCycle({ deck: [...DECK], seed: 16 });
  assert.deepEqual(expected.state, new DeployedUnitCloneEncounter(fixture)
    .state.decks[0].state);

  const encounter = new DeployedUnitCloneEncounter(fixture);
  encounter.scheduleCast({ ...cast(1, 2), cardId: "a" });
  encounter.scheduleCast(cast(1, 3));
  const first = encounter.advanceTicks(2);
  assert.equal(first[0].accepted, false);
  assert.equal(first[0].reason, "not_in_hand");
  assert.deepEqual(first[0].deckEvent, expected.play("a"));
  const second = encounter.advanceTicks(1);
  assert.equal(second.at(-1).accepted, true);
  assert.deepEqual(encounter.state.decks[0].state, expected.play(EFFECT_CARD) &&
    expected.state);
});

test("clone unit: unknown owners reject without mutating a deck", () => {
  const encounter = new DeployedUnitCloneEncounter(setup([entity({ id: 1 })]));
  const deckBefore = encounter.state.decks;
  encounter.scheduleCast(cast(99, 1));
  assert.deepEqual(encounter.advanceTicks(1), [{
    accepted: false,
    cardId: EFFECT_CARD,
    commandSequence: 0,
    ownerId: 99,
    reason: "unknown_owner",
    tick: 1,
    type: "clone-cast",
  }]);
  assert.deepEqual(encounter.state.decks, deckBefore);
  assert.equal(encounter.state.entities.length, 1);
});

test("clone unit: CONTENT-007 mobile form composes and stationary form excludes", () => {
  const mobile = new ShieldFormEncounter();
  mobile.damage(100);
  const mobileEntity = createCloneUnitEntityFromShieldForm(mobile, {
    id: 1,
    ownerId: 1,
    position: { x: 0, y: 0 },
  });
  assert.equal(mobileEntity.kind, "unit");
  assert.equal(mobileEntity.health, 792);
  assert.equal(mobileEntity.damage, 212);

  const stationary = ShieldFormEncounter.restore(mobile.serialize());
  stationary.damage(792);
  const stationaryEntity = createCloneUnitEntityFromShieldForm(
    stationary.serialize(),
    { id: 2, ownerId: 1, position: { x: 0, y: 0 } },
  );
  assert.equal(stationaryEntity.kind, "structure");
  const encounter = new DeployedUnitCloneEncounter(
    setup([mobileEntity, stationaryEntity]),
  );
  encounter.scheduleCast(cast());
  assert.deepEqual(encounter.advanceTicks(10).at(-1).sourceIds, [1]);
});

test("clone unit: chunking is byte-identical around empty and cast boundaries", () => {
  const fixture = setup([
    entity({ id: 1, position: { x: 3_000, y: 0 } }),
    entity({ id: 2, position: { x: 3_001, y: 0 } }),
  ]);
  const actions = [cast(1, 10), { ticks: 20, type: "advance" }];
  const whole = run(actions, fixture).encounter;
  const chunked = run([
    cast(1, 10),
    { ticks: 9, type: "advance" },
    { ticks: 1, type: "advance" },
    { ticks: 10, type: "advance" },
  ], fixture).encounter;
  assert.deepEqual(chunked.state, whole.state);
  assert.deepEqual(chunked.replay, whole.replay);
});

test("clone unit: every action cut restores and continues byte-identically", () => {
  const fixture = setup([entity({ id: 1 }), entity({ id: 2 })]);
  const actions = [
    cast(1, 4),
    { ticks: 2, type: "advance" },
    { ticks: 2, type: "advance" },
    { ...cast(1, 9), cardId: "d" },
    { ticks: 5, type: "advance" },
  ];
  const uninterrupted = run(actions, fixture).encounter;
  for (let cut = 0; cut <= actions.length; cut += 1) {
    const prefix = run(actions.slice(0, cut), fixture).encounter;
    const restored = DeployedUnitCloneEncounter.restore(prefix.serialize());
    for (const action of actions.slice(cut)) {
      if (action.type === "cast") restored.scheduleCast(action);
      else restored.advanceTicks(action.ticks);
    }
    assert.deepEqual(restored.state, uninterrupted.state, `state cut ${cut}`);
    assert.deepEqual(restored.replay, uninterrupted.replay, `replay cut ${cut}`);
    assert.equal(restored.serialize(), uninterrupted.serialize(), `bytes cut ${cut}`);
  }
});

test("clone unit: state, events, inputs, and question records are isolated", () => {
  const fixture = setup([entity({ id: 1 })]);
  const encounter = new DeployedUnitCloneEncounter(fixture);
  fixture.entities[0].damage = 999;
  fixture.decks[0].deck[0] = "changed";
  const command = cast();
  encounter.scheduleCast(command);
  command.center.x = 99;
  const events = encounter.advanceTicks(10);
  events[0].damage = 999;
  const state = encounter.state;
  state.entities[0].damage = 888;
  const replay = encounter.replay;
  replay[0].damage = 777;
  assert.equal(encounter.state.entities[0].damage, 100);
  assert.equal(encounter.state.entities[1].damage, 100);
  assert.equal(encounter.replay[0].damage, 100);
});

test("clone unit: hostile setup and commands reject before mutation", () => {
  const valid = setup([entity({ id: 1 })]);
  const invalidSetups = [
    { ...valid, extra: true },
    { ...valid, entities: [entity({ id: 1 }), entity({ id: 1 })] },
    { ...valid, decks: [] },
    { ...valid, cardId: "" },
    setup([{ ...entity({ id: 1 }), health: 0 }]),
    setup([{ ...entity({ id: 1 }), kind: "spell" }]),
    setup([{ ...entity({ id: 1 }), position: { x: 1.5, y: 0 } }]),
  ];
  for (const invalid of invalidSetups) {
    assert.throws(() => new DeployedUnitCloneEncounter(invalid), /setup|deck|entities|health|kind|position|card/i);
  }

  let getterCalls = 0;
  const hostile = { ...valid };
  Object.defineProperty(hostile, "entities", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return [];
    },
  });
  assert.throws(() => new DeployedUnitCloneEncounter(hostile), /data object|shape/);
  assert.equal(getterCalls, 0);

  const encounter = new DeployedUnitCloneEncounter(valid);
  const before = encounter.serialize();
  for (const command of [
    { ...cast(), extra: true },
    { ...cast(), tick: 0 },
    { ...cast(), center: { x: Number.NaN, y: 0 } },
    { ...cast(), ownerId: 0 },
  ]) {
    assert.throws(() => encounter.scheduleCast(command), /shape|future|center|owner/);
    assert.equal(encounter.serialize(), before);
  }
  assert.throws(() => encounter.advanceTicks(0), /ticks/);
  assert.equal(encounter.serialize(), before);
});

test("clone unit: entity-id exhaustion fails atomically at the boundary", () => {
  const encounter = new DeployedUnitCloneEncounter(setup([
    entity({ id: Number.MAX_SAFE_INTEGER }),
  ]));
  encounter.scheduleCast(cast(1, 1));
  const before = encounter.serialize();
  assert.throws(() => encounter.advanceTicks(1), /id space exhausted/);
  assert.equal(encounter.serialize(), before);
  assert.equal(encounter.state.tick, 0);
  assert.deepEqual(encounter.replay, []);
});

test("clone unit: hostile snapshots, noncanonical bytes, and accessors reject", () => {
  const encounter = new DeployedUnitCloneEncounter(setup([entity({ id: 1 })]));
  encounter.scheduleCast(cast());
  encounter.advanceTicks(10);
  const serialized = encounter.serialize();
  const parsed = JSON.parse(serialized);
  for (const value of [
    "{",
    JSON.stringify({ ...parsed, extra: true }),
    JSON.stringify({ ...parsed, rule: "future" }),
    JSON.stringify({ ...parsed, version: 2 }),
    JSON.stringify({ ...parsed, actions: [{ type: "advance", ticks: 0 }] }),
  ]) {
    assert.throws(() => DeployedUnitCloneEncounter.restore(value), /snapshot|identity|ticks|shape|JSON/);
  }
  assert.throws(() => DeployedUnitCloneEncounter.restore(parsed), /string/);
  const noncanonical = `{"version":1,"rule":"deployed-unit-echo-v1","setup":${canonicalForTest(parsed.setup)},"actions":${canonicalForTest(parsed.actions)}}`;
  assert.throws(
    () => DeployedUnitCloneEncounter.restore(noncanonical),
    /not canonical/,
  );
});

function canonicalForTest(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalForTest).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalForTest(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

test("clone unit: runtime has no corpus dependency or ambient nondeterminism", () => {
  const source = readFileSync(
    new URL("../src/content/cards/spells-clone-unit.js", import.meta.url),
    "utf8",
  );
  const corpus = JSON.parse(readFileSync(
    new URL("../reference/stats/cards.json", import.meta.url),
    "utf8",
  ));
  const protectedTokens = new Set(corpus.cards.flatMap(({ key, name }) => [
    key.toLowerCase(),
    name.toLowerCase(),
  ]));
  assert.deepEqual(referencePathHits(source), []);
  assert.deepEqual(protectedIdentityHits(source, protectedTokens), []);
  assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now/u);
  assert.doesNotMatch(source, /setTimeout|setInterval/u);
});
