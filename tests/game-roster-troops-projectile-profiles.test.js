import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
import {
  createSessionTroopWitness,
  createSessionTroopWitnessQuestions,
} from "../src/content/session-troop-roster.js";
import { LiveBattle } from "../src/sim/live-battle.js";

const EXPECTED_OCCURRENCES = [
  ["aegis-sage", "createReflectionSpecialCatalog", "aegis-sage", "reflection"],
  ["prism-warden", "createPierceSpecialCatalog", "prism-warden", "pierce"],
  ["rune-reaver", "createReturnSpecialCatalog", "rune-reaver", "return"],
  ["scatterguard", "createPelletSpecialCatalog", "scatterguard", "pellets"],
  ["stormkite", "createChainSpecialCatalog", "stormkite", "chain"],
];

const EXPECTED_UNRESOLVED_DELIVERY = [
  ["brassbolt", "createBasicRangedCatalog", "brassbolt", "brassbolt.delivery", 2],
  ["briar-band", "createSwarmCatalog", "briar-darter", "briar-darter.delivery", 2],
  ["copperskiff", "createBasicFlyingCatalog", "copperskiff", "copperskiff.delivery", 2],
  ["reedsting", "createBasicRangedCatalog", "reedsting", "reedsting.delivery", 2],
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

const SOURCE_MODULE_PATHS = Object.freeze(Object.fromEntries(
  Object.entries({
    createBasicRangedCatalog: "cards/basic-ranged.js",
    createBasicFlyingCatalog: "cards/basic-flying.js",
    createSwarmCatalog: "cards/swarms.js",
    createChainSpecialCatalog: "cards/special-projectiles-chain.js",
    createPierceSpecialCatalog: "cards/special-projectiles-pierce.js",
    createReturnSpecialCatalog: "cards/special-projectiles-return.js",
    createPelletSpecialCatalog: "cards/special-projectiles-pellets.js",
    createReflectionSpecialCatalog: "cards/special-projectiles-reflection.js",
  }).map(([exportName, relativePath]) => [
    exportName,
    fileURLToPath(new URL(`../src/content/${relativePath}`, import.meta.url)),
  ]),
));
const PROJECTILE_SOURCE_MODULE_PATH = fileURLToPath(new URL(
  "../src/content/session-troop-projectile-profiles.js", import.meta.url,
));
const PROJECTILE_SOURCE_ADMISSION_MODULE_PATH = fileURLToPath(new URL(
  "../src/content/session-troop-projectile-source-admission.js", import.meta.url,
));
const HTP_MODULE_PATH = fileURLToPath(new URL(
  "../src/content/session-troop-profile-catalog.js", import.meta.url,
));
const HTO_MODULE_PATH = fileURLToPath(new URL(
  "../src/content/session-troop-roster.js", import.meta.url,
));
const SHARED_ADMISSION_ENTRY_POINTS = Object.freeze([
  Object.freeze({
    args: [],
    exportName: "createSessionCardManifest",
    path: fileURLToPath(new URL("../src/content/session-card-catalog.js", import.meta.url)),
  }),
  Object.freeze({
    args: [],
    exportName: "createSessionTroopProfileManifest",
    path: HTP_MODULE_PATH,
  }),
  Object.freeze({
    args: ["mossguard"],
    exportName: "createSessionTroopWitness",
    path: HTO_MODULE_PATH,
  }),
  Object.freeze({
    args: [],
    exportName: "createSessionTroopProjectileProfileManifest",
    path: PROJECTILE_SOURCE_MODULE_PATH,
  }),
]);
const REBRANDED_SOURCE_BINDINGS = Object.freeze([
  Object.freeze(["createBasicRangedCatalog", "brassbolt"]),
  Object.freeze(["createBasicFlyingCatalog", "copperskiff"]),
  Object.freeze(["createSwarmCatalog", "briar-band"]),
  Object.freeze(["createChainSpecialCatalog", "stormkite"]),
  Object.freeze(["createPierceSpecialCatalog", "prism-warden"]),
  Object.freeze(["createReturnSpecialCatalog", "rune-reaver"]),
  Object.freeze(["createPelletSpecialCatalog", "scatterguard"]),
  Object.freeze(["createReflectionSpecialCatalog", "aegis-sage"]),
]);
const REBRANDED_SOURCE_FIELD_MUTATIONS = Object.freeze([
  Object.freeze(["areaDamageRadiusMillitiles", "record.areaDamageRadiusMillitiles = record.areaDamageRadiusMillitiles === null ? 1 : record.areaDamageRadiusMillitiles + 1;"]),
  Object.freeze(["cost", "record.cost += 1;"]),
  Object.freeze(["count", "record.count += 1;"]),
  Object.freeze(["damage", "record.damage += 1;"]),
  Object.freeze(["deployTimeTicks", "record.deployTimeTicks += 1;"]),
  Object.freeze(["displayName", "record.displayName += \" Drift\";"]),
  Object.freeze(["firstHitTicks", "record.firstHitTicks += 1;"]),
  Object.freeze(["hitSpeedTicks", "record.hitSpeedTicks += 1;"]),
  Object.freeze(["hitpoints", "record.hitpoints += 1;"]),
  Object.freeze(["id", "record.id += \"-drift\";"]),
  Object.freeze(["kind", "record.kind = \"structure\";"]),
  Object.freeze(["movementMillitilesPerSecond", "record.movementMillitilesPerSecond += 1;"]),
  Object.freeze(["rangeMillitiles", "record.rangeMillitiles += 1;"]),
  Object.freeze(["rarity", "record.rarity = record.rarity === \"standard\" ? \"uncommon\" : \"standard\";"]),
  Object.freeze(["sightRangeMillitiles", "record.sightRangeMillitiles += 1;"]),
  Object.freeze(["targetMode", "record.targetMode = record.targetMode === \"ground\" ? \"ground-and-air\" : \"ground\";"]),
]);
const REBRANDED_BRIAR_COMPONENT_FIELD_MUTATIONS = Object.freeze([
  Object.freeze(["areaDamageRadiusMillitiles", "record.components[0].areaDamageRadiusMillitiles = record.components[0].areaDamageRadiusMillitiles === null ? 1 : record.components[0].areaDamageRadiusMillitiles + 1;"]),
  Object.freeze(["count", "record.components[0].count += 1;"]),
  Object.freeze(["damage", "record.components[0].damage += 1;"]),
  Object.freeze(["deployTimeTicks", "record.components[0].deployTimeTicks += 1;"]),
  Object.freeze(["displayName", "record.components[0].displayName += \" Drift\";"]),
  Object.freeze(["firstHitTicks", "record.components[0].firstHitTicks += 1;"]),
  Object.freeze(["hitSpeedTicks", "record.components[0].hitSpeedTicks += 1;"]),
  Object.freeze(["hitpoints", "record.components[0].hitpoints += 1;"]),
  Object.freeze(["id", "record.components[0].id += \"-drift\";"]),
  Object.freeze(["kind", "record.components[0].kind = \"structure\";"]),
  Object.freeze(["movementMillitilesPerSecond", "record.components[0].movementMillitilesPerSecond += 1;"]),
  Object.freeze(["rangeMillitiles", "record.components[0].rangeMillitiles += 1;"]),
  Object.freeze(["role", "record.components[0].role = \"spawn\";"]),
  Object.freeze(["sightRangeMillitiles", "record.components[0].sightRangeMillitiles += 1;"]),
  Object.freeze(["targetMode", "record.components[0].targetMode = \"ground-and-air\";"]),
]);
const EXPECTED_SOURCE_PAIRS = [
  ["createBasicRangedCatalog", "brassbolt"],
  ["createBasicRangedCatalog", "reedsting"],
  ["createBasicFlyingCatalog", "copperskiff"],
  ["createBasicFlyingCatalog", "skymaul"],
  ["createSwarmCatalog", "briar-band"],
  ["createSwarmCatalog", "cinderlings"],
  ["createChainSpecialCatalog", "stormkite"],
  ["createPierceSpecialCatalog", "prism-warden"],
  ["createReturnSpecialCatalog", "rune-reaver"],
  ["createPelletSpecialCatalog", "scatterguard"],
  ["createReflectionSpecialCatalog", "aegis-sage"],
];

const PROJECTILE_SOURCE_WRAPPER_PROBE = String.raw`
import vm from "node:vm";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const config = JSON.parse(process.env.PROJECTILE_SOURCE_PROBE);
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
  if (!source.includes(config.marker)) throw new Error("source wrapper marker is missing");
  return (config.prefix ?? "") + source.replace(config.marker, config.replacement);
}

function probeResult(payload) {
  if (config.reportTraps) payload.traps = context.__sourceProbeTraps ?? 0;
  if (config.reportCallbacks) payload.callbacks = context.__sourceProbeCallbacks ?? 0;
  if (config.probeExposure) {
    payload.exposed = false;
    if (projectile !== null) {
      try {
        const factory = projectile.namespace[config.entryExport ??
          "createSessionTroopProjectileProfileManifest"];
        if (typeof factory === "function") {
          factory(...(config.entryArgs ?? []));
          payload.exposed = true;
        }
      } catch {
        // An errored module must not expose its partially initialized exports.
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
        initializeImportMeta(meta) { meta.url = url; },
      },
    );
    await module.link((specifier, referencingModule) =>
      loadModule(new URL(specifier, referencingModule.identifier).href));
    return module;
  })();
  moduleCache.set(url, promise);
  return promise;
}

let exitCode = 0;
let projectile = null;
try {
  projectile = await loadModule(pathToFileURL(
    config.entryPath ?? config.projectilePath,
  ).href);
  await projectile.evaluate();
  if (config.entryExport) {
    projectile.namespace[config.entryExport](...(config.entryArgs ?? []));
    console.log(JSON.stringify(probeResult({ accepted: true })));
  } else {
    const bytes = projectile.namespace.serializeSessionTroopProjectileProfileManifest();
    console.log(JSON.stringify(probeResult({
      accepted: true,
      length: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    })));
  }
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
    PROJECTILE_SOURCE_WRAPPER_PROBE,
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      PROJECTILE_SOURCE_PROBE: JSON.stringify({
        projectilePath: PROJECTILE_SOURCE_MODULE_PATH,
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
  const prefixes = [
    options.alternatingReads ? "let __sourceReadCount = 0;" : "",
    options.skipCalls === undefined ? "" : "let __sourceProbeCallCount = 0;",
    options.prefix ?? "",
  ].filter(Boolean);
  const mutationSource = options.skipCalls === undefined
    ? mutation
    : `if (__sourceProbeCallCount > ${options.skipCalls}) { ${mutation} }`;
  return {
    expect: options.expect ?? "reject",
    marker: "return createCardCatalog(DEFINITIONS);",
    prefix: prefixes.length > 0 ? `${prefixes.join("\n")}\n` : "",
    probeExposure: options.probeExposure ?? false,
    reportCallbacks: options.reportCallbacks ?? false,
    reportTraps: options.reportTraps ?? false,
    replacement: [
      "const records = createCardCatalog(DEFINITIONS);",
      options.alternatingReads ? "__sourceReadCount += 1;" : "",
      options.skipCalls === undefined ? "" : "__sourceProbeCallCount += 1;",
      `const record = records.find(({ id: candidateId }) => candidateId === ${JSON.stringify(id)});`,
      'if (record === undefined) throw new Error("source wrapper record is missing");',
      mutationSource,
      options.returnExpression ?? (options.rebuildWithTrustedConstructor
        ? "return createCardCatalog(records);"
        : "return records;"),
    ].filter(Boolean).join("\n"),
    targetPath: SOURCE_MODULE_PATHS[exportName],
  };
}

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
    claimedOccurrencePairs: 5,
    uniqueCardIds: 5,
    ordinarySourceClaims: 0,
    specialSourceClaims: 5,
    questionBearingClaims: 5,
    unresolvedDeliveryDependencies: 4,
    duplicatedCompositionOwnedIds: 1,
  });
  assert.deepEqual(manifest.profiles.map(({ id }) => id), [
    "aegis-sage", "prism-warden", "rune-reaver", "scatterguard", "stormkite",
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

test("projectile profiles: the complete witness map covers exactly the eight source export sets", () => {
  const source = readFileSync(PROJECTILE_SOURCE_ADMISSION_MODULE_PATH, "utf8");
  const pinnedPairs = [...source.matchAll(
    /\[sourceRecordKey\("([^"]+)", "([^"]+)"\)\]: canonical\(\{/gu,
  )].map(([, exportName, id]) => [exportName, id]);
  const sortPairs = (pairs) => [...pairs].sort(([leftExport, leftId], [rightExport, rightId]) =>
    leftId.localeCompare(rightId) || leftExport.localeCompare(rightExport));
  assert.equal(pinnedPairs.length, 11);
  assert.deepEqual(sortPairs(pinnedPairs), sortPairs(EXPECTED_SOURCE_PAIRS));
  assert.match(source, /const AUTHORITATIVE_PROJECTILE_SOURCE_IDS_BY_EXPORT = Object\.freeze\(\{/u);
  assert.match(source, /const EXPECTED_SOURCE_WITNESS_MAP = Object\.freeze\(\{/u);
  assert.match(source, /assertWitness\(exportName, firstRows\);/u);
  assert.deepEqual(Object.keys(SOURCE_CATALOGS).sort(), [
    "createBasicFlyingCatalog",
    "createBasicRangedCatalog",
    "createChainSpecialCatalog",
    "createPelletSpecialCatalog",
    "createPierceSpecialCatalog",
    "createReflectionSpecialCatalog",
    "createReturnSpecialCatalog",
  ]);
  assert.deepEqual(createSwarmCatalog().map(({ id }) => id).sort(), [
    "briar-band", "cinderlings",
  ]);
});

test("projectile profiles: every bound row rejects same-ID scalar drift", () => {
  let rejects = 0;
  for (const [exportName, id] of EXPECTED_SOURCE_PAIRS) {
    const result = runSourceWrapperProbe(sourceWrapperCase(
      exportName,
      id,
      "record.cost += 1;",
    ));
    assert.equal(result.accepted, false, `${exportName}/${id} scalar drift was accepted`);
    rejects += 1;
  }
  assert.equal(rejects, 11);
});

test("projectile source admission: rebranded cost drift rejects before every shared consumer", () => {
  let probes = 0;
  for (const [exportName, id] of REBRANDED_SOURCE_BINDINGS) {
    for (const entry of SHARED_ADMISSION_ENTRY_POINTS) {
      const result = runSourceWrapperProbe({
        ...sourceWrapperCase(exportName, id, "record.cost += 1;", {
          rebuildWithTrustedConstructor: true,
          probeExposure: true,
        }),
        entryArgs: entry.args,
        entryExport: entry.exportName,
        entryPath: entry.path,
      });
      assert.equal(result.accepted, false, `${entry.exportName}/${exportName} cost drift was accepted`);
      assert.equal(result.exposed, false, `${entry.exportName}/${exportName} exposed drifted output`);
      probes += 1;
    }
  }
  assert.equal(probes, 32);
});

test("projectile source admission: rebranded canonical key order stays usable in every shared consumer", () => {
  let probes = 0;
  for (const [exportName, id] of REBRANDED_SOURCE_BINDINGS) {
    for (const entry of SHARED_ADMISSION_ENTRY_POINTS) {
      const result = runSourceWrapperProbe({
        ...sourceWrapperCase(
          exportName,
          id,
          "records[records.indexOf(record)] = Object.fromEntries(Object.entries(record).reverse());",
          { expect: "accept", rebuildWithTrustedConstructor: true, probeExposure: true },
        ),
        entryArgs: entry.args,
        entryExport: entry.exportName,
        entryPath: entry.path,
      });
      assert.equal(result.accepted, true, `${entry.exportName}/${exportName} key order was rejected`);
      assert.equal(result.exposed, true, `${entry.exportName}/${exportName} did not expose its valid output`);
      probes += 1;
    }
  }
  assert.equal(probes, 32);
});

test("projectile source admission: every scalar source field rejects rebranding through every shared consumer", () => {
  let probes = 0;
  for (const [exportName, id] of REBRANDED_SOURCE_BINDINGS) {
    for (const [field, mutation] of REBRANDED_SOURCE_FIELD_MUTATIONS) {
      for (const entry of SHARED_ADMISSION_ENTRY_POINTS) {
        const result = runSourceWrapperProbe({
          ...sourceWrapperCase(exportName, id, mutation, {
            rebuildWithTrustedConstructor: true,
            probeExposure: true,
          }),
          entryArgs: entry.args,
          entryExport: entry.exportName,
          entryPath: entry.path,
        });
        assert.equal(result.accepted, false,
          `${entry.exportName}/${exportName}/${field} drift was accepted`);
        assert.equal(result.exposed, false,
          `${entry.exportName}/${exportName}/${field} exposed drifted output`);
        probes += 1;
      }
    }
  }
  for (const [field, mutation] of REBRANDED_BRIAR_COMPONENT_FIELD_MUTATIONS) {
    for (const entry of SHARED_ADMISSION_ENTRY_POINTS) {
      const result = runSourceWrapperProbe({
        ...sourceWrapperCase("createSwarmCatalog", "briar-band", mutation, {
          rebuildWithTrustedConstructor: true,
          probeExposure: true,
        }),
        entryArgs: entry.args,
        entryExport: entry.exportName,
        entryPath: entry.path,
      });
      assert.equal(result.accepted, false,
        `${entry.exportName}/briar-band/component.${field} drift was accepted`);
      assert.equal(result.exposed, false,
        `${entry.exportName}/briar-band/component.${field} exposed drifted output`);
      probes += 1;
    }
  }
  assert.equal(probes, 572);
});

test("projectile source admission: rebranded first-versus-second reads reject before every shared consumer", () => {
  let probes = 0;
  for (const [exportName, id] of REBRANDED_SOURCE_BINDINGS) {
    for (const entry of SHARED_ADMISSION_ENTRY_POINTS) {
      const result = runSourceWrapperProbe({
        ...sourceWrapperCase(exportName, id, "record.damage += 1;", {
          alternatingReads: true,
          rebuildWithTrustedConstructor: true,
          probeExposure: true,
        }),
        entryArgs: entry.args,
        entryExport: entry.exportName,
        entryPath: entry.path,
      });
      assert.equal(result.accepted, false,
        `${entry.exportName}/${exportName} changed second read was accepted`);
      assert.equal(result.exposed, false,
        `${entry.exportName}/${exportName} exposed changed second read`);
      probes += 1;
    }
  }
  assert.equal(probes, 32);
});

test("projectile source admission: rebranded source shape and nested drift fail before output", () => {
  const cases = [
    ["added row", "records.push({ ...record, id: \"unexpected-card\", displayName: \"Unexpected Card\" });"],
    ["removed row", "records.pop();"],
    ["duplicate row", "records.push(record);"],
    ["reordered array", "record.components.reverse();"],
    ["unexpected metadata", "record.metadata = { source: \"attacker\" };"],
    ["unexpected provenance", "record.provenance = { source: \"attacker\" };"],
    ["nested component", "record.components[1].damage += 1;"],
  ];
  let probes = 0;
  for (const [label, mutation] of cases) {
    for (const entry of SHARED_ADMISSION_ENTRY_POINTS) {
      const result = runSourceWrapperProbe({
        ...sourceWrapperCase("createSwarmCatalog", "briar-band", mutation, {
          rebuildWithTrustedConstructor: true,
          probeExposure: true,
        }),
        entryArgs: entry.args,
        entryExport: entry.exportName,
        entryPath: entry.path,
      });
      assert.equal(result.accepted, false, `${entry.exportName}/${label} was accepted`);
      assert.equal(result.exposed, false, `${entry.exportName}/${label} exposed output`);
      probes += 1;
    }
  }
  assert.equal(probes, 28);
});

test("projectile profiles: representative source fields, shapes, and nested Briar changes fail closed", () => {
  const fieldCases = [
    ["areaDamageRadiusMillitiles", "createPelletSpecialCatalog", "scatterguard", "record.areaDamageRadiusMillitiles = 71;"],
    ["components", "createSwarmCatalog", "briar-band", "record.components.push({});"],
    ["cost", "createBasicFlyingCatalog", "copperskiff", "record.cost = 5;"],
    ["count", "createSwarmCatalog", "briar-band", "record.count = 7;"],
    ["damage", "createBasicRangedCatalog", "brassbolt", "record.damage = 219;"],
    ["deployTimeTicks", "createBasicFlyingCatalog", "copperskiff", "record.deployTimeTicks = 61;"],
    ["displayName", "createBasicFlyingCatalog", "copperskiff", "record.displayName = \"Copperskiff Drift\";"],
    ["firstHitTicks", "createBasicFlyingCatalog", "copperskiff", "record.firstHitTicks = 37;"],
    ["hitSpeedTicks", "createBasicFlyingCatalog", "copperskiff", "record.hitSpeedTicks = 67;"],
    ["hitpoints", "createBasicFlyingCatalog", "copperskiff", "record.hitpoints = 615;"],
    ["id", "createBasicFlyingCatalog", "copperskiff", "record.id = \"copperskiff-drift\";"],
    ["kind", "createBasicFlyingCatalog", "copperskiff", "record.kind = \"structure\";"],
    ["movementMillitilesPerSecond", "createBasicFlyingCatalog", "copperskiff", "record.movementMillitilesPerSecond = 1501;"],
    ["rangeMillitiles", "createBasicFlyingCatalog", "copperskiff", "record.rangeMillitiles = 6001;"],
    ["rarity", "createBasicFlyingCatalog", "copperskiff", "record.rarity = \"mythic\";"],
    ["sightRangeMillitiles", "createBasicFlyingCatalog", "copperskiff", "record.sightRangeMillitiles = 6001;"],
    ["targetMode", "createBasicFlyingCatalog", "copperskiff", "record.targetMode = \"ground\";"],
  ];
  for (const [field, exportName, id, mutation] of fieldCases) {
    const result = runSourceWrapperProbe(sourceWrapperCase(exportName, id, mutation));
    assert.equal(result.accepted, false, `${field} drift was accepted`);
  }

  const shapeCases = [
    ["extra row", "records.push(records[0]);"],
    ["missing row", "records.pop();"],
    ["duplicate row", "records.splice(1, 0, records[0]);"],
    ["extra field", "record.extraField = 1;"],
    ["missing field", "delete record.damage;"],
    ["accessor", "Object.defineProperty(record, \"damage\", { configurable: true, enumerable: true, get() { throw new Error(\"source accessor\"); } });"],
  ];
  for (const [label, mutation] of shapeCases) {
    const result = runSourceWrapperProbe(sourceWrapperCase(
      "createSwarmCatalog",
      "briar-band",
      mutation,
    ));
    assert.equal(result.accepted, false, `${label} source shape was accepted`);
  }

  const nestedCases = [
    ["component scalar", "record.components[1].damage = 82;"],
    ["component add", "record.components.push({ id: \"component-drift\" });"],
    ["component remove", "record.components.splice(1, 1);"],
    ["component reorder", "record.components.reverse();"],
  ];
  for (const [label, mutation] of nestedCases) {
    const result = runSourceWrapperProbe(sourceWrapperCase(
      "createSwarmCatalog",
      "briar-band",
      mutation,
    ));
    assert.equal(result.accepted, false, `${label} was accepted`);
  }
  assert.equal(fieldCases.length, 17);
  assert.equal(shapeCases.length, 6);
  assert.equal(nestedCases.length, 4);
});

test("projectile profiles: source reads, HTP, and HTO drift reject before exposure", () => {
  const alternating = runSourceWrapperProbe(sourceWrapperCase(
    "createBasicRangedCatalog",
    "brassbolt",
    "if ((__sourceReadCount % 2) === 0) record.damage = 219;",
    { alternatingReads: true },
  ));
  assert.equal(alternating.accepted, false, "changed second source read was accepted");

  const propertyOrder = runSourceWrapperProbe(sourceWrapperCase(
    "createSwarmCatalog",
    "briar-band",
    "records[records.indexOf(record)] = Object.fromEntries(Object.entries(record).reverse());",
    { expect: "accept", rebuildWithTrustedConstructor: true },
  ));
  const baseline = serializeSessionTroopProjectileProfileManifest();
  assert.deepEqual(propertyOrder, {
    accepted: true,
    length: baseline.length,
    sha256: createHash("sha256").update(baseline).digest("hex"),
  });

  const htpMissing = runSourceWrapperProbe({
    expect: "reject",
    marker: "return freeze(clone(MANIFEST));",
    replacement: "const output = clone(MANIFEST); output.occurrences[0] = { ...output.occurrences[0], id: \"drifted-occurrence\" }; return freeze(output);",
    targetPath: HTP_MODULE_PATH,
  });
  assert.equal(htpMissing.accepted, false, "HTP occurrence drift was accepted");

  const htoMutation = runSourceWrapperProbe({
    expect: "reject",
    marker: "return clonePublic(witness.questions);",
    replacement: "const output = clone(witness.questions); output.find(({ key }) => key === \"brassbolt.delivery\").value = 3; return freeze(output);",
    targetPath: HTO_MODULE_PATH,
  });
  assert.equal(htoMutation.accepted, false, "HTO question drift was accepted");
});

test("projectile profiles: source rows and every nested component reject hostile shapes trap-zero", () => {
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
    apply() { __bumpSourceProbeTrap(); throw new Error("proxy apply"); },
    construct() { __bumpSourceProbeTrap(); throw new Error("proxy construct"); },
  })`;
  const componentPositions = [
    ["createSwarmCatalog", "briar-band", 0, "briar-runner"],
    ["createSwarmCatalog", "briar-band", 1, "briar-darter"],
    ["createSwarmCatalog", "cinderlings", 0, "cinderling"],
  ];
  const reject = (label, exportName, id, mutation, options = {}) => {
    const result = runSourceWrapperProbe(sourceWrapperCase(
      exportName,
      id,
      mutation,
      { ...options, expect: "reject" },
    ));
    assert.equal(result.accepted, false, `${label} was accepted`);
    return result;
  };

  const customPrototypeCases = [
    ["rowCustomPrototype", "createSwarmCatalog", "briar-band",
      "Object.setPrototypeOf(record, { hostile: true });"],
    ...componentPositions.map(([exportName, id, index, componentId]) => [
      `componentCustomPrototype:${componentId}`,
      exportName,
      id,
      `Object.setPrototypeOf(record.components[${index}], { hostile: true });`,
    ]),
  ];
  for (const [label, exportName, id, mutation] of customPrototypeCases) {
    reject(label, exportName, id, mutation);
  }
  assert.equal(customPrototypeCases.length, 4);

  const nestedComponent = componentPositions[0];
  const [componentExport, componentCard, componentIndex, componentId] = nestedComponent;
  const structuralCases = [
    ["rowNullPrototype", "createSwarmCatalog", "briar-band",
      "Object.setPrototypeOf(record, null);"],
    ["componentNullPrototype", componentExport, componentCard,
      `Object.setPrototypeOf(record.components[${componentIndex}], null);`],
    ["rowClassInstance", "createSwarmCatalog", "briar-band",
      "class HostileRow {}; records[records.indexOf(record)] = Object.assign(new HostileRow(), record);"],
    ["componentClassInstance", componentExport, componentCard,
      `class HostileComponent {}; record.components[${componentIndex}] = Object.assign(new HostileComponent(), record.components[${componentIndex}]);`],
    ["rowCrossRealm", "createSwarmCatalog", "briar-band",
      "records[records.indexOf(record)] = structuredClone(record);"],
    ["componentCrossRealm", componentExport, componentCard,
      `record.components[${componentIndex}] = structuredClone(record.components[${componentIndex}]);`],
    ["rowAccessor", "createSwarmCatalog", "briar-band",
      "Object.defineProperty(record, \"damage\", { configurable: true, enumerable: true, get() { __bumpSourceProbeTrap(); throw new Error(\"row accessor\"); } });"],
    ["componentAccessor", componentExport, componentCard,
      `Object.defineProperty(record.components[${componentIndex}], \"damage\", { configurable: true, enumerable: true, get() { __bumpSourceProbeTrap(); throw new Error(\"component accessor\"); } });`],
    ["rowSymbolKey", "createSwarmCatalog", "briar-band",
      "record[Symbol(\"hostile-row\")] = 1;"],
    ["componentSymbolKey", componentExport, componentCard,
      `record.components[${componentIndex}][Symbol("hostile-component")] = 1;`],
  ];
  let structuralTraps = 0;
  for (const [label, exportName, id, mutation] of structuralCases) {
    const result = reject(label, exportName, id, mutation, {
      prefix: trapPrefix,
      reportTraps: true,
      skipCalls: 6,
    });
    assert.equal(result.traps, 0, `${label} invoked hostile callbacks`);
    structuralTraps += result.traps;
  }
  assert.equal(structuralTraps, 0);

  const wrapperCases = [
    ["rowStringWrapper", "records[records.indexOf(record)] = new String(record.id);"],
    ["rowNumberWrapper", "records[records.indexOf(record)] = new Number(record.cost);"],
    ["componentStringWrapper", `record.components[${componentIndex}] = new String(record.components[${componentIndex}].id);`],
    ["componentNumberWrapper", `record.components[${componentIndex}] = new Number(record.components[${componentIndex}].count);`],
  ];
  for (const [label, mutation] of wrapperCases) {
    const isComponent = label.startsWith("component");
    reject(
      label,
      isComponent ? componentExport : "createSwarmCatalog",
      isComponent ? componentCard : "briar-band",
      mutation,
    );
  }

  const proxyRow = reject(
    "rowProxyAllTraps",
    "createSwarmCatalog",
    "briar-band",
    `records[records.indexOf(record)] = new Proxy(record, ${proxyHandler});`,
    {
      prefix: trapPrefix,
      reportTraps: true,
      skipCalls: 6,
    },
  );
  const proxyComponent = reject(
    "componentProxyAllTraps",
    componentExport,
    componentCard,
    `record.components[${componentIndex}] = new Proxy(record.components[${componentIndex}], ${proxyHandler});`,
    {
      prefix: trapPrefix,
      reportTraps: true,
      skipCalls: 6,
    },
  );
  assert.equal(proxyRow.traps, 0,
    `row proxy invoked ${proxyRow.traps} hostile callbacks`);
  assert.equal(proxyComponent.traps, 0,
    `component proxy invoked ${proxyComponent.traps} hostile callbacks`);

  const proxyRoot = reject(
    "rootProxyAllTraps",
    "createSwarmCatalog",
    "briar-band",
    "void 0;",
    {
      prefix: trapPrefix,
      reportTraps: true,
      returnExpression: `return new Proxy(records, ${proxyHandler});`,
      skipCalls: 6,
    },
  );
  assert.equal(proxyRoot.traps, 0,
    `root proxy invoked ${proxyRoot.traps} hostile callbacks`);

  const unbrandedChild = reject(
    "unbrandedChildInBrandedRoot",
    componentExport,
    componentCard,
    `record.components[${componentIndex}] = structuredClone(record.components[${componentIndex}]);`,
    {
      prefix: trapPrefix,
      reportTraps: true,
      skipCalls: 6,
    },
  );
  assert.equal(unbrandedChild.traps, 0,
    `unbranded child invoked ${unbrandedChild.traps} hostile callbacks`);

  const partialFailure = runSourceWrapperProbe(sourceWrapperCase(
    "createSwarmCatalog",
    "briar-band",
    "record.cost += 1;",
    { probeExposure: true },
  ));
  assert.equal(partialFailure.accepted, false);
  assert.equal(partialFailure.exposed, false);
});

