import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as content from "../src/content/index.js";
import {
  auditShippingIsolation,
  formatShippingIsolationReport,
} from "./shipping-isolation-guard.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT_ROOT = join(ROOT, "src", "content");
const OCCURRENCE_ADAPTER = join(
  ROOT,
  "tests",
  "fixtures",
  "integration-occurrence-adapters.js",
);
const EXPECTED_OCCURRENCE_BINDINGS = JSON.parse(readFileSync(join(
  ROOT,
  "tests",
  "fixtures",
  "integration-occurrence-bindings.json",
), "utf8"));

const claims = [
  claim("createBasicFlyingCatalog", "cards/basic-flying.js", "cards-basic-flying", ["copperskiff", "skymaul"]),
  claim("createBasicMeleeCatalog", "cards/basic-melee.js", "cards-basic-melee", ["coilblade", "ironroot", "mossguard"]),
  claim("createBasicRangedCatalog", "cards/basic-ranged.js", "cards-basic-ranged", ["brassbolt", "reedsting"]),
  claim("createOrdinaryProjectileSplashCatalog", "cards/ordinary-projectile-splash.js", "game-roster-troops-ordinary", ["kilnkeeper"]),
  claim("createOrdinaryProjectileSquadCatalog", "cards/ordinary-projectile-squads.js", "game-roster-troops-ordinary", ["coppershade-flock", "duskwing-trio", "sunthread-pair"]),
  claim("createSwarmCatalog", "cards/swarms.js", "cards-swarms", ["briar-band", "cinder-host", "cinderlings", "forgeguard", "gloamwing-cluster", "thornscouts"]),
  claim("DEATH_SPAWN_IDENTITY", "cards/death-spawns.js", "death-spawns", ["ashen-nest"], "createDeathSpawnFixture"),
  claim("DEATH_CONVERSION_IDENTITY", "cards/death-conversion.js", "death-conversion", ["gloam-shepherd"], "createDeathConversionFixture"),
  claim("createStructureSeekerCatalog", "cards/structure-seeker.js", "cards-structure-seeker", ["stonehauler"]),
  claim("createShieldFormCatalog", "cards/shields-forms.js", "shields-forms", ["railward"]),
  claim("createChargeSpecialCatalog", "cards/special-movement-charge.js", "special-movement-charge", ["emberlance"]),
  claim("createDashSpecialCatalog", "cards/special-movement-dash.js", "special-movement-dash", ["veilrunner"]),
  claim("createJumpSpecialCatalog", "cards/special-movement-jump.js", "special-movement-jump", ["stonevault"]),
  claim("createRecoilSpecialCatalog", "cards/special-movement-recoil.js", "special-movement-recoil", ["cinderback"]),
  claim("createKnockbackSpecialCatalog", "cards/special-movement-knockback.js", "special-movement-knockback", ["squall-orb"]),
  claim("createRetargetSpecialCatalog", "cards/special-movement-retarget.js", "special-movement-retarget", ["wayfinder"]),
  claim("createChargeKnockbackCatalog", "cards/special-movement-charge-knockback.js", "special-movement-charge-knockback", ["emberlance"]),
  claim("createChainSpecialCatalog", "cards/special-projectiles-chain.js", "special-projectiles-chain", ["stormkite"]),
  claim("createPierceSpecialCatalog", "cards/special-projectiles-pierce.js", "special-projectiles-pierce", ["prism-warden"]),
  claim("createReturnSpecialCatalog", "cards/special-projectiles-return.js", "special-projectiles-return", ["rune-reaver"]),
  claim("createPelletSpecialCatalog", "cards/special-projectiles-pellets.js", "special-projectiles-pellets", ["scatterguard"]),
  claim("createReflectionSpecialCatalog", "cards/special-projectiles-reflection.js", "special-projectiles-reflection", ["aegis-sage"]),
  claim("createRampSpecialCatalog", "cards/special-combat-ramp.js", "combat-status-ramp", ["cinder-ray"]),
  claim("createResetSpecialCatalog", "cards/special-combat-reset.js", "combat-status-reset", ["static-burst"]),
  claim("createStunSpecialCatalog", "cards/combat-status-stun.js", "combat-status-stun", ["pulse-sentry"]),
  claim("createSlowSpecialCatalog", "cards/special-combat-slow.js", "combat-status-slow", ["rime-adept"]),
  claim("createRageSpecialCatalog", "cards/special-combat-rage.js", "combat-status-rage", ["tempo-field"]),
  claim("createSnareSpecialCatalog", "cards/special-combat-snare.js", "combat-status-snare", ["tether-rider"]),
  claim("createDeathEffectsCatalog", "cards/death-effects.js", "death-effects", ["cinder-reliquary"]),
  claim("createHealCatalog", "cards/combat-status-heal.js", "combat-status-heal", ["bloom-wisp", "dawnmender"]),
  claim("createInvisibilitySpecialCatalog", "cards/combat-status-invisibility.js", "combat-status-invisibility", ["veil-prowler"]),
  claim("createDefensiveBuildingCatalog", "cards/buildings-defensive.js", "buildings-defensive", ["bulwark-needle", "buried-coil", "ember-basin", "horizon-caster", "prism-furnace"]),
  claim("SPAWNER_BUILDING_IDENTITIES", "cards/buildings-spawner.js", "buildings-spawner", ["bramble-cage", "ember-roost"], "createSpawnerBuildingCorpusRecords"),
  claim("createResourceBuildingCatalog", "cards/buildings-resource.js", "buildings-resource", ["aether-well"]),
  claim("createUndergroundTravelBuildingCatalog", "cards/buildings-travel.js", "buildings-travel", ["burrow-rig"]),
  claim("createInstantSpellCatalog", "cards/spells-instant.js", "spells-instant", ["squall-orb"]),
  claim("SPAWN_SPELL_IDENTITIES", "cards/spells-spawn.js", "spells-spawn", ["cloudseed-flask", "hollowgarden"], "createSpawnSpellFixture"),
  claim("createPeriodicSpellCatalog", "cards/spells-periodic.js", "spells-periodic", ["blight-ring", "fault-pulse", "gravity-well"]),
  claim("createTravelingLineSpellCatalog", "cards/spells-travel-line.js", "spells-travel-line", ["squall-orb"]),
  claim("createReturningSpellCatalog", "cards/spells-return.js", "spells-return", ["squall-orb"]),
  claim("createThreeWaveTravelingSpellCatalog", "cards/spells-three-wave.js", "spells-three-wave", ["skyshard-volley"]),
  claim("createRollingSpellCatalog", "cards/spells-roll.js", "spells-roll", ["ironbark-roller"]),
  claim("createChampionAbilityCatalog", "cards/champion-abilities.js", "champions", ["aegis-sage", "bone-regent", "dusk-ranger", "gilded-lancer", "iron-borer"]),
];

