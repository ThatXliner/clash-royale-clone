import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import vm from "node:vm";

import { createHealCatalog, createHealQuestionRecords } from "../src/content/cards/combat-status-heal.js";
import { createInvisibilityQuestionRecords, createInvisibilitySpecialCatalog } from "../src/content/cards/combat-status-invisibility.js";
import { createShieldFormCatalog } from "../src/content/cards/shields-forms.js";
import { createSlowQuestionRecords, createSlowSpecialCatalog } from "../src/content/cards/special-combat-slow.js";
import { createSnareQuestionRecords, createSnareSpecialCatalog } from "../src/content/cards/special-combat-snare.js";
import { createReflectionQuestionFixture, createReflectionSpecialCatalog } from "../src/content/cards/special-projectiles-reflection.js";
import { createStunQuestionRecords, createStunSpecialCatalog } from "../src/content/cards/combat-status-stun.js";
import { createSessionTroopProfileManifest } from "../src/content/session-troop-profile-catalog.js";
import {
  createSessionTroopStatusProfileManifest,
  getSessionTroopStatusProfile,
  serializeSessionTroopStatusProfileManifest,
} from "../src/content/session-troop-status-profiles.js";

const EXPECTED_OCCURRENCES = [
  ["createReflectionSpecialCatalog", "aegis-sage"],
  ["createHealCatalog", "bloom-wisp"],
  ["createHealCatalog", "dawnmender"],
  ["createStunSpecialCatalog", "pulse-sentry"],
  ["createShieldFormCatalog", "railward"],
  ["createSlowSpecialCatalog", "rime-adept"],
  ["createSnareSpecialCatalog", "tether-rider"],
  ["createInvisibilitySpecialCatalog", "veil-prowler"],
];
const EXPECTED_FAMILIES = [
  "heal", "invisibility", "reflection", "shield-form", "slow", "snare", "stun",
];
const EXPECTED_QUESTION_COUNTS = {
  createHealQuestionRecords: 47,
  createInvisibilityQuestionRecords: 41,
  createReflectionQuestionFixture: 31,
  createSlowQuestionRecords: 43,
  createSnareQuestionRecords: 43,
  createStunQuestionRecords: 35,
};
const QUESTION_FACTORIES = {
  createHealQuestionRecords,
  createInvisibilityQuestionRecords,
  createReflectionQuestionFixture,
  createSlowQuestionRecords,
  createSnareQuestionRecords,
  createStunQuestionRecords,
};
const SOURCE_FACTORIES = {
  createHealCatalog,
  createInvisibilitySpecialCatalog,
  createReflectionSpecialCatalog,
  createShieldFormCatalog,
  createSlowSpecialCatalog,
  createSnareSpecialCatalog,
  createStunSpecialCatalog,
};

const STATUS_PROFILE_SOURCE_PATH = fileURLToPath(new URL(
  "../src/content/session-troop-status-profiles.js", import.meta.url,
));
const STATUS_PROFILE_SOURCE = readFileSync(STATUS_PROFILE_SOURCE_PATH, "utf8");
const STATUS_PROFILE_SERIALIZED_BYTES = 82575;
const STATUS_PROFILE_SERIALIZED_SHA256 =
  "1cc9ce7c735abcf14f5967372c0d150bdb6f1a5814f0ed6c40a55c798e1eff88";
const SOURCE_EXPORTS = Object.keys(SOURCE_FACTORIES).sort();
const GENERAL_SOURCE_MUTATIONS = [
  "append-future",
  "prepend-future",
  "insert-future",
  "replace-with-future",
  "duplicate-expected",
  "duplicate-future",
  "malformed-future",
];
const SHAPE_SOURCE_MUTATIONS = [
  "sparse-array",
  "exotic-array",
  "proxy-array",
  "proxy-row",
  "accessor-row",
  "symbol-row",
  "non-string-id",
  "empty-id",
  "oversized-id",
];

function transformedStatusProfileSource() {
  return STATUS_PROFILE_SOURCE
    .replace(/from "\.\/cards\/[^"]+"/gu, 'from "./status-catalog-fixture.js"')
    .replace(
      'from "./session-troop-profile-catalog.js"',
      'from "./status-catalog-fixture.js"',
    );
}

