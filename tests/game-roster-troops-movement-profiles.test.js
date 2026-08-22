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
import * as movementQuestionGraph from "../src/content/movement-question-graph.js";
import {
  assertChargeKnockbackQuestionGraph,
  assertChargeQuestionGraph,
  assertDashQuestionGraph,
  assertJumpQuestionGraph,
  assertRecoilQuestionGraph,
  assertRetargetQuestionGraph,
  createChargeQuestionFixture as authorityChargeQuestionFixture,
} from "../src/content/session-troop-movement-question-authority.js";
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
const EXPECTED_QUESTION_FACTORY_WITNESSES = Object.freeze({
  createChargeQuestionFixture: { count: 3, length: 596, sha256: "238a16d34b7e68f960061ee05672e5ba7e8dd5bc3598273b9e712044f04aff20" },
  createChargeKnockbackQuestionRecords: { count: 24, length: 5667, sha256: "a912c97c45df327a3ee1e7ee832e7374c9de1316b696b62445b515d10cb5e92a" },
  createDashQuestionFixture: { count: 9, length: 1513, sha256: "546745faa531e17056dd3cc98e236553e75334375646449b1354af9c0eb6d516" },
  createJumpQuestionFixture: { count: 13, length: 2188, sha256: "0aa785da18d2755799b2a9cc40cdb33dca7943d05fa5f00af4f9bd6393749c0c" },
  createRecoilQuestionFixture: { count: 13, length: 2344, sha256: "fd6d4a82fcab233aa57e3d37b225e6fb39787ea47166786b80559fbc42834870" },
  createRetargetQuestionRecords: { count: 24, length: 5063, sha256: "3934152579f1c6879a8e79841f65617209c1041ea5507703fdca027b8b361852" },
});
const QUESTION_FACTORY_INFO = Object.freeze({
  createChargeQuestionFixture: {
    exportName: "createChargeSpecialCatalog",
    kind: "fixture",
    valueKey: "bonusDamage",
  },
  createChargeKnockbackQuestionRecords: {
    exportName: "createChargeKnockbackCatalog",
    kind: "records",
    valueKey: "chargeBonusDamage",
  },
  createDashQuestionFixture: {
    exportName: "createDashSpecialCatalog",
    kind: "fixture",
    valueKey: "bonusDamage",
  },
  createJumpQuestionFixture: {
    exportName: "createJumpSpecialCatalog",
    kind: "fixture",
    valueKey: "landingDamage",
  },
  createRecoilQuestionFixture: {
    exportName: "createRecoilSpecialCatalog",
    kind: "fixture",
    valueKey: "projectileDamage",
  },
  createRetargetQuestionRecords: {
    exportName: "createRetargetSpecialCatalog",
    kind: "records",
    valueKey: "attackerRadiusMillitiles",
  },
});
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
const QUESTION_GRAPH_BINDINGS = Object.freeze([
  [chargeSource.createChargeQuestionFixture, assertChargeQuestionGraph],
  [chargeKnockbackSource.createChargeKnockbackQuestionRecords, assertChargeKnockbackQuestionGraph],
  [dashSource.createDashQuestionFixture, assertDashQuestionGraph],
  [jumpSource.createJumpQuestionFixture, assertJumpQuestionGraph],
  [recoilSource.createRecoilQuestionFixture, assertRecoilQuestionGraph],
  [retargetSource.createRetargetQuestionRecords, assertRetargetQuestionGraph],
]);
const NULLABLE_SOURCE_NUMERIC_FIELDS = Object.freeze([
  "damage",
  "deployTimeTicks",
  "firstHitTicks",
  "hitSpeedTicks",
  "hitpoints",
  "movementMillitilesPerSecond",
  "rangeMillitiles",
  "sightRangeMillitiles",
  "areaDamageRadiusMillitiles",
]);
const INVALID_NUMERIC_MUTATIONS = Object.freeze([
  ["NaN", "Number.NaN"],
  ["Infinity", "Number.POSITIVE_INFINITY"],
  ["-Infinity", "Number.NEGATIVE_INFINITY"],
  ["fractional", "1.5"],
  ["unsafe integer", "Number.MAX_SAFE_INTEGER + 1"],
]);

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
const QUESTION_AUTHORITY_MODULE_PATH = fileURLToPath(new URL(
  "../src/content/session-troop-movement-question-authority.js", import.meta.url
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
  vm,
});

function transformedSource(source, filename) {
  if (filename !== config.targetPath) return source;
  let transformed = source;
  if (config.importMarker !== undefined) {
    if (!transformed.includes(config.importMarker)) {
      throw new Error("source import marker is missing");
    }
    transformed = transformed.replace(config.importMarker, config.importReplacement);
  }
  if (!transformed.includes(config.marker)) {
    throw new Error("source wrapper marker is missing");
  }
  return (config.prefix ?? "") + transformed.replace(config.marker, config.replacement);
}

let movementModule = null;

