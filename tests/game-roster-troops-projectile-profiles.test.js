import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

import {
  BasicFlyingDuel,
  createBasicFlyingCatalog,
  createBasicFlyingCombatant,
} from "../src/content/cards/basic-flying.js";
import {
  BasicRangedDuel,
  createBasicRangedCatalog,
  createBasicRangedCombatant,
} from "../src/content/cards/basic-ranged.js";
import { createSwarmCatalog } from "../src/content/cards/swarms.js";
import {
  createChainQuestionFixture,
  createChainSpecialCatalog,
} from "../src/content/cards/special-projectiles-chain.js";
import {
  createPierceQuestionFixture,
  createPierceSpecialCatalog,
} from "../src/content/cards/special-projectiles-pierce.js";
import {
  createReturnQuestionFixture,
  createReturnSpecialCatalog,
} from "../src/content/cards/special-projectiles-return.js";
import {
  createPelletQuestionFixture,
  createPelletSpecialCatalog,
} from "../src/content/cards/special-projectiles-pellets.js";
import {
  createReflectionQuestionFixture,
  createReflectionSpecialCatalog,
} from "../src/content/cards/special-projectiles-reflection.js";
import {
  createSessionTroopProjectileProfileManifest,
  getSessionTroopProjectileProfile,
  serializeSessionTroopProjectileProfileManifest,
} from "../src/content/session-troop-projectile-profiles.js";
import { createSessionTroopProfileManifest } from "../src/content/session-troop-profile-catalog.js";
import { createSessionTroopWitnessQuestions } from "../src/content/session-troop-roster.js";

const EXPECTED_OCCURRENCES = [
  ["aegis-sage", "createReflectionSpecialCatalog", "aegis-sage", "reflection"],
  ["brassbolt", "createBasicRangedCatalog", "brassbolt", "ordinary-single-projectile"],
  ["prism-warden", "createPierceSpecialCatalog", "prism-warden", "pierce"],
  ["reedsting", "createBasicRangedCatalog", "reedsting", "ordinary-single-projectile"],
  ["rune-reaver", "createReturnSpecialCatalog", "rune-reaver", "return"],
  ["scatterguard", "createPelletSpecialCatalog", "scatterguard", "pellets"],
  ["stormkite", "createChainSpecialCatalog", "stormkite", "chain"],
];

const EXPECTED_UNRESOLVED_DELIVERY = [
  ["briar-band", "createSwarmCatalog", "briar-darter", "briar-darter.delivery", 2],
  ["copperskiff", "createBasicFlyingCatalog", "copperskiff", "copperskiff.delivery", 2],
];

const EXPECTED_EXCLUDED = [
  ["aegis-sage", "createChampionAbilityCatalog"],
  ["ashen-nest", "DEATH_SPAWN_IDENTITY"],
  ["bloom-wisp", "createHealCatalog"],
  ["bone-regent", "createChampionAbilityCatalog"],
  ["cinder-ray", "createRampSpecialCatalog"],
  ["cinderback", "createRecoilSpecialCatalog"],
  ["cinderlings", "createSwarmCatalog"],
  ["coilblade", "createBasicMeleeCatalog"],
  ["dawnmender", "createHealCatalog"],
  ["dusk-ranger", "createChampionAbilityCatalog"],
  ["emberlance", "createChargeKnockbackCatalog"],
  ["emberlance", "createChargeSpecialCatalog"],
  ["gilded-lancer", "createChampionAbilityCatalog"],
  ["gloam-shepherd", "DEATH_CONVERSION_IDENTITY"],
  ["iron-borer", "createChampionAbilityCatalog"],
  ["mossguard", "createBasicMeleeCatalog"],
  ["pulse-sentry", "createStunSpecialCatalog"],
  ["railward", "createShieldFormCatalog"],
  ["rime-adept", "createSlowSpecialCatalog"],
  ["skymaul", "createBasicFlyingCatalog"],
  ["stonehauler", "createStructureSeekerCatalog"],
  ["stonevault", "createJumpSpecialCatalog"],
  ["tether-rider", "createSnareSpecialCatalog"],
  ["veil-prowler", "createInvisibilitySpecialCatalog"],
  ["veilrunner", "createDashSpecialCatalog"],
  ["wayfinder", "createRetargetSpecialCatalog"],
];