const questionOnly = [
  question("SpawnBatchMaterializer", "cards/spawn-placement.js", "spawn-placement", "shared placement primitive has no exported runtime card identity"),
  question("DashKnockbackRetargetEncounter", "cards/special-movement-dash-knockback.js", "special-movement-dash-knockback", "composition policies are corpus-absent QUESTION records"),
  question("LeapKnockbackRetargetEncounter", "cards/special-movement-leap-knockback.js", "special-movement-leap-knockback", "composition policies are corpus-absent QUESTION records"),
  question("PreviousCardCopyMatch", "cards/spells-copy-card.js", "spells-copy-card", "copy card identity and mechanics are intentionally unclaimed"),
  question("DeployedUnitCloneEncounter", "cards/spells-clone-unit.js", "spells-clone-unit", "clone card identity and mechanics are intentionally unclaimed"),
];

const allowedSharedIds = new Map([
  ["aegis-sage", ["createChampionAbilityCatalog", "createReflectionSpecialCatalog"]],
  ["emberlance", ["createChargeKnockbackCatalog", "createChargeSpecialCatalog"]],
  ["squall-orb", [
    "createInstantSpellCatalog",
    "createKnockbackSpecialCatalog",
    "createReturningSpellCatalog",
    "createTravelingLineSpellCatalog",
  ]],
]);