test("projectile profiles: every source binding is admitted before first-read hostile access", () => {
  const counterPrefix = [
    "let __sourceProbeCallbacks = 0;",
    "globalThis.__sourceProbeCallbacks = 0;",
    "const __bumpSourceProbeCallback = () => { __sourceProbeCallbacks += 1; globalThis.__sourceProbeCallbacks = __sourceProbeCallbacks; };",
    "let __sourceProbeTraps = 0;",
    "globalThis.__sourceProbeTraps = 0;",
    "const __bumpSourceProbeTrap = () => { __sourceProbeTraps += 1; globalThis.__sourceProbeTraps = __sourceProbeTraps; };",
  ].join("\n");
  const proxyHandler = `({
    ownKeys() { __bumpSourceProbeTrap(); throw new Error("proxy ownKeys"); },
    getOwnPropertyDescriptor() { __bumpSourceProbeTrap(); throw new Error("proxy descriptor"); },
    get() { __bumpSourceProbeTrap(); throw new Error("proxy get"); },
    getPrototypeOf() { __bumpSourceProbeTrap(); throw new Error("proxy prototype"); },
    preventExtensions() { __bumpSourceProbeTrap(); throw new Error("proxy preventExtensions"); },
  })`;
  const attacks = [
    [
      "first-read accessor",
      "Object.defineProperty(record, \"cost\", { configurable: true, enumerable: true, get() { __bumpSourceProbeCallback(); throw new Error(\"source accessor\"); } });",
    ],
    [
      "proxy",
      `records[records.indexOf(record)] = new Proxy(record, ${proxyHandler});`,
    ],
    [
      "hostile prototype",
      "Object.setPrototypeOf(record, { get cost() { __bumpSourceProbeCallback(); throw new Error(\"hostile prototype\"); } });",
    ],
  ];
  let probes = 0;
  for (const [exportName, id] of [
    ["createBasicRangedCatalog", "brassbolt"],
    ["createBasicFlyingCatalog", "copperskiff"],
    ["createSwarmCatalog", "briar-band"],
    ["createChainSpecialCatalog", "stormkite"],
    ["createPierceSpecialCatalog", "prism-warden"],
    ["createReturnSpecialCatalog", "rune-reaver"],
    ["createPelletSpecialCatalog", "scatterguard"],
    ["createReflectionSpecialCatalog", "aegis-sage"],
  ]) {
    for (const [label, mutation] of attacks) {
      for (const entry of SHARED_ADMISSION_ENTRY_POINTS) {
        const result = runSourceWrapperProbe({
          ...sourceWrapperCase(exportName, id, mutation, {
            expect: "reject",
            prefix: counterPrefix,
            probeExposure: true,
            reportCallbacks: true,
            reportTraps: true,
          }),
          entryArgs: entry.args,
          entryExport: entry.exportName,
          entryPath: entry.path,
        });
        assert.equal(result.accepted, false, `${entry.exportName}/${exportName}/${label} was accepted`);
        assert.equal(result.callbacks, 0,
          `${entry.exportName}/${exportName}/${label} invoked a source callback`);
        assert.equal(result.traps, 0,
          `${entry.exportName}/${exportName}/${label} invoked a Proxy trap`);
        assert.equal(result.exposed, false,
          `${entry.exportName}/${exportName}/${label} exposed a partial result`);
        probes += 1;
      }
    }
  }
  assert.equal(probes, 96);
});

