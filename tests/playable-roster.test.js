import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  PLAYABLE_CARD_IDS,
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
  resolvePlayableRosterQuestion,
  serializePlayableRoster,
} from "../src/content/playable-roster.js";
import {
  createBasicFlyingCatalog,
  createBasicMeleeCatalog,
  createBasicRangedCatalog,
  createSwarmCatalog,
} from "../src/content/index.js";
import { createInitialArenaHudSystems } from "../src/ui/arena-shell-entry.js";
import {
  protectedIdentityHits,
  referencePathHits,
} from "./helpers/protected-identity-scan.js";

function recursivelyFrozen(value) {
  if (value === null || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(recursivelyFrozen);
}

function sourceCards() {
  return [
    ...createBasicMeleeCatalog(),
    ...createBasicFlyingCatalog(),
    ...createBasicRangedCatalog(),
    ...createSwarmCatalog(),
  ];
}

test("playable roster: exact browser-shell deck order is centralized and immutable", () => {
  const shellCards = createInitialArenaHudSystems().cards;
  assert.deepEqual(
    shellCards.map(({ id }) => id),
    [...PLAYABLE_CARD_IDS],
  );
  assert.deepEqual(
    createPlayableRoster().map(({ cost, displayName, id }) => ({
      cost,
      displayName,
      id,
    })),
    shellCards,
  );
  assert.equal(Object.isFrozen(PLAYABLE_CARD_IDS), true);
});

test("playable roster: every catalog value projects exactly and swarms expand metadata", () => {
  const byId = new Map(sourceCards().map((card) => [card.id, card]));
  const roster = createPlayableRoster();
  const cardFields = [
    "areaDamageRadiusMillitiles",
    "cost",
    "count",
    "damage",
    "deployTimeTicks",
    "displayName",
    "firstHitTicks",
    "hitSpeedTicks",
    "hitpoints",
    "id",
    "kind",
    "movementMillitilesPerSecond",
    "rangeMillitiles",
    "rarity",
    "sightRangeMillitiles",
    "targetMode",
  ];
  const entityFields = [
    "areaDamageRadiusMillitiles",
    "count",
    "damage",
    "deployTimeTicks",
    "displayName",
    "firstHitTicks",
    "hitSpeedTicks",
    "hitpoints",
    "kind",
    "movementMillitilesPerSecond",
    "rangeMillitiles",
    "sightRangeMillitiles",
    "targetMode",
  ];

  for (const projected of roster) {
    const source = byId.get(projected.id);
    for (const field of cardFields) {
      assert.deepEqual(projected[field], source[field], `${source.id}.${field}`);
    }
    const expectedEntities = source.components.length === 0
      ? [{ ...source, id: source.id, role: "primary" }]
      : source.components;
    assert.equal(projected.entities.length, expectedEntities.length);
    assert.deepEqual(
      projected.formation,
      {
        componentOrder: expectedEntities.map(({ id }) => id),
        expansionOrder: "component-order-then-member-index",
        totalCount: expectedEntities.reduce((sum, item) => sum + item.count, 0),
      },
    );
    for (let index = 0; index < expectedEntities.length; index += 1) {
      const entity = projected.entities[index];
      const expected = expectedEntities[index];
      assert.equal(entity.archetypeId, expected.id);
      assert.equal(entity.role, expected.role);
      for (const field of entityFields) {
        assert.deepEqual(
          entity[field],
          expected[field],
          `${source.id}.${expected.id}.${field}`,
        );
      }
    }
  }

  assert.deepEqual(
    roster.find(({ id }) => id === "briar-band").entities.map(
      ({ archetypeId, count, role }) => ({ archetypeId, count, role }),
    ),
    [
      { archetypeId: "briar-runner", count: 3, role: "primary" },
      { archetypeId: "briar-darter", count: 3, role: "secondary" },
    ],
  );
  assert.deepEqual(
    roster.find(({ id }) => id === "cinderlings").entities.map(
      ({ archetypeId, count, role }) => ({ archetypeId, count, role }),
    ),
    [{ archetypeId: "cinderling", count: 3, role: "primary" }],
  );
});

test("playable roster: every live entity has explicit layer, targets, delivery, and policies", () => {
  const entities = createPlayableRoster().flatMap(({ entities }) => entities);
  assert.equal(entities.length, 9);
  assert.deepEqual(
    entities.filter(({ layer }) => layer === "air").map(({ archetypeId }) =>
      archetypeId
    ),
    ["copperskiff", "skymaul"],
  );
  assert.deepEqual(
    entities.filter(({ delivery }) => delivery === "projectile")
      .map(({ archetypeId }) => archetypeId).sort(),
    ["brassbolt", "briar-darter", "copperskiff", "reedsting"],
  );
  for (const entity of entities) {
    assert.ok(["ground", "air"].includes(entity.layer));
    assert.ok(["ground", "ground-and-air"].includes(entity.targetMode));
    assert.ok(["melee", "projectile"].includes(entity.delivery));
    assert.deepEqual(
      Object.keys(entity.bodyRadiusPolicy).sort(),
      ["kind", "questionKey"],
    );
    assert.equal(entity.bodyRadiusPolicy.kind, "question");
    if (entity.delivery === "melee") {
      assert.deepEqual(entity.projectileSpeedPolicy, {
        kind: "not-applicable",
        questionKey: null,
      });
    } else {
      assert.equal(entity.projectileSpeedPolicy.kind, "question");
    }
  }
});

test("playable roster: runtime estimates are unique fresh frozen QUESTION records", () => {
  const first = createPlayableRosterQuestionRecords();
  const second = createPlayableRosterQuestionRecords();
  const references = createPlayableRoster().flatMap(({ entities }) => entities)
    .flatMap((entity) => [
      entity.bodyRadiusPolicy,
      ...(entity.projectileSpeedPolicy.kind === "question"
        ? [entity.projectileSpeedPolicy]
        : []),
    ]);
  assert.equal(first.length, 13);
  assert.notEqual(first, second);
  assert.equal(recursivelyFrozen(first), true);
  assert.equal(recursivelyFrozen(second), true);
  assert.equal(new Set(first.map(({ key }) => key)).size, first.length);
  assert.deepEqual(
    references.map(({ questionKey }) => questionKey).sort(),
    first.map(({ key }) => key).sort(),
  );
  for (let index = 0; index < first.length; index += 1) {
    assert.notEqual(first[index], second[index]);
    assert.deepEqual(Object.keys(first[index]).sort(), [
      "authoritative",
      "confidence",
      "disposition",
      "key",
      "source",
      "value",
    ]);
    assert.equal(first[index].authoritative, false);
    assert.equal(first[index].confidence, "unverified");
    assert.equal(first[index].disposition, "question");
    assert.equal(
      resolvePlayableRosterQuestion(
        { kind: "question", questionKey: first[index].key },
        first,
      ),
      first[index].value,
    );
  }
});

test("playable roster: repeated construction and canonical serialization are stable", () => {
  const first = createPlayableRoster();
  const second = createPlayableRoster();
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.equal(recursivelyFrozen(first), true);
  for (let index = 0; index < first.length; index += 1) {
    assert.notEqual(first[index], second[index]);
    assert.notEqual(first[index].entities, second[index].entities);
  }
  const bytes = serializePlayableRoster();
  assert.equal(bytes, serializePlayableRoster());
  assert.equal(JSON.stringify(JSON.parse(bytes)), bytes);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "6fb8d84121ca039ea9315b7e505c8f02d5d7839e8fd5fc5cd19013a0d2b7fadb",
  );
});