const SOURCE_CATALOGS = {
  createBasicFlyingCatalog,
  createBasicRangedCatalog,
  createChainSpecialCatalog,
  createPelletSpecialCatalog,
  createPierceSpecialCatalog,
  createReflectionSpecialCatalog,
  createReturnSpecialCatalog,
};

const SPECIAL_FIXTURES = {
  chain: createChainQuestionFixture,
  pierce: createPierceQuestionFixture,
  return: createReturnQuestionFixture,
  pellets: createPelletQuestionFixture,
  reflection: createReflectionQuestionFixture,
};

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function deepFrozen(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return true;
  if (seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Object.values(value).every((child) =>
    deepFrozen(child, seen));
}

function claimRows(manifest) {
  return manifest.profiles.flatMap(({ claims }) => claims);
}

function profileById(manifest, id) {
  return manifest.profiles.find((profile) => profile.id === id);
}

function firstLaunch(Duel, createCombatant, cardId, opponentId) {
  const duel = new Duel({
    combatants: [
      createCombatant(cardId, 1),
      createCombatant(opponentId, 2),
    ],
  });
  for (let tick = 0; tick < 400; tick += 1) {
    duel.step();
    const launch = duel.replay.find(({ type, projectile }) =>
      type === "launch" && projectile.attackerId === 1);
    if (launch !== undefined) return launch;
  }
  throw new Error(`${cardId} did not produce a source launch`);
}

function genericFlyingLaunchEvidence(cardId) {
  const opponentId = cardId === "copperskiff" ? "skymaul" : "copperskiff";
  const launch = firstLaunch(BasicFlyingDuel, createBasicFlyingCombatant, cardId, opponentId);
  const { projectile } = launch;
  return {
    impactOffset: projectile.impactTick - projectile.launchTick,
    origin: projectile.origin,
    radius: projectile.radius,
    speed: projectile.speed,
    targetPosition: projectile.targetPosition,
    targetRadius: projectile.targetRadius,
  };
}

test("projectile profiles: exact admitted occurrence/card/archetype domain and pinned remainder", () => {
  const manifest = createSessionTroopProjectileProfileManifest();
  assert.deepEqual(manifest.occurrences.map(({ id, exportName, archetype, claimFamily }) =>
    [id, exportName, archetype, claimFamily]), EXPECTED_OCCURRENCES);
  assert.deepEqual(manifest.excludedOccurrences.map(({ id, exportName }) => [id, exportName]),
    EXPECTED_EXCLUDED);
  assert.deepEqual(manifest.unresolvedDeliveryDependencies.map((dependency) => [
    dependency.id,
    dependency.source.catalogExport,
    dependency.archetype,
    dependency.questions.delivery.key,
    dependency.questions.delivery.value,
  ]), EXPECTED_UNRESOLVED_DELIVERY);
  assert.deepEqual(manifest.counts, {
    claimedOccurrencePairs: 7,
    uniqueCardIds: 7,
    ordinarySourceClaims: 2,
    specialSourceClaims: 5,
    questionBearingClaims: 7,
    unresolvedDeliveryDependencies: 2,
    duplicatedCompositionOwnedIds: 1,
  });
  assert.deepEqual(manifest.profiles.map(({ id }) => id), [
    "aegis-sage", "brassbolt", "prism-warden", "reedsting",
    "rune-reaver", "scatterguard", "stormkite",
  ]);
  const htpKeys = new Set(createSessionTroopProfileManifest().occurrences.map(({ exportName, id }) =>
    `${exportName}\u0000${id}`));
  const classifiedKeys = [
    ...manifest.occurrences.map(({ exportName, id }) => `${exportName}\u0000${id}`),
    ...manifest.unresolvedDeliveryDependencies.map(({ source }) =>
      `${source.catalogExport}\u0000${source.record.id}`),
    ...manifest.excludedOccurrences.map(({ exportName, id }) => `${exportName}\u0000${id}`),
  ];
  assert.equal(classifiedKeys.length, 35);
  assert.equal(new Set(classifiedKeys).size, 35);
  assert.deepEqual(new Set(classifiedKeys), htpKeys);
});

test("projectile profiles: every claimed source join is exact and profiles are one-per-ID", () => {
  const manifest = createSessionTroopProjectileProfileManifest();
  const claims = claimRows(manifest);
  assert.equal(claims.length, 7);
  assert.equal(new Set(manifest.profiles.map(({ id }) => id)).size, 7);
  assert.equal(new Set(manifest.occurrences.map(({ exportName, id }) =>
    `${exportName}\u0000${id}`)).size, 7);

  for (const claim of claims) {
    const catalog = SOURCE_CATALOGS[claim.source.catalogExport];
    assert.equal(typeof catalog, "function", claim.archetype);
    const source = catalog().find(({ id }) => id === claim.source.record.id);
    assert.ok(source, claim.archetype);
    assert.deepEqual(claim.source.record, source, claim.archetype);
    assert.equal(claim.source.record.id, claim.archetype, claim.archetype);
    assert.equal(claim.source.component, null, claim.archetype);
    assert.equal(claim.delivery.classification, "sourced", claim.archetype);
    assert.equal(claim.delivery.delivery, "projectile", claim.archetype);
    const profile = profileById(manifest, claim.source.record.id);
    assert.ok(profile, claim.archetype);
    assert.ok(profile.occurrenceExports.includes(claim.source.catalogExport), claim.archetype);
    assert.deepEqual(profile.sourceCard, source, claim.archetype);
    assert.equal(profile.sourceIdentity.id, claim.source.record.id, claim.archetype);
  }

  const occurrenceClaimKeys = new Set(claims.map(({ source }) =>
    `${source.catalogExport}\u0000${source.record.id}`));
  assert.deepEqual(occurrenceClaimKeys, new Set(manifest.occurrences.map(({ exportName, id }) =>
    `${exportName}\u0000${id}`)));
});

test("projectile profiles: components stay owned by their card and duplicated compositions do not double count", () => {
  const manifest = createSessionTroopProjectileProfileManifest();
  const unresolved = manifest.unresolvedDeliveryDependencies.find(({ id }) => id === "briar-band");
  const copperskiff = manifest.unresolvedDeliveryDependencies.find(({ id }) => id === "copperskiff");
  assert.ok(unresolved);
  assert.ok(copperskiff);
  assert.equal(profileById(manifest, "briar-band"), undefined);
  assert.equal(manifest.profiles.some(({ id }) => id === "briar-darter"), false);
  assert.deepEqual({
    cardId: unresolved.source.record.id,
    componentId: unresolved.component.id,
    role: unresolved.component.role,
  }, {
    cardId: "briar-band",
    componentId: "briar-darter",
    role: "secondary",
  });
  assert.equal(manifest.occurrences.some(({ archetype }) => archetype === "briar-darter"), false);
  assert.equal(profileById(manifest, "copperskiff"), undefined);
  assert.equal(manifest.occurrences.some(({ id }) => id === "copperskiff"), false);
  assert.equal(copperskiff.component, null);
  assert.equal(copperskiff.source.record.id, "copperskiff");
  assert.equal(copperskiff.source.catalogExport, "createBasicFlyingCatalog");

  const aegis = profileById(manifest, "aegis-sage");
  assert.ok(aegis);
  assert.equal(aegis.claims.length, 1);
  assert.deepEqual(aegis.composition.sourceExports, [
    "createChampionAbilityCatalog", "createReflectionSpecialCatalog",
  ]);
  assert.deepEqual(manifest.compositionOwnedIds, ["aegis-sage"]);
  assert.equal(manifest.occurrences.filter(({ id }) => id === "aegis-sage").length, 1);
  assert.deepEqual(aegis.composition.sourceRecords.map(({ exportName }) => exportName), [
    "createChampionAbilityCatalog", "createReflectionSpecialCatalog",
  ]);
});

test("projectile profiles: unresolved delivery dependencies join exact HTO QUESTION records", () => {
  const manifest = createSessionTroopProjectileProfileManifest();
  for (const dependency of manifest.unresolvedDeliveryDependencies) {
    const delivery = dependency.questions.delivery;
    const hto = createSessionTroopWitnessQuestions(dependency.id)
      .filter(({ key }) => key === delivery.key);
    assert.equal(hto.length, 1, dependency.id);
    assert.deepEqual(delivery, hto[0], dependency.id);
    assert.deepEqual({
      authoritative: delivery.authoritative,
      confidence: delivery.confidence,
      disposition: delivery.disposition,
      key: delivery.key,
      source: delivery.source,
      value: delivery.value,
    }, {
      authoritative: false,
      confidence: "unverified",
      disposition: "question",
      key: `${dependency.archetype}.delivery`,
      source: "runtime-playability-estimate-not-comparison-corpus",
      value: 2,
    }, dependency.id);
    assert.equal(dependency.delivery.classification, "question", dependency.id);
    assert.equal(dependency.delivery.estimateOnly, true, dependency.id);
    assert.equal(dependency.source.evidence.delivery, "not-sourced", dependency.id);
  }
  assert.throws(() => getSessionTroopProjectileProfile("briar-band"), /QUESTION/u);
  assert.throws(() => getSessionTroopProjectileProfile("copperskiff"), /QUESTION/u);
});

test("projectile profiles: all five question fixtures are exact, fresh, and provenance-preserving", () => {
  const manifest = createSessionTroopProjectileProfileManifest();
  for (const [family, factory] of Object.entries(SPECIAL_FIXTURES)) {
    const expected = factory();
    assert.deepEqual(manifest.questionFixtures[family], expected, family);
    assert.deepEqual(
      claimRows(manifest).find(({ claimFamily }) => claimFamily === family).questions,
      expected,
      family,
    );
    for (const record of Object.values(manifest.questionFixtures[family])) {
      assert.equal(record.authoritative, false, family);
      assert.equal(record.confidence, "unverified", family);
      assert.equal(record.disposition, "question", family);
      assert.equal(typeof record.source, "string", family);
    }
  }
  const first = createSessionTroopProjectileProfileManifest();
  const second = createSessionTroopProjectileProfileManifest();
  assert.notEqual(first.questionFixtures, second.questionFixtures);
  assert.notEqual(first.questionFixtures.pellets.rayPattern.value,
    second.questionFixtures.pellets.rayPattern.value);
  assert.throws(() => createChainQuestionFixture({ targetCap: 4 }));
  assert.throws(() => createPierceQuestionFixture({}));
  assert.throws(() => createReturnQuestionFixture({}));
  assert.throws(() => createPelletQuestionFixture({}));
  assert.throws(() => createReflectionQuestionFixture({}));
});

test("projectile profiles: absent ordinary geometry remains QUESTION and special geometry stays fixture-owned", () => {
  const manifest = createSessionTroopProjectileProfileManifest();
  const ordinary = claimRows(manifest).filter(({ claimFamily }) =>
    claimFamily === "ordinary-single-projectile");
  assert.deepEqual(ordinary.map(({ archetype }) => archetype), [
    "brassbolt", "reedsting",
  ]);
  for (const claim of ordinary) {
    assert.deepEqual(Object.keys(claim.questions).sort(), [
      "projectileLengthMillitiles",
      "projectileSpeedMillitilesPerTick",
      "projectileTravelTicks",
      "projectileWidthMillitiles",
    ]);
    for (const question of Object.values(claim.questions)) {
      assert.equal(question.disposition, "question");
      assert.equal(question.authoritative, false);
      assert.equal(question.value, null);
    }
    assert.equal(Object.hasOwn(claim.source.record, "projectileSpeed"), false);
    assert.equal(Object.hasOwn(claim.source.record, "projectileTravelTicks"), false);
  }

  const chain = claimRows(manifest).find(({ claimFamily }) => claimFamily === "chain");
  const pierce = claimRows(manifest).find(({ claimFamily }) => claimFamily === "pierce");
  const returned = claimRows(manifest).find(({ claimFamily }) => claimFamily === "return");
  const pellets = claimRows(manifest).find(({ claimFamily }) => claimFamily === "pellets");
  const reflection = claimRows(manifest).find(({ claimFamily }) => claimFamily === "reflection");
  assert.equal(chain.questions.hopRangeMillitiles.value, 3000);
  assert.equal(pierce.questions.pierceLengthMillitiles.value, 11000);
  assert.equal(pierce.questions.corridorHalfWidthMillitiles.value, 250);
  assert.equal(returned.questions.turnDistanceMillitiles.value, 7000);
  assert.equal(returned.questions.projectileSpeedMillitilesPerTick.value, 1000);
  assert.equal(pellets.questions.pelletCount.value, 10);
  assert.deepEqual(pellets.questions.rayPattern.value[0], { x: 375, y: -200 });
  assert.equal(reflection.questions.reflectionRadiusMillitiles.value, 500);
  assert.equal(reflection.questions.loopPolicy.value, "one-reflection-maximum");
});

test("projectile profiles: basic ranged source contract emits card-specific launches", () => {
  const sourceById = new Map(createBasicRangedCatalog().map((record) => [record.id, record]));
  for (const cardId of ["brassbolt", "reedsting"]) {
    const opponentId = cardId === "brassbolt" ? "reedsting" : "brassbolt";
    const launch = firstLaunch(BasicRangedDuel, createBasicRangedCombatant, cardId, opponentId);
    const source = sourceById.get(cardId);
    assert.ok(source, cardId);
    assert.equal(launch.type, "launch", cardId);
    assert.equal(launch.projectile.damage, source.damage, cardId);
    assert.equal(launch.projectile.launchTick,
      source.deployTimeTicks + source.firstHitTicks, cardId);
    assert.equal(launch.projectile.impactTick, launch.projectile.launchTick, cardId);
    assert.equal(launch.projectile.radius, 0, cardId);
    assert.equal(launch.projectile.speed, 1, cardId);
    assert.equal(launch.projectile.targetId, 2, cardId);
  }
  const ordinary = claimRows(createSessionTroopProjectileProfileManifest())
    .filter(({ claimFamily }) => claimFamily === "ordinary-single-projectile");
  assert.deepEqual(ordinary.map(({ source, delivery }) => [
    source.catalogExport,
    source.evidence.sourceExports,
    delivery.classification,
    delivery.delivery,
  ]), [
    ["createBasicRangedCatalog",
      ["createBasicRangedCatalog", "createBasicRangedCombatant", "BasicRangedDuel"],
      "sourced", "projectile"],
    ["createBasicRangedCatalog",
      ["createBasicRangedCatalog", "createBasicRangedCombatant", "BasicRangedDuel"],
      "sourced", "projectile"],
  ]);
});

test("projectile profiles: generic flying launch evidence cannot admit Copperskiff", () => {
  assert.deepEqual(
    genericFlyingLaunchEvidence("copperskiff"),
    genericFlyingLaunchEvidence("skymaul"),
  );
  assert.deepEqual(genericFlyingLaunchEvidence("copperskiff"), {
    impactOffset: 0,
    origin: { x: 0, y: 0 },
    radius: 0,
    speed: 1,
    targetPosition: { x: 0, y: 0 },
    targetRadius: 0,
  });
  const manifest = createSessionTroopProjectileProfileManifest();
  assert.equal(manifest.profiles.some(({ id }) => id === "copperskiff"), false);
  assert.equal(manifest.occurrences.some(({ id }) => id === "copperskiff"), false);
  assert.throws(() => getSessionTroopProjectileProfile("skymaul"), /unknown|admitted/u);
  const skymaul = manifest.excludedOccurrences.find(({ id }) => id === "skymaul");
  assert.deepEqual({
    htpStatus: skymaul.htpStatus,
    reason: skymaul.reason,
    status: skymaul.status,
  }, {
    htpStatus: "admitted",
    reason: "the source and HTO projection do not claim delivery for this card; name and range are not delivery evidence",
    status: "excluded",
  });
});

test("projectile profiles: Aegis composition remains pending for GAME-001HTC", () => {
  const manifest = createSessionTroopProjectileProfileManifest();
  const pending = profileById(manifest, "aegis-sage").composition.pending;
  assert.deepEqual(Object.keys(pending).sort(), [
    "abilityCost", "cancellation", "compositionWithChampionAbility", "loopPolicy",
    "mechanicOrdering", "sameBoundaryTiming", "targetOwnership",
  ]);
  for (const value of Object.values(pending)) {
    assert.equal(value.owner, "GAME-001HTC");
    assert.equal(value.status, "pending");
  }
  assert.equal(manifest.occurrences.some(({ exportName }) =>
    exportName === "createChampionAbilityCatalog"), false);
  assert.equal(manifest.counts.duplicatedCompositionOwnedIds, 1);
  assert.equal(profileById(manifest, "aegis-sage").sharedHostIntegration.status,
    "pending-shared-host-integration");
});

test("projectile profiles: GAME-001TH identity adapter is required but has no second identity authority", () => {
  const manifest = createSessionTroopProjectileProfileManifest();
  assert.deepEqual(manifest.identityRequirements, {
    authority: "GAME-001TH",
    fields: ["attackSequence", "direction", "projectileId", "sourceId"],
    minting: "shared-host-owned",
    state: "not-owned-by-this-receipt",
    status: "required-adapter-contract",
  });
  for (const profile of manifest.profiles) {
    assert.deepEqual(profile.identityRequirements, manifest.identityRequirements);
    for (const claim of profile.claims) {
      assert.equal(Object.hasOwn(claim, "projectileId"), false);
      assert.equal(Object.hasOwn(claim.source.record, "projectileId"), false);
    }
  }
});

test("projectile profiles: no encounter/private simulator execution or coverage is claimed", () => {
  const pathname = fileURLToPath(new URL(
    "../src/content/session-troop-projectile-profiles.js", import.meta.url,
  ));
  const source = readFileSync(pathname, "utf8");
  assert.doesNotMatch(source, /Encounter/u);
  assert.doesNotMatch(source, /ProjectileCombat/u);
  assert.doesNotMatch(source, /BasicFlyingDuel/u);
  assert.doesNotMatch(source, /createBasicFlyingCombatant/u);
  assert.doesNotMatch(source, /new\s+(?:[A-Za-z]*Encounter|ProjectileCombat)/u);
  assert.doesNotMatch(source, /execution\s+coverage|private\s+simulator/u);
  assert.ok(createSessionTroopProjectileProfileManifest().profiles.every(({ sharedHostIntegration }) =>
    sharedHostIntegration.status === "pending-shared-host-integration"));
});

test("projectile profiles: outputs are fresh, deeply frozen, detached, and canonical", () => {
  const first = createSessionTroopProjectileProfileManifest();
  const second = createSessionTroopProjectileProfileManifest();
  assert.notEqual(first, second);
  assert.notEqual(first.profiles, second.profiles);
  assert.ok(deepFrozen(first));
  assert.ok(deepFrozen(second));
  const serialized = serializeSessionTroopProjectileProfileManifest();
  assert.equal(serialized, canonical(first));
  assert.equal(serialized, serializeSessionTroopProjectileProfileManifest());
  assert.equal(serialized.length, 69014);
  assert.equal(createHash("sha256").update(serialized).digest("hex"),
    "fb838b304f057475c7fa4a0c4363b2b3ad621d95ca966cae9fe22f377fc598fd");
  assert.throws(() => { first.profiles[0].id = "forged"; }, TypeError);
  assert.throws(() => { first.questionFixtures.pellets.rayPattern.value[0].x = 0; }, TypeError);
  assert.throws(() => { first.profiles.push(null); }, TypeError);
  assert.equal(getSessionTroopProjectileProfile("aegis-sage").id, "aegis-sage");
  assert.notEqual(getSessionTroopProjectileProfile("aegis-sage"),
    getSessionTroopProjectileProfile("aegis-sage"));
});

test("projectile profiles: primitive hostile lookup matrix is trap-zero and fail-closed", () => {
  let traps = 0;
  const hostile = new Proxy({
    get id() {
      traps += 1;
      throw new Error("attacker callback");
    },
  }, {
    get() {
      traps += 1;
      throw new Error("attacker callback");
    },
    getPrototypeOf() {
      traps += 1;
      throw new Error("attacker callback");
    },
  });
  const revoked = Proxy.revocable({}, {
    get() {
      traps += 1;
      throw new Error("attacker callback");
    },
  });
  revoked.revoke();
  const accessor = Object.defineProperty({}, "id", {
    get() {
      traps += 1;
      throw new Error("attacker callback");
    },
  });
  const crossRealmObject = vm.runInNewContext("({ id: 'aegis-sage' })");
  for (const value of [
    hostile, revoked.proxy, accessor, crossRealmObject, new String("aegis-sage"),
    Object.create(null), null, undefined, 1, Symbol("aegis-sage"), 1n, [],
  ]) {
    assert.throws(() => getSessionTroopProjectileProfile(value),
      /primitive string/u);
  }
  assert.equal(traps, 0);
  assert.throws(() => getSessionTroopProjectileProfile("aegis-sage", hostile),
    /exactly one argument/u);
  assert.throws(() => getSessionTroopProjectileProfile(""), /bounds/u);
  assert.throws(() => getSessionTroopProjectileProfile("x".repeat(129)), /bounds/u);
  assert.throws(() => getSessionTroopProjectileProfile("briar-band"), /QUESTION/u);
  assert.throws(() => getSessionTroopProjectileProfile("not-admitted"), /unknown|admitted/u);
});

test("projectile profiles: static isolation and source-change bounds are explicit", () => {
  const pathname = fileURLToPath(new URL(
    "../src/content/session-troop-projectile-profiles.js", import.meta.url,
  ));
  const source = readFileSync(pathname, "utf8");
  assert.doesNotMatch(source, /reference(?:[\\/] |\b)/u);
  assert.doesNotMatch(source, /(?:Date|performance|Math\.random|randomUUID|getRandomValues)\s*[.(]/u);
  assert.doesNotMatch(source, /(?:^|[^\w])(?:import\s*\(|require\s*\()/u);
  assert.doesNotMatch(source, /readFile|cards\.json/u);
  const manifest = createSessionTroopProjectileProfileManifest();
  assert.ok(manifest.occurrences.length <= 64);
  assert.ok(manifest.excludedOccurrences.length <= 64);
  assert.ok(manifest.unresolvedDeliveryDependencies.length <= 16);
  const sourceCatalog = createBasicRangedCatalog();
  sourceCatalog[0].damage = 1;
  assert.equal(getSessionTroopProjectileProfile("brassbolt").sourceCard.damage, 218);
  assert.equal(getSessionTroopProjectileProfile("brassbolt").claims[0].source.record.damage, 218);
  assert.equal(getSessionTroopProjectileProfile("reedsting").sourceCard.damage,
    createBasicRangedCatalog().find(({ id }) => id === "reedsting").damage);
  assert.equal(createSwarmCatalog().find(({ id }) => id === "briar-band")
    .components.find(({ id }) => id === "briar-darter").role, "secondary");
});