function claim(exportName, module, selector, ids, evidenceFunction = exportName) {
  return { evidenceFunction, exportName, ids, module, selector };
}

function question(exportName, module, selector, reason) {
  return { exportName, module, reason, selector };
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function listFiles(directory) {
  const result = [];
  for (const entry of readdirSync(directory).sort()) {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) result.push(...listFiles(absolute));
    else result.push(absolute);
  }
  return result;
}

function exportedIds(entry) {
  return exportedRecords(entry).map((record) => record?.id);
}

function exportedRecords(entry) {
  const value = content[entry.exportName];
  let records;
  if (typeof value === "function") records = value();
  else if (Array.isArray(value)) records = value;
  else if (value && typeof value === "object" && typeof value.id === "string") records = [value];
  else if (value && typeof value === "object") records = Object.values(value);
  else throw new Error(`${entry.exportName} is not a catalog or identity export`);
  return records;
}

function validateCatalogSurface() {
  const errors = [];
  const discovered = Object.keys(content).filter((name) =>
    (name !== "createCardCatalog" && /^create.*Catalog$/.test(name)) ||
    /IDENTIT(?:Y|IES)$/.test(name)
  ).sort();
  const declared = claims.map(({ exportName }) => exportName).sort();
  if (canonical(discovered) !== canonical(declared)) {
    errors.push(`stale catalog export registry: discovered=${canonical(discovered)} declared=${canonical(declared)}`);
  }

  const occurrences = [];
  for (const entry of claims) {
    const actual = exportedIds(entry);
    if (actual.some((id) => typeof id !== "string" || id.length === 0)) {
      errors.push(`${entry.exportName} emitted a missing/non-string catalog ID`);
    }
    if (new Set(actual).size !== actual.length) {
      errors.push(`${entry.exportName} emitted duplicate catalog IDs: ${canonical(actual)}`);
    }
    if (canonical(actual) !== canonical(entry.ids)) {
      errors.push(`${entry.exportName} catalog IDs are stale: expected=${canonical(entry.ids)} actual=${canonical(actual)}`);
    }
    for (const id of actual) occurrences.push({ exportName: entry.exportName, id });
  }

  const byId = new Map();
  for (const occurrence of occurrences) {
    if (!byId.has(occurrence.id)) byId.set(occurrence.id, []);
    byId.get(occurrence.id).push(occurrence.exportName);
  }
  for (const [id, exports] of byId) {
    if (exports.length < 2) continue;
    const expected = allowedSharedIds.get(id);
    const actual = exports.sort();
    if (!expected || canonical(actual) !== canonical(expected)) {
      errors.push(`unexpected duplicate catalog ID ${id}: ${canonical(actual)}`);
    }
  }
  for (const [id, expected] of allowedSharedIds) {
    if (canonical(byId.get(id)?.sort() ?? []) !== canonical(expected)) {
      errors.push(`stale shared-card classification ${id}`);
    }
  }
  return { errors, occurrences };
}

function validateQuestionSurface() {
  const errors = [];
  for (const entry of questionOnly) {
    if (!(entry.exportName in content)) {
      errors.push(`missing QUESTION-only export ${entry.exportName}`);
    }
  }
  return errors;
}

function validateShippingIsolation() {
  const errors = [];
  const sources = listFiles(CONTENT_ROOT).filter((file) => file.endsWith(".js"));
  const benchmark = JSON.parse(readFileSync(join(ROOT, "reference", "stats", "cards.json"), "utf8"));
  const protectedStrings = new Set(benchmark.cards.flatMap(({ key, name }) => [key, name]));
  for (const file of sources) {
    const source = readFileSync(file, "utf8");
    if (/(?:from\s*|import\s*\()\s*["'][^"']*reference(?:\/|["'])/.test(source)) {
      errors.push(`${relative(ROOT, file)} imports reference data`);
    }
    for (const identity of protectedStrings) {
      const quoted = [`"${identity}"`, `'${identity}'`, `\`${identity}\``];
      if (quoted.some((token) => source.includes(token))) {
        errors.push(`${relative(ROOT, file)} embeds protected shipped identity ${JSON.stringify(identity)}`);
      }
    }
  }
  return errors;
}

