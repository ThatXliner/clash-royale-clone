import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

import * as basicFlyingSource from "../src/content/cards/basic-flying.js";
import * as chargeKnockbackSource from "../src/content/cards/special-movement-charge-knockback.js";
import * as chargeSource from "../src/content/cards/special-movement-charge.js";
import * as dashSource from "../src/content/cards/special-movement-dash.js";
import * as jumpSource from "../src/content/cards/special-movement-jump.js";
import * as recoilSource from "../src/content/cards/special-movement-recoil.js";
import * as retargetSource from "../src/content/cards/special-movement-retarget.js";
import * as shieldFormSource from "../src/content/cards/shields-forms.js";
import { createSessionTroopProfileManifest } from "../src/content/session-troop-profile-catalog.js";
import {
  createSessionTroopMovementProfileManifest,
  getSessionTroopMovementProfile,
  serializeSessionTroopMovementProfileManifest,
} from "../src/content/session-troop-movement-profiles.js";

const EXPECTED_OCCURRENCES = [
  ["createRecoilSpecialCatalog", "cinderback", "admitted"],
  ["createBasicFlyingCatalog", "copperskiff", "admitted"],
  ["createChargeKnockbackCatalog", "emberlance", "admitted"],
  ["createChargeSpecialCatalog", "emberlance", "admitted"],
  ["createShieldFormCatalog", "railward", "admitted"],
  ["createBasicFlyingCatalog", "skymaul", "admitted"],
  ["createJumpSpecialCatalog", "stonevault", "admitted"],
  ["createDashSpecialCatalog", "veilrunner", "admitted"],
  ["createRetargetSpecialCatalog", "wayfinder", "admitted"],
];
const EXPECTED_IDS = [
  "cinderback",
  "copperskiff",
  "emberlance",
  "railward",
  "skymaul",
  "stonevault",
  "veilrunner",
  "wayfinder",
];
const EXPECTED_CLAIMS = [
  ["cinderback", "recoil", "createRecoilSpecialCatalog"],
  ["copperskiff", "flight", "createBasicFlyingCatalog"],
  ["emberlance", "charge-knockback-membership", "createChargeKnockbackCatalog"],
  ["emberlance", "charge", "createChargeSpecialCatalog"],
  ["railward", "shield-form", "createShieldFormCatalog"],
  ["skymaul", "flight", "createBasicFlyingCatalog"],
  ["stonevault", "jump", "createJumpSpecialCatalog"],
  ["veilrunner", "dash", "createDashSpecialCatalog"],
  ["wayfinder", "retarget", "createRetargetSpecialCatalog"],
];
const QUESTION_SOURCES = {
  createChargeSpecialCatalog: ["createChargeQuestionFixture", chargeSource.createChargeQuestionFixture],
  createChargeKnockbackCatalog: ["createChargeKnockbackQuestionRecords", chargeKnockbackSource.createChargeKnockbackQuestionRecords],
  createDashSpecialCatalog: ["createDashQuestionFixture", dashSource.createDashQuestionFixture],
  createJumpSpecialCatalog: ["createJumpQuestionFixture", jumpSource.createJumpQuestionFixture],
  createRecoilSpecialCatalog: ["createRecoilQuestionFixture", recoilSource.createRecoilQuestionFixture],
  createRetargetSpecialCatalog: ["createRetargetQuestionRecords", retargetSource.createRetargetQuestionRecords],
};
const SOURCE_MODULES = {
  createBasicFlyingCatalog: basicFlyingSource,
  createChargeKnockbackCatalog: chargeKnockbackSource,
  createChargeSpecialCatalog: chargeSource,
  createDashSpecialCatalog: dashSource,
  createJumpSpecialCatalog: jumpSource,
  createRecoilSpecialCatalog: recoilSource,
  createRetargetSpecialCatalog: retargetSource,
  createShieldFormCatalog: shieldFormSource,
};

