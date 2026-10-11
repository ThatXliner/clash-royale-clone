import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import * as content from "../src/content/index.js";
import {
  createSessionTroopProfileManifest,
} from "../src/content/session-troop-profile-catalog.js";
import {
  createSessionTroopWitness,
  createSessionTroopWitnessQuestions,
  createSessionTroopWitnessRoster,
  projectSessionTroopBattleCard,
  serializeSessionTroopWitness,
} from "../src/content/session-troop-roster.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
  PLAYABLE_CARD_IDS,
  serializePlayableRoster,
} from "../src/content/playable-roster.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";
import { LiveBattle, parseLiveBattleSetup } from "../src/sim/live-battle.js";
import { ORDINARY_PROJECTILE_SOURCE_CLAIMS } from "../src/shared/ordinary-projectile-delivery-authority.js";

const ADMITTED_IDS = Object.freeze([
  "aegis-sage", "bloom-wisp", "bone-regent", "brassbolt", "briar-band",
  "cinder-host", "cinder-ray", "cinderback", "cinderlings", "coilblade", "copperskiff",
  "dawnmender", "dusk-ranger", "duskwing-trio", "emberlance", "forgeguard", "gilded-lancer", "iron-borer",
  "ironroot", "mossguard", "prism-warden", "pulse-sentry", "railward", "reedsting",
  "rime-adept", "rune-reaver", "scatterguard", "skymaul", "stonehauler",
  "stonevault", "stormkite", "sunthread-pair", "tether-rider", "thornscouts", "veil-prowler", "veilrunner",
  "wayfinder",
]);
const QUESTION_IDS = Object.freeze(["ashen-nest", "gloam-shepherd"]);
const SOUTH = Object.freeze({ x: 3_500, y: 14_500 });
const NORTH = Object.freeze({ x: 3_500, y: 17_500 });
const QUESTION_SOURCE = "runtime-playability-estimate-not-comparison-corpus";
const CARD_KEYS = Object.freeze([
  "areaDamageRadiusMillitiles", "cost", "count", "damage", "deployTimeTicks",
  "displayName", "entities", "firstHitTicks", "formation", "hitSpeedTicks",
  "hitpoints", "id", "kind", "movementMillitilesPerSecond", "rangeMillitiles",
  "rarity", "sightRangeMillitiles", "targetMode",
]);
const ENTITY_KEYS = Object.freeze([
  "archetypeId", "areaDamageRadiusMillitiles", "bodyRadiusPolicy", "count",
  "damage", "delivery", "deployTimeTicks", "displayName", "firstHitTicks",
  "hitSpeedTicks", "hitpoints", "kind", "layer", "movementMillitilesPerSecond",
  "projectileSpeedPolicy", "rangeMillitiles", "role", "sightRangeMillitiles",
  "targetMode",
]);
const ORDINARY_POLICY_KEYS = Object.freeze(["deliveryPolicy", "layerPolicy"]);

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