export function parseStrictTapForAudit(value, selector = "runner") {
  const maximumOutputBytes = 16 * 1024 * 1024;
  const maximumLineBytes = 64 * 1024;
  const maximumLines = 100_000;
  if (typeof value !== "string") {
    throw new TypeError(`${selector} TAP output must be a string`);
  }
  if (Buffer.byteLength(value) > maximumOutputBytes) {
    throw new RangeError(`${selector} exceeded bounded TAP output`);
  }
  const text = value.replace(/\r\n/gu, "\n");
  if (/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u.test(text)) {
    throw new Error(`${selector} TAP contained a control character`);
  }
  const lines = text.split("\n");
  if (lines.length > maximumLines) {
    throw new RangeError(`${selector} exceeded bounded TAP line count`);
  }
  for (const line of lines) {
    if (Buffer.byteLength(line) > maximumLineBytes) {
      throw new RangeError(`${selector} exceeded bounded TAP line length`);
    }
  }
  if (lines[0] !== "TAP version 13") {
    throw new Error(`${selector} did not begin with TAP version 13`);
  }

  let index = 1;
  const reservedDiagnostic = /^(?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)(?:\s|$)/u;
  const boundedNumber = (digits, label) => {
    const number = Number(digits);
    if (!Number.isSafeInteger(number) || number > maximumLines) {
      throw new RangeError(`${selector} TAP ${label} exceeded its bound`);
    }
    return number;
  };
  const ordinaryDiagnostic = (body) =>
    body.startsWith("# ") &&
    !body.startsWith("# Subtest: ") &&
    !reservedDiagnostic.test(body.slice(2));

  const parseYaml = (indent) => {
    const opening = `${indent}  ---`;
    if (lines[index] !== opening) return;
    index += 1;
    let fields = 0;
    while (index < lines.length && lines[index] !== `${indent}  ...`) {
      if (!lines[index].startsWith(`${indent}  `)) {
        throw new Error(`${selector} TAP contained malformed YAML indentation`);
      }
      fields += 1;
      index += 1;
    }
    if (fields === 0 || lines[index] !== `${indent}  ...`) {
      throw new Error(`${selector} TAP contained an incomplete YAML block`);
    }
    index += 1;
  };

  const parseSuite = (indent, depth) => {
    if (depth > 64) {
      throw new RangeError(`${selector} TAP nesting exceeded its bound`);
    }
    const numbers = [];
    while (index < lines.length) {
      const line = lines[index];
      if (!line.startsWith(indent)) {
        throw new Error(`${selector} TAP nested suite omitted its plan`);
      }
      const body = line.slice(indent.length);
      if (body.startsWith(" ")) {
        throw new Error(`${selector} TAP contained malformed indentation`);
      }
      const plan = /^1\.\.([1-9]\d*)$/u.exec(body);
      if (plan) {
        const planned = boundedNumber(plan[1], "plan");
        const expected = Array.from(
          { length: planned },
          (_, number) => number + 1,
        );
        if (canonical(numbers) !== canonical(expected)) {
          throw new Error(
            `${selector} TAP test numbering did not match its plan: ` +
            `plan=${planned} ok=${canonical(numbers)}`,
          );
        }
        index += 1;
        return planned;
      }
      if (/^Bail out!(?:\s|$)/u.test(body)) {
        throw new Error(`${selector} TAP contained a bailout`);
      }
      if (/^not ok(?:\s|$)/u.test(body)) {
        throw new Error(`${selector} TAP contained a failed test`);
      }
      const subtest = /^# Subtest: (.+)$/u.exec(body);
      if (!subtest) {
        if (ordinaryDiagnostic(body)) {
          index += 1;
          continue;
        }
        throw new Error(
          `${selector} TAP contained unrecognized output at line ${index + 1}`,
        );
      }

      const name = subtest[1];
      index += 1;
      if (lines[index]?.startsWith(`${indent}    `)) {
        parseSuite(`${indent}    `, depth + 1);
      }
      while (ordinaryDiagnostic(
        lines[index]?.startsWith(indent)
          ? lines[index].slice(indent.length)
          : "",
      )) index += 1;

      const resultLine = lines[index] ?? "";
      if (!resultLine.startsWith(indent)) {
        throw new Error(`${selector} TAP subtest omitted its parent result`);
      }
      const resultBody = resultLine.slice(indent.length);
      if (/^not ok(?:\s|$)/u.test(resultBody)) {
        throw new Error(`${selector} TAP contained a failed test`);
      }
      const result = /^ok ([1-9]\d*) - (.+)$/u.exec(resultBody);
      if (!result || result[2] !== name) {
        throw new Error(`${selector} TAP subtest result did not match its name`);
      }
      numbers.push(boundedNumber(result[1], "test number"));
      index += 1;
      parseYaml(indent);
    }
    throw new Error(`${selector} omitted its TAP plan`);
  };

  const planned = parseSuite("", 0);

  const summaryKeys = [
    "tests",
    "suites",
    "pass",
    "fail",
    "cancelled",
    "skipped",
    "todo",
  ];
  const summary = new Map();
  for (const key of summaryKeys) {
    const match = new RegExp(
      `^# ${key} (0|[1-9]\\d*)$`,
      "u",
    ).exec(lines[index] ?? "");
    if (!match) {
      throw new Error(`${selector} omitted or reordered TAP ${key} summary`);
    }
    const count = Number(match[1]);
    if (!Number.isSafeInteger(count) || count > maximumLines) {
      throw new RangeError(`${selector} TAP ${key} summary exceeded its bound`);
    }
    summary.set(key, count);
    index += 1;
  }
  if (!/^# duration_ms (?:0|[1-9]\d*)(?:\.\d+)?$/u.test(lines[index] ?? "")) {
    throw new Error(`${selector} omitted or malformed TAP duration summary`);
  }
  index += 1;
  if (index === lines.length - 1 && lines[index] === "") index += 1;
  if (index !== lines.length) {
    throw new Error(`${selector} TAP contained trailing top-level output`);
  }

  if (
    summary.get("tests") !== planned ||
    summary.get("suites") !== 0 ||
    summary.get("pass") !== planned ||
    ["fail", "cancelled", "skipped", "todo"].some((key) =>
      summary.get(key) !== 0
    )
  ) {
    throw new Error(
      `${selector} TAP was not a complete clean pass: ` +
      `plan=${planned} ok=${canonical(okNumbers)} ` +
      `summary=${canonical(Object.fromEntries(summary))}`,
    );
  }
  return { pass: planned, tests: planned };
}

