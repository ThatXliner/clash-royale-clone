import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createBasicMeleeCatalog,
  createBasicMeleeCombatant,
} from "../src/content/index.js";
import { MeleeDuel } from "../src/sim/melee.js";
import { protectedIdentityHits } from "./helpers/protected-identity-scan.js";
import { createReferenceParityEvaluator } from "./helpers/reference-parity.js";

const benchmark = JSON.parse(readFileSync(
  new URL("../reference/stats/cards.json", import.meta.url),
  "utf8",
));
const benchmarkCards = new Map(
  benchmark.cards.map((card) => [card.key, card]),
);

const EXPECTED = {
  brackenwheel: {
    benchmarkKey: "valkyrie",
    rarity: "uncommon",
  },
  coilblade: {
    benchmarkKey: "mini-pekka",
    rarity: "uncommon",
  },
  mossguard: {
    benchmarkKey: "knight",
    rarity: "standard",
  },
  ironroot: {
    benchmarkKey: "pekka",
    rarity: "special",
  },
};

const MECHANIC_FIELDS = [
  ["cost", "elixir_cost", (value) => value],
  ["kind", "type", (value) => value === "troop" ? "unit" : value],
  [
    "rarity",
    "rarity",
    (value) => ({
      common: "standard",
      rare: "uncommon",
      epic: "special",
    })[value],
  ],
  ["hitpoints", "hitpoints", (value) => value],
  ["damage", "damage", (value) => value],
  ["hitSpeedTicks", "hit_speed_seconds", (value) => value * 60],
  ["firstHitTicks", "first_hit_seconds", (value) => value * 60],
  ["deployTimeTicks", "deploy_time_seconds", (value) => value * 60],
  ["rangeMillitiles", "range_tiles", (value) => value * 1000],
  ["sightRangeMillitiles", "sight_range_tiles", (value) => value * 1000],
  [
    "movementMillitilesPerSecond",
    "movement_speed_tiles_per_second",
    (value) => value * 1000,
  ],
  ["targetMode", "targets", (value) => value],
  ["count", "count", (value) => value],
  [
    "areaDamageRadiusMillitiles",
    "area_damage_radius_tiles",
    (value) => value === null ? null : value * 1000,
  ],
];

const evaluateReferenceParity = createReferenceParityEvaluator(
  benchmark.cards,
  MECHANIC_FIELDS,
  ["knight", "mini-pekka", "pekka", "valkyrie"],
);

function attacks(replay, attackerId) {
  return replay
    .filter((event) =>
      event.type === "attack" && event.attackerId === attackerId
    )
    .map(({ tick }) => tick);
}

function setup(leftCardId, rightCardId, reverseInput = false) {
  const combatants = [
    createBasicMeleeCombatant(leftCardId, {
      entityId: 101,
      position: 0,
      radius: 500,
    }),
    createBasicMeleeCombatant(rightCardId, {
      entityId: 202,
      position: 1800,
      radius: 500,
    }),
  ];
  return {
    combatants: reverseInput ? combatants.reverse() : combatants,
  };
}

function run(leftCardId, rightCardId, reverseInput = false) {
  const duel = new MeleeDuel(setup(
    leftCardId,
    rightCardId,
    reverseInput,
  ));
  return {
    duel,
    result: duel.run(1000),
  };
}

test("basic melee content: catalog is exact, canonical, and isolated", () => {
  const first = createBasicMeleeCatalog();
  assert.deepEqual(
    first.map(({ id, displayName }) => ({ id, displayName })),
    [
      { id: "brackenwheel", displayName: "Brackenwheel" },
      { id: "coilblade", displayName: "Coilblade" },
      { id: "ironroot", displayName: "Ironroot" },
      { id: "mossguard", displayName: "Mossguard" },
    ],
  );
  assert.equal(first.length, 4);
  for (const card of first) {
    assert.equal(card.kind, "unit");
    assert.equal(card.targetMode, "ground");
    assert.equal(card.count, 1);
    assert.equal(card.areaDamageRadiusMillitiles,
      card.id === "brackenwheel" ? 2_000 : null);
    assert.deepEqual(card.components, []);
  }

  const firstCoilblade = first.find(({ id }) => id === "coilblade");
  firstCoilblade.damage = 1;
  firstCoilblade.components.push({});
  const second = createBasicMeleeCatalog();
  const secondCoilblade = second.find(({ id }) => id === "coilblade");
  assert.equal(secondCoilblade.damage, 720);
  assert.deepEqual(secondCoilblade.components, []);
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(firstCoilblade, secondCoilblade);
});