function deepFrozen(value) {
  if (value === null || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(deepFrozen);
}

function sourceRecords(exportName) {
  const value = content[exportName];
  if (typeof value === "function") return value();
  if (Array.isArray(value)) return value;
  if (value !== null && typeof value === "object" && typeof value.id === "string") {
    return [value];
  }
  return Object.values(value);
}

function sourceRows(profile) {
  return profile.occurrenceExports.flatMap((exportName) =>
    sourceRecords(exportName).filter(({ id }) => id === profile.id));
}

function entitySource(card, index) {
  return card.components.length === 0 ? card : card.components[index];
}

function questionReferences(roster) {
  return roster.flatMap(({ entities }) => entities.flatMap((entity) => [
    entity.bodyRadiusPolicy,
    entity.projectileSpeedPolicy,
    entity.deliveryPolicy,
    entity.layerPolicy,
    entity.damagePolicy,
  ].filter((policy) => policy?.kind === "question").map(({ questionKey }) => questionKey)));
}

function questionMap(questions) {
  return new Map(questions.map((question) => [question.key, question]));
}

function ordinaryQuestionKeys(entity) {
  return ORDINARY_POLICY_KEYS.filter((field) => entity[field].kind === "question")
    .map((field) => entity[field].questionKey);
}

function witnessSetup(id) {
  const witness = createSessionTroopWitness(id);
  const deck = witness.roster.map(({ id: cardId }) => cardId);
  let seed = 0;
  for (; seed < 10_000; seed += 1) {
    if (new DeckCycle({ deck, seed: `${seed}:south` }).state.hand.includes(id)) break;
  }
  assert.ok(seed < 10_000, `opening hand seed exists for ${id}`);
  return {
    battleSetup: canonical(witness),
    deck,
    legalNorthDeployments: [],
    rosterWitness: canonical({ questions: witness.questions, roster: witness.roster }),
    seed,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 3_600,
    thinkOffsetTicks: 0,
  };
}

function pairedProjectileDuelSetup() {
  const witnesses = [
    createSessionTroopWitness("sunthread-pair"),
    createSessionTroopWitness("duskwing-trio"),
  ];
  const cardsById = new Map();
  const questionsByKey = new Map();
  for (const witness of witnesses) {
    for (const card of witness.roster) cardsById.set(card.id, card);
    for (const question of witness.questions) {
      const previous = questionsByKey.get(question.key);
      if (previous !== undefined) assert.deepEqual(question, previous, question.key);
      else questionsByKey.set(question.key, question);
    }
  }
  const cardIds = ["sunthread-pair", "duskwing-trio", ...PLAYABLE_CARD_IDS.slice(0, 6)];
  const roster = cardIds.map((id) => {
    const card = cardsById.get(id);
    assert.ok(card, `paired witness includes ${id}`);
    return clone(card);
  });
  const keys = [...new Set(questionReferences(roster))].sort();
  return canonical({
    initialWindupTicks: { central: 0, lane: 0 },
    questions: keys.map((key) => {
      const question = questionsByKey.get(key);
      assert.ok(question, `paired witness closes ${key}`);
      return question;
    }),
    roster,
  });
}

function playerCommand(session, id) {
  const slot = session.state.decks.south.hand.indexOf(id);
  assert.notEqual(slot, -1, `${id} is in the authentic south opening hand`);
  return canonical({
    cardId: id,
    commandId: 0,
    point: SOUTH,
    slot,
    tick: session.state.tick,
    type: "deploy",
  });
}

function runtimeTargetMode(targetMode) {
  if (targetMode === "ground-and-air") return "air_and_ground";
  if (targetMode === "structures") return "buildings";
  return targetMode;
}

function expectedQuestionValue(questions, key) {
  const record = questionMap(questions).get(key);
  assert.ok(record, `question ${key} exists`);
  return record.value;
}

function expectedEntityRuntime(entity, questions) {
  const radius = expectedQuestionValue(questions, entity.bodyRadiusPolicy.questionKey);
  const projectileSpeed = entity.projectileSpeedPolicy.kind === "question"
    ? expectedQuestionValue(questions, entity.projectileSpeedPolicy.questionKey) : null;
  const damage = entity.damagePolicy?.kind === "question"
    ? expectedQuestionValue(questions, entity.damagePolicy.questionKey) : entity.damage;
  const delivery = entity.deliveryPolicy.kind === "source-backed"
    ? entity.deliveryPolicy.delivery
    : expectedQuestionValue(questions, entity.deliveryPolicy.questionKey) === 2
      ? "projectile" : "melee";
  const layer = expectedQuestionValue(questions, entity.layerPolicy.questionKey) === 2
    ? "air" : "ground";
  return {
    damage,
    delivery,
    layer,
    directDelivery: entity.delivery,
    directLayer: entity.layer,
    projectileSpeed,
    radius,
  };
}

test("ordinary troop projection domain is exactly the admitted profile surface", () => {
  const manifest = createSessionTroopProfileManifest();
  assert.deepEqual(manifest.profiles.map(({ id }) => id), ADMITTED_IDS);
  assert.equal(manifest.profiles.length, 37);
  assert.deepEqual(ADMITTED_IDS, [...new Set(ADMITTED_IDS)]);
  for (const id of [...QUESTION_IDS, "not-a-troop", "coilblade\u200b"]) {
    assert.throws(() => projectSessionTroopBattleCard(id), /unknown|QUESTION|admitted/u);
    assert.throws(() => createSessionTroopWitness(id), /unknown|QUESTION|admitted/u);
  }
});

test("every projection is complete, source-agreeing, ordinary-only, and component-stable", () => {
  const manifest = createSessionTroopProfileManifest();
  for (const profile of manifest.profiles) {
    const rows = sourceRows(profile);
    assert.equal(rows.length, profile.occurrenceExports.length, profile.id);
    assert.equal(new Set(rows.map(canonical)).size, 1, `${profile.id} duplicate source agreement`);
    const source = rows[0];
    const projected = projectSessionTroopBattleCard(profile.id);
    assert.deepEqual(Object.keys(projected).sort(), [...CARD_KEYS].sort(), profile.id);
    for (const field of CARD_KEYS) {
      if (field === "entities" || field === "formation") continue;
      if (field === "count") assert.equal(projected[field], source[field], profile.id);
      else assert.deepEqual(projected[field], source[field], `${profile.id}.${field}`);
    }
    assert.equal(projected.entities.length, source.components.length === 0 ? 1 : source.components.length,
      `${profile.id} entity expansion`);
    assert.deepEqual(projected.formation.componentOrder,
      projected.entities.map(({ archetypeId }) => archetypeId), profile.id);
    assert.equal(projected.formation.totalCount,
      projected.entities.reduce((sum, entity) => sum + entity.count, 0), profile.id);
    assert.equal(projected.formation.expansionOrder, "component-order-then-member-index", profile.id);
    for (let index = 0; index < projected.entities.length; index += 1) {
      const entity = projected.entities[index];
      const sourceEntity = entitySource(source, index);
      const allowedKeys = [...ENTITY_KEYS, ...ORDINARY_POLICY_KEYS,
        ...(sourceEntity.damage === null ? ["damagePolicy"] : [])];
      assert.deepEqual(Object.keys(entity).sort(), [...allowedKeys].sort(),
        `${profile.id} ordinary entity shape`);
      for (const field of ENTITY_KEYS) {
        if (field === "archetypeId") {
          assert.equal(entity[field], sourceEntity.id, `${profile.id}.${field}`);
        } else if (field === "role") {
          assert.equal(entity[field], source.components.length === 0 ? "primary" : sourceEntity.role,
            `${profile.id}.${field}`);
        } else if (field === "bodyRadiusPolicy" || field === "projectileSpeedPolicy" ||
            field === "delivery" || field === "layer") {
          continue;
        } else {
          assert.deepEqual(entity[field], sourceEntity[field], `${profile.id}.${field}`);
        }
      }
      const sourceClaim = ORDINARY_PROJECTILE_SOURCE_CLAIMS.find(({ cardId, archetypeId }) =>
        cardId === profile.id && archetypeId === entity.archetypeId);
      if (sourceClaim === undefined) {
        assert.deepEqual(entity.deliveryPolicy, {
          kind: "question",
          questionKey: `${entity.archetypeId}.delivery`,
        }, `${profile.id} delivery policy`);
      } else {
        assert.deepEqual(entity.deliveryPolicy, {
          archetypeId: sourceClaim.archetypeId,
          cardId: sourceClaim.cardId,
          catalogId: sourceClaim.catalogId,
          delivery: "projectile",
          kind: "source-backed",
        }, `${profile.id} canonical sourced delivery policy`);
      }
      assert.deepEqual(entity.layerPolicy, {
        kind: "question",
        questionKey: `${entity.archetypeId}.layer`,
      }, `${profile.id} layer policy`);
      if (sourceEntity.damage === null) {
        assert.equal(entity.damage, null, `${profile.id} preserves missing damage`);
        assert.equal(entity.damagePolicy.questionKey, `${entity.archetypeId}.damage`);
      }
    }
  }
});

test("every witness closes its exact questions, cards, and archetypes through LiveBattle admission", () => {
  for (const id of ADMITTED_IDS) {
    const witness = createSessionTroopWitness(id);
    const roster = createSessionTroopWitnessRoster(id);
    const questions = createSessionTroopWitnessQuestions(id);
    assert.deepEqual(roster, witness.roster, id);
    assert.deepEqual(questions, witness.questions, id);
    assert.equal(roster.length, 8, id);
    assert.equal(roster.filter(({ id: cardId }) => cardId === id).length, 1, id);
    assert.equal(new Set(roster.map(({ id: cardId }) => cardId)).size, 8, id);
    const archetypes = roster.flatMap(({ entities }) => entities.map(({ archetypeId }) => archetypeId));
    assert.equal(new Set(archetypes).size, archetypes.length, `${id} archetypes`);
    const referenced = [...new Set(questionReferences(roster))].sort();
    const references = questionReferences(roster);
    assert.equal(references.length, new Set(references).size, `${id} policy references are unique`);
    assert.equal(references.length, questions.length, `${id} has no unused question records`);
    assert.deepEqual(questions.map(({ key }) => key), referenced, `${id} question closure`);
    assert.equal(new Set(questions.map(({ key }) => key)).size, questions.length, id);
    assert.ok(questions.every(({ authoritative, confidence, disposition, source, value }) =>
      authoritative === false && confidence === "unverified" && disposition === "question" &&
      source === QUESTION_SOURCE && Number.isSafeInteger(value) && value >= 1), id);
    assert.equal(canonical(parseLiveBattleSetup(canonical(witness))), canonical(witness),
      `${id} canonical LiveBattle admission`);
  }
  const originalQuestions = new Map(createPlayableRosterQuestionRecords().map((record) => [record.key, record]));
  const shellWitness = createSessionTroopWitness("coilblade");
  for (const record of shellWitness.questions) {
    if (originalQuestions.has(record.key)) {
      assert.deepEqual(record, originalQuestions.get(record.key), record.key);
    }
  }
});

test("ordinary projectile delivery admits only its exact two source tuples and rejects forged restore claims", () => {
  assert.deepEqual(ORDINARY_PROJECTILE_SOURCE_CLAIMS.map(({ cardId, archetypeId }) =>
    [cardId, archetypeId]), [
    ["sunthread-pair", "sunthread-warden"],
    ["duskwing-trio", "duskwing"],
  ]);
  const policyFor = (claim) => ({
    archetypeId: claim.archetypeId,
    cardId: claim.cardId,
    catalogId: claim.catalogId,
    delivery: "projectile",
    kind: "source-backed",
  });

  for (const claim of ORDINARY_PROJECTILE_SOURCE_CLAIMS) {
    const witness = clone(createSessionTroopWitness(claim.cardId));
    const card = witness.roster.find(({ id }) => id === claim.cardId);
    const entity = card.entities.find(({ archetypeId }) => archetypeId === claim.archetypeId);
    assert.ok(entity, `${claim.cardId} owns its source archetype`);
    assert.deepEqual(entity.deliveryPolicy, policyFor(claim));
    assert.equal(entity.delivery, "projectile");
    assert.equal(entity.projectileSpeedPolicy.kind, "question");
    assert.equal(entity.layerPolicy.kind, "question");
    const baseline = canonical(witness);
    assert.equal(canonical(parseLiveBattleSetup(baseline)), baseline);

    const attacks = [
      (policy) => { policy.cardId = claim.cardId === "sunthread-pair" ? "duskwing-trio" : "sunthread-pair"; },
      (policy) => { policy.archetypeId = claim.archetypeId === "duskwing" ? "sunthread-warden" : "duskwing"; },
      (policy) => { policy.catalogId = "forged-ordinary-projectiles"; },
      (policy) => { policy.kind = "question"; },
      (policy) => { policy.extra = true; },
    ];
    for (const attack of attacks) {
      const malformed = clone(witness);
      const target = malformed.roster.find(({ id }) => id === claim.cardId)
        .entities.find(({ archetypeId }) => archetypeId === claim.archetypeId);
      attack(target.deliveryPolicy);
      assert.throws(() => parseLiveBattleSetup(canonical(malformed)),
        `${claim.cardId} forged source tuple`);
    }
    const changedDelivery = clone(witness);
    changedDelivery.roster.find(({ id }) => id === claim.cardId)
      .entities.find(({ archetypeId }) => archetypeId === claim.archetypeId)
      .delivery = "melee";
    assert.throws(() => parseLiveBattleSetup(canonical(changedDelivery)),
      `${claim.cardId} source delivery must agree with the entity`);
  }

  const forgedAttachment = clone(createSessionTroopWitness("brassbolt"));
  forgedAttachment.roster.find(({ id }) => id === "brassbolt").entities[0].deliveryPolicy =
    policyFor(ORDINARY_PROJECTILE_SOURCE_CLAIMS[0]);
  assert.throws(() => parseLiveBattleSetup(canonical(forgedAttachment)),
    "a legitimate source policy cannot be attached to another card");

  const setup = canonical(witnessSetup("sunthread-pair"));
  const validSession = new GameSession(setup);
  const validSnapshot = validSession.serialize();
  assert.equal(GameSession.restore(validSnapshot).serialize(), validSnapshot);
  const forgedSnapshot = JSON.parse(validSnapshot);
  const forgedBattleSetup = JSON.parse(forgedSnapshot.setup.battleSetup);
  forgedBattleSetup.roster.find(({ id }) => id === "sunthread-pair")
    .entities[0].deliveryPolicy.catalogId = "forged-ordinary-projectiles";
  forgedSnapshot.setup.battleSetup = canonical(forgedBattleSetup);
  forgedSnapshot.setup.rosterWitness = canonical({
    questions: forgedBattleSetup.questions,
    roster: forgedBattleSetup.roster,
  });
  assert.throws(() => GameSession.restore(canonical(forgedSnapshot)),
    "restore must re-run canonical ordinary source admission");
});

test("Sunthread Pair and Duskwing Trio trade sourced air/ground projectiles through in-flight restore", () => {
  const battle = new LiveBattle(pairedProjectileDuelSetup());
  assert.equal(battle.scheduleDeploy(canonical({
    cardId: "duskwing-trio", point: NORTH, sequence: 0, side: "north", tick: 0,
  })).type, "deploy-scheduled");
  assert.equal(battle.scheduleDeploy(canonical({
    cardId: "sunthread-pair", point: SOUTH, sequence: 1, side: "south", tick: 0,
  })).type, "deploy-scheduled");
  battle.step();

  const byCard = new Map([
    ["sunthread-pair", battle.state.units.filter(({ cardId }) => cardId === "sunthread-pair")],
    ["duskwing-trio", battle.state.units.filter(({ cardId }) => cardId === "duskwing-trio")],
  ]);
  assert.equal(byCard.get("sunthread-pair").length, 2);
  assert.equal(byCard.get("duskwing-trio").length, 3);
  assert.ok(byCard.get("sunthread-pair").every(({ layer, maxHealth, damage, delivery }) =>
    layer === "ground" && maxHealth === 304 && damage === 107 && delivery === "projectile"));
  assert.ok(byCard.get("duskwing-trio").every(({ layer, maxHealth, damage, delivery }) =>
    layer === "air" && maxHealth === 230 && damage === 117 && delivery === "projectile"));

  let checkpoint = null;
  for (let tick = 0; tick < 240 && checkpoint === null; tick += 1) {
    const events = battle.step();
    if (events.some(({ type }) => type === "projectile-launch")) {
      assert.ok(battle.state.projectiles.length > 0, "launched projectile remains in flight");
      assert.ok(battle.state.projectiles.every(({ impactTick, launchTick }) =>
        impactTick > launchTick), "the checkpoint is strictly between launch and impact");
      checkpoint = battle.serialize();
    }
  }
  assert.ok(checkpoint, "the ordinary host launches the first projectile");
  const resumed = LiveBattle.restore(checkpoint);
  assert.equal(resumed.serialize(), checkpoint, "restore preserves the in-flight projectile bytes");
  for (let tick = 0; tick < 240; tick += 1) {
    assert.deepEqual(resumed.step(), battle.step(), `restored continuation tick ${tick}`);
  }
  assert.equal(resumed.serialize(), battle.serialize());
  assert.deepEqual(resumed.replay, battle.replay);

  const unitsById = new Map(battle.state.units.map((unit) => [unit.id, unit]));
  const cardUnitIds = new Map([...byCard].map(([id, units]) =>
    [id, new Set(units.map(({ id: unitId }) => unitId))]));
  const sourceSpecs = [
    ["sunthread-pair", "duskwing-trio", 107],
    ["duskwing-trio", "sunthread-pair", 117],
  ];
  for (const [attackerCard, targetCard, damage] of sourceSpecs) {
    const launch = battle.replay.find((event) => event.type === "projectile-launch" &&
      cardUnitIds.get(attackerCard).has(event.projectile.sourceId) &&
      cardUnitIds.get(targetCard).has(event.projectile.targetId));
    assert.ok(launch, `${attackerCard} can select the opposing ${targetCard} layer`);
    assert.equal(launch.projectile.direction, "unit-to-unit");
    assert.equal(launch.projectile.damage, damage);
    assert.equal(launch.projectile.speed, 500, "projectile speed remains the explicit HTO estimate");
    assert.equal(launch.projectile.impactTick > launch.projectile.launchTick, true);
    const impact = battle.replay.find((event) => event.type === "projectile-impact" &&
      event.projectileId === launch.projectile.id);
    assert.equal(impact?.status, "contact", `${attackerCard} projectile reaches its target`);
    const damageEvent = battle.replay.find((event) => event.type === "damage" &&
      event.projectileId === launch.projectile.id);
    assert.equal(damageEvent?.amount, damage, `${attackerCard} applies its source-table damage`);
    assert.ok(unitsById.has(impact.targetId), `${attackerCard} contact resolves through shared units`);
  }
});

function stripOrdinaryPolicies(card) {
  return {
    ...card,
    entities: card.entities.map(({ deliveryPolicy, layerPolicy, ...entity }) => entity),
  };
}

test("legacy HTO projections are detached exact playable cards plus ordinary policies", () => {
  const playableById = new Map(createPlayableRoster().map((card) => [card.id, card]));
  assert.equal(PLAYABLE_CARD_IDS.length, 8);
  for (const id of PLAYABLE_CARD_IDS) {
    const projected = projectSessionTroopBattleCard(id);
    assert.deepEqual(stripOrdinaryPolicies(projected), playableById.get(id), id);
    assert.notEqual(projected, playableById.get(id), `${id} card is detached`);
    assert.notEqual(projected.entities, playableById.get(id).entities, `${id} entities are detached`);
    assert.ok(projected.entities.every(({ deliveryPolicy, layerPolicy }) =>
      deliveryPolicy?.kind === "question" && layerPolicy?.kind === "question"), id);
  }
});

test("all official witnesses use uniform HTO policies with exact projection counts", () => {
  const projectedCards = ADMITTED_IDS.map((id) => projectSessionTroopBattleCard(id));
  const projectedEntities = projectedCards.flatMap(({ entities }) => entities);
  const projectedPolicies = projectedEntities.flatMap((entity) =>
    ORDINARY_POLICY_KEYS.map((field) => entity[field]));
  assert.equal(ADMITTED_IDS.length, 37);
  assert.equal(projectedEntities.length, 38);
  assert.equal(new Set(projectedEntities.map(({ archetypeId }) => archetypeId)).size, 37);
  assert.equal(projectedPolicies.length, 76);
  assert.ok(projectedEntities.every(({ deliveryPolicy, layerPolicy }) =>
    (deliveryPolicy.kind === "question" || deliveryPolicy.kind === "source-backed") &&
    layerPolicy.kind === "question"));

  for (const id of ADMITTED_IDS) {
    const witness = createSessionTroopWitness(id);
    const witnessEntities = witness.roster.flatMap(({ entities }) => entities);
    assert.equal(witnessEntities.length, 9, id);
    assert.ok(witnessEntities.every((entity) =>
      (entity.deliveryPolicy?.kind === "question" ||
       entity.deliveryPolicy?.kind === "source-backed") &&
      entity.layerPolicy?.kind === "question"), id);
  }

  const legacyEntities = createPlayableRoster().flatMap(({ entities }) => entities);
  assert.equal(legacyEntities.length, 9);
  assert.equal(legacyEntities.filter((entity) =>
    ORDINARY_POLICY_KEYS.some((field) => Object.hasOwn(entity, field))).length, 0);
  const legacyHtoEntities = PLAYABLE_CARD_IDS.flatMap((id) =>
    projectSessionTroopBattleCard(id).entities);
  assert.equal(legacyHtoEntities.length, 9);
  assert.equal(legacyHtoEntities.flatMap((entity) =>
    ORDINARY_POLICY_KEYS.map((field) => entity[field])).length, 18);
});

test("legacy playable roster bytes and QUESTION records remain unchanged", () => {
  const roster = createPlayableRoster();
  const questions = createPlayableRosterQuestionRecords();
  assert.ok(roster.every(({ entities }) => entities.every((entity) =>
    !Object.hasOwn(entity, "deliveryPolicy") && !Object.hasOwn(entity, "layerPolicy"))));
  assert.ok(questions.every(({ key }) => !key.endsWith(".delivery") && !key.endsWith(".layer")));
  const admitted = parseLiveBattleSetup(canonical({
    initialWindupTicks: { central: 0, lane: 0 },
    questions,
    roster,
  }));
  assert.equal(canonical(admitted.roster), canonical(roster));
  const bytes = serializePlayableRoster();
  assert.equal(bytes.length, 11_154);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "6fb8d84121ca039ea9315b7e505c8f02d5d7839e8fd5fc5cd19013a0d2b7fadb",
  );
});