function readCoverage(directory) {
  const modules = new Map();
  for (const file of listFiles(directory).filter((name) => name.endsWith(".json"))) {
    const document = JSON.parse(readFileSync(file, "utf8"));
    for (const script of document.result ?? []) {
      if (!script.url.startsWith("file:")) continue;
      const pathname = fileURLToPath(script.url);
      if (!pathname.startsWith(CONTENT_ROOT)) continue;
      if (!modules.has(pathname)) modules.set(pathname, new Map());
      const functions = modules.get(pathname);
      for (const fn of script.functions) {
        const count = Math.max(...fn.ranges.map((range) => range.count));
        functions.set(fn.functionName, (functions.get(fn.functionName) ?? 0) + count);
      }
    }
  }
  return modules;
}

function executeRunner(selector, entries, questions) {
  const coverageDirectory = mkdtempSync(join(tmpdir(), `integration-audit-${selector}-`));
  try {
    const testFile = join(ROOT, "tests", `${selector}.test.js`);
    const childEnvironment = {
      ...process.env,
      NODE_V8_COVERAGE: coverageDirectory,
    };
    // A nested `node --test` must not inherit the parent test worker marker or
    // Node treats the runner as the already-active worker and skips its file.
    delete childEnvironment.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [
      "--test",
      testFile,
    ], {
      cwd: ROOT,
      encoding: "utf8",
      env: childEnvironment,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 180_000,
    });
    if (result.error) throw result.error;
    const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (result.status !== 0) {
      throw new Error(`${selector} failed with status ${result.status}\n${combined.slice(-8_000)}`);
    }
    if (Buffer.byteLength(combined) > 16 * 1024 * 1024) {
      throw new Error(`${selector} exceeded bounded output`);
    }
    const tap = parseStrictTapForAudit(combined, selector);
    const coverage = readCoverage(coverageDirectory);
    for (const entry of entries) {
      const modulePath = join(CONTENT_ROOT, entry.module);
      const functions = coverage.get(modulePath);
      if (!functions || (functions.get(entry.evidenceFunction) ?? 0) < 1) {
        throw new Error(`${selector} never executed ${entry.evidenceFunction} in ${entry.module}`);
      }
    }
    for (const entry of questions) {
      const modulePath = join(CONTENT_ROOT, entry.module);
      const functions = coverage.get(modulePath);
      const executedNamed = functions
        ? [...functions].filter(([name, count]) => name.length > 0 && count > 0)
        : [];
      if (executedNamed.length === 0) {
        throw new Error(`${selector} never executed claimed QUESTION-only module ${entry.module}`);
      }
      const testSource = readFileSync(join(ROOT, "tests", `${selector}.test.js`), "utf8");
      if (!testSource.includes(entry.exportName)) {
        throw new Error(`${selector} never names claimed QUESTION-only export ${entry.exportName}`);
      }
    }
    return {
      selector,
      tap,
    };
  } finally {
    rmSync(coverageDirectory, { force: true, recursive: true });
  }
}