test("basic melee content: field parity is reported with confidence", (context) => {
  const reports = [];
  for (const runtimeCard of createBasicMeleeCatalog()) {
    const mapping = EXPECTED[runtimeCard.id];
    assert.ok(
      benchmarkCards.has(mapping.benchmarkKey),
      `missing test-only benchmark ${mapping.benchmarkKey}`,
    );

    const result = evaluateReferenceParity(
      runtimeCard,
      mapping.benchmarkKey,
    );
    assert.deepEqual(result.authoritativeFailures, []);
    reports.push({
      identity: "original-runtime-identity",
      runtimeId: runtimeCard.id,
      ...result,
    });
  }

  assert.equal(reports.length, 4);
  assert.equal(
    reports.flatMap(({ fields }) => fields).filter(
      ({ disposition }) => (
        disposition === "match" ||
        disposition === "question-backed-match"
      ),
    ).length,
    56,
  );
  context.diagnostic(`parity report ${JSON.stringify(reports)}`);
});

test("basic melee content: an authoritative mutation is a hard failure", () => {
  const runtimeCard = createBasicMeleeCatalog().find(
    ({ id }) => id === "mossguard",
  );
  runtimeCard.cost += 1;

  const result = evaluateReferenceParity(
    runtimeCard,
    "knight",
  );
  assert.deepEqual(result.authoritativeFailures, [
    {
      actual: 4,
      benchmarkField: "elixir_cost",
      disposition: "authoritative-failure",
      expected: 3,
      provenance: {
        confidence: "authoritative",
        source: "cards.json corroborated field elixir_cost",
      },
      runtimeCard: "mossguard",
      runtimeField: "cost",
    },
  ]);
});

test("basic melee content: an unverified mutation is recorded as a question", () => {
  const runtimeCard = createBasicMeleeCatalog().find(
    ({ id }) => id === "mossguard",
  );
  runtimeCard.hitpoints += 1;

  const result = evaluateReferenceParity(
    runtimeCard,
    "knight",
  );
  assert.deepEqual(result.authoritativeFailures, []);
  assert.deepEqual(
    result.questions.filter(({ disposition }) => disposition === "question"),
    [
      {
        actual: 1767,
        benchmarkField: "hitpoints",
        disposition: "question",
        expected: 1766,
        provenance: {
          confidence: "unverified",
          source: "cards.json unverified_fields contains hitpoints",
        },
        runtimeCard: "mossguard",
        runtimeField: "hitpoints",
      },
    ],
  );
});

test("basic melee content: parity provenance is an isolated trusted snapshot", () => {
  const cards = structuredClone(benchmark.cards);
  const mappings = MECHANIC_FIELDS.map((entry) => [...entry]);
  const evaluate = createReferenceParityEvaluator(
    cards,
    mappings,
    ["knight", "mini-pekka"],
  );
  const runtimeCard = createBasicMeleeCatalog().find(({ id }) => id === "mossguard");

  const source = cards.find(({ key }) => key === "knight");
  source.unverified_fields.length = 0;
  source.unverified_fields.includes = () => false;
  source.elixir_cost = 999;
  mappings[0][0] = "damage";
  mappings[0][1] = "hitpoints";
  mappings[0][2] = () => 999;

  runtimeCard.hitpoints += 1;
  const report = evaluate(runtimeCard, "knight");
  assert.equal(
    report.fields.find(({ benchmarkField }) => benchmarkField === "hitpoints")
      .disposition,
    "question",
  );
  assert.equal(
    report.fields.find(({ benchmarkField }) => benchmarkField === "elixir_cost")
      .expected,
    3,
  );
  assert.deepEqual(report.authoritativeFailures, []);
});

test("basic melee content: parity boundary rejects hostile provenance", () => {
  const cardIndex = benchmark.cards.findIndex(({ key }) => key === "knight");

  for (const mutate of [
    (cards) => cards.push(structuredClone(cards[0])),
    (cards) => cards[cardIndex].key = "",
    (cards) => cards[cardIndex].unverified_fields.push("not_a_field"),
    (cards) => cards[cardIndex].unverified_fields.push(
      cards[cardIndex].unverified_fields[0],
    ),
    (cards) => {
      cards[cardIndex].unverified_fields.includes = () => false;
    },
    (cards) => {
      Object.setPrototypeOf(cards[cardIndex], null);
    },
    (cards) => {
      Object.defineProperty(cards[cardIndex], "key", { get() { throw new Error("read"); } });
    },
    (cards) => {
      delete cards[cardIndex].unverified_fields[0];
    },
  ]) {
    const cards = structuredClone(benchmark.cards);
    mutate(cards);
    assert.throws(
      () => createReferenceParityEvaluator(
        cards,
        MECHANIC_FIELDS,
        ["knight", "mini-pekka", "pekka"],
      ),
    );
  }

  const unrelated = structuredClone(benchmark.cards);
  Object.defineProperty(unrelated[cardIndex], "notes", {
    get() {
      throw new Error("unrelated fields stay outside the parity contract");
    },
  });
  assert.doesNotThrow(() => createReferenceParityEvaluator(
    unrelated,
    MECHANIC_FIELDS,
    ["knight", "mini-pekka", "pekka"],
  ));
});