test("legacy delivery/layer policy and QUESTION tampering rejects atomically", () => {
  for (const id of PLAYABLE_CARD_IDS) {
    const witness = createSessionTroopWitness(id);
    const originalBytes = canonical(witness);
    const target = witness.roster.find(({ id: cardId }) => cardId === id);
    for (let entityIndex = 0; entityIndex < target.entities.length; entityIndex += 1) {
      for (const field of ORDINARY_POLICY_KEYS) {
        const policyKey = target.entities[entityIndex][field].questionKey;
        const omitPolicy = clone(witness);
        delete omitPolicy.roster[0].entities[entityIndex][field];
        assert.throws(() => parseLiveBattleSetup(canonical(omitPolicy)),
          `${id}.${field} omission`);

        const omitQuestion = clone(witness);
        omitQuestion.questions = omitQuestion.questions.filter(({ key }) => key !== policyKey);
        assert.throws(() => parseLiveBattleSetup(canonical(omitQuestion)),
          `${id}.${field} question omission`);

        const swapPolicy = clone(witness);
        const opposite = field === "deliveryPolicy" ? "layerPolicy" : "deliveryPolicy";
        swapPolicy.roster[0].entities[entityIndex][field] = {
          ...swapPolicy.roster[0].entities[entityIndex][field],
          questionKey: target.entities[entityIndex][opposite].questionKey,
        };
        assert.throws(() => parseLiveBattleSetup(canonical(swapPolicy)),
          `${id}.${field} policy swap`);

        const forgeQuestion = clone(witness);
        forgeQuestion.questions = forgeQuestion.questions.map((record) =>
          record.key === policyKey ? { ...record, value: record.value + 7 } : record);
        assert.throws(() => parseLiveBattleSetup(canonical(forgeQuestion)),
          `${id}.${field} question forgery`);

        const forgeDirect = clone(witness);
        const directField = field === "deliveryPolicy" ? "delivery" : "layer";
        forgeDirect.roster[0].entities[entityIndex][directField] = directField === "delivery"
          ? (target.entities[entityIndex].delivery === "melee" ? "projectile" : "melee")
          : (target.entities[entityIndex].layer === "ground" ? "air" : "ground");
        assert.throws(() => parseLiveBattleSetup(canonical(forgeDirect)),
          `${id}.${directField} forgery`);

        assert.equal(canonical(parseLiveBattleSetup(originalBytes)), originalBytes,
          `${id} remains atomically admitted after ${field} attacks`);
      }
    }
  }
});