function executeOccurrenceAdapters() {
  const specifications = claims
    .flatMap(({ exportName, ids, selector }) =>
      ids.map((id) => ({ exportName, id, selector }))
    );
  const result = spawnSync(process.execPath, [OCCURRENCE_ADAPTER], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      INTEGRATION_AUDIT_OCCURRENCES: canonical(specifications),
    },
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `occurrence adapters failed with status ${result.status}\n` +
      `${result.stderr ?? ""}`.slice(-8_000),
    );
  }
  let document;
  try {
    document = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`occurrence adapters emitted invalid JSON: ${error.message}`);
  }
  if (document.version !== 3 || !Array.isArray(document.artifacts)) {
    throw new Error("occurrence adapters emitted an unsupported document");
  }
  return document.artifacts;
}

export function probeDirectOccurrenceAdapters() {
  const surface = validateCatalogSurface();
  if (surface.errors.length > 0) throw new Error(surface.errors.join("\n"));
  const artifacts = executeOccurrenceAdapters();
  validateOccurrenceArtifacts(artifacts, surface.occurrences);
  return artifacts;
}

export function validateOccurrenceArtifacts(artifacts, occurrences) {
  const expected = [...occurrences].sort((left, right) =>
    left.id.localeCompare(right.id) ||
    left.exportName.localeCompare(right.exportName)
  );
  if (!Array.isArray(artifacts) || artifacts.length !== expected.length) {
    throw new Error("occurrence adapter count does not match supported surface");
  }
  const byteFields = ["stateBytes", "eventBytes", "replayBytes"];
  const byteSets = Object.fromEntries(byteFields.map((field) => [
    field,
    new Set(),
  ]));
  const bindings = new Set();
  const exactKeys = (value, keys) =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
  const meaningful = (value) =>
    value !== null &&
    value !== undefined &&
    (typeof value !== "object" || Object.keys(value).length > 0);
  for (let index = 0; index < expected.length; index += 1) {
    const artifact = artifacts[index];
    const occurrence = expected[index];
    if (
      artifact?.id !== occurrence.id ||
      artifact?.exportName !== occurrence.exportName ||
      typeof artifact.selector !== "string"
    ) {
      throw new Error(`occurrence adapter ${index} is stale or unsorted`);
    }
    if (
      typeof artifact.bindingSha256 !== "string" ||
      !/^[\da-f]{64}$/u.test(artifact.bindingSha256) ||
      bindings.has(artifact.bindingSha256)
    ) {
      throw new Error(`${occurrence.exportName}/${occurrence.id} reused a binding`);
    }
    bindings.add(artifact.bindingSha256);
    const parsedFields = {};
    for (const field of byteFields) {
      const bytes = artifact[field];
      if (typeof bytes !== "string" || bytes.length === 0) {
        throw new Error(`${occurrence.exportName}/${occurrence.id} omitted ${field}`);
      }
      let parsed;
      try {
        parsed = JSON.parse(bytes);
      } catch {
        throw new Error(`${occurrence.exportName}/${occurrence.id} invalid ${field}`);
      }
      if (canonical(parsed) !== bytes) {
        throw new Error(
          `${occurrence.exportName}/${occurrence.id} noncanonical ${field}`,
        );
      }
      const payloadKey = field === "stateBytes"
        ? "state"
        : field === "eventBytes"
        ? "emitted"
        : "replay";
      if (
        !exactKeys(parsed, ["exportCall", "mechanic"]) ||
        !exactKeys(parsed.exportCall, ["exportName", "result"]) ||
        parsed.exportCall.exportName !== occurrence.exportName ||
        parsed.exportCall.result?.id !== occurrence.id ||
        !exactKeys(parsed.mechanic, ["facade", payloadKey]) ||
        typeof parsed.mechanic.facade !== "string" ||
        parsed.mechanic.facade.length === 0 ||
        !meaningful(parsed.mechanic[payloadKey])
      ) {
        throw new Error(
          `${occurrence.exportName}/${occurrence.id} ${field} has no direct binding`,
        );
      }
      if (byteSets[field].has(bytes)) {
        throw new Error(`${occurrence.exportName}/${occurrence.id} reused ${field}`);
      }
      byteSets[field].add(bytes);
      parsedFields[field] = parsed;
    }
    const facades = byteFields.map((field) =>
      parsedFields[field].mechanic.facade
    );
    if (new Set(facades).size !== 1) {
      throw new Error(
        `${occurrence.exportName}/${occurrence.id} changed mechanic facade`,
      );
    }
    const calculatedBinding = sha256(canonical(Object.fromEntries(
      byteFields.map((field) => [field, artifact[field]]),
    )));
    const bindingKey = `${occurrence.exportName}\0${occurrence.id}`;
    if (
      artifact.bindingSha256 !== calculatedBinding ||
      EXPECTED_OCCURRENCE_BINDINGS[bindingKey] !== calculatedBinding
    ) {
      throw new Error(
        `${occurrence.exportName}/${occurrence.id} mechanic binding mismatch`,
      );
    }
  }
  if (Object.keys(EXPECTED_OCCURRENCE_BINDINGS).length !== expected.length) {
    throw new Error("pinned occurrence binding count is stale");
  }
  return true;
}

