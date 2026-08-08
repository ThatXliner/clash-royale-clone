import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  RetargetAttackEncounter,
  createRetargetFixture,
  createRetargetQuestionRecords,
  createRetargetSpecialCatalog,
} from "../src/content/index.js";
import { protectedIdentityHits } from "./helpers/protected-identity-scan.js";
import { createReferenceParityEvaluator } from "./helpers/reference-parity.js";

const corpus = JSON.parse(readFileSync(
  new URL("../reference/stats/cards.json", import.meta.url),
  "utf8",
));
const parity = createReferenceParityEvaluator(corpus.cards, [
  ["cost", "elixir_cost", (value) => value],
  ["kind", "type", (value) => value === "troop" ? "unit" : value],
  ["rarity", "rarity", (value) => value === "common" ? "standard" : value],
  ["hitpoints", "hitpoints", (value) => value],
  ["damage", "damage", (value) => value],
  ["hitSpeedTicks", "hit_speed_seconds", (value) => value * 60],
  ["firstHitTicks", "first_hit_seconds", (value) => value * 60],
  ["deployTimeTicks", "deploy_time_seconds", (value) => value * 60],
  ["rangeMillitiles", "range_tiles", (value) => value * 1_000],
  ["sightRangeMillitiles", "sight_range_tiles", (value) => value * 1_000],
  ["movementMillitilesPerSecond", "movement_speed_tiles_per_second",
    (value) => value * 1_000],
  ["targetMode", "targets", (value) => value],
  ["count", "count", (value) => value],
  ["areaDamageRadiusMillitiles", "area_damage_radius_tiles",
    (value) => value === null ? null : value * 1_000],
], ["knight"]);

const candidate = (
  id,
  x,
  {
    alive = true,
    health = 1_000,
    kind = "troop",
    layer = "ground",
    radius = 0,
    targetable = true,
    y = 0,
  } = {},
) => ({
  alive,
  health,
  id,
  kind,
  layer,
  position: { x, y },
  radius,
  targetable,
});
const set = (tick, value) => ({
  candidate: value,
  targetId: value.id,
  tick,
  type: "set-candidate",
});
const remove = (tick, targetId) => ({
  candidate: null,
  targetId,
  tick,
  type: "remove-candidate",
});
const encounter = (candidates, commands = []) =>
  new RetargetAttackEncounter(createRetargetFixture(candidates, commands));
const ofType = (sim, type) =>
  sim.replay.filter((entry) => entry.type === type);

function modeEligible(value) {
  return value.alive && value.targetable && value.layer === "ground";
}

function within(value, reach) {
  const dx = BigInt(value.position.x);
  const dy = BigInt(value.position.y);
  const limit = BigInt(300 + reach + value.radius);
  return dx * dx + dy * dy <= limit * limit;
}