test("paired ordinary-policy omission rejects every one of the 38 entity projections", () => {
  const variants = ["retain", "remove", "reorder", "forge"];
  for (const id of ADMITTED_IDS) {
    const projected = projectSessionTroopBattleCard(id);
    for (const [entityIndex, projectedEntity] of projected.entities.entries()) {
      for (const variant of variants) {
        const witness = clone(createSessionTroopWitness(id));
        const target = witness.roster.find(({ id: cardId }) => cardId === id);
        const entity = target.entities[entityIndex];
        const questionKeys = ordinaryQuestionKeys(entity);
        delete entity.deliveryPolicy;
        delete entity.layerPolicy;
        if (variant === "remove") {
          witness.questions = witness.questions.filter(({ key }) => !questionKeys.includes(key));
        } else if (variant === "reorder") {
          const [first, ...rest] = witness.questions;
          witness.questions = [...rest, first];
        } else if (variant === "forge") {
          witness.questions = witness.questions.map((record) => questionKeys.includes(record.key)
            ? { ...record, value: record.value + 7 }
            : record);
        }
        assert.throws(() => parseLiveBattleSetup(canonical(witness)),
          `${id}.${projectedEntity.archetypeId}.${variant}`);
      }
      assert.equal(canonical(parseLiveBattleSetup(serializeSessionTroopWitness(id))),
        serializeSessionTroopWitness(id), `${id}.${projectedEntity.archetypeId} baseline`);
    }
  }
});