const SOURCE_MODULE_PATHS = Object.freeze(Object.fromEntries(
  Object.entries({
    createBasicFlyingCatalog: "cards/basic-flying.js",
    createChargeKnockbackCatalog: "cards/special-movement-charge-knockback.js",
    createChargeSpecialCatalog: "cards/special-movement-charge.js",
    createDashSpecialCatalog: "cards/special-movement-dash.js",
    createJumpSpecialCatalog: "cards/special-movement-jump.js",
    createRecoilSpecialCatalog: "cards/special-movement-recoil.js",
    createRetargetSpecialCatalog: "cards/special-movement-retarget.js",
    createShieldFormCatalog: "cards/shields-forms.js",
  }).map(([exportName, relativePath]) => [
    exportName,
    fileURLToPath(new URL(`../src/content/${relativePath}`, import.meta.url)),
  ]),
));
const MOVEMENT_SOURCE_MODULE_PATH = fileURLToPath(new URL(
  "../src/content/session-troop-movement-profiles.js", import.meta.url
));
const MOVEMENT_SOURCE_WRAPPER_PROBE = String.raw`
import vm from "node:vm";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const config = JSON.parse(process.env.MOVEMENT_SOURCE_PROBE);
const moduleCache = new Map();
const context = vm.createContext({
  URL,
  URLSearchParams,
  TextDecoder,
  TextEncoder,
  console,
  process,
  structuredClone,
});

function transformedSource(source, filename) {
  if (filename !== config.targetPath) return source;
  if (!source.includes(config.marker)) {
    throw new Error("source wrapper marker is missing");
  }
  return (config.prefix ?? "") + source.replace(config.marker, config.replacement);
}

function loadModule(url) {
  if (moduleCache.has(url)) return moduleCache.get(url);
  const promise = (async () => {
    const filename = fileURLToPath(url);
    const module = new vm.SourceTextModule(
      transformedSource(readFileSync(filename, "utf8"), filename),
      {
        context,
        identifier: url,
        initializeImportMeta(meta) {
          meta.url = url;
        },
      },
    );
    await module.link((specifier, referencingModule) =>
      loadModule(new URL(specifier, referencingModule.identifier).href)
    );
    return module;
  })();
  moduleCache.set(url, promise);
  return promise;
}

let exitCode = 0;
try {
  const movementModule = await loadModule(pathToFileURL(config.movementPath).href);
  await movementModule.evaluate();
  const bytes = movementModule.namespace.serializeSessionTroopMovementProfileManifest();
  const payload = {
    accepted: true,
    length: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  console.log(JSON.stringify(payload));
  if (config.expect === "reject") exitCode = 2;
} catch (error) {
  if (config.expect === "reject") {
    console.log(JSON.stringify({
      accepted: false,
      error: error instanceof Error ? error.message : String(error),
    }));
  } else {
    console.error(error instanceof Error ? error.stack : String(error));
    exitCode = 1;
  }
}
process.exitCode = exitCode;
`;