test("basic melee content: parity boundary rejects malformed mappings and calls", () => {
  const malformedMappings = [
    [],
    [["cost", "unknown_field", (value) => value]],
    [["cost", "elixir_cost", (value) => value], ["cost", "hitpoints", (value) => value]],
    [["cost", "elixir_cost", (value) => value], ["damage", "elixir_cost", (value) => value]],
    [["cost", "elixir_cost"]],
    [["cost", "elixir_cost", () => Number.NaN]],
    [["cost", "elixir_cost", () => Number.MAX_SAFE_INTEGER + 1]],
  ];
  for (const mappings of malformedMappings) {
    assert.throws(
      () => createReferenceParityEvaluator(
        benchmark.cards,
        mappings,
        ["knight", "mini-pekka"],
      ),
    );
  }

  const sparse = [...MECHANIC_FIELDS];
  delete sparse[0];
  assert.throws(() => createReferenceParityEvaluator(
    benchmark.cards,
    sparse,
    ["knight", "mini-pekka", "pekka"],
  ));
  for (const cardKeys of [
    ["knight", "knight"],
    ["knight", "unknown"],
    [],
  ]) {
    assert.throws(() => createReferenceParityEvaluator(
      benchmark.cards,
      MECHANIC_FIELDS,
      cardKeys,
    ));
  }
  const sparseCardKeys = ["knight", "mini-pekka"];
  delete sparseCardKeys[0];
  assert.throws(() => createReferenceParityEvaluator(
    benchmark.cards,
    MECHANIC_FIELDS,
    sparseCardKeys,
  ));

  const evaluate = createReferenceParityEvaluator(
    benchmark.cards,
    MECHANIC_FIELDS,
    ["knight", "mini-pekka"],
  );
  const runtimeCard = createBasicMeleeCatalog().find(({ id }) => id === "mossguard");
  assert.throws(() => evaluate(runtimeCard, "unknown"));
  Object.defineProperty(runtimeCard, "cost", {
    configurable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  assert.throws(() => evaluate(runtimeCard, "knight"), /data property/u);
});

test("basic melee content: shipped module contains only original identities", () => {
  const source = readFileSync(
    new URL("../src/content/cards/basic-melee.js", import.meta.url),
    "utf8",
  );
  const protectedTokens = new Set(
    benchmark.cards.flatMap(({ key, name }) => [
      key.toLowerCase(),
      name.toLowerCase(),
    ]),
  );
  assert.deepEqual(protectedIdentityHits(source, protectedTokens), []);
  assert.doesNotMatch(source, /\breference\b/u);
  assert.doesNotMatch(source, /readFile|cards\.json/u);
});

test("basic melee content: mirrors resolve at derived ticks", () => {
  const moss = run("mossguard", "mossguard");
  assert.deepEqual(attacks(moss.duel.replay, 101), [
    102, 174, 246, 318, 390, 462, 534, 606, 678,
  ]);
  assert.deepEqual(attacks(moss.duel.replay, 202), [
    102, 174, 246, 318, 390, 462, 534, 606, 678,
  ]);
  assert.deepEqual(moss.result.outcome, {
    deathTick: 678,
    draw: true,
    winnerId: null,
  });

  const coil = run("coilblade", "coilblade");
  assert.deepEqual(attacks(coil.duel.replay, 101), [126, 222]);
  assert.deepEqual(attacks(coil.duel.replay, 202), [126, 222]);
  assert.deepEqual(coil.result.outcome, {
    deathTick: 222,
    draw: true,
    winnerId: null,
  });
});

test("basic melee content: cross-duel is derived from runtime definitions", () => {
  const { duel, result } = run("mossguard", "coilblade");
  assert.deepEqual(attacks(duel.replay, 101), [102, 174, 246, 318]);
  assert.deepEqual(attacks(duel.replay, 202), [126, 222, 318]);
  assert.deepEqual(result.outcome, {
    deathTick: 318,
    draw: false,
    winnerId: 202,
  });
  assert.deepEqual(
    result.state.combatants.map(({ hitpoints, id }) => ({ hitpoints, id })),
    [
      { hitpoints: 0, id: 101 },
      { hitpoints: 553, id: 202 },
    ],
  );
});

test("basic melee content: input order and snapshot boundaries are deterministic", () => {
  const forward = run("mossguard", "coilblade");
  const reversed = run("mossguard", "coilblade", true);
  assert.deepEqual(reversed.result, forward.result);
  assert.equal(reversed.duel.serialize(), forward.duel.serialize());
  assert.deepEqual(reversed.duel.replay, forward.duel.replay);

  const uninterrupted = new MeleeDuel(setup("mossguard", "coilblade"));
  uninterrupted.stepMany(200);
  const snapshot = uninterrupted.serialize();
  const restored = MeleeDuel.restore(snapshot);
  assert.equal(restored.serialize(), snapshot);
  assert.deepEqual(restored.state, uninterrupted.state);
  assert.deepEqual(restored.replay, uninterrupted.replay);
  assert.deepEqual(restored.run(1000), uninterrupted.run(1000));
  assert.equal(restored.serialize(), uninterrupted.serialize());
});

test("basic melee content: splash identity uses only the shared battle reducer", () => {
  assert.throws(() => createBasicMeleeCombatant("brackenwheel", {
    entityId: 1, position: 0, radius: 500,
  }), /shared battle area reducer/u);
});

test("basic melee content: full raw signature leaves non-schema mechanics unresolved", () => {
  const linked = JSON.parse(readFileSync(new URL(
    "../artifacts/melee-area-full-signature-scope/builder/pinned-linked-rows.json",
    import.meta.url,
  ), "utf8"));
  assert.deepEqual(linked.row_field_counts, { cards: 9, troop: 81, character: 289 });
  assert.equal(linked.scope.comparison_only, true);
  assert.equal(linked.scope.card_id, 26_000_011);
  const raw = linked.rows.character;
  assert.equal(Object.keys(raw).length, 289);

  const unresolved = {
    attack_finish_time: { value: 100, disposition: "unimplemented-question" },
    override_attack_finish_time: { value: true, disposition: "unimplemented-question" },
    mass: { value: 5, disposition: "unimplemented-question" },
    collision_radius: { value: 500, disposition: "unimplemented-question" },
    projectile_start_radius: { value: 450, disposition: "unimplemented-question" },
    projectile_start_z: { value: 450, disposition: "unimplemented-question" },
    scale: { value: 140, disposition: "unimplemented-question" },
    multiple_targets: { value: 0, disposition: "unimplemented-question" },
    all_targets_hit: { value: false, disposition: "unimplemented-question" },
    movement_speed: { value: "medium", disposition: "unimplemented-question" },
  };
  for (const [field, receipt] of Object.entries(unresolved)) {
    const sourceValue = field === "movement_speed"
      ? benchmarkCards.get("valkyrie").movement_speed
      : raw[field];
    assert.equal(sourceValue, receipt.value, field);
    assert.equal(receipt.disposition, "unimplemented-question");
  }
  const radiusConflict = {
    normalizedPinnedRadiusMillitiles: 2_000,
    publisher2019RadiusMillitiles: 2_400,
    selectedAuthoritativeRadiusMillitiles: null,
    disposition: "question",
  };
  assert.equal(radiusConflict.selectedAuthoritativeRadiusMillitiles, null);
  assert.equal(radiusConflict.disposition, "question");

  const runtimeCard = createBasicMeleeCatalog().find(({ id }) => id === "brackenwheel");
  const parity = evaluateReferenceParity(runtimeCard, "valkyrie");
  assert.deepEqual(parity.authoritativeFailures, []);
  const questions = new Map(parity.fields.map((field) => [field.benchmarkField, field]));
  for (const field of benchmarkCards.get("valkyrie").unverified_fields) {
    assert.ok(questions.has(field) || field === "movement_speed",
      `${field} is either projected through a QUESTION or explicitly outside common schema`);
  }
  assert.equal(benchmarkCards.get("valkyrie").movement_speed, "medium");
  assert.equal(questions.get("area_damage_radius_tiles").disposition,
    "question-backed-match");
  for (const field of [
    "attack_finish_time", "override_attack_finish_time", "mass",
    "collision_radius", "projectile_start_radius", "projectile_start_z",
    "scale", "multiple_targets", "all_targets_hit",
  ]) {
    assert.equal(Object.hasOwn(runtimeCard, field), false,
      `${field} stays out of runtime content`);
  }
});

test("basic melee content: projection validates identity and placement", () => {
  assert.throws(() => createBasicMeleeCombatant("unknown", {
    entityId: 1,
    position: 0,
    radius: 500,
  }));
  for (const placement of [
    { entityId: 0, position: 0, radius: 500 },
    { entityId: 1, position: 0, radius: -1 },
    { entityId: 1, position: 0 },
    { entityId: 1, position: 0, radius: 500, extra: true },
  ]) {
    assert.throws(() => createBasicMeleeCombatant("mossguard", placement));
  }
});