test("removing all ordinary policies from one card rejects a partially downgraded roster", () => {
  for (const id of ADMITTED_IDS) {
    const witness = clone(createSessionTroopWitness(id));
    const target = witness.roster.find(({ id: cardId }) => cardId === id);
    const questionKeys = target.entities.flatMap(ordinaryQuestionKeys);
    for (const entity of target.entities) {
      delete entity.deliveryPolicy;
      delete entity.layerPolicy;
    }
    witness.questions = witness.questions.filter(({ key }) => !questionKeys.includes(key));
    assert.throws(() => parseLiveBattleSetup(canonical(witness)), id);
  }
});

test("a genuine legacy card cannot be mixed with seven HTO policy-backed cards", () => {
  const witness = clone(createSessionTroopWitness("wayfinder"));
  const legacyId = "coilblade";
  const legacyCard = createPlayableRoster().find(({ id }) => id === legacyId);
  const cardIndex = witness.roster.findIndex(({ id }) => id === legacyId);
  assert.notEqual(cardIndex, -1);
  witness.roster[cardIndex] = clone(legacyCard);
  const questionKeys = legacyCard.entities.flatMap((entity) => [
    `${entity.archetypeId}.delivery`,
    `${entity.archetypeId}.layer`,
  ]);
  witness.questions = witness.questions.filter(({ key }) => !questionKeys.includes(key));
  const malformed = canonical(witness);
  assert.throws(() => parseLiveBattleSetup(malformed), /uniform|ordinary/u);
  assert.throws(() => new LiveBattle(malformed), /uniform|ordinary/u);

  const valid = new LiveBattle(serializeSessionTroopWitness("wayfinder"));
  assert.deepEqual(valid.replay, []);
});