function runSourceWrapperProbe(config) {
  const result = spawnSync(process.execPath, [
    "--experimental-vm-modules",
    "--input-type=module",
    "-e",
    MOVEMENT_SOURCE_WRAPPER_PROBE,
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      MOVEMENT_SOURCE_PROBE: JSON.stringify({
        movementPath: MOVEMENT_SOURCE_MODULE_PATH,
        ...config,
      }),
    },
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const output = result.stdout.trim().split(/\r?\n/u).at(-1);
  assert.ok(output, `source wrapper probe produced no JSON: ${result.stderr}`);
  return JSON.parse(output);
}

function sourceWrapperCase(exportName, id, mutation, options = {}) {
  const usesSingularDefinition = [
    "createChargeKnockbackCatalog",
    "createRetargetSpecialCatalog",
  ].includes(exportName);
  const catalogExpression = usesSingularDefinition
    ? "[DEFINITION]"
    : "DEFINITIONS";
  const replacement = [
    `const records = createCardCatalog(${catalogExpression});`,
    options.alternatingReads ? "__sourceReadCount += 1;" : "",
    `const record = records.find(({ id: candidateId }) => candidateId === ${JSON.stringify(id)});`,
    'if (record === undefined) throw new Error("source wrapper record is missing");',
    mutation,
    "return records;",
  ].filter(Boolean).join("\n");
  return {
    expect: options.expect ?? "reject",
    marker: `return createCardCatalog(${catalogExpression});`,
    prefix: options.alternatingReads ? "let __sourceReadCount = 0;\n" : "",
    replacement,
    targetPath: SOURCE_MODULE_PATHS[exportName],
  };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function deepFrozen(value) {
  if (value === null || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(deepFrozen);
}

function profileFor(manifest, id) {
  const profile = manifest.profiles.find((candidate) => candidate.id === id);
  assert.ok(profile, `missing profile ${id}`);
  return profile;
}

function claimFor(manifest, id, family) {
  const claim = profileFor(manifest, id).claims.find(({ claimFamily }) => claimFamily === family);
  assert.ok(claim, `missing ${family} claim for ${id}`);
  return claim;
}

function sourceRecord(exportName, id) {
  const records = SOURCE_MODULES[exportName][exportName]();
  const matches = records.filter((record) => record.id === id);
  assert.equal(matches.length, 1, `${exportName}/${id}`);
  return matches[0];
}

function questionRecords(factory) {
  const raw = factory();
  if (Object.hasOwn(raw, "provenance")) {
    return Object.keys(raw.provenance).sort().map((key) => ({
      authoritative: raw.authoritative,
      confidence: raw.provenance[key].confidence,
      disposition: raw.provenance[key].disposition,
      key,
      source: raw.provenance[key].source,
      value: raw[key],
    }));
  }
  return Object.keys(raw).sort().map((key) => raw[key]);
}

test("movement profile contract: exact HTP-derived 9 occurrence pairs and 8 IDs", () => {
  const manifest = createSessionTroopMovementProfileManifest();
  assert.deepEqual(
    manifest.occurrences.map(({ exportName, id, status }) => [exportName, id, status]),
    EXPECTED_OCCURRENCES,
  );
  assert.deepEqual(
    [...new Set(manifest.occurrences.map(({ id }) => id))],
    EXPECTED_IDS,
  );
  assert.deepEqual(manifest.counts, {
    duplicatedIds: 1,
    ids: 8,
    occurrences: 9,
    profiles: 8,
    questionBearingClaims: 6,
    unresolvedOnlyClaims: 1,
  });

  const htp = createSessionTroopProfileManifest();
  const htpCandidateRows = htp.occurrences.filter(({ exportName, id }) =>
    EXPECTED_OCCURRENCES.some(([candidateExport, candidateId]) =>
      candidateExport === exportName || candidateId === id
    )
  );
  assert.deepEqual(
    htpCandidateRows.map(({ exportName, id, status }) => [exportName, id, status]),
    EXPECTED_OCCURRENCES,
  );
});

test("movement profile contract: one profile per ID and one Emberlance profile with two memberships", () => {
  const manifest = createSessionTroopMovementProfileManifest();
  assert.equal(manifest.profiles.length, 8);
  assert.equal(new Set(manifest.profiles.map(({ id }) => id)).size, 8);
  assert.deepEqual(
    manifest.profiles.flatMap(({ id, claims }) =>
      claims.map(({ claimFamily, exportName }) => [id, claimFamily, exportName])
    ),
    EXPECTED_CLAIMS,
  );
  assert.deepEqual(profileFor(manifest, "emberlance").occurrenceExports, [
    "createChargeKnockbackCatalog",
    "createChargeSpecialCatalog",
  ]);
  assert.equal(profileFor(manifest, "emberlance").claims.length, 2);
  assert.deepEqual(
    manifest.profiles.filter(({ occurrenceExports }) => occurrenceExports.length > 1)
      .map(({ id }) => id),
    ["emberlance"],
  );
  assert.ok(manifest.profiles.every(({ claims }) => claims.every(({ runtimeIntegrationStatus }) =>
    runtimeIntegrationStatus === "pending-shared-host"
  )));
});

test("movement profile contract: every claim joins its actual source record and duplicate Emberlance bytes agree", () => {
  const manifest = createSessionTroopMovementProfileManifest();
  for (const profile of manifest.profiles) {
    assert.deepEqual(profile.occurrenceExports, [...profile.occurrenceExports].sort());
    assert.equal(profile.sourceRecords.length, profile.occurrenceExports.length);
    for (const claim of profile.claims) {
      const source = sourceRecord(claim.exportName, profile.id);
      assert.equal(claim.sourceRecordCanonical, canonical(source));
      const receipt = profile.sourceRecords.find(({ exportName }) => exportName === claim.exportName);
      assert.ok(receipt);
      assert.equal(receipt.recordCanonical, canonical(source));
      assert.deepEqual({
        cost: profile.cost,
        deployTimeTicks: profile.deployTimeTicks,
        displayName: profile.displayName,
        id: profile.id,
        kind: profile.kind,
        placementClass: profile.placementClass,
      }, {
        cost: source.cost,
        deployTimeTicks: source.deployTimeTicks,
        displayName: source.displayName,
        id: source.id,
        kind: source.kind,
        placementClass: "ground_entity",
      });
    }
  }
  const ember = profileFor(manifest, "emberlance");
  assert.equal(ember.sourceRecords.length, 2);
  assert.equal(ember.sourceRecords[0].recordCanonical, ember.sourceRecords[1].recordCanonical);
  const chargeSourceBytes = canonical(
    sourceRecord("createChargeSpecialCatalog", "emberlance")
  );
  const chargeKnockbackSourceBytes = canonical(
    sourceRecord("createChargeKnockbackCatalog", "emberlance")
  );
  assert.equal(
    chargeSourceBytes,
    chargeKnockbackSourceBytes,
  );
});

test("movement profile contract: all six question factories are represented exactly and remain non-authoritative", () => {
  const manifest = createSessionTroopMovementProfileManifest();
  const claims = manifest.profiles.flatMap(({ id, claims: profileClaims }) =>
    profileClaims.map((claim) => ({ id, claim }))
  );
  assert.deepEqual(
    claims.filter(({ claim }) => claim.questionPolicy !== null)
      .map(({ claim }) => claim.questionPolicy.factory).sort(),
    Object.values(QUESTION_SOURCES).map(([factoryName]) => factoryName).sort(),
  );
  let recordCount = 0;
  for (const [exportName, [factoryName, factory]] of Object.entries(QUESTION_SOURCES)) {
    const claim = claims.find(({ claim: candidate }) => candidate.exportName === exportName)?.claim;
    assert.ok(claim, exportName);
    const policy = claim.questionPolicy;
    assert.equal(policy.factory, factoryName);
    assert.equal(policy.rawCanonical, canonical(policy.raw));
    assert.deepEqual(policy.records, questionRecords(factory));
    assert.ok(deepFrozen(policy));
    assert.notEqual(factory(), factory());
    assert.equal(canonical(factory()), canonical(factory()));
    assert.throws(() => factory("override"), /override|argument|accept/u);
    for (const record of policy.records) {
      assert.equal(record.authoritative, false);
      assert.equal(record.confidence, "unverified");
      assert.equal(record.disposition, "question");
      assert.equal(typeof record.source, "string");
      recordCount += 1;
    }
  }
  assert.equal(recordCount, 86);
});

test("movement profile contract: Railward is unresolved-only with no fabricated form policy", () => {
  const claim = claimFor(createSessionTroopMovementProfileManifest(), "railward", "shield-form");
  assert.equal(claim.unresolvedOnly, true);
  assert.equal(claim.questionPolicy, null);
  assert.deepEqual(claim.unresolvedFields, [
    "shieldHitpoints",
    "transitionTiming",
    "transitionOrdering",
    "retargeting",
    "stationaryFormStats",
  ]);
  assert.match(claim.unresolvedReason, /no exported shield\/form QUESTION-record factory/u);
  for (const field of [
    "shieldHitpoints",
    "transitionTiming",
    "transitionOrdering",
    "retargeting",
    "stationaryFormStats",
  ]) {
    assert.equal(Object.hasOwn(claim, field), false);
  }
  assert.equal(Object.hasOwn(shieldFormSource, "createShieldFormQuestionRecords"), false);
  assert.equal(Object.hasOwn(shieldFormSource, "createShieldFormPolicy"), false);
});

test("movement profile contract: champion, ordinary-targeter, status, and projectile-only occurrences do not leak", () => {
  const manifest = createSessionTroopMovementProfileManifest();
  const occurrenceSources = manifest.occurrences.map(({ exportName, id }) => [exportName, id]);
  const occurrenceText = canonical(occurrenceSources);
  assert.doesNotMatch(occurrenceText, /createChampionAbilityCatalog|stonehauler/u);
  assert.doesNotMatch(occurrenceText, /Status|status|Projectile|projectile|Heal|Slow|Stun|Snare|Invisibility/u);
  assert.equal(manifest.profiles.some(({ id }) => id === "stonehauler"), false);
  assert.equal(manifest.profiles.some(({ claims }) => claims.some(({ claimFamily }) =>
    claimFamily === "champion-ability" || claimFamily === "projectile"
  )), false);
});

test("movement profile contract: Emberlance composition ordering and execution remain HTC QUESTIONS", () => {
  const profile = profileFor(createSessionTroopMovementProfileManifest(), "emberlance");
  assert.deepEqual(profile.composition, {
    mode: "one-shared-session-profile-membership-only",
    owner: "GAME-001HTC",
    questions: [
      {
        field: "compositionOrdering",
        owner: "GAME-001HTC",
        reason: "duplicated movement claims provide membership only; composition execution is unsourced",
        status: "question",
      },
      {
        field: "chargeKnockbackInteraction",
        owner: "GAME-001HTC",
        reason: "duplicated movement claims provide membership only; composition execution is unsourced",
        status: "question",
      },
      {
        field: "cancellation",
        owner: "GAME-001HTC",
        reason: "duplicated movement claims provide membership only; composition execution is unsourced",
        status: "question",
      },
      {
        field: "targetInvalidation",
        owner: "GAME-001HTC",
        reason: "duplicated movement claims provide membership only; composition execution is unsourced",
        status: "question",
      },
      {
        field: "phaseTiming",
        owner: "GAME-001HTC",
        reason: "duplicated movement claims provide membership only; composition execution is unsourced",
        status: "question",
      },
      {
        field: "sameBoundaryBehavior",
        owner: "GAME-001HTC",
        reason: "duplicated movement claims provide membership only; composition execution is unsourced",
        status: "question",
      },
    ],
  });
  for (const claim of profile.claims) {
    assert.equal(Object.hasOwn(claim, "execution"), false);
    assert.equal(Object.hasOwn(claim, "ordering"), false);
    assert.equal(Object.hasOwn(claim, "phaseTiming"), false);
  }
});

test("movement profile contract: outputs are detached, deeply frozen, and canonically repeatable", () => {
  const first = createSessionTroopMovementProfileManifest();
  const second = createSessionTroopMovementProfileManifest();
  assert.notEqual(first, second);
  assert.notEqual(first.profiles, second.profiles);
  assert.ok(deepFrozen(first));
  assert.ok(deepFrozen(second));
  assert.deepEqual(first, second);
  assert.equal(serializeSessionTroopMovementProfileManifest(), canonical(first));
  assert.equal(
    serializeSessionTroopMovementProfileManifest(),
    serializeSessionTroopMovementProfileManifest(),
  );
  assert.throws(() => createSessionTroopMovementProfileManifest("override"), /no arguments/u);
  assert.throws(() => serializeSessionTroopMovementProfileManifest("override"), /no arguments/u);

  const profile = getSessionTroopMovementProfile("emberlance");
  assert.notEqual(profile, first.profiles.find(({ id }) => id === "emberlance"));
  assert.ok(deepFrozen(profile));
  assert.throws(() => { first.profiles[0].id = "forged"; }, TypeError);
  assert.throws(() => { first.profiles.push(profile); }, TypeError);
  assert.throws(() => { profile.claims[0].claimFamily = "forged"; }, TypeError);
  assert.equal(getSessionTroopMovementProfile("emberlance").id, "emberlance");
  assert.equal(createSessionTroopMovementProfileManifest().profiles[0].id, "cinderback");
});

test("movement profile contract: primitive hostile lookup rejects without invoking traps", () => {
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
  const crossRealmObject = vm.runInNewContext("({ id: 'emberlance' })");
  const unicodeConfusable = "emberlаnce";

  for (const value of [
    hostile,
    revoked.proxy,
    accessor,
    crossRealmObject,
    new String("emberlance"),
    Object.create(null),
  ]) {
    assert.throws(() => getSessionTroopMovementProfile(value), /primitive string/u);
  }
  assert.throws(() => getSessionTroopMovementProfile(unicodeConfusable), /unknown|not admitted/u);
  assert.throws(() => getSessionTroopMovementProfile("emberlance", hostile), /exactly one argument/u);
  assert.equal(getSessionTroopMovementProfile(vm.runInNewContext("'emberlance'" )).id, "emberlance");
  assert.equal(traps, 0);
});

test("movement profile contract: module has no comparison-path, identity, clock, RNG, dynamic-loader, or float literal", () => {
  const pathname = fileURLToPath(new URL(
    "../src/content/session-troop-movement-profiles.js", import.meta.url
  ));
  const source = readFileSync(pathname, "utf8");
  assert.doesNotMatch(source, /reference(?:[\\/]|\b)/u);
  assert.doesNotMatch(source, /ShieldFormEncounter|ChargeSpecialEncounter|DashEncounter|JumpEncounter|RecoilEncounter|RetargetAttackEncounter/u);
  assert.doesNotMatch(source, /(?:Date|performance|Math\.random|randomUUID|getRandomValues)\s*[.(]/u);
  assert.doesNotMatch(source, /(?:setTimeout|setInterval|queueMicrotask)\s*\(/u);
  assert.doesNotMatch(source, /(?:^|[^\w])(?:import\s*\(|require\s*\()/u);
  assert.doesNotMatch(source, /\b\d+\.\d+\b/u);
});

test("movement profile contract: pinned witness map has the exact nine pair domain", () => {
  const source = readFileSync(MOVEMENT_SOURCE_MODULE_PATH, "utf8");
  const pinnedPairs = [...source.matchAll(
    /\[sourceRecordKey\("([^"]+)", "([^"]+)"\)\]: canonical\(\{/gu
  )].map(([, exportName, id]) => [exportName, id]);
  const expectedPairs = EXPECTED_OCCURRENCES
    .map(([exportName, id]) => [exportName, id])
    .sort(([leftExport, leftId], [rightExport, rightId]) =>
      leftId.localeCompare(rightId) || leftExport.localeCompare(rightExport)
    );
  assert.equal(pinnedPairs.length, 9);
  assert.deepEqual(
    pinnedPairs.sort(([leftExport, leftId], [rightExport, rightId]) =>
      leftId.localeCompare(rightId) || leftExport.localeCompare(rightExport)
    ),
    expectedPairs,
  );
  assert.match(source, /const EXPECTED_SOURCE_WITNESS_MAP = Object\.freeze\(\{/u);
  assert.match(source, /assertExpectedWitnessCoverage\(\);/u);
});

test("movement profile contract: complete source witnesses reject the adversarial drift matrix", () => {
  let pairRejects = 0;
  for (const [exportName, id] of EXPECTED_OCCURRENCES) {
    const result = runSourceWrapperProbe(sourceWrapperCase(
      exportName,
      id,
      "record.cost += 1;",
    ));
    assert.equal(result.accepted, false, `${exportName}/${id} scalar drift was accepted`);
    pairRejects += 1;
  }

  const fieldCases = [
    ["areaDamageRadiusMillitiles", "createJumpSpecialCatalog", "stonevault", "record.areaDamageRadiusMillitiles = 1301;"],
    ["components", "createBasicFlyingCatalog", "copperskiff", "record.components.push({ id: \"component-drift\" });"],
    ["cost", "createBasicFlyingCatalog", "copperskiff", "record.cost = 5;"],
    ["count", "createBasicFlyingCatalog", "copperskiff", "record.count = 2;"],
    ["damage", "createChargeSpecialCatalog", "emberlance", "record.damage = 393;"],
    ["deployTimeTicks", "createBasicFlyingCatalog", "copperskiff", "record.deployTimeTicks = 61;"],
    ["displayName", "createBasicFlyingCatalog", "copperskiff", "record.displayName = \"Copperskiff Drift\";"],
    ["firstHitTicks", "createBasicFlyingCatalog", "copperskiff", "record.firstHitTicks = 37;"],
    ["hitSpeedTicks", "createBasicFlyingCatalog", "copperskiff", "record.hitSpeedTicks = 67;"],
    ["hitpoints", "createBasicFlyingCatalog", "copperskiff", "record.hitpoints = 615;"],
    ["id", "createBasicFlyingCatalog", "copperskiff", "record.id = \"copperskiff-drift\";"],
    ["kind", "createBasicFlyingCatalog", "copperskiff", "record.kind = \"structure\";"],
    ["movementMillitilesPerSecond", "createDashSpecialCatalog", "veilrunner", "record.movementMillitilesPerSecond = 1501;"],
    ["rangeMillitiles", "createBasicFlyingCatalog", "copperskiff", "record.rangeMillitiles = 6001;"],
    ["rarity", "createBasicFlyingCatalog", "copperskiff", "record.rarity = \"mythic\";"],
    ["sightRangeMillitiles", "createBasicFlyingCatalog", "copperskiff", "record.sightRangeMillitiles = 6001;"],
    ["targetMode", "createBasicFlyingCatalog", "copperskiff", "record.targetMode = \"ground\";"],
  ];
  let fieldRejects = 0;
  for (const [field, exportName, id, mutation] of fieldCases) {
    const result = runSourceWrapperProbe(sourceWrapperCase(exportName, id, mutation));
    assert.equal(result.accepted, false, `${field} drift was accepted`);
    fieldRejects += 1;
  }

  const shapeCases = [
    ["extra field", "record.extraField = 1;"],
    ["missing field", "delete record.damage;"],
    ["accessor", "Object.defineProperty(record, \"damage\", { configurable: true, enumerable: true, get() { throw new Error(\"source accessor\"); } });"],
    ["non-enumerable", "Object.defineProperty(record, \"extraField\", { value: 1, enumerable: false });"],
    ["symbol", "record[Symbol(\"drift\")] = 1;"],
    ["proxy", "records[records.indexOf(record)] = new Proxy(record, {});"],
  ];
  let shapeRejects = 0;
  for (const [label, mutation] of shapeCases) {
    const result = runSourceWrapperProbe(sourceWrapperCase(
      "createBasicFlyingCatalog",
      "copperskiff",
      mutation,
    ));
    assert.equal(result.accepted, false, `${label} source shape was accepted`);
    shapeRejects += 1;
  }

  const nestedCases = [
    "record.components.push({ id: \"component-a\" }, { id: \"component-b\" }); record.components.reverse();",
    "record.components.push({ nested: { value: 1 } }); record.components[0].nested.value = 2;",
  ];
  let nestedRejects = 0;
  for (const mutation of nestedCases) {
    const result = runSourceWrapperProbe(sourceWrapperCase(
      "createBasicFlyingCatalog",
      "copperskiff",
      mutation,
    ));
    assert.equal(result.accepted, false, "nested component drift was accepted");
    nestedRejects += 1;
  }

  const alternatingRead = runSourceWrapperProbe(sourceWrapperCase(
    "createDashSpecialCatalog",
    "veilrunner",
    "if ((__sourceReadCount % 2) === 0) record.movementMillitilesPerSecond = 1501;",
    { alternatingReads: true },
  ));
  assert.equal(alternatingRead.accepted, false, "changed second source read was accepted");

  const propertyOrder = runSourceWrapperProbe(sourceWrapperCase(
    "createRetargetSpecialCatalog",
    "wayfinder",
    "records[records.indexOf(record)] = Object.fromEntries(Object.entries(record).reverse());",
    { expect: "accept" },
  ));
  const baselineBytes = serializeSessionTroopMovementProfileManifest();
  assert.deepEqual(propertyOrder, {
    accepted: true,
    length: baselineBytes.length,
    sha256: createHash("sha256").update(baselineBytes).digest("hex"),
  });

  assert.equal(pairRejects, 9);
  assert.equal(fieldRejects, 17);
  assert.equal(shapeRejects, 6);
  assert.equal(nestedRejects, 2);
});

test("movement profile contract: builder-owned runner accepts only its exact selector", () => {
  const runnerPath = fileURLToPath(new URL(
    "./game-roster-troops-movement-profiles-runner.js", import.meta.url
  ));
  const wrong = spawnSync(process.execPath, [runnerPath, "wrong-selector"], {
    encoding: "utf8",
  });
  assert.notEqual(wrong.status, 0);
  assert.match(`${wrong.stdout}${wrong.stderr}`, /exact selector/u);
});