function probeResult(payload) {
  if (config.reportTraps) payload.traps = context.__sourceProbeTraps ?? 0;
  if (config.reportCanonicalTraps) payload.canonicalTraps = context.__canonicalTraps ?? 0;
  if (config.reportFactoryCallbacks) {
    payload.factoryCallbacks = context.__factoryCallbacks ?? 0;
  }
  if (config.reportFactoryTraps) {
    payload.factoryTraps = context.__factoryTraps ?? 0;
  }
  if (config.reportAuthorityGets) {
    payload.authorityGets = context.__authorityGets ?? 0;
  }
  if (config.probeExposure) {
    payload.exposed = false;
    if (movementModule !== null) {
      try {
        movementModule.namespace.serializeSessionTroopMovementProfileManifest();
        payload.exposed = true;
      } catch {
        // An errored module must not expose a partially initialized manifest.
      }
    }
  }
  return payload;
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
  movementModule = await loadModule(pathToFileURL(config.movementPath).href);
  await movementModule.evaluate();
  const bytes = movementModule.namespace.serializeSessionTroopMovementProfileManifest();
  const payload = {
    accepted: true,
    length: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  console.log(JSON.stringify(probeResult(payload)));
  if (config.expect === "reject") exitCode = 2;
} catch (error) {
  if (config.expect === "reject") {
    console.log(JSON.stringify(probeResult({
      accepted: false,
      error: error instanceof Error ? error.message : String(error),
    })));
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
  const callPrefix = options.skipCalls === undefined
    ? ""
    : [
      "__sourceProbeCallCount += 1;",
      "globalThis.__sourceProbeCallCount = __sourceProbeCallCount;",
    ].join("\n");
  const guardedMutation = options.skipCalls === undefined
    ? mutation
    : `if (__sourceProbeCallCount > ${options.skipCalls}) { ${mutation} }`;
  const replacement = [
    `const records = createCardCatalog(${catalogExpression});`,
    callPrefix,
    options.alternatingReads ? "__sourceReadCount += 1;" : "",
    `const record = records.find(({ id: candidateId }) => candidateId === ${JSON.stringify(id)});`,
    'if (record === undefined) throw new Error("source wrapper record is missing");',
    guardedMutation,
    options.rebuildWithTrustedConstructor
      ? "return createCardCatalog(records);"
      : "return records;",
  ].filter(Boolean).join("\n");
  return {
    expect: options.expect ?? "reject",
    marker: `return createCardCatalog(${catalogExpression});`,
    prefix: [
      options.alternatingReads ? "let __sourceReadCount = 0;" : "",
      options.skipCalls === undefined ? "" : "let __sourceProbeCallCount = 0;",
      options.prefix ?? "",
    ].filter(Boolean).join("\n") + (options.alternatingReads || options.skipCalls !== undefined || options.prefix ? "\n" : ""),
    reportTraps: options.reportTraps ?? false,
    reportCanonicalTraps: options.reportCanonicalTraps ?? false,
    probeExposure: options.probeExposure ?? false,
    replacement,
    targetPath: SOURCE_MODULE_PATHS[exportName],
  };
}

function canonicalWrapperCase(setup, options = {}) {
  const canonicalExpression = options.manifest
    ? "canonicalTrusted(MANIFEST.profiles[0])"
    : options.admit
    ? "canonical(admitCanonicalGraph(__canonicalValue))"
    : options.construct
    ? "canonical(constructCanonicalGraph(__canonicalValue))"
    : options.trusted ? "canonicalTrusted(__canonicalValue)" : "canonical(__canonicalValue)";
  return {
    expect: options.expect ?? "reject",
    marker: "return canonical(MANIFEST);",
    prefix: `let __canonicalTraps = 0; globalThis.__canonicalTraps = 0;\n${setup}\n`,
    replacement: `try { return ${canonicalExpression}; } finally { globalThis.__canonicalTraps = __canonicalTraps; if (__canonicalTraps !== 0) throw new Error(\"attacker callback\"); }`,
    reportCanonicalTraps: options.reportCanonicalTraps ?? false,
    targetPath: MOVEMENT_SOURCE_MODULE_PATH,
  };
}

function questionFactoryWrapperCase(factoryName, mutation, options = {}) {
  const info = QUESTION_FACTORY_INFO[factoryName];
  assert.ok(info, `missing QUESTION factory test info for ${factoryName}`);
  const firstReadOnly = options.firstReadOnly === true;
  const guardedMutation = firstReadOnly
    ? `__questionFactoryReadCount += 1; if (__questionFactoryReadCount === 1) { ${mutation} }`
    : mutation;
  if (info.kind === "fixture") {
    const marker = {
      createChargeQuestionFixture:
        'return recursivelyFreezeQuestionGraph(\n    copyQuestionGraph(CHARGE_QUESTION_VALUES, "charge question fixture", CHARGE_DOMAIN_TOKEN),\n    "charge question fixture",\n    CHARGE_DOMAIN_TOKEN,\n  );',
      createDashQuestionFixture:
        'return recursivelyFreezeQuestionGraph(\n    copyQuestionGraph(DASH_QUESTION_VALUES, "QUESTION fixture", DASH_DOMAIN_TOKEN),\n    "QUESTION fixture",\n    DASH_DOMAIN_TOKEN,\n  );',
      createJumpQuestionFixture:
        'return recursivelyFreezeQuestionGraph(\n    copyQuestionGraph(JUMP_QUESTION_VALUES, "QUESTION fixture", JUMP_DOMAIN_TOKEN),\n    "QUESTION fixture",\n    JUMP_DOMAIN_TOKEN,\n  );',
      createRecoilQuestionFixture:
        'return recursivelyFreezeQuestionGraph(\n    copyQuestionGraph(RECOIL_QUESTION_VALUES, "QUESTION fixture", RECOIL_DOMAIN_TOKEN),\n    "QUESTION fixture",\n    RECOIL_DOMAIN_TOKEN,\n  );',
    }[factoryName];
    const fixtureConstant = {
      createChargeQuestionFixture: ["CHARGE_QUESTION_VALUES", "charge question fixture"],
      createDashQuestionFixture: ["DASH_QUESTION_VALUES", "QUESTION fixture"],
      createJumpQuestionFixture: ["JUMP_QUESTION_VALUES", "QUESTION fixture"],
      createRecoilQuestionFixture: ["RECOIL_QUESTION_VALUES", "QUESTION fixture"],
    }[factoryName];
    assert.ok(marker, `missing authority fixture marker for ${factoryName}`);
    assert.ok(fixtureConstant, `missing authority fixture constant for ${factoryName}`);
    const [constant, label] = fixtureConstant;
    return {
      expect: options.expect ?? "reject",
      marker,
      prefix: [
        firstReadOnly ? "let __questionFactoryReadCount = 0;" : "",
        options.prefix ?? "",
      ].filter(Boolean).join("\n") + (firstReadOnly || options.prefix ? "\n" : ""),
      replacement: [
        `let __question = copyQuestionGraph(${constant}, ${JSON.stringify(label)}, ${factoryName.replace("create", "").replace("QuestionFixture", "").toUpperCase()}_DOMAIN_TOKEN);`,
        guardedMutation,
        `return recursivelyFreezeQuestionGraph(__question, ${JSON.stringify(label)}, ${factoryName.replace("create", "").replace("QuestionFixture", "").toUpperCase()}_DOMAIN_TOKEN);`,
      ].join("\n"),
      reportTraps: options.reportTraps ?? false,
      probeExposure: options.probeExposure ?? false,
      targetPath: QUESTION_AUTHORITY_MODULE_PATH,
    };
  }
  const marker = {
    createChargeKnockbackQuestionRecords:
      'return recursivelyFreezeQuestionGraph(\n    createQuestionRecordsDraft(\n      CHARGE_KNOCKBACK_QUESTION_VALUES,\n      "unsourced-charge-forced-knockback-retarget-composition",\n      "question records",\n      CHARGE_KNOCKBACK_DOMAIN_TOKEN,\n    ),\n    "question records",\n    CHARGE_KNOCKBACK_DOMAIN_TOKEN,\n  );',
    createRetargetQuestionRecords:
      'return recursivelyFreezeQuestionGraph(\n    createQuestionRecordsDraft(\n      RETARGET_QUESTION_VALUES,\n      "unsourced-retarget-attack-lifecycle-composition",\n      "retarget question records",\n      RETARGET_DOMAIN_TOKEN,\n    ),\n    "question records",\n    RETARGET_DOMAIN_TOKEN,\n  );',
  }[factoryName];
  const recordConstant = {
    createChargeKnockbackQuestionRecords: [
      "CHARGE_KNOCKBACK_QUESTION_VALUES",
      "unsourced-charge-forced-knockback-retarget-composition",
      "question records",
    ],
    createRetargetQuestionRecords: [
      "RETARGET_QUESTION_VALUES",
      "unsourced-retarget-attack-lifecycle-composition",
      "retarget question records",
    ],
  }[factoryName];
  assert.ok(marker, `missing authority records marker for ${factoryName}`);
  assert.ok(recordConstant, `missing authority records constant for ${factoryName}`);
  const [constant, source, label] = recordConstant;
  return {
    expect: options.expect ?? "reject",
    marker,
    prefix: [
      firstReadOnly ? "let __questionFactoryReadCount = 0;" : "",
      options.prefix ?? "",
    ].filter(Boolean).join("\n") + (firstReadOnly || options.prefix ? "\n" : ""),
    replacement: [
      `let value = createQuestionRecordsDraft(${constant}, ${JSON.stringify(source)}, ${JSON.stringify(label)}, ${factoryName === "createChargeKnockbackQuestionRecords" ? "CHARGE_KNOCKBACK" : "RETARGET"}_DOMAIN_TOKEN);`,
      guardedMutation,
      `return recursivelyFreezeQuestionGraph(value, ${JSON.stringify("question records")}, ${factoryName === "createChargeKnockbackQuestionRecords" ? "CHARGE_KNOCKBACK" : "RETARGET"}_DOMAIN_TOKEN);`,
    ].join("\n"),
    reportTraps: options.reportTraps ?? false,
    probeExposure: options.probeExposure ?? false,
    targetPath: QUESTION_AUTHORITY_MODULE_PATH,
  };
}

function questionFactoryExportWrapperCase(factoryName, replacement, options = {}) {
  const info = QUESTION_FACTORY_INFO[factoryName];
  assert.ok(info, `missing QUESTION factory test info for ${factoryName}`);
  const unwrappedName = `${factoryName}Unwrapped`;
  const fakeAuthority = options.fakeAuthority
    ? `\nexport const MOVEMENT_QUESTION_FACTORY_AUTHORITY = Object.defineProperty({}, ${JSON.stringify(factoryName)}, { enumerable: true, get() { globalThis.__authorityGets += 1; return ${factoryName}; } });`
    : "";
  return {
    expect: options.expect ?? "reject",
    marker: `const ${factoryName} = ${unwrappedName};`,
    prefix: [
      options.fakeAuthority ? "globalThis.__authorityGets = 0;" : "",
      options.prefix ?? "",
    ].filter(Boolean).join("\n") + (options.fakeAuthority || options.prefix ? "\n" : ""),
    replacement: `const ${factoryName} = ${replacement};${fakeAuthority}`,
    importMarker: options.importMarker,
    importReplacement: options.importReplacement,
    reportFactoryCallbacks: options.reportFactoryCallbacks ?? false,
    reportFactoryTraps: options.reportFactoryTraps ?? false,
    reportAuthorityGets: options.reportAuthorityGets ?? false,
    probeExposure: options.probeExposure ?? false,
    targetPath: options.targetPath ?? SOURCE_MODULE_PATHS[info.exportName],
  };
}

function questionMutation(factoryName, kind) {
  const info = QUESTION_FACTORY_INFO[factoryName];
  const key = JSON.stringify(info.valueKey);
  const target = info.kind === "fixture" ? "__question" : "value";
  if (kind === "add") {
    return info.kind === "fixture"
      ? `__question.addedQuestion = structuredClone(__question[${key}]); __question.provenance.addedQuestion = structuredClone(__question.provenance[${key}]);`
      : `value.addedQuestion = { ...value[${key}], key: "addedQuestion", value: structuredClone(value[${key}].value) };`;
  }
  if (kind === "remove") {
    return info.kind === "fixture"
      ? `delete __question[${key}]; delete __question.provenance[${key}];`
      : `delete value[${key}];`;
  }
  if (kind === "duplicate") {
    return info.kind === "fixture"
      ? `__question.duplicateQuestion = structuredClone(__question[${key}]); __question.provenance.duplicateQuestion = structuredClone(__question.provenance[${key}]);`
      : `value.duplicateQuestion = { ...value[${key}], key: "duplicateQuestion", value: structuredClone(value[${key}].value) };`;
  }
  if (kind === "reorder") {
    return `const __entries = Object.entries(${target}).reverse(); for (const __key of Object.keys(${target})) delete ${target}[__key]; for (const [__key, __entry] of __entries) ${target}[__key] = __entry;`;
  }
  if (kind === "value") {
    return info.kind === "fixture"
      ? `__question[${key}] += 1;`
      : `value[${key}] = { ...value[${key}], value: value[${key}].value + 1 };`;
  }
  if (kind === "key") {
    return info.kind === "fixture"
      ? `__question.renamedQuestion = __question[${key}]; __question.provenance.renamedQuestion = __question.provenance[${key}]; delete __question[${key}]; delete __question.provenance[${key}];`
      : `value.renamedQuestion = { ...value[${key}], key: "renamedQuestion", value: structuredClone(value[${key}].value) }; delete value[${key}];`;
  }
  if (["authoritative", "confidence", "disposition", "source"].includes(kind)) {
    const changed = {
      authoritative: "true",
      confidence: "verified",
      disposition: "admitted",
      source: "\"updated-question-source\"",
    }[kind];
    return info.kind === "fixture"
      ? `__question[${kind}] = ${changed};`
      : `value[${key}] = { ...value[${key}], ${kind}: ${changed} };`;
  }
  if (kind === "extra") {
    return info.kind === "fixture"
      ? "__question.extraField = 1;"
      : `value[${key}] = { ...value[${key}], extraField: 1 };`;
  }
  if (kind === "missing") {
    return info.kind === "fixture"
      ? "delete __question.source;"
      : `const { source: __source, ...__record } = value[${key}]; value[${key}] = __record;`;
  }
  if (kind === "nested") {
    if (factoryName === "createRetargetQuestionRecords") {
      return `value["attackerPosition"] = { ...value["attackerPosition"], value: { ...value["attackerPosition"].value, x: 1 } };`;
    }
    return `value["eventOrdering"] = { ...value["eventOrdering"], value: [...value["eventOrdering"].value].reverse() };`;
  }
  if (kind === "accessor") {
    return info.kind === "fixture"
      ? `Object.defineProperty(__question, ${key}, { configurable: true, enumerable: true, get() { return 1; } });`
      : `Object.defineProperty(value, ${key}, { configurable: true, enumerable: true, get() { return value[${key}]; } });`;
  }
  if (kind === "symbol") {
    return `${target}[Symbol("question-drift")] = 1;`;
  }
  if (kind === "proxy") {
    return info.kind === "fixture"
      ? `__question.provenance = new Proxy(__question.provenance, {});`
      : `value[${key}] = new Proxy(value[${key}], {});`;
  }
  if (kind === "noncloneable") {
    return info.kind === "fixture"
      ? `__question[${key}] = () => 1;`
      : `value[${key}] = { ...value[${key}], value: () => 1 };`;
  }
  throw new Error(`unknown QUESTION mutation ${kind}`);
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

function graphNodes(root) {
  const nodes = [];
  const seen = new Set();
  function visit(value) {
    if (value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    nodes.push(value);
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      visit(Object.getOwnPropertyDescriptor(value, key).value);
    }
  }
  visit(root);
  return nodes;
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

test("movement profile contract: complete QUESTION factory witnesses pin six domains and raw bytes", () => {
  const source = readFileSync(MOVEMENT_SOURCE_MODULE_PATH, "utf8");
  const pinnedFactories = [...source.matchAll(
    /^\s{2}(create(?:ChargeQuestionFixture|ChargeKnockbackQuestionRecords|DashQuestionFixture|JumpQuestionFixture|RecoilQuestionFixture|RetargetQuestionRecords)):/gmu
  )].map(([, factoryName]) => factoryName);
  assert.deepEqual(
    [...new Set(pinnedFactories)].sort(),
    Object.keys(EXPECTED_QUESTION_FACTORY_WITNESSES).sort(),
  );
  assert.equal(pinnedFactories.length, 6);
  assert.match(source, /const EXPECTED_QUESTION_WITNESS = Object\.freeze\(\{/u);
  assert.match(source, /assertExpectedQuestionWitnessCoverage\(\);/u);

  for (const [exportName, [factoryName, factory]] of Object.entries(QUESTION_SOURCES)) {
    const raw = factory();
    const bytes = canonical(raw);
    const expected = EXPECTED_QUESTION_FACTORY_WITNESSES[factoryName];
    const count = Object.hasOwn(raw, "provenance")
      ? Object.keys(raw.provenance).length
      : Object.keys(raw).length;
    assert.deepEqual({
      count,
      length: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }, expected, factoryName);
    const claim = claimFor(
      createSessionTroopMovementProfileManifest(),
      exportName === "createChargeKnockbackCatalog" || exportName === "createChargeSpecialCatalog"
        ? "emberlance"
        : exportName === "createDashSpecialCatalog"
          ? "veilrunner"
          : exportName === "createJumpSpecialCatalog"
            ? "stonevault"
            : exportName === "createRecoilSpecialCatalog"
              ? "cinderback"
              : "wayfinder",
      exportName === "createChargeKnockbackCatalog"
        ? "charge-knockback-membership"
        : exportName === "createChargeSpecialCatalog"
          ? "charge"
          : exportName === "createDashSpecialCatalog"
            ? "dash"
            : exportName === "createJumpSpecialCatalog"
              ? "jump"
              : exportName === "createRecoilSpecialCatalog"
                ? "recoil"
                : "retarget",
    );
    assert.equal(claim.questionPolicy.rawCanonical, bytes);
  }
  const manifestBytes = serializeSessionTroopMovementProfileManifest();
  assert.equal(manifestBytes.length, 67284);
  assert.equal(
    createHash("sha256").update(manifestBytes).digest("hex"),
    "d4ad6e7684047fbd4194fd83a017700b56ecf4198aa7a39bd5bc01bc67388082",
  );
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
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const repeated = createSessionTroopMovementProfileManifest();
    assert.ok(deepFrozen(repeated));
    assert.equal(serializeSessionTroopMovementProfileManifest(), canonical(repeated));
    assert.equal(getSessionTroopMovementProfile("emberlance").id, "emberlance");
  }
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
    /\[sourceRecordKey\("([^"]+)", "([^"]+)"\)\]: canonical(?:Trusted|Fresh)\(\{/gu
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

  const trapPrefix = [
    "let __sourceProbeTraps = 0;",
    "globalThis.__sourceProbeTraps = 0;",
    "const __bumpSourceProbeTrap = () => { __sourceProbeTraps += 1; globalThis.__sourceProbeTraps = __sourceProbeTraps; };",
  ].join("\n");
  const proxyHandler = `({
    getPrototypeOf() { __bumpSourceProbeTrap(); throw new Error("proxy getPrototypeOf"); },
    setPrototypeOf() { __bumpSourceProbeTrap(); throw new Error("proxy setPrototypeOf"); },
    isExtensible() { __bumpSourceProbeTrap(); throw new Error("proxy isExtensible"); },
    preventExtensions() { __bumpSourceProbeTrap(); throw new Error("proxy preventExtensions"); },
    getOwnPropertyDescriptor() { __bumpSourceProbeTrap(); throw new Error("proxy getOwnPropertyDescriptor"); },
    defineProperty() { __bumpSourceProbeTrap(); throw new Error("proxy defineProperty"); },
    has() { __bumpSourceProbeTrap(); throw new Error("proxy has"); },
    get() { __bumpSourceProbeTrap(); throw new Error("proxy get"); },
    set() { __bumpSourceProbeTrap(); throw new Error("proxy set"); },
    deleteProperty() { __bumpSourceProbeTrap(); throw new Error("proxy deleteProperty"); },
    ownKeys() { __bumpSourceProbeTrap(); throw new Error("proxy ownKeys"); },
  })`;
  const hostileShapeCases = [
    [
      "source row Proxy",
      `records[records.indexOf(record)] = new Proxy(record, ${proxyHandler});`,
    ],
    [
      "source component Proxy",
      `record.components.push(new Proxy({}, ${proxyHandler}));`,
    ],
    [
      "source row accessor",
      "Object.defineProperty(record, \"damage\", { configurable: true, enumerable: true, get() { __bumpSourceProbeTrap(); throw new Error(\"row accessor\"); } });",
    ],
    [
      "source component accessor",
      "record.components.push({}); Object.defineProperty(record.components[0], \"damage\", { configurable: true, enumerable: true, get() { __bumpSourceProbeTrap(); throw new Error(\"component accessor\"); } });",
    ],
  ];
  let hostileShapeCallbacks = 0;
  for (const [label, mutation] of hostileShapeCases) {
    const result = runSourceWrapperProbe(sourceWrapperCase(
      "createBasicFlyingCatalog",
      "copperskiff",
      mutation,
      {
        expect: "reject",
        prefix: trapPrefix,
        reportTraps: true,
        probeExposure: true,
        skipCalls: 3,
      },
    ));
    assert.equal(result.accepted, false, `${label} was accepted`);
    assert.equal(result.traps, 0, `${label} invoked hostile callbacks`);
    assert.equal(result.exposed, false, `${label} exposed a partial manifest`);
    hostileShapeCallbacks += result.traps;
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
    { expect: "accept", rebuildWithTrustedConstructor: true },
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
  assert.equal(hostileShapeCases.length, 4);
  assert.equal(hostileShapeCallbacks, 0);
});

test("movement profile contract: source catalog rows and component arrays reject every Proxy alias before reflection", () => {
  const trapPrefix = [
    "let __sourceProbeTraps = 0;",
    "globalThis.__sourceProbeTraps = 0;",
    "const __bumpSourceProbeTrap = () => { __sourceProbeTraps += 1; globalThis.__sourceProbeTraps = __sourceProbeTraps; };",
  ].join("\n");
  const handler = `({
    getPrototypeOf() { __bumpSourceProbeTrap(); throw new Error("getPrototypeOf callback"); },
    ownKeys() { __bumpSourceProbeTrap(); throw new Error("ownKeys callback"); },
    getOwnPropertyDescriptor() { __bumpSourceProbeTrap(); throw new Error("getOwnPropertyDescriptor callback"); },
    get() { __bumpSourceProbeTrap(); throw new Error("get callback"); },
    has() { __bumpSourceProbeTrap(); throw new Error("has callback"); },
    isExtensible() { __bumpSourceProbeTrap(); throw new Error("isExtensible callback"); },
    preventExtensions() { __bumpSourceProbeTrap(); throw new Error("preventExtensions callback"); },
    defineProperty() { __bumpSourceProbeTrap(); throw new Error("defineProperty callback"); },
    setPrototypeOf() { __bumpSourceProbeTrap(); throw new Error("setPrototypeOf callback"); },
    deleteProperty() { __bumpSourceProbeTrap(); throw new Error("deleteProperty callback"); },
    set() { __bumpSourceProbeTrap(); throw new Error("set callback"); },
  })`;
  const aliasFactories = [
    ["direct Proxy", `new Proxy(__target, __handler)`],
    ["globalThis.Proxy alias", `const __P = globalThis.Proxy; new __P(__target, __handler)`],
    ["Reflect.construct", `const __P = globalThis.Proxy; Reflect.construct(__P, [__target, __handler])`],
    ["computed Proxy alias", `const __P = globalThis["Proxy"]; new __P(__target, __handler)`],
    ["multi-hop Proxy alias", `const __P0 = globalThis.Proxy; const __P1 = __P0; const __P2 = __P1; new __P2(__target, __handler)`],
    ["Proxy.revocable", `const __P = globalThis.Proxy; __P.revocable(__target, __handler).proxy`],
    ["Function-built Proxy alias", `const __P = Function("return globalThis.Proxy")(); new __P(__target, __handler)`],
    ["eval-built Proxy alias", `const __P = Function("return (0, eval)(\\"globalThis.Proxy\\")")(); new __P(__target, __handler)`],
  ];
  let cases = 0;
  let callbackTotal = 0;
  const publicRebrand = runSourceWrapperProbe(sourceWrapperCase(
    "createBasicFlyingCatalog",
    "copperskiff",
    "record.cost += 1;",
    { expect: "reject", rebuildWithTrustedConstructor: true },
  ));
  assert.equal(publicRebrand.accepted, false, "public constructor branding bypassed the source witness");
  for (const [label, factory] of aliasFactories) {
    for (const placement of ["row", "component"]) {
      const mutation = [
        `const __target = ${placement === "row" ? "record" : "{}"};`,
        `const __handler = ${handler};`,
        `const __hostile = ${factory};`,
        placement === "row"
          ? "records[records.indexOf(record)] = __hostile;"
          : "record.components.push(__hostile);",
      ].join("\n");
      const result = runSourceWrapperProbe(sourceWrapperCase(
        "createBasicFlyingCatalog",
        "copperskiff",
        mutation,
        {
          expect: "reject",
          prefix: trapPrefix,
          reportTraps: true,
          probeExposure: true,
          skipCalls: 3,
        },
      ));
      assert.equal(result.accepted, false, `${label} ${placement} was accepted`);
      assert.equal(result.traps, 0, `${label} ${placement} invoked a trap`);
      assert.equal(result.exposed, false, `${label} ${placement} exposed a partial manifest`);
      callbackTotal += result.traps;
      cases += 1;
    }
  }
  assert.equal(cases, 16);
  assert.equal(callbackTotal, 0);
});

test("movement profile contract: every pinned null numeric path rejects non-finite and non-integer drift", () => {
  const nullPaths = [];
  for (const [exportName, id] of EXPECTED_OCCURRENCES) {
    const source = sourceRecord(exportName, id);
    for (const field of NULLABLE_SOURCE_NUMERIC_FIELDS) {
      if (source[field] === null) {
        nullPaths.push({
          exportName,
          id,
          field,
          target: `record[${JSON.stringify(field)}]`,
        });
      }
    }
    for (let index = 0; index < source.components.length; index += 1) {
      const component = source.components[index];
      for (const field of NULLABLE_SOURCE_NUMERIC_FIELDS) {
        if (component[field] === null) {
          nullPaths.push({
            exportName,
            id,
            field,
            target: `record.components[${index}][${JSON.stringify(field)}]`,
          });
        }
      }
    }
  }

  let probes = 0;
  let nonFiniteProbes = 0;
  let cinderbackDamageProbes = 0;
  for (const path of nullPaths) {
    for (const [mutationLabel, mutationValue] of INVALID_NUMERIC_MUTATIONS) {
      const result = runSourceWrapperProbe(sourceWrapperCase(
        path.exportName,
        path.id,
        `${path.target} = ${mutationValue};`,
      ));
      assert.equal(
        result.accepted,
        false,
        `${path.exportName}/${path.id}.${path.field} accepted ${mutationLabel}`,
      );
      probes += 1;
      if (["NaN", "Infinity", "-Infinity"].includes(mutationLabel)) nonFiniteProbes += 1;
      if (path.id === "cinderback" && path.field === "damage") {
        cinderbackDamageProbes += 1;
      }
    }
  }

  assert.equal(nullPaths.length, 9);
  assert.equal(cinderbackDamageProbes, 5);
  assert.equal(nonFiniteProbes, 27);
  assert.equal(probes, 45);

  const baselineBytes = serializeSessionTroopMovementProfileManifest();
  const cinderbackPropertyOrder = runSourceWrapperProbe(sourceWrapperCase(
    "createRecoilSpecialCatalog",
    "cinderback",
    "records[records.indexOf(record)] = Object.fromEntries(Object.entries(record).reverse());",
    { expect: "accept", rebuildWithTrustedConstructor: true },
  ));
  assert.deepEqual(cinderbackPropertyOrder, {
    accepted: true,
    length: baselineBytes.length,
    sha256: createHash("sha256").update(baselineBytes).digest("hex"),
  });
});

test("movement profile contract: QUESTION factories reject aliased Proxy roots and nested values before reflection", () => {
  const trapPrefix = [
    "let __sourceProbeTraps = 0;",
    "globalThis.__sourceProbeTraps = 0;",
    "const __bumpSourceProbeTrap = () => { __sourceProbeTraps += 1; globalThis.__sourceProbeTraps = __sourceProbeTraps; };",
  ].join("\n");
  const handler = `({
    getPrototypeOf() { __bumpSourceProbeTrap(); throw new Error("getPrototypeOf callback"); },
    ownKeys() { __bumpSourceProbeTrap(); throw new Error("ownKeys callback"); },
    getOwnPropertyDescriptor() { __bumpSourceProbeTrap(); throw new Error("getOwnPropertyDescriptor callback"); },
    get() { __bumpSourceProbeTrap(); throw new Error("get callback"); },
    has() { __bumpSourceProbeTrap(); throw new Error("has callback"); },
    isExtensible() { __bumpSourceProbeTrap(); throw new Error("isExtensible callback"); },
    preventExtensions() { __bumpSourceProbeTrap(); throw new Error("preventExtensions callback"); },
    defineProperty() { __bumpSourceProbeTrap(); throw new Error("defineProperty callback"); },
    setPrototypeOf() { __bumpSourceProbeTrap(); throw new Error("setPrototypeOf callback"); },
    deleteProperty() { __bumpSourceProbeTrap(); throw new Error("deleteProperty callback"); },
    set() { __bumpSourceProbeTrap(); throw new Error("set callback"); },
  })`;
  const aliasFactories = [
    ["direct Proxy", `new Proxy(__target, __handler)`],
    ["globalThis.Proxy alias", `const __P = globalThis.Proxy; new __P(__target, __handler)`],
    ["Reflect.construct", `const __P = globalThis.Proxy; Reflect.construct(__P, [__target, __handler])`],
    ["computed Proxy alias", `const __P = globalThis["Proxy"]; new __P(__target, __handler)`],
    ["multi-hop Proxy alias", `const __P0 = globalThis.Proxy; const __P1 = __P0; const __P2 = __P1; new __P2(__target, __handler)`],
    ["Proxy.revocable", `const __P = globalThis.Proxy; __P.revocable(__target, __handler).proxy`],
    ["Function-built Proxy alias", `const __P = Function("return globalThis.Proxy")(); new __P(__target, __handler)`],
    ["eval-built Proxy alias", `const __P = Function("return (0, eval)(\\"globalThis.Proxy\\")")(); new __P(__target, __handler)`],
  ];
  const placements = [
    ["fixture root", "createChargeQuestionFixture", `__question`, `__question = __hostile;`],
    ["fixture provenance", "createChargeQuestionFixture", `__question.provenance`, `__question.provenance = __hostile;`],
    ["records root", "createRetargetQuestionRecords", `value`, `return __hostile;`],
    ["records QUESTION value", "createRetargetQuestionRecords", `value["attackerPosition"].value`, `value["attackerPosition"].value = __hostile;`],
  ];
  let cases = 0;
  let callbackTotal = 0;
  for (const [placementLabel, factoryName, targetExpression, assignment] of placements) {
    for (const [aliasLabel, factory] of aliasFactories) {
      const mutation = [
        `const __target = ${targetExpression};`,
        `const __handler = ${handler};`,
        `const __hostile = ${factory};`,
        assignment,
      ].join("\n");
      const result = runSourceWrapperProbe(questionFactoryWrapperCase(
        factoryName,
        mutation,
        {
          expect: "reject",
          prefix: trapPrefix,
          reportTraps: true,
          probeExposure: true,
        },
      ));
      assert.equal(result.accepted, false, `${aliasLabel} ${placementLabel} was accepted`);
      assert.equal(result.traps, 0, `${aliasLabel} ${placementLabel} invoked a trap`);
      assert.equal(result.exposed, false, `${aliasLabel} ${placementLabel} exposed a partial manifest`);
      callbackTotal += result.traps;
      cases += 1;
    }
  }
  assert.equal(cases, 32);
  assert.equal(callbackTotal, 0);

  assert.deepEqual(Object.keys(movementQuestionGraph), []);
  assert.equal(Object.hasOwn(movementQuestionGraph, "constructMovementQuestionGraph"), false);
  assert.equal(Object.hasOwn(movementQuestionGraph, "cloneMovementQuestionGraph"), false);

  const hostileTraps = {
    getPrototypeOf() { directTrapCount += 1; },
    ownKeys() { directTrapCount += 1; },
    getOwnPropertyDescriptor() { directTrapCount += 1; },
    get() { directTrapCount += 1; },
    has() { directTrapCount += 1; },
    isExtensible() { directTrapCount += 1; },
  };
  let directTrapCount = 0;
  let admittedNodeCount = 0;
  let sameDomainAccepts = 0;
  let crossDomainRejects = 0;
  const factoryGraphs = [];
  for (const [factory] of QUESTION_GRAPH_BINDINGS) {
    const first = factory();
    const second = factory();
    assert.notEqual(first, second);
    assert.equal(canonical(first), canonical(second));
    assert.ok(deepFrozen(first));
    factoryGraphs.push(first);

    const nodes = graphNodes(first);
    admittedNodeCount += nodes.length;
    for (const node of nodes) {
      const transparent = new Proxy(node, hostileTraps);
      assert.throws(() => QUESTION_GRAPH_BINDINGS[factoryGraphs.length - 1][1](transparent), /source-admitted/u);
      const revocable = Proxy.revocable(node, hostileTraps);
      revocable.revoke();
      assert.throws(() => QUESTION_GRAPH_BINDINGS[factoryGraphs.length - 1][1](revocable.proxy), /source-admitted/u);

      const descriptorCopy = Object.create(
        Object.getPrototypeOf(node),
        Object.getOwnPropertyDescriptors(node),
      );
      assert.throws(() => QUESTION_GRAPH_BINDINGS[factoryGraphs.length - 1][1](descriptorCopy), /source-admitted/u);
      const prototypeCopy = Object.create(Object.getPrototypeOf(node));
      assert.throws(() => QUESTION_GRAPH_BINDINGS[factoryGraphs.length - 1][1](prototypeCopy), /source-admitted/u);
    }

    const forged = structuredClone(first);
    if (Object.hasOwn(forged, "bonusDamage")) {
      forged.bonusDamage = 999999;
    } else {
      forged.forgedQuestion = 999999;
    }
    assert.throws(
      () => QUESTION_GRAPH_BINDINGS[factoryGraphs.length - 1][1](forged),
      /source-admitted/u,
    );

    const hostileArgument = new Proxy({}, hostileTraps);
    assert.throws(() => factory(hostileArgument), /override|argument/u);
  }

  for (let factoryIndex = 0; factoryIndex < factoryGraphs.length; factoryIndex += 1) {
    for (let assertorIndex = 0; assertorIndex < QUESTION_GRAPH_BINDINGS.length; assertorIndex += 1) {
      const assertor = QUESTION_GRAPH_BINDINGS[assertorIndex][1];
      if (factoryIndex === assertorIndex) {
        assertor(factoryGraphs[factoryIndex]);
        sameDomainAccepts += 1;
        continue;
      }
      assert.throws(
        () => assertor(factoryGraphs[factoryIndex]),
        /source-admitted/u,
      );
      const proxied = new Proxy(factoryGraphs[factoryIndex], hostileTraps);
      assert.throws(() => assertor(proxied), /source-admitted/u);
      crossDomainRejects += 1;
    }
  }

  assert.equal(admittedNodeCount, 99);
  assert.equal(directTrapCount, 0);
  assert.deepEqual({ crossDomainRejects, sameDomainAccepts }, {
    crossDomainRejects: 30,
    sameDomainAccepts: 6,
  });

  const nestedSplices = [
    [
      "createChargeQuestionFixture",
      "DASH_QUESTION_VALUES",
      "DASH_DOMAIN_TOKEN",
      "__question.provenance = __crossDomainChild;",
    ],
    [
      "createChargeKnockbackQuestionRecords",
      "RETARGET_QUESTION_VALUES",
      "RETARGET_DOMAIN_TOKEN",
      'value["eventOrdering"].value = __crossDomainChild;',
    ],
    [
      "createDashQuestionFixture",
      "JUMP_QUESTION_VALUES",
      "JUMP_DOMAIN_TOKEN",
      "__question.provenance = __crossDomainChild;",
    ],
    [
      "createJumpQuestionFixture",
      "RECOIL_QUESTION_VALUES",
      "RECOIL_DOMAIN_TOKEN",
      "__question.provenance = __crossDomainChild;",
    ],
    [
      "createRecoilQuestionFixture",
      "CHARGE_QUESTION_VALUES",
      "CHARGE_DOMAIN_TOKEN",
      "__question.provenance = __crossDomainChild;",
    ],
    [
      "createRetargetQuestionRecords",
      "CHARGE_KNOCKBACK_QUESTION_VALUES",
      "CHARGE_KNOCKBACK_DOMAIN_TOKEN",
      'value["attackerPosition"].value = __crossDomainChild;',
    ],
  ];
  let nestedSpliceRejects = 0;
  let nestedSpliceTraps = 0;
  for (const [factoryName, childValues, childDomain, mutation] of nestedSplices) {
    const result = runSourceWrapperProbe(questionFactoryWrapperCase(
      factoryName,
      `const __crossDomainChild = copyQuestionGraph(${childValues}, "cross-domain child", ${childDomain}); ${mutation}`,
      {
        prefix: "globalThis.__sourceProbeTraps = 0;",
        reportTraps: true,
      },
    ));
    assert.equal(result.accepted, false, `${factoryName} accepted a nested cross-domain splice`);
    assert.equal(result.traps, 0, `${factoryName} nested splice invoked a trap`);
    nestedSpliceRejects += 1;
    nestedSpliceTraps += result.traps;
  }
  assert.deepEqual({ nestedSpliceRejects, nestedSpliceTraps }, {
    nestedSpliceRejects: 6,
    nestedSpliceTraps: 0,
  });

  const alteredCharge = structuredClone(authorityChargeQuestionFixture());
  alteredCharge.bonusDamage = 999999;
  assert.throws(
    () => assertChargeQuestionGraph(alteredCharge),
    /source-admitted/u,
  );
});

test("movement profile contract: QUESTION factory dispatch rejects transformed bindings before apply", () => {
  const duplicateImports = Object.freeze({
    createChargeQuestionFixture: ["./special-movement-dash.js", "createDashQuestionFixture"],
    createChargeKnockbackQuestionRecords: ["./special-movement-retarget.js", "createRetargetQuestionRecords"],
    createDashQuestionFixture: ["./special-movement-charge.js", "createChargeQuestionFixture"],
    createJumpQuestionFixture: ["./special-movement-recoil.js", "createRecoilQuestionFixture"],
    createRecoilQuestionFixture: ["./special-movement-jump.js", "createJumpQuestionFixture"],
    createRetargetQuestionRecords: ["./special-movement-charge-knockback.js", "createChargeKnockbackQuestionRecords"],
  });
  const attackNames = [
    "bind",
    "direct Proxy",
    "globalThis.Proxy alias",
    "callable wrapper",
    "Function.apply wrapper",
    "Function.call wrapper",
    "Reflect.apply wrapper",
    "revoked Proxy",
    "duplicate module factory",
    "counted duplicate module factory",
  ];
  let cases = 0;
  let callbackTotal = 0;
  let trapTotal = 0;

  for (const factoryName of Object.keys(QUESTION_FACTORY_INFO)) {
    const unwrappedName = `${factoryName}Unwrapped`;
    const [duplicateModule, duplicateExport] = duplicateImports[factoryName];
    const prefix = [
      `import { ${duplicateExport} as __duplicateFactory } from ${JSON.stringify(duplicateModule)};`,
      "globalThis.__factoryCallbacks = 0;",
      "globalThis.__factoryTraps = 0;",
      "function __bumpFactoryCallback() { globalThis.__factoryCallbacks += 1; }",
      "function __bumpFactoryTrap() { globalThis.__factoryTraps += 1; throw new Error(\"hostile factory trap\"); }",
      "const __hostileGraphHandler = {",
      "  getPrototypeOf() { __bumpFactoryTrap(); },",
      "  ownKeys() { __bumpFactoryTrap(); },",
      "  getOwnPropertyDescriptor() { __bumpFactoryTrap(); },",
      "  get() { __bumpFactoryTrap(); },",
      "};",
      "const __factoryProxyHandler = {",
      "  apply(target, thisArg, args) { __bumpFactoryTrap(); return Reflect.apply(target, thisArg, args); },",
      "};",
      `function __hostileFactory(...args) { __bumpFactoryCallback(); const __raw = ${unwrappedName}(...args); return new Proxy(__raw, __hostileGraphHandler); }`,
      "function __countedDuplicateFactory(...args) { __bumpFactoryCallback(); return __duplicateFactory(...args); }",
      "function __crossRealmFactoryBump() { __bumpFactoryCallback(); }",
      "const __crossRealmFactory = vm.runInNewContext(\"(function(target, bump) { return function(...args) { bump(); return target(...args); }; })(__target, __bump)\", { __target: __hostileFactory, __bump: __crossRealmFactoryBump });",
      "const __copiedFactory = function(...args) { __bumpFactoryCallback(); return __hostileFactory(...args); };",
      "Object.defineProperty(__copiedFactory, \"name\", { configurable: true, value: __hostileFactory.name });",
      "Object.setPrototypeOf(__copiedFactory, Object.getPrototypeOf(__hostileFactory));",
      "Object.defineProperty(__copiedFactory, \"toString\", { configurable: true, value: Function.prototype.toString.bind(__hostileFactory) });",
    ].join("\n") + "\n";
    const attacks = [
      ["bind", "__hostileFactory.bind(undefined)"],
      ["transparent Proxy", "new Proxy(__hostileFactory, {})"],
      ["direct Proxy", "new Proxy(__hostileFactory, __factoryProxyHandler)"],
      ["globalThis.Proxy alias", "(() => { const __P = globalThis.Proxy; return new __P(__hostileFactory, __factoryProxyHandler); })()"],
      ["callable wrapper", "(...args) => { __bumpFactoryCallback(); return __hostileFactory(...args); }"],
      ["Function.apply wrapper", "(...args) => { __bumpFactoryCallback(); return Function.prototype.apply.call(__hostileFactory, undefined, args); }"],
      ["Function.call wrapper", "(...args) => { __bumpFactoryCallback(); return Function.prototype.call.call(__hostileFactory, undefined, ...args); }"],
      ["Reflect.apply wrapper", "(...args) => { __bumpFactoryCallback(); return Reflect.apply(__hostileFactory, undefined, args); }"],
      ["cross-realm wrapper", "__crossRealmFactory"],
      ["copied name/prototype/toString", "__copiedFactory"],
      ["revoked Proxy", "(() => { const __revocable = Proxy.revocable(__hostileFactory, __factoryProxyHandler); __revocable.revoke(); return __revocable.proxy; })()"],
      ["duplicate module factory", "__duplicateFactory"],
      ["counted duplicate module factory", "__countedDuplicateFactory"],
    ];
    for (const [label, replacement] of attacks) {
      const result = runSourceWrapperProbe(questionFactoryExportWrapperCase(
        factoryName,
        replacement,
        {
          prefix,
          reportFactoryCallbacks: true,
          reportFactoryTraps: true,
          probeExposure: true,
        },
      ));
      assert.equal(result.accepted, false, `${factoryName} ${label} was accepted`);
      assert.equal(result.factoryCallbacks, 0, `${factoryName} ${label} executed the factory`);
      assert.equal(result.factoryTraps, 0, `${factoryName} ${label} executed a trap`);
      assert.equal(result.exposed, false, `${factoryName} ${label} exposed a partial manifest`);
      assert.doesNotMatch(result.error, /hostile factory trap|hostile graph/u);
      callbackTotal += result.factoryCallbacks;
      trapTotal += result.factoryTraps;
      cases += 1;
    }
  }

  assert.deepEqual({ callbackTotal, cases, trapTotal }, {
    callbackTotal: 0,
    cases: 78,
    trapTotal: 0,
  });
});

test("movement profile contract: independent QUESTION authority ignores source lookalikes and duplicate identities", async () => {
  const baseline = serializeSessionTroopMovementProfileManifest();
  const baselineHash = createHash("sha256").update(baseline).digest("hex");
  const authorityImport = "../session-troop-movement-question-authority.js";
  const profileAuthorityImport = "./session-troop-movement-question-authority.js";

  let canonicalLookalikeCases = 0;
  for (const factoryName of Object.keys(QUESTION_FACTORY_INFO)) {
    const result = runSourceWrapperProbe(questionFactoryExportWrapperCase(
      factoryName,
      `${factoryName}Unwrapped`,
      {
        expect: "accept",
        fakeAuthority: true,
        reportAuthorityGets: true,
      },
    ));
    assert.deepEqual(result, {
      accepted: true,
      authorityGets: 0,
      length: baseline.length,
      sha256: baselineHash,
    }, `${factoryName} read the fake authority export`);
    canonicalLookalikeCases += 1;
  }

  const hostileFactoryPrefix = [
    "globalThis.__factoryCallbacks = 0;",
    "globalThis.__factoryTraps = 0;",
    "const __hostileGraphHandler = {",
    "  getPrototypeOf() { globalThis.__factoryTraps += 1; throw new Error(\"hostile graph trap\"); },",
    "  ownKeys() { globalThis.__factoryTraps += 1; throw new Error(\"hostile graph trap\"); },",
    "  getOwnPropertyDescriptor() { globalThis.__factoryTraps += 1; throw new Error(\"hostile graph trap\"); },",
    "  get() { globalThis.__factoryTraps += 1; throw new Error(\"hostile graph trap\"); },",
    "};",
  ].join("\n");
  let coherentWrapperCases = 0;
  for (const factoryName of Object.keys(QUESTION_FACTORY_INFO)) {
    const unwrappedName = `${factoryName}Unwrapped`;
    const result = runSourceWrapperProbe(questionFactoryExportWrapperCase(
      factoryName,
      `(...args) => { globalThis.__factoryCallbacks += 1; const __raw = ${unwrappedName}(...args); return new Proxy(__raw, __hostileGraphHandler); }`,
      {
        fakeAuthority: true,
        prefix: hostileFactoryPrefix,
        reportAuthorityGets: true,
        reportFactoryCallbacks: true,
        reportFactoryTraps: true,
        probeExposure: true,
      },
    ));
    assert.equal(result.accepted, false, `${factoryName} coherent source wrapper was accepted`);
    assert.equal(result.authorityGets, 0, `${factoryName} fake authority accessor was read`);
    assert.equal(result.exposed, false, `${factoryName} exposed a partial manifest`);
    assert.equal(result.factoryCallbacks, 0, `${factoryName} coherent source wrapper was reached`);
    assert.equal(result.factoryTraps, 0, `${factoryName} hostile graph trap was reached`);
    assert.doesNotMatch(result.error, /hostile graph trap/u);
    coherentWrapperCases += 1;
  }

  const authorityUrlVariants = (factoryName) => [
    `?critic-minimal-duplicate=${factoryName}`,
    `#fragment-alias=${factoryName}`,
    `?query-alias=${factoryName}#fragment-alias=${factoryName}`,
    `?percent-query=%23${factoryName}`,
  ];
  let sourceQueryCases = 0;
  for (const factoryName of Object.keys(QUESTION_FACTORY_INFO)) {
    for (const suffix of authorityUrlVariants(factoryName)) {
      const result = runSourceWrapperProbe(questionFactoryExportWrapperCase(
        factoryName,
        `${factoryName}Unwrapped`,
        {
          importMarker: authorityImport,
          importReplacement: `${authorityImport}${suffix}`,
          prefix: "globalThis.__factoryCallbacks = 0; globalThis.__factoryTraps = 0;",
          reportFactoryCallbacks: true,
          reportFactoryTraps: true,
          probeExposure: true,
        },
      ));
      assert.equal(result.accepted, false, `${factoryName}${suffix} source authority was accepted`);
      assert.equal(result.exposed, false, `${factoryName}${suffix} source exposed a partial manifest`);
      assert.equal(result.factoryCallbacks, 0, `${factoryName}${suffix} source invoked a factory`);
      assert.equal(result.factoryTraps, 0, `${factoryName}${suffix} source invoked a trap`);
      sourceQueryCases += 1;
    }
  }

  let profileQueryCases = 0;
  for (const suffix of authorityUrlVariants("profile")) {
    const profileQuery = runSourceWrapperProbe({
      expect: "reject",
      marker: "const VERSION = 1;",
      replacement: "const VERSION = 1;",
      importMarker: profileAuthorityImport,
      importReplacement: `${profileAuthorityImport}${suffix}`,
      prefix: "globalThis.__factoryCallbacks = 0; globalThis.__factoryTraps = 0;",
      reportFactoryCallbacks: true,
      reportFactoryTraps: true,
      probeExposure: true,
      targetPath: MOVEMENT_SOURCE_MODULE_PATH,
    });
    assert.equal(profileQuery.accepted, false, `${suffix} profile authority was accepted`);
    assert.equal(profileQuery.exposed, false, `${suffix} profile authority exposed a partial manifest`);
    assert.equal(profileQuery.factoryCallbacks, 0, `${suffix} profile authority invoked a factory`);
    assert.equal(profileQuery.factoryTraps, 0, `${suffix} profile authority invoked a trap`);
    profileQueryCases += 1;
  }

  let directAuthorityRejects = 0;
  for (const suffix of authorityUrlVariants("direct")) {
    await assert.rejects(
      import(`../src/content/session-troop-movement-question-authority.js${suffix}`),
      /canonical module URL/u,
      `direct authority ${suffix} produced usable exports`,
    );
    directAuthorityRejects += 1;
  }

  assert.deepEqual({
    canonicalLookalikeCases,
    coherentWrapperCases,
    directAuthorityRejects,
    profileQueryCases,
    sourceQueryCases,
  }, {
    canonicalLookalikeCases: 6,
    coherentWrapperCases: 6,
    directAuthorityRejects: 4,
    profileQueryCases: 4,
    sourceQueryCases: 24,
  });
  assert.equal(serializeSessionTroopMovementProfileManifest(), baseline);
});

test("movement profile contract: canonicalization fails closed for non-JSON values without traps", () => {
  const cases = [
    ["undefined", "const __canonicalValue = undefined;"],
    ["BigInt", "const __canonicalValue = 1n;"],
    ["function", "const __canonicalValue = () => 1;"],
    ["symbol", "const __canonicalValue = Symbol(\"canonical-drift\");"],
    ["numeric wrapper", "const __canonicalValue = new Number(1);"],
    ["NaN", "const __canonicalValue = Number.NaN;"],
    ["Infinity", "const __canonicalValue = Number.POSITIVE_INFINITY;"],
    ["-Infinity", "const __canonicalValue = Number.NEGATIVE_INFINITY;"],
    ["getter", [
      "const __canonicalValue = {};",
      "Object.defineProperty(__canonicalValue, \"value\", { enumerable: true, get() { __canonicalTraps += 1; throw new Error(\"getter callback\"); } });",
    ].join("\n")],
    ["proxy", [
      "const __canonicalValue = new Proxy({ value: 1 }, {",
      "  get() { __canonicalTraps += 1; throw new Error(\"proxy callback\"); },",
      "  getPrototypeOf() { __canonicalTraps += 1; throw new Error(\"prototype callback\"); },",
      "});",
    ].join("\n")],
    ["cycle", [
      "const __canonicalValue = {};",
      "__canonicalValue.self = __canonicalValue;",
    ].join("\n")],
    ["sparse array", [
      "const __canonicalValue = [];",
      "__canonicalValue.length = 1;",
    ].join("\n")],
    ["custom prototype", [
      "const __canonicalValue = Object.create({ hostile: true });",
      "__canonicalValue.value = 1;",
    ].join("\n")],
  ];
  for (const [label, setup] of cases) {
    const result = runSourceWrapperProbe(canonicalWrapperCase(setup));
    assert.equal(result.accepted, false, `${label} canonical input was accepted`);
    assert.doesNotMatch(result.error, /attacker callback|callback/u, `${label} invoked a trap`);
  }

  const reordered = runSourceWrapperProbe(canonicalWrapperCase(
    "",
    { expect: "accept", manifest: true },
  ));
  const expected = canonical(createSessionTroopMovementProfileManifest().profiles[0]);
  assert.deepEqual(reordered, {
    accepted: true,
    length: expected.length,
    sha256: createHash("sha256").update(expected).digest("hex"),
  });

  const trapNames = [
    "ownKeys",
    "getOwnPropertyDescriptor",
    "get",
    "getPrototypeOf",
    "has",
    "set",
    "deleteProperty",
    "defineProperty",
    "isExtensible",
    "preventExtensions",
    "setPrototypeOf",
  ];
  let trapCases = 0;
  let callbackCases = 0;
  for (const trapName of trapNames) {
    const result = runSourceWrapperProbe(canonicalWrapperCase([
      "const __canonicalTarget = { value: 1 };",
      `const __canonicalValue = new Proxy(__canonicalTarget, { ${trapName}() { __canonicalTraps += 1; throw new Error(\"${trapName} callback\"); } });`,
    ].join("\n")));
    assert.equal(result.accepted, false, `${trapName} Proxy was accepted`);
    if (/callback/u.test(result.error)) callbackCases += 1;
    trapCases += 1;
  }

  const callableTrapCases = ["apply", "construct"];
  for (const trapName of callableTrapCases) {
    const result = runSourceWrapperProbe(canonicalWrapperCase([
      "const __canonicalTarget = function canonicalTarget() {};",
      `const __canonicalValue = new Proxy(__canonicalTarget, { ${trapName}() { __canonicalTraps += 1; throw new Error(\"${trapName} callback\"); } });`,
    ].join("\n")));
    assert.equal(result.accepted, false, `${trapName} Proxy was accepted`);
    if (/callback/u.test(result.error)) callbackCases += 1;
    trapCases += 1;
  }

  const allTraps = trapNames.map((trapName) =>
    `${trapName}() { __canonicalTraps += 1; throw new Error(\"${trapName} callback\"); }`
  ).join(",\n");
  const combined = runSourceWrapperProbe(canonicalWrapperCase([
    "const __canonicalTarget = { value: 1 };",
    `const __canonicalValue = new Proxy(__canonicalTarget, { ${allTraps} });`,
  ].join("\n")));
  assert.equal(combined.accepted, false, "combined hostile Proxy was accepted");
  if (/callback/u.test(combined.error)) callbackCases += 1;
  trapCases += 1;

  assert.equal(trapCases, 14);
  assert.equal(callbackCases, 0);
});

test("movement profile contract: every canonical admission helper rejects aliased Proxy roots before reflection", () => {
  const trapHandler = `({
    getPrototypeOf() { __canonicalTraps += 1; throw new Error("getPrototypeOf callback"); },
    ownKeys() { __canonicalTraps += 1; throw new Error("ownKeys callback"); },
    getOwnPropertyDescriptor() { __canonicalTraps += 1; throw new Error("getOwnPropertyDescriptor callback"); },
    get() { __canonicalTraps += 1; throw new Error("get callback"); },
    has() { __canonicalTraps += 1; throw new Error("has callback"); },
    isExtensible() { __canonicalTraps += 1; throw new Error("isExtensible callback"); },
    preventExtensions() { __canonicalTraps += 1; throw new Error("preventExtensions callback"); },
    defineProperty() { __canonicalTraps += 1; throw new Error("defineProperty callback"); },
    setPrototypeOf() { __canonicalTraps += 1; throw new Error("setPrototypeOf callback"); },
    deleteProperty() { __canonicalTraps += 1; throw new Error("deleteProperty callback"); },
    set() { __canonicalTraps += 1; throw new Error("set callback"); },
  })`;
  const aliasCases = [
    ["direct Proxy", `const __canonicalTarget = { value: 1 }; const __canonicalValue = new Proxy(__canonicalTarget, ${trapHandler});`],
    ["globalThis.Proxy alias", `const __P = globalThis.Proxy; const __canonicalTarget = { value: 1 }; const __canonicalValue = new __P(__canonicalTarget, ${trapHandler});`],
    ["Reflect.construct", `const __P = globalThis.Proxy; const __canonicalTarget = { value: 1 }; const __canonicalValue = Reflect.construct(__P, [__canonicalTarget, ${trapHandler}]);`],
    ["computed Proxy alias", `const __P = globalThis["Proxy"]; const __canonicalTarget = { value: 1 }; const __canonicalValue = new __P(__canonicalTarget, ${trapHandler});`],
    ["multi-hop Proxy alias", `const __P0 = globalThis.Proxy; const __P1 = __P0; const __P2 = __P1; const __canonicalTarget = { value: 1 }; const __canonicalValue = new __P2(__canonicalTarget, ${trapHandler});`],
    ["Proxy.revocable", `const __P = globalThis.Proxy; const __canonicalTarget = { value: 1 }; const __canonicalValue = __P.revocable(__canonicalTarget, ${trapHandler}).proxy;`],
    ["Function-built Proxy alias", `const __P = Function("return globalThis.Proxy")(); const __canonicalTarget = { value: 1 }; const __canonicalValue = new __P(__canonicalTarget, ${trapHandler});`],
    ["eval-built Proxy alias", `const __P = Function("return (0, eval)(\\"globalThis.Proxy\\")")(); const __canonicalTarget = { value: 1 }; const __canonicalValue = new __P(__canonicalTarget, ${trapHandler});`],
  ];
  let helperCases = 0;
  let callbackTotal = 0;
  for (const [label, setup] of aliasCases) {
    for (const helper of ["canonical", "canonicalTrusted", "admit", "construct"]) {
      const result = runSourceWrapperProbe(canonicalWrapperCase(setup, {
        admit: helper === "admit",
        construct: helper === "construct",
        reportCanonicalTraps: true,
      }));
      assert.equal(result.accepted, false, `${label} reached ${helper}`);
      assert.equal(result.canonicalTraps, 0, `${label} invoked a trap through ${helper}`);
      assert.doesNotMatch(result.error, /callback/u, `${label} exposed a callback through ${helper}`);
      callbackTotal += result.canonicalTraps;
      helperCases += 1;
    }
  }
  assert.equal(helperCases, 32);
  assert.equal(callbackTotal, 0);
});

test("movement profile contract: complete QUESTION witnesses reject content, shape, metadata, and read drift", () => {
  const contentCases = [
    "add",
    "remove",
    "duplicate",
    "value",
    "key",
    "authoritative",
    "confidence",
    "disposition",
    "source",
    "extra",
    "missing",
  ];
  let contentRejects = 0;
  for (const factoryName of Object.keys(EXPECTED_QUESTION_FACTORY_WITNESSES)) {
    for (const kind of contentCases) {
      const result = runSourceWrapperProbe(questionFactoryWrapperCase(
        factoryName,
        questionMutation(factoryName, kind),
      ));
      assert.equal(result.accepted, false, `${factoryName} ${kind} drift was accepted`);
      contentRejects += 1;
    }
  }

  let keyOrderAccepts = 0;
  for (const factoryName of Object.keys(EXPECTED_QUESTION_FACTORY_WITNESSES)) {
    const result = runSourceWrapperProbe(questionFactoryWrapperCase(
      factoryName,
      questionMutation(factoryName, "reorder"),
      { expect: "accept" },
    ));
    const baseline = serializeSessionTroopMovementProfileManifest();
    assert.deepEqual(result, {
      accepted: true,
      length: baseline.length,
      sha256: createHash("sha256").update(baseline).digest("hex"),
    }, `${factoryName} key-order normalization changed the manifest`);
    keyOrderAccepts += 1;
  }

  const nestedCases = [
    "createChargeKnockbackQuestionRecords",
    "createRetargetQuestionRecords",
  ];
  let nestedRejects = 0;
  for (const factoryName of nestedCases) {
    const result = runSourceWrapperProbe(questionFactoryWrapperCase(
      factoryName,
      questionMutation(factoryName, "nested"),
    ));
    assert.equal(result.accepted, false, `${factoryName} nested/array drift was accepted`);
    nestedRejects += 1;
  }

  const shapeCases = ["accessor", "symbol", "proxy", "noncloneable"];
  let shapeRejects = 0;
  for (const factoryName of Object.keys(EXPECTED_QUESTION_FACTORY_WITNESSES)) {
    for (const kind of shapeCases) {
      const result = runSourceWrapperProbe(questionFactoryWrapperCase(
        factoryName,
        questionMutation(factoryName, kind),
      ));
      assert.equal(result.accepted, false, `${factoryName} ${kind} shape was accepted`);
      shapeRejects += 1;
    }
  }

  let alternatingReadRejects = 0;
  for (const factoryName of Object.keys(EXPECTED_QUESTION_FACTORY_WITNESSES)) {
    const result = runSourceWrapperProbe(questionFactoryWrapperCase(
      factoryName,
      questionMutation(factoryName, "value"),
      { firstReadOnly: true },
    ));
    assert.equal(result.accepted, false, `${factoryName} first/second read drift was accepted`);
    alternatingReadRejects += 1;
  }

  const dashCases = ["add", "value", "remove"];
  let dashRejects = 0;
  for (const kind of dashCases) {
    const result = runSourceWrapperProbe(questionFactoryWrapperCase(
      "createDashQuestionFixture",
      questionMutation("createDashQuestionFixture", kind),
    ));
    assert.equal(result.accepted, false, `Dash ${kind} drift was accepted`);
    dashRejects += 1;
  }

  assert.deepEqual({
    alternatingReadRejects,
    contentRejects,
    dashRejects,
    keyOrderAccepts,
    nestedRejects,
    shapeRejects,
  }, {
    alternatingReadRejects: 6,
    contentRejects: 66,
    dashRejects: 3,
    keyOrderAccepts: 6,
    nestedRejects: 2,
    shapeRejects: 24,
  });
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