test("all admitted troop witnesses use one shared LiveBattle deployment and entity expansion", () => {
  const manifest = createSessionTroopProfileManifest();
  for (const id of ADMITTED_IDS) {
    const profile = manifest.profiles.find(({ id: profileId }) => profileId === id);
    const source = sourceRows(profile)[0];
    const witness = createSessionTroopWitness(id);
    const target = witness.roster.find((card) => card.id === id);
    const targetQuestions = questionMap(witness.questions);

    const battle = new LiveBattle(serializeSessionTroopWitness(id));
    const beforeBattle = battle.serialize();
    const scheduled = battle.scheduleDeploy(canonical({
      cardId: id, point: SOUTH, sequence: 0, side: "south", tick: 0,
    }));
    assert.equal(scheduled.type, "deploy-scheduled", id);
    assert.equal(battle.replay.filter(({ type }) => type === "deploy-scheduled").length, 1, id);
    battle.step();
    assert.equal(battle.replay.filter(({ type }) => type === "deployed").length, 1, id);
    assert.equal(battle.state.pendingDeployments.length, 0, id);
    assert.equal(battle.state.units.filter(({ cardId }) => cardId === id).length,
      source.count, `${id} materialized count`);
    assert.deepEqual(battle.state.units.map(({ id: entityId }) => entityId),
      Array.from({ length: source.count }, (_, index) => index + 1), `${id} shared IDs`);
    assert.equal(battle.serialize() === beforeBattle, false, id);

    const session = new GameSession(canonical(witnessSetup(id)));
    const before = session.state;
    const accepted = session.submitPlayerCommand(playerCommand(session, id));
    assert.equal(accepted.accepted, true, id);
    const events = session.step();
    const after = session.state;
    const routes = after.cardRuntime.history.filter(({ cardId }) => cardId === id);
    assert.equal(routes.length, 1, `${id} typed route count`);
    assert.equal(routes[0].kind, "unit", id);
    assert.equal(routes[0].placementClass, "ground_entity", id);
    assert.equal(after.decks.south.sequence, before.decks.south.sequence + 1, `${id} deck cycle`);
    assert.equal(after.elixir.sides.south.amount, before.elixir.sides.south.amount - source.cost,
      `${id} exact cost spend`);
    assert.equal(events.filter(({ type }) => type === "session-deployed").length, 1,
      `${id} session deployment`);
    assert.equal(session.replay.filter(({ type }) => type === "session-deployed").length, 1, id);
    assert.equal(after.battle.pendingDeployments.length, 0, id);
    assert.equal(after.battle.units.filter(({ cardId }) => cardId === id).length, source.count,
      `${id} session materialization`);
    const targetUnits = after.battle.units.filter(({ cardId }) => cardId === id)
      .sort((left, right) => left.id - right.id);
    const targetEntities = target.entities.length === 0 ? [target] : target.entities;
    assert.equal(targetUnits.length, target.formation.totalCount, `${id} entity expansion total`);
    let entityIndex = 0;
      for (const entity of targetEntities) {
        const expected = expectedEntityRuntime(entity, witness.questions);
        assert.equal(expected.delivery, expected.directDelivery, `${id}.${entity.archetypeId} delivery estimate`);
        assert.equal(expected.layer, expected.directLayer, `${id}.${entity.archetypeId} layer estimate`);
        for (let memberIndex = 0; memberIndex < entity.count; memberIndex += 1) {
        const unit = targetUnits[entityIndex];
        assert.equal(unit.cardId, id);
        assert.equal(unit.archetypeId, entity.archetypeId);
        assert.equal(unit.role, entity.role);
        assert.equal(unit.memberIndex, memberIndex);
        assert.equal(unit.count, entity.count);
        assert.ok(unit.hitpoints >= 0 && unit.hitpoints <= entity.hitpoints,
          `${id}.${entity.archetypeId} current health is within its spawned maximum`);
        assert.equal(unit.maxHealth, entity.hitpoints);
        assert.equal(unit.damage, expected.damage);
        assert.equal(unit.cadenceTicks, entity.hitSpeedTicks);
        assert.equal(unit.deployTicks, entity.deployTimeTicks);
        assert.equal(unit.firstHitTicks, entity.firstHitTicks);
        assert.equal(unit.reach, entity.rangeMillitiles);
        assert.equal(unit.sightRange, entity.sightRangeMillitiles);
        assert.equal(unit.delivery, expected.delivery);
        assert.equal(unit.layer, expected.layer);
        assert.equal(unit.projectileSpeed, expected.projectileSpeed);
        assert.equal(unit.targetMode, runtimeTargetMode(entity.targetMode));
        if (unit.alive) {
          assert.equal(unit.movement.speed, entity.movementMillitilesPerSecond);
          assert.equal(unit.movement.bodyRadius, expected.radius);
        } else {
          assert.equal(unit.movement, null, `${id}.${entity.archetypeId} death clears movement`);
        }
        entityIndex += 1;
      }
    }
    assert.equal(entityIndex, target.formation.totalCount, id);
    assert.ok(session.replay.every(({ type }) =>
      !["troop-action-scheduled", "troop-action", "troop-status", "special-mechanic"].includes(type)),
    `${id} ordinary path has no special runtime event`);
  }
});