function sourceCatalogFixtureSource(targetExport, mutation, sourceRoot) {
  const source = (relativePath) => JSON.stringify(pathToFileURL(
    join(sourceRoot, relativePath),
  ).href);
  return `
import * as heal from ${source("src/content/cards/combat-status-heal.js")};
import * as invisibility from ${source("src/content/cards/combat-status-invisibility.js")};
import * as reflection from ${source("src/content/cards/special-projectiles-reflection.js")};
import * as shield from ${source("src/content/cards/shields-forms.js")};
import * as slow from ${source("src/content/cards/special-combat-slow.js")};
import * as snare from ${source("src/content/cards/special-combat-snare.js")};
import * as stun from ${source("src/content/cards/combat-status-stun.js")};
import { createSessionTroopProfileManifest } from ${source("src/content/session-troop-profile-catalog.js")};

const target = ${JSON.stringify(targetExport)};
const mode = ${JSON.stringify(mutation)};
const calls = Object.create(null);
const stable = new Map();

function copy(value) {
  return structuredClone(value);
}

function futureRow(rows) {
  const row = copy(rows[0]);
  row.id = "future-source-row";
  return row;
}

function firstRowWithId(rows, id) {
  return rows.find((row) => row.id === id);
}

function mutate(exportName, rows, call) {
  if (exportName !== target) return rows;
  if (mode === "repeat-same-array") {
    if (!stable.has(exportName)) stable.set(exportName, rows);
    return stable.get(exportName);
  }
  if (mode.startsWith("repeat-") && call !== 2) return rows;
  if (mode === "append-future" || mode === "third-row" || mode === "repeat-count") {
    rows.push(futureRow(rows));
  } else if (mode === "prepend-future") {
    rows.unshift(futureRow(rows));
  } else if (mode === "insert-future") {
    rows.splice(1, 0, futureRow(rows));
  } else if (mode === "replace-with-future") {
    rows[0] = futureRow(rows);
  } else if (mode === "duplicate-expected" || mode === "duplicate-bloom") {
    rows = [rows[0], copy(rows[0])];
  } else if (mode === "duplicate-dawn") {
    rows = [firstRowWithId(rows, "dawnmender"), copy(firstRowWithId(rows, "dawnmender"))];
  } else if (mode === "duplicate-future") {
    const future = futureRow(rows);
    rows = [future, copy(future)];
  } else if (mode === "malformed-future") {
    const malformed = futureRow(rows);
    delete malformed.displayName;
    rows.push(malformed);
  } else if (mode === "remove-bloom") {
    rows = rows.filter((row) => row.id !== "bloom-wisp");
  } else if (mode === "remove-dawn") {
    rows = rows.filter((row) => row.id !== "dawnmender");
  } else if (mode === "swap-heal-ids") {
    const firstId = rows[0].id;
    rows[0].id = rows[1].id;
    rows[1].id = firstId;
  } else if (mode === "conflicting-duplicate") {
    const conflicting = copy(rows[0]);
    conflicting.damage += 1;
    rows = [rows[0], conflicting];
  } else if (mode === "sparse-array") {
    delete rows[0];
  } else if (mode === "exotic-array") {
    Object.setPrototypeOf(rows, null);
  } else if (mode === "proxy-array") {
    return new Proxy(rows, {});
  } else if (mode === "proxy-row") {
    rows[0] = new Proxy(rows[0], {});
  } else if (mode === "accessor-row") {
    Object.defineProperty(rows[0], "id", {
      configurable: true,
      enumerable: true,
      get() { throw new Error("source accessor probe"); },
    });
  } else if (mode === "symbol-row") {
    rows[0][Symbol("source probe")] = true;
  } else if (mode === "non-string-id") {
    rows[0].id = 7;
  } else if (mode === "empty-id") {
    rows[0].id = "";
  } else if (mode === "oversized-id") {
    rows[0].id = "x".repeat(129);
  } else if (mode === "repeat-bytes") {
    rows[0].damage += 1;
  } else if (mode === "repeat-order") {
    rows.reverse();
  } else if (mode === "repeat-id") {
    rows[0].id = "future-source-row";
  }
  return rows;
}

function wrap(exportName, factory) {
  return function wrappedFactory(...args) {
    const count = (calls[exportName] ?? 0) + 1;
    calls[exportName] = count;
    return mutate(exportName, factory(...args), count);
  };
}

export const createHealCatalog = wrap("createHealCatalog", heal.createHealCatalog);
export const createInvisibilitySpecialCatalog = wrap(
  "createInvisibilitySpecialCatalog", invisibility.createInvisibilitySpecialCatalog,
);
export const createReflectionSpecialCatalog = wrap(
  "createReflectionSpecialCatalog", reflection.createReflectionSpecialCatalog,
);
export const createShieldFormCatalog = wrap(
  "createShieldFormCatalog", shield.createShieldFormCatalog,
);
export const createSlowSpecialCatalog = wrap(
  "createSlowSpecialCatalog", slow.createSlowSpecialCatalog,
);
export const createSnareSpecialCatalog = wrap(
  "createSnareSpecialCatalog", snare.createSnareSpecialCatalog,
);
export const createStunSpecialCatalog = wrap(
  "createStunSpecialCatalog", stun.createStunSpecialCatalog,
);
export const createHealQuestionRecords = heal.createHealQuestionRecords;
export const createInvisibilityQuestionRecords = invisibility.createInvisibilityQuestionRecords;
export const createReflectionQuestionFixture = reflection.createReflectionQuestionFixture;
export const createSlowQuestionRecords = slow.createSlowQuestionRecords;
export const createSnareQuestionRecords = snare.createSnareQuestionRecords;
export const createStunQuestionRecords = stun.createStunQuestionRecords;
export { createSessionTroopProfileManifest };
`;
}