test("playable roster: hostile inputs reject without changing later output", () => {
  const before = serializePlayableRoster();
  const attacks = [
    null,
    {},
    [...PLAYABLE_CARD_IDS].reverse(),
    [...PLAYABLE_CARD_IDS.slice(0, 7), PLAYABLE_CARD_IDS[0]],
    Object.assign([...PLAYABLE_CARD_IDS], { extra: true }),
    Object.setPrototypeOf([...PLAYABLE_CARD_IDS], null),
    Object.freeze([
      ...PLAYABLE_CARD_IDS.slice(0, 2),
      ...Array(1),
      ...PLAYABLE_CARD_IDS.slice(3),
    ]),
  ];
  for (const attack of attacks) {
    assert.throws(() => createPlayableRoster(attack));
    assert.equal(serializePlayableRoster(), before);
  }

  let getterRuns = 0;
  const accessor = [...PLAYABLE_CARD_IDS];
  Object.defineProperty(accessor, "0", {
    enumerable: true,
    get() {
      getterRuns += 1;
      return PLAYABLE_CARD_IDS[0];
    },
  });
  assert.throws(() => createPlayableRoster(accessor));
  assert.equal(getterRuns, 0);

  const questions = createPlayableRosterQuestionRecords();
  const policy = createPlayableRoster()[0].entities[0].bodyRadiusPolicy;
  assert.throws(() => resolvePlayableRosterQuestion(
    policy,
    questions.map((record) => record.key === policy.questionKey
      ? { ...record, value: record.value + 1 }
      : record),
  ));
  assert.throws(() => serializePlayableRoster("unexpected"));
  assert.throws(() => createPlayableRosterQuestionRecords("unexpected"));
  assert.equal(serializePlayableRoster(), before);
});

