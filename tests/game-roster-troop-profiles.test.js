import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

import * as content from "../src/content/index.js";
import { createSessionCardManifest } from "../src/content/session-card-catalog.js";
import {
  createSessionTroopProfileManifest,
  getSessionTroopOccurrence,
  getSessionTroopProfile,
  serializeSessionTroopProfileManifest,
} from "../src/content/session-troop-profile-catalog.js";

const QUESTION_REASON =
  "identity-only claim lacks sourced kind/cost/deploy admission fields";
const EXPECTED_OCCURRENCES = [
  ["createChampionAbilityCatalog", "aegis-sage", "admitted"],
  ["createReflectionSpecialCatalog", "aegis-sage", "admitted"],
  ["DEATH_SPAWN_IDENTITY", "ashen-nest", "question"],
  ["createHealCatalog", "bloom-wisp", "admitted"],
  ["createChampionAbilityCatalog", "bone-regent", "admitted"],
  ["createBasicMeleeCatalog", "brackenwheel", "admitted"],
  ["createBasicRangedCatalog", "brassbolt", "admitted"],
  ["createSwarmCatalog", "briar-band", "admitted"],
  ["createSwarmCatalog", "cinder-host", "admitted"],
  ["createRampSpecialCatalog", "cinder-ray", "admitted"],
  ["createRecoilSpecialCatalog", "cinderback", "admitted"],
  ["createSwarmCatalog", "cinderlings", "admitted"],
  ["createBasicMeleeCatalog", "coilblade", "admitted"],
  ["createOrdinaryProjectileSquadCatalog", "coppershade-flock", "admitted"],
  ["createBasicFlyingCatalog", "copperskiff", "admitted"],
  ["createHealCatalog", "dawnmender", "admitted"],
  ["createChampionAbilityCatalog", "dusk-ranger", "admitted"],
  ["createOrdinaryProjectileSquadCatalog", "duskwing-trio", "admitted"],
  ["createChargeKnockbackCatalog", "emberlance", "admitted"],
  ["createChargeSpecialCatalog", "emberlance", "admitted"],
  ["createSwarmCatalog", "forgeguard", "admitted"],
  ["createChampionAbilityCatalog", "gilded-lancer", "admitted"],
  ["DEATH_CONVERSION_IDENTITY", "gloam-shepherd", "question"],
  ["createSwarmCatalog", "gloamwing-cluster", "admitted"],
  ["createChampionAbilityCatalog", "iron-borer", "admitted"],
  ["createBasicMeleeCatalog", "ironroot", "admitted"],
  ["createOrdinaryProjectileSplashCatalog", "kilnkeeper", "admitted"],
  ["createBasicMeleeCatalog", "mossguard", "admitted"],
  ["createPierceSpecialCatalog", "prism-warden", "admitted"],
  ["createStunSpecialCatalog", "pulse-sentry", "admitted"],
  ["createShieldFormCatalog", "railward", "admitted"],
  ["createBasicRangedCatalog", "reedsting", "admitted"],
  ["createSlowSpecialCatalog", "rime-adept", "admitted"],
  ["createReturnSpecialCatalog", "rune-reaver", "admitted"],
  ["createPelletSpecialCatalog", "scatterguard", "admitted"],
  ["createBasicFlyingCatalog", "skymaul", "admitted"],
  ["createStructureSeekerCatalog", "stonehauler", "admitted"],
  ["createJumpSpecialCatalog", "stonevault", "admitted"],
  ["createChainSpecialCatalog", "stormkite", "admitted"],
  ["createOrdinaryProjectileSquadCatalog", "sunthread-pair", "admitted"],
  ["createSnareSpecialCatalog", "tether-rider", "admitted"],
  ["createSwarmCatalog", "thornscouts", "admitted"],
  ["createInvisibilitySpecialCatalog", "veil-prowler", "admitted"],
  ["createDashSpecialCatalog", "veilrunner", "admitted"],
  ["createRetargetSpecialCatalog", "wayfinder", "admitted"],
];
const EXPECTED_IDS = [
  "aegis-sage", "ashen-nest", "bloom-wisp", "bone-regent", "brackenwheel", "brassbolt",
  "briar-band", "cinder-host", "cinder-ray", "cinderback", "cinderlings", "coilblade",
  "coppershade-flock", "copperskiff", "dawnmender", "dusk-ranger", "duskwing-trio", "emberlance", "forgeguard", "gilded-lancer",
  "gloam-shepherd", "gloamwing-cluster", "iron-borer", "ironroot", "kilnkeeper", "mossguard", "prism-warden", "pulse-sentry",
  "railward", "reedsting", "rime-adept", "rune-reaver", "scatterguard", "skymaul",
  "stonehauler", "stonevault", "stormkite", "sunthread-pair", "tether-rider", "thornscouts", "veil-prowler",
  "veilrunner", "wayfinder",
];
const EXPECTED_COMPOSITIONS = {
  "aegis-sage": [
    ["champion-ability", "createChampionAbilityCatalog"],
    ["reflection-special", "createReflectionSpecialCatalog"],
  ],
  emberlance: [
    ["charge-knockback", "createChargeKnockbackCatalog"],
    ["charge-special", "createChargeSpecialCatalog"],
  ],
};

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
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