async function assertTransformedCatalogRejected(targetExport, mutation) {
  const directory = mkdtempSync(join(tmpdir(), "status-catalog-probe-"));
  const modulePath = join(directory, "session-troop-status-profiles.js");
  try {
    writeFileSync(
      join(directory, "status-catalog-fixture.js"),
      sourceCatalogFixtureSource(
        targetExport,
        mutation,
        fileURLToPath(new URL("..", import.meta.url)),
      ),
      "utf8",
    );
    writeFileSync(modulePath, transformedStatusProfileSource(), "utf8");
    await assert.rejects(
      import(`${pathToFileURL(modulePath).href}?${targetExport}-${mutation}`),
      Error,
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function deepFrozen(value) {
  if (value === null || typeof value !== "object") return true;
  return Object.isFrozen(value) && Reflect.ownKeys(value).every((key) =>
    deepFrozen(value[key]));
}

function sourceRecord(factory, id) {
  const rows = factory();
  const matches = rows.filter((record) => record.id === id);
  assert.equal(matches.length, 1, `${id} source join`);
  return matches[0];
}

function claimFor(manifest, exportName, id) {
  const matches = manifest.claims.filter((claim) =>
    claim.sourceExport === exportName && claim.id === id);
  assert.equal(matches.length, 1, `${exportName}/${id} claim`);
  return matches[0];
}

test("game roster troop status profiles: exact 8 HTP occurrence pairs and 8 IDs", () => {
  const manifest = createSessionTroopStatusProfileManifest();
  assert.deepEqual(
    manifest.occurrences.map(({ exportName, id }) => [exportName, id]),
    EXPECTED_OCCURRENCES,
  );
  assert.ok(manifest.occurrences.every(({ status }) => status === "admitted"));
  assert.equal(manifest.occurrences.length, 8);
  assert.equal(new Set(manifest.occurrences.map(({ exportName, id }) =>
    `${exportName}\u0000${id}`)).size, 8);
  assert.deepEqual(
    [...new Set(manifest.occurrences.map(({ id }) => id))].sort(),
    ["aegis-sage", "bloom-wisp", "dawnmender", "pulse-sentry", "railward",
      "rime-adept", "tether-rider", "veil-prowler"],
  );
  const htp = createSessionTroopProfileManifest();
  assert.deepEqual(
    htp.occurrences.filter(({ exportName, id }) =>
      EXPECTED_OCCURRENCES.some(([expectedExport, expectedId]) =>
        expectedExport === exportName && expectedId === id)),
    manifest.occurrences.map(({ exportName, id, status }) => ({ exportName, id, status })),
  );
});

test("game roster troop status profiles: exact counts and one profile per ID", () => {
  const manifest = createSessionTroopStatusProfileManifest();
  assert.deepEqual(manifest.counts, {
    claims: 8,
    compositionOwnedIds: 1,
    duplicatedCompositionIds: 1,
    healClaims: 2,
    ids: 8,
    occurrencePairs: 8,
    profiles: 8,
    questionBearingClaims: 7,
    questionFactories: 6,
    questionRecords: 240,
    statusClaims: 5,
    unresolvedOnlyClaims: 1,
    visibilityClaims: 1,
  });
  assert.equal(manifest.profiles.length, 8);
  assert.equal(new Set(manifest.profiles.map(({ id }) => id)).size, 8);
  assert.deepEqual(manifest.profiles.map(({ id }) => id),
    [...manifest.profiles].map(({ id }) => id).sort());
  assert.deepEqual([...new Set(manifest.claims.map(({ claimFamily }) => claimFamily))].sort(),
    EXPECTED_FAMILIES);
  for (const profile of manifest.profiles) {
    const claim = claimFor(manifest, profile.sourceExport, profile.id);
    assert.equal(profile.claimFamily, claim.claimFamily);
    assert.equal(profile.integration.statement, "shared runtime integration remains pending");
    assert.equal(profile.integration.status, "pending");
    assert.equal(profile.questionReceipt, claim.questionReceipt);
  }
});

test("game roster troop status profiles: valid catalog cache is pinned at 8/240 and canonical bytes", () => {
  const manifest = createSessionTroopStatusProfileManifest();
  const serialized = serializeSessionTroopStatusProfileManifest();
  assert.equal(manifest.profiles.length, 8);
  assert.equal(manifest.counts.questionRecords, 240);
  assert.equal(Buffer.byteLength(serialized, "utf8"), STATUS_PROFILE_SERIALIZED_BYTES);
  assert.equal(
    createHash("sha256").update(serialized, "utf8").digest("hex"),
    STATUS_PROFILE_SERIALIZED_SHA256,
  );
});

test("game roster troop status profiles: every source catalog mutation fails closed independently", async () => {
  const cases = [
    ...GENERAL_SOURCE_MUTATIONS.flatMap((mutation) =>
      SOURCE_EXPORTS.map((exportName) => [exportName, mutation])),
    ...SHAPE_SOURCE_MUTATIONS.flatMap((mutation) =>
      SOURCE_EXPORTS.map((exportName) => [exportName, mutation])),
    ...["repeat-bytes", "repeat-count", "repeat-id", "repeat-same-array"].flatMap((mutation) =>
      SOURCE_EXPORTS.map((exportName) => [exportName, mutation])),
    ["createHealCatalog", "repeat-order"],
    ["createHealCatalog", "remove-bloom"],
    ["createHealCatalog", "remove-dawn"],
    ["createHealCatalog", "duplicate-bloom"],
    ["createHealCatalog", "duplicate-dawn"],
    ["createHealCatalog", "third-row"],
    ["createHealCatalog", "swap-heal-ids"],
    ["createHealCatalog", "conflicting-duplicate"],
  ];
  assert.equal(cases.length, 148);
  await Promise.all(cases.map(([exportName, mutation]) =>
    assertTransformedCatalogRejected(exportName, mutation)));
});

test("game roster troop status profiles: every source export joins one complete witness", () => {
  const manifest = createSessionTroopStatusProfileManifest();
  const htp = createSessionTroopProfileManifest();
  for (const claim of manifest.claims) {
    const source = sourceRecord(SOURCE_FACTORIES[claim.sourceExport], claim.id);
    assert.deepEqual(claim.sourceRecord, source);
    assert.equal(claim.sourceWitness, canonical(source));
    assert.deepEqual(claim.htpProvenance.occurrence, {
      exportName: claim.sourceExport,
      id: claim.id,
      status: "admitted",
    });
    const htpProfile = htp.profiles.find(({ id }) => id === claim.id);
    assert.ok(htpProfile);
    assert.ok(htpProfile.occurrenceExports.includes(claim.sourceExport));
    assert.deepEqual({
      cost: claim.sourceRecord.cost,
      deployTimeTicks: claim.sourceRecord.deployTimeTicks,
      displayName: claim.sourceRecord.displayName,
      id: claim.sourceRecord.id,
      kind: claim.sourceRecord.kind,
      placementClass: "ground_entity",
    }, {
      cost: htpProfile.cost,
      deployTimeTicks: htpProfile.deployTimeTicks,
      displayName: htpProfile.displayName,
      id: htpProfile.id,
      kind: htpProfile.kind,
      placementClass: htpProfile.placementClass,
    });
    assert.equal(claim.integration.statement, "shared runtime integration remains pending");
  }
});

test("game roster troop status profiles: exact six question factories are represented freshly and canonically", () => {
  const manifest = createSessionTroopStatusProfileManifest();
  assert.deepEqual(manifest.questionReceipts.map(({ factory }) => factory),
    Object.keys(EXPECTED_QUESTION_COUNTS).sort());
  for (const receipt of manifest.questionReceipts) {
    assert.equal(receipt.records.length, EXPECTED_QUESTION_COUNTS[receipt.factory]);
    assert.ok(deepFrozen(receipt));
    const first = QUESTION_FACTORIES[receipt.factory]();
    const second = QUESTION_FACTORIES[receipt.factory]();
    assert.notStrictEqual(first, second);
    assert.deepEqual(canonical(first), canonical(second));
    assert.throws(() => QUESTION_FACTORIES[receipt.factory]({ override: true }), TypeError);
    const expectedKeys = Object.keys(first).sort();
    assert.deepEqual(receipt.records.map(({ key }) => key), expectedKeys);
    for (const { key, rawRecord } of receipt.records) {
      assert.deepEqual(rawRecord, first[key]);
      assert.notStrictEqual(rawRecord, first[key]);
      assert.equal(rawRecord.authoritative, false);
      assert.equal(rawRecord.confidence, "unverified");
      assert.equal(rawRecord.disposition, "question");
      assert.equal(rawRecord.source.length > 0, true);
      if (Object.hasOwn(rawRecord, "key")) assert.equal(rawRecord.key, key);
    }
  }
});

test("game roster troop status profiles: every raw question field and metadata survives normalization", () => {
  const manifest = createSessionTroopStatusProfileManifest();
  const actual = new Map(manifest.questionReceipts.map((receipt) => [receipt.factory, receipt]));
  for (const [factoryName, factory] of Object.entries(QUESTION_FACTORIES)) {
    const receipt = actual.get(factoryName);
    const expected = factory();
    assert.ok(receipt);
    assert.deepEqual(
      Object.fromEntries(receipt.records.map(({ key, rawRecord: record }) => [key, record])),
      expected,
    );
    assert.equal(receipt.sourceExport,
      factoryName === "createHealQuestionRecords" ? "createHealCatalog" :
        factoryName === "createInvisibilityQuestionRecords" ? "createInvisibilitySpecialCatalog" :
          factoryName === "createReflectionQuestionFixture" ? "createReflectionSpecialCatalog" :
            factoryName === "createSlowQuestionRecords" ? "createSlowSpecialCatalog" :
              factoryName === "createSnareQuestionRecords" ? "createSnareSpecialCatalog" :
                "createStunSpecialCatalog");
  }
});

test("game roster troop status profiles: Railward is unresolved-only with no fabricated special policy", () => {
  const manifest = createSessionTroopStatusProfileManifest();
  const railward = claimFor(manifest, "createShieldFormCatalog", "railward");
  assert.equal(railward.claimFamily, "shield-form");
  assert.equal(railward.resolution, "unresolved-only");
  assert.equal(railward.questionReceipt, null);
  assert.match(railward.unresolved.reason,
    /createShieldFormCatalog has no exported QUESTION factory/u);
  assert.doesNotMatch(railward.unresolved.reason, /\d/u);
  assert.deepEqual(railward.unresolved.fields.map(({ field }) => field), [
    "shieldMagnitude", "shieldDuration", "formTransition", "phaseTiming",
    "retargeting", "stationaryForm",
  ]);
  assert.ok(railward.unresolved.fields.every(({ reason, status }) =>
    reason === "source does not supply this shield/form fact" && status === "unresolved"));
  assert.equal(Object.hasOwn(railward, "numericPolicy"), false);
  assert.equal(Object.hasOwn(railward, "mechanicPolicy"), false);
  assert.equal(Object.hasOwn(railward, "shieldHealth"), false);
  assert.equal(Object.hasOwn(railward, "formTiming"), false);
  assert.equal(Object.hasOwn(railward, "specialFields"), false);
});

test("game roster troop status profiles: Aegis reflection is membership-only with all composition questions pending", () => {
  const manifest = createSessionTroopStatusProfileManifest();
  const aegis = claimFor(manifest, "createReflectionSpecialCatalog", "aegis-sage");
  assert.equal(aegis.claimFamily, "reflection");
  assert.deepEqual(aegis.reflection, {
    projectileMembership: "pending",
    statusMembership: "provenance-only",
  });
  assert.equal(aegis.composition.mode, "membership-only");
  assert.equal(aegis.composition.runtime, "shared runtime integration remains pending");
  assert.deepEqual(aegis.composition.questions.map(({ field }) => field), [
    "abilityCost", "cancellation", "damage", "mechanicOrdering", "phaseTiming",
    "radius", "runtimeComposition", "targeting", "loops", "sameBoundaryTiming",
    "targetOwnership",
  ]);
  assert.ok(aegis.composition.questions.every(({ reason, status }) =>
    reason === "shared composition remains pending" && status === "question"));
  assert.equal(manifest.profiles.find(({ id }) => id === "aegis-sage").composition.mode,
    "membership-only");
  assert.equal(manifest.claims.filter(({ id }) => id === "aegis-sage").length, 1);
});

test("game roster troop status profiles: no ramp, spell, champion, or projectile-only leakage", () => {
  const manifest = createSessionTroopStatusProfileManifest();
  assert.deepEqual(manifest.claims.map(({ sourceExport }) => sourceExport), [
    "createReflectionSpecialCatalog", "createHealCatalog", "createHealCatalog",
    "createStunSpecialCatalog", "createShieldFormCatalog", "createSlowSpecialCatalog",
    "createSnareSpecialCatalog", "createInvisibilitySpecialCatalog",
  ]);
  assert.ok(manifest.claims.every((claim) =>
    !Object.hasOwn(claim, "ramp") && !Object.hasOwn(claim, "spell") &&
    !Object.hasOwn(claim, "champion") && !Object.hasOwn(claim, "projectile")));
  assert.equal(manifest.claims.filter(({ claimFamily }) => claimFamily === "reflection").length, 1);
  assert.equal(manifest.claims.filter(({ claimFamily }) => claimFamily === "reflection" &&
    claimFamily !== "reflection").length, 0);
});

test("game roster troop status profiles: no private encounter or shared-session claim is present", () => {
  const manifest = createSessionTroopStatusProfileManifest();
  assert.equal(Object.hasOwn(manifest, "encounters"), false);
  assert.equal(Object.hasOwn(manifest, "simulation"), false);
  assert.equal(Object.hasOwn(manifest, "coverage"), false);
  assert.ok(manifest.claims.every(({ integration }) =>
    integration.statement === "shared runtime integration remains pending"));
  assert.ok(manifest.profiles.every(({ integration }) =>
    integration.statement === "shared runtime integration remains pending"));
  const source = readFileSync(fileURLToPath(new URL(
    "../src/content/session-troop-status-profiles.js", import.meta.url,
  )), "utf8");
  assert.doesNotMatch(source, /Encounter|new\s+\w*Encounter|\.command\(|\.step\(/u);
});

test("game roster troop status profiles: full graph is fresh, detached, deeply frozen, and repeatable", () => {
  const first = createSessionTroopStatusProfileManifest();
  const second = createSessionTroopStatusProfileManifest();
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.claims, second.claims);
  assert.deepEqual(first, second);
  assert.ok(deepFrozen(first));
  assert.ok(deepFrozen(second));
  assert.equal(serializeSessionTroopStatusProfileManifest(), canonical(first));
  assert.equal(serializeSessionTroopStatusProfileManifest(),
    serializeSessionTroopStatusProfileManifest());
  const profile = getSessionTroopStatusProfile("aegis-sage");
  assert.notStrictEqual(profile, getSessionTroopStatusProfile("aegis-sage"));
  assert.ok(deepFrozen(profile));
  assert.deepEqual(profile, getSessionTroopStatusProfile("aegis-sage"));
  assert.throws(() => { first.claims[0].id = "forged"; }, TypeError);
  assert.throws(() => { first.questionReceipts[0].records[0].rawRecord.value = "forged"; }, TypeError);
  assert.throws(() => { profile.sourceRecord.id = "forged"; }, TypeError);
  assert.equal(getSessionTroopStatusProfile("aegis-sage").id, "aegis-sage");
});

test("game roster troop status profiles: primitive hostile lookup and arity matrix is trap-zero", () => {
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
  const revoked = Proxy.revocable({}, { get() { traps += 1; } });
  revoked.revoke();
  const accessor = Object.defineProperty({}, "id", {
    get() {
      traps += 1;
      throw new Error("attacker callback");
    },
  });
  const values = [hostile, revoked.proxy, accessor, new String("aegis-sage"),
    Object.create(null), null, 1, Symbol("aegis-sage")];
  for (const value of values) {
    assert.throws(() => getSessionTroopStatusProfile(value), /primitive string/u);
  }
  assert.throws(() => getSessionTroopStatusProfile("aegis-sage", hostile), /exactly one argument/u);
  assert.throws(() => getSessionTroopStatusProfile("x".repeat(129)), /oversized/u);
  assert.throws(() => getSessionTroopStatusProfile("aegis-s\u0430ge"), /unknown|not admitted/u);
  const crossRealmString = vm.runInNewContext("'aegis-sage'");
  assert.equal(getSessionTroopStatusProfile(crossRealmString).id, "aegis-sage");
  assert.equal(traps, 0);
  assert.equal(getSessionTroopStatusProfile("railward").id, "railward");
});

test("game roster troop status profiles: factory and source static isolation guards", () => {
  const source = readFileSync(fileURLToPath(new URL(
    "../src/content/session-troop-status-profiles.js", import.meta.url,
  )), "utf8");
  assert.doesNotMatch(source, /reference(?:[\\/]|\b)/u);
  assert.doesNotMatch(source, /(?:Date|performance|Math\.random|randomUUID|getRandomValues)\s*[.(]/u);
  assert.doesNotMatch(source, /(?:^|[^\w])(?:import\s*\(|require\s*\()/u);
  assert.doesNotMatch(source, /setTimeout|setInterval|queueMicrotask/u);
  assert.doesNotMatch(source, /0\.\d/u);
  assert.deepEqual(Object.keys(SOURCE_FACTORIES).sort(), [
    "createHealCatalog", "createInvisibilitySpecialCatalog",
    "createReflectionSpecialCatalog", "createShieldFormCatalog",
    "createSlowSpecialCatalog", "createSnareSpecialCatalog", "createStunSpecialCatalog",
  ]);
});

test("game roster troop status profiles: owned runner accepts only its exact selector", () => {
  const runner = fileURLToPath(new URL("./game-roster-troops-status-profiles-runner.js", import.meta.url));
  const runnerSource = readFileSync(runner, "utf8");
  assert.match(runnerSource, /args\.length !== 1/u);
  assert.match(runnerSource, /game-roster-troops-status-profiles/u);
});