// Independent test-local reducer/oracle. It imports neither targeting nor
// attack-cycle and intentionally spells out the causal boundary order.
function oracle(setup, count) {
  const values = structuredClone(setup.candidates);
  const commands = structuredClone(setup.commands);
  const history = [];
  let attackSequence = 0;
  let commandIndex = 0;
  let nextAttackTick = null;
  let phase = "deploying";
  let selectedId = null;
  let attackId = null;
  for (let tick = 0; tick < count; tick += 1) {
    while (commands[commandIndex]?.tick === tick) {
      const command = commands[commandIndex++];
      const index = values.findIndex(({ id }) => id === command.targetId);
      if (command.type === "remove-candidate") {
        if (index !== -1) values.splice(index, 1);
      } else if (index === -1) {
        values.push(structuredClone(command.candidate));
      } else {
        values[index] = structuredClone(command.candidate);
      }
    }
    const current = values.find(({ id }) => id === selectedId);
    let selected = current && modeEligible(current) && within(current, 5_500)
      ? current
      : null;
    if (selected === null) {
      selected = values.filter((value) =>
        modeEligible(value) && within(value, 5_500)
      ).sort((left, right) => {
        const leftDistance =
          BigInt(left.position.x) ** 2n + BigInt(left.position.y) ** 2n;
        const rightDistance =
          BigInt(right.position.x) ** 2n + BigInt(right.position.y) ** 2n;
        return leftDistance < rightDistance
          ? -1
          : leftDistance > rightDistance
          ? 1
          : left.id - right.id;
      })[0] ?? null;
    }
    const nextId = selected?.id ?? null;
    if (nextId !== selectedId) {
      if (selectedId !== null) {
        history.push({ targetId: selectedId, tick, type: "target-lost" });
      }
      selectedId = nextId;
      if (selectedId !== null) {
        history.push({ targetId: selectedId, tick, type: "target-acquired" });
      }
    }

    if (phase === "deploying" && tick >= 60) phase = "idle";
    if (phase !== "deploying") {
      const attackCandidate = values.find(({ id }) => id === selectedId);
      const eligibleId =
        attackCandidate && within(attackCandidate, 1_200) ? selectedId : null;
      if (attackId !== eligibleId) {
        attackId = eligibleId;
        if (attackId === null) {
          phase = "idle";
          nextAttackTick = null;
        } else {
          phase = "winding";
          nextAttackTick = tick + 42;
        }
      }
      if (attackId !== null && nextAttackTick === tick) {
        attackSequence += 1;
        history.push({
          sequence: attackSequence,
          targetId: attackId,
          tick,
          type: "attack-ready",
        });
        phase = "cycling";
        nextAttackTick = tick + 72;
        const target = values.find(({ id }) => id === attackId);
        const healthBefore = target.health;
        target.health = Math.max(0, target.health - 202);
        target.alive = target.health > 0;
        history.push({
          amount: 202,
          healthAfter: target.health,
          healthBefore,
          targetId: target.id,
          tick,
          type: "damage",
        });
        if (!target.alive) {
          history.push({ targetId: target.id, tick, type: "death" });
        }
      }
    }
  }
  return { history, selectedId, values };
}