test("fully HTO LiveBattle setup deploys, restores, and forks exactly", () => {
  const id = "stormkite";
  const battle = new LiveBattle(serializeSessionTroopWitness(id));
  assert.equal(battle.scheduleDeploy(canonical({
    cardId: id,
    point: SOUTH,
    sequence: 0,
    side: "south",
    tick: 0,
  })).type, "deploy-scheduled");
  battle.step();
  const bytes = battle.serialize();
  assert.equal(LiveBattle.restore(bytes).serialize(), bytes);
  assert.equal(battle.fork().serialize(), bytes);

  const direct = LiveBattle.restore(bytes);
  const fork = battle.fork();
  direct.step();
  fork.step();
  assert.equal(fork.serialize(), direct.serialize());
});

test("representative ordinary projection is chunk, fork, and restore exact", () => {
  for (const id of ["coilblade", "brassbolt", "copperskiff", "briar-band", "aegis-sage", "stormkite"]) {
    const setup = canonical(witnessSetup(id));
    const run = (chunks) => {
      const session = new GameSession(setup);
      session.submitPlayerCommand(playerCommand(session, id));
      for (const ticks of chunks) session.stepMany(ticks);
      return session;
    };
    const direct = run([121]);
    const chunked = run([1, 17, 3, 41, 59]);
    assert.equal(chunked.serialize(), direct.serialize(), `${id} chunked bytes`);
    assert.equal(chunked.replayBytes(), direct.replayBytes(), `${id} chunked replay`);
    const partial = run([31]);
    const restored = GameSession.restore(partial.serialize());
    restored.stepMany(90);
    assert.equal(restored.serialize(), direct.serialize(), `${id} restore bytes`);
    assert.deepEqual(restored.state, direct.state, `${id} restore state`);
    assert.ok(direct.replay.some(({ type }) => type === "session-deployed"), id);
  }
});