function executeOnce(surface) {
  const selectors = [...new Set([
    ...claims.map(({ selector }) => selector),
    ...questionOnly.map(({ selector }) => selector),
  ])].sort();
  const runners = selectors.map((selector) => executeRunner(
    selector,
    claims.filter((entry) => entry.selector === selector),
    questionOnly.filter((entry) => entry.selector === selector),
  ));
  const occurrenceArtifacts = executeOccurrenceAdapters();
  validateOccurrenceArtifacts(occurrenceArtifacts, surface.occurrences);
  const supportedArtifacts = occurrenceArtifacts.map((occurrence) => ({
    ...occurrence,
    eventSha256: sha256(occurrence.eventBytes),
    module: claims.find(({ exportName }) =>
      exportName === occurrence.exportName
    ).module,
    replaySha256: sha256(occurrence.replayBytes),
    stateSha256: sha256(occurrence.stateBytes),
  }));
  return {
    artifactVersion: 3,
    coveredOccurrences: surface.occurrences.length,
    questionOnly: questionOnly
      .map(({ exportName, module, reason, selector }) => ({
        exportName,
        module,
        reason,
        selector,
      }))
      .sort((left, right) =>
        left.selector.localeCompare(right.selector) ||
        left.exportName.localeCompare(right.exportName)
      ),
    runners,
    sharedCardArchetypes: Object.fromEntries([...allowedSharedIds]),
    supported: [...surface.occurrences].sort((left, right) =>
      left.id.localeCompare(right.id) ||
      left.exportName.localeCompare(right.exportName)
    ),
    supportedArtifacts,
    uniqueSupportedIds: new Set(surface.occurrences.map(({ id }) => id)).size,
  };
}