test("retarget lifecycle: Wayfinder is original and Knight is test-only corpus mapping", () => {
  const card = createRetargetSpecialCatalog()[0];
  assert.deepEqual(card, {
    areaDamageRadiusMillitiles: null,
    components: [],
    cost: 3,
    count: 1,
    damage: 202,
    deployTimeTicks: 60,
    displayName: "Wayfinder",
    firstHitTicks: 42,
    hitSpeedTicks: 72,
    hitpoints: 1766,
    id: "wayfinder",
    kind: "unit",
    movementMillitilesPerSecond: 1000,
    rangeMillitiles: 1200,
    rarity: "standard",
    sightRangeMillitiles: 5500,
    targetMode: "ground",
  });
  card.damage = 1;
  assert.equal(createRetargetSpecialCatalog()[0].damage, 202);

  const ordinary = corpus.cards.find(({ key }) => key === "knight");
  assert.ok(ordinary);
  assert.deepEqual({
    cost: ordinary.elixir_cost,
    damage: ordinary.damage,
    deploy: ordinary.deploy_time_seconds * 60,
    first: ordinary.first_hit_seconds * 60,
    hitpoints: ordinary.hitpoints,
    range: ordinary.range_tiles * 1_000,
    sight: ordinary.sight_range_tiles * 1_000,
    speed: ordinary.movement_speed_tiles_per_second * 1_000,
    cycle: ordinary.hit_speed_seconds * 60,
  }, {
    cost: 3,
    cycle: 72,
    damage: 202,
    deploy: 60,
    first: 42,
    hitpoints: 1766,
    range: 1200,
    sight: 5500,
    speed: 1000,
  });
  assert.equal(ordinary.unverified_fields.includes("hit_speed_seconds"), false);
  assert.deepEqual(ordinary.unverified_fields, [
    "hitpoints",
    "damage",
    "first_hit_seconds",
    "deploy_time_seconds",
    "range_tiles",
    "sight_range_tiles",
    "movement_speed_tiles_per_second",
    "movement_speed",
    "targets",
    "count",
  ]);
  const report = parity(createRetargetSpecialCatalog()[0], "knight");
  assert.deepEqual(report.authoritativeFailures, []);
  assert.deepEqual(
    report.fields.filter(({ disposition }) => disposition === "match")
      .map(({ runtimeField }) => runtimeField),
    ["cost", "kind", "rarity", "hitSpeedTicks", "areaDamageRadiusMillitiles"],
  );
  assert.equal(report.questions.length, 9);
  assert.ok(report.questions.every(
    ({ disposition }) => disposition === "question-backed-match",
  ));

  const source = readFileSync(
    new URL("../src/content/cards/special-movement-retarget.js", import.meta.url),
    "utf8",
  );
  const protectedTokens = new Set(corpus.cards.flatMap(({ key, name }) => [
    key.toLowerCase(),
    name.toLowerCase(),
  ]));
  assert.deepEqual(protectedIdentityHits(source, protectedTokens), []);
  assert.doesNotMatch(source, /readFile|cards\.json|reference\//u);
});

test("retarget lifecycle: every absent choice is a fresh recursively frozen QUESTION", () => {
  const expected = [
    "attackBoundaryInclusive",
    "attackReachEligibility",
    "attackerPosition",
    "attackerRadiusMillitiles",
    "candidateMutationPriority",
    "damageApplication",
    "deathInvalidation",
    "deathOnReadyBoundarySuppression",
    "differentIdReacquisition",
    "distanceMetric",
    "eligibilityLossCancellation",
    "eligibilityReentry",
    "eventOrdering",
    "idLossCancellation",
    "missingIdInvalidation",
    "modeInvalidation",
    "readinessPriority",
    "sameIdReentry",
    "sightBoundaryInclusive",
    "sightInvalidation",
    "stickyRetention",
    "syntheticCandidateHealth",
    "targetableInvalidation",
    "tieBreak",
  ];
  const first = createRetargetQuestionRecords();
  const second = createRetargetQuestionRecords();
  assert.deepEqual(Object.keys(first).sort(), expected.sort());
  assert.ok(Object.isFrozen(first));
  for (const key of expected) {
    assert.notStrictEqual(first[key], second[key]);
    assert.deepEqual({
      authoritative: first[key].authoritative,
      confidence: first[key].confidence,
      disposition: first[key].disposition,
      key: first[key].key,
      source: first[key].source,
    }, {
      authoritative: false,
      confidence: "unverified",
      disposition: "question",
      key,
      source: "unsourced-retarget-attack-lifecycle-composition",
    });
    assert.ok(Object.isFrozen(first[key]));
    if (first[key].value && typeof first[key].value === "object") {
      assert.ok(Object.isFrozen(first[key].value));
    }
  }
  assert.throws(() => {
    first.eventOrdering.value.push("forged");
  }, TypeError);
  assert.throws(
    () => createRetargetQuestionRecords({ attackerRadiusMillitiles: 0 }),
    /do not accept overrides/u,
  );
});

test("retarget lifecycle: inclusive sight and attack edges are exact at ±1", () => {
  for (const [x, acquired] of [[5_799, true], [5_800, true], [5_801, false]]) {
    const sim = encounter([candidate(201, x)]);
    sim.step();
    assert.equal(sim.state.selectedTargetId, acquired ? 201 : null, `sight ${x}`);
  }
  for (const [x, firstReady] of [[1_499, 102], [1_500, 102], [1_501, null]]) {
    const sim = encounter([candidate(201, x)]);
    sim.stepMany(103);
    assert.equal(ofType(sim, "attack-ready")[0]?.tick ?? null, firstReady);
  }
});

test("retarget lifecycle: deploy, first-hit, and retained 72-tick cadence boundaries are exact", () => {
  const sim = encounter([candidate(201, 1_000, { health: 2_000 })]);
  sim.stepMany(60);
  assert.equal(sim.state.attack.phase, "deploying");
  assert.equal(sim.state.attack.targetId, null);
  sim.step();
  assert.equal(sim.state.attack.phase, "winding");
  assert.equal(sim.state.attack.nextAttackTick, 102);
  sim.stepMany(187);
  assert.deepEqual(ofType(sim, "attack-ready").map(({ tick }) => tick), [
    102,
    174,
    246,
  ]);
  assert.equal(sim.state.attack.nextAttackTick, 318);
});

test("retarget lifecycle: reversed equidistant candidates use ascending stable ID", () => {
  for (const values of [
    [candidate(202, -1_000), candidate(201, 1_000)],
    [candidate(201, 1_000), candidate(202, -1_000)],
  ]) {
    const sim = encounter(values);
    sim.step();
    assert.equal(sim.state.selectedTargetId, 201);
  }
});

test("retarget lifecycle: nearer candidates never steal a valid sticky target", () => {
  const sim = encounter(
    [candidate(202, 1_400)],
    [set(10, candidate(201, 100))],
  );
  sim.stepMany(11);
  assert.deepEqual(ofType(sim, "target-acquired").map(({ targetId }) => targetId),
    [202]);
  assert.equal(sim.state.selectedTargetId, 202);
});

test("retarget lifecycle: every invalidation route deterministically reacquires", () => {
  const invalid = [
    ["missing", remove(10, 201)],
    ["dead", set(10, candidate(201, 1_000, { alive: false, health: 0 }))],
    ["untargetable", set(10, candidate(201, 1_000, { targetable: false }))],
    ["mode", set(10, candidate(201, 1_000, { layer: "air" }))],
    ["sight", set(10, candidate(201, 5_801))],
  ];
  for (const [label, command] of invalid) {
    const sim = encounter(
      [candidate(201, 1_000), candidate(202, 1_400)],
      [command],
    );
    sim.stepMany(11);
    assert.deepEqual(
      sim.replay.filter(({ type }) => type.startsWith("target-")).map(
        ({ targetId, tick, type }) => ({ targetId, tick, type }),
      ),
      [
        { targetId: 201, tick: 0, type: "target-acquired" },
        { targetId: 201, tick: 10, type: "target-lost" },
        { targetId: 202, tick: 10, type: "target-acquired" },
      ],
      label,
    );
  }
});

test("retarget lifecycle: reach loss cancels readiness without losing sticky sight", () => {
  const sim = encounter(
    [candidate(201, 1_500)],
    [
      set(80, candidate(201, 1_501)),
      set(81, candidate(201, 1_500)),
    ],
  );
  sim.stepMany(124);
  assert.deepEqual(ofType(sim, "target-acquired").map(({ tick }) => tick), [0]);
  assert.equal(sim.state.selectedTargetId, 201);
  assert.deepEqual(ofType(sim, "attack-ready").map(({ tick }) => tick), [123]);
});

test("retarget lifecycle: same-ID reentry receives a full fresh windup", () => {
  const sim = encounter(
    [candidate(201, 1_000)],
    [
      remove(90, 201),
      set(91, candidate(201, 1_000)),
    ],
  );
  sim.stepMany(134);
  assert.deepEqual(ofType(sim, "target-acquired").map(({ tick }) => tick), [0, 91]);
  assert.deepEqual(ofType(sim, "attack-ready").map(({ tick }) => tick), [133]);
});

test("retarget lifecycle: command-first death on ready boundary suppresses old attack", () => {
  const sim = encounter(
    [candidate(201, 1_000), candidate(202, 1_200)],
    [set(102, candidate(201, 1_000, { alive: false, health: 0 }))],
  );
  sim.stepMany(145);
  assert.equal(sim.replay.some(
    ({ targetId, tick, type }) =>
      targetId === 201 && tick === 102 && type === "attack-ready"
  ), false);
  assert.deepEqual(ofType(sim, "attack-ready").map(({ targetId, tick }) => ({
    targetId,
    tick,
  })), [{ targetId: 202, tick: 144 }]);
});

test("retarget lifecycle: all same-boundary candidate mutations precede selection and readiness", () => {
  const sim = encounter(
    [candidate(201, 1_000), candidate(202, 1_100), candidate(203, 1_200)],
    [
      set(102, candidate(201, 1_000, { alive: false, health: 0 })),
      set(102, candidate(202, 1_100, { targetable: false })),
    ],
  );
  sim.stepMany(145);
  assert.deepEqual(
    sim.replay.filter(({ tick }) => tick === 102).map(({ targetId, type }) => ({
      targetId,
      type,
    })),
    [
      { targetId: 201, type: "target-lost" },
      { targetId: 203, type: "target-acquired" },
    ],
  );
  assert.deepEqual(ofType(sim, "attack-ready").map(({ targetId, tick }) => ({
    targetId,
    tick,
  })), [{ targetId: 203, tick: 144 }]);
});

test("retarget lifecycle: canonical trace is 201→202→203 with stable event order", () => {
  const setup = createRetargetFixture(
    [candidate(201, 1_000), candidate(202, 1_100), candidate(203, 1_200)],
    [
      set(102, candidate(201, 1_000, { alive: false, health: 0 })),
      set(144, candidate(202, 1_100, { alive: false, health: 0 })),
    ],
  );
  const sim = new RetargetAttackEncounter(setup);
  sim.stepMany(187);
  assert.deepEqual(ofType(sim, "target-acquired").map(({ targetId }) => targetId),
    [201, 202, 203]);
  assert.deepEqual(ofType(sim, "attack-ready").map(({ targetId, tick }) => ({
    targetId,
    tick,
  })), [{ targetId: 203, tick: 186 }]);
  assert.deepEqual(
    sim.replay.filter(({ tick }) => tick === 144).map(({ type }) => type),
    ["target-lost", "target-acquired"],
  );
  assert.deepEqual(
    sim.replay.filter(({ tick }) => tick === 186).map(({ type }) => type),
    ["attack-ready", "damage"],
  );
  assert.deepEqual(sim.replay, oracle(setup, 187).history);
});

test("retarget lifecycle: catalog, fixtures, state, events, and questions are isolated", () => {
  const source = [candidate(201, 1_000)];
  const commands = [set(3, candidate(202, 900))];
  const fixture = createRetargetFixture(source, commands);
  source[0].position.x = 99_000;
  commands[0].candidate.position.x = 99_000;
  fixture.candidates[0].position.x = 88_000;
  const sim = encounter([candidate(201, 1_000)]);
  sim.stepMany(103);
  const state = sim.state;
  const replay = sim.replay;
  state.candidates[0].health = 0;
  replay[0].targetId = 999;
  assert.equal(sim.state.candidates[0].health, 798);
  assert.equal(sim.replay[0].targetId, 201);
  assert.equal(createRetargetFixture([candidate(201, 1_000)]).candidates[0]
    .position.x, 1_000);
});

test("retarget lifecycle: hostile getters, prototypes, sparse, extra, duplicate, unsafe, and oversized inputs reject", () => {
  let getterCalls = 0;
  const hostile = { ...candidate(201, 1_000) };
  Object.defineProperty(hostile, "id", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error("must not execute");
    },
  });
  assert.throws(() => createRetargetFixture([hostile]), /invalid shape/u);
  assert.equal(getterCalls, 0);
  assert.throws(() =>
    createRetargetFixture([Object.assign(Object.create({}), candidate(1, 0))])
  );
  const sparse = Array(1);
  assert.throws(() => createRetargetFixture(sparse));
  assert.throws(() => createRetargetFixture([{ ...candidate(1, 0), extra: 1 }]));
  assert.throws(() =>
    createRetargetFixture([candidate(1, 0), candidate(1, 1)])
  );
  assert.throws(() =>
    createRetargetFixture([candidate(Number.MAX_SAFE_INTEGER + 1, 0)])
  );
  assert.throws(() =>
    createRetargetFixture(
      Array.from({ length: 17 }, (_, index) => candidate(index + 1, index)),
    )
  );
  assert.throws(() =>
    createRetargetFixture([], Array.from(
      { length: 65 },
      (_, tick) => remove(tick, 1),
    ))
  );
  assert.throws(() =>
    createRetargetFixture(
      Array.from({ length: 16 }, (_, index) => candidate(index + 1, index)),
      [set(0, candidate(17, 17))],
    ),
    /live candidate bound/u,
  );
});