test("projection APIs reject hostile identities before callbacks and return detached frozen values", () => {
  const outputs = [
    projectSessionTroopBattleCard("mossguard"),
    createSessionTroopWitnessRoster("mossguard"),
    createSessionTroopWitnessQuestions("mossguard"),
    createSessionTroopWitness("mossguard"),
  ];
  assert.ok(outputs.every(deepFrozen));
  assert.notEqual(projectSessionTroopBattleCard("mossguard"), outputs[0]);
  assert.notEqual(createSessionTroopWitness("mossguard"), outputs[3]);
  assert.equal(serializeSessionTroopWitness("mossguard"),
    serializeSessionTroopWitness("mossguard"));
  const functions = [
    projectSessionTroopBattleCard,
    createSessionTroopWitnessRoster,
    createSessionTroopWitnessQuestions,
    createSessionTroopWitness,
    serializeSessionTroopWitness,
  ];
  let traps = 0;
  const hostile = new Proxy({}, {
    get() { traps += 1; throw new Error("observed"); },
    getPrototypeOf() { traps += 1; throw new Error("observed"); },
    ownKeys() { traps += 1; throw new Error("observed"); },
  });
  const revokedState = Proxy.revocable({}, {});
  revokedState.revoke();
  for (const fn of functions) {
    assert.throws(() => fn(hostile), /primitive string/u);
    assert.throws(() => fn(revokedState.proxy), /primitive string/u);
    assert.throws(() => fn(new String("mossguard")), /primitive string/u);
    assert.throws(() => fn("mossguard", 0), /exactly one/u);
  }
  assert.equal(traps, 0);
});