export function auditCanonicalIntegration({ runs = 2 } = {}) {
  if (!Number.isSafeInteger(runs) || runs < 2 || runs > 4) {
    throw new TypeError("integration audit runs must be an integer from 2 through 4");
  }
  const surface = validateCatalogSurface();
  const errors = [
    ...surface.errors,
    ...validateQuestionSurface(),
    ...validateShippingIsolation(),
  ];
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const isolation = auditShippingIsolation({
    entries: ["./src/content/index.js"],
    root: ROOT,
  });
  if (!isolation.ok) {
    throw new Error(
      `GUARD-002 shipping API rejected runtime surface:\n` +
      formatShippingIsolationReport(isolation),
    );
  }

  const manifests = [];
  const bytes = [];
  for (let run = 0; run < runs; run += 1) {
    const manifest = executeOnce(surface);
    const serialized = `${canonical(manifest)}\n`;
    manifests.push(manifest);
    bytes.push(serialized);
  }
  for (let run = 1; run < bytes.length; run += 1) {
    if (bytes[run] !== bytes[0]) {
      throw new Error(
        `noncanonical replay artifact: run 1=${sha256(bytes[0])} run ${run + 1}=${sha256(bytes[run])}`,
      );
    }
  }
  return {
    covered: surface.occurrences.length,
    manifest: manifests[0],
    manifestBytes: bytes[0],
    manifestSha256: sha256(bytes[0]),
    question: questionOnly.length,
    runHashes: bytes.map(sha256),
    supported: surface.occurrences.length,
    uniqueSupportedIds: manifests[0].uniqueSupportedIds,
    shippingIsolationSha256: sha256(formatShippingIsolationReport(isolation)),
  };
}

export function atomicWriteIntegrationManifest(pathname, bytes) {
  const absolute = resolve(pathname);
  const temporary = `${absolute}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, bytes, { encoding: "utf8", flag: "wx" });
    renameSync(temporary, absolute);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function parseCli(argv) {
  let runs = 2;
  let output = null;
  for (const argument of argv) {
    if (argument.startsWith("--runs=")) runs = Number(argument.slice(7));
    else if (argument.startsWith("--output=")) output = argument.slice(9);
    else throw new TypeError(`unknown integration audit argument: ${argument}`);
  }
  return { output, runs };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const options = parseCli(process.argv.slice(2));
  const result = auditCanonicalIntegration({ runs: options.runs });
  if (options.output) {
    atomicWriteIntegrationManifest(options.output, result.manifestBytes);
  }
  process.stdout.write(`${canonical({
    covered: result.covered,
    manifestSha256: result.manifestSha256,
    question: result.question,
    runHashes: result.runHashes,
    supported: result.supported,
    uniqueSupportedIds: result.uniqueSupportedIds,
    shippingIsolationSha256: result.shippingIsolationSha256,
  })}\n`);
}
