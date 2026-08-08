import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ReturningSpellEncounter,
  createReturningSpellCatalog,
  createReturningSpellFixture,
  createReturningSpellQuestionRecords,
} from "../src/content/cards/spells-return.js";
import {
  ReturnEncounter,
  createReturnQuestionFixture,
  createReturnSpecialFixture,
} from "../src/content/cards/special-projectiles-return.js";
import {
  InstantRadiusSpellEncounter,
  createInstantSpellFixture,
} from "../src/content/cards/spells-instant.js";

function source(id = 1, ownerId = 1, position = { x: 1000, y: 1000 }) {
  return { id, ownerId, position };
}

function victim(id, x, overrides = {}) {
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

function cast(id = 1, tick = 0, center = { x: 5000, y: 1000 }) {
  return {
    center,
    effectId: null,
    id,
    sourceId: 1,
    targetId: null,
    tick,
    type: "cast",
  };
}

function command(type, tick, overrides = {}) {
  return {
    center: null,
    effectId: null,
    id: 20 + tick,
    sourceId: null,
    targetId: null,
    tick,
    type,
    ...overrides,
  };
}

function setup(commands = [cast()], victims = [victim(10, 2000)]) {
  return createReturningSpellFixture({
    commands,
    sources: [source()],
    victims,
  });
}

function trace(encounter) {
  encounter.run();
  return encounter.replay;
}

test("catalog and every corpus-absent policy are frozen QUESTION records", () => {
  assert.ok(createReturningSpellCatalog().length > 0);
  const questions = createReturningSpellQuestionRecords();
  assert.ok(Object.isFrozen(questions));
  assert.equal(Object.keys(questions).length, 14);
  for (const [key, record] of Object.entries(questions)) {
    assert.ok(Object.isFrozen(record));
    assert.equal(record.authoritative, false);
    assert.equal(record.confidence, "unverified");
    assert.equal(record.disposition, "question");
    assert.equal(record.key, key);
    assert.equal(
      record.source,
      "unsourced-returning-traveling-spell-composition",
    );
  }
  assert.deepEqual(Object.keys(questions).sort(), [
    "cancellationBoundary",
    "contactDamage",
    "contactGeometry",
    "contactOrder",
    "inboundStart",
    "movingTargetPolicy",
    "repeatHitPolicy",
    "sameBoundaryOrder",
    "sourceDeathAfterCompletion",
    "sourceDeathAfterLaunch",
    "targetDeathBoundary",
    "timingComposition",
    "turnPolicy",
    "zeroDistancePolicy",
  ]);
  assert.equal(
    questions.contactOrder.value.primitive,
    createReturnQuestionFixture().eventOrderRule.value,
  );
});

test("exact outbound, turn, inbound, repeat-hit, and completion trace", () => {
  const events = trace(new ReturningSpellEncounter(setup(
    [cast()],
    [victim(10, 2000), victim(11, 4000)],
  )));
  assert.deepEqual(events
    .filter(({ type }) => [
      "return-launch",
      "return-contact",
      "return-turn",
      "return-complete",
    ].includes(type))
    .map(({ type, tick, targetId, leg }) => ({ leg, targetId, tick, type })), [
    { leg: undefined, targetId: undefined, tick: 24, type: "return-launch" },
    { leg: "outbound", targetId: 10, tick: 25, type: "return-contact" },
    { leg: "outbound", targetId: 11, tick: 27, type: "return-contact" },
    { leg: undefined, targetId: undefined, tick: 31, type: "return-turn" },
    { leg: "inbound", targetId: 11, tick: 35, type: "return-contact" },
    { leg: "inbound", targetId: 10, tick: 37, type: "return-contact" },
    { leg: undefined, targetId: undefined, tick: 38, type: "return-complete" },
  ]);
});

function primitiveFixture(commands = []) {
  return createReturnSpecialFixture([
    {
      alive: true,
      id: 201,
      kind: "troop",
      layer: "ground",
      maxHealth: 338,
      position: { x: 2000, y: 4000 },
      radius: 0,
      targetable: true,
    },
    {
      alive: true,
      id: 202,
      kind: "troop",
      layer: "ground",
      maxHealth: 338,
      position: { x: 4000, y: 4000 },
      radius: 0,
      targetable: true,
    },
  ], { x: 4000, y: 0 }, commands);
}

function lifecycle(events) {
  return events
    .filter(({ type }) => [
      "return-launch",
      "return-contact",
      "return-turn",
      "return-complete",
    ].includes(type))
    .map((event) => ({
      leg: event.leg,
      targetId: event.targetId,
      tick: event.tick,
      type: event.type === "return-contact" ? "return-hit" : event.type,
    }));
}

test("full lifecycle events are a direct ReturnEncounter differential", () => {
  const spell = new ReturningSpellEncounter(setup(
    [cast()],
    [victim(10, 2000), victim(11, 4000)],
  ));
  const primitive = new ReturnEncounter(primitiveFixture());
  spell.run();
  primitive.run();
  const expected = primitive.replay
    .filter(({ type }) => [
      "return-launch",
      "return-hit",
      "return-turn",
      "return-complete",
    ].includes(type))
    .map((event) => ({
      leg: event.leg,
      targetId: event.targetId === undefined
        ? undefined
        : event.targetId - 191,
      tick: event.tick,
      type: event.type,
    }));
  assert.deepEqual(lifecycle(spell.replay), expected);
});

test("contact precedes passed instant damage and death stably", () => {
  const events = trace(new ReturningSpellEncounter(setup(
    [cast()],
    [victim(11, 2000, { health: 1 }), victim(10, 2000, { health: 1 })],
  )));
  const atContact = events.filter(({ tick }) => tick === 25);
  assert.deepEqual(atContact.map(({ type, targetId }) => ({ targetId, type })), [
    { targetId: 10, type: "return-contact" },
    { targetId: 10, type: "return-spell-damage" },
    { targetId: 10, type: "return-spell-death" },
    { targetId: 11, type: "return-contact" },
    { targetId: 11, type: "return-spell-damage" },
    { targetId: 11, type: "return-spell-death" },
  ]);
});

test("contact damage and provenance are the passed instant primitive", () => {
  const spellEvents = trace(new ReturningSpellEncounter(setup(
    [cast()],
    [victim(10, 2000)],
  )));
  const instant = new InstantRadiusSpellEncounter(createInstantSpellFixture({
    commands: [{
      center: { x: 2000, y: 1000 },
      id: 1,
      sourceId: 1,
      targetId: null,
      tick: 0,
      type: "cast",
      variant: "plain",
    }],
    sources: [{ id: 1, ownerId: 1 }],
    victims: [victim(10, 2000)],
  }));
  const expected = instant.stepMany(3)
    .find(({ type }) => type === "spell-damage");
  const actual = spellEvents.find(({ type }) => type === "return-spell-damage");
  assert.deepEqual({
    amount: actual.amount,
    healthAfter: actual.healthAfter,
    healthBefore: actual.healthBefore,
    primitiveEffectId: actual.primitiveEffectId,
    targetId: actual.targetId,
  }, {
    amount: expected.amount,
    healthAfter: expected.healthAfter,
    healthBefore: expected.healthBefore,
    primitiveEffectId: expected.effectId,
    targetId: expected.targetId,
  });
});

test("primitive eligibility excludes friendly, untargetable, and crown candidates", () => {
  const events = trace(new ReturningSpellEncounter(setup(
    [cast()],
    [
      victim(10, 2000, { ownerId: 1 }),
      victim(11, 2000, { targetable: false }),
      victim(12, 2000, { kind: "crown" }),
      victim(13, 2000),
    ],
  )));
  assert.deepEqual(
    events
      .filter(({ type }) => type === "return-contact")
      .map(({ targetId }) => targetId),
    [13, 13],
  );
});

test("target death wins contact; death and cancel preserve primitive launch policy", () => {
  const targetDeath = trace(new ReturningSpellEncounter(setup([
    cast(),
    command("target-died", 25, { targetId: 10 }),
  ])));
  assert.equal(targetDeath.some(({ type }) => type === "return-contact"), false);

  for (const cancellation of [
    command("cancel-effect", 24, { effectId: 1 }),
    command("source-died", 24, { sourceId: 1 }),
  ]) {
    const events = trace(new ReturningSpellEncounter(setup(
      [cast(), cancellation],
      [victim(10, 2000)],
    )));
    assert.equal(events.some(({ type }) => type === "return-launch"), false);
    assert.equal(
      events.find(({ type }) => type === "return-complete")?.reason,
      "launch-cancelled",
    );
  }

  for (const cancellation of [
    command("cancel-effect", 26, { effectId: 1 }),
    command("source-died", 26, { sourceId: 1 }),
  ]) {
    const events = trace(new ReturningSpellEncounter(setup(
      [cast(), cancellation],
      [victim(10, 2000)],
    )));
    assert.equal(
      events.filter(({ type }) => type === "return-contact").length,
      2,
    );
    assert.equal(events.some(({ type }) => type === "return-turn"), true);
    assert.equal(
      events.find(({ type }) => type === "return-complete")?.reason,
      "returned-to-origin",
    );
  }
});

test("same-tick effects resolve by stable effect ID", () => {
  const events = trace(new ReturningSpellEncounter(setup(
    [cast(1), cast(2)],
    [victim(10, 2000)],
  )));
  assert.deepEqual(events
    .filter(({ type, tick }) => type === "return-contact" && tick === 25)
    .map(({ effectId }) => effectId), [1, 2]);
});

test("chunking and restore at every boundary are byte-identical", () => {
  const fixture = setup([cast()], [victim(10, 2000), victim(11, 4000)]);
  const whole = new ReturningSpellEncounter(fixture);
  whole.run();
  for (let cut = 0; cut <= 128; cut += 1) {
    const split = new ReturningSpellEncounter(fixture);
    split.stepMany(cut);
    const restored = ReturningSpellEncounter.restore(split.serialize());
    restored.stepMany(128 - cut);
    assert.deepEqual(restored.state, whole.state);
    assert.deepEqual(restored.replay, whole.replay);
    assert.equal(restored.serialize(), whole.serialize());
  }
});

test("every phase including terminal retains exact primitive state/snapshot bytes", () => {
  const fixture = setup(
    [cast()],
    [victim(10, 2000), victim(11, 4000)],
  );
  for (const cut of [1, 24, 25, 30, 31, 32, 37, 38, 39, 128]) {
    const spell = new ReturningSpellEncounter(fixture);
    const primitive = new ReturnEncounter(primitiveFixture());
    spell.stepMany(cut);
    primitive.stepMany(cut);
    const outer = JSON.parse(spell.serialize());
    assert.equal(outer.primitives.length, 1, `cut ${cut}`);
    assert.equal(outer.primitives[0].effectId, 1, `cut ${cut}`);
    assert.equal(outer.primitives[0].snapshot, primitive.serialize(), `cut ${cut}`);
    assert.deepEqual(
      ReturnEncounter.restore(outer.primitives[0].snapshot).state,
      primitive.state,
      `cut ${cut}`,
    );
  }
  const completed = new ReturningSpellEncounter(fixture);
  const primitive = new ReturnEncounter(primitiveFixture());
  completed.stepMany(39);
  primitive.stepMany(39);
  const terminal = JSON.parse(completed.serialize()).primitives[0];
  assert.equal(ReturnEncounter.restore(terminal.snapshot).state.terminal, true);
  assert.equal(terminal.snapshot, primitive.serialize());
  assert.equal(
    ReturningSpellEncounter.restore(completed.serialize()).serialize(),
    completed.serialize(),
  );
});

test("turn-focused chunks and monolithic execution are identical", () => {
  const fixture = setup(
    [cast()],
    [victim(10, 2000), victim(11, 4000)],
  );
  const whole = new ReturningSpellEncounter(fixture);
  whole.stepMany(128);
  for (const chunks of [
    [24, 1, 6, 1, 6, 90],
    [25, 6, 1, 7, 89],
    [1, 23, 7, 1, 6, 1, 89],
    [32, 32, 32, 32],
  ]) {
    const chunked = new ReturningSpellEncounter(fixture);
    for (const count of chunks) chunked.stepMany(count);
    assert.deepEqual(chunked.state, whole.state);
    assert.deepEqual(chunked.replay, whole.replay);
    assert.equal(chunked.serialize(), whole.serialize());
  }
});

test("nested primitive snapshots reject forgery and restore causally", () => {
  const spell = new ReturningSpellEncounter(setup());
  spell.stepMany(25);
  const raw = JSON.parse(spell.serialize());
  const primitive = JSON.parse(raw.primitives[0].snapshot);
  primitive.tick -= 1;
  raw.primitives[0].snapshot = JSON.stringify(primitive);
  const forged = JSON.stringify(raw);
  assert.throws(
    () => ReturningSpellEncounter.restore(forged),
    /non-causal/u,
  );
  assert.equal(
    ReturningSpellEncounter.restore(spell.serialize()).serialize(),
    spell.serialize(),
  );
});

test("actual ReturnEncounter construction/restore and primitive hash are pinned", () => {
  const primitivePath =
    "../src/content/cards/special-projectiles-return.js";
  const primitiveBytes = readFileSync(new URL(primitivePath, import.meta.url));
  assert.equal(
    createHash("sha256").update(primitiveBytes).digest("hex"),
    "e34fe64880369975d09e14edfe004b572dbba6ea17bf0bf8e1a80e3d45ddf602",
  );
  const sourceText = readFileSync(
    new URL("../src/content/cards/spells-return.js", import.meta.url),
    "utf8",
  );
  assert.match(sourceText, /new ReturnEncounter/u);
  assert.match(sourceText, /ReturnEncounter\.restore/u);
  assert.doesNotMatch(
    sourceText,
    /function (?:collisionKey|passedLineContains|emitLegContacts)/u,
  );
  const spell = new ReturningSpellEncounter(setup());
  spell.step();
  const nested = JSON.parse(spell.serialize()).primitives[0].snapshot;
  assert.equal(ReturnEncounter.restore(nested).state.tick, 1);
});

test("setup is isolated and hostile or non-canonical snapshots are rejected", () => {
  const raw = {
    commands: [cast()],
    sources: [source()],
    victims: [victim(10, 2000)],
  };
  const encounter = new ReturningSpellEncounter(raw);
  raw.victims[0].health = 1;
  assert.equal(encounter.state.victims[0].health, 1000);
  assert.throws(
    () => createReturningSpellFixture({ ...raw, extra: true }),
    /invalid shape/u,
  );
  assert.throws(
    () => setup([cast(1, 0, { x: 1000, y: 1000 })]),
    /non-zero leg/u,
  );
  assert.throws(
    () => ReturningSpellEncounter.restore('{"tick":0,"identity":{},"version":1}'),
    /canonical/u,
  );
  assert.throws(
    () => ReturningSpellEncounter.restore('{"identity":{},"tick":0,"tick":1,"version":1}'),
    /canonical/u,
  );
});

test("failed oversized stepping is atomic", () => {
  const encounter = new ReturningSpellEncounter(setup());
  const before = encounter.serialize();
  assert.throws(() => encounter.stepMany(129), /bounded/u);
  assert.equal(encounter.serialize(), before);
  assert.deepEqual(encounter.replay, []);
});