function deepFrozen(value) {
  if (value === null || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(deepFrozen);
}

function occurrenceTriples(manifest) {
  return manifest.occurrences.map(({ exportName, id, status }) =>
    [exportName, id, status]
  );
}

test("game roster troop profiles: exact 45 occurrence pairs and 43 identity IDs", () => {
  const manifest = createSessionTroopProfileManifest();
  assert.deepEqual(occurrenceTriples(manifest), EXPECTED_OCCURRENCES);
  assert.equal(manifest.occurrences.length, 45);
  assert.equal(new Set(manifest.occurrences.map(({ exportName, id }) =>
    `${exportName}\u0000${id}`
  )).size, 45);
  assert.deepEqual(
    [...new Set(manifest.occurrences.map(({ id }) => id))].sort(),
    [...EXPECTED_IDS].sort(),
  );
});

test("game roster troop profiles: exact admitted/question counts and derived session slice", () => {
  const manifest = createSessionTroopProfileManifest();
  assert.deepEqual(manifest.counts, {
    admittedIds: 41,
    admittedOccurrences: 43,
    claimedIds: 43,
    claimedOccurrences: 45,
    duplicateCompositionIds: 2,
    questionIds: 2,
    questionOccurrences: 2,
  });

  const session = createSessionCardManifest();
  const troopIds = new Set([
    ...manifest.profiles.map(({ id }) => id),
    ...manifest.questions.map(({ id }) => id),
  ]);
  const derived = session.occurrences
    .filter(({ id }) => troopIds.has(id))
    .map(({ exportName, id, status, reason }) => status === "question"
      ? { exportName, id, reason, status }
      : { exportName, id, status });
  assert.deepEqual(derived, manifest.occurrences);
  assert.deepEqual(manifest.profiles.map(({ id }) => id),
    [...manifest.profiles].map(({ id }) => id).sort());
  assert.deepEqual(manifest.questions.map(({ id }) => id), ["ashen-nest", "gloam-shepherd"]);
});

test("game roster troop profiles: admitted profiles are complete, source-backed, sorted, frozen, and detached", () => {
  const first = createSessionTroopProfileManifest();
  const second = createSessionTroopProfileManifest();
  assert.notEqual(first, second);
  assert.notEqual(first.profiles, second.profiles);
  assert.ok(deepFrozen(first));
  assert.ok(deepFrozen(second));
  assert.deepEqual(first, second);
  assert.equal(first.profiles.length, 41);
  assert.equal(new Set(first.profiles.map(({ id }) => id)).size, 41);

  for (const profile of first.profiles) {
    assert.deepEqual(Object.keys(profile).sort(), [
      "cost", "deployTimeTicks", "displayName", "id", "kind",
      "occurrenceExports", "placementClass",
    ]);
    assert.equal(profile.kind, "unit");
    assert.equal(profile.placementClass, "ground_entity");
    assert.deepEqual(profile.occurrenceExports,
      [...profile.occurrenceExports].sort());
    const sourceRows = profile.occurrenceExports.flatMap((exportName) =>
      sourceRecords(exportName).filter(({ id }) => id === profile.id)
    );
    assert.equal(sourceRows.length, profile.occurrenceExports.length, profile.id);
    for (const source of sourceRows) {
      assert.deepEqual({
        cost: source.cost,
        deployTimeTicks: source.deployTimeTicks,
        displayName: source.displayName,
        id: source.id,
        kind: source.kind,
        placementClass: "ground_entity",
      }, {
        cost: profile.cost,
        deployTimeTicks: profile.deployTimeTicks,
        displayName: profile.displayName,
        id: profile.id,
        kind: profile.kind,
        placementClass: profile.placementClass,
      });
    }
  }
});

test("game roster troop profiles: QUESTION identities reject without an invented profile", () => {
  const manifest = createSessionTroopProfileManifest();
  assert.deepEqual(manifest.questions, [
    { exportName: "DEATH_SPAWN_IDENTITY", id: "ashen-nest", reason: QUESTION_REASON, status: "question" },
    { exportName: "DEATH_CONVERSION_IDENTITY", id: "gloam-shepherd", reason: QUESTION_REASON, status: "question" },
  ]);
  assert.deepEqual(manifest.profiles.map(({ id }) => id)
    .filter((id) => ["ashen-nest", "gloam-shepherd"].includes(id)), []);
  for (const id of ["ashen-nest", "gloam-shepherd"]) {
    assert.throws(() => getSessionTroopProfile(id), /explicit QUESTION/u);
  }
  assert.deepEqual(getSessionTroopOccurrence("DEATH_SPAWN_IDENTITY", "ashen-nest"),
    manifest.questions[0]);
  assert.deepEqual(getSessionTroopOccurrence("DEATH_CONVERSION_IDENTITY", "gloam-shepherd"),
    manifest.questions[1]);
});

test("game roster troop profiles: duplicated IDs have one honest shared composition each", () => {
  const manifest = createSessionTroopProfileManifest();
  assert.deepEqual(manifest.compositions.map(({ id }) => id), ["aegis-sage", "emberlance"]);
  assert.equal(manifest.compositions.length, 2);
  for (const composition of manifest.compositions) {
    const expected = EXPECTED_COMPOSITIONS[composition.id];
    assert.ok(expected);
    assert.deepEqual(composition.claims.map(({ claimFamily, exportName }) =>
      [claimFamily, exportName]), expected);
    assert.deepEqual(composition.occurrenceExports,
      expected.map(([, exportName]) => exportName).sort());
    const profile = getSessionTroopProfile(composition.id);
    assert.deepEqual(profile.occurrenceExports, composition.occurrenceExports);
    assert.equal(composition.mode, "one-shared-session-profile-membership-only");
  }
  assert.deepEqual(manifest.profiles.filter(({ occurrenceExports }) => occurrenceExports.length > 1)
    .map(({ id }) => id), ["aegis-sage", "emberlance"]);
});

test("game roster troop profiles: composition execution facts remain explicit QUESTIONs", () => {
  const expectedFields = [
    "abilityCost", "cancellation", "damage", "mechanicOrdering", "phaseTiming",
    "radius", "runtimeComposition", "targeting",
  ];
  for (const composition of createSessionTroopProfileManifest().compositions) {
    assert.deepEqual(composition.questions.map(({ field }) => field), expectedFields);
    for (const question of composition.questions) {
      assert.deepEqual(Object.keys(question).sort(), ["field", "reason", "status"]);
      assert.equal(question.status, "question");
      assert.equal(question.reason,
        "shared occurrence membership does not source this execution fact");
    }
  }
});

test("game roster troop profiles: every occurrence maps once to a profile/question and duplicate membership is bijective", () => {
  const manifest = createSessionTroopProfileManifest();
  const rows = new Map(manifest.occurrences.map(({ exportName, id }) =>
    [`${exportName}\u0000${id}`, 0]
  ));
  for (const profile of manifest.profiles) {
    for (const exportName of profile.occurrenceExports) {
      const key = `${exportName}\u0000${profile.id}`;
      assert.ok(rows.has(key));
      rows.set(key, rows.get(key) + 1);
    }
  }
  for (const question of manifest.questions) {
    const key = `${question.exportName}\u0000${question.id}`;
    assert.ok(rows.has(key));
    rows.set(key, rows.get(key) + 1);
  }
  assert.ok([...rows.values()].every((count) => count === 1));

  const compositionMembership = new Map();
  for (const composition of manifest.compositions) {
    for (const exportName of composition.occurrenceExports) {
      const key = `${exportName}\u0000${composition.id}`;
      compositionMembership.set(key, (compositionMembership.get(key) ?? 0) + 1);
      assert.equal(manifest.occurrences.filter(({ exportName: actualExport, id }) =>
        actualExport === exportName && id === composition.id
      ).length, 1);
    }
  }
  assert.equal(compositionMembership.size, 4);
  assert.ok([...compositionMembership.values()].every((count) => count === 1));
});

test("game roster troop profiles: canonical serialization is repeatable and immutable-only", () => {
  const manifest = createSessionTroopProfileManifest();
  const bytes = serializeSessionTroopProfileManifest();
  assert.equal(bytes, canonical(manifest));
  assert.equal(bytes, serializeSessionTroopProfileManifest());
  assert.throws(() => createSessionTroopProfileManifest("extra"), /no arguments/u);
  assert.throws(() => serializeSessionTroopProfileManifest("extra"), /no arguments/u);
});

test("game roster troop profiles: primitive-only lookup rejects hostile values without callbacks", () => {
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
  const crossRealmObject = vm.runInNewContext("({ id: 'mossguard' })");
  const unicodeConfusable = "mossgu\u0430rd";

  for (const value of [hostile, revoked.proxy, accessor, crossRealmObject, new String("mossguard"), Object.create(null)]) {
    assert.throws(() => getSessionTroopProfile(value), /primitive string/u);
  }
  assert.throws(() => getSessionTroopProfile(unicodeConfusable), /unknown|not admitted/u);
  assert.throws(() => getSessionTroopProfile("mossguard", hostile), /exactly one argument/u);
  assert.throws(() => getSessionTroopOccurrence(hostile, "mossguard"), /primitive strings/u);
  assert.throws(() => getSessionTroopOccurrence("createBasicMeleeCatalog", hostile), /primitive strings/u);
  assert.throws(() => getSessionTroopOccurrence("createBasicMeleeCatalog", "mossguard", hostile), /exactly two arguments/u);
  assert.equal(getSessionTroopProfile(vm.runInNewContext("'mossguard'" )).id, "mossguard");
  assert.equal(traps, 0);
});

test("game roster troop profiles: hostile clone mutation cannot affect future calls", () => {
  const first = createSessionTroopProfileManifest();
  const profile = getSessionTroopProfile("mossguard");
  assert.throws(() => { first.profiles[0].id = "forged"; }, TypeError);
  assert.throws(() => { first.profiles.push(profile); }, TypeError);
  assert.throws(() => { profile.occurrenceExports[0] = "forged"; }, TypeError);
  assert.equal(createSessionTroopProfileManifest().profiles[0].id, "aegis-sage");
  assert.equal(getSessionTroopProfile("mossguard").id, "mossguard");
  assert.equal(getSessionTroopOccurrence("createBasicMeleeCatalog", "mossguard").id,
    "mossguard");
});

test("game roster troop profiles: shipped module is deterministic and isolated", () => {
  const pathname = fileURLToPath(new URL(
    "../src/content/session-troop-profile-catalog.js", import.meta.url
  ));
  const source = readFileSync(pathname, "utf8");
  assert.doesNotMatch(source, /reference(?:[\\/]|\b)/u);
  assert.doesNotMatch(source, /(?:Date|performance|Math\.random|randomUUID|getRandomValues)\s*[.(]/u);
  assert.doesNotMatch(source, /(?:^|[^\w])(?:import\s*\(|require\s*\()/u);
});