test("retarget lifecycle: multi-step bounds reject atomically", () => {
  const sim = encounter([candidate(201, 1_000)]);
  const before = sim.serialize();
  assert.throws(() => sim.stepMany(1_001), /bounded safe integer/u);
  assert.equal(sim.serialize(), before);
  assert.throws(() => sim.stepMany(-1));
  assert.equal(sim.serialize(), before);
});

test("retarget lifecycle: arbitrary chunks and two fresh runs are byte/event identical", () => {
  const setup = createRetargetFixture(
    [candidate(201, 1_000), candidate(202, 1_100), candidate(203, 1_200)],
    [
      set(102, candidate(201, 1_000, { alive: false, health: 0 })),
      set(144, candidate(202, 1_100, { alive: false, health: 0 })),
    ],
  );
  const one = new RetargetAttackEncounter(setup);
  const two = new RetargetAttackEncounter(setup);
  const chunks = new RetargetAttackEncounter(setup);
  one.stepMany(250);
  two.stepMany(250);
  for (const count of [1, 7, 0, 19, 43, 2, 71, 107]) chunks.stepMany(count);
  assert.equal(chunks.state.tick, 250);
  assert.deepEqual(one.replay, two.replay);
  assert.deepEqual(one.replay, chunks.replay);
  assert.equal(one.serialize(), two.serialize());
  assert.equal(one.serialize(), chunks.serialize());
});