test("playable roster: policy resolution rejects hostile data without invoking getters", () => {
  const before = serializePlayableRoster();
  const questions = createPlayableRosterQuestionRecords();
  const policy = createPlayableRoster()[0].entities[0].bodyRadiusPolicy;
  let getterRuns = 0;
  const getter = () => {
    getterRuns += 1;
    return "question";
  };

  const policyAccessor = {};
  Object.defineProperties(policyAccessor, {
    kind: { enumerable: true, get: getter },
    questionKey: {
      enumerable: true,
      value: policy.questionKey,
    },
  });
  assert.throws(() => resolvePlayableRosterQuestion(policyAccessor, questions));

  const indexAccessor = [...questions];
  Object.defineProperty(indexAccessor, "0", {
    enumerable: true,
    get: getter,
  });
  assert.throws(() => resolvePlayableRosterQuestion(policy, indexAccessor));

  for (const field of [
    "authoritative",
    "confidence",
    "disposition",
    "key",
    "source",
    "value",
  ]) {
    const recordAccessor = questions.map((record) => ({ ...record }));
    Object.defineProperty(recordAccessor[0], field, {
      enumerable: true,
      get: getter,
    });
    assert.throws(() => resolvePlayableRosterQuestion(policy, recordAccessor));
  }
  assert.equal(getterRuns, 0);

  const attacks = [
    { ...policy, extra: true },
    Object.defineProperty({ ...policy }, "hidden", { value: true }),
    Object.assign({ ...policy }, { [Symbol("extra")]: true }),
    Object.setPrototypeOf({ ...policy }, null),
  ];
  for (const attack of attacks) {
    assert.throws(() => resolvePlayableRosterQuestion(attack, questions));
  }

  const questionAttacks = [
    questions.map((record, index) => index === 0
      ? { ...record, extra: true }
      : record),
    questions.map((record, index) => index === 0
      ? Object.defineProperty({ ...record }, "hidden", { value: true })
      : record),
    questions.map((record, index) => index === 0
      ? Object.assign({ ...record }, { [Symbol("extra")]: true })
      : record),
    questions.map((record, index) => index === 0
      ? Object.setPrototypeOf({ ...record }, null)
      : record),
    questions.map((record, index) => index === 12
      ? { ...record, value: record.value + 1 }
      : record),
    Object.assign([...questions], { extra: true }),
  ];
  for (const attack of questionAttacks) {
    assert.throws(() => resolvePlayableRosterQuestion(policy, attack));
  }
  assert.equal(getterRuns, 0);
  assert.equal(serializePlayableRoster(), before);
});

test("playable roster: every QUESTION field rejects nested executable values opaquely", () => {
  const before = serializePlayableRoster();
  const questions = createPlayableRosterQuestionRecords();
  const policy = createPlayableRoster()[0].entities[0].bodyRadiusPolicy;
  let trapRuns = 0;
  const nestedProxy = new Proxy({}, {
    get() {
      trapRuns += 1;
      throw new Error("nested proxy get must not execute");
    },
    getOwnPropertyDescriptor() {
      trapRuns += 1;
      throw new Error("nested proxy descriptor must not execute");
    },
    getPrototypeOf() {
      trapRuns += 1;
      throw new Error("nested proxy prototype must not execute");
    },
    ownKeys() {
      trapRuns += 1;
      throw new Error("nested proxy ownKeys must not execute");
    },
  });

  for (const field of [
    "authoritative",
    "confidence",
    "disposition",
    "key",
    "source",
    "value",
  ]) {
    const attack = questions.map((record, index) => index === 0
      ? { ...record, [field]: nestedProxy }
      : record);
    assert.throws(() => resolvePlayableRosterQuestion(policy, attack));
  }
  assert.equal(trapRuns, 0, "all six exact field probes must treat nested proxies opaquely");

  let getterRuns = 0;
  const nestedAccessor = {};
  Object.defineProperty(nestedAccessor, "coerce", {
    enumerable: true,
    get() {
      getterRuns += 1;
      throw new Error("nested accessor must not execute");
    },
  });
  const nestedArray = [];
  Object.defineProperty(nestedArray, "0", {
    enumerable: true,
    get() {
      getterRuns += 1;
      throw new Error("nested array accessor must not execute");
    },
  });
  const thenable = {};
  Object.defineProperty(thenable, "then", {
    enumerable: true,
    get() {
      getterRuns += 1;
      throw new Error("thenable must not be assimilated");
    },
  });
  const crossRealm = runInNewContext(`Object.defineProperty({}, "valueOf", {
    enumerable: true,
    get() { throw new Error("cross-realm getter must not execute"); }
  })`);
  for (const nested of [nestedAccessor, nestedArray, thenable, crossRealm]) {
    const attack = questions.map((record, index) => index === 0
      ? { ...record, value: nested }
      : record);
    assert.throws(() => resolvePlayableRosterQuestion(policy, attack));
  }
  assert.equal(getterRuns, 0);
  assert.equal(trapRuns, 0);
  assert.equal(serializePlayableRoster(), before);
});

test("playable roster: shipped module has no comparison import or protected identity", () => {
  const source = readFileSync(
    new URL("../src/content/playable-roster.js", import.meta.url),
    "utf8",
  );
  const benchmark = JSON.parse(readFileSync(
    new URL("../reference/stats/cards.json", import.meta.url),
    "utf8",
  ));
  const protectedTokens = new Set(
    benchmark.cards.flatMap(({ key, name }) => [key, name])
      .map((value) => value.toLowerCase()),
  );
  assert.deepEqual(referencePathHits(source), []);
  assert.deepEqual(protectedIdentityHits(source, protectedTokens), []);
  assert.doesNotMatch(source, /readFile|node:fs|Date|Math\.random|setTimeout/u);
});