test("projectile profiles: a normal admitted catalog remains usable by the shared runtime", () => {
  const catalog = createBasicRangedCatalog();
  const brassbolt = catalog.find(({ id }) => id === "brassbolt");
  assert.equal(brassbolt?.damage, 218);
  const battle = new LiveBattle(canonical(createSessionTroopWitness("brassbolt")));
  assert.equal(battle.scheduleDeploy(canonical({
    cardId: "brassbolt",
    point: { x: 3_500, y: 14_500 },
    sequence: 0,
    side: "south",
    tick: 0,
  })).type, "deploy-scheduled");
  battle.step();
  assert.equal(battle.state.units.filter(({ cardId }) => cardId === "brassbolt").length, 1);
  assert.equal(battle.replay.filter(({ type }) => type === "deployed").length, 1);
});

test("projectile profiles: every claimed source join is exact and profiles are one-per-ID", () => {
  const manifest = createSessionTroopProjectileProfileManifest();
  const claims = claimRows(manifest);
  assert.equal(claims.length, 5);
  assert.equal(new Set(manifest.profiles.map(({ id }) => id)).size, 5);
  assert.equal(new Set(manifest.occurrences.map(({ exportName, id }) =>
    `${exportName}\u0000${id}`)).size, 5);

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
  assert.throws(() => getSessionTroopProjectileProfile("briar-darter"), /QUESTION/u);
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

test("projectile profiles: ordinary delivery remains QUESTION and special geometry stays fixture-owned", () => {
  const manifest = createSessionTroopProjectileProfileManifest();
  assert.equal(claimRows(manifest).filter(({ claimFamily }) =>
    claimFamily === "ordinary-single-projectile").length, 0);
  for (const dependency of manifest.unresolvedDeliveryDependencies) {
    assert.equal(dependency.delivery.classification, "question");
    assert.equal(dependency.source.evidence.delivery, "not-sourced");
    assert.equal(dependency.questions.delivery.authoritative, false);
    assert.equal(dependency.questions.delivery.disposition, "question");
    assert.equal(dependency.questions.delivery.value, 2);
    assert.equal(Object.hasOwn(dependency.source.record, "projectileSpeed"), false);
    assert.equal(Object.hasOwn(dependency.source.record, "projectileTravelTicks"), false);
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

test("projectile profiles: generic basic-ranged launch evidence is test-only and cannot admit either card", () => {
  const sourceById = new Map(createBasicRangedCatalog().map((record) => [record.id, record]));
  const launches = [];
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
    launches.push(launch);
  }
  assert.deepEqual(
    launches.map(({ projectile }) => [
      Object.keys(projectile).sort(),
      projectile.origin,
      projectile.radius,
      projectile.speed,
      projectile.impactTick - projectile.launchTick,
    ]),
    launches.map(({ projectile }) => [
      Object.keys(projectile).sort(),
      { x: 0, y: 0 },
      0,
      1,
      0,
    ]),
  );
  const manifest = createSessionTroopProjectileProfileManifest();
  assert.deepEqual(manifest.unresolvedDeliveryDependencies
    .filter(({ id }) => ["brassbolt", "reedsting"].includes(id))
    .map(({ id, source, delivery }) => [id, source.evidence.sourceExports, delivery.classification]), [
      ["brassbolt", ["createBasicRangedCatalog"], "question"],
      ["reedsting", ["createBasicRangedCatalog"], "question"],
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
  assert.equal(serialized.length, 66903);
  assert.equal(createHash("sha256").update(serialized).digest("hex"),
    "d01b60123c2ac10a7cf8f3846a8c8fcd87eda22a65cb9166cb99d69f47fdb31d");
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
  assert.doesNotMatch(source, /BasicRangedDuel|createBasicRangedCombatant|createBasicFlyingCombatant/u);
  assert.doesNotMatch(source, /createBasicRangedCatalog[\s\S]{0,240}(?:Duel|Combatant)/u);
  const manifest = createSessionTroopProjectileProfileManifest();
  assert.ok(manifest.occurrences.length <= 64);
  assert.ok(manifest.excludedOccurrences.length <= 64);
  assert.ok(manifest.unresolvedDeliveryDependencies.length <= 16);
  const sourceCatalog = createBasicRangedCatalog();
  sourceCatalog[0].damage = 1;
  assert.throws(() => getSessionTroopProjectileProfile("brassbolt"), /QUESTION/u);
  assert.equal(manifest.unresolvedDeliveryDependencies.find(({ id }) => id === "brassbolt")
    .source.record.damage, 218);
  assert.equal(manifest.unresolvedDeliveryDependencies.find(({ id }) => id === "reedsting")
    .source.record.damage, createBasicRangedCatalog().find(({ id }) => id === "reedsting").damage);
  assert.equal(createSwarmCatalog().find(({ id }) => id === "briar-band")
    .components.find(({ id }) => id === "briar-darter").role, "secondary");
});