test("retarget lifecycle: restore is byte-identical at every causal cut", () => {
  const setup = createRetargetFixture(
    [candidate(201, 1_000), candidate(202, 1_100), candidate(203, 1_200)],
    [
      set(102, candidate(201, 1_000, { alive: false, health: 0 })),
      set(144, candidate(202, 1_100, { alive: false, health: 0 })),
    ],
  );
  const cuts = [0, 1, 59, 60, 61, 101, 102, 103, 143, 144, 145, 185, 186, 187];
  for (const cut of cuts) {
    const original = new RetargetAttackEncounter(setup);
    original.stepMany(cut);
    const bytes = original.serialize();
    const restored = RetargetAttackEncounter.restore(bytes);
    assert.equal(restored.serialize(), bytes, `cut ${cut}`);
    original.stepMany(250 - cut);
    restored.stepMany(250 - cut);
    assert.equal(restored.serialize(), original.serialize(), `end ${cut}`);
    assert.deepEqual(restored.replay, original.replay, `replay ${cut}`);
  }
});

test("retarget lifecycle: forged, noncanonical, and oversized snapshots reject", () => {
  const sim = encounter([candidate(201, 1_000)]);
  sim.stepMany(10);
  const bytes = sim.serialize();
  const parsed = JSON.parse(bytes);
  assert.throws(() =>
    RetargetAttackEncounter.restore(` ${bytes}`), /canonical/u
  );
  assert.throws(() =>
    RetargetAttackEncounter.restore(JSON.stringify({ ...parsed, forged: true }))
  );
  assert.throws(() =>
    RetargetAttackEncounter.restore(bytes.replace('"tick":10', '"tick":1001'))
  );
  assert.throws(() =>
    RetargetAttackEncounter.restore(bytes.replace('"version":1', '"version":2'))
  );
  assert.throws(() =>
    RetargetAttackEncounter.restore(bytes.slice(0, -1))
  );
  assert.throws(() =>
    RetargetAttackEncounter.restore(`{"padding":"${"x".repeat(262_144)}"}`)
  );
  assert.throws(() => RetargetAttackEncounter.restore({}));
});
